// THE AXEHANDLE HOUND: model. A long, low hound whose body is a smooth hickory axe handle (the grain running nose to
// tail, knots, a heartwood streak down the back, a butt knob at the rump) and whose head IS a polished steel axe head
// mounted on the neck as on a handle: a forged poll at the back (the hickory end grain and its steel wedge showing on
// top), deep-set eyes in rusty sockets under a steel brow, cheeks of black forge scale and hammer facets, a bright
// honed bevel with grinding marks, nicks in the edge. The jaw is the lower half of the bit: the axe head splits along
// the mouth line, rows of steel teeth inside. Coarse dark bristles (locks) along the spine, on the chest, behind the
// forelegs and at the whip tail's tip; short stubby legs with big dark-clawed paws.
// Creature space: metres, +z forward, +y up, ground y = 0. Built with the anatomy library (src/creatures/anatomy).
import * as THREE from 'three';
import {
  Body, trunk, limb, legRings, eyeball, eyelid, locks, stalk, spine, curve, chainSkin, gridSurf,
  Px, RP, cell3, h3, cl, type V3, type Wt, type Piece, type Chart, type Station, type FootSpec, type LockSeat, type LimbRing,
} from '../anatomy';
import { spineFrame, locate, nz2, nz3, fbm3, seatsOn, type Frame } from '../paintkit';
import type { BoneDef } from '../rig';

// ------------------------------------------------------------------------------------------------ the skeleton
export const H: V3 = [0, 0.585, 0.665];
/** the axe head's scale: its tables below are in 'axe units' (a big felling axe), this many metres each */
const K = 1.25;
const EYE0: V3 = [0.031, 0.034, 0.028];
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
  return b;
}

// ------------------------------------------------------------------------------------------------ the axe head
// Head-local stations (relative to H): z, crown height, half width; poll stations run the full height to `bot`.
const UP0: { z: number; top: number; w: number; bot?: number; sock?: number; brow?: number }[] = [
  { z: -0.115, top: 0.056, w: 0.04, bot: -0.056 },
  { z: -0.1, top: 0.07, w: 0.05, bot: -0.068 },
  { z: -0.06, top: 0.075, w: 0.052, bot: -0.072 },
  { z: -0.015, top: 0.074, w: 0.05, bot: -0.07, brow: 0.04 },
  { z: 0.025, top: 0.07, w: 0.046, sock: 0.3, brow: 0.08 },
  { z: 0.065, top: 0.06, w: 0.038, sock: 0.06, brow: 0.02 },
  { z: 0.105, top: 0.058, w: 0.03 },
  { z: 0.145, top: 0.074, w: 0.022 },
  { z: 0.18, top: 0.1, w: 0.0145 },
  { z: 0.208, top: 0.124, w: 0.0088 },
  { z: 0.232, top: 0.114, w: 0.0044 },
  { z: 0.25, top: 0.064, w: 0.0012 },
];
const LO0: { z: number; bot: number; w: number }[] = [
  { z: -0.04, bot: -0.058, w: 0.042 },
  { z: -0.012, bot: -0.067, w: 0.045 },
  { z: 0.025, bot: -0.072, w: 0.044 },
  { z: 0.065, bot: -0.074, w: 0.038 },
  { z: 0.105, bot: -0.086, w: 0.03 },
  { z: 0.145, bot: -0.11, w: 0.022 },
  { z: 0.18, bot: -0.14, w: 0.0145 },
  { z: 0.206, bot: -0.166, w: 0.0088 },
  { z: 0.23, bot: -0.158, w: 0.0044 },
  { z: 0.248, bot: -0.09, w: 0.0012 },
];
const UP = UP0.map((s) => ({ ...s, z: s.z * K, top: s.top * K, w: s.w * K, bot: s.bot === undefined ? undefined : s.bot * K }));
const LO = LO0.map((s) => ({ ...s, z: s.z * K, bot: s.bot * K, w: s.w * K }));
const MOUTH = 0.0026 * K;
/** the half-width of the blade at head-local z (for the painters) */
const wAt = (z: number) => { for (let i = 0; i + 1 < UP0.length; i++) if (z <= UP0[i + 1].z) { const f = cl((z - UP0[i].z) / (UP0[i + 1].z - UP0[i].z), 0, 1); return UP0[i].w + (UP0[i + 1].w - UP0[i].w) * f; } return 0.001; };
/** the same in metres (head-local z in metres) */
const wAtM = (z: number) => wAt(z / K) * K;

function upperStations(): Station[] {
  return UP.map((s) => {
    const { top, w } = s;
    let half: number[][];
    if (s.bot !== undefined) {
      const b = s.bot;
      half = [[0, top], [w * 0.74, top - 0.0035], [w * (0.99 + (s.brow ?? 0)), top * 0.72], [w, (top + b) / 2 + 0.01], [w * 0.98, b * 0.72], [w * 0.74, b + 0.0035], [0, b]];
    } else {
      const sk = s.sock ?? 0, br = s.brow ?? 0;
      half = [[0, top], [w * (0.68 + br * 2.2), top - 0.002], [w * (1.0 + br), top * 0.8], [w * (1 - sk), top * 0.47], [w * (0.97 - sk * 0.3), top * 0.17], [w * 0.92, MOUTH], [0, MOUTH]];
    }
    return { c: [H[0], H[1], H[2] + s.z] as V3, s: [1, 1] as [number, number], p: half };
  });
}
function jawStations(): Station[] {
  return LO.map((s) => {
    const { bot: b, w } = s;
    const half = [[0, -MOUTH], [w * 0.92, -MOUTH], [w * 0.97, b * 0.2], [w, b * 0.52], [w * 0.95, b * 0.82], [w * 0.62, b + 0.003], [0, b]];
    return { c: [H[0], H[1], H[2] + s.z] as V3, s: [1, 1] as [number, number], p: half };
  });
}

// ------------------------------------------------------------------------------------------------ paint: steel
const NICKS = [{ y: 0.078, d: 0.006, w: 0.006 }, { y: 0.021, d: 0.004, w: 0.004 }, { y: -0.052, d: 0.008, w: 0.007 }, { y: -0.108, d: 0.005, w: 0.005 }];
// long scratches on the cheeks (head-local z, y, both sides)
const SCRATCH: { a: [number, number]; b: [number, number]; side: number }[] = [];
for (let k = 0; k < 34; k++) {
  const z = 0.02 + h3(k, 1, 9) * 0.21, y = -0.1 + h3(k, 2, 9) * 0.19, ang = (h3(k, 3, 9) - 0.5) * 1.4 + (h3(k, 6, 9) < 0.3 ? 1.4 : 0), L = 0.01 + h3(k, 4, 9) * 0.045;
  SCRATCH.push({ a: [z, y], b: [z + Math.cos(ang) * L, y + Math.sin(ang) * L], side: h3(k, 5, 9) < 0.5 ? 1 : -1 });
}
function segD(pz: number, py: number, a: [number, number], b: [number, number]) {
  const ab0 = b[0] - a[0], ab1 = b[1] - a[1], t = cl(((pz - a[0]) * ab0 + (py - a[1]) * ab1) / (ab0 * ab0 + ab1 * ab1 || 1e-9), 0, 1);
  return Math.hypot(pz - a[0] - ab0 * t, py - a[1] - ab1 * t);
}
/** the edge's z at a height (from the stations: the front-most station that reaches that height) */
function edgeZ(y: number): number {
  let z = UP0[UP0.length - 1].z;
  if (y >= 0) { for (let i = UP0.length - 1; i >= 5; i--) { if (UP0[i].top >= y) { const j = Math.min(UP0.length - 1, i + 1); const f = UP0[j].top < y ? cl((UP0[i].top - y) / Math.max(1e-6, UP0[i].top - UP0[j].top), 0, 1) : 1; z = UP0[i].z + (UP0[j].z - UP0[i].z) * f; break; } } }
  else { for (let i = LO0.length - 1; i >= 3; i--) { if (LO0[i].bot <= y) { const j = Math.min(LO0.length - 1, i + 1); const f = LO0[j].bot > y ? cl((y - LO0[i].bot) / Math.max(1e-6, LO0[j].bot - LO0[i].bot), 0, 1) : 1; z = LO0[i].z + (LO0[j].z - LO0[i].z) * f; break; } } }
  return z;
}
const STEEL = RP('axeSteel'), FORGE = RP('forge'), RUST = RP('rust'), GUM = RP('gum'), HICK = RP('hickory'), HEART = RP('heart'), HORN = RP('horn');

function steelPaint(part: 'skull' | 'jaw' | 'tooth' | 'lid') {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt / K;
    px.lightK = 0.55;
    for (let i = 0; i < px.n; i++) {
      // head-local, in axe units
      const x = (P[i * 3] - H[0]) / K, y = (P[i * 3 + 1] - H[1]) / K, z = (P[i * 3 + 2] - H[2]) / K, ny = N[i * 3 + 1], nz = N[i * 3 + 2], ax = Math.abs(x);
      if (part === 'tooth') {
        const tip = part === 'tooth' ? 1 : 0;
        px.put(i, STEEL, 5 + tip * 0.5 + (h3(i, 1, 3) < 0.2 ? 1 : 0)); px.metal[i] = 255; px.rough[i] = 70; continue;
      }
      if (part === 'lid') { px.put(i, FORGE, 3 + (nz3(x * 300, y * 300, z * 300) > 0.3 ? 1 : 0)); px.metal[i] = 160; px.rough[i] = 150; continue; }
      // the inside of the mouth: gum and a dark throat
      const mouthFace = part === 'skull' ? ny < -0.75 && y < 0.012 && z > -0.02 : ny > 0.75 && y > -0.012;
      if (mouthFace) {
        const deep = cl((0.2 - z) / 0.2, 0, 1), ridge = Math.abs(Math.sin(z * 260)) < 0.25 && ax < wAt(z) * 0.55;
        px.put(i, GUM, 3 - deep * 1.6 - (ridge ? 0.8 : 0) + (ax > wAt(z) * 0.7 ? 0.6 : 0)); px.metal[i] = 0; px.rough[i] = 70; continue;
      }
      // the hammer face of the poll: battered bright steel, mushroomed rim, radial cracks
      if (z < -0.1 && nz < -0.55) {
        const r = Math.hypot(x / 0.04, y / 0.056), crack = Math.abs(Math.sin(Math.atan2(y, x) * 7 + 1.3)) < 0.08 && r > 0.45;
        const c = cell3(x, y, z, 0.006, 5);
        px.put(i, STEEL, 5 + (c.id % 3) * 0.5 - (crack ? 2 : 0) - (r > 0.85 ? 1.4 : 0) - ((c.f2 - c.f1) < mpt * 0.7 ? 1 : 0));
        px.metal[i] = 255; px.rough[i] = 120; continue;
      }
      // the end grain of the handle (the neck) through the eye of the poll, with the steel wedge across it
      const eg = Math.hypot((z + 0.058) / 0.042, x / 0.019);
      if (ny > 0.8 && y > 0.06 && eg < 1) {
        if (Math.abs(x) < 0.0026 + mpt * 0.3 && eg < 0.92) { px.put(i, STEEL, 6 - (Math.abs(x) > 0.0018 ? 2 : 0)); px.metal[i] = 255; px.rough[i] = 80; continue; }
        const ring = (Math.hypot((z + 0.058 + 0.03) / 1.0, x * 1.6) * 260 + nz2(z * 90, x * 90) * 1.2) % 1;
        px.put(i, eg > 0.86 ? HEART : HICK, eg > 0.86 ? 1 : 4 - (ring < 0.22 ? 1.5 : 0) - (h3(Math.floor(z * 600), Math.floor(x * 600), 4) < 0.05 ? 1 : 0));
        px.metal[i] = 0; px.rough[i] = 220; continue;
      }
      const ez = part === 'skull' || y >= 0 ? edgeZ(Math.max(y, 0.001)) : edgeZ(Math.min(y, -0.001));
      const de = ez - z; // metres back from the edge
      const bevelLine = 0.07 + nz2(y * 40, 3) * 0.004;
      // nicks: a dark notch into the edge, a bright burr round it
      let nick = 0;
      for (const n of NICKS) { const dy = Math.abs(y - n.y); if (dy < n.w && de < n.d * (1 - (dy / n.w) ** 2)) nick = 2; else if (dy < n.w * 1.6 && de < n.d * 1.4 && nick === 0) nick = 1; }
      // rust: round the eye sockets, along the mouth, pitting on the poll
      const ed = Math.hypot(ax - EYE0[0], y - EYE0[1], z - EYE0[2]);
      const rn = fbm3(x * 70, y * 70, z * 70, 3);
      const rust = ed < 0.028 + rn * 0.014 ? 1 : (Math.abs(y) < 0.006 + rn * 0.004 && z > 0.0 && z < 0.07) ? 0.7 : (z < -0.03 && rn > 0.56) ? 0.8 : 0;
      let st: number, R = STEEL, metal = 255, rough = 60;
      if (de < bevelLine) {
        // the bevel: honed bright, grinding marks running diagonally, the honed edge brightest
        const grind = ((z * 0.6 + y * 0.8) * 420 + nz2(z * 60, y * 60) * 1.6) % 1;
        st = 6.9 + (grind < 0.16 ? -0.8 : grind > 0.86 ? 0.5 : 0) + (de < 0.006 ? 1.2 : de < 0.012 ? 0.5 : 0);
        if (de > bevelLine - mpt * 1.2) st -= 1.4; // the bevel line itself
        rough = de < 0.008 ? 34 : grind < 0.16 ? 95 : 62;
      } else {
        // the cheeks and poll: black forge scale over grey steel, hammer facets
        // hammer facets: each a flat plane a shade apart, a dark seam where two meet
        const c = cell3(x, y, z, 0.018, 21);
        const edgeC = (c.f2 - c.f1) < mpt * 0.6 && (c.id % 3) === 0;
        // the black forge finish, worn through to grey steel on the high spots (the brow, the poll's edges)
        const scale = fbm3(x * 22 + 4, y * 22, z * 22, 3) + (ny > 0.6 ? 0.25 : 0) - (Math.abs(ny) < 0.3 && de < 0.11 ? 0.3 : 0);
        const flake = scale > -0.18;
        R = flake ? FORGE : STEEL;
        st = flake ? 3.4 + ((c.id % 5) - 2) * 0.16 - (edgeC ? 0.6 : 0) : 3.9 + (c.id % 3) * 0.25 - (edgeC ? 0.5 : 0);
        metal = flake ? 140 : 225; rough = flake ? 165 : 95;
        // the transition to the bevel: a scuffed, half-polished band
        if (de < bevelLine + 0.02 && !flake) { st += 1; rough = 70; }
        // maker's stamp on the cheek: a pressed diamond with a dot
        const sx = Math.abs(z - 0.085) + Math.abs(y - 0.02) * 1.3;
        if (part === 'skull' && ax > wAt(z) * 0.7 && ((sx > 0.0105 && sx < 0.0105 + mpt * 1.3) || Math.hypot(z - 0.085, y - 0.02) < mpt * 1.2)) { st = 1.2; R = FORGE; }
      }
      // long scratches across the cheeks
      for (const s of SCRATCH) if (Math.sign(x) === s.side && segD(z, y, s.a, s.b) < mpt * 0.55) { st += 2; rough = 45; R = STEEL; break; }
      if (nick === 2) { st = 1; R = FORGE; rough = 160; } else if (nick === 1) { st = 7.6; rough = 30; }
      if (rust > 0) {
        const pit = cell3(x, y, z, 0.004, 8);
        if (rn * 0.6 + rust > 0.55) { R = RUST; st = 1.6 + rn * 2.2 + (pit.f1 < mpt * 0.8 ? -1 : 0); metal = 20; rough = 235; }
      }
      // the socket deepens into dark round the eye
      if (ed < 0.022) { R = RUST; st = Math.min(st, 0.6 + (ed - 0.016) * 160); metal = 0; rough = 240; }
      px.put(i, R, st); px.metal[i] = metal; px.rough[i] = rough;
    }
    px.creaseInk(1.4, { dark: 1, lit: 0.5 });
    px.flush();
  };
}

// ------------------------------------------------------------------------------------------------ paint: hickory
interface Knot { s: number; a: number; r: number }
function hickoryPaint(F: Frame, knots: Knot[], o: { bristle?: (s: number, a: number) => number; zone?: 'body' | 'tail' } = {}) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, mpt = px.mpt;
    px.lightK = 0.8;
    const bm = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], L = locate(F, p), s = L.s, a = L.a;
      // grain: long streaks along the body, deflected round knots
      let warp = 0, knotT = -1;
      for (const k of knots) {
        const ds = (s - k.s) / (k.r * 2.2), da = (a - k.a) * L.r / k.r, d2 = ds * ds + da * da;
        if (d2 < 1) knotT = Math.max(knotT, 1 - Math.sqrt(d2));
        warp += (Math.sign(a - k.a) * 0.9) / (1 + d2 * 3);
      }
      const across = a * L.r * 62 + warp * 1.6 + nz2(s * 0.8, a * 1.2) * 1.3 + nz2(s * 5, a * 4) * 0.22;
      const g = ((across % 1) + 1) % 1;
      // heartwood: a long dark streak down the back, a few narrow streaks lower on the flanks
      const streak = nz2(s * 0.55 + 7, a * 3.2) * 0.6 + nz2(s * 2.1, a * 7) * 0.25;
      const band = (Math.abs(a) < 0.62 + nz2(s * 3, 1) * 0.12 ? 0.75 : 0) + streak - (Math.abs(a) > 2.1 ? 0.6 : 0);
      const R = band > 0.55 ? HEART : HICK;
      let st = (R === HEART ? 3.9 : 4.6) + (Math.abs(a) > 2.2 ? 0.8 : 0) - (R === HICK && band > 0.38 ? 0.6 : 0);
      if (g < 0.11) st -= 1.15; else if (g < 0.17) st -= 0.45; else if (g > 0.92 && h3(Math.floor(s * 40), Math.floor(across), 2) < 0.4) st += 0.5;
      // pores: short dark dashes along the grain
      if (h3(Math.floor(s / (mpt * 3)), Math.floor(across * 2), 7) < 0.04) st -= 1;
      if (knotT > 0) {
        // the knot: rings round a dark heart, a crack across it
        const ring = Math.floor(knotT * 6);
        px.put(i, HEART, knotT > 0.72 ? 0.6 : ring % 2 ? 2.2 : 3.1);
        px.rough[i] = 170; continue;
      }
      px.put(i, R, st);
      px.rough[i] = 150 - (Math.abs(a) < 1.2 ? 25 : 0); // the back is worn smooth and a little glossy
      if (o.bristle) bm[i] = o.bristle(s, a);
    }
    if (o.bristle) {
      // coarse dark bristle laid along the body where the bristles grow (the lock geometry stands over it)
      for (let i = 0; i < px.n; i++) if (bm[i] > 0.02) { const k = bm[i]; if (k > 0.5) { px.rampI[i] = px.ramp(HORN); px.step[i] = 3.2; } else if (h3(i, 9, 1) < k * 1.6) { px.rampI[i] = px.ramp(HORN); px.step[i] = 3.6; } }
      px.pelt({ len: 0.022, width: 0.006, mask: (i) => (bm[i] > 0.5 ? 1 : 0), tooth: 1.2, clump: 0.35, strands: 0.25, flow: -1 });
    }
    px.creaseInk(1.6, { dark: 0.8, lit: 0.4 });
    px.flush();
  };
}
/** limbs: hickory grain down the leg, darker heartwood stockings, leathery pads, bristle feathering behind */
function legPaint(sole: V3, fore: boolean) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.8;
    const fm = new Float32Array(px.n);
    for (let y = 0, i = 0; y < px.h; y++) for (let x = 0; x < px.w; x++, i++) {
      const py = P[i * 3 + 1], ny = N[i * 3 + 1];
      // pads and the underside of the toes
      if (py < 0.03 && ny < -0.35) { const c = cell3(P[i * 3], py, P[i * 3 + 2], 0.006, 12); px.put(i, HORN, 2.4 + (c.id % 3) * 0.3 - ((c.f2 - c.f1) < px.mpt ? 1.2 : 0)); px.rough[i] = 200; continue; }
      const X = ch.grid >= 0 ? px.X(x, y) : P[i * 3] * 3 + P[i * 3 + 2] * 3, Y = ch.grid >= 0 ? px.Y[y] : py;
      const across = X * 55 + nz2(Y * 6, X * 4) * 2;
      const g = ((across % 1) + 1) % 1;
      const sock = py < 0.1 + nz2(P[i * 3] * 30, P[i * 3 + 2] * 30) * 0.015;
      const R = sock ? HEART : HICK;
      let st = sock ? 2.8 : 4.1;
      if (g < 0.14) st -= 1.2; else if (g < 0.22) st -= 0.5;
      if (h3(Math.floor(Y * 120), Math.floor(across * 2), 5) < 0.04) st -= 1;
      px.put(i, R, st); px.rough[i] = 160;
      // feathering: coarse dark hair down the back of the forearm / thigh
      const u = (x + 0.5) / px.w, deg = -135 + u * 360;
      const back = Math.cos(((deg - 180) * Math.PI) / 180);
      if (ch.grid >= 0 && back > 0.55 && py > (fore ? 0.07 : 0.12) && py < (fore ? 0.24 : 0.3)) fm[i] = (back - 0.55) / 0.45;
    }
    px.pelt({ len: 0.018, width: 0.005, mask: (i) => (fm[i] > 0.2 ? 1 : 0), tooth: 1.1, clump: 0.3, strands: 0.2 });
    for (let i = 0; i < px.n; i++) if (fm[i] > 0.35) { px.rampI[i] = px.ramp(HORN); px.step[i] = 3 + (fm[i] > 0.7 ? 0 : 0.5); }
    px.creaseInk(1.4, { dark: 1.2, lit: 0.4 });
    void sole;
    px.flush();
  };
}
function clawPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), N = px.gb.N;
  px.lightK = 0.6;
  for (let i = 0; i < px.n; i++) { px.put(i, HORN, 1.6 + (N[i * 3 + 1] > 0.4 ? 1.2 : 0) + (h3(i, 3, 1) < 0.08 ? 1 : 0)); px.rough[i] = 70; }
  px.creaseInk(1, { dark: 1, lit: 1.2 });
  px.flush();
}

// ------------------------------------------------------------------------------------------------ the build
export interface HoundModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }

export function buildHoundModel(o: { page?: number; den?: number } = {}): HoundModel {
  const bones = houndBones(), bi = (n: string) => bones.findIndex((b) => b.name === n);
  const body = new Body(o.page ?? 1024);
  body.seed = 1871;

  // the spine (tail root .. head) for skinning and the painters
  const J: V3[] = [[0, 0.372, -0.66], [0, 0.35, -0.47], [0, 0.345, -0.28], [0, 0.33, -0.05], [0, 0.34, 0.2], [0, 0.42, 0.455], [0, 0.5, 0.545], [0, 0.585, 0.665], [0, 0.66, 0.7]];
  const spineSkin = chainSkin(J, [bi('pelvis'), bi('loin'), bi('root'), bi('root'), bi('chest'), bi('neck'), bi('neck2'), bi('head')], 0.35);
  const F = spineFrame([[0, 0.372, -0.66], [0, 0.35, -0.47], [0, 0.345, -0.28], [0, 0.33, -0.05], [0, 0.31, 0.2], [0, 0.36, 0.4], [0, 0.44, 0.48], [0, 0.52, 0.56], [0, 0.585, 0.64]]);
  const knots: Knot[] = [{ s: 0.38, a: 1.55, r: 0.022 }, { s: 0.74, a: -1.2, r: 0.016 }, { s: 0.95, a: 1.9, r: 0.012 }, { s: 0.2, a: -2.0, r: 0.014 }];
  const sNeck = locate(F, [0, 0.44, 0.48]).s, sRump = locate(F, [0, 0.36, -0.58]).s, sChest = locate(F, [0, 0.38, 0.38]).s;
  // where the bristles grow: a ridge down the spine (the hackles), widest over the shoulders; the chest tuft
  const bristle = (s: number, a: number) => {
    const ridge = s > sRump && s < sNeck + 0.12 ? cl(1 - Math.abs(a) / (0.17 + 0.1 * Math.exp(-(((s - sChest + 0.08) / 0.14) ** 2))), 0, 1) : 0;
    const chest = Math.abs(Math.abs(a) - Math.PI) < 0.75 && Math.abs(s - sChest) < 0.12 ? cl((0.75 - Math.abs(Math.abs(a) - Math.PI)) * 2.5, 0, 1) * cl((0.12 - Math.abs(s - sChest)) * 14, 0, 1) : 0;
    return Math.max(ridge, chest);
  };

  // ---- the trunk: rump knob .. hips .. loin tuck .. barrel .. deep keel .. shoulders .. neck rising into the poll
  const st: Station[] = [
    { c: [0, 0.372, -0.665], s: [0.05, 0.05], p: 'round' },
    { c: [0, 0.37, -0.63], s: [0.08, 0.076], p: 'round' },
    { c: [0, 0.36, -0.575], s: [0.108, 0.1], p: 'hips' },
    { c: [0, 0.352, -0.47], s: [0.128, 0.122], p: 'hips' },
    { c: [0, 0.35, -0.33], s: [0.118, 0.115], p: 'round', tw: [[7, 0, 0.06], [8, 0, 0.08]] },
    { c: [0, 0.333, -0.16], s: [0.126, 0.133], p: 'barrel' },
    { c: [0, 0.305, 0.01], s: [0.138, 0.165], p: 'barrel' },
    { c: [0, 0.297, 0.17], s: [0.144, 0.182], p: 'barrel' },
    { c: [0, 0.31, 0.3], s: [0.136, 0.185], p: 'shoulder' },
    { c: [0, 0.35, 0.4], s: [0.112, 0.15], p: 'shoulder', tw: [[8, 0, -0.1], [7, 0.03, -0.08]] },
    { c: [0, 0.43, 0.465], s: [0.088, 0.105], p: 'neck' },
    { c: [0, 0.5, 0.535], s: [0.072, 0.082], p: 'neck' },
    { c: [0, 0.57, 0.6], s: [0.056, 0.06], p: 'round' },
  ];
  const torso = body.add(trunk({
    name: 'trunk', stations: st, tween: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], capS: true, capE: false, k: 1.0, levels: 1,
    rings: [{ at: 1, s: 1, ink: false }],
    skin: (p) => spineSkin(p), paint: hickoryPaint(F, knots, { bristle }),
  }));
  body.finalize(torso);

  // ---- the axe head: the upper blade and poll on the head bone, the lower blade on the jaw
  const hb = bi('head'), jb = bi('jaw');
  const skull = body.add(trunk({
    name: 'skull', stations: upperStations(), tween: 0, capS: true, capE: true, k: 2.6, levels: 2,
    rings: [{ at: 0, s: 2 }, { at: 3, s: 1 }, { at: 8, s: 1.5 }, { at: UP.length - 1, s: 3 }],
    cols: [{ j: 1, a: 0, b: 4, s: 1.5 }, { j: 5, a: 4, b: UP.length - 1, s: 2 }, { j: 0, a: 7, b: UP.length - 1, s: 2 }],
    skin: () => [hb, 1], paint: steelPaint('skull'),
  }));
  body.finalize(skull);
  const jaw = body.add(trunk({
    name: 'jaw', stations: jawStations(), tween: 0, capS: true, capE: true, k: 2.4, levels: 1,
    rings: [{ at: 6, s: 1.5 }, { at: LO.length - 1, s: 3 }],
    cols: [{ j: 1, a: 1, b: LO.length - 1, s: 2 }, { j: 6, a: 5, b: LO.length - 1, s: 2 }],
    skin: () => [jb, 1], paint: steelPaint('jaw'),
  }));
  void jaw;
  // teeth: a row of steel fangs down each side of the mouth, both jaws
  let tk = 0;
  for (const side of [1, -1]) for (const up of [1, -1]) {
    const zs = up > 0 ? [0.04, 0.07, 0.1, 0.13, 0.158, 0.184] : [0.055, 0.085, 0.115, 0.142, 0.17];
    zs.forEach((z, k) => {
      const w = wAt(z) * K, fang = up > 0 && k === zs.length - 2;
      const at: V3 = [H[0] + side * w * 0.62, H[1] + up * MOUTH * 0.6, H[2] + z * K];
      body.add(spine({ name: 'tooth' + tk++, at, dir: [side * 0.12, -up, 0.15 * up], len: (fang ? 0.02 : 0.011 + 0.003 * h3(k, side, up)) * K, r: Math.min(w * 0.36, (fang ? 0.0055 : 0.0042) * K), skin: () => [up > 0 ? hb : jb, 1], paint: steelPaint('tooth'), levels: 0, around: 4, k: 1.2 }));
    });
  }
  // eyes, deep in their sockets, and steel lids that close over them
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const c: V3 = [H[0] + side * EYE[0], H[1] + EYE[1], H[2] + EYE[2]], ax: V3 = [side * 0.8, 0.08, 0.6];
    body.add(eyeball({ name: 'eye' + s, c, ax, r: 0.0158 * K, bone: bi('eye' + s), iris: RP('gold'), pupil: 'slit', irisA: 0.78, sclera: RP('ochre'), k: 3, levels: 0, around: 10 }));
    body.add(eyelid({ name: 'lid' + s, c, ax, r: 0.0158 * K, bone: bi('lid' + s), paint: steelPaint('lid'), cover: 0.95, root: 2.3 })).levels = 0;
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
      pad: L.r * (L.fore ? 0.74 : 0.66), h: L.padH, fwd: 0.32, nail: 'claw', lobe: 0.22, toeAround: 6,
      toes: [-36, -12, 12, 36].map((a, k) => ({ a, len: L.r * (k === 1 || k === 2 ? 0.42 : 0.32), r: L.r * 0.19, claw: L.r * (L.fore ? 0.5 : 0.36) * (k === 1 || k === 2 ? 1 : 0.85), curl: 0.55, drop: 0.3 })),
    };
    if (L.fore) foot.toes.push({ a: -105, len: L.r * 0.04, r: L.r * 0.11, claw: L.r * 0.22, curl: 0.8, drop: -0.5 });
    const out = limb({
      name: L.name, side: L.side, hip: L.hip, knee: L.knee, hock: L.hock, sole: L.sole, tj, rings, foot, around: 12, levels: 1, rise: 0.08,
      bones: L.bones, paint: legPaint(L.sole, L.fore), clawPaint, k: 1.05,
    });
    out.claws.levels = 0; out.toes.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
  }

  // ---- the whip tail
  const tailBones = [0, 1, 2, 3, 4, 5].map((k) => bi('tail' + k));
  const tailSkin = chainSkin([...TAIL_PTS.slice(0, 6), TAIL_PTS[6]], tailBones, 0.4);
  const TF = spineFrame(TAIL_PTS);
  const tailPath = curve(TAIL_CTRL, 10);
  const tail = body.add(stalk({
    name: 'tail', path: tailPath, r: (t) => 0.034 * Math.pow(1 - t, 1.25) + 0.0035, around: 8, capS: false, capE: true, levels: 1, k: 1,
    skin: (p) => { const L = locate(TF, p); return L.s < 0.02 ? [bi('pelvis'), 0.5, tailBones[0], 0.5] : tailSkin(p); },
    paint: (ch, pp, b) => hickoryPaint(TF, [], { bristle: (s) => cl((s - TF.L * 0.72) / (TF.L * 0.06), 0, 1) })(ch, pp, b),
  }));
  body.finalize(tail);

  // ---- bristle locks: the hackles down the spine, the chest tuft, the tail's tip
  const seats: LockSeat[] = [];
  const g = torso.grids[0], R = g.v.length;
  const vOf = (z: number) => { let best = 0, bd = Infinity; for (let i = 0; i < R; i++) { const q = gridSurf(torso.m, g, 0.5, i / (R - 1)); const d = Math.abs(q.p[2] - z); if (d < bd) { bd = d; best = i; } } return best / (R - 1); };
  const vR = vOf(-0.56), vS = vOf(0.36), vN = vOf(0.47);
  const back: V3 = [0, 0, -1];
  seats.push(...seatsOn(torso, {
    u0: 0.44, u1: 0.56, v0: vR, v1: vN, rows: 34, cols: 4, wid: 0.0065, lift: 0.55, droop: 0.15, sink: 0.1,
    len: (u, v) => 0.026 + 0.03 * Math.exp(-(((v - vS) / 0.09) ** 2)) - Math.abs(u - 0.5) * 0.12,
    dir: (_p, n) => norm([n[0] * 0.3 + back[0], n[1] * 0.5 + 0.1, back[2] * 0.9 + n[2] * 0.2]),
    col: (u, v) => (h3(Math.floor(u * 97), Math.floor(v * 97), 2) < 0.3 ? 1 : 0), skin: spineSkin, seed: 11,
  }));
  // the chest tuft under the forechest (u = 0 is the belly midline)
  const vC0 = vOf(0.28), vC1 = vOf(0.43);
  seats.push(...seatsOn(torso, {
    u0: -0.1, u1: 0.1, v0: vC0, v1: vC1, rows: 7, cols: 5, wid: 0.008, lift: 0.2, droop: 0.6, sink: 0.1,
    len: () => 0.04, dir: (_p, n) => norm([n[0] * 0.2, -1, -0.25]), col: () => 0, skin: spineSkin, seed: 13,
  }));
  // the tail tip: a cracker of bristles
  const tg = tail.grids[0];
  for (let k = 0; k < 18; k++) {
    const v = 0.74 + (k / 18) * 0.24, u = h3(k, 1, 5), q = gridSurf(tail.m, tg, u, v);
    seats.push({ p: q.p, n: q.n, dir: norm([q.dv[0] + q.n[0] * 0.35, q.dv[1] + q.n[1] * 0.35, q.dv[2] + q.n[2] * 0.35]), len: 0.04 + 0.02 * h3(k, 2, 5), wid: 0.005, lift: 0.35, droop: 0.2, col: 0, w: tailSkin(q.p) });
  }
  const lk = locks({ name: 'bristle', seats, tiles: [HORN, HEART], steps: [3, 2], seed: 7 });
  if (lk) body.add(lk);

  const out = body.build({ den: o.den ?? 300, maxScale: 2.2, budget: 21000 });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, bones, tris: out.tris, den: body.den, stats };
}
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export type { Wt };
