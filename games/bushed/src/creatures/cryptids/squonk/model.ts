// THE SQUONK (Cox 1910, Lacrimacorpus dissolvens: the hemlock forests of Pennsylvania; "the skin is ill-fitting,
// covered with warts and moles"; always weeping; cornered, it dissolves itself in tears; later tellings give it webbed
// toes on its left feet). This one: knee-high, pear-shaped, a hide two sizes too big that hangs in folds round its
// neck and sags in a heavy apron to the ground, stubby legs almost hidden under it; a big doleful head with long
// basset ears, a drooping bulb of a nose over a small down-turned mouth, heavy-lidded wet brown eyes with bags under
// them, tear tracks glistening down the cheeks, warts and moles everywhere, a few bristles growing out of the moles.
// It melts into a puddle of tears (the puddle is part of the model, on its own bone at the feet).
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, eyeball, eyelid, stalk, curve, chainSkin, sac, bulbs, gridSurf, Px, RP, h3, cl,
  type V3, type Station, type FootSpec, type LimbRing, type Piece,
} from '../../anatomy';
import { fbm3, nz2 } from '../../paintkit';
import { bonesKit, boneIndex, coat, solid, warts, wet, finishModel, REG, type ModelGen } from '../kit';
import type { BoneDef } from '../../rig';

export const SQUONK_MODEL_VERSION = 'squonk@4';
export const SQ_HEAD: V3 = [0, 0.37, 0.24];
export const SQ_EYE: V3 = [0.058, 0.42, 0.38];
export const SQ_EYE_AX: V3 = [0.36, 0.06, 0.93];
const SQ_LEGS = {
  f: { hip: [0.085, 0.19, 0.09] as V3, knee: [0.1, 0.1, 0.1] as V3, sole: [0.11, 0, 0.12] as V3, r: 0.042 },
  h: { hip: [0.1, 0.2, -0.17] as V3, knee: [0.115, 0.11, -0.13] as V3, sole: [0.12, 0, -0.18] as V3, r: 0.046 },
};
const PADH = 0.014;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function squonkBones(): BoneDef[] {
  const { b, A } = bonesKit();
  // the root sits on the ground (it rocks on its feet); the body hangs from 'body', which squashes to melt
  A('root', null, [0, 0, -0.03]);
  A('puddle', 'root', [0, 0.004, -0.03]);
  A('body', 'root', [0, 0.0, -0.04]);
  A('belly', 'body', [0, 0.2, -0.08]);
  A('chest', 'body', [0, 0.27, 0.1]);
  A('neck', 'chest', [0, 0.32, 0.18]);
  A('head', 'neck', SQ_HEAD);
  A('jaw', 'head', [0, 0.33, 0.33]);
  A('nose', 'head', [0, 0.375, 0.4]);
  A('mouthL', 'head', [0.032, 0.318, 0.385]); A('mouthR', 'head', [-0.032, 0.318, 0.385]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A('eye' + s, 'head', mir(SQ_EYE, k)); A('lid' + s, 'head', mir(SQ_EYE, k));
    A('ear' + s, 'head', [k * 0.1, 0.46, 0.25]); A('ear2' + s, 'ear' + s, [k * 0.155, 0.37, 0.26]);
    A('tear' + s, 'head', [k * 0.064, 0.387, 0.398]);
  }
  A('hips', 'body', [0, 0.24, -0.2]);
  A('tail', 'hips', [0, 0.25, -0.31]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const f = SQ_LEGS.f; A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k)); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const h = SQ_LEGS.h; A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k)); }
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const SKIN = RP('hide'), SKIN2 = RP('stone'), PALE = RP('coral'), WART = RP('soil'), MOLE = RP('horn'), TEAR = RP('water');
/** the ill-fitting hide: a dusky mauve-grey, mottled and blotched, darker in every fold, paler and pinker on the
 *  belly and the inside of the ears; warts and moles drawn over it */
function skinPaint(part: 'body' | 'head' | 'leg' | 'ear') {
  return coat({
    lightK: 0.85,
    texel: (px, i, x, y, z, nx, ny) => {
      const m = fbm3(x * 9, y * 9, z * 9, 3), blot = fbm3(x * 14 + 5, y * 14, z * 14, 2);
      // a dusky mauve-grey going stony grey in patches, liver spots, a pinker underside and inner ears
      let R = fbm3(x * 4 + 2, y * 4, z * 4, 2) > 0.42 ? SKIN2 : SKIN, st = (R === SKIN2 ? 4.2 : 3.6) + m * 0.7;
      if (blot > 0.32) st -= 0.8 + (blot - 0.32) * 2;
      if (ny < -0.4) { R = SKIN; st = 4.3 + m * 0.5; }
      if (part === 'ear' && nx * Math.sign(x) < -0.3) { R = SKIN; st = 4.8 + m * 0.5 - (Math.abs(Math.sin(y * 160)) < 0.15 ? 0.9 : 0); }
      // the folds: the hide hangs in loose rings round the neck and in long creases down the sagging sides
      if (part === 'body') {
        const ring = Math.abs(Math.sin(z * 70 + nz2(x * 12, y * 12) * 1.6));
        if (z > 0.08 && ring < 0.18) st -= 1.3; else if (z > 0.08 && ring < 0.32) st += 0.4;
        const sag = Math.abs(Math.sin(y * 55 + z * 6 + nz2(x * 9, z * 9) * 1.4));
        if (z < 0.08 && y < 0.24 && sag < 0.14) st -= 1.1;
      }
      if (part === 'head') {
        const hx = x - SQ_HEAD[0], hy = y - SQ_HEAD[1], hz = z - SQ_HEAD[2], ax = Math.abs(hx);
        // furrows across the brow (it is always worried), jowl folds, bags under the eyes
        if (hy > 0.045 && hz > 0.04 && Math.abs(Math.sin(hy * 160 + ax * 30)) < 0.17) st -= 1.0;
        const ed = Math.hypot(ax - (SQ_EYE[0] - SQ_HEAD[0]), hy - (SQ_EYE[1] - SQ_HEAD[1]) + 0.022, hz - (SQ_EYE[2] - SQ_HEAD[2]));
        if (ed < 0.034 && hy < SQ_EYE[1] - SQ_HEAD[1] - 0.02) st -= Math.abs(Math.sin(ed * 260)) < 0.3 ? 1.2 : 0.3;
        if (hy < -0.03 && hz > 0.05 && Math.abs(Math.sin(ax * 140 + hy * 40)) < 0.14) st -= 0.9;
        // the mouth: a small down-turned line under the nose with a darker lower lip
        const mz = hz - 0.145, ml = hy + 0.052 + ax * ax * 9 - ax * 0.15;
        if (mz > -0.02 && ax < 0.045 && Math.abs(ml) < px.mpt * 1.3 && N_FACE(nx, ny)) { px.put(i, RP('gum'), 0.6); px.rough[i] = 90; return 0; }
        if (mz > -0.02 && ax < 0.04 && ml < 0 && ml > -0.008) { R = PALE; st = 2.2; }
      }
      px.put(i, R, st); px.rough[i] = 175;
      return 0;
    },
    ink: [1.2, 1.3, 0.6],
    after: (px) => {
      px.pebbles(0.011, { depth: 0.25, seed: 12 });
      warts(px, 0.03, 0.22, () => 1, 21);
      // tear tracks: wet, glistening streaks from the inner corners of the eyes down the cheeks
      if (part === 'head') {
        const P = px.gb.P;
        const track = (i: number) => {
          const x = Math.abs(P[i * 3]), y = P[i * 3 + 1], z = P[i * 3 + 2];
          const t = cl((SQ_EYE[1] - 0.02 - y) / 0.09, 0, 1), cx = SQ_EYE[0] - 0.012 + t * 0.022 + Math.sin(t * 7) * 0.004;
          return y < SQ_EYE[1] - 0.015 && y > SQ_EYE[1] - 0.12 && z > 0.28 && Math.abs(x - cx) < 0.0065 + t * 0.003 ? 1 : 0;
        };
        for (let i = 0; i < px.n; i++) if (track(i)) { px.mark[i] += 0.7; px.rampI[i] = px.ramp(SKIN2); }
        wet(px, track, TEAR, 2.5);
      }
    },
  });
}
const N_FACE = (_nx: number, _ny: number) => true;
const wartPaint = coat({ lightK: 0.7, texel: (px, i, x, y, z, _nx, ny) => { const mole = h3(Math.floor(x * 300), Math.floor(z * 300), 3) < 0.3; px.put(i, mole ? MOLE : WART, (mole ? 2 : 3) + (ny > 0.3 ? 1 : 0) + fbm3(x * 200, y * 200, z * 200, 2) * 0.6); px.rough[i] = 150; return 0; }, ink: [1, 1, 0.8] });
const lidPaint = coat({ lightK: 0.7, texel: (px, i, x, y, z) => { px.put(i, SKIN, 2.6 + fbm3(x * 60, y * 60, z * 60, 2) * 0.6 - (Math.abs(Math.sin(y * 900)) < 0.2 ? 0.8 : 0)); px.rough[i] = 150; return 0; }, ink: [1, 1.2, 0.8] });
const nosePaint = coat({ lightK: 0.6, texel: (px, i, x, y, z) => {
  // a drooping, veined bulb of a nose in the same dusky hide, flushed at the tip from all the crying, two nostrils
  // under it, wet
  const ax = Math.abs(x), nd = Math.hypot(ax - 0.013, (y - 0.345) * 1.2, z - 0.425);
  if (nd < 0.008) { px.put(i, RP('ink'), 1); px.rough[i] = 60; return 0; }
  const tip = cl((z - 0.405) * 40, 0, 1), vein = Math.abs(Math.sin(x * 400 + Math.sin(y * 300) * 2)) < 0.08;
  px.put(i, tip > 0.85 && y < 0.345 ? PALE : SKIN, 4.0 + fbm3(x * 80, y * 80, z * 80, 2) * 0.6 + (nd < 0.013 ? 0.6 : 0) - (vein ? 0.8 : 0)); px.rough[i] = 80; return 0;
}, ink: [1.1, 1, 0.8], after: (px) => wet(px, () => 0.8, SKIN, 1.2) });
const dropPaint = solid(TEAR, (_x, _y, _z, ny) => 5 + (ny > 0.2 ? 1 : 0), 10, [2, 0, 0]);
const puddlePaint = coat({ lightK: 0.3, texel: (px, i, x, y, z) => {
  // tears: dark clear water over the moss, rings where the drops fell, a wet rim
  const r = Math.hypot(x - 0, z + 0.03), ring = Math.abs(Math.sin(r * 120 + fbm3(x * 20, 1, z * 20, 2) * 3)) < 0.1;
  px.put(i, TEAR, 0.8 + (ring ? 1.1 : 0) + fbm3(x * 30, y, z * 30, 2) * 0.5 + (r > 0.3 ? 0.8 : 0)); px.rough[i] = 10; return 0;
}, ink: [3, 0, 0], after: (px) => wet(px, () => 1, TEAR, 3) });
const clawPaint = solid(RP('bone'), (x, y, z, ny) => 2.8 + (ny > 0.3 ? 0.6 : 0) + fbm3(x * 90, y * 90, z * 90, 2) * 0.5, 120);

// ------------------------------------------------------------------------------------------------ the build
export function* squonkModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = squonkBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1910;
  const J: V3[] = [[0, 0.25, -0.34], [0, 0.24, -0.2], [0, 0.23, -0.04], [0, 0.27, 0.1], [0, 0.32, 0.18], [0, 0.37, 0.25]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('belly'), bi('chest'), bi('neck'), bi('head')], 0.4);
  // ---- the body: a heavy apron of hide sagging to the ground, loose rings of skin round a thin neck
  const st: Station[] = [
    { c: [0, 0.26, -0.33], s: [0.05, 0.05], p: 'round' },
    { c: [0, 0.26, -0.29], s: [0.13, 0.13], p: 'round' },
    { c: [0, 0.25, -0.22], s: [0.2, 0.19], p: 'sag', tw: [[5, 0.08, -0.06], [6, 0.05, -0.04]] },
    { c: [0, 0.24, -0.12], s: [0.225, 0.2], p: 'sag', tw: [[5, 0.1, -0.08], [6, 0.06, -0.05]] },
    { c: [0, 0.245, -0.01], s: [0.205, 0.19], p: 'sag', tw: [[5, 0.08, -0.06]] },
    { c: [0, 0.265, 0.08], s: [0.165, 0.16], p: 'barrel' },
    { c: [0, 0.29, 0.14], s: [0.13, 0.135], p: 'neck' },
    { c: [0, 0.315, 0.18], s: [0.118, 0.12], p: 'neck' },
    { c: [0, 0.33, 0.21], s: [0.1, 0.1], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 1, levels: 1,
    rings: [{ at: 6, s: 1, ink: true }, { at: 7, s: 1, ink: true }, { at: 5, s: 0.5, ink: true }],
    skin: (p) => { const w = spineSkin(p); return p[1] < 0.16 && p[2] < 0.06 ? [w[0], (w[1] ?? 1) * 0.5, bi('belly'), 0.5] : w; }, paint: skinPaint('body') }));
  torso.reg = REG.torso;
  body.finalize(torso);
  yield 'trunk';
  // ---- the head: a big droopy dome, jowls hanging past the jaw, a short muzzle
  const H = SQ_HEAD, hb = bi('head');
  const hs = (z: number, dy: number, w: number, h: number, p: string | number[][], tw?: [number, number, number][]): Station => ({ c: [0, H[1] + dy, H[2] + z], s: [w, h], p, tw });
  const head = body.add(trunk({ name: 'skull', stations: [
    hs(-0.045, -0.01, 0.085, 0.085, 'round'),
    hs(-0.005, 0.005, 0.122, 0.118, 'round'),
    hs(0.045, 0.012, 0.135, 0.126, 'sag', [[6, 0.06, -0.06], [7, 0.04, -0.05]]),
    hs(0.095, 0.005, 0.13, 0.12, 'sag', [[6, 0.08, -0.08], [7, 0.05, -0.06]]),
    hs(0.135, -0.008, 0.1, 0.095, 'sag', [[6, 0.06, -0.04]]),
    hs(0.162, -0.018, 0.068, 0.07, 'round'),
    hs(0.178, -0.022, 0.034, 0.036, 'round'),
  ], tween: 1, capS: true, capE: true, k: 2.2, levels: 2,
    skin: (p) => {
      if (p[2] < H[2] - 0.03) return [hb, 0.6, bi('neck'), 0.4];
      // the mouth corners ride their bones (a frown, or once in a long while a smile)
      for (const [b, sx] of [['mouthL', 1], ['mouthR', -1]] as const) { const d = Math.hypot(p[0] - sx * 0.032, p[1] - 0.318, p[2] - 0.385); if (d < 0.04) { const k = cl(1 - d / 0.04, 0, 1) * 0.9; return [hb, 1 - k, bi(b), k]; } }
      return [hb, 1];
    }, paint: skinPaint('head') }));
  head.reg = REG.head;
  body.finalize(head);
  // the chin: a small soft lower jaw under the muzzle
  const jaw = body.add(trunk({ name: 'jaw', stations: [
    { c: [0, 0.322, 0.305], s: [0.06, 0.03], p: 'round' }, { c: [0, 0.315, 0.345], s: [0.055, 0.028], p: 'round' }, { c: [0, 0.31, 0.375], s: [0.04, 0.022], p: 'round' }, { c: [0, 0.31, 0.39], s: [0.018, 0.012], p: 'round' },
  ], tween: 0, capS: true, capE: true, k: 1.6, levels: 1, skin: () => [bi('jaw'), 1], paint: skinPaint('head') }));
  jaw.reg = REG.jaw;
  // the nose: a drooping pink bulb over the mouth
  const nose = body.add(sac({ name: 'nose', at: [0, 0.37, 0.4], n: [0, -0.85, 0.6], up: [0, 0, 1], r: [0.024, 0.02, 0.034], skin: () => [bi('nose'), 1], paint: nosePaint, sink: 0.25, levels: 2, k: 2 }));
  nose.reg = REG.head;
  // eyes: wet and brown, heavy upper lids, puffy lower lids
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(SQ_EYE, s), ax: V3 = [s * SQ_EYE_AX[0], SQ_EYE_AX[1], SQ_EYE_AX[2]];
    const e = body.add(eyeball({ name: 'eye' + S, c, ax, r: 0.035, bone: bi('eye' + S), iris: RP('fur'), pupil: 'round', pupilR: 0.5, irisA: 0.7, sclera: RP('paper'), k: 3.4, levels: 1, around: 12, catchlight: { side: s, at: [0.35, 0.45] } }));
    e.reg = REG.eye;
    body.add(eyelid({ name: 'lid' + S, c, ax, r: 0.035, bone: bi('lid' + S), paint: lidPaint, cover: 0.7, root: 2.3 })).reg = REG.head;
    body.add(eyelid({ name: 'llid' + S, c, ax, r: 0.035, bone: hb, paint: lidPaint, lower: true, cover: 1.35, root: 2.3 })).reg = REG.head;
    // a tear drop (it slides down the cheek on its bone)
    const tc: V3 = [s * 0.064, 0.387, 0.398];
    body.add(sac({ name: 'tear' + S, at: tc, n: [s * 0.4, -0.1, 1], up: [0, 1, 0], r: [0.0065, 0.008, 0.0065], skin: () => [bi('tear' + S), 1], paint: dropPaint, sink: 0.2, levels: 1, k: 2.5 })).noOcc = true;
    // long basset ears hanging from the sides of the head: flat, thick-edged, curled a little at the tips
    const root: V3 = [s * 0.1, 0.46, 0.25];
    const path = curve([root, [s * 0.135, 0.455, 0.252], [s * 0.152, 0.41, 0.258], [s * 0.158, 0.33, 0.266], [s * 0.152, 0.25, 0.27]], 7);
    const earSkin = chainSkin([root, [s * 0.155, 0.37, 0.26], [s * 0.15, 0.22, 0.27]], [bi('ear' + S), bi('ear2' + S)], 0.4);
    const ear = body.add(stalk({ name: 'ear' + S, path, r: (t) => 0.05 * (t < 0.15 ? 0.6 + t * 2.6 : 1 - (t - 0.15) * 0.3), around: 12, up: [0, 0, 1],
      sec: (a) => 1 / Math.sqrt((Math.sin(a) / 0.3) ** 2 + Math.cos(a) ** 2), capS: true, capE: true, levels: 1, k: 1.3, skin: (p) => (p[1] > 0.43 ? [hb, 0.6, bi('ear' + S), 0.4] : earSkin(p)), paint: skinPaint('ear') }));
    ear.reg = REG.head;
  }
  yield 'head';
  // ---- stubby legs, the left feet webbed
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? SQ_LEGS.f : SQ_LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    const rings: LimbRing[] = legRings('bear', fore, L.r, [0, 0.5, 1], segL, PADH).map((r) => ({ ...r, r: r.r * (r.t < 0.3 ? 1.1 : 1) }));
    const foot: FootSpec = { pad: L.r * 0.85, h: PADH, fwd: 0.3, nail: 'nail', lobe: 0.2, toeAround: 6, web: s > 0 ? 0.75 : undefined,
      toes: [-40, -13, 13, 40].map((a) => ({ a, len: L.r * 0.45, r: L.r * 0.2, claw: L.r * 0.18, curl: 0.3, drop: 0.25 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 10, levels: 1, rise: 0.06,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: skinPaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
  }
  // a stub of a tail
  body.add(stalk({ name: 'tail', path: curve([[0, 0.26, -0.3], [0, 0.27, -0.35], [0, 0.25, -0.38]], 4), r: (t) => 0.025 * (1 - t * 0.6), around: 8, capS: false, capE: true, levels: 1, k: 1, skin: () => [bi('tail'), 1], paint: skinPaint('leg') })).reg = REG.tail;
  yield 'legs';
  // ---- warts and moles standing off the hide (the painted ones are the small ones)
  const seats: { p: V3; n: V3; r: number; h: number }[] = [];
  const tg = torso.grids[0];
  for (let k = 0; k < 26; k++) {
    const u = h3(k, 1, 31), v = 0.12 + h3(k, 2, 31) * 0.8, q = gridSurf(torso.m, tg, u, v);
    if (q.n[1] < -0.5) continue;
    const r = 0.007 + h3(k, 3, 31) * 0.011;
    seats.push({ p: add(q.p, [q.n[0] * -0.002, q.n[1] * -0.002, q.n[2] * -0.002]), n: q.n, r, h: r * 0.8 });
  }
  const hg = head.grids[0];
  for (let k = 0; k < 12; k++) {
    const u = 0.25 + h3(k, 4, 37) * 0.5, v = 0.2 + h3(k, 5, 37) * 0.65, q = gridSurf(head.m, hg, u, v);
    if (Math.hypot(Math.abs(q.p[0]) - SQ_EYE[0], q.p[1] - SQ_EYE[1], q.p[2] - SQ_EYE[2]) < 0.05) continue;
    const r = 0.005 + h3(k, 6, 37) * 0.007;
    seats.push({ p: q.p, n: q.n, r, h: r * 0.9 });
  }
  body.add(bulbs({ name: 'warts', seats, skin: (p) => (p[2] > 0.2 && p[1] > 0.3 ? [hb, 1] : spineSkin(p)), paint: wartPaint, levels: 1, k: 1.4 })).reg = REG.torso;
  // ---- the puddle it melts into (scaled to nothing until then)
  body.add(stalk({ name: 'puddle', path: [[0, 0.0, -0.03], [0, 0.006, -0.03], [0, 0.009, -0.03]], up: [0, 0, 1], r: (t) => 0.34 * (1 - t * 0.12), around: 24,
    sec: (a) => 1 + 0.13 * Math.sin(a * 3 + 0.4) + 0.08 * Math.sin(a * 5 + 1.3) + 0.05 * Math.sin(a * 9), capS: false, capE: true, levels: 1, k: 0.5, skin: () => [bi('puddle'), 1], paint: puddlePaint })).noOcc = true;
  const out = yield* body.buildGen({ den: o.den ?? 360, maxScale: 2, budget: 15000 });
  return finishModel(body, out, bones);
}
void nrm;
export type { Piece };
