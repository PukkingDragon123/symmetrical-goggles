// NPC animation: every clip is a pose function of time writing joint Euler angles, a root offset and hand-grip
// channels; the animator crossfades clips, layers breathing, blinking, talking (jaw + head + hand beats) and a
// look-at on top, then solves hand IK where a clip needs a hand on something (the counter, the axe handle, the
// pointing target) and curls the fingers from the grip channels.
//
// Clips: idle (weight shifts, breathing, looking about), walk (procedural gait from speed), talk (gestures),
// point, wave, lean (on a counter), count (money), flinch (startled, one-shot), sit, chop (wood, emits
// 'impact'), warm (hands at a fire).
//
// Angle conventions (rig.ts): uarm.x < 0 swings an arm forward, uarm.z * k > 0 raises it sideways (k = +1 left,
// -1 right), farm.x < 0 bends the elbow, thigh.x < 0 lifts a leg forward, shin.x > 0 bends a knee, foot.x > 0
// points the toes down, spine / chest / head .x > 0 lean forward, .y > 0 turn to the body's left.
import * as THREE from 'three';
import type { Dims } from './rig';
import { FINGERS, tdir, twoBone, frameRot, framePos, setFrameRot } from './rig';
import type { V3 } from './loft';
import { cross, norm } from './loft';

export type NpcAnim = 'idle' | 'walk' | 'talk' | 'point' | 'wave' | 'lean' | 'count' | 'flinch' | 'sit' | 'chop' | 'warm';
export const NPC_ANIMS: NpcAnim[] = ['idle', 'walk', 'talk', 'point', 'wave', 'lean', 'count', 'flinch', 'sit', 'chop', 'warm'];

const J = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'clavL', 'uarmL', 'farmL', 'ftwL', 'handL', 'clavR', 'uarmR', 'farmR', 'ftwR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'] as const;
type JN = typeof J[number];
const JI = Object.fromEntries(J.map((j, i) => [j, i])) as Record<JN, number>;
const NJ = J.length * 3;
// extra channels
const ROOT = NJ, GRIP_L = NJ + 3, GRIP_R = NJ + 8, IK_L = NJ + 13, IK_R = NJ + 17, NCH = NJ + 21;
// grip channel layout: [curl, index, thumb, spread, cup]; IK channel layout: [w, x, y, z] (body space)

export class Pose {
  a = new Float32Array(NCH);
  j(n: JN, x: number, y = 0, z = 0) { const i = JI[n] * 3; this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; return this; }
  add(n: JN, x: number, y = 0, z = 0) { const i = JI[n] * 3; this.a[i] += x; this.a[i + 1] += y; this.a[i + 2] += z; return this; }
  /** mirrored-side helper: k = +1 left, -1 right; y and z flip sign on the right */
  arm(side: 'L' | 'R', clav: [number, number, number], uarm: [number, number, number], farm: number, twist: number, hand: [number, number, number]) {
    const k = side === 'L' ? 1 : -1;
    this.j(('clav' + side) as JN, clav[0], clav[1] * k, clav[2] * k);
    this.j(('uarm' + side) as JN, uarm[0], uarm[1] * k, uarm[2] * k);
    this.j(('farm' + side) as JN, farm, 0, 0);
    this.j(('ftw' + side) as JN, 0, twist * k, 0);
    this.j(('hand' + side) as JN, hand[0], hand[1] * k, hand[2] * k);
    return this;
  }
  leg(side: 'L' | 'R', thigh: [number, number, number], shin: number, foot: number, toe = 0) {
    const k = side === 'L' ? 1 : -1;
    this.j(('thigh' + side) as JN, thigh[0], thigh[1] * k, thigh[2] * k);
    this.j(('shin' + side) as JN, shin, 0, 0);
    this.j(('foot' + side) as JN, foot, 0, 0);
    this.j(('toe' + side) as JN, toe, 0, 0);
    return this;
  }
  root(x: number, y: number, z: number) { this.a[ROOT] = x; this.a[ROOT + 1] = y; this.a[ROOT + 2] = z; return this; }
  addRoot(x: number, y: number, z: number) { this.a[ROOT] += x; this.a[ROOT + 1] += y; this.a[ROOT + 2] += z; return this; }
  grip(side: 'L' | 'R', curl: number, index = curl, thumb = curl * 0.8, spread = 0, cup = 0) {
    const o = side === 'L' ? GRIP_L : GRIP_R;
    this.a[o] = curl; this.a[o + 1] = index; this.a[o + 2] = thumb; this.a[o + 3] = spread; this.a[o + 4] = cup; return this;
  }
  /** hand IK target (body space metres, feet at y = 0, facing +z) with weight */
  ik(side: 'L' | 'R', w: number, x: number, y: number, z: number) {
    const o = side === 'L' ? IK_L : IK_R;
    this.a[o] = w; this.a[o + 1] = x; this.a[o + 2] = y; this.a[o + 3] = z; return this;
  }
  get(i: number) { return this.a[i]; }
}

const sm = (t: number) => t * t * (3 - 2 * t);
const cl = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const L = (a: number, b: number, t: number) => a + (b - a) * t;
/** keyframe track [[t, v], ...] with smoothstep easing between keys */
export function track(t: number, keys: number[][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) return L(v0, v1, sm((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}
const n1 = (t: number, s: number) => Math.sin(t * 1.3 + s) * 0.5 + Math.sin(t * 2.17 + s * 1.7) * 0.3 + Math.sin(t * 3.9 + s * 0.3) * 0.2;

export interface AnimCtx {
  s: number; hipY: number; time: number; hunch: number; rnd: number;
  walkSpeed: number; phase: number; dims: Dims;
  /** look / point target in body space, or null */
  target: THREE.Vector3 | null;
}

/** the relaxed standing pose every clip starts from */
function stand(p: Pose, c: AnimCtx) {
  const h = c.hunch;
  p.j('spine', 0.02 + h * 0.14).j('chest', 0.03 + h * 0.22).j('neck', -0.05 - h * 0.2).j('head', 0.03 - h * 0.12);
  p.arm('L', [0, 0, 0], [0.04 - h * 0.1, 0.1, 0.08], -0.2 - h * 0.15, 0.25, [0.05, 0, -0.05]);
  p.arm('R', [0, 0, 0], [0.04 - h * 0.1, 0.1, 0.08], -0.2 - h * 0.15, 0.25, [0.05, 0, -0.05]);
  p.leg('L', [-0.02, 0.06, 0.03], 0.04 + h * 0.08, -0.02);
  p.leg('R', [-0.02, 0.06, 0.03], 0.04 + h * 0.08, -0.02);
  p.grip('L', 0.3, 0.25, 0.25, 0, 0.1).grip('R', 0.3, 0.25, 0.25, 0, 0.1);
}

const breath = (p: Pose, c: AnimCtx, amp = 1, rate = 1) => {
  const b = Math.sin(c.time * 1.75 * rate + c.rnd) * 0.016 * amp;
  p.add('chest', -b * 0.8).add('neck', b * 0.4).add('clavL', 0, 0, b * 0.6).add('clavR', 0, 0, -b * 0.6).add('spine', -b * 0.3);
};

export interface ClipOut { loop: boolean; dur: number; next?: NpcAnim; events?: [number, string][]; talkable?: boolean }

export function clip(name: NpcAnim, t: number, p: Pose, c: AnimCtx): ClipOut {
  const s = c.s;
  p.a.fill(0);
  stand(p, c);
  switch (name) {
    case 'idle': {
      const sw = Math.sin(c.time * 0.45 + c.rnd);
      p.addRoot(sw * 0.02 * s, -Math.abs(sw) * 0.004 * s, 0).add('hips', 0, sw * 0.04, sw * 0.045).add('spine', 0, -sw * 0.02, -sw * 0.03).add('chest', 0, 0, -sw * 0.015);
      p.add('thighL', 0, 0, -sw * 0.045).add('thighR', 0, 0, -sw * 0.045);
      p.add('shinL', Math.max(0, -sw) * 0.08).add('shinR', Math.max(0, sw) * 0.08);
      p.add('head', n1(c.time * 0.35, c.rnd) * 0.08, n1(c.time * 0.22, c.rnd + 3) * 0.4, n1(c.time * 0.3, c.rnd + 5) * 0.05);
      // fidget every few seconds: hands drift (thumbs hooked in a pocket / rubbing the fingers)
      const f = (c.time * 0.11 + c.rnd) % 1;
      const fid = sm(cl((f - 0.55) * 8)) * sm(cl((0.95 - f) * 8));
      p.add('uarmR', -0.12 * fid, 0, 0.06 * fid).add('farmR', -0.5 * fid);
      p.grip('R', 0.3 + fid * 0.4, 0.3 + fid * 0.3, 0.3 + fid * 0.5);
      breath(p, c, 1.1);
      return { loop: true, dur: 0, talkable: true };
    }
    case 'walk': {
      const ph = c.phase, A = Math.min(1.25, 0.35 + c.walkSpeed * 0.42);
      const run = cl((c.walkSpeed - 2.4) / 1.5);
      for (const [side, off] of [['L', 0], ['R', Math.PI]] as const) {
        const q = ph + off;
        const sinq = Math.sin(q), cosq = Math.cos(q);
        const thigh = -0.42 * A * sinq - 0.05 - run * 0.25;
        const knee = 0.1 + (0.85 + run * 0.6) * A * Math.pow(Math.max(0, Math.cos(q + 0.45)), 1.6) + 0.14 * A * Math.exp(-((Math.sin(q - 1.9)) ** 2) / 0.08);
        const foot = 0.32 * A * Math.max(0, -Math.sin(q + 0.6)) * Math.max(0, -cosq) - 0.18 * A * Math.exp(-((q % (Math.PI * 2) - 1.35) ** 2) / 0.12) + knee * 0.08;
        p.leg(side, [thigh, 0.04, 0.02], knee, foot, Math.max(0, -sinq) * Math.max(0, -cosq) * -0.4 * A);
        const arm = 0.38 * A * Math.sin(q + Math.PI);
        p.arm(side, [0, 0, 0], [-arm * 0.9 + 0.04 - run * 0.2, 0.08, 0.08], -0.28 - Math.max(0, -arm) * 0.5 - run * 1.0, 0.3, [0.06, 0, -0.05]);
      }
      const bob = Math.cos(ph * 2);
      p.root(Math.sin(ph) * 0.016 * s, (-0.012 - bob * 0.016 * A) * s - run * 0.03 * s, 0);
      p.add('hips', 0.04 * A, Math.sin(ph) * 0.08 * A, Math.sin(ph) * 0.03 * A);
      p.add('spine', 0.04 * A + run * 0.12, -Math.sin(ph) * 0.05 * A, 0).add('chest', 0.02 * A, -Math.sin(ph) * 0.06 * A, -Math.sin(ph) * 0.02);
      p.add('head', -0.02 * A, Math.sin(ph) * 0.06 * A, 0);
      p.grip('L', 0.35, 0.3, 0.3).grip('R', 0.35, 0.3, 0.3);
      breath(p, c, 0.6, 1.4);
      return { loop: true, dur: 0 };
    }
    case 'talk': {
      // hands up in front at the belt, beat gestures on the words, an open-palm flourish now and then
      const T = c.time;
      const beat = Math.max(0, Math.sin(T * 5.2 + Math.sin(T * 1.3) * 2)) ** 3;
      const flour = sm(cl(Math.sin(T * 0.7 + c.rnd) * 2 - 0.6));
      const alt = Math.sin(T * 0.43 + c.rnd);
      p.arm('R', [0, 0, 0.02], [-0.42 - flour * 0.3 + beat * 0.05, -0.15, 0.18 + flour * 0.2], -1.25 + beat * 0.25 + flour * 0.35, -0.9 - flour * 0.4, [0.15, 0, 0.1 + flour * 0.3]);
      p.arm('L', [0, 0, 0.02], [-0.3 + alt * 0.1, -0.1, 0.12], -1.1 - alt * 0.15, -0.6, [0.15, 0, 0.1]);
      p.grip('R', 0.25 - flour * 0.15, 0.2 - flour * 0.15, 0.25, 0.3 * flour, 0.2).grip('L', 0.35, 0.3, 0.3, 0, 0.1);
      p.add('head', 0.05 * beat + 0.04 * n1(T, c.rnd), n1(T * 0.4, c.rnd) * 0.18, n1(T * 0.5, c.rnd + 2) * 0.07);
      p.add('chest', 0.02 * beat, n1(T * 0.3, 1) * 0.06, 0);
      p.add('hips', 0, 0, Math.sin(T * 0.4) * 0.03).addRoot(Math.sin(T * 0.4) * 0.012 * s, 0, 0);
      breath(p, c, 0.8);
      return { loop: true, dur: 0, talkable: true };
    }
    case 'point': {
      const k = sm(cl(t / 0.45));
      const shake = Math.sin(t * 9) * 0.01 * (1 - k * 0.5);
      p.arm('R', [-0.05 * k, -0.05 * k, 0.08 * k], [L(0.04, -1.42, k) + shake, -0.2 * k, L(0.08, 0.12, k)], L(-0.2, -0.06, k), L(0.25, -0.6, k), [L(0.05, -0.1, k), 0, 0.06]);
      p.grip('R', L(0.3, 1, k), L(0.25, 0, k), L(0.25, 0.85, k));
      p.add('chest', 0, -0.12 * k, 0).add('head', -0.04 * k, -0.18 * k, 0);
      breath(p, c, 0.8);
      return { loop: true, dur: 0, talkable: true };
    }
    case 'wave': {
      const k = sm(cl(t / 0.4));
      const w = Math.sin(t * 8.5) * k;
      p.arm('R', [0.0, 0, 0.18 * k], [L(0.04, -0.35, k), L(0.1, -0.2, k) + w * 0.38, L(0.08, 1.95, k)], L(-0.2, -1.25, k), L(0.25, -0.9, k), [L(0.05, -0.15, k), 0, w * 0.12]);
      p.grip('R', L(0.3, 0.05, k), L(0.25, 0.05, k), L(0.25, 0.1, k), 0.6 * k);
      p.add('head', -0.05 * k, -0.1 * k, -0.08 * k).add('chest', -0.02 * k, -0.05 * k, -0.05 * k);
      breath(p, c, 0.9);
      return { loop: true, dur: 0 };
    }
    case 'lean': {
      // forward over a counter (top ~0.95 m, its edge ~0.38 m ahead), weight on both hands, shifting
      const sh = Math.sin(c.time * 0.5 + c.rnd);
      p.j('spine', 0.36 + c.hunch * 0.1).j('chest', 0.16 + c.hunch * 0.1).j('neck', -0.38).j('head', 0.06);
      p.add('hips', 0.06, sh * 0.04, sh * 0.03).root(sh * 0.012 * s, -0.01 * s, -0.04 * s);
      p.leg('L', [0.06, 0.06, 0.04], 0.06 + Math.max(0, -sh) * 0.1, 0.03).leg('R', [0.06, 0.06, 0.04], 0.06 + Math.max(0, sh) * 0.1, 0.03);
      p.arm('L', [0.05, 0, 0.06], [-0.9, 0.1, 0.25], -0.5, 0.0, [-0.5, 0, 0.0]);
      p.arm('R', [0.05, 0, 0.06], [-0.9, 0.1, 0.25], -0.5, 0.0, [-0.5, 0, 0.0]);
      p.ik('L', 1, 0.2 * s, 0.965 * s, 0.38 * s).ik('R', 1, -0.2 * s, 0.965 * s, 0.38 * s);
      p.grip('L', 0.15, 0.12, 0.2, 0.3, 0).grip('R', 0.15, 0.12, 0.2, 0.3, 0);
      p.add('head', n1(c.time * 0.3, c.rnd) * 0.06, n1(c.time * 0.2, c.rnd + 1) * 0.25, 0);
      breath(p, c, 1.2);
      return { loop: true, dur: 0, talkable: true };
    }
    case 'count': {
      // a wad of bills in the left hand at the chest; the right thumb flicks them off one by one
      const flick = Math.max(0, Math.sin(t * 6.5)) ** 2;
      p.j('neck', 0.1).j('head', 0.28).add('spine', 0.04).add('chest', 0.06);
      p.arm('L', [0, 0, 0.02], [-0.55, -0.25, 0.05], -1.55, -1.1, [0.25, 0, -0.1]);
      p.arm('R', [0, 0, 0.02], [-0.5, -0.1, 0.08], -1.4 - flick * 0.08, -1.0, [0.1 + flick * 0.12, 0, 0.15]);
      p.ik('L', 1, 0.03 * s, c.hipY + 0.2 * s, 0.27 * s).ik('R', 0.85, -0.035 * s, c.hipY + 0.215 * s + flick * 0.012 * s, 0.27 * s);
      p.grip('L', 0.62, 0.55, 0.7, 0, 0.2).grip('R', 0.45 + flick * 0.2, 0.3, 0.3 + flick * 0.5, 0, 0);
      breath(p, c, 0.7);
      return { loop: true, dur: 0, talkable: true };
    }
    case 'flinch': {
      // startled: a fast crouch back from the threat, arms up round the head, then a shaken recovery
      const k = track(t, [[0, 0], [0.09, 1], [0.6, 0.9], [1.5, 0]]);
      const tw = Math.sin(t * 40) * 0.02 * cl(1 - t);
      p.add('spine', -0.22 * k, 0.2 * k, 0).add('chest', -0.1 * k + 0.18 * k * cl(t * 4), 0.15 * k, 0).add('neck', 0.25 * k).add('head', 0.2 * k, 0.35 * k, 0.1 * k);
      p.arm('L', [0.1 * k, 0, 0.12 * k], [L(0.04, -1.7, k) + tw, L(0.1, -0.4, k), L(0.08, 0.35, k)], L(-0.2, -2.1, k), -0.6 * k, [0.4 * k, 0, 0]);
      p.arm('R', [0.1 * k, 0, 0.12 * k], [L(0.04, -1.3, k) + tw, L(0.1, -0.6, k), L(0.08, 0.5, k)], L(-0.2, -1.9, k), -0.6 * k, [0.3 * k, 0, 0]);
      p.leg('L', [-0.3 * k, 0.1, 0.08], 0.55 * k, -0.15 * k).leg('R', [0.1 * k, 0.1, 0.08], 0.4 * k, 0.1 * k);
      p.root(0, -0.08 * k * s, -0.12 * k * s);
      p.grip('L', 0.3 + 0.5 * k, 0.3 + 0.4 * k, 0.6).grip('R', 0.3 + 0.5 * k, 0.3 + 0.4 * k, 0.6);
      breath(p, c, 1 + k * 2, 1 + k * 1.5);
      return { loop: false, dur: 1.6, next: 'idle' };
    }
    case 'sit': {
      // on a chair / stump ~0.45 m: thighs forward, knees bent, forearms resting on the thighs
      const sh = Math.sin(c.time * 0.3 + c.rnd);
      p.leg('L', [-1.45, 0.12, 0.1], 1.4, 0.04).leg('R', [-1.4, 0.12, 0.1], 1.32, 0.04);
      p.root(0, -(c.hipY - 0.5 * s), -0.06 * s);
      p.j('hips', -0.08).j('spine', 0.18 + c.hunch * 0.1 + sh * 0.02).j('chest', 0.12 + c.hunch * 0.15).j('neck', -0.1).j('head', 0.05);
      p.arm('L', [0.04, 0, 0], [-0.55, 0.1, 0.18], -0.95, -0.4, [0.15, 0, 0.05]);
      p.arm('R', [0.04, 0, 0], [-0.5, 0.1, 0.18], -0.9 + sh * 0.05, -0.4, [0.15, 0, 0.05]);
      p.grip('L', 0.45, 0.4, 0.3).grip('R', 0.45, 0.4, 0.3);
      p.add('head', n1(c.time * 0.3, c.rnd) * 0.05, n1(c.time * 0.2, c.rnd + 2) * 0.3, 0);
      breath(p, c, 1.1);
      return { loop: true, dur: 0, talkable: true };
    }
    case 'chop': {
      // overhead split onto a block ~0.7 m ahead: lift, hold at the top, drive down, impact, recover
      const T = 2.3;
      const u = t % T;
      const up = track(u, [[0, 0], [0.75, 1], [0.95, 1.04], [1.12, 0.35], [1.2, -0.08], [1.5, -0.08], [2.3, 0]]);
      const dn = track(u, [[0, 0], [1.0, 0], [1.2, 1], [1.6, 1], [2.3, 0]]);
      p.j('spine', 0.18 - up * 0.26 + dn * 0.3).j('chest', 0.08 - up * 0.12 + dn * 0.2).j('neck', -0.18 + up * 0.05 - dn * 0.2).j('head', 0.18 + up * 0.0 + dn * 0.1);
      p.leg('L', [-0.28, 0.12, 0.12], 0.2 + dn * 0.25, 0.08).leg('R', [0.18, 0.1, 0.1], 0.12 + dn * 0.2, -0.05);
      p.root(0, -(0.02 + dn * 0.05) * s, -0.02 * s);
      p.arm('R', [0.02 + up * 0.12, 0, 0.05 + up * 0.15], [L(-0.85, -2.75, up) + dn * 0.1, -0.15, 0.12 - up * 0.08], L(-0.45, -1.45, up), -0.4, [L(-0.3, 0.55, up) + dn * 0.35, 0.1, -0.2]);
      p.arm('L', [0.02 + up * 0.1, 0, 0.05 + up * 0.12], [L(-0.6, -2.5, up), 0.2, 0.18], L(-0.6, -1.2, up), -0.6, [0.2, 0, 0.1]);
      p.ik('L', 1, 0, 0, 0);   // the left hand rides the axe handle (solved against the right-hand socket)
      p.grip('L', 0.82, 0.82, 0.85).grip('R', 0.82, 0.82, 0.85);
      breath(p, c, 1.2, 1.3);
      return { loop: true, dur: T, events: [[1.2, 'impact']] };
    }
    case 'warm': {
      // hands held out to a fire, palms to the warmth; every few seconds a brisk rub
      const rub = sm(cl(Math.sin(c.time * 0.5 + c.rnd) * 3 - 1.5));
      const r = Math.sin(c.time * 14) * rub;
      p.j('spine', 0.14).j('chest', 0.1).j('neck', -0.12).j('head', 0.12);
      p.leg('L', [-0.18, 0.1, 0.1], 0.3, -0.05).leg('R', [-0.1, 0.1, 0.1], 0.24, -0.05);
      p.root(0, -0.04 * s, 0);
      p.arm('L', [0.04, 0, 0.04], [L(-0.95, -0.85, rub) + r * 0.04, -0.3, L(0.25, 0.05, rub)], L(-0.55, -1.3, rub), L(-1.0, -0.5, rub), [L(-0.6, 0.0, rub), 0, L(0.0, 0.2, rub)]);
      p.arm('R', [0.04, 0, 0.04], [L(-0.95, -0.85, rub) - r * 0.04, -0.3, L(0.25, 0.05, rub)], L(-0.55, -1.3, rub), L(-1.0, -0.5, rub), [L(-0.6, 0.0, rub), 0, L(0.0, 0.2, rub)]);
      p.grip('L', 0.12, 0.1, 0.15, 0.25 * (1 - rub)).grip('R', 0.12, 0.1, 0.15, 0.25 * (1 - rub));
      breath(p, c, 1.3, 1.1);
      return { loop: true, dur: 0, talkable: true };
    }
  }
}

// ------------------------------------------------------------------ the animator
type Listener = (ev: string, data?: unknown) => void;
const _e = new THREE.Euler(0, 0, 0, 'XZY');
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class HumanAnimator {
  readonly bones: Record<string, THREE.Bone>;
  readonly dims: Dims;
  readonly mesh: THREE.Object3D;
  state: NpcAnim = 'idle';
  prev: NpcAnim = 'idle';
  /** walk speed (m/s) for the walk clip */
  walkSpeed = 1.3;
  /** layered talking (jaw, head beats) on any talkable clip */
  talking = false;
  speed = 1;
  private t = 0; private pt = 0; private fade = 1; private fadeDur = 0.3;
  private time = 0; private phase = 0;
  private pose = new Pose(); private prevPose = new Pose(); private mixPose = new Pose();
  private listeners: Listener[] = [];
  private lookW = 0; private lookTarget: THREE.Vector3 | null = null; private lookYaw = 0; private lookPitch = 0;
  private blinkT = 2; private blink = 0;
  private rnd: number; private hunch: number; private baseY: number;
  private restQ = new Map<string, THREE.Quaternion>();
  private loopOut: ClipOut = { loop: true, dur: 0 };
  /** objects used by IK (the left hand rides the right-hand socket's handle when chopping) */
  sockets: { L?: THREE.Object3D; R?: THREE.Object3D } = {};
  /** handle offset of the left hand along the tool's +Y (m) for two-handed tools */
  twoHandOffset = -0.36;

  constructor(bones: Record<string, THREE.Bone>, dims: Dims, mesh: THREE.Object3D, seed: number) {
    this.bones = bones; this.dims = dims; this.mesh = mesh;
    this.rnd = (seed % 1000) * 0.0123;
    this.hunch = dims.b.hunch;
    this.baseY = mesh.position.y;
    for (const [n, b] of Object.entries(bones)) this.restQ.set(n, b.quaternion.clone());
  }
  onEvent(cb: Listener) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((l) => l !== cb); }; }
  private emit(ev: string, data?: unknown) { for (const l of this.listeners) l(ev, data); }

  /** switch clip with a crossfade */
  play(name: NpcAnim, o: { fade?: number; restart?: boolean } = {}) {
    if (name === this.state && !o.restart) return;
    this.prev = this.state; this.pt = this.t;
    this.prevPose.a.set(this.pose.a);
    this.state = name; this.t = 0;
    this.fadeDur = o.fade ?? (name === 'flinch' ? 0.06 : 0.35);
    this.fade = 0;
  }
  /** look at a world-space point (null to stop) */
  lookAt(p: THREE.Vector3 | null) { this.lookTarget = p ? p.clone() : null; }
  get clipTime() { return this.t; }

  update(dt: number) {
    dt *= this.speed;
    this.time += dt;
    const prevT = this.t;
    this.t += dt;
    this.pt += dt;
    if (this.state === 'walk') this.phase += dt * Math.PI * (this.walkSpeed / (0.72 * this.dims.s * this.dims.b.legLen)) * 0.98;
    const ctx: AnimCtx = { s: this.dims.s, hipY: this.dims.hipY, time: this.time, hunch: this.hunch, rnd: this.rnd, walkSpeed: this.walkSpeed, phase: this.phase, dims: this.dims, target: null };
    const out = clip(this.state, this.t, this.pose, ctx);
    // events
    if (out.events && out.dur > 0) {
      const a = prevT % out.dur, b = this.t % out.dur;
      for (const [et, ev] of out.events) if ((a <= et && b > et) || (b < a && (et > a || et <= b))) this.emit(ev, this.state);
    }
    if (this.state === 'walk') {
      // footfalls
      const prevPh = this.phase - dt * Math.PI * (this.walkSpeed / (0.72 * this.dims.s)) * 0.98;
      for (const [side, off] of [['L', 0], ['R', Math.PI]] as const) {
        const f = (x: number) => Math.floor((x + off - 1.35) / (Math.PI * 2));
        if (f(this.phase) !== f(prevPh)) this.emit('step', side);
      }
    }
    if (!out.loop && out.dur > 0 && this.t >= out.dur) { this.play(out.next ?? 'idle'); }
    // crossfade from the previous clip (kept running)
    let P = this.pose;
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeDur);
      clip(this.prev, this.pt, this.prevPose, ctx);
      const w = sm(this.fade);
      const a = this.mixPose.a, A = this.prevPose.a, B = this.pose.a;
      for (let i = 0; i < a.length; i++) a[i] = A[i] + (B[i] - A[i]) * w;
      P = this.mixPose;
    }
    // layered talking: jaw flaps, little head beats
    let jaw = 0;
    if (this.talking && (out.talkable || this.state === 'talk')) {
      const T = this.time;
      const syl = Math.max(0, Math.sin(T * 11 + Math.sin(T * 2.3) * 3)) * (0.5 + 0.5 * Math.max(0, Math.sin(T * 1.7)));
      jaw = 0.02 + syl * 0.11;
      P.add('head', syl * 0.02, 0, 0);
    } else if (this.state === 'flinch') jaw = 0.1 * cl(1 - this.t);
    else if (this.state === 'chop') jaw = 0.04;
    P.add('jaw', jaw);
    this.apply(P);
    this.loopOut = out;
    this.layerLook(dt);
    this.solveIK(P);
    this.fingers(P);
    this.blinker(dt);
  }

  private apply(P: Pose) {
    const a = P.a, b = this.bones;
    for (let i = 0; i < J.length; i++) {
      const bone = b[J[i]];
      _e.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2], 'XZY');
      bone.quaternion.setFromEuler(_e);
    }
    b.hips.position.set(this.dims.off.hips[0] + a[ROOT], this.dims.off.hips[1] + a[ROOT + 1], this.dims.off.hips[2] + a[ROOT + 2]);
  }

  private layerLook(dt: number) {
    const want = this.lookTarget ? 1 : 0;
    this.lookW += (want - this.lookW) * Math.min(1, dt * 3);
    if (this.lookW < 0.01 || !this.lookTarget) return;
    // target in the mesh's space -> yaw / pitch from the head
    this.mesh.updateWorldMatrix(true, false);
    _v.copy(this.lookTarget);
    _m.copy(this.mesh.matrixWorld).invert();
    _v.applyMatrix4(_m);
    framePos(this.bones.head, this.mesh, _v2);
    _v.sub(_v2);
    const yaw = Math.max(-1.2, Math.min(1.2, Math.atan2(_v.x, _v.z)));
    const pitch = Math.max(-0.5, Math.min(0.6, -Math.atan2(_v.y, Math.hypot(_v.x, _v.z))));
    this.lookYaw += (yaw - this.lookYaw) * Math.min(1, dt * 5);
    this.lookPitch += (pitch - this.lookPitch) * Math.min(1, dt * 5);
    const w = this.lookW;
    _q.setFromEuler(_e.set(this.lookPitch * 0.6 * w, this.lookYaw * 0.55 * w, 0, 'XZY'));
    this.bones.head.quaternion.premultiply(_q);
    _q.setFromEuler(_e.set(this.lookPitch * 0.3 * w, this.lookYaw * 0.3 * w, 0, 'XZY'));
    this.bones.neck.quaternion.premultiply(_q);
    _q.setFromEuler(_e.set(0, this.lookYaw * 0.15 * w, 0, 'XZY'));
    this.bones.chest.quaternion.premultiply(_q);
  }

  /** hand IK onto targets (lean, count) or onto the right-hand tool's handle (chop) */
  private solveIK(P: Pose) {
    for (const side of ['L', 'R'] as const) {
      const o = side === 'L' ? IK_L : IK_R;
      const w = P.a[o];
      if (w <= 0.001) continue;
      const tgt = _v4;
      const handQ = _q3;
      const hand = this.bones['hand' + side];
      if (this.state === 'chop' && side === 'L' && this.sockets.R) {
        // the left hand on the handle below the right: target the socket frame offset along its +Y
        this.mesh.updateMatrixWorld(true);
        const sock = this.sockets.R;
        sock.updateWorldMatrix(true, false);
        _m.copy(this.mesh.matrixWorld).invert().multiply(sock.matrixWorld);
        tgt.set(0, this.twoHandOffset, 0).applyMatrix4(_m);
        handQ.setFromRotationMatrix(_m);       // socket frame in mesh space
        // our own socket frame relative to the hand: hand = socketFrame * inv(socketLocal)
        const sl = this.sockets.L;
        if (sl) {
          _q2.copy(sl.quaternion).invert();
          handQ.multiply(_q2);
          // offset the wrist so the left socket lands on the handle point
          _v3.copy(sl.position).applyQuaternion(handQ);
          tgt.sub(_v3);
        }
      } else {
        tgt.set(P.a[o + 1], P.a[o + 2] - this.baseY, P.a[o + 3]);
        frameRot(hand, this.mesh, handQ);   // keep the FK hand orientation
      }
      this.armIK(side, tgt, handQ, w);
    }
  }

  armIK(side: 'L' | 'R', wrist: THREE.Vector3, handQ: THREE.Quaternion, w = 1) {
    const b = this.bones, k = side === 'L' ? 1 : -1;
    const clav = b['clav' + side], uarm = b['uarm' + side], farm = b['farm' + side], ftw = b['ftw' + side], hand = b['hand' + side];
    const base = framePos(uarm, this.mesh, _v);
    const clavQ = frameRot(clav, this.mesh, new THREE.Quaternion());
    const qU = new THREE.Quaternion(), qL = new THREE.Quaternion();
    // the elbow points down, out and back
    const pole = _v2.set(k * 0.6, -1, -0.5).normalize();
    twoBone(base, wrist, pole, this.dims.L.uarm, this.dims.L.farm, qU, qL);
    setFrameRot(uarm, clavQ, qU, w);
    const uQ = frameRot(uarm, this.mesh, new THREE.Quaternion());
    setFrameRot(farm, uQ, qL, w);
    const fQ = frameRot(farm, this.mesh, new THREE.Quaternion());
    // split the wrist's twist about the forearm between the twist bone and the hand
    const rel = _q.copy(fQ).invert().multiply(handQ);
    const tw = twistAboutY(rel);
    ftw.quaternion.setFromAxisAngle(_v3.set(0, 1, 0), tw * 0.65);
    const tQ = _q2.copy(fQ).multiply(ftw.quaternion);
    setFrameRot(hand, tQ, handQ, w);
  }

  private fingers(P: Pose) {
    for (const side of ['L', 'R'] as const) {
      const o = side === 'L' ? GRIP_L : GRIP_R;
      setGrip(this.bones, side, P.a[o], P.a[o + 1], P.a[o + 2], P.a[o + 3], P.a[o + 4]);
    }
  }

  private blinker(dt: number) {
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.16; this.blinkT = 2 + ((this.time * 7.31 + this.rnd * 13) % 4); }
    let k = 0;
    if (this.blink > 0) { this.blink -= dt; k = Math.sin(cl(1 - this.blink / 0.16) * Math.PI); }
    if (this.state === 'flinch' && this.t < 0.5) k = Math.max(k, 0.8);
    this.bones.lids.scale.set(1, 0.02 + 0.98 * k, 1);
  }
}

/** twist angle of q about the local y axis (swing-twist decomposition) */
export function twistAboutY(q: THREE.Quaternion): number {
  const l = Math.hypot(q.y, q.w);
  if (l < 1e-6) return 0;
  return 2 * Math.atan2(q.y / l, q.w / l);
}

const _ax = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
/** finger maximum flexion per phalanx (radians) for a full curl */
const CURL = [1.45, 1.6, 1.15];
/**
 * Curl the fingers and thumb: curl 0 open .. 1 fist, index separately (pointing), thumb 0 open .. 1 wrapped over
 * the fingers, spread fans the fingers, cup bends the palm-side knuckles a little (an offering, open hand).
 */
export function setGrip(b: Record<string, THREE.Bone>, side: 'L' | 'R', curl: number, index: number, thumb: number, spread: number, cup: number) {
  const k = side === 'L' ? 1 : -1;
  const axis = _ax.set(0, 0, -k);
  FINGERS.forEach((f, i) => {
    const c = f === 'ix' ? index : Math.min(1, curl * (1 + i * 0.04));
    const sp = (i - 1.4) * 0.09 * spread;
    for (let seg = 0; seg < 3; seg++) {
      const bone = b[f + (seg + 1) + side];
      const ang = c * CURL[seg] + cup * (seg === 0 ? 0.35 : 0.15);
      _qa.setFromAxisAngle(axis, ang);
      if (seg === 0) { _qb.setFromAxisAngle(_v.set(1, 0, 0), sp); _qa.premultiply(_qb); }
      bone.quaternion.copy(_qa);
    }
  });
  // thumb: opposition swings the whole thumb across the palm (about the hand's long axis), then the two outer
  // joints flex about an axis across the thumb toward the palm
  const d = tdir(k), n: V3 = [-k, 0, 0];
  const flex = norm(cross(d, n));
  const t1 = b['th1' + side], t2 = b['th2' + side], t3 = b['th3' + side];
  _qa.setFromAxisAngle(_v.set(0, -k, 0), 0.25 + thumb * 0.55);
  _qb.setFromAxisAngle(_v2.set(flex[0], flex[1], flex[2]), thumb * 0.35);
  t1.quaternion.copy(_qa).multiply(_qb);
  t2.quaternion.setFromAxisAngle(_v2.set(flex[0], flex[1], flex[2]), 0.1 + thumb * 0.75);
  t3.quaternion.setFromAxisAngle(_v2.set(flex[0], flex[1], flex[2]), 0.1 + thumb * 0.8);
}
