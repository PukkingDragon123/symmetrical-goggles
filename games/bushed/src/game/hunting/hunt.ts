// THE HUNT: everything between the rifle and the freezer.
//   - spawns white-tailed deer (does with fawns-of-the-year and yearlings in small herds, bucks alone) and moose (a
//     bull or a cow, near water and in the wet low ground) out of sight around the player, by biome and hour (dawn
//     and dusk are best, midday is dead, night is for the eyes in the flashlight), and lets them go again
//   - builds their HuntCtx (the player's feet, the wind, the noises of the world: the rifle, chopping, falling trees,
//     the Jeep) and routes their events to sounds and story lines
//   - flies the bullets (ballistics.ts) and paints what they hit (fx.ts): the blood trail of a wounded animal stays
//     on the ground to be followed, with its hoof prints
//   - after the shot: walk up, tap E to drag a deer (a joint like log dragging), hold E to field dress (kneeling,
//     knife work): heart and liver, venison or moose meat, the hide, the antlers as a trophy; the tag (Ontario) is
//     notched and fixed or you are a poacher
//   - stocks the General Store: the rifle on a rack behind the counter (once the store trusts you: unlockAt),
//     cartridges, the licence and tags on the counter
import * as THREE from 'three';
import type { Game } from '../game';
import { GameAnimal, Herd, cervidModelAsync, type HuntCtx, type HitZone, type Species } from '../../creatures/game/animal';
import { trophyGen } from '../../creatures/game/model';
import { runAsync } from '../../creatures/anatomy';
import { creatureMaterial as creatureMat } from '../../creatures/rig';
import { Rifle } from './rifle';
import { Ballistics, type BulletHit } from './ballistics';
import { BloodDecals, impactFx, meatParcel, hideRoll, cartridgeBox, tagCard } from './fx';
import { HUNT_ITEMS, registerHuntItems } from './items';
import { ITEMS } from '../items';
import { input } from '../../core/input';
import { physics, RAPIER, GROUP, groups } from '../../physics/physics';
import { heightAt, biome, SPOTS, WORLD, roadInfo } from '../../world/layout';
import { marks } from '../../world/marks';
import { G } from '../../gfx/globals';
import { puffs } from '../../gfx/particles';
import { audio } from '../../audio/audio';
import { hud } from '../../ui/hud';
import { floatText } from '../../ui/float';
import { registerInteractable, unregisterInteractable } from '../interact';
import { loadProp } from '../../places/props';

const SOUND: Record<string, string> = { snort: 'deer_snort', stomp: 'deer_stomp', call: 'moose_call', grunt: 'moose_grunt', crash: 'branch_break_big', flee: 'branch_snap', fall: 'log_thud' };
const KNIVES = ['hunting_knife', 'knife', 'hatchet', 'machete'];
const EARNED_KEY = 'bushed_hunt_earned';

interface Carcass { a: GameAnimal; proxy: THREE.Mesh; dressed: boolean }
interface Drag { c: Carcass; body: RAPIER.RigidBody; anchor: RAPIER.RigidBody; joint: RAPIER.ImpulseJoint; last: THREE.Vector3 | null }

export interface HuntOpts {
  /** spawn animals around the player by biome and hour (default true; the test page turns it off) */
  spawn?: boolean;
  /** the rifle hotkey (default 'Digit6'; null if the integrator puts the rifle in hands.ts TOOL_KEYS) */
  hotkey?: string | null;
  /** bullet traces for the test page */
  trace?: boolean;
}

export class Hunt {
  readonly group = new THREE.Group();
  readonly animals: GameAnimal[] = [];
  readonly rifle: Rifle;
  readonly ballistics: Ballistics;
  readonly blood = new BloodDecals();
  readonly carcasses: Carcass[] = [];
  spawning: boolean;
  /** models built and cached (spawning waits for them) */
  ready = false;
  private noises: { pos: THREE.Vector3; level: number; kind: string }[] = [];
  private t = 0; private spawnT = 2; private nextId = 1;
  private dress: { c: Carcass; t: number; total: number; stroke: number } | null = null;
  private eHeld = 0; private eTarget: Carcass | null = null;
  private drag: Drag | null = null;
  private kneel = 0;
  private lastMoney = -1; private earned = 0;
  private stock: { obj: THREE.Object3D; id: string; gate?: () => boolean }[] = [];
  private hotkey: string | null;
  private lastSwing = 0;
  private lod = new WeakMap<GameAnimal, number>();

  constructor(private game: Game, o: HuntOpts = {}) {
    this.spawning = o.spawn ?? true;
    this.hotkey = o.hotkey === undefined ? 'Digit6' : o.hotkey;
    this.group.name = 'Hunt';
    this.group.add(this.blood.mesh);
    game.scene.add(this.group);
    this.rifle = new Rifle(game);
    this.rifle.blocked = () => !!this.dress || !!this.drag;
    this.ballistics = new Ballistics({ animals: () => this.animals, forest: () => (game.forest as never) ?? null, onHit: (h) => this.onHit(h), trace: o.trace });
    this.rifle.onShot = (eye, dir) => this.ballistics.fire(eye, dir);
    game.events.on('gunshot', (e: { pos: THREE.Vector3 }) => this.noise(e.pos, 1, 'shot'));
    game.events.on('felled', (t: { ref?: { x: number; y: number; z: number } }) => { if (t?.ref) this.noise(new THREE.Vector3(t.ref.x, t.ref.y, t.ref.z), 0.95, 'tree'); });
    try { this.earned = Number(localStorage.getItem(EARNED_KEY) ?? 0) || 0; } catch { this.earned = 0; }
  }

  /** load the rifle, register the items and their models, build the animal models in the background */
  async init(): Promise<void> {
    registerHuntItems();
    await this.rifle.load();
    await this.itemModels();
    this.stockStore();
    // the four animals' models: from the IndexedDB cache, or built in slices without stalling the frame
    (async () => {
      for (const [s, m] of [['deer', false], ['deer', true], ['moose', true], ['moose', false]] as const) { try { await cervidModelAsync(s, m); } catch (e) { console.warn('[hunt] model', s, m, e); } }
      this.ready = true;
    })();
  }

  private async itemModels() {
    const g = this.game;
    const set = (id: string, o: THREE.Object3D | null) => { if (o) { o.userData.itemId = id; g.setItemModel(id, o); } };
    try { const r = await loadProp('bolt_action_rifle_7_62'); set('rifle', r); } catch { /* */ }
    set('ammo_762', this.rifle.roundModel());
    set('ammo_box_762', cartridgeBox());
    for (const k of ['licence', 'tag_deer', 'tag_moose'] as const) set(k, tagCard(k));
    for (const k of ['venison', 'moose_meat', 'deer_liver'] as const) set(k, meatParcel(k));
    for (const k of ['deer_hide', 'moose_hide'] as const) set(k, hideRoll(k));
    try { set('hunting_knife', await loadProp('fish_knife')); } catch { /* */ }
    // the trophies: built with the anatomy kit (a few hundred ms each), later
    setTimeout(async () => {
      for (const sp of ['deer', 'moose'] as const) {
        try {
          const t = await runAsync(trophyGen(sp));
          const { mat } = creatureMat(t.tex, t.sd);
          const m = new THREE.Mesh(t.geo, mat); m.castShadow = true;
          const grp = new THREE.Group(); grp.add(m);
          set(sp === 'deer' ? 'antlers_deer' : 'antlers_moose', grp);
        } catch (e) { console.warn('[hunt] trophy', e); }
      }
    }, 4000);
  }

  // ------------------------------------------------------------------------------------------------ spawning
  /** put an animal (or a herd) in the world now */
  async spawn(species: Species, male: boolean, x: number, z: number, heading = Math.random() * Math.PI * 2, herd?: Herd): Promise<GameAnimal> {
    const a = await GameAnimal.create(species, male);
    a.id = this.nextId++;
    a.place(x, z, heading, heightAt(x, z));
    a.mesh.raycast = () => undefined;
    if (a.fur) { a.fur.shells.raycast = () => undefined; if (a.fur.fins) a.fur.fins.raycast = () => undefined; }
    if (herd) { a.herd = herd; herd.members.push(a); }
    this.animals.push(a);
    this.group.add(a.object);
    return a;
  }
  remove(a: GameAnimal) {
    const i = this.animals.indexOf(a); if (i >= 0) this.animals.splice(i, 1);
    if (a.herd) { const k = a.herd.members.indexOf(a); if (k >= 0) a.herd.members.splice(k, 1); }
    const c = this.carcasses.findIndex((q) => q.a === a); if (c >= 0) { unregisterInteractable(this.carcasses[c].proxy); this.carcasses.splice(c, 1); }
    a.dispose();
  }
  /** how many groups of each the place and the hour call for */
  private wants(): { deer: number; moose: number } {
    const P = this.game.player.pos, b = biome(P.x, P.z), h = this.game.hour;
    const dawn = Math.max(0, 1 - Math.abs(h - 6.8) / 1.8), dusk = Math.max(0, 1 - Math.abs(h - 19.0) / 2.0);
    const hourK = 0.45 + 1.4 * Math.max(dawn, dusk) - (h > 11 && h < 15 ? 0.15 : 0) - (h > 22 || h < 4 ? 0.2 : 0);
    const tot = b.spruce + b.fir + b.pine + b.birch + b.cedar + 1e-6;
    const browse = b.birch / tot * 1.6 + b.burn * 1.2 + (1 - b.density) * 0.8 + 0.35;
    const nearCabin = Math.hypot(P.x - SPOTS.cabin.x, P.z - SPOTS.cabin.z) < 60 ? 0.5 : 1;
    const deer = Math.round(Math.min(2, browse * hourK * nearCabin));
    const lake = Math.hypot(P.x - SPOTS.lake.x, P.z - SPOTS.lake.z) < SPOTS.lake.r * 2.2 ? 0.5 : 0;
    const moose = b.wet * hourK + lake > 0.75 ? 1 : 0;
    return { deer, moose };
  }
  private spawnTick() {
    const g = this.game, P = g.player.pos;
    // let go of what wandered far (the dead and the dragged stay a while longer)
    for (const a of [...this.animals]) {
      const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z);
      if ((a.alive && d > 320 && a.state !== 'wounded') || (!a.alive && d > 700)) this.remove(a);
    }
    if (!this.spawning || !this.ready) return;
    const want = this.wants();
    const herds = new Set(this.animals.filter((a) => a.alive).map((a) => a.herd ?? a));
    let deer = 0, moose = 0;
    for (const h of herds) { const s = h instanceof GameAnimal ? h.species : h.members[0]?.species; if (s === 'deer') deer++; else if (s === 'moose') moose++; }
    const species: Species | null = deer < want.deer ? 'deer' : moose < want.moose ? 'moose' : null;
    if (!species) return;
    // somewhere out of sight: behind or beside the player, 110-200 m, dry land (moose: wet), off the roads
    const fwd = g.player.forward();
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.atan2(-fwd.x, -fwd.z) + (Math.random() - 0.5) * 3.6, d = 110 + Math.random() * 90;
      const x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
      if (Math.abs(x) > WORLD.playHalf || Math.abs(z) > WORLD.playHalf) continue;
      if (heightAt(x, z) < WORLD.waterY + 0.4) continue;
      const r = roadInfo(x, z); if (r.road >= 0 && r.d < r.w + 6) continue;
      if (Math.hypot(x - SPOTS.cabin.x, z - SPOTS.cabin.z) < 45 || Math.hypot(x - SPOTS.store.x, z - SPOTS.store.z) < 70) continue;
      if (species === 'moose' && biome(x, z).wet < 0.45 && Math.random() < 0.7) continue;
      const herd = new Herd();
      if (species === 'deer') {
        // a buck alone (one in three), else a doe with one or two followers
        if (Math.random() < 0.33) void this.spawn('deer', true, x, z, undefined, herd);
        else { const n = 1 + Math.floor(Math.random() * 3); for (let k = 0; k < n; k++) void this.spawn('deer', false, x + (Math.random() - 0.5) * 6, z + (Math.random() - 0.5) * 6, undefined, herd); }
      } else void this.spawn('moose', Math.random() < 0.5, x, z, undefined, herd);
      return;
    }
  }

  // ------------------------------------------------------------------------------------------------ the world's noise
  noise(pos: THREE.Vector3, level: number, kind: string) { this.noises.push({ pos: pos.clone(), level, kind }); }

  private ctx(dt: number): HuntCtx {
    const g = this.game, f = g.forest as unknown as { trunkColliders?(x: number, z: number, r: number): { x: number; z: number; r: number }[] } | null;
    return {
      dt, time: this.t, hour: g.hour,
      player: { pos: g.player.pos, speed: g.player.speed, crouch: g.player.crouch, light: g.flashOn, sprint: g.player.sprinting },
      noises: this.noises,
      wind: { x: G.uWindDir.value.x, z: G.uWindDir.value.y, k: G.uWindStrength.value },
      heightAt, waterY: WORLD.waterY,
      trunks: f?.trunkColliders ? (x, z, r) => f.trunkColliders!(x, z, r) : undefined,
      emit: (ev, d) => this.onAnimal(ev, d as never),
      blood: (p, amt, kind) => this.blood.add(p, amt, kind, this.t),
      print: (x, z, h, depth) => { if (Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 60) marks.stamp(0, x, z, 0.035, 0.05, -h, depth); },
    };
  }

  private onAnimal(ev: string, d: { pos: THREE.Vector3; who: GameAnimal; hitPlayer?: boolean; zone?: HitZone }) {
    const g = this.game;
    const snd = SOUND[ev];
    if (snd) audio.play(snd, { pos: d.pos, vol: ev === 'fall' ? 0.6 : ev === 'flee' ? 0.5 : 1, rate: ev === 'fall' ? 0.7 : undefined });
    if (ev === 'flee') audio.play('foliage_rustle', { pos: d.pos, vol: 0.6 });
    if (ev === 'charge_stop') {
      if (d.hitPlayer) {
        const push = g.player.pos.clone().sub(d.who.pos).setY(0).normalize().multiplyScalar(7);
        g.player.vel.add(push.setY(3)); g.player.addShake(1.4); g.R.fx.damage = 0.9; g.survival.spend(0.4);
        hud.say('<i>Half a ton of moose goes through me like a truck.</i>', 3.5);
      } else hud.say('<i>It stops. It stares. It goes. My legs don\'t work for a while.</i>', 3.5);
    }
  }

  // ------------------------------------------------------------------------------------------------ bullets
  private onHit(h: BulletHit) {
    const g = this.game;
    const delay = h.dist / 343;
    impactFx(h.kind, h.point, h.normal, h.dir);
    if (h.kind === 'animal' && h.animal) {
      const a = h.animal, wasAlive = a.alive;
      a.shot(h.zone!, h.point, h.dir, this.ctx(0));
      audio.play('bullet_hit', { pos: h.point, vol: 1, delay });
      // what the hunter makes of it, a moment later
      if (wasAlive) setTimeout(() => {
        const line = h.zone === 'head' || h.zone === 'neck' || h.zone === 'spine' ? 'It drops where it stood.'
          : h.zone === 'heart' || h.zone === 'lungs' ? (a.species === 'deer' ? 'It kicks and bolts. Good hit. Give it a minute.' : 'It hunches and lumbers off. Good hit, I think.')
            : h.zone === 'leg' ? 'It stumbles, then it\'s gone on three legs.' : 'A hollow whack. Gut. It\'ll go a long way. Wait, then follow the blood.';
        hud.say(`<i>${line}</i>`, 3.5);
      }, 900);
    } else {
      audio.play('bullet_hit', { pos: h.point, vol: h.kind === 'tree' ? 0.8 : 0.5, rate: h.kind === 'tree' ? 0.8 : h.kind === 'solid' ? 1.4 : 1, delay });
      if (h.kind === 'tree') audio.play('axe_glance', { pos: h.point, vol: 0.4, rate: 0.7, delay });
      // a near miss spooks anything close to where it struck
      this.noise(h.point, 0.7, 'impact');
    }
    void g;
  }

  // ------------------------------------------------------------------------------------------------ per frame
  update(dt: number): void {
    const g = this.game;
    this.t += dt;
    // the world's noises this frame: chopping, the Jeep, trees down (and the rifle, from its event)
    if (g.lastSwingAt > this.lastSwing) { this.lastSwing = g.lastSwingAt; this.noise(g.player.pos, 0.55, 'chop'); }
    if (g.jeep?.running && Math.abs(g.jeep.speed) > 1 && Math.random() < dt * 2) this.noise(g.jeep.root.position, 0.75, 'engine');
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 3; this.spawnTick(); }
    const ctx = this.ctx(dt), P = g.player.pos;
    for (const a of this.animals) {
      // far animals think and move at a few hertz (their skeleton and fur only when it shows)
      const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z);
      const acc = (this.lod.get(a) ?? 0) + dt, every = d < 90 ? 0 : d < 180 ? 0.1 : 0.25;
      if (acc >= every) { ctx.dt = acc; a.update(ctx); this.lod.set(a, 0); } else this.lod.set(a, acc);
      if (!a.alive && !this.carcasses.some((c) => c.a === a)) this.makeCarcass(a);
    }
    ctx.dt = dt;
    this.noises.length = 0;
    this.ballistics.update(dt);
    this.rifle.update(dt);
    this.items(dt);
    this.carcassPlay(dt);
    this.storeTick();
  }

  // ------------------------------------------------------------------------------------------------ items
  private items(dt: number) {
    const g = this.game;
    // a box of rounds goes into the pocket as loose rounds
    const boxes = g.inv.items.get('ammo_box_762') ?? 0;
    if (boxes > 0) { g.take('ammo_box_762', boxes); g.give('ammo_762', boxes * 20); hud.say(`<i>${boxes * 20} rounds into the coat pocket.</i>`, 2.5); }
    // the rifle hotkey
    if (this.hotkey && input.pressed(this.hotkey) && g.mode === 'walk' && !g.hands.busy && g.owns('rifle')) g.hands.equip(g.hands.heldItem === 'rifle' ? null : 'rifle');
    // read a held licence or tag
    const held = g.hands.heldItem;
    if ((held === 'licence' || held === 'tag_deer' || held === 'tag_moose') && input.pressed('Mouse0') && !g.hands.focus) {
      const card = (HUNT_ITEMS[held]);
      g.readPaper([{ t: 'h', text: card.name }, { t: 'p', text: card.desc }, { t: 'gap' }, { t: 'small', text: 'Ontario Ministry of Natural Resources. Not transferable.' }, { t: 'sig', text: 'R. ' }], 4);
    }
    void dt;
  }

  // ------------------------------------------------------------------------------------------------ after the shot
  private makeCarcass(a: GameAnimal) {
    const d = a.model.dims;
    const proxy = new THREE.Mesh(new THREE.CapsuleGeometry(d.width * 1.15, d.length * 0.65, 2, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.set(0, d.width, -d.length * 0.05);
    proxy.name = 'carcass';
    a.object.add(proxy);
    const c: Carcass = { a, proxy, dressed: false };
    this.carcasses.push(c);
    const name = a.species === 'deer' ? (a.male ? 'buck' : 'doe') : a.male ? 'bull' : 'cow';
    registerInteractable(proxy, {
      kind: 'creature', reach: 2.6,
      label: () => {
        if (this.dress?.c === c) return `Field dressing the ${name}... ${Math.round((this.dress.t / this.dress.total) * 100)}%`;
        if (this.drag?.c === c) return 'Q  let go';
        if (c.dressed) return a.species === 'deer' ? 'E  drag' : '';
        const knife = KNIVES.some((k) => this.game.owns(k));
        return a.state !== 'dead' ? '' : `${a.species === 'deer' ? 'E  drag     ' : ''}hold E  field dress the ${name}${knife ? '' : ' (you need a knife)'}`;
      },
      use: () => { this.eTarget = c; this.eHeld = 0; },
    });
  }

  private carcassPlay(dt: number) {
    const g = this.game;
    // E: tap to drag, hold to dress
    if (this.eTarget) {
      const c = this.eTarget;
      if (input.held('KeyE') && g.hands.focus?.obj === c.proxy) {
        this.eHeld += dt;
        if (this.eHeld > 0.35 && !this.dress && !c.dressed && c.a.state === 'dead') this.startDress(c);
      } else {
        if (this.eHeld <= 0.35 && !this.dress) {
          if (this.drag?.c === c) this.endDrag();
          else if (c.a.state === 'dead') this.startDrag(c);
        }
        this.eTarget = null;
      }
    }
    // dressing: keep holding E while looking at it
    if (this.dress) {
      const D = this.dress, a = D.c.a;
      const on = input.held('KeyE') && g.hands.focus?.obj === D.c.proxy;
      if (!on) { this.dress = null; hud.say('<i>Not finished.</i>', 1.2); }
      else {
        D.t += dt; D.stroke -= dt;
        if (D.stroke <= 0) {
          D.stroke = 0.65 + Math.random() * 0.3;
          g.arms?.play('grab');
          g.sound('field_dress', a.pos.clone().setY(a.pos.y + 0.3), 0.8);
          const belly = a.object.localToWorld(new THREE.Vector3(0, a.model.dims.width * 1.2, 0));
          puffs.emit(belly, new THREE.Vector3(0, 0.4, 0), { size: 0.05, grow: 2, life: 0.6, color: new THREE.Color(0.45, 0.1, 0.08), alpha: 0.5, n: 2, spread: 0.08 });
          this.blood.add(belly.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), 0.9, 'dark', this.t);
        }
        if (D.t >= D.total) this.finishDress(D.c);
      }
    }
    // kneel while dressing: the eye comes down
    this.kneel += ((this.dress ? 1 : 0) - this.kneel) * Math.min(1, dt * 5);
    if (this.kneel > 0.001) { g.camera.position.y -= this.kneel * 0.62; g.camera.updateMatrixWorld(); }
    if (this.drag) this.dragTick(dt);
  }

  private startDress(c: Carcass) {
    const g = this.game;
    if (!KNIVES.some((k) => g.owns(k))) { hud.say('<i>Not with my bare hands. A knife. Odile sells them.</i>', 2.5); return; }
    if (this.drag) this.endDrag();
    if (g.hands.heldItem === 'rifle') g.hands.equip(null);
    this.dress = { c, t: 0, total: c.a.species === 'deer' ? 4.5 : 8, stroke: 0.2 };
  }

  private finishDress(c: Carcass) {
    const g = this.game, a = c.a;
    this.dress = null;
    c.dressed = true; a.dressed = true;
    const deer = a.species === 'deer';
    const got: [string, number][] = deer
      ? [['venison', a.male ? 4 : 3], ['deer_liver', 1], ['deer_hide', 1], ...(a.male ? [['antlers_deer', 1] as [string, number]] : [])]
      : [['moose_meat', a.male ? 10 : 8], ['moose_hide', 1], ...(a.male ? [['antlers_moose', 1] as [string, number]] : [])];
    const at = a.object.localToWorld(new THREE.Vector3(0, a.model.dims.width * 2, 0));
    got.forEach(([id, n], k) => { g.give(id, n); setTimeout(() => floatText.pop(`+${n > 1 ? n + ' ' : ''}${ITEMS[id]?.name ?? id}`, at.clone().add(new THREE.Vector3(0, k * 0.12, 0))), k * 350); });
    // the gut pile, and the tag
    this.blood.pool(a.pos.clone(), a.model.dims.width * 1.8, 'dark', deer ? 9 : 16, this.t);
    const tag = deer ? 'tag_deer' : 'tag_moose';
    if (g.take(tag)) { g.flags.add(`tagged_${a.species}`); hud.say(`<i>Notch the date, tie the tag on. Legal. ${deer ? 'Meat for a month.' : 'Meat for the winter.'}</i>`, 4); }
    else { g.flags.add('poached'); hud.say('<i>No tag for this one. Best keep my mouth shut about where the meat came from.</i>', 4.5); }
    if (deer) hud.say('<i>Heart and liver tonight.</i>', 3);
    // what is left fades into the moss by morning
    setTimeout(() => { if (this.animals.includes(a) && !this.drag) this.remove(a); }, 90000);
  }

  // ---- dragging: the carcass becomes a physics body on a spherical joint to a kinematic hand anchor (like a log)
  private startDrag(c: Carcass) {
    const g = this.game, a = c.a;
    if (a.species === 'moose') { hud.say('<i>Half a ton. Nobody drags a moose. Dress it where it lies.</i>', 3); return; }
    if (g.hands.busy) return;
    if (g.hands.heldItem) g.hands.equip(null);
    const mass = a.model.male ? 75 : 55;
    const w = a.model.dims.width, L = a.model.dims.length;
    const at = a.pos.clone().setY(heightAt(a.pos.x, a.pos.z) + w + 0.02);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.heading);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(1.6).setAngularDamping(5).enabledRotations(false, true, false));
    const cq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    physics.world.createCollider(RAPIER.ColliderDesc.capsule(L * 0.3, w).setRotation({ x: cq.x, y: cq.y, z: cq.z, w: cq.w }).setMass(mass).setFriction(0.7).setCollisionGroups(groups(GROUP.DYNAMIC, GROUP.GROUND | GROUP.STATIC)), body);
    const hand = this.handAnchor();
    const anchor = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hand.x, hand.y, hand.z));
    // by the head end (antlers or forelegs)
    const jd = RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: L * 0.42 });
    const joint = physics.world.createImpulseJoint(jd, anchor, body, true);
    this.drag = { c, body, anchor, joint, last: null };
    a.dragged = true;
    g.arms?.setHeld('drag');
    g.arms?.play('grab');
    g.player.burden = 0.62;
    g.sound('log_lift', at, 0.7);
  }
  private handAnchor(): THREE.Vector3 {
    const g = this.game, f = g.player.forward();
    return g.player.pos.clone().addScaledVector(f, 0.85).add(new THREE.Vector3(0, 0.55, 0));
  }
  private dragTick(dt: number) {
    const g = this.game, D = this.drag!;
    const h = this.handAnchor();
    D.anchor.setNextKinematicTranslation({ x: h.x, y: h.y, z: h.z });
    const t = D.body.translation(), r = D.body.rotation();
    const yaw = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w), 'YXZ').y;
    const a = D.c.a;
    a.pos.set(t.x, heightAt(t.x, t.z), t.z); a.heading = yaw;
    a.object.position.copy(a.pos); a.object.rotation.set(0, yaw, 0);
    // the drag mark and a smear of blood behind it
    const tail = a.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), -a.model.dims.length * 0.35);
    if (!D.last || D.last.distanceTo(tail) > 0.3) {
      if (D.last) marks.line(2, D.last.x, D.last.z, tail.x, tail.z, a.model.dims.width * 0.9, 0.16);
      if (Math.random() < 0.3) this.blood.add(tail, 0.4, 'dark', this.t);
      D.last = tail.clone();
    }
    g.survival.spend(dt * 0.018);
    if (g.survival.stamina <= 0.01) { hud.say('<i>Too winded to keep hauling.</i>', 2.5); this.endDrag(); return; }
    if (input.pressed('KeyQ') || input.pressed('Mouse2') || (g.hands.heldItem && g.hands.heldItem !== '')) this.endDrag();
    if (g.mode !== 'walk') this.endDrag();
  }
  private endDrag() {
    const g = this.game, D = this.drag;
    if (!D) return;
    this.drag = null;
    try { physics.world.removeImpulseJoint(D.joint, true); physics.world.removeRigidBody(D.anchor); physics.world.removeRigidBody(D.body); } catch { /* */ }
    D.c.a.dragged = false;
    if ((g.arms as unknown as { held: string } | null)?.held === 'drag') g.arms?.setHeld('none');
    g.player.burden = 0;
    g.sound('log_thud', D.c.a.pos, 0.5);
  }

  // ------------------------------------------------------------------------------------------------ the store
  /** a rifle rack on the wall behind the counter, cartridges and the paper on the counter (store-local coordinates) */
  stockStore() {
    const g = this.game, st = g.store;
    if (!st || st.group.getObjectByName('HuntStock')) return;
    const IX = 3.84, F = 0.42, ch = F + 0.96;
    const group = new THREE.Group(); group.name = 'HuntStock';
    st.group.add(group);
    // the rack: a stained board with two turned pegs, screwed to the wall above the counter shelves
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.7 });
    const rackW = 1.25;
    const board = new THREE.Mesh(roundedSlab(0.11, rackW, 0.024), wood);
    board.position.set(IX - 0.012, F + 1.72, 1.05); board.rotation.y = -Math.PI / 2; board.castShadow = true;
    group.add(board);
    for (const dz of [-0.36, 0.36]) {
      const peg = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.012, 0), new THREE.Vector2(0.014, 0.03), new THREE.Vector2(0.01, 0.06), new THREE.Vector2(0.016, 0.075), new THREE.Vector2(0.001, 0.082)], 8), wood);
      peg.rotation.z = Math.PI / 2; peg.position.set(IX - 0.02, F + 1.69, 1.05 + dz); group.add(peg);
    }
    const unlocked = () => g.flags.has('rifle_unlocked') || this.earned >= (ITEMS.rifle?.unlockAt ?? 0);
    loadProp('bolt_action_rifle_7_62').then((r) => {
      r.rotation.set(0, Math.PI / 2, 0.06);
      r.position.set(IX - 0.075, F + 1.62, 1.05);
      group.add(r);
      this.addStock(r, 'rifle', unlocked, 3.2);
      const card = tagCard('licence'); card.scale.setScalar(0.9);
      card.position.set(IX - 0.02, F + 1.86, 1.05); card.rotation.set(0, -Math.PI / 2, 0); card.children[0].rotation.set(0, 0, 0);
      // a hand-lettered card over the rack
      group.add(card);
    }).catch(() => undefined);
    // on the counter by the register: boxes of rounds, a few tags and licences
    const counterX = 2.0;
    for (let k = 0; k < 3; k++) { const b = cartridgeBox(); b.position.set(counterX - 0.08 + k * 0.012, ch + k * 0.036, 1.4); b.rotation.y = 0.2 + k * 0.15; group.add(b); this.addStock(b, 'ammo_box_762'); }
    const items: [string, number, number][] = [['tag_deer', 1.62, 0.1], ['tag_moose', 1.72, -0.15], ['licence', 1.55, 0.25]];
    for (const [id, z, ry] of items) { const t = tagCard(id as 'licence'); t.position.set(counterX - 0.05, ch + 0.001, z); t.rotation.y = ry; group.add(t); this.addStock(t, id, id === 'tag_moose' ? () => this.earned >= (ITEMS.tag_moose?.unlockAt ?? 0) : undefined); }
  }
  private addStock(obj: THREE.Object3D, id: string, gate?: () => boolean, reach = 2.4) {
    const g = this.game, it = ITEMS[id];
    obj.userData.itemId = id;
    this.stock.push({ obj, id, gate });
    registerInteractable(obj, {
      kind: 'pickup', reach,
      label: () => (it ? `${it.name}  $${it.price}` : id),
      use: (ctx) => {
        // the rack goes on being a rack: a fresh copy comes down into the hands, the display stays for the next time
        if (id === 'rifle' || id === 'ammo_box_762' || id.startsWith('tag') || id === 'licence') {
          const copy = id === 'rifle' ? (g.toolModel('rifle') ?? obj.clone()) : obj.clone();
          const wp = obj.getWorldPosition(new THREE.Vector3()), wq = obj.getWorldQuaternion(new THREE.Quaternion());
          g.scene.add(copy); copy.position.copy(wp); copy.quaternion.copy(wq);
          registerInteractable(copy, { kind: 'pickup', label: () => it?.name ?? id, use: () => undefined });
          g.placeAction('pickup', { ...ctx, itemId: id, object: copy } as never);
        } else g.placeAction('pickup', { ...ctx, itemId: id, object: obj } as never);
      },
      enabled: () => !gate || gate(),
    });
  }
  private storeTick() {
    const g = this.game;
    // money earned (not counting what you spend) unlocks the rifle and the moose tag
    if (this.lastMoney < 0) this.lastMoney = g.inv.money;
    if (g.inv.money > this.lastMoney + 0.001) { this.earned += g.inv.money - this.lastMoney; try { localStorage.setItem(EARNED_KEY, String(this.earned)); } catch { /* */ } }
    this.lastMoney = g.inv.money;
    if (!g.flags.has('rifle_unlocked') && this.earned >= (ITEMS.rifle?.unlockAt ?? 0)) g.flags.add('rifle_unlocked');
    for (const s of this.stock) if (s.gate) s.obj.visible = s.gate();
  }

  /** debug and the test page */
  status() {
    return {
      animals: this.animals.map((a) => ({ id: a.id, species: a.species, male: a.male, state: a.state, aware: +a.awareness.toFixed(2), blood: +a.blood.toFixed(2), wounds: a.wounds.slice(), d: +a.pos.distanceTo(this.game.player.pos).toFixed(1) })),
      rifle: this.rifle.status(), bullets: this.ballistics.bullets.length, blood: this.blood.mesh.count, dressing: !!this.dress, dragging: !!this.drag,
    };
  }
}

/** a board with softened edges (an extruded rounded rectangle) */
function roundedSlab(h: number, w: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape(), r = Math.min(h, w) * 0.2;
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
  g.translate(0, 0, -d);
  return g;
}
