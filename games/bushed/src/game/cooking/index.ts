// The camp kitchen: zoom-in cooking at the cabin's barrel stove. Interacting with the stove top steps the player
// up to it: the camera eases down to the cooking plate, and the cursor and the player's own hands do the work.
// Five framings, scrolled by pushing the cursor to the screen edge:
//   larder  <-  pantry table  <-  stove  ->  prep counter         (and down from the stove: the stove door)
// What you own is set out: staples (flour, sugar, oats, rice, macaroni, peas, tins, tea, coffee, syrup) on the
// larder shelves, fresh food (eggs, milk, meat, onions, potatoes, carrots, garlic, cheese, berries) on the pantry
// table with the mixing bowl, the measuring cup and spoon and the water pail; oil, butter, salt and pepper on the
// spice shelf over the counter, Ray's lard pail on the counter with the cutting board, the knife and the turner.
//
//   * prep: unwrap things on the board; peel an onion (drag across it), halve it, slice it, turn it (RMB) and
//     cross-cut it: the pieces are real geometry and as big as you cut them. Cube potatoes, slice carrots into
//     coins, mince a clove of garlic by rocking the knife over it. Drag sideways to scrape the pieces up with the
//     knife's spine, carry them on the blade and drop them in a pan. Slice bacon, cut trout steaks, cut meat into
//     strips (chop a strip again for cubes), cube cheddar.
//   * the bowl: measure flour and sugar a quarter cup at a time and baking powder by the teaspoon, crack eggs into
//     it, pour milk, drop pats of butter or lard, stir (drag circles) and it comes together as dough or batter
//     depending on the proportions. Tip it onto the board (knead dough, press pastry flat), into the skillet
//     (flapjacks, one round per pour) or the pot (dumplings, pouding batter).
//   * fat: uncap the oil and pour (hold it there): it lands where you pour and spreads, shimmers as it gets hot,
//     smokes past its smoke point, splatters, and past ~290 C catches fire: clap a lid on it. Butter melts, foams
//     and browns. Food in hot fat sizzles hard and crisps; food in cold fat soaks it up and comes out greasy.
//   * the pot: water from the pail (the dipper), tins, bouillon, dry goods; bubbles by heat (a shiver, a simmer,
//     a rolling boil); lids; it boils down without one; stir it or it catches. Taste it (RMB) with the spoon.
//   * season with the salt shaker and the pepper mill (shake them over the food: each shake is a pinch).
//   * flip things in the skillet (flick up), stir piles of diced things, drag the vessels around the plate (the
//     front over the firebox is hottest) and onto the serving plate on the counter. LMB eats it, RMB packs it.
//   * the stove door (cursor to the bottom edge): open it, spin the draft, kindling, light a cold stove.
//   * the recipe box on the counter: 16 camp recipe cards (more unlock on the story's 'recipe' event). Pin one and
//     its steps tick off as you do them; a small copy rides in the corner of the view. Every plate is graded
//     (rough / decent / good / perfect) against the card and gives a buff for a few game hours; anything else
//     sensibly combined is still food (a freestyle dish named after what's in it).
// S or Escape steps back; the stove keeps cooking whatever is left on it.
import * as THREE from 'three';
import type { Game } from '../game';
import { ITEMS } from '../items';
import { audio, type Voice } from '../../audio/audio';
import { puffs } from '../../gfx/particles';
import { G } from '../../gfx/globals';
import { hud } from '../../ui/hud';
import { registerInteractable, findInteractable } from '../interact';
import { Mesher, Rand, Cols } from '../../places/kit';
import { buildProduct } from '../../places/products';
import { loadProp } from '../../places/props';
import { fitTool } from '../../player/arms';
import { Station, Bits, clearInteractables, proxy } from './station';
import { StationHands, GRIP } from './hands';
import { foodMat, slab, blob, loinGeo, troutGeo, doughGeo, eggWhiteGeo, yolkGeo, eggShellGeo, eggShellMat, liquidMat, discGeo, sausageGeo, flapjackGeo, dumplingGeo, pastryGeo, type FoodMat, type LiquidMat } from './food';
import {
  PLATE, COUNTER, PANTRY, LARDER, SHELF, buildPlate, buildSkillet, buildPot, buildCoffeePot, buildKnife, buildTurner, buildLard, buildMixSack, buildMeatPack,
  buildCounter, buildPantry, buildRack, buildLarder, buildSpiceShelf, buildLid, buildMixBowl, buildMeasureCup, buildMeasureSpoon, buildSaltShaker, buildPepperMill,
  buildButterDish, buildPail,
} from './cookware';
import { registerCookItems, meatIds, meatKey, RECIPES, RECIPE_BY_ID, STORY_CARDS, resolveRecipe, judge, matchRecipe, GRADE_NAME, GRADE_STARS, GRADE_MULT, DISH_LINES, type FoodKind, type Dish, type Log, type Verdict, type Grade, type Recipe } from './recipes';
import { ING, TABLE_ORDER, LARDER_ORDER, KEY_NAME, type IngDef } from './ingredients';
import { Produce, Pile, PRODUCE, bitsOf, crumbleBits, produceMat, type ProduceDef } from './produce';
import { Fat } from './fat';
import { Bowl } from './bowl';
import { Buffs } from './buffs';
import { CardMesh, buildRecipeBox, type CardState } from './cards';

export { registerCookItems } from './recipes';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _q1 = new THREE.Quaternion();

// ---------------------------------------------------------------------------------------------- food pieces
type Where = 'board' | 'skillet' | 'pot' | 'plate' | 'rack' | 'hand' | 'gone';

const FOOD_RATE: Record<FoodKind, { rate: number; top: number; wet: number }> = {
  bacon: { rate: 0.045, top: 0.12, wet: 0.6 },
  egg: { rate: 0.05, top: 0.42, wet: 1 },
  trout: { rate: 0.032, top: 0.1, wet: 0.9 },
  dough: { rate: 0.024, top: 0.06, wet: 0.5 },
  meat: { rate: 0.042, top: 0.12, wet: 0.7 },
  shroom: { rate: 0.06, top: 0.3, wet: 0.8 },
  sausage: { rate: 0.028, top: 0.18, wet: 0.5 },
  flapjack: { rate: 0.05, top: 0.1, wet: 0.8 },
  dumpling: { rate: 0.03, top: 0.3, wet: 0.6 },
  pastry: { rate: 0.024, top: 0.06, wet: 0.3 },
};
/** piles of cut pieces: base browning rate and how fast they burn past golden */
const PILE_RATE: Record<string, number> = { onion: 0.034, scallion: 0.045, potato: 0.026, carrot: 0.028, garlic: 0.06, meat: 0.04, beef: 0.045, cheese: 0.03, chanterelle: 0.05 };

class Food {
  readonly obj = new THREE.Group();
  mats: FoodMat[] = [];
  a = 0; b = 0;
  flipped = false;
  where: Where = 'board';
  local = new THREE.Vector2();
  yaw = 0;
  berry = false;
  broken = false;
  smoke = 0;
  flip: { t: number; dur: number; h: number; from: THREE.Vector2; to: THREE.Vector2; ok: boolean } | null = null;
  calls = new Set<string>();
  u0 = 0; u1 = 1;
  knead = 0;
  /** recipe key and units */
  key: string; units = 1;
  seared = false; greasy = 0;
  /** dough: what the bowl made, and how well it will rise */
  dough: 'bannock' | 'pastry' | 'dumpling' = 'bannock'; lift = 1;
  /** raised above the pan floor (a pastry lid over the filling) */
  lift0 = 0;
  constructor(readonly kind: FoodKind, public h: number, public r: number) { this.obj.name = `food_${kind}`; this.key = kind === 'shroom' ? 'chanterelle' : kind; }
  setDone(): void { for (const m of this.mats) { m.userData.uTop.value = this.a; m.userData.uBot.value = this.b; } }
  get down(): number { return this.flipped ? this.a : this.b; }
  get up(): number { return this.flipped ? this.b : this.a; }
  addDown(d: number, up: number): void { if (this.flipped) { this.a += d; this.b += up; } else { this.b += d; this.a += up; } }
  get done(): number { return this.kind === 'egg' ? this.b * 0.7 + this.a * 0.3 : (this.a + this.b) / 2; }
  get worst(): number { return Math.max(this.a, this.b); }
  get least(): number { return this.kind === 'egg' ? Math.min(this.b, this.a + 0.3) : Math.min(this.a, this.b); }
}

function makeFood(kind: FoodKind, o: { thick?: number; seed?: number; u0?: number; u1?: number; berry?: boolean; flat?: number; r?: number } = {}): Food {
  const seed = o.seed ?? Math.random() * 1000;
  let f: Food;
  switch (kind) {
    case 'bacon': {
      const t = o.thick ?? 0.01;
      f = new Food('bacon', t, 0.04);
      const m = foodMat('bacon'); m.userData.uEdgeK.value = 0.5;
      f.mats.push(m);
      f.obj.add(new THREE.Mesh(slab(blob(0.04, 0.034, seed, 18, 0.07), t, { round: Math.min(0.003, t * 0.3) }), m));
      f.units = t / 0.12;
      break;
    }
    case 'meat': {
      const t = o.thick ?? 0.012;
      f = new Food('meat', t, 0.045);
      const m = foodMat('meat'); f.mats.push(m);
      f.obj.add(new THREE.Mesh(slab(blob(0.055, 0.022, seed, 16, 0.1), t, { round: 0.003 }), m));
      f.units = 0.12;
      break;
    }
    case 'egg': {
      f = new Food('egg', 0.008, 0.05);
      const w = foodMat('egg', { transparentRaw: true }); w.userData.uEdgeK.value = 0.9;
      const y = foodMat('egg'); y.userData.uEdgeK.value = 0;
      f.mats.push(w, y);
      const white = new THREE.Mesh(eggWhiteGeo(seed), w);
      const yolk = new THREE.Mesh(yolkGeo(), y);
      yolk.position.set(0.006, 0.007, -0.004);
      yolk.name = 'yolk';
      f.obj.add(white, yolk);
      break;
    }
    case 'trout': {
      const u0 = o.u0 ?? 0, u1 = o.u1 ?? 1;
      const len = 0.42;
      f = new Food('trout', 0.034, Math.max(0.04, (u1 - u0) * len * 0.55));
      f.u0 = u0; f.u1 = u1; f.units = u1 - u0;
      const m = foodMat('trout', { rough: 0.45 }); m.userData.uEdgeK.value = 0.2;
      f.mats.push(m);
      const g = troutGeo(len, u0, u1);
      const cx = -len / 2 + ((u0 + u1) / 2) * len;
      g.translate(-cx, 0, 0);
      if (u1 - u0 <= 0.2 && u0 > 0.01 && u1 < 0.99) {
        const half = ((u1 - u0) * len) / 2;
        g.translate(0, -0.017, 0);
        g.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
        g.translate(0, half, 0);
        f.h = half * 2; f.r = 0.038;
      }
      f.obj.add(new THREE.Mesh(g, m));
      break;
    }
    case 'dough': {
      f = new Food('dough', 0.05, 0.07);
      f.berry = !!o.berry;
      const m = foodMat(f.berry ? 'dough_berry' : 'dough', { rough: 0.8 }); m.userData.uEdgeK.value = 0.15;
      f.mats.push(m);
      f.obj.add(new THREE.Mesh(doughGeo(o.flat ?? 0, seed), m));
      break;
    }
    case 'sausage': {
      f = new Food('sausage', 0.023, 0.06);
      const m = foodMat('sausage', { rough: 0.4 }); m.userData.uEdgeK.value = 0.3;
      f.mats.push(m);
      f.obj.add(new THREE.Mesh(sausageGeo(seed), m));
      f.units = 0.25;
      break;
    }
    case 'flapjack': {
      const r = o.r ?? 0.045;
      f = new Food('flapjack', 0.009, r);
      const m = foodMat('flapjack', { rough: 0.7 }); m.userData.uEdgeK.value = 0.45;
      f.mats.push(m);
      f.obj.add(new THREE.Mesh(flapjackGeo(r, seed), m));
      f.units = 0.25;
      break;
    }
    case 'dumpling': {
      f = new Food('dumpling', 0.026, 0.024);
      const m = foodMat('dumpling', { rough: 0.8 }); m.userData.uEdgeK.value = 0.2;
      f.mats.push(m);
      f.obj.add(new THREE.Mesh(dumplingGeo(seed), m));
      f.units = 0.25;
      break;
    }
    case 'pastry': {
      f = new Food('pastry', 0.008, 0.09);
      const m = foodMat('pastry', { rough: 0.75 }); m.userData.uEdgeK.value = 0.3;
      f.mats.push(m);
      f.obj.add(new THREE.Mesh(pastryGeo(seed), m));
      break;
    }
    case 'shroom': default: {
      f = new Food('shroom', 0.012, 0.04);
      const m = foodMat('dough', { rough: 0.6 });
      m.color.set(0xf0b040);
      f.mats.push(m);
      const r = new Rand(Math.floor(seed));
      for (let i = 0; i < 9; i++) {
        const piece = new THREE.Mesh(slab(blob(0.009, 0.006, i + seed, 8, 0.25), 0.006, { round: 0.002 }), m);
        piece.position.set(r.range(-0.025, 0.025), 0, r.range(-0.025, 0.025));
        piece.rotation.y = r.range(0, 6.28);
        f.obj.add(piece);
      }
      break;
    }
  }
  f.obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return f;
}

/** an uncut piece on the board that the knife takes slices off (bacon loin, meat slab, chanterelle cluster) */
class Stock {
  readonly obj = new THREE.Group();
  mesh: THREE.Mesh | null = null;
  chops = 0;
  constructor(readonly kind: 'bacon' | 'meat' | 'shroom', public len: number, readonly key: string) { this.rebuild(); }
  rebuild(): void {
    if (this.mesh) { this.mesh.geometry.dispose(); this.obj.remove(this.mesh); this.mesh = null; }
    if (this.len < 0.004) return;
    if (this.kind === 'shroom') {
      if (this.obj.children.length) return;
      const p = buildProduct('chanterelle');
      p.scale.setScalar(1.1);
      this.obj.add(p);
      return;
    }
    const m = foodMat(this.kind === 'bacon' ? 'bacon' : 'meat');
    const g = this.kind === 'bacon' ? loinGeo(0.04, 0.034, this.len, 7) : loinGeo(0.03, 0.055, this.len, 9);
    g.translate(-this.len / 2, 0, 0);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.castShadow = true;
    this.obj.add(this.mesh);
  }
}

// ---------------------------------------------------------------------------------------------- vessels
type VKind = 'skillet' | 'pot' | 'coffee';
interface Lid { kind: 'skillet' | 'pot'; obj: THREE.Group; rest: { p: THREE.Vector3; q: THREE.Quaternion }; on: Vessel | null; hit: THREE.Mesh }

class Vessel {
  T = 20;
  heat = 0;
  /** plain water (litres): caps the temperature at a boil */
  water = 0;
  foods: Food[] = [];
  piles: Pile[] = [];
  /** recipe key -> units that went in */
  added = new Map<string, number>();
  liquid: { mesh: THREE.Mesh; mat: LiquidMat } | null = null;
  fat: Fat | null = null;
  lid: Lid | null = null;
  pot = { progress: 0, scorch: 0, sinceStir: 0, spin: 0, simmer: 0, boil: 0, lidSecs: 0 };
  coffee = { grounds: '' as '' | 'coffee' | 'tea' | 'labtea', boil: 0, settle: 0, poured: 0, steep: 0, maxT: 20 };
  flips = 0; badFlips = 0;
  tasted = false;
  seared = new Set<string>(); browned = new Set<string>();
  mixes: string[] = [];
  lift = 1;
  voice: Voice | null = null;
  boilVoice: Voice | null = null;
  fireVoice: Voice | null = null;
  calls = new Set<string>();
  /** tests: hold the temperature here */
  pinT: number | null = null;
  constructor(readonly kind: VKind, readonly obj: THREE.Group, public pos: THREE.Vector3) {}
  get r(): number { return this.kind === 'skillet' ? 0.128 : this.kind === 'pot' ? 0.098 : 0.068; }
  get floor(): number { return (this.obj.userData.floor as number | undefined) ?? 0.008; }
  get inner(): number { return this.kind === 'skillet' ? 0.098 : this.kind === 'pot' ? 0.08 : 0.055; }
  has(k: string): number { return this.added.get(k) ?? 0; }
  add(k: string, n: number): void { this.added.set(k, this.has(k) + n); }
  /** everything liquid (L): water plus milk, tomatoes, beans... */
  get wet(): number { return this.water + this.has('milk') * 0.25 + this.has('tomatoes') * 0.8 + this.has('beans') * 0.4 + this.has('syrup') * 0.015 + (this.has('berries') > 0 && this.water > 0.02 ? this.has('berries') * 0.08 : 0); }
  get empty(): boolean { return !this.foods.length && !this.piles.length && this.added.size === 0 && this.water < 0.01; }
  reset(keepFat = 0): void {
    this.foods = []; this.piles = [];
    this.added.clear(); this.water = 0;
    this.pot = { progress: 0, scorch: 0, sinceStir: 0, spin: 0, simmer: 0, boil: 0, lidSecs: 0 };
    this.flips = this.badFlips = 0; this.tasted = false; this.seared.clear(); this.browned.clear(); this.mixes = []; this.lift = 1;
    this.calls.clear();
    if (this.fat) { if (keepFat > 0 && this.fat.total > 2) { const keep = Math.min(this.fat.total, keepFat); this.fat.consume(this.fat.total - keep); this.fat.firedFor = 0; this.fat.smokedFor = 0; } else this.fat.clear(); }
    if (this.liquid) { this.obj.remove(this.liquid.mesh); this.liquid = null; }
  }
}

interface Pantry { id: string; obj: THREE.Object3D; home: THREE.Vector3; yaw: number; hit: THREE.Mesh; ing: IngDef | null; fixture?: boolean; open?: boolean; cap?: THREE.Object3D }

type Target = { kind: 'vessel' | 'board' | 'bowl' | 'rack' | 'plate' | 'mug' | 'none'; v?: Vessel; label: string; flow?: boolean };

type Drag =
  | { kind: 'carry'; p: Pantry; tgt: Target | null; acc: number; total: number; lastDx: number; pour: boolean }
  | { kind: 'food'; f: Food; from: Where; fromV: Vessel | null }
  | { kind: 'vessel'; v: Vessel; from: THREE.Vector3 }
  | { kind: 'board' }
  | { kind: 'egg'; shell: THREE.Mesh }
  | { kind: 'flip'; f: Food; v: Vessel; t: number; y0: number; vy: number; lift: number }
  | { kind: 'cut'; at: number; depth: number; y0: number; x0: number; done: boolean; target: 'stock' | 'trout'; f?: Food }
  | { kind: 'press'; what: 'produce' | 'strip'; p?: Produce; f?: Food; x0: number; y0: number }
  | { kind: 'chop'; p: Produce; at: number; depth: number; y0: number; armed: boolean; cuts: number }
  | { kind: 'scrape'; p: Produce; x0: number; carried: boolean }
  | { kind: 'peel'; p: Produce; last: THREE.Vector2 }
  | { kind: 'knead'; f: Food; last: THREE.Vector2; amt: number }
  | { kind: 'stir'; v: Vessel | null; last: number; amt: number; bowl: boolean }
  | { kind: 'toss'; v: Vessel; last: THREE.Vector2; amt: number }
  | { kind: 'draft'; x0: number; d0: number }
  | { kind: 'lid'; lid: Lid }
  | { kind: 'bowl'; tgt: Target | null };

const VIEWS = {
  stove: { pos: V3(0.03, 1.36, 0.66), look: V3(0.0, 0.88, 0.0), fov: 54 },
  prep: { pos: V3(0.5, 1.32, 0.8), look: V3(0.6, 0.8, 0.0), fov: 54 },
  pantry: { pos: V3(-0.56, 1.45, 1.12), look: V3(-0.62, 0.74, 0.3), fov: 54 },
  larder: { pos: V3(-0.8, 1.27, 0.42), look: V3(-1.12, 0.78, -0.58), fov: 54 },
  door: { pos: V3(0.08, 0.96, 0.95), look: V3(0.0, 0.6, 0.44), fov: 50 },
};
type ViewName = keyof typeof VIEWS;

const SERVE = V3(0.5, COUNTER.y, 0.42), MUG = V3(0.72, COUNTER.y, 0.5), BOX = V3(0.73, COUNTER.y, 0.33);
const BOWL_AT = V3(-0.74, PANTRY.y, 0.6), PAIL_AT = V3(-0.47, PANTRY.y, 0.6), CUP_AT = V3(-0.6, PANTRY.y, 0.5), SPOON_AT = V3(-0.6, PANTRY.y, 0.68);
/** continuous pours: portions per second (water: litres per second into pots, cups into the bowl) */
const FLOW: Record<string, number> = { oil: 1.4, milk: 2.2, syrup: 1.6, tomatoes: 0.9, beans: 0.8, water: 1.2, flour: 2.4, sugar: 2.4, oats: 2.4, rice: 2.4, macaroni: 2.4, peas: 2.4, baking_powder: 1.6 };
const START_RECIPES = RECIPES.filter((r) => r.start && !STORY_CARDS.includes(r.id)).map((r) => r.id);

// ---------------------------------------------------------------------------------------------- the station
export class CookingStation extends Station {
  readonly root = new THREE.Group();
  private stoveObj: THREE.Object3D;
  private bits = new Bits(500);
  private skillet: Vessel;
  private pot: Vessel;
  private coffee: Vessel;
  private vessels: Vessel[];
  private lids: Lid[] = [];
  private board: THREE.Object3D = new THREE.Group();
  private boardPos = V3(0.565, COUNTER.y, 0.02);
  private boardHit: THREE.Mesh;
  private knife: THREE.Object3D;
  private turner: THREE.Object3D;
  private spoon: THREE.Object3D = new THREE.Group();
  private cup: THREE.Object3D;
  private tsp: THREE.Object3D;
  private dipper: THREE.Object3D;
  private pailObj: THREE.Object3D;
  private toolRest = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion }>();
  private foods: Food[] = [];
  private stock: Stock | null = null;
  private produce: Produce | null = null;
  private pantry: Pantry[] = [];
  private fixtures: Pantry[] = [];
  private bowl: Bowl;
  private bowlObj: THREE.Object3D;
  private bowlHit: THREE.Mesh;
  private plateObj: THREE.Object3D;
  private dishBowl: THREE.Object3D;
  private mugObj: THREE.Object3D;
  private served: { v: Verdict; foods: Food[]; piles: Pile[]; obj: THREE.Object3D; hit: THREE.Mesh; extra: THREE.Mesh[] } | null = null;
  private poured: { v: Verdict } | null = null;
  private rack: THREE.Group;
  private rackStrips: Food[] = [];
  private drag: Drag | null = null;
  private viewName: ViewName = 'stove';
  /** leaning in over the work (the board while cutting, a pan while stirring or flipping) */
  private lean: 'board' | 'skillet' | 'pot' | null = null;
  /** a lean set from outside (dev / screenshots) holds until the view changes */
  private leanPinned = false;
  private vpool: THREE.Vector3[] = []; private vi = 0;
  private qpool: THREE.Quaternion[] = []; private qi = 0;
  private overBoard = false;
  private edgeT = 0;
  private draft = 0.5;
  private flare = 0;
  private draftDisc: THREE.Object3D | null = null;
  private doorPivot: THREE.Object3D | null = null;
  /** portions left in open packages (item id -> portions) */
  private left = new Map<string, number>();
  private lardPail = 10;
  private hover: { text: string; at: THREE.Vector3 } | null = null;
  private time = 0;
  private stream: THREE.Mesh;
  private streamMat: THREE.MeshBasicMaterial;
  private streamOn = 0;
  /** what happened this session at the stove (recipe steps) */
  private log: Log = [];
  private act: { kind: 'taste'; t: number; v: Vessel | 'served'; said: boolean } | null = null;
  private recipeBox: THREE.Object3D;
  private boxHit: THREE.Mesh;
  private cardView: CardMesh;
  private cardMini: CardMesh;
  private cardOpen: number | null = null;
  private pinned: string | null = null;
  private best = new Map<string, Grade>();
  private tickT = 0;
  private ticks: boolean[] = [];
  /** the card's ticks as they stood when its dish was served (shown until that vessel is used again) */
  private servedTicks = new Map<string, boolean[]>();
  private fresh = new Set<string>();
  private wantCards = false;
  private packed = new Map<string, Grade[]>();
  readonly buffs: Buffs;

  constructor(g: Game) {
    super(g);
    const top = g.cabin!.anchors.stove_top as THREE.Object3D;
    this.stoveObj = top.parent!;
    const host = this.stoveObj.parent!;
    this.root.name = 'cooking_station';
    this.root.position.copy(this.stoveObj.position);
    this.root.quaternion.copy(this.stoveObj.quaternion);
    host.add(this.root);
    g.scene.add(this.bits.mesh);
    this.bits.setCamera(g.camera);
    this.buffs = new Buffs(g);
    // ---- furniture: plate on the drum, prep counter, pantry table, larder, spice shelf
    this.root.add(buildPlate());
    const ms = new Mesher();
    const rnd = new Rand(4711);
    buildCounter(ms, rnd);
    buildPantry(ms, rnd);
    buildLarder(ms, rnd);
    buildSpiceShelf(ms, rnd);
    this.root.add(ms.build({ name: 'cook_furniture' }));
    // a few jars that live in the larder for good
    for (const [id, x, s] of [['jar_flour', LARDER.x0 + 0.06, 0], ['jar_preserves', LARDER.x1 - 0.05, 2]] as [string, number, number][]) {
      const j = buildProduct(id); j.position.set(x, LARDER.ys[s], LARDER.z0 + 0.06); j.scale.setScalar(0.8); this.root.add(j);
    }
    // ---- vessels
    this.skillet = new Vessel('skillet', buildSkillet(), V3(0.0, PLATE.y, 0.27));
    this.pot = new Vessel('pot', buildPot(), V3(-0.095, PLATE.y, 0.02));
    this.coffee = new Vessel('coffee', buildCoffeePot(), V3(0.125, PLATE.y, 0.0));
    this.vessels = [this.skillet, this.pot, this.coffee];
    for (const v of this.vessels) { this.root.add(v.obj); v.obj.position.copy(v.pos); }
    this.coffee.water = 0.8;
    this.skillet.fat = new Fat(this.skillet.obj, this.skillet.floor, this.skillet.inner);
    this.pot.fat = new Fat(this.pot.obj, this.pot.floor, this.pot.inner);
    // ---- lids hang on the stone heat shield behind the stove
    for (const [kind, x] of [['skillet', -0.16], ['pot', 0.17]] as ['skillet' | 'pot', number][]) {
      const obj = buildLid(kind);
      const p = V3(x, 1.0, -0.565), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.08, 0, 0));
      obj.position.copy(p); obj.quaternion.copy(q);
      this.root.add(obj);
      const hit = proxy(new THREE.CylinderGeometry(obj.userData.r, obj.userData.r, 0.05, 12));
      hit.position.y = 0.012;
      obj.add(hit);
      this.lids.push({ kind, obj, rest: { p, q }, on: null, hit });
    }
    // ---- board, knife, turner, spoon, measuring cup and spoon, dipper
    this.boardHit = proxy(new THREE.BoxGeometry(0.46, 0.05, 0.26));
    this.boardHit.position.y = 0.02;
    this.board.add(this.boardHit);
    this.board.position.copy(this.boardPos);
    this.root.add(this.board);
    loadProp('wooden_cutting_board').then((o) => { this.board.add(o); }).catch(() => {});
    this.knife = buildKnife();
    this.turner = buildTurner();
    this.rest(this.knife, V3(0.42, COUNTER.y + 0.012, 0.23), new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2 + 0.08));
    this.rest(this.turner, V3(0.6, COUNTER.y + 0.01, 0.235), new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2 - 0.1));
    loadProp('wooden_spoon').then((o) => { this.spoon.add(fitTool(o, 0.18)); }).catch(() => {});
    this.rest(this.spoon, V3(0.73, COUNTER.y + 0.015, 0.2), new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2 + 0.2));
    this.cup = buildMeasureCup();
    this.rest(this.cup, CUP_AT.clone().add(V3(0, 0.005, 0)), new THREE.Euler(-Math.PI / 2, 0, 0.4));
    this.tsp = buildMeasureSpoon();
    this.rest(this.tsp, SPOON_AT.clone().add(V3(0, 0.003, 0)), new THREE.Euler(-Math.PI / 2, 0, 1.2));
    // ---- fixtures: Ray's lard pail, the salt shaker, the pepper mill, the water pail
    const lard = buildLard();
    this.fixture('lard_pail', lard, V3(0.735, COUNTER.y, -0.235), 0, 0.12, 0.1, 0.12);
    this.fixture('salt', buildSaltShaker(), V3(0.71, SHELF.y, -0.2), 0, 0.05, 0.1, 0.05);
    this.fixture('pepper', buildPepperMill(), V3(0.71, SHELF.y, -0.12), 0, 0.05, 0.14, 0.05);
    const pail = buildPail();
    this.fixture('water', pail, PAIL_AT, 0.4, 0.2, 0.22, 0.2);
    this.pailObj = pail;
    this.dipper = pail.userData.dipper as THREE.Object3D;
    this.rest(this.dipper, PAIL_AT.clone().add(V3(0.0, 0.21, 0.02)), new THREE.Euler(0, 0.4 - Math.PI / 2, -0.3));
    const wf = this.fixtures.find((x) => x.id === 'water')!;
    wf.obj = this.dipper; wf.home = this.dipper.position.clone(); wf.yaw = 0.4 - Math.PI / 2;
    this.left.set('salt', 40); this.left.set('pepper', 30);
    // ---- the mixing bowl
    this.bowlObj = buildMixBowl();
    this.bowlObj.position.copy(BOWL_AT);
    this.root.add(this.bowlObj);
    this.bowl = new Bowl(this.bowlObj, 0.1, 0.09);
    this.bowlHit = proxy(new THREE.CylinderGeometry(0.115, 0.07, 0.1, 12));
    this.bowlHit.position.y = 0.05;
    this.bowlObj.add(this.bowlHit);
    // ---- serving plate (and a bowl for pot dishes), mug on the counter
    this.plateObj = buildProduct('enamel_plate');
    this.plateObj.position.copy(SERVE);
    this.root.add(this.plateObj);
    this.dishBowl = buildProduct('enamel_bowl');
    this.dishBowl.position.copy(SERVE);
    this.dishBowl.visible = false;
    this.root.add(this.dishBowl);
    this.mugObj = buildProduct('enamel_mug');
    this.mugObj.position.copy(MUG);
    this.mugObj.rotation.y = -0.6;
    this.root.add(this.mugObj);
    // ---- recipe box and cards
    this.recipeBox = buildRecipeBox();
    this.recipeBox.position.copy(BOX);
    this.recipeBox.rotation.y = -0.3;
    this.root.add(this.recipeBox);
    this.boxHit = proxy(new THREE.BoxGeometry(0.15, 0.13, 0.12));
    this.boxHit.position.y = 0.06;
    this.recipeBox.add(this.boxHit);
    registerInteractable(this.boxHit, { kind: 'custom', label: () => 'Recipe box', use: () => { this.wantCards = true; this.enter(); } } as never);
    this.cardView = new CardMesh(0.24);
    this.cardView.mesh.position.set(0, -0.004, -0.3);
    this.cardView.mesh.visible = false;
    g.camera.add(this.cardView.mesh);
    this.cardMini = new CardMesh(0.105);
    this.cardMini.mesh.visible = false;
    g.camera.add(this.cardMini.mesh);
    // ---- the pour stream
    this.streamMat = new THREE.MeshBasicMaterial({ color: 0xd8a830, transparent: true, opacity: 0.85 });
    const sg = new THREE.CylinderGeometry(0.0025, 0.0018, 1, 5, 1, true);
    sg.translate(0, -0.5, 0);
    this.stream = new THREE.Mesh(sg, this.streamMat);
    this.stream.visible = false;
    this.root.add(this.stream);
    // ---- jerky rack hung from the stovepipe above the plate
    this.rack = buildRack();
    this.rack.position.set(0, 1.26, -0.16);
    this.root.add(this.rack);
    const rackHit = proxy(new THREE.BoxGeometry(0.36, 0.08, 0.08));
    rackHit.position.set(0, -0.03, 0.025);
    this.rack.add(rackHit);
    registerInteractable(rackHit, {
      kind: 'custom',
      label: () => (this.rackStrips.length ? (this.rackStrips.every((f) => f.smoke >= 1) ? 'Take the smoked jerky' : 'Jerky smoking…') : ''),
      use: () => this.takeJerky(),
    } as never);
    // ---- a draft disc over the stove door's spin draft (the real fire level follows it)
    this.stoveObj.traverse((o) => { if (o.name === 'stove_door') this.doorPivot = o; });
    if (this.doorPivot) {
      const disc = new THREE.Group();
      const dg = new THREE.CylinderGeometry(0.074, 0.074, 0.006, 20);
      dg.rotateX(Math.PI / 2);
      const dmesh = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.7, metalness: 0.4 }));
      disc.add(dmesh);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.03, 8).rotateX(Math.PI / 2), dmesh.material);
      knob.position.z = 0.016;
      disc.add(knob);
      const portMat = new THREE.MeshBasicMaterial({ color: 0xff7a28 });
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const port = new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), portMat);
        port.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.0035);
        disc.add(port);
      }
      disc.userData.ports = portMat;
      disc.position.set((0.02 + 0.3 + 0.06) / 2 + 0.01, 0, 0.03);
      this.doorPivot.add(disc);
      this.draftDisc = disc;
    }
    // ---- the stove top becomes the way in
    clearInteractables(top);
    const hot = proxy(new THREE.BoxGeometry(0.46, 0.2, 0.56));
    hot.position.set(0, PLATE.y + 0.08, 0.16);
    this.root.add(hot);
    registerInteractable(hot, { kind: 'stove', label: () => 'Cook', use: () => { this.enter(); } } as never);
    this.setView(VIEWS.stove);
    this.parallax = 0.03;
    // the counter, the pantry table and the larder are solid
    this.root.updateWorldMatrix(true, false);
    const wp = this.root.getWorldPosition(new THREE.Vector3());
    const e = new THREE.Euler().setFromQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    const cols = new Cols();
    const boxCol = (b: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: number) => cols.box((b.x0 + b.x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2, (b.x1 - b.x0) / 2, (y1 - y0) / 2, (b.z1 - b.z0) / 2);
    boxCol(COUNTER, 0, COUNTER.y); boxCol(PANTRY, -0.1, PANTRY.y); boxCol(LARDER, -0.1, 1.42);
    g.addPlace({ group: new THREE.Group(), colliders: cols.toWorld(wp.x, wp.y, wp.z, e.y), anchors: {}, lights: [], update: () => {}, interior: [] } as never);
    // ---- recipe cards: the story hands them out
    g.events.on('recipe', (d: { id: string; from?: string }) => this.unlock(d?.id ?? '', d?.from));
    // a meal packed for later still gives its buff when eaten
    const useItem = g.useItem.bind(g);
    let offered = false;
    g.events.on('offer', (o: { taken: boolean }) => { if (o.taken) offered = true; });
    g.useItem = (id, t) => {
      offered = false;
      const had = g.inv.items.get(id) ?? 0;
      const ok = useItem(id, t);
      if (ok && !offered && (g.inv.items.get(id) ?? 0) < had) this.ateLater(id);
      return ok;
    };
  }

  private fixture(id: string, obj: THREE.Object3D, p: THREE.Vector3, yaw: number, w: number, h: number, d: number): void {
    obj.position.copy(p); obj.rotation.y = yaw;
    this.root.add(obj);
    const ing = id === 'lard_pail' ? ING.lard : id === 'water' ? null : ING[id] ?? null;
    const f: Pantry = { id, obj, home: p.clone(), yaw, hit: this.hitFor(obj, w, h, d), ing, fixture: true };
    this.fixtures.push(f);
  }

  private rest(o: THREE.Object3D, p: THREE.Vector3, e: THREE.Euler): void {
    o.position.copy(p); o.quaternion.setFromEuler(e);
    this.root.add(o);
    this.toolRest.set(o, { p: p.clone(), q: o.quaternion.clone() });
  }
  private putBack(o: THREE.Object3D): void {
    const r = this.toolRest.get(o);
    if (!r) return;
    this.root.add(o);
    o.position.copy(r.p); o.quaternion.copy(r.q);
  }
  private inHand(o: THREE.Object3D, side: 'L' | 'R' = 'R'): void {
    const s = this.hands.socket(side);
    if (o.parent === s) return;
    s.add(o);
    o.position.set(0, 0, 0); o.quaternion.identity();
  }
  private hitFor(o: THREE.Object3D, w: number, h: number, d: number): THREE.Mesh {
    const m = proxy(new THREE.BoxGeometry(w, h, d));
    m.position.y = h / 2;
    o.add(m);
    return m;
  }
  private W(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 { return this.root.localToWorld(out.copy(p)); }
  private L(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 { return this.root.worldToLocal(out.copy(p)); }

  protected standSpot(): { x: number; z: number; yaw: number } {
    const p = this.W(V3(0.05, 0, 0.95));
    const f = this.W(V3(0, 0, 0)).sub(p);
    return { x: p.x, z: p.z, yaw: Math.atan2(-f.x, -f.z) };
  }

  // ------------------------------------------------------------------------------------------ cards
  private unlocked(id: string): boolean {
    const f = this.g.flags;
    return START_RECIPES.includes(id) || f.has(`cook:recipe:${id}`) || f.has(`st:recipe:${id}`) || f.has(`recipe:${id}`);
  }
  /** hand over a card (story event, or worked out at the stove) */
  unlock(raw: string, from?: string): string | null {
    const id = resolveRecipe(raw);
    if (!id) { console.warn(`[cook] no recipe card for '${raw}'`); return null; }
    // remember who gave it: the card says so
    if (from && !this.giver(id)) this.g.flags.add(`cook:from:${id}:${from}`);
    if (this.unlocked(id) && this.g.flags.has(`cook:recipe:${id}`)) return id;
    this.g.flags.add(`cook:recipe:${id}`);
    this.fresh.add(id);
    const r = RECIPE_BY_ID.get(id)!;
    if (!from) hud.say(`<i>New recipe card in the box: ${r.name}.</i>`, 3.5);
    return id;
  }
  /** who handed over a card (the story's 'recipe' event), if anyone */
  private giver(id: string): string | null {
    const pre = `cook:from:${id}:`;
    for (const f of this.g.flags) if (f.startsWith(pre)) return f.slice(pre.length);
    return null;
  }
  private cardState(r: Recipe): CardState {
    const pinned = this.pinned === r.id;
    const story = STORY_CARDS.includes(r.id);
    const given = this.g.flags.has(`st:recipe:${r.id}`) || this.g.flags.has(`recipe:${r.id}`);
    const from = this.giver(r.id) ?? (story ? (this.unlocked(r.id) ? (given ? 'a card somebody gave you' : 'what you worked out at the stove') : null) : r.from);
    return { unlocked: this.unlocked(r.id), best: this.best.get(r.id) ?? null, ticks: pinned ? this.ticks : r.steps.map(() => false), pinned, fresh: this.fresh.has(r.id), from };
  }
  private openCards(at?: string): void {
    const order = this.cardOrder();
    const i = at ? order.findIndex((r) => r.id === at) : this.pinned ? order.findIndex((r) => r.id === this.pinned) : 0;
    this.cardOpen = Math.max(0, i);
    this.cardView.mesh.visible = true;
    this.endDrag();
    audio.play('paper_rustle', { vol: 0.5 });
  }
  private cardOrder(): Recipe[] { return [...RECIPES].sort((a, b) => Number(this.unlocked(b.id)) - Number(this.unlocked(a.id))); }
  private cardsUpdate(): void {
    const p = this.ptr;
    const order = this.cardOrder();
    const r = order[this.cardOpen!];
    this.cardView.show(r, this.cardState(r));
    const zone = p.x < -0.42 ? 'prev' : p.x > 0.42 ? 'next' : 'mid';
    const cam = this.g.camera;
    const at = this.cardView.mesh.getWorldPosition(_t1).add(_t2.set(p.x * 0.14, -0.1, 0).applyQuaternion(cam.quaternion));
    const unl = this.unlocked(r.id);
    this.hover = { text: zone === 'prev' ? '◀ previous card' : zone === 'next' ? 'next card ▶' : unl ? (this.pinned === r.id ? 'Unpin it  ·  RMB put the cards away' : 'Pin it by the stove  ·  RMB put the cards away') : 'RMB put the cards away', at: at.clone() };
    if (p.pressed) {
      if (zone === 'prev') { this.cardOpen = (this.cardOpen! + order.length - 1) % order.length; audio.play('page_turn', { vol: 0.4 }); }
      else if (zone === 'next') { this.cardOpen = (this.cardOpen! + 1) % order.length; audio.play('page_turn', { vol: 0.4 }); }
      else if (unl) { this.pinned = this.pinned === r.id ? null : r.id; this.tickT = 0; this.fresh.delete(r.id); audio.play('paper_rustle', { vol: 0.4 }); }
    }
    if (p.rpressed) this.closeCards();
  }
  private closeCards(): void { this.cardOpen = null; this.cardView.mesh.visible = false; audio.play('paper_rustle', { vol: 0.3, rate: 1.2 }); }
  /** the pinned card in the corner, ticking off the steps */
  private miniCard(dt: number): void {
    const on = this.active && this.phase === 'on' && !!this.pinned && this.cardOpen === null;
    this.cardMini.mesh.visible = on;
    if (!this.pinned) return;
    const r = RECIPE_BY_ID.get(this.pinned)!;
    if ((this.tickT -= dt) <= 0) {
      this.tickT = 0.5;
      const v = r.vessel === 'skillet' ? this.skillet : r.vessel === 'pot' ? this.pot : this.coffee;
      const kept = this.servedTicks.get(r.id);
      if (kept && v.empty && v.wet < 0.05) this.ticks = kept;
      else {
        if (kept) this.servedTicks.delete(r.id);
        const d = this.summarize(v);
        this.ticks = r.steps.map((s) => { try { return s.ok(d, this.log); } catch { return false; } });
      }
    }
    if (on) {
      const cam = this.g.camera;
      const h = 0.3 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), w = h * cam.aspect;
      this.cardMini.mesh.position.set(-w + 0.062, h - 0.04, -0.3);
      this.cardMini.show(r, this.cardState(r));
    }
  }

  // ------------------------------------------------------------------------------------------ entering
  protected onEnter(): void {
    this.viewName = 'stove';
    this.setView(this.worldView('stove'));
    this.layPantry();
    this.log = this.log.slice(-200);
    if (this.wantCards) { this.wantCards = false; this.viewName = 'prep'; this.setView(this.worldView('prep')); setTimeout(() => { if (this.active) this.openCards(); }, 600); return; }
    const fresh = [...this.fresh].map((id) => RECIPE_BY_ID.get(id)?.name).filter(Boolean);
    this.say(fresh.length ? `New in the recipe box: ${fresh.join(', ')}.` : this.g.stove.lit ? (this.g.stove.level > 0.5 ? 'The plate\'s good and hot.' : 'The stove\'s going. Could be hotter.') : 'The stove\'s cold. Better get a fire going first.', 2.6);
  }
  protected onExit(): void {
    this.endDrag();
    if (this.cardOpen !== null) this.closeCards();
    this.cardMini.mesh.visible = false;
    this.streamOn = 0; this.stream.visible = false;
    for (const p of this.pantry) { p.obj.removeFromParent(); p.cap?.removeFromParent(); }
    this.pantry = [];
    for (const t of [this.knife, this.turner, this.spoon, this.cup, this.tsp, this.dipper]) this.putBack(t);
  }
  private worldView(n: ViewName): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    const v = VIEWS[n];
    return { pos: this.W(v.pos), look: this.W(v.look), fov: v.fov };
  }

  private owned(id: string): boolean { return this.g.owns(id) || (this.left.get(id) ?? 0) > 0; }

  /** take one portion of an ingredient (opens a new package when the open one is empty) */
  private use(id: string, n = 1): boolean {
    if (id === 'lard_pail') { if (this.lardPail < n) { if (!this.g.take('lard')) return false; this.lardPail += ING.lard.uses; this.say('A fresh brick of lard into the pail.', 2); } this.lardPail -= n; return true; }
    if (id === 'water') return true;
    const ing = ING[id];
    let l = this.left.get(id) ?? 0;
    if (l < n - 1e-6) {
      if (!this.g.take(id)) return false;
      l += ing ? ing.uses : 1;
      if (id === 'salt' || id === 'pepper') this.say(id === 'salt' ? 'Fills the shaker from the box.' : 'Fills the mill from the tin.', 2);
    }
    this.left.set(id, l - n);
    return true;
  }
  private leftOf(id: string): number { return id === 'lard_pail' ? this.lardPail + (this.g.inv.items.get('lard') ?? 0) * ING.lard.uses : (this.left.get(id) ?? 0) + (this.g.inv.items.get(id) ?? 0) * (ING[id]?.uses ?? 1); }

  /** set out what the player owns: fresh food on the pantry table, staples in the larder, oil and butter on the shelf */
  private layPantry(): void {
    const g = this.g;
    for (const p of this.pantry) { p.obj.removeFromParent(); p.cap?.removeFromParent(); }
    this.pantry = [];
    const meats = meatIds();
    const table = [...TABLE_ORDER, ...meats.filter((m) => !TABLE_ORDER.includes(m)), 'kindling'];
    const put = (id: string, pos: THREE.Vector3, yaw: number, fit: number, obj?: THREE.Object3D) => {
      const o = obj ?? (id === 'bannock_mix' ? buildMixSack() : meats.includes(id) ? buildMeatPack() : buildProduct(id));
      // scale wide things down to their slot
      const b = new THREE.Box3().setFromObject(o);
      const sz = b.getSize(_t1);
      if (Math.max(sz.x, sz.z) > fit) o.scale.setScalar(fit / Math.max(sz.x, sz.z));
      o.position.copy(pos); o.rotation.y = yaw;
      this.root.add(o);
      const s = o.scale.x;
      const hit = proxy(new THREE.BoxGeometry(Math.max(0.05, sz.x * 0.85 / s), Math.max(0.04, sz.y * 0.9 / s), Math.max(0.05, sz.z * 0.85 / s)));
      hit.position.y = sz.y / s / 2;
      o.add(hit);
      const pp: Pantry = { id, obj: o, home: pos.clone(), yaw, hit, ing: ING[id] ?? null };
      this.pantry.push(pp);
      return pp;
    };
    // the fish lies on the back of the counter
    if (this.owned('fish') && !this.foods.some((f) => f.kind === 'trout' && f.where === 'board') && !this.boardBusy()) {
      const obj = buildProduct('fish');
      obj.scale.setScalar(0.62);
      obj.rotation.set(Math.PI / 2, 0, 0);
      const pos = V3(0.5, COUNTER.y + 0.034, -0.255);
      obj.position.copy(pos);
      this.root.add(obj);
      this.pantry.push({ id: 'fish', obj, home: pos.clone(), yaw: 0, hit: this.hitFor(obj, 0.45, 0.14, 0.1), ing: null });
    }
    // pantry table: 4 x 3
    const tslots: [number, number][] = [];
    for (const z of [0.04, 0.17, 0.3]) for (const x of [-0.8, -0.68, -0.56, -0.44]) tslots.push([x, z]);
    let ti = 0;
    for (const id of table) {
      if (ti >= tslots.length) break;
      if (!this.owned(id) || !ITEMS[id]) continue;
      const [x, z] = tslots[ti++];
      put(id, V3(x, PANTRY.y, z), (ti % 3 - 1) * 0.15, 0.11);
    }
    // larder: 4 per shelf, 3 shelves, the big sacks low
    const lslots: [number, number][] = [];
    for (let s = 0; s < 3; s++) for (let k = 0; k < 4; k++) lslots.push([LARDER.x0 + 0.06 + k * 0.105, LARDER.ys[s]]);
    let li = 0;
    for (const id of [...LARDER_ORDER, 'bannock_mix']) {
      if (li >= lslots.length) break;
      if (!this.owned(id) || !ITEMS[id]) continue;
      const [x, y] = lslots[li++];
      put(id, V3(x, y, (LARDER.z0 + LARDER.z1) / 2 + 0.02), 0, 0.1);
    }
    // the shelf: butter on its dish, the oil (uncap it to pour)
    if (this.owned('butter')) {
      const dish = buildButterDish();
      const brick = buildProduct('butter'); brick.scale.setScalar(0.75); brick.position.y = 0.006; dish.add(brick);
      put('butter', V3(0.71, SHELF.y, 0.02), Math.PI / 2, 0.16, dish);
    }
    if (this.owned('oil')) {
      const bottle = buildProduct('oil_open');
      const pp = put('oil', V3(0.71, SHELF.y, 0.16), Math.PI / 2, 0.08, bottle);
      const cap = buildProduct('oil_cap');
      bottle.add(cap);
      pp.cap = cap; pp.open = false;
    }
    void g;
  }

  // ------------------------------------------------------------------------------------------ simulation
  protected simulate(dt: number): void {
    const g = this.g, s = g.stove;
    this.time += dt;
    // hide the cabin's decorative coffee pot and pot (ours sit on the plate now)
    if (Math.floor(this.time) !== Math.floor(this.time - dt) || this.time === dt) {
      const host = this.stoveObj.parent!;
      const topW = (g.cabin!.anchors.stove_top as THREE.Object3D).getWorldPosition(_t1);
      for (const c of host.children) if ((c.name === 'coffeepot' || c.name === 'pot_enamel_01') && c.getWorldPosition(_t2).distanceTo(topW) < 0.6) c.visible = false;
      clearInteractables(g.cabin!.anchors.stove_top as THREE.Object3D);
    }
    // the draft: the real stove's fire level follows the air you give it
    if (s.lit) {
      const base = s.fuel > 0 ? Math.min(1, 0.25 + s.fuel / 10) : s.kindling > 0 ? 0.25 : 0.05;
      const target = clamp(base * (0.45 + this.draft * 1.1) + this.flare * 0.45, 0.04, 1);
      s.level += (target - s.level) * Math.min(1, dt * 0.6);
      s.fuel = Math.max(0, s.fuel - dt * g.timeScale * (2.2 / 3600) * Math.max(0, this.draft - 0.5) * 1.4);
    }
    this.flare = Math.max(0, this.flare - dt / 22);
    if (this.draftDisc) {
      this.draftDisc.rotation.z = this.draft * 2.2;
      const pm = this.draftDisc.userData.ports as THREE.MeshBasicMaterial;
      const k = s.lit ? (0.25 + s.level) * (0.2 + this.draft) : 0;
      pm.color.setRGB(Math.min(1, 1.0 * k + 0.05), Math.min(1, 0.45 * k + 0.03), 0.12 * k + 0.02);
    }
    const stoveHeat = s.lit ? 40 + s.level * 260 : 0;
    for (const v of this.vessels) this.heatVessel(v, dt, stoveHeat);
    let fire = 0;
    for (const v of [this.skillet, this.pot]) { this.cookFry(v, dt); fire = Math.max(fire, v.fat?.fire ?? 0); }
    this.cookPot(dt);
    this.brew(dt);
    this.smokeRack(dt);
    for (const f of this.foods) this.placeFood(f, dt);
    for (const v of [this.skillet, this.pot]) for (const p of v.piles) this.placePile(p, v, dt);
    this.bits.update(dt);
    for (const v of [this.skillet, this.pot]) if (v.liquid) v.liquid.mat.userData.uTime.value = G.uTime.value;
    // the work light flickers orange while a pan burns
    if (fire > 0.02) { this.fill.color.setRGB(1, 0.55 + 0.15 * Math.sin(this.time * 31), 0.25); this.fill.intensity = Math.max(this.fill.intensity, 1.4 + Math.sin(this.time * 17) * 0.4); }
    else this.fill.color.setHex(0xffe0c0);
    this.miniCard(dt);
    // the pour stream fades when nothing poured this frame
    this.streamOn = Math.max(0, this.streamOn - dt * 8);
    this.stream.visible = this.streamOn > 0.05;
  }

  private heatAt(p: THREE.Vector3): number {
    if (p.x < PLATE.x0 - 0.02 || p.x > PLATE.x1 + 0.02 || p.z < PLATE.z0 - 0.02 || p.z > PLATE.z1 + 0.02 || p.y < PLATE.y - 0.05 || p.y > PLATE.y + 0.05) return 0;
    const dx = p.x / 0.32, dz = (p.z - 0.2) / 0.5;
    return clamp(1 - dx * dx - dz * dz, 0.3, 1);
  }

  private heatVessel(v: Vessel, dt: number, stoveHeat: number): void {
    v.heat = this.heatAt(v.pos);
    if (v.pinT !== null) { v.T = v.pinT; return; }
    const lid = !!v.lid;
    const wet = v.kind === 'coffee' ? v.water > 0.05 : v.wet > 0.05;
    // a lid keeps the heat in: a pot under a lid comes to the boil sooner
    const target = 20 + stoveHeat * v.heat * (lid ? 1.12 : 1);
    const tau = (v.kind === 'skillet' ? 14 : v.kind === 'pot' ? 16 : 11) * (lid ? 0.7 : 1) * (wet ? 1 + Math.min(1.5, v.wet) * 0.6 : 1);
    v.T += (target - v.T) * Math.min(1, dt / tau);
    // the fire under a burning pan heats it further
    if (v.fat && v.fat.fire > 0.05) v.T = Math.min(400, v.T + dt * 8 * v.fat.fire);
    if (wet) {
      const thick = v.has('syrup') > 3 && v.water < 0.15 ? 112 : v.has('beans') + v.has('peas') + v.has('macaroni') + v.has('oats') > 0 && v.water < 0.05 ? 106 : 100;
      v.T = Math.min(v.T, thick);
    }
  }

  /** frying: fat, pieces and piles in a pan (the skillet, or a pot with no liquid in it) */
  private cookFry(v: Vessel, dt: number): void {
    const T = v.T, fat = v.fat!;
    const lidOn = !!v.lid;
    const ign = fat.update(dt, T, lidOn);
    if (ign) this.onFire(v);
    if (fat.fire > 0.02 && lidOn && !v.calls.has('smother')) { v.calls.add('smother'); }
    if (fat.fire <= 0 && v.calls.has('smother')) { v.calls.delete('smother'); v.calls.delete('fire'); this.log.push({ k: 'smother', v: v.kind }); if (this.active) this.say('Smothered. The lid did it.', 2.5); puffs.emit(this.W(_t1.copy(v.pos).add(_t2.set(0, 0.1, 0))), V3(0, 0.3, 0), { size: 0.05, grow: 3, life: 2.5, color: new THREE.Color(0.25, 0.23, 0.22), alpha: 0.5, rise: 0.3, n: 4 }); }
    if (v.kind === 'pot' && v.wet > 0.05) { this.fatFx(v, dt, 0, 0); return; }
    const f = Math.pow(Math.max(0, (T - 105) / 75), 1.2);
    const fatK = fat.total > 2 ? (fat.total > 60 ? 1.35 : 1) : 1.25;
    const potK = v.kind === 'pot' ? 0.85 : 1;
    let wet = 0, meat = 0, burning = 0;
    const cold = fat.total > 2 && T < 130;
    for (const food of v.foods) {
      if (food.flip) continue;
      const k = FOOD_RATE[food.kind];
      const r = k.rate * f * fatK * potK * (food.kind === 'bacon' ? 0.01 / Math.max(0.006, food.h) : 1);
      food.addDown(r * dt, r * k.top * dt * (lidOn ? 4 : 1) + (lidOn ? r * 0.25 * dt : 0));
      if (food.kind === 'dough' && T > 230) food.addDown(r * 0.4 * dt, 0);
      if (fat.fire > 0.1) food.addDown(dt * 0.08 * fat.fire, dt * 0.05 * fat.fire);
      if (cold && !food.seared) { food.greasy = Math.min(1, food.greasy + dt * 0.012); fat.consume(dt * 0.12); }
      food.setDone();
      if (food.done > 0.6 && v.wet < 0.05 && fat.total + fat.solid > 1) v.browned.add(food.key);
      wet += k.wet * Math.max(0, 1 - food.done);
      if (food.kind === 'bacon' || food.kind === 'meat' || food.kind === 'sausage') { meat++; if (T > 120) fat.pour('drip', dt * (food.kind === 'bacon' ? 0.09 : 0.04), food.local.x, food.local.y); }
      if (food.worst > 1.25) burning++;
      this.cue(food, v);
    }
    for (const p of v.piles) {
      if (p.kind === 'cheese') { p.melt = Math.min(1, p.melt + dt * Math.max(0, T - 60) / 300); p.mat.userData.uMelt.value = p.melt; continue; }
      const sizeK = clamp(0.009 / Math.max(0.002, p.min), 0.45, 2.2);
      const r = (PILE_RATE[p.kind] ?? 0.04) * f * fatK * potK * sizeK * (p.units > 1.5 ? 0.8 : 1);
      p.b += r * dt; p.a += r * 0.14 * dt;
      if (fat.fire > 0.1) { p.b += dt * 0.08 * fat.fire; p.a += dt * 0.05 * fat.fire; }
      if (cold && !p.seared) { p.greasy = Math.min(1, p.greasy + dt * 0.012); fat.consume(dt * 0.1); }
      p.setDone();
      p.mat.userData.uOil.value = Math.min(1, fat.total / 30) * 0.6;
      if (p.done > 0.55 && v.wet < 0.05 && fat.total + fat.solid > 1) v.browned.add(p.key);
      wet += 0.7 * Math.max(0, 1 - p.done) * Math.min(2, p.units);
      if (p.worst > 1.25) burning++;
      this.pileCue(p, v);
    }
    // fat thins out (and eventually evaporates as smoke) when very hot
    if (T > 240 && fat.total > 0) fat.consume(dt * 0.25 * (T - 240) / 60);
    this.fatFx(v, dt, wet, meat);
    if (burning && Math.random() < dt * 6 * burning) puffs.emit(this.W(_t1.copy(v.pos)).add(_t2.set((Math.random() - 0.5) * 0.1, 0.03, (Math.random() - 0.5) * 0.1)), V3(0, 0.3, 0), { size: 0.03, grow: 3, life: 2, color: new THREE.Color(0.22, 0.2, 0.19), alpha: 0.35, rise: 0.25 });
  }

  /** sizzle, steam, spit, shimmer smoke, flames */
  private fatFx(v: Vessel, dt: number, wet: number, meat: number): void {
    const fat = v.fat!, T = v.T;
    const at = this.W(_t3.copy(v.pos).add(_t2.set(0, 0.03, 0)));
    const fry = v.kind === 'skillet' || v.wet < 0.05;
    const sizzle = fry ? clamp((T - 110) / 90, 0, 1) * clamp(wet * 0.6 + Math.min(1, fat.total / 20) * 0.8 + meat * 0.2, 0, 1.2) : 0;
    this.loop(v, 'voice', 'pan_fry', sizzle * 0.9, 0.9 + sizzle * 0.2);
    if (sizzle > 0.05 && Math.random() < dt * 14 * sizzle) puffs.emit(_t1.copy(at).add(_t2.set((Math.random() - 0.5) * 0.14, 0.02, (Math.random() - 0.5) * 0.14)), V3(0, 0.18, 0), { size: 0.022, grow: 2.2, life: 1.1, color: new THREE.Color(0.86, 0.86, 0.84), alpha: 0.18 * sizzle, rise: 0.15 });
    // spitting fat: more of it with wet food and as the oil gets hotter; past 250 C it really splatters
    const spit = fry ? clamp((T - 150) / 70, 0, 1.6) * (Math.min(1, fat.total / 15) * 4 + meat * 1.2 + (v.foods.length + v.piles.length ? 0.5 : 0)) : 0;
    if (spit > 0 && Math.random() < dt * spit * 18) {
      const a = Math.random() * 6.28, rr = Math.random() * 0.09, big = T > 250;
      const p = at.clone().add(V3(Math.cos(a) * rr, -0.015, Math.sin(a) * rr));
      this.bits.emit(p, V3(0, (big ? 1.2 : 0.7) + Math.random() * 0.8, 0), { color: new THREE.Color(0.86, 0.68, 0.34), size: big ? 0.0034 : 0.0024, life: 1.2, stay: 1.6, spread: big ? 2 : 1.2, n: big ? 3 : 1 + Math.floor(Math.random() * 2), floor: (q) => this.floorAt(q) });
      if (big && this.active && Math.random() < 0.08 && !v.calls.has('ow') && this.drag && (this.drag.kind === 'flip' || this.drag.kind === 'carry' || this.drag.kind === 'toss')) { v.calls.add('ow'); this.pop('Ow! Hot fat', at.clone().add(V3(0, 0.08, 0)), '#ff9070'); this.g.sound('hurt', undefined, 0.25); setTimeout(() => v.calls.delete('ow'), 6000); }
    }
    // shimmer, then smoke: thin blue-grey wisps rising off the pool
    if (fat.smoke > 0.02 && Math.random() < dt * 10 * fat.smoke) {
      const pr = fat.pool.r;
      puffs.emit(this.W(_t1.set(v.pos.x + fat.pool.x + (Math.random() - 0.5) * pr, v.pos.y + v.floor + 0.01, v.pos.z + fat.pool.z + (Math.random() - 0.5) * pr)), V3(0, 0.25, 0), { size: 0.02, grow: 3.5, life: 2.2, color: new THREE.Color(0.62, 0.62, 0.66), alpha: 0.14 + 0.2 * Math.min(1, fat.smoke), rise: 0.3 });
    }
    if (fat.smoke > 0.4 && !v.calls.has('smoke') && this.active) { v.calls.add('smoke'); this.pop('Smoking! Too hot', at.clone().add(V3(0, 0.08, 0)), '#ffb070'); }
    if (fat.smoke < 0.05) v.calls.delete('smoke');
    if (fat.shimmer > 0.5 && fat.smoke < 0.05 && !v.calls.has('shimmer') && this.active && fat.total > 3) { v.calls.add('shimmer'); this.pop('Shimmering: hot enough', at.clone().add(V3(0, 0.07, 0)), '#ffe08a'); }
    if (fat.shimmer < 0.1) v.calls.delete('shimmer');
    if (fat.fire > 0.02) {
      if (Math.random() < dt * 14) puffs.emit(_t1.copy(at).add(_t2.set((Math.random() - 0.5) * 0.08, 0.12 + Math.random() * 0.08, (Math.random() - 0.5) * 0.08)), V3(0, 0.45, 0), { size: 0.04, grow: 3.2, life: 2.4, color: new THREE.Color(0.1, 0.09, 0.08), alpha: 0.5, rise: 0.4 });
      if (Math.random() < dt * 20) this.bits.emit(at.clone().add(V3(0, 0.05, 0)), V3(0, 0.9, 0), { color: new THREE.Color(1, 0.6, 0.2), size: 0.003, life: 0.8, spread: 0.6, glow: 1 });
    }
    this.loop(v, 'fireVoice', 'fire_camp', fat.fire > 0.02 ? 0.55 * Math.min(1, fat.fire) : 0, 1.2);
  }

  private onFire(v: Vessel): void {
    v.calls.add('fire');
    this.log.push({ k: 'fire', v: v.kind });
    this.g.sound('fire_ignite', this.W(_t1.copy(v.pos)), 0.9);
    if (this.active) { this.say('Grease fire! Get the lid on it. Not water!', 3.5); this.pop('FIRE!', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.2, 0)), '#ff6030'); }
  }

  /** timing feedback floating at the food */
  private cue(f: Food, v: Vessel): void {
    const at = () => this.W(this.foodWorldLocal(f, v)).add(_t2.set(0, 0.03, 0)).clone();
    const once = (k: string, t: string, c?: string) => { if (!f.calls.has(k)) { f.calls.add(k); if (this.active) this.pop(t, at(), c); } };
    const canFlip = f.kind !== 'egg' && f.kind !== 'shroom' && f.kind !== 'pastry' && f.kind !== 'dumpling';
    if (canFlip && f.down > 0.8 && f.up < 0.5) once(`flip${f.flipped ? 1 : 0}`, f.kind === 'flapjack' ? 'Bubbles popping: flip it' : 'Flip it', '#ffe08a');
    if (f.down > 0.78 && f.up > 0.7 && f.worst < 1.05) once('golden', 'Golden', '#ffd070');
    if (f.kind === 'egg' && f.b > 0.75 && f.a > 0.45) once('set', 'Whites set', '#fff0c0');
    if (f.worst > 1.08) once('brown', 'Getting dark', '#e0a060');
    if (f.worst > 1.32) once('burn', 'Burning!', '#ff7050');
  }
  private pileCue(p: Pile, v: Vessel): void {
    const at = () => this.W(_t1.copy(v.pos).add(_t2.set(p.obj.position.x - v.pos.x, 0.05, p.obj.position.z - v.pos.z))).clone();
    const once = (k: string, t: string, c?: string) => { if (!p.calls.has(k)) { p.calls.add(k); if (this.active) this.pop(t, at(), c); } };
    if (p.b > 0.75 && p.a < 0.4) once('stir', `Stir the ${KEY_NAME[p.key] ?? p.key}`, '#ffe08a');
    if (Math.min(p.a, p.b) > 0.7 && p.worst < 1.08) once('golden', 'Golden', '#ffd070');
    if (p.worst > 1.1) once('brown', 'Catching', '#e0a060');
    if (p.worst > 1.32) once('burn', 'Burning!', '#ff7050');
  }

  /** the pot: liquid, simmering, things in it */
  private cookPot(dt: number): void {
    const v = this.pot, T = v.T, P = v.pot;
    const wet = v.wet;
    const lid = !!v.lid;
    if (lid) P.lidSecs += dt;
    if (wet > 0.05) {
      if (!v.liquid) this.potLiquid(v);
      const boil = smooth(70, 100, T);
      if (T > 86) P.simmer += dt * (lid ? 1.3 : 1);
      if (T >= 99) P.boil += dt;
      // boils down (much slower under a lid)
      if (T >= 96) v.water = Math.max(0, v.water - dt * (lid ? 0.0007 : 0.0035) * (0.4 + boil));
      // grains drink the water as they cook
      const grains = v.has('rice') + v.has('macaroni') * 0.6 + v.has('peas') * 0.8 + v.has('oats') * 0.8;
      if (grains > 0 && T > 85) v.water = Math.max(0, v.water - dt * 0.0012 * grains);
      P.progress += dt * smooth(85, 100, T) * 0.016;
      P.sinceStir += dt;
      const thick = grains + v.has('beans') + v.has('tomatoes') * 0.5 + (v.has('cheese') > 0 ? 0.5 : 0);
      // it catches on the bottom when it isn't stirred: thick things fast, a watery stew hardly at all
      const catchK = v.water < 0.05 ? 0.06 : v.water < 0.15 || thick > 1 ? 0.025 : 0.0018;
      if (T > 95 && P.sinceStir > (v.water < 0.12 || thick > 1 ? 10 : 30)) P.scorch = Math.min(1.5, P.scorch + dt * catchK);
      // things in the pot cook through (no browning in liquid)
      const k = 0.02 * smooth(80, 100, T);
      for (const f of v.foods) {
        const steam = lid ? 1 : f.kind === 'dumpling' ? 0.35 : 1;
        f.a = Math.min(0.95, f.a + k * dt * steam); f.b = Math.min(0.95, f.b + k * dt); f.setDone();
      }
      for (const p of v.piles) {
        if (p.kind === 'cheese') { p.melt = Math.min(1, p.melt + dt * Math.max(0, T - 55) / 250); p.mat.userData.uMelt.value = p.melt; p.obj.scale.setScalar(Math.max(0.05, 1 - p.melt)); continue; }
        const sizeK = clamp(0.012 / Math.max(0.003, p.min), 0.5, 2);
        p.a = Math.min(0.95, p.a + k * dt * sizeK); p.b = Math.min(0.95, p.b + k * dt * sizeK); p.setDone();
      }
      if (v.liquid) {
        const L = v.liquid.mat.userData;
        L.uBoil.value = boil;
        L.uScorch.value = Math.min(1, P.scorch);
        P.spin *= Math.exp(-dt * 0.8);
        L.uSpin.value += P.spin * dt;
        if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.tintLiquid(v);
        v.liquid.mesh.position.y = this.liquidY(v);
        const r = Math.min(0.09, 0.08 + (v.liquid.mesh.position.y - 0.02) * 0.08);
        v.liquid.mesh.scale.set(r / 0.086, 1, r / 0.086);
      }
      if (P.progress > 1 && !v.calls.has('ready')) { v.calls.add('ready'); if (this.active) this.pop('Simmering nicely', this.W(_t1.copy(v.pos).add(_t2.set(0, 0.15, 0))).clone(), '#ffe08a'); }
      if (P.scorch > 0.3 && !v.calls.has('scorch')) { v.calls.add('scorch'); if (this.active) this.pop('Sticking! Stir it', this.W(_t1.copy(v.pos).add(_t2.set(0, 0.15, 0))).clone(), '#ff8a60'); }
      if (v.water < 0.03 && grains > 0 && T > 100 && !v.calls.has('dry')) { v.calls.add('dry'); if (this.active) this.pop('Boiling dry!', this.W(_t1.copy(v.pos).add(_t2.set(0, 0.15, 0))).clone(), '#ff8a60'); }
      const boiling = smooth(92, 100, T);
      this.loop(v, 'boilVoice', 'pot_boil', boiling * 0.7, 0.9 + boiling * 0.15);
      // steam: wisps from 60 C, clouds at a rolling boil (out under the lid's rim)
      const steam = smooth(60, 100, T);
      if (steam > 0.1 && Math.random() < dt * (2 + 8 * boiling) * steam) puffs.emit(this.W(_t1.copy(v.pos).add(_t2.set((Math.random() - 0.5) * 0.08, lid ? 0.13 : 0.12, (Math.random() - 0.5) * 0.08))), V3(0, 0.18, 0), { size: 0.03, grow: 2.5, life: 1.4, color: new THREE.Color(0.9, 0.9, 0.9), alpha: 0.08 + 0.18 * boiling, rise: 0.2 });
      // a rolling boil spits droplets over the rim; a lid rattles
      if (boiling > 0.9 && Math.random() < dt * 3) this.bits.emit(this.W(_t1.copy(v.pos).add(_t2.set((Math.random() - 0.5) * 0.1, 0.1, (Math.random() - 0.5) * 0.1))), V3(0, 0.5, 0), { color: new THREE.Color(0.8, 0.82, 0.84), size: 0.0025, life: 0.6, spread: 0.8, n: 1, floor: (q) => this.floorAt(q) });
      if (lid && boiling > 0.9 && Math.random() < dt * 1.5) audio.play('pot_lid', { pos: this.W(_t1.copy(v.pos)), vol: 0.12, rate: 1.5 });
    } else {
      if (v.liquid) { v.obj.remove(v.liquid.mesh); v.liquid = null; }
      this.loop(v, 'boilVoice', 'pot_boil', 0, 1);
    }
  }

  /** the pot's liquid surface height (local to the pot) */
  private liquidY(v: Vessel): number {
    const vol = v.wet + v.has('rice') * 0.12 + v.has('macaroni') * 0.12 + v.has('peas') * 0.15 + v.has('oats') * 0.1;
    return clamp(0.012 + vol * 0.045, 0.014, 0.1);
  }

  /** the colour of what's in the pot */
  private tintLiquid(v: Vessel): void {
    if (!v.liquid) return;
    const parts: [number, [number, number, number]][] = [
      [v.water, [0.62, 0.68, 0.7]], [v.has('bouillon') * 0.25 + (v.browned.size ? 0.1 : 0), [0.45, 0.27, 0.12]], [v.has('tomatoes') * 0.8, [0.72, 0.16, 0.08]],
      [v.has('milk') * 0.25, [1.05, 1.03, 0.98]], [v.has('peas') * 0.3 * Math.min(1, v.pot.simmer / 60 + 0.3), [0.88, 0.72, 0.28]], [v.has('beans') * 0.4, [0.6, 0.26, 0.12]],
      [v.has('syrup') * 0.03, [0.62, 0.34, 0.08]], [v.has('berries') * 0.12, [0.34, 0.12, 0.36]], [v.has('oats') * 0.25, [0.92, 0.84, 0.66]], [v.has('rice') * 0.2, [1, 1, 0.96]],
      [v.has('macaroni') * 0.15, [1, 0.92, 0.66]], [v.piles.filter((p) => p.kind === 'cheese').reduce((s, p) => s + p.melt * 0.4, 0), [1.05, 0.72, 0.18]],
    ];
    let w = 0; const c = [0, 0, 0];
    for (const [k, col] of parts) { if (k <= 0) continue; w += k; c[0] += col[0] * k; c[1] += col[1] * k; c[2] += col[2] * k; }
    if (w <= 0) return;
    const sc = v.pot.scorch > 0.5 ? 0.85 : 1;
    v.liquid.mat.color.setRGB(c[0] / w * sc, c[1] / w * sc, c[2] / w * sc);
    const thick = v.has('beans') + v.has('peas') + v.has('oats') + v.has('rice') + v.has('tomatoes') * 0.5 + v.piles.length * 0.2;
    v.liquid.mat.userData.uBumps.value = clamp(thick / 2, 0, 1);
    v.liquid.mat.roughness = 0.12 + clamp(thick / 3, 0, 0.3);
  }

  private potLiquid(v: Vessel): void {
    if (v.liquid) return;
    const mat = liquidMat('mix');
    const mesh = new THREE.Mesh(discGeo(0.086, 22), mat);
    mesh.position.y = this.liquidY(v);
    mesh.renderOrder = 1;
    v.obj.add(mesh);
    v.liquid = { mesh, mat };
    this.tintLiquid(v);
  }

  /** the coffee pot: coffee boiled with the grounds, or tea leaves steeped */
  private brew(dt: number): void {
    const v = this.coffee, C = v.coffee;
    C.maxT = Math.max(C.maxT, v.T);
    const boiling = v.water > 0.05 && v.T >= 99;
    if (C.grounds) {
      if (boiling) { C.boil += dt; C.settle = 0; }
      else if (C.boil > 0.5 || C.grounds !== 'coffee') C.settle += dt;
      if (C.grounds !== 'coffee' && v.T > 75) C.steep += dt;
    }
    const k = boiling ? 1 : smooth(85, 99, v.T) * 0.4;
    this.loop(v, 'boilVoice', 'pot_boil', k * 0.45, 1.25);
    if (k > 0.3 && Math.random() < dt * 6 * k) puffs.emit(this.W(_t1.copy(v.pos).add(_t2.set(0, 0.14, 0.11))), V3(0, 0.15, 0.05), { size: 0.02, grow: 2.5, life: 1.2, color: new THREE.Color(0.92, 0.92, 0.92), alpha: 0.22 * k, rise: 0.2 });
    const lid = v.obj.userData.lid as THREE.Object3D;
    if (lid) lid.rotation.x += ((boiling ? -0.08 - Math.abs(Math.sin(this.time * 23)) * 0.06 : 0) + (lid.userData.open ? -1.6 : 0) - lid.rotation.x) * Math.min(1, dt * 14);
    if (boiling && Math.random() < dt * 1.2) audio.play('pot_lid', { pos: this.W(_t1.copy(v.pos)), vol: 0.15, rate: 1.4 });
    const at = () => this.W(_t1.copy(v.pos).add(_t2.set(0, 0.2, 0))).clone();
    if (C.grounds === 'coffee' && boiling && C.boil > 1 && !v.calls.has('pull')) { v.calls.add('pull'); if (this.active) this.pop('Pull it off the heat', at(), '#ffe08a'); }
    if (C.grounds === 'coffee' && C.settle > 4 && !v.calls.has('settled')) { v.calls.add('settled'); if (this.active) this.pop('Settled. Pour it', at(), '#ffe08a'); }
    if (C.grounds && C.grounds !== 'coffee' && C.steep > 20 && !v.calls.has('steeped')) { v.calls.add('steeped'); if (this.active) this.pop('Steeped. Pour it', at(), '#ffe08a'); }
    if (C.grounds === 'labtea' && boiling && C.boil > 2 && !v.calls.has('rolling')) { v.calls.add('rolling'); if (this.active) this.pop('Don\'t boil it!', at(), '#ff9070'); }
  }

  private smokeRack(dt: number): void {
    const s = this.g.stove;
    const smoke = s.lit ? (0.35 + (1 - this.draft) * 0.9) * (0.3 + s.level * 0.7) : 0;
    for (const f of this.rackStrips) {
      f.smoke = Math.min(1, f.smoke + dt * this.g.timeScale * smoke / (3 * 3600));
      f.a = f.b = 0.6 + f.smoke * 0.7; f.setDone();
      for (const m of f.mats) m.color.setRGB(1 - f.smoke * 0.45, 1 - f.smoke * 0.55, 1 - f.smoke * 0.6);
    }
  }

  private loop(v: Vessel, key: 'voice' | 'boilVoice' | 'fireVoice', id: string, vol: number, rate: number): void {
    let voice = v[key];
    if (vol > 0.02) {
      if (!voice) { voice = audio.play(id, { pos: this.W(_t1.copy(v.pos)), loop: true, vol: 0, fadeIn: 0.3 }); v[key] = voice; }
      voice?.setVol(vol, 0.2); voice?.setRate(rate, 0.3); voice?.setPos(this.W(_t1.copy(v.pos)));
    } else if (voice) { voice.stop(0.4); v[key] = null; }
  }

  private floorAt(pw: THREE.Vector3): number {
    const p = this.L(pw, _t1);
    let y = -Infinity;
    if (p.x > PLATE.x0 && p.x < PLATE.x1 && p.z > PLATE.z0 && p.z < PLATE.z1) y = PLATE.y;
    const s = this.skillet;
    if (Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 0.1) y = s.pos.y + 0.008;
    if (p.x > COUNTER.x0 && p.x < COUNTER.x1 && p.z > COUNTER.z0 && p.z < COUNTER.z1) y = COUNTER.y;
    if (p.x > PANTRY.x0 && p.x < PANTRY.x1 && p.z > PANTRY.z0 && p.z < PANTRY.z1) y = PANTRY.y;
    if (y === -Infinity) return -Infinity;
    return this.W(_t2.set(p.x, y, p.z)).y;
  }

  // ------------------------------------------------------------------------------------------ placing food
  private foodWorldLocal(f: Food, v: Vessel | null, out = new THREE.Vector3()): THREE.Vector3 {
    if (v) return out.copy(v.pos).add(_t3.set(f.local.x, v.floor + f.lift0, f.local.y));
    return out.set(f.local.x, 0, f.local.y);
  }
  private vesselOf(f: Food): Vessel | null { return f.where === 'skillet' ? this.skillet : f.where === 'pot' ? this.pot : null; }
  private placeFood(f: Food, dt: number): void {
    if (f.where === 'hand' || f.where === 'gone') return;
    const o = f.obj;
    const base = _t1;
    if (f.where === 'board') this.boardSurface(f.local, base);
    else if (f.where === 'plate') base.copy(this.served?.obj.position ?? SERVE).add(_t2.set(f.local.x, (this.served?.obj === this.dishBowl ? 0.045 : 0.022) + f.lift0, f.local.y));
    else if (f.where === 'rack') base.copy(this.rack.position).add(_t2.set(f.local.x, -0.004, 0.025));
    else {
      const v = this.vesselOf(f)!;
      this.foodWorldLocal(f, v, base);
      if (f.where === 'pot' && v.wet > 0.05) {
        base.y = v.pos.y + this.liquidY(v) - f.h * 0.4 + Math.sin(this.time * 2 + f.local.x * 40) * 0.003;
        const a = v.pot.spin * dt;
        f.local.rotateAround(_v2zero, a * 0.6);
        f.yaw += a;
      }
    }
    let lift = 0, roll = 0;
    if (f.flip) {
      f.flip.t += dt;
      const k = Math.min(1, f.flip.t / f.flip.dur);
      lift = Math.sin(k * Math.PI) * f.flip.h;
      roll = (f.flip.ok ? Math.PI : Math.PI * 0.5 * Math.sin(k * Math.PI)) * k;
      f.local.lerpVectors(f.flip.from, f.flip.to, k);
      if (k >= 1) {
        if (f.flip.ok) f.flipped = !f.flipped;
        roll = 0;
        const v = this.vesselOf(f);
        if (v && this.active) {
          audio.play('pan_fry', { pos: this.W(_t2.copy(v.pos)), vol: 0.25, rate: 1.3 });
          this.bits.emit(this.W(this.foodWorldLocal(f, v)).add(_t2.set(0, 0.01, 0)), V3(0, 0.8, 0), { color: new THREE.Color(0.86, 0.68, 0.34), size: 0.003, life: 1, stay: 1.5, spread: 1.6, n: 6, floor: (q) => this.floorAt(q) });
        }
        f.flip = null;
      }
    }
    if (f.where === 'rack') {
      o.position.copy(base);
      o.rotation.set(Math.PI / 2 + Math.sin(this.time * 1.3 + f.local.x * 20) * 0.04, 0, 0);
      return;
    }
    o.position.copy(base);
    o.position.y += lift + (f.flipped ? f.h : 0);
    o.rotation.set(0, f.yaw, 0);
    if (f.flipped) o.rotateX(Math.PI);
    if (roll) o.rotateX(roll * (f.flipped ? -1 : 1));
  }
  private placePile(p: Pile, v: Vessel, dt: number): void {
    const o = p.obj;
    o.position.set(v.pos.x, v.pos.y + v.floor, v.pos.z);
    if (v.kind === 'pot' && v.wet > 0.05) {
      o.position.y = v.pos.y + this.liquidY(v) - 0.013 + Math.sin(this.time * 1.7 + p.units) * 0.002;
      o.rotation.y += v.pot.spin * dt * 0.6;
    }
  }

  private boardSurface(local: THREE.Vector2, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.board.position).add(_t3.set(local.x, 0.041, local.y));
  }

  /** a free spot inside a vessel for a piece of radius r */
  private freeSpot(v: Vessel, r: number): THREE.Vector2 {
    const R = Math.max(0, v.inner - r * 0.8);
    let best = new THREE.Vector2(), bestD = -1;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * R;
      const p = new THREE.Vector2(Math.cos(a) * d, Math.sin(a) * d);
      let m = 9;
      for (const f of v.foods) m = Math.min(m, p.distanceTo(f.local) - f.r * 0.8 - r * 0.8);
      if (m > bestD) { bestD = m; best = p; }
      if (m > 0.01) break;
    }
    return best;
  }

  private boardBusy(): boolean { return !!this.stock || !!this.produce || this.foods.some((f) => f.where === 'board'); }

  // ------------------------------------------------------------------------------------------ work (input)
  protected work(dt: number): void {
    const p = this.ptr;
    this.hover = null;
    if (this.cardOpen !== null) { this.cardsUpdate(); this.label = this.hover; this.handsIdle(); return; }
    if (this.act) { this.actUpdate(dt); this.label = this.hover; this.handsIdle(); return; }
    this.edgeScroll(dt);
    if (this.drag) this.dragUpdate(dt);
    else this.idle(dt);
    if (p.rpressed && !this.drag) this.secondary();
    this.leanIn();
    this.label = this.hover;
    this.handsIdle();
  }

  /** lean in over the board while cutting (or with the cursor on what's there), over a pan while stirring */
  private leanIn(): void {
    if (this.leanPinned) return;
    const d = this.drag;
    let want: CookingStation['lean'] = null;
    if (this.viewName === 'prep') {
      if (d && ['chop', 'peel', 'press', 'cut', 'knead'].includes(d.kind)) want = 'board';
      else if (d && d.kind === 'scrape' && !d.carried) want = 'board';
      else if (!d && this.overBoard) want = 'board';
    }
    if (this.viewName === 'stove' && d && ((d.kind === 'stir' && d.v) || d.kind === 'toss' || d.kind === 'flip')) want = d.v!.kind === 'skillet' ? 'skillet' : 'pot';
    if (want === this.lean) return;
    this.lean = want;
    this.setView(want ? this.leanView(want) : this.worldView(this.viewName));
  }
  private leanView(k: 'board' | 'skillet' | 'pot'): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    if (k === 'board') return { pos: this.W(V3(0.565, 1.17, 0.42)), look: this.W(V3(0.565, 0.79, 0.0)), fov: 46 };
    const v = k === 'skillet' ? this.skillet : this.pot;
    return { pos: this.W(v.pos.clone().add(k === 'pot' ? V3(0.04, 0.36, 0.28) : V3(0.03, 0.33, 0.26))), look: this.W(v.pos.clone().add(V3(0, 0.03, 0))), fov: 48 };
  }

  private edgeScroll(dt: number): void {
    const p = this.ptr;
    const dirs: Record<ViewName, { l?: ViewName; r?: ViewName; d?: ViewName; u?: ViewName }> = {
      larder: { r: 'pantry' }, pantry: { l: 'larder', r: 'stove' }, stove: { l: 'pantry', r: 'prep', d: 'door' }, prep: { l: 'stove' }, door: { u: 'stove' },
    };
    const d = dirs[this.viewName];
    const want = p.x > 0.9 ? d.r : p.x < -0.9 ? d.l : p.y < -0.88 ? d.d : p.y > 0.88 ? d.u : undefined;
    if (want) { this.edgeT += dt; if (this.edgeT > 0.3) { this.goView(want); this.edgeT = -0.4; } }
    else this.edgeT = Math.min(0, this.edgeT + dt);
  }
  private goView(n: ViewName): void {
    if (n === this.viewName) return;
    const from = this.viewName;
    const order: ViewName[] = ['larder', 'pantry', 'stove', 'prep'];
    this.viewName = n;
    this.lean = null; this.leanPinned = false;
    this.setView(this.worldView(n));
    const fi = order.indexOf(from), ni = order.indexOf(n);
    if (fi >= 0 && ni >= 0) this.ptr.x = ni > fi ? -0.3 : 0.3;
    else if (n === 'door') this.ptr.y = 0.1;
    else if (from === 'door') this.ptr.y = -0.55;
    if (this.script) { this.script.x = this.ptr.x; this.script.y = this.ptr.y; }
  }

  private pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    for (const f of this.foods) if (f.where !== 'gone' && f.where !== 'hand') list.push(f.obj);
    if (this.stock) list.push(this.stock.obj);
    if (this.produce) list.push(this.produce.obj);
    for (const v of this.vessels) { list.push(v.obj); for (const p of v.piles) list.push(p.obj); }
    for (const l of this.lids) list.push(l.obj);
    for (const pp of this.pantry) list.push(pp.obj);
    for (const pp of this.fixtures) list.push(pp.obj);
    list.push(this.boardHit, this.plateObj, this.mugObj, this.rack, this.bowlObj, this.recipeBox, this.pailObj);
    if (this.cardMini.mesh.visible) list.push(this.cardMini.mesh);
    if (this.served) list.push(this.served.hit);
    if (this.viewName === 'door' && this.doorPivot) list.push(this.doorPivot);
    return list;
  }

  private classify(h: THREE.Intersection | null): { kind: string; f?: Food; v?: Vessel; pp?: Pantry; pile?: Pile; lid?: Lid } | null {
    if (!h) return null;
    for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
      if (o === this.cardMini.mesh) return { kind: 'card' };
      const f = this.foods.find((x) => x.obj === o);
      if (f) return { kind: 'food', f };
      if (this.stock && o === this.stock.obj) return { kind: 'stock' };
      if (this.produce && o === this.produce.obj) return { kind: 'produce' };
      for (const v of this.vessels) { if (o === v.obj) return { kind: 'vessel', v }; const pile = v.piles.find((p) => p.obj === o); if (pile) return { kind: 'pile', v, pile }; }
      const lid = this.lids.find((l) => l.obj === o);
      if (lid) return { kind: 'lid', lid };
      const pp = this.pantry.find((x) => x.hit === o || x.obj === o) ?? this.fixtures.find((x) => x.hit === o || x.obj === o);
      if (pp) return { kind: 'pantry', pp };
      if (o === this.dipper || o === this.pailObj) return { kind: 'pantry', pp: this.fixtures.find((x) => x.id === 'water') };
      if (o === this.boardHit || o === this.board) return { kind: 'board' };
      if (o === this.bowlObj) return { kind: 'bowl' };
      if (o === this.recipeBox) return { kind: 'box' };
      if (o === this.plateObj) return { kind: 'plate' };
      if (o === this.mugObj) return { kind: 'mug' };
      if (this.served && o === this.served.hit) return { kind: 'served' };
      if (o === this.rack) return { kind: 'rack' };
      if (o === this.draftDisc) return { kind: 'draft' };
      if (o === this.doorPivot) return { kind: 'door' };
    }
    return null;
  }

  private nameOf(pp: Pantry): string {
    if (pp.id === 'lard_pail') return `Ray's lard pail (${this.lardPail} spoons)`;
    if (pp.id === 'water') return 'Water pail (the dipper)';
    if (pp.id === 'salt') return 'Salt shaker';
    if (pp.id === 'pepper') return 'Pepper mill';
    const n = ITEMS[pp.id]?.name ?? pp.id;
    const ing = pp.ing;
    if (!ing) return n;
    const l = this.leftOf(pp.id);
    return ing.uses > 1 ? `${n} (${l > 20 ? 'plenty' : `${Math.round(l)} ${ing.unit === 'egg' ? 'eggs' : ing.unit}`} left)` : n;
  }

  private idle(_dt: number): void {
    const p = this.ptr, g = this.g;
    const h = this.pick(this.pickables());
    const c = this.classify(h);
    const at = h?.point.clone() ?? null;
    const say = (t: string) => { if (at) this.hover = { text: t, at }; };
    this.overBoard = !!c && (c.kind === 'produce' || c.kind === 'stock' || (c.kind === 'food' && c.f!.where === 'board') || (c.kind === 'board' && !!(this.produce || this.stock)));
    if (!c) return;
    switch (c.kind) {
      case 'card': say('The pinned card (look closer)'); if (p.pressed) this.openCards(this.pinned ?? undefined); break;
      case 'box': say('Recipe box'); if (p.pressed) this.openCards(); break;
      case 'food': {
        const f = c.f!;
        if (f.where === 'skillet' || (f.where === 'pot' && this.pot.wet < 0.05)) {
          const v = this.vesselOf(f)!;
          say(f.kind === 'shroom' || f.kind === 'pastry' ? 'Nudge' : f.kind === 'egg' ? 'Flip it over easy (flick up)' : 'Flip (flick up)');
          if (p.pressed) this.startFlip(f, v);
        } else if (f.where === 'board') {
          if (f.kind === 'dough') {
            say(f.knead < 1 ? (f.dough === 'pastry' ? 'Press the pastry out' : 'Knead the dough') : f.dough === 'pastry' ? 'Pastry: lay it over the filling' : 'Into the skillet');
            if (p.pressed) { if (f.knead < 1) this.drag = { kind: 'knead', f, last: new THREE.Vector2(p.x, p.y), amt: 0 }; else this.startFoodDrag(f); }
          } else if (f.kind === 'trout' && f.u1 - f.u0 > 0.16) {
            say(f.u1 - f.u0 > 0.45 ? 'Cut it into steaks (draw the knife down)' : 'Cut  ·  tug sideways to take it');
            if (p.pressed) this.startCut('trout', f);
          } else if (f.kind === 'meat' || f.kind === 'bacon') {
            say('Take it  ·  draw the knife down to cube it');
            if (p.pressed) this.drag = { kind: 'press', what: 'strip', f, x0: p.x, y0: p.y };
          } else { say('Take it'); if (p.pressed) this.startFoodDrag(f); }
        } else if (f.where === 'pot') { say('Stir  ·  RMB taste'); if (p.pressed) this.drag = { kind: 'stir', v: this.pot, last: this.vesselAngle(this.pot), amt: 0, bowl: false }; }
        else if (f.where === 'plate') this.servedHover(say);
        else if (f.where === 'rack') say(f.smoke >= 1 ? 'Smoked. Take it' : `Smoking… ${Math.round(f.smoke * 100)}%`);
        if (f.where === 'rack' && p.pressed && f.smoke >= 1) this.takeJerky();
        break;
      }
      case 'pile': {
        const v = c.v!;
        if (v.kind === 'pot' && v.wet > 0.05) { say('Stir  ·  RMB taste'); if (p.pressed) this.drag = { kind: 'stir', v, last: this.vesselAngle(v), amt: 0, bowl: false }; }
        else { say(`Stir the ${KEY_NAME[c.pile!.key] ?? c.pile!.key} around  ·  RMB taste`); if (p.pressed) { this.inHand(this.turner); this.drag = { kind: 'toss', v, last: new THREE.Vector2(p.x, p.y), amt: 0 }; } }
        break;
      }
      case 'produce': {
        const pr = this.produce!;
        if (pr.needsPeel) { say(`Peel the ${pr.def.name} (drag across it)`); if (p.pressed) this.drag = { kind: 'peel', p: pr, last: new THREE.Vector2(p.x, p.y) }; break; }
        const halve = pr.def.halve && !pr.halved;
        const cut = pr.cuts > 0;
        say(halve ? 'Halve it (draw the knife down)' : `Chop: draw the knife down${cut ? ' · drag sideways to scrape it up' : ''} · RMB turn it`);
        if (p.pressed) this.drag = { kind: 'press', what: 'produce', p: pr, x0: p.x, y0: p.y };
        break;
      }
      case 'stock': {
        const st = this.stock!;
        say(st.kind === 'shroom' ? 'Chop' : st.kind === 'bacon' ? 'Slice the bacon' : 'Cut into strips');
        if (p.pressed) this.startCut('stock');
        break;
      }
      case 'vessel': {
        const v = c.v!;
        if (v.kind !== 'coffee' && h && this.L(h.point).y > v.pos.y + 0.02 && this.inVessel(v, h.point) && (v.wet > 0.05 || v.piles.length)) {
          say(v.wet > 0.05 ? 'Stir  ·  RMB taste' : 'Stir  ·  RMB taste'); if (p.pressed) { if (v.wet > 0.05) this.drag = { kind: 'stir', v, last: this.vesselAngle(v), amt: 0, bowl: false }; else { this.inHand(this.turner); this.drag = { kind: 'toss', v, last: new THREE.Vector2(p.x, p.y), amt: 0 }; } }
          break;
        }
        const T = Math.round(v.T);
        const fat = v.fat && v.fat.total > 1 ? `, ${Math.round(v.fat.total / 15)} tbsp ${v.fat.main === 'drip' ? 'bacon fat' : v.fat.main}` : '';
        say(`${v.kind === 'skillet' ? 'Skillet' : v.kind === 'pot' ? 'Pot' : 'Coffee pot'} (${T > 40 ? `${T} C` : 'cold'}${fat})  ·  drag it${v.empty ? '' : ' (onto the plate to serve)'}${v.kind !== 'coffee' && !v.empty ? '  ·  RMB taste' : ''}`);
        if (p.pressed) { this.drag = { kind: 'vessel', v, from: v.pos.clone() }; audio.play('pot_lid', { pos: this.W(_t1.copy(v.pos)), vol: 0.3, rate: 0.8 }); }
        break;
      }
      case 'lid': {
        const lid = c.lid!;
        say(lid.on ? `Take the lid off${lid.on.fat && lid.on.fat.fire > 0 ? ' (still burning!)' : ''}` : `${lid.kind === 'skillet' ? 'Skillet' : 'Pot'} lid`);
        if (p.pressed) { this.drag = { kind: 'lid', lid }; this.liftLid(lid); }
        break;
      }
      case 'pantry': {
        const pp = c.pp!;
        if (pp.id === 'oil' && !pp.open) { say('Canola oil: unscrew the cap'); if (p.pressed) this.uncap(pp); break; }
        say(pp.id === 'eggs' ? `Take an egg  (${this.leftOf('eggs')} left)` : pp.id === 'kindling' ? 'Kindling (for the stove door)' : this.nameOf(pp));
        if (p.pressed) {
          if (pp.id === 'eggs') this.startEgg(pp);
          else { this.drag = { kind: 'carry', p: pp, tgt: null, acc: 0, total: 0, lastDx: 0, pour: false }; audio.play('bag_rustle', { pos: this.W(_t1.copy(pp.home)), vol: 0.3 }); }
        }
        break;
      }
      case 'bowl': {
        const b = this.bowl;
        if (b.empty) { say('Mixing bowl (empty)'); break; }
        const kind = b.kind;
        const desc = kind === 'dry' ? 'dry goods' : kind === 'crumbly' ? (b.mix < 0.6 ? 'needs stirring' : 'crumbly: more liquid') : kind;
        if (h && this.L(h.point).y > BOWL_AT.y + 0.03 && b.mix < 1 && b.volume > 0.1) {
          say(`Stir (${desc})  ·  drag the rim to tip it  ·  RMB empty it`);
          if (p.pressed) { this.inHand(this.spoon); this.drag = { kind: 'stir', v: null, last: this.bowlAngle(), amt: 0, bowl: true }; }
        } else {
          say(`Bowl: ${desc}  ·  drag to tip it`);
          if (p.pressed) this.drag = { kind: 'bowl', tgt: null };
        }
        break;
      }
      case 'board':
        if (this.foods.some((f) => f.where === 'board' && f.kind !== 'dough')) { say('Tip the board into a pan'); if (p.pressed) this.drag = { kind: 'board' }; }
        else say(this.stock || this.produce ? '' : 'Cutting board');
        break;
      case 'plate': say(this.served ? '' : 'Serve here (drop a pan on it)'); break;
      case 'mug': say(this.poured ? 'Drink it  ·  RMB to take it' : 'Pour the coffee pot here'); if (this.poured && p.pressed) this.eatServed('mug'); break;
      case 'served': this.servedHover(say); break;
      case 'rack': say(this.rackStrips.length ? (this.rackStrips.every((f) => f.smoke >= 1) ? 'Take the smoked jerky' : 'Jerky smoking…') : 'Drying rack (hang meat strips)'); if (p.pressed) this.takeJerky(); break;
      case 'draft':
        say(`Draft ${this.draft < 0.3 ? 'nearly shut' : this.draft > 0.75 ? 'wide open' : 'half open'}  (drag)`);
        if (p.pressed) this.drag = { kind: 'draft', x0: p.x, d0: this.draft };
        break;
      case 'door': {
        const open = g.stove.doorOpen;
        say(!g.stove.lit ? (g.stove.kindling < 0.2 ? (g.owns('kindling') ? 'Lay kindling' : 'Needs kindling') : 'Strike a match') : open ? 'Close the door' : 'Open the door');
        if (p.pressed) {
          if (!g.stove.lit) g.placeAction('stove_feed', { held: '', point: h!.point, game: g } as never);
          else { const it = findInteractable(this.doorPivot); it?.it.use({ held: '', point: h!.point, game: g } as never); }
        }
        break;
      }
    }
  }

  private servedHover(say: (t: string) => void): void {
    if (!this.served) return;
    const v = this.served.v;
    say(`${v.name}: eat it hot  ·  RMB to pack it`);
    if (this.ptr.pressed) this.eatServed('plate');
  }

  private secondary(): void {
    const h = this.pick(this.pickables());
    const c = this.classify(h);
    if (!c) return;
    if (c.kind === 'bowl' && !this.bowl.empty) { this.bowl.clear(); audio.play('pot_lid', { pos: this.W(_t1.copy(BOWL_AT)), vol: 0.3, rate: 1.2 }); this.say('Scraped the bowl out into the slop pail.', 2); return; }
    if (c.kind === 'produce' && this.produce && !this.produce.needsPeel) { this.produce.turn(); audio.play('knife_chop', { pos: this.W(_t1.copy(this.boardPos)), vol: 0.1, rate: 0.6 }); return; }
    if ((c.kind === 'served' || c.kind === 'plate' || (c.kind === 'food' && c.f!.where === 'plate')) && this.served) { this.packServed('plate'); return; }
    if (c.kind === 'mug' && this.poured) { this.packServed('mug'); return; }
    const v = c.v ?? (c.kind === 'food' ? this.vesselOf(c.f!) : null);
    if (v && v.kind !== 'coffee') { this.startTaste(v); return; }
    if (v && v.kind === 'coffee') { this.startTaste(v); return; }
  }

  // ------------------------------------------------------------------------------------------ drags
  private startFoodDrag(f: Food): void {
    const v = this.vesselOf(f);
    if (v) v.foods = v.foods.filter((x) => x !== f);
    this.drag = { kind: 'food', f, from: f.where, fromV: v };
    f.where = 'hand';
  }
  private startFlip(f: Food, v: Vessel): void {
    this.inHand(this.turner);
    this.drag = { kind: 'flip', f, v, t: 0, y0: this.ptr.y, vy: 0, lift: 0 };
  }
  private startCut(target: 'stock' | 'trout', f?: Food): void {
    this.inHand(this.knife);
    this.drag = { kind: 'cut', at: 0, depth: 0, y0: this.ptr.y, x0: this.ptr.x, done: false, target, f };
  }
  private startEgg(pp: Pantry): void {
    if (!this.use('eggs')) { this.say('Out of eggs.', 2); return; }
    const shell = new THREE.Mesh(eggShellGeo(), eggShellMat());
    shell.castShadow = true;
    this.root.add(shell);
    shell.position.copy(pp.home).add(V3(0, 0.06, 0));
    this.drag = { kind: 'egg', shell };
    audio.play('bottle_clink', { pos: this.W(_t1.copy(pp.home)), vol: 0.15, rate: 1.6 });
  }
  private uncap(pp: Pantry): void {
    if (!pp.cap) return;
    pp.open = true;
    pp.cap.removeFromParent();
    // the cap set down beside the bottle
    pp.cap.position.set(pp.home.x, pp.home.y - 0.229, pp.home.z - 0.06);
    pp.cap.position.copy(pp.home).add(V3(-0.035, -0.229, -0.05));
    this.root.add(pp.cap);
    audio.play('bottle_open', { pos: this.W(_t1.copy(pp.home)), vol: 0.5 });
    this.pop('Uncapped', this.W(_t1.copy(pp.home)).add(_t2.set(0, 0.27, 0)).clone(), '#ffe08a');
    this.log.push({ k: 'uncap', ing: 'oil' });
  }

  private carryPoint(lift = 0.09): THREE.Vector3 | null {
    const r = this.pointerRay();
    const o = this.L(r.origin), dir = this.L(_t1.copy(r.origin).add(r.direction)).sub(o).normalize();
    let best: THREE.Vector3 | null = null;
    for (const y of [PLATE.y, COUNTER.y, PANTRY.y]) {
      const t = (y - o.y) / (dir.y || -1e-6);
      if (t <= 0) continue;
      const p = o.clone().addScaledVector(dir, t);
      const onPlate = y === PLATE.y && p.x > PLATE.x0 - 0.1 && p.x < PLATE.x1 + 0.1 && p.z > PLATE.z0 - 0.1 && p.z < PLATE.z1 + 0.15;
      const onCounter = y === COUNTER.y && p.x > COUNTER.x0 - 0.02 && p.x < COUNTER.x1 + 0.05 && p.z > COUNTER.z0 - 0.05 && p.z < COUNTER.z1 + 0.05;
      const onPantry = y === PANTRY.y && p.x > PANTRY.x0 - 0.05 && p.x < PANTRY.x1 + 0.02 && p.z > PANTRY.z0 - 0.05 && p.z < PANTRY.z1 + 0.05;
      if (onPlate || onCounter || onPantry) { best = p; break; }
      if (!best && y === PLATE.y) best = p;
    }
    return best ? best.add(_t2.set(0, lift, 0)) : null;
  }

  private dragUpdate(dt: number): void {
    const d = this.drag!, p = this.ptr;
    switch (d.kind) {
      case 'carry': this.carryUpdate(d, dt); break;
      case 'food': case 'egg': case 'board': {
        const at = this.carryPoint(d.kind === 'board' ? 0.12 : 0.08);
        const obj: THREE.Object3D = d.kind === 'food' ? d.f.obj : d.kind === 'egg' ? d.shell : this.board;
        if (at) {
          obj.position.lerp(at, Math.min(1, dt * 18));
          const tgt = this.dropTarget(at);
          if (d.kind === 'board') obj.rotation.set(0, 0, -(tgt?.kind === 'vessel' ? 0.9 : 0) * 0.8);
          this.hover = { text: tgt?.label ?? '', at: this.W(at) };
          if (d.kind === 'food') { d.f.obj.position.copy(at); d.f.obj.rotation.set(0, d.f.yaw, 0); if (d.f.flipped) d.f.obj.rotateX(Math.PI); }
        }
        if (p.released) this.drop(at);
        break;
      }
      case 'vessel': {
        const at = this.carryPoint(0.05);
        const v = d.v;
        if (at) {
          v.obj.position.lerp(at, Math.min(1, dt * 14));
          v.pos.copy(v.obj.position);
          const serve = this.overServe(at) && v.kind !== 'coffee' ? (v.empty ? '' : 'Serve') : this.overMug(at) && v.kind === 'coffee' ? 'Pour' : '';
          this.hover = { text: serve, at: this.W(at) };
        }
        if (p.released) this.dropVessel(v, at);
        break;
      }
      case 'lid': {
        const at = this.carryPoint(0.1);
        const lid = d.lid;
        if (at) {
          lid.obj.position.lerp(at, Math.min(1, dt * 14));
          lid.obj.quaternion.slerp(_q1.identity(), Math.min(1, dt * 10));
          const v = this.vesselUnder(at, lid.kind);
          this.hover = { text: v ? (v.fat && v.fat.fire > 0 ? 'Clap it on!' : 'Lid on') : 'Hang it back up', at: this.W(at) };
        }
        if (p.released) this.dropLid(lid, at);
        break;
      }
      case 'bowl': this.bowlUpdate(d, dt); break;
      case 'flip': this.flipUpdate(d, dt); break;
      case 'cut': this.cutUpdate(d, dt); break;
      case 'press': {
        const mx = p.x - d.x0, my = p.y - d.y0;
        if (Math.hypot(mx, my) > 0.025) {
          if (d.what === 'strip' && d.f) {
            if (my < -Math.abs(mx) * 0.7) { const pr = this.stripToProduce(d.f); this.inHand(this.knife); this.drag = { kind: 'chop', p: pr, at: 0, depth: 0, y0: d.y0, armed: true, cuts: 0 }; }
            else this.startFoodDrag(d.f);
          } else if (d.p) {
            if (my < -Math.abs(mx) * 0.7 || d.p.cuts === 0 && Math.abs(mx) <= Math.abs(my)) { this.inHand(this.knife); this.drag = { kind: 'chop', p: d.p, at: 0, depth: 0, y0: d.y0, armed: true, cuts: 0 }; }
            else { this.inHand(this.knife); this.drag = { kind: 'scrape', p: d.p, x0: p.x, carried: false }; this.say(d.p.cuts ? 'Scrape it up with the spine and carry it on the blade.' : 'Carrying it whole.', 2); }
          }
        }
        if (p.released && this.drag === d) { if (d.what === 'strip' && d.f) this.startFoodDrag(d.f); this.drag = null; }
        break;
      }
      case 'chop': this.chopUpdate(d, dt); break;
      case 'scrape': this.scrapeUpdate(d, dt); break;
      case 'peel': {
        const m = Math.hypot(p.x - d.last.x, p.y - d.last.y);
        d.last.set(p.x, p.y);
        const pr = d.p;
        pr.peel = Math.min(1, pr.peel + m * 1.6);
        if (pr.skin) { pr.skin.scale.setScalar(1 + pr.peel * 0.08); pr.skin.rotation.y += m * 3; }
        if (m > 0.02 && Math.random() < 0.3) audio.play('paper_rustle', { pos: this.W(_t1.copy(this.boardPos)), vol: 0.2, rate: 1.6 });
        this.hover = { text: pr.peel < 1 ? 'Peeling…' : 'Peeled', at: this.W(this.boardSurface(pr.local)).add(_t2.set(0, 0.07, 0)).clone() };
        if (pr.peel >= 1) {
          pr.rebuild();
          // the papery skin falls off in flakes onto the board
          this.bits.emit(this.W(this.boardSurface(pr.local)).add(_t2.set(0, 0.05, 0)), V3(0, 0.3, 0), { color: new THREE.Color(0.74, 0.48, 0.22), size: 0.008, life: 0.5, stay: 8, spread: 1.2, n: 10, floor: (q) => this.floorAt(q), flat: true });
          this.log.push({ k: 'peel', ing: pr.key });
          this.pop('Peeled', this.W(this.boardSurface(pr.local)).add(_t2.set(0, 0.06, 0)).clone(), '#ffe08a');
          this.drag = null;
        }
        if (p.released) this.drag = null;
        break;
      }
      case 'knead': {
        const f = d.f;
        const m = Math.hypot(p.x - d.last.x, p.y - d.last.y);
        d.last.set(p.x, p.y);
        f.knead = Math.min(1, f.knead + m * 0.9);
        d.amt += m;
        if (d.amt > 0.12) {
          d.amt = 0;
          const mesh = f.obj.children[0] as THREE.Mesh;
          mesh.geometry.dispose();
          mesh.geometry = f.dough === 'pastry' ? (f.knead > 0.95 ? pastryGeo(31) : doughGeo(Math.min(1, f.knead * 1.2), 31)) : doughGeo(f.knead, 31);
          f.h = f.dough === 'pastry' ? 0.05 - f.knead * 0.04 : 0.05 - f.knead * 0.026;
          audio.play('foliage_rustle', { pos: this.W(_t1.copy(f.obj.position)), vol: 0.25, rate: 0.6 });
          puffs.emit(this.W(_t1.copy(f.obj.position)).add(_t2.set(0, 0.03, 0)), V3(0, 0.1, 0), { size: 0.02, grow: 2, life: 0.8, color: new THREE.Color(0.95, 0.94, 0.9), alpha: 0.35, rise: 0.05 });
          if (f.knead >= 1 && !f.calls.has('kneaded')) { f.calls.add('kneaded'); this.log.push({ k: 'knead', s: f.dough }); }
        }
        this.hover = { text: f.knead < 1 ? (f.dough === 'pastry' ? 'Pressing it out…' : 'Knead…') : f.dough === 'pastry' ? 'Rolled flat. Lay it over the filling' : 'Round and flat. Into the skillet', at: this.W(_t1.copy(f.obj.position)).add(_t2.set(0, 0.04, 0)).clone() };
        if (p.released) this.drag = null;
        break;
      }
      case 'stir': {
        const a = d.bowl ? this.bowlAngle() : this.vesselAngle(d.v!);
        let da = a - d.last; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        d.last = a;
        d.amt += Math.abs(da);
        if (d.bowl) {
          this.inHand(this.spoon);
          this.bowl.stir(Math.abs(da) * 0.08);
          this.bowl.mat.userData.uSpin.value += da;
          if (d.amt > 2) { d.amt = 0; audio.play('foliage_rustle', { pos: this.W(_t1.copy(BOWL_AT)), vol: 0.15, rate: 1.4 }); }
          const k = this.bowl.kind;
          if (this.bowl.mix >= 0.6 && !this.bowl.calls.has(k)) { this.bowl.calls.add(k); this.log.push({ k: 'mix', s: k }); this.pop(k === 'batter' ? 'A smooth batter' : k === 'dough' || k === 'dumpling' ? 'It comes together: a dough' : k === 'pastry' ? 'Short, crumbly pastry' : k === 'crumbly' ? 'Too dry: more liquid' : k === 'runny' ? 'Too runny: more flour' : k, this.W(_t1.copy(BOWL_AT)).add(_t2.set(0, 0.14, 0)).clone(), '#ffe08a'); }
          this.hover = { text: `Stirring (${this.bowl.mix < 0.6 ? 'lumpy' : k})`, at: this.W(_t1.copy(BOWL_AT)).add(_t2.set(0, 0.12, 0)).clone() };
        } else {
          const v = d.v!;
          v.pot.spin = v.pot.spin * 0.9 + (da / Math.max(dt, 1e-3)) * 0.1;
          if (d.amt > 1.5) { d.amt = 0; v.pot.sinceStir = 0; v.pot.scorch = Math.max(0, v.pot.scorch - 0.05); audio.play('pot_lid', { pos: this.W(_t1.copy(v.pos)), vol: 0.12, rate: 1.7 }); for (const pl of v.piles) pl.stir(0.3); if (v.wet < 0.05) for (const f of v.foods) if (Math.random() < 0.5) f.flipped = !f.flipped; if (!v.calls.has('stirlog')) { v.calls.add('stirlog'); this.log.push({ k: 'stir', v: v.kind }); } }
          this.inHand(this.spoon);
          this.hover = { text: 'Stirring', at: this.W(_t1.copy(v.pos).add(_t2.set(0, 0.13, 0))).clone() };
        }
        if (p.released) { this.drag = null; this.putBack(this.spoon); }
        break;
      }
      case 'toss': {
        const v = d.v;
        const m = Math.hypot(p.x - d.last.x, p.y - d.last.y);
        d.last.set(p.x, p.y);
        d.amt += m;
        for (const pl of v.piles) pl.obj.rotation.y += (p.dx) * 3;
        if (d.amt > 0.25) {
          d.amt = 0;
          for (const pl of v.piles) { pl.stir(0.6); pl.layout(v.inner - 0.01, Math.random() * 999); }
          audio.play('pan_fry', { pos: this.W(_t1.copy(v.pos)), vol: 0.2, rate: 1.4 });
          if (!v.calls.has('stirlog')) { v.calls.add('stirlog'); this.log.push({ k: 'stir', v: v.kind }); }
        }
        this.hover = { text: 'Turning them over', at: this.W(_t1.copy(v.pos).add(_t2.set(0, 0.06, 0))).clone() };
        if (p.released) { this.drag = null; this.putBack(this.turner); }
        break;
      }
      case 'draft': {
        this.draft = clamp(d.d0 + (p.x - d.x0) * 1.4, 0, 1);
        this.hover = { text: `Draft ${Math.round(this.draft * 100)}%`, at: this.draftDisc!.getWorldPosition(new THREE.Vector3()) };
        if (Math.random() < dt * 8) audio.play('drawer_open', { pos: this.draftDisc!.getWorldPosition(_t1), vol: 0.06, rate: 2.2 });
        if (p.released) this.drag = null;
        break;
      }
    }
  }

  private flipUpdate(d: Extract<Drag, { kind: 'flip' }>, dt: number): void {
    const p = this.ptr;
    d.t += dt;
    const vy = p.dy / Math.max(1e-3, dt);
    d.vy = d.vy * 0.5 + vy * 0.5;
    d.lift = clamp((p.y - d.y0) * 0.6, 0, 0.05);
    const f = d.f;
    const at = this.pointerOnPlane(this.W(_t1.set(0, d.v.pos.y + d.v.floor, 0)).y);
    if (at && d.lift < 0.01) {
      const l = this.L(at).sub(d.v.pos);
      const r = Math.hypot(l.x, l.z), lim = d.v.inner - f.r * 0.6;
      if (r > lim) l.multiplyScalar(lim / r);
      f.local.lerp(_v2.set(l.x, l.z), Math.min(1, dt * 10));
    }
    this.hover = { text: 'Flick up to flip', at: this.W(this.foodWorldLocal(f, d.v)) };
    if (p.released || d.lift >= 0.05 || d.vy > 3.5) {
      const v = d.vy;
      if (f.kind === 'shroom' || f.kind === 'pastry' || f.kind === 'dumpling') { /* nudged */ }
      else if (v > 1.4) this.doFlip(f, d.v, v);
      else if (v > 0.5) this.pop('Flick harder', this.W(this.foodWorldLocal(f, d.v)), '#e0d0a0');
      this.drag = null;
      this.putBack(this.turner);
    }
  }
  private doFlip(f: Food, v: Vessel, speed: number): void {
    const hard = speed > 6;
    const fat = v.fat ? v.fat.total + v.fat.solid : 0;
    const stuck = fat < 1.5 && f.down < 0.6 && Math.random() < 0.5;
    if (stuck) { this.pop('Stuck! Needs fat', this.W(this.foodWorldLocal(f, v)), '#ff9070'); f.addDown(0.04, 0); return; }
    const to = f.local.clone().add(_v2.set((Math.random() - 0.5) * (hard ? 0.08 : 0.02), (Math.random() - 0.5) * (hard ? 0.08 : 0.02)));
    const lim = v.inner - f.r * 0.6; if (to.length() > lim) to.setLength(lim);
    f.flip = { t: 0, dur: hard ? 0.5 : 0.38, h: hard ? 0.14 : 0.06 + Math.min(0.04, speed * 0.006), from: f.local.clone(), to, ok: true };
    this.g.sound('axe_whoosh', this.W(_t1.copy(v.pos)), 0.12, 1.8);
    v.flips++;
    this.log.push({ k: 'flip', ing: f.key, s: hard ? 'hard' : 'ok' });
    if (hard) { v.badFlips++; this.pop('Too hard!', this.W(this.foodWorldLocal(f, v)), '#ffb070'); if (f.kind === 'egg') f.broken = true; this.bits.emit(this.W(this.foodWorldLocal(f, v)), V3(0, 1.2, 0), { color: new THREE.Color(0.98, 0.92, 0.7), size: 0.004, life: 1.2, stay: 6, spread: 2, n: 12, floor: (q) => this.floorAt(q) }); }
  }

  private vesselAngle(v: Vessel): number {
    const at = this.pointerOnPlane(this.W(_t1.set(0, v.pos.y + 0.06, 0)).y);
    if (!at) return 0;
    const l = this.L(at).sub(v.pos);
    return Math.atan2(l.z, l.x);
  }
  private bowlAngle(): number {
    const at = this.pointerOnPlane(this.W(_t1.set(0, BOWL_AT.y + 0.06, 0)).y);
    if (!at) return 0;
    const l = this.L(at).sub(BOWL_AT);
    return Math.atan2(l.z, l.x);
  }
  private inVessel(v: Vessel, pw: THREE.Vector3): boolean { const l = this.L(pw).sub(v.pos); return Math.hypot(l.x, l.z) < v.inner; }
  private overServe(l: THREE.Vector3): boolean { return Math.hypot(l.x - SERVE.x, l.z - SERVE.z) < 0.13; }
  private overMug(l: THREE.Vector3): boolean { return Math.hypot(l.x - MUG.x, l.z - MUG.z) < 0.08; }
  private vesselUnder(at: THREE.Vector3, kind?: 'skillet' | 'pot'): Vessel | null {
    for (const v of this.vessels) {
      if (kind && v.kind !== kind) continue;
      if (Math.hypot(at.x - v.pos.x, at.z - v.pos.z) < v.r + 0.03) return v;
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------ carrying ingredients
  /** what a carried ingredient would do here */
  private carryTarget(pp: Pantry, at: THREE.Vector3): Target | null {
    const id = pp.id, how = pp.ing?.how;
    const v = this.vesselUnder(at);
    const overBowl = Math.hypot(at.x - BOWL_AT.x, at.z - BOWL_AT.z) < 0.13 && Math.abs(at.y - PANTRY.y) < 0.2;
    const overBoard = Math.abs(at.y - (COUNTER.y + 0.08)) < 0.08 && Math.abs(at.x - this.boardPos.x) < 0.24 && Math.abs(at.z - this.boardPos.z) < 0.15;
    const overServed = this.served && this.overServe(at);
    const none: Target = { kind: 'none', label: '' };
    if (id === 'water') {
      if (v) return { kind: 'vessel', v, label: v.fat && v.fat.fire > 0.05 ? 'Water on a grease fire?!' : v.kind === 'skillet' ? 'Water in the hot pan?' : 'Pour water (hold it)', flow: true };
      if (overBowl) return { kind: 'bowl', label: 'Pour water (hold it)', flow: true };
      return none;
    }
    if (id === 'kindling') return none;
    if (id === 'fish' || id === 'bannock_mix' || how === 'produce' || how === 'unwrap') {
      if (overBoard) return { kind: 'board', label: id === 'bannock_mix' ? 'Mix the dough' : how === 'produce' ? (id === 'garlic' ? 'Break off a clove' : `A ${PRODUCE[id]?.name ?? id} on the board`) : 'Unwrap it on the board' };
      return null;
    }
    switch (how) {
      case 'pour':
        if (v && v.kind !== 'coffee' && (id !== 'milk' || v.kind === 'pot' || v.kind === 'skillet')) return { kind: 'vessel', v, label: id === 'oil' ? 'Pour (hold it there)' : `Pour the ${pp.ing!.name} (hold it)`, flow: true };
        if (overBowl && ['oil', 'milk', 'syrup'].includes(id)) return { kind: 'bowl', label: `Pour (hold it)`, flow: true };
        if (overServed && id === 'syrup') return { kind: 'plate', label: 'Pour syrup over it (hold it)', flow: true };
        return null;
      case 'measure':
        if (overBowl) return { kind: 'bowl', label: `Measure it in (hold it)`, flow: true };
        if (v && v.kind === 'pot') return { kind: 'vessel', v, label: 'Measure it into the pot (hold it)', flow: true };
        return null;
      case 'leaves':
        if (v && (v.kind === 'coffee' || v.kind === 'pot')) return { kind: 'vessel', v, label: id === 'coffee' ? 'Spoon in the grounds' : 'A pinch of leaves in' };
        return null;
      case 'shake':
        if (v && v.kind !== 'coffee') return { kind: 'vessel', v, label: 'Shake it (wiggle)', flow: true };
        if (overBowl) return { kind: 'bowl', label: 'Shake it (wiggle)', flow: true };
        if (overServed) return { kind: 'plate', label: 'Shake it (wiggle)', flow: true };
        return null;
      case 'pat':
        if (v && v.kind !== 'coffee') return { kind: 'vessel', v, label: id === 'butter' ? 'A pat of butter' : 'A spoon of lard' };
        if (overBowl) return { kind: 'bowl', label: id === 'butter' ? 'A pat of butter' : 'A spoon of lard' };
        return null;
      case 'cube':
        if (v && v.kind === 'pot') return { kind: 'vessel', v, label: 'Drop a cube in' };
        return null;
      case 'crumble': case 'links':
        if (v && v.kind !== 'coffee') return { kind: 'vessel', v, label: how === 'links' ? 'Two sausages in' : 'Crumble it in' };
        return null;
      case 'handful':
        if (overBowl) return { kind: 'bowl', label: 'A handful in' };
        if (v && v.kind !== 'coffee') return { kind: 'vessel', v, label: 'A handful in' };
        if (overBoard && this.foods.some((f) => f.where === 'board' && f.kind === 'dough' && !f.berry)) return { kind: 'board', label: 'Work the berries in' };
        if (v && v.kind === 'skillet') return { kind: 'vessel', v, label: 'Scatter them in' };
        return null;
      case 'crack': return null;
    }
    return null;
  }

  private carryUpdate(d: Extract<Drag, { kind: 'carry' }>, dt: number): void {
    const p = this.ptr, pp = d.p;
    const at = this.carryPoint(pp.ing?.how === 'measure' ? 0.14 : 0.1);
    let tilt = 0;
    if (at) {
      pp.obj.position.lerp(at, Math.min(1, dt * 18));
      const tgt = this.carryTarget(pp, at);
      if ((tgt?.kind ?? 'none') !== (d.tgt?.kind ?? 'none') || tgt?.v !== d.tgt?.v) { d.tgt = tgt; d.acc = 0; }
      if (tgt?.flow && p.down) {
        tilt = pp.ing?.how === 'shake' ? 2.4 : -1.15;
        this.flowStep(d, tgt, at, dt);
      }
      const amount = this.amountText(pp, d.total, d.tgt?.kind === 'bowl');
      this.hover = { text: d.total > 0 ? amount : tgt?.label ?? '', at: this.W(at) };
    }
    const how = pp.ing?.how;
    pp.obj.rotation.set(0, pp.yaw, 0);
    if (how === 'shake' && tilt) { pp.obj.rotateX(Math.PI); pp.obj.position.y += 0.12; pp.obj.position.x += Math.sin(this.time * 30) * 0.004 * Math.min(1, Math.abs(p.dx) * 60); }
    else if (tilt) pp.obj.rotateX(tilt);
    if (p.released) this.carryRelease(d, at);
  }

  private amountText(pp: Pantry, total: number, bowl = false): string {
    const ing = pp.ing;
    if (pp.id === 'water') return bowl ? `${total} cup${total > 1 ? 's' : ''} of water` : total < 1 ? `${Math.round(total * 4)} cups of water` : `${total.toFixed(2)} L of water`;
    if (!ing) return '';
    const n = total;
    if (ing.unit === '¼ cup') { const cups = n / 4; const w = Math.floor(cups), q = Math.round((cups - w) * 4); return `${w ? w + ' ' : ''}${['', '¼', '½', '¾'][q] ?? ''}${w || q ? '' : '0'} cup${cups > 1 ? 's' : ''} of ${ing.name}`; }
    if (ing.unit === 'pinch') return `${Math.round(n)} pinch${n >= 2 ? 'es' : ''} of ${ing.name}`;
    const pl = n >= 2 && !['tsp', 'tbsp', 'third of the can', 'half can'].includes(ing.unit) && !ing.unit.endsWith('s');
    return `${Math.round(n * 10) / 10} ${ing.unit}${pl ? 's' : ''} of ${ing.name}`;
  }

  /** a continuous pour, measure or shake over a target */
  private flowStep(d: Extract<Drag, { kind: 'carry' }>, tgt: Target, at: THREE.Vector3, dt: number): void {
    const pp = d.p, id = pp.id, how = pp.ing?.how;
    if (how === 'shake') {
      // each change of direction of the wrist is a pinch
      const dx = this.ptr.dx;
      if (Math.abs(dx) > 0.002 && Math.sign(dx) !== Math.sign(d.lastDx)) { d.lastDx = dx; this.applyPortion(pp, tgt, at, 1); d.total += 1; }
      return;
    }
    const rate = id === 'water' ? (tgt.kind === 'bowl' ? 1.6 : FLOW.water) : FLOW[id] ?? 1;
    d.acc += dt * rate;
    // the stream from the spout to the surface
    this.showStream(pp, tgt, at);
    while (d.acc >= 1) {
      d.acc -= 1;
      const portion = id === 'water' ? (tgt.kind === 'bowl' ? 0.25 : 0.25) : 1;
      if (!this.applyPortion(pp, tgt, at, portion)) { this.drag = null; this.goHome(pp); this.say(`Out of ${pp.ing?.name ?? pp.id}.`, 2); return; }
      d.total += id === 'water' && tgt.kind !== 'bowl' ? 0.25 : portion;
    }
  }

  private showStream(pp: Pantry, tgt: Target, at: THREE.Vector3): void {
    const id = pp.id;
    const col: Record<string, number> = { oil: 0xe0b030, milk: 0xf6f4ee, syrup: 0x8a4a12, tomatoes: 0xb02a18, beans: 0x8a3a1a, water: 0x8ab0c0, flour: 0xf2efe6, sugar: 0xf8f8f6, oats: 0xd8c8a0, rice: 0xf4f2ea, macaroni: 0xf0d890, peas: 0xe8c860, baking_powder: 0xf4f4f4 };
    this.streamMat.color.setHex(col[id] ?? 0xdddddd);
    const top = _t1.copy(pp.obj.position).add(_t2.set(0, 0.02, 0));
    const y0 = tgt.v ? tgt.v.pos.y + (tgt.v.kind === 'pot' ? this.liquidY(tgt.v) : tgt.v.floor) : tgt.kind === 'bowl' ? BOWL_AT.y + 0.04 : COUNTER.y + 0.03;
    const len = Math.max(0.02, top.y - y0);
    this.stream.position.set(at.x, top.y, at.z);
    this.stream.scale.set(['flour', 'sugar', 'oats', 'rice', 'macaroni', 'peas'].includes(id) ? 2.4 : id === 'water' ? 1.6 : 1, len, 1);
    this.streamOn = 1;
    this.stream.visible = true;
    if (Math.random() < 0.1) audio.play(id === 'water' || id === 'milk' ? 'drink_gulp' : 'bag_rustle', { pos: this.W(_t3.copy(at)), vol: 0.08, rate: id === 'oil' ? 1.6 : 1.2 });
  }

  /** one portion of an ingredient into a target (returns false when there's none left) */
  private applyPortion(pp: Pantry, tgt: Target, at: THREE.Vector3, portion: number): boolean {
    const id = pp.id, ing = pp.ing, key = ing?.key ?? id;
    if (!this.use(id, id === 'water' ? 0 : 1)) return false;
    const v = tgt.v;
    const pos = (vv: Vessel) => _v2.set(clamp(at.x - vv.pos.x, -vv.inner * 0.8, vv.inner * 0.8), clamp(at.z - vv.pos.z, -vv.inner * 0.8, vv.inner * 0.8));
    if (tgt.kind === 'vessel' && v) {
      if (id === 'water') {
        if (v.fat && v.fat.total > 2 && v.wet < 0.05 && v.T > 120) {
          const r = v.fat.water();
          if (r === 'flare') { this.flareUp(v); return true; }
          this.bits.emit(this.W(_t1.copy(v.pos).add(_t2.set(0, 0.03, 0))), V3(0, 1.4, 0), { color: new THREE.Color(0.9, 0.8, 0.5), size: 0.003, life: 1, spread: 2.2, n: 14, stay: 2, floor: (q) => this.floorAt(q) });
          audio.play('pan_fry', { pos: this.W(_t1.copy(v.pos)), vol: 0.8, rate: 1.4 });
        }
        v.water += portion;
        if (v.kind !== 'coffee') { v.add('water', portion); v.T = Math.min(v.T, v.T * 0.9 + 15 * 0.1); }
        else v.T = Math.min(v.T, 60 + (v.T - 60) * 0.85);
        return true;
      }
      if (id === 'oil') { v.fat!.pour('oil', 15, pos(v).x, pos(v).y); v.add('oil', 1); this.log.push({ k: 'pour', ing: 'oil', v: v.kind, T: v.T }); if (v.T > 160) audio.play('pan_fry', { pos: this.W(_t1.copy(v.pos)), vol: 0.15, rate: 1.6 }); return true; }
      if (how(pp) === 'shake') {
        v.add(key, 1);
        this.bits.emit(this.W(_t1.copy(pp.obj.position)).add(_t2.set(0, -0.02, 0)), V3(0, -0.4, 0), { color: id === 'salt' ? new THREE.Color(0.96, 0.96, 0.96) : new THREE.Color(0.08, 0.07, 0.06), size: 0.0018, life: 1, stay: 3, spread: 0.3, n: 5, floor: (q) => this.floorAt(q) });
        if (!v.calls.has(`season_${key}`)) { v.calls.add(`season_${key}`); this.log.push({ k: 'season', ing: key, v: v.kind }); }
        audio.play('bag_rustle', { pos: this.W(_t1.copy(v.pos)), vol: 0.06, rate: 2.2 });
        return true;
      }
      // pours and measures into a pot or pan
      v.add(key, ing && ing.unit === '¼ cup' ? 0.25 : ing && ing.unit === 'third of the can' ? 1 / 3 : ing && ing.unit === 'half can' ? 0.5 : 1);
      this.log.push({ k: ing?.how === 'measure' ? 'measure' : 'pour', ing: key, v: v.kind });
      if (key === 'milk' || key === 'tomatoes' || key === 'beans') { v.T = v.T * 0.92 + 20 * 0.08; }
      if (v.T > 150 && v.wet > 0.05 && v.wet < 0.4) audio.play('pan_fry', { pos: this.W(_t1.copy(v.pos)), vol: 0.5, rate: 1.2 });
      return true;
    }
    if (tgt.kind === 'bowl') {
      if (id === 'water') { this.bowl.add('water', 0.25); return true; }
      const b = this.bowl;
      if (how(pp) === 'shake') { b.add(key, 1); this.log.push({ k: 'measure', ing: key, v: 'bowl' }); return true; }
      if (key === 'oil') b.add('oil', 1);
      else if (key === 'milk') b.add('milk', 0.25);
      else if (key === 'syrup') b.add('syrup', 1);
      else b.add(key, ing && ing.unit === '¼ cup' ? 0.25 : 1);
      this.log.push({ k: 'measure', ing: key, v: 'bowl' });
      return true;
    }
    if (tgt.kind === 'plate' && this.served) {
      // syrup or seasoning over a served dish
      const s = this.served;
      if (key === 'syrup') { s.v.q = Math.min(1, s.v.q + (s.v.recipe?.id === 'flapjacks' ? 0.05 : 0)); if (s.v.recipe?.id === 'flapjacks' && !s.extra.length) this.syrupOver(s); }
      if (key === 'salt' || key === 'pepper') s.v.q = Math.min(1, s.v.q + 0.01);
      return true;
    }
    return false;
  }

  /** syrup over the stack on the plate */
  private syrupOver(s: NonNullable<CookingStation['served']>): void {
    const m = new THREE.Mesh(discGeo(0.05, 16), liquidMat('syrup'));
    m.position.copy(s.obj.position).add(V3(0, 0.04, 0));
    this.root.add(m);
    s.extra.push(m);
  }

  /** water on a grease fire */
  private flareUp(v: Vessel): void {
    this.g.sound('fire_ignite', this.W(_t1.copy(v.pos)), 1);
    this.pop('NEVER water on a grease fire!', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.3, 0)).clone(), '#ff5030');
    this.say('It erupts! Burning fat everywhere. Lid. Use the lid.', 3.5);
    this.bits.emit(this.W(_t1.copy(v.pos).add(_t2.set(0, 0.05, 0))), V3(0, 2, 0), { color: new THREE.Color(1, 0.55, 0.15), size: 0.005, life: 1.4, spread: 3, n: 40, glow: 1.5, stay: 1, floor: (q) => this.floorAt(q) });
    this.g.survival.spend(0.2);
    this.log.push({ k: 'flare', v: v.kind });
  }

  private carryRelease(d: Extract<Drag, { kind: 'carry' }>, at: THREE.Vector3 | null): void {
    const pp = d.p;
    this.drag = null;
    const tgt = at ? this.carryTarget(pp, at) : null;
    if (d.total > 0 && (pp.ing || pp.id === 'water')) this.pop(this.amountText(pp, d.total, d.tgt?.kind === 'bowl'), this.W(_t1.copy(pp.obj.position)).add(_t2.set(0, 0.08, 0)).clone(), '#fff0c0');
    if (!tgt || tgt.flow || tgt.kind === 'none') { this.goHome(pp); return; }
    this.dropIngredient(pp, tgt, at!);
  }

  private goHome(pp: Pantry): void {
    if (pp.id === 'water') { this.putBack(this.dipper); return; }
    if (!pp.obj.parent) return;
    pp.obj.position.copy(pp.home);
    pp.obj.rotation.set(0, pp.yaw, 0);
    if (pp.id === 'fish') pp.obj.rotation.set(Math.PI / 2, 0, 0);
  }
  private consumePantry(pp: Pantry): void {
    if (pp.fixture) { this.goHome(pp); return; }
    if (this.leftOf(pp.id) > 0 && pp.id !== 'fish') { this.goHome(pp); return; }
    pp.obj.removeFromParent();
    this.pantry = this.pantry.filter((x) => x !== pp);
  }

  /** single actions on release: unwrap, crack, a pat, a cube, a handful, crumbles, sausages, leaves */
  private dropIngredient(pp: Pantry, tgt: Target, at: THREE.Vector3): void {
    const g = this.g, id = pp.id, ing = pp.ing;
    const v = tgt.v;
    if (tgt.kind === 'board') {
      if (id === 'berries') {
        const dough = this.foods.find((f) => f.where === 'board' && f.kind === 'dough' && !f.berry);
        if (dough && this.use('berries')) {
          this.foods = this.foods.filter((f) => f !== dough); dough.obj.removeFromParent();
          const nd = makeFood('dough', { berry: true, flat: dough.knead }); nd.knead = dough.knead; nd.where = 'board'; nd.dough = dough.dough; nd.lift = dough.lift;
          this.addFood(nd);
          this.pop('Berries in', this.W(this.boardSurface(nd.local)).add(_t2.set(0, 0.05, 0)).clone(), '#a0a0ff');
        }
        this.consumePantry(pp);
        return;
      }
      if (this.boardBusy()) { this.say('Clear the board first.', 2); this.goHome(pp); return; }
      if (!this.use(id === 'fish' ? 'fish' : id)) { this.goHome(pp); return; }
      audio.play('paper_rustle', { pos: this.W(_t1.copy(this.boardPos)), vol: 0.5 });
      if (id === 'bacon') this.setStock(new Stock('bacon', 0.2, 'bacon'));
      else if (meatIds().includes(id)) this.setStock(new Stock('meat', 0.15, meatKey(id)));
      else if (id === 'chanterelle') this.setStock(new Stock('shroom', 1, 'chanterelle'));
      else if (id === 'fish') { const f = makeFood('trout'); f.where = 'board'; f.local.set(0, 0); this.addFood(f); }
      else if (id === 'bannock_mix') { const f = makeFood('dough', { flat: 0 }); f.where = 'board'; f.lift = 1; this.addFood(f); this.log.push({ k: 'mix', s: 'dough' }); this.pop('Water in. Now knead it', this.W(_t1.copy(this.boardPos)).add(_t2.set(0, 0.08, 0)).clone(), '#ffe08a'); }
      else if (PRODUCE[id]) this.setProduce(new Produce(id, PRODUCE[id]));
      this.consumePantry(pp);
      return;
    }
    if (tgt.kind === 'bowl') {
      const b = this.bowl;
      if (ing?.how === 'pat') { if (!this.use(id)) { this.goHome(pp); return; } b.add(id === 'butter' ? 'butter' : 'lard', 1); this.log.push({ k: 'measure', ing: ing.key, v: 'bowl' }); this.pop(id === 'butter' ? 'A pat of butter' : 'A spoon of lard', this.W(_t1.copy(BOWL_AT)).add(_t2.set(0, 0.12, 0)).clone()); }
      else if (ing?.how === 'handful') { if (!this.use(id)) { this.goHome(pp); return; } b.add('berries', 1); this.pop('Berries in', this.W(_t1.copy(BOWL_AT)).add(_t2.set(0, 0.12, 0)).clone(), '#a0a0ff'); }
      this.consumePantry(pp);
      return;
    }
    if (tgt.kind !== 'vessel' || !v) { this.goHome(pp); return; }
    const lp = _v2.set(clamp(at.x - v.pos.x, -v.inner * 0.7, v.inner * 0.7), clamp(at.z - v.pos.z, -v.inner * 0.7, v.inner * 0.7));
    switch (ing?.how) {
      case 'pat': {
        if (!this.use(id)) break;
        const kind = id === 'butter' ? 'butter' : 'lard';
        if (v.wet > 0.05) v.add(kind, 1);
        else { v.fat!.addPat(kind, 14, lp.x, lp.y); v.add(kind, 1); }
        if (v.T > 120 && v.wet < 0.05) audio.play('pan_fry', { pos: this.W(_t1.copy(v.pos)), vol: 0.3 });
        this.pop(kind === 'butter' ? 'A pat of butter' : 'A spoon of lard', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.06, 0)).clone(), '#fff2c0');
        this.log.push({ k: 'add', ing: kind, v: v.kind, T: v.T });
        break;
      }
      case 'cube': if (this.use(id)) { v.add('bouillon', 1); this.pop('A bouillon cube', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.12, 0)).clone(), '#e0a050'); this.log.push({ k: 'add', ing: 'bouillon', v: v.kind }); } break;
      case 'leaves': {
        if (!this.use(id)) break;
        if (v.kind === 'coffee') {
          const C = v.coffee;
          C.grounds = id === 'coffee' ? 'coffee' : id === 'tea' ? 'tea' : 'labtea'; C.boil = 0; C.settle = 0; C.steep = 0; v.calls.clear();
          v.add(ing.key, 1);
          const lid = v.obj.userData.lid as THREE.Object3D; lid.userData.open = true; setTimeout(() => { lid.userData.open = false; }, 900);
          this.bits.emit(this.W(_t1.copy(v.pos).add(_t2.set(0, 0.2, 0))), V3(0, -0.3, 0), { color: id === 'coffee' ? new THREE.Color(0.18, 0.11, 0.06) : new THREE.Color(0.2, 0.25, 0.12), size: 0.004, life: 0.4, spread: 0.1, n: 14 });
          this.pop(id === 'coffee' ? (v.T >= 99 ? 'Grounds in. Let it boil a bit' : 'Grounds in. Bring it to a boil') : 'Leaves in. Let it steep', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.18, 0)).clone(), '#ffe08a');
        } else v.add(ing.key, 1);
        this.log.push({ k: 'add', ing: ing.key, v: v.kind, T: v.T });
        break;
      }
      case 'crumble': {
        if (!this.use(id)) break;
        const pile = new Pile('beef', 'beef', crumbleBits(22, 0.0075, Math.random() * 999), 0.5);
        this.pileInto(pile, v);
        break;
      }
      case 'links': {
        if (!this.use(id)) break;
        for (let k = 0; k < 2; k++) { const f = makeFood('sausage'); f.key = 'sausage'; this.addFood(f); this.intoVessel(f, v); }
        break;
      }
      case 'handful': {
        if (!this.use(id)) break;
        v.add(ing.key, 1);
        if (v.wet < 0.05 && v.kind === 'skillet') {
          // berries scattered over flapjacks (or just into the pan)
          const jack = v.foods.find((f) => f.kind === 'flapjack');
          if (jack) { jack.berry = true; this.pop('Berries on the flapjack', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.06, 0)).clone(), '#a0a0ff'); }
        }
        this.pop('A handful of blueberries', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.1, 0)).clone(), '#a0a0ff');
        this.log.push({ k: 'add', ing: ing.key, v: v.kind });
        break;
      }
    }
    this.consumePantry(pp);
  }

  // ------------------------------------------------------------------------------------------ board
  private setStock(s: Stock): void {
    this.stock = s;
    s.obj.position.copy(this.boardSurface(_v2.set(-0.17 + s.len / 2, -0.01)));
    s.obj.rotation.y = 0.03;
    this.root.add(s.obj);
  }
  private setProduce(p: Produce): void {
    this.produce = p;
    p.local.set(-0.02, 0.035);
    p.obj.position.copy(this.boardSurface(p.local));
    this.root.add(p.obj);
    this.pop(p.needsPeel ? `Peel the ${p.def.name}` : p.def.halve ? 'Halve it' : 'Chop it', this.W(_t1.copy(p.obj.position)).add(_t2.set(0, 0.1, 0)).clone(), '#ffe08a');
  }
  /** a strip of meat (or a bacon round) on the board becomes a block to cube */
  private stripToProduce(f: Food): Produce {
    this.foods = this.foods.filter((x) => x !== f); f.obj.removeFromParent();
    const def: ProduceDef = { shape: { kind: 'box', a: f.kind === 'bacon' ? 0.036 : 0.05, b: Math.max(0.008, f.h), c: f.kind === 'bacon' ? 0.03 : 0.02 }, peel: false, halve: false, units: f.units, key: f.key, kind: 'meat', name: KEY_NAME[f.key] ?? 'meat' };
    const p = new Produce(f.key, def);
    p.done = { a: f.a, b: f.b };
    this.produce = p;
    p.local.copy(f.local);
    p.obj.position.copy(this.boardSurface(p.local));
    this.root.add(p.obj);
    return p;
  }

  private chopUpdate(d: Extract<Drag, { kind: 'chop' }>, _dt: number): void {
    const p = this.ptr, pr = d.p;
    const at = this.pointerOnPlane(this.W(_t1.set(0, COUNTER.y + 0.04, 0)).y);
    const ext = pr.extent();
    if (at) {
      const l = this.L(at);
      d.at = clamp(l.x - (this.boardPos.x + pr.local.x), ext.x0 - 0.01, ext.x1 + 0.01);
    }
    const depth = clamp((d.y0 - p.y) / 0.12, 0, 1);
    d.depth = depth;
    if (!d.armed && depth < 0.55) d.armed = true;
    if (d.armed && depth >= 1) {
      d.armed = false;
      d.y0 = Math.max(d.y0, p.y + 0.12);
      const r = pr.cut(d.at);
      if (r === 'peel') this.say('Peel it first. Nobody wants the papery skin.', 2.5);
      else if (r !== 'miss') {
        d.cuts++;
        this.g.sound('knife_chop', this.W(_t1.copy(pr.obj.position)), 0.55, 0.9 + Math.random() * 0.2);
        if (r === 'halved') { this.log.push({ k: 'halve', ing: pr.key }); this.pop('Halved: now slice it', this.W(_t1.copy(pr.obj.position)).add(_t2.set(0, 0.09, 0)).clone(), '#ffe08a'); }
        else {
          const st = pr.stats();
          this.log.push({ k: 'cut', ing: pr.key, s: st.cls });
          if (pr.cuts % 3 === 0) this.pop(`${st.n} pieces, ${st.cls}`, this.W(_t1.copy(pr.obj.position)).add(_t2.set(0, 0.09, 0)).clone(), '#fff0c0');
        }
      }
    }
    // re-arm by lifting the knife: the stroke starts again from wherever the pointer is
    if (!d.armed && p.y > d.y0 - 0.05) d.armed = true;
    if (d.depth < 0.05 && p.y > d.y0) d.y0 = p.y;
    this.hover = { text: 'Draw the knife down to cut  ·  lift and again  ·  release when done', at: this.W(_t1.copy(pr.obj.position)).add(_t2.set(0, 0.09, 0)).clone() };
    if (p.released) { this.drag = null; this.putBack(this.knife); if (d.cuts) { const st = pr.stats(); this.pop(`${st.n} piece${st.n > 1 ? 's' : ''}: ${st.cls}`, this.W(_t1.copy(pr.obj.position)).add(_t2.set(0, 0.1, 0)).clone(), '#ffe08a'); } }
  }

  private scrapeUpdate(d: Extract<Drag, { kind: 'scrape' }>, dt: number): void {
    const p = this.ptr, pr = d.p;
    const at = this.carryPoint(0.02);
    if (at) {
      const onBoard = Math.abs(at.x - this.boardPos.x) < 0.22 && Math.abs(at.z - this.boardPos.z) < 0.13 && Math.abs(at.y - COUNTER.y - 0.02) < 0.05;
      if (!onBoard && !d.carried) { d.carried = true; audio.play('knife_chop', { pos: this.W(_t1.copy(at)), vol: 0.2, rate: 1.6 }); }
      const want = at.clone().add(_t2.set(0, d.carried ? 0.06 : 0.041 - 0.02, 0));
      pr.obj.position.lerp(want, Math.min(1, dt * 16));
      const v = d.carried ? this.vesselUnder(at) : null;
      const bowl = d.carried && Math.hypot(at.x - BOWL_AT.x, at.z - BOWL_AT.z) < 0.13;
      this.hover = { text: d.carried ? (v && v.kind !== 'coffee' ? 'Drop it in' : bowl ? 'Into the bowl' : 'Carry it on the blade') : 'Scraping it together', at: this.W(at) };
    }
    if (p.released) {
      this.drag = null;
      this.putBack(this.knife);
      const v = at && d.carried ? this.vesselUnder(at) : null;
      if (v && v.kind !== 'coffee') { this.produceInto(pr, v); return; }
      // back on the board where it was
      pr.obj.position.copy(this.boardSurface(pr.local));
    }
  }

  /** the board's pieces into a vessel as a pile (or a whole vegetable) */
  private produceInto(pr: Produce, v: Vessel): void {
    const st = pr.stats();
    const pile = new Pile(pr.key, pr.def.kind, bitsOf(pr), pr.def.units, pr.mat);
    pile.a = pr.done.a; pile.b = pr.done.b;
    pr.dispose();
    if (this.produce === pr) this.produce = null;
    this.log.push({ k: 'scrape', ing: pr.key, s: st.cls, v: v.kind });
    this.pileInto(pile, v);
  }

  private pileInto(pile: Pile, v: Vessel): void {
    v.piles.push(pile);
    v.add(pile.key, pile.units);
    this.root.add(pile.obj);
    const floating = v.kind === 'pot' && v.wet > 0.05;
    pile.layout(floating ? 0.065 : v.inner - 0.012, Math.random() * 999);
    pile.setDone();
    this.placePile(pile, v, 0);
    this.sear(v, pile.key, (s) => { pile.seared = s; });
    audio.play(v.wet > 0.05 ? 'pot_lid' : 'bag_rustle', { pos: this.W(_t1.copy(v.pos)), vol: 0.25, rate: 1.3 });
  }

  /** something went into a vessel: hot fat sizzles hard (seared), cold fat just sits there */
  private sear(v: Vessel, key: string, set: (s: boolean) => void): void {
    const fat = v.fat;
    if (!fat || v.wet > 0.05) return;
    const at = this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.07, 0)).clone();
    if (fat.total + fat.solid > 1 && v.T >= 160) {
      set(true); v.seared.add(key);
      audio.play('pan_fry', { pos: at, vol: 0.75, rate: 1.0 });
      puffs.emit(at, V3(0, 0.25, 0), { size: 0.04, grow: 2.5, life: 1.2, color: new THREE.Color(0.9, 0.9, 0.88), alpha: 0.3, rise: 0.25, n: 3 });
      if (this.active) this.pop('Ssss! Good and hot', at, '#ffe08a');
    } else if (fat.total > 2 && v.T < 120) { set(false); if (this.active) this.pop('No sizzle: it\'ll soak up the fat', at, '#e0c0a0'); }
    else if (fat.total + fat.solid <= 1 && v.T > 120) { if (this.active) this.pop('Dry pan', at, '#e0c0a0'); }
    this.log.push({ k: 'add', ing: key, v: v.kind, T: Math.round(v.T), n: fat.total });
  }

  /** what's under a carried food / board / egg (local point) */
  private dropTarget(at: THREE.Vector3): Target | null {
    const d = this.drag!;
    const v = this.vesselUnder(at);
    if (v) {
      const what = d.kind === 'food' ? d.f.kind : d.kind === 'egg' ? 'egg' : d.kind === 'board' ? 'board' : '';
      if (d.kind === 'egg') return v.kind === 'skillet' || (v.kind === 'pot' && v.wet < 0.05) ? { kind: 'vessel', v, label: 'Crack it in' } : { kind: 'none', label: '' };
      if (v.kind === 'coffee') return { kind: 'none', label: '' };
      if (what === 'pastry' || (d.kind === 'food' && d.f.kind === 'dough' && d.f.dough === 'pastry')) return { kind: 'vessel', v, label: 'Lay the pastry over it' };
      return { kind: 'vessel', v, label: what === 'board' ? 'Tip it in' : v.kind === 'skillet' ? 'Into the skillet' : 'Into the pot' };
    }
    if (d.kind === 'egg' && Math.hypot(at.x - BOWL_AT.x, at.z - BOWL_AT.z) < 0.13) return { kind: 'bowl', label: 'Crack it into the bowl' };
    if (Math.abs(at.y - (COUNTER.y + 0.08)) < 0.05 && Math.abs(at.x - this.boardPos.x) < 0.24 && Math.abs(at.z - this.boardPos.z) < 0.15 && d.kind === 'food') return { kind: 'board', label: 'Back on the board' };
    if (at.distanceTo(_t1.copy(this.rack.position).setY(at.y)) < 0.2 && d.kind === 'food' && (d.f.kind === 'meat' || d.f.kind === 'bacon') && d.f.done < 0.3) return { kind: 'rack', label: 'Hang it to smoke' };
    return null;
  }

  private drop(at: THREE.Vector3 | null): void {
    const d = this.drag!;
    const tgt = at ? this.dropTarget(at) : null;
    this.drag = null;
    if (d.kind === 'egg') {
      if (tgt?.kind === 'vessel' && tgt.v) this.crackEgg(d.shell, tgt.v);
      else if (tgt?.kind === 'bowl') { d.shell.removeFromParent(); this.bowl.add('egg', 1); this.log.push({ k: 'crack', v: 'bowl' }); audio.play('bottle_clink', { pos: this.W(_t1.copy(BOWL_AT)), vol: 0.3, rate: 1.9 }); this.pop('Egg in', this.W(_t1.copy(BOWL_AT)).add(_t2.set(0, 0.12, 0)).clone()); }
      else { d.shell.removeFromParent(); this.left.set('eggs', (this.left.get('eggs') ?? 0) + 1); }
      return;
    }
    if (d.kind === 'board') {
      this.board.position.copy(this.boardPos); this.board.rotation.set(0, 0, 0);
      if (tgt?.kind === 'vessel' && tgt.v) for (const f of this.foods.filter((x) => x.where === 'board' && x.kind !== 'dough')) this.intoVessel(f, tgt.v);
      return;
    }
    if (d.kind === 'food') {
      const f = d.f;
      if (tgt?.kind === 'vessel' && tgt.v) { this.intoVessel(f, tgt.v); return; }
      if (tgt?.kind === 'rack') { this.hang(f); return; }
      if (tgt?.kind === 'board' || d.from === 'board') { f.where = 'board'; f.local.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.06); return; }
      if (d.fromV) { this.intoVessel(f, d.fromV); return; }
      f.where = 'board';
    }
  }

  private addFood(f: Food): void {
    if (!this.foods.includes(f)) this.foods.push(f);
    this.root.add(f.obj);
    f.setDone();
  }

  private intoVessel(f: Food, v: Vessel): void {
    if (v.kind === 'coffee') { f.where = 'board'; return; }
    const liquid = v.kind === 'pot' && v.wet > 0.05;
    if (f.kind === 'trout' && f.u1 - f.u0 > 0.45) { this.say('Too big for the pan. Cut it into steaks first.', 2.5); f.where = 'board'; return; }
    if (f.kind === 'dough' && f.dough !== 'pastry' && f.knead < 0.6) { this.say('Knead it first.', 2); f.where = 'board'; return; }
    if (f.kind === 'dough' && f.dough === 'pastry') {
      if (f.knead < 0.8) { this.say('Press the pastry out flat first.', 2); f.where = 'board'; return; }
      // the pastry lid: a flat round laid over whatever's in the pan
      this.foods = this.foods.filter((x) => x !== f); f.obj.removeFromParent();
      const pz = makeFood('pastry'); pz.key = 'pastry'; pz.units = 1; pz.where = v.kind;
      pz.lift0 = v.piles.length || v.foods.length ? 0.018 : 0;
      v.foods.push(pz); v.add('pastry', 1); this.addFood(pz);
      this.log.push({ k: 'pour', ing: 'pastry', v: v.kind });
      audio.play('foliage_rustle', { pos: this.W(_t1.copy(v.pos)), vol: 0.3, rate: 0.7 });
      return;
    }
    f.where = v.kind as Where;
    if (liquid) {
      if (f.kind === 'egg' || f.kind === 'trout' && false) { f.where = 'board'; return; }
      f.local.copy(this.freeSpot(v, f.r * 0.6));
      f.obj.scale.setScalar(0.7);
    } else {
      f.local.copy(this.freeSpot(v, f.r));
      f.yaw = Math.random() * 6.28;
    }
    v.foods.push(f);
    v.add(f.key, f.units);
    this.sear(v, f.key, (s) => { f.seared = s; });
    if (liquid) audio.play('pot_lid', { pos: this.W(_t1.copy(v.pos)), vol: 0.2, rate: 1.3 });
  }

  private hang(f: Food): void {
    if (this.rackStrips.length >= 6) { this.say('The rack is full.', 2); f.where = 'board'; return; }
    f.where = 'rack';
    f.local.set(-0.14 + this.rackStrips.length * 0.056, 0);
    this.rackStrips.push(f);
    if (this.rackStrips.length === 1) this.say('Close the draft down for more smoke. Give it a few hours.', 3.5);
  }
  private takeJerky(): void {
    if (!this.rackStrips.length || !this.rackStrips.every((f) => f.smoke >= 1)) return;
    const n = Math.max(1, Math.round(this.rackStrips.length * 0.75));
    this.g.give('cryptid_jerky', n);
    for (const f of this.rackStrips) { f.where = 'gone'; f.obj.removeFromParent(); }
    this.foods = this.foods.filter((f) => f.where !== 'gone');
    this.rackStrips = [];
    this.g.sound('pickup', undefined, 0.6);
    this.say(`${n} strip${n > 1 ? 's' : ''} of smoked jerky. Something out there is going to love this.`, 3.5);
  }

  private crackEgg(shell: THREE.Mesh, v: Vessel): void {
    shell.removeFromParent();
    const f = makeFood('egg');
    f.where = v.kind as Where;
    f.local.copy(this.freeSpot(v, f.r));
    f.yaw = Math.random() * 6.28;
    v.foods.push(f);
    v.add('egg', 1);
    this.addFood(f);
    this.log.push({ k: 'crack', v: v.kind });
    audio.play('bottle_clink', { pos: this.W(_t1.copy(v.pos)), vol: 0.3, rate: 1.9 });
    this.sear(v, 'egg', (s) => { f.seared = s; });
    this.bits.emit(this.W(_t1.copy(v.pos).add(_t2.set(f.local.x, 0.06, f.local.y))), V3(0, -0.4, 0), { color: new THREE.Color(0.9, 0.82, 0.7), size: 0.006, life: 0.3, spread: 0.6, n: 4 });
  }

  // ------------------------------------------------------------------------------------------ the bowl
  private bowlUpdate(d: Extract<Drag, { kind: 'bowl' }>, dt: number): void {
    const p = this.ptr;
    const at = this.carryPoint(0.12);
    const b = this.bowl, kind = b.kind;
    let tilt = 0;
    if (at) {
      this.bowlObj.position.lerp(at, Math.min(1, dt * 14));
      const v = this.vesselUnder(at);
      const overBoard = Math.abs(at.x - this.boardPos.x) < 0.24 && Math.abs(at.z - this.boardPos.z) < 0.15 && Math.abs(at.y - COUNTER.y - 0.12) < 0.06;
      let label = '';
      if (v && v.kind === 'skillet' && (kind === 'batter' || kind === 'runny')) label = 'Pour a flapjack';
      else if (v && v.kind === 'pot' && ['batter', 'dumpling', 'dough', 'runny', 'pastry'].includes(kind)) label = kind === 'batter' ? 'Spoon the batter in' : 'Drop dumplings in';
      else if (v && v.kind === 'pot' && (kind === 'wet' || kind === 'dry')) label = 'Tip it into the pot';
      else if (overBoard && ['dough', 'pastry', 'dumpling', 'crumbly'].includes(kind)) label = 'Turn the dough out onto the board';
      d.tgt = label ? (v ? { kind: 'vessel', v, label } : { kind: 'board', label }) : null;
      tilt = d.tgt ? 0.9 : 0;
      this.hover = { text: label || (b.empty ? 'Empty' : 'Not here'), at: this.W(at) };
    }
    this.bowlObj.rotation.set(0, 0, -tilt);
    if (p.released) {
      this.drag = null;
      const t = d.tgt;
      this.bowlObj.position.copy(BOWL_AT); this.bowlObj.rotation.set(0, 0, 0);
      if (!t) return;
      if (t.kind === 'board') this.doughOut();
      else if (t.v) this.bowlInto(t.v, at!);
    }
  }

  /** the bowl's dough onto the board */
  private doughOut(): void {
    const b = this.bowl, kind = b.kind;
    if (this.boardBusy()) { this.say('Clear the board first.', 2); return; }
    if (kind === 'crumbly') { this.say('Too dry to hold together. A little more water.', 2.5); return; }
    const f = makeFood('dough', { flat: 0, berry: b.get('berries') > 0 });
    f.dough = kind === 'pastry' ? 'pastry' : kind === 'dumpling' ? 'dumpling' : 'bannock';
    f.lift = b.lift;
    f.units = Math.max(0.3, b.flour / 3);
    f.where = 'board';
    this.addFood(f);
    this.log.push({ k: 'turnout', s: f.dough });
    b.clear();
    audio.play('foliage_rustle', { pos: this.W(_t1.copy(this.boardPos)), vol: 0.4, rate: 0.6 });
    this.pop(f.dough === 'pastry' ? 'Press it out flat' : 'Knead it', this.W(_t1.copy(this.boardPos)).add(_t2.set(0, 0.08, 0)).clone(), '#ffe08a');
  }

  /** batter into the skillet (a flapjack), dumplings or batter into the pot, liquid into the pot */
  private bowlInto(v: Vessel, at: THREE.Vector3): void {
    const b = this.bowl, kind = b.kind;
    const lift = b.lift;
    if (v.kind === 'skillet' && (kind === 'batter' || kind === 'runny')) {
      b.take(0.25);
      const f = makeFood('flapjack', { r: kind === 'runny' ? 0.055 : 0.045 });
      f.key = 'flapjack'; f.where = 'skillet';
      f.local.set(clamp(at.x - v.pos.x, -0.05, 0.05), clamp(at.z - v.pos.z, -0.05, 0.05));
      for (const o of v.foods) if (o.local.distanceTo(f.local) < 0.06) f.local.copy(this.freeSpot(v, f.r));
      f.yaw = Math.random() * 6;
      v.foods.push(f); v.add('flapjack', 0.25); v.add('batter', 0.25); v.lift = lift; if (!v.mixes.includes('batter')) v.mixes.push('batter');
      this.addFood(f);
      this.log.push({ k: 'pour', ing: 'batter', v: 'skillet' });
      this.sear(v, 'flapjack', (s) => { f.seared = s; });
      return;
    }
    if (v.kind === 'pot' && ['batter', 'dumpling', 'dough', 'pastry'].includes(kind)) {
      const n = Math.max(1, Math.min(6, Math.round(b.volume / 0.3)));
      for (let i = 0; i < n; i++) {
        const f = makeFood('dumpling'); f.key = 'dumpling'; f.where = 'pot';
        f.local.copy(this.freeSpot(v, 0.03)); f.yaw = Math.random() * 6;
        v.foods.push(f); this.addFood(f);
      }
      const mk = kind === 'batter' ? 'batter' : 'dumpling';
      v.add(mk, 1); v.add('dumpling', 0.25 * n); v.lift = lift; v.mixes.push(mk);
      this.log.push({ k: 'pour', ing: mk, v: 'pot' });
      b.clear();
      audio.play('pot_lid', { pos: this.W(_t1.copy(v.pos)), vol: 0.25, rate: 1.1 });
      this.pop(kind === 'batter' ? 'Batter on top. Lid on.' : 'Dumplings in. Lid on.', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.15, 0)).clone(), '#ffe08a');
      return;
    }
    if (v.kind === 'pot') {
      for (const [k, q] of b.take(b.volume)) {
        if (k === 'water') v.water += q * 0.25;
        else if (k === 'milk') v.add('milk', q);
        else v.add(k === 'bp' ? 'bp' : k, q);
      }
      b.clear();
    }
  }

  // ------------------------------------------------------------------------------------------ cutting (stock, trout)
  private cutUpdate(d: Extract<Drag, { kind: 'cut' }>, _dt: number): void {
    const p = this.ptr;
    const at = this.pointerOnPlane(this.W(_t1.set(0, COUNTER.y + 0.04, 0)).y);
    let len = 0;
    const center = _t3.copy(this.boardPos);
    if (d.target === 'stock' && this.stock) { len = this.stock.len; center.copy(this.stock.obj.position); }
    else if (d.f) { len = (d.f.u1 - d.f.u0) * 0.42; this.boardSurface(d.f.local, center); }
    const c = center.clone();
    if (at && !d.done) {
      const l = this.L(at);
      d.at = clamp(l.x - c.x, -len / 2 + 0.004, len / 2 - 0.004);
      if (d.depth < 0.25 && Math.abs(p.x - d.x0) > 0.08) {
        // a sideways tug before the knife bites picks the piece up instead (the end of a loin: the whole lot)
        this.putBack(this.knife); this.drag = null;
        if (d.f) { this.startFoodDrag(d.f); return; }
        if (this.stock && this.stock.kind !== 'shroom') {
          const st = this.stock;
          const f = makeFood(st.kind === 'bacon' ? 'bacon' : 'meat', { thick: st.kind === 'bacon' ? Math.min(0.03, st.len) : Math.min(0.02, st.len * 0.4) });
          f.key = st.key; f.units = st.len / (st.kind === 'bacon' ? 0.2 : 0.15); f.where = 'board';
          st.obj.removeFromParent(); this.stock = null;
          this.addFood(f); this.startFoodDrag(f);
        }
        return;
      }
    }
    const depth = clamp((d.y0 - p.y) / 0.16, 0, 1);
    if (depth > d.depth) {
      d.depth = depth;
      if (Math.random() < 0.25) audio.play('saw_hand', { pos: this.W(_t1.copy(c)), vol: 0.05, rate: 2.2 });
    }
    this.hover = { text: d.done ? '' : 'Draw the knife down', at: this.W(_t1.copy(c)).add(_t2.set(0, 0.06, 0)).clone() };
    if (!d.done && d.depth >= 1) {
      d.done = true;
      this.g.sound('knife_chop', this.W(_t1.copy(c)), 0.7);
      this.doCut(d, len, c);
    }
    if (p.released) { this.drag = null; this.putBack(this.knife); }
  }

  private doCut(d: Extract<Drag, { kind: 'cut' }>, len: number, center: THREE.Vector3): void {
    if (d.target === 'stock' && this.stock) {
      const st = this.stock;
      if (st.kind === 'shroom') {
        st.chops++;
        if (st.chops >= 3) {
          st.obj.removeFromParent(); this.stock = null;
          const f = makeFood('shroom'); f.where = 'board'; f.local.set(0, 0); this.addFood(f);
          this.log.push({ k: 'cut', ing: 'chanterelle' });
          this.pop('Chopped', this.W(_t1.copy(center)).add(_t2.set(0, 0.05, 0)).clone(), '#ffe08a');
        } else this.pop(`Chop ${st.chops}`, this.W(_t1.copy(center)).add(_t2.set(0, 0.05, 0)).clone());
        return;
      }
      const t = clamp(len / 2 - d.at, 0.004, 0.035);
      const kind = st.kind === 'bacon' ? 'bacon' : 'meat';
      const f = makeFood(kind, { thick: st.kind === 'bacon' ? t : Math.min(0.012, t * 0.5) });
      f.key = st.key;
      if (st.kind === 'meat') { f.r = 0.05; f.units = t / 0.15; }
      f.where = 'board';
      const n = this.foods.filter((x) => x.where === 'board').length;
      f.local.set(0.1 + (n % 2) * 0.075, -0.07 + Math.floor(n / 2) * 0.07);
      f.yaw = Math.random() * 6.28;
      this.addFood(f);
      st.len -= t;
      if (st.len < 0.012) { st.obj.removeFromParent(); this.stock = null; }
      else { st.rebuild(); st.obj.position.copy(this.boardSurface(_v2.set(-0.17 + st.len / 2, -0.01))); }
      const ideal = st.kind === 'bacon' ? 0.01 : 0.02;
      const msg = t < ideal * 0.6 ? 'Thin' : t > ideal * 1.6 ? 'Thick' : 'Even';
      this.log.push({ k: 'slice', ing: st.key, s: msg });
      this.pop(msg, this.W(this.boardSurface(f.local)).add(_t2.set(0, 0.04, 0)).clone(), msg === 'Even' ? '#ffe08a' : '#e0c8a0');
      return;
    }
    if (d.f) {
      const f = d.f;
      const span = f.u1 - f.u0;
      const u = f.u0 + (d.at / len + 0.5) * span;
      if (u - f.u0 < 0.06 || f.u1 - u < 0.06) { this.pop('Too thin', this.W(_t1.copy(center)).add(_t2.set(0, 0.05, 0)).clone()); return; }
      this.foods = this.foods.filter((x) => x !== f); f.obj.removeFromParent();
      const a = makeFood('trout', { u0: f.u0, u1: u }), b = makeFood('trout', { u0: u, u1: f.u1 });
      const base = f.local.clone();
      const off = (x: number) => (x - (f.u0 + f.u1) / 2) * 0.42;
      a.local.set(base.x + off((f.u0 + u) / 2) - 0.008, base.y); b.local.set(base.x + off((u + f.u1) / 2) + 0.008, base.y);
      a.where = b.where = 'board';
      this.addFood(a); this.addFood(b);
      this.log.push({ k: 'slice', ing: 'trout' });
    }
  }

  // ------------------------------------------------------------------------------------------ lids
  private liftLid(lid: Lid): void {
    if (lid.on) {
      const v = lid.on;
      lid.on = null; v.lid = null;
      this.log.push({ k: 'lid', v: v.kind, s: 'off' });
      // a burst of steam from under it
      puffs.emit(this.W(_t1.copy(v.pos).add(_t2.set(0, 0.12, 0))), V3(0, 0.3, 0), { size: 0.04, grow: 3, life: 1.4, color: new THREE.Color(0.92, 0.92, 0.92), alpha: smooth(60, 100, v.T) * 0.4, rise: 0.25, n: 3 });
    }
    this.root.attach(lid.obj);
    audio.play('pot_lid', { pos: lid.obj.getWorldPosition(_t1), vol: 0.35, rate: 0.9 });
  }
  private dropLid(lid: Lid, at: THREE.Vector3 | null): void {
    this.drag = null;
    const v = at ? this.vesselUnder(at, lid.kind) : null;
    if (v) {
      lid.on = v; v.lid = lid;
      v.obj.add(lid.obj);
      lid.obj.position.set(0, lid.kind === 'skillet' ? 0.049 : 0.112, 0);
      lid.obj.quaternion.identity();
      audio.play('pot_lid', { pos: this.W(_t1.copy(v.pos)), vol: 0.6, rate: 0.75 });
      this.log.push({ k: 'lid', v: v.kind, s: 'on' });
      if (v.fat && v.fat.fire > 0) this.pop('Lid on!', this.W(_t1.copy(v.pos)).add(_t2.set(0, 0.16, 0)).clone(), '#ffe08a');
      return;
    }
    lid.obj.position.copy(lid.rest.p); lid.obj.quaternion.copy(lid.rest.q);
  }

  // ------------------------------------------------------------------------------------------ tasting
  private startTaste(v: Vessel | 'served'): void {
    if (v !== 'served' && v.empty && v.wet < 0.05) { this.say('Nothing in it to taste.', 1.5); return; }
    this.act = { kind: 'taste', t: 0, v, said: false };
    this.inHand(this.spoon);
  }
  private actUpdate(dt: number): void {
    const a = this.act!;
    a.t += dt;
    if (!a.said && a.t > 1.0) {
      a.said = true;
      const v = a.v === 'served' ? null : a.v;
      if (v) {
        v.tasted = true;
        const verdict = this.tasteVerdict(v);
        this.log.push({ k: 'taste', v: v.kind, s: verdict });
        this.say(verdict, 3.2);
        this.g.sound('eat_chew', undefined, 0.3, 1.2);
      }
    }
    if (a.t > 1.5) { this.act = null; this.putBack(this.spoon); }
  }
  /** how it tastes right now */
  private tasteVerdict(v: Vessel): string {
    const d = this.summarize(v);
    if (v.kind === 'coffee') {
      const C = v.coffee;
      if (!C.grounds) return v.T > 80 ? 'Hot water.' : 'Cold water.';
      if (C.grounds === 'coffee') return C.boil < 0.5 ? 'Weak. Bring it to a boil.' : C.settle < 1 ? 'Gritty. Let it settle.' : 'Strong and black.';
      return C.steep < 10 ? 'Weak. Let it steep.' : C.boil > 3 ? 'Bitter: it boiled.' : 'Fragrant.';
    }
    const r = matchRecipe(d);
    const out: string[] = [];
    const solids = Object.keys(d.least).filter((k) => !['salt', 'pepper', 'water'].includes(k));
    const least = solids.length ? Math.min(...solids.map((k) => d.least[k])) : 1;
    if (least < 0.35) out.push(v.wet > 0.05 ? 'Still crunchy. Let it simmer.' : 'Still raw.');
    const band = r?.salt ?? (v.wet > 0.05 ? [3, 12] as [number, number] : [1, 6] as [number, number]);
    if (r && band[1] <= 4 && band[0] === 0) out.push(d.has.syrup || d.has.sugar || d.has.berries ? 'Sweet. Good.' : 'Needs something sweet.');
    else if (d.salt < band[0]) out.push(d.salt === 0 ? 'Bland. Needs salt.' : 'Could use a bit more salt.');
    else if (d.salt > band[1]) out.push('Too salty!');
    else out.push('The salt\'s right.');
    if (r && r.want.some((g) => g.includes('pepper')) && d.pepper === 0) out.push('A bit of pepper wouldn\'t hurt.');
    if (d.scorch > 0.3) out.push('Tastes scorched.');
    if (d.fat.fired > 0.5 || d.fat.smoked > 6) out.push('Smoky. Acrid.');
    if (d.greasy > 0.35) out.push('Greasy.');
    if (r && !this.unlocked(r.id)) out.push(`Something like ${r.name.toLowerCase()}...`);
    return out.slice(0, 3).join(' ');
  }

  // ------------------------------------------------------------------------------------------ summing up a dish
  /** what's in a vessel, for recipes, tasting and grading */
  summarize(v: Vessel): Dish {
    const has: Record<string, number> = {};
    for (const [k, n] of v.added) has[k] = (has[k] ?? 0) + n;
    if (v.water > 0.01) has.water = v.water;
    if (v.fat && v.fat.drip > 3) has.fatback = v.fat.drip / 15;
    const cooked: Record<string, number> = {}, least: Record<string, number> = {}, worst: Record<string, number> = {}, sizes: Record<string, string> = {};
    const acc = (k: string, lo: number, hi: number, mean: number) => {
      least[k] = Math.min(least[k] ?? 9, lo); worst[k] = Math.max(worst[k] ?? 0, hi);
      cooked[k] = cooked[k] === undefined ? mean : (cooked[k] + mean) / 2;
    };
    let greasy = 0, gn = 0;
    for (const f of v.foods) { acc(f.key, f.least, f.worst, f.done); greasy += f.greasy; gn++; }
    let melt = 0;
    for (const p of v.piles) {
      if (p.kind === 'cheese') { melt = Math.max(melt, p.melt); continue; }
      acc(p.key, Math.min(p.a, p.b), p.worst, p.done); sizes[p.key] = p.cls; greasy += p.greasy; gn++;
    }
    const fat = v.fat;
    return {
      vessel: v.kind, has, cooked, least, worst, sizes,
      seared: [...v.seared], browned: [...v.browned], greasy: gn ? greasy / gn : 0,
      water: v.kind === 'coffee' ? v.water : v.wet,
      simmer: v.pot.simmer, boil: v.pot.boil, lidSecs: v.pot.lidSecs, scorch: v.pot.scorch,
      tasted: v.tasted, salt: has.salt ?? 0, pepper: has.pepper ?? 0,
      fat: { total: fat ? (fat.total + fat.solid) / 15 : 0, main: fat?.main ?? 'oil', brown: fat?.brown ?? 0, smoked: fat?.smokedFor ?? 0, fired: fat?.firedFor ?? 0, maxT: fat?.maxT ?? v.T },
      flips: v.flips, badFlips: v.badFlips, mixes: v.mixes, lift: v.lift,
      coffee: v.kind === 'coffee' ? { boil: v.coffee.boil, settle: v.coffee.settle, leaves: v.coffee.grounds, steep: v.coffee.steep, maxT: v.coffee.maxT } : undefined,
      melt,
    };
  }

  // ------------------------------------------------------------------------------------------ serving
  private dropVessel(v: Vessel, at: THREE.Vector3 | null): void {
    this.drag = null;
    if (at && this.overServe(at) && v.kind !== 'coffee') { this.serve(v); v.pos.copy(this.homeOf(v)); v.obj.position.copy(v.pos); return; }
    if (at && this.overMug(at) && v.kind === 'coffee') { this.pourCup(); v.pos.copy(this.homeOf(v)); v.obj.position.copy(v.pos); return; }
    let dest = at ? at.clone() : this.homeOf(v);
    const onPlate = dest.x > PLATE.x0 - 0.05 && dest.x < PLATE.x1 + 0.05 && dest.z > PLATE.z0 - 0.05 && dest.z < PLATE.z1 + 0.1;
    if (onPlate) {
      dest.y = PLATE.y;
      dest.x = clamp(dest.x, PLATE.x0 + v.r * 0.6, PLATE.x1 - v.r * 0.6);
      dest.z = clamp(dest.z, PLATE.z0 + v.r * 0.6, PLATE.z1 - v.r * 0.4);
    } else if (dest.x > COUNTER.x0 && dest.x < COUNTER.x1 && dest.z > COUNTER.z0 && dest.z < COUNTER.z1) dest.y = COUNTER.y;
    else if (dest.x > PANTRY.x0 && dest.x < PANTRY.x1 && dest.z > PANTRY.z0 && dest.z < PANTRY.z1) dest.y = PANTRY.y;
    else dest = this.homeOf(v);
    for (const o of this.vessels) if (o !== v && Math.abs(o.pos.y - dest.y) < 0.05) {
      const dx = dest.x - o.pos.x, dz = dest.z - o.pos.z, dd = Math.hypot(dx, dz), min = (v.r + o.r) * 0.82;
      if (dd < min) { const k = (min - dd) / Math.max(1e-3, dd); dest.x += dx * k; dest.z += dz * k; }
    }
    v.pos.copy(dest); v.obj.position.copy(dest);
    audio.play('pot_lid', { pos: this.W(_t1.copy(dest)), vol: 0.35, rate: 0.7 });
  }
  private homeOf(v: Vessel): THREE.Vector3 {
    return v.kind === 'skillet' ? V3(0, PLATE.y, 0.27) : v.kind === 'pot' ? V3(-0.095, PLATE.y, 0.02) : V3(0.125, PLATE.y, 0.0);
  }

  /** grade what's in a vessel and put it on the plate (or in a bowl) */
  private serve(v: Vessel): Verdict | null {
    if (this.served) { this.say('Eat what\'s on the plate first.', 2); return null; }
    if (v.empty) return null;
    const d = this.summarize(v);
    const verdict = judge(d, this.log, (id) => this.unlocked(id));
    if (!verdict) { this.say('That\'s not a meal. Not yet.', 2.5); return null; }
    if (verdict.raw && !verdict.burnt && verdict.q < 0.45) { this.say('Still raw. Give it time on the heat.', 2.5); return null; }
    if (v.lid) { const l = v.lid; this.liftLid(l); this.dropLid(l, null); }
    const bowl = v.kind === 'pot' && v.wet > 0.05;
    const dish = bowl ? this.dishBowl : this.plateObj;
    this.plateObj.visible = !bowl; this.dishBowl.visible = bowl;
    const foods = v.foods.slice(), piles = v.piles.slice();
    const extra: THREE.Mesh[] = [], onPlate: Pile[] = [];
    for (const f of foods) { f.where = 'plate'; f.local.set((Math.random() - 0.5) * 0.07, (Math.random() - 0.5) * 0.05); f.lift0 = 0; f.obj.scale.setScalar(bowl ? 0.75 : 1); }
    // flapjacks stack up
    let stack = 0;
    for (const f of foods) if (f.kind === 'flapjack') { f.local.set(0, 0); f.lift0 = stack; stack += 0.01; }
    for (const p of piles) {
      v.piles.splice(v.piles.indexOf(p), 1);
      if (p.kind === 'cheese') { p.dispose(); continue; }
      p.layout(bowl ? 0.05 : 0.065, Math.random() * 999, bowl ? 0 : 1);
      p.obj.position.copy(dish.position).add(V3(0, bowl ? 0.04 : 0.012, 0));
      p.obj.rotation.set(0, 0, 0); p.obj.scale.setScalar(bowl ? 0.8 : 1);
      onPlate.push(p);
    }
    if (bowl && v.liquid) {
      const m = new THREE.Mesh(discGeo(0.062, 18), v.liquid.mat);
      m.position.copy(dish.position).add(V3(0, 0.042, 0));
      this.root.add(m);
      extra.push(m);
    }
    const hit = proxy(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 12));
    hit.position.copy(dish.position).add(V3(0, 0.035, 0));
    this.root.add(hit);
    this.served = { v: verdict, foods, piles: onPlate, obj: dish, hit, extra };
    v.reset(v.kind === 'skillet' ? 15 : 0);
    audio.play('bottle_clink', { pos: this.W(_t1.copy(dish.position)), vol: 0.35, rate: 0.7 });
    const stars = '★'.repeat(GRADE_STARS[verdict.grade]) + '☆'.repeat(3 - GRADE_STARS[verdict.grade]);
    this.pop(`${verdict.name}  ${stars}  ${GRADE_NAME[verdict.grade]}`, this.W(_t1.copy(dish.position)).add(_t2.set(0, 0.12, 0)).clone(), '#ffe08a');
    const notes = verdict.notes.length ? ` (${verdict.notes.join(', ')})` : '';
    this.say(`${verdict.name}: ${GRADE_NAME[verdict.grade].toLowerCase()}${notes}. Eat it hot, or right-click to pack it.`, 3.5);
    if (verdict.recipe) {
      const r = verdict.recipe;
      this.servedTicks.set(r.id, verdict.steps.slice());
      const prev = this.best.get(r.id);
      if (!prev || GRADE_STARS[verdict.grade] > GRADE_STARS[prev]) this.best.set(r.id, verdict.grade);
      if (!this.unlocked(r.id)) { this.unlock(r.id); this.say(`You worked it out: ${r.name}. A new card for the box.`, 3.5); }
    }
    this.log.push({ k: 'serve', s: verdict.item, n: verdict.q });
    return verdict;
  }

  /** the coffee pot into the mug */
  private pourCup(): void {
    const v = this.coffee, C = v.coffee;
    if (this.poured) { this.say('Drink the cup you poured first.', 2); return; }
    if (!C.grounds) { this.say(v.T > 80 ? 'That\'s just hot water. Grounds or leaves first.' : 'Cold water. Heat it first.', 2.5); return; }
    if (C.grounds === 'coffee' && C.boil < 0.5) { this.say('Boil it first.', 2); return; }
    const verdict = judge(this.summarize(v), this.log, (id) => this.unlocked(id));
    if (!verdict) return;
    this.poured = { v: verdict };
    this.log.push({ k: 'serve', s: verdict.item, n: verdict.q, v: 'coffee' });
    C.poured++;
    if (C.poured >= 3) { C.grounds = ''; C.boil = 0; C.settle = 0; C.poured = 0; C.steep = 0; v.added.clear(); v.calls.clear(); }
    audio.play('drink_gulp', { pos: this.W(_t1.copy(this.mugObj.position)), vol: 0.25, rate: 0.6 });
    puffs.emit(this.W(_t1.copy(this.mugObj.position)).add(_t2.set(0, 0.1, 0)), V3(0, 0.2, 0), { size: 0.04, grow: 3, life: 2, color: new THREE.Color(0.92, 0.92, 0.92), alpha: 0.3, rise: 0.2, n: 3 });
    const disc = new THREE.Mesh(discGeo(0.036, 14), liquidMat(C.grounds === 'coffee' || verdict.item === 'cowboy_coffee' ? 'coffee' : 'syrup'));
    disc.position.set(0, 0.08, 0);
    disc.name = 'coffee_fill';
    this.mugObj.add(disc);
    if (verdict.recipe) { const prev = this.best.get(verdict.recipe.id); if (!prev || GRADE_STARS[verdict.grade] > GRADE_STARS[prev]) this.best.set(verdict.recipe.id, verdict.grade); if (!this.unlocked(verdict.recipe.id)) this.unlock(verdict.recipe.id); }
    this.pop(`${verdict.name}  ${'★'.repeat(GRADE_STARS[verdict.grade])}`, this.W(_t1.copy(this.mugObj.position)).add(_t2.set(0, 0.12, 0)).clone(), '#ffe08a');
  }

  private eatServed(which: 'plate' | 'mug'): void {
    const g = this.g;
    const s = which === 'mug' ? this.poured : this.served;
    if (!s) return;
    const v = s.v;
    g.survival.eat(v.kcal, v.warmth + 0.05);
    g.sound(which === 'mug' ? 'drink_gulp' : 'eat_chew', undefined, 0.7);
    if (v.grade === 'perfect') setTimeout(() => g.sound('sigh_satisfied', undefined, 0.5), 900);
    const buff = this.buffs.apply(v.buff, GRADE_MULT[v.grade], v.name);
    this.say(`${v.line}${buff ? `  <b>${buff}.</b>` : ''}`, 4.5);
    this.log.push({ k: 'eat', s: v.item });
    if (which === 'mug') { this.mugObj.getObjectByName('coffee_fill')?.removeFromParent(); this.poured = null; }
    else this.clearServed();
  }

  private packServed(which: 'plate' | 'mug'): void {
    const g = this.g;
    const s = which === 'mug' ? this.poured : this.served;
    if (!s) return;
    g.give(s.v.item);
    const q = this.packed.get(s.v.item) ?? []; q.push(s.v.grade); this.packed.set(s.v.item, q);
    g.sound('pickup', undefined, 0.5);
    this.say(`${s.v.name} wrapped up in the pack.`, 2.5);
    if (which === 'mug') { this.mugObj.getObjectByName('coffee_fill')?.removeFromParent(); this.poured = null; }
    else this.clearServed();
  }

  /** a packed dish eaten later from the pack still gives its buff */
  private ateLater(id: string): void {
    const q = this.packed.get(id);
    const r = RECIPES.find((x) => x.item === id);
    if (!r) return;
    const grade = q?.shift() ?? 'good';
    const said = this.buffs.apply(r.buff, GRADE_MULT[grade], r.name);
    if (said) hud.say(`<i>${said}.</i>`, 2.5);
  }

  private clearServed(): void {
    const s = this.served!;
    for (const f of s.foods) { f.where = 'gone'; f.obj.removeFromParent(); }
    this.foods = this.foods.filter((f) => f.where !== 'gone');
    for (const m of s.extra) { m.removeFromParent(); m.geometry.dispose(); }
    for (const p of s.piles) p.dispose();
    s.hit.removeFromParent();
    this.served = null;
    this.plateObj.visible = true; this.dishBowl.visible = false;
  }

  // ------------------------------------------------------------------------------------------ hands
  private handsIdle(): void {
    const H = this.hands, d = this.drag, p = this.ptr;
    // scratch vectors and quaternions from a pool (no allocation per frame; the hands copy their targets)
    this.vi = 0; this.qi = 0;
    const vp = (): THREE.Vector3 => this.vpool[this.vi++] ?? (this.vpool[this.vi - 1] = new THREE.Vector3());
    const qp = (): THREE.Quaternion => this.qpool[this.qi++] ?? (this.qpool[this.qi - 1] = new THREE.Quaternion());
    const fq = (sd: 'L' | 'R', f: THREE.Vector3, n: THREE.Vector3): THREE.Quaternion => H.freeQ(sd, f, n, qp());
    const tq = (y: THREE.Vector3, z: THREE.Vector3): THREE.Quaternion => StationHands.toolQ(y, z, qp());
    const Wp = (q: THREE.Vector3): THREE.Vector3 => this.root.localToWorld(vp().copy(q));
    const dW = (q: THREE.Vector3): THREE.Vector3 => vp().copy(q).applyQuaternion(this.root.getWorldQuaternion(_q1)).normalize();
    const cam = this.g.camera;
    const down = _hd.set(0, -1, 0);
    const fwd = _hf.set(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    const side = _hs.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
    H.stiff.R = 24; H.stiff.L = 22;
    if (this.act) {
      // tasting: the spoon dips into the pot, comes up to the mouth, goes back
      const a = this.act, t = a.t;
      const v = a.v === 'served' ? null : a.v;
      const potP = v ? Wp(_t1.copy(v.pos).add(_t2.set(0, v.kind === 'pot' ? this.liquidY(v) + 0.01 : 0.03, 0))) : Wp(_t1.copy(SERVE).add(_t2.set(0, 0.04, 0)));
      const mouth = _t2.set(0.02, -0.06, -0.14).applyMatrix4(cam.matrixWorld);
      const k = t < 0.5 ? 0 : t < 0.9 ? (t - 0.5) / 0.4 : t < 1.15 ? 1 : Math.max(0, 1 - (t - 1.15) / 0.35);
      const tip = _t3.copy(potP).lerp(mouth, smooth(0, 1, k));
      const up = vp().set(0, 1, 0).addScaledVector(fwd, -0.4).normalize();
      H.set('R', { pos: vp().copy(tip).addScaledVector(up, 0.17), q: tq(vp().copy(up).negate(), fwd), grip: GRIP.handle });
      H.rest('L');
      return;
    }
    if (this.cardOpen !== null) {
      // reading: the hands drop out of the way (the card is held up close to the eye)
      H.rest('L'); H.rest('R');
      return;
    }
    if (!d) {
      const at = this.hover?.at;
      if (at && this.viewName !== 'door' && this.hover?.text) {
        const toCam = _t1.copy(cam.position).sub(at).normalize();
        const pos = vp().copy(at).addScaledVector(side, 0.07).addScaledVector(toCam, 0.04).add(_t2.set(0, 0.035, 0));
        const f = vp().copy(at).sub(pos).normalize();
        H.set('R', { pos, q: fq('R', f, vp().copy(down).addScaledVector(side, -0.4).normalize()), grip: GRIP.relax });
      } else H.rest('R');
      H.rest('L');
      return;
    }
    switch (d.kind) {
      case 'carry': case 'food': case 'egg': {
        const o = d.kind === 'carry' ? d.p.obj : d.kind === 'food' ? d.f.obj : d.shell;
        const w = o.getWorldPosition(vp()).add(_t1.set(0, d.kind === 'egg' ? 0.03 : 0.05, 0)).addScaledVector(fwd, -0.03);
        const shaking = d.kind === 'carry' && d.p.ing?.how === 'shake' && d.tgt?.flow && p.down;
        H.set('R', { pos: w, q: fq('R', vp().copy(fwd).add(_t2.set(0, shaking ? 1.1 : -1.1, 0)), vp().copy(down).addScaledVector(fwd, 0.25).normalize()), grip: d.kind === 'egg' ? GRIP.cup : d.kind === 'carry' && d.tgt?.flow ? GRIP.handle : GRIP.claw });
        // measuring: the left hand holds the cup (or the spoon) over the target
        if (d.kind === 'carry' && d.p.ing?.how === 'measure' && d.tgt?.flow && p.down) {
          const tool = d.p.id === 'baking_powder' ? this.tsp : this.cup;
          this.inHand(tool, 'L');
          H.set('L', { pos: vp().copy(w).add(_t2.set(0, -0.1, 0)).addScaledVector(side, -0.03), q: tq(vp().copy(side).negate(), vp().set(0, 1, 0)), grip: GRIP.handle });
        } else { if (this.cup.parent !== this.root) this.putBack(this.cup); if (this.tsp.parent !== this.root) this.putBack(this.tsp); H.rest('L'); }
        break;
      }
      case 'board': case 'bowl': {
        const c = (d.kind === 'board' ? this.board : this.bowlObj).getWorldPosition(vp());
        const half = d.kind === 'board' ? 0.12 : 0.1;
        H.set('R', { pos: vp().copy(c).addScaledVector(side, half).add(_t1.set(0, 0.05, 0)), q: fq('R', vp().copy(fwd).addScaledVector(side, -0.3), vp().copy(side).negate()), grip: GRIP.pinch });
        H.set('L', { pos: vp().copy(c).addScaledVector(side, -half).add(_t1.set(0, 0.05, 0)), q: fq('L', vp().copy(fwd).addScaledVector(side, 0.3), vp().copy(side)), grip: GRIP.pinch });
        break;
      }
      case 'vessel': {
        const v = d.v;
        const hp = Wp(_t1.copy(v.pos).add(v.kind === 'skillet' ? _t2.set(0, 0.06, 0.21) : v.kind === 'pot' ? _t2.set(0, 0.13, 0) : _t2.set(0, 0.12, -0.085)));
        const ax = v.kind === 'skillet' ? dW(vp().set(0, 0.15, -1)) : vp().set(0, 1, 0);
        H.set('R', { pos: vp().copy(hp), q: tq(v.kind === 'skillet' ? vp().copy(ax).negate() : vp().copy(side).negate(), vp().set(0, 1, 0)), grip: GRIP.handle });
        H.rest('L');
        break;
      }
      case 'lid': {
        const c = d.lid.obj.getWorldPosition(vp()).add(_t1.set(0, 0.05, 0));
        H.set('R', { pos: c, q: fq('R', vp().copy(fwd).add(_t2.set(0, -1.2, 0)), down), grip: GRIP_KNOB });
        H.rest('L');
        break;
      }
      case 'flip': case 'toss': {
        const v = d.v;
        const fp = d.kind === 'flip' ? Wp(this.foodWorldLocal(d.f, v, vp())).add(_t1.set(0, 0.01 + d.lift, 0)) : Wp(_t1.copy(v.pos).add(_t2.set(Math.sin(this.time * 6) * 0.03, v.floor + 0.012, Math.cos(this.time * 6) * 0.03)));
        const lift = d.kind === 'flip' ? d.lift : 0;
        const along = vp().copy(fwd).add(_t2.set(0, -0.35 - lift * 4, 0)).normalize();
        H.set('R', { pos: vp().copy(fp).addScaledVector(along, -0.2).addScaledVector(side, 0.02), q: tq(along, vp().set(0, 1, 0)), grip: GRIP.handle });
        const hp = Wp(_t1.copy(v.pos).add(_t2.set(0, 0.06, 0.21)));
        H.set('L', { pos: vp().copy(hp), q: tq(dW(vp().set(0, -0.15, 1)), vp().set(0, 1, 0)), grip: GRIP.handle });
        H.stiff.R = 40;
        break;
      }
      case 'cut': case 'chop': {
        let center: THREE.Vector3, len: number, at: number, depth: number;
        if (d.kind === 'cut') {
          center = d.target === 'stock' && this.stock ? vp().copy(this.stock.obj.position) : d.f ? this.boardSurface(d.f.local, vp()) : vp().copy(this.boardPos);
          len = d.target === 'stock' && this.stock ? this.stock.len : d.f ? (d.f.u1 - d.f.u0) * 0.42 : 0.1;
          at = d.at; depth = d.depth;
        } else {
          center = this.boardSurface(d.p.local, vp());
          const e = d.p.extent(); len = e.x1 - e.x0; at = d.at; depth = d.depth;
        }
        const along = dW(vp().set(1, 0, 0));
        const blade = Wp(center).addScaledVector(along, at).add(_t1.set(0, 0.075 * (1 - depth) + 0.004, 0));
        const bladeDir = vp().copy(fwd).multiplyScalar(0.72).addScaledVector(side, -0.69).add(_t1.set(0, -0.16, 0)).normalize();
        H.set('R', { pos: vp().copy(blade).addScaledVector(bladeDir, -0.135).add(_t1.set(0, 0.035, 0)), q: tq(bladeDir, vp().set(0, -1, 0)), grip: GRIP.handle });
        const claw = Wp(center).addScaledVector(along, -len / 2 + 0.02).add(_t1.set(0, 0.055, 0)).addScaledVector(fwd, -0.02);
        H.set('L', { pos: claw, q: fq('L', vp().copy(down).addScaledVector(fwd, 0.5).addScaledVector(side, 0.2), vp().copy(down).addScaledVector(side, 0.3)), grip: GRIP.claw });
        H.stiff.R = 34;
        break;
      }
      case 'scrape': {
        // the knife flat on the board, spine leading
        const c = d.p.obj.getWorldPosition(vp());
        const across = dW(vp().set(0, 0, 1));
        const dir = p.dx >= 0 ? dW(vp().set(1, 0, 0)) : dW(vp().set(-1, 0, 0));
        const grip = vp().copy(c).addScaledVector(across, 0.14).addScaledVector(dir, -0.03).add(_t1.set(0, 0.012, 0));
        H.set('R', { pos: grip, q: tq(vp().copy(across).negate(), vp().copy(dir).negate()), grip: GRIP.handle });
        H.rest('L');
        break;
      }
      case 'peel': case 'press': {
        const c = (d.kind === 'peel' ? d.p.obj : d.p?.obj ?? d.f?.obj ?? this.board).getWorldPosition(vp());
        const wob = Math.sin(this.time * 12) * 0.01;
        H.set('R', { pos: vp().copy(c).add(_t1.set(wob, 0.06, 0)).addScaledVector(side, 0.03), q: fq('R', vp().copy(fwd).add(_t2.set(0, -1, 0)), down), grip: GRIP.pinch });
        H.set('L', { pos: vp().copy(c).add(_t1.set(0, 0.05, 0)).addScaledVector(side, -0.05), q: fq('L', vp().copy(fwd).add(_t2.set(0, -1, 0)), down), grip: GRIP.claw });
        break;
      }
      case 'knead': {
        const c = d.f.obj.getWorldPosition(vp());
        const wob = Math.sin(this.time * 9) * 0.015;
        H.set('R', { pos: vp().copy(c).add(_t1.set(0, 0.05 + wob, 0)).addScaledVector(side, 0.035).addScaledVector(fwd, -0.03), q: fq('R', fwd, down), grip: GRIP.flat });
        H.set('L', { pos: vp().copy(c).add(_t1.set(0, 0.05 - wob, 0)).addScaledVector(side, -0.035).addScaledVector(fwd, -0.03), q: fq('L', fwd, down), grip: GRIP.flat });
        break;
      }
      case 'stir': {
        const center = d.bowl ? BOWL_AT : d.v!.pos;
        const a = d.bowl ? this.bowlAngle() : this.vesselAngle(d.v!);
        const tip = Wp(_t1.copy(center).add(_t2.set(Math.cos(a) * 0.04, 0.05, Math.sin(a) * 0.04)));
        const up = vp().set(0, 1, 0).addScaledVector(fwd, -0.35).normalize();
        H.set('R', { pos: vp().copy(tip).addScaledVector(up, 0.2), q: tq(vp().copy(up).negate(), fwd), grip: GRIP.handle });
        const hp = Wp(_t1.copy(center).add(_t2.set(-0.1, 0.1, 0)));
        H.set('L', { pos: vp().copy(hp), q: fq('L', side, down), grip: GRIP.pinch });
        break;
      }
      case 'draft': {
        const c = this.draftDisc!.getWorldPosition(vp());
        H.set('R', { pos: vp().copy(c).add(_t1.set(0, 0, 0.04)).addScaledVector(fwd, -0.02), q: fq('R', vp().set(0, 1, 0).addScaledVector(fwd, 0.5), fwd), grip: GRIP.pinch });
        H.rest('L');
        break;
      }
    }
  }

  private dirW(d: THREE.Vector3): THREE.Vector3 { return d.clone().applyQuaternion(this.root.getWorldQuaternion(_q1)).normalize(); }

  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'food' || d.kind === 'egg' || d.kind === 'board') this.drop(null);
    else if (d.kind === 'carry') { this.drag = null; this.goHome(d.p); }
    else if (d.kind === 'vessel') this.dropVessel(d.v, null);
    else if (d.kind === 'lid') this.dropLid(d.lid, null);
    else if (d.kind === 'bowl') { this.bowlObj.position.copy(BOWL_AT); this.bowlObj.rotation.set(0, 0, 0); }
    else if (d.kind === 'scrape' && this.produce) this.produce.obj.position.copy(this.boardSurface(this.produce.local));
    this.drag = null;
    for (const t of [this.knife, this.turner, this.spoon, this.cup, this.tsp, this.dipper]) this.putBack(t);
  }

  // ------------------------------------------------------------------------------------------ test hooks
  /** state for tests and the dev page */
  debug(): Record<string, unknown> {
    const vs = (v: Vessel) => ({ T: Math.round(v.T), water: +v.water.toFixed(2), wet: +v.wet.toFixed(2), lid: !!v.lid, fat: v.fat ? { ml: Math.round(v.fat.total), shimmer: +v.fat.shimmer.toFixed(2), smoke: +v.fat.smoke.toFixed(2), fire: +v.fat.fire.toFixed(2), r: +v.fat.pool.r.toFixed(3) } : null, added: Object.fromEntries([...v.added].map(([k, n]) => [k, +n.toFixed(2)])), foods: v.foods.map((f) => `${f.key}:${f.a.toFixed(2)}/${f.b.toFixed(2)}`), piles: v.piles.map((p) => `${p.key}(${p.cls},${p.bits.length}):${p.a.toFixed(2)}/${p.b.toFixed(2)}`), simmer: Math.round(v.pot.simmer), scorch: +v.pot.scorch.toFixed(2) });
    return {
      phase: this.phase, view: this.viewName, draft: this.draft, level: +this.g.stove.level.toFixed(2),
      skillet: vs(this.skillet), pot: vs(this.pot), coffee: { T: Math.round(this.coffee.T), ...this.coffee.coffee },
      board: this.foods.filter((f) => f.where === 'board').map((f) => f.kind), stock: this.stock?.kind ?? null,
      produce: this.produce ? { id: this.produce.id, peel: this.produce.peel, cuts: this.produce.cuts, ext: this.produce.extent(), ...this.produce.stats() } : null,
      bowl: { kind: this.bowl.kind, mix: +this.bowl.mix.toFixed(2), c: Object.fromEntries([...this.bowl.c].map(([k, n]) => [k, +n.toFixed(2)])) },
      served: this.served ? { item: this.served.v.item, name: this.served.v.name, grade: this.served.v.grade, q: +this.served.v.q.toFixed(2), notes: this.served.v.notes, steps: this.served.v.steps } : null,
      drag: this.drag?.kind ?? null, pinned: this.pinned, cards: RECIPES.filter((r) => this.unlocked(r.id)).map((r) => r.id), buffs: this.buffs.list.map((b) => `${b.kind}:${b.k.toFixed(2)}`),
      log: this.log.slice(-12).map((e) => `${e.k}${e.ing ? ':' + e.ing : ''}${e.s ? '=' + e.s : ''}${e.v ? '@' + e.v : ''}`),
    };
  }

  /**
   * dev hooks: the same actions the cursor does, for scripted tests and screenshots. Each goes through the
   * station's own code paths (use(), applyPortion(), cut(), produceInto(), serve()...).
   */
  readonly dev = {
    view: (n: ViewName, snap = true) => { this.goView(n); this.lean = null; this.leanPinned = false; this.setView(this.worldView(n)); if (snap) this.snapView(); },
    /** lean in over the board or a pan (as the cursor work does) and snap there */
    leanTo: (k: 'board' | 'skillet' | 'pot') => { this.lean = k; this.leanPinned = true; this.setView(this.leanView(k)); this.snapView(); },
    /** pour / measure / shake an ingredient into 'skillet' | 'pot' | 'coffee' | 'bowl' for n portions */
    give: (id: string, where: 'skillet' | 'pot' | 'coffee' | 'bowl', n = 1): boolean => {
      const pp = this.pantry.find((x) => x.id === id) ?? this.fixtures.find((x) => x.id === id) ?? ({ id, obj: new THREE.Object3D(), home: new THREE.Vector3(), yaw: 0, hit: new THREE.Mesh(), ing: ING[id] ?? null } as Pantry);
      if (pp.id === 'oil' && pp.cap && !pp.open) this.uncap(pp);
      const v = where === 'bowl' ? undefined : this.vesselByKind(where);
      const at = v ? v.pos.clone().add(V3(0.02, 0.1, 0.01)) : BOWL_AT.clone().add(V3(0, 0.1, 0));
      const tgt: Target = v ? { kind: 'vessel', v, label: '' } : { kind: 'bowl', label: '' };
      const how = pp.ing?.how;
      if (!how || ['pour', 'measure', 'shake'].includes(how) || id === 'water') {
        for (let i = 0; i < n; i++) if (!this.applyPortion(pp, tgt, at, id === 'water' ? 0.25 : 1)) return false;
        return true;
      }
      for (let i = 0; i < n; i++) this.dropIngredient(pp, tgt, at);
      return true;
    },
    /** put an ingredient on the board (unwrap / produce) */
    board: (id: string): boolean => {
      const pp = this.pantry.find((x) => x.id === id) ?? ({ id, obj: new THREE.Object3D(), home: new THREE.Vector3(), yaw: 0, hit: new THREE.Mesh(), ing: ING[id] ?? null } as Pantry);
      this.dropIngredient(pp, { kind: 'board', label: '' }, this.boardPos.clone());
      return !!(this.produce || this.stock || this.foods.some((f) => f.where === 'board'));
    },
    peel: () => { if (this.produce) { this.produce.peel = 1; this.produce.rebuild(); this.log.push({ k: 'peel', ing: this.produce.key }); } },
    /** knife cuts at produce-relative x positions; turn first if asked */
    cut: (xs: number[], turn = false) => {
      const pr = this.produce; if (!pr) return null;
      if (turn) pr.turn();
      for (const x of xs) { const r = pr.cut(x); if (r === 'halved') this.log.push({ k: 'halve', ing: pr.key }); else if (r === 'cut') this.log.push({ k: 'cut', ing: pr.key, s: pr.stats().cls }); }
      return pr.stats();
    },
    /** evenly spaced cuts every `step` m across the produce (both ways if dice) */
    dice: (step: number, both = true) => {
      const pr = this.produce; if (!pr) return null;
      if (pr.def.halve && !pr.halved) pr.cut(0), this.log.push({ k: 'halve', ing: pr.key });
      const e = pr.extent();
      for (let x = e.x0 + step; x < e.x1 - step * 0.4; x += step) pr.cut(x);
      if (both) { pr.turn(); const f = pr.extent(); for (let x = f.x0 + step; x < f.x1 - step * 0.4; x += step) pr.cut(x); }
      const st = pr.stats();
      this.log.push({ k: 'cut', ing: pr.key, s: st.cls });
      return st;
    },
    scrape: (where: 'skillet' | 'pot') => { if (this.produce) this.produceInto(this.produce, this.vesselByKind(where)); },
    slice: (n: number, thick = 0.01) => { for (let i = 0; i < n && this.stock; i++) {
      if (this.stock.len < thick * 1.6 && this.stock.kind !== 'shroom') { const st = this.stock; const f = makeFood(st.kind === 'bacon' ? 'bacon' : 'meat', { thick: Math.min(0.012, st.len * 0.5) }); f.key = st.key; f.units = st.len / 0.15; f.where = 'board'; f.local.set(-0.12, 0.06); st.obj.removeFromParent(); this.stock = null; this.addFood(f); break; } const len = this.stock.len; this.doCut({ kind: 'cut', at: len / 2 - thick, depth: 1, y0: 0, x0: 0, done: true, target: 'stock' }, len, this.stock.obj.position.clone()); } },
    boardTo: (where: 'skillet' | 'pot') => { const v = this.vesselByKind(where); for (const f of this.foods.filter((x) => x.where === 'board')) this.intoVessel(f, v); },
    egg: (where: 'skillet' | 'bowl') => { if (!this.use('eggs')) return false; const shell = new THREE.Mesh(eggShellGeo(), eggShellMat()); this.root.add(shell); if (where === 'bowl') { shell.removeFromParent(); this.bowl.add('egg', 1); this.log.push({ k: 'crack', v: 'bowl' }); } else this.crackEgg(shell, this.skillet); return true; },
    stirBowl: (k = 1) => { this.bowl.stir(k); const kk = this.bowl.kind; if (this.bowl.mix >= 0.6) this.log.push({ k: 'mix', s: kk }); return kk; },
    bowlTo: (where: 'skillet' | 'pot' | 'board') => { if (where === 'board') this.doughOut(); else this.bowlInto(this.vesselByKind(where), this.vesselByKind(where).pos.clone()); },
    knead: () => { const f = this.foods.find((x) => x.kind === 'dough' && x.where === 'board'); if (f) { f.knead = 1; const mesh = f.obj.children[0] as THREE.Mesh; mesh.geometry = f.dough === 'pastry' ? pastryGeo(31) : doughGeo(1, 31); f.h = f.dough === 'pastry' ? 0.01 : 0.024; this.log.push({ k: 'knead', s: f.dough }); } },
    flipAll: (where: 'skillet' | 'pot' = 'skillet') => { const v = this.vesselByKind(where); for (const f of v.foods) if (!['egg', 'pastry', 'dumpling', 'shroom'].includes(f.kind)) this.doFlip(f, v, 3); for (const p of v.piles) p.stir(1); },
    stir: (where: 'skillet' | 'pot') => { const v = this.vesselByKind(where); v.pot.sinceStir = 0; v.pot.scorch = Math.max(0, v.pot.scorch - 0.1); if (v.wet < 0.05) for (const f of v.foods) f.flipped = !f.flipped; for (const p of v.piles) { p.stir(0.6); if (v.wet < 0.05) p.layout(v.inner - 0.012); } this.log.push({ k: 'stir', v: v.kind }); },
    lid: (where: 'skillet' | 'pot', on = true) => { const lid = this.lids.find((l) => l.kind === where)!; if (on) { if (lid.on) return; this.liftLid(lid); this.dropLid(lid, this.vesselByKind(where).pos.clone()); } else if (lid.on) { this.liftLid(lid); this.dropLid(lid, null); } },
    move: (where: 'skillet' | 'pot' | 'coffee', x: number, z: number) => { const v = this.vesselByKind(where); v.pos.set(x, PLATE.y, z); v.obj.position.copy(v.pos); },
    taste: (where: 'skillet' | 'pot' | 'coffee') => { const v = this.vesselByKind(where); v.tasted = true; const s = this.tasteVerdict(v); this.log.push({ k: 'taste', v: v.kind, s }); return s; },
    serve: (where: 'skillet' | 'pot') => { const v = this.serve(this.vesselByKind(where)); return v ? { item: v.item, name: v.name, grade: v.grade, q: +v.q.toFixed(2), notes: v.notes, steps: v.steps } : null; },
    pour: () => { this.pourCup(); const v = this.poured?.v; return v ? { item: v.item, name: v.name, grade: v.grade, q: +v.q.toFixed(2) } : null; },
    eat: () => this.eatServed('plate'),
    pack: () => this.packServed('plate'),
    pin: (id: string) => { this.pinned = id; this.tickT = 0; },
    cards: (id?: string) => { if (id === undefined) { this.closeCards(); return; } this.openCards(id); },
    heat: (where: 'skillet' | 'pot' | 'coffee', T: number) => { this.vesselByKind(where).T = T; },
    /** hold a vessel at a temperature (null lets the stove drive it again) */
    hold: (where: 'skillet' | 'pot' | 'coffee', T: number | null) => { const v = this.vesselByKind(where); v.pinT = T; if (T !== null) v.T = T; },
    draft: (k: number) => { this.draft = k; },
    summary: (where: 'skillet' | 'pot' | 'coffee') => this.summarize(this.vesselByKind(where)),
    ndc: (what: string) => {
      if (what === 'handle') return this.ndc(this.W(this.skillet.pos.clone().add(V3(0, 0.06, 0.21))));
      const p = what === 'board' ? this.boardPos : what === 'bowl' ? BOWL_AT : what === 'serve' ? SERVE : what === 'produce' && this.produce ? this.boardSurface(this.produce.local) : ['skillet', 'pot', 'coffee'].includes(what) ? this.vesselByKind(what as VKind).pos : this.pantry.find((x) => x.id === what)?.home ?? this.fixtures.find((x) => x.id === what)?.home ?? this.boardPos;
      return this.ndc(this.W(p.clone().add(V3(0, 0.03, 0))));
    },
    state: () => this.debug(),
    /** fast-forward the stove's simulation (tests): secs of cooking in small steps, no rendering */
    hands: (on: boolean) => { this.hands.object.visible = on; },
    /** NDC of a point on the board, dx metres along it from the produce (scripted knife strokes) */
    boardNdc: (dx: number, dz = 0) => { const pr = this.produce; const l = pr ? pr.local : _v2.set(0, 0); return this.ndc(this.W(this.boardSurface(_v2.set(l.x + dx, l.y + dz)).clone().add(V3(0, 0.03, 0)))); },
    /** NDC of a pantry / fixture / served thing by id */
    itemNdc: (id: string) => { const pp = this.pantry.find((x) => x.id === id) ?? this.fixtures.find((x) => x.id === id); return pp ? this.ndc(pp.obj.getWorldPosition(new THREE.Vector3()).add(V3(0, 0.06, 0))) : null; },
    /** what the pointer would pick at an NDC point (tests) */
    pickAt: (x: number, y: number) => { const keep = { x: this.ptr.x, y: this.ptr.y }; this.ptr.x = x; this.ptr.y = y; const h = this.pick(this.pickables()); this.ptr.x = keep.x; this.ptr.y = keep.y; const c = this.classify(h); return c ? `${c.kind}${c.v ? ':' + c.v.kind : ''}${c.pp ? ':' + c.pp.id : ''} (${h?.object.name || h?.object.parent?.name || ''})` : 'none'; },
    /** where the pointer meets the work surfaces and what vessel is under it (tests) */
    probe: () => { const at = this.carryPoint(0.1); const cam = this.g.camera.position; return { at: at ? at.toArray().map((v) => +v.toFixed(3)) : null, v: at ? this.vesselUnder(at)?.kind ?? null : null, cam: this.L(cam.clone()).toArray().map((v) => +v.toFixed(3)), mode: this.g.mode, phase: this.phase, ptr: [+this.ptr.x.toFixed(2), +this.ptr.y.toFixed(2)] }; },
    /** the station's pointer script (tests drive the real input path with it) */
    point: (x: number, y: number, down = false, rdown = false) => { this.script = { x, y, down, rdown }; },
    release: () => { this.script = null; },
    run: (secs: number, step = 0.05) => { for (let t = 0; t < secs; t += step) this.simulate(step); return this.debug(); },
  };
  private vesselByKind(k: VKind): Vessel { return k === 'skillet' ? this.skillet : k === 'pot' ? this.pot : this.coffee; }
}

const _v2 = new THREE.Vector2(), _v2zero = new THREE.Vector2();
const _hd = new THREE.Vector3(), _hf = new THREE.Vector3(), _hs = new THREE.Vector3();
const GRIP_KNOB = [0.7, 0.68, 0.6, 0.05, 0.1] as const;
function how(pp: Pantry): string | undefined { return pp.ing?.how; }

/** dish models for the backpack and setDown: an enamel plate (or bowl, or mug) with a little of the food */
export function cookedModels(g: Game): void {
  const plate = (k: FoodKind[], berry = false) => {
    const o = buildProduct('enamel_plate');
    k.forEach((kind, i) => {
      const f = makeFood(kind, { berry, flat: 1 });
      f.a = f.b = 0.9; f.setDone();
      f.obj.position.set((i - (k.length - 1) / 2) * 0.05, 0.01, 0);
      if (kind === 'dough' || kind === 'trout' || kind === 'pastry') f.obj.scale.setScalar(0.6);
      o.add(f.obj);
    });
    return o;
  };
  const pilePlate = (kinds: [string, string][], bowl = false, tint?: [number, number, number]) => {
    const o = buildProduct(bowl ? 'enamel_bowl' : 'enamel_plate');
    if (tint) {
      const m = liquidMat('mix');
      m.color.setRGB(...tint);
      const d = new THREE.Mesh(discGeo(bowl ? 0.062 : 0.07, 16), m);
      d.position.y = bowl ? 0.042 : 0.012;
      o.add(d);
    }
    kinds.forEach(([kind, key], i) => {
      const pr = new Produce(key, PRODUCE[kind]);
      pr.peel = 1;
      if (pr.def.halve) pr.cut(0);
      const e = pr.extent();
      for (let x = e.x0 + 0.014; x < e.x1; x += 0.014) pr.cut(x);
      pr.turn();
      const f = pr.extent();
      for (let x = f.x0 + 0.014; x < f.x1; x += 0.014) pr.cut(x);
      const pile = new Pile(key, pr.def.kind, bitsOf(pr), 1, pr.mat);
      pile.a = pile.b = 0.95; pile.setDone();
      pile.layout(bowl ? 0.04 : 0.05, i * 31 + 7, 1);
      pile.obj.position.set((i - (kinds.length - 1) / 2) * 0.025, bowl ? 0.035 : 0.008, 0);
      o.add(pile.obj);
    });
    return o;
  };
  const set = (id: string, o: THREE.Object3D) => { o.userData.itemId = id; g.setItemModel(id, o); };
  set('meal_bacon_eggs', plate(['bacon', 'egg', 'bacon']));
  set('meal_bacon', plate(['bacon', 'bacon', 'bacon']));
  set('meal_eggs', plate(['egg', 'egg']));
  set('meal_trout', plate(['trout']));
  set('meal_bannock', plate(['dough']));
  set('meal_berry_bannock', plate(['dough'], true));
  set('meal_meat', plate(['meat', 'meat']));
  set('meal_chanterelles', plate(['shroom']));
  set('meal_flapjacks', plate(['flapjack', 'flapjack']));
  set('meal_tourtiere', plate(['pastry']));
  set('meal_hunters_breakfast', plate(['sausage', 'egg']));
  set('meal_hash_browns', pilePlate([['potatoes', 'potato'], ['onions', 'onion']]));
  set('meal_fry_up', pilePlate([['potatoes', 'potato']]));
  set('meal_stew', pilePlate([['potatoes', 'potato']], true, [0.5, 0.32, 0.16]));
  set('meal_venison_stew', pilePlate([['potatoes', 'potato'], ['carrots', 'carrot']], true, [0.45, 0.28, 0.14]));
  set('meal_moose_chili', pilePlate([['onions', 'onion']], true, [0.6, 0.2, 0.1]));
  set('meal_pea_soup', pilePlate([['carrots', 'carrot']], true, [0.86, 0.72, 0.3]));
  set('meal_beans_bacon', pilePlate([], true, [0.6, 0.28, 0.14]));
  set('meal_mac_cheese', pilePlate([], true, [1.0, 0.74, 0.22]));
  set('meal_soup', pilePlate([['carrots', 'carrot']], true, [0.62, 0.55, 0.4]));
  set('meal_porridge', pilePlate([], true, [0.9, 0.82, 0.64]));
  set('meal_pouding_chomeur', pilePlate([], true, [0.7, 0.42, 0.14]));
  set('meal_blueberry_grunt', pilePlate([], true, [0.36, 0.16, 0.4]));
  set('meal_maple_beans', pilePlate([], true, [0.6, 0.26, 0.12]));
  set('meal_beans', pilePlate([], true, [0.6, 0.3, 0.16]));
  set('burnt_food', plate(['bacon']));
  set('bannock_mix', buildMixSack());
  for (const id of ['cowboy_coffee', 'meal_labrador_tea', 'meal_tea']) set(id, buildProduct('enamel_mug'));
}

/**
 * Install the cooking station: registers the cooked items and groceries, replaces the stove top's one-click cook
 * with the close-up station and starts its simulation. Call after the cabin is built and added (game.cabin set)
 * and after CabinPlay.attach().
 */
export function installCooking(g: Game): CookingStation | null {
  registerCookItems();
  if (!g.cabin?.anchors?.stove_top) return null;
  const st = new CookingStation(g);
  try { cookedModels(g); } catch (e) { console.warn('[cook] dish models', e); }
  (g as unknown as { cooking?: CookingStation }).cooking = st;
  return st;
}

void PLATE; void DISH_LINES; void produceMat; void KEY_NAME;
