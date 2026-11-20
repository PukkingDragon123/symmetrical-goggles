// Ground cover: streamed around the camera in chunks (16 m for small plants out to ~90 m, 48 m for rocks / logs /
// stumps out to ~220 m), deterministic per chunk, instanced per prototype (one draw call per prototype part; the
// grass and meadow clumps have a lighter far LOD past ~11 m).
//
//   grass:  mixed clumps of several grasses (blue-joint, timothy, wavy hair-grass, fine fescue, last year's thatch)
//           with seed heads; lush meadow in clearings and on verges, wisps under the canopy, dry grass on the burn
//           and pine ridges, sedge in the wet
//   herbs:  sword, ostrich and bracken ferns, wild sarsaparilla, bunchberry, clubmoss, reindeer lichen
//   shrubs: blueberry, Labrador tea (wet conifer ground and the shore), raspberry canes (edges, verges, the burn),
//           juniper, alder, saplings and seedlings of every tree species (the real tree generator)
//   flowers: fireweed, goldenrod, purple asters, pearly everlasting; on the roadside oxeye daisy, orange hawkweed,
//           tufted vetch and yarrow among the grass
//   shore:  cattails and reeds in the shallows, sedge on the margin, lily pads (some flowering) on the water,
//           bleached driftwood on the beach
//   floor:  moss cushions and carpets, needle / leaf / autumn litter, twigs, cones dropped under their trees,
//           mushrooms in clusters (fly agaric, chanterelle, bolete, honey mushrooms on stumps, puffballs)
//   large:  fractured granite boulders + Poly Haven rocks (moss and lichen in the shader, moss carpets at their
//           feet), fallen mossy logs, fallen branches, Poly Haven dead trunks, stumps with root flare, bracket fungi
//
// Placement reads layout (clearance, roads, the lake, biome) and the forest canopy: densest in clearings, gaps and
// along road verges, a mixed shrubby fringe at stand edges, sparse under thick conifers, trail centres worn bare,
// and every zone fades into the next. Density and draw distance scale with the quality preset (density option).
//
// Plants sway in rolling wind gusts, bend away from G.uPushers (player = slot 0, creatures, and the Jeep / trailer
// this module adds in slots 5-7), spring back behind the player, and stay pressed flat along the trample map
// (veg/trample.ts) and the wheel ruts.
//
// API: new GroundCover(scene, camera, { forest, density }); update(cam); solids(x, z, r) -> rocks / logs / stumps for
// colliders; track(object, 'vehicle' | 'trailer') adds a pusher (the Jeep and trailer are found on window.__game
// when nobody calls it).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../gfx/globals';
import { loadTex, applyPixelTex } from '../gfx/tex';
import { Rng, hash2 } from '../core/rng';
import { Noise, clamp, smoothstep } from '../core/noise';
import { WORLD, SPOTS, biome, clearance, heightAt, roadInfo, type Biome } from './layout';
import type { Forest, Stand } from './forest';
import { MeshBuilder } from '../trees/geom';
import { buildTree } from '../trees/build';
import { createTreeMaterials } from '../trees/materials';
import { endGrainTexture } from '../trees/textures';
import type { SpeciesId } from '../trees/species';
import { vegMaterial, vegDepthMaterial, TRAIL, TRAIL_N, type VegMatOpts } from './veg/material';
import { trample } from './veg/trample';
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
interface Proto { name: string; parts: Part[]; meshes: THREE.InstancedMesh[]; cap: number; count: number; shadow: boolean; lod: number }
interface Group { name: string; protos: number[]; tier: 0 | 1; radius: number }
interface GChunk { tier: 0 | 1; cx: number; cz: number; items: Map<number, number[]>; solids: Solid[]; minY: number; maxY: number }
interface Canopy { cover: number; conifer: number; birch: number }

const TIER_SIZE = [16, 48];
const REC = 17; // rand + 16 matrix floats
const ck = (t: number, cx: number, cz: number) => `${t}:${cx}:${cz}`;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _frustum = new THREE.Frustum(), _box = new THREE.Box3(), _pm = new THREE.Matrix4();
const _tq = new THREE.Quaternion(), _dir = new THREE.Vector3(), _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class GroundCover {
  readonly group = new THREE.Group();
  private camera: THREE.Camera;
  private forest: Forest | null;
  private density: number;
  /** draw-distance multiplier from the density (quality preset) */
  private fm: number;
  /** grass clumps switch to their far LOD beyond this distance (m) */
  private lodDist: number;
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
  private tracked: { obj: THREE.Object3D; kind: 'vehicle' | 'trailer' }[] = [];
  private autoTrack = true;

  constructor(scene: THREE.Scene, camera: THREE.Camera, opts: GroundCoverOptions = {}) {
    this.camera = camera;
    this.forest = opts.forest ?? null;
    this.density = opts.density ?? 1;
    this.fm = clamp(0.72 + 0.3 * this.density, 0.85, 1.12);
    this.lodDist = 6 + 5 * this.density;
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

  /** a vehicle (or trailer) that pushes plants aside and flattens them (slots 5-7 of G.uPushers) */
  track(obj: THREE.Object3D, kind: 'vehicle' | 'trailer' = 'vehicle'): void {
    this.autoTrack = false;
    if (!this.tracked.some((t) => t.obj === obj)) this.tracked.push({ obj, kind });
  }

  // --------------------------------------------------------------------------------------------- materials
  private fade(a: number, b: number): [number, number] { return [Math.round(a * this.fm), Math.round(b * this.fm)]; }

  private plantMat(fade: [number, number], push = true, tint = 1): { mat: THREE.Material; depth: THREE.Material } {
    const key = `p:${fade}:${push}:${tint}`;
    if (!this.mats.has(key)) {
      const o: VegMatOpts = { kind: 'plant', map: this.atlas, fade, push, tint };
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

  private makeProto(name: string, parts: Part[], shadow: boolean, cap: number): number {
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
    this.protos.push({ name, parts, meshes, cap, count: 0, shadow, lod: -1 });
    this.dirty = true;
    return pi;
  }

  private addProto(group: string, tier: 0 | 1, radius: number, name: string, parts: Part[], shadow: boolean, cap = 256): number {
    const gi = this.group_(group, tier, radius);
    const pi = this.makeProto(name, parts, shadow, cap);
    this.groups[gi].protos.push(pi);
    return pi;
  }

  private plant(group: string, name: string, mb: MeshBuilder, fade: [number, number], shadow = false, cap = 512, tint = 1): number {
    const { mat, depth } = this.plantMat(fade, true, tint);
    return this.addProto(group, 0, fade[1], name, [{ geo: mb.build({ moss: false }), mat, depth }], shadow, cap);
  }

  /** a grass clump with a lighter far version (same layout, half the blades, one segment) */
  private grass(group: string, name: string, seed: number, o: P.MeadowSpec, fade: [number, number], cap = 2048): void {
    const near = this.plant(group, name, P.meadow(seed, o), fade, false, cap);
    const { mat, depth } = this.plantMat(fade, true, 1);
    this.protos[near].lod = this.makeProto(`${name}_far`, [{ geo: P.meadow(seed, o, true).build({ moss: false }), mat, depth }], false, cap * 2);
  }

  private buildProtos(): void {
    const GR = this.fade(30, 42), SM = this.fade(34, 46), FE = this.fade(46, 60), BU = this.fade(62, 80);
    const LITTER = this.fade(22, 32);
    // ---- grass: forest-gap mixes, lush meadow with seed heads, dry, sedge, shade wisps
    this.grass('grass', 'grass_a', 11, { blades: [['grass_green', 3], ['grass_fine', 2], ['grass_short', 2]], n: 34, h: [0.18, 0.45], spread: 0.26 }, GR);
    this.grass('grass', 'grass_b', 12, {
      blades: [['grass_green', 2], ['grass_yellow', 2], ['grass_fine', 2]], n: 40, h: [0.25, 0.55], spread: 0.3,
      heads: { cells: ['seed_timothy', 'seed_hair'], n: 2, h: [0.55, 0.8] },
    }, GR);
    this.grass('meadow', 'meadow_a', 13, {
      blades: [['grass_lush', 2], ['grass_green', 2], ['grass_fine', 1]], n: 48, h: [0.35, 0.8], spread: 0.36,
      heads: { cells: ['seed_bluejoint'], n: 3, h: [0.85, 1.15] },
    }, GR);
    this.grass('meadow', 'meadow_b', 14, {
      blades: [['grass_yellow', 2], ['grass_fine', 2], ['grass_green', 1]], n: 44, h: [0.3, 0.7], spread: 0.34,
      heads: { cells: ['seed_timothy', 'seed_hair', 'seed_timothy'], n: 4, h: [0.6, 0.95] },
    }, GR);
    this.grass('meadow', 'meadow_c', 15, {
      blades: [['grass_thatch', 2], ['grass_dry', 1], ['grass_lush', 2]], n: 36, h: [0.25, 0.6], spread: 0.32,
      heads: { cells: ['seed_hair', 'seed_bluejoint'], n: 2, h: [0.6, 0.9] },
    }, GR);
    this.plant('grass_dry', 'grass_dry', P.meadow(16, {
      blades: [['grass_dry', 2], ['grass_yellow', 1], ['grass_thatch', 2]], n: 28, h: [0.2, 0.5], spread: 0.26,
      heads: { cells: ['seed_hair'], n: 3, h: [0.45, 0.7] },
    }), GR, false, 1024);
    this.plant('sedge', 'sedge', P.meadow(17, { blades: [['grass_sedge', 3], ['grass_lush', 1]], n: 22, h: [0.4, 0.8], spread: 0.2, w: 1.15 }), GR, false, 1024);
    this.plant('wisp', 'wisp', P.meadow(18, { blades: [['grass_fine', 2], ['grass_short', 1]], n: 12, h: [0.12, 0.3], spread: 0.18 }), GR, false, 1024);
    // ---- ferns
    this.plant('fern', 'fern_a', P.swordFern(21, 'fern_a', 12, 0.85), FE, true);
    this.plant('fern', 'fern_b', P.swordFern(22, 'fern_b', 15, 1.05), FE, true);
    this.plant('ostrich', 'ostrich_a', P.ostrich(26, 9, 1.15), FE, true);
    this.plant('ostrich', 'ostrich_b', P.ostrich(27, 7, 0.85), FE, true);
    this.plant('bracken', 'bracken_a', P.bracken(24, 3, 0.75), FE, true);
    this.plant('bracken', 'bracken_b', P.bracken(25, 5, 0.95), FE, true);
    // ---- wildflowers: in grass, so they read as part of the sward
    const tuft: [P.MeadowSpec['blades'][number], P.MeadowSpec['blades'][number]] = [['grass_green', 2], ['grass_fine', 1]];
    this.plant('fireweed', 'fireweed', P.crossed(31, 'fireweed', 5, 1.2, 0.55, 0.3, 2, [1, 1, 1], 0.5), FE, true, 512, 0.3);
    this.plant('goldenrod', 'goldenrod', P.meadow(32, { blades: [...tuft], n: 14, h: [0.2, 0.45], spread: 0.28, heads: { cells: ['goldenrod'], n: 4, h: [0.75, 1.05] } }), SM, false, 512, 0.5);
    this.plant('asters', 'asters', P.meadow(33, { blades: [...tuft], n: 12, h: [0.2, 0.4], spread: 0.26, heads: { cells: ['aster_purple'], n: 4, h: [0.5, 0.75] } }), SM, false, 512, 0.5);
    this.plant('everlasting', 'everlasting', P.meadow(34, { blades: [['grass_dry', 1], ['grass_fine', 1]], n: 10, h: [0.15, 0.35], spread: 0.24, heads: { cells: ['everlasting'], n: 5, h: [0.35, 0.5] } }), SM, false, 512, 0.5);
    this.plant('roadside', 'roadside_a', P.meadow(35, { blades: [...tuft, ['grass_lush', 1]], n: 22, h: [0.25, 0.5], spread: 0.32, heads: { cells: ['daisy', 'daisy', 'hawkweed', 'yarrow'], n: 6, h: [0.4, 0.65] } }), SM, false, 1024, 0.5);
    this.plant('roadside', 'roadside_b', P.meadow(36, { blades: [...tuft], n: 18, h: [0.2, 0.45], spread: 0.3, heads: { cells: ['vetch', 'hawkweed', 'vetch', 'yarrow'], n: 6, h: [0.4, 0.55] } }), SM, false, 1024, 0.5);
    this.plant('herb', 'bunch_a', P.flats(37, ['bunch_flower', 'bunch_flower', 'bunch_berry'], 9, [0.12, 0.17], 0.35, [0.05, 0.11], 0.25), SM, false, 512, 0.3);
    this.plant('herb', 'aster', P.crossed(38, 'aster', 3, 0.35, 0.3, 0.2, 2), SM, false, 512, 0.3);
    this.plant('herb', 'clubmoss', P.crossed(39, 'clubmoss', 6, 0.16, 0.16, 0.3, 2), SM, false, 512, 0.6);
    this.plant('sarsaparilla', 'sarsaparilla_a', P.umbrella(40, 5, 0.4), SM, false, 512, 0.6);
    this.plant('sarsaparilla', 'sarsaparilla_b', P.umbrella(41, 8, 0.65), SM, false, 512, 0.6);
    this.plant('lichen', 'lichen', P.crossed(42, 'lichen', 7, 0.13, 0.32, 0.4, 3, [1, 1, 1], 0), SM, false, 512, 0.2);
    this.plant('seedling', 'seedling', P.crossed(43, 'seedling', 3, 0.2, 0.2, 0.25, 2), SM, false, 512, 0.4);
    // ---- shrubs
    this.plant('blueberry', 'blueberry_a', P.sprigBush(51, ['blueberry_a', 'blueberry_b'], 12, [0.22, 0.34], [0.3, 0.8]), FE, true, 512, 0.4);
    this.plant('blueberry', 'blueberry_b', P.sprigBush(52, ['blueberry_b', 'blueberry_a'], 18, [0.25, 0.4], [0.2, 0.9], [1, 1, 1], 0.2), FE, true, 512, 0.4);
    this.plant('labrador', 'labrador_a', P.sprigBush(53, ['labrador'], 14, [0.32, 0.46], [0.25, 0.95], [1, 1, 1], 0.12), FE, true, 512, 0.3);
    this.plant('labrador', 'labrador_b', P.sprigBush(54, ['labrador'], 22, [0.35, 0.55], [0.15, 0.9], [0.95, 1, 0.95], 0.28), FE, true, 512, 0.3);
    this.plant('raspberry', 'raspberry_a', P.sprigBush(55, ['raspberry'], 10, [0.6, 0.95], [0.45, 1.15], [1, 1, 1], 0.2), BU, true, 512, 0.4);
    this.plant('raspberry', 'raspberry_b', P.sprigBush(56, ['raspberry'], 16, [0.7, 1.1], [0.5, 1.2], [0.95, 1, 0.95], 0.4), BU, true, 512, 0.4);
    this.plant('juniper', 'juniper', P.sprigBush(57, ['juniper'], 22, [0.5, 0.85], [0.0, 0.45], [0.92, 1, 1.05], 0.25), BU, true, 512, 0.3);
    {
      const bm = createTreeMaterials('fir', new THREE.Vector4(-2, -1, BU[0], BU[1]));
      for (const [seed, h] of [[44, 2.2], [45, 3.0]] as [number, number][]) {
        const { wood, leaves } = P.alder(seed, h);
        const pm = this.plantMat(BU, true, 0.3);
        this.addProto('alder', 0, BU[1], `alder_${seed}`, [
          { geo: wood.build({ moss: false }), mat: bm.bark, depth: bm.barkDepth },
          { geo: leaves.build({ moss: false }), mat: pm.mat, depth: pm.depth },
        ], true, 256);
      }
    }
    // saplings from the real tree generator (advance regeneration)
    const sap: [SpeciesId, number, number][] = [['spruce', 0.05, 1], ['spruce', 0.09, 2], ['fir', 0.06, 3], ['fir', 0.1, 4], ['pine', 0.07, 5], ['birch', 0.06, 6], ['birch', 0.1, 7], ['cedar', 0.08, 8]];
    for (const [sp, age, seed] of sap) {
      const m = buildTree(sp, 700 + seed, { age });
      const l = m.lod(0);
      const tm = createTreeMaterials(sp, new THREE.Vector4(-2, -1, BU[0], BU[1]));
      const parts: Part[] = [{ geo: l.bark, mat: tm.bark, depth: tm.barkDepth }];
      if (l.foliage) parts.push({ geo: l.foliage, mat: tm.foliage, depth: tm.foliageDepth });
      this.addProto(`sapling_${sp}`, 0, BU[1], `sapling_${sp}_${seed}`, parts, true, 256);
    }
    // ---- the lake shore
    this.plant('cattail', 'cattail_a', P.cattails(61, 26, 5, 0.38), FE, true, 512, 0.4);
    this.plant('cattail', 'cattail_b', P.cattails(62, 16, 3, 0.26), FE, true, 512, 0.4);
    this.plant('reed', 'reed', P.meadow(63, { blades: [['grass_sedge', 2], ['cattail_leaf', 1]], n: 12, h: [0.5, 1.1], spread: 0.3, w: 1.1, heads: { cells: ['reed'], n: 7, h: [1.5, 2.1] } }), FE, true, 512, 0.5);
    {
      const pads = P.flats(64, ['lilypad', 'lilypad', 'lilypad_old'], 9, [0.22, 0.34], 0.9, [0.0, 0.006], 0.02);
      const bloom = P.flats(65, ['lilypad', 'lilypad_old', 'lilypad'], 7, [0.2, 0.32], 0.8, [0.0, 0.006], 0.02);
      bloom.append(P.flats(66, ['water_lily'], 2, [0.12, 0.15], 0.35, [0.03, 0.035], 0.05));
      this.plant('lily', 'lily_a', pads, FE, false, 512, 0.4);
      this.plant('lily', 'lily_b', bloom, FE, false, 512, 0.3);
    }
    // ---- moss
    {
      const mm = this.solidMat('moss', { kind: 'moss', map: loadTex('veg/moss.png', { repeat: true }), fade: FE, vertexColors: true, roughness: 1 });
      for (const [seed, r, h] of [[71, 0.5, 0.16], [72, 0.9, 0.24], [73, 1.4, 0.3]] as [number, number, number][]) {
        this.addProto('mossmound', 0, FE[1], `moss_${seed}`, [{ geo: P.mossMound(seed, r, h).build({ moss: false }), mat: mm.mat, depth: mm.depth }], false, 512);
      }
      for (const [seed, r, h] of [[75, 1.8, 0.1], [76, 2.6, 0.12], [77, 1.3, 0.09]] as [number, number, number][]) {
        this.addProto('mosscarpet', 0, FE[1], `mosscarpet_${seed}`, [{ geo: P.mossMound(seed, r, h).build({ moss: false }), mat: mm.mat, depth: mm.depth }], false, 512);
      }
      this.plant('mosstuft', 'moss_tufts', P.crossed(74, 'moss_tuft', 6, 0.1, 0.3, 0.5, 2, [1, 1, 1], 0), SM, false, 512, 0.5);
    }
    // ---- mushrooms, litter, twigs, cones
    this.plant('agaric', 'agaric', P.mushrooms(81, 'agaric', 3), LITTER, false, 256, 0);
    this.plant('agaric', 'agaric_1', P.mushrooms(82, 'agaric', 1), LITTER, false, 256, 0);
    this.plant('chanterelle', 'chanterelle', P.mushrooms(83, 'chanterelle', 7), LITTER, false, 256, 0);
    this.plant('bolete', 'bolete', P.mushrooms(84, 'bolete', 3), LITTER, false, 256, 0);
    this.plant('honey', 'honey', P.mushrooms(85, 'honey', 13), LITTER, false, 256, 0);
    this.plant('puffball', 'puffball', P.mushrooms(86, 'puffball', 5), LITTER, false, 256, 0);
    this.plant('needles', 'needles', P.flats(87, ['needles'], 3, [0.9, 1.5], 0.4, [0.012, 0.02], 0.04, [1, 1, 1], 2), LITTER, false, 1024, 0.4);
    this.plant('leaves', 'leaves', P.flats(88, ['litter', 'litter_mixed'], 3, [0.8, 1.3], 0.4, [0.012, 0.02], 0.04, [1, 1, 1], 2), LITTER, false, 1024, 0.4);
    this.plant('twigs', 'twigs', P.flats(89, ['twig'], 2, [0.5, 0.9], 0.3, [0.02, 0.04], 0.1, [1, 1, 1], 2), SM, false, 1024, 0.3);
    this.plant('cones', 'cones', P.cones(90, 5, 0.25), LITTER, false, 512, 0);
    // ---- large tier: rocks, logs, driftwood, branches, stumps, fungi
    const BIG: [number, number] = [200, 228];
    const rock = this.solidMat('rock', {
      kind: 'rock', map: loadTex('veg/mossy_rock.png', { repeat: true }), normalMap: loadTex('veg/mossy_rock_n.png', { repeat: true, srgb: false }),
      triplanar: 2.6, moss: 0.42, lichen: 1, fade: BIG, vertexColors: true, roughness: 0.88,
    });
    for (let i = 0; i < 6; i++) {
      const mb = P.boulder(91 + i, 1, [0.55, 0.7, 0.45, 0.8, 0.6, 0.5][i]);
      this.addProto('rock', 1, BIG[1], `boulder_${i}`, [{ geo: mb.build({ moss: false }), mat: rock.mat, depth: rock.depth }], true, 256);
    }
    const logSpecs: P.LogSpec[] = [
      { species: 'cedar', len: 19, r: 0.75, seed: 101, rot: 0, moss: 1.15 },
      { species: 'cedar', len: 13, r: 0.5, seed: 102, rot: 0, moss: 1.0 },
      { species: 'spruce', len: 15, r: 0.3, seed: 103, rot: 0, moss: 0.9 },
      { species: 'spruce', len: 9, r: 0.22, seed: 104, rot: 0, moss: 0.7 },
      { species: 'fir', len: 10, r: 0.24, seed: 105, rot: 0, moss: 0.8 },
      { species: 'pine', len: 14, r: 0.28, seed: 106, rot: 0, moss: 0.45 },
      { species: 'birch', len: 8, r: 0.17, seed: 107, rot: 0, moss: 0.55 },
      { species: 'spruce', len: 6, r: 0.16, seed: 108, rot: 0, moss: 0.6 },
      // driftwood on the beach
      { species: 'cedar', len: 7, r: 0.24, seed: 109, rot: 0, moss: 0, drift: true },
      { species: 'pine', len: 4.5, r: 0.17, seed: 110, rot: 0, moss: 0, drift: true },
    ];
    this.logSpecs = logSpecs;
    logSpecs.forEach((ls, i) => {
      this.logProto[i] = this.protos.length;
      const { wood, tufts } = P.fallenLog(ls);
      const off = new THREE.Matrix4().makeTranslation(-ls.len / 2, 0, 0);
      const tm = createTreeMaterials(ls.species, new THREE.Vector4(-2, -1, BIG[0], BIG[1]));
      const pm = this.plantMat([60, 80], false);
      const g1 = wood.build(); g1.applyMatrix4(off);
      const parts: Part[] = [{ geo: g1, mat: tm.bark, depth: tm.barkDepth }];
      if (tufts.count) { const g2 = tufts.build({ moss: false }); g2.applyMatrix4(off); parts.push({ geo: g2, mat: pm.mat, depth: pm.depth }); }
      this.addProto(ls.drift ? 'driftwood' : i < 2 ? 'log_big' : 'log', 1, BIG[1], `log_${ls.species}_${i}`, parts, true, 128);
    });
    // fallen branches (bark of the species they fell from)
    for (const [sp, seed, len, r] of [['spruce', 111, 2.6, 0.05], ['birch', 112, 2.2, 0.045], ['pine', 113, 3.2, 0.06], ['fir', 114, 1.8, 0.04]] as [SpeciesId, number, number, number][]) {
      const tm = createTreeMaterials(sp, new THREE.Vector4(-2, -1, 70, 90));
      this.addProto('branches', 1, 90, `branches_${sp}`, [{ geo: P.branches(seed, len, r).build(), mat: tm.bark, depth: tm.barkDepth }], true, 256);
    }
    const stumps: [SpeciesId, number, number, number, boolean, number][] = [
      ['spruce', 121, 0.24, 0.45, true, 0.5], ['pine', 122, 0.3, 0.55, true, 0.3], ['cedar', 123, 0.75, 0.9, true, 0.8],
      ['spruce', 124, 0.2, 0.6, false, 0.8], ['cedar', 125, 0.55, 1.3, false, 1.0], ['birch', 126, 0.16, 0.7, false, 0.6],
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
    this.addProto('bracket', 1, 40, 'bracket', [{ geo: P.bracket(131, 3).build({ moss: false }), mat: fung.mat, depth: fung.depth }], false, 512);
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
        const t = tex as THREE.Texture | null;
        if (t) { applyPixelTex(t, {}); }
        const o: VegMatOpts = kind === 'rock'
          ? { kind: 'rock', map: loadTex('veg/mossy_rock.png', { repeat: true }), normalMap: loadTex('veg/mossy_rock_n.png', { repeat: true, srgb: false }), triplanar: 2.6, moss: 0.6, lichen: 1, fade: BIG, vertexColors: false }
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
      _tq.setFromUnitVectors(UP, tilt);
      _q.premultiply(_tq);
    }
    _s.set(scale * sx, scale, scale * sz);
    _m.compose(_p, _q, _s);
    let arr = c.items.get(gi);
    if (!arr) c.items.set(gi, (arr = []));
    arr.push(rand, ..._m.elements);
    c.minY = Math.min(c.minY, y - 1);
    c.maxY = Math.max(c.maxY, y + 4 * scale);
  }

  /** canopy cover / conifer / birch share on a 2 m grid over the chunk (bilinear) */
  private canopyGrid(stands: Stand[], x0: number, z0: number, S: number): (x: number, z: number) => Canopy {
    const step = 2, n = Math.round(S / step) + 1;
    const cov = new Float32Array(n * n), con = new Float32Array(n * n), bir = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      let open = 1, cw = 0, bw = 0, ws = 0;
      for (const s of stands) {
        const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
        const cr = Math.max(0.8, s.crown);
        if (d2 > 9 * cr * cr) continue;
        const w = Math.exp(-d2 / (2 * cr * cr * 0.6));
        if (!s.dead) open *= 1 - 0.7 * w * Math.min(1, s.h / 8);
        if (s.conifer) cw += w; else bw += w;
        ws += w;
      }
      const k = j * n + i;
      cov[k] = 1 - open; con[k] = ws > 0 ? cw / ws : 0.5; bir[k] = ws > 0 ? bw / ws : 0;
    }
    const out: Canopy = { cover: 0, conifer: 0, birch: 0 };
    return (x: number, z: number) => {
      const fx = clamp((x - x0) / step, 0, n - 1.001), fz = clamp((z - z0) / step, 0, n - 1.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j;
      const k = j * n + i;
      const bl = (a: Float32Array) => (a[k] * (1 - u) + a[k + 1] * u) * (1 - w) + (a[k + n] * (1 - u) + a[k + n + 1] * u) * w;
      out.cover = bl(cov); out.conifer = bl(con); out.birch = bl(bir);
      return out;
    };
  }

  private fillSmall(c: GChunk): void {
    const S = TIER_SIZE[0];
    const x0 = c.cx * S, z0 = c.cz * S;
    const rng = new Rng((hash2(c.cx, c.cz, WORLD.seed + 11) * 4294967296) >>> 0);
    const hAt = this.heightGrid(x0, z0, S, 2);
    const bAt = this.biomeGrid(x0, z0, S);
    const stands = this.forest ? this.forest.stands(x0 + S / 2, z0 + S / 2, S * 0.75 + 8) : [];
    const can = this.canopyGrid(stands, x0, z0, S);
    const lim = WORLD.half - 4;
    const D = this.density;
    const W = WORLD.waterY;
    const nearTrunk = (x: number, z: number) => {
      let near = 99;
      for (const s of stands) near = Math.min(near, Math.hypot(s.x - x, s.z - z) - s.r);
      return near;
    };
    const tryN = (n: number, fn: (x: number, z: number, r: number) => void) => {
      for (let i = 0; i < Math.round(n * D); i++) {
        const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
        const r = rng.next();
        if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
        fn(x, z, r);
      }
    };
    // clearance, road verge and worn-trail fields on a 1 m grid (bilinear): far cheaper than per candidate
    const GN = S + 1;
    const gCl = new Float32Array(GN * GN), gVe = new Float32Array(GN * GN), gTr = new Float32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = x0 + i, z = z0 + j, k = j * GN + i;
      gCl[k] = clearance(x, z);
      const r = roadInfo(x, z);
      if (r.road >= 0) {
        if (r.id === 'highway' || r.id === 'cabin_road') gVe[k] = smoothstep(r.w + 0.9, r.w + 2.2, r.d) * (1 - smoothstep(r.w + 5, r.w + 9, r.d));
        else gTr[k] = 1 - smoothstep(r.w * 0.6, r.w + 1.6, r.d);
      }
      // the clearing pads (cabin yard, the store lot, the campsite) have grassy fringes too
      const dc = Math.min(Math.hypot(x - SPOTS.cabin.x, z - SPOTS.cabin.z) - 18, Math.hypot(x - SPOTS.store.x, z - SPOTS.store.z) - 32, Math.hypot(x - SPOTS.campsite.x, z - SPOTS.campsite.z) - 10);
      gVe[k] = Math.max(gVe[k], 1 - smoothstep(0, 14, Math.abs(dc + 2)));
    }
    const grid = (a: Float32Array, x: number, z: number) => {
      const fx = clamp(x - x0, 0, S - 0.001), fz = clamp(z - z0, 0, S - 0.001);
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j, k = j * GN + i;
      return (a[k] * (1 - u) + a[k + 1] * u) * (1 - w) + (a[k + GN] * (1 - u) + a[k + GN + 1] * u) * w;
    };
    const clAt = (x: number, z: number) => grid(gCl, x, z);
    const ok = (x: number, z: number, minClear: number, avoid: number) => {
      const cl = clAt(x, z);
      if (cl < minClear) return -1;
      if (avoid > 0 && nearTrunk(x, z) < avoid) return -1;
      return cl;
    };
    const patch = (x: number, z: number, f: number, o: number) => this.noise.n2(x / f + o, z / f - o);
    const P_ = (g: string, x: number, z: number, s0: number, s1: number, dy = 0) => this.push(c, g, rng.next(), x, hAt(x, z) + dy, z, rng.range(0, 6.28), rng.range(s0, s1));
    // the zone a point is in: verge of a graded road, worn trail, open sky, shore
    interface Zone { cl: number; verge: number; trail: number; open: number; edge: number; cv: Canopy; b: Biome; y: number }
    const Z = {} as Zone;
    const zone = (x: number, z: number): Zone => {
      Z.y = hAt(x, z);
      Z.cl = clAt(x, z);
      Z.verge = grid(gVe, x, z);
      Z.trail = grid(gTr, x, z);
      Z.cv = can(x, z);
      Z.b = bAt(x, z);
      Z.open = 1 - Z.cv.cover;
      Z.edge = 4 * Z.cv.cover * (1 - Z.cv.cover);
      return Z;
    };
    // ---- grass: everywhere the sky opens; lush meadow in clearings and verges, dry on the burn and pine ridges,
    // sedge in the wet, thin wisps under the canopy, trail centres worn bare
    tryN(620, (x, z, r) => {
      const zn = zone(x, z);
      if (zn.y < W + 0.12 || zn.cl < 0.1) return;
      const b = zn.b;
      const pn = patch(x, z, 9, 1);
      const shoreBand = 1 - smoothstep(W + 0.6, W + 3.5, zn.y);
      let p = (0.02 + 0.9 * Math.pow(zn.open, 1.7)) * (0.55 + 0.7 * pn) + 1.2 * zn.verge + 0.5 * b.burn + 0.25 * zn.cv.birch + 0.6 * shoreBand;
      p *= 1 - 0.97 * smoothstep(0.45, 0.85, zn.trail);
      if (zn.cl < 0.35 && zn.verge < 0.2) p *= zn.cl / 0.35;
      if (r > p * 0.62) return;
      const lush = zn.verge + zn.open * smoothstep(0.1, 0.6, pn) + shoreBand * 0.5;
      let g = 'grass';
      if (b.wet > 0.7 && rng.chance(0.55) || shoreBand > 0.6 && rng.chance(0.5)) g = 'sedge';
      else if (b.burn > 0.4 || (b.wet < 0.32 && b.pine > 1.2 && rng.chance(0.5))) g = 'grass_dry';
      else if (zn.cv.cover > 0.72 && rng.chance(0.75)) g = 'wisp';
      else if (lush > 0.55 && rng.chance(0.75)) g = 'meadow';
      const sc = g === 'meadow' ? rng.range(0.8, 1.3) * (1 + 0.25 * zn.verge) : rng.range(0.75, 1.25);
      this.push(c, g, rng.next(), x, zn.y, z, rng.range(0, 6.28), sc * (zn.trail > 0.3 ? 0.7 : 1));
    });
    // ---- wildflowers: roadside mix on the verges, goldenrod / asters / everlasting / fireweed in clearings,
    // gaps, edges and the burn (patchy: flowers come in drifts)
    tryN(90, (x, z, r) => {
      const zn = zone(x, z);
      if (zn.y < W + 0.3 || zn.cl < 0.2) return;
      const b = zn.b;
      const drift = smoothstep(0.1, 0.55, patch(x, z, 11, 21));
      const p = (1.3 * zn.verge + 0.7 * Math.pow(zn.open, 2) + 0.35 * zn.edge + 0.8 * b.burn) * drift * (1 - zn.trail);
      if (r > p) return;
      const u = rng.next();
      let g: string;
      if (zn.verge > 0.4 && u < 0.55) g = 'roadside';
      else if (b.burn > 0.35 && u < 0.5) g = u < 0.3 ? 'fireweed' : 'everlasting';
      else if (b.wet < 0.4 && u < 0.35) g = 'everlasting';
      else if (u < 0.6) g = 'goldenrod';
      else if (u < 0.85) g = 'asters';
      else g = 'fireweed';
      this.push(c, g, rng.next(), x, zn.y, z, rng.range(0, 6.28), rng.range(0.8, 1.25));
    });
    // ---- fireweed stands on the burn
    tryN(14, (x, z, r) => {
      const b = bAt(x, z);
      if (r > 1.3 * b.burn * smoothstep(-0.2, 0.4, patch(x, z, 15, 11)) || clAt(x, z) < 0.3) return;
      P_('fireweed', x, z, 0.8, 1.2);
    });
    // ---- ferns: shade and moisture, in patches; ostrich ferns in the wettest ground and by the shore
    tryN(150, (x, z, r) => {
      const zn = zone(x, z);
      const b = zn.b;
      const p = (0.15 + 0.85 * zn.cv.cover + 0.4 * zn.edge) * (0.2 + 1.0 * b.wet + 0.4 * b.old) * (1 - b.burn) * smoothstep(-0.45, 0.25, patch(x, z, 14, 3)) * (1 - zn.verge * 0.7);
      if (r > p) return;
      if (ok(x, z, 0.6, 0.35) < 0) return;
      const g = b.wet > 0.62 && rng.chance(0.3 + 0.4 * (b.wet - 0.62) / 0.38) ? 'ostrich' : 'fern';
      this.push(c, g, rng.next(), x, zn.y, z, rng.range(0, 6.28), rng.range(0.75, 1.3));
    });
    // ---- bracken: drier, half-open ground, big patches; edges and the burn
    tryN(46, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const p = (0.25 + 0.6 * (1 - cv.cover)) * (1 - 0.6 * b.wet) * smoothstep(0.05, 0.5, patch(x, z, 22, 7)) + 0.3 * b.burn;
      if (r > p) return;
      if (ok(x, z, 0.5, 0.3) < 0) return;
      P_('bracken', x, z, 0.8, 1.25);
    });
    // ---- raspberry canes: the scrubby fringe of stand edges, verges and the burn, in thickets
    tryN(30, (x, z, r) => {
      const zn = zone(x, z);
      if (zn.cl < 0.45 || zn.y < W + 0.5) return;
      const p = (0.8 * zn.edge + 0.6 * zn.verge * zn.open + 0.9 * zn.b.burn) * smoothstep(0.15, 0.55, patch(x, z, 13, 31)) * (1 - zn.b.wet * 0.5);
      if (r > p || nearTrunk(x, z) < 0.4) return;
      this.push(c, 'raspberry', rng.next(), x, zn.y, z, rng.range(0, 6.28), rng.range(0.8, 1.2));
    });
    // ---- forest-floor herbs under the canopy: bunchberry, woodland asters, clubmoss, wild sarsaparilla
    tryN(80, (x, z, r) => {
      const cv = can(x, z);
      const b = bAt(x, z);
      const p = 0.12 + 0.6 * cv.cover * smoothstep(-0.2, 0.4, patch(x, z, 8, 5));
      if (r > p || ok(x, z, 0.6, 0.15) < 0) return;
      const sars = (0.3 + 0.5 * cv.birch) * (1 - cv.conifer * 0.5) * (1 - b.burn);
      this.push(c, rng.chance(sars) ? 'sarsaparilla' : 'herb', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.3));
    });
    // ---- reindeer lichen and blueberry: dry pine ground and rock outcrops; Labrador tea: wet conifer ground
    tryN(46, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const pineF = b.pine / (b.spruce + b.fir + b.pine + b.birch + b.cedar);
      const dry = 1 - b.wet;
      const pd = (0.1 + 0.9 * pineF) * dry * smoothstep(-0.1, 0.5, patch(x, z, 10, 13));
      const pw = smoothstep(0.55, 0.85, b.wet) * (0.3 + 0.7 * cv.conifer) * smoothstep(-0.1, 0.45, patch(x, z, 12, 41)) * 0.9;
      if (ok(x, z, 0.6, 0.2) < 0) return;
      if (r < pd) this.push(c, rng.chance(0.45) ? 'lichen' : 'blueberry', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.3));
      else if (r < pd + pw) this.push(c, 'labrador', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.25));
    });
    // ---- juniper (dry, rocky) and alder (wet, verges, the shore)
    tryN(4, (x, z, r) => {
      const b = bAt(x, z);
      const y = hAt(x, z);
      const cl = ok(x, z, 0.55, 0.6);
      if (cl < 0 || y < W + 0.4) return;
      const shore = 1 - smoothstep(W + 1, W + 5, y);
      if (b.wet < 0.4 && r < 0.25 + 0.4 * b.pine / 2) this.push(c, 'juniper', rng.next(), x, y, z, rng.range(0, 6.28), rng.range(0.8, 1.3));
      else if ((b.wet > 0.55 || shore > 0.3) && r < 0.5 * b.wet + 0.5 * shore) this.push(c, 'alder', rng.next(), x, y - 0.05, z, rng.range(0, 6.28), rng.range(0.8, 1.2));
    });
    // ---- saplings and seedlings: advance regeneration, thick in gaps and at edges, a few under the canopy
    tryN(16, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const p = 0.14 + 0.5 * (1 - cv.cover) + 0.3 * 4 * cv.cover * (1 - cv.cover);
      if (r > p || ok(x, z, 0.6, 0.6) < 0) return;
      const w = { spruce: b.spruce, fir: b.fir * 1.6, pine: b.pine * 0.5, birch: b.birch * (1 + b.burn * 2), cedar: b.cedar };
      const tot = w.spruce + w.fir + w.pine + w.birch + w.cedar;
      let s = rng.next() * tot;
      let sp: SpeciesId = 'fir';
      for (const k of ['spruce', 'fir', 'pine', 'birch', 'cedar'] as SpeciesId[]) { s -= w[k]; if (s <= 0) { sp = k; break; } }
      this.push(c, `sapling_${sp}`, rng.next(), x, hAt(x, z) - 0.02, z, rng.range(0, 6.28), rng.range(0.7, 1.35));
    });
    tryN(22, (x, z, r) => {
      const cv = can(x, z);
      if (r > 0.25 + 0.5 * (1 - cv.cover) || ok(x, z, 0.5, 0.25) < 0) return;
      P_('seedling', x, z, 0.7, 1.3);
    });
    // ---- moss mounds and cushions: wet shade, old growth
    tryN(60, (x, z, r) => {
      const b = bAt(x, z), cv = can(x, z);
      const p = (0.1 + 0.8 * b.wet * cv.cover + 0.7 * b.old) * smoothstep(-0.3, 0.3, patch(x, z, 12, 17));
      if (r > p || ok(x, z, 0.6, 0.2) < 0) return;
      const u = rng.next();
      if (u < 0.45) {
        const e = 0.8;
        const nx = hAt(x - e, z) - hAt(x + e, z), nz = hAt(x, z - e) - hAt(x, z + e);
        this.push(c, 'mosscarpet', rng.next(), x, hAt(x, z) - 0.05, z, rng.range(0, 6.28), rng.range(0.7, 1.5), _v.set(nx, 2 * e, nz).normalize());
      } else this.push(c, u < 0.8 ? 'mossmound' : 'mosstuft', rng.next(), x, hAt(x, z) - 0.03, z, rng.range(0, 6.28), rng.range(0.7, 1.4));
    });
    // ---- litter dropped by the trees that stand here: needles and cones under conifers, leaves under birch,
    // a moss collar at wet trunk bases, the odd mushroom
    for (const s of stands) {
      if (s.x < x0 || s.x >= x0 + S || s.z < z0 || s.z >= z0 + S || s.dead) continue;
      const cr = Math.max(1, s.crown);
      const nL = Math.round((1 + Math.min(3, s.h / 8)) * D);
      for (let k = 0; k < nL; k++) {
        const a = rng.range(0, 6.28), d = s.r + rng.range(0.3, cr * 0.9);
        const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
        if (clAt(x, z) < 0.4) continue;
        this.push(c, s.conifer ? 'needles' : 'leaves', rng.next(), x, hAt(x, z), z, rng.range(0, 6.28), rng.range(0.8, 1.4));
        if (s.conifer && rng.chance(0.55)) P_('cones', x + rng.range(-0.6, 0.6), z + rng.range(-0.6, 0.6), 0.8, 1.2);
      }
      const b = bAt(s.x, s.z);
      if (b.wet > 0.5 && rng.chance(0.5)) P_('mosstuft', s.x + s.r + 0.1, s.z, 0.8, 1.2);
      if (rng.chance(0.07 * D)) {
        const a = rng.range(0, 6.28), d = s.r + rng.range(0.4, 2);
        const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
        const kind = s.conifer ? (b.wet > 0.55 ? 'chanterelle' : rng.chance(0.5) ? 'bolete' : 'agaric') : rng.chance(0.6) ? 'agaric' : 'bolete';
        if (clAt(x, z) > 0.5) {
          P_(kind, x, z, 0.8, 1.3);
          if (rng.chance(0.5)) P_(kind, x + rng.range(-0.8, 0.8), z + rng.range(-0.8, 0.8), 0.7, 1.1);
        }
      }
    }
    // ---- litter and twigs between the trees; autumn leaves where birch and aspen grow
    tryN(30, (x, z, r) => {
      const cv = can(x, z);
      if (r > 0.15 + 0.7 * cv.cover || ok(x, z, 0.4, 0.1) < 0) return;
      P_(cv.birch > 0.45 ? 'leaves' : 'needles', x, z, 0.8, 1.4);
    });
    tryN(20, (x, z) => {
      if (ok(x, z, 0.4, 0.1) < 0) return;
      P_('twigs', x, z, 0.8, 1.3);
    });
    // ---- puffballs in grassy openings
    tryN(3, (x, z, r) => {
      const cv = can(x, z);
      if (r > 0.4 * (1 - cv.cover) || ok(x, z, 0.5, 0.2) < 0) return;
      P_('puffball', x, z, 0.8, 1.2);
    });
    // ---- the lake shore: lily pads on still shallow water, cattails and reeds in the shallows, sedge on the margin
    if (Math.hypot(x0 + S / 2 - SPOTS.lake.x, z0 + S / 2 - SPOTS.lake.z) < SPOTS.lake.r * 1.7) {
      tryN(90, (x, z, r) => {
        const y = hAt(x, z);
        if (y > W + 1.2 || y < W - 2.4) return;
        if (Math.hypot(x - SPOTS.campsite.x, z - SPOTS.campsite.z) < 14) return;
        const rd = roadInfo(x, z);
        if (rd.road >= 0 && rd.d < rd.w + 1.5) return;
        const pn = patch(x, z, 7, 51);
        if (y < W - 0.5) {
          // lily pads: patchy colonies over 0.5 - 2.4 m of water
          if (r < 0.75 * smoothstep(0.05, 0.45, pn)) this.push(c, 'lily', rng.next(), x, W + 0.012, z, rng.range(0, 6.28), rng.range(0.8, 1.3));
        } else if (y < W + 0.18) {
          // emergent: cattail stands and reeds, rooted on the bottom
          const u = rng.next();
          if (r < 0.9 * smoothstep(-0.25, 0.25, pn)) this.push(c, u < 0.6 ? 'cattail' : 'reed', rng.next(), x, y, z, rng.range(0, 6.28), rng.range(0.85, 1.2));
          else if (r < 0.95) this.push(c, 'sedge', rng.next(), x, Math.max(y, W - 0.15), z, rng.range(0, 6.28), rng.range(0.9, 1.3));
        } else if (r < 0.7) {
          const u = rng.next();
          const g = u < 0.55 ? 'sedge' : u < 0.7 ? 'meadow' : u < 0.8 ? 'reed' : u < 0.9 ? 'labrador' : 'asters';
          this.push(c, g, rng.next(), x, y, z, rng.range(0, 6.28), rng.range(0.85, 1.25));
        }
      });
    }
  }

  private fillLarge(c: GChunk): void {
    const S = TIER_SIZE[1];
    const x0 = c.cx * S, z0 = c.cz * S;
    const rng = new Rng((hash2(c.cx, c.cz, WORLD.seed + 29) * 4294967296) >>> 0);
    const hAt = this.heightGrid(x0, z0, S, 4);
    const bAt = this.biomeGrid(x0, z0, S);
    const stands = this.forest ? this.forest.stands(x0 + S / 2, z0 + S / 2, S * 0.75 + 20) : [];
    const lim = WORLD.half - 10;
    const W = WORLD.waterY;
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
    // boulders: Canadian Shield erratics, more on ridges and slopes, in little clusters; moss carpets and ferns
    // gather at their feet
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
      if (size > 0.6 && rng.chance(0.4 + 0.5 * b.wet)) {
        const nm = rng.int(1, 3);
        for (let k = 0; k < nm; k++) {
          const a = rng.range(0, 6.28), d = size * rng.range(0.7, 1.1);
          const mx = x + Math.cos(a) * d, mz = z + Math.sin(a) * d;
          this.push(c, b.wet > 0.5 && rng.chance(0.4) ? 'fern' : 'mosscarpet', rng.next(), mx, hAt(mx, mz) - 0.04, mz, rng.range(0, 6.28), rng.range(0.6, 1.0));
        }
      }
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
      const pool = this.logSpecs.map((l, k) => k).filter((k) => !this.logSpecs[k].drift && (giant ? k < 2 : k >= 2));
      const k = rng.pick(pool);
      this.placeLog(c, rng, k, x, z, hAt, clearOf, true);
    }
    // driftwood: bleached trunks thrown up on the beach
    if (Math.hypot(x0 + S / 2 - SPOTS.lake.x, z0 + S / 2 - SPOTS.lake.z) < SPOTS.lake.r * 1.8) {
      const drift = this.logSpecs.map((l, k) => k).filter((k) => this.logSpecs[k].drift);
      for (let i = 0; i < Math.round(26 * D); i++) {
        const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
        const y = hAt(x, z);
        if (y < W - 0.25 || y > W + 0.9) continue;
        if (Math.hypot(x - SPOTS.campsite.x, z - SPOTS.campsite.z) < 14) continue;
        const rd = roadInfo(x, z);
        if (rd.road >= 0 && rd.d < rd.w + 2) continue;
        if (rng.next() > 0.45) continue;
        this.placeLog(c, rng, rng.pick(drift), x, z, hAt, clearOf, false);
      }
    }
    // stumps: old logging near roads / the cabin (saw-cut), rotten ones in the bush; honey mushrooms at the foot
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
      if (!clearOf(x, z, 1.4)) continue;
      const cut = rng.chance(0.3 + logged * 0.5);
      const y = hAt(x, z) - 0.05;
      this.push(c, cut ? 'stump_cut' : 'stump', rng.next(), x, y, z, rng.range(0, 6.28), rng.range(0.85, 1.2));
      c.solids.push({ id: this.solidId++, kind: 'stump', shape: 'cylinder', x, y, z, r: cut ? 0.4 : 0.5, h: cut ? 0.6 : 0.9 });
      if (!cut && rng.chance(0.5)) this.push(c, 'bracket', rng.next(), x + 0.3, y + 0.35, z, 0, 0.8);
      if (rng.chance(0.35 + 0.3 * b.wet)) {
        const a = rng.range(0, 6.28);
        this.push(c, 'honey', rng.next(), x + Math.cos(a) * 0.55, y + 0.03, z + Math.sin(a) * 0.55, rng.range(0, 6.28), rng.range(0.9, 1.3));
      }
      if (rng.chance(0.5)) {
        const a = rng.range(0, 6.28);
        this.push(c, b.wet > 0.5 ? 'mosscarpet' : 'raspberry', rng.next(), x + Math.cos(a) * 0.9, y, z + Math.sin(a) * 0.9, rng.range(0, 6.28), rng.range(0.5, 0.9));
      }
    }
    // deadfall: broken branches (procedural and Poly Haven), bark debris, the bleached Poly Haven trunks
    for (let i = 0; i < Math.round(10 * D); i++) {
      const x = x0 + rng.next() * S, z = z0 + rng.next() * S;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (clearance(x, z) < 0.7 || !clearOf(x, z, 0.8)) continue;
      const y = hAt(x, z);
      if (y < W + 0.2) continue;
      const yaw = rng.range(0, 6.28);
      const u = rng.next();
      if (u < 0.18) {
        // a weathered dead trunk (Poly Haven), long axis = local X
        this.push(c, 'deadlog', rng.next(), x, y - 0.06, z, yaw, rng.range(0.9, 1.15), normal(x, z));
        const dx = Math.cos(yaw) * 1.8, dz = -Math.sin(yaw) * 1.8;
        c.solids.push({ id: this.solidId++, kind: 'log', shape: 'capsule', x: x - dx, y: y + 0.2, z: z - dz, x2: x + dx, y2: y + 0.2, z2: z + dz, r: 0.3, h: 0 });
      } else if (u < 0.55) {
        this.push(c, 'deadfall', rng.next(), x, y - 0.03, z, yaw, rng.range(0.85, 1.4), normal(x, z));
      } else {
        // fallen branches lie near the trees they dropped from
        let gx = x, gz = z;
        if (stands.length) {
          const s = stands[rng.int(0, stands.length - 1)];
          const a = rng.range(0, 6.28), d = s.r + rng.range(0.8, Math.max(1.5, s.crown * 1.4));
          gx = s.x + Math.cos(a) * d; gz = s.z + Math.sin(a) * d;
          if (clearance(gx, gz) < 0.7 || !clearOf(gx, gz, 0.3) || hAt(gx, gz) < W + 0.2) { gx = x; gz = z; }
        }
        this.push(c, 'branches', rng.next(), gx, hAt(gx, gz) - 0.02, gz, yaw, rng.range(0.8, 1.3), normal(gx, gz));
      }
    }
  }

  /** a log along a random clear heading through (x, z): instance + capsule collider (+ bracket fungi) */
  private placeLog(c: GChunk, rng: Rng, k: number, x: number, z: number, hAt: (x: number, z: number) => number, clearOf: (x: number, z: number, r: number) => boolean, fungi: boolean): void {
    const ls = this.logSpecs[k];
    const sc = rng.range(0.85, 1.15);
    for (let tries = 0; tries < 4; tries++) {
      const yaw = rng.range(0, Math.PI * 2);
      const dx = Math.cos(yaw), dz = -Math.sin(yaw);
      const L = ls.len * sc;
      const ax = x - dx * L / 2, az = z - dz * L / 2, bx = x + dx * L / 2, bz = z + dz * L / 2;
      let clear = true;
      for (let s = 0; s <= 6 && clear; s++) {
        const t = s / 6;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        if (!clearOf(px, pz, ls.r * sc)) clear = false;
        else if (!ls.drift && clearance(px, pz) < 0.6) clear = false;
        else if (ls.drift) { const rd = roadInfo(px, pz); if (rd.road >= 0 && rd.d < rd.w + 1) clear = false; }
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
      const gi = this.gIndex.get(ls.drift ? 'driftwood' : k < 2 ? 'log_big' : 'log')!;
      // explicit prototype (rand >= 10): the collider must match this exact log
      const rand = 10 + this.logProto[k];
      let arr = c.items.get(gi);
      if (!arr) c.items.set(gi, (arr = []));
      arr.push(rand, ..._m.elements);
      c.minY = Math.min(c.minY, y - 2);
      c.maxY = Math.max(c.maxY, y + ls.r * 2 * sc + 1);
      const r = ls.r * sc;
      c.solids.push({ id: this.solidId++, kind: 'log', shape: 'capsule', x: ax, y: ha + r * 0.7, z: az, x2: bx, y2: hb + r * 0.55, z2: bz, r, h: 0 });
      if (fungi && rng.chance(0.6)) {
        // bracket fungi along the shaded side
        const nf = rng.int(1, 3);
        for (let f = 0; f < nf; f++) {
          const t = rng.range(0.2, 0.8);
          const side = rng.chance(0.5) ? 1 : -1;
          const lp = _v.set((t - 0.5) * ls.len, ls.r * 0.75, side * ls.r * 0.98).applyMatrix4(_m);
          const ry = yaw + (side > 0 ? 0 : Math.PI);
          this.push(c, 'bracket', rng.next(), lp.x, lp.y, lp.z, ry, rng.range(0.7, 1.2) * Math.min(1.6, 0.6 + ls.r));
        }
        _m.compose(_p, _q, _s);
      }
      if (fungi && rng.chance(0.3)) {
        // honey mushrooms or a moss carpet tucked against the log
        const t = rng.range(0.2, 0.8), side = rng.chance(0.5) ? 1 : -1;
        const lp = _v.set((t - 0.5) * ls.len, 0, side * ls.r * 1.25).applyMatrix4(_m);
        this.push(c, rng.chance(0.5) ? 'honey' : 'mosscarpet', rng.next(), lp.x, hAt(lp.x, lp.z) + 0.01, lp.z, rng.range(0, 6.28), rng.range(0.6, 1.0));
      }
      return;
    }
  }

  // --------------------------------------------------------------------------------------------- update
  private findVehicles(): void {
    const g = (globalThis as unknown as { __game?: { jeep?: { root?: THREE.Object3D } | null; trailer?: { root?: THREE.Object3D } | null } }).__game;
    if (!g) return;
    if (g.jeep?.root && !this.tracked.some((t) => t.obj === g.jeep!.root)) this.tracked.push({ obj: g.jeep.root, kind: 'vehicle' });
    if (g.trailer?.root && !this.tracked.some((t) => t.obj === g.trailer!.root)) this.tracked.push({ obj: g.trailer.root, kind: 'trailer' });
  }

  private updateVehicles(): void {
    if (this.autoTrack && this.frame % 60 === 1 && this.tracked.length < 2) this.findVehicles();
    let slot = 5;
    for (const t of this.tracked) {
      const o = t.obj;
      if (!o.parent || !o.visible) continue;
      const p = o.position;
      if (t.kind === 'vehicle' && slot <= 6) {
        // front and rear axle circles (the model faces +Z)
        _dir.set(0, 0, 1).applyQuaternion(o.quaternion);
        _dir.y = 0;
        if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
        _dir.normalize();
        G.uPushers.value[slot++].set(p.x + _dir.x * 1.1, p.y, p.z + _dir.z * 1.1, 1.15);
        G.uPushers.value[slot++].set(p.x - _dir.x * 1.1, p.y, p.z - _dir.z * 1.1, 1.15);
      } else if (t.kind === 'trailer' && slot <= 7) {
        G.uPushers.value[slot++].set(p.x, p.y, p.z, 0.95);
      }
    }
    for (; slot < 8; slot++) if (G.uPushers.value[slot].w > 0 && slot >= 5) G.uPushers.value[slot].w = 0;
  }

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
    // vehicles push plants aside; everything that pushes also flattens (the trample map)
    this.updateVehicles();
    trample.update(dt, p.x, p.z);
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
    _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (this.dirty || p.distanceTo(this.lastCam) > 1.5 || _dir.dot(this.lastDir) < 0.995 || this.frame % 60 === 0) {
      this.dirty = false;
      this.lastCam.copy(p);
      this.lastDir.copy(_dir);
      this.rebuild();
    }
  }

  private rebuild(): void {
    const cam = this.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pm);
    const px = cam.position.x, pz = cam.position.z;
    const L2 = this.lodDist * this.lodDist;
    for (const pr of this.protos) pr.count = 0;
    let n = 0;
    for (const c of this.chunks.values()) {
      if (!c.items.size) continue;
      const S = TIER_SIZE[c.tier];
      const x0 = c.cx * S, z0 = c.cz * S;
      const dx = Math.max(x0 - px, 0, px - (x0 + S)), dz = Math.max(z0 - pz, 0, pz - (z0 + S));
      const dc = Math.hypot(dx, dz);
      const pad = (c.tier === 1 ? 12 : 2) + dc * 0.1;
      _box.min.set(x0 - pad, c.minY, z0 - pad);
      _box.max.set(x0 + S + pad, c.maxY, z0 + S + pad);
      if (!_frustum.intersectsBox(_box)) continue;
      for (const [gi, arr] of c.items) {
        const g = this.groups[gi];
        if (!g.protos.length || dc > g.radius) continue;
        const R2 = g.radius * g.radius;
        for (let i = 0; i < arr.length; i += REC) {
          const ex = arr[i + 13] - px, ez = arr[i + 15] - pz;
          const d2 = ex * ex + ez * ez;
          if (d2 > R2) continue;
          let pi = arr[i] >= 10 ? arr[i] - 10 : g.protos[Math.min(g.protos.length - 1, Math.floor(arr[i] * g.protos.length))];
          if (d2 > L2 && this.protos[pi].lod >= 0) pi = this.protos[pi].lod;
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

  /** debug: one plain mesh of every prototype in a grid (lineup pages) */
  showcase(origin: THREE.Vector3, spacing = 4, cols = 10): THREE.Group {
    const g = new THREE.Group();
    this.protos.forEach((pr, i) => {
      const o = new THREE.Group();
      for (const pt of pr.parts) {
        const m = new THREE.Mesh(pt.geo, pt.mat);
        m.castShadow = true;
        m.receiveShadow = true;
        if (pt.depth) m.customDepthMaterial = pt.depth;
        o.add(m);
      }
      o.position.set(origin.x + (i % cols) * spacing, origin.y, origin.z + Math.floor(i / cols) * spacing);
      if (pr.name.startsWith('boulder') || pr.name.startsWith('glb_rock') || pr.name.startsWith('glb_boulder') || pr.name.startsWith('glb_stone')) o.scale.setScalar(1.2);
      o.name = pr.name;
      g.add(o);
    });
    return g;
  }

  /** prototype names (debug) */
  protoNames(): string[] { return this.protos.map((p) => p.name); }
}
