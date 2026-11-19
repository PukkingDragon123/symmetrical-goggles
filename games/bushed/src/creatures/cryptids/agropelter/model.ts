// THE AGROPELTER (Cox 1910, Anthrocephalus craniofractens: it lives in hollow trees and hurls dead limbs at anyone
// who passes under, "the villainous face of an ape and arms like whiplashes"; it eats woodpeckers and hoot owls; other
// tellings give it black fur and an ash-grey, skull-like face). This one: a wiry black ape the size of a boy, hunched,
// short bowed legs, arms twice as long as they should be, ropy, ending in long-fingered hands; an ash-grey skull of a
// face (a heavy brow over deep sockets with small burning amber eyes, a long creased upper lip, an underbite grin of
// crooked yellow teeth), owl-tufted ears, ragged black fur. It holds a crooked dead branch on its own bone (thrown and
// simulated by agropelter.ts).
// Its tree is a separate static model: a dead, broken-topped spruce snag with a hollow (the knot-hole it lives in, rimmed
// with claw-scored bark), woodpecker holes, stubs of dead limbs and a heap of broken branches round its foot.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, eyeball, eyelid, locks, stalk, curve, chainSkin, Px, RP, h3, cl,
  type V3, type Station, type FootSpec, type LockSeat, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { fbm3, nz2, seatsOn } from '../../paintkit';
import { furZones, type FurZone } from '../../fur';
import { bonesKit, boneIndex, coat, solid, finishModel, REG, type ModelGen } from '../kit';
import type { BoneDef } from '../../rig';

export const AGROPELTER_MODEL_VERSION = 'agropelter@1';
export const SNAG_MODEL_VERSION = 'agrosnag@2';
export const AG_HEAD: V3 = [0, 1.04, 0.16];
export const AG_EYE: V3 = [0.038, 1.065, 0.262];
export const AG_EYE_AX: V3 = [0.25, 0.05, 0.97];
const ARM = { sh: [0.15, 0.9, 0.05] as V3, el: [0.24, 0.45, -0.02] as V3, wr: [0.26, 0.02, 0.06] as V3, r: 0.042 };
const LEG = { hip: [0.1, 0.46, -0.02] as V3, knee: [0.17, 0.25, 0.09] as V3, sole: [0.15, 0, 0.02] as V3, r: 0.055 };
const PADH = 0.016;
/** the snag: the hollow's centre height, the trunk radius there, the direction the hole faces is +z */
export const SNAG = { holeY: 3.3, r: 0.36, top: 5.2 };
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function agropelterBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('hips', null, [0, 0.48, -0.01]);
  A('spine', 'hips', [0, 0.66, 0.0]);
  A('chest', 'spine', [0, 0.84, 0.04]);
  A('neck', 'chest', [0, 0.97, 0.1]);
  A('head', 'neck', AG_HEAD);
  A('jaw', 'head', [0, 1.0, 0.2]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(AG_EYE, k)); A('lid' + s, 'head', mir(AG_EYE, k)); A('ear' + s, 'head', [k * 0.085, 1.09, 0.13]); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A('cla' + s, 'chest', [k * 0.06, 0.9, 0.06]);
    A('arm' + s, 'cla' + s, mir(ARM.sh, k)); A('elb' + s, 'arm' + s, mir(ARM.el, k)); A('hand' + s, 'elb' + s, mir(ARM.wr, k));
    A('fing' + s, 'hand' + s, mir(add(ARM.wr, [0, -0.08, 0.02]), k));
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('thigh' + s, 'hips', mir(LEG.hip, k)); A('shin' + s, 'thigh' + s, mir(LEG.knee, k)); A('foot' + s, 'shin' + s, mir([LEG.sole[0], PADH * 1.6, LEG.sole[2]], k)); }
  // the branch it throws (placed in a hand, or in the air, by the runtime)
  A('stick', 'hips', [0, 0.6, 0.3]);
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const FUR = RP('squatch'), DARK = RP('basalt'), FACE = RP('stone'), BONE = RP('bone'), HORN = RP('horn'), BARK = RP('stone'), WOOD = RP('soil');
const furPaint = (flow: number) => coat({
  lightK: 0.85,
  texel: (px, i, x, y, z) => { const m = fbm3(x * 6, y * 6, z * 6, 3); px.put(i, m > 0.3 ? DARK : FUR, 1.6 + m * 0.9); px.rough[i] = 240; return 1; },
  pelt: { len: 0.06, width: 0.01, flow, down: 0.6, tooth: 1.9, clump: 0.65, strands: 0.32 },
  ink: [1.4, 1.0, 0.3],
});
/** the face: ash-grey skin drawn tight over a skull, the brow and cheekbones pale, the sockets and the creases black */
function facePaint(part: 'skull' | 'jaw') {
  return coat({
    lightK: 0.75,
    texel: (px, i, X, Y, Z, _nx, ny, nz) => {
      const x = X - AG_HEAD[0], y = Y - AG_HEAD[1], z = Z - AG_HEAD[2], ax = Math.abs(x), m = fbm3(X * 35, Y * 35, Z * 35, 2);
      const face = nz > -0.05 && z > 0.035 && !(ny > 0.6 && z < 0.08);
      if (!face) { px.put(i, FUR, 1.7 + fbm3(X * 7, Y * 7, Z * 7, 2) * 0.8); px.rough[i] = 240; return 1; }
      if (part === 'jaw' && ny > 0.55) { px.put(i, RP('gum'), 1.3 - cl((0.13 - z) * 9, 0, 1.2)); px.rough[i] = 60; return 0; }
      let st = 3.0 + m * 0.6;
      // skull: the brow ridge a pale shelf over sockets of black, the cheekbones pale, the temples sunken
      const ed = Math.hypot(ax - (AG_EYE[0] - AG_HEAD[0]), (y - (AG_EYE[1] - AG_HEAD[1])) * 0.9);
      if (ed < 0.032) st -= (0.032 - ed) * 95;
      if (y > 0.042 && y < 0.062 && ax < 0.07) st += 1.6 - (y > 0.056 ? 0.6 : 0);
      if (Math.abs(y - 0.0) < 0.012 && ax > 0.045 && ax < 0.075) st += 1.2;
      if (ax > 0.07 && y > 0.0) st -= 0.8;
      // creases: crow's feet, deep folds from the nose down past the mouth, wrinkles over the long upper lip
      if (ed > 0.032 && ed < 0.05 && Math.abs(Math.sin(Math.atan2(y - 0.025, ax - 0.04) * 8)) < 0.15 && ax > 0.045) st -= 1;
      const nl = Math.abs(ax - (0.022 + (0.02 - y) * 0.5));
      if (y < 0.02 && y > -0.05 && nl < px.mpt * 1.1) st -= 1.4;
      if (y < -0.005 && y > -0.035 && ax < 0.028 && Math.abs(Math.sin(x * 500)) < 0.2) st -= 0.7;
      // nostrils: two flat slits; the mouth: a black line with the grin's corners pulled up
      if (Math.hypot(ax - 0.011, (y - 0.008) * 1.4) < 0.0065 && z > 0.1) st = 0;
      const ml = y + 0.038 - ax * ax * 14;
      if (Math.abs(ml) < px.mpt * 1.2 && ax < 0.05 && z > 0.07) { px.put(i, RP('ink'), 0.5); px.rough[i] = 90; return 0; }
      px.put(i, FACE, st); px.rough[i] = 170;
      return 0;
    },
    pelt: { len: 0.05, width: 0.009, flow: -1, down: 0.7, tooth: 1.7, clump: 0.6, strands: 0.3 },
    ink: [1.2, 1.3, 0.8],
    after: (px) => px.pebbles(0.005, { depth: 0.35, seed: 41, mask: (i) => (px.rampT[px.rampI[i]] === FACE ? 1 : 0) }),
  });
}
const handPaint = coat({ lightK: 0.7, texel: (px, i, x, y, z, _nx, ny) => { px.put(i, FACE, 2.0 + fbm3(x * 60, y * 60, z * 60, 2) * 0.6 - (Math.abs(Math.sin(y * 110)) < 0.14 ? 0.9 : 0) + (ny > 0.4 ? 0.4 : 0)); px.rough[i] = 170; return 0; }, ink: [1.1, 1.2, 0.7] });
const nailPaint = solid(HORN, (x, y, z, ny) => 2.4 + (ny > 0.3 ? 1 : 0) + fbm3(x * 80, y * 80, z * 80, 2) * 0.4, 100);
const toothPaint = solid(RP('ochre'), (x, y, z, ny) => 4 + (ny > 0 ? 0.6 : 0) + fbm3(x * 90, y * 90, z * 90, 2) * 0.8 - (h3(Math.floor(x * 900), Math.floor(z * 900), 2) < 0.1 ? 1.4 : 0), 90);
const lidPaint = coat({ lightK: 0.6, texel: (px, i, x, y, z) => { px.put(i, FACE, 2.0 + fbm3(x * 70, y * 70, z * 70, 2) * 0.5); px.rough[i] = 170; return 0; } });
/** dead wood: weathered grey bark in plates, curling away, bare silver-brown wood where it has fallen off */
const deadWood = (o: { bark?: number; seed?: number } = {}) => coat({
  lightK: 0.8,
  texel: (px, i, x, y, z) => {
    const m = fbm3(x * 3, y * 1.5, z * 3, 3), plate = fbm3(x * 12 + (o.seed ?? 0), y * 4, z * 12, 2), bare = fbm3(x * 2 + 9, y * 0.8, z * 2, 2) > 0.3 - (o.bark ?? 0);
    if (bare) {
      // bare wood: silvery, long checks running up the grain, beetle galleries
      const grain = Math.abs(Math.sin((x * 40 + z * 40) + Math.sin(y * 6) * 2 + nz2(x * 10, y * 2) * 2)) < 0.12;
      const gall = Math.abs(Math.sin(y * 70 + Math.sin(x * 60 + z * 60) * 3)) < 0.1 && plate > 0.1;
      px.put(i, WOOD, 4.4 + m * 0.6 - (grain ? 1.3 : 0) - (gall ? 1.8 : 0)); px.rough[i] = 230; return 0;
    }
    // bark plates: each one a step apart, a dark crack round it, lichen spots
    const crack = Math.abs(Math.sin(y * 18 + plate * 6)) < 0.1 || Math.abs(Math.sin((x + z) * 30 + plate * 4)) < 0.08;
    let R = BARK, st = 3.4 + plate * 1.2 + m * 0.5 - (crack ? 2 : 0);
    if (fbm3(x * 9 + 3, y * 9, z * 9, 2) > 0.42) { R = RP('sage'); st = 3 + m; }
    px.put(i, R, st); px.rough[i] = 235;
    return 0;
  },
  ink: [1.3, 1.2, 0.7],
});

// ------------------------------------------------------------------------------------------------ the creature
export function* agropelterModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = agropelterBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1910;
  const J: V3[] = [[0, 0.36, -0.03], [0, 0.48, -0.01], [0, 0.66, 0.0], [0, 0.84, 0.04], [0, 0.97, 0.1], [0, 1.05, 0.15]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('spine'), bi('chest'), bi('neck')], 0.35);
  const st: Station[] = [
    { c: [0, 0.36, -0.03], s: [0.08, 0.07], p: 'round' },
    { c: [0, 0.43, -0.02], s: [0.12, 0.095], p: 'hips' },
    { c: [0, 0.54, -0.01], s: [0.11, 0.09], p: 'round' },
    { c: [0, 0.66, 0.0], s: [0.12, 0.1], p: 'barrel' },
    { c: [0, 0.78, 0.025], s: [0.15, 0.11], p: 'barrel' },
    { c: [0, 0.88, 0.05], s: [0.17, 0.11], p: 'shoulder', tw: [[0, 0, 0.12], [1, 0.04, 0.1]] },
    { c: [0, 0.95, 0.08], s: [0.11, 0.085], p: 'neck' },
    { c: [0, 1.01, 0.12], s: [0.075, 0.07], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: furPaint(-1) }));
  torso.reg = REG.torso;
  body.finalize(torso);
  // ---- the head: a skull with a heavy brow, a short muzzle with a long upper lip, an underslung jaw
  const H = AG_HEAD, hb = bi('head');
  const hs = (z: number, dy: number, w: number, h: number, p: string | number[][], tw?: [number, number, number][]): Station => ({ c: [0, H[1] + dy, H[2] + z], s: [w, h], p, tw });
  body.add(trunk({ name: 'skull', stations: [
    hs(-0.06, 0.01, 0.06, 0.065, 'round'),
    hs(-0.02, 0.025, 0.085, 0.085, 'round'),
    hs(0.035, 0.03, 0.09, 0.085, 'round'),
    hs(0.075, 0.025, 0.088, 0.075, 'round', [[0, 0, 0.08], [1, 0.05, 0.1], [2, 0.08, 0.06]]),
    hs(0.1, 0.0, 0.07, 0.07, 'round', [[2, -0.12, 0.05], [3, -0.12, 0]]),
    hs(0.125, -0.012, 0.055, 0.05, 'round'),
    hs(0.142, -0.022, 0.035, 0.032, 'round'),
    hs(0.15, -0.026, 0.012, 0.012, 'round'),
  ], tween: 1, capS: true, capE: true, k: 2.4, levels: 2, rings: [{ at: 3, s: 1, ink: true }],
    skin: (p) => (p[2] < H[2] - 0.04 ? [hb, 0.6, bi('neck'), 0.4] : [hb, 1]), paint: facePaint('skull') })).reg = REG.head;
  body.add(trunk({ name: 'jaw', stations: [
    { c: [0, 0.995, 0.19], s: [0.06, 0.03], p: 'round' }, { c: [0, 0.99, 0.24], s: [0.055, 0.03], p: 'round' }, { c: [0, 0.993, 0.29], s: [0.04, 0.026], p: 'round' }, { c: [0, 0.998, 0.312], s: [0.014, 0.012], p: 'round' },
  ], tween: 0, capS: true, capE: true, k: 2, levels: 1, skin: () => [bi('jaw'), 1], paint: facePaint('jaw') })).reg = REG.jaw;
  // crooked yellow teeth: an underbite row standing up outside the upper lip, a few pegs above
  let tk = 0;
  for (let k = 0; k < 7; k++) {
    const f = k / 6 - 0.5, at: V3 = [f * 0.07, 1.004, 0.3 - Math.abs(f) * 0.04], len = 0.014 + h3(k, 2, 5) * 0.012 + (Math.abs(f) > 0.4 ? 0.006 : 0);
    body.add(stalk({ name: 'tooth' + tk++, path: [add(at, [0, -0.004, 0]), at, add(at, [(h3(k, 3, 5) - 0.5) * 0.006, len * 0.6, 0.002]), add(at, [(h3(k, 4, 5) - 0.5) * 0.01, len, 0.003])], r: (t) => 0.0045 * (1 - t * 0.6), around: 4, capS: true, capE: true, levels: 0, k: 1.3, skin: () => [bi('jaw'), 1], paint: toothPaint })).reg = REG.mouth;
  }
  // small amber eyes deep in the sockets, heavy lids; owl-tufted ears
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(AG_EYE, s), ax: V3 = [s * AG_EYE_AX[0], AG_EYE_AX[1], AG_EYE_AX[2]];
    body.add(eyeball({ name: 'eye' + S, c, ax, r: 0.016, bone: bi('eye' + S), iris: RP('glowAmber'), pupil: 'round', pupilR: 0.3, irisA: 0.8, sclera: RP('ochre'), k: 3, levels: 1, around: 10, catchlight: { side: s, at: [0.3, 0.4] } })).reg = REG.eye;
    body.add(eyelid({ name: 'lid' + S, c, ax, r: 0.016, bone: bi('lid' + S), paint: lidPaint, cover: 0.8, root: 2.2 })).reg = REG.head;
    const er: V3 = [s * 0.08, 1.08, 0.13];
    body.add(stalk({ name: 'ear' + S, path: curve([er, [s * 0.11, 1.11, 0.12], [s * 0.125, 1.15, 0.1], [s * 0.13, 1.19, 0.085]], 5), r: (t) => 0.026 * (1 - t * 0.9), around: 8, up: [0, 0, 1],
      sec: (a) => 1 / Math.sqrt((Math.sin(a) / 0.35) ** 2 + Math.cos(a) ** 2), capS: true, capE: true, levels: 1, k: 1.3, skin: () => [bi('ear' + S), 1], paint: facePaint('skull') })).reg = REG.head;
  }
  yield 'head';
  // ---- whiplash arms to the ground, long hands; short bowed legs
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const sh = mir(ARM.sh, s), el = mir(ARM.el, s), wr = mir(ARM.wr, s);
    const segA = [Math.hypot(sh[0] - el[0], sh[1] - el[1], sh[2] - el[2]), Math.hypot(el[0] - wr[0], el[1] - wr[1], el[2] - wr[2])];
    const ar: LimbRing[] = legRings('bear', true, ARM.r, [0, 0.5, 1], segA, 0.012).map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.6 : r.t < 0 ? 0.8 : r.t > 0.4 && r.t < 0.6 ? 0.82 : 0.95) }));
    const arm = limb({ name: 'arm' + S, side: s, hip: sh, knee: el, sole: [wr[0], wr[1] + 0.03, wr[2]], tj: [0, 0.5, 1], rings: ar, around: 10, levels: 1, rise: 0.03,
      foot: { pad: 0.03, h: 0.012, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('cla' + S), up: bi('arm' + S), lo: bi('elb' + S), foot: bi('hand' + S) }, paint: furPaint(1), clawPaint: nailPaint, k: 1 });
    arm.skin.reg = REG.arms;
    body.add(arm.skin);
    // the hand: a narrow palm and four long fingers, knuckles forward (it walks on them)
    const hb2 = bi('hand' + S), fb = bi('fing' + S);
    body.add(trunk({ name: 'palm' + S, stations: [0.0, 0.035, 0.07].map((d, k) => ({ c: add(wr, [0, 0.03 - d, 0.008]), s: [0.017, [0.028, 0.034, 0.03][k]] as [number, number], p: 'flat' })), tween: 0, capS: true, capE: true, levels: 1, k: 1.3, skin: () => [hb2, 1], paint: handPaint })).reg = REG.arms;
    for (let f = 0; f < 4; f++) {
      const fz = (f - 1.5) * 0.017 + 0.008, len = [0.075, 0.09, 0.088, 0.07][f], base: V3 = add(wr, [0, -0.04, fz]);
      const path = curve([base, add(base, [0, -len * 0.5, 0.006]), add(base, [-s * 0.008, -len * 0.85, 0.016]), add(base, [-s * 0.012, -len, 0.028])], 5);
      body.add(stalk({ name: 'fin' + S + f, path, r: (t) => 0.0085 * (1 - t * 0.35), around: 5, capS: false, capE: true, levels: 1, k: 1.2, skin: (p) => (p[1] > base[1] - len * 0.3 ? [hb2, 1] : [fb, 1]), paint: handPaint })).reg = REG.arms;
    }
    body.add(stalk({ name: 'thm' + S, path: curve([add(wr, [-s * 0.012, 0.0, 0.025]), add(wr, [-s * 0.02, -0.03, 0.04]), add(wr, [-s * 0.022, -0.055, 0.045])], 4), r: (t) => 0.009 * (1 - t * 0.4), around: 5, capS: false, capE: true, levels: 1, k: 1.2, skin: () => [hb2, 1], paint: handPaint })).reg = REG.arms;
    const hip = mir(LEG.hip, s), knee = mir(LEG.knee, s), sole = mir(LEG.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    const lr: LimbRing[] = legRings('bear', false, LEG.r, [0, 0.5, 1], segL, PADH).map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.7 : 0.95) }));
    const foot: FootSpec = { pad: LEG.r * 0.7, h: PADH, fwd: 0.35, nail: 'nail', lobe: 0.2, toeAround: 6,
      toes: [-110, -40, -12, 14, 40].map((a, k) => ({ a, len: LEG.r * (k === 0 ? 0.5 : 0.75), r: LEG.r * 0.17, claw: LEG.r * 0.2, curl: 0.4, drop: k === 0 ? -0.2 : 0.3 })) };
    const leg = limb({ name: 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings: lr, foot, around: 10, levels: 1, rise: 0.05,
      bones: { parent: bi('hips'), up: bi('thigh' + S), lo: bi('shin' + S), foot: bi('foot' + S) }, paint: furPaint(1), clawPaint: nailPaint, k: 1 });
    leg.skin.reg = REG.legs; leg.toes.reg = REG.legs; leg.claws.reg = REG.claw; leg.toes.levels = 0; leg.claws.levels = 0; leg.toes.paint = handPaint;
    body.add(leg.skin); body.add(leg.toes); body.add(leg.claws);
    yield 'limbs';
  }
  // ---- the branch it throws: a crooked dead limb with two snapped side twigs
  const sb = bi('stick'), S0: V3 = [0, 0.6, 0.3];
  const spath = curve([add(S0, [0, 0, -0.32]), add(S0, [0.02, 0.01, -0.12]), add(S0, [-0.015, -0.005, 0.08]), add(S0, [0.01, 0.012, 0.3])], 7);
  body.add(stalk({ name: 'stick', path: spath, r: (t) => 0.024 * (1 - t * 0.5), around: 7, capS: true, capE: true, levels: 1, k: 1.1, skin: () => [sb, 1], paint: deadWood({ bark: -0.1, seed: 3 }) })).reg = REG.horn;
  for (const [t0, dir] of [[0.35, [0.6, 0.3, 0.7]], [0.7, [-0.5, -0.2, 0.8]]] as const) {
    const a = spath[Math.floor(t0 * (spath.length - 1))], d = nrm(dir as unknown as V3);
    body.add(stalk({ name: 'twig' + t0, path: [a, add(a, [d[0] * 0.05, d[1] * 0.05, d[2] * 0.05]), add(a, [d[0] * 0.11, d[1] * 0.11, d[2] * 0.11])], r: (t) => 0.01 * (1 - t * 0.5), around: 5, capS: true, capE: true, levels: 0, k: 1, skin: () => [sb, 1], paint: deadWood({ bark: -0.1, seed: 4 }) })).reg = REG.horn;
  }
  // ---- ragged locks: the shoulders and the backs of the arms (whips of hair), the crown
  const seats: LockSeat[] = [];
  seats.push(...seatsOn(torso, { u0: 0.3, u1: 0.7, v0: 0.55, v1: 0.95, rows: 8, cols: 8, wid: 0.022, lift: 0.4, droop: 0.6, sink: 0.12,
    len: () => 0.08, dir: () => nrm([0, -0.6, -1]), col: (u, v) => (h3(Math.floor(u * 90), Math.floor(v * 90), 4) < 0.4 ? 1 : 0), skin: spineSkin, seed: 51 }));
  const lk = locks({ name: 'shag', seats, tiles: [FUR, DARK], steps: [3, 3], seed: 53 });
  if (lk) body.add(lk);
  const out = yield* body.buildGen({ den: o.den ?? 330, maxScale: 2, budget: 20000, fur: AG_FUR });
  return finishModel(body, out, bones);
}
const AG_FUR = furZones([
  { piece: /^(trunk|arm[LR]|leg[LR])$/, len: 0.6, clump: 0.75, tip: 0.3 },
  { piece: /^trunk$/, a: [0, 0.85, -0.05], b: [0, 1.0, 0.05], r: 0.14, len: 1, clump: 0.85 },
  ...[1, -1].flatMap((s): FurZone[] => [{ piece: /^arm[LR]$/, a: [s * 0.17, 0.85, 0.02], b: [s * 0.25, 0.1, 0.02], r: 0.06, len: 1, clump: 0.85, facing: [0, 0, -1], min: -0.3 }]),
  { piece: /^skull$/, a: [0, 1.12, 0.12], b: [0, 1.08, 0.06], r: 0.06, len: 0.8, clump: 0.8 },
  { piece: /^leg[LR]$/, a: [0, 0.06, 0], b: [0, -0.1, 0], r: 0.5, soft: 0.3, bare: true, len: 0 },
]);
export const AG_FUR_SPEC = { length: 0.08, shells: 12, comb: [0, -0.7, -0.35] as [number, number, number], clump: 5, clumpPull: 0.75, density: 0.85, rootDark: 0.4, tipK: 0.3, droop: 0.4, hz: 2.6, fins: 0.6, springs: [{ bones: ['armL', 'armR'], hz: 3 }] };

// ------------------------------------------------------------------------------------------------ the snag
export function snagBones(): BoneDef[] { return [{ name: 'snag', parent: -1, pos: [0, 0, 0] }]; }
export function* snagModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = snagBones();
  const body = new Body(o.page ?? 1024);
  body.seed = 77;
  const skin = () => [0, 1];
  // the trunk: a root flare, a slow taper, a lean, a broken top in jagged splinters
  const ctrl: V3[] = [[0, -0.2, 0], [0, 0.6, 0.0], [0.02, 1.8, -0.02], [0.05, 3.3, -0.04], [0.08, 4.4, -0.05], [0.1, SNAG.top, -0.06]];
  const path = curve(ctrl, 22);
  const R = (t: number) => { const y = -0.2 + t * (SNAG.top + 0.2); return SNAG.r * (1 + 0.55 * Math.exp(-Math.max(0, y) / 0.35) - 0.18 * (y / SNAG.top)) * (1 + 0.04 * Math.sin(y * 3.1)); };
  const tr = body.add(stalk({ name: 'trunk', path, r: R, around: 18, sec: (a, t) => 1 + 0.06 * Math.sin(a * 5 + t * 9) + (t < 0.12 ? 0.18 * Math.max(0, Math.cos(a * 4)) : 0), capS: true, capE: false, levels: 1, k: 0.8, skin, paint: snagPaint }));
  void tr;
  // the broken top: splinters standing up round the rim
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + h3(k, 1, 9) * 0.4, r0 = R(1) * 0.8, base: V3 = [0.1 + Math.sin(a) * r0, SNAG.top - 0.05, -0.06 + Math.cos(a) * r0];
    const L = 0.15 + h3(k, 2, 9) * 0.45;
    body.add(stalk({ name: 'spl' + k, path: [base, add(base, [Math.sin(a) * 0.02, L * 0.5, Math.cos(a) * 0.02]), add(base, [Math.sin(a) * 0.03, L, Math.cos(a) * 0.03])], r: (t) => 0.07 * (1 - t * 0.92), around: 4, capS: true, capE: true, levels: 0, k: 0.8, skin, paint: deadWood({ bark: 1, seed: k }) }));
  }
  // the hollow: a lip of curled bark round a black hole (painted on the trunk), facing +z at SNAG.holeY
  const hc: V3 = [0.05, SNAG.holeY, -0.04 + SNAG.r * 0.97];
  const lip: V3[] = Array.from({ length: 13 }, (_, k) => { const a = (k / 12) * Math.PI * 2; return add(hc, [Math.sin(a) * 0.23, Math.cos(a) * 0.33, 0.0 + 0.02 * Math.cos(a)]); });
  body.add(stalk({ name: 'lip', path: lip, r: () => 0.045, around: 6, capS: false, capE: false, levels: 1, k: 1, skin, paint: snagPaint }));
  // dead limb stubs
  for (const [y, a, L] of [[1.6, 2.2, 0.35], [2.4, -1.0, 0.6], [3.9, 1.2, 0.5], [4.5, -2.4, 0.3], [2.9, 3.6, 0.25]] as const) {
    const base: V3 = [Math.sin(a) * SNAG.r * 0.8, y, Math.cos(a) * SNAG.r * 0.8], d = nrm([Math.sin(a), 0.25, Math.cos(a)]);
    body.add(stalk({ name: 'stub' + y, path: curve([base, add(base, [d[0] * L * 0.5, d[1] * L * 0.5, d[2] * L * 0.5]), add(base, [d[0] * L, d[1] * L - 0.05, d[2] * L])], 4), r: (t) => 0.06 * (1 - t * 0.6), around: 6, capS: true, capE: true, levels: 1, k: 0.9, skin, paint: deadWood({ bark: -0.2, seed: y * 10 }) }));
  }
  // the heap of broken branches round its foot (its ammunition, and what it has thrown)
  for (let k = 0; k < 14; k++) {
    const a = h3(k, 1, 3) * Math.PI * 2, r = 0.7 + h3(k, 2, 3) * 1.6, L = 0.5 + h3(k, 3, 3) * 0.9, b = a + 1.2 + h3(k, 4, 3) * 1.5;
    const c: V3 = [Math.sin(a) * r, 0.03 + h3(k, 5, 3) * 0.05, Math.cos(a) * r], d: V3 = [Math.sin(b), 0.04, Math.cos(b)];
    body.add(stalk({ name: 'br' + k, path: curve([add(c, [-d[0] * L / 2, 0, -d[2] * L / 2]), add(c, [d[0] * 0.02, 0.02, d[2] * 0.02]), add(c, [d[0] * L / 2, d[1] * L, d[2] * L / 2])], 4), r: (t) => (0.03 + h3(k, 6, 3) * 0.02) * (1 - t * 0.6), around: 5, capS: true, capE: true, levels: 0, k: 0.7, skin, paint: deadWood({ bark: 0.1, seed: k }) }));
  }
  const out = yield* body.buildGen({ den: o.den ?? 150, maxScale: 2, budget: 9000 });
  return finishModel(body, out, bones);
}
/** the snag's bark, the black hole of the hollow, claw marks round it, woodpecker holes */
const snagPaint = coat({
  lightK: 0.85,
  texel: (px, i, x, y, z, nx, ny, nz) => {
    const hx = x - 0.05, hy = y - SNAG.holeY;
    const hole = Math.hypot(hx / 0.21, hy / 0.31) < 1 && nz > 0.3;
    if (hole) { const d = Math.hypot(hx / 0.21, hy / 0.31); px.put(i, RP('ink'), d > 0.85 ? 2 : 0); px.rough[i] = 255; return 0; }
    const m = fbm3(x * 3, y * 1.4, z * 3, 3), plate = fbm3(x * 10, y * 3, z * 10, 2), bare = fbm3(x * 1.5 + 9, y * 0.5, z * 1.5, 2) > 0.18;
    let R = BARK, st: number;
    if (bare) {
      const grain = Math.abs(Math.sin(Math.atan2(x, z) * 26 + Math.sin(y * 4) * 1.5 + nz2(y * 2, x * 9) * 2)) < 0.1;
      R = WOOD; st = 4.3 + m * 0.6 - (grain ? 1.4 : 0);
    } else {
      const crack = Math.abs(Math.sin(y * 14 + plate * 5)) < 0.09 || Math.abs(Math.sin(Math.atan2(x, z) * 18 + plate * 3)) < 0.08;
      st = 3.3 + plate * 1.3 + m * 0.5 - (crack ? 2.1 : 0);
      if (fbm3(x * 8 + 3, y * 8, z * 8, 2) > 0.4) { R = RP('sage'); st = 2.8 + m; }
    }
    // claw marks scored round the hollow, the bark rubbed pale where it climbs in and out
    if (Math.abs(hy) < 0.6 && Math.abs(hx) < 0.35 && nz > 0.2) {
      if (Math.abs(Math.sin(hx * 90 + hy * 12)) < 0.07 && Math.hypot(hx / 0.3, hy / 0.5) < 1) { R = WOOD; st = 5.4; }
      else st += 0.5;
    }
    // woodpecker holes (its dinner left them): small dark rectangles in rows
    const wp = Math.floor(y * 7), col = Math.floor(Math.atan2(x, z) * 4);
    if (h3(wp, col, 3) < 0.07 && Math.abs((y * 7) % 1 - 0.5) < 0.18 && Math.abs((Math.atan2(x, z) * 4) % 1 - 0.5) < 0.12) { R = RP('ink'); st = 1; }
    void nx; void ny;
    px.put(i, R, st); px.rough[i] = 235;
    return 0;
  },
  ink: [1.3, 1.2, 0.7],
});
export type { Chart, Piece };
void Px;
