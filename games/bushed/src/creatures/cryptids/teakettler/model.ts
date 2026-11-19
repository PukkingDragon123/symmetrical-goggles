// THE TEAKETTLER (Tryon 1939: a small, stubby-legged, dog-like animal that walks backwards and makes a noise like a
// boiling teakettle, steam puffing from its nostrils; few have seen it, many have heard it). This one: knee-high,
// built like a kettle: a round pot-bellied body on four stubby legs, a fluffy tail that arches right over its back
// like a kettle's handle, a short snout ending in two flared, sooty nostrils (the spout) that whistle and puff steam,
// round cat ears, big shy dark eyes. Ginger-copper fur, a cream belly, soot-black socks and a soot mask round the
// snout where the steam comes out.
// Creature space: metres, +z forward (it mostly walks the other way), +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, eyeball, eyelid, stalk, curve, chainSkin, RP, h3, cl,
  type V3, type Station, type FootSpec, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { fbm3, nz2 } from '../../paintkit';
import { furZones } from '../../fur';
import { bonesKit, boneIndex, coat, solid, wet, finishModel, REG, type ModelGen } from '../kit';
import type { BoneDef } from '../../rig';

export const TEAKETTLER_MODEL_VERSION = 'teakettler@3';
export const TK_HEAD: V3 = [0, 0.33, 0.21];
export const TK_EYE: V3 = [0.046, 0.35, 0.29];
export const TK_EYE_AX: V3 = [0.5, 0.12, 0.86];
/** where the steam comes out (the nostrils, creature space) */
export const TK_NOSTRIL: V3 = [0.012, 0.318, 0.37];
const TAIL_CTRL: V3[] = [[0, 0.27, -0.19], [0, 0.36, -0.24], [0, 0.45, -0.19], [0, 0.49, -0.09], [0, 0.47, 0.01], [0, 0.42, 0.06]];
const TAIL = curve(TAIL_CTRL, 6);
const LEGS = {
  f: { hip: [0.058, 0.18, 0.1] as V3, knee: [0.068, 0.1, 0.108] as V3, sole: [0.074, 0, 0.12] as V3, r: 0.03 },
  h: { hip: [0.064, 0.19, -0.12] as V3, knee: [0.072, 0.1, -0.09] as V3, sole: [0.076, 0, -0.13] as V3, r: 0.033 },
};
const PADH = 0.011;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function teakettlerBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('root', null, [0, 0.22, -0.02]);
  A('chest', 'root', [0, 0.24, 0.1]);
  A('neck', 'chest', [0, 0.29, 0.17]);
  A('head', 'neck', TK_HEAD);
  A('jaw', 'head', [0, 0.305, 0.27]);
  A('nose', 'head', [0, 0.32, 0.35]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(TK_EYE, k)); A('lid' + s, 'head', mir(TK_EYE, k)); A('ear' + s, 'head', [k * 0.045, 0.385, 0.205]); }
  A('hips', 'root', [0, 0.23, -0.12]);
  for (let k = 0; k < 5; k++) A('tail' + k, k === 0 ? 'hips' : 'tail' + (k - 1), TAIL[k]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const f = LEGS.f; A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k)); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const h = LEGS.h; A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k)); }
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const GINGER = RP('rust'), COPPER = RP('copper'), CREAM = RP('sand'), SOOT = RP('basalt'), NOSE = RP('leather');
/** the coat: ginger-copper with darker ticking along the back, a cream belly and bib, soot-black socks */
const coatPaint = (part: 'body' | 'leg' | 'tail' | 'head' | 'ear') => coat({
  lightK: 0.85,
  texel: (px, i, x, y, z, nx, ny) => {
    const m = fbm3(x * 14, y * 14, z * 14, 3), tick = fbm3(x * 40, y * 40, z * 40, 2);
    let R = m > 0.2 ? COPPER : GINGER, st = 3.2 + m * 0.8 + (ny > 0.6 ? -0.5 : 0) - (tick > 0.35 ? 1 : 0);
    if ((part === 'body' || part === 'head') && ny < -0.35) { R = CREAM; st = 3.4 + m * 0.6; }
    if (part === 'body' && z > 0.08 && ny < 0.1 && Math.abs(x) < 0.07) { R = CREAM; st = 3.6 + m * 0.5; }      // the bib
    if (part === 'leg' && y < 0.1) { R = SOOT; st = 2.2 + m * 0.6; }                                          // socks
    if (part === 'tail') {
      // a fluffy tail, sooty toward the tip (it hangs over the snout's steam), faint rings
      const t = cl((z + 0.24) / 0.3, 0, 1) * (y > 0.4 ? 1 : 0.4);
      if (t > 0.65) { R = SOOT; st = 2.4 + m * 0.6; }
      if (Math.abs(Math.sin(t * 22)) < 0.22 && t < 0.65) st -= 0.8;
    }
    if (part === 'head') {
      // the soot mask: dark round the snout and the nostrils, fading back between the eyes
      const hz = z - TK_HEAD[2], sootK = cl((hz - 0.1) * 16, 0, 1) + (Math.abs(x) < 0.016 && y > TK_HEAD[1] - 0.01 ? cl((hz - 0.06) * 8, 0, 0.5) : 0);
      // a cream ring round each eye (so the dark eyes read against the ginger), soot only on the snout
      const er = Math.hypot(Math.abs(x) - TK_EYE[0], y - TK_EYE[1], (z - TK_EYE[2]) * 0.8);
      if (er < 0.026) { R = CREAM; st = 4.2 + m * 0.4; }
      else if (sootK > 0.5 + m * 0.3) { R = SOOT; st = 2 + m * 0.8; }
    }
    if (part === 'ear') { if (nx * Math.sign(x) < -0.2 || nz2(x * 99, y * 99) > 2) { R = RP('coral'); st = 3.6 + m * 0.5; } else if (y > 0.43) { R = SOOT; st = 2.2; } }
    px.put(i, R, st); px.rough[i] = 235;
    return part === 'ear' ? 0.3 : 1;
  },
  pelt: { len: 0.025, width: 0.006, flow: part === 'body' ? -1 : 1, down: 0.5, tooth: 1.6, clump: 0.55, strands: 0.3 },
  ink: [1.4, 1.0, 0.4],
});
/** the spout: two flared, sooty nostrils, wet black leather inside with a copper-brown sheen where the steam scalds */
const nosePaint = coat({ lightK: 0.6, texel: (px, i, x, y, z, _nx, _ny, nz) => {
  const inside = nz > 0.65 && Math.hypot(Math.abs(x) - TK_NOSTRIL[0], y - TK_NOSTRIL[1]) < 0.007;
  if (inside) { px.put(i, RP('ink'), 0); px.rough[i] = 80; return 0; }
  px.put(i, h3(Math.floor(x * 600), Math.floor(y * 600), 5) < 0.2 ? COPPER : NOSE, 2.2 + fbm3(x * 120, y * 120, z * 120, 2) * 0.7); px.rough[i] = 70; return 0;
}, ink: [1, 1.2, 1], after: (px) => wet(px, () => 1, NOSE, 1.5) });
const clawPaint = solid(RP('horn'), (x, y, z, ny) => 2.6 + (ny > 0.3 ? 0.8 : 0) + fbm3(x * 90, y * 90, z * 90, 2) * 0.4, 110);
const lidPaint = coat({ lightK: 0.7, texel: (px, i, x, y, z) => { px.put(i, GINGER, 2.6 + fbm3(x * 90, y * 90, z * 90, 2) * 0.5); px.rough[i] = 220; return 0; } });

// ------------------------------------------------------------------------------------------------ the build
export function* teakettlerModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = teakettlerBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1939;
  const J: V3[] = [[0, 0.24, -0.22], [0, 0.23, -0.12], [0, 0.22, -0.02], [0, 0.24, 0.1], [0, 0.29, 0.17], [0, 0.33, 0.22]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('root'), bi('chest'), bi('neck')], 0.35);
  // ---- the kettle: a round pot belly on a short barrel, a thick ruffed neck
  const st: Station[] = [
    { c: [0, 0.235, -0.205], s: [0.04, 0.04], p: 'round' },
    { c: [0, 0.232, -0.175], s: [0.09, 0.09], p: 'round' },
    { c: [0, 0.228, -0.11], s: [0.122, 0.118], p: 'barrel' },
    { c: [0, 0.226, -0.02], s: [0.134, 0.126], p: 'sag' },
    { c: [0, 0.232, 0.06], s: [0.124, 0.118], p: 'barrel' },
    { c: [0, 0.252, 0.13], s: [0.094, 0.095], p: 'shoulder' },
    { c: [0, 0.285, 0.18], s: [0.07, 0.072], p: 'neck' },
    { c: [0, 0.31, 0.21], s: [0.055, 0.055], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: coatPaint('body') }));
  torso.reg = REG.torso;
  body.finalize(torso);
  // ---- the head: a round dome, a short snout tapering to the spout
  const H = TK_HEAD, hb = bi('head');
  const hs = (z: number, dy: number, w: number, h: number, p: string | number[][]): Station => ({ c: [0, H[1] + dy, H[2] + z], s: [w, h], p });
  body.add(trunk({ name: 'skull', stations: [
    hs(-0.04, 0.0, 0.045, 0.045, 'round'), hs(-0.005, 0.008, 0.068, 0.068, 'round'), hs(0.035, 0.01, 0.074, 0.07, 'round'), hs(0.072, 0.0, 0.064, 0.058, 'round'),
    hs(0.1, -0.008, 0.045, 0.042, 'round'), hs(0.125, -0.012, 0.034, 0.032, 'round'), hs(0.14, -0.013, 0.027, 0.026, 'round'),
  ], tween: 1, capS: true, capE: false, k: 2.4, levels: 2, skin: (p) => (p[2] < H[2] - 0.02 ? [hb, 0.6, bi('neck'), 0.4] : [hb, 1]), paint: coatPaint('head') })).reg = REG.head;
  // the spout: two short flared nostril tubes on the nose bone
  for (const s of [1, -1]) {
    const b0: V3 = [s * 0.012, 0.318, 0.345];
    body.add(stalk({ name: 'nostril' + (s > 0 ? 'L' : 'R'), path: [add(b0, [0, 0, -0.012]), b0, add(b0, [s * 0.002, 0.002, 0.014]), add(b0, [s * 0.004, 0.004, 0.022])], r: (t) => 0.011 + t * t * 0.006, around: 8, capS: true, capE: true, levels: 1, k: 2.5, skin: () => [bi('nose'), 1], paint: nosePaint })).reg = REG.head;
  }
  // a small soft jaw
  body.add(trunk({ name: 'jaw', stations: [
    { c: [0, 0.3, 0.27], s: [0.035, 0.015], p: 'round' }, { c: [0, 0.297, 0.31], s: [0.026, 0.013], p: 'round' }, { c: [0, 0.298, 0.335], s: [0.012, 0.008], p: 'round' },
  ], tween: 0, capS: true, capE: true, k: 2, levels: 1, skin: () => [bi('jaw'), 1], paint: coatPaint('head') })).reg = REG.jaw;
  // big shy eyes, pale-browed lids
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(TK_EYE, s), ax: V3 = [s * TK_EYE_AX[0], TK_EYE_AX[1], TK_EYE_AX[2]];
    body.add(eyeball({ name: 'eye' + S, c, ax, r: 0.021, bone: bi('eye' + S), iris: RP('fur'), pupil: 'round', pupilR: 0.62, irisA: 0.92, sclera: RP('ink'), k: 3.4, levels: 1, around: 12, catchlight: { side: s, at: [0.35, 0.45] } })).reg = REG.eye;
    body.add(eyelid({ name: 'lid' + S, c, ax, r: 0.021, bone: bi('lid' + S), paint: lidPaint, cover: 0.85, root: 2.2 })).reg = REG.head;
    // round cat ears
    const er: V3 = [s * 0.04, 0.37, 0.205];
    body.add(stalk({ name: 'ear' + S, path: curve([er, [s * 0.052, 0.4, 0.204], [s * 0.062, 0.428, 0.2], [s * 0.066, 0.446, 0.198]], 5), r: (t) => 0.026 * Math.sqrt(Math.max(0.02, 1 - t * t)) + 0.002, around: 10, up: [0, 0, 1],
      sec: (a) => 1 / Math.sqrt((Math.sin(a) / 0.4) ** 2 + Math.cos(a) ** 2), capS: true, capE: true, levels: 1, k: 1.6, skin: () => [bi('ear' + S), 1], paint: coatPaint('ear') })).reg = REG.head;
  }
  // ---- stubby legs on round paws
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? LEGS.f : LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    const rings: LimbRing[] = legRings('bear', fore, L.r, [0, 0.5, 1], segL, PADH).map((r) => ({ ...r, r: r.r * (r.t < 0.3 ? 1.15 : 1) }));
    const foot: FootSpec = { pad: L.r * 0.95, h: PADH, fwd: 0.3, nail: 'claw', lobe: 0.22, toeAround: 6, toes: [-36, -12, 12, 36].map((a) => ({ a, len: L.r * 0.3, r: L.r * 0.24, claw: L.r * 0.22, curl: 0.5, drop: 0.3 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 10, levels: 1, rise: 0.05,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: coatPaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
  }
  // ---- the handle: a thick fluffy tail arching right over the back
  const tb = [0, 1, 2, 3, 4].map((k) => bi('tail' + k));
  const tailSkin = chainSkin(TAIL, tb, 0.4);
  body.add(stalk({ name: 'tail', path: curve(TAIL_CTRL, 12), r: (t) => 0.034 * (0.7 + 0.5 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.8)) * (t > 0.85 ? 1 - (t - 0.85) * 4 : 1) + 0.004, around: 10, capS: false, capE: true, levels: 1, k: 1.1,
    skin: (p) => (p[2] < -0.19 && p[1] < 0.3 ? [bi('hips'), 0.6, tb[0], 0.4] : tailSkin(p)), paint: coatPaint('tail') })).reg = REG.tail;
  void h3; void nz2;
  const out = yield* body.buildGen({ den: o.den ?? 520, maxScale: 2, budget: 15000, fur: TK_FUR });
  return finishModel(body, out, bones);
}
/** fluffy all over (the tail most), short on the face and the socks, none on the spout or the inner ears */
const TK_FUR = furZones([
  { piece: /^(trunk|[fh]leg[LR])$/, len: 0.6, clump: 0.55, tip: 0.6 },
  { piece: /^trunk$/, a: [0, 0.27, 0.1], b: [0, 0.3, 0.2], r: 0.09, len: 0.9, clump: 0.6 },
  { piece: /^tail$/, len: 1, clump: 0.6, tip: 0.6 },
  { piece: /^skull$/, len: 0.35, clump: 0.4, tip: 0.6 },
  { piece: /^skull$/, a: [0, 0.32, 0.31], b: [0, 0.32, 0.36], r: 0.05, bare: true, len: 0 },
  { piece: /^[fh]leg[LR]$/, a: [0, 0.03, 0], b: [0, -0.1, 0], r: 0.3, soft: 0.3, bare: true, len: 0 },
]);
export const TK_FUR_SPEC = { length: 0.04, shells: 12, comb: [0, -0.35, -0.6] as [number, number, number], clump: 5, clumpPull: 0.5, density: 0.9, rootDark: 0.55, tipK: 0.6, droop: 0.3, hz: 3.2, fins: 0.5, springs: [{ bones: ['tail1'], hz: 2.6, inertia: 1.4 }, { bones: ['earL', 'earR'], hz: 5 }] };
export type { Chart, Piece };
