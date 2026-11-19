// The pages of the Book of Cryptids, painted texel by texel (Pix) in crisp Alagard:
//   endpaper (marbled, Ray's bookplate) | title page | jobs | contents | for each cryptid a field-guide spread:
//   a PLATE (the portrait in a framed vignette, name, latin name, habitat, abroad, size, danger, favourite food)
//   facing its NOTES (Ray's taped-in scrap, the Book's own remark, the rules, known ones inked, unknown ones
//   smudged "???") | the Book's guide and Ray's tips | the contracts you took, pasted in | the back endpaper.
// Every element the Book writes is a named region, so the book can animate ink appearing in exactly those places.
import { Pix, hex, mix, bayer, wrap, textWidth, type RGB, ramp, shade } from './pix';
import { Noise } from '../../core/noise';
import { hash2 } from '../../core/rng';
import type { Entry } from './bestiary';
import { ROMAN } from './bestiary';
import { icon } from './icons';
import { portrait, plateScene, groundShadow, hasPortraitSource, PW, PH, type PortraitArt } from './portrait';
import type { Contract } from '../../game/contracts';
import { contractPaper } from '../../game/contracts';
import type { Block } from '../paper';
import { NOTES } from '../../game/story';

export const PAGE_W = 384, PAGE_H = 528;

export const INK = hex('#2a1c16');
export const BOOK_INK = hex('#5e1610');
export const RAY_INK = hex('#283250');
export const PENCIL = hex('#5e5a52');
export const FADED = hex('#7c6a50');
export const RED = hex('#8e2a1c');
const PAPER = ramp('#6e5638', '#8e7248', '#a88a58', '#bea068', '#cdb07a', '#d8be8a', '#e2cb9a', '#ead6aa');
const SCRAP = ramp('#8c8a7c', '#a8a696', '#bebcac', '#d0cebe', '#dedccc', '#eae8d8');

export type PageKind =
  | { k: 'endpaper' } | { k: 'title' } | { k: 'jobs' } | { k: 'contents' } | { k: 'guide' } | { k: 'blank' } | { k: 'endback' }
  | { k: 'plate'; id: string } | { k: 'notes'; id: string }
  | { k: 'blocks'; blocks: Block[]; seed: number }
  | { k: 'contract'; c: Contract };

export interface BookView {
  entries: Entry[];
  known: Map<string, Set<string>>;
  seen: Set<string>;
  /** id -> game day it was tasted */
  tasted: Map<string, number>;
  contracts: Contract[];
  /** first page index of a cryptid's spread (for the contents) */
  pageOf(id: string): number;
}

export interface Region { key: string; x: number; y: number; w: number; h: number; kind: 'ink' | 'plate' }
export interface Painted { pix: Pix; regions: Region[]; pending: boolean }

/** the page list, in order; spreads are (even, odd) pairs */
export function layout(v: BookView): PageKind[] {
  const pages: PageKind[] = [{ k: 'endpaper' }, { k: 'title' }, { k: 'jobs' }, { k: 'contents' }];
  for (const e of v.entries) pages.push({ k: 'plate', id: e.id }, { k: 'notes', id: e.id });
  pages.push({ k: 'guide' });
  NOTES.forEach((b, i) => pages.push({ k: 'blocks', blocks: b, seed: 900 + i }));
  pages.push({ k: 'blocks', blocks: RAY_TIPS, seed: 950 });
  for (const c of v.contracts) if (c.state !== 'posted') pages.push({ k: 'contract', c });
  if (pages.length % 2) pages.push({ k: 'blank' });
  pages.push({ k: 'blank' }, { k: 'endback' });
  return pages;
}

const RAY_TIPS: Block[] = [
  { t: 'h', text: 'Ray\'s rules' },
  { t: 'p', text: 'Wood box full before dark. Always.' },
  { t: 'p', text: 'Jerky in the pocket after sundown.' },
  { t: 'p', text: 'Never put the light on the big one.' },
  { t: 'p', text: 'If you hear knocking, knock back. Once.' },
  { t: 'p', text: 'Leave something on the stump now and then. Manners.' },
  { t: 'p', text: 'Fog by the hollow: stand still and wait for her.' },
  { t: 'gap', h: 8 },
  { t: 'sig', text: '— R.T.' },
];

// ------------------------------------------------------------------------------------------------ paper
const NZ = new Noise(311);
const baseCache = new Map<string, Pix>();
/** aged paper: mottled fibres on a ramp, foxing, a tide-line stain or two, a gutter shadow, worn edges */
export function paper(seed: number, side: 'L' | 'R', o: { ramp?: RGB[]; w?: number; h?: number; gutter?: boolean } = {}): Pix {
  const W = o.w ?? PAGE_W, H = o.h ?? PAGE_H;
  const key = `${seed}|${side}|${W}x${H}|${o.ramp ? 's' : 'p'}|${o.gutter !== false}`;
  const c = baseCache.get(key);
  if (c) return c.clone();
  const R = o.ramp ?? PAPER;
  const p = new Pix(W, H);
  const ox = (seed % 97) * 13.1, oy = (seed % 89) * 7.7;
  const stains: [number, number, number][] = [];
  for (let k = 0; k < Math.floor(hash2(seed, 1, 2) * 2.4); k++) stains.push([hash2(seed, k, 3) * W, hash2(seed, k, 4) * H, 16 + hash2(seed, k, 5) * 34]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0.7 + NZ.fbm2((x + ox) / 70, (y + oy) / 70, 3) * 0.1 + NZ.n2((x + ox) / 9, (y + oy) / 3) * 0.035 + (hash2(x, y, seed) - 0.5) * 0.06;
    // fibres: short horizontal streaks
    if (hash2(x >> 3, y, seed + 9) > 0.985) v += 0.06;
    if (hash2(x >> 2, y, seed + 7) < 0.012) v -= 0.07;
    const gutterX = side === 'L' ? W - 1 - x : x, outerX = side === 'L' ? x : W - 1 - x;
    if (o.gutter !== false) v -= Math.pow(Math.max(0, 1 - gutterX / 30), 2) * 0.32;
    v -= Math.pow(Math.max(0, 1 - outerX / 12), 2) * 0.22 + Math.pow(Math.max(0, 1 - Math.min(y, H - 1 - y) / 9), 2) * 0.2;
    for (const [sx, sy, sr] of stains) {
      const d = Math.hypot(x - sx, y - sy) / sr;
      if (d < 1) v -= 0.03; if (Math.abs(d - 1) < 0.05) v -= 0.08;
    }
    // foxing: rusty clusters
    const fx = NZ.n2((x + ox) / 14 + 40, (y + oy) / 14);
    let col = R[Math.max(0, Math.min(R.length - 1, Math.round(v * (R.length - 1) + bayer(x, y) * 0.9)))];
    if (fx > 0.62 && hash2(x, y, seed + 3) > 0.55) col = mix(col, hex('#8a5a30'), 0.45);
    p.set(x, y, col);
  }
  baseCache.set(key, p.clone());
  return p;
}

// ------------------------------------------------------------------------------------------------ drawing kit
interface Ctx { p: Pix; regions: Region[]; seed: number }
const LH = 18;

/** wrapped paragraph; returns the y of the next line. firstIndent shortens the first line (inline labels) */
function para(c: Ctx, text: string, x: number, y: number, w: number, o: { color?: RGB; fade?: number; wet?: boolean; indent?: number; key?: string; align?: 'left' | 'center' | 'right'; struck?: boolean } = {}): number {
  const ind = o.indent ?? 0;
  const lines = wrapIndented(text, w, ind);
  const y0 = y;
  lines.forEach((ln, i) => {
    const lx = x + (i === 0 ? ind : 0);
    // a hand that bobs: whole lines sit a pixel up or down now and then
    const bob = o.align ? 0 : Math.round((hash2(i, c.seed, Math.round(y)) - 0.5) * 1.6);
    const ax = o.align === 'center' ? x + w / 2 : o.align === 'right' ? x + w : lx;
    const tw = c.p.text(ln, ax, y + bob, { color: o.color ?? INK, fade: o.fade, wet: o.wet, seed: c.seed + i, align: o.align });
    if (o.struck) { const sx = o.align === 'center' ? ax - tw / 2 : ax; c.p.line(sx - 2, y - 5 + bob, sx + tw + 2, y - 7 + bob, RED); c.p.line(sx - 2, y - 4 + bob, sx + tw + 2, y - 6 + bob, RED); }
    y += LH;
  });
  if (o.key) c.regions.push({ key: o.key, x: x - 2, y: y0 - 14, w: w + 4, h: y - y0 + 2, kind: 'ink' });
  return y;
}
function wrapIndented(text: string, w: number, ind: number): string[] {
  if (!ind) return wrap(text, 16, w);
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '', max = w - ind;
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (line && textWidth(t, 16) > max) { out.push(line); line = wd; max = w; } else line = t;
  }
  out.push(line);
  return out;
}
/** a flourished rule: a line, a lozenge in the middle, dots at the ends */
function rule(p: Pix, x0: number, x1: number, y: number, col: RGB = INK): void {
  const m = Math.round((x0 + x1) / 2);
  p.hline(x0 + 3, m - 5, y, col); p.hline(m + 5, x1 - 3, y, col);
  for (const [dx, dy] of [[0, -3], [-1, -2], [1, -2], [-2, -1], [2, -1], [-3, 0], [3, 0], [-2, 1], [2, 1], [-1, 2], [1, 2], [0, 3]]) p.set(m + dx, y + dy, col);
  p.set(m, y, RED);
  p.set(x0, y, col); p.set(x1, y, col);
}
/** a heading in 32 px (falls back to 16 px when it will not fit) */
function heading(c: Ctx, text: string, cx: number, y: number, maxW: number, col: RGB = INK, key?: string): number {
  const size = textWidth(text, 32) <= maxW ? 32 : 16;
  c.p.text(text, cx, y, { size, color: col, align: 'center', under: mix(col, PAPER[3], 0.6) });
  if (key) c.regions.push({ key, x: cx - maxW / 2, y: y - size, w: maxW, h: size + 6, kind: 'ink' });
  return y + (size === 32 ? 10 : 4);
}
/** a small upper-case label in red, inline */
function label(c: Ctx, text: string, x: number, y: number): number { return c.p.text(text, x, y, { color: RED }) + 6; }

/** a tooth bullet (6 x 8) */
function tooth(p: Pix, x: number, y: number, filled = true): void {
  const shape = ['.####.', '######', '######', '.####.', '.####.', '..##..', '..##..', '...#..'];
  shape.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '#') return;
    const edge = j === 0 || i === 0 || i === 5 || row[i - 1] !== '#' || row[i + 1] !== '#';
    p.set(x + i, y + j, filled ? (edge ? INK : j < 2 ? hex('#f4ecd4') : hex('#d8ccae')) : edge ? FADED : PAPER[4]);
  }));
}
/** a fang for the danger scale (9 x 13): ivory with a dark outline when counted, a faint dotted ghost when not */
function fang(p: Pix, x: number, y: number, filled: boolean): void {
  const shape = ['.#######.', '#########', '#########', '#########', '.#######.', '.#######.', '..#####..', '..#####..', '...###...', '...###...', '....#....'];
  shape.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '#') return;
    const edge = j === 0 || row[i - 1] !== '#' || row[i + 1] !== '#' || (shape[j + 1]?.[i] ?? '.') !== '#';
    if (filled) p.set(x + i, y + j, edge ? INK : i < 3 ? hex('#fff6e0') : j > 6 ? hex('#cbbd9a') : hex('#e6dabb'));
    else if (edge && (i + j) % 2 === 0) p.set(x + i, y + j, FADED);
  }));
  if (filled) { p.set(x + 4, y + 9, RED); p.set(x + 4, y + 10, RED); }
}
/** an ink smear with "???" written over it: what the Book has not worked out yet */
function smudge(c: Ctx, x: number, y: number, w: number): void {
  const p = c.p;
  for (let k = 0; k < 5; k++) {
    const cx = x + 12 + hash2(k, c.seed, y) * (w - 24), cy = y - 5 + (hash2(k, c.seed, x) - 0.5) * 4, rx = 10 + hash2(k, y, 3) * 26, ry = 4 + hash2(k, y, 4) * 3;
    for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy++) for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
      const u = (xx - cx) / rx, v = (yy - cy) / ry, d = u * u + v * v;
      if (d > 1 || (d > 0.6 && hash2(xx, yy, 7) < 0.5)) continue;
      p.tint(xx, yy, hex('#3e2a20'), d < 0.4 ? 0.5 : 0.3);
    }
  }
  p.text('???', x + 6, y, { color: hex('#2e2018'), fade: 0.2, seed: c.seed });
}
/** a bite out of the page: a scalloped chunk gone, the page beneath showing through, torn rims */
function bite(p: Pix, cx: number, cy: number, r: number, seed: number): void {
  const teeth: [number, number][] = [];
  for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; teeth.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]); }
  const inBite = (x: number, y: number) => {
    if (((x - cx) / r) ** 2 + ((y - cy) / (r * 0.85)) ** 2 < 0.82) return true;
    return teeth.some(([tx, ty], k) => (x - tx) ** 2 + (y - ty) ** 2 < (3.2 + hash2(k, seed, 2) * 1.6) ** 2);
  };
  const under = mix(PAPER[2], hex('#3a2a1c'), 0.25);
  for (let y = Math.floor(cy - r - 6); y <= cy + r + 6; y++) for (let x = Math.floor(cx - r - 6); x <= cx + r + 6; x++) {
    if (!p.inside(x, y)) continue;
    if (inBite(x, y)) {
      // the page below, in the shadow of this one
      const edge = !inBite(x - 2, y - 2) || !inBite(x - 1, y - 3);
      p.set(x, y, edge ? shade(under, 0.62) : mix(under, PAPER[3], hash2(x, y, seed) * 0.25));
    } else if (inBite(x + 1, y) || inBite(x - 1, y) || inBite(x, y + 1) || inBite(x, y - 1)) {
      p.set(x, y, hash2(x, y, seed + 1) < 0.6 ? PAPER[7] : PAPER[1]);
    }
  }
}
/** a scrap of notepaper taped into the book (Ray's notes) */
function scrap(c: Ctx, x: number, y: number, w: number, h: number): void {
  const s = paper(c.seed + 500, 'R', { ramp: SCRAP, w, h, gutter: false });
  // pale blue rules
  for (let yy = 16; yy < h - 4; yy += LH) for (let xx = 2; xx < w - 2; xx++) if (hash2(xx, yy, 3) > 0.08) s.tint(xx, yy, hex('#7a90b0'), 0.35);
  c.p.blit(s, x, y);
  // a shadow under the scrap, and two strips of old tape
  for (let xx = x + 2; xx < x + w + 2; xx++) c.p.mul(xx, y + h, 0.78);
  for (let yy = y + 2; yy < y + h + 1; yy++) c.p.mul(x + w, yy, 0.78);
  for (const tx of [x - 8, x + w - 22]) for (let yy = y - 6; yy < y + 8; yy++) for (let xx = tx; xx < tx + 30; xx++) c.p.tint(xx, yy, hex('#d8c070'), 0.32 + (hash2(xx, yy, 4) < 0.1 ? 0.15 : 0));
}

// ------------------------------------------------------------------------------------------------ the plate
function ensurePortrait(id: string, pend: { v: boolean }, onReady: () => void): PortraitArt | null {
  const pr = portraitCache.get(id);
  if (pr !== undefined) return pr;
  if (!hasPortraitSource(id)) return null;
  pend.v = true;
  if (!waiting.has(id)) {
    waiting.add(id);
    portrait(id).then((a) => { waiting.delete(id); if (a) portraitCache.set(id, a); onReady(); });
  }
  return null;
}
const portraitCache = new Map<string, PortraitArt>();
const waiting = new Set<string>();

function plate(c: Ctx, e: Entry, x: number, y: number, tasted: boolean, art: PortraitArt | null): void {
  const p = c.p;
  const w = PW, h = PH;
  if (tasted && art) {
    const scene = plateScene(e.scene, w, h, c.seed);
    const pic = new Pix(w, h);
    pic.blit(scene, 0, 0);
    groundShadow(pic, art.foot[0], art.foot[1] - 1, art.foot[2] * 0.9);
    pic.blit(art.color, 0, 0);
    // a dithered vignette into the paper: the painting soaks into the page at its edges
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (art.color.alpha(xx, yy) > 128) { p.set(x + xx, y + yy, pic.get(xx, yy)); continue; }
      const ex = Math.min(xx, w - 1 - xx) / 22, ey = Math.min(yy, h - 1 - yy) / 18;
      const k = Math.min(1, ex, ey) + (NZ.n2(xx / 9, yy / 9) * 0.25);
      if (k + bayer(xx, yy) * 0.5 < 0.5) continue;
      p.set(x + xx, y + yy, k < 0.75 ? mix(pic.get(xx, yy), p.get(x + xx, y + yy), 0.45) : pic.get(xx, yy));
    }
  } else if (art) {
    p.blit(art.sketch, x, y);
    p.text('?', x + w - 34, y + 50, { size: 64, color: hex('#9a907e'), fade: 0.4 });
  } else {
    p.text('?', x + w / 2, y + h / 2 + 20, { size: 64, color: hex('#9a907e'), fade: 0.5, align: 'center' });
  }
  // the frame: a double rule with lozenges at the corners
  const fx = x - 5, fy = y - 5, fw = w + 10, fh = h + 10;
  for (const [o, col] of [[0, INK], [3, FADED]] as const) {
    p.hline(fx + o, fx + fw - o, fy + o, col); p.hline(fx + o, fx + fw - o, fy + fh - o, col);
    p.vline(fx + o, fy + o, fy + fh - o, col); p.vline(fx + fw - o, fy + o, fy + fh - o, col);
  }
  for (const [cx, cy] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) {
    for (const [dx, dy] of [[0, -3], [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [0, 3]]) p.set(cx + dx, cy + dy, Math.abs(dx) + Math.abs(dy) < 2 ? RED : INK);
  }
  c.regions.push({ key: `plate:${e.id}`, x, y, w, h, kind: 'plate' });
}

// ------------------------------------------------------------------------------------------------ pages
export function paintPage(kind: PageKind, side: 'L' | 'R', v: BookView, index: number, onReady: () => void): Painted {
  const seed = 1000 + index * 17;
  const c: Ctx = { p: paper(seed, side), regions: [], seed };
  const pend = { v: false };
  const X0 = side === 'L' ? 26 : 32, X1 = side === 'L' ? PAGE_W - 32 : PAGE_W - 26, CW = X1 - X0, CX = (X0 + X1) / 2;
  const p = c.p;
  switch (kind.k) {
    case 'endpaper': case 'endback': {
      marble(p, seed);
      if (kind.k === 'endpaper') {
        // Ray's bookplate
        const bx = 64, by = 132, bw = 256, bh = 250;
        const plateP = paper(seed + 3, 'R', { w: bw, h: bh, gutter: false });
        p.blit(plateP, bx, by);
        for (let i = 0; i < 2; i++) { p.hline(bx + 6 + i * 4, bx + bw - 7 - i * 4, by + 6 + i * 4, INK); p.hline(bx + 6 + i * 4, bx + bw - 7 - i * 4, by + bh - 7 - i * 4, INK); p.vline(bx + 6 + i * 4, by + 6 + i * 4, by + bh - 7 - i * 4, INK); p.vline(bx + bw - 7 - i * 4, by + 6 + i * 4, by + bh - 7 - i * 4, INK); }
        p.text('EX LIBRIS', bx + bw / 2, by + 44, { size: 32, color: INK, align: 'center' });
        antlers(p, bx + bw / 2, by + 104);
        p.text('R. TREMBLAY', bx + bw / 2, by + 146, { size: 16, color: INK, align: 'center' });
        p.text('Kettle Lake', bx + bw / 2, by + 164, { color: FADED, align: 'center' });
        rule(p, bx + 40, bx + bw - 40, by + 180);
        c.p.text('IF FOUND', bx + bw / 2, by + 202, { color: RED, align: 'center' });
        c.p.text('DO NOT FEED', bx + bw / 2, by + 220, { color: RED, align: 'center' });
        bite(p, PAGE_W - 6, PAGE_H - 10, 22, seed);
      }
      break;
    }
    case 'title': {
      let y = 96;
      p.text('BOOK', CX, y, { size: 64, color: INK, align: 'center', under: shade(PAPER[3], 0.8) });
      y += 40; p.text('of', CX, y, { size: 32, color: RED, align: 'center' });
      y += 62; p.text('CRYPTIDS', CX, y, { size: 64, color: INK, align: 'center', under: shade(PAPER[3], 0.8) });
      y += 26; rule(p, X0 + 30, X1 - 30, y);
      y += 30;
      mouthEmblem(p, CX, y + 52);
      y += 128;
      y = para(c, 'Being a true account of the fearsome critters of the Kettle Lake bush, as tasted by this Book.', X0 + 16, y, CW - 32, { color: INK, align: 'center' });
      y += 24;
      para(c, 'kept by R. Tremblay', X0, y, CW, { color: RAY_INK, align: 'center', struck: true });
      para(c, 'now yours, kid', X0, y + 22, CW, { color: RAY_INK, align: 'center', fade: 0.2 });
      break;
    }
    case 'jobs': {
      let y = heading(c, 'Jobs', CX, 64, CW) + 6;
      rule(p, X0 + 20, X1 - 20, y); y += 26;
      const taken = v.contracts.filter((k) => k.state !== 'posted');
      if (!taken.length) { y = para(c, 'Nothing yet. The board at Pruneau\'s has work.', X0, y, CW, { color: RAY_INK, fade: 0.1 }); }
      for (const k of taken) {
        const done = k.state === 'done' || k.state === 'paid' || k.state === 'failed';
        const ty = y;
        y = para(c, k.title.charAt(0) + k.title.slice(1).toLowerCase(), X0, y, CW - 60, { color: INK, struck: done, key: `job:${k.id}` });
        p.text(k.pay > 0 ? `$${k.pay}` : 'by kg', X1, y - LH, { color: done ? FADED : RED, align: 'right' });
        y = para(c, k.from, X0 + 10, y, CW - 10, { color: FADED });
        if (k.goal.count > 0) {
          // progress as tally marks, in fives
          const n = Math.min(k.progress, k.goal.count);
          y += 4;
          let tx = X0 + 10;
          for (let i = 0; i < k.goal.count; i++) {
            const g = Math.floor(i / 5), r = i % 5;
            const xx = X0 + 12 + g * 34 + r * 6;
            if (r === 4) { p.line(xx - 26, y - 3, xx + 2, y - 14, i < n ? INK : PAPER[2]); p.line(xx - 26, y - 2, xx + 2, y - 13, i < n ? INK : PAPER[2]); }
            else { p.vline(xx, y - 16, y - 1, i < n ? INK : PAPER[2]); if (i < n) p.vline(xx + 1, y - 15, y - 2, INK); }
            tx = xx;
          }
          p.text(`${n} of ${k.goal.count}`, tx + 16, y - 2, { color: INK });
          y += LH + 2;
        }
        if (k.due !== undefined) y = para(c, `Needed by day ${k.due + 1}`, X0 + 10, y, CW, { color: done ? FADED : RED });
        if (k.state === 'paid') stamp(p, X1 - 56, ty + 40, 'PAID');
        else if (k.state === 'done') stamp(p, X1 - 56, ty + 40, 'DONE');
        y += 12;
        if (y > PAGE_H - 60) break;
      }
      break;
    }
    case 'contents': {
      let y = heading(c, 'Cryptids', CX, 64, CW) + 6;
      rule(p, X0 + 20, X1 - 20, y); y += 28;
      for (const e of v.entries) {
        const t = v.tasted.has(e.id), s = v.seen.has(e.id);
        if (t) tooth(p, X0, y - 11, true); else if (s) eye(p, X0 + 3, y - 6); else p.text('?', X0 + 3, y, { color: FADED });
        const num = ROMAN(e.plate) + '.';
        p.text(num, X0 + 40, y, { color: FADED, align: 'right' });
        const nw = p.text(e.name, X0 + 46, y, { color: t ? INK : s ? INK : FADED, fade: t ? 0 : 0.25 });
        const pg = String(v.pageOf(e.id) + 1);
        const pw = textWidth(pg, 16);
        for (let xx = X0 + 50 + nw; xx < X1 - pw - 6; xx += 4) p.set(xx, y - 1, FADED);
        p.text(pg, X1, y, { color: INK, align: 'right' });
        y += LH + 4;
      }
      y += 10;
      const nt = v.entries.filter((e) => v.tasted.has(e.id)).length;
      rule(p, X0 + 60, X1 - 60, y); y += 24;
      para(c, `Tasted ${nt} of ${v.entries.length}`, X0, y, CW, { color: BOOK_INK, align: 'center', wet: true, key: 'count' });
      break;
    }
    case 'plate': {
      const e = v.entries.find((x) => x.id === kind.id)!;
      const t = v.tasted.has(e.id);
      let y = 34;
      p.text(`PLATE ${ROMAN(e.plate)}`, CX, y, { color: FADED, align: 'center' });
      rule(p, X0 + 6, CX - 46, y - 5, FADED); rule(p, CX + 46, X1 - 6, y - 5, FADED);
      y = heading(c, e.name, CX, y + 36, CW) + 12;
      p.text(e.latin || '—', CX, y, { color: FADED, align: 'center', fade: 0.1 });
      const art = ensurePortrait(e.id, pend, onReady);
      const px = Math.round(CX - PW / 2), py = y + 14;
      plate(c, e, px, py, t, art);
      y = py + PH + 24;
      if (t) p.text(`fig. ${e.plate}  tasted on day ${(v.tasted.get(e.id) ?? 0) + 1}`, CX, y, { color: BOOK_INK, align: 'center', wet: true });
      else p.text(v.seen.has(e.id) ? 'Ray\'s sketch. Seen, not tasted.' : 'Ray\'s sketch. Not yet tasted.', CX, y, { color: PENCIL, align: 'center', fade: 0.25 });
      c.regions.push({ key: `caption:${e.id}`, x: X0, y: y - 14, w: CW, h: 18, kind: 'ink' });
      y += 24;
      // the stats, and the favourite food in a box on the right
      const sx = X0, sw = CW - 90;
      const sy0 = y;
      const stat = (lab: string, text: string, key: string) => {
        const lw = label(c, lab, sx, y);
        y = para(c, t ? text : '???', sx, y, sw, { color: t ? BOOK_INK : FADED, indent: lw, wet: t, fade: t ? 0 : 0.3, key });
      };
      stat('Habitat', e.habitat, `habitat:${e.id}`);
      stat('Abroad', e.active, `active:${e.id}`);
      stat('Size', e.size, `size:${e.id}`);
      const lw = label(c, 'Danger', sx, y);
      for (let i = 0; i < 5; i++) fang(p, sx + lw + i * 12, y - 12, t && i < e.danger);
      c.regions.push({ key: `danger:${e.id}`, x: sx, y: y - 14, w: sw, h: 18, kind: 'ink' });
      // food box
      const bw = 78, bh = 64, bx = X1 - bw, by = sy0 + 2;
      p.text('Favourite', bx + bw / 2, sy0 - 2, { color: RED, align: 'center' });
      for (const [o, col] of [[0, INK], [2, FADED]] as const) { p.hline(bx + o, bx + bw - o, by + o, col); p.hline(bx + o, bx + bw - o, by + bh - o, col); p.vline(bx + o, by + o, by + bh - o, col); p.vline(bx + bw - o, by + o, by + bh - o, col); }
      if (t) p.blit(icon(e.food.icon), bx + bw / 2 - 24, by + 8, { scale: 2 });
      else p.text('?', bx + bw / 2, by + 46, { size: 32, color: FADED, align: 'center', fade: 0.3 });
      c.regions.push({ key: `food:${e.id}`, x: bx + 4, y: by + 4, w: bw - 8, h: bh - 8, kind: 'plate' });
      const fl = wrap(t ? e.food.name : '???', 16, 110);
      p.text(fl[0], bx + bw / 2, by + bh + 16, { color: t ? BOOK_INK : FADED, align: 'center', wet: t });
      if (fl[1] && by + bh + 34 < PAGE_H - 12) p.text(fl[1], bx + bw / 2, by + bh + 34, { color: t ? BOOK_INK : FADED, align: 'center', wet: t });
      c.regions.push({ key: `foodname:${e.id}`, x: bx - 40, y: by + bh, w: bw + 40, h: 40, kind: 'ink' });
      break;
    }
    case 'notes': {
      const e = v.entries.find((x) => x.id === kind.id)!;
      const t = v.tasted.has(e.id);
      const known = v.known.get(e.id) ?? new Set<string>();
      let y = 34;
      p.text(e.name.toUpperCase(), CX, y, { color: FADED, align: 'center' });
      y += 22;
      // Ray's scrap: measure first, then paint the paper, then the words on it
      const notes = e.ray.length ? e.ray : ['Never wrote anything down about this one.'];
      const sw = CW - 6;
      let lines = 1;
      for (const n of notes) lines += wrap(n, 16, sw - 30).length;
      const sh = lines * LH + 22;
      scrap(c, X0 + 3, y, sw, sh);
      let sy = y + 22;
      p.text('Ray:', X0 + 12, sy, { color: RAY_INK, fade: 0.2 });
      sy += LH;
      for (const n of notes) { p.text('-', X0 + 12, sy, { color: RAY_INK }); sy = para(c, n, X0 + 22, sy, sw - 30, { color: RAY_INK, fade: 0.18 }); }
      y += sh + 30;
      // the Book's own remark
      label(c, 'The Book says', X0, y);
      y += LH + 2;
      if (t) y = para(c, `"${e.taste}"`, X0 + 8, y, CW - 8, { color: BOOK_INK, wet: true, key: `taste:${e.id}` });
      else { y = para(c, 'Not tasted. Hold me up to one.', X0 + 8, y, CW - 8, { color: FADED, fade: 0.3, key: `taste:${e.id}` }); }
      y += 14;
      // the rules
      const nk = e.rules.filter((r) => known.has(r.id)).length;
      const lw = label(c, 'Rules', X0, y);
      p.text(e.rules.length ? `${nk} of ${e.rules.length}` : 'none yet', X0 + lw, y, { color: FADED });
      rule(p, X0 + lw + 70, X1 - 4, y - 5, FADED);
      y += LH + 6;
      for (const r of e.rules) {
        if (y > PAGE_H - 30) break;
        if (known.has(r.id)) {
          tooth(p, X0, y - 11, true);
          y = para(c, r.text, X0 + 14, y, CW - 14, { color: BOOK_INK, wet: true, key: `rule:${e.id}:${r.id}` }) + 6;
        } else {
          tooth(p, X0, y - 11, false);
          smudge(c, X0 + 14, y, CW * 0.6 + hash2(y, 3, 1) * CW * 0.3);
          c.regions.push({ key: `rule:${e.id}:${r.id}`, x: X0 + 12, y: y - 14, w: CW - 12, h: 18, kind: 'ink' });
          y += LH + 6;
        }
      }
      if (hash2(index, 5, 9) < 0.4) bite(p, PAGE_W - 4, PAGE_H - 4, 18, seed);
      break;
    }
    case 'guide': {
      let y = heading(c, 'How to read me', CX, 64, CW, BOOK_INK) + 8;
      rule(p, X0 + 20, X1 - 20, y); y += 28;
      const lines = [
        'Hold me open and point me at a critter. Close enough to smell it. I will taste it and write it down myself.',
        'A and D turn my pages. Gently. I bruise.',
        'Tab shuts me. Mind your fingers.',
        'Find out one of their rules and I will write it in. I lick the page first. Do not ask.',
        'I do not eat paper. I do not eat people. Mostly.',
      ];
      for (const l of lines) { tooth(p, X0, y - 11, true); y = para(c, l, X0 + 14, y, CW - 14, { color: BOOK_INK, wet: true }) + 10; }
      bite(p, 2, PAGE_H - 4, 20, seed);
      break;
    }
    case 'blocks': {
      blocks(c, kind.blocks, X0, 64, CW, RAY_INK);
      break;
    }
    case 'contract': {
      // the sheet off the board, pasted in
      const k = kind.c;
      const sw = CW - 10, sh = PAGE_H - 120;
      const sheetR = k.hand === 'type' ? SCRAP : ramp('#9a8a6a', '#b4a482', '#c8b896', '#d8caa8', '#e4d8b8');
      const sx = X0 + 5, sy = 56;
      const s = paper(seed + 77, 'R', { ramp: sheetR, w: sw, h: sh, gutter: false });
      p.blit(s, sx, sy);
      for (let xx = sx + 3; xx < sx + sw + 3; xx++) p.mul(xx, sy + sh, 0.75);
      for (let yy = sy + 3; yy < sy + sh + 1; yy++) p.mul(sx + sw, yy, 0.75);
      for (const tx of [sx + sw / 2 - 20]) for (let yy = sy - 8; yy < sy + 10; yy++) for (let xx = tx; xx < tx + 40; xx++) p.tint(xx, yy, hex('#d8c070'), 0.32);
      blocks({ ...c, seed: k.paperSeed }, contractPaper(k), sx + 14, sy + 44, sw - 28, handInk(k.hand));
      if (k.state === 'paid' || k.state === 'done') stamp(p, sx + sw - 70, sy + sh - 40, k.state === 'paid' ? 'PAID' : 'DONE');
      break;
    }
    case 'blank': {
      if (index % 4 === 1) para(c, 'Room for more.', X0, PAGE_H / 2, CW, { color: FADED, align: 'center', fade: 0.4 });
      break;
    }
  }
  return { pix: p, regions: c.regions, pending: pend.v };
}

function handInk(h: string): RGB {
  return h === 'type' ? hex('#1c1c20') : h === 'apple' ? hex('#22305a') : h === 'patrick' ? PENCIL : hex('#3a2418');
}

function blocks(c: Ctx, bl: Block[], x: number, y: number, w: number, ink: RGB): number {
  const p = c.p;
  for (const b of bl) {
    const col = b.color ? hex(b.color) : ink;
    switch (b.t) {
      case 'h': y = heading(c, b.text ?? '', x + w / 2, y, w, col) + 16; break;
      case 'p': y = para(c, b.text ?? '', x, y, w, { color: col, fade: 0.1, struck: b.struck }) + 4; break;
      case 'small': y = para(c, b.text ?? '', x, y, w, { color: mix(col, PAPER[3], 0.35) }); break;
      case 'sig': y = para(c, b.text ?? '', x, y, w, { color: col, align: 'right' }); break;
      case 'price': y = para(c, b.text ?? '', x, y, w, { color: col, align: 'right' }); break;
      case 'line': rule(p, x + 10, x + w - 10, y - 4, col); y += 14; break;
      case 'gap': y += b.h ?? 14; break;
      case 'sketch': {
        if (!b.draw) break;
        const hh = b.h ?? 120;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        const g = cv.getContext('2d')!;
        b.draw(g, 0, 0, w, hh);
        const sp = Pix.fromCanvas(cv);
        for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) if (sp.alpha(i, j) > 100) p.set(x + i, y + j, mix(sp.get(i, j), ink, 0.5));
        y += hh + 8;
        break;
      }
    }
  }
  return y;
}

function stamp(p: Pix, x: number, y: number, text: string): void {
  const w = textWidth(text, 32) + 16;
  for (let i = 0; i < 2; i++) { p.hline(x - w / 2 + i, x + w / 2 - i, y - 30 + i, RED); p.hline(x - w / 2 + i, x + w / 2 - i, y + 8 - i, RED); p.vline(x - w / 2 + i, y - 30, y + 8, RED); p.vline(x + w / 2 - i, y - 30, y + 8, RED); }
  p.text(text, x, y, { size: 32, color: RED, align: 'center', fade: 0.3 });
}
function eye(p: Pix, x: number, y: number): void {
  p.ellipse(x + 4, y, 6, 3.4, (_x, _y, u, v) => (u * u + v * v > 0.55 ? INK : Math.abs(u) < 0.32 ? INK : PAPER[6]));
}
/** marbled endpaper: combed swirls in oxblood, ochre and slate */
function marble(p: Pix, seed: number): void {
  const R = ramp('#2a1416', '#4a1e1c', '#6e2a22', '#8a4a2e', '#a8783c', '#4a5054', '#6a7470', '#c8b48a');
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const wx = x + NZ.n2(x / 60 + seed, y / 60) * 30 + Math.sin(y / 9) * 6;
    const wy = y + NZ.n2(x / 50, y / 50 + seed) * 30;
    const v = NZ.fbm2(wx / 46, wy / 46, 3);
    const vein = Math.abs(Math.sin(v * 9 + wx / 25));
    let k = Math.floor((v * 0.5 + 0.5) * 5.5 + bayer(x, y) * 0.6);
    if (vein < 0.12) k = 7; else if (vein < 0.22) k = 5 + (hash2(x, y, 3) > 0.5 ? 1 : 0);
    p.set(x, y, R[Math.max(0, Math.min(R.length - 1, k))]);
  }
}
/** a little pair of antlers for the bookplate */
function antlers(p: Pix, cx: number, cy: number): void {
  for (const s of [-1, 1]) {
    const pts: [number, number][] = [[0, 10], [8, 2], [16, -8], [22, -20], [24, -30]];
    for (let i = 0; i + 1 < pts.length; i++) p.line(cx + s * pts[i][0], cy + pts[i][1], cx + s * pts[i + 1][0], cy + pts[i + 1][1], INK);
    for (let i = 0; i + 1 < pts.length; i++) p.line(cx + s * (pts[i][0] + 1), cy + pts[i][1], cx + s * (pts[i + 1][0] + 1), cy + pts[i + 1][1], INK);
    for (const [bx, by, ex, ey] of [[8, 2, 4, -12], [16, -8, 28, -14], [22, -20, 16, -32]]) p.line(cx + s * bx, cy + by, cx + s * ex, cy + ey, INK);
  }
  p.ellipse(cx, cy + 14, 7, 6, INK);
  p.set(cx - 3, cy + 13, RED); p.set(cx + 3, cy + 13, RED);
}
/** the title page emblem: the Book's own grin, with eyes */
function mouthEmblem(p: Pix, cx: number, cy: number): void {
  const W = 84, H = 34;
  const LIP = ramp('#3a0c0c', '#5e1a16', '#84301e', '#a04a2c');
  p.ellipse(cx, cy, W, H, (x, y, u, v) => {
    const d = u * u + v * v;
    if (d > 0.82) return LIP[d > 0.93 ? 0 : 2 - (v < 0 ? 0 : 1)];
    if (Math.abs(v) < 0.1 + 0.25 * (1 - Math.abs(u))) return hex('#14060a');
    return v < 0 ? hex('#3a1414') : hex('#2a0c0e');
  });
  // teeth: a row top and bottom
  for (let i = -8; i <= 8; i++) {
    const x = cx + i * 9, u = (i * 9) / W;
    const yt = cy - H * Math.sqrt(Math.max(0, 0.78 - u * u)) * 0.92, yb = cy + H * Math.sqrt(Math.max(0, 0.78 - u * u)) * 0.92;
    const len = 9 - Math.abs(i) * 0.4 + (i % 3 === 0 ? 3 : 0);
    for (let j = 0; j < len; j++) for (let k = -3 + Math.floor(j / 3); k <= 3 - Math.floor(j / 3); k++) {
      p.set(x + k, yt + j, k <= -2 + Math.floor(j / 3) ? hex('#a8987a') : hex('#efe4c8'));
      if (i % 2 === 0) p.set(x + 4 + k, yb - j, k <= -2 + Math.floor(j / 3) ? hex('#a8987a') : hex('#e2d6b8'));
    }
  }
  // a tongue lolling out of the corner
  p.ellipse(cx + 34, cy + 24, 13, 7, (_x, _y, u, v) => (u * u + v * v > 0.7 ? hex('#5e1a20') : v < -0.2 ? hex('#c86a6a') : Math.abs(u) < 0.1 ? hex('#7a2a2e') : hex('#a84a4e')));
  // little eyes above
  for (const s of [-1, 1]) {
    p.ellipse(cx + s * 30, cy - H - 22, 9, 7, (_x, _y, u, v) => (u * u + v * v > 0.72 ? INK : Math.abs(u) < 0.18 && Math.abs(v) < 0.75 ? hex('#140808') : v < -0.3 ? hex('#f0c060') : hex('#c88a24')));
    p.set(cx + s * 30 - 3, cy - H - 25, hex('#fff4d0'));
    p.line(cx + s * 30 - 10, cy - H - 32 + (s > 0 ? 2 : 0), cx + s * 30 + 10, cy - H - 32 + (s > 0 ? 0 : 2), INK);
  }
}

export { portraitCache };
export type { PortraitArt };
