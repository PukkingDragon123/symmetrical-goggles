// THE AGROPELTER (Cox 1910, Anthrocephalus craniofractens: it lives in hollow trees and hurls dead limbs at anyone
// who passes under, "the villainous face of an ape and arms like whiplashes"; it eats woodpeckers and hoot owls; other
// tellings give it black fur and an ash-grey, skull-like face). This one: a wiry ape the size of a boy, all sinew, a
// hump of throwing muscle over the shoulders, short bowed legs on grasping feet, and arms twice as long as they should
// be, ropy and tapering like a bullwhip to long knuckled hands. A mean ash-grey face: a low sloping skull, a heavy bar
// of brow pulled down over two small amber eyes squeezed to slits, a flat nose with flared nostrils, a long creased
// upper lip, and a jaw that juts out past it in an underbite with two crooked yellow tusks standing up outside the lip.
// Shaggy black-brown fur grizzled grey over the hump and the crown, thin and sparse over a grey chest. It holds a
// crooked dead branch on its own bone (thrown and simulated by agropelter.ts).
// Its tree is a separate static model: a dead, broken-topped spruce snag with a hollow (the knot-hole it lives in, rimmed
// with claw-scored bark), woodpecker holes, stubs of dead limbs and a heap of broken branches round its foot.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, paintedEye, lids, lidPaint, locks, stalk, curve, chainSkin, Px, RP, h3, cl, cell3,
  type V3, type Station, type FootSpec, type LockSeat, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { seatsOn } from '../../paintkit';
import { furZones, type FurZone } from '../../fur';
import { bonesKit, boneIndex, finishModel, REG, type ModelGen } from '../kit';
import { ring, displace, carve, ridge, flap, digit, brush, bone, gs, sm, add, nrm } from '../sculpt';
import type { BoneDef } from '../../rig';

export const AGROPELTER_MODEL_VERSION = 'agropelter@2';
export const SNAG_MODEL_VERSION = 'agrosnag@4';
export const AG_HEAD: V3 = [0, 1.04, 0.16];
/** the eye, small and deep under the brow (head-local SOCK) */
export const AG_EYE: V3 = [0.033, 1.066, 0.226];
export const AG_EYE_AX: V3 = [0.22, 0.02, 0.97];
const SOCK: V3 = [0.033, 0.026, 0.066], SOCK_AX: V3 = nrm([0.22, 0.02, 0.97]);
const JAW_HINGE: V3 = [0, 0.995, 0.175];
const ARM = { sh: [0.15, 0.9, 0.05] as V3, el: [0.24, 0.45, -0.02] as V3, wr: [0.26, 0.02, 0.06] as V3, r: 0.042 };
const LEG = { hip: [0.1, 0.46, -0.02] as V3, knee: [0.17, 0.25, 0.09] as V3, sole: [0.15, 0, 0.02] as V3, r: 0.055 };
const PADH = 0.016;
/** the snag: the hollow's centre height, the trunk radius there, the direction the hole faces is +z */
export const SNAG = { holeY: 3.3, r: 0.36, top: 5.2 };
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
/** which way the hair lies (creature space): the shell fur's comb, so the painted locks and the shells agree */
const COMB: V3 = [0, -0.7, -0.35], HEADCOMB: V3 = [0, -0.25, -1];

export function agropelterBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('hips', null, [0, 0.48, -0.01]);
  A('spine', 'hips', [0, 0.66, 0.0]);
  A('chest', 'spine', [0, 0.84, 0.04]);
  A('neck', 'chest', [0, 0.97, 0.1]);
  A('head', 'neck', AG_HEAD);
  A('jaw', 'head', JAW_HINGE);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(AG_EYE, k)); A('lid' + s, 'head', mir(AG_EYE, k)); A('ear' + s, 'head', [k * 0.072, 1.07, 0.155]); }
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

// ------------------------------------------------------------------------------------------------ the shapes
/** up the body (profile top = the back): lean hips, a waist of sinew, a deep narrow chest, the throwing hump */
const TORSO: Station[] = [
  { c: [0, 0.37, -0.03], s: [0.055, 0.048], p: ring() },
  { c: [0, 0.43, -0.022], s: [0.108, 0.082], p: ring([[32, 0.1, 30]], { sq: 0.3 }) },
  { c: [0, 0.5, -0.012], s: [0.104, 0.078], p: ring([[110, 0.1, 20], [180, -0.05, 30]]) },
  { c: [0, 0.58, -0.002], s: [0.088, 0.074], p: ring([[0, 0.05, 10], [30, 0.1, 22], [165, -0.04, 30]]) },
  { c: [0, 0.66, 0.01], s: [0.108, 0.087], p: ring([[0, -0.03, 10], [30, 0.08, 22], [100, 0.06, 30]]) },
  { c: [0, 0.74, 0.024], s: [0.128, 0.098], p: ring([[35, 0.08, 22], [175, 0.04, 20]]) },
  { c: [0, 0.82, 0.04], s: [0.146, 0.103], p: ring([[40, 0.12, 22], [148, 0.12, 25], [180, -0.05, 10]]) },
  { c: [0, 0.885, 0.056], s: [0.158, 0.1], p: ring([[0, -0.06, 10], [38, 0.18, 24], [92, 0.12, 22], [150, 0.1, 22]]) },
  { c: [0, 0.945, 0.076], s: [0.122, 0.088], p: ring([[0, 0.14, 24], [45, 0.14, 30], [150, -0.05, 20]]) },
  { c: [0, 0.995, 0.103], s: [0.072, 0.066], p: ring([[0, 0.1, 25], [130, 0.08, 20]]) },
  { c: [0, 1.03, 0.135], s: [0.06, 0.058], p: ring() },
];
const czAt = (y: number) => {
  for (let k = 0; k + 1 < TORSO.length; k++) { const a = TORSO[k].c, b = TORSO[k + 1].c; if (y <= b[1]) return a[2] + (b[2] - a[2]) * cl((y - a[1]) / (b[1] - a[1]), 0, 1); }
  return TORSO[TORSO.length - 1].c[2];
};
/** sinew under the skin: the blocks of the belly, the serratus fingers under the arms, the spine's groove, the blades */
function torsoForms(p: V3, n: V3): number {
  const [x, y, z] = p, ax = Math.abs(x), front = cl(n[2] * 1.2, 0, 1), sx = x >= 0 ? 1 : -1;
  let d = 0;
  // the belly: two columns of blocks either side of a groove
  if (y > 0.5 && y < 0.72 && front > 0) {
    const f = (((y - 0.5) / 0.055) % 1 + 1) % 1;
    d += front * gs(ax, 0.028, 0.017) * (0.004 * gs(f, 0.5, 0.25) - 0.0015) - front * 0.003 * gs(ax, 0, 0.006);
  }
  // serratus: fingers of muscle slanting down the side of the chest under the arm
  const side = cl(Math.abs(n[0]) * 1.3 - 0.2, 0, 1);
  if (y > 0.66 && y < 0.82 && side > 0) { const f = (((y + (z - czAt(y)) * 0.6 - 0.66) / 0.032) % 1 + 1) % 1; d += side * 0.003 * (gs(f, 0.5, 0.2) - 0.3); }
  // the blades and the groove of the spine between the back muscles
  d += ridge([[sx * 0.06, 0.78, czAt(0.78) - 0.1], [sx * 0.07, 0.9, czAt(0.9) - 0.1]], p, 0.02, 0.006);
  if (n[2] < -0.3 && y > 0.52 && y < 0.9) d -= 0.004 * gs(ax, 0, 0.012);
  return d;
}
/** the head (head-local stations along z): a low sloping skull, the brow bar, a dished face under it, a long muzzle */
const HS: [number, number, number, number, number[][]][] = [
  [-0.07, 0.02, 0.04, 0.045, ring()],
  [-0.045, 0.018, 0.064, 0.058, ring([[0, 0.06, 12]])],
  [-0.01, 0.02, 0.074, 0.062, ring([[0, 0.05, 12], [150, -0.1, 25]])],
  [0.024, 0.02, 0.077, 0.062, ring([[60, -0.08, 15], [100, 0.08, 15]])],
  [0.048, 0.02, 0.08, 0.066, ring([[100, 0.12, 16]])],
  [0.068, 0.006, 0.07, 0.06, ring([[0, -0.1, 25], [100, 0.12, 16]])],
  [0.092, -0.012, 0.058, 0.054, ring([[0, 0.05, 15], [100, 0.1, 20]], { sq: 0.5 })],
  [0.112, -0.022, 0.05, 0.045, ring([], { sq: 0.6 })],
  [0.128, -0.027, 0.04, 0.035, ring([], { sq: 0.5 })],
  [0.138, -0.03, 0.024, 0.021, ring()],
  [0.143, -0.032, 0.008, 0.008, ring()],
];
/** the underslung jaw (head-local): deep at the hinge, jutting past the upper lip, a square chin */
const JS: [number, number, number, number][] = [[0.0, -0.046, 0.058, 0.03], [0.04, -0.056, 0.056, 0.026], [0.08, -0.064, 0.05, 0.025], [0.118, -0.066, 0.044, 0.024], [0.146, -0.063, 0.036, 0.021], [0.16, -0.06, 0.02, 0.014], [0.166, -0.058, 0.008, 0.006]];
const JAWP = [[0, 0.62], [0.32, 0.7], [0.66, 0.84], [0.95, 0.66], [1, 0.12], [0.96, -0.4], [0.78, -0.8], [0.4, -0.98], [0, -1]];

// ------------------------------------------------------------------------------------------------ paint
const FUR = RP('squatch'), GRIZ = RP('stone'), DARK = RP('basalt'), FACE = RP('stone'), SKIN = RP('leather'), GUM = RP('gum'), HORN = RP('horn'), INK = RP('ink'), BARK = RP('stone'), WOOD = RP('paper');
const hl = (x: number, y: number, z: number): V3 => [x - AG_HEAD[0], y - AG_HEAD[1], z - AG_HEAD[2]];
/** the coat: black-brown, laid on in long shaggy strokes, grizzled grey over the hump, the crown and the outsides of
 *  the arms; thin over the chest and belly where the grey skin shows through */
const furPaint = (part: 'trunk' | 'arm' | 'leg') => brush({
  light: 2.4,
  skin: { len: 0.03, wid: 0.006, flow: 'across', amp: 0.45, seed: 5 },
  fur: { len: 0.06, wid: 0.008, flow: COMB, amp: 0.7, tip: 1.0, root: 0.9, seed: 9 },
  texel: (px, i, x, y, z, nx, ny, nz, s) => {
    let hair = 1;
    if (part === 'trunk') hair = 1 - sm(0.2, 0.75, nz) * sm(0.52, 0.62, y) * (1 - sm(0.84, 0.9, y)) * 0.75;
    if (part === 'arm') hair = 1 - (1 - sm(0.06, 0.16, y)) * 0.8;
    if (part === 'leg') hair = 1 - (1 - sm(0.05, 0.12, y)) * 0.9;
    if (hair + 0.35 * s.fv < 0.55) { px.put(i, part === 'trunk' ? FACE : SKIN, part === 'trunk' ? 2.2 : 2.4); px.rough[i] = 180; return 0.2; }
    // grizzle: the throwing hump, the crown, the outsides of the upper arms, laid in as strokes of grey-brown
    const griz = (part === 'trunk' ? sm(0.86, 0.95, y) * sm(-0.2, 0.4, -nz + ny) : part === 'arm' ? sm(0.55, 0.8, y) * sm(0, 0.6, Math.abs(nx)) : 0);
    if (griz + 0.5 * s.fv > 0.75 && s.fid > 0.25) { px.put(i, GRIZ, 2.4); px.rough[i] = 245; return 1; }
    px.put(i, s.fid < 0.07 ? DARK : FUR, 1.4 + (s.fid > 0.85 ? 0.6 : 0) + (hair < 0.8 ? -0.3 : 0)); px.rough[i] = 245;
    void x; void z;
    return hair;
  },
});
/** the face: ash-grey skin, the brow bar and the cheekbones pale, the eyes sunk in black under the brow, frown
 *  furrows between them, a flat nose with flared black nostrils, a long upper lip creased down its length, dark lips */
function facePaint(part: 'skull' | 'jaw' | 'ear') {
  return brush({
    light: 2.6,
    skin: { len: 0.02, wid: 0.004, amp: 0.35, seed: 41 },
    fur: { len: 0.045, wid: 0.007, flow: HEADCOMB, amp: 0.7, tip: 1.0, root: 0.9, seed: 43 },
    texel: (px, i, X, Y, Z, nx, ny, nz, s) => {
      const [x, y, z] = hl(X, Y, Z), ax = Math.abs(x);
      if (part === 'ear') { const bowl = nx * Math.sign(X || 1) < 0.15; px.put(i, bowl ? SKIN : FACE, bowl ? 1.6 : 2.6); px.rough[i] = 170; return 0; }
      // the hair: over the crown and the back of the head, framing the face in a grizzled ruff
      const face = nz > -0.1 && z > 0.035 - (y < -0.01 ? 0.03 : 0) && !(ny > 0.55 && z < 0.07);
      if (part === 'skull' && !face && z < 0.06 + s.fv * 0.006) { px.put(i, sm(-0.01, 0.06, y) + s.fv * 0.4 > 0.7 ? GRIZ : FUR, 1.6); px.rough[i] = 245; return 1; }
      if (part === 'jaw' && ny > 0.7 && ax < 0.03) { px.put(i, GUM, 1.4 - cl((0.13 - z) * 9, 0, 1.2)); px.rough[i] = 60; return 0; }
      let R = FACE, st = 2.8 + (s.sid < 0.06 ? -0.6 : 0);
      // under the brow: the sockets black, the squint's creases fanning out from the corners
      const d = [ax - SOCK[0], y - SOCK[1], z - SOCK[2]], a = d[0] * SOCK_AX[0] + d[1] * SOCK_AX[1] + d[2] * SOCK_AX[2];
      const rho = Math.hypot(d[0] - SOCK_AX[0] * a, d[1] - SOCK_AX[1] * a, d[2] - SOCK_AX[2] * a);
      if (part === 'skull' && rho < 0.024 && a < 0.024) { R = rho < 0.016 ? INK : DARK; st = rho < 0.016 ? 0.6 : 1.4 + s.sv * 0.3; }
      else if (part === 'skull' && rho < 0.034 && ax > SOCK[0] && Math.abs(Math.sin(Math.atan2(y - SOCK[1], ax - SOCK[0]) * 5)) < 0.2) st -= 1.1;
      // frown furrows between the brows, wrinkles across the bridge
      if (part === 'skull' && ax < 0.012 && y > 0.02 && y < 0.05 && z > 0.05 && Math.abs(ax - 0.005) < px.mpt * 1.2) st -= 1.4;
      if (part === 'skull' && ax < 0.02 && y < 0.02 && y > -0.005 && z > 0.07 && Math.abs(Math.sin(y * 700)) < 0.25) st -= 0.8;
      // the nose: a flat pad, two flared nostrils
      if (part === 'skull' && z > 0.08 && nz > 0.2) {
        const nd = Math.hypot((ax - 0.011) * 1.0, (y + 0.004) * 1.5);
        if (nd < 0.0055) { R = INK; st = 0.5; } else if (nd < 0.009) st += 0.7;
        // the long upper lip: creased down its length, darker at the mouth's edge
        if (y < -0.012 && y > -0.045 && Math.abs(Math.sin(ax * 520)) < 0.18 && s.sid > 0.3) st -= 0.8;
      }
      if (part === 'skull' && y < -0.043 && y > -0.055) { R = SKIN; st = 1.3; }
      if (part === 'jaw' && y > -0.05 && ny > 0.0) { R = SKIN; st = 1.4; }
      px.put(i, R, st); px.rough[i] = 175;
      return 0;
    },
  });
}
const handPaint = brush({ light: 2.4, skin: { len: 0.02, wid: 0.004, flow: 'across', amp: 0.45, seed: 23 }, texel: (px, i, _x, _y, _z, _nx, ny) => { px.put(i, SKIN, 2.4 + (ny > 0.4 ? 0.5 : 0)); px.rough[i] = 170; return 0; } });
const nailPaint = bone(HORN, { root: 1.2, tipStep: 4.6, rough: 90 });
const toothPaint = bone(RP('ochre'), { root: 2.2, tipStep: 5.6, rough: 80, flip: false });
/** dead wood: weathered grey bark in long fissured plates laid in with strokes up the grain, bare silver-brown wood
 *  where the bark has fallen away, beetle galleries */
const deadWood = (o: { bark?: number; seed?: number } = {}) => brush({
  light: 2.4,
  skin: { len: 0.09, wid: 0.01, amp: 0.6, seed: 61 + (o.seed ?? 0) },
  texel: (px, i, x, y, z, _nx, _ny, _nz, s) => {
    const bare = cell3(x, y * 0.4, z, 0.12, 7 + (o.seed ?? 0)).id % 10 < 5 + (o.bark ?? 0) * 4;
    if (bare) { px.put(i, WOOD, 1.8 + (s.sid < 0.1 ? -1.2 : 0)); px.rough[i] = 230; return 0; }
    px.put(i, BARK, 3.0 + (s.sid < 0.15 ? -1.6 : 0)); px.rough[i] = 235;
    return 0;
  },
});

// ------------------------------------------------------------------------------------------------ the creature
export function* agropelterModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = agropelterBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1910;
  const J: V3[] = [[0, 0.36, -0.03], [0, 0.48, -0.01], [0, 0.66, 0.0], [0, 0.84, 0.04], [0, 0.97, 0.1], [0, 1.05, 0.15]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('spine'), bi('chest'), bi('neck')], 0.35);
  const torso = body.add(trunk({ name: 'trunk', stations: TORSO, tween: [1, 1, 1, 2, 2, 2, 2, 1, 1, 1], capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: furPaint('trunk') }));
  torso.reg = REG.torso;
  displace(body, torso, torsoForms);
  yield 'trunk';
  // ---- the head
  const H = AG_HEAD, hb = bi('head');
  const skull = body.add(trunk({ name: 'skull', stations: HS.map(([z, cy, w, h, p]) => ({ c: [0, H[1] + cy, H[2] + z], s: [w, h], p })), tween: 0, capS: true, capE: true, k: 2.4, levels: 2,
    skin: (p) => (p[2] < H[2] - 0.04 ? [hb, 0.6, bi('neck'), 0.4] : [hb, 1]), paint: facePaint('skull') }));
  skull.reg = REG.head;
  for (const s of [1, -1]) carve(body, skull, add(H, [s * SOCK[0], SOCK[1], SOCK[2]]), [s * SOCK_AX[0], SOCK_AX[1], SOCK_AX[2]], 0.02, 0.003, 0.02);
  displace(body, skull, (p) => {
    const [x, y, z] = hl(p[0], p[1], p[2]), q: V3 = [Math.abs(x), y, z];
    // the brow: one heavy bar across both eyes, pulled down in the middle (the scowl)
    let d = ridge([[0, 0.036, 0.074], [0.02, 0.044, 0.08], [0.04, 0.047, 0.076], [0.058, 0.04, 0.06], [0.072, 0.026, 0.04]], q, 0.015, 0.017);
    d += ridge([[0.052, 0.005, 0.07], [0.068, 0.008, 0.045], [0.076, 0.016, 0.01]], q, 0.009, 0.006);                 // the cheekbones
    d += ridge([[0.012, -0.004, 0.098], [0.016, -0.008, 0.094]], q, 0.006, 0.004);                                     // the flare of the nostrils
    d -= 0.004 * gs(Math.hypot(q[0] - 0.011, (y + 0.004) * 1.5, z - 0.098), 0, 0.004);                                 // the nostrils
    d += 0.004 * gs(Math.hypot(q[0] * 0.5, y + 0.03, z - 0.118), 0, 0.012);                                           // the long upper lip pushed out
    return d;
  });
  const jawSkin = () => [bi('jaw'), 1];
  const jaw = body.add(trunk({ name: 'jaw', stations: JS.map(([z, cy, w, h]) => ({ c: [0, H[1] + cy, H[2] + z], s: [w, h], p: JAWP })), tween: [1, 1, 1, 1, 1, 0], capS: true, capE: true, k: 2, levels: 1, skin: jawSkin, paint: facePaint('jaw') }));
  jaw.reg = REG.jaw;
  displace(body, jaw, (p) => { const [x, y, z] = hl(p[0], p[1], p[2]); return 0.004 * gs(Math.hypot(x * 0.6, y + 0.075, z - 0.15), 0, 0.012); }); // the chin
  // crooked yellow teeth along the jutting lower jaw, two tusks standing up outside the upper lip
  let tk = 0;
  for (let k = 0; k < 8; k++) {
    const f = k / 7 - 0.5, z = 0.15 - Math.abs(f) * 0.05, w = 0.03 * f * 2, top = -0.041;
    const tusk = k === 0 || k === 7, len = tusk ? 0.03 : 0.009 + h3(k, 2, 5) * 0.006, at: V3 = add(H, [w, top, z]);
    const lean = [(h3(k, 3, 5) - 0.5) * 0.008 + (tusk ? Math.sign(f) * 0.006 : 0), 0, tusk ? -0.004 : 0.002];
    body.add(stalk({ name: 'tooth' + tk++, path: [add(at, [0, -0.006, 0]), at, add(at, [lean[0] * 0.6, len * 0.6, lean[2]]), add(at, [lean[0], len, lean[2] * 1.4])], r: (t) => (tusk ? 0.0055 : 0.0042) * (1 - t * (tusk ? 0.85 : 0.5)), around: 5, capS: true, capE: true, levels: 0, k: 1.3, skin: jawSkin, paint: toothPaint })).reg = REG.mouth;
  }
  // small amber eyes squeezed to slits under the brow; small cupped ears with a ragged rim
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(AG_EYE, s), ax: V3 = [s * AG_EYE_AX[0], AG_EYE_AX[1], AG_EYE_AX[2]];
    body.add(paintedEye({ name: 'eye' + S, c, ax, r: 0.0115, bone: bi('eye' + S), iris: RP('glowAmber'), pupil: 'round', pupilR: 0.32, irisA: 0.66, sclera: RP('ochre'), side: s, glintR: 0.18, k: 3 })).reg = REG.eye;
    for (const l of lids({ name: 'lid' + S, c, ax, r: 0.0115, bone: bi('lid' + S), lowBone: hb, upper: 0.24, lower: 0.36, tilt: 0.22, side: s, thick: 0.3, thickLo: 0.2, paint: lidPaint(FACE, 2.0, { c, ax, r: 0.0115, lash: INK }) })) body.add(l).reg = REG.head;
    const er: V3 = add(H, [s * 0.068, 0.03, 0.0]);
    body.add(flap({ name: 'ear' + S, path: curve([add(er, [-s * 0.012, 0, 0.004]), er, add(er, [s * 0.016, 0.01, -0.012]), add(er, [s * 0.024, 0.022, -0.026])], 6), front: nrm([s * 0.5, 0.2, 1]),
      w: (t) => 0.042 * Math.sin(Math.min(1, 0.3 + t * 0.85) * Math.PI) + 0.005, cup: (t) => 0.01 * (1 - t * 0.6), thick: 0.005, skin: () => [bi('ear' + S), 1], paint: facePaint('ear'), levels: 1, k: 1.3 })).reg = REG.head;
  }
  yield 'head';
  // ---- whiplash arms to the ground: a knot of shoulder, a ropy forearm tapering to a thin wrist, long hands
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const sh = mir(ARM.sh, s), el = mir(ARM.el, s), wr = mir(ARM.wr, s), r = ARM.r;
    const ar: LimbRing[] = [
      { t: -0.3, r: r * 0.85, e: 1.3, off: [-0.45, 0] },
      { t: -0.08, r: r * 1.22, e: 1.15, b: [[90, 0.2, 45], [0, 0.1, 40]] },
      { t: 0.08, r: r * 1.0, e: 1.05, b: [[90, 0.14, 40], [20, 0.1, 35]] },
      { t: 0.22, r: r * 0.82, e: 1.08, b: [[10, 0.16, 30], [175, 0.16, 30]] },
      { t: 0.36, r: r * 0.68, e: 1.04, b: [[180, 0.1, 30]] },
      { t: 0.47, r: r * 0.64, e: 1.0, b: [[180, 0.3, 26], [90, 0.1, 22], [-90, 0.14, 22]], crease: 1, ink: true },
      { t: 0.55, r: r * 0.76, e: 1.0, b: [[20, 0.24, 40], [180, 0.1, 30]] },
      { t: 0.67, r: r * 0.6, e: 0.9, b: [[20, 0.14, 40]] },
      { t: 0.8, r: r * 0.46, e: 0.82 },
      { t: 0.92, r: r * 0.4, e: 0.76, b: [[90, 0.2, 20], [-90, 0.16, 20]] },
      { t: 0.98, r: r * 0.44, e: 0.72 },
    ];
    const arm = limb({ name: 'arm' + S, side: s, hip: sh, knee: el, sole: [wr[0], wr[1] + 0.03, wr[2]], tj: [0, 0.5, 1], rings: ar, around: 12, levels: 1, rise: 0.03,
      foot: { pad: 0.03, h: 0.012, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('cla' + S), up: bi('arm' + S), lo: bi('elb' + S), foot: bi('hand' + S) }, paint: furPaint('arm'), clawPaint: nailPaint, k: 1 });
    arm.skin.reg = REG.arms;
    body.add(arm.skin);
    // the hand: a long narrow palm, four long fingers with knuckles it walks on, a thumb
    const hb2 = bi('hand' + S), fb = bi('fing' + S);
    body.add(trunk({ name: 'palm' + S, stations: [0.0, 0.03, 0.06, 0.075].map((d, k) => ({ c: add(wr, [s * 0.003, 0.03 - d, 0.008 + d * 0.05]), s: [0.016, [0.028, 0.035, 0.036, 0.03][k]] as [number, number], p: ring([[90, -0.05, 20]], { sq: 0.4 }) })), tween: [1, 1, 0], capS: true, capE: true, levels: 1, k: 1.3, skin: () => [hb2, 1], paint: handPaint })).reg = REG.arms;
    for (let f = 0; f < 4; f++) {
      const fz = (f - 1.5) * 0.017 + 0.008, len = [0.075, 0.092, 0.088, 0.068][f], base: V3 = add(wr, [0, -0.04, fz]);
      const path = curve([add(base, [0, 0.012, 0]), base, add(base, [-s * 0.006, -len * 0.5, 0.006]), add(base, [-s * 0.01, -len * 0.82, 0.016]), add(base, [-s * 0.013, -len, 0.026])], 9);
      const [fin, nail] = digit({ name: 'fin' + S + f, path, r: 0.0085, joints: [0.15, 0.52, 0.8], pad: [-s, 0, 0.3], taper: 0.3, flat: 0.85, knuckle: 0.26, skin: (p) => (p[1] > base[1] - len * 0.3 ? [hb2, 1] : [fb, 1]), paint: handPaint, levels: 1,
        claw: { len: 0.016, r: 0.0055, curl: 0.5, skin: () => [fb, 1], paint: nailPaint } });
      body.add(fin).reg = REG.arms; body.add(nail).reg = REG.claw;
    }
    const tb = add(wr, [-s * 0.012, 0.0, 0.025]);
    const [th, thn] = digit({ name: 'thm' + S, path: curve([tb, add(tb, [-s * 0.008, -0.028, 0.014]), add(tb, [-s * 0.012, -0.055, 0.02])], 6), r: 0.0085, joints: [0.5], pad: [-s, 0, -0.3], taper: 0.3, skin: () => [hb2, 1], paint: handPaint, levels: 1,
      claw: { len: 0.012, r: 0.005, curl: 0.4, skin: () => [hb2, 1], paint: nailPaint } });
    body.add(th).reg = REG.arms; body.add(thn).reg = REG.claw;
    // ---- short bowed legs on grasping feet (the big toe set off to the inside)
    const hip = mir(LEG.hip, s), knee = mir(LEG.knee, s), sole = mir(LEG.sole, s), lr = LEG.r;
    const rings: LimbRing[] = [
      { t: -0.3, r: lr * 0.9, e: 1.3, off: [-0.4, 0] },
      { t: -0.06, r: lr * 1.12, e: 1.25, b: [[180, 0.2, 50], [90, 0.08, 40]] },
      { t: 0.14, r: lr * 1.0, e: 1.2, b: [[10, 0.16, 40], [170, 0.2, 40]] },
      { t: 0.32, r: lr * 0.78, e: 1.12, b: [[0, 0.08, 35], [175, 0.12, 35]] },
      { t: 0.46, r: lr * 0.7, e: 1.0, b: [[0, 0.24, 28], [90, 0.1, 24], [-90, 0.12, 24]], crease: 1, ink: true },
      { t: 0.58, r: lr * 0.74, e: 1.15, b: [[170, 0.3, 40]] },
      { t: 0.74, r: lr * 0.56, e: 1.1, b: [[180, 0.16, 26]] },
      { t: 0.86, r: lr * 0.5, e: 1.0, b: [[90, 0.16, 22], [-90, 0.2, 22]] },
    ];
    const foot: FootSpec = { pad: lr * 0.75, h: PADH, fwd: 0.35, nail: 'nail', lobe: 0.2, toeAround: 6,
      toes: [-110, -40, -12, 14, 40].map((a, k) => ({ a, len: lr * (k === 0 ? 0.6 : 0.8), r: lr * (k === 0 ? 0.22 : 0.17), claw: lr * 0.2, curl: 0.4, drop: k === 0 ? -0.2 : 0.3 })) };
    const leg = limb({ name: 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 12, levels: 1, rise: 0.05,
      bones: { parent: bi('hips'), up: bi('thigh' + S), lo: bi('shin' + S), foot: bi('foot' + S) }, paint: furPaint('leg'), clawPaint: nailPaint, k: 1 });
    leg.skin.reg = REG.legs; leg.toes.reg = REG.legs; leg.claws.reg = REG.claw; leg.toes.levels = 1; leg.claws.levels = 0; leg.toes.paint = handPaint;
    body.add(leg.skin); body.add(leg.toes); body.add(leg.claws);
    yield 'limbs';
  }
  // ---- the branch it throws: a crooked dead limb with two snapped side twigs
  const sb = bi('stick'), S0: V3 = [0, 0.6, 0.3];
  const spath = curve([add(S0, [0, 0, -0.32]), add(S0, [0.02, 0.01, -0.12]), add(S0, [-0.015, -0.005, 0.08]), add(S0, [0.01, 0.012, 0.3])], 7);
  body.add(stalk({ name: 'stick', path: spath, r: (t) => 0.024 * (1 - t * 0.5) * (1 + 0.12 * gs(t, 0.35, 0.04) + 0.1 * gs(t, 0.7, 0.04)), around: 7, capS: true, capE: true, levels: 1, k: 1.1, skin: () => [sb, 1], paint: deadWood({ bark: -0.1, seed: 3 }) })).reg = REG.horn;
  for (const [t0, dir] of [[0.35, [0.6, 0.3, 0.7]], [0.7, [-0.5, -0.2, 0.8]]] as const) {
    const a = spath[Math.floor(t0 * (spath.length - 1))], d = nrm(dir as unknown as V3);
    body.add(stalk({ name: 'twig' + t0, path: [a, add(a, [d[0] * 0.05, d[1] * 0.05, d[2] * 0.05]), add(a, [d[0] * 0.11, d[1] * 0.11, d[2] * 0.11])], r: (t) => 0.01 * (1 - t * 0.5), around: 5, capS: true, capE: true, levels: 0, k: 1, skin: () => [sb, 1], paint: deadWood({ bark: -0.1, seed: 4 }) })).reg = REG.horn;
  }
  // ---- ragged hanks: the hump and the shoulders, whips of hair off the backs of the arms
  const seats: LockSeat[] = [];
  seats.push(...seatsOn(torso, { u0: 0.3, u1: 0.7, v0: 0.6, v1: 0.95, rows: 8, cols: 8, wid: 0.02, lift: 0.4, droop: 0.6, sink: 0.12,
    len: () => 0.075, dir: () => nrm([0, -0.6, -1]), col: (u, v) => (h3(Math.floor(u * 90), Math.floor(v * 90), 4) < 0.35 ? 1 : 0), skin: spineSkin, seed: 51 }));
  const lk = locks({ name: 'shag', seats, tiles: [FUR, GRIZ], steps: [2, 2], seed: 53 });
  if (lk) body.add(lk);
  const out = yield* body.buildGen({ den: o.den ?? 330, maxScale: 2, budget: 26000, fur: AG_FUR });
  return finishModel(body, out, bones);
}
const AG_FUR = furZones([
  { piece: /^(trunk|arm[LR]|leg[LR])$/, len: 0.6, clump: 0.75, tip: 0.3 },
  { piece: /^trunk$/, a: [0, 0.86, -0.05], b: [0, 1.0, 0.05], r: 0.14, len: 1, clump: 0.85 },
  { piece: /^trunk$/, y: [0.52, 0.86], facing: [0, 0, 1], min: 0.25, len: 0.18, den: 0.5, clump: 0.5 },
  ...[1, -1].flatMap((s): FurZone[] => [{ piece: /^arm[LR]$/, a: [s * 0.17, 0.85, 0.02], b: [s * 0.25, 0.1, 0.02], r: 0.06, len: 1, clump: 0.85, facing: [0, 0, -1], min: -0.3 }]),
  { piece: /^skull$/, a: [0, 1.1, 0.12], b: [0, 1.07, 0.1], r: 0.065, len: 0.8, clump: 0.8 },
  { piece: /^skull$/, facing: [0, 0, 1], min: 0.05, bare: true },
  { piece: /^arm[LR]$/, y: [-0.2, 0.08], bare: true },
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
  const tr = body.add(stalk({ name: 'trunk', path, r: R, around: 24, sec: (a, t) => 1 + 0.06 * Math.sin(a * 5 + t * 9) + (t < 0.12 ? 0.18 * Math.max(0, Math.cos(a * 4)) : 0), capS: true, capE: false, levels: 1, k: 0.8, skin, paint: snagPaint }));
  tr.cut = true; // keeps the hollow's alpha (core.ts: cut regions keep their texel alpha)
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
/** the snag's bark, laid in with long strokes up the grain: grey plates split by dark fissures that wander up the
 *  trunk, broken across now and then; long strips of bare silver wood where the bark has fallen away (the weather
 *  side, round the broken top, round the hollow); claw scores rubbed pale round the hole; woodpecker holes; a few
 *  lichen crusts. The hollow itself is a real opening (alpha-cut), charred dark at its lip. */
const snagPaint = brush({
  light: 2.4,
  skin: { len: 0.22, wid: 0.022, amp: 0.55, seed: 71 },
  texel: (px, i, x, y, z, _nx, ny, nz, s) => {
    const hx = x - 0.05, hy = y - SNAG.holeY;
    const hole = Math.hypot(hx / 0.21, hy / 0.31) < 1 && nz > 0.3;
    if (hole) { const d = Math.hypot(hx / 0.21, hy / 0.31); px.put(i, INK, d > 0.85 ? 2 : 0); px.rough[i] = 255; if (d < 0.86) px.alpha[i] = 0; return 0; }
    const th = Math.atan2(x, z), r = Math.hypot(x, z);
    // the bare strips: the weather side (behind), round the broken top, a lip round the hollow
    const strip = Math.cos(th - 2.6) > 0.55 - 0.15 * Math.sin(y * 1.3) && y > 0.5 && y < 4.6;
    const top = y > SNAG.top - 0.7 + Math.sin(th * 3) * 0.15, rim = Math.hypot(hx / 0.32, hy / 0.45) < 1 && nz > 0.1;
    if (strip || top || (rim && s.sv > -0.3)) {
      // silver wood: the grain in long strokes, checks splitting up it, beetle galleries
      const check = Math.abs(Math.sin(th * 34 + Math.sin(y * 2.3) * 0.6)) < 0.07 && s.sid > 0.4;
      const gall = (strip || top) && Math.abs(Math.sin(y * 60 + Math.sin(th * 40) * 2)) < 0.09 && s.sid < 0.35;
      let st = 1.6 + (ny > 0.3 ? 0.5 : 0) - (check ? 1.4 : 0) - (gall ? 1.5 : 0);
      // claw scores round the hollow: pale gouges raked down from the lip
      if (rim && Math.abs(Math.sin(hx * 70 + hy * 6)) < 0.12 && hy < 0.15) st += 2.2;
      px.put(i, WOOD, st); px.rough[i] = 230;
      return 0;
    }
    // bark plates: columns that wander up the trunk, split by black fissures, broken across now and then
    const cols = 15 + Math.round(r * 6), u = ((th / (Math.PI * 2)) * cols + Math.sin(y * 2.1 + th * 3) * 0.35 + 100) % 1;
    const plate = Math.floor((th / (Math.PI * 2)) * cols + Math.sin(y * 2.1 + th * 3) * 0.35 + 100);
    const brk = (((y * 2.6 + h3(plate, 1, 7) * 3) % 1) + 1) % 1;
    let R = BARK, st = 3.0 + (h3(plate, Math.floor(y * 2.6 + h3(plate, 1, 7) * 3), 3) - 0.5) * 0.8;
    if (u < 0.09 || u > 0.93) st = 0.6; // the fissure
    else if (u < 0.17) st -= 0.7;      // its shadowed side
    else if (u > 0.8) st += 0.6;       // the lit edge of the plate
    if (brk < 0.025 && h3(plate, Math.floor(y * 2.6), 9) < 0.35) st -= 1.2;
    // lichen: a few pale crusts on the lit plates
    if (s.sid < 0.025 && u > 0.25 && u < 0.75) { R = RP('sage'); st = 3.6; }
    // woodpecker holes (its dinner made them): small dark pits in a row
    const wp = Math.floor(y * 7), col = Math.floor(th * 4);
    if (h3(wp, col, 3) < 0.07 && Math.abs((y * 7) % 1 - 0.5) < 0.18 && Math.abs((th * 4) % 1 - 0.5) < 0.12) { R = INK; st = 1; }
    px.put(i, R, st); px.rough[i] = 235;
    return 0;
  },
});
export type { Chart, Piece };
void Px; void DARK;
