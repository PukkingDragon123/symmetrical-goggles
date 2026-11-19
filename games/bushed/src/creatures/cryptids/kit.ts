// Shared model helpers for the six lumber-camp cryptids (hodag, squonk, hidebehind, agropelter, teakettler, snow
// wasset). Every model is built with the anatomy library (../anatomy) and painted texel by texel as pixel art; this
// file holds what they all repeat:
//   bonesKit()             a bone list builder (name, parent, rest position in creature space)
//   cryptidLoader(...)     the IndexedDB-cached, sliced model loader, registered with preloadCreatures()
//   coat({...})            a generator painter: a per-texel base (ramp, step, roughness) plus a fur amount, then a
//                          drawn pelt over the furry texels, crease ink and the flush
//   FUR: every furry cryptid paints a fur page (body.buildGen({ fur: furZones([...]) }), src/creatures/fur) that the
//                          shell fur grows from (Cryptid's `fur` option); finishModel keeps it with the model
//   warts / wet glints / scars: small painters used by several of them
// Creature space: metres, +z forward, +y up, +x the creature's left, ground y = 0.
import * as THREE from 'three';
import { Px, RP, h3, cl, runSync, runAsync, type V3, type Chart, type Piece, type Body } from '../anatomy';
import { loader } from '../cache';
import { registerPreload } from '../preload';
import type { BoneDef } from '../rig';

export interface CryptidModel {
  geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; bones: BoneDef[];
  tris: number; den: number; stats: string;
  /** the fur page (R density, G length, B clump, A tip) for src/creatures/fur, when the model grows fur */
  fur?: THREE.DataTexture;
}
export type ModelGen = Generator<string | void, CryptidModel>;

/** a bone list in creature space: A(name, parent, pos); bones must follow their parents */
export function bonesKit() {
  const b: BoneDef[] = [];
  const A = (name: string, parent: string | null, pos: V3) => {
    const pi = parent === null ? -1 : b.findIndex((x) => x.name === parent);
    if (parent !== null && pi < 0) throw new Error('no parent bone ' + parent);
    b.push({ name, parent: pi, pos: [pos[0], pos[1], pos[2]] });
  };
  return { b, A };
}
export const boneIndex = (bones: BoneDef[]) => (n: string) => { const k = bones.findIndex((x) => x.name === n); if (k < 0) throw new Error('no bone ' + n); return k; };

/** a model shared by every instance: from memory, the IndexedDB cache, or built (sliced when async). Registered with
 *  preloadCreatures() under the version's name. Bump the version string whenever the builder changes. */
export function cryptidLoader(version: string, gen: () => ModelGen, bones: () => BoneDef[]) {
  const L = loader<CryptidModel>(version, () => runAsync(gen()),
    (b, m) => ({ ...b, bones: bones(), tris: m.tris as number, den: m.den as number, stats: m.stats as string }),
    (m) => ({ tris: m.tris, den: m.den, stats: m.stats }));
  const load = (o: { cache?: boolean } = {}) => L.load(o);
  registerPreload(version.split('@')[0], load);
  return {
    /** the model now (built synchronously if nothing preloaded it: blocks for a second or two) */
    get(): CryptidModel { let m = L.get(); if (!m) { m = runSync(gen()); L.set(m); } return m; },
    load,
  };
}

/** finish a build: the stats string, the fur page */
export function finishModel(body: Body, out: { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; tris: number; fur?: THREE.DataTexture }, bones: BoneDef[]): CryptidModel {
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, fur: out.fur, bones, tris: out.tris, den: body.den, stats };
}
/** region tags the cryptid pieces carry (core.ts Piece.reg, written to the geometry as aReg) */
export const REG = { torso: 1, back: 2, head: 3, eye: 4, crown: 5, jaw: 6, legs: 8, arms: 9, tail: 10, horn: 12, mouth: 13, claw: 14 } as const;

// ------------------------------------------------------------------------------------------------ painting
export interface CoatOpts {
  /** strength of the baked sky occlusion */
  lightK?: number;
  /** per texel: choose the material (px.put + px.rough) and return how furry it is (0 bare .. 1 full coat) */
  texel: (px: Px, i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;
  /** the drawn pelt over the furry texels (Px.pelt) */
  pelt?: { len: number; width: number; flow?: number; down?: number; tooth?: number; clump?: number; strands?: number };
  /** drawn lock flames instead of (or over) the pelt (Px.locks) */
  locks?: { len: number; width: number; flow?: number; down?: number; bend?: number; tip?: number; ink?: number; under?: number };
  /** crease ink: [threshold, dark, lit] */
  ink?: [number, number, number];
  /** last marks before the flush (glints, scars, wet tears) */
  after?: (px: Px, fur: Float32Array) => void;
  glow?: (px: Px, i: number) => boolean;
}
export function coat(o: CoatOpts) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = o.lightK ?? 0.8;
    const fur = new Float32Array(px.n);
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      fur[i] = o.texel(px, i, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
    }
    yield;
    if (o.pelt) px.pelt({ ...o.pelt, mask: (i) => fur[i] });
    if (o.locks) { yield; px.locks({ ...o.locks, mask: (i) => (fur[i] > 0.5 ? fur[i] : 0) }); }
    yield;
    const ik = o.ink ?? [1.3, 1.1, 0.5];
    px.creaseInk(ik[0], { dark: ik[1], lit: ik[2] });
    o.after?.(px, fur);
    yield;
    px.flush(o.glow ? { glow: (i) => o.glow!(px, i) } : {});
  };
}
/** a plain painter (claws, horns, teeth): one ramp, a step function of the surface */
export function solid(R: number[], step: (x: number, y: number, z: number, ny: number, i: number) => number, rough = 120, ink: [number, number, number] = [1, 1, 1]) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = 0.6;
    for (let i = 0; i < px.n; i++) { px.put(i, R, step(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3 + 1], i)); px.rough[i] = rough; }
    px.creaseInk(ink[0], { dark: ink[1], lit: ink[2] });
    px.flush();
  };
}
/** wet glints (tears, a wet nose, slime): single bright texels where the surface faces up into the sky, and low
 *  roughness, over a mask */
export function wet(px: Px, mask: (i: number) => number, R: number[], every = 0.6) {
  const N = px.gb.N, P = px.gb.P;
  for (let i = 0; i < px.n; i++) {
    const m = mask(i); if (m <= 0.05) continue;
    px.rough[i] = Math.min(px.rough[i], 40 + (1 - m) * 120);
    if (N[i * 3 + 1] > 0.55 && h3(Math.floor(P[i * 3] / px.mpt), Math.floor(P[i * 3 + 1] / px.mpt), Math.floor(P[i * 3 + 2] / px.mpt)) < 0.08 * every * m) px.over[i] = R[R.length - 1];
  }
}
/** warts drawn on a skin: domed bumps a step lighter on top, a dark ring round each, sometimes a dark mole */
export function warts(px: Px, size: number, density: number, mask: (i: number) => number, seed = 5) {
  const P = px.gb.P, N = px.gb.N, mpt = px.mpt;
  for (let i = 0; i < px.n; i++) {
    const m = mask(i); if (m <= 0.05) continue;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const gx = Math.floor(x / size), gy = Math.floor(y / size), gz = Math.floor(z / size);
    let best = 9, bdy = 0, mole = false;
    for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) for (let c = -1; c <= 1; c++) {
      const X = gx + a, Y = gy + b2, Z = gz + c;
      if (h3(X, Y, Z * 7 + seed) > density * m) continue;
      const r = size * (0.22 + 0.3 * h3(Z, X, Y + seed));
      const cx = (X + 0.2 + 0.6 * h3(X, Y, Z + seed + 1)) * size, cy = (Y + 0.2 + 0.6 * h3(Y, Z, X + seed + 2)) * size, cz = (Z + 0.2 + 0.6 * h3(Z, X, Y + seed + 3)) * size;
      const d = Math.hypot(x - cx, y - cy, z - cz) / r;
      if (d < best) { best = d; bdy = (y - cy) / r; mole = h3(X, Z, Y + seed + 4) < 0.18; }
    }
    if (best > 1.25) continue;
    if (best > 1 - mpt / size) { px.mark[i] -= 1.3; continue; }
    if (mole) { px.mark[i] -= 1.6 - (bdy > 0.3 ? 0.6 : 0); continue; }
    px.mark[i] += bdy > 0.25 ? 1.1 : bdy < -0.35 ? -0.6 : 0.4;
    if (N[i * 3 + 1] > 0.6 && best < 0.35 && bdy > 0.1) px.mark[i] += 0.6;
  }
}
/** the inside of a mouth: gum ridges, a dark throat toward the back (zBack .. zFront in creature z) */
export function mouthInside(px: Px, i: number, z: number, zBack: number, zFront: number, ax: number, w: number) {
  const deep = cl((zFront - z) / Math.max(1e-4, zFront - zBack), 0, 1), ridge = Math.abs(Math.sin(z * 180)) < 0.22 && ax < w * 0.55;
  px.put(i, RP('gum'), 3.2 - deep * 2.2 - (ridge ? 0.8 : 0) + (ax > w * 0.75 ? 0.5 : 0)); px.rough[i] = 60;
}
export { RP, h3, cl };
