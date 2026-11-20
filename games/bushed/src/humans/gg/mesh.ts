// Turns body segments into one rigidly-skinned BufferGeometry with a packed texture atlas layout.
// Every prism face gets its own texel rectangle with an exact planar mapping (square texels, no affine warp);
// the head's front faces and the nose front share one 'face block' so the face is painted as a single image.
// Painters receive, per texel, the rest-pose surface point, so patterns run continuously across faces.
import * as THREE from 'three';
import { BONE_INDEX } from './body';
import type { Seg, Sec, V3, MeshFace, FaceBlock, Plan } from './types';

export const ATLAS = 256;
const FACE_DENS = 430; // px per metre on the face block
const PAD = 1;

function ring(y: number, r: Sec, ch: number): V3[] {
  const [cx, cz, hx, hz] = r;
  const c = ch * Math.min(hx, hz);
  if (c < 1e-5) return [[cx + hx, y, cz + hz], [cx - hx, y, cz + hz], [cx - hx, y, cz - hz], [cx + hx, y, cz - hz]];
  return [[cx + hx, y, cz + hz - c], [cx + hx - c, y, cz + hz], [cx - hx + c, y, cz + hz], [cx - hx, y, cz + hz - c],
    [cx - hx, y, cz - hz + c], [cx - hx + c, y, cz - hz], [cx + hx - c, y, cz - hz], [cx + hx, y, cz - hz + c]];
}

const sub = (a: V3 | number[], b: V3 | number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3 | number[], b: V3 | number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3 | number[]): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Faces of one segment (rest pose) with their outward normal and an in-plane basis (U right, V up). */
function segFaces(s: Seg): MeshFace[] {
  const B = ring(s.y0, s.b, s.ch), T = ring(s.y1, s.t, s.ch);
  if (s.rot) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(s.rot.e[0], s.rot.e[1], s.rot.e[2], 'XYZ'));
    const v = new THREE.Vector3();
    for (const p of [...B, ...T]) {
      v.set(p[0] - s.rot.p[0], p[1] - s.rot.p[1], p[2] - s.rot.p[2]).applyMatrix4(m);
      p[0] = v.x + s.rot.p[0]; p[1] = v.y + s.rot.p[1]; p[2] = v.z + s.rot.p[2];
    }
  }
  const c: V3 = [0, 0, 0];
  for (const p of [...B, ...T]) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= B.length * 2; c[1] /= B.length * 2; c[2] /= B.length * 2;
  const avg = (R: V3[]) => R.reduce((a: number[], p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((x) => x / R.length);
  const up: V3 = s.rot ? norm(sub(avg(T), avg(B))) : [0, 1, 0];
  const out: MeshFace[] = [];
  const n = B.length;
  const face = (o: Pick<MeshFace, 'kind' | 'pts' | 'N' | 'tris'>): MeshFace => ({ seg: s, ...o, U: [0, 0, 0], V: [0, 0, 0], o: o.pts[0], s0: 0, s1: 0, r0: 0, r1: 0, dens: 0, rect: { w: 0, h: 0, x: 0, y: 0 } });
  for (let i = 0; i < n; i++) {
    const a = B[i], b = B[(i + 1) % n], tb = T[(i + 1) % n], ta = T[i];
    let N = norm(cross(sub(b, a), sub(ta, a)));
    const mid: V3 = [(a[0] + b[0] + ta[0] + tb[0]) / 4, (a[1] + b[1] + ta[1] + tb[1]) / 4, (a[2] + b[2] + ta[2] + tb[2]) / 4];
    let pts = [a, b, tb, ta];
    // outward = away from the segment axis
    const rel = sub(mid, c); const ax = dot(rel, up); const radial = [rel[0] - up[0] * ax, rel[1] - up[1] * ax, rel[2] - up[2] * ax];
    if (dot(N, radial) < 0) { N = [-N[0], -N[1], -N[2]]; pts = [b, a, ta, tb]; }
    if (Math.hypot(...sub(a, b)) < 1e-6 && Math.hypot(...sub(ta, tb)) < 1e-6) continue;
    out.push(face({ kind: 'side', pts, N, tris: [0, 1, 2, 0, 2, 3] }));
  }
  const cap = (P: V3[], top: boolean) => {
    const N: V3 = top ? up : [-up[0], -up[1], -up[2]];
    const pts = top ? [...P] : [...P].reverse();
    // fan, checking winding against N
    const t: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) t.push(0, i, i + 1);
    const w = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    if (dot(w, N) < 0) for (let i = 0; i < t.length; i += 3) [t[i + 1], t[i + 2]] = [t[i + 2], t[i + 1]];
    out.push(face({ kind: top ? 'top' : 'bot', pts, N, tris: t }));
  };
  if (s.caps === 'both' || s.caps === 'top') cap(T, true);
  if (s.caps === 'both' || s.caps === 'bot') cap(B, false);
  for (const f of out) {
    // in-plane basis: V towards 'up' (for caps: towards -z / back), U = V x N... (right as seen from outside)
    let V: V3;
    if (f.kind === 'side') { V = sub(f.pts[3], f.pts[0]); const k = dot(V, f.N); V = norm([V[0] - f.N[0] * k, V[1] - f.N[1] * k, V[2] - f.N[2] * k]); }
    else V = f.kind === 'top' ? [0, 0, -1] : [0, 0, 1];
    if (f.kind !== 'side' && s.rot) { const k = dot(V, f.N); V = norm([V[0] - f.N[0] * k, V[1] - f.N[1] * k, V[2] - f.N[2] * k]); }
    f.V = V; f.U = norm(cross(V, f.N));
    f.o = f.pts[0];
    let s0 = Infinity, s1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const p of f.pts) { const d = sub(p, f.o); const u = dot(d, f.U), v = dot(d, f.V); s0 = Math.min(s0, u); s1 = Math.max(s1, u); r0 = Math.min(r0, v); r1 = Math.max(r1, v); }
    f.s0 = s0; f.s1 = s1; f.r0 = r0; f.r1 = r1;
  }
  return out;
}

/** Skyline bottom-left packing of rectangles ({w, h}) into ATLAS x ATLAS; returns false on overflow. */
function pack(rects: { w: number; h: number; x?: number; y?: number }[]): boolean {
  const sky = new Int16Array(ATLAS);
  const order = [...rects].sort((a, b) => b.h - a.h || b.w - a.w);
  for (const r of order) {
    if (r.w > ATLAS) return false;
    let bx = -1, by = 1e9;
    // candidate x: where the skyline steps (left-aligned) and where a step ends (right-aligned)
    for (let x = 0; x + r.w <= ATLAS; x++) {
      const left = x === 0 || sky[x] !== sky[x - 1];
      const right = x + r.w === ATLAS || sky[x + r.w] !== sky[x + r.w - 1];
      if (!left && !right) continue;
      let y = 0;
      for (let i = x; i < x + r.w; i++) if (sky[i] > y) { y = sky[i]; if (y >= by) break; }
      if (y < by) { by = y; bx = x; }
    }
    if (by + r.h > ATLAS) return false;
    r.x = bx; r.y = by;
    for (let i = bx; i < bx + r.w; i++) sky[i] = by + r.h;
  }
  return true;
}

/**
 * Build the skinned geometry. Returns { geometry, faces, block } where faces carry their atlas rect and
 * basis so painters can walk texels, and block describes the face image ({ x, y, w, h, x0, y1, dens }).
 */
export function buildMesh(plan: Plan): { geometry: THREE.BufferGeometry; faces: MeshFace[]; block: FaceBlock; tris: number } {
  const { P } = plan;
  const faces: MeshFace[] = [];
  for (const s of plan.segs) for (const f of segFaces(s)) faces.push(f);
  // face block: everything front-facing on segments marked block:'face', planar-projected on x / y
  const fd = Math.round(P.hw * 2 * FACE_DENS) | 1; // odd width -> centre column
  const dens = fd / (P.hw * 2);
  const block: FaceBlock = { x: 0, y: 0, rect: { w: 0, h: 0, x: 0, y: 0 }, w: fd, h: Math.ceil((P.crown - P.chin) * dens) + 1, x0: -P.hw, y1: P.crown, dens };
  const loose: MeshFace[] = [];
  for (const f of faces) {
    if (f.seg.block === 'face' && f.kind !== 'bot' && f.N[2] > 0.45) { f.block = true; continue; }
    loose.push(f);
  }
  const blockRect = { w: block.w + PAD * 2, h: block.h + PAD * 2, x: 0, y: 0 };
  const sizeAt = (f: MeshFace, scale: number) => {
    f.dens = 330 * scale * (f.seg.dens || 1) * (f.seg.mat === 'head' || f.seg.mat === 'ear' ? 1.2 : 1) * (f.kind === 'side' ? 1 : 0.7);
    f.rect = { x: 0, y: 0, w: Math.max(1, Math.ceil((f.s1 - f.s0) * f.dens - 0.01)) + PAD * 2, h: Math.max(1, Math.ceil((f.r1 - f.r0) * f.dens - 0.01)) + PAD * 2 };
  };
  // first guess from the area budget, then shrink until everything packs
  let area = 0;
  for (const f of loose) { sizeAt(f, 1); area += f.rect.w * f.rect.h; }
  let scale = Math.min(1.2, Math.sqrt((ATLAS * ATLAS * 0.86 - blockRect.w * blockRect.h) / area));
  for (let tries = 0; tries < 60; tries++) {
    const rects = [blockRect];
    for (const f of loose) { sizeAt(f, scale); rects.push(f.rect); }
    if (pack(rects)) break;
    scale *= 0.975;
  }
  block.x = blockRect.x + PAD; block.y = blockRect.y + PAD;
  block.rect = blockRect;
  // geometry
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const emit = (f: MeshFace, mirror: boolean) => {
    const base = pos.length / 3;
    const bone = BONE_INDEX[mirror ? f.seg.bone.replace(/L$/, 'R') : f.seg.bone];
    for (const p of f.pts) {
      let U: number, Vv: number;
      if (f.block) { U = block.x + (p[0] - block.x0) * block.dens; Vv = block.y + (block.y1 - p[1]) * block.dens; }
      else { const d = sub(p, f.o); U = f.rect.x + PAD + (dot(d, f.U) - f.s0) * f.dens; Vv = f.rect.y + PAD + (f.r1 - dot(d, f.V)) * f.dens; }
      pos.push(mirror ? -p[0] : p[0], p[1], p[2]);
      nrm.push(mirror ? -f.N[0] : f.N[0], f.N[1], f.N[2]);
      uv.push(U / ATLAS, 1 - Vv / ATLAS);
      si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0);
    }
    for (let i = 0; i < f.tris.length; i += 3) {
      if (mirror) idx.push(base + f.tris[i], base + f.tris[i + 2], base + f.tris[i + 1]);
      else idx.push(base + f.tris[i], base + f.tris[i + 1], base + f.tris[i + 2]);
    }
  };
  for (const f of faces) { emit(f, false); if (f.seg.mirror) emit(f, true); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  return { geometry: g, faces: loose, block, tris: idx.length / 3 };
}
