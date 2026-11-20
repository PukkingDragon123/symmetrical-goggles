// Small wildlife models, built with the anatomy kit at a few hundred triangles each (cages at subdivision level 0 on a
// 256 page): a red squirrel and a snowshoe hare (one mammal builder), a raven, a grey jay, a black-capped chickadee
// and a ruffed grouse (one bird builder). Every species is one skinned geometry shared by its pooled instances.
// v5 (sculpted): real anatomy at the same small budget. A mammal's body is rings with an anatomical section at every
// station (the haunches' thigh masses low on the flanks, a pinched loin, the deep ribcage, the shoulders' blades, the
// neck, a cranium wide at the eyes with the sockets pressed in, cheeks, a tapering muzzle and a nose); its legs are
// jointed (the upper leg's muscle, the elbow or knee, a thin shank, the wrist or hock, a paw with toes forward); its
// ears are cupped flaps with a rim and a bowl; its eyes sit in the sockets as little wet eyeballs. A bird is a keeled
// breast, a round crown over sunken eyes, a two-part beak (a hooked upper mandible), wings as rayed blades with the
// primaries fanned to a point, a fanned tail, scaly legs with toes. Coats are painted, not noised: big masses first (a
// darker back, a pale belly, a face mask, caps and bibs), then strokes along the lie of the fur and shingled feathers,
// then accents (eye rings, nose shine, claw tips, glints).
// Creature space: metres, +z forward, +y up, ground y = 0.
import * as THREE from 'three';
import { Body, stalk, curve, fin, Px, RP, h3, cl, cell3, newCM, tube, eyeball, runAsync, runSync, type V3, type Wt, type Chart, type Piece, type Ring } from '../anatomy';
import type { BoneDef } from '../rig';
import { loader } from '../cache';
import { furZones } from '../fur/paint';
import { cupEar, eyePaint, strokes, formLight, alongFlow } from './organic';

export type Species = 'squirrel' | 'hare' | 'raven' | 'jay' | 'chickadee' | 'grouse';
export const BIRDS: Species[] = ['raven', 'jay', 'chickadee', 'grouse'];
export interface WildModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture; bones: BoneDef[]; tris: number }
export const WILD_MODEL_VERSION = 'wild@5';
/** fur lengths (m) at fur-page length 1: the squirrel's coat and the hare's (src/creatures/fur) */
export const WILD_FUR_LEN: Partial<Record<Species, number>> = { squirrel: 0.022, hare: 0.026 };

type Paint = (c: Chart, p: Piece, b: Body) => void;
const B = (b: BoneDef[], name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, pos: pos as [number, number, number] });
const idx = (b: BoneDef[], n: string) => b.findIndex((x) => x.name === n);
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const G = (v: number, c: number, w: number) => Math.exp(-((v - c) * (v - c)) / (w * w));
const ang = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/** a station of a sculpted body: centre (y, z), half width and height, squareness, bumps by angle round the ring
 *  ([deg from the top (0) round the +x side to the belly (180), amplitude x the half size, width deg]); mirrored */
interface St { z: number; y: number; w: number; h: number; sq?: number; b?: [number, number, number][] }
/** a body of rings (N round) through the stations, the seam under the belly; caps at both ends */
function sculptBody(st: St[], N: number): { m: ReturnType<typeof newCM>; g: ReturnType<typeof tube> } {
  const m = newCM();
  const rings: Ring[] = st.map((s) => {
    const pts: number[][] = [];
    for (let j = 0; j < N; j++) {
      const a = Math.PI + (j / N) * Math.PI * 2, deg = (((a * 180) / Math.PI) % 360 + 360) % 360, ad = deg > 180 ? 360 - deg : deg; // 0 top .. 180 belly, mirrored
      const sx = Math.sin(a), cy = Math.cos(a), e = 2 / (s.sq ?? 2);
      let k = 1; for (const [bd, amp, bw] of s.b ?? []) k += amp * Math.exp(-((ang((ad * Math.PI) / 180, (bd * Math.PI) / 180) / ((bw * Math.PI) / 180)) ** 2));
      pts.push([Math.sign(sx) * Math.pow(Math.abs(sx), e) * s.w * k, Math.sign(cy) * Math.pow(Math.abs(cy), e) * s.h * k]);
    }
    return { c: [0, s.y, s.z], x: [1, 0, 0], y: [0, 1, 0], pts };
  });
  const g = tube(m, rings, { tag: 0, capS: true, capE: true });
  return { m, g };
}

// ------------------------------------------------------------------------------------------------ mammals
interface Leg { sh: V3; el: V3; wr: V3; toe: V3; r: number; foot?: number }
interface MammalSpec {
  st: St[];
  /** the head bone sits at this station's centre, the neck blends over the one before */
  headSt: number;
  fore: Leg; hind: Leg;
  ear: { at: V3; dir: V3; face: V3; len: number; wid: number; cup: number };
  eye: V3; eyeR: number;
  tail: V3[]; tailR: (t: number) => number;
  /** the coat by zone: (point, normal, eye distance) -> [ramp, step]; and the fur's lie */
  coat: (p: V3, n: V3, e: number) => [number[], number, number?];
  furLen: number;
}
const RUST = RP('rust'), BONE = RP('bone'), INK = RP('ink'), FUR = RP('fur'), SNOW = RP('snow'), STONE = RP('stone'), BASALT = RP('basalt'), SOIL = RP('soil'), OCHRE = RP('ochre'), SLATE = RP('slate');
const HIDE = RP('hide'), PAPER = RP('paper'), VIOLET = RP('violet'), CLAY = RP('clay'), HORN = RP('horn');
const MAMMALS: Record<'squirrel' | 'hare', MammalSpec> = {
  squirrel: {
    st: [
      { z: -0.108, y: 0.077, w: 0.016, h: 0.017 },
      { z: -0.094, y: 0.08, w: 0.036, h: 0.038, b: [[25, 0.08, 30]] }, // the rump
      { z: -0.066, y: 0.083, w: 0.048, h: 0.046, sq: 2.3, b: [[115, 0.16, 32], [20, 0.05, 25]] }, // the haunches: the thigh mass low on the flank
      { z: -0.033, y: 0.086, w: 0.037, h: 0.041, b: [[180, -0.08, 40]] }, // the loin, pinched
      { z: 0.002, y: 0.088, w: 0.042, h: 0.045, sq: 2.2, b: [[150, 0.06, 40]] }, // the ribcage
      { z: 0.036, y: 0.093, w: 0.039, h: 0.044, b: [[40, 0.1, 22], [180, 0.06, 30]] }, // the shoulder blades, the deep chest
      { z: 0.064, y: 0.104, w: 0.026, h: 0.031, b: [[180, 0.06, 40]] }, // the neck
      { z: 0.087, y: 0.115, w: 0.03, h: 0.031 }, // the back of the skull
      { z: 0.11, y: 0.12, w: 0.032, h: 0.029, b: [[70, -0.14, 20], [110, 0.1, 22]] }, // the cranium at the eyes: the sockets pressed in, the cheeks below
      { z: 0.132, y: 0.115, w: 0.024, h: 0.022, sq: 2.3, b: [[100, 0.12, 30], [0, -0.06, 30]] }, // the muzzle's root, the whisker pads
      { z: 0.152, y: 0.108, w: 0.0165, h: 0.016, b: [[100, 0.1, 30]] },
      { z: 0.168, y: 0.104, w: 0.0085, h: 0.0095 }, // the nose
      { z: 0.175, y: 0.103, w: 0.003, h: 0.0035 },
    ],
    headSt: 7,
    fore: { sh: [0.03, 0.095, 0.04], el: [0.033, 0.06, 0.03], wr: [0.03, 0.02, 0.047], toe: [0.03, 0.004, 0.063], r: 0.0122 },
    hind: { sh: [0.036, 0.085, -0.065], el: [0.047, 0.055, -0.03], wr: [0.04, 0.02, -0.088], toe: [0.038, 0.004, -0.035], r: 0.015, foot: 1 },
    ear: { at: [0.019, 0.137, 0.1], dir: [0.3, 1, -0.25], face: [0.4, 0.1, 1], len: 0.03, wid: 0.0095, cup: 0.5 },
    eye: [0.025, 0.126, 0.12], eyeR: 0.0068,
    tail: [[0, 0.08, -0.1], [0, 0.11, -0.16], [0, 0.18, -0.19], [0, 0.25, -0.17], [0, 0.28, -0.13]], tailR: (t) => 0.03 * (0.55 + Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.6),
    // a red squirrel: rust-red back and tail, the flanks a touch greyer, a cream belly and throat, a pale eye ring,
    // dark ear tufts, the nose dark
    coat: (p, n, e) => {
      if (e < 0.0093) return [PAPER, 3.6, 160];
      if (p[2] > 0.166) return [INK, 1.4, 70];
      if (n[1] < -0.35 && p[2] > -0.085 && p[2] < 0.15) return [PAPER, 3.6 - (p[2] < -0.02 ? 0.5 : 0)];
      if (p[2] > 0.1 && n[1] < -0.1) return [PAPER, 3.3];
      return [RUST, 3.4 + (n[1] > 0.5 ? 0.5 : 0) + (p[1] > 0.2 ? 0.4 : 0) - (Math.abs(p[0]) > 0.034 && n[1] < 0.2 && p[2] < 0.06 ? 0.7 : 0)];
    },
    furLen: 0.02,
  },
  hare: {
    st: [
      { z: -0.178, y: 0.135, w: 0.03, h: 0.032 },
      { z: -0.158, y: 0.145, w: 0.065, h: 0.068, b: [[30, 0.06, 30]] }, // the round rump
      { z: -0.118, y: 0.15, w: 0.083, h: 0.08, sq: 2.3, b: [[115, 0.18, 32]] }, // the great haunches
      { z: -0.07, y: 0.152, w: 0.07, h: 0.074, b: [[180, -0.06, 40]] }, // the loin
      { z: -0.02, y: 0.152, w: 0.074, h: 0.078, sq: 2.2, b: [[150, 0.05, 40]] }, // the ribs
      { z: 0.035, y: 0.155, w: 0.064, h: 0.074, b: [[40, 0.08, 22], [180, 0.06, 30]] }, // the shoulders, the chest
      { z: 0.08, y: 0.172, w: 0.044, h: 0.05, b: [[180, 0.05, 40]] }, // the neck
      { z: 0.12, y: 0.192, w: 0.046, h: 0.05 }, // the back of the skull
      { z: 0.158, y: 0.2, w: 0.047, h: 0.046, b: [[70, -0.12, 20], [110, 0.1, 22]] }, // the cranium at the eyes, the sockets in
      { z: 0.195, y: 0.191, w: 0.037, h: 0.036, sq: 2.3, b: [[100, 0.12, 30], [0, -0.04, 30]] }, // the muzzle and the cheeks
      { z: 0.222, y: 0.18, w: 0.026, h: 0.027, b: [[100, 0.08, 30]] },
      { z: 0.24, y: 0.174, w: 0.013, h: 0.015 }, // the nose
      { z: 0.248, y: 0.172, w: 0.004, h: 0.005 },
    ],
    headSt: 7,
    fore: { sh: [0.045, 0.15, 0.05], el: [0.05, 0.1, 0.035], wr: [0.045, 0.03, 0.068], toe: [0.045, 0.006, 0.095], r: 0.0175 },
    hind: { sh: [0.06, 0.14, -0.11], el: [0.078, 0.09, -0.06], wr: [0.064, 0.03, -0.155], toe: [0.062, 0.006, -0.03], r: 0.026, foot: 1.6 },
    ear: { at: [0.022, 0.232, 0.142], dir: [0.18, 1, -0.45], face: [0.5, 0.15, 1], len: 0.11, wid: 0.021, cup: 0.55 },
    eye: [0.038, 0.207, 0.163], eyeR: 0.0095,
    tail: [[0, 0.17, -0.17], [0, 0.19, -0.2], [0, 0.2, -0.215]], tailR: () => 0.022,
    // a snowshoe hare in its summer coat: warm brown with a darker back, white belly, chin, tail and feet, ear tips
    // black-edged, a pale eye ring
    coat: (p, n, e) => {
      if (e < 0.0125) return [SNOW, 3.6, 160];
      if (p[2] > 0.238) return [HIDE, 2.2, 90];
      if (p[1] > 0.3 && p[2] > 0.1) return [INK, 1.4];
      if (n[1] < -0.3 || p[1] < 0.05 || p[2] < -0.2) return [SNOW, 4.2];
      if (p[2] > 0.2 && n[1] < 0.1) return [SNOW, 3.8];
      return [FUR, 3.4 + (n[1] > 0.5 ? -0.4 : 0.3) + (Math.abs(p[0]) > 0.06 && n[1] < 0.2 ? 0.4 : 0)];
    },
    furLen: 0.028,
  },
};
const WILD_FUR = {
  // a red squirrel: a short dense coat, ear tufts, and a huge bushy tail
  squirrel: furZones([{ piece: /^body/, len: 0.45, clump: 0.5, tip: 0.6 }, { piece: /^body/, a: [0, 0.104, 0.172], r: 0.02, bare: true }, { piece: /^body/, a: [0.025, 0.126, 0.12], r: 0.008, bare: true }, { piece: /^body/, a: [-0.025, 0.126, 0.12], r: 0.008, bare: true }, { piece: /^tail/, len: 1, clump: 0.8, tip: 0.7 }, { piece: /^ear/, len: 0.5, clump: 0.95, tip: 0.8 }, { piece: /^[fh]l/, len: 0.25 }, { piece: /^[fh]l/, y: [-1, 0.02], bare: true }]),
  // a snowshoe hare: thick soft fur everywhere, a cottony tail, big furred hind feet
  hare: furZones([{ piece: /^body/, len: 0.6, clump: 0.45, tip: 0.5 }, { piece: /^body/, a: [0, 0.174, 0.245], r: 0.02, bare: true }, { piece: /^body/, a: [0.038, 0.207, 0.163], r: 0.011, bare: true }, { piece: /^body/, a: [-0.038, 0.207, 0.163], r: 0.011, bare: true }, { piece: /^tail/, len: 1, clump: 0.7, tip: 0.8 }, { piece: /^ear/, len: 0.2 }, { piece: /^[fh]l/, len: 0.45 }]),
};

/** a mammal's coat: the zones (big masses), the fur's lie painted in strokes back along the body and down the flanks,
 *  the light on the form, the creases */
function coatPaint(S: MammalSpec, o: { tail?: boolean; leg?: boolean } = {}): Paint {
  return (ch, _p, b) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.75;
    const st = strokes(px, { flow: (p, n) => alongFlow(o.tail ? [0, 1, 0.2] : o.leg ? [0, -1, 0] : [p[0] * 4, -0.35, -1])(p, n), len: [2, 4], width: [1.3, 2], amp: 0.8, lift: 0.4, density: 0.9, seed: 5 + (o.tail ? 1 : 0) + (o.leg ? 2 : 0), apply: false });
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: V3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
      const e = Math.hypot(Math.abs(p[0]) - S.eye[0], p[1] - S.eye[1], p[2] - S.eye[2]);
      const [R, s, rough] = S.coat(p, n, o.leg || o.tail ? 1 : e);
      px.put(i, R, s + st.v[i] * (rough ? 0.2 : 1));
      px.rough[i] = rough ?? 225;
    }
    formLight(px, 0.6);
    px.creaseInk(0.7, { dark: 1, lit: 0.6 });
    px.flush();
  };
}
function* mammalGen(kind: 'squirrel' | 'hare'): Generator<string | void, WildModel> {
  const S = MAMMALS[kind], bones: BoneDef[] = [];
  const mid = S.st[4], hs = S.st[S.headSt], ns = S.st[S.headSt - 1];
  B(bones, 'root', null, [0, mid.y, mid.z]);
  B(bones, 'head', 'root', [0, ns.y, ns.z]);
  B(bones, 'tail0', 'root', S.tail[0]); B(bones, 'tail1', 'tail0', S.tail[Math.floor(S.tail.length / 2)]);
  for (const [n, s] of [['L', 1], ['R', -1]] as const) { B(bones, 'f' + n, 'root', mir(S.fore.sh, s)); B(bones, 'h' + n, 'root', mir(S.hind.sh, s)); }
  B(bones, 'earL', 'head', S.ear.at); B(bones, 'earR', 'head', mir(S.ear.at, -1));
  const body = new Body(256);
  const HEAD = idx(bones, 'head'), hz = hs.z;
  const paint = coatPaint(S);
  const { m, g } = sculptBody(S.st, 12);
  body.add({ name: 'body', m, grids: [g], levels: 0, k: 1.3, skin: (p: V3): Wt => (p[2] > hz ? [HEAD, 1] : p[2] > ns.z ? [HEAD, 0.6, 0, 0.4] : [0, 1]), paint } as Piece);
  yield 'body';
  for (const [n, s] of [['L', 1], ['R', -1]] as const) {
    // jointed legs: the upper leg's muscle, the elbow or knee, a thin shank, the wrist or hock, the paw
    for (const [L, nm] of [[S.fore, 'fl'], [S.hind, 'hl']] as [Leg, string][]) {
      const pts = [L.sh, L.el, L.wr, L.toe].map((q) => mir(q, s)), hind = nm === 'hl';
      const path = curve([add(pts[0], [0, 0.006, 0]), ...pts], 6);
      const bone = idx(bones, (hind ? 'h' : 'f') + n);
      body.add(stalk({ name: nm + n, path, around: 5, capE: true, levels: 0, k: 1, skin: () => [bone, 1], paint: coatPaint(S, { leg: true }),
        r: (t) => L.r * (t < 0.22 ? 1.25 - t * 0.8 : t < 0.5 ? 0.82 + 0.25 * G(t, 0.36, 0.06) : t < 0.8 ? 0.62 + 0.18 * G(t, 0.66, 0.05) : 0.7 * (L.foot ?? 0.9)) * (hind ? 1 : 1),
        sec: (a) => (Math.cos(a) > 0 ? 1 : 0.86) }));
    }
    const ea = mir(S.ear.at, s);
    body.add(cupEar({ name: 'ear' + n, root: add(ea, [0, -S.ear.len * 0.12, 0]), dir: mir(S.ear.dir, s), face: mir(S.ear.face, s), len: S.ear.len, wid: S.ear.wid, th: S.ear.wid * 0.18, cup: S.ear.cup, lean: S.ear.len * 0.08, skin: () => [idx(bones, 'ear' + n), 1], levels: 0, around: 6, rings: 3, k: 1.2,
      paint: (ch, _p, b) => {
        const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
        for (let i = 0; i < px.n; i++) {
          const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], t = Math.hypot(p[0] - ea[0], p[1] - ea[1], p[2] - ea[2]) / S.ear.len, inner = N[i * 3] * s * S.ear.face[0] + N[i * 3 + 2] * S.ear.face[2] > 0.2;
          if (inner) px.put(i, HIDE, 3.4 + (t > 0.3 && t < 0.85 ? 0.8 : 0) - (t < 0.15 ? 1.4 : 0));
          else { const [R, st] = S.coat(p, [0, 0.5, 0], 1); px.put(i, t > 0.86 ? INK : R, t > 0.86 ? 1.4 : st); }
          px.rough[i] = 210;
        }
        formLight(px, 0.5); px.creaseInk(0.8, { dark: 1, lit: 0.6 }); px.flush();
      } }));
    // the eye: a little wet eyeball in its socket
    const eax = nrm([s * 0.85, 0.15, 0.55]), ec = add(mir(S.eye, s), scl(eax, S.eyeR * 0.05));
    const eye = body.add(eyeball({ name: 'eye' + n, c: ec, ax: eax, r: S.eyeR, bone: HEAD, iris: SOIL, pupil: 'round', levels: 0, around: 6, k: 2 }));
    eye.paint = eyePaint({ c: ec, ax: eax, side: s, irisA: 0.9, iris: kind === 'hare' ? SOIL : INK, pupil: 'round', pupilR: 0.55, sclera: null, glint: [0.3, 0.45], shine: 120 });
  }
  yield 'legs';
  const t0 = idx(bones, 'tail0'), t1 = idx(bones, 'tail1');
  body.add(stalk({ name: 'tail', path: curve(S.tail, kind === 'squirrel' ? 7 : 3), r: S.tailR, around: 6, capS: true, capE: true, levels: 0, k: 1, skin: (p) => (p[1] > S.tail[Math.floor(S.tail.length / 2)][1] ? [t1, 1] : [t0, 1]), paint: coatPaint(S, { tail: true }) }));
  const out = yield* body.buildGen({ den: 900, maxScale: 2, fur: WILD_FUR[kind] });
  return { geo: out.geo, tex: out.tex, sd: out.sd, fur: out.fur, bones, tris: out.tris };
}

// ------------------------------------------------------------------------------------------------ birds
interface BirdSpec {
  L: number; fat: number; beak: number; beakR: number; hook: number; tail: number; wing: number; crest?: number;
  /** the plumage by zone: z along the body (x L), y above the body's centre (x L), the normal -> [ramp, step, rough?] */
  coat: (z: number, y: number, x: number, n: V3) => [number[], number, number?];
  beakCol: [number[], number]; legCol: [number[], number]; iris: number[];
  /** feather scale size (x L) and bars across the feathers */
  scale: number; bars?: number;
}
const BIRD: Record<'raven' | 'jay' | 'chickadee' | 'grouse', BirdSpec> = {
  // a raven: glossy black, blue-violet where the light catches the feathers, a shaggy throat, a heavy hooked beak
  raven: { L: 0.6, fat: 0.85, beak: 0.075, beakR: 0.02, hook: 0.35, tail: 0.32, wing: 1.1, scale: 0.05, beakCol: [BASALT, 1.4], legCol: [BASALT, 1.2], iris: INK,
    coat: (_z, _y, _x, n) => [n[1] > 0.45 ? SLATE : BASALT, 1.6 + (n[1] > 0.45 ? 0.6 : 0), 95] },
  // a grey jay: a dark grey cap over the nape, a pale grey-white face and throat, a soft grey back, paler below
  jay: { L: 0.28, fat: 1.15, beak: 0.024, beakR: 0.0085, hook: 0.15, tail: 0.42, wing: 1.0, scale: 0.06, beakCol: [INK, 1], legCol: [INK, 1.4], iris: INK,
    coat: (z, y, _x, n) => { if (z > 0.2 && y > 0.1 && n[2] < 0.7) return [BASALT, 1.8]; if (z > 0.18 || (n[1] < -0.2 && z > 0.05)) return [SNOW, 4.2]; if (n[1] < -0.3) return [SNOW, 3.2]; return [STONE, 3.3 + (n[1] > 0.4 ? 0.4 : 0) - (z < -0.25 ? 0.6 : 0)]; } },
  // a black-capped chickadee: a black cap and bib, white cheeks, a grey back and wings, buff flanks
  chickadee: { L: 0.13, fat: 1.3, beak: 0.01, beakR: 0.0036, hook: 0.05, tail: 0.45, wing: 0.95, scale: 0.08, beakCol: [INK, 1], legCol: [STONE, 2], iris: INK,
    coat: (z, y, _x, n) => { if (z > 0.2 && (y > 0.13 || (n[1] < -0.1 && z > 0.28 && y < 0.1))) return [INK, 1.4]; if (z > 0.2) return [PAPER, 4.2]; if (n[1] < -0.3) return [Math.abs(z) < 0.1 ? PAPER : OCHRE, 4]; return [STONE, 3.4 + (n[1] > 0.5 ? 0.5 : 0) - (z < -0.2 ? 0.8 : 0)]; } },
  // a ruffed grouse: mottled brown barred with dark and buff, paler barred breast, the black ruff at the neck's sides,
  // a banded tail with the dark band near its tip, a little crest
  grouse: { L: 0.45, fat: 1.2, beak: 0.022, beakR: 0.0095, hook: 0.3, tail: 0.38, wing: 0.85, crest: 0.04, scale: 0.055, bars: 1, beakCol: [SOIL, 1.6], legCol: [SOIL, 2.6], iris: SOIL,
    coat: (z, y, x, n) => { if (z > 0.17 && z < 0.29 && Math.abs(x) > 0.05 && y < 0.14 && n[1] < 0.4) return [INK, 1.2]; return [n[1] < -0.3 ? BONE : z < -0.3 ? CLAY : FUR, n[1] < -0.3 ? 3.4 : 3.1]; } },
};
function* birdGen(kind: 'raven' | 'jay' | 'chickadee' | 'grouse'): Generator<string | void, WildModel> {
  const S = BIRD[kind], L = S.L, f = S.fat, bones: BoneDef[] = [];
  const cy = L * (kind === 'grouse' ? 0.2 : 0.23);
  B(bones, 'root', null, [0, cy, 0]);
  B(bones, 'head', 'root', [0, cy + L * 0.12, L * 0.26]);
  B(bones, 'wingL', 'root', [L * 0.08 * f, cy + L * 0.06, L * 0.1]); B(bones, 'wingR', 'root', [-L * 0.08 * f, cy + L * 0.06, L * 0.1]);
  B(bones, 'tail', 'root', [0, cy + L * 0.02, -L * 0.22]);
  B(bones, 'legs', 'root', [0, cy - L * 0.08, L * 0.02]);
  const body = new Body(256);
  const r = L * 0.12 * f, hb = idx(bones, 'head');
  const eyeP: V3 = [r * 0.5, cy + L * 0.165, L * 0.315], eyeR = Math.max(0.0026, L * 0.016);
  /** the plumage: masses by zone, shingled feathers (scales) with the bars of the species, strokes along the lie */
  const plumage = (part: 'body' | 'wing' | 'tail'): Paint => (ch, _p, b) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.7;
    const sk = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: V3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
      const z = p[2] / L, y = (p[1] - cy) / L;
      // the eye ring: a thin pale or dark rim round the eye (bare skin), the dark eye stripe of some
      const e = Math.hypot(Math.abs(p[0]) - eyeP[0], p[1] - eyeP[1], p[2] - eyeP[2]);
      let [R, st, rough] = part === 'wing' ? S.coat(-0.05, 0.05, 0, [0, 1, 0]) : part === 'tail' ? S.coat(-0.4, 0, 0, [0, 1, 0]) : S.coat(z, y, p[0] / L, n);
      if (part === 'body' && L <= 0.35 && e < eyeR * 0.85) { R = e < eyeR * 0.3 && p[1] > eyeP[1] ? PAPER : INK; st = e < eyeR * 0.3 && p[1] > eyeP[1] ? 5 : 0.4; sk[i] = 0; px.put(i, R, st); px.rough[i] = 40; continue; }
      if (part === 'body' && e < eyeR * 1.45) { R = kind === 'grouse' ? SOIL : kind === 'raven' ? BASALT : INK; st = kind === 'grouse' ? 1.6 : 1; sk[i] = 0; }
      else sk[i] = 1;
      if (part === 'wing') { const d = Math.abs(p[0]) / (L * 0.55 * S.wing); st -= d > 0.62 ? 0.8 : 0; if (kind === 'jay' && d > 0.55) { R = STONE; st = 2.6; } }
      if (part === 'tail' && kind === 'grouse') { const tz = (-p[2] / L - 0.18) / S.tail; if (tz > 0.72 && tz < 0.82) { R = INK; st = 1.2; } else if (tz > 0.82) { R = BONE; st = 3.6; } }
      if (part === 'tail' && kind === 'chickadee' && Math.abs(p[0]) > L * 0.04) st -= 0.5;
      // grouse bars and mottling: dark bars across the feathers, buff spots
      if (S.bars && (n[1] > -0.3 || part !== 'body')) { const c = cell3(p[0], p[1], p[2], L * 0.05, 7); if (Math.abs(Math.sin(p[2] * 140 / L * 0.45 + p[1] * 60)) < 0.3) st -= 1; if ((c.id % 5) === 0 && c.f1 < L * 0.012) { R = BONE; st = 3.8; } }
      px.put(i, R, st); px.rough[i] = rough ?? 225;
    }
    const sz = L * S.scale * (part === 'body' ? 1 : 1.5);
    px.scales({ size: sz, kind: 'shield', flow: part === 'tail' ? 1 : -1, len: part === 'body' ? 1.6 : 2.2, ink: kind === 'raven' ? 1.2 : 1.5, lit: kind === 'raven' ? 1.4 : 0.8, mask: (i) => sk[i] });
    // the raven's gloss: blue-violet where the feather tips turn to the sky
    if (kind === 'raven') for (let i = 0; i < px.n; i++) if (px.gb.N[i * 3 + 1] > 0.55 && h3(i, 7, 3) < 0.18) { px.rampI[i] = px.ramp(VIOLET); px.step[i] = 1.6; }
    strokes(px, { flow: (pp, nn) => alongFlow(part === 'wing' ? [Math.sign(pp[0]), 0, -0.6] : [0, -0.2, -1])(pp, nn), len: [2, 4], width: [1.2, 2], amp: 0.5, density: 0.6, seed: 13 });
    formLight(px, 0.6);
    px.creaseInk(0.8, { dark: 1, lit: 0.6 });
    px.flush();
  };
  // the body: tail root, rump, belly, the keeled breast, the neck, the crown over the sunken eyes, the beak's base
  const sts: St[] = [
    { z: -L * 0.22, y: cy + L * 0.02, w: r * 0.35, h: r * 0.25 },
    { z: -L * 0.14, y: cy, w: r * 0.72, h: r * 0.66 },
    { z: -L * 0.03, y: cy - r * 0.04, w: r * 0.98, h: r * 1.04, b: [[180, 0.06, 40]] },
    { z: L * 0.07, y: cy + L * 0.015, w: r * 0.98, h: r * 1.06, b: [[180, 0.12, 26], [120, 0.04, 30]] }, // the breast over the keel
    { z: L * 0.16, y: cy + L * 0.08, w: r * 0.7, h: r * 0.78, b: [[180, 0.08, 30]] },
    { z: L * 0.23, y: cy + L * 0.125, w: r * 0.56, h: r * 0.6 }, // the neck
    { z: L * 0.29, y: cy + L * 0.15, w: r * 0.62, h: r * 0.6, b: S.crest ? [[0, 0.5, 18], [70, -0.1, 22]] : [[70, -0.12, 22], [110, 0.06, 22]] }, // the crown, the eyes in
    { z: L * 0.35, y: cy + L * 0.148, w: r * 0.46, h: r * 0.46, b: [[0, -0.05, 30]] },
    { z: L * 0.385, y: cy + L * 0.145, w: r * 0.26, h: r * 0.3 }, // the beak's root
  ];
  const { m, g } = sculptBody(sts, 9);
  body.add({ name: 'body', m, grids: [g], levels: 0, k: 1.3, skin: (p: V3): Wt => (p[2] > L * 0.24 ? [hb, 1] : p[2] > L * 0.17 ? [hb, 0.5, 0, 0.5] : [0, 1]), paint: plumage('body') } as Piece);
  // the beak: the upper mandible hooked over the lower, a ridge along its top
  const bz = L * 0.375, by = cy + L * 0.145;
  body.add(stalk({ name: 'beak', path: curve([[0, by + 0.0005, bz - L * 0.01], [0, by - S.beakR * 0.1, bz + S.beak * 0.45], [0, by - S.beakR * 0.35 - S.hook * S.beakR * 0.5, bz + S.beak * 0.9], [0, by - S.beakR * 0.5 - S.hook * S.beakR * 1.2, bz + S.beak * (1 - S.hook * 0.04)]], 5), r: (t) => S.beakR * (1 - t * 0.85) + 0.0004, sec: (a) => 0.52 + 0.48 * Math.abs(Math.cos(a)) + (Math.cos(a) > 0.85 ? 0.08 : 0), around: 6, capE: true, levels: 0, k: 1.5, skin: () => [hb, 1],
    paint: (ch, _p, b) => { const px = new Px(ch, b), N = px.gb.N; for (let i = 0; i < px.n; i++) { px.put(i, S.beakCol[0], S.beakCol[1] + (N[i * 3 + 1] > 0.5 ? 1 : 0)); px.rough[i] = 80; } px.glints(S.beakCol[0], { every: 0.6, size: L * 0.05 }); formLight(px, 0.5); px.creaseInk(0.8, { dark: 1, lit: 1 }); px.flush(); } }));
  // the eyes: wet beads in their sockets on the big birds; drawn into the head on the small ones
  if (L > 0.35) for (const s of [1, -1]) {
    const ax = nrm([s * 0.9, 0.12, 0.4]), ec = add(mir(eyeP, s), scl(ax, -eyeR * 0.55));
    const eye = body.add(eyeball({ name: 'eye' + (s > 0 ? 'L' : 'R'), c: ec, ax, r: eyeR, bone: hb, iris: S.iris, pupil: 'round', levels: 0, around: 5, k: 2 }));
    eye.paint = eyePaint({ c: ec, ax, side: s, irisA: 1.0, iris: S.iris, pupil: 'round', pupilR: 0.45, sclera: null, glint: [0.3, 0.45], shine: 60 });
  }
  yield 'body';
  // wings: rayed blades spread along x (the creature folds them back): the arm's coverts, the primaries fanning to a
  // pointed tip, the secondaries' trailing edge notched
  for (const [n, s] of [['L', 1], ['R', -1]] as const) {
    const span = L * 0.55 * S.wing, at: V3 = [s * L * 0.06 * f, cy + L * 0.07, L * 0.06];
    const wb = idx(bones, 'wing' + n), NR = 5;
    const roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
    for (let k = 0; k < NR; k++) {
      const t = k / (NR - 1);
      roots.push(add(at, [s * span * 0.42 * t, L * 0.008 * t, -L * 0.02 * t]));
      dirs.push(nrm([s * (0.25 + 0.75 * t * t), 0, -1 + t * 0.55]));
      lens.push(L * (0.16 + 0.1 * t + (t > 0.7 ? 0.08 : 0)) * (0.92 + 0.12 * h3(k, 3, 5)));
      side.push([0, 1, 0]);
    }
    body.add(fin({ name: 'wing' + n, roots, dirs, lens, side, ray: L * 0.006, web: L * 0.004, scallop: 0.16, steps: 1, skin: () => [wb, 1], paint: plumage('wing'), levels: 0, k: 1 }));
  }
  // the tail: a fan of feathers
  const tb = idx(bones, 'tail'), TR = 5, troots: V3[] = [], tdirs: V3[] = [], tlens: number[] = [];
  for (let k = 0; k < TR; k++) { const t = k / (TR - 1) - 0.5; troots.push([t * L * 0.04, cy + L * 0.03, -L * 0.17]); tdirs.push(nrm([t * (kind === 'grouse' ? 0.9 : 0.5), -0.04, -1])); tlens.push(L * S.tail * (1 - Math.abs(t) * 0.18)); }
  body.add(fin({ name: 'tailF', roots: troots, dirs: tdirs, lens: tlens, side: troots.map(() => [0, 1, 0] as V3), ray: L * 0.005, web: L * 0.0035, scallop: 0.12, steps: 1, skin: () => [tb, 1], paint: plumage('tail'), levels: 0, k: 1 }));
  // legs: the drumstick in the feathers, the scaly tarsus, three toes forward and one back
  const lb = idx(bones, 'legs');
  const legPaint: Paint = (ch, _p, b) => { const px = new Px(ch, b); for (let i = 0; i < px.n; i++) { px.put(i, S.legCol[0], S.legCol[1]); px.rough[i] = 170; } px.pebbles(L * 0.012, { depth: 0.8 }); formLight(px, 0.4); px.flush(); };
  for (const s of [1, -1]) {
    const hip: V3 = [s * L * 0.04, cy - L * 0.06, L * 0.02], ank: V3 = [s * L * 0.045, L * 0.022, L * 0.035];
    body.add(stalk({ name: 'leg' + s, path: [hip, [s * L * 0.046, L * 0.09, L * 0.03], [s * L * 0.045, L * 0.05, L * 0.032], ank], r: (t) => (L * 0.011 + 0.0012) * (t < 0.3 ? 1.6 : t > 0.9 ? 1.25 : 1), around: 4, capE: true, levels: 0, k: 0.8, skin: () => [lb, 1], paint: legPaint }));
    for (const [a, len] of [[-0.45, 0.09], [0, 0.11], [0.45, 0.09]] as [number, number][]) {
      const d = nrm([Math.sin(a) * s, -0.05, Math.cos(a)]), tip = add(ank, scl(d, L * len));
      body.add(stalk({ name: 'toe' + s, path: [add(ank, [0, L * 0.005, 0]), add(add(ank, scl(d, L * len * 0.55)), [0, L * 0.004, 0]), add(tip, [0, -L * 0.003, 0])], r: (t) => (L * 0.006 + 0.0008) * (1 - t * 0.5), around: 3, capE: true, levels: 0, k: 0.6, skin: () => [lb, 1], paint: legPaint }));
    }
  }
  void HORN; void sub;
  const out = yield* body.buildGen({ den: Math.min(1400, 260 / L), maxScale: 2 });
  return { geo: out.geo, tex: out.tex, sd: out.sd, bones, tris: out.tris };
}

// ------------------------------------------------------------------------------------------------ loading
const gen = (k: Species) => (k === 'squirrel' || k === 'hare' ? mammalGen(k) : birdGen(k));
const bonesOf = (k: Species) => runSync(gen(k)).bones;
const loaders = new Map<Species, ReturnType<typeof loader<WildModel>>>();
function Ld(k: Species) {
  let l = loaders.get(k);
  if (!l) {
    l = loader<WildModel>(`${k}@${WILD_MODEL_VERSION}`, () => runAsync(gen(k)), (b, m) => ({ ...b, bones: (m.bones as BoneDef[]) ?? bonesOf(k), tris: m.tris as number }), (m) => ({ bones: m.bones, tris: m.tris }));
    loaders.set(k, l);
  }
  return l;
}
/** a species' shared model (built now if it was not preloaded) */
export function wildModel(k: Species): WildModel { const l = Ld(k); let m = l.get(); if (!m) { m = runSync(gen(k)); l.set(m); } return m; }
/** load every wildlife model without stalling (cache, else built in slices) */
/** preload the mammals' stand-in bodies (the birds are real models now: src/creatures/birds; the sculpted bird builders
 *  below only run if a test page forces one) */
export async function wildModelsAsync(o: { cache?: boolean } = {}): Promise<void> { for (const k of ['squirrel', 'hare'] as Species[]) await Ld(k).load(o); }
export { cl };
