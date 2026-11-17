// DINGBAT: animation clips. Local poses only: the roost (dingbat.ts) turns the whole bat (hung head-down by its
// talons, or banked along its flight path) and blends between the two. Bones are FK (no IK legs on a flyer).
//   hang   asleep upside down, wings wrapped round the body like a cloak, head tucked, slow breathing, a twitch
//   wake   eyes snap open, the head swivels owl-fashion, the gape opens in a screech, the wings shiver loose
//   fly    the flap cycle (phase driven): a hard downstroke on spread wings, the hand folded on the upstroke
//   glide  wings held out and trembling, the mouth agape
//   land   a flare (wings thrown forward, braking flaps) folding into the hanging wrap
import { type Clip, type Pose, type AnimParams, TAU, sin, cos, env, wander } from '../animator';
import type { BoneDef } from '../rig';

/** pose channels: 0 jaw opening (0..1), 1 eyelids closed (0..1) */
export const CH_JAW = 0, CH_LID = 1;

export function dingbatClips(bones: BoneDef[]): Record<string, Clip> {
  const I = (n: string) => { const k = bones.findIndex((b) => b.name === n); if (k < 0) throw new Error(n); return k; };
  const B = { head: I('head'), jaw: I('jaw'), tail: I('tail'), arm: [I('armL'), I('armR')], fore: [I('foreL'), I('foreR')], hand: [I('handL'), I('handR')], leg: [I('legL'), I('legR')], foot: [I('footL'), I('footR')] };
  const R = (p: Pose, b: number, x: number, y = 0, z = 0) => { p.r[b * 3] += x; p.r[b * 3 + 1] += y; p.r[b * 3 + 2] += z; };
  /** a wing (k 0 left, 1 right): lift (+ up), sweep (+ back), twist (+ leading edge down), the elbow and wrist folds
   *  (+ folds the wing: the forearm forward, the hand back along it) */
  const wing = (p: Pose, k: number, lift: number, sweep: number, twist: number, fold: number, hand = fold) => {
    const s = k === 0 ? 1 : -1;
    R(p, B.arm[k], twist, sweep * s, lift * s);
    R(p, B.fore[k], 0, -fold * 1.9 * s, -fold * 0.35 * s);
    R(p, B.hand[k], 0, hand * 2.2 * s, fold * 0.2 * s);
  };
  const look = (p: Pose, a: AnimParams, k = 1) => R(p, B.head, -a.lookPitch * 0.6 * k, a.lookYaw * 0.8 * k);
  /** the hanging wrap: wings folded down round the belly, the head turned out from the chest */
  const wrap = (p: Pose, k = 1, breath = 0) => {
    // the arm turned back along the flank with the wing laid flat against it, feathered side out (leading edge low
    // on the belly side, trailing edge up the back), the hand folded back along it
    for (let w = 0; w < 2; w++) wing(p, w, (-1.32 + breath * 0.03) * k, 0.1 * k, 1.57 * k, 0.06 * k, 0.32 * k);
    R(p, B.tail, 0.55 * k);
    for (let w = 0; w < 2; w++) R(p, B.leg[w], 0.15 * k, 0, 0);
  };
  return {
    hang: {
      loop: true, dur: 9, fade: 0.6,
      fn: (p, t, a) => {
        const b = sin(t * 0.45 * TAU);
        wrap(p, 1, b);
        // the head tucked toward the chest (it hangs with its face out), a slow sway on the talons
        R(p, B.head, 1.55 + 0.06 * wander(t * 0.3, 2), 0.12 * wander(t * 0.2, 5), 0.1 * wander(t * 0.25, 1));
        p.rr[2] += 0.05 * wander(t * 0.35, 3); p.rr[0] += 0.03 * wander(t * 0.4, 4);
        // a dreaming twitch of one wing
        const tw = env(t % 9, 6.2, 6.3, 6.45, 6.7);
        R(p, B.hand[0], 0, -0.25 * tw, 0);
        p.c[CH_LID] = 1 - (a.alert ?? 0);
        p.c[CH_JAW] = 0.04 * Math.max(0, b);
      },
    },
    wake: {
      loop: false, dur: 1.1, fade: 0.12, next: 'hang',
      fn: (p, t, a) => {
        const loosen = env(t, 0.25, 0.9, 5, 6), gape = env(t, 0.22, 0.32, 0.8, 1.0), snap = env(t, 0.0, 0.08, 5, 6);
        wrap(p, 1 - 0.55 * loosen);
        // shiver loose
        for (let w = 0; w < 2; w++) R(p, B.arm[w], 0, 0, (w ? -1 : 1) * 0.12 * sin(t * 55) * loosen);
        // the head: out from the chest, swivelling to find the light
        R(p, B.head, 1.55 - 0.65 * snap + 0.1 * sin(t * 30) * gape, (0.6 * env(t, 0.05, 0.2, 0.35, 0.5) - 0.5 * env(t, 0.45, 0.6, 0.75, 0.95)), 0.35 * env(t, 0.05, 0.2, 0.5, 0.7));
        look(p, a, snap * 0.5);
        p.c[CH_LID] = 1 - snap; p.c[CH_JAW] = gape;
        p.t[1] += 0.004 * sin(t * 40) * loosen;
      },
    },
    fly: {
      loop: true, dur: 1, fade: 0.2,
      fn: (p, t, a) => {
        const w = a.phase * TAU, down = cos(w), up = Math.max(0, -sin(w));
        // downstroke on spread wings, the upstroke with the hand folded and swept back
        for (let k = 0; k < 2; k++) wing(p, k, 0.18 + 0.95 * down, 0.12 + 0.25 * up, -0.12 * sin(w), 0.08 + 0.42 * up, 0.12 + 0.6 * up);
        p.t[1] -= 0.008 * down; p.rr[0] += 0.05 * sin(w);
        R(p, B.head, -0.06 * down + 0.05, 0, 0); look(p, a, 0.8);
        R(p, B.tail, -0.1 + 0.1 * down, 0, 0.1 * wander(t, 2));
        for (let k = 0; k < 2; k++) { R(p, B.leg[k], -0.25, 0, 0); R(p, B.foot[k], 0.5, 0, 0); }
        p.c[CH_JAW] = 0.15 + 0.1 * Math.max(0, sin(w * 0.5));
      },
    },
    glide: {
      loop: true, dur: 4, fade: 0.35,
      fn: (p, t, a) => {
        const tr = 0.03 * sin(t * 23), rk = wander(t * 0.8, 3);
        for (let k = 0; k < 2; k++) wing(p, k, 0.16 + tr + (k ? -1 : 1) * 0.06 * rk, 0.1, 0.05, 0.06, 0.08);
        p.rr[2] += 0.1 * rk;
        R(p, B.tail, -0.18, 0, 0.15 * rk); look(p, a, 1);
        for (let k = 0; k < 2; k++) { R(p, B.leg[k], -0.25, 0, 0); R(p, B.foot[k], 0.5, 0, 0); }
        p.c[CH_JAW] = 0.45 + 0.1 * sin(t * 3);
      },
    },
    land: {
      loop: false, dur: 0.85, fade: 0.12, next: 'hang',
      fn: (p, t, a) => {
        const flare = env(t, 0, 0.12, 0.4, 0.62), fold = env(t, 0.42, 0.8, 5, 6);
        const fl = sin(t * 16 * TAU * 0.5);
        for (let k = 0; k < 2; k++) wing(p, k, (0.3 + 0.6 * fl) * flare, -0.45 * flare, 0.35 * flare, 0.1 * flare, 0.15 * flare);
        wrap(p, fold);
        R(p, B.head, 1.2 * fold, 0, 0); look(p, a, 1 - fold);
        for (let k = 0; k < 2; k++) R(p, B.leg[k], 0.35 * flare, 0, 0);
        R(p, B.tail, 0.6 * flare, 0, 0);
        p.c[CH_JAW] = 0.3 * flare;
      },
    },
  };
}
