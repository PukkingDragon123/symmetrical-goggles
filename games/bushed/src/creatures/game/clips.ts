// GAME ANIMALS: animation clips for the cervids (white-tailed deer, moose). Each clip writes a pose (../animator.ts):
// local Euler rotations of the spine, neck, head, jaw, ears and tail, a root offset and rotation, and per leg a foot
// target (FL, FR, HL, HR: an offset from the rest hoof, model space), an IK weight and the cannon's pitch (negative
// folds the cannon back: the carpus or the fetlock flexing as the hoof lifts). Gaits share the gait phase.
// The ears and the tail carry the mood: ears pricked toward a sound, swivelling while grazing, pinned back in flight;
// the white-tail's flag thrown up as it bounds away, flicking as it feeds.
// Pose parameters (AnimParams): speed, phase, lookYaw/lookPitch, and 'ear' (-1 back .. 1 pricked), 'earYaw'
// (turn toward a sound, + left), 'flag' (0..1 tail raised), 'chew' (0..1), 'scale' (body size: 1 deer, ~1.9 moose).
import { type Clip, type Pose, type AnimParams, FOOT, TAU, sin, cos, env, wander, footCycle } from '../animator';
import type { BoneDef } from '../rig';

export const FL = 0, FR = 1, HL = 2, HR = 3;
/** free pose channels: 0 blink */
export const CH_BLINK = 0;

export function cervidClips(bones: BoneDef[], species: 'deer' | 'moose'): Record<string, Clip> {
  const I = (n: string) => bones.findIndex((b) => b.name === n);
  const B = {
    root: 0, chest: I('chest'), neck: I('neck'), neck2: I('neck2'), head: I('head'), jaw: I('jaw'), loin: I('loin'), pelvis: I('pelvis'),
    ear: [I('earL'), I('earR')], tail: [0, 1, 2].map((k) => I('tail' + k)),
    fu: [I('fuL'), I('fuR')], hu: [I('huL'), I('huR')], fl: [I('flL'), I('flR')], hl: [I('hlL'), I('hlR')],
  };
  const deer = species === 'deer';
  /** body scale: moose clips move twice as far */
  const K = deer ? 1 : 1.9;
  const R = (p: Pose, b: number, x: number, y = 0, z = 0) => { if (b < 0) return; p.r[b * 3] += x; p.r[b * 3 + 1] += y; p.r[b * 3 + 2] += z; };
  const foot = (p: Pose, k: number, dx: number, dy: number, dz: number, w = 1, pitch = 0) => { const o = k * FOOT; p.f[o] += dx; p.f[o + 1] += dy; p.f[o + 2] += dz; p.f[o + 3] = w; p.f[o + 4] += pitch; };
  /** the ears: pricked forward (+) or pinned back (-), turned toward a sound (yaw, + left), a twitch now and then */
  const ears = (p: Pose, t: number, a: AnimParams, o: { prick?: number; swivel?: number; droop?: number } = {}) => {
    const pr = o.prick ?? a.ear ?? 0, yw = a.earYaw ?? 0, sw = o.swivel ?? 0.3;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1;
      // each ear swivels on its own: one listens forward while the other turns back
      const own = sw * wander(t * 0.7, s * 3.1) + (sin(t * 0.37 + s * 2) > 0.92 ? 0.35 * sin(t * 40) : 0);
      R(p, B.ear[s], pr * 0.55 - (o.droop ?? 0) * 0.2, (yw * 0.8 + own) * (1 + 0.2 * side), side * (pr < 0 ? pr * 0.5 : -(o.droop ?? 0) * 0.4));
    }
  };
  /** the tail: flicking side to side, lifted (flag) */
  const tail = (p: Pose, t: number, a: AnimParams, o: { flick?: number; lift?: number } = {}) => {
    const fl = o.flick ?? 0.15, lift = Math.max(o.lift ?? 0, a.flag ?? 0);
    const sw = fl * sin(t * 7.5) * (sin(t * 0.9) > 0.4 ? 1 : 0.15);
    B.tail.forEach((b, k) => R(p, b, lift * (k === 0 ? (deer ? 1.9 : 0.6) : k === 1 ? 0.5 : 0.2) - (k === 2 && lift > 0.5 ? 0.3 : 0), 0, sw * (1 + k * 0.5)));
  };
  const breathe = (p: Pose, t: number, rate = 0.3, k = 1) => { const b = sin(t * rate * TAU); R(p, B.chest, -0.01 * b * k); p.t[1] += 0.003 * b * k * K; };
  const lookAt = (p: Pose, a: AnimParams, k = 1) => {
    R(p, B.neck, -a.lookPitch * 0.3 * k, a.lookYaw * 0.3 * k);
    R(p, B.neck2, -a.lookPitch * 0.3 * k, a.lookYaw * 0.35 * k);
    R(p, B.head, -a.lookPitch * 0.4 * k, a.lookYaw * 0.35 * k);
  };
  const chew = (p: Pose, t: number, k: number) => { if (k > 0) R(p, B.jaw, (0.06 + 0.05 * sin(t * 9)) * k * (sin(t * 9) > 0 ? 1 : 0.3), 0.03 * sin(t * 4.5) * k); };
  /** a gait: per-leg phase offsets, duty, stride (m per cycle), lift (m), how much the cannon folds */
  const gait = (p: Pose, ph: number, off: number[], duty: number, stride: number, lift: number, fold = 1) => {
    const A = (stride * duty) / 2;
    for (let k = 0; k < 4; k++) {
      const [dz, l] = footCycle(ph + off[k], duty);
      const hind = k >= 2;
      // the hoof lifts and folds back under the knee in the swing, reaching forward at the end of it
      foot(p, k, 0, l * lift * (hind ? 0.9 : 1.1), dz * A + (hind ? 0 : l * lift * 0.25), 1, -l * (hind ? 0.9 : 1.6) * fold);
    }
  };

  const clips: Record<string, Clip> = {
    // ------------------------------------------------------------------------------------- standing
    idle: {
      loop: true, dur: 8, fade: 0.5,
      fn: (p, t, a) => {
        const c = t % 8;
        breathe(p, t);
        p.rr[1] += 0.02 * wander(t * 0.3, 2);
        // a look round, a head shake against the flies, ears never still
        const gl = env(c, 2.2, 2.7, 3.6, 4.2), sh = env(c, 6.2, 6.3, 6.5, 6.7);
        R(p, B.neck, -0.05, 0.4 * gl * (Math.floor(t / 8) % 2 ? 1 : -1)); R(p, B.head, 0.05, 0.2 * gl, 0.25 * sin(t * 30) * sh);
        lookAt(p, a, 1 - gl);
        ears(p, t, a, { swivel: 0.35 });
        tail(p, t, a, { flick: 0.25 });
        chew(p, t, a.chew ?? 0);
        // weight shifts
        const st = env(c, 5.0, 5.2, 5.3, 5.5);
        foot(p, HL, 0, 0.04 * st * K, 0.03 * st * K, 1, -0.4 * st);
      },
    },
    graze: {
      // head down in the browse (a moose strips twigs at chest height), stepping on now and then, the ears turning
      loop: true, dur: 9, fade: 0.8,
      fn: (p, t, a) => {
        const c = t % 9;
        breathe(p, t, 0.25);
        const up = env(c, 5.6, 6.1, 6.9, 7.5); // the head comes up to look round, chewing, then goes back down
        const down = 1 - up;
        if (deer) {
          R(p, B.chest, 0.28 * down); R(p, B.neck, 0.62 * down - 0.05 * up); R(p, B.neck2, 0.32 * down); R(p, B.head, 0.3 * down);
          p.t[1] -= 0.035 * down; p.rr[0] += 0.05 * down;
          // nibbling: small jerks of the head as it crops
          R(p, B.head, down * 0.06 * Math.max(0, sin(t * 6)) * (sin(t * 0.8) > 0 ? 1 : 0), down * 0.08 * sin(t * 1.3));
          foot(p, FL, 0, 0, -0.05 * down); foot(p, FR, 0, 0, 0.03 * down);
        } else {
          // browsing a willow at shoulder height: the head turns and tugs
          R(p, B.neck, 0.15 * down, 0.35 * down * sin(t * 0.25)); R(p, B.neck2, 0.1 * down); R(p, B.head, -0.25 * down + down * 0.12 * Math.max(0, sin(t * 3.2)), 0, 0.1 * down * sin(t * 1.6));
        }
        lookAt(p, a, up);
        ears(p, t, a, { swivel: 0.45, droop: down * 0.3 });
        tail(p, t, a, { flick: 0.3 });
        chew(p, t, deer ? Math.max(up, down * 0.6) : 0.8);
        // a step forward to the next mouthful
        const s1 = env(c, 3.0, 3.25, 3.3, 3.55), s2 = env(c, 3.4, 3.65, 3.7, 3.95);
        foot(p, FL, 0, 0.05 * s1 * K, 0.08 * s1 * K, 1, -0.8 * s1); foot(p, FR, 0, 0.05 * s2 * K, 0.08 * s2 * K, 1, -0.8 * s2);
      },
    },
    alert: {
      // stock still, the neck up, the head high, the ears locked on the sound; a slow blink, the nostrils working
      loop: true, dur: 6, fade: 0.25,
      fn: (p, t, a) => {
        R(p, B.chest, -0.06); R(p, B.neck, -0.22); R(p, B.neck2, -0.1); R(p, B.head, 0.12);
        p.t[1] += 0.01 * K;
        lookAt(p, a, 1);
        ears(p, t, a, { prick: Math.max(0.8, a.ear ?? 0.8), swivel: 0.05 });
        tail(p, t, a, { flick: 0.05, lift: deer ? 0.25 : 0 });
        // a head bob now and then: the white-tail's trick to make a still hunter move
        const bob = env(t % 6, 3.0, 3.25, 3.35, 3.7);
        R(p, B.neck, 0.5 * bob); R(p, B.head, 0.3 * bob);
        R(p, B.head, 0, 0, 0.04 * sin(t * 0.7));
      },
    },
    stomp: {
      // the foreleg stamped hard, twice: an alarm and a dare
      loop: false, dur: 1.4, fade: 0.12, next: 'alert',
      fn: (p, t, a) => {
        R(p, B.chest, -0.06); R(p, B.neck, -0.18); R(p, B.head, 0.12);
        lookAt(p, a, 1);
        ears(p, t, a, { prick: 1, swivel: 0 });
        tail(p, t, a, { lift: 0.4 });
        const s = env(t, 0.05, 0.22, 0.26, 0.32) + env(t, 0.62, 0.8, 0.84, 0.9);
        foot(p, FR, 0, 0.13 * s * K, 0.04 * s * K, 1, -1.0 * s);
        R(p, B.chest, 0.04 * s);
      },
    },
    snort: {
      // the blow: the head jerks down and up as the air goes out through the nose
      loop: false, dur: 1.0, fade: 0.1, next: 'alert',
      fn: (p, t, a) => {
        R(p, B.neck, -0.2); R(p, B.head, 0.1);
        lookAt(p, a, 1);
        const j = env(t, 0.0, 0.08, 0.14, 0.4);
        R(p, B.neck, 0.18 * j); R(p, B.head, 0.25 * j); R(p, B.jaw, 0.04 * j);
        ears(p, t, a, { prick: 1, swivel: 0 });
        tail(p, t, a, { lift: 0.6 });
        R(p, B.chest, -0.03 * j);
      },
    },
    call: {
      // a moose's call (or a buck's grunt): the head stretched up and out, the jaw dropping
      loop: false, dur: 2.4, fade: 0.25, next: 'idle',
      fn: (p, t, a) => {
        const k = env(t, 0.1, 0.5, 1.8, 2.3);
        R(p, B.neck, -0.25 * k); R(p, B.neck2, -0.1 * k); R(p, B.head, -0.45 * k);
        R(p, B.jaw, (0.12 + 0.04 * sin(t * 11)) * env(t, 0.4, 0.55, 1.7, 1.9));
        ears(p, t, a, { prick: -0.4 * k, swivel: 0.05 });
        tail(p, t, a, {});
        breathe(p, t, 0.5, 2);
      },
    },
    // ------------------------------------------------------------------------------------- gaits
    walk: {
      loop: true, dur: 1, fade: 0.35,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0.25, 0.75, 0.0, 0.5], 0.66, 0.95 * K, 0.075 * K, 1);
        p.t[1] += 0.008 * K * cos(w * 2); p.rr[1] += 0.03 * sin(w); p.rr[2] += 0.025 * sin(w + 0.8);
        // the head nods with each forefoot's step
        R(p, B.neck, 0.08 + 0.05 * cos(w * 2 + 0.6)); R(p, B.head, -0.04 * cos(w * 2 + 0.6));
        R(p, B.pelvis, 0, -0.04 * sin(w - 1), 0.03 * sin(w));
        lookAt(p, a, 0.6);
        ears(p, t, a, { swivel: 0.25 });
        tail(p, t, a, { flick: 0.2 });
      },
    },
    trot: {
      loop: true, dur: 1, fade: 0.25,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0, 0.5, 0.5, 0], 0.5, 1.5 * K, 0.13 * K, 1.2);
        p.t[1] += 0.02 * K * cos(w * 2 + 0.4); p.rr[0] += 0.02 * sin(w * 2);
        R(p, B.neck, -0.05 + 0.04 * cos(w * 2 + 1)); R(p, B.head, 0.06 - 0.04 * cos(w * 2 + 1));
        lookAt(p, a, 0.3);
        ears(p, t, a, { prick: a.ear ?? 0.4, swivel: 0.1 });
        tail(p, t, a, { lift: deer ? 0.4 : 0.15, flick: 0.1 });
      },
    },
    bound: {
      // the deer's escape: long bounds, the spine coiling and stretching, the flag up and swinging
      loop: true, dur: 1, fade: 0.2,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0.55, 0.62, 0.0, 0.07], 0.3, 3.4 * K, 0.3 * K, 1.4);
        const flex = sin(w + 2.4);
        R(p, B.loin, 0.16 * flex); R(p, B.pelvis, 0.14 * flex); R(p, B.chest, -0.1 * flex);
        // airborne between bounds: the body rises
        p.t[1] += (0.09 * Math.max(0, sin(w + 0.9)) + 0.02) * K; p.rr[0] += 0.12 * sin(w + 0.4);
        foot(p, HL, 0, 0, 0.16 * flex * K); foot(p, HR, 0, 0, 0.16 * flex * K);
        foot(p, FL, 0, 0, -0.12 * flex * K); foot(p, FR, 0, 0, -0.12 * flex * K);
        R(p, B.neck, -0.15 - 0.1 * flex); R(p, B.head, 0.1 + 0.08 * flex);
        lookAt(p, a, 0.15);
        ears(p, t, a, { prick: -0.6, swivel: 0 });
        tail(p, t, a, { lift: deer ? 1 : 0.3, flick: deer ? 0.35 : 0.05 });
      },
    },
    gallop: {
      loop: true, dur: 1, fade: 0.25,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0.5, 0.6, 0.0, 0.1], 0.38, 2.6 * K, 0.2 * K, 1.3);
        const flex = sin(w + 2.4);
        R(p, B.loin, 0.1 * flex); R(p, B.pelvis, 0.08 * flex); R(p, B.chest, -0.06 * flex);
        p.t[1] += 0.04 * K * sin(w * 2 + 1); p.rr[0] += 0.06 * sin(w + 0.4);
        R(p, B.neck, 0.05 - 0.08 * flex); R(p, B.head, -0.05 + 0.06 * flex);
        lookAt(p, a, 0.2);
        ears(p, t, a, { prick: -0.5, swivel: 0 });
        tail(p, t, a, { lift: deer ? 0.8 : 0.2 });
      },
    },
    limp: {
      // wounded: hunched, the head low, a hitch in the stride, the tail clamped down
      loop: true, dur: 1, fade: 0.4,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0.25, 0.75, 0.0, 0.5], 0.7, 0.85 * K, 0.06 * K, 0.8);
        R(p, B.loin, -0.12); R(p, B.chest, 0.05); R(p, B.neck, 0.25); R(p, B.head, 0.05);
        p.t[1] -= 0.02 * K; p.rr[2] += 0.05 * sin(w);
        foot(p, HR, 0, -0.04 * Math.max(0, sin(w)) * K, 0, 1, 0);
        ears(p, t, a, { prick: -0.3, droop: 0.6, swivel: 0.05 });
        tail(p, t, a, { lift: 0, flick: 0 });
        R(p, B.tail[0], -0.3);
      },
    },
    kick: {
      // the heart-shot buck: hind legs thrown up, a hunched lurch, away
      loop: false, dur: 0.7, fade: 0.05, next: 'bound',
      fn: (p, t, a) => {
        const k = env(t, 0.0, 0.12, 0.25, 0.6);
        p.rr[0] += 0.3 * k; p.t[1] += 0.05 * k * K;
        foot(p, HL, 0, 0.35 * k * K, -0.3 * k * K, 1, -1.3 * k); foot(p, HR, 0, 0.32 * k * K, -0.28 * k * K, 1, -1.2 * k);
        R(p, B.loin, -0.2 * k); R(p, B.neck, 0.2 * k);
        ears(p, t, a, { prick: -0.8 }); tail(p, t, a, { lift: 0 });
      },
    },
    flinch: {
      loop: false, dur: 0.5, fade: 0.05, next: 'alert',
      fn: (p, t, a) => {
        const k = env(t, 0, 0.06, 0.15, 0.45);
        p.t[1] += 0.03 * k * K; p.rr[0] -= 0.1 * k; R(p, B.neck, -0.2 * k);
        foot(p, FL, 0, 0.1 * k * K, -0.05 * k, 1, -1 * k); foot(p, FR, 0, 0.1 * k * K, -0.05 * k, 1, -1 * k);
        ears(p, t, a, { prick: 1 }); tail(p, t, a, { lift: 0.8 });
      },
    },
    // ------------------------------------------------------------------------------------- down
    death: {
      // the legs paddling as it goes over (the animal applies the fall itself)
      loop: false, dur: 3.5, fade: 0.15,
      fn: (p, t) => {
        const k = Math.max(0, 1 - t / 3.2);
        for (let s = 0; s < 2; s++) {
          R(p, B.fu[s], 0.5 * sin(t * 9 + s) * k * (t > 0.8 ? 1 : 0)); R(p, B.hu[s], -0.6 * sin(t * 8 + s * 2) * k * (t > 0.8 ? 1 : 0));
          R(p, B.fl[s], 0.3 + 0.3 * sin(t * 9 + s) * k); R(p, B.hl[s], -0.4 + 0.3 * sin(t * 8 + s) * k);
        }
        R(p, B.jaw, 0.05);
        for (let k2 = 0; k2 < 4; k2++) p.f[k2 * FOOT + 3] = 0;
      },
    },
    dead: {
      loop: true, dur: 10, fade: 0.6,
      fn: (p) => {
        for (let s = 0; s < 2; s++) { R(p, B.fu[s], 0.25 + s * 0.15); R(p, B.fl[s], 0.35 + s * 0.2); R(p, B.hu[s], -0.25 - s * 0.2); R(p, B.hl[s], -0.35); }
        R(p, B.jaw, 0.08);
        B.tail.forEach((b) => R(p, b, -0.15));
        for (let k = 0; k < 4; k++) p.f[k * FOOT + 3] = 0;
      },
    },
  };
  return clips;
}
