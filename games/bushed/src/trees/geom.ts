// Low-level geometry for trees and vegetation: an attribute-rich mesh builder, tapered tubes along curves (parallel
// transport frames, irregular cross-sections) and alpha-cut foliage cards (V-folded, outward-bent normals).
import * as THREE from 'three';

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export type Col = [number, number, number];
export type Wind = [number, number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

export class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  wind: number[] = [];
  moss: number[] = [];
  idx: number[] = [];

  get count(): number { return this.pos.length / 3; }

  vert(p: V3, n: V3, u: number, v: number, c: Col, w: Wind, moss = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.wind.push(w[0], w[1], w[2], w[3]);
    this.moss.push(moss);
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }

  append(o: MeshBuilder): void {
    const off = this.count;
    for (const k of ['pos', 'nrm', 'uv', 'col', 'wind', 'moss'] as const) {
      const src = o[k], dst = this[k];
      for (let i = 0; i < src.length; i++) dst.push(src[i]);
    }
    for (let i = 0; i < o.idx.length; i++) this.idx.push(o.idx[i] + off);
  }

  get triangles(): number { return this.idx.length / 3; }

  build(opts: { moss?: boolean; scale?: number } = {}): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const s = opts.scale ?? 1;
    const pos = new Float32Array(this.pos);
    if (s !== 1) for (let i = 0; i < pos.length; i++) pos[i] *= s;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    const w = new Float32Array(this.wind);
    if (s !== 1) for (let i = 0; i < w.length; i += 4) { w[i] *= s; w[i + 1] *= s; }
    g.setAttribute('aWind', new THREE.BufferAttribute(w, 4));
    if (opts.moss !== false) g.setAttribute('aMoss', new THREE.BufferAttribute(new Float32Array(this.moss), 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ------------------------------------------------------------------------------------------------- frames
export function frames(pts: V3[]): { t: V3[]; n: V3[]; b: V3[] } {
  const t: V3[] = [], n: V3[] = [], b: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    t.push(c.clone().sub(a).normalize());
  }
  // initial normal: perpendicular to t, preferring "down" so the uv seam sits underneath branches
  let ref = Math.abs(t[0].y) > 0.9 ? v3(1, 0, 0) : v3(0, -1, 0);
  let nn = ref.clone().sub(t[0].clone().multiplyScalar(ref.dot(t[0]))).normalize();
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      // parallel transport
      const ax = t[i - 1].clone().cross(t[i]);
      const l = ax.length();
      if (l > 1e-6) {
        ax.divideScalar(l);
        const ang = Math.acos(THREE.MathUtils.clamp(t[i - 1].dot(t[i]), -1, 1));
        nn = nn.clone().applyAxisAngle(ax, ang);
      }
    }
    n.push(nn.clone());
    b.push(t[i].clone().cross(nn).normalize());
  }
  return { t, n, b };
}

export interface TubeOpts {
  sides: number;
  /** texture tile size in metres [around, along] */
  tile: [number, number];
  /** integer wraps of the texture around (seamless); 0 = use the true circumference (seam underneath) */
  wraps?: number;
  /** per-point colour */
  col: (i: number, s: number) => Col;
  wind: (i: number, s: number) => Wind;
  moss?: (i: number, s: number) => number;
  /** cross-section irregularity amplitude (fraction of radius) */
  rough?: number;
  roughSeed?: number;
  /** close the tip with a cone point */
  capTip?: boolean;
  v0?: number;
}

/** a tapered tube along a polyline */
export function tube(mb: MeshBuilder, pts: V3[], radii: number[], o: TubeOpts): void {
  const N = o.sides;
  const { t, n, b } = frames(pts);
  const r0 = radii[0];
  const circ = 2 * Math.PI * r0;
  const wraps = o.wraps && o.wraps > 0 ? o.wraps : circ / o.tile[0];
  let len = o.v0 ?? 0;
  const rows: number[][] = [];
  const seed = o.roughSeed ?? 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    const s = i / (pts.length - 1);
    const row: number[] = [];
    const c = o.col(i, s), w = o.wind(i, s), m = o.moss ? o.moss(i, s) : 0;
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * Math.PI * 2;
      const rr = radii[i] * (1 + (o.rough ?? 0) * Math.sin(a * 2 + seed * 1.7 + i * 0.9) * Math.cos(a * 3 + seed));
      const dirv = n[i].clone().multiplyScalar(Math.cos(a)).add(b[i].clone().multiplyScalar(Math.sin(a)));
      const p = pts[i].clone().add(dirv.clone().multiplyScalar(rr));
      row.push(mb.vert(p, dirv, (j / N) * wraps, len / o.tile[1], c, w, m));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < N; j++) mb.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
  }
  if (o.capTip) {
    const last = pts.length - 1;
    const tip = pts[last].clone().add(t[last].clone().multiplyScalar(radii[last] * 2.5));
    const ti = mb.vert(tip, t[last], 0.5 * wraps, (len + radii[last] * 2.5) / o.tile[1], o.col(last, 1), o.wind(last, 1), 0);
    for (let j = 0; j < N; j++) mb.tri(rows[last][j], rows[last][j + 1], ti);
  }
}

// ------------------------------------------------------------------------------------------------- cards
export interface CardSpec {
  p: V3;          // base (attachment) point
  d: V3;          // unit direction along the card
  n: V3;          // approximate card normal (unit, roughly perpendicular to d)
  len: number;
  wid: number;
  rect: [number, number, number, number]; // atlas uv rect u0 v0 u1 v1; twig enters at (u0, mid v)
  fold: number;   // radians: + lifts the long edges (trough), - droops them (roof)
  bend: V3;       // normal used for lighting (bent outward), unit
  bendAmt: number; // 0 = flat card normal, 1 = fully bent normal
  col: Col;
  colTip?: Col;
  windBase: Wind;
  windTip: Wind;
  flipV?: boolean;
}

const _s = new THREE.Vector3(), _u = new THREE.Vector3(), _tmp = new THREE.Vector3();

/** one V-folded card: 6 vertices, 4 triangles */
export function card(mb: MeshBuilder, c: CardSpec): void {
  _s.copy(c.d).cross(c.n).normalize();             // side
  _u.copy(_s).cross(c.d).normalize();              // true card normal (perp to d and s)
  if (_u.dot(c.n) < 0) _u.negate();
  const hw = c.wid / 2;
  const cf = Math.cos(c.fold), sf = Math.sin(c.fold);
  const tip = c.p.clone().addScaledVector(c.d, c.len);
  const [u0, v0, u1, v1] = c.rect;
  const vm = (v0 + v1) / 2;
  const L = c.flipV ? v0 : v1, R = c.flipV ? v1 : v0;
  const nn = (side: number) => {
    // normal of each half (tilted by the fold), bent toward the outward normal
    const hn = _tmp.copy(_u).multiplyScalar(cf).addScaledVector(_s, -side * sf).normalize();
    return hn.clone().multiplyScalar(1 - c.bendAmt).addScaledVector(c.bend, c.bendAmt).normalize();
  };
  const nl = nn(1), nr = nn(-1), nc = _u.clone().multiplyScalar(1 - c.bendAmt).addScaledVector(c.bend, c.bendAmt).normalize();
  const off = (side: number) => _s.clone().multiplyScalar(side * hw * cf).addScaledVector(_u, hw * sf);
  const ct = c.colTip ?? c.col;
  const b0 = mb.vert(c.p, nc, u0, vm, c.col, c.windBase);
  const b1 = mb.vert(tip, nc, u1, vm, ct, c.windTip);
  const l0 = mb.vert(c.p.clone().add(off(1)), nl, u0, L, c.col, c.windBase);
  const l1 = mb.vert(tip.clone().add(off(1)), nl, u1, L, ct, c.windTip);
  const r0 = mb.vert(c.p.clone().add(off(-1)), nr, u0, R, c.col, c.windBase);
  const r1 = mb.vert(tip.clone().add(off(-1)), nr, u1, R, ct, c.windTip);
  mb.quad(b0, b1, l1, l0);
  mb.quad(r0, r1, b1, b0);
}

/** rotate v around axis by angle (returns new vector) */
export function rot(v: V3, axis: V3, ang: number): V3 { return v.clone().applyAxisAngle(axis, ang); }

/** any unit vector perpendicular to v */
export function perp(v: V3): V3 {
  const a = Math.abs(v.y) < 0.9 ? UP : v3(1, 0, 0);
  return a.clone().sub(v.clone().multiplyScalar(a.dot(v))).normalize();
}

export function lerpCol(a: Col, b: Col, t: number): Col {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function mulCol(a: Col, k: number | Col): Col {
  return typeof k === 'number' ? [a[0] * k, a[1] * k, a[2] * k] : [a[0] * k[0], a[1] * k[1], a[2] * k[2]];
}
