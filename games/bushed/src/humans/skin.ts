// Skin, faces, hair and beards, painted texel by texel onto the page. The face is drawn from continuous
// shapes evaluated per texel at ~520 px/m (almond eye openings with irises, lash lines and lid creases, brows
// as hair strokes, the nose's nostrils and alar creases, lips with the line between them), on mottled,
// pored, weathered skin with cavity darkening only (sockets, under the nose and lip, under the jaw): no baked
// light direction. Age adds forehead lines, crow's feet, nasolabial folds, bags and age spots.
//
// Grown out of Limbophobia's paintHead / paintHair (src/limbo/entities/humanPaint.ts), redrawn at 2x density.
import type { RGB, Page } from './px';
import { hex, mix, mul, shade, ph, fbm, clamp01, sstep } from './px';
import type { HumanLook } from './looks';
import { LAYOUT, VMAP } from './page';
import type { RegKey } from './page';
import { EYE, MOUTH_Y, hairLine, hatLine } from './head';

export interface SkinPal { base: RGB; warm: RGB; lip: RGB; hair: RGB; hairD: RGB; hairL: RGB; brow: RGB; stub: RGB }

const TONES: RGB[] = [[238, 200, 176], [226, 178, 142], [200, 146, 106], [156, 104, 72], [100, 66, 48]];
export function skinPal(L: HumanLook): SkinPal {
  const t = clamp01(L.skin.tone) * (TONES.length - 1);
  const i = Math.min(TONES.length - 2, Math.floor(t));
  let base = mix(TONES[i], TONES[i + 1], t - i);
  base = mix(base, [206, 134, 108], L.skin.ruddy * 0.16);
  if (L.age > 0.6) base = mix(base, [214, 186, 170], (L.age - 0.6) * 0.3);   // thinner, paler old skin
  const warm = mix(base, [200, 92, 78], 0.32 + L.skin.ruddy * 0.2);
  const lip = mix(mix(base, [176, 82, 78], 0.45 + L.build.fem * 0.15), [150, 110, 110], L.age * 0.3);
  let hair = hex(L.hair.color);
  hair = mix(hair, [212, 208, 200], L.hair.grey * 0.85);
  const hairD = shade(hair, 0.62), hairL = shade(hair, 1.25);
  const brow = mix(mix(hex(L.hair.color), [40, 30, 24], 0.2), [220, 216, 208], Math.min(1, L.hair.grey * 0.9));
  const stub = mix(mix(hex(L.hair.color), [30, 28, 30], 0.3), [200, 198, 194], L.facial === 'whiteStubble' ? 0.85 : L.hair.grey * 0.6);
  return { base, warm, lip, hair, hairD, hairL, brow, stub };
}

/** plain skin texel: mottled, flecked with pores and freckle-ish specks */
export function skinTexel(K: SkinPal, x: number, y: number, seed: number, ao = 1): RGB {
  const m = fbm(x, y, 7, 3, seed) - 0.5;
  let c = mul(K.base, 1 + m * 0.12);
  c = mix(c, K.warm, clamp01(fbm(x, y, 16, 2, seed + 9) - 0.45) * 0.5);
  const p = ph(x, y, seed + 77);
  if (p < 0.035) c = shade(c, 0.9); else if (p > 0.985) c = shade(c, 1.06);
  return ao === 1 ? c : shade(c, ao);
}

/** iterate a region: fn(x, y, u, v) -> colour (or null to leave the texel) */
export function eachIn(P: Page, key: RegKey, fn: (x: number, y: number, u: number, v: number) => RGB | null, alphaFn?: (x: number, y: number, u: number, v: number) => number) {
  const [x0, y0, w, h] = LAYOUT[key];
  // paint a 1-texel apron round the region (mip / seam bleed)
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const cx = Math.min(w - 1, Math.max(0, x)), cy = Math.min(h - 1, Math.max(0, y));
    const u = (cx + 0.5) / w, v = 1 - (cy + 0.5) / h;
    const c = fn(cx, cy, u, v);
    if (!c) continue;
    const a = alphaFn ? alphaFn(cx, cy, u, v) : 255;
    P.set(x0 + x, y0 + y, c, a);
  }
}

// ------------------------------------------------------------------ the head / face
export function paintHead(P: Page, L: HumanLook, K: SkinPal) {
  const [, , w, h] = LAYOUT.HEAD;
  const seed = L.seed;
  const fem = L.build.fem, age = L.age;
  const g = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
  const iris = hex(L.face.eye);
  const style = L.hair.style;
  const fh = L.facial;
  const stubble = fh === 'stubble' ? 0.9 : fh === 'whiteStubble' ? 0.8 : fh === 'beard' || fh === 'fullBeard' ? 0.55 : fh === 'moustache' || fh === 'walrus' ? 0.35 : (1 - fem) * 0.25;
  const browW = L.face.brow;
  const pxPerDeg = w / 360, pxPerY = h / (VMAP.HEAD[1] - VMAP.HEAD[0]);
  const ex = EYE.w;           // half width of the eye opening, degrees
  const eyH = 0.0062;         // half height, head-local metres
  const tilt = L.face.eyeTilt;
  const mouthW = 15 * (0.9 + L.face.lips * 0.1);
  eachIn(P, 'HEAD', (x, y, u, v) => {
    const deg = (u - 0.5) * 360, yy = VMAP.HEAD[0] + v * (VMAP.HEAD[1] - VMAP.HEAD[0]);
    const a = Math.abs(deg);
    // ---- base skin + cavity / occlusion
    let ao = 1;
    ao -= 0.5 * clamp01((0.0 - yy) / 0.03);                                        // under the jaw
    ao -= 0.1 * clamp01((a - 70) / 110);                                           // round the back
    ao -= 0.2 * g(yy, 0.106, 0.004) * g(a, EYE.a, 9);                               // under the brow, in the socket
    ao -= 0.1 * g(yy, 0.092, 0.003) * g(a, EYE.a + 1, 7) * (0.6 + age);            // lower socket / bags
    ao -= 0.12 * g(yy, 0.104, 0.006) * g(a, 6, 3);                                  // beside the nose root
    ao -= 0.16 * g(yy, 0.05, 0.004) * g(a, 9, 4);                                   // alar crease
    ao -= 0.18 * g(yy, 0.048, 0.0025) * g(a, 0, 7);                                 // under the nose
    ao -= 0.14 * g(yy, 0.021, 0.0035) * g(a, 0, 10);                                // under the lower lip
    ao -= 0.12 * g(yy, 0.047 - (a - 14) * 0.0007, 0.0028) * g(a, 22, 7) * (0.4 + age * 1.2); // nasolabial fold
    ao -= 0.08 * g(yy, 0.05, 0.012) * g(a, 47, 12) * L.face.hollow;                  // gaunt hollows
    ao -= 0.12 * g(a, 96, 5) * g(yy, 0.08, 0.025);                                  // the ear's root
    let c = skinTexel(K, x, y, seed, 1);
    // warm flush: cheeks, the nose tip, ears, weathered forehead
    const flush = g(a, 40, 12) * g(yy, 0.068, 0.014) * (0.35 + L.skin.ruddy * 0.6)
      + g(a, 0, 6) * g(yy, 0.058, 0.008) * (0.4 + L.skin.ruddy * 0.6 + L.face.nose.bulb * 0.3)
      + g(a, 102, 9) * g(yy, 0.08, 0.03) * 0.5
      + g(yy, 0.15, 0.03) * g(a, 0, 40) * L.skin.ruddy * 0.25;
    c = mix(c, K.warm, clamp01(flush) * 0.6);
    // ---- scalp: hair painted above the hairline so the shell never shows skin gaps; stubble on shaved areas
    const hl = hairLine(L, deg);
    if (style !== 'bald') {
      const rag = (ph(x, 0, 13) - 0.5) * 0.006;
      const thin = style === 'thin' || style === 'receding' ? 0.55 : 1;
      if (yy > hl + 0.003 + rag) {
        const strand = fbm(x * 2.2, y * 0.5, 3, 2, seed + 5);
        const hc = mix(K.hairD, K.hair, strand);
        c = mix(c, hc, thin * (0.75 + 0.25 * ph(x, y, seed + 2)));
      } else if (yy > hl - 0.006 + rag && ph(x, y, 5) < (yy - hl + 0.006) / 0.009) c = mix(c, K.hairD, 0.55 * thin);
      // sideburns down in front of the ears
      if (a > 78 && a < 92 && yy > 0.075 && yy < hl + 0.01 && style !== 'ponytail') c = mix(c, mix(K.hairD, K.hair, ph(x, y, 4)), 0.8);
    } else if (yy > 0.12) {
      // bald pate: a little shine-free mottling and age spots
      if (ph(x >> 1, y >> 1, seed + 41) < 0.03 * age) c = mix(c, [150, 110, 80], 0.4);
    }
    if (L.hat.kind !== 'none' && yy > hatLine(L, deg) + 0.01) c = shade(c, 0.85); // under a hat (never seen)
    // ---- stubble / beard shadow
    const beardTop = a < 13 ? 0.058 : 0.055 - (a > 40 ? (a - 40) * 0.0005 : 0);
    const inBeard = a < 92 && yy < beardTop && yy > -0.04 && !(yy > 0.026 && yy < 0.046 && a < 18) && !(a > 70 && yy > 0.075);
    if (inBeard && stubble > 0) {
      const edge = sstep(beardTop, beardTop - 0.01, yy) * sstep(92, 80, a);
      c = mix(c, mix(c, K.stub, 0.35), edge * stubble * 0.8);
      if (ph(x, y, seed + 31) < edge * stubble * 0.42) c = mix(c, K.stub, 0.75);
    }
    // ---- eyes
    for (const k of [-1, 1]) {
      const dx = (deg - k * EYE.a) * k;          // + toward the outer corner
      if (Math.abs(dx) > ex + 4 || Math.abs(yy - EYE.y) > 0.03) continue;
      const nx = dx / ex;                          // -1 inner corner .. 1 outer
      const ny = (yy - EYE.y) / eyH;
      const tl = tilt * nx * 0.25;
      const up = 0.95 * Math.pow(Math.max(0, 1 - nx * nx), 0.7) * (1 - 0.15 * nx) + tl - age * 0.12 * Math.max(0, nx) - 0.05;
      const lo = -0.62 * Math.pow(Math.max(0, 1 - nx * nx), 0.9) + tl * 0.5;
      // brow: hair strokes over the brow ridge, thick at the head by the nose, tapering out (bushy on the old)
      const bx = (deg * k - 7) / 22;                // 0 at the inner end, 1 at the tail
      const browY = 0.118 + (bx > 0.55 ? -(bx - 0.55) * 0.012 : bx * 0.004) - (L.age > 0.7 ? (bx - 0.3) * 0.004 : 0);
      if (bx > -0.05 && bx < 1.08) {
        const thick = (0.0042 - bx * 0.0022) * browW * (1 + age * 0.3);
        const by = (yy - browY) / thick;
        if (Math.abs(by) < 1.05 + ph(x, y, seed + 8) * 0.4) {
          const hairy = ph(x, y >> 0, seed + 3) < 0.75 + browW * 0.12;
          if (hairy) c = mix(c, ph(x, y, seed + 9) < 0.3 ? shade(K.brow, 1.2) : K.brow, bx > 0.9 ? 0.55 : 0.92);
        }
        // stray long hairs on bushy old brows
        if (age > 0.7 && browW > 1.3 && Math.abs(by) < 2.2 && ph(x, y, seed + 12) < 0.12) c = mix(c, K.brow, 0.7);
      }
      // the lid crease above the opening, socket shadow
      const crease = up + 0.95 + age * 0.2;
      if (nx > -1.05 && nx < 1.1 && Math.abs(ny - crease) < 0.28) c = shade(c, 0.86 - age * 0.06);
      if (nx > -1.0 && nx < 1.0 && ny > up && ny < crease) c = shade(c, 0.95);
      // inside the opening
      if (Math.abs(nx) < 1 && ny < up && ny > lo) {
        const irisR = 0.62, ic = Math.hypot(dx / (ex * 0.39), ny / 1.0);
        const corner = clamp01((Math.abs(nx) - 0.55) / 0.45);
        let e: RGB = mix([236, 230, 220], [200, 170, 160], corner * 0.6);
        e = mix(e, [214, 196, 190], clamp01((ny - (up - 0.4)) / 0.4) * 0.6);   // the lid's shadow on the white
        if (ic < irisR + 0.32) {
          const t = ic / (irisR + 0.32);
          const ring = t > 0.8;
          e = ring ? shade(iris, 0.5) : mix(shade(iris, 1.15), shade(iris, 0.8), t);
          if (ph(x, y, seed + 21) < 0.25 && !ring) e = shade(e, 1.18);
          if (t < 0.36) e = [16, 12, 12];
          // catchlight
          if (Math.abs(dx + ex * 0.12) < pxPerDeg ? false : false) e = [255, 255, 255];
        }
        c = e;
        // upper lid shadow band and lashes along the upper edge
        if (ny > up - 0.32) c = shade(c, 0.55);
        if (nx < -0.86) c = mix(c, [196, 120, 116], 0.7);                       // the tear duct
      }
      // the lash line: dark, heavier at the outer end; lower lid a thin pink-brown line
      const onUp = Math.abs(nx) < 1.05 && Math.abs(ny - up) < 0.3;
      if (onUp) c = mix(c, [34, 24, 22], 0.8 + 0.2 * clamp01(nx));
      if (nx > 0.9 && nx < 1.32 && Math.abs(ny - (up + (nx - 0.9) * 0.4)) < 0.28) c = mix(c, [40, 28, 24], 0.65);
      const onLo = Math.abs(nx) < 0.95 && Math.abs(ny - lo) < 0.22;
      if (onLo) c = mix(c, mix(K.base, [120, 70, 66], 0.5), 0.6);
      // bags under the eyes
      if (Math.abs(nx) < 0.9 && ny < lo - 0.3 && ny > lo - 1.4 - age) c = shade(c, 0.94 - age * 0.06);
      // crow's feet
      if (age > 0.35 && nx > 1.15 && nx < 2.1) {
        for (const sl of [-0.5, 0.0, 0.55]) if (Math.abs(ny - (sl * (nx - 1.1) * 1.6)) < 0.18 && ph(x, y, seed + 51) < age) c = shade(c, 0.86);
      }
    }
    // the real catchlights: one texel up and toward the nose of each iris centre
    // ---- nose: nostrils, the alar crease, the tip
    if (a < 14 && yy > 0.04 && yy < 0.11) {
      for (const k of [-1, 1]) {
        const nd = (deg - k * 5.5) / 2.6, ny = (yy - 0.0505) / 0.0022;
        if (nd * nd + ny * ny < 1) c = mix(c, [70, 34, 30], 0.85);
        const ad = Math.abs(deg - k * 9.5);
        if (ad < 1.2 && yy > 0.048 && yy < 0.06) c = shade(c, 0.8);
      }
      // bridge: a faint lighter line (bone close under the skin) is form, not light: keep it as a subtle warm-pale line
      if (a < 1.2 && yy > 0.065 && yy < 0.1) c = mix(c, mix(K.base, [240, 220, 210], 0.3), 0.25);
    }
    // ---- mouth
    if (a < mouthW + 4 && yy > 0.015 && yy < 0.055) {
      const mx = deg / mouthW;                                  // -1..1 across the mouth
      const droop = age * 0.0016 * mx * mx;
      const line = MOUTH_Y - droop;
      const bow = 0.0018 * Math.max(0, 1 - Math.abs(mx) * 3) * 0;   // cupid's bow dip in the upper lip edge
      const upTop = 0.0465 - 0.0012 * mx * mx - bow - (1 - L.face.lips) * 0.002;
      const loBot = 0.0285 + 0.002 * mx * mx + (1 - L.face.lips) * 0.002;
      if (Math.abs(mx) < 1) {
        if (yy > line && yy < upTop) c = mix(c, shade(K.lip, 0.88), 0.75 * (1 - Math.abs(mx) * 0.3));
        if (yy < line && yy > loBot) c = mix(c, K.lip, 0.8 * (1 - Math.abs(mx) * 0.4));
        if (Math.abs(yy - line) < 0.0011 * (1.1 - Math.abs(mx) * 0.3)) c = mix(c, [64, 26, 24], 0.9);
        // philtrum ridges
        if (yy > upTop && yy < 0.049 && Math.abs(Math.abs(deg) - 2.6) < 0.8) c = shade(c, 0.93);
      }
      if (Math.abs(Math.abs(mx) - 1.04) < 0.08 && Math.abs(yy - line + 0.0006) < 0.002) c = shade(c, 0.7);   // corners
      if (age > 0.5 && Math.abs(Math.abs(mx) - 1.1) < 0.06 && yy < line && yy > line - 0.014) c = shade(c, 0.9); // marionette lines
    }
    // ---- age: forehead lines, frown lines, age spots
    if (age > 0.25 && a < 45) {
      for (const fy of [0.133, 0.141, 0.149, 0.158]) {
        const wob = Math.sin(deg * 0.12 + fy * 900) * 0.0012;
        if (Math.abs(yy - fy - wob) < 0.0009 && ph(x, fy * 1000, seed) < age * 1.1) c = shade(c, 0.88);
      }
      for (const k of [-1, 1]) if (Math.abs(deg - k * 2.2) < 0.7 && yy > 0.108 && yy < 0.122 && age > 0.5) c = shade(c, 0.88);
    }
    if (age > 0.6 && ph(x >> 1, y >> 1, seed + 61) < (age - 0.6) * 0.06) c = mix(c, [150, 108, 78], 0.35);
    // ---- ears: the inner bowl and the canal
    if (a > 96 && a < 118 && yy > 0.05 && yy < 0.112) {
      const ey = (yy - 0.08) / 0.024, ea = (a - 106) / 7;
      const r = ey * ey + ea * ea;
      if (r < 0.5) c = shade(c, 0.78);
      else if (r < 0.75) c = shade(c, 0.9);
      c = mix(c, K.warm, 0.25);
    }
    return ao === 1 ? c : shade(c, Math.max(0.35, ao));
  });
  // catchlights: one bright texel in each iris (up and toward the nose), the only "light" baked into a face
  for (const k of [-1, 1]) {
    const cx = LAYOUT.HEAD[0] + Math.round((0.5 + (k * EYE.a - k * 1.2) / 360) * w - 0.5);
    const cy = LAYOUT.HEAD[1] + Math.round((1 - (EYE.y + 0.0022 - VMAP.HEAD[0]) / (VMAP.HEAD[1] - VMAP.HEAD[0])) * h - 0.5);
    P.blend(cx, cy, [250, 248, 240], 0.85);
  }
  void pxPerY;
}

/** eyelids (the blink shells): skin above, the lash line along the closing edge */
export function paintLids(P: Page, L: HumanLook, K: SkinPal) {
  eachIn(P, 'LIDS', (x, y, _u, v) => {
    let c = skinTexel(K, x, y, L.seed + 3);
    c = shade(c, 0.93);
    if (v < 0.16) c = [36, 26, 24];
    else if (v < 0.24) c = shade(c, 0.8);
    if (v > 0.8) c = shade(c, 0.88);
    return c;
  });
}

export function paintNeck(P: Page, L: HumanLook, K: SkinPal) {
  const age = L.age, fem = L.build.fem;
  const st = L.facial === 'stubble' || L.facial === 'whiteStubble' ? 0.7 : L.facial === 'none' ? (1 - fem) * 0.2 : 0.45;
  eachIn(P, 'NECK', (x, y, u, v) => {
    const deg = (u - 0.5) * 360, yy = VMAP.NECK[0] + v * (VMAP.NECK[1] - VMAP.NECK[0]);
    let c = skinTexel(K, x, y, L.seed + 1);
    // under-jaw shadow at the top, the collar's occlusion at the bottom
    c = shade(c, 1 - 0.25 * clamp01((yy - 1.58) / 0.06) - 0.25 * clamp01((1.47 - yy) / 0.04));
    // the throat stubble
    if (Math.abs(deg) < 70 && yy > 1.53 && ph(x, y, L.seed + 32) < st * 0.4) c = mix(c, [60, 54, 52], 0.5);
    // old necks: loose horizontal folds and the cords
    if (age > 0.4) {
      if (Math.abs(Math.sin(yy * 260 + deg * 0.02)) < 0.12 && Math.abs(deg) < 80) c = shade(c, 0.9);
      if (Math.abs(Math.abs(deg) - 28) < 3 && yy > 1.48 && yy < 1.58) c = shade(c, 0.92);
    }
    if (fem < 0.5 && Math.abs(deg) < 6 && Math.abs(yy - 1.53) < 0.012) c = shade(c, 0.93);  // Adam's apple edge
    return c;
  });
}

/** hair shells: strands flowing from the crown, clumps, grey streaks, a ragged alpha-cut hairline */
export function paintHair(P: Page, L: HumanLook, K: SkinPal) {
  const seed = L.seed + 7;
  const [, , w, h] = LAYOUT.HAIR;
  eachIn(P, 'HAIR', (x, y, u, v) => {
    const deg = (u - 0.5) * 360;
    const yy = VMAP.HAIR[0] + v * (VMAP.HAIR[1] - VMAP.HAIR[0]);
    const strand = fbm(x * 2.4, y * 0.42, 3, 3, seed);
    const clump = fbm(x, y, 9, 2, seed + 3);
    let c = mix(K.hairD, K.hair, sstep(0.25, 0.75, strand));
    c = mix(c, K.hairL, sstep(0.68, 0.9, strand * 0.7 + clump * 0.3) * 0.6);
    if (L.hair.grey > 0 && ph(x, y >> 2, seed + 5) < L.hair.grey * 0.55) c = mix(c, [222, 218, 212], 0.6);
    // towards the edge the hair thins over the scalp
    const hl = hairLine(L, deg);
    c = shade(c, 0.85 + 0.15 * clamp01((yy - hl) / 0.04));
    if (L.hair.style === 'ponytail' && u < 0.2 && v < 0.3) c = mix(K.hairD, K.hair, sstep(0.3, 0.7, fbm(x * 0.5, y * 2, 3, 2, seed)));
    return c;
  }, (x, y, u, v) => {
    const deg = (u - 0.5) * 360;
    const yy = VMAP.HAIR[0] + v * (VMAP.HAIR[1] - VMAP.HAIR[0]);
    const hl = hairLine(L, deg);
    // ragged hairline: strands of varying length cut the alpha
    const len = ph(x, 0, seed + 11) * 0.012 + ph(x >> 1, 1, seed + 12) * 0.006;
    if (L.hair.style === 'ponytail' && u < 0.2 && v < 0.3) return 255;
    return yy < hl + 0.006 - len ? 0 : 255;
  });
  void w; void h;
}

/** beard / moustache shells: wiry strands growing down, darker roots, ragged alpha-cut tips */
export function paintBeard(P: Page, L: HumanLook, K: SkinPal) {
  const seed = L.seed + 17;
  const beardCol = mix(mix(hex(L.hair.color), [60, 40, 26], 0.15), [226, 222, 214], Math.min(1, L.hair.grey * 0.95));
  const bD = shade(beardCol, 0.55), bL = shade(beardCol, 1.3);
  // a full red-brown beard often runs gingery
  const ginger: RGB = mix(beardCol, [150, 80, 40], 0.3);
  eachIn(P, 'BEARD', (x, y, u, v) => {
    const s = fbm(x * 2.2, y * 0.35, 3, 3, seed);
    const cl = fbm(x, y, 7, 2, seed + 4);
    let c = mix(bD, beardCol, sstep(0.2, 0.7, s));
    c = mix(c, bL, sstep(0.72, 0.92, s * 0.6 + cl * 0.4) * 0.55);
    if (L.hair.grey < 0.5 && ph(x, y >> 2, seed + 6) < 0.12) c = mix(c, ginger, 0.6);
    if (L.hair.grey > 0.2 && ph(x, y >> 2, seed + 8) < L.hair.grey * 0.5) c = mix(c, [228, 224, 218], 0.6);
    // the moustache band (top) slightly darker at the lip edge
    if (v > 0.78) c = shade(c, 0.85 + 0.15 * (v - 0.78) / 0.22);
    // roots darker near the skin edge of the beard (top rows of the beard part)
    else if (v > 0.66) c = shade(c, 0.85);
    return c;
  }, (x, _y, u, v) => {
    // ragged ends at the bottom of the beard and the moustache's lower fringe
    const tip = ph(x, 0, seed + 21) * 0.08 + ph(x >> 1, 0, seed + 22) * 0.05;
    if (v < 0.75 && v < 0.04 + tip) return 0;
    if (v >= 0.78 && v < 0.78 + tip * 0.6) return 0;
    if (u < 0.015 || u > 0.985) return 0;
    return 255;
  });
}

/** bare hands: knuckle creases, nails, palm lines (HAND region layout from hands.ts) */
export function paintBareHand(P: Page, L: HumanLook, K: SkinPal, key: 'HAND_L' | 'HAND_R') {
  const seed = L.seed + (key === 'HAND_L' ? 31 : 37);
  const age = L.age;
  eachIn(P, key, (x, y, u, v) => {
    let c = skinTexel(K, x, y, seed);
    if (v > 0.56) {
      // palm block: u = angle round the hand (0.25 palm, 0.75 back), v 1 = wrist .. 0.56 = knuckles
      const pv = (v - 0.56) / 0.44;
      const th = (u - 0.5) * Math.PI * 2;
      const palm = Math.sin(th) < 0;
      if (palm) {
        c = mix(c, [226, 168, 150], 0.25);
        // palm creases: heart line, head line, life line
        const lu = (u - 0.08) / 0.34;
        if (Math.abs(pv - (0.25 + lu * 0.12)) < 0.025) c = shade(c, 0.82);
        if (Math.abs(pv - (0.42 + lu * 0.18)) < 0.022) c = shade(c, 0.84);
        if (Math.abs(lu - (0.75 - pv * 0.4)) < 0.03 && pv > 0.35) c = shade(c, 0.84);
      } else {
        // back: veins and tendons for the old, knuckle creases at the bottom
        if (age > 0.4 && Math.abs(Math.sin(u * 50 + pv * 4)) < 0.1 && pv > 0.2) c = mix(c, [120, 120, 150], 0.18);
        if (pv < 0.12) c = mix(c, K.warm, 0.25);
        if (ph(x, y, seed + 4) < 0.08 + (1 - L.build.fem) * 0.1) c = shade(c, 0.85);   // hair on the back of the hand
      }
      if (age > 0.6 && ph(x >> 1, y >> 1, seed + 7) < 0.05) c = mix(c, [150, 110, 80], 0.35);
      return c;
    }
    // finger columns: u within the column = angle round the finger (0.25 palm side, 0.75 nail side), v 0.54 = base .. 0 = tip
    const col = Math.min(4, Math.floor(u / 0.2));
    const fu = (u - col * 0.2) / 0.2, fv = v / 0.54;
    const nailSide = col === 0 ? Math.abs(fu - 0.5 - 0.14) < 0.2 : Math.abs(fu - 0.75) < 0.17;
    // knuckle creases on the back, joint creases on the palm side
    const joints = col === 0 ? [0.55, 0.3] : [0.47, 0.24];
    for (const jv of joints) {
      if (Math.abs(fv - jv) < 0.02) c = shade(c, nailSide ? 0.86 : 0.8);
      if (Math.abs(fv - jv) < 0.05 && nailSide && ph(x, y, seed) < 0.4) c = shade(c, 0.9);
    }
    if (!nailSide) c = mix(c, [226, 168, 150], 0.2);
    // the nail: a rounded plate near the tip on the back
    if (nailSide && fv < 0.21 && fv > 0.02) {
      const edge = fv < 0.05 || Math.abs(fu - (col === 0 ? 0.64 : 0.75)) > 0.13;
      c = edge ? mix(K.base, [232, 220, 210], 0.6) : mix(K.base, [232, 186, 176], 0.55);
      if (L.grease && fv < 0.06) c = [40, 34, 30];                   // grease under the nails
    }
    if (L.grease && ph(x >> 1, y >> 1, seed + 9) < L.grease * 0.35) c = mix(c, [40, 36, 34], 0.5);
    return c;
  });
}

/** a forearm (below a rolled sleeve): skin with hair, a few veins */
export function armSkin(K: SkinPal, L: HumanLook, x: number, y: number, th: number, seed: number): RGB {
  let c = skinTexel(K, x, y, seed);
  const hairy = (1 - L.build.fem) * (L.age > 0.7 ? 0.5 : 1);
  if (Math.sin(th) > -0.3 && ph(x, y, seed + 5) < 0.16 * hairy) c = mix(c, mix(K.hairD, [60, 50, 44], 0.4), 0.55);
  if (Math.abs(Math.sin(th * 2 + y * 0.08)) < 0.06 && Math.sin(th) < 0) c = mix(c, [118, 128, 160], 0.12);
  if (L.grease && ph(x >> 1, y >> 1, seed + 9) < L.grease * 0.25) c = mix(c, [44, 40, 36], 0.45);
  return c;
}
