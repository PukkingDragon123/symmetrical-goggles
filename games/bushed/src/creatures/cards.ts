// Alpha-cut CARDS drawn into a locks() atlas. The anatomy library's locks() gives real ribbon geometry rooted in the
// skin (hair, a fringe, a mane) over one shared atlas of LOCK_VARIANTS shapes across and one row per tile ramp, and
// paints hair flames on it. These painters draw other things into that same layout, so any locks() piece becomes a
// coat of feathers, a ragged fringe of bark strips, dangling beard lichen or tufts of larch needles by swapping its
// paint:
//   const P = locks({ name, seats, tiles: [RAMP_A, RAMP_B] })!;
//   P.paint = cardPaint(['feather', 'down'], [RAMP_A, RAMP_B], { steps: [3, 4] });
// Each tile is drawn from the root (t = 0, where the ribbon leaves the skin) to the tip (t = 1); `e` runs across it
// (-1 .. 1, the ribbon's own width at that row). Pixel art: ramp steps only, a dark selective outline, no blending.
import { h3, type Chart, type Piece, type Body } from './anatomy';

/** shapes across a locks() atlas (anatomy/locks.ts VAR) */
export const LOCK_VARIANTS = 4;
export type CardKind = 'feather' | 'plume' | 'down' | 'bark' | 'lichen' | 'moss' | 'needles';
type Draw = (e: number, t: number, v: number, px: { x: number; y: number; tw: number; th: number }) => number | null;

const fr = (x: number) => x - Math.floor(x);
const cl = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** an owl's contour or flight feather: a quill, a vane (the trailing side broader), barbs raking toward the tip,
 *  dark chevron bars across it, a soft pale fringe at the tip, downy wisps at the base */
function feather(bars: number, plume = false): Draw {
  return (e, t, v, q) => {
    const ae = Math.abs(e), lead = e < 0 ? 0.78 : 1;
    // outline: the quill below t 0.1, the vane swelling to its widest at 0.55, a rounded tip
    let hw = t < 0.08 ? 0.16 : t < 0.3 ? 0.16 + (t - 0.08) / 0.22 * 0.74 : 0.9;
    if (t > 0.62) hw *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.62) / 0.38, 2)));
    hw *= lead * (plume ? 1 : 0.92 + 0.08 * Math.sin(t * 9 + v));
    // splits in the vane: a barb gap raking toward the tip
    const gap = Math.abs(fr(t * 3.1 + ae * 0.9 + v * 0.37) - 0.5) < 0.035 && ae > 0.25 && t > 0.3 && h3(v, Math.floor(t * 3.1 + ae * 0.9), 3) < 0.45;
    // downy wisps at the base
    const wisp = t < 0.3 && ae < 0.95 && ae > hw && Math.abs(fr(ae * 4 + t * 7 + v) - 0.5) < 0.12 && h3(Math.floor(ae * 6), Math.floor(t * 20), v) < 0.5;
    if ((ae > hw || gap) && !wisp) return null;
    if (wisp) return 3.6;
    let k = 0;
    // barbs: fine darker lines raking from the quill toward the tip
    if (Math.abs(fr(t * 16 - ae * 3.2 + v * 0.21) - 0.5) < 0.14) k -= 0.55;
    // bars: chevrons across the vane, alternating with paler bands
    const b = fr(t * bars - ae * 0.35 + v * 0.13);
    if (t > 0.18 && b < 0.26) k -= 1.5; else if (t > 0.18 && b > 0.62 && b < 0.74) k += 0.6;
    // the quill: a pale shaft down the middle, darker at the root
    if (ae < 0.07 * (1.2 - t)) k = t < 0.15 ? 0.4 : 1.2;
    // lit along the trailing edge, a dark rim on the leading edge
    if (e > hw * 0.55) k += 0.5;
    if (ae > hw * 0.82) k -= e < 0 ? 1.3 : 0.7;
    if (t > 0.9) k += 0.7;
    if (t < 0.1) k -= 0.8;
    void q;
    return k;
  };
}
/** a puff of down: a rounded tuft of wisps */
const down: Draw = (e, t, v) => {
  const r = Math.hypot(e * 0.9, (t - 0.45) * 1.8);
  const wob = 0.82 + 0.18 * Math.sin(Math.atan2(t - 0.45, e) * 7 + v * 2);
  if (r > wob || t < 0.04) return null;
  let k = 0.4 - r * 1.2;
  if (Math.abs(fr(Math.atan2(t - 0.45, e) * 3 + r * 2 + v) - 0.5) < 0.1) k -= 0.8;
  if (r > wob * 0.85) k -= 0.9;
  return k;
};
/** a strip of bark peeled off a tamarack or cedar: a ragged band, fibres along it, dark lenticel dashes across, a
 *  pale curling edge on one side, a torn tip */
const bark: Draw = (e, t, v, q) => {
  const row = Math.floor(t * q.th);
  const jag = (h3(row >> 1, v, 11) - 0.5) * 0.2, jag2 = (h3(row >> 2, v, 12) - 0.5) * 0.14;
  let hw = 0.86 + jag + (t < 0.06 ? -0.3 : 0);
  const tear = t > 0.78 ? (t - 0.78) / 0.22 : 0;
  // the torn end: two or three ragged points
  const pts = 2 + (v % 2), lobe = Math.abs(Math.sin((e * 0.5 + 0.5) * Math.PI * pts + v));
  hw *= 1 - tear * (0.4 + 0.6 * (1 - lobe));
  if (e < -hw || e > hw + jag2 || t > 0.99 - (1 - lobe) * 0.35 * tear) return null;
  let k = 0;
  // fibres: long streaks along the strip
  const col = Math.floor((e + 1) * q.tw * 0.5);
  if (h3(col, v, 13) < 0.22) k -= 0.8; else if (h3(col, v, 14) > 0.85) k += 0.6;
  // lenticels: short dark dashes across the strip
  if (h3(Math.floor(t * q.th / 3), Math.floor((e + 1) * 3), v + 5) < 0.12) k -= 1.2;
  // the curled edge catches the light; the other edge is in shadow
  if (e > hw * 0.7) k += 0.8;
  if (e < -hw * 0.75) k -= 1.1;
  if (Math.abs(e) > hw * 0.93) k -= 0.8;
  return k;
};
/** beard lichen (Usnea, old man's beard): a tangle of thin pale strands falling from the root, forking as they go */
const lichen: Draw = (e, t, v, q) => {
  if (t < 0.02) return null;
  const n = 5 + (v % 3), px = 1.2 / q.tw;
  let hit = -1, edge = 0;
  for (let k = 0; k < n; k++) {
    const s0 = (k + 0.5) / n * 1.7 - 0.85 + (h3(k, v, 21) - 0.5) * 0.25;
    // strands spread out and sway as they fall; a fork splits each one past its fork point
    const fork = 0.35 + h3(k, v, 22) * 0.4, spread = 1 + t * 0.35;
    const sway = Math.sin(t * (5 + k) + k * 1.7 + v) * 0.09 * t;
    const len = 0.6 + h3(k, v, 23) * 0.4;
    if (t > len) continue;
    const w = Math.max(px * 0.75, 0.07 * (1 - t / len * 0.6));
    for (const br of t > fork ? [-1, 1] : [0]) {
      const x = s0 * spread + sway + br * (t - fork) * 0.35;
      const d = Math.abs(e - x);
      if (d < w) { hit = k; edge = d / w; }
    }
  }
  if (hit < 0) {
    // little side branchlets (fibrils) off the strands
    return null;
  }
  let k = 0.4 - (edge > 0.6 ? 0.9 : 0) + (t > 0.85 ? 0.5 : 0);
  if (h3(Math.floor(t * q.th / 2), hit, v) < 0.15) k += 0.8;
  return k;
};
/** a shaggy hank of moss: a lumpy band, cushions of shoots, darker in the gaps */
const moss: Draw = (e, t, v, q) => {
  const row = Math.floor(t * q.th / 2);
  let hw = 0.75 + (h3(row, v, 31) - 0.5) * 0.4;
  hw *= t > 0.6 ? 1 - (t - 0.6) / 0.4 * (0.5 + 0.5 * h3(Math.floor(e * 4 + 4), v, 32)) : 1;
  if (Math.abs(e) > hw || t < 0.03) return null;
  let k = 0;
  // cushions: little domes lit on top, dark between
  const cx = Math.floor((e + 1) * 3), cy = Math.floor(t * q.th / Math.max(2, q.tw / 6));
  const lx = fr((e + 1) * 3), ly = fr(t * q.th / Math.max(2, q.tw / 6));
  const dome = Math.hypot(lx - 0.5, ly - 0.5);
  if (dome > 0.45) k -= 1.2; else if (ly < 0.35) k += 0.7;
  if (h3(cx, cy, v + 33) < 0.18) k += 0.8;
  if (Math.abs(e) > hw * 0.85) k -= 0.8;
  return k;
};
/** a tamarack spur: a tuft of 12-20 soft needles fanning out from a knob at the root */
const needles: Draw = (e, t, v, q) => {
  // in texels: root at the bottom centre of the tile
  const x = e * q.tw * 0.5, y = t * q.th, n = 12 + v * 2;
  if (y < 1.5 && Math.abs(x) < 2) return 0.2; // the knob
  const r = Math.hypot(x, y), a = Math.atan2(x, y);
  for (let k = 0; k < n; k++) {
    const ak = ((k + 0.5) / n - 0.5) * 1.5 + (h3(k, v, 41) - 0.5) * 0.15;
    const Lk = q.th * (0.62 + 0.38 * h3(k, v, 42));
    if (r > Lk || r < 1) continue;
    const off = Math.abs(a - ak) * r;
    if (off < 0.7) return 0.6 * (r / Lk) + (k % 3 === 0 ? -0.8 : k % 3 === 1 ? 0.5 : 0) + (r > Lk - 1.5 ? 0.6 : 0);
  }
  return null;
};

const DRAW: Record<CardKind, Draw> = { feather: feather(4.2), plume: feather(3, true), down, bark, lichen, moss, needles };

/** a locks() piece's paint: tile row k is drawn as kinds[k] in ramp tiles[k] around step steps[k] */
export function cardPaint(kinds: CardKind[], tiles: number[][], o: { steps?: number[]; rough?: number } = {}) {
  return (ch: Chart, _p: Piece, _b: Body) => {
    const r = ch.reg!, TW = r.w / LOCK_VARIANTS, TH = r.h / tiles.length, rough = o.rough ?? 225;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const v = Math.min(LOCK_VARIANTS - 1, Math.floor(x / TW)), row = Math.min(tiles.length - 1, Math.floor(y / TH)), R = tiles[row];
      const fx = (x - v * TW) / TW, fy = (y - row * TH) / TH;
      // the ribbon's uv runs over 0.06..0.94 across and 0.03..0.97 along its tile (locks.ts)
      const e = (fx - 0.5) / 0.44, t = cl((fy - 0.03) / 0.94, 0, 1);
      const k = Math.abs(e) > 1 ? null : DRAW[kinds[row] ?? 'feather'](e, t, v, { x, y, tw: TW * 0.88, th: TH * 0.94 });
      if (k === null) { r.set(x, y, R[0], 0); r.setSD(x, y, 0, rough, 0); continue; }
      const st = (o.steps?.[row] ?? 3) + k;
      r.set(x, y, R[Math.round(cl(st, 0, R.length - 1))], 255);
      r.setSD(x, y, 0, rough, 0);
    }
  };
}
