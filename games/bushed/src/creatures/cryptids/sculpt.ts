// Sculpting and hand-painting helpers for the hidebehind, the agropelter and the snow wasset (the organic pass):
//   ring(...)       an anatomical cross-section written as bumps on an ellipse (11-point half profiles for trunk())
//   displace(...)   push a finalized piece along its normals: ribs, vertebrae, knuckles, wrinkles, bark ridges
//   flap(...)       an ear: a cupped flap with a rolled rim, thickness and an inner bowl, swept along a path
//   digit(...)      a knuckled finger or toe (phalanges with bulging joints, flattened, a pad underneath) and its
//                   hooked, keeled claw
//   brush(...)      the hand painter (over anatomy/handpaint.ts): per texel a material (ramp, step) and a fur amount,
//                   then the form lit from above (lit warm tops, cool undersides, AO, cavities) and visible strokes:
//                   fur locks along the creature's comb, skin strokes round the form. The texel callback reads the
//                   strokes too (wet, broken edges between colour zones, dabs of variation colour)
//   bone(...)       the same painter for claws, teeth and horn: dark root to pale tip, strokes along the length
// Creature space: metres, +z forward, +y up.
import { Px, h3, cl, newCM, tube, creaseRow, creaseCol, hand, type Hand, type Flow, type StrokeOpts, type V3, type Wt, type Chart, type Piece, type Body, type CM, type Ring } from '../anatomy';

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
/** carve a socket into a finalized piece: points within `R` of the axis line through `c` (along `ax`) that stand in
 *  front of a bowl (its floor `floor` along the axis behind c, its rim `rim` in front of c at radius R) are pushed
 *  back onto it, so an eye at c sits deep under a rim */
export function carve(body: Body, p: Piece, c: V3, ax: V3, R: number, floor: number, rim: number) {
  body.finalize(p);
  const a0 = nrm(ax);
  p.m.V = p.m.V.map((v) => {
    const d = sub(v, c), a = dot(d, a0), rho = Math.hypot(...sub(d, scl(a0, a)));
    if (rho >= R || a < -R) return v;
    const bowl = -floor + (rim + floor) * (rho / R) ** 2, w = 1 - sm(0.82, 1, rho / R);
    return a > bowl ? sub(v, scl(a0, (a - bowl) * w)) : v;
  });
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
// brush() is a thin layer over the shared hand-painting pass (anatomy/handpaint.ts): the creature's texel callback lays
// the local colour (it reads per-texel stroke fields, so colour zones break along the brush strokes: wet edges, dabs),
// then Hand.form() lights the form from above (lit tops, cool undersides, AO, cavities, ridge highlights, hue-shifted
// ramps) and Hand.strokes() lays the fur locks along the creature's comb and the skin strokes round the form.
/** a stroke layer: strokes `len` long and `wid` wide (m) along `flow` (a creature-space comb direction, 'sweep' along
 *  the chart, 'across' round it); amp = steps of variation, tip/root light the lock's tip and darken its root */
export interface StrokeOpt { len: number; wid: number; flow?: Flow; amp?: number; tip?: number; root?: number; gap?: number; seed?: number; dabs?: StrokeOpts['dabs'] }
/** what the texel callback reads: a value constant along each skin stroke (sv -1..1) and its id (sid 0..1), the same
 *  for the fur locks (fv, fid) */
export interface StrokeAt { sv: number; sid: number; fv: number; fid: number }
export interface BrushOpts {
  /** the form light: steps between lit top and underside (default 2.4), AO (default 2.2), cavity ink (default 1.4) */
  light?: number; ao?: number; cavity?: number; ridge?: number;
  /** skin strokes (default short, round the form) and fur locks (only where the texel callback returns fur) */
  skin?: StrokeOpt;
  fur?: StrokeOpt;
  /** per texel: choose the material (px.put, px.rough ...) and return how furry it is (0 bare .. 1 coat) */
  texel: (px: Px, i: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, s: StrokeAt) => number;
  /** last marks before the flush */
  after?: (px: Px, fur: Float32Array, hp: Hand) => void;
  glow?: (px: Px, i: number) => boolean;
  seed?: number;
}
const toT = (px: Px, m: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, m / px.mpt));
export function brush(o: BrushOpts) {
  return function* (ch: Chart, _p: Piece, b: Body) {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, seed = o.seed ?? 17;
    const sk = o.skin ?? { len: 0.03, wid: 0.007, flow: 'across' as Flow }, fu = o.fur;
    const hp = hand(px, { flow: sk.flow ?? 'across', seed });
    const lens = (s: StrokeOpt): [number, number] => { const L = toT(px, s.len, 3, 30); return [Math.max(3, L * 0.55), L * 1.25]; };
    const wids = (s: StrokeOpt): [number, number] => { const W = toT(px, s.wid, 1.5, 4); return [Math.max(1.5, W * 0.75), Math.min(4.5, W * 1.3)]; };
    const fS = hp.field({ flow: sk.flow ?? 'across', len: lens(sk), width: wids(sk), seed: seed + 3 });
    yield;
    const fF = fu ? hp.field({ flow: fu.flow ?? 'sweep', len: lens(fu), width: wids(fu), seed: seed + 9 }) : null;
    yield;
    const fur = new Float32Array(px.n), at: StrokeAt = { sv: 0, sid: 0, fv: 0, fid: 0 };
    for (let i = 0; i < px.n; i++) {
      if ((i & 8191) === 0) yield;
      at.sv = fS[i] * 2 - 1; at.sid = (fS[i] * 7.31) % 1;
      if (fF) { at.fv = fF[i] * 2 - 1; at.fid = (fF[i] * 7.31) % 1; }
      fur[i] = o.texel(px, i, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], at);
    }
    yield;
    hp.form({ light: o.light ?? 2.4, ao: o.ao ?? 2.0, cavity: o.cavity ?? 1.4, ridge: o.ridge ?? 0.8 });
    if (fu) hp.strokes({ flow: fu.flow ?? 'sweep', len: lens(fu), width: wids(fu), amp: fu.amp ?? 0.7, tip: fu.tip ?? 0.8, root: fu.root ?? 0.7, gap: fu.gap ?? 0.5, dabs: fu.dabs, seed: seed + 21, mask: (i) => fur[i] });
    yield;
    hp.strokes({ flow: sk.flow ?? 'across', len: lens(sk), width: wids(sk), amp: sk.amp ?? 0.5, dabs: sk.dabs, seed: seed + 29, mask: (i) => 1 - fur[i] });
    o.after?.(px, fur, hp);
    yield;
    px.flush(o.glow ? { glow: (i) => o.glow!(px, i) } : {});
  };
}
/** claws, teeth, horn: one ramp from a dark root to a pale tip along the chart (v), strokes along the length */
export function bone(R: number[], o: { root?: number; tipStep?: number; rough?: number; flip?: boolean; wet?: boolean } = {}) {
  return brush({
    light: 1.8, ao: 1.2, cavity: 1.0, ridge: 1.0,
    skin: { len: 0.02, wid: 0.003, amp: 0.45, flow: 'sweep' },
    texel: (px, i) => {
      const y = Math.floor(i / px.w), t = px.h > 1 ? y / (px.h - 1) : 0, f = o.flip ? 1 - t : t;
      px.put(i, R, (o.root ?? 1.2) + ((o.tipStep ?? R.length - 1.5) - (o.root ?? 1.2)) * f); px.rough[i] = o.rough ?? 110;
      return 0;
    },
  });
}
