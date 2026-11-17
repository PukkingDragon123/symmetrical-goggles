// The head: a life-size skull loft with sculpted anatomy (Limbophobia's polar radius tables and faceRelief:
// brow ridge, eye sockets, cheekbones and the hollows under them, the muzzle and lips, chin, jaw corners,
// temples), a nose and ears built from points, eyelids on their own bone (blinks), the lower face weighted to a
// jaw bone (talking), hair shells, beards, a knit toque / caps with ear flaps, reading glasses on a chain and a
// carpenter's pencil behind the ear.
//
// Ported from src/limbo/entities/humanModel.ts head() / hair() / headwear() with Blobfish's beard shells.
import type { V3, Wt } from './loft';
import { Loft, usFor } from './loft';
import type { Dims } from './rig';
import { BI, ellRing, vOf, clamp01 } from './rig';
import type { HumanLook } from './looks';
import type { Shape } from './shape';
import { R, VMAP, subR } from './page';

// polar radius tables per height (head-local reference metres) at angles 0,22,45,70,95,125,155,180 deg from the face
const HA = [0, 22, 45, 70, 95, 125, 155, 180];
interface HeadRow { y: number; zc: number; r: number[] }
const HEAD_ROWS: HeadRow[] = [
  { y: -0.03, zc: -0.004, r: [0.052, 0.051, 0.049, 0.046, 0.045, 0.044, 0.044, 0.044] },
  { y: -0.013, zc: 0.006, r: [0.086, 0.078, 0.062, 0.055, 0.054, 0.05, 0.047, 0.047] },
  { y: 0.008, zc: 0.006, r: [0.096, 0.089, 0.072, 0.066, 0.064, 0.061, 0.064, 0.067] },
  { y: 0.033, zc: 0.006, r: [0.099, 0.091, 0.076, 0.07, 0.068, 0.07, 0.079, 0.083] },
  { y: 0.058, zc: 0.006, r: [0.101, 0.094, 0.081, 0.074, 0.072, 0.078, 0.091, 0.096] },
  { y: 0.078, zc: 0.006, r: [0.099, 0.095, 0.086, 0.077, 0.074, 0.082, 0.098, 0.103] },
  { y: 0.096, zc: 0.006, r: [0.098, 0.094, 0.086, 0.078, 0.075, 0.084, 0.1, 0.106] },
  { y: 0.114, zc: 0.006, r: [0.1, 0.098, 0.088, 0.078, 0.076, 0.085, 0.1, 0.106] },
  { y: 0.143, zc: 0.004, r: [0.096, 0.093, 0.086, 0.077, 0.076, 0.084, 0.098, 0.104] },
  { y: 0.173, zc: 0.0, r: [0.083, 0.081, 0.076, 0.071, 0.069, 0.075, 0.086, 0.09] },
  { y: 0.199, zc: -0.004, r: [0.056, 0.055, 0.053, 0.05, 0.049, 0.052, 0.058, 0.06] },
];
export const HEAD_ANG = [-180, -155, -125, -95, -70, -45, -22, 0, 22, 45, 70, 95, 125, 155, 180];
// the sculpted head: rows and columns crowd round the eyes, nose and mouth
const FACE_ROWS = [-0.03, -0.015, 0.003, 0.012, 0.02, 0.028, 0.0335, 0.0375, 0.0425, 0.048, 0.055, 0.062, 0.07, 0.077, 0.084, 0.09, 0.095, 0.0995, 0.104, 0.108, 0.113, 0.118, 0.126, 0.134, 0.144, 0.156, 0.17, 0.185, 0.2];
const FACE_ANG = [-180, -160, -140, -122, -108, -96, -86, -76, -66, -57, -48, -40, -33, -27, -21, -15, -9, -4.5, 0, 4.5, 9, 15, 21, 27, 33, 40, 48, 57, 66, 76, 86, 96, 108, 122, 140, 160, 180];

function headR(row: HeadRow, deg: number): number {
  const a = Math.abs(deg);
  for (let i = 0; i + 1 < HA.length; i++) {
    if (a <= HA[i + 1]) {
      const t = (a - HA[i]) / (HA[i + 1] - HA[i]);
      const st = t * t * (3 - 2 * t);
      return row.r[i] + (row.r[i + 1] - row.r[i]) * (0.5 * t + 0.5 * st);
    }
  }
  return row.r[row.r.length - 1];
}
function sampleHead(y: number): HeadRow {
  const Rw = HEAD_ROWS;
  if (y <= Rw[0].y) return Rw[0];
  if (y >= Rw[Rw.length - 1].y) return Rw[Rw.length - 1];
  for (let i = 0; i + 1 < Rw.length; i++) {
    const a = Rw[i], b = Rw[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      // smooth (Catmull-like) blend between rows so the face does not facet into bands
      const st = t * t * (3 - 2 * t);
      const tt = 0.4 * t + 0.6 * st;
      return { y, zc: a.zc + (b.zc - a.zc) * tt, r: a.r.map((v, j) => v + (b.r[j] - v) * tt) };
    }
  }
  return Rw[0];
}

/** eye layout (head-local) shared with the painter */
export const EYE = { y: 0.099, a: 17.5, w: 8.5 };
export const MOUTH_Y = 0.0375;

const g = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
/**
 * Anatomy laid over the base skull (radial offset, head-local metres): brow ridge, eye sockets with the eyeball
 * bulging under the lids, cheekbones and the hollows under them, the nasolabial fold, the muzzle over the teeth,
 * the lips and the line between them, the dip under the lower lip, chin, jaw corners and temples.
 */
export function faceRelief(y: number, deg: number, L: HumanLook): number {
  const a = Math.abs(deg);
  if (a > 112 || y < -0.035 || y > 0.15) return 0;
  const fem = L.build.fem, masc = 1 - fem, F = L.face;
  const old = L.age;
  let r = 0;
  r += (0.0035 + 0.0035 * masc) * F.brow * 0.85 * g(y, 0.116, 0.0062) * (a < 46 ? 1 : g(a, 46, 11)) * (0.75 + 0.25 * g(a, 20, 12));
  r -= 0.0013 * g(y, 0.108, 0.006) * g(a, 0, 5);
  r -= 0.0095 * g(y, 0.1, 0.0068) * g(a, EYE.a, 8.5);
  r += 0.0038 * g(y, 0.0985, 0.0034) * g(a, EYE.a, 5.5);
  // bags under old eyes
  r += 0.0012 * old * g(y, 0.089, 0.003) * g(a, EYE.a + 2, 6);
  r += (0.0042 + 0.0012 * fem) * F.cheek * g(y, 0.077, 0.0085) * g(a, 43, 12);
  r -= (0.0018 + 0.004 * F.hollow) * g(y, 0.05, 0.011) * g(a, 47, 13);
  r -= (0.0016 + 0.0012 * old) * g(y, 0.052 - (a - 22) * 0.0006, 0.004) * g(a, 24, 6);
  r += 0.0028 * g(y, 0.04, 0.018) * g(a, 0, 25);
  const full = F.lips;
  r += (0.0026 + 0.0012 * fem) * full * g(y, 0.0455, 0.0042) * g(a, 0, 13);
  r += (0.0032 + 0.0014 * fem) * full * g(y, 0.0305, 0.0045) * g(a, 0, 11);
  r -= 0.0032 * g(y, MOUTH_Y, 0.0022) * g(a, 0, 15);
  r -= 0.0024 * g(y, 0.02, 0.0038) * g(a, 0, 12);
  r += (0.0032 + 0.0022 * masc) * F.chin * g(y, 0.006, 0.0085) * g(a, 0, 13);
  r += 0.003 * masc * F.jaw * g(y, 0.006, 0.01) * g(a, 74, 9);
  r -= 0.0026 * g(y, 0.124, 0.014) * g(a, 74, 12);
  return r;
}

export interface HeadShape {
  L: Look; d: Dims; hs: number; hp: V3;
  skull(y: number, deg: number, off?: number, relief?: boolean): V3;
  /** head-local reference -> body space */
  tr(p: V3): V3;
}
type Look = HumanLook;

export function headShape(L: HumanLook, d: Dims): HeadShape {
  const hs = d.hs, hp = d.rest.head;
  const fem = L.build.fem, F = L.face;
  const jaw = (1 - fem * 0.12) * F.jaw, chin = (1 - fem * 0.06) * F.chin;
  const tweak = (row: HeadRow, deg: number) => {
    let r = headR(row, deg);
    const a = Math.abs(deg);
    const lowFace = row.y < 0.05 ? 1 - Math.max(0, row.y) / 0.05 : 0;
    if (a >= 30 && a <= 110) r *= 1 + (jaw - 1) * lowFace;
    if (a < 30) r *= 1 + (chin - 1) * lowFace;
    if (row.y > 0.06 && row.y < 0.1 && a > 15 && a < 70) r *= 1 + (F.cheek - 1) * 0.5;
    if (F.hollow && row.y > 0.02 && row.y < 0.065 && a > 25 && a < 80) r *= 1 - 0.04 * F.hollow * Math.sin(((row.y - 0.02) / 0.045) * Math.PI);
    if (F.wide !== 1 && a > 20 && a < 160) r *= 1 + (F.wide - 1) * Math.sin((a * Math.PI) / 180);
    return r;
  };
  const longY = (y: number) => (F.long !== 1 && y < 0.07 ? 0.07 + (y - 0.07) * F.long : y);
  const skull = (y: number, deg: number, off = 0, relief = true): V3 => {
    const row = sampleHead(y);
    const t = (deg * Math.PI) / 180;
    const r = tweak(row, deg) + off + (relief ? faceRelief(y, deg, L) : 0);
    return [Math.sin(t) * r, y, row.zc + Math.cos(t) * r];
  };
  return { L, d, hs, hp, skull, tr: (p) => [hp[0] + p[0] * hs, hp[1] + longY(p[1]) * hs, hp[2] + p[2] * hs] };
}

/** the head-region uv of a head-local point (cylindrical projection, as the skull rings map) */
function headUV(p: V3): [number, number] {
  const reg = R('HEAD');
  const a = Math.atan2(p[0], p[2] - 0.006) / (Math.PI * 2) + 0.5;
  return [reg.x + a * reg.w, reg.y + (1 - vOf(VMAP.HEAD, p[1])) * reg.h];
}

/** jaw weight of a head-local point: the chin and lower lip ride the jaw bone */
export function jawW(y: number, deg: number): number {
  const a = Math.abs(deg);
  if (a > 100) return 0;
  const below = clamp01((MOUTH_Y - 0.001 - y) / 0.008);
  const side = clamp01((96 - a) / 34);
  return below * side * (y < 0.0 ? 0.85 : 1);
}

// ------------------------------------------------------------------ head build
export function buildHead(B: Loft, S: HeadShape, sh: Shape) {
  const { L, tr, skull } = S;
  const H = BI.head, J = BI.jaw;
  const wHead = (y: number, deg: number, base: Wt = [H, 1]): Wt => {
    const j = jawW(y, deg);
    return j > 0 ? [...base.map((v, i) => (i & 1 ? v * (1 - j) : v)), J, j] : base;
  };
  const us = FACE_ANG.map((a) => 0.5 + a / 360);
  const rings = FACE_ROWS.map((y, i) => ({
    pts: FACE_ANG.map((a) => tr(skull(y, a))), v: vOf(VMAP.HEAD, y),
    w: (_p: V3, j: number) => wHead(y, FACE_ANG[j], i === 0 ? [H, 0.7, BI.neck, 0.3] : [H, 1]),
  }));
  B.loft(rings, us, R('HEAD'), 70, { end: tr([0, 0.215, -0.006]), endW: [H, 1], endV: 1, start: tr([0, -0.034, -0.01]), startW: [H, 0.45, BI.neck, 0.25, J, 0.3], startV: 0, alt: true });

  const vP = (lp: V3, gg: number, w?: Wt) => { const [u, v] = headUV(lp); return B.vert(tr(lp), u, v, w ?? wHead(lp[1], (Math.atan2(lp[0], lp[2]) * 180) / Math.PI), gg); };
  const centre = tr([0, 0.08, 0.0]);

  // ---------------- nose: root between the brows, a bridge, the tip, the wings round the nostrils, the columella
  {
    const NK = L.face.nose, fem = L.build.fem;
    const sf = (y: number, deg = 0) => skull(y, deg)[2];
    const sx = (y: number, deg: number) => skull(y, deg)[0];
    const nw = 0.0155 * NK.w * (1 - fem * 0.12) * (1 + NK.bulb * 0.25);
    const Ln = 0.022 * NK.len * (1 - fem * 0.15);
    const cx = NK.crook, bulb = NK.bulb;
    const P: V3[] = [
      [0, 0.106, sf(0.106) + 0.001],                                                          // root
      [nw * 0.42, 0.094, sf(0.094, 6) + 0.002], [-nw * 0.42, 0.094, sf(0.094, -6) + 0.002],  // brL brR
      [cx * 0.5, 0.08, sf(0.08) + Ln * 0.38 + NK.bump],                                       // ridge
      [cx, 0.062, sf(0.062) + Ln * (0.92 + bulb * 0.05)],                                    // tipT
      [cx, 0.056, sf(0.056) + Ln * (1 + bulb * 0.08)],                                       // tip
      [cx + nw * (0.42 + bulb * 0.15), 0.057, sf(0.057) + Ln * (0.8 + bulb * 0.06)], [cx - nw * (0.42 + bulb * 0.15), 0.057, sf(0.057) + Ln * (0.8 + bulb * 0.06)],
      [cx * 0.7 + nw * 0.62, 0.074, sf(0.074, 9) + Ln * 0.25], [cx * 0.7 - nw * 0.62, 0.074, sf(0.074, -9) + Ln * 0.25],
      [cx * 0.4 + nw * 1.05, 0.054, Math.max(sf(0.054, 12) + 0.002, sf(0.054) + Ln * 0.22)], [cx * 0.4 - nw * 1.05, 0.054, Math.max(sf(0.054, -12) + 0.002, sf(0.054) + Ln * 0.22)],
      [sx(0.05, 10) * 0.6 + cx * 0.3, 0.049, sf(0.049, 8) + 0.002], [sx(0.05, -10) * 0.6 + cx * 0.3, 0.049, sf(0.049, -8) + 0.002],
      [cx * 0.8, 0.05, sf(0.05) + Ln * 0.5],                                                  // columella
    ];
    const [RT, BL, BR, RG, TT, TP, TL, TR, SL, SR, AL, AR, NL, NR, CO] = P.map((p) => vP(p, 80, [H, 1]));
    const ins = tr([0, 0.075, sf(0.075) - 0.03]);
    const T = (a: number, b: number, c: number) => B.triOut(a, b, c, ins);
    T(RT, BL, RG); T(RT, RG, BR); T(BL, SL, RG); T(BR, RG, SR);
    T(RG, SL, TT); T(RG, TT, SR); T(SL, TL, TT); T(SR, TT, TR); T(TT, TL, TP); T(TT, TP, TR);
    T(SL, AL, TL); T(SR, TR, AR); T(TL, AL, CO); T(TR, CO, AR); T(TL, CO, TP); T(TR, TP, CO);
    T(AL, NL, CO); T(AR, CO, NR); T(BL, AL, SL); T(BR, SR, AR); T(BL, NL, AL); T(BR, AR, NR);
  }
  // ---------------- ears: a rim (helix) curling back from the side of the head, the bowl, a lobe; both faces
  const hidden = L.hat.kind === 'capFlaps';
  for (const k of hidden ? [] : [1, -1]) {
    const a = k * 95;
    const es = L.face.ears * (1 + L.age * 0.1), ym = 0.08;
    const Y = (y: number) => ym + (y - ym) * es;
    const out = 0.014 * es;
    const base = (y: number, back: number) => skull(Y(y), a - k * back, -0.002, false);
    const rim = (y: number, o: number, back: number): V3 => { const p = skull(Y(y), a - k * back, 0, false); return [p[0] + k * o, p[1], p[2]]; };
    const pts: V3[] = [
      base(0.104, 2), base(0.082, 0), base(0.058, 2),
      rim(0.111, out * 0.6, 9), rim(0.107, out * 0.92, 19), rim(0.092, out * 1.05, 25), rim(0.07, out * 0.95, 23), rim(0.054, out * 0.6, 13),
      rim(0.09, out * 0.42, 12), rim(0.073, out * 0.4, 11),
      rim(0.046, out * 0.32, 6),
    ];
    const Fv = pts.map((p) => vP(p, -1, [H, 1])), Bk = pts.map((p) => vP(p, -1, [H, 1]));
    const tris = [[0, 3, 8], [3, 4, 8], [4, 5, 8], [8, 5, 9], [5, 6, 9], [6, 7, 9], [9, 7, 2], [8, 9, 1], [0, 8, 1], [1, 9, 2], [2, 7, 10]];
    const outside = tr([k * 0.2, 0.08, 0.02]);
    for (const t of tris) { B.triOut(Fv[t[0]], Fv[t[1]], Fv[t[2]], centre); B.triOut(Bk[t[0]], Bk[t[1]], Bk[t[2]], outside); }
  }
  // ---------------- eyelids: skin shells on the lids bone, collapsed under the brow until a blink scales them down
  {
    const reg = R('LIDS');
    for (const k of [1, -1]) {
      const cols = [EYE.a - 8.5, EYE.a - 5.5, EYE.a - 2.5, EYE.a, EYE.a + 2.5, EYE.a + 5.5, EYE.a + 8.5].map((a) => k * a);
      const rowsY = [0.1075, 0.1, 0.092];
      const ids = rowsY.map((y, ri) => cols.map((a, ci) => {
        const edge = ci === 0 || ci === cols.length - 1 ? 0 : 1;
        const p = tr(skull(y, a, 0.0012 + edge * (0.0016 + (ri === 1 ? 0.0012 : 0))));
        return B.vert(p, reg.x + (k > 0 ? 0.5 + ci / 13 : 0.5 - ci / 13) * reg.w, reg.y + (ri / 2) * reg.h * 0.9 + 0.05 * reg.h, [BI.lids, 1], 90);
      }));
      for (let r = 0; r < 2; r++) for (let c = 0; c < cols.length - 1; c++) {
        B.triOut(ids[r][c], ids[r + 1][c], ids[r + 1][c + 1], centre); B.triOut(ids[r][c], ids[r + 1][c + 1], ids[r][c + 1], centre);
      }
    }
  }
  buildFacialHair(B, S);
  buildHair(B, S);
  buildHat(B, S);
  if (L.glasses !== 'none') buildGlasses(B, S, sh);
  if (L.extras?.pencil) buildPencil(B, S);
}

// ------------------------------------------------------------------ hair
/** the hat line: hair above it is hidden under the hat (head-local y), by angle */
export function hatLine(L: HumanLook, deg: number): number {
  const a = Math.abs(deg);
  switch (L.hat.kind) {
    case 'toque': case 'toquePom': return a < 50 ? 0.142 : 0.12 - (a > 120 ? 0.01 : 0);
    case 'cap': return a < 60 ? 0.156 : 0.132 - (a > 120 ? 0.012 : 0);
    case 'capFlaps': return a < 60 ? 0.156 : 0.05;
    default: return 99;
  }
}
/** the hairline by angle (head-local y): front, temple, over the ear, nape */
export function hairLine(L: HumanLook, deg: number): number {
  const a = Math.abs(deg);
  const st = L.hair.style;
  let front = 0.153, temple = 0.132, side = 0.11, back = 0.02;
  if (st === 'receding') { front = 0.19; temple = 0.168; side = 0.1; back = 0.035; }
  if (st === 'thin') { front = 0.18; temple = 0.16; side = 0.1; back = 0.03; }
  if (st === 'crew') { side = 0.112; back = 0.03; }
  if (st === 'shaggy') { side = 0.075; back = -0.05; temple = 0.125; }
  if (st === 'ponytail') { front = 0.152; temple = 0.13; side = 0.09; back = 0.0; }
  if (a < 22) return front;
  if (a < 58) return front + (temple - front) * ((a - 22) / 36);
  if (a < 105) return temple + (side - temple) * ((a - 58) / 47);
  return side + (back - side) * Math.min(1, (a - 105) / 55);
}

function buildHair(B: Loft, S: HeadShape) {
  const { L, tr, skull } = S;
  const st = L.hair.style;
  if (st === 'bald') return;
  const H = BI.head;
  const hat = L.hat.kind !== 'none';
  const thick = st === 'crew' || st === 'thin' ? 0.003 : st === 'receding' ? 0.004 : st === 'shaggy' ? 0.012 : st === 'ponytail' ? 0.006 : 0.007;
  const ys = [-0.08, -0.04, -0.01, 0.02, 0.05, 0.08, 0.105, 0.13, 0.155, 0.178, 0.198];
  const minY = Math.min(...HEAD_ANG.map((a) => hairLine(L, a)));
  const rowYs = ys.filter((y) => y >= minY - 0.03);
  const us = HEAD_ANG.map((a) => 0.5 + a / 360);
  const hh = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7 + (L.seed & 255) * 0.37) * 43758.5453; return x - Math.floor(x); };
  const nA = HEAD_ANG.length - 1;
  const rings = rowYs.map((y, ri) => {
    const pts = HEAD_ANG.map((a, ci) => {
      const cj = ci % nA;
      let yy = Math.max(y, hairLine(L, a));
      if (ri === 0 && Math.abs(a) < 175 && (cj & 1) && st === 'shaggy') yy -= 0.012;
      const yc = Math.min(yy, hat ? hatLine(L, a) + 0.006 : 99);
      const edge = 0.3 + 0.7 * clamp01((yc - hairLine(L, a)) / 0.03);
      const clump = (hh(ri, cj) - 0.35) * (st === 'shaggy' ? 0.008 : 0.003) * clamp01((yc - hairLine(L, a) + 0.01) / 0.03);
      const p = skull(yc, a, thick * edge + clump + (yc > 0.13 ? 0.002 : 0), false);
      return tr(p);
    });
    return { pts, v: vOf(VMAP.HAIR, y), w: [H, 1] as Wt };
  });
  const capOff = hat ? null : tr([0, 0.215 + thick + 0.001, -0.008]);
  B.loft(rings, us, R('HAIR'), 110, { end: capOff, endW: [H, 1], endV: 1, alt: true });
  // the ponytail: gathered at the back of the head, hanging between the shoulder blades
  if (st === 'ponytail') {
    const top = skull(0.075, 180, 0.012, false);
    const path: V3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      path.push([top[0], top[1] - t * 0.24, top[2] - 0.012 - Math.sin(t * Math.PI * 0.6) * 0.02 + t * 0.03]);
    }
    const pw = (t: number): Wt => (t < 0.2 ? [H, 1] : t < 0.6 ? [H, 1 - (t - 0.2) * 1.5, BI.neck, (t - 0.2) * 1.5] : [BI.neck, 0.6, BI.chest, 0.4]);
    B.tube(path.map(tr), (t) => S.hs * (t < 0.08 ? 0.012 : 0.016 * (1 - t * 0.55) + 0.004), 8, subR(R('HAIR'), 0, 0, 0.2, 0.3), 113, { w: (t) => pw(t), capEnd: true });
  }
}

// ------------------------------------------------------------------ facial hair
function buildFacialHair(B: Loft, S: HeadShape) {
  const { L, tr, skull } = S;
  const fh = L.facial;
  const H = BI.head, J = BI.jaw;
  const reg = R('BEARD');
  const sk = (y: number, a: number, off: number) => skull(y, a, off, true);
  if (fh === 'beard' || fh === 'fullBeard') {
    const big = fh === 'fullBeard';
    const ang = [-100, -88, -76, -64, -52, -40, -28, -16, -6, 0, 6, 16, 28, 40, 52, 64, 76, 88, 100];
    const ys = big ? [0.062, 0.05, 0.036, 0.022, 0.008, -0.008, -0.026, -0.046, -0.07, -0.095] : [0.058, 0.046, 0.032, 0.018, 0.004, -0.012, -0.03, -0.045];
    const top = (a: number) => {
      const aa = Math.abs(a);
      // leave the lips: the beard starts under the lower lip in front, rises along the cheeks to the sideburns
      return aa < 14 ? 0.024 : aa < 28 ? 0.026 + (aa - 14) * 0.0011 : aa < 70 ? 0.046 + (aa - 28) * 0.0005 + (aa > 40 ? (aa - 40) * 0.0012 : 0) : 0.105;
    };
    const rr = ys.map((y, i) => {
      const t = i / (ys.length - 1);
      const pts = ang.map((a, ci) => {
        const aa = Math.abs(a);
        const yy = Math.min(y, top(a));
        let p: V3;
        if (yy > -0.025) {
          const off = (big ? 0.009 : 0.005) + (yy < 0.01 ? (big ? 0.01 : 0.004) : 0) + (aa < 30 && yy < 0.012 ? (big ? 0.007 : 0.004) : 0) + (yy >= top(a) - 0.001 ? -0.003 : 0);
          p = sk(yy, a, off);
        } else {
          // below the chin the beard hangs forward of the throat
          const base = sk(-0.025, a, big ? 0.019 : 0.009);
          const drop = -0.025 - yy;
          const narrow = 1 - clamp01(drop / (big ? 0.08 : 0.04)) * (big ? 0.42 : 0.7);
          p = [base[0] * narrow, yy, base[2] * (0.78 + 0.22 * narrow) + drop * (big ? 0.42 : 0.25) * Math.cos((a * Math.PI) / 180)];
        }
        if (i === ys.length - 1) { const jj = ((ci * 7919) % 13) / 13; p = [p[0], p[1] - jj * (big ? 0.016 : 0.008), p[2]]; }
        return tr(p);
      });
      const jw = clamp01((0.03 - y) / 0.02);
      return { pts, v: 1 - t * 0.94, w: [H, 1 - jw * 0.8, J, jw * 0.8] as Wt };
    });
    const uu = ang.map((_, i) => i / (ang.length - 1));
    const breg = subR(reg, 0, 0, 1, 0.75);
    B.loft(rr, uu, breg, 100, { alt: true });
    B.loft(rr.map((r) => ({ ...r, c: 0.55 })), uu, breg, 101, { flip: true });
  }
  if (fh === 'moustache' || fh === 'walrus' || fh === 'beard' || fh === 'fullBeard') {
    const walrus = fh === 'walrus' || fh === 'fullBeard';
    const ang = walrus ? [-36, -27, -18, -9, 0, 9, 18, 27, 36] : [-28, -19, -10, 0, 10, 19, 28];
    const drop = (a: number) => (walrus ? Math.max(0, Math.abs(a) - 12) * 0.00075 : Math.abs(a) * 0.0003);
    const rows = walrus ? [0.0535, 0.047, 0.038, 0.031] : [0.052, 0.045, 0.039];
    const rr = rows.map((y, i) => ({
      pts: ang.map((a) => tr(sk(y - drop(a) * (i / (rows.length - 1)) * 1.5, a, (walrus ? 0.0055 : 0.004) + (i === 1 ? 0.0025 : i === 2 ? 0.0018 : 0)))),
      v: 1 - i / (rows.length - 1), w: [H, 1] as Wt,
    }));
    const uu = ang.map((_, i) => i / (ang.length - 1));
    const mreg = subR(reg, 0, 0.78, 1, 1);
    B.loft(rr, uu, mreg, 102, {});
    B.loft(rr.map((r) => ({ ...r, c: 0.55 })), uu, mreg, 103, { flip: true });
  }
}

// ------------------------------------------------------------------ hats
function buildHat(B: Loft, S: HeadShape) {
  const { L, tr, skull } = S;
  const k = L.hat.kind;
  if (k === 'none') return;
  const H = BI.head;
  const reg = R('HAT');
  const ang = HEAD_ANG;
  const us = ang.map((a) => 0.5 + a / 360);
  if (k === 'toque' || k === 'toquePom') {
    // knit toque: a folded cuff band over the brow and ears, the crown slouching a little to the back
    const line = (a: number) => hatLine(L, a);
    const rows: { y: number; off: number; v: number }[] = [];
    const nC = 4;
    for (let i = 0; i <= nC; i++) rows.push({ y: i / nC, off: i === 0 ? 0.008 : 0.013 + (i === nC ? -0.002 : 0), v: (i / nC) * 0.32 });
    for (const [t, off] of [[0.0, 0.0085], [0.25, 0.0085], [0.5, 0.009], [0.75, 0.01], [0.92, 0.009]] as [number, number][]) rows.push({ y: 1 + t, off, v: 0.34 + t * 0.66 });
    const ringAt = (row: { y: number; off: number }, a: number): V3 => {
      const l = line(a);
      if (row.y <= 1) { const y = l + row.y * 0.038; return skull(y, a, row.off + 0.002, false); }
      const t = row.y - 1;
      const y = l + 0.038 + t * (0.212 - l - 0.038);
      const p = skull(Math.min(0.205, y), a, row.off + 0.003 + t * 0.006, false);
      // slouch: the crown leans back
      return [p[0] * (1 - t * 0.12), p[1] + t * 0.012, p[2] - t * t * 0.02];
    };
    const rr = rows.map((row) => ({ pts: ang.map((a) => tr(ringAt(row, a))), v: row.v, w: [H, 1] as Wt }));
    const topP = tr([0, 0.236, -0.022]);
    B.loft(rr, us, reg, 120, { end: topP, endW: [H, 1], endV: 1, alt: true });
    // the underside of the cuff, so the band has a lip
    B.loft([rr[0], { ...rr[0], pts: ang.map((a) => tr(skull(line(a), a, 0.0015, false))), c: 0.5 }], us, subR(reg, 0, 0, 1, 0.04), 121, {});
    if (k === 'toquePom') {
      const c: V3 = [0, 0.245, -0.026];
      const n = 10;
      const prow = [-0.022, -0.016, -0.006, 0.006, 0.016, 0.022];
      const rr2 = prow.map((dy, i) => {
        const r = Math.sqrt(Math.max(0, 0.024 * 0.024 - dy * dy)) + 0.002;
        return { pts: ellRing(c[1] + dy, c[0], c[2], r, r, r, n, 2, 1, (th) => 0.12 * Math.sin(th * 5 + i * 1.7)).map(tr), v: i / (prow.length - 1), w: [H, 1] as Wt };
      });
      B.loft(rr2, usFor(n), subR(R('EXTRA'), 0, 0, 1, 0.3), 122, { start: tr([c[0], c[1] - 0.025, c[2]]), end: tr([c[0], c[1] + 0.025, c[2]]) });
    }
    return;
  }
  // caps: a six-panel crown and a curved bill (hunter's cap also drops its ear flaps)
  const line = (a: number) => (Math.abs(a) < 60 ? 0.15 : 0.128 - (Math.abs(a) > 120 ? 0.012 : 0));
  const rows = [0, 0.2, 0.45, 0.7, 0.88];
  const rr = rows.map((t, i) => ({
    pts: ang.map((a) => { const l = line(a); const y = l + t * (0.21 - l); return tr(skull(Math.min(0.205, y), a, 0.006 + (i === 0 ? 0.001 : 0.004), false)); }),
    v: 0.12 + t * 0.85, w: [H, 1] as Wt,
  }));
  B.loft(rr, us, subR(reg, 0, 0, 0.75, 1), 120, { end: tr([0, 0.222, -0.006]), endW: [H, 1], endV: 1, alt: true });
  // the bill: a sheet from the brow forward, curved down at the sides, top and underside
  const bA = [-58, -44, -30, -15, 0, 15, 30, 44, 58];
  const bill: V3[][] = [];
  for (const reach of [0, 0.03, 0.06, 0.075]) {
    bill.push(bA.map((a) => {
      const p = skull(0.15, a, 0.007, false);
      const dir = [Math.sin((a * Math.PI) / 180), 0, Math.cos((a * Math.PI) / 180)];
      const curve = Math.abs(a) / 58;
      return tr([p[0] + dir[0] * reach * 0.6, p[1] - reach * 0.12 - curve * curve * reach * 0.25, p[2] + reach]);
    }));
  }
  const breg = subR(reg, 0.76, 0, 1, 1);
  for (const side of [0, 1]) {
    const rings = bill.map((pts, i) => ({ pts: pts.map((p): V3 => [p[0], p[1] - side * 0.0035 * S.hs, p[2]]), v: i / 3, w: [H, 1] as Wt, c: side ? 0.55 : 1 }));
    B.loft(rings, bA.map((_, i) => i / (bA.length - 1)), breg, 123 + side, { flip: side === 1, inside: () => tr([0, side ? 0.3 : -0.3, 0.12]) });
  }
  if (k === 'capFlaps') {
    // folded-down ear flaps: double-sided panels over the ears and the back of the neck
    const fA = [-150, -125, -100, -80, 80, 100, 125, 150];
    for (const sd of [1, -1]) {
      const cols = fA.filter((a) => Math.sign(a) === sd).sort((a, b) => a - b);
      const rowsF = [0.13, 0.1, 0.07, 0.045, 0.03];
      const rings = rowsF.map((y, i) => ({ pts: cols.map((a) => tr(skull(y, a, 0.012 + i * 0.002, false))), v: 1 - i / (rowsF.length - 1), w: [H, 1] as Wt }));
      const fr = subR(reg, 0, 0, 0.2, 0.3);
      B.loft(rings, cols.map((_, i) => i / (cols.length - 1)), fr, 125, { inside: () => tr([0, 0.08, 0]) });
      B.loft(rings.map((r) => ({ ...r, c: 0.5 })), cols.map((_, i) => i / (cols.length - 1)), fr, 126, { flip: true, inside: () => tr([0, 0.08, 0]) });
    }
  }
}

// ------------------------------------------------------------------ glasses + chain
function buildGlasses(B: Loft, S: HeadShape, _sh: Shape) {
  const { L, tr, skull } = S;
  const H = BI.head;
  const metal = subR(R('EXTRA'), 0, 0.32, 0.5, 0.62);
  const hs = S.hs;
  // reading glasses ride low on the nose: half-moon rims under the eyes' centre line
  const ey = EYE.y - 0.012;
  const r0 = 0.0013 * (1 / hs) * hs;
  for (const k of [1, -1]) {
    const c = skull(ey, k * EYE.a, 0.012, false);
    const rim: V3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = -0.15 + (i / 14) * (Math.PI + 0.3);
      // half-moon: flat top bar, round bottom
      const x = Math.cos(t) * 0.022, y = -Math.sin(t) * 0.014;
      rim.push(tr([c[0] + x * Math.cos((k * EYE.a * Math.PI) / 180), c[1] + Math.min(0.002, y), c[2] - x * Math.sin((k * EYE.a * Math.PI) / 180) * 0.6]));
    }
    rim.push(rim[0]);
    B.tube(rim, () => r0 * hs * 1.3, 4, metal, 130, { w: () => [H, 1] });
    // temple arm from the outer rim back to above the ear
    const outer = rim[k > 0 ? 0 : 14];
    const ear = tr(skull(0.098, k * 92, 0.004, false));
    const back = tr(skull(0.09, k * 112, 0.002, false));
    B.tube([outer, ear, back], () => r0 * hs * 1.1, 4, metal, 131, { w: () => [H, 1] });
  }
  // the bridge over the nose
  const bl = tr(skull(ey + 0.004, 9, 0.016, false)), br = tr(skull(ey + 0.004, -9, 0.016, false)), bm = tr(skull(ey + 0.006, 0, 0.022, false));
  B.tube([bl, bm, br], () => r0 * hs * 1.2, 4, metal, 132, { w: () => [H, 1] });
  // the chain: from the temple tips, slack round the back of the neck
  if (L.glasses === 'readingChain') {
    const chainReg = subR(R('EXTRA'), 0.5, 0.32, 1, 0.62);
    const d = S.d;
    const path: V3[] = [];
    const nk = d.rest.neck, s = d.s;
    const n = 16;
    const tipL = tr(skull(0.09, 112, 0.003, false)), tipR = tr(skull(0.09, -112, 0.003, false));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = Math.PI * (0.18 + 0.64 * t); // round the back
      const rr = 0.07 * s;
      const hang = Math.sin(t * Math.PI);
      const p: V3 = [Math.cos(a) * rr * 1.05, nk[1] + 0.01 * s - hang * 0.035 * s, -Math.sin(a) * rr - 0.012 * s];
      path.push(p);
    }
    const full: V3[] = [tipL, [tipL[0] * 0.95, tipL[1] - 0.05 * s, tipL[2] - 0.01 * s], ...path, [tipR[0] * 0.95, tipR[1] - 0.05 * s, tipR[2] - 0.01 * s], tipR];
    B.tube(full, () => 0.0011 * s, 3, chainReg, 133, { w: (t) => (t < 0.12 || t > 0.88 ? [H, 1] : [BI.neck, 0.6, BI.chest, 0.4]) });
  }
}

/** a flat carpenter's pencil tucked behind the right ear */
function buildPencil(B: Loft, S: HeadShape) {
  const { tr, skull } = S;
  const a = -96;
  const p0 = skull(0.118, a - 4, 0.012, false), p1 = skull(0.075, a - 22, 0.012, false);
  const front: V3 = [p0[0] - 0.004, p0[1] + 0.025, p0[2] + 0.04];
  const back: V3 = [p1[0] - 0.002, p1[1] - 0.02, p1[2] - 0.02];
  const midP: V3 = [(front[0] + back[0]) / 2, (front[1] + back[1]) / 2, (front[2] + back[2]) / 2];
  const path: V3[] = [tr(front), tr(midP), tr(back)];
  B.tube(path, (t) => S.hs * (t < 0.12 ? 0.0012 + t * 0.03 : 0.0045), 6, subR(R('EXTRA'), 0, 0.64, 1, 1), 134, { w: () => [BI.head, 1], capEnd: true, capStart: true });
}
