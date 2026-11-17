// Pixel-art wood interiors painted on canvases: end grain (growth rings, heartwood/sapwood, pith, rays, checks,
// bark ring) and side grain (fresh split/notch faces: long fibres, resin streaks, knots). One cache per species.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { canvasTex } from '../gfx/tex';

export type Species = 'spruce' | 'fir' | 'pine' | 'birch' | 'cedar';

interface WoodLook {
  sap: [number, number, number]; heart: [number, number, number]; heartR: number; ring: number;
  late: number; bark: [number, number, number]; inner: [number, number, number]; knot: [number, number, number];
}

export const WOOD: Record<Species, WoodLook> = {
  spruce: { sap: [226, 206, 168], heart: [214, 190, 150], heartR: 0.55, ring: 34, late: 0.16, bark: [74, 58, 46], inner: [170, 106, 74], knot: [120, 82, 50] },
  fir: { sap: [232, 214, 182], heart: [220, 200, 166], heartR: 0.5, ring: 28, late: 0.13, bark: [96, 92, 86], inner: [178, 122, 92], knot: [130, 92, 58] },
  pine: { sap: [232, 204, 150], heart: [196, 128, 76], heartR: 0.6, ring: 26, late: 0.22, bark: [112, 72, 50], inner: [196, 120, 80], knot: [118, 64, 34] },
  birch: { sap: [236, 222, 196], heart: [222, 200, 170], heartR: 0.35, ring: 30, late: 0.08, bark: [214, 208, 196], inner: [196, 140, 98], knot: [140, 104, 74] },
  cedar: { sap: [222, 196, 156], heart: [152, 82, 52], heartR: 0.72, ring: 40, late: 0.2, bark: [110, 68, 50], inner: [168, 96, 66], knot: [96, 52, 30] },
};

const SZ = 192;
const endCache = new Map<string, THREE.Texture>();
const sideCache = new Map<string, THREE.Texture>();

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// 4-level ordered dither so gradients become pixel art
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function q(v: number, x: number, y: number, step = 10): number {
  const d = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * step;
  return Math.max(0, Math.min(255, Math.round((v + d) / step) * step));
}

/**
 * End grain for a cut face. UV (0.5, 0.5) is the pith, radius 0.5 is the outside of the bark.
 * `variant` gives different ring patterns for different logs of the same species.
 */
export function endGrainTexture(sp: Species, variant = 0): THREE.Texture {
  const key = `${sp}:${variant % 6}`;
  let t = endCache.get(key);
  if (t) return t;
  const L = WOOD[sp];
  const r = new Rng(`end:${key}`);
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const g = c.getContext('2d')!;
  const img = g.createImageData(SZ, SZ);
  const ecc = [r.range(-0.06, 0.06), r.range(-0.06, 0.06)];
  const phase = Array.from({ length: 6 }, () => r.range(0, Math.PI * 2));
  const checks = Array.from({ length: r.int(1, 4) }, () => ({ a: r.range(0, Math.PI * 2), len: r.range(0.15, 0.4) }));
  const rings = L.ring * r.range(0.8, 1.2);
  const barkT = 0.035 + (sp === 'pine' || sp === 'cedar' ? 0.02 : 0);
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    const u = x / SZ - 0.5, v = y / SZ - 0.5;
    const a = Math.atan2(v, u);
    const wob = 1 + 0.035 * Math.sin(a * 3 + phase[0]) + 0.02 * Math.sin(a * 5 + phase[1]) + 0.012 * Math.sin(a * 11 + phase[2]);
    const rr = Math.hypot(u - ecc[0] * (1 - Math.hypot(u, v) * 2), v - ecc[1] * (1 - Math.hypot(u, v) * 2)) / wob;
    const o = (y * SZ + x) * 4;
    if (rr > 0.5) { img.data[o + 3] = 0; continue; }
    let col: [number, number, number];
    if (rr > 0.5 - barkT) {
      col = mix(L.inner, L.bark, (rr - (0.5 - barkT)) / barkT);
      col = mix(col, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], (Math.sin(a * 40 + phase[3]) * 0.5 + 0.5) * 0.4);
    } else {
      const R = rr / (0.5 - barkT);
      const base = R < L.heartR ? mix(L.heart, L.sap, Math.pow(R / L.heartR, 6) * 0.35) : mix(L.sap, L.heart, 0.15 * (1 - (R - L.heartR) / (1 - L.heartR)));
      // rings: wider near the pith, latewood is a thin dark band
      const ringPos = Math.pow(R, 0.85) * rings;
      const f = ringPos - Math.floor(ringPos);
      const lateBand = f > 1 - L.late * (1.2 - R * 0.4) ? 1 : 0;
      col = mix(base, [base[0] * 0.72, base[1] * 0.66, base[2] * 0.58], lateBand * 0.9 + (1 - f) * 0.12);
      // medullary rays
      const ray = Math.pow(Math.abs(Math.sin(a * 60 + Math.sin(R * 9) * 0.3)), 40);
      col = mix(col, [col[0] * 1.06, col[1] * 1.04, col[2] * 1.0], ray * 0.5);
      // pith
      if (R < 0.025) col = mix(col, L.knot, 0.7);
      // drying checks
      for (const ck of checks) {
        let da = Math.abs(((a - ck.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (R > 1 - ck.len && da < 0.012 + (R - (1 - ck.len)) * 0.02) col = [col[0] * 0.35, col[1] * 0.3, col[2] * 0.26];
        da = 0;
      }
      // a little axe-bruise noise
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const nn = n - Math.floor(n);
      col = [col[0] * (0.95 + nn * 0.08), col[1] * (0.95 + nn * 0.08), col[2] * (0.95 + nn * 0.08)];
    }
    img.data[o] = q(col[0], x, y, 8); img.data[o + 1] = q(col[1], x, y, 8); img.data[o + 2] = q(col[2], x, y, 8); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  t = canvasTex(c);
  endCache.set(key, t);
  return t;
}

/** fresh side grain: fibres run along V. Tiles in V; U spans ~25 cm of wood */
export function sideGrainTexture(sp: Species, rough = false): THREE.Texture {
  const key = `${sp}:${rough}`;
  let t = sideCache.get(key);
  if (t) return t;
  const L = WOOD[sp];
  const r = new Rng(`side:${key}`);
  const W = 96, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const lanes = Array.from({ length: W }, () => r.range(-1, 1));
  const knots = Array.from({ length: r.int(0, 2) }, () => ({ x: r.range(10, W - 10), y: r.range(20, H - 20), s: r.range(4, 9) }));
  const resin = Array.from({ length: r.int(1, 4) }, () => ({ x: r.range(0, W), w: r.range(0.6, 2) }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // fibre lanes with gentle waviness; latewood bands every few px
    let xx = x + Math.sin(y * 0.05 + lanes[(x * 7) % W] * 3) * 1.5;
    let kd = 1;
    for (const k of knots) {
      const d = Math.hypot((x - k.x) * 1.4, (y - k.y) * 0.6);
      if (d < k.s * 3.2) xx += (x - k.x) * (1 - d / (k.s * 3.2)) * 1.3;
      kd = Math.min(kd, d / k.s);
    }
    const band = Math.abs(Math.sin(xx * 0.55)) ;
    let col = mix(L.sap, L.heart, 0.25 + 0.25 * Math.sin(xx * 0.09));
    col = mix(col, [col[0] * 0.8, col[1] * 0.74, col[2] * 0.66], Math.pow(band, 10) * 0.8);
    const fib = Math.sin(x * 91.7 + Math.floor(y / (3 + (x % 4))) * 13.1) * 43758.5;
    const nf = fib - Math.floor(fib);
    col = mix(col, [col[0] * 0.9, col[1] * 0.88, col[2] * 0.84], nf * (rough ? 0.5 : 0.25));
    for (const rs of resin) if (Math.abs(x - rs.x) < rs.w) col = mix(col, [200, 150, 70], 0.35);
    if (kd < 1) col = mix(L.knot, [L.knot[0] * 0.6, L.knot[1] * 0.55, L.knot[2] * 0.5], 1 - kd);
    if (rough && nf > 0.93) col = [col[0] * 0.75, col[1] * 0.72, col[2] * 0.68];
    const o = (y * W + x) * 4;
    img.data[o] = q(col[0], x, y, 8); img.data[o + 1] = q(col[1], x, y, 8); img.data[o + 2] = q(col[2], x, y, 8); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  t = canvasTex(c, { repeat: true });
  sideCache.set(key, t);
  return t;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function woodMaterial(kind: 'end' | 'side' | 'split', sp: Species, variant = 0): THREE.MeshStandardMaterial {
  const key = `${kind}:${sp}:${variant % 6}`;
  let m = matCache.get(key);
  if (!m) {
    const map = kind === 'end' ? endGrainTexture(sp, variant) : sideGrainTexture(sp, kind === 'split');
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, alphaTest: kind === 'end' ? 0.5 : 0 });
    matCache.set(key, m);
  }
  return m;
}
