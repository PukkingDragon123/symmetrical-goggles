// Tiny pixel painter for station textures made in code (food, liquids, chalk): tileable value noise, fbm,
// palette ramps (every texel snaps to a short hand-picked ramp, so the result reads as crisp pixel art with rich,
// food-photo colour), and canvas -> texture with the game's pixel conventions (src/gfx/tex.ts).
import * as THREE from 'three';
import { canvasTex } from '../../gfx/tex';

export type RGB = [number, number, number];

export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** tileable value noise in [0,1]; w, h multiples of cell */
export function vnoise(w: number, h: number, cell: number, seed: number): Float32Array {
  const out = new Float32Array(w * h);
  const cx = Math.max(1, Math.round(w / cell)), cy = Math.max(1, Math.round(h / cell));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x / w) * cx, fy = (y / h) * cy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash(x0 % cx, y0 % cy, seed), b = hash((x0 + 1) % cx, y0 % cy, seed);
    const c = hash(x0 % cx, (y0 + 1) % cy, seed), d = hash((x0 + 1) % cx, (y0 + 1) % cy, seed);
    out[y * w + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  return out;
}

export function fbm(w: number, h: number, cell: number, seed: number, oct = 4): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = vnoise(w, h, Math.max(2, cell / 2 ** o), seed + o * 31);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

/** white noise per texel */
export function speck(w: number, h: number, seed: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = hash(i % w, Math.floor(i / w), seed);
  return out;
}

/** sample a ramp of colours at t in [0,1] with no blending (pixel-art bands) */
export function ramp(cols: RGB[], t: number): RGB {
  const i = Math.max(0, Math.min(cols.length - 1, Math.floor(t * cols.length)));
  return cols[i];
}

export class Pix {
  readonly c: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly img: ImageData;
  constructor(readonly w: number, readonly h: number) {
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d')!;
    this.img = this.g.createImageData(w, h);
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = ((y | 0) * this.w + (x | 0)) * 4;
    this.img.data[o] = c[0]; this.img.data[o + 1] = c[1]; this.img.data[o + 2] = c[2]; this.img.data[o + 3] = a;
  }
  get(x: number, y: number): RGB {
    const o = (((y + this.h) % this.h) * this.w + ((x + this.w) % this.w)) * 4;
    return [this.img.data[o], this.img.data[o + 1], this.img.data[o + 2]];
  }
  /** fill every texel from a function of (x, y, i) */
  each(f: (x: number, y: number, i: number) => RGB | null): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = f(x, y, y * this.w + x); if (c) this.set(x, y, c); }
    return this;
  }
  done(): HTMLCanvasElement { this.g.putImageData(this.img, 0, 0); return this.c; }
  tex(o: { repeat?: boolean; srgb?: boolean } = {}): THREE.Texture { return canvasTex(this.done(), { repeat: o.repeat ?? true, srgb: o.srgb ?? true }); }
}

/** multiply a colour */
export const mul = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
