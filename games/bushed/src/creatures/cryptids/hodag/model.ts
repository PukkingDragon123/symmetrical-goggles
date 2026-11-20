// THE HODAG (Rhinelander, Wisconsin, 1893: "the head of a frog, the grinning face of a giant elephant, thick short
// legs set off by huge claws, the back of a dinosaur, and a long tail with spears at the end"; Tryon 1939 gives it
// horns and spines). This one, an original design: a squat, heavy swamp brute about 2.8 m from snout to tail spear,
// built like a low bull with a reptile's hide. A long bull's head with a flat poll between two bony horn bosses, a
// heavy brow shelf over small deep-set gold eyes with slit pupils, broad cheekbones, a flat-topped muzzle wrinkled
// across the bridge ending in a leathery nose pad with flared comma nostrils; a frog's grin running back past the
// eyes, rubbery lips (the upper lip rolls over the lower), fangs at the corners; a wrinkled, veined throat sac under
// the jaw that balloons when it bellows. A shoulder hump, a deep chest with a dewlap of folded skin hanging between
// the forelegs, a sagging belly, heavy haunches; a row of keeled bony plates down the back and the tail, ending in a
// three-bladed spear; thick scaly legs with elbow and knee folds on broad clawed paws. A coarse black mane on the
// shoulders and a forelock between the horns.
// Paint: dark olive-umber back banded across like a crocodile, a warm straw belly in transverse scutes, a darker
// face mask over the brow and the eyes; scales drawn in rows down the flanks, pebbled on the head and legs, brush
// strokes running with the form, cool violet in the deep shadows, pale bone plates with growth bands.
// Creature space: metres, +z forward, +y up, ground y = 0.
import {
  Body, trunk, limb, legRings, paintedEye, locks, stalk, curve, chainSkin, sac, gridSurf, hand, Px, RP, cell3, h3, cl,
  type V3, type Station, type FootSpec, type LockSeat, type LimbRing, type Chart, type Piece, type FurPaint,
} from '../../anatomy';
import { fbm3, seatsOn } from '../../paintkit';
import { bonesKit, boneIndex, solid, wet, finishModel, sculpt, almondLid, REG, type CryptidModel, type ModelGen, type Dab } from '../kit';
import type { BoneDef } from '../../rig';

export const HODAG_MODEL_VERSION = 'hodag@6';
/** the head bone (the back of the skull over the jaw hinge) */
export const HH: V3 = [0, 0.66, 0.6];
/** the eye's centre (left; head-local + HH) */
export const HODAG_EYE: V3 = [0.232, 0.748, 0.735];
export const HODAG_EYE_AX: V3 = [0.8, 0.2, 0.57];
const EYE_R = 0.05;
const TAIL_CTRL: V3[] = [[0, 0.62, -0.8], [0, 0.58, -1.02], [0, 0.5, -1.27], [0, 0.45, -1.52], [0, 0.46, -1.74], [0, 0.5, -1.9]];
const TAIL = curve(TAIL_CTRL, 7);
export const HODAG_LEGS = {
  f: { hip: [0.27, 0.5, 0.29] as V3, knee: [0.34, 0.29, 0.21] as V3, sole: [0.4, 0, 0.33] as V3, r: 0.13 },
  h: { hip: [0.29, 0.53, -0.5] as V3, knee: [0.35, 0.31, -0.39] as V3, sole: [0.39, 0, -0.55] as V3, r: 0.135 },
};
const PADH = 0.036;
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** head-local (relative to HH) to creature space */
const H = (x: number, y: number, z: number): V3 => [HH[0] + x, HH[1] + y, HH[2] + z];

export function hodagBones(): BoneDef[] {
  const { b, A } = bonesKit();
  A('root', null, [0, 0.6, -0.1]);
  A('chest', 'root', [0, 0.63, 0.24]);
  A('neck', 'chest', [0, 0.66, 0.45]);
  A('head', 'neck', HH);
  A('jaw', 'head', [0, 0.615, 0.55]);
  A('sac', 'jaw', [0, 0.46, 0.68]);
  A('tongue', 'jaw', [0, 0.598, 0.6]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('eye' + s, 'head', mir(HODAG_EYE, k)); A('lid' + s, 'head', mir(HODAG_EYE, k)); }
  A('hips', 'root', [0, 0.61, -0.5]);
  for (let k = 0; k < 5; k++) A('tail' + k, k === 0 ? 'hips' : 'tail' + (k - 1), TAIL[k]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const f = HODAG_LEGS.f;
    A('fu' + s, 'chest', mir(f.hip, k)); A('fl' + s, 'fu' + s, mir(f.knee, k)); A('ff' + s, 'fl' + s, mir([f.sole[0], PADH * 1.6, f.sole[2]], k));
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const h = HODAG_LEGS.h;
    A('hu' + s, 'hips', mir(h.hip, k)); A('hl' + s, 'hu' + s, mir(h.knee, k)); A('hf' + s, 'hl' + s, mir([h.sole[0], PADH * 1.6, h.sole[2]], k));
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ the head's plan
// Head-local tables by z (metres from HH forward): the crown's height, the half width at the cheeks, the jaw's
// underside. The mouth line rises behind z = 0.13 into the frog's grin, its corners curling up under the eyes.
const tab = (rows: [number, number][]) => (z: number) => {
  if (z <= rows[0][0]) return rows[0][1];
  for (let i = 0; i + 1 < rows.length; i++) if (z <= rows[i + 1][0]) { const f = (z - rows[i][0]) / (rows[i + 1][0] - rows[i][0]), s = f * f * (3 - 2 * f); return lerp(rows[i][1], rows[i + 1][1], s); }
  return rows[rows.length - 1][1];
};
/** distance (m, head-local) from the fold running from a nostril down and back round the muzzle to the lip */
const nasoFold = (ax: number, hy: number, hz: number) => {
  if (hz < 0.36 || hy > 0.03 || hy < mouthY(hz) - 0.005) return 1;
  const t = cl((0.03 - hy) / (0.03 - mouthY(hz)), 0, 1), x = 0.11 + t * 0.07, z = 0.475 - t * 0.07;
  return Math.hypot(ax - x, (hz - z) * 0.6);
};
export const mouthY = (z: number) => -0.08 + 0.058 * Math.pow(cl((0.13 - z) / 0.2, 0, 1), 1.35);
const topY = tab([[-0.17, 0.08], [-0.1, 0.14], [-0.04, 0.172], [0.04, 0.184], [0.12, 0.17], [0.2, 0.14], [0.28, 0.112], [0.36, 0.09], [0.42, 0.074], [0.47, 0.058], [0.5, 0.03]]);
const halfW = tab([[-0.17, 0.17], [-0.1, 0.235], [-0.03, 0.275], [0.05, 0.29], [0.12, 0.282], [0.2, 0.242], [0.28, 0.196], [0.36, 0.186], [0.42, 0.19], [0.47, 0.18], [0.5, 0.14]]);
const jawBot = tab([[-0.08, -0.2], [-0.02, -0.228], [0.06, -0.23], [0.16, -0.214], [0.26, -0.192], [0.35, -0.172], [0.42, -0.158], [0.47, -0.14], [0.5, -0.118]]);
/** the half width of the upper lip's outer roll at z */
const lipW = (z: number) => halfW(z) * (z < 0 ? 0.9 : 0.97);
const UPPER_Z = [-0.17, -0.12, -0.07, -0.03, 0.01, 0.05, 0.09, 0.13, 0.17, 0.21, 0.25, 0.29, 0.33, 0.37, 0.41, 0.445, 0.475, 0.5];
const JAW_Z = [-0.07, -0.03, 0.02, 0.08, 0.15, 0.22, 0.29, 0.35, 0.4, 0.44, 0.475, 0.5];
/** the upper head's ring at z: crown, crown side, brow corner, temple, cheek, lower cheek, the upper lip's roll, its
 *  margin (hanging just below the mouth line), the palate */
function upperRing(z: number): number[][] {
  const T = topY(z), W = halfW(z), m = mouthY(z), lw = lipW(z);
  const brow = cl((z + 0.06) / 0.08, 0, 1) * cl((0.24 - z) / 0.08, 0, 1); // the brow shelf runs from the bosses to the stop
  const back = z < -0.05 ? cl((-0.05 - z) / 0.12, 0, 1) : 0, box = cl((z - 0.24) / 0.1, 0, 1);
  return [
    [0, T],
    [W * 0.44, T - 0.004 + brow * 0.004],
    [W * (0.8 + brow * 0.08 + box * 0.12), T - 0.03 - brow * 0.004 + box * 0.014],
    [W * (0.98 + brow * 0.03), T - 0.085 - brow * 0.01 + box * 0.03],
    [W * 1.0, m + 0.07],
    [W * 0.985, m + 0.032],
    [lw, m + 0.01],
    [lw - 0.013 - back * 0.02, m - 0.006],
    // the palate; at the front the upper lip's margin runs right across under the nose (the mouth closes there too)
    [0, m + 0.024 - 0.03 * cl((z - 0.38) / 0.08, 0, 1)],
  ];
}
/** the lower jaw's ring at z: the tongue bed, the gum, the lower lip's top, its outer roll, the crease under it, the
 *  jaw's side (the masseter at the back), its underside, the throat */
function jawRing(z: number): number[][] {
  const m = mouthY(z), jw = lipW(z) * 0.93, b = jawBot(z), mass = cl((0.08 - z) / 0.14, 0, 1);
  const front = cl((z - 0.38) / 0.08, 0, 1);
  return [
    [0, m - 0.016 + front * 0.008],
    [jw * 0.6, m - 0.006 + front * 0.008],
    [jw * 0.92, m + 0.011],
    [jw * 1.0, m - 0.012],
    [jw * 0.965, m - 0.036],
    [jw * (1.01 + mass * 0.06), (m + b) * 0.5 - 0.01],
    [jw * (0.84 + mass * 0.06), b * 0.9 + m * 0.1],
    [jw * 0.46, b],
    [0, b - 0.006],
  ];
}

// ------------------------------------------------------------------------------------------------ paint
const HIDE = RP('olive'), UMBER = RP('hide'), BELLY = RP('straw'), OCHRE = RP('ochre'), BONE = RP('bone'), HORN = RP('horn'), GOLD = RP('gold'), MANE = RP('squatch'), MOSS = RP('moss'), LIP = RP('flesh'), LEATHER = RP('leather');
/** where the coarse black mane grows (0..1): over the shoulder hump and down the sides of the neck, the forelock */
const maneAt = (x: number, y: number, z: number) => Math.max(
  cl(1.4 - Math.hypot(x / 0.3, (y - 0.9) / 0.16, (z - 0.34) / 0.22) * 1.4, 0, 1),
  cl(1.4 - Math.hypot((Math.abs(x) - 0.22) / 0.12, (y - 0.74) / 0.12, (z - 0.36) / 0.18) * 1.4, 0, 1),
  cl(1.4 - Math.hypot(x / 0.08, (y - 0.8) / 0.05, (z - 0.56) / 0.07) * 1.4, 0, 1));
/** the swamp hide over everything but the bones: a dark olive back banded across like a crocodile, warming to umber on
 *  the flanks, a straw belly in transverse scutes, the dewlap and throat paler; a darker mask over the face; scales in
 *  rows down the flanks and the legs, pebbles on the head; brush strokes along the form; violet in the deep shadow */
type Part = 'body' | 'leg' | 'tail' | 'skull' | 'jaw' | 'sac' | 'lid';
function hidePaint(part: Part) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    const hp = hand(px, { flow: part === 'sac' ? [0, -1, 0.3] : part === 'lid' ? 'across' : 'sweep', seed: part.length * 7 + 3 });
    const fld = hp.field();
    yield;
    const mane = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1], ax = Math.abs(x), s = (fld[i] - 0.5) * 2;
      const big = fbm3(x * 2.2 + 3, y * 2.2, z * 2.2, 2);
      let R = HIDE, st = 2.6;
      if (part === 'body' || part === 'tail' || part === 'leg') {
        // the belly: straw scutes below a wet, stroke-broken edge; the dewlap and throat paler still
        const bellyT = (part === 'tail' ? -0.55 : part === 'leg' ? -2 : -0.32) + s * 0.12 + big * 0.1;
        const bandZ = z + Math.sin(x * 9) * 0.03;
        if (ny < bellyT && y < 0.62) { R = BELLY; st = 3.9 + s * 0.45 + (y > 0.5 ? 0.3 : 0) - cl((ax - 0.12) / 0.2, 0, 1) * 0.8; }
        else {
          // the back: dark olive, crossed by darker bands that fade down the flanks, warming to umber low on the flanks
          const band = Math.abs(Math.sin(bandZ * 9 + 0.6)) < 0.3 + big * 0.14 + s * 0.06 && ny > -0.25;
          const flank = cl((0.3 - ny) * 1.6 + s * 0.2, 0, 1);
          R = flank > 0.55 ? UMBER : HIDE;
          st = (R === UMBER ? 2.8 : 2.3) + s * 0.6 + big * 0.4 - (band ? 1.4 * cl(ny + 0.45, 0, 1) : 0);
          if (part === 'leg') { R = HIDE; st = 2.3 + s * 0.5 + cl((y - 0.15) / 0.3, 0, 1) * 0.4; }
          // lichen-green where the swamp dries on its back
          if (ny > 0.7 && fbm3(x * 6 + 7, z * 6, y * 6, 2) > 0.42) { R = MOSS; st = 2.4 + s * 0.4; }
        }
        if (part === 'body') {
          // the mane: coarse black hair over the shoulder hump and down the sides of the neck
          const mk = maneAt(x, y, z) * cl(ny + 0.3, 0, 1);
          if (mk > 0.25 - s * 0.08) { mane[i] = mk; R = MANE; st = 2.6 + s * 0.8; }
        }
      } else if (part === 'skull' || part === 'jaw') {
        const hx = ax - HH[0], hy = y - HH[1], hz = z - HH[2], m = mouthY(hz);
        const inside = part === 'skull' ? ny < -0.6 && hy < m + 0.03 && ax < lipW(hz) - 0.014 : ny > 0.55 && hy > m - 0.022 && ax < lipW(hz) * 0.84;
        if (inside) { const deep = cl((0.4 - hz) / 0.45, 0, 1); px.put(i, RP('gum'), 2.6 - deep * 2.0 - (Math.abs(Math.sin(hz * 150)) < 0.2 && ax < 0.12 ? 0.8 : 0)); px.rough[i] = 210; continue; }
        // the lips: rubbery, warm and pale, a dark seam where they meet
        const dl = hy - m;
        if (Math.abs(dl) < px.mpt * 1.3 && ax > 0.03) { px.put(i, RP('ink'), 1); px.rough[i] = 70; continue; }
        if (dl > -0.03 && dl < 0.022) { px.put(i, dl > 0 ? HIDE : BELLY, (dl > 0 ? 3.6 : 2.6) + s * 0.4 + (Math.abs(dl) < 0.007 ? -0.6 : 0)); px.rough[i] = 150; continue; }
        if (part === 'jaw') {
          // the throat: straw, long folds; the jaw's sides olive
          if (ny < -0.25 || hy < m - 0.11) { R = BELLY; st = 3.7 + s * 0.45 + (ny < -0.8 ? 0.2 : 0); }
          else { R = HIDE; st = 2.5 + s * 0.5 + big * 0.3; }
        } else {
          // the face: olive, the crown and the brow darker (a mask through the eyes), the muzzle warmer and paler
          const mask = cl(1 - Math.hypot((hx - 0.2) / 0.16, (hy - 0.07) / 0.09, (hz - 0.1) / 0.18), 0, 1) + cl((hy - 0.1) / 0.06, 0, 1) * cl((0.2 - hz) / 0.1, 0, 1);
          R = HIDE; st = 2.9 + s * 0.5 - mask * 1.2 + cl((hz - 0.3) / 0.12, 0, 1) * 0.7;
          if (maneAt(x, y, z) > 0.3 - s * 0.08) { R = MANE; st = 2.6 + s * 0.8; mane[i] = 1; }
          // the nose pad: bare dark leather
          // the bare nose plate on the front of the muzzle, dark and wet, the nostrils comma slits in it
          // the bare muzzle: dark wet leather on the front of the nose, bleeding back into the scales through the
          // folds that run from the nostrils down to the lip (no hard edge)
          const pd = Math.hypot(ax / 0.105, (hy - 0.004) / 0.05, (hz - 0.5) / 0.045), fold = nasoFold(ax, hy, hz);
          if (pd < 1 + s * 0.15 + big * 0.1) { R = LEATHER; st = 1.8 + s * 0.4 + cl(pd - 0.55, 0, 0.5) * 1.6 + (N[i * 3 + 1] > 0.4 ? 0.7 : 0); }
          else if (fold < 0.005) st -= 1.2;
          const nos = Math.hypot((ax - 0.07 - (hy - 0.005) * 0.25) / 0.012, (hy - 0.004) / 0.03);
          if (hz > 0.46 && nos < 1) { R = LEATHER; st = 0; }
          // the bridge's wrinkles
          if (hz > 0.25 && hz < 0.4 && ny > 0.45 && Math.abs(Math.sin(hz * 150 + Math.sin(x * 40) * 0.6)) < 0.22) st -= 1.1;
          // under the eyes: a band of paler scales
          if (hz > 0.04 && hz < 0.2 && hy < 0.03 && hy > m + 0.03) st += 0.4;
        }
      } else if (part === 'sac') {
        R = BELLY; st = 3.8 + s * 0.5;
      }
      px.put(i, R, st); px.rough[i] = R === BELLY ? 150 : 200;
    }
    yield;
    // drawn scales: rows down the flanks and the tail (tips toward the tail), broad scutes under the belly, pebbles on
    // the legs and the face, the mane's hair over the hump
    const isR = (i: number, R: number[]) => px.rampT[px.rampI[i]] === R;
    if (part === 'body' || part === 'tail') {
      px.scales({ size: part === 'tail' ? 0.06 : 0.085, kind: 'keel', flow: -1, mask: (i) => (isR(i, HIDE) || isR(i, UMBER) || isR(i, MOSS) ? 1 : 0), ink: 0.9, lit: 0.55, shade: 0.45, seed: 5 });
      px.scales({ size: 0.085, kind: 'scute', flow: -1, mask: (i) => (isR(i, BELLY) ? 1 : 0), ink: 1.1, lit: 0.5, shade: 0.4, seed: 9 });
      px.pelt({ len: 0.08, width: 0.014, flow: -1, down: 0.9, tooth: 1.6, clump: 0.6, strands: 0.3, mask: (i) => mane[i] });
    } else if (part === 'leg') {
      px.pebbles(0.026, { mask: (i) => (P[i * 3 + 1] < 0.36 ? 1 : 0), depth: 0.5, seed: 4 });
      // swamp mud caked up the feet to a ragged line, a few splashes above it
      px.mud((i) => 0.11 + Math.sin(P[i * 3 + 2] * 30) * 0.015, RP('soil'), { clump: 0.03, seed: 7 });
      px.scales({ size: 0.05, kind: 'shield', flow: 1, mask: (i) => (P[i * 3 + 1] >= 0.36 ? 1 : 0), ink: 1.0, lit: 0.5, shade: 0.5, seed: 6 });
    } else if (part === 'skull' || part === 'jaw') {
      px.pebbles(0.02, { mask: (i) => (isR(i, HIDE) || isR(i, UMBER) ? 1 : 0), depth: 0.5, seed: 8 });
      px.pelt({ len: 0.05, width: 0.012, flow: -1, down: 0.5, tooth: 1.4, clump: 0.5, strands: 0.3, mask: (i) => mane[i] });
      px.pebbles(0.03, { mask: (i) => (isR(i, BELLY) ? 0.7 : 0), depth: 0.4, seed: 3, aniso: [1, 2.5, 1] });
      px.pebbles(0.01, { mask: (i) => (isR(i, LEATHER) ? 1 : 0), depth: 0.6, seed: 2, pores: 0.4 });
    } else if (part === 'sac') {
      // the throat sac: folds of loose skin, a web of veins
      for (let i = 0; i < px.n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const c = cell3(x, y * 0.6, z, 0.04, 11);
        if (c.f2 - c.f1 < px.mpt * 0.9) { px.rampI[i] = px.ramp(UMBER); px.step[i] = 2.6; }
      }
      wet(px, () => 0.5, BELLY, 0.7);
    }
    yield;
    // the form under the key light, then strokes along the sweep (none over the hair: the pelt has its own)
    hp.form({ light: 2.2, ao: 2.0, cavity: 1.3, ridge: 0.7, lift: 0.2 });
    hp.strokes({ len: [6, 14], width: [2, 3], amp: 0.55, mask: (i) => (mane[i] > 0.2 ? 0 : 1) });
    if (part === 'skull' || part === 'jaw') hp.hollows([{ c: HODAG_EYE, r: 0.075, k: 1.4 }, { c: mir(HODAG_EYE, -1), r: 0.075, k: 1.4 }, ...[1, -1].flatMap((s2) => [{ c: H(s2 * 0.07, 0.004, 0.49), r: 0.03, k: 1.4 }, { c: H(s2 * 0.25, mouthY(-0.05), -0.05), r: 0.06, k: 1.2 }])]);
    if (part === 'skull') {
      // wet nostrils and a scar across the snout
      hp.wet((i) => (isR(i, LEATHER) ? 1 : 0), { ramp: RP('slate'), thr: 0.95, rough: 55 });
      px.scar([H(0.17, 0.08, 0.27), H(0.12, 0.09, 0.31), H(0.07, 0.085, 0.36)], 0.006, BONE);
    }
    px.flush();
  };
}
/** horn and plate: pale bone with growth bands near the root, darkening to a polished horn tip */
const bonePaint = (tipAt: (x: number, y: number, z: number) => number, dark = 0.78) => (ch: Chart, _p: Piece, b: Body) => {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  const hp = hand(px, { flow: 'sweep', seed: 13 });
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], t = tipAt(x, y, z);
    const ring = Math.abs(Math.sin(t * 34 + fbm3(x * 30, y * 30, z * 30, 2) * 0.6)) < 0.18;
    if (t > dark) { px.put(i, HORN, 2.4 + (t - dark) * 5 + (N[i * 3 + 1] > 0.3 ? 0.6 : 0)); px.rough[i] = 60; }
    else { px.put(i, BONE, 3.3 - t * 0.7 - (ring ? 1.1 : 0) - (t < 0.08 ? 1.0 : 0) + fbm3(x * 40, y * 40, z * 40, 2) * 0.5); px.rough[i] = 120; }
  }
  hp.form({ light: 2.0, ao: 1.6, cavity: 1.4, ridge: 0.9, lift: 0.3 });
  hp.strokes({ len: [5, 10], width: [2, 3], amp: 0.45 });
  px.glints(BONE, { mask: (i) => (tipAt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) > dark ? 1 : 0), every: 0.6, size: 0.05 });
  px.flush();
};
const clawPaint = solid(HORN, (x, y, z, ny, i) => 2.4 + (ny > 0.3 ? 1.2 : 0) - (h3(i, 2, 7) < 0.07 ? 0.8 : 0) + fbm3(x * 50, y * 50, z * 50, 2) * 0.5, 70, [1, 1.2, 1]);
const toothPaint = solid(BONE, (x, y, z, ny) => 4 + (ny > 0 ? 0.6 : 0) + fbm3(x * 80, y * 80, z * 80, 2) * 0.4 - (y < 0.58 ? 0.6 : 0), 70);
const tonguePaint = (ch: Chart, _p: Piece, b: Body) => {
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.6;
  for (let i = 0; i < px.n; i++) { px.put(i, RP('flesh'), 2.8 + fbm3(P[i * 3] * 40, P[i * 3 + 1] * 40, P[i * 3 + 2] * 40, 2) - (Math.abs(P[i * 3]) < 0.006 ? 1 : 0)); px.rough[i] = 40; }
  wet(px, () => 1, RP('flesh'));
  px.flush();
};

/** a tapered, keeled, ringed cage along a curve (horns, plates, spear blades, teeth); `twist` turns a flattened
 *  section along its length (rad over the whole length) */
function thorn(name: string, ctrl: V3[], r: (t: number) => number, skin: (p: V3) => number[], paint: Piece['paint'], o: { flat?: number; n?: number; around?: number; reg?: number; twist?: number; up?: V3; rings?: number } = {}) {
  const path = curve(ctrl, o.n ?? 6), flat = o.flat ?? 0.8, tw = o.twist ?? 0;
  const p = stalk({ name, path, r, around: o.around ?? 6, up: o.up,
    sec: (a, t) => { const b = a - tw * t; return 1 / Math.sqrt((Math.sin(b) / flat) ** 2 + Math.cos(b) ** 2) * (Math.cos(b) > 0.8 ? 1.08 : 1); },
    ringEvery: o.rings ?? 2, keel: true, capS: true, capE: true, skin, paint, levels: 1, k: 1.1 });
  p.reg = o.reg ?? REG.horn;
  return p;
}

// ------------------------------------------------------------------------------------------------ the build
export function* hodagModelGen(o: { page?: number; den?: number } = {}): ModelGen {
  const bones = hodagBones(), bi = boneIndex(bones);
  const body = new Body(o.page ?? 1024);
  body.seed = 1893;
  const J: V3[] = [[0, 0.63, -0.9], [0, 0.62, -0.5], [0, 0.6, -0.1], [0, 0.63, 0.24], [0, 0.66, 0.45], [0, 0.67, 0.64]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('root'), bi('chest'), bi('neck')], 0.35);
  // ---- the trunk: tail root, haunches, sagging belly, deep chest, the shoulder hump, the neck with its dewlap
  const st: Station[] = [
    { c: [0, 0.63, -0.88], s: [0.11, 0.11], p: 'ridge' },
    { c: [0, 0.628, -0.79], s: [0.2, 0.19], p: 'ridge' },
    { c: [0, 0.62, -0.66], s: [0.3, 0.265], p: 'hips', tw: [[2, 0.06, 0.04]] },
    { c: [0, 0.615, -0.49], s: [0.36, 0.29], p: 'hips', tw: [[2, 0.05, 0.02], [4, 0.04, 0]] },
    { c: [0, 0.6, -0.3], s: [0.385, 0.295], p: 'sag', tw: [[6, 0.04, -0.08], [7, 0, -0.07], [8, 0, -0.06]] },
    { c: [0, 0.6, -0.08], s: [0.41, 0.31], p: 'sag', tw: [[6, 0.05, -0.1], [7, 0, -0.09], [8, 0, -0.08]] },
    { c: [0, 0.625, 0.12], s: [0.41, 0.325], p: 'barrel', tw: [[8, 0, -0.06]] },
    { c: [0, 0.665, 0.27], s: [0.37, 0.34], p: 'shoulder', tw: [[0, 0, 0.12], [1, 0, 0.1], [2, 0.03, 0.04], [8, 0, -0.12], [7, -0.06, -0.08]] },
    { c: [0, 0.675, 0.4], s: [0.31, 0.29], p: 'neck', tw: [[0, 0, 0.06], [8, 0, -0.42], [7, -0.12, -0.2], [6, -0.04, -0.06]] },
    { c: [0, 0.665, 0.51], s: [0.265, 0.225], p: 'neck', tw: [[8, 0, -0.42], [7, -0.12, -0.18]] },
    { c: [0, 0.66, 0.59], s: [0.205, 0.175], p: 'round', tw: [[8, 0, -0.2]] },
  ];
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: [1, 1, 1, 1, 1, 1, 2, 2, 2, 1], capS: true, capE: true, k: 1, levels: 1,
    rings: [{ at: 9, s: 0.6, ink: true }, { at: 8, s: 0.4, ink: true }], cols: [{ j: 7, a: 7, b: 10, s: 0.8, ink: true }],
    skin: spineSkin, paint: hidePaint('body') }));
  torso.reg = REG.torso;
  body.finalize(torso);
  // the masses under the hide: shoulder blades either side of the hump, the forearm's top where the leg comes out, the
  // points of the hips, the belly sagging under its own weight, the folds of the dewlap and over the shoulders
  sculpt(torso, [
    { c: [0.17, 0.93, 0.25], r: [0.1, 0.06, 0.16], out: 0.025, sym: true },
    { c: [0.33, 0.62, 0.3], r: [0.12, 0.16, 0.14], out: 0.035, sym: true },
    { c: [0.27, 0.82, -0.55], r: [0.09, 0.07, 0.1], out: 0.03, sym: true, k: 3 },
    { c: [0.34, 0.62, -0.5], r: [0.12, 0.16, 0.16], out: 0.03, sym: true },
    { c: [0, 0.32, -0.15], r: [0.36, 0.14, 0.3], move: [0, -0.035, 0] },
    { c: [0.28, 0.42, -0.12], r: [0.14, 0.12, 0.26], out: 0.02, sym: true },
  ], (q, n) => {
    // transverse folds down the dewlap and across the throat, a fold behind each shoulder, wrinkles over the elbows
    const dew = cl((0.5 - q[1]) / 0.12, 0, 1) * cl((q[2] - 0.22) / 0.08, 0, 1) * cl((0.62 - q[2]) / 0.06, 0, 1) * cl(1 - Math.abs(q[0]) / 0.16, 0, 1);
    const fold = Math.pow(Math.abs(Math.sin(q[2] * 48 + Math.sin(q[0] * 20) * 0.6)), 3);
    const sh = cl(1 - Math.abs(q[2] - 0.08) / 0.05, 0, 1) * cl((Math.abs(q[0]) - 0.22) / 0.1, 0, 1) * cl((0.78 - q[1]) / 0.2, 0, 1);
    return -0.012 * dew * fold - 0.014 * sh - (n[1] < -0.5 ? 0.004 * Math.abs(Math.sin(q[2] * 36)) * cl((0.42 - q[1]) / 0.1, 0, 1) : 0);
  });
  yield 'trunk';

  // ---- the head: the upper head on the head bone, the lower jaw on the jaw bone
  const hb = bi('head'), jb = bi('jaw'), nk = bi('neck');
  const skullP = body.add(trunk({ name: 'skull', stations: UPPER_Z.map((z) => ({ c: H(0, 0, z), s: [1, 1], p: upperRing(z) })), tween: 0, capS: true, capE: true, k: 2.2, levels: 2,
    rings: [{ at: 0, s: 1.5 }, { at: UPPER_Z.length - 1, s: 1.2, ink: true }], cols: [{ j: 7, a: 2, b: UPPER_Z.length - 1, s: 2, ink: true }, { j: 6, a: 3, b: UPPER_Z.length - 1, s: 0.8 }, { j: 2, a: 3, b: 9, s: 0.6 }],
    skin: (p) => (p[2] < HH[2] - 0.1 ? [hb, 0.7, nk, 0.3] : [hb, 1]), paint: hidePaint('skull') }));
  skullP.reg = REG.head;
  body.finalize(skullP);
  const E = HODAG_EYE;
  const skullDabs: Dab[] = [
    // the eye's socket, the heavy brow shelf over it (overhanging forward and out), the cheekbone under it
    { c: E, r: [0.09, 0.08, 0.11], out: 0.022, sym: true, k: 1.5 },
    { c: E, r: 0.052, out: -0.02, sym: true, k: 2 },
    { c: H(0.228, 0.14, 0.15), r: [0.075, 0.036, 0.095], out: 0.026, move: [0.034, -0.008, 0.03], sym: true, k: 2 },
    { c: H(0.2, 0.15, 0.2), r: [0.035, 0.025, 0.03], out: 0.012, sym: true, k: 3 },
    { c: H(0.24, 0.135, 0.1), r: [0.035, 0.025, 0.03], out: 0.012, sym: true, k: 3 },
    { c: H(0.15, 0.17, 0.09), r: [0.07, 0.03, 0.11], out: 0.012, sym: true },
    { c: H(0.272, 0.01, 0.06), r: [0.04, 0.032, 0.11], out: 0.02, sym: true },
    // the poll: a bony ridge across the back of the crown between the bosses, a dip down the forehead's midline
    { c: H(0, 0.15, -0.06), r: [0.18, 0.03, 0.04], out: 0.015 },
    { c: H(0, 0.16, 0.08), r: [0.05, 0.03, 0.12], out: -0.008 },
    // the stop and the muzzle: a dip in front of the brows, the nasal bridge raised, the nose pad swollen
    { c: H(0, 0.1, 0.21), r: [0.12, 0.04, 0.05], out: -0.01 },
    { c: H(0, 0.085, 0.32), r: [0.06, 0.03, 0.12], out: 0.008 },
    { c: H(0.1, 0.03, 0.44), r: [0.08, 0.06, 0.06], out: 0.012, sym: true },
    // the nostrils: flared rims round deep comma pits on the front of the nose pad
    { c: H(0.072, 0.005, 0.478), r: [0.032, 0.036, 0.03], out: 0.01, sym: true },
    { c: H(0.07, 0.002, 0.485), r: [0.015, 0.024, 0.03], out: -0.028, sym: true, k: 1.5 },
    // the upper lip swells over the canines, the cheek pouch behind the grin's corner
    { c: H(0.17, -0.06, 0.29), r: [0.04, 0.03, 0.06], out: 0.012, sym: true },
    { c: H(0.27, -0.03, -0.02), r: [0.05, 0.05, 0.06], out: 0.018, sym: true },
  ];
  sculpt(skullP, skullDabs, (q, n) => {
    // wrinkles across the bridge (the "elephant's face"), crow's feet behind the eyes
    const hz = q[2] - HH[2], hy = q[1] - HH[1];
    const bridge = cl((hz - 0.24) / 0.04, 0, 1) * cl((0.42 - hz) / 0.04, 0, 1) * cl(n[1] * 2 - 0.6, 0, 1);
    const crow = cl(1 - Math.hypot(Math.abs(q[0]) - 0.25, hy - 0.04, hz - 0.03) / 0.05, 0, 1);
    // the folds from the nostrils down round the muzzle to the lip (they tie the nose plate into the face)
    const nf = nasoFold(Math.abs(q[0]), hy, hz);
    return -0.006 * bridge * Math.pow(Math.abs(Math.sin(hz * 150 + Math.sin(q[0] * 30) * 0.6)), 4) - 0.004 * crow * Math.pow(Math.abs(Math.sin(hy * 160 + hz * 40)), 4) - 0.007 * cl(1 - nf / 0.008, 0, 1) + 0.004 * cl(1 - Math.abs(nf - 0.012) / 0.006, 0, 1);
  });
  const jawP = body.add(trunk({ name: 'jaw', stations: JAW_Z.map((z) => ({ c: H(0, 0, z), s: [1, 1], p: jawRing(z) })), tween: 0, capS: true, capE: true, k: 1.8, levels: 2,
    rings: [{ at: JAW_Z.length - 1, s: 1.2 }], cols: [{ j: 2, a: 1, b: JAW_Z.length - 1, s: 2, ink: true }, { j: 4, a: 1, b: JAW_Z.length - 1, s: 1, ink: true }],
    skin: (p) => (p[2] < HH[2] - 0.05 && p[1] < HH[1] - 0.12 ? [jb, 0.6, nk, 0.4] : [jb, 1]), paint: hidePaint('jaw') }));
  jawP.reg = REG.jaw;
  body.finalize(jawP);
  sculpt(jawP, [
    { c: H(0.24, -0.15, -0.02), r: [0.06, 0.07, 0.08], out: 0.02, sym: true },
    { c: H(0, -0.13, 0.43), r: [0.08, 0.04, 0.05], out: 0.012 },
  ], (q) => {
    // long folds under the chin running back into the throat
    const under = cl((HH[1] - 0.15 - q[1]) / 0.05, 0, 1);
    return -0.005 * under * Math.pow(Math.abs(Math.sin(q[0] * 55 + Math.sin(q[2] * 12))), 3);
  });
  // the throat sac: a baggy pouch of loose, folded, veined skin under the jaw (it balloons when the sac bone swells)
  const sacP = body.add(sac({ name: 'sac', at: [0, 0.462, 0.68], n: [0, -1, 0.3], r: [0.15, 0.115, 0.075], skin: () => [bi('sac'), 1], paint: hidePaint('sac'), sink: 0.55, levels: 2, k: 1 }));
  sacP.reg = REG.jaw;
  body.finalize(sacP);
  sculpt(sacP, [{ c: [0, 0.38, 0.72], r: [0.12, 0.06, 0.1], move: [0, -0.015, 0.01] }], (q) => {
    // pleats round the pouch and a few deep creases: the skin gathered when it is empty
    const a = Math.atan2(q[0], q[2] - 0.68);
    return -0.007 * Math.pow(Math.abs(Math.sin(a * 7 + q[1] * 30)), 3) - 0.005 * Math.pow(Math.abs(Math.sin(q[1] * 90)), 6);
  });
  // a fat tongue lying in the jaw
  const tg = body.add(stalk({ name: 'tongue', path: curve([[0, 0.582, 0.6], [0, 0.572, 0.74], [0, 0.566, 0.86], [0, 0.562, 0.96]], 5), r: (t) => 0.046 * (1 - t * 0.5), around: 8, sec: (a) => (Math.cos(a) > 0 ? 0.36 : 0.5), capS: true, capE: true, levels: 1, k: 1.1, skin: () => [bi('tongue'), 1], paint: tonguePaint }));
  tg.reg = REG.mouth;
  // teeth: fangs at the front corners that stand over the lips, rows of pegs along both jaws
  let tk = 0;
  for (const s of [1, -1]) {
    for (const [z, len, r, up] of [[0.33, 0.085, 0.017, 1], [0.375, 0.05, 0.012, 1], [0.27, 0.04, 0.011, 1], [0.21, 0.034, 0.01, 1], [0.15, 0.03, 0.01, 1], [0.09, 0.026, 0.009, 1],
      [0.405, 0.07, 0.016, -1], [0.31, 0.034, 0.01, -1], [0.24, 0.03, 0.01, -1], [0.17, 0.026, 0.009, -1]] as const) {
      const w = lipW(z), m = mouthY(z), big = len > 0.06;
      const at: V3 = H(s * w * (big ? 0.88 : 0.82), m + up * 0.012, z);
      const dir: V3 = big ? [s * 0.2, -up, 0.1 * up] : [s * 0.08, -up, 0.08];
      const t = body.add(thorn('tooth' + tk++, [add(at, scl(nrm(dir), -r)), at, add(at, scl(nrm(dir), len * 0.55)), add(add(at, scl(nrm(dir), len)), [0, 0, big ? -0.012 * up : 0])], (tt) => r * Math.pow(1 - tt * 0.95, 0.85) + r * 0.03, () => [up > 0 ? hb : jb, 1], toothPaint, { n: 4, around: 5, reg: REG.mouth, rings: 0 }));
      t.levels = 0;
    }
  }
  // the eyes, deep in their sockets under the brow: gold with a slit pupil; thick upper and lower lids leave a narrow
  // almond of eye, the outer corner dropped (the brute looks sullen)
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(HODAG_EYE, s), ax: V3 = [s * HODAG_EYE_AX[0], HODAG_EYE_AX[1], HODAG_EYE_AX[2]];
    const e = body.add(paintedEye({ name: 'eye' + S, c, ax, r: EYE_R, bone: bi('eye' + S), iris: GOLD, pupil: 'slit', irisA: 0.8, pupilR: 0.16, sclera: RP('ochre'), side: s, k: 2.8 }));
    e.reg = REG.eye;
    body.add(almondLid({ name: 'lid' + S, c, ax, r: EYE_R, bone: bi('lid' + S), side: s, open: 0.58, w: 0.95, tilt: -0.08, peak: -0.15, thick: 0.34, root: 2.1, skin: { R: HIDE, step: 2.4, lash: RP('ink') } })).reg = REG.head;
    body.add(almondLid({ name: 'llid' + S, c, ax, r: EYE_R, bone: hb, side: s, lower: true, open: 0.42, w: 0.95, tilt: -0.08, thick: 0.3, root: 2.1, skin: { R: HIDE, step: 2.8, wet: BELLY } })).reg = REG.head;
  }
  // the horns: out of knobby bosses of bone either side of the poll, sweeping out, then forward and up, twisting as
  // they go, ringed with growth near the root, black and polished at the tips
  for (const s of [1, -1]) {
    const bossC = H(s * 0.2, 0.128, -0.065), dir0 = nrm([s * 0.9, 0.42, 0.02]);
    body.add(stalk({ name: 'boss' + (s > 0 ? 'L' : 'R'), path: [add(bossC, scl(dir0, -0.05)), add(bossC, scl(dir0, -0.01)), add(bossC, scl(dir0, 0.02)), add(bossC, scl(dir0, 0.045))], r: (t) => 0.078 - t * 0.012 + (t > 0.3 && t < 0.7 ? 0.006 : 0), around: 8,
      sec: (a) => 1 + 0.08 * Math.sin(a * 5) + 0.05 * Math.sin(a * 3 + 1), ringEvery: 1, capS: true, capE: true, levels: 1, k: 1.2, skin: () => [hb, 1],
      paint: bonePaint((x, y, z) => cl(Math.hypot(x - bossC[0], y - bossC[1], z - bossC[2]) / 0.3, 0, 1) * 0.3) })).reg = REG.horn;
    const ctrl: V3[] = [add(bossC, scl(dir0, 0.0)), H(s * 0.3, 0.17, -0.06), H(s * 0.42, 0.22, -0.02), H(s * 0.5, 0.31, 0.06), H(s * 0.49, 0.42, 0.16), H(s * 0.44, 0.49, 0.24)];
    const base = ctrl[0], tip = ctrl[ctrl.length - 1];
    let L = 0; { const pth = curve(ctrl, 20); for (let i = 1; i < pth.length; i++) L += Math.hypot(pth[i][0] - pth[i - 1][0], pth[i][1] - pth[i - 1][1], pth[i][2] - pth[i - 1][2]); }
    void tip;
    body.add(thorn('horn' + (s > 0 ? 'L' : 'R'), ctrl, (t) => 0.066 * Math.pow(1 - t * 0.96, 0.8) + 0.002, () => [hb, 1],
      bonePaint((x, y, z) => { const d = Math.hypot(x - base[0], y - base[1], z - base[2]); return cl(d / (L * 0.82), 0, 1); }),
      { n: 12, around: 8, flat: 0.72, twist: s * 1.4, rings: 1 }));
  }
  yield 'head';

  // ---- legs: short, thick and scaly, the elbow and knee in folds of skin, broad paws with long hooked claws
  for (const [k, fore] of [['f', true], ['h', false]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? HODAG_LEGS.f : HODAG_LEGS.h, hip = mir(L.hip, s), knee = mir(L.knee, s), sole = mir(L.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    let rings: LimbRing[] = legRings('bear', fore, L.r, [0, 0.5, 1], segL, PADH);
    // heavier muscle above, a thick wrist, folds of skin round the elbow (knee) and the wrist (ankle)
    rings = rings.map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.85 : r.t < 0.3 ? 1.08 : r.t > 0.8 ? 1.06 : 1.0), crease: r.t > 0.45 && r.t < 0.55 ? 1.2 : r.crease, ink: r.ink || (r.t > 0.45 && r.t < 0.55) }));
    const foot: FootSpec = { pad: L.r * 0.86, h: PADH, fwd: 0.32, nail: 'claw', lobe: 0.24, toeAround: 6,
      toes: [-50, -17, 17, 50].map((a, j) => ({ a, len: L.r * (j === 1 || j === 2 ? 0.36 : 0.27), r: L.r * 0.22, claw: L.r * (fore ? 0.9 : 0.66) * (j === 1 || j === 2 ? 1 : 0.8), curl: 0.66, drop: 0.32 })) };
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, foot, around: 12, levels: 1, rise: 0.12,
      bones: { parent: bi(fore ? 'chest' : 'hips'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: hidePaint('leg'), clawPaint, k: 1 });
    out.skin.reg = REG.legs; out.toes.reg = REG.legs; out.claws.reg = REG.claw; out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
    yield 'leg';
  }

  // ---- the tail: thick and keeled at the root, tapering, ending in a three-bladed spear
  const tailB = [0, 1, 2, 3, 4].map((k) => bi('tail' + k));
  const tailSkin = chainSkin(TAIL, tailB.concat([tailB[4]]).slice(0, 6), 0.4);
  const tailPath = curve(TAIL_CTRL, 14);
  const tail = body.add(stalk({ name: 'tail', path: tailPath, r: (t) => 0.15 * Math.pow(1 - t, 0.85) + 0.022, around: 12, sec: (a) => (Math.cos(a) > 0.85 ? 1.16 : Math.cos(a) < -0.5 ? 0.82 : 1) * (Math.abs(Math.sin(a)) > 0.6 ? 0.92 : 1), capS: false, capE: true, levels: 1, k: 1,
    skin: (p) => (p[2] > -0.84 ? [bi('hips'), 0.6, tailB[0], 0.4] : tailSkin(p)), paint: hidePaint('tail') }));
  tail.reg = REG.tail;
  body.finalize(tail);
  const tip = tailPath[tailPath.length - 1], pre = tailPath[tailPath.length - 3];
  const tdir = nrm([tip[0] - pre[0], tip[1] - pre[1], tip[2] - pre[2]]);
  const spearSkin = () => [tailB[4], 1];
  const blade = bonePaint((x, y, z) => cl(Math.hypot(x - tip[0], y - tip[1], z - tip[2]) / 0.3, 0, 1), 0.6);
  body.add(thorn('spear0', [add(tip, scl(tdir, -0.05)), tip, add(tip, scl(tdir, 0.14)), add(tip, scl(tdir, 0.28))], (t) => 0.05 * Math.sin(Math.min(1, 0.25 + t) * Math.PI * 0.95) + 0.003, spearSkin, blade, { flat: 0.3, n: 6, up: [1, 0, 0] }));
  for (const s of [1, -1]) {
    const side = nrm([s, 0, 0]);
    body.add(thorn('spear' + (s > 0 ? 1 : 2), [add(tip, scl(tdir, -0.03)), add(tip, add(scl(tdir, 0.02), scl(side, 0.03))), add(tip, add(scl(tdir, 0.05), scl(side, 0.1))), add(tip, add(scl(tdir, -0.02), scl(side, 0.17)))], (t) => 0.036 * (1 - t * 0.9) + 0.002, spearSkin, blade, { flat: 0.32, n: 5, up: [0, 1, 0] }));
  }
  yield 'tail';

  // ---- the plates down the back and the tail: keeled leaves of bone, alternating a little left and right, tallest
  // over the hump, leaning back, ringed with growth
  const R0 = torso.grids[0].v.length;
  const topAt = (z: number) => { let best = 0, bd = Infinity; for (let i = 0; i < R0; i++) { const q = gridSurf(torso.m, torso.grids[0], 0.5, i / (R0 - 1)); const d = Math.abs(q.p[2] - z); if (d < bd) { bd = d; best = i; } } return gridSurf(torso.m, torso.grids[0], 0.5, best / (R0 - 1)); };
  const zs = [0.5, 0.41, 0.32, 0.23, 0.13, 0.03, -0.08, -0.19, -0.3, -0.41, -0.52, -0.63, -0.74];
  zs.forEach((z, k) => {
    const q = topAt(z), sx = (k % 2 ? 1 : -1) * 0.022;
    const hgt = (0.1 + 0.13 * Math.exp(-(((z - 0.22) / 0.36) ** 2))) * (z > 0.45 ? 0.75 : 1), wid = hgt * 0.48 + 0.02;
    const b0: V3 = [q.p[0] + sx, q.p[1] - 0.035, q.p[2]], up: V3 = nrm(add(q.n, [0, 0.2, 0]));
    const c1 = add(add(b0, scl(up, hgt * 0.45)), [0, 0, -hgt * 0.06]), c2 = add(add(b0, scl(up, hgt * 0.82)), [0, 0, -hgt * 0.22]), c3 = add(add(b0, scl(up, hgt + 0.035)), [0, 0, -hgt * 0.42]);
    body.add(thorn('plate' + k, [b0, add(b0, scl(up, 0.03)), c1, c2, c3], (t) => wid * (0.72 + 0.62 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.6)) * (1 - Math.pow(t, 1.7)) + 0.003, () => spineSkin(q.p),
      bonePaint((x, y, zz) => cl((y - q.p[1]) / (hgt + 0.03), 0, 1), 0.8), { n: 7, flat: 0.28, around: 8, up: [0, 0, 1], rings: 1 }));
  });
  for (let k = 0; k < 6; k++) {
    const v = 0.08 + k * 0.15, q = gridSurf(tail.m, tail.grids[0], 0, v), len = 0.13 - k * 0.016, back = q.dv;
    const b0 = add(q.p, scl(q.n, -0.025)), wid = len * 0.45 + 0.012;
    body.add(thorn('tplate' + k, [b0, add(b0, scl(q.n, 0.025)), add(add(q.p, scl(q.n, len * 0.6)), scl(back, len * 0.2)), add(add(q.p, scl(q.n, len)), scl(back, len * 0.55))],
      (t) => wid * (0.8 + 0.4 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.62)) * Math.pow(1 - t, 0.7) + 0.003, () => tailSkin(q.p),
      bonePaint((x, y, zz) => cl(Math.hypot(x - q.p[0], y - q.p[1], zz - q.p[2]) / (len * 1.1), 0, 1), 0.8), { n: 5, flat: 0.3, around: 8, up: [0, 0, 1], rings: 1 }));
  }
  yield 'plates';

  // ---- the shag: coarse locks hanging off the shoulder hump and down the sides of the neck
  const seats: LockSeat[] = [];
  const down: V3 = [0, -1, -0.25];
  for (const [u0, u1] of [[0.18, 0.4], [0.6, 0.82]]) {
    seats.push(...seatsOn(torso, {
      u0, u1, v0: 0.62, v1: 0.92, rows: 10, cols: 5, wid: 0.03, lift: 0.3, droop: 0.55, sink: 0.12,
      len: (u, v) => (0.12 + 0.06 * Math.sin((v - 0.62) / 0.3 * Math.PI)) * (1 - Math.abs(u - (u0 + u1) / 2) * 1.6) * (0.85 + 0.3 * h3(Math.floor(u * 50), Math.floor(v * 50), 3)),
      dir: (_p, n) => nrm([n[0] * 0.2, down[1], down[2] + n[2] * 0.1]),
      col: (u, v) => (h3(Math.floor(u * 97), Math.floor(v * 97), 2) < 0.35 ? 1 : 0), skin: spineSkin, seed: 7,
      keep: (p) => p[1] > 0.58,
    }));
  }
  const lk = locks({ name: 'shag', seats, tiles: [MANE, RP('fur')], steps: [2, 2], seed: 23 });
  if (lk) body.add(lk);
  const out = yield* body.buildGen({ den: o.den ?? 220, maxScale: 2, budget: 36000, fur: HODAG_FUR });
  return finishModel(body, out, bones);
}
/** the fur page: a coarse black mane over the shoulder hump and down the neck and a forelock between the horns, where
 *  the hide is painted black (maneAt); the scaly hide, the belly and everything bony stay bare */
const HODAG_FUR: FurPaint = (p, n, piece) => {
  if (piece !== 'trunk' && piece !== 'skull') return null;
  const m = maneAt(p[0], p[1], p[2]) * cl(n[1] + 0.6, 0, 1);
  if (m < 0.3) return null;
  return [Math.min(1, m * 1.3), 0.45 + 0.55 * m, 0.85, 0.45];
};
/** shell-fur settings for the hodag's coarse shag */
export const HODAG_FUR_SPEC = { length: 0.11, shells: 14, comb: [0, -0.75, -0.35] as [number, number, number], clump: 6, clumpPull: 0.7, density: 0.85, rootDark: 0.45, tipK: 0.45, droop: 0.45, hz: 2.2, fins: 0.6 };
export type { CryptidModel };
