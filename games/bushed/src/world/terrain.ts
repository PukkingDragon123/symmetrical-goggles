// Terrain: 64 m chunks with distance LOD (1/2/4/8 m grids, skirts hide cracks). Each vertex carries material
// weights computed from the layout (needles, leaf litter, moss, grass | dirt, mud, gravel, rock) that the shader
// height-blends per pixel against tiling pixel-art photo textures, plus road wheel ruts and the marks map.
import * as THREE from 'three';
import { WORLD, heightAt, roadInfo, biome, SPOTS } from './layout';
import { Noise, smoothstep, clamp } from '../core/noise';
import { G } from '../gfx/globals';
import { marks } from './marks';

const CHUNK = 64;
const LODS = [64, 32, 16, 8];
/** real-world metres covered by one tile of each layer */
export const LAYERS = ['needles', 'leaves', 'moss', 'grass', 'dirt', 'mud', 'gravel', 'rock'] as const;
const TILE_M = [2.0, 2.0, 2.0, 2.0, 2.5, 2.5, 3.0, 4.0];
const TEX = 512;

const nz = new Noise(WORLD.seed + 101);

function weightsAt(x: number, z: number, h: number, slope: number, b: ReturnType<typeof biome>): number[] {
  const r = roadInfo(x, z);
  const w = new Array(8).fill(0);
  const patch = nz.fbm2(x / 23, z / 23, 3);
  const patch2 = nz.fbm2(x / 9 + 40, z / 9, 2);
  // forest floor baseline
  w[0] = 1.0 + 0.4 * patch;
  w[1] = clamp(b.birch * 0.8 - 0.3 + patch2 * 0.6, 0, 1.5);
  w[2] = clamp(b.wet * 1.4 - 0.35 + patch * 0.5 + b.old * 0.8, 0, 2);
  w[3] = clamp(0.25 - b.density * 0.4 + patch2 * 0.5, 0, 1);
  w[4] = clamp(0.15 + patch2 * 0.3, 0, 1);
  w[5] = clamp((b.wet - 0.7) * 2.5 + patch2 * 0.4, 0, 1.2);
  // open clearings get grass and trampled dirt
  const dc = Math.hypot(x - SPOTS.cabin.x, z - SPOTS.cabin.z);
  const ds = Math.hypot(x - SPOTS.store.x, z - SPOTS.store.z);
  const open = Math.max(1 - smoothstep(10, 30, dc), 1 - smoothstep(18, 46, ds), 1 - smoothstep(6, 16, Math.hypot(x - SPOTS.campsite.x, z - SPOTS.campsite.z)));
  w[3] += open * (1.4 + patch);
  w[4] += open * 0.6 * (1 - smoothstep(4, 12, dc));
  w[0] *= 1 - open * 0.7;
  // shoreline
  if (h < WORLD.waterY + 1.2) { w[4] += 1.2; w[5] += 0.6; w[0] *= 0.3; }
  if (h < WORLD.waterY + 0.3) { w[7] += 0.8; }
  // roads: gravel surface, dirt shoulders, grass in the crown of trails
  if (r.road >= 0) {
    const onRoad = 1 - smoothstep(r.w - 0.4, r.w + 0.6, r.d);
    const shoulder = (1 - smoothstep(r.w + 0.4, r.w + 2.6, r.d)) * (1 - onRoad);
    const gravel = r.id === 'highway' || r.id === 'cabin_road' ? 1 : 0;
    for (let i = 0; i < 8; i++) w[i] *= 1 - onRoad;
    w[6] += onRoad * (gravel ? 2.5 : 0.2);
    w[4] += onRoad * (gravel ? 0.6 : 2.2) + shoulder * 1.2;
    w[3] += shoulder * 0.6;
    w[5] += shoulder * 0.3 * b.wet;
  }
  // rock on steep slopes
  w[7] += smoothstep(0.32, 0.6, slope) * 3;
  if (b.burn > 0.3) { w[4] += b.burn; w[0] *= 1 - b.burn * 0.6; }
  const s = w.reduce((a, c) => a + c, 0) || 1;
  return w.map((v) => v / s);
}

interface ChunkEntry { mesh: THREE.Mesh; lod: number; geos: (THREE.BufferGeometry | null)[] }

function buildChunkGeometry(cx: number, cz: number, lod: number): THREE.BufferGeometry {
  const n = LODS[lod];
  const step = CHUNK / n;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  // heights with a 1-cell border for normals
  const N = n + 3;
  const hs = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hs[j * N + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const H = (i: number, j: number) => hs[(j + 1) * N + (i + 1)];
  // biome on a coarse 8 m grid, bilinear
  const bs = 8;
  const bn = Math.ceil(CHUNK / bs) + 1;
  const bio: ReturnType<typeof biome>[] = [];
  for (let j = 0; j < bn; j++) for (let i = 0; i < bn; i++) bio.push(biome(x0 + i * bs, z0 + j * bs));
  const bioAt = (lx: number, lz: number) => {
    const fx = Math.min(bn - 1.001, lx / bs), fz = Math.min(bn - 1.001, lz / bs);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = bio[j * bn + i], b = bio[j * bn + i + 1], c = bio[(j + 1) * bn + i], d = bio[(j + 1) * bn + i + 1];
    const m = (k: keyof typeof a) => (a[k] * (1 - tx) + b[k] * tx) * (1 - tz) + (c[k] * (1 - tx) + d[k] * tx) * tz;
    return { spruce: m('spruce'), fir: m('fir'), pine: m('pine'), birch: m('birch'), cedar: m('cedar'), density: m('density'), wet: m('wet'), burn: m('burn'), old: m('old') };
  };

  const vcount = (n + 1) * (n + 1) + 4 * (n + 1);
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3);
  const m0 = new Float32Array(vcount * 4), m1 = new Float32Array(vcount * 4), rd = new Float32Array(vcount);
  let v = 0;
  const put = (i: number, j: number, drop: number) => {
    const x = x0 + i * step, z = z0 + j * step;
    const h = H(i, j);
    pos[v * 3] = x; pos[v * 3 + 1] = h - drop; pos[v * 3 + 2] = z;
    const dx = H(i + 1, j) - H(i - 1, j), dz = H(i, j + 1) - H(i, j - 1);
    let nx = -dx, ny = 2 * step, nzz = -dz;
    const l = Math.hypot(nx, ny, nzz); nx /= l; ny /= l; nzz /= l;
    nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nzz;
    const w = weightsAt(x, z, h, 1 - ny, bioAt(i * step, j * step));
    m0.set(w.slice(0, 4), v * 4); m1.set(w.slice(4, 8), v * 4);
    const r = roadInfo(x, z);
    rd[v] = r.road >= 0 && (r.id === 'highway' || r.id === 'cabin_road') && r.d < r.w + 3 ? r.side : 99;
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
  g.setAttribute('aRoad', new THREE.BufferAttribute(rd.subarray(0, v), 1));
  g.setIndex(idx);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** fallback layer texture: noisy painted colour (used until the photo textures load) */
function fallbackLayer(i: number): Uint8Array {
  const base: [number, number, number][] = [
    [92, 64, 40], [120, 82, 44], [66, 92, 38], [84, 104, 46], [104, 82, 58], [62, 48, 36], [118, 110, 98], [104, 102, 98],
  ];
  const out = new Uint8Array(TEX * TEX * 4);
  const n = new Noise(77 + i);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const u = x / TEX, v = y / TEX;
    // tileable noise via torus mapping
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const f = n.n3(Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(b) * 3 + Math.sin(b) * 1.7) * 0.5
      + n.n3(Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(b) * 9 + Math.sin(b) * 12) * 0.35;
    const k = 0.75 + 0.35 * f;
    const o = (y * TEX + x) * 4;
    out[o] = clamp(base[i][0] * k, 0, 255); out[o + 1] = clamp(base[i][1] * k, 0, 255); out[o + 2] = clamp(base[i][2] * k, 0, 255);
    out[o + 3] = clamp(128 + 120 * f, 0, 255);
  }
  return out;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly albedo: THREE.DataArrayTexture;
  private chunks = new Map<string, ChunkEntry>();
  private queue: { key: string; cx: number; cz: number; lod: number; d: number }[] = [];

  constructor() {
    const data = new Uint8Array(TEX * TEX * 4 * LAYERS.length);
    for (let i = 0; i < LAYERS.length; i++) data.set(fallbackLayer(i), i * TEX * TEX * 4);
    this.albedo = new THREE.DataArrayTexture(data, TEX, TEX, LAYERS.length);
    this.albedo.format = THREE.RGBAFormat;
    this.albedo.colorSpace = THREE.SRGBColorSpace;
    this.albedo.wrapS = this.albedo.wrapT = THREE.RepeatWrapping;
    this.albedo.magFilter = THREE.NearestFilter;
    this.albedo.minFilter = THREE.LinearMipmapLinearFilter;
    this.albedo.generateMipmaps = true;
    this.albedo.anisotropy = 8;
    this.albedo.needsUpdate = true;

    this.material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const uniforms = {
      tLayers: { value: this.albedo },
      tMarks: { value: marks.texture },
      uMarksOrigin: marks.uOrigin, uMarksSize: marks.uSize,
      uTile: { value: null as unknown as number[] },
      uWet: G.uWet, uSnow: G.uSnow, uCamPos: G.uCamPos,
    };
    uniforms.uTile.value = this.tiles;
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aMat0; attribute vec4 aMat1; attribute float aRoad;
          varying vec4 vMat0; varying vec4 vMat1; varying float vRoad; varying vec3 vWPos; varying vec3 vWNor;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vMat0 = aMat0; vMat1 = aMat1; vRoad = aRoad; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNor = normal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          precision highp sampler2DArray;
          uniform sampler2DArray tLayers; uniform sampler2D tMarks; uniform vec2 uMarksOrigin; uniform float uMarksSize;
          uniform float uTile[8]; uniform float uWet; uniform float uSnow; uniform vec3 uCamPos;
          varying vec4 vMat0; varying vec4 vMat1; varying float vRoad; varying vec3 vWPos; varying vec3 vWNor;
          float th21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float tvn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(th21(i), th21(i + vec2(1, 0)), f.x), mix(th21(i + vec2(0, 1)), th21(i + vec2(1, 1)), f.x), f.y); }
          vec4 layerSample(int i, vec2 p) {
            // two rotated scales blended by distance hide tiling
            vec2 q = p * uTile[i];
            vec4 a = texture(tLayers, vec3(q, float(i)));
            vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * p * uTile[i] * 0.37 + 17.3;
            vec4 b = texture(tLayers, vec3(r, float(i)));
            float far = smoothstep(8.0, 40.0, distance(uCamPos, vWPos));
            return mix(a, mix(a, b, 0.5), far);
          }`)
        .replace('#include <map_fragment>', `
          vec2 wp = vWPos.xz;
          float n1 = tvn(wp * 0.35), n2 = tvn(wp * 1.7 + 9.0);
          float w[8];
          w[0] = vMat0.x; w[1] = vMat0.y; w[2] = vMat0.z; w[3] = vMat0.w; w[4] = vMat1.x; w[5] = vMat1.y; w[6] = vMat1.z; w[7] = vMat1.w;
          // wheel ruts: two compacted lines either side of the road centre
          // vRoad = signed lateral offset (m) from the centreline; tyre tracks sit at +-0.78 m
          float ar = abs(vRoad);
          float rut = (1.0 - smoothstep(0.14, 0.34, abs(ar - 0.78))) * (0.75 + 0.25 * n2);
          float crown = 1.0 - smoothstep(0.25, 0.5, ar);
          // marks map
          vec2 muv = (wp - uMarksOrigin) / uMarksSize;
          vec3 mk = vec3(0.0);
          if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) mk = texture2D(tMarks, muv).rgb;
          w[4] += rut * 0.3 + mk.r * 0.9 + mk.b * 1.4;
          w[5] += mk.g * 1.6 + rut * 0.15;
          w[6] *= 1.0 - rut * 0.15;
          w[3] += crown * 0.25 * step(0.5, w[6]);
          for (int i = 0; i < 4; i++) w[i] *= 1.0 - clamp(mk.r * 0.7 + mk.b + mk.g, 0.0, 0.9);
          vec4 acc = vec4(0.0); float tw = 0.0; float best = -1.0;
          vec4 s[8];
          // sample every layer (uniform control flow keeps mip selection correct)
          for (int i = 0; i < 8; i++) s[i] = layerSample(i, wp);
          // height blend: alpha = height. Sharp natural transitions with a little noise
          float hmax = -1.0;
          float hv[8];
          for (int i = 0; i < 8; i++) { hv[i] = w[i] < 0.01 ? -9.0 : s[i].a * 0.6 + w[i] * 1.6 + n2 * 0.15; hmax = max(hmax, hv[i]); }
          for (int i = 0; i < 8; i++) {
            float k = max(hv[i] - hmax + 0.22, 0.0);
            acc += s[i] * k; tw += k;
          }
          vec3 terr = acc.rgb / max(tw, 1e-4);
          terr *= 0.92 + 0.16 * n1;
          terr *= 1.0 - rut * 0.16;
          // fresh disturbance is darker and wetter
          terr *= 1.0 - 0.18 * clamp(mk.g + mk.r * 0.5, 0.0, 1.0);
          float wetness = clamp(uWet + mk.g * 0.6 + w[5] * 0.5, 0.0, 1.0);
          terr *= 1.0 - 0.35 * wetness;
          terr = mix(terr, vec3(0.86, 0.9, 0.95), uSnow * smoothstep(0.55, 0.75, vWNor.y));
          diffuseColor.rgb *= terr;
        `)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          roughnessFactor = mix(roughnessFactor, 0.35, clamp(uWet * 0.8 + w[5] * 0.45 + mk.g * 0.4, 0.0, 0.85));`);
    };
    this.material.customProgramCacheKey = () => 'terrain-v1';
  }

  /** load the photo-based layer set from public/assets/textures/terrain (index.json gives tile sizes) */
  async loadDefault(): Promise<void> {
    const map: Record<(typeof LAYERS)[number], string> = {
      needles: 'forest_floor', leaves: 'dead_leaves', moss: 'moss', grass: 'grass', dirt: 'dirt', mud: 'mud', gravel: 'gravel_road', rock: 'granite',
    };
    try {
      const idx = (await (await fetch('assets/textures/index.json')).json()) as { set: string; name: string; tile: number }[];
      LAYERS.forEach((l, i) => { const e = idx.find((x) => x.set === 'terrain' && x.name === map[l]); if (e) this.tiles[i] = 1 / e.tile; });
    } catch { /* keep defaults */ }
    await this.loadLayers(Object.fromEntries(LAYERS.map((l) => [l, `assets/textures/terrain/${map[l]}_albedo.png`])));
  }

  readonly tiles = TILE_M.map((t) => 1 / t);

  /** replace the fallback layers with the photo-based textures (name -> image url). Missing ones keep the fallback. */
  async loadLayers(urls: Partial<Record<(typeof LAYERS)[number], string>>): Promise<void> {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = TEX;
    const ctx = cvs.getContext('2d', { willReadFrequently: true })!;
    const data = this.albedo.image.data as Uint8Array;
    await Promise.all(LAYERS.map(async (name, i) => {
      const url = urls[name];
      if (!url) return;
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        ctx.imageSmoothingEnabled = true;
        ctx.clearRect(0, 0, TEX, TEX);
        ctx.drawImage(img, 0, 0, TEX, TEX);
        const px = ctx.getImageData(0, 0, TEX, TEX).data;
        // alpha := luminance-derived height (bright = high), kept from the image if it has real alpha
        for (let p = 0; p < TEX * TEX; p++) {
          const o = p * 4;
          const l = 0.3 * px[o] + 0.55 * px[o + 1] + 0.15 * px[o + 2];
          data[i * TEX * TEX * 4 + o] = px[o];
          data[i * TEX * TEX * 4 + o + 1] = px[o + 1];
          data[i * TEX * TEX * 4 + o + 2] = px[o + 2];
          data[i * TEX * TEX * 4 + o + 3] = px[o + 3] < 250 ? px[o + 3] : Math.min(255, l * 1.4);
        }
      } catch { /* keep fallback */ }
    }));
    this.albedo.needsUpdate = true;
  }

  private lodFor(d: number): number {
    return d < 110 ? 0 : d < 260 ? 1 : d < 560 ? 2 : 3;
  }

  /** stream chunks around the camera; builds at most `budget` chunk geometries per call */
  update(cam: THREE.Vector3, budget = 2): void {
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
