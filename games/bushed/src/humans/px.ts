// Pixel painter for the humans' texture pages (ported from Blobfish's src/gfx/px.ts, itself grown out of
// Limbophobia's gfx/pixel.ts PixelCanvas): an RGBA byte buffer painted one texel at a time, hue-shifted
// shading ramps, value-noise fbm in pixel units, and the upload to a nearest-filtered sRGB texture through
// the game's texture conventions (src/gfx/tex.ts).
import * as THREE from 'three';
import { hash2 } from '../core/rng';
import { applyPixelTex } from '../gfx/tex';

export type RGB = [number, number, number];

export function hex(c: string | number): RGB {
  if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const s = c.replace('#', '');
  const v = parseInt(s.length === 3 ? s.split('').map((ch) => ch + ch).join('') : s, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lum = (c: RGB) => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;

/**
 * Hue-shifted shading (classic pixel-art ramps): k < 1 darkens toward a cool, saturated shadow, k > 1 lightens
 * toward a warm, desaturated light. Used for ambient occlusion and fold shading, never for a directional light.
 */
export function shade(c: RGB, k: number): RGB {
  if (k < 1) {
    const t = 1 - k;
    return mix(mul(c, k), [c[0] * 0.62 * k + 6 * t, c[1] * 0.64 * k + 8 * t, c[2] * 0.86 * k + 22 * t], 0.4 * t);
  }
  const t = Math.min(1, k - 1);
  return mix(c, [Math.min(255, c[0] + 64), Math.min(255, c[1] + 56), Math.min(255, c[2] + 34)], t);
}
/** n-step palette ramp from one base colour (dark cool .. light warm) */
export function rampOf(base: RGB, n = 7, spread = 0.55): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) out.push(shade(base, 1 + (i / (n - 1) - 0.5) * 2 * spread));
  return out;
}

/** a hash in [0, 1) per pixel */
export const ph = (x: number, y: number, seed = 0) => hash2(x | 0, y | 0, seed);

/** smooth value noise in [0, 1] (cell size 1) */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** fbm of value noise in pixel units: `cell` pixels per base octave, result in [0, 1] */
export function fbm(x: number, y: number, cell: number, oct = 4, seed = 0): number {
  let s = 0, n = 0, a = 1, f = 1 / cell;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, seed + i * 31) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}

/** an RGBA page */
export class Page {
  w: number; h: number; d: Uint8ClampedArray;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): RGB { const i = ((y | 0) * this.w + (x | 0)) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  set(x: number, y: number, c: RGB, a = 255) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  blend(x: number, y: number, c: RGB, t: number) {
    x |= 0; y |= 0;
    if (!this.inside(x, y) || t <= 0) return;
    const i = (y * this.w + x) * 4, k = clamp01(t);
    this.d[i] += (c[0] - this.d[i]) * k; this.d[i + 1] += (c[1] - this.d[i + 1]) * k; this.d[i + 2] += (c[2] - this.d[i + 2]) * k;
    this.d[i + 3] = 255;
  }
  /** shade (AO / fold) a pixel by k */
  shadeAt(x: number, y: number, k: number) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const i = (y * this.w + x) * 4;
    const c = shade([this.d[i], this.d[i + 1], this.d[i + 2]], k);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
  }
  canvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.d);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  /** colour texture with the game's pixel conventions (nearest mag, mipmapped min, sRGB) */
  texture(): THREE.Texture {
    const t = new THREE.CanvasTexture(this.canvas());
    t.flipY = true;
    return applyPixelTex(t, { srgb: true });
  }
}
