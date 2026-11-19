// A tiny 2.5D painter for plate portraits of cryptids that have no 3D model (yet): each creature is a handful of
// smooth-blended signed-distance primitives (round cones, ellipsoids), ray-marched orthographically from a 3/4
// view, lit by a key / rim / occlusion model and banded straight onto hand-picked palette ramps with ordered
// dithering, so the result is pixel art rather than a filtered render. Materials add painted detail in 3D
// (fur strokes, warts, scales, bark fissures) as ramp-step offsets. Rendering runs in slices (yields to the frame).
import { Noise } from '../../core/noise';
import { hash2 } from '../../core/rng';
import { bayer, type RGB, Pix } from './pix';

export type V3 = [number, number, number];
export interface Prim {
  k: 'cone' | 'ell';
  a: V3; b?: V3; r: number; r2?: number; rr?: V3;
  m: number;
  /** smooth-union radius with everything before it (0 = hard) */
  s?: number;
  /** carve this shape out of what is there */
  sub?: boolean;
}
export type Pattern = (p: V3, n: V3) => number;
export interface Mat {
  ramp: RGB[];
  pat?: Pattern;
  /** base brightness offset in ramp steps */
  bias?: number;
  /** self-lit (eyes, steam): ignores light */
  glow?: boolean;
  /** extra specular glint (wet eyes, tusks) */
  gloss?: number;
}
export interface SdfSpec {
  prims: Prim[];
  mats: Mat[];
  /** camera yaw / pitch (radians) around the creature (yaw 0 = looking at its face from +Z) */
  yaw: number; pitch: number;
  /** world point at the centre of the picture, and pixels per metre */
  center: V3; scale: number;
  /** extra decorations painted after shading (tears, steam) in screen space */
  post?: (p: Pix, at: (v: V3) => [number, number]) => void;
}

// ------------------------------------------------------------------------------------------------ builders
export const cone = (a: V3, b: V3, r: number, r2: number, m: number, s = 0): Prim => ({ k: 'cone', a, b, r, r2, m, s });
export const ell = (a: V3, rr: V3, m: number, s = 0): Prim => ({ k: 'ell', a, rr, r: Math.max(...rr), m, s });
export function chain(pts: V3[], rs: number[], m: number, s = 0, s0 = s): Prim[] {
  const out: Prim[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push(cone(pts[i], pts[i + 1], rs[i], rs[i + 1], m, i === 0 ? s0 : Math.min(s, 0.6 * Math.min(rs[i], rs[i + 1]))));
  return out;
}
/** the same prims mirrored across x = 0 (left / right pairs) */
export function both(ps: Prim[]): Prim[] {
  const f = (v?: V3): V3 | undefined => (v ? [-v[0], v[1], v[2]] : v);
  return [...ps, ...ps.map((p) => ({ ...p, a: f(p.a)!, b: f(p.b) }))];
}

// ------------------------------------------------------------------------------------------------ distance
function sdRoundCone(px: number, py: number, pz: number, a: V3, b: V3, r1: number, r2: number): number {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
function sdEll(px: number, py: number, pz: number, c: V3, r: V3): number {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x1 = x / r[0], y1 = y / r[1], z1 = z / r[2];
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}
function primD(p: Prim, x: number, y: number, z: number): number {
  return p.k === 'cone' ? sdRoundCone(x, y, z, p.a, p.b!, p.r, p.r2 ?? p.r) : sdEll(x, y, z, p.a, p.rr!);
}
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a: number, b: number, k: number): number { return -smin(-a, -b, k); }

/** evaluate a list of prims: distance and material of the nearest */
function evalList(ps: Prim[], ids: number[], x: number, y: number, z: number, out: { m: number }): number {
  let d = 1e9, m = -1;
  for (const i of ids) {
    const p = ps[i];
    const di = primD(p, x, y, z);
    if (p.sub) { d = smax(d, -di, p.s ?? 0); continue; }
    if (di < d) m = p.m;
    d = smin(d, di, p.s ?? 0);
  }
  out.m = m;
  return d;
}

// ------------------------------------------------------------------------------------------------ patterns
const NZ = new Noise(77);
export const PAT = {
  /** fur: short dark strokes combed along a direction, lighter tips */
  fur(scale = 60, dir: V3 = [0, -1, 0.3], amt = 1): Pattern {
    return (p) => {
      // stretch the noise along the combing direction
      const d = dir, l = Math.hypot(d[0], d[1], d[2]);
      const along = (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / l;
      const n = NZ.n3(p[0] * scale - along * scale * 0.8 * d[0] / l, p[1] * scale - along * scale * 0.8 * d[1] / l, p[2] * scale - along * scale * 0.8 * d[2] / l);
      return n > 0.45 ? -1 * amt : n < -0.55 ? 0.7 * amt : 0;
    };
  },
  /** warts and moles: round bumps lit on top, a few dark moles */
  warts(scale = 30, amt = 1): Pattern {
    return (p, n) => {
      const v = NZ.n3(p[0] * scale, p[1] * scale, p[2] * scale);
      const mole = NZ.n3(p[0] * scale * 0.5 + 9, p[1] * scale * 0.5, p[2] * scale * 0.5) > 0.62;
      if (mole) return -2 * amt;
      return v > 0.5 ? (n[1] > 0 ? 1 : -0.8) * amt : v < -0.6 ? -0.7 * amt : 0;
    };
  },
  /** scaly hide: a cellular net of dark seams */
  scales(scale = 40, amt = 1): Pattern {
    return (p) => {
      const u = p[0] * scale + p[1] * scale * 0.5, v = p[2] * scale - p[1] * scale * 0.5, w = p[1] * scale;
      const f = (t: number) => Math.abs(t - Math.round(t));
      const e = Math.min(f(u + NZ.n3(p[0] * 9, p[1] * 9, p[2] * 9) * 0.3), f(v), f(w * 0.7 + u * 0.3));
      return e < 0.09 ? -1.2 * amt : e > 0.38 ? 0.4 * amt : 0;
    };
  },
  /** bark: vertical fissures and plates */
  bark(scale = 22): Pattern {
    return (p) => {
      const n = NZ.n3(p[0] * scale * 1.6, p[1] * scale * 0.25, p[2] * scale * 1.6) + NZ.n3(p[0] * 60, p[1] * 8, p[2] * 60) * 0.35;
      return n > 0.35 ? -1.6 : n < -0.4 ? 0.6 : 0;
    };
  },
  /** mottled skin: soft blotches */
  mottle(scale = 14, amt = 1): Pattern {
    return (p) => {
      const n = NZ.n3(p[0] * scale + 3, p[1] * scale, p[2] * scale);
      return n > 0.3 ? -0.8 * amt : n < -0.35 ? 0.5 * amt : 0;
    };
  },
  /** bands across (ringed tails, striped horns) */
  bands(axis: 0 | 1 | 2, freq: number, amt = 1): Pattern {
    return (p) => (Math.sin(p[axis] * freq) > 0.55 ? -1 * amt : 0);
  },
  none: ((): number => 0) as Pattern,
  sum(...ps: Pattern[]): Pattern { return (p, n) => ps.reduce((s, f) => s + f(p, n), 0); },
};

// ------------------------------------------------------------------------------------------------ render
export interface SdfRaster { pix: Pix; depth: Float32Array; mat: Int16Array; at: (v: V3) => [number, number] }

/** render a spec into a transparent Pix of w x h (async: yields every ~24 ms) */
export async function renderSdf(spec: SdfSpec, w: number, h: number, yieldFn: () => Promise<void> = () => Promise.resolve()): Promise<SdfRaster> {
  const { prims, mats } = spec;
  const cy = Math.cos(spec.yaw), sy = Math.sin(spec.yaw), cp = Math.cos(spec.pitch), sp = Math.sin(spec.pitch);
  // camera basis: f = view direction (from the camera into the scene), r = screen right, u = screen up
  const back: V3 = [sy * cp, sp, cy * cp];          // from the target toward the camera
  const f: V3 = [-back[0], -back[1], -back[2]];
  const r: V3 = [cy, 0, -sy];
  const u: V3 = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]].map((v) => -v) as V3;
  const S = spec.scale, C = spec.center;
  const at = (v: V3): [number, number] => {
    const dx = v[0] - C[0], dy = v[1] - C[1], dz = v[2] - C[2];
    return [w / 2 + (dx * r[0] + dy * r[1] + dz * r[2]) * S, h / 2 - (dx * u[0] + dy * u[1] + dz * u[2]) * S];
  };
  // light: from upper left, a little in front; rim from behind right
  const L = norm([-r[0] * 0.55 + u[0] * 0.75 + back[0] * 0.45, -r[1] * 0.55 + u[1] * 0.75 + back[1] * 0.45, -r[2] * 0.55 + u[2] * 0.75 + back[2] * 0.45]);
  // per-prim screen bounds for tile culling
  const bounds = prims.map((p) => {
    const ext = (p.k === 'cone' ? Math.max(p.r, p.r2 ?? p.r) : p.r) + (p.s ?? 0) + 0.01;
    const pts: V3[] = p.k === 'cone' ? [p.a, p.b!] : [p.a];
    const sc = pts.map(at);
    return { x0: Math.min(...sc.map((q) => q[0])) - ext * S, x1: Math.max(...sc.map((q) => q[0])) + ext * S, y0: Math.min(...sc.map((q) => q[1])) - ext * S, y1: Math.max(...sc.map((q) => q[1])) + ext * S, sub: !!p.sub };
  });
  // depth range along f
  let tMin = 1e9, tMax = -1e9;
  for (const p of prims) for (const v of p.k === 'cone' ? [p.a, p.b!] : [p.a]) {
    const t = (v[0] - C[0]) * f[0] + (v[1] - C[1]) * f[1] + (v[2] - C[2]) * f[2];
    const e = p.k === 'cone' ? Math.max(p.r, p.r2 ?? p.r) : p.r;
    tMin = Math.min(tMin, t - e - 0.05); tMax = Math.max(tMax, t + e + 0.05);
  }
  const pix = new Pix(w, h);
  const depth = new Float32Array(w * h).fill(Infinity);
  const matI = new Int16Array(w * h).fill(-1);
  const shadeI = new Float32Array(w * h);
  const o = { m: -1 };
  const T = 8;
  let tStart = performance.now();
  for (let ty = 0; ty < h; ty += T) {
    for (let tx = 0; tx < w; tx += T) {
      const ids: number[] = [];
      bounds.forEach((b, i) => { if (b.x1 >= tx && b.x0 <= tx + T && b.y1 >= ty && b.y0 <= ty + T) ids.push(i); });
      if (!ids.some((i) => !prims[i].sub)) continue;
      for (let y = ty; y < Math.min(h, ty + T); y++) for (let x = tx; x < Math.min(w, tx + T); x++) {
        const sx = (x + 0.5 - w / 2) / S, syy = -(y + 0.5 - h / 2) / S;
        const ox = C[0] + r[0] * sx + u[0] * syy, oy = C[1] + r[1] * sx + u[1] * syy, oz = C[2] + r[2] * sx + u[2] * syy;
        let t = tMin, hit = false, d = 0;
        for (let it = 0; it < 90 && t < tMax; it++) {
          d = evalList(prims, ids, ox + f[0] * t, oy + f[1] * t, oz + f[2] * t, o);
          if (d < 0.0008) { hit = true; break; }
          t += Math.max(d * 0.9, 0.0006);
        }
        if (!hit || o.m < 0) continue;
        const px = ox + f[0] * t, py = oy + f[1] * t, pz = oz + f[2] * t;
        const m = o.m;
        // normal (tetrahedron)
        const e = 0.0025;
        const k1 = evalList(prims, ids, px + e, py - e, pz - e, o), k2 = evalList(prims, ids, px - e, py - e, pz + e, o);
        const k3 = evalList(prims, ids, px - e, py + e, pz - e, o), k4 = evalList(prims, ids, px + e, py + e, pz + e, o);
        const n = norm([k1 - k2 - k3 + k4, -k1 - k2 + k3 + k4, -k1 + k2 - k3 + k4]);
        // occlusion
        let occ = 0, wgt = 1;
        for (let i = 1; i <= 4; i++) { const hh = 0.012 * i; occ += (hh - evalList(prims, ids, px + n[0] * hh, py + n[1] * hh, pz + n[2] * hh, o)) * wgt; wgt *= 0.6; }
        const ao = Math.max(0, Math.min(1, 1 - occ * 9));
        const ndl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
        const ndv = -(n[0] * f[0] + n[1] * f[1] + n[2] * f[2]);
        const rim = Math.pow(1 - Math.max(0, ndv), 3) * Math.max(0, n[0] * r[0] + n[1] * r[1] + n[2] * r[2] + 0.3);
        const M = mats[m];
        let v: number;
        if (M.glow) v = 0.85;
        else v = 0.1 + 0.62 * Math.max(0, (ndl + 0.25) / 1.25) * (0.55 + 0.45 * ao) + 0.22 * ao + rim * 0.35;
        let spec = 0;
        if (M.gloss) {
          const H = norm([L[0] + back[0], L[1] + back[1], L[2] + back[2]]);
          spec = Math.pow(Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]), 24) * M.gloss;
        }
        const steps = M.ramp.length - 1;
        let k = v * steps + (M.bias ?? 0) + (M.pat ? M.pat([px, py, pz], n) : 0) + spec * 3;
        k += bayer(x, y) * 0.7;
        const ki = Math.max(0, Math.min(steps, Math.round(k)));
        const i = y * w + x;
        depth[i] = t; matI[i] = m; shadeI[i] = ki;
        pix.set(x, y, M.ramp[ki]);
      }
      if (performance.now() - tStart > 24) { await yieldFn(); tStart = performance.now(); }
    }
  }
  // interior lines: a pixel in front of a big depth step or on a material seam darkens one or two steps
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (matI[i] < 0) continue;
    let edge = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (matI[j] < 0) continue;
      // this pixel is the farther one across a fold: draw the crease on it
      if (depth[i] - depth[j] > 0.035) edge = Math.max(edge, 2);
      else if (matI[j] !== matI[i] && depth[i] > depth[j]) edge = Math.max(edge, 1);
    }
    if (!edge) continue;
    const M = mats[matI[i]];
    const ki = Math.max(0, shadeI[i] - edge - 1);
    pix.set(x, y, M.ramp[ki]);
  }
  spec.post?.(pix, at);
  return { pix, depth, mat: matI, at };
}

function norm(v: V3): V3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/** a few stray hand-placed highlight pixels: lighten isolated texels on lit convex areas (eyes, tusks) */
export function sparkle(p: Pix, x: number, y: number, c: RGB): void { p.set(x, y, c); if (hash2(x, y, 3) > 0.5) p.set(x + 1, y, c); }
