// Ground cover: streamed around the camera in chunks (16 m for small plants out to ~90 m, 48 m for rocks / logs /
// stumps out to ~220 m), deterministic per chunk, instanced per prototype (one draw call per prototype part).
//
//   small:  grass clumps (curved blade strips), sword ferns, bracken, fireweed, bunchberry, asters, clubmoss,
//           reindeer lichen, blueberry, juniper, alder, saplings (real tree generator), moss mounds, mushrooms
//           (fly agaric, chanterelle), needle / leaf litter, twigs, cones
//   large:  fractured granite boulders + Poly Haven rocks, fallen mossy logs (procedural, every species, old-growth
//           giants) + Poly Haven dead trunks, stumps (old saw-cut and rotten; Poly Haven stumps), deadfall branches,
//           bracket fungi on logs and stumps
//
// Plants sway in the wind and bend away from G.uPushers (player = slot 0); a short trail of the player's positions
// makes trampled plants spring back with a slight overshoot. Placement reads layout.biome / clearance and (when a
// Forest is passed) the canopy above: grass in gaps and along road verges, ferns and moss in the wet shade, litter
// under conifers, lichen and blueberry on dry pine ground, fireweed in the burn.
//
// API: new GroundCover(scene, camera, { forest }); update(cam); solids(x, z, r) -> rocks / logs / stumps for colliders.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../gfx/globals';
import { loadTex, applyPixelTex } from '../gfx/tex';
import { Rng, hash2 } from '../core/rng';
import { Noise, clamp, smoothstep } from '../core/noise';
import { WORLD, biome, clearance, heightAt, type Biome } from './layout';
import type { Forest, Stand } from './forest';
import { MeshBuilder } from '../trees/geom';
import { buildTree } from '../trees/build';
import { createTreeMaterials } from '../trees/materials';
import { endGrainTexture } from '../trees/textures';
import type { SpeciesId } from '../trees/species';
import { vegMaterial, vegDepthMaterial, TRAIL, TRAIL_N, type VegMatOpts } from './veg/material';
import * as P from './veg/protos';

export interface Solid {
  id: number;
  kind: 'rock' | 'log' | 'stump' | 'deadfall';
  shape: 'sphere' | 'capsule' | 'cylinder';
  /** sphere: centre; cylinder: base centre; capsule: first end (axis centre) */
  x: number; y: number; z: number;
  /** radius */
  r: number;
  /** cylinder height (0 otherwise) */
  h: number;
  /** capsule: second end */
  x2?: number; y2?: number; z2?: number;
}

export interface GroundCoverOptions { forest?: Forest | null; density?: number }

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material; depth?: THREE.Material }
interface Proto { name: string; parts: Part[]; meshes: THREE.InstancedMesh[]; cap: number; count: number; shadow: boolean }
interface Group { name: string; protos: number[]; tier: 0 | 1; radius: number }
interface GChunk { tier: 0 | 1; cx: number; cz: number; items: Map<number, number[]>; solids: Solid[]; minY: number; maxY: number }

const TIER_SIZE = [16, 48];
const REC = 17; // rand + 16 matrix floats
const ck = (t: number, cx: number, cz: number) => `${t}:${cx}:${cz}`;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _frustum = new THREE.Frustum(), _box = new THREE.Box3(), _pm = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class GroundCover {
  readonly group = new THREE.Group();
  private camera: THREE.Camera;
  private forest: Forest | null;
  private density: number;
  private protos: Proto[] = [];
  private groups: Group[] = [];
  private gIndex = new Map<string, number>();
  private chunks = new Map<string, GChunk>();
  private pending: [number, number, number][] = [];
  private lastCam = new THREE.Vector3(1e9, 0, 0);
  private lastDir = new THREE.Vector3();
  private dirty = true;
  private frame = 0;
  private noise = new Noise(WORLD.seed + 901);
  private solidId = 0;
  private statsText = '';
  private genMs = 0;
  private trailLast = new THREE.Vector3(1e9, 0, 0);
  private trailT = performance.now();
  private atlas: THREE.Texture;
  private mats = new Map<string, THREE.Material>();
  private depths = new Map<string, THREE.Material>();

  constructor(scene: THREE.Scene, camera: THREE.Camera, opts: GroundCoverOptions = {}) {
    this.camera = camera;
    this.forest = opts.forest ?? null;
    this.density = opts.density ?? 1;
    this.group.name = 'groundcover';
    scene.add(this.group);
    this.atlas = loadTex('veg/veg_atlas.png', {});
    this.buildProtos();
    this.loadModels();
    // the chunks right around the camera, synchronously
    const p = camera.position;
    for (const t of [0, 1] as const) {
      const S = TIER_SIZE[t], R = t === 0 ? 34 : 60;
      for (let cx = Math.floor((p.x - R) / S); cx <= Math.floor((p.x + R) / S); cx++) {
        for (let cz = Math.floor((p.z - R) / S); cz <= Math.floor((p.z + R) / S); cz++) this.chunk(t, cx, cz);
      }
    }
  }

  // --------------------------------------------------------------------------------------------- materials
  private plantMat(fade: [number, number], push = true): { mat: THREE.Material; depth: THREE.Material } {
    const key = `p:${fade}:${push}`;
    if (!this.mats.has(key)) {
      const o: VegMatOpts = { kind: 'plant', map: this.atlas, fade, push };
      this.mats.set(key, vegMaterial(o));
      this.depths.set(key, vegDepthMaterial(o));
    }
    return { mat: this.mats.get(key)!, depth: this.depths.get(key)! };
  }

  private solidMat(key: string, o: VegMatOpts): { mat: THREE.Material; depth: THREE.Material } {
    if (!this.mats.has(key)) {
      this.mats.set(key, vegMaterial(o));
      this.depths.set(key, vegDepthMaterial(o));
    }
    return { mat: this.mats.get(key)!, depth: this.depths.get(key)! };
  }

  // --------------------------------------------------------------------------------------------- prototypes
  private group_(name: string, tier: 0 | 1, radius: number): number {
    let gi = this.gIndex.get(name);
    if (gi === undefined) {
      gi = this.groups.length;
      this.groups.push({ name, protos: [], tier, radius });
      this.gIndex.set(name, gi);
    }
    return gi;
  }

  private addProto(group: string, tier: 0 | 1, radius: number, name: string, parts: Part[], shadow: boolean, cap = 256): void {
    const gi = this.group_(group, tier, radius);
    const pi = this.protos.length;
    const meshes = parts.map((pt) => {
      const im = new THREE.InstancedMesh(pt.geo, pt.mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadow;
      im.receiveShadow = true;
      if (pt.depth) im.customDepthMaterial = pt.depth;
      im.visible = false;
      im.name = `gc_${name}`;
      this.group.add(im);
      return im;
    });
    this.protos.push({ name, parts, meshes, cap, count: 0, shadow });
    this.groups[gi].protos.push(pi);
    this.dirty = true;
  }

  private plant(group: string, name: string, mb: MeshBuilder, fade: [number, number], shadow = false, cap = 512): void {
    const { mat, depth } = this.plantMat(fade);
    this.addProto(group, 0, fade[1], name, [{ geo: mb.build({ moss: false }), mat, depth }], shadow, cap);
  }

  private buildProtos(): void {
    const GR: [number, number] = [26, 36], SM: [number, number] = [34, 46], FE: [number, number] = [46, 60], BU: [number, number] = [62, 80];
    const LITTER: [number, number] = [22, 32];
    // grass
    this.plant('grass', 'grass_a', P.grassClump(11, ['grass_green'], 22, 0.38, 0.2), GR, false, 2048);
    this.plant('grass', 'grass_b', P.grassClump(12, ['grass_green', 'grass_yellow'], 26, 0.48, 0.24), GR, false, 2048);
    this.plant('grass', 'grass_c', P.grassClump(13, ['grass_yellow', 'grass_dry', 'grass_green'], 18, 0.32, 0.16, [1.05, 1, 0.9]), GR, false, 2048);
    this.plant('grass_dry', 'grass_dry', P.grassClump(14, ['grass_dry', 'grass_yellow'], 22, 0.42, 0.2), GR, false, 1024);
    this.plant('sedge', 'sedge', P.grassClump(15, ['grass_sedge', 'grass_green'], 16, 0.62, 0.18), GR, false, 1024);
    this.plant('grass_tall', 'grass_tall', P.grassClump(16, ['grass_green', 'grass_yellow', 'grass_dry'], 30, 0.75, 0.3), GR, false, 1024);
    // ferns
    this.plant('fern', 'fern_a', P.swordFern(21, 'fern_a', 12, 0.85), FE, true);
    this.plant('fern', 'fern_b', P.swordFern(22, 'fern_b', 15, 1.05), FE, true);
    this.plant('fern', 'fern_c', P.swordFern(23, 'fern_a', 9, 0.6), FE, true);
    this.plant('bracken', 'bracken_a', P.bracken(24, 3, 0.75), FE, true);
    this.plant('bracken', 'bracken_b', P.bracken(25, 5, 0.95), FE, true);
    // flowers & low plants
    this.plant('fireweed', 'fireweed', P.crossed(31, 'fireweed', 5, 1.2, 0.55, 0.3, 2, [1, 1, 1], 0.5), FE, true);
    this.plant('herb', 'bunch_a', P.flats(32, ['bunch_flower', 'bunch_flower', 'bunch_berry'], 9, [0.12, 0.17], 0.35, [0.05, 0.11], 0.25), SM);
    this.plant('herb', 'aster', P.crossed(33, 'aster', 3, 0.35, 0.3, 0.2, 2), SM);
    this.plant('herb', 'clubmoss', P.crossed(34, 'clubmoss', 6, 0.16, 0.16, 0.3, 2), SM);
    this.plant('lichen', 'lichen', P.crossed(35, 'lichen', 7, 0.13, 0.32, 0.4, 3, [1, 1, 1], 0), SM);
    // shrubs
    this.plant('blueberry', 'blueberry_a', P.sprigBush(41, ['blueberry_a', 'blueberry_b'], 12, [0.22, 0.34], [0.3, 0.8]), FE, true);
    this.plant('blueberry', 'blueberry_b', P.sprigBush(42, ['blueberry_b', 'blueberry_a'], 18, [0.25, 0.4], [0.2, 0.9], [1, 1, 1], 0.2), FE, true);
    this.plant('juniper', 'juniper', P.sprigBush(43, ['juniper'], 22, [0.5, 0.85], [0.0, 0.45], [0.92, 1, 1.05], 0.25), BU, true);
    {
      const bm = createTreeMaterials('fir', new THREE.Vector4(-2, -1, BU[0], BU[1]));
      for (const [seed, h] of [[44, 2.2], [45, 3.0]] as [number, number][]) {
        const { wood, leaves } = P.alder(seed, h);
        const pm = this.plantMat(BU);
        this.addProto('alder', 0, BU[1], `alder_${seed}`, [
          { geo: wood.build({ moss: false }), mat: bm.bark, depth: bm.barkDepth },
          { geo: leaves.build({ moss: false }), mat: pm.mat, depth: pm.depth },
        ], true, 256);
      }
    }
    // saplings / seedlings from the real tree generator
    const sap: [SpeciesId, number, number][] = [['spruce', 0.05, 1], ['spruce', 0.09, 2], ['fir', 0.06, 3], ['fir', 0.1, 4], ['pine', 0.07, 5], ['birch', 0.06, 6], ['birch', 0.1, 7], ['cedar', 0.08, 8]];
    for (const [sp, age, seed] of sap) {
      const m = buildTree(sp, 700 + seed, { age });
      const l = m.lod(0);
      const tm = createTreeMaterials(sp, new THREE.Vector4(-2, -1, BU[0], BU[1]));
      const parts: Part[] = [{ geo: l.bark, mat: tm.bark, depth: tm.barkDepth }];
      if (l.foliage) parts.push({ geo: l.foliage, mat: tm.foliage, depth: tm.foliageDepth });
      this.addProto(`sapling_${sp}`, 0, BU[1], `sapling_${sp}_${seed}`, parts, true, 256);
    }
    // moss mounds
    {
      const mm = this.solidMat('moss', { kind: 'moss', map: loadTex('veg/moss.png', { repeat: true }), fade: FE, vertexColors: true, roughness: 1 });
      for (const [seed, r, h] of [[51, 0.5, 0.16], [52, 0.9, 0.24], [53, 1.4, 0.3]] as [number, number, number][]) {
        this.addProto('mossmound', 0, FE[1], `moss_${seed}`, [{ geo: P.mossMound(seed, r, h).build({ moss: false }), mat: mm.mat, depth: mm.depth }], false, 512);
      }
      for (const [seed, r, h] of [[55, 1.8, 0.1], [56, 2.6, 0.12], [57, 1.3, 0.09]] as [number, number, number][]) {
        this.addProto('mosscarpet', 0, FE[1], `mosscarpet_${seed}`, [{ geo: P.mossMound(seed, r, h).build({ moss: false }), mat: mm.mat, depth: mm.depth }], false, 512);
      }
      this.plant('mosstuft', 'moss_tufts', P.crossed(54, 'moss_tuft', 6, 0.1, 0.3, 0.5, 2, [1, 1, 1], 0), SM);
    }
    // mushrooms, litter, twigs, cones
    this.plant('agaric', 'agaric', P.mushrooms(61, 'agaric', 3), LITTER, false, 256);
    this.plant('agaric', 'agaric_1', P.mushrooms(62, 'agaric', 1), LITTER, false, 256);
    this.plant('chanterelle', 'chanterelle', P.mushrooms(63, 'chanterelle', 6), LITTER, false, 256);
    this.plant('needles', 'needles', P.flats(64, ['needles'], 3, [0.9, 1.5], 0.4, [0.012, 0.02], 0.04, [1, 1, 1], 2), LITTER, false, 1024);
    this.plant('leaves', 'leaves', P.flats(65, ['litter'], 3, [0.8, 1.3], 0.4, [0.012, 0.02], 0.04, [1, 1, 1], 2), LITTER, false, 1024);
    this.plant('twigs', 'twigs', P.flats(66, ['twig'], 2, [0.5, 0.9], 0.3, [0.02, 0.04], 0.1, [1, 1, 1], 2), SM, false, 1024);
    this.plant('cones', 'cones', P.cones(67, 5, 0.25), LITTER, false, 512);
    // ---- large tier: rocks, logs, stumps, fungi
    const BIG: [number, number] = [200, 228];
    const rock = this.solidMat('rock', {
      kind: 'rock', map: loadTex('veg/mossy_rock.png', { repeat: true }), normalMap: loadTex('veg/mossy_rock_n.png', { repeat: true, srgb: false }),
      triplanar: 2.6, moss: 0.62, fade: BIG, vertexColors: true, roughness: 0.88,
    });
    for (let i = 0; i < 6; i++) {
      const mb = P.boulder(81 + i, 1, [0.55, 0.7, 0.45, 0.8, 0.6, 0.5][i]);
      this.addProto('rock', 1, BIG[1], `boulder_${i}`, [{ geo: mb.build({ moss: false }), mat: rock.mat, depth: rock.depth }], true, 256);
    }
    const logSpecs: P.LogSpec[] = [
      { species: 'cedar', len: 19, r: 0.75, seed: 91, rot: 0, moss: 1.15 },
      { species: 'cedar', len: 13, r: 0.5, seed: 92, rot: 0, moss: 1.0 },
      { species: 'spruce', len: 15, r: 0.3, seed: 93, rot: 0, moss: 0.9 },
      { species: 'spruce', len: 9, r: 0.22, seed: 94, rot: 0, moss: 0.7 },
      { species: 'fir', len: 10, r: 0.24, seed: 95, rot: 0, moss: 0.8 },
      { species: 'pine', len: 14, r: 0.28, seed: 96, rot: 0, moss: 0.45 },
      { species: 'birch', len: 8, r: 0.17, seed: 97, rot: 0, moss: 0.55 },
      { species: 'spruce', len: 6, r: 0.16, seed: 98, rot: 0, moss: 0.6 },
    ];
    this.logSpecs = logSpecs;
    logSpecs.forEach((ls, i) => {
      this.logProto[i] = this.protos.length;
      const { wood, tufts } = P.fallenLog(ls);
      const off = new THREE.Matrix4().makeTranslation(-ls.len / 2, 0, 0);
      const tm = createTreeMaterials(ls.species, new THREE.Vector4(-2, -1, BIG[0], BIG[1]));
      const pm = this.plantMat([60, 80], false);
      const g1 = wood.build(); g1.applyMatrix4(off);
      const g2 = tufts.build({ moss: false }); g2.applyMatrix4(off);
      this.addProto(i < 2 ? 'log_big' : 'log', 1, BIG[1], `log_${ls.species}_${i}`, [
        { geo: g1, mat: tm.bark, depth: tm.barkDepth }, { geo: g2, mat: pm.mat, depth: pm.depth },
      ], true, 128);
    });
    const stumps: [SpeciesId, number, number, number, boolean, number][] = [
      ['spruce', 101, 0.24, 0.45, true, 0.5], ['pine', 102, 0.3, 0.55, true, 0.3], ['cedar', 103, 0.75, 0.9, true, 0.8],
      ['spruce', 104, 0.2, 0.6, false, 0.8], ['cedar', 105, 0.55, 1.3, false, 1.0], ['birch', 106, 0.16, 0.7, false, 0.6],
    ];
    for (const [sp, seed, r, h, cut, moss] of stumps) {
      const s = P.stump(sp, seed, r, h, cut, moss);
      const tm = createTreeMaterials(sp, new THREE.Vector4(-2, -1, BIG[0], BIG[1]));
      const pm = this.plantMat([60, 80], false);
      const parts: Part[] = [{ geo: s.wood.build(), mat: tm.bark, depth: tm.barkDepth }, { geo: s.tufts.build({ moss: false }), mat: pm.mat, depth: pm.depth }];
      if (s.top) {
        const eg = this.solidMat(`eg_${sp}_${seed}`, { kind: 'wood', map: endGrainTexture(sp, r * 1.15, seed), fade: BIG, vertexColors: true, moss: 0.25 });
        parts.push({ geo: s.top.build({ moss: false }), mat: eg.mat, depth: eg.depth });
      }
      this.addProto(cut ? 'stump_cut' : 'stump', 1, BIG[1], `stump_${sp}_${seed}`, parts, true, 128);
    }
    // groups filled only by the Poly Haven models (created now so chunks generated before they load keep their items)
    for (const g of ['rockset', 'deadlog', 'deadfall']) this.group_(g, 1, BIG[1]);
    const fung = this.plantMat([30, 40], false);
    this.addProto('bracket', 1, 40, 'bracket', [{ geo: P.bracket(111, 3).build({ moss: false }), mat: fung.mat, depth: fung.depth }], false, 512);
  }

  private logSpecs: P.LogSpec[] = [];
  private logProto: number[] = [];

  /** Poly Haven conversions (lowpix): rocks, stumps, dead trunks, deadfall. Join their groups when loaded. */
  private loadModels(): void {
    const loader = new GLTFLoader();
    const BIG: [number, number] = [200, 228];
    const list: [string, string, 'rock' | 'wood', number][] = [
      ['boulder_01', 'rock', 'rock', 0], ['rock_07', 'rock', 'rock', 0], ['rock_09', 'rock', 'rock', 0], ['stone_01', 'rock', 'rock', 0],
      ['rock_moss_set_01', 'rockset', 'rock', 1], ['rock_moss_set_02', 'rockset', 'rock', 1],
      ['tree_stump_01', 'stump', 'wood', 1], ['tree_stump_02', 'stump', 'wood', 1],
      ['dead_tree_trunk', 'deadlog', 'wood', 1], ['dead_tree_trunk_02', 'deadlog', 'wood', 1],
      ['dry_branches_medium_01', 'deadfall', 'wood', 1], ['bark_debris_01', 'deadfall', 'wood', 1],
    ];
    for (const [file, group, kind, keepScale] of list) {
      loader.load(`assets/models/nature/${file}.glb`, (gltf) => {
        const geos: THREE.BufferGeometry[] = [];
        let tex: THREE.Texture | null = null;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = m.geometry.clone();
          g.applyMatrix4(m.matrixWorld);
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          geos.push(g);
          const mm = m.material as THREE.MeshStandardMaterial;
          if (!tex && mm.map) tex = mm.map;
        });
        if (!geos.length) return;
        const geo = geos.length > 1 ? mergeGeometries(geos, false)! : geos[0];
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        // rocks are normalised to a unit footprint radius (scaled per instance); everything stands on y = 0
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        geo.translate(-cx, -bb.min.y, -cz);
        if (!keepScale) {
          const s = 1 / Math.max(1e-3, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2);
          geo.scale(s, s, s);
        }
        if (group === 'log') geo.rotateY(0);
        const t = tex as THREE.Texture | null;
        if (t) { applyPixelTex(t, {}); }
        const o: VegMatOpts = kind === 'rock'
          ? { kind: 'rock', map: loadTex('veg/mossy_rock.png', { repeat: true }), normalMap: loadTex('veg/mossy_rock_n.png', { repeat: true, srgb: false }), triplanar: 2.6, moss: 0.6, fade: BIG, vertexColors: false }
          : { kind: 'wood', map: t, fade: BIG, moss: 0.45, vertexColors: false };
        if (group === 'rockset' && t) { o.map = t; o.triplanar = 0; o.normalMap = null; o.moss = 0.5; }
        const mat = this.solidMat(`glb_${file}`, o);
        this.addProto(group, 1, BIG[1], `glb_${file}`, [{ geo, mat: mat.mat, depth: mat.depth }], true, 128);
      }, undefined, () => { /* missing model: the procedural prototypes cover the group */ });
    }
  }

  // --------------------------------------------------------------------------------------------- placement
  private chunk(tier: 0 | 1, cx: number, cz: number): GChunk {
    const key = ck(tier, cx, cz);
    let c = this.chunks.get(key);
    if (c) return c;
    const t0 = performance.now();
    c = { tier, cx, cz, items: new Map(), solids: [], minY: 1e9, maxY: -1e9 };
    this.chunks.set(key, c);
    if (tier === 0) this.fillSmall(c); else this.fillLarge(c);
    if (c.minY > c.maxY) { c.minY = 0; c.maxY = 0; }
    this.genMs += performance.now() - t0;
    this.dirty = true;
    return c;
  }

  private heightGrid(x0: number, z0: number, S: number, step: number): (x: number, z: number) => number {
    const n = Math.round(S / step) + 1;
    const hs = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hs[j * n + i] = heightAt(x0 + i * step, z0 + j * step);
    return (x: number, z: number) => {
      const fx = clamp((x - x0) / step, 0, n - 1.001), fz = clamp((z - z0) / step, 0, n - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j;
      return (hs[j * n + i] * (1 - u) + hs[j * n + i + 1] * u) * (1 - w) + (hs[(j + 1) * n + i] * (1 - u) + hs[(j + 1) * n + i + 1] * u) * w;
    };
  }

  private biomeGrid(x0: number, z0: number, S: number): (x: number, z: number) => Biome {
    const a = biome(x0, z0), b = biome(x0 + S, z0), c = biome(x0, z0 + S), d = biome(x0 + S, z0 + S);
    return (x: number, z: number) => {
      const u = clamp((x - x0) / S, 0, 1), w = clamp((z - z0) / S, 0, 1);
      const o = {} as Biome;
      for (const k of Object.keys(a) as (keyof Biome)[]) o[k] = (a[k] * (1 - u) + b[k] * u) * (1 - w) + (c[k] * (1 - u) + d[k] * u) * w;
      return o;
    };
  }

  private push(c: GChunk, group: string, rand: number, x: number, y: number, z: number, rotY: number, scale: number, tilt?: THREE.Vector3, sx = 1, sz = 1): void {
    const gi = this.gIndex.get(group);
    if (gi === undefined) return;
    _p.set(x, y, z);
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    if (tilt) {
      const tq = new THREE.Quaternion().setFromUnitVectors(UP, tilt);
      _q.premultiply(tq);
    }
    _s.set(scale * sx, scale, scale * sz);
    _m.compose(_p, _q, _s);
    let arr = c.items.get(gi);
    if (!arr) c.items.set(gi, (arr = []));
    arr.push(rand, ..._m.elements);
    c.minY = Math.min(c.minY, y - 1);
    c.maxY = Math.max(c.maxY, y + 4 * scale);
  }

  private canopyFn(stands: Stand[]): (x: number, z: number) => { cover: number; conifer: number; birch: number; nearTrunk: number } {
    return (x: number, z: number) => {
      let open = 1, con = 0, bir = 0, wsum = 0, near = 99;
      for (const s of stands) {
        const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
        const cr = Math.max(0.8, s.crown);
        const w = Math.exp(-d2 / (2 * cr * cr * 0.6));
        if (!s.dead) open *= 1 - 0.7 * w * Math.min(1, s.h / 8);
        if (s.conifer) con += w; else bir += w;
        wsum += w;
        near = Math.min(near, Math.sqrt(d2) - s.r);
      }
      return { cover: 1 - open, conifer: wsum > 0 ? con / wsum : 0.5, birch: wsum > 0 ? bir / wsum : 0, nearTrunk: near };
    };
  }

  private fillSmall(c: GChunk): void {
    const S = TIER_SIZE[0];
    const x0 = c.cx * S, z0 = c.cz * S;
    const rng = new Rng((hash2(c.cx, c.cz, WORLD.seed + 11) * 4294967296) >>> 0);
    const hAt = this.heightGrid(x0, z0, S, 2);
    const bAt = this.biomeGrid(x0, z0, S);
    const stands = this.forest ? this.forest.stands(x0 + S / 2, z0 + S / 2, S * 0.75 + 8) : [];
    const can = this.canopyFn(stands);
    const lim = WORLD.half - 4;
    const D = this.density;
    const tryN = (n: number, fn: (x: number, z: number, r: number) => void) => {
      for (let i = 0; i < Math.round(n * D); i++) {
        const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
        const r = rng.next();
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        fn(x, z, r);
      }
    };
    const ok = (x: number, z: number, minClear: number, avoid: number) => {
      const cl = clearance(x, z);
      if (cl < minClear) return -1;
      if (avoid > 0 && can(x, z).nearTrunk < avoid) return -1;
      return cl;
    };
    const patch = (x: number, z: number, f: number, o: number) => this.noise.n2(x / f + o, z / f - o);
    // grass: gaps, verges, birch stands, the burn; sedge in the wet
    tryN(420, (x, z, r) => {
      const cl = clearance(x, z);
      const y = hAt(x, z);
      if (y < WORLD.waterY + 0.05) return;
      const b = bAt(x, z);
      const cv = can(x, z);
      const verge = cl < 0.12 ? 0 : 1 - smoothstep(0.35, 0.95, cl);
      let p = (0.04 + 0.75 * Math.pow(1 - cv.cover, 1.5)) * (0.6 + 0.6 * patch(x, z, 9, 1)) + 1.1 * verge + 0.4 * b.burn + 0.3 * cv.birch;
      if (cl < 0.12) p = 0.05;
      if (r > p * 0.55) return;
      let g = 'grass';
      if (b.wet > 0.72 && rng.chance(0.6)) g = 'sedge';
      else if (b.burn > 0.4 || (b.wet < 0.3 && rng.chance(0.4))) g = 'grass_dry';
      else if (verge > 0.4 && rng.chance(0.35)) g = 'grass_tall';
      this.push(c, g, rng.next(), x, y, z, rng.range(0, 6.28), rng.range(0.75, 1.25));
    });
    // ferns: shade and moisture, in patches
    tryN(150, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const p = (0.15 + 0.85 * cv.cover) * (0.2 + 1.0 * b.wet + 0.4 * b.old) * (1 - b.burn) * smoothstep(-0.45, 0.25, patch(x, z, 14, 3));
      if (r > p) return;
      if (ok(x, z, 0.6, 0.35) < 0) return;
      this.push(c, 'fern', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.75, 1.3));
    });
    // bracken: drier, half-open ground, big patches
    tryN(40, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const p = (0.25 + 0.6 * (1 - cv.cover)) * (1 - 0.6 * b.wet) * smoothstep(0.05, 0.5, patch(x, z, 22, 7)) + 0.3 * b.burn;
      if (r > p) return;
      if (ok(x, z, 0.5, 0.3) < 0) return;
      this.push(c, 'bracken', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.25));
    });
    // fireweed: burn, verges, gaps
    tryN(10, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const cl = clearance(x, z);
      const p = 1.2 * b.burn + 0.35 * (1 - cv.cover) * smoothstep(0.2, 0.6, patch(x, z, 18, 11)) + (cl > 0.3 && cl < 0.85 ? 0.3 : 0);
      if (r > p) return;
      if (cl < 0.25) return;
      this.push(c, 'fireweed', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.2));
    });
    // forest-floor herbs (bunchberry, asters, clubmoss) under the canopy
    tryN(70, (x, z, r) => {
      const cv = can(x, z);
      const p = 0.15 + 0.6 * cv.cover * smoothstep(-0.2, 0.4, patch(x, z, 8, 5));
      if (r > p || ok(x, z, 0.6, 0.15) < 0) return;
      this.push(c, 'herb', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.3));
    });
    // reindeer lichen and blueberry: dry pine ground
    tryN(40, (x, z, r) => {
      const b = bAt(x, z);
      const pineF = b.pine / (b.spruce + b.fir + b.pine + b.birch + b.cedar);
      const dry = 1 - b.wet;
      const p = (0.1 + 0.9 * pineF) * dry * smoothstep(-0.1, 0.5, patch(x, z, 10, 13));
      if (r > p || ok(x, z, 0.6, 0.2) < 0) return;
      this.push(c, rng.chance(0.45) ? 'lichen' : 'blueberry', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.3));
    });
    // juniper (dry, rocky) and alder (wet, verges)
    tryN(3, (x, z, r) => {
      const b = bAt(x, z);
      const cl = ok(x, z, 0.55, 0.6);
      if (cl < 0) return;
      if (b.wet < 0.4 && r < 0.25 + 0.4 * b.pine / 2) this.push(c, 'juniper', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.3));
      else if (b.wet > 0.55 && r < 0.5 * b.wet) this.push(c, 'alder', rng.next(), x, hAt(x, z) - 0.05, z, rng.range(0, 6.28), rng.range(0.8, 1.2));
    });
    // saplings and seedlings: advance regeneration, more in gaps
    tryN(12, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const p = 0.18 + 0.5 * (1 - cv.cover);
      if (r > p || ok(x, z, 0.6, 0.6) < 0) return;
      const w = { spruce: b.spruce, fir: b.fir * 1.6, pine: b.pine * 0.5, birch: b.birch, cedar: b.cedar };
      const tot = w.spruce + w.fir + w.pine + w.birch + w.cedar;
      let s = rng.next() * tot;
      let sp: SpeciesId = 'fir';
      for (const k of ['spruce', 'fir', 'pine', 'birch', 'cedar'] as SpeciesId[]) { s -= w[k]; if (s <= 0) { sp = k; break; } }
      this.push(c, `sapling_${sp}`, rng.next(), x, hAt(x, z) - 0.02, z, rng.range(0, 6.28), rng.range(0.7, 1.35));
    });
    // moss mounds and cushions: wet shade, old growth
    tryN(60, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const p = (0.1 + 0.8 * b.wet * cv.cover + 0.7 * b.old) * smoothstep(-0.3, 0.3, patch(x, z, 12, 17));
      if (r > p || ok(x, z, 0.6, 0.2) < 0) return;
      const u = rng.next();
      if (u < 0.45) {
        const e = 0.8;
        const nx = hAt(x - e, z) - hAt(x + e, z), nz = hAt(x, z - e) - hAt(x, z + e);
        this.push(c, 'mosscarpet', rng.next(), x, hAt(x, z) - 0.05, z, rng.range(0, 6.28), rng.range(0.7, 1.5), new THREE.Vector3(nx, 2 * e, nz).normalize());
      } else this.push(c, u < 0.8 ? 'mossmound' : 'mosstuft', rng.next(), x, hAt(x, z) - 0.03, z, rng.range(0, 6.28), rng.range(0.7, 1.4));
    });
    // litter under the trees: needles under conifers, leaves under birch; twigs and cones everywhere
    tryN(40, (x, z, r) => {
      const cv = can(x, z);
      if (r > 0.2 + 0.8 * cv.cover || ok(x, z, 0.4, 0.1) < 0) return;
      const y = hAt(x, z);
      this.push(c, cv.birch > 0.5 ? 'leaves' : 'needles', rng.next(), x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.4));
    });
    tryN(16, (x, z) => {
      if (ok(x, z, 0.4, 0.1) < 0) return;
      this.push(c, 'twigs', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.3));
    });
    tryN(10, (x, z, r) => {
      const cv = can(x, z);
      if (r > cv.cover * cv.conifer || ok(x, z, 0.4, 0.05) < 0) return;
      this.push(c, 'cones', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.2));
    });
    // mushrooms: fly agaric with birch / spruce, chanterelles in moist moss
    tryN(5, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      if (r > 0.35 * cv.cover || ok(x, z, 0.6, 0.1) < 0) return;
      this.push(c, b.wet > 0.55 && rng.chance(0.6) ? 'chanterelle' : 'agaric', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.3));
    });
  }

  private fillLarge(c: GChunk): void {
    const S = TIER_SIZE[1];
    const x0 = c.cx * S, z0 = c.cz * S;
    const rng = new Rng((hash2(c.cx, c.cz, WORLD.seed + 29) * 4294967296) >>> 0);
    const hAt = this.heightGrid(x0, z0, S, 4);
    const bAt = this.biomeGrid(x0, z0, S);
    const stands = this.forest ? this.forest.stands(x0 + S / 2, z0 + S / 2, S * 0.75 + 20) : [];
    const lim = WORLD.half - 10;
    const clearOf = (x: number, z: number, r: number) => {
      for (const s of stands) if (Math.hypot(s.x - x, s.z - z) < s.r + r + 0.15) return false;
      return true;
    };
    const D = this.density;
    const normal = (x: number, z: number) => {
      const e = 1.0;
      const hx = hAt(x + e, z) - hAt(x - e, z), hz = hAt(x, z + e) - hAt(x, z - e);
      return new THREE.Vector3(-hx, 2 * e, -hz).normalize();
    };
    // boulders: Canadian Shield erratics, more on ridges and slopes, in little clusters
    for (let i = 0; i < Math.round(9 * D); i++) {
      const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      const b = bAt(x, z);
      const n = normal(x, z);
      const p = 0.25 + 0.5 * (1 - n.y) * 6 + 0.3 * smoothstep(0.1, 0.6, this.noise.n2(x / 60, z / 60));
      if (rng.next() > p) continue;
      if (clearance(x, z) < 0.7) continue;
      const big = rng.chance(0.25 + 0.2 * b.old);
      const size = big ? rng.range(1.2, 2.6) : rng.range(0.25, 0.9);
      if (!clearOf(x, z, size * 0.9)) continue;
      const y = hAt(x, z) - size * rng.range(0.15, 0.35);
      const set = !big && rng.chance(0.18);
      this.push(c, set ? 'rockset' : 'rock', rng.next(), x, y, z, rng.range(0, 6.28), set ? 1 : size, n.clone().lerp(UP, 0.4).normalize());
      c.solids.push({ id: this.solidId++, kind: 'rock', shape: 'sphere', x, y: y + size * 0.35, z, r: set ? 1.2 : size * 0.85, h: 0 });
    }
    // fallen logs: deadfall everywhere, giant mossy cedar logs in old growth, charred in the burn
    for (let i = 0; i < Math.round(12 * D); i++) {
      const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      const b = bAt(x, z);
      const p = 0.3 + 0.9 * b.old + 0.4 * b.burn + 0.2 * b.wet;
      if (rng.next() > p) continue;
      if (clearance(x, z) < 0.8) continue;
      const giant = b.old > 0.35 && rng.chance(0.45 + b.old * 0.3);
      const pool = this.logSpecs.map((l, k) => k).filter((k) => (giant ? k < 2 : k >= 2));
      const k = rng.pick(pool);
      const ls = this.logSpecs[k];
      const sc = rng.range(0.85, 1.15);
      let placed = false;
      for (let tries = 0; tries < 4 && !placed; tries++) {
        const yaw = rng.range(0, Math.PI * 2);
        const dx = Math.cos(yaw), dz = -Math.sin(yaw);
        const L = ls.len * sc;
        const ax = x - dx * L / 2, az = z - dz * L / 2, bx = x + dx * L / 2, bz = z + dz * L / 2;
        let clear = true;
        for (let s = 0; s <= 6 && clear; s++) {
          const t = s / 6;
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          if (!clearOf(px, pz, ls.r * sc) || clearance(px, pz) < 0.6) clear = false;
        }
        if (!clear) continue;
        const ha = hAt(ax, az), hb = hAt(bx, bz);
        const pitch = Math.atan2(hb - ha, L);
        const y = (ha + hb) / 2;
        // rotation: yaw about Y then pitch about the log's side axis
        _e.set(0, yaw, pitch, 'YXZ');
        _q.setFromEuler(_e);
        _s.set(sc, sc, sc);
        _p.set(x, y, z);
        _m.compose(_p, _q, _s);
        const gi = this.gIndex.get(k < 2 ? 'log_big' : 'log')!;
        // explicit prototype (rand >= 10): the collider must match this exact log
        const rand = 10 + this.logProto[k];
        let arr = c.items.get(gi);
        if (!arr) c.items.set(gi, (arr = []));
        arr.push(rand, ..._m.elements);
        c.minY = Math.min(c.minY, y - 2);
        c.maxY = Math.max(c.maxY, y + ls.r * 2 * sc + 1);
        const r = ls.r * sc;
        c.solids.push({ id: this.solidId++, kind: 'log', shape: 'capsule', x: ax, y: ha + r * 0.7, z: az, x2: bx, y2: hb + r * 0.55, z2: bz, r, h: 0 });
        // bracket fungi along the shaded side
        if (rng.chance(0.6)) {
          const nf = rng.int(1, 3);
          for (let f = 0; f < nf; f++) {
            const t = rng.range(0.2, 0.8);
            const side = rng.chance(0.5) ? 1 : -1;
            const lp = new THREE.Vector3((t - 0.5) * ls.len, ls.r * 0.75, side * ls.r * 0.98).applyMatrix4(_m);
            const ry = yaw + (side > 0 ? 0 : Math.PI);
            this.push(c, 'bracket', rng.next(), lp.x, lp.y, lp.z, ry, rng.range(0.7, 1.2) * Math.min(1.6, 0.6 + ls.r));
          }
        }
        placed = true;
      }
    }
    // stumps: old logging near roads / the cabin (saw-cut), rotten ones in the bush
    for (let i = 0; i < Math.round(5 * D); i++) {
      const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      const cl = clearance(x, z);
      if (cl < 0.5) continue;
      const b = bAt(x, z);
      const nearRoad = cl < 0.98 ? 1 : 0;
      const dCabin = Math.hypot(x, z);
      const logged = nearRoad * 0.6 + (dCabin < 160 ? 0.7 : 0);
      if (rng.next() > 0.25 + logged + 0.3 * b.old) continue;
      if (!clearOf(x, z, 0.9)) continue;
      const cut = rng.chance(0.3 + logged * 0.5);
      const y = hAt(x, z) - 0.05;
      this.push(c, cut ? 'stump_cut' : 'stump', rng.next(), x, y, z, rng.range(0, 6.28), rng.range(0.85, 1.2));
      c.solids.push({ id: this.solidId++, kind: 'stump', shape: 'cylinder', x, y, z, r: cut ? 0.4 : 0.5, h: cut ? 0.6 : 0.9 });
      if (!cut && rng.chance(0.5)) this.push(c, 'bracket', rng.next(), x + 0.3, y + 0.35, z, 0, 0.8);
    }
    // deadfall: broken branches, bark debris, the bleached Poly Haven trunks
    for (let i = 0; i < Math.round(6 * D); i++) {
      const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (clearance(x, z) < 0.7 || !clearOf(x, z, 0.8)) continue;
      const y = hAt(x, z);
      const yaw = rng.range(0, 6.28);
      if (rng.chance(0.3)) {
        // a weathered dead trunk (Poly Haven), long axis = local X
        this.push(c, 'deadlog', rng.next(), x, y - 0.06, z, yaw, rng.range(0.9, 1.15), normal(x, z));
        const dx = Math.cos(yaw) * 1.8, dz = -Math.sin(yaw) * 1.8;
        c.solids.push({ id: this.solidId++, kind: 'log', shape: 'capsule', x: x - dx, y: y + 0.2, z: z - dz, x2: x + dx, y2: y + 0.2, z2: z + dz, r: 0.3, h: 0 });
      } else {
        this.push(c, 'deadfall', rng.next(), x, y - 0.03, z, yaw, rng.range(0.85, 1.4), normal(x, z));
      }
    }
  }

  // --------------------------------------------------------------------------------------------- update
  update(cam: THREE.Camera = this.camera): void {
    this.frame++;
    this.camera = cam;
    const p = cam.position;
    // player trail for the spring-back
    const pl = G.uPushers.value[0];
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.trailT) / 1000);
    this.trailT = now;
    for (const t of TRAIL.value) t.w += dt;
    if (pl.w > 0 && Math.hypot(pl.x - this.trailLast.x, pl.z - this.trailLast.z) > 0.3) {
      // recycle the oldest slot
      let oi = 0;
      for (let i = 1; i < TRAIL_N; i++) if (TRAIL.value[i].w > TRAIL.value[oi].w) oi = i;
      TRAIL.value[oi].set(this.trailLast.x, this.trailLast.y, this.trailLast.z, 0.05);
      this.trailLast.set(pl.x, pl.y, pl.z);
      if (this.trailLast.x > 1e8) this.trailLast.set(pl.x, pl.y, pl.z);
    }
    // stream chunks (nearest first, small budget per frame)
    if (this.frame % 8 === 1 || !this.pending.length) {
      const list: [number, number, number, number][] = [];
      for (const t of [0, 1] as const) {
        const S = TIER_SIZE[t];
        const R = t === 0 ? 82 : 232;
        const pc = Math.floor(p.x / S), pz = Math.floor(p.z / S), rc = Math.ceil(R / S);
        for (let cx = pc - rc; cx <= pc + rc; cx++) for (let cz = pz - rc; cz <= pz + rc; cz++) {
          const d = Math.hypot((cx + 0.5) * S - p.x, (cz + 0.5) * S - p.z);
          if (d < R + S && !this.chunks.has(ck(t, cx, cz))) list.push([t, cx, cz, d * (t === 0 ? 1 : 0.6)]);
        }
      }
      list.sort((a, b) => a[3] - b[3]);
      this.pending = list.map((l) => [l[0], l[1], l[2]]);
    }
    const t0 = performance.now();
    while (this.pending.length && performance.now() - t0 < 4) {
      const [t, cx, cz] = this.pending.shift()!;
      this.chunk(t as 0 | 1, cx, cz);
    }
    // evict far chunks (keep memory bounded)
    if (this.frame % 120 === 0) {
      for (const [k, c] of this.chunks) {
        const S = TIER_SIZE[c.tier];
        if (Math.hypot((c.cx + 0.5) * S - p.x, (c.cz + 0.5) * S - p.z) > (c.tier === 0 ? 220 : 520)) this.chunks.delete(k);
      }
    }
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    if (this.dirty || p.distanceTo(this.lastCam) > 1.5 || dir.dot(this.lastDir) < 0.995 || this.frame % 60 === 0) {
      this.dirty = false;
      this.lastCam.copy(p);
      this.lastDir.copy(dir);
      this.rebuild();
    }
  }

  private rebuild(): void {
    const cam = this.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    const px = cam.position.x, pz = cam.position.z;
    for (const pr of this.protos) pr.count = 0;
    let n = 0;
    for (const c of this.chunks.values()) {
      if (!c.items.size) continue;
      const S = TIER_SIZE[c.tier];
      const x0 = c.cx * S, z0 = c.cz * S;
      const dx = Math.max(x0 - px, 0, px - (x0 + S)), dz = Math.max(z0 - pz, 0, pz - (z0 + S));
      const dc = Math.hypot(dx, dz);
      const pad = c.tier === 1 ? 12 : 2;
      _box.min.set(x0 - pad, c.minY, z0 - pad);
      _box.max.set(x0 + S + pad, c.maxY, z0 + S + pad);
      if (!_frustum.intersectsBox(_box)) continue;
      for (const [gi, arr] of c.items) {
        const g = this.groups[gi];
        if (!g.protos.length || dc > g.radius) continue;
        const R2 = g.radius * g.radius;
        for (let i = 0; i < arr.length; i += REC) {
          const ex = arr[i + 13] - px, ez = arr[i + 15] - pz;
          if (ex * ex + ez * ez > R2) continue;
          const pi = arr[i] >= 10 ? arr[i] - 10 : g.protos[Math.min(g.protos.length - 1, Math.floor(arr[i] * g.protos.length))];
          const pr = this.protos[pi];
          if (pr.count >= pr.cap) this.grow(pr);
          const k = pr.count++;
          for (const im of pr.meshes) {
            const a = im.instanceMatrix.array as Float32Array;
            for (let e = 0; e < 16; e++) a[k * 16 + e] = arr[i + 1 + e];
          }
          n++;
        }
      }
    }
    let tris = 0;
    for (const pr of this.protos) {
      for (const im of pr.meshes) {
        im.count = pr.count;
        im.visible = pr.count > 0;
        if (pr.count) {
          im.instanceMatrix.clearUpdateRanges();
          im.instanceMatrix.addUpdateRange(0, pr.count * 16);
          im.instanceMatrix.needsUpdate = true;
          tris += (im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3 * pr.count;
        }
      }
    }
    const per: string[] = [];
    if ((globalThis as unknown as { __gcdebug?: boolean }).__gcdebug) {
      const cnt = new Map<string, number>();
      for (const c of this.chunks.values()) for (const [gi, arr] of c.items) cnt.set(this.groups[gi].name, (cnt.get(this.groups[gi].name) ?? 0) + arr.length / REC);
      for (const [k, v] of cnt) per.push(`${k}:${v}`);
      per.push('| visible:');
      for (const pr of this.protos) if (pr.count) per.push(`${pr.name}:${pr.count}`);
    }
    this.statsText = (per.length ? per.join(' ') + '\n' : '') + `groundcover: ${n} instances, ${this.protos.length} prototypes, ${this.chunks.size} chunks (gen ${this.genMs.toFixed(0)} ms) ~${(tris / 1e6).toFixed(2)}M tris`;
  }

  private grow(pr: Proto): void {
    const cap = pr.cap * 2;
    pr.meshes = pr.meshes.map((old) => {
      const im = new THREE.InstancedMesh(old.geometry, old.material, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      (im.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      im.frustumCulled = false;
      im.castShadow = old.castShadow;
      im.receiveShadow = true;
      im.customDepthMaterial = old.customDepthMaterial;
      im.name = old.name;
      this.group.remove(old);
      old.dispose();
      this.group.add(im);
      return im;
    });
    pr.cap = cap;
  }

  // --------------------------------------------------------------------------------------------- queries
  /** solid ground-cover things for colliders (rocks: spheres, logs: capsules, stumps: cylinders) within r */
  solids(x: number, z: number, r: number): Solid[] {
    const S = TIER_SIZE[1];
    const out: Solid[] = [];
    for (let cx = Math.floor((x - r - 12) / S); cx <= Math.floor((x + r + 12) / S); cx++) {
      for (let cz = Math.floor((z - r - 12) / S); cz <= Math.floor((z + r + 12) / S); cz++) {
        const c = this.chunk(1, cx, cz);
        for (const s of c.solids) {
          let d: number;
          if (s.shape === 'capsule') {
            const ax = s.x, az = s.z, bx = s.x2!, bz = s.z2!;
            const vx = bx - ax, vz = bz - az;
            const t = clamp(((x - ax) * vx + (z - az) * vz) / Math.max(1e-6, vx * vx + vz * vz), 0, 1);
            d = Math.hypot(ax + vx * t - x, az + vz * t - z);
          } else d = Math.hypot(s.x - x, s.z - z);
          if (d - s.r <= r) out.push(s);
        }
      }
    }
    return out;
  }

  stats(): string { return this.statsText; }
}
