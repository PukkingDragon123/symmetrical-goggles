// Favourite-food icons for the plates: 24 x 24 pixel art, built from little shaded shapes, ramp-banded and outlined.
// icon(id) returns a cached Pix (drawn on the page at 2x). Unknown ids get a question-marked smear.
import { Pix, ramp, hex, outline, type RGB } from './pix';
import { hash2 } from '../../core/rng';

const S = 24;
type Ramp = RGB[];
/** a shaded blob: an ellipse lit from the upper left, banded onto a ramp */
function blob(p: Pix, cx: number, cy: number, rx: number, ry: number, r: Ramp, o: { rot?: number; spec?: boolean } = {}): void {
  const c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0);
  for (let y = Math.floor(cy - Math.max(rx, ry) - 1); y <= cy + Math.max(rx, ry) + 1; y++) for (let x = Math.floor(cx - Math.max(rx, ry) - 1); x <= cx + Math.max(rx, ry) + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
    const d = u * u + v * v;
    if (d > 1) continue;
    const lit = (-u * 0.6 - v * 0.75) * 0.5 + 0.5 - d * 0.35;
    let k = Math.round(lit * (r.length - 1) + ((x + y) & 1 ? 0.15 : -0.15));
    if (o.spec && u < -0.2 && u > -0.55 && v < -0.25 && v > -0.6) k = r.length - 1;
    p.set(x, y, r[Math.max(0, Math.min(r.length - 1, k))]);
  }
}
function box(p: Pix, x: number, y: number, w: number, h: number, r: Ramp): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = i === 0 || j === 0 ? r.length - 1 : i === w - 1 || j === h - 1 ? 0 : Math.round((r.length - 1) * (0.65 - j / h * 0.3));
    p.set(x + i, y + j, r[k]);
  }
}

const WOOD = ramp('#3a2414', '#5e3c1e', '#86592c', '#aa7a40', '#c89a5a');
const MEAT = ramp('#2a0e0c', '#4c1a14', '#74281c', '#9a4028', '#b85e3a');
const TIN = ramp('#3a3c40', '#5c5e62', '#888a8c', '#b4b4b0', '#dcdad2');
const PAPER = ramp('#8a7a5c', '#b4a27e', '#d4c4a0', '#ece0c0');
const BERRY = ramp('#141428', '#24264a', '#38407a', '#5a6aa8', '#94a8d8');
const LEAF = ramp('#1a2a14', '#2c4420', '#46622e', '#688a3e');
const COOK = ramp('#4a2c14', '#76481e', '#a06a30', '#c69048', '#e2b46c');
const RED = ramp('#3a0c0c', '#661816', '#922420', '#bc3a2c', '#dc6a4a');
const AMBER = ramp('#3a1a06', '#6a320a', '#a05414', '#cc7e22', '#f0b44a', '#fce49a');
const FUR = ramp('#3a3024', '#5e4e3a', '#867258', '#ae9a7c', '#d4c4a6', '#f0e8d6');

const DRAW: Record<string, (p: Pix) => void> = {
  handle(p) {
    // a hickory axe handle with a gnawed, splintered end
    for (let i = 0; i < 20; i++) { const x = 3 + i, y = 19 - Math.round(i * 0.72 + Math.sin(i * 0.35) * 1.2); blob(p, x, y, 2.6, 2.1, WOOD, { rot: -0.62 }); }
    for (const [x, y] of [[20, 4], [22, 3], [21, 6], [19, 3]]) p.set(x, y, WOOD[3]);
    for (let k = 0; k < 4; k++) p.set(17 + k, 7 - k, WOOD[0]);
    p.set(5, 18, WOOD[1]); p.set(9, 15, WOOD[1]);
  },
  jerky(p) {
    for (let i = 0; i < 18; i++) blob(p, 4 + i, 12 + Math.sin(i * 0.5) * 3, 3.2, 2.6, MEAT, { rot: Math.cos(i * 0.5) * 0.6 });
    for (let i = 0; i < 6; i++) p.set(5 + i * 3, 12 + Math.round(Math.sin((1 + i * 3) * 0.5) * 3), MEAT[4]);
    for (let i = 0; i < 9; i++) p.set(4 + ((i * 7) % 17), 10 + ((i * 5) % 5), hex('#1a1010'));
  },
  berries(p) {
    for (const [x, y, r] of [[8, 14, 4], [15, 15, 4.4], [11, 9, 3.6], [17, 9, 3.2], [12, 18, 3.4]] as const) blob(p, x, y, r, r, BERRY, { spec: true });
    for (const [x, y] of [[8, 13], [15, 14], [11, 8], [17, 8], [12, 17]]) { p.set(x, y, BERRY[0]); p.set(x + 1, y, BERRY[1]); }
    blob(p, 18, 4, 4, 1.8, LEAF, { rot: -0.5 });
  },
  beans(p) {
    box(p, 5, 6, 14, 15, TIN);
    for (let x = 5; x < 19; x++) { p.set(x, 7, TIN[0]); p.set(x, 19, TIN[0]); }
    box(p, 6, 10, 12, 7, RED);
    p.text('B', 9, 16, { size: 16, color: hex('#f0e0b0') });
    blob(p, 12, 5, 7, 2.2, TIN);
    for (const [x, y] of [[9, 4], [12, 5], [15, 4], [11, 3]]) blob(p, x, y, 1.6, 1.2, COOK);
  },
  moth(p) {
    const W1 = ramp('#3a3024', '#5e4e3a', '#867258', '#ae9a7c', '#cfc2a4');
    blob(p, 7, 10, 6, 4.5, W1, { rot: -0.5 }); blob(p, 17, 10, 6, 4.5, W1, { rot: 0.5 });
    blob(p, 8, 16, 4, 3.2, W1, { rot: 0.4 }); blob(p, 16, 16, 4, 3.2, W1, { rot: -0.4 });
    for (const [x, y] of [[6, 9], [18, 9]]) { blob(p, x, y, 2, 2, ramp('#1a1410', '#3a2a1c', '#d8c890')); }
    blob(p, 12, 13, 1.8, 6, FUR);
    p.line(11, 6, 8, 2, FUR[1]); p.line(13, 6, 16, 2, FUR[1]);
  },
  cookies(p) {
    for (const [x, y, r] of [[9, 15, 7], [15, 10, 6.5]] as const) {
      blob(p, x, y, r, r * 0.85, COOK);
      for (let k = 0; k < 7; k++) { const a = hash2(k, x, 3) * 6.28, d = hash2(k, y, 4) * r * 0.7; p.set(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.85), k % 2 ? COOK[0] : COOK[4]); }
    }
  },
  plaid(p) {
    // a lumberjack's red-and-black checked shirt, with a bite out of it
    for (let y = 4; y < 22; y++) for (let x = 4; x < 21; x++) {
      const sleeve = (y < 12 && (x < 7 || x > 17));
      if (!sleeve && (x < 7 || x > 17) && y >= 12) continue;
      const cx = Math.floor(x / 3) % 2, cy = Math.floor(y / 3) % 2;
      p.set(x, y, cx && cy ? hex('#1a1214') : cx || cy ? hex('#7a1a16') : hex('#b02a20'));
    }
    for (let y = 4; y < 9; y++) for (let x = 10; x < 15; x++) if (Math.abs(x - 12) + (y - 4) < 4) p.d[(y * S + x) * 4 + 3] = 0;
    for (const [x, y, r] of [[19, 16, 3], [20, 13, 2.6]] as const) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (i * i + j * j <= r * r) p.d[((y + j) * S + x + i) * 4 + 3] = 0;
    for (let y = 9; y < 21; y += 3) p.set(12, y, hex('#e0d0a0'));
  },
  bacon(p) {
    for (let i = 0; i < 20; i++) for (let j = 0; j < 9; j++) {
      const x = 2 + i, y = 8 + j + Math.round(Math.sin(i * 0.6) * 2);
      const fat = j === 2 || j === 6 || (j === 3 && i % 5 === 0);
      p.set(x, y, fat ? (j === 2 ? hex('#f0d8c0') : hex('#d8b49a')) : j < 2 ? MEAT[3] : MEAT[2 + ((i + j) % 2)]);
    }
  },
  syrup(p) {
    // a jug of dark maple syrup with a little handle
    blob(p, 11, 15, 7, 7, AMBER, { spec: true });
    box(p, 9, 3, 5, 6, AMBER.slice(1));
    box(p, 8, 2, 7, 2, TIN);
    for (let y = 9; y < 15; y++) { p.set(17, y, AMBER[1]); p.set(18, y, AMBER[1]); }
    p.set(17, 8, AMBER[1]);
    box(p, 7, 13, 9, 5, PAPER);
    for (let x = 8; x < 15; x += 2) p.set(x, 15, RED[2]);
  },
  feather(p) {
    for (let i = 0; i < 19; i++) {
      const x = 4 + i, y = 20 - i, w = i < 3 ? 0 : Math.min(4, 1 + Math.sin(i / 19 * 3.1) * 4);
      for (let k = -w; k <= w; k++) { const bar = Math.floor((i + Math.abs(k)) / 2) % 2; p.set(x + Math.round(k * 0.7), y + Math.round(k * 0.7), bar ? hex('#3a2a20') : hex('#d8ccb0')); }
      p.set(x, y, hex('#f0e8d8'));
    }
  },
  coffee(p) {
    // an enamel camp mug, chipped, steaming
    box(p, 5, 9, 12, 12, ramp('#14243a', '#203a5a', '#2e5480', '#4a74a4', '#86a6cc'));
    for (let x = 5; x < 17; x++) p.set(x, 9, hex('#e8eef4'));
    for (let y = 11; y < 18; y++) { p.set(18, y, hex('#2e5480')); p.set(19, y, hex('#203a5a')); }
    p.set(17, 11, hex('#2e5480')); p.set(17, 17, hex('#2e5480'));
    for (const [x, y] of [[8, 14], [13, 18], [6, 19]]) { p.set(x, y, hex('#e8eef4')); p.set(x + 1, y, hex('#10141a')); }
    for (let y = 2; y < 8; y++) { p.set(9 + Math.round(Math.sin(y) * 1.2), y, hex('#c8ccd4')); p.set(13 + Math.round(Math.cos(y) * 1.2), y + 1, hex('#a8acb4')); }
  },
  hare(p) {
    const H = ramp('#4a4a50', '#707078', '#9a9aa2', '#c4c4ca', '#e8e8ee');
    blob(p, 11, 15, 7, 5.5, H); blob(p, 17, 11, 4, 3.6, H);
    blob(p, 16, 5, 1.6, 4.5, H, { rot: -0.3 }); blob(p, 19, 5, 1.6, 4.5, H, { rot: 0.2 });
    blob(p, 5, 14, 2.4, 2.4, H);
    p.set(18, 10, hex('#120c0c')); p.set(20, 12, hex('#5a3c3c'));
    for (const x of [10, 13]) { p.set(x, 20, H[1]); p.set(x + 1, 20, H[1]); }
  },
  beer(p) {
    const G = ramp('#140c04', '#2a1808', '#4a2c0e', '#6a4416', '#8e6020');
    box(p, 8, 9, 8, 13, G); box(p, 10, 3, 4, 7, G); box(p, 9, 2, 6, 2, ramp('#8a6a20', '#c8a040', '#ecd078'));
    box(p, 8, 13, 8, 5, PAPER);
    for (let y = 10; y < 21; y++) p.set(9, y, G[4]);
  },
  bread(p) { blob(p, 12, 13, 9, 7, COOK, { spec: true }); for (const x of [8, 12, 16]) p.line(x - 1, 9, x + 1, 13, COOK[1]); },
  eggs(p) { for (const [x, y] of [[8, 14], [15, 13], [11, 9]]) blob(p, x, y, 4, 5, ramp('#8a7458', '#b49c7c', '#d8c4a4', '#f0e4cc', '#fffaf0'), { spec: true }); },
  mushroom(p) {
    blob(p, 12, 10, 8, 5, AMBER.slice(2), { spec: true });
    for (let y = 12; y < 21; y++) for (let x = 10 - Math.floor((y - 12) / 4); x < 15 + Math.floor((y - 12) / 4); x++) p.set(x, y, y < 14 ? AMBER[2] : AMBER[3 + ((x + y) & 1)]);
  },
  fish(p) {
    const F = ramp('#1c2a2a', '#324444', '#4e6662', '#728a80', '#a0b4a4', '#d0dcd0');
    blob(p, 11, 12, 8, 4.5, F, { spec: true });
    for (let y = -4; y <= 4; y++) for (let x = 0; x < 5 - Math.abs(y) * 0.5; x++) p.set(19 + x, 12 + y, F[2]);
    p.set(6, 11, hex('#0a0a0a')); for (let x = 7; x < 16; x += 2) p.set(x, 14, hex('#d06a58'));
  },
  unknown(p) {
    blob(p, 12, 12, 8, 7, ramp('#2a1c16', '#3e2a20', '#54392a'));
    p.text('?', 12, 18, { size: 16, align: 'center', color: hex('#d8c8a0') });
  },
};

const icons = new Map<string, Pix>();
export function icon(id: string): Pix {
  let p = icons.get(id);
  if (p) return p;
  p = new Pix(S, S);
  (DRAW[id] ?? DRAW.unknown)(p);
  outline(p, { selective: 0.3 });
  icons.set(id, p);
  return p;
}
export const ICON_IDS = Object.keys(DRAW);
