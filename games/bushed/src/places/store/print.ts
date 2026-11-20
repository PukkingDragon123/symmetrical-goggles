// Round-5 printed matter and grime for the built places (store, forge, campground, Kettle camp): the materials of
// the two atlases made by make_store_print.py and small writers that put cards, decals and terrain-hugging ground
// decals into a Mesher (so everything stays merged: one draw call per material per mesh).
//   sp        printed/painted cards (alpha-tested: torn edges, die-cut vinyl)   sp_ds  the same, double sided
//   sp_glow   light boxes and lit signs (the atlas as its own emissive map; setGlow() dims them)
//   grime     soft dark/pale decals (contact shadows, wear, mud, ruts, drips, soot, dust, moss, leaves)
//   glowadd   additive light pools and halos            puddle  glossy dark water in ruts
import * as THREE from 'three';
import { loadTex } from '../../gfx/tex';
import { defineMat, hasMat, V, type Mesher } from '../kit';
import { PRINT_RECTS, GRIME_RECTS, PRINT_SIZE, GRIME_SIZE } from './print_rects';

type Rect = [number, number, number, number];
function uvOf(r: Rect | undefined, S: number, key: string): Rect {
  if (!r) throw new Error(`no print atlas entry ${key}`);
  const e = 0.35;
  return [(r[0] + e) / S, 1 - (r[1] + r[3] - e) / S, (r[0] + r[2] - e) / S, 1 - (r[1] + e) / S];
}
export const PUV = (k: string): Rect => uvOf(PRINT_RECTS[k], PRINT_SIZE, k);
export const GUV = (k: string): Rect => uvOf(GRIME_RECTS[k], GRIME_SIZE, k);
/** a sub-rectangle (0..1 fractions of the entry) of a print atlas entry: strips of tags, wrappers, lure cards */
export function PSUB(k: string, fx0: number, fx1: number, fy0 = 0, fy1 = 1): Rect {
  const r = PRINT_RECTS[k];
  const S = PRINT_SIZE, e = 0.35;
  const x0 = r[0] + r[2] * fx0, x1 = r[0] + r[2] * fx1, y0 = r[1] + r[3] * fy0, y1 = r[1] + r[3] * fy1;
  return [(x0 + e) / S, 1 - (y1 - e) / S, (x1 - e) / S, 1 - (y0 + e) / S];
}

let glowMat: THREE.MeshStandardMaterial | null = null;
let done = false;
export function ensureStoreMats(): void {
  if (done && hasMat('sp')) return;
  done = true;
  const t = loadTex('places/store_print.png', { repeat: false });
  const g = loadTex('places/store_grime.png', { repeat: false });
  defineMat('sp', new THREE.MeshStandardMaterial({ name: 'place_sp', map: t, roughness: 0.85, alphaTest: 0.5 }));
  defineMat('sp_ds', new THREE.MeshStandardMaterial({ name: 'place_sp_ds', map: t, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide }));
  // soft print (the ghost ad: weathered paint the siding shows through)
  defineMat('sp_soft', new THREE.MeshStandardMaterial({
    name: 'place_sp_soft', map: t, roughness: 0.9, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  defineMat('sp_tin', new THREE.MeshStandardMaterial({ name: 'place_sp_tin', map: t, roughness: 0.45, metalness: 0.35, alphaTest: 0.5 }));
  glowMat = new THREE.MeshStandardMaterial({ name: 'place_sp_glow', map: t, emissiveMap: t, emissive: new THREE.Color(1, 0.95, 0.85), emissiveIntensity: 1.1, roughness: 0.35 });
  defineMat('sp_glow', glowMat);
  const grime = new THREE.MeshStandardMaterial({
    name: 'place_grime', map: g, roughness: 1, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  defineMat('grime', grime);
  defineMat('glowadd', new THREE.MeshBasicMaterial({
    name: 'place_glowadd', map: g, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1, 0.62, 0.32),
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false, fog: false,
  }));
  defineMat('puddle', new THREE.MeshStandardMaterial({
    name: 'place_puddle', map: g, color: 0x8a9298, roughness: 0.06, metalness: 0.5, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
}
/** lit signs: 0..1 */
export function setGlow(k: number): void { if (glowMat) glowMat.emissiveIntensity = 1.1 * k; }

/** a card of an atlas entry centred at the current origin in the XY plane, facing +Z */
export function card(ms: Mesher, key: string, w: number, h: number, mat = 'sp', uv?: Rect): void {
  const [u0, v0, u1, v1] = uv ?? (key.startsWith('g_') ? GUV(key) : PUV(key));
  ms.quad(mat, V(-w / 2, -h / 2, 0), V(w / 2, -h / 2, 0), V(w / 2, h / 2, 0), V(-w / 2, h / 2, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
}

/** a card at (x,y,z) with yaw ry and roll rz (tilt in its own plane), pushed `out` metres along its normal */
export function cardAt(ms: Mesher, key: string, x: number, y: number, z: number, ry: number, w: number, h: number, rz = 0, mat = 'sp', uv?: Rect): void {
  ms.pushT(x, y, z, ry, 0, rz);
  card(ms, key, w, h, mat, uv);
  ms.pop();
}

/** a flat decal on a horizontal surface at height y (grime atlas), yaw ry */
export function floorDecal(ms: Mesher, key: string, x: number, y: number, z: number, w: number, d: number, ry = 0, mat = 'grime'): void {
  ms.pushT(x, y, z, ry, -Math.PI / 2);
  card(ms, key, w, d, mat);
  ms.pop();
}

/**
 * A ground decal that hugs uneven ground: a grid of `nx` x `nz` quads over a w x d rectangle (local frame of the
 * mesher), each vertex lifted to `ground(x, z) + lift`. Used for tyre ruts, puddles, leaf litter on terrain.
 */
export function groundDecal(ms: Mesher, key: string, cx: number, cz: number, w: number, d: number, ry: number, ground: (x: number, z: number) => number,
  o: { nx?: number; nz?: number; lift?: number; mat?: string; vRepeat?: number } = {}): void {
  const nx = o.nx ?? 2, nz = o.nz ?? Math.max(2, Math.ceil(d / 0.8));
  const lift = o.lift ?? 0.025, mat = o.mat ?? 'grime';
  const [u0, v0, u1, v1] = GUV(key);
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (i: number, j: number) => {
    const lx = (i / nx - 0.5) * w, lz = (j / nz - 0.5) * d;
    const x = cx + c * lx + s * lz, z = cz - s * lx + c * lz;
    return V(x, ground(x, z) + lift, z);
  };
  const rep = o.vRepeat ?? 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    // v runs along the decal's length; a repeat > 1 tiles the cell (ruts) by folding the coordinate back
    const t0 = (j / nz) * rep, t1 = ((j + 1) / nz) * rep;
    const f0 = t0 - Math.floor(t0), f1 = t1 - Math.floor(t0);
    const va = v0 + (v1 - v0) * f0, vb = v0 + (v1 - v0) * Math.min(f1, 1);
    const ua = u0 + (u1 - u0) * (i / nx), ub = u0 + (u1 - u0) * ((i + 1) / nx);
    ms.quad(mat, P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), P(i, j), [ua, va], [ub, va], [ub, vb], [ua, vb]);
  }
}
