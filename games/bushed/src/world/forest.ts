// The forest: deterministic placement over the whole map from layout.biome / clearance (clumps, gaps, road edges,
// old growth, burn), streamed in 48 m chunks, drawn with instancing per tree variant and LOD bucket:
//   LOD0 (full)  0 .. lod0 m, casts shadows
//   LOD1 (reduced) lod0 .. lod1 m (shadow casting up to `shadow` m)
//   LOD2 (baked cross-billboard impostor) lod1 .. far m
// Neighbouring buckets overlap by `band` metres and cross-fade with complementary screen-space dithering, so LOD
// switches are stable and seamless. Culling: chunk AABB vs frustum, then per-tree bounding sphere for the near buckets.
//
// API (ARCHITECTURE.md "Trees"): near, raycastTrunk, detach, remove, trunkColliders (+ stats, treeAt).
import * as THREE from 'three';
import { hash2, Rng } from '../core/rng';
import { Noise, clamp, smoothstep } from '../core/noise';
import { WORLD, biome, clearance, heightAt, type Biome } from './layout';
import { buildTree, scaledModel, type TreeModel, type TreeForm, type TreeLod } from '../trees/build';
import { SPECIES, type SpeciesId } from '../trees/species';
import { createTreeMaterials, type TreeMaterialSet } from '../trees/materials';
import { ImpostorAtlas, type Impostor } from '../trees/impostor';
import { barkTexture, foliageTexture } from '../trees/textures';

export interface TreeRef {
  id: number;
  species: SpeciesId;
  x: number; y: number; z: number;
  rotY: number;
  scale: number;
  /** the tree's model in local units (scale applied, not rotated); cached */
  model(): TreeModel;
}

/** a lightweight standing-tree record (no model) for placement queries */
export interface Stand { id: number; species: SpeciesId; x: number; y: number; z: number; r: number; h: number; crown: number; conifer: boolean; dead: boolean }

export interface TrunkHit { ref: TreeRef; point: THREE.Vector3; normal: THREE.Vector3; h: number }
export interface TrunkCollider { id: number; x: number; z: number; r: number; h: number }

export interface ForestOptions {
  lod0?: number; lod1?: number; far?: number; shadow?: number; band?: number;
  /** tree density multiplier */
  density?: number;
  /** only generate within this distance of the camera (default far + chunk) */
  genRadius?: number;
  /**
   * layer for shadow-only proxies of trees outside the view frustum (their shadows still fall into view).
   * Enable it on the sun's shadow camera: `sun.shadow.camera.layers.enable(1)`. -1 disables the proxies.
   */
  shadowLayer?: number;
}

interface VariantDef { species: SpeciesId; age: number; form: TreeForm; moss?: number; charred?: number }

// the variant library: every species at several ages, plus snags / broken tops / dying trees
const VARIANT_DEFS: VariantDef[] = [];
{
  const add = (species: SpeciesId, ages: number[], extra: Partial<VariantDef>[] = []) => {
    for (const age of ages) VARIANT_DEFS.push({ species, age, form: 'normal' });
    for (const e of extra) VARIANT_DEFS.push({ species, age: e.age ?? 0.8, form: e.form ?? 'normal', moss: e.moss, charred: e.charred });
  };
  add('spruce', [0.2, 0.32, 0.45, 0.58, 0.7, 0.82, 0.95, 1.08], [{ form: 'broken', age: 0.9 }, { form: 'snag', age: 0.75 }, { form: 'dying', age: 0.65 }, { age: 1.15, moss: 0.6 }]);
  add('fir', [0.2, 0.33, 0.48, 0.62, 0.78, 0.92], [{ form: 'snag', age: 0.7 }, { form: 'dying', age: 0.6 }]);
  add('pine', [0.25, 0.42, 0.6, 0.78, 0.95, 1.08], [{ form: 'snag', age: 0.8, charred: 1 }, { form: 'snag', age: 0.55, charred: 1 }, { form: 'broken', age: 0.9 }]);
  add('birch', [0.2, 0.36, 0.52, 0.68, 0.84, 1.0], [{ form: 'snag', age: 0.8 }, { form: 'broken', age: 0.85 }]);
  add('cedar', [0.25, 0.42, 0.6, 0.78, 0.95, 1.12, 1.28], [{ form: 'snag', age: 1.0, moss: 0.5 }, { age: 1.3, moss: 0.9 }]);
}

interface Variant {
  index: number;
  def: VariantDef;
  model: TreeModel;
  lod0: TreeLod;
  lod1: TreeLod;
  imp: Impostor | null;
  /** trunk radius at 1 m, height, bounding radius */
  r1: number; height: number; bound: number;
  mats: TreeMaterialSet[]; // per bucket (0, 1n, 1f, shadow proxy)
  buckets: Bucket[];
}

interface Bucket {
  meshes: THREE.InstancedMesh[]; // bark (+ foliage) or impostor
  count: number;
  cap: number;
  shadow: boolean;
}

const CHUNK = 48;
// bucket indices
const PROXY = 3, IMP = 4;
const ckey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

interface Chunk {
  cx: number; cz: number;
  ids: number[];
  minY: number; maxY: number;
}

const _m4 = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _box = new THREE.Box3();
const _sph = new THREE.Sphere();
const _v = new THREE.Vector3();

export class Forest {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly group = new THREE.Group();
  readonly variants: Variant[] = [];
  private renderer: THREE.WebGLRenderer | null;
  private atlas: ImpostorAtlas;
  private baked = false;
  private opt: Required<ForestOptions>;
  // tree records (struct of arrays)
  private n = 0;
  private tx = new Float32Array(1024);
  private ty = new Float32Array(1024);
  private tz = new Float32Array(1024);
  private trot = new Float32Array(1024);
  private tscale = new Float32Array(1024);
  private tvar = new Uint16Array(1024);
  private ttint = new Float32Array(1024 * 3);
  private tstate = new Uint8Array(1024); // 0 alive, 1 detached, 2 removed
  private chunks = new Map<number, Chunk>();
  private pending: [number, number][] = [];
  private lastCam = new THREE.Vector3(1e9, 0, 0);
  private lastDir = new THREE.Vector3();
  private dirty = true;
  private frame = 0;
  private refCache = new Map<number, TreeModel>();
  private noise = new Noise(WORLD.seed + 333);
  private bySpecies: Record<SpeciesId, number[]> = { spruce: [], fir: [], pine: [], birch: [], cedar: [] };
  private statsText = '';
  private genMs = 0;
  readonly buildMs: number;

  constructor(scene: THREE.Scene, camera: THREE.Camera, renderer?: THREE.WebGLRenderer, opts: ForestOptions = {}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer ?? null;
    const o = {
      lod0: 24, lod1: 72, far: 520, shadow: 44, band: 5, density: 1, genRadius: 0, shadowLayer: 1,
      ...opts,
    };
    if (!o.genRadius) o.genRadius = o.far + CHUNK;
    this.opt = o as Required<ForestOptions>;
    this.group.name = 'forest';
    scene.add(this.group);
    this.atlas = new ImpostorAtlas();
    const t0 = performance.now();
    this.buildVariants();
    this.buildMs = performance.now() - t0;
    if (!this.renderer) {
      // grab the renderer on the first render (impostors are baked once the textures have loaded, see update)
      const prev = scene.onBeforeRender;
      scene.onBeforeRender = (r, s, c, g, m, gr) => {
        prev.call(scene, r, s, c, g, m, gr);
        if (!this.renderer) this.renderer = r;
      };
    }
    // synchronously generate the chunks around the camera
    const p = camera.position;
    const R = this.opt.lod1 + CHUNK;
    for (let cx = Math.floor((p.x - R) / CHUNK); cx <= Math.floor((p.x + R) / CHUNK); cx++) {
      for (let cz = Math.floor((p.z - R) / CHUNK); cz <= Math.floor((p.z + R) / CHUNK); cz++) this.chunk(cx, cz);
    }
  }

  // --------------------------------------------------------------------------------------------- variants
  private buildVariants(): void {
    const o = this.opt;
    const b = o.band;
    const L0 = new THREE.Vector4(-2, -1, o.lod0 - b, o.lod0 + b);
    const L1n = new THREE.Vector4(o.lod0 - b, o.lod0 + b, 1e8, 1e9);
    const L1f = new THREE.Vector4(-2, -1, o.lod1 - b, o.lod1 + b);
    VARIANT_DEFS.forEach((def, i) => {
      const model = buildTree(def.species, 100 + i * 17, { age: def.age, form: def.form, moss: def.moss, charred: def.charred });
      const lod0 = model.lod(0), lod1 = model.lod(1);
      const v: Variant = {
        index: i, def, model, lod0, lod1, imp: null,
        r1: model.radiusAt(1.0), height: model.height,
        bound: Math.max(model.height * 0.55, model.crownRadius),
        mats: [createTreeMaterials(def.species, L0), createTreeMaterials(def.species, L1n), createTreeMaterials(def.species, L1f),
          createTreeMaterials(def.species, new THREE.Vector4(-2, -1, o.shadow + 10, o.shadow + 20))],
        buckets: [],
      };
      // buckets: 0 = LOD0, 1 = LOD1 near (shadows), 2 = LOD1 far, 3 = impostor
      v.buckets.push(this.makeBucket(v, 0, 64, true));
      v.buckets.push(this.makeBucket(v, 1, 256, true));
      v.buckets.push(this.makeBucket(v, 2, 512, false));
      v.buckets.push(this.makeBucket(v, 1, 64, true, true));
      this.variants.push(v);
      this.bySpecies[def.species].push(i);
    });
  }

  private makeBucket(v: Variant, level: 0 | 1 | 2, cap: number, shadow: boolean, proxy = false): Bucket {
    const lod = level === 0 ? v.lod0 : v.lod1;
    const mats = v.mats[proxy ? 3 : level];
    const meshes: THREE.InstancedMesh[] = [];
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, d: THREE.Material) => {
      const im = new THREE.InstancedMesh(g, m, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.customDepthMaterial = d;
      im.visible = false;
      im.name = `tree_${v.def.species}_${v.index}_L${level}${proxy ? '_shadow' : ''}`;
      if (proxy) {
        if (this.opt.shadowLayer < 0) im.castShadow = false;
        else im.layers.set(this.opt.shadowLayer);
      }
      this.group.add(im);
      meshes.push(im);
    };
    mk(lod.bark, mats.bark, mats.barkDepth);
    if (lod.foliage) mk(lod.foliage, mats.foliage, mats.foliageDepth);
    return { meshes, count: 0, cap, shadow };
  }

  private texturesReady(): boolean {
    for (const sp of ['spruce', 'fir', 'pine', 'birch', 'cedar'] as SpeciesId[]) {
      for (const t of [barkTexture(sp), foliageTexture(sp)]) {
        const img = t.image as HTMLImageElement | undefined;
        if (!img || !img.width) return false;
      }
    }
    return true;
  }

  private bakeImpostors(): void {
    if (!this.renderer || this.baked || !this.texturesReady()) return;
    this.baked = true;
    const o = this.opt;
    const L2 = new THREE.Vector4(o.lod1 - o.band, o.lod1 + o.band, o.far - 30, o.far);
    const { mat, depth } = this.atlas.lodMaterial(L2);
    for (const v of this.variants) {
      v.imp = this.atlas.bake(this.renderer, v.model, SPECIES[v.def.species].flex);
      if (!v.imp) continue;
      const cap = 2048;
      const im = new THREE.InstancedMesh(v.imp.geometry, mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = true;
      im.customDepthMaterial = depth;
      im.visible = false;
      im.name = `tree_${v.def.species}_${v.index}_imp`;
      this.group.add(im);
      v.buckets.push({ meshes: [im], count: 0, cap, shadow: false });
    }
    this.dirty = true;
  }

  // --------------------------------------------------------------------------------------------- placement
  private grow(): void {
    const cap = this.tx.length * 2;
    const g = <T extends Float32Array | Uint16Array | Uint8Array>(a: T, k = 1): T => {
      const b = new (a.constructor as new (n: number) => T)(cap * k);
      b.set(a);
      return b;
    };
    this.tx = g(this.tx); this.ty = g(this.ty); this.tz = g(this.tz); this.trot = g(this.trot);
    this.tscale = g(this.tscale); this.tvar = g(this.tvar); this.ttint = g(this.ttint, 3); this.tstate = g(this.tstate);
  }

  private pickVariant(rng: Rng, sp: SpeciesId, b: Biome): number {
    const list = this.bySpecies[sp];
    // forms
    const snagP = 0.035 + 0.5 * b.burn + 0.03 * b.old;
    const r = rng.next();
    const forms = (f: TreeForm, charred?: boolean) => list.filter((i) => this.variants[i].def.form === f && (charred === undefined || !!this.variants[i].def.charred === charred));
    if (r < snagP) {
      const s = forms('snag', b.burn > 0.3 ? true : undefined);
      const s2 = s.length ? s : forms('snag');
      if (s2.length) return rng.pick(s2);
    } else if (r < snagP + 0.035) {
      const s = forms('broken').concat(forms('dying'));
      if (s.length) return rng.pick(s);
    }
    // age class: young / pole / mature / veteran (old growth pushes old)
    const normal = list.filter((i) => this.variants[i].def.form === 'normal');
    const u = rng.next();
    let age = u < 0.2 ? rng.range(0.15, 0.4) : u < 0.5 ? rng.range(0.4, 0.7) : rng.range(0.7, 1.0);
    age += b.old * rng.range(0, 0.35);
    if (b.burn > 0.4) age *= 0.6;
    let best = normal[0], bd = 1e9;
    for (const i of normal) {
      const d = Math.abs(this.variants[i].def.age - age) + rng.range(0, 0.08);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  private chunk(cx: number, cz: number): Chunk {
    const k = ckey(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    const t0 = performance.now();
    c = { cx, cz, ids: [], minY: 1e9, maxY: -1e9 };
    this.chunks.set(k, c);
    const rng = new Rng((hash2(cx, cz, WORLD.seed) * 4294967296) >>> 0);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // biome on a coarse grid (8 m), bilinear
    const G8 = 8, gn = CHUNK / G8 + 1;
    const bio: Biome[] = [];
    for (let j = 0; j < gn; j++) for (let i = 0; i < gn; i++) bio.push(biome(x0 + i * G8, z0 + j * G8));
    const bAt = (x: number, z: number): Biome => {
      const fx = (x - x0) / G8, fz = (z - z0) / G8;
      const i = Math.min(gn - 2, Math.max(0, Math.floor(fx))), j = Math.min(gn - 2, Math.max(0, Math.floor(fz)));
      const u = fx - i, w = fz - j;
      const a = bio[j * gn + i], b = bio[j * gn + i + 1], c2 = bio[(j + 1) * gn + i], d = bio[(j + 1) * gn + i + 1];
      const out = {} as Biome;
      for (const key of Object.keys(a) as (keyof Biome)[]) {
        out[key] = (a[key] * (1 - u) + b[key] * u) * (1 - w) + (c2[key] * (1 - u) + d[key] * u) * w;
      }
      return out;
    };
    const cell = 3.1;
    const n = Math.floor(CHUNK / cell);
    const lim = WORLD.half - 8;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + rng.range(0.1, 0.9)) * cell;
        const z = z0 + (j + rng.range(0.1, 0.9)) * cell;
        const roll = rng.next();
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        const b = bAt(x, z);
        // clumps and gaps: two octaves of noise, small openings where it dips
        const cl = this.noise.n2(x / 38, z / 38) * 0.6 + this.noise.n2(x / 11 + 9, z / 11) * 0.4;
        const clump = clamp(0.62 + 0.75 * cl, 0, 1.25) * smoothstep(-0.55, -0.25, cl);
        let p = b.density * clump * 0.82 * this.opt.density;
        if (b.burn > 0.3) p *= 1 - 0.55 * b.burn;
        if (roll > p) continue;
        const cl2 = clearance(x, z);
        if (cl2 < 0.55) continue;
        if (roll > p * smoothstep(0.55, 1, cl2)) continue; // thinner toward road edges
        const y = heightAt(x, z);
        if (y < WORLD.waterY + 0.3) continue;
        // species
        const w = b.burn > 0.4 ? { spruce: b.spruce * 0.3, fir: b.fir * 0.1, pine: b.pine * 1.6, birch: b.birch * 1.2, cedar: 0 } : b;
        const tot = w.spruce + w.fir + w.pine + w.birch + w.cedar;
        let s = rng.next() * tot;
        let sp: SpeciesId = 'spruce';
        for (const id of ['spruce', 'fir', 'pine', 'birch', 'cedar'] as SpeciesId[]) { s -= w[id]; if (s <= 0) { sp = id; break; } }
        const vi = this.pickVariant(rng, sp, b);
        if (this.n >= this.tx.length) this.grow();
        const id = this.n++;
        this.tx[id] = x; this.ty[id] = y - 0.04; this.tz[id] = z;
        this.trot[id] = rng.range(0, Math.PI * 2);
        this.tscale[id] = rng.range(0.86, 1.14);
        this.tvar[id] = vi;
        // per-tree tint: brightness + a slight hue drift (no two trees alike)
        const br = rng.range(0.88, 1.1), hue = rng.range(-0.05, 0.05);
        this.ttint[id * 3] = br * (1 + hue); this.ttint[id * 3 + 1] = br; this.ttint[id * 3 + 2] = br * (1 - hue * 1.2);
        this.tstate[id] = 0;
        c.ids.push(id);
        c.minY = Math.min(c.minY, y);
        c.maxY = Math.max(c.maxY, y + this.variants[vi].height * 1.15);
      }
    }
    if (!c.ids.length) { c.minY = 0; c.maxY = 0; }
    this.genMs += performance.now() - t0;
    this.dirty = true;
    return c;
  }

  // --------------------------------------------------------------------------------------------- update
  update(_dt = 0): void {
    this.frame++;
    if (!this.baked) this.bakeImpostors();
    const cam = this.camera;
    const p = cam.position;
    // stream chunks: nearest first, ~3 ms per frame
    if (this.frame % 10 === 1 || this.pending.length === 0) {
      const R = this.opt.genRadius;
      const pc = Math.floor(p.x / CHUNK), pz = Math.floor(p.z / CHUNK);
      const rc = Math.ceil(R / CHUNK);
      const list: [number, number, number][] = [];
      for (let cx = pc - rc; cx <= pc + rc; cx++) for (let cz = pz - rc; cz <= pz + rc; cz++) {
        const d = Math.hypot((cx + 0.5) * CHUNK - p.x, (cz + 0.5) * CHUNK - p.z);
        if (d < R + CHUNK && !this.chunks.has(ckey(cx, cz))) list.push([cx, cz, d]);
      }
      list.sort((a, b) => a[2] - b[2]);
      this.pending = list.map((l) => [l[0], l[1]]);
    }
    const t0 = performance.now();
    while (this.pending.length && performance.now() - t0 < 3) {
      const [cx, cz] = this.pending.shift()!;
      this.chunk(cx, cz);
    }
    // rebuild instance buffers when the view changed enough
    const dir = _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const moved = p.distanceTo(this.lastCam) > 1.0 || dir.dot(this.lastDir) < 0.9985;
    if (moved || this.dirty || this.frame % 45 === 0) {
      this.lastCam.copy(p);
      this.lastDir.copy(dir);
      this.dirty = false;
      this.rebuild();
    }
  }

  private rebuild(): void {
    const cam = this.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    _m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m4);
    const o = this.opt, b = o.band;
    const px = cam.position.x, pz = cam.position.z;
    for (const v of this.variants) for (const bk of v.buckets) bk.count = 0;
    const far = o.far;
    let drawn = 0, total = 0;
    for (const c of this.chunks.values()) {
      if (!c.ids.length) continue;
      const x0 = c.cx * CHUNK, z0 = c.cz * CHUNK;
      const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK)), dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK));
      if (dx * dx + dz * dz > far * far) continue;
      const dch = Math.hypot(dx, dz);
      const pad = 6 + dch * 0.08; // angular margin: no popping at the screen edges between rebuilds
      _box.min.set(x0 - pad, c.minY - 2, z0 - pad);
      _box.max.set(x0 + CHUNK + pad, c.maxY + 2, z0 + CHUNK + pad);
      const inView = _frustum.intersectsBox(_box);
      if (!inView && dch > o.shadow) continue;
      for (const id of c.ids) {
        total++;
        if (this.tstate[id] !== 0) continue;
        const x = this.tx[id], z = this.tz[id];
        const d = Math.hypot(x - px, z - pz);
        if (d > far) continue;
        const v = this.variants[this.tvar[id]];
        const s = this.tscale[id];
        if (d < o.lod1 + b || !inView) {
          _sph.center.set(x, this.ty[id] + v.height * s * 0.5, z);
          _sph.radius = v.bound * s + 1 + d * 0.08;
          if (!inView || !_frustum.intersectsSphere(_sph)) {
            // off screen: only its shadow matters
            if (d < o.shadow && this.opt.shadowLayer >= 0) this.push(v, PROXY, id);
            continue;
          }
        }
        drawn++;
        if (d < o.lod0 + b) this.push(v, 0, id);
        if (d > o.lod0 - b && d < o.lod1 + b) this.push(v, d < o.shadow ? 1 : 2, id);
        if (d > o.lod1 - b && v.buckets[IMP]) this.push(v, IMP, id);
      }
    }
    let tris = 0;
    const counts = [0, 0, 0, 0, 0];
    for (const v of this.variants) {
      v.buckets.forEach((bk, bi) => {
        counts[bi] += bk.count;
        for (const im of bk.meshes) {
          im.count = bk.count;
          im.visible = bk.count > 0;
          if (bk.count) {
            im.instanceMatrix.clearUpdateRanges();
            im.instanceMatrix.addUpdateRange(0, bk.count * 16);
            im.instanceMatrix.needsUpdate = true;
            im.instanceColor!.clearUpdateRanges();
            im.instanceColor!.addUpdateRange(0, bk.count * 3);
            im.instanceColor!.needsUpdate = true;
            tris += (im.geometry.index ? im.geometry.index.count / 3 : 0) * bk.count;
          }
        }
      });
    }
    this.statsText = `forest: ${this.n} trees, ${this.chunks.size} chunks, ${this.variants.length} variants (built ${this.buildMs.toFixed(0)} ms, placed ${this.genMs.toFixed(0)} ms)\n` +
      `  visible ${drawn}/${total}: L0 ${counts[0]} L1 ${counts[1]}+${counts[2]} imp ${counts[IMP]} shadow-only ${counts[PROXY]}  ~${(tris / 1e6).toFixed(2)}M tris`;
  }

  private push(v: Variant, bi: number, id: number): void {
    let bk = v.buckets[bi];
    if (bk.count >= bk.cap) {
      this.growBucket(v, bi);
      bk = v.buckets[bi];
    }
    const k = bk.count++;
    const s = this.tscale[id], r = this.trot[id];
    const c = Math.cos(r) * s, sn = Math.sin(r) * s;
    const tr = this.ttint[id * 3], tg = this.ttint[id * 3 + 1], tb = this.ttint[id * 3 + 2];
    for (let mi = 0; mi < bk.meshes.length; mi++) {
      const im = bk.meshes[mi];
      const a = im.instanceMatrix.array as Float32Array;
      const o = k * 16;
      a[o] = c; a[o + 1] = 0; a[o + 2] = -sn; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = sn; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
      a[o + 12] = this.tx[id]; a[o + 13] = this.ty[id]; a[o + 14] = this.tz[id]; a[o + 15] = 1;
      const ca = im.instanceColor!.array as Float32Array;
      // bark gets a softer version of the tint
      const soft = mi === 0 && bi < IMP ? 0.5 : 1;
      ca[k * 3] = 1 + (tr - 1) * soft; ca[k * 3 + 1] = 1 + (tg - 1) * soft; ca[k * 3 + 2] = 1 + (tb - 1) * soft;
    }
  }

  private growBucket(v: Variant, bi: number): void {
    const bk = v.buckets[bi];
    const cap = bk.cap * 2;
    const meshes = bk.meshes.map((old) => {
      const im = new THREE.InstancedMesh(old.geometry, old.material, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      (im.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      (im.instanceColor.array as Float32Array).set(old.instanceColor!.array as Float32Array);
      im.frustumCulled = false;
      im.castShadow = old.castShadow;
      im.receiveShadow = old.receiveShadow;
      im.customDepthMaterial = old.customDepthMaterial;
      im.name = old.name;
      this.group.remove(old);
      old.dispose();
      this.group.add(im);
      return im;
    });
    v.buckets[bi] = { meshes, count: bk.count, cap, shadow: bk.shadow };
  }

  // --------------------------------------------------------------------------------------------- queries
  private ensureAround(x: number, z: number, r: number): void {
    for (let cx = Math.floor((x - r) / CHUNK); cx <= Math.floor((x + r) / CHUNK); cx++) {
      for (let cz = Math.floor((z - r) / CHUNK); cz <= Math.floor((z + r) / CHUNK); cz++) this.chunk(cx, cz);
    }
  }

  private ref(id: number): TreeRef {
    const v = this.variants[this.tvar[id]];
    const self = this;
    return {
      id, species: v.def.species, x: this.tx[id], y: this.ty[id], z: this.tz[id], rotY: this.trot[id], scale: this.tscale[id],
      model(): TreeModel {
        let m = self.refCache.get(id);
        if (!m) {
          m = scaledModel(v.model, self.tscale[id]);
          if (self.refCache.size > 64) self.refCache.delete(self.refCache.keys().next().value!);
          self.refCache.set(id, m);
        }
        return m;
      },
    };
  }

  private forEachNear(x: number, z: number, r: number, fn: (id: number, d: number) => void): void {
    this.ensureAround(x, z, r + 4);
    for (let cx = Math.floor((x - r - 4) / CHUNK); cx <= Math.floor((x + r + 4) / CHUNK); cx++) {
      for (let cz = Math.floor((z - r - 4) / CHUNK); cz <= Math.floor((z + r + 4) / CHUNK); cz++) {
        const c = this.chunks.get(ckey(cx, cz));
        if (!c) continue;
        for (const id of c.ids) {
          if (this.tstate[id] === 2) continue;
          const d = Math.hypot(this.tx[id] - x, this.tz[id] - z);
          if (d <= r) fn(id, d);
        }
      }
    }
  }

  /** standing trees (alive or detached-but-not-removed) within r of (x, z), nearest first */
  near(x: number, z: number, r: number): TreeRef[] {
    const out: [number, number][] = [];
    this.forEachNear(x, z, r, (id, d) => { if (this.tstate[id] === 0) out.push([id, d]); });
    out.sort((a, b) => a[1] - b[1]);
    return out.map(([id]) => this.ref(id));
  }

  /** look up one tree by id (null when removed) */
  treeAt(id: number): TreeRef | null {
    if (id < 0 || id >= this.n || this.tstate[id] === 2) return null;
    return this.ref(id);
  }

  /** world -> trunk: centreline offset at height h for tree id (rotated + scaled) */
  private trunkCentre(id: number, h: number): [number, number] {
    const v = this.variants[this.tvar[id]];
    const s = this.tscale[id], r = this.trot[id];
    const [lx, lz] = v.model.centerAt(h / s);
    const c = Math.cos(r), sn = Math.sin(r);
    // local -> world rotation about Y (three.js convention)
    return [this.tx[id] + (c * lx + sn * lz) * s, this.tz[id] + (-sn * lx + c * lz) * s];
  }

  /** ray vs trunks (vertical, tapered, leaning): nearest hit within maxDist */
  raycastTrunk(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): TrunkHit | null {
    const d = dir.clone().normalize();
    const mid = origin.clone().addScaledVector(d, maxDist / 2);
    let best: TrunkHit | null = null;
    let bestT = maxDist;
    this.forEachNear(mid.x, mid.z, maxDist / 2 + 3, (id) => {
      if (this.tstate[id] !== 0) return;
      const v = this.variants[this.tvar[id]];
      const s = this.tscale[id];
      const Ht = v.height * s;
      // iterate: guess the hit height, take the trunk circle there, intersect in xz, refine
      let h = clamp(origin.y - this.ty[id], 0, Ht);
      for (let it = 0; it < 3; it++) {
        const [cx, cz] = this.trunkCentre(id, h);
        const r = v.model.radiusAt(h / s) * s;
        if (r <= 0) return;
        const ox = origin.x - cx, oz = origin.z - cz;
        const a = d.x * d.x + d.z * d.z;
        if (a < 1e-8) return;
        const bq = 2 * (ox * d.x + oz * d.z);
        const cq = ox * ox + oz * oz - r * r;
        const disc = bq * bq - 4 * a * cq;
        if (disc < 0) return;
        const t = (-bq - Math.sqrt(disc)) / (2 * a);
        if (t < 0 || t > bestT) return;
        const hy = origin.y + d.y * t - this.ty[id];
        if (hy < -0.3 || hy > Ht) return;
        if (Math.abs(hy - h) < 0.01 || it === 2) {
          const pt = origin.clone().addScaledVector(d, t);
          const n = new THREE.Vector3(pt.x - cx, 0, pt.z - cz).normalize();
          bestT = t;
          best = { ref: this.ref(id), point: pt, normal: n, h: Math.max(0, hy) };
          return;
        }
        h = clamp(hy, 0, Ht);
      }
    });
    return best;
  }

  /** hide the instance and hand out a unique full-detail copy, already placed in the world */
  detach(id: number): { object: THREE.Object3D; model: TreeModel } {
    const ref = this.ref(id);
    const model = ref.model();
    const object = model.object();
    object.position.set(ref.x, ref.y, ref.z);
    object.rotation.y = ref.rotY;
    object.userData.treeId = id;
    this.tstate[id] = 1;
    this.dirty = true;
    return { object, model };
  }

  /** permanently gone (felled); the stump is src/chop's business */
  remove(id: number): void {
    if (id < 0 || id >= this.n) return;
    this.tstate[id] = 2;
    this.refCache.delete(id);
    this.dirty = true;
  }

  /** put a detached tree back into the instanced forest (e.g. the chop was abandoned) */
  reattach(id: number): void {
    if (this.tstate[id] === 1) { this.tstate[id] = 0; this.dirty = true; }
  }

  /** trunk colliders (vertical capsules) for physics: r at 1 m height, h = height */
  trunkColliders(x: number, z: number, r: number): TrunkCollider[] {
    const out: TrunkCollider[] = [];
    this.forEachNear(x, z, r, (id) => {
      if (this.tstate[id] !== 0) return;
      const v = this.variants[this.tvar[id]];
      const s = this.tscale[id];
      const rr = v.r1 * s;
      if (rr < 0.035) return; // saplings: walk through them
      const [cx, cz] = this.trunkCentre(id, 1);
      out.push({ id, x: cx, z: cz, r: rr, h: v.height * s });
    });
    return out;
  }

  /** standing trees near (x, z) as plain records: trunk radius at 1 m, height, crown radius (ground cover, AI) */
  stands(x: number, z: number, r: number): Stand[] {
    const out: Stand[] = [];
    this.forEachNear(x, z, r, (id) => {
      if (this.tstate[id] !== 0) return;
      const v = this.variants[this.tvar[id]];
      const s = this.tscale[id];
      out.push({ id, species: v.def.species, x: this.tx[id], y: this.ty[id], z: this.tz[id], r: v.r1 * s, h: v.height * s,
        crown: v.def.form === 'snag' ? 0.5 : v.model.crownRadius * s, conifer: SPECIES[v.def.species].conifer, dead: v.def.form === 'snag' });
    });
    return out;
  }

  /** generate every chunk within r of (x, z) now (loading screens, tests); normally chunks stream in */
  prewarm(x: number, z: number, r: number): void {
    for (let cx = Math.floor((x - r) / CHUNK); cx <= Math.floor((x + r) / CHUNK); cx++) {
      for (let cz = Math.floor((z - r) / CHUNK); cz <= Math.floor((z + r) / CHUNK); cz++) {
        if (Math.hypot((cx + 0.5) * CHUNK - x, (cz + 0.5) * CHUNK - z) < r + CHUNK) this.chunk(cx, cz);
      }
    }
    this.dirty = true;
  }

  /** number of placed trees so far (grows as chunks stream in) */
  get count(): number { return this.n; }

  stats(): string { return this.statsText; }

  /** per-variant triangle counts (debug) */
  variantStats(): string {
    return this.variants.map((v) => `${v.def.species}${v.def.form !== 'normal' ? '/' + v.def.form : ''} a${v.def.age} h${v.height.toFixed(0)} L0 ${(v.lod0.tris / 1000).toFixed(1)}k L1 ${(v.lod1.tris / 1000).toFixed(1)}k`).join('\n');
  }
}
