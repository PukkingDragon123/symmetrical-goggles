// Finger grips that wrap the actual object (ported in spirit from Gacha Garage's FPBody.js hand rig, where every hold
// is built from the held thing's own bounds): the fingers and thumb are posed joint by joint, and a contact solver
// closes each finger around the object's real surface - the proximal joint bends until that phalanx touches, then
// the middle joint, then the tip - so a fat bottle, a thin axe handle, a split of firewood or a jerky pouch each get
// their own grip instead of one canned fist.
//
//   const a = gripAngles(0.3, 0.25, 0.3, 0.05, 0.1);              // the classic 5-channel grip as joint angles
//   const s = sampleSurface(obj, objToHand, near, 0.13);           // object surface points in hand-bone space
//   solveWrap(s, dims, 'R', a, { opp: 0.8 });                      // close every finger onto it
//   applyFingers(bones, 'R', a);                                   // pose the bones
//
// Joint angle layout (Fingers, 17 floats): [ix0 ix1 ix2  md0 md1 md2  rg0 rg1 rg2  pk0 pk1 pk2  spread  thumbOpp
// th1 th2 th3]. Finger joints flex about the hand's (0, 0, -k) axis like humans/anim.ts setGrip, spread fans the
// fingers, thumbOpp (0..1) swings the thumb across the palm and th1..th3 flex its joints toward the fingers.
import * as THREE from 'three';
import type { Dims } from '../../humans/rig';
import { FINGERS, FING, PHAL, THUMB, tdir } from '../../humans/rig';

export const NF = 17;
export type Fingers = Float32Array;
const CURL = [1.45, 1.6, 1.15];
const MAXJ = [1.62, 1.8, 1.3];
const GLOVE = 0.0032;

/** the classic grip channels [curl, index, thumb, spread, cup] as joint angles (same mapping as setGrip) */
export function gripAngles(curl: number, index: number, thumb: number, spread: number, cup: number, out: Fingers = new Float32Array(NF)): Fingers {
  for (let i = 0; i < 4; i++) {
    const c = i === 0 ? index : Math.min(1, curl * (1 + i * 0.04));
    for (let s = 0; s < 3; s++) out[i * 3 + s] = c * CURL[s] + cup * (s === 0 ? 0.35 : 0.15);
  }
  out[12] = spread; out[13] = thumb; out[14] = thumb * 0.35; out[15] = 0.1 + thumb * 0.75; out[16] = 0.1 + thumb * 0.8;
  return out;
}
export const gripOf = (g: number[], out?: Fingers) => gripAngles(g[0], g[1], g[2], g[3], g[4], out);

export function mixFingers(out: Fingers, a: Fingers, b: Fingers, t: number): Fingers {
  for (let i = 0; i < NF; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

const _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const flexAxis = (k: number) => {
  const d = tdir(k);
  // cross(d, n) with n = (-k, 0, 0)
  const n = [-k, 0, 0];
  const c = new THREE.Vector3(d[1] * n[2] - d[2] * n[1], d[2] * n[0] - d[0] * n[2], d[0] * n[1] - d[1] * n[0]);
  return c.normalize();
};
const FLEX = { L: flexAxis(1), R: flexAxis(-1) };

/** pose the finger and thumb bones of one hand from joint angles */
export function applyFingers(b: Record<string, THREE.Bone>, side: 'L' | 'R', a: Fingers) {
  const k = side === 'L' ? 1 : -1;
  _ax.set(0, 0, -k);
  FINGERS.forEach((f, i) => {
    const sp = (i - 1.4) * 0.09 * a[12];
    for (let s = 0; s < 3; s++) {
      const bone = b[f + (s + 1) + side];
      bone.quaternion.setFromAxisAngle(_ax, a[i * 3 + s]);
      if (s === 0) bone.quaternion.premultiply(_qb.setFromAxisAngle(X, sp));
    }
  });
  const fl = FLEX[side];
  b['th1' + side].quaternion.setFromAxisAngle(_v.set(0, -k, 0), 0.25 + a[13] * 0.55).multiply(_qa.setFromAxisAngle(fl, a[14]));
  b['th2' + side].quaternion.setFromAxisAngle(fl, a[15]);
  b['th3' + side].quaternion.setFromAxisAngle(fl, a[16]);
}

// ------------------------------------------------------------------ object surface samples
/** points on the object's surface (hand-bone space), hashed for fast "is anything within r" queries */
export class Surface {
  readonly cell: number;
  private map = new Map<number, number[]>();
  count = 0;
  constructor(cell = 0.012) { this.cell = cell; }
  private key(ix: number, iy: number, iz: number) { return ((ix + 600) * 1201 + (iy + 600)) * 1201 + (iz + 600); }
  add(x: number, y: number, z: number) {
    const c = this.cell, k = this.key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c));
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(x, y, z);
    this.count++;
  }
  /** true when a surface point lies within r of p (r <= cell) */
  near(p: THREE.Vector3, r: number): boolean {
    const c = this.cell, ix = Math.floor(p.x / c), iy = Math.floor(p.y / c), iz = Math.floor(p.z / c), r2 = r * r;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = this.map.get(this.key(ix + dx, iy + dy, iz + dz));
      if (!a) continue;
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i] - p.x, y = a[i + 1] - p.y, z = a[i + 2] - p.z;
        if (x * x + y * y + z * z < r2) return true;
      }
    }
    return false;
  }
}

/**
 * Sample the surface of every mesh under `obj`, transformed by `toHand` (object local -> hand-bone space), keeping
 * only triangles within `radius` of `center` (the hand). ~3 mm spacing, deterministic.
 */
export function sampleSurface(obj: THREE.Object3D, toHand: THREE.Matrix4, center: THREE.Vector3, radius: number, spacing = 0.003): Surface {
  const S = new Surface();
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const r2 = (radius + 0.05) ** 2;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    m.multiplyMatrices(toHand, inv).multiply(mesh.matrixWorld);
    const idx = mesh.geometry.index;
    const nt = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < nt && S.count < 60000; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      // cull triangles away from the hand (bounding sphere test)
      p.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      const rr = Math.max(p.distanceToSquared(a), p.distanceToSquared(b), p.distanceToSquared(c));
      if (p.distanceToSquared(center) > r2 + rr + 2 * Math.sqrt(r2 * rr)) continue;
      const area = _v.subVectors(b, a).cross(_v2.subVectors(c, a)).length() * 0.5;
      const n = Math.min(500, Math.max(1, Math.ceil(area / (spacing * spacing))));
      S.add(a.x, a.y, a.z);
      for (let s = 0; s < n; s++) {
        let u = rnd(), v = rnd();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        S.add(a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v);
      }
    }
  });
  return S;
}

// ------------------------------------------------------------------ forward kinematics of one finger (hand space)
const _q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
const _j = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _axis = new THREE.Vector3();

function fingerFK(d: Dims, side: 'L' | 'R', fi: number, a: Fingers) {
  const k = side === 'L' ? 1 : -1, f = FINGERS[fi], F = FING[f], h = d.hand;
  const o = d.off[f + '1' + side];
  const L = [F.len * PHAL[0] * h, F.len * PHAL[1] * h, F.len * PHAL[2] * h];
  _axis.set(0, 0, -k);
  const sp = (fi - 1.4) * 0.09 * a[12];
  _q[0].setFromAxisAngle(X, sp).multiply(_qa.setFromAxisAngle(_axis, a[fi * 3]));
  _q[1].copy(_q[0]).multiply(_qa.setFromAxisAngle(_axis, a[fi * 3 + 1]));
  _q[2].copy(_q[1]).multiply(_qa.setFromAxisAngle(_axis, a[fi * 3 + 2]));
  _j[0].set(o[0], o[1], o[2]);
  for (let s = 0; s < 3; s++) _j[s + 1].copy(_j[s]).add(_v.set(0, -L[s], 0).applyQuaternion(_q[s]));
  return (F.r + GLOVE * 0.7) * h;
}
function thumbFK(d: Dims, side: 'L' | 'R', a: Fingers) {
  const k = side === 'L' ? 1 : -1, h = d.hand, fl = FLEX[side];
  const o = d.off['th1' + side], o2 = d.off['th2' + side], o3 = d.off['th3' + side];
  const dir = tdir(k);
  _q[0].setFromAxisAngle(_v.set(0, -k, 0), 0.25 + a[13] * 0.55).multiply(_qa.setFromAxisAngle(fl, a[14]));
  _q[1].copy(_q[0]).multiply(_qa.setFromAxisAngle(fl, a[15]));
  _q[2].copy(_q[1]).multiply(_qa.setFromAxisAngle(fl, a[16]));
  _j[0].set(o[0], o[1], o[2]);
  _j[1].copy(_j[0]).add(_v.set(o2[0], o2[1], o2[2]).applyQuaternion(_q[0]));
  _j[2].copy(_j[1]).add(_v.set(o3[0], o3[1], o3[2]).applyQuaternion(_q[1]));
  _j[3].copy(_j[2]).add(_v.set(dir[0], dir[1], dir[2]).multiplyScalar(THUMB.seg[2] * h).applyQuaternion(_q[2]));
  return (THUMB.r * 0.85 + GLOVE * 0.7) * h;
}

const _p = new THREE.Vector3();
/** any sample on segments s0..2 (joints s0..3) within r of the surface */
function touches(S: Surface, s0: number, r: number): boolean {
  for (let s = s0; s < 3; s++) {
    for (const t of [0.35, 0.7, 1]) {
      _p.lerpVectors(_j[s], _j[s + 1], t);
      if (S.near(_p, r)) return true;
    }
  }
  return false;
}

export interface WrapOpts {
  /** thumb opposition 0..1 (fixed; the thumb's joints close until they touch) */
  opp?: number;
  /** which fingers close (default all four) */
  fingers?: boolean[];
  thumb?: boolean;
  /** max curl per finger as a fraction of the joint limits (fingers that touch nothing stop here) */
  maxCurl?: number;
  /** how far fingers sink into a soft contact (0 = just touching, 0.3 = a firm squeeze) */
  squeeze?: number;
}

/**
 * Close the fingers (and thumb) of hand `side` onto the surface, starting from the angles in `a` (modified in place):
 * each joint flexes from the knuckle outward until its phalanx touches. Fingers that find nothing curl to maxCurl.
 */
export function solveWrap(S: Surface, d: Dims, side: 'L' | 'R', a: Fingers, o: WrapOpts = {}): Fingers {
  const step = 0.045, sq = 1 - (o.squeeze ?? 0.15), mc = o.maxCurl ?? 1;
  for (let fi = 0; fi < 4; fi++) {
    if (o.fingers && !o.fingers[fi]) continue;
    for (let s = 0; s < 3; s++) {
      const r = fingerFK(d, side, fi, a) * sq;
      if (touches(S, s, r)) continue;              // already resting on it
      // (a double counter: a Float32Array angle can round just under the limit and never reach it)
      const max = MAXJ[s] * mc, i = fi * 3 + s;
      for (let v = a[i]; v < max - 1e-6;) {
        v = Math.min(max, v + step);
        a[i] = v;
        fingerFK(d, side, fi, a);
        if (touches(S, s, r)) { a[i] = v - step * 0.35; break; }
      }
    }
  }
  if (o.thumb !== false) {
    a[13] = o.opp ?? a[13];
    const lim = [0.9, 1.2, 1.3];
    for (let s = 0; s < 3; s++) {
      const r = thumbFK(d, side, a) * sq;
      if (touches(S, s, r)) continue;
      const max = lim[s] * mc;
      for (let v = a[14 + s]; v < max - 1e-6;) {
        v = Math.min(max, v + step);
        a[14 + s] = v;
        thumbFK(d, side, a);
        if (touches(S, s, r)) { a[14 + s] = v - step * 0.35; break; }
      }
    }
  }
  return a;
}

/** fingertip positions (hand space) for debugging / contact checks: 4 fingers then the thumb */
export function tips(d: Dims, side: 'L' | 'R', a: Fingers): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let fi = 0; fi < 4; fi++) { fingerFK(d, side, fi, a); out.push(_j[3].clone()); }
  thumbFK(d, side, a); out.push(_j[3].clone());
  return out;
}
