// Cloth and leather swatches, evaluated per texel. Patterns are laid out in physical units (metres along the
// garment, measured round the actual mesh) so a check is the same size on a chest, a sleeve and a collar;
// the pixel coordinates (px, py) drive thread-scale texture (twill diagonals, knit stitches, wales, grain).
// Nothing here is lit: the swatches carry the cloth's own colour variation, thread texture and wear, and the
// painters add cavity shading from the fold fields.
import type { RGB } from './px';
import { hex, mix, mul, shade, ph, fbm, clamp01, sstep } from './px';
import type { Sett } from './looks';

const cache = new Map<Sett, { cols: RGB[]; edges: number[]; total: number }>();
function settOf(s: Sett) {
  let c = cache.get(s);
  if (!c) {
    // a symmetric sett: the stripe sequence is mirrored (pivots) like a real tartan
    const seq = [...s.stripes, ...[...s.stripes].reverse().slice(1, -1)];
    const cols = seq.map(([h]) => hex(h)); const edges: number[] = []; let t = 0;
    for (const [, w] of seq) { t += w / 1000; edges.push(t); }
    c = { cols, edges, total: t }; cache.set(s, c);
  }
  return c;
}
function stripeAt(s: Sett, m: number): number {
  const c = settOf(s);
  const t = ((m % c.total) + c.total) % c.total;
  for (let i = 0; i < c.edges.length; i++) if (t < c.edges[i]) return i;
  return c.edges.length - 1;
}

/**
 * Woven check / plaid flannel. xm, ym: metres (warp runs along y), px, py: texel coordinates.
 * Where a dark warp crosses a dark weft the cloth is solid dark, light x light solid light, and the mixed squares
 * show the 2/2 twill as fine diagonal hatching (the darker overlap squares of a real buffalo check).
 */
export function flannel(s: Sett, xm: number, ym: number, px: number, py: number, seed: number): RGB {
  const c = settOf(s);
  const wi = stripeAt(s, xm), fi = stripeAt(s, ym);
  const W = c.cols[wi], F = c.cols[fi];
  // 2/2 twill: warp on top on two of four diagonals
  const ph4 = ((px + py) & 3);
  const warpTop = ph4 < 2;
  const top = warpTop ? W : F, under = warpTop ? F : W;
  let col = mix(top, under, 0.22);
  // brushed nap: soft fuzz that blurs the hatching a little, fibres catching
  const nap = (s.brushed ?? 0.6);
  const fz = fbm(px, py, 3, 2, seed) - 0.5;
  col = mul(col, 1 + fz * 0.16 * nap);
  // yarn slubs and irregular threads along both directions
  const slubW = ph(px, 0, seed + 3) < 0.08 ? 0.93 : 1, slubF = ph(0, py, seed + 5) < 0.06 ? 1.06 : 1;
  col = mul(col, slubW * slubF * (0.96 + ph(px, py, seed + 7) * 0.08));
  return col;
}

/** indigo denim: 3/1 twill, white weft flecks, slubby warp, faded where it wears */
export function denim(base: RGB, px: number, py: number, fade: number, seed: number): RGB {
  const warp = mix(base, [18, 26, 48], 0.15 * (ph(px, 0, seed) - 0.3));
  const weft: RGB = [196, 192, 182];
  const d = ((px - py) & 3);           // right-hand twill: diagonals rise to the right
  let col = d === 0 ? mix(warp, weft, 0.38) : mix(warp, weft, 0.06);
  col = mix(col, mix(base, [150, 170, 196], 0.55), clamp01(fade) * 0.85);
  col = mul(col, 0.94 + ph(px >> 1, py, seed + 2) * 0.1 + (ph(px, 0, seed + 9) < 0.07 ? 0.08 : 0));
  return col;
}

/** heavy cotton duck / waxed canvas: a tight plain weave, wax mottling, paler cracks where it creases */
export function canvas(base: RGB, px: number, py: number, wax: number, seed: number): RGB {
  const weave = ((px + (py >> 0)) & 1) ? 1.03 : 0.97;
  let col = mul(base, weave * (0.95 + ph(px, py, seed) * 0.08));
  const m = fbm(px, py, 14, 3, seed + 1);
  col = mix(col, shade(base, 0.72), wax * sstep(0.55, 0.75, m) * 0.6);   // wax-darkened patches
  col = mix(col, shade(base, 1.18), wax * 0.25 * sstep(0.72, 0.8, fbm(px, py, 5, 2, seed + 4)));
  return col;
}

/** corduroy: raised wales (ridges) running along the cloth */
export function corduroy(base: RGB, px: number, py: number, seed: number): RGB {
  const w = px % 3;
  const k = w === 0 ? 0.72 : w === 1 ? 1.08 : 1.0;
  return mul(base, k * (0.96 + ph(px, py >> 1, seed) * 0.08));
}

/** stockinette knit: interlocking V stitches in columns (sweaters, toques); `rib` gives a 1x1 rib */
export function knit(base: RGB, px: number, py: number, seed: number, rib = false): RGB {
  if (rib) {
    const c = px & 1;
    return mul(base, (c ? 1.06 : 0.74) * (0.96 + ph(px, py, seed) * 0.08));
  }
  const col = px >> 1, leg = px & 1;
  const row = (py + (leg ? 0 : 1)) & 1;
  const k = row ? 1.08 : 0.86;
  const hv = 0.95 + ph(col, py >> 1, seed) * 0.1;
  return mul(mix(base, shade(base, 0.8), (leg ? 0.08 : 0)), k * hv);
}

/** heathered wool (trousers, shirts): two-tone fibre flecks, a faint herringbone */
export function wool(base: RGB, px: number, py: number, seed: number, herring = true): RGB {
  const h = ph(px, py, seed);
  let col = h < 0.18 ? shade(base, 0.82) : h > 0.86 ? shade(base, 1.14) : base;
  if (herring) {
    const band = Math.floor(px / 4) & 1;
    const d = band ? (px + py) & 3 : (px - py) & 3;
    if (d === 0) col = mul(col, 0.92);
  }
  return mul(col, 0.97 + (fbm(px, py, 6, 2, seed + 3) - 0.5) * 0.08);
}

/** waffle-knit thermal (henley): a grid of little cells */
export function waffle(base: RGB, px: number, py: number, seed: number): RGB {
  const gx = px % 3, gy = py % 3;
  const k = gx === 0 || gy === 0 ? 0.82 : 1.04;
  return mul(base, k * (0.96 + ph(px, py, seed) * 0.07));
}

/** poly-cotton twill (coveralls): fine diagonal, a little sheen variation */
export function twill(base: RGB, px: number, py: number, seed: number): RGB {
  const d = (px + py) & 3;
  return mul(base, (d === 0 ? 0.9 : d === 2 ? 1.04 : 1) * (0.97 + ph(px, py, seed) * 0.06));
}

/** ripstop / quilted nylon: a faint grid, a soft sheen mottle */
export function nylon(base: RGB, px: number, py: number, seed: number): RGB {
  const grid = (px % 5 === 0 || py % 5 === 0) ? 0.94 : 1;
  return mul(base, grid * (0.97 + (fbm(px, py, 9, 2, seed) - 0.5) * 0.1));
}

/** blaze-orange hunting mesh: open knit holes show darker */
export function blazeMesh(base: RGB, px: number, py: number, seed: number): RGB {
  const hole = (px % 3 === 1) && (py % 3 === 1);
  return hole ? shade(base, 0.62) : mul(base, 0.97 + ph(px, py, seed) * 0.06);
}

/** cowhide / oiled leather: pebbled grain, creases, a darker oiled cast with wear */
export function leather(base: RGB, px: number, py: number, seed: number, wear = 0.3): RGB {
  const grain = fbm(px, py, 2.2, 2, seed);
  let col = mul(base, 0.9 + grain * 0.2);
  const crease = fbm(px * 0.6, py * 2.2, 6, 3, seed + 3);
  if (crease > 0.62) col = shade(col, 0.82);
  else if (crease > 0.58) col = shade(col, 1.08);
  col = mix(col, shade(base, 0.72), wear * sstep(0.45, 0.75, fbm(px, py, 12, 3, seed + 5)) * 0.7);
  return col;
}

/** lug-sole rubber */
export function rubber(base: RGB, px: number, py: number, seed: number): RGB {
  return mul(base, 0.9 + ph(px, py, seed) * 0.16);
}

/** a stitch line helper: true on stitch texels of a dashed seam with period p (on-length on) */
export const stitchOn = (t: number, p = 3, on = 2) => ((Math.floor(t) % p) + p) % p < on;
