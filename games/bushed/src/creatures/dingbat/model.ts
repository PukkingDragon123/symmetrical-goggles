// DINGBAT: model. A little bat-owl of the cabin eaves (wingspan about half a metre): a fluffy owl's body and a big
// round owl head with a pale facial disc ringed in dark feathers, two little forked deer-antler nubs in velvet on
// its crown, huge amber eyes and, under them, a mouth far too big for it: a frog-wide gape that opens to a wet red
// throat with a row of needle teeth. Its wings are a bat's (a leathery membrane stretched over long fingers, a hook
// of a thumb at the wrist, scalloped between the finger tips) but feathered: coverts over the arm, a fringe of soft
// owl flight feathers along the trailing edge, a barred fan of a tail, feathered trousers down to taloned toes.
// Body and head feathers are real geometry (locks drawn as feathers, cards.ts).
// v7 (sculpted): the head is carved (dingbat/face.ts): a concave owl's dish of a face ringed by a raised ruff, the big
// eyes deep in sockets under heavy scowling brow ridges, lens-shaped between thick lids, a short pug bat's muzzle with
// an upturned nose pad, flared nostrils, a split lip and a leaf of skin standing on the nose, big cupped bat's ears
// with ridged bowls; the wing's membrane stretched between real finger bones (metacarpals and phalanges with knuckles,
// a clawed thumb at the wrist, the elbow and wrist standing out); feet of four knuckled toes with hooked, keeled
// talons. Painted from the form with brush strokes along the feathers' lie.
// Creature space: metres, +z forward, +y up, in FLIGHT REST POSE: the body level, wings spread flat, legs trailing
// back under the tail; the root bone (the body's centre) is the origin. The roost turns the whole bat head-down to
// hang it by the talons (DB.grip).
import * as THREE from 'three';
import {
  Body, runSync, runAsync, trunk, eyeball, locks, stalk, horn, fin, spine, curve, chainSkin, gridSurf, Px, RP, cell3, h3, cl, newCM, tube,
  type V3, type Wt, type Piece, type Chart, type Station, type LockSeat, type Ring,
} from '../anatomy';
import { fbm3 } from '../paintkit';
import { dbHeadSurf, DB_COLS, DB_ROWS, DB_EYE, DB_NOSE } from './face';
import { almondLid, cupEar, eyePaint, strokes, formLight, alongFlow, lidCoords, type LidSpec } from '../wildlife/organic';
import { cardPaint } from '../cards';
import type { BoneDef } from '../rig';
import { furZones } from '../fur/paint';

export const DINGBAT_MODEL_VERSION = 'dingbat@7';
export interface DingbatModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }

/** landmarks (left side; the right is the mirror in x) */
export const DB = {
  /** the neck pivot and the centre of the round head */
  neck: [0, 0.016, 0.058] as V3, hc: [0, 0.03, 0.098] as V3,
  /** head half width, half height, half depth */
  hw: 0.05, hh: 0.046, hd: 0.043,
  /** the jaw hinge (back corners of the gape) */
  hinge: [0, 0.011, 0.072] as V3,
  eye: [0.021, 0.038, dbEyeZ()] as V3, eyeR: 0.0135,
  antler: [0.024, 0.066, 0.094] as V3,
  /** shoulder, elbow, wrist; the finger tips (digit 2 the wingtip .. 5 the innermost), the membrane's body attachment */
  S: [0.032, 0.014, 0.03] as V3, E: [0.09, 0.016, 0.012] as V3, W: [0.148, 0.014, 0.03] as V3,
  D2: [0.258, 0.011, -0.006] as V3, D3: [0.236, 0.008, -0.062] as V3, D4: [0.196, 0.006, -0.1] as V3, D5: [0.142, 0.006, -0.1] as V3,
  B: [0.038, 0.004, -0.058] as V3, T1: [0.1, 0.006, -0.085] as V3,
  hip: [0.018, -0.022, -0.04] as V3, foot: [0.02, -0.03, -0.086] as V3,
  tail: [0, 0.003, -0.068] as V3,
  /** between the talons: the point the bat hangs from */
  grip: [0, -0.036, -0.104] as V3,
};
/** the eye's centre z (creature space): sitting in the sculpted socket, bulging out of it as an owl's eyes do */
function dbEyeZ(): number {
  let best = Math.PI, bd = 1;
  for (let k = 0; k <= 400; k++) { const th = Math.PI * (0.55 + 0.45 * k / 400), [x] = dbHeadSurf(DB_EYE.h, th), d = Math.abs(x - DB_EYE.x); if (d < bd) { bd = d; best = th; } }
  return 0.098 + dbHeadSurf(DB_EYE.h, best)[1] + DB_EYE.r * 0.3;
}
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function dingbatBones(): BoneDef[] {
  const b: BoneDef[] = [];
  const A = (name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, pos: pos as [number, number, number] });
  A('root', null, [0, 0, 0]);
  A('head', 'root', DB.neck);
  A('jaw', 'head', DB.hinge);
  A('lidL', 'head', DB.eye); A('lidR', 'head', mir(DB.eye, -1));
  A('tail', 'root', DB.tail);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('arm' + s, 'root', mir(DB.S, k)); A('fore' + s, 'arm' + s, mir(DB.E, k)); A('hand' + s, 'fore' + s, mir(DB.W, k)); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('leg' + s, 'root', mir(DB.hip, k)); A('foot' + s, 'leg' + s, mir(DB.foot, k)); }
  return b;
}

// ------------------------------------------------------------------------------------------------ colour
const FUR = RP('fur'), BONE = RP('bone'), SOIL = RP('soil'), INK = RP('ink'), STONE = RP('stone'), LEA = RP('leather'), HORN = RP('horn');
const GUM = RP('gum'), FLESH = RP('flesh'), BLOOD = RP('blood'), CORAL = RP('coral'), GOLD = RP('gold'), OCHRE = RP('ochre'), HIDE = RP('hide');

/** plumage over the body and the back of the head: shingled contour feathers, tawny with dark bars on the back,
 *  pale streaked buff on the belly */
function plumage(o: { flow?: number; size?: number } = {}) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.7;
    for (let i = 0; i < px.n; i++) {
      if ((i & 4095) === 0) yield;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1];
      const m = fbm3(x * 60, y * 60, z * 60, 2);
      // the throat at the back of the gape: dark wet red
      if (z > 0.058) { px.put(i, BLOOD, 1.6 + m); px.rough[i] = 110; continue; }
      // the belly: pale buff with dark drop-streaks; the back tawny, darker along the spine
      if (ny < -0.25 && z < 0.07) {
        const streak = Math.abs(((x * 140 + h3(Math.floor(z * 90), 1, 3) * 0.6) % 1 + 1) % 1 - 0.5) < 0.09;
        px.put(i, BONE, 3.2 + m * 0.6 - (streak ? 1.6 : 0)); px.rough[i] = 235; continue;
      }
      px.put(i, FUR, 2.6 + m * 0.7 + (ny > 0.6 ? -0.4 : 0) + (Math.abs(x) > 0.03 ? 0.3 : 0)); px.rough[i] = 235;
    }
    yield;
    px.scales({ size: o.size ?? 0.0075, kind: 'shield', flow: o.flow ?? -1, ink: 1.6, lit: 0.8, shade: 0.7, seed: 5 });
    yield;
    // bars: dark chevrons across the back feathers
    for (let i = 0; i < px.n; i++) { const y = P[i * 3 + 1], z = P[i * 3 + 2]; if (N[i * 3 + 1] > -0.2 && Math.abs(Math.sin(z * 260 + Math.abs(P[i * 3]) * 90 + y * 40)) < 0.22) px.mark[i] -= 0.9; }
    px.creaseInk(1.2, { dark: 0.9, lit: 0.5 });
    px.flush();
  };
}
/** the head: crown and nape in tawny plumage; the dish of the face pale buff feathers radiating from the eyes, sooty
 *  round the eyes, the ruff round it dark-tipped; the brows dark over their ridges; the muzzle bare dark leather with
 *  a paler, pinkish nose pad, black nostrils, the lip black at the gape; underneath, the red palate of the gape */
function headPaint() {
  const H = DB.hc;
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
    px.lightK = 0.6;
    const zone = new Uint8Array(px.n); // 0 plumage, 1 dish, 2 ruff, 3 muzzle, 4 palate
    const where = (x: number, y: number, z: number, nz: number) => {
      const ax = Math.abs(x), rd = Math.hypot(ax / 0.043, (y - 0.004) / 0.03);
      const mw = y > -0.002 ? 0.0065 + 0.0025 * Math.min(1, Math.max(0, (0.012 - y) / 0.014)) : 0.009 + 0.0035 * Math.min(1, (-0.002 - y) / 0.015);
      if (z > 0.015 && nz > 0.05 && ax < mw * 1.35 && y < 0.008 && y > -0.022) return 3;
      if (z > 0.012 && nz > 0.15 && rd < 0.9) return 1;
      if (z > 0.004 && rd < 1.12 && nz > -0.2) return 2;
      return 0;
    };
    // strokes radiate from the eyes over the dish, lie back over the crown
    const st = strokes(px, {
      flow: (p, n) => { const x = p[0] - H[0], y = p[1] - H[1], z = p[2] - H[2], ax = Math.abs(x); const w = where(x, y, z, n[2]); if (w === 1 || w === 2) return alongFlow([Math.sign(x) * (ax - DB_EYE.x), y - DB_EYE.h, 0.002])(p, n); return alongFlow([0, -0.2, -1])(p, n); },
      len: [3, 6], width: [1.6, 2.6], amp: 0.6, density: 0.8, seed: 31, apply: false,
    });
    for (let i = 0; i < px.n; i++) {
      if ((i & 4095) === 0) yield;
      const x = P[i * 3] - H[0], y = P[i * 3 + 1] - H[1], z = P[i * 3 + 2] - H[2], ax = Math.abs(x), ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      const m = fbm3(x * 80, y * 80, z * 80, 2);
      // the palate: the flat underside of the head, seen only when the gape opens: wet red ridges going dark to the
      // throat at the back (drawn straight to colour: the closed mouth's ambient occlusion would bury it in black)
      if (ny < -0.6 && y < -0.018) {
        zone[i] = 4;
        // the palate: wet gum, a few soft ridges across it, going dark into the throat at the back; outside the
        // narrow jaw's reach the lip's dark skin
        const back = cl((DB.hd * 0.9 - z) / (DB.hd * 1.7), 0, 1), w0 = 0.03 - back * 0.006;
        if (ax > w0 + 0.004) { px.put(i, LEA, 2 + m * 0.4); px.rough[i] = 150; continue; }
        if (ax > w0) { px.put(i, INK, 1); px.rough[i] = 90; continue; }
        const rug = Math.abs(Math.sin(z * 330 + ax * 60)) < 0.18 && back < 0.6;
        px.put(i, back > 0.72 ? INK : GUM, back > 0.72 ? 0.6 + (1 - back) * 2 : 3.6 - back * 2.6 + (rug ? 0.7 : 0) + m * 0.3); px.rough[i] = 60;
        continue;
      }
      const w = where(x, y, z, nz); zone[i] = w;
      const ex = ax - DB_EYE.x, ey = y - DB_EYE.h, ed = Math.hypot(ex, ey);
      if (w === 3) {
        // the muzzle: bare leather; the nose pad paler and pinkish, the nostrils black, the split lip, the lip line
        const pad = Math.hypot(ax - 0.0045, (y - DB_NOSE.h) * 0.8) < 0.0062 && nz > 0.4;
        let R = LEA, s = 2.6 + m * 0.4 + st.v[i] * 0.4;
        if (pad) { R = LEA; s = 3.6 + (ny > 0.3 ? 0.8 : 0) + st.v[i] * 0.3; if (h3(Math.floor(x / mpt), Math.floor(y / mpt), 3) < 0.25) R = HIDE; }
        if (Math.hypot(ax - 0.0042, y - DB_NOSE.h - 0.0005) < 0.0021) { R = INK; s = 0.4; }
        if (ax < mpt * 0.8 && y < -0.011) { R = INK; s = 1; }
        if (y < -0.0195) { R = INK; s = 1.2; }
        px.put(i, R, s); px.rough[i] = pad ? 80 : 150; continue;
      }
      if (w === 1) {
        // the dish: pale buff, radiating feather lines, sooty round the eyes, darker toward the ruff
        const rd = Math.hypot(ax / 0.043, (y - 0.004) / 0.03), ang = Math.atan2(ey, ex), ray = Math.abs(Math.sin(ang * 13 + ed * 260)) < 0.18;
        let R = BONE, s = 4.2 - rd * 0.9 + m * 0.3 + st.v[i] * 0.7 - (ray ? 0.5 : 0);
        if (ed < 0.0175) { R = SOIL; s = 1.0 + ed * 70 + st.v[i] * 0.4; }
        // the brows: dark feathers over the ridges, slanting down to the nose
        const by = y - (0.0175 + (ax - 0.008) * 0.42);
        if (Math.abs(by) < 0.0032 && ax > 0.003 && ax < 0.041) { R = SOIL; s = 1.3 + (by > 0 ? 0.6 : 0) + st.v[i] * 0.4; }
        // pale feathers between the eyes over the muzzle
        if (ax < 0.006 && y > 0.002 && y < 0.016) { R = BONE; s = 4.5 + st.v[i] * 0.4; }
        px.put(i, R, s); px.rough[i] = 220; continue;
      }
      if (w === 2) {
        // the ruff: dark-tipped feathers framing the face
        const ang = Math.atan2(y - 0.004, x), tip = Math.abs(Math.sin(ang * 22)) < 0.45;
        px.put(i, SOIL, 1.6 + (tip ? 0.8 : 0) + st.v[i] * 0.6 + m * 0.3); px.rough[i] = 225; continue;
      }
      px.put(i, FUR, 2.6 + m * 0.6 + (y > 0.02 ? -0.3 : 0) + st.v[i] * 0.7); px.rough[i] = 235;
    }
    yield;
    px.scales({ size: 0.0062, kind: 'shield', flow: -1, ink: 1.4, lit: 0.8, mask: (i) => (zone[i] === 0 ? 1 : 0), seed: 9 });
    formLight(px, 0.6);
    px.creaseInk(0.8, { dark: 1.1, lit: 0.6, mask: (i) => (zone[i] === 4 ? 0 : 1) });
    px.flush();
  };
}
/** a bat's ear: dark leather outside with a fringe of fur at its root; inside a ruddy bowl crossed by fine ridges, the
 *  rim darker */
function earPaint(root: V3, len: number) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, K = px.gb.K;
    px.lightK = 0.5;
    // the bowl faces forward and out: tell the faces apart by which side of the ear's mid-plane the texel lies
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], t = cl(Math.hypot(p[0] - root[0], p[1] - root[1], p[2] - root[2]) / len, 0, 1);
      const inner = px.gb.N[i * 3 + 2] > 0.1;
      if (t < 0.18) { px.put(i, FUR, 2.4 + (h3(i, 3, 5) < 0.3 ? 0.8 : 0)); px.rough[i] = 230; continue; }
      if (inner) { const ridge = Math.abs(Math.sin(t * 46)) < 0.25; px.put(i, HIDE, 2.6 + t * 0.8 - (ridge ? 0.9 : 0) + (K[i] > 0.6 ? 0.8 : 0)); px.rough[i] = 150; }
      else { px.put(i, LEA, 2.3 + (K[i] > 0.6 ? 0.8 : 0) + (h3(i, 5, 7) < 0.1 ? 0.6 : 0)); px.rough[i] = 170; }
    }
    formLight(px, 0.5);
    px.creaseInk(0.9, { dark: 1.2, lit: 0.8 });
    px.flush();
  };
}
/** the lids: feathered buff over sooty, the margin dark */
function lidPaint(L: LidSpec) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P;
    px.lightK = 0.4;
    for (let i = 0; i < px.n; i++) {
      const { off } = lidCoords(L, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      px.put(i, off < 0.07 ? INK : SOIL, off < 0.07 ? 1.3 : 1.8 + (off > 0.3 ? 0.8 : 0) + (h3(i, 2, 1) < 0.2 ? 0.6 : 0)); px.rough[i] = off < 0.07 ? 90 : 220;
    }
    px.flush();
  };
}
/** the lower jaw's stations: z, half width, half height, centre y (the lip at y + h, the mouth floor at y + 0.15 h) */
const JAW: [number, number, number, number][] = [[0.06, 0.02, 0.008, 0.002], [0.074, 0.029, 0.011, 0.0], [0.094, 0.034, 0.0125, -0.002], [0.113, 0.033, 0.012, -0.002], [0.13, 0.027, 0.0105, -0.0005], [0.142, 0.016, 0.0075, 0.001], [0.149, 0.006, 0.004, 0.002]];
const jawAt = (z: number): [number, number, number] => {
  let k = 0; while (k + 2 < JAW.length && z > JAW[k + 1][0]) k++;
  const A = JAW[k], B = JAW[k + 1], t = cl((z - A[0]) / (B[0] - A[0]), 0, 1);
  return [A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t];
};
/** the lower jaw: buff feathers on the chin, the lips a dark rim, inside wet dark gum going black into the throat */
function jawPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.lightK = 0.6;
  const st = strokes(px, { flow: alongFlow([0, -0.3, -1]), len: [2, 5], width: [1.5, 2.5], amp: 0.6, density: 0.8, seed: 15, apply: false });
  const inside = new Uint8Array(px.n);
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ax = Math.abs(x), ny = N[i * 3 + 1], inw = -N[i * 3] * Math.sign(x || 1);
    const [w, h, yc] = jawAt(z), back = cl((0.1 - z) / 0.045, 0, 1), m = fbm3(x * 90, y * 90, z * 90, 2) * 0.4;
    if (z < 0.064 && N[i * 3 + 2] < -0.5) { px.put(i, INK, 0.5); px.rough[i] = 80; inside[i] = 1; continue; } // the throat
    if (y > yc + h * 0.82) { px.put(i, INK, 1.2 + (ny > 0.6 ? 0.6 : 0)); px.rough[i] = 90; continue; } // the lip
    if (y > yc + h * 0.05 && (ny > 0.3 || (inw > 0.25 && ax < w * 0.92))) {
      inside[i] = 1;
      px.put(i, back > 0.8 ? INK : GUM, back > 0.8 ? 0.8 : 3.2 - back * 2.2 + m); px.rough[i] = 55; continue;
    }
    // outside: a pale chin and lip margin, tawny feathers under the jaw
    if (y > yc - h * 0.2) px.put(i, BONE, 3.4 + st.v[i] * 0.6 + m);
    else px.put(i, FUR, 2.5 + st.v[i] * 0.8 + m);
    px.rough[i] = 230;
  }
  px.scales({ size: 0.005, kind: 'shield', flow: -1, ink: 1.0, lit: 0.6, mask: (i) => (inside[i] ? 0 : P[i * 3 + 1] < jawAt(P[i * 3 + 2])[2] ? 1 : 0), seed: 13 });
  formLight(px, 0.5, { cavity: 0.6 });
  px.flush();
}
/** the tongue: pink, a groove down its middle, the tip lighter, wet */
function tonguePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  for (let i = 0; i < px.n; i++) {
    const ax = Math.abs(P[i * 3]), z = P[i * 3 + 2], top = N[i * 3 + 1] > 0.3;
    px.put(i, FLESH, (top ? 3.6 : 2.4) + (z > 0.12 ? 0.6 : 0) - (top && ax < 0.0012 ? 1.2 : 0) - (z < 0.085 ? 1.2 : 0)); px.rough[i] = 40;
  }
  formLight(px, 0.5);
  px.flush();
}
/** the wing: coverts and barred flight feathers drawn over the arm and the inner wing, the hand's membrane bare dark
 *  leather with veins and fine wrinkles running to the finger tips; paler underneath */
function wingPaint(side: number) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.5;
    const feath = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      if ((i & 4095) === 0) yield;
      const x = P[i * 3] * side, z = P[i * 3 + 2], under = N[i * 3 + 1] < 0;
      // the feathered part: the arm and the inner wing, and a band along the leading finger
      const lead = z - (DB.W[2] + (x - DB.W[0]) * (DB.D2[2] - DB.W[2]) / (DB.D2[0] - DB.W[0]));
      const fz = x < DB.W[0] + 0.004 ? 1 : lead > -0.012 && x < DB.D2[0] - 0.03 ? 1 : 0;
      feath[i] = under ? fz * 0.6 : fz;
      const m = fbm3(x * 70, P[i * 3 + 1] * 70, z * 70, 2);
      if (feath[i] > 0.5) { px.put(i, under ? BONE : FUR, (under ? 3 : 2.6) + m * 0.6); px.rough[i] = 235; }
      else {
        // membrane: veins radiating from the wrist, wrinkles across between the fingers
        const dx = x - DB.W[0], dz = z - DB.W[2], a = Math.atan2(dz, dx), r = Math.hypot(dx, dz);
        const vein = Math.abs(Math.sin(a * 23 + r * 40)) < 0.09, wr = Math.abs(Math.sin(r * 420 + a * 3)) < 0.16;
        px.put(i, under ? HIDE : LEA, (under ? 2.6 : 2.4) + m * 0.5 - (vein ? 1 : 0) - (wr ? 0.5 : 0)); px.rough[i] = 205;
      }
    }
    yield;
    px.scales({ size: 0.0085, kind: 'shield', flow: 1, len: 1.9, ink: 1.6, lit: 0.8, mask: (i) => feath[i], seed: 17 + side });
    for (let i = 0; i < px.n; i++) if (feath[i] > 0.5 && Math.abs(Math.sin(P[i * 3 + 2] * 300 + P[i * 3] * side * 60)) < 0.18) px.mark[i] -= 0.8;
    px.creaseInk(1.0, { dark: 1.4, lit: 0.7 });
    px.flush();
  };
}
function antlerPaint(ch: Chart, _p: Piece, b: Body) {
  // velvet over the base fading to bare pale bone at the tips, a knobbly burr round the base, pearling
  const px = new Px(ch, b), P = px.gb.P;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], up = y - DB.antler[1];
    const c = cell3(x, y, z, 0.0025, 3), pearl = c.f1 < 0.0007 && up < 0.022;
    if (up < 0.004) { px.put(i, HORN, 2.4 + (pearl ? 1.4 : 0)); px.rough[i] = 200; continue; }
    const tip = up > 0.022 || (up > 0.014 && z > DB.antler[2] + 0.001);
    px.put(i, tip ? BONE : SOIL, tip ? 4.2 : 2.4 + up * 40 + (pearl ? 1 : 0)); px.rough[i] = tip ? 120 : 225;
  }
  px.creaseInk(1, { dark: 1.2, lit: 0.8 }); px.flush();
}
const flat = (R: number[], st: number, rough = 140) => (ch: Chart, _p: Piece, b: Body) => {
  const px = new Px(ch, b);
  for (let i = 0; i < px.n; i++) { px.put(i, R, st + (h3(i, 7, 3) < 0.1 ? 0.8 : 0)); px.rough[i] = rough; }
  px.creaseInk(1, { dark: 1, lit: 1 }); px.flush();
};
/** scaly grey-yellow toes */
function toePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  for (let i = 0; i < px.n; i++) { px.put(i, OCHRE, 2.2); px.rough[i] = 170; }
  px.pebbles(0.0022, { depth: 0.8 }); px.flush();
}

// ------------------------------------------------------------------------------------------------ the build
export const buildDingbatModel = (o: { page?: number; den?: number } = {}): DingbatModel => runSync(dingbatModelGen(o));
export const buildDingbatModelAsync = (o: { page?: number; den?: number } = {}): Promise<DingbatModel> => runAsync(dingbatModelGen(o));

export function* dingbatModelGen(o: { page?: number; den?: number } = {}): Generator<string | void, DingbatModel> {
  const bones = dingbatBones(), bi = (n: string) => { const k = bones.findIndex((b) => b.name === n); if (k < 0) throw new Error(n); return k; };
  const body = new Body(o.page ?? 512);
  body.seed = 1717;
  const H = DB.hc, ROOT = bi('root'), HEAD = bi('head'), TAIL = bi('tail');

  // ---- the body: a short fluffy owl's barrel from the tail root to the ruff under the head
  const bst = (z: number, y: number, w: number, h: number, p = 'barrel'): Station => ({ c: [0, y, z], s: [w, h], p });
  const bodySkin = chainSkin([[0, 0, -0.11], [0, 0.003, -0.062], [0, 0.01, 0.05], [0, 0.02, 0.12]], [TAIL, ROOT, HEAD], 0.3);
  const torso = body.add(trunk({
    name: 'trunk', stations: [bst(-0.088, 0.004, 0.01, 0.008, 'round'), bst(-0.072, 0.002, 0.026, 0.022, 'round'), bst(-0.045, 0, 0.04, 0.036), bst(-0.012, 0, 0.047, 0.043), bst(0.02, 0.003, 0.046, 0.044), bst(0.045, 0.008, 0.04, 0.04, 'round'), bst(0.062, 0.012, 0.03, 0.03, 'round'), bst(0.074, 0.014, 0.012, 0.012, 'round')],
    tween: 0, capS: true, capE: true, levels: 1, k: 1, skin: bodySkin, paint: plumage(),
  }));
  body.finalize(torso);
  yield 'body';

  // ---- the head: the sculpted rings (dingbat/face.ts) from the palate (the flat roof of the gape: the bottom cap) to
  // the crown, the seam at the back
  const headSkin = (p: V3): Wt => (p[2] < DB.neck[2] + 0.004 ? [HEAD, 0.6, ROOT, 0.4] : [HEAD, 1]);
  const headPt = (h: number, th: number, sd: number): { p: V3; n: V3 } => {
    const P = (hh: number, t: number): V3 => { const [x, z] = dbHeadSurf(hh, t); return [H[0] + x * sd, H[1] + hh, H[2] + z]; };
    const p = P(h, th), u = sub(P(h, th + 0.01), P(h, th - 0.01)), v = sub(P(h + 0.001, th), P(h - 0.001, th));
    let n = nrm([v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]]);
    const out = sub(p, [H[0], H[1] + h, H[2]]); if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = scl(n, -1);
    return { p, n };
  };
  {
    const m = newCM(), half = DB_COLS;
    const rings: Ring[] = DB_ROWS.map((h) => {
      const pts: number[][] = [];
      for (let j = 0; j < half.length; j++) { const [x, z] = dbHeadSurf(h, half[j]); pts.push([x, z]); }
      for (let j = half.length - 2; j >= 1; j--) { const [x, z] = dbHeadSurf(h, half[j]); pts.push([-x, z]); }
      return { c: [H[0], H[1] + h, H[2]], x: [1, 0, 0], y: [0, 0, 1], pts };
    });
    const g = tube(m, rings, { tag: 0, capS: true, capE: true });
    body.add({ name: 'skull', m, grids: [g], levels: 0, skin: headSkin, paint: headPaint(), k: 2.3 } as Piece);
  }
  yield 'head';
  // the jaw: a narrow mandible under the palate, hinged at the back corners of the gape: a U in section (the lips
  // standing up either side of a hollow mouth floor), a rolled chin; a tongue in the floor; needle teeth along the
  // lips above and below
  const JU = [[0, 0.15], [0.42, 0.22], [0.66, 0.56], [0.8, 1.0], [0.97, 0.78], [1.0, 0.1], [0.86, -0.55], [0.5, -0.92], [0, -1.0]];
  const JAWB = bi('jaw');
  body.add(trunk({
    name: 'jaw', stations: JAW.map(([z, w, h, y]) => ({ c: [0, y, z] as V3, s: [w, h] as [number, number], p: JU })),
    tween: 0, capS: true, capE: true, levels: 1, k: 1.8, cols: [{ j: 3, a: 0, b: JAW.length - 1, s: 1.2, ink: true }], skin: () => [JAWB, 1], paint: jawPaint,
  }));
  body.add(stalk({ name: 'tongue', path: curve([[0, 0.0005, 0.066], [0, 0.0014, 0.09], [0, 0.0018, 0.115], [0, 0.0016, 0.131]], 6), up: [0, 1, 0], r: (t) => 0.0105 * (1 - t * 0.45) * (t > 0.85 ? 1 - (t - 0.85) * 2.5 : 1), sec: (a) => 0.36 + 0.64 * Math.abs(Math.sin(a)), around: 8, capS: true, capE: true, levels: 1, k: 1.6, skin: () => [JAWB, 1], paint: tonguePaint }));
  const tooth = (name: string, at: V3, dir: V3, len: number, r: number, bone: number) => body.add(spine({ name, at, dir, len, r, around: 4, levels: 0, k: 0.8, skin: () => [bone, 1], paint: flat(BONE, 4.4, 60) }));
  for (const sd of [1, -1]) {
    for (let k = 0; k < 5; k++) {
      const z = 0.088 + k * 0.012, [w, h, yc] = jawAt(z);
      tooth('toothJ', [sd * w * 0.78, yc + h * 0.9, z], [sd * 0.1, 1, 0.15], 0.0035 + (k === 4 ? 0.0012 : 0), 0.0011, JAWB);
      const zu = 0.09 + k * 0.0115, wu = 0.029 - k * 0.002;
      tooth('toothU', [sd * wu, H[1] - 0.0212, zu], [sd * 0.1, -1, 0.2], 0.0035 + (k === 4 ? 0.0022 : 0), 0.0011 + (k === 4 ? 0.0003 : 0), HEAD);
    }
  }
  // the nose leaf: a little spear of skin standing up off the nose pad
  {
    const np = headPt(DB_NOSE.h + 0.004, Math.PI, 1).p;
    body.add(cupEar({ name: 'noseleaf', root: add(np, [0, 0.0005, -0.003]), dir: [0, 1, 0.42], face: [0, 0.3, 1], len: 0.017, wid: 0.0058, th: 0.0011, cup: 0.3, lean: 0.002, shape: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.85)), 0.6) * (1 - t * 0.35), skin: () => [HEAD, 1], paint: earPaint(np, 0.017), levels: 1, k: 1.8, around: 8, rings: 4 }));
  }
  // big cupped bat's ears out of the sides of the skull, the bowls turned forward and out
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const root = headPt(0.02, Math.PI * 0.52, s).p, r0 = add(root, [-s * 0.004, 0, 0]);
    body.add(cupEar({ name: 'ear' + S, root: r0, dir: [s * 0.78, 0.82, -0.12], face: [s * 0.55, 0.05, 1], len: 0.052, wid: 0.017, th: 0.0018, cup: 0.55, lean: 0.006, skin: () => [HEAD, 1], paint: earPaint(r0, 0.052), levels: 1, k: 1.4, around: 10, rings: 6 }));
  }
  // eyes, lids: big amber owl's eyes in their sockets, the lids leaving a lens (the upper modelled 0.2 rad low: the
  // creature rests it that much higher)
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(DB.eye, s), ax: V3 = nrm([s * 0.2, 0.03, 1]);
    const eye = body.add(eyeball({ name: 'eye' + S, c, ax, r: DB.eyeR, bone: HEAD, iris: GOLD, pupil: 'round', irisA: 0.82, sclera: SOIL, k: 2.6, levels: 1, around: 8 }));
    eye.paint = eyePaint({ c, ax, side: s, irisA: 0.86, iris: GOLD, pupil: 'round', pupilR: 0.42, sclera: null, collar: OCHRE, glint: [0.32, 0.4], shine: 230 });
    const up: LidSpec = { name: 'lid' + S, c, ax, r: DB.eyeR, bone: bi('lid' + S), side: s, open: 0.42, wide: 1.0, inner: -0.28, outer: -0.15, ri: 1.03, ro: 1.16, swell: 0.06, root: 1.5, k: 1.8, across: 8, down: 4, levels: 0, paint: () => undefined };
    up.paint = lidPaint(up); body.add(almondLid(up));
    const lo: LidSpec = { name: 'llid' + S, c, ax, r: DB.eyeR, bone: HEAD, side: s, lower: true, open: 0.5, wide: 1.0, inner: -0.08, outer: 0.05, ri: 1.02, ro: 1.1, root: 1.35, k: 1.6, across: 8, down: 4, levels: 0, paint: () => undefined };
    lo.paint = lidPaint(lo); body.add(almondLid(lo));
  }
  // antler nubs: a short beam with a burr, forking once into a front tine
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const b0 = mir(DB.antler, s);
    const ctrl: V3[] = [add(b0, [0, -0.004, 0]), add(b0, [s * 0.003, 0.007, -0.002]), add(b0, [s * 0.01, 0.016, -0.007]), add(b0, [s * 0.019, 0.022, -0.016]), add(b0, [s * 0.025, 0.025, -0.026])];
    body.add(horn({ name: 'antler' + S, ctrl, r0: 0.0072, skin: () => [HEAD, 1], paint: antlerPaint, flat: 0.88, rings: 3, k: 1.6 })).levels = 0;
    const pt = curve(ctrl, 10)[4];
    body.add(horn({ name: 'tine' + S, ctrl: [add(pt, [0, -0.002, -0.001]), add(pt, [s * 0.002, 0.006, 0.004]), add(pt, [s * 0.001, 0.013, 0.005])], r0: 0.0042, skin: () => [HEAD, 1], paint: antlerPaint, rings: 3, k: 1.6 })).levels = 0;
  }
  yield 'face';

  // ---- wings: a bat's membrane stretched between real finger bones, feathered over the arm
  const wingSkin = (s: number) => {
    const ch = chainSkin([[0, 0, 0], [DB.S[0], 0, 0], [DB.E[0], 0, 0], [DB.W[0] + 0.004, 0, 0], [0.3, 0, 0]], [ROOT, bi('arm' + (s > 0 ? 'L' : 'R')), bi('fore' + (s > 0 ? 'L' : 'R')), bi('hand' + (s > 0 ? 'L' : 'R'))], 0.3);
    return (p: V3) => ch([Math.abs(p[0]), 0, 0]);
  };
  const seats: LockSeat[] = [];
  /** a bone under the skin: a tapering stalk through its joints, swollen at each knuckle */
  const boneStalk = (name: string, joints: V3[], r0: number, r1: number, skin: (p: V3) => Wt, paint: Piece['paint'], knob = 0.45, n = 9, levels = 1, around = 5) => {
    const cum = [0]; for (let k = 1; k < joints.length; k++) cum.push(cum[k - 1] + len3(sub(joints[k], joints[k - 1])));
    const tj = cum.map((c) => c / cum[cum.length - 1]);
    body.add(stalk({ name, path: curve(joints, n), around, capS: true, capE: true, levels, k: 1.1, skin, paint,
      r: (t) => (r0 + (r1 - r0) * t) * (1 + tj.slice(1, -1).reduce((a, tk) => a + knob * Math.exp(-(((t - tk) / 0.045) ** 2)), 0) - 0.12 * Math.sin(Math.PI * t)) }));
  };
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const ws = wingSkin(s);
    const rays: [V3, V3][] = [[DB.S, DB.B], [DB.E, DB.T1], [DB.W, DB.D5], [add(DB.W, [0.005, 0, -0.002]), DB.D4], [add(DB.W, [0.01, 0, -0.004]), DB.D3], [add(DB.W, [0.015, 0, -0.006]), DB.D2]];
    const roots = rays.map(([r]) => mir(r, s)), tips = rays.map(([, t]) => mir(t, s));
    body.add(fin({
      name: 'wing' + S, roots, dirs: roots.map((r, k) => nrm(sub(tips[k], r))), lens: roots.map((r, k) => len3(sub(tips[k], r))), side: roots.map(() => [0, 1, 0] as V3),
      ray: 0.0014, web: 0.0008, scallop: 0.34, steps: 7, skin: (p) => ws(p), paint: wingPaint(s), levels: 0, k: 1,
    }));
    // the arm along the leading edge: the upper arm's muscle, the elbow's knob, the forearm, the wrist
    body.add(stalk({ name: 'arm' + S, path: curve([mir([0.018, 0.012, 0.032], s), mir(DB.S, s), mir([0.062, 0.018, 0.026], s), mir(DB.E, s), mir([0.12, 0.017, 0.026], s), mir(DB.W, s), mir(add(DB.W, [0.016, 0, -0.006]), s)], 12), r: (t) => (0.0068 - t * 0.0038) * (1 + 0.25 * Math.exp(-(((t - 0.18) / 0.1) ** 2)) + 0.3 * Math.exp(-(((t - 0.45) / 0.04) ** 2)) + 0.35 * Math.exp(-(((t - 0.86) / 0.045) ** 2)) - 0.12 * Math.exp(-(((t - 0.66) / 0.1) ** 2))), around: 6, capS: true, levels: 1, k: 1, skin: ws, paint: plumage({ flow: 1, size: 0.006 }) }));
    // the fingers: a metacarpal and two phalanges each, knuckled, bowing back a little, along the membrane's rays
    for (const [k, tipP] of [[2, DB.D2], [3, DB.D3], [4, DB.D4], [5, DB.D5]] as [number, V3][]) {
      const w0 = add(DB.W, [0.004 + (5 - k) * 0.004, 0.0008, -0.002 - (5 - k) * 0.0015]), d = sub(tipP, w0), L = len3(d), side: V3 = nrm([-d[2], 0, d[0]]);
      const j1 = add(add(w0, scl(d, 0.5)), scl(side, L * 0.03)), j2 = add(add(w0, scl(d, 0.78)), scl(side, L * 0.025));
      boneStalk('digit' + S + k, [mir(w0, s), mir(j1, s), mir(j2, s), mir(tipP, s)], 0.0021 + (k === 2 ? 0.0004 : 0), 0.0008, ws, flat(LEA, 1.8, 150), 0.38, 11, 0, 6);
    }
    // the thumb: a short stub off the wrist with a hooked claw
    {
      const t0 = add(DB.W, [0.0, 0.003, 0.004]), t1 = add(t0, [0.004, 0.003, 0.009]);
      boneStalk('thumb' + S, [mir(t0, s), mir(t1, s), mir(add(t1, [0.001, 0.0015, 0.005]), s)], 0.0022, 0.0014, ws, flat(LEA, 1.8, 150), 0.3, 5);
      const c0 = add(t1, [0.001, 0.0015, 0.005]);
      body.add(stalk({ name: 'tclaw' + S, path: curve([mir(c0, s), mir(add(c0, [0.0005, 0.001, 0.004]), s), mir(add(c0, [0.0005, -0.001, 0.0075]), s), mir(add(c0, [0.0, -0.004, 0.0085]), s)], 5), r: (t) => 0.0015 * (1 - t * 0.85) + 0.0002, sec: (a) => (Math.cos(a) > 0.5 ? 1.15 : Math.cos(a) < -0.5 ? 0.6 : 0.85), around: 5, levels: 0, k: 1, skin: ws, paint: flat(HORN, 1.2, 70) }));
    }
    // a fringe of soft flight feathers along the inner wing's trailing edge
    for (let k = 0; k < 11; k++) {
      const f = (k + 0.5) / 11, a = mir(DB.B, s), c = mir(DB.D5, s), mid = mir(DB.T1, s);
      const p = f < 0.5 ? add(a, scl(sub(mid, a), f * 2)) : add(mid, scl(sub(c, mid), (f - 0.5) * 2));
      const pp = add(p, [0, 0.0015 * (k % 2), 0.018]);
      seats.push({ p: pp, n: [0, 1, 0], dir: nrm([s * 0.2 * f, -0.04, -1]), len: 0.034 + 0.01 * Math.sin(f * Math.PI), wid: 0.012, lift: 0.03, droop: 0.04, col: k % 3 === 0 ? 3 : 0, w: ws(pp) });
    }
    yield 'wing';
  }

  // ---- legs: feathered trousers; four knuckled toes (three back, one forward) with hooked, keeled talons that curl to
  // grip (the eave)
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const hip = mir(DB.hip, s), ft = mir(DB.foot, s), LB = bi('leg' + S), FB = bi('foot' + S);
    body.add(stalk({ name: 'leg' + S, path: curve([add(hip, [0, 0.008, 0.01]), hip, mir([0.021, -0.03, -0.062], s), ft], 6), r: (t) => (0.0095 - t * 0.004) * (1 + 0.15 * Math.exp(-(((t - 0.85) / 0.06) ** 2))), around: 6, capS: true, levels: 1, k: 1, skin: (p) => (p[2] < ft[2] + 0.012 ? [FB, 1] : [LB, 1]), paint: plumage({ flow: 1, size: 0.005 }) }));
    for (let k = 0; k < 4; k++) {
      const a = k === 3 ? Math.PI * 0.92 : (k - 1) * 0.42, d = nrm([Math.sin(a) * s * 0.8, -0.12, -Math.cos(a)]), L = k === 3 ? 0.011 : 0.016 - Math.abs(k - 1) * 0.002;
      const j0 = add(ft, [0, 0.002, 0.002]), j1 = add(ft, scl(d, L * 0.45)), j2 = add(add(ft, scl(d, L * 0.78)), [0, 0.0012, 0]), tip = add(ft, scl(d, L));
      boneStalk('toe' + S + k, [j0, j1, j2, tip], 0.0028, 0.0019, () => [FB, 1], toePaint, 0.22, 7, 0, 6);
      // the talon: keeled on top, flat beneath, hooking down and under toward the grip
      const up = nrm(cross3(cross3(d, [0, 1, 0]), d));
      const tc = curve([add(tip, scl(d, -0.0015)), add(add(tip, scl(d, 0.003)), scl(up, 0.0012)), add(add(tip, scl(d, 0.0062)), scl(up, -0.0005)), add(add(tip, scl(d, 0.0075)), scl(up, -0.0045))], 6);
      body.add(stalk({ name: 'talon' + S + k, path: tc, up, r: (t) => 0.0019 * Math.pow(1 - t * 0.92, 0.9) + 0.00015, sec: (aa) => (Math.cos(aa) > 0.6 ? 1.2 : Math.cos(aa) < -0.4 ? 0.55 : 0.8), around: 6, levels: 0, k: 1.2, skin: () => [FB, 1], paint: flat(HORN, 1.2, 70) }));
    }
  }
  yield 'legs';

  // ---- feathers: the coat (back, flanks, a fluffy breast), the crown, a ruff framing the facial disc, the tail fan
  const sow = (piece: Piece, n: number, o: { u0: number; u1: number; v0: number; v1: number; len: (p: V3, n: V3) => number; wid: number; lift?: number; droop?: number; dir: (p: V3, n: V3, dv: V3) => V3; col: (p: V3, n: V3) => number; skin: (p: V3) => Wt; seed: number; keep?: (p: V3, n: V3) => boolean }) => {
    for (let k = 0; k < n; k++) {
      const u = o.u0 + h3(k, 1, o.seed) * (o.u1 - o.u0), v = o.v0 + h3(k, 2, o.seed) * (o.v1 - o.v0);
      const q = gridSurf(piece.m, piece.grids[0], ((u % 1) + 1) % 1, cl(v, 0, 1));
      if (o.keep && !o.keep(q.p, q.n)) continue;
      const L = o.len(q.p, q.n); if (L < 0.004) continue;
      seats.push({ p: sub(q.p, scl(q.n, 0.002)), n: q.n, dir: o.dir(q.p, q.n, q.dv), len: L * (0.8 + 0.4 * h3(k, 3, o.seed)), wid: o.wid * (0.8 + 0.4 * h3(k, 4, o.seed)), lift: o.lift ?? 0.25, droop: o.droop ?? 0.2, col: o.col(q.p, q.n), w: o.skin(q.p) });
    }
  };
  // the body coat lies back along the body and a little down the flanks
  sow(torso, 120, {
    u0: 0, u1: 1, v0: 0.1, v1: 0.88, wid: 0.011, seed: 3, skin: bodySkin, lift: 0.22, droop: 0.18,
    len: (p) => (p[2] > 0.045 && p[1] < 0.0 ? 0 : 0.026 + (p[2] < -0.02 ? 0.006 : 0)),
    dir: (_p, n, dv) => nrm([-dv[0] + n[0] * 0.25, -dv[1] + n[1] * 0.1 - 0.15, -dv[2]]),
    col: (p, n) => (n[1] < -0.3 ? 2 : h3(Math.floor(p[0] * 300), Math.floor(p[2] * 300), 5) < 0.3 ? 1 : 0),
    keep: (p, n) => !(Math.abs(p[0]) > 0.025 && n[1] > 0.1 && p[2] > -0.02 && p[2] < 0.05),
  });
  // the crown and nape: feathers lying back over the skull
  for (let k = 0; k < 46; k++) {
    const h = 0.012 + h3(k, 1, 7) * 0.034, th = h3(k, 2, 7) * Math.PI * 0.62, sd = h3(k, 3, 7) < 0.5 ? 1 : -1;
    const q = headPt(h, th, sd);
    seats.push({ p: sub(q.p, scl(q.n, 0.002)), n: q.n, dir: nrm([q.n[0] * 0.3, -0.25 + q.n[1] * 0.2, -1]), len: 0.017 * (0.8 + 0.4 * h3(k, 4, 7)), wid: 0.0095 * (0.8 + 0.4 * h3(k, 5, 7)), lift: 0.3, droop: 0.12, col: 0, w: headSkin(q.p) });
  }
  // the ruff: a ring of short dark-tipped feathers round the dish, standing forward to frame the face
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    if (sa < -0.55) continue; // not across the gape
    const x = ca * 0.043 * 1.04, h = 0.004 + sa * 0.03 * 1.04;
    let best = Math.PI, bd = 1; for (let j = 0; j <= 200; j++) { const th = Math.PI * (0.5 + 0.5 * j / 200), [xx] = dbHeadSurf(h, th), dd = Math.abs(xx - Math.abs(x)); if (dd < bd) { bd = dd; best = th; } }
    const q = headPt(h, best, x >= 0 ? 1 : -1);
    seats.push({ p: sub(q.p, scl(q.n, 0.002)), n: nrm(add(q.n, [ca * 0.5, sa * 0.5, 0])), dir: nrm([ca * 0.45, sa * 0.45, 1]), len: 0.014 + (sa > 0.3 ? 0.004 : 0), wid: 0.0062, lift: 0.5, droop: 0.05, col: 3, w: [HEAD, 1] });
  }
  // the tail: a barred fan
  for (let k = 0; k < 9; k++) {
    const a = ((k - 4) / 4) * 0.62, p: V3 = [Math.sin(a) * 0.006, 0.006, -0.08];
    seats.push({ p, n: [0, 1, 0], dir: [Math.sin(a), -0.04, -Math.cos(a)], len: 0.06 - Math.abs(k - 4) * 0.003, wid: 0.0095, lift: 0.04, droop: 0.04, col: 1, w: [TAIL, 1] });
  }
  // fluffy breast down
  for (let k = 0; k < 12; k++) {
    const a = (h3(k, 1, 31) - 0.5) * 2.2, zz = -0.03 + h3(k, 2, 31) * 0.05;
    const p: V3 = [Math.sin(a) * 0.04, -0.03 - Math.cos(a) * 0.008, zz];
    seats.push({ p, n: nrm([Math.sin(a), -1, 0.3]), dir: nrm([Math.sin(a) * 0.3, -0.5, -0.8]), len: 0.02, wid: 0.01, lift: 0.4, droop: 0.2, col: 4, w: bodySkin(p) });
  }
  const tiles = [FUR, FUR, BONE, SOIL, BONE];
  const lk = locks({ name: 'feathers', seats, tiles, steps: [3, 3, 4, 2, 4], seed: 21 });
  if (lk) { lk.paint = cardPaint(['feather', 'plume', 'feather', 'feather', 'down'], tiles, { steps: [3.2, 2.6, 3.6, 2.2, 4] }); lk.k = 1.1; body.add(lk); }
  void INK; void BLOOD;
  const out = yield* body.buildGen({ den: o.den ?? 700, maxScale: 2, budget: 30000, fur: DINGBAT_FUR });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, fur: out.fur, bones, tris: out.tris, den: body.den, stats };
}

/** fluffy feathered fur (lengths in DINGBAT_FUR_LEN): a puffball body, a ruff round the head, feathered trousers, down
 *  on the arms; the facial disc short and the gape, the wings' membrane, beak and talons bare */
export const DINGBAT_FUR_LEN = 0.014;
const DINGBAT_FUR = furZones([
  { piece: /^trunk/, len: 0.85, clump: 0.75, tip: 0.7 },
  { piece: /^trunk/, a: [0, 0.015, 0.05], b: [0, 0.015, 0.075], r: 0.05, len: 1, clump: 0.85, tip: 0.8 },
  { piece: /^skull/, len: 0.6, clump: 0.7, tip: 0.6 },
  { piece: /^skull/, a: [0, 0.03, 0.14], r: 0.045, facing: [0, 0, 1], min: 0.25, len: 0.22, clump: 0.3 },
  { piece: /^skull/, y: [-1, DB.hinge[1] + 0.004], bare: true },
  // the bare leather muzzle
  { piece: /^skull/, a: [0, 0.022, 0.138], b: [0, 0.012, 0.142], r: 0.016, soft: 0.3, bare: true },
  { piece: /^leg/, len: 0.9, clump: 0.8, tip: 0.6 },
  { piece: /^arm/, len: 0.5, clump: 0.6 },
]);
