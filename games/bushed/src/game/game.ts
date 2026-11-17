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
import { Journal } from '../ui/journal';
import { hud } from '../ui/hud';
import { audio } from '../audio/audio';
import type { Jeep } from '../vehicles/jeep';

export type Mode = 'loading' | 'menu' | 'drive' | 'walk' | 'cutscene' | 'sleep';

/** game event name -> sound bank id (+ variations picked by the engine) */
const SFX: Record<string, string> = {
  axe_chop: 'axe_chop', axe_chop_hard: 'axe_chop_hard', axe_glance: 'axe_glance', axe_whoosh: 'axe_whoosh', axe_stuck: 'axe_stuck',
  axe_rock: 'axe_glance', axe_dirt: 'foot_mud', wood_split: 'wood_split', tree_creak: 'tree_creak', tree_crack: 'branch_break_big',
  tree_fall: 'tree_fall_big', branch_snap: 'branch_snap', log_thud: 'log_thud', log_lift: 'log_drag', wood_pickup: 'log_roll',
  place_wood: 'wood_stack', drop: 'log_thud', saw_stroke: 'saw_hand', equip: 'branch_swish', pickup: 'foliage_rustle',
  match: 'match_strike', ignite: 'fire_ignite', stove_open: 'stove_door_open', stove_close: 'stove_door_close',
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
  contracts: Contract[] = initialContracts();
  inv: Inventory = { items: new Map([['axe_old', 1], ['matches', 1], ['jerky', 3], ['beer', 2], ['flashlight', 1]]), money: 120 };
  mode: Mode = 'loading';
  hour = 17.6;
  day = 0;
  /** game seconds per real second */
  timeScale = 30;
  weather: Weather = { cloud: 0.35, rain: 0, fog: 0.35, storm: 0 };
  indoors = false;
  // plug-ins
  forest: (ForestLike & { update(dt: number): void; trunkColliders?(x: number, z: number, r: number): { id: number | string; x: number; z: number; r: number; h: number }[] }) | null = null;
  ground: { update(cam: THREE.Camera | THREE.Vector3): void } | null = null;
  arms: ArmsLike | null = null;
  jeep: Jeep | null = null;
  updaters: ((dt: number) => void)[] = [];
  flashlight: THREE.SpotLight;
  flashOn = false;
  private breathT = 0;
  private stepVoices = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.R = new Renderer(canvas);
    this.sky = new Sky(this.scene);
    this.terrain.loadDefault();
    this.scene.add(this.terrain.group, makeLake(), debris.mesh, puffs.mesh);
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
    this.view.add(this.journal.object);
    // flashlight (world)
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 45, 0.38, 0.6, 1.5);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0005;
    this.camera.add(this.flashlight, this.flashlight.target);
    this.flashlight.position.set(0.18, -0.12, 0);
    this.flashlight.target.position.set(0.05, -0.05, -10);
    this.journal.contracts = this.contracts;
  }
  private viewKey: THREE.DirectionalLight;

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
    const def = ITEMS[id];
    if (!def) return null;
    const cache = (this as any)._models ??= new Map<string, THREE.Object3D>();
    return cache.get(id) ?? null;
  }

  swing(tool: ToolStats, charge: number, origin: THREE.Vector3, dir: THREE.Vector3, swingDir: THREE.Vector3): void {
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
    if (id === 'flashlight') { this.flashOn = !this.flashOn; this.sound('equip', undefined, 0.4, 1.8); return true; }
    if (id === 'jerky' && t.obj) {
      const offer = { item: 'jerky', obj: t.obj, taken: false };
      this.events.emit('offer', offer);
      if (offer.taken) { this.take('jerky'); this.arms?.play('offer'); return true; }
    }
    if (def.food) {
      this.take(id);
      this.survival.eat(def.food.kcal, def.food.warmth ?? 0);
      this.arms?.play(def.food.drink ? 'drink' : 'offer');
      this.sound(def.food.drink ? 'foliage_rustle' : 'foliage_rustle', undefined, 0.3);
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
    G.uTime.value += dt;
    const dtGame = dt * this.timeScale;
    if (this.mode !== 'menu' && this.mode !== 'loading') {
      this.hour += dtGame / 3600;
      if (this.hour >= 24) { this.hour -= 24; this.day++; this.survival.day = this.day; }
    }
    const cam = this.camera;
    // control
    if (this.mode === 'walk') {
      this.player.update(dt);
      if (input.pressed('Tab')) { this.journal.toggle(); this.sound(this.journal.open ? 'stove_door_open' : 'stove_door_close', undefined, 0.15, 2.2); }
      if (this.journal.open) {
        if (input.pressed('KeyA') || input.pressed('ArrowLeft')) this.journal.turn(-1);
        if (input.pressed('KeyD') || input.pressed('ArrowRight')) this.journal.turn(1);
      } else this.hands.update(dt);
      if (input.pressed('KeyF') && (this.inv.items.get('flashlight') ?? 0) > 0) { this.flashOn = !this.flashOn; this.sound('equip', undefined, 0.3, 2); }
    }
    physics.streamTerrain([{ x: this.player.pos.x, z: this.player.pos.z }, ...(this.jeep?.body ? [{ x: this.jeep.root.position.x, z: this.jeep.root.position.z }] : [])]);
    this.syncTreeColliders();
    physics.update(dt, (h) => { if (this.jeep && this.mode === 'drive') this.jeep.update(h, this.driveInput()); else if (this.jeep) this.jeep.update(h, { throttle: 0, brake: 0.2, steer: 0, handbrake: true }); });
    this.chop.update(dt, cam.position);
    debris.update(dt); puffs.update(dt);
    for (const u of this.updaters) u(dt);
    G.uCamPos.value.copy(cam.position);
    this.terrain.update(cam.position, 2);
    this.forest?.update(dt);
    this.ground?.update(cam);
    marks.follow(this.player.pos.x, this.player.pos.z); marks.flush();

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
    // viewmodel
    this.arms?.update(dt, {
      speed: this.player.speed, sprint: this.player.sprinting, crouch: this.player.crouch, breath: this.survival.winded,
      shiver: this.survival.shiver, aimPitch: this.player.pitch, swingCharge: this.hands?.charge ?? 0,
    });
    this.journal.update(dt);
    // audio
    audio.setListener(cam);
    const night = this.sky.darkness;
    audio.ambience('forest_day', this.indoors ? 0 : Math.max(0, 1 - night * 1.6));
    audio.ambience('forest_dusk', this.indoors ? 0 : Math.max(0, 1 - Math.abs(night - 0.55) * 3));
    audio.ambience('forest_night', this.indoors ? 0 : Math.max(0, night * 1.4 - 0.4));
    audio.ambience('wind', 0.2 + G.uWindStrength.value * 0.6);
    audio.ambience('cabin', this.indoors ? 1 : 0);
    // hud
    if (this.mode === 'walk' && !this.journal.open) {
      hud.setLabel(this.hands.label);
      hud.setCharge(this.hands.charging ? this.hands.charge : 0);
      hud.showDot(true);
    } else { hud.setLabel(''); hud.showDot(false); hud.setCharge(0); }
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
      physics.world.createCollider(RAPIER.ColliderDesc.cylinder(t.h / 2, t.r).setCollisionGroups(groups(GROUP.STATIC, 0xffff)).setFriction(0.8), body);
      this.treeCols.set(k, body);
    }
    for (const [k, b] of this.treeCols) {
      const st = this.chop.trees.get(k)?.state;
      if (!keep.has(k) || st === 'falling' || st === 'fallen' || st === 'gone') { physics.world.removeRigidBody(b); this.treeCols.delete(k); }
    }
  }

  render(): void {
    this.R.render(this.scene, this.camera, this.view, this.viewCam);
  }

  /** a piece was put somewhere special: woodbox, stove, campsite box, log deck */
  piecePlaced(p: WoodPiece, where: string): void { this.events.emit('piece', { p, where }); }
}

