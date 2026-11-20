// THE HIDEBEHIND (Tryon 1939 and lumber-camp tellings: a large, powerful thing nobody has ever seen, because whenever
// you look at it it is behind something; it takes men who do not come back to camp; it cannot abide liquor). This
// one: some 2.5 m tall standing, starved thin (it can stand behind a spruce and not show), hunched, a long neck
// thrust forward; a narrow head with a flat, dished face of black leathery skin, two huge round eyes that throw the
// light back green, a lipless mouth that splits far back over rows of needle teeth; arms that hang below the knees
// on long three-fingered hands with hooked claws; digitigrade legs on long clawed toes. Near-black fur, shaggy and
// hanging in strands from the shoulders, the backs of the arms and a mane down the neck.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, eyeball, eyelid, locks, stalk, curve, chainSkin, gridSurf, Px, RP, h3, cl,
  type V3, type Station, type FootSpec, type LockSeat, type LimbRing, type Chart, type Piece,
} from '../../anatomy';
import { fbm3, nz2, seatsOn } from '../../paintkit';
import { furZones, type FurZone } from '../../fur';
import { bonesKit, boneIndex, coat, solid, wet, finishModel, REG, type ModelGen } from '../kit';
import type { BoneDef } from '../../rig';

export const HIDEBEHIND_MODEL_VERSION = 'oldhidebehind@4';
export const HB_HEAD: V3 = [0, 2.3, 0.31];
export const HB_EYE: V3 = [0.05, 2.338, 0.425];
export const HB_EYE_AX: V3 = [0.5, 0.1, 0.86];
const ARM = { sh: [0.18, 2.03, 0.08] as V3, el: [0.27, 1.5, -0.02] as V3, wr: [0.3, 0.98, 0.1] as V3, r: 0.05 };
const LEG = { hip: [0.11, 1.18, 0.0] as V3, knee: [0.14, 0.76, 0.2] as V3, hock: [0.14, 0.33, -0.1] as V3, sole: [0.14, 0, 0.02] as V3, r: 0.085 };
const PADH = 0.02;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function hidebehindBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('hips', null, [0, 1.2, 0]);
  A('spine', 'hips', [0, 1.5, 0.03]);
  A('chest', 'spine', [0, 1.84, 0.07]);
  A('neck', 'chest', [0, 2.08, 0.13]);
  A('neck2', 'neck', [0, 2.22, 0.21]);
  A('head', 'neck2', HB_HEAD);
  A('jaw', 'head', [0, 2.29, 0.35]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(HB_EYE, k)); A('lid' + s, 'head', mir(HB_EYE, k)); A('ear' + s, 'head', [k * 0.07, 2.37, 0.3]); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A('cla' + s, 'chest', [k * 0.07, 2.02, 0.09]);
    A('arm' + s, 'cla' + s, mir(ARM.sh, k)); A('elb' + s, 'arm' + s, mir(ARM.el, k)); A('hand' + s, 'elb' + s, mir(ARM.wr, k));
    A('fing' + s, 'hand' + s, mir(add(ARM.wr, [0, -0.13, 0.02]), k)); A('fing2' + s, 'fing' + s, mir(add(ARM.wr, [0, -0.25, 0.03]), k));
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A('thigh' + s, 'hips', mir(LEG.hip, k)); A('shin' + s, 'thigh' + s, mir(LEG.knee, k)); A('meta' + s, 'shin' + s, mir(LEG.hock, k)); A('foot' + s, 'meta' + s, mir([LEG.sole[0], PADH * 1.6, LEG.sole[2]], k));
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const FUR = RP('squatch'), SKIN = RP('slate'), DARK = RP('basalt'), GUM = RP('gum'), HORN = RP('horn');
/** the coat: near-black, combed down, a faint grey frost on the tips over the shoulders */
const furPaint = (flow: number, len = 0.09) => coat({
  lightK: 0.85,
  texel: (px, i, x, y, z) => { const m = fbm3(x * 5, y * 5, z * 5, 3); px.put(i, m > 0.15 ? DARK : FUR, (m > 0.15 ? 1.2 : 1.1) + m * 0.7 + (y > 1.95 ? 0.3 : 0)); px.rough[i] = 240; return 1; },
  pelt: { len, width: 0.012, flow, down: 0.6, tooth: 1.8, clump: 0.6, strands: 0.32 },
  ink: [1.4, 1.0, 0.3],
});
/** the face: black leather, the bones of the brow and cheeks a little paler, deep wrinkles, the lipless slit of a mouth */
function facePaint(part: 'skull' | 'jaw') {
  return coat({
    lightK: 0.7,
    texel: (px, i, X, Y, Z, nx, ny, nz) => {
      const x = X - HB_HEAD[0], y = Y - HB_HEAD[1], z = Z - HB_HEAD[2], ax = Math.abs(x), m = fbm3(X * 30, Y * 30, Z * 30, 2);
      // the back of the head and the neck: fur (the mane)
      const face = nz > 0.05 && z > 0.06 && !(ny > 0.55 && z < 0.12);
      if (!face) { px.put(i, DARK, 1.2 + fbm3(X * 6, Y * 6, Z * 6, 2) * 0.8); px.rough[i] = 240; return 1; }
      if (part === 'jaw' && ny > 0.6) { px.put(i, GUM, 0.8 - cl((0.2 - z) * 6, 0, 0.8)); px.rough[i] = 90; return 0; }
      if (part === 'skull' && ny < -0.6 && y < -0.02) { px.put(i, GUM, 0.7 - cl((0.2 - z) * 6, 0, 0.7)); px.rough[i] = 90; return 0; }
      let R = SKIN, st = 1.0 + m * 0.6, rough = 200;
      // the bones under the skin: brow ridge, cheekbones and the bridge catch a paler sheen
      if ((y > 0.045 && y < 0.07 && ax < 0.08) || (Math.abs(y + 0.005) < 0.012 && ax > 0.05 && ax < 0.085) || (ax < 0.012 && y > -0.02 && y < 0.05)) st += 1.4;
      // the eye pits: deep, dark rims round the huge eyes
      const ed = Math.hypot(ax - (HB_EYE[0] - HB_HEAD[0]), y - (HB_EYE[1] - HB_HEAD[1]), (z - (HB_EYE[2] - HB_HEAD[2])) * 0.8);
      if (ed < 0.05) st -= (0.05 - ed) * 50;
      // wrinkles fanning from the eyes, across the muzzle; two nostril slits
      if (Math.abs(Math.sin(Math.atan2(y - 0.035, ax - 0.05) * 9 + ed * 60)) < 0.15 && ed < 0.075 && ed > 0.05) st -= 0.9;
      if (z > 0.15 && Math.abs(Math.sin(z * 210 + nz2(x * 40, 1))) < 0.14) st -= 0.8;
      if (z > 0.2 && Math.abs(ax - 0.012) < px.mpt * 1.2 && y > -0.01 && y < 0.02) { R = RP('ink'); st = 0; }
      // the mouth: a long slit running back under the eyes, grey-lipped
      const ml = y + 0.022 - Math.max(0, 0.12 - z) * 0.12;
      if (Math.abs(ml) < px.mpt * 1.2 && z > 0.06) { R = RP('ink'); st = 0.5; }
      else if (Math.abs(ml) < 0.006 && z > 0.06) { R = RP('stone'); st = 2.2; }
      void nx;
      px.put(i, R, st); px.rough[i] = rough;
      return 0;
    },
    pelt: { len: 0.06, width: 0.01, flow: -1, down: 0.7, tooth: 1.6, clump: 0.5, strands: 0.3 },
    ink: [1.2, 1.3, 0.8],
    after: (px) => { px.pebbles(0.006, { depth: 0.45, seed: 31, mask: (i) => (px.rampT[px.rampI[i]] === SKIN ? 1 : 0) }); },
  });
}
const handPaint = coat({ lightK: 0.7, texel: (px, i, x, y, z, _nx, ny) => { const knuckle = Math.abs(Math.sin(y * 90)) < 0.15; px.put(i, SKIN, 1.8 + fbm3(x * 50, y * 50, z * 50, 2) * 0.6 - (knuckle ? 0.9 : 0) + (ny > 0.4 ? 0.4 : 0)); px.rough[i] = 160; return 0; }, ink: [1.1, 1.2, 0.7] });
const clawPaint = solid(HORN, (x, y, z, ny) => 2.2 + (ny > 0.2 ? 1.2 : 0) + fbm3(x * 80, y * 80, z * 80, 2) * 0.5, 80, [1, 1, 1.2]);
const toothPaint = solid(RP('bone'), (_x, _y, _z, ny) => 3.4 + (ny > 0 ? 0.6 : 0), 70);
const lidPaint = coat({ lightK: 0.6, texel: (px, i, x, y, z) => { px.put(i, SKIN, 1.6 + fbm3(x * 60, y * 60, z * 60, 2) * 0.5); px.rough[i] = 160; return 0; } });

// ------------------------------------------------------------------------------------------------ the build
export function* hidebehindModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = hidebehindBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1939;
  const J: V3[] = [[0, 1.05, -0.01], [0, 1.2, 0], [0, 1.5, 0.03], [0, 1.84, 0.07], [0, 2.08, 0.13], [0, 2.22, 0.21], [0, 2.32, 0.3]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('spine'), bi('chest'), bi('neck'), bi('neck2')], 0.35);
  // ---- the torso: a narrow pelvis, a pinched waist, a keel of ribs, bony hunched shoulders, a long thrust neck
  const st: Station[] = [
    { c: [0, 1.04, -0.01], s: [0.1, 0.08], p: 'round' },
    { c: [0, 1.14, 0.0], s: [0.145, 0.105], p: 'hips' },
    { c: [0, 1.28, 0.005], s: [0.14, 0.1], p: 'hips' },
    { c: [0, 1.42, 0.02], s: [0.11, 0.085], p: 'round' },
    { c: [0, 1.58, 0.035], s: [0.13, 0.1], p: 'barrel', tw: [[7, 0, -0.06]] },
    { c: [0, 1.74, 0.055], s: [0.155, 0.115], p: 'barrel' },
    { c: [0, 1.9, 0.08], s: [0.17, 0.115], p: 'shoulder', tw: [[0, 0, 0.1], [1, 0.05, 0.12]] },
    { c: [0, 2.0, 0.1], s: [0.15, 0.1], p: 'shoulder', tw: [[0, 0, 0.12]] },
    { c: [0, 2.09, 0.14], s: [0.085, 0.075], p: 'neck' },
    { c: [0, 2.19, 0.2], s: [0.065, 0.062], p: 'neck' },
    { c: [0, 2.27, 0.26], s: [0.058, 0.058], p: 'round' },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: furPaint(-1) }));
  torso.reg = REG.torso;
  body.finalize(torso);
  yield 'trunk';
  // ---- the head: long and narrow, a dished face, a sloping cranium
  const H = HB_HEAD, hb = bi('head');
  const hs = (z: number, dy: number, w: number, h: number, p: string | number[][], tw?: [number, number, number][]): Station => ({ c: [0, H[1] + dy, H[2] + z], s: [w, h], p, tw });
  const skull = body.add(trunk({ name: 'skull', stations: [
    hs(-0.06, 0.0, 0.06, 0.07, 'round'),
    hs(-0.01, 0.03, 0.08, 0.1, 'round'),
    hs(0.05, 0.035, 0.088, 0.1, 'round', [[3, 0.05, 0], [4, 0.04, 0]]),
    hs(0.11, 0.02, 0.085, 0.08, 'round', [[2, -0.06, 0], [3, -0.1, 0]]),
    hs(0.17, 0.0, 0.058, 0.062, 'round'),
    hs(0.23, -0.012, 0.04, 0.046, 'round'),
    hs(0.28, -0.02, 0.028, 0.034, 'round'),
    hs(0.31, -0.024, 0.016, 0.022, 'round'),
    hs(0.322, -0.026, 0.005, 0.008, 'round'),
  ], tween: 1, capS: true, capE: true, k: 2.2, levels: 2, rings: [{ at: 3, s: 0.5, ink: true }],
    skin: (p) => (p[2] < H[2] - 0.04 ? [hb, 0.6, bi('neck2'), 0.4] : [hb, 1]), paint: facePaint('skull') }));
  skull.reg = REG.head;
  // the lower jaw: long and narrow, hinged far back under the eyes
  const jaw = body.add(trunk({ name: 'jaw', stations: [
    { c: [0, 2.272, 0.36], s: [0.068, 0.03], p: 'round' }, { c: [0, 2.266, 0.44], s: [0.052, 0.027], p: 'round' }, { c: [0, 2.265, 0.52], s: [0.034, 0.022], p: 'round' }, { c: [0, 2.266, 0.59], s: [0.022, 0.015], p: 'round' }, { c: [0, 2.268, 0.62], s: [0.008, 0.007], p: 'round' },
  ], tween: 0, capS: true, capE: true, k: 1.8, levels: 1, skin: () => [bi('jaw'), 1], paint: facePaint('jaw') }));
  jaw.reg = REG.jaw;
  // needle teeth in both jaws
  let tk = 0;
  for (const s of [1, -1]) for (const up of [1, -1]) for (let k = 0; k < 6; k++) {
    const z = 0.38 + k * 0.04, w = 0.048 - k * 0.0065, at: V3 = [s * w, 2.283 - (up > 0 ? 0 : 0.012), z];
    body.add(stalk({ name: 'tooth' + tk++, path: [add(at, [0, up * 0.004, 0]), at, add(at, [0, -up * 0.012, 0.002]), add(at, [0, -up * (0.02 + (k === 1 ? 0.012 : 0)), 0.004])], r: (t) => 0.0035 * (1 - t * 0.9) + 0.0004, around: 4, capS: true, capE: true, levels: 0, k: 1.2, skin: () => [up > 0 ? hb : bi('jaw'), 1], paint: toothPaint })).reg = REG.mouth;
  }
  // the eyes: huge, round, black, shining green in a light
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(HB_EYE, s), ax: V3 = [s * HB_EYE_AX[0], HB_EYE_AX[1], HB_EYE_AX[2]];
    body.add(eyeball({ name: 'eye' + S, c, ax, r: 0.024, bone: bi('eye' + S), iris: RP('ichor'), pupil: 'round', pupilR: 0.55, irisA: 0.9, sclera: RP('ink'), k: 3, levels: 1, around: 12, catchlight: { side: s, at: [0.35, 0.45] } })).reg = REG.eye;
    body.add(eyelid({ name: 'lid' + S, c, ax, r: 0.024, bone: bi('lid' + S), paint: lidPaint, cover: 0.95, root: 2.3 })).reg = REG.head;
    body.add(eyelid({ name: 'llid' + S, c, ax, r: 0.024, bone: hb, paint: lidPaint, lower: true, cover: 1.2, root: 2.4 })).reg = REG.head;
    // small ears laid flat back along the skull
    const er: V3 = [s * 0.07, 2.36, 0.3];
    body.add(stalk({ name: 'ear' + S, path: curve([er, [s * 0.085, 2.385, 0.26], [s * 0.09, 2.395, 0.21], [s * 0.088, 2.39, 0.18]], 5), r: (t) => 0.026 * (1 - t * 0.85), around: 8, up: [s, 0.4, 0],
      sec: (a) => 1 / Math.sqrt((Math.sin(a) / 1) ** 2 + (Math.cos(a) / 0.3) ** 2), capS: true, capE: true, levels: 1, k: 1.3, skin: () => [bi('ear' + S), 1], paint: facePaint('skull') })).reg = REG.head;
  }
  yield 'head';
  // ---- arms that hang below the knees, long three-fingered hands with hooked claws
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const sh = mir(ARM.sh, s), el = mir(ARM.el, s), wr = mir(ARM.wr, s);
    const segA = [Math.hypot(sh[0] - el[0], sh[1] - el[1], sh[2] - el[2]), Math.hypot(el[0] - wr[0], el[1] - wr[1], el[2] - wr[2])];
    const ar: LimbRing[] = legRings('bear', true, ARM.r, [0, 0.5, 1], segA, 0.015).map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.6 : r.t < 0 ? 0.8 : r.t > 0.4 && r.t < 0.6 ? 0.85 : 1) }));
    const arm = limb({ name: 'arm' + S, side: s, hip: sh, knee: el, sole: [wr[0], wr[1] - 0.02, wr[2]], tj: [0, 0.5, 1], rings: ar, around: 10, levels: 1, rise: 0.03,
      foot: { pad: 0.03, h: 0.015, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('cla' + S), up: bi('arm' + S), lo: bi('elb' + S), foot: bi('hand' + S) }, paint: furPaint(1, 0.1), clawPaint, k: 1 });
    arm.skin.reg = REG.arms;
    body.add(arm.skin);
    // the palm and three long fingers (two segments each on the finger bones), a thumb
    const hb2 = bi('hand' + S), f1 = bi('fing' + S), f2 = bi('fing2' + S);
    const palm = body.add(trunk({ name: 'palm' + S, stations: [0, 0.05, 0.1, 0.13].map((d, k) => ({ c: add(wr, [0, -d - 0.01, 0.01 + d * 0.08]), s: [0.022, [0.035, 0.044, 0.042, 0.034][k]] as [number, number], p: 'flat' })),
      tween: 0, capS: true, capE: true, levels: 1, k: 1.3, skin: (p) => (p[1] > wr[1] - 0.02 ? [bi('elb' + S), 0.3, hb2, 0.7] : [hb2, 1]), paint: handPaint }));
    palm.reg = REG.arms;
    for (let f = 0; f < 3; f++) {
      const fz = (f - 1) * 0.026 + 0.012, len = [0.22, 0.25, 0.21][f], base: V3 = add(wr, [0, -0.13, fz]);
      const path = curve([base, add(base, [0, -len * 0.4, 0.004]), add(base, [-s * 0.015, -len * 0.78, 0.01]), add(base, [-s * 0.035, -len, 0.016])], 7);
      const sk = chainSkin([add(base, [0, 0.03, 0]), add(base, [0, -len * 0.45, 0]), add(base, [0, -len * 1.2, 0])], [f1, f2], 0.3);
      body.add(stalk({ name: 'fin' + S + f, path, r: (t) => 0.011 * (1 - t * 0.3) + (Math.abs(Math.sin(t * Math.PI * 2.5)) < 0.2 ? 0.002 : 0), around: 6, capS: false, capE: true, levels: 1, k: 1.2, skin: sk, paint: handPaint })).reg = REG.arms;
      // the hooked claw at its tip
      const tip = path[path.length - 1], pre = path[path.length - 3], d = nrm([tip[0] - pre[0], tip[1] - pre[1], tip[2] - pre[2]]);
      body.add(stalk({ name: 'claw' + S + f, path: curve([add(tip, [d[0] * -0.015, d[1] * -0.015, d[2] * -0.015]), tip, add(tip, [d[0] * 0.025 - s * 0.01, d[1] * 0.025, d[2] * 0.025 + 0.01]), add(tip, [d[0] * 0.04 - s * 0.022, d[1] * 0.03, d[2] * 0.03 + 0.022])], 5), r: (t) => 0.008 * (1 - t * 0.92), around: 5, capS: true, capE: true, levels: 0, k: 1.2, skin: () => [f2, 1], paint: clawPaint })).reg = REG.claw;
    }
    body.add(stalk({ name: 'thm' + S, path: curve([add(wr, [-s * 0.01, -0.05, 0.03]), add(wr, [-s * 0.02, -0.09, 0.05]), add(wr, [-s * 0.025, -0.13, 0.055])], 5), r: (t) => 0.012 * (1 - t * 0.4), around: 6, capS: false, capE: true, levels: 1, k: 1.2, skin: () => [hb2, 1], paint: handPaint })).reg = REG.arms;
    yield 'arm';
  }
  // ---- digitigrade legs on long clawed toes
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const hip = mir(LEG.hip, s), knee = mir(LEG.knee, s), hock = mir(LEG.hock, s), sole = mir(LEG.sole, s);
    const pts = [hip, knee, hock, sole];
    const segL = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1], p[2] - pts[k][2]));
    const tj = [0, 0.4, 0.74, 1];
    const rings: LimbRing[] = legRings('paw', false, LEG.r, tj, segL, PADH).map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.7 : r.t < 0.4 ? 0.9 : 0.85) }));
    const foot: FootSpec = { pad: LEG.r * 0.6, h: PADH, fwd: 0.4, nail: 'claw', lobe: 0.2, toeAround: 6,
      toes: [-26, 0, 26].map((a, k) => ({ a, len: LEG.r * (k === 1 ? 1.4 : 1.1), r: LEG.r * 0.17, claw: LEG.r * 0.6, curl: 0.7, drop: 0.3 })) };
    const leg = limb({ name: 'leg' + S, side: s, hip, knee, hock, sole, tj, rings, foot, around: 10, levels: 1, rise: 0.06,
      bones: { parent: bi('hips'), up: bi('thigh' + S), lo: bi('shin' + S), mid: bi('meta' + S), foot: bi('foot' + S) }, paint: furPaint(1, 0.08), clawPaint, k: 1 });
    leg.skin.reg = REG.legs; leg.toes.reg = REG.legs; leg.claws.reg = REG.claw; leg.toes.levels = 0; leg.claws.levels = 0;
    leg.toes.paint = handPaint;
    body.add(leg.skin); body.add(leg.toes); body.add(leg.claws);
  }
  yield 'legs';
  // ---- hanging strands: a mane down the neck and the back, the shoulders, a fringe off the backs of the arms
  const seats: LockSeat[] = [];
  seats.push(...seatsOn(torso, { u0: 0.4, u1: 0.6, v0: 0.45, v1: 0.98, rows: 16, cols: 4, wid: 0.03, lift: 0.25, droop: 0.7, sink: 0.12,
    len: (_u, v) => 0.12 + 0.12 * Math.sin(v * Math.PI), dir: () => nrm([0, -1, -0.35]), col: (u, v) => (h3(Math.floor(u * 90), Math.floor(v * 90), 4) < 0.4 ? 1 : 0), skin: spineSkin, seed: 41 }));
  for (const [u0, u1] of [[0.18, 0.34], [0.66, 0.82]]) seats.push(...seatsOn(torso, { u0, u1, v0: 0.7, v1: 0.88, rows: 5, cols: 4, wid: 0.03, lift: 0.3, droop: 0.8, sink: 0.12,
    len: () => 0.16, dir: () => nrm([0, -1, -0.15]), col: () => 0, skin: spineSkin, seed: 43 }));
  const lk = locks({ name: 'strands', seats, tiles: [FUR, DARK], steps: [3, 3], seed: 29 });
  if (lk) body.add(lk);
  const out = yield* body.buildGen({ den: o.den ?? 220, maxScale: 2, budget: 26000, fur: HB_FUR });
  return finishModel(body, out, bones);
}
/** the fur page: a long ragged coat everywhere but the face, the hands and the soles; longest on the shoulders, the
 *  back of the neck, the forearms' backs and the thighs */
const HB_FUR = furZones([
  { piece: /^(trunk|arm|leg)[LR]?$/, len: 0.45, clump: 0.7, tip: 0.3 },
  { piece: /^trunk$/, a: [0, 1.9, -0.02], b: [0, 2.25, 0.18], r: 0.16, len: 1, clump: 0.85 },
  ...[1, -1].flatMap((s): FurZone[] => [
    { piece: /^arm[LR]$/, a: [s * 0.2, 1.5, -0.04], b: [s * 0.21, 1.1, 0.02], r: 0.07, len: 1, clump: 0.85, facing: [0, 0, -1], min: -0.2 },
    { piece: /^trunk$/, a: [s * 0.16, 1.95, 0.08], b: [s * 0.2, 2.02, 0.08], r: 0.1, len: 0.9, clump: 0.8 },
  ]),
  { piece: /^skull$/, a: [0, 2.38, 0.24], b: [0, 2.3, 0.2], r: 0.08, len: 0.7, clump: 0.8 },
  { piece: /^leg[LR]$/, a: [0, 0.4, 0], b: [0, 0, 0], r: 0.5, soft: 0.3, bare: true, len: 0 },
]);
export const HB_FUR_SPEC = { length: 0.075, shells: 14, comb: [0, -0.8, -0.3] as [number, number, number], clump: 6, clumpPull: 0.75, density: 0.8, rootDark: 0.35, tip: 0x9aa0a8, tipK: 0.15, droop: 0.5, hz: 1.8, fins: 0.7, springs: [{ bones: ['armL', 'armR'], hz: 2.4 }, { bones: ['neck2'], hz: 2.2 }] };
void gridSurf; void Px; void wet;
export type { Chart, Piece };
