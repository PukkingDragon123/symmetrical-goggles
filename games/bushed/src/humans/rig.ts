// Skeleton, proportions and small geometry / IK helpers for BUSHED's people.
//
// Ported from Limbophobia's survivor rig (src/limbo/entities/humanModel.ts rigDims + BONES, humanIK.ts) via the
// Blobfish cleanup (src/humans/rig.ts), back to realistic adult proportions (Limbophobia's life-size head,
// hands and feet) and extended for close-up first-person hands: clavicles, a forearm twist bone, three
// bones per finger and thumb, a jaw and eyelids. Conventions: bind pose is an "I" pose with every limb bone
// hanging along its local -y, +z is the body's front, +x the body's LEFT, every bone rotation is identity at rest.
//
// Rotation conventions (radians): uarm.x < 0 swings the arm forward, uarm.z * k > 0 raises it out sideways
// (k = +1 left, -1 right); farm.x < 0 bends the elbow; thigh.x < 0 lifts the leg forward; shin.x > 0 bends
// the knee; spine / chest / head .x > 0 lean / nod forward; .y > 0 turns toward the body's left.
import * as THREE from 'three';
import type { V3, Wt } from './loft';

export const FINGERS = ['ix', 'md', 'rg', 'pk'] as const;
export type FingerName = typeof FINGERS[number];

const sideBones = (s: 'L' | 'R') => [
  'clav' + s, 'uarm' + s, 'farm' + s, 'ftw' + s, 'hand' + s,
  'th1' + s, 'th2' + s, 'th3' + s,
  'ix1' + s, 'ix2' + s, 'ix3' + s, 'md1' + s, 'md2' + s, 'md3' + s,
  'rg1' + s, 'rg2' + s, 'rg3' + s, 'pk1' + s, 'pk2' + s, 'pk3' + s,
];
export const BONES = [
  'hips', 'spine', 'chest', 'belly', 'neck', 'head', 'jaw', 'lids',
  ...sideBones('L'), ...sideBones('R'),
  'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR',
] as const;
export type BoneName = string;
export const BI: Record<string, number> = Object.fromEntries(BONES.map((b, i) => [b, i]));

export const PARENT: Record<string, string> = {
  hips: '', spine: 'hips', chest: 'spine', belly: 'spine', neck: 'chest', head: 'neck', jaw: 'head', lids: 'head',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', toeL: 'footL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR', toeR: 'footR',
};
for (const s of ['L', 'R']) {
  PARENT['clav' + s] = 'chest'; PARENT['uarm' + s] = 'clav' + s; PARENT['farm' + s] = 'uarm' + s;
  PARENT['ftw' + s] = 'farm' + s; PARENT['hand' + s] = 'ftw' + s;
  PARENT['th1' + s] = 'hand' + s; PARENT['th2' + s] = 'th1' + s; PARENT['th3' + s] = 'th2' + s;
  for (const f of FINGERS) { PARENT[f + '1' + s] = 'hand' + s; PARENT[f + '2' + s] = f + '1' + s; PARENT[f + '3' + s] = f + '2' + s; }
}

/** body build of one person (1 = the reference ~1.78 m adult) */
export interface Build {
  s: number;        // overall scale
  bw: number;       // width (x)
  mass: number;     // girth / depth (z) of trunk and limbs
  belly: number;    // 0..1 pot belly
  chest: number;    // 0..1 barrel chest / big pecs
  fem: number;      // 0..1
  headS: number;    // head size vs the life-size reference head
  legLen: number; armLen: number;
  handS: number; footS: number;
  shoulders: number;
  neckLen: number;
  hunch: number;    // 0..1 rest stoop (the elderly)
}

/** finger layout on the hand (hand-bone space, reference metres): knuckle y, z across the palm, length, radius */
export const FING = {
  ix: { y: -0.084, z: 0.029, len: 0.078, r: 0.0098 },
  md: { y: -0.088, z: 0.0098, len: 0.086, r: 0.0103 },
  rg: { y: -0.086, z: -0.0098, len: 0.080, r: 0.0097 },
  pk: { y: -0.077, z: -0.0275, len: 0.064, r: 0.0086 },
} as const;
/** phalanx fractions of a finger's length */
export const PHAL = [0.47, 0.29, 0.24];
/** the thumb: base (CMC, hand space), rest direction (left hand; mirror x for the right), segment lengths */
export const THUMB = { base: [-0.008, -0.014, 0.018] as V3, dir: [-0.3, -0.72, 0.62] as V3, seg: [0.042, 0.032, 0.027], r: 0.0125 };

export interface Dims {
  b: Build;
  s: number;
  off: Record<string, V3>;
  rest: Record<string, V3>;
  hipY: number;
  /** head scale (metres per reference head unit) */
  hs: number;
  /** hand scale */
  hand: number;
  L: { uarm: number; farm: number; thigh: number; shin: number; ankle: number };
  /** maps reference torso heights (hips at 0.94) onto this body */
  ty: (yRef: number) => number;
}

export function rigDims(b: Build): Dims {
  const s = b.s;
  const off: Record<string, V3> = {};
  const set = (n: string, x: number, y: number, z: number) => { off[n] = [x, y, z]; };
  const legK = b.legLen;
  const thigh = 0.43 * legK * s, shin = 0.42 * legK * s, ankle = 0.07 * s;
  const hipY = ankle + shin + thigh + 0.02 * s;
  const sh = 0.17 * (0.55 + 0.45 * b.bw) * b.shoulders * (1 - 0.07 * b.fem);
  const hx = 0.082 * (0.6 + 0.4 * b.bw) * (1 + 0.08 * b.fem);
  set('hips', 0, hipY, 0);
  set('spine', 0, 0.07 * s, 0);
  set('chest', 0, 0.2 * s, 0);
  set('belly', 0, 0.02 * s, 0.07 * s * b.mass);
  set('neck', 0, 0.27 * s, -0.008 * s);
  set('head', 0, 0.078 * s * b.neckLen, 0.012 * s);
  const hs = s * b.headS;
  set('jaw', 0, 0.062 * hs, -0.012 * hs);
  set('lids', 0, 0.106 * hs, 0.08 * hs);
  const ua = 0.285 * b.armLen * s, fa = 0.25 * b.armLen * s;
  const hand = s * b.handS * (1 - b.fem * 0.08) * (0.92 + 0.08 * b.mass);
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    set('clav' + side, k * 0.022 * s, 0.168 * s, 0.03 * s);
    set('uarm' + side, k * (sh - 0.022) * s, 0.028 * s, -0.042 * s);
    set('farm' + side, 0, -ua, 0);
    set('ftw' + side, 0, -fa * 0.45, 0);
    set('hand' + side, 0, -fa * 0.55, 0);
    for (const f of FINGERS) {
      const F = FING[f];
      set(f + '1' + side, 0, F.y * hand, F.z * hand);
      set(f + '2' + side, 0, -F.len * PHAL[0] * hand, 0);
      set(f + '3' + side, 0, -F.len * PHAL[1] * hand, 0);
    }
    const d = tdir(k);
    set('th1' + side, k * THUMB.base[0] * hand, THUMB.base[1] * hand, THUMB.base[2] * hand);
    set('th2' + side, d[0] * THUMB.seg[0] * hand, d[1] * THUMB.seg[0] * hand, d[2] * THUMB.seg[0] * hand);
    set('th3' + side, d[0] * THUMB.seg[1] * hand, d[1] * THUMB.seg[1] * hand, d[2] * THUMB.seg[1] * hand);
    set('thigh' + side, k * hx * s, -0.02 * s, 0);
    set('shin' + side, 0, -thigh, 0);
    set('foot' + side, 0, -shin, 0);
    set('toe' + side, 0, -ankle + 0.012 * s, 0.13 * s * b.footS);
  }
  const rest: Record<string, V3> = {};
  for (const n of BONES) {
    const p = PARENT[n], o = off[n];
    rest[n] = p ? [rest[p][0] + o[0], rest[p][1] + o[1], rest[p][2] + o[2]] : [o[0], o[1], o[2]];
  }
  return {
    b, s, off, rest, hipY, hs, hand,
    L: { uarm: ua, farm: fa, thigh, shin, ankle },
    ty: (yRef: number) => hipY + (yRef - 0.94) * s,
  };
}
/** the thumb's rest direction for side k (unit) */
export function tdir(k: number): V3 { const d = THUMB.dir; const l = Math.hypot(d[0], d[1], d[2]); return [k * d[0] / l, d[1] / l, d[2] / l]; }

/** create the THREE skeleton for a body (bones at rest, identity rotations) */
export function makeSkeleton(d: Dims): { bones: THREE.Bone[]; byName: Record<string, THREE.Bone>; skeleton: THREE.Skeleton } {
  const byName: Record<string, THREE.Bone> = {};
  const bones = BONES.map((n) => {
    const b = new THREE.Bone(); b.name = n; byName[n] = b;
    const o = d.off[n]; b.position.set(o[0], o[1], o[2]);
    return b;
  });
  for (const n of BONES) { const p = PARENT[n]; if (p) byName[p].add(byName[n]); }
  byName.hips.updateMatrixWorld(true);
  return { bones, byName, skeleton: new THREE.Skeleton(bones) };
}

// ------------------------------------------------------------------ profile rows & rings
export interface Row { y: number; rx: number; rf: number; rb: number; sq?: number; cz?: number }

export function sampleRows(rows: Row[], y: number): Row {
  const asc = rows[0].y < rows[rows.length - 1].y;
  const r = asc ? rows : [...rows].reverse();
  if (y <= r[0].y) return { ...r[0], y };
  if (y >= r[r.length - 1].y) return { ...r[r.length - 1], y };
  for (let i = 0; i + 1 < r.length; i++) {
    const a = r[i], b = r[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      const L = (p: number, q: number) => p + (q - p) * t;
      return { y, rx: L(a.rx, b.rx), rf: L(a.rf, b.rf), rb: L(a.rb, b.rb), sq: L(a.sq ?? 2, b.sq ?? 2), cz: L(a.cz ?? 0, b.cz ?? 0) };
    }
  }
  return { ...r[0], y };
}

/** superellipse ring round a vertical axis, seam at the back (th0 = -PI), th = 0 is the front (+z) */
export function ellRing(y: number, cx: number, cz: number, rx: number, rf: number, rb: number, n: number, sq: number, mirror: number, bump?: (th: number) => number, th0 = -Math.PI): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const th = th0 + (Math.PI * 2 * i) / n;
    pts.push(superPt(th, cx, cz, rx, rf, rb, sq, mirror, 1 + (bump ? bump(th) : 0), y));
  }
  return pts;
}
export function superPt(th: number, cx: number, cz: number, rx: number, rf: number, rb: number, sq: number, mirror: number, kk: number, y: number): V3 {
  const e = 2 / sq;
  const sx = Math.sin(th), cz_ = Math.cos(th);
  const ex = Math.sign(sx) * Math.pow(Math.abs(sx), e), ez = Math.sign(cz_) * Math.pow(Math.abs(cz_), e);
  return [mirror * (cx + ex * rx * kk), y, cz + ez * (cz_ >= 0 ? rf : rb) * kk];
}

/** ring y-list with doubled rings at cloth breaks (hems make a visible step) */
export function ringYs(rows: Row[], breaks: number[], extra: number[] = []): { y: number; eps: number }[] {
  const lo = Math.min(rows[0].y, rows[rows.length - 1].y), hi = Math.max(rows[0].y, rows[rows.length - 1].y);
  const ys = rows.map((r) => ({ y: r.y, eps: 0 }));
  for (const y of extra) if (y > lo && y < hi) ys.push({ y, eps: 0 });
  for (const b of breaks) {
    if (b <= lo + 0.005 || b >= hi - 0.005) continue;
    for (let i = ys.length - 1; i >= 0; i--) if (ys[i].eps === 0 && Math.abs(ys[i].y - b) < 0.012) ys.splice(i, 1);
    ys.push({ y: b, eps: -1 }, { y: b, eps: 1 });
  }
  const desc = rows[0].y > rows[rows.length - 1].y;
  ys.sort((a, b) => (desc ? b.y - a.y || b.eps - a.eps : a.y - b.y || a.eps - b.eps));
  return ys;
}

export const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
export const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const vOf = (range: readonly number[], y: number) => (y - range[0]) / (range[1] - range[0]);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** weights: scale the existing influences by (1 - t) and add bone b with t */
export const withW = (w: Wt, b: number, t: number): Wt => (t <= 0 ? w : [...w.map((v, i) => (i & 1 ? v * (1 - t) : v)), b, t]);

// ------------------------------------------------------------------ IK + springs (allocation-free)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _qp = new THREE.Quaternion();

/**
 * Two-bone limb solve in one common frame. base = shoulder / hip joint, target = wrist / ankle, pole = the side
 * the middle joint (elbow / knee) should point toward. Writes the frame rotations of both bones into qUpper /
 * qLower (bones hang along -y; the hinge is their shared local x, the lower bone bends toward local -z... for
 * elbows that is a forearm swinging forward). Returns the middle joint position in `mid`.
 */
export function twoBone(base: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, L1: number, L2: number, qUpper: THREE.Quaternion, qLower: THREE.Quaternion, mid?: THREE.Vector3, knee = false) {
  _a.subVectors(target, base);
  let dist = _a.length();
  if (dist < 1e-5) { _a.set(0, -1, 0); dist = 1e-5; } else _a.multiplyScalar(1 / dist);
  const reach = (L1 + L2) * 0.999;
  dist = Math.min(reach, Math.max(Math.abs(L1 - L2) + 1e-3, dist));
  // n: unit vector perpendicular to the base->target line toward the pole (where the middle joint goes)
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a));
  if (_b.lengthSq() < 1e-8) { _b.set(0, 0, -1).addScaledVector(_a, -_a.z * -1); if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0); }
  _b.normalize();
  let ca = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  ca = ca > 1 ? 1 : ca < -1 ? -1 : ca;
  const sa = Math.sqrt(1 - ca * ca);
  _c.copy(base).addScaledVector(_a, ca * L1).addScaledVector(_b, sa * L1);
  if (mid) mid.copy(_c);
  // upper bone: -y along base->mid; its local -z points to the pole side for arms (the forearm swings to +z of the
  // upper arm's frame when the elbow bends: farm.x < 0), +z for knees
  _y.subVectors(base, _c).normalize();
  _z.copy(_b).addScaledVector(_y, -_b.dot(_y)).normalize();
  if (!knee) _z.negate();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z); qUpper.setFromRotationMatrix(_m);
  _y.subVectors(_c, target).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z); qLower.setFromRotationMatrix(_m);
}

/** set a bone's local quaternion so its frame rotation becomes q (parentQ = the parent's frame rotation) */
export function setFrameRot(bone: THREE.Object3D, parentQ: THREE.Quaternion, q: THREE.Quaternion, w = 1) {
  _qp.copy(parentQ).invert().multiply(q);
  if (w >= 1) bone.quaternion.copy(_qp); else bone.quaternion.slerp(_qp, w);
}

/** frame rotation of a bone relative to `stop` (exclusive: the walk ends at stop's child) */
export function frameRot(bone: THREE.Object3D, stop: THREE.Object3D, out: THREE.Quaternion) {
  out.identity();
  const chain: THREE.Object3D[] = [];
  let o: THREE.Object3D | null = bone;
  while (o && o !== stop) { chain.push(o); o = o.parent; }
  for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i].quaternion);
  return out;
}
const _q2 = new THREE.Quaternion(), _v2 = new THREE.Vector3();
/** frame position of a bone origin relative to `stop` (unit scales) */
export function framePos(bone: THREE.Object3D, stop: THREE.Object3D, out: THREE.Vector3) {
  const chain: THREE.Object3D[] = [];
  let o: THREE.Object3D | null = bone;
  while (o && o !== stop) { chain.push(o); o = o.parent; }
  out.set(0, 0, 0); _q2.identity();
  for (let i = chain.length - 1; i >= 0; i--) {
    _v2.copy(chain[i].position).applyQuaternion(_q2);
    out.add(_v2);
    _q2.multiply(chain[i].quaternion);
  }
  return out;
}

/** critically damped spring (value, velocity in v[i]) toward target */
export function spring(x: number, v: Float32Array | number[], i: number, target: number, omega: number, dt: number, zeta = 1): number {
  const k = omega * omega, c = 2 * zeta * omega;
  let vel = v[i];
  const n = dt > 0.02 ? Math.ceil(dt / 0.02) : 1, h = dt / n;
  for (let s = 0; s < n; s++) { vel += (-(x - target) * k - vel * c) * h; x += vel * h; }
  v[i] = vel;
  return x;
}
