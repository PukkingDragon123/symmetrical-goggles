// SCULPTING helpers for organic shapes (the art brief's shape rules): secondary forms pushed into a finalized piece's
// real surface (displace: wrinkles, folds, warts; relief: overlapping scale plates and belly scutes laid out exactly
// like Px.scales, so the plates in the geometry and the scales on the page agree), and parts no primitive can make
// (earFlap: a cupped ear with a rolled rim, thickness and an inner bowl, drooping or pricked).
//
//   const torso = body.add(trunk({ ..., levels: 2 }));
//   torso.post = (p) => relief(p, { size: 0.16, kind: 'keel', flow: -1, depth: 0.02, mask: (q, n) => n[1] > 0 ? 1 : 0 });
//   body.finalize(torso);                   // post runs here, before anything seats on the surface
//   body.add(earFlap({ name: 'earL', root, dir: [0.3, -1, -0.2], out: [1, 0, 0], len: 0.08, wid: 0.04, ... }));
import type { V3, Wt } from './kit';
import { newCM, sheetGrid, creaseRow, type Grid, type CM } from './cage';
import type { Piece, Chart, Body } from './core';
import { h3, cl } from './paint';

const ss = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dst = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** area-weighted vertex normals of a cage */
export function cageNormals(m: CM): V3[] {
  const N: V3[] = m.V.map(() => [0, 0, 0]);
  for (const f of m.F) for (let k = 1; k + 1 < f.length; k++) {
    const a = m.V[f[0]], b = m.V[f[k]], c = m.V[f[k + 1]];
    const n = crs([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    for (const i of [f[0], f[k], f[k + 1]]) { N[i][0] += n[0]; N[i][1] += n[1]; N[i][2] += n[2]; }
  }
  return N.map(nrm);
}
/** push every point of a (finalized) piece along its normal by fn (metres; + out). Use as `piece.post` or after
 *  body.finalize(piece) and before anything seats on it */
export function displace(p: Piece, fn: (q: V3, n: V3, i: number) => number) {
  const N = cageNormals(p.m), V = p.m.V;
  const D = V.map((q, i) => fn(q, N[i], i));
  for (let i = 0; i < V.length; i++) if (D[i]) V[i] = add(V[i], scl(N[i], D[i]));
}

/** a grid's metric coordinates per point: u round (0..1 by arc length, as the chart has it), Y along (metres, down the
 *  column nearest u = 0.5, the top of a bilateral trunk), the row's circumference (metres); NaN off the grid */
export function gridMetrics(m: CM, g: Grid): { u: Float32Array; Y: Float32Array; circ: Float32Array } {
  const nv = m.V.length, u = new Float32Array(nv).fill(NaN), Y = new Float32Array(nv).fill(NaN), circ = new Float32Array(nv).fill(NaN);
  const R = g.v.length, C = g.v[0].length;
  const U: number[][] = [], CI: number[] = [];
  for (let i = 0; i < R; i++) {
    const cum = [0];
    for (let j = 1; j < C; j++) cum.push(cum[j - 1] + dst(m.V[g.v[i][j - 1]], m.V[g.v[i][j]]));
    const tot = cum[C - 1] + (g.wrap ? dst(m.V[g.v[i][C - 1]], m.V[g.v[i][0]]) : 0) || 1e-6;
    U.push(cum.map((c) => c / tot)); CI.push(tot);
  }
  // Y along the column nearest the middle of the chart
  const Yr = [0];
  for (let i = 1; i < R; i++) {
    let bj = 0, bd = Infinity; for (let j = 0; j < C; j++) { const d = Math.abs(U[i][j] - 0.5); if (d < bd) { bd = d; bj = j; } }
    Yr.push(Yr[i - 1] + dst(m.V[g.v[i - 1][bj]], m.V[g.v[i][bj]]));
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const q = g.v[i][j]; u[q] = U[i][j]; Y[q] = Yr[i]; circ[q] = CI[i]; }
  return { u, Y, circ };
}

export interface ReliefOpts {
  /** as Px.scales: scale width and row spacing (m), overlap, which way the tips point along the sweep, the kind */
  size: number; rowK?: number; len?: number; flow?: number; kind?: 'shield' | 'pebble' | 'scute' | 'keel'; seed?: number;
  /** how far a scale stands proud at its thickest (m) */
  depth: number;
  /** where (0..1) and a size multiplier, from the surface point and normal (keep them in step with the paint's) */
  mask?: (q: V3, n: V3) => number; sizeK?: (q: V3, n: V3) => number;
  /** which grid of the piece (default 0) */
  grid?: number;
}
/** the scale under a point in a grid's metric coordinates, laid out exactly as Px.scales lays them: s along it (0 root
 *  .. 1 tip), e across (-1..1 at its edges), the distance to its free rim (m), its id; null in the gaps between */
export function scaleAt(u: number, Yr: number, circ: number, o: { size: number; rowK?: number; len?: number; flow?: number; kind?: 'shield' | 'pebble' | 'scute' | 'keel'; seed?: number }): { s: number; e: number; rim: number; id: number } | null {
  const seed = o.seed ?? 7, flow = o.flow ?? 1, kind = o.kind ?? 'shield', lenK = o.len ?? (kind === 'pebble' ? 1 : kind === 'scute' ? 1.12 : 1.55);
  const sz = o.size, sy = sz * (o.rowK ?? (kind === 'scute' ? 0.42 : kind === 'pebble' ? 0.88 : 0.6)), sw = kind === 'scute' ? sz * 2.4 : sz;
  const ry = (flow > 0 ? Yr : -Yr) / sy, r0 = Math.floor(ry);
  let bo = -Infinity, bs = 0, be = 0, bhw = 0, bid = 0;
  for (let dr = -2; dr <= 1; dr++) {
    const r = r0 + dr, nc = Math.max(3, Math.round(circ / sw)), off = (r & 1) * 0.5, cu = Math.floor(u * nc - off);
    for (let dc = -1; dc <= 1; dc++) {
      const c = cu + dc, cm = ((c % nc) + nc) % nc, hs = h3(r, cm, seed);
      const jx = (hs - 0.5) * 0.16, jy = (h3(cm, r, seed + 3) - 0.5) * 0.18;
      let du = u - (c + off + 0.5 + jx) / nc; du -= Math.round(du);
      const e = du * nc * 2, s = (ry - r - jy) / lenK;
      if (s < 0 || s > 1) continue;
      const hw = kind === 'pebble' ? Math.sqrt(Math.max(0, 1 - (2 * s - 1) ** 2)) * 1.02 : kind === 'scute' ? (s > 0.84 ? 1 - (s - 0.84) * 1.4 : 1.02) : s < 0.5 ? 1.02 : 1.02 * Math.sqrt(Math.max(0, 1 - ((s - 0.5) / 0.5) ** 2));
      if (Math.abs(e) > hw) continue;
      const order = kind === 'pebble' ? -(Math.abs(e) + Math.abs(2 * s - 1)) : -r * 4 - Math.abs(e) * 0.01;
      if (order > bo) { bo = order; bs = s; be = e; bhw = hw; bid = Math.floor(hs * 997); }
    }
  }
  if (bo === -Infinity) return null;
  const rim = Math.min((bhw - Math.abs(be)) * sw * 0.5, kind === 'pebble' ? Math.min(bs, 1 - bs) * lenK * sy : (1 - bs) * lenK * sy);
  return { s: bs, e: be, rim, id: bid };
}
/** overlapping scale plates pushed into a finalized trunk-like piece: each rises from its root (tucked under the row
 *  before) to a thick free edge that drops in a step onto the next row, domed across, keeled down the middle for
 *  'keel'; beads dome; scutes are broad flat bands with a rounded front edge. Lay the paint with Px.scales and the same
 *  size / kind / flow / seed / sizeK so the drawn rims sit on the steps */
export function relief(p: Piece, o: ReliefOpts) {
  const g = p.grids[o.grid ?? 0], M = gridMetrics(p.m, g), kind = o.kind ?? 'shield';
  displace(p, (q, n, i) => {
    if (Number.isNaN(M.u[i])) return 0;
    const mk = o.mask ? o.mask(q, n) : 1; if (mk <= 0.01) return 0;
    const size = o.size * (o.sizeK ? o.sizeK(q, n) : 1);
    const c = scaleAt(M.u[i], M.Y[i], M.circ[i], { ...o, size });
    if (!c) return -o.depth * 0.15 * mk;
    const sy = size * (o.rowK ?? (kind === 'scute' ? 0.42 : kind === 'pebble' ? 0.88 : 0.6)), rimW = Math.max(1e-4, sy * 0.22);
    let h: number;
    if (kind === 'pebble') h = Math.sqrt(Math.max(0, 1 - (2 * c.s - 1) ** 2 * 0.7 - c.e * c.e * 0.7)) * ss(0, rimW, c.rim);
    else {
      const dome = 1 - 0.35 * c.e * c.e + (kind === 'keel' ? 0.25 * Math.max(0, 1 - Math.abs(c.e) * 4) : 0);
      h = (0.3 + 0.7 * ss(0, 0.85, c.s)) * dome * (0.5 + 0.5 * ss(0, rimW, c.rim));
      if (kind === 'scute') h = (0.55 + 0.45 * ss(0, 0.5, c.s)) * (0.6 + 0.4 * ss(0, rimW, c.rim));
    }
    return h * o.depth * mk;
  });
}
/** skin folds round a joint or a neck as a displacement: shallow grooves at `spacing` along `axis` from `origin`,
 *  each with a soft roll of skin on one side; `wob` lets them wander (use with displace) */
export function foldsFn(axis: V3, origin: V3, spacing: number, depth: number, o: { wob?: number; seed?: number; mask?: (q: V3, n: V3) => number } = {}) {
  const ax = nrm(axis), seed = o.seed ?? 3;
  return (q: V3, n: V3) => {
    const mk = o.mask ? o.mask(q, n) : 1; if (mk <= 0.01) return 0;
    const t = (q[0] - origin[0]) * ax[0] + (q[1] - origin[1]) * ax[1] + (q[2] - origin[2]) * ax[2];
    const wob = (o.wob ?? 0.3) * spacing * Math.sin(q[0] * 37 + q[2] * 23 + seed) * Math.cos(q[1] * 29 + seed * 2);
    const f = (t + wob) / spacing, k = f - Math.floor(f);
    // a groove at the fold line, a rounded roll after it
    return depth * mk * (k < 0.18 ? -1 + k / 0.18 * 0.6 : Math.sin(((k - 0.18) / 0.82) * Math.PI) * 0.6 - 0.4);
  };
}

export interface EarSpec {
  name: string;
  /** where the ear grows from the head, which way it runs (root to tip: down for a floppy ear, up for a pricked one),
   *  and its outer face's normal (the side seen from outside) */
  root: V3; dir: V3; out: V3;
  /** length, width at the widest, thickness at the rim (m) */
  len: number; wid: number; thick?: number;
  /** how deep the inner bowl cups (x width, default 0.18), how far the widest part sits along it (default 0.45), the
   *  tip's bluntness (0 pointed .. 1 round, default 0.6), a fold that kinks the flap over at this fraction (floppy ears) */
  cup?: number; widest?: number; blunt?: number; fold?: number; foldAng?: number;
  skin: (p: V3) => Wt; paint: (c: Chart, p: Piece, b: Body) => void; k?: number; levels?: number;
}
/** an ear as a cupped flap: a leaf outline, a rolled rim thicker than the middle, the inner face hollowed into a bowl,
 *  rooted under the skin of the head. The chart unrolls round the flap (u: outer face then inner face) and along it */
export function earFlap(o: EarSpec): Piece {
  const m = newCM(), D0 = nrm(o.dir), O0 = nrm(o.out), S0 = nrm(crs(D0, O0)), O = nrm(crs(S0, D0));
  const NR = 7, NC = 7, cup = o.cup ?? 0.18, wd = o.widest ?? 0.45, blunt = o.blunt ?? 0.6, T = o.thick ?? o.wid * 0.12;
  const rows: V3[][] = [], mids: V3[] = [];
  let c: V3 = add(o.root, scl(D0, -o.len * 0.12)), D = D0, Oo = O;
  for (let r = 0; r <= NR; r++) {
    const t = r / NR;
    // a fold: past it the flap turns over about the side axis (a floppy ear breaking at its crease)
    if (o.fold !== undefined && t > o.fold && r > 0) {
      const a = (o.foldAng ?? 0.6) / Math.max(1, NR * (1 - o.fold));
      D = nrm(add(scl(D, Math.cos(a)), scl(Oo, -Math.sin(a)))); Oo = nrm(crs(S0, D));
    }
    // the outline: narrow at the root, widest at `wd`, round or pointed at the tip
    const wt = t < wd ? 0.62 + 0.38 * Math.sin((t / wd) * Math.PI / 2) : Math.pow(Math.max(0, 1 - (t - wd) / (1 - wd)), 0.5 + 0.6 * (1 - blunt)) * (blunt * 0.25 + 0.75);
    const W = o.wid * 0.5 * Math.max(0.12, wt);
    const row: V3[] = [];
    const arch = (e: number) => cup * o.wid * (1 - e * e) * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) * (1 - t * 0.5);
    // outer face across (-1..1), then the inner face back (1..-1); the rim thicker, the bowl hollow in the middle
    for (let j = 0; j < NC; j++) { const e = -1 + (2 * j) / (NC - 1); mids.push(add(add(c, scl(S0, e * W * 0.97)), scl(Oo, arch(e)))); row.push(add(add(c, scl(S0, e * W)), scl(Oo, arch(e) + T * (0.35 + 0.65 * e ** 4) * 0.5))); }
    for (let j = NC - 1; j >= 0; j--) { const e = -1 + (2 * j) / (NC - 1); row.push(add(add(c, scl(S0, e * W * 0.94)), scl(Oo, arch(e) - T * (0.2 + 0.8 * e ** 4) * 0.5 - (1 - e * e) * T * 0.15))); }
    rows.push(row);
    c = add(c, scl(D, o.len / NR * (r === 0 ? 1.12 : 1)));
  }
  // outward: away from the flap's mid-surface; the end caps along the flap
  const D1 = D, c0 = rows[0].reduce((a, q) => add(a, scl(q, 1 / rows[0].length)), [0, 0, 0] as V3), c1 = rows[NR].reduce((a, q) => add(a, scl(q, 1 / rows[NR].length)), [0, 0, 0] as V3);
  const out = (fc: V3): V3 => {
    if (dst(fc, c0) < T * 0.6) return scl(D0, -1);
    if (dst(fc, c1) < T * 0.6) return D1;
    let bi = 0, bd = Infinity; for (let k = 0; k < mids.length; k++) { const d = dst(fc, mids[k]); if (d < bd) { bd = d; bi = k; } }
    return [fc[0] - mids[bi][0], fc[1] - mids[bi][1], fc[2] - mids[bi][2]];
  };
  const g = sheetGrid(m, rows, { tag: 0, out, wrapCols: true, capS: true, capE: true });
  creaseRow(m, g, 0, 1);
  return { name: o.name, m, grids: [g], levels: o.levels ?? 2, skin: o.skin, paint: o.paint, k: o.k ?? 1.6 };
}
/** is a texel on an earFlap's inner (bowl) face? (for the painter): its normal against the flap's outer normal */
export const earInner = (n: V3, out: V3) => n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < -0.15;
