// Fur-page painting helpers: a creature's fur page (anatomy BuildOpts.fur) described as zones in creature space.
// Each zone is a capsule (or a whole piece) with the fur it grows: length (0..1 of FurSpec.length), density, how
// tufted it is, how light its tips are. Later zones add (the longest wins) or, with `bare`, shave. Zone edges are
// ragged (a per-texel jitter) so a ruff ends in hair, not a line.
//   body.buildGen({ ..., fur: furZones([
//     { piece: /^trunk/, len: 0.35 },                                       // a short coat everywhere on the body
//     { a: [0, 0.3, 0.3], b: [0, 0.45, 0.45], r: 0.12, len: 1, clump: 0.8 }, // the chest ruff
//     { piece: /^sku/, bare: true },                                         // the steel head stays bare
//   ]) })
import type { FurPaint } from '../anatomy';

type V3 = number[];
export interface FurZone {
  /** pieces it applies to (tested on the piece name); default all */
  piece?: RegExp;
  /** a capsule a..b (creature space) of radius r; omit a for the whole piece */
  a?: V3; b?: V3; r?: number;
  /** the soft edge, a fraction of r (default 0.4) */
  soft?: number;
  /** only where the surface faces this way: dot(normal, facing) above min (default 0), softened over 0.3 */
  facing?: V3; min?: number;
  /** a cut: only on the +x side (1) or -x side (-1) of x = 0 */
  side?: 1 | -1;
  /** only between these heights (creature space y), softened over 1 cm */
  y?: [number, number];
  /** fur length 0..1 (of FurSpec.length); not needed for a `bare` zone */
  len?: number;
  /** strand density 0..1 (default 1), tuft strength 0..1 (default 0.5), tip lightness 0..1 (default 0.5) */
  den?: number; clump?: number; tip?: number;
  /** shave instead of grow */
  bare?: boolean;
}
const h3 = (a: number, b: number, c: number) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul((c | 0) + 0x3c6ef372, 0x9e3779b1); x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

/** capsule falloff 1 inside .. 0 outside */
function capsule(p: V3, a: V3, b: V3, r: number, soft: number) {
  const ab0 = b[0] - a[0], ab1 = b[1] - a[1], ab2 = b[2] - a[2], L2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2 || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab0 + (p[1] - a[1]) * ab1 + (p[2] - a[2]) * ab2) / L2));
  const d = Math.hypot(p[0] - a[0] - ab0 * t, p[1] - a[1] - ab1 * t, p[2] - a[2] - ab2 * t);
  const r0 = r * (1 - soft);
  return d <= r0 ? 1 : d >= r ? 0 : 1 - (d - r0) / Math.max(1e-6, r - r0);
}

/** a FurPaint from zones (see FurZone). `jitter` (default 0.25) roughens the zone edges per 3 mm cell */
export function furZones(zones: FurZone[], o: { jitter?: number } = {}): FurPaint {
  const jit = o.jitter ?? 0.25;
  return (p, n, piece) => {
    let len = 0, den = 0, clump = 0.5, tip = 0.5, any = false;
    const j = (h3(Math.floor(p[0] * 330), Math.floor(p[1] * 330), Math.floor(p[2] * 330)) - 0.5) * jit;
    for (const z of zones) {
      if (z.piece && !z.piece.test(piece)) continue;
      if (z.side && Math.sign(p[0] || 1) !== z.side) continue;
      let w = z.a ? capsule(p, z.a, z.b ?? z.a, z.r ?? 0.1, z.soft ?? 0.4) : 1;
      if (z.y) w *= Math.max(0, Math.min(1, (p[1] - z.y[0]) / 0.01 + 0.5, (z.y[1] - p[1]) / 0.01 + 0.5));
      if (z.facing) { const d = n[0] * z.facing[0] + n[1] * z.facing[1] + n[2] * z.facing[2]; w *= Math.max(0, Math.min(1, (d - (z.min ?? 0)) / 0.3 + 0.5)); }
      if (w <= 0) continue;
      if (w < 1) w = Math.max(0, Math.min(1, w + j));
      if (z.bare) { len *= 1 - w; den *= 1 - w; continue; }
      const L = (z.len ?? 0) * w;
      if (L >= len) { len = L; clump = z.clump ?? 0.5; tip = z.tip ?? 0.5; }
      den = Math.max(den, (z.den ?? 1) * Math.min(1, w * 1.6));
      any = true;
    }
    if (!any || len < 0.02 || den < 0.03) return null;
    return [den, len, clump, tip];
  };
}
