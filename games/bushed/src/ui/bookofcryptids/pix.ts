// Pixel buffers for the Book of Cryptids: every page, plate, icon and texture of the book is painted texel by
// texel into a Pix (an RGBA buffer), from palette ramps with ordered dithering, and set in crisp Alagard: glyphs
// are rasterised once by the canvas, then thresholded to hard 1-bit pixels (no antialiasing, no smoothing).
import { hash2 } from '../../core/rng';

export type RGB = [number, number, number];

export function hex(s: string): RGB {
  const v = parseInt(s.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const ramp = (...cs: string[]): RGB[] => cs.map(hex);
export function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function shade(c: RGB, k: number): RGB { return [c[0] * k, c[1] * k, c[2] * k]; }

/** 4x4 Bayer matrix, values in (-0.5, 0.5) */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

/** pick a ramp entry for a continuous value v (0..1) with ordered dithering (dither 0..1 = band blend width) */
export function rampAt(r: RGB[], v: number, x: number, y: number, dither = 1): RGB {
  const f = v * (r.length - 1) + bayer(x, y) * dither;
  return r[Math.max(0, Math.min(r.length - 1, Math.round(f)))];
}

export interface TextOpts {
  size?: 16 | 32 | 64;
  color?: string | RGB;
  align?: 'left' | 'center' | 'right';
  /** 0..1 chance a glyph pixel is a lighter, worn texel (old ink, pencil) */
  fade?: number;
  /** wet ink: a darker core and a lighter rim on glyph pixels */
  wet?: boolean;
  seed?: number;
  /** clip: only draw glyph pixels with x < reveal (animated writing) */
  reveal?: number;
  /** a 1px drop shadow / emboss under the glyphs (gilt tooling on the cover) */
  under?: RGB;
  over?: RGB;
}

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const sctx = scratch?.getContext('2d', { willReadFrequently: true }) ?? null;
const font = (size: number) => `${size}px Alagard, monospace`;

/** width of a string in pixels at a size */
export function textWidth(s: string, size = 16): number {
  if (!sctx) return s.length * size * 0.5;
  sctx.font = font(size);
  return Math.ceil(sctx.measureText(s).width);
}

/** greedy word wrap to a pixel width ('\n' forces a break) */
export function wrap(s: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (line && textWidth(t, size) > maxW) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** a cache of thresholded glyph runs: text|size -> 1-bit mask */
const runCache = new Map<string, { w: number; h: number; asc: number; m: Uint8Array }>();
function run(s: string, size: number) {
  const key = size + '|' + s;
  let r = runCache.get(key);
  if (r) return r;
  const w = Math.max(1, textWidth(s, size) + 4), h = Math.ceil(size * 1.4), asc = Math.ceil(size * 1.0);
  const m = new Uint8Array(w * h);
  if (sctx && scratch) {
    if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    sctx.font = font(size);
    sctx.textBaseline = 'alphabetic';
    sctx.fillStyle = '#fff';
    sctx.fillText(s, 1, asc);
    const d = sctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 120 ? 1 : 0;
  }
  r = { w, h, asc, m };
  if (runCache.size > 4000) runCache.clear();
  runCache.set(key, r);
  return r;
}

export class Pix {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
  constructor(w: number, h: number, data?: Uint8ClampedArray) {
    this.w = w; this.h = h;
    this.d = data ?? new Uint8ClampedArray(w * h * 4);
  }
  static fromCanvas(c: HTMLCanvasElement): Pix {
    const g = c.getContext('2d', { willReadFrequently: true })!;
    return new Pix(c.width, c.height, g.getImageData(0, 0, c.width, c.height).data);
  }
  clone(): Pix { return new Pix(this.w, this.h, new Uint8ClampedArray(this.d)); }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, c: RGB, a = 255): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    if (a >= 255) { this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = 255; return; }
    if (a <= 0) return;
    const k = a / 255, ia = this.d[o + 3] / 255, oa = k + ia * (1 - k);
    for (let i = 0; i < 3; i++) this.d[o + i] = (c[i] * k + this.d[o + i] * ia * (1 - k)) / Math.max(1e-6, oa);
    this.d[o + 3] = oa * 255;
  }
  get(x: number, y: number): RGB {
    x = Math.max(0, Math.min(this.w - 1, x | 0)); y = Math.max(0, Math.min(this.h - 1, y | 0));
    const o = (y * this.w + x) * 4;
    return [this.d[o], this.d[o + 1], this.d[o + 2]];
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[((y | 0) * this.w + (x | 0)) * 4 + 3];
  }
  /** multiply a pixel's colour (darken < 1 < lighten) */
  mul(x: number, y: number, k: number): void {
    if (!this.inside(x, y)) return;
    const o = ((y | 0) * this.w + (x | 0)) * 4;
    this.d[o] *= k; this.d[o + 1] *= k; this.d[o + 2] *= k;
  }
  /** tint a pixel toward a colour */
  tint(x: number, y: number, c: RGB, t: number): void {
    if (!this.inside(x, y)) return;
    const o = ((y | 0) * this.w + (x | 0)) * 4;
    for (let i = 0; i < 3; i++) this.d[o + i] += (c[i] - this.d[o + i]) * t;
  }
  fill(c: RGB): void { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c); }
  clear(): void { this.d.fill(0); }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let j = Math.max(0, y | 0); j < Math.min(this.h, (y + h) | 0); j++) for (let i = Math.max(0, x | 0); i < Math.min(this.w, (x + w) | 0); i++) this.set(i, j, c, a);
  }
  hline(x0: number, x1: number, y: number, c: RGB): void { for (let x = Math.min(x0, x1) | 0; x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x: number, y0: number, y1: number, c: RGB): void { for (let y = Math.min(y0, y1) | 0; y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  /** Bresenham line; pattern (optional) skips pixels for dashed / stitched lines */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, pat?: (i: number) => boolean): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, i = 0;
    for (;;) {
      if (!pat || pat(i)) this.set(x0, y0, c);
      i++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /** filled ellipse; col(x, y, u, v) picks each pixel's colour (u, v in -1..1) or null to skip */
  ellipse(cx: number, cy: number, rx: number, ry: number, col: RGB | ((x: number, y: number, u: number, v: number) => RGB | null)): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      const c = typeof col === 'function' ? col(x, y, u, v) : col;
      if (c) this.set(x, y, c);
    }
  }
  /** paste another buffer (alpha-tested at 128 unless blend) */
  blit(src: Pix, x: number, y: number, o: { blend?: boolean; scale?: number; mask?: (sx: number, sy: number) => boolean } = {}): void {
    const s = o.scale ?? 1;
    for (let j = 0; j < src.h * s; j++) for (let i = 0; i < src.w * s; i++) {
      const sx = Math.floor(i / s), sy = Math.floor(j / s);
      const so = (sy * src.w + sx) * 4, a = src.d[so + 3];
      if (a === 0 || (!o.blend && a < 128)) continue;
      if (o.mask && !o.mask(sx, sy)) continue;
      this.set(x + i, y + j, [src.d[so], src.d[so + 1], src.d[so + 2]], o.blend ? a : 255);
    }
  }
  /** crisp Alagard text with its baseline at y; returns the advance width */
  text(s: string, x: number, y: number, o: TextOpts = {}): number {
    const size = o.size ?? 16;
    const r = run(s, size);
    const col = typeof o.color === 'string' ? hex(o.color) : o.color ?? hex('#231a14');
    const w = r.w - 4;
    let x0 = Math.round(x) - 1;
    if (o.align === 'center') x0 = Math.round(x - w / 2) - 1;
    else if (o.align === 'right') x0 = Math.round(x - w) - 1;
    const y0 = Math.round(y) - r.asc;
    const seed = o.seed ?? 1;
    const light = mix(col, [236, 222, 190], 0.45), dark = shade(col, 0.7);
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      if (!r.m[j * r.w + i]) continue;
      const px = x0 + i, py = y0 + j;
      if (o.reveal !== undefined && px > o.reveal) continue;
      if (o.under && !r.m[(j + 1) * r.w + i] && j + 1 < r.h) this.set(px, py + 1, o.under);
      let c = col;
      if (o.fade && hash2(px, py, seed) < o.fade) c = light;
      if (o.wet) {
        const edge = !r.m[j * r.w + i - 1] || !r.m[(j - 1) * r.w + i];
        c = edge ? col : dark;
      }
      if (o.over && j > 0 && !r.m[(j - 1) * r.w + i]) c = o.over;
      this.set(px, py, c);
    }
    return w;
  }
  toImageData(): ImageData { return new ImageData(new Uint8ClampedArray(this.d), this.w, this.h); }
  toCanvas(c?: HTMLCanvasElement): HTMLCanvasElement {
    const cv = c ?? document.createElement('canvas');
    if (cv.width !== this.w || cv.height !== this.h) { cv.width = this.w; cv.height = this.h; }
    cv.getContext('2d')!.putImageData(new ImageData(this.d as unknown as Uint8ClampedArray<ArrayBuffer>, this.w, this.h), 0, 0);
    return cv;
  }
}

/** a 1-px dark outline around everything opaque in p (drawn into the transparent pixels next to it). selective:
 *  the outline takes a darkened, cooler shade of the colour it borders instead of flat black */
export function outline(p: Pix, o: { color?: RGB; selective?: number; diagonal?: boolean } = {}): void {
  const W = p.w, H = p.h, src = new Uint8ClampedArray(p.d);
  const base = o.color ?? hex('#1a1210');
  const sel = o.selective ?? 0.35;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (src[(y * W + x) * 4 + 3] >= 128) continue;
    let n = -1;
    const nb = o.diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of nb) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (src[(yy * W + xx) * 4 + 3] >= 128) { n = (yy * W + xx) * 4; break; }
    }
    if (n < 0) continue;
    const c: RGB = [src[n], src[n + 1], src[n + 2]];
    p.set(x, y, mix(base, [c[0] * 0.3, c[1] * 0.28, c[2] * 0.36], sel));
  }
}
