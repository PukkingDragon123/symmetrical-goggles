// Creatures in the game world: builds the CreatureCtx from the game every frame, routes their events to sounds,
// the journal (rules you discover by watching) and story beats, and runs the intro's woodpile encounter: the
// hound lunges, Ray's axe goes flying, the hound runs off with it to chew the handle, and jerky settles it.
import * as THREE from 'three';
import type { Game } from './game';
import { AxehandleHound, Bigfoot, Gumberoo, Wildlife, DingbatRoost, GrannyTamarack, HOUND_SOUND, BIGFOOT_SOUND, GUMBEROO_SOUND, DINGBAT_SOUND, GRANNY_SOUND, giftMesh, preloadCreatures, spawnNewCryptids, type CreatureCtx, type GroundItem } from '../creatures';
import { SPOTS, heightAt } from '../world/layout';
import { audio } from '../audio/audio';
import { SOUNDS } from '../audio/bank';
import { hud } from '../ui/hud';
import { floatText } from '../ui/float';
import { makePhysical, propsNear, removeProp, type PhysProp } from './physprops';
import { ITEMS } from './items';
import { anchorPos } from './flow';
import { chewHandle } from './forge/items';
import type { ToolStats } from './items';

/** the strength of a hoop snake's sting or a splinter cat going through a tree, as an axe (critters' fellTreeAt) */
const CRYPTID_AXE: ToolStats = { kind: 'axe', sharp: 1, headMass: 2.4, reach: 1, swingTime: 1, fell: 7, split: 2, limb: 2, stamina: 0 };

/** fallbacks while a creature sound id is missing from the bank */
const FALLBACK: Record<string, string> = {
  hound_growl: 'animal_coyotes', hound_snarl: 'animal_coyotes', hound_bark: 'animal_coyotes', hound_whine: 'animal_coyotes',
  hound_yip: 'animal_coyotes', hound_chew: 'wood_chop_kindling', hound_ting: 'axe_glance', hound_sniff: 'foliage_rustle',
};

function playSound(id: string | undefined, pos: THREE.Vector3, vol = 1): void {
  if (!id) return;
  const real = id in SOUNDS ? id : FALLBACK[id];
  if (real) audio.play(real, { pos, vol });
}

/** cryptid event -> the Book of Cryptids rule it teaches (rule ids from src/ui/bookofcryptids/bestiary.ts) */
const CRYPTID_RULES: Record<string, Record<string, string>> = {
  hodag: { growl: 'r0', bellow: 'r1', snap: 'r2', gore: 'r2', eat: 'r3', befriended: 'r4', stink: 'r5' },
  squonk: { sob: 'r0', flee: 'r2', dissolve: 'r3', wail: 'r3', reform: 'r4', eat: 'r5', befriended: 'r5' },
  hidebehind: { hiss: 'r0', glimpse: 'r1', creep: 'r2', attack: 'r2', repelled: 'r3', gag: 'r3', steal: 'r4' },
  agropelter: { throw: 'r1', hit: 'r1', jeer: 'r2', eat: 'r3', befriended: 'r4', gift: 'r4' },
  teakettler: { whistle: 'r0', back_away: 'r2', drink: 'r3', befriended: 'r4' },
  wasset: { burrow: 'r0', popup: 'r1', nip: 'r2', dive: 'r3', eat: 'r4', befriended: 'r4' },
  gouger: { circle: 'r0', snort: 'r1', stuck: 'r1', butt: 'r1', topple: 'r2', righted: 'r3', reward: 'r3', eat: 'r4', befriended: 'r4', sleep: 'r5' },
  hoopsnake: { hiss: 'r0', coil: 'r0', roll: 'r1', miss: 'r1', sting: 'r1', through: 'r2', wither: 'r3', tree: 'r3', flop: 'r4', eat: 'r5', befriended: 'r5' },
  splintercat: { growl: 'r0', yowl: 'r1', smash: 'r1', dazed: 'r1', ram: 'r2', launch: 'r2', smashlure: 'r3', eat: 'r4', befriended: 'r4', sleep: 'r5' },
  goofus: { caw: 'r0', trail: 'r1', fetch: 'r2', drop: 'r2', bonk: 'r3', eat: 'r4', befriended: 'r4', guide: 'r5' },
};

/** what the lumberjack thinks the first time (and now and then after) */
const CRYPTID_LINES: Record<string, Record<string, string>> = {
  hodag: { bellow: 'Something in the swamp just bellowed like a bull in a barrel.', snap: 'It stopped short. That was a warning.', gore: 'The horns. THE HORNS.', stink: 'What died in here? ...Oh. It\'s alive.', befriended: 'It rolled over. It wants its belly scratched.' },
  squonk: { sob: 'Someone is crying out there.', dissolve: 'It... melted. It just cried itself into a puddle.', reform: 'The puddle is pulling itself back together.', befriended: 'It stopped crying. It\'s following me.' },
  hidebehind: { creep: 'A twig snapped. Right behind me.', glimpse: 'Something just ducked behind that trunk.', hiss: 'Don\'t turn around. Turn around. Don\'t.', attack: 'Claws. Out of nowhere.', repelled: 'It doesn\'t like the light.', steal: 'The jerky\'s gone. Fair trade.' },
  agropelter: { throw: 'Somebody up there is throwing branches at me.', hit: 'Ow. OW. Keep moving.', jeer: 'Is that tree laughing at me?', befriended: 'It dropped kindling instead of a branch. Progress.' },
  teakettler: { whistle: 'A kettle boiling? Out here?', back_away: 'It walks backwards. Always watching.', befriended: 'It\'s following me, steaming like a pot.' },
  wasset: { popup: 'The snow just stood up and looked at me.', nip: 'It\'s untying my bootlaces!', dive: 'Gone under like a diving duck.', befriended: 'It keeps popping up wherever I stop. I think it likes me.' },
  gouger: { circle: 'That goat walks round the hill leaning in... its legs are SHORTER on one side.', stuck: 'It can\'t turn round. It has to go the long way.', butt: 'Butted by a lopsided goat.', topple: 'It fell over on the flat. It\'s just lying there kicking.', righted: 'Up you get, you lopsided thing.', reward: 'It\'s gouging at the old pine roots... fatwood!', befriended: 'It leans on me now. Literally.' },
  hoopsnake: { hiss: 'Something hissed up on the bank.', roll: 'IT BIT ITS OWN TAIL AND IT\'S ROLLING AT ME.', miss: 'Missed! It can\'t steer.', through: 'Straight through the hoop. Ha!', sting: 'The tail. The TAIL has a stinger.', tree: 'The tree it stung just died. And it\'s coming down.', flop: 'It fell over on the flat. Just a snake again.', befriended: 'It ate the eggs. Now it watches me chop.' },
  splintercat: { growl: 'Big cat. Ears flat. Back away slowly.', yowl: 'Something screamed in the dark timber.', smash: 'It went THROUGH the tree. Through it.', smashlure: 'It smashed it for the syrup. Firewood, delivered.', ram: 'Like being hit by a woodstove.', dazed: 'It\'s sitting there seeing stars.', befriended: 'It licked the syrup and rumbled. A purr, I think.' },
  goofus: { caw: 'A crow flying... backwards?', trail: 'That bird is following my footprints. Tail first.', drop: 'It dropped something at my feet.', bonk: 'It flew straight into a tree. Of course it did.', befriended: 'It ate the bannock. It wants to help.', guide: 'It\'s flying back the way I came. Follow the bird.' },
};

export class Critters {
  hound: AxehandleHound | null = null;
  bigfoot: Bigfoot | null = null;
  gumberoo: Gumberoo | null = null;
  dingbats: DingbatRoost | null = null;
  /** more cryptids plugged in by other modules: { id, object, offer, update } */
  readonly extra: { id: string; object: THREE.Object3D; offer(i: string): boolean; update(ctx: CreatureCtx): void }[] = [];
  granny: GrannyTamarack | null = null;
  wildlife: Wildlife | null = null;
  readonly items: GroundItem[] = [];
  private itemObjs = new Map<string, THREE.Object3D>();
  private kindness = 0.2;
  private mouth: THREE.Object3D | null = null;
  private carried: THREE.Object3D | null = null;
  private wasCarrying = false;
  private nextId = 1;
  private lastPlayer = new THREE.Vector3();
  private seenBigfoot = 0;
  introActive = false;
  private offerT = 5;
  /** knocks taken from cryptids (decays); past 1 you black out */
  private hurt = 0;
  private said = new Map<string, number>();
  /** food the player set down in the world, as ground items the creatures can find (id 'prop:N') */
  private propItems = new Map<string, PhysProp>();
  private propT = 0;

  constructor(private game: Game) {
    // any food held out goes to the creature you're looking at; each one has a favourite (see its offer())
    game.events.on('offer', (o: { item: string; obj: THREE.Object3D; taken: boolean }) => {
      const within = (root: THREE.Object3D | undefined) => { for (let p: THREE.Object3D | null = o.obj; p; p = p.parent) if (p === root) return true; return false; };
      // home-smoked cryptid jerky counts as jerky to the older creatures
      const old = o.item === 'syrup' ? 'maple_syrup' : o.item === 'cryptid_jerky' ? 'jerky' : o.item;
      const targets: [string, { object: THREE.Object3D; offer(i: string): boolean } | null][] = [
        ['hound', this.hound], ['bigfoot', this.bigfoot as never], ['granny', this.granny], ['gumberoo', this.gumberoo as never],
        ['dingbat', this.dingbats as never], ['wildlife', this.wildlife as never], ...this.extra.map((c) => [c.id, c] as [string, never]),
      ];
      for (const [id, c] of targets) {
        if (!c || !within(c.object)) continue;
        if (!c.offer(this.extra.includes(c as never) ? o.item : old)) { hud.say(`<i>It sniffs the ${o.item} and turns away.</i>`, 2.5); return; }
        o.taken = true;
        this.kindness = Math.min(1, this.kindness + 0.2);
        game.journal.sawCritter(id);
        if (!this.extra.includes(c as never)) game.journal.learn(id, 'food');
        if (id === 'hound') { game.journal.learn('hound', 'jerky'); if (this.introActive) game.flags.add('hound_fed'); }
        return;
      }
    });
    game.events.on('intro_hound', () => this.introHound());
    game.events.on('menu_scare', (e: { pos: THREE.Vector3 }) => this.menuScare(e.pos));
  }

  /** build models (slow: a few seconds each) */
  async spawn(onProgress?: (f: number) => void): Promise<void> {
    const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
    await preloadCreatures({ onProgress } as never);
    const c = SPOTS.cabin;
    this.hound = new AxehandleHound({ pos: new THREE.Vector3(c.x + 40, heightAt(c.x + 40, c.z + 30), c.z + 30) });
    this.hound.object.visible = false;
    this.game.scene.add(this.hound.object);
    this.mouth = this.hound.mesh.skeleton.bones.find((b) => b.name === 'jaw') ?? null;
    await yieldFrame();
    this.bigfoot = new Bigfoot({ pos: new THREE.Vector3(SPOTS.hollow.x, heightAt(SPOTS.hollow.x, SPOTS.hollow.z), SPOTS.hollow.z) });
    this.game.scene.add(this.bigfoot.object);
    await yieldFrame();
    this.gumberoo = new Gumberoo({ pos: new THREE.Vector3(SPOTS.burn.x, heightAt(SPOTS.burn.x, SPOTS.burn.z), SPOTS.burn.z) });
    this.game.scene.add(this.gumberoo.object);
    this.wildlife = new Wildlife();
    this.game.scene.add(this.wildlife.object);
    await yieldFrame();
    // a roost of dingbats under the cabin's porch eave
    const porch = (this.game.cabin?.anchors?.porch as THREE.Object3D | undefined);
    if (porch) {
      const eave = porch.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2.35, 0));
      this.dingbats = new DingbatRoost({ pos: eave, heading: SPOTS.cabin.rot ?? 0, count: 8, span: 3 });
      this.game.scene.add(this.dingbats.object);
    }
    await yieldFrame();
    // Granny Tamarack keeps to the hollow; home is the cabin she walks lost people back to
    const home = new THREE.Vector3(SPOTS.cabin.x, heightAt(SPOTS.cabin.x, SPOTS.cabin.z), SPOTS.cabin.z);
    this.granny = new GrannyTamarack({ home, secrets: ['chanterelles', 'lost_axe', 'bigfoot_stump'] });
    this.game.scene.add(this.granny.object);
    await yieldFrame();
    // the ten from the old camp stories: hodag, squonk, hidebehind, agropelter, teakettler, snow wasset, sidehill
    // gouger, hoop snake, splinter cat, goofus bird (a creature with `interact` can be used with E: tip the gouger up)
    for (const c of spawnNewCryptids(this.game.scene)) {
      this.extra.push(c);
      const it = (c as { interact?: { label(): string; use(): void; enabled(): boolean } }).interact;
      if (it) import('./interact').then(({ registerInteractable }) => registerInteractable(c.object, { kind: 'creature', reach: 2.8, label: () => it.label(), use: () => it.use(), enabled: () => it.enabled() }));
    }
  }

  dropItem(kind: string, pos: THREE.Vector3, obj?: THREE.Object3D): string {
    const id = `item${this.nextId++}`;
    const p = pos.clone(); p.y = heightAt(p.x, p.z) + 0.05;
    this.items.push({ id, kind, pos: p });
    if (!obj && kind !== 'axe') {
      try { obj = giftMesh(kind as never); } catch { obj = undefined; }
    }
    if (obj) {
      obj.position.copy(p);
      this.game.scene.add(obj);
      this.itemObjs.set(id, obj);
      if (kind !== 'axe') makePhysical(obj, { mass: 0.6, label: kind === 'fish' ? 'a fish' : kind });
    }
    if (kind !== 'axe') this.game.journal.learn('bigfoot', 'gift');
    return id;
  }

  private ctx(dt: number): CreatureCtx {
    const g = this.game, p = g.player;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const held = g.hands?.heldItem ?? '';
    const heldKind = held.startsWith('axe') || held === 'hatchet' ? 'axe' : held === 'jerky' ? 'jerky' : held === 'flashlight' || g.flashOn ? 'flashlight' : held || 'none';
    const speed = p.pos.distanceTo(this.lastPlayer) / Math.max(dt, 1e-3);
    this.lastPlayer.copy(p.pos);
    return {
      dt, time: performance.now() / 1000, hour: g.hour,
      player: {
        pos: p.pos.clone(), dir, held: heldKind, crouch: p.crouch, noise: Math.min(1, p.speed / 5 + (g.hands?.charging ? 0.3 : 0) + (performance.now() - g.lastSwingAt < 500 ? 0.4 : 0) + (performance.now() - g.lastShotAt < 2500 ? 1 : 0)),
        light: g.flashOn, speed, action: performance.now() - g.lastSwingAt < 450 ? 'swing' : g.hands?.charging ? 'chop' : undefined,
      },
      fires: g.fires.filter((f) => f.level() > 0.1).map((f) => f.pos),
      fog: g.weather.fog,
      lost: g.player.pos.distanceTo(new THREE.Vector3(SPOTS.cabin.x, g.player.pos.y, SPOTS.cabin.z)) > 260 && (g.hour > 20 || g.hour < 5 || g.weather.fog > 0.7),
      heightAt,
      emit: (ev, data) => this.onEvent(ev, data as Record<string, unknown> | undefined),
      stove: anchorPos(g, 'stove', new THREE.Vector3(SPOTS.cabin.x, heightAt(SPOTS.cabin.x, SPOTS.cabin.z), SPOTS.cabin.z)),
      items: this.items,
      takeItem: (id) => {
        const i = this.items.findIndex((x) => x.id === id);
        if (i < 0) return false;
        const it = this.items[i];
        this.items.splice(i, 1);
        const pp = this.propItems.get(id);
        if (pp) { this.propItems.delete(id); removeProp(pp); return true; }
        const o = this.itemObjs.get(id);
        if (o) {
          this.itemObjs.delete(id);
          if (it.kind === 'axe' && this.mouth) { o.removeFromParent(); this.mouth.add(o); o.position.set(0, -0.02, 0.06); o.rotation.set(0, Math.PI / 2, 0); o.scale.setScalar(1 / this.mouthScale()); this.carried = o; }
          else o.removeFromParent();
        }
        return true;
      },
      dropItem: (kind, pos) => this.dropItem(kind, pos),
      trunks: (x, z, r) => ((g.forest as any)?.trunkColliders?.(x, z, r) ?? []).map((t: { x: number; z: number; r: number }) => ({ x: t.x, z: t.z, r: t.r })),
      kindness: this.kindness,
      threats: this.bigfoot && this.hound?.state === 'companion' ? [this.bigfoot.object.position] : [],
    };
  }

  private mouthScale(): number {
    const s = new THREE.Vector3();
    this.mouth?.getWorldScale(s);
    return s.x || 1;
  }

  /** the six from the camp stories: hurt the player, teach the Book, think out loud (sparingly) */
  private onCryptid(ev: string, who: string, pos: THREE.Vector3, data: Record<string, unknown>): void {
    this.cryptidWorld(pos, data);
    const g = this.game, near = g.player.pos.distanceTo(pos) < 45;
    const rule = CRYPTID_RULES[who][ev];
    if (near) { g.journal.sawCritter(who); if (rule) g.journal.learn(who, rule); }
    const imp = data.impulse as THREE.Vector3 | undefined, dmg = (data.damage as number | undefined) ?? 0;
    if (dmg > 0) {
      g.R.fx.damage = Math.max(g.R.fx.damage, Math.min(1, 0.4 + dmg * 1.6));
      if (imp) g.player.vel.add(imp);
      g.player.addShake(0.6 + dmg * 3);
      g.survival.spend(dmg);
      this.hurt += dmg;
      if (this.hurt >= 1) { this.hurt = 0; this.think('blackout', 'Everything goes grey at the edges...', 0); g.blackout(); return; }
    }
    if (ev === 'nip') { g.player.addShake(0.25); g.survival.spend(0.03); }
    const line = CRYPTID_LINES[who]?.[ev];
    if (line && near) this.think(`${who}:${ev}`, line, ev === 'gore' || ev === 'attack' || ev === 'hit' ? 12 : 90);
  }

  /** what a cryptid does to the world: data.fell (a hoop snake's sting: the tree falls toward dx, dz), data.smash (a
   *  splinter cat: the tree there falls, logs there are bucked to rounds and rounds split), data.give (items dropped
   *  as pickups: the gouger's fatwood, the goofus bird's finds) */
  private cryptidWorld(pos: THREE.Vector3, data: Record<string, unknown>): void {
    const fell = data.fell as { x: number; z: number; dx: number; dz: number } | undefined;
    if (fell) this.fellTreeAt(fell.x, fell.z, new THREE.Vector3(fell.dx, 0, fell.dz), 1.8);
    const sm = data.smash as { x: number; z: number; dx: number; dz: number } | undefined;
    if (sm) this.smashWood(sm.x, sm.z, new THREE.Vector3(sm.dx, 0, sm.dz));
    const give = data.give as { item: string; n?: number; at?: THREE.Vector3 } | undefined;
    if (give) for (let i = 0; i < (give.n ?? 1); i++) this.spawnPickup(give.item, (give.at ?? pos).clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.25 + i * 0.12, (Math.random() - 0.5) * 0.6)));
  }

  /** an axe no one swings: the standing tree nearest (x, z) is notched from the side it should fall to until it goes */
  private fellTreeAt(x: number, z: number, dir: THREE.Vector3, r: number): boolean {
    const g = this.game, f = g.forest;
    if (!f?.trunkColliders) return false;
    const t = f.trunkColliders(x, z, r).filter((c) => c.r < 0.55 && c.r > 0.1).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    if (!t) return false;
    const d0 = dir.clone().setY(0); if (d0.lengthSq() < 1e-4) d0.set(1, 0, 0); d0.normalize();
    const y = heightAt(t.x, t.z) + 0.75, d = new THREE.Vector3();
    for (let k = 0; k < 24; k++) {
      // level and downward strikes in turn, fanned across the side it should fall to, so the notch opens there
      d.copy(d0).applyAxisAngle(new THREE.Vector3(0, 1, 0), [0, 0.7, -0.7][k % 3]);
      const o = new THREE.Vector3(t.x + d.x * (t.r + 1.1), y + (k % 2 ? 0.22 : 0), t.z + d.z * (t.r + 1.1));
      const ray = new THREE.Vector3(t.x, y, t.z).sub(o).normalize();
      const swing = k % 2 ? new THREE.Vector3(-d.x, -0.7, -d.z).normalize() : new THREE.Vector3(-d.z, 0, d.x);
      const res = g.chop.swing(o, ray, t.r + 2, swing, CRYPTID_AXE, 1, 1);
      if (res.kind === 'standing' && res.felled) return true;
      if (res.kind !== 'standing') return false;
    }
    return false;
  }

  /** a splinter cat through wood: a tree there falls, logs are bucked into rounds, rounds split, a felled trunk cut */
  private smashWood(x: number, z: number, dir: THREE.Vector3): void {
    const g = this.game;
    this.fellTreeAt(x, z, dir, 1.6);
    const at = new THREE.Vector3(x, heightAt(x, z), z);
    for (const p of [...g.chop.pieces]) {
      if (!p.body) continue;
      const tr = p.body.translation();
      if (Math.hypot(tr.x - x, tr.z - z) > 2.6) continue;
      if (p.kind === 'log') { for (const q of g.chop.buckPiece(p, 0, false)) if (q.kind === 'log') g.chop.buckPiece(q, 0, false); }
      else if (p.kind === 'round') g.chop.splitPiece(p, at, dir);
    }
    // a felled trunk lying there: cut through it in three places
    const down = new THREE.Vector3(0, -1, 0);
    for (const off of [-1.3, 0, 1.3]) {
      const o = new THREE.Vector3(x + dir.x * off, at.y + 2.4, z + dir.z * off);
      for (let k = 0; k < 6; k++) { const res = g.chop.swing(o, down, 3.2, dir, CRYPTID_AXE, 1, 1); if (res.kind !== 'buck' || res.done) break; }
    }
  }

  /** an item dropped into the world as a pickup (its own model, physical) */
  private spawnPickup(item: string, at: THREE.Vector3): void {
    const m = ITEMS[item] ? this.game.toolModel(item) : null;
    if (!m) { this.dropItem(item, at); return; }
    m.position.copy(at);
    this.game.scene.add(m);
    makePhysical(m, { mass: ITEMS[item].mass ?? 0.3, itemId: item, asleep: false });
  }

  /** a floating thought, at most once per `every` seconds per key (0: always) */
  private think(key: string, text: string, every: number): void {
    const now = performance.now() / 1000, t = this.said.get(key);
    if (every && t !== undefined && now - t < every) return;
    this.said.set(key, now);
    floatText.say(text, { kind: 'thought', dur: 3.5 });
  }

  /** mirror food the player has set down nearby into the creatures' ground items */
  private syncPropItems(): void {
    for (const id of this.propItems.keys()) { const i = this.items.findIndex((x) => x.id === id); if (i >= 0) this.items.splice(i, 1); }
    this.propItems.clear();
    let n = 0;
    for (const p of propsNear(this.game.player.pos, 70)) {
      if (!p.itemId || p.obj.userData.unpaid || !ITEMS[p.itemId]?.food) continue;
      let root: THREE.Object3D = p.obj; while (root.parent) root = root.parent;
      if (root !== this.game.scene) continue; // in the hands, not on the ground
      const id = `prop:${n++}`;
      this.propItems.set(id, p);
      this.items.push({ id, kind: p.itemId, pos: p.obj.getWorldPosition(new THREE.Vector3()) });
    }
  }

  private onEvent(ev: string, data?: Record<string, unknown>): void {
    const pos = (data?.pos as THREE.Vector3 | undefined) ?? this.hound?.object.position ?? this.game.player.pos;
    const who = data?.who as string | undefined;
    const table = (who === 'gumberoo' ? GUMBEROO_SOUND : who === 'bigfoot' ? BIGFOOT_SOUND : who === 'dingbat' ? DINGBAT_SOUND : who === 'granny' ? GRANNY_SOUND : who === 'hound' || !who ? HOUND_SOUND : {}) as Record<string, string | undefined>;
    const snd = data?.sound as string | undefined ?? table[ev];
    playSound(snd ?? ({ eat: who === 'hound' ? 'hound_chew' : 'eat_crunch', chew: who === 'hound' ? 'hound_chew' : 'eat_chew', happy: who === 'hound' ? 'hound_yip' : who === 'bigfoot' ? 'bigfoot_grunt' : who === 'gumberoo' ? 'gumberoo_squeak' : undefined, shake: 'foliage_rustle' } as Record<string, string | undefined>)[ev], pos);
    if (ev === 'happy') floatText.pop('♥', pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#ffb0a0');
    if (who && who in CRYPTID_RULES) { this.onCryptid(ev, who, pos, data ?? {}); return; }
    const jr = this.game.journal;
    if (who === 'dingbat' && ev === 'screech') jr.sawCritter('dingbat');
    if (who === 'granny') {
      jr.sawCritter('granny');
      if (ev === 'take') { this.kindness = Math.min(1, this.kindness + 0.2); hud.say('<i>Long cold fingers take the tin. She smells like rain on cedar.</i>', 4); }
      if (ev === 'beckon') hud.say('<i>She wants me to follow.</i>', 2.5);
      if (ev === 'vanish') hud.say('<i>...Gone. Just fog where she was standing.</i>', 3);
      if (ev === 'secret') {
        const sec = data?.secret as string;
        const text = sec === 'chanterelles' ? 'She points down into the moss under the old spruce by the lake. Gold, everywhere.'
          : sec === 'lost_axe' ? 'She points toward the edge of the hollow. A red handle in the ferns, she seems to say.'
            : 'She points at the big stump in the hollow, then at her mouth. Leave food there.';
        hud.say(`<i>${text}</i>`, 5);
        if (sec === 'bigfoot_stump') jr.learn('bigfoot', 'gift');
      }
    }
    if (who === 'gumberoo') {
      const imp = data?.impulse as THREE.Vector3 | undefined;
      if (ev === 'bounce' && imp) {
        this.game.player.vel.add(imp.clone().multiplyScalar(1.2));
        this.game.player.addShake(1.2);
        this.game.survival.spend(0.25);
        this.game.journal.sawCritter('gumberoo');
        hud.say('<i>It just... bounced me. Like a beach ball made of a truck tire.</i>', 3.5);
      }
      if (ev === 'deflect') { this.game.arms?.play('chop_recover'); this.game.player.addShake(0.6); hud.say('<i>The axe bounces off it like it hit a tire.</i>', 3); }
    }
    const j = this.game.journal;
    switch (ev) {
      case 'growl': if (this.game.hour > 19 || this.game.hour < 6) j.learn('hound', 'night'); break;
      case 'steal': j.learn('hound', 'handles'); hud.say('<i>It took the axe. IT TOOK THE AXE.</i>', 3); break;
      case 'befriended': j.learn('hound', 'friend'); hud.say('<i>It sits. It looks at me. It looks at my pocket.</i>', 4); break;
      case 'bark': if (this.hound?.state === 'companion') j.learn('hound', 'warn'); break;
      case 'knock': if (this.game.player.pos.distanceTo(pos) < 120) j.learn('bigfoot', 'knock'); break;
      case 'flee': if (this.game.flashOn) j.learn('bigfoot', 'light'); break;
    }
  }

  /** the porch at night: eyes in the dark, or the big one watching from the treeline */
  private eyes: THREE.Group | null = null;
  private menuScare(pos: THREE.Vector3): void {
    const g = this.game;
    if (Math.random() < 0.45 && this.bigfoot) {
      const b = this.bigfoot;
      const p = pos.clone(); p.y = heightAt(p.x, p.z);
      b.object.position.copy(p);
      (b as unknown as { pos?: THREE.Vector3 }).pos?.copy(p);
      b.object.visible = true;
      playSound('bigfoot_branch_break', p, 0.8);
      return;
    }
    if (!this.eyes) {
      this.eyes = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      for (const x of [-0.07, 0.07]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.022), mat); e.position.x = x; this.eyes.add(e); }
      g.scene.add(this.eyes);
    }
    const e = this.eyes;
    const p = pos.clone().multiplyScalar(0.6).add(g.camera.position.clone().multiplyScalar(0.4));
    p.y = heightAt(p.x, p.z) + 0.5 + Math.random() * 1.6;
    e.position.copy(p);
    e.lookAt(g.camera.position);
    e.visible = true;
    e.scale.setScalar(1 + Math.random());
    let t = 0;
    const blink = setInterval(() => {
      t += 0.1;
      e.visible = !(t > 1.2 && t < 1.32) && t < 3.4 + Math.random() * 0.1;
      if (t > 3.6) { clearInterval(blink); e.visible = false; }
    }, 100);
    if (Math.random() < 0.5) playSound('hound_growl', p, 0.35);
  }

  /** the intro: the hound comes for the axe */
  private async introHound(): Promise<void> {
    const h = this.hound;
    if (!h) { this.game.flags.add('hound_fed'); return; }
    this.introActive = true;
    const p = this.game.player.pos;
    const away = new THREE.Vector3(p.x - SPOTS.cabin.x, 0, p.z - SPOTS.cabin.z).normalize().multiplyScalar(16);
    h.pos.set(p.x + away.x, 0, p.z + away.z);
    h.pos.y = heightAt(h.pos.x, h.pos.z);
    h.object.position.copy(h.pos);
    h.object.visible = true;
    h.state = 'wild_lurk';
    this.game.journal.sawCritter('hound');
    hud.say('<i>Something is watching from the edge of the clearing.</i>', 3.5);
    playSound('hound_growl', h.pos, 1);
    // when it lunges at someone holding an axe, the axe goes flying
    const t0 = performance.now();
    const check = (): boolean => {
      if (this.game.flags.has('hound_fed')) return true;
      const near = h.object.position.distanceTo(this.game.player.pos) < 2.4;
      const timed = performance.now() - t0 > 40000;
      if ((h.state === 'lunge' && near) || timed) {
        if (this.game.hands.heldItem === 'axe_old' || this.game.owns('axe_old')) {
          this.game.hands.equip(null);
          this.game.take('axe_old');
          const axe = this.game.toolModel('axe_old');
          const at = this.game.player.pos.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5));
          if (axe) { axe.rotation.set(Math.PI / 2, 0, Math.random() * 6); }
          this.dropItem('axe', at, axe ?? undefined);
          this.game.player.addShake(0.8);
          this.game.R.fx.damage = 0.5;
          hud.say('<i>The axe jumps out of my hands.</i>', 2.5);
        }
        return true;
      }
      return false;
    };
    await new Promise<void>((r) => { const tick = () => { if (check()) r(); else setTimeout(tick, 100); }; tick(); });
    if (!this.game.flags.has('hound_fed')) setTimeout(() => { if (!this.game.flags.has('hound_fed')) hud.say('<i>Ray said jerky. Hold some out (5). Don\'t move.</i>', 4); }, 9000);
  }

  update(dt: number): void {
    const g = this.game;
    if (!this.hound && !this.bigfoot) return;
    this.propT -= dt;
    if (this.propT <= 0) { this.propT = 0.5; this.syncPropItems(); }
    const ctx = this.ctx(dt);
    if (this.hound) {
      const h = this.hound;
      // the hound stays out of the world until the intro's first fire (or free play) and the night
      const allowed = g.flags.has('first_fire') || g.flags.has('free');
      if (!h.object.visible && allowed && (g.hour > 20 || g.hour < 5 || h.state === 'companion')) h.object.visible = true;
      if (h.object.visible) h.update(ctx);
      // the axe comes back when it is done chewing (or fed)
      const carrying = !!(h as unknown as { carrying: unknown }).carrying;
      if (this.wasCarrying && !carrying && this.carried) {
        const o = this.carried;
        this.carried = null;
        const wp = o.getWorldPosition(new THREE.Vector3());
        o.removeFromParent();
        o.scale.setScalar(1);
        o.position.copy(wp); o.position.y = heightAt(wp.x, wp.z) + 0.05;
        o.rotation.set(Math.PI / 2, 0, Math.random() * 6);
        g.scene.add(o);
        import('./interact').then(({ registerInteractable }) => registerInteractable(o, {
          kind: 'pickup', label: () => 'Take back the axe (slobbery)', use: () => { o.removeFromParent(); g.give('axe_old'); chewHandle(g, 'axe_old'); g.hands.equip('axe_old'); hud.say('<i>Teeth marks all down the handle. It still works.</i>', 3); },
        }));
      }
      this.wasCarrying = carrying;
    }
    if (this.gumberoo) {
      const d = this.gumberoo.object.position.distanceTo(g.player.pos);
      this.gumberoo.object.visible = d < 260;
      if (d < 260) this.gumberoo.update(ctx);
    }
    this.wildlife?.update(ctx);
    this.hurt = Math.max(0, this.hurt - dt * 0.01);
    for (const c of this.extra) {
      const d = c.object.position.distanceTo(g.player.pos);
      c.object.visible = d < 220;
      if (d < 220) c.update(ctx);
    }
    if (this.dingbats) { const d = this.dingbats.object.position.distanceTo(g.player.pos); this.dingbats.object.visible = d < 120; if (d < 120) this.dingbats.update(ctx); }
    if (this.granny) this.granny.update(ctx);
    // food left out by the hollow is gone by morning: the big one noticed
    this.offerT -= dt;
    if (this.offerT <= 0) {
      this.offerT = 5;
      const night = g.hour > 21 || g.hour < 5;
      const far = g.player.pos.distanceTo(new THREE.Vector3(SPOTS.hollow.x, g.player.pos.y, SPOTS.hollow.z)) > 60;
      if (night && far) for (const p of propsNear(new THREE.Vector3(SPOTS.hollow.x, heightAt(SPOTS.hollow.x, SPOTS.hollow.z), SPOTS.hollow.z), SPOTS.hollow.r)) {
        if (!p.itemId || p.obj.userData.unpaid || !ITEMS[p.itemId]?.food) continue;
        removeProp(p);
        this.kindness = Math.min(1, this.kindness + 0.3);
        g.flags.add('left_offering');
      }
    }
    if (this.bigfoot) {
      this.bigfoot.update(ctx);
      const d = this.bigfoot.object.position.distanceTo(g.player.pos);
      if (d < 70 && g.sky.darkness > 0.3) {
        this.seenBigfoot += dt;
        if (this.seenBigfoot > 3) { g.journal.sawCritter('bigfoot'); g.journal.learn('bigfoot', 'watch'); }
      }
    }
  }
}
