// The game: owns the world, the loop and the rules. Modules built by other parts of the codebase plug in through
// the optional fields below (forest, ground cover, arms, creatures, places), so the core runs without them.
import * as THREE from 'three';
import { Renderer } from '../gfx/renderer';
import { Sky, type Weather } from '../gfx/sky';
import { G } from '../gfx/globals';
import { debris, puffs } from '../gfx/particles';
import { Terrain } from '../world/terrain';
import { makeLake } from '../world/water';
import { marks } from '../world/marks';
import { SPOTS, heightAt } from '../world/layout';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { Player } from '../player/player';
import { Hands, type ArmsLike } from '../player/hands';
import { input } from '../core/input';
import { ChopSystem, type ForestLike } from '../chop/chop';
import type { ChopTree } from '../chop/tree';
import { WoodPiece } from '../chop/wood';
import { Survival, Stove, outdoorTemp } from './survival';
import { ITEMS, type ToolStats } from './items';
import { initialContracts, type Contract } from './contracts';
import { registerInteractable } from './interact';
import { Journal } from '../ui/journal';
import { hud } from '../ui/hud';
import { audio } from '../audio/audio';
import type { Jeep } from '../vehicles/jeep';
import type { Place } from '../places/kit';
import { loadProp, PROP_META } from '../places/props';
import { paintPaper, paperMesh, type Block } from '../ui/paper';
import { WeatherFx } from '../gfx/weather';
import { fitTool } from '../player/arms';
import { Backpack } from '../ui/backpack';
import { makeSlashGatherable } from './cabinplay';
import { makePhysical } from './physprops';
import { writeSave, type SaveData } from './save';

export type Mode = 'loading' | 'menu' | 'drive' | 'walk' | 'cutscene' | 'sleep';

/** game event name -> sound bank id (+ variations picked by the engine) */
const SFX: Record<string, string> = {
  axe_chop: 'axe_chop', axe_chop_hard: 'axe_chop_hard', axe_glance: 'axe_glance', axe_whoosh: 'axe_whoosh', axe_stuck: 'axe_stuck',
  axe_rock: 'axe_glance', axe_dirt: 'foot_mud', wood_split: 'wood_split', tree_creak: 'tree_creak', tree_crack: 'branch_break_big',
  tree_fall: 'tree_fall_big', branch_snap: 'branch_snap', log_thud: 'log_thud', log_lift: 'log_drag', wood_pickup: 'log_roll',
  place_wood: 'wood_stack', drop: 'log_thud', saw_stroke: 'saw_hand', equip: 'branch_swish', pickup: 'bag_rustle',
  match: 'match_strike', ignite: 'fire_ignite', door_open: 'door_creak_open', door_close: 'door_creak_close', stove_open: 'stove_door_open', stove_close: 'stove_door_close',
};

export interface Inventory { items: Map<string, number>; money: number }

export class Game {
  readonly R: Renderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.06, 1400);
  readonly view = new THREE.Scene();
  readonly viewCam = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
  readonly sky: Sky;
  readonly terrain = new Terrain();
  readonly player: Player;
  hands!: Hands;
  readonly chop: ChopSystem;
  readonly survival = new Survival();
  readonly stove = new Stove();
  readonly journal = new Journal();
  readonly wfx = new WeatherFx();
  readonly pack = new Backpack((id) => this.toolModel(id));
  private packCursor = new THREE.Vector2();
  private packMouse: [number, number] = [0, 0];
  contracts: Contract[] = initialContracts();
  inv: Inventory = { items: new Map([['axe_old', 1], ['matches', 1], ['jerky', 3], ['beer', 2], ['flashlight', 1]]), money: 120 };
  mode: Mode = 'loading';
  hour = 17.6;
  day = 0;
  /** game seconds per real second */
  timeScale = 30;
  weather: Weather = { cloud: 0.35, rain: 0, fog: 0.12, storm: 0 };
  indoors = false;
  // plug-ins
  forest: (ForestLike & { update(dt: number): void; trunkColliders?(x: number, z: number, r: number): { id: number | string; x: number; z: number; r: number; h: number }[] }) | null = null;
  ground: { update(cam: THREE.Camera): void; solids?(x: number, z: number, r: number): { kind: string; shape: string; x: number; y: number; z: number; r: number; h: number; x2?: number; y2?: number; z2?: number }[] } | null = null;
  arms: ArmsLike | null = null;
  jeep: Jeep | null = null;
  trailer: import('../vehicles/trailer').Trailer | null = null;
  critters: { hound: { trust: number; state: string } | null } | null = null;
  updaters: ((dt: number) => void)[] = [];
  cabin: Place | null = null;
  store: Place | null = null;
  readonly flags = new Set<string>();
  private models = new Map<string, THREE.Object3D>();
  private reading: THREE.Object3D | null = null;
  flashlight: THREE.SpotLight;
  flashOn = false;
  private breathT = 0;
  private stepVoices = 0;
  private bodyT = 3;
  private engine: { idle: ReturnType<typeof audio.play>; drive: ReturnType<typeof audio.play>; gravel: ReturnType<typeof audio.play> } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.R = new Renderer(canvas);
    this.sky = new Sky(this.scene);
    this.terrain.loadDefault();
    this.scene.add(this.terrain.group, makeLake(), debris.mesh, puffs.mesh, this.wfx.group);
    puffs.setCamera(this.camera);
    this.scene.add(this.camera);
    this.player = new Player(this.camera);
    this.chop = new ChopSystem(null, {
      sound: (id, pos, vol, rate) => this.sound(id, pos, vol, rate),
      shake: (a, pos) => this.player.addShake(a * Math.max(0, 1 - pos.distanceTo(this.player.pos) / 40)),
      crushCheck: (a, b, r, speed) => this.crushCheck(a, b, r, speed),
      spawnPiece: (p) => this.chop.addPiece(p),
      felled: (t) => this.onFelled(t),
    });
    this.scene.add(this.chop.group);
    // viewmodel: lit by a soft key that follows the world light
    this.view.add(new THREE.HemisphereLight(0xbfc8d8, 0x3a3026, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(0.5, 1, 0.6); this.view.add(key);
    this.viewKey = key;
    this.view.add(this.journal.object, this.pack.object);
    // flashlight (world)
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 45, 0.38, 0.6, 1.5);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0005;
    this.camera.add(this.flashlight, this.flashlight.target);
    this.flashlight.position.set(0.18, -0.12, 0);
    this.flashlight.target.position.set(0.05, -0.05, -10);
    // a faint visible beam, so the light cuts through fog and dust
    const beamGeo = new THREE.ConeGeometry(2.4, 14, 20, 1, true);
    beamGeo.translate(0, -7, 0); beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 0 } },
      vertexShader: 'varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ = -position.z / 14.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uI; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(vN, vV)), 2.0); gl_FragColor = vec4(vec3(1.0,0.95,0.82) * uI * rim * (1.0 - vZ) * (1.0 - vZ) * 0.05, 1.0); }',
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.set(0.18, -0.14, -0.2);
    this.beam.frustumCulled = false;
    this.camera.add(this.beam);
    this.journal.contracts = this.contracts;
  }
  private viewKey: THREE.DirectionalLight;
  private beam: THREE.Mesh;

  async init(): Promise<void> {
    await physics.init();
    this.player.init(SPOTS.cabin.x - 8, SPOTS.cabin.z - 6, 0);
    this.hands = new Hands({
      scene: this.scene, camera: this.camera, view: this.view, viewCam: this.viewCam, player: this.player,
      arms: this.arms, stamina: () => this.survival.stamina, spendStamina: (a) => this.survival.spend(a),
      sound: (id, pos, vol, rate) => this.sound(id, pos, vol, rate),
      swing: (tool, charge, o, d, s) => this.swing(tool, charge, o, d, s),
      toolModel: (id) => this.toolModel(id),
      useItem: (id, t) => this.useItem(id, t),
      hint: (t) => hud.say(`<i>${t}</i>`, 2.5),
      owns: (id) => (this.inv.items.get(id) ?? 0) > 0,
      game: this,
    });
    this.player.onStep = (surf, str, pos) => {
      const id = { forest: 'foot_forest', grass: 'foot_grass', gravel: 'foot_gravel', mud: 'foot_mud', wood: 'foot_wood', snow: 'foot_snow', water: 'foot_mud' }[surf];
      this.sound(id, pos, 0.35 + str * 0.45);
      if (surf === 'forest' || surf === 'grass') if (Math.random() < 0.25) this.sound('foliage_rustle', pos, 0.25);
      this.stepVoices++;
    };
    this.player.onLand = (v) => this.sound(this.player.indoor ? 'foot_land_wood' : 'foot_land', this.player.pos, 0.5 + v * 0.5);
    this.survival.onGrowl = () => hud.say('<i>Stomach\'s growling.</i>', 2.5);
    this.survival.onBlackout = () => this.blackout();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
  }

  setArms(a: ArmsLike): void {
    this.arms = a;
    if (this.hands) (this.hands as any).g.arms = a;
    a.onEvent((e) => { if (e === 'impact') (this.hands as any).impact(); });
    this.view.add(a.object);
  }

  setForest(f: NonNullable<Game['forest']>): void { this.forest = f; this.chop.setForest(f); }

  onResize(): void {
    this.R.resize();
    const [w, h] = this.R.internalSize;
    this.camera.aspect = this.viewCam.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.viewCam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ actions
  sound(id: string, pos?: THREE.Vector3, vol = 1, rate?: number): void {
    const bank = SFX[id] ?? id;
    if (id === 'tree_fall' && vol < 0.75) audio.play('tree_fall_small', { pos, vol, rate });
    else audio.play(bank, { pos, vol, rate });
  }

  toolModel(id: string): THREE.Object3D | null {
    const m = this.models.get(id);
    if (!m) return null;
    const c = m.clone();
    // tools and lights are re-framed so the grip sits in the palm (handle +Y, edge +Z)
    return ITEMS[id]?.tool || id === 'flashlight' ? fitTool(c) : id === 'beer' ? fitTool(c, 0.3) : c;
  }

  /** load the models of every item that maps to a Poly Haven prop (tools, lights, pots) */
  async preloadItemModels(): Promise<void> {
    await Promise.all(Object.values(ITEMS).map(async (d) => {
      if (d.model.startsWith('gen:') || !(d.model in PROP_META)) return;
      try { const m = await loadProp(d.model as never); this.models.set(d.id, m); } catch { /* missing prop */ }
    }));
  }

  /** register a model for an item id (generated products) */
  setItemModel(id: string, m: THREE.Object3D): void { this.models.set(id, m); }

  save(): SaveData {
    const d: SaveData = {
      v: 1, day: this.day, hour: this.hour, money: this.inv.money, items: [...this.inv.items.entries()],
      contracts: this.contracts.map((c) => ({ id: c.id, state: c.state, progress: c.progress })),
      journal: this.journal.dump(), houndTrust: this.critters?.hound ? (this.critters.hound.state === 'companion' ? 99 : this.critters.hound.trust) : 0, stove: { fuel: this.stove.fuel, roomTemp: this.stove.roomTemp },
      stacked: 0, sharp: Object.values(ITEMS).filter((i) => i.tool).map((i) => [i.id, i.tool!.sharp]), flags: [...this.flags],
    };
    writeSave(d);
    return d;
  }

  load(d: SaveData): void {
    this.day = d.day; this.hour = d.hour; this.inv.money = d.money; this.inv.items = new Map(d.items);
    for (const c of d.contracts) { const k = this.contracts.find((x) => x.id === c.id); if (k) { k.state = c.state as Contract['state']; k.progress = c.progress; } }
    this.journal.restore(d.journal);
    this.stove.fuel = d.stove.fuel; this.stove.roomTemp = d.stove.roomTemp;
    for (const [id, s] of d.sharp) if (ITEMS[id]?.tool) ITEMS[id].tool!.sharp = s;
    for (const f of d.flags) this.flags.add(f);
    this.savedHoundTrust = d.houndTrust;
    this.survival.day = this.day;
  }

  /** add a building: its group, static colliders, interior volumes and per-frame update */
  addPlace(place: Place): void {
    this.scene.add(place.group);
    for (const c of place.colliders) {
      if (c.kind === 'box') {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY);
        const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.pos[0], c.pos[1], c.pos[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
        physics.world.createCollider(RAPIER.ColliderDesc.cuboid(c.half[0], c.half[1], c.half[2]).setCollisionGroups(groups(GROUP.STATIC, 0xffff)).setFriction(0.8), body);
      } else {
        const cd = RAPIER.ColliderDesc.convexHull(new Float32Array(c.points));
        if (cd) physics.world.createCollider(cd.setCollisionGroups(groups(GROUP.STATIC, 0xffff)), physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
      }
    }
    this.interiors.push(...place.interior);
    this.updaters.push((dt) => place.update(dt));
  }
  readonly interiors: THREE.Box3[] = [];
  savedHoundTrust = 0;

  /** each day rolls its own weather (late September: mostly cool and grey, fog in the mornings, the odd storm) */
  private targetWeather: Weather = { cloud: 0.35, rain: 0, fog: 0.12, storm: 0 };
  newDay(): void {
    const r = Math.abs(Math.sin(this.day * 91.7 + 3.3)) % 1;
    this.targetWeather = r < 0.35 ? { cloud: 0.2, rain: 0, fog: 0.15, storm: 0 }
      : r < 0.6 ? { cloud: 0.7, rain: 0, fog: 0.3, storm: 0 }
        : r < 0.75 ? { cloud: 0.5, rain: 0, fog: 0.9, storm: 0 }
          : r < 0.92 ? { cloud: 0.9, rain: 0.7, fog: 0.4, storm: 0 }
            : { cloud: 1, rain: 1, fog: 0.3, storm: 1 };
    for (const c of this.contracts) if (c.state === 'taken' && c.due !== undefined && this.day > c.due) { c.state = 'failed'; hud.say(`<i>${c.title}: too late. Somebody else did it.</i>`, 4); }
    this.journal.rebuild();
  }
  /** set by CabinPlay / StorePlay: the places' interactables call this */
  placeAction: (name: string, ctx: import('./interact').InteractCtx) => void = () => {};

  removeSlash(h: THREE.Object3D): void {
    const d = h.userData.slash as { body: RAPIER.RigidBody } | undefined;
    if (d?.body) physics.removeBody(d.body);
    h.userData.slash = undefined;
  }
  private slashSeen = new WeakSet<THREE.Object3D>();

  /** put one of a held item down in the world as a physical object (offerings, bait, leaving the jerky out) */
  setDown(id: string, at: THREE.Vector3): void {
    const m = this.toolModel(id);
    if (!m || !this.take(id)) return;
    m.position.copy(at).add(new THREE.Vector3(0, 0.06, 0));
    this.scene.add(m);
    makePhysical(m, { mass: ITEMS[id]?.mass ?? 0.3, itemId: id, asleep: false });
    if (!this.owns(id)) this.hands.equip(null);
    this.sound('place_wood', at, 0.3, 1.6);
  }

  /** a carried object goes into the backpack (bought goods become owned only at the register) */
  pocket(id: string, obj: THREE.Object3D): void {
    if (obj.userData.unpaid) { this.events.emit('shoplift', { id, obj }); return; }
    this.give(id);
    this.sound('foliage_rustle', undefined, 0.4, 1.3);
    hud.say(`<i>${ITEMS[id]?.name ?? id} in the pack.</i>`, 1.8);
  }

  owns(id: string): boolean { return (this.inv.items.get(id) ?? 0) > 0; }

  /** hold a sheet of paper up in both hands to read it; any click or E puts it down */
  readPaper(blocks: Block[], seed = 1): void {
    if (this.reading) return;
    const m = paperMesh(paintPaper(blocks, { style: 'notebook', seed }), 0.2);
    m.position.set(0, -0.03, -0.3);
    m.rotation.set(-0.12, 0, 0.03);
    this.view.add(m);
    this.reading = m;
    this.sound('paper_rustle', undefined, 0.7);
  }

  /** Ray's axe, buried in the chopping block, waiting to be pulled out */
  axeInBlock(top: THREE.Vector3): THREE.Object3D | null {
    const m = this.models.get('axe_old')?.clone();
    if (!m) { this.give('axe_old'); return null; }
    const g = new THREE.Group();
    g.add(m);
    g.position.copy(top).add(new THREE.Vector3(0, 0.02, 0));
    g.rotation.set(0, 0.6, -1.1);
    this.scene.add(g);
    registerInteractable(g, {
      kind: 'pickup', label: () => 'Pull the axe out',
      use: () => {
        this.give('axe_old');
        this.sound('axe_pull', top, 0.9);
        debris.emit('chip', top, new THREE.Vector3(0, 1, 0), 3);
        g.removeFromParent();
        this.hands.equip('axe_old');
      },
    });
    return g;
  }

  /** tie orange flagging tape on a small spruce behind the woodshed (the tree Ray picked) */
  flagIntroTree(): void {
    const f = this.forest as any;
    if (!f?.near) return;
    const c = new THREE.Vector3(SPOTS.woodyard.x + 10, 0, SPOTS.woodyard.z + 8);
    const refs = (f.near(c.x, c.z, 30) as any[]).filter((r) => { const m = r.model(); return m.dbh > 0.13 && m.dbh < 0.26; });
    refs.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
    const r = refs[0];
    if (!r) return;
    const m = r.model();
    const rad = m.radiusAt(1.4);
    const tape = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.6, emissive: 0x3a0a00, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.005, 0.012, 4, 24), mat);
    ring.rotation.x = Math.PI / 2; ring.scale.set(1, 1, 1.8);
    tape.add(ring);
    for (let k = 0; k < 2; k++) {
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.42, 1, 6), mat);
      tail.geometry.translate(0, -0.21, 0);
      tail.position.set(rad, 0, k * 0.03);
      tail.userData.tail = k;
      tape.add(tail);
    }
    tape.position.set(r.x + m.centerAt(1.4)[0], r.y + 1.4, r.z + m.centerAt(1.4)[1]);
    this.scene.add(tape);
    this.updaters.push(() => {
      const t = G.uTime.value;
      tape.children.forEach((ch) => { if (ch.userData.tail !== undefined) ch.rotation.set(0.3 + Math.sin(t * 3 + ch.userData.tail) * 0.25, Math.sin(t * 2.3) * 0.4, 0.2); });
      if (this.chop.trees.get(String(r.id))?.state === 'falling') tape.visible = false;
    });
    this.introTree = r;
  }
  introTree: unknown = null;

  enterVehicle(): void {
    if (!this.jeep) return;
    if (!this.jeep.running) { this.jeep.running = true; this.sound('veh_door_open', this.jeep.root.position, 0.7); audio.play('veh_start', { pos: this.jeep.root.position, vol: 0.9, delay: 0.6 }); }
    this.mode = 'drive';
    this.player.yaw = 0; this.player.pitch = -0.08;
    this.jeep.occupied = true;
    this.player.enabled = false;
    if (this.arms) this.arms.object.visible = false;
    this.hands.equip(null);
  }

  exitVehicle(): void {
    if (!this.jeep) return;
    const j = this.jeep;
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(j.root.quaternion).multiplyScalar(1.5); // driver's side (+x is the left of the truck)
    const p = j.root.position.clone().add(side);
    this.player.teleport(p.x, null, p.z, this.player.yaw);
    this.player.enabled = true;
    j.occupied = false;
    this.mode = 'walk';
    if (this.arms) this.arms.object.visible = true;
    this.sound('veh_door_close', p, 0.8);
  }

  lastSwingAt = -1e9;

  swing(tool: ToolStats, charge: number, origin: THREE.Vector3, dir: THREE.Vector3, swingDir: THREE.Vector3): void {
    this.lastSwingAt = performance.now();
    const reach = 1.25 + tool.reach;
    const r = this.chop.swing(origin, dir, reach, swingDir, tool, charge, this.survival.stamina);
    const held = this.hands.heldItem;
    const def = ITEMS[held];
    if (def?.tool && r.kind !== 'none') def.tool.sharp = Math.max(0.2, def.tool.sharp - (r.kind === 'ground' ? (r.rock ? 0.03 : 0.008) : 0.0012));
    switch (r.kind) {
      case 'none': this.arms?.play('miss'); break;
      case 'standing':
        this.player.addShake(0.12 + charge * 0.15);
        if (r.felled) { hud.say('<i>Timber!</i>', 2); }
        else if (r.bruised && r.tree.notches.length && r.tree.notches[0].hits === 4) hud.say('<i>Just bruising it. High, then low.</i>', 3);
        break;
      case 'refused':
        this.player.addShake(0.3);
        hud.say(r.reason === 'too_big' ? '<i>This one would take a week with an axe.</i>' : '<i>Blue paint on the bark. Somebody wants this one left standing.</i>', 3);
        this.arms?.play('chop_recover');
        break;
      case 'ground': this.player.addShake(0.35); this.arms?.play('chop_recover'); break;
      case 'kindling': this.give('kindling', 3); hud.say('<i>Kindling.</i>', 1.2); break;
      case 'split': this.player.addShake(r.done ? 0.2 : 0.3); if (r.stuck) this.arms?.play('chop_recover'); break;
      default: this.player.addShake(0.15);
    }
  }

  private crushCheck(a: THREE.Vector3, b: THREE.Vector3, r: number, speed: number): void {
    if (speed < 2.5) return;
    const p = this.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
    const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    const d = a.clone().addScaledVector(ab, t).distanceTo(p);
    if (d < r + 0.6 && t > 0.15) {
      this.R.fx.damage = 1;
      this.player.addShake(1.5);
      this.survival.stamina = 0;
      this.survival.warmth = Math.max(0, this.survival.warmth - 0.2);
      hud.say('<i>Branches whip across your face. That was too close.</i>', 3);
    }
  }

  private onFelled(t: ChopTree): void {
    this.forest?.remove(t.ref.id);
    this.felledCount = (this.felledCount ?? 0) + 1;
    this.events.emit('felled', t);
  }
  felledCount = 0;

  readonly events = new (class {
    private m = new Map<string, ((d: unknown) => void)[]>();
    on(e: string, f: (d: any) => void): void { (this.m.get(e) ?? this.m.set(e, []).get(e)!).push(f); }
    emit(e: string, d?: unknown): void { for (const f of this.m.get(e) ?? []) f(d); }
  })();

  useItem(id: string, t: { obj: THREE.Object3D | null; point: THREE.Vector3 | null }): boolean {
    const def = ITEMS[id];
    if (!def) return false;
    if (id === 'flashlight') { this.flashOn = !this.flashOn; this.sound('flashlight_click', undefined, 0.6); return true; }
    if (id === 'cookies' && t.obj) {
      const offer = { item: 'cookies', obj: t.obj, taken: false };
      this.events.emit('offer', offer);
      if (offer.taken) { this.take('cookies'); this.arms?.play('offer'); if (!this.owns('cookies')) this.hands.equip(null); return true; }
    }
    if (id === 'jerky' && t.obj) {
      const offer = { item: 'jerky', obj: t.obj, taken: false };
      this.events.emit('offer', offer);
      if (offer.taken) { this.take('jerky'); this.arms?.play('offer'); return true; }
    }
    if (def.food) {
      this.take(id);
      this.survival.eat(def.food.kcal, def.food.warmth ?? 0);
      this.arms?.play(def.food.drink ? 'drink' : 'offer');
      this.sound(def.food.drink ? (id === 'beer' ? 'drink_gulp' : 'drink_gulp') : (id === 'jerky' ? 'eat_chew' : 'eat_crunch'), undefined, 0.7);
      hud.say(def.food.drink ? `<i>${def.name}. Good.</i>` : `<i>${def.name}.</i>`, 2);
      if ((this.inv.items.get(id) ?? 0) <= 0) this.hands.equip(null);
      return true;
    }
    return false;
  }

  give(id: string, n = 1): void { this.inv.items.set(id, (this.inv.items.get(id) ?? 0) + n); }
  take(id: string, n = 1): boolean {
    const c = this.inv.items.get(id) ?? 0;
    if (c < n) return false;
    this.inv.items.set(id, c - n);
    return true;
  }

  blackout(): void {
    hud.fadeTo(true, 3);
    this.mode = 'cutscene';
    setTimeout(() => {
      this.hour = 7.5; this.day++;
      this.player.teleport(SPOTS.cabin.x + 1, null, SPOTS.cabin.z + 1);
      this.survival.warmth = 0.6;
      this.mode = 'walk';
      hud.fadeTo(false, 3);
      hud.say('<i>You wake up on the porch wrapped in a smelly fur blanket that isn\'t yours.</i>', 5);
    }, 4000);
  }

  // ------------------------------------------------------------------ the loop
  update(dt: number): void {
    dt = Math.max(0, Math.min(0.1, dt));
    G.uTime.value += dt;
    const dtGame = dt * this.timeScale;
    if (this.mode !== 'menu' && this.mode !== 'loading') {
      this.hour += dtGame / 3600;
      if (this.hour >= 24) { this.hour -= 24; this.day++; this.survival.day = this.day; this.newDay(); }
    }
    const cam = this.camera;
    // control
    if (this.mode === 'walk') {
      if (this.pack.open) { this.packMouse = [input.mouseDX, input.mouseDY]; input.mouseDX = 0; input.mouseDY = 0; }
      this.player.update(dt);
      if (this.pack.open) { input.mouseDX = this.packMouse[0]; input.mouseDY = this.packMouse[1]; }
      if (input.pressed('Tab') && !this.pack.open) { this.journal.toggle(); this.sound('page_turn', undefined, 0.6); }
      if (input.pressed('KeyI') && !this.journal.open && !this.hands.busy) {
        this.pack.toggle(this.inv.items); this.packCursor.set(0, -0.2);
        this.sound(this.pack.open ? 'zip' : 'bag_rustle', undefined, 0.6);
      }
      if (this.pack.open) {
        this.packCursor.x = THREE.MathUtils.clamp(this.packCursor.x + input.mouseDX * 0.0025, -0.9, 0.9);
        this.packCursor.y = THREE.MathUtils.clamp(this.packCursor.y - input.mouseDY * 0.0035, -0.9, 0.9);
        const id = this.pack.pick(this.packCursor, this.viewCam);
        this.pack.hover = id;
        hud.dotAt(this.packCursor.x, this.packCursor.y);
        hud.setLabel(id ? (ITEMS[id]?.name ?? id) : '');
        if (input.pressed('Mouse0') && id) { this.pack.open = false; this.hands.equip(id); hud.dotAt(0, 0); }
        if (input.pressed('Escape') || input.pressed('KeyQ')) { this.pack.open = false; hud.dotAt(0, 0); }
      }
      if (this.journal.open) {
        if (input.pressed('KeyA') || input.pressed('ArrowLeft')) this.journal.turn(-1);
        if (input.pressed('KeyD') || input.pressed('ArrowRight')) this.journal.turn(1);
        if (input.pressed('KeyA') || input.pressed('KeyD') || input.pressed('ArrowLeft') || input.pressed('ArrowRight')) this.sound('page_turn', undefined, 0.4);
      } else if (!this.reading && !this.pack.open) this.hands.update(dt);
      if (input.pressed('KeyF') && (this.inv.items.get('flashlight') ?? 0) > 0) { this.flashOn = !this.flashOn; this.sound('flashlight_click', undefined, 0.6); }
    }
    if (this.mode === 'drive' && this.jeep) {
      const j = this.jeep;
      if (input.locked) { this.player.yaw -= input.mouseDX * input.sensitivity; this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - input.mouseDY * input.sensitivity, -1.0, 0.8); }
      this.player.yaw = THREE.MathUtils.clamp(this.player.yaw, -1.9, 1.9);
      const eye = j.eye();
      cam.position.copy(eye);
      const bump = j.bump();
      cam.quaternion.copy(j.root.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.player.pitch + bump * 0.01, Math.PI + this.player.yaw, 0, 'YXZ')));
      this.player.pos.set(eye.x, eye.y - 1.2, eye.z);
      if (input.pressed('KeyE') && Math.abs(j.speed) < 1.5) this.exitVehicle();
      if (input.pressed('KeyH')) j.headlights = !j.headlights;
    }
    if (this.reading && (input.pressed('Mouse0') || input.pressed('KeyE') || input.pressed('Escape') || input.pressed('Tab'))) {
      this.reading.removeFromParent(); this.reading = null; this.sound('paper_rustle', undefined, 0.5, 1.1);
      input.endFrame();
    }
    physics.streamTerrain([{ x: this.player.pos.x, z: this.player.pos.z }, ...(this.jeep?.body ? [{ x: this.jeep.root.position.x, z: this.jeep.root.position.z }] : [])]);
    this.syncTreeColliders();
    this.syncSolids();
    physics.update(dt, (h) => {
      if (this.jeep?.body && this.mode === 'drive') this.jeep.update(h, this.driveInput());
      else if (this.jeep?.body) this.jeep.update(h, { throttle: 0, brake: 0.2, steer: 0, handbrake: true });
      this.trailer?.update(h);
    });
    this.chop.update(dt, cam.position);
    for (const t of this.chop.trees.values()) for (const h of t.slash) if (!this.slashSeen.has(h)) { this.slashSeen.add(h); makeSlashGatherable(this, h); }
    debris.update(dt); puffs.update(dt);
    for (const u of this.updaters) u(dt);
    G.uCamPos.value.copy(cam.position);
    this.terrain.update(cam.position, 2);
    this.forest?.update(dt);
    this.ground?.update(cam);
    marks.follow(this.player.pos.x, this.player.pos.z); marks.flush();

    // indoors?
    const head = this.mode === 'drive' ? null : this.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
    const wasIn = this.indoors;
    this.indoors = !!head && this.interiors.some((b) => b.containsPoint(head));
    this.player.indoor = this.indoors;
    if (this.indoors !== wasIn) {
      const inStore = this.store?.interior.some((b) => head && b.containsPoint(head));
      audio.setReverb(this.indoors ? (inStore ? 'store' : 'cabin') : 'outdoor');
      audio.setIndoors(this.indoors ? 1 : 0);
    }
    if (this.cabin?.setThermometer) this.cabin.setThermometer(this.indoors ? this.stove.roomTemp : outdoorTemp(this.hour, this.day, this.weather.rain));
    this.cabin?.stove?.setFire(this.stove.lit ? Math.max(0.15, this.stove.level) : 0);
    // survival
    const out = outdoorTemp(this.hour, this.day, this.weather.rain);
    this.stove.update(dtGame, out);
    this.survival.update(dtGame, dt, {
      hour: this.hour, rain: this.weather.rain, wind: G.uWindStrength.value, indoors: this.indoors, fireHeat: this.fireHeatAt(this.player.pos),
      roomTemp: this.stove.roomTemp, vehicle: this.mode === 'drive',
    }, this.mode === 'walk' ? Math.min(1, this.player.speed / 4) : 0);
    this.player.canSprint = this.survival.stamina > 0.12;
    this.R.fx.cold = Math.max(0, Math.min(1, (0.45 - this.survival.warmth) * 2.2));
    this.R.fx.damage = Math.max(0, this.R.fx.damage - dt * 0.6);
    // breath condensation in the cold
    this.breathT -= dt;
    if (this.breathT <= 0 && this.survival.breath > 0.05 && this.mode !== 'menu') {
      this.breathT = (this.survival.winded > 0.3 ? 1.6 : 3.4) * (0.8 + Math.random() * 0.4);
      const f = new THREE.Vector3(0, -0.12, -0.35).applyQuaternion(cam.quaternion).add(cam.position);
      puffs.emit(f, new THREE.Vector3(0, -0.05, -0.5).applyQuaternion(cam.quaternion), { size: 0.12, grow: 3, life: 1.6, color: new THREE.Color(0.9, 0.92, 0.95), alpha: 0.28 * this.survival.breath, rise: 0.15, n: 3, spread: 0.08 });
    }
    // sky and light
    G.uWindStrength.value = 0.3 + 0.25 * Math.sin(G.uTime.value * 0.05) + this.weather.storm * 0.6;
    G.uGust.value += dt * (0.5 + G.uWindStrength.value);
    this.sky.update(this.hour, this.player.pos, this.weather, this.R.grade, G.uTime.value);
    this.R.sunDir.copy(this.sky.sunDir); this.R.sunColor.copy(this.sky.sun.color); this.R.fogColor.copy(this.sky.fogColor);
    this.viewKey.color.copy(this.sky.sun.color);
    this.viewKey.intensity = this.indoors ? 0.25 : this.sky.sun.intensity * 0.45;
    this.flashlight.intensity = this.flashOn ? 60 : 0;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uI.value = this.flashOn ? 1 + this.weather.fog * 2 + this.sky.darkness : 0;
    this.beam.visible = this.flashOn;
    // weather drifts toward the day's target
    if (this.mode !== 'menu') for (const k of ['cloud', 'rain', 'fog', 'storm'] as const) this.weather[k] += (this.targetWeather[k] - this.weather[k]) * Math.min(1, dtGame * 0.0004);
    if (this.weather.storm > 0.5 && Math.random() < dt * 0.03 * this.weather.storm) { this.R.fx.flash = 0.9; setTimeout(() => this.sound('weather_thunder', undefined, 0.9), 600 + Math.random() * 2500); }
    this.R.fx.flash = Math.max(0, this.R.fx.flash - dt * 4);
    // weather particles and wet ground
    G.uWet.value += ((this.weather.rain > 0.1 ? 1 : 0) - G.uWet.value) * Math.min(1, dtGame * (this.weather.rain > 0.1 ? 0.0006 : 0.00012));
    const amb = this.sky.hemi.color.clone().multiplyScalar(this.sky.hemi.intensity * 1.4).add(this.sky.sun.color.clone().multiplyScalar(this.sky.sun.intensity * 0.12));
    const dusk = THREE.MathUtils.smoothstep(this.sky.darkness, 0.35, 0.75);
    this.wfx.update(cam.position, this.indoors ? 0 : this.weather.rain, this.indoors ? 0 : this.weather.storm * 0, this.indoors ? 0.15 : 0.35 + 0.4 * (1 - this.weather.rain),
      this.indoors ? 0 : 0.08 + G.uWindStrength.value * 0.45, amb, dusk);
    // viewmodel
    this.arms?.update(dt, {
      speed: this.player.speed, sprint: this.player.sprinting, crouch: this.player.crouch, breath: this.survival.winded,
      shiver: this.survival.shiver, aimPitch: this.player.pitch, swingCharge: this.hands?.charge ?? 0,
    });
    this.journal.update(dt);
    this.pack.update(dt);
    // empty hands rest out of sight unless they're doing something (grabbing, pushing, offering)
    if (this.arms && this.mode !== 'drive') {
      const a = this.arms as unknown as { held: string; action: string | null; object: THREE.Object3D };
      a.object.visible = !(a.held === 'none' && !a.action) || this.mode === 'menu';
    }
    // audio
    audio.setListener(cam);
    // the old 4x4's engine: idle and drive loops crossfaded by RPM, gravel under the tyres by speed
    const j = this.jeep;
    if (j?.body && j.running) {
      const at = j.root.position;
      if (!this.engine) this.engine = { idle: audio.play('veh_idle', { pos: at, loop: true, vol: 0 }), drive: audio.play('veh_drive', { pos: at, loop: true, vol: 0 }), gravel: audio.play('veh_gravel', { pos: at, loop: true, vol: 0 }) };
      const r = (j.rpm - 750) / 3800;
      this.engine.idle?.setPos(at); this.engine.drive?.setPos(at); this.engine.gravel?.setPos(at);
      this.engine.idle?.setVol(0.8 * (1 - Math.min(1, r * 2.5))); this.engine.idle?.setRate(0.9 + r * 0.6);
      this.engine.drive?.setVol(Math.min(1, 0.15 + r * 1.6)); this.engine.drive?.setRate(0.7 + r * 0.9);
      this.engine.gravel?.setVol(Math.min(0.9, Math.abs(j.speed) / 12)); this.engine.gravel?.setRate(0.8 + Math.min(0.5, Math.abs(j.speed) / 30));
      if (j.bump() > 0.9 && Math.random() < 0.2) audio.play('veh_suspension', { pos: at, vol: 0.5 });
    } else if (this.engine) { this.engine.idle?.stop(0.4); this.engine.drive?.stop(0.4); this.engine.gravel?.stop(0.3); this.engine = null; }
    audio.setHour(this.hour);
    audio.setWeather({ rain: this.weather.rain, wind: G.uWindStrength.value, storm: this.weather.storm });
    audio.setDread(Math.max(0, this.sky.darkness - 0.4) * (this.indoors ? 0.2 : 1));
    // the body: breathing after effort, chattering teeth in the cold, the floor answering your boots
    this.bodyT -= dt;
    if (this.bodyT <= 0 && this.mode === 'walk') {
      this.bodyT = 2.5 + Math.random() * 2;
      if (this.survival.winded > 0.55) this.sound('breath_heavy', undefined, 0.35 * this.survival.winded);
      else if (this.survival.shiver > 0.45 && Math.random() < 0.5) this.sound('teeth_chatter', undefined, 0.3 * this.survival.shiver);
      else if (this.survival.breath > 0.4 && Math.random() < 0.3) this.sound('breath_cold', undefined, 0.2);
    }
    if (this.indoors && this.stepVoices > 0 && Math.random() < 0.08) this.sound('floor_creak', this.player.pos, 0.35);
    this.stepVoices = 0;
    const night = this.sky.darkness;
    audio.ambience('forest_day', this.indoors ? 0 : Math.max(0, 1 - night * 1.6));
    audio.ambience('forest_dusk', this.indoors ? 0 : Math.max(0, 1 - Math.abs(night - 0.55) * 3));
    audio.ambience('forest_night', this.indoors ? 0 : Math.max(0, night * 1.4 - 0.4));
    audio.ambience('wind', 0.2 + G.uWindStrength.value * 0.6);
    audio.ambience('cabin', this.indoors ? 1 : 0);
    // hud
    if (this.mode === 'walk' && !this.journal.open && !this.pack.open && !this.reading) {
      hud.setLabel(this.hands.label);
      hud.setCharge(this.hands.charging ? this.hands.charge : 0);
      hud.showDot(true);
    } else if (this.pack.open) { hud.showDot(true); hud.setCharge(0); }
    else { hud.setLabel(''); hud.showDot(false); hud.setCharge(0); }
    hud.update(dt);
  }

  driveInput(): { throttle: number; brake: number; steer: number; handbrake: boolean } {
    return { throttle: input.held('KeyW') ? 1 : 0, brake: input.held('KeyS') ? 1 : 0, steer: input.axis('KeyD', 'KeyA'), handbrake: input.held('Space') };
  }

  /** extra air temperature from fires near a point */
  fireHeatAt(p: THREE.Vector3): number {
    let h = 0;
    for (const f of this.fires) {
      const d = p.distanceTo(f.pos);
      h += f.level() * 14 / (1 + d * d * 0.15);
    }
    return h;
  }
  readonly fires: { pos: THREE.Vector3; level: () => number }[] = [];

  /** static trunk colliders for the standing trees around the player */
  private treeCols = new Map<string, RAPIER.RigidBody>();
  private syncTreeColliders(): void {
    if (!this.forest?.trunkColliders) return;
    const p = this.player.pos;
    const keep = new Set<string>();
    for (const t of this.forest.trunkColliders(p.x, p.z, 40)) {
      const k = String(t.id);
      keep.add(k);
      if (this.treeCols.has(k)) continue;
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(t.x, heightAt(t.x, t.z) + t.h / 2, t.z));
      const col = physics.world.createCollider(RAPIER.ColliderDesc.cylinder(t.h / 2, t.r).setCollisionGroups(groups(GROUP.STATIC, 0xffff)).setFriction(0.8), body);
      physics.owner.set(col.handle, 'tree');
      this.treeCols.set(k, body);
    }
    for (const [k, b] of this.treeCols) {
      const st = this.chop.trees.get(k)?.state;
      if (!keep.has(k) || st === 'falling' || st === 'fallen' || st === 'gone') { physics.world.removeRigidBody(b); this.treeCols.delete(k); }
    }
  }

  /** rocks, fallen logs and stumps from the ground cover become static colliders near the player */
  private solidCols = new Map<string, RAPIER.RigidBody>();
  private solidT = 0;
  private syncSolids(): void {
    if (!this.ground?.solids || (this.solidT -= 1) > 0) return;
    this.solidT = 20;
    const p = this.player.pos, keep = new Set<string>();
    for (const s of this.ground.solids(p.x, p.z, 36)) {
      const k = `${s.kind}:${s.x.toFixed(1)},${s.z.toFixed(1)}`;
      keep.add(k);
      if (this.solidCols.has(k)) continue;
      let cd: RAPIER.ColliderDesc;
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, s.y, s.z));
      if (s.shape === 'sphere') cd = RAPIER.ColliderDesc.ball(s.r);
      else if (s.shape === 'capsule' && s.x2 !== undefined) {
        const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(s.x2 - s.x, (s.y2 ?? s.y) - s.y, (s.z2 ?? s.z) - s.z);
        const len = b.length(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().normalize());
        const mid = a.add(b).multiplyScalar(0.5);
        cd = RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2), s.r).setTranslation(mid.x, mid.y, mid.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      } else cd = RAPIER.ColliderDesc.cylinder(Math.max(0.05, s.h / 2), s.r).setTranslation(0, s.h / 2, 0);
      physics.world.createCollider(cd.setCollisionGroups(groups(GROUP.STATIC, 0xffff)).setFriction(0.9), body);
      this.solidCols.set(k, body);
    }
    for (const [k, b] of this.solidCols) if (!keep.has(k)) { physics.world.removeRigidBody(b); this.solidCols.delete(k); }
  }

  render(): void {
    this.R.render(this.scene, this.camera, this.view, this.viewCam);
  }

  /** a piece was put somewhere special: woodbox, stove, campsite box, log deck */
  piecePlaced(p: WoodPiece, where: string): void { this.events.emit('piece', { p, where }); }
}

