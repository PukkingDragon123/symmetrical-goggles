// Helpers for dressing the cabin cheaply: bake products and props into merged meshes (one draw call per
// material however many copies), groups that switch off with distance, quality tiers, and decal quads.
import * as THREE from 'three';
import { Mesher, Rand, V, defineMat, hasMat, tube, lathe } from '../kit';
import { buildProduct } from '../products';
import { loadProp, type PropId } from '../props';
import { G } from '../../gfx/globals';
import { DECAL, PAPER, CLOTH, PAINT } from './tex';

const _m = new THREE.Matrix4();

/** merge every opaque mesh under `obj` (already posed) into `ms` at `m` (cabin-local placement of obj's root) */
export function bakeObject(ms: Mesher, obj: THREE.Object3D, m: THREE.Matrix4): boolean {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  let skipped = false;
  const isProduct = !!obj.userData.product;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
    if (mat.transparent || o.name === 'flame' || o.name === 'glass') { skipped = true; return; }
    // product meshes are named after their places-kit material; props get their material registered by uuid
    let key = mesh.name;
    if (!isProduct || !hasMat(key)) {
      key = `pm_${mat.uuid}`;
      if (!hasMat(key)) defineMat(key, mat);
    }
    _m.copy(m).multiply(inv).multiply(mesh.matrixWorld);
    ms.geom(key, mesh.geometry, _m);
  });
  return !skipped;
}

/** a product (products.ts id) merged into `ms`, bottom centre at (x, y, z) */
export function bakeProduct(ms: Mesher, id: string, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): void {
  const o = buildProduct(id);
  bakeObject(ms, o, new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(s, s, s)));
}

/** a prop merged into `ms` once it loads; transparent parts (glass, flames) are kept as a live clone under `live` */
export async function bakeProp(ms: Mesher, id: string, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1, live?: THREE.Object3D): Promise<void> {
  let o: THREE.Object3D;
  try { o = await loadProp(id as PropId); } catch { return; }
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(s, s, s));
  const all = bakeObject(ms, o, m);
  if (!all && live) {
    o.traverse((c) => { const mm = c as THREE.Mesh; if (mm.isMesh) { const mt = mm.material as THREE.Material; if (!(mt.transparent || c.name === 'flame' || c.name === 'glass')) mm.visible = false; } });
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz, 'YXZ'); o.scale.setScalar(s);
    live.add(o);
  }
}

/** the place's chosen detail tier: 0 low, 1 medium, 2 high/ultra (the game's quality when known) */
export function detailTier(): number {
  let q: string | null = null;
  try {
    const W = window as unknown as { __game?: { quality?: { name?: string } } };
    q = W.__game?.quality?.name ?? new URLSearchParams(location.search).get('quality') ?? localStorage.getItem('bushed.quality');
  } catch { /* no storage */ }
  return q === 'low' ? 0 : q === 'medium' ? 1 : 2;
}

/** stop a mesh tree from taking part in raycasts (small clutter must not cost the interaction ray anything) */
export function noRay(o: THREE.Object3D): THREE.Object3D {
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.raycast = () => {}; });
  return o;
}

/**
 * Hide `obj` when the camera is farther than `far` metres from `centre` (local to `space`, checked a few times a
 * second). Returns the per-frame updater; no allocation per frame.
 */
export function farCull(obj: THREE.Object3D, centre: THREE.Vector3, far: number): (dt: number) => void {
  let t = Math.random() * 0.25;
  const w = new THREE.Vector3();
  let ready = false;
  return (dt: number) => {
    t -= dt;
    if (t > 0) return;
    t = 0.25;
    if (!ready) { obj.parent?.updateMatrixWorld(true); w.copy(centre).applyMatrix4(obj.parent!.matrixWorld); ready = true; }
    obj.visible = G.uCamPos.value.distanceToSquared(w) < far * far;
  };
}

// ---------------------------------------------------------------------------------------------- atlas quads
type Atl = { uv(k: string): [number, number, number, number] };
const ATL = (which: 'decal' | 'paper' | 'cloth' | 'paint'): Atl => (which === 'decal' ? DECAL : which === 'paper' ? PAPER : which === 'cloth' ? CLOTH : PAINT);

/** a quad facing +Z at the current frame origin mapped to an atlas rect (optionally a sub-rect: [a,b,c,d] fractions) */
export function atlasQuad(ms: Mesher, mat: string, which: 'decal' | 'paper' | 'cloth' | 'paint', key: string, w: number, h: number, sub?: [number, number, number, number], flipU = false): void {
  let [u0, v0, u1, v1] = ATL(which).uv(key);
  if (sub) { const du = u1 - u0, dv = v1 - v0; [u0, v0, u1, v1] = [u0 + du * sub[0], v0 + dv * sub[1], u0 + du * sub[2], v0 + dv * sub[3]]; }
  if (flipU) [u0, u1] = [u1, u0];
  ms.quad(mat, V(-w / 2, -h / 2, 0), V(w / 2, -h / 2, 0), V(w / 2, h / 2, 0), V(-w / 2, h / 2, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
}

/**
 * A ground decal draped over the terrain: an n x n grid centred at (x, z) of size w x d, yaw ry, heights from
 * `hAt(x, z)` (cabin-local) + lift. Written in the cabin frame (no pushes expected).
 */
export function groundDecal(ms: Mesher, key: string, x: number, z: number, w: number, d: number, ry: number, hAt: (x: number, z: number) => number, lift = 0.02, n = 4, mat = 'cab_decal'): void {
  const [u0, v0, u1, v1] = DECAL.uv(key);
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (i: number, j: number) => {
    const lx = (i / n - 0.5) * w, lz = (j / n - 0.5) * d;
    const wx = x + c * lx + s * lz, wz = z - s * lx + c * lz;
    return V(wx, hAt(wx, wz) + lift, wz);
  };
  const up = V(0, 1, 0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = P(i, j + 1), b = P(i + 1, j + 1), cc = P(i + 1, j), dd = P(i, j);
    const U = (k: number) => u0 + (u1 - u0) * (k / n), Vv = (k: number) => v0 + (v1 - v0) * (k / n);
    ms.quad(mat, a, b, cc, dd, [U(i), Vv(j)], [U(i + 1), Vv(j)], [U(i + 1), Vv(j + 1)], [U(i), Vv(j + 1)], up);
  }
}

/** crossed upright cards (weeds, grass tufts) from the decal atlas at (x, y, z) */
export function tuft(ms: Mesher, r: Rand, key: string, x: number, y: number, z: number, w: number, h: number): void {
  const [u0, v0, u1, v1] = DECAL.uv(key);
  const a0 = r.range(0, Math.PI);
  for (let k = 0; k < 2; k++) {
    const a = a0 + k * Math.PI / 2, c = Math.cos(a) * w / 2, s = Math.sin(a) * w / 2;
    const su = r.range(0, 0.5);
    const ua = u0 + (u1 - u0) * su, ub = u0 + (u1 - u0) * (su + 0.5);
    const lean = r.range(-0.06, 0.06);
    ms.quad('cab_card', V(x - c, y, z - s), V(x + c, y, z + s), V(x + c + lean, y + h, z + s), V(x - c + lean, y + h, z - s), [ua, v0], [ub, v0], [ub, v1], [ua, v1], V(0, 1, 0));
  }
}

// ---------------------------------------------------------------------------------------------- atlas-mapped shapes
/** [u0, v0, u1, v1] of an atlas rect */
export function cellUV(which: 'decal' | 'paper' | 'cloth' | 'paint', key: string): [number, number, number, number] { return ATL(which).uv(key); }

/** append a three.js primitive whose UVs run 0..1, remapped into an atlas rect, at matrix m (current frame) */
export function cellGeom(ms: Mesher, mat: string, which: 'decal' | 'paper' | 'cloth' | 'paint', key: string, g: THREE.BufferGeometry, m?: THREE.Matrix4, tile: [number, number] = [1, 1]): void {
  const [u0, v0, u1, v1] = ATL(which).uv(key);
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (uv) for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i) * tile[0], v = uv.getY(i) * tile[1];
    u = u - Math.floor(u - 1e-6); v = v - Math.floor(v - 1e-6);
    uv.setXY(i, u0 + (u1 - u0) * Math.min(1, Math.max(0, u)), v0 + (v1 - v0) * Math.min(1, Math.max(0, v)));
  }
  ms.geom(mat, g, m);
  g.dispose();
}

/** a box centred at (x, y, z) with every face mapped to the whole atlas rect */
export function cellBox(ms: Mesher, mat: string, which: 'decal' | 'paper' | 'cloth' | 'paint', key: string, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, rx = 0, rz = 0): void {
  cellGeom(ms, mat, which, key, new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(1, 1, 1)));
}

/** a lathe (profile [radius, y][] bottom to top) mapped around/along into an atlas rect */
export function cellLathe(ms: Mesher, mat: string, which: 'decal' | 'paper' | 'cloth' | 'paint', key: string, profile: [number, number][], seg = 12, m?: THREE.Matrix4): void {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
  cellGeom(ms, mat, which, key, g, m);
}

/** a tube along points mapped into an atlas rect (u along, v around) */
export function cellTube(ms: Mesher, mat: string, which: 'decal' | 'paper' | 'cloth' | 'paint', key: string, pts: THREE.Vector3[], r: number, seg = 6, samples?: number): void {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  const g = new THREE.TubeGeometry(curve, samples ?? Math.max(2, Math.min(10, (pts.length - 1) * 3)), r, Math.min(seg, 6), false);
  cellGeom(ms, mat, which, key, g);
}

/** the kit's tube, kept low-poly: few rings along (3 per control segment, at most 10) */
export function ltube(ms: Mesher, mat: string, pts: THREE.Vector3[], r: number, seg = 4, o: { smooth?: boolean; samples?: number; closed?: boolean; rEnd?: number } = {}): void {
  tube(ms, mat, pts, r, Math.min(seg, 6), { ...o, samples: Math.min(o.samples ?? 99, Math.max(2, Math.min(10, (pts.length - 1) * 3))) });
}

/** an old car tire, low-poly (torus 6 x 12 + rusty rim), centre (x, y, z), axis along local z after ry/rx */
export function tire(ms: Mesher, x: number, y: number, z: number, ry = 0, rx = 0, s = 1): void {
  ms.pushT(x, y, z, ry, rx);
  const t = new THREE.TorusGeometry(0.24 * s, 0.075 * s, 6, 12);
  ms.geom('cab_rubber', t);
  t.dispose();
  ms.push(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  lathe(ms, 'cab_rust', [[0.17 * s, -0.06 * s], [0.17 * s, 0.06 * s]], 10);
  lathe(ms, 'cab_rust', [[0, 0.0], [0.17 * s, 0.0]].reverse() as [number, number][], 10);
  ms.pop();
  ms.pop();
}

/**
 * A low-poly firewood split along X (14 triangles): a wedge of the round with the bark arc as two facets, two
 * split faces and end-grain caps. For stacks where only the ends and the bark show; r = the round's radius.
 */
export function lowSplit(ms: Mesher, rnd: Rand, len: number, r: number): void {
  const span = rnd.range(1.0, 1.5), c = r * 0.55;
  const a0 = Math.PI / 2 - span / 2, a1 = Math.PI / 2 + span / 2, am = Math.PI / 2 + rnd.range(-0.15, 0.15);
  const pts: [number, number][] = [[Math.cos(a0) * r, Math.sin(a0) * r - c], [Math.cos(am) * r * 1.03, Math.sin(am) * r * 1.03 - c], [Math.cos(a1) * r, Math.sin(a1) * r - c], [0, -c]];
  const x0 = -len / 2, x1 = len / 2;
  const P = (x: number, q: [number, number]) => V(x, q[1], q[0]);
  const uo = rnd.range(0, 2);
  for (let k = 0; k < 3; k++) {
    const a = pts[k], b = pts[k + 1];
    const mat = k < 2 ? 'bark' : 'wood_fresh';
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    ms.quad(mat, P(x0, a), P(x1, a), P(x1, b), P(x0, b), [uo, 0], [uo + len, 0], [uo + len, d], [uo, d]);
  }
  { const a = pts[3], b = pts[0], d = Math.hypot(b[0] - a[0], b[1] - a[1]); ms.quad('wood_fresh', P(x0, a), P(x1, a), P(x1, b), P(x0, b), [uo, 0], [uo + len, 0], [uo + len, d], [uo, d]); }
  const cu = 0.75, cv = 0.75, uvq = (q: [number, number]): [number, number] => [cu + (q[0] / (r * 1.12)) * 0.245, cv + ((q[1] + c) / (r * 1.12)) * 0.245];
  for (const [x, nx] of [[x1, 1], [x0, -1]] as [number, number][]) {
    const n = V(nx, 0, 0);
    for (const [i, j] of [[0, 1], [1, 2]] as [number, number][]) {
      const A = pts[3], B = pts[nx > 0 ? j : i], C = pts[nx > 0 ? i : j];
      ms.tri('endgrain', P(x, A), P(x, B), P(x, C), n, n, n, uvq(A), uvq(B), uvq(C));
    }
    const A = pts[3], B = pts[nx > 0 ? 0 : 2], C = pts[nx > 0 ? 2 : 0];
    void A; void B; void C;
  }
}
