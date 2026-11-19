// Zoom-in cooking at the cabin's barrel stove. Interacting with the stove top steps the player up to the stove:
// the camera eases down to the cooking plate, the pantry table (what's in the pack, set out as real things) and
// the prep counter (cutting board, knife), and the player's hands do the work:
//   * drag packages to the board to unwrap them; drag the knife down through the food to slice (peameal bacon
//     rounds, trout steaks, meat strips, chopped chanterelles); knead and press bannock dough; drop berries in it
//   * drag pieces (or tip the whole board) into the skillet or the pot; crack eggs from the carton into the fat
//   * click-drag a piece in the skillet and flick up to flip it (too soft and it won't turn, too hard and it lands
//     badly); drag circles in the pot to stir; pour syrup, tip beans in, spoon coffee grounds into the coffee pot
//   * drag a vessel by its handle around the plate (the front over the firebox is hottest, the edges cooler) or
//     onto the tin plate to serve; LMB on a served dish eats it hot, RMB packs it
//   * the stove's door (move the cursor to the bottom edge): open it, spin the draft disc (the real Stove's fire
//     level follows the draft), toss kindling in for a flare, light a cold stove
//   * hang meat strips on the rack over the stove: hours later they are smoked jerky (a favourite of the critters)
// Doneness shows on the food itself (raw -> golden -> browned -> charred, each side separately), with steam,
// sizzle, fat spit and smoke. S or Escape steps back; the stove keeps cooking whatever is left on it.
import * as THREE from 'three';
import type { Game } from '../game';
import { ITEMS } from '../items';
import { audio, type Voice } from '../../audio/audio';
import { puffs } from '../../gfx/particles';
import { G } from '../../gfx/globals';
import { registerInteractable, findInteractable } from '../interact';
import { Mesher, Rand } from '../../places/kit';
import { STOVE } from '../../places/stove';
import { buildProduct } from '../../places/products';
import { loadProp } from '../../places/props';
import { fitTool } from '../../player/arms';
import { Station, Bits, clearInteractables, proxy } from './station';
import { StationHands, GRIP } from './hands';
import { foodMat, slab, blob, loinGeo, troutGeo, doughGeo, eggWhiteGeo, yolkGeo, eggShellGeo, eggShellMat, liquidMat, discGeo, type FoodMat, type LiquidMat } from './food';
import { PLATE, COUNTER, PANTRY, buildPlate, buildSkillet, buildPot, buildCoffeePot, buildKnife, buildTurner, buildLard, buildMixSack, buildMeatPack, buildCounter, buildPantry, buildRack } from './cookware';
import { registerCookItems, meatIds, skilletDish, potDish, DISH_LINES, type FoodKind } from './recipes';

export { registerCookItems } from './recipes';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

// ---------------------------------------------------------------------------------------------- food pieces
type Where = 'board' | 'skillet' | 'pot' | 'plate' | 'rack' | 'hand' | 'gone';

const FOOD_RATE: Record<FoodKind, { rate: number; top: number; wet: number }> = {
  bacon: { rate: 0.045, top: 0.12, wet: 0.6 },
  egg: { rate: 0.05, top: 0.42, wet: 1 },
  trout: { rate: 0.032, top: 0.1, wet: 0.9 },
  dough: { rate: 0.024, top: 0.06, wet: 0.5 },
  meat: { rate: 0.042, top: 0.12, wet: 0.7 },
  shroom: { rate: 0.06, top: 0.3, wet: 0.8 },
};

class Food {
  readonly obj = new THREE.Group();
  mats: FoodMat[] = [];
  /** doneness of the object's +Y side and -Y side */
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
  /** trout pieces: body range */
  u0 = 0; u1 = 1;
  knead = 0;
  constructor(readonly kind: FoodKind, public h: number, public r: number) { this.obj.name = `food_${kind}`; }
  setDone(): void {
    for (const m of this.mats) { m.userData.uTop.value = this.a; m.userData.uBot.value = this.b; }
  }
  /** doneness of the side facing down / up right now */
  get down(): number { return this.flipped ? this.a : this.b; }
  get up(): number { return this.flipped ? this.b : this.a; }
  addDown(d: number, up: number): void {
    if (this.flipped) { this.a += d; this.b += up; } else { this.b += d; this.a += up; }
  }
  get done(): number { return this.kind === 'egg' ? this.b * 0.7 + this.a * 0.3 : (this.a + this.b) / 2; }
  get worst(): number { return Math.max(this.a, this.b); }
  get least(): number { return this.kind === 'egg' ? Math.min(this.b, this.a + 0.3) : Math.min(this.a, this.b); }
}

function makeFood(kind: FoodKind, o: { thick?: number; seed?: number; u0?: number; u1?: number; berry?: boolean; flat?: number } = {}): Food {
  const seed = o.seed ?? Math.random() * 1000;
  let f: Food;
  switch (kind) {
    case 'bacon': {
      const t = o.thick ?? 0.01;
      f = new Food('bacon', t, 0.04);
      const m = foodMat('bacon'); m.userData.uEdgeK.value = 0.5;
      f.mats.push(m);
      f.obj.add(new THREE.Mesh(slab(blob(0.04, 0.034, seed, 18, 0.07), t, { round: Math.min(0.003, t * 0.3) }), m));
      break;
    }
    case 'meat': {
      const t = o.thick ?? 0.012;
      f = new Food('meat', t, 0.045);
      const m = foodMat('meat'); f.mats.push(m);
      f.obj.add(new THREE.Mesh(slab(blob(0.055, 0.022, seed, 16, 0.1), t, { round: 0.003 }), m));
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
      f.u0 = u0; f.u1 = u1;
      const m = foodMat('trout', { rough: 0.45 }); m.userData.uEdgeK.value = 0.2;
      f.mats.push(m);
      const g = troutGeo(len, u0, u1);
      // centre the piece on its own middle
      const cx = -len / 2 + ((u0 + u1) / 2) * len;
      g.translate(-cx, 0, 0);
      if (u1 - u0 <= 0.2 && u0 > 0.01 && u1 < 0.99) {
        // a steak: it lies on a cut face (flesh up and down, the skin a ring around it)
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
    case 'shroom': default: {
      f = new Food('shroom', 0.012, 0.04);
      const m = foodMat('dough', { rough: 0.6 });
      // chopped chanterelle bits: golden wedges
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
  constructor(readonly kind: 'bacon' | 'meat' | 'shroom', public len: number) { this.rebuild(); }
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
class Vessel {
  T = 20;
  heat = 0;
  fat = 0;
  water = 0;
  foods: Food[] = [];
  liquid: { mesh: THREE.Mesh; mat: LiquidMat } | null = null;
  fatMesh: THREE.Mesh | null = null;
  pot = { beans: false, syrup: 0, meat: false, bacon: false, shroom: false, progress: 0, scorch: 0, sinceStir: 0, spin: 0 };
  coffee = { grounds: false, boil: 0, settle: 0, poured: 0 };
  voice: Voice | null = null;
  boilVoice: Voice | null = null;
  where: 'plate' | 'counter' | 'pantry' = 'plate';
  calls = new Set<string>();
  constructor(readonly kind: VKind, readonly obj: THREE.Group, public pos: THREE.Vector3) {}
  get r(): number { return this.kind === 'skillet' ? 0.128 : this.kind === 'pot' ? 0.098 : 0.068; }
  get floor(): number { return (this.obj.userData.floor as number | undefined) ?? 0.008; }
  get inner(): number { return this.kind === 'skillet' ? 0.098 : this.kind === 'pot' ? 0.08 : 0.055; }
}

interface Pantry { id: string; obj: THREE.Object3D; home: THREE.Vector3; yaw: number; uses: number; hit: THREE.Mesh }

type Drag =
  | { kind: 'pantry'; p: Pantry; lift: number }
  | { kind: 'food'; f: Food; from: Where; fromV: Vessel | null }
  | { kind: 'vessel'; v: Vessel; from: THREE.Vector3 }
  | { kind: 'board' }
  | { kind: 'egg'; shell: THREE.Mesh }
  | { kind: 'flip'; f: Food; v: Vessel; t: number; y0: number; vy: number; lift: number }
  | { kind: 'cut'; at: number; depth: number; y0: number; x0: number; done: boolean; target: 'stock' | 'trout'; f?: Food }
  | { kind: 'knead'; f: Food; last: THREE.Vector2; amt: number }
  | { kind: 'stir'; v: Vessel; last: number; amt: number }
  | { kind: 'draft'; x0: number; d0: number };

const VIEWS = {
  stove: { pos: V3(0.03, 1.27, 0.56), look: V3(0.01, 0.86, 0.12), fov: 50 },
  prep: { pos: V3(0.5, 1.3, 0.52), look: V3(0.57, 0.77, 0.0), fov: 50 },
  pantry: { pos: V3(-0.46, 1.22, 0.7), look: V3(-0.56, 0.75, 0.2), fov: 50 },
  door: { pos: V3(0.08, 0.96, 0.95), look: V3(0.0, 0.6, 0.44), fov: 50 },
};
type ViewName = keyof typeof VIEWS;

// ---------------------------------------------------------------------------------------------- the station
export class CookingStation extends Station {
  readonly root = new THREE.Group();
  private stoveObj: THREE.Object3D;
  private bits = new Bits(400);
  private skillet: Vessel;
  private pot: Vessel;
  private coffee: Vessel;
  private board: THREE.Object3D = new THREE.Group();
  private boardPos = V3(0.565, COUNTER.y, 0.02);
  private boardHit: THREE.Mesh;
  private knife: THREE.Object3D;
  private turner: THREE.Object3D;
  private spoon: THREE.Object3D = new THREE.Group();
  private toolRest = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion }>();
  private foods: Food[] = [];
  private stock: Stock | null = null;
  private pantry: Pantry[] = [];
  private plateObj: THREE.Object3D;
  private mugObj: THREE.Object3D;
  private served: { dish: string; q: number; foods: Food[]; obj: THREE.Object3D; hit: THREE.Mesh } | null = null;
  private poured: { q: number } | null = null;
  private rack: THREE.Group;
  private rackStrips: Food[] = [];
  private drag: Drag | null = null;
  private viewName: ViewName = 'stove';
  private edgeT = 0;
  private draft = 0.5;
  private flare = 0;
  private draftDisc: THREE.Object3D | null = null;
  private doorPivot: THREE.Object3D | null = null;
  private eggsLeft = 0;
  private syrupLeft = 0;
  private coffeeLeft = 0;
  private hidT = 0;
  private hover: { text: string; at: THREE.Vector3 } | null = null;
  private tmp = new THREE.Vector3();
  private time = 0;

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
    // ---- furniture: plate on the drum, prep counter, pantry table
    this.root.add(buildPlate());
    const ms = new Mesher();
    const rnd = new Rand(4711);
    buildCounter(ms, rnd);
    buildPantry(ms, rnd);
    const furn = ms.build({ name: 'cook_furniture' });
    this.root.add(furn);
    // ---- vessels
    this.skillet = new Vessel('skillet', buildSkillet(), V3(0.0, PLATE.y, 0.27));
    this.pot = new Vessel('pot', buildPot(), V3(-0.095, PLATE.y, 0.02));
    this.coffee = new Vessel('coffee', buildCoffeePot(), V3(0.125, PLATE.y, 0.0));
    for (const v of [this.skillet, this.pot, this.coffee]) { this.root.add(v.obj); v.obj.position.copy(v.pos); }
    this.coffee.water = 0.8;
    // fat film in the skillet, liquid surfaces in the pots
    this.skillet.fatMesh = new THREE.Mesh(discGeo(0.1, 22), liquidMat('fat'));
    (this.skillet.fatMesh.material as THREE.MeshStandardMaterial).transparent = true;
    this.skillet.fatMesh.position.y = 0.0075;
    this.skillet.fatMesh.visible = false;
    this.skillet.obj.add(this.skillet.fatMesh);
    // ---- board, knife, turner, spoon
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
    loadProp('wooden_spoon').then((o) => {
      const s = fitTool(o, 0.18);
      this.spoon.add(s);
    }).catch(() => {});
    this.rest(this.spoon, V3(0.73, COUNTER.y + 0.015, 0.2), new THREE.Euler(-Math.PI / 2, 0, -Math.PI / 2 + 0.2));
    const lard = buildLard();
    lard.position.set(0.735, COUNTER.y, -0.235);
    lard.userData.lard = true;
    this.root.add(lard);
    this.pantry.push({ id: 'lard', obj: lard, home: lard.position.clone(), yaw: 0, uses: 999, hit: this.hitFor(lard, 0.12, 0.1, 0.12) });
    // ---- serving plate and mug on the pantry table
    this.plateObj = buildProduct('enamel_plate');
    this.plateObj.position.set(PANTRY.x0 + 0.13, PANTRY.y, PANTRY.z1 - 0.12);
    this.root.add(this.plateObj);
    this.mugObj = buildProduct('enamel_mug');
    this.mugObj.position.set(PANTRY.x1 - 0.06, PANTRY.y, PANTRY.z1 - 0.07);
    this.mugObj.rotation.y = -0.6;
    this.root.add(this.mugObj);
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
    });
    // ---- a draft disc over the stove door's spin draft (the real fire level follows it)
    this.stoveObj.traverse((o) => { if (o.name === 'stove_door') this.doorPivot = o; });
    if (this.doorPivot) {
      const disc = new THREE.Group();
      const dg = new THREE.CylinderGeometry(0.074, 0.074, 0.006, 20);
      dg.rotateX(Math.PI / 2);
      const dmesh = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.7, metalness: 0.4 }));
      disc.add(dmesh);
      // the spinner's knob and its five ports (bright when open: the fire shows through)
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
      const dw = 0.3;
      disc.position.set((0.02 + dw + 0.06) / 2 + 0.01, 0, 0.03);
      this.doorPivot.add(disc);
      this.draftDisc = disc;
    }
    // ---- the stove top becomes the way in (replaces the old one-click cook on the stove top)
    clearInteractables(top);
    const hot = proxy(new THREE.BoxGeometry(0.46, 0.2, 0.56));
    hot.position.set(0, PLATE.y + 0.08, 0.16);
    this.root.add(hot);
    registerInteractable(hot, { kind: 'stove', label: () => 'Cook', use: () => { this.enter(); } });
    this.setView(VIEWS.stove);
    this.parallax = 0.03;
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

  // ------------------------------------------------------------------------------------------ entering
  protected onEnter(): void {
    this.viewName = 'stove';
    this.setView(this.worldView('stove'));
    this.layPantry();
    this.say(this.g.stove.lit ? (this.g.stove.level > 0.5 ? 'The plate\'s good and hot.' : 'The stove\'s going. Could be hotter.') : 'The stove\'s cold. Better get a fire going first.', 2.6);
  }
  protected onExit(): void {
    this.endDrag();
    // packages you didn't open go back in the pack
    for (const p of this.pantry) if (p.id !== 'lard') p.obj.removeFromParent();
    this.pantry = this.pantry.filter((p) => p.id === 'lard');
    this.putBack(this.knife); this.putBack(this.turner); this.putBack(this.spoon);
  }
  private worldView(n: ViewName): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    const v = VIEWS[n];
    return { pos: this.W(v.pos), look: this.W(v.look), fov: v.fov };
  }

  /** set out one of each ingredient the player owns on the pantry table */
  private layPantry(): void {
    const g = this.g;
    for (const p of this.pantry) if (p.id !== 'lard') p.obj.removeFromParent();
    this.pantry = this.pantry.filter((p) => p.id === 'lard');
    const ids = ['bacon', 'eggs', 'bannock_mix', 'berries', 'beans', 'syrup', 'coffee', 'chanterelle', ...meatIds(), 'fish', 'kindling'];
    const slots: [number, number, number][] = [
      [-0.65, 0.04, 0], [-0.47, 0.05, 0.1], [-0.66, 0.17, 0.2], [-0.47, 0.18, -0.1], [-0.66, 0.29, 0], [-0.47, 0.3, 0.3],
      [-0.66, 0.41, 0], [-0.47, 0.42, 0],
    ];
    let si = 0;
    for (const id of ids) {
      if (!g.owns(id) && !((id === 'eggs' && this.eggsLeft) || (id === 'syrup' && this.syrupLeft) || (id === 'coffee' && this.coffeeLeft))) continue;
      let obj: THREE.Object3D;
      let pos: THREE.Vector3, yaw = 0;
      if (id === 'fish') {
        if (this.foods.some((f) => f.kind === 'trout' && f.where === 'board') || this.boardBusy()) continue;
        // Ray's catch, lying on its side on the back of the counter
        obj = buildProduct('fish');
        obj.scale.setScalar(0.62);
        pos = V3(0.5, COUNTER.y + 0.034, -0.215);
        obj.rotation.set(Math.PI / 2, 0, 0);
        obj.position.copy(pos).add(V3(0, 0, -0.04));
        this.root.add(obj);
        this.pantry.push({ id, obj, home: obj.position.clone(), yaw: 0, uses: 1, hit: this.hitFor(obj, 0.45, 0.14, 0.1) });
        continue;
      }
      if (si >= slots.length) break;
      const [x, z, ry] = slots[si++];
      pos = V3(x, x > 0 ? COUNTER.y : PANTRY.y, z); yaw = ry;
      obj = id === 'bannock_mix' ? buildMixSack() : meatIds().includes(id) ? buildMeatPack() : buildProduct(id);
      obj.position.copy(pos); obj.rotation.y = yaw;
      this.root.add(obj);
      const b = new THREE.Box3().setFromObject(obj);
      const sz = b.getSize(new THREE.Vector3());
      const hit = proxy(new THREE.BoxGeometry(Math.max(0.06, sz.x / Math.max(1e-3, obj.scale.x)), Math.max(0.05, sz.y), Math.max(0.06, sz.z)));
      hit.position.y = sz.y / 2;
      obj.add(hit);
      this.pantry.push({ id, obj, home: pos.clone(), yaw, uses: 1, hit });
    }
  }

  // ------------------------------------------------------------------------------------------ simulation
  protected simulate(dt: number): void {
    const g = this.g, s = g.stove;
    this.time += dt;
    // hide the cabin's decorative coffee pot and pot (ours sit on the plate now)
    if ((this.hidT -= dt) <= 0) {
      this.hidT = 1;
      const host = this.stoveObj.parent!;
      const topW = (g.cabin!.anchors.stove_top as THREE.Object3D).getWorldPosition(new THREE.Vector3());
      for (const c of host.children) if ((c.name === 'coffeepot' || c.name === 'pot_enamel_01') && c.getWorldPosition(this.tmp).distanceTo(topW) < 0.6) c.visible = false;
    }
    // the draft: the real stove's fire level follows the air you give it (an open draft burns wood faster)
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
    for (const v of [this.skillet, this.pot, this.coffee]) this.heatVessel(v, dt, stoveHeat);
    this.cookSkillet(dt);
    this.cookPot(dt);
    this.brewCoffee(dt);
    this.smokeRack(dt);
    // foods follow their vessels / flips
    for (const f of this.foods) this.placeFood(f, dt);
    this.bits.update(dt);
    for (const v of [this.skillet, this.pot]) if (v.liquid) v.liquid.mat.userData.uTime.value = G.uTime.value;
  }

  private heatAt(p: THREE.Vector3): number {
    if (p.x < PLATE.x0 - 0.02 || p.x > PLATE.x1 + 0.02 || p.z < PLATE.z0 - 0.02 || p.z > PLATE.z1 + 0.02 || p.y < PLATE.y - 0.05) return 0;
    const dx = p.x / 0.32, dz = (p.z - 0.2) / 0.5;
    return clamp(1 - dx * dx - dz * dz, 0.3, 1);
  }

  private heatVessel(v: Vessel, dt: number, stoveHeat: number): void {
    v.heat = this.heatAt(v.pos);
    const wet = v.kind === 'coffee' ? v.water > 0.05 : v.kind === 'pot' ? (v.water > 0.05 || v.pot.beans) : false;
    const target = 20 + stoveHeat * v.heat;
    const tau = v.kind === 'skillet' ? 14 : v.kind === 'pot' ? 16 : 11;
    v.T += (target - v.T) * Math.min(1, dt / tau);
    if (wet) v.T = Math.min(v.T, v.kind === 'pot' && v.water < 0.05 ? 112 : 100);
  }

  private cookSkillet(dt: number): void {
    const v = this.skillet, T = v.T;
    const f = Math.pow(Math.max(0, (T - 105) / 75), 1.2);
    let wet = 0, bacon = 0, burning = 0;
    for (const food of v.foods) {
      if (food.flip) continue;
      const k = FOOD_RATE[food.kind];
      const r = k.rate * f * (v.fat < 0.12 ? 1.25 : 1) * (food.kind === 'bacon' ? 0.01 / Math.max(0.006, food.h) : 1);
      food.addDown(r * dt, r * k.top * dt);
      if (food.kind === 'dough' && T > 230) food.addDown(r * 0.4 * dt, 0);
      food.setDone();
      wet += k.wet * Math.max(0, 1 - food.done);
      if (food.kind === 'bacon' || food.kind === 'meat') { bacon++; if (T > 120) v.fat = Math.min(1, v.fat + dt * 0.006); }
      if (food.worst > 1.25) burning++;
      this.cue(food, v);
    }
    if (T > 230 && v.fat > 0) v.fat = Math.max(0, v.fat - dt * 0.004);
    // the fat film: shimmering pool that darkens as it smokes
    if (v.fatMesh) {
      v.fatMesh.visible = v.fat > 0.03;
      const m = v.fatMesh.material as LiquidMat;
      m.opacity = 0.18 + v.fat * 0.3;
      m.userData.uBoil.value = clamp((T - 140) / 80, 0, 1) * 0.7;
      m.userData.uTime.value = G.uTime.value;
      v.fatMesh.scale.setScalar(0.5 + Math.min(1, v.fat * 1.5) * 0.5);
    }
    // sizzle, steam, fat spit, smoke
    const sizzle = clamp((T - 110) / 90, 0, 1) * clamp(wet * 0.6 + v.fat * 0.8 + bacon * 0.2, 0, 1.2);
    this.loop(v, 'pan_fry', sizzle * 0.9, 0.9 + sizzle * 0.2);
    const at = this.W(v.pos.clone().add(V3(0, 0.03, 0)));
    if (sizzle > 0.05 && Math.random() < dt * 14 * sizzle) {
      puffs.emit(at.clone().add(V3((Math.random() - 0.5) * 0.14, 0.02, (Math.random() - 0.5) * 0.14)), V3(0, 0.18, 0), { size: 0.022, grow: 2.2, life: 1.1, color: new THREE.Color(0.86, 0.86, 0.84), alpha: 0.18 * sizzle, rise: 0.15 });
    }
    const spit = clamp((T - 150) / 70, 0, 1.4) * (v.fat * 4 + bacon * 1.2 + (v.foods.length ? 0.5 : 0));
    if (spit > 0) {
      const n = Math.random() < dt * spit * 18 ? 1 + Math.floor(Math.random() * 2) : 0;
      if (n) {
        const a = Math.random() * 6.28, rr = Math.random() * 0.09;
        const p = at.clone().add(V3(Math.cos(a) * rr, -0.015, Math.sin(a) * rr));
        this.bits.emit(p, V3(0, 0.7 + Math.random() * 0.8, 0), { color: new THREE.Color(0.86, 0.68, 0.34), size: 0.0024, life: 1.2, stay: 1.6, spread: 1.2, n, floor: (q) => this.floorAt(q) });
      }
    }
    if (burning && Math.random() < dt * 6 * burning) puffs.emit(at.clone().add(V3((Math.random() - 0.5) * 0.1, 0.02, (Math.random() - 0.5) * 0.1)), V3(0, 0.3, 0), { size: 0.03, grow: 3, life: 2, color: new THREE.Color(0.22, 0.2, 0.19), alpha: 0.35, rise: 0.25 });
  }

  /** timing feedback floating at the food */
  private cue(f: Food, v: Vessel): void {
    const at = () => this.W(this.foodWorldLocal(f, v)).add(V3(0, 0.03, 0));
    const once = (k: string, t: string, c?: string) => { if (!f.calls.has(k)) { f.calls.add(k); if (this.active) this.pop(t, at(), c); } };
    const canFlip = f.kind !== 'egg' && f.kind !== 'shroom';
    if (canFlip && f.down > 0.8 && f.up < 0.5) once(`flip${f.flipped ? 1 : 0}`, 'Flip it', '#ffe08a');
    if (f.down > 0.78 && f.up > 0.7 && f.worst < 1.05) once('golden', 'Golden', '#ffd070');
    if (f.kind === 'egg' && f.b > 0.75 && f.a > 0.45) once('set', 'Whites set', '#fff0c0');
    if (f.worst > 1.08) once('brown', 'Getting dark', '#e0a060');
    if (f.worst > 1.32) once('burn', 'Burning!', '#ff7050');
  }

  private cookPot(dt: number): void {
    const v = this.pot, T = v.T, P = v.pot;
    const has = P.beans || P.meat || P.bacon || P.shroom;
    if (has) {
      const boil = smooth(88, 100, T);
      P.progress += dt * boil * (P.beans && !P.meat && !P.bacon ? 0.04 : 0.016) * (1 + P.syrup * 0.1);
      P.sinceStir += dt;
      if (T > 95 && P.sinceStir > (P.beans && v.water < 0.05 ? 9 : 16)) P.scorch = Math.min(1.5, P.scorch + dt * 0.03);
      if (v.liquid) {
        v.liquid.mat.userData.uBoil.value = boil;
        v.liquid.mat.userData.uScorch.value = Math.min(1, P.scorch);
        P.spin *= Math.exp(-dt * 0.8);
        v.liquid.mat.userData.uSpin.value += P.spin * dt;
        if (!P.beans || P.meat || P.bacon) {
          // broth darkens as it cooks
          const k = clamp(P.progress, 0, 1);
          v.liquid.mat.color.setRGB(1.25 - k * 0.35, 1.2 - k * 0.4, 1.1 - k * 0.45);
        }
      }
      for (const f of v.foods) { const k = 0.02 * smooth(80, 100, T); f.a += k * dt; f.b += k * dt; f.a = Math.min(f.a, 0.95); f.b = Math.min(f.b, 0.95); f.setDone(); }
      if (P.progress > 1 && !v.calls.has('ready')) { v.calls.add('ready'); if (this.active) this.pop(P.beans && !P.meat ? 'Bubbling' : 'Ready', this.W(v.pos.clone().add(V3(0, 0.15, 0))), '#ffe08a'); }
      if (P.scorch > 0.3 && !v.calls.has('scorch')) { v.calls.add('scorch'); if (this.active) this.pop('Sticking! Stir it', this.W(v.pos.clone().add(V3(0, 0.15, 0))), '#ff8a60'); }
    }
    const boil = (v.water > 0.05 || P.beans) ? smooth(92, 100, T) : 0;
    this.loop(v, 'pot_boil', boil * 0.7, 0.9 + boil * 0.15);
    if (boil > 0.2 && Math.random() < dt * 8 * boil) puffs.emit(this.W(v.pos.clone().add(V3((Math.random() - 0.5) * 0.08, 0.12, (Math.random() - 0.5) * 0.08))), V3(0, 0.18, 0), { size: 0.03, grow: 2.5, life: 1.4, color: new THREE.Color(0.9, 0.9, 0.9), alpha: 0.2 * boil, rise: 0.2 });
  }

  private brewCoffee(dt: number): void {
    const v = this.coffee, C = v.coffee;
    const boiling = v.water > 0.05 && v.T >= 99;
    if (boiling && C.grounds) C.boil += dt;
    if (C.grounds && !boiling && C.boil > 0.5) C.settle += dt;
    if (boiling && C.grounds) C.settle = 0;
    const k = boiling ? 1 : smooth(85, 99, v.T) * 0.4;
    this.loop(v, 'pot_boil', k * 0.45, 1.25);
    if (k > 0.3 && Math.random() < dt * 6 * k) puffs.emit(this.W(v.pos.clone().add(V3(0, 0.14, 0.11))), V3(0, 0.15, 0.05), { size: 0.02, grow: 2.5, life: 1.2, color: new THREE.Color(0.92, 0.92, 0.92), alpha: 0.22 * k, rise: 0.2 });
    const lid = v.obj.userData.lid as THREE.Object3D;
    if (lid) lid.rotation.x += ((boiling ? -0.08 - Math.abs(Math.sin(this.time * 23)) * 0.06 : 0) + (lid.userData.open ? -1.6 : 0) - lid.rotation.x) * Math.min(1, dt * 14);
    if (boiling && Math.random() < dt * 1.2) audio.play('pot_lid', { pos: this.W(v.pos), vol: 0.15, rate: 1.4 });
    if (boiling && C.grounds && C.boil > 1 && !v.calls.has('pull')) { v.calls.add('pull'); if (this.active) this.pop('Pull it off the heat', this.W(v.pos.clone().add(V3(0, 0.2, 0))), '#ffe08a'); }
    if (C.grounds && C.settle > 4 && !v.calls.has('settled')) { v.calls.add('settled'); if (this.active) this.pop('Settled. Pour it', this.W(v.pos.clone().add(V3(0, 0.2, 0))), '#ffe08a'); }
  }

  private smokeRack(dt: number): void {
    const s = this.g.stove;
    const smoke = s.lit ? (0.35 + (1 - this.draft) * 0.9) * (0.3 + s.level * 0.7) : 0;
    for (const f of this.rackStrips) {
      // three game hours of gentle smoke
      f.smoke = Math.min(1, f.smoke + dt * this.g.timeScale * smoke / (3 * 3600));
      f.a = f.b = 0.6 + f.smoke * 0.7; f.setDone();
      for (const m of f.mats) m.color.setRGB(1 - f.smoke * 0.45, 1 - f.smoke * 0.55, 1 - f.smoke * 0.6);
    }
  }

  private loop(v: Vessel, id: string, vol: number, rate: number): void {
    const key = id === 'pot_boil' ? 'boilVoice' : 'voice';
    let voice = v[key];
    if (vol > 0.02) {
      if (!voice) { voice = audio.play(id, { pos: this.W(v.pos), loop: true, vol: 0, fadeIn: 0.3 }); v[key] = voice; }
      voice?.setVol(vol, 0.2); voice?.setRate(rate, 0.3); voice?.setPos(this.W(v.pos));
    } else if (voice) { voice.stop(0.4); v[key] = null; }
  }

  private floorAt(pw: THREE.Vector3): number {
    const p = this.L(pw, this.tmp);
    let y = -Infinity;
    if (p.x > PLATE.x0 && p.x < PLATE.x1 && p.z > PLATE.z0 && p.z < PLATE.z1) y = PLATE.y;
    const s = this.skillet;
    if (Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 0.1) y = s.pos.y + 0.008;
    if (p.x > COUNTER.x0 && p.x < COUNTER.x1 && p.z > COUNTER.z0 && p.z < COUNTER.z1) y = COUNTER.y;
    if (y === -Infinity) return -Infinity;
    return this.W(this.tmp.set(p.x, y, p.z)).y;
  }

  // ------------------------------------------------------------------------------------------ placing food
  private foodWorldLocal(f: Food, v: Vessel | null): THREE.Vector3 {
    if (v) return v.pos.clone().add(V3(f.local.x, v.floor, f.local.y));
    return V3(f.local.x, 0, f.local.y);
  }
  private vesselOf(f: Food): Vessel | null {
    return f.where === 'skillet' ? this.skillet : f.where === 'pot' ? this.pot : null;
  }
  private placeFood(f: Food, dt: number): void {
    if (f.where === 'hand' || f.where === 'gone') return;
    const o = f.obj;
    let base: THREE.Vector3;
    if (f.where === 'board') base = this.boardSurface(f.local);
    else if (f.where === 'plate') base = this.plateObj.position.clone().add(V3(f.local.x, 0.022, f.local.y));
    else if (f.where === 'rack') base = this.rack.position.clone().add(V3(f.local.x, -0.004, 0.025));
    else {
      const v = this.vesselOf(f)!;
      base = this.foodWorldLocal(f, v);
      if (f.where === 'pot') {
        // bob in the broth
        base.y = v.pos.y + 0.06 + Math.sin(this.time * 2 + f.local.x * 40) * 0.003;
        const a = v.pot.spin * dt;
        f.local.rotateAround(new THREE.Vector2(), a * 0.6);
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
          audio.play('pan_fry', { pos: this.W(v.pos), vol: 0.25, rate: 1.3 });
          this.bits.emit(this.W(this.foodWorldLocal(f, v)).add(V3(0, 0.01, 0)), V3(0, 0.8, 0), { color: new THREE.Color(0.86, 0.68, 0.34), size: 0.003, life: 1, stay: 1.5, spread: 1.6, n: 6, floor: (q) => this.floorAt(q) });
        }
        f.flip = null;
      }
    }
    if (f.where === 'rack') {
      // strips hang over the rail, swaying in the stove's updraft
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

  private boardSurface(local: THREE.Vector2): THREE.Vector3 {
    // the board's local frame: x along the board, y across it (toward the cook)
    return this.board.position.clone().add(V3(local.x, 0.041, local.y));
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

  private boardBusy(): boolean { return !!this.stock || this.foods.some((f) => f.where === 'board'); }

  // ------------------------------------------------------------------------------------------ work (input)
  protected work(dt: number): void {
    const p = this.ptr;
    this.hover = null;
    this.edgeScroll(dt);
    if (this.drag) this.dragUpdate(dt);
    else this.idle(dt);
    if (p.rpressed && !this.drag) this.secondary();
    this.label = this.hover;
    this.handsIdle();
  }

  /** edge of the screen for a moment: look over at the neighbouring part of the work */
  private edgeScroll(dt: number): void {
    const p = this.ptr;
    const dirs: Record<ViewName, { l?: ViewName; r?: ViewName; d?: ViewName; u?: ViewName }> = {
      stove: { l: 'pantry', r: 'prep', d: 'door' }, prep: { l: 'stove' }, pantry: { r: 'stove' }, door: { u: 'stove' },
    };
    const d = dirs[this.viewName];
    const want = p.x > 0.9 ? d.r : p.x < -0.9 ? d.l : p.y < -0.88 ? d.d : p.y > 0.88 ? d.u : undefined;
    if (want) { this.edgeT += dt; if (this.edgeT > 0.3) { this.goView(want); this.edgeT = -0.4; } }
    else this.edgeT = Math.min(0, this.edgeT + dt);
  }
  private goView(n: ViewName): void {
    if (n === this.viewName) return;
    const from = this.viewName;
    this.viewName = n;
    this.setView(this.worldView(n));
    // keep the cursor on the same side it came from, pulled in from the edge
    if (from === 'stove' && n === 'prep') this.ptr.x = -0.2;
    else if (from === 'stove' && n === 'pantry') this.ptr.x = 0.25;
    else if (n === 'stove' && from === 'prep') this.ptr.x = 0.55;
    else if (n === 'stove' && from === 'pantry') this.ptr.x = -0.55;
    else if (n === 'door') this.ptr.y = 0.1;
    else if (from === 'door') this.ptr.y = -0.55;
    if (this.script) { this.script.x = this.ptr.x; this.script.y = this.ptr.y; }
  }

  private pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    for (const f of this.foods) if (f.where !== 'gone' && f.where !== 'hand') list.push(f.obj);
    if (this.stock) list.push(this.stock.obj);
    for (const v of [this.skillet, this.pot, this.coffee]) list.push(v.obj);
    for (const pp of this.pantry) list.push(pp.hit);
    list.push(this.boardHit, this.plateObj, this.mugObj, this.rack);
    if (this.served) list.push(this.served.hit);
    if (this.viewName === 'door' && this.doorPivot) list.push(this.doorPivot);
    return list;
  }

  /** what an intersection belongs to */
  private classify(h: THREE.Intersection | null): { kind: string; f?: Food; v?: Vessel; pp?: Pantry } | null {
    if (!h) return null;
    for (let o: THREE.Object3D | null = h.object; o; o = o.parent) {
      const f = this.foods.find((x) => x.obj === o);
      if (f) return { kind: 'food', f };
      if (this.stock && o === this.stock.obj) return { kind: 'stock' };
      for (const v of [this.skillet, this.pot, this.coffee]) if (o === v.obj) return { kind: 'vessel', v };
      const pp = this.pantry.find((x) => x.hit === o || x.obj === o);
      if (pp) return { kind: 'pantry', pp };
      if (o === this.boardHit || o === this.board) return { kind: 'board' };
      if (o === this.plateObj) return { kind: 'plate' };
      if (o === this.mugObj) return { kind: 'mug' };
      if (this.served && o === this.served.hit) return { kind: 'served' };
      if (o === this.rack) return { kind: 'rack' };
      if (o === this.draftDisc) return { kind: 'draft' };
      if (o === this.doorPivot) return { kind: 'door' };
    }
    return null;
  }

  private idle(_dt: number): void {
    const p = this.ptr, g = this.g;
    const h = this.pick(this.pickables());
    const c = this.classify(h);
    const at = h?.point.clone() ?? null;
    const say = (t: string) => { if (at) this.hover = { text: t, at }; };
    if (!c) {
      if (this.viewName === 'stove' && p.y < -0.6) say('');
      return;
    }
    switch (c.kind) {
      case 'food': {
        const f = c.f!;
        if (f.where === 'skillet') {
          say(f.kind === 'shroom' ? 'Nudge' : f.kind === 'egg' ? 'Flip it over easy (flick up)' : 'Flip (flick up)');
          if (p.pressed) this.startFlip(f);
        } else if (f.where === 'board') {
          if (f.kind === 'dough') {
            say(f.knead < 1 ? 'Knead the dough' : 'Into the skillet');
            if (p.pressed) { if (f.knead < 1) this.drag = { kind: 'knead', f, last: new THREE.Vector2(p.x, p.y), amt: 0 }; else this.startFoodDrag(f); }
          } else if (f.kind === 'trout' && f.u1 - f.u0 > 0.16) {
            say(f.u1 - f.u0 > 0.45 ? 'Cut it into steaks (draw the knife down)' : 'Cut  ·  tug sideways to take it');
            if (p.pressed) this.startCut('trout', f);
          } else { say('Take it'); if (p.pressed) this.startFoodDrag(f); }
        } else if (f.where === 'pot') { say('Stir'); if (p.pressed) this.drag = { kind: 'stir', v: this.pot, last: this.potAngle(), amt: 0 }; }
        else if (f.where === 'plate') { this.servedHover(say); }
        else if (f.where === 'rack') say(f.smoke >= 1 ? 'Smoked. Take it' : `Smoking… ${Math.round(f.smoke * 100)}%`);
        if (f.where === 'rack' && p.pressed && f.smoke >= 1) this.takeJerky();
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
        if (v.kind === 'pot' && h && this.L(h.point).y > v.pos.y + 0.03 && (v.pot.beans || v.pot.meat || v.pot.bacon || v.pot.shroom) && this.inPot(h.point)) {
          say('Stir'); if (p.pressed) this.drag = { kind: 'stir', v, last: this.potAngle(), amt: 0 };
          break;
        }
        say(v.kind === 'skillet' ? (v.foods.length ? 'Move the skillet  (drop on the plate to serve)' : 'Move the skillet') : v.kind === 'pot' ? 'Move the pot' : this.coffee.coffee.grounds ? 'Move the coffee pot  (drop on the mug to pour)' : 'Move the coffee pot');
        if (p.pressed) { this.drag = { kind: 'vessel', v, from: v.pos.clone() }; audio.play('pot_lid', { pos: this.W(v.pos), vol: 0.3, rate: 0.8 }); }
        break;
      }
      case 'pantry': {
        const pp = c.pp!;
        const name = pp.id === 'lard' ? 'Lard' : ITEMS[pp.id]?.name ?? pp.id;
        say(pp.id === 'eggs' ? 'Take an egg' : pp.id === 'kindling' ? 'Kindling (for the stove door)' : name);
        if (p.pressed) {
          if (pp.id === 'eggs') this.startEgg(pp);
          else { this.drag = { kind: 'pantry', p: pp, lift: 0 }; audio.play('bag_rustle', { pos: this.W(pp.home), vol: 0.3 }); }
        }
        break;
      }
      case 'board':
        if (this.foods.some((f) => f.where === 'board' && f.kind !== 'dough')) { say('Tip the board into a pan'); if (p.pressed) this.drag = { kind: 'board' }; }
        else say(this.stock ? '' : 'Cutting board');
        break;
      case 'plate': say(this.served ? '' : 'Serve here (drop a pan on it)'); break;
      case 'mug': say(this.poured ? (this.poured.q > 0 ? 'Drink it  ·  RMB to take it' : '') : 'Pour coffee here'); if (this.poured && p.pressed) this.eatServed('coffee'); break;
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
          if (!g.stove.lit) g.placeAction('stove_feed', { held: '', point: h!.point, game: g });
          else { const it = findInteractable(this.doorPivot); it?.it.use({ held: '', point: h!.point, game: g }); }
        }
        break;
      }
    }
    void g;
  }

  private servedHover(say: (t: string) => void): void {
    if (!this.served) return;
    const n = ITEMS[this.served.dish]?.name ?? 'Food';
    say(`${n}: eat it hot  ·  RMB to pack it`);
    if (this.ptr.pressed) this.eatServed('plate');
  }

  private secondary(): void {
    const h = this.pick(this.pickables());
    const c = this.classify(h);
    if (!c) return;
    if ((c.kind === 'served' || c.kind === 'plate' || (c.kind === 'food' && c.f!.where === 'plate')) && this.served) this.packServed('plate');
    else if (c.kind === 'mug' && this.poured) this.packServed('coffee');
  }

  // ------------------------------------------------------------------------------------------ drags
  private startFoodDrag(f: Food): void {
    const v = this.vesselOf(f);
    if (v) v.foods = v.foods.filter((x) => x !== f);
    this.drag = { kind: 'food', f, from: f.where, fromV: v };
    f.where = 'hand';
    audio.play('eat_chew', { pos: this.W(f.obj.position), vol: 0.0 });
  }

  private startFlip(f: Food): void {
    const v = this.skillet;
    this.inHand(this.turner);
    this.drag = { kind: 'flip', f, v, t: 0, y0: this.ptr.y, vy: 0, lift: 0 };
  }

  private startCut(target: 'stock' | 'trout', f?: Food): void {
    this.inHand(this.knife);
    this.drag = { kind: 'cut', at: 0, depth: 0, y0: this.ptr.y, x0: this.ptr.x, done: false, target, f };
  }

  private startEgg(pp: Pantry): void {
    const g = this.g;
    if (this.eggsLeft <= 0) {
      if (!g.take('eggs')) { this.say('Out of eggs.', 2); return; }
      this.eggsLeft = 6;
    }
    this.eggsLeft--;
    const shell = new THREE.Mesh(eggShellGeo(), eggShellMat());
    shell.castShadow = true;
    this.root.add(shell);
    shell.position.copy(pp.home).add(V3(0, 0.06, 0));
    this.drag = { kind: 'egg', shell };
    audio.play('bottle_clink', { pos: this.W(pp.home), vol: 0.15, rate: 1.6 });
    if (this.eggsLeft <= 0 && !g.owns('eggs')) { pp.obj.removeFromParent(); this.pantry = this.pantry.filter((x) => x !== pp); }
  }

  private carryPoint(lift = 0.09): THREE.Vector3 | null {
    // the pointer on the work surfaces, then lifted
    const r = this.pointerRay();
    const local = new THREE.Ray(this.L(r.origin), this.L(r.origin.clone().add(r.direction)).sub(this.L(r.origin)).normalize());
    let best: THREE.Vector3 | null = null;
    for (const y of [PLATE.y, COUNTER.y, PANTRY.y]) {
      const t = (y - local.origin.y) / (local.direction.y || -1e-6);
      if (t <= 0) continue;
      const p = local.origin.clone().addScaledVector(local.direction, t);
      const onPlate = y === PLATE.y && p.x > PLATE.x0 - 0.1 && p.x < PLATE.x1 + 0.1 && p.z > PLATE.z0 - 0.1 && p.z < PLATE.z1 + 0.15;
      const onCounter = y === COUNTER.y && p.x > COUNTER.x0 - 0.02 && p.x < COUNTER.x1 + 0.05 && p.z > COUNTER.z0 - 0.05 && p.z < COUNTER.z1 + 0.05;
      const onPantry = y === PANTRY.y && p.x > PANTRY.x0 - 0.05 && p.x < PANTRY.x1 + 0.02 && p.z > PANTRY.z0 - 0.05 && p.z < PANTRY.z1 + 0.05;
      if (onPlate || onCounter || onPantry) { best = p; break; }
      if (!best && y === PLATE.y) best = p;
    }
    return best ? best.add(V3(0, lift, 0)) : null;
  }

  private dragUpdate(dt: number): void {
    const d = this.drag!, p = this.ptr;
    switch (d.kind) {
      case 'pantry': case 'food': case 'egg': case 'board': {
        const at = this.carryPoint(d.kind === 'board' ? 0.12 : 0.08);
        let obj: THREE.Object3D = d.kind === 'pantry' ? d.p.obj : d.kind === 'food' ? d.f.obj : d.kind === 'egg' ? d.shell : this.board;
        if (at) {
          obj.position.lerp(at, Math.min(1, dt * 18));
          const tgt = this.dropTarget(at);
          // pourables tip over their target
          const pour = d.kind === 'pantry' && ['syrup', 'beans', 'coffee', 'berries'].includes(d.p.id) && tgt && tgt.kind !== 'none';
          const tilt = pour ? -1.2 : d.kind === 'board' && tgt?.kind === 'vessel' ? 0.9 : 0;
          if (d.kind === 'pantry') { obj.rotation.set(0, d.p.yaw, 0); obj.rotateX(tilt); d.lift += dt; }
          if (d.kind === 'board') { obj.rotation.set(0, 0, -tilt * 0.8); }
          this.hover = { text: tgt?.label ?? '', at: this.W(at) };
          if (d.kind === 'food') this.placeHeldFood(d.f, at);
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
          const serve = this.overPlate(at) ? 'Serve' : this.overMug(at) && v.kind === 'coffee' ? 'Pour' : '';
          this.hover = { text: serve, at: this.W(at) };
        }
        if (p.released) this.dropVessel(v, at);
        break;
      }
      case 'flip': {
        d.t += dt;
        const vy = p.dy / Math.max(1e-3, dt);
        d.vy = d.vy * 0.5 + vy * 0.5;
        d.lift = clamp((p.y - d.y0) * 0.6, 0, 0.05);
        const f = d.f;
        // slide the piece around with the turner while held low
        const at = this.pointerOnPlane(this.W(V3(0, d.v.pos.y + d.v.floor, 0)).y);
        if (at && d.lift < 0.01) {
          const l = this.L(at).sub(d.v.pos);
          const r = Math.hypot(l.x, l.z), lim = d.v.inner - f.r * 0.6;
          if (r > lim) l.multiplyScalar(lim / r);
          f.local.lerp(new THREE.Vector2(l.x, l.z), Math.min(1, dt * 10));
        }
        this.hover = { text: 'Flick up to flip', at: this.W(this.foodWorldLocal(f, d.v)) };
        if (p.released || d.lift >= 0.05 || d.vy > 3.5) {
          const v = d.vy;
          if (f.kind === 'shroom') { /* nudged */ }
          else if (v > 1.4) {
            const hard = v > 6;
            const stuck = d.v.fat < 0.1 && f.down < 0.6 && Math.random() < 0.5;
            if (stuck) { this.pop('Stuck! Needs fat', this.W(this.foodWorldLocal(f, d.v)), '#ff9070'); f.addDown(0.04, 0); }
            else {
              const to = f.local.clone().add(new THREE.Vector2((Math.random() - 0.5) * (hard ? 0.08 : 0.02), (Math.random() - 0.5) * (hard ? 0.08 : 0.02)));
              const lim = d.v.inner - f.r * 0.6; if (to.length() > lim) to.setLength(lim);
              f.flip = { t: 0, dur: hard ? 0.5 : 0.38, h: hard ? 0.14 : 0.06 + Math.min(0.04, v * 0.006), from: f.local.clone(), to, ok: true };
              this.g.sound('axe_whoosh', this.W(d.v.pos), 0.12, 1.8);
              if (hard) { this.pop('Too hard!', this.W(this.foodWorldLocal(f, d.v)), '#ffb070'); if (f.kind === 'egg') f.broken = true; this.bits.emit(this.W(this.foodWorldLocal(f, d.v)), V3(0, 1.2, 0), { color: new THREE.Color(0.98, 0.92, 0.7), size: 0.004, life: 1.2, stay: 6, spread: 2, n: 12, floor: (q) => this.floorAt(q) }); }
            }
          } else if (v > 0.5) this.pop('Flick harder', this.W(this.foodWorldLocal(f, d.v)), '#e0d0a0');
          this.drag = null;
          this.putBack(this.turner);
        }
        break;
      }
      case 'cut': this.cutUpdate(d, dt); break;
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
          mesh.geometry = doughGeo(f.knead, 31);
          f.h = 0.05 - f.knead * 0.026;
          audio.play('foliage_rustle', { pos: this.W(f.obj.position), vol: 0.25, rate: 0.6 });
          puffs.emit(this.W(f.obj.position).add(V3(0, 0.03, 0)), V3(0, 0.1, 0), { size: 0.02, grow: 2, life: 0.8, color: new THREE.Color(0.95, 0.94, 0.9), alpha: 0.35, rise: 0.05 });
        }
        this.hover = { text: f.knead < 1 ? 'Knead…' : 'Round and flat. Into the skillet', at: this.W(f.obj.position).add(V3(0, 0.04, 0)) };
        if (p.released) this.drag = null;
        break;
      }
      case 'stir': {
        const a = this.potAngle();
        let da = a - d.last; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        d.last = a;
        d.v.pot.spin = d.v.pot.spin * 0.9 + (da / Math.max(dt, 1e-3)) * 0.1;
        d.amt += Math.abs(da);
        if (d.amt > 1.5) { d.amt = 0; d.v.pot.sinceStir = 0; d.v.pot.scorch = Math.max(0, d.v.pot.scorch - 0.05); audio.play('pot_lid', { pos: this.W(d.v.pos), vol: 0.12, rate: 1.7 }); }
        this.inHand(this.spoon);
        this.hover = { text: 'Stirring', at: this.W(d.v.pos.clone().add(V3(0, 0.13, 0))) };
        if (p.released) { this.drag = null; this.putBack(this.spoon); }
        break;
      }
      case 'draft': {
        this.draft = clamp(d.d0 + (p.x - d.x0) * 1.4, 0, 1);
        this.hover = { text: `Draft ${Math.round(this.draft * 100)}%`, at: this.draftDisc!.getWorldPosition(new THREE.Vector3()) };
        if (Math.random() < dt * 8) audio.play('drawer_open', { pos: this.draftDisc!.getWorldPosition(new THREE.Vector3()), vol: 0.06, rate: 2.2 });
        if (p.released) this.drag = null;
        break;
      }
    }
  }

  private placeHeldFood(f: Food, at: THREE.Vector3): void {
    f.obj.position.copy(at);
    f.obj.rotation.set(0, f.yaw, 0);
    if (f.flipped) f.obj.rotateX(Math.PI);
  }

  private potAngle(): number {
    const at = this.pointerOnPlane(this.W(V3(0, this.pot.pos.y + 0.06, 0)).y);
    if (!at) return 0;
    const l = this.L(at).sub(this.pot.pos);
    return Math.atan2(l.z, l.x);
  }
  private inPot(pw: THREE.Vector3): boolean { const l = this.L(pw).sub(this.pot.pos); return Math.hypot(l.x, l.z) < 0.08; }
  private overPlate(l: THREE.Vector3): boolean { return l.distanceTo(this.plateObj.position.clone().setY(l.y)) < 0.12; }
  private overMug(l: THREE.Vector3): boolean { return l.distanceTo(this.mugObj.position.clone().setY(l.y)) < 0.08; }

  /** what's under a carried thing (local point) */
  private dropTarget(at: THREE.Vector3): { kind: 'vessel' | 'board' | 'rack' | 'door' | 'none'; v?: Vessel; label: string } | null {
    const d = this.drag!;
    for (const v of [this.skillet, this.pot, this.coffee]) if (Math.hypot(at.x - v.pos.x, at.z - v.pos.z) < v.r + 0.02) {
      const what = d.kind === 'pantry' ? d.p.id : d.kind === 'food' ? d.f.kind : d.kind === 'egg' ? 'egg' : d.kind === 'board' ? 'board' : '';
      if (v.kind === 'skillet' && ['lard', 'egg', 'bacon', 'trout', 'dough', 'meat', 'shroom', 'board'].includes(what)) return { kind: 'vessel', v, label: what === 'lard' ? 'Grease the skillet' : what === 'egg' ? 'Crack it in' : what === 'board' ? 'Tip it in' : 'Into the skillet' };
      if (v.kind === 'pot' && ['beans', 'syrup', 'bacon', 'meat', 'shroom', 'board'].includes(what)) return { kind: 'vessel', v, label: what === 'beans' ? 'Tip the beans in' : what === 'syrup' ? 'Pour a glug' : 'Into the pot' };
      if (v.kind === 'coffee' && what === 'coffee') return { kind: 'vessel', v, label: 'Spoon in the grounds' };
      return { kind: 'none', label: '' };
    }
    if (Math.abs(at.y - (COUNTER.y + 0.08)) < 0.05 && Math.abs(at.x - this.boardPos.x) < 0.24 && Math.abs(at.z - this.boardPos.z) < 0.15) {
      const id = d.kind === 'pantry' ? d.p.id : '';
      if (['bacon', 'fish', 'bannock_mix', 'chanterelle', ...meatIds()].includes(id)) return { kind: 'board', label: id === 'bannock_mix' ? 'Mix the dough' : 'Unwrap it on the board' };
      if (id === 'berries' && this.foods.some((f) => f.where === 'board' && f.kind === 'dough' && !f.berry)) return { kind: 'board', label: 'Work the berries in' };
      if (d.kind === 'food') return { kind: 'board', label: 'Back on the board' };
    }
    if (at.distanceTo(this.rack.position.clone().setY(at.y)) < 0.2 && d.kind === 'food' && (d.f.kind === 'meat' || d.f.kind === 'bacon') && d.f.done < 0.3) return { kind: 'rack', label: 'Hang it to smoke' };
    return null;
  }

  private drop(at: THREE.Vector3 | null): void {
    const d = this.drag!;
    const tgt = at ? this.dropTarget(at) : null;
    const g = this.g;
    this.drag = null;
    if (d.kind === 'egg') {
      if (tgt?.kind === 'vessel' && tgt.v === this.skillet) this.crackEgg(d.shell);
      else { d.shell.removeFromParent(); this.eggsLeft++; }
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
      return;
    }
    if (d.kind === 'pantry') {
      const pp = d.p;
      const home = () => { pp.obj.position.copy(pp.home); pp.obj.rotation.set(0, pp.yaw, 0); if (pp.id === 'fish') pp.obj.rotation.set(0, pp.yaw, Math.PI / 2); };
      if (!tgt || tgt.kind === 'none') { home(); return; }
      const id = pp.id;
      if (tgt.kind === 'vessel' && tgt.v) {
        const v = tgt.v;
        if (id === 'lard') { v.fat = Math.min(1, v.fat + 0.5); audio.play('pan_fry', { pos: this.W(v.pos), vol: 0.3 }); this.pop('Lard', this.W(v.pos).add(V3(0, 0.06, 0)), '#fff2c0'); home(); return; }
        if (id === 'beans') { if (!g.take('beans')) { home(); return; } v.pot.beans = true; this.potLiquid(v, 'beans'); this.consumePantry(pp); audio.play('pot_lid', { pos: this.W(v.pos), vol: 0.4 }); return; }
        if (id === 'syrup') {
          if (this.syrupLeft <= 0) { if (!g.take('syrup')) { home(); return; } this.syrupLeft = 4; }
          this.syrupLeft--; v.pot.syrup++; this.pop('A glug of syrup', this.W(v.pos).add(V3(0, 0.12, 0)), '#e0a050');
          audio.play('drink_gulp', { pos: this.W(v.pos), vol: 0.2, rate: 0.7 });
          if (this.syrupLeft <= 0 && !g.owns('syrup')) this.consumePantry(pp); else home();
          return;
        }
        if (id === 'coffee') {
          if (this.coffeeLeft <= 0) { if (!g.take('coffee')) { home(); return; } this.coffeeLeft = 4; }
          this.coffeeLeft--;
          v.coffee.grounds = true; v.coffee.boil = 0; v.coffee.settle = 0; v.calls.clear();
          const lid = v.obj.userData.lid as THREE.Object3D; lid.userData.open = true; setTimeout(() => { lid.userData.open = false; }, 900);
          this.bits.emit(this.W(v.pos.clone().add(V3(0, 0.2, 0))), V3(0, -0.3, 0), { color: new THREE.Color(0.18, 0.11, 0.06), size: 0.004, life: 0.4, spread: 0.1, n: 14 });
          this.pop(v.T >= 99 ? 'Grounds in. Let it boil a bit' : 'Grounds in. Bring it to a boil', this.W(v.pos).add(V3(0, 0.18, 0)), '#ffe08a');
          if (this.coffeeLeft <= 0 && !g.owns('coffee')) this.consumePantry(pp); else home();
          return;
        }
        home();
        return;
      }
      if (tgt.kind === 'board') {
        if (this.boardBusy() && id !== 'berries') { this.say('Clear the board first.', 2); home(); return; }
        if (id === 'berries') {
          const dough = this.foods.find((f) => f.where === 'board' && f.kind === 'dough' && !f.berry);
          if (dough && g.take('berries')) {
            this.foods = this.foods.filter((f) => f !== dough); dough.obj.removeFromParent();
            const nd = makeFood('dough', { berry: true, flat: dough.knead }); nd.knead = dough.knead; nd.where = 'board';
            this.addFood(nd); this.consumePantry(pp);
            this.pop('Berries in', this.W(this.boardSurface(nd.local)).add(V3(0, 0.05, 0)), '#a0a0ff');
          } else home();
          return;
        }
        const take = id === 'fish' ? 'fish' : id;
        if (!g.take(take)) { home(); return; }
        this.consumePantry(pp);
        audio.play('paper_rustle', { pos: this.W(this.boardPos), vol: 0.5 });
        if (id === 'bacon') this.setStock(new Stock('bacon', 0.2));
        else if (meatIds().includes(id)) this.setStock(new Stock('meat', 0.15));
        else if (id === 'chanterelle') this.setStock(new Stock('shroom', 1));
        else if (id === 'fish') { const f = makeFood('trout'); f.where = 'board'; f.local.set(0, 0); this.addFood(f); }
        else if (id === 'bannock_mix') { const f = makeFood('dough', { flat: 0 }); f.where = 'board'; this.addFood(f); this.pop('Water in. Now knead it', this.W(this.boardPos).add(V3(0, 0.08, 0)), '#ffe08a'); }
        return;
      }
      home();
    }
  }

  private consumePantry(pp: Pantry): void {
    pp.obj.removeFromParent();
    this.pantry = this.pantry.filter((x) => x !== pp);
  }

  private setStock(s: Stock): void {
    this.stock = s;
    s.obj.position.copy(this.boardSurface(new THREE.Vector2(-0.17 + s.len / 2, -0.01)));
    s.obj.rotation.y = 0.03;
    this.root.add(s.obj);
  }

  private addFood(f: Food): void {
    this.foods.push(f);
    this.root.add(f.obj);
    f.setDone();
  }

  private intoVessel(f: Food, v: Vessel): void {
    if (v.kind === 'coffee') { f.where = 'board'; return; }
    if (v.kind === 'skillet') {
      if (f.kind === 'trout' && f.u1 - f.u0 > 0.45) { this.say('Too big for the pan. Cut it into steaks first.', 2.5); f.where = 'board'; return; }
      if (f.kind === 'dough' && f.knead < 0.6) { this.say('Knead it first.', 2); f.where = 'board'; return; }
      f.where = 'skillet';
      f.local.copy(this.freeSpot(v, f.r));
      f.yaw = Math.random() * 6.28;
      v.foods.push(f);
      if (v.T > 120) audio.play('pan_fry', { pos: this.W(v.pos), vol: 0.45, rate: 1.1 });
      if (v.fat < 0.1 && f.kind !== 'bacon') this.pop('Dry pan', this.W(v.pos).add(V3(0, 0.06, 0)), '#e0c0a0');
      return;
    }
    // the pot: meat, bacon and mushrooms go in with water for stew
    if (f.kind === 'dough' || f.kind === 'egg' || f.kind === 'trout') { f.where = 'board'; return; }
    f.where = 'pot';
    if (!v.pot.beans && v.water < 0.05) { v.water = 0.8; this.potLiquid(v, 'stew'); this.say('A ladle of water from the bucket.', 2); }
    if (f.kind === 'meat') v.pot.meat = true;
    if (f.kind === 'bacon') v.pot.bacon = true;
    if (f.kind === 'shroom') v.pot.shroom = true;
    f.local.copy(this.freeSpot(v, f.r * 0.6));
    f.obj.scale.setScalar(0.7);
    v.foods.push(f);
    audio.play('pot_lid', { pos: this.W(v.pos), vol: 0.2, rate: 1.3 });
  }

  private potLiquid(v: Vessel, kind: 'beans' | 'stew'): void {
    if (v.liquid) { if (kind === 'beans' && v.water > 0) return; v.obj.remove(v.liquid.mesh); }
    const mat = liquidMat(kind === 'beans' ? 'beans' : 'stew');
    const mesh = new THREE.Mesh(discGeo(0.086, 22), mat);
    mesh.position.y = 0.06;
    v.obj.add(mesh);
    v.liquid = { mesh, mat };
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

  private crackEgg(shell: THREE.Mesh): void {
    const v = this.skillet;
    shell.removeFromParent();
    const f = makeFood('egg');
    f.where = 'skillet';
    f.local.copy(this.freeSpot(v, f.r));
    f.yaw = Math.random() * 6.28;
    v.foods.push(f);
    this.addFood(f);
    audio.play('bottle_clink', { pos: this.W(v.pos), vol: 0.3, rate: 1.9 });
    if (v.T > 120) audio.play('pan_fry', { pos: this.W(v.pos), vol: 0.5, rate: 1.0 });
    this.bits.emit(this.W(v.pos.clone().add(V3(f.local.x, 0.06, f.local.y))), V3(0, -0.4, 0), { color: new THREE.Color(0.9, 0.82, 0.7), size: 0.006, life: 0.3, spread: 0.6, n: 4 });
  }

  // ------------------------------------------------------------------------------------------ cutting
  private cutUpdate(d: Extract<Drag, { kind: 'cut' }>, _dt: number): void {
    const p = this.ptr;
    // where along the food the knife sits: the pointer on the board plane, along the board's long axis
    const at = this.pointerOnPlane(this.W(V3(0, COUNTER.y + 0.04, 0)).y);
    let len = 0, center = this.boardPos.clone();
    if (d.target === 'stock' && this.stock) { len = this.stock.len; center = this.stock.obj.position.clone(); }
    else if (d.f) { len = (d.f.u1 - d.f.u0) * 0.42; center = this.boardSurface(d.f.local); }
    if (at && !d.done) {
      const l = this.L(at);
      // board long axis is root -Z (board local +X maps to root -Z)
      const along = l.x - center.x;
      d.at = clamp(along, -len / 2 + 0.004, len / 2 - 0.004);
      // a sideways tug before the knife bites picks the piece up instead
      if (d.f && d.depth < 0.25 && Math.abs(p.x - d.x0) > 0.08) { this.putBack(this.knife); const f = d.f; this.drag = null; this.startFoodDrag(f); return; }
    }
    const depth = clamp((d.y0 - p.y) / 0.16, 0, 1);
    if (depth > d.depth) {
      d.depth = depth;
      if (Math.random() < 0.25) audio.play('saw_hand', { pos: this.W(center), vol: 0.05, rate: 2.2 });
    }
    this.hover = { text: d.done ? '' : 'Draw the knife down', at: this.W(center).add(V3(0, 0.06, 0)) };
    if (!d.done && d.depth >= 1) {
      d.done = true;
      this.g.sound('knife_chop', this.W(center), 0.7);
      this.doCut(d, len, center);
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
          this.pop('Chopped', this.W(center).add(V3(0, 0.05, 0)), '#ffe08a');
        } else this.pop(`Chop ${st.chops}`, this.W(center).add(V3(0, 0.05, 0)));
        return;
      }
      // slice off the free (+along) end
      const t = clamp(len / 2 - d.at, 0.004, 0.035);
      const kind = st.kind === 'bacon' ? 'bacon' : 'meat';
      const f = makeFood(kind, { thick: st.kind === 'bacon' ? t : Math.min(0.012, t * 0.5) });
      if (st.kind === 'meat') { f.r = 0.05; }
      f.where = 'board';
      // lay the slice down beside the stock, toward the board's end
      const n = this.foods.filter((x) => x.where === 'board').length;
      f.local.set(0.1 + (n % 2) * 0.075, -0.07 + Math.floor(n / 2) * 0.07);
      f.yaw = Math.random() * 6.28;
      this.addFood(f);
      st.len -= t;
      if (st.len < 0.012) { st.obj.removeFromParent(); this.stock = null; }
      else { st.rebuild(); st.obj.position.copy(this.boardSurface(new THREE.Vector2(-0.17 + st.len / 2, -0.01))); }
      const ideal = st.kind === 'bacon' ? 0.01 : 0.02;
      const msg = t < ideal * 0.6 ? 'Thin' : t > ideal * 1.6 ? 'Thick' : 'Even';
      this.pop(msg, this.W(this.boardSurface(f.local)).add(V3(0, 0.04, 0)), msg === 'Even' ? '#ffe08a' : '#e0c8a0');
      return;
    }
    if (d.f) {
      const f = d.f;
      const span = f.u1 - f.u0;
      const u = f.u0 + (d.at / len + 0.5) * span;
      if (u - f.u0 < 0.06 || f.u1 - u < 0.06) { this.pop('Too thin', this.W(center).add(V3(0, 0.05, 0))); return; }
      this.foods = this.foods.filter((x) => x !== f); f.obj.removeFromParent();
      const a = makeFood('trout', { u0: f.u0, u1: u }), b = makeFood('trout', { u0: u, u1: f.u1 });
      const base = f.local.clone();
      const off = (x: number) => (x - (f.u0 + f.u1) / 2) * 0.42;
      a.local.set(base.x + off((f.u0 + u) / 2) - 0.008, base.y); b.local.set(base.x + off((u + f.u1) / 2) + 0.008, base.y);
      a.where = b.where = 'board';
      this.addFood(a); this.addFood(b);
    }
  }

  // ------------------------------------------------------------------------------------------ serving
  private dropVessel(v: Vessel, at: THREE.Vector3 | null): void {
    this.drag = null;
    if (at && this.overPlate(at) && v.kind !== 'coffee') { this.serve(v); v.pos.copy(this.homeOf(v)); v.obj.position.copy(v.pos); return; }
    if (at && this.overMug(at) && v.kind === 'coffee') { this.pourCoffee(); v.pos.copy(this.homeOf(v)); v.obj.position.copy(v.pos); return; }
    // set it down: on the plate (snapped inside it) or on the counter / pantry
    let dest = at ? at.clone() : this.homeOf(v);
    const onPlate = dest.x > PLATE.x0 - 0.05 && dest.x < PLATE.x1 + 0.05 && dest.z > PLATE.z0 - 0.05 && dest.z < PLATE.z1 + 0.1;
    if (onPlate) {
      dest.y = PLATE.y;
      dest.x = clamp(dest.x, PLATE.x0 + v.r * 0.6, PLATE.x1 - v.r * 0.6);
      dest.z = clamp(dest.z, PLATE.z0 + v.r * 0.6, PLATE.z1 - v.r * 0.4);
    } else if (dest.x > COUNTER.x0 && dest.x < COUNTER.x1 && dest.z > COUNTER.z0 && dest.z < COUNTER.z1) dest.y = COUNTER.y;
    else if (dest.x > PANTRY.x0 && dest.x < PANTRY.x1 && dest.z > PANTRY.z0 && dest.z < PANTRY.z1) dest.y = PANTRY.y;
    else dest = this.homeOf(v);
    // keep vessels apart
    for (const o of [this.skillet, this.pot, this.coffee]) if (o !== v && Math.abs(o.pos.y - dest.y) < 0.05) {
      const dx = dest.x - o.pos.x, dz = dest.z - o.pos.z, dd = Math.hypot(dx, dz), min = (v.r + o.r) * 0.82;
      if (dd < min) { const k = (min - dd) / Math.max(1e-3, dd); dest.x += dx * k; dest.z += dz * k; }
    }
    v.pos.copy(dest); v.obj.position.copy(dest);
    audio.play('pot_lid', { pos: this.W(dest), vol: 0.35, rate: 0.7 });
  }

  private homeOf(v: Vessel): THREE.Vector3 {
    return v.kind === 'skillet' ? V3(0, PLATE.y, 0.27) : v.kind === 'pot' ? V3(-0.095, PLATE.y, 0.02) : V3(0.125, PLATE.y, 0.0);
  }

  private serve(v: Vessel): void {
    if (this.served) { this.say('Eat what\'s on the plate first.', 2); return; }
    let dish: string | null = null, q = 0;
    const foods = v.foods.slice();
    if (v.kind === 'skillet') {
      if (!foods.length) return;
      const counts: Partial<Record<FoodKind, number>> = {};
      for (const f of foods) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
      dish = skilletDish(counts, foods.some((f) => f.berry));
      // quality: every piece golden on its sides
      let sum = 0, burnt = 0, raw = 0;
      for (const f of foods) {
        const s = f.kind === 'egg' ? Math.min(f.b, f.a + 0.35) : f.least;
        const top = f.worst;
        const score = top > 1.35 ? -1 : s < 0.45 ? 0 : s < 0.7 ? 0.5 : top > 1.12 ? 0.6 : 1;
        if (top > 1.35) burnt++; if (s < 0.45) raw++;
        sum += score;
      }
      q = sum / foods.length;
      if (burnt > foods.length / 2) dish = 'burnt_food';
      if (raw === foods.length) { this.say('Still raw. Give it time on the heat.', 2.5); return; }
    } else if (v.kind === 'pot') {
      const P = v.pot;
      dish = potDish({ beans: P.beans, syrup: P.syrup > 0, meat: P.meat, bacon: P.bacon, shroom: P.shroom, water: v.water > 0.05 });
      if (!dish) return;
      if (P.progress < 0.4) { this.say('Not cooked yet. Let it simmer.', 2.5); return; }
      q = clamp(P.progress, 0, 1) - P.scorch * 0.6 + (P.syrup > 2 ? -0.2 : 0) + (P.meat && P.shroom ? 0.1 : 0);
      if (P.scorch > 1.1) dish = 'burnt_food';
    }
    if (!dish) return;
    // the food goes onto the tin plate (pot dishes as a heap of whatever was in it)
    v.foods = [];
    for (const f of foods) { f.where = 'plate'; f.local.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.06); f.obj.scale.setScalar(v.kind === 'pot' ? 0.8 : 1); }
    if (v.kind === 'pot') {
      const heap = new THREE.Mesh(discGeo(0.07, 16), v.liquid?.mat ?? liquidMat('stew'));
      heap.position.copy(this.plateObj.position).add(V3(0, 0.02, 0));
      this.root.add(heap);
      foods.push(Object.assign(new Food('shroom', 0, 0), { where: 'plate' as Where }));
      foods[foods.length - 1].obj.add(heap);
      heap.position.set(0, 0, 0);
      this.addFood(foods[foods.length - 1]);
      foods[foods.length - 1].local.set(0, 0);
      // empty the pot
      if (v.liquid) { v.obj.remove(v.liquid.mesh); v.liquid = null; }
      v.water = 0; v.pot = { beans: false, syrup: 0, meat: false, bacon: false, shroom: false, progress: 0, scorch: 0, sinceStir: 0, spin: 0 }; v.calls.clear();
    }
    const hit = proxy(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12));
    hit.position.copy(this.plateObj.position).add(V3(0, 0.03, 0));
    this.root.add(hit);
    this.served = { dish, q: clamp(q, 0, 1), foods, obj: this.plateObj, hit };
    audio.play('bottle_clink', { pos: this.W(this.plateObj.position), vol: 0.35, rate: 0.7 });
    const name = ITEMS[dish]?.name ?? dish;
    this.pop(name, this.W(this.plateObj.position).add(V3(0, 0.1, 0)), '#ffe08a');
    this.say(`${name}. Eat it hot, or right-click to pack it.`, 3);
  }

  private pourCoffee(): void {
    const v = this.coffee, C = v.coffee;
    if (this.poured) { this.say('Drink the cup you poured first.', 2); return; }
    if (!C.grounds || C.boil < 0.5) { this.say(C.grounds ? 'Boil it first.' : 'That\'s just hot water. Grounds first.', 2.5); return; }
    // quality: a few seconds of boil with the grounds, then settled off the boil
    const boilQ = C.boil < 2 ? 0.5 : C.boil < 9 ? 1 : C.boil < 16 ? 0.6 : 0.2;
    const settleQ = C.settle > 3 ? 1 : C.settle > 1 ? 0.6 : 0.3;
    this.poured = { q: boilQ * settleQ };
    C.poured++;
    if (C.poured >= 3) { C.grounds = false; C.boil = 0; C.settle = 0; C.poured = 0; v.calls.clear(); }
    audio.play('drink_gulp', { pos: this.W(this.mugObj.position), vol: 0.25, rate: 0.6 });
    puffs.emit(this.W(this.mugObj.position).add(V3(0, 0.1, 0)), V3(0, 0.2, 0), { size: 0.04, grow: 3, life: 2, color: new THREE.Color(0.92, 0.92, 0.92), alpha: 0.3, rise: 0.2, n: 3 });
    // a dark disc of coffee in the mug
    const disc = new THREE.Mesh(discGeo(0.036, 14), liquidMat('coffee'));
    disc.position.set(0, 0.08, 0);
    disc.name = 'coffee_fill';
    this.mugObj.add(disc);
    this.pop('Coffee', this.W(this.mugObj.position).add(V3(0, 0.12, 0)), '#ffe08a');
  }

  private dishLine(dish: string, q: number): string {
    const l = DISH_LINES[dish];
    if (!l) return dish === 'burnt_food' ? 'Charcoal. Something out there might eat it.' : `${ITEMS[dish]?.name ?? dish}.`;
    return q > 0.85 ? l[0] : q > 0.5 ? l[1] : l[2];
  }

  private eatServed(which: 'plate' | 'coffee'): void {
    const g = this.g;
    if (which === 'coffee' && this.poured) {
      const def = ITEMS.cowboy_coffee.food!;
      g.survival.eat(def.kcal, (def.warmth ?? 0) * (0.6 + this.poured.q * 0.6));
      g.sound('drink_gulp', undefined, 0.7);
      this.say(this.dishLine('cowboy_coffee', this.poured.q), 3.5);
      this.mugObj.getObjectByName('coffee_fill')?.removeFromParent();
      this.poured = null;
      return;
    }
    const s = this.served;
    if (!s) return;
    const def = ITEMS[s.dish]?.food;
    if (def) g.survival.eat(def.kcal * (0.8 + s.q * 0.35), (def.warmth ?? 0) * (0.7 + s.q * 0.5) + 0.1);
    g.sound('eat_chew', undefined, 0.7);
    if (s.q > 0.85) setTimeout(() => g.sound('sigh_satisfied', undefined, 0.5), 900);
    this.say(this.dishLine(s.dish, s.q), 4);
    this.clearServed();
  }

  private packServed(which: 'plate' | 'coffee'): void {
    const g = this.g;
    if (which === 'coffee' && this.poured) { g.give('cowboy_coffee'); this.mugObj.getObjectByName('coffee_fill')?.removeFromParent(); this.poured = null; this.say('Coffee in a jar for later.', 2); return; }
    const s = this.served;
    if (!s) return;
    g.give(s.dish);
    g.sound('pickup', undefined, 0.5);
    this.say(`${ITEMS[s.dish]?.name ?? s.dish} wrapped up in the pack.`, 2.5);
    this.clearServed();
  }

  private clearServed(): void {
    const s = this.served!;
    for (const f of s.foods) { f.where = 'gone'; f.obj.removeFromParent(); }
    this.foods = this.foods.filter((f) => f.where !== 'gone');
    s.hit.removeFromParent();
    this.served = null;
  }

  // ------------------------------------------------------------------------------------------ hands
  private handsIdle(): void {
    const H = this.hands, d = this.drag, p = this.ptr;
    const cam = this.g.camera;
    const down = V3(0, -1, 0);
    const fwd = V3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
    const side = V3(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
    H.stiff.R = 24; H.stiff.L = 22;
    if (!d) {
      // an open hand hovering over what the cursor is on
      // over something you can take, the hand comes up ready beside it; otherwise it stays out of the way
      const at = this.hover?.at;
      if (at && this.viewName !== 'door' && this.hover?.text) {
        const toCam = this.g.camera.position.clone().sub(at).normalize();
        const pos = at.clone().addScaledVector(side, 0.07).addScaledVector(toCam, 0.04).add(V3(0, 0.035, 0));
        const f = at.clone().sub(pos).normalize();
        H.set('R', { pos, q: H.freeQ('R', f, down.clone().addScaledVector(side, -0.4).normalize()), grip: GRIP.relax });
      } else H.rest('R');
      H.rest('L');
      return;
    }
    switch (d.kind) {
      case 'pantry': case 'food': case 'egg': {
        const o = d.kind === 'pantry' ? d.p.obj : d.kind === 'food' ? d.f.obj : d.shell;
        const w = o.getWorldPosition(new THREE.Vector3()).add(V3(0, d.kind === 'egg' ? 0.03 : 0.05, 0)).addScaledVector(fwd, -0.03);
        H.set('R', { pos: w, q: H.freeQ('R', fwd.clone().add(V3(0, -1.1, 0)), down.clone().addScaledVector(fwd, 0.25).normalize()), grip: d.kind === 'egg' ? GRIP.cup : GRIP.claw });
        H.rest('L');
        break;
      }
      case 'board': {
        const c = this.board.getWorldPosition(new THREE.Vector3());
        H.set('R', { pos: c.clone().addScaledVector(side, 0.12).add(V3(0, 0.03, 0)), q: H.freeQ('R', fwd.clone().addScaledVector(side, -0.3), side.clone().negate()), grip: GRIP.pinch });
        H.set('L', { pos: c.clone().addScaledVector(side, -0.12).add(V3(0, 0.03, 0)), q: H.freeQ('L', fwd.clone().addScaledVector(side, 0.3), side.clone()), grip: GRIP.pinch });
        break;
      }
      case 'vessel': {
        const v = d.v;
        const hp = this.W(v.pos.clone().add(v.kind === 'skillet' ? V3(0, 0.06, 0.21) : v.kind === 'pot' ? V3(0, 0.13, 0) : V3(0, 0.12, -0.085)));
        const ax = v.kind === 'skillet' ? this.dirW(V3(0, 0.15, -1)) : V3(0, 1, 0);
        H.set('R', { pos: hp, q: StationHands.toolQ(v.kind === 'skillet' ? ax.clone().negate() : side.clone().negate(), V3(0, 1, 0)), grip: GRIP.handle });
        H.rest('L');
        break;
      }
      case 'flip': {
        const v = d.v, f = d.f;
        const fp = this.W(this.foodWorldLocal(f, v)).add(V3(0, 0.01 + d.lift, 0));
        // the turner blade slides under the food from the near side; the grip is ~0.2 m behind the blade
        const along = fwd.clone().add(V3(0, -0.35 - d.lift * 4, 0)).normalize();
        H.set('R', { pos: fp.clone().addScaledVector(along, -0.2).addScaledVector(side, 0.02), q: StationHands.toolQ(along, V3(0, 1, 0)), grip: GRIP.handle });
        // the left hand steadies the skillet handle
        const hp = this.W(v.pos.clone().add(V3(0, 0.06, 0.21)));
        H.set('L', { pos: hp, q: StationHands.toolQ(this.dirW(V3(0, -0.15, 1)), V3(0, 1, 0)), grip: GRIP.handle });
        H.stiff.R = 40;
        break;
      }
      case 'cut': {
        const center = d.target === 'stock' && this.stock ? this.stock.obj.position.clone() : d.f ? this.boardSurface(d.f.local) : this.boardPos.clone();
        const along = this.dirW(V3(1, 0, 0));
        const len = d.target === 'stock' && this.stock ? this.stock.len : d.f ? (d.f.u1 - d.f.u0) * 0.42 : 0.1;
        const blade = this.W(center).addScaledVector(along, d.at).add(V3(0, 0.075 * (1 - d.depth) + 0.004, 0));
        // knife: the blade points away over the board, edge down; the grip sits back toward the cook
        const bladeDir = fwd.clone().multiplyScalar(0.72).addScaledVector(side, -0.69).add(V3(0, -0.16, 0)).normalize();
        H.set('R', { pos: blade.clone().addScaledVector(bladeDir, -0.135).add(V3(0, 0.035, 0)), q: StationHands.toolQ(bladeDir, V3(0, -1, 0)), grip: GRIP.handle });
        // the left hand clawed on the far end of the food, fingertips tucked
        const claw = this.W(center).addScaledVector(along, -len / 2 + 0.02).add(V3(0, 0.055, 0)).addScaledVector(fwd, -0.02);
        H.set('L', { pos: claw, q: H.freeQ('L', down.clone().addScaledVector(fwd, 0.5).addScaledVector(side, 0.2), down.clone().addScaledVector(side, 0.3)), grip: GRIP.claw });
        H.stiff.R = 34;
        break;
      }
      case 'knead': {
        const c = d.f.obj.getWorldPosition(new THREE.Vector3());
        const wob = Math.sin(this.time * 9) * 0.015;
        H.set('R', { pos: c.clone().add(V3(0, 0.05 + wob, 0)).addScaledVector(side, 0.035).addScaledVector(fwd, -0.03), q: H.freeQ('R', fwd, down), grip: GRIP.flat });
        H.set('L', { pos: c.clone().add(V3(0, 0.05 - wob, 0)).addScaledVector(side, -0.035).addScaledVector(fwd, -0.03), q: H.freeQ('L', fwd, down), grip: GRIP.flat });
        break;
      }
      case 'stir': {
        const v = d.v;
        const a = this.potAngle();
        const tip = this.W(v.pos.clone().add(V3(Math.cos(a) * 0.04, 0.05, Math.sin(a) * 0.04)));
        const up = V3(0.0, 1, 0).addScaledVector(fwd, -0.35).normalize();
        H.set('R', { pos: tip.clone().addScaledVector(up, 0.2), q: StationHands.toolQ(up.clone().negate(), fwd), grip: GRIP.handle });
        const hp = this.W(v.pos.clone().add(V3(-0.1, 0.1, 0)));
        H.set('L', { pos: hp, q: H.freeQ('L', side, down), grip: GRIP.pinch });
        break;
      }
      case 'draft': {
        const c = this.draftDisc!.getWorldPosition(new THREE.Vector3());
        H.set('R', { pos: c.clone().add(V3(0, 0, 0.04)).addScaledVector(fwd, -0.02), q: H.freeQ('R', V3(0, 1, 0).addScaledVector(fwd, 0.5), fwd), grip: GRIP.pinch });
        H.rest('L');
        break;
      }
    }
    void p;
  }

  private dirW(d: THREE.Vector3): THREE.Vector3 { return d.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())).normalize(); }

  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pantry' || d.kind === 'food' || d.kind === 'egg' || d.kind === 'board') this.drop(null);
    else if (d.kind === 'vessel') this.dropVessel(d.v, null);
    this.drag = null;
  }

  // ------------------------------------------------------------------------------------------ test hooks
  /** state for tests and the dev page */
  debug(): Record<string, unknown> {
    return {
      phase: this.phase, view: this.viewName, draft: this.draft, level: this.g.stove.level,
      skillet: { T: Math.round(this.skillet.T), fat: this.skillet.fat, foods: this.skillet.foods.map((f) => ({ k: f.kind, a: +f.a.toFixed(2), b: +f.b.toFixed(2), flipped: f.flipped })) },
      pot: { T: Math.round(this.pot.T), ...this.pot.pot }, coffee: { T: Math.round(this.coffee.T), ...this.coffee.coffee },
      board: this.foods.filter((f) => f.where === 'board').map((f) => f.kind), stock: this.stock?.kind ?? null, served: this.served?.dish ?? null,
      drag: this.drag?.kind ?? null, rack: this.rackStrips.map((f) => +f.smoke.toFixed(2)),
    };
  }

  /** dev: put things straight into the vessels (screenshots) */
  devCook(o: { bacon?: number; eggs?: number; trout?: boolean; bannock?: boolean; stew?: boolean; beans?: boolean; coffee?: boolean; heat?: number; done?: number }): void {
    const v = this.skillet;
    v.fat = 0.6;
    for (let i = 0; i < (o.bacon ?? 0); i++) { const f = makeFood('bacon', { thick: 0.01 }); f.where = 'skillet'; f.local.copy(this.freeSpot(v, f.r)); f.yaw = Math.random() * 6; v.foods.push(f); this.addFood(f); }
    for (let i = 0; i < (o.eggs ?? 0); i++) { const f = makeFood('egg'); f.where = 'skillet'; f.local.copy(this.freeSpot(v, f.r)); v.foods.push(f); this.addFood(f); }
    if (o.trout) for (const [a, b] of [[0.28, 0.44], [0.44, 0.6], [0.6, 0.76]]) { const f = makeFood('trout', { u0: a, u1: b }); f.where = 'skillet'; f.local.copy(this.freeSpot(v, f.r)); v.foods.push(f); this.addFood(f); }
    if (o.bannock) { const f = makeFood('dough', { flat: 1, berry: true }); f.knead = 1; f.h = 0.024; f.where = 'skillet'; v.foods.push(f); this.addFood(f); }
    if (o.stew) { this.pot.water = 0.8; this.potLiquid(this.pot, 'stew'); this.pot.pot.meat = true; this.pot.pot.shroom = true; for (let i = 0; i < 4; i++) { const f = makeFood(i % 2 ? 'shroom' : 'meat'); f.where = 'pot'; f.obj.scale.setScalar(0.7); f.local.copy(this.freeSpot(this.pot, 0.03)); this.pot.foods.push(f); this.addFood(f); } }
    if (o.beans) { this.pot.pot.beans = true; this.pot.pot.syrup = 1; this.potLiquid(this.pot, 'beans'); }
    if (o.coffee) { this.coffee.coffee.grounds = true; }
    if (o.heat !== undefined) for (const x of [this.skillet, this.pot, this.coffee]) x.T = o.heat;
    if (o.done !== undefined) for (const f of v.foods) { f.b = o.done; f.a = o.done * 0.35; f.setDone(); }
  }

  /** dev: set up a cutting moment on the board */
  devBoard(what: 'bacon' | 'trout' | 'dough'): void {
    if (what === 'bacon') this.setStock(new Stock('bacon', 0.2));
    else if (what === 'trout') { const f = makeFood('trout'); f.where = 'board'; this.addFood(f); }
    else { const f = makeFood('dough', { flat: 0.3 }); f.knead = 0.3; f.where = 'board'; this.addFood(f); }
  }
  devView(n: ViewName): void { this.goView(n); }
  devDrag(kind: 'cut' | 'flip' | 'stir' | 'knead', depth = 0.5): void {
    if (kind === 'cut') { this.inHand(this.knife); this.drag = { kind: 'cut', at: 0.02, depth, y0: this.ptr.y + depth * 0.16, x0: this.ptr.x, done: false, target: 'stock' }; }
    if (kind === 'flip') { const f = this.skillet.foods[0]; if (f) { this.inHand(this.turner); this.drag = { kind: 'flip', f, v: this.skillet, t: 0, y0: this.ptr.y - 0.02, vy: 0, lift: 0.02 }; } }
    if (kind === 'stir') { this.inHand(this.spoon); this.drag = { kind: 'stir', v: this.pot, last: 0, amt: 0 }; }
    if (kind === 'knead') { const f = this.foods.find((x) => x.kind === 'dough'); if (f) this.drag = { kind: 'knead', f, last: new THREE.Vector2(this.ptr.x, this.ptr.y), amt: 0 }; }
  }
}

/** dish models for the backpack and setDown: an enamel plate with a little of the food on it */
export function cookedModels(g: Game): void {
  const plate = (k: FoodKind[], berry = false) => {
    const o = buildProduct('enamel_plate');
    k.forEach((kind, i) => {
      const f = makeFood(kind, { berry, flat: 1 });
      f.a = f.b = 0.9; f.setDone();
      f.obj.position.set((i - (k.length - 1) / 2) * 0.05, 0.01, 0);
      if (kind === 'dough' || kind === 'trout') f.obj.scale.setScalar(0.6);
      o.add(f.obj);
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
  set('meal_stew', plate(['meat', 'shroom']));
  set('meal_maple_beans', plate([]));
  set('meal_beans', plate([]));
  set('burnt_food', plate(['bacon']));
  set('bannock_mix', buildMixSack());
  const mug = buildProduct('enamel_mug');
  set('cowboy_coffee', mug);
}

/**
 * Install the cooking station: registers the cooked items, replaces the stove top's one-click cook with the
 * close-up station and starts its simulation. Call after the cabin is built and added (game.cabin set) and after
 * CabinPlay.attach().
 */
export function installCooking(g: Game): CookingStation | null {
  registerCookItems();
  if (!g.cabin?.anchors?.stove_top) return null;
  const st = new CookingStation(g);
  cookedModels(g);
  (g as unknown as { cooking?: CookingStation }).cooking = st;
  void STOVE;
  return st;
}
