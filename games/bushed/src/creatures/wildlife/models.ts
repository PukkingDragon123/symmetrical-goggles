// Small wildlife models, built with the anatomy kit at a few hundred triangles each (cages at subdivision level 0-1 on
// a 256 page): a red squirrel and a snowshoe hare (one mammal builder), a raven, a grey jay, a black-capped chickadee
// and a ruffed grouse (one bird builder). Every species is one skinned geometry shared by its pooled instances.
// Creature space: metres, +z forward, +y up, ground y = 0.
import * as THREE from 'three';
import { Body, trunk, stalk, curve, Px, RP, h3, cl, cell3, runAsync, runSync, type V3, type Chart, type Piece, type Station } from '../anatomy';
import type { BoneDef } from '../rig';
import { loader } from '../cache';
import { furZones } from '../fur/paint';

export type Species = 'squirrel' | 'hare' | 'raven' | 'jay' | 'chickadee' | 'grouse';
export const BIRDS: Species[] = ['raven', 'jay', 'chickadee', 'grouse'];
export interface WildModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; fur?: THREE.DataTexture; bones: BoneDef[]; tris: number }
export const WILD_MODEL_VERSION = 'wild@3';
/** fur lengths (m) at fur-page length 1: the squirrel's coat and the hare's (src/creatures/fur) */
export const WILD_FUR_LEN: Partial<Record<Species, number>> = { squirrel: 0.022, hare: 0.026 };
const WILD_FUR = {
  // a red squirrel: a short dense coat, ear tufts, and a huge bushy tail
  squirrel: furZones([{ piece: /^body/, len: 0.45, clump: 0.5, tip: 0.6 }, { piece: /^body/, a: [0, 0.1, 0.17], r: 0.02, bare: true }, { piece: /^tail/, len: 1, clump: 0.8, tip: 0.7 }, { piece: /^ear/, len: 0.5, clump: 0.95, tip: 0.8 }, { piece: /^[fh]l/, len: 0.25 }, { piece: /^[fh]l/, y: [-1, 0.02], bare: true }]),
  // a snowshoe hare: thick soft fur everywhere, a cottony tail, big furred hind feet
  hare: furZones([{ piece: /^body/, len: 0.6, clump: 0.45, tip: 0.5 }, { piece: /^body/, a: [0, 0.172, 0.25], r: 0.02, bare: true }, { piece: /^tail/, len: 1, clump: 0.7, tip: 0.8 }, { piece: /^ear/, len: 0.2 }, { piece: /^[fh]l/, len: 0.45 }]),
};

type Paint = (c: Chart, p: Piece, b: Body) => void;
const B = (b: BoneDef[], name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, pos: pos as [number, number, number] });
const idx = (b: BoneDef[], n: string) => b.findIndex((x) => x.name === n);

/** a zone painter: ramp and step from the point, its normal and the creature-space position */
function zonePaint(fn: (p: V3, n: V3) => [number[], number, number?], o: { fur?: { len: number; width: number; flow?: number }; glossy?: boolean } = {}): Paint {
  return (ch, _p, b) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.7;
    for (let i = 0; i < px.n; i++) {
      const [R, st, rough] = fn([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]);
      px.put(i, R, st); px.rough[i] = rough ?? (o.glossy ? 110 : 225);
    }
    if (o.fur) px.pelt({ len: o.fur.len, width: o.fur.width, flow: o.fur.flow ?? -1, tooth: 1.3, clump: 0.4, strands: 0.2 });
    px.creaseInk(1.2, { dark: 1, lit: 0.6 });
    px.flush();
  };
}
const eyeAt = (p: V3, e: V3, r: number) => Math.hypot(Math.abs(p[0]) - e[0], p[1] - e[1], p[2] - e[2]) < r;

// ------------------------------------------------------------------------------------------------ mammals
interface MammalSpec {
  st: { z: number; y: number; w: number; h: number; p?: string }[];
  legF: { at: V3; len: number; r: number }; legH: { at: V3; len: number; r: number; foot: number };
  ear: { at: V3; len: number; r: number; tilt: number };
  tail: V3[]; tailR: (t: number) => number;
  head: number; eye: V3;
  paint: (p: V3, n: V3, eye: (r: number) => boolean) => [number[], number, number?];
}
const RUST = RP('rust'), BONE = RP('bone'), INK = RP('ink'), FUR = RP('fur'), SNOW = RP('snow'), STONE = RP('stone'), BASALT = RP('basalt'), SOIL = RP('soil'), OCHRE = RP('ochre'), SLATE = RP('slate');
const MAMMALS: Record<'squirrel' | 'hare', MammalSpec> = {
  squirrel: {
    st: [{ z: -0.1, y: 0.075, w: 0.03, h: 0.03 }, { z: -0.07, y: 0.08, w: 0.044, h: 0.044 }, { z: -0.01, y: 0.085, w: 0.045, h: 0.045 }, { z: 0.045, y: 0.092, w: 0.038, h: 0.04 }, { z: 0.078, y: 0.108, w: 0.026, h: 0.028, p: 'neck' }, { z: 0.105, y: 0.118, w: 0.03, h: 0.031 }, { z: 0.135, y: 0.114, w: 0.025, h: 0.025 }, { z: 0.162, y: 0.106, w: 0.014, h: 0.014 }, { z: 0.176, y: 0.103, w: 0.005, h: 0.006 }],
    legF: { at: [0.026, 0.07, 0.045], len: 0.075, r: 0.011 }, legH: { at: [0.03, 0.07, -0.07], len: 0.085, r: 0.016, foot: 0.05 },
    ear: { at: [0.016, 0.142, 0.1], len: 0.03, r: 0.009, tilt: 0.25 },
    tail: [[0, 0.08, -0.1], [0, 0.11, -0.16], [0, 0.18, -0.19], [0, 0.25, -0.17], [0, 0.28, -0.13]], tailR: (t) => 0.03 * (0.6 + Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.6),
    head: 0.09, eye: [0.021, 0.124, 0.127],
    paint: (p, n, eye) => eye(0.0075) ? [INK, 0.3, 40] : eye(0.012) ? [BONE, 4.5] : n[1] < -0.35 && p[2] > -0.08 ? [BONE, 4.2 + h3(p[0] * 900, p[2] * 900, 1) * 0.4] : p[2] > 0.17 ? [INK, 1] : [RUST, 3.3 + (n[1] > 0.5 ? 0.6 : 0) + (p[1] > 0.2 ? 0.4 : 0) - (Math.abs(p[0]) > 0.035 && n[1] < 0.2 && p[2] < 0.06 ? 0.5 : 0)],
  },
  hare: {
    st: [{ z: -0.17, y: 0.14, w: 0.055, h: 0.05 }, { z: -0.12, y: 0.15, w: 0.08, h: 0.08 }, { z: -0.03, y: 0.15, w: 0.08, h: 0.08 }, { z: 0.06, y: 0.15, w: 0.065, h: 0.07 }, { z: 0.11, y: 0.18, w: 0.042, h: 0.045, p: 'neck' }, { z: 0.15, y: 0.2, w: 0.045, h: 0.048 }, { z: 0.2, y: 0.19, w: 0.034, h: 0.036 }, { z: 0.235, y: 0.176, w: 0.02, h: 0.022 }, { z: 0.25, y: 0.172, w: 0.007, h: 0.008 }],
    legF: { at: [0.04, 0.12, 0.07], len: 0.12, r: 0.016 }, legH: { at: [0.06, 0.14, -0.1], len: 0.15, r: 0.03, foot: 0.13 },
    ear: { at: [0.02, 0.235, 0.15], len: 0.11, r: 0.022, tilt: 0.45 },
    tail: [[0, 0.17, -0.17], [0, 0.19, -0.2], [0, 0.2, -0.215]], tailR: () => 0.022,
    head: 0.13, eye: [0.036, 0.205, 0.19],
    paint: (p, n, eye) => eye(0.01) ? [INK, 0.3, 40] : eye(0.015) ? [OCHRE, 3] : p[1] > 0.3 && p[2] > 0.1 ? [INK, 1.4] : (n[1] < -0.3 || p[1] < 0.05 || p[2] < -0.2) ? [SNOW, 4] : p[2] > 0.235 ? [FUR, 1.5] : [FUR, 3.6 + (n[1] > 0.5 ? 0.5 : 0) + h3(Math.floor(p[0] * 500), Math.floor(p[2] * 500), 3) * 0.6],
  },
};
function* mammalGen(kind: 'squirrel' | 'hare'): Generator<string | void, WildModel> {
  const S = MAMMALS[kind], bones: BoneDef[] = [];
  const mid = S.st[2];
  B(bones, 'root', null, [0, mid.y, mid.z]);
  B(bones, 'head', 'root', [0, S.st[4].y, S.st[4].z]);
  B(bones, 'tail0', 'root', S.tail[0]); B(bones, 'tail1', 'tail0', S.tail[Math.floor(S.tail.length / 2)]);
  for (const [n, s] of [['L', 1], ['R', -1]] as const) { B(bones, 'f' + n, 'root', [S.legF.at[0] * s, S.legF.at[1], S.legF.at[2]]); B(bones, 'h' + n, 'root', [S.legH.at[0] * s, S.legH.at[1], S.legH.at[2]]); }
  B(bones, 'earL', 'head', [S.ear.at[0], S.ear.at[1], S.ear.at[2]]); B(bones, 'earR', 'head', [-S.ear.at[0], S.ear.at[1], S.ear.at[2]]);
  const body = new Body(256);
  const hz = S.st[4].z, eye = (p: V3) => (r: number) => eyeAt(p, S.eye, r);
  const paint = zonePaint((p, n) => S.paint(p, n, eye(p)), { fur: { len: kind === 'hare' ? 0.03 : 0.02, width: 0.006 } });
  const st: Station[] = S.st.map((s) => ({ c: [0, s.y, s.z] as V3, s: [s.w, s.h] as [number, number], p: s.p ?? 'round' }));
  body.add(trunk({ name: 'body', stations: st, tween: 0, capS: true, capE: true, levels: 0, k: 1.3, skin: (p) => (p[2] > hz ? [idx(bones, 'head'), 1] : p[2] > hz - 0.03 ? [idx(bones, 'head'), 0.5, 0, 0.5] : [0, 1]), paint }));
  yield 'body';
  for (const [n, s] of [['L', 1], ['R', -1]] as const) {
    const f = S.legF, h = S.legH;
    const fa: V3 = [f.at[0] * s, f.at[1], f.at[2]], ha: V3 = [h.at[0] * s, h.at[1], h.at[2]];
    body.add(stalk({ name: 'fl' + n, path: [fa, [fa[0], fa[1] - f.len * 0.5, fa[2] + 0.005], [fa[0], 0.006, fa[2] + 0.012], [fa[0], 0.004, fa[2] + 0.03]], r: (t) => f.r * (1 - t * 0.35), around: 5, capE: true, levels: 0, k: 1, skin: () => [idx(bones, 'f' + n), 1], paint }));
    // the hind leg: a thigh folded along the flank, the long foot flat on the ground
    body.add(stalk({ name: 'hl' + n, path: [ha, [ha[0] * 1.15, ha[1] - h.len * 0.4, ha[2] + 0.04], [ha[0], 0.012, ha[2] - 0.01], [ha[0], 0.005, ha[2] + h.foot]], r: (t) => h.r * (1 - t * 0.6), around: 5, capE: true, levels: 0, k: 1, skin: () => [idx(bones, 'h' + n), 1], paint }));
    const ea: V3 = [S.ear.at[0] * s, S.ear.at[1] - S.ear.len * 0.15, S.ear.at[2]];
    body.add(stalk({ name: 'ear' + n, path: [ea, [ea[0] + s * S.ear.len * 0.15, ea[1] + S.ear.len * 0.5, ea[2] - S.ear.len * S.ear.tilt * 0.5], [ea[0] + s * S.ear.len * 0.25, ea[1] + S.ear.len, ea[2] - S.ear.len * S.ear.tilt]], r: (t) => S.ear.r * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.75)), sec: (a) => 0.25 + 0.75 * Math.abs(Math.sin(a)), around: 6, capE: true, levels: 0, k: 1.2, skin: () => [idx(bones, 'ear' + n), 1], paint }));
  }
  yield 'legs';
  const t0 = idx(bones, 'tail0'), t1 = idx(bones, 'tail1');
  body.add(stalk({ name: 'tail', path: curve(S.tail, kind === 'squirrel' ? 7 : 3), r: S.tailR, around: 7, capS: true, capE: true, levels: 0, k: 1, skin: (p) => (p[1] > S.tail[Math.floor(S.tail.length / 2)][1] ? [t1, 1] : [t0, 1]), paint: zonePaint((p, n) => S.paint(p, n, () => false), { fur: { len: 0.03, width: 0.006, flow: 1 } }) }));
  const out = yield* body.buildGen({ den: 900, maxScale: 2, fur: WILD_FUR[kind] });
  return { geo: out.geo, tex: out.tex, sd: out.sd, fur: out.fur, bones, tris: out.tris };
}

// ------------------------------------------------------------------------------------------------ birds
interface BirdSpec {
  L: number; fat: number; beak: number; beakR: number; tail: number; wing: number; crest?: number;
  paint: (p: V3, n: V3, L: number) => [number[], number, number?];
}
const BIRD: Record<'raven' | 'jay' | 'chickadee' | 'grouse', BirdSpec> = {
  raven: { L: 0.6, fat: 0.85, beak: 0.13, beakR: 0.03, tail: 0.32, wing: 1.1,
    paint: (p, n, L) => { const z = p[2] / L; if (z > 0.36) return [BASALT, 2.6, 90]; return [SLATE, 0.6 + (n[1] > 0.4 ? 1.2 : 0) + (h3(Math.floor(p[0] * 300), Math.floor(p[2] * 300), 2) < 0.1 ? 1 : 0), 95]; } },
  jay: { L: 0.28, fat: 1.15, beak: 0.05, beakR: 0.014, tail: 0.42, wing: 1.0,
    paint: (p, n, L) => { const z = p[2] / L, y = (p[1] - L * 0.5) / L; if (z > 0.42) return [INK, 1]; if (z > 0.22 && y > 0.12 && n[2] < 0.6) return [BASALT, 1.6]; if (z > 0.18 || (n[1] < -0.2 && z > 0.05)) return [BONE, 4.6]; return [STONE, 3.5 + (n[1] > 0.4 ? 0.5 : 0) - (z < -0.25 ? 0.8 : 0)]; } },
  chickadee: { L: 0.13, fat: 1.3, beak: 0.02, beakR: 0.006, tail: 0.45, wing: 0.95,
    paint: (p, n, L) => { const z = p[2] / L, y = (p[1] - L * 0.5) / L; if (z > 0.42) return [INK, 1]; if (z > 0.2 && (y > 0.12 || (n[1] < -0.1 && z > 0.28))) return [INK, 1.2]; if (z > 0.2) return [BONE, 5]; if (n[1] < -0.3) return [OCHRE, 5]; return [STONE, 3.6 + (n[1] > 0.5 ? 0.6 : 0) - (z < -0.2 ? 1 : 0)]; } },
  grouse: { L: 0.45, fat: 1.2, beak: 0.035, beakR: 0.013, tail: 0.38, wing: 0.85, crest: 0.04,
    paint: (p, n, L) => { const z = p[2] / L; if (z > 0.43) return [SOIL, 1.5]; const c = cell3(p[0], p[1], p[2], L * 0.06, 7); const bar = Math.abs(Math.sin(p[2] * 140 + p[1] * 60)) < 0.3; if (z < -0.32) return [z < -0.42 ? INK : FUR, 3 + (Math.abs(Math.sin(p[2] * 70)) < 0.25 ? -1.4 : 0)]; if (z > 0.18 && z < 0.3 && Math.abs(p[0]) > L * 0.06 && n[1] < 0.3) return [INK, 1.2]; return [n[1] < -0.3 ? BONE : FUR, (n[1] < -0.3 ? 3.4 : 3.2) + (bar ? -1 : 0) + ((c.id % 3) - 1) * 0.4]; } },
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
  const paint = zonePaint((p, n) => S.paint(p, n, L), { glossy: kind === 'raven' });
  const r = L * 0.12 * f, hb = idx(bones, 'head');
  const st: Station[] = [
    { c: [0, cy + L * 0.02, -L * 0.22], s: [r * 0.35, r * 0.25], p: 'flat' },
    { c: [0, cy, -L * 0.12], s: [r * 0.75, r * 0.7], p: 'round' },
    { c: [0, cy, 0], s: [r, r * 1.05], p: 'round' },
    { c: [0, cy + L * 0.04, L * 0.12], s: [r * 0.9, r * 0.95], p: 'round' },
    { c: [0, cy + L * 0.12, L * 0.22], s: [r * 0.6, r * 0.62], p: 'round' },
    { c: [0, cy + L * 0.15, L * 0.3], s: [r * 0.62, r * 0.6], p: 'round', tw: S.crest ? [[0, 0, 0.6], [1, 0, 0.3]] : undefined },
    { c: [0, cy + L * 0.15, L * 0.37], s: [r * 0.4, r * 0.4], p: 'round' },
  ];
  body.add(trunk({ name: 'body', stations: st, tween: 0, capS: true, capE: true, levels: 0, k: 1.3, skin: (p) => (p[2] > L * 0.24 ? [hb, 1] : p[2] > L * 0.17 ? [hb, 0.5, 0, 0.5] : [0, 1]), paint }));
  const bz = L * 0.38;
  body.add(stalk({ name: 'beak', path: [[0, cy + L * 0.15, bz - L * 0.02], [0, cy + L * 0.145, bz + S.beak * 0.5], [0, cy + L * 0.13 - (kind === 'raven' ? L * 0.02 : 0), bz + S.beak]], r: (t) => S.beakR * (1 - t * 0.9), sec: (a) => (Math.cos(a) > 0 ? 1.2 : 0.9), around: 5, capE: true, levels: 0, k: 1.5, skin: () => [hb, 1], paint: zonePaint(() => [kind === 'grouse' ? SOIL : INK, 1.4, 80]) }));
  yield 'body';
  // wings: flat blades along x from the shoulder, chord tapering to the primaries
  for (const [n, s] of [['L', 1], ['R', -1]] as const) {
    const span = L * 0.55 * S.wing, at: V3 = [s * L * 0.06 * f, cy + L * 0.07, L * 0.06];
    const path: V3[] = [at, [at[0] + s * span * 0.45, at[1] + L * 0.01, at[2] - L * 0.03], [at[0] + s * span, at[1], at[2] - L * 0.1]];
    const wb = idx(bones, 'wing' + n);
    body.add(stalk({ name: 'wing' + n, path, r: (t) => L * 0.17 * (1 - t * 0.55), sec: (a) => 0.07 + 0.93 * Math.abs(Math.sin(a)), around: 6, capE: true, capS: true, levels: 0, k: 1, skin: () => [wb, 1],
      paint: zonePaint((p) => { const d = Math.abs(p[0]) / (span + 1e-6), [R, st] = S.paint([p[0] * 0.2, p[1], -L * 0.05], [0, 1, 0], L); return [R, st - (d > 0.6 ? 0.8 : 0) - (Math.abs(Math.sin(p[2] * 900 / L * 0.06)) < 0.2 && d > 0.45 ? 0.6 : 0)]; }) }));
  }
  // the tail: a flat fan
  const tb = idx(bones, 'tail');
  body.add(stalk({ name: 'tailF', path: [[0, cy + L * 0.03, -L * 0.18], [0, cy + L * 0.02, -L * 0.18 - L * S.tail * 0.5], [0, cy, -L * 0.18 - L * S.tail]], r: (t) => L * (0.05 + t * 0.06) * (kind === 'grouse' ? 1.5 : 1), sec: (a) => 0.07 + 0.93 * Math.abs(Math.sin(a)), around: 6, capE: true, levels: 0, k: 1, skin: () => [tb, 1], paint }));
  // legs
  const lb = idx(bones, 'legs');
  for (const s of [1, -1]) body.add(stalk({ name: 'leg' + s, path: [[s * L * 0.04, cy - L * 0.06, L * 0.02], [s * L * 0.045, L * 0.08, L * 0.03], [s * L * 0.045, 0.002, L * 0.06]], r: () => L * 0.012 + 0.0015, around: 4, capE: true, levels: 0, k: 0.8, skin: () => [lb, 1], paint: zonePaint(() => [kind === 'jay' || kind === 'raven' || kind === 'chickadee' ? INK : SOIL, 1.5]) }));
  const out = yield* body.buildGen({ den: Math.min(1400, 260 / L), maxScale: 2 });
  return { geo: out.geo, tex: out.tex, sd: out.sd, bones, tris: out.tris };
}

// ------------------------------------------------------------------------------------------------ loading
const gen = (k: Species) => (k === 'squirrel' || k === 'hare' ? mammalGen(k) : birdGen(k));
const bonesOf = (k: Species) => runSync(gen(k)).bones;
const loaders = new Map<Species, ReturnType<typeof loader<WildModel>>>();
function L(k: Species) {
  let l = loaders.get(k);
  if (!l) {
    l = loader<WildModel>(`${k}@${WILD_MODEL_VERSION}`, () => runAsync(gen(k)), (b, m) => ({ ...b, bones: (m.bones as BoneDef[]) ?? bonesOf(k), tris: m.tris as number }), (m) => ({ bones: m.bones, tris: m.tris }));
    loaders.set(k, l);
  }
  return l;
}
/** a species' shared model (built now if it was not preloaded) */
export function wildModel(k: Species): WildModel { const l = L(k); let m = l.get(); if (!m) { m = runSync(gen(k)); l.set(m); } return m; }
/** load every wildlife model without stalling (cache, else built in slices) */
export async function wildModelsAsync(o: { cache?: boolean } = {}): Promise<void> { for (const k of ['squirrel', 'hare', 'raven', 'jay', 'chickadee', 'grouse'] as Species[]) await L(k).load(o); }
export { cl };
