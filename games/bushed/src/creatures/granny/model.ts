// GRANNY TAMARACK: model. An old forest grandmother, about 2.4 m to the crown and taller by her antlers: gaunt and
// long-limbed, a little stooped over a gnarled walking staff. A long dark robe of bark-cloth hangs in real folds to her
// bare feet (sculpted drapery: round-backed folds with sharp valleys, fanning out and deepening toward a ragged hem),
// under a cushioned shawl of moss; strips of peeled bark, hanks of moss and beard lichen hang off her shoulders, her
// back, her sleeves and her hem. Long thin grey hair falls from under antlers of living tamarack: barked branches that
// grow out of knobbly bosses on her skull, furrowed and knotted, crusted with lichen, beard lichen hanging off them,
// tufts of autumn-yellow needles at the spurs. Her face is sculpted (granny/face.ts): an old woman's long face, sunken
// cheeks under high cheekbones, heavy hooded lids over deep-set kind eyes, crow's feet, a long nose with a drooping
// tip, nasolabial folds, a sunken mouth with thin lips in a tight smile, soft jowls, a jutting chin. Long knuckly
// fingers with dark nails. Painted warm to cool: ruddy nose and cheeks, cool grey-violet in the sockets and temples,
// weathered with spots and veins, a little uncanny. In fog she is a tall antlered shape on a staff; up close she is
// somebody's grandmother.
// Creature space: metres, +z forward, +y up, ground y = 0. The staff is part of the skin, on the right hand.
import * as THREE from 'three';
import {
  Body, runSync, runAsync, limb, legRings, eyeball, locks, stalk, curve, chainSkin, addWeights, gridSurf, trunk, Px, RP, cell3, h3, cl,
  newCM, tube, sheetGrid, PROFILES,
  type V3, type Wt, type Piece, type Chart, type Station, type LockSeat, type LimbRing, type Ring, type Grid,
} from '../anatomy';
import { nz2, nz3, fbm3 } from '../paintkit';
import { cardPaint } from '../cards';
import type { BoneDef } from '../rig';
import { furZones } from '../fur/paint';
import { headSurf, HEAD_COLS, HEAD_ROWS, eyeLocal, lipY, EYE } from './face';
import { almondLid, lidCoords, strokes, formLight, downFlow, alongFlow, eyePaint, type LidSpec } from '../wildlife/organic';
import { LOCK_VARIANTS } from '../cards';

export const GRANNY_MODEL_VERSION = 'granny@9';
export interface GrannyModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }

/** landmarks (the left side; the right is the mirror in x unless given) */
export const GT = {
  hips: [0, 1.12, -0.02] as V3, spine: [0, 1.38, -0.03] as V3, chest: [0, 1.62, -0.04] as V3, neck: [0, 1.93, -0.02] as V3, head: [0, 2.05, 0.0] as V3,
  /** the head's modelling centre (the face is built round it) */
  hg: [0, 2.15, 0.02] as V3,
  armL: { sh: [0.2, 1.84, -0.04] as V3, el: [0.235, 1.49, -0.07] as V3, wr: [0.25, 1.15, -0.02] as V3 },
  armR: { sh: [-0.2, 1.84, -0.04] as V3, el: [-0.245, 1.5, -0.08] as V3, wr: [-0.29, 1.24, 0.17] as V3 },
  leg: { hip: [0.1, 1.06, 0.0] as V3, kn: [0.11, 0.56, 0.03] as V3, an: [0.11, 0.075, -0.03] as V3 },
  /** the staff: its foot on the ground and its top (vertical through the right fist) */
  staff: { x: -0.3, z: 0.215, top: 1.74 },
  grip: [-0.3, 1.165, 0.215] as V3,
};
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp1 = (a: number, b: number, t: number) => a + (b - a) * t;
const g2 = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (w * w));
const ss = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function grannyBones(): BoneDef[] {
  const b: BoneDef[] = [];
  const A = (name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, pos: pos as [number, number, number] });
  A('hips', null, GT.hips); A('spine', 'hips', GT.spine); A('chest', 'spine', GT.chest); A('neck', 'chest', GT.neck); A('head', 'neck', GT.head);
  const E = eyeAt();
  A('lidL', 'head', E.c); A('lidR', 'head', mir(E.c, -1));
  const L = GT.armL, Rr = GT.armR;
  A('armL', 'chest', L.sh); A('elbL', 'armL', L.el); A('handL', 'elbL', L.wr);
  A('fingL', 'handL', add(L.wr, [0, -0.112, -0.008])); A('fing2L', 'fingL', add(L.wr, [0, -0.17, -0.006]));
  A('indexL', 'handL', add(L.wr, [-0.004, -0.11, 0.03])); A('index2L', 'indexL', add(L.wr, [-0.006, -0.165, 0.034]));
  A('thumbL', 'handL', add(L.wr, [-0.016, -0.04, 0.035]));
  A('armR', 'chest', Rr.sh); A('elbR', 'armR', Rr.el); A('handR', 'elbR', Rr.wr);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const l = GT.leg;
    A('thigh' + s, 'hips', mir(l.hip, k)); A('shin' + s, 'thigh' + s, mir(l.kn, k)); A('foot' + s, 'shin' + s, mir(l.an, k)); A('toes' + s, 'foot' + s, mir([l.an[0], 0.025, 0.16], k));
  }
  // v6: the face moves: brows, the corners of the mouth (a smile that widens)
  for (const [nm, k] of [['L', 1], ['R', -1]] as const) { const f = faceMarks(k); A('brow' + nm, 'head', f.brow); A('smile' + nm, 'head', f.smile); }
  return b;
}

// ------------------------------------------------------------------------------------------------ the head
/** the face's surface z at (|x|, h) in head space (searching round the front half) */
function faceZ(x: number, h: number): number {
  let best = Math.PI, bd = 1;
  for (let k = 0; k <= 300; k++) { const th = Math.PI * (0.55 + 0.45 * k / 300), [X] = headSurf(h, th), d = Math.abs(X - x); if (d < bd) { bd = d; best = th; } }
  return headSurf(h, best)[1];
}
/** where the brows and the mouth corners sit (side k: +1 left) */
export function faceMarks(k: number): { brow: V3; smile: V3 } {
  const E = eyeAt(), H = GT.hg, mx = 0.0285, my = lipY(mx);
  return { brow: [k * (E.c[0] - 0.002), E.c[1] + 0.021, E.c[2] + 0.012], smile: [k * mx, H[1] + my, H[2] + faceZ(mx, my) - 0.004] };
}
/** the eye: centre and look axis (left) */
export function eyeAt(): { c: V3; ax: V3; r: number } {
  const e = eyeLocal(), H = GT.hg;
  return { c: add(H, e.c), ax: e.ax, r: e.r };
}
/** a point (creature space) and outward normal of the sculpted head at head-space height h, angle th, side s */
function headPoint(h: number, th: number, s: number): { p: V3; n: V3 } {
  const H = GT.hg, P = (hh: number, t: number): V3 => { const [x, z] = headSurf(hh, t); return [H[0] + x * s, H[1] + hh, H[2] + z]; };
  const p = P(h, th), a = sub(P(h, th + 0.01), P(h, th - 0.01)), b = sub(P(h + 0.002, th), P(h - 0.002, th));
  let n = nrm(crs(b, a)); const out = sub(p, [H[0], H[1] + h, H[2] - 0.01]);
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = scl(n, -1);
  return { p, n };
}
/** is a creature-space point inside the head? */
function insideHead(p: V3): boolean {
  const H = GT.hg, x = Math.abs(p[0] - H[0]), h = p[1] - H[1], z = p[2] - H[2];
  if (h > 0.176 || h < -0.159) return false;
  const th = Math.atan2(x, -(z + 0.005)), [X, Z] = headSurf(h, th);
  return Math.hypot(x, z + 0.005) < Math.hypot(X, Z + 0.005);
}
/** where the antlers grow from (left; the bony bosses on the skull) */
const ANTLER_ROOT: V3 = [0.05, 0.118, -0.006];

// ------------------------------------------------------------------------------------------------ colour
const hex = (s: string) => parseInt(s.slice(1), 16);
/** pale, lined old skin: hue-shifted cool mauve in the creases, warm parchment in the light */
const SKIN = ['#2a2327', '#43383b', '#625453', '#83736d', '#a3928a', '#c1b2a6', '#d9ccbe', '#eae0d3'].map(hex);
/** where the blood shows: the nose, the apples of the cheeks, the knuckles, the ears: ruddy parchment */
const SKINW = ['#2e2120', '#4c3530', '#704d44', '#93685a', '#b28675', '#caa48e', '#dec0a9', '#ecd7c2'].map(hex);
/** where it is thin and cold: the sockets, the temples, under the jaw: grey-violet with a green undertone */
const SKINC = ['#25242b', '#3a3843', '#55525d', '#716d77', '#8e8992', '#aba5aa', '#c6bfbf', '#dcd6d1'].map(hex);
/** the face's ramps: ten gentle steps each (soft value changes): a warm parchment, a ruddy rose where the blood
 *  shows, a cool grey-violet where the skin is thin */
const FACE = ['#2c2022', '#453236', '#5f4748', '#7a5e5b', '#94766e', '#ad8e83', '#c4a697', '#d7bdab', '#e6d2c0', '#efe1d2'].map(hex);
const FACEW = ['#301d1e', '#4e2e2d', '#6f433d', '#905a4f', '#ab7262', '#c38b77', '#d6a48d', '#e4bca5', '#eed2bd', '#f5e3d2'].map(hex);
const FACEC = ['#211d27', '#352f3d', '#4b4454', '#625a6a', '#7a717f', '#928894', '#aa9fa8', '#bfb4b9', '#d2c8c9', '#e1d9d6'].map(hex);
/** her robe: bark-cloth, near black-brown, a little red in the light */
const CLOTH = ['#110d0c', '#1b1513', '#271e1a', '#352822', '#45342b', '#584336', '#6c5443'].map(hex);
/** tamarack bark: red-brown under grey plates */
const BARK = ['#151211', '#221d1a', '#332b26', '#463b33', '#5b4d42', '#726254', '#8a7a6a', '#a39382'].map(hex);
const MOSS = RP('moss'), SAGE = RP('sage'), SOIL = RP('soil'), HEART = RP('heart'), STONE = RP('stone'), SNOW = RP('snow');
const GOLD = RP('gold'), OCHRE = RP('ochre'), STRAW = RP('straw'), HORN = RP('horn'), PLUM = RP('plum'), HIDE = RP('hide'), INK = RP('ink'), FUR = RP('fur');
const VIOLET = RP('violet');

/** the robe: bark-cloth falling in long folds, mud and wet at the hem; above the ribs a shawl of moss with lichen */
function robePaint() {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt, K = px.gb.K;
    px.lightK = 0.8;
    const shawl = new Float32Array(px.n), skin = new Uint8Array(px.n);
    const st = strokes(px, { flow: downFlow(), len: [6, 16], width: [2, 3.5], amp: 0.55, density: 0.7, seed: 41, apply: false });
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const a = Math.atan2(x, z - 0.0), m = fbm3(x * 6, y * 6, z * 6, 3);
      // the neck: skin above the collar of moss
      const collar = 1.975 + nz2(a * 3, 1) * 0.012;
      if (y > collar) {
        skin[i] = 1;
        const tendon = Math.abs(Math.abs(x) - 0.022) < mpt * 1.2 && z > 0.01, fold = Math.abs(Math.sin(y * 260 + nz2(a * 4, y * 9) * 2)) < 0.12;
        px.put(i, z > 0.0 ? SKIN : SKINC, 4 + m * 0.5 - (tendon ? 0.8 : 0) - (fold ? 0.9 : 0) - (y < collar + 0.015 ? 1.2 : 0)); px.rough[i] = 175; continue;
      }
      // the shawl's lower edge: ragged, lower at the back, a point down the front
      const edge = shawlEdge(a);
      if (y > edge) {
        shawl[i] = 1;
        const lich = fbm3(x * 14 + 3, y * 14, z * 14, 2);
        if (lich > 0.32) { px.put(i, SAGE, 2.6 + lich * 2 + st.v[i] * 0.6); px.rough[i] = 240; continue; }
        // moss cushions: lit on top, dark in the gaps between them
        const c = cell3(x, y, z, 0.035, 9), gap = (c.f2 - c.f1) < mpt * 2.2;
        px.put(i, MOSS, 0.9 + m * 1.0 + (N[i * 3 + 1] > 0.5 ? 0.5 : 0) - (y < edge + 0.03 ? 0.8 : 0) - (gap ? 0.9 : 0) + st.v[i] * 0.5); px.rough[i] = 245; continue;
      }
      // the bark-cloth: dark in the fold valleys, lit along the round backs of the folds; fibres; mud at the hem
      let s = 2.4 + m * 0.5 + cl(K[i] * 0.9, -1.2, 0.9) + st.v[i];
      if (h3(Math.floor((a + 4) * 160), Math.floor(y * 40), 7) < 0.14) s -= 0.6;
      if (y < 0.34 + nz2(a * 6, 9) * 0.07) { s -= 0.9; if (fbm3(x * 20, y * 20, z * 20, 2) > 0.15) { px.put(i, SOIL, 1.6 + m + st.v[i] * 0.5); px.rough[i] = 200; continue; } }
      px.put(i, CLOTH, s); px.rough[i] = 235;
    }
    yield;
    formLight(px, 0.55);
    px.pelt({ len: 0.06, width: 0.02, flow: -1, down: 0.6, mask: (i) => shawl[i], tooth: 1.4, clump: 0.6, strands: 0.25 });
    yield;
    px.creaseInk(1.0, { dark: 1, lit: 0.4, mask: (i) => 1 - skin[i] });
    px.flush();
  };
}
/** the shawl's ragged lower edge by angle round the body (0 = front) */
const shawlEdge = (a: number) => 1.5 - 0.06 * Math.cos(a) + nz2(a * 5, 3) * 0.05 - (Math.abs(a) < 0.35 ? (0.35 - Math.abs(a)) * 0.4 : 0);
/** the sleeves: bark-cloth with moss on the shoulders, a ragged cuff */
function sleevePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, K = px.gb.K;
  px.lightK = 0.8;
  const moss = new Float32Array(px.n);
  const st = strokes(px, { flow: downFlow(), len: [5, 12], width: [2, 3], amp: 0.5, density: 0.7, seed: 43, apply: false });
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], m = fbm3(x * 8, y * 8, z * 8, 3);
    if (y > 1.66 + m * 0.08) { moss[i] = 1; px.put(i, MOSS, 1.4 + m * 1.2 + st.v[i] * 0.5); px.rough[i] = 245; continue; }
    px.put(i, CLOTH, 2.4 + m * 0.5 + cl(K[i] * 0.9, -1.2, 0.9) + st.v[i]); px.rough[i] = 235;
  }
  formLight(px, 0.5);
  px.pelt({ len: 0.05, width: 0.018, flow: -1, mask: (i) => moss[i], tooth: 1.3, clump: 0.6 });
  px.creaseInk(1.2, { dark: 1, lit: 0.4 });
  px.flush();
}
/** old skin on the hands and feet: ruddy knuckles, blue veins over the backs, a few age spots, creased knuckles, dark
 *  long nails, earth on the soles */
function skinPaint(o: { nails?: (p: V3) => boolean; sole?: (p: V3, n: V3) => boolean; knuckles?: V3[]; flow?: V3 } = {}) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, K = px.gb.K;
    px.lightK = 0.6;
    const st = strokes(px, { flow: alongFlow(o.flow ?? [0, -1, 0]), len: [3, 7], width: [2, 3], amp: 0.45, density: 0.6, seed: 47, apply: false });
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: V3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
      if (o.nails && o.nails(p)) { px.put(i, HORN, 3 + (n[1] > 0.3 ? 1 : 0) + (K[i] > 0.5 ? 0.6 : 0)); px.rough[i] = 90; continue; }
      if (o.sole && o.sole(p, n)) { px.put(i, SOIL, 2.2 + fbm3(p[0] * 60, p[1] * 60, p[2] * 60, 2)); px.rough[i] = 220; continue; }
      const m = fbm3(p[0] * 40, p[1] * 40, p[2] * 40, 2), c = cell3(p[0], p[1], p[2], 0.006, 5);
      const vein = Math.abs(nz3(p[0] * 30, p[1] * 12, p[2] * 30)) < 0.045, spot = (c.id % 23) === 0 && c.f1 < 0.002;
      let kn = 0; for (const q of o.knuckles ?? []) kn = Math.max(kn, g2(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), 0, 0.009));
      const warm = kn + (st.id[i] >= 0 && st.id[i] < 0.12 ? 0.6 : 0);
      const R = spot ? HIDE : vein ? SKINC : warm > 0.45 ? SKINW : SKIN;
      px.put(i, R, (spot ? 3.4 : vein ? 3.6 : 4.2) + m * 0.4 + st.v[i] * 0.8 + (K[i] > 0.7 ? 0.6 : 0)); px.rough[i] = 175;
    }
    formLight(px, 0.5);
    px.creaseInk(0.9, { dark: 1.3, lit: 0.6 });
    px.flush();
  };
}
/** an eyelid: skin (warmer and a little pink at the inner corner), a crease in the lid's fold, lashes along the upper
 *  margin, the lower lid's wet line along its rim */
function lidPaint(L: LidSpec) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P;
    px.lightK = 0.45;
    for (let i = 0; i < px.n; i++) {
      const { s, off } = lidCoords(L, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      let R = s < -0.75 ? FACEW : FACE, st = 4.4;
      if (!L.lower) {
        if (off < 0.06) { R = INK; st = 1.2 - (Math.abs(Math.sin(s * 23)) < 0.4 ? 0.6 : 0); } // the lash line
        else if (off < 0.13) { R = FACEC; st = 4.0; }
        else if (Math.abs(off - 0.5) < 0.07) { R = FACEC; st = 3.4; } // the fold
        else st = 5.0 - (off < 0.4 ? 0.6 : 0);
      } else {
        if (off < 0.05) { R = FACEW; st = 5.4; } // the wet rim
        else if (off < 0.1) { R = FACEC; st = 3.6; }
        else st = 4.8 + (off > 0.35 ? 0.3 : 0);
      }
      px.put(i, R, st); px.rough[i] = !L.lower || off > 0.05 ? 170 : 60;
    }
    px.flush();
  };
}
/** the face: weathered old skin painted warm to cool (ruddy where the blood shows, grey-violet where it is thin), the
 *  lines drawn into the sculpted creases, thin grey brows, mauve thin lips, dark nostrils, age spots, veins at the
 *  temples; grey hair over the scalp under her locks */
function facePaint() {
  const H = GT.hg, E = eyeLocal();
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, K = px.gb.K, mpt = px.mpt;
    px.lightK = 0.6;
    const hairM = new Float32Array(px.n);
    const hairLine = (x: number, ax: number) => 0.074 + nz2(x * 50, 1) * 0.004 + ax * 0.12 - Math.max(0, ax - 0.05) * 0.9;
    const isHair = (x: number, y: number, ax: number, nz: number) => y > hairLine(x, ax) || nz < -0.15 - Math.max(0, -y) * 2 || (ax > 0.072 && nz < 0.35 && y > -0.08);
    // strokes down the face, outward over the cheeks (the way the skin hangs); hair strokes fall down the head
    const st = strokes(px, {
      flow: (p, n) => { const x = p[0] - H[0], y = p[1] - H[1]; if (isHair(x, y, Math.abs(x), n[2])) return downFlow()(p, n); return alongFlow([Math.sign(x) * 0.35, -1, 0.2])(p, n); },
      len: [3, 8], width: [2, 3], amp: 0.5, lift: 0.3, density: 0.75, seed: 53, apply: false,
    });
    yield;
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const x = P[i * 3] - H[0], y = P[i * 3 + 1] - H[1], z = P[i * 3 + 2] - H[2], ax = Math.abs(x), nz = N[i * 3 + 2], ny = N[i * 3 + 1];
      const m = fbm3(x * 22, y * 22, z * 22, 2) * 0.5;
      if (isHair(x, y, ax, nz)) {
        hairM[i] = 1; px.put(i, STONE, 3.6 + m * 0.6 + (y > 0.12 ? 0.4 : 0) + st.v[i] * 0.9); px.rough[i] = 220; continue;
      }
      // warm to cool
      const ex = ax - E.c[0], ey = y - E.c[1], ed = Math.hypot(ex, ey * 1.25);
      let warm = 0.47 + 0.45 * g2(Math.hypot(ax, y + 0.034), 0, 0.02) + 0.42 * g2(Math.hypot(ax - 0.046, y + 0.028), 0, 0.022) + 0.25 * g2(Math.hypot(ax, y + 0.125), 0, 0.018) + 0.2 * g2(Math.hypot(ax - 0.08, y + 0.01), 0, 0.02)
        + 0.12 * g2(Math.hypot(ax, y - 0.06), 0, 0.02) - 0.42 * g2(ed, 0, 0.026) - 0.3 * g2(Math.hypot(ax - 0.074, y - 0.04), 0, 0.02)
        - 0.2 * g2(Math.hypot(ax, y - lipY(ax) - 0.01), 0, 0.016) * (ax < 0.035 ? 1 : 0) - 0.45 * ss(-0.3, -0.6, ny) * ss(-0.095, -0.115, y) + st.v[i] * 0.2 + m * 0.15;
      if (st.id[i] >= 0 && st.id[i] < 0.04 && warm > 0.45) warm += 0.3; // dabs of rose
      let R = warm > 0.6 ? SKINW : warm < 0.24 ? SKINC : SKIN, s = 4.3 + m * 0.3 + st.v[i] * 0.4, rough = 170;
      // the sockets: shadowed, never black; deepest at the inner corner
      if (ed < 0.032) { s -= (0.032 - ed) * 34 * (ex < 0 ? 1.15 : 0.85); if (ed < 0.026) R = SKINC; }
      // bags under the eyes: lit on top, the tear trough dark under them
      const bag = Math.abs(y + 0.0165 - 0.0015 * Math.cos(ex * 90)) < mpt * 1.2 && ax > 0.022 && ax < 0.05;
      if (bag) { R = SKINC; s -= 0.9; }
      // crow's feet: three lines fanning from the outer corner, each with a lit lip above it
      const cx = ax - 0.057, cy = y - 0.008;
      if (cx > 0.002 && cx < 0.024) {
        for (const a0 of [-0.5, 0.02, 0.5]) {
          const a = a0 + nz2(cx * 120, a0 * 3) * 0.12, d = cy - Math.tan(a) * cx;
          if (Math.abs(d) < mpt * 0.7 * (1.4 - cx / 0.024)) { s -= 1.0; R = SKINC; } else if (d > 0 && d < mpt * 1.8) s += 0.35;
        }
      }
      // thin grey brows, sparse, falling away at the outer ends: hairs drawn as short slanted marks
      const by = ey - (0.0215 + 0.004 * Math.cos((ex + 0.006) * 70) - Math.max(0, ex - 0.008) * 0.32);
      if (Math.abs(by) < 0.0032 && ex > -0.019 && ex < 0.032 && nz > 0.2) {
        const hair = Math.abs(((x * 330 * Math.sign(x) + by * 900) % 1 + 1) % 1 - 0.5) < 0.3;
        if (hair) { R = SNOW; s = 2.6 + h3(Math.floor(ax / mpt), 1, 3) * 1.4; }
      }
      // the forehead lines (sculpted: the creases carry them), crossed by the vertical frown lines
      if (y > 0.05 && y < 0.095 && ax < 0.046) for (const k of [0.058, 0.071, 0.086]) { const d = y - (k + 0.0025 * Math.cos(ax * 90)); if (Math.abs(d) < mpt * 0.7 && ax < 0.046 - (k - 0.058) * 0.5) s -= 0.7; else if (d > mpt * 0.7 && d < mpt * 2.2) s += 0.25; }
      if (Math.abs(ax - 0.0055) < mpt * 0.6 && y > 0.024 && y < 0.038) s -= 0.7;
      // the nose: the lit ridge, its shadowed sides, the warm bulbous tip with a highlight, dark nostrils
      if (ax < 0.005 && y < 0.02 && y > -0.04 && nz > 0.3) s += 0.4;
      if (Math.hypot(ax, (y + 0.033) * 1.3) < 0.0045 && nz > 0.4) s += 0.7;
      const nd = Math.hypot((ax - 0.0072) * 1.2, (y + 0.0482) * 1.9);
      if (nd < 0.0042 && ny < 0.2 && nz > 0.1) { R = SKINC; s = nd < 0.0026 ? 0.8 : 2.2; }
      // the mouth: thin mauve lips, the line between them dark, the corners tucked in; fine lines over the upper lip
      const ly = lipY(ax), dl = y - ly;
      if (ax < 0.029 && Math.abs(dl) < mpt * 0.9) { R = SKINC; s = 0.9; rough = 120; }
      else if (ax < 0.023 && dl > 0 && dl < 0.0052) { R = SKINW; s = 3.5 + m * 0.4 - (dl > 0.0042 ? 0.5 : 0); rough = 130; }
      else if (ax < 0.02 && dl < 0 && dl > -0.0068) { R = SKINW; s = 4.0 + m * 0.4 - (dl < -0.0056 ? 0.8 : 0) + (dl > -0.003 && ax < 0.012 ? 0.4 : 0); rough = 110; }
      else if (ax < 0.022 && dl > 0.0062 && y < -0.062 && Math.abs(((ax / 0.0058) % 1) - 0.5) < 0.12 && h3(Math.floor(ax / 0.0058), 1, 9) > 0.45) s -= 0.5;
      if (ax > 0.026 && ax < 0.033 && Math.abs(dl) < 0.0035) s -= 0.6;
      // age spots: a few soft brown dabs over the temples, the forehead and the cheekbones
      const c = cell3(x, y, z, 0.016, 7);
      if ((c.id % 11) === 0 && c.f1 < 0.0026 + (c.id % 3) * 0.0008 && (y > -0.03 || ax > 0.05)) { R = HIDE; s = 3.6 + (c.f1 < 0.0013 ? -0.4 : 0); }
      // blue-violet veins at the temples, a little uncanny
      if (ax > 0.06 && y > 0.015 && y < 0.075 && Math.abs(nz3(x * 70, y * 25, z * 70)) < 0.04) { R = VIOLET; s = 3.6; }
      // one mole by the left corner of the mouth
      if (Math.hypot(x - 0.036, y - lipY(0.036) - 0.006) < 0.0021) { R = FUR; s = 1.6; }
      // the jaw's underside and the chin's shadow
      if (ny < -0.45) s -= 0.5;
      // the skin ramps are drawn in their ten-step face versions (the same steps, scaled)
      if (R === SKIN || R === SKINW || R === SKINC) { px.put(i, R === SKIN ? FACE : R === SKINW ? FACEW : FACEC, s * 1.24 + 0.15); } else px.put(i, R, s);
      px.rough[i] = rough;
    }
    yield;
    // the face's rings are dense up and down and sparser across: soften the curvature terms (they band along rings)
    // the form from the light and the occlusion only: the face's rings are dense up and down and sparse across, so
    // the curvature terms band along them (the creases are drawn by hand above instead)
    formLight(px, 0.45, { cavity: 0, ridge: 0, ao: 1.1, wrap: 0.8 });
    px.pelt({ len: 0.08, width: 0.007, flow: -1, down: 0.9, mask: (i) => hairM[i], tooth: 1.2, clump: 0.4, strands: 0.45 });
    px.creaseInk(1.4, { dark: 0.8, lit: 0.4, mask: (i) => hairM[i] }); void K;
    yield;
    px.flush();
  };
}
/** tamarack bark on the antlers: long grey plates over red-brown furrows running along the branch, flaking at their
 *  edges, a scatter of lichen rosettes and crust on the upper sides; the burrs dark and knotted */
function antlerPaint(sites: { c: V3; n: V3; r: number; R: number[]; cup?: number[] }[]) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, K = px.gb.K;
    px.lightK = 0.7;
    // the run of the branch on this chart: from the first row's centre to the last row's
    const cen = (y: number) => { let sx = 0, sy = 0, sz = 0; for (let x = 0; x < px.w; x++) { const i = (y * px.w + x) * 3; sx += P[i]; sy += P[i + 1]; sz += P[i + 2]; } return [sx / px.w, sy / px.w, sz / px.w] as V3; };
    const dir = nrm(sub(cen(px.h - 1), cen(0)));
    const st = strokes(px, { flow: alongFlow(dir), len: [5, 12], width: [2, 3], amp: 0.8, lift: 0.4, density: 0.9, seed: 61, apply: false });
    for (let i = 0; i < px.n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], m = fbm3(x * 30, y * 30, z * 30, 2);
      // the furrows: where the bark cracks between plates (the sculpted valleys), red-brown deep inside
      const furrow = K[i] < -0.35;
      let R = BARK, s = 4.1 + m * 0.5 + st.v[i] * 1.1;
      if (furrow) { s = 1.4 + m * 0.4; if (K[i] > -0.7) { R = HEART; s = 1.8; } }
      else if (st.id[i] >= 0 && st.id[i] < 0.12) { R = STONE; s = 4.4 + m * 0.5; } // weathered grey plate faces
      // crusts of lichen on the upper sides: pale sage patches with a lit edge
      const lc = fbm3(x * 11 + 7, y * 11, z * 11, 2);
      if (N[i * 3 + 1] > 0.15 && lc > 0.36) { R = lc > 0.5 ? SNOW : SAGE; s = (lc > 0.5 ? 2.2 : 3.4) + m * 0.6 + (lc < 0.39 ? -1 : 0) + st.v[i] * 0.4; px.rough[i] = 240; px.put(i, R, s); continue; }
      px.put(i, R, s); px.rough[i] = 230;
    }
    px.rosettes(sites, { seed: 5 });
    formLight(px, 0.55);
    px.creaseInk(0.9, { dark: 1.0, lit: 0.8 }); px.flush();
  };
}
/** the staff: grey weathered wood, a twist of grain, knots; worn smooth and darker where her hand holds it */
function staffPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.7;
  const st = strokes(px, { flow: alongFlow([0, 1, 0]), len: [6, 14], width: [2, 3], amp: 0.6, density: 0.8, seed: 67, apply: false });
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], a = Math.atan2(x - GT.staff.x, z - GT.staff.z), m = fbm3(x * 40, y * 12, z * 40, 2);
    const grain = Math.abs(Math.sin(a * 5 + y * 9 + m * 3)) < 0.14, knot = cell3(x, y * 0.6, z, 0.05, 2).f1 < 0.006;
    const worn = Math.abs(y - GT.grip[1]) < 0.09;
    px.put(i, worn ? FUR : STONE, worn ? 3 + m : 3.4 + m * 0.8 - (grain ? 1 : 0) - (knot ? 1.6 : 0) - (y < 0.15 ? 1 : 0) + st.v[i]); px.rough[i] = worn ? 120 : 220;
  }
  formLight(px, 0.45);
  px.creaseInk(1, { dark: 1.2, lit: 0.6 }); px.flush();
}

/** her hair as alpha-cut cards: each lock a hank of fine wavy strands with gaps between them, darker at the root,
 *  silvering toward the tips, the strands spreading a little as they fall */
function hairCards(tiles: number[][], steps: number[]) {
  return (ch: Chart, _p: Piece, _b: Body) => {
    const r = ch.reg!, TW = r.w / LOCK_VARIANTS, TH = r.h / tiles.length;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const v = Math.min(LOCK_VARIANTS - 1, Math.floor(x / TW)), row = Math.min(tiles.length - 1, Math.floor(y / TH)), R = tiles[row];
      const e = ((x - v * TW) / TW - 0.5) / 0.44, t = cl(((y - row * TH) / TH - 0.03) / 0.94, 0, 1);
      const n = 8 + v, pxW = 1.6 / (TW * 0.88);
      let hit = -1, edge = 0;
      for (let k = 0; k < n; k++) {
        const s0 = ((k + 0.5) / n) * 1.7 - 0.85 + (h3(k, v, 81) - 0.5) * 0.12, len = 0.86 + 0.14 * h3(k, v, 82);
        if (t > len) continue;
        // the strands gather toward the lock's tip, waving gently together
        const xk = s0 * (1 - t * 0.55) + Math.sin(t * 6 + v) * 0.06 * t + Math.sin(t * (9 + k)) * 0.015, w = Math.max(pxW * 0.6, 0.085 * (1 - (t / len) * 0.5));
        const d = Math.abs(e - xk); if (d < w) { hit = k; edge = d / w; }
      }
      if (hit < 0 || Math.abs(e) > 1 || t < 0.01) { r.set(x, y, R[0], 0); r.setSD(x, y, 0, 200, 0); continue; }
      const st = (steps[row] ?? 3) + (t < 0.12 ? -1.2 : 0) + (t > 0.6 ? 0.7 : 0) + (hit % 3 === 0 ? -0.7 : hit % 3 === 1 ? 0.5 : 0) - (edge > 0.65 ? 0.6 : 0);
      r.set(x, y, R[Math.round(cl(st, 0, R.length - 1))], 255); r.setSD(x, y, 0, 200, 0);
    }
  };
}

/** long hair that hangs: each lock a ribbon traced down from its root under gravity, step by step, pushed out of the
 *  skull, the neck and the shawl (so it lies over them and slides off the shoulders), waving across its fall, tapering
 *  to a point; all the locks share one atlas of strand tiles (like anatomy locks()) */
function hangingHair(roots: { p: V3; n: V3; len: number; wid: number; col: number; seed: number }[], tiles: number[][], skin: (p: V3) => Wt): Piece {
  const m = newCM(), grids: Grid[] = [], lockOf: { vari: number; col: number }[] = [], R = 7;
  let maxL = 0, maxW = 0;
  // the surfaces the hair lies on: the head (sculpted), then the robe, the neck and the moss over the shoulders
  const outOf = (p: V3): { p: V3; n: V3 | null } => {
    const H = GT.hg, rel = sub(p, H), h = rel[1];
    if (h > -0.16 && h < 0.176) {
      const x = Math.abs(rel[0]), z = rel[2] + 0.005, th = Math.atan2(x, -z), [X, Z] = headSurf(h, th), rr = Math.hypot(X, Z + 0.005) + 0.007, cur = Math.hypot(x, z);
      if (cur < rr) { const k = rr / Math.max(1e-4, cur), q: V3 = [H[0] + rel[0] * k, p[1], H[2] - 0.005 + z * k]; return { p: q, n: nrm([rel[0], 0.25, z]) }; }
    }
    if (p[1] < 2.0 && p[1] > 1.3) {
      const zc = -0.04, x = p[0], z = p[2] - zc, a0 = Math.atan2(Math.abs(x), -z), phi = x >= 0 ? a0 : Math.PI * 2 - a0;
      const rp = robePt(p[1], phi), rr = Math.hypot(rp[0], rp[2] - zc) + 0.045, cur = Math.hypot(x, z);
      if (cur < rr) { const k = rr / Math.max(1e-4, cur); return { p: [x * k, p[1], zc + z * k], n: nrm([x, 0.4, z]) }; }
    }
    return { p, n: null };
  };
  roots.forEach((r, k) => {
    const seg = r.len / R, rows: V3[][] = [];
    let p = r.p, d = nrm(add(add(scl(r.n, 0.6), [0, -0.45, 0]), [0, 0, -0.45])), sideV = nrm(crs(r.n, [0, -1, 0]));
    if (Math.hypot(...(sideV as [number, number, number])) < 0.5) sideV = [1, 0, 0];
    for (let i = 0; i <= R; i++) {
      const t = i / R;
      if (i > 0) {
        d = nrm(add(scl(d, 0.55), [0, -0.75, 0]));
        let q = add(p, scl(d, seg));
        const o = outOf(q);
        if (o.n) { q = o.p; const dn = d[0] * o.n[0] + d[1] * o.n[1] + d[2] * o.n[2]; if (dn < 0) d = nrm(sub(d, scl(o.n, dn))); }
        p = q;
      }
      // across the lock: level, square to its fall; it waves across that
      let across = nrm(sub(sideV, scl(d, sideV[0] * d[0] + sideV[1] * d[1] + sideV[2] * d[2])));
      if (!isFinite(across[0])) across = [1, 0, 0];
      const outN = nrm(crs(across, d)), wave = Math.sin(t * 7.5 + r.seed * 1.7) * r.wid * 0.9 * t;
      const c = add(p, scl(across, wave));
      const w = r.wid * (t < 0.12 ? 0.7 + t * 2.5 : 1 - ((t - 0.12) / 0.88) * 0.8);
      rows.push([add(c, scl(across, -w)), add(c, scl(outN, r.wid * 0.22 * (1 - t))), add(c, scl(across, w))]);
    }
    grids.push(sheetGrid(m, rows, { tag: 0, out: () => r.n }));
    lockOf.push({ vari: Math.floor(h3(k, 3, 13) * LOCK_VARIANTS), col: Math.min(tiles.length - 1, r.col) });
    maxL = Math.max(maxL, r.len); maxW = Math.max(maxW, r.wid * 2);
    void k;
  });
  const nT = tiles.length;
  const charts = (p: Piece): Chart[] => {
    const faces: number[] = []; for (const g of p.grids) for (const row of g.f) for (const f of row) faces.push(f);
    const vIdx = new Map<number, [number, number, number]>();
    p.grids.forEach((g, k) => { const Rr = g.v.length, C = g.v[0].length; g.v.forEach((row, i) => row.forEach((vi, j) => vIdx.set(vi, [k, i / (Rr - 1), j / (C - 1)]))); });
    return [{ name: 'atlas', k: 1, faces, wm: maxW * LOCK_VARIANTS * 1.1, hm: maxL * nT * 1.05, wrap: false, grid: -1,
      uv: (f, c) => { const [k, along, acr] = vIdx.get(p.m.F[f][c])!, L = lockOf[k]; return [(L.vari + 0.06 + acr * 0.88) / LOCK_VARIANTS, (L.col + 0.03 + along * 0.94) / nT]; } }];
  };
  return { name: 'hair', m, grids, levels: 0, cut: true, noOcc: true, reg: 2, k: 0.55, charts, skin, paint: () => undefined };
}

// ------------------------------------------------------------------------------------------------ the robe's drapery
const ROBE: [number, number, number, number, string][] = [
  // y, half width, half depth, centre z, profile (top of the profile = her back)
  [0.035, 0.36, 0.3, -0.03, 'round'], [0.3, 0.315, 0.27, -0.025, 'round'], [0.62, 0.268, 0.243, -0.02, 'round'], [0.92, 0.222, 0.202, -0.02, 'round'],
  [1.15, 0.18, 0.148, -0.03, 'barrel'], [1.42, 0.19, 0.14, -0.04, 'barrel'], [1.62, 0.225, 0.15, -0.045, 'barrel'],
  [1.78, 0.27, 0.165, -0.05, 'shoulder'], [1.885, 0.23, 0.15, -0.045, 'shoulder'], [1.955, 0.13, 0.11, -0.03, 'round'],
  [1.99, 0.062, 0.062, -0.012, 'neck'], [2.06, 0.056, 0.058, 0.0, 'neck'], [2.13, 0.05, 0.05, 0.012, 'round'],
];
/** a half profile (nine points, top = her back, down the +x side to her front) sampled at u in 0..1 (Catmull-Rom) */
function profAt(name: string, u: number): [number, number] {
  const Q = PROFILES[name], f = cl(u, 0, 1) * (Q.length - 1), i = Math.min(Q.length - 2, Math.floor(f)), t = f - i;
  const P = (k: number) => Q[Math.max(0, Math.min(Q.length - 1, k))];
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [cr(P(i - 1)[0], P(i)[0], P(i + 1)[0], P(i + 2)[0]), cr(P(i - 1)[1], P(i)[1], P(i + 1)[1], P(i + 2)[1])];
}
/** the robe at height y and angle phi round her (0 her back, pi her front, +x side first): a creature-space point */
function robePt(y: number, phi: number): V3 {
  let k = 0; while (k + 2 < ROBE.length && y > ROBE[k + 1][0]) k++;
  const A = ROBE[k], B = ROBE[k + 1], t = cl((y - A[0]) / (B[0] - A[0]), 0, 1), tt = t * t * (3 - 2 * t);
  const w = lerp1(A[1], B[1], tt), d = lerp1(A[2], B[2], tt), zc = lerp1(A[3], B[3], tt);
  const side = phi <= Math.PI ? 1 : -1, u = (side > 0 ? phi : Math.PI * 2 - phi) / Math.PI;
  const pa = profAt(A[4], u), pb = profAt(B[4], u), qx = lerp1(pa[0], pb[0], t), qy = lerp1(pa[1], pb[1], t);
  let x = qx * w * side, z = zc - qy * d;
  const a = Math.atan2(x, z);
  // the folds: round-backed tubes of cloth with sharp valleys between, hanging from under the shawl and fanning out,
  // deepening toward the hem; a few gather at the waist where a cord holds the robe
  const hang = cl((1.5 - y) / 1.42, 0, 1), sh = shawlEdge(a);
  let f = Math.sin(phi * 6 + 1.3 + nz2(y * 1.4, 2) * 1.4) + 0.6 * Math.sin(phi * 9 + 0.4 + y * 0.9 + nz2(y * 2 + 5, 1) * 1.1) + 0.32 * Math.sin(phi * 15 + 2.1 + y * 2.6);
  f /= 1.92; f = f > 0 ? Math.pow(f, 0.65) : -Math.pow(-f, 1.7);
  let out = (0.003 + 0.034 * Math.pow(hang, 1.1)) * f;
  // the cord at the waist: a pinch, the cloth bunching over it
  out -= 0.012 * g2(y, 1.16, 0.018) - 0.006 * g2(y, 1.2, 0.03) * (1 + f);
  // the shawl of moss lies over the robe: a lip at its ragged edge, lumpy cushions over the shoulders
  if (y > sh - 0.04 && y < 1.97) {
    const on = ss(sh - 0.04, sh + 0.01, y) * ss(1.975, 1.94, y);
    out += on * (0.016 + 0.012 * Math.max(0, fbm3(x * 9, y * 9, z * 9, 2) + 0.2)) + 0.006 * g2(y, sh + 0.005, 0.012);
  }
  // a ragged, flared hem
  if (y < 0.12) out += 0.022 * (1 - y / 0.12) * (1 + 0.5 * Math.sin(phi * 7));
  const r = Math.hypot(x, z - zc) || 1;
  x += (x / r) * out; z += ((z - zc) / r) * out;
  return [x, y, z];
}
function robePiece(skin: (p: V3) => Wt, paint: Piece['paint']): Piece {
  const m = newCM(), C = 52;
  const ys = [0.03, 0.07, 0.13, 0.21, 0.3, 0.4, 0.51, 0.62, 0.73, 0.84, 0.94, 1.03, 1.1, 1.145, 1.175, 1.21, 1.27, 1.34, 1.41, 1.46, 1.5, 1.54, 1.58, 1.62, 1.66, 1.7, 1.74, 1.775, 1.81, 1.84, 1.87, 1.895, 1.92, 1.94, 1.958, 1.972, 1.985, 2.0, 2.03, 2.07, 2.1, 2.13];
  const rings: Ring[] = ys.map((y, ri) => {
    const pts: number[][] = [];
    for (let j = 0; j < C; j++) {
      const phi = (j / C) * Math.PI * 2;
      // the hem's ragged line
      const yy = ri === 0 ? y + (h3(j, 5, 77) - 0.5) * 0.05 + nz2(phi * 2, 4) * 0.03 : y;
      const p = robePt(yy, phi);
      pts.push([p[0], p[2] - 0, p[1] - y]);
    }
    return { c: [0, y, 0], x: [1, 0, 0], y: [0, 0, 1], pts: pts.map((q) => [q[0], q[1]]), dy: pts.map((q) => q[2]) } as Ring & { dy: number[] };
  });
  const g = tube(m, rings, { tag: 0, capS: true, capE: false });
  // the ragged hem: each point of the first ring at its own height
  const r0 = rings[0] as Ring & { dy: number[] };
  g.v[0].forEach((vi, j) => { m.V[vi][1] += r0.dy[j]; });
  return { name: 'trunk', m, grids: [g], levels: 0, skin, paint, k: 0.85 };
}

// ------------------------------------------------------------------------------------------------ the build
export const buildGrannyModel = (o: { page?: number; den?: number } = {}): GrannyModel => runSync(grannyModelGen(o));
export const buildGrannyModelAsync = (o: { page?: number; den?: number } = {}): Promise<GrannyModel> => runAsync(grannyModelGen(o));

export function* grannyModelGen(o: { page?: number; den?: number } = {}): Generator<string | void, GrannyModel> {
  const bones = grannyBones(), bi = (n: string) => { const k = bones.findIndex((b) => b.name === n); if (k < 0) throw new Error(n); return k; };
  const body = new Body(o.page ?? 1024);
  body.seed = 4242;
  const HG = GT.hg, HEAD = bi('head');

  // ---- the robe: hem to neck, one skin; the skirt follows the legs, the shoulders ride the arms
  const J: V3[] = [[0, 0.9, -0.02], GT.hips, GT.spine, GT.chest, GT.neck, GT.head, [0, 2.3, 0.02]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('spine'), bi('chest'), bi('neck'), HEAD], 0.35);
  const robeSkin = (p: V3): Wt => {
    let w = spineSkin(p);
    const ax = Math.abs(p[0]), sd = p[0] > 0 ? 'L' : 'R';
    // the shoulders of the shawl lift with the arms
    if (p[1] > 1.6 && ax > 0.13) w = addWeights(w, [[bi('arm' + sd), cl((ax - 0.13) / 0.12, 0, 1) * cl((p[1] - 1.6) / 0.2, 0, 1) * 0.55]]);
    // the skirt swings with the legs, more toward the hem
    if (p[1] < 1.0) {
      const k = cl((1.0 - p[1]) / 0.8, 0, 1) * 0.55, side = cl(0.5 + p[0] / 0.24, 0, 1);
      w = addWeights(w, [[bi('thighL'), k * side], [bi('thighR'), k * (1 - side)]]);
    }
    return w;
  };
  const robe = body.add(robePiece(robeSkin, robePaint()));
  body.finalize(robe);
  yield 'robe';

  // ---- the head: the sculpted rings (granny/face.ts), from under the chin to the crown, the seam at the back
  const FL = faceMarks(1);
  const headSkin = (p: V3): Wt => {
    if (p[1] < GT.head[1] + 0.02 && p[2] < HG[2] - 0.02) return [HEAD, 0.6, bi('neck'), 0.4];
    // the brows and the mouth corners carry the skin round them (they rise, knit, and lift into a smile)
    const ax = Math.abs(p[0]), sd = p[0] >= 0 ? 'L' : 'R', extra: [number, number][] = [];
    if (p[2] > HG[2] + 0.02) {
      const bw = cl(1 - Math.hypot(ax - FL.brow[0], (p[1] - FL.brow[1]) * 1.6, (p[2] - FL.brow[2]) * 0.6) / 0.028, 0, 1);
      if (bw > 0) extra.push([bi('brow' + sd), bw * 0.85]);
      const sw = cl(1 - Math.hypot(ax - FL.smile[0], (p[1] - FL.smile[1]) * 1.2, (p[2] - FL.smile[2]) * 0.5) / 0.026, 0, 1);
      if (sw > 0) extra.push([bi('smile' + sd), sw * 0.8]);
    }
    return extra.length ? addWeights([HEAD, 1], extra) : [HEAD, 1];
  };
  {
    const m = newCM(), half = HEAD_COLS;
    // bony bosses where the antlers grow from: the scalp swells round them
    const boss = (h: number, th: number, x: number, z: number): number => { const d = Math.hypot(x - ANTLER_ROOT[0], h - ANTLER_ROOT[1], z - ANTLER_ROOT[2]); void th; return 0.012 * g2(d, 0, 0.026); };
    const rings: Ring[] = HEAD_ROWS.map((h) => {
      const pts: number[][] = [];
      const pt = (th: number, s: number) => { let [x, z] = headSurf(h, th); const b = boss(h, th, x, z); if (b > 1e-5) { const r = Math.hypot(x, z + 0.005) || 1; x += (x / r) * b; z += ((z + 0.005) / r) * b; } return [x * s, z]; };
      for (let j = 0; j < half.length; j++) pts.push(pt(half[j], 1));
      for (let j = half.length - 2; j >= 1; j--) pts.push(pt(half[j], -1));
      return { c: [HG[0], HG[1] + h, HG[2]], x: [1, 0, 0], y: [0, 0, 1], pts };
    });
    const g = tube(m, rings, { tag: 0, capS: true, capE: true });
    body.add({ name: 'skull', m, grids: [g], levels: 0, skin: headSkin, paint: facePaint(), k: 2.6 } as Piece);
  }
  yield 'head';
  const E = eyeAt();
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(E.c, s), ax = mir(E.ax, s);
    // kind eyes, not a doll's: a small soft moss-green hazel iris with white either side, a modest pupil, the wet shine of a living eye; the whites old and yellowed
    const eye = body.add(eyeball({ name: 'eye' + S, c, ax, r: E.r, bone: HEAD, iris: SAGE, pupil: 'round', pupilR: 0.36, irisA: 0.44, sclera: RP('bone'), k: 3.4, levels: 1, around: 10 }));
    eye.paint = eyePaint({ c, ax, side: s, irisA: 0.44, iris: RP('moss'), pupil: 'round', pupilR: 0.3, sclera: RP('bone'), arcus: RP('snow'), collar: RP('ochre'), glint: [0.36, 0.42], shine: 160 });
    // heavy hooded upper lids (modelled 0.12 rad higher: the creature rests them that much lower), the lower lids
    // with a wet rim; their corners meet in an almond, the outer corners drooping with age
    const up: LidSpec = { name: 'lid' + S, c, ax, r: E.r, bone: bi('lid' + S), side: s, open: 0.25, wide: 0.92, inner: 0.09, outer: 0.04, ri: 1.03, ro: 1.2, swell: 0.09, root: 1.5, k: 2.2, paint: () => undefined };
    up.paint = lidPaint(up);
    body.add(almondLid(up));
    const lo: LidSpec = { name: 'llid' + S, c, ax, r: E.r, bone: HEAD, side: s, lower: true, open: 0.23, wide: 0.92, inner: -0.03, outer: -0.08, ri: 1.02, ro: 1.12, swell: 0.05, root: 1.35, k: 2.0, paint: () => undefined };
    lo.paint = lidPaint(lo);
    body.add(almondLid(lo));
  }

  // ---- antlers: living tamarack branches growing out of bosses on her skull: a knotted burr where they break the
  // scalp, barked and furrowed, forking, kinked where they grew round something; beard lichen and needles on them
  const needleSeats: LockSeat[] = [], lichenSeats: LockSeat[] = [];
  const rosettes: { c: V3; n: V3; r: number; R: number[]; cup?: number[] }[] = [];
  const twig = (name: string, ctrl: V3[], r0: number, r1: number, n: number, tufts: number, seed: number, beard: number) => {
    const path = curve(ctrl, n);
    // where it breaks out of the scalp: the burr
    let tEx = -1; for (let k = 0; k < path.length; k++) if (!insideHead(path[k])) { tEx = k / (path.length - 1); break; }
    const knots = [0.3 + 0.1 * h3(seed, 1, 5), 0.62 + 0.1 * h3(seed, 2, 5)];
    body.add(stalk({
      name, path, around: 9, capS: true, capE: true, levels: 1, k: 1.25, skin: () => [HEAD, 1], paint: () => undefined,
      r: (t) => lerp1(r0, r1, Math.pow(t, 0.8)) * (1 + 0.12 * Math.sin(t * 17 + seed) + (tEx >= 0 ? 0.6 * g2(t, tEx + 0.03, 0.05) : 0) + 0.22 * g2(t, knots[0], 0.03) + 0.16 * g2(t, knots[1], 0.025)),
      // the bark: ridged plates between furrows that twist a little along the branch
      sec: (a, t) => 1 + 0.12 * Math.pow(Math.abs(Math.cos(a * 2 + t * 5 + seed)), 4) - 0.06 * Math.pow(Math.abs(Math.sin(a * 2 + t * 5 + seed)), 6) + (tEx >= 0 ? 0.18 * g2(t, tEx + 0.03, 0.05) * Math.sin(a * 3 + seed) : 0),
    }));
    // lichen rosettes on the upper side, beard lichen hanging from under it
    for (let k = 0; k < 3; k++) {
      const t = 0.25 + 0.6 * h3(k, 7, seed), q = path[Math.round(t * (path.length - 1))], rr = lerp1(r0, r1, Math.pow(t, 0.8));
      rosettes.push({ c: add(q, [0, rr * 0.8, 0]), n: [0, 1, 0], r: rr * (0.9 + 0.6 * h3(k, 8, seed)), R: k % 2 ? SAGE : SNOW, cup: OCHRE });
    }
    for (let k = 0; k < beard; k++) {
      const t = 0.2 + 0.7 * h3(k, 11, seed), q = path[Math.round(t * (path.length - 1))], rr = lerp1(r0, r1, Math.pow(t, 0.8));
      lichenSeats.push({ p: add(q, [0, -rr * 0.6, 0]), n: [0, -1, 0], dir: nrm([h3(k, 12, seed) - 0.5, -1, h3(k, 13, seed) - 0.5]), len: 0.07 + 0.08 * h3(k, 14, seed), wid: 0.018, lift: 0.0, droop: 0.05, col: k % 2, w: [HEAD, 1] });
    }
    // short spurs with tufts of needles along the outer half, a crown of them at the tip
    for (let k = 0; k < tufts; k++) {
      const t = 0.35 + 0.65 * (k + 0.5) / tufts, f = t * (path.length - 1), i0 = Math.min(path.length - 2, Math.floor(f)), q = f - i0;
      const p = add(path[i0], scl(sub(path[i0 + 1], path[i0]), q)), d = nrm(sub(path[i0 + 1], path[i0]));
      const a = h3(k, 3, seed) * Math.PI * 2, side = nrm([Math.cos(a), 0.6 + Math.sin(a) * 0.4, Math.sin(a)]);
      const out = nrm(add(side, scl(d, -side[0] * d[0] - side[1] * d[1] - side[2] * d[2])));
      for (let c = 0; c < 2; c++) {
        const dir = nrm(add(add(out, scl(d, 0.5)), [0, 0.25, 0])), n = nrm(c === 0 ? [dir[2], 0.2, -dir[0]] : [-dir[1], dir[0], 0.3]);
        needleSeats.push({ p, n, dir, len: 0.065 + 0.025 * h3(k, c, seed), wid: 0.032, lift: 0.1, droop: 0.06, col: (k + c) % 3, w: [HEAD, 1] });
      }
    }
  };
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const j = (k: number, a: number) => (h3(k, s > 0 ? 1 : 2, 77) - 0.5) * a;
    const b0 = add(HG, mir(ANTLER_ROOT, s));
    const beam: V3[] = [add(b0, [-s * 0.012, -0.03, 0]), add(b0, [s * 0.012, 0.045, -0.008]), add(b0, [s * (0.08 + j(1, 0.02)), 0.11, -0.04]), add(b0, [s * 0.13, 0.21, -0.02 + j(2, 0.03)]), add(b0, [s * (0.22 + j(3, 0.02)), 0.28, -0.07]), add(b0, [s * 0.28, 0.39, -0.06]), add(b0, [s * 0.38, 0.44, -0.1 + j(4, 0.03)]), add(b0, [s * 0.44, 0.54, -0.09]), add(b0, [s * 0.5, 0.59, -0.12])];
    twig('antler' + S, beam, 0.036, 0.008, 20, 6, 1 + s, 5);
    const bp = curve(beam, 18);
    // forks: forward and up off the low bend, back off the middle, up off the high bend, out at the crown
    twig('fork' + S + 0, [bp[4], add(bp[4], [s * 0.01, 0.07, 0.05]), add(bp[4], [s * 0.05, 0.15, 0.06 + j(5, 0.02)]), add(bp[4], [s * 0.03, 0.24, 0.11]), add(bp[4], [s * 0.06, 0.29, 0.1])], 0.017, 0.004, 9, 4, 3 + s, 2);
    twig('fork' + S + 1, [bp[8], add(bp[8], [s * 0.04, 0.05, -0.06]), add(bp[8], [s * 0.07, 0.12, -0.13]), add(bp[8], [s * 0.13, 0.15, -0.2 + j(6, 0.03)])], 0.014, 0.004, 8, 3, 5 + s, 2);
    twig('fork' + S + 2, [bp[11], add(bp[11], [s * 0.0, 0.08, 0.02]), add(bp[11], [-s * 0.03, 0.16, 0.0]), add(bp[11], [s * 0.01, 0.25, 0.04 + j(7, 0.03)])], 0.013, 0.0035, 8, 4, 7 + s, 1);
    twig('fork' + S + 3, [bp[14], add(bp[14], [s * 0.06, 0.03, 0.04]), add(bp[14], [s * 0.13, 0.08, 0.06]), add(bp[14], [s * 0.17, 0.06, 0.1])], 0.01, 0.003, 6, 3, 9 + s, 1);
    twig('fork' + S + 4, [bp[6], add(bp[6], [s * 0.05, -0.01, 0.05]), add(bp[6], [s * 0.11, 0.02, 0.09])], 0.009, 0.003, 5, 2, 11 + s, 1);
  }
  const barkPaint = antlerPaint(rosettes);
  for (const p of body.pieces) if (/^(antler|fork)/.test(p.name)) p.paint = barkPaint;
  yield 'antlers';

  // ---- arms: long sleeves to the wrist, hands; the right fist round the staff
  const sleeves: Piece[] = [];
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const a = s > 0 ? GT.armL : GT.armR;
    // wrinkled cloth: ridges and valleys that wander round the sleeve, gathering at the elbow; a flared ragged cuff
    const wr = (k: number): [number, number, number][] => [[((k * 97) % 360) - 180, 0.09, 22], [((k * 61 + 120) % 360) - 180, -0.07, 26], [((k * 41 + 250) % 360) - 180, 0.07, 18]];
    const rings: LimbRing[] = [
      { t: -0.25, r: 0.075 }, { t: -0.08, r: 0.074, b: wr(1) }, { t: 0.05, r: 0.068, b: wr(2) }, { t: 0.25, r: 0.06, b: wr(3) }, { t: 0.45, r: 0.056, crease: 0.6, b: wr(4) }, { t: 0.55, r: 0.058, b: [[0, 0.12, 30], [180, -0.08, 30], [90, 0.08, 20]] },
      { t: 0.72, r: 0.064, b: wr(6) }, { t: 0.86, r: 0.074, b: wr(7) }, { t: 0.96, r: 0.085, b: wr(8) }, { t: 1.0, r: 0.088, b: [[30, 0.1, 20], [-60, 0.08, 18], [150, 0.12, 22], [-150, -0.06, 20]] }, { t: 1.01, r: 0.03 },
    ];
    const arm = limb({
      name: 'sleeve' + S, side: s, hip: a.sh, knee: a.el, sole: [a.wr[0], a.wr[1] - 0.012, a.wr[2]], tj: [0, 0.5, 1], rings, around: 16, levels: 1, rise: 0.06,
      foot: { pad: 0.03, h: 0.01, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('chest'), up: bi('arm' + S), lo: bi('elb' + S), foot: bi('hand' + S) }, paint: sleevePaint, clawPaint: sleevePaint, k: 0.8,
    });
    body.add(arm.skin); sleeves.push(arm.skin);
  }
  /** a long old finger: three phalanges, the knuckles swollen (the middle one most), thinner between, flatter on the
   *  palm side, a dark nail at the tip */
  const finger = (name: string, joints: V3[], r0: number, skin: (p: V3) => Wt, palm: V3) => {
    const path = curve(joints, 12), cum = [0];
    for (let k = 1; k < joints.length; k++) cum.push(cum[k - 1] + Math.hypot(...(sub(joints[k], joints[k - 1]) as [number, number, number])));
    const tj = cum.map((c) => c / cum[cum.length - 1]);
    const tip = joints[joints.length - 1], dTip = nrm(sub(tip, joints[joints.length - 2]));
    const kn = joints.slice(1, joints.length - 1);
    body.add(stalk({
      name, path, around: 7, capE: true, levels: 1, k: 1.7, skin, up: palm,
      r: (t) => r0 * (1 - t * 0.3) * (1 + 0.2 * g2(t, tj[1], 0.05) + 0.26 * g2(t, tj[2], 0.045) + 0.16 * g2(t, tj[3] ?? 0.8, 0.04) - 0.08 * g2(t, ((tj[2] + (tj[3] ?? 0.8)) / 2), 0.05) - 0.07 * g2(t, (tj[1] + tj[2]) / 2, 0.06)),
      sec: (a) => (Math.cos(a) > 0 ? 1 : 0.84),
      paint: skinPaint({ knuckles: kn, flow: dTip, nails: (p) => { const d = sub(p, tip), along = d[0] * dTip[0] + d[1] * dTip[1] + d[2] * dTip[2], back = (p[0] - tip[0]) * palm[0] + (p[1] - tip[1]) * palm[1] + (p[2] - tip[2]) * palm[2]; return along > -0.016 && back > -0.001 && Math.hypot(...(sub(d, scl(dTip, along)) as [number, number, number])) < r0 * 1.2; } }),
    }));
  };
  // the left hand: hanging open, long fingers a little curled toward the palm (-x)
  {
    const wr = GT.armL.wr, hb = bi('handL');
    const pal = (d: number, w: number, t: number): Station => ({ c: add(wr, [0, -d, 0.004 + d * 0.05]), s: [t, w], p: 'flat', tw: d > 0.06 ? [[3, 0.08, 0], [5, 0.08, 0]] : undefined });
    body.add(trunk({ name: 'palmL', stations: [pal(-0.03, 0.03, 0.026), pal(0.0, 0.036, 0.024), pal(0.04, 0.042, 0.021), pal(0.08, 0.045, 0.019), pal(0.11, 0.041, 0.018)], tween: 0, capS: true, capE: true, levels: 1, k: 1.6, skin: (p) => (p[1] > wr[1] - 0.005 ? [bi('elbL'), 0.35, hb, 0.65] : [hb, 1]), paint: skinPaint({ knuckles: [0, 1, 2, 3].map((k) => add(wr, [0.012, -0.108, 0.03 - k * 0.0215])) }) }));
    const fl = [0.135, 0.15, 0.142, 0.115];
    for (let k = 0; k < 4; k++) {
      const fz = 0.03 - k * 0.0215, L = fl[k], base: V3 = add(wr, [0, -0.106, fz]);
      const joints: V3[] = [add(base, [0.002, 0.02, 0]), base, add(base, [-0.003, -L * 0.44, 0.002]), add(base, [-0.011, -L * 0.74, 0.004]), add(base, [-0.021, -L, 0.003])];
      const [b1, b2] = k === 0 ? [bi('indexL'), bi('index2L')] : [bi('fingL'), bi('fing2L')];
      const sk = chainSkin([add(base, [0, 0.03, 0]), add(base, [0, -L * 0.42, 0]), add(base, [0, -L * 1.3, 0])], [b1, b2], 0.3);
      finger('fingL' + k, joints, 0.0104, sk, [1, 0, 0]);
    }
    const tb: V3 = add(wr, [-0.012, -0.04, 0.036]);
    finger('thumbL', [add(tb, [0.004, 0.02, -0.01]), tb, add(tb, [-0.012, -0.036, 0.016]), add(tb, [-0.03, -0.08, 0.02])], 0.0118, () => [bi('thumbL'), 1], nrm([0.6, 0, -0.8]));
  }
  // the right fist round the staff
  {
    const G = GT.grip, wr = GT.armR.wr, hb = bi('handR'), S = GT.staff;
    const ax: V3 = nrm(sub(G, wr));
    body.add(trunk({ name: 'palmR', stations: [{ c: add(wr, scl(ax, -0.03)), s: [0.026, 0.03], p: 'flat' }, { c: wr, s: [0.028, 0.036], p: 'flat' }, { c: add(wr, scl(ax, 0.045)), s: [0.03, 0.044], p: 'flat' }, { c: add(add(wr, scl(ax, 0.085)), [-0.012, 0, 0]), s: [0.026, 0.044], p: 'flat' }], tween: 0, capS: true, capE: true, levels: 1, k: 1.5, skin: () => [hb, 1], paint: skinPaint() }));
    for (let k = 0; k < 4; k++) {
      const y = G[1] + 0.032 - k * 0.022, R = 0.034;
      const pts: V3[] = [-2.0, -1.2, -0.4, 0.4, 1.1].map((a, q) => [S.x + Math.sin(a) * R * (q === 0 ? 1.18 : 1.04), y - q * 0.002, S.z + Math.cos(a) * R * (q === 0 ? 1.18 : 1.04)]);
      pts[0] = add(pts[0], [-0.012, 0.0, -0.01]);
      finger('fingR' + k, pts, 0.0104, () => [hb, 1], nrm([pts[1][0] - S.x, 0, pts[1][2] - S.z]));
    }
    const ty = G[1] + 0.04;
    const tpts: V3[] = [-1.9, -2.6, -3.3, -3.9].map((a) => [S.x + Math.sin(a) * 0.035, ty - 0.004, S.z + Math.cos(a) * 0.035]);
    finger('thumbR', [add(wr, [-0.01, -0.03, 0.01]), ...tpts], 0.0118, () => [hb, 1], nrm([tpts[0][0] - S.x, 0, tpts[0][2] - S.z]));
    // the staff: a crooked length of grey tamarack, a knot or two, a forked top
    const sp: V3[] = [[S.x, -0.01, S.z], [S.x + 0.006, 0.4, S.z - 0.004], [S.x - 0.004, 0.85, S.z + 0.006], [S.x + 0.003, 1.3, S.z - 0.002], [S.x - 0.006, 1.58, S.z + 0.004], [S.x + 0.004, S.top, S.z - 0.01]];
    body.add(stalk({ name: 'staff', path: curve(sp, 22), r: (t) => (0.021 - t * 0.005) * (1 + 0.22 * g2(t, 0.31, 0.02) + 0.18 * g2(t, 0.62, 0.015) + 0.25 * g2(t, 0.9, 0.03)), sec: (a, t) => 1 + 0.06 * Math.sin(a * 3 + t * 20), around: 7, capS: true, capE: true, levels: 1, k: 0.9, skin: () => [hb, 1], paint: staffPaint }));
    const top: V3 = [S.x + 0.004, S.top - 0.03, S.z - 0.01];
    body.add(stalk({ name: 'staffF', path: curve([top, add(top, [0.03, 0.06, 0.01]), add(top, [0.07, 0.1, -0.01]), add(top, [0.08, 0.15, 0.02])], 6), r: (t) => 0.012 - t * 0.008, around: 6, capE: true, levels: 1, k: 0.9, skin: () => [hb, 1], paint: staffPaint }));
  }
  yield 'hands';

  // ---- legs, long bare feet
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const l = GT.leg, hp = mir(l.hip, s), kn = mir(l.kn, s), an = mir(l.an, s);
    const segL = [Math.hypot(...(sub(hp, kn) as [number, number, number])), Math.hypot(...(sub(kn, an) as [number, number, number]))];
    let lr: LimbRing[] = legRings('bear', false, 0.056, [0, 0.5, 1], segL, 0.02);
    lr = lr.map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.7 : r.t < 0 ? 0.85 : 1) }));
    const leg = limb({
      name: 'leg' + S, side: s, hip: hp, knee: kn, sole: [an[0], an[1] - 0.03, an[2]], tj: [0, 0.5, 1], rings: lr, around: 10, levels: 1, rise: 0.05,
      foot: { pad: 0.03, h: 0.02, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('hips'), up: bi('thigh' + S), lo: bi('shin' + S), foot: bi('foot' + S) }, paint: skinPaint(), clawPaint: skinPaint(), k: 0.5,
    });
    body.add(leg.skin);
    const fb = bi('foot' + S), tb = bi('toes' + S);
    const st = (z: number, y: number, w: number, h: number, tw?: [number, number, number][]): Station => ({ c: [an[0] + s * (z > 0.08 ? 0.008 : 0), y, z], s: [w, h], p: 'flat', tw: tw ?? [[6, 0, -0.25], [7, 0, -0.3], [8, 0, -0.3]] });
    // bony old feet: the ankle knobs, the tendons over the instep, the ball of the foot
    body.add(trunk({
      name: 'foot' + S, stations: [st(-0.1, 0.045, 0.035, 0.045), st(-0.07, 0.06, 0.047, 0.06, [[3, 0.12, 0], [6, 0, -0.25], [7, 0, -0.3], [8, 0, -0.3]]), st(-0.01, 0.07, 0.048, 0.065, [[1, 0.06, 0.08], [6, 0, -0.25], [7, 0, -0.3], [8, 0, -0.3]]), st(0.06, 0.05, 0.05, 0.048, [[1, 0.08, 0.1], [6, 0, -0.25], [7, 0, -0.3], [8, 0, -0.3]]), st(0.13, 0.032, 0.056, 0.034), st(0.17, 0.024, 0.05, 0.022)],
      tween: 0, capS: true, capE: true, levels: 1, k: 0.9, skin: (p) => (p[2] > 0.12 ? [tb, 0.6, fb, 0.4] : p[1] > 0.1 ? [bi('shin' + S), 0.5, fb, 0.5] : [fb, 1]),
      paint: skinPaint({ sole: (_p, n) => n[1] < -0.3, flow: [0, 0, 1] }),
    }));
    for (let k = 0; k < 5; k++) {
      const x = an[0] + s * (0.01 + (k - 2) * 0.02), L = k === 0 ? 0.075 : 0.07 - k * 0.008, base: V3 = [x, 0.024, 0.165];
      const tip: V3 = [x + s * (k - 2) * 0.006, 0.008, base[2] + L];
      body.add(stalk({ name: 'toe' + S + k, path: curve([base, [x + s * (k - 2) * 0.003, 0.032, base[2] + L * 0.45], [x + s * (k - 2) * 0.005, 0.021, base[2] + L * 0.8], tip], 6), r: (t) => (k === 0 ? 0.013 : 0.0095) * (1 - t * 0.3) * (1 + 0.18 * g2(t, 0.45, 0.08)), around: 7, capE: true, levels: 0, k: 0.9, skin: () => [tb, 1], paint: skinPaint({ flow: [0, 0, 1], knuckles: [[x + s * (k - 2) * 0.003, 0.032, base[2] + L * 0.45]], nails: (p) => Math.hypot(p[0] - tip[0], p[1] - tip[1] - 0.004, p[2] - tip[2]) < 0.012, sole: (_p, n) => n[1] < -0.5 }) }));
    }
  }
  for (const p of sleeves) body.finalize(p);
  yield 'legs';

  // ---- hair, and the strips of her shawl
  // her hair: long grey locks that hang under their own weight from the back and sides of the scalp, clumped and
  // waving, lying over the skull, the neck and the moss of the shawl, tapering to points
  const hairRoots: { p: V3; n: V3; len: number; wid: number; col: number; seed: number }[] = [];
  for (let k = 0, made = 0; k < 400 && made < 52; k++) {
    const h = -0.04 + h3(k, 1, 51) * 0.2, th = h3(k, 2, 51) * Math.PI, sd = h3(k, 7, 51) < 0.5 ? 1 : -1;
    const q = headPoint(h, th, sd), rel = sub(q.p, HG), side = Math.abs(rel[0]);
    // parted off the face: nothing roots in front of the ears, the crown is combed back
    if (rel[2] > -0.005 && !(side > 0.074 && rel[1] < 0.05)) continue;
    if (Math.hypot(side - ANTLER_ROOT[0], rel[1] - ANTLER_ROOT[1], rel[2] - ANTLER_ROOT[2]) < 0.032) continue;
    made++;
    // a clump: three locks from nearly the same place, the same fall, their own wave
    const temple = rel[2] > -0.015, len = (temple ? 0.36 : 0.55) + 0.2 * h3(k, 3, 51), col = h3(k, 5, 51) < 0.25 ? 1 : h3(k, 6, 51) < 0.3 ? 2 : 0;
    for (let c = 0; c < 3; c++) {
      const off = add(scl([h3(k, 10 + c, 3) - 0.5, h3(k, 20 + c, 3) - 0.5, h3(k, 30 + c, 3) - 0.5], 0.012), [0, 0, 0]);
      hairRoots.push({ p: add(sub(q.p, scl(q.n, 0.003)), off), n: q.n, len: len * (0.88 + 0.2 * h3(k, 40 + c, 3)), wid: 0.011 + 0.006 * h3(k, 50 + c, 3), col: c === 2 && col === 0 ? 1 : col, seed: k * 3 + c });
    }
  }
  const hairTiles = [STONE, SNOW, STONE];
  const hair = hangingHair(hairRoots, hairTiles, (p) => { const t = cl((p[1] - 1.88) / 0.17, 0, 1); return t >= 1 ? [HEAD, 1] : t <= 0 ? [bi('chest'), 0.8, bi('neck'), 0.2] : [HEAD, t, bi('neck'), (1 - t) * 0.6, bi('chest'), (1 - t) * 0.4]; });
  hair.paint = hairCards(hairTiles, [4, 3.4, 3]); body.add(hair);
  const strip: LockSeat[] = [];
  const rg = robe.grids[0];
  const kindAt = (k: number, seed: number) => { const r = h3(k, 9, seed); return r < 0.34 ? 0 : r < 0.6 ? 1 : r < 0.84 ? 2 : 3; };
  const sowRobe = (n: number, v0: number, v1: number, len: (p: V3) => number, wid: number, seed: number) => {
    for (let k = 0; k < n; k++) {
      const u = h3(k, 1, seed), v = v0 + (v1 - v0) * h3(k, 2, seed);
      const q = gridSurf(robe.m, rg, u, v);
      const L = len(q.p); if (L < 0.03) continue;
      const rad = nrm([q.p[0], 0, q.p[2] + 0.04]);
      strip.push({ p: sub(q.p, scl(q.n, 0.006)), n: q.n, dir: nrm([rad[0] * 0.15, -1, rad[2] * 0.15]), len: L, wid: wid * (0.75 + 0.5 * h3(k, 3, seed)), lift: 0.02, droop: 0.3, col: kindAt(k, seed), w: robeSkin(q.p) });
    }
  };
  // robe rows (v) by height
  const vAt = (y: number) => { let best = 0, bd = 9; for (let k = 0; k <= 200; k++) { const v = k / 200, p = gridSurf(robe.m, rg, 0.5, v).p; if (Math.abs(p[1] - y) < bd) { bd = Math.abs(p[1] - y); best = v; } } return best; };
  sowRobe(130, vAt(1.5), vAt(1.95), (p) => 0.32 + 0.4 * h3(Math.floor(p[0] * 50), Math.floor(p[1] * 50), 3) * (p[2] < 0 ? 1.2 : 0.8), 0.034, 61);
  sowRobe(48, vAt(0.95), vAt(1.45), (p) => 0.25 + 0.25 * h3(Math.floor(p[0] * 70), Math.floor(p[1] * 70), 4), 0.03, 63);
  sowRobe(70, vAt(0.06), vAt(0.3), (p) => 0.12 + 0.1 * h3(Math.floor(p[0] * 70), Math.floor(p[2] * 70), 5), 0.032, 65);
  for (const sl of sleeves) {
    const g = sl.grids[0];
    for (let k = 0; k < 22; k++) {
      const q = gridSurf(sl.m, g, h3(k, 1, 71), 0.15 + 0.8 * h3(k, 2, 71));
      strip.push({ p: sub(q.p, scl(q.n, 0.005)), n: q.n, dir: nrm([q.n[0] * 0.3, -1, q.n[2] * 0.3]), len: 0.12 + 0.16 * h3(k, 3, 71), wid: 0.026, lift: 0.05, droop: 0.06, col: kindAt(k, 71), w: sl.skin(q.p) });
    }
  }
  const stripTiles = [STONE, MOSS, SAGE, SOIL];
  const strips = locks({ name: 'strips', seats: strip, tiles: stripTiles, seed: 17 });
  if (strips) { strips.paint = cardPaint(['bark', 'moss', 'lichen', 'bark'], stripTiles, { steps: [2.0, 0.9, 2.6, 1.6], rough: 240 }); strips.k = 0.32; body.add(strips); }
  const needleTiles = [GOLD, OCHRE, STRAW];
  const needles = locks({ name: 'needles', seats: needleSeats, tiles: needleTiles, seed: 19 });
  if (needles) { needles.paint = cardPaint(['needles', 'needles', 'needles'], needleTiles, { steps: [4, 4, 3.6], rough: 200 }); needles.k = 0.7; body.add(needles); }
  const lichenTiles = [SAGE, SNOW];
  const beard = locks({ name: 'lichen', seats: lichenSeats, tiles: lichenTiles, seed: 23 });
  if (beard) { beard.paint = cardPaint(['lichen', 'lichen'], lichenTiles, { steps: [4, 2.6], rough: 240 }); beard.k = 0.5; body.add(beard); }
  yield 'locks';
  void PLUM; void INK; void cell3; void FUR; void EYE; void HORN; void BARK;
  const out = yield* body.buildGen({ den: o.den ?? 260, maxScale: 2, budget: 40000, fur: GRANNY_FUR });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, fur: out.fur, bones, tris: out.tris, den: body.den, stats };
}

/** her shawl of moss grows real fur (lengths in GRANNY_FUR_LEN): deep and tufted over the shoulders, ragged at its
 *  edge; moss on the sleeves' shoulders; long grey hair from under the antlers (the same rules as the painters) */
export const GRANNY_FUR_LEN = 0.075;
/** fur on her head too (off: her long grey hair is lock geometry; a shell cap read as a wig) */
const GRANNY_HAIR_FUR = false;
const GRANNY_SLEEVES = furZones([{ piece: /^sleeve/, a: [0, 1.85, -0.04], b: [0, 1.62, -0.05], r: 0.32, len: 0.65, clump: 0.85, tip: 0.6 }]);
function GRANNY_FUR(p: V3, n: V3, piece: string, k: { k: number; occ: number }): readonly number[] | null {
  if (piece === 'trunk') {
    const a = Math.atan2(p[0], p[2]);
    const collar = 1.975 + nz2(a * 3, 1) * 0.012;
    const edge = shawlEdge(a);
    if (p[1] > collar - 0.008 || p[1] < edge) return null;
    const lich = fbm3(p[0] * 14 + 3, p[1] * 14, p[2] * 14, 2) > 0.32;
    const deep = cl((p[1] - edge) / 0.12, 0.35, 1) * cl((collar - p[1]) / 0.06, 0.3, 1);
    return [lich ? 0.7 : 0.95, (lich ? 0.45 : 1) * deep, 0.85, lich ? 0.3 : 0.65];
  }
  if (piece === 'skull' && GRANNY_HAIR_FUR) {
    const H = GT.hg, x = p[0] - H[0], y = p[1] - H[1], ax = Math.abs(x), nz = n[2];
    const hl = 0.068 + nz2(x * 50, 1) * 0.004 + ax * 0.12 - Math.max(0, ax - 0.05) * 0.9;
    if (y > hl + 0.006 || nz < -0.2 - Math.max(0, -y) * 2 || (ax > 0.075 && nz < 0.3 && y > -0.08)) return [0.9, y > hl + 0.02 ? 0.32 : 0.2, 0.7, 0.35];
    return null;
  }
  return GRANNY_SLEEVES(p, n, piece, k);
}
