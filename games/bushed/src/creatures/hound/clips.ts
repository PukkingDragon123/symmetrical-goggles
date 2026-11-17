// THE AXEHANDLE HOUND: animation clips. Each writes a pose (animator.ts): local Euler rotations of the spine, head,
// jaw and tail bones, a root offset and rotation, and foot targets for the leg IK (FL, FR, HL, HR: offsets from the
// rest foot, model space). Gaits share the creature's gait phase so walk, trot and run cross-fade in step. The long
// body is the character: it sways through the walk, flexes like a spring in the bounding run, wags from the
// shoulders back when happy and curls nose to tail by the stove.
import { type Clip, type Pose, type AnimParams, FOOT, TAU, sin, cos, ease, env, wander, footCycle } from '../animator';
import type { BoneDef } from '../rig';

export const FL = 0, FR = 1, HL = 2, HR = 3;
/** pose channels: 0 blink (0 open .. 1 shut), 1 eye shine boost, 2 sniff (nostril flare for sound cues) */
export const CH_BLINK = 0, CH_SHINE = 1;

export function houndClips(bones: BoneDef[]): Record<string, Clip> {
  const I = (n: string) => bones.findIndex((b) => b.name === n);
  const B = {
    chest: I('chest'), neck: I('neck'), neck2: I('neck2'), head: I('head'), jaw: I('jaw'), loin: I('loin'), pelvis: I('pelvis'),
    tail: [0, 1, 2, 3, 4, 5].map((k) => I('tail' + k)),
    fu: [I('fuL'), I('fuR')], fl: [I('flL'), I('flR')], ff: [I('ffL'), I('ffR')],
    hu: [I('huL'), I('huR')], hl: [I('hlL'), I('hlR')], hm: [I('hmL'), I('hmR')], hf: [I('hfL'), I('hfR')],
  };
  const R = (p: Pose, b: number, x: number, y = 0, z = 0) => { p.r[b * 3] += x; p.r[b * 3 + 1] += y; p.r[b * 3 + 2] += z; };
  const foot = (p: Pose, k: number, dx: number, dy: number, dz: number, w = 1, pitch = 0) => { const o = k * FOOT; p.f[o] += dx; p.f[o + 1] += dy; p.f[o + 2] += dz; p.f[o + 3] = w; p.f[o + 4] += pitch; };
  /** a whip of the tail: each bone lags the one before; yaw wave, lift and droop */
  const tail = (p: Pose, t: number, o: { amp: number; freq: number; lift: number; lag?: number; grow?: number; droop?: number; base?: number }) => {
    const lag = o.lag ?? 0.55, grow = o.grow ?? 0.35;
    B.tail.forEach((b, k) => {
      const a = o.amp * (1 + k * grow) * 0.38;
      R(p, b, (k === 0 ? o.lift : 0) - (o.droop ?? 0.06) * k * 0.4 + (k === 0 ? 0 : o.lift * 0.08), (o.base ?? 0) * (k < 2 ? 1 : 0.3) + a * sin(t * o.freq * TAU - k * lag), 0);
    });
  };
  /** the gentle life every pose has: breathing in the chest */
  const breathe = (p: Pose, t: number, rate = 0.32, k = 1) => { const b = sin(t * rate * TAU); R(p, B.chest, -0.012 * b * k); p.t[1] += 0.002 * b * k; };
  /** a gait: per-leg phase offsets, duty, stride (m per cycle) and lift */
  const gait = (p: Pose, ph: number, off: number[], duty: number, stride: number, lift: number, liftH = 1) => {
    const A = (stride * duty) / 2;
    for (let k = 0; k < 4; k++) {
      const [dz, l] = footCycle(ph + off[k], duty);
      const hind = k >= 2;
      foot(p, k, 0, l * lift * (hind ? liftH : 1), dz * A, 1, hind ? -l * 0.5 : l * 0.9);
    }
  };
  const lookAt = (p: Pose, a: AnimParams, k = 1) => {
    // turn the head and neck toward the look target (the controller computes yaw/pitch relative to the body)
    R(p, B.neck, -a.lookPitch * 0.25 * k, a.lookYaw * 0.3 * k);
    R(p, B.neck2, -a.lookPitch * 0.3 * k, a.lookYaw * 0.3 * k);
    R(p, B.head, -a.lookPitch * 0.45 * k, a.lookYaw * 0.4 * k);
  };

  const clips: Record<string, Clip> = {
    // ------------------------------------------------------------------------------------- standing about
    idle: {
      loop: true, dur: 9, fade: 0.5,
      fn: (p, t, a) => {
        const c = t % 9, side = Math.floor(t / 9) % 2 ? 1 : -1;
        breathe(p, t);
        p.t[0] += 0.006 * wander(t * 0.5, 1);
        p.rr[1] += 0.03 * wander(t * 0.3, 2);
        // a sniffing burst: the nose drops to the air near the ground, quick twitches
        const sn = env(c, 1.2, 1.7, 3.0, 3.6);
        R(p, B.neck, 0.32 * sn); R(p, B.neck2, 0.12 * sn); R(p, B.head, 0.18 * sn + sn * 0.035 * sin(t * 34) * (sin(t * 5) > 0 ? 1 : 0));
        R(p, B.jaw, sn * 0.02 * Math.max(0, sin(t * 34)));
        // a head tilt (no ears to cock, so the whole axe head cants over), then back
        const tl = env(c, 4.2, 4.6, 5.8, 6.4);
        R(p, B.head, -0.06 * tl, 0.12 * tl * side, 0.42 * tl * side); R(p, B.neck2, 0, 0.08 * tl * side);
        // a glance round
        const gl = env(c, 7.0, 7.4, 8.2, 8.7);
        R(p, B.neck, 0, 0.35 * gl * -side); R(p, B.head, 0, 0.25 * gl * -side);
        lookAt(p, a, 1 - Math.max(sn, tl, gl));
        tail(p, t, { amp: 0.22, freq: 0.45, lift: -0.05 });
        // weight shifts: a forefoot resettles now and then
        const st = env(c, 6.5, 6.7, 6.8, 7.0);
        foot(p, side > 0 ? FL : FR, 0, 0.03 * st, 0.02 * st);
      },
    },
    // ------------------------------------------------------------------------------------- gaits
    walk: {
      loop: true, dur: 1, fade: 0.35,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0.25, 0.75, 0, 0.5], 0.64, 0.46, 0.055);
        p.t[1] += -0.004 + 0.007 * cos(w * 2);
        p.rr[1] += 0.035 * sin(w); p.rr[2] += 0.02 * sin(w + 0.8);
        // the long body snakes: the loin and hips swing against the shoulders
        R(p, B.chest, 0, -0.04 * sin(w + 0.4)); R(p, B.loin, 0, -0.05 * sin(w - 0.5)); R(p, B.pelvis, 0, -0.04 * sin(w - 1.0), 0.03 * sin(w));
        R(p, B.neck, 0.05 + 0.035 * cos(w * 2 + 0.6), 0.03 * sin(w + 1.5)); R(p, B.head, -0.03 - 0.03 * cos(w * 2 + 0.6));
        lookAt(p, a, 0.6);
        tail(p, t, { amp: 0.3, freq: 1, lift: 0.08, lag: 0.7 });
        breathe(p, t, 0.5, 0.5);
      },
    },
    trot: {
      loop: true, dur: 1, fade: 0.3,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0, 0.5, 0.5, 0], 0.46, 0.64, 0.075, 1.1);
        p.t[1] += 0.004 + 0.012 * cos(w * 2 + 0.5);
        p.rr[0] += 0.015 * sin(w * 2); p.rr[2] += 0.025 * sin(w);
        R(p, B.loin, 0, -0.03 * sin(w)); R(p, B.pelvis, 0, -0.03 * sin(w - 0.6));
        R(p, B.neck, 0.1 + 0.03 * cos(w * 2 + 1.2)); R(p, B.head, -0.06 - 0.04 * cos(w * 2 + 1.2));
        lookAt(p, a, 0.4);
        tail(p, t, { amp: 0.2, freq: 2, lift: 0.18, lag: 0.6 });
      },
    },
    run: {
      // a bounding gallop: the long spine gathers and stretches like a spring with every bound
      loop: true, dur: 1, fade: 0.25,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0.52, 0.6, 0.0, 0.08], 0.34, 1.0, 0.11, 0.9);
        // gathered when the hind feet reach under (ph ~ 0.8), stretched as they push off (ph ~ 0.3)
        const flex = sin(w + 2.4);
        R(p, B.loin, 0.2 * flex); R(p, B.pelvis, 0.16 * flex); R(p, B.chest, -0.1 * flex);
        p.t[1] += 0.03 * sin(w * 2 + 1.0) + 0.012; p.rr[0] += 0.07 * sin(w + 0.4);
        // a gathered spine pulls the hind feet under the belly, a stretched one throws them back
        foot(p, HL, 0, 0, 0.09 * flex); foot(p, HR, 0, 0, 0.09 * flex);
        foot(p, FL, 0, 0, -0.06 * flex); foot(p, FR, 0, 0, -0.06 * flex);
        R(p, B.neck, 0.22 - 0.12 * flex); R(p, B.neck2, 0.08); R(p, B.head, -0.18 + 0.08 * flex);
        R(p, B.jaw, 0.08 + 0.04 * sin(w * 2));
        lookAt(p, a, 0.25);
        tail(p, t, { amp: 0.12, freq: 2.4, lift: -0.12, lag: 0.9, droop: -0.05 });
      },
    },
    stalk: {
      // low, slow, deliberate: the body sinks, the head drops level with the back, the tail held straight out
      loop: true, dur: 1, fade: 0.6,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU;
        gait(p, ph, [0.25, 0.75, 0, 0.5], 0.76, 0.32, 0.04);
        p.t[1] += -0.075 + 0.003 * cos(w * 2); p.t[2] -= 0.01;
        p.rr[0] += 0.04; p.rr[1] += 0.02 * sin(w);
        R(p, B.loin, 0, -0.03 * sin(w - 0.5)); R(p, B.pelvis, 0, -0.03 * sin(w - 1));
        R(p, B.neck, 0.5, 0.02 * sin(t * 0.7)); R(p, B.neck2, 0.15); R(p, B.head, -0.42);
        lookAt(p, a, 0.8);
        tail(p, t, { amp: 0.03, freq: 0.3, lift: -0.18, droop: -0.02 });
        // the tip twitches
        R(p, B.tail[5], 0, 0.25 * Math.max(0, sin(t * 2.3)) * sin(t * 18));
        breathe(p, t, 0.4, 0.4);
      },
    },
    // ------------------------------------------------------------------------------------- threat
    snarl: {
      loop: true, dur: 1, fade: 0.3,
      fn: (p, t, a) => {
        p.t[1] -= 0.055; p.t[2] -= 0.04; p.rr[0] += 0.07;
        // a deep tremble through the body, the head low and thrust out, the jaw parted on the teeth
        const tr = sin(t * 38) * 0.5 + sin(t * 23) * 0.5;
        p.t[0] += 0.0015 * tr; R(p, B.chest, 0.004 * tr);
        R(p, B.neck, 0.42 + 0.02 * sin(t * 1.3)); R(p, B.neck2, 0.05); R(p, B.head, -0.38 + 0.015 * tr);
        R(p, B.jaw, 0.2 + 0.035 * sin(t * 2.1) + 0.01 * tr);
        foot(p, FL, 0.02, 0, 0.05); foot(p, FR, -0.02, 0, 0.05); foot(p, HL, 0, 0, -0.03); foot(p, HR, 0, 0, -0.03);
        lookAt(p, a, 1);
        tail(p, t, { amp: 0.02, freq: 0.5, lift: -0.25 });
        p.c[CH_SHINE] = 1;
      },
    },
    lunge: {
      // a feint: gather, explode forward, snap at nothing, check, back off
      loop: false, dur: 1.5, fade: 0.12, next: 'snarl',
      fn: (p, t, a) => {
        const gather = env(t, 0, 0.22, 0.24, 0.36), go = env(t, 0.24, 0.42, 0.62, 1.2), snap = env(t, 0.42, 0.5, 0.56, 0.64);
        p.t[1] += -0.06 * gather + 0.035 * go; p.t[2] += -0.08 * gather + 0.34 * go;
        p.rr[0] += 0.12 * gather - 0.08 * go;
        R(p, B.loin, 0.16 * gather - 0.12 * go); R(p, B.pelvis, 0.12 * gather - 0.08 * go);
        R(p, B.neck, 0.4 * gather - 0.3 * go); R(p, B.neck2, 0.1 * gather - 0.15 * go); R(p, B.head, -0.3 * gather + 0.25 * go);
        // the jaw gapes wide on the way in and slams shut
        const open = env(t, 0.1, 0.38, 0.44, 0.5) * 0.62;
        R(p, B.jaw, open + 0.06 * (1 - snap));
        R(p, B.head, 0.12 * snap, 0, 0.1 * snap * sin(t * 50));
        // the forefeet reach out, the hind feet drive
        const reach = env(t, 0.26, 0.42, 0.7, 1.1);
        foot(p, FL, 0, 0.07 * env(t, 0.26, 0.34, 0.36, 0.48), 0.3 * reach); foot(p, FR, 0, 0.07 * env(t, 0.3, 0.38, 0.4, 0.52), 0.26 * reach);
        foot(p, HL, 0, 0.03 * env(t, 0.3, 0.4, 0.42, 0.55), 0.1 * reach); foot(p, HR, 0, 0.03 * env(t, 0.32, 0.42, 0.44, 0.57), 0.08 * reach);
        lookAt(p, a, 1 - go);
        tail(p, t, { amp: 0.05, freq: 1, lift: -0.2 + 0.25 * go });
        p.c[CH_SHINE] = 1;
      },
    },
    bark: {
      loop: false, dur: 0.55, fade: 0.1, next: 'alert',
      fn: (p, t, a) => {
        const b = env(t, 0.02, 0.1, 0.16, 0.34);
        p.t[1] += 0.02 * b; p.t[2] += 0.02 * b; p.rr[0] -= 0.05 * b;
        R(p, B.neck, -0.12 * b); R(p, B.head, -0.15 * b); R(p, B.jaw, 0.42 * env(t, 0.03, 0.09, 0.15, 0.26));
        foot(p, FL, 0, 0.025 * env(t, 0.0, 0.06, 0.08, 0.2), 0);
        lookAt(p, a, 1);
        tail(p, t, { amp: 0.25, freq: 3, lift: 0.3 });
      },
    },
    alert: {
      // standing tall, the head up and still, the tail high: something is out there
      loop: true, dur: 1, fade: 0.35,
      fn: (p, t, a) => {
        breathe(p, t, 0.45);
        p.t[1] += 0.01; p.rr[0] -= 0.03;
        R(p, B.neck, -0.16); R(p, B.neck2, -0.05); R(p, B.head, 0.1);
        lookAt(p, a, 1);
        tail(p, t, { amp: 0.06, freq: 0.6, lift: 0.4 });
        foot(p, FL, 0, 0, 0.03);
      },
    },
    flinch: {
      loop: false, dur: 1.1, fade: 0.06, next: 'idle',
      fn: (p, t) => {
        const k = env(t, 0, 0.08, 0.35, 1.05), q = env(t, 0, 0.05, 0.12, 0.3);
        p.t[1] -= 0.06 * k; p.t[2] -= 0.09 * k; p.rr[1] += 0.28 * k; p.rr[2] += 0.06 * k;
        R(p, B.neck, 0.25 * k, -0.35 * k); R(p, B.neck2, 0.1 * k, -0.2 * k); R(p, B.head, 0.25 * k, -0.4 * k, -0.25 * k);
        R(p, B.chest, 0.02 * q * sin(t * 60));
        foot(p, FL, 0, 0.04 * q, -0.05 * k); foot(p, FR, 0, 0.02 * q, -0.06 * k);
        // the tail clamps down between the legs
        R(p, B.tail[0], -0.7 * k); R(p, B.tail[1], -0.5 * k); R(p, B.tail[2], -0.3 * k, 0.4 * k); R(p, B.tail[3], 0, 0.4 * k);
        p.c[CH_BLINK] = 0.6 * k;
      },
    },
    // ------------------------------------------------------------------------------------- sitting about
    sit: {
      loop: true, dur: 6, fade: 0.7,
      fn: (p, t, a) => {
        sitBase(p);
        breathe(p, t, 0.35);
        const c = t % 6;
        const tl = env(c, 3.0, 3.4, 4.4, 4.9);
        R(p, B.head, 0, 0.1 * tl, 0.32 * tl);
        lookAt(p, a, 1 - tl);
        tail(p, t, { amp: 0.1, freq: 0.5, lift: 0.42, base: 0.5, droop: 0.1 });
      },
    },
    beg: {
      // up on the haunches, the long body upright and wobbling, forepaws paddling, head cocked
      loop: true, dur: 2, fade: 0.6,
      fn: (p, t, a) => {
        const s = sin(t * 3.1), bob = sin(t * 1.6);
        p.t[1] += 0.13 + 0.01 * bob; p.t[2] -= 0.2; p.rr[0] += -1.0 + 0.03 * bob; p.rr[2] += 0.04 * sin(t * 1.3);
        R(p, B.loin, -0.05); R(p, B.pelvis, 0.42);
        R(p, B.chest, -0.12); R(p, B.neck, 0.85); R(p, B.neck2, 0.3); R(p, B.head, 0.18 + 0.03 * bob, 0, 0.22 * sin(t * 0.8));
        // forelegs off the ground: folded at the elbow, paddling
        for (let k = 0; k < 2; k++) {
          const pad = k ? s : -s;
          foot(p, k, 0, 0, 0, 0, 0.9);
          R(p, B.fu[k], -1.3 + 0.18 * pad, 0, (k ? 0.15 : -0.15)); R(p, B.fl[k], 1.6 + 0.25 * pad); R(p, B.ff[k], 0.5);
        }
        foot(p, HL, 0.02, 0, 0.04, 1, 0.9); foot(p, HR, -0.02, 0, 0.04, 1, 0.9);
        lookAt(p, a, 0.5);
        p.c[CH_BLINK] = 0.15;
        tail(p, t, { amp: 0.5, freq: 1.5, lift: -0.15, base: 0, droop: 0.1 });
      },
    },
    howl: {
      loop: true, dur: 4, fade: 0.8,
      fn: (p, t) => {
        sitBase(p);
        const c = t % 4, h = env(c, 0.2, 1.0, 3.0, 3.8);
        p.t[1] += 0.02 * h;
        R(p, B.neck, -0.62 * h); R(p, B.neck2, -0.4 * h); R(p, B.head, -0.55 * h, 0, 0.04 * sin(t * 1.7) * h);
        R(p, B.jaw, (0.18 + 0.12 * env(c, 0.8, 1.6, 2.4, 3.2) + 0.03 * sin(t * 7)) * h);
        p.c[CH_BLINK] = 0.55 * h;
        tail(p, t, { amp: 0.04, freq: 0.4, lift: 0.42, base: 0.5, droop: 0.1 });
      },
    },
    // ------------------------------------------------------------------------------------- friendly
    catch: {
      // the jerky arcs in: the head snaps up and round, the jaw gapes, snap, a hop of delight
      loop: false, dur: 1.2, fade: 0.1, next: 'chew',
      fn: (p, t) => {
        const up = env(t, 0, 0.18, 0.42, 0.9), snap = env(t, 0.32, 0.38, 0.42, 0.55), hop = env(t, 0.3, 0.42, 0.5, 0.7);
        R(p, B.neck, -0.45 * up); R(p, B.neck2, -0.2 * up); R(p, B.head, -0.3 * up + 0.15 * snap);
        R(p, B.jaw, 0.55 * env(t, 0.05, 0.22, 0.3, 0.38));
        p.t[1] += 0.05 * hop; p.rr[0] -= 0.12 * up;
        foot(p, FL, 0, 0.08 * hop, 0.03 * hop); foot(p, FR, 0, 0.08 * hop, 0.03 * hop);
        tail(p, t, { amp: 0.5, freq: 3, lift: 0.3 });
      },
    },
    chew: {
      // down on the belly, the prize between the forepaws: the head tilts to the side teeth, chews, worries it
      loop: true, dur: 5, fade: 0.6,
      fn: (p, t) => {
        lieBase(p);
        const c = t % 5, sh = env(c, 2.6, 2.75, 3.4, 3.6);
        R(p, B.neck, 0.32); R(p, B.neck2, 0.2); R(p, B.head, 0.12, 0.2 * sin(t * 0.7), 0.38 + 0.08 * sin(t * 1.1));
        R(p, B.jaw, Math.max(0, 0.12 * sin(t * 2.6 * TAU)) * (1 - sh) + 0.05);
        // worrying it: a fast shake of the head
        R(p, B.head, 0, 0.32 * sh * sin(t * 22), 0.2 * sh * sin(t * 22 + 1)); R(p, B.neck2, 0, 0.12 * sh * sin(t * 22 - 0.6));
        tail(p, t, { amp: 0.35, freq: 1.2, lift: -0.1, droop: 0.05 });
      },
    },
    wiggle: {
      // pure joy: the whole long body wags from the shoulders back, the forefeet dance, the jaw hangs open
      loop: true, dur: 1, fade: 0.3,
      fn: (p, t, a) => {
        const f = 2.3, w = t * f * TAU;
        p.rr[1] += 0.16 * sin(w); p.t[0] += 0.03 * sin(w - 0.5);
        R(p, B.chest, 0, -0.1 * sin(w + 0.3)); R(p, B.loin, 0, -0.32 * sin(w - 0.4)); R(p, B.pelvis, 0, -0.36 * sin(w - 0.9), 0.08 * sin(w - 0.9));
        R(p, B.neck, -0.08, 0.14 * sin(w + 1.2)); R(p, B.head, 0.05, 0.1 * sin(w + 1.8), 0.18 * sin(w * 0.5));
        R(p, B.jaw, 0.14 + 0.03 * sin(w * 2));
        p.t[1] += 0.008 * Math.abs(sin(w));
        foot(p, FL, 0, 0.035 * Math.max(0, sin(w)), 0.02); foot(p, FR, 0, 0.035 * Math.max(0, -sin(w)), 0.02);
        // the hind feet shuffle to follow the swinging hips
        foot(p, HL, -0.035 * sin(w - 0.9), 0.012 * Math.max(0, sin(w * 2)), 0); foot(p, HR, -0.035 * sin(w - 0.9), 0.012 * Math.max(0, -sin(w * 2)), 0);
        lookAt(p, a, 0.6);
        tail(p, t, { amp: 1.0, freq: f * 2, lift: 0.35, lag: 0.5, grow: 0.25 });
        p.c[CH_BLINK] = 0.25;
      },
    },
    dig: {
      // nose down, forefeet tearing at the ground in turns, rump up, tail wagging high
      loop: true, dur: 1, fade: 0.4,
      fn: (p, t) => {
        const f = 3.2, w = t * f * TAU;
        p.rr[0] += 0.22; p.t[1] -= 0.02; p.t[2] += 0.02;
        R(p, B.neck, 0.55); R(p, B.neck2, 0.25); R(p, B.head, 0.1 + 0.05 * sin(w * 2), 0.08 * sin(w));
        for (let k = 0; k < 2; k++) {
          const s = ((t * f + k * 0.5) % 1);
          // reach forward (lifted), rake back along the ground
          const reach = s < 0.35 ? ease(s / 0.35) : 1 - ease((s - 0.35) / 0.65);
          const lift = s < 0.35 ? sin((s / 0.35) * Math.PI) : 0;
          foot(p, k, 0, 0.06 * lift + 0.01, -0.06 + 0.2 * reach, 1, 0.6 * lift - 0.3);
        }
        foot(p, HL, 0.01, 0, -0.06); foot(p, HR, -0.01, 0, -0.06);
        R(p, B.loin, -0.08); R(p, B.pelvis, -0.06);
        tail(p, t, { amp: 0.4, freq: 2.2, lift: 0.5 });
      },
    },
    sleep: {
      // curled nose to tail by the stove, lying on its side, slow breaths, a dreaming twitch now and then
      loop: true, dur: 11, fade: 1.2,
      fn: (p, t) => {
        const c = t % 11, b = sin(t * 0.22 * TAU);
        p.t[1] += -0.2 + 0.004 * b; p.rr[2] += 0.12; p.rr[1] += 0.2;
        R(p, B.chest, -0.025 * b, 0.5); R(p, B.neck, 0.95, 0.6); R(p, B.neck2, 0.45, 0.5); R(p, B.head, 0.2, 0.4, -1.25);
        R(p, B.loin, 0.0, 0.62); R(p, B.pelvis, 0.0, 0.7);
        B.tail.forEach((bb, k) => R(p, bb, k === 0 ? 0.05 : -0.03, 0.5 + k * 0.06));
        // forelegs folded out in front, hind legs tucked along the curl
        foot(p, FL, 0.04, 0, 0.1, 1, -0.3); foot(p, FR, -0.02, 0, 0.14, 1, -0.3);
        for (let k = 0; k < 2; k++) { foot(p, 2 + k, 0, 0, 0, 0); R(p, B.hu[k], -1.1, 0, k ? 0.5 : -0.2); R(p, B.hl[k], 1.5); R(p, B.hm[k], -1.2); R(p, B.hf[k], 0.5); }
        // a dream: the paws paddle, the jaw twitches
        const d = env(c, 6.5, 6.8, 8.3, 8.8);
        foot(p, FL, 0, 0.02 * d * Math.max(0, sin(t * 13)), 0.03 * d * sin(t * 13)); foot(p, FR, 0, 0.02 * d * Math.max(0, sin(t * 13 + 1.7)), 0.03 * d * sin(t * 13 + 1.7)); R(p, B.jaw, 0.04 * d * Math.max(0, sin(t * 9)));
        p.c[CH_BLINK] = 1;
      },
    },
  };

  /** the sit: haunches on the ground, forelegs straight, the body raked back */
  function sitBase(p: Pose) {
    p.t[1] -= 0.1; p.t[2] -= 0.04; p.rr[0] -= 0.28;
    R(p, B.pelvis, -0.3); R(p, B.loin, -0.1);
    R(p, B.neck, 0.16); R(p, B.head, 0.1);
    foot(p, FL, 0, 0, -0.03); foot(p, FR, 0, 0, -0.03);
    foot(p, HL, 0.025, 0, 0.07, 1, 0.9); foot(p, HR, -0.025, 0, 0.07, 1, 0.9);
  }
  /** lying on the belly like a sphinx: forelegs out in front, hind legs folded under */
  function lieBase(p: Pose) {
    p.t[1] -= 0.18; p.rr[0] += 0.01;
    foot(p, FL, 0.01, 0, 0.17, 1, -0.2); foot(p, FR, -0.01, 0, 0.19, 1, -0.2);
    foot(p, HL, 0.05, 0, 0.12, 1, 1.25); foot(p, HR, -0.05, 0, 0.12, 1, 1.25);
  }
  return clips;
}
