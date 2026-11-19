// THE SNOW WASSET (Cox 1910: a large weasel-like beast of the northern Canadian woods that winters under the snow,
// its legs shrinking to mere stubs as it "swims" through the drifts, white in winter and brown in summer, bursting
// up through the crust to seize its prey). This one: as long as a man is tall from nose to tail tip but barely
// knee-high, a sinuous body on very short legs with broad, almost flipper-like paws, a long neck and a small flat
// head (round ears, black bead eyes, a pink nose, long whiskers), a long tail ending in a black tip like an
// ermine's. Shaggy coat: snow-white below and on the head, a brown saddle and mantle shading in from the back, a
// thick shaggy ruff round the neck. It dives into the ground and pops up somewhere else.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, eyeball, stalk, curve, chainSkin, RP, h3, cl,
  type V3, type Station, type FootSpec, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { fbm3, nz2 } from '../../paintkit';
import { furZones } from '../../fur';
import { bonesKit, boneIndex, coat, solid, wet, finishModel, REG, type ModelGen } from '../kit';
import type { BoneDef } from '../../rig';

export const WASSET_MODEL_VERSION = 'wasset@1';
export const WS_HEAD: V3 = [0, 0.25, 0.5];
export const WS_EYE: V3 = [0.032, 0.272, 0.585];
export const WS_EYE_AX: V3 = [0.62, 0.22, 0.75];
/** the spine joints, tail root to the head (the body is a chain of four bones) */
const SPINE: V3[] = [[0, 0.17, -0.44], [0, 0.17, -0.28], [0, 0.18, -0.1], [0, 0.185, 0.1], [0, 0.2, 0.28], [0, 0.23, 0.41], [0, 0.25, 0.5]];
const TAIL_CTRL: V3[] = [[0, 0.17, -0.44], [0, 0.165, -0.58], [0, 0.15, -0.74], [0, 0.13, -0.9], [0, 0.12, -1.04]];
const TAIL = curve(TAIL_CTRL, 5);
const LEGS = {
  f: { hip: [0.07, 0.12, 0.2] as V3, knee: [0.085, 0.065, 0.22] as V3, sole: [0.095, 0, 0.24] as V3, r: 0.032 },
  h: { hip: [0.075, 0.13, -0.3] as V3, knee: [0.09, 0.07, -0.27] as V3, sole: [0.1, 0, -0.31] as V3, r: 0.036 },
};
const PADH = 0.011;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function wassetBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('root', null, SPINE[2]);
  A('back', 'root', SPINE[1]);
  A('hips', 'back', SPINE[0]);
  A('chest', 'root', SPINE[3]);
  A('neck', 'chest', SPINE[4]);
  A('neck2', 'neck', SPINE[5]);
  A('head', 'neck2', WS_HEAD);
  A('jaw', 'head', [0, 0.235, 0.54]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(WS_EYE, k)); A('ear' + s, 'head', [k * 0.04, 0.29, 0.52]); }
  for (let k = 0; k < 4; k++) A('tail' + k, k === 0 ? 'hips' : 'tail' + (k - 1), TAIL[k]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const f = LEGS.f; A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k)); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const h = LEGS.h; A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k)); }
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const WHITE = RP('snow'), BROWN = RP('fur'), DARK = RP('squatch'), PINK = RP('coral'), INK = RP('ink');
/** how brown the coat is at a point: a saddle along the back and the mantle over the shoulders, ragged at its edge */
const saddle = (x: number, y: number, z: number, ny: number) => {
  const edge = fbm3(x * 9, y * 9, z * 9, 2) * 0.35;
  const along = z > -0.5 && z < 0.36 ? 1 : 0;
  return along * cl((ny - 0.25 + edge) * 3, 0, 1) * cl((0.38 - z) * 8, 0, 1);
};
const coatPaint = (part: 'body' | 'leg' | 'tail' | 'head') => coat({
  lightK: 0.85,
  texel: (px, i, x, y, z, nx, ny) => {
    const m = fbm3(x * 10, y * 10, z * 10, 3), br = part === 'leg' ? cl((y - 0.08) * 12, 0, 1) * 0.6 : part === 'head' ? cl((ny - 0.6) * 3, 0, 1) * cl((0.52 - z) * 10, 0, 1) * 0.8 : saddle(x, y, z, ny);
    let R = WHITE, st = 4 + m * 0.8 - (ny < -0.3 ? 0.6 : 0);
    if (br > 0.45 + m * 0.2) { R = m > 0.25 ? DARK : BROWN; st = 3.2 + m * 0.8 + (br < 0.6 ? 0.8 : 0); }
    if (part === 'tail') { const t = cl((-z - 0.44) / 0.6, 0, 1); if (t > 0.72) { R = DARK; st = 1.6 + m * 0.6; } else if (ny > 0.3 && t < 0.4) { R = BROWN; st = 3.6 + m; } }
    if (part === 'head') {
      const hx = Math.abs(x), hz = z - WS_HEAD[2];
      // a dark streak through the eye and a brown cap; the pink nose; whisker pads with dots
      if (Math.abs(y - WS_EYE[1]) < 0.009 && hz > 0.03 && hz < 0.11 && hx > 0.02) { R = BROWN; st = 3; }
      if (hz > 0.112) { R = PINK; st = 3.8 + m * 0.4; px.rough[i] = 80; return 0; }
      if (hz > 0.08 && y < WS_HEAD[1] && hx > 0.012 && h3(Math.floor(x * 400), Math.floor(y * 400), Math.floor(z * 400)) < 0.08) st -= 1.5;
    }
    void nx; void nz2;
    px.put(i, R, st); px.rough[i] = 235;
    return 1;
  },
  pelt: { len: 0.04, width: 0.008, flow: part === 'body' ? -1 : 1, down: 0.6, tooth: 1.8, clump: 0.6, strands: 0.32 },
  ink: [1.4, 1.0, 0.5],
});
const clawPaint = solid(RP('horn'), (x, y, z, ny) => 2.8 + (ny > 0.3 ? 0.8 : 0) + fbm3(x * 90, y * 90, z * 90, 2) * 0.4, 100);
const whiskerPaint = solid(RP('paper'), (_x, _y, _z, ny) => 4 + (ny > 0 ? 1 : 0), 90, [3, 0, 0]);

// ------------------------------------------------------------------------------------------------ the build
export function* wassetModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = wassetBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1910;
  const spineSkin = chainSkin(SPINE, [bi('hips'), bi('back'), bi('root'), bi('chest'), bi('neck'), bi('neck2')], 0.4);
  // ---- the long body: narrow hips, a long flexible back, a deep chest, a long neck into a small head
  const st: Station[] = [
    { c: [0, 0.17, -0.47], s: [0.035, 0.035], p: 'round' },
    { c: [0, 0.172, -0.42], s: [0.07, 0.07], p: 'round' },
    { c: [0, 0.175, -0.33], s: [0.088, 0.085], p: 'hips' },
    { c: [0, 0.18, -0.2], s: [0.084, 0.08], p: 'round' },
    { c: [0, 0.182, -0.06], s: [0.088, 0.085], p: 'barrel' },
    { c: [0, 0.184, 0.08], s: [0.094, 0.092], p: 'barrel' },
    { c: [0, 0.19, 0.2], s: [0.088, 0.088], p: 'shoulder' },
    { c: [0, 0.205, 0.3], s: [0.066, 0.068], p: 'neck' },
    { c: [0, 0.225, 0.39], s: [0.054, 0.056], p: 'neck' },
    { c: [0, 0.24, 0.45], s: [0.048, 0.048], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: coatPaint('body') }));
  torso.reg = REG.torso;
  body.finalize(torso);
  // ---- the head: flat-topped, a short tapering muzzle, the pink nose
  const H = WS_HEAD, hb = bi('head');
  const hs = (z: number, dy: number, w: number, h: number): Station => ({ c: [0, H[1] + dy, H[2] + z], s: [w, h], p: 'round', tw: [[0, 0, -0.12], [1, 0, -0.08]] });
  body.add(trunk({ name: 'skull', stations: [
    hs(-0.04, -0.005, 0.044, 0.042), hs(0.0, 0.004, 0.056, 0.048), hs(0.04, 0.006, 0.058, 0.046), hs(0.075, 0.0, 0.046, 0.038), hs(0.1, -0.006, 0.032, 0.028), hs(0.118, -0.009, 0.019, 0.018), hs(0.128, -0.01, 0.008, 0.008),
  ], tween: 1, capS: true, capE: true, k: 2.6, levels: 2, skin: (p) => (p[2] < H[2] - 0.02 ? [hb, 0.6, bi('neck2'), 0.4] : [hb, 1]), paint: coatPaint('head') })).reg = REG.head;
  body.add(trunk({ name: 'jaw', stations: [
    { c: [0, 0.232, 0.54], s: [0.03, 0.012], p: 'round' }, { c: [0, 0.23, 0.58], s: [0.022, 0.01], p: 'round' }, { c: [0, 0.232, 0.605], s: [0.01, 0.006], p: 'round' },
  ], tween: 0, capS: true, capE: true, k: 2, levels: 1, skin: () => [bi('jaw'), 1], paint: coatPaint('head') })).reg = REG.jaw;
  // little needle teeth at the front of the jaw (for the bootlaces)
  for (const s of [1, -1]) body.add(stalk({ name: 'fang' + s, path: [[s * 0.009, 0.252, 0.592], [s * 0.009, 0.246, 0.594], [s * 0.0095, 0.238, 0.597]], r: (t) => 0.0025 * (1 - t * 0.85), around: 4, capS: true, capE: true, levels: 0, k: 1.2, skin: () => [hb, 1], paint: solid(RP('bone'), () => 4.5, 70) })).reg = REG.mouth;
  // bead eyes, round ears, whiskers
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(WS_EYE, s), ax: V3 = [s * WS_EYE_AX[0], WS_EYE_AX[1], WS_EYE_AX[2]];
    body.add(eyeball({ name: 'eye' + S, c, ax, r: 0.012, bone: bi('eye' + S), iris: INK, pupil: 'round', pupilR: 0.9, irisA: 1.2, sclera: INK, k: 3.6, levels: 1, around: 10, catchlight: { side: s, at: [0.35, 0.4] } })).reg = REG.eye;
    const er: V3 = [s * 0.036, 0.288, 0.515];
    body.add(stalk({ name: 'ear' + S, path: curve([er, [s * 0.045, 0.3, 0.512], [s * 0.052, 0.31, 0.508]], 4), r: (t) => 0.017 * Math.sqrt(Math.max(0.05, 1 - t * t)) + 0.002, around: 10, up: [0, 0, 1],
      sec: (a) => 1 / Math.sqrt((Math.sin(a) / 0.45) ** 2 + Math.cos(a) ** 2), capS: true, capE: true, levels: 1, k: 1.6, skin: () => [bi('ear' + S), 1], paint: coatPaint('head') })).reg = REG.head;
    for (let k = 0; k < 4; k++) {
      const b0: V3 = [s * 0.014, 0.243 - k * 0.003, 0.598 - k * 0.004], d = nrm([s * (1 - k * 0.1), 0.05 - k * 0.12, -0.25]);
      body.add(stalk({ name: 'whisk' + S + k, path: curve([b0, add(b0, [d[0] * 0.04, d[1] * 0.04, d[2] * 0.04]), add(b0, [d[0] * 0.08, d[1] * 0.08 - 0.008, d[2] * 0.08])], 4), r: (t) => 0.0012 * (1 - t * 0.7), around: 3, capS: false, capE: true, levels: 0, k: 0.6, skin: () => [hb, 1], paint: whiskerPaint })).noOcc = true;
    }
  }
  // ---- very short legs on broad, almost flipper-like paws
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? LEGS.f : LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    const rings: LimbRing[] = legRings('bear', fore, L.r, [0, 0.5, 1], segL, PADH).map((r) => ({ ...r, r: r.r * (r.t < 0.3 ? 1.1 : 1) }));
    const foot: FootSpec = { pad: L.r * 1.05, h: PADH, fwd: 0.3, nail: 'claw', lobe: 0.25, toeAround: 6, web: 0.4, toes: [-48, -16, 16, 48].map((a) => ({ a, len: L.r * 0.5, r: L.r * 0.22, claw: L.r * 0.35, curl: 0.5, drop: 0.25 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 10, levels: 1, rise: 0.05,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: coatPaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
  }
  // ---- the long tail with its black tip
  const tb = [0, 1, 2, 3].map((k) => bi('tail' + k));
  const tailSkin = chainSkin(TAIL, tb, 0.4);
  body.add(stalk({ name: 'tail', path: curve(TAIL_CTRL, 12), r: (t) => 0.034 * (1 - t * 0.35) * (t > 0.9 ? 1 - (t - 0.9) * 6 : 1) + 0.004, around: 10, capS: false, capE: true, levels: 1, k: 1,
    skin: (p) => (p[2] > -0.46 ? [bi('hips'), 0.6, tb[0], 0.4] : tailSkin(p)), paint: coatPaint('tail') })).reg = REG.tail;
  const out = yield* body.buildGen({ den: o.den ?? 360, maxScale: 2, budget: 16000, fur: WS_FUR });
  return finishModel(body, out, bones);
}
/** shaggy everywhere: longest on the neck ruff and the back, a thick tail, short on the face and paws */
const WS_FUR = furZones([
  { piece: /^(trunk|[fh]leg[LR])$/, len: 0.55, clump: 0.65, tip: 0.6 },
  { piece: /^trunk$/, facing: [0, 1, 0], min: 0.2, len: 0.85, clump: 0.75 },
  { piece: /^trunk$/, a: [0, 0.21, 0.26], b: [0, 0.23, 0.42], r: 0.09, len: 1, clump: 0.8 },
  { piece: /^tail$/, len: 0.75, clump: 0.6, tip: 0.5 },
  { piece: /^skull$/, len: 0.3, clump: 0.4 },
  { piece: /^skull$/, a: [0, 0.24, 0.6], b: [0, 0.24, 0.66], r: 0.05, bare: true, len: 0 },
  { piece: /^[fh]leg[LR]$/, a: [0, 0.02, 0], b: [0, -0.1, 0], r: 0.4, soft: 0.3, bare: true, len: 0 },
]);
export const WS_FUR_SPEC = { length: 0.06, shells: 12, comb: [0, -0.45, -0.6] as [number, number, number], clump: 6, clumpPull: 0.65, density: 0.88, rootDark: 0.55, tipK: 0.5, droop: 0.35, hz: 3, fins: 0.6, springs: [{ bones: ['tail1'], hz: 2.4, inertia: 1.3 }, { bones: ['neck2'], hz: 3.5 }] };
void wet;
export type { Chart, Piece };
