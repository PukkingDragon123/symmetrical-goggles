// GAME ANIMALS: models. White-tailed deer (a buck, a doe) and moose (a bull, a cow), built with the anatomy kit
// (src/creatures/anatomy) to the creatures' quality, from one cervid builder and a table per animal:
//   a trunk blocked in as hand-placed sections (the croup over the points of the hips, the loin, the deep barrel, the
//   brisket, the withers - a moose's high hump - and the neck), hoofed legs (elbow, carpus, fetlock and the cloven
//   hoof with its dewclaws in front; stifle, hock and the long cannon behind), the cervid skull with its own jaw, wet
//   eyes with lids, big cupped ears on their own bones (they swivel and flatten), a flag of a tail on three bones,
//   antlers (a deer's beam with tines from the skull's pedicles; a moose's palms as rayed fins with a tine at every
//   ray's tip), a moose's bell under the throat and its overhanging muzzle.
// Painted as pixel art from the real surface: a deer's autumn grey-brown coat with the darker dorsal line, the white
// belly, throat patch, eye rings, muzzle band, inner ears and tail underside, black nose and hooves, ruddy lower legs
// and the dark tarsal and metatarsal tufts; a moose near-black over the hump with grey-brown stockings and a brown
// muzzle. A fur page (src/creatures/fur) grows shell fur: short on the body, longer on the neck, the moose's mane and
// bell, the deer's tail; bare noses, hooves, antlers and eyes.
// Creature space: metres, +z forward, +y up, ground y = 0.
import * as THREE from 'three';
import {
  Body, runAsync, trunk, limb, legRings, hoof, skull, mandible, eyeball, eyelid, stalk, curve, fin, chainSkin,
  Px, RP, cell3, h3, cl, SKULLS, type V3, type Chart, type Piece, type Station, type Skull, type FootSpec, type FurPaint,
} from '../anatomy';
import { spineFrame, locate, nz2, nz3, fbm3, type Frame } from '../paintkit';
import type { BoneDef } from '../rig';
import { furZones } from '../fur';

export type Species = 'deer' | 'moose';
export interface CervidModel {
  species: Species; male: boolean;
  geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture;
  bones: BoneDef[]; tris: number; den: number;
  /** shell-fur length (m) at fur-page length 1 */
  furLen: number;
  /** body scale numbers the animal code needs (m) */
  dims: { withers: number; length: number; chestY: number; chestZ: number; headLen: number; width: number; hoofR: number };
}

// ------------------------------------------------------------------------------------------------ the tables
interface LegT { top: V3; mid1: V3; mid2: V3; fet: V3; sole: V3; r: number; hoofR: number; hoofH: number }
interface CervidSpec {
  species: Species; male: boolean; seed: number; page: number; den: number; budget: number;
  bones: { root: V3; chest: V3; neck: V3; neck2: V3; head: V3; loin: V3; pelvis: V3; tail: V3[] };
  /** trunk stations rump .. under the head */
  trunk: Station[];
  fore: LegT; hind: LegT;
  head: { skull: Skull; hl: number; hw: number; hh: number; pitch: number; jawDepth: number; eyeR: number; earLen: number; earW: number; earAt: [number, number]; eye: [number, number] };
  tailR: number; tailLen: number;
  antler?: 'beam' | 'palm';
  bell?: boolean;
  furLen: number;
}

// a moose's long head: a narrow crown, a long bridge and the great overhanging nose (stations 5-7 swell up and over)
const MOOSE_SKULL: Skull = {
  z: [-0.34, -0.2, -0.04, 0.12, 0.3, 0.5, 0.68, 0.82],
  yc: [0.1, 0.16, 0.18, 0.12, 0.06, 0.02, 0.0, -0.06],
  half: [
    [[0, 0.42], [0.26, 0.38], [0.38, 0.22], [0.42, 0], [0.38, -0.2], [0.28, -0.3], [0, -0.34]],
    [[0, 0.52], [0.32, 0.48], [0.48, 0.3], [0.52, 0], [0.48, -0.26], [0.34, -0.38], [0, -0.42]],
    [[0, 0.5], [0.34, 0.48], [0.52, 0.32], [0.54, 0.0], [0.5, -0.3], [0.36, -0.42], [0, -0.46]],
    [[0, 0.4], [0.27, 0.38], [0.4, 0.22], [0.44, -0.04], [0.44, -0.3], [0.33, -0.42], [0, -0.46]],
    [[0, 0.33], [0.2, 0.31], [0.32, 0.16], [0.35, -0.06], [0.35, -0.28], [0.27, -0.38], [0, -0.42]],
    [[0, 0.32], [0.2, 0.3], [0.33, 0.14], [0.36, -0.1], [0.37, -0.32], [0.28, -0.42], [0, -0.44]],
    [[0, 0.36], [0.24, 0.34], [0.37, 0.16], [0.4, -0.12], [0.4, -0.36], [0.3, -0.46], [0, -0.48]],
    [[0, 0.26], [0.2, 0.24], [0.31, 0.08], [0.33, -0.16], [0.31, -0.34], [0.22, -0.42], [0, -0.44]],
  ],
  rows: [{ at: 2, s: 1, ink: true }, { at: 6, s: 1, ink: true }],
  cols: [{ j: 5, a: 4, b: 7, s: 2, ink: true }],
};

const DEER = (male: boolean): CervidSpec => ({
  species: 'deer', male, seed: male ? 3301 : 3307, page: 1024, den: 340, budget: 17000, furLen: 0.022,
  bones: { root: [0, 0.82, -0.06], chest: [0, 0.83, 0.22], neck: [0, 0.93, 0.47], neck2: [0, 1.04, 0.6], head: [0, 1.15, 0.7], loin: [0, 0.85, -0.3], pelvis: [0, 0.86, -0.5], tail: [[0, 0.86, -0.665], [0, 0.8, -0.705], [0, 0.73, -0.725], [0, 0.66, -0.725]] },
  trunk: [
    { c: [0, 0.86, -0.665], s: [0.05, 0.05], p: 'round' },
    { c: [0, 0.86, -0.63], s: [0.095, 0.1], p: 'round' },
    { c: [0, 0.85, -0.56], s: [0.12, 0.15], p: 'hips', tw: [[6, -0.05, 0.05], [7, 0, 0.08]] },
    { c: [0, 0.85, -0.44], s: [0.135, 0.17], p: 'hips' },
    { c: [0, 0.84, -0.28], s: [0.135, 0.165], p: 'round', tw: [[7, 0, 0.1], [8, 0, 0.12]] },
    { c: [0, 0.81, -0.1], s: [0.16, 0.2], p: 'barrel' },
    { c: [0, 0.8, 0.06], s: [0.165, 0.215], p: 'barrel' },
    { c: [0, 0.81, 0.2], s: [0.15, 0.22], p: 'barrel' },
    { c: [0, 0.84, 0.32], s: [0.125, 0.215], p: 'shoulder', tw: [[8, 0, 0.04]] },
    { c: [0, 0.89, 0.42], s: [0.1, 0.19], p: 'shoulder', tw: [[8, 0, -0.08], [7, 0.04, -0.06]] },
    { c: [0, 0.95, 0.51], s: [0.086, 0.15], p: 'neck' },
    { c: [0, 1.02, 0.58], s: [0.073, 0.125], p: 'neck' },
    { c: [0, 1.09, 0.64], s: [0.063, 0.1], p: 'neck' },
    { c: [0, 1.135, 0.69], s: [0.055, 0.08], p: 'round' },
  ],
  fore: { top: [0.1, 0.8, 0.3], mid1: [0.105, 0.6, 0.235], mid2: [0.1, 0.33, 0.27], fet: [0.098, 0.075, 0.285], sole: [0.098, 0, 0.3], r: 0.044, hoofR: 0.022, hoofH: 0.036 },
  hind: { top: [0.105, 0.8, -0.47], mid1: [0.125, 0.6, -0.34], mid2: [0.11, 0.42, -0.55], fet: [0.098, 0.075, -0.495], sole: [0.098, 0, -0.475], r: 0.054, hoofR: 0.022, hoofH: 0.036 },
  head: { skull: SKULLS.cervid, hl: 0.29, hw: 0.112, hh: 0.132, pitch: 0.6, jawDepth: 0.16, eyeR: 0.0175, earLen: 0.15, earW: 0.042, earAt: [0.9, 1.15], eye: [2.15, 1.95] },
  tailR: 0.036, tailLen: 0.2,
  antler: male ? 'beam' : undefined,
});
const MOOSE = (male: boolean): CervidSpec => ({
  species: 'moose', male, seed: male ? 4401 : 4409, page: 1024, den: 210, budget: 19000, furLen: 0.04,
  bones: { root: [0, 1.52, -0.12], chest: [0, 1.56, 0.34], neck: [0, 1.7, 0.72], neck2: [0, 1.78, 0.9], head: [0, 1.84, 1.05], loin: [0, 1.56, -0.52], pelvis: [0, 1.56, -0.84], tail: [[0, 1.58, -1.08], [0, 1.52, -1.14], [0, 1.45, -1.17], [0, 1.39, -1.18]] },
  trunk: [
    { c: [0, 1.58, -1.09], s: [0.07, 0.07], p: 'round' },
    { c: [0, 1.57, -1.04], s: [0.16, 0.17], p: 'round' },
    { c: [0, 1.54, -0.94], s: [0.22, 0.27], p: 'hips', tw: [[6, -0.06, 0.06], [7, 0, 0.1]] },
    { c: [0, 1.53, -0.76], s: [0.25, 0.3], p: 'hips' },
    { c: [0, 1.52, -0.52], s: [0.26, 0.31], p: 'round', tw: [[7, 0, 0.08], [8, 0, 0.1]] },
    { c: [0, 1.48, -0.24], s: [0.31, 0.38], p: 'barrel' },
    { c: [0, 1.47, 0.04], s: [0.32, 0.4], p: 'barrel' },
    { c: [0, 1.5, 0.28], s: [0.29, 0.43], p: 'barrel' },
    { c: [0, 1.6, 0.48], s: [0.24, 0.44], p: 'shoulder', tw: [[0, 0, 0.06], [8, 0, 0.04]] },
    { c: [0, 1.66, 0.66], s: [0.19, 0.36], p: 'shoulder', tw: [[8, 0, -0.1], [7, 0.04, -0.08]] },
    { c: [0, 1.7, 0.8], s: [0.16, 0.26], p: 'neck' },
    { c: [0, 1.74, 0.92], s: [0.14, 0.21], p: 'neck' },
    { c: [0, 1.79, 1.01], s: [0.12, 0.17], p: 'round' },
  ],
  fore: { top: [0.19, 1.42, 0.46], mid1: [0.205, 1.09, 0.36], mid2: [0.19, 0.6, 0.42], fet: [0.18, 0.13, 0.445], sole: [0.18, 0, 0.47], r: 0.078, hoofR: 0.045, hoofH: 0.065 },
  hind: { top: [0.2, 1.48, -0.85], mid1: [0.24, 1.08, -0.63], mid2: [0.2, 0.72, -0.99], fet: [0.18, 0.13, -0.9], sole: [0.18, 0, -0.87], r: 0.094, hoofR: 0.045, hoofH: 0.065 },
  head: { skull: MOOSE_SKULL, hl: 0.56, hw: 0.23, hh: 0.27, pitch: 0.82, jawDepth: 0.17, eyeR: 0.022, earLen: 0.24, earW: 0.07, earAt: [0.9, 1.25], eye: [2.0, 2.0] },
  tailR: 0.04, tailLen: 0.11,
  antler: male ? 'palm' : undefined, bell: true,
});

// ------------------------------------------------------------------------------------------------ colour ramps
// dark -> light, cool shadows and warm lights, like the master palette
const hx = (...c: string[]) => c.map((s) => parseInt(s.slice(1), 16));
export const RAMP = {
  /** a white-tail's autumn "grey coat": grey-brown, warm in the lights */
  coat: hx('#1d1a1a', '#2b2622', '#3d342b', '#524537', '#685744', '#7f6a52', '#977f63', '#b09878', '#c8b291'),
  /** the ruddy tan of the lower legs, the face and the tail's top */
  tan: hx('#221a15', '#36281e', '#4e3a2a', '#684e37', '#826446', '#9c7c59', '#b49670', '#cab08c'),
  /** the white of the belly, throat, eye rings and tail: never pure white, cool in the shadows */
  white: hx('#3b3c40', '#56565a', '#77766f', '#9b978a', '#bcb6a4', '#d6cfba', '#e6dfca'),
  /** a moose: near-black brown over the hump, brown-grey lights */
  moose: hx('#110d0c', '#1a1411', '#251c17', '#32261d', '#413125', '#523f2f', '#66503c', '#7d644c'),
  /** the moose's stockings */
  stocking: hx('#262220', '#36302b', '#4a423a', '#5f554a', '#76695b', '#8d7f6d', '#a29380'),
  /** antler: dark brown at the burr, through the beam's tan, to polished ivory tines */
  antler: hx('#21170f', '#352617', '#4c3722', '#664b30', '#82633f', '#a0805a', '#bba07b', '#d6c29f', '#ece0c4'),
  /** a deer's eye: near-black brown, a glint of red-brown at the rim */
  iris: hx('#0c0a0a', '#17110f', '#261a15', '#36251c', '#4a3224'),
  /** the wet black of the nose, the hooves */
  nose: hx('#0b0b0d', '#151517', '#202024', '#2e2d31', '#413f42', '#5a5658'),
};
const INK = RP('ink'), GUM = RP('gum'), HORN = RP('horn');

// ------------------------------------------------------------------------------------------------ helpers
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const lerp1 = (a: number, b: number, t: number) => a + (b - a) * t;

/** a point on the skull's surface: station s (fractional), half-ring point j (fractional), side, pushed out by `out` m */
function skullPt(S: CervidSpec, s: number, j: number, side: number, out = 0): { p: V3; n: V3 } {
  const sk = S.head.skull, hd = S.head, cp = Math.cos(hd.pitch), sp = Math.sin(hd.pitch);
  const i0 = Math.max(0, Math.min(sk.z.length - 2, Math.floor(s))), fs = s - i0;
  const j0 = Math.max(0, Math.min(5, Math.floor(j))), fj = j - j0;
  const at = (i: number, jj: number, c: 0 | 1) => sk.half[i][jj][c];
  const hp = (i: number, c: 0 | 1) => lerp1(at(i, j0, c), at(i, j0 + 1, c), fj);
  const x = lerp1(hp(i0, 0), hp(i0 + 1, 0), fs) * hd.hw, y = (lerp1(sk.yc[i0], sk.yc[i0 + 1], fs) + lerp1(hp(i0, 1), hp(i0 + 1, 1), fs)) * hd.hh;
  const z = lerp1(sk.z[i0], sk.z[i0 + 1], fs) * hd.hl;
  // the outward normal: from the station's centre line
  const yc = lerp1(sk.yc[i0], sk.yc[i0 + 1], fs) * hd.hh;
  const nl = nrm([x / hd.hw, (y - yc) / hd.hh, 0]);
  const rot = (v: V3): V3 => [v[0], v[1] * cp - v[2] * sp, v[2] * cp + v[1] * sp];
  const n = rot([nl[0] * side, nl[1], nl[2]]);
  const p = add(add(S.bones.head, rot([x * side, y, z])), scl(n, out));
  return { p, n };
}
/** the head's forward axis (pitched) */
function headFwd(S: CervidSpec): V3 { const p = S.head.pitch; return [0, -Math.sin(p), Math.cos(p)]; }

// ------------------------------------------------------------------------------------------------ the skeleton
export function cervidBones(S: CervidSpec, hinge: V3): BoneDef[] {
  const b: BoneDef[] = [];
  const add2 = (name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent === null ? -1 : b.findIndex((x) => x.name === parent), pos: [pos[0], pos[1], pos[2]] });
  const B = S.bones;
  add2('root', null, B.root);
  add2('chest', 'root', B.chest);
  add2('neck', 'chest', B.neck);
  add2('neck2', 'neck', B.neck2);
  add2('head', 'neck2', B.head);
  add2('jaw', 'head', hinge);
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const e = skullPt(S, S.head.eye[0], S.head.eye[1], side, -S.head.eyeR * 0.45).p;
    add2('eye' + s, 'head', e); add2('lid' + s, 'head', e);
    add2('ear' + s, 'head', skullPt(S, S.head.earAt[0], S.head.earAt[1], side, -0.01).p);
  }
  add2('loin', 'root', B.loin);
  add2('pelvis', 'loin', B.pelvis);
  B.tail.slice(0, 3).forEach((p, k) => add2('tail' + k, k === 0 ? 'pelvis' : 'tail' + (k - 1), p));
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const f = S.fore;
    add2('fu' + s, 'chest', mir(f.top, side)); add2('fl' + s, 'fu' + s, mir(f.mid1, side)); add2('fm' + s, 'fl' + s, mir(f.mid2, side)); add2('ff' + s, 'fm' + s, mir(f.fet, side));
  }
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const h = S.hind;
    add2('hu' + s, 'pelvis', mir(h.top, side)); add2('hl' + s, 'hu' + s, mir(h.mid1, side)); add2('hm' + s, 'hl' + s, mir(h.mid2, side)); add2('hf' + s, 'hm' + s, mir(h.fet, side));
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ painters
type Zone = { R: number[]; st: number; rough?: number };
/** the coat over the trunk, neck and tail: located along the spine (s from the tail, a round from the top) */
function coatPaint(S: CervidSpec, F: Frame, part: 'trunk' | 'tail') {
  const deer = S.species === 'deer';
  const sOf = (p: V3) => locate(F, p).s;
  const sHip = sOf([0, S.bones.pelvis[1], S.bones.pelvis[2]]), sChest = sOf([0, S.bones.chest[1], S.bones.chest[2]]), sNeck = sOf(S.bones.neck);
  const sHead = sOf(S.bones.neck2);
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.75;
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], L = locate(F, p), s = L.s, a = Math.abs(L.a), ny = N[i * 3 + 1];
      const mott = fbm3(p[0] * 9, p[1] * 9, p[2] * 9, 3), fine = nz3(p[0] * 60, p[1] * 60, p[2] * 60);
      let z: Zone;
      if (deer) {
        if (part === 'tail') {
          // the flag: brown on top with a darker line, brilliant white underneath and at the fringe
          const under = L.a !== 0 && a > 1.3;
          z = under ? { R: RAMP.white, st: 5 + (a > 2.4 ? 0.5 : 0) } : { R: RAMP.tan, st: 3.4 - (a < 0.35 ? 1.2 : 0) + mott * 0.6 };
          if (s > F.L * 0.86 && !under) z = { R: RAMP.coat, st: 2.0 };
        } else {
          // belly, the inside of the thighs and the rump patch under the tail: white
          const jit = mott * 0.35 + fine * 0.12;
          const belly = a > 2.45 - jit && s > sHip - 0.04 && s < sChest - 0.02;
          const rump = s < sHip - 0.05 && a > 2.0 - (sHip - s) * 2.2 - jit;
          // the throat patch: a white bib high on the throat, just under the jaw
          const throat = a > 1.9 - jit && Math.hypot(p[0] * 0.8, p[1] - (S.bones.neck2[1] + 0.0), p[2] - (S.bones.neck2[2] + 0.05)) < 0.075 + jit * 0.04;
          const brisket = s > sChest - 0.04 && s < sNeck + 0.04 && a > 2.3 - jit;
          if (belly || rump || throat) z = { R: RAMP.white, st: 4.5 + (ny > 0 ? 0.6 : 0) + mott * 0.5 };
          else if (brisket) z = { R: RAMP.coat, st: 2.4 + mott * 0.6 };
          else {
            // the coat: a darker dorsal line, grey flanks lightening toward the belly, a warmer neck
            const dorsal = a < 0.3 + 0.08 * mott;
            const low = cl((a - 1.6) / 0.8, 0, 1);
            const neck = s > sNeck - 0.05 && s < sHead + 0.05;
            z = { R: neck && a > 0.6 && (h3(Math.floor(p[0] * 300), Math.floor(p[1] * 300), Math.floor(p[2] * 300)) < 0.5 + low * 0.3) ? RAMP.tan : RAMP.coat, st: 3.9 - (dorsal ? 1.0 : 0) + low * 0.9 + mott * 0.9 + fine * 0.3 };
          }
        }
      } else {
        // moose: black-brown over the hump and the mane, browner on the flanks, a paler saddle in some cows
        const hump = s > sChest - 0.25 && s < sNeck + 0.2 && a < 1.2;
        const belly = a > 2.4 && s > sHip && s < sChest;
        const rump = part === 'tail' || (s < sHip - 0.1 && a > 1.6);
        const saddle = s > sHip - 0.1 && s < sChest - 0.2 && a < 0.9 + mott * 0.3;
        z = { R: RAMP.moose, st: 3.4 - (hump ? 1.1 : 0) + (saddle ? 1.3 : 0) + (belly ? -0.6 : 0) + (rump ? 0.4 : 0) + (a > 1.4 && a < 2.3 ? 0.5 : 0) + mott * 1.1 + fine * 0.35 + (S.male ? 0 : 0.6) };
      }
      px.put(i, z.R, z.st);
      px.rough[i] = 225;
    }
    yield;
    // short hair laid back along the body, the locks leaning down the flanks
    px.pelt({ len: deer ? 0.018 : 0.03, width: deer ? 0.005 : 0.008, tooth: 0.9, clump: 0.3, strands: 0.18, flow: -1, down: 0.6 });
    yield;
    px.creaseInk(1.1, { dark: 0.9, lit: 0.5 });
    px.flush();
  };
}
/** legs: the coat above, tan (deer) or grey stockings (moose) below, white insides, dark gland tufts */
function legPaint(S: CervidSpec, fore: boolean, side: number) {
  const deer = S.species === 'deer', L = fore ? S.fore : S.hind;
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.75;
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], nx = N[i * 3] * side, nz = N[i * 3 + 2];
      const mott = fbm3(p[0] * 14, p[1] * 14, p[2] * 14, 2);
      const inner = nx < -0.35, y = p[1];
      const upper = y > L.mid2[1] + (L.mid1[1] - L.mid2[1]) * 0.45;
      let R = RAMP.coat, st = 3.8 + mott * 0.7;
      if (deer) {
        if (!upper && h3(Math.floor(p[0] * 400), Math.floor(p[1] * 400), Math.floor(p[2] * 400)) < 0.85) { R = RAMP.tan; st = 4.2 + mott * 0.5 - (nz < -0.4 ? 0.6 : 0); }
        if (inner && y < L.mid1[1]) { R = RAMP.white; st = 4.4; }
        // the dark band just above the hoof, the white "garter" above it on the forelegs
        if (y < L.fet[1] + 0.03) { R = RAMP.coat; st = 2.2; }
        else if (fore && y < L.fet[1] + 0.06 && nz > 0.2) { R = RAMP.white; st = 4.2; }
        // the metatarsal gland: a dark tuft on the outside of the hind cannon; the tarsal tuft inside the hock
        if (!fore && Math.abs(y - (L.mid2[1] - 0.12)) < 0.025 && nx > 0.4) { R = RAMP.coat; st = 1.6; }
        if (!fore && Math.abs(y - L.mid2[1]) < 0.035 && inner) { R = RAMP.tan; st = 1.8 + mott; }
      } else {
        if (!upper) { R = RAMP.stocking; st = 3.4 + mott * 0.7 - (inner ? 0 : 0.5); }
        else { R = RAMP.moose; st = 3.2 + mott * 0.8 + (inner ? 0.8 : 0); }
        if (y < L.fet[1] + 0.04) { R = RAMP.moose; st = 2.4; }
      }
      px.put(i, R, st); px.rough[i] = 225;
    }
    px.pelt({ len: deer ? 0.014 : 0.024, width: deer ? 0.004 : 0.007, tooth: 0.8, clump: 0.25, strands: 0.15, flow: 1, down: 0.2 });
    px.creaseInk(1.3, { dark: 1.1, lit: 0.4 });
    px.flush();
  };
}
function hoofPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.lightK = 0.6;
  for (let i = 0; i < px.n; i++) {
    const ny = N[i * 3 + 1];
    // growth lines round the wall, a worn grey sole
    const ring = Math.abs(Math.sin(P[i * 3 + 1] * 900)) < 0.2;
    px.put(i, ny < -0.6 ? RP('stone') : RAMP.nose, (ny < -0.6 ? 2.5 : 2.6) - (ring ? 0.8 : 0) + (h3(i, 7, 3) < 0.06 ? 0.8 : 0));
    px.rough[i] = ny < -0.6 ? 240 : 120;
  }
  px.creaseInk(1, { dark: 1, lit: 0.8 });
  px.flush();
}
/** the head: a deer's brown face with a darker forehead (bucks), the white eye rings and muzzle band, a black nose
 *  and a dark chin spot below a white chin; a moose's long brown face, darker crown, the paler lip */
function headPaint(S: CervidSpec, part: 'skull' | 'jaw') {
  const deer = S.species === 'deer', hd = S.head, cp = Math.cos(hd.pitch), sp = Math.sin(hd.pitch);
  const eyes = [1, -1].map((s) => skullPt(S, hd.eye[0], hd.eye[1], s, 0).p);
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.7;
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      // head-local (unpitched): z along the head (x hl), y up (x hh)
      const d = sub(p, S.bones.head), z = (d[2] * cp - d[1] * sp) / hd.hl, y = (d[1] * cp + d[2] * sp) / hd.hh;
      const nyl = N[i * 3 + 1] * cp + N[i * 3 + 2] * sp, nzl = N[i * 3 + 2] * cp - N[i * 3 + 1] * sp;
      const ex = Math.min(dist(p, eyes[0]), dist(p, eyes[1]));
      const mott = fbm3(p[0] * 20, p[1] * 20, p[2] * 20, 2);
      let R: number[], st: number, rough = 220;
      if (deer) {
        const tip = z > 0.74, top = nyl > 0.2;
        if (part === 'jaw') {
          // white chin and lower lip, a dark spot either side of the chin, the throat's white continuing back
          const spot = z > 0.55 && z < 0.68 && Math.abs(p[0]) > hd.hw * 0.08;
          R = spot ? RAMP.coat : RAMP.white; st = spot ? 1.8 : 4.6 + (nyl < -0.5 ? 0.4 : 0);
          if (z < 0.2) { R = RAMP.white; st = 4.4; }
        } else if (tip && (nzl > 0.25 || top)) {
          // the rhinarium: wet black with a glint, nostril slits
          R = RAMP.nose; st = 2.6 + (top ? 1 : 0) + (h3(i, 3, 1) < 0.08 ? 1.5 : 0); rough = 70;
          if (Math.abs(Math.abs(p[0]) - hd.hw * 0.12) < hd.hw * 0.05 && nzl > 0.5) st = 0.5;
        } else if (z > 0.6 && z < 0.74 && !(nyl < -0.6)) {
          // the white band behind the nose, the dark band behind that on the upper muzzle
          R = z > 0.66 ? RAMP.white : RAMP.coat; st = z > 0.66 ? 4.6 : 2.4 + mott * 0.4;
        } else if (ex < hd.eyeR * (1.5 + mott * 0.25) && ex > hd.eyeR * 1.08) {
          R = RAMP.white; st = 4.4;
        } else if (ex <= hd.eyeR * 1.08) { R = RAMP.coat; st = 1.0; }
        else {
          // the face: grey-brown, a tawny cast down the nose, the forehead darker on a buck (rubbing on the scrapes)
          const fore = y > 0.12 + mott * 0.05 && z > -0.1 && z < 0.42 && top;
          R = top && z > 0.15 && h3(Math.floor(p[0] * 300), Math.floor(p[1] * 300), Math.floor(p[2] * 300)) < 0.6 ? RAMP.tan : RAMP.coat;
          st = 3.9 + mott * 0.7 - (fore ? (S.male ? 1.5 : 0.6) : 0) - (z < -0.15 ? 0.3 : 0);
          // the face's eye stripe running down toward the nose (a darker streak)
          if (top && Math.abs(p[0]) < hd.hw * 0.12 && z > 0.2 && z < 0.6) st -= 0.5;
        }
      } else {
        const tip = z > 0.66;
        if (part === 'jaw') { R = RAMP.moose; st = 3.0 + mott * 0.6; if (z > 0.6) { R = RAMP.tan; st = 2.6; } }
        else if (z > 0.5 + mott * 0.05) {
          // the great overhanging nose: a lighter brown, nostrils as long dark slots on the front
          R = RAMP.tan; st = 2.0 + mott * 0.6 + (nyl > 0.3 ? 0.6 : 0) + (z > 0.7 ? 0.4 : 0); rough = 170;
          if (Math.abs(Math.abs(p[0]) - hd.hw * 0.14) < hd.hw * 0.04 && nzl > 0.55) { R = RAMP.nose; st = 0.6; }
        } else if (ex < hd.eyeR * 1.5) { R = RAMP.moose; st = 1.2; }
        else { R = tip ? RAMP.tan : RAMP.moose; st = (tip ? 2.4 : 3.5) + mott * 0.8 + (nyl > 0.4 && z < 0.3 ? -0.8 : 0) + (S.male ? 0 : 0.6); }
      }
      px.put(i, R, st); px.rough[i] = rough;
    }
    yield;
    px.pelt({ len: deer ? 0.008 : 0.016, width: deer ? 0.003 : 0.006, tooth: 0.6, clump: 0.2, strands: 0.12, flow: -1, mask: (i) => (px.rough[i] > 150 ? 1 : 0) });
    px.creaseInk(1.2, { dark: 1, lit: 0.6 });
    px.flush();
  };
}
/** ears: the outside like the face (a dark rim on a deer's), the inside cupped pale with long white hairs */
function earPaint(S: CervidSpec, side: number, root: V3) {
  const deer = S.species === 'deer';
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.6;
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], t = cl(dist(p, root) / S.head.earLen, 0, 1);
      // the cup faces forward and out: its normal toward +z
      const inside = N[i * 3 + 2] > 0.25;
      const rim = (x: number) => x; void rim; void side;
      if (deer) {
        if (inside) { px.put(i, RAMP.white, 3.6 + (t > 0.2 && t < 0.85 ? 1 : 0) - (t < 0.15 ? 1.5 : 0)); }
        else px.put(i, RAMP.coat, 3.8 + nz2(p[1] * 80, p[2] * 80) * 0.5 - (t > 0.88 ? 2 : 0));
      } else px.put(i, inside ? RAMP.stocking : RAMP.moose, inside ? 2.6 - (t < 0.3 ? 1 : 0) : 3.2);
      px.rough[i] = 220;
    }
    px.pelt({ len: 0.008, width: 0.003, tooth: 0.7, clump: 0.3, strands: 0.2 });
    px.creaseInk(1.2, { dark: 1, lit: 0.5 });
    px.flush();
  };
}
/** antler: a rough dark burr at the base, pearled and grooved beams, polished ivory tips */
function antlerPaint(base: V3, span: number, light = 0) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P;
    px.lightK = 0.65;
    for (let i = 0, y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++, i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      const t = cl(dist(p, base) / span, 0, 1), along = px.h > 1 ? y / (px.h - 1) : 0;
      const c = cell3(p[0], p[1], p[2], 0.006, 31);
      const pearl = (c.f2 - c.f1) < px.mpt * 0.9 && t < 0.7;
      const groove = Math.abs(Math.sin((p[0] + p[2]) * 220 + p[1] * 90 + nz2(p[1] * 30, p[0] * 30) * 2)) < 0.15 && t < 0.75;
      let st = 2.6 + light + t * (4.2 - light) + (along > 0.82 ? 1.2 : 0) - (pearl ? 1.1 : 0) - (groove ? 0.8 : 0);
      if (t < 0.06) st = 1.6 + ((c.id % 3) - 1) * 0.6; // the burr
      px.put(i, RAMP.antler, st);
      px.rough[i] = t > 0.7 || along > 0.85 ? 90 : 190;
    }
    px.creaseInk(1.2, { dark: 0.9, lit: 0.6 });
    px.flush();
  };
}
function lidPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  px.lightK = 0.5;
  for (let i = 0; i < px.n; i++) { px.put(i, RAMP.coat, 2.2 + (h3(i, 2, 1) < 0.2 ? 0.6 : 0)); px.rough[i] = 200; }
  px.creaseInk(1.4, { dark: 1.4, lit: 0.3 });
  px.flush();
}
function mouthPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b);
  for (let i = 0; i < px.n; i++) { px.put(i, GUM, 2 + (h3(i, 1, 1) < 0.1 ? 1 : 0)); px.rough[i] = 60; }
  px.flush();
}

/** the antlers (a deer's beam and tines, a moose's palms) on the skull's pedicles, skinned to one bone */
function addAntlers(body: Body, S: CervidSpec, bone: number) {
  if (S.antler === 'beam') {
    for (const [, side] of [['L', 1], ['R', -1]] as const) {
      const base = skullPt(S, 1.15, 1.0, side, -0.004).p;
      const o = (x: number, y: number, z: number): V3 => add(base, [x * side, y, z]);
      const beamCtrl = [o(0, -0.01, 0), o(0.04, 0.035, -0.045), o(0.12, 0.085, -0.045), o(0.175, 0.11, 0.03), o(0.17, 0.125, 0.13), o(0.115, 0.14, 0.21), o(0.06, 0.145, 0.25)];
      const beam = curve(beamCtrl, 14);
      const span = 0.42;
      const skinH = () => [bone, 1];
      body.add(stalk({ name: 'antler', path: beam, r: (t) => 0.015 * (1 - t * 0.7) * (t < 0.04 ? 1.3 : 1) + 0.002, around: 7, capS: true, capE: true, levels: 1, k: 1.2, skin: skinH, paint: antlerPaint(base, span) }));
      // tines rising off the beam's top: a short brow tine, then G2 and G3 tall, a small G4
      for (const [t, len, lean] of [[0.1, 0.05, 0.6], [0.42, 0.13, 0.2], [0.62, 0.11, 0.15], [0.82, 0.055, 0.25]] as const) {
        const k = Math.round(t * (beam.length - 1)), at = beam[k];
        const dir = nrm([side * -0.1, 1, lean]);
        const tp = curve([at, add(at, scl(dir, len * 0.5)), add(add(at, scl(dir, len)), [side * -0.01, 0, 0.012])], 5);
        body.add(stalk({ name: 'tine', path: tp, r: (tt) => 0.0095 * (1 - tt * 0.78) * (len / 0.13 * 0.4 + 0.6) + 0.0012, around: 6, capS: false, capE: true, levels: 1, k: 1.2, skin: skinH, paint: antlerPaint(base, span) }));
      }
    }
  } else if (S.antler === 'palm') {
    for (const [, side] of [['L', 1], ['R', -1]] as const) {
      const base = skullPt(S, 1.0, 1.3, side, -0.01).p;
      const o = (x: number, y: number, z: number): V3 => add(base, [x * side, y, z]);
      // the beam: out sideways and a little back
      const beam = curve([o(0, -0.01, 0), o(0.08, 0.03, -0.02), o(0.17, 0.07, -0.05)], 6);
      const skinH = () => [bone, 1];
      body.add(stalk({ name: 'antler', path: beam, r: (t) => 0.034 * (1 - t * 0.25) * (t < 0.08 ? 1.2 : 1), around: 8, capS: true, capE: true, levels: 1, k: 1.1, skin: skinH, paint: antlerPaint(base, 0.75, 1.5) }));
      // the palm: rays fanning from the beam's end, outward and up, from a forward brow tine round to the back
      const e1 = nrm([side * 1, 0.55, 0.12]), e2 = nrm([side * 0.25, 0.5, -0.85]);
      const N = 9, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], sides: V3[] = [];
      const nrmP = nrm(cross(e1, e2));
      const end = beam[beam.length - 1];
      for (let k = 0; k < N; k++) {
        const f = k / (N - 1), th = -0.55 + f * 1.9;
        roots.push(add(add(end, scl(e2, (f - 0.35) * 0.16)), scl(e1, -0.03)));
        dirs.push(nrm(add(scl(e1, Math.cos(th)), scl(e2, Math.sin(th)))));
        // the rim: longest across the middle of the palm, short brow points at the front
        lens.push((0.4 + 0.16 * Math.sin(Math.PI * Math.min(1, f * 1.15))) * (k === 0 ? 0.75 : 1) * (0.93 + 0.14 * h3(k, side, 5)));
        sides.push(nrmP);
      }
      body.add(fin({ name: 'palm', roots, dirs, lens, side: sides, ray: 0.016, web: 0.009, scallop: 0.32, steps: 6, droop: -0.25, skin: () => skinH(), paint: antlerPaint(base, 0.8, 2.2), levels: 1, k: 1.0 }));
    }
  }
}

// ------------------------------------------------------------------------------------------------ the build
export const CERVID_MODEL_VERSION = 'cervid@4';
export function* cervidGen(species: Species, male: boolean): Generator<string | void, CervidModel> {
  const S = species === 'deer' ? DEER(male) : MOOSE(male);
  const hd = S.head, B = S.bones;
  // the jaw first (its hinge is the jaw bone's pivot)
  const jawArgs = { name: 'jaw', skull: hd.skull, at: B.head, hl: hd.hl, hw: hd.hw * 0.98, hh: hd.hh, pitch: hd.pitch, depth: hd.jawDepth, from: 1.4, to: 6.85, flare: 1.02 };
  const hinge = mandible({ ...jawArgs, bone: 0, paint: () => undefined }).hinge;
  const bones = cervidBones(S, hinge), bi = (n: string) => bones.findIndex((b) => b.name === n);
  const body = new Body(S.page);
  body.seed = S.seed;

  // the spine: tail tip .. poll, for skinning and the painters
  const J: V3[] = [B.tail[2], B.tail[0], B.pelvis, B.loin, B.root, B.chest, B.neck, B.neck2, B.head];
  const spineSkin = chainSkin(J, [bi('tail1'), bi('pelvis'), bi('pelvis'), bi('loin'), bi('root'), bi('chest'), bi('neck'), bi('neck2')], 0.3);
  const F = spineFrame([[0, B.tail[0][1], B.tail[0][2] - 0.02], [0, B.pelvis[1], B.pelvis[2]], [0, B.loin[1], B.loin[2]], [0, B.root[1], B.root[2]], [0, B.chest[1], B.chest[2]], B.neck, B.neck2, B.head]);
  const torso = body.add(trunk({
    name: 'trunk', stations: S.trunk, tween: 1, capS: true, capE: false, k: 1.0, levels: 1,
    rings: [{ at: 2, s: 0.5 }],
    skin: (p) => spineSkin(p), paint: coatPaint(S, F, 'trunk'),
  }));
  body.finalize(torso);
  yield 'trunk';

  // ---- the head
  const sk = body.add(skull({ name: 'skull', skull: hd.skull, at: B.head, hl: hd.hl, hw: hd.hw, hh: hd.hh, pitch: hd.pitch, bones: { head: bi('head'), neck: bi('neck2') }, paint: headPaint(S, 'skull'), k: 1.8 }));
  body.finalize(sk);
  const jw = mandible({ ...jawArgs, bone: bi('jaw'), paint: headPaint(S, 'jaw'), k: 1.4 });
  body.add(jw.piece);
  // the inside of the mouth: a dark gum strip along the jaw line (seen when it chews or bellows)
  const fwd = headFwd(S);
  const mouthA = add(hinge, scl(fwd, hd.hl * 0.1)), mouthB = add(jw.chin, scl(fwd, -hd.hl * 0.06));
  body.add(stalk({ name: 'mouth', path: [mouthA, lerpV(mouthA, mouthB, 0.5), mouthB], r: () => hd.hw * 0.12, around: 6, sec: (a) => 0.5 + 0.5 * Math.abs(Math.sin(a)), capS: true, capE: true, levels: 0, skin: () => [bi('jaw'), 1], paint: mouthPaint }));
  for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const e = skullPt(S, hd.eye[0], hd.eye[1], side, -hd.eyeR * 0.45);
    const ax = nrm(add(scl(e.n, 1), scl(fwd, 0.35)));
    body.add(eyeball({ name: 'eye' + s, c: e.p, ax, r: hd.eyeR, bone: bi('eye' + s), iris: RAMP.iris, pupil: 'bar', irisA: 1.05, sclera: RAMP.iris, k: 3, levels: 0, around: 10 }));
    body.add(eyelid({ name: 'lid' + s, c: e.p, ax, r: hd.eyeR, bone: bi('lid' + s), paint: lidPaint, cover: 0.95, root: 2.2 })).levels = 0;
    // the ear: a long cupped leaf from its root behind the eye, standing up and out
    const er = skullPt(S, hd.earAt[0], hd.earAt[1], side, -0.012).p;
    const out = nrm([side * 1.0, S.species === 'deer' ? 0.62 : 0.5, -0.22]), L = hd.earLen;
    const path = curve([er, add(er, scl(out, L * 0.3)), add(add(er, scl(out, L * 0.7)), [side * 0.01, 0.01, 0]), add(add(er, scl(out, L)), [side * 0.005, 0.0, -0.02])], 8);
    body.add(stalk({
      name: 'ear' + s, path, around: 8, capS: true, capE: true, levels: 1, k: 1.3,
      r: (t) => hd.earW * Math.pow(Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.82)), 0.8) * (t < 0.12 ? 0.7 : 1),
      // flat leaf, cupped toward the front: thin front-to-back, wide side-to-side
      sec: (a) => 0.18 + 0.82 * Math.abs(Math.sin(a)) - (Math.cos(a) > 0.6 ? 0.08 : 0), up: [0, 0, 1],
      skin: () => [bi('ear' + s), 1], paint: earPaint(S, side, er),
    }));
  }
  yield 'head';

  // ---- antlers
  if (S.antler) { addAntlers(body, S, bi('head')); yield 'antlers'; }

  // ---- legs
  for (const fore of [true, false]) for (const [s, side] of [['L', 1], ['R', -1]] as const) {
    const L = fore ? S.fore : S.hind;
    const m = (p: V3) => mir(p, side);
    const pre = fore ? 'f' : 'h';
    const hip = fore ? m(L.mid1) : m(L.top), knee = fore ? m(L.mid2) : m(L.mid1), hock = fore ? undefined : m(L.mid2), sole = m(L.sole);
    const pts = hock ? [hip, knee, hock, sole] : [hip, knee, sole];
    const segL = pts.slice(1).map((p, k) => dist(p, pts[k]));
    const tot = segL.reduce((a, b) => a + b, 0);
    const tj = [0]; for (const l of segL) tj.push(tj[tj.length - 1] + l / tot);
    const rings = legRings('hoof', fore, L.r, tj, segL, L.hoofH).map((r) => ({ ...r, r: r.r * (r.t < -0.15 ? (fore ? 0.85 : 0.8) : 1) }));
    const fetH = L.fet[1] - L.sole[1];
    const foot: FootSpec = { pad: L.hoofR, h: fetH / 1.6, nail: 'hoof', toes: [], noPad: true, toeAround: 6 };
    const bonesL = fore
      ? { parent: bi(pre + 'u' + s), up: bi(pre + 'l' + s), lo: bi(pre + 'm' + s), foot: bi(pre + 'f' + s) }
      : { parent: bi('pelvis'), up: bi(pre + 'u' + s), lo: bi(pre + 'l' + s), mid: bi(pre + 'm' + s), foot: bi(pre + 'f' + s) };
    const out = limb({ name: (fore ? 'fleg' : 'hleg') + s, side, hip, knee, hock, sole, tj, rings, foot, around: 12, levels: 1, rise: fore ? 0.14 : 0.1, bones: bonesL, paint: legPaint(S, fore, side), clawPaint: hoofPaint, k: 1.0 });
    body.add(out.skin);
    body.add(hoof({ name: 'hoof' + (fore ? 'F' : 'H') + s, sole, r: L.hoofR, h: L.hoofH, side, bone: bi(pre + 'f' + s), cleft: true, dew: true, paint: hoofPaint, around: 10 }));
    yield 'leg';
  }

  // ---- the tail
  const tailBones = [0, 1, 2].map((k) => bi('tail' + k));
  const T0 = B.tail[0], TP = curve([add(T0, [0, 0.01, 0.03]), ...B.tail], 9);
  const tailSkin = chainSkin(B.tail, tailBones, 0.4);
  const TF = spineFrame(TP);
  body.add(stalk({
    name: 'tail', path: TP, around: 8, capS: true, capE: true, levels: 1, k: 1.2,
    r: (t) => S.tailR * (S.species === 'deer' ? 0.75 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.9)) : 1 - t * 0.6),
    sec: (a) => (S.species === 'deer' ? 0.55 + 0.45 * Math.abs(Math.sin(a)) : 1), // a flat flag
    skin: (p) => (dist(p, T0) < 0.02 ? [bi('pelvis'), 0.5, tailBones[0], 0.5] : tailSkin(p)), paint: coatPaint(S, TF, 'tail'),
  }));

  // ---- the moose's bell: a hairy flap of skin hanging from the throat
  if (S.bell) {
    const thr = skullPt(S, 0.6, 6, 1, -0.02).p;
    const at: V3 = [0, thr[1] - 0.04, thr[2] - 0.05];
    const bl = S.male ? 0.3 : 0.16;
    body.add(stalk({
      name: 'bell', path: curve([add(at, [0, 0.03, 0.02]), add(at, [0, -bl * 0.4, -0.02]), add(at, [0, -bl * 0.8, -0.05]), add(at, [0, -bl, -0.04])], 6), around: 8, capS: true, capE: true, levels: 1, k: 1.0,
      r: (t) => (0.05 - t * 0.025) * (S.male ? 1 : 0.8), sec: (a) => 0.35 + 0.65 * Math.abs(Math.cos(a)), up: [1, 0, 0],
      skin: () => [bi('neck2'), 1], paint: coatPaint(S, F, 'trunk'),
    }));
  }
  yield 'body';

  // ---- the fur page: where shell fur grows and how long
  const sNeck = S.bones.neck;
  const zones = furZones([
    { piece: /^(trunk|tail|bell)/, len: 0.42, den: 0.95, clump: 0.45, tip: 0.55 },
    { piece: /^(fleg|hleg)/, len: 0.3, den: 0.9, clump: 0.3 },
    { piece: /^(fleg|hleg)/, a: [0, 0, 0], b: [0, 0.12 * (S.species === 'moose' ? 1.8 : 1), 0], r: 0.6, bare: true, facing: [0, 0, 0] },
    { piece: /^(skull|jaw)/, len: 0.16, den: 0.8, clump: 0.25 },
    { piece: /^ear/, len: 0.3, den: 0.8, clump: 0.6, tip: 0.8 },
    // longer: the neck (a buck's swollen rut neck, a moose's mane along the top of the hump and neck), the deer's flag
    { piece: /^trunk/, a: [0, sNeck[1], sNeck[2] - 0.05], b: [0, S.bones.neck2[1], S.bones.neck2[2]], r: S.species === 'moose' ? 0.3 : 0.14, len: S.species === 'moose' ? 0.9 : 0.62, clump: 0.6, tip: 0.6 },
    ...(S.species === 'moose' ? [{ piece: /^trunk/, a: [0, 2.0, 0.42] as V3, b: [0, 1.95, 0.85] as V3, r: 0.22, len: 1.0, clump: 0.75, tip: 0.6, facing: [0, 1, 0.2] as V3, min: 0.2 }] : []),
    { piece: /^tail/, len: S.species === 'deer' ? 0.85 : 0.5, clump: 0.7, tip: 0.8 },
    { piece: /^bell/, len: 1.0, clump: 0.85, tip: 0.5 },
    // bare: the nose, the lips, inside the ears' cups
    { piece: /^skull/, a: add(S.bones.head, scl(headFwd(S), hd.hl * 0.78)), r: hd.hl * 0.22, bare: true, len: 0 },
  ]);
  const fur: FurPaint = (p, n, piece, s) => (/^(hoof|antler|tine|palm|eye|lid|mouth)/.test(piece) ? null : zones(p, n, piece, s));
  const built = yield* body.buildGen({ den: S.den, maxScale: 2.2, budget: S.budget, fur });
  const fl = S.fore, hl = S.hind;
  return {
    species, male, geo: built.geo, tex: built.tex, sd: built.sd, fur: built.fur, bones, tris: built.tris, den: body.den, furLen: S.furLen,
    dims: {
      withers: S.trunk.reduce((m, st) => Math.max(m, st.c[1] + st.s[1]), 0), length: B.head[2] + hd.hl * 0.8 - B.tail[0][2],
      chestY: B.chest[1] - (S.species === 'deer' ? 0.1 : 0.2), chestZ: (fl.top[2] + fl.mid1[2]) * 0.5 - (S.species === 'deer' ? 0.04 : 0.08),
      headLen: hd.hl, width: Math.max(...S.trunk.map((st) => st.s[0])), hoofR: hl.hoofR,
    },
  };
}
const lerpV = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** build a model in ~30 ms slices */
export function buildCervidAsync(species: Species, male: boolean): Promise<CervidModel> { return runAsync(cervidGen(species, male)); }
export { cervidSpecFor };
function cervidSpecFor(species: Species, male: boolean): CervidSpec { return species === 'deer' ? DEER(male) : MOOSE(male); }
void nz3; void HORN; void INK; void cl;

// ------------------------------------------------------------------------------------------------ the trophy
/** a pine plaque: grain down the board, a darker bevel round the edge */
function plaquePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.lightK = 0.6;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const g = ((y * 70 + nz2(x * 12, y * 3) * 2.4 + nz2(x * 40, y * 9) * 0.4) % 1 + 1) % 1;
    const edge = Math.abs(N[i * 3 + 2]) < 0.6;
    px.put(i, edge ? RP('heart') : RP('hickory'), (edge ? 3.2 : 4.2) - (g < 0.12 ? 1.2 : g < 0.2 ? 0.5 : 0) + (h3(Math.floor(x * 400), Math.floor(y * 90), 3) < 0.04 ? -1 : 0));
    px.rough[i] = 110; void z;
  }
  px.creaseInk(1.2, { dark: 1, lit: 0.6 });
  px.flush();
}
function skullCapPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P;
  px.lightK = 0.7;
  for (let i = 0; i < px.n; i++) { const c = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], 0.008, 4); px.put(i, RP('bone'), 3.6 + ((c.id % 3) - 1) * 0.3 - ((c.f2 - c.f1) < px.mpt * 0.6 ? 1.2 : 0)); px.rough[i] = 160; }
  px.creaseInk(1.2, { dark: 1, lit: 0.5 });
  px.flush();
}
export interface TrophyModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; size: THREE.Vector3 }
/** a European mount: the antlers on a sawn skull cap, screwed to a pine plaque. Origin at the plaque's back centre,
 *  +z out from the wall, +y up; the antlers rise from the cap and sweep forward (out of the wall). */
export function* trophyGen(species: Species): Generator<string | void, TrophyModel> {
  const S = species === 'deer' ? DEER(true) : MOOSE(true);
  const body = new Body(512);
  body.seed = S.seed + 9;
  // the cap: a dome over the pedicles
  const c0 = skullPt(S, 1.1, 0, 1, 0).p, w = S.head.hw * 0.62, h = S.head.hh * 0.32;
  const capSt: Station[] = [-1, -0.5, 0, 0.5, 1].map((f) => ({ c: [0, c0[1] - h * 0.4, c0[2] + f * S.head.hl * 0.22] as V3, s: [w * (1 - f * f * 0.45), h * (1 - f * f * 0.5)] as [number, number], p: 'round' }));
  body.add(trunk({ name: 'cap', stations: capSt, tween: 1, capS: true, capE: true, k: 1.2, levels: 1, skin: () => [0, 1], paint: skullCapPaint }));
  addAntlers(body, S, 0);
  // the plaque behind (below, in creature space: the cap sits on it; the board stands in the y/z plane of the skull)
  const pw = species === 'deer' ? 0.16 : 0.3, ph = species === 'deer' ? 0.24 : 0.42, th = 0.022;
  const pc: V3 = [0, c0[1] - h * 0.9 - th, c0[2]];
  const shield = (f: number) => 1 - 0.35 * Math.pow(Math.abs(f), 2.4) - (f > 0.7 ? (f - 0.7) * 1.2 : 0);
  const plSt: Station[] = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((f) => ({ c: [0, pc[1], pc[2] + f * ph] as V3, s: [pw * shield(f), th] as [number, number], p: 'flat' }));
  body.add(trunk({ name: 'plaque', stations: plSt, tween: 1, capS: true, capE: true, k: 1.0, levels: 1, rings: [{ at: 0, s: 2 }, { at: 5, s: 2 }], skin: () => [0, 1], paint: plaquePaint }));
  const out = yield* body.buildGen({ den: species === 'deer' ? 380 : 220, maxScale: 2, budget: 9000 });
  // stand it up: the plaque (lying under the cap, in x/z) turns to hang on a wall (x/y), the antlers out (+z) and the
  // beams' forward sweep up the wall
  const geo = out.geo;
  geo.translate(-pc[0], -pc[1] + th, -pc[2]);
  geo.rotateX(Math.PI / 2); geo.rotateZ(Math.PI);
  geo.computeBoundingBox();
  const size = geo.boundingBox!.getSize(new THREE.Vector3());
  return { geo, tex: out.tex, sd: out.sd, size };
}
