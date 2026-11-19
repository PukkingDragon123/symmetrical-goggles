// DINGBAT: model. A little bat-owl of the cabin eaves (wingspan about half a metre): a fluffy owl's body and a big
// round owl head with a pale facial disc ringed in dark feathers, two little forked deer-antler nubs in velvet on
// its crown, huge amber eyes and, under them, a mouth far too big for it: a frog-wide gape that opens to a wet red
// throat with a row of needle teeth. Its wings are a bat's (a leathery membrane stretched over long fingers, a hook
// of a thumb at the wrist, scalloped between the finger tips) but feathered: coverts over the arm, a fringe of soft
// owl flight feathers along the trailing edge, a barred fan of a tail, feathered trousers down to taloned toes.
// Body and head feathers are real geometry (locks drawn as feathers, cards.ts).
// Creature space: metres, +z forward, +y up, in FLIGHT REST POSE: the body level, wings spread flat, legs trailing
// back under the tail; the root bone (the body's centre) is the origin. The roost turns the whole bat head-down to
// hang it by the talons (DB.grip).
import * as THREE from 'three';
import {
  Body, runSync, runAsync, trunk, eyeball, eyelid, locks, stalk, horn, fin, spine, curve, chainSkin, gridSurf, Px, RP, cell3, h3, cl,
  type V3, type Wt, type Piece, type Chart, type Station, type LockSeat,
} from '../anatomy';
import { fbm3 } from '../paintkit';
import { cardPaint } from '../cards';
import type { BoneDef } from '../rig';
import { furZones } from '../fur/paint';

export const DINGBAT_MODEL_VERSION = 'dingbat@6';
export interface DingbatModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }

/** landmarks (left side; the right is the mirror in x) */
export const DB = {
  /** the neck pivot and the centre of the round head */
  neck: [0, 0.016, 0.058] as V3, hc: [0, 0.03, 0.098] as V3,
  /** head half width, half height, half depth */
  hw: 0.05, hh: 0.046, hd: 0.043,
  /** the jaw hinge (back corners of the gape) */
  hinge: [0, 0.011, 0.072] as V3,
  eye: [0.021, 0.038, 0.1345] as V3, eyeR: 0.0135,
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
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);

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
const FLESH = RP('flesh'), BLOOD = RP('blood'), CORAL = RP('coral'), GOLD = RP('gold'), OCHRE = RP('ochre'), HIDE = RP('hide');

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
/** the upper head: crown and nape in plumage, the pale facial disc (fine radiating feathers, a dark rim, dark brows
 *  running up to the antlers, sooty rings round the eyes), and underneath the red palate of the gape */
function headPaint() {
  const H = DB.hc;
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
    px.lightK = 0.6;
    const disc = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      if ((i & 4095) === 0) yield;
      const x = P[i * 3] - H[0], y = P[i * 3 + 1] - H[1], z = P[i * 3 + 2] - H[2], ax = Math.abs(x), ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      const m = fbm3(x * 80, y * 80, z * 80, 2);
      // the palate: the flat underside of the head, seen only when the gape opens: wet red ridges going dark to
      // the throat at the back
      if (ny < -0.6 && y < -0.012) {
        const back = cl((DB.hd - z) / (DB.hd * 2), 0, 1);
        const ridge = Math.abs(Math.sin(z * 520)) < 0.25 && ax < 0.032;
        // (drawn straight to colour: the closed mouth's ambient occlusion would bury it in black)
        const st = Math.round(cl(4.6 - back * 3.4 + (ridge ? 1 : 0) - (ax > 0.032 ? 1 : 0) + m * 0.5, 0, 5));
        px.over[i] = ax > 0.039 && z > -0.02 ? INK[1] : back > 0.7 ? BLOOD[Math.min(4, st + 1)] : FLESH[st]; px.rough[i] = 130;
        continue;
      }
      // the facial disc: an oval on the face, its rim a ring of dark feathers
      const dx = x / 0.047, dy = (y + 0.004) / 0.042, rd = Math.hypot(dx, dy);
      const onFace = z > 0.022 && nz > 0.35;
      if (onFace && rd < 1.06) {
        disc[i] = 1;
        const ang = Math.atan2(dy, dx), ray = Math.abs(Math.sin(ang * 26 + rd * 3)) < 0.22;
        let R = BONE, st = 4.1 - rd * 0.8 + m * 0.4 - (ray ? 0.6 : 0);
        if (rd > 0.86) { R = SOIL; st = 1.4 + (Math.abs(Math.sin(ang * 30)) < 0.4 ? 0.7 : 0); }
        // sooty rings round the eyes, dark brows sweeping up to the antlers (a frown of a face)
        const ex = ax - DB.eye[0], ey = y - (DB.eye[1] - H[1]), ed = Math.hypot(ex, ey);
        if (ed < 0.0158) { R = SOIL; st = 0.9 + ed * 60; }
        // dark brows slanting up from the beak to the antlers: a frown
        const bl = ey - (0.012 + (ax - 0.006) * 0.55);
        if (ax > 0.004 && ax < 0.042 && bl > -0.0035 && bl < 0.003) { R = SOIL; st = 0.7; }
        // pale feathers between the eyes over the beak
        if (ax < 0.007 && ey > -0.01 && ey < 0.01) { R = BONE; st = 4.4 - Math.abs(ey) * 60; }
        px.put(i, R, st); px.rough[i] = 220; continue;
      }
      px.put(i, FUR, 2.5 + m * 0.7 + (y > 0.02 ? -0.3 : 0)); px.rough[i] = 235;
    }
    yield;
    px.scales({ size: 0.0065, kind: 'shield', flow: -1, ink: 1.5, lit: 0.8, mask: (i) => (disc[i] ? 0 : 1), seed: 9 });
    // the gape's lip line along the front of the palate: a dark rim
    for (let i = 0; i < px.n; i++) { const y = P[i * 3 + 1] - H[1]; if (Math.abs(y + 0.018) < mpt * 1.2 && N[i * 3 + 2] > 0.2 && N[i * 3 + 1] < 0.1) px.over[i] = INK[0]; }
    px.creaseInk(1.1, { dark: 1, lit: 0.6 });
    px.flush();
  };
}
/** the lower jaw: feathered pale chin outside; inside the scoop a red tongue in a dark wet throat, lips edged black,
 *  a row of tiny needle teeth along the rim */
function jawPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
  px.lightK = 0.6;
  const H = DB.hc;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ax = Math.abs(x), ny = N[i * 3 + 1];
    const top = y > DB.hinge[1] - 0.004 && ny > -0.2, rim = y > DB.hinge[1] + 0.001;
    if (top && !rim && ny > 0.3) {
      // the mouth floor: the tongue down the middle, dark sides, the throat at the back
      const back = cl((H[2] + DB.hd - z) / 0.07, 0, 1);
      const tongue = ax < 0.016 * (1 - back * 0.4) && back < 0.75, m = fbm3(x * 200, y * 200, z * 200, 2);
      const st = Math.round(cl((tongue ? 5 - back * 1.6 - (ax > 0.012 ? 1 : 0) : 3.6 - back * 3) + m * 0.6, 0, 5));
      px.over[i] = !tongue && back > 0.6 ? BLOOD[Math.min(4, st + 1)] : FLESH[st]; px.rough[i] = 120;
      continue;
    }
    if (rim) {
      // the lips: black edged, the teeth a row of pale points along the inner edge
      const tooth = Math.abs(((x * 330) % 1 + 1) % 1 - 0.5) < 0.22 && ny > 0.4 && z > H[2] - 0.01;
      px.put(i, tooth ? BONE : INK, tooth ? 4.6 : 1.4); px.rough[i] = tooth ? 70 : 110;
      continue;
    }
    // outside: a pale margin under the lips, then the tawny barred feathers of the throat
    const m = fbm3(x * 90, y * 90, z * 90, 2);
    if (y > DB.hinge[1] - 0.008) px.put(i, BONE, 3.6 + m * 0.4);
    else px.put(i, FUR, 2.4 + m * 0.6 - (Math.abs(Math.sin(z * 300 + ax * 80)) < 0.2 ? 0.9 : 0));
    px.rough[i] = 230;
  }
  px.scales({ size: 0.005, kind: 'shield', flow: -1, ink: 1.2, lit: 0.6, mask: (i) => (P[i * 3 + 1] < DB.hinge[1] - 0.004 ? 1 : 0), seed: 13 });
  void mpt; px.flush();
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

  // ---- the head: a big round owl's head down to the gape's flat red palate; the facial disc on its front
  const UP = [[0, 1], [0.4, 0.95], [0.74, 0.76], [0.95, 0.42], [1.0, 0.05], [0.97, -0.24], [0.84, -0.4], [0.46, -0.46], [0, -0.47]];
  const hst = (dz: number, sx: number, sy: number, dy = 0): Station => ({ c: [0, H[1] + dy, H[2] + dz], s: [DB.hw * sx, DB.hh * sy], p: UP });
  const headSkin = (p: V3): Wt => (p[2] < DB.neck[2] + 0.004 ? [HEAD, 0.6, ROOT, 0.4] : [HEAD, 1]);
  const head = body.add(trunk({
    name: 'skull', stations: [hst(-0.043, 0.36, 0.42, 0.004), hst(-0.034, 0.74, 0.78), hst(-0.018, 0.94, 0.96), hst(0.002, 1, 1), hst(0.02, 0.98, 0.98), hst(0.032, 0.9, 0.92), hst(0.0395, 0.75, 0.8), hst(0.0425, 0.42, 0.5, -0.002)],
    tween: 1, capS: true, capE: true, levels: 1, k: 2.2, rings: [{ at: 6, s: 1.2 }], skin: headSkin, paint: headPaint(),
  }));
  body.finalize(head);
  yield 'head';
  // the jaw: a wide scoop under the palate, hinged at the back corners of the gape
  const JP = [[0, 0.1], [0.42, 0.42], [0.8, 0.95], [1.0, 0.5], [0.98, -0.1], [0.86, -0.58], [0.62, -0.88], [0.32, -1.0], [0, -1.0]];
  const jst = (z: number, w: number, h: number, y: number): Station => ({ c: [0, y, z], s: [w, h], p: JP });
  body.add(trunk({
    name: 'jaw', stations: [jst(0.058, 0.026, 0.01, 0.001), jst(0.072, 0.04, 0.0145, -0.001), jst(0.092, 0.0475, 0.0165, -0.0025), jst(0.112, 0.0455, 0.016, -0.0025), jst(0.13, 0.036, 0.013, -0.0005), jst(0.139, 0.02, 0.008, 0.0015)],
    tween: 0, capS: true, capE: true, levels: 1, k: 1.8, cols: [{ j: 2, a: 1, b: 5, s: 1.5, ink: true }], skin: () => [bi('jaw'), 1], paint: jawPaint,
  }));
  // a little hooked beak over the middle of the gape
  body.add(stalk({ name: 'beak', path: curve([[0, H[1] - 0.004, H[2] + 0.036], [0, H[1] - 0.006, H[2] + 0.044], [0, H[1] - 0.014, H[2] + 0.048], [0, H[1] - 0.022, H[2] + 0.045]], 5), r: (t) => 0.0065 * (1 - t * 0.85) + 0.0006, sec: (a) => (Math.abs(Math.sin(a)) > 0.7 ? 0.7 : 1), around: 6, levels: 1, k: 2, skin: () => [HEAD, 1], paint: flat(HORN, 2.4, 90) }));
  // eyes, lids
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(DB.eye, s), ax: V3 = [s * 0.22, 0.04, 1];
    body.add(eyeball({ name: 'eye' + S, c, ax, r: DB.eyeR, bone: HEAD, iris: GOLD, pupil: 'round', irisA: 0.82, sclera: SOIL, k: 2.6, levels: 1, around: 8 }));
    const lid = body.add(eyelid({ name: 'lid' + S, c, ax, r: DB.eyeR, bone: bi('lid' + S), paint: flat(SOIL, 1.6, 220), cover: 1.25, root: 2.3 }));
    lid.levels = 0;
  }
  // antler nubs: a short beam with a burr, forking once into a front tine
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const b0 = mir(DB.antler, s);
    const ctrl: V3[] = [add(b0, [0, -0.004, 0]), add(b0, [s * 0.003, 0.007, -0.002]), add(b0, [s * 0.01, 0.016, -0.007]), add(b0, [s * 0.019, 0.022, -0.016]), add(b0, [s * 0.025, 0.025, -0.026])];
    body.add(horn({ name: 'antler' + S, ctrl, r0: 0.0072, skin: () => [HEAD, 1], paint: antlerPaint, flat: 0.88, rings: 3, k: 1.6 }));
    const pt = curve(ctrl, 10)[4];
    body.add(horn({ name: 'tine' + S, ctrl: [add(pt, [0, -0.002, -0.001]), add(pt, [s * 0.002, 0.006, 0.004]), add(pt, [s * 0.001, 0.013, 0.005])], r0: 0.0042, skin: () => [HEAD, 1], paint: antlerPaint, rings: 3, k: 1.6 }));
  }
  yield 'face';

  // ---- wings: a bat's membrane over long fingers, feathered over the arm
  const wingSkin = (s: number) => {
    const ch = chainSkin([[0, 0, 0], [DB.S[0], 0, 0], [DB.E[0], 0, 0], [DB.W[0] + 0.004, 0, 0], [0.3, 0, 0]], [ROOT, bi('arm' + (s > 0 ? 'L' : 'R')), bi('fore' + (s > 0 ? 'L' : 'R')), bi('hand' + (s > 0 ? 'L' : 'R'))], 0.3);
    return (p: V3) => ch([Math.abs(p[0]), 0, 0]);
  };
  const seats: LockSeat[] = [];
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const ws = wingSkin(s);
    const rays: [V3, V3][] = [[DB.S, DB.B], [DB.E, DB.T1], [DB.W, DB.D5], [add(DB.W, [0.005, 0, -0.002]), DB.D4], [add(DB.W, [0.01, 0, -0.004]), DB.D3], [add(DB.W, [0.015, 0, -0.006]), DB.D2]];
    const roots = rays.map(([r]) => mir(r, s)), tips = rays.map(([, t]) => mir(t, s));
    body.add(fin({
      name: 'wing' + S, roots, dirs: roots.map((r, k) => nrm(sub(tips[k], r))), lens: roots.map((r, k) => len3(sub(tips[k], r))), side: roots.map(() => [0, 1, 0] as V3),
      ray: 0.0021, web: 0.0009, scallop: 0.3, steps: 5, skin: (p) => ws(p), paint: wingPaint(s), levels: 1, k: 1,
    }));
    // the arm along the leading edge, the leading finger, the thumb's hook
    body.add(stalk({ name: 'arm' + S, path: curve([mir([0.018, 0.012, 0.032], s), mir(DB.S, s), mir([0.062, 0.018, 0.026], s), mir(DB.E, s), mir([0.12, 0.017, 0.026], s), mir(DB.W, s), mir(add(DB.W, [0.016, 0, -0.006]), s)], 10), r: (t) => 0.0065 - t * 0.0036, around: 6, capS: true, levels: 1, k: 1, skin: ws, paint: plumage({ flow: 1, size: 0.006 }) }));
    body.add(stalk({ name: 'digit' + S, path: curve([mir(add(DB.W, [0.012, 0.0005, -0.004]), s), mir(add(DB.W, [0.06, 0.0005, -0.012]), s), mir(DB.D2, s)], 6), r: (t) => 0.0027 - t * 0.0017, around: 5, levels: 1, k: 1, skin: ws, paint: flat(LEA, 1.6, 150) }));
    body.add(spine({ name: 'thumb' + S, at: mir(add(DB.W, [0.002, 0.003, 0.004]), s), dir: [s * 0.25, 0.35, 1], len: 0.012, r: 0.0022, skin: ws, paint: flat(HORN, 1.4, 90), levels: 1 }));
    // a fringe of soft flight feathers along the inner wing's trailing edge
    for (let k = 0; k < 11; k++) {
      const f = (k + 0.5) / 11, a = mir(DB.B, s), c = mir(DB.D5, s), mid = mir(DB.T1, s);
      const p = f < 0.5 ? add(a, scl(sub(mid, a), f * 2)) : add(mid, scl(sub(c, mid), (f - 0.5) * 2));
      const pp = add(p, [0, 0.0015 * (k % 2), 0.018]);
      seats.push({ p: pp, n: [0, 1, 0], dir: nrm([s * 0.2 * f, -0.04, -1]), len: 0.034 + 0.01 * Math.sin(f * Math.PI), wid: 0.012, lift: 0.03, droop: 0.04, col: k % 3 === 0 ? 3 : 0, w: ws(pp) });
    }
    yield 'wing';
  }

  // ---- legs: feathered trousers, three toes with hooked talons (they curl toward the back: the grip on the eave)
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const hip = mir(DB.hip, s), ft = mir(DB.foot, s), LB = bi('leg' + S), FB = bi('foot' + S);
    body.add(stalk({ name: 'leg' + S, path: curve([add(hip, [0, 0.008, 0.01]), hip, mir([0.021, -0.03, -0.062], s), ft], 6), r: (t) => 0.0095 - t * 0.004, around: 6, capS: true, levels: 1, k: 1, skin: (p) => (p[2] < ft[2] + 0.012 ? [FB, 1] : [LB, 1]), paint: plumage({ flow: 1, size: 0.005 }) }));
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.5, d: V3 = [Math.sin(a) * s * 0.8, -0.1, -Math.cos(a)];
      const tip = add(ft, scl(nrm(d), 0.016));
      body.add(stalk({ name: 'toe' + S + k, path: [add(ft, [0, 0.002, 0.004]), add(ft, scl(nrm(d), 0.008)), tip], r: (t) => 0.0026 - t * 0.0008, around: 5, levels: 0, k: 1, skin: () => [FB, 1], paint: toePaint }));
      body.add(stalk({ name: 'talon' + S + k, path: curve([add(tip, scl(nrm(d), -0.002)), add(tip, scl(nrm(d), 0.004)), add(tip, add(scl(nrm(d), 0.007), [0, 0.004, 0])), add(tip, add(scl(nrm(d), 0.007), [0, 0.009, 0]))], 5), r: (t) => 0.0018 * (1 - t * 0.85), around: 5, levels: 0, k: 1, skin: () => [FB, 1], paint: flat(HORN, 1.2, 80) }));
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
  // the crown and nape
  sow(head, 46, {
    u0: 0.2, u1: 0.8, v0: 0.02, v1: 0.55, wid: 0.0095, seed: 7, skin: headSkin, lift: 0.3, droop: 0.12,
    len: () => 0.017, dir: (_p, n, dv) => nrm([-dv[0] + n[0] * 0.3, -dv[1] - 0.1, -dv[2]]), col: () => 0,
  });
  // the ruff: a ring of short dark-tipped feathers round the disc, standing forward to frame the face
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    if (sa < -0.55) continue; // not across the gape
    const p: V3 = [H[0] + ca * DB.hw * 0.86, H[1] - 0.004 + sa * DB.hh * 0.86, H[2] + 0.028 - Math.abs(ca) * 0.004];
    const n = nrm([ca, sa, 0.35]);
    seats.push({ p, n, dir: nrm([ca * 0.5, sa * 0.5, 1]), len: 0.016 + (sa > 0.3 ? 0.004 : 0), wid: 0.0068, lift: 0.5, droop: 0.05, col: 3, w: [HEAD, 1] });
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
  const out = yield* body.buildGen({ den: o.den ?? 700, maxScale: 2, budget: 11000, fur: DINGBAT_FUR });
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
  { piece: /^leg/, len: 0.9, clump: 0.8, tip: 0.6 },
  { piece: /^arm/, len: 0.5, clump: 0.6 },
]);
