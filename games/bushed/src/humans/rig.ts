// The first-person arm rig's hand model and proportions, plus small allocation-free IK helpers.
//
// The hand is Gacha Garage's FPBody.js hand (the author's own game): a palm prism, three-bone fingers and a three-bone
// thumb, metres for a 1.72 m adult in hand-bone space (left hand; the right mirrors x). BUSHED conventions on top
// (they match GG's): bones hang along local -y with identity rest rotations, +z is the body's front, +x the body's
// LEFT, the left palm faces -x (toward the body), the thumb sits on +z; finger chains run down -y, the thumb chain runs
// along tdir() so the finger contact solver (src/player/fp/grip.ts) can flex every joint about fixed axes.
import * as THREE from 'three';
import type { Props, Joints } from './gg/types';

export type V3 = [number, number, number];
export const FINGERS = ['ix', 'md', 'rg', 'pk'] as const;
export type FingerName = typeof FINGERS[number];
/** knuckle [z across the palm, y down the hand], phalanx lengths, half width (z), half thickness (x) */
export const FING: Record<FingerName, { k: [number, number]; len: [number, number, number]; w: number; t: number }> = {
  ix: { k: [0.026, -0.08], len: [0.034, 0.022, 0.018], w: 0.0092, t: 0.0083 },
  md: { k: [0.0085, -0.083], len: [0.037, 0.025, 0.019], w: 0.0096, t: 0.0086 },
  rg: { k: [-0.009, -0.081], len: [0.035, 0.023, 0.018], w: 0.009, t: 0.0081 },
  pk: { k: [-0.0255, -0.075], len: [0.027, 0.017, 0.015], w: 0.0079, t: 0.0073 },
};
/** thumb: carpometacarpal joint (hand space), rest direction (left hand), phalanx lengths, half width / thickness */
export const THUMB = { base: [-0.005, -0.012, 0.019] as V3, dir: [-0.3, -0.82, 0.5] as V3, len: [0.038, 0.03, 0.026], w: 0.0106, t: 0.0092 };
/** inside a closed fist / palm surface centre / between the thumb and index tips (left hand, hand space) */
export const FIST_C: V3 = [-0.028, -0.078, 0.004];
export const PALM_C: V3 = [-0.0135, -0.05, 0.003];

/** the thumb's rest direction for side k (+1 left, -1 right), unit */
export function tdir(k: number): V3 { const d = THUMB.dir; const l = Math.hypot(d[0], d[1], d[2]); return [k * d[0] / l, d[1] / l, d[2] / l]; }

/** The bones of the first-person arm rig (BUSHED names; the IK and the grips address them by these). */
const sideBones = (s: 'L' | 'R') => ['clav' + s, 'uarm' + s, 'farm' + s, 'ftw' + s, 'hand' + s, 'th1' + s, 'th2' + s, 'th3' + s,
  ...FINGERS.flatMap((f) => [f + '1' + s, f + '2' + s, f + '3' + s])];
export const FP_BONES = ['hips', 'spine', 'chest', 'neck', 'head', ...sideBones('L'), ...sideBones('R')];
export const FP_PARENT: Record<string, string> = { hips: '', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck' };
for (const s of ['L', 'R']) {
  Object.assign(FP_PARENT, { ['clav' + s]: 'chest', ['uarm' + s]: 'clav' + s, ['farm' + s]: 'uarm' + s, ['ftw' + s]: 'farm' + s, ['hand' + s]: 'ftw' + s,
    ['th1' + s]: 'hand' + s, ['th2' + s]: 'th1' + s, ['th3' + s]: 'th2' + s });
  for (const f of FINGERS) Object.assign(FP_PARENT, { [f + '1' + s]: 'hand' + s, [f + '2' + s]: f + '1' + s, [f + '3' + s]: f + '2' + s });
}

/** proportions of one person's first-person rig (body space: feet at y = 0, facing +z) */
export interface Dims {
  /** height scale vs the 1.72 m reference */
  s: number;
  /** hand scale (metres per reference hand unit) */
  hand: number;
  /** bone offsets from their parents, and rest positions in body space */
  off: Record<string, V3>;
  rest: Record<string, V3>;
  L: { uarm: number; farm: number };
  /** between the eyes, just behind the face */
  eye: V3;
}

export function fpDims(P: Props, J: Joints): Dims {
  const H = P.H, s = H / 1.72, hand = s * 0.93;
  const rest: Record<string, V3> = {};
  rest.hips = [...J.hips]; rest.spine = [...J.spine]; rest.chest = [...J.chest]; rest.neck = [...J.neck]; rest.head = [...J.head];
  for (const [sd, k] of [['L', 1], ['R', -1]] as const) {
    const a = J['arm' + sd], f = J['fore' + sd], h = J['hand' + sd];
    rest['clav' + sd] = [k * 0.018 * H, P.neckBase - 0.025 * H, 0.012 * H];
    rest['uarm' + sd] = [...a]; rest['farm' + sd] = [...f]; rest['ftw' + sd] = [...f]; rest['hand' + sd] = [...h];
    const add = (n: string, p: string, o: V3) => { const q = rest[p]; rest[n] = [q[0] + o[0], q[1] + o[1], q[2] + o[2]]; };
    for (const fn of FINGERS) {
      const F = FING[fn];
      add(fn + '1' + sd, 'hand' + sd, [k * -0.001 * hand, F.k[1] * hand, F.k[0] * hand]);
      add(fn + '2' + sd, fn + '1' + sd, [0, -F.len[0] * hand, 0]);
      add(fn + '3' + sd, fn + '2' + sd, [0, -F.len[1] * hand, 0]);
    }
    const d = tdir(k);
    add('th1' + sd, 'hand' + sd, [k * THUMB.base[0] * hand, THUMB.base[1] * hand, THUMB.base[2] * hand]);
    add('th2' + sd, 'th1' + sd, [d[0] * THUMB.len[0] * hand, d[1] * THUMB.len[0] * hand, d[2] * THUMB.len[0] * hand]);
    add('th3' + sd, 'th2' + sd, [d[0] * THUMB.len[1] * hand, d[1] * THUMB.len[1] * hand, d[2] * THUMB.len[1] * hand]);
  }
  const off: Record<string, V3> = {};
  for (const n of FP_BONES) {
    const p = FP_PARENT[n], r = rest[n];
    off[n] = p ? [r[0] - rest[p][0], r[1] - rest[p][1], r[2] - rest[p][2]] : [r[0], r[1], r[2]];
  }
  return { s, hand, off, rest, L: { uarm: P.shoulderY - P.elbowY, farm: P.elbowY - P.wristY }, eye: [0, P.eyeY, P.zf - 0.012] };
}

/** create the bones of the FP rig at rest (identity rotations) */
export function makeFPSkeleton(d: Dims): { bones: THREE.Bone[]; byName: Record<string, THREE.Bone> } {
  const byName: Record<string, THREE.Bone> = {};
  const bones = FP_BONES.map((n) => { const b = new THREE.Bone(); b.name = n; byName[n] = b; const o = d.off[n]; b.position.set(o[0], o[1], o[2]); return b; });
  for (const n of FP_BONES) { const p = FP_PARENT[n]; if (p) byName[p].add(byName[n]); }
  return { bones, byName };
}

// ------------------------------------------------------------------ IK (allocation-free)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _qp = new THREE.Quaternion();

/**
 * Two-bone limb solve in one common frame. base = shoulder / hip joint, target = wrist / ankle, pole = the side the
 * middle joint should point toward. Writes the frame rotations of both bones (they hang along -y) into qUpper /
 * qLower; arms bend so the forearm swings toward the upper arm's +z, knees (knee = true) the other way.
 */
export function twoBone(base: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, L1: number, L2: number, qUpper: THREE.Quaternion, qLower: THREE.Quaternion, mid?: THREE.Vector3, knee = false) {
  _a.subVectors(target, base);
  let dist = _a.length();
  if (dist < 1e-5) { _a.set(0, -1, 0); dist = 1e-5; } else _a.multiplyScalar(1 / dist);
  dist = Math.min((L1 + L2) * 0.999, Math.max(Math.abs(L1 - L2) + 1e-3, dist));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a));
  if (_b.lengthSq() < 1e-8) { _b.set(0, 0, 1).addScaledVector(_a, -_a.z); if (_b.lengthSq() < 1e-8) _b.set(1, 0, 0); }
  _b.normalize();
  let ca = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  ca = ca > 1 ? 1 : ca < -1 ? -1 : ca;
  const sa = Math.sqrt(1 - ca * ca);
  _c.copy(base).addScaledVector(_a, ca * L1).addScaledVector(_b, sa * L1);
  if (mid) mid.copy(_c);
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

/** frame rotation of a bone relative to `stop` (exclusive) */
export function frameRot(bone: THREE.Object3D, stop: THREE.Object3D, out: THREE.Quaternion) {
  out.identity();
  let o: THREE.Object3D | null = bone;
  while (o && o !== stop) { out.premultiply(o.quaternion); o = o.parent; }
  return out;
}
const _q2 = new THREE.Quaternion(), _v2 = new THREE.Vector3();
/** frame position of a bone origin relative to `stop` (unit scales) */
export function framePos(bone: THREE.Object3D, stop: THREE.Object3D, out: THREE.Vector3) {
  out.set(0, 0, 0);
  let o: THREE.Object3D | null = bone;
  // walk up: p = parentQ * p + parentPos
  out.copy(o.position);
  o = o.parent;
  while (o && o !== stop) { out.applyQuaternion(o.quaternion).add(o.position); o = o.parent; }
  void _q2; void _v2;
  return out;
}

/** twist angle of q about the local y axis (swing-twist decomposition) */
export function twistAboutY(q: THREE.Quaternion): number {
  const l = Math.hypot(q.y, q.w);
  if (l < 1e-6) return 0;
  return 2 * Math.atan2(q.y / l, q.w / l);
}
