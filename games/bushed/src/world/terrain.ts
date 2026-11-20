// Terrain: 64 m chunks with distance LOD (1/2/4/8 m grids, skirts hide cracks). Each vertex carries material
// weights computed from the layout (12 photo-scanned pixel-art layers: forest duff, leaf litter, moss, grass, dirt,
// mud, gravel, granite, lichen rock, shore pebbles, the rutted gravel road strip and the muddy skid trail), the
// site (wetness from hollows and water, rock outcrops on knolls and slopes, the old burn) and road coordinates.
// Per pixel the shader keeps the four strongest layers, height-blends them with their albedo and normal maps
// (textureGrad, so the mip choice stays right across layer changes), and adds:
//   - worn footpaths and trampled yards from a baked wear map (cabin, woodpile, firepit, store, campground, the
//     lake trail's end), with exposed roots across the worn cores
//   - road ruts from the road-strip texture in road space, puddles in the ruts and in wet low spots that mirror
//     the sky (the Renderer's sky probe), wet darkening and gloss by rain, mud and the marks map
//   - a wet band along the lake shore
// The terrain also bakes the ground-mist field the Renderer's atmosphere pass reads (hollows fill with mist at
// dawn, a thick bank lies over the lake).
import * as THREE from 'three';
import { WORLD, heightAt, roadInfo, biome, SPOTS } from './layout';
import { Noise, smoothstep, clamp } from '../core/noise';
import { G } from '../gfx/globals';
import { marks } from './marks';

const CHUNK = 64;
const LODS = [64, 32, 16, 8];
export const LAYERS = ['needles', 'leaves', 'moss', 'grass', 'dirt', 'mud', 'gravel', 'rock', 'lichen', 'pebbles', 'roadruts', 'mudruts'] as const;
const NL = LAYERS.length;
/** real-world metres covered by one tile of each layer (index.json overrides) */
const TILE_M = [2.0, 3.0, 2.0, 2.0, 2.0, 1.3, 2.0, 1.5, 2.0, 2.16, 4.0, 2.25];
const TEX = 512;

const nz = new Noise(WORLD.seed + 101);
const nr = new Noise(WORLD.seed + 202);

type Bio = ReturnType<typeof biome> & { conv: number };

/** the 12 layer weights + site values for one vertex (written into out / site) */
function weightsAt(x: number, z: number, h: number, slope: number, b: Bio, out: Float32Array, site: Float32Array): void {
  const r = roadInfo(x, z);
  out.fill(0);
  const patch = nz.fbm2(x / 23, z / 23, 3);
  const patch2 = nz.fbm2(x / 9 + 40, z / 9, 2);
  const conv = b.conv; // + knoll / ridge, - hollow (metres above the 8 m neighbourhood)
  const hollow = clamp(-conv / 1.6, 0, 1), knoll = clamp(conv / 1.4, 0, 1);
  const nearWater = 1 - smoothstep(WORLD.waterY + 0.3, WORLD.waterY + 3.5, h);
  const wet = clamp(b.wet * 0.75 + hollow * 0.5 + nearWater * 0.6 - knoll * 0.3 + patch2 * 0.12, 0, 1);
  // forest floor baseline: needle duff, birch leaf litter, moss in the damp and the old growth
  out[0] = 1.0 + 0.4 * patch;
  out[1] = clamp(b.birch * 0.8 - 0.3 + patch2 * 0.6, 0, 1.5);
  out[2] = clamp(wet * 1.6 - 0.45 + patch * 0.5 + b.old * 0.8, 0, 2.2);
  out[3] = clamp(0.25 - b.density * 0.4 + patch2 * 0.5 - wet * 0.2, 0, 1);
  out[4] = clamp(0.12 + patch2 * 0.3 + knoll * 0.2, 0, 1);
  out[5] = clamp((wet - 0.68) * 2.6 + patch2 * 0.4, 0, 1.3);
  // open clearings get grass and trampled dirt
  const dc = Math.hypot(x - SPOTS.cabin.x, z - SPOTS.cabin.z);
  const ds = Math.hypot(x - SPOTS.store.x, z - SPOTS.store.z);
  const open = Math.max(1 - smoothstep(10, 30, dc), 1 - smoothstep(18, 46, ds), 1 - smoothstep(6, 16, Math.hypot(x - SPOTS.campsite.x, z - SPOTS.campsite.z)));
  out[3] += open * (1.4 + patch);
  out[4] += open * 0.6 * (1 - smoothstep(4, 12, dc));
  out[0] *= 1 - open * 0.7;
  // rock outcrops: Canadian Shield bedrock breaking through on knolls, ridges and slopes; lichen on the old tops
  const crop = smoothstep(0.5, 0.78, nr.fbm2(x / 15, z / 15, 3) * 0.6 + 0.35 + knoll * 0.45 + slope * 0.9 - b.density * 0.25 - open * 0.6 - wet * 0.3);
  const steep = smoothstep(0.32, 0.6, slope);
  out[7] += steep * 3 + crop * 1.6 * (0.5 + 0.5 * slope);
  out[8] += crop * 2.0 * (1 - slope) + steep * 0.6 * knoll;
  out[2] += crop * 0.35 * wet + (crop > 0.05 && crop < 0.5 ? 0.4 : 0);
  // shoreline: pebbles and wet mud at the water's edge, rock where it shelves steeply
  if (h < WORLD.waterY + 1.4) {
    const s = 1 - smoothstep(WORLD.waterY + 0.2, WORLD.waterY + 1.4, h);
    out[9] += s * (1.6 + patch2);
    out[4] += s * 0.5; out[5] += s * 0.6 * (0.5 + patch);
    out[0] *= 1 - s * 0.8; out[1] *= 1 - s * 0.6;
  }
  if (h < WORLD.waterY + 0.1) out[7] += 0.5;
  // roads: the rutted gravel strip on the graded roads, mud ruts on the skid trail, packed dirt on footpaths
  if (r.road >= 0) {
    const graded = r.id === 'highway' || r.id === 'cabin_road';
    const onRoad = 1 - smoothstep(r.w - 0.4, r.w + 0.6, r.d);
    const shoulder = (1 - smoothstep(r.w + 0.4, r.w + 2.6, r.d)) * (1 - onRoad);
    for (let i = 0; i < NL; i++) out[i] *= 1 - onRoad * (graded ? 1 : 0.85);
    if (graded) {
      out[10] += onRoad * 2.6;
      out[6] += onRoad * 0.25 + shoulder * 0.9;
      out[4] += shoulder * 0.9;
    } else if (r.id === 'lake_trail') {
      out[11] += onRoad * (1.4 + wet);
      out[4] += onRoad * 0.9;
      out[3] += onRoad * 0.3;
    } else {
      out[4] += onRoad * 1.6;
      out[1] += onRoad * 0.3;
    }
    out[3] += shoulder * 0.7;
    out[5] += shoulder * 0.3 * wet;
  }
  if (b.burn > 0.3) { out[4] += b.burn; out[0] *= 1 - b.burn * 0.6; }
  let s = 0;
  for (let i = 0; i < NL; i++) s += out[i];
  s = s || 1;
  for (let i = 0; i < NL; i++) out[i] /= s;
  site[0] = wet; site[1] = crop; site[2] = b.burn; site[3] = hollow;
}

interface ChunkEntry { mesh: THREE.Mesh; lod: number; geos: (THREE.BufferGeometry | null)[] }

const wScratch = new Float32Array(NL), sScratch = new Float32Array(4);

function buildChunkGeometry(cx: number, cz: number, lod: number): THREE.BufferGeometry {
  const n = LODS[lod];
  const step = CHUNK / n;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  // heights with a 1-cell border for normals
  const N = n + 3;
  const hs = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hs[j * N + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const H = (i: number, j: number) => hs[(j + 1) * N + (i + 1)];
  // biome + convexity on a coarse 8 m grid, bilinear
  const bs = 8;
  const bn = Math.ceil(CHUNK / bs) + 1;
  const bio: Bio[] = [];
  for (let j = 0; j < bn; j++) for (let i = 0; i < bn; i++) {
    const x = x0 + i * bs, z = z0 + j * bs;
    const h0 = heightAt(x, z);
    const ring = (heightAt(x + 10, z) + heightAt(x - 10, z) + heightAt(x, z + 10) + heightAt(x, z - 10)) * 0.25;
    bio.push({ ...biome(x, z), conv: h0 - ring });
  }
  const bioAt = (lx: number, lz: number): Bio => {
    const fx = Math.min(bn - 1.001, lx / bs), fz = Math.min(bn - 1.001, lz / bs);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = bio[j * bn + i], b = bio[j * bn + i + 1], c = bio[(j + 1) * bn + i], d = bio[(j + 1) * bn + i + 1];
    const m = (k: keyof Bio) => (a[k] * (1 - tx) + b[k] * tx) * (1 - tz) + (c[k] * (1 - tx) + d[k] * tx) * tz;
    return { spruce: m('spruce'), fir: m('fir'), pine: m('pine'), birch: m('birch'), cedar: m('cedar'), density: m('density'), wet: m('wet'), burn: m('burn'), old: m('old'), conv: m('conv') };
  };

  const vcount = (n + 1) * (n + 1) + 4 * (n + 1);
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3);
  const m0 = new Float32Array(vcount * 4), m1 = new Float32Array(vcount * 4), m2 = new Float32Array(vcount * 4);
  const rd = new Float32Array(vcount * 4), rdir = new Float32Array(vcount * 2), st = new Float32Array(vcount * 4);
  let v = 0;
  const put = (i: number, j: number, drop: number) => {
    const x = x0 + i * step, z = z0 + j * step;
    const h = H(i, j);
    pos[v * 3] = x; pos[v * 3 + 1] = h - drop; pos[v * 3 + 2] = z;
    const dx = H(i + 1, j) - H(i - 1, j), dz = H(i, j + 1) - H(i, j - 1);
    let nx = -dx, ny = 2 * step, nzz = -dz;
    const l = Math.hypot(nx, ny, nzz); nx /= l; ny /= l; nzz /= l;
    nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nzz;
    weightsAt(x, z, h, 1 - ny, bioAt(i * step, j * step), wScratch, sScratch);
    for (let k = 0; k < 4; k++) { m0[v * 4 + k] = wScratch[k]; m1[v * 4 + k] = wScratch[4 + k]; m2[v * 4 + k] = wScratch[8 + k]; st[v * 4 + k] = sScratch[k]; }
    const r = roadInfo(x, z);
    if (r.road >= 0 && r.d < r.w + 6) {
      const kind = r.id === 'highway' ? 0 : r.id === 'cabin_road' ? 1 : r.id === 'lake_trail' ? 2 : 3;
      rd[v * 4] = clamp(r.side, -20, 20); rd[v * 4 + 1] = r.t; rd[v * 4 + 2] = r.w; rd[v * 4 + 3] = kind;
      rdir[v * 2] = r.dirX; rdir[v * 2 + 1] = r.dirZ;
    } else {
      rd[v * 4] = 99; rd[v * 4 + 1] = 0; rd[v * 4 + 2] = 0; rd[v * 4 + 3] = -1;
      rdir[v * 2] = 0; rdir[v * 2 + 1] = 1;
    }
    v++;
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) put(i, j, 0);
  const idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + (n + 1), d = c + 1;
    // alternate the diagonal for a less regular look
    if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  // skirts
  const drop = 2 + lod * 2;
  const edge = (pts: [number, number][], flip: boolean) => {
    const start = v;
    for (const [i, j] of pts) put(i, j, drop);
    for (let k = 0; k < pts.length - 1; k++) {
      const [i0, j0] = pts[k], [i1, j1] = pts[k + 1];
      const a = j0 * (n + 1) + i0, b = j1 * (n + 1) + i1, c = start + k, d = start + k + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  };
  const row = (j: number) => Array.from({ length: n + 1 }, (_, i) => [i, j] as [number, number]);
  const col = (i: number) => Array.from({ length: n + 1 }, (_, j) => [i, j] as [number, number]);
  edge(row(0), true); edge(row(n), false); edge(col(0), false); edge(col(n), true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
  g.setAttribute('aMat0', new THREE.BufferAttribute(m0.subarray(0, v * 4), 4));
  g.setAttribute('aMat1', new THREE.BufferAttribute(m1.subarray(0, v * 4), 4));
  g.setAttribute('aMat2', new THREE.BufferAttribute(m2.subarray(0, v * 4), 4));
  g.setAttribute('aRoad', new THREE.BufferAttribute(rd.subarray(0, v * 4), 4));
  g.setAttribute('aRoadDir', new THREE.BufferAttribute(rdir.subarray(0, v * 2), 2));
  g.setAttribute('aSite', new THREE.BufferAttribute(st.subarray(0, v * 4), 4));
  g.setIndex(idx);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** fallback layer texture: noisy painted colour (used until the photo textures load) */
function fallbackLayer(i: number, normal: boolean): Uint8Array {
  const base: [number, number, number][] = [
    [92, 64, 40], [120, 82, 44], [66, 92, 38], [84, 104, 46], [104, 82, 58], [62, 48, 36], [118, 110, 98], [104, 102, 98],
    [70, 64, 58], [120, 116, 108], [112, 100, 86], [70, 56, 42],
  ];
  const out = new Uint8Array(TEX * TEX * 4);
  if (normal) { for (let p = 0; p < TEX * TEX; p++) { out[p * 4] = 128; out[p * 4 + 1] = 128; out[p * 4 + 2] = 255; out[p * 4 + 3] = 255; } return out; }
  const n = new Noise(77 + i);
  for (let y = 0; y < TEX; y += 2) for (let x = 0; x < TEX; x += 2) {
    const u = x / TEX, v = y / TEX;
    // tileable noise via torus mapping (2x2 pixel blocks: quick to make, still reads as texture)
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const f = n.n3(Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(b) * 3 + Math.sin(b) * 1.7) * 0.5
      + n.n3(Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(b) * 9 + Math.sin(b) * 12) * 0.35;
    const k = 0.75 + 0.35 * f;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const o = ((y + dy) * TEX + x + dx) * 4;
      out[o] = clamp(base[i][0] * k, 0, 255); out[o + 1] = clamp(base[i][1] * k, 0, 255); out[o + 2] = clamp(base[i][2] * k, 0, 255);
      out[o + 3] = clamp(128 + 120 * f, 0, 255);
    }
  }
  return out;
}

function arrayTex(srgb: boolean, normal: boolean): THREE.DataArrayTexture {
  const data = new Uint8Array(TEX * TEX * 4 * NL);
  for (let i = 0; i < NL; i++) data.set(fallbackLayer(i, normal), i * TEX * TEX * 4);
  const t = new THREE.DataArrayTexture(data, TEX, TEX, NL);
  t.format = THREE.RGBAFormat;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------- mist field
/** ground-mist field over the world: R = mist top height, G = ground (or water) height. 8 m texels */
function bakeMist(): THREE.DataTexture {
  const n = 256, size = WORLD.half * 2, cell = size / n;
  const g = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g[j * n + i] = Math.max(heightAt(-WORLD.half + (i + 0.5) * cell, -WORLD.half + (j + 0.5) * cell), WORLD.waterY);
  }
  // wide blur: the neighbourhood level a hollow fills up to
  const blur = (src: Float32Array, r: number): Float32Array => {
    const a = new Float32Array(n * n), b = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) { const ii = i + k; if (ii >= 0 && ii < n) { s += src[j * n + ii]; c++; } }
      a[j * n + i] = s / c;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) { const jj = j + k; if (jj >= 0 && jj < n) { s += a[jj * n + i]; c++; } }
      b[j * n + i] = s / c;
    }
    return b;
  };
  const gb = blur(blur(g, 4), 4);
  const data = new Uint16Array(n * n * 2);
  const L = SPOTS.lake;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -WORLD.half + (i + 0.5) * cell, z = -WORLD.half + (j + 0.5) * cell;
    let top = Math.max(g[k] + 1.3, Math.min(gb[k] - 0.8, g[k] + 9));
    // a thick bank over the lake that spills onto the low shore
    const dl = Math.hypot(x - L.x, z - L.z) / L.r;
    top = Math.max(top, WORLD.waterY + 4.5 * (1 - smoothstep(1.0, 1.5, dl)));
    // the old-growth hollow is the wettest, mistiest place in the bush
    const dh = Math.hypot(x - SPOTS.hollow.x, z - SPOTS.hollow.z) / SPOTS.hollow.r;
    top += 3 * (1 - smoothstep(0.3, 1.0, dh));
    data[k * 2] = THREE.DataUtils.toHalfFloat(top);
    data[k * 2 + 1] = THREE.DataUtils.toHalfFloat(g[k]);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------------------------- wear map
/** four baked regions (footpaths, trampled yards, wet spots), 512 px each in a 1024 atlas */
const WEAR_RES = 1024;
interface WearRegion { x: number; z: number; size: number; ax: number; ay: number }
const WEAR_REGIONS: WearRegion[] = [
  { x: SPOTS.cabin.x + 4, z: SPOTS.cabin.z, size: 112, ax: 0, ay: 0 },
  { x: SPOTS.store.x, z: SPOTS.store.z - 8, size: 128, ax: 512, ay: 0 },
  { x: SPOTS.campsite.x - 12, z: SPOTS.campsite.z - 36, size: 128, ax: 0, ay: 512 },
  { x: 136, z: -40, size: 48, ax: 512, ay: 512 },
];
/** anchor names that footpaths connect (found in the scene once the places are built) */
const SITE_NAMES = ['door', 'porch', 'woodshed_stack', 'chopping_block', 'sawbuck', 'firepit', 'jeep_park', 'gas_pump', 'log_deck', 'porch_bench', 'forge_fire', 'anvil_face'];

class Wear {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly uRegions = { value: WEAR_REGIONS.map((r) => new THREE.Vector4(r.x - r.size / 2, r.z - r.size / 2, r.size, 0)) };
  private ctx: CanvasRenderingContext2D;
  private sig = '';
  constructor() {
    this.canvas.width = this.canvas.height = WEAR_RES;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.magFilter = THREE.LinearFilter; this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.paint(new Map());
  }

  /** repaint when the set of known anchors changed */
  refresh(sites: Map<string, THREE.Vector3[]>): void {
    let sig = '';
    for (const [k, v] of sites) sig += k + v.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';');
    if (sig === this.sig) return;
    this.sig = sig;
    this.paint(sites);
  }

  private paint(sites: Map<string, THREE.Vector3[]>): void {
    const c = this.ctx;
    c.save();
    c.fillStyle = '#000'; c.fillRect(0, 0, WEAR_RES, WEAR_RES);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round'; c.lineJoin = 'round';
    const cab = SPOTS.cabin, rot = cab.rot ?? 0;
    const near = (name: string, sx: number, sz: number, r: number): THREE.Vector3 | null => {
      let best: THREE.Vector3 | null = null, bd = r;
      for (const p of sites.get(name) ?? []) { const d = Math.hypot(p.x - sx, p.z - sz); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    // cabin-local fallback (the door faces rot): door 3 m out front
    const fx = Math.sin(rot), fz = Math.cos(rot);
    const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    const door = near('door', cab.x, cab.z, 40) ?? v(cab.x + fx * 4, cab.z + fz * 4);
    const porch = near('porch', cab.x, cab.z, 40) ?? door;
    const step = v(porch.x + fx * 1.6, porch.z + fz * 1.6);
    const spots = {
      woodshed: near('woodshed_stack', cab.x, cab.z, 60) ?? v(SPOTS.woodyard.x, SPOTS.woodyard.z),
      block: near('chopping_block', cab.x, cab.z, 60),
      saw: near('sawbuck', cab.x, cab.z, 60),
      pit: near('firepit', cab.x, cab.z, 60),
      jeep: near('jeep_park', cab.x, cab.z, 60) ?? v(cab.x - 11.5, cab.z - 6.5),
      forge: near('forge_fire', cab.x, cab.z, 60) ?? near('anvil_face', cab.x, cab.z, 60),
      lake: v(14, -10), hollow: v(8, 20),
    };
    const out: THREE.Vector3[] = [];
    for (const [k, list] of sites) if (k.includes('outhouse')) for (const p of list) if (Math.hypot(p.x - cab.x, p.z - cab.z) < 60) out.push(p);
    const R = 0, Gc = 1, B = 2;
    // a meandering path: core (G, packed earth) inside a trampled margin (R)
    const path = (a: THREE.Vector3, b: THREE.Vector3, core: number, margin: number, seed: number, amt = 1) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) return;
      const nx = -(b.z - a.z) / len, nzz = (b.x - a.x) / len;
      const pts: [number, number][] = [];
      const segs = Math.max(2, Math.ceil(len / 2.5));
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, wob = (i === 0 || i === segs) ? 0 : nz.n2(seed * 13.1 + t * len * 0.09, seed) * Math.min(1.4, len * 0.08);
        pts.push([a.x + (b.x - a.x) * t + nx * wob, a.z + (b.z - a.z) * t + nzz * wob]);
      }
      this.stroke(pts, R, margin, 0.55 * amt, 4);
      this.stroke(pts, Gc, core, 0.8 * amt, 1.2);
      this.stroke(pts, Gc, core * 0.45, 0.4 * amt, 0.4);
    };
    const patch = (p: THREE.Vector3, r: number, ch: number, amt: number) => this.disc(p.x, p.z, r, ch, amt);
    // ---- the cabin yard
    for (const [k, p] of Object.entries(spots)) {
      if (!p) continue;
      const seed = k.length * 7.3;
      if (k === 'lake' || k === 'hollow') path(step, p, 0.6, 1.5, seed, 0.9);
      else if (k === 'jeep') path(step, p, 0.75, 2.0, seed);
      else path(step, p, 0.65, 1.7, seed);
    }
    if (spots.block && spots.woodshed) path(spots.block, spots.woodshed, 0.6, 1.4, 3.3);
    if (spots.pit && spots.woodshed) path(spots.pit, spots.woodshed, 0.5, 1.2, 4.1, 0.7);
    for (const o of out) { path(step, o, 0.55, 1.4, 5.5); patch(o, 1.3, R, 0.6); patch(o, 0.8, B, 0.5); }
    patch(step, 2.2, R, 0.7); patch(step, 1.2, Gc, 0.5);
    patch(step, 1.4, B, 0.35);  // drip line mud at the porch steps
    if (spots.block) { patch(spots.block, 2.6, R, 0.8); patch(spots.block, 1.5, Gc, 0.5); }
    if (spots.saw) patch(spots.saw, 1.8, R, 0.6);
    if (spots.pit) { patch(spots.pit, 3.4, R, 0.75); patch(spots.pit, 2.4, Gc, 0.45); }
    patch(spots.woodshed, 2.2, R, 0.6);
    if (spots.forge) patch(spots.forge, 2.2, R, 0.7);
    patch(spots.jeep, 3.6, R, 0.7); patch(spots.jeep, 2.2, B, 0.45);
    // ---- the store: the lot in front, the pump island, the log deck
    const st = SPOTS.store;
    const sdoor = near('door', st.x, st.z, 60) ?? v(st.x, st.z - 10);
    const pump = near('gas_pump', st.x, st.z, 70);
    const deck = near('log_deck', st.x, st.z, 80);
    const bench = near('porch_bench', st.x, st.z, 60);
    const roadP = v(st.x + (sdoor.x - st.x) * 0.2, st.z - 36);
    patch(v(sdoor.x, (sdoor.z + roadP.z) / 2), 9, R, 0.55);
    path(sdoor, roadP, 1.0, 3.0, 7.7);
    if (pump) { path(sdoor, pump, 0.7, 1.8, 8.1); patch(pump, 3.2, R, 0.7); patch(pump, 2.0, B, 0.5); }
    if (deck) { path(sdoor, deck, 0.6, 1.6, 9.2); patch(deck, 3.5, R, 0.6); patch(deck, 2.0, B, 0.35); }
    if (bench) patch(bench, 1.5, R, 0.4);
    for (let i = 0; i < 9; i++) {
      const px = st.x + nz.n2(i * 3.1, 9) * 14, pz = st.z - 22 + nz.n2(i * 2.3, 3) * 9;
      this.disc(px, pz, 0.8 + Math.abs(nz.n2(i, 1)) * 1.4, B, 0.55);
    }
    // ---- the campground: fire ring, the chopping spot, the tents' side, down to the lake
    const cs = SPOTS.campsite;
    const ring = v(cs.x, cs.z);
    patch(ring, 4.2, R, 0.8); patch(ring, 3.0, Gc, 0.4);
    path(ring, v(cs.x + 4, cs.z - 3), 0.55, 1.4, 11.1); patch(v(cs.x + 4, cs.z - 3), 1.8, R, 0.6);
    path(ring, v(cs.x + 6, cs.z + 4), 0.55, 1.4, 12.3); patch(v(cs.x + 6, cs.z + 4), 2.0, R, 0.5);
    path(ring, v(cs.x - 7, cs.z + 6), 0.5, 1.3, 13.7);
    path(ring, v(cs.x - 18, cs.z - 34), 0.6, 1.5, 14.9);
    path(v(cs.x - 18, cs.z - 34), v(cs.x - 24, cs.z - 70), 0.55, 1.4, 15.2);
    // ---- the lake trail runs on down to the water, a muddy landing at the edge
    path(v(132, -42), v(143, -40), 0.6, 1.8, 16.6);
    this.disc(142, -40.5, 2.2, B, 0.8);
    c.restore();
    this.texture.needsUpdate = true;
  }

  private toPx(x: number, z: number): [number, number, number] | null {
    for (let i = 0; i < WEAR_REGIONS.length; i++) {
      const r = WEAR_REGIONS[i];
      const u = (x - (r.x - r.size / 2)) / r.size, w = (z - (r.z - r.size / 2)) / r.size;
      if (u >= -0.05 && w >= -0.05 && u <= 1.05 && w <= 1.05) return [r.ax + u * 512, r.ay + w * 512, 512 / r.size];
    }
    return null;
  }

  /** draw a polyline in every region it touches (clipped to each region's cell) */
  private stroke(pts: [number, number][], ch: number, width: number, amt: number, blur: number): void {
    const c = this.ctx;
    const col = [0, 0, 0]; col[ch] = Math.round(255 * Math.min(1, amt));
    for (const r of WEAR_REGIONS) {
      const k = 512 / r.size, ox = r.x - r.size / 2, oz = r.z - r.size / 2;
      c.save();
      c.beginPath(); c.rect(r.ax, r.ay, 512, 512); c.clip();
      c.filter = `blur(${(blur * k * 0.25).toFixed(1)}px)`;
      c.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      c.lineWidth = width * k;
      c.beginPath();
      pts.forEach(([x, z], i) => { const px = r.ax + (x - ox) * k, pz = r.ay + (z - oz) * k; if (i) c.lineTo(px, pz); else c.moveTo(px, pz); });
      c.stroke();
      c.restore();
    }
  }

  private disc(x: number, z: number, rad: number, ch: number, amt: number): void {
    const p = this.toPx(x, z);
    if (!p) return;
    const c = this.ctx;
    for (const r of WEAR_REGIONS) {
      const k = 512 / r.size, ox = r.x - r.size / 2, oz = r.z - r.size / 2;
      const px = r.ax + (x - ox) * k, pz = r.ay + (z - oz) * k;
      if (px < r.ax - rad * k || pz < r.ay - rad * k || px > r.ax + 512 + rad * k || pz > r.ay + 512 + rad * k) continue;
      c.save();
      c.beginPath(); c.rect(r.ax, r.ay, 512, 512); c.clip();
      const g = c.createRadialGradient(px, pz, 0, px, pz, rad * k);
      const col = [0, 0, 0]; col[ch] = 255;
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${Math.min(1, amt)})`);
      g.addColorStop(0.6, `rgba(${col[0]},${col[1]},${col[2]},${Math.min(1, amt) * 0.6})`);
      g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      c.fillStyle = g;
      c.beginPath(); c.arc(px, pz, rad * k, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------- material
const TERRAIN_FRAG_HEAD = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray tLayers; uniform sampler2DArray tNormals; uniform sampler2D tMarks; uniform vec2 uMarksOrigin; uniform float uMarksSize;
uniform sampler2D tWear; uniform vec4 uWearR[4]; uniform sampler2D tSkyProbe;
uniform float uTile[${NL}]; uniform float uWet; uniform float uSnow; uniform vec3 uCamPos; uniform float uTime;
varying vec4 vMat0; varying vec4 vMat1; varying vec4 vMat2; varying vec4 vRoad; varying vec2 vRoadDir; varying vec4 vSite;
varying vec3 vWPos; varying vec3 vWNor;
float th21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(th21(i), th21(i + vec2(1, 0)), f.x), mix(th21(i + vec2(0, 1)), th21(i + vec2(1, 1)), f.x), f.y); }
vec3 wearAt(vec2 p) {
  for (int i = 0; i < 4; i++) {
    vec2 u = (p - uWearR[i].xy) / uWearR[i].z;
    if (u.x > 0.0 && u.y > 0.0 && u.x < 1.0 && u.y < 1.0) {
      vec2 a = vec2(mod(float(i), 2.0), floor(float(i) / 2.0)) * 0.5;
      return texture2D(tWear, a + u * 0.5).rgb;
    }
  }
  return vec3(0.0);
}
// exposed roots across worn ground: a curving root per 1.7 m cell, some cells empty
float rootAt(vec2 p, out float across) {
  vec2 c = floor(p / 1.7), f = p / 1.7 - c;
  float h = th21(c + 3.7);
  across = 1.0;
  if (h > 0.6) return 0.0;
  float a = h * 9.0;
  vec2 dir = vec2(cos(a), sin(a));
  vec2 q = f - 0.5;
  float al = dot(q, dir), ac = dot(q, vec2(-dir.y, dir.x));
  ac += 0.07 * sin(al * 9.0 + h * 30.0) + 0.04 * sin(al * 23.0);
  float w = 0.045 * (1.0 - abs(al) * 1.3) + 0.012;
  across = ac / w;
  return (1.0 - smoothstep(0.6, 1.0, abs(across))) * step(abs(al), 0.48);
}
vec3 probeSky(vec3 d) {
  d.y = max(d.y, 0.0);
  vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, 0.0, 1.0)) / 3.14159265 + 0.5);
  return texture2D(tSkyProbe, uv).rgb;
}
`;

const TERRAIN_MAP = /* glsl */`
  vec2 wp = vWPos.xz;
  float camD = distance(uCamPos, vWPos);
  float n1 = tvn(wp * 0.35), n2 = tvn(wp * 1.7 + 9.0), n3 = tvn(wp * 5.3 + 3.0);
  float w[${NL}];
  w[0] = vMat0.x; w[1] = vMat0.y; w[2] = vMat0.z; w[3] = vMat0.w; w[4] = vMat1.x; w[5] = vMat1.y; w[6] = vMat1.z; w[7] = vMat1.w;
  w[8] = vMat2.x; w[9] = vMat2.y; w[10] = vMat2.z; w[11] = vMat2.w;
  float siteWet = vSite.x;
  // marks map (live: footprints, wheel ruts, drag scrapes) and the baked wear map (footpaths, yards, wet spots)
  vec2 muv = (wp - uMarksOrigin) / uMarksSize;
  vec3 mk = vec3(0.0);
  if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) mk = texture2D(tMarks, muv).rgb;
  vec3 wr = wearAt(wp);
  float trample = clamp(wr.r * (0.75 + 0.5 * n2), 0.0, 1.0);
  float pathCore = clamp(wr.g * (0.7 + 0.6 * n3) - 0.1, 0.0, 1.0);
  // trails (narrow roads): a packed core that wanders a little
  float ar = abs(vRoad.x);
  float trailCore = 0.0;
  if (vRoad.w > 1.5 && vRoad.w < 3.5) trailCore = 1.0 - smoothstep(vRoad.z * 0.35, vRoad.z * 0.35 + 0.45, abs(vRoad.x + (n1 - 0.5) * 0.5));
  pathCore = max(pathCore, trailCore * (vRoad.w > 2.5 ? 1.0 : 0.5));
  w[4] += mk.r * 0.9 + mk.b * 1.4 + trample * 1.4 + pathCore * 2.2;
  w[5] += mk.g * 1.6 + wr.b * 1.6 * (0.6 + 0.6 * n2);
  w[3] += trample * (0.4 - pathCore) * 0.6;
  float strip = clamp(mk.r * 0.7 + mk.b + mk.g + trample * 0.6 + pathCore + wr.b * 0.6, 0.0, 0.95);
  for (int i = 0; i < 4; i++) w[i] *= 1.0 - strip;
  w[2] *= 1.0 - strip; w[8] *= 1.0 - pathCore;
  // patchy breakup so no transition is a smooth gradient
  w[2] *= 0.6 + 0.8 * n2; w[1] *= 0.7 + 0.6 * n1; w[3] *= 0.7 + 0.6 * n3;
  // keep the four strongest layers
  int id[4]; float wv[4];
  for (int j = 0; j < 4; j++) { id[j] = 0; wv[j] = -1.0; }
  for (int i = 0; i < ${NL}; i++) {
    float x = w[i]; int k = i;
    for (int j = 0; j < 4; j++) { if (x > wv[j]) { float tx = wv[j]; int tk = id[j]; wv[j] = x; id[j] = k; x = tx; k = tk; } }
  }
  vec2 dpx = dFdx(wp), dpy = dFdy(wp);
  vec2 rdx = dFdx(vRoad.xy), rdy = dFdy(vRoad.xy);
  float far = smoothstep(10.0, 45.0, camD);
  vec4 s[4]; vec3 nt[4];
  for (int j = 0; j < 4; j++) {
    int L = id[j];
    float tl = uTile[L];
    vec2 q, gx, gy;
    if (L >= 10) {
      // road space: u across (centred on the lane), v along
      float lane = vRoad.w < 0.5 ? (ar - 1.8) * sign(vRoad.x) : vRoad.x;
      q = vec2(lane * tl + 0.5, vRoad.y * tl);
      gx = rdx * tl; gy = rdy * tl;
    } else { q = wp * tl; gx = dpx * tl; gy = dpy * tl; }
    vec4 a = textureGrad(tLayers, vec3(q, float(L)), gx, gy);
    if (far > 0.0) {
      vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * q * 0.37 + 17.3;
      vec4 b = textureGrad(tLayers, vec3(r, float(L)), mat2(0.8, -0.6, 0.6, 0.8) * gx * 0.37, mat2(0.8, -0.6, 0.6, 0.8) * gy * 0.37);
      a = mix(a, mix(a, b, 0.5), far);
    }
    s[j] = a;
    nt[j] = textureGrad(tNormals, vec3(q, float(L)), gx, gy).xyz * 2.0 - 1.0;
  }
  // height blend: alpha = height. Sharp natural transitions with a little noise
  float hv[4]; float hmax = -9.0;
  for (int j = 0; j < 4; j++) { hv[j] = wv[j] < 0.01 ? -9.0 : s[j].a * 0.6 + wv[j] * 1.6 + n2 * 0.15; hmax = max(hmax, hv[j]); }
  vec4 acc = vec4(0.0); vec3 nacc = vec3(0.0); float tw = 0.0;
  float isRoad = 0.0;
  for (int j = 0; j < 4; j++) {
    float k = max(hv[j] - hmax + 0.22, 0.0);
    acc += s[j] * k;
    if (id[j] >= 10) isRoad += k;
    nacc += nt[j] * k;
    tw += k;
  }
  isRoad /= max(tw, 1e-4);
  vec3 terr = acc.rgb / max(tw, 1e-4);
  vec3 tnorm = nacc / max(tw, 1e-4);
  float hgt = acc.a / max(tw, 1e-4);
  terr *= 0.92 + 0.16 * n1;
  // exposed roots across worn paths and trail cores
  float rootAc = 0.0;
  float rootK = 0.0;
  if (pathCore + trample > 0.05 && camD < 40.0) {
    rootK = rootAt(wp, rootAc) * smoothstep(0.05, 0.4, pathCore + trample * 0.5) * (1.0 - smoothstep(25.0, 40.0, camD));
    terr = mix(terr, vec3(0.20, 0.135, 0.085) * (0.75 + 0.5 * smoothstep(0.6, -0.6, rootAc)), rootK);
    tnorm = mix(tnorm, normalize(vec3(-rootAc * 0.6, 0.0, 1.0)), rootK);
  }
  // fresh disturbance is darker and wetter
  terr *= 1.0 - 0.18 * clamp(mk.g + mk.r * 0.5, 0.0, 1.0);
  terr *= 1.0 - 0.08 * pathCore;
  // wetness: rain, mud, wet sites, the shore's wet band
  float shore = 1.0 - smoothstep(${(WORLD.waterY + 0.05).toFixed(2)}, ${(WORLD.waterY + 0.7).toFixed(2)}, vWPos.y + (n2 - 0.5) * 0.25);
  float wetness = clamp(uWet + mk.g * 0.6 + w[5] * 0.5 + wr.b * 0.6 + siteWet * 0.25 + shore, 0.0, 1.0);
  terr *= 1.0 - 0.38 * wetness;
  // puddles: in road ruts, in the wet low spots, where the wear map pools water; deeper after rain
  float rutMask = isRoad * (1.0 - smoothstep(0.08, 0.35, abs(abs(vRoad.w < 0.5 ? ar - 1.8 : ar) - 0.64)));
  float pool = rutMask * 0.85 + wr.b * 0.9 + siteWet * 0.35 * vSite.w + mk.g * 0.5;
  float puddle = smoothstep(0.62, 0.7, pool * (0.55 + 0.6 * tvn(wp * 0.6 + 5.0)) + uWet * 0.35 - hgt * 0.35) * step(camD, 120.0);
  terr = mix(terr, terr * 0.35 + vec3(0.01, 0.012, 0.012), puddle);
  terr = mix(terr, vec3(0.86, 0.9, 0.95), uSnow * smoothstep(0.55, 0.75, vWNor.y));
  diffuseColor.rgb *= terr;
`;

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly albedo: THREE.DataArrayTexture;
  readonly normals: THREE.DataArrayTexture;
  readonly mistMap: THREE.DataTexture;
  private wear = new Wear();
  private chunks = new Map<string, ChunkEntry>();
  private queue: { key: string; cx: number; cz: number; lod: number; d: number }[] = [];
  private scanT = 0;
  private scans = 0;

  constructor() {
    this.albedo = arrayTex(true, false);
    this.normals = arrayTex(false, true);
    this.mistMap = bakeMist();
    G.uMistMap.value = this.mistMap;
    G.uMistBox.value.set(-WORLD.half, -WORLD.half, WORLD.half * 2, WORLD.half * 2);

    this.material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const uniforms = {
      tLayers: { value: this.albedo }, tNormals: { value: this.normals },
      tMarks: { value: marks.texture },
      uMarksOrigin: marks.uOrigin, uMarksSize: marks.uSize,
      tWear: { value: this.wear.texture }, uWearR: this.wear.uRegions, tSkyProbe: G.uSkyProbe,
      uTile: { value: null as unknown as number[] },
      uWet: G.uWet, uSnow: G.uSnow, uCamPos: G.uCamPos, uTime: G.uTime,
    };
    uniforms.uTile.value = this.tiles;
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aMat0; attribute vec4 aMat1; attribute vec4 aMat2; attribute vec4 aRoad; attribute vec2 aRoadDir; attribute vec4 aSite;
          varying vec4 vMat0; varying vec4 vMat1; varying vec4 vMat2; varying vec4 vRoad; varying vec2 vRoadDir; varying vec4 vSite;
          varying vec3 vWPos; varying vec3 vWNor;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vMat0 = aMat0; vMat1 = aMat1; vMat2 = aMat2; vRoad = aRoad; vRoadDir = aRoadDir; vSite = aSite;
          vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNor = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_FRAG_HEAD}`)
        .replace('#include <map_fragment>', TERRAIN_MAP)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness - 0.12 * smoothstep(0.4, 0.8, w[7] + w[8]);
          roughnessFactor = mix(roughnessFactor, 0.4, clamp(uWet * 0.8 + w[5] * 0.45 + mk.g * 0.4 + shore * 0.5, 0.0, 0.85));
          roughnessFactor = mix(roughnessFactor, 0.04, puddle);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            // tangent frame: world +X / -Z for the ground layers, road right / back for the road strips
            vec3 Ng = normalize(vWNor);
            vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Ng * Ng.x);
            vec3 Bw = cross(Ng, Tw);
            vec2 rdir = normalize(vRoadDir + vec2(1e-5));
            vec3 Tr = normalize(vec3(-rdir.y, 0.0, rdir.x)); vec3 Br = -vec3(rdir.x, 0.0, rdir.y);
            vec3 T = normalize(mix(Tw, Tr, isRoad)), B = normalize(mix(Bw, Br, isRoad));
            vec3 tn = normalize(vec3(tnorm.xy * (1.0 - puddle) * (1.0 - 0.6 * smoothstep(40.0, 120.0, camD)), max(tnorm.z, 0.2)));
            vec3 nW = normalize(T * tn.x + B * tn.y + Ng * tn.z);
            normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (puddle > 0.01) {
            // standing water mirrors the sky (rain rings ruffle it)
            vec3 vd = normalize(vWPos - uCamPos);
            vec3 pn = vec3(0.0, 1.0, 0.0);
            if (uWet > 0.1) { vec2 rp = floor(wp * 10.0) / 10.0; pn.xz += (vec2(tvn(rp * 3.0 + uTime * 4.0), tvn(rp * 3.0 - uTime * 4.0 + 9.0)) - 0.5) * 0.12 * uWet; pn = normalize(pn); }
            vec3 rr = reflect(vd, pn);
            float F = 0.03 + 0.97 * pow(1.0 - max(dot(-vd, pn), 0.0), 5.0);
            totalEmissiveRadiance += probeSky(rr) * F * puddle * 0.9;
          }`);
    };
    this.material.customProgramCacheKey = () => 'terrain-v2';
  }

  /** load the photo-based layer set from public/assets/textures/terrain (index.json gives tile sizes) */
  async loadDefault(): Promise<void> {
    const map: Record<(typeof LAYERS)[number], string> = {
      needles: 'forest_floor', leaves: 'dead_leaves', moss: 'moss', grass: 'grass', dirt: 'dirt', mud: 'mud', gravel: 'gravel_road', rock: 'granite',
      lichen: 'lichen_rock', pebbles: 'pebbles', roadruts: 'gravel_road_ruts', mudruts: 'mud_ruts',
    };
    try {
      const idx = (await (await fetch('assets/textures/index.json')).json()) as { set: string; name: string; tile: number }[];
      LAYERS.forEach((l, i) => { const e = idx.find((x) => x.set === 'terrain' && x.name === map[l]); if (e) this.tiles[i] = 1 / e.tile; });
    } catch { /* keep defaults */ }
    await Promise.all([
      this.loadLayers(Object.fromEntries(LAYERS.map((l) => [l, `assets/textures/terrain/${map[l]}_albedo.png`]))),
      this.loadInto(this.normals, Object.fromEntries(LAYERS.map((l) => [l, `assets/textures/terrain/${map[l]}_normal.png`])), false),
    ]);
  }

  readonly tiles = TILE_M.map((t) => 1 / t);

  /** replace the fallback layers with the photo-based textures (name -> image url). Missing ones keep the fallback. */
  async loadLayers(urls: Partial<Record<(typeof LAYERS)[number], string>>): Promise<void> {
    await this.loadInto(this.albedo, urls, true);
  }

  private async loadInto(tex: THREE.DataArrayTexture, urls: Partial<Record<(typeof LAYERS)[number], string>>, height: boolean): Promise<void> {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = TEX;
    const ctx = cvs.getContext('2d', { willReadFrequently: true })!;
    const data = tex.image.data as Uint8Array;
    // decode in parallel, copy one at a time (one shared canvas)
    const imgs = await Promise.all(LAYERS.map(async (name) => {
      const url = urls[name];
      if (!url) return null;
      try { const img = new Image(); img.src = url; await img.decode(); return img; } catch { return null; }
    }));
    imgs.forEach((img, i) => {
      if (!img) return;
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, TEX, TEX);
      ctx.drawImage(img, 0, 0, TEX, TEX);
      const px = ctx.getImageData(0, 0, TEX, TEX).data;
      const base = i * TEX * TEX * 4;
      for (let p = 0; p < TEX * TEX; p++) {
        const o = p * 4;
        data[base + o] = px[o]; data[base + o + 1] = px[o + 1]; data[base + o + 2] = px[o + 2];
        if (height) {
          // alpha := luminance-derived height (bright = high), kept from the image if it has real alpha
          const l = 0.3 * px[o] + 0.55 * px[o + 1] + 0.15 * px[o + 2];
          data[base + o + 3] = px[o + 3] < 250 ? px[o + 3] : Math.min(255, l * 1.4);
        } else data[base + o + 3] = 255;
      }
    });
    tex.needsUpdate = true;
  }

  private lodFor(d: number): number {
    return d < 110 ? 0 : d < 260 ? 1 : d < 560 ? 2 : 3;
  }

  /** find the places' anchors (doors, woodpile, firepit, pump...) so the footpaths join them up */
  private scanSites(): void {
    const root = this.group.parent;
    if (!root) return;
    const sites = new Map<string, THREE.Vector3[]>();
    root.traverse((o) => {
      if (!o.name) return;
      if (SITE_NAMES.includes(o.name) || o.name.includes('outhouse')) {
        const p = o.getWorldPosition(new THREE.Vector3());
        let l = sites.get(o.name);
        if (!l) sites.set(o.name, (l = []));
        l.push(p);
      }
    });
    if (sites.size) this.wear.refresh(sites);
  }

  /** stream chunks around the camera; builds at most `budget` chunk geometries per call */
  update(cam: THREE.Vector3, budget = 2): void {
    // the places build after the terrain: look for their anchors for a while, then every half minute
    if (--this.scanT <= 0) { this.scans++; this.scanT = this.scans < 20 ? 90 : 1800; this.scanSites(); }
    const n = WORLD.half / CHUNK;
    const want = new Set<string>();
    this.queue.length = 0;
    for (let cz = -n; cz < n; cz++) for (let cx = -n; cx < n; cx++) {
      const mx = (cx + 0.5) * CHUNK, mz = (cz + 0.5) * CHUNK;
      const d = Math.max(0, Math.hypot(mx - cam.x, mz - cam.z) - CHUNK * 0.7);
      if (d > 1400) continue;
      const key = `${cx},${cz}`;
      want.add(key);
      const lod = this.lodFor(d);
      const e = this.chunks.get(key);
      if (!e) this.queue.push({ key, cx, cz, lod, d });
      else if (e.lod !== lod) {
        if (e.geos[lod]) { e.mesh.geometry = e.geos[lod]!; e.lod = lod; }
        else this.queue.push({ key, cx, cz, lod, d });
      }
    }
    for (const [k, e] of this.chunks) if (!want.has(k)) {
      this.group.remove(e.mesh);
      e.geos.forEach((g) => g?.dispose());
      this.chunks.delete(k);
    }
    this.queue.sort((a, b) => a.d - b.d);
    for (let q = 0; q < Math.min(budget, this.queue.length); q++) {
      const it = this.queue[q];
      const g = buildChunkGeometry(it.cx, it.cz, it.lod);
      let e = this.chunks.get(it.key);
      if (!e) {
        const mesh = new THREE.Mesh(g, this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        e = { mesh, lod: it.lod, geos: [null, null, null, null] };
        this.chunks.set(it.key, e);
      } else e.mesh.geometry = g;
      e.geos[it.lod] = g;
      e.lod = it.lod;
    }
  }

  /** build everything near a point synchronously (loading screens) */
  prime(cam: THREE.Vector3): void {
    for (let i = 0; i < 400; i++) { this.update(cam, 8); if (this.queue.length === 0) break; }
  }

  get pending(): number { return this.queue.length; }
}
