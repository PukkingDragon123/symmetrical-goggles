// THE HIDEBEHIND (Tryon 1939 and lumber-camp tellings: a large, powerful thing nobody has ever seen, because whenever
// you look at it it is behind something; it takes men who do not come back to camp; it cannot abide liquor). This
// one: some 2.4 m tall standing and starved to a rack of bones (it can stand behind a spruce and not show), hunched,
// a stringy neck thrust forward. The ribs, the knobs of the spine and the blades of the shoulders stand out under a
// grey hide where the mange has taken the coat; elsewhere black hair hangs off it in matted hanks. A narrow, hairless
// head like a bare skull: a high vault, a heavy brow over sockets so deep the eyes are only two points of green
// light in a flashlight, knife-edge cheekbones over hollow cheeks, a long lipless muzzle that shows every needle
// tooth to the gum, a long hinged jaw. Arms hang below the knees on knobbly elbows to long hands of four jointed
// fingers ending in hooked black claws; digitigrade legs on long clawed toes.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, paintedEye, lids, lidPaint, locks, stalk, curve, chainSkin, RP, h3, cl, cell3,
  type V3, type Station, type FootSpec, type LockSeat, type LimbRing, type Chart, type Piece, type Px,
} from '../../anatomy';
import { seatsOn } from '../../paintkit';
import { furZones, type FurZone } from '../../fur';
import { bonesKit, boneIndex, finishModel, REG, type ModelGen } from '../kit';
import { ring, displace, carve, ridge, flap, digit, brush, bone, gs, sm, add, sub, nrm } from '../sculpt';
import type { BoneDef } from '../../rig';

export const HIDEBEHIND_MODEL_VERSION = 'hidebehind@5';
export const HB_HEAD: V3 = [0, 2.3, 0.3];
/** the eye, deep in its socket (head-local SOCK) */
export const HB_EYE: V3 = [0.04, 2.347, 0.363];
export const HB_EYE_AX: V3 = [0.42, 0.06, 0.9];
const JAW_HINGE: V3 = [0, 2.255, 0.296];
const ARM = { sh: [0.17, 2.0, 0.09] as V3, el: [0.26, 1.48, -0.02] as V3, wr: [0.29, 0.98, 0.09] as V3, r: 0.05 };
const LEG = { hip: [0.105, 1.17, 0.0] as V3, knee: [0.14, 0.76, 0.2] as V3, hock: [0.14, 0.33, -0.1] as V3, sole: [0.14, 0, 0.02] as V3, r: 0.085 };
const PADH = 0.02;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
/** which way the hair lies (creature space): the shell fur's comb, so the painted locks and the shells agree */
const COMB: V3 = [0, -0.8, -0.3], HEADCOMB: V3 = [0, -0.25, -1];

export function hidebehindBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('hips', null, [0, 1.2, 0]);
  A('spine', 'hips', [0, 1.5, 0.03]);
  A('chest', 'spine', [0, 1.84, 0.07]);
  A('neck', 'chest', [0, 2.06, 0.135]);
  A('neck2', 'neck', [0, 2.2, 0.205]);
  A('head', 'neck2', HB_HEAD);
  A('jaw', 'head', JAW_HINGE);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(HB_EYE, k)); A('lid' + s, 'head', mir(HB_EYE, k)); A('ear' + s, 'head', [k * 0.07, 2.365, 0.27]); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A('cla' + s, 'chest', [k * 0.07, 1.99, 0.1]);
    A('arm' + s, 'cla' + s, mir(ARM.sh, k)); A('elb' + s, 'arm' + s, mir(ARM.el, k)); A('hand' + s, 'elb' + s, mir(ARM.wr, k));
    A('fing' + s, 'hand' + s, mir(add(ARM.wr, [0, -0.13, 0.02]), k)); A('fing2' + s, 'fing' + s, mir(add(ARM.wr, [0, -0.24, 0.03]), k));
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A('thigh' + s, 'hips', mir(LEG.hip, k)); A('shin' + s, 'thigh' + s, mir(LEG.knee, k)); A('meta' + s, 'shin' + s, mir(LEG.hock, k)); A('foot' + s, 'meta' + s, mir([LEG.sole[0], PADH * 1.6, LEG.sole[2]], k));
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ the torso
/** stations up the body (a vertical path: profile top = the back, bottom = the belly) */
const TORSO: Station[] = [
  { c: [0, 1.0, -0.035], s: [0.05, 0.045], p: ring() },
  { c: [0, 1.07, -0.022], s: [0.112, 0.082], p: ring([[35, 0.1, 28]], { sq: 0.3 }) },                                       // the wasted buttocks
  { c: [0, 1.17, -0.004], s: [0.13, 0.08], p: ring([[0, 0.07, 9], [112, 0.17, 20], [180, -0.2, 32]]) },                       // the hip bones stand out, the belly falls in
  { c: [0, 1.29, 0.01], s: [0.088, 0.07], p: ring([[0, 0.12, 10], [28, -0.06, 14], [165, -0.24, 38]]) },                       // the pinched waist, a hollow belly
  { c: [0, 1.41, 0.024], s: [0.124, 0.09], p: ring([[0, 0.09, 10], [100, 0.1, 30], [180, -0.16, 22]]) },                       // the flare of the last ribs
  { c: [0, 1.52, 0.038], s: [0.138, 0.1], p: ring([[0, 0.06, 10], [105, 0.05, 40]]) },
  { c: [0, 1.63, 0.052], s: [0.143, 0.104], p: ring([[0, 0.04, 10], [175, 0.06, 16]]) },                                       // the keel of the breastbone
  { c: [0, 1.74, 0.067], s: [0.145, 0.104], p: ring([[0, -0.05, 12], [42, 0.12, 22], [172, 0.05, 18]]) },                      // the blades either side of a sunken spine
  { c: [0, 1.85, 0.085], s: [0.152, 0.1], p: ring([[0, -0.04, 10], [40, 0.16, 22], [92, 0.06, 25], [158, -0.08, 25]]) },        // the hunch
  { c: [0, 1.95, 0.104], s: [0.128, 0.085], p: ring([[0, 0.05, 15], [48, 0.1, 30], [96, 0.1, 20], [148, 0.08, 18], [180, -0.16, 14]]) }, // the traps, the shoulder points, the collarbones, the notch
  { c: [0, 2.04, 0.135], s: [0.068, 0.062], p: ring([[0, 0.12, 12], [128, 0.16, 20], [180, -0.06, 14]]) },                     // the knob at the base of the neck, the cords
  { c: [0, 2.13, 0.178], s: [0.05, 0.05], p: ring([[0, 0.09, 12], [124, 0.2, 18], [180, 0.07, 12]]) },
  { c: [0, 2.21, 0.222], s: [0.045, 0.048], p: ring([[0, 0.06, 12], [124, 0.13, 18]]) },
  { c: [0, 2.27, 0.262], s: [0.042, 0.045], p: ring() },
];
/** the body's centre line (z) at a height, from the stations */
const czAt = (y: number) => {
  for (let k = 0; k + 1 < TORSO.length; k++) { const a = TORSO[k].c, b = TORSO[k + 1].c; if (y <= b[1]) return a[2] + (b[2] - a[2]) * cl((y - a[1]) / (b[1] - a[1]), 0, 1); }
  return TORSO[TORSO.length - 1].c[2];
};
/** the bones under the hide: ribs sloping down to the front, the knobs of the spine, the shoulder blades, the
 *  collarbones */
function torsoBones(p: V3, n: V3): number {
  const [x, y, z] = p, cz = czAt(y), rz = z - cz, ax = Math.abs(x);
  let d = 0;
  // ribs: not over the back muscles, fading out before the breastbone
  const rb = ribAt(x, y, z);
  if (rb.w > 0) d += rb.w * (0.0115 * gs(rb.f, 0.42, 0.15) - 0.0042);
  void rz;
  // the spine: a knob every 3.6 cm from the tail to the skull, on the midline of the back
  const back = cl(-n[2] * 0.8 + n[1] * 0.5 + 0.2, 0, 1);
  if (y > 1.02 && y < 2.24 && ax < 0.03 && back > 0) {
    const f = (((y - 1.02) / 0.036) % 1 + 1) % 1;
    d += back * gs(ax, 0, 0.011) * (0.0055 * gs(f, 0.5, 0.2) + 0.002);
  }
  // the shoulder blades: the inner edge and the spine of each blade
  const sx = x >= 0 ? 1 : -1;
  d += ridge([[sx * 0.066, 1.72, czAt(1.72) - 0.1], [sx * 0.072, 1.86, czAt(1.86) - 0.104], [sx * 0.085, 1.94, czAt(1.94) - 0.09]], p, 0.022, 0.0085);
  d += ridge([[sx * 0.07, 1.88, czAt(1.88) - 0.104], [sx * 0.15, 1.96, czAt(1.96) - 0.04]], p, 0.016, 0.006);
  // the collarbones
  d += ridge([[sx * 0.02, 1.985, czAt(1.985) + 0.075], [sx * 0.07, 1.975, czAt(1.975) + 0.085], [sx * 0.13, 1.99, czAt(1.99) + 0.045]], p, 0.014, 0.006);
  // the crests of the hip bones
  d += ridge([[sx * 0.1, 1.2, czAt(1.2) - 0.04], [sx * 0.13, 1.19, czAt(1.19) + 0.02], [sx * 0.11, 1.15, czAt(1.15) + 0.07]], p, 0.02, 0.006);
  return d;
}

// ------------------------------------------------------------------------------------------------ the head
// head-local stations along z (y up): 11-point half profiles from the crown down the side to the palate. A high vault
// over a short face; the sockets, the brow, the cheekbones and the nasal pit are carved and raised afterwards
const HS: [number, number, number, number, number[][]][] = [
  [-0.082, 0.03, 0.045, 0.055, ring()],
  [-0.056, 0.034, 0.07, 0.088, ring([[0, 0.03, 10]])],
  [-0.02, 0.038, 0.08, 0.1, ring([[0, 0.03, 10], [150, -0.16, 30]])],
  [0.015, 0.038, 0.078, 0.098, ring([[70, -0.06, 14], [150, -0.16, 30]])],                         // the temples hollow
  [0.045, 0.033, 0.075, 0.09, ring([[105, 0.06, 12], [130, -0.1, 14], [160, -0.1, 25]])],         // the cheekbones over hollow cheeks
  [0.07, 0.02, 0.064, 0.076, ring([[105, 0.05, 12], [130, -0.08, 14]])],
  [0.096, 0.005, 0.048, 0.06, ring([[0, 0.04, 10], [24, -0.06, 12]], { sq: 0.5 })],              // the muzzle: a nasal ridge, flat sides
  [0.124, -0.007, 0.038, 0.048, ring([[0, 0.04, 10], [24, -0.06, 12]], { sq: 0.6 })],
  [0.15, -0.017, 0.028, 0.036, ring([], { sq: 0.5 })],
  [0.167, -0.023, 0.018, 0.024, ring()],
  [0.177, -0.026, 0.007, 0.01, ring()],
];
/** the eye socket (head-local): the eye's centre and the way it looks */
const SOCK: V3 = [0.04, 0.047, 0.063], SOCK_AX: V3 = nrm([0.42, 0.06, 0.9]);
/** the lower jaw (head-local): long and narrow, the ramus deep at the hinge, a trough on top for the tongue */
const JS: [number, number, number, number][] = [[-0.005, -0.062, 0.05, 0.03], [0.04, -0.067, 0.046, 0.022], [0.088, -0.069, 0.038, 0.018], [0.128, -0.068, 0.03, 0.015], [0.158, -0.065, 0.02, 0.013], [0.173, -0.063, 0.009, 0.007]];
const JAWP = [[0, 0.55], [0.3, 0.66], [0.62, 0.8], [0.92, 0.66], [1, 0.12], [0.94, -0.38], [0.72, -0.78], [0.36, -0.97], [0, -1]];
/** the ribs under the hide: their height phase at a point (0..1 across one rib, the rib's crest at 0.42) and how
 *  much they show there */
function ribAt(x: number, y: number, z: number): { f: number; w: number } {
  const cz = czAt(y), th = Math.atan2(Math.abs(x), -(z - cz));
  const w = sm(0.55, 1.15, th) * (1 - sm(2.7, 3.02, th)) * sm(1.4, 1.47, y) * (1 - sm(1.8, 1.9, y));
  const yr = y + 0.075 * sm(0.6, 2.7, th), f = (((yr - 1.395) / 0.041) % 1 + 1) % 1;
  return { f, w };
}

// ------------------------------------------------------------------------------------------------ paint
const FUR = RP('squatch'), DARK = RP('basalt'), HIDE = RP('stone'), FACE = RP('bone'), GUM = RP('gum'), HORN = RP('horn'), BRUISE = RP('plum'), INK = RP('ink');
const hl = (x: number, y: number, z: number): V3 => [x - HB_HEAD[0], y - HB_HEAD[1], z - HB_HEAD[2]];
/** how thick the coat grows on the body (0 the mange-bare hide over the ribs and belly .. 1 matted hanks) */
function hairAt(part: 'trunk' | 'arm' | 'leg', x: number, y: number, z: number, _nx: number, ny: number, nz: number): number {
  const c = cell3(x, y, z, 0.06, 19), patch = (c.id % 7) < 2 ? 0.4 : (c.id % 7) === 3 ? -0.3 : 0; // bald patches eaten out of the coat, tufts left behind
  if (part === 'trunk') {
    const back = sm(-0.35, 0.4, -nz + ny * 0.3);
    const ribs = sm(1.38, 1.47, y) * (1 - sm(1.82, 1.94, y)), belly = (1 - sm(1.3, 1.42, y)) * sm(1.04, 1.14, y) * sm(0.05, 0.5, nz);
    const shoulders = sm(1.86, 1.96, y), hips = (1 - sm(1.1, 1.22, y)) * sm(-0.2, 0.3, -nz);
    return cl(0.3 + back * 0.8 + shoulders * 0.7 + hips * 0.4 - ribs * (1 - back * 0.8) * 1.1 - belly * 0.9 - patch * (1 - shoulders * 0.6), 0, 1);
  }
  if (part === 'arm') return cl(0.1 + sm(1.3, 1.75, y) * 0.8 + sm(-0.2, 0.5, -nz) * 0.45 - (1 - sm(1.03, 1.14, y)) - patch, 0, 1);
  return cl(sm(0.72, 1.05, y) * 1.05 + sm(-0.3, 0.4, -nz) * 0.2 - patch * 1.3 - (1 - sm(0.2, 0.36, y)) * 0.6, 0, 1);
}
/** the body: matted near-black hanks over a dead-grey hide drawn tight on the bones, each rib lit along its top and
 *  shadowed under, bruise-dark between them; old sores */
const bodyPaint = (part: 'trunk' | 'arm' | 'leg') => brush({
  light: 2.4,
  skin: { len: 0.034, wid: 0.007, flow: 'across', amp: 0.5, seed: 3 },
  fur: { len: 0.075, wid: 0.009, flow: COMB, amp: 0.6, tip: 0.9, root: 0.8, seed: 7 },
  texel: (px, i, x, y, z, nx, ny, nz, s) => {
    const hair = hairAt(part, x, y, z, nx, ny, nz);
    if (hair + 0.32 * s.fv > 0.55) {
      // hair: a cold black, the hanks' tips a dull rust, a few grey hanks over the shoulders
      const grey = y > 1.86 && s.fid < 0.1;
      px.put(i, grey ? DARK : FUR, grey ? 2.2 : 1.1); px.rough[i] = 245;
      return 1;
    }
    // bare hide: dead grey, each rib a lit ridge over a bruised groove
    let R = HIDE, st = 2.5 + (hair > 0.3 ? -0.4 : 0);
    if (part === 'trunk') {
      const rb = ribAt(x, y, z);
      if (rb.w > 0.2) { const k = rb.f + s.sv * 0.04; if (k > 0.3 && k < 0.5) st += 0.75 * rb.w; else if (k > 0.64 && k < 0.88) { st -= 0.8 * rb.w; } }
    }
    if (s.sid < 0.03 && ny < 0.3) { R = BRUISE; st = 1.4; }
    px.put(i, R, st); px.rough[i] = 175;
    return 0;
  },
});
/** the face: old yellowed bone of a skin drawn over the skull, the brow, the cheekbones and the bridge catching the
 *  light, black sockets with a stain running from each like old tears, the nasal pit, the gums bared along the edge */
function facePaint(part: 'skull' | 'jaw' | 'ear') {
  return brush({
    light: 2.6,
    skin: { len: 0.026, wid: 0.004, amp: 0.3, seed: 13 },
    fur: { len: 0.05, wid: 0.008, flow: HEADCOMB, amp: 0.6, tip: 0.9, root: 0.8, seed: 17 },
    texel: (px, i, X, Y, Z, nx, ny, nz, s) => {
      const [x, y, z] = hl(X, Y, Z), ax = Math.abs(x);
      // the back of the skull and the nape: the mane
      if (part === 'skull' && z < -0.035 + (y - 0.03) * 0.3 + s.fv * 0.006 && !(ny < -0.6)) { px.put(i, FUR, 1.1); px.rough[i] = 245; return 1; }
      if (part === 'ear') {
        const bowl = nx * Math.sign(X || 1) < 0.1 && nz > -0.2;
        px.put(i, bowl ? GUM : FACE, bowl ? 1.6 : 2.4); px.rough[i] = 170; return 0;
      }
      let R = FACE, st = 2.6 + (s.sid < 0.08 ? -0.7 : 0);
      // the inside of the mouth and the gums along the lipless edge
      if (part === 'jaw' && ny > 0.45 && ax < 0.034) { px.put(i, GUM, 1.4 - cl((0.14 - z) * 8, 0, 1)); px.rough[i] = 70; return 0; }
      if (part === 'skull' && ny < -0.45 && y < -0.042) { px.put(i, GUM, 1.2 - cl((0.14 - z) * 8, 0, 1)); px.rough[i] = 70; return 0; }
      if (part === 'skull' && y < -0.039 && y > -0.05 && z > 0.02) { R = GUM; st = 1.7 + s.sv * 0.4; }
      if (part === 'jaw' && ny > 0.1 && y > -0.058 && z > 0.02) { R = GUM; st = 1.7 + s.sv * 0.4; }
      // the sockets: black at the bottom, a dark ring at the rim, a stain running down the cheek from each
      const d = [ax - SOCK[0], y - SOCK[1], z - SOCK[2]], a = d[0] * SOCK_AX[0] + d[1] * SOCK_AX[1] + d[2] * SOCK_AX[2];
      const rho = Math.hypot(d[0] - SOCK_AX[0] * a, d[1] - SOCK_AX[1] * a, d[2] - SOCK_AX[2] * a);
      if (part === 'skull' && rho < 0.03 && a < 0.03) {
        if (rho < 0.023 || a < 0.014) { R = rho < 0.019 ? INK : DARK; st = rho < 0.019 ? 0.5 : 1.2; }
        else { R = HIDE; st = 1.4 + s.sv * 0.5; }
      } else if (part === 'skull' && y < SOCK[1] - 0.02 && y > -0.035 && Math.abs(z - (SOCK[2] + 0.004 + (SOCK[1] - y) * 0.15)) < 0.0055 + s.sv * 0.002 && ax > 0.035) { R = FACE; st = 1.6; }
      // the nasal pit: an upturned heart of black on the snout's front, rimmed with a pale lip of bone
      if (part === 'skull' && z > 0.13 && nz > 0.15) {
        const hy = y - 0.004, lobe = Math.min(Math.hypot(ax - 0.0055, hy - 0.004), 99), tri = ax < (hy + 0.016) * 0.42 && hy < 0.006 && hy > -0.016;
        const inside = lobe < 0.0062 || tri, rim = lobe < 0.0085 || (ax < (hy + 0.019) * 0.5 && hy < 0.009 && hy > -0.019);
        if (inside) { R = lobe < 0.0045 || (tri && ax < (hy + 0.012) * 0.3) ? INK : DARK; st = R === INK ? 0 : 1.2; }
        else if (rim) st += 0.9;
      }
      // fine lines of skin drawn tight across the snout
      if (part === 'skull' && z > 0.1 && ny > 0.2 && Math.abs(Math.sin(z * 260 + x * 30)) < 0.12 && s.sid > 0.3) st -= 0.9;
      void nz;
      px.put(i, R, st); px.rough[i] = 165;
      return 0;
    },
  });
}
const handPaint = brush({
  light: 2.4,
  skin: { len: 0.02, wid: 0.004, flow: 'across', amp: 0.45, seed: 23 },
  texel: (px, i, _x, _y, _z, _nx, ny) => { px.put(i, HIDE, 2.2 + (ny > 0.4 ? 0.3 : 0)); px.rough[i] = 170; return 0; },
});
const clawPaint = bone(HORN, { root: 1.0, tipStep: 5, rough: 70 });
const toothPaint = bone(RP('bone'), { root: 1.4, tipStep: 5, rough: 60 });

// ------------------------------------------------------------------------------------------------ the build
export function* hidebehindModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = hidebehindBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1939;
  const J: V3[] = [[0, 1.0, -0.03], [0, 1.2, 0], [0, 1.5, 0.03], [0, 1.84, 0.07], [0, 2.06, 0.135], [0, 2.2, 0.205], [0, 2.32, 0.3]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('spine'), bi('chest'), bi('neck'), bi('neck2')], 0.35);
  // ---- the torso: a narrow pelvis, a pinched waist, the ribs, bony hunched shoulders, a long stringy neck
  const torso = body.add(trunk({ name: 'trunk', stations: TORSO, tween: [1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1], capS: true, capE: true, k: 1, levels: 1, skin: spineSkin, paint: bodyPaint('trunk') }));
  torso.reg = REG.torso;
  displace(body, torso, torsoBones);
  yield 'trunk';
  // ---- the head: a bare skull of a head
  const H = HB_HEAD, hb = bi('head');
  const skull = body.add(trunk({ name: 'skull', stations: HS.map(([z, cy, w, h, p]) => ({ c: [0, H[1] + cy, H[2] + z], s: [w, h], p })), tween: 0, capS: true, capE: true, k: 2.2, levels: 2,
    rings: [{ at: 4, s: 0.6, ink: true }], skin: (p) => (p[2] < H[2] - 0.05 ? [hb, 0.6, bi('neck2'), 0.4] : [hb, 1]), paint: facePaint('skull') }));
  skull.reg = REG.head;
  // the sockets: carved deep round the eyes, under a brow; the cheekbones, the bridge, the nasal pit
  for (const s of [1, -1]) carve(body, skull, add(H, [s * SOCK[0], SOCK[1], SOCK[2]]), [s * SOCK_AX[0], SOCK_AX[1], SOCK_AX[2]], 0.027, 0.004, 0.024);
  displace(body, skull, (p) => {
    const [x, y, z] = hl(p[0], p[1], p[2]), sx = x >= 0 ? 1 : -1, q: V3 = [Math.abs(x), y, z];
    let d = ridge([[0.012, 0.075, 0.045], [0.03, 0.078, 0.06], [0.05, 0.072, 0.066], [0.066, 0.055, 0.058], [0.074, 0.035, 0.04]], q, 0.011, 0.007); // the brow
    d += ridge([[0.06, 0.016, 0.085], [0.07, 0.014, 0.05], [0.078, 0.022, 0.0], [0.074, 0.03, -0.03]], q, 0.008, 0.005);                        // the cheekbone and its arch
    d += ridge([[0, 0.06, 0.08], [0, 0.045, 0.12], [0, 0.025, 0.15]], q, 0.007, 0.0025);                                                        // the bridge of the nose
    d -= 0.007 * gs(Math.hypot(q[0] * 1.4, (z - 0.17) * 0.8, (y - 0.0) * 1.2), 0, 0.007);                                                     // the nasal pit
    d -= 0.004 * gs(Math.hypot(q[0] - 0.068, (y - 0.0) * 0.8, z - 0.05), 0, 0.01);                                                              // the hollow cheek
    void sx;
    return d;
  });
  const jawSkin = (): number[] => [bi('jaw'), 1];
  const jaw = body.add(trunk({ name: 'jaw', stations: JS.map(([z, cy, w, h]) => ({ c: [0, H[1] + cy, H[2] + z], s: [w, h], p: JAWP })), tween: [1, 1, 1, 1, 0], capS: true, capE: true, k: 1.8, levels: 1, skin: jawSkin, paint: facePaint('jaw') }));
  jaw.reg = REG.jaw;
  // needle teeth in both jaws, set along the lipless edges so the whole row shows
  const halfW = (z: number) => { for (let k = 0; k + 1 < HS.length; k++) if (z <= HS[k + 1][0]) return HS[k][2] + (HS[k + 1][2] - HS[k][2]) * cl((z - HS[k][0]) / (HS[k + 1][0] - HS[k][0]), 0, 1); return 0.007; };
  const jawW = (z: number) => { for (let k = 0; k + 1 < JS.length; k++) if (z <= JS[k + 1][0]) { const f = cl((z - JS[k][0]) / (JS[k + 1][0] - JS[k][0]), 0, 1); return [JS[k][2] + (JS[k + 1][2] - JS[k][2]) * f, JS[k][1] + (JS[k + 1][1] - JS[k][1]) * f, JS[k][3] + (JS[k + 1][3] - JS[k][3]) * f]; } return [0.009, -0.063, 0.007]; };
  let tk = 0;
  for (const s of [1, -1]) for (const up of [1, -1]) for (let k = 0; k < 8; k++) {
    const z = 0.04 + k * 0.017 + (up > 0 ? 0 : 0.0085);
    let x: number, y: number;
    if (up > 0) { x = halfW(z) * 0.52; y = -0.046; } else { const [w, cy, h] = jawW(z); x = w * 0.6; y = cy + h * 0.78; }
    const L = 0.011 + (k === 2 || k === 3 ? 0.009 : 0) + h3(k, s + 2, up + 5) * 0.005, at: V3 = add(H, [s * x, y, z]), lean = (h3(k, s, up) - 0.5) * 0.004;
    body.add(stalk({ name: 'tooth' + tk++, path: [add(at, [0, up * 0.005, 0]), at, add(at, [s * 0.001 + lean, -up * L * 0.55, 0.002]), add(at, [s * 0.0015 + lean, -up * L, 0.004])], r: (t) => 0.003 * (1 - t * 0.9) + 0.0004, around: 4, capS: true, capE: true, levels: 0, k: 1.2, skin: up > 0 ? () => [hb, 1] : jawSkin, paint: toothPaint })).reg = REG.mouth;
  }
  // the eyes: small, sunk deep in the sockets, black with a green ring that throws the light back
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(HB_EYE, s), ax: V3 = [s * HB_EYE_AX[0], HB_EYE_AX[1], HB_EYE_AX[2]];
    body.add(paintedEye({ name: 'eye' + S, c, ax, r: 0.0125, bone: bi('eye' + S), iris: RP('ichor'), pupil: 'round', pupilR: 0.42, irisA: 0.78, sclera: RP('basalt'), side: s, glintR: 0.16, k: 3 })).reg = REG.eye;
    for (const l of lids({ name: 'lid' + S, c, ax, r: 0.0125, bone: bi('lid' + S), lowBone: hb, upper: 0.5, lower: 0.66, tilt: -0.12, side: s, thick: 0.24, paint: lidPaint(HIDE, 1.6, { c, ax, r: 0.0125, lash: INK }) })) body.add(l).reg = REG.head;
    // small torn ears flattened back along the skull: cupped, rimmed, a dark bowl
    const er: V3 = add(H, [s * 0.07, 0.066, -0.03]);
    body.add(flap({ name: 'ear' + S, path: curve([add(er, [-s * 0.012, -0.004, 0.008]), er, add(er, [s * 0.014, 0.018, -0.03]), add(er, [s * 0.02, 0.03, -0.062])], 6), front: nrm([s, 0.4, 0.5]),
      w: (t) => 0.036 * Math.sin(Math.min(1, 0.25 + t) * Math.PI * 0.9) + 0.004, cup: (t) => 0.008 * (1 - t), thick: 0.005, skin: () => [bi('ear' + S), 1], paint: facePaint('ear'), levels: 1, k: 1.3 })).reg = REG.head;
  }
  yield 'head';
  // ---- arms hanging below the knees: wasted, knobbly at the elbow and wrist
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const sh = mir(ARM.sh, s), el = mir(ARM.el, s), wr = mir(ARM.wr, s), r = ARM.r;
    const ar: LimbRing[] = [
      { t: -0.3, r: r * 0.8, e: 1.25, off: [-0.45, 0] },
      { t: -0.08, r: r * 1.05, e: 1.15, b: [[90, 0.16, 50], [0, 0.06, 40]] },
      { t: 0.08, r: r * 0.9, e: 1.05, b: [[90, 0.14, 40], [10, 0.08, 40]] },
      { t: 0.2, r: r * 0.7, e: 1.08, b: [[0, 0.1, 35], [180, 0.14, 35]] },
      { t: 0.36, r: r * 0.6, e: 1.04 },
      { t: 0.46, r: r * 0.64, e: 1.0, b: [[180, 0.32, 28], [90, 0.16, 22], [-90, 0.2, 22]], crease: 1, ink: true },
      { t: 0.52, r: r * 0.7, e: 1.0, b: [[180, 0.42, 26], [90, 0.12, 22], [-90, 0.12, 22]] },
      { t: 0.6, r: r * 0.68, e: 1.02, b: [[15, 0.22, 40], [180, 0.08, 30]] },
      { t: 0.76, r: r * 0.52, e: 0.82, b: [[0, 0.06, 30]] },
      { t: 0.9, r: r * 0.44, e: 0.74, b: [[90, 0.26, 20], [-90, 0.2, 20]] },
      { t: 0.97, r: r * 0.46, e: 0.7 },
    ];
    const arm = limb({ name: 'arm' + S, side: s, hip: sh, knee: el, sole: [wr[0], wr[1] - 0.02, wr[2]], tj: [0, 0.5, 1], rings: ar, around: 12, levels: 1, rise: 0.03,
      foot: { pad: 0.03, h: 0.015, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('cla' + S), up: bi('arm' + S), lo: bi('elb' + S), foot: bi('hand' + S) }, paint: bodyPaint('arm'), clawPaint, k: 1 });
    arm.skin.reg = REG.arms;
    body.add(arm.skin);
    // the back of the hand: thin, the tendons and the four knuckles standing up
    const hb2 = bi('hand' + S), f1 = bi('fing' + S), f2 = bi('fing2' + S);
    const palm = body.add(trunk({ name: 'palm' + S, stations: [0, 0.045, 0.09, 0.125, 0.14].map((d, k) => ({ c: add(wr, [s * 0.004, -d - 0.01, 0.01 + d * 0.06]), s: [0.019, [0.032, 0.04, 0.045, 0.047, 0.04][k]] as [number, number], p: ring([[90, -0.05, 20]], { sq: 0.4 }) })),
      tween: [1, 1, 1, 0], capS: true, capE: true, levels: 1, k: 1.3, skin: (p) => (p[1] > wr[1] - 0.02 ? [bi('elb' + S), 0.3, hb2, 0.7] : [hb2, 1]), paint: handPaint }));
    palm.reg = REG.arms;
    // four long jointed fingers, each a hooked claw
    for (let f = 0; f < 4; f++) {
      const fz = (f - 1.5) * 0.024 + 0.012, len = [0.2, 0.235, 0.22, 0.17][f], base: V3 = add(wr, [0, -0.135, fz]);
      const path = curve([add(base, [0, 0.02, 0]), base, add(base, [-s * 0.008, -len * 0.42, 0.006 + (f - 1.5) * 0.004]), add(base, [-s * 0.024, -len * 0.76, 0.014 + (f - 1.5) * 0.008]), add(base, [-s * 0.04, -len, 0.02 + (f - 1.5) * 0.01])], 11);
      const sk = chainSkin([add(base, [0, 0.03, 0]), add(base, [0, -len * 0.45, 0]), add(base, [0, -len * 1.3, 0])], [f1, f2], 0.3);
      const [fin, claw] = digit({ name: 'fin' + S + f, path, r: 0.0105, joints: [0.12, 0.47, 0.78], pad: [-s, 0, 0.2], taper: 0.35, flat: 0.85, knuckle: 0.28, skin: sk, paint: handPaint, levels: 1, k: 1.2,
        claw: { len: 0.045, r: 0.0075, curl: 0.9, skin: () => [f2, 1], paint: clawPaint } });
      body.add(fin).reg = REG.arms; body.add(claw).reg = REG.claw;
    }
    const tb = add(wr, [-s * 0.016, -0.04, 0.035]);
    const [th, thc] = digit({ name: 'thm' + S, path: curve([tb, add(tb, [-s * 0.012, -0.04, 0.02]), add(tb, [-s * 0.022, -0.085, 0.03]), add(tb, [-s * 0.026, -0.12, 0.03])], 8), r: 0.011, joints: [0.4, 0.75], pad: [-s, 0, -0.3], taper: 0.3, skin: () => [hb2, 1], paint: handPaint, levels: 1,
      claw: { len: 0.03, r: 0.006, curl: 0.8, skin: () => [hb2, 1], paint: clawPaint } });
    body.add(th).reg = REG.arms; body.add(thc).reg = REG.claw;
    yield 'arm';
  }
  // ---- digitigrade legs, bone and sinew, on long clawed toes
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const hip = mir(LEG.hip, s), knee = mir(LEG.knee, s), hock = mir(LEG.hock, s), sole = mir(LEG.sole, s), r = LEG.r;
    const tj = [0, 0.4, 0.74, 1];
    const rings: LimbRing[] = [
      { t: -0.3, r: r * 0.95, e: 1.35, off: [-0.4, 0] },
      { t: -0.08, r: r * 1.05, e: 1.25, b: [[180, 0.2, 50], [90, 0.08, 40]] },
      { t: 0.1, r: r * 0.92, e: 1.18, b: [[10, 0.16, 40], [170, 0.18, 40]] },
      { t: 0.25, r: r * 0.68, e: 1.12, b: [[15, 0.1, 35], [175, 0.12, 35]] },
      { t: 0.35, r: r * 0.55, e: 1.05, b: [[0, 0.1, 30]] },
      { t: 0.4, r: r * 0.62, e: 1.0, b: [[0, 0.36, 28], [90, 0.16, 24], [-90, 0.16, 24]], crease: 1, ink: true },
      { t: 0.45, r: r * 0.56, e: 1.05, b: [[0, 0.18, 28]] },
      { t: 0.53, r: r * 0.58, e: 1.2, b: [[170, 0.34, 40], [0, 0.06, 20]] },
      { t: 0.64, r: r * 0.4, e: 1.25, b: [[180, 0.26, 20], [0, 0.08, 20]] },
      { t: 0.74, r: r * 0.4, e: 1.3, b: [[180, 0.6, 22], [90, 0.16, 25], [-90, 0.16, 25]], crease: 1, ink: true },
      { t: 0.82, r: r * 0.31, e: 1.15, b: [[180, 0.16, 24]] },
      { t: 0.92, r: r * 0.29, e: 1.05, b: [[0, 0.12, 28]] },
    ];
    const foot: FootSpec = { pad: r * 0.6, h: PADH, fwd: 0.4, nail: 'claw', lobe: 0.22, toeAround: 6,
      toes: [-28, -4, 22].map((a, k) => ({ a, len: r * (k === 1 ? 1.5 : 1.2), r: r * 0.16, claw: r * 0.62, curl: 0.8, drop: 0.3 })) };
    const leg = limb({ name: 'leg' + S, side: s, hip, knee, hock, sole, tj, rings, foot, around: 12, levels: 1, rise: 0.06,
      bones: { parent: bi('hips'), up: bi('thigh' + S), lo: bi('shin' + S), mid: bi('meta' + S), foot: bi('foot' + S) }, paint: bodyPaint('leg'), clawPaint, k: 1 });
    leg.skin.reg = REG.legs; leg.toes.reg = REG.legs; leg.claws.reg = REG.claw; leg.toes.levels = 1; leg.claws.levels = 1;
    leg.toes.paint = handPaint;
    body.add(leg.skin); body.add(leg.toes); body.add(leg.claws);
  }
  yield 'legs';
  // ---- matted hanks: a mane down the nape and the spine, the shoulders, a fringe off the backs of the arms
  const seats: LockSeat[] = [];
  seats.push(...seatsOn(torso, { u0: 0.4, u1: 0.6, v0: 0.55, v1: 0.98, rows: 14, cols: 4, wid: 0.026, lift: 0.2, droop: 0.75, sink: 0.12,
    len: (_u, v) => 0.1 + 0.14 * Math.sin(v * Math.PI), dir: () => nrm([0, -1, -0.3]), col: (u, v) => (h3(Math.floor(u * 90), Math.floor(v * 90), 4) < 0.3 ? 1 : 0), skin: spineSkin, seed: 41 }));
  for (const [u0, u1] of [[0.2, 0.36], [0.64, 0.8]]) seats.push(...seatsOn(torso, { u0, u1, v0: 0.72, v1: 0.88, rows: 5, cols: 4, wid: 0.026, lift: 0.3, droop: 0.85, sink: 0.12,
    len: () => 0.17, dir: () => nrm([0, -1, -0.15]), col: () => 0, skin: spineSkin, seed: 43 }));
  const lk = locks({ name: 'strands', seats, tiles: [FUR, DARK], steps: [2, 2], seed: 29 });
  if (lk) body.add(lk);
  const out = yield* body.buildGen({ den: o.den ?? 220, maxScale: 2, budget: 34000, fur: HB_FUR });
  return finishModel(body, out, bones);
}
/** the fur page: matted hair on the back, the shoulders, the outsides of the arms and the thighs; the hide bare over
 *  the ribs, the belly, the forearms' fronts, the shins, the hands and the face */
const HB_FUR = furZones([
  { piece: /^trunk$/, facing: [0, 0.2, -1], min: -0.35, len: 0.6, clump: 0.8, tip: 0.3 },
  { piece: /^trunk$/, y: [1.84, 2.3], len: 0.8, clump: 0.85 },
  { piece: /^trunk$/, a: [0, 1.9, -0.02], b: [0, 2.25, 0.18], r: 0.16, len: 1, clump: 0.85 },
  { piece: /^trunk$/, y: [1.0, 1.4], facing: [0, 0, -1], min: -0.6, len: 0.45, clump: 0.7 },
  { piece: /^trunk$/, y: [1.42, 1.84], facing: [0, 0, 1], min: -0.55, bare: true },
  { piece: /^trunk$/, y: [1.08, 1.4], facing: [0, 0, 1], min: 0.2, bare: true },
  { piece: /^arm[LR]$/, y: [1.2, 2.1], len: 0.7, clump: 0.8 },
  ...[1, -1].flatMap((s): FurZone[] => [
    { piece: /^arm[LR]$/, a: [s * 0.2, 1.45, -0.05], b: [s * 0.21, 1.08, 0.03], r: 0.07, len: 1, clump: 0.85, facing: [0, 0, -1], min: -0.2 },
    { piece: /^trunk$/, a: [s * 0.15, 1.94, 0.08], b: [s * 0.19, 2.0, 0.08], r: 0.1, len: 0.9, clump: 0.8 },
  ]),
  { piece: /^leg[LR]$/, y: [0.5, 1.25], len: 0.65, clump: 0.8 },
  { piece: /^skull$/, a: [0, 2.36, 0.22], b: [0, 2.28, 0.2], r: 0.07, len: 0.7, clump: 0.8 },
]);
export const HB_FUR_SPEC = { length: 0.075, shells: 14, comb: [0, -0.8, -0.3] as [number, number, number], clump: 6, clumpPull: 0.8, density: 0.8, rootDark: 0.35, tip: 0x9aa0a8, tipK: 0.12, droop: 0.55, hz: 1.8, fins: 0.7, springs: [{ bones: ['armL', 'armR'], hz: 2.4 }, { bones: ['neck2'], hz: 2.2 }] };
export type { Chart, Piece, Px };
void sub;
