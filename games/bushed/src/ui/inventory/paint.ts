// Canvas painters for the rucksack: duck canvas, leather, the stitched grid board, the lid lining, paper tags, the
// spring-scale dial and the glove cursor. High-resolution pixel art: every texel placed by a rule, no smooth
// gradients, no baked directional light (only cavity and wear).
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

/**
 * Leather strap texture: u across the strap (w px), v along it (h px). Grain, darker burnished edges, a row of
 * saddle stitches near each edge, scuffs.
 */
export function paintLeather(w: number, h: number, base: C3, seed: number, stitch = true): HTMLCanvasElement {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const r = new Rng(seed);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, w - 1 - x);
    let v = (tnoise(x * 0.35, y * 0.35, Math.max(1, Math.round(h * 0.35)), seed) - 0.5) * 22;
    v += (hash2(x, y, seed) - 0.5) * 10;
    if (e === 0) v -= 38; else if (e === 1) v -= 16; else if (e === 2) v += 6;
    const k = (y * w + x) * 4;
    img.data[k] = clamp255(base[0] + v); img.data[k + 1] = clamp255(base[1] + v * 0.8); img.data[k + 2] = clamp255(base[2] + v * 0.6); img.data[k + 3] = 255;
  }
  // scuffs: short pale scratches along the strap
  for (let i = 0; i < h * 0.08; i++) {
    const x = r.int(3, w - 4), y = r.int(0, h - 1), len = r.int(2, 6);
    for (let j = 0; j < len; j++) { const k = (((y + j) % h) * w + x) * 4; img.data[k] += 22; img.data[k + 1] += 18; img.data[k + 2] += 12; }
  }
  g.putImageData(img, 0, 0);
  if (stitch && w >= 12) {
    for (const sx of [3, w - 4]) for (let y = 1; y < h; y += 5) {
      g.fillStyle = '#2a1a0e'; g.fillRect(sx, y - 1, 1, 1);
      g.fillStyle = '#d9c497'; g.fillRect(sx, y, 1, 3);
      g.fillStyle = '#9c8458'; g.fillRect(sx, y + 2, 1, 1);
    }
  }
  return c;
}

/** the label font: Alagard, crisp at 16 / 32 px */
export const FONT = 'Alagard, monospace';

/**
 * The stiff panel inside the pack with the grid stitched on: pale duck, a binding tape round the board, running
 * stitches between the cells, cross-stitched corners, stencilled column letters and row numbers, the maker's stamp,
 * pencil tallies and the shadows of things that have lived in the cells.
 * The grid area is [x0, x0 + n * cs] square in texture pixels.
 */
export function paintBoard(size: number, cols: number, rows: number, x0: number, y0: number, cs: number, seed: number): HTMLCanvasElement {
  const c = paintDuck(size, [152, 136, 100], seed, { grime: 0.9, slub: 0.8, weave: 0.8 });
  const g = c.getContext('2d')!;
  const r = new Rng(seed + 3);
  const W = cols * cs, H = rows * cs;
  // pressure marks: faint darker squares where things sat
  for (let i = 0; i < 9; i++) {
    const cx = r.int(0, cols - 1), cy = r.int(0, rows - 1), cw = r.int(1, 2), ch = r.int(1, 2);
    g.fillStyle = `rgba(60,44,24,${r.range(0.05, 0.1).toFixed(3)})`;
    g.fillRect(x0 + cx * cs + 4, y0 + cy * cs + 4, Math.min(cw, cols - cx) * cs - 8, Math.min(ch, rows - cy) * cs - 8);
  }
  // a coffee ring
  {
    const cx = x0 + W * r.range(0.6, 0.85), cy = y0 + H * r.range(0.6, 0.85), rr = cs * 0.45;
    for (let a = 0; a < 360; a += 1.2) {
      const t = (a * Math.PI) / 180, w = 1 + (Math.sin(t * 3) > 0.3 ? 1 : 0);
      g.fillStyle = `rgba(92,58,26,${(0.22 + 0.12 * Math.sin(t * 5)).toFixed(3)})`;
      g.fillRect(Math.round(cx + Math.cos(t) * rr), Math.round(cy + Math.sin(t) * rr), w, w);
    }
  }
  // binding tape around the board (a darker cotton tape, its own weave)
  const tape = 7;
  g.fillStyle = '#5a4b33';
  g.fillRect(x0 - tape - 2, y0 - tape - 2, W + tape * 2 + 4, tape);
  g.fillRect(x0 - tape - 2, y0 + H + 2, W + tape * 2 + 4, tape);
  g.fillRect(x0 - tape - 2, y0 - 2, tape, H + 4);
  g.fillRect(x0 + W + 2, y0 - 2, tape, H + 4);
  const tapeImg = g.getImageData(x0 - tape - 2, y0 - tape - 2, W + tape * 2 + 4, H + tape * 2 + 4);
  for (let i = 0; i < tapeImg.data.length; i += 4) {
    const p = i / 4, x = p % tapeImg.width, y = (p / tapeImg.width) | 0;
    const inTape = x < tape || y < tape || x >= tapeImg.width - tape || y >= tapeImg.height - tape;
    if (!inTape) continue;
    const v = ((x + y) & 1 ? 6 : -6) + (hash2(x, y, seed) - 0.5) * 10;
    tapeImg.data[i] = clamp255(tapeImg.data[i] + v); tapeImg.data[i + 1] = clamp255(tapeImg.data[i + 1] + v); tapeImg.data[i + 2] = clamp255(tapeImg.data[i + 2] + v * 0.7);
  }
  g.putImageData(tapeImg, x0 - tape - 2, y0 - tape - 2);
  // the tape is sewn down with a long running stitch
  stitchLine(g, x0 - tape + 1, y0 - tape / 2 - 2, x0 + W + tape + 1, y0 - tape / 2 - 2, r, '#d8c49a', 5, 3);
  stitchLine(g, x0 - tape + 1, y0 + H + tape / 2 + 2, x0 + W + tape + 1, y0 + H + tape / 2 + 2, r, '#d8c49a', 5, 3);
  stitchLine(g, x0 - tape / 2 - 2, y0 - tape + 1, x0 - tape / 2 - 2, y0 + H + tape + 1, r, '#d8c49a', 5, 3);
  stitchLine(g, x0 + W + tape / 2 + 2, y0 - tape + 1, x0 + W + tape / 2 + 2, y0 + H + tape + 1, r, '#d8c49a', 5, 3);
  // cell seams: a dark thread running stitch, slightly hand-wobbled, with a lit top pixel
  for (let i = 1; i < cols; i++) stitchLine(g, x0 + i * cs - 1, y0 + 2, x0 + i * cs - 1, y0 + H - 2, r, '#2e2416', 5, 2, true);
  for (let j = 1; j < rows; j++) stitchLine(g, x0 + 2, y0 + j * cs - 1, x0 + W - 2, y0 + j * cs - 1, r, '#2e2416', 5, 2, true);
  // cross-stitches where the seams meet
  for (let j = 1; j < rows; j++) for (let i = 1; i < cols; i++) {
    const x = x0 + i * cs, y = y0 + j * cs;
    g.fillStyle = '#2b2014';
    for (let k = -2; k <= 2; k++) { g.fillRect(x + k, y + k, 1, 1); g.fillRect(x + k, y - k, 1, 1); }
    g.fillStyle = '#7d6a48'; g.fillRect(x - 2, y - 3, 1, 1); g.fillRect(x + 2, y - 3, 1, 1);
  }
  // stencilled letters and numbers (faded black paint, stencil bridges)
  g.save();
  g.font = `16px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < cols; i++) stencil(g, 'ABCDEF'[i] ?? String(i + 1), x0 + (i + 0.5) * cs, y0 - tape - 12, r);
  for (let j = 0; j < rows; j++) stencil(g, String(j + 1), x0 - tape - 12, y0 + (j + 0.5) * cs, r);
  g.restore();
  // maker's stamp, bottom margin
  g.save();
  g.font = `16px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalAlpha = 0.5;
  g.fillStyle = '#5b2a1c';
  g.fillText('KETTLE LAKE OUTFITTERS', x0 + W / 2, y0 + H + tape + 14);
  g.globalAlpha = 0.38;
  g.strokeStyle = '#5b2a1c';
  g.strokeRect(x0 + W / 2 - 100 + 0.5, y0 + H + tape + 4 + 0.5, 200, 20);
  g.restore();
  // pencil tallies in the right margin (somebody counting jerky)
  g.fillStyle = 'rgba(52,50,58,0.55)';
  const tx = x0 + W + tape + 8, ty = y0 + H * 0.35;
  for (let k = 0; k < 4; k++) g.fillRect(tx + k * 3, ty, 1, 9);
  for (let k = 0; k < 13; k++) g.fillRect(tx - 1 + k, ty + 7 - Math.round(k * 0.5), 1, 1);
  for (let k = 0; k < 2; k++) g.fillRect(tx + 16 + k * 3, ty, 1, 9);
  return c;
}

function stencil(g: CanvasRenderingContext2D, t: string, x: number, y: number, r: Rng): void {
  g.fillStyle = `rgba(30,24,18,${r.range(0.55, 0.75).toFixed(2)})`;
  g.fillText(t, Math.round(x), Math.round(y));
  // stencil bridge: a thin unpainted bar through the glyph
  g.fillStyle = 'rgba(170,152,112,0.6)';
  g.fillRect(Math.round(x) - 6, Math.round(y), 12, 1);
}

/** a dashed hand-sewn line between two points */
function stitchLine(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, r: Rng, color: string, dash: number, gap: number, lit = false): void {
  const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
  const vert = Math.abs(uy) > Math.abs(ux);
  let wob = 0;
  for (let t = 0; t < len; t += dash + gap) {
    if (r.chance(0.18)) wob = Math.max(-1, Math.min(1, wob + (r.chance(0.5) ? 1 : -1)));
    const d = Math.min(dash, len - t);
    const x = Math.round(ax + ux * t + (vert ? wob : 0)), y = Math.round(ay + uy * t + (vert ? 0 : wob));
    g.fillStyle = color;
    if (vert) g.fillRect(x, y, 2, d); else g.fillRect(x, y, d, 2);
    if (lit) {
      g.fillStyle = 'rgba(214,196,150,0.55)';
      if (vert) g.fillRect(x, y, 1, 1); else g.fillRect(x, y, 1, 1);
      g.fillStyle = 'rgba(20,14,8,0.35)';
      if (vert) g.fillRect(x + 2, y + 1, 1, d - 1); else g.fillRect(x + 1, y + 2, d - 1, 1);
    }
  }
}

/** the underside of the lid: darker lining, a stencilled monogram and a sewn-on map pocket */
export function paintLining(size: number, seed: number): HTMLCanvasElement {
  const c = paintDuck(size, [88, 84, 58], seed, { grime: 1.2 });
  const g = c.getContext('2d')!;
  const r = new Rng(seed);
  // the pocket: a lighter patch with a hem, stitched round three sides
  const px = Math.round(size * 0.14), py = Math.round(size * 0.3), pw = Math.round(size * 0.5), ph = Math.round(size * 0.46);
  const patch = paintDuck(256, [124, 116, 80], seed + 11, { grime: 0.7 });
  g.drawImage(patch, 0, 0, pw, ph, px, py, pw, ph);
  g.fillStyle = 'rgba(30,24,14,0.45)'; g.fillRect(px, py + ph, pw, 2); g.fillRect(px + pw, py, 2, ph + 2);
  g.fillStyle = '#6c6446'; g.fillRect(px, py, pw, 5);
  g.fillStyle = 'rgba(255,240,200,0.18)'; g.fillRect(px, py, pw, 1);
  stitchLine(g, px + 3, py + 8, px + 3, py + ph - 3, r, '#cbb98c', 4, 3);
  stitchLine(g, px + pw - 4, py + 8, px + pw - 4, py + ph - 3, r, '#cbb98c', 4, 3);
  stitchLine(g, px + 3, py + ph - 4, px + pw - 3, py + ph - 4, r, '#cbb98c', 4, 3);
  stitchLine(g, px + 2, py + 2, px + pw - 2, py + 2, r, '#cbb98c', 4, 3);
  // monogram, stencilled big
  g.save();
  g.font = `32px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(28,22,14,0.55)';
  g.fillText('R.B.', Math.round(size * 0.78), Math.round(size * 0.5));
  g.font = `16px ${FONT}`;
  g.fillText('1961', Math.round(size * 0.78), Math.round(size * 0.5) + 26);
  g.restore();
  return c;
}

/** a manila tag with a reinforced hole; text is drawn in Alagard */
export function paintTag(text: string, w = 48, h = 24, ink = '#2b1c10'): HTMLCanvasElement {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d')!;
  // clipped corners on the hole end
  g.fillStyle = '#3a2a18';
  g.beginPath(); g.moveTo(5, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(5, h); g.lineTo(0, h - 5); g.lineTo(0, 5); g.closePath(); g.fill();
  g.fillStyle = '#d6bf8a';
  g.beginPath(); g.moveTo(6, 1); g.lineTo(w - 1, 1); g.lineTo(w - 1, h - 1); g.lineTo(6, h - 1); g.lineTo(1, h - 6); g.lineTo(1, 6); g.closePath(); g.fill();
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0 || img.data[i] < 100) continue;
    const p = i / 4, v = (hash2(p % w, (p / w) | 0, 77) - 0.5) * 14;
    img.data[i] = clamp255(img.data[i] + v); img.data[i + 1] = clamp255(img.data[i + 1] + v); img.data[i + 2] = clamp255(img.data[i + 2] + v * 0.8);
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(255,248,220,0.35)'; g.fillRect(6, 1, w - 7, 1);
  g.fillStyle = 'rgba(80,58,30,0.35)'; g.fillRect(6, h - 2, w - 7, 1);
  // reinforcement ring and hole
  g.fillStyle = '#b39058'; g.fillRect(3, h / 2 - 4, 8, 8);
  g.fillStyle = '#8d6c3c'; g.fillRect(4, h / 2 - 3, 6, 6);
  g.fillStyle = '#1a120a'; g.fillRect(5, h / 2 - 2, 4, 4);
  g.fillStyle = ink;
  g.font = `16px ${FONT}`;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'center';
  g.fillText(text, Math.round((w + 12) / 2), Math.round(h / 2 + 6));
  return c;
}

/** the spring-scale dial: cream face, kg ticks 0-25, a red overload arc */
export function paintDial(size: number, max: number, redFrom: number, startA: number, sweep: number): HTMLCanvasElement {
  const c = mkCanvas(size);
  const g = c.getContext('2d')!;
  const R = size / 2;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
    const k = (y * size + x) * 4;
    let col: C3;
    if (d > 0.98) col = [40, 30, 16];
    else if (d > 0.86) col = [176 + (hash2(x, y, 5) - 0.5) * 30, 132, 58];   // brass bezel
    else col = [222 - d * 26, 210 - d * 30, 176 - d * 36];                     // aged enamel face
    const v = (hash2(x, y, 9) - 0.5) * 8;
    img.data[k] = clamp255(col[0] + v); img.data[k + 1] = clamp255(col[1] + v); img.data[k + 2] = clamp255(col[2] + v); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const ang = (kg: number) => startA + (kg / max) * sweep;
  // red overload arc
  g.strokeStyle = '#a3261a'; g.lineWidth = size * 0.05;
  g.beginPath(); g.arc(R, R, R * 0.74, ang(redFrom), ang(max)); g.stroke();
  // ticks
  for (let kg = 0; kg <= max; kg++) {
    const a = ang(kg), big = kg % 5 === 0;
    const r0 = R * (big ? 0.62 : 0.7), r1 = R * 0.82;
    g.strokeStyle = '#231a10'; g.lineWidth = big ? 2 : 1;
    g.beginPath(); g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); g.lineTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1); g.stroke();
  }
  g.fillStyle = '#231a10';
  g.font = `16px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const kg of [0, 10, 20]) { const a = ang(kg); g.fillText(String(kg), Math.round(R + Math.cos(a) * R * 0.44), Math.round(R + Math.sin(a) * R * 0.44)); }
  g.fillText('kg', Math.round(R), Math.round(R + R * 0.42));
  // centre boss
  g.fillStyle = '#3a2c18'; g.beginPath(); g.arc(R, R, size * 0.05, 0, 7); g.fill();
  return c;
}

/** soft rounded square glow (white, alpha falls off to the edge) for cell highlights */
export function paintGlow(size: number, inset = 0.1): HTMLCanvasElement {
  const c = mkCanvas(size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = Math.abs((x + 0.5) / size - 0.5) * 2, v = Math.abs((y + 0.5) / size - 0.5) * 2;
    const d = Math.pow(Math.pow(u, 6) + Math.pow(v, 6), 1 / 6);
    const a = d < 1 - inset ? 0.55 + 0.45 * Math.pow(d / (1 - inset), 4) : Math.max(0, 1 - (d - (1 - inset)) / inset) ;
    const k = (y * size + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** a soft contact-shadow blob (black, alpha) */
export function paintShadow(size: number): HTMLCanvasElement {
  const c = mkCanvas(size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = Math.abs((x + 0.5) / size - 0.5) * 2, v = Math.abs((y + 0.5) / size - 0.5) * 2;
    const d = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 1 / 4);
    const a = Math.max(0, 1 - d);
    img.data[(y * size + x) * 4 + 3] = Math.round(Math.pow(a, 0.8) * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** dashed chalk outline of a footprint (an item that is in your hand) */
export function paintChalk(w: number, h: number): HTMLCanvasElement {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(235,228,205,0.85)';
  for (let x = 4; x < w - 4; x += 6) { g.fillRect(x, 3, 3, 2); g.fillRect(x, h - 5, 3, 2); }
  for (let y = 4; y < h - 4; y += 6) { g.fillRect(3, y, 2, 3); g.fillRect(w - 5, y, 2, 3); }
  return c;
}

// ---------------------------------------------------------------------------------------------- glove cursor
const GLOVES: Record<'point' | 'open' | 'grab', string[]> = {
  point: [
    '....kk..........',
    '...khsk.........',
    '...khwk.........',
    '...khwk.........',
    '...khwkkk.......',
    '...khwkhwkk.....',
    '...khwkhwkhkk...',
    'kk.khwwhwwhwhk..',
    'khkkhwwwwwwwwsk.',
    'khwkwwwwwwwwwsk.',
    '.khwwwwwwwwwwsk.',
    '..kwwwwwwwwwssk.',
    '..kswwwwwwwwssk.',
    '...kswwwwwwssk..',
    '....kssssssk....',
    '.....kkkkkk.....',
  ],
  open: [
    '.....kk.kk......',
    '..kk.khkkhk.....',
    '.khk.khwkhwkkk..',
    '.khwkkhwkhwkhwk.',
    '.khwkkhwkhwkhwk.',
    '.khwkkhwkhwkhwk.',
    '.khwwkhwwhwwhwk.',
    '.khwwwwwwwwwwsk.',
    'kkkhwwwwwwwwwsk.',
    'khwkwwwwwwwwwsk.',
    '.khwwwwwwwwwssk.',
    '..kwwwwwwwwwssk.',
    '..kswwwwwwwssk..',
    '...ksswwwwssk...',
    '....kssssssk....',
    '.....kkkkkk.....',
  ],
  grab: [
    '................',
    '................',
    '................',
    '....kkkkkkkk....',
    '...khwkhwkhwk...',
    '..kkhwkhwkhwkk..',
    '.khkhwkhwkhwkhk.',
    '.khwwwwwwwwwwsk.',
    'khwkkkkkkkkkwsk.',
    'khwwwwwwwwwwwsk.',
    '.kwwwwwwwwwwssk.',
    '.kswwwwwwwwwssk.',
    '..ksswwwwwwssk..',
    '...kssssssssk...',
    '....kkkkkkkk....',
    '................',
  ],
};

/** a pixel-art work-glove cursor, 16x16 */
export function paintGlove(kind: 'point' | 'open' | 'grab'): HTMLCanvasElement {
  const c = mkCanvas(16);
  const g = c.getContext('2d')!;
  const pal: Record<string, string> = { k: '#20140c', h: '#ecd29a', w: '#c49a5c', s: '#86643a' };
  GLOVES[kind].forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}

/** a folded topographic map of the lake country: contours, a lake, a creek, a pencilled route, fold creases */
export function paintMap(w: number, h: number, seed: number): HTMLCanvasElement {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const field = (x: number, y: number) => vnoise(x / w * 3, y / h * 3, seed) * 0.7 + vnoise(x / w * 7, y / h * 7, seed + 1) * 0.3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4, f = field(x, y);
    let col: C3 = [176, 160, 122];
    if (f < 0.26) col = [96, 118, 120];                                   // lake
    else if (Math.abs((f * 9) % 1 - 0.5) < 0.06) col = [168, 128, 86];   // contour
    else if (f > 0.62) col = [170, 166, 128];                            // high ground tint
    const v = (hash2(x, y, seed) - 0.5) * 10;
    img.data[k] = clamp255(col[0] + v); img.data[k + 1] = clamp255(col[1] + v); img.data[k + 2] = clamp255(col[2] + v); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // the route, in red pencil
  const r = new Rng(seed);
  g.fillStyle = '#a3261a';
  let x = w * 0.1, y = h * 0.8;
  for (let i = 0; i < 60; i++) { x += r.range(0.2, 1.2) * w / 60; y -= r.range(-0.6, 1.2) * h / 70; if (i % 3 !== 2) g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  // fold creases
  g.fillStyle = 'rgba(70,56,36,0.35)';
  g.fillRect(Math.round(w / 2), 0, 1, h); g.fillRect(0, Math.round(h / 2), w, 1);
  g.fillStyle = 'rgba(255,250,230,0.35)';
  g.fillRect(Math.round(w / 2) + 1, 0, 1, h); g.fillRect(0, Math.round(h / 2) + 1, w, 1);
  g.strokeStyle = 'rgba(60,44,24,0.6)'; g.strokeRect(0.5, 0.5, w - 1, h - 1);
  return c;
}
