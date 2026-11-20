// Shared helpers for the round-5 dressing: quality level, flat colour materials, instanced props (one draw call
// per prop sub-mesh however many copies), contact-shadow blobs.
import * as THREE from 'three';
import { defineMat, hasMat, tf, tube, type Mesher, type Rand } from '../kit';
import { loadProp } from '../props';
import { storedQuality } from '../../game/quality';
import { floorDecal } from './print';

/** 0 low, 1 medium, 2 high, 3 ultra (the URL's ?quality=, else the stored preset, else high) */
export function qualityLevel(): number {
  let q: string | null = null;
  try { q = new URLSearchParams(location.search).get('quality'); } catch { /* no location */ }
  q = q ?? storedQuality() ?? 'high';
  return ({ low: 0, medium: 1, high: 2, ultra: 3 } as Record<string, number>)[q] ?? 2;
}

/** a flat painted colour (small things: candy, lures, phone books, plastic) registered as 'c_<name>' */
export function colorMat(name: string, color: number, rough = 0.6, metal = 0, emissive = 0): string {
  const key = `c_${name}`;
  if (!hasMat(key)) {
    // matte throughout (no shiny or reflective looks): paint, plastic and metal alike
    const m = new THREE.MeshStandardMaterial({ name: `place_${key}`, color, roughness: Math.max(0.72, rough), metalness: Math.min(0.08, metal) });
    if (emissive) { m.emissive = new THREE.Color(color); m.emissiveIntensity = emissive; }
    defineMat(key, m);
  }
  return key;
}

export interface Xf { x: number; y: number; z: number; ry?: number; rx?: number; rz?: number; s?: number }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** load a prop once and draw every copy as instances (one InstancedMesh per sub-mesh); resolves the group */
export async function propInstances(parent: THREE.Object3D, id: string, list: Xf[], o: { cast?: boolean; name?: string; nearOnly?: boolean } = {}): Promise<THREE.Group | null> {
  if (!list.length) return null;
  let src: THREE.Object3D;
  try { src = await loadProp(id); } catch { return null; }
  src.updateMatrixWorld(true);
  const g = new THREE.Group();
  g.name = o.name ?? `inst_${id}`;
  if (o.nearOnly) g.userData.nearOnly = true;
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  src.traverse((ob) => {
    const mesh = ob as THREE.Mesh;
    if (!mesh.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    list.forEach((t, i) => {
      _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(t.x, t.y, t.z), _q, _s.setScalar(t.s ?? 1)).multiply(local);
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = (o.cast ?? true) && mesh.castShadow;
    im.receiveShadow = true;
    im.renderOrder = mesh.renderOrder;
    g.add(im);
  });
  parent.add(g);
  return g;
}

/** a soft contact shadow under something standing on a floor at y */
export function blob(ms: Mesher, x: number, y: number, z: number, w: number, d: number, ry = 0): void {
  floorDecal(ms, 'g_blob', x, y + 0.004, z, w, d, ry);
}

// ---------------------------------------------------------------------------------------------- shared shapes
// (copies of the cabin's helpers, so the store, forge and campground don't depend on files another worker owns)

/** load a prop and place it (local coords); resolves null if the prop is missing */
export async function prop(parent: THREE.Object3D, id: string, x: number, y: number, z: number, ry = 0, s = 1): Promise<THREE.Object3D | null> {
  try {
    const o = await loadProp(id);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.scale.setScalar(s);
    parent.add(o);
    return o;
  } catch {
    return null;
  }
}

/** a lumpy fieldstone (icosahedron with jittered vertices, flattish bottom) */
export function rock(ms: Mesher, rnd: Rand, x: number, y: number, z: number, sx: number, sy: number, sz: number, mat = 'stone'): void {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k == null) { k = rnd.range(0.82, 1.12); seen.set(key, k); }
    let yy = p.getY(i) * k;
    if (yy < -0.3) yy = -0.3 - (yy + 0.3) * 0.2;
    p.setXYZ(i, p.getX(i) * k, yy, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const o = rnd.range(0, 2);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * sx + p.getZ(i) * sz + o, p.getY(i) * sy + o);
  ms.geom(mat, g, tf(x, y + sy * 0.3, z, rnd.range(0, 6.28), 0, 0).multiply(new THREE.Matrix4().makeScale(sx / 2, sy / 2, sz / 2)));
  g.dispose();
}

/** irregular flagstones over a rectangle (a stove pad, a hearth) */
export function flagstones(ms: Mesher, rnd: Rand, x0: number, x1: number, z0: number, z1: number, y: number, cell = 0.32): void {
  const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell));
  const gx = (i: number) => x0 + (x1 - x0) * (i / nx), gz = (j: number) => z0 + (z1 - z0) * (j / nz);
  const P: [number, number][][] = [];
  for (let i = 0; i <= nx; i++) {
    P.push([]);
    for (let j = 0; j <= nz; j++) {
      const jx = i === 0 || i === nx ? 0 : rnd.range(-0.3, 0.3) * cell, jz = j === 0 || j === nz ? 0 : rnd.range(-0.3, 0.3) * cell;
      P[i].push([gx(i) + jx, gz(j) + jz]);
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const quad = [P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]];
    const c = [quad.reduce((s, p) => s + p[0], 0) / 4, quad.reduce((s, p) => s + p[1], 0) / 4];
    const pts: [number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const a = quad[k], b = quad[(k + 1) % 4];
      for (const t of [0.18 + rnd.range(-0.06, 0.06), 0.82 + rnd.range(-0.06, 0.06)]) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        pts.push([c[0] + (x - c[0]) * 0.9, c[1] + (z - c[1]) * 0.9]);
      }
    }
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const th = rnd.range(0.025, 0.045);
    const g = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 1 });
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const uo = rnd.range(0, 2), vo = rnd.range(0, 2);
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.6 + uo, uv.getY(k) * 0.6 + vo);
    ms.geom('stone', g, tf(0, y - 0.01 + rnd.range(-0.004, 0.004), 0, 0, -Math.PI / 2, 0));
    g.dispose();
  }
}

/** kit.tube with sane sampling: straight two-point runs are one segment, curves ~8 cm per sample (max 32) */
export function tb(ms: Mesher, mat: string, pts: THREE.Vector3[], r: number, seg = 6, o: { smooth?: boolean; samples?: number; closed?: boolean; rEnd?: number } = {}): void {
  if (o.samples == null && o.smooth !== false) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    o = { ...o, samples: pts.length === 2 ? 1 : Math.max(pts.length - 1, Math.min(20, Math.ceil(L / 0.12))) };
  }
  tube(ms, mat, pts, r, seg, o);
}

/** ?r5off: build the places without the round-5 dressing (before/after comparisons) */
export function r5off(): boolean { try { return new URLSearchParams(location.search).has('r5off'); } catch { return false; } }
