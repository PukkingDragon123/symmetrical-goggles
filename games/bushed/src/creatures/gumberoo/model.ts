// THE GUMBEROO (Cox 1910: a big, round creature of the burned-over lands whose tough hide makes bullets and axes
// bounce off; a forest fire is the only thing that can harm it). v4, a SCALY BEAST: hulking and low-slung, the weight
// on heavy shoulders under a hump of muscle, a sagging belly between short, powerful bowed legs on broad clawed feet; a
// thick creased neck into a broad flat head with real jaws (an upper jaw over a heavy lower one, a crooked grin of
// blunt pegs and two lower tusks), amber slit eyes on top of the skull under keeled brow plates, two blunt ringed horns
// out of bony bosses. Armour: rows of thick keeled plates shingled down the back and the short tail, each tucked under
// the one before (geometry, free edges toward the tail), smaller toward the flanks; the hide between is painted as
// keeled scales running with the body, broad pale scutes across the belly and throat, beads on the face and legs, an
// ember-rust stripe down the spine, soot and ash from the burn. Still rubbery: glossy, and the whole beast squashes and
// bounces (gumberoo.ts).
// Creature space: metres, +z forward, +y up, ground y = 0. Built with the anatomy library, hand-painted (handpaint.ts).
import * as THREE from 'three';
import {
  Body, trunk, limb, legRings, paintedEye, lids, lidPaint, mouthWebs, stalk, gridSurf, chainSkin, newCM, tube, creaseRow, creaseCol, curve,
  Px, RP, hand, h3, cl, runSync, runAsync, type V3, type Chart, type Piece, type Station, type LimbRing, type Ring, type Grid, type Wt,
} from '../anatomy';
import type { BoneDef } from '../rig';

export const GUMBEROO_MODEL_VERSION = 'gumberoo@7';
export interface GumberooModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }
export const GB = { root: [0, 0.74, 0] as V3, head: [0, 0.88, 0.56] as V3, jaw: [0, 0.76, 0.66] as V3, eye: [0.205, 1.0, 0.86] as V3,
  fl: { hip: [0.4, 0.5, 0.36] as V3, knee: [0.49, 0.26, 0.43] as V3, sole: [0.5, 0.0, 0.42] as V3 },
  hl: { hip: [0.38, 0.5, -0.42] as V3, knee: [0.47, 0.25, -0.5] as V3, sole: [0.48, 0.0, -0.44] as V3 } };
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];

export function gumberooBones(): BoneDef[] {
  const b: BoneDef[] = [];
  const A = (name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, pos: pos as [number, number, number] });
  A('root', null, GB.root);
  A('belly', 'root', [0, 0.42, 0]);
  A('head', 'root', GB.head);
  A('jaw', 'head', GB.jaw);
  A('eyeL', 'head', GB_BEAD); A('eyeR', 'head', mir(GB_BEAD, -1));
  A('tail', 'root', [0, 0.74, -0.72]);
  for (const [s, sd] of [['L', 1], ['R', -1]] as const) { A('brow' + s, 'head', mir(BROWS, sd)); A('lid' + s, 'head', mir(GB_BEAD, sd)); }
  for (const [k, leg] of [['f', GB.fl], ['h', GB.hl]] as const) for (const [s, sd] of [['L', 1], ['R', -1]] as const) {
    A(k + 'u' + s, 'root', mir(leg.hip, sd)); A(k + 'l' + s, k + 'u' + s, mir(leg.knee, sd)); A(k + 'f' + s, k + 'l' + s, mir([leg.sole[0], 0.05, leg.sole[2]], sd));
  }
  return b;
}

const HIDE = RP('olive'), DARK = RP('basalt'), SOOT = RP('ink'), ASH = RP('stone'), GUM = RP('gum'), BELLY = RP('sand'), EMBER = RP('rust'), PLATE = RP('slate'), BONE = RP('bone'), HORN = RP('horn');
/** the face's moving parts: heavy brow plates over the eyes, eyelids */
export const GB_EYE_AX: V3 = [0.5, 0.32, 0.8];
const BROWS: V3 = [0.2, 1.065, 0.84];
const EYER = 0.05;
/** the eye is a small dark bead (a bear's eye): its radius and centre, in the old eye's socket */
const BEADR = 0.021, GB_BEAD: V3 = GB.eye.map((v, i) => v + GB_EYE_AX[i] * (EYER - BEADR) * 0.5 / Math.hypot(...GB_EYE_AX)) as V3;
/** the lower jaw's half width at z (for the painters) */
const wJaw = (z: number) => (z < 0.62 ? 0.29 : z > 1.095 ? 0.06 : 0.29 + (z - 0.62) * 0.05 - Math.max(0, z - 0.8) * 0.75);
/** the mouth line (y) at z: a long crooked grin, the corners low, rising a little to the front */
const mouthY = (z: number, x = 0) => 0.775 + cl((z - 0.7) / 0.4, 0, 1) * 0.02 - 0.012 * Math.sin(x * 7);

// ------------------------------------------------------------------------------------------------ paint
/** the hide: dark olive and charcoal, an ember stripe down the spine, pale sand scutes across the belly and throat,
 *  keeled scales running with the body on the back and flanks, beads on the face and legs; soot low down, ash caked on
 *  the feet; painted light, brush-broken colour masses, glossy */
function hidePaint(ch: Chart, _p: Piece, b: Body) { return hideGen(ch, b); }
function* hideGen(ch: Chart, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, n = px.n;
  const back = new Float32Array(n), belly = new Float32Array(n), small = new Float32Array(n), mouth = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if ((i & 8191) === 0) yield;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1], ax = Math.abs(x);
    const head = z > 0.6 && y > 0.55;
    const leg = y < 0.36 && ax > 0.25;
    px.put(i, HIDE, 2.7); px.rough[i] = 120;
    // the mouth: the grin's dark seam, the gum showing inside
    if (head && z > 0.62) {
      const g = y - mouthY(z, x);
      if (ny > 0.45 && g < 0.012 && g > -0.07 && ax < wJaw(z) * 0.86) { px.put(i, GUM, 3.2 - Math.abs(x) * 4); px.rough[i] = 150; mouth[i] = 1; continue; } // the tongue bed
      if (Math.abs(g) < px.mpt * 1.5 && ax < 0.33) { px.put(i, GUM, 0.8); px.rough[i] = 150; mouth[i] = 1; continue; }
      if (ny < -0.6 && g < 0.02 && g > -0.06 && ax < 0.26) { px.put(i, GUM, 2.4); mouth[i] = 1; continue; } // the palate
    }
    // nostrils: two dark pits on the snout, a rim lit above
    for (const sx of [1, -1]) { const d = Math.hypot((x - sx * 0.07) * 1.2, (y - 0.875) * 2.0, (z - 1.07) * 0.8); if (d < 0.018) { px.put(i, SOOT, 0.2); mouth[i] = 1; } else if (d < 0.03) px.mark[i] += y > 0.875 ? 1.0 : -0.6; }
    if (mouth[i]) continue;
    if (head || leg) small[i] = 1; else if (ny < -0.3) belly[i] = 1; else back[i] = 1;
  }
  yield;
  const hp = hand(px, { flow: [0, -0.15, -1], seed: 23 });
  const ss = (x: number) => { const t = cl(x, 0, 1); return t * t * (3 - 2 * t); };
  hp.zones([
    // the charred back: a dark saddle the plates lie on, its edge wandering down the flanks
    { w: (p, nn) => ss((nn[1] - 0.42 + 0.12 * Math.sin(p[2] * 5 + p[0] * 3)) / 0.2 + 0.5) * (p[1] > 0.6 ? 1 : 0), ramp: DARK, step: 2.4 },
    // a dark mask round the eyes and down the snout
    { w: (p) => (p[2] > 0.7 ? 1.3 - Math.hypot((Math.abs(p[0]) - 0.19) / 0.11, (p[1] - 1.0) / 0.07, (p[2] - 0.86) / 0.12) : 0), ramp: DARK, step: 2.2 },
    // the pale belly and throat scutes
    { w: (p, nn) => ss((-0.28 - nn[1]) / 0.2 + 0.5) * (p[1] < 0.7 || p[2] > 0.3 ? 1 : 0), ramp: BELLY, step: 3.0 },
    // the ember stripe down the spine and the tail
    { w: (p, nn) => ss((0.07 + 0.015 * Math.sin(p[2] * 13) - Math.abs(p[0])) / 0.03 + 0.5) * ss((nn[1] - 0.5) / 0.2) * ss((0.22 - p[2]) / 0.1), ramp: EMBER, step: 2.4 },
    // a paler lip line and chin
    { w: (p) => (p[2] > 0.7 && p[1] < mouthY(p[2], p[0]) && p[1] > 0.6 ? ss((p[2] - 0.75) / 0.1) : 0), ramp: HIDE, step: 3.8 },
    // soot from the burn low on the flanks and legs, ash caked on the feet
    { w: (p) => ss((0.17 - p[1]) / 0.08) * (0.55 + 0.45 * Math.sin(p[0] * 9 + p[2] * 7)), ramp: DARK, step: 2.0 },
    { w: (p) => ss((0.05 - p[1]) / 0.02 + 0.5), ramp: ASH, step: 4.0 },
  ], { soft: 0.7, edge: 0.35, mask: (i) => (mouth[i] ? 0 : 1) });
  yield;
  hp.form({ light: 2.2, ao: 2.4, cavity: 1.5, ridge: 0.9 });
  yield;
  // keeled scales on the back and flanks (biggest along the spine), scutes on the belly, beads on the face and legs
  px.scales({ size: 0.1, kind: 'keel', flow: -1, mask: (i) => back[i], sizeK: (i) => 0.75 + 0.4 * Math.max(0, px.gb.N[i * 3 + 1]), ink: 2.2, lit: 1.2, shade: 1.1, seed: 5 });
  yield;
  px.scales({ size: 0.1, kind: 'scute', flow: -1, mask: (i) => belly[i], ink: 1.8, lit: 0.8, shade: 0.8, seed: 9 });
  yield;
  px.pebbles(0.024, { mask: (i) => small[i], depth: 1.0, seed: 13 });
  yield;
  hp.strokes({ flow: 'across', len: [3, 6], width: [2, 3], amp: 0.4, lit: 0.8, mask: (i) => (mouth[i] ? 0 : 1) });
  hp.hollows([1, -1].map((s) => ({ c: mir(GB.eye, s), r: 0.09, k: 1.4 })));
  hp.hollows([1, -1].map((s) => ({ c: [s * 0.3, mouthY(0.7), 0.7] as V3, r: 0.07, k: 1.2 })));
  px.glints(PLATE, { every: 0.3, size: 0.3, mask: (i) => (mouth[i] ? 0 : 1) });
  yield;
  px.flush();
}
/** the armour plates: slate horn with growth rings round the root, a lit keel, ember-rust worn edges, soot in the
 *  rings; glossy */
function platePaint(ch: Chart, p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  const fr = (p as Piece & { frames?: PlateFrame[] }).frames ?? [];
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    // the plate under the texel: the nearest centre
    let bf = fr[0], bd = Infinity;
    for (const f of fr) { const d = (x - f.mid[0]) ** 2 + (y - f.mid[1]) ** 2 + (z - f.mid[2]) ** 2; if (d < bd) { bd = d; bf = f; } }
    let R = DARK, st = 3.0;
    if (bf) {
      const dx = x - bf.at[0], dy = y - bf.at[1], dz = z - bf.at[2];
      const e = (dx * bf.S[0] + dy * bf.S[1] + dz * bf.S[2]) / bf.w, f = (dx * bf.D[0] + dy * bf.D[1] + dz * bf.D[2]) / bf.l;
      const top = N[i * 3] * bf.U[0] + N[i * 3 + 1] * bf.U[1] + N[i * 3 + 2] * bf.U[2] > 0.2;
      const half = plateHalf(f), edge = (half - Math.abs(e)) * bf.w, tip = (1 - f) * bf.l;
      // growth rings round the root, a worn bright keel, ember-red worn edges along the free rim
      if (top && ((f * 0.85 + Math.abs(e) * 0.5) * 5) % 1 < 0.18) st -= 1.0;
      if (top && Math.abs(e) < 0.09 && f > 0.15) st += 0.9;
      if (top && (edge < 0.012 || tip < 0.016) && f > 0.25) { R = EMBER; st = 2.6 + (edge < 0.006 ? 0.8 : 0); }
      if (!top) st = 1.6;
    }
    px.put(i, R, st); px.rough[i] = 95;
  }
  const hp = hand(px, { flow: 'sweep', seed: 31 });
  hp.zones([{ w: (q) => 0.5 + 0.6 * Math.sin(q[0] * 11 + q[2] * 9) - 0.4, ramp: SOOT, step: 2.0 }, { w: (q) => 0.6 * Math.sin(q[0] * 7 - q[2] * 13 + 2) - 0.1, ramp: HIDE, step: 2.2 }], { soft: 0.8, mask: (i) => (px.rampT[px.rampI[i]] === EMBER ? 0 : 1) });
  hp.form({ light: 2.4, ao: 2.6, cavity: 1.8, ridge: 1.3 });
  hp.strokes({ len: [3, 6], width: [1, 2], amp: 0.5 });
  px.glints(PLATE, { every: 0.35, size: 0.25 });
  px.flush();
}
function hornPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  for (let i = 0; i < px.n; i++) { px.put(i, BONE, 2.6 + (px.Y[Math.floor(i / px.w)] * 60 % 1 < 0.25 ? -0.8 : 0)); px.rough[i] = 120; }
  const hp = hand(px, { flow: 'sweep', seed: 37 });
  hp.zones([{ w: (_q, _n, i) => 1 - px.Y[Math.floor(i / px.w)] / Math.max(0.01, px.Y[px.h - 1]) * 1.6 + 0.4, ramp: DARK, step: 2.2 }], { soft: 0.6 });
  hp.form({ light: 2.2, ao: 1.6, ridge: 1.2 }).strokes({ len: [4, 8], width: [1, 2], amp: 0.5 });
  px.flush();
}
function gumPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  px.base(() => [GUM, 2.0]);
  hand(px, { flow: 'sweep' }).form({ light: 1.2, ao: 0.4 }).strokes({ len: [3, 5], width: [1, 2], amp: 0.5 });
  for (let i = 0; i < px.n; i++) px.rough[i] = 150;
  px.flush();
}
function toothPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  px.base(() => [BONE, 3.8]);
  hand(px, { flow: 'sweep' }).form({ light: 1.6, ao: 0.6, ridge: 1 });
  for (let i = 0; i < px.n; i++) px.rough[i] = 70;
  px.flush();
}
function clawPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), N = px.gb.N;
  for (let i = 0; i < px.n; i++) { px.put(i, HORN, 1.8 + (N[i * 3 + 1] > 0.4 ? 1 : 0)); px.rough[i] = 80; }
  hand(px, { flow: 'sweep' }).form({ light: 1.8, ao: 0.8, ridge: 1.4 });
  px.flush();
}

// ------------------------------------------------------------------------------------------------ armour plates
/** thick keeled shield plates, each lying on the surface with its free edge toward the tail and lifted off it, its root
 *  tucked under the plate before: `at` its root, `n` the surface normal there, `d` the direction along the body toward
 *  the tail, w/l/t half width, length, thickness. One piece of many grids. */
interface PlateFrame { at: V3; mid: V3; S: V3; D: V3; U: V3; w: number; l: number }
/** the plate's half width (x w) at f along it: a pointed diamond, widest a third of the way, tapering to the tip */
const PLATE_ST: [number, number][] = [[-0.06, 0.28], [0.12, 0.66], [0.34, 1.0], [0.58, 0.7], [0.8, 0.36], [1.0, 0.04]];
function plateHalf(f: number) { for (let k = 0; k + 1 < PLATE_ST.length; k++) if (f <= PLATE_ST[k + 1][0]) { const [f0, a] = PLATE_ST[k], [f1, c] = PLATE_ST[k + 1]; return a + (c - a) * cl((f - f0) / (f1 - f0), 0, 1); } return 0.04; }
/** thick keeled plates, pointed diamonds lying on the surface with their tips toward the tail, lifted off it, each
 *  root tucked under the plate before (shingles): `at` the root, `n` the surface normal there, `d` along the body
 *  toward the tail, w/l/t half width, length, thickness. One piece of many grids. */
function plates(name: string, seats: { at: V3; n: V3; d: V3; w: number; l: number; t: number; lift?: number }[], skin: (p: V3) => Wt, paint: (c: Chart, p: Piece, b: Body) => void): Piece {
  const m = newCM(), grids: Grid[] = [], frames: PlateFrame[] = [];
  const nr = (a: V3): V3 => { const q = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / q, a[1] / q, a[2] / q]; };
  const cr = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
  for (const s of seats) {
    const N0 = nr(s.n), S = nr(cr(N0, s.d)), D = nr(cr(S, N0)), lift = s.lift ?? 0.28;
    // the plate's own up: the surface normal tipped back so the free edge stands off the hide
    const U = nr([N0[0] - D[0] * lift, N0[1] - D[1] * lift, N0[2] - D[2] * lift]), Dd = nr(cr(S, U));
    const rings: Ring[] = [];
    for (const [f, k] of PLATE_ST) {
      const c: V3 = [s.at[0] + Dd[0] * s.l * f - N0[0] * s.t * 0.6, s.at[1] + Dd[1] * s.l * f - N0[1] * s.t * 0.6, s.at[2] + Dd[2] * s.l * f - N0[2] * s.t * 0.6];
      const w = s.w * k, t = s.t * (0.4 + 0.6 * Math.min(1, k * 1.3));
      // a keeled section: a ridge down the middle, bevelled flanks, a thin edge, a flat underside
      rings.push({ c, x: S, y: U, pts: [[-w, 0], [-w * 0.5, t * 0.55], [0, t * 1.25], [w * 0.5, t * 0.55], [w, 0], [w * 0.45, -t * 0.32], [-w * 0.45, -t * 0.32]] });
    }
    const g = tube(m, rings, { tag: 0, capS: true, capE: true });
    creaseCol(m, g, 2, 0, PLATE_ST.length - 1, 3, true); creaseCol(m, g, 0, 0, PLATE_ST.length - 1, 2); creaseCol(m, g, 4, 0, PLATE_ST.length - 1, 2);
    grids.push(g);
    frames.push({ at: s.at, mid: [s.at[0] + Dd[0] * s.l * 0.45, s.at[1] + Dd[1] * s.l * 0.45, s.at[2] + Dd[2] * s.l * 0.45], S, D: Dd, U, w: s.w, l: s.l });
  }
  return { name, m, grids, levels: 1, skin, paint, k: 1.15, ...{ frames } } as Piece;
}

// ------------------------------------------------------------------------------------------------ the build
export function* gumberooModelGen(o: { page?: number; den?: number } = {}): Generator<string | void, GumberooModel> {
  const bones = gumberooBones(), bi = (n: string) => bones.findIndex((b) => b.name === n);
  const body = new Body(o.page ?? 1024);
  // the body: a short thick tail, heavy haunches, the belly sagging between the legs, a hump of muscle over the
  // shoulders, a thick creased neck running up into the back of the head
  const st: Station[] = [
    { c: [0, 0.5, -1.42], s: [0.04, 0.035], p: 'ridge' },
    { c: [0, 0.56, -1.22], s: [0.1, 0.085], p: 'ridge' },
    { c: [0, 0.63, -1.0], s: [0.19, 0.16], p: 'ridge' },
    { c: [0, 0.69, -0.78], s: [0.32, 0.27], p: 'keel' },
    { c: [0, 0.71, -0.55], s: [0.47, 0.4], p: 'hips', tw: [[3, 0.04, 0.02]] },
    { c: [0, 0.67, -0.3], s: [0.53, 0.42], p: 'sack' },
    { c: [0, 0.67, -0.04], s: [0.58, 0.44], p: 'pear' },
    { c: [0, 0.72, 0.2], s: [0.62, 0.47], p: 'hump' },
    { c: [0, 0.77, 0.38], s: [0.53, 0.4], p: 'hump' },
    { c: [0, 0.82, 0.5], s: [0.41, 0.31], p: 'crest' },
    { c: [0, 0.87, 0.6], s: [0.33, 0.24], p: 'crest' },
  ];
  const J: V3[] = [[0, 0.5, -1.5], [0, 0.69, -0.78], [0, 0.72, -0.5], [0, 0.78, 0.38], [0, 0.88, 0.56], [0, 0.9, 1.2]];
  const sk = chainSkin(J, [bi('tail'), bi('root'), bi('root'), bi('root'), bi('head')], 0.45);
  const skin = (p: V3): Wt => {
    const w = sk(p);
    // the belly sags on its own bone
    return p[1] < 0.5 && p[2] > -0.6 && p[2] < 0.42 ? [w[0], (w[1] ?? 1) * 0.6, bi('belly'), 0.4] : w;
  };
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0], capS: true, capE: false, levels: 1, k: 1.2, skin, paint: hidePaint,
    rings: [{ at: 9, s: 0.6 }, { at: 3, s: 0.5 }] }));
  body.finalize(torso);
  yield 'trunk';

  // ---- the head: a broad flat skull over a heavy lower jaw
  const hb = bi('head'), jb = bi('jaw');
  const HD: { z: number; top: number; w: number }[] = [
    { z: 0.55, top: 1.02, w: 0.3 }, { z: 0.64, top: 1.06, w: 0.34 }, { z: 0.73, top: 1.075, w: 0.335 }, { z: 0.81, top: 1.08, w: 0.31 },
    { z: 0.89, top: 1.05, w: 0.28 }, { z: 0.96, top: 1.0, w: 0.25 }, { z: 1.02, top: 0.95, w: 0.21 }, { z: 1.07, top: 0.905, w: 0.165 }, { z: 1.1, top: 0.86, w: 0.1 },
  ];
  const eyeSink = (x: number, y: number, z: number) => Math.exp(-(((y - GB.eye[1]) / 0.06) ** 2) - (((z - GB.eye[2]) / 0.07) ** 2)) * (x > 0.1 ? 1 : 0);
  const headSt: Station[] = HD.map((s) => {
    const ym = mouthY(s.z), top = s.top, w = s.w, mid = (top + ym) / 2, cy = mid;
    const pts: [number, number][] = [[0, top], [w * 0.46, top - 0.012], [w * 0.8, top - 0.04], [w * 0.98, mid + (top - mid) * 0.35], [w * 1.03, mid], [w * 1.01, ym + 0.05], [w * 0.97, ym + 0.014], [w * 0.86, ym], [0, ym + 0.012]];
    for (const q of pts) { const sinkK = eyeSink(q[0], q[1], s.z); q[0] -= sinkK * 0.05; q[1] -= sinkK * 0.02; }
    return { c: [0, cy, s.z] as V3, s: [1, 1] as [number, number], p: pts.map(([x, y]) => [x, y - cy]) };
  });
  body.add(trunk({ name: 'skull', stations: headSt, tween: 1, capS: true, capE: true, levels: 1, k: 1.8, skin: (p) => (p[2] < 0.6 ? [hb, 0.6, bi('root'), 0.4] : [hb, 1]), paint: hidePaint,
    cols: [{ j: 7, a: 1, b: HD.length - 1, s: 1.5 }, { j: 2, a: 1, b: 5, s: 0.8 }] }));
  const JD: { z: number; bot: number; w: number }[] = [
    { z: 0.62, bot: 0.64, w: 0.29 }, { z: 0.72, bot: 0.6, w: 0.315 }, { z: 0.83, bot: 0.6, w: 0.29 }, { z: 0.93, bot: 0.62, w: 0.25 }, { z: 1.01, bot: 0.65, w: 0.2 }, { z: 1.07, bot: 0.69, w: 0.14 }, { z: 1.095, bot: 0.73, w: 0.08 },
  ];
  const jawSt: Station[] = JD.map((s) => {
    const ym = mouthY(s.z) - 0.004, b = s.bot, w = s.w, cy = (ym + b) / 2;
    const pts: [number, number][] = [[0, ym], [w * 0.8, ym], [w * 0.97, ym - 0.016], [w * 1.0, ym - (ym - b) * 0.35], [w * 0.96, ym - (ym - b) * 0.62], [w * 0.82, ym - (ym - b) * 0.85], [w * 0.55, b + 0.01], [w * 0.2, b], [0, b - 0.004]];
    return { c: [0, cy, s.z] as V3, s: [1, 1] as [number, number], p: pts.map(([x, y]) => [x, y - cy]) };
  });
  body.add(trunk({ name: 'jaw', stations: jawSt, tween: 0, capS: true, capE: true, levels: 1, k: 1.5, skin: () => [jb, 1], paint: hidePaint, cols: [{ j: 2, a: 0, b: JD.length - 1, s: 1.2 }] }));
  // blunt peg teeth along the grin, two tusks up out of the lower jaw at the front
  let tk = 0;
  for (const s of [1, -1]) {
    for (const [z, up, len, r] of [[0.8, 1, 0.025, 0.014], [0.88, 1, 0.022, 0.013], [0.95, 1, 0.022, 0.012], [0.85, -1, 0.024, 0.014], [0.93, -1, 0.022, 0.012], [1.0, -1, 0.06, 0.02]] as [number, number, number, number][]) {
      const w = (HD.find((q) => q.z >= z) ?? HD[HD.length - 1]).w * 0.8, y = mouthY(z) + (up > 0 ? 0.004 : -0.006);
      body.add(stalk({ name: 'tooth' + tk++, path: [[s * w, y + up * 0.014, z], [s * w, y, z], [s * w * 1.0, y - up * len * 0.6, z + (up < 0 ? 0.005 : 0)], [s * w * 0.98, y - up * len, z + (up < 0 ? 0.01 : 0)]], r: (t) => r * (1 - t * t * 0.75), around: 6, capE: true, levels: 0, skin: () => [up > 0 ? hb : jb, 1], paint: toothPaint }));
    }
  }
  // the cheeks and throat that close the sides and back of the grin as the jaw drops
  body.add(mouthWebs({ name: 'mouthweb', corner: [0.26, mouthY(0.78), 0.78], back: 0.1, half: 0.012, throat: 0.2, upper: hb, lower: jb, paint: gumPaint }));
  yield 'head';
  // eyes on top of the skull under heavy keeled brow plates; lids close down over them
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(GB_BEAD, s), ax: V3 = [s * GB_EYE_AX[0], GB_EYE_AX[1], GB_EYE_AX[2]];
    body.add(paintedEye({ name: 'eye' + S, c, ax, r: BEADR, bone: bi('eye' + S), iris: RP('soil'), pupil: 'round', bead: true, side: s, k: 3, around: 8 }));
    const lp = lids({ name: 'lid' + S, c, ax, r: BEADR, bone: bi('lid' + S), lowBone: hb, upper: 0.5, lower: 0.72, corner: 1.25, tilt: 0.12, side: s, thick: 0.28, thickLo: 0.2, k: 1.6,
      paint: lidPaint(HIDE, 3, { c, ax, r: BEADR, lash: SOOT }) });
    lp[0].name = 'lid' + S; lp[1].name = 'lidLo' + S; lp[1].paint = lidPaint(DARK, 3, { c, ax, r: BEADR, lower: true });
    for (const q of lp) { q.levels = 0; body.add(q); }
    // the brow plate: a thick keeled shield over the eye on the brow bone
    const bc = mir(BROWS, s);
    body.add(plates('brow' + S, [{ at: [bc[0] - s * 0.07, bc[1] + 0.01, bc[2] + 0.05], n: [s * 0.35, 1, 0.25], d: [s * 0.9, -0.2, -0.4], w: 0.06, l: 0.17, t: 0.028, lift: 0.05 }], () => [bi('brow' + S), 1], platePaint));
    // a blunt ringed horn out of a bony boss behind the eye
    body.add(stalk({ name: 'horn' + S, path: curve([[s * 0.17, 1.02, 0.66], [s * 0.22, 1.13, 0.62], [s * 0.28, 1.19, 0.53], [s * 0.3, 1.2, 0.46]], 7), r: (t) => 0.055 * Math.pow(1 - t * 0.92, 0.9) + 0.002, around: 7, ringEvery: 2, keel: true, capE: true, levels: 1, k: 1.2,
      sec: (a2) => (Math.cos(a2) > 0.7 ? 1.12 : 1) * (Math.abs(Math.sin(a2)) > 0.7 ? 0.82 : 1), skin: () => [hb, 1], paint: hornPaint }));
  }
  yield 'face';
  // ---- the armour: rows of keeled plates shingled down the back and the tail, biggest along the spine
  const g = torso.grids[0], seats: { at: V3; n: V3; d: V3; w: number; l: number; t: number; lift?: number }[] = [];
  // small plates down the top of the tail
  for (const v of [0.07, 0.11, 0.15]) { const q = gridSurf(torso.m, g, 0.5, v), q2 = gridSurf(torso.m, g, 0.5, v - 0.02); seats.push({ at: q.p, n: q.n, d: [q2.p[0] - q.p[0], q2.p[1] - q.p[1], q2.p[2] - q.p[2]], w: 0.035 + v * 0.2, l: 0.09 + v * 0.4, t: 0.016 + v * 0.06, lift: 0.35 }); }
  const rowsV = [0.2, 0.26, 0.32, 0.38, 0.44, 0.5, 0.56, 0.615, 0.665, 0.715, 0.765, 0.81, 0.85];
  rowsV.forEach((v, r) => {
    const cols = v < 0.3 ? [0.5] : v > 0.78 ? [0.5, 0.43, 0.57] : [0.5, 0.43, 0.57, 0.36, 0.64];
    for (const u0 of cols) {
      const u = u0 + (u0 === 0.5 ? 0 : (r % 2 ? 0.02 : -0.02));
      const q = gridSurf(torso.m, g, u, v), q2 = gridSurf(torso.m, g, u, Math.max(0, v - 0.02));
      if (q.n[1] < 0.15) continue;
      const dir: V3 = [q2.p[0] - q.p[0], q2.p[1] - q.p[1], q2.p[2] - q.p[2]];
      const spineK = 1 - Math.abs(u - 0.5) * 2.4, hump = Math.exp(-(((v - 0.7) / 0.1) ** 2)), sz = (v < 0.3 ? 0.62 : v > 0.8 ? 0.82 : 1) * (0.58 + 0.42 * spineK) * (1 + 0.3 * hump * spineK);
      seats.push({ at: q.p, n: q.n, d: dir, w: 0.11 * sz, l: 0.27 * sz, t: 0.034 * sz + (u === 0.5 ? 0.014 : 0), lift: 0.34 });
    }
  });
  body.add(plates('plates', seats, skin, platePaint));
  yield 'armour';
  // ---- legs: short, thick, bowed; broad feet of five toes with heavy hooked claws
  for (const [k, leg] of [['f', GB.fl], ['h', GB.hl]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const hip = mir(leg.hip, s), knee = mir(leg.knee, s), sole = mir(leg.sole, s);
    const segL = [Math.hypot(hip[0] - knee[0], hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[0] - sole[0], knee[1] - sole[1], knee[2] - sole[2])];
    const fore = k === 'f', r0 = 0.14, J = fore ? 180 : 0; // the elbow points back, the knee forward
    const R = (t: number, k2: number, e: number, bb?: [number, number, number][], crease?: number): LimbRing => ({ t, r: r0 * k2, e, b: bb, crease, ink: !!crease });
    void segL; void legRings;
    const rings: LimbRing[] = [
      R(-0.32, 0.95, 1.5), R(-0.1, 1.28, 1.4, [[0, 0.12, 50], [180, 0.16, 50]]),
      R(0.14, 1.32, 1.25, [[fore ? 20 : 170, 0.22, 45], [fore ? 170 : 20, 0.14, 45], [-90, -0.06, 40]]), // the upper arm's or thigh's muscle mass
      R(0.33, 1.02, 1.1, [[10, 0.06, 40]]),
      R(0.42, 0.98, 1.08, [[J, 0.12, 40]], 1.2), // a fold above the joint
      R(0.5, 1.12, 1.14, [[J, 0.36, 32], [J + 180, -0.08, 40]]), // the elbow or knee knob
      R(0.58, 1.0, 1.08, [[J, 0.1, 40]], 1.2), // a fold below it
      R(0.68, 1.14, 1.15, [[fore ? 15 : 175, 0.24, 50], [90, 0.08, 40]]), // the forearm's or calf's muscle
      R(0.8, 0.86, 1.06, [[180, 0.08, 40]]),
      R(0.88, 0.66, 1.0, [[90, 0.14, 25], [-90, 0.14, 25]], 1), // the wrist or ankle, knobs either side
    ];
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, around: 10, levels: 1, rise: 0.22,
      foot: { pad: 0.105, h: 0.05, fwd: 0.18, nail: 'claw', lobe: 0.42, toeAround: 5, toes: [-62, -20, 20, 62].map((a, q) => ({ a, len: q === 1 || q === 2 ? 0.12 : 0.09, r: q === 1 || q === 2 ? 0.042 : 0.036, claw: q === 1 || q === 2 ? 0.11 : 0.085, curl: 0.75, drop: 0.25 })) },
      bones: { parent: bi('root'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: hidePaint, clawPaint, k: 1 });
    out.toes.levels = 1; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
    yield 'leg';
  }
  const out = yield* body.buildGen({ den: o.den ?? 200, maxScale: 2, budget: 22000 });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, bones, tris: out.tris, den: body.den, stats };
}
export const buildGumberooModel = (o: { page?: number; den?: number } = {}) => runSync(gumberooModelGen(o));
export const buildGumberooModelAsync = (o: { page?: number; den?: number } = {}) => runAsync(gumberooModelGen(o));
export { cl, h3, curve };
