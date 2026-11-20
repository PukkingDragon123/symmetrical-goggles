// THE SNOW WASSET (Cox 1910: a large weasel-like beast of the northern Canadian woods that winters under the snow,
// its legs shrinking to mere stubs as it "swims" through the drifts, white in winter and brown in summer, bursting
// up through the crust to seize its prey). This one: as long as a man is tall from nose to tail tip but barely
// knee-high, built like a stretched otter: the back arched over powerful haunches, a deep chest behind the shoulder
// blades, a thick muscular neck as wide as the head, a small flat head with a short blunt muzzle (whisker pads, a pink
// nose, long whiskers), round cupped ears, small bright black eyes; short legs on broad clawed paws with dark pads; a
// long tail tapering to a black tip like an ermine's. Its winter coat: snow white with cool blue shadows between the
// locks, warm cream on the throat, the chest and the cheeks, a buttery wash over the crown and a few ginger flecks
// left down the spine from its summer coat. It dives into the ground and pops up somewhere else.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, paintedEye, lids, lidPaint, stalk, curve, chainSkin, RP, h3, cl,
  type V3, type Station, type FootSpec, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { furZones } from '../../fur';
import { bonesKit, boneIndex, finishModel, REG, type ModelGen } from '../kit';
import { ring, displace, carve, ridge, flap, brush, bone, gs, sm, add, nrm } from '../sculpt';
import type { BoneDef } from '../../rig';

export const WASSET_MODEL_VERSION = 'wasset@5';
export const WS_HEAD: V3 = [0, 0.25, 0.5];
/** the eye (head-local SOCK) */
export const WS_EYE: V3 = [0.035, 0.271, 0.547];
export const WS_EYE_AX: V3 = [0.62, 0.2, 0.76];
/** the eye is a small dark bead (a real animal's eye): its radius and centre, in the old eye's socket */
const BEAD_R = 0.0078, WS_BEAD: V3 = WS_EYE.map((v, i) => v + WS_EYE_AX[i] * (0.0105 - BEAD_R) * 1.2 / Math.hypot(...WS_EYE_AX)) as V3;
const SOCK: V3 = [0.035, 0.021, 0.047], SOCK_AX: V3 = nrm([0.62, 0.2, 0.76]);
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
/** which way the hair lies (creature space): the shell fur's comb, so the painted locks and the shells agree */
const COMB: V3 = [0, -0.45, -0.6], HEADCOMB: V3 = [0, -0.25, -1];

export function wassetBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('root', null, SPINE[2]);
  A('back', 'root', SPINE[1]);
  A('hips', 'back', SPINE[0]);
  A('chest', 'root', SPINE[3]);
  A('neck', 'chest', SPINE[4]);
  A('neck2', 'neck', SPINE[5]);
  A('head', 'neck2', WS_HEAD);
  A('jaw', 'head', [0, 0.233, 0.535]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(WS_BEAD, k)); A('ear' + s, 'head', [k * 0.043, 0.284, 0.494]); }
  for (let k = 0; k < 4; k++) A('tail' + k, k === 0 ? 'hips' : 'tail' + (k - 1), TAIL[k]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const f = LEGS.f; A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k)); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { const h = LEGS.h; A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k)); }
  return b;
}

// ------------------------------------------------------------------------------------------------ the shapes
/** tail root to the back of the skull (profile top = the back): the haunches, the arched loin, the deep chest, the
 *  shoulder blades, a thick neck */
const BODY: Station[] = [
  { c: [0, 0.168, -0.475], s: [0.034, 0.034], p: ring() },
  { c: [0, 0.172, -0.425], s: [0.068, 0.066], p: ring([[100, 0.05, 30]]) },
  { c: [0, 0.18, -0.345], s: [0.088, 0.082], p: ring([[62, 0.13, 26], [150, -0.08, 26]]) },        // the haunches
  { c: [0, 0.194, -0.245], s: [0.076, 0.08], p: ring([[0, 0.05, 16], [150, -0.12, 30]]) },         // the arched loin, the tucked flank
  { c: [0, 0.197, -0.125], s: [0.078, 0.084], p: ring([[150, -0.05, 30]]) },
  { c: [0, 0.193, 0.0], s: [0.088, 0.092], p: ring([[165, 0.07, 30]]) },                          // the deep chest
  { c: [0, 0.19, 0.1], s: [0.091, 0.095], p: ring([[170, 0.09, 25]]) },
  { c: [0, 0.193, 0.188], s: [0.088, 0.088], p: ring([[55, 0.11, 24], [108, 0.08, 20]]) },          // the shoulder blades, the point of the shoulder
  { c: [0, 0.206, 0.27], s: [0.068, 0.07], p: ring([[150, 0.06, 25]]) },
  { c: [0, 0.222, 0.35], s: [0.057, 0.058], p: ring([[150, 0.04, 25]]) },
  { c: [0, 0.237, 0.42], s: [0.05, 0.05], p: ring() },
  { c: [0, 0.245, 0.462], s: [0.044, 0.045], p: ring() },
];
/** the head (head-local, along z): a flat crown, broad cheeks, a short blunt muzzle on puffed whisker pads */
const HS: [number, number, number, number, number[][]][] = [
  [-0.052, 0.0, 0.036, 0.036, ring()],
  [-0.022, 0.008, 0.05, 0.045, ring([], { sq: 0.3 })],
  [0.012, 0.012, 0.057, 0.044, ring([[100, 0.06, 18]], { sq: 0.4 })],
  [0.042, 0.01, 0.053, 0.04, ring([[52, -0.06, 14], [110, 0.06, 18]], { sq: 0.3 })],
  [0.066, 0.002, 0.042, 0.033, ring([[0, -0.04, 18]], { sq: 0.3 })],
  [0.086, -0.006, 0.033, 0.027, ring([[115, 0.16, 28]], { sq: 0.3 })],                              // the whisker pads
  [0.101, -0.01, 0.024, 0.02, ring([[115, 0.12, 26]])],
  [0.111, -0.011, 0.019, 0.014, ring([[115, 0.1, 26]], { sq: 0.5 })],
  [0.116, -0.011, 0.012, 0.009, ring([], { sq: 0.6 })],
];
const JS: [number, number, number, number][] = [[0.03, -0.022, 0.034, 0.014], [0.06, -0.026, 0.028, 0.012], [0.085, -0.027, 0.02, 0.01], [0.1, -0.026, 0.012, 0.008], [0.106, -0.025, 0.005, 0.004]];
const JAWP = [[0, 0.5], [0.35, 0.62], [0.7, 0.78], [0.96, 0.5], [1, 0.0], [0.92, -0.45], [0.7, -0.8], [0.36, -0.97], [0, -1]];

// ------------------------------------------------------------------------------------------------ paint
const WHITE = RP('snow'), CREAM = RP('paper'), WARM = RP('ochre'), DARK = RP('squatch'), PINK = RP('hide'), INK = RP('ink'), PAD = RP('horn');
const hl = (x: number, y: number, z: number): V3 => [x - WS_HEAD[0], y - WS_HEAD[1], z - WS_HEAD[2]];
/** the winter coat: white locks laid on along the body with cool blue shadow between them, a warm cream bib from the
 *  chin down the throat and chest to the belly, a buttery wash on the crown and down the spine with a few ginger
 *  flecks of the summer coat left in it, the tail's black tip */
const coatPaint = (part: 'body' | 'leg' | 'tail' | 'head' | 'ear') => brush({
  light: 2.4,
  skin: { len: 0.016, wid: 0.004, amp: 0.4, seed: 31 },
  fur: { len: part === 'tail' ? 0.05 : 0.038, wid: 0.007, flow: part === 'head' ? HEADCOMB : COMB, amp: 0.7, tip: 0.9, root: 1.1, seed: part === 'head' ? 37 : 33 },
  texel: (px, i, x, y, z, nx, ny, nz, s) => {
    const fv = s.fv * 0.35;
    if (part === 'tail') {
      const t = cl((-z - 0.44) / 0.6, 0, 1);
      if (t + fv * 0.3 > 0.76) { px.put(i, DARK, 1.6 + (ny > 0.3 ? 0.4 : 0)); px.rough[i] = 240; return 1; }
      if (ny > 0.35 && t < 0.5 && s.fid < 0.18) { px.put(i, WARM, 4.4); px.rough[i] = 240; return 1; }
      px.put(i, WHITE, 3.6); px.rough[i] = 240; return 1;
    }
    if (part === 'ear') {
      const bowl = nx * Math.sign(x || 1) < 0.25 && nz > -0.3;
      if (bowl) { px.put(i, PINK, 3.2); px.rough[i] = 150; return 0; }
      px.put(i, WHITE, 3.6); px.rough[i] = 240; return 0.6;
    }
    if (part === 'leg') {
      // white to the paws, the toes' undersides dark pads
      if (y < 0.012 && ny < -0.3) { px.put(i, PAD, 2.2); px.rough[i] = 120; return 0; }
      px.put(i, ny < -0.2 + fv ? CREAM : WHITE, ny < -0.2 + fv ? 4.2 : 3.5); px.rough[i] = 240; return 1;
    }
    if (part === 'head') {
      const [hx, hy, hz] = hl(x, y, z), ax = Math.abs(hx);
      // the nose: a pink rhinarium, two dark nostril commas, a wet glint
      // the nose: a small flat triangle of dusky pink set between the pads, two comma nostrils, the lip split below it
      if (hz > 0.105 && nz > 0.3) {
        const tri = hy < -0.003 && hy > -0.015 && ax < (hy + 0.015) * 0.8;
        const comma = Math.hypot(ax - 0.0045, hy + 0.0068) < 0.0017 || (hy < -0.0068 && hy > -0.0098 && Math.abs(ax - (0.0058 + (-0.0068 - hy) * 0.5)) < 0.0008);
        if (tri) { px.put(i, comma ? INK : PINK, comma ? 1 : 4.0 + (hy > -0.007 ? 0.5 : 0)); px.rough[i] = 50; return 0; }
        if (ax < 0.0009 && hy <= -0.015 && hy > -0.021) { px.put(i, INK, 1.2); px.rough[i] = 100; return 0; }
      }
      // the mouth line and the lips
      if (Math.abs(hy + 0.019 - Math.max(0, hz - 0.09) * 0.2) < 0.0022 && hz > 0.05 && ny < 0.3) { px.put(i, INK, 1.2); px.rough[i] = 100; return 0; }
      // a dark ring round the eye (the lids' rim), whisker dots in rows on the pads
      const d = [ax - SOCK[0], hy - SOCK[1], hz - SOCK[2]], a = d[0] * SOCK_AX[0] + d[1] * SOCK_AX[1] + d[2] * SOCK_AX[2];
      const rho = Math.hypot(d[0] - SOCK_AX[0] * a, d[1] - SOCK_AX[1] * a, d[2] - SOCK_AX[2] * a);
      if (rho < 0.0135 && a > -0.004) { px.put(i, INK, 1.4); px.rough[i] = 120; return 0; }
      if (hz > 0.078 && hz < 0.104 && hy < 0.0 && ax > 0.012 && h3(Math.floor(hx * 260), Math.floor(hy * 260), Math.floor(hz * 260)) < 0.1) { px.put(i, WHITE, 1.4); px.rough[i] = 200; return 0.3; }
      // the bib and the cheeks warm cream; the crown a buttery wash; the rest white
      const bib = sm(-0.35, 0.1, -ny) * sm(0.0, 0.08, hz + 0.06);
      if (bib + fv > 0.55) { px.put(i, CREAM, 4.3); px.rough[i] = 240; return hz > 0.075 ? 0.35 : 0.8; }
      if (ny > 0.55 && hz < 0.06 && s.fid < 0.55) { px.put(i, WARM, 5.2); px.rough[i] = 240; return 0.8; }
      px.put(i, WHITE, 3.7); px.rough[i] = 240; return hz > 0.075 ? 0.35 : 0.8;
    }
    // the body: the cream bib down the throat, the chest and the belly; a warm wash and ginger flecks down the spine
    const bib = sm(-0.15, 0.4, -ny) * (z > -0.4 ? 1 : 0);
    if (bib + fv > 0.5) { px.put(i, CREAM, 4.1); px.rough[i] = 240; return 1; }
    const spine = sm(0.55, 0.9, ny) * (z > -0.42 && z < 0.4 ? 1 : 0);
    if (spine > 0.3 && s.fid < 0.1 + spine * 0.12) { px.put(i, WARM, 4.6 + (s.fid < 0.04 ? -0.8 : 0)); px.rough[i] = 240; return 1; }
    px.put(i, WHITE, 3.6); px.rough[i] = 240;
    return 1;
  },
});
const clawPaint = bone(RP('horn'), { root: 1.6, tipStep: 5, rough: 90 });
const whiskerPaint = bone(RP('paper'), { root: 2.5, tipStep: 5.5, rough: 90 });

// ------------------------------------------------------------------------------------------------ the build
export function* wassetModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = wassetBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1910;
  const spineSkin = chainSkin(SPINE, [bi('hips'), bi('back'), bi('root'), bi('chest'), bi('neck'), bi('neck2')], 0.4);
  const torso = body.add(trunk({ name: 'trunk', stations: BODY, tween: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: coatPaint('body') }));
  torso.reg = REG.torso;
  // the spine's knuckles faint under the coat, the blades' edges, the haunch's sweep
  displace(body, torso, (p, n) => {
    const [x, y, z] = p, sx = x >= 0 ? 1 : -1;
    let d = ridge([[sx * 0.05, 0.27, 0.15], [sx * 0.062, 0.268, 0.22]], p, 0.02, 0.004);
    d += ridge([[sx * 0.06, 0.24, -0.38], [sx * 0.085, 0.2, -0.31], [sx * 0.086, 0.15, -0.28]], p, 0.025, 0.004);
    if (n[1] > 0.6) d += 0.002 * gs(Math.abs(x), 0, 0.01) * Math.max(0, Math.sin((z + 0.5) * 120));
    void y;
    return d;
  });
  yield 'trunk';
  // ---- the head
  const H = WS_HEAD, hb = bi('head');
  const skull = body.add(trunk({ name: 'skull', stations: HS.map(([z, cy, w, h, p]) => ({ c: [0, H[1] + cy, H[2] + z], s: [w, h], p })), tween: 0, capS: true, capE: true, k: 2.6, levels: 2,
    skin: (p) => (p[2] < H[2] - 0.025 ? [hb, 0.6, bi('neck2'), 0.4] : [hb, 1]), paint: coatPaint('head') }));
  skull.reg = REG.head;
  for (const s of [1, -1]) carve(body, skull, add(H, [s * SOCK[0], SOCK[1], SOCK[2]]), [s * SOCK_AX[0], SOCK_AX[1], SOCK_AX[2]], 0.016, 0.002, 0.006);
  displace(body, skull, (p) => {
    const [x, y, z] = [p[0] - H[0], p[1] - H[1], p[2] - H[2]], q: V3 = [Math.abs(x), y, z];
    let d = ridge([[0.022, 0.034, 0.05], [0.036, 0.036, 0.048], [0.048, 0.03, 0.04]], q, 0.008, 0.003);   // a soft brow over each eye
    d += 0.0048 * gs(Math.hypot(q[0] - 0.012, (y + 0.011) * 0.9, z - 0.098), 0, 0.0055);                 // two puffy whisker pads
    d -= 0.0026 * gs(q[0], 0, 0.0022) * sm(-0.008, -0.012, y) * sm(0.092, 0.104, z);                         // the split between them
    d += 0.0012 * (y < -0.003 && y > -0.015 && q[0] < (y + 0.015) * 0.8 && z > 0.11 ? 1 : 0);                 // the nose pad
    d -= 0.002 * gs(Math.hypot(q[0], y - 0.02, z - 0.07), 0, 0.012);                                        // the stop
    return d;
  });
  body.add(trunk({ name: 'jaw', stations: JS.map(([z, cy, w, h]) => ({ c: [0, H[1] + cy, H[2] + z], s: [w, h], p: JAWP })), tween: [1, 1, 1, 0], capS: true, capE: true, k: 2, levels: 1, skin: () => [bi('jaw'), 1], paint: coatPaint('head') })).reg = REG.jaw;
  // little needle teeth at the front of the jaw (for the bootlaces)
  for (const s of [1, -1]) body.add(stalk({ name: 'fang' + s, path: [add(H, [s * 0.009, -0.006, 0.098]), add(H, [s * 0.009, -0.012, 0.1]), add(H, [s * 0.0095, -0.021, 0.102])], r: (t) => 0.0025 * (1 - t * 0.85), around: 4, capS: true, capE: true, levels: 0, k: 1.2, skin: () => [hb, 1], paint: bone(RP('bone'), { root: 3, tipStep: 5.5, rough: 70 }) })).reg = REG.mouth;
  // bright eyes under soft lids, round cupped ears, whiskers off the pads
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(WS_BEAD, s), ax: V3 = [s * WS_EYE_AX[0], WS_EYE_AX[1], WS_EYE_AX[2]];
    body.add(paintedEye({ name: 'eye' + S, c, ax, r: BEAD_R, bone: bi('eye' + S), iris: RP('soil'), pupil: 'round', bead: true, side: s, k: 3.6 })).reg = REG.eye;
    for (const l of lids({ name: 'lid' + S, c, ax, r: BEAD_R, bone: hb, lowBone: hb, upper: 0.78, lower: 0.92, side: s, thick: 0.18, paint: lidPaint(INK, 1.4, { c, ax, r: BEAD_R }) })) body.add(l).reg = REG.head;
    const er: V3 = add(H, [s * 0.04, 0.03, -0.006]);
    body.add(flap({ name: 'ear' + S, path: curve([add(er, [-s * 0.006, -0.008, 0.002]), er, add(er, [s * 0.008, 0.012, -0.004]), add(er, [s * 0.012, 0.02, -0.006])], 5), front: nrm([s * 0.35, 0.2, 1]),
      w: (t) => 0.036 * Math.sqrt(Math.max(0.02, Math.sin(Math.min(1, 0.35 + t * 0.65) * Math.PI))) + 0.003, cup: (t) => 0.007 * (1 - t * 0.5), thick: 0.004, rim: 1.8, skin: () => [bi('ear' + S), 1], paint: coatPaint('ear'), levels: 1, k: 1.6 })).reg = REG.head;
    for (let k = 0; k < 5; k++) {
      const b0: V3 = add(H, [s * 0.016, -0.005 - k * 0.0028, 0.094 - k * 0.003]), d = nrm([s * (1 - k * 0.08), 0.06 - k * 0.1, -0.3 + k * 0.03]);
      body.add(stalk({ name: 'whisk' + S + k, path: curve([b0, add(b0, [d[0] * 0.045, d[1] * 0.045, d[2] * 0.045]), add(b0, [d[0] * 0.09, d[1] * 0.09 - 0.01, d[2] * 0.09])], 4), r: (t) => 0.0011 * (1 - t * 0.7), around: 3, capS: false, capE: true, levels: 0, k: 0.6, skin: () => [hb, 1], paint: whiskerPaint })).noOcc = true;
    }
  }
  yield 'head';
  // ---- short legs: a thick forearm or haunch, a narrow wrist, a broad paw of five clawed toes on dark pads
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? LEGS.f : LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s), r = L.r;
    const rings: LimbRing[] = fore ? [
      { t: -0.3, r: r * 1.0, e: 1.3, off: [-0.4, 0] },
      { t: -0.05, r: r * 1.2, e: 1.25, b: [[0, 0.12, 40], [180, 0.12, 40]] },
      { t: 0.2, r: r * 1.1, e: 1.2, b: [[10, 0.15, 40], [180, 0.12, 30]] },
      { t: 0.45, r: r * 0.9, e: 1.1, b: [[180, 0.26, 28]], crease: 0.8, ink: true },
      { t: 0.62, r: r * 0.82, e: 1.05, b: [[15, 0.12, 40]] },
      { t: 0.8, r: r * 0.66, e: 0.95 },
      { t: 0.9, r: r * 0.7, e: 0.95, b: [[90, 0.1, 24], [-90, 0.1, 24]] },
    ] : [
      { t: -0.3, r: r * 1.1, e: 1.3, off: [-0.4, 0] },
      { t: -0.05, r: r * 1.3, e: 1.3, b: [[180, 0.15, 40], [10, 0.1, 40]] },
      { t: 0.22, r: r * 1.1, e: 1.25, b: [[170, 0.18, 35]] },
      { t: 0.46, r: r * 0.8, e: 1.15, b: [[180, 0.32, 24]], crease: 0.8, ink: true },
      { t: 0.65, r: r * 0.66, e: 1.05, b: [[180, 0.12, 24]] },
      { t: 0.85, r: r * 0.62, e: 1.0, b: [[90, 0.1, 24], [-90, 0.1, 24]] },
    ];
    const foot: FootSpec = { pad: r * 0.95, h: PADH, fwd: 0.32, nail: 'claw', lobe: 0.26, toeAround: 6, web: 0.3,
      toes: [-62, -26, 2, 30, 64].map((a, j) => ({ a, len: r * (j === 0 ? 0.32 : 0.48), r: r * (j === 0 ? 0.18 : 0.22), claw: r * 0.34, curl: 0.55, drop: 0.25 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 12, levels: 1, rise: 0.05,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: coatPaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 1; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
  }
  // ---- the long tail: thick at the root, tapering to the black tip
  const tb = [0, 1, 2, 3].map((k) => bi('tail' + k));
  const tailSkin = chainSkin(TAIL, tb, 0.4);
  body.add(stalk({ name: 'tail', path: curve([[0, 0.172, -0.4], ...TAIL_CTRL], 14), r: (t) => 0.036 * (1 - t * 0.55) * (t < 0.06 ? 1.15 : 1) * (t > 0.92 ? 1 - (t - 0.92) * 9 : 1) + 0.003, around: 12, capS: false, capE: true, levels: 1, k: 1,
    skin: (p) => (p[2] > -0.46 ? [bi('hips'), 0.6, tb[0], 0.4] : tailSkin(p)), paint: coatPaint('tail') })).reg = REG.tail;
  const out = yield* body.buildGen({ den: o.den ?? 300, maxScale: 2, budget: 22000, fur: WS_FUR });
  return finishModel(body, out, bones);
}
/** a dense winter coat: longest on the neck ruff, the back and the tail, short on the face, the ears and the paws */
const WS_FUR = furZones([
  { piece: /^(trunk|[fh]leg[LR])$/, len: 0.55, clump: 0.65, tip: 0.6 },
  { piece: /^trunk$/, facing: [0, 1, 0], min: 0.2, len: 0.8, clump: 0.75 },
  { piece: /^trunk$/, a: [0, 0.21, 0.26], b: [0, 0.23, 0.42], r: 0.09, len: 0.95, clump: 0.8 },
  { piece: /^tail$/, len: 0.75, clump: 0.6, tip: 0.5 },
  { piece: /^tail$/, a: [0, 0.13, -0.86], b: [0, 0.12, -1.06], r: 0.06, len: 1, clump: 0.7, tip: 0.3 },
  { piece: /^skull$/, len: 0.32, clump: 0.4 },
  { piece: /^skull$/, a: [0, 0.236, 0.585], b: [0, 0.238, 0.63], r: 0.03, bare: true, len: 0 },
  { piece: /^skull$/, a: WS_BEAD, r: 0.023, bare: true, len: 0 },
  { piece: /^skull$/, a: mir(WS_BEAD, -1), r: 0.023, bare: true, len: 0 },
  { piece: /^ear[LR]$/, len: 0.2, clump: 0.3 },
  { piece: /^[fh]leg[LR]$/, a: [0, 0.02, 0], b: [0, -0.1, 0], r: 0.4, soft: 0.3, bare: true, len: 0 },
]);
export const WS_FUR_SPEC = { length: 0.055, shells: 12, comb: [0, -0.45, -0.6] as [number, number, number], clump: 6, clumpPull: 0.75, density: 0.9, rootDark: 0.6, tipK: 0.45, droop: 0.35, hz: 3, fins: 0.55, springs: [{ bones: ['tail1'], hz: 2.4, inertia: 1.3 }, { bones: ['neck2'], hz: 3.5 }] };
export type { Chart, Piece };
