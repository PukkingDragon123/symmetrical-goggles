// BIRDS of the BUSHED forest: real rigged models (./assets.ts), pooled agents that spawn out of sight around the
// player by place and hour, perch on trees, snags, stumps and logs, forage, sing, scatter and come back.
//   black-capped chickadee  a flock of 4-7 working through the trees together, calling; tame: hold out nuts,
//                           seeds or bannock and stand still and one lands on your hand
//   Canada jay              "whisky jack": 1-3, bold; it comes to a still player holding food and lands on the hand,
//                           then takes the food and flies off to cache it; it raids food left on the ground
//   common raven            on snag tops and the ground, croaking; a gunshot brings ravens in to circle the spot
//   hairy woodpecker        clings to snags (the flying double is the songbird rig in its coat), drums, hitches up
//                           and round the trunk, flies off when you come close
//   ruffed grouse           walks the forest floor, sits tight, then bursts up from under your feet; drums on a
//                           log at dawn
//   common loon             swims the lake, calls at dusk and in the night, dives when you come near or shoot
// Everything scatters at gunshots, falling trees, axe work and running, then settles again; at night the forest
// birds roost (despawn) and only the loons are out.
//   const birds = new Birds(); scene.add(birds.object); await birds.load();
//   birds.update(world);       // every frame (BirdWorld below)
//   birds.scare(pos, radius);  // a gunshot, a falling tree, chopping
//   birds.offer(item, obj)     // food held out to a bird (true when taken)
import * as THREE from 'three';
import { Body, loadBodies, type BirdKind, type BodyId } from './assets';

export type { BirdKind } from './assets';
const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt);
const dampAng = (a: number, b: number, k: number, dt: number) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * (1 - Math.exp(-k * dt)); };

/** food a bird will take from the hand */
export const BIRD_FOODS: Record<'chickadee' | 'jay', string[]> = {
  chickadee: ['nuts', 'seeds', 'bread', 'berries', 'cookies'],
  jay: ['bread', 'nuts', 'jerky', 'cryptid_jerky', 'bacon', 'cookies', 'berries', 'beans', 'fish'],
};

export interface BirdPlayer {
  pos: THREE.Vector3; dir: THREE.Vector3; speed: number; crouch: boolean;
  /** the item in the hands ('' for none) */
  held: string;
  /** where a bird lands on the outstretched hand (world) */
  hand: THREE.Vector3;
  /** seconds the player has stood still */
  still: number;
  /** swinging or chopping right now */
  busy: boolean;
}
export interface Stand { x: number; y: number; z: number; r: number; h: number; crown: number; conifer: boolean; dead: boolean }
export interface Solid { kind: string; shape: string; x: number; y: number; z: number; r: number; h: number; x2?: number; y2?: number; z2?: number }
export interface GroundFood { kind: string; pos: THREE.Vector3; take(): boolean }
export interface BirdWorld {
  dt: number; time: number; hour: number; player: BirdPlayer;
  heightAt(x: number, z: number): number;
  waterY: number;
  lake: { x: number; z: number; r: number };
  /** trees near a point (forest.stands) */
  stands(x: number, z: number, r: number): Stand[];
  /** stumps and logs near a point (ground cover solids) */
  solids(x: number, z: number, r: number): Solid[];
  /** food lying on the ground near a point (for the jays) */
  food(x: number, z: number, r: number): GroundFood[];
  /** remove one of an item from the player (a jay takes it off the hand); false if there is none */
  take(item: string): boolean;
  sound(id: string, pos: THREE.Vector3, vol?: number, rate?: number): void;
  /** a story line / thought (rate-limited by the caller) */
  say(key: string, text: string): void;
  /** the grouse exploding from underfoot */
  startle(k: number): void;
  /** biome mix at a point: 0..1 conifer, birch, burn, density */
  habitat(x: number, z: number): { conifer: number; birch: number; burn: number; density: number };
  /** 0..1 how warm the season still is (insects; the grouse drums less) */
  warmth: number;
}

type State = 'perch' | 'ground' | 'cling' | 'swim' | 'dive' | 'fly' | 'hand' | 'circle' | 'drum' | 'gone';
interface Perch { x: number; y: number; z: number; kind: 'branch' | 'top' | 'snag' | 'stump' | 'log' | 'ground' | 'trunk' | 'water'; tx?: number; tz?: number; tr?: number }

const SPEC: Record<BirdKind, { body: BodyId; flyer?: BodyId; flush: number; speed: number; flapHz: number; cruise: number }> = {
  chickadee: { body: 'chickadee', flush: 2.2, speed: 6, flapHz: 6, cruise: 4 },
  jay: { body: 'jay', flush: 3.0, speed: 7, flapHz: 3.6, cruise: 6 },
  raven: { body: 'raven', flush: 14, speed: 10, flapHz: 1.2, cruise: 16 },
  woodpecker: { body: 'woodpecker', flyer: 'woodfly', flush: 7, speed: 8, flapHz: 5, cruise: 6 },
  grouse: { body: 'grouse', flyer: 'grousefly', flush: 3.6, speed: 11, flapHz: 8, cruise: 1.8 },
  loon: { body: 'loon', flush: 24, speed: 0.35, flapHz: 0, cruise: 0 },
};

export class Bird {
  readonly object = new THREE.Group();
  readonly body: Body;
  readonly flyer: Body | null;
  state: State = 'perch';
  pos = new THREE.Vector3(); vel = new THREE.Vector3(); heading = 0; pitch = 0; roll = 0;
  st = 0; next = 0; t = 0; phase = Math.random();
  perch: Perch | null = null;
  target = new THREE.Vector3(); dest: Perch | null = null; leaving = false;
  flock = -1; called = 0; food = ''; carry = '';
  circleC = new THREE.Vector3(); circleR = 20;
  /** a held-pose woodpecker: angle round its trunk and height */
  around = 0;
  constructor(readonly kind: BirdKind) {
    const s = SPEC[kind];
    this.body = new Body(s.body);
    this.flyer = s.flyer ? new Body(s.flyer) : null;
    this.object.add(this.body.root);
    if (this.flyer) { this.object.add(this.flyer.root); this.flyer.root.visible = false; }
    this.object.name = 'bird:' + kind;
    this.object.userData.creature = true;
    this.object.userData.bird = this;
  }
  get flying(): boolean { return this.state === 'fly' || this.state === 'circle'; }
  /** the model in use (the flying double in the air) */
  get model(): Body { return this.flyer && this.flying ? this.flyer : this.body; }
  showFlyer(on: boolean): void {
    if (!this.flyer) return;
    this.flyer.root.visible = on; this.body.root.visible = !on;
  }
  play(name: string, fade = 0.25, ts = 1, once = false): void { this.model.play(name, fade, ts, once); }
}

export interface BirdsOpts { max?: number; radius?: [number, number]; despawn?: number }

export class Birds {
  readonly object = new THREE.Group();
  readonly active: Bird[] = [];
  private pool = new Map<BirdKind, Bird[]>();
  private o: Required<BirdsOpts>;
  private spawnT = 0;
  private flocks = 0;
  /** scares: the forest is quiet near these for a while */
  private quiet: { x: number; z: number; r: number; until: number }[] = [];
  private loaded = false;
  private time = 0;
  /** test pages: force the population (null = by place and hour) */
  forced: Partial<Record<BirdKind, number>> | null = null;
  /** test pages: nothing flushes at the player's approach */
  calm = false;
  /** events for the game: 'steal', 'hand', 'eat', 'flush', 'dive', 'drum', 'call' with { who, pos, item? } */
  onEvent: ((ev: string, d: { who: BirdKind; pos: THREE.Vector3; item?: string }) => void) | null = null;
  private lastWorld: BirdWorld | null = null;
  constructor(o: BirdsOpts = {}) {
    this.o = { max: o.max ?? 16, radius: o.radius ?? [24, 46], despawn: o.despawn ?? 85 };
    this.object.name = 'Birds';
  }
  async load(): Promise<void> {
    await loadBodies(['chickadee', 'jay', 'woodfly', 'grousefly', 'raven', 'woodpecker', 'grouse', 'loon']);
    this.loaded = true;
  }
  get count(): number { return this.active.length; }

  // ------------------------------------------------------------------ population
  private wants(w: BirdWorld): Partial<Record<BirdKind, number>> {
    if (this.forced) return this.forced;
    const P = w.player.pos, h = ((w.hour % 24) + 24) % 24;
    const day = h > 6 && h < 19.5 ? 1 : 0;
    const hb = w.habitat(P.x, P.z);
    const lakeD = Math.hypot(P.x - w.lake.x, P.z - w.lake.z) - w.lake.r;
    const quiet = this.quiet.some((q) => q.until > this.time && Math.hypot(P.x - q.x, P.z - q.z) < q.r);
    const k = quiet ? 0 : 1;
    return {
      chickadee: k * day * (hb.birch > 0.15 || hb.conifer > 0.4 ? 6 : 4),
      jay: k * day * Math.round(1 + hb.conifer * 1.5),
      raven: k * day * Math.round(0.6 + hb.burn * 2 + Math.random() * 0.4),
      woodpecker: k * day * (h < 16 ? 1 : 0),
      grouse: k * day * Math.round(0.3 + hb.birch * 1.2 + hb.density * 0.4),
      loon: lakeD < 260 ? 2 : 0,
    };
  }
  private take(k: BirdKind): Bird {
    const p = this.pool.get(k);
    const b = p && p.length ? p.pop()! : new Bird(k);
    this.object.add(b.object);
    b.object.visible = true;
    return b;
  }
  private release(b: Bird): void {
    this.object.remove(b.object); b.state = 'gone'; b.flock = -1; b.leaving = false; b.carry = '';
    let p = this.pool.get(b.kind); if (!p) this.pool.set(b.kind, (p = [])); p.push(b);
  }

  // ------------------------------------------------------------------ perches
  /** a perch near (x, z) for this kind of bird: branches in the crown, tree tops, snags, stumps, logs, the ground */
  private findPerch(b: Bird, w: BirdWorld, x: number, z: number, r: number, avoid?: THREE.Vector3): Perch | null {
    const k = b.kind;
    const ok = (px: number, pz: number) => !avoid || Math.hypot(px - avoid.x, pz - avoid.z) > 6;
    if (k === 'loon') {
      // open water round (x, z): deep enough to dive in
      const R = Math.max(r, 25);
      for (let i = 0; i < 16; i++) {
        const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * R;
        const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        if (w.heightAt(px, pz) < w.waterY - 1.2 && ok(px, pz)) return { x: px, y: w.waterY, z: pz, kind: 'water' };
      }
      return null;
    }
    if (k === 'grouse') {
      // the forest floor; at dawn a log to drum on
      const h = w.hour;
      if (h > 5 && h < 10 && Math.random() < 0.6) {
        const logs = w.solids(x, z, r).filter((s) => s.kind === 'log' && ok(s.x, s.z));
        if (logs.length) { const s = logs[(Math.random() * logs.length) | 0]; const mx = (s.x + (s.x2 ?? s.x)) / 2, mz = (s.z + (s.z2 ?? s.z)) / 2, my = (s.y + (s.y2 ?? s.y)) / 2 + s.r * 0.9; return { x: mx, y: my, z: mz, kind: 'log' }; }
      }
      for (let i = 0; i < 8; i++) {
        const a = rnd(0, TAU), d = rnd(r * 0.3, r);
        const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        if (w.heightAt(px, pz) > w.waterY + 0.3 && ok(px, pz)) return { x: px, y: w.heightAt(px, pz), z: pz, kind: 'ground' };
      }
      return null;
    }
    const stands = w.stands(x, z, r).filter((s) => ok(s.x, s.z) && s.h > 3);
    if (k === 'woodpecker') {
      const snags = stands.filter((s) => s.dead);
      const pool = snags.length ? snags : stands.filter((s) => s.r > 0.12);
      if (!pool.length) return null;
      const s = pool[(Math.random() * pool.length) | 0];
      const a = rnd(0, TAU), y = s.y + rnd(1.5, Math.min(6, s.h * 0.6));
      const rr = s.r * (1 - (y - s.y) / Math.max(s.h, 1) * 0.5) + 0.01;
      return { x: s.x + Math.sin(a) * rr, y, z: s.z + Math.cos(a) * rr, kind: 'trunk', tx: s.x, tz: s.z, tr: rr };
    }
    // the ground now and then (jays and ravens forage, chickadees glean the stumps)
    const roll = Math.random();
    if ((k === 'raven' && roll < 0.35) || (k === 'jay' && roll < 0.2)) {
      const a = rnd(0, TAU), d = rnd(r * 0.2, r);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      if (w.heightAt(px, pz) > w.waterY + 0.3 && ok(px, pz)) return { x: px, y: w.heightAt(px, pz), z: pz, kind: 'ground' };
    }
    if (roll > 0.82 && k !== 'raven') {
      const st = w.solids(x, z, r).filter((s) => (s.kind === 'stump' || s.kind === 'log') && ok(s.x, s.z));
      if (st.length) {
        const s = st[(Math.random() * st.length) | 0];
        if (s.kind === 'stump') return { x: s.x + rnd(-0.1, 0.1), y: s.y + s.h, z: s.z + rnd(-0.1, 0.1), kind: 'stump' };
        const t = rnd(0.2, 0.8), lx = s.x + ((s.x2 ?? s.x) - s.x) * t, lz = s.z + ((s.z2 ?? s.z) - s.z) * t, ly = s.y + ((s.y2 ?? s.y) - s.y) * t + s.r;
        return { x: lx, y: ly, z: lz, kind: 'log' };
      }
    }
    if (!stands.length) return null;
    const s = stands[(Math.random() * stands.length) | 0];
    if (k === 'raven' || (k === 'jay' && Math.random() < 0.5)) {
      // a tree top or a snag's broken top
      return { x: s.x, y: s.y + s.h * (s.dead ? 0.98 : 0.93), z: s.z, kind: s.dead ? 'snag' : 'top' };
    }
    // a branch out in the crown
    const a = rnd(0, TAU), out = Math.max(0.25, s.crown * rnd(0.35, 0.75));
    return { x: s.x + Math.sin(a) * out, y: s.y + s.h * rnd(0.3, 0.7), z: s.z + Math.cos(a) * out, kind: 'branch', tx: s.x, tz: s.z };
  }

  private turn = 0;
  /** a group of a kind, perched out of sight; false if there was nowhere for it */
  private spawn(k: BirdKind, w: BirdWorld): boolean {
    const P = w.player.pos;
    const back = Math.atan2(-w.player.dir.x, -w.player.dir.z);
    const a = back + rnd(-1.4, 1.4), d = rnd(this.o.radius[0], this.o.radius[1]);
    let x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
    const n = k === 'chickadee' ? 4 + ((Math.random() * 4) | 0) : k === 'jay' ? 1 + ((Math.random() * 2) | 0) : 1;
    const fl = k === 'chickadee' ? ++this.flocks : -1;
    let placed = 0;
    for (let i = 0; i < n && this.active.length < this.o.max; i++) {
      const b = this.take(k);
      // the loon: out on the water within sight of the player
      const p = k === 'loon' ? this.findPerch(b, w, P.x, P.z, 60) : this.findPerch(b, w, x, z, 9);
      if (!p) { this.release(b); continue; }
      b.flock = fl;
      this.settle(b, p, w);
      b.st = rnd(0, 3); b.next = rnd(0.5, 4); b.t = rnd(0, 10); b.called = rnd(1, 8);
      this.active.push(b);
      x = p.x; z = p.z;
      placed++;
    }
    return placed > 0;
  }

  // ------------------------------------------------------------------ states
  private settle(b: Bird, p: Perch, w: BirdWorld): void {
    b.perch = p; b.pos.set(p.x, p.y, p.z); b.vel.set(0, 0, 0); b.dest = null; b.st = 0; b.next = rnd(1, 4);
    b.showFlyer(false);
    b.pitch = 0; b.roll = 0;
    if (p.kind === 'water') { b.state = 'swim'; b.play('idle', 0.3); return; }
    if (p.kind === 'trunk') {
      b.state = 'cling';
      b.around = Math.atan2(p.x - (p.tx ?? p.x), p.z - (p.tz ?? p.z));
      b.heading = b.around + Math.PI; // facing the bark
      b.play('idle', 0.2);
      return;
    }
    b.state = p.kind === 'ground' || p.kind === 'log' ? 'ground' : 'perch';
    if (p.tx !== undefined) b.heading = Math.atan2(p.x - p.tx, p.z - (p.tz ?? p.z)) + rnd(-0.6, 0.6); // facing out of the crown
    b.play(b.model.has('idle') ? 'idle' : 'idle', 0.3);
    void w;
  }
  /** take off toward a perch (or away, leaving: it despawns once far) */
  private flyTo(b: Bird, p: Perch | null, w: BirdWorld, away?: THREE.Vector3, leave = false): void {
    const s = SPEC[b.kind];
    b.state = 'fly'; b.st = 0; b.perch = null; b.dest = p; b.leaving = leave;
    b.showFlyer(true);
    if (p) b.target.set(p.x, p.y, p.z);
    else {
      const a = away ? Math.atan2(b.pos.x - away.x, b.pos.z - away.z) + rnd(-0.6, 0.6) : rnd(0, TAU);
      b.target.set(b.pos.x + Math.sin(a) * 90, b.pos.y + s.cruise * 2, b.pos.z + Math.cos(a) * 90);
      b.leaving = true;
    }
    const dx = b.target.x - b.pos.x, dz = b.target.z - b.pos.z;
    b.heading = Math.atan2(dx, dz);
    const up = b.kind === 'grouse' ? 4.5 : b.kind === 'raven' ? 2.5 : 2;
    b.vel.set(Math.sin(b.heading) * s.speed * 0.5, up, Math.cos(b.heading) * s.speed * 0.5);
    b.play(b.model.has('takeoff') ? 'takeoff' : 'fly', 0.1, b.kind === 'raven' ? 1.4 : s.flapHz / 1.5);
    void w;
  }
  private dive(b: Bird): void { b.state = 'dive'; b.st = 0; b.next = rnd(18, 35); this.emit('dive', b); }

  /** something loud at `pos`: birds within `r` scatter, and the forest there stays quiet for a while */
  scare(pos: THREE.Vector3, r: number, quietFor = 40): void {
    this.quiet.push({ x: pos.x, z: pos.z, r: r * 0.8, until: this.time + quietFor });
    if (this.quiet.length > 12) this.quiet.shift();
    const w = this.lastWorld;
    for (const b of this.active) {
      const d = b.pos.distanceTo(pos);
      if (d > r || b.state === 'gone') continue;
      if (b.kind === 'loon') { if (b.state === 'swim') this.dive(b); continue; }
      if (b.flying && !b.leaving) { b.leaving = true; continue; }
      if (b.flying) continue;
      if (b.kind === 'grouse' && w) w.startle(Math.max(0, 1 - d / 6) * 0.6);
      if (w) this.flushSound(b, w);
      // most go; ravens may come back to look
      const p = w && Math.random() < 0.35 ? this.findPerch(b, w, b.pos.x + (b.pos.x - pos.x) * 2, b.pos.z + (b.pos.z - pos.z) * 2, 12, pos) : null;
      if (w) this.flyTo(b, p && Math.hypot(p.x - pos.x, p.z - pos.z) > r * 0.8 ? p : null, w, pos, !p);
    }
  }
  /** a gunshot: everything flees, and a raven or two come to circle the spot a little later */
  shot(pos: THREE.Vector3): void {
    this.scare(pos, 90, 60);
    this.ravensTo = pos.clone(); this.ravensT = rnd(14, 24);
  }
  private ravensTo: THREE.Vector3 | null = null; private ravensT = 0;

  /** food held out to a bird: true when a bird on (or right by) the hand takes it */
  offer(item: string, obj?: THREE.Object3D | null): boolean {
    let target: Bird | null = null;
    for (let p: THREE.Object3D | null | undefined = obj; p; p = p.parent) if (p.userData.bird) { target = p.userData.bird as Bird; break; }
    const cands = target ? [target] : this.active.filter((b) => b.state === 'hand');
    for (const b of cands) {
      if (b.kind !== 'jay' && b.kind !== 'chickadee') continue;
      if (!BIRD_FOODS[b.kind].includes(item)) continue;
      if (b.state !== 'hand' && (!this.lastWorld || b.pos.distanceTo(this.lastWorld.player.pos) > 4)) continue;
      b.food = item; b.carry = item; b.st = 0; b.next = 0.9;
      b.state = 'hand';
      b.play('eat', 0.15, 1.4);
      this.emit('eat', b, item);
      return true;
    }
    return false;
  }
  private emit(ev: string, b: Bird, item?: string): void { this.onEvent?.(ev, { who: b.kind, pos: b.object.position, item }); }
  private flushSound(b: Bird, w: BirdWorld): void {
    if (b.kind === 'grouse') w.sound('bird_grouse_drum', b.pos, 1, 1.9);
    else if (b.kind === 'raven') w.sound('bird_raven', b.pos, 0.9);
    else if (b.kind !== 'loon') w.sound('bird_songbird', b.pos, 0.35, b.kind === 'jay' ? 0.8 : 1.25);
    this.emit('flush', b);
  }
  private call(b: Bird, w: BirdWorld): void {
    const id = b.kind === 'raven' ? 'bird_raven' : b.kind === 'loon' ? 'bird_loon' : b.kind === 'woodpecker' ? 'bird_woodpecker' : b.kind === 'grouse' ? 'bird_grouse_drum' : 'bird_songbird';
    const rate = b.kind === 'chickadee' ? rnd(1.1, 1.3) : b.kind === 'jay' ? rnd(0.75, 0.9) : 1;
    w.sound(id, b.pos, b.kind === 'chickadee' ? 0.45 : b.kind === 'jay' ? 0.55 : 1, rate);
    this.emit('call', b);
  }

  // ------------------------------------------------------------------ update
  update(w: BirdWorld): void {
    if (!this.loaded) return;
    this.lastWorld = w;
    const dt = Math.min(0.1, Math.max(0, w.dt)); this.time += dt;
    const P = w.player.pos;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      const d = Math.hypot(b.pos.x - P.x, b.pos.z - P.z);
      const roost = b.kind !== 'loon' && !this.forced && (w.hour < 5.5 || w.hour > 20.5) && d > 30;
      if (b.state === 'gone' || d > this.o.despawn || (roost && b.state !== 'hand')) { this.active.splice(i, 1); this.release(b); }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.5;
      const want = this.wants(w), have = new Map<BirdKind, number>();
      for (const b of this.active) if (!b.leaving) have.set(b.kind, (have.get(b.kind) ?? 0) + 1);
      // one group per tick, starting from a different kind each time (a kind with nowhere to sit cannot starve the rest)
      const kinds = (Object.keys(want) as BirdKind[]).filter((k) => k in SPEC);
      for (let i = 0; i < kinds.length; i++) {
        const k = kinds[(i + this.turn) % kinds.length];
        if ((have.get(k) ?? 0) >= (want[k] ?? 0) || this.active.length >= this.o.max) continue;
        if (this.spawn(k, w)) break;
      }
      this.turn++;
    }
    // a raven comes to see what was shot
    if (this.ravensTo) {
      this.ravensT -= dt;
      if (this.ravensT <= 0) {
        const at = this.ravensTo; this.ravensTo = null;
        const n = 1 + ((Math.random() * 2) | 0);
        for (let i = 0; i < n && this.active.length < this.o.max + 2; i++) {
          const b = this.take('raven');
          const a = rnd(0, TAU);
          b.pos.set(at.x + Math.sin(a) * 60, w.heightAt(at.x, at.z) + 28, at.z + Math.cos(a) * 60);
          b.circleC.set(at.x, w.heightAt(at.x, at.z) + rnd(22, 30), at.z); b.circleR = rnd(14, 22);
          b.state = 'circle'; b.st = 0; b.next = rnd(40, 70); b.heading = a + Math.PI; b.leaving = false; b.called = rnd(2, 5);
          b.vel.set(Math.sin(b.heading) * 9, 0, Math.cos(b.heading) * 9);
          b.play('glide', 0.2);
          this.active.push(b);
        }
      }
    }
    for (const b of this.active) this.think(b, w, dt);
  }

  private think(b: Bird, w: BirdWorld, dt: number): void {
    b.t += dt; b.st += dt;
    const P = w.player, dx = b.pos.x - P.pos.x, dz = b.pos.z - P.pos.z, dist = Math.hypot(dx, dz);
    const s = SPEC[b.kind];
    // how close the player may come: running doubles it, crouching shrinks it
    const flushAt = this.calm ? 0 : s.flush * (P.speed > 4.5 ? 2.2 : P.speed > 2.2 ? 1.4 : 1) * (P.crouch ? 0.6 : 1) * (P.busy ? 2.5 : 1);
    const grounded = b.state === 'perch' || b.state === 'ground' || b.state === 'cling' || b.state === 'drum';
    const hz = (w.hour % 24 + 24) % 24;
    // songs and calls by the hour
    b.called -= dt;
    if (b.called <= 0) {
      let every = 0;
      if (b.kind === 'chickadee') every = hz > 6 && hz < 18.5 ? rnd(5, 14) : 0;
      else if (b.kind === 'jay') every = rnd(10, 25);
      else if (b.kind === 'raven') every = b.state === 'circle' ? rnd(4, 9) : rnd(8, 25);
      else if (b.kind === 'loon') every = (hz > 19 || hz < 2.5) ? rnd(18, 45) : hz < 7.5 ? rnd(30, 70) : 0;
      if (every > 0 && dist < 120) {
        this.call(b, w);
        if (grounded && b.model.has('call')) b.play(Math.random() < 0.5 ? 'call' : 'call2', 0.15, 1.2, true);
        if (b.kind === 'raven' && grounded) b.play('caw', 0.2, 1.3, true);
        b.called = every;
      } else b.called = every || rnd(20, 40);
    }

    switch (b.state) {
      case 'fly': this.flight(b, w, dt); break;
      case 'circle': {
        // a raven circling a shot, croaking, then off to a tree top near it
        const cx = b.circleC.x - b.pos.x, cz = b.circleC.z - b.pos.z;
        const want = Math.atan2(cx, cz) + Math.PI / 2 * 0.92;
        b.heading = dampAng(b.heading, want, 0.9, dt);
        b.vel.set(Math.sin(b.heading) * 8.5, (b.circleC.y - b.pos.y) * 0.4, Math.cos(b.heading) * 8.5);
        b.pos.addScaledVector(b.vel, dt);
        b.roll = damp(b.roll, -0.45, 2, dt); b.pitch = 0;
        if (Math.sin(b.t * 0.5 + b.phase * 6) > 0.85) b.play('fly', 0.4, 1.3); else b.play('glide', 0.6);
        if (b.st > b.next) { const p = this.findPerch(b, w, b.circleC.x, b.circleC.z, 25); this.flyTo(b, p, w, undefined, !p); }
        break;
      }
      case 'swim': {
        // a slow paddle about the lake; dives when you come close
        if (dist < flushAt) { this.dive(b); break; }
        if (b.st > b.next) { b.next = b.st + rnd(4, 10); b.vel.set(rnd(-1, 1), 0, rnd(-1, 1)).setLength(s.speed * rnd(0.3, 1)); }
        _v.copy(b.pos).addScaledVector(b.vel, dt);
        if (w.heightAt(_v.x, _v.z) < w.waterY - 0.5) b.pos.copy(_v); else b.vel.multiplyScalar(-1);
        if (b.vel.lengthSq() > 1e-4) b.heading = dampAng(b.heading, Math.atan2(b.vel.x, b.vel.z), 1.2, dt);
        b.pos.y = w.waterY + Math.sin(b.t * 1.3 + b.phase * 5) * 0.01;
        b.pitch = 0; b.roll = Math.sin(b.t * 0.9) * 0.02;
        b.play('idle', 0.4, 0.8);
        break;
      }
      case 'dive': {
        // under for half a minute, then up again somewhere else on the lake
        if (b.st < 1.2) { b.pos.y = w.waterY - b.st * 0.7; b.pitch = -0.5; b.pos.x += Math.sin(b.heading) * dt * 0.8; b.pos.z += Math.cos(b.heading) * dt * 0.8; }
        b.object.visible = b.st < 1.2;
        if (b.st > b.next && dist > 20) {
          const p = this.findPerch(b, w, b.pos.x, b.pos.z, 45, P.pos);
          if (p) { b.object.visible = true; this.settle(b, p, w); b.pos.y = w.waterY - 0.3; }
          else b.next += 5;
        }
        if ((b.state as State) === 'swim') b.pos.y = w.waterY;
        break;
      }
      case 'hand': this.onHand(b, w, dt); break;
      case 'cling': this.cling(b, w, dt, dist, flushAt); break;
      case 'drum': {
        b.play('drum', 0.3);
        if (b.st > 10 || dist < flushAt * 1.6) { b.state = 'ground'; b.st = 0; b.next = rnd(2, 5); }
        break;
      }
      case 'perch': case 'ground': this.sit(b, w, dt, dist, flushAt); break;
    }
    this.place(b, w, dt);
  }

  /** perched or on the ground: idle, look about, forage, hop between perches, come to food, flee */
  private sit(b: Bird, w: BirdWorld, dt: number, dist: number, flushAt: number): void {
    const P = w.player;
    if (dist < flushAt && !(this.tame(b, w))) {
      if (b.kind === 'grouse') {
        // the burst from underfoot: a thunder of wings at your boots
        w.startle(Math.max(0.25, 1 - dist / 4));
        this.flushSound(b, w);
        w.say('grouse', 'WHUMP-whump-whump-- a grouse, right out from under my boots. My heart.');
        const p = this.findPerch(b, w, b.pos.x + (b.pos.x - P.pos.x) * 8, b.pos.z + (b.pos.z - P.pos.z) * 8, 10, P.pos);
        this.flyTo(b, p, w, P.pos, !p);
        return;
      }
      this.flushSound(b, w);
      const away = _v.set(b.pos.x - P.pos.x, 0, b.pos.z - P.pos.z).normalize();
      const p = this.findPerch(b, w, b.pos.x + away.x * 14, b.pos.z + away.z * 14, 10, P.pos);
      this.flyTo(b, p, w, P.pos, !p || b.kind === 'raven');
      return;
    }
    // food held out by a still player: the tame ones come to the hand
    if ((b.kind === 'jay' || b.kind === 'chickadee') && this.tame(b, w) && dist < 30 && !this.active.some((o) => o !== b && (o.state === 'hand' || (o.state === 'fly' && o.dest?.kind === 'ground' && o.food === 'hand')))) {
      if (P.still > (b.kind === 'jay' ? 1.5 : 3) && Math.random() < dt * (b.kind === 'jay' ? 0.8 : 0.35)) {
        b.food = 'hand';
        this.flyTo(b, { x: P.hand.x, y: P.hand.y, z: P.hand.z, kind: 'ground' }, w);
        this.emit('hand', b);
        return;
      }
    }
    // jays raid food left lying about
    if (b.kind === 'jay' && b.st > b.next && Math.random() < 0.5) {
      const f = w.food(b.pos.x, b.pos.z, 30).find((f) => f.pos.distanceTo(P.pos) > 2.5);
      if (f) { b.carry = ''; b.food = 'steal:' + f.kind; this.stealing.set(b, f); this.flyTo(b, { x: f.pos.x, y: f.pos.y, z: f.pos.z, kind: 'ground' }, w); return; }
    }
    // the grouse drums on its log at dawn
    if (b.kind === 'grouse' && b.perch?.kind === 'log' && w.hour > 5 && w.hour < 10.5 && b.st > b.next && w.warmth > 0.1 && Math.random() < 0.3) {
      b.state = 'drum'; b.st = 0; b.play('drum', 0.3);
      w.sound('bird_grouse_drum', b.pos, 1);
      this.emit('drum', b);
      return;
    }
    if (b.st > b.next) {
      b.next = b.st + rnd(1.5, b.kind === 'chickadee' ? 4 : 8);
      const r = Math.random();
      if (b.kind === 'chickadee' || (b.kind === 'jay' && r < 0.4)) {
        // flit to another perch nearby, drifting with the flock
        const lead = b.flock >= 0 ? this.active.find((o) => o.flock === b.flock) : null;
        const cx = lead && lead !== b ? lead.pos.x : b.pos.x, cz = lead && lead !== b ? lead.pos.z : b.pos.z;
        const p = this.findPerch(b, w, cx + rnd(-3, 3), cz + rnd(-3, 3), 7);
        if (p && Math.hypot(p.x - b.pos.x, p.z - b.pos.z) > 0.8) { this.flyTo(b, p, w); return; }
      }
      if (b.state === 'ground' && b.kind !== 'chickadee' && r < 0.6) {
        // a few steps (or hops) and a peck
        b.heading += rnd(-1.6, 1.6);
        b.vel.set(Math.sin(b.heading), 0, Math.cos(b.heading)).multiplyScalar(b.kind === 'grouse' ? 0.45 : b.kind === 'raven' ? 0.7 : 0.4);
      } else if (r > 0.85 && b.kind !== 'grouse') {
        const p = this.findPerch(b, w, b.pos.x, b.pos.z, 14);
        if (p) { this.flyTo(b, p, w); return; }
      } else b.vel.set(0, 0, 0);
      const idles = ['idle', 'idle2', 'eat', 'eat2'].filter((n) => b.body.has(n));
      const pick = b.state === 'ground' && b.body.has('eat') && Math.random() < 0.5 ? 'eat' : idles[(Math.random() * Math.min(2, idles.length)) | 0];
      if (b.vel.lengthSq() < 1e-4) b.play(pick, 0.3);
    }
    // walking
    if (b.state === 'ground' && b.vel.lengthSq() > 1e-4) {
      b.pos.addScaledVector(b.vel, dt);
      b.pos.y = w.heightAt(b.pos.x, b.pos.z);
      if (b.perch?.kind === 'log') { b.vel.set(0, 0, 0); }
      const sp = b.vel.length();
      b.play(b.kind === 'raven' && sp > 0.9 ? 'run' : 'walk', 0.2, b.kind === 'grouse' ? sp / 0.45 : b.kind === 'raven' ? sp / 0.7 : sp / 0.25);
      if (Math.random() < dt * 0.5) b.vel.set(0, 0, 0);
    }
    if (b.kind === 'grouse' && dist < flushAt * 3 && b.body.cur !== 'alert') b.play('alert', 0.3, 1, true);
  }
  private stealing = new Map<Bird, GroundFood>();
  private tame(b: Bird, w: BirdWorld): boolean {
    if (b.kind !== 'jay' && b.kind !== 'chickadee') return false;
    const P = w.player;
    return BIRD_FOODS[b.kind].includes(P.held) && P.speed < 0.6 && !P.busy;
  }

  /** on the hand: looks at you, then takes the food (or flies off if you move) */
  private onHand(b: Bird, w: BirdWorld, dt: number): void {
    const P = w.player;
    b.pos.copy(P.hand);
    b.heading = Math.atan2(P.pos.x - b.pos.x, P.pos.z - b.pos.z) + Math.sin(b.t * 0.7) * 0.5;
    const spooked = P.speed > 1.0 || P.busy || (!BIRD_FOODS[b.kind as 'jay'].includes(P.held) && !b.carry);
    if (spooked) { b.food = ''; this.flyTo(b, this.findPerch(b, w, P.pos.x, P.pos.z, 10, P.pos), w, P.pos); return; }
    if (!b.carry && b.st > b.next) {
      // it helps itself
      const item = P.held;
      if (w.take(item)) {
        b.carry = item;
        b.play('eat', 0.15, 1.6);
        this.emit('steal', b, item);
        w.say('steal:' + b.kind, b.kind === 'jay' ? 'The whisky jack grabbed a beakful and it\'s off. Cheeky.' : 'Tiny feet, cold as a key. It took a crumb and it\'s gone.');
        b.next = b.st + 0.9;
      } else { b.food = ''; this.flyTo(b, null, w, P.pos); }
      return;
    }
    if (b.carry && b.st > b.next) {
      // off to cache it in a tree
      b.food = '';
      const p = this.findPerch(b, w, P.pos.x + rnd(-15, 15), P.pos.z + rnd(-15, 15), 10, P.pos);
      this.flyTo(b, p, w, P.pos);
      return;
    }
    if (!b.carry && b.body.cur !== 'eat') b.play(Math.random() < 0.5 ? 'idle' : 'idle2', 0.3);
    void dt;
  }

  /** a woodpecker on its trunk: drums, pecks, hitches up and round, flies when you come close */
  private cling(b: Bird, w: BirdWorld, dt: number, dist: number, flushAt: number): void {
    const p = b.perch!;
    if (dist < flushAt) {
      // round to the far side of the trunk first if it can, then off
      if (b.st > 0.5 && Math.random() < 0.4 && dist > flushAt * 0.5) {
        const far = Math.atan2(w.player.pos.x - (p.tx ?? 0), w.player.pos.z - (p.tz ?? 0)) + Math.PI;
        b.around = dampAng(b.around, far, 2.5, dt);
      } else { this.flushSound(b, w); this.flyTo(b, this.findPerch(b, w, b.pos.x, b.pos.z, 30, w.player.pos), w, w.player.pos); return; }
    }
    if (b.st > b.next) {
      b.next = b.st + rnd(2, 6);
      const r = Math.random();
      if (r < 0.4) { b.play('drum', 0.1, 1, true); w.sound('bird_woodpecker', b.pos, 0.9); this.emit('drum', b); }
      else if (r < 0.65) b.play('peck', 0.2);
      else if (r < 0.85) { b.play('hitch', 0.1, 1, true); p.y += 0.12; b.around += rnd(-0.4, 0.4); }
      else if (r < 0.93) { this.flyTo(b, this.findPerch(b, w, b.pos.x, b.pos.z, 25), w); return; }
      else b.play('idle', 0.3);
    }
    if (b.body.done) b.play('idle', 0.3);
    const tr = p.tr ?? 0.2;
    b.pos.set((p.tx ?? p.x) + Math.sin(b.around) * (tr + 0.02), p.y, (p.tz ?? p.z) + Math.cos(b.around) * (tr + 0.02));
    b.heading = b.around + Math.PI;
  }

  /** flight: climb out, cruise (flap and glide), come down onto the perch */
  private flight(b: Bird, w: BirdWorld, dt: number): void {
    const s = SPEC[b.kind];
    // follow a moving hand
    if (b.food === 'hand') b.target.copy(w.player.hand);
    _v.subVectors(b.target, b.pos);
    const dh = Math.hypot(_v.x, _v.z), dd = _v.length();
    const ground = w.heightAt(b.pos.x, b.pos.z);
    // cruise height: up over the trees on long legs, straight in on short hops
    const cruiseY = dh > 10 ? Math.max(b.target.y, ground + s.cruise) : b.target.y;
    const wantY = dh > 4 ? cruiseY : b.target.y;
    const sp = s.speed * (dh < 6 ? Math.max(0.35, dh / 6) : 1);
    _w.set(_v.x / Math.max(dh, 1e-3) * sp, (wantY - b.pos.y) * (dh < 4 ? 2.5 : 1.2), _v.z / Math.max(dh, 1e-3) * sp);
    if (b.kind === 'grouse' && b.st < 0.6) _w.y = Math.max(_w.y, 3.5);
    b.vel.lerp(_w, 1 - Math.exp(-(dh < 3 ? 6 : 2.5) * dt));
    b.pos.addScaledVector(b.vel, dt);
    if (b.pos.y < ground + 0.05 && dh > 1) b.pos.y = ground + 0.05;
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (hs > 0.2) b.heading = dampAng(b.heading, Math.atan2(b.vel.x, b.vel.z), 6, dt);
    b.pitch = damp(b.pitch, -Math.atan2(b.vel.y, Math.max(hs, 0.5)) * 0.6, 5, dt);
    // flap and glide by kind: ravens soar, songbirds bound (flap bursts), the grouse whirrs then sails
    const glide = b.kind === 'raven' ? Math.sin(b.t * 0.7 + b.phase * 9) > 0.1 && b.vel.y < 1 :
      b.kind === 'grouse' ? b.st > 1.4 && Math.sin(b.t * 2.2) > -0.2 :
        dh > 3 && Math.sin(b.t * 9 + b.phase * 9) > 0.55;
    if (b.model.cur === 'takeoff' && b.st < 0.6) { /* let the take-off play */ }
    else if (glide && dh > 2.5) b.play('glide', 0.12);
    else b.play('fly', 0.12, b.kind === 'raven' ? 1.5 : s.flapHz / 1.5);
    // arrived
    if (!b.leaving && dd < Math.max(0.12, sp * dt * 1.5)) {
      if (b.food === 'hand') { b.state = 'hand'; b.st = 0; b.next = rnd(2.5, 4.5); b.carry = ''; b.showFlyer(false); b.pitch = 0; b.play('idle', 0.2); this.emit('hand', b); return; }
      const f = this.stealing.get(b);
      if (f) {
        this.stealing.delete(b);
        if (f.take()) {
          b.carry = f.kind; this.emit('steal', b, f.kind);
          if (b.pos.distanceTo(w.player.pos) < 40) w.say('jaysteal', `Hey! That whisky jack just made off with my ${f.kind === 'bread' ? 'bannock' : f.kind}.`);
        }
        b.food = '';
      }
      if (b.dest) this.settle(b, b.dest, w); else { b.leaving = true; }
    }
    if (b.leaving && (b.st > 25 || b.pos.distanceTo(w.player.pos) > this.o.despawn)) b.state = 'gone';
  }

  private place(b: Bird, w: BirdWorld, dt: number): void {
    const o = b.object;
    o.position.copy(b.pos);
    if (b.state === 'cling') {
      // the woodpecker sits upright against the bark, tail braced: tip the scan's perched pose back
      _e.set(-0.62, b.heading, 0, 'YXZ');
      o.quaternion.setFromEuler(_e);
      // its feet are its root; push it out by its belly so it does not sink into the trunk
      o.position.x -= Math.sin(b.heading) * 0.035; o.position.z -= Math.cos(b.heading) * 0.035;
    } else {
      if (!b.flying) { b.pitch = damp(b.pitch, 0, 6, dt); b.roll = damp(b.roll, 0, 6, dt); }
      _e.set(b.pitch, b.heading, b.roll, 'YXZ');
      o.quaternion.setFromEuler(_e);
    }
    // cheap far away: the skeleton updates less often past 35 m
    const d = b.pos.distanceTo(w.player.pos);
    const m = b.model;
    m.acc += dt;
    if (d < 35 || m.acc > 0.06) { m.update(m.acc); m.acc = 0; }
  }
}
