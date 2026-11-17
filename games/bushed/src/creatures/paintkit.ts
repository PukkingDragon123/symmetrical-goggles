// Shared painting helpers for BUSHED's creatures: a spine frame to locate any surface point along a body (arc length
// from the tail and angle round from the top), smooth value noise for grain and mottling, and hair seats on a trunk.
import { Noise } from '../core/noise';
import { gridSurf, type V3, type Wt, type Piece, type LockSeat, h3 } from './anatomy';

export interface Frame { pts: V3[]; cum: number[]; x: V3[]; y: V3[]; L: number }
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** a frame along spine points (tail end first); x is the creature's left (+x), y the back's "up" */
export function spineFrame(pts: V3[]): Frame {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const x: V3[] = [], y: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const xx = nrm([1 - d[0] * d[0], -d[0] * d[1], -d[0] * d[2]]);
    x.push(xx); y.push(nrm(crs(d, xx)));
  }
  return { pts, cum, x, y, L: cum[cum.length - 1] };
}
/** arc length s along the frame, angle a round it (0 top, +pi/2 the +x side, +-pi the belly), distance r */
export function locate(F: Frame, p: V3): { s: number; a: number; r: number } {
  let best = 0, bd = Infinity, bt = 0;
  for (let k = 0; k + 1 < F.pts.length; k++) {
    const A = F.pts[k], B = F.pts[k + 1], ab0 = B[0] - A[0], ab1 = B[1] - A[1], ab2 = B[2] - A[2], L2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2 || 1e-9;
    let t = ((p[0] - A[0]) * ab0 + (p[1] - A[1]) * ab1 + (p[2] - A[2]) * ab2) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = p[0] - A[0] - ab0 * t, dy = p[1] - A[1] - ab1 * t, dz = p[2] - A[2] - ab2 * t, d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = k; bt = t; }
  }
  const A = F.pts[best], B = F.pts[best + 1];
  const c: V3 = [A[0] + (B[0] - A[0]) * bt, A[1] + (B[1] - A[1]) * bt, A[2] + (B[2] - A[2]) * bt];
  const X = nrm(lerp3(F.x[best], F.x[best + 1], bt)), Y = nrm(lerp3(F.y[best], F.y[best + 1], bt));
  const v: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  return { s: F.cum[best] + (F.cum[best + 1] - F.cum[best]) * bt, a: Math.atan2(dot(v, X), dot(v, Y)), r: Math.sqrt(bd) };
}
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const NZ = new Noise(4817);
/** smooth noise in -1..1 */
export const nz2 = (x: number, y: number) => NZ.n2(x, y);
export const nz3 = (x: number, y: number, z: number) => NZ.n3(x, y, z);
export const fbm3 = (x: number, y: number, z: number, oct = 3) => { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * NZ.n3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2; } return s / n; };

/** hair seats over a region of a finalized trunk-like piece: rows along v, columns round u (0.5 = the top) */
export function seatsOn(piece: Piece, o: {
  u0: number; u1: number; v0: number; v1: number; rows: number; cols: number;
  len: (u: number, v: number) => number; wid: number; lift?: number; droop?: number;
  dir: (p: V3, n: V3, u: number, v: number) => V3; col: (u: number, v: number) => number; skin: (p: V3) => Wt;
  keep?: (p: V3, n: V3) => boolean; seed?: number; sink?: number;
}): LockSeat[] {
  const out: LockSeat[] = [], g = piece.grids[0], seed = o.seed ?? 3;
  for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) {
    const ju = (h3(r, c, seed) - 0.5) * 0.8, jv = (h3(c, r, seed + 1) - 0.5) * 0.8;
    const u = o.u0 + ((c + 0.5 + (r % 2) * 0.5 + ju) / o.cols) * (o.u1 - o.u0), v = o.v0 + ((r + 0.5 + jv) / o.rows) * (o.v1 - o.v0);
    const q = gridSurf(piece.m, g, ((u % 1) + 1) % 1, Math.max(0, Math.min(1, v)));
    if (o.keep && !o.keep(q.p, q.n)) continue;
    const L = o.len(u, v); if (L <= 0.002) continue;
    const k = 0.75 + 0.5 * h3(r * 7 + 1, c, seed + 2);
    const p: V3 = [q.p[0] - q.n[0] * L * (o.sink ?? 0.05), q.p[1] - q.n[1] * L * (o.sink ?? 0.05), q.p[2] - q.n[2] * L * (o.sink ?? 0.05)];
    out.push({ p, n: q.n, dir: o.dir(q.p, q.n, u, v), len: L * k, wid: o.wid * (0.8 + 0.4 * h3(c, r * 3, seed + 3)), lift: o.lift, droop: o.droop, col: o.col(u, v), w: o.skin(q.p) });
  }
  return out;
}
