// Bush-country clothing, painted as high-resolution pixel art onto each person's page: buffalo-check and tartan
// flannel (woven checks with twill hatching and darker overlap squares), waxed-canvas chore jackets with a
// corduroy collar and blanket lining, quilted and blaze-orange vests, a cardigan with suede elbow patches,
// jeans with topstitching, rivets and wear, wool trousers, stained coveralls, suspenders, belts, a shop apron,
// leather work gloves with stitched seams and worn palms, lug-soled logger boots with speed hooks and grey
// work socks, knit toques and caps. Every garment carries seams, stitching, pockets, buttons, wear and the
// cavity shading of the fold fields it shares with the geometry (folds.ts). No directional light is baked.
import type { RGB, Page } from './px';
import { hex, mix, mul, shade, ph, fbm, clamp01, sstep } from './px';
import type { HumanLook } from './looks';
import type { Shape } from './shape';
import type { Dims } from './rig';
import { sampleRows } from './rig';
import { TORSO_ROWS, ARM_ROWS, LEG_ROWS } from './profiles';
import { LAYOUT, VMAP } from './page';
import type { RegKey } from './page';
import { flannel, denim, canvas, corduroy, knit, wool, waffle, twill, nylon, blazeMesh, leather, rubber, stitchOn } from './fabric';
import { torsoFold, armFold, legFold, strapMask } from './folds';
import type { SkinPal } from './skin';
import { eachIn, armSkin, paintBareHand, skinTexel } from './skin';

export interface Ctx { L: HumanLook; sh: Shape; d: Dims; K: SkinPal; seed: number }

const D2R = Math.PI / 180;
/** ellipse perimeter (Ramanujan) */
const perim = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
const g = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));

/**
 * Cavity shading from a fold field's curvature: f(th, y) is a radial offset (m), mpr converts radians to metres
 * round the part, h the sample step (m). Valleys (positive Laplacian) darken, ridges lighten a little.
 */
function foldShade(f: (th: number, y: number) => number, th: number, y: number, mpr: number, h: number, k = 0.00055): number {
  const c = f(th, y), dth = h / mpr;
  const lap = (f(th + dth, y) + f(th - dth, y) - 2 * c + f(th, y + h) + f(th, y - h) - 2 * c) / (h * h);
  const v = lap * k;
  return 1 - Math.max(-0.12, Math.min(0.32, v));
}

/** the button: a disc with a rim and two thread holes; returns colour or null */
function button(dx: number, dy: number, r: number, col: RGB): RGB | null {
  const d = Math.hypot(dx, dy);
  if (d > r) return null;
  if (d > r - 0.8) return shade(col, 0.6);
  if (Math.abs(dy) < 0.6 && Math.abs(Math.abs(dx) - r * 0.32) < 0.6) return shade(col, 0.45);
  return mul(col, 1 + (d / r) * 0.12);
}

// ------------------------------------------------------------------ fabrics by garment kind
function shirtCloth(C: Ctx, xm: number, ym: number, x: number, y: number): RGB {
  const T = C.L.shirt;
  switch (T.kind) {
    case 'flannel': case 'wool': return flannel(T.sett!, xm, ym, x, y, C.seed);
    case 'henley': return waffle(hex(T.color ?? '#7a2a22'), x, y, C.seed);
    case 'coveralls': return twill(hex(T.color ?? '#3c4a5a'), x, y, C.seed);
    default: return waffle(hex(T.color ?? '#888888'), x, y, C.seed);
  }
}
function pantsCloth(C: Ctx, x: number, y: number, fade: number): RGB {
  const G = C.L.legs;
  const base = hex(G.color);
  switch (G.kind) {
    case 'jeans': return denim(base, x, y, fade, C.seed + 40);
    case 'coveralls': return twill(base, x, y, C.seed + 40);
    case 'wool': return wool(base, x, y, C.seed + 40);
    case 'canvas': case 'khaki': return canvas(base, x, y, 0.15, C.seed + 40);
  }
}
/** grime, sawdust, grease and wear over any garment texel */
function soil(C: Ctx, c: RGB, x: number, y: number, low: number, edge = 0): RGB {
  const L = C.L;
  const n = fbm(x, y, 18, 3, C.seed + 90);
  c = mix(c, shade(c, 0.7), clamp01((n - 0.55) * 3) * L.wear * (0.3 + low * 0.7) * 0.6);
  if (edge > 0) c = mix(c, shade(c, 1.2), edge * L.wear * 0.5);
  if (L.grease) {
    const gN = fbm(x, y, 11, 4, C.seed + 95);
    if (gN > 0.66 - L.grease * 0.12) c = mix(c, [26, 24, 24], clamp01((gN - 0.6) * 4) * 0.8);
    else if (gN > 0.6 - L.grease * 0.1) c = mix(c, shade(c, 0.6), 0.4);
  }
  // sawdust and wood chips caught in the cloth (the lumberjacks)
  if ((L.name.includes('Lumber') || L.name.includes('Logger')) && ph(x, y, C.seed + 97) < 0.006 * (0.5 + low)) c = mix([214, 180, 120], [180, 140, 90], ph(x, y, 3));
  return c;
}

// ------------------------------------------------------------------ torso: shirt + trousers top + suspenders + belt
export function paintTorso(P: Page, C: Ctx) {
  const { L, sh, d } = C;
  const s = d.s, b = L.build;
  const [, , w, h] = LAYOUT.TORSO;
  const rng = VMAP.TORSO;
  const dy = (rng[1] - rng[0]) / h;
  const susp = L.suspenders ? hex(L.suspenders) : null;
  const beltC = L.belt ? hex(L.belt) : null;
  const coverall = sh.topKind === 'coveralls';
  const flannelish = L.shirt.kind === 'flannel' || L.shirt.kind === 'wool';
  const btn: RGB = coverall ? [150, 150, 150] : L.shirt.kind === 'henley' ? [90, 70, 50] : [214, 204, 186];
  eachIn(P, 'TORSO', (x, y, u, v) => {
    const deg = (u - 0.5) * 360, th = deg * D2R, yy = rng[0] + v * (rng[1] - rng[0]);
    const r = sampleRows(TORSO_ROWS, yy);
    const circ = perim(r.rx * b.bw, (r.rf + r.rb) * 0.5 * b.mass) * s;
    const xm = (u - 0.5) * circ, ym = yy * s;
    const shirt = coverall || (sh.tuck ? yy > sh.waist : yy > sh.topHem);
    const front = Math.abs(deg) < 90;
    let c: RGB;
    if (shirt) {
      // panels: two fronts and the back, the check mismatched at the side seams like a real cut shirt
      const panel = !front ? 0.011 : deg > 0 ? 0 : 0.004;
      const yoke = !front && yy > 1.41;
      c = yoke ? shirtCloth(C, ym * 0.7 + 0.01, xm, x, y) : shirtCloth(C, xm + panel, ym, x, y);
      // ---- front placket + buttons (or the coverall zip)
      const pl = Math.abs(xm);
      if (front && pl < 0.017) {
        if (flannelish) c = shirtCloth(C, xm + 0.006, ym, x, y);
        if (Math.abs(pl - 0.016) < 0.0022) c = shade(c, 0.72);                 // the placket fold
        if (Math.abs(pl - 0.0125) < 0.0012 && stitchOn(y, 3, 2)) c = shade(c, 0.78);
        if (coverall) {
          if (pl < 0.0025) c = (y & 1) ? [120, 118, 112] : [70, 68, 66];        // zipper teeth
          if (pl < 0.006 && yy > 1.42 && yy < 1.45) c = [150, 148, 140];
        } else if (L.shirt.kind !== 'henley' || yy > 1.3) {
          const by = [1.44, 1.365, 1.285, 1.205, 1.125, 1.045].map((q) => q);
          for (const q of by) {
            const bb = button(xm / (1 / 270), (yy - q) * 265, 2.2, btn);
            if (bb) c = bb;
          }
        }
      }
      if (L.shirt.kind === 'henley' && front && yy > 1.3 && Math.abs(xm) < 0.014) {
        if (Math.abs(Math.abs(xm) - 0.013) < 0.0016) c = shade(c, 0.7);
        for (const q of [1.42, 1.37, 1.32]) { const bb = button(xm / (1 / 270), (yy - q) * 265, 1.8, [120, 96, 70]); if (bb) c = bb; }
      }
      // ---- chest pockets (flannel: two flap pockets; coveralls: a zip chest pocket and a name patch)
      if (front && !coverall && flannelish) {
        for (const sd of [1, -1]) {
          const pc = 0.105 * sd * b.bw, px0 = xm - pc;
          if (Math.abs(px0) < 0.056 && yy > 1.255 && yy < 1.365) {
            const flap = yy > 1.322 - Math.max(0, 0.012 - Math.abs(px0) * 0.25);
            const inPocket = !flap || yy > 1.34;
            if (inPocket) c = shirtCloth(C, px0 + 0.003, ym + 0.005, x, y);
            if (Math.abs(Math.abs(px0) - 0.053) < 0.002 || (!flap && Math.abs(yy - 1.257) < 0.002)) c = shade(c, 0.74);
            if (Math.abs(Math.abs(px0) - 0.049) < 0.0012 && stitchOn(y, 3, 2) && !flap) c = shade(c, 0.82);
            if (flap) {
              const fb = 1.322 - Math.max(0, 0.012 - Math.abs(px0) * 0.25);
              if (Math.abs(yy - fb) < 0.0025) c = shade(c, 0.66);                 // the flap's lower edge
              if (yy < fb + 0.004 && yy > fb - 0.006) c = shade(c, 0.88);
              const bb = button(px0 * 270, (yy - 1.33) * 265, 1.9, btn);
              if (bb) c = bb;
            }
            if (!flap && yy < 1.322 && yy > 1.31) c = shade(c, 0.86);              // shadow under the flap
          }
        }
      }
      if (coverall && front) {
        // name patch over the left chest, a zipped pocket on the right, pen slots
        const nx = (xm - 0.1 * b.bw) * 270, ny = (yy - 1.31) * 265;
        if (Math.abs(nx) < 13 && Math.abs(ny) < 6) {
          const oval = (nx / 13) ** 2 + (ny / 6) ** 2;
          c = oval > 0.85 ? [150, 30, 28] : [228, 224, 214];
          const t = L.extras?.patch;
          if (t && oval < 0.7) { const tc = textPx(t, Math.round(nx + 7), Math.round(-ny + 2)); if (tc) c = [160, 28, 26]; }
        }
        const px0 = (xm + 0.1 * b.bw) * 270, py0 = (yy - 1.3) * 265;
        if (Math.abs(px0) < 15 && py0 < 10 && py0 > -14) {
          if (Math.abs(py0 - 9) < 1) c = (x & 1) ? [110, 108, 104] : [70, 70, 70];
          if (Math.abs(Math.abs(px0) - 14.5) < 0.8 || Math.abs(py0 + 13.5) < 0.8) c = shade(c, 0.7);
        }
        for (const q of [-0.07, -0.085]) if (Math.abs(xm - q * b.bw) < 0.002 && yy > 1.28 && yy < 1.33) c = shade(c, 0.7);
      }
      // ---- seams: side seams, the yoke seam, the box pleat at the back
      if (Math.abs(Math.abs(deg) - 90) < 0.9) c = shade(c, 0.74);
      if (Math.abs(Math.abs(deg) - 92) < 0.6 && stitchOn(y, 3, 2)) c = shade(c, 0.85);
      if (!front && Math.abs(yy - 1.41) < 0.002) c = shade(c, 0.7);
      if (!front && Math.abs(yy - 1.403) < 0.0012 && stitchOn(x, 3, 2)) c = shade(c, 0.8);
      if (!front && yy < 1.41 && Math.abs(Math.abs(deg) - 175) < 0.8 && yy > 1.25) c = shade(c, 0.8);
      // untucked hem: a curved shirttail
      if (!sh.tuck && !coverall && yy < sh.topHem + 0.012) c = shade(c, 0.86);
      // occlusion: the armpits, under the collar, the tuck into the waistband, under a pot belly
      let ao = 1;
      ao -= 0.22 * g(Math.abs(deg), 90, 14) * g(yy, 1.3, 0.05);
      ao -= 0.25 * clamp01((yy - 1.455) / 0.03);
      if (sh.tuck) ao -= 0.3 * g(yy, sh.waist + 0.004, 0.006);
      ao -= 0.15 * g(yy, 1.0, 0.025) * g(deg, 0, 40) * (b.belly + Math.max(0, b.mass - 1));
      if (coverall) ao -= 0.15 * g(yy, 1.0, 0.008);
      c = shade(c, ao * foldShade((t, q) => torsoFold(t, q, sh, L), th, yy, circ / (Math.PI * 2), dy * 2));
      c = soil(C, c, x, y, clamp01((1.15 - yy) / 0.3), 0);
    } else {
      // ---- trousers top: waistband, belt loops, pockets, fly, the back yoke and patch pockets
      const fade = L.legs.kind === 'jeans' ? 0.12 + L.wear * 0.25 * g(Math.abs(deg), 0, 60) : 0;
      c = pantsCloth(C, x, y, fade);
      const wb = sh.waist - yy;
      const jeans = L.legs.kind === 'jeans' || L.legs.kind === 'canvas' || L.legs.kind === 'khaki';
      if (wb < 0.038) {
        if (Math.abs(wb - 0.037) < 0.002) c = shade(c, 0.66);
        if ((Math.abs(wb - 0.004) < 0.0014 || Math.abs(wb - 0.033) < 0.0014) && stitchOn(x, 3, 2)) c = jeans ? [196, 140, 60] : shade(c, 0.8);
        // belt loops
        for (const ld of [24, 72, 140, 180, -24, -72, -140]) if (Math.abs(Math.abs(deg) - Math.abs(ld)) < 1.4 && Math.sign(deg || 1) === Math.sign(ld || 1)) c = shade(c, Math.abs(Math.abs(deg) - Math.abs(ld)) > 0.9 ? 0.7 : 1.05);
        if (Math.abs(deg) < 2.4 && wb < 0.03 && wb > 0.01 && !beltC) c = jeans ? [176, 120, 60] : [60, 56, 50];   // the top button
      } else if (front) {
        // fly: a J of stitching left of centre
        const fx = deg + 3;
        if (yy > 0.86 && ((Math.abs(fx - 5) < 0.6 && yy > 0.89) || (yy < 0.895 && Math.abs(Math.hypot((fx - 1) / 4, (yy - 0.895) / 0.03) - 1) < 0.15)) && stitchOn(y + x, 3, 2)) c = jeans ? [196, 140, 60] : shade(c, 0.78);
        if (Math.abs(deg) < 0.8) c = shade(c, 0.7);
        // front pocket openings: a scooped curve
        for (const sd of [1, -1]) {
          const a = Math.abs(deg), t = (a - 22) / 50;
          if (Math.sign(deg) === sd && t > 0 && t < 1) {
            const curve = sh.waist - 0.038 - Math.sin(t * Math.PI * 0.5) * 0.07;
            if (Math.abs(yy - curve) < 0.0022) c = shade(c, 0.6);
            if (Math.abs(yy - curve + 0.006) < 0.0012 && jeans && stitchOn(x, 3, 2)) c = [196, 140, 60];
            if (yy > curve && yy < curve + 0.012) c = shade(c, 0.9);
          }
        }
        // rivets at the pocket corners
        for (const sd of [1, -1]) { const rx = (deg - sd * 22) * 0.9, ry = (yy - (sh.waist - 0.041)) * 265; if (jeans && L.legs.kind === 'jeans' && rx * rx + ry * ry < 1.6) c = [196, 120, 60]; }
      } else {
        // back yoke (a V) and patch pockets
        const a = 180 - Math.abs(deg);
        const yokeY = sh.waist - 0.06 - (1 - a / 90) * 0.0 - (a < 90 ? (90 - a) / 90 * 0.035 : 0);
        if (jeans && Math.abs(yy - yokeY) < 0.002) c = shade(c, 0.66);
        if (jeans && Math.abs(yy - yokeY + 0.006) < 0.0012 && stitchOn(x, 3, 2)) c = [196, 140, 60];
        for (const sd of [1, -1]) {
          const pcx = (deg - sd * 152) * 0.9, pcy = (yy - 0.885) * 265;
          if (Math.sign(deg) === sd && Math.abs(pcx) < 16 && pcy < 14 && pcy > -16 + Math.abs(pcx) * 0.25) {
            const edge = Math.abs(Math.abs(pcx) - 15.3) < 0.9 || pcy > 13 || pcy < -15 + Math.abs(pcx) * 0.25;
            if (edge) c = shade(c, 0.68);
            else if (jeans && L.legs.kind === 'jeans' && Math.abs(pcy - (-2 + Math.sin(pcx * 0.4) * 3)) < 0.7) c = [196, 140, 60];   // the arcuate stitching
            else c = mul(c, 1.04);
          }
        }
        if (Math.abs(Math.abs(deg) - 180) < 0.8 && yy < sh.waist - 0.04) c = shade(c, 0.72);           // the seat seam
      }
      if (coverall) c = twill(hex(L.legs.color), x, y, C.seed + 40);
      // belt over the waistband
      if (beltC && wb > 0.005 && wb < 0.034) {
        c = leather(beltC, x, y, C.seed + 60, 0.4);
        if (wb < 0.008 || wb > 0.031) c = shade(c, 0.74);
        if ((Math.abs(wb - 0.01) < 0.0012 || Math.abs(wb - 0.029) < 0.0012) && stitchOn(x, 3, 2)) c = shade(c, 1.2);
        if (Math.abs(deg) < 5) {
          const fr = Math.abs(deg) > 4 || wb < 0.009 || wb > 0.03;
          c = fr ? [170, 160, 130] : shade(c, 0.7);
          if (Math.abs(deg + 1) < 0.6 && wb > 0.012 && wb < 0.027) c = [190, 180, 150];
        }
      }
      // tucked shirt shows a hint above the band: the band's top casts no light, only occlusion
      c = shade(c, 1 - 0.18 * g(wb, 0.038, 0.004));
      c = soil(C, c, x, y, 1, 0);
    }
    // ---- suspenders over everything: elastic webbing, leather button tabs at the waistband, a leather X at the back
    if (susp) {
      const m = strapMask(th, yy);
      if (m > 0.35) {
        let sc = mul(susp, (y & 1) ? 1.06 : 0.9);
        if (m < 0.55) sc = shade(susp, 0.68);                                   // edge cord
        sc = mul(sc, 0.95 + ph(x, y, 5) * 0.08);
        c = sc;
        // leather tabs where they button on
        if (yy < sh.waist + 0.055 && yy > sh.waist - 0.03) {
          c = leather([90, 58, 34], x, y, C.seed + 70, 0.4);
          if (Math.abs(yy - (sh.waist - 0.015)) < 0.004 && m > 0.75) c = [190, 176, 150];
        }
        if (!front && yy > 1.31 && yy < 1.385 && Math.abs(deg) > 158) c = leather([90, 58, 34], x, y, C.seed + 71, 0.4);
      } else if (m > 0.15) c = shade(c, 0.82);                                  // contact shadow beside the strap
    }
    return c;
  });
}

/** tiny 3x5 pixel font for name patches */
const FONT: Record<string, string[]> = {
  R: ['110', '101', '110', '101', '101'], A: ['010', '101', '111', '101', '101'], Y: ['101', '101', '010', '010', '010'],
  G: ['011', '100', '101', '101', '011'], E: ['111', '100', '110', '100', '111'], M: ['101', '111', '111', '101', '101'],
};
function textPx(t: string, x: number, y: number): boolean {
  if (y < 0 || y > 4 || x < 0) return false;
  const ci = Math.floor(x / 4), cx = x % 4;
  if (ci >= t.length || cx > 2) return false;
  const gl = FONT[t[ci]]; if (!gl) return false;
  return gl[y][cx] === '1';
}

// ------------------------------------------------------------------ outer garments
export function paintOuter(P: Page, C: Ctx) {
  const { L, sh, d } = C;
  if (sh.outer === 'none') return;
  const s = d.s, b = L.build;
  const rng = VMAP.TORSO;
  const kind = sh.outer;
  const col = hex(L.outer.color ?? '#886644'), col2 = hex(L.outer.color2 ?? '#443322');
  const [, , w, h] = LAYOUT.OUTER;
  const dy = (rng[1] - rng[0]) / h;
  eachIn(P, 'OUTER', (x, y, u, v) => {
    const deg = (u - 0.5) * 360, yy = rng[0] + v * (rng[1] - rng[0]);
    const r = sampleRows(TORSO_ROWS, yy);
    const circ = perim(r.rx * b.bw, (r.rf + r.rb) * 0.5 * b.mass) * s;
    const xm = (u - 0.5) * circ;
    const front = Math.abs(deg) < 90;
    const hemD = yy - sh.outerHem;
    let c: RGB;
    let edge = 0;
    if (kind === 'chore') {
      c = canvas(col, x, y, 0.85, C.seed + 100);
      // the front edges, triple-stitched; corozo buttons down the wearer's right, holes on the left
      const fe = Math.abs(deg) - (sh.open ? 6 : 0);
      if (front && fe < 5) { edge = 1 - fe / 5; if (Math.abs(fe - 3.2) < 0.5 && stitchOn(y, 3, 2)) c = shade(c, 0.72); }
      for (const q of [1.36, 1.25, 1.14, 1.03, 0.92]) {
        if (deg < 0) { const bb = button((deg + 9) * 0.75, (yy - q) * 265, 2.6, [70, 52, 36]); if (bb) c = bb; }
        else if (Math.abs(deg - 9) < 2.6 && Math.abs(yy - q) < 0.0025) c = shade(c, 0.5);
      }
      // chest pocket with a pencil slot, two big patch pockets low on the front
      const pk = (cx: number, y0: number, y1: number, hw: number) => {
        const px0 = xm - cx;
        if (Math.abs(px0) > hw || yy < y0 || yy > y1) return;
        c = canvas(col, x + 3, y + 1, 0.85, C.seed + 101);
        if (Math.abs(Math.abs(px0) - hw) < 0.0025 || Math.abs(yy - y0) < 0.0025) c = shade(c, 0.66);
        if ((Math.abs(Math.abs(px0) - hw + 0.005) < 0.0012 || Math.abs(yy - y0 - 0.005) < 0.0012) && stitchOn(x + y, 3, 2)) c = shade(c, 0.8);
        if (yy > y1 - 0.006) { c = shade(c, 0.78); edge = 0.8; }
      };
      if (front) {
        pk(0.11 * b.bw, 1.25, 1.35, 0.05);
        pk(0.12 * b.bw, 0.86, 0.99, 0.07); pk(-0.12 * b.bw, 0.86, 0.99, 0.07);
      }
      if (!front && Math.abs(yy - 1.38) < 0.0025) c = shade(c, 0.68);
      if (hemD < 0.025) { c = shade(c, 0.9); if (Math.abs(hemD - 0.02) < 0.0015 && stitchOn(x, 3, 2)) c = shade(c, 0.75); edge = Math.max(edge, 1 - hemD / 0.025); }
    } else if (kind === 'quiltVest') {
      c = nylon(col, x, y, C.seed + 110);
      const ch = ((yy - sh.outerHem) / 0.07) % 1;
      const seam = Math.min(ch, 1 - ch);
      c = shade(c, 0.78 + 0.3 * sstep(0, 0.5, seam));
      if (seam < 0.05 && stitchOn(x, 3, 2)) c = shade(c, 0.6);
      // zip, binding and pockets
      if (front && Math.abs(xm) < 0.004) c = (y & 1) ? [60, 62, 64] : [30, 30, 32];
      if (front && Math.abs(xm) < 0.007 && yy > 1.43) c = [70, 72, 74];
      if (hemD < 0.015 || yy > 1.45) c = nylon(col2, x, y, C.seed + 111);
      for (const sd of [1, -1]) {
        const px0 = (xm - sd * 0.12 * b.bw) * 265, py0 = (yy - 1.0) * 265;
        if (Math.abs(px0 + py0 * 0.4 * sd) < 0.9 && Math.abs(py0) < 14) c = [40, 40, 42];
      }
    } else if (kind === 'blazeVest') {
      c = blazeMesh(col, x, y, C.seed + 120);
      if (front && Math.abs(xm) < 0.006) c = nylon(shade(col, 0.9), x, y, 3);
      if (front && Math.abs(xm) < 0.0018) c = (y & 1) ? [80, 60, 50] : [40, 30, 26];
      for (const sd of [1, -1]) {
        const px0 = xm - sd * 0.11 * b.bw;
        if (front && Math.abs(px0) < 0.06 && yy > 0.93 && yy < 1.05) {
          c = nylon(col, x, y, C.seed + 121);
          if (Math.abs(Math.abs(px0) - 0.058) < 0.002 || Math.abs(yy - 1.048) < 0.002) c = shade(c, 0.7);
        }
      }
      if (!front && yy > 0.94 && yy < 1.16 && Math.abs(Math.abs(deg) - 180) < 50) {
        c = nylon(col, x, y, C.seed + 122);
        if (Math.abs(yy - 1.158) < 0.003 || Math.abs(Math.abs(Math.abs(deg) - 180) - 49) < 0.8) c = shade(c, 0.7);
      }
      if (hemD < 0.012 || yy > 1.45) c = shade(col, 0.82);
    } else {
      // cardigan: stockinette, ribbed button bands up the V, ribbed hem, patch pockets, leather knot buttons
      c = knit(col, x, y, C.seed + 130);
      if (ph(x, y, C.seed + 131) < 0.02) c = shade(c, 1.12);                      // pilling
      const band = Math.abs(deg) - (sh.open ? 7 + 30 * Math.pow(clamp01((yy - 1.02) / 0.4), 1.2) : 0);
      if (front && band < 7) {
        c = knit(mix(col, col2, 0.25), x, y, C.seed + 132, true);
        edge = 0.4;
        if (deg < 0 && band < 6) for (const q of [1.2, 1.12, 1.04, 0.96, 0.89]) {
          const bb = button((band - 3) * 0.75, (yy - q) * 265, 2.6, [92, 60, 36]); if (bb) c = bb;
        }
      }
      if (hemD < 0.045) c = knit(mix(col, col2, 0.25), x, y, C.seed + 133, true);
      for (const sd of [1, -1]) {
        const px0 = xm - sd * 0.11 * b.bw;
        if (front && Math.abs(px0) < 0.055 && yy > 0.9 && yy < 1.02) {
          c = knit(col, x + 1, y, C.seed + 134);
          if (yy > 1.0) c = knit(mix(col, col2, 0.25), x, y, C.seed + 135, true);
          if (Math.abs(Math.abs(px0) - 0.054) < 0.0018) c = shade(c, 0.72);
        }
      }
    }
    // occlusion: under the collar, the armholes of vests; fold shading for the jacket's drape
    let ao = 1 - 0.25 * clamp01((yy - 1.445) / 0.02);
    if (kind === 'quiltVest' || kind === 'blazeVest') ao -= 0.2 * g(Math.abs(deg), 90, 12) * g(yy, 1.34, 0.05);
    if (kind === 'chore') ao *= foldShade((t, q) => Math.sin(t * 9 + q * 24) * 0.0016 + g(q, 1.3, 0.05) * Math.sin(t * 5 + q * 60) * 0.002, deg * D2R, yy, circ / (Math.PI * 2), dy * 2);
    c = shade(c, ao);
    c = soil(C, c, x, y, clamp01((1.1 - yy) / 0.3), edge);
    return c;
  });
  // linings (in the TAILS region): the chore coat's striped blanket, the vests' dark nylon, the cardigan's purl
  eachIn(P, 'TAILS', (x, y, _u, v) => {
    if (kind === 'chore') {
      const yy = v * 0.7;
      const band = Math.floor(yy / 0.012) % 8;
      const bc: RGB = band === 0 ? [168, 40, 34] : band === 4 ? [30, 30, 30] : band === 2 || band === 6 ? [196, 180, 150] : [120, 100, 72];
      return wool(bc, x, y, C.seed + 140, false);
    }
    if (kind === 'cardigan') return knit(shade(col, 0.75), x, y, C.seed + 141, true);
    return nylon(kind === 'blazeVest' ? shade(col, 0.8) : [40, 42, 46], x, y, C.seed + 142);
  });
}

// ------------------------------------------------------------------ sleeves and forearms
export function paintArms(P: Page, C: Ctx) {
  const { L, sh, d } = C;
  const s = d.s, b = L.build;
  const rng = VMAP.ARM;
  const jacket = sh.outerSleeve;
  const ocol = hex(L.outer.color ?? '#886644'), ocol2 = hex(L.outer.color2 ?? '#443322');
  const fm = (1 - b.fem * 0.14) * (0.62 + 0.38 * b.mass);
  for (const key of ['ARM_L', 'ARM_R'] as RegKey[]) {
    const [, , w, h] = LAYOUT[key];
    const dy = (rng[1] - rng[0]) / h;
    const seed = C.seed + (key === 'ARM_L' ? 200 : 220);
    eachIn(P, key, (x, y, u, v) => {
      const deg = (u - 0.5) * 360, th = deg * D2R, yy = rng[0] + v * (rng[1] - rng[0]);
      const r = sampleRows(ARM_ROWS, yy);
      const circ = perim(r.rx * fm + sh.armThick, (r.rf + r.rb) * 0.5 * fm + sh.armThick) * s;
      const xm = (u - 0.5) * circ, ym = yy * s * b.armLen;
      if (yy < sh.sleeveY) {
        // bare forearm below a rolled or short sleeve; the wrist and the back of the hand's start
        let c = armSkin(C.K, L, x, y, th, seed);
        c = shade(c, 1 - 0.25 * g(yy, sh.sleeveY - 0.004, 0.005));                 // under the roll
        return c;
      }
      let c: RGB;
      let edge = 0;
      if (jacket) {
        if (sh.outer === 'chore') c = canvas(ocol, x, y, 0.85, seed);
        else c = knit(ocol, x, y, seed);
        // the cuff: a stitched hem (chore) or a ribbed band (cardigan)
        if (yy < sh.sleeveY + 0.05) {
          if (sh.outer === 'cardigan') c = knit(mix(ocol, ocol2, 0.25), x, y, seed + 1, true);
          else { c = shade(c, 0.92); if (Math.abs(yy - sh.sleeveY - 0.035) < 0.0015 && stitchOn(x, 3, 2)) c = shade(c, 0.72); edge = clamp01(1 - (yy - sh.sleeveY) / 0.02); }
        }
        // cardigan: suede elbow patches
        if (sh.outer === 'cardigan' && Math.hypot((Math.abs(deg) - 180) / 32, (yy + 0.28) / 0.05) < 1) c = leather(ocol2, x, y, seed + 2, 0.2);
        if (sh.outer === 'chore') edge = Math.max(edge, 0.6 * g(Math.abs(Math.abs(deg) - 180), 0, 30) * g(yy, -0.29, 0.03));   // worn elbows
      } else {
        c = shirtCloth(C, xm, ym, x, y);
        if (sh.rolled && yy < sh.sleeveY + 0.034) {
          // the rolled-up cuff: the cloth's reverse face (softer, paler), its folded edges
          c = mix(shirtCloth(C, xm * 1.1 + 0.01, ym * 0.6, x + 1, y), [200, 190, 170], 0.18);
          const rr = (yy - sh.sleeveY) / 0.034;
          if (Math.abs(rr - 0.5) < 0.06 || rr < 0.08 || rr > 0.94) c = shade(c, 0.7);
        } else if (sh.sleeveY < -0.45 && yy < sh.sleeveY + 0.052) {
          // a buttoned barrel cuff: the band, its topstitching, a button on the back seam side
          c = shirtCloth(C, xm, ym * 0.5 + 0.004, x, y);
          if (Math.abs(yy - sh.sleeveY - 0.051) < 0.0018) c = shade(c, 0.7);
          if ((Math.abs(yy - sh.sleeveY - 0.044) < 0.0011 || Math.abs(yy - sh.sleeveY - 0.006) < 0.0011) && stitchOn(x, 3, 2)) c = shade(c, 0.8);
          const bb = button((deg - 150) * 0.22, (yy - sh.sleeveY - 0.026) * 256, 2.0, [214, 204, 186]);
          if (bb) c = bb;
          if (yy < sh.sleeveY + 0.004) c = shade(c, 0.8);
        }
        // the sleeve placket (gauntlet) above the cuff
        if (sh.sleeveY < -0.45 && yy > sh.sleeveY + 0.052 && yy < sh.sleeveY + 0.13 && Math.abs(deg - 160) < 2.5) c = shade(c, Math.abs(deg - 160) > 1.8 ? 0.72 : 1);
      }
      // the sleeve seam down the back, the set-in seam round the shoulder
      if (Math.abs(Math.abs(deg) - 180) < 1.6) c = shade(c, 0.72);
      if (Math.abs(yy - 0.012) < 0.0028) c = shade(c, 0.7);
      if (Math.abs(yy - 0.004) < 0.0015 && stitchOn(x, 3, 2)) c = shade(c, 0.82);
      // fold cavities (elbow buckling, cuff stacking, the roll), armpit occlusion
      c = shade(c, foldShade((t, q) => armFold(t, q, sh), th, yy, circ / (Math.PI * 2), dy * 2));
      c = shade(c, 1 - 0.18 * g(Math.abs(deg), 90, 30) * clamp01((yy + 0.02) / 0.06) * (deg < 0 ? 1 : 0.4));
      c = soil(C, c, x, y, clamp01((-0.25 - yy) / 0.25), edge);
      return c;
    });
  }
}

// ------------------------------------------------------------------ trousers, socks and boot shafts
export function paintLegs(P: Page, C: Ctx) {
  const { L, sh, d } = C;
  const s = d.s, b = L.build;
  const rng = VMAP.LEG;
  const fm = (0.72 + 0.28 * b.mass);
  const bootC = hex(L.feet.color);
  for (const key of ['LEG_L', 'LEG_R'] as RegKey[]) {
    const [, , w, h] = LAYOUT[key];
    const dy = (rng[1] - rng[0]) / h;
    const seed = C.seed + (key === 'LEG_L' ? 300 : 320);
    eachIn(P, key, (x, y, u, v) => {
      const deg = (u - 0.5) * 360, th = deg * D2R, yy = rng[0] + v * (rng[1] - rng[0]);
      const r = sampleRows(LEG_ROWS, yy);
      const circ = perim(r.rx * fm, (r.rf + r.rb) * 0.5 * fm) * s;
      const a = Math.abs(deg);
      if (yy < sh.bootTop) {
        // ---- the boot shaft: oiled leather, laces criss-crossing up the front between speed hooks, a pull loop
        let c = leather(bootC, x, y, seed + 5, L.wear * 0.6);
        const lx = deg / 9;                                   // lacing half-width ~9 degrees either side of the front
        if (Math.abs(deg) < 14) {
          c = shade(leather(bootC, x + 7, y, seed + 6, 0.3), 0.9);                  // the tongue
          const yl = (yy - sh.bootTop) * -265;                 // texels down from the top
          const per = 10;
          const ph0 = ((yl % per) + per) % per;
          if (Math.abs(lx) < 1.05) {
            const cross = Math.abs((ph0 / per) * 2 - 1) * 2 - 1;  // -1..1 zigzag
            if (Math.abs(lx - cross) < 0.22 || Math.abs(lx + cross) < 0.22) c = (x + y) & 1 ? [168, 120, 60] : [130, 90, 44];
          }
        }
        if (Math.abs(a - 12.5) < 2.2) {
          // the eyestay edges, hooks
          c = shade(leather(bootC, x, y, seed + 7, 0.2), 0.86);
          const yl = (yy - sh.bootTop) * -265;
          if (((yl % 10) + 10) % 10 < 2.2 && Math.abs(a - 12.5) < 1.4) c = [150, 146, 136];
        }
        if (Math.abs(sh.bootTop - yy) < 0.008) c = shade(c, 0.78);                    // the collar edge
        if (Math.abs(a - 180) < 6 && sh.bootTop - yy < 0.03) c = shade(leather(bootC, x, y, seed + 8, 0.5), 0.8); // pull loop
        if (Math.abs(a - 180) < 0.8) c = shade(c, 0.7);
        if (Math.abs(a - 90) < 0.7 && stitchOn(y, 3, 2)) c = shade(c, 0.8);
        return soil(C, c, x, y, 1, 0);
      }
      if (yy < sh.legHem) {
        // ---- the grey wool work sock rolled over the boot top: red and cream stripes at the top
        const top = sh.legHem - yy;
        let c = knit([150, 146, 140], x, y, seed + 9, true);
        if (ph(x, y, seed + 10) < 0.3) c = mix(c, [70, 66, 62], 0.5);
        const t = (yy - sh.bootTop) / (sh.legHem - sh.bootTop);
        if (t > 0.45 && t < 0.62) c = knit([170, 40, 36], x, y, seed + 11, true);
        if (t > 0.7 && t < 0.78) c = knit([214, 206, 190], x, y, seed + 12, true);
        void top;
        return shade(c, 1 - 0.3 * g(t, 0.95, 0.06));
      }
      // ---- trousers
      const fade = L.legs.kind === 'jeans' ? 0.1 + L.wear * (0.35 * g(yy, -0.43, 0.06) * g(a, 0, 50) + 0.25 * g(yy, -0.12, 0.08) * g(a, 20, 40) + 0.15) : 0;
      let c = pantsCloth(C, x, y, fade);
      const jeans = L.legs.kind === 'jeans';
      const stitch: RGB = jeans ? [196, 140, 60] : shade(hex(L.legs.color), 0.75);
      // outseam (felled, with a selvedge ID line on jeans) and inseam (double-needle)
      if (Math.abs(deg - 90) < 1.1) c = shade(c, 0.7);
      if (jeans && Math.abs(deg - 88.6) < 0.5) c = mix(c, [200, 190, 180], 0.5);
      if (Math.abs(deg + 90) < 0.9) c = shade(c, 0.72);
      if ((Math.abs(deg + 88) < 0.5 || Math.abs(deg + 92) < 0.5) && stitchOn(y, 3, 2)) c = stitch;
      // whiskers at the hip crease and honeycombs behind the knee (jeans)
      if (jeans) {
        const wsk = g(yy, -0.08, 0.035) * g(deg, 18, 22);
        if (wsk > 0.2 && Math.abs(Math.sin((yy + deg * 0.0006) * 420)) < 0.25) c = mix(c, [150, 170, 196], wsk * 0.5 * L.wear);
        const hc = g(yy, -0.46, 0.025) * g(a, 180, 30);
        if (hc > 0.2 && Math.abs(Math.sin(deg * 0.35 + (yy * 200))) < 0.2) c = mix(c, [130, 150, 180], hc * 0.5 * L.wear);
      }
      // coverall leg pockets: a hammer loop and a rule pocket on the right thigh
      if (L.legs.kind === 'coveralls' && key === 'LEG_R' && a > 60 && a < 120 && yy > -0.32 && yy < -0.14) {
        if (Math.abs(a - 61) < 1 || Math.abs(a - 119) < 1 || Math.abs(yy + 0.141) < 0.002) c = shade(c, 0.66);
      }
      // the hem: stagged (frayed, cut with an axe) or a stitched turn-up stacking on the boot
      const hem = yy - sh.legHem;
      if (sh.stagged && hem < 0.012) {
        c = mix(c, [200, 196, 186], 0.25 * (1 - hem / 0.012));
        if (ph(x, 0, seed + 13) < 0.5 && hem < 0.008 * ph(x, 1, seed + 14) + 0.002) c = mix(c, [220, 216, 206], 0.7);
      } else if (hem < 0.015) { c = shade(c, 0.86); if (Math.abs(hem - 0.012) < 0.0012 && stitchOn(x, 3, 2)) c = stitch; }
      // knees, seat wear; mud spatter low on the legs
      c = shade(c, foldShade((t, q) => legFold(t, q, sh), th, yy, circ / (Math.PI * 2), dy * 2));
      c = shade(c, 1 - 0.18 * g(a, 180, 40) * g(yy, 0.03, 0.04));                  // crotch / seat occlusion
      c = soil(C, c, x, y, clamp01((-0.45 - yy) / 0.35), g(yy, -0.43, 0.05) * g(a, 0, 40));
      if (yy < -0.55 && ph(x >> 1, y >> 1, seed + 15) < 0.03 * L.wear) c = mix(c, [74, 58, 40], 0.7);
      return c;
    });
  }
}

// ------------------------------------------------------------------ boots and shoes
export function paintFeet(P: Page, C: Ctx) {
  const { L, sh } = C;
  const bootC = hex(L.feet.color);
  for (const key of ['FOOT_L', 'FOOT_R'] as RegKey[]) {
    const seed = C.seed + (key === 'FOOT_L' ? 400 : 420);
    eachIn(P, key, (x, y, u, v) => {
      // u: angle round the foot (0.5 the top of the foot, 0.25 / 0.75 the welt, 0 / 1 under the sole); v: heel 0.04 .. toe 0.7
      const a = Math.abs((u - 0.5) * 360);
      if (u > 0.9 && v > 0.9) return [140, 98, 52];                       // the lace boxes
      if (u > 0.85 && v > 0.85 && v <= 0.9) return [120, 84, 44];
      const t = clamp01((v - 0.04) / 0.66);
      if (a > 92) {
        // ---- the sole: black lug rubber; a stacked leather heel on loggers; lugs read on the side wall
        let c = rubber([34, 30, 28], x, y, seed);
        if (sh.feet === 'shoe') c = rubber([56, 40, 30], x, y, seed);
        const lug = Math.floor(y / 5) & 1;
        if (a < 140 && sh.feet !== 'shoe') c = shade(c, lug ? 1.25 : 0.7);
        if (sh.feet === 'logger' && t < 0.26 && a < 130) {
          c = mix([92, 60, 36], [70, 44, 26], (Math.floor(x / 2) & 1) ? 0.2 : 0.6);   // stacked heel layers
          if (Math.floor(x) % 3 === 0) c = shade(c, 0.72);
        }
        if (a < 96) c = shade(c, 0.6);
        return c;
      }
      // ---- the upper: oiled leather, a toe cap seam, the heel counter, welt stitching, the vamp
      let c = leather(bootC, x, y, seed + 1, L.wear * 0.7);
      if (sh.feet === 'shoe') c = leather(bootC, x, y, seed + 1, 0.25);
      if (a > 84) { c = shade(c, 0.78); if (stitchOn(y, 3, 2) && a > 86) c = [176, 150, 110]; }      // the welt
      const capV = 0.78 - Math.pow(a / 90, 2) * 0.12;
      if (Math.abs(t - capV) < 0.012) c = shade(c, 0.68);
      if (Math.abs(t - capV + 0.025) < 0.008 && stitchOn(x, 3, 2)) c = shade(c, 0.85);
      if (t > capV) c = mix(c, shade(c, 1.12), L.wear * 0.5 * clamp01((t - capV) / 0.15));       // scuffed toe cap
      if (t < 0.18 && Math.abs(t - 0.17) < 0.012 && a > 30) c = shade(c, 0.7);                    // heel counter
      if (a < 14 && t > 0.2 && t < 0.62) c = shade(leather(bootC, x + 5, y, seed + 2, 0.3), 0.85); // the tongue under the laces
      if (Math.abs(a - 14) < 1.2 && t > 0.2 && t < 0.62) c = shade(c, 0.66);
      if (sh.feet === 'hiker' && t > 0.8 && a < 60) c = rubber([60, 54, 48], x, y, seed);      // rubber toe bumper
      return soil(C, c, x, y, 1, 0);
    });
  }
}

// ------------------------------------------------------------------ hands: leather work gloves or skin
export function paintHands(P: Page, C: Ctx) {
  const { L } = C;
  for (const key of ['HAND_L', 'HAND_R'] as const) {
    if (L.hands.kind === 'bare') { paintBareHand(P, L, C.K, key); continue; }
    const base = hex(L.hands.color ?? '#b8894f');
    const seed = C.seed + (key === 'HAND_L' ? 500 : 520);
    eachIn(P, key, (x, y, u, v) => {
      if (v > 0.56) {
        // palm block: u round the hand (0.25 palm, 0.75 back, 0.5 thumb side, 0 / 1 pinky side), v 1 wrist .. 0.56 knuckles
        const pv = (v - 0.56) / 0.44;
        const th = (u - 0.5) * Math.PI * 2;
        const palm = Math.sin(th) < -0.15;
        let c = leather(base, x, y, seed, 0.2);
        if (palm) {
          // the reinforced palm patch: a second, darker piece, worn smooth and grimy, stitched round
          const inPatch = pv < 0.82 && Math.abs(u - 0.25) < 0.19;
          if (inPatch) {
            c = leather(shade(base, 0.86), x, y, seed + 1, 0.7);
            c = mix(c, [86, 64, 44], clamp01(fbm(x, y, 5, 2, seed + 2) - 0.35) * 0.9 * (0.4 + L.wear));
            const e = Math.min(0.82 - pv, 0.19 - Math.abs(u - 0.25));
            if (e < 0.02) c = shade(c, 0.7);
            if (e > 0.025 && e < 0.04 && stitchOn(x + y, 3, 2)) c = [220, 200, 160];
          }
        } else {
          // the back: a seam from the knuckle strap, the elasticated shirring at the wrist
          if (Math.abs(pv - 0.12) < 0.02) c = shade(c, 0.7);
          if (Math.abs(pv - 0.15) < 0.012 && stitchOn(x, 3, 2)) c = [220, 200, 160];
          if (pv > 0.82) { c = shade(c, (x & 1) ? 0.8 : 1.02); }
          if (Math.abs(pv - 0.6) < 0.08 && Math.abs(u - 0.78) < 0.06) c = leather([60, 52, 40], x, y, seed + 3, 0.1);   // a small label
        }
        // creases across the knuckles and palm where the leather folds round a handle
        if (Math.abs(Math.sin(pv * 26 + u * 3)) < 0.1 && pv < 0.3) c = shade(c, 0.82);
        if (Math.abs(u - 0.5) < 0.012 || u < 0.012 || u > 0.988) c = shade(c, 0.72);
        return soil(C, c, x, y, 0.5, 0);
      }
      // digit columns: u within = angle round the finger (0.25 pad, 0.75 back), v 0.54 base .. 0 tip
      const col = Math.min(4, Math.floor(u / 0.2));
      const fu = (u - col * 0.2) / 0.2, fv = v / 0.54;
      const pad = Math.abs(fu - 0.25) < 0.2;
      let c = leather(base, x, y, seed + 10 + col, 0.25);
      if (pad) {
        c = leather(shade(base, 0.86), x, y, seed + 20 + col, 0.6);
        c = mix(c, [80, 60, 42], clamp01(fbm(x, y, 4, 2, seed + 30) - 0.3) * (0.4 + L.wear) * 0.8);   // worn, dark fingertips
      }
      // fourchette seams down the finger sides (Gunn cut) with stitching
      for (const se of [0.02, 0.48, 0.98]) {
        if (Math.abs(fu - se) < 0.04) c = shade(c, 0.66);
        else if (Math.abs(fu - se) < 0.1 && stitchOn(y, 3, 2) && col > 0) c = shade(c, 1.25);
      }
      // creases at the joints
      for (const jv of col === 0 ? [0.55, 0.3] : [0.47, 0.24]) if (Math.abs(fv - jv) < 0.03) c = shade(c, 0.8);
      if (fv < 0.06) c = shade(c, 0.85);
      return soil(C, c, x, y, 0.6, 0);
    });
  }
  if (L.hands.kind !== 'bare') {
    // the gauntlet cuff: stiff split leather, a hem stitch round the opening, a seam down the back
    const base = hex(L.hands.color ?? '#b8894f');
    eachIn(P, 'CUFF', (x, y, u, v) => {
      const uu = (u % 0.5) * 2;
      let c = leather(mix(base, [150, 120, 80], 0.2), x, y, C.seed + 540, 0.35);
      if (v > 0.86) c = shade(c, 0.86);
      if (Math.abs(v - 0.8) < 0.04 && stitchOn(x, 3, 2)) c = [220, 200, 160];
      if (Math.abs(uu - 0.0) < 0.02 || Math.abs(uu - 1) < 0.02) c = shade(c, 0.66);
      if (v < 0.12) c = shade(c, 0.8);
      return soil(C, c, x, y, 0.4, v > 0.9 ? 0.6 : 0);
    });
  }
}

// ------------------------------------------------------------------ collars, hats, the apron, small bits
export function paintCollar(P: Page, C: Ctx) {
  const { L, sh } = C;
  const ocol = hex(L.outer.color ?? '#886644'), ocol2 = hex(L.outer.color2 ?? '#443322');
  eachIn(P, 'COLLAR', (x, y, u, v) => {
    if (v < 0.5) {
      const vv = v / 0.5;
      let c = shirtCloth(C, u * 0.42, vv * 0.06 + 3, x, y);
      if (vv > 0.88 || vv < 0.06) c = shade(c, 0.74);
      if (Math.abs(vv - 0.8) < 0.04 && stitchOn(x, 3, 2)) c = shade(c, 0.8);
      if (sh.collar === 'coverall' && Math.abs(vv - 0.5) < 0.05) c = shade(c, 0.85);
      return c;
    }
    const vv = (v - 0.5) / 0.5;
    if (sh.outer === 'chore') { let c = corduroy(ocol2, x, y, C.seed + 600); if (vv > 0.92 || vv < 0.05) c = shade(c, 0.7); if (vv > 0.5 && vv < 0.58) c = shade(c, 0.8); return c; }
    if (sh.outer === 'quiltVest') return nylon(ocol2, x, y, C.seed + 601);
    return blazeMesh(ocol, x, y, C.seed + 602);
  });
}

export function paintHat(P: Page, C: Ctx) {
  const { L } = C;
  const k = L.hat.kind;
  if (k === 'none') return;
  const col = hex(L.hat.color ?? '#333333'), col2 = hex(L.hat.color2 ?? '#cc6622');
  eachIn(P, 'HAT', (x, y, u, v) => {
    if (k === 'toque' || k === 'toquePom') {
      // the folded rib cuff (bottom third), stockinette crown gathered at the top, a woven label at the front
      if (v < 0.33) {
        let c = knit(col, x, y, C.seed + 700, true);
        if (Math.abs(u - 0.5) < 0.035 && v > 0.08 && v < 0.24) { c = (x + y) & 1 ? col2 : shade(col2, 0.85); if (v < 0.1 || v > 0.22) c = shade(c, 0.7); }
        if (v > 0.3) c = shade(c, 0.78);
        // stripes for the two-tone toques
        return c;
      }
      let c = knit(col, x, y, C.seed + 701);
      if (k === 'toquePom' && ((v > 0.45 && v < 0.52) || (v > 0.6 && v < 0.67))) c = knit(col2, x, y, C.seed + 702);
      if (v > 0.9) c = shade(c, 0.85);
      return c;
    }
    // caps: six crown panels with seams converging, a front panel logo, the bill (u > 0.76), ear flaps in the corner
    if (u > 0.76) {
      const top = v > 0.5;
      let c = twill(top ? col : [60, 90, 60], x, y, C.seed + 710);
      if (((v * 8) % 1) < 0.1 && top) c = shade(c, 0.8);
      return c;
    }
    if (u < 0.2 && v < 0.3) return k === 'capFlaps' ? wool([220, 210, 190], x, y, C.seed + 711, false) : twill(col, x, y, 1);
    const uu = u / 0.75;
    let c = k === 'capFlaps' ? wool(col, x, y, C.seed + 712, false) : twill(col, x, y, C.seed + 713);
    const seam = ((uu * 6) % 1);
    if (seam < 0.025 || seam > 0.975) c = shade(c, 0.66);
    if (v > 0.96) c = shade(col2, 0.9);                                              // the button on top
    if (k === 'cap' && Math.abs(uu - 0.5) < 0.07 && v > 0.25 && v < 0.6) {
      // a feed-store patch on the front
      c = [214, 204, 180];
      const tx = Math.round((uu - 0.5) / 0.07 * 7 + 6), ty = Math.round((0.52 - v) / 0.35 * 7);
      if (textPx('MG', tx, ty)) c = col;
      if (Math.abs(uu - 0.5) > 0.064 || v < 0.27 || v > 0.58) c = shade(col2, 0.7);
    }
    if (v < 0.1) c = shade(c, 0.82);
    return c;
  });
}

export function paintApron(P: Page, C: Ctx) {
  const { L } = C;
  if (!L.apron) return;
  const col = hex(L.apron);
  const rng = VMAP.APRON;
  eachIn(P, 'APRON', (x, y, u, v) => {
    const yy = rng[0] + v * (rng[1] - rng[0]);
    let c = canvas(col, x, y, 0.1, C.seed + 800);
    // hemmed edges all round
    const e = Math.min(u, 1 - u, v * 6, (1 - v) * 6);
    if (e < 0.03) c = shade(c, 0.78);
    if (Math.abs(e - 0.045) < 0.008 && stitchOn(x + y, 3, 2)) c = shade(c, 0.7);
    // the pocket band across the front at the waist, divided into tool pockets; the bib pocket with a pencil slot
    if (yy > 0.83 && yy < 0.96 && u > 0.12 && u < 0.88) {
      c = canvas(shade(col, 0.96), x + 2, y, 0.1, C.seed + 801);
      if (Math.abs(yy - 0.958) < 0.003 || Math.abs(yy - 0.832) < 0.003) c = shade(c, 0.68);
      for (const du of [0.12, 0.33, 0.5, 0.67, 0.88]) if (Math.abs(u - du) < 0.006) c = shade(c, 0.7);
      if (yy > 0.95) c = shade(c, 0.86);
    }
    if (yy > 1.18 && yy < 1.28 && Math.abs(u - 0.5) < 0.17) {
      if (Math.abs(Math.abs(u - 0.5) - 0.165) < 0.008 || Math.abs(yy - 1.182) < 0.003) c = shade(c, 0.68);
      if (Math.abs(u - 0.56) < 0.006) c = shade(c, 0.72);
      if (yy > 1.27) c = shade(c, 0.86);
    }
    // a monogram stitched on the bib: the general store's initials
    {
      const tx = Math.round((u - 0.5) * 168 + 4), ty = Math.round((1.34 - yy) * 160);
      if (textPx('MG', tx, ty)) c = [120, 30, 26];
    }
    // stains: coffee rings, oil, a lifetime of wiping hands
    const st = fbm(x, y, 9, 3, C.seed + 802);
    if (st > 0.66) c = mix(c, [120, 96, 64], (st - 0.66) * 2.2);
    const ring = Math.hypot(x - 120, y - 110);
    if (Math.abs(ring - 7) < 0.8) c = shade(c, 0.8);
    if (yy < 0.83 && ph(x >> 1, y >> 1, C.seed + 803) < 0.02) c = mix(c, [60, 50, 40], 0.5);
    return c;
  });
}

export function paintExtra(P: Page, C: Ctx) {
  const { L } = C;
  const pom = hex(L.hat.color2 ?? '#e8e0cc');
  eachIn(P, 'EXTRA', (x, y, u, v) => {
    if (v < 0.3) return mix(pom, shade(pom, 0.7), ph(x, y, C.seed + 900) * 0.6);   // pompom yarn
    if (v < 0.63) {
      if (u < 0.5) return (x + y) & 1 ? [200, 170, 90] : [150, 120, 60];          // gold-tone frames
      return (y & 1) ? [210, 190, 120] : [120, 100, 60];                         // the chain's links
    }
    // the carpenter's pencil: graphite + bare wood at the sharpened end, red-orange lacquer, a printed band
    const t = 1 - (v - 0.64) / 0.36;
    if (t < 0.06) return [50, 50, 54];
    if (t < 0.16) return [214, 180, 130];
    let c: RGB = [214, 92, 40];
    if (u > 0.45 && u < 0.55) c = shade(c, 0.8);
    if (t > 0.6 && t < 0.66) c = [30, 30, 30];
    return mul(c, 0.95 + ph(x, y, 3) * 0.1);
  });
}

/** whatever a region has never been painted with: a neutral cloth so stray UVs never show black */
export function paintFallback(P: Page, C: Ctx) {
  eachIn(P, 'POCKET', (x, y) => skinTexel(C.K, x, y, 1));
  eachIn(P, 'OSLV_L', (x, y) => shade(C.K.base, 0.9 + ph(x, y, 1) * 0.1));
  eachIn(P, 'OSLV_R', (x, y) => shade(C.K.base, 0.9 + ph(x, y, 1) * 0.1));
}
