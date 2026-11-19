// Textures for the 3D grimoire, all pixel art painted into Pix buffers: tooled oxblood leather for the covers
// (blind-tooled borders, corner fleurons, a gilt title cartouche on the front, an antler sigil on the back), the
// spine with raised bands and stitching, gilt page edges, marbled pastedowns, the mouth (cracked lips with coarse
// stitches, wet gums), the tongue (papillae, a groove, a wet sheen), amber goat eyes, and patinated brass.
import * as THREE from 'three';
import { Pix, ramp, hex, mix, bayer, shade, type RGB } from './pix';
import { Noise } from '../../core/noise';
import { hash2 } from '../../core/rng';
import { canvasTex } from '../../gfx/tex';

const NZ = new Noise(901);
const LEATHER = ramp('#1e0c0a', '#2c120e', '#3c1a12', '#4e2416', '#602e1a', '#723a20', '#864828', '#9a5832', '#b06c40');
const GILT = ramp('#3a2408', '#6a4612', '#9a6c1e', '#c8962e', '#e8c05a', '#fbe8a0');
const BRASS = ramp('#2a1e0c', '#4a3614', '#6e5420', '#957430', '#b89446', '#d6b664', '#f0dc98');
const VERDI = hex('#4a7a62');

function tex(p: Pix, o: { repeat?: boolean } = {}): THREE.Texture { return canvasTex(p.toCanvas(), { repeat: o.repeat }); }

/** base leather: pebbled grain on the ramp, creases, scuffs, darker toward the middle, worn pale at the edges */
function leather(w: number, h: number, seed: number, o: { wearEdge?: number; base?: number } = {}): Pix {
  const p = new Pix(w, h);
  const base = o.base ?? 0.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const grain = NZ.n2(x / 2.2 + seed, y / 2.2) * 0.07 + NZ.n2(x / 5 + seed * 3, y / 5) * 0.06;
    const crease = Math.abs(NZ.n2(x / 40 + seed, y / 9)) < 0.035 ? -0.12 : 0;
    const blotch = NZ.fbm2(x / 60 + seed, y / 60, 3) * 0.12;
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    const wear = o.wearEdge ? Math.max(0, 1 - e / o.wearEdge) * (0.18 + NZ.n2(x / 6, y / 6) * 0.1) : 0;
    const scuff = NZ.n2(x / 3 + 40, y / 14 + seed) > 0.72 ? 0.1 : 0;
    const v = base + grain + crease + blotch + wear + scuff;
    p.set(x, y, LEATHER[Math.max(0, Math.min(LEATHER.length - 1, Math.round(v * (LEATHER.length - 1) + bayer(x, y) * 0.8)))]);
  }
  return p;
}

/** blind tooling: a line pressed into the leather (dark groove, pale lower lip) */
function tool(p: Pix, x0: number, y0: number, x1: number, y1: number, gilt = false): void {
  p.line(x0, y0, x1, y1, gilt ? GILT[3] : shade(p.get(x0, y0), 0.45));
  if (gilt) p.line(x0, y0 - 1, x1, y1 - 1, GILT[5]);
  else p.line(x0 + 1, y0 + 1, x1 + 1, y1 + 1, mix(p.get(x0, y0 + 1), hex('#a0704a'), 0.35));
}
function toolRect(p: Pix, x: number, y: number, w: number, h: number, gilt = false): void {
  tool(p, x, y, x + w, y, gilt); tool(p, x, y + h, x + w, y + h, gilt); tool(p, x, y, x, y + h, gilt); tool(p, x + w, y, x + w, y + h, gilt);
}
/** a dotted roll (a fillet of little pressed dots) */
function dots(p: Pix, x0: number, y0: number, x1: number, y1: number, step = 4): void {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
  for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); p.mul(x, y, 0.45); p.mul(x + 1, y, 0.7); p.tint(x, y + 1, hex('#a0704a'), 0.25); }
}
/** a corner fleuron: a curling leaf and a teardrop, blind tooled */
function fleuron(p: Pix, cx: number, cy: number, sx: number, sy: number, gilt = false): void {
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 1.3;
    const r = 4 + i * 0.7;
    const x = Math.round(cx + sx * (Math.cos(a) * r * 0.9)), y = Math.round(cy + sy * (Math.sin(a) * r * 0.9));
    if (gilt) p.set(x, y, GILT[i % 3 ? 3 : 4]); else { p.mul(x, y, 0.45); p.tint(x + 1, y + 1, hex('#a0704a'), 0.3); }
  }
  for (let k = 0; k < 3; k++) {
    const ex = cx + sx * (10 + k * 9), ey = cy + sy * (10 + k * 9);
    p.ellipse(ex, ey, 2.4, 2.4, gilt ? GILT[4] : shade(p.get(ex, ey), 0.5));
  }
}

/** the front cover: tooled panels, corner fleurons, a gilt cartouche with the title, a tooled eye */
export function frontCoverTex(): THREE.Texture {
  const W = 448, H = 592;
  const p = leather(W, H, 3, { wearEdge: 16 });
  toolRect(p, 12, 12, W - 25, H - 25);
  toolRect(p, 18, 18, W - 37, H - 37);
  dots(p, 26, 26, W - 27, 26); dots(p, 26, H - 27, W - 27, H - 27); dots(p, 26, 26, 26, H - 27); dots(p, W - 27, 26, W - 27, H - 27);
  toolRect(p, 40, 40, W - 81, H - 81);
  for (const [cx, cy, sx, sy] of [[44, 44, 1, 1], [W - 45, 44, -1, 1], [44, H - 45, 1, -1], [W - 45, H - 45, -1, -1]] as const) fleuron(p, cx, cy, sx, sy);
  // title cartouche: an oval panel, gilt rules, the title in gilt with a pressed shadow
  const cx = W / 2, cy = 196;
  p.ellipse(cx, cy, 150, 76, (x, y, u, v) => {
    const d = u * u + v * v;
    const c = p.get(x, y);
    if (d > 0.9) return shade(c, 0.55);
    if (d > 0.84) return GILT[3 + ((x + y) % 2)];
    if (d > 0.78) return shade(c, 0.8);
    return shade(c, 0.92);
  });
  p.text('BOOK of', cx, cy - 14, { size: 32, color: GILT[4], align: 'center', under: hex('#140808'), over: GILT[5] });
  p.text('CRYPTIDS', cx, cy + 34, { size: 32, color: GILT[4], align: 'center', under: hex('#140808'), over: GILT[5] });
  // the tooled eye below, gilt pupil
  const ey = 380;
  for (let i = -70; i <= 70; i++) {
    const t = i / 70, yy = Math.round(Math.sqrt(1 - t * t) * 34);
    p.mul(cx + i, ey - yy, 0.45); p.mul(cx + i, ey + yy, 0.45); p.tint(cx + i, ey - yy + 1, hex('#a0704a'), 0.3);
  }
  p.ellipse(cx, ey, 26, 26, (x, y, u, v) => (u * u + v * v > 0.8 ? GILT[2] : Math.abs(u) < 0.22 ? hex('#140606') : GILT[3 + ((x ^ y) & 1)]));
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; tool(p, Math.round(cx + Math.cos(a) * 34), Math.round(ey + Math.sin(a) * 34 * 0.8), Math.round(cx + Math.cos(a) * 46), Math.round(ey + Math.sin(a) * 46 * 0.8)); }
  // a few claw scratches across the leather, and a scorch
  for (let k = 0; k < 3; k++) { const x0 = 300 + k * 9, y0 = 430 + k * 4; p.line(x0, y0, x0 + 40, y0 + 52, hex('#9a6a44')); p.line(x0 + 1, y0, x0 + 41, y0 + 52, hex('#1a0a08')); }
  return tex(p);
}

/** the back cover: plainer panels and an antlered skull tooled in the middle */
export function backCoverTex(): THREE.Texture {
  const W = 448, H = 592;
  const p = leather(W, H, 7, { wearEdge: 16 });
  toolRect(p, 12, 12, W - 25, H - 25); toolRect(p, 18, 18, W - 37, H - 37);
  for (const [cx, cy, sx, sy] of [[30, 30, 1, 1], [W - 31, 30, -1, 1], [30, H - 31, 1, -1], [W - 31, H - 31, -1, -1]] as const) fleuron(p, cx, cy, sx, sy);
  const cx = W / 2, cy = H / 2;
  for (const s of [-1, 1]) {
    const pts: [number, number][] = [[10, 0], [34, -20], [52, -52], [60, -90], [56, -120]];
    for (let i = 0; i + 1 < pts.length; i++) for (const o of [0, 1, 2]) tool(p, cx + s * (pts[i][0] + o), cy + pts[i][1], cx + s * (pts[i + 1][0] + o), cy + pts[i + 1][1]);
    for (const [bx, by, ex, ey] of [[34, -20, 14, -56], [52, -52, 88, -70], [60, -90, 40, -118]]) for (const o of [0, 1]) tool(p, cx + s * (bx + o), cy + by, cx + s * (ex + o), cy + ey);
  }
  p.ellipse(cx, cy + 20, 26, 30, (x, y) => shade(p.get(x, y), 0.6));
  for (const s of [-1, 1]) p.ellipse(cx + s * 10, cy + 14, 6, 7, hex('#0e0404'));
  return tex(p);
}

/** the spine: raised bands with gilt rules, panels between them, kettle stitches at head and tail */
export function spineTex(): THREE.Texture {
  const W = 96, H = 592;
  const p = leather(W, H, 11, { wearEdge: 6, base: 0.46 });
  const bands = [0.18, 0.36, 0.54, 0.72, 0.88].map((t) => Math.round(t * H));
  for (const b of bands) {
    for (let y = b - 7; y <= b + 7; y++) for (let x = 0; x < W; x++) { const k = 1 - Math.abs(y - b) / 7; p.tint(x, y, hex('#a06a40'), k * k * 0.35); }
    for (const dy of [-9, 9]) for (let x = 4; x < W - 4; x++) p.set(x, b + dy, GILT[(x & 1) + 3]);
  }
  // a gilt fleuron in each panel
  for (let i = 0; i + 1 < bands.length; i++) {
    const cy = (bands[i] + bands[i + 1]) / 2;
    p.ellipse(W / 2, cy, 9, 14, (x, y, u, v) => (Math.abs(u) + Math.abs(v) > 0.8 ? GILT[3] : (u * u + v * v < 0.12 ? GILT[5] : null)));
  }
  for (const y of [8, H - 9]) for (let x = 2; x < W - 2; x += 4) { p.set(x, y, hex('#d8c8a0')); p.set(x + 1, y + 1, hex('#d8c8a0')); }
  return tex(p);
}

/** leather for board edges, straps and the eye-brow */
export function edgeLeatherTex(): THREE.Texture { return tex(leather(64, 64, 19, { base: 0.38 }), { repeat: true }); }

/** eyelid skin: soft pale leather going pink at the rims, fine wrinkles */
export function lidTex(): THREE.Texture {
  const W = 64, H = 64, p = new Pix(W, H);
  const R = ramp('#3a1a14', '#5a2a1e', '#7a3e2a', '#965238', '#ae684a', '#c4805e', '#d89a78');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wr = Math.abs(Math.sin(y * 0.9 + NZ.n2(x / 6, y / 6) * 2)) < 0.15 ? -0.2 : 0;
    const v = 0.55 + NZ.n2(x / 5, y / 5) * 0.12 + wr - (y > H * 0.85 ? 0.25 : 0);
    p.set(x, y, R[Math.max(0, Math.min(6, Math.round(v * 6 + bayer(x, y) * 0.7)))]);
  }
  return tex(p, { repeat: true });
}

/** marbled pastedown on the inside of the boards */
export function pastedownTex(): THREE.Texture {
  const W = 256, H = 336, p = new Pix(W, H);
  const R = ramp('#2a1416', '#4a1e1c', '#6e2a22', '#8a4a2e', '#a8783c', '#4a5054', '#6a7470', '#c8b48a');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x + NZ.n2(x / 40, y / 40) * 20, wy = y + NZ.n2(x / 34, y / 34 + 5) * 20;
    const v = NZ.fbm2(wx / 30, wy / 30, 3), vein = Math.abs(Math.sin(v * 9 + wx / 16));
    let k = Math.floor((v * 0.5 + 0.5) * 5.5 + bayer(x, y) * 0.6);
    if (vein < 0.12) k = 7; else if (vein < 0.22) k = 5;
    p.set(x, y, R[Math.max(0, Math.min(7, k))]);
  }
  return tex(p);
}

/** page edges: hundreds of leaves, gilt gone dull, grime in the middle, the odd darker leaf */
export function pageEdgeTex(): THREE.Texture {
  const W = 64, H = 256, p = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const leaf = hash2(x, 0, 3) < 0.12 ? -0.25 : hash2(x, 1, 3) < 0.25 ? 0.15 : 0;
    const v = 0.55 + leaf + NZ.n2(x / 9, y / 30) * 0.12 - Math.abs(y / H - 0.5) * 0.15;
    const gilt = GILT[Math.max(0, Math.min(5, Math.round(v * 5 + bayer(x, y) * 0.6)))];
    p.set(x, y, mix(gilt, hex('#c8b490'), 0.45));
  }
  return tex(p, { repeat: true });
}

/** the lips: dark cracked flesh-leather, paler where it rolls over, coarse cross stitches */
export function lipTex(): THREE.Texture {
  const W = 64, H = 256, p = new Pix(W, H);
  const R = ramp('#240808', '#3e0e10', '#5c1a1a', '#7a2a26', '#963c32', '#ae5444', '#c87060', '#dc9480');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const roll = Math.sin((x / W) * Math.PI);
    const crack = Math.abs(NZ.n2(x / 3, y / 1.6)) < 0.06 ? -0.25 : 0;
    const v = 0.25 + roll * 0.5 + NZ.n2(x / 5, y / 7) * 0.12 + crack;
    p.set(x, y, R[Math.max(0, Math.min(7, Math.round(v * 7 + bayer(x, y) * 0.8)))]);
  }
  // cross stitches with pale waxed thread every so often
  for (let y = 10; y < H; y += 36) {
    for (let i = 0; i < 14; i++) { p.set(18 + i * 2, y + i, hex('#d8c8a0')); p.set(18 + i * 2 + 1, y + i, hex('#a89870')); p.set(18 + i * 2, y + 14 - i, hex('#d8c8a0')); }
  }
  return tex(p, { repeat: true });
}

/** gums: deep wet red, darker pits where the teeth sit */
export function gumTex(): THREE.Texture {
  const W = 32, H = 256, p = new Pix(W, H);
  const R = ramp('#200406', '#3c0a0e', '#5a1216', '#7a1e20', '#9a2e2c', '#b84a42');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 0.45 + NZ.n2(x / 3, y / 3) * 0.15 + Math.sin(x / W * Math.PI) * 0.2 + (hash2(x, y, 2) < 0.03 ? 0.3 : 0);
    p.set(x, y, R[Math.max(0, Math.min(5, Math.round(v * 5 + bayer(x, y) * 0.7)))]);
  }
  return tex(p, { repeat: true });
}

/** the tongue: pink-red with papillae dots, a dark central groove, pale rims */
export function tongueTex(): THREE.Texture {
  const W = 64, H = 128, p = new Pix(W, H);
  const R = ramp('#4a0e16', '#702030', '#963444', '#b84e5a', '#d06a70', '#e08c8c', '#f0b0aa', '#fcd4cc');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W;                 // around the tube: 0..1 (top centre at 0.25)
    const top = Math.cos((u - 0.25) * Math.PI * 2);
    const groove = Math.abs(u - 0.25) < 0.02 ? -0.35 : 0;
    const pap = hash2(x >> 1, y >> 1, 4) < 0.18 ? 0.18 : 0;
    const v = 0.42 + top * 0.25 + groove + pap + NZ.n2(x / 4, y / 6) * 0.08;
    p.set(x, y, R[Math.max(0, Math.min(7, Math.round(v * 7 + bayer(x, y) * 0.7)))]);
  }
  return tex(p, { repeat: true });
}

/** an amber goat eye: a horizontal slit pupil, a dark limbal ring, a hard highlight */
export function eyeTex(): THREE.Texture {
  const S = 64, p = new Pix(S, S);
  const IR = ramp('#3a1a04', '#6a3408', '#9a5a10', '#c8841c', '#e8b03a', '#f8d870');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // the sphere's uv: u around, v up; the iris is centred on u = 0.25 (+Z), v = 0.5
    const du = (x / S - 0.25) * 2 * Math.PI, dv = (y / S - 0.5) * Math.PI;
    const r = Math.hypot(du, dv);
    let c: RGB;
    if (r > 1.05) c = mix(hex('#d8ccb0'), hex('#8a2a1c'), hash2(x, y, 3) < 0.08 ? 0.6 : 0.1);
    else if (r > 0.95) c = hex('#140806');
    else {
      const ray = NZ.n2(Math.atan2(dv, du) * 6, r * 3) * 0.2;
      c = IR[Math.max(0, Math.min(5, Math.round((0.35 + r * 0.5 + ray) * 5 + bayer(x, y) * 0.6)))];
      if (Math.abs(dv) < 0.12 + 0.05 * (1 - Math.abs(du)) && Math.abs(du) < 0.62) c = hex('#0a0404');
    }
    p.set(x, y, c);
  }
  p.set(Math.round(S * 0.2), Math.round(S * 0.42), hex('#fffbe8')); p.set(Math.round(S * 0.2) + 1, Math.round(S * 0.42), hex('#fffbe8'));
  p.set(Math.round(S * 0.2), Math.round(S * 0.42) + 1, hex('#f4e8c0'));
  return tex(p);
}

/** brass: engraved border lines, worn bright on the high spots, verdigris in the corners */
export function brassTex(): THREE.Texture {
  const S = 64, p = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const e = Math.min(x, y, S - 1 - x, S - 1 - y);
    let v = 0.5 + NZ.n2(x / 6, y / 6) * 0.15 + (e < 4 ? 0.2 : 0) - (e === 6 || e === 9 ? 0.35 : 0);
    v += (x + y) % 9 === 0 && e > 10 ? -0.2 : 0;
    let c = BRASS[Math.max(0, Math.min(6, Math.round(v * 6 + bayer(x, y) * 0.7)))];
    if (NZ.n2(x / 5 + 7, y / 5) > 0.55 && e > 2) c = mix(c, VERDI, 0.6);
    p.set(x, y, c);
  }
  return tex(p, { repeat: true });
}
