// BIGFOOT: animation clips. A compliant gait (the knees never lock, the body glides low and level), long arms swinging
// against the legs, the shoulders turning against the hips; standing and watching with a slow breathing heave and
// head turns; crouching behind a trunk and peeking round it; a wood-knock with a branch; placing a gift on the ground
// with surprising care; a headlong flight with pumping arms. Legs use IK (L, R feet); arms are FK.
import { type Clip, type Pose, type AnimParams, FOOT, TAU, sin, cos, env, wander, footCycle } from '../animator';
import type { BoneDef } from '../rig';

export const LF = 0, RF = 1;
/** pose channels: 0 prop in the right hand (1 branch, 2 gift), 1 knock strike (a pulse at each impact), 2 gift placed */
export const CH_PROP = 0, CH_KNOCK = 1, CH_PLACE = 2;
/** knock strike times in the knock clip (s), the moment the gift leaves the hand in the gift clip */
export const KNOCKS = [0.75, 1.35, 1.95], PLACE_AT = 2.0;

export function bigfootClips(bones: BoneDef[]): Record<string, Clip> {
  const I = (n: string) => { const k = bones.findIndex((b) => b.name === n); if (k < 0) throw new Error(n); return k; };
  const B = {
    hips: I('hips'), spine: I('spine'), chest: I('chest'), neck: I('neck'), head: I('head'), jaw: I('jaw'),
    cla: [I('claL'), I('claR')], arm: [I('armL'), I('armR')], elb: [I('elbL'), I('elbR')], hand: [I('handL'), I('handR')],
    fing: [I('fingL'), I('fingR')], fing2: [I('fing2L'), I('fing2R')], thumb: [I('thumbL'), I('thumbR')],
    toes: [I('toesL'), I('toesR')],
  };
  const R = (p: Pose, b: number, x: number, y = 0, z = 0) => { p.r[b * 3] += x; p.r[b * 3 + 1] += y; p.r[b * 3 + 2] += z; };
  const foot = (p: Pose, k: number, dx: number, dy: number, dz: number, w = 1, pitch = 0) => { const o = k * FOOT; p.f[o] += dx; p.f[o + 1] += dy; p.f[o + 2] += dz; p.f[o + 3] = w; p.f[o + 4] += pitch; };
  /** arm k (0 L, 1 R): shoulder swing (x, + back), abduction (z, + out), elbow bend, wrist; mirrored for the right */
  const arm = (p: Pose, k: number, swing: number, out: number, elbow: number, wrist = 0, twist = 0) => {
    const s = k === 0 ? 1 : -1;
    R(p, B.arm[k], swing, twist * s, out * s); R(p, B.elb[k], -elbow); R(p, B.hand[k], wrist);
  };
  const grip = (p: Pose, k: number, g: number) => { R(p, B.fing[k], -0.9 * g); R(p, B.fing2[k], -1.1 * g); R(p, B.thumb[k], -0.5 * g, 0, (k ? -0.4 : 0.4) * g); };
  const relaxed = (p: Pose) => { for (let k = 0; k < 2; k++) { R(p, B.fing[k], -0.25); R(p, B.fing2[k], -0.3); } };
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, B.neck, -a.lookPitch * 0.35 * k, a.lookYaw * 0.4 * k); R(p, B.head, -a.lookPitch * 0.45 * k, a.lookYaw * 0.5 * k); };
  const breathe = (p: Pose, t: number, k = 1) => { const b = sin(t * 0.22 * TAU); R(p, B.chest, -0.02 * b * k); R(p, B.cla[0], 0, 0, 0.02 * b * k); R(p, B.cla[1], 0, 0, -0.02 * b * k); };
  /** the standing posture: knees soft, the torso hunched forward over the hips, arms hanging a little forward */
  const stand = (p: Pose) => {
    p.t[1] -= 0.035;
    R(p, B.spine, 0.08); R(p, B.chest, 0.16); R(p, B.neck, -0.1); R(p, B.head, -0.1);
    arm(p, 0, -0.08, 0.02, 0.22); arm(p, 1, -0.08, 0.02, 0.22);
    relaxed(p);
  };

  const clips: Record<string, Clip> = {
    watch: {
      loop: true, dur: 12, fade: 0.8,
      fn: (p, t, a) => {
        stand(p); breathe(p, t);
        const c = t % 12;
        p.t[0] += 0.015 * wander(t * 0.25, 3); p.rr[1] += 0.03 * wander(t * 0.2, 5);
        foot(p, LF, 0, 0, 0.04); foot(p, RF, 0, 0, -0.03);
        // a slow head tilt, the kind that makes the hair on your neck stand up
        const tl = env(c, 5.5, 6.5, 8.0, 9.2);
        R(p, B.head, 0.04 * tl, 0, 0.22 * tl);
        // shifting its weight, a hand flexing
        R(p, B.fing[1], -0.4 * env(c, 9.5, 10, 10.6, 11.2));
        look(p, a, 1);
      },
    },
    walk: {
      loop: true, dur: 1, fade: 0.5,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU, duty = 0.6, A = (1.7 * duty) / 2;
        stand(p);
        for (let k = 0; k < 2; k++) {
          const [dz, l] = footCycle(ph + k * 0.5, duty);
          foot(p, k, 0, l * 0.13, dz * A, 1, l * 0.5 - (dz > 0.6 && l === 0 ? 0.15 : 0));
          // the compliant step: the knee stays bent through the stance, so the body glides
          R(p, B.toes[k], l > 0 ? 0.3 * l : -0.2 * Math.max(0, -dz));
        }
        p.t[1] -= 0.05 + 0.02 * cos(w * 2);
        p.rr[1] += 0.1 * sin(w); p.rr[2] += 0.03 * sin(w);
        R(p, B.chest, 0.02 * cos(w * 2), -0.18 * sin(w)); R(p, B.neck, 0, 0.06 * sin(w)); R(p, B.head, 0.02 * cos(w * 2), 0.04 * sin(w));
        // arms swing against the legs, the elbow lagging the shoulder
        for (let k = 0; k < 2; k++) { const s = k ? 1 : -1; arm(p, k, 0.48 * sin(w) * s + 0.05, 0.05, 0.3 + 0.25 * Math.max(0, -sin(w - 0.4) * s), 0.15 * sin(w - 0.6) * s); }
        look(p, a, 0.5);
      },
    },
    run: {
      loop: true, dur: 1, fade: 0.35,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU, duty = 0.38, A = (3.2 * duty) / 2;
        for (let k = 0; k < 2; k++) {
          const [dz, l] = footCycle(ph + k * 0.5, duty);
          foot(p, k, 0, l * 0.32, dz * A + 0.12, 1, l * 0.8);
        }
        p.t[1] += -0.12 + 0.06 * cos(w * 2 + 0.6); p.t[2] += 0.05;
        p.rr[1] += 0.12 * sin(w);
        R(p, B.spine, 0.22); R(p, B.chest, 0.18, -0.25 * sin(w)); R(p, B.neck, -0.25); R(p, B.head, -0.15);
        for (let k = 0; k < 2; k++) { const s = k ? 1 : -1; arm(p, k, 0.9 * sin(w) * s - 0.1, 0.12, 1.1 + 0.35 * sin(w) * s, 0.1); grip(p, k, 0.6); }
        R(p, B.jaw, 0.15);
        look(p, a, 0.2);
      },
    },
    hide: {
      // crouched low behind a trunk (the trunk is ahead), one hand on the bark, peeking round it now and then
      loop: true, dur: 9, fade: 1.0,
      fn: (p, t, a) => {
        const c = t % 9, side = Math.floor(t / 9) % 2 ? 1 : -1, peek = env(c, 2.5, 3.5, 5.5, 6.6);
        p.t[1] -= 0.55; p.t[2] -= 0.12;
        foot(p, LF, 0.06, 0, 0.12, 1, 0.1); foot(p, RF, -0.06, 0, -0.18, 1, 0.5);
        R(p, B.spine, 0.42, 0, 0.12 * peek * side); R(p, B.chest, 0.32, 0.25 * peek * side, 0.12 * peek * side);
        R(p, B.neck, -0.45, 0.25 * peek * side); R(p, B.head, -0.25, 0.35 * peek * side, 0.08 * side * peek);
        breathe(p, t, 1.4);
        // the hand on the trunk: forward and up, fingers spread round the bark
        arm(p, side > 0 ? 0 : 1, -1.45, 0.08, 0.75, -0.2); grip(p, side > 0 ? 0 : 1, 0.35);
        arm(p, side > 0 ? 1 : 0, -0.55, 0.05, 0.9); relaxed(p);
        look(p, a, 1 - peek * 0.5);
      },
    },
    knock: {
      // a branch in the right hand: raised high and brought down three times against a trunk ahead
      loop: true, dur: 4.2, fade: 0.6,
      fn: (p, t, a) => {
        stand(p);
        const c = t % 4.2;
        let lift = env(c, 0.0, 0.5, 2.1, 2.9);
        let strike = 0;
        for (const k of KNOCKS) { strike = Math.max(strike, env(c, k - 0.2, k, k + 0.02, k + 0.28)); if (Math.abs(c - k) < 0.05) p.c[CH_KNOCK] = 1; }
        lift = Math.min(lift, 1);
        arm(p, 1, -2.5 * lift + 1.5 * strike * lift, 0.25 * lift, 1.0 * lift - 0.6 * strike * lift, 0.4 * strike);
        grip(p, 1, 1);
        R(p, B.chest, -0.06 * lift + 0.1 * strike, -0.12 * lift, 0); R(p, B.spine, 0.05 * strike);
        foot(p, LF, 0, 0, 0.12); foot(p, RF, 0.02, 0, -0.08);
        R(p, B.head, 0.08 * strike, 0.05, 0);
        look(p, a, 0.3);
        p.c[CH_PROP] = 1;
      },
    },
    gift: {
      // squats, sets the gift down on the ground ahead with care, a last look, and rises
      loop: false, dur: 4.4, fade: 0.6, next: 'watch',
      fn: (p, t, a) => {
        const down = env(t, 0.2, 1.3, 2.7, 3.8), reach = env(t, 0.8, 1.7, 2.2, 3.0), open = t > PLACE_AT ? 1 : 0;
        stand(p);
        p.t[1] -= 0.75 * down; p.t[2] -= 0.1 * down;
        foot(p, LF, 0.04, 0, 0.18 * down, 1, 0.1 * down); foot(p, RF, -0.04, 0, -0.18 * down, 1, 0.7 * down);
        R(p, B.spine, 0.4 * down); R(p, B.chest, 0.3 * down); R(p, B.neck, 0.25 * down); R(p, B.head, 0.2 * down);
        arm(p, 1, -1.0 * reach, 0.0, 0.25 + 0.3 * (1 - reach), -0.4 * reach);
        grip(p, 1, 1 - open);
        arm(p, 0, -0.3 * down, 0.15 * down, 0.5 * down);
        if (Math.abs(t - PLACE_AT) < 0.03) p.c[CH_PLACE] = 1;
        p.c[CH_PROP] = t < PLACE_AT ? 2 : 0;
        look(p, a, (1 - down) * 0.6);
      },
    },
  };
  return clips;
}
