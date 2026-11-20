// HAND PAINTING: the shared paint pass for BUSHED's creatures (the art brief's paint rules as a call or two). It works
// on a Px (paint.ts) after its base colours are laid, and before flush():
//
//   const px = new Px(ch, b);
//   px.base((i) => [RP('fur'), 3]);                       // the local colour, as today
//   const hp = hand(px, { flow: 'sweep' });                // the flow strokes follow: the cage's sweep, or a direction
//   hp.zones([                                             // big colour masses with soft, brush-broken wet edges
//     { w: (p, n) => n[1] < -0.3 ? 1 : 0, ramp: RP('straw'), step: 4 },          // a lighter belly
//     { w: (p) => p[1] > 0.5 ? 1 : 0, add: -0.6 },                               // a darker back (same ramp)
//   ]);
//   hp.form();                                             // baked soft top light, AO, cavity ink, ridge highlights,
//                                                          //   ramps hue-shifted (cool shadows, warm lights)
//   hp.strokes({ len: [5, 12], width: [2, 3] });           // directional brush strokes along the flow
//   hp.hollows([{ c: eyeCentre, r: 0.03 }]);                // cavity darkening round eyes, nostrils, mouth corners
//   px.flush();
//
// or all at once:  handpaint(px, { flow: (p, n) => [0, -0.3, -1], zones: [...], strokes: { gap: 0.8 } }); px.flush();
//
// Flow: 'sweep' (along the chart's rings: a trunk's sweep from its first station to its last, a limb's from hip to
// sole), 'across' (round the rings), a fixed creature-space vector (fur combed back: [0, -0.3, -1]) or a function of
// the surface point and normal (fur that parts down the spine, swirls on the cheeks). Strokes are texel clusters 2-4
// wide and 5-12 long, each lighter or darker by a ramp step (lighter where the key light falls), overlapping, the
// last one laid on top; `gap` darkens the uncovered texels between them (the underfur between clumps under shell
// fur), `tip`/`root` light the far end and darken the near end of every stroke (fur locks), `dabs` lay a share of the
// strokes in a variation colour. Zones and strokes key their random choices on the chart's texels, so a build is
// deterministic.
//
// Eyes and lids (organic sockets: the brief's eye rules): paintedEye() is an eyeball with a bulging cornea and a
// painted iris (dark limbal ring, hue-shifted iris with fibres and a lit lower crescent, a species pupil, a hard glint
// and a small second one), lids() an almond pair of thick lids with rolled margins whose opening is a lens, never a
// disc; lidPaint() paints a lid in the creature's skin with a lash line or a wet lower rim.
//
// Zones paint over whatever is under them: pass zones(zs, { mask: (i) => ... }) to keep them off texels you set yourself
// (a mouth's gum, a nose). Strokes take a `mask` too. Cost: about a second for a 1024 page of strokes and zones.
//
// Sculpting (geometry, see sculpt.ts): displace(), relief() (scale plates pushed into a finalized trunk, laid out like
// Px.scales so the paint and the plates agree), earFlap() (a cupped flap with a rim, thickness and inner bowl),
// foldsFn() (skin folds as a displacement), mouthWebs() (cheeks and a throat wall that stretch shut the sides and back of
// a mouth as the jaw drops). Organic ring profiles for trunk(): PROFILES keel, pear, slab, hump, sack, crest.
import { Px, h3, cl } from './paint';
import { RAMPS } from './palette';
import { newCM, tube, sheetGrid, creaseRow, type Ring } from './cage';
import type { V3 } from './kit';
import type { Piece, Chart, Body } from './core';

const TAU = Math.PI * 2;
const ss = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const RP = (k: keyof typeof RAMPS) => RAMPS[k] as unknown as number[];

/** which way strokes run: along the chart's sweep, round it, a creature-space direction, or one per surface point */
export type Flow = 'sweep' | 'across' | V3 | ((p: V3, n: V3) => V3);
/** the default key light: soft, from above and a little in front */
export const KEY: V3 = nrm([0.18, 1, 0.42]);

export interface FormOpts {
  /** the key light direction (creature space), default KEY */
  key?: V3;
  /** steps between the fully lit top and the underside (default 2.4) */
  light?: number;
  /** how far the light wraps round the form (0 hard terminator .. 1 very soft, default 0.55) */
  wrap?: number;
  /** quantise the light into this many flat planes (0 = let the ramp rounding band it, the default) */
  bands?: number;
  /** ambient occlusion: steps darker at full occlusion (default 2.2) */
  ao?: number;
  /** cavity ink in creases and valleys (steps, default 1.4) and the ridge highlight (default 0.8) */
  cavity?: number; ridge?: number;
  /** the curvature where cavity and ridge start (default 0.45) */
  crease?: number;
  /** hue shift of the ramps' ends at flush (default 1; 0 keeps the ramps as they are) */
  hue?: number;
  /** a constant added everywhere (steps) */
  lift?: number;
  /** where it applies (0..1); elsewhere the default Px shading */
  mask?: (i: number) => number;
}
export interface StrokeOpts {
  /** which way the strokes run (default the Hand's flow) */
  flow?: Flow;
  /** stroke length and width in texels: [min, max] (defaults [5, 12] and [2, 3]) */
  len?: [number, number]; width?: [number, number];
  /** seeds every `spacing` texels (default 3: every texel ends up under a stroke or two) */
  spacing?: number;
  /** how much a stroke lightens or darkens (steps, default 0.7) */
  amp?: number;
  /** crisp strokes: each stroke is a whole ramp step lighter or darker (a clean 2-4 texel cluster) or not shown at all,
   *  shown with a chance of amp / 0.7 (default false: fractional strokes that show where the light bands turn) */
  crisp?: boolean;
  /** 0..1: how much the key light decides a stroke's sign (lighter where lit, darker in shadow; default 0.7) */
  lit?: number;
  /** darken texels no stroke covers (the underfur between clumps; default 0) */
  gap?: number;
  /** light the far end (tip) and darken the near end (root) of every stroke (fur locks; default 0) */
  tip?: number; root?: number;
  /** a darker edge down the shadow side of every stroke (steps, default 0) */
  edge?: number;
  /** random turn per texel (radians, default 0.12): strokes wander a little */
  curl?: number;
  /** thinning toward both ends (0 .. 1, default 0.6) */
  taper?: number;
  /** a share of the strokes laid in a variation colour (an absolute ramp and step) */
  dabs?: { ramp: number[]; step: number; share: number }[];
  /** where strokes are laid (0..1, sampled at the seed and every texel) */
  mask?: (i: number) => number;
  seed?: number;
}
/** a colour zone: where `w` (0..1, smooth) passes one half, the texel takes `ramp` and `step`, or adds `add` steps to its
 *  own; the edge breaks along the brush strokes (soft) and pools a little darker just inside it (a wet edge) */
export interface Zone {
  w: (p: V3, n: V3, i: number) => number;
  ramp?: number[]; step?: number; add?: number;
  /** how much the edge breaks up along the strokes (0 crisp .. 1 ragged, default the zones' soft) */
  soft?: number;
  /** the wet edge: steps darker just inside the zone (default the zones' edge) */
  edge?: number;
}
export interface Hollow { c: V3; r: number; k?: number }

/** the hand-painting pass on one chart (see the header) */
export class Hand {
  readonly px: Px;
  flow: Flow;
  key: V3;
  seed: number;
  private dirCache = new Map<unknown, { dx: Float32Array; dy: Float32Array }>();
  private fieldCache: Float32Array | null = null;
  constructor(px: Px, o: { flow?: Flow; key?: V3; seed?: number } = {}) {
    this.px = px; this.flow = o.flow ?? 'sweep'; this.key = nrm(o.key ?? KEY); this.seed = o.seed ?? 17;
  }
  /** the surface point and normal of a texel (fresh arrays) */
  P(i: number): V3 { const P = this.px.gb.P; return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; }
  Nrm(i: number): V3 { const N = this.px.gb.N; return [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]; }
  /** the key light's lambert at a texel (-1..1) */
  lam(i: number) { const N = this.px.gb.N, L = this.key; return N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2]; }

  /** a unit direction in texel space per texel for a flow (cached per flow) */
  dirs(flow: Flow = this.flow): { dx: Float32Array; dy: Float32Array } {
    const hit = this.dirCache.get(flow); if (hit) return hit;
    const px = this.px, { w, h, n } = px, dx = new Float32Array(n), dy = new Float32Array(n);
    const planar = px.ch.grid < 0;
    if ((flow === 'sweep' || flow === 'across') && !planar) {
      if (flow === 'sweep') dy.fill(1); else dx.fill(1);
    } else {
      const P = px.gb.P, N = px.gb.N, wrap = px.ch.wrap;
      const q: V3 = [0, 0, 0], nn: V3 = [0, 0, 0];
      const fn = typeof flow === 'function' ? flow : null;
      const fixed: V3 = Array.isArray(flow) ? nrm(flow as V3) : flow === 'across' ? [1, 0, 0] : [0, -0.45, -1];
      // directions vary slowly: solve on every other texel each way and copy across the 2x2 block
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const i = y * w + x;
        const xl = x > 0 ? x - 1 : wrap ? w - 1 : x, xr = x < w - 1 ? x + 1 : wrap ? 0 : x, yl = y > 0 ? y - 1 : y, yr = y < h - 1 ? y + 1 : y;
        const a = (y * w + xl) * 3, b = (y * w + xr) * 3, c = (yl * w + x) * 3, d = (yr * w + x) * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
        let fx: number, fy: number, fz: number;
        if (fn) { q[0] = P[i * 3]; q[1] = P[i * 3 + 1]; q[2] = P[i * 3 + 2]; nn[0] = N[i * 3]; nn[1] = N[i * 3 + 1]; nn[2] = N[i * 3 + 2]; const r = fn(q, nn); fx = r[0]; fy = r[1]; fz = r[2]; }
        else { fx = fixed[0]; fy = fixed[1]; fz = fixed[2]; }
        // least squares: flow ~ a*U + b*V (U, V the texel tangents)
        const uu = ux * ux + uy * uy + uz * uz, vv = vx * vx + vy * vy + vz * vz, uv = ux * vx + uy * vy + uz * vz;
        const fu = fx * ux + fy * uy + fz * uz, fv = fx * vx + fy * vy + fz * vz, det = uu * vv - uv * uv;
        let A = 0, B = 1;
        if (det > 1e-14) { A = (fu * vv - fv * uv) / det; B = (fv * uu - fu * uv) / det; }
        const l = Math.hypot(A, B);
        const ddx = l > 1e-9 ? A / l : 0, ddy = l > 1e-9 ? B / l : 1;
        for (let yy = y; yy < Math.min(h, y + 2); yy++) for (let xx = x; xx < Math.min(w, x + 2); xx++) { dx[yy * w + xx] = ddx; dy[yy * w + xx] = ddy; }
      }
    }
    const out = { dx, dy };
    this.dirCache.set(flow, out);
    return out;
  }

  /** lay strokes: per texel the id of the last stroke over it (-1 none), where along it (0 root .. 1 tip) and across
   *  it (-1..1). `begin` accepts or rejects each stroke (by id and seed texel) before it is laid */
  private lay(o: StrokeOpts, begin: (k: number, i0: number) => boolean, want: { t?: boolean; e?: boolean } = {}) {
    const px = this.px, { w, h, n } = px, { dx, dy } = this.dirs(o.flow ?? this.flow), wrap = px.ch.wrap;
    const sp = Math.max(1.5, o.spacing ?? 3), [l0, l1] = o.len ?? [5, 12], [w0, w1] = o.width ?? [2, 3], curl = o.curl ?? 0.12, taper = o.taper ?? 0.6, seed = o.seed ?? this.seed;
    const sid = new Int32Array(n).fill(-1), ta = want.t ? new Float32Array(n) : null, ea = want.e ? new Float32Array(n) : null;
    // seeds on a jittered grid, laid in a shuffled order
    const gw = Math.ceil(w / sp), gh = Math.ceil((h + sp) / sp), ns = gw * gh;
    const order = new Uint32Array(ns), key = new Float32Array(ns);
    for (let k = 0; k < ns; k++) { order[k] = k; key[k] = h3(k, 7, seed); }
    order.sort((a, b) => key[a] - key[b]);
    const stepL = 0.6;
    for (let q = 0; q < ns; q++) {
      const k = order[q];
      // a small xorshift per stroke for its jitter, size and wander
      let r = (Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(seed + 7, 0x85ebca6b)) >>> 0 || 1;
      const rnd = () => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
      const sx = (k % gw) * sp + rnd() * sp, sy = Math.floor(k / gw) * sp + rnd() * sp - sp * 0.5;
      const ix = Math.floor(sx) % w, iy = Math.floor(sy);
      if (iy < 0 || iy >= h) continue;
      if (!begin(k, iy * w + ix)) continue;
      const L = l0 + (l1 - l0) * rnd(), W = w0 + (w1 - w0) * rnd(), half = L / 2;
      const ns2 = Math.max(1, Math.ceil(half / stepL)), invL = 1 / Math.max(1e-6, L);
      // trace both ways from the seed along the flow
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        let x = sx, y = sy, pdx = 0, pdy = 0, ang = 0;
        for (let s2 = 0; s2 <= ns2; s2++) {
          let xi = Math.floor(x); const yi = Math.floor(y);
          if (yi < 0 || yi >= h) break;
          if (xi < 0 || xi >= w) { if (!wrap) break; xi = ((xi % w) + w) % w; }
          const i = yi * w + xi;
          let ddx = dx[i] * sgn, ddy = dy[i] * sgn;
          if (s2 > 0 && ddx * pdx + ddy * pdy < 0) { ddx = -ddx; ddy = -ddy; }
          pdx = ddx; pdy = ddy;
          ang += (rnd() - 0.5) * curl * 2;
          const ca = Math.cos(ang), sa = Math.sin(ang), rx = ddx * ca - ddy * sa, ry = ddx * sa + ddy * ca;
          // along the stroke 0 (its root, against the flow) .. 1 (its tip, with the flow)
          const tAlong = 0.5 + sgn * s2 * stepL * invL, tt = Math.abs(tAlong - 0.5) * 2;
          const hw = (Math.max(1, W * (1 - taper * tt * tt)) - 1) / 2, ie = hw > 0 ? 1 / (hw + 0.5) : 0;
          for (let e = -hw; e <= hw + 1e-6; e += 1) {
            let X = Math.floor(x - ry * e); const Y = Math.floor(y + rx * e);
            if (Y < 0 || Y >= h) continue;
            if (X < 0 || X >= w) { if (!wrap) continue; X = ((X % w) + w) % w; }
            const j = Y * w + X;
            sid[j] = k; if (ta) ta[j] = tAlong; if (ea) ea[j] = e * ie;
          }
          x += rx * stepL; y += ry * stepL;
        }
      }
    }
    return { sid, ta, ea, ns };
  }

  /** directional brush strokes along the flow (see StrokeOpts) */
  strokes(o: StrokeOpts = {}) {
    const px = this.px, n = px.n, amp = o.amp ?? 0.7, lit = o.lit ?? 0.7, seed = o.seed ?? this.seed;
    const dabK = o.dabs ? o.dabs.map((d) => px.ramp(d.ramp)) : [];
    const sp = Math.max(1.5, o.spacing ?? 3), maxK = Math.ceil(px.w / sp) * Math.ceil((px.h + sp) / sp);
    const val = new Float32Array(maxK), dab = new Int8Array(maxK).fill(-1), side = new Int8Array(maxK);
    const tip = o.tip ?? 0, root = o.root ?? 0, gap = o.gap ?? 0, edge = o.edge ?? 0;
    const { sid, ta, ea } = this.lay(o, (k, i0) => {
      const m = o.mask ? o.mask(i0) : 1;
      if (m <= 0.05 || h3(k, 9, seed) > m * 1.2 + 0.05) return false;
      // lighter where the key light falls, darker in shadow, by a step or a little under
      const l = this.lam(i0), pLit = cl(0.5 + (l - 0.15) * lit * 0.9, 0.12, 0.88);
      val[k] = (h3(k, 5, seed) < pLit ? 1 : -1) * (o.crisp ? (h3(k, 6, seed) < amp / 0.7 ? 1 : 0) : amp * (0.55 + 0.45 * h3(k, 6, seed)));
      if (o.dabs) { let r = h3(k, 8, seed); for (let d = 0; d < o.dabs.length; d++) { if (r < o.dabs[d].share) { dab[k] = d; break; } r -= o.dabs[d].share; } }
      side[k] = l > 0.3 ? 1 : -1;
      return true;
    }, { t: !!(tip || root), e: !!edge });
    for (let i = 0; i < n; i++) {
      const m = o.mask ? o.mask(i) : 1; if (m <= 0.02) continue;
      const k = sid[i];
      if (k < 0) { px.mark[i] -= gap * m; continue; }
      let v = val[k];
      if (ta) { const t = ta[i]; if (tip && t > 0.72) v += tip * ss(0.72, 0.95, t); if (root && t < 0.28) v -= root * (1 - ss(0.05, 0.28, t)); }
      if (ea && ea[i] * side[k] < -0.6) v -= edge;
      px.mark[i] += v * m;
      if (dab[k] >= 0) { const d = o.dabs![dab[k]]; px.rampI[i] = dabK[dab[k]]; px.step[i] = d.step; }
    }
    return this;
  }

  /** a per-texel random value (0..1) constant along each brush stroke: zones break their edges on it */
  field(o: StrokeOpts = {}): Float32Array {
    const dflt = !o.len && !o.width && !o.flow;
    if (this.fieldCache && dflt) return this.fieldCache;
    const px = this.px, n = px.n, seed = (o.seed ?? this.seed) + 101;
    const { sid } = this.lay({ spacing: 4, len: [7, 15], width: [3, 4], ...o, seed }, () => true);
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) { const k = sid[i]; f[i] = k >= 0 ? h3(k, 11, seed) : h3(i >> 2, 3, seed); }
    if (dflt) this.fieldCache = f;
    return f;
  }

  /** big colour masses with soft, brush-broken wet edges (see Zone). Later zones paint over earlier ones */
  zones(zs: Zone[], o: { soft?: number; edge?: number; edgeW?: number; mask?: (i: number) => number } = {}) {
    const px = this.px, n = px.n, f = this.field(), soft = o.soft ?? 0.5, edge = o.edge ?? 0.45, ew = o.edgeW ?? 0.07;
    const P = px.gb.P, N = px.gb.N, p: V3 = [0, 0, 0], nn: V3 = [0, 0, 0];
    const ks = zs.map((z) => (z.ramp ? px.ramp(z.ramp) : -1));
    for (let i = 0; i < n; i++) {
      if (o.mask && o.mask(i) <= 0.5) continue;
      p[0] = P[i * 3]; p[1] = P[i * 3 + 1]; p[2] = P[i * 3 + 2]; nn[0] = N[i * 3]; nn[1] = N[i * 3 + 1]; nn[2] = N[i * 3 + 2];
      for (let k = 0; k < zs.length; k++) {
        const z = zs[k], w = z.w(p, nn, i);
        if (w <= 0) continue;
        const thr = 0.5 + (f[i] - 0.5) * (z.soft ?? soft);
        if (w <= thr) continue;
        if (ks[k] >= 0) px.rampI[i] = ks[k];
        if (z.step !== undefined) px.step[i] = z.step;
        if (z.add) px.step[i] += z.add;
        if (w - thr < ew) px.step[i] -= z.edge ?? edge;
      }
    }
    return this;
  }

  /** the form: a baked soft key light (lit tops, cool dark undersides), ambient occlusion, cavity ink in the creases,
   *  lighter ridges from the curvature; the ramps' ends hue-shift at flush */
  form(o: FormOpts = {}) {
    const px = this.px, n = px.n, gb = px.gb, N = gb.N, A = gb.A, K = gb.K;
    const L = nrm(o.key ?? this.key), li = o.light ?? 2.4, wrap = o.wrap ?? 0.55, ao = o.ao ?? 2.2, cav = o.cavity ?? 1.4, rdg = o.ridge ?? 0.8, ck = o.crease ?? 0.45, bands = o.bands ?? 0, lift = o.lift ?? 0;
    const F = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lam = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2];
      let t = cl((lam + wrap) / (1 + wrap), 0, 1);
      if (bands > 1) t = Math.round(t * (bands - 1)) / (bands - 1);
      let v = (t - 0.58) * li + lift;
      v -= ao * Math.pow(Math.max(0, A[i]), 1.15);
      const k = K[i];
      if (k < 0) v -= cav * ss(ck * 0.5, ck * 1.6, -k); else v += rdg * ss(ck * 0.6, ck * 1.8, k);
      F[i] = v;
    }
    if (o.mask) { for (let i = 0; i < n; i++) { const m = cl(o.mask(i), 0, 1); if (m < 1) { const old = this.oldShade(i); F[i] = old + (F[i] - old) * m; } } }
    px.form = F;
    px.hue = o.hue ?? 1;
    return this;
  }
  /** Px's own shading (before form) */
  private oldShade(i: number) { const ny = this.px.gb.N[i * 3 + 1], k = this.px.gb.K[i], a = this.px.gb.A[i]; return (ny * 0.55 - 0.1) * this.px.lightK + cl(k * 1.2, -0.8, 0.8) - a * 2.0; }

  /** cavity darkening round sockets, nostrils, mouth corners: `k` steps (default 1.6) at the centre, fading to the
   *  rim r; cooler in the deepest part through the ramp's hue-shifted dark end */
  hollows(sites: Hollow[]) {
    if (!sites.length) return this;
    const px = this.px, P = px.gb.P;
    for (let i = 0; i < px.n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let v = 0;
      for (const s of sites) {
        const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= s.r * s.r) continue;
        const t = 1 - Math.sqrt(d2) / s.r;
        v = Math.max(v, (s.k ?? 1.6) * t * t * (3 - 2 * t));
      }
      if (v > 0) px.mark[i] -= v;
    }
    return this;
  }
  /** a wet shine: the texels whose normal turns to the half vector of the key and the viewer's usual place (in
   *  front, a little above) take the ramp's lightest step (a nose, a lip, wet eyes); low roughness there */
  wet(mask: (i: number) => number, o: { ramp?: number[]; thr?: number; view?: V3; rough?: number } = {}) {
    const px = this.px, N = px.gb.N, V = nrm(o.view ?? [0.2, 0.35, 1]), Hh = nrm(add(this.key, V)), thr = o.thr ?? 0.9, R = o.ramp;
    for (let i = 0; i < px.n; i++) {
      const m = mask(i); if (m <= 0.3) continue;
      px.rough[i] = Math.min(px.rough[i], o.rough ?? 50);
      const sp = N[i * 3] * Hh[0] + N[i * 3 + 1] * Hh[1] + N[i * 3 + 2] * Hh[2];
      if (sp > thr) { const RR = R ?? px.rampT[px.rampI[i]]; px.over[i] = RR[RR.length - 1]; }
      else if (sp > thr - 0.08) px.mark[i] += 1;
    }
    return this;
  }
}
/** the hand-painting pass on a chart's Px (see the header) */
export function hand(px: Px, o: { flow?: Flow; key?: V3; seed?: number } = {}) { return new Hand(px, o); }
/** zones, form and strokes in one call (each optional: pass false to skip form or strokes) */
export function handpaint(px: Px, o: { flow?: Flow; key?: V3; seed?: number; zones?: Zone[]; zoneOpts?: { soft?: number; edge?: number }; form?: FormOpts | false; strokes?: StrokeOpts | false; hollows?: Hollow[] } = {}): Hand {
  const hp = new Hand(px, o);
  if (o.zones?.length) hp.zones(o.zones, o.zoneOpts);
  if (o.form !== false) hp.form(o.form ?? {});
  if (o.strokes !== false) hp.strokes(o.strokes ?? {});
  if (o.hollows) hp.hollows(o.hollows);
  return hp;
}

// ================================================================================================ painted eyes
export type EyePupil = 'round' | 'slit' | 'bar' | 'w' | 'pin';
export interface PaintedEyeSpec {
  name: string; c: V3; ax: V3; r: number; bone: number;
  /** the iris ramp (hue-shifted at flush) and the pupil */
  iris: number[]; pupil: EyePupil;
  /** the iris's angular radius on the ball (rad, default 0.7: a big, friendly iris), the pupil's size (fraction of the
   *  iris: a round pupil's radius, a slit's half width; default 0.38 / 0.14) */
  irisA?: number; pupilR?: number;
  /** sclera ramp (default bone), limbal ring ramp (default ink) */
  sclera?: number[]; limbal?: number[];
  /** the glint: where on the iris (-1..1, x toward the eye's own outside, y up; default [0.32, 0.42]), its size
   *  (iris units, default 0.2), the eye's side (+1 the creature's left) */
  glint?: [number, number]; glintR?: number; side?: number;
  /** the cornea bulges this much (x r, default 0.08) */
  bulge?: number;
  /** cage points round (default 12), subdivision steps (default 1), texel priority (default 3) */
  around?: number; levels?: number; k?: number;
  /** the tapetum's eye shine through the pupil and iris (default true) */
  shine?: boolean;
}
/** an eyeball with a bulging cornea, painted: a wet sclera shadowed under the lid, a dark limbal ring, the iris dark
 *  under the lid and lit in a lower crescent with fibres and a pale collarette, a species pupil, one hard glint and a
 *  small second one. Rides its eye bone. */
export function paintedEye(o: PaintedEyeSpec): Piece {
  const m = newCM(), ax = nrm(o.ax), side0 = crs([0, 1, 0], ax), side = Math.hypot(...side0) > 0.2 ? nrm(side0) : nrm(crs([0, 0, 1], ax)), up = crs(ax, side), rings: Ring[] = [];
  const C = o.around ?? 12, bulge = o.bulge ?? 0.08, irisA = o.irisA ?? 0.7;
  const st = [-0.92, -0.6, -0.2, 0.2, 0.5, 0.74, 0.9, 0.98];
  for (const f of st) {
    const k = Math.sqrt(Math.max(0.02, 1 - f * f)), b = f > 0.5 ? bulge * ss(0.5, 0.98, f) : 0;
    rings.push({ c: add(o.c, scl(ax, (f + b) * o.r)), x: side, y: up, pts: Array.from({ length: C }, (_, j) => { const a = (j / C) * TAU; return [Math.sin(a) * o.r * k * (1 + b * 0.4), Math.cos(a) * o.r * k * (1 + b * 0.4)]; }) });
  }
  const g = tube(m, rings, { tag: 0, capS: true, capE: true });
  const sclera = o.sclera ?? RP('bone'), limbal = o.limbal ?? RP('ink'), pr = o.pupilR ?? (o.pupil === 'round' ? 0.38 : 0.14);
  const gs = o.side ?? 1, [gx, gy] = o.glint ?? [0.32, 0.42], gr = o.glintR ?? 0.2, white = RP('paper');
  return {
    name: o.name, m, grids: [g], levels: o.levels ?? 1, k: o.k ?? 3, noOcc: true, skin: () => [o.bone, 1],
    paint: (ch, _p, b) => {
      const px = new Px(ch, b), P = px.gb.P, n = px.n, sa = Math.sin(irisA);
      px.hue = 1;
      px.form = new Float32Array(n); // the eye paints its own light
      for (let i = 0; i < n; i++) {
        const dx = P[i * 3] - o.c[0], dy = P[i * 3 + 1] - o.c[1], dz = P[i * 3 + 2] - o.c[2], l = Math.hypot(dx, dy, dz) || 1;
        const cz = (dx * ax[0] + dy * ax[1] + dz * ax[2]) / l, a = Math.acos(cl(cz, -1, 1));
        const ux = (dx * side[0] + dy * side[1] + dz * side[2]) / l, uy = (dx * up[0] + dy * up[1] + dz * up[2]) / l;
        const X = ux / sa, Y = uy / sa, r = a / irisA, hx = X * gs;
        px.rough[i] = 25; px.mark[i] = 0;
        px.shine[i] = o.shine === false ? 0 : r < pr * 1.1 ? 255 : r < 1 ? 140 : 0;
        // the glints: a hard square-ish one up and toward the light, a small one low on the other side
        const big = Math.max(Math.abs(hx + gx), Math.abs(Y - gy)) < gr && Math.abs(hx + gx) + Math.abs(Y - gy) < gr * 1.45;
        const small = Math.max(Math.abs(hx - gx * 0.75), Math.abs(Y + gy * 0.7)) < gr * 0.42;
        if (big && r < 1.25) { px.put(i, white, 5); px.over[i] = white[white.length - 1]; continue; }
        if (small && r < 1.0) { px.put(i, white, 4); continue; }
        if (r > 1.0) {
          // the sclera: wet, shadowed by the lid above, darker toward the rim of the opening
          const lidSh = uy > 0.15 ? 1 : uy > -0.1 ? 0.5 : 0;
          px.put(i, sclera, (sclera.length - 1) * 0.72 - lidSh * 1.1 - ss(1.0, 2.2, r) * 1.2);
          if (r < 1.12) px.put(i, limbal, 1); // the limbal ring bleeds out a texel
          continue;
        }
        if (r > 0.86) { px.put(i, limbal, r > 0.93 ? 0 : 1); continue; }
        // the pupil
        const pup = o.pupil === 'slit' ? Math.abs(X) < pr * (1 - Y * Y * 0.75) && Math.abs(Y) < 0.95
          : o.pupil === 'bar' ? Math.abs(Y) < pr && Math.abs(X) < 0.76
          : o.pupil === 'w' ? Math.abs(Y + 0.18 * Math.abs(Math.sin(X * 4.2))) < pr && Math.abs(X) < 0.72
          : o.pupil === 'pin' ? Math.hypot(X, Y) < pr * 0.5
          : Math.hypot(X, Y) < pr;
        if (pup) { px.put(i, limbal, 0); continue; }
        // the iris: dark under the lid, a lit crescent low (light through the cornea), fibres radiating, a pale ring
        // round the pupil (the collarette)
        const ang = Math.atan2(Y, X), wedge = Math.floor(((ang + Math.PI) / TAU) * 40), fib = h3(wedge, Math.floor(r * (2 + h3(wedge, 5, 7) * 3)), 7), R = o.iris, top = R.length - 1;
        let s = top * 0.5 - (Y > 0.25 ? 1.2 : Y > 0 ? 0.5 : 0) + (Y < -0.2 && r > 0.4 ? 1.1 : 0) + (Y < -0.45 && r > 0.55 ? 0.6 : 0);
        s += fib < 0.18 ? -0.7 : fib > 0.86 ? 0.6 : 0;
        const rp = o.pupil === 'round' ? Math.hypot(X, Y) / Math.max(0.05, pr) : Math.abs(X) / Math.max(0.05, pr * 1.6);
        if (rp < 1.45 && rp > 1.0) s += 0.9;
        if (r > 0.74) s -= 0.7;
        px.put(i, R, s);
      }
      px.flush({ eye: () => true });
    },
  };
}

// ================================================================================================ lids
export interface LidSpec {
  name: string;
  /** the eyeball's centre, look axis and radius */
  c: V3; ax: V3; r: number;
  /** the upper lid's bone and the lower lid's (omit for no lower lid) */
  bone: number; lowBone?: number;
  /** how far each margin sits from the look axis at the middle of the lid (rad): small = a narrow eye. Defaults:
   *  upper 0.42, lower 0.62; the canthi (where the lids meet, either side) at `corner` (default 1.2) */
  upper?: number; lower?: number; corner?: number;
  /** the slant of the opening (rad, + the outer corner up), the side the eye is on (+1 left) */
  tilt?: number; side?: number;
  /** thickness of the upper and lower lid (x r, defaults 0.2 and 0.13) */
  thick?: number; thickLo?: number;
  paint: (c: Chart, p: Piece, b: Body) => void;
  k?: number; levels?: number;
}
/** an almond pair of thick lids round an eyeball: rolls of skin whose margins meet at the canthi, so only a lens of the
 *  eye shows. Each rides its own bone (a blink turns the upper lid down about the eye's side axis). Returns [upper,
 *  lower?] pieces named name + 'Up' / name + 'Lo' unless the creature passes names via the returned objects. */
export function lids(o: LidSpec): Piece[] {
  const ax = nrm(o.ax), sd0 = crs([0, 1, 0], ax), side = Math.hypot(...sd0) > 0.25 ? nrm(sd0) : nrm(crs([0, 0, 1], ax)), up0 = crs(ax, side);
  const tilt = (o.tilt ?? 0) * (o.side ?? 1);
  // the slant: turn the up vector about the look axis
  const up = nrm(add(scl(up0, Math.cos(tilt)), scl(side, Math.sin(tilt))));
  const sideT = nrm(crs(up, ax));
  const corner = o.corner ?? 1.2;
  const mk = (lower: boolean): Piece => {
    const U = lower ? scl(up, -1) : up, th1m = lower ? o.lower ?? 0.62 : o.upper ?? 0.42, T = (lower ? o.thickLo ?? 0.13 : o.thick ?? 0.2) * o.r;
    const m = newCM(), rows: V3[][] = [], NR = 7, th0 = lower ? 1.95 : 2.2;
    for (let k = 0; k <= NR; k++) {
      const ph = -Math.PI / 2 + (Math.PI * k) / NR, sph = Math.abs(Math.sin(ph));
      // the margin: closest to the axis at the middle, out to the canthi at the corners (an almond)
      const th1 = th1m + (corner - th1m) * Math.pow(sph, 2.2);
      const dir = (th: number): V3 => nrm(add(scl(ax, Math.cos(th)), scl(add(scl(U, Math.cos(ph)), scl(sideT, Math.sin(ph))), Math.sin(th))));
      const thin = 1 - 0.55 * Math.pow(sph, 3); // thinner toward the corners
      const Ro = o.r * 1.035 + T * thin, Ri = o.r * 1.025;
      const row: V3[] = [];
      // the outer face from the root (deep in the socket) to the margin, the rolled margin, back along the inner face
      for (let q = 0; q <= 4; q++) { const th = th0 + ((th1 + 0.12 - th0) * q) / 4; row.push(add(o.c, scl(dir(th), Ro))); }
      row.push(add(o.c, scl(dir(th1 + 0.02), o.r * 1.03 + T * thin * 0.55)));
      row.push(add(o.c, scl(dir(th1 - 0.01), Ri + T * thin * 0.15)));
      for (let q = 3; q >= 0; q--) { const th = th0 + ((th1 + 0.04 - th0) * q) / 4; row.push(add(o.c, scl(dir(th), Ri))); }
      rows.push(row);
    }
    const g = sheetGrid(m, rows, { tag: 0, out: (p) => [p[0] - o.c[0], p[1] - o.c[1], p[2] - o.c[2]], wrapCols: true, capS: true, capE: true });
    void creaseRow;
    const bone = lower ? o.lowBone! : o.bone;
    return { name: o.name + (lower ? 'Lo' : 'Up'), m, grids: [g], levels: o.levels ?? 1, skin: () => [bone, 1], paint: o.paint, k: o.k ?? 1.8, noOcc: true };
  };
  const out = [mk(false)];
  if (o.lowBone !== undefined) out.push(mk(true));
  return out;
}
/** a lid painted in the creature's skin: lighter on its rounded top, a dark lash line along the upper margin (`lash`),
 *  a wet light line along the lower margin; the eye centre and axis tell the margin from the root */
export function lidPaint(R: number[], step: number, o: { c: V3; ax: V3; r: number; lash?: number[]; lower?: boolean; flow?: Flow; skin?: (px: Px) => void }) {
  const ax = nrm(o.ax);
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
    px.base(() => [R, step]);
    o.skin?.(px);
    const hp = hand(px, { flow: o.flow ?? 'across', seed: 5 }).form({ ao: 0.6, light: 1.6 });
    for (let i = 0; i < px.n; i++) {
      const dx = P[i * 3] - o.c[0], dy = P[i * 3 + 1] - o.c[1], dz = P[i * 3 + 2] - o.c[2], l = Math.hypot(dx, dy, dz) || 1;
      const a = Math.acos(cl((dx * ax[0] + dy * ax[1] + dz * ax[2]) / l, -1, 1));
      // the margin is the part of the lid nearest the look axis and nearest the ball
      const inner = l < o.r * 1.06, nearM = a < 1.35;
      const facing = N[i * 3] * ax[0] + N[i * 3 + 1] * ax[1] + N[i * 3 + 2] * ax[2];
      if (nearM && inner) { if (o.lower) { px.put(i, RP('flesh'), 4); px.rough[i] = 30; } else if (o.lash) px.put(i, o.lash, 0); else px.mark[i] -= 2; }
      else if (nearM && facing > 0.3 && !o.lower && o.lash && a < 1.0) px.put(i, o.lash, 1);
      else if (nearM && o.lower && facing > 0.4) px.mark[i] += 0.6;
    }
    hp.strokes({ len: [3, 6], width: [1, 2], amp: 0.5 });
    px.flush();
  };
}
