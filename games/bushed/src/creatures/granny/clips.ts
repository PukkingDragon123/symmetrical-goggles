// GRANNY TAMARACK: animation clips. A slow, stooped old body: knees soft, the back bowed over the staff, the head
// carried forward and tipped to one side when she looks at you. The staff is a third foot: pose foot 2 is its tip
// (a model-space offset from where it rests), and the creature reaches it with the right arm by IK; feet 0 and 1
// are her own (IK). Everything else is FK.
//   idle    swaying gently on the staff, breathing, a slow kindly tilt of the head, the free hand's long fingers
//           stirring
//   walk    a slow walk, the staff planted ahead with every other step
//   beckon  the free hand held out palm up, the long index finger curling: come along
//   take    reaches out palm up, closes the fingers on what is given, draws it to her chest, bows her head
//   point   points off into the trees with a long finger and holds it
//   vanish  turns her face away and bows, hunched, stepping off (the creature walks her away and fades her)
import { type Clip, type Pose, type AnimParams, FOOT, TAU, sin, cos, env, wander, footCycle } from '../animator';
import type { BoneDef } from '../rig';

export const LF = 0, RF = 1, STAFF = 2;
/** pose channels: 0 eyelids (0 open .. 1 shut), 1 the moment the gift is taken (a pulse), 2 hum (0..1) */
export const CH_LID = 0, CH_TAKE = 1, CH_HUM = 2;
/** walking stride (m per full cycle of both feet), the take clip's grab moment */
export const STRIDE = 1.15, TAKE_AT = 1.15;

export function grannyClips(bones: BoneDef[]): Record<string, Clip> {
  const I = (n: string) => { const k = bones.findIndex((b) => b.name === n); if (k < 0) throw new Error(n); return k; };
  const B = {
    hips: I('hips'), spine: I('spine'), chest: I('chest'), neck: I('neck'), head: I('head'),
    armL: I('armL'), elbL: I('elbL'), handL: I('handL'), fing: I('fingL'), fing2: I('fing2L'), index: I('indexL'), index2: I('index2L'), thumb: I('thumbL'),
    armR: I('armR'), elbR: I('elbR'), toes: [I('toesL'), I('toesR')],
  };
  const R = (p: Pose, b: number, x: number, y = 0, z = 0) => { p.r[b * 3] += x; p.r[b * 3 + 1] += y; p.r[b * 3 + 2] += z; };
  const foot = (p: Pose, k: number, dx: number, dy: number, dz: number, w = 1, pitch = 0) => { const o = k * FOOT; p.f[o] += dx; p.f[o + 1] += dy; p.f[o + 2] += dz; p.f[o + 3] = w; p.f[o + 4] += pitch; };
  /** the free (left) arm: swing (+ back), out (+ away from the body), twist (+ turns the palm up when reaching
   *  forward), elbow bend, wrist */
  const armL = (p: Pose, swing: number, out: number, twist: number, elbow: number, wrist = 0) => { R(p, B.armL, swing, twist, out); R(p, B.elbL, -elbow); R(p, B.handL, wrist); };
  /** the left hand's fingers: curl of the three, of the index, the thumb (+ closes) */
  const fingers = (p: Pose, c: number, ci = c, th = c * 0.6) => { R(p, B.fing, 0, 0, -0.9 * c); R(p, B.fing2, 0, 0, -1.1 * c); R(p, B.index, 0, 0, -0.85 * ci); R(p, B.index2, 0, 0, -1.1 * ci); R(p, B.thumb, 0.3 * th, 0, -0.6 * th); };
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, B.neck, -a.lookPitch * 0.3 * k, a.lookYaw * 0.35 * k); R(p, B.head, -a.lookPitch * 0.5 * k, a.lookYaw * 0.5 * k); };
  const breathe = (p: Pose, t: number, k = 1) => { const b = sin(t * 0.2 * TAU); R(p, B.chest, -0.025 * b * k); R(p, B.armL, 0, 0, 0.012 * b * k); };
  /** stooped over the staff: the back bowed, the head carried forward, the staff planted where it rests */
  const stand = (p: Pose, k = 1) => {
    p.t[1] -= 0.035 * k; p.t[2] -= 0.02 * k;
    R(p, B.spine, 0.1 * k); R(p, B.chest, 0.16 * k); R(p, B.neck, 0.1 * k); R(p, B.head, -0.16 * k);
    foot(p, STAFF, 0, 0, 0, 1);
    foot(p, LF, 0, 0, 0); foot(p, RF, 0, 0, 0);
    fingers(p, 0.25);
  };
  return {
    idle: {
      loop: true, dur: 14, fade: 0.8,
      fn: (p, t, a) => {
        stand(p); breathe(p, t);
        const c = t % 14;
        // the sway: weight from foot to foot, leaning on the staff
        const sw = wander(t * 0.22, 3);
        p.t[0] += 0.025 * sw; p.rr[2] += 0.022 * sw; p.rr[1] += 0.03 * wander(t * 0.15, 7);
        R(p, B.spine, 0, 0, -0.02 * sw); foot(p, LF, 0, 0, 0.05); foot(p, RF, 0, 0, -0.04);
        // a slow kind tilt of the head, then a nod
        const tl = env(c, 3, 4.5, 8, 9.5), nod = env(c, 10.5, 11.2, 11.4, 12.2);
        R(p, B.head, 0.04 * tl + 0.16 * nod, 0, 0.2 * tl);
        // the long fingers of the free hand stir
        R(p, B.fing, 0, 0, -0.25 * Math.max(0, sin(t * 0.9)) * env(c, 5, 6, 9, 10)); R(p, B.index, 0, 0, -0.3 * Math.max(0, sin(t * 0.9 + 1)) * env(c, 5, 6, 9, 10));
        armL(p, -0.06, 0.04, 0, 0.18);
        look(p, a, 1);
        p.c[CH_HUM] = env(c, 1, 2, 5, 6.5);
      },
    },
    walk: {
      loop: true, dur: 1, fade: 0.6,
      fn: (p, t, a) => {
        const ph = a.phase, w = ph * TAU, duty = 0.66, A = (STRIDE * duty) / 2;
        stand(p);
        for (let k = 0; k < 2; k++) {
          const [dz, l] = footCycle(ph + k * 0.5, duty);
          foot(p, k, 0, l * 0.09, dz * A, 1, l * 0.35 - (dz > 0.6 && l === 0 ? 0.12 : 0));
          R(p, B.toes[k], l > 0 ? 0.25 * l : -0.15 * Math.max(0, -dz));
        }
        // the staff goes forward with the left foot and is leaned on through its stance
        const [sz, sl] = footCycle(ph + 0.04, 0.7);
        foot(p, STAFF, 0, sl * 0.07, sz * A * 0.95 + 0.06, 1);
        p.t[1] -= 0.03 + 0.018 * cos(w * 2);
        p.rr[1] += 0.06 * sin(w); p.rr[2] += 0.025 * sin(w);
        R(p, B.spine, 0.04, 0, 0); R(p, B.chest, 0.02 * cos(w * 2), -0.08 * sin(w)); R(p, B.head, 0.02 * cos(w * 2), 0.05 * sin(w));
        // the free arm swings a little, the elbow soft
        armL(p, -0.2 * sin(w) + 0.02, 0.05, 0, 0.25 + 0.12 * Math.max(0, sin(w)));
        look(p, a, 0.6);
      },
    },
    beckon: {
      loop: true, dur: 2.6, fade: 0.5,
      fn: (p, t, a) => {
        stand(p); breathe(p, t);
        // the free hand out in front, palm up, the index finger curling twice a cycle: come along now
        armL(p, -0.95, 0.12, 1.45, 0.75, -0.25);
        const c = t % 2.6, curl = Math.max(0, sin(c * TAU * 0.77)) * env(c, 0, 0.2, 2.0, 2.5);
        fingers(p, 0.75, 0.2 + 1.0 * curl, 0.4);
        R(p, B.chest, -0.04, 0.12); R(p, B.head, 0.05, 0, 0.22);
        foot(p, LF, 0, 0, 0.06);
        look(p, a, 0.8);
      },
    },
    take: {
      loop: false, dur: 3.0, fade: 0.4, next: 'idle',
      fn: (p, t, a) => {
        stand(p);
        const reach = env(t, 0.1, 0.9, 1.35, 2.1), draw = env(t, 1.35, 2.1, 2.5, 3.0), bow = env(t, 1.9, 2.3, 2.6, 3.0), close = env(t, 1.0, 1.2, 9, 10);
        // reach forward palm up, the fingers close, the hand comes back to the chest, a little bow
        armL(p, -1.15 * reach - 0.75 * draw, 0.1 * reach - 0.18 * draw, 1.45 * reach + 0.6 * draw, 0.3 * reach + 1.7 * draw, -0.2 * reach);
        fingers(p, 0.3 + 0.8 * close, 0.3 + 0.8 * close, 0.3 + 0.7 * close);
        R(p, B.chest, 0.12 * reach + 0.1 * bow, 0.08 * reach); R(p, B.spine, 0.05 * reach); R(p, B.head, 0.15 * reach + 0.25 * bow, 0, 0.1 * reach);
        foot(p, LF, 0, 0, 0.12 * reach); p.t[2] += 0.04 * reach;
        if (Math.abs(t - TAKE_AT) < 0.03) p.c[CH_TAKE] = 1;
        look(p, a, 1 - bow);
      },
    },
    point: {
      loop: false, dur: 3.6, fade: 0.5, next: 'idle',
      fn: (p, t, a) => {
        stand(p); breathe(p, t);
        const up = env(t, 0.2, 1.0, 2.8, 3.5);
        // the arm out toward the trees, the long index finger straight, the others folded
        armL(p, -1.3 * up, 0.38 * up, 0.2 * up, 0.08 * up);
        fingers(p, 0.25 + 0.9 * up, 0.25 - 0.25 * up, 0.25 + 0.6 * up);
        R(p, B.chest, 0, 0.18 * up); R(p, B.neck, 0, 0.2 * up); R(p, B.head, -0.05 * up, 0.25 * up, 0);
        foot(p, LF, 0.04 * up, 0, 0.1 * up);
        look(p, a, 1 - up);
        p.c[CH_HUM] = env(t, 1.0, 1.4, 2.6, 3.2);
      },
    },
    vanish: {
      loop: true, dur: 1, fade: 0.8,
      fn: (p, t, a) => {
        // hunched and bowed, stepping off slowly (the creature turns her away and walks her into the fog)
        const ph = a.phase, w = ph * TAU, duty = 0.68, A = (STRIDE * 0.7 * duty) / 2;
        stand(p);
        for (let k = 0; k < 2; k++) { const [dz, l] = footCycle(ph + k * 0.5, duty); foot(p, k, 0, l * 0.07, dz * A, 1, l * 0.3); }
        const [sz, sl] = footCycle(ph + 0.04, 0.72);
        foot(p, STAFF, 0, sl * 0.05, sz * A + 0.05, 1);
        R(p, B.spine, 0.12); R(p, B.chest, 0.12); R(p, B.neck, 0.2); R(p, B.head, 0.3, 0, -0.1);
        p.t[1] -= 0.04 + 0.012 * cos(w * 2);
        armL(p, -0.25, -0.04, 0.3, 1.2); fingers(p, 0.7);
        p.c[CH_LID] = 0.5;
        void a;
      },
    },
  };
}
