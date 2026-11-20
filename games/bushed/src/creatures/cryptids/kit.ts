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
//   sculpt(piece, dabs)    organic secondary forms on a finalized piece: oriented brush dabs that inflate, dent or grab
//                          the surface (brows, sockets, jowls, sagging hide), plus a displacement field (folds, wrinkles)
//   almondLid({...})       a thick upper or lower lid whose margin is an almond arc meeting the other's at the corners
//   flap({...})            a cupped flap of skin with a rolled rim and thickness (ears, jowls)
// Creature space: metres, +z forward, +y up, +x the creature's left, ground y = 0.
import * as THREE from 'three';
import { Px, RP, h3, cl, runSync, runAsync, newCM, sheetGrid, creaseCol, pathFrames, cageNormals, type V3, type Wt, type Chart, type Piece, type Body } from '../anatomy';
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

// ------------------------------------------------------------------------------------------------ sculpting
// Organic secondary forms on a finalized (subdivided) piece: brow ridges, cheekbones, eye sockets, nostrils, jowls,
// skin folds, plates. A Dab is a sculptor's brush stroke: an oriented ellipsoid of influence that inflates or dents the
// surface along its normal and/or grabs it (moves it by a vector, e.g. skin sagging under gravity). Sculpt pieces
// before anything is seated on them (gridSurf reads the sculpted surface).
export interface Dab {
  /** centre and radii (m): one radius, or radii along the dab's axes (ax, ay, and their cross product) */
  c: V3; r: number | V3;
  ax?: V3; ay?: V3;
  /** push along the surface normal (m, + inflate, - dent) */
  out?: number;
  /** grab: move by this vector (m) at the centre of the dab */
  move?: V3;
  /** falloff: 1 a broad soft swell .. 4 a tight knob (default 2) */
  k?: number;
  /** also mirrored to -x (bilateral landmarks) */
  sym?: boolean;
}
const nrm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** sculpt a finalized piece: dabs, then an optional field fn(point, normal) -> push along the normal (m) */
export function sculpt(p: Piece, dabs: Dab[], fn?: (q: V3, n: V3) => number) {
  if (!p.done) throw new Error('sculpt: finalize ' + p.name + ' first');
  const V = p.m.V, N = cageNormals(p.m);
  const all: Dab[] = [];
  for (const d of dabs) {
    all.push(d);
    if (d.sym) all.push({ ...d, c: [-d.c[0], d.c[1], d.c[2]], ax: d.ax && [-d.ax[0], d.ax[1], d.ax[2]], ay: d.ay && [-d.ay[0], d.ay[1], d.ay[2]], move: d.move && [-d.move[0], d.move[1], d.move[2]], sym: false });
  }
  const pre = all.map((d) => {
    const ax = d.ax ? nrm3(d.ax) : [1, 0, 0] as V3, ay0 = d.ay ? d.ay : (d.ax ? (Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]) : [0, 1, 0]) as V3;
    const ay = nrm3([ay0[0] - ax[0] * dot3(ay0, ax), ay0[1] - ax[1] * dot3(ay0, ax), ay0[2] - ax[2] * dot3(ay0, ax)]), az = crs3(ax, ay);
    const r: V3 = typeof d.r === 'number' ? [d.r, d.r, d.r] : d.r;
    const big = Math.max(r[0], r[1], r[2]);
    return { d, ax, ay, az, r, big, k: d.k ?? 2 };
  });
  const out = V.map((q, i) => {
    let x = q[0], y = q[1], z = q[2];
    const n = N[i];
    for (const s of pre) {
      const vx = q[0] - s.d.c[0], vy = q[1] - s.d.c[1], vz = q[2] - s.d.c[2];
      if (Math.abs(vx) > s.big || Math.abs(vy) > s.big || Math.abs(vz) > s.big) continue;
      const a = (vx * s.ax[0] + vy * s.ax[1] + vz * s.ax[2]) / s.r[0], b = (vx * s.ay[0] + vy * s.ay[1] + vz * s.ay[2]) / s.r[1], c = (vx * s.az[0] + vy * s.az[1] + vz * s.az[2]) / s.r[2];
      const d2 = a * a + b * b + c * c; if (d2 >= 1) continue;
      const f = Math.pow(1 - d2, s.k);
      if (s.d.out) { x += n[0] * s.d.out * f; y += n[1] * s.d.out * f; z += n[2] * s.d.out * f; }
      if (s.d.move) { x += s.d.move[0] * f; y += s.d.move[1] * f; z += s.d.move[2] * f; }
    }
    if (fn) { const h = fn(q, n); if (h) { x += n[0] * h; y += n[1] * h; z += n[2] * h; } }
    return [x, y, z];
  });
  p.m.V = out;
}

// ------------------------------------------------------------------------------------------------ lids and flaps
type PaintFn = (c: Chart, p: Piece, b: Body) => void | Iterator<unknown>;
/** an eyelid that leaves only a lens-shaped (almond) slice of the eye: a thick shell of skin from the margin back
 *  round the eyeball into the socket, its margin an almond arc that meets the other lid's at both corners and runs on
 *  past them (so no disc of eyeball ever shows). The upper lid rides `bone` (a blink turns it down about the axis
 *  across the eye); `lidAt(p)` tells a painter how far a point is from the margin (m along the eye's surface). */
export interface LidSpec {
  name: string; c: V3; ax: V3; r: number; bone: number;
  /** which eye (+1 the creature's left), for the inner and outer corners */
  side: 1 | -1;
  lower?: boolean;
  /** the margin's height above (below, for a lower lid) the eye's centre at its middle, x r */
  open: number;
  /** the corners: half the width of the opening (x r), the outer corner raised (+) or dropped (-) (x r) */
  w?: number; tilt?: number;
  /** the margin's peak moved toward the outer (+) or inner (-) corner */
  peak?: number;
  /** the lid's thickness at the margin (x r) and how far round the eye it runs back (rad from the axis) */
  thick?: number; root?: number;
  paint?: PaintFn;
  /** the built-in painter: skin ramp and step, the lash line, a wet rim (lower lids) */
  skin?: { R: number[]; step: number; lash?: number[]; wet?: number[] };
  k?: number;
  /** columns across the lid (default 9) */
  cols?: number;
}
export function almondLid(o: LidSpec): Piece & { lidAt: (p: V3) => number } {
  const m = newCM(), ax = nrm3(o.ax), up0: V3 = [0, 1, 0];
  const up = nrm3([up0[0] - ax[0] * ax[1], up0[1] - ax[1] * ax[1], up0[2] - ax[2] * ax[1]]);
  const outv = nrm3(crs3(up, ax)).map((v) => v * o.side) as V3;
  const W = o.w ?? 0.93, H = o.open, tilt = o.tilt ?? 0, pk = o.peak ?? 0, th = o.thick ?? 0.24, th0 = o.root ?? 2.0, sg = o.lower ? -1 : 1;
  const NC = o.cols ?? 9, Q = 1.22, K = 4;
  /** the margin's projected point (x r) for column q in -Q..Q (inner corner -1, outer +1) */
  const margin = (q: number): [number, number] => {
    const aq = Math.abs(q), base = Math.max(0, 1 - q * q);
    let Y = aq <= 1 ? sg * H * Math.pow(base, 0.62) * (1 + pk * q) + tilt * q : tilt * Math.sign(q) - sg * (aq - 1) * 1.6;
    let X = q * W;
    const rr = Math.hypot(X, Y); if (rr > 0.975) { X *= 0.975 / rr; Y *= 0.975 / rr; }
    return [X, Y];
  };
  const dirOf = (X: number, Y: number): V3 => { const zz = Math.sqrt(Math.max(0, 1 - X * X - Y * Y)); return nrm3([outv[0] * X + up[0] * Y + ax[0] * zz, outv[1] * X + up[1] * Y + ax[1] * zz, outv[2] * X + up[2] * Y + ax[2] * zz]); };
  const tbl: { phi: number; th: number }[] = [];
  const rows: V3[][] = [];
  for (let k = 0; k < NC; k++) {
    const q = -Q + (2 * Q * k) / (NC - 1), [X, Y] = margin(q), dm = dirOf(X, Y);
    const thm = Math.acos(Math.max(-1, Math.min(1, dot3(dm, ax))));
    let e: V3 = [dm[0] - ax[0] * Math.cos(thm), dm[1] - ax[1] * Math.cos(thm), dm[2] - ax[2] * Math.cos(thm)];
    e = Math.hypot(e[0], e[1], e[2]) < 1e-4 ? (sg > 0 ? up : [-up[0], -up[1], -up[2]]) : nrm3(e);
    tbl.push({ phi: Math.atan2(dot3(e, outv), dot3(e, up)), th: thm });
    const at = (t: number, rad: number): V3 => { const s = Math.sin(t), c = Math.cos(t); return [o.c[0] + (ax[0] * c + e[0] * s) * o.r * rad, o.c[1] + (ax[1] * c + e[1] * s) * o.r * rad, o.c[2] + (ax[2] * c + e[2] * s) * o.r * rad]; };
    const row: V3[] = [];
    // the outer face from the root (deep in the socket) to the margin, then back along the inner face
    for (let s = 0; s <= K; s++) { const f = s / K; row.push(at(th0 + (thm - th0) * f, 1.03 + th * (0.5 + 0.5 * f * f))); }
    for (let s = K; s >= 0; s--) { const f = s / K; row.push(at(th0 + (thm + 0.06 - th0) * f, 1.025)); }
    rows.push(row);
  }
  const g = sheetGrid(m, rows, { tag: 0, out: (p) => [p[0] - o.c[0], p[1] - o.c[1], p[2] - o.c[2]], wrapCols: true, capS: true, capE: true });
  creaseCol(m, g, K, 0, NC - 1, 1.5, true); creaseCol(m, g, K + 1, 0, NC - 1, 1, false);
  /** metres from the margin over the outer face (+ toward the root), or a large negative number on the inner face */
  const lidAt = (p: V3) => {
    const v = nrm3([p[0] - o.c[0], p[1] - o.c[1], p[2] - o.c[2]]), cz = dot3(v, ax), t = Math.acos(Math.max(-1, Math.min(1, cz)));
    const rad = Math.hypot(p[0] - o.c[0], p[1] - o.c[1], p[2] - o.c[2]) / o.r;
    const phi = Math.atan2(dot3(v, outv), dot3(v, up));
    let best = tbl[0], bd = Infinity; for (const q of tbl) { let d = Math.abs(q.phi - phi); if (d > Math.PI) d = Math.PI * 2 - d; if (d < bd) { bd = d; best = q; } }
    return rad < 1.06 ? -1 : (t - best.th) * o.r;
  };
  const sk = o.skin;
  const paint: PaintFn = o.paint ?? ((ch, _p, b) => {
    const px = new Px(ch, b), P = px.gb.P;
    px.lightK = 0.8;
    for (let i = 0; i < px.n; i++) {
      const d = lidAt([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      if (d < -0.5) { px.put(i, RP('gum'), 1.4); px.rough[i] = 40; continue; }
      if (d < px.mpt * 1.2) { const W = sk?.wet ?? RP('flesh'); px.put(i, o.lower ? W : sk?.lash ?? RP('ink'), o.lower ? W.length - 1.6 : 0.6); px.rough[i] = o.lower ? 30 : 150; continue; }
      if (!o.lower && d < px.mpt * 3) { px.put(i, sk?.R ?? RP('hide'), (sk?.step ?? 3) - 1.2); px.rough[i] = 150; continue; }
      px.put(i, sk?.R ?? RP('hide'), (sk?.step ?? 3) + (d < px.mpt * 5 ? 0.6 : 0) + (h3(Math.floor(P[i * 3] / px.mpt / 2), Math.floor(P[i * 3 + 1] / px.mpt / 2), 7) - 0.5) * 0.5);
      px.rough[i] = 160;
    }
    px.creaseInk(1, { dark: 1.2, lit: 0.6 });
    px.flush();
  });
  const piece: Piece & { lidAt: (p: V3) => number } = { name: o.name, m, grids: [g], levels: 1, skin: () => [o.bone, 1], paint, k: o.k ?? 1.8, noOcc: true, lidAt };
  return piece;
}

/** a flap of skin (an ear, a jowl, a wattle): a leaf-shaped sheet with thickness swept along a path from the root to
 *  the tip, its section cupped into a bowl on the inner side (toward -face), its rim rolled thicker. The outer face
 *  looks toward `face` at the root (the frame turns with the path). */
export function flap(o: {
  name: string; path: V3[]; face: V3;
  /** half width, cup depth (+ the bowl opens toward -face), thickness (m), by t along the path */
  w: (t: number) => number; cup: (t: number) => number; th: (t: number) => number;
  /** a sideways bend of the section's midline (m, + toward the frame's side axis) */
  bend?: (t: number) => number;
  /** points across the width (odd) */
  across?: number;
  skin: (p: V3) => Wt; paint: PaintFn; levels?: number; k?: number;
}): Piece & { inner: (p: V3, n: V3) => boolean } {
  const m = newCM(), A = o.across ?? 7, n = o.path.length, fr = pathFrames(o.path, o.face);
  const rows: V3[][] = [];
  const frames: { c: V3; y: V3 }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), c = o.path[i], f = fr[i], hw = o.w(t), cup = o.cup(t), th = o.th(t), bd = o.bend?.(t) ?? 0;
    const pt = (e: number, s: number): V3 => {
      // the cupped midline: the edges curl toward +face (the bowl opens toward -face); the rim thicker
      const rim = 1 + 0.9 * Math.pow(Math.abs(e), 6);
      const yo = cup * (e * e) + s * th * 0.5 * rim, xo = e * hw + bd * (1 - e * e);
      return [c[0] + f.x[0] * xo + f.y[0] * yo, c[1] + f.x[1] * xo + f.y[1] * yo, c[2] + f.x[2] * xo + f.y[2] * yo];
    };
    const row: V3[] = [];
    for (let j = 0; j < A; j++) row.push(pt(-1 + (2 * j) / (A - 1), 1));
    for (let j = A - 1; j >= 0; j--) row.push(pt(-1 + (2 * j) / (A - 1), -1));
    rows.push(row);
    frames.push({ c, y: f.y });
  }
  const mid = o.path[Math.floor(n / 2)];
  const g = sheetGrid(m, rows, { tag: 0, out: (p) => { let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(p[0] - o.path[i][0], p[1] - o.path[i][1], p[2] - o.path[i][2]); if (d < bd) { bd = d; best = i; } } const v = [p[0] - frames[best].c[0], p[1] - frames[best].c[1], p[2] - frames[best].c[2]]; return dot3(v, frames[best].y) >= 0 ? frames[best].y : frames[best].y.map((x) => -x); }, wrapCols: true, capS: true, capE: true });
  void mid;
  // the rim: both edges creased and inked
  creaseCol(m, g, 0, 0, n - 1, 1.2, true); creaseCol(m, g, A - 1, 0, n - 1, 1.2, true); creaseCol(m, g, A, 0, n - 1, 1, false); creaseCol(m, g, 2 * A - 1, 0, n - 1, 1, false);
  /** is a point (with its normal) on the inner (bowl) face, the one looking toward -face? */
  const inner = (p: V3, nn: V3) => { let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(p[0] - o.path[i][0], p[1] - o.path[i][1], p[2] - o.path[i][2]); if (d < bd) { bd = d; best = i; } } return dot3(nn, frames[best].y) < -0.2; };
  return { name: o.name, m, grids: [g], levels: o.levels ?? 1, skin: o.skin, paint: o.paint, k: o.k ?? 1.4, inner };
}
