// ORGANIC HELPERS shared by BUSHED's hand-sculpted creatures (Granny Tamarack, the dingbats, the small wildlife, the
// deer and moose). Kept here, beside the anatomy library, until it grows these:
//   almondLid()   an eyelid that leaves a lens-shaped slice of eye (never a disc): a thick shell over the eyeball
//                 whose margin runs from the inner corner to the outer corner in an arc, rooted deep in the socket,
//                 a rounded margin and a fold of skin over a heavy lid; upper lids blink by turning on the lid bone
//   strokes()     visible brush strokes over a painted chart: texel clusters 2-4 wide laid along a 3D flow field (the
//                 fur's lie, the run of a fold, down a cheek), overlapping, each nudging the step lighter or darker;
//                 returns the stroke buffer so a painter can break zone edges along the strokes (wet edges) and drop
//                 dabs of a variation colour
//   formLight()   the baked form light the brief asks for: a soft key from above and in front (top planes lighter and
//                 warmer, undersides darker and cooler: the ramps are hue-shifted), on top of the sky occlusion
//   cupEar()      an ear as a cupped flap: a rim, thickness and an inner bowl, a root that grows out of the head
import {
  newCM, sheetGrid, tube, creaseRow, type V3, type Wt, type Piece, type Chart, type Body, type Px, type Ring,
} from '../anatomy';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const G = (v: number, c: number, w: number) => Math.exp(-((v - c) * (v - c)) / (w * w));
const h3 = (a: number, b: number, c: number) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul((c | 0) + 0x3c6ef372, 0x9e3779b1); x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
type Paint = (c: Chart, p: Piece, b: Body) => void | Iterator<unknown>;

/** the frame of an eye: its look axis, the horizontal outward direction (away from the nose) and up */
export function eyeFrame(ax: V3, outSide: number): { ax: V3; out: V3; up: V3 } {
  const a = nrm(ax);
  let out = nrm(crs([0, 1, 0], a)); if (out[0] * outSide < 0) out = scl(out, -1);
  let up = nrm(crs(a, out)); if (up[1] < 0) up = scl(up, -1);
  return { ax: a, out, up };
}
export interface LidSpec {
  name: string; c: V3; ax: V3; r: number; bone: number; paint: Paint;
  /** +1 the left eye (outer corner toward +x), -1 the right */
  side: number;
  lower?: boolean;
  /** the margin's lift at the middle of the eye (rad from the axis), the opening's half width (rad round the eye), the
   *  heights (rad) of the inner and outer corners */
  open: number; wide: number; inner: number; outer: number;
  /** the lid's radii (x eye radius): the inner face, the outer face; a swelling of the outer face partway to the root
   *  (a heavy lid) */
  ri?: number; ro?: number; swell?: number;
  /** how far the lid wraps back from the axis (rad) */
  root?: number;
  /** points across */
  across?: number;
  k?: number;
}
/** an eyelid shaped by its margin: lens-shaped openings, corners that meet (see LidSpec) */
export function almondLid(o: LidSpec): Piece {
  const m = newCM(), F = eyeFrame(o.ax, o.side), sg = o.lower ? -1 : 1;
  const ri = o.ri ?? 1.04, ro = o.ro ?? 1.14, root = o.root ?? 1.45, N = o.across ?? 6, K = 3;
  const dir = (al: number, be: number): V3 => nrm(add(scl(add(scl(F.ax, Math.cos(al)), scl(F.out, Math.sin(al))), Math.cos(be)), scl(F.up, Math.sin(be))));
  const margin = (s: number) => { const t = (Math.max(-1, Math.min(1, s)) + 1) / 2, base = o.inner + (o.outer - o.inner) * t; return base + sg * o.open * Math.pow(Math.max(0, 1 - s * s), 0.72); };
  const rows: V3[][] = [];
  for (let k = 0; k <= N; k++) {
    const s = -1.22 + (2.44 * k) / N, al = Math.max(-1.22, Math.min(1.22, s)) * o.wide, bm = margin(s), br = sg * root;
    const row: V3[] = [];
    // the outer face from the root to the margin, the rounded margin, the inner face back to the root
    for (let q = 0; q < K; q++) {
      const t = q / (K - 1), be = br + (bm - br) * Math.pow(t, 0.85);
      const rr = ro + (o.swell ?? 0) * G(t, 0.55, 0.25) * Math.max(0, 1 - Math.abs(s) * 0.6);
      row.push(add(o.c, scl(dir(al, be), o.r * rr)));
    }
    row.push(add(o.c, scl(dir(al, bm - sg * 0.035), o.r * (ri + ro) * 0.5)));
    for (let q = K - 1; q >= 0; q--) { const t = q / (K - 1), be = br + (bm - br) * Math.pow(t, 0.85); row.push(add(o.c, scl(dir(al, be + sg * 0.01), o.r * ri))); }
    rows.push(row);
  }
  const g = sheetGrid(m, rows, { tag: 0, out: (p) => sub(p, o.c), wrapCols: true, capS: true, capE: true });
  void creaseRow;
  return { name: o.name, m, grids: [g], levels: 1, skin: () => [o.bone, 1], paint: o.paint, k: o.k ?? 1.8, noOcc: true };
}
/** where a point sits on a lid: across (-1 inner corner .. 1 outer) and the angle above (upper) or below the margin */
export function lidCoords(o: LidSpec, p: V3): { s: number; off: number; be: number } {
  const F = eyeFrame(o.ax, o.side), d = nrm(sub(p, o.c));
  const be = Math.asin(Math.max(-1, Math.min(1, dot(d, F.up)))), al = Math.atan2(dot(d, F.out), dot(d, F.ax));
  const s = al / o.wide, t = (Math.max(-1, Math.min(1, s)) + 1) / 2, base = o.inner + (o.outer - o.inner) * t;
  const bm = base + (o.lower ? -1 : 1) * o.open * Math.pow(Math.max(0, 1 - s * s), 0.72);
  return { s, off: (be - bm) * (o.lower ? -1 : 1), be };
}

// ------------------------------------------------------------------------------------------------ painting
/** the baked key light: + toward the light (from above and a little in front), soft, scaled by k (ramp steps) */
export function formLight(px: Px, k = 0.9, from: V3 = [0.25, 1, 0.55]) {
  const L = nrm(from), N = px.gb.N;
  for (let i = 0; i < px.n; i++) {
    const l = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2];
    px.mark[i] += (l > 0 ? l * 0.9 : l * 0.6) * k;
  }
}
export interface StrokeOpt {
  /** the direction strokes run at a surface point (creature space); null leaves the texel unstroked */
  flow: (p: V3, n: V3) => V3 | null;
  /** stroke length and width in texels [min, max] */
  len?: [number, number]; width?: [number, number];
  /** the step a stroke adds, at most (strokes are lighter or darker; `lift` biases them toward the light) */
  amp?: number; lift?: number;
  /** strokes per texel of surface */
  density?: number;
  mask?: (i: number) => number;
  seed?: number;
  /** add the strokes to the marks (default) or only return them */
  apply?: boolean;
}
/** brush strokes laid along a flow field: each a short run of texels 2-4 wide, overlapping (the later on top), with
 *  a value in -1..1; returns { v: the value under each texel (0 none), id: a per-stroke hash 0..1 (-1 none) } */
export function strokes(px: Px, o: StrokeOpt): { v: Float32Array; id: Float32Array } {
  const { w, h, n } = px, P = px.gb.P, N = px.gb.N, M = px.gb.M;
  const v = new Float32Array(n), id = new Float32Array(n).fill(-1);
  const seed = o.seed ?? 7, [l0, l1] = o.len ?? [4, 9], [w0, w1] = o.width ?? [2, 3.4], amp = o.amp ?? 0.7, lift = o.lift ?? 0.35;
  const wrap = px.ch.wrap;
  const at = (x: number, y: number) => { if (y < 0 || y >= h) return -1; if (wrap) x = ((x % w) + w) % w; else if (x < 0 || x >= w) return -1; return y * w + x; };
  // the 2D texel step that moves along a 3D direction at texel i (least squares on the local derivatives)
  const step2 = (x: number, y: number, d: V3): [number, number] | null => {
    const i = at(x, y), ix = at(x + 1, y) >= 0 ? at(x + 1, y) : at(x - 1, y), iy = at(x, y + 1) >= 0 ? at(x, y + 1) : at(x, y - 1);
    if (i < 0 || ix < 0 || iy < 0) return null;
    const sx = at(x + 1, y) >= 0 ? 1 : -1, sy = at(x, y + 1) >= 0 ? 1 : -1;
    const a: V3 = [(P[ix * 3] - P[i * 3]) * sx, (P[ix * 3 + 1] - P[i * 3 + 1]) * sx, (P[ix * 3 + 2] - P[i * 3 + 2]) * sx];
    const b: V3 = [(P[iy * 3] - P[i * 3]) * sy, (P[iy * 3 + 1] - P[i * 3 + 1]) * sy, (P[iy * 3 + 2] - P[i * 3 + 2]) * sy];
    const aa = dot(a, a), bb = dot(b, b), ab = dot(a, b), ad = dot(a, d), bd = dot(b, d), det = aa * bb - ab * ab;
    if (det < 1e-18) return null;
    let u = (bb * ad - ab * bd) / det, vv = (aa * bd - ab * ad) / det;
    const l = Math.hypot(u, vv); if (l < 1e-9) return null;
    u /= l; vv /= l; return [u, vv];
  };
  const count = Math.round((n * (o.density ?? 0.5)) / (((l0 + l1) / 2) * ((w0 + w1) / 2)));
  const L = nrm([0.25, 1, 0.55]);
  for (let s = 0; s < count; s++) {
    let x = Math.floor(h3(s, 1, seed) * w), y = Math.floor(h3(s, 2, seed) * h);
    const i0 = at(x, y); if (i0 < 0 || !M[i0]) continue;
    const mk = o.mask ? o.mask(i0) : 1; if (mk <= 0.02 || h3(s, 9, seed) > mk) continue;
    const p0: V3 = [P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]], n0: V3 = [N[i0 * 3], N[i0 * 3 + 1], N[i0 * 3 + 2]];
    const d0 = o.flow(p0, n0); if (!d0) continue;
    const len = l0 + (l1 - l0) * h3(s, 3, seed), wid = w0 + (w1 - w0) * h3(s, 4, seed);
    // lighter strokes where the form turns to the light, darker where it turns away
    const lit = dot(n0, L), val = Math.max(-1, Math.min(1, (h3(s, 5, seed) * 2 - 1) * 0.8 + lit * lift * 1.6)) * amp;
    const sid = h3(s, 6, seed);
    let fx = x + 0.5, fy = y + 0.5, d = d0;
    for (let k = 0; k < len; k++) {
      const st = step2(Math.floor(fx), Math.floor(fy), nrm(d)); if (!st) break;
      // the stroke tapers at both ends
      const tk = k / Math.max(1, len - 1), ww = wid * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, tk * 1.1 + 0.05)));
      const px2 = -st[1], py2 = st[0];
      for (let q = -ww / 2; q <= ww / 2; q += 0.7) {
        const j = at(Math.floor(fx + px2 * q), Math.floor(fy + py2 * q));
        if (j < 0 || !M[j]) continue;
        v[j] = val; id[j] = sid;
      }
      fx += st[0]; fy += st[1];
      const jj = at(Math.floor(fx), Math.floor(fy)); if (jj < 0 || !M[jj]) break;
      const dn = o.flow([P[jj * 3], P[jj * 3 + 1], P[jj * 3 + 2]], [N[jj * 3], N[jj * 3 + 1], N[jj * 3 + 2]]); if (!dn) break;
      // bend gently toward the new flow (strokes are not perfectly straight)
      d = nrm(add(scl(d, 0.6), scl(dn, 0.4)));
    }
  }
  if (o.apply !== false) for (let i = 0; i < n; i++) if (v[i]) px.mark[i] += v[i] * (o.mask ? o.mask(i) : 1);
  return { v, id };
}
/** a flow that runs down the surface (gravity: hair, drapery, drips), falling back to `alt` on level ground */
export const downFlow = (alt: V3 = [0, 0, -1]) => (_p: V3, n: V3): V3 => { const g: V3 = [0, -1, 0]; const t = sub(g, scl(n, dot(g, n))); return Math.hypot(t[0], t[1], t[2]) > 0.15 ? nrm(t) : nrm(sub(alt, scl(n, dot(alt, n)))); };
/** a flow along a direction projected on the surface */
export const alongFlow = (dir: V3) => (_p: V3, n: V3): V3 => { const t = sub(dir, scl(n, dot(dir, n))); return nrm(Math.hypot(t[0], t[1], t[2]) > 0.05 ? t : crs(n, [1, 0, 0])); };

// ------------------------------------------------------------------------------------------------ ears
export interface EarSpec {
  name: string;
  /** the root (buried in the head), the direction the ear grows, the direction its bowl opens toward */
  root: V3; dir: V3; face: V3;
  /** length, the widest half width (m), its thickness (m), how deep the bowl is (x half width), the rim's roll */
  len: number; wid: number; th: number; cup?: number;
  /** the outline: half width by t (0 root .. 1 tip), the tip's lean back (m) */
  shape?: (t: number) => number; lean?: number;
  skin: (p: V3) => Wt; paint: Paint; k?: number; levels?: number;
}
/** a cupped ear: rings from the root to the tip, each a U of a bowl (a rim rolled forward at the edges, a thin back),
 *  so the ear has a rim, thickness and an inner bowl; never a tube */
export function cupEar(o: EarSpec): Piece {
  const m = newCM(), up = nrm(o.dir), fc = nrm(sub(o.face, scl(up, dot(o.face, up)))), sd = nrm(crs(up, fc));
  const shape = o.shape ?? ((t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.92)), 0.75));
  const C = 12, cup = o.cup ?? 0.45, NR = 7, rings: Ring[] = [];
  for (let k = 0; k <= NR; k++) {
    const t = k / NR, hw = o.wid * Math.max(0.12, shape(t)) * (k === 0 ? 0.7 : 1), c = add(add(o.root, scl(up, o.len * (t * 1.05 - 0.05))), scl(fc, -(o.lean ?? 0) * t * t));
    const pts: number[][] = [];
    for (let j = 0; j < C; j++) {
      // a closed loop: the front (bowl) face across from one rim to the other, then the back face
      const a = (j / C) * Math.PI * 2, x = Math.sin(a), front = Math.cos(a) > 0;
      const bowl = front ? -cup * hw * (1 - x * x) * (1 - t * 0.4) : 0; // the bowl dips in behind the rims
      const rim = Math.pow(Math.abs(x), 6) * hw * 0.12; // the rims roll forward
      const y = front ? o.th * 0.5 + bowl + rim : -o.th * 0.5 - (1 - x * x) * o.th * 0.6 * (1 - t);
      pts.push([x * hw, y]);
    }
    rings.push({ c, x: sd, y: fc, pts });
  }
  const g = tube(m, rings, { tag: 0, capS: true, capE: true });
  return { name: o.name, m, grids: [g], levels: o.levels ?? 1, skin: o.skin, paint: o.paint, k: o.k ?? 1.3 };
}
export { h3 as hash3 };
