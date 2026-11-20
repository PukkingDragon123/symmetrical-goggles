// THE SQUONK (Cox 1910, Lacrimacorpus dissolvens: the hemlock forests of Pennsylvania; "the skin is ill-fitting,
// covered with warts and moles"; always weeping; cornered, it dissolves itself in tears; later tellings give it webbed
// toes on its left feet). This one, an original design: knee-high and hunched, wearing a hide two sizes too big. The
// skin hangs in thick rolls round a short neck, drapes in folds over the shoulders and the haunches, sags in a heavy
// apron almost to the ground and bunches round the ankles like fallen socks. A big, low, doleful head: a furrowed
// forehead under heavy brows pinched up at their inner ends, deep-set wet eyes behind thick drooping lids with
// swollen bags under them, a bulb of a nose hanging over a small down-turned mouth, heavy jowls hanging past the
// jaw either side, a soft double chin, and long leathery ear flaps, cupped and rimmed, hanging down past the jowls.
// Paint: a dusky mauve hide going grey and mottled on the back, pinker and paler underneath and in the face, dark
// rings round the eyes, flushed nose and cheeks, glistening tear tracks running down the jowls, every fold shadowed
// in plum, warts and moles everywhere. It melts into a puddle of tears (the puddle is part of the model, on its own
// bone at the feet).
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, paintedEye, stalk, curve, chainSkin, sac, bulbs, gridSurf, hand, Px, RP, h3, cl,
  type V3, type Station, type FootSpec, type LimbRing, type Piece, type Chart,
} from '../../anatomy';
import { fbm3 } from '../../paintkit';
import { bonesKit, boneIndex, solid, warts, wet, finishModel, sculpt, almondLid, flap, REG, type ModelGen } from '../kit';
import type { BoneDef } from '../../rig';

export const SQUONK_MODEL_VERSION = 'squonk@6';
export const SQ_HEAD: V3 = [0, 0.36, 0.24];
export const SQ_EYE: V3 = [0.056, 0.413, 0.378];
export const SQ_EYE_AX: V3 = [0.3, 0.12, 0.95];
const EYE_R = 0.03;
const SQ_LEGS = {
  f: { hip: [0.09, 0.19, 0.08] as V3, knee: [0.105, 0.1, 0.09] as V3, sole: [0.115, 0, 0.115] as V3, r: 0.044 },
  h: { hip: [0.105, 0.2, -0.17] as V3, knee: [0.12, 0.11, -0.13] as V3, sole: [0.125, 0, -0.18] as V3, r: 0.048 },
};
const PADH = 0.014;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** head-local (relative to SQ_HEAD) to creature space */
const H = (x: number, y: number, z: number): V3 => [SQ_HEAD[0] + x, SQ_HEAD[1] + y, SQ_HEAD[2] + z];

export function squonkBones(): BoneDef[] {
  const { b, A } = bonesKit();
  // the root sits on the ground (it rocks on its feet); the body hangs from 'body', which squashes to melt
  A('root', null, [0, 0, -0.03]);
  A('puddle', 'root', [0, 0.004, -0.03]);
  A('body', 'root', [0, 0.0, -0.04]);
  A('belly', 'body', [0, 0.2, -0.08]);
  A('chest', 'body', [0, 0.27, 0.1]);
  A('neck', 'chest', [0, 0.31, 0.18]);
  A('head', 'neck', SQ_HEAD);
  A('jaw', 'head', [0, 0.315, 0.33]);
  A('nose', 'head', [0, 0.37, 0.4]);
  A('mouthL', 'head', [0.03, 0.31, 0.385]); A('mouthR', 'head', [-0.03, 0.31, 0.385]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A('eye' + s, 'head', mir(SQ_EYE, k)); A('lid' + s, 'head', mir(SQ_EYE, k));
    A('ear' + s, 'head', [k * 0.105, 0.44, 0.25]); A('ear2' + s, 'ear' + s, [k * 0.15, 0.35, 0.265]);
    A('tear' + s, 'head', [k * 0.047, 0.392, 0.402]);
  }
  A('hips', 'body', [0, 0.24, -0.2]);
  A('tail', 'hips', [0, 0.24, -0.32]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const f = SQ_LEGS.f; A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k)); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const h = SQ_LEGS.h; A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k)); }
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const SKIN = RP('hide'), GREY = RP('soil'), PLUM = RP('plum'), WART = RP('soil'), TEAR = RP('water');
/** a pear of a section: narrow over the back, the hide swinging out low on the flanks and tucking under the belly */
const PEAR = [[0, 1], [0.32, 0.96], [0.6, 0.8], [0.8, 0.52], [0.93, 0.14], [1.0, -0.26], [0.96, -0.62], [0.68, -0.9], [0, -0.97]];
/** the inner corner of an eye (left; mirrored by |x|) where the tears well up, and the track a tear runs down the
 *  cheek and the jowl (x, z by height below the eye) */
const tearTrack = (ax: number, y: number, z: number) => {
  const t = cl((SQ_EYE[1] - 0.012 - y) / 0.11, 0, 1);
  if (y > SQ_EYE[1] - 0.008 || y < SQ_EYE[1] - 0.13 || z < 0.3) return 99;
  const cx = SQ_EYE[0] - 0.02 + t * 0.03 + Math.sin(t * 6) * 0.004;
  return Math.abs(ax - cx) / (0.0045 + t * 0.003);
};
type Part = 'body' | 'head' | 'jaw' | 'leg' | 'ear' | 'tail';
/** the ill-fitting hide: dusky mauve, a grey mottled back, pinker and paler underneath and in the face, dark rings
 *  round the eyes, a flush on the cheeks, every fold shadowed plum; strokes run with the skin's sag (downward, and
 *  round the neck rolls); warts and moles drawn over it; the tear tracks wet and glistening */
function skinPaint(part: Part, earInner?: (p: V3, n: V3) => boolean) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    // strokes run with the skin's sag: down the flanks, the face and the jowls; round the neck rolls
    const hp = hand(px, { flow: part === 'leg' || part === 'tail' ? 'sweep' : (q: V3, n: V3): V3 => (part === 'body' && q[2] > 0.1 && q[2] < 0.25 ? [n[2], 0, -n[0]] : [n[0] * 0.2, -1, n[2] * 0.2]), seed: part.length * 5 + 1 });
    const fld = hp.field();
    yield;
    for (let i = 0; i < px.n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1], ax = Math.abs(x), s = (fld[i] - 0.5) * 2;
      const big = fbm3(x * 5 + 2, y * 5, z * 5, 2), mot = fbm3(x * 14 + 5, y * 14, z * 14, 2);
      let R = SKIN, st = 3.5 + s * 0.5 + big * 0.3;
      // a darker, greyer saddle down the back (a big mass, its edge broken by the strokes), liver spots over it
      if (ny > 0.5 + s * 0.12 + big * 0.1 && part !== 'head' && part !== 'ear') { R = GREY; st = 3.6 + s * 0.5; }
      if (mot > 0.46 && part !== 'ear') st -= 0.8;
      // pale and pinkish underneath
      if (ny < -0.35 + s * 0.1) { st = 4.3 + s * 0.4; }
      if (part === 'ear') {
        // leathery: darker on the back of the flap, the bowl pinker with veins
        if (earInner?.([x, y, z], [N[i * 3], ny, N[i * 3 + 2]])) { R = SKIN; st = 4.2 + s * 0.4 - (Math.abs(Math.sin(y * 170 + x * 40)) < 0.12 ? 1.0 : 0); }
        else { R = SKIN; st = 2.8 + s * 0.5; }
      }
      if (part === 'head' || part === 'jaw') {
        const hx = ax - SQ_HEAD[0], hy = y - SQ_HEAD[1], hz = z - SQ_HEAD[2];
        // dark sad rings round the eyes, the bags under them puffy and pinkish
        const ed = Math.hypot(ax - SQ_EYE[0], (y - SQ_EYE[1]) * 0.9, (z - SQ_EYE[2]) * 0.8);
        if (ed < 0.05 + s * 0.006) { R = SKIN; st = 2.5 + s * 0.4 + (y < SQ_EYE[1] - 0.025 ? 0.7 : 0); }
        // a flush on the cheeks and round the nose
        else if (Math.hypot(hx - 0.07, hy + 0.025, hz - 0.13) < 0.026 + s * 0.008) { R = PLUM; st = 4.2 + s * 0.4; }
        // the furrowed forehead (lines are carved; their lips catch a lighter step)
        if (hy > 0.06 && hz > 0.02 && hz < 0.15 && Math.abs(Math.sin(hy * 190 + ax * 25)) < 0.16) st -= 1.0;
        // the mouth: a small down-turned line, a darker lower lip
        const ml = hy + 0.052 + hx * hx * 14 - hx * 0.1;
        if (hz > 0.125 && hx < 0.045 && Math.abs(ml) < px.mpt * 1.4) { px.put(i, RP('gum'), 0.6); px.rough[i] = 80; continue; }
        if (hz > 0.125 && hx < 0.04 && ml < 0 && ml > -0.01) { R = PLUM; st = 2.8; }
        // the tear tracks: the stained skin under them
        // the tear tracks: a darker damp streak where they run
        if (tearTrack(ax, y, z) < 2.0 + s * 0.3) { R = SKIN; st = 1.9 + s * 0.3; px.rough[i] = 40; }
      }
      if (part === 'leg' && y < 0.06) st -= 0.3;
      px.put(i, R, st); px.rough[i] = 175;
    }
    yield;
    // drawn marks: a fine pebbled hide, warts and moles, crease ink in every fold
    px.pebbles(0.012, { depth: 0.3, seed: 12 });
    warts(px, part === 'head' ? 0.022 : 0.03, part === 'head' ? 0.3 : 0.24, () => 1, 21);
    hp.form({ light: 2.3, ao: 2.4, cavity: 1.8, ridge: 0.8, lift: 0.3 });
    hp.strokes({ len: [5, 11], width: [2, 3], amp: 0.6 });
    if (part === 'head' || part === 'jaw') hp.hollows([...[1, -1].flatMap((sx) => [{ c: mir(SQ_EYE, sx), r: 0.05, k: 1.5 }, { c: [sx * 0.03, 0.31, 0.385] as V3, r: 0.018, k: 1.2 }])]);
    if (part === 'head' || part === 'jaw') {
      // tears: wet, glistening streaks from the inner corners of the eyes down the cheeks to the jowls
      // the wet film: dark water down the middle of the streak, one thin bright highlight line along its lit edge
      const SNOW = RP('snow');
      for (let i = 0; i < px.n; i++) {
        const x = Math.abs(P[i * 3]), y = P[i * 3 + 1], z = P[i * 3 + 2], d = tearTrack(x, y, z);
        if (d > 1.0) continue;
        const t = cl((SQ_EYE[1] - 0.012 - y) / 0.11, 0, 1), cx = SQ_EYE[0] - 0.02 + t * 0.03 + Math.sin(t * 6) * 0.004;
        const hl = Math.abs(x - cx - (0.0045 + t * 0.003) * 0.35) < px.mpt * 0.6;
        if (hl) { px.over[i] = SNOW[SNOW.length - 1]; px.rough[i] = 10; }
        else { px.rampI[i] = px.ramp(TEAR); px.step[i] = 1.4; px.mark[i] = 0; px.rough[i] = 15; }
      }
      wet(px, (i) => (tearTrack(Math.abs(P[i * 3]), P[i * 3 + 1], P[i * 3 + 2]) < 1.6 ? 1 : 0), TEAR, 3);
    }
    px.flush();
  };
}
const wartPaint = solid(WART, (x, y, z, ny) => { const mole = h3(Math.floor(x * 300), Math.floor(z * 300), 3) < 0.3; return (mole ? 1.6 : 3) + (ny > 0.3 ? 1 : 0) + fbm3(x * 200, y * 200, z * 200, 2) * 0.6; }, 150, [1, 1, 0.8]);
const nosePaint = (ch: Chart, _p: Piece, b: Body) => {
  // a drooping, veined bulb of a nose, flushed raw from all the crying, two nostrils under it, wet
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.9; px.hue = 1;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ax = Math.abs(x), nd = Math.hypot(ax - 0.012, (y - 0.343) * 1.2, z - 0.423);
    if (nd < 0.008) { px.put(i, RP('ink'), 1); px.rough[i] = 60; continue; }
    const vein = Math.abs(Math.sin(x * 400 + Math.sin(y * 300) * 2)) < 0.08;
    px.put(i, SKIN, 3.9 + fbm3(x * 80, y * 80, z * 80, 2) * 0.6 - (nd < 0.013 ? 0.7 : 0) - (vein ? 0.9 : 0)); px.rough[i] = 90;
  }
  px.creaseInk(1.1, { dark: 1, lit: 0.8 });
  wet(px, () => 0.8, SKIN, 1.2);
  px.flush();
};
const dropPaint = solid(TEAR, (_x, _y, _z, ny) => 5 + (ny > 0.2 ? 1 : 0), 10, [2, 0, 0]);
const puddlePaint = (ch: Chart, _p: Piece, b: Body) => {
  // tears: dark clear water over the moss, rings where the drops fell, a wet rim
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.3;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], r = Math.hypot(x, z + 0.03), ring = Math.abs(Math.sin(r * 120 + fbm3(x * 20, 1, z * 20, 2) * 3)) < 0.1;
    px.put(i, TEAR, 0.8 + (ring ? 1.1 : 0) + fbm3(x * 30, y, z * 30, 2) * 0.5 + (r > 0.3 ? 0.8 : 0)); px.rough[i] = 10;
  }
  wet(px, () => 1, TEAR, 3);
  px.flush();
};
const clawPaint = solid(RP('bone'), (x, y, z, ny) => 2.8 + (ny > 0.3 ? 0.6 : 0) + fbm3(x * 90, y * 90, z * 90, 2) * 0.5, 120);

// ------------------------------------------------------------------------------------------------ the build
export function* squonkModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = squonkBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1910;
  const J: V3[] = [[0, 0.24, -0.34], [0, 0.24, -0.2], [0, 0.23, -0.04], [0, 0.27, 0.1], [0, 0.31, 0.18], [0, 0.36, 0.25]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('belly'), bi('chest'), bi('neck'), bi('head')], 0.4);
  // ---- the body: a hunched pear of loose hide, the apron sagging to the ground, rolls of skin round a short neck
  const st: Station[] = [
    { c: [0, 0.205, -0.342], s: [0.05, 0.05], p: 'round' },
    { c: [0, 0.212, -0.31], s: [0.155, 0.145], p: PEAR },
    { c: [0, 0.214, -0.245], s: [0.212, 0.19], p: PEAR, tw: [[7, 0.02, -0.08], [8, 0, -0.08]] },
    { c: [0, 0.226, -0.15], s: [0.226, 0.2], p: PEAR, tw: [[6, 0.04, -0.08], [7, 0.03, -0.12], [8, 0, -0.1]] },
    { c: [0, 0.228, -0.05], s: [0.218, 0.198], p: PEAR, tw: [[0, 0, -0.05], [6, 0.04, -0.08], [7, 0.03, -0.12], [8, 0, -0.1]] },
    { c: [0, 0.252, 0.045], s: [0.19, 0.2], p: PEAR, tw: [[0, 0, 0.16], [1, 0, 0.12], [8, 0, -0.1], [7, 0.02, -0.08]] },
    { c: [0, 0.272, 0.11], s: [0.16, 0.165], p: 'shoulder', tw: [[0, 0, 0.12], [1, 0, 0.08], [8, 0, -0.12]] },
    { c: [0, 0.29, 0.16], s: [0.138, 0.142], p: 'neck', tw: [[8, 0, -0.36], [7, -0.04, -0.16]] },
    { c: [0, 0.31, 0.2], s: [0.124, 0.124], p: 'neck', tw: [[8, 0, -0.4], [7, -0.04, -0.18]] },
    { c: [0, 0.33, 0.235], s: [0.1, 0.1], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: [1, 1, 1, 1, 1, 1, 2, 2, 1], capS: true, capE: true, k: 1, levels: 1,
    rings: [{ at: 7, s: 0.8, ink: true }, { at: 8, s: 0.8, ink: true }, { at: 6, s: 0.5, ink: true }],
    skin: (p) => { const w = spineSkin(p); return p[1] < 0.16 && p[2] < 0.06 ? [w[0], (w[1] ?? 1) * 0.5, bi('belly'), 0.5] : w; }, paint: skinPaint('body') }));
  torso.reg = REG.torso;
  body.finalize(torso);
  // the hide's weight: the apron dragged down between the legs, skin draped over the shoulders and the haunches,
  // thick rolls round the neck sagging lower in front, folds bunched where the legs come out
  sculpt(torso, [
    { c: [0, 0.08, -0.1], r: [0.2, 0.08, 0.2], move: [0, -0.012, 0] },
    { c: [0.17, 0.2, 0.06], r: [0.07, 0.1, 0.06], out: 0.016, move: [0, -0.012, 0], sym: true },
    { c: [0.19, 0.22, -0.2], r: [0.07, 0.1, 0.08], out: 0.016, move: [0, -0.012, 0], sym: true },
    { c: [0, 0.4, 0.06], r: [0.12, 0.06, 0.1], out: 0.012 },
    // the bones under the loose hide: shoulder blades and the points of the hips standing up, knobs down the spine
    { c: [0.075, 0.46, 0.07], r: [0.035, 0.03, 0.055], out: 0.026, sym: true, k: 3 },
    { c: [0.1, 0.405, -0.235], r: [0.035, 0.03, 0.04], out: 0.024, sym: true, k: 3 },
    { c: [0.17, 0.33, -0.26], r: [0.06, 0.07, 0.06], out: 0.016, sym: true },
    // the back sags behind the shoulders, the flanks pinch in above the belly, which hangs low between the legs
    { c: [0, 0.43, -0.07], r: [0.16, 0.06, 0.08], move: [0, -0.035, 0] },
    { c: [0.21, 0.27, -0.06], r: [0.05, 0.08, 0.09], out: -0.018, sym: true },
    { c: [0, 0.07, -0.08], r: [0.15, 0.07, 0.13], out: 0.012, move: [0, -0.008, 0] },
    { c: [0.2, 0.16, -0.17], r: [0.06, 0.06, 0.05], out: 0.014, move: [0, -0.01, 0], sym: true },
  ], (q, n) => {
    // big folds of loose hide: a roll draped over the shoulders behind the forelegs, another over the haunches, two
    // rolls round the neck; each sags lower and further back down the flanks, a fat roll with a deep crease behind it
    const sag = cl((0.36 - q[1]) / 0.25, 0, 1);
    const fold = (z0: number, back: number, a: number) => { const d = q[2] - (z0 - back * sag); return a * (Math.exp(-(((d - 0.008) / 0.014) ** 2)) - 0.9 * Math.exp(-(((d + 0.012) / 0.006) ** 2))); };
    const side = cl((Math.abs(q[0]) - 0.02) / 0.05, 0.3, 1);
    // creases running down the apron, wandering
    const ap = cl((0.16 - q[1]) / 0.06, 0, 1) * (n[1] < 0 ? 1 : 0);
    // the hide hangs in long vertical folds down the flanks between the legs, deeper toward the hem
    const flank = cl((Math.abs(q[0]) - 0.1) / 0.06, 0, 1) * cl((0.3 - q[1]) / 0.12, 0, 1) * cl((0.06 - q[2]) / 0.03, 0, 1) * cl((q[2] + 0.25) / 0.03, 0, 1);
    const drape = flank * (Math.pow(Math.abs(Math.sin(q[2] * 42 + Math.sin(q[1] * 30) * 0.5)), 0.7) - 0.6);
    // lumps of fat and loose hide (uneven, never a clean curve), the spine's knobs along the top
    const lump = Math.sin(q[0] * 31 + 1.3) * Math.sin(q[1] * 27 + 0.4) * Math.sin(q[2] * 23 + 2.1);
    const knob = n[1] > 0.6 && Math.abs(q[0]) < 0.03 ? Math.pow(Math.abs(Math.sin(q[2] * 90)), 4) * cl((0.12 - q[2]) / 0.05, 0, 1) : 0;
    return (fold(0.085, 0.05, 0.016) + fold(-0.215, -0.03, 0.013) * side + fold(0.168, 0.03, 0.012) + fold(0.205, 0.025, 0.01)) + 0.009 * lump + 0.006 * knob + 0.012 * drape - 0.004 * ap * Math.pow(Math.abs(Math.sin(q[0] * 60 + Math.sin(q[2] * 25) * 1.5)), 5);
  });
  yield 'trunk';
  // ---- the head: a low dome falling forward into the face, heavy jowls, the muzzle under the nose
  const hb = bi('head');
  const hs = (z: number, dy: number, w: number, h: number, p: string | number[][], tw?: [number, number, number][]): Station => ({ c: H(0, dy, z), s: [w, h], p, tw });
  const head = body.add(trunk({ name: 'skull', stations: [
    hs(-0.05, -0.005, 0.08, 0.08, 'round'),
    hs(-0.015, 0.006, 0.112, 0.112, 'round'),
    hs(0.025, 0.01, 0.128, 0.122, 'barrel'),
    hs(0.065, 0.0, 0.134, 0.118, 'sag', [[0, 0, -0.06], [5, 0.06, -0.08], [6, 0.1, -0.14], [7, 0.04, -0.1]]),
    hs(0.1, -0.008, 0.132, 0.112, 'sag', [[0, 0, -0.06], [5, 0.08, -0.1], [6, 0.16, -0.24], [7, 0.08, -0.22]]),
    hs(0.13, -0.014, 0.115, 0.1, 'sag', [[5, 0.08, -0.1], [6, 0.16, -0.24], [7, 0.06, -0.2]]),
    hs(0.152, -0.016, 0.088, 0.082, 'barrel'),
    hs(0.168, -0.02, 0.055, 0.052, 'round'),
    hs(0.176, -0.022, 0.024, 0.024, 'round'),
  ], tween: 1, capS: true, capE: true, k: 2.4, levels: 2,
    skin: (p) => {
      if (p[2] < SQ_HEAD[2] - 0.03) return [hb, 0.6, bi('neck'), 0.4];
      // the mouth corners ride their bones (a frown, or once in a long while a smile)
      for (const [b, sx] of [['mouthL', 1], ['mouthR', -1]] as const) { const d = Math.hypot(p[0] - sx * 0.03, p[1] - 0.31, p[2] - 0.385); if (d < 0.04) { const k = cl(1 - d / 0.04, 0, 1) * 0.9; return [hb, 1 - k, bi(b), k]; } }
      return [hb, 1];
    }, paint: skinPaint('head') }));
  head.reg = REG.head;
  body.finalize(head);
  const E = SQ_EYE;
  sculpt(head, [
    // the jowls: the lower cheeks dragged down and out past the jaw
    { c: H(0.09, -0.065, 0.1), r: [0.075, 0.075, 0.075], move: [0.02, -0.065, 0.006], out: 0.01, sym: true },
    { c: H(0.06, -0.075, 0.14), r: [0.04, 0.035, 0.04], move: [0.004, -0.02, 0.006], sym: true },
    // deep sockets; heavy brows over them, pinched up at the inner ends, sagging at the outer
    { c: E, r: 0.04, out: -0.02, sym: true },
    { c: H(0.056, 0.083, 0.138), r: [0.05, 0.022, 0.036], out: 0.014, move: [0, -0.004, 0.012], sym: true },
    { c: H(0.02, 0.09, 0.15), r: [0.026, 0.026, 0.03], move: [0, 0.012, 0.006], sym: true },
    { c: H(0.095, 0.068, 0.12), r: [0.03, 0.03, 0.03], move: [0.004, -0.014, 0], sym: true },
    // swollen bags under the eyes
    { c: H(0.058, 0.02, 0.152), r: [0.03, 0.014, 0.022], out: 0.008, move: [0, -0.003, 0], sym: true },
    // the muzzle pad under the nose and the groove of the mouth
    { c: H(0, -0.03, 0.166), r: [0.05, 0.03, 0.03], out: 0.01 },
    { c: H(0.042, -0.055, 0.15), r: [0.016, 0.02, 0.025], out: -0.008, sym: true },
    // the back of the skull settles into the neck rolls
    { c: H(0, 0.09, -0.02), r: [0.09, 0.05, 0.07], out: -0.008 },
  ], (q) => {
    // furrows across the forehead (worry lines), creases fanning from the eyes
    const hy = q[1] - SQ_HEAD[1], hz = q[2] - SQ_HEAD[2], ax = Math.abs(q[0]);
    const fore = cl((hy - 0.065) / 0.015, 0, 1) * cl((hz - 0.02) / 0.03, 0, 1) * cl((0.17 - hz) / 0.02, 0, 1);
    const crow = cl(1 - Math.hypot(ax - 0.1, hy - 0.04, hz - 0.11) / 0.03, 0, 1);
    return -0.0035 * fore * Math.pow(Math.abs(Math.sin(hy * 190 + ax * 25)), 5) - 0.003 * crow * Math.pow(Math.abs(Math.sin(hy * 220 + hz * 60)), 5);
  });
  // a tear hanging at the bottom of each track, on the jowl
  for (const sx of [1, -1]) {
    let best = -1, bz = -Infinity;
    head.m.V.forEach((v, k) => { if (Math.abs(v[0] - sx * 0.065) < 0.008 && Math.abs(v[1] - 0.293) < 0.008 && v[2] > bz) { bz = v[2]; best = k; } });
    if (best < 0) continue;
    const at = head.m.V[best];
    body.add(sac({ name: 'jowlTear' + (sx > 0 ? 'L' : 'R'), at: [at[0], at[1] - 0.003, at[2] + 0.002], n: [sx * 0.2, -1, 0.35], up: [0, 0, 1], r: [0.005, 0.0055, 0.008], skin: () => [hb, 1], paint: dropPaint, sink: 0.25, levels: 1, k: 2.5 })).noOcc = true;
  }
  // the chin: a small soft lower jaw, a double chin under it
  const jaw = body.add(trunk({ name: 'jaw', stations: [
    { c: [0, 0.31, 0.3], s: [0.065, 0.034], p: 'round' }, { c: [0, 0.303, 0.34], s: [0.058, 0.032], p: 'round', tw: [[8, 0, -0.3]] }, { c: [0, 0.302, 0.372], s: [0.042, 0.026], p: 'round', tw: [[8, 0, -0.25]] }, { c: [0, 0.304, 0.39], s: [0.02, 0.014], p: 'round' },
  ], tween: 0, capS: true, capE: true, k: 1.6, levels: 2, skin: () => [bi('jaw'), 1], paint: skinPaint('jaw') }));
  jaw.reg = REG.jaw;
  // the nose: a drooping bulb over the mouth
  const nose = body.add(sac({ name: 'nose', at: [0, 0.37, 0.398], n: [0, -0.9, 0.44], up: [0, 0, 1], r: [0.03, 0.026, 0.044], skin: () => [bi('nose'), 1], paint: nosePaint, sink: 0.3, levels: 2, k: 2 }));
  nose.reg = REG.head;
  body.finalize(nose);
  sculpt(nose, [
    // the bulb sags to a heavy tip; the nostrils pinch in under it either side of a groove
    { c: [0, 0.33, 0.42], r: [0.04, 0.03, 0.03], move: [0, -0.008, 0.004], out: 0.004 },
    { c: [0.013, 0.334, 0.424], r: [0.008, 0.006, 0.01], out: -0.006, sym: true },
    { c: [0, 0.335, 0.43], r: [0.005, 0.012, 0.01], out: -0.003 },
    { c: [0.026, 0.355, 0.41], r: [0.012, 0.016, 0.016], out: 0.004, sym: true },
  ]);
  // eyes: wet and brown, deep in the sockets; heavy upper lids sagging at the outer corners and swollen lower lids
  // leave a small, worried almond of eye
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(SQ_EYE, s), ax: V3 = [s * SQ_EYE_AX[0], SQ_EYE_AX[1], SQ_EYE_AX[2]];
    const e = body.add(paintedEye({ name: 'eye' + S, c, ax, r: EYE_R, bone: bi('eye' + S), iris: RP('fur'), pupil: 'round', pupilR: 0.42, irisA: 0.78, sclera: RP('paper'), side: s, k: 3.4 }));
    e.reg = REG.eye;
    body.add(almondLid({ name: 'lid' + S, c, ax, r: EYE_R, bone: bi('lid' + S), side: s, open: 0.46, w: 0.96, tilt: -0.14, peak: -0.35, thick: 0.36, root: 2.1, skin: { R: SKIN, step: 3.2, lash: RP('ink') } })).reg = REG.head;
    body.add(almondLid({ name: 'llid' + S, c, ax, r: EYE_R, bone: hb, side: s, lower: true, open: 0.36, w: 0.96, tilt: -0.14, thick: 0.5, root: 2.2, skin: { R: SKIN, step: 3.6, wet: RP('flesh') } })).reg = REG.head;
    // a tear drop (it slides down the cheek on its bone)
    const tc: V3 = [s * 0.047, 0.392, 0.402];
    body.add(sac({ name: 'tear' + S, at: tc, n: [s * 0.4, -0.1, 1], up: [0, 1, 0], r: [0.0065, 0.008, 0.0065], skin: () => [bi('tear' + S), 1], paint: dropPaint, sink: 0.2, levels: 1, k: 2.5 })).noOcc = true;
    // long leathery ear flaps from the sides of the head, hanging down past the jowls, cupped toward the head, rimmed
    const root: V3 = [s * 0.1, 0.442, 0.248];
    const path = curve([root, [s * 0.125, 0.442, 0.25], [s * 0.14, 0.405, 0.258], [s * 0.146, 0.335, 0.27], [s * 0.142, 0.26, 0.282], [s * 0.13, 0.215, 0.29]], 9);
    const earSkin = chainSkin([root, [s * 0.15, 0.35, 0.265], [s * 0.14, 0.2, 0.27]], [bi('ear' + S), bi('ear2' + S)], 0.4);
    const ef = flap({ name: 'ear' + S, path, face: [s, 0, 0.15], across: 7,
      w: (t) => 0.022 + 0.026 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) - (t > 0.85 ? (t - 0.85) * 0.1 : 0),
      cup: (t) => -0.016 * Math.sin(Math.min(1, t * 1.2) * Math.PI), th: (t) => 0.007 - t * 0.002, bend: (t) => 0.005 * Math.sin(t * 9),
      skin: (p) => (p[1] > 0.425 ? [hb, 0.6, bi('ear' + S), 0.4] : earSkin(p)), paint: (c, p, b) => skinPaint('ear', ef.inner)(c, p, b), levels: 1, k: 1.3 });
    body.add(ef).reg = REG.head;
  }
  yield 'head';
  // ---- stubby legs, the hide bunched round the ankles; the left feet webbed
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? SQ_LEGS.f : SQ_LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    const rings: LimbRing[] = legRings('bear', fore, L.r, [0, 0.5, 1], segL, PADH).map((r) => ({ ...r, r: r.r * (r.t < 0.3 ? 1.12 : r.t > 0.72 ? 1.16 : 1), crease: r.t > 0.72 ? 1 : r.crease, ink: r.ink || r.t > 0.72, b: r.t > 0.72 ? [...(r.b ?? []), [60, 0.1, 30], [-120, 0.08, 30]] as [number, number, number][] : r.b }));
    const foot: FootSpec = { pad: L.r * 0.85, h: PADH, fwd: 0.3, nail: 'nail', lobe: 0.2, toeAround: 6, web: s > 0 ? 0.75 : undefined,
      toes: [-40, -13, 13, 40].map((a) => ({ a, len: L.r * 0.45, r: L.r * 0.2, claw: L.r * 0.18, curl: 0.3, drop: 0.25 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 12, levels: 1, rise: 0.06,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: skinPaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
  }
  // a wrinkled stub of a tail
  body.add(stalk({ name: 'tail', path: curve([[0, 0.25, -0.3], [0, 0.255, -0.35], [0, 0.235, -0.385]], 5), r: (t) => 0.027 * (1 - t * 0.55) * (1 + 0.12 * Math.sin(t * 18)), around: 8, capS: false, capE: true, ringEvery: 1, levels: 1, k: 1, skin: () => [bi('tail'), 1], paint: skinPaint('tail') })).reg = REG.tail;
  yield 'legs';
  // ---- warts and moles standing off the hide (the painted ones are the small ones)
  const seats: { p: V3; n: V3; r: number; h: number }[] = [];
  const tg = torso.grids[0];
  for (let k = 0; k < 24; k++) {
    const u = h3(k, 1, 31), v = 0.12 + h3(k, 2, 31) * 0.8, q = gridSurf(torso.m, tg, u, v);
    if (q.n[1] < -0.4) continue;
    const r = 0.007 + h3(k, 3, 31) * 0.01;
    seats.push({ p: add(q.p, [q.n[0] * -0.002, q.n[1] * -0.002, q.n[2] * -0.002]), n: q.n, r, h: r * 0.8 });
  }
  const hg = head.grids[0];
  for (let k = 0; k < 12; k++) {
    const u = 0.22 + h3(k, 4, 37) * 0.56, v = 0.2 + h3(k, 5, 37) * 0.65, q = gridSurf(head.m, hg, u, v);
    if (Math.hypot(Math.abs(q.p[0]) - SQ_EYE[0], q.p[1] - SQ_EYE[1], q.p[2] - SQ_EYE[2]) < 0.055) continue;
    const r = 0.005 + h3(k, 6, 37) * 0.006;
    seats.push({ p: q.p, n: q.n, r, h: r * 0.9 });
  }
  body.add(bulbs({ name: 'warts', seats, skin: (p) => (p[2] > 0.2 && p[1] > 0.3 ? [hb, 1] : spineSkin(p)), paint: wartPaint, levels: 1, k: 1.4 })).reg = REG.torso;
  // ---- the puddle it melts into (scaled to nothing until then)
  body.add(stalk({ name: 'puddle', path: [[0, 0.0, -0.03], [0, 0.006, -0.03], [0, 0.009, -0.03]], up: [0, 0, 1], r: (t) => 0.34 * (1 - t * 0.12), around: 24,
    sec: (a) => 1 + 0.13 * Math.sin(a * 3 + 0.4) + 0.08 * Math.sin(a * 5 + 1.3) + 0.05 * Math.sin(a * 9), capS: false, capE: true, levels: 1, k: 0.5, skin: () => [bi('puddle'), 1], paint: puddlePaint })).noOcc = true;
  const out = yield* body.buildGen({ den: o.den ?? 380, maxScale: 2, budget: 26000 });
  return finishModel(body, out, bones);
}
export type { Piece };
