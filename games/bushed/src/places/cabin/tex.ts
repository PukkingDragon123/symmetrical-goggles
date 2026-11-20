// Cabin textures painted at runtime (pixel art at ~128-256 px/m, nearest filtering): five atlases and the
// materials that use them, registered with the places kit so Meshers can write to them by key.
//   cab_tin    green ribbed steel roofing, chalky and rust-streaked (tile 1 x 2 m, u across the ribs)
//   cab_paint  painted / plastic junk (sled, fridge, barrow, jerry cans, dish, drums), 8 x 8 cells
//   cab_cloth  wool, flannel, denim, canvas, tarp (the point blanket, the wash on the line, curtains, canoe)
//   cab_paper  printed and hand-painted matter: the CHEZ RAY sign, calendars, photos, newspapers, maps, spines
//   cab_decal  alpha-blended grime: splash-back dirt, rust and water streaks, soot, moss, needles, boot prints,
//              dust, paths, oil, cobwebs, the mouse hole, ash, chips
// plus a wavy old-glass material (cab_glass) with its own ripple normal map.
// Every rect is [x, y, w, h] in canvas pixels; uv(key) gives [u0, v0, u1, v1] for the mesh writer.
import * as THREE from 'three';
import { canvasTex } from '../../gfx/tex';
import { defineMat, hasMat, placeTex } from '../kit';

export type Rect = [number, number, number, number];
type RGBA = [number, number, number, number];

// ---------------------------------------------------------------------------------------------- noise
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, s: number, oct = 4): number {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += amp * vnoise(x * f, y * f, s + i * 31); n += amp; amp *= 0.5; f *= 2.03; }
  return t / n;
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function mixc(a: number[], b: number[], t: number): RGBA { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t), mix(a[3] ?? 255, b[3] ?? 255, t)]; }
const hex = (h: number): RGBA => [(h >> 16) & 255, (h >> 8) & 255, h & 255, 255];

// ---------------------------------------------------------------------------------------------- atlas painter
class Atlas {
  readonly c: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly rects: Record<string, Rect> = {};
  constructor(readonly W: number, readonly H: number) {
    this.c = document.createElement('canvas');
    this.c.width = W; this.c.height = H;
    this.g = this.c.getContext('2d', { willReadFrequently: true })!;
  }
  /** per-pixel painter over a rect: f(x, y, u, v) with u, v in 0..1 (v down), returns RGBA */
  px(key: string, r: Rect, f: (x: number, y: number, u: number, v: number) => RGBA): void {
    this.rects[key] = r;
    const [x0, y0, w, h] = r;
    const img = this.g.getImageData(x0, y0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = f(x, y, (x + 0.5) / w, (y + 0.5) / h);
      const o = (y * w + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
    }
    this.g.putImageData(img, x0, y0);
  }
  /** modulate an already painted rect per pixel */
  post(r: Rect, f: (c: RGBA, x: number, y: number, u: number, v: number) => RGBA): void {
    const [x0, y0, w, h] = r;
    const img = this.g.getImageData(x0, y0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const c = f([d[o], d[o + 1], d[o + 2], d[o + 3]], x, y, (x + 0.5) / w, (y + 0.5) / h);
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
    }
    this.g.putImageData(img, x0, y0);
  }
  uv(key: string): [number, number, number, number] {
    const r = this.rects[key];
    if (!r) throw new Error(`cabin atlas: no ${key}`);
    const e = 0.35;
    return [(r[0] + e) / this.W, 1 - (r[1] + r[3] - e) / this.H, (r[0] + r[2] - e) / this.W, 1 - (r[1] + e) / this.H];
  }
}

/** a pixel font for hand lettering on small paper things (5 x 7) */
const FONT: Record<string, string> = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111', '0': '01110100111010111001100011000101110',
  '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11110000010000101110000010000111110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110',
  '7': '11111000010001000100010000100001000', '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100',
  ' ': '00000000000000000000000000000000000', '.': '00000000000000000000000000110001100', '-': '00000000000000011111000000000000000',
  "'": '00100001000100000000000000000000000', '!': '00100001000010000100001000000000100', ':': '00000011000110000000011000110000000',
  '/': '00001000010001000100010001000010000', 'É': '00010001001111110000111001000011111', '&': '01100100101010001000101011001001101',
  '?': '01110100010000100110001000000000100', '#': '01010010101111101010111110101001010', '+': '00000001000010011111001000010000000',
};
function lettering(g: CanvasRenderingContext2D, x: number, y: number, s: string, col: string, scale = 1, jitter = 0, seed = 1): number {
  g.fillStyle = col;
  let cx = x;
  let k = 0;
  for (const ch of s.toUpperCase()) {
    const p = FONT[ch] ?? FONT[' '];
    const jy = jitter ? Math.round((hash(k, 3, seed) - 0.5) * jitter) : 0;
    for (let i = 0; i < 35; i++) if (p[i] === '1') g.fillRect(cx + (i % 5) * scale, y + jy + Math.floor(i / 5) * scale, scale, scale);
    cx += 6 * scale;
    k++;
  }
  return cx;
}

// ---------------------------------------------------------------------------------------------- atlases
let built = false;
export let PAINT: Atlas, CLOTH: Atlas, PAPER: Atlas, DECAL: Atlas;

/** paint every atlas and register the materials (idempotent) */
export function ensureCabinTex(): void {
  if (built) return;
  built = true;
  tinMat();
  PAINT = paintAtlas();
  CLOTH = clothAtlas();
  PAPER = paperAtlas();
  DECAL = decalAtlas();
  const tex = (a: Atlas) => canvasTex(a.c, {});
  // dev: the painted atlases, for inspection (places.html)
  try { (window as unknown as { __cabTex?: unknown }).__cabTex = { PAINT, CLOTH, PAPER, DECAL }; } catch { /* no window */ }
  defineMat('cab_paint', new THREE.MeshStandardMaterial({ name: 'cab_paint', map: tex(PAINT), roughness: 0.9, metalness: 0 }));
  defineMat('cab_cloth', new THREE.MeshStandardMaterial({ name: 'cab_cloth', map: tex(CLOTH), roughness: 1, side: THREE.DoubleSide }));
  const pt = tex(PAPER);
  defineMat('cab_paper', new THREE.MeshStandardMaterial({ name: 'cab_paper', map: pt, roughness: 0.85, alphaTest: 0.5 }));
  defineMat('cab_paper_ds', new THREE.MeshStandardMaterial({ name: 'cab_paper_ds', map: pt, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide }));
  const dt = tex(DECAL);
  defineMat('cab_decal', new THREE.MeshStandardMaterial({
    name: 'cab_decal', map: dt, roughness: 0.95, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  // cards that stand up (cobwebs, moss tufts, weeds) are alpha-tested so they sort and shadow cleanly
  defineMat('cab_card', new THREE.MeshStandardMaterial({ name: 'cab_card', map: dt, roughness: 1, alphaTest: 0.4, side: THREE.DoubleSide }));
  glassMat();
  tileMat('cab_bone', 64, (x, y) => { const n = fbm(x / 5, y / 9, 700); const c = mixc(hex(0xe2d8c0), hex(0xa08a64), n * 0.6); return hash(x, y, 701) > 0.97 ? mixc(c, hex(0x6a5034), 0.5) : c; }, 0.2);
  tileMat('cab_palm', 64, (x, y) => { const n = fbm(x / 6, y / 6, 702); return mixc(hex(0xc8b48a), hex(0x7a5a36), n); }, 0.2);
  tileMat('cab_rubber', 32, (x, y) => { const k = 28 + 16 * fbm(x / 4, y / 4, 703); return [k, k, k - 2, 255]; }, 0.5);
  tileMat('cab_rust', 64, (x, y) => mixc(hex(0x6a2e14), hex(0xa85a24), fbm(x / 5, y / 5, 704)), 0.5, 0.3);
  tileMat('cab_soil', 64, (x, y) => mixc(hex(0x4a3a2a), hex(0x2e241a), fbm(x / 4, y / 4, 705)), 0.5);
}

/** a small tiling material from a per-pixel painter (texture size px for `tile` metres) */
function tileMat(name: string, px: number, f: (x: number, y: number) => RGBA, tile: number, metal = 0): void {
  const a = new Atlas(px, px);
  a.px(name, [0, 0, px, px], (x, y) => f(x, y));
  const t = canvasTex(a.c, { repeat: true });
  t.repeat.set(1 / tile, 1 / tile);
  defineMat(name, new THREE.MeshStandardMaterial({ name, map: t, roughness: 0.92, metalness: metal * 0 }));
}

// ---------------------------------------------------------------------------------------------- tin roofing
function tinMat(): void {
  if (hasMat('cab_tin')) return;
  const W = 256, H = 512; // 1 m across (u) x 2 m down the slope (v)
  const a = new Atlas(W, H);
  const green = hex(0x48704a), chalk = hex(0x7d9a7a), dark = hex(0x2c4a30);
  a.px('tin', [0, 0, W, H], (x, y) => {
    const n = fbm(x / 40, y / 90, 11), f = fbm(x / 9, y / 14, 12, 3);
    // chalky oxidised paint in blotches, a little darker in the flats' centre lines
    let c = mixc(green, chalk, sstep(0.45, 0.8, n) * 0.75);
    c = mixc(c, dark, (f - 0.5) * 0.35 + 0.12);
    // screw rows every 0.5 m down the slope: a dark dot, then a rust streak running down from it
    const ry = y % 128, col = x % 32;
    const screw = ry < 3 && col >= 15 && col < 18;
    const streakLen = 30 + 70 * hash(Math.floor(x / 32), Math.floor(y / 128), 5);
    const streakW = 1.5 + 2.5 * hash(Math.floor(x / 32), Math.floor(y / 128), 6);
    const inStreak = Math.abs(col - 16.5 + Math.sin(ry * 0.08) * 0.8) < streakW * (1 - ry / streakLen) && ry < streakLen;
    if (inStreak && hash(Math.floor(x / 32), Math.floor(y / 128), 9) > 0.25) c = mixc(c, hex(0x8a4a22), 0.75 * (1 - ry / streakLen) + 0.15 * fbm(x / 3, y / 3, 4, 2));
    // rust blooms where paint has failed (lap edges at the panel bottoms and random)
    const bloom = sstep(0.68, 0.8, fbm(x / 20 + 9, y / 20, 13)) * (0.4 + 0.6 * sstep(380, 512, y));
    c = mixc(c, mixc(hex(0x7a3a1a), hex(0xa85a2a), f), bloom);
    if (screw) c = hex(0x3a3630);
    // dirt and lichen at the bottom of the sheet
    c = mixc(c, hex(0x4a4a34), sstep(430, 512, y) * 0.35 * fbm(x / 6, y / 6, 14, 2));
    if (hash(x, y, 77) > 0.9965) c = mixc(c, hex(0xb8c48a), 0.8);
    return [c[0] * (0.94 + 0.08 * hash(x, y, 3)), c[1] * (0.94 + 0.08 * hash(x, y, 3)), c[2] * (0.94 + 0.08 * hash(x, y, 3)), 255];
  });
  const t = canvasTex(a.c, { repeat: true });
  t.repeat.set(1, 0.5);
  defineMat('cab_tin', new THREE.MeshStandardMaterial({ name: 'cab_tin', map: t, roughness: 0.88, metalness: 0 }));
}

// ---------------------------------------------------------------------------------------------- paint
function paintAtlas(): Atlas {
  const a = new Atlas(1024, 1024);
  const cell = (i: number, j: number, w = 1, h = 1): Rect => [i * 128, j * 128, w * 128, h * 128];
  const weathered = (base: RGBA, s: number, o: { rust?: number; scuff?: number; dirt?: number; fade?: number } = {}) =>
    (x: number, y: number, u: number, v: number): RGBA => {
      const n = fbm(x / 24, y / 24, s), f = fbm(x / 5, y / 5, s + 1, 2);
      let c = mixc(base, [base[0] * 1.15 + 20, base[1] * 1.15 + 20, base[2] * 1.15 + 20, 255], (o.fade ?? 0.2) * sstep(0.4, 0.8, n));
      c = mixc(c, [base[0] * 0.7, base[1] * 0.7, base[2] * 0.7, 255], (f - 0.5) * 0.4 + 0.1);
      if (o.scuff && hash(Math.floor(x / 2), Math.floor(y / 6), s) > 1 - o.scuff) c = mixc(c, hex(0x8a8a86), 0.6);
      if (o.rust) c = mixc(c, mixc(hex(0x6a2e14), hex(0xa0581e), f), sstep(1 - o.rust, 1 - o.rust + 0.12, fbm(x / 14, y / 14, s + 3)) * (0.5 + 0.5 * v));
      if (o.dirt) c = mixc(c, hex(0x4a3e30), o.dirt * sstep(0.5, 1, v) * fbm(x / 8, y / 8, s + 4, 2));
      const k = 0.95 + 0.07 * hash(x, y, s);
      return [c[0] * k, c[1] * k, c[2] * k, 255];
    };
  a.px('sled_yellow', cell(0, 0), weathered(hex(0xd8a024), 21, { scuff: 0.05, dirt: 0.6, fade: 0.35 }));
  a.px('sled_black', cell(1, 0), (x, y, u, v) => {
    const c = weathered(hex(0x24221f), 22, { dirt: 0.3 })(x, y, u, v);
    // cracked vinyl: pale crack lines with foam showing through
    const cr = Math.abs(fbm(x / 10, y / 10, 23) - 0.5) < 0.012;
    return cr ? [150, 136, 96, 255] : c;
  });
  a.px('fridge', cell(2, 0), weathered(hex(0xd9d4c4), 24, { rust: 0.32, scuff: 0.03, dirt: 0.5, fade: 0.1 }));
  a.px('barrow', cell(3, 0), weathered(hex(0x8e2a1c), 25, { rust: 0.45, dirt: 0.5 }));
  a.px('jerry_green', cell(4, 0), weathered(hex(0x4a5a2e), 26, { rust: 0.2, scuff: 0.04 }));
  a.px('jerry_red', cell(5, 0), weathered(hex(0xa82a1e), 27, { rust: 0.16, scuff: 0.04, fade: 0.4 }));
  a.px('dish', cell(6, 0), weathered(hex(0x6c6a62), 28, { rust: 0.3, dirt: 0.8, fade: 0.1 }));
  a.px('drum_blue', cell(7, 0), weathered(hex(0x2a5a9a), 29, { dirt: 0.6, fade: 0.45 }));
  a.px('steel', cell(0, 1), weathered(hex(0x56544e), 30, { rust: 0.3 }));
  a.px('chrome', cell(1, 1), (x, y) => { const n = fbm(x / 6, y / 30, 31); const c = mixc(hex(0xc8ccd0), hex(0x6a6e72), n); return mixc(c, hex(0x8a5a2a), sstep(0.7, 0.85, fbm(x / 10, y / 10, 32)) * 0.7); });
  a.px('rubber', cell(2, 1), (x, y) => { const k = 34 + 14 * fbm(x / 4, y / 4, 33) + (y % 12 < 3 ? -10 : 0); return [k, k - 1, k - 3, 255]; });
  a.px('gas_red', cell(3, 1), weathered(hex(0xc0281a), 34, { dirt: 0.5, fade: 0.5 }));
  a.px('enamel_white', cell(4, 1), weathered(hex(0xe8e4d8), 35, { rust: 0.12, scuff: 0.02 }));
  a.px('tan_canvas', cell(5, 1), weathered(hex(0xa08a5a), 36, { dirt: 0.5 }));
  a.px('olive', cell(6, 1), weathered(hex(0x5a5a34), 37, { scuff: 0.03, dirt: 0.4 }));
  a.px('black_paint', cell(7, 1), weathered(hex(0x2a2a28), 38, { rust: 0.3, scuff: 0.03 }));
  // sled decals: a big stripe band and a hood number, invented: "TRAIL KING 440"
  a.px('sled_side', cell(0, 2, 2, 1), (x, y, u, v) => {
    const base = weathered(hex(0xd8a024), 40, { scuff: 0.04, dirt: 0.7, fade: 0.35 })(x, y, u, v);
    if (v > 0.55 && v < 0.68) return mixc(base, hex(0x1c1a18), 0.85);
    if (v > 0.7 && v < 0.74) return mixc(base, hex(0xb02018), 0.8);
    return base;
  });
  {
    const g = a.g;
    const fade = 'rgba(30,26,22,0.85)';
    lettering(g, 24, 2 * 128 + 30, 'TRAIL KING', fade, 3, 0, 4);
    lettering(g, 60, 2 * 128 + 58, '440', 'rgba(150,30,20,0.85)', 4, 0, 4);
    a.post([0, 256, 256, 128], (c, x, y) => (hash(x, y, 41) > 0.93 ? mixc(c, hex(0xd8a024), 0.7) : c));
  }
  a.px('tire_side', cell(2, 2), (x, y, u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const k = r < 0.55 ? 120 + 30 * fbm(x / 5, y / 5, 42) : 34 + 12 * fbm(x / 4, y / 4, 43) + (Math.abs(r - 0.8) < 0.02 ? 12 : 0);
    return r < 0.55 ? [k, k * 0.95, k * 0.85, 255] : [k, k, k - 2, 255];
  });
  a.px('lnb', cell(3, 2), weathered(hex(0x6a6a64), 44, { dirt: 0.4 }));
  a.px('wood_grey', cell(4, 2), (x, y) => { const n = fbm(x / 40, y / 3, 45); const k = 96 + 50 * n; return [k, k * 0.96, k * 0.9, 255]; });
  a.px('orange', cell(5, 2), weathered(hex(0xd8641a), 46, { dirt: 0.5, fade: 0.4 }));
  a.px('green_bottle', cell(6, 2), (x, y) => { const n = fbm(x / 8, y / 20, 47); return [40 + 30 * n, 80 + 40 * n, 40 + 20 * n, 255]; });
  a.px('brass', cell(7, 2), weathered(hex(0x9a7a3a), 48, { dirt: 0.5 }));
  // the fridge's door badge (invented: "COLDSPOT"-like generic "FROSTLINE") and a 1970s harvest-gold stripe
  a.px('fridge_door', cell(0, 3), (x, y, u, v) => {
    const c = weathered(hex(0xd9d4c4), 50, { rust: 0.28, scuff: 0.03, dirt: 0.5, fade: 0.1 })(x, y, u, v);
    if (u > 0.3 && u < 0.7 && v > 0.08 && v < 0.12) return mixc(c, hex(0x9a9c9c), 0.8);
    return c;
  });
  lettering(a.g, 24, 3 * 128 + 4, 'FROSTLINE', 'rgba(90,90,92,0.9)', 1);
  a.px('cooler', cell(1, 3), (x, y, u, v) => (v < 0.32 ? weathered(hex(0xe8e2d4), 51, { scuff: 0.04 })(x, y, u, v) : weathered(hex(0x2a6a4a), 52, { scuff: 0.05, dirt: 0.4, fade: 0.4 })(x, y, u, v)));
  a.px('propane', cell(2, 3), weathered(hex(0xd8d4c8), 53, { rust: 0.35, dirt: 0.5 }));
  a.px('can_rust', cell(3, 3), weathered(hex(0x8a5a32), 54, { rust: 0.6 }));
  a.px('coffee_can', cell(4, 3, 2, 1), (x, y, u, v) => {
    // a big red 2 lb coffee can, invented "MORNING CAMP" brand, rusty rims
    const c = weathered(hex(0xa82a20), 55, { rust: 0.32, scuff: 0.05 })(x, y, u, v);
    if (v < 0.1 || v > 0.9) return weathered(hex(0x8a8a84), 56, { rust: 0.5 })(x, y, u, v);
    if (v > 0.38 && v < 0.62) return mixc(c, hex(0xe8d8a8), 0.85);
    return c;
  });
  lettering(a.g, 4 * 128 + 30, 3 * 128 + 56, 'MORNING CAMP', 'rgba(120,30,20,0.95)', 2, 0, 9);
  a.px('battery', cell(6, 3), (x, y, u, v) => (v < 0.2 ? weathered(hex(0x2a2a28), 57)(x, y, u, v) : weathered(hex(0x1e1e22), 58, { dirt: 0.3 })(x, y, u, v)));
  a.px('silver', cell(7, 3), weathered(hex(0xa8acac), 59, { dirt: 0.3, scuff: 0.06 }));
  // bone and antler: bleached cream, brown and pearled toward the burr (v = 1 at the base)
  a.px('bone', cell(0, 4), (x, y, u, v) => {
    const n = fbm(x / 6, y / 14, 600);
    const c = mixc(hex(0xe6dcc4), hex(0x8a6a44), sstep(0.55, 1, v) * 0.8 + (n - 0.5) * 0.3);
    return Math.abs(fbm(x / 3, y / 12, 601) - 0.5) < 0.03 ? mixc(c, hex(0x6a5034), 0.5) : c;
  });
  a.px('kraft', cell(1, 4), (x, y, u, v) => {
    const c = weathered(hex(0x9a7a50), 602, { dirt: 0.4 })(x, y, u, v);
    if (v > 0.3 && v < 0.42) return mixc(c, hex(0xb02a1e), 0.85);
    return c;
  });
  lettering(a.g, 128 + 14, 4 * 128 + 56, 'NORTHERN', 'rgba(240,230,210,0.9)', 2, 0, 3);
  lettering(a.g, 128 + 30, 4 * 128 + 80, '24 X 341', 'rgba(40,30,20,0.8)', 1, 0, 3);
  a.px('walnut', cell(2, 4), (x, y) => { const n = fbm(x / 30, y / 3, 603); const k = 0.7 + 0.5 * n; return [92 * k, 52 * k, 28 * k, 255]; });
  a.px('blued', cell(3, 4), weathered(hex(0x2a2c30), 604, { rust: 0.15, scuff: 0.05 }));
  a.px('ski', cell(4, 4), weathered(hex(0x2e2e30), 605, { scuff: 0.08 }));
  a.px('tarpaper', cell(5, 4), (x, y) => { const k = 30 + 30 * hash(x, y, 606) + 20 * fbm(x / 20, y / 20, 607); const lap = y % 64 < 3 ? 0.6 : 1; return [k * lap, k * lap, k * 0.96 * lap, 255]; });
  a.px('hose', cell(6, 4), weathered(hex(0x2a6a2e), 608, { dirt: 0.5 }));
  a.px('speckle_blue', cell(7, 4), (x, y) => { const c = hash(x >> 1, y >> 1, 609) > 0.8 ? hex(0xe8ecf0) : hex(0x2a4a8a); return hash(x, y, 610) > 0.995 ? hex(0x1a1a1a) : c; });
  a.px('speckle_red', cell(0, 5), (x, y) => (hash(x >> 1, y >> 1, 611) > 0.82 ? hex(0xe8e0d8) : hex(0xa82a22)));
  a.px('poly_rope', cell(1, 5), (x, y) => { const tw = ((x + y * 2) % 8) < 4 ? 1 : 0.8; return [222 * tw, 180 * tw, 40 * tw, 255]; });
  a.px('alu', cell(2, 5), weathered(hex(0xb8bcbc), 612, { dirt: 0.3, scuff: 0.1 }));
  a.px('webbing', cell(3, 5), (x, y) => { const c = Math.floor(x / 16) % 3 === 0 ? hex(0xe8e4d8) : Math.floor(x / 16) % 3 === 1 ? hex(0x2a7a4a) : hex(0xd8b02a); const k = (y % 4 < 2 ? 1 : 0.85) * (0.85 + 0.2 * fbm(x / 20, y / 20, 613)); return [c[0] * k, c[1] * k, c[2] * k, 255]; });
  a.px('copper', cell(4, 5), weathered(hex(0x9a5a2a), 614, { dirt: 0.4 }));
  a.px('nails', cell(5, 5), (x, y) => { const on = (x * 7 + y * 3) % 5 === 0 || hash(x, y, 615) > 0.7; const k = on ? 80 + 60 * hash(x >> 1, y, 616) : 30; return [k * 1.05, k * 0.95, k * 0.85, 255]; });
  a.px('grey_plastic', cell(6, 5), weathered(hex(0x8a8a86), 617, { dirt: 0.5 }));
  a.px('cinder', cell(7, 5), (x, y) => { const k = 120 + 40 * hash(x, y, 618) + 30 * fbm(x / 10, y / 10, 619); return [k, k * 0.98, k * 0.94, 255]; });
  return a;
}

// ---------------------------------------------------------------------------------------------- cloth
function clothAtlas(): Atlas {
  const a = new Atlas(1024, 512);
  const knit = (x: number, y: number, s: number) => 0.9 + 0.12 * ((x + (y >> 1)) % 2) * 0.6 + 0.08 * fbm(x / 6, y / 6, s, 2);
  // the point blanket: natural cream wool, a band of green, red, yellow and indigo stripes near each end,
  // and four short black "point" lines on one edge (in the 256 x 256 cell: v = along the blanket, u across)
  a.px('point', [0, 0, 256, 256], (x, y, u, v) => {
    const k = knit(x, y, 60) * (0.96 + 0.06 * fbm(x / 30, y / 30, 61));
    let c: RGBA = [228, 218, 196, 255];
    const band = (t: number): RGBA | null => {
      // stripes from t=0 (edge) inward: cream gap, green, cream, red, cream, yellow, cream, indigo
      const s = [[0.06, 0.1, 0x2e6a3e], [0.11, 0.15, 0xb42a22], [0.16, 0.2, 0xe2b22a], [0.21, 0.25, 0x2a3466]] as [number, number, number][];
      for (const [a0, a1, col] of s) if (t > a0 && t < a1) return hex(col);
      return null;
    };
    const b = band(v) ?? band(1 - v);
    if (b) c = b;
    if (u < 0.12 && u > 0.04 && v > 0.32 && v < 0.5 && Math.floor((v - 0.32) * 200) % 9 < 3) c = [36, 32, 30, 255];
    // a moth hole and wear on the edge
    if (Math.hypot(u - 0.7, v - 0.6) < 0.008) c = [60, 50, 40, 255];
    c = mixc(c, [150, 130, 100, 255], 0.18 * fbm(x / 20, y / 20, 62));
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  });
  const plaid = (c1: number, c2: number, c3: number, s: number) => (x: number, y: number): RGBA => {
    const A = hex(c1), B = hex(c2), Cc = hex(c3);
    const sx = Math.floor(x / 16) % 2, sy = Math.floor(y / 16) % 2;
    let c = sx && sy ? B : sx || sy ? mixc(A, B, 0.5) : A;
    if (x % 32 === 3 || y % 32 === 3) c = mixc(c, Cc, 0.7);
    const k = knit(x, y, s) * (0.92 + 0.1 * fbm(x / 25, y / 25, s + 1));
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  };
  a.px('plaid_red', [256, 0, 128, 128], plaid(0xa8231c, 0x1c1a1a, 0xd8b030, 63));
  a.px('plaid_green', [384, 0, 128, 128], plaid(0x2e5a34, 0x18201a, 0xc8b878, 64));
  a.px('union', [512, 0, 128, 256], (x, y) => {
    const k = knit(x, y, 65) * (0.9 + 0.12 * fbm(x / 20, y / 20, 66)) * (y % 6 === 0 ? 0.9 : 1);
    return [176 * k, 40 * k, 34 * k, 255];
  });
  a.px('jeans', [640, 0, 128, 256], (x, y) => {
    const tw = ((x + y) % 4 < 2) ? 1.05 : 0.93;
    const fade = fbm(x / 18, y / 26, 67);
    const k = tw * (0.85 + 0.25 * fade);
    return [58 * k + 30 * fade, 78 * k + 26 * fade, 118 * k + 18 * fade, 255];
  });
  a.px('towel', [768, 0, 128, 128], (x, y, u, v) => {
    let c = hex(0xe0d8c4);
    if (v > 0.12 && v < 0.2) c = hex(0x3a6a9a);
    if (v > 0.8 && v < 0.88) c = hex(0x3a6a9a);
    const k = 0.85 + 0.2 * hash(x, y, 68);
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  });
  a.px('wool_sock', [896, 0, 128, 128], (x, y, u, v) => {
    let c = hex(0x8a847a);
    if (v > 0.62 && v < 0.72) c = hex(0xb02a22);
    if (v > 0.74 && v < 0.78) c = hex(0xe8e0d0);
    const k = knit(x, y, 69);
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  });
  a.px('toque', [256, 128, 128, 128], (x, y, u, v) => {
    const c = Math.floor(v * 8) % 2 ? hex(0xb8281e) : hex(0xe8e0d0);
    const k = 0.85 + 0.15 * ((x % 4 < 2) !== (y % 4 < 2) ? 1 : 0) * 0.7 + 0.1 * hash(x, y, 70);
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  });
  a.px('gingham', [384, 128, 128, 128], (x, y) => {
    const sx = Math.floor(x / 8) % 2, sy = Math.floor(y / 8) % 2;
    const c = sx && sy ? hex(0x9a3a32) : sx || sy ? hex(0xc89a8a) : hex(0xe8dcc8);
    const k = (0.9 + 0.12 * fbm(x / 30, y / 30, 71)) * (0.96 + 0.06 * hash(x, y, 72));
    // sun-faded toward the bottom
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  });
  a.px('floursack', [768, 128, 128, 128], (x, y, u, v) => {
    let c = hex(0xe2d8c0);
    const fl = Math.hypot((u * 4) % 1 - 0.5, (v * 4) % 1 - 0.5);
    if (fl < 0.16) c = hex(0xc8705a);
    if (fl > 0.2 && fl < 0.24 && hash(Math.floor(u * 4), Math.floor(v * 4), 73) > 0.4) c = hex(0x7a9a6a);
    const k = 0.9 + 0.12 * fbm(x / 20, y / 20, 74);
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  });
  // canoe canvas: faded forest green, scuffed pale along the keel line, patches, a red stem band
  a.px('canoe', [0, 256, 512, 128], (x, y, u, v) => {
    const n = fbm(x / 30, y / 20, 75);
    let c = mixc(hex(0x3e6a4a), hex(0x8aa088), sstep(0.45, 0.85, n) * 0.7);
    c = mixc(c, hex(0xc8c0a8), sstep(0.8, 1, v) * 0.6 * fbm(x / 4, y / 4, 76, 2));
    for (const [px, py] of [[0.3, 0.6], [0.72, 0.4]]) if (Math.abs(u - px) < 0.03 && Math.abs(v - py) < 0.14) c = mixc(hex(0x5a6a4a), c, 0.2);
    if (u < 0.03 || u > 0.97) c = hex(0x8a2a1e);
    const k = 0.93 + 0.08 * hash(x, y, 77);
    return [c[0] * k, c[1] * k, c[2] * k, 255];
  });
  // blue poly tarp: woven strips, white edge band with grommets, dirt and leaves pooled in the folds
  a.px('tarp', [512, 256, 256, 256], (x, y, u, v) => {
    const weave = ((x >> 1) + (y >> 1)) % 2 ? 1.04 : 0.95;
    let c = mixc(hex(0x2a5aa8), hex(0x6a8ab8), sstep(0.55, 0.9, fbm(x / 26, y / 26, 78)) * 0.6);
    const e = Math.min(u, v, 1 - u, 1 - v);
    if (e < 0.04) c = hex(0xd8d8d0);
    if (e < 0.04 && e > 0.01 && (Math.floor((u + v) * 40) % 6 === 0)) c = hex(0x9a9a94);
    c = mixc(c, hex(0x5a4a34), sstep(0.62, 0.8, fbm(x / 16, y / 16, 79)) * 0.6);
    return [c[0] * weave, c[1] * weave, c[2] * weave, 255];
  });
  a.px('vest', [768, 256, 128, 128], (x, y) => { const k = knit(x, y, 80); return [232 * k, 104 * k, 26 * k, 255]; });
  a.px('duck', [896, 256, 128, 128], (x, y) => {
    const k = (((x + y) % 3) ? 1 : 0.92) * (0.88 + 0.16 * fbm(x / 20, y / 20, 81));
    return [150 * k, 120 * k, 74 * k, 255];
  });
  a.px('sheet', [768, 384, 128, 128], (x, y) => { const k = 0.86 + 0.14 * fbm(x / 14, y / 14, 82); return [206 * k, 200 * k, 188 * k, 255]; });
  a.px('grey_wool', [896, 384, 128, 128], (x, y) => { const k = knit(x, y, 83) * (0.9 + 0.12 * fbm(x / 20, y / 20, 84)); return [104 * k, 100 * k, 94 * k, 255]; });
  a.px('flannel_blue', [256, 384, 128, 128], plaid(0x2a3a6a, 0x16182a, 0x9a9aa8, 85));
  a.px('mackinaw', [384, 384, 128, 128], plaid(0xa02a20, 0x161414, 0xa02a20, 86));
  return a;
}

// ---------------------------------------------------------------------------------------------- paper
function paperAtlas(): Atlas {
  const a = new Atlas(1024, 1024);
  const g = a.g;
  const aged = (base: RGBA, s: number, edge = 10) => (x: number, y: number, u: number, v: number): RGBA => {
    const e = Math.min(u, v, 1 - u, 1 - v) * 100;
    const k = 1 - 0.18 * (1 - sstep(0, edge, e)) - 0.08 * fbm(x / 14, y / 14, s);
    let c: RGBA = [base[0] * k, base[1] * k, base[2] * k, 255];
    if (hash(x >> 1, y >> 1, s) > 0.992) c = mixc(c, hex(0x9a7040), 0.5); // foxing
    return c;
  };
  // ---- CHEZ RAY: hand-painted white letters on a grey slab board, the paint flaking
  a.px('sign_ray', [0, 0, 512, 128], (x, y, u, v) => {
    const grain = fbm(x / 60, y / 3, 90), k = 92 + 58 * grain + 18 * fbm(x / 6, y / 2, 91, 2);
    let c: RGBA = [k, k * 0.95, k * 0.88, 255];
    if (Math.abs(fbm(x / 30, y / 1.5, 92) - 0.5) < 0.012) c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 255]; // checks
    // bark edge (live edge) at the top and bottom
    const edge = 8 + 6 * fbm(x / 20, 0, 93);
    if (y < edge || y > 128 - edge) c = mixc(hex(0x4a3a2a), hex(0x2a2018), fbm(x / 4, y / 4, 94));
    return c;
  });
  g.save();
  g.font = 'bold 74px Georgia, "DejaVu Serif", serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#e8e2d2';
  g.translate(256, 66);
  g.rotate(-0.012);
  g.fillText('CHEZ  RAY', -g.measureText('CHEZ  RAY').width / 2, 0);
  g.restore();
  g.font = 'bold 18px Georgia, serif';
  g.fillStyle = '#c84a2a';
  g.fillText('est. 1985', 380, 112);
  // flake the paint: wherever the paint is, knock holes out with noise
  a.post([0, 0, 512, 128], (c, x, y) => {
    if (c[0] > 190 && c[1] > 180) {
      const f = fbm(x / 7, y / 7, 95);
      if (f > 0.66) { const k = 92 + 50 * fbm(x / 60, y / 3, 90); return [k, k * 0.95, k * 0.88, 255]; }
      const k = 0.88 + 0.12 * hash(x, y, 96);
      return [c[0] * k, c[1] * k, c[2] * k, 255];
    }
    return c;
  });
  // ---- NO HUNTING / DÉFENSE DE CHASSER: faded orange tin sign with nail holes
  a.px('sign_hunt', [512, 0, 256, 128], (x, y, u, v) => {
    let c = mixc(hex(0xe8862a), hex(0xf0c890), sstep(0.3, 0.9, fbm(x / 40, y / 40, 97)) * 0.7);
    const e = Math.min(u, v, 1 - u, 1 - v);
    if (e < 0.04) c = hex(0x2a2420);
    c = mixc(c, hex(0x7a3a1a), sstep(0.7, 0.85, fbm(x / 9, y / 9, 98)) * 0.8);
    if (Math.hypot(x - 10, y - 10) < 2.5 || Math.hypot(x - 246, y - 10) < 2.5) c = hex(0x1a1410);
    return c;
  });
  lettering(g, 512 + 34, 22, 'NO HUNTING', '#1e1a18', 3);
  lettering(g, 512 + 22, 58, 'DEFENSE DE CHASSER', '#1e1a18', 2);
  lettering(g, 512 + 74, 90, 'ZONE 17', '#3a2a22', 2);
  // ---- calendars: feed-and-seed with a painted lake scene; an old one from 1997 with a moose
  const calendar = (key: string, x0: number, y0: number, scene: 'lake' | 'moose', title: string, year: string) => {
    a.px(key, [x0, y0, 128, 192], (x, y, u, v) => {
      let c = aged(hex(0xe8e2d0), 100 + x0, 4)(x, y, u, v);
      if (v > 0.05 && v < 0.48 && u > 0.06 && u < 0.94) {
        // painting
        const sky = mixc(hex(scene === 'lake' ? 0xe8a060 : 0x9ab8c8), hex(0x5a7aa8), 1 - (v - 0.05) / 0.25);
        const hill = 0.24 + 0.05 * Math.sin(u * 9 + (scene === 'lake' ? 1 : 3)) + 0.03 * Math.sin(u * 23);
        if (v < hill) c = sky;
        else if (v < 0.32) c = mixc(hex(0x1e3a2a), hex(0x2e4a32), fbm(x / 3, y / 3, 101));
        else c = scene === 'lake' ? mixc(hex(0x3a5a7a), hex(0xe8a060), (Math.sin(y * 1.7) > 0.7 ? 0.5 : 0) * (1 - Math.abs(u - 0.6) * 3)) : mixc(hex(0x5a6a3a), hex(0x8a7a4a), fbm(x / 5, y / 5, 102));
        if (scene === 'moose') {
          const mx = (u - 0.55) / 0.22, my = (v - 0.36) / 0.1;
          if (mx * mx + my * my < 1 || (Math.abs(u - 0.43) < 0.04 && v > 0.3 && v < 0.38) || (v > 0.4 && v < 0.46 && [0.42, 0.5, 0.6, 0.66].some((q) => Math.abs(u - q) < 0.012))) c = hex(0x3a2a1e);
          if (v > 0.24 && v < 0.29 && Math.abs(u - 0.38) < 0.08 && Math.sin(u * 120) > 0) c = hex(0x6a5a40);
        }
      }
      // the month grid
      if (v > 0.58 && v < 0.96 && u > 0.06 && u < 0.94) {
        const gx = (u - 0.06) / 0.88 * 7, gy = (v - 0.58) / 0.38 * 5;
        if (gx % 1 < 0.06 || gy % 1 < 0.06) c = mixc(c, hex(0x6a6a6a), 0.6);
        if (gx % 1 > 0.15 && gx % 1 < 0.4 && gy % 1 > 0.15 && gy % 1 < 0.35) c = mixc(c, hex(0x2a2a2a), 0.7);
        // days crossed off in pencil (first two rows of the current one)
        if (scene === 'lake' && gy < 2.4 && Math.abs((gx % 1) - (gy % 1)) < 0.05) c = mixc(c, hex(0x4a4a5a), 0.7);
        if (Math.floor(gx) === 3 && Math.floor(gy) === 3 && Math.hypot((gx % 1) - 0.5, (gy % 1) - 0.5) > 0.32 && Math.hypot((gx % 1) - 0.5, (gy % 1) - 0.5) < 0.42) c = hex(0xb02a1e);
      }
      return c;
    });
    lettering(g, x0 + 10, y0 + 98, title, '#7a2a1e', 1);
    lettering(g, x0 + 92, y0 + 98, year, '#2a2a2a', 1);
    // binding holes
    for (let i = 0; i < 6; i++) g.clearRect(x0 + 18 + i * 18, y0 + 2, 3, 2);
  };
  calendar('cal_lake', 768, 0, 'lake', 'GAUTHIER FEED', 'SEPT');
  calendar('cal_moose', 896, 0, 'moose', 'BAIT & TACKLE', '1997');
  // ---- photos: polaroids and old prints (pixel scenes)
  const photo = (key: string, x0: number, y0: number, s: number) => {
    a.px(key, [x0, y0, 48, 58], (x, y, u, v) => {
      const bx = x >= 3 && x < 45 && y >= 3 && y < 45;
      if (!bx) return aged(hex(0xece6d6), 110 + s, 3)(x, y, u, v);
      const pu = (x - 3) / 42, pv = (y - 3) / 42;
      let c: RGBA;
      const sepia = s % 3 === 2;
      if (s % 4 === 0) { // a man holding a fish by a lake
        c = pv < 0.45 ? mixc(hex(0x8ab0d0), hex(0xd8e0e0), pv * 2) : mixc(hex(0x3a5a6a), hex(0x2a3a3a), pv);
        if (Math.abs(pu - 0.45) < 0.1 && pv > 0.3 && pv < 1) c = hex(0x8a2a22);
        if (Math.hypot(pu - 0.45, pv - 0.24) < 0.08) c = hex(0xc89a7a);
        if (pv > 0.5 && pv < 0.6 && pu > 0.45 && pu < 0.85) c = hex(0xb0b8a0);
      } else if (s % 4 === 1) { // a pickup truck in snow
        c = pv < 0.5 ? hex(0xb8c4d0) : hex(0xe8ecf0);
        if (pv > 0.42 && pv < 0.7 && pu > 0.15 && pu < 0.85) c = hex(0x2a4a7a);
        if (pv > 0.42 && pv < 0.52 && pu > 0.5 && pu < 0.72) c = hex(0x9ab0c0);
        if (Math.hypot(pu - 0.3, pv - 0.72) < 0.08 || Math.hypot(pu - 0.72, pv - 0.72) < 0.08) c = hex(0x1a1a1a);
        if (pv < 0.42 && Math.abs(Math.sin(pu * 30)) < 0.2 && pv > 0.15) c = hex(0x2a3a2a);
      } else if (s % 4 === 2) { // a dog on the porch steps
        c = pv < 0.6 ? mixc(hex(0x6a5a44), hex(0x4a3a2a), Math.sin(pv * 40) > 0 ? 0.3 : 0.7) : hex(0x8a7a5a);
        if (Math.hypot((pu - 0.5) / 1.6, pv - 0.62) < 0.13) c = hex(0x2a2018);
        if (Math.hypot(pu - 0.62, pv - 0.48) < 0.08) c = hex(0x2a2018);
      } else { // four people at a fish fry, squinting
        c = pv < 0.4 ? hex(0x7a9a6a) : hex(0x5a6a4a);
        for (let i = 0; i < 4; i++) {
          const cx = 0.18 + i * 0.21;
          if (Math.abs(pu - cx) < 0.07 && pv > 0.42) c = hex([0x8a2a22, 0x2a4a6a, 0xd8c8a8, 0x4a5a2a][i]);
          if (Math.hypot(pu - cx, pv - 0.34) < 0.06) c = hex(0xc8a080);
        }
      }
      if (sepia) { const l = (c[0] + c[1] + c[2]) / 3; c = [l * 1.05 + 20, l * 0.92 + 10, l * 0.72, 255]; }
      // fade and a glossy crack
      c = mixc(c, hex(0xe8dcc0), 0.18 + 0.15 * fbm(x / 10, y / 10, 120 + s));
      if (Math.abs(pu - pv * 0.6 - 0.3) < 0.01 && s % 2) c = mixc(c, hex(0xf0f0f0), 0.6);
      return c;
    });
  };
  for (let i = 0; i < 8; i++) photo(`photo_${i}`, (i % 8) * 50, 132, i);
  // ---- newspapers: masthead, headline bars, grey columns, a halftone photo; yellowed
  const news = (key: string, x0: number, y0: number, s: number) => {
    a.px(key, [x0, y0, 160, 224], (x, y, u, v) => {
      let c = aged(hex(0xdcd6c2), 130 + s, 6)(x, y, u, v);
      const col = Math.floor((u - 0.04) / 0.92 * 4);
      const inCol = u > 0.04 && u < 0.96 && ((u - 0.04) / 0.92 * 4) % 1 < 0.9;
      if (v > 0.03 && v < 0.11 && u > 0.08 && u < 0.92) { if (hash(x >> 1, y >> 1, s) > 0.35) c = mixc(c, hex(0x1a1a1a), 0.9); }
      else if (v > 0.12 && v < 0.125) c = mixc(c, hex(0x2a2a2a), 0.8);
      else if (v > 0.15 && v < 0.21 && u > 0.06 && u < 0.86) { if (hash(x >> 2, 0, s + 1) > 0.25 && y % 8 < 6) c = mixc(c, hex(0x222222), 0.85); }
      else if (v > 0.24 && v < 0.5 && u > 0.06 && u < 0.54) { const ht = fbm(x / 8, y / 8, s + 2); if (((x + y) % 2 === 0) && ht > 0.45) c = mixc(c, hex(0x2a2a2a), 0.75); else c = mixc(c, hex(0x8a8a84), ht * 0.5); }
      else if (v > 0.22 && v < 0.97 && inCol && y % 3 === 0 && hash(Math.floor(x / 3), y, s + col) > 0.18) c = mixc(c, hex(0x4a4a48), 0.55);
      return c;
    });
  };
  news('news_0', 0, 192, 1);
  news('news_1', 160, 192, 2);
  g.font = 'bold 13px Georgia, serif'; g.fillStyle = 'rgba(20,20,20,0.85)';
  // ---- topo map: green-white relief, blue lakes and creeks, contours, a grid, pencil lines and a red X
  a.px('topo', [320, 192, 256, 320], (x, y, u, v) => {
    const h = fbm(u * 3.2, v * 4, 140, 5);
    let c = mixc(hex(0xe8e8d0), hex(0xc8dcb0), sstep(0.35, 0.6, fbm(u * 6, v * 7, 141)));
    const lake = h < 0.36;
    if (lake) c = hex(0x9ac4dc);
    const lev = Math.floor(h * 28);
    const lr = Math.floor(fbm((x + 1) / 256 * 3.2, v * 4, 140, 5) * 28), ld = Math.floor(fbm(u * 3.2, (y + 1) / 320 * 4, 140, 5) * 28);
    if (!lake && (lr !== lev || ld !== lev)) c = mixc(c, hex(0x9a6a3a), lev % 5 === 0 ? 0.8 : 0.45);
    if (Math.abs(fbm(u * 2, v * 2.5, 142) - 0.5) < 0.006) c = hex(0x3a7ab0);
    if (x % 64 === 0 || y % 64 === 0) c = mixc(c, hex(0x5a7aa0), 0.5);
    const e = Math.min(u, v, 1 - u, 1 - v);
    if (e < 0.015) c = hex(0xf0ece0);
    return aged(c, 143, 4)(x, y, u, v)[0] > 0 ? mixc(c, aged(c, 143, 4)(x, y, u, v), 0.6) : c;
  });
  g.strokeStyle = 'rgba(60,60,70,0.7)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(320 + 30, 192 + 280); g.lineTo(320 + 80, 192 + 210); g.lineTo(320 + 120, 192 + 180); g.lineTo(320 + 190, 192 + 90); g.stroke();
  g.strokeStyle = '#b02a1e'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(320 + 185, 192 + 82); g.lineTo(320 + 197, 192 + 96); g.moveTo(320 + 197, 192 + 82); g.lineTo(320 + 185, 192 + 96); g.stroke();
  lettering(g, 320 + 8, 192 + 8, 'CANTON 17 - 31 M/4', '#2a2a2a', 1);
  // ---- fish chart: "FISH OF ONTARIO" style, invented, five silhouettes
  a.px('fishchart', [576, 192, 128, 176], (x, y, u, v) => {
    let c = aged(hex(0xe4ddc4), 150, 5)(x, y, u, v);
    for (let i = 0; i < 5; i++) {
      const cy = 0.2 + i * 0.16, len = 0.34 + 0.05 * (i % 3);
      const fx = (u - 0.5) / len, fy = (v - cy) / 0.045;
      if (fx * fx + fy * fy < 1) c = hex([0x5a7a4a, 0x8a8a5a, 0x6a5a3a, 0x9aa0a0, 0x4a5a3a][i]);
      if (fx > 0.9 && fx < 1.35 && Math.abs(fy) < (fx - 0.9) * 2.4) c = hex([0x5a7a4a, 0x8a8a5a, 0x6a5a3a, 0x9aa0a0, 0x4a5a3a][i]);
    }
    return c;
  });
  lettering(g, 576 + 14, 192 + 6, 'POISSONS', '#2a3a5a', 1);
  // ---- notes, receipts, QSL cards, a licence plate
  const note = (key: string, x0: number, y0: number, w: number, h: number, base: number, s: number, text: string, ink = '#2a2a3a') => {
    a.px(key, [x0, y0, w, h], (x, y, u, v) => {
      let c = aged(hex(base), 160 + s, 4)(x, y, u, v);
      if (base === 0xece8dc && y % 5 === 0 && y > 8) c = mixc(c, hex(0x9ab0c8), 0.5);
      return c;
    });
    lettering(g, x0 + 3, y0 + 3, text, ink, 1, 1, s);
  };
  note('note_0', 704, 192, 64, 48, 0xe8d860, 1, 'CALL ODILE');
  note('note_1', 768, 192, 64, 48, 0xece8dc, 2, 'THU 10PM');
  note('note_2', 832, 192, 64, 48, 0xece8dc, 3, 'OIL 2X');
  note('note_3', 896, 192, 64, 48, 0xe8c8b8, 4, '7 MOOSE');
  note('qsl_0', 704, 240, 64, 40, 0xd8e8f0, 5, 'VE3 QSL', '#1a3a7a');
  note('qsl_1', 768, 240, 64, 40, 0xf0e0a0, 6, 'KL7 73', '#8a2a1a');
  note('qsl_2', 832, 240, 64, 40, 0xe0f0d8, 7, 'VO1 QSL', '#2a5a2a');
  note('receipt', 896, 240, 40, 64, 0xf0ece4, 8, 'PRUNEAU');
  a.px('plate', [704, 304, 128, 64], (x, y, u, v) => {
    let c = mixc(hex(0xe8e4dc), hex(0xc8c0b0), fbm(x / 20, y / 20, 170));
    const e = Math.min(u, v, 1 - u, 1 - v);
    if (e < 0.05) c = hex(0x2a3a7a);
    c = mixc(c, hex(0x8a4a22), sstep(0.68, 0.82, fbm(x / 8, y / 8, 171)) * 0.8);
    return c;
  });
  lettering(g, 704 + 22, 304 + 22, '587 BRT', '#2a3a7a', 2);
  lettering(g, 704 + 36, 304 + 50, '1987', '#2a3a7a', 1);
  // ---- book spines: a strip of paperbacks, hardcovers and old magazines (u across spines)
  a.px('spines', [0, 512, 512, 96], (x, y, u, v) => {
    const i = Math.floor(x / 16), s = hash(i, 0, 180);
    const base = hex([0x8a2a22, 0x2a4a6a, 0x3a5a2a, 0xd8c8a0, 0x1e1e1e, 0xe8b830, 0x6a3a5a, 0x9a6a3a, 0x2a6a6a, 0xc8581e][Math.floor(s * 10)]);
    let c = mixc(base, hex(0xd8d0c0), 0.15 * fbm(x / 6, y / 6, 181));
    const xi = x % 16;
    if (xi === 0 || xi === 15) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 255];
    if ((y > 14 && y < 18) || (y > 78 && y < 82)) c = mixc(c, hex(0xe8d070), s > 0.5 ? 0.7 : 0);
    if (y > 26 && y < 70 && xi > 5 && xi < 10 && hash(xi, y >> 2, i) > 0.45) c = mixc(c, s > 0.5 ? hex(0xe8e0d0) : hex(0x1a1a1a), 0.7);
    return c;
  });
  a.px('page_edge', [512, 512, 64, 64], (x, y) => { const k = 210 + 20 * hash(x, y >> 1, 182) - (y % 2) * 12; return [k, k * 0.95, k * 0.85, 255]; });
  // ---- seed/feed sack label, a fishing licence, a ration-box label
  a.px('mag_0', [576, 512, 96, 128], (x, y, u, v) => {
    let c = aged(hex(0xe8e0c8), 190, 3)(x, y, u, v);
    if (v < 0.16) c = hex(0xe8c020);
    if (v > 0.2 && v < 0.85 && u > 0.08 && u < 0.92) c = mixc(hex(0x4a6a3a), hex(0x8aa0b8), sstep(0.3, 0.7, fbm(x / 10, y / 10, 191)));
    if (v > 0.45 && v < 0.75 && Math.abs(u - 0.5) < 0.18) c = hex(0x6a4a2a);
    return c;
  });
  lettering(g, 576 + 8, 512 + 6, 'OUTDOORS', '#1a1a1a', 1);
  return a;
}

// ---------------------------------------------------------------------------------------------- decals
function decalAtlas(): Atlas {
  const a = new Atlas(1024, 1024);
  const soft = (u: number, v: number, e = 0.25) => sstep(0, e, Math.min(u, v, 1 - u, 1 - v));
  const rad = (u: number, v: number) => Math.hypot(u - 0.5, v - 0.5) * 2;
  // splash-back: the bottom of a wall darkened by rain splash and mud (v = 1 at the bottom edge)
  a.px('grime_band', [0, 0, 512, 128], (x, y, u, v) => {
    const n = fbm(x / 18, y / 10, 200);
    const t = sstep(0.0, 1.0, v + (n - 0.5) * 0.5) * soft(u, 0.5, 0.08);
    const c = mixc(hex(0x5a4a38), hex(0x2a2218), fbm(x / 4, y / 4, 201, 2));
    return [c[0], c[1], c[2], 255 * clamp01(t * 0.9 + (hash(x, y, 202) > 0.97 ? 0.3 : 0) * t)];
  });
  // water stain running down from a sill (v down)
  a.px('streak', [512, 0, 64, 256], (x, y, u, v) => {
    const w = 0.35 + 0.15 * Math.sin(v * 9) + 0.2 * fbm(0, y / 20, 203);
    const t = sstep(w, w - 0.25, Math.abs(u - 0.5) * 2) * (1 - v) * sstep(0, 0.08, v);
    return [40, 34, 28, 255 * t * 0.7];
  });
  a.px('rust_streak', [576, 0, 64, 256], (x, y, u, v) => {
    const w = 0.3 + 0.12 * Math.sin(v * 7 + 1) + 0.25 * fbm(0, y / 16, 204);
    const t = sstep(w, w - 0.3, Math.abs(u - 0.5 + 0.06 * Math.sin(v * 5)) * 2) * Math.pow(1 - v, 1.3);
    const c = mixc(hex(0x9a4a1a), hex(0x5a2a10), fbm(x / 3, y / 3, 205));
    return [c[0], c[1], c[2], 255 * t * 0.85];
  });
  a.px('soot', [640, 0, 128, 128], (x, y, u, v) => {
    const r = rad(u, v * 0.8 + 0.1) + (fbm(x / 10, y / 10, 206) - 0.5) * 0.5;
    const t = sstep(1, 0.2, r);
    return [18, 16, 14, 255 * t * 0.85];
  });
  a.px('moss', [768, 0, 128, 128], (x, y, u, v) => {
    const n = fbm(x / 12, y / 12, 207), f = fbm(x / 3, y / 3, 208, 2);
    const t = sstep(0.5, 0.62, n) * sstep(1, 0.6, rad(u, v));
    const c = mixc(hex(0x4a6a24), hex(0x9aaa3a), f);
    return [c[0], c[1], c[2], 255 * t];
  });
  a.px('needles', [896, 0, 128, 128], (x, y, u, v) => {
    // scattered spruce needles: short dark strokes at random angles, denser in the middle
    const cx = Math.floor(x / 4), cy = Math.floor(y / 4);
    let t = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const hx = cx + dx, hy = cy + dy;
      if (hash(hx, hy, 209) > 0.45 + 0.4 * rad(u, v)) continue;
      const ang = hash(hx, hy, 210) * Math.PI, px = hx * 4 + 2, py = hy * 4 + 2;
      const ex = x - px, ey = y - py;
      const al = ex * Math.cos(ang) + ey * Math.sin(ang), ac = -ex * Math.sin(ang) + ey * Math.cos(ang);
      if (Math.abs(al) < 4 && Math.abs(ac) < 0.6) t = 1;
    }
    const c = mixc(hex(0x8a5a2a), hex(0x5a3a1e), hash(x, y, 211));
    return [c[0], c[1], c[2], 255 * t];
  });
  // muddy boot prints walking up the strip (v), left/right alternating
  a.px('boots', [0, 128, 128, 512], (x, y, u, v) => {
    const step = 0.125, i = Math.floor(v / step), lv = (v % step) / step;
    const side = i % 2 ? 0.66 : 0.34;
    const bu = (u - side) / 0.15, bv = (lv - 0.5) / 0.42;
    const sole = bu * bu + bv * bv * 0.9 < 1 && !(bv > 0.05 && bv < 0.22);
    const tread = ((x + y) % 4 < 2) ? 1 : 0.6;
    const fadeIn = 0.4 + 0.6 * (1 - v);
    return [74, 58, 40, sole ? 210 * tread * fadeIn * (0.6 + 0.4 * hash(i, 0, 212)) : 0];
  });
  a.px('mud', [128, 128, 128, 128], (x, y, u, v) => {
    const t = sstep(0.62, 0.45, rad(u, v) + (fbm(x / 9, y / 9, 213) - 0.5) * 0.6);
    const c = mixc(hex(0x4a3a28), hex(0x2a2018), fbm(x / 3, y / 3, 214));
    return [c[0], c[1], c[2], 255 * t * 0.92];
  });
  a.px('dust', [256, 128, 128, 128], (x, y, u, v) => {
    const t = sstep(1, 0.3, rad(u, v)) * (0.5 + 0.5 * fbm(x / 8, y / 8, 215));
    return [150, 140, 122, 255 * t * 0.55];
  });
  a.px('path', [384, 128, 256, 256], (x, y, u, v) => {
    const t = sstep(1, 0.45, rad(u, v) + (fbm(x / 20, y / 20, 216) - 0.5) * 0.45);
    const c = mixc(hex(0x6a5a40), hex(0x4a3a28), fbm(x / 4, y / 4, 217, 2));
    const peb = hash(x >> 1, y >> 1, 218) > 0.985;
    return peb ? [140, 132, 118, 255 * t] : [c[0], c[1], c[2], 255 * t * 0.85];
  });
  a.px('oil', [640, 128, 128, 128], (x, y, u, v) => {
    const t = sstep(0.75, 0.4, rad(u, v) + (fbm(x / 8, y / 8, 219) - 0.5) * 0.5);
    return [14, 12, 10, 255 * t * 0.8];
  });
  a.px('cobweb', [768, 128, 128, 128], (x, y, u, v) => {
    // a corner web: radial threads from the top-left corner plus sagging spiral arcs, dust caught in it
    const r = Math.hypot(u, v), ang = Math.atan2(v, u);
    const radial = Math.abs(((ang / (Math.PI / 2)) * 7) % 1 - 0.5) > 0.45;
    const spiral = Math.abs((r * 9 + Math.sin(ang * 7) * 0.15) % 1) < 0.06;
    const t = (radial || spiral) && r < 0.95 ? 0.75 : 0;
    const dust = fbm(x / 10, y / 10, 220) > 0.62 && r < 0.6 ? 0.35 : 0;
    return [220, 220, 210, 255 * Math.max(t, dust) * sstep(1, 0.7, r)];
  });
  a.px('hole', [896, 128, 64, 64], (x, y, u, v) => {
    // a gnawed arch at the bottom edge: black inside, chewed pale wood rim
    const ex = (u - 0.5) / 0.38, ey = (1 - v) / 0.7;
    const d = ex * ex + ey * ey + (fbm(x / 3, y / 3, 221) - 0.5) * 0.25;
    if (d < 1) return [10, 8, 6, 255];
    if (d < 1.35) return [170, 140, 100, 255 * (1.35 - d) / 0.35];
    return [0, 0, 0, 0];
  });
  a.px('ash', [0, 640, 256, 256], (x, y, u, v) => {
    const r = rad(u, v) + (fbm(x / 14, y / 14, 222) - 0.5) * 0.35;
    const t = sstep(1, 0.6, r);
    const c = mixc(hex(0x8a8682), hex(0x2a2826), sstep(0.2, 0.7, r) + (fbm(x / 3, y / 3, 223) - 0.5) * 0.4);
    return [c[0], c[1], c[2], 255 * t * 0.9];
  });
  a.px('chips', [256, 640, 256, 256], (x, y, u, v) => {
    const cx = Math.floor(x / 7), cy = Math.floor(y / 7);
    const on = hash(cx, cy, 224) > 0.35 + 0.55 * rad(u, v);
    const inChip = Math.abs((x % 7) - 3) < 1 + 2 * hash(cx, cy, 225) && Math.abs((y % 7) - 3) < 1 + 1.5 * hash(cx, cy, 226);
    const pale = hash(cx, cy, 227) > 0.4;
    const c = pale ? mixc(hex(0xd8b886), hex(0xa88a5a), hash(x, y, 228)) : mixc(hex(0x5a4030), hex(0x3a2a20), hash(x, y, 229));
    const base = sstep(1, 0.5, rad(u, v)) * 0.35;
    return on && inChip ? [c[0], c[1], c[2], 255] : [92, 72, 50, 255 * base * fbm(x / 6, y / 6, 230)];
  });
  a.px('leaves', [512, 640, 128, 128], (x, y, u, v) => {
    const cx = Math.floor(x / 6), cy = Math.floor(y / 6);
    const on = hash(cx, cy, 231) > 0.55 + 0.45 * rad(u, v);
    const lx = (x % 6) - 2.5, ly = (y % 6) - 2.5;
    const leaf = lx * lx / 6 + ly * ly / 3 < 1;
    const c = mixc(hex(0xd8a828), hex(0x9a6a1a), hash(cx, cy, 232));
    return [c[0], c[1], c[2], on && leaf ? 255 : 0];
  });
  a.px('lichen', [640, 640, 128, 128], (x, y, u, v) => {
    const t = sstep(0.6, 0.68, fbm(x / 6, y / 6, 233)) * sstep(1, 0.5, rad(u, v));
    return [168, 182, 138, 255 * t];
  });
  a.px('ring', [768, 640, 64, 64], (x, y, u, v) => {
    const r = rad(u, v);
    const t = Math.abs(r - 0.8) < 0.08 ? 0.6 : r < 0.8 ? 0.12 : 0;
    return [90, 54, 24, 255 * t * (0.7 + 0.3 * hash(x, y, 234))];
  });
  a.px('scorch', [832, 640, 128, 128], (x, y, u, v) => {
    const r = rad(u, v) + (fbm(x / 8, y / 8, 235) - 0.5) * 0.4;
    return [26, 20, 16, 255 * sstep(0.9, 0.3, r) * 0.9];
  });
  // grass and weed tufts for cards: yellowing autumn grass blades and fireweed stalks gone to seed
  a.px('weeds', [0, 896, 256, 128], (x, y, u, v) => {
    const blade = Math.floor(x / 3);
    const h = 0.35 + 0.6 * hash(blade, 0, 236);
    const lean = (hash(blade, 1, 237) - 0.5) * 10 * (1 - v);
    const xb = blade * 3 + 1 + lean;
    const on = Math.abs(x - xb) < 1.1 * (0.4 + v) && 1 - v < h;
    const dry = hash(blade, 2, 238);
    const c = dry > 0.6 ? mixc(hex(0x8a7a4a), hex(0xa89466), (1 - v) * 0.6) : mixc(hex(0x3e5228), hex(0x6a7a3a), (1 - v) * 0.8 + dry * 0.3);
    const k = 0.55 + 0.45 * (1 - v * 0.6);
    return [c[0] * k, c[1] * k, c[2] * k, on ? 255 : 0];
  });
  a.px('fireweed', [256, 896, 128, 128], (x, y, u, v) => {
    const stalk = Math.floor(x / 16), sx = stalk * 16 + 8 + Math.sin(v * 3 + stalk) * 2;
    const h = 0.55 + 0.4 * hash(stalk, 0, 239);
    let t = Math.abs(x - sx) < 1 && 1 - v < h ? 1 : 0;
    let c = hex(0x6a4a3a);
    if (1 - v < h && 1 - v > h - 0.25 && Math.abs(x - sx) < 4 && hash(x, y, 240) > 0.5) { t = 1; c = mixc(hex(0xe8e0d8), hex(0xa85a7a), hash(x, y, 241)); }
    if (1 - v < 0.5 && Math.abs(x - sx) < 4 && Math.abs((y % 10) - 5) < 1 && Math.abs(x - sx) > 1 && hash(x >> 1, y, 242) > 0.3) { t = 1; c = hex(0x8a3a2a); }
    return [c[0], c[1], c[2], 255 * t];
  });
  return a;
}

// ---------------------------------------------------------------------------------------------- glass
let glassM: THREE.MeshStandardMaterial | null = null;
/** old cylinder glass: the grimy glass of the places kit plus a ripple normal map (sweeping waves) */
function glassMat(): void {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const hgt = (x: number, y: number) => 0.7 * Math.sin(y * 0.2 + 3 * fbm(x / 30, y / 30, 300)) + 0.5 * fbm(x / 8, y / 18, 301);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const o = (y * W + x) * 4;
    img.data[o] = 128 + dx * 200; img.data[o + 1] = 128 + dy * 200; img.data[o + 2] = 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const n = canvasTex(c, { srgb: false, repeat: true, nearest: false });
  n.repeat.set(2, 2);
  const t = placeTex('glass_grime');
  const m = new THREE.MeshStandardMaterial({
    name: 'cab_glass', map: t, normalMap: n, color: 0xd0dcd4, roughness: 0.4, metalness: 0.0, transparent: true, opacity: 1,
    depthWrite: false, side: THREE.DoubleSide, emissive: new THREE.Color(0xffa040), emissiveMap: t, emissiveIntensity: 0,
  });
  m.normalScale.set(0.9, 0.9);
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.a = max(diffuseColor.a, 0.2);`);
  };
  glassM = m;
  defineMat('cab_glass', m);
}
/** the wavy window glass material (emissive warms it when the room is lit) */
export function cabinGlass(): THREE.MeshStandardMaterial { ensureCabinTex(); return glassM!; }
