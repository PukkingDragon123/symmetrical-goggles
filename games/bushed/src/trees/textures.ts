// Tree textures: bark colour + normal maps and foliage card atlases (high-resolution pixel art made from Poly Haven
// CC0 scans by tools/forest/*.py), plus the procedural end-grain (cut face) generator.
import * as THREE from 'three';
import { loadTex, canvasTex } from '../gfx/tex';
import { Rng } from '../core/rng';
import { Noise } from '../core/noise';
import { SPECIES, type SpeciesId, type RGB } from './species';

/** colour map of the species' bark (sRGB, repeat wrapping, nearest magnification). Tile size: SPECIES[s].barkTile */
export function barkTexture(species: SpeciesId): THREE.Texture {
  return loadTex(`trees/bark_${species}.png`, { repeat: true });
}

/** tangent-space (OpenGL) normal map matching barkTexture */
export function barkNormal(species: SpeciesId): THREE.Texture {
  return loadTex(`trees/bark_${species}_n.png`, { repeat: true, srgb: false });
}

/** foliage atlas: 2 x 4 cells of 256 x 128 texels; alpha-cut (alphaTest 0.5) */
export function foliageTexture(species: SpeciesId): THREE.Texture {
  return loadTex(`trees/foliage_${species}.png`, {});
}

export const ATLAS = { cols: 2, rows: 4, w: 512, h: 512 };

/** cell index -> uv rect [u0, v0, u1, v1] (three.js flips images, so v grows upward) */
export function cellRect(i: number): [number, number, number, number] {
  const c = i % ATLAS.cols, r = Math.floor(i / ATLAS.cols);
  const u0 = c / ATLAS.cols, u1 = (c + 1) / ATLAS.cols;
  const v1 = 1 - r / ATLAS.rows, v0 = 1 - (r + 1) / ATLAS.rows;
  const pu = 0.5 / ATLAS.w, pv = 0.5 / ATLAS.h;
  return [u0 + pu, v0 + pv, u1 - pu, v1 - pv];
}

/** what each atlas cell holds, per species (see tools/forest/foliage.py) */
export interface CellSet { live: number[]; tip: number[]; inner: number[]; pendant: number[]; cones: number[]; dead: number[]; lichen: number[] }
export const CELLS: Record<SpeciesId, CellSet> = {
  spruce: { live: [0, 1, 2], tip: [2], inner: [3], pendant: [4], cones: [5], dead: [6], lichen: [7] },
  fir: { live: [0, 1, 4], tip: [2], inner: [3], pendant: [0], cones: [5], dead: [6], lichen: [7] },
  pine: { live: [0, 1, 2, 4], tip: [3], inner: [3], pendant: [2], cones: [5], dead: [6, 7], lichen: [6] },
  cedar: { live: [0, 1, 3, 4], tip: [2], inner: [5], pendant: [0, 1], cones: [6], dead: [6, 7], lichen: [7] },
  birch: { live: [0, 1, 4], tip: [3], inner: [2, 5], pendant: [1], cones: [5], dead: [6, 7], lichen: [6] },
};

// ------------------------------------------------------------------------------------------------- end grain
const egCache = new Map<string, THREE.Texture>();

function mix3(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * End-grain texture for a cut face of a stem of `radius` metres: pith (slightly off centre), growth rings with
 * earlywood/latewood, heartwood/sapwood, radial checks, resin, cambium and the bark ring. Square canvas texture;
 * the wood circle fills the texture (u,v = 0.5 + (x, z) / (2 * radius)). Anything outside the circle is bark, so an
 * irregular outline mapped with the same scale still reads correctly. High-resolution pixel art: ~256 px/m,
 * clamped to 32..512 px.
 */
export function endGrainTexture(species: SpeciesId, radius: number, seed = 1): THREE.Texture {
  const size = Math.max(32, Math.min(512, Math.round((radius * 2 * 256) / 8) * 8));
  const key = `${species}:${size}:${seed}:${radius.toFixed(3)}`;
  const hit = egCache.get(key);
  if (hit) return hit;
  const sp = SPECIES[species];
  const rng = new Rng(seed * 7919 + 13);
  const noise = new Noise(seed + 101);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const R = radius;
  const bark = Math.min(R * 0.25, sp.barkThickness * (0.6 + 0.4 * Math.min(1, R / 0.25)));
  const wood = R - bark;
  // pith offset (compression / reaction wood)
  const pa = rng.range(0, Math.PI * 2), pr = rng.range(0.02, 0.09) * wood;
  const px = Math.cos(pa) * pr, pz = Math.sin(pa) * pr;
  const heartR = wood * sp.heartFraction * Math.min(1, R / 0.12);
  // radial checks (drying cracks)
  const checks: { a: number; r0: number; w: number }[] = [];
  const nChecks = R > 0.08 ? rng.int(1, R > 0.25 ? 5 : 3) : 0;
  for (let i = 0; i < nChecks; i++) checks.push({ a: rng.range(0, Math.PI * 2), r0: rng.range(0.25, 0.7), w: rng.range(0.006, 0.014) });
  const sp2 = sp.ringSpacing;
  const knotA = rng.range(0, Math.PI * 2);
  const steps = 7; // value quantisation (pixel-art bands)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size * 2 - 1) * R;
      const z = ((j + 0.5) / size * 2 - 1) * R;
      const d0 = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      // wobbly circle for the bark boundary
      const wob = 1 + 0.025 * noise.n2(Math.cos(a) * 2.2, Math.sin(a) * 2.2) + 0.012 * Math.sin(a * 5 + seed);
      let col: RGB;
      const dB = d0 / wob;
      if (dB > wood) {
        // bark: thin inner bark (phloem) then outer bark with flecks
        const t = (dB - wood) / Math.max(1e-4, bark);
        const fleck = noise.n2(x * 220, z * 220) * 0.5 + 0.5;
        col = t < 0.22 ? sp.barkInner : mix3(sp.barkOuter, [sp.barkOuter[0] * 0.7, sp.barkOuter[1] * 0.7, sp.barkOuter[2] * 0.7], fleck * 0.8);
        if (t < 0.22 && t > 0.12) col = mix3(sp.barkInner, sp.sapwood, 0.3); // cambium line
      } else {
        const dx = x - px, dz = z - pz;
        const d = Math.hypot(dx, dz);
        const aa = Math.atan2(dz, dx);
        // ring distortion: slow wobble + growth noise
        const rr = d * (1 + 0.03 * noise.n2(Math.cos(aa) * 1.3 + 5, Math.sin(aa) * 1.3)) + 0.004 * noise.n2(d * 30, aa);
        const ringT = rr / sp2 + 1.2 * noise.n2(rr * 9, 3.3);
        const f = ringT - Math.floor(ringT);
        const late = f > 1 - sp.latewood;
        const heartEdge = heartR * (1 + 0.06 * noise.n2(Math.cos(aa) * 2, Math.sin(aa) * 2));
        const isHeart = rr < heartEdge;
        col = isHeart ? sp.heartwood : sp.sapwood;
        // transition zone
        if (!isHeart && rr < heartEdge + 0.01) col = mix3(sp.heartwood, sp.sapwood, 0.6);
        let k = 1;
        if (late) k *= species === 'birch' ? 0.93 : 0.8;
        else k *= 1 + 0.06 * (f - 0.5);
        // fine fibre noise
        k *= 1 + 0.05 * noise.n2(x * 400, z * 400);
        col = [col[0] * k, col[1] * k, col[2] * k];
        // pith
        if (d < Math.max(0.0035, wood * 0.012)) col = [col[0] * 0.55, col[1] * 0.45, col[2] * 0.4];
        // resin streak / pitch pocket
        if (sp.resin > 0 && noise.n2(x * 18 + 40, z * 18) > 1 - sp.resin * 0.35) col = mix3(col, [0.85, 0.6, 0.25], 0.35);
        // knot (a dark radial streak toward a branch)
        const kd = Math.abs(Math.sin(aa - knotA)) * d;
        if (Math.cos(aa - knotA) > 0 && kd < 0.006 + d * 0.06 && d > wood * 0.15 && d < wood * 0.8) col = mix3(col, [0.42, 0.28, 0.18], 0.55);
        // checks
        for (const ch of checks) {
          const da = Math.abs(Math.atan2(Math.sin(aa - ch.a), Math.cos(aa - ch.a)));
          const rel = d / wood;
          if (rel > ch.r0 && da * d < ch.w * (rel - ch.r0) * 1.8 + 0.0015) col = [col[0] * 0.25, col[1] * 0.22, col[2] * 0.2];
        }
        // sawn surface: very slight darkening toward the edge (oxidised sapwood) and saw marks
        const saw = 0.03 * Math.sin((x * 0.8 + z * 0.6) * 260);
        col = [col[0] * (1 + saw), col[1] * (1 + saw), col[2] * (1 + saw)];
      }
      // pixel-art value quantisation (keeps hue, steps the value)
      const lum = 0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2];
      const ql = Math.max(0.02, Math.round(lum * steps * 2) / (steps * 2));
      const s = ql / Math.max(1e-4, lum);
      const o = (j * size + i) * 4;
      img.data[o] = Math.max(0, Math.min(255, col[0] * s * 255));
      img.data[o + 1] = Math.max(0, Math.min(255, col[1] * s * 255));
      img.data[o + 2] = Math.max(0, Math.min(255, col[2] * s * 255));
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTex(c, {});
  tex.name = `endgrain_${species}`;
  egCache.set(key, tex);
  return tex;
}
