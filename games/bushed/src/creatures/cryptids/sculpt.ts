// Sculpting and hand-painting helpers for the hidebehind, the agropelter and the snow wasset (the organic pass):
//   ring(...)       an anatomical cross-section written as bumps on an ellipse (11-point half profiles for trunk())
//   displace(...)   push a finalized piece along its normals: ribs, vertebrae, knuckles, wrinkles, bark ridges
//   flap(...)       an ear: a cupped flap with a rolled rim, thickness and an inner bowl, swept along a path
//   digit(...)      a knuckled finger or toe (phalanges with bulging joints, flattened, a pad underneath) and its
//                   hooked, keeled claw
//   brush(...)      the hand painter: per texel a material (ramp, step) and a fur amount; the form lit from above
//                   (top planes a step lighter and warmer, undersides cooler), AO and cavities, and the whole chart
//                   laid in with visible strokes that follow the fur flow (or run round the form on bare skin):
//                   2-4 texels wide, varied length, tapered, overlapping, so ramp steps break into stroke-shaped
//                   clusters. The texel callback reads the strokes too (wet, broken edges between colour zones, dabs)
//   bone(...)       the same painter for claws, teeth and horn: dark root to pale tip, strokes along the length
// Creature space: metres, +z forward, +y up.
import { Px, h3, cl, newCM, tube, creaseRow, creaseCol, type V3, type Wt, type Chart, type Piece, type Body, type CM, type Ring } from '../anatomy';

const TAU = Math.PI * 2;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const gs = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
export const sm = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export { add, sub, scl, dot, crs, nrm, lerp };

// ------------------------------------------------------------------------------------------------ sections
/** an 11-point half profile (top midline, down the +x side, bottom midline): an ellipse pushed in and out by bumps
 *  [angle deg from the top, radial amount (x 1), width deg], with optional per-point [dx, dy] tweaks; `sq` squares it */
export function ring(bumps: [number, number, number][] = [], o: { sq?: number; tw?: [number, number, number][] } = {}): number[][] {
  const out: number[][] = [];
  for (let j = 0; j <= 10; j++) {
    const a = (j / 10) * Math.PI, deg = j * 18;
    let k = 1;
    for (const [bd, amp, bw] of bumps) k += amp * gs(deg, bd, bw);
    const s = Math.sin(a), c = Math.cos(a), sq = o.sq ?? 0;
    // a squarer section: push the diagonals out
    const q = 1 + sq * Math.abs(Math.sin(2 * a)) * 0.18;
    out.push([s * k * q, c * k * q]);
  }
  for (const [j, dx, dy] of o.tw ?? []) { out[j][0] += dx; out[j][1] += dy; }
  out[0][0] = 0; out[10][0] = 0;
  return out;
}

// ------------------------------------------------------------------------------------------------ displacement
/** area-weighted vertex normals of a cage */
export function cageNormals(m: CM): V3[] {
  const N: V3[] = m.V.map(() => [0, 0, 0]);
  for (const f of m.F) for (let k = 1; k + 1 < f.length; k++) {
    const a = m.V[f[0]], b = m.V[f[k]], c = m.V[f[k + 1]], n = crs(sub(b, a), sub(c, a));
    for (const i of [f[0], f[k], f[k + 1]]) { N[i][0] += n[0]; N[i][1] += n[1]; N[i][2] += n[2]; }
  }
  return N.map(nrm);
}
/** subdivide a piece now (if it is not yet) and push every point along its normal by d(p, n) metres (+ out) */
export function displace<T extends Piece>(body: Body, p: T, d: (p: V3, n: V3) => number): T {
  body.finalize(p);
  const N = cageNormals(p.m);
  p.m.V = p.m.V.map((v, i) => { const k = d(v, N[i]); return k ? add(v, scl(N[i], k)) : v; });
  return p;
}
/** a raised ridge along a polyline: the height at a point (0 off it), a smooth bump `w` wide */
export function ridge(pts: V3[], p: V3, w: number, h: number): number {
  let bd = Infinity;
  for (let s = 0; s + 1 < pts.length; s++) {
    const a = pts[s], b = pts[s + 1], ab = sub(b, a), L2 = dot(ab, ab) || 1e-9, t = cl(dot(sub(p, a), ab) / L2, 0, 1);
    const q = add(a, scl(ab, t)), dd = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (dd < bd) bd = dd;
  }
  return bd > w * 2 ? 0 : h * gs(bd, 0, w * 0.5);
}

// ------------------------------------------------------------------------------------------------ ears
/** an ear: a flap swept along `path` (root buried in the head .. tip), cupped toward `front` (its bowl opens that
 *  way), w(t) wide, cup(t) deep, `thick` thick at the middle, with a rolled rim. Points per side `n` (default 6). */
export function flap(o: { name: string; path: V3[]; front: V3; w: (t: number) => number; cup: (t: number) => number; thick: number; rim?: number; n?: number; skin: (p: V3) => Wt; paint: Piece['paint']; levels?: number; k?: number; twist?: (t: number) => number }): Piece {
  const m = newCM(), n = o.n ?? 6, P = o.path, R: Ring[] = [];
  for (let i = 0; i < P.length; i++) {
    const t = i / (P.length - 1), d = nrm(sub(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]));
    let bk = scl(o.front, -1); bk = nrm(sub(bk, scl(d, dot(bk, d))));
    let x = nrm(crs(d, bk));
    const tw = o.twist?.(t) ?? 0;
    if (tw) { const c = Math.cos(tw), s = Math.sin(tw); const x2 = add(scl(x, c), scl(bk, s)); bk = add(scl(bk, c), scl(x, -s)); x = x2; }
    const W = o.w(t), C = o.cup(t), T = o.thick * (1 - t * 0.5), rim = o.rim ?? 1.6;
    // an ellipse W x T, bent into a cup (the middle further back than the edges), the rim thicker than the middle
    const pts: number[][] = [];
    for (let j = 0; j < 2 * n; j++) {
      const a = (j / (2 * n)) * TAU, xx = Math.cos(a) * W * 0.5, e = (2 * xx) / Math.max(1e-6, W);
      const th = T * (1 + (rim - 1) * e ** 6) * 0.5;
      pts.push([xx, Math.sin(a) * th + C * (1 - e * e)]);
    }
    R.push({ c: P[i], x, y: bk, pts });
  }
  const g = tube(m, R, { tag: 0, capS: true, capE: true });
  // crease the rim's two edges a little so it reads as a rolled lip
  creaseCol(m, g, 0, 0, R.length - 1, 0.6); creaseCol(m, g, n, 0, R.length - 1, 0.6);
  return { name: o.name, m, grids: [g], levels: o.levels ?? 1, skin: o.skin, paint: o.paint, k: o.k ?? 1.4 };
}

// ------------------------------------------------------------------------------------------------ fingers and toes
/** a finger or toe along `path` (base .. tip): radius r tapering by `taper`, a knuckle swelling at each joint t,
 *  flattened (depth/width `flat`), a soft pad on the `pad` side; the claw (when asked) grows out of the last third,
 *  hooking toward the pad. Returns [finger, claw?]. */
export function digit(o: {
  name: string; path: V3[]; r: number; joints: number[]; pad: V3; taper?: number; flat?: number; knuckle?: number; around?: number;
  skin: (p: V3) => Wt; paint: Piece['paint']; levels?: number; k?: number;
  claw?: { len: number; r: number; curl: number; skin: (p: V3) => Wt; paint: Piece['paint']; k?: number };
}): Piece[] {
  const m = newCM(), P = o.path, n = P.length, C = o.around ?? 6, tp = o.taper ?? 0.4, fl = o.flat ?? 0.8, kn = o.knuckle ?? 0.22;
  const rings: Ring[] = [], frames: { d: V3; x: V3; y: V3 }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), d = nrm(sub(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]));
    let y = scl(o.pad, -1); y = nrm(sub(y, scl(d, dot(y, d)))); // y: the back of the digit (away from the pad)
    const x = nrm(crs(y, d));
    frames.push({ d, x, y });
    let k = 1 - tp * t;
    for (const j of o.joints) k += kn * gs(t, j, 0.045);
    const r = o.r * k * (i === n - 1 ? 0.55 : 1);
    // flattened, the knuckle on the back a little proud, a pad underneath
    const pts = Array.from({ length: C }, (_, j) => { const a = (j / C) * TAU, s = Math.sin(a), c = Math.cos(a); return [s * r, c * r * fl * (c > 0 ? 1 : 1.1)]; });
    rings.push({ c: P[i], x, y, pts });
  }
  const g = tube(m, rings, { tag: 0, capS: false, capE: true });
  for (const j of o.joints) { const i = Math.round(j * (n - 1)); if (i > 0 && i < n - 1) creaseRow(m, g, i, 0.7, true); }
  const fin: Piece = { name: o.name, m, grids: [g], levels: o.levels ?? 1, skin: o.skin, paint: o.paint, k: o.k ?? 1.2 };
  if (!o.claw) return [fin];
  // the claw: rooted in the last third under the back of the digit, keeled on top, flat-sided, hooking to the pad
  const cw = o.claw, f = frames[n - 1], base = add(lerp(P[n - 2], P[n - 1], 0.4), scl(f.y, o.r * 0.15)), cm = newCM(), cr: Ring[] = [];
  const K = 6;
  for (let k = 0; k < K; k++) {
    const s = k / (K - 1), bend = cw.curl * s * s;
    const dir = nrm(add(scl(f.d, Math.cos(bend * 1.4)), scl(f.y, -Math.sin(bend * 1.4))));
    const c = add(add(base, scl(f.d, cw.len * s * (1 - bend * 0.3))), scl(f.y, -cw.len * bend * 0.55));
    const rr = cw.r * (s < 0.2 ? 1 : 1 - ((s - 0.2) / 0.8) * 0.94);
    const yy = nrm(crs(f.x, dir));
    cr.push({ c, x: f.x, y: scl(yy, -1), pts: Array.from({ length: 6 }, (_, j) => { const a = (j / 6) * TAU, cc = Math.cos(a); return [Math.sin(a) * rr * 0.6, (cc > 0 ? cc * 1.2 : cc * 0.5) * rr]; }) });
  }
  const gc = tube(cm, cr, { tag: 0, capS: true, capE: true });
  creaseCol(cm, gc, 0, 0, K - 1, 1.5, true);
  return [fin, { name: o.name + 'C', m: cm, grids: [gc], levels: 1, skin: cw.skin, paint: cw.paint, k: cw.k ?? 1.4 }];
}

// ------------------------------------------------------------------------------------------------ the hand painter
/** a stroke layer: strokes `len` long and `wid` wide (m), running along the chart (v, `flow` +1 or -1) or round it
 *  (`across`), leaning down the flanks by `lean`; `jag` wobbles their sides */
export interface StrokeOpt { len: number; wid: number; flow?: number; lean?: number; across?: boolean; seed?: number }
/** per texel: the stroke's value (-1..1), its position along the stroke (0 root .. 1 tip) and its id (0..1) */
export interface Strokes { v: Float32Array; f: Float32Array; id: Float32Array }
export function strokes(px: Px, o: StrokeOpt): Strokes {
  const { w, h, n } = px, tpm = 1 / px.mpt, seed = o.seed ?? 5, flow = o.flow ?? 1;
  const out: Strokes = { v: new Float32Array(n), f: new Float32Array(n), id: new Float32Array(n) };
  const lenT = Math.max(2, o.len * tpm), widT = Math.max(1.6, o.wid * tpm), wrap = px.ch.wrap;
  let cm = 0; for (let y = 0; y < h; y++) cm += px.circ[y]; cm /= Math.max(1, h);
  const circT = cm * tpm, nc = Math.max(3, Math.round(circT / widT));
  const one = (A: number, B: number, c: number, r0: { f: number; r: number }) => {
    const Lc = lenT * (0.6 + 0.8 * h3(c, 1, seed)), s = (B + h3(c, 2, seed) * Lc) / Lc, r = Math.floor(s);
    r0.f = s - r; r0.r = r; void A;
  };
  const q = { f: 0, r: 0 };
  for (let y = 0; y < h; y++) {
    const Yt = px.Y[y] * tpm, rowC = px.circ[y] * tpm;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, u = (x + 0.5) / w;
      let A: number, B: number;
      if (!o.across) {
        A = wrap ? u * nc : (u * rowC) / widT;
        B = Yt * flow;
        if (o.lean && wrap) A += Math.sin((u - 0.5) * TAU) * o.lean * (B / widT) * 0.35;
        A += Math.sin(B * 0.21 + h3(Math.floor(A), 3, seed) * 6) * 0.18; // a wobble down the stroke
      } else {
        A = Yt / widT + Math.sin(u * 37 + h3(Math.floor(Yt / widT), 3, seed) * 6) * 0.18;
        B = wrap ? u * circT : u * rowC;
      }
      let c = Math.floor(A); const e = (A - c) * 2 - 1;
      one(A, B, wrap && !o.across ? ((c % nc) + nc) % nc : c, q);
      // tapered ends: near either end of a stroke its neighbour's stroke shows through at the sides
      const tw = 0.4 + 0.6 * Math.sqrt(Math.max(0, 1 - (2 * q.f - 1) ** 2));
      if (Math.abs(e) > tw) { c += e > 0 ? 1 : -1; one(A, B, wrap && !o.across ? ((c % nc) + nc) % nc : c, q); }
      const cc = wrap && !o.across ? ((c % nc) + nc) % nc : c;
      out.v[i] = h3(cc, q.r, seed) * 2 - 1; out.f[i] = q.f; out.id[i] = h3(cc * 7 + 3, q.r, seed + 11);
    }
  }
  return out;
}

/** what the texel callback reads: the skin strokes (sv, sf, sid) and the fur strokes (fv, ff, fid) under the texel */
export interface StrokeAt { sv: number; sf: number; sid: number; fv: number; ff: number; fid: number }
export interface BrushOpts {
  /** baked sky occlusion (Px.lightK) and the baked key light from above (steps per unit of normal.y) */
  lightK?: number; key?: number;
  /** strokes on bare skin (default: short, round the form) and on fur (along the flow); amp = steps of variation */
  skin?: StrokeOpt & { amp?: number };
  fur?: StrokeOpt & { amp?: number; tip?: number; root?: number };
  /** per texel: choose the material (px.put, px.rough ...) and return how furry it is (0 bare .. 1 coat) */
  texel: (px: Px, i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, s: StrokeAt) => number;
  /** crease ink: [threshold, dark, lit] */
  ink?: [number, number, number];
  /** last marks before the flush */
  after?: (px: Px, fur: Float32Array, S: { skin: Strokes; fur: Strokes | null }) => void;
  glow?: (px: Px, i: number) => boolean;
}
export function brush(o: BrushOpts) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.lightK = o.lightK ?? 0.7;
    const so = o.skin ?? { len: 0.03, wid: 0.008, across: true };
    const S = strokes(px, so);
    yield;
    const F = o.fur ? strokes(px, o.fur) : null;
    yield;
    const fur = new Float32Array(px.n), at: StrokeAt = { sv: 0, sf: 0, sid: 0, fv: 0, ff: 0, fid: 0 };
    const key = o.key ?? 0.7, sA = so.amp ?? 0.45, fA = o.fur?.amp ?? 0.7, tip = o.fur?.tip ?? 0.9, root = o.fur?.root ?? 0.8;
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      at.sv = S.v[i]; at.sf = S.f[i]; at.sid = S.id[i];
      if (F) { at.fv = F.v[i]; at.ff = F.f[i]; at.fid = F.id[i]; }
      const k = fur[i] = o.texel(px, i, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], at);
      // the form, lit from above: top planes lighter, undersides darker (the ramps carry the warm/cool shift)
      let mk = key * N[i * 3 + 1];
      mk += (1 - k) * sA * at.sv;
      if (F && k > 0) mk += k * (fA * at.fv + (at.ff > 0.72 ? tip : 0) - (at.ff < 0.16 ? root : 0));
      px.mark[i] += mk;
    }
    yield;
    const ik = o.ink ?? [1.2, 1.1, 0.6];
    px.creaseInk(ik[0], { dark: ik[1], lit: ik[2] });
    o.after?.(px, fur, { skin: S, fur: F });
    yield;
    px.flush(o.glow ? { glow: (i) => o.glow!(px, i) } : {});
  };
}
/** claws, teeth, horn: one ramp from a dark root to a pale tip along the chart (v), strokes along the length, a
 *  lit ridge; `root` and `tipStep` the steps at either end */
export function bone(R: number[], o: { root?: number; tipStep?: number; rough?: number; flip?: boolean; key?: number; wet?: boolean } = {}) {
  return brush({
    lightK: 0.6, key: o.key ?? 0.5,
    skin: { len: 0.02, wid: 0.003, amp: 0.5 },
    texel: (px, i) => {
      const y = Math.floor(i / px.w), t = px.h > 1 ? y / (px.h - 1) : 0, f = o.flip ? 1 - t : t;
      px.put(i, R, (o.root ?? 1.2) + ((o.tipStep ?? R.length - 1.5) - (o.root ?? 1.2)) * f); px.rough[i] = o.rough ?? 110;
      return 0;
    },
    ink: [1.1, 1.0, 1.0],
  });
}
