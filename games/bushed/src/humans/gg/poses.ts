// More poses, registered into GESTURES (see gestures.ts EXTRA_POSES). From Gacha Garage's poses.js: explain, hug,
// read (a sheet in both hands), flex, nope / yep; plus BUSHED's camp life in the same arm-IK vocabulary:
//   lean     both forearms on a counter in front, leaning on it, looking out
//   count    counting bills: the left palm holds the stack, the right thumb flicks through
//   warm     hands held out to a fire, palms toward it, rubbed together now and then
//   chop     two-handed overhead axe split onto a block (the axe shows in the fist; 'impact' at 1.18 s of 1.9 s)
//   flinch   startled: arms up in front of the face, a step back (one-shot)
//   sit      on a log / stump ~0.46 m: hips down, feet forward, forearms on the thighs (full body)
// Poses can set pose.hands (finger direction + palm normal per hand, chest space), honoured by Human.update.
import { GESTURES, EXTRA_POSES } from './gestures';
import { EXPRESSIONS } from './face';
import type { Human } from './Human';
import type { GPose, ArmT } from './types';

Object.assign(EXPRESSIONS, {
  cool: { corner: 0.9, upper: 0.74, brow: -0.2, cheek: 0.3 },
  grin: { corner: 2.6, cheek: 1.2, lower: 0.8, teeth: 1, open: 1.4, mouthW: 1.16, brow: 0.6, upper: 0.82 },
  wince: { inner: 1.2, furrow: 1, upper: 0.45, corner: -0.6, open: 1.2, mouthW: 1.1, teeth: 1, lines: 0.6 },
});

Object.assign(GESTURES, {
  hug: { dur: Infinity, expr: 'happy' },
  explain: { dur: Infinity },
  read: { dur: Infinity },
  flex: { dur: 2.6, expr: 'grin' },
  nope: { dur: Infinity, expr: 'angry' },
  yep: { dur: Infinity, expr: 'grin' },
  lean: { dur: Infinity, loop: true },
  count: { dur: Infinity, loop: true },
  warm: { dur: Infinity, loop: true },
  chop: { dur: Infinity, loop: true },
  flinch: { dur: 1.3, expr: 'surprised' },
  sit: { dur: Infinity, legs: true, loop: true },
});

const smooth = (x: number) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const arm = (x: number, y: number, z: number, px: number, py: number, pz: number, hx = 0, hy = 0, hz = 0): ArmT => ({ t: [x, y, z], p: [px, py, pz], hand: [hx, hy, hz] });
const nrm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** keyframes [[t, v], ...] with smoothstep easing */
const key = (t: number, k: number[][]) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 0; i + 1 < k.length; i++) if (t <= k[i + 1][0]) return k[i][1] + (k[i + 1][1] - k[i][1]) * smooth((t - k[i][0]) / (k[i + 1][0] - k[i][0] || 1));
  return k[k.length - 1][1];
};

/** The common frame: chest-space shoulder (sx, sy), eye height, face plane; m() scales a 1.72 m adult's metres. */
function frame(h: Human) {
  const P = h.P, k = P.H / 1.72;
  return { P, k, sx: P.shX, sy: P.shoulderY - P.waistY, eye: P.eyeY - P.waistY, zf: P.zf, m: (v: number) => v * k };
}
const hands = (g: GPose) => (g.hands = { L: null, R: null } as { L: number[] | null; R: number[] | null });

/** chop timeline (seconds of a 1.9 s loop): 0 rest low, 0.55 axe up, 0.95 top, 1.18 impact, 1.45 pull free */
export const CHOP_T = 1.9, CHOP_IMPACT = 1.18;

Object.assign(EXTRA_POSES, {
  hug(t: number, h: Human, g: GPose) {
    const { m } = frame(h), H = hands(g);
    const sq = Math.sin(t * 2.2) * m(0.006);
    g.L = arm(m(0.1) - sq, m(0.02), m(0.33), 1, -0.3, -0.4);
    g.R = arm(-m(0.1) + sq, m(0.02), m(0.33), -1, -0.3, -0.4);
    H.L = [-1, 0.05, 0.25, 0, 0, -1]; H.R = [1, 0.05, 0.25, 0, 0, -1];
    g.chest[0] = 0.1; g.head[0] = 0.12; g.head[2] = 0.22; g.spine[0] = 0.04;
    g.eyes = [0, 0];
  },
  explain(t: number, h: Human, g: GPose) {
    const { m, sy } = frame(h), H = hands(g);
    const b = Math.sin(t * 2.6) * m(0.008);
    g.R = arm(-m(0.2), sy - m(0.08) + b, m(0.22), -1, -1, -0.3);
    H.R = [0.1, 0.8, 0.55, 0.65, 0.35, 0.6];
    g.head[2] = 0.08; g.head[0] = 0.03; g.chest[1] = -0.06;
  },
  read(t: number, h: Human, g: GPose) {
    const { m } = frame(h), at = [0, m(0.12), m(0.3)];
    const w = m(0.105);
    g.L = arm(at[0] + w, at[1] - m(0.06), at[2] - m(0.02), 1, -0.6, -0.5);
    g.R = arm(at[0] - w, at[1] - m(0.06), at[2] - m(0.02), -1, -0.6, -0.5);
    g.head[0] = 0.32 + Math.sin(t * 0.4) * 0.03; g.neck[0] = 0.1; g.chest[0] = 0.04;
    g.eyes = [Math.sin(t * 1.3) * 1.2, 1.5];
  },
  flex(t: number, h: Human, g: GPose) {
    const { m, sx, sy } = frame(h), H = hands(g);
    const p = Math.sin(t * 5) * m(0.01);
    g.L = arm(sx + m(0.13), sy + m(0.2) + p, m(0.03), 1, -0.25, -0.4);
    g.R = arm(-sx - m(0.13), sy + m(0.2) + p, m(0.03), -1, -0.25, -0.4);
    H.L = [-0.3, 1, 0, 0, 0, -1]; H.R = [0.3, 1, 0, 0, 0, -1];
    g.grip = [1, 1];
    g.chest[0] = -0.08; g.head[0] = -0.08; g.lift = m(0.012);
  },
  nope(_t: number, h: Human, g: GPose) {
    const { m, eye, zf } = frame(h), H = hands(g);
    g.L = arm(m(0.2), eye - m(0.2), zf + m(0.12), 1, -1, -0.3);
    H.L = [0.1, 1, 0.15, 1, 0, 0.55];
    g.head[1] = -0.6; g.head[0] = -0.14; g.head[2] = 0.12; g.chest[1] = -0.18; g.neck[1] = -0.15;
    g.eyes = [-2, -0.5];
  },
  yep(_t: number, h: Human, g: GPose) {
    const { sx, sy, P } = frame(h), H = hands(g);
    const d = nrm([0.85, 0.32, 0.5]), reach = (P.shoulderY - P.wristY) * 0.9;
    g.L = arm(sx + d[0] * reach, sy + d[1] * reach, d[2] * reach, 1, -1, -0.4);
    H.L = [...d, 0, -0.4, 1];
    g.head[1] = 0.42; g.head[0] = -0.06; g.chest[1] = 0.14;
    g.eyes = [2, 0];
  },
  // ---------------------------------------------------------------- BUSHED
  lean(t: number, h: Human, g: GPose) {
    const { m, sx } = frame(h), H = hands(g);
    const sh = Math.sin(t * 0.35 + h.seedF * 6) * 0.5 + 0.5;
    g.spine[0] = 0.2; g.chest[0] = 0.12; g.hips[2] = -m(0.05);
    // forearms flat on the counter, hands loosely together (weight shifting between the elbows)
    g.L = arm(sx * 0.45, -m(0.13) - sh * m(0.01), m(0.38), 1, -0.3, -1, 0, 0, 0);
    g.R = arm(-sx * 0.45, -m(0.13) - (1 - sh) * m(0.01), m(0.38), -1, -0.3, -1, 0, 0, 0);
    H.L = [-0.55, -0.25, 0.8, -0.1, -1, 0.1]; H.R = [0.55, -0.25, 0.8, 0.1, -1, 0.1];
    g.grip = [0.35, 0.35];
    g.neck[0] = -0.12; g.head[0] = -0.2 + Math.sin(t * 0.21) * 0.05; g.head[1] = Math.sin(t * 0.17 + 1) * 0.25;
  },
  count(t: number, h: Human, g: GPose) {
    const { m } = frame(h), H = hands(g);
    const flick = Math.max(0, Math.sin(t * 7.5)) ** 3, pause = Math.sin(t * 0.9) > 0.75 ? 0 : 1;
    g.L = arm(m(0.06), -m(0.1), m(0.27), 1, -0.6, -0.5);
    H.L = [-0.35, 0.15, 0.9, -0.1, 1, -0.05];
    g.R = arm(-m(0.02), -m(0.07) + flick * pause * m(0.012), m(0.3) + flick * pause * m(0.008), -1, -0.6, -0.5);
    H.R = [0.45, -0.2, 0.85, 0.1, -0.95, 0.2];
    g.grip = [0.25, 0.65];
    g.head[0] = 0.32; g.neck[0] = 0.08; g.chest[0] = 0.05;
    g.eyes = [0, 1.5];
  },
  warm(t: number, h: Human, g: GPose) {
    const { m } = frame(h), H = hands(g);
    // every ~7 s the hands come together and rub for a moment
    const c = (t % 7) / 7, rub = smooth((c - 0.7) / 0.06) * smooth((0.97 - c) / 0.06), r = Math.sin(t * 16) * m(0.02) * rub;
    const x = m(0.11) * (1 - rub) + m(0.012) * rub;
    g.L = arm(x + r, -m(0.01) - rub * m(0.03), m(0.37) - rub * m(0.06), 1, -0.4, -0.6);
    g.R = arm(-x + r, -m(0.01) - rub * m(0.03), m(0.37) - rub * m(0.06), -1, -0.4, -0.6);
    const open = 1 - rub;
    H.L = [-0.2 * open, 0.45 * open + 0.15, 0.85, 0.15 * open - 1 * rub, -0.35 * open, 0.9 * open];
    H.R = [0.2 * open, 0.45 * open + 0.15, 0.85, -0.15 * open + 1 * rub, -0.35 * open, 0.9 * open];
    g.grip = [0.1 + rub * 0.3, 0.1 + rub * 0.3];
    g.spine[0] = 0.08; g.head[0] = 0.1; g.chest[0] = 0.04;
  },
  chop(t: number, h: Human, g: GPose) {
    const { m, sy } = frame(h), H = hands(g);
    const u = t % CHOP_T;
    // the right fist on the handle (chest space) and the handle direction toward the head
    const up = key(u, [[0, 0], [0.55, 0.75], [0.95, 1], [1.12, 0.1], [1.18, -0.05], [1.45, 0], [1.9, 0]]);
    const y = -m(0.18) + up * (sy + m(0.42)), z = m(0.42) - up * m(0.3);
    const ang = -0.35 + up * 2.6; // handle pitch: forward-down at rest, back over the head at the top
    const dir = [0, Math.sin(ang), Math.cos(ang)];
    g.R = arm(-m(0.025), y, z, -1, -0.5, -0.3);
    g.L = arm(m(0.02) - dir[0] * m(0.22), y - dir[1] * m(0.22), z - dir[2] * m(0.22), 1, -0.5, -0.3);
    // fingers wrap the handle: finger direction across it, palms facing each other around it
    const f = nrm(crs(dir, [1, 0, 0]).map((v) => -v));
    H.R = [...f, -1, 0, 0]; H.L = [...f, -1, 0, 0];
    g.grip = [1, 1];
    g.tool = true;
    const drive = key(u, [[0, 0.3], [0.55, -0.08], [0.95, -0.14], [1.18, 0.42], [1.45, 0.3], [1.9, 0.3]]);
    g.spine[0] = drive * 0.6; g.chest[0] = drive * 0.4; g.head[0] = -drive * 0.5 + 0.1; g.hips[2] = -m(0.03) * Math.max(0, drive);
    g.hips[1] = -m(0.03) * Math.max(0, drive - 0.2);
  },
  flinch(t: number, h: Human, g: GPose) {
    const { m, eye, zf } = frame(h), H = hands(g);
    const e = smooth(t / 0.12) * (1 - smooth((t - 0.75) / 0.5));
    g.L = arm(m(0.1), eye - m(0.12), zf + m(0.17), 1, -0.8, -0.6);
    g.R = arm(-m(0.12), eye - m(0.18), zf + m(0.2), -1, -0.8, -0.6);
    H.L = [-0.2, 1, 0.2, 0, 0, 1]; H.R = [0.2, 1, 0.2, 0, 0, 1];
    g.spine[0] = -0.18 * e; g.chest[0] = -0.1 * e; g.head[0] = 0.2 * e; g.head[1] = 0.35 * e; g.hips[2] = -m(0.06) * e;
    g.lift = m(0.02) * e;
    g.eyes = [-1, -0.5];
  },
  sit(t: number, h: Human, g: GPose) {
    const { m, P } = frame(h), H = hands(g);
    // hips down onto a ~0.46 m seat, a little back; the feet forward under the knees
    const seat = m(0.47), drop = P.hipY - seat;
    g.hips[1] = -drop; g.hips[2] = -m(0.07);
    g.hipsR[0] = -0.1;
    const thigh = P.hipY - P.kneeY;
    g.feet[0][1] = thigh * 0.9; g.feet[1][1] = thigh * 0.86; g.feet[0][0] = m(0.03); g.feet[1][0] = -m(0.03);
    g.home = true;
    const sh = Math.sin(t * 0.3 + h.seedF * 5);
    g.spine[0] = 0.22 + sh * 0.02; g.chest[0] = 0.12; g.neck[0] = -0.1; g.head[0] = 0.05 + Math.sin(t * 0.23) * 0.04; g.head[1] = Math.sin(t * 0.13 + 2) * 0.3;
    // forearms resting on the thighs, hands hanging loosely between the knees
    const ky = P.hipY - drop - P.waistY - m(0.02);
    g.L = arm(m(0.07), ky + m(0.04), thigh * 0.8, 1, 0, -1);
    g.R = arm(-m(0.07), ky + m(0.04) + sh * m(0.005), thigh * 0.78, -1, 0, -1);
    H.L = [-0.4, -0.6, 0.6, -0.4, 0.2, -0.3]; H.R = [0.4, -0.6, 0.6, 0.4, 0.2, -0.3];
    g.grip = [0.45, 0.45];
  },
});
