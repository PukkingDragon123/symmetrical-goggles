// THE TEAKETTLER (Tryon 1939: a small, stubby-legged, dog-like animal that walks backwards and makes a noise like a
// boiling teakettle, steam puffing from its nostrils; few have seen it, many have heard it). This one, an original
// design: a knee-high, stocky little dog of the brush. A deep barrel chest on short sturdy forelegs, a real neck
// with a thick scruff, the withers rising over the shoulder blades, a short back, round muscular haunches over bent
// hind legs, paws with knuckled toes; a fluffy tail curled right over its back like a kettle's handle. A broad head
// with a domed crown, bushy eyebrows over bright round eyes, ruffs on the cheeks, a short blunt muzzle ending in a
// big leather nose with flared nostrils (the spout: steam whistles out of it, and puffs from the corners of its
// mouth), a little underbite showing two teeth, cupped ears folded over at the tips.
// Paint: ginger-copper with a darker saddle over the back, a cream bib and belly and a cream blaze up the muzzle,
// soot-black socks and a soot mask round the nose where the steam scalds; fur painted in clumps that run with the
// coat (shell fur grows over it), a wet nose, bright catchlights.
// Creature space: metres, +z forward (it mostly walks the other way), +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, paintedEye, stalk, curve, chainSkin, sac, hand, Px, RP, h3, cl,
  type V3, type Station, type FootSpec, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { fbm3 } from '../../paintkit';
import { furZones } from '../../fur';
import { bonesKit, boneIndex, solid, wet, finishModel, sculpt, almondLid, flap, REG, type ModelGen } from '../kit';
import type { BoneDef } from '../../rig';

export const TEAKETTLER_MODEL_VERSION = 'teakettler@4';
export const TK_HEAD: V3 = [0, 0.35, 0.198];
/** the head is drawn in head-local units scaled by HK about the head bone */
const HK = 1.18;
/** head-local (relative to TK_HEAD, scaled by HK) to creature space */
const H = (x: number, y: number, z: number): V3 => [TK_HEAD[0] + x * HK, TK_HEAD[1] + y * HK, TK_HEAD[2] + (z > 0.09 ? 0.09 + (z - 0.09) * 1.22 : z) * HK];
export const TK_EYE: V3 = H(0.043, 0.019, 0.077);
export const TK_EYE_AX: V3 = [0.52, 0.14, 0.84];
/** where the steam comes out: the nostrils (creature space, on the nose bone) */
export const TK_NOSTRIL: V3 = H(0.011, -0.012, 0.17);
/** the corners of the mouth (left; creature space, on the jaw bone): puffs while it whistles */
export const TK_MOUTH: V3 = H(0.026, -0.037, 0.113);
const EYE_R = 0.019 * HK;
const TAIL_CTRL: V3[] = [[0, 0.27, -0.2], [0, 0.35, -0.245], [0, 0.44, -0.205], [0, 0.48, -0.11], [0, 0.465, -0.02], [0, 0.42, 0.03]];
const TAIL = curve(TAIL_CTRL, 6);
const LEGS = {
  f: { hip: [0.064, 0.205, 0.098] as V3, knee: [0.072, 0.108, 0.084] as V3, sole: [0.076, 0, 0.11] as V3, r: 0.04 },
  h: { hip: [0.07, 0.21, -0.115] as V3, knee: [0.078, 0.115, -0.085] as V3, sole: [0.08, 0, -0.128] as V3, r: 0.045 },
};
const PADH = 0.012;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function teakettlerBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('root', null, [0, 0.22, -0.02]);
  A('chest', 'root', [0, 0.245, 0.1]);
  A('neck', 'chest', [0, 0.285, 0.165]);
  A('head', 'neck', TK_HEAD);
  A('jaw', 'head', H(0, -0.03, 0.063));
  A('nose', 'head', H(0, -0.012, 0.146));
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(TK_EYE, k)); A('lid' + s, 'head', mir(TK_EYE, k)); A('ear' + s, 'head', H(k * 0.047, 0.047, -0.005)); }
  A('hips', 'root', [0, 0.23, -0.12]);
  for (let k = 0; k < 5; k++) A('tail' + k, k === 0 ? 'hips' : 'tail' + (k - 1), TAIL[k]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const f = LEGS.f; A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k)); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const h = LEGS.h; A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k)); }
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const GINGER = RP('rust'), COPPER = RP('copper'), CREAM = RP('sand'), SOOT = RP('basalt'), NOSE = RP('leather'), SADDLE = RP('fur');
type Part = 'body' | 'leg' | 'tail' | 'head' | 'jaw' | 'ear';
/** the way the coat lies: back along the body and down the flanks, down the legs, back from the nose over the head,
 *  out along the tail */
const furFlow = (part: Part) => (q: V3, n: V3): V3 => {
  if (part === 'leg') return [0, -1, 0];
  if (part === 'tail') return [0, 0.3, -1];
  if (part === 'head' || part === 'jaw' || part === 'ear') return [q[0] * 2, n[1] > 0.4 ? 0 : -0.6, -1];
  return [n[0] * 0.1, -0.5 + (n[1] < 0 ? -0.4 : 0), -1];
};
/** the coat: ginger-copper, a darker saddle over the back, cream bib, belly and muzzle blaze, soot socks and a soot
 *  mask round the nose; painted in clumps that run with the coat */
function coatPaint(part: Part, earInner?: (p: V3, n: V3) => boolean) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    const hp = hand(px, { flow: furFlow(part), seed: part.length * 3 + 2 });
    const fld = hp.field();
    yield;
    for (let i = 0; i < px.n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], ax = Math.abs(x), s = (fld[i] - 0.5) * 2;
      const big = fbm3(x * 9 + 1, y * 9, z * 9, 2);
      let R = big > 0.15 + s * 0.08 ? COPPER : GINGER, st = 3.3 + s * 0.6 + (ny > 0.6 ? 0.2 : 0);
      if (part === 'body' || part === 'tail') {
        // the saddle: darker over the back from the withers to the croup
        if (ny > 0.45 + s * 0.12 && z < 0.13 && z > -0.2) { R = SADDLE; st = 2.2 + s * 0.6; }
        // the cream belly and bib
        if (ny < -0.3 + s * 0.12 || (z > 0.1 && ny < 0.2 + s * 0.1 && ax < 0.06 + s * 0.01)) { R = CREAM; st = 4.1 + s * 0.5; }
      }
      if (part === 'tail') {
        // sooty toward the tip (it hangs over the steam), the underside cream
        const t = cl((z + 0.25) / 0.3, 0, 1) * (y > 0.4 ? 1 : 0.4);
        if (t > 0.8 + s * 0.05) { R = SOOT; st = 2.4 + s * 0.6; }
        else if (ny < -0.3) { R = CREAM; st = 4.1 + s * 0.5; }
      }
      if (part === 'leg') {
        // soot socks up to a ragged line, a cream patch behind the elbow
        if (y < 0.075 + s * 0.012 + big * 0.01) { R = SOOT; st = 2.3 + s * 0.6; }
      }
      if (part === 'head' || part === 'jaw') {
        const hy = (y - TK_HEAD[1]) / HK, hz = (z - TK_HEAD[2]) / HK;
        // a cream blaze from the forehead down the muzzle, cream under the chin and on the cheeks
        if ((ax < 0.006 + cl((hz - 0.03) / 0.09, 0, 1) * 0.02 + s * 0.006 + big * 0.006 && hz > 0.0 + s * 0.012 && ny > -0.2) || ny < -0.45 + s * 0.1 || part === 'jaw') { R = CREAM; st = 4.2 + s * 0.5; }
        // the soot mask round the nose and the mouth (where the steam scalds)
        const sootK = cl((hz - 0.105) / 0.03, 0, 1) - (ny > 0.6 ? 0.25 : 0);
        if (sootK > 0.5 + s * 0.15 + big * 0.1) { R = SOOT; st = 2.3 + s * 0.6; }
        // bushy brows: a lighter tuft over each eye
        if (Math.hypot(ax - TK_EYE[0] + 0.004, y - TK_EYE[1] - 0.022, z - TK_EYE[2] + 0.004) < 0.014 + s * 0.003) { R = CREAM; st = 4.0 + s * 0.5; }
        // a dark rim right round the eye
        if (Math.hypot(ax - TK_EYE[0], y - TK_EYE[1], z - TK_EYE[2]) < EYE_R * (1.18 + s * 0.06)) { R = SOOT; st = 2.4; }
      }
      if (part === 'ear') {
        if (earInner?.([x, y, z], [N[i * 3], ny, N[i * 3 + 2]])) { R = RP('plum'); st = 4.2 + s * 0.4 - (Math.abs(Math.sin(y * 300)) < 0.15 ? 0.8 : 0); }
        else if (y > TK_HEAD[1] + 0.082 * HK + s * 0.004) { R = SOOT; st = 2.4 + s * 0.5; }
      }
      void nx;
      px.put(i, R, st); px.rough[i] = 235;
    }
    yield;
    // the coat under the shells: fur clumps along the flow, lit tips, dark roots and underfur between them
    hp.form({ light: 2.3, ao: 2.2, cavity: 1.2, ridge: 0.6, lift: 0.2 });
    hp.strokes({ len: part === 'head' ? [4, 8] : [6, 12], width: [2, 3], amp: 0.6, tip: 0.6, root: 0.5, gap: 0.5, mask: (i) => (px.rampT[px.rampI[i]] === RP('plum') ? 0 : 1) });
    if (part === 'head' || part === 'jaw') hp.hollows([...[1, -1].flatMap((sx) => [{ c: mir(TK_EYE, sx), r: 0.03, k: 1.2 }, { c: mir(TK_MOUTH, sx), r: 0.014, k: 1.2 }])]);
    px.flush();
  };
}
/** the nose: wet black leather, pebbled, the nostrils deep and sooty with a copper scald round their rims */
const nosePaint = (ch: Chart, _p: Piece, b: Body) => {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.lightK = 0.9; px.hue = 1;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ax = Math.abs(x);
    const nd = Math.hypot((ax - TK_NOSTRIL[0]) / 0.0065, (y - TK_NOSTRIL[1]) / 0.0045);
    if (nd < 1 && N[i * 3 + 2] > 0.3) { px.put(i, RP('ink'), 0); px.rough[i] = 80; continue; }
    px.put(i, nd < 1.6 && N[i * 3 + 2] > 0.2 ? COPPER : NOSE, (nd < 1.6 ? 1.4 : 1.6) + (N[i * 3 + 1] > 0.3 ? 1.0 : 0) + fbm3(x * 120, y * 120, z * 120, 2) * 0.6 - (ax < 0.0025 ? 0.8 : 0)); px.rough[i] = 150;
  }
  px.pebbles(0.0035, { depth: 0.6, seed: 9 });
  px.creaseInk(1, { dark: 1.2, lit: 1 });
  // wet only on top of the leather, where it catches the sky
  wet(px, (i) => (N[i * 3 + 1] > 0.35 ? 0.7 : 0), NOSE, 1.2);
  px.flush();
};
const clawPaint = solid(RP('horn'), (x, y, z, ny) => 2.6 + (ny > 0.3 ? 0.8 : 0) + fbm3(x * 90, y * 90, z * 90, 2) * 0.4, 110);
const toothPaint = solid(RP('bone'), (x, y, z, ny) => 4 + (ny > 0 ? 0.6 : 0) + fbm3(x * 200, y * 200, z * 200, 2) * 0.4, 70);

// ------------------------------------------------------------------------------------------------ the build
export function* teakettlerModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = teakettlerBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1939;
  const J: V3[] = [[0, 0.26, -0.2], [0, 0.24, -0.12], [0, 0.23, -0.02], [0, 0.245, 0.1], [0, 0.285, 0.165], [0, 0.35, 0.2]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('root'), bi('chest'), bi('neck')], 0.35);
  // ---- the body: round haunches, a short back, a deep chest and brisket, the withers, a thick neck rising to the
  // head
  const st: Station[] = [
    { c: [0, 0.262, -0.19], s: [0.04, 0.04], p: 'round' },
    { c: [0, 0.258, -0.17], s: [0.09, 0.09], p: 'hips' },
    { c: [0, 0.25, -0.125], s: [0.118, 0.118], p: 'hips', tw: [[3, 0.08, 0], [4, 0.1, -0.04], [5, 0.06, -0.04]] },
    { c: [0, 0.252, -0.06], s: [0.106, 0.104], p: 'barrel', tw: [[7, 0, 0.12], [8, 0, 0.14]] },
    { c: [0, 0.245, 0.005], s: [0.122, 0.126], p: 'barrel' },
    { c: [0, 0.236, 0.065], s: [0.126, 0.14], p: 'barrel', tw: [[8, 0, -0.08], [7, 0.02, -0.06]] },
    { c: [0, 0.252, 0.115], s: [0.108, 0.132], p: 'shoulder', tw: [[0, 0, 0.06], [8, 0, -0.08]] },
    { c: [0, 0.272, 0.15], s: [0.086, 0.108], p: 'neck', tw: [[8, 0, -0.12]] },
    { c: [0, 0.302, 0.175], s: [0.07, 0.08], p: 'neck' },
    { c: [0, 0.33, 0.193], s: [0.058, 0.06], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: coatPaint('body') }));
  torso.reg = REG.torso;
  body.finalize(torso);
  // the masses: shoulder blades, the point of the shoulder and the forearm's top, the round haunch muscles, the
  // brisket, a scruff of loose skin behind the head
  sculpt(torso, [
    { c: [0.055, 0.34, 0.11], r: [0.04, 0.03, 0.05], out: 0.008, sym: true },
    { c: [0.09, 0.2, 0.11], r: [0.04, 0.06, 0.04], out: 0.01, sym: true },
    { c: [0.1, 0.235, -0.13], r: [0.065, 0.075, 0.065], out: 0.016, move: [0, 0, -0.006], sym: true },
    { c: [0, 0.14, 0.14], r: [0.05, 0.04, 0.04], out: 0.008 },
    { c: [0, 0.37, 0.17], r: [0.06, 0.03, 0.04], out: 0.006 },
  ]);
  yield 'trunk';
  // ---- the head: a domed crown, cheekbones, the stop, a short blunt muzzle
  const hb = bi('head');
  const hs = (z: number, dy: number, w: number, h: number, p: string | number[][], tw?: [number, number, number][]): Station => ({ c: H(0, dy, z), s: [w * HK, h * HK], p, tw });
  const head = body.add(trunk({ name: 'skull', stations: [
    hs(-0.035, 0.0, 0.04, 0.042, 'round'),
    hs(-0.008, 0.006, 0.06, 0.056, 'round'),
    hs(0.03, 0.008, 0.068, 0.054, 'barrel', [[3, 0.06, 0], [4, 0.08, -0.04]]),
    hs(0.062, 0.006, 0.062, 0.052, 'barrel'),
    hs(0.09, -0.004, 0.048, 0.042, 'barrel', [[8, 0, 0.1]]),
    hs(0.11, -0.012, 0.042, 0.036, 'flat'),
    hs(0.13, -0.015, 0.038, 0.032, 'flat'),
    hs(0.142, -0.016, 0.03, 0.026, 'round'),
  ], tween: 1, capS: true, capE: true, k: 2.6, levels: 2, skin: (p) => (p[2] < TK_HEAD[2] - 0.02 ? [hb, 0.6, bi('neck'), 0.4] : [hb, 1]), paint: coatPaint('head') }));
  head.reg = REG.head;
  body.finalize(head);
  const E = TK_EYE;
  sculpt(head, [
    // the eye sockets, the bushy brow ridges over them, the cheekbones, the stop between the eyes
    { c: E, r: 0.026 * HK, out: -0.008, sym: true },
    { c: H(0.038, 0.04, 0.075), r: [0.026, 0.013, 0.024], out: 0.01, move: [0.002, 0, 0.005], sym: true },
    { c: H(0.06, -0.012, 0.055), r: [0.024, 0.018, 0.034], out: 0.007, sym: true },
    { c: H(0, 0.028, 0.09), r: [0.022, 0.016, 0.016], out: -0.006 },
    // the whisker pads either side of the muzzle, the upper lip hanging over the mouth's corners
    { c: H(0.026, -0.022, 0.118), r: [0.024, 0.018, 0.028], out: 0.008, sym: true },
    { c: H(0.03, -0.035, 0.105), r: [0.018, 0.012, 0.02], move: [0, -0.005, 0], sym: true },
  ]);
  // the jaw: a small lower jaw with a little underbite
  const jaw = body.add(trunk({ name: 'jaw', stations: [
    { c: H(0, -0.031, 0.063), s: [0.04 * HK, 0.018 * HK], p: 'round' }, { c: H(0, -0.037, 0.1), s: [0.032 * HK, 0.016 * HK], p: 'round' }, { c: H(0, -0.036, 0.131), s: [0.024 * HK, 0.013 * HK], p: 'flat' }, { c: H(0, -0.034, 0.143), s: [0.012 * HK, 0.008 * HK], p: 'round' },
  ], tween: 1, capS: true, capE: true, k: 2, levels: 1, skin: () => [bi('jaw'), 1], paint: coatPaint('jaw') }));
  jaw.reg = REG.jaw;
  // two lower canines over the upper lip (the underbite)
  for (const s of [1, -1]) {
    const at: V3 = H(s * 0.012, -0.026, 0.138);
    body.add(stalk({ name: 'tooth' + (s > 0 ? 'L' : 'R'), path: [add(at, [0, -0.004, 0]), at, add(at, [0, 0.005, 0.001]), add(at, [0, 0.009, 0.002])], r: (t) => 0.0032 * (1 - t * 0.85), around: 5, capS: true, capE: true, levels: 0, k: 1.2, skin: () => [bi('jaw'), 1], paint: toothPaint })).reg = REG.mouth;
  }
  // the spout: a big leather nose with flared nostrils on the nose bone
  const nose = body.add(sac({ name: 'nose', at: H(0, -0.012, 0.147), n: [0, 0.15, 1], up: [0, 1, 0], r: [0.028 * HK, 0.019 * HK, 0.018 * HK], skin: () => [bi('nose'), 1], paint: nosePaint, sink: 0.35, levels: 2, k: 3 }));
  nose.reg = REG.head;
  body.finalize(nose);
  sculpt(nose, [
    { c: TK_NOSTRIL, r: [0.009, 0.007, 0.012], out: -0.006, sym: true },
    { c: H(0.017, -0.012, 0.162), r: [0.012, 0.01, 0.014], out: 0.004, sym: true },
    { c: H(0, -0.022, 0.163), r: [0.005, 0.014, 0.012], out: -0.003 },
  ]);
  // big bright eyes: round dark irises, wide open lids (it is curious about everything), dark rims
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(TK_EYE, s), ax: V3 = [s * TK_EYE_AX[0], TK_EYE_AX[1], TK_EYE_AX[2]];
    body.add(paintedEye({ name: 'eye' + S, c, ax, r: EYE_R, bone: bi('eye' + S), iris: RP('fur'), pupil: 'round', pupilR: 0.45, irisA: 0.85, sclera: RP('paper'), side: s, k: 3.4 })).reg = REG.eye;
    body.add(almondLid({ name: 'lid' + S, c, ax, r: EYE_R, bone: bi('lid' + S), side: s, open: 0.72, w: 0.95, tilt: 0.04, peak: 0.1, thick: 0.3, root: 2.0, skin: { R: SOOT, step: 2.6, lash: RP('ink') } })).reg = REG.head;
    body.add(almondLid({ name: 'llid' + S, c, ax, r: EYE_R, bone: hb, side: s, lower: true, open: 0.55, w: 0.95, tilt: 0.04, thick: 0.28, root: 2.0, skin: { R: SOOT, step: 2.8, wet: CREAM } })).reg = REG.head;
    // cupped ears, standing up and out, the tips folded over forward
    const ef = flap({ name: 'ear' + S, path: curve([H(s * 0.038, 0.026, -0.006), H(s * 0.052, 0.052, -0.01), H(s * 0.067, 0.078, -0.008), H(s * 0.078, 0.094, 0.004), H(s * 0.08, 0.09, 0.024)], 8), face: [s * 0.4, 0.1, -1], across: 7,
      w: (t) => 0.032 * Math.sin(Math.min(1, 0.32 + t * 0.8) * Math.PI) + 0.004, cup: (t) => 0.012 * Math.sin(Math.min(1, t * 1.3) * Math.PI), th: () => 0.0045,
      skin: () => [bi('ear' + S), 1], paint: (c, p, b) => coatPaint('ear', ef.inner)(c, p, b), levels: 1, k: 1.6 });
    body.add(ef).reg = REG.head;
  }
  yield 'head';
  // ---- sturdy legs: the forearm and the round thigh, the elbow and the hock, paws with knuckled toes
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? LEGS.f : LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    const rings: LimbRing[] = legRings('paw', fore, L.r, [0, 0.5, 1], segL, PADH).map((r) => ({ ...r, r: r.r * (r.t < 0.3 ? 1.15 : r.t > 0.85 ? 1.15 : 1.05) }));
    const foot: FootSpec = { pad: L.r * 0.8, h: PADH, fwd: 0.32, nail: 'claw', lobe: 0.24, toeAround: 6, toes: [-36, -12, 12, 36].map((a, j) => ({ a, len: L.r * (j === 1 || j === 2 ? 0.42 : 0.34), r: L.r * 0.25, claw: L.r * 0.22, curl: 0.55, drop: 0.3 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 12, levels: 1, rise: 0.06,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: coatPaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
  }
  // ---- the handle: a thick fluffy tail arching right over the back
  const tb = [0, 1, 2, 3, 4].map((k) => bi('tail' + k));
  const tailSkin = chainSkin(TAIL, tb, 0.4);
  body.add(stalk({ name: 'tail', path: curve(TAIL_CTRL, 12), r: (t) => 0.034 * (0.72 + 0.48 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.8)) * (t > 0.85 ? 1 - (t - 0.85) * 4 : 1) + 0.004, around: 10, capS: false, capE: true, levels: 1, k: 1.1,
    sec: (a) => (Math.cos(a) > 0.6 ? 1.08 : 1) * (1 + 0.05 * Math.sin(a * 4)),
    skin: (p) => (p[2] < -0.19 && p[1] < 0.3 ? [bi('hips'), 0.6, tb[0], 0.4] : tailSkin(p)), paint: coatPaint('tail') })).reg = REG.tail;
  void h3;
  const out = yield* body.buildGen({ den: o.den ?? 500, maxScale: 2, budget: 21000, fur: TK_FUR });
  return finishModel(body, out, bones);
}
/** fluffy all over (the tail and the cheek ruffs most), short on the muzzle and the socks, none on the nose, the eyes'
 *  rims or the inner ears */
const TK_FUR = furZones([
  { piece: /^(trunk|[fh]leg[LR])$/, len: 0.42, clump: 0.55, tip: 0.6 },
  { piece: /^trunk$/, a: [0, 0.25, 0.1], b: [0, 0.3, 0.19], r: 0.09, len: 0.85, clump: 0.6 },
  { piece: /^trunk$/, facing: [0, -1, 0], min: 0.3, len: 0.7, clump: 0.6 },
  { piece: /^[fh]leg[LR]$/, a: [0, 0.2, 0], b: [0, 0.1, 0], r: 0.25, soft: 0.5, len: 0.55, clump: 0.6 },
  { piece: /^tail$/, len: 1, clump: 0.6, tip: 0.6 },
  { piece: /^skull$/, len: 0.3, clump: 0.4, tip: 0.6 },
  ...[1, -1].map((s) => ({ piece: /^skull$/, a: H(s * 0.06, -0.015, 0.025), b: H(s * 0.055, -0.025, 0.055), r: 0.03, len: 0.75, clump: 0.6 })),
  ...[1, -1].map((s) => ({ piece: /^skull$/, a: H(s * 0.04, 0.04, 0.067), b: H(s * 0.046, 0.039, 0.083), r: 0.012, len: 0.6, clump: 0.7, tip: 0.8 })),
  { piece: /^skull$/, a: H(0, -0.015, 0.11), b: H(0, -0.015, 0.16), r: 0.04, bare: true, len: 0 },
  ...[1, -1].map((s) => ({ piece: /^skull$/, a: [s * TK_EYE[0], TK_EYE[1], TK_EYE[2]] as V3, r: EYE_R * 1.6, soft: 0.3, bare: true, len: 0 })),
  { piece: /^[fh]leg[LR]$/, y: [-1, 0.02], bare: true, len: 0 },
]);
export const TK_FUR_SPEC = { length: 0.04, shells: 12, comb: [0, -0.35, -0.6] as [number, number, number], clump: 5, clumpPull: 0.5, density: 0.9, rootDark: 0.55, tipK: 0.6, droop: 0.3, hz: 3.2, fins: 0.5, springs: [{ bones: ['tail1'], hz: 2.6, inertia: 1.4 }, { bones: ['earL', 'earR'], hz: 5 }] };
export type { Chart, Piece };
