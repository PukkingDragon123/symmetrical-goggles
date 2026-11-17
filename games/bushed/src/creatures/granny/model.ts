// GRANNY TAMARACK: model. An old forest grandmother, about 2.4 m to the crown and taller by her antlers: gaunt and
// long-limbed, a little stooped over a gnarled walking staff. A long dark robe of bark-cloth falls to her bare feet,
// under a shawl of moss; strips of peeled bark, hanks of moss and beard lichen hang off her shoulders, her back, her
// sleeves and her ragged hem. Long thin grey hair falls from under crooked tamarack-branch antlers that sprout tufts
// of autumn-yellow needles. Her face is pale and deeply lined but kind: soft heavy-lidded eyes deep under the brow
// with laughter creases at their corners, a long nose, a gentle mouth. Long pale fingers with dark nails. In fog
// she is a tall antlered shape on a staff; up close she is somebody's grandmother.
// Creature space: metres, +z forward, +y up, ground y = 0. The staff is part of the skin, on the right hand.
import * as THREE from 'three';
import {
  Body, runSync, runAsync, trunk, limb, legRings, eyeball, eyelid, locks, stalk, curve, chainSkin, addWeights, gridSurf, Px, RP, cell3, h3, cl,
  type V3, type Wt, type Piece, type Chart, type Station, type LockSeat, type LimbRing,
} from '../anatomy';
import { nz2, nz3, fbm3 } from '../paintkit';
import { cardPaint } from '../cards';
import type { BoneDef } from '../rig';

export const GRANNY_MODEL_VERSION = 'granny@1';
export interface GrannyModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }

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
const lerp1 = (a: number, b: number, t: number) => a + (b - a) * t;
const g2 = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (w * w));

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
  return b;
}

// ------------------------------------------------------------------------------------------------ the head's shape
/** head dimensions by height above the head centre: half width, half depth, centre z */
const HEADK: [number, number, number, number][] = [
  [0.172, 0.022, 0.03, -0.022], [0.16, 0.05, 0.066, -0.016], [0.135, 0.07, 0.092, -0.01], [0.1, 0.08, 0.106, -0.006], [0.06, 0.084, 0.112, -0.003],
  [0.02, 0.083, 0.112, 0.0], [-0.02, 0.08, 0.108, 0.002], [-0.05, 0.071, 0.1, 0.007], [-0.08, 0.061, 0.088, 0.013], [-0.11, 0.05, 0.072, 0.023],
  [-0.135, 0.036, 0.055, 0.035], [-0.152, 0.02, 0.036, 0.045],
];
function headDims(h: number): [number, number, number] {
  for (let i = 0; i + 1 < HEADK.length; i++) {
    const a = HEADK[i], b = HEADK[i + 1];
    if (h <= a[0] && h >= b[0]) { const t = (a[0] - h) / (a[0] - b[0]); return [lerp1(a[1], b[1], t), lerp1(a[2], b[2], t), lerp1(a[3], b[3], t)]; }
  }
  const e = h > HEADK[0][0] ? HEADK[0] : HEADK[HEADK.length - 1];
  return [e[1], e[2], e[3]];
}
const HN = 13;
/** a point of the head (head-centre relative x, z) at height h and angle th round from the back (0) to the face (pi):
 *  an ellipse modelled with the face's landmarks: deep eye sockets under a soft brow, high cheekbones over hollow
 *  cheeks, a long nose with a rounded tip, a gentle mouth, a long chin */
export function headPt(h: number, th: number): [number, number] {
  const [W, D, zc] = headDims(h);
  const u = th / Math.PI;
  let x = W * Math.sin(th), z = zc - D * Math.cos(th);
  const x0 = x, front = cl((u - 0.55) / 0.2, 0, 1);
  // the face is flatter than the skull: pull the front corners forward
  z += front * 0.012 * Math.sin(th) * (h < 0.07 && h > -0.12 ? 1 : 0.4);
  // eye sockets
  z -= 0.021 * front * Math.exp(-((h - 0.012) ** 2) / 0.016 ** 2 - ((x0 - 0.037) ** 2) / 0.018 ** 2);
  // the brow, soft
  z += 0.006 * front * g2(h, 0.038, 0.011) * (x0 < 0.065 ? 1 : 0.4);
  // the nose: a bridge from between the eyes down to a long rounded tip, the wings either side, the philtrum
  const nose = h > 0.03 ? 0 : h > -0.046 ? lerp1(0.006, 0.033, (0.03 - h) / 0.076) : h > -0.06 ? lerp1(0.033, 0.01, (-0.046 - h) / 0.014) : h > -0.072 ? 0.006 : 0;
  const nw = Math.exp(-(x0 * x0) / (h > -0.04 ? 0.0105 : 0.016) ** 2);
  z += nose * nw * front;
  // the nostril wings
  z += 0.009 * front * g2(h, -0.05, 0.008) * g2(x0, 0.02, 0.008);
  // cheekbones up, hollow cheeks under them, hollow temples
  x += 0.005 * g2(h, -0.015, 0.02) * g2(u, 0.7, 0.08);
  z += 0.004 * g2(h, -0.015, 0.02) * g2(u, 0.74, 0.08);
  x -= 0.011 * g2(h, -0.072, 0.022) * g2(u, 0.68, 0.11);
  x -= 0.004 * g2(h, 0.05, 0.025) * g2(u, 0.52, 0.07);
  // lips and the chin
  z += 0.005 * front * g2(h, -0.083, 0.008) * g2(x0, 0, 0.026);
  z += 0.01 * front * g2(h, -0.125, 0.014) * g2(x0, 0, 0.03);
  return [x, z];
}
/** the eye: centre and look axis (left) */
export function eyeAt(): { c: V3; ax: V3; r: number } {
  const h = 0.012, H = GT.hg, r = 0.0158;
  // find the socket surface at the eye's x
  let best = 0, bd = 1;
  for (let k = 0; k <= 400; k++) { const th = Math.PI * (0.5 + 0.5 * k / 400), [x] = headPt(h, th), d = Math.abs(x - 0.037); if (d < bd) { bd = d; best = th; } }
  const [, z] = headPt(h, best);
  return { c: [0.037, H[1] + h, H[2] + z - r * 0.25], ax: nrm([0.18, -0.06, 1]), r };
}

// ------------------------------------------------------------------------------------------------ colour
const hex = (s: string) => parseInt(s.slice(1), 16);
/** pale, lined old skin: hue-shifted cool mauve in the creases, warm parchment in the light */
const SKIN = ['#2a2327', '#43383b', '#625453', '#83736d', '#a3928a', '#c1b2a6', '#d9ccbe', '#eae0d3'].map(hex);
/** her robe: bark-cloth, near black-brown, a little red in the light */
const CLOTH = ['#110d0c', '#1b1513', '#271e1a', '#352822', '#45342b', '#584336', '#6c5443'].map(hex);
const MOSS = RP('moss'), SAGE = RP('sage'), SOIL = RP('soil'), HEART = RP('heart'), STONE = RP('stone'), SNOW = RP('snow');
const GOLD = RP('gold'), OCHRE = RP('ochre'), STRAW = RP('straw'), HORN = RP('horn'), PLUM = RP('plum'), HIDE = RP('hide'), INK = RP('ink'), FUR = RP('fur');

/** the robe: bark-cloth falling in long folds, mud and wet at the hem; above the ribs a shawl of moss with lichen */
function robePaint() {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
    px.lightK = 0.8;
    const shawl = new Float32Array(px.n), skin = new Uint8Array(px.n);
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const a = Math.atan2(x, z - 0.0), m = fbm3(x * 6, y * 6, z * 6, 3);
      // the neck: skin above the collar of moss
      const collar = 1.975 + nz2(a * 3, 1) * 0.012;
      if (y > collar) {
        skin[i] = 1;
        const tendon = Math.abs(Math.abs(x) - 0.022) < mpt * 1.2 && z > 0.01, fold = Math.abs(Math.sin(y * 260 + nz2(a * 4, y * 9) * 2)) < 0.12;
        px.put(i, SKIN, 4 + m * 0.5 - (tendon ? 0.8 : 0) - (fold ? 0.9 : 0) - (y < collar + 0.015 ? 1.2 : 0)); px.rough[i] = 175; continue;
      }
      // the shawl's lower edge: ragged, lower at the back, a point down the front
      const edge = 1.5 - 0.06 * Math.cos(a) + nz2(a * 5, 3) * 0.05 - (Math.abs(a) < 0.35 ? (0.35 - Math.abs(a)) * 0.4 : 0);
      if (y > edge) {
        shawl[i] = 1;
        const lich = fbm3(x * 14 + 3, y * 14, z * 14, 2);
        if (lich > 0.32) { px.put(i, SAGE, 2.6 + lich * 2); px.rough[i] = 240; continue; }
        px.put(i, MOSS, 1.4 + m * 1.2 + (N[i * 3 + 1] > 0.5 ? 0.6 : 0) - (y < edge + 0.03 ? 0.8 : 0)); px.rough[i] = 245; continue;
      }
      // the bark-cloth: long folds hanging from the shawl, wider and deeper toward the hem
      const k = 7 + nz2(y * 0.8, 2) * 1.5, fo = Math.sin(a * k + nz2(y * 2, a) * 1.2 + y * 0.6);
      let st = 2.2 + m * 0.6 + fo * 0.55 * cl((edge - y) / 0.4, 0.3, 1);
      if (Math.abs(fo) < 0.12 && y < edge - 0.05) st -= 1.1;
      // the weave of the bark-cloth: fine fibres down it, a darker band of wet and mud along the hem
      if (h3(Math.floor((a + 4) * 120), Math.floor(y * 30), 7) < 0.2) st -= 0.6;
      if (y < 0.32 + nz2(a * 6, 9) * 0.06) { st -= 0.9; if (fbm3(x * 20, y * 20, z * 20, 2) > 0.15) { px.put(i, SOIL, 1.6 + m); px.rough[i] = 200; continue; } }
      px.put(i, CLOTH, st); px.rough[i] = 235;
    }
    yield;
    px.pelt({ len: 0.06, width: 0.02, flow: -1, down: 0.6, mask: (i) => shawl[i], tooth: 1.4, clump: 0.6, strands: 0.25 });
    yield;
    px.creaseInk(1.2, { dark: 1, lit: 0.4, mask: (i) => 1 - skin[i] });
    px.flush();
  };
}
/** the sleeves: bark-cloth with moss on the shoulders, a ragged cuff */
function sleevePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.8;
  const moss = new Float32Array(px.n);
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], m = fbm3(x * 8, y * 8, z * 8, 3);
    if (y > 1.66 + m * 0.08) { moss[i] = 1; px.put(i, MOSS, 1.4 + m * 1.2); px.rough[i] = 245; continue; }
    const fold = Math.abs(Math.sin(y * 40 + nz3(x * 9, y * 3, z * 9) * 2.5)) < 0.15;
    px.put(i, CLOTH, 2.3 + m * 0.6 - (fold ? 1 : 0)); px.rough[i] = 235;
  }
  px.pelt({ len: 0.05, width: 0.018, flow: -1, mask: (i) => moss[i], tooth: 1.3, clump: 0.6 });
  px.creaseInk(1.2, { dark: 1, lit: 0.4 });
  px.flush();
}
/** pale old skin: veins, knuckle creases and age spots on hands and feet, dark long nails, earth on the soles */
function skinPaint(o: { nails?: (p: V3) => boolean; sole?: (p: V3, n: V3) => boolean } = {}) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.6;
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: V3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
      if (o.nails && o.nails(p)) { px.put(i, HORN, 3 + (n[1] > 0.3 ? 1 : 0)); px.rough[i] = 90; continue; }
      if (o.sole && o.sole(p, n)) { px.put(i, SOIL, 2.2 + fbm3(p[0] * 60, p[1] * 60, p[2] * 60, 2)); px.rough[i] = 220; continue; }
      const m = fbm3(p[0] * 40, p[1] * 40, p[2] * 40, 2), c = cell3(p[0], p[1], p[2], 0.006, 5);
      const vein = Math.abs(nz3(p[0] * 30, p[1] * 12, p[2] * 30)) < 0.05, spot = (c.id % 23) === 0 && c.f1 < 0.002;
      px.put(i, spot ? HIDE : SKIN, (spot ? 3.4 : 4.2) + m * 0.5 - (vein ? 0.8 : 0) - ((c.f2 - c.f1) < px.mpt * 0.7 ? 0.5 : 0)); px.rough[i] = 175;
    }
    px.creaseInk(1.1, { dark: 1.2, lit: 0.6 });
    px.flush();
  };
}
/** the face: pale and lined. The kindness is in the lines: crow's feet fanning from the eye corners, cheeks lifted
 *  by a smile, soft creases from the nose wings to the mouth corners, which turn up; the forehead lined across, the
 *  brows thin and grey; the eyes deep in their sockets under heavy lids, the sockets shadowed, not black */
function facePaint() {
  const H = GT.hg, E = eyeAt();
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
    px.lightK = 0.6;
    const hairM = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const x = P[i * 3] - H[0], y = P[i * 3 + 1] - H[1], z = P[i * 3 + 2] - H[2], ax = Math.abs(x), nz = N[i * 3 + 2];
      const m = fbm3(x * 50, y * 50, z * 50, 2);
      // the hairline: grey hair over the crown and down the back and sides, the face bare
      const hl = 0.075 + nz2(x * 50, 1) * 0.008 + ax * ax * 3;
      if (y > hl || nz < -0.15 - Math.max(0, -y) * 2 || (ax > 0.07 && nz < 0.35 && y > -0.08)) {
        hairM[i] = 1; px.put(i, STONE, 3.4 + m * 0.6 + (y > 0.12 ? 0.5 : 0)); px.rough[i] = 220; continue;
      }
      let R = SKIN, st = 4.3 + m * 0.4, rough = 170;
      const ex = ax - (E.c[0] - H[0]), ey = y - (E.c[1] - H[1]), ed = Math.hypot(ex, ey * 1.25);
      // the sockets: shadowed and soft, darker to the inner corners; a lid crease above, bags below
      if (ed < 0.03) st -= (0.03 - ed) * 70 * (ex < 0 ? 1.2 : 0.9);
      if (Math.abs(ed - 0.022) < mpt * 0.8 && ey > 0.002) st -= 1;
      if (Math.abs(ed - 0.024) < mpt * 0.9 && ey < -0.006 && Math.abs(ex) < 0.018) st -= 0.9;
      if (Math.abs(ed - 0.029) < mpt * 0.8 && ey < -0.009 && Math.abs(ex) < 0.02) st -= 0.6;
      // crow's feet: laughter fans from the outer corners
      if (ex > 0.018 && ex < 0.045 && Math.abs(ey) < 0.02) { const ang = Math.atan2(ey, ex); if (Math.abs(Math.sin(ang * 11 + 0.4)) < 0.16 && ed > 0.02) st -= 0.9; }
      // thin grey brows, lifted in the middle (a kind, slightly worried look)
      const by = ey - (0.021 + 0.004 * Math.cos((ex + 0.004) * 60));
      if (Math.abs(by) < 0.0035 && ex > -0.016 && ex < 0.026) { R = STONE; st = 3.2 + h3(Math.floor(x / mpt), 1, 3); }
      // the forehead lined across
      if (y > 0.035 && y < hl - 0.01 && Math.abs(Math.sin(y * 330 + nz2(x * 40, 2) * 1.3)) < 0.12) st -= 0.8;
      // the nose: a lit ridge, a warmer tip, nostrils
      if (ax < 0.008 && y < 0.02 && y > -0.045 && nz > 0.4) st += 0.5;
      if (Math.hypot(x, y + 0.045) < 0.014 && nz > 0.3) { R = SKIN; st += 0.2; }
      const nd = Math.hypot(ax - 0.011, (y + 0.056) * 1.6);
      if (nd < 0.006 && N[i * 3 + 1] < 0.2) { R = SKIN; st = 1.2; }
      // smile lines: from the nose wings round the mouth corners
      const sl = ax - (0.026 + (-0.052 - y) * 0.45);
      if (y < -0.052 && y > -0.1 && Math.abs(sl) < mpt * 0.9) st -= 1.1;
      if (y < -0.052 && y > -0.1 && sl > mpt * 0.9 && sl < mpt * 2.5) st += 0.4;
      // the mouth: thin lips, a dark line turning up at the corners, fine vertical lines over the upper lip
      const ml = y + 0.084 - ax * ax * 9;
      if (ax < 0.03 && Math.abs(ml) < mpt * 1.1) { R = PLUM; st = 1; rough = 110; }
      else if (ax < 0.027 && ml > 0 && ml < 0.007) { R = PLUM; st = 3.4 + m; rough = 130; if (Math.abs(Math.sin(x * 600)) < 0.2) st -= 0.6; }
      else if (ax < 0.024 && ml < 0 && ml > -0.008) { R = PLUM; st = 3.8 + m; rough = 120; }
      else if (ax < 0.024 && ml > 0.007 && ml < 0.016 && Math.abs(Math.sin(x * 420)) < 0.16) st -= 0.6;
      // cheeks: lifted, a little colour, age spots
      if (Math.hypot(ax - 0.045, y + 0.03) < 0.02 && nz > 0.3) { R = h3(Math.floor(x / mpt / 2), Math.floor(y / mpt / 2), 4) < 0.3 ? HIDE : SKIN; st += R === HIDE ? -0.6 : 0.2; }
      const c = cell3(x, y, z, 0.012, 7);
      if ((c.id % 17) === 0 && c.f1 < 0.0025 && y > -0.03) { R = HIDE; st = 3.6; }
      // the chin, the jaw line under it
      if (y < -0.12 && N[i * 3 + 1] < -0.3) st -= 0.6;
      px.put(i, R, st); px.rough[i] = rough;
    }
    yield;
    px.pelt({ len: 0.06, width: 0.008, flow: -1, down: 0.3, mask: (i) => hairM[i], tooth: 1.4, clump: 0.5, strands: 0.35 });
    px.creaseInk(1.1, { dark: 1.1, lit: 0.6 });
    yield;
    px.flush();
  };
}
/** tamarack bark on the antlers: thin flaking scales, red-brown under grey, a few crusts of lichen */
function antlerPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.7;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], c = cell3(x, y, z, 0.012, 11, 1, 0.6, 1), m = fbm3(x * 30, y * 30, z * 30, 2);
    const edge = (c.f2 - c.f1) < px.mpt * 1.2;
    if (fbm3(x * 25 + 7, y * 25, z * 25, 2) > 0.38) { px.put(i, SAGE, 3.2 + m); px.rough[i] = 240; continue; }
    px.put(i, (c.id % 3) === 0 ? HEART : STONE, (c.id % 3 === 0 ? 2.6 : 2.4) + m * 0.6 - (edge ? 1.2 : 0) + ((c.id % 5) === 0 ? 0.6 : 0)); px.rough[i] = 230;
  }
  px.creaseInk(1, { dark: 1.2, lit: 0.7 }); px.flush();
}
/** the staff: grey weathered wood, a twist of grain, knots; worn smooth and darker where her hand holds it */
function staffPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.7;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], a = Math.atan2(x - GT.staff.x, z - GT.staff.z), m = fbm3(x * 40, y * 12, z * 40, 2);
    const grain = Math.abs(Math.sin(a * 5 + y * 9 + m * 3)) < 0.14, knot = cell3(x, y * 0.6, z, 0.05, 2).f1 < 0.006;
    const worn = Math.abs(y - GT.grip[1]) < 0.09;
    px.put(i, worn ? FUR : STONE, worn ? 3 + m : 3.4 + m * 0.8 - (grain ? 1 : 0) - (knot ? 1.6 : 0) - (y < 0.15 ? 1 : 0)); px.rough[i] = worn ? 120 : 220;
  }
  px.creaseInk(1, { dark: 1.2, lit: 0.6 }); px.flush();
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
  const rst = (y: number, w: number, d: number, z: number, p: string | number[][] = 'round', tw?: [number, number, number][]): Station => ({ c: [0, y, z], s: [w, d], p, tw });
  const robeSt: Station[] = [
    rst(0.035, 0.4, 0.31, -0.04), rst(0.3, 0.34, 0.27, -0.035), rst(0.62, 0.28, 0.225, -0.03), rst(0.92, 0.225, 0.185, -0.025),
    rst(1.18, 0.18, 0.145, -0.03, 'barrel'), rst(1.42, 0.19, 0.14, -0.04, 'barrel'), rst(1.62, 0.225, 0.15, -0.045, 'barrel'),
    rst(1.78, 0.27, 0.165, -0.05, 'shoulder'), rst(1.885, 0.23, 0.15, -0.045, 'shoulder'), rst(1.955, 0.13, 0.11, -0.03),
    rst(1.99, 0.062, 0.062, -0.012, 'neck'), rst(2.06, 0.056, 0.058, 0.0, 'neck'), rst(2.13, 0.05, 0.05, 0.012),
  ];
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
  const robe = body.add(trunk({ name: 'trunk', stations: robeSt, tween: [2, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], capS: true, capE: false, levels: 1, k: 0.85, skin: robeSkin, paint: robePaint() }));
  body.finalize(robe);
  yield 'robe';

  // ---- the head: rings from the chin to the crown (the face carried in headPt)
  const hs = [-0.152, -0.14, -0.125, -0.11, -0.097, -0.086, -0.075, -0.063, -0.052, -0.042, -0.03, -0.017, -0.004, 0.009, 0.021, 0.033, 0.046, 0.065, 0.09, 0.115, 0.138, 0.157, 0.17];
  const headSt: Station[] = hs.map((h) => {
    const [, , zc] = headDims(h);
    const half = Array.from({ length: HN }, (_, j) => { const [x, z] = headPt(h, (j / (HN - 1)) * Math.PI); return [Math.max(0, x), -(z - zc)]; });
    half[0][0] = 0; half[HN - 1][0] = 0;
    return { c: [0, HG[1] + h, HG[2] + zc], s: [1, 1], p: half };
  });
  const headSkin = (p: V3): Wt => (p[1] < GT.head[1] + 0.02 && p[2] < HG[2] - 0.02 ? [HEAD, 0.6, bi('neck'), 0.4] : [HEAD, 1]);
  const head = body.add(trunk({ name: 'skull', stations: headSt, tween: 0, capS: true, capE: true, levels: 1, k: 2.6, rings: [{ at: 5, s: 0.8, ink: true, arc: [21, 27] }], skin: headSkin, paint: facePaint() }));
  body.finalize(head);
  yield 'head';
  const E = eyeAt();
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(E.c, s), ax = mir(E.ax, s);
    body.add(eyeball({ name: 'eye' + S, c, ax, r: E.r, bone: HEAD, iris: OCHRE, pupil: 'round', irisA: 0.62, sclera: SKIN, k: 3, levels: 1, around: 10 }));
    const lid = body.add(eyelid({ name: 'lid' + S, c, ax, r: E.r, bone: bi('lid' + S), paint: skinPaint(), cover: 0.72, root: 2.1 }));
    lid.levels = 1;
    const low = body.add(eyelid({ name: 'llid' + S, c, ax, r: E.r, bone: HEAD, paint: skinPaint(), cover: 1.25, root: 2.2, lower: true }));
    low.levels = 0;
  }

  // ---- antlers: crooked tamarack branches from the temples, forking, kinked where they grew round something
  const needleSeats: LockSeat[] = [];
  const twig = (name: string, ctrl: V3[], r0: number, r1: number, n: number, tufts: number, seed: number) => {
    const path = curve(ctrl, n);
    body.add(stalk({ name, path, r: (t) => lerp1(r0, r1, Math.pow(t, 0.8)) * (1 + 0.15 * Math.sin(t * 17 + seed)), around: 6, capS: true, capE: true, levels: 1, k: 1.2, skin: () => [HEAD, 1], paint: antlerPaint }));
    // short spurs with tufts of needles along the outer half, a crown of them at the tip
    for (let k = 0; k < tufts; k++) {
      const t = 0.35 + 0.65 * (k + 0.5) / tufts, f = t * (path.length - 1), i0 = Math.min(path.length - 2, Math.floor(f)), q = f - i0;
      const p = add(path[i0], scl(sub(path[i0 + 1], path[i0]), q)), d = nrm(sub(path[i0 + 1], path[i0]));
      const a = h3(k, 3, seed) * Math.PI * 2, side = nrm([Math.cos(a), 0.6 + Math.sin(a) * 0.4, Math.sin(a)]);
      const out = nrm(add(side, scl(d, -side[0] * d[0] - side[1] * d[1] - side[2] * d[2])));
      for (let c = 0; c < 2; c++) {
        const dir = nrm(add(add(out, scl(d, 0.5)), [0, 0.25, 0])), n = nrm(c === 0 ? [dir[2], 0.2, -dir[0]] : [-dir[1], dir[0], 0.3]);
        needleSeats.push({ p, n, dir, len: 0.05 + 0.02 * h3(k, c, seed), wid: 0.024, lift: 0.1, droop: 0.06, col: (k + c) % 3, w: [HEAD, 1] });
      }
    }
  };
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const j = (k: number, a: number) => (h3(k, s > 0 ? 1 : 2, 77) - 0.5) * a;
    const b0: V3 = mir([0.05, HG[1] + 0.105, HG[2] + 0.005], s);
    const beam: V3[] = [add(b0, [0, -0.02, 0]), add(b0, [s * 0.02, 0.06, -0.01]), add(b0, [s * (0.07 + j(1, 0.02)), 0.12, -0.035]), add(b0, [s * 0.1, 0.21, -0.02 + j(2, 0.03)]), add(b0, [s * (0.17 + j(3, 0.02)), 0.27, -0.06]), add(b0, [s * 0.21, 0.36, -0.05]), add(b0, [s * 0.29, 0.41, -0.09 + j(4, 0.03)]), add(b0, [s * 0.34, 0.47, -0.08])];
    twig('antler' + S, beam, 0.024, 0.006, 16, 5, 1 + s);
    const bp = curve(beam, 16);
    // forks: one forward and up off the low bend, one back off the middle, one up off the high bend
    twig('fork' + S + 0, [bp[4], add(bp[4], [s * 0.01, 0.06, 0.04]), add(bp[4], [s * 0.04, 0.12, 0.05 + j(5, 0.02)]), add(bp[4], [s * 0.03, 0.19, 0.09])], 0.012, 0.004, 7, 3, 3 + s);
    twig('fork' + S + 1, [bp[8], add(bp[8], [s * 0.03, 0.04, -0.05]), add(bp[8], [s * 0.05, 0.1, -0.1]), add(bp[8], [s * 0.1, 0.12, -0.15 + j(6, 0.03)])], 0.011, 0.004, 7, 3, 5 + s);
    twig('fork' + S + 2, [bp[11], add(bp[11], [s * 0.0, 0.06, 0.02]), add(bp[11], [-s * 0.02, 0.13, 0.0]), add(bp[11], [s * 0.01, 0.19, 0.03 + j(7, 0.03)])], 0.01, 0.0035, 7, 3, 7 + s);
    twig('fork' + S + 3, [bp[13], add(bp[13], [s * 0.05, 0.02, 0.03]), add(bp[13], [s * 0.1, 0.06, 0.05])], 0.007, 0.003, 5, 2, 9 + s);
  }
  yield 'antlers';

  // ---- arms: long sleeves to the wrist, hands; the right fist round the staff
  const sleeves: Piece[] = [];
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const a = s > 0 ? GT.armL : GT.armR;
    const segA = [Math.hypot(...(sub(a.sh, a.el) as [number, number, number])), Math.hypot(...(sub(a.el, a.wr) as [number, number, number]))];
    void segA;
    const rings: LimbRing[] = [
      { t: -0.25, r: 0.075 }, { t: -0.08, r: 0.074 }, { t: 0.05, r: 0.068 }, { t: 0.25, r: 0.06 }, { t: 0.45, r: 0.056, crease: 0.6 }, { t: 0.55, r: 0.058 },
      { t: 0.72, r: 0.064 }, { t: 0.86, r: 0.074 }, { t: 0.96, r: 0.085 }, { t: 1.0, r: 0.088 }, { t: 1.01, r: 0.03 },
    ];
    const arm = limb({
      name: 'sleeve' + S, side: s, hip: a.sh, knee: a.el, sole: [a.wr[0], a.wr[1] - 0.012, a.wr[2]], tj: [0, 0.5, 1], rings, around: 12, levels: 1, rise: 0.06,
      foot: { pad: 0.03, h: 0.01, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('chest'), up: bi('arm' + S), lo: bi('elb' + S), foot: bi('hand' + S) }, paint: sleevePaint, clawPaint: sleevePaint, k: 0.8,
    });
    body.add(arm.skin); sleeves.push(arm.skin);
  }
  // the left hand: hanging open, long fingers a little curled
  {
    const wr = GT.armL.wr, hb = bi('handL');
    const pal = (d: number, w: number, t: number): Station => ({ c: add(wr, [0, -d, 0.004 + d * 0.05]), s: [t, w], p: 'flat' });
    body.add(trunk({ name: 'palmL', stations: [pal(-0.03, 0.03, 0.026), pal(0.0, 0.036, 0.024), pal(0.04, 0.042, 0.021), pal(0.08, 0.045, 0.019), pal(0.11, 0.041, 0.017)], tween: 0, capS: true, capE: true, levels: 1, k: 1.6, skin: (p) => (p[1] > wr[1] - 0.005 ? [bi('elbL'), 0.35, hb, 0.65] : [hb, 1]), paint: skinPaint() }));
    const fl = [0.135, 0.15, 0.142, 0.115];
    for (let k = 0; k < 4; k++) {
      const fz = 0.03 - k * 0.0215, L = fl[k], base: V3 = add(wr, [0, -0.108, fz]);
      const path = curve([add(base, [0, 0.02, 0]), base, add(base, [-0.004, -L * 0.45, 0.002]), add(base, [-0.012, -L * 0.82, 0.004]), add(base, [-0.022, -L, 0.003])], 7);
      const [b1, b2] = k === 0 ? [bi('indexL'), bi('index2L')] : [bi('fingL'), bi('fing2L')];
      const sk = chainSkin([add(base, [0, 0.03, 0]), add(base, [0, -L * 0.42, 0]), add(base, [0, -L * 1.3, 0])], [b1, b2], 0.3);
      const tip = add(base, [-0.022, -L, 0.003]);
      body.add(stalk({ name: 'fingL' + k, path, r: (t) => (0.0105 - t * 0.003) * (1 + 0.12 * g2(t, 0.42, 0.06)), around: 6, capE: true, levels: 1, k: 1.6, skin: sk, paint: skinPaint({ nails: (p) => Math.hypot(p[0] - tip[0] - 0.004, p[1] - tip[1] - 0.008, p[2] - tip[2]) < 0.014 && p[0] < tip[0] + 0.012 }) }));
    }
    const tb: V3 = add(wr, [-0.012, -0.04, 0.036]);
    const tip = add(tb, [-0.03, -0.08, 0.02]);
    body.add(stalk({ name: 'thumbL', path: curve([add(tb, [0.004, 0.02, -0.01]), tb, add(tb, [-0.014, -0.04, 0.018]), tip], 6), r: (t) => 0.012 - t * 0.003, around: 6, capE: true, levels: 1, k: 1.6, skin: () => [bi('thumbL'), 1], paint: skinPaint({ nails: (p) => Math.hypot(p[0] - tip[0], p[1] - tip[1], p[2] - tip[2]) < 0.012 }) }));
  }
  // the right fist round the staff
  {
    const G = GT.grip, wr = GT.armR.wr, hb = bi('handR'), S = GT.staff;
    const ax: V3 = nrm(sub(G, wr));
    body.add(trunk({ name: 'palmR', stations: [{ c: add(wr, scl(ax, -0.03)), s: [0.026, 0.03], p: 'flat' }, { c: wr, s: [0.028, 0.036], p: 'flat' }, { c: add(wr, scl(ax, 0.045)), s: [0.03, 0.044], p: 'flat' }, { c: add(add(wr, scl(ax, 0.085)), [-0.012, 0, 0]), s: [0.026, 0.044], p: 'flat' }], tween: 0, capS: true, capE: true, levels: 1, k: 1.5, skin: () => [hb, 1], paint: skinPaint() }));
    for (let k = 0; k < 4; k++) {
      const y = G[1] + 0.032 - k * 0.022, R = 0.034;
      const pts: V3[] = [-2.0, -1.2, -0.4, 0.4, 1.1].map((a, q) => [S.x + Math.sin(a) * R * (q === 0 ? 1.15 : 1), y - q * 0.002, S.z + Math.cos(a) * R * (q === 0 ? 1.15 : 1)]);
      pts[0] = add(pts[0], [-0.012, 0.0, -0.01]);
      const tip = pts[4];
      body.add(stalk({ name: 'fingR' + k, path: curve(pts, 7), r: (t) => 0.0105 - t * 0.0025, around: 6, capE: true, levels: 1, k: 1.4, skin: () => [hb, 1], paint: skinPaint({ nails: (p) => Math.hypot(p[0] - tip[0], p[1] - tip[1], p[2] - tip[2]) < 0.012 }) }));
    }
    const ty = G[1] + 0.04;
    const tpts: V3[] = [-1.9, -2.6, -3.3, -3.9].map((a) => [S.x + Math.sin(a) * 0.033, ty - 0.004, S.z + Math.cos(a) * 0.033]);
    body.add(stalk({ name: 'thumbR', path: curve([add(wr, [-0.01, -0.03, 0.01]), ...tpts], 6), r: (t) => 0.012 - t * 0.003, around: 6, capE: true, levels: 1, k: 1.4, skin: () => [hb, 1], paint: skinPaint({ nails: (p) => Math.hypot(p[0] - tpts[3][0], p[1] - tpts[3][1], p[2] - tpts[3][2]) < 0.012 }) }));
    // the staff: a crooked length of grey tamarack, a knot or two, a forked top
    const sp: V3[] = [[S.x, -0.01, S.z], [S.x + 0.006, 0.4, S.z - 0.004], [S.x - 0.004, 0.85, S.z + 0.006], [S.x + 0.003, 1.3, S.z - 0.002], [S.x - 0.006, 1.58, S.z + 0.004], [S.x + 0.004, S.top, S.z - 0.01]];
    body.add(stalk({ name: 'staff', path: curve(sp, 22), r: (t) => (0.021 - t * 0.005) * (1 + 0.22 * g2(t, 0.31, 0.02) + 0.18 * g2(t, 0.62, 0.015) + 0.25 * g2(t, 0.9, 0.03)), around: 7, capS: true, capE: true, levels: 1, k: 0.9, skin: () => [hb, 1], paint: staffPaint }));
    const top: V3 = [S.x + 0.004, S.top - 0.03, S.z - 0.01];
    body.add(stalk({ name: 'staffF', path: curve([top, add(top, [0.03, 0.06, 0.01]), add(top, [0.07, 0.1, -0.01]), add(top, [0.08, 0.15, 0.02])], 6), r: (t) => 0.012 - t * 0.008, around: 6, capE: true, levels: 1, k: 0.9, skin: () => [hb, 1], paint: staffPaint }));
  }
  yield 'hands';

  // ---- legs, long bare feet
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const l = GT.leg, hp = mir(l.hip, s), kn = mir(l.kn, s), an = mir(l.an, s);
    const segL = [Math.hypot(...(sub(hp, kn) as [number, number, number])), Math.hypot(...(sub(kn, an) as [number, number, number]))];
    let lr: LimbRing[] = legRings('bear', false, 0.075, [0, 0.5, 1], segL, 0.02);
    lr = lr.map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.7 : r.t < 0 ? 0.85 : 1) }));
    const leg = limb({
      name: 'leg' + S, side: s, hip: hp, knee: kn, sole: [an[0], an[1] - 0.03, an[2]], tj: [0, 0.5, 1], rings: lr, around: 10, levels: 1, rise: 0.05,
      foot: { pad: 0.03, h: 0.02, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('hips'), up: bi('thigh' + S), lo: bi('shin' + S), foot: bi('foot' + S) }, paint: skinPaint(), clawPaint: skinPaint(), k: 0.5,
    });
    body.add(leg.skin);
    const fb = bi('foot' + S), tb = bi('toes' + S);
    const st = (z: number, y: number, w: number, h: number): Station => ({ c: [an[0] + s * (z > 0.08 ? 0.008 : 0), y, z], s: [w, h], p: 'flat', tw: [[6, 0, -0.25], [7, 0, -0.3], [8, 0, -0.3]] });
    body.add(trunk({
      name: 'foot' + S, stations: [st(-0.1, 0.045, 0.035, 0.045), st(-0.07, 0.06, 0.045, 0.06), st(-0.01, 0.07, 0.048, 0.065), st(0.06, 0.05, 0.05, 0.048), st(0.13, 0.032, 0.054, 0.032), st(0.17, 0.024, 0.05, 0.022)],
      tween: 0, capS: true, capE: true, levels: 1, k: 0.9, skin: (p) => (p[2] > 0.12 ? [tb, 0.6, fb, 0.4] : p[1] > 0.1 ? [bi('shin' + S), 0.5, fb, 0.5] : [fb, 1]),
      paint: skinPaint({ sole: (_p, n) => n[1] < -0.3 }),
    }));
    for (let k = 0; k < 5; k++) {
      const x = an[0] + s * (0.01 + (k - 2) * 0.02), L = k === 0 ? 0.075 : 0.07 - k * 0.008, base: V3 = [x, 0.024, 0.165];
      const tip: V3 = [x + s * (k - 2) * 0.006, 0.008, base[2] + L];
      body.add(stalk({ name: 'toe' + S + k, path: curve([base, [x + s * (k - 2) * 0.003, 0.03, base[2] + L * 0.45], [x + s * (k - 2) * 0.005, 0.02, base[2] + L * 0.8], tip], 5), r: (t) => (k === 0 ? 0.013 : 0.0095) * (1 - t * 0.3), around: 5, capE: true, levels: 1, k: 0.9, skin: () => [tb, 1], paint: skinPaint({ nails: (p) => Math.hypot(p[0] - tip[0], p[1] - tip[1] - 0.004, p[2] - tip[2]) < 0.012, sole: (_p, n) => n[1] < -0.5 }) }));
    }
  }
  for (const p of sleeves) body.finalize(p);
  yield 'legs';

  // ---- hair, and the strips of her shawl
  const hairSeats: LockSeat[] = [];
  const hg = head.grids[0];
  for (let k = 0; k < 150; k++) {
    // round the back and sides of the scalp (v up the head, u round from the front seam)
    const v = 0.5 + h3(k, 1, 51) * 0.45, u = h3(k, 2, 51);
    const q = gridSurf(head.m, hg, u, v);
    const rel = sub(q.p, HG);
    // not on the face
    if (rel[2] > 0.03 && rel[1] < 0.075 && Math.abs(rel[0]) < 0.07) continue;
    const front = rel[2] > 0.0;
    const len = (front ? 0.3 : 0.48) + 0.14 * h3(k, 3, 51);
    hairSeats.push({ p: sub(q.p, scl(q.n, 0.004)), n: q.n, dir: nrm([q.n[0] * 0.35, -1, q.n[2] * 0.3 - 0.15]), len, wid: 0.02 + 0.008 * h3(k, 4, 51), lift: 0.18, droop: 0.25, col: h3(k, 5, 51) < 0.35 ? 1 : h3(k, 6, 51) < 0.2 ? 2 : 0, w: headSkin(q.p) });
  }
  const hairTiles = [STONE, SNOW, STONE];
  const hair = locks({ name: 'hair', seats: hairSeats, tiles: hairTiles, steps: [4, 3, 2], seed: 13 });
  if (hair) { hair.k = 0.45; body.add(hair); }
  const strip: LockSeat[] = [];
  const rg = robe.grids[0];
  const kindAt = (k: number, seed: number) => { const r = h3(k, 9, seed); return r < 0.34 ? 0 : r < 0.6 ? 1 : r < 0.84 ? 2 : 3; };
  const sowRobe = (n: number, v0: number, v1: number, len: (p: V3) => number, wid: number, seed: number) => {
    for (let k = 0; k < n; k++) {
      const u = h3(k, 1, seed), v = v0 + (v1 - v0) * h3(k, 2, seed);
      const q = gridSurf(robe.m, rg, u, v);
      const L = len(q.p); if (L < 0.03) continue;
      // keep the face of the robe under the arms clear where the hands hang
      strip.push({ p: sub(q.p, scl(q.n, 0.006)), n: q.n, dir: nrm([q.n[0] * 0.12, -1, q.n[2] * 0.12]), len: L, wid: wid * (0.75 + 0.5 * h3(k, 3, seed)), lift: 0.06, droop: 0.08, col: kindAt(k, seed), w: robeSkin(q.p) });
    }
  };
  // robe rows (v) by height: v = row / rows of the tweened, subdivided tube
  const vAt = (y: number) => { let best = 0, bd = 9; for (let k = 0; k <= 200; k++) { const v = k / 200, p = gridSurf(robe.m, rg, 0.5, v).p; if (Math.abs(p[1] - y) < bd) { bd = Math.abs(p[1] - y); best = v; } } return best; };
  sowRobe(150, vAt(1.5), vAt(1.95), (p) => 0.32 + 0.4 * h3(Math.floor(p[0] * 50), Math.floor(p[1] * 50), 3) * (p[2] < 0 ? 1.2 : 0.8), 0.034, 61);
  sowRobe(60, vAt(0.95), vAt(1.45), () => 0.25 + 0.25 * Math.random(), 0.03, 63);
  sowRobe(90, vAt(0.06), vAt(0.3), () => 0.12 + 0.1 * Math.random(), 0.032, 65);
  for (const sl of sleeves) {
    const g = sl.grids[0];
    for (let k = 0; k < 26; k++) {
      const q = gridSurf(sl.m, g, h3(k, 1, 71), 0.15 + 0.8 * h3(k, 2, 71));
      strip.push({ p: sub(q.p, scl(q.n, 0.005)), n: q.n, dir: nrm([q.n[0] * 0.1, -1, q.n[2] * 0.1]), len: 0.12 + 0.16 * h3(k, 3, 71), wid: 0.026, lift: 0.05, droop: 0.06, col: kindAt(k, 71), w: sl.skin(q.p) });
    }
  }
  const stripTiles = [SOIL, MOSS, SAGE, HEART];
  const strips = locks({ name: 'strips', seats: strip, tiles: stripTiles, seed: 17 });
  if (strips) { strips.paint = cardPaint(['bark', 'moss', 'lichen', 'bark'], stripTiles, { steps: [2.2, 1.8, 3.4, 2.4], rough: 240 }); strips.k = 0.32; body.add(strips); }
  const needleTiles = [GOLD, OCHRE, STRAW];
  const needles = locks({ name: 'needles', seats: needleSeats, tiles: needleTiles, seed: 19 });
  if (needles) { needles.paint = cardPaint(['needles', 'needles', 'needles'], needleTiles, { steps: [4, 4, 3.6], rough: 200 }); needles.k = 0.7; body.add(needles); }
  yield 'locks';
  void PLUM; void INK; void cell3; void FUR;
  const out = yield* body.buildGen({ den: o.den ?? 260, maxScale: 2, budget: 30000 });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, bones, tris: out.tris, den: body.den, stats };
}
