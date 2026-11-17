// Creatures in the game world: builds the CreatureCtx from the game every frame, routes their events to sounds,
// the journal (rules you discover by watching) and story beats, and runs the intro's woodpile encounter: the
// hound lunges, Ray's axe goes flying, the hound runs off with it to chew the handle, and jerky settles it.
import * as THREE from 'three';
import type { Game } from './game';
import { AxehandleHound, Bigfoot, Gumberoo, Wildlife, HOUND_SOUND, BIGFOOT_SOUND, GUMBEROO_SOUND, giftMesh, preloadCreatures, type CreatureCtx, type GroundItem } from '../creatures';
import { SPOTS, heightAt } from '../world/layout';
import { audio } from '../audio/audio';
import { SOUNDS } from '../audio/bank';
import { hud } from '../ui/hud';
import { makePhysical, propsNear, removeProp } from './physprops';
import { ITEMS } from './items';
import { anchorPos } from './flow';

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

export class Critters {
  hound: AxehandleHound | null = null;
  bigfoot: Bigfoot | null = null;
  gumberoo: Gumberoo | null = null;
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

  constructor(private game: Game) {
    game.events.on('offer', (o: { item: string; obj: THREE.Object3D; taken: boolean }) => {
      if (!this.hound) return;
      for (let p: THREE.Object3D | null = o.obj; p; p = p.parent) if (p === this.hound.object) {
        if (this.hound.offer('jerky')) {
          o.taken = true;
          this.kindness = Math.min(1, this.kindness + 0.25);
          game.journal.learn('hound', 'jerky');
          if (this.introActive) game.flags.add('hound_fed');
        }
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
        pos: p.pos.clone(), dir, held: heldKind, crouch: p.crouch, noise: Math.min(1, p.speed / 5 + (g.hands?.charging ? 0.3 : 0) + (performance.now() - g.lastSwingAt < 500 ? 0.4 : 0)),
        light: g.flashOn, speed, action: performance.now() - g.lastSwingAt < 450 ? 'swing' : g.hands?.charging ? 'chop' : undefined,
      },
      fires: g.fires.filter((f) => f.level() > 0.1).map((f) => f.pos),
      heightAt,
      emit: (ev, data) => this.onEvent(ev, data as Record<string, unknown> | undefined),
      stove: anchorPos(g, 'stove', new THREE.Vector3(SPOTS.cabin.x, heightAt(SPOTS.cabin.x, SPOTS.cabin.z), SPOTS.cabin.z)),
      items: this.items,
      takeItem: (id) => {
        const i = this.items.findIndex((x) => x.id === id);
        if (i < 0) return false;
        const it = this.items[i];
        this.items.splice(i, 1);
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

  private onEvent(ev: string, data?: Record<string, unknown>): void {
    const pos = (data?.pos as THREE.Vector3 | undefined) ?? this.hound?.object.position ?? this.game.player.pos;
    const who = data?.who as string | undefined;
    const table = (who === 'gumberoo' ? GUMBEROO_SOUND : who === 'bigfoot' ? BIGFOOT_SOUND : who === 'hound' || !who ? HOUND_SOUND : {}) as Record<string, string | undefined>;
    const snd = data?.sound as string | undefined ?? table[ev];
    playSound(snd, pos);
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
    if (!this.game.flags.has('hound_fed')) setTimeout(() => { if (!this.game.flags.has('hound_fed')) hud.say('<i>Ray said jerky. Hold some out. Don\'t move.</i>', 4); }, 9000);
  }

  update(dt: number): void {
    const g = this.game;
    if (!this.hound && !this.bigfoot) return;
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
          kind: 'pickup', label: () => 'Take back the axe (slobbery)', use: () => { o.removeFromParent(); g.give('axe_old'); g.hands.equip('axe_old'); hud.say('<i>Teeth marks all down the handle. It still works.</i>', 3); },
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
