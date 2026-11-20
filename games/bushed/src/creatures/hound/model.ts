// THE AXEHANDLE HOUND: model (v6, hand-painted). A long, low hound whose body is an axe handle and whose head is
// shaped like a hatchet: from the side the head is an axe head (a narrow, flat-topped poll at the back where the neck
// runs in like a handle through the axe's eye, a tall blade sweeping forward to a rounded toe over the nose and a long
// curved bit down to a hanging "beard" of a chin), from the front a wedge. But it is a dog's head: soft and plush,
// steel-grey fur with a cream muzzle and fluffy cream cheeks, big amber eyes seated in sockets under thick lids (only an
// almond of eye shows), crescent brow tufts, a wet black nose with carved nostrils, an upper lip over the lower, a
// polished steel bevel on the toe and down the bit (the honed edge still catches the light), cupped floppy ears that
// break over at a fold, little white teeth and a grooved tongue. The body is painted hickory fur: a heartwood saddle
// down the back, a cream bib and belly, knots as dark swirls, all in brush strokes combed back along the handle; short
// stubby legs with heartwood socks, big padded paws and dark claws; a whip of a tail with a cream plume.
// Creature space: metres, +z forward, +y up, ground y = 0. Built with the anatomy library (src/creatures/anatomy),
// painted with its hand-painting pass (anatomy/handpaint.ts).
import * as THREE from 'three';
import {
  Body, runSync, runAsync, trunk, limb, legRings, paintedEye, lids, lidPaint, earFlap, mouthWebs, locks, stalk, spine, curve, chainSkin, gridSurf,
  Px, RP, hand, h3, cl, type V3, type Wt, type Piece, type Chart, type Station, type FootSpec, type LockSeat, type LimbRing, type Hollow,
} from '../anatomy';
import { spineFrame, locate, seatsOn, type Frame } from '../paintkit';
import type { BoneDef } from '../rig';
import { furZones } from '../fur/paint';

// ------------------------------------------------------------------------------------------------ the skeleton
export const H: V3 = [0, 0.585, 0.665];
/** the head's scale: its tables below are in 'axe units' (a big felling axe), this many metres each */
const K = 1.1;
/** the eye (axe units, head-local, +x side) and its radius: big puppy eyes */
const EYE0: V3 = [0.041, 0.033, 0.04];
const EYER = 0.029;
/** the face's moving parts (axe units, head-local, +x side): brow tufts, ear roots, the tongue's root */
const BROW0: V3 = [0.037, 0.063, 0.042], EAR0: V3 = [0.05, 0.055, -0.07];
/** the mouth line (axe units below the head bone) */
const MOUTH = -0.026;
const HL = (x: number, y: number, z: number): V3 => [H[0] + x * K, H[1] + y * K, H[2] + z * K];
/** the eye's look axis (+x side) */
export const EYE_AX: V3 = [0.52, 0.1, 0.85];
const EYE: V3 = [EYE0[0] * K, EYE0[1] * K, EYE0[2] * K];
const TAIL_CTRL: V3[] = [[0, 0.385, -0.6], [0, 0.405, -0.74], [0, 0.39, -0.9], [0, 0.35, -1.04], [0, 0.3, -1.17], [0, 0.255, -1.28]];
const TAIL_PTS = curve(TAIL_CTRL, 7);
// legs: shoulder/hip, elbow/stifle, (hock), sole
export const LEGS = {
  fl: { hip: [0.074, 0.29, 0.31] as V3, knee: [0.098, 0.165, 0.262] as V3, sole: [0.118, 0, 0.335] as V3, r: 0.057, padH: 0.03 },
  hl: { hip: [0.08, 0.33, -0.47] as V3, knee: [0.104, 0.2, -0.38] as V3, hock: [0.102, 0.09, -0.535] as V3, sole: [0.102, 0, -0.5] as V3, r: 0.06, padH: 0.029 },
};
const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];
const ankle = (sole: V3, h: number): V3 => [sole[0], sole[1] + h * 1.6, sole[2]];

export function houndBones(): BoneDef[] {
  const b: BoneDef[] = [];
  const add = (name: string, parent: string | null, pos: V3) => { b.push({ name, parent: parent === null ? -1 : b.findIndex((x) => x.name === parent), pos: pos as [number, number, number] }); };
  add('root', null, [0, 0.33, -0.05]);
  add('chest', 'root', [0, 0.34, 0.2]);
  add('neck', 'chest', [0, 0.42, 0.455]);
  add('neck2', 'neck', [0, 0.5, 0.545]);
  add('head', 'neck2', H);
  add('jaw', 'head', [H[0], H[1], H[2] - 0.012 * K]);
  add('eyeL', 'head', [H[0] + EYE[0], H[1] + EYE[1], H[2] + EYE[2]]);
  add('eyeR', 'head', [H[0] - EYE[0], H[1] + EYE[1], H[2] + EYE[2]]);
  add('lidL', 'head', [H[0] + EYE[0], H[1] + EYE[1], H[2] + EYE[2]]);
  add('lidR', 'head', [H[0] - EYE[0], H[1] + EYE[1], H[2] + EYE[2]]);
  add('loin', 'root', [0, 0.345, -0.28]);
  add('pelvis', 'loin', [0, 0.35, -0.47]);
  const tt = [0, 1, 2, 3, 4, 5];
  tt.forEach((k) => add('tail' + k, k === 0 ? 'pelvis' : 'tail' + (k - 1), TAIL_PTS[k] as [number, number, number]));
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const f = LEGS.fl, m = (p: V3): V3 => (side > 0 ? p : mirror(p));
    add('fu' + s, 'chest', m(f.hip)); add('fl' + s, 'fu' + s, m(f.knee)); add('ff' + s, 'fl' + s, m(ankle(f.sole, f.padH)));
  }
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const h = LEGS.hl, m = (p: V3): V3 => (side > 0 ? p : mirror(p));
    add('hu' + s, 'pelvis', m(h.hip)); add('hl' + s, 'hu' + s, m(h.knee)); add('hm' + s, 'hl' + s, m(h.hock)); add('hf' + s, 'hm' + s, m(ankle(h.sole, h.padH)));
  }
  // the face: brow tufts, lower lids (the happy squint), floppy ears, the tongue
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    add('brow' + s, 'head', HL(side * BROW0[0], BROW0[1], BROW0[2]));
    add('lidLo' + s, 'head', HL(side * EYE0[0], EYE0[1], EYE0[2]));
    add('ear' + s, 'head', HL(side * EAR0[0], EAR0[1], EAR0[2]));
  }
  add('tongue', 'jaw', HL(0, MOUTH - 0.012, 0.07));
  return b;
}

// ------------------------------------------------------------------------------------------------ the hatchet head
// Head-local stations (axe units, relative to H): z, crown height, half width; the poll's stations run the full height
// down to `bot` (the neck runs in underneath, as a handle through the axe's eye), the rest down to the mouth line.
const UP0: { z: number; top: number; w: number; bot?: number }[] = [
  { z: -0.113, top: 0.044, w: 0.034, bot: -0.046 },
  { z: -0.1, top: 0.06, w: 0.046, bot: -0.062 },
  { z: -0.072, top: 0.072, w: 0.054, bot: -0.07 },
  { z: -0.038, top: 0.079, w: 0.059, bot: -0.068 },
  { z: -0.006, top: 0.082, w: 0.062 },
  { z: 0.022, top: 0.081, w: 0.064 },
  { z: 0.048, top: 0.076, w: 0.062 },
  { z: 0.07, top: 0.066, w: 0.056 },
  { z: 0.091, top: 0.06, w: 0.049 },
  { z: 0.117, top: 0.062, w: 0.044 },
  { z: 0.143, top: 0.07, w: 0.04 },
  { z: 0.168, top: 0.078, w: 0.037 },
  { z: 0.189, top: 0.076, w: 0.033 },
  { z: 0.204, top: 0.058, w: 0.028 },
  { z: 0.213, top: 0.03, w: 0.019 },
];
const LO0: { z: number; bot: number; w: number }[] = [
  { z: -0.04, bot: -0.056, w: 0.04 },
  { z: -0.008, bot: -0.06, w: 0.042 },
  { z: 0.03, bot: -0.063, w: 0.041 },
  { z: 0.066, bot: -0.068, w: 0.036 },
  { z: 0.099, bot: -0.08, w: 0.032 },
  { z: 0.13, bot: -0.096, w: 0.029 },
  { z: 0.158, bot: -0.112, w: 0.027 },
  { z: 0.18, bot: -0.124, w: 0.025 },
  { z: 0.198, bot: -0.112, w: 0.022 },
  { z: 0.209, bot: -0.07, w: 0.016 },
];
const UP = UP0.map((s) => ({ ...s, z: s.z * K, top: s.top * K, w: s.w * K, bot: s.bot === undefined ? undefined : s.bot * K }));
const LO = LO0.map((s) => ({ ...s, z: s.z * K, bot: s.bot * K, w: s.w * K }));
/** the half-width of the upper head at head-local z (axe units) */
const wAt = (z: number) => { for (let i = 0; i + 1 < UP0.length; i++) if (z <= UP0[i + 1].z) { const f = cl((z - UP0[i].z) / (UP0[i + 1].z - UP0[i].z), 0, 1); return UP0[i].w + (UP0[i + 1].w - UP0[i].w) * f; } return 0.01; };
const gss = (x: number) => Math.exp(-x * x);

/** the eye socket: how far (axe units) the side of the head sinks toward the eye at (y, z), so the ball seats in a
 *  hollow under a brow, the cheek swelling below it */
function socket(y: number, z: number) {
  const dy = (y - EYE0[1]) / (EYER * 1.15), dz = (z - EYE0[2]) / (EYER * 1.45);
  return gss(dy) * gss(dz);
}
function upperStations(): Station[] {
  return UP0.map((s, si) => {
    const { top, w, z } = s;
    let pts: [number, number][];
    if (s.bot !== undefined) {
      const b = s.bot, F = [0, 0.07, 0.22, 0.4, 0.56, 0.71, 0.86, 0.96, 1], X = [0, 0.6, 0.9, 1, 1.0, 0.96, 0.84, 0.52, 0];
      pts = F.map((f, k) => [w * X[k], top + (b - top) * f]);
    } else {
      // crown, temple, brow, socket, cheek, the upper lip's bulge, the lip line tucked under it, the palate
      const F = [0, 0.07, 0.24, 0.42, 0.6, 0.76, 0.9, 1, 1];
      pts = F.map((f, k) => {
        const y = top + (MOUTH - top) * f;
        let x = w * [0, 0.6, 0.9, 1, 1.02, 1.05, 1.04, 0.9, 0][k];
        if (k >= 2 && k <= 5) {
          // the socket sinks the side toward the eyeball's centre plane; the brow overhangs above it
          const sk = socket(y, z);
          x -= (x - (EYE0[0] + 0.004)) * 0.85 * sk;
          if (k === 2) x += 0.008 * gss((z - EYE0[2]) / 0.03);
        }
        if (k === 5 || k === 6) x += 0.005 * gss((z - 0.03) / 0.04); // the cheeks under the eyes
        if (k === 7 && si === UP0.length - 1) x *= 0.7;
        return [x, k === 8 ? MOUTH : y] as [number, number];
      });
    }
    return { c: [H[0], H[1], H[2] + z * K] as V3, s: [K, K] as [number, number], p: pts };
  });
}
function jawStations(): Station[] {
  return LO0.map((s) => {
    const { bot: b, w } = s, m = MOUTH - 0.002;
    const pts: [number, number][] = [[0, m], [w * 0.8, m], [w * 0.95, m - 0.006], [w * 1.0, m + (b - m) * 0.28], [w * 0.98, m + (b - m) * 0.52], [w * 0.92, m + (b - m) * 0.73], [w * 0.76, m + (b - m) * 0.9], [w * 0.42, b + 0.002], [0, b]];
    return { c: [H[0], H[1], H[2] + s.z * K] as V3, s: [K, K] as [number, number], p: pts };
  });
}
/** the front edge of the hatchet at a height (axe units): the front-most station that reaches it */
function edgeZ(y: number): number {
  if (y >= MOUTH) {
    for (let i = UP0.length - 1; i >= 4; i--) if (UP0[i].top >= y) { const j = Math.min(UP0.length - 1, i + 1); const f = UP0[j].top < y ? cl((UP0[i].top - y) / Math.max(1e-6, UP0[i].top - UP0[j].top), 0, 1) : 1; return UP0[i].z + (UP0[j].z - UP0[i].z) * f; }
    return UP0[4].z;
  }
  for (let i = LO0.length - 1; i >= 2; i--) if (LO0[i].bot <= y) { const j = Math.min(LO0.length - 1, i + 1); const f = LO0[j].bot > y ? cl((y - LO0[i].bot) / Math.max(1e-6, LO0[j].bot - LO0[i].bot), 0, 1) : 1; return LO0[i].z + (LO0[j].z - LO0[i].z) * f; }
  return LO0[2].z;
}

// ------------------------------------------------------------------------------------------------ paint
const STEEL = RP('axeSteel'), RUST = RP('rust'), GUM = RP('gum'), HICK = RP('hickory'), HEART = RP('heart'), HORN = RP('horn'), INK = RP('ink'), FLESH = RP('flesh'), BONE = RP('bone');
/** the fur on the head lies back from the nose and down the cheeks; on the chin (the beard) it hangs down */
const headFlow = (p: V3): V3 => { const y = (p[1] - H[1]) / K, z = (p[2] - H[2]) / K; return y < MOUTH - 0.02 && z > 0.11 ? [0, -1, 0.15] : [0, -0.35 - Math.max(0, 0.02 - y) * 12, -1]; };
/** head-local axe units of a creature-space point */
const hl = (P: Float32Array, i: number): V3 => [(P[i * 3] - H[0]) / K, (P[i * 3 + 1] - H[1]) / K, (P[i * 3 + 2] - H[2]) / K];
const EYES: Hollow[] = [1, -1].map((s) => ({ c: HL(s * EYE0[0], EYE0[1], EYE0[2]), r: EYER * K * 1.75, k: 1.4 }));
/** the cream muzzle: below a line rising from the mouth corner to the nose, and the whole lower jaw */
const muzzleLine = (z: number) => MOUTH + 0.006 + cl((z - 0.066) / 0.14, 0, 1) * 0.05;

function headPaint(part: 'skull' | 'jaw') {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, n = px.n;
    const mouth = new Uint8Array(n), steel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = hl(P, i), ax = Math.abs(x), ny = N[i * 3 + 1];
      // the inside of the mouth: gum, a darker throat, the ridged palate
      if (part === 'skull' ? ny < -0.55 && y < MOUTH + 0.008 && ax < wAt(z) * 0.86 && z > -0.03 : ny > 0.55 && y > MOUTH - 0.01 && ax < wAt(z) * 0.82) {
        const deep = cl((0.2 - z) / 0.2, 0, 1), ridge = part === 'skull' && Math.abs(Math.sin(z * 240)) < 0.25 && ax < wAt(z) * 0.5;
        px.put(i, GUM, 3.4 - deep * 1.8 - (ridge ? 0.8 : 0)); px.rough[i] = 140; mouth[i] = 1; continue;
      }
      // steel-grey fur, a little darker on the crown and the back of the poll
      px.put(i, STEEL, 4.5);
      px.rough[i] = 215;
      // the honed bevel: a band of polished steel down the front edge, above the nose (the toe) and down the bit of the
      // chin (the beard), with grinding marks; the edge itself brightest
      const de = edgeZ(y) - z;
      const band = 0.03 + 0.004 * Math.sin(y * 90);
      if (part === 'jaw' && de < band * 0.4 && y < MOUTH - 0.03) steel[i] = de < 0.005 ? 2 : 1;
    }
    yield;
    const hp = hand(px, { flow: headFlow, seed: part === 'skull' ? 41 : 43 });
    const cream = (step: number) => ({ ramp: HICK, step });
    hp.zones([
      // the crown and the back of the poll a shade darker
      { w: (p) => { const [, y, z] = [0, (p[1] - H[1]) / K, (p[2] - H[2]) / K]; return ss01((y - 0.035) / 0.03) * (z < 0.14 ? 1 : ss01((0.2 - z) / 0.06)); }, add: -0.7 },
      // the cream muzzle and lips, the whole lower jaw and the chin's beard
      { w: (p) => { const y = (p[1] - H[1]) / K, z = (p[2] - H[2]) / K; return part === 'jaw' ? 1 : ss01((muzzleLine(z) - y) / 0.012 + 0.5); }, ...cream(5.6) },
      // fluffy cream cheeks under the eyes
      { w: (p) => { const x = Math.abs(p[0] - H[0]) / K, y = (p[1] - H[1]) / K, z = (p[2] - H[2]) / K; return 1.4 - Math.hypot((x - 0.055) / 0.03, (y - 0.0) / 0.024, (z - 0.035) / 0.04); }, ...cream(5.2) },
      // a pale blaze down the bridge of the nose to the toe of the hatchet
      { w: (p) => { const x = Math.abs(p[0] - H[0]) / K, y = (p[1] - H[1]) / K, z = (p[2] - H[2]) / K; return ss01((0.01 + (z - 0.08) * 0.06 - x) / 0.006) * ss01((z - 0.08) / 0.02) * ss01((y - 0.035) / 0.01); }, ramp: STEEL, step: 5.8 },
      // tan "points" over the eyes, as a dog's markings
      { w: (p) => { const x = Math.abs(p[0] - H[0]) / K, y = (p[1] - H[1]) / K, z = (p[2] - H[2]) / K; return 1.3 - Math.hypot((x - 0.04) / 0.016, (y - 0.069) / 0.01, (z - 0.03) / 0.018); }, ...cream(5.0) },
    ], { soft: 0.6, edge: 0.4, mask: (i) => (mouth[i] ? 0 : 1) });
    for (let i = 0; i < n; i++) {
      if (mouth[i]) continue;
      const [x, y, z] = hl(P, i), ax = Math.abs(x);
      if (steel[i]) {
        px.put(i, STEEL, steel[i] > 1 ? 7.4 : 6.2 + (Math.abs(Math.sin((z * 0.6 + y * 0.8) * 300)) < 0.2 ? -0.7 : 0));
        px.metal[i] = 235; px.rough[i] = steel[i] > 1 ? 35 : 70;
      }
      // the lips: dark leather along the mouth line, the upper lip's edge overhanging the lower
      const lip = Math.abs(y - MOUTH);
      if (lip < 0.0065 && z > 0.02 && !steel[i]) { px.put(i, HORN, lip < 0.003 ? 1 : 2.2); px.rough[i] = 120; }
      // whisker spots: little dark pits in rows on the cream muzzle, and a few bristles above the eyes
      if (part === 'skull' && ax > 0.015) {
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          if (r * 3 + c >= 8 || (c === 3 && r !== 1)) continue;
          const wy = MOUTH + 0.013 + r * 0.008 + c * 0.0015, wz = 0.138 + c * 0.013 - r * 0.004 + (r & 1) * 0.006;
          if (Math.hypot(y - wy, z - wz) < 0.0019) px.put(i, HICK, 2.6);
        }
      }
    }
    yield;
    hp.form({ light: 2.2, ao: 1.8, cavity: 1.4, ridge: 0.7 });
    hp.hollows(EYES);
    hp.hollows([{ c: HL(0, MOUTH, 0.03), r: 0.05 * K, k: 0.4 }]);
    yield;
    hp.strokes({ len: [4, 9], width: [2, 3], amp: 0.5, crisp: true, gap: 0.35, tip: 0.5, root: 0.3, mask: (i) => (mouth[i] || steel[i] ? 0 : 1) });
    hp.strokes({ flow: 'across', len: [3, 6], width: [1, 2], amp: 0.5, seed: 9, mask: (i) => (steel[i] ? 1 : 0) });
    px.flush();
  };
}
const ss01 = (x: number) => { const t = cl(x, 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ paint: the handle
interface Knot { s: number; a: number; r: number }
/** the body (and the tail): hickory fur. A heartwood saddle down the back with a few narrow streaks lower on the
 *  flanks (the grain), a cream bib, belly and fringe, knots as dark swirled spots; brush strokes combed back along the
 *  handle, dark underfur between the clumps (the shell fur grows from these colours) */
function hickoryPaint(F: Frame, knots: Knot[], o: { bib?: (s: number, a: number) => number; zone?: 'body' | 'tail'; flow?: V3 } = {}) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, n = px.n;
    const S = new Float32Array(n), A = new Float32Array(n), Rr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if ((i & 8191) === 0) yield;
      const L = locate(F, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      S[i] = L.s; A[i] = L.a; Rr[i] = L.r;
      px.put(i, HICK, 4.4 + (Math.abs(L.a) > 2.2 ? 0.4 : 0));
      px.rough[i] = 210;
    }
    yield;
    const hp = hand(px, { flow: o.flow ?? [0, -0.25, -1], seed: o.zone === 'tail' ? 61 : 53 });
    const wob = (s: number, a: number) => Math.sin(s * 9 + a * 2) * 0.08 + Math.sin(s * 23 + 1.3) * 0.04;
    hp.zones([
      // the heartwood saddle down the back, its edge wandering like the grain
      { w: (_p, _n, i) => ss01((0.7 + wob(S[i], A[i]) - Math.abs(A[i])) / 0.18 + 0.5), ramp: HEART, step: 4.2 },
      // two narrow streaks lower on the flanks (the grain showing through)
      { w: (_p, _n, i) => ss01((0.07 - Math.abs(Math.abs(A[i]) - 1.45 - wob(S[i] * 1.7, 0) * 1.5)) / 0.05) * ss01((S[i] - 0.15) / 0.1), ramp: HEART, step: 4.6 },
      // the cream bib, belly and fringe
      { w: (_p, _n, i) => (o.bib ? o.bib(S[i], A[i]) : 0), ramp: HICK, step: 5.7 },
      // knots: dark swirled spots
      { w: (_p, _n, i) => { let k = 0; for (const kn of knots) { const ds = (S[i] - kn.s) / (kn.r * 2.2), da = ((A[i] - kn.a) * Rr[i]) / kn.r; k = Math.max(k, 1.3 - Math.hypot(ds, da)); } return k; }, ramp: HEART, step: 3.0, edge: 0.4 },
    ], { soft: 0.65, edge: 0.45 });
    // the knots' rings
    for (let i = 0; i < n; i++) for (const kn of knots) { const ds = (S[i] - kn.s) / (kn.r * 2.2), da = ((A[i] - kn.a) * Rr[i]) / kn.r, d = Math.hypot(ds, da); if (d < 0.95 && Math.floor(d * 4) % 2 === 1) px.mark[i] += 0.8; }
    yield;
    hp.form({ light: 2.4, ao: 2.2 });
    yield;
    hp.strokes({ len: [6, 13], width: [2, 3], amp: 0.5, crisp: true, gap: 0.5, tip: 0.6, root: 0.35, dabs: [{ ramp: HEART, step: 3.6, share: 0.04 }] });
    yield;
    px.flush();
  };
}
/** limbs: hickory fur combed down the leg, heartwood socks with a ragged top, leathery pads, longer feathering behind */
function legPaint(fore: boolean) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, n = px.n, pad = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const py = P[i * 3 + 1], ny = N[i * 3 + 1];
      // pads and the underside of the toes: dark leather in little domed pads
      if (py < 0.03 && ny < -0.35) { px.put(i, HORN, 2.6); px.rough[i] = 190; pad[i] = 1; continue; }
      px.put(i, HICK, 4.4); px.rough[i] = 210;
    }
    const hp = hand(px, { flow: [0, -1, fore ? 0.08 : -0.08], seed: fore ? 71 : 73 });
    hp.zones([
      // the heartwood socks
      { w: (p) => ss01(((fore ? 0.11 : 0.1) - p[1]) / 0.03 + 0.5), ramp: HEART, step: 3.8 },
      // a cream flash on the front of the forearm
      { w: (p, nn) => (fore ? ss01((nn[2] - 0.5) / 0.3) * ss01((p[1] - 0.13) / 0.04) * ss01((0.26 - p[1]) / 0.04) : 0), ramp: HICK, step: 5.4 },
    ], { soft: 0.6 });
    for (let i = 0; i < n; i++) if (pad[i]) { const c = Math.abs(Math.sin(P[i * 3] * 220) * Math.sin(P[i * 3 + 2] * 220)); px.mark[i] += c > 0.6 ? 0.8 : c < 0.1 ? -0.8 : 0; }
    hp.form({ light: 2.2, ao: 2.4 });
    hp.strokes({ len: [4, 9], width: [2, 3], amp: 0.5, crisp: true, gap: 0.5, tip: 0.5, root: 0.3, mask: (i) => (pad[i] ? 0 : 1) });
    px.flush();
  };
}
function clawPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), N = px.gb.N;
  for (let i = 0; i < px.n; i++) { px.put(i, HORN, 2 + (N[i * 3 + 1] > 0.4 ? 1 : 0)); px.rough[i] = 70; }
  hand(px, { flow: 'sweep' }).form({ light: 1.6, ao: 0.8, ridge: 1.4 });
  px.flush();
}
/** the floppy ears: heartwood-brown fur outside with long strokes down the flap, the inner bowl pink skin with a
 *  fringe of cream hair at the rim */
function earPaint(out: V3) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), N = px.gb.N;
    px.base((i) => { const inner = N[i * 3] * out[0] + N[i * 3 + 1] * out[1] + N[i * 3 + 2] * out[2] < -0.2; return inner ? [FLESH, 4.2] : [HEART, 4.2]; });
    const hp = hand(px, { flow: 'sweep', seed: 81 });
    hp.zones([{ w: (_p, nn) => { const d = nn[0] * out[0] + nn[1] * out[1] + nn[2] * out[2]; return d < -0.2 ? ss01((0.5 - Math.abs(d)) / 0.25) : 0; }, ramp: HICK, step: 5 }], { soft: 0.7 });
    hp.form({ light: 2, ao: 2.4, cavity: 1.8 });
    hp.strokes({ len: [5, 11], width: [2, 3], amp: 0.5, crisp: true, gap: 0.5, tip: 0.6, mask: (i) => (px.rampT[px.rampI[i]] === FLESH ? 0.3 : 1) });
    px.flush();
  };
}
/** brow tufts: cream fur in strokes along the crescent */
function browPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  px.base(() => [HICK, 5.4]);
  hand(px, { flow: 'sweep', seed: 91 }).form({ light: 2, ao: 1.2 }).strokes({ len: [3, 7], width: [1, 2], amp: 0.7, gap: 0.4, tip: 0.6 });
  px.flush();
}
/** the nose: wet black leather, pebbled, two carved comma nostrils, a groove down the middle, a hard wet shine */
function nosePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P;
  px.base(() => [HORN, 2.6]);
  for (let i = 0; i < px.n; i++) {
    const [x, y, z] = hl(P, i), ax = Math.abs(x);
    for (const sx of [1, -1]) { const dx = x - sx * 0.0072, dy = y - 0.006; if (Math.hypot(dx * 1.05, dy * 1.7) < 0.0045 && z > 0.21) px.put(i, INK, 0); }
    if (ax < 0.0016 && y < 0.008) px.mark[i] -= 1.5;
    if ((Math.floor(x * 1400) + Math.floor(y * 1400) * 3) % 5 === 0) px.mark[i] -= 0.5;
    px.rough[i] = 40;
  }
  const hp = hand(px, { flow: 'across', seed: 97 }).form({ light: 2.4, ao: 1, cavity: 2 });
  hp.wet(() => 1, { ramp: RP('snow'), thr: 0.93, rough: 25 });
  px.flush();
}
/** the tongue: pink, darker at the sides, a groove down the middle, wet glints */
function tonguePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.base(() => [FLESH, 4.2]);
  for (let i = 0; i < px.n; i++) { const x = (P[i * 3] - H[0]) / K; if (Math.abs(x) < 0.0018 && N[i * 3 + 1] > 0.5) px.mark[i] -= 1.3; px.rough[i] = 35; }
  const hp = hand(px, { flow: 'sweep', seed: 99 }).form({ light: 1.8, ao: 1.2 });
  hp.wet((i) => (N[i * 3 + 1] > 0.3 ? 1 : 0), { thr: 0.95 });
  px.flush();
}
function gumPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  px.base(() => [GUM, 2.2]);
  hand(px, { flow: 'sweep' }).form({ light: 1.2, ao: 0.4 }).strokes({ len: [3, 5], width: [1, 2], amp: 0.5 });
  for (let i = 0; i < px.n; i++) px.rough[i] = 140;
  px.flush();
}
function toothPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  px.base(() => [BONE, 4.6]);
  hand(px, { flow: 'sweep' }).form({ light: 1.4, ao: 0.6 });
  for (let i = 0; i < px.n; i++) px.rough[i] = 60;
  px.flush();
}

// ------------------------------------------------------------------------------------------------ the build
/** the IndexedDB cache key: bump it whenever anything that shapes or paints this model changes */
export const HOUND_MODEL_VERSION = 'hound@6';
export interface HoundModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }

/** build the model straight through (blocks for a few seconds) */
export function buildHoundModel(o: { page?: number; den?: number } = {}): HoundModel { return runSync(houndModelGen(o)); }
/** build the model in slices of ~30 ms, yielding to the event loop between them */
export function buildHoundModelAsync(o: { page?: number; den?: number } = {}): Promise<HoundModel> { return runAsync(houndModelGen(o)); }
/** the build as steps (see Body.buildGen) */
export function* houndModelGen(o: { page?: number; den?: number } = {}): Generator<string | void, HoundModel> {
  const bones = houndBones(), bi = (n: string) => bones.findIndex((b) => b.name === n);
  const body = new Body(o.page ?? 1024);
  body.seed = 1871;

  // the spine (tail root .. head) for skinning and the painters
  // the neck's top runs up inside the poll (the handle through the axe's eye): from the poll's underside it rides the head
  const J: V3[] = [[0, 0.372, -0.66], [0, 0.35, -0.47], [0, 0.345, -0.28], [0, 0.33, -0.05], [0, 0.34, 0.2], [0, 0.42, 0.455], [0, 0.5, 0.545], [0, 0.535, 0.585], [0, 0.66, 0.7]];
  const spineSkin = chainSkin(J, [bi('pelvis'), bi('loin'), bi('root'), bi('root'), bi('chest'), bi('neck'), bi('neck2'), bi('head')], 0.3);
  const F = spineFrame([[0, 0.372, -0.66], [0, 0.35, -0.47], [0, 0.345, -0.28], [0, 0.33, -0.05], [0, 0.31, 0.2], [0, 0.36, 0.4], [0, 0.44, 0.48], [0, 0.52, 0.56], [0, 0.585, 0.64]]);
  const knots: Knot[] = [{ s: 0.38, a: 1.55, r: 0.022 }, { s: 0.74, a: -1.2, r: 0.016 }, { s: 0.95, a: 1.9, r: 0.012 }, { s: 0.2, a: -2.0, r: 0.014 }];
  const sRump = locate(F, [0, 0.36, -0.58]).s, sChest = locate(F, [0, 0.38, 0.38]).s;
  const bib = (s: number, a: number) => cl((Math.abs(a) - 1.95) * 2.4, 0, 1) * (s > sRump + 0.12 ? 1 : 0) * (s > sChest - 0.42 ? 1 : 0.55) + (s > sChest - 0.05 && Math.abs(a) > 1.5 ? 0.6 : 0);

  // ---- the trunk: rump knob .. hips .. loin tuck .. barrel .. deep keel .. shoulders .. neck rising into the poll
  const st: Station[] = [
    { c: [0, 0.372, -0.665], s: [0.05, 0.05], p: 'keel' },
    { c: [0, 0.37, -0.63], s: [0.08, 0.076], p: 'keel' },
    { c: [0, 0.36, -0.575], s: [0.108, 0.1], p: 'hips' },
    { c: [0, 0.352, -0.47], s: [0.128, 0.122], p: 'hips' },
    { c: [0, 0.35, -0.33], s: [0.118, 0.115], p: 'keel', tw: [[7, 0, 0.06], [8, 0, 0.08]] },
    { c: [0, 0.333, -0.16], s: [0.126, 0.133], p: 'barrel' },
    { c: [0, 0.305, 0.01], s: [0.138, 0.165], p: 'pear' },
    { c: [0, 0.297, 0.17], s: [0.144, 0.182], p: 'barrel' },
    { c: [0, 0.31, 0.3], s: [0.136, 0.185], p: 'shoulder' },
    { c: [0, 0.35, 0.4], s: [0.112, 0.15], p: 'slab', tw: [[8, 0, -0.1], [7, 0.03, -0.08]] },
    { c: [0, 0.43, 0.465], s: [0.088, 0.105], p: 'crest' },
    { c: [0, 0.5, 0.535], s: [0.072, 0.082], p: 'crest' },
    { c: [0, 0.57, 0.6], s: [0.056, 0.06], p: 'neck' },
  ];
  const torso = body.add(trunk({
    name: 'trunk', stations: st, tween: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], capS: true, capE: false, k: 1.0, levels: 1,
    rings: [{ at: 1, s: 1, ink: false }],
    skin: (p) => spineSkin(p), paint: hickoryPaint(F, knots, { bib }),
  }));
  body.finalize(torso);
  yield;

  // ---- the hatchet head: the upper head on the head bone, the lower jaw on the jaw bone
  const hb = bi('head'), jb = bi('jaw');
  const skull = body.add(trunk({
    name: 'skull', stations: upperStations(), tween: 0, capS: true, capE: true, k: 2.4, levels: 2,
    rings: [{ at: UP.length - 1, s: 1 }],
    cols: [{ j: 7, a: 4, b: UP.length - 1, s: 1.2 }],
    skin: () => [hb, 1], paint: headPaint('skull'),
  }));
  body.finalize(skull);
  yield;
  body.add(trunk({
    name: 'jaw', stations: jawStations(), tween: 0, capS: true, capE: true, k: 2.0, levels: 1,
    cols: [{ j: 2, a: 1, b: LO.length - 1, s: 1 }],
    skin: () => [jb, 1], paint: headPaint('jaw'),
  }));
  // little white teeth: two small fangs and a few pegs in each jaw (a puppy's grin)
  let tk = 0;
  for (const side of [1, -1]) for (const up of [1, -1]) {
    const zs = up > 0 ? [0.107, 0.136, 0.163] : [0.116, 0.155];
    zs.forEach((z, k) => {
      const w = wAt(z) * K, fang = k === zs.length - 1;
      const at: V3 = [H[0] + side * w * 0.66, H[1] + (MOUTH + up * 0.0015) * K, H[2] + z * K];
      body.add(spine({ name: 'tooth' + tk++, at, dir: [side * 0.08, -up, 0.12 * up], len: (fang ? 0.011 : 0.006) * K, r: (fang ? 0.0042 : 0.0034) * K, skin: () => [up > 0 ? hb : jb, 1], paint: toothPaint, levels: 0, around: 5, k: 1.2 }));
    });
  }
  // the cheeks and throat that close the sides and back of the mouth as the jaw drops
  body.add(mouthWebs({ name: 'mouthweb', corner: HL(wAt(0.1) * 0.9, MOUTH, 0.1), back: 0.1 * K, half: 0.006 * K, throat: 0.03 * K, upper: hb, lower: jb, paint: gumPaint }));
  // the eyes, seated in their sockets under thick almond lids
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const c: V3 = [H[0] + side * EYE[0], H[1] + EYE[1], H[2] + EYE[2]], ax: V3 = [side * EYE_AX[0], EYE_AX[1], EYE_AX[2]];
    body.add(paintedEye({ name: 'eye' + s, c, ax, r: EYER * K, bone: bi('eye' + s), iris: RP('ochre'), pupil: 'round', irisA: 0.78, pupilR: 0.44, side, glint: [0.3, 0.36], glintR: 0.22, k: 4, around: 12 }));
    const lp = lids({ name: 'lid' + s, c, ax, r: EYER * K, bone: bi('lid' + s), lowBone: bi('lidLo' + s), upper: 0.6, lower: 1.0, corner: 1.34, tilt: -0.06, side, thick: 0.24, thickLo: 0.16, k: 2.2,
      paint: lidPaint(STEEL, 4.4, { c, ax, r: EYER * K, lash: INK }) });
    lp[0].name = 'lid' + s; lp[1].name = 'lidLo' + s;
    lp[1].paint = lidPaint(HICK, 5.2, { c, ax, r: EYER * K, lower: true });
    for (const q of lp) body.add(q);
  }
  // brow tufts: crescents of cream fur arching over each eye (they rise, fall and tilt with the mood)
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const bc = HL(side * BROW0[0], BROW0[1], BROW0[2]);
    const path = curve([HL(side * (BROW0[0] - 0.02), BROW0[1] - 0.006, BROW0[2] + 0.012), HL(side * (BROW0[0] - 0.004), BROW0[1] + 0.002, BROW0[2] + 0.008), HL(side * (BROW0[0] + 0.012), BROW0[1] + 0.001, BROW0[2] - 0.004), HL(side * (BROW0[0] + 0.022), BROW0[1] - 0.008, BROW0[2] - 0.016)], 7);
    body.add(stalk({ name: 'brow' + s, path, r: (t) => (0.0045 + 0.004 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * K, around: 6, capS: true, capE: true, levels: 1, k: 2.2,
      sec: (a) => (Math.cos(a) > 0 ? 1.0 : 0.6), skin: () => [bi('brow' + s), 1], paint: browPaint }));
    void bc;
  }
  // floppy ears: cupped flaps hanging from the sides of the poll, breaking over at a fold near the root
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const root = HL(side * EAR0[0], EAR0[1], EAR0[2]), eb = bi('ear' + s), out: V3 = norm([side, 0.15, -0.05]);
    body.add(earFlap({ name: 'ear' + s, root, dir: norm([side * 0.6, -0.7, -0.05]), out, len: 0.115 * K, wid: 0.068 * K, thick: 0.01 * K, cup: 0.22, widest: 0.55, blunt: 0.85, fold: 0.18, foldAng: 1.15, levels: 2, k: 1.6,
      skin: (p) => { const d = (root[1] - p[1]) / 0.026; const t = cl(d, 0, 1); return t <= 0 ? [hb, 1] : t >= 1 ? [eb, 1] : [hb, 1 - t, eb, t]; },
      paint: earPaint(out) }));
  }
  // the nose: a wet leather pad wrapped over the front of the muzzle: wide and flat-topped, the nostrils' wings either
  // side, a notch under it, sunk into the front of the head so only its front stands out
  {
    const ns: Station[] = [[0.193, 1.0, 1.0], [0.205, 1.02, 1.0], [0.213, 0.96, 0.92], [0.218, 0.8, 0.74], [0.221, 0.5, 0.42]].map(([z, kw, kh]) => ({
      c: HL(0, 0.011, z), s: [0.021 * kw * K, 0.0155 * kh * K] as [number, number],
      p: [[0, 1], [0.52, 0.98], [0.88, 0.8], [1, 0.36], [0.96, -0.1], [0.8, -0.5], [0.44, -0.78], [0.14, -0.82], [0, -0.62]],
    }));
    body.add(trunk({ name: 'nose', stations: ns, tween: 0, capS: true, capE: true, levels: 1, k: 3.2, skin: () => [hb, 1], paint: nosePaint }));
  }
  // the tongue, folded in the lower jaw until it lolls out of the side of the mouth: flat, rounded, grooved
  {
    const tp = curve([HL(0, MOUTH - 0.014, 0.03), HL(0, MOUTH - 0.012, 0.066), HL(0, MOUTH - 0.01, 0.099), HL(0, MOUTH - 0.012, 0.123)], 6);
    body.add(stalk({ name: 'tongue', path: tp, r: (t) => (0.016 - t * t * 0.006) * K, around: 8, capS: true, capE: true, levels: 1, k: 1.4, sec: (a) => (Math.abs(Math.cos(a)) > 0.7 ? 0.32 : 1.0), skin: () => [bi('tongue'), 1], paint: tonguePaint }));
  }

  // ---- legs
  const legPieces: { name: string; hip: V3; knee: V3; hock?: V3; sole: V3; side: 1 | -1; fore: boolean; r: number; padH: number; bones: { parent: number; up: number; lo: number; mid?: number; foot: number } }[] = [];
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const m = (p: V3): V3 => (side > 0 ? p : mirror(p));
    const f = LEGS.fl, h = LEGS.hl;
    legPieces.push({ name: 'fleg' + s, hip: m(f.hip), knee: m(f.knee), sole: m(f.sole), side, fore: true, r: f.r, padH: f.padH, bones: { parent: bi('chest'), up: bi('fu' + s), lo: bi('fl' + s), foot: bi('ff' + s) } });
    legPieces.push({ name: 'hleg' + s, hip: m(h.hip), knee: m(h.knee), hock: m(h.hock), sole: m(h.sole), side, fore: false, r: h.r, padH: h.padH, bones: { parent: bi('pelvis'), up: bi('hu' + s), lo: bi('hl' + s), mid: bi('hm' + s), foot: bi('hf' + s) } });
  }
  for (const L of legPieces) {
    const three = !!L.hock, tj = three ? [0, 0.4, 0.74, 1] : [0, 0.5, 1];
    const pts = three ? [L.hip, L.knee, L.hock!, L.sole] : [L.hip, L.knee, L.sole];
    const segL = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1], p[2] - pts[k][2]));
    let rings: LimbRing[] = legRings(L.fore ? 'bear' : 'paw', L.fore, L.r, tj, segL, L.padH);
    // stubby and strong: fatten the upper limb, keep the buried top inside the trunk
    rings = rings.map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.7 : r.t < 0 ? 0.82 : r.t < 0.3 ? (L.fore ? 0.9 : 1.0) : 1.0) }));
    const foot: FootSpec = {
      pad: L.r * (L.fore ? 0.76 : 0.68), h: L.padH, fwd: 0.32, nail: 'claw', lobe: 0.26, toeAround: 6,
      toes: [-38, -13, 13, 38].map((a, k) => ({ a, len: L.r * (k === 1 || k === 2 ? 0.44 : 0.34), r: L.r * 0.21, claw: L.r * (L.fore ? 0.44 : 0.32) * (k === 1 || k === 2 ? 1 : 0.85), curl: 0.55, drop: 0.3 })),
    };
    if (L.fore) foot.toes.push({ a: -105, len: L.r * 0.04, r: L.r * 0.11, claw: L.r * 0.2, curl: 0.8, drop: -0.5 });
    const out = limb({
      name: L.name, side: L.side, hip: L.hip, knee: L.knee, hock: L.hock, sole: L.sole, tj, rings, foot, around: 12, levels: 1, rise: 0.08,
      bones: L.bones, paint: legPaint(L.fore), clawPaint, k: 1.05,
    });
    out.claws.levels = 0; out.toes.levels = 1;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
    yield;
  }

  // ---- the whip tail
  const tailBones = [0, 1, 2, 3, 4, 5].map((k) => bi('tail' + k));
  const tailSkin = chainSkin([...TAIL_PTS.slice(0, 6), TAIL_PTS[6]], tailBones, 0.4);
  const TF = spineFrame(TAIL_PTS);
  const tailPath = curve(TAIL_CTRL, 10);
  const tail = body.add(stalk({
    name: 'tail', path: tailPath, r: (t) => 0.04 * Math.pow(1 - t, 1.0) + 0.009, around: 8, capS: false, capE: true, levels: 1, k: 1,
    sec: (a, t) => 1 + 0.12 * Math.cos(a) * (1 - t), // a little keeled on top
    skin: (p) => { const L = locate(TF, p); return L.s < 0.02 ? [bi('pelvis'), 0.5, tailBones[0], 0.5] : tailSkin(p); },
    paint: hickoryPaint(TF, [], { zone: 'tail', flow: [0, -0.4, -1], bib: (s) => cl((s - TF.L * 0.68) / (TF.L * 0.08), 0, 1) }),
  }));
  body.finalize(tail);
  yield;

  // ---- bristle locks: the hackles down the spine
  const seats: LockSeat[] = [];
  const g = torso.grids[0], R = g.v.length;
  const vOf = (z: number) => { let best = 0, bd = Infinity; for (let i = 0; i < R; i++) { const q = gridSurf(torso.m, g, 0.5, i / (R - 1)); const d = Math.abs(q.p[2] - z); if (d < bd) { bd = d; best = i; } } return best / (R - 1); };
  const vR = vOf(-0.56), vS = vOf(0.36), vN = vOf(0.47);
  const back: V3 = [0, 0, -1];
  seats.push(...seatsOn(torso, {
    u0: 0.45, u1: 0.55, v0: vR, v1: vN, rows: 30, cols: 3, wid: 0.0065, lift: 0.5, droop: 0.15, sink: 0.1,
    len: (u, v) => 0.024 + 0.026 * Math.exp(-(((v - vS) / 0.09) ** 2)) - Math.abs(u - 0.5) * 0.12,
    dir: (_p, n) => norm([n[0] * 0.3 + back[0], n[1] * 0.5 + 0.1, back[2] * 0.9 + n[2] * 0.2]),
    col: (u, v) => (h3(Math.floor(u * 97), Math.floor(v * 97), 2) < 0.3 ? 1 : 0), skin: spineSkin, seed: 11,
  }));
  void tail;
  const lk = locks({ name: 'bristle', seats, tiles: [HEART, RP('fur')], steps: [3, 3], seed: 7 });
  if (lk) body.add(lk);

  const out = yield* body.buildGen({ den: o.den ?? 300, maxScale: 2.2, budget: 31500, fur: HOUND_FUR });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, fur: out.fur, bones, tris: out.tris, den: body.den, stats };
}
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export type { Wt };
void RUST;

/** where the hound's fur grows (lengths in HOUND_FUR_LEN): a short plush coat over the handle, a long ruff where the
 *  neck runs into the head, a cream bib and belly fringe, feathered legs, britches on the haunches, a plume of a tail,
 *  long fur on the ears, fluffy cheeks and a beard on the chin, short velvet on the head; the eyes, lids, nose, mouth
 *  and the steel bevel stay bare */
export const HOUND_FUR_LEN = 0.065;
const EYEL = HL(EYE0[0], EYE0[1], EYE0[2]), EYER_ = HL(-EYE0[0], EYE0[1], EYE0[2]);
const HOUND_FUR = furZones([
  { piece: /^trunk/, len: 0.28, clump: 0.35, tip: 0.45 },
  { piece: /^trunk/, a: [0, 0.44, 0.44], b: [0, 0.56, 0.6], r: 0.13, len: 0.95, clump: 0.85, tip: 0.7 },
  { piece: /^trunk/, a: [0, 0.2, 0.22], b: [0, 0.34, 0.44], r: 0.12, len: 1.0, clump: 0.85, tip: 0.85 },
  { piece: /^trunk/, a: [0, 0.22, -0.4], b: [0, 0.22, 0.2], r: 0.14, facing: [0, -1, 0], min: 0.3, len: 0.7, clump: 0.7, tip: 0.6 },
  { piece: /^trunk/, a: [0, 0.37, -0.66], b: [0, 0.36, -0.5], r: 0.1, len: 0.6, clump: 0.6 },
  { piece: /^[fh]leg/, len: 0.3, clump: 0.4 },
  { piece: /^fleg/, a: [0, 0.3, 0.3], b: [0, 0.08, 0.28], r: 0.09, facing: [0, 0, -1], min: 0.2, len: 0.7, clump: 0.8, tip: 0.6 },
  { piece: /^hleg/, a: [0, 0.33, -0.47], b: [0, 0.19, -0.42], r: 0.1, len: 0.65, clump: 0.7 },
  { piece: /^[fh]leg/, y: [-1, 0.045], bare: true },
  { piece: /^tail/, len: 0.55, clump: 0.6 },
  { piece: /^tail/, a: [0, 0.35, -1.0], b: [0, 0.25, -1.3], r: 0.12, len: 1.0, clump: 0.95, tip: 0.9 },
  { piece: /^ear/, len: 0.45, clump: 0.85, tip: 0.5 },
  { piece: /^brow/, len: 0.3, clump: 0.9, tip: 0.8 },
  // the head: short velvet, fluffy cheeks, a beard on the chin; bare round the eyes, on the lips, nose and bevel
  { piece: /^(skull|jaw)/, a: HL(0.057, -0.01, -0.005), b: HL(0.054, -0.016, 0.06), r: 0.03, len: 0.45, clump: 0.85, tip: 0.85 },
  { piece: /^(skull|jaw)/, a: HL(-0.057, -0.01, -0.005), b: HL(-0.054, -0.016, 0.06), r: 0.03, len: 0.45, clump: 0.85, tip: 0.85 },
  { piece: /^jaw/, a: HL(0, -0.1, 0.15), b: HL(0, -0.115, 0.18), r: 0.035, len: 0.32, clump: 0.9, tip: 0.8 },
  { piece: /^(skull|jaw)/, a: EYEL, r: EYER * K * 1.6, soft: 0.3, bare: true },
  { piece: /^(skull|jaw)/, a: EYER_, r: EYER * K * 1.6, soft: 0.3, bare: true },
  { piece: /^(skull|jaw)/, y: [H[1] + (MOUTH - 0.009) * K, H[1] + (MOUTH + 0.009) * K], bare: true },
  { piece: /^skull/, a: HL(0, 0.012, 0.207), b: HL(0, 0.03, 0.225), r: 0.03, bare: true },
]);
