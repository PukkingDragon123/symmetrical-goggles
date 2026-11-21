// Canvas painters for the inventory's world objects (the canvas sack). High-resolution pixel art: every texel placed
// by a rule, no smooth gradients, no baked directional light (only cavity and wear).
import { hash2, Rng } from '../../core/rng';

export type C3 = [number, number, number];

export function mkCanvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** smooth value noise in [0, 1) */
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** tileable fbm (period p in noise units) */
function tnoise(x: number, y: number, p: number, seed: number): number {
  const w = (xx: number, yy: number) => vnoise(((xx % p) + p) % p, ((yy % p) + p) % p, seed);
  // wrap by blending the four periodic copies
  const fx = (x % p) / p, fy = (y % p) / p;
  const a = w(x, y), b = w(x - p, y), c = w(x, y - p), d = w(x - p, y - p);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/**
 * Woven duck canvas, tileable: twill weave, per-thread tone, slubs (thick threads), mottled grime and specks.
 * base: rgb 0..255
 */
export function paintDuck(size: number, base: C3, seed: number, o: { grime?: number; slub?: number; weave?: number } = {}): HTMLCanvasElement {
  const c = mkCanvas(size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const r = new Rng(seed);
  const row = Array.from({ length: size }, () => r.range(-7, 7));
  const col = Array.from({ length: size }, () => r.range(-5, 5));
  const slubs: { y: number; x0: number; len: number; v: number }[] = [];
  const ns = Math.round(size * 0.12 * (o.slub ?? 1));
  for (let i = 0; i < ns; i++) slubs.push({ y: r.int(0, size - 1), x0: r.int(0, size - 1), len: r.int(4, 18), v: r.range(6, 14) * (r.chance(0.7) ? 1 : -1) });
  const weave = o.weave ?? 1, grime = o.grime ?? 1;
  const P = 6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tw = ((x + y) & 3) < 2 ? 5 : -5;           // twill diagonal
    const pin = ((x & 1) ^ (y & 1)) ? 2 : -2;        // single-thread grain
    let v = tw * weave + pin + row[y] * 0.8 + col[x] * 0.6;
    const m = tnoise(x / size * P, y / size * P, P, seed) - 0.5;
    const m2 = tnoise(x / size * P * 3, y / size * P * 3, P * 3, seed + 7) - 0.5;
    v += (m * 26 + m2 * 10) * grime;
    let hr = 0, hg = 0, hb = 0;
    // stains drift toward brown, wear toward pale
    if (m > 0.12) { hr += (m - 0.12) * 30 * grime; hg += (m - 0.12) * 14 * grime; hb -= (m - 0.12) * 10 * grime; }
    const k = (y * size + x) * 4;
    img.data[k] = clamp255(base[0] + v + hr); img.data[k + 1] = clamp255(base[1] + v + hg); img.data[k + 2] = clamp255(base[2] + v * 0.8 + hb); img.data[k + 3] = 255;
  }
  for (const s of slubs) for (let i = 0; i < s.len; i++) {
    const x = (s.x0 + i) % size, k = (s.y * size + x) * 4;
    const e = i === 0 || i === s.len - 1 ? 0.5 : 1;
    for (let ch = 0; ch < 3; ch++) img.data[k + ch] = clamp255(img.data[k + ch] + s.v * e);
  }
  // dirt specks
  for (let i = 0; i < size * size * 0.004 * grime; i++) {
    const x = r.int(0, size - 1), y = r.int(0, size - 1), k = (y * size + x) * 4;
    for (let ch = 0; ch < 3; ch++) img.data[k + ch] = clamp255(img.data[k + ch] - r.range(18, 34));
  }
  g.putImageData(img, 0, 0);
  return c;
}
