// The hand-drawn wall map in the cabin, drawn at runtime from the real world layout (contours from heightAt,
// the lake, roads, named spots) on aged paper, with pencilled notes. Pixel art: drawn 1:1 into a small canvas.
import * as THREE from 'three';
import { heightAt, ROADS, SPOTS, WORLD } from '../world/layout';

const TINY: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101',
  L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  W: '101101111111101', X: '101101010101101', Y: '101101010010010', '!': '010010010000010', '?': '110001010000010',
  "'": '010010000000000', '.': '000000000000010', ' ': '000000000000000', '1': '010110010010111', '7': '111001010010010',
  '0': '111101101101111', 'É': '111100110100111', '-': '000000111000000',
};

function tiny(g: CanvasRenderingContext2D, x: number, y: number, s: string, col: string): void {
  g.fillStyle = col;
  let cx = Math.round(x);
  for (const ch of s.toUpperCase()) {
    const p = TINY[ch] ?? TINY[' '];
    for (let i = 0; i < 15; i++) if (p[i] === '1') g.fillRect(cx + (i % 3), Math.round(y) + Math.floor(i / 3), 1, 1);
    cx += 4;
  }
}

let cached: THREE.Texture | null = null;

export function wallMapTexture(): THREE.Texture {
  if (cached) return cached;
  const W = 176, H = 240; // 0.66 x 0.9 m at ~266 px/m
  const x0 = -560, x1 = 600, z0 = -720, z1 = 560; // world window (north = -z at the top)
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const hs = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x0 + (x1 - x0) * (x + 0.5) / W, wz = z0 + (z1 - z0) * (y + 0.5) / H;
    hs[y * W + x] = heightAt(wx, wz);
  }
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = hs[y * W + x];
    const o = (y * W + x) * 4;
    // aged paper: warm, darker toward the edges, foxing
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    const edge = Math.max(0, 1 - e / 18);
    let r = 214, gg = 200, b = 166;
    const n = rnd();
    const k = 1 - 0.25 * edge - 0.06 * n;
    r *= k; gg *= k; b *= k;
    if (h < WORLD.waterY) { r = r * 0.55 + 60 * 0.45; gg = gg * 0.55 + 96 * 0.45; b = b * 0.55 + 130 * 0.45; }
    // contours every 8 m (index every 40 m)
    const level = Math.floor(h / 8);
    const right = x < W - 1 ? Math.floor(hs[y * W + x + 1] / 8) : level, down = y < H - 1 ? Math.floor(hs[(y + 1) * W + x] / 8) : level;
    if (h >= WORLD.waterY && (right !== level || down !== level)) {
      const idx = Math.max(level, right, down) % 5 === 0;
      const a = idx ? 0.65 : 0.38;
      r = r * (1 - a) + 120 * a; gg = gg * (1 - a) + 80 * a; b = b * (1 - a) + 44 * a;
    }
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const px = (wx: number, wz: number) => [((wx - x0) / (x1 - x0)) * W, ((wz - z0) / (z1 - z0)) * H] as [number, number];
  // roads: highway as a double red line, forest roads dashed black
  for (const road of ROADS) {
    const hw = road.id === 'highway';
    let i = 0;
    for (let k = 1; k < road.pts.length; k++) {
      const [ax, ay] = px(road.pts[k - 1].x, road.pts[k - 1].z), [bx, by] = px(road.pts[k].x, road.pts[k].z);
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
      for (let s = 0; s < steps; s++, i++) {
        const t = s / Math.max(1, steps);
        const X = Math.round(ax + (bx - ax) * t), Y = Math.round(ay + (by - ay) * t);
        if (hw) { g.fillStyle = '#8c2418'; g.fillRect(X, Y, 2, 2); }
        else if (road.id === 'cabin_road' ? i % 4 < 3 : i % 3 === 0) { g.fillStyle = road.id === 'cabin_road' ? '#2a2018' : '#5a4632'; g.fillRect(X, Y, 1, 1); }
      }
    }
  }
  // spots and pencil notes
  const mark = (s: { x: number; z: number }, label: string, col = '#2a2018', dx = 3, dy = -2) => {
    const [x, y] = px(s.x, s.z);
    g.fillStyle = col;
    g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); g.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
    tiny(g, x + dx, y + dy, label, col);
  };
  mark(SPOTS.cabin, 'CAMP', '#8c2418');
  mark(SPOTS.store, 'PRUNEAU', '#2a2018', -14, 4);
  mark(SPOTS.lake, 'LAC', '#22304a', -6, -2);
  mark(SPOTS.hollow, 'CEDRES', '#2a2018', -10, 4);
  mark(SPOTS.burn, 'BRULE', '#2a2018', -10, 4);
  mark(SPOTS.campsite, 'CAMPING', '#2a2018', -12, 4);
  // ominous pencil
  {
    const [x, y] = px(SPOTS.hollow.x, SPOTS.hollow.z);
    tiny(g, x - 18, y + 12, "DON'T", '#6a5a4a');
    g.strokeStyle = '#6a5a4a';
    g.beginPath(); g.arc(Math.round(x), Math.round(y), 16, 0, Math.PI * 2); g.stroke();
  }
  {
    const [x, y] = px(SPOTS.burn.x, SPOTS.burn.z);
    tiny(g, x - 14, y - 10, 'TRACKS?', '#6a5a4a');
  }
  tiny(g, 6, 6, 'CANTON 17', '#2a2018');
  tiny(g, 6, 12, 'N', '#2a2018');
  g.fillStyle = '#2a2018'; g.fillRect(7, 18, 1, 8); g.fillRect(6, 19, 3, 1);
  // a coffee ring stain
  g.strokeStyle = 'rgba(110,70,30,0.35)';
  g.beginPath(); g.arc(W - 40, H - 46, 14, 0.3, 5.6); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  cached = t;
  return t;
}
