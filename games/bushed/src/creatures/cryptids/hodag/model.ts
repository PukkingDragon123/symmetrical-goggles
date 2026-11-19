// THE HODAG (Rhinelander, Wisconsin, 1893: "the head of a frog, the grinning face of a giant elephant, thick short
// legs set off by huge claws, the back of a dinosaur, and a long tail with spears at the end"; Tryon 1939 gives it
// horns and spines). This one: a squat, heavy, low-slung beast about 2.8 m from snout to tail spear. A huge flat
// bull-frog head with bulging gold eyes on turrets, a grin that runs back past the eyes, fangs over the lips and a
// pale throat sac under the jaw that swells when it bellows; a pair of bull horns sweeping out and forward from
// behind the eyes; a row of thick hooked bone spines down the back and the tail, ending in a three-bladed spear;
// a warty olive-black dinosaur hide on the back, shaggy coarse dark fur hanging off the flanks and shoulders, a
// ridged straw-yellow bull-frog belly; short thick legs on broad paws with long pale hooked claws.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, eyeball, eyelid, locks, stalk, curve, chainSkin, sac, gridSurf, Px, RP, cell3, h3, cl,
  type V3, type Station, type FootSpec, type LockSeat, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { fbm3, nz2, seatsOn } from '../../paintkit';
import { bonesKit, boneIndex, coat, solid, warts, wet, finishModel, REG, type CryptidModel, type ModelGen } from '../kit';
import { furZones, type FurZone } from '../../fur';
import type { BoneDef } from '../../rig';

export const HODAG_MODEL_VERSION = 'hodag@5';
/** the head bone (the back of the skull over the jaw hinge) */
export const HH: V3 = [0, 0.66, 0.6];
export const HODAG_EYE: V3 = [0.168, 0.795, 0.675];
const TAIL_CTRL: V3[] = [[0, 0.62, -0.8], [0, 0.58, -1.02], [0, 0.5, -1.27], [0, 0.45, -1.52], [0, 0.46, -1.74], [0, 0.5, -1.9]];
const TAIL = curve(TAIL_CTRL, 7);
export const HODAG_LEGS = {
  f: { hip: [0.26, 0.5, 0.29] as V3, knee: [0.33, 0.29, 0.21] as V3, sole: [0.39, 0, 0.33] as V3, r: 0.115 },
  h: { hip: [0.28, 0.53, -0.5] as V3, knee: [0.34, 0.31, -0.39] as V3, sole: [0.38, 0, -0.55] as V3, r: 0.12 },
};
const PADH = 0.034;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function hodagBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('root', null, [0, 0.6, -0.1]);
  A('chest', 'root', [0, 0.63, 0.24]);
  A('neck', 'chest', [0, 0.66, 0.45]);
  A('head', 'neck', HH);
  A('jaw', 'head', [0, 0.6, 0.55]);
  A('sac', 'jaw', [0, 0.455, 0.68]);
  A('tongue', 'jaw', [0, 0.598, 0.6]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(HODAG_EYE, k)); A('lid' + s, 'head', mir(HODAG_EYE, k)); }
  A('hips', 'root', [0, 0.61, -0.5]);
  for (let k = 0; k < 5; k++) A('tail' + k, k === 0 ? 'hips' : 'tail' + (k - 1), TAIL[k]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const f = HODAG_LEGS.f;
    A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k));
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const h = HODAG_LEGS.h;
    A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k));
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ the head
// head-local stations (relative to HH): z, crown height, half width. The mouth line m(z) rises toward the back: the
// grin's corners curl up behind the eyes.
const UP = [
  { z: -0.15, top: 0.06, w: 0.19 }, { z: -0.07, top: 0.115, w: 0.27 }, { z: 0.02, top: 0.15, w: 0.31 }, { z: 0.11, top: 0.148, w: 0.315 },
  { z: 0.2, top: 0.125, w: 0.29 }, { z: 0.28, top: 0.095, w: 0.245 }, { z: 0.34, top: 0.065, w: 0.185 }, { z: 0.385, top: 0.032, w: 0.105 }, { z: 0.402, top: 0.0, w: 0.03 },
];
const LO = [
  { z: -0.13, bot: -0.17, w: 0.2 }, { z: -0.05, bot: -0.215, w: 0.27 }, { z: 0.05, bot: -0.225, w: 0.3 }, { z: 0.15, bot: -0.205, w: 0.295 },
  { z: 0.24, bot: -0.175, w: 0.265 }, { z: 0.31, bot: -0.145, w: 0.215 }, { z: 0.36, bot: -0.115, w: 0.15 }, { z: 0.395, bot: -0.088, w: 0.075 }, { z: 0.408, bot: -0.072, w: 0.02 },
];
export const mouthY = (z: number) => -0.068 + 0.05 * cl((0.08 - z) / 0.24, 0, 1);
const upperStations = (): Station[] => UP.map((s) => {
  const m = mouthY(s.z) + 0.003, { top, w } = s;
  return { c: add(HH, [0, 0, s.z]), s: [1, 1], p: [[0, top], [w * 0.52, top * 0.98], [w * 0.86, top * 0.74], [w, top * 0.3 + m * 0.2], [w * 0.99, m * 0.5], [w * 0.93, m], [0, m]] };
});
const jawStations = (): Station[] => LO.map((s) => {
  const m = mouthY(s.z) - 0.004, { bot, w } = s;
  return { c: add(HH, [0, 0, s.z]), s: [1, 1], p: [[0, m], [w * 0.9, m], [w * 0.98, m - 0.018], [w, (m + bot) * 0.5], [w * 0.9, bot * 0.86 + m * 0.14], [w * 0.55, bot * 0.99], [0, bot]] };
});
const wAt = (z: number) => { for (let i = 0; i + 1 < UP.length; i++) if (z <= UP[i + 1].z) { const f = cl((z - UP[i].z) / (UP[i + 1].z - UP[i].z), 0, 1); return UP[i].w + (UP[i + 1].w - UP[i].w) * f; } return 0.02; };

// ------------------------------------------------------------------------------------------------ paint
const HIDE = RP('olive'), HIDE2 = RP('hide'), DARK = RP('basalt'), MOSS = RP('moss'), BELLY = RP('straw'), FUR = RP('squatch'), FUR2 = RP('fur'), BONE = RP('bone'), HORN = RP('horn'), GOLD = RP('gold');
/** the warty dinosaur back, the fur on the flanks, the ridged frog belly */
const hidePaint = (part: 'body' | 'leg' | 'tail') => coat({
  lightK: 0.85,
  texel: (px, i, x, y, z, nx, ny) => {
    const ax = Math.abs(x), m = fbm3(x * 4, y * 4, z * 4, 3), blot = fbm3(x * 9 + 3, y * 9, z * 9, 2);
    // the belly and throat: straw-yellow, transverse ridges, darker toward the flanks
    const belly = part === 'body' ? cl((-ny - 0.35) * 3, 0, 1) * cl((0.5 - y) * 6, 0, 1) : part === 'tail' ? cl((-ny - 0.6) * 4, 0, 1) : 0;
    if (belly > 0.5) {
      const ridge = Math.abs(Math.sin(z * 70 + nz2(x * 8, z * 8) * 1.5)) < 0.16;
      px.put(i, BELLY, 2.4 + m * 0.8 - (ridge ? 1.1 : 0) - cl(ax / 0.3 - 0.6, 0, 1) * 1.2); px.rough[i] = 150; return 0;
    }
    // fur: the shaggy flanks and shoulders, the upper legs
    let furK = 0;
    if (part === 'body') furK = cl((Math.abs(nx) - 0.35) * 3, 0, 1) * cl((0.86 - y) * 6, 0, 1) * cl((y - 0.3) * 8, 0, 1);
    if (part === 'leg') furK = cl((y - 0.24) * 7, 0, 1);
    if (part === 'body' && z > 0.15 && z < 0.5 && ny > -0.2) furK = Math.max(furK, cl((0.8 - y) * 5, 0, 1) * 0.9);
    furK *= cl(0.75 + m, 0, 1);
    if (furK > 0.35) { px.put(i, m > 0.15 ? FUR2 : FUR, (m > 0.15 ? 1.4 : 2.3) + blot * 0.8); px.rough[i] = 235; return furK; }
    // the hide: olive-brown going warmer in patches, dark frog blotches with a paler rim, a little lichen on top,
    // scaly lower legs
    let R = HIDE, st = 2.4 + m * 0.7 - (ny > 0.75 ? 0.3 : 0);
    if (blot > 0.3) st = 1.0 - (blot - 0.3) * 2; else if (blot > 0.23) st += 0.8;
    if (ny < 0.2 && fbm3(x * 1.5 + 4, y * 1.5, z * 1.5, 2) > 0.25) { R = HIDE2; st -= 0.2; }
    if (ny > 0.6 && fbm3(x * 7 + 7, z * 7, y * 7, 2) > 0.5) { R = MOSS; st = 2 + m * 0.5; }
    if (part === 'leg' && y < 0.24) { const c = cell3(x, y, z, 0.022, 3); st = 2 + (c.id % 3) * 0.4 - ((c.f2 - c.f1) < px.mpt * 1.1 ? 1.3 : 0); R = c.id % 5 === 0 ? DARK : HIDE; }
    px.put(i, R, st); px.rough[i] = 205;
    return 0;
  },
  pelt: { len: 0.075, width: 0.012, flow: part === 'body' ? -1 : 1, down: 0.85, tooth: 1.7, clump: 0.6, strands: 0.3 },
  ink: [1.2, 1.2, 0.6],
  after: (px, fur) => {
    const hide = (i: number) => (fur[i] < 0.2 && px.rampT[px.rampI[i]] !== BELLY ? 1 : 0);
    px.pebbles(0.016, { mask: hide, depth: 0.7, seed: 4 });
    warts(px, 0.045, 0.55, hide, 11);
  },
});
/** the head: a frog's olive crown mottled darker, folds over the snout, pale yellow lips, nostrils, the throat */
function headPaint(part: 'skull' | 'jaw') {
  return coat({
    lightK: 0.7,
    texel: (px, i, X, Y, Z, _nx, ny) => {
      const x = X - HH[0], y = Y - HH[1], z = Z - HH[2], ax = Math.abs(x), m = mouthY(z), w = wAt(z);
      const mot = fbm3(X * 7, Y * 7, Z * 7, 3), big = fbm3(X * 3 + 5, Y * 3, Z * 3, 2);
      // inside the mouth (the palate faces down, the jaw's top faces up)
      const inside = part === 'skull' ? ny < -0.75 && y < m + 0.012 : ny > 0.75 && y > m - 0.012;
      if (inside) { const deep = cl((0.36 - z) / 0.42, 0, 1); px.put(i, RP('gum'), 3.2 - deep * 2.4 - (Math.abs(Math.sin(z * 160)) < 0.2 && ax < w * 0.6 ? 0.8 : 0) + (ax > w * 0.8 ? 0.6 : 0)); px.rough[i] = 55; return 0; }
      // lips: a thick pale yellow rim along the grin, a dark crease where they meet
      const dl = Math.abs(y - m);
      if (dl < px.mpt * 1.2) { px.put(i, RP('ink'), 1); px.rough[i] = 80; return 0; }
      if (dl < 0.022) { px.put(i, BELLY, 3.3 - dl / 0.022 * 0.9 + (y > m ? 0.3 : -0.2)); px.rough[i] = 110; return 0; }
      if (part === 'jaw') {
        // the throat: straw-yellow with long folds, olive on the jaw's sides
        if (ny < -0.3 || y < m - 0.1) { const fold = Math.abs(Math.sin(x * 60 + nz2(x * 10, z * 10) * 2)) < 0.14; px.put(i, BELLY, 2.6 + mot * 0.7 - (fold ? 1 : 0)); px.rough[i] = 140; return 0; }
        px.put(i, big > 0.2 ? DARK : HIDE, 1.8 + mot); px.rough[i] = 160; return 0;
      }
      // the crown: olive-brown, dark frog blotches with a pale rim, a lighter ridge round each eye turret
      const spot = fbm3(X * 11 + 2, Y * 11, Z * 11, 2);
      let R = HIDE, st = 2.6 + mot * 0.6 + (big > 0.25 ? 0.4 : 0);
      if (spot > 0.3) st = 1.0 - (spot - 0.3) * 2; else if (spot > 0.23) st += 0.8;
      if (big < -0.3) R = HIDE2;
      const ed = Math.hypot(ax - (HODAG_EYE[0] - HH[0]), y - (HODAG_EYE[1] - HH[1]), z - (HODAG_EYE[2] - HH[2]));
      if (ed < 0.09 && ed > 0.065) st += 0.8;
      // the elephant's snout: deep wrinkles across the bridge, a broad nose pad
      if (z > 0.24 && ny > 0.2 && Math.abs(Math.sin(z * 120 + nz2(x * 20, 1) * 1.2)) < 0.17) st -= 1.1;
      const nd = Math.hypot(ax - 0.06, (z - 0.355) * 1.5, (y - 0.05) * 1.2);
      if (nd < 0.017) { px.put(i, RP('ink'), 1); px.rough[i] = 120; return 0; }
      if (nd < 0.026) st += z > 0.355 ? 1 : 0.4;
      // the folds under the eyes and behind the grin's corners
      if (z < 0.1 && y < 0.02 && y > m && Math.abs(Math.sin(y * 150 + z * 40)) < 0.14) st -= 0.9;
      px.put(i, R, st); px.rough[i] = 190;
      return 0;
    },
    ink: [1.3, 1.2, 0.7],
    after: (px) => {
      px.pebbles(0.012, { mask: (i) => { const P = px.gb.P; return P[i * 3 + 1] - HH[1] > mouthY(P[i * 3 + 2] - HH[2]) + 0.025 ? 1 : 0; }, depth: 0.6, seed: 8 });
      warts(px, 0.03, 0.45, (i) => { const P = px.gb.P; const y = P[i * 3 + 1] - HH[1]; return y > mouthY(P[i * 3 + 2] - HH[2]) + 0.03 ? 1 : 0; }, 17);
      wet(px, (i) => { const P = px.gb.P; return Math.hypot(Math.abs(P[i * 3]) - 0.06, P[i * 3 + 2] - HH[2] - 0.355) < 0.05 && P[i * 3 + 1] > HH[1] ? 1 : 0; }, HIDE, 1.5);
    },
  });
}
const sacPaint = coat({
  lightK: 0.6,
  texel: (px, i, x, y, z) => { const fold = Math.abs(Math.sin(x * 80 + Math.sin(z * 30) * 2)) < 0.15; px.put(i, BELLY, 3 + fbm3(x * 9, y * 9, z * 9, 2) * 0.8 - (fold ? 0.9 : 0)); px.rough[i] = 90; return 0; },
  ink: [1.2, 0.8, 0.6],
  after: (px) => wet(px, () => 0.6, BELLY, 0.6),
});
const lidPaint = coat({ lightK: 0.6, texel: (px, i, x, y, z) => { px.put(i, HIDE, 2.2 + fbm3(x * 30, y * 30, z * 30, 2)); px.rough[i] = 150; return 0; }, ink: [1, 1, 0.8] });
/** horn: ivory with growth rings, dark at the tip, a little dirty at the base */
const hornPaint = (tipZ: (x: number, y: number, z: number) => number) => (ch: Chart, _p: Piece, b: Body) => {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.lightK = 0.6;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], t = tipZ(x, y, z);
    const ring = Math.abs(Math.sin(t * 30 + nz2(x * 30, z * 30) * 0.35)) < 0.16;
    if (t > 0.78) px.put(i, HORN, 2.6 + (t - 0.78) * 4 + (N[i * 3 + 1] > 0.3 ? 0.6 : 0));
    else px.put(i, BONE, 3.4 - t * 0.6 - (ring ? 1.1 : 0) + (N[i * 3 + 1] > 0.3 ? 0.5 : 0) - (t < 0.1 ? 1.4 : 0) + fbm3(x * 12, y * 12, z * 12, 2) * 0.35);
    px.rough[i] = 105;
  }
  px.creaseInk(1, { dark: 1.2, lit: 1 });
  px.flush();
};
const clawPaint = solid(BONE, (x, y, z, ny, i) => 3.6 + (ny > 0.3 ? 0.8 : 0) - (h3(i, 2, 7) < 0.07 ? 1.2 : 0) + fbm3(x * 50, y * 50, z * 50, 2) * 0.5, 95, [1, 1.2, 1]);
const toothPaint = solid(BONE, (x, y, z, ny) => 4 + (ny > 0 ? 0.6 : 0) + fbm3(x * 80, y * 80, z * 80, 2) * 0.4, 70);

/** a thick hooked bone spine (or a horn): a tapered, keeled, ringed cage along a curve */
function thorn(name: string, ctrl: V3[], r0: number, skin: (p: V3) => number[], paint: Piece['paint'], o: { flat?: number; n?: number; around?: number; reg?: number } = {}) {
  const path = curve(ctrl, o.n ?? 6), flat = o.flat ?? 0.8;
  const p = stalk({ name, path, r: (t) => r0 * Math.pow(1 - t * 0.95, 0.85) + r0 * 0.03, around: o.around ?? 6, sec: (a) => (Math.cos(a) > 0.75 ? 1.14 : 1) * (Math.abs(Math.sin(a)) > 0.7 ? flat : 1), ringEvery: 2, keel: true, capS: true, capE: true, skin, paint, levels: 1, k: 1.1 });
  p.reg = o.reg ?? REG.horn;
  return p;
}

// ------------------------------------------------------------------------------------------------ the build
export function* hodagModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = hodagBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1893;
  const J: V3[] = [[0, 0.63, -0.9], [0, 0.62, -0.5], [0, 0.6, -0.1], [0, 0.63, 0.24], [0, 0.66, 0.45], [0, 0.67, 0.64]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('root'), bi('chest'), bi('neck')], 0.35);
  // ---- the trunk: rump .. hips .. sagging belly .. barrel chest .. humped shoulders .. short thick neck
  const st: Station[] = [
    { c: [0, 0.63, -0.88], s: [0.11, 0.11], p: 'round' },
    { c: [0, 0.63, -0.79], s: [0.21, 0.2], p: 'round' },
    { c: [0, 0.62, -0.65], s: [0.31, 0.275], p: 'hips' },
    { c: [0, 0.615, -0.47], s: [0.365, 0.3], p: 'hips' },
    { c: [0, 0.6, -0.27], s: [0.395, 0.3], p: 'sag' },
    { c: [0, 0.6, -0.05], s: [0.425, 0.315], p: 'sag' },
    { c: [0, 0.62, 0.15], s: [0.415, 0.315], p: 'barrel' },
    { c: [0, 0.645, 0.32], s: [0.37, 0.3], p: 'shoulder', tw: [[0, 0, 0.06], [1, 0, 0.05]] },
    { c: [0, 0.655, 0.46], s: [0.3, 0.245], p: 'neck' },
    { c: [0, 0.655, 0.57], s: [0.25, 0.19], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 1, levels: 1, rings: [{ at: 8, s: 0.6, ink: true }], skin: spineSkin, paint: hidePaint('body') }));
  torso.reg = REG.torso;
  body.finalize(torso);
  yield 'trunk';

  // ---- the head: the upper skull on the head bone, the lower jaw and throat on the jaw bone
  const hb = bi('head'), jb = bi('jaw');
  const skullP = body.add(trunk({ name: 'skull', stations: upperStations(), tween: 0, capS: true, capE: true, k: 2.2, levels: 2,
    rings: [{ at: 0, s: 1.5 }, { at: UP.length - 1, s: 2 }], cols: [{ j: 5, a: 1, b: UP.length - 1, s: 2 }],
    skin: (p) => (p[2] < HH[2] - 0.08 ? [hb, 0.7, bi('neck'), 0.3] : [hb, 1]), paint: headPaint('skull') }));
  skullP.reg = REG.head;
  const jawP = body.add(trunk({ name: 'jaw', stations: jawStations(), tween: 0, capS: true, capE: true, k: 1.8, levels: 1,
    rings: [{ at: LO.length - 1, s: 2 }], cols: [{ j: 1, a: 1, b: LO.length - 1, s: 2 }],
    skin: (p) => (p[2] < HH[2] - 0.06 && p[1] < HH[1] - 0.12 ? [jb, 0.6, bi('neck'), 0.4] : [jb, 1]), paint: headPaint('jaw') }));
  jawP.reg = REG.jaw;
  // the throat sac, tucked under the jaw (it swells when the sac bone scales up)
  const sacP = body.add(sac({ name: 'sac', at: [0, 0.452, 0.68], n: [0, -1, 0.25], r: [0.15, 0.12, 0.08], skin: () => [bi('sac'), 1], paint: sacPaint, sink: 0.5, levels: 1, k: 1 }));
  sacP.reg = REG.jaw;
  // a fat tongue lying in the jaw
  const tg = body.add(stalk({ name: 'tongue', path: curve([[0, 0.598, 0.6], [0, 0.604, 0.74], [0, 0.608, 0.86], [0, 0.604, 0.95]], 5), r: (t) => 0.05 * (1 - t * 0.5), around: 8, sec: (a) => (Math.cos(a) > 0 ? 0.42 : 0.6), capS: true, capE: true, levels: 1, k: 1.1, skin: () => [bi('tongue'), 1], paint: coat({ lightK: 0.5, texel: (px, i, x, y, z) => { px.put(i, RP('flesh'), 2.6 + fbm3(x * 40, y * 40, z * 40, 2) - (Math.abs(x) < 0.006 ? 1 : 0)); px.rough[i] = 50; return 0; }, after: (px) => wet(px, () => 1, RP('flesh')) }) }));
  tg.reg = REG.mouth;
  // teeth: fangs over the lips at the front corners (the grin), rows of pegs along both jaws
  let tk = 0;
  for (const s of [1, -1]) {
    for (const [z, len, r, up] of [[0.3, 0.085, 0.017, 1], [0.335, 0.05, 0.012, 1], [0.255, 0.04, 0.011, 1], [0.2, 0.034, 0.01, 1], [0.14, 0.03, 0.01, 1], [0.08, 0.026, 0.009, 1],
      [0.35, 0.07, 0.016, -1], [0.29, 0.034, 0.01, -1], [0.22, 0.03, 0.01, -1], [0.15, 0.026, 0.009, -1]] as const) {
      const w = wAt(z), m = mouthY(z), big = len > 0.06;
      const at: V3 = add(HH, [s * w * (big ? 0.97 : 0.9), m + up * 0.008, z]);
      const dir: V3 = big ? [s * 0.25, -up, 0.12 * up] : [s * 0.08, -up, 0.08];
      const t = body.add(thorn('tooth' + tk++, [add(at, scl(nrm(dir), -r)), at, add(at, scl(nrm(dir), len * 0.55)), add(add(at, scl(nrm(dir), len)), [0, 0, big ? -0.012 * up : 0])], r, () => [up > 0 ? hb : jb, 1], toothPaint, { n: 4, around: 5, reg: REG.mouth }));
      t.levels = 0;
    }
  }
  // the bulging frog eyes on their turrets (the lids ring them), gold irises with a bar pupil
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(HODAG_EYE, s), ax: V3 = [s * 0.62, 0.55, 0.56];
    const e = body.add(eyeball({ name: 'eye' + S, c, ax, r: 0.056, bone: bi('eye' + S), iris: GOLD, pupil: 'bar', irisA: 0.82, sclera: RP('ochre'), k: 2.6, levels: 1, around: 12 }));
    e.reg = REG.eye;
    const l = body.add(eyelid({ name: 'lid' + S, c, ax, r: 0.052, bone: bi('lid' + S), paint: lidPaint, cover: 0.9, root: 2.5 }));
    l.reg = REG.head;
    // the turret: a lower lid that rises round the eye from the crown
    const lo = body.add(eyelid({ name: 'llid' + S, c, ax, r: 0.052, bone: hb, paint: lidPaint, lower: true, cover: 1.25, root: 2.7 }));
    lo.reg = REG.head;
  }
  // bull horns sweeping out and forward from behind the eyes
  for (const s of [1, -1]) {
    const ctrl: V3[] = [[s * 0.16, 0.755, 0.545], [s * 0.27, 0.8, 0.54], [s * 0.39, 0.865, 0.58], [s * 0.46, 0.97, 0.67], [s * 0.455, 1.08, 0.79], [s * 0.41, 1.14, 0.9]];
    const base = ctrl[0], tip = ctrl[ctrl.length - 1], L = Math.hypot(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]);
    body.add(thorn('horn' + (s > 0 ? 'L' : 'R'), ctrl, 0.068, () => [hb, 1], hornPaint((x, y, z) => cl(Math.hypot(x - base[0], y - base[1], z - base[2]) / L, 0, 1)), { n: 9, around: 8, flat: 0.86 }));
  }
  yield 'head';

  // ---- legs: short, thick, sprawled a little; broad paws with long pale hooked claws
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? HODAG_LEGS.f : HODAG_LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    let rings: LimbRing[] = legRings('bear', fore, L.r, [0, 0.5, 1], segL, PADH);
    rings = rings.map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.8 : r.t < 0.3 ? 1.05 : 1.0) }));
    const foot: FootSpec = { pad: L.r * 0.82, h: PADH, fwd: 0.3, nail: 'claw', lobe: 0.2, toeAround: 6,
      toes: [-48, -16, 16, 48].map((a, j) => ({ a, len: L.r * (j === 1 || j === 2 ? 0.34 : 0.26), r: L.r * 0.21, claw: L.r * (fore ? 0.85 : 0.6) * (j === 1 || j === 2 ? 1 : 0.8), curl: 0.62, drop: 0.32 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 12, levels: 1, rise: 0.12,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: hidePaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
    yield 'leg';
  }

  // ---- the tail: thick at the root, tapering, ending in a three-bladed spear
  const tailB = [0, 1, 2, 3, 4].map((k) => bi('tail' + k));
  const tailSkin = chainSkin(TAIL, tailB.concat([tailB[4]]).slice(0, 6), 0.4);
  const tailPath = curve(TAIL_CTRL, 12);
  const tail = body.add(stalk({ name: 'tail', path: tailPath, r: (t) => 0.14 * Math.pow(1 - t, 0.9) + 0.022, around: 10, sec: (a) => (Math.cos(a) > 0.6 ? 1.12 : Math.cos(a) < -0.5 ? 0.86 : 1), capS: false, capE: true, levels: 1, k: 1,
    skin: (p) => (p[2] > -0.84 ? [bi('hips'), 0.6, tailB[0], 0.4] : tailSkin(p)), paint: hidePaint('tail') }));
  tail.reg = REG.tail;
  const tip = tailPath[tailPath.length - 1], pre = tailPath[tailPath.length - 3];
  const tdir = nrm([tip[0] - pre[0], tip[1] - pre[1], tip[2] - pre[2]]);
  const spearSkin = () => [tailB[4], 1];
  const blade = hornPaint((x, y, z) => cl(Math.hypot(x - tip[0], y - tip[1], z - tip[2]) / 0.3, 0, 1));
  body.add(thorn('spear0', [add(tip, scl(tdir, -0.05)), tip, add(tip, scl(tdir, 0.14)), add(tip, scl(tdir, 0.28))], 0.05, spearSkin, blade, { flat: 0.32, n: 5 }));
  for (const s of [1, -1]) {
    const side = nrm([s, 0, 0]);
    body.add(thorn('spear' + (s > 0 ? 1 : 2), [add(tip, scl(tdir, -0.03)), add(tip, add(scl(tdir, 0.02), scl(side, 0.03))), add(tip, add(scl(tdir, 0.05), scl(side, 0.1))), add(tip, add(scl(tdir, -0.02), scl(side, 0.17)))], 0.036, spearSkin, blade, { flat: 0.35, n: 5 }));
  }
  body.finalize(tail);
  yield 'tail';

  // ---- the row of spines down the back and the tail: hooked back, tallest over the middle of the back
  const tg0 = torso.grids[0], R0 = tg0.v.length;
  const along = (z: number) => { let best = 0, bd = Infinity; for (let i = 0; i < R0; i++) { const q = gridSurfTop(torso, i / (R0 - 1)); const d = Math.abs(q.p[2] - z); if (d < bd) { bd = d; best = i; } } return gridSurfTop(torso, best / (R0 - 1)); };
  const zs = [0.4, 0.3, 0.19, 0.08, -0.04, -0.17, -0.3, -0.43, -0.56, -0.68];
  zs.forEach((z, k) => {
    const q = along(z), n = nrm(add(q.n, [0, 0, -0.25])), len = (0.13 + 0.17 * Math.exp(-(((z + 0.02) / 0.32) ** 2))) * cl((0.52 - z) / 0.2, 0.55, 1), back: V3 = [0, 0, -1];
    const b0 = add(q.p, scl(n, -0.03)), c1 = add(add(q.p, scl(n, len * 0.45)), scl(back, len * 0.08)), c2 = add(add(q.p, scl(n, len * 0.85)), scl(back, len * 0.32)), c3 = add(add(q.p, scl(n, len)), scl(back, len * 0.62));
    body.add(thorn('spine' + k, [b0, q.p, c1, c2, c3], 0.045 + len * 0.1, () => spineSkin(q.p), hornPaint((x, y, zz) => cl(Math.hypot(x - q.p[0], y - q.p[1], zz - q.p[2]) / (len * 1.15), 0, 1)), { n: 6, flat: 0.55 }));
  });
  const tg1 = tail.grids[0];
  for (let k = 0; k < 5; k++) {
    const v = 0.12 + k * 0.17, q = gridSurfAt(tail, 0, v), len = 0.12 - k * 0.016;
    const n = q.n, back = nrm(scl(q.dv, 1));
    const b0 = add(q.p, scl(n, -0.02));
    body.add(thorn('tspine' + k, [b0, q.p, add(add(q.p, scl(n, len * 0.6)), scl(back, len * 0.2)), add(add(q.p, scl(n, len)), scl(back, len * 0.6))], 0.03 + len * 0.08, () => tailSkin(q.p), hornPaint((x, y, zz) => cl(Math.hypot(x - q.p[0], y - q.p[1], zz - q.p[2]) / (len * 1.15), 0, 1)), { n: 5, flat: 0.55 }));
  }
  void tg1;
  yield 'spines';

  // ---- shaggy locks hanging off the flanks and the shoulders
  const seats: LockSeat[] = [];
  const back: V3 = [0, -0.4, -1];
  for (const [u0, u1] of [[0.13, 0.36], [0.64, 0.87]]) {
    seats.push(...seatsOn(torso, {
      u0, u1, v0: 0.18, v1: 0.86, rows: 15, cols: 5, wid: 0.03, lift: 0.3, droop: 0.55, sink: 0.12,
      len: (u, v) => (0.13 + 0.07 * Math.sin(v * Math.PI)) * (1 - Math.abs(u - (u0 + u1) / 2) * 1.8) * (0.85 + 0.3 * h3(Math.floor(u * 50), Math.floor(v * 50), 3)),
      dir: (_p, n) => nrm([n[0] * 0.25 + back[0], -0.9, back[2] * 0.35 + n[2] * 0.1]),
      col: (u, v) => (h3(Math.floor(u * 97), Math.floor(v * 97), 2) < 0.35 ? 1 : 0), skin: spineSkin, seed: 7,
    }));
  }
  const lk = locks({ name: 'shag', seats, tiles: [FUR, FUR2], steps: [2, 2], seed: 23 });
  if (lk) body.add(lk);
  const out = yield* body.buildGen({ den: o.den ?? 230, maxScale: 2, budget: 26000, fur: HODAG_FUR });
  return finishModel(body, out, bones);
}
/** the fur page: long coarse shag on the flanks and the shoulders, shorter on the upper legs; the hide, the head, the
 *  belly and everything bony stay bare */
const HODAG_FUR = furZones([
  ...[1, -1].flatMap((s): FurZone[] => [
    { piece: /^trunk$/, a: [s * 0.4, 0.6, -0.6], b: [s * 0.4, 0.62, 0.38], r: 0.22, len: 1, clump: 0.85, tip: 0.6 },
    { piece: /^trunk$/, a: [s * 0.24, 0.62, 0.3], b: [s * 0.18, 0.7, 0.52], r: 0.2, len: 0.8, clump: 0.8 },
    { piece: /^fleg[LR]$/, a: [s * 0.27, 0.5, 0.29], b: [s * 0.32, 0.28, 0.22], r: 0.16, len: 0.6, clump: 0.7 },
    { piece: /^hleg[LR]$/, a: [s * 0.29, 0.55, -0.5], b: [s * 0.33, 0.3, -0.4], r: 0.17, len: 0.6, clump: 0.7 },
  ]),
  { piece: /^trunk$/, facing: [0, -1, 0], min: 0.3, bare: true, len: 0 },
  { piece: /^trunk$/, facing: [0, 1, 0], min: 0.55, bare: true, len: 0 },
]);
/** shell-fur settings for the hodag's coarse shag */
export const HODAG_FUR_SPEC = { length: 0.11, shells: 14, comb: [0, -0.75, -0.35] as [number, number, number], clump: 6, clumpPull: 0.7, density: 0.85, rootDark: 0.45, tipK: 0.45, droop: 0.45, hz: 2.2, fins: 0.6 };
/** the top of the finalized torso at v along (u 0.5 is the midline of the back) */
function gridSurfTop(p: Piece, v: number) { return gridSurfAt(p, 0.5, v); }
function gridSurfAt(p: Piece, u: number, v: number) { return gridSurf(p.m, p.grids[0], u, v); }
export type { CryptidModel };
