// BIGFOOT (Sasquatch): model. About 2.7 m to the top of the sagittal crest: a long torso hunched forward over a
// barrel chest, no neck to speak of (the trapezius rises straight into the back of the skull), very broad shoulders,
// arms that hang to the knees ending in huge leathery hands, short heavy legs that never quite straighten, long flat
// feet. A conical head: the crest at the back, the forehead sloping to a heavy brow shelf over small deep-set eyes, a
// broad flat nose and a projecting muzzle, the face bare dark leather with folds. Dark brown-black hair painted as a
// pelt over the whole body, with real lock geometry (the anatomy library's locks) standing off the shoulders, back,
// hanging from the forearms, the thighs and the crown.
// Creature space: metres, +z forward, +y up, ground y = 0.
import * as THREE from 'three';
import {
  Body, runSync, runAsync, trunk, limb, legRings, eyeball, eyelid, locks, stalk, curve, chainSkin, addWeights, gridSurf, Px, RP, cell3, h3, cl,
  type V3, type Wt, type Piece, type Chart, type Station, type LockSeat, type LimbRing,
} from '../anatomy';
import { spineFrame, locate, nz2, nz3, fbm3, type Frame } from '../paintkit';
import type { BoneDef } from '../rig';
import { furZones } from '../fur/paint';

export const BF = {
  head: [0, 2.4, 0.13] as V3,
  arm: { sh: [0.43, 2.1, 0.06] as V3, el: [0.5, 1.55, -0.01] as V3, wr: [0.5, 1.02, 0.08] as V3, r: 0.112 },
  leg: { hip: [0.19, 1.22, 0.0] as V3, kn: [0.205, 0.68, 0.07] as V3, an: [0.2, 0.1, -0.03] as V3, r: 0.15 },
};
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const EYE: V3 = [0.047, 0.036, 0.146];
/** v7: the face's moving parts (head-local): brows over the eyes, the upper lip; the eyes a little bigger */
const BROW: V3 = [0.046, 0.082, 0.15], LIP: V3 = [0, -0.07, 0.2], EYER = 0.0195;
export const BF_EYE_AX: V3 = [0.3, -0.05, 1];

export function bigfootBones(): BoneDef[] {
  const b: BoneDef[] = [];
  const A = (name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, pos: pos as [number, number, number] });
  A('hips', null, [0, 1.28, 0]);
  A('spine', 'hips', [0, 1.56, 0.02]);
  A('chest', 'spine', [0, 1.86, 0.03]);
  A('neck', 'chest', [0, 2.22, 0.07]);
  A('head', 'neck', BF.head);
  A('jaw', 'head', add(BF.head, [0, -0.07, 0.03]));
  A('eyeL', 'head', add(BF.head, EYE)); A('eyeR', 'head', add(BF.head, [-EYE[0], EYE[1], EYE[2]]));
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const a = BF.arm;
    A('cla' + s, 'chest', [0.12 * k, 2.16, 0.05]);
    A('arm' + s, 'cla' + s, mir(a.sh, k)); A('elb' + s, 'arm' + s, mir(a.el, k)); A('hand' + s, 'elb' + s, mir(a.wr, k));
    A('fing' + s, 'hand' + s, mir(add(a.wr, [0.0, -0.17, 0.02]), k)); A('fing2' + s, 'fing' + s, mir(add(a.wr, [0.0, -0.245, 0.025]), k));
    A('thumb' + s, 'hand' + s, mir(add(a.wr, [-0.04, -0.06, 0.05]), k));
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const l = BF.leg;
    A('thigh' + s, 'hips', mir(l.hip, k)); A('shin' + s, 'thigh' + s, mir(l.kn, k)); A('foot' + s, 'shin' + s, mir(l.an, k));
    A('toes' + s, 'foot' + s, mir([l.an[0], 0.03, 0.22], k));
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) { A('brow' + s, 'head', add(BF.head, [k * BROW[0], BROW[1], BROW[2]])); A('lid' + s, 'head', add(BF.head, [k * EYE[0], EYE[1], EYE[2]])); }
  A('lip', 'head', add(BF.head, LIP));
  return b;
}

// ------------------------------------------------------------------------------------------------ paint
const FUR = RP('squatch'), LEA = RP('leather'), GUM = RP('gum');
/** the coat: a dark pelt combed down the body, red-brown tips where the hair catches, darker in the creases */
function furPaint(o: { flow: number; len?: number; bare?: (p: V3, n: V3) => number; tone?: (p: V3) => number }) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.8;
    const bare = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: V3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
      const bk = o.bare ? o.bare(p, n) : 0;
      bare[i] = bk;
      const mott = fbm3(p[0] * 3, p[1] * 3, p[2] * 3, 2);
      if (bk > 0.5) { const c = cell3(p[0], p[1], p[2], 0.012, 4); px.put(i, LEA, 2.6 + mott * 0.6 - ((c.f2 - c.f1) < px.mpt * 0.8 ? 0.9 : 0)); px.rough[i] = 170; continue; }
      px.put(i, FUR, 2.2 + mott * 0.7 + (o.tone ? o.tone(p) : 0)); px.rough[i] = 235;
    }
    yield;
    px.pelt({ len: o.len ?? 0.12, width: 0.011, flow: o.flow, down: 0.5, mask: (i) => (bare[i] > 0.5 ? 0 : 1), tooth: 1.9, clump: 0.55, strands: 0.3 });
    yield;
    px.creaseInk(1.4, { dark: 1, lit: 0.3 });
    yield;
    px.flush();
  };
}
/** the face: bare dark leather, folds across the brow and round the muzzle, nostrils, lips, the hairline */
function facePaint(H: V3) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
    px.lightK = 0.75;
    const fur = new Float32Array(px.n);
    const E = EYE;
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const x = P[i * 3] - H[0], y = P[i * 3 + 1] - H[1], z = P[i * 3 + 2] - H[2], ax = Math.abs(x), nz = N[i * 3 + 2];
      // the bare face: from the brow down to the chin, framed by hair that thins out over its edge
      const edge = faceEdge(x, y, z, nz);
      const m = fbm3(x * 9, y * 9, z * 9, 2);
      if (edge < 0 || (edge < 0.012 && h3(Math.floor(x / mpt / 2), Math.floor(y / mpt / 3), 5) < 1 - edge / 0.012)) {
        fur[i] = 1; px.put(i, FUR, 2.2 + m * 0.6 + (y > 0.15 ? 0.3 : 0)); px.rough[i] = 235; continue;
      }
      // leather: cooler and darker round the eyes, warmer on the cheeks and the muzzle, darker toward the hair
      let R = LEA, st = 2.2 + fbm3(x * 30, y * 30, z * 30, 2) * 0.45 + cl((0.02 - edge) * 40, 0, 0.8) * -1;
      let rough = 150;
      const ex = ax - E[0], ey = y - E[1], ed = Math.hypot(ex, ey);
      // the brow ridge: its top catches the light, a deep shadow under its shelf sinks into the orbits
      if (y > 0.074 && z > 0.1) st += 0.7 - (y > 0.09 ? 0.3 : 0);
      if (y > 0.05 && y < 0.074 && z > 0.11) st -= 1.3 * cl((0.074 - y) / 0.012, 0.3, 1) * cl((0.085 - ax) / 0.03, 0, 1);
      // deep-set eyes: a dark socket, an upper lid fold, puffed lower lids, crow's feet
      if (ed < 0.034 && z > 0.12) st -= (0.034 - ed) * 55;
      if (Math.abs(ed - 0.022) < mpt * 0.7 && ey > 0) st -= 0.8;
      if (Math.abs(ed - 0.026) < mpt * 0.8 && ey < -0.004 && Math.abs(ex) < 0.02) st += 0.6;
      if (Math.abs(ed - 0.031) < mpt * 0.7 && ey < -0.006 && Math.abs(ex) < 0.022) st -= 0.7;
      if (ex > 0.022 && ex < 0.04 && Math.abs(Math.sin(Math.atan2(ey, ex) * 9)) < 0.18 && Math.abs(ey) < 0.014) st -= 0.6;
      // horizontal folds over the brow and the bridge of the nose
      if (y > 0.074 && Math.abs(Math.sin(y * 260 + nz2(x * 30, 1) * 1.5)) < 0.14) st -= 0.8;
      if (ax < 0.018 && y > 0.0 && y < 0.04 && Math.abs(Math.sin(y * 330)) < 0.15) st -= 0.7;
      // the broad nose: a lit bridge, wings round flared nostrils (dark holes with a lit rim), a wet tip
      const nx = ax - 0.024, ny = y + 0.032, nd = Math.hypot(nx, ny * 1.8);
      if (z > 0.16 && nd < 0.011) { st = 0.3; rough = 140; }
      else if (z > 0.16 && nd < 0.016) { st += ny < 0 ? 1.0 : 0.4; rough = 165; }
      else if (z > 0.17 && ax < 0.03 && y > -0.03 && y < 0.005) { st += 0.5; rough = 170; }
      // folds from the nose wings round the muzzle
      const nl = Math.abs(ax - (0.045 + (-0.03 - y) * 0.45));
      if (y < -0.025 && y > -0.11 && nl < mpt * 0.8 && z > 0.15) st -= 1.0;
      // the mouth: a dark line, deep corners, the upper lip creased vertically, a fleshy lower lip catching light
      const ml = y + 0.085 + ax * ax * 3;
      if (z > 0.18 && Math.abs(ml) < mpt * 1.1) { px.put(i, GUM, 0.4); px.rough[i] = 90; continue; }
      if (z > 0.17 && ax > 0.05 && ax < 0.062 && Math.abs(ml) < 0.006) st -= 1.2;
      if (z > 0.18 && ml > 0 && ml < 0.018 && Math.abs(Math.sin(x * 420)) < 0.2) st -= 0.6;
      if (z > 0.18 && ml < -mpt && ml > -0.014) { st += 0.7; rough = 140; R = LEA; }
      // the chin's pad of skin, stubble at its edges
      if (y < -0.12 && h3(Math.floor(x / mpt), Math.floor(y / mpt), 8) < 0.12) st -= 0.8;
      px.put(i, R, st); px.rough[i] = rough;
    }
    yield;
    px.pelt({ len: 0.05, width: 0.012, flow: 1, down: 0.4, mask: (i) => fur[i], tooth: 1.6, clump: 0.5, strands: 0.3 });
    yield;
    px.creaseInk(1.3, { dark: 1.1, lit: 0.6 });
    yield;
    px.flush();
  };
}
/** > 0 inside the bare face (head-local), < 0 in the hair */
function faceEdge(x: number, y: number, z: number, nz: number) {
  const ax = Math.abs(x), hairline = 0.105 + nz2(x * 40, y * 40) * 0.008 - Math.max(0, ax - 0.06) * 0.6;
  return Math.min(z - (hairline - 0.005), 0.1 - y, y + 0.19, nz - 0.1, 0.12 - Math.max(0, -y - 0.05) * 0.4 - Math.max(0, y - 0.06) * 0.8 - ax);
}
function leatherPaint(o: { palm?: (p: V3, n: V3) => boolean } = {}) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.7;
    const fur = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: V3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
      const palm = o.palm ? o.palm(p, n) : true;
      if (!palm) { fur[i] = 1; px.put(i, FUR, 2.6); px.rough[i] = 235; continue; }
      const c = cell3(p[0], p[1], p[2], 0.01, 9);
      const crease = Math.abs(Math.sin((p[1] * 0.8 + p[2] * 0.6) * 120 + nz3(p[0] * 20, p[1] * 20, p[2] * 20) * 2)) < 0.12;
      px.put(i, LEA, 2.5 + (c.id % 3) * 0.25 - ((c.f2 - c.f1) < px.mpt * 0.7 ? 0.7 : 0) - (crease ? 1 : 0)); px.rough[i] = 175;
    }
    px.pelt({ len: 0.035, width: 0.012, flow: 1, mask: (i) => fur[i], tooth: 1.4, clump: 0.4 });
    px.creaseInk(1.2, { dark: 1.2, lit: 0.6 });
    px.flush();
  };
}
function nailPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  for (let i = 0; i < px.n; i++) { px.put(i, RP('horn'), 2.4 + (h3(i, 1, 2) < 0.1 ? 1 : 0)); px.rough[i] = 110; }
  px.creaseInk(1, { dark: 1, lit: 1 }); px.flush();
}

// ------------------------------------------------------------------------------------------------ the head
// head-local slices (z forward), nine points from the crown down the +x side to the throat
const HEAD: { z: number; p: number[][] }[] = [
  { z: -0.165, p: [[0, 0.13], [0.05, 0.12], [0.09, 0.08], [0.11, 0.03], [0.115, -0.02], [0.11, -0.07], [0.095, -0.11], [0.06, -0.14], [0, -0.15]] },
  { z: -0.12, p: [[0, 0.235], [0.03, 0.205], [0.12, 0.135], [0.145, 0.055], [0.15, -0.03], [0.145, -0.1], [0.13, -0.15], [0.08, -0.18], [0, -0.19]] },
  { z: -0.05, p: [[0, 0.28], [0.022, 0.245], [0.13, 0.165], [0.16, 0.07], [0.165, -0.02], [0.16, -0.1], [0.15, -0.17], [0.1, -0.21], [0, -0.22]] },
  { z: 0.02, p: [[0, 0.24], [0.04, 0.218], [0.13, 0.162], [0.165, 0.07], [0.17, -0.02], [0.165, -0.1], [0.155, -0.18], [0.11, -0.228], [0, -0.238]] },
  { z: 0.075, p: [[0, 0.165], [0.07, 0.156], [0.135, 0.122], [0.162, 0.06], [0.17, -0.01], [0.162, -0.09], [0.147, -0.17], [0.1, -0.222], [0, -0.232]] },
  { z: 0.112, p: [[0, 0.11], [0.075, 0.104], [0.128, 0.084], [0.134, 0.04], [0.142, -0.01], [0.137, -0.08], [0.126, -0.15], [0.09, -0.2], [0, -0.21]] },
  { z: 0.14, p: [[0, 0.082], [0.05, 0.086], [0.098, 0.072], [0.104, 0.036], [0.117, -0.016], [0.116, -0.08], [0.106, -0.14], [0.076, -0.18], [0, -0.19]] },
  { z: 0.156, p: [[0, 0.05], [0.04, 0.046], [0.074, 0.03], [0.082, 0.004], [0.1, -0.03], [0.102, -0.085], [0.094, -0.14], [0.068, -0.172], [0, -0.18]] },
  { z: 0.172, p: [[0, 0.03], [0.042, 0.022], [0.07, 0.0], [0.08, -0.03], [0.09, -0.062], [0.09, -0.1], [0.082, -0.14], [0.06, -0.166], [0, -0.172]] },
  { z: 0.2, p: [[0, -0.005], [0.036, -0.01], [0.056, -0.03], [0.066, -0.055], [0.072, -0.078], [0.066, -0.106], [0.056, -0.135], [0.04, -0.15], [0, -0.155]] },
  { z: 0.218, p: [[0, -0.035], [0.025, -0.038], [0.04, -0.052], [0.046, -0.07], [0.046, -0.09], [0.04, -0.11], [0.03, -0.128], [0.018, -0.138], [0, -0.14]] },
];

// ------------------------------------------------------------------------------------------------ hands and feet
/** a hand hanging from the wrist: a broad palm, four thick fingers in a row, a thumb set forward and in */
function hand(body: Body, s: number, bi: (n: string) => number, wr: V3) {
  const S = s > 0 ? 'L' : 'R', hb = bi('hand' + S), f1 = bi('fing' + S), f2 = bi('fing2' + S), tb = bi('thumb' + S);
  // palm: stations down from the wrist; x across the palm is along z (the hand's width faces forward), thickness in x
  const pal = (d: number, w: number, t: number): Station => ({ c: add(wr, [0, -d, 0.02 + d * 0.06]), s: [t, w], p: 'flat' });
  const palm = body.add(trunk({
    name: 'palm' + S, stations: [pal(-0.02, 0.05, 0.04), pal(0.03, 0.062, 0.042), pal(0.09, 0.07, 0.04), pal(0.15, 0.072, 0.036), pal(0.185, 0.064, 0.032)],
    tween: 0, capS: true, capE: true, levels: 1, k: 1.3,
    skin: (p) => (p[1] > wr[1] - 0.01 ? [bi('elb' + S), 0.3, hb, 0.7] : [hb, 1]),
    paint: leatherPaint({ palm: (p, n) => n[0] * s < 0.1 || p[1] < wr[1] - 0.17 }),
  }));
  void palm;
  // fingers: four in a row across the palm's width (along z), slightly curled toward the palm
  const nails: { c: V3; d: V3 }[] = [];
  for (let k = 0; k < 4; k++) {
    const fz = 0.02 + (k - 1.5) * 0.034 + 0.008, len = [0.13, 0.15, 0.145, 0.12][k];
    const base: V3 = add(wr, [0, -0.175, fz]);
    const path = curve([base, add(base, [0, -len * 0.45, 0.004]), add(base, [-s * 0.012, -len * 0.85, 0.006]), add(base, [-s * 0.026, -len, 0.004])], 5);
    const sk = chainSkin([add(base, [0, 0.03, 0]), add(base, [0, -len * 0.42, 0]), add(base, [0, -len * 1.2, 0])], [f1, f2], 0.3);
    body.add(stalk({ name: 'fin' + S + k, path, r: (t) => 0.019 * (1 - t * 0.25), around: 5, capS: false, capE: true, levels: 1, k: 1.2, skin: sk, paint: leatherPaint({ palm: (p) => p[1] < base[1] - len * 0.3 }) }));
    nails.push({ c: path[path.length - 1], d: norm([-s * 0.4, -1, 0.1]) });
  }
  // the thumb: from the heel of the palm, forward and down
  const tbase: V3 = add(wr, [-s * 0.02, -0.06, 0.07]);
  const tpath = curve([tbase, add(tbase, [-s * 0.012, -0.05, 0.03]), add(tbase, [-s * 0.02, -0.1, 0.035]), add(tbase, [-s * 0.024, -0.125, 0.03])], 5);
  body.add(stalk({ name: 'thm' + S, path: tpath, r: (t) => 0.023 * (1 - t * 0.3), around: 6, capS: false, capE: true, levels: 1, k: 1.2, skin: () => [tb, 1], paint: leatherPaint({ palm: () => true }) }));
  void nails;
}
/** a long flat foot: heel to the ball along z, five toes, leathery soles */
function foot(body: Body, s: number, bi: (n: string) => number, an: V3) {
  const S = s > 0 ? 'L' : 'R', fb = bi('foot' + S), tb = bi('toes' + S);
  const st = (z: number, y: number, w: number, h: number): Station => ({ c: [an[0] + s * (z > 0.1 ? 0.012 : 0), y, z], s: [w, h], p: 'flat', tw: [[6, 0, -0.25], [7, 0, -0.3], [8, 0, -0.3]] });
  body.add(trunk({
    name: 'foot' + S, stations: [st(-0.13, 0.055, 0.05, 0.055), st(-0.09, 0.07, 0.07, 0.07), st(-0.02, 0.085, 0.078, 0.085), st(0.07, 0.065, 0.088, 0.065), st(0.16, 0.045, 0.094, 0.045), st(0.22, 0.035, 0.09, 0.034), st(0.245, 0.03, 0.078, 0.028)],
    tween: 0, capS: true, capE: true, levels: 1, k: 1.0,
    skin: (p) => (p[2] > 0.17 ? [tb, 0.6, fb, 0.4] : p[1] > 0.14 ? [bi('shin' + S), 0.5, fb, 0.5] : [fb, 1]),
    paint: leatherPaint({ palm: (_p, n) => n[1] < -0.2 }),
  }));
  for (let k = 0; k < 5; k++) {
    const x = an[0] + s * (0.012 + (k - 2) * 0.034) * (k === 0 ? 1.08 : 1), base: V3 = [x, 0.035, 0.225], len = k === 0 ? 0.075 : 0.06 - k * 0.006;
    const path = curve([base, [x + s * (k - 2) * 0.004, 0.03, base[2] + len * 0.6], [x + s * (k - 2) * 0.006, 0.018, base[2] + len]], 4);
    body.add(stalk({ name: 'toe' + S + k, path, r: (t) => (k === 0 ? 0.026 : 0.019) * (1 - t * 0.3), around: 5, capS: false, capE: true, levels: 1, k: 1, skin: () => [tb, 1], paint: leatherPaint({ palm: (_p, n) => n[1] < 0.3 }) }));
  }
}

// ------------------------------------------------------------------------------------------------ the build
/** the IndexedDB cache key: bump it whenever anything that shapes or paints this model changes */
export const BIGFOOT_MODEL_VERSION = 'bigfoot@8';
export interface BigfootModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }

/** build the model straight through (blocks for a few seconds) */
export function buildBigfootModel(o: { page?: number; den?: number } = {}): BigfootModel { return runSync(bigfootModelGen(o)); }
/** build the model in slices of ~30 ms, yielding to the event loop between them */
export function buildBigfootModelAsync(o: { page?: number; den?: number } = {}): Promise<BigfootModel> { return runAsync(bigfootModelGen(o)); }
/** the build as steps (see Body.buildGen) */
export function* bigfootModelGen(o: { page?: number; den?: number } = {}): Generator<string | void, BigfootModel> {
  const bones = bigfootBones(), bi = (n: string) => { const k = bones.findIndex((b) => b.name === n); if (k < 0) throw new Error(n); return k; };
  const body = new Body(o.page ?? 1024);
  body.seed = 2701;
  const H = BF.head;
  // the torso: crotch .. hips .. belly .. barrel chest .. shoulders .. the trapezius rising into the skull
  const st: Station[] = [
    { c: [0, 1.15, 0.01], s: [0.2, 0.15], p: 'round' },
    { c: [0, 1.29, -0.005], s: [0.33, 0.21], p: 'hips', tw: [[1, 0.04, 0.1], [2, 0.06, 0.06]] },
    { c: [0, 1.48, 0.03], s: [0.33, 0.225], p: 'sag' },
    { c: [0, 1.68, 0.045], s: [0.37, 0.255], p: 'barrel' },
    { c: [0, 1.88, 0.045], s: [0.43, 0.27], p: 'barrel' },
    { c: [0, 2.05, 0.05], s: [0.49, 0.25], p: 'shoulder' },
    { c: [0, 2.17, 0.06], s: [0.44, 0.21], p: 'shoulder', tw: [[2, 0.05, -0.08], [3, 0.04, -0.1]] },
    { c: [0, 2.27, 0.085], s: [0.3, 0.18], p: 'neck' },
    { c: [0, 2.36, 0.11], s: [0.13, 0.12], p: 'round' },
  ];
  const J: V3[] = [[0, 1.1, 0], [0, 1.28, 0], [0, 1.56, 0.02], [0, 1.86, 0.03], [0, 2.22, 0.07], [0, 2.4, 0.13], [0, 2.6, 0.13]];
  const spineSkin = chainSkin(J, [bi('hips'), bi('hips'), bi('spine'), bi('chest'), bi('neck'), bi('head')], 0.35);
  const torsoSkin = (p: V3): Wt => {
    let w = spineSkin(p);
    // the shoulder mass rides the clavicles a little
    const ax = Math.abs(p[0]);
    if (p[1] > 1.95 && ax > 0.22) w = addWeights(w, [[bi(p[0] > 0 ? 'claL' : 'claR'), cl((ax - 0.22) / 0.2, 0, 1) * cl((p[1] - 1.95) / 0.15, 0, 1) * 0.6]]);
    return w;
  };
  const F: Frame = spineFrame(J);
  const torso = body.add(trunk({
    name: 'trunk', stations: st, tween: 1, capS: true, capE: false, levels: 1, k: 1,
    skin: torsoSkin, paint: furPaint({ flow: -1, len: 0.13, tone: (p) => (p[1] > 1.95 ? 0.35 : 0) + (p[2] > 0.2 && p[1] < 1.95 && p[1] > 1.6 ? 0.25 : 0) }),
  }));
  body.finalize(torso);
  yield;
  // the head
  const hst: Station[] = HEAD.map((h) => ({ c: add(H, [0, 0, h.z]), s: [1, 1], p: h.p }));
  const skull = body.add(trunk({
    name: 'skull', stations: hst, tween: 1, capS: true, capE: true, levels: 1, k: 2.2,
    rings: [{ at: 5, s: 1.2 }], cols: [{ j: 0, a: 1, b: 3, s: 1.5 }, { j: 3, a: 5, b: 7, s: 1 }],
    skin: (p) => {
      if (p[1] < H[1] - 0.15 && p[2] < H[2] + 0.05) return [bi('head'), 0.6, bi('neck'), 0.4];
      // the face moves: the brow shelf rides the brows, the muzzle's upper lip the lip, below the mouth the jaw
      const x = p[0] - H[0], y = p[1] - H[1], z = p[2] - H[2], ax = Math.abs(x);
      const ml = y + 0.085 + ax * ax * 3;
      const extra: [number, number][] = [];
      const bw = cl(1 - Math.hypot(ax - BROW[0], (y - BROW[1]) * 1.4, z - BROW[2]) / 0.055, 0, 1) * (z > 0.07 ? 1 : 0);
      if (bw > 0) extra.push([bi(x > 0 ? 'browL' : 'browR'), bw * 0.85]);
      const lw = ml > 0 && z > 0.13 ? cl(1 - Math.hypot(x * 0.8, (y - LIP[1]) * 1.6, z - LIP[2]) / 0.06, 0, 1) : 0;
      if (lw > 0) extra.push([bi('lip'), lw * 0.9]);
      const jw = ml < 0 && z > 0.06 ? cl(-ml / 0.02, 0, 1) * cl((z - 0.06) / 0.06, 0, 1) : 0;
      if (jw > 0) extra.push([bi('jaw'), jw]);
      return extra.length ? addWeights([bi('head'), 1], extra) : [bi('head'), 1];
    },
    paint: facePaint(H),
  }));
  body.finalize(skull);
  yield;
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = add(H, [s * EYE[0], EYE[1], EYE[2]]), ax: V3 = [s * BF_EYE_AX[0], BF_EYE_AX[1], BF_EYE_AX[2]];
    body.add(eyeball({ name: 'eye' + S, c, ax, r: EYER, bone: bi('eye' + S), iris: RP('ochre'), pupil: 'round', pupilR: 0.42, irisA: 0.74, sclera: RP('bone'), k: 3.2, levels: 1, around: 10, catchlight: { side: s, at: [0.3, 0.4] } }));
    // heavy leather lids (a slow, considering blink)
    body.add(eyelid({ name: 'lid' + S, c, ax, r: EYER, bone: bi('lid' + S), paint: leatherPaint(), cover: 0.9, root: 2.2 })).levels = 0;
  }
  // arms and legs
  const limbs: Piece[] = [];
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const a = BF.arm, sh = mir(a.sh, s), el = mir(a.el, s), wr = mir(a.wr, s);
    const segA = [Math.hypot(...(sh.map((v, k) => v - el[k]) as [number, number, number])), Math.hypot(...(el.map((v, k) => v - wr[k]) as [number, number, number]))];
    let ar: LimbRing[] = legRings('bear', true, a.r, [0, 0.5, 1], segA, 0.02);
    ar = ar.map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.6 : r.t < 0 ? 0.8 : 1) }));
    const arm = limb({
      name: 'arm' + S, side: s, hip: sh, knee: el, sole: [wr[0], wr[1] - 0.032, wr[2]], tj: [0, 0.5, 1], rings: ar, around: 12, levels: 1, rise: 0.03,
      foot: { pad: 0.04, h: 0.02, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('cla' + S), up: bi('arm' + S), lo: bi('elb' + S), foot: bi('hand' + S) }, paint: furPaint({ flow: 1, len: 0.07 }), clawPaint: nailPaint, k: 1,
    });
    body.add(arm.skin); limbs.push(arm.skin);
    hand(body, s, bi, wr);
    const l = BF.leg, hp = mir(l.hip, s), kn = mir(l.kn, s), an = mir(l.an, s);
    const segL = [Math.hypot(...(hp.map((v, k) => v - kn[k]) as [number, number, number])), Math.hypot(...(kn.map((v, k) => v - an[k]) as [number, number, number]))];
    let lr: LimbRing[] = legRings('bear', false, l.r, [0, 0.5, 1], segL, 0.02);
    lr = lr.map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? 0.7 : r.t < 0 ? 0.85 : 1) }));
    const leg = limb({
      name: 'leg' + S, side: s, hip: hp, knee: kn, sole: [an[0], an[1] - 0.032, an[2]], tj: [0, 0.5, 1], rings: lr, around: 12, levels: 1, rise: 0.06,
      foot: { pad: 0.05, h: 0.02, nail: 'nail', toes: [], noPad: true },
      bones: { parent: bi('hips'), up: bi('thigh' + S), lo: bi('shin' + S), foot: bi('foot' + S) }, paint: furPaint({ flow: 1, len: 0.07 }), clawPaint: nailPaint, k: 1,
    });
    body.add(leg.skin); limbs.push(leg.skin);
    foot(body, s, bi, an);
    yield;
  }
  for (const p of limbs) { body.finalize(p); yield; }

  // ---- hair: locks standing off the coat
  const seats: LockSeat[] = [];
  const down: V3 = [0, -1, 0];
  const colAt = (p: V3) => (h3(Math.floor(p[0] * 40), Math.floor(p[1] * 40), Math.floor(p[2] * 40)) < 0.25 ? 2 : h3(Math.floor(p[1] * 31), Math.floor(p[0] * 31), 3) < 0.5 ? 1 : 0);
  const sow = (piece: Piece, g: number, n: number, o: { u0: number; u1: number; v0: number; v1: number; len: (p: V3, n: V3, u: number, v: number) => number; wid: number; lift?: number; droop?: number; dir?: (p: V3, n: V3, dv: V3) => V3; skin: (p: V3) => Wt; seed: number }) => {
    const grid = piece.grids[g];
    for (let k = 0; k < n; k++) {
      const u = o.u0 + h3(k, 1, o.seed) * (o.u1 - o.u0), v = o.v0 + h3(k, 2, o.seed) * (o.v1 - o.v0);
      const q = gridSurf(piece.m, grid, ((u % 1) + 1) % 1, cl(v, 0, 1));
      const L = o.len(q.p, q.n, u, v); if (L < 0.015) continue;
      const d = o.dir ? o.dir(q.p, q.n, q.dv) : norm(add(add(down, [q.n[0] * 0.35, q.n[1] * 0.35, q.n[2] * 0.35]), [0, 0, 0]));
      seats.push({ p: [q.p[0] - q.n[0] * 0.01, q.p[1] - q.n[1] * 0.01, q.p[2] - q.n[2] * 0.01], n: q.n, dir: d, len: L * (0.75 + 0.5 * h3(k, 3, o.seed)), wid: o.wid * (0.8 + 0.4 * h3(k, 4, o.seed)), lift: o.lift ?? 0.3, droop: o.droop ?? 0.35, col: colAt(q.p), w: o.skin(q.p) });
    }
  };
  // torso: long over the shoulders and back, shorter on the belly, the buttocks shaggy
  sow(torso, 0, 240, {
    u0: 0, u1: 1, v0: 0.04, v1: 0.97, wid: 0.026, seed: 3, skin: torsoSkin, droop: 0.55, lift: 0.18,
    // longest over the shoulders and the back (a mantle), shorter on the chest and belly
    len: (p) => { const back = p[2] < 0.02 ? 1 : 0.55; const sh = cl((p[1] - 1.75) / 0.4, 0, 1) * (1 - cl((p[1] - 2.22) / 0.1, 0, 1)); return (0.15 + 0.13 * sh) * back * (p[1] < 1.2 ? 0.6 : 1); },
  });
  // head: a cap of hair over the crown and crest, the cheeks' side-whiskers
  sow(skull, 0, 70, {
    u0: 0.12, u1: 0.88, v0: 0.0, v1: 0.8, wid: 0.02, seed: 5, skin: () => [bi('head'), 1], lift: 0.4, droop: 0.4,
    len: (p, n) => (p[2] > H[2] + 0.1 && p[1] > H[1] - 0.15 && p[1] < H[1] + 0.1 ? 0 : n[2] > 0.6 ? 0 : 0.075),
    dir: (_p, n) => norm([n[0] * 0.6, -0.8, -0.5 + n[2] * 0.3]),
  });
  // arms: long hair hanging off the backs of the upper arms and forearms
  for (const lp of limbs) {
    const isArm = lp.name.startsWith('arm'), sd = lp.name.endsWith('L') ? 1 : -1;
    // the joint the hair must stop short of (a lock rigid on the forearm must not reach past a bending wrist)
    const end: V3 = isArm ? mir(BF.arm.wr, sd) : mir(BF.leg.an, sd), reach = (p: V3) => Math.hypot(p[0] - end[0], p[1] - end[1], p[2] - end[2]) * 0.7;
    // limb hair lies along the limb toward the hand or foot (it hangs when the arm hangs, and stays laid along a
    // raised arm instead of sticking out), longest off the backs of the forearms and the outsides of the upper arms
    sow(lp, 0, isArm ? 90 : 60, {
      u0: 0, u1: 1, v0: 0.05, v1: 0.85, wid: 0.024, seed: isArm ? 11 : 17, skin: lp.skin, droop: 0.12, lift: 0.12,
      len: (p, n) => Math.min(reach(p), isArm ? 0.16 + 0.07 * cl(-n[2] * 1.5, 0, 1) : 0.14 * cl((p[1] - 0.3) / 0.4, 0.3, 1)),
      dir: (_p, n, dv) => norm([dv[0] + n[0] * 0.18, dv[1] + n[1] * 0.18, dv[2] + n[2] * 0.18]),
    });
  }
  const lk = locks({ name: 'hair', seats, tiles: [FUR, FUR, FUR], steps: [1, 2, 3], seed: 9 });
  if (lk) body.add(lk);
  void locate; void F;
  const out = yield* body.buildGen({ den: o.den ?? 240, maxScale: 2, budget: 24000, fur: bigfootFur(H) });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, fur: out.fur, bones, tris: out.tris, den: body.den, stats };
}

/** Bigfoot's coat (lengths in BIGFOOT_FUR_LEN): shaggy all over, a long mantle over the shoulders and back, long
 *  hair off the backs of the forearms and the outsides of the thighs, a cap over the crown; the face, palms, fingers
 *  and soles bare */
export const BIGFOOT_FUR_LEN = 0.12;
function bigfootFur(H: V3) {
  const zones = furZones([
    { piece: /^trunk/, len: 0.55, clump: 0.7, tip: 0.6 },
    { piece: /^trunk/, a: [0, 1.95, -0.05], b: [0, 2.3, 0.0], r: 0.42, len: 1.0, clump: 0.85, tip: 0.7 },
    { piece: /^trunk/, a: [0, 1.4, -0.15], b: [0, 1.95, -0.2], r: 0.3, len: 0.8, clump: 0.8 },
    { piece: /^arm/, len: 0.55, clump: 0.7 },
    { piece: /^arm/, a: [0, 1.6, -0.2], b: [0, 1.0, -0.15], r: 0.6, facing: [0, 0, -1], min: -0.2, len: 0.9, clump: 0.85, tip: 0.7 },
    { piece: /^leg/, len: 0.55, clump: 0.7 },
    { piece: /^leg/, y: [-1, 0.16], bare: true },
    { piece: /^skull/, len: 0.42, clump: 0.75, tip: 0.6 },
  ]);
  return (p: V3, n: V3, piece: string, k: { k: number; occ: number }) => {
    if (/^(palm|fin|thm|foot|toe|eye|lid|hair)/.test(piece)) return null;
    if (/^skull/.test(piece) && faceEdge(p[0] - H[0], p[1] - H[1], p[2] - H[2], n[2]) > -0.012) return null;
    return zones(p, n, piece, k);
  };
}
