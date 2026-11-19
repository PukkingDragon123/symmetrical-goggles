// GAME ANIMALS: white-tailed deer and moose in the world. Model (model.ts), clips (clips.ts), shell fur
// (src/creatures/fur), senses, behaviour and hit zones.
//
//   const deer = await GameAnimal.create('deer', true);     // a buck (models build once, cached in IndexedDB)
//   scene.add(deer.object); deer.place(x, z, heading);
//   deer.update(ctx);                                          // every frame (HuntCtx below)
//   const hit = deer.hitTest(a, b);                           // a bullet's path segment -> { zone, t, point } | null
//   deer.shot(hit.zone, hit.point, dir, ctx);                  // what that does to it
//
// SENSES. Hearing: footsteps (walking carries ~35 m, sprinting 80, a slow crouch 6), snapped branches, chopping,
// the rifle (everything for 700 m). Sight: a wide field of view; movement is what it sees (a walking hunter at 70 m,
// crouched and slow at 15, standing still only close up or with a light at night). Scent: downwind of the hunter
// it smells you out to 120 m and is gone. Awareness builds and decays; herd members share it.
// BEHAVIOUR. calm (graze, idle, walk on between patches), alert (head up, ears locked on, a stomp, a snort, the
// white-tail's head bob), flee (a deer bounds off with its flag up; a moose trots away, crashing through), and a
// bull moose in the rut that is crowded may bluff-charge. Shot: vitals (heart, lungs) run 30-80 m and fall; the
// head, neck or spine drop it where it stands; a gut or flank shot runs far, beds down and dies slowly (or gets up
// again if pushed); a leg limps off and may live. Every wound bleeds onto the ground (ctx.blood).
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, dampAngle, wrapAngle, type CreatureFx } from '../rig';
import { Animator, FOOT, type AnimParams } from '../animator';
import { cacheGet, cachePut, pack, unpack } from '../cache';
import { furTextureFrom } from '../anatomy';
import { addFur, type Fur } from '../fur';
import { buildCervidAsync, CERVID_MODEL_VERSION, type CervidModel, type Species } from './model';
import { cervidClips, CH_BLINK } from './clips';

export type { Species };
export type AnimalState = 'calm' | 'alert' | 'flee' | 'charge' | 'wounded' | 'bedded' | 'dying' | 'dead';
export type HitZone = 'heart' | 'lungs' | 'head' | 'neck' | 'spine' | 'gut' | 'flank' | 'haunch' | 'leg';

/** what the animals need from the world each frame */
export interface HuntCtx {
  dt: number; time: number; hour: number;
  player: { pos: THREE.Vector3; speed: number; crouch: boolean; light: boolean; sprint: boolean };
  /** loud things this frame: { pos, level 0..1 (1 = a rifle shot), kind } */
  noises: { pos: THREE.Vector3; level: number; kind: string }[];
  /** the wind: direction it blows toward (xz, unit) and strength 0..1 */
  wind: { x: number; z: number; k: number };
  heightAt(x: number, z: number): number;
  trunks?(x: number, z: number, r: number): { x: number; z: number; r: number }[];
  waterY: number;
  /** a sound or a beat: 'snort', 'stomp', 'call', 'grunt', 'crash', 'fall', 'flee', 'hit' ... with { pos, who } */
  emit(ev: string, data: { pos: THREE.Vector3; who: GameAnimal; [k: string]: unknown }): void;
  /** a wound bled here: amount 0..1 (a heavy pulse 1), the kind of blood */
  blood?(pos: THREE.Vector3, amount: number, kind: 'bright' | 'frothy' | 'dark'): void;
  /** a hoof stamped the ground */
  print?(x: number, z: number, heading: number, depth: number): void;
}

// ------------------------------------------------------------------------------------------------ models
const models = new Map<string, Promise<CervidModel>>();
/** a species' model (built once in ~30 ms slices, then cached in IndexedDB) */
export function cervidModelAsync(species: Species, male: boolean, o: { cache?: boolean } = {}): Promise<CervidModel> {
  const key = `${species}${male ? 'M' : 'F'}@${CERVID_MODEL_VERSION}`;
  let p = models.get(key);
  if (!p) {
    p = (async () => {
      if (o.cache !== false) {
        const c = await cacheGet(key);
        if (c) {
          const b = unpack(c), m = c.meta as Record<string, unknown>;
          const fd = m.fur as Uint8Array | null;
          return { ...b, species, male, bones: m.bones as CervidModel['bones'], tris: m.tris as number, den: m.den as number, furLen: m.furLen as number, dims: m.dims as CervidModel['dims'], fur: fd ? furTextureFrom(fd, c.W, c.H) : undefined };
        }
      }
      const m = await buildCervidAsync(species, male);
      if (o.cache !== false) {
        const fd = m.fur ? new Uint8Array((m.fur.image as { data: Uint8Array }).data) : null;
        cachePut(key, pack(m, { bones: m.bones, tris: m.tris, den: m.den, furLen: m.furLen, dims: m.dims, fur: fd })).catch(() => undefined);
      }
      return m;
    })();
    models.set(key, p);
  }
  return p;
}

// ------------------------------------------------------------------------------------------------ tuning
interface Kind {
  walk: number; trot: number; flee: number; stride: { walk: number; trot: number; bound: number; gallop: number };
  hear: number; see: number; smell: number; flight: number; blood: number; mass: number;
}
const KIND: Record<Species, Kind> = {
  deer: { walk: 1.0, trot: 3.2, flee: 10.5, stride: { walk: 0.95, trot: 1.5, bound: 3.4, gallop: 2.6 }, hear: 1, see: 1, smell: 1, flight: 1, blood: 1, mass: 70 },
  moose: { walk: 1.5, trot: 4.6, flee: 8.5, stride: { walk: 1.8, trot: 2.85, bound: 6.4, gallop: 4.9 }, hear: 0.8, see: 0.55, smell: 1.2, flight: 0.6, blood: 2.5, mass: 420 },
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _t = new THREE.Vector3(), _pole = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** a herd: members follow the leader and share their alarm */
export class Herd {
  readonly members: GameAnimal[] = [];
  get leader(): GameAnimal | null { return this.members.find((m) => m.state !== 'dead' && m.state !== 'dying' && m.state !== 'wounded' && m.state !== 'bedded') ?? null; }
  /** raise everyone's alarm to at least `k` from a source */
  alarm(k: number, from: THREE.Vector3, flee: boolean) {
    for (const m of this.members) m.alarm(k, from, flee, false);
  }
}

interface Zone { name: HitZone; bone: number; a: THREE.Vector3; b: THREE.Vector3; r: number; pri: number }

export class GameAnimal {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: Skel;
  readonly anim: Animator;
  readonly fx: CreatureFx;
  readonly fur: Fur | null;
  readonly k: Kind;
  state: AnimalState = 'calm';
  /** 0 calm .. 1 bolting; where it thinks the danger is */
  awareness = 0;
  readonly danger = new THREE.Vector3();
  readonly pos = new THREE.Vector3();
  heading = 0; speed = 0;
  herd: Herd | null = null;
  /** blood left (1 healthy; it falls at 0.35), bleeding per second, wounds taken */
  blood = 1; bleed = 0; readonly wounds: HitZone[] = [];
  /** set when it is down: field dressed, dragged */
  dressed = false; dragged = false;
  /** the test page drives clips by hand */
  manual: string | null = null;
  /** time since it last moved its home patch; the patch it grazes round */
  readonly home = new THREE.Vector3();
  id = 0;
  private params: AnimParams = { speed: 0, phase: 0, lookYaw: 0, lookPitch: 0, ear: 0, earYaw: 0, flag: 0, chew: 0 };
  private legs: { up: number; lo: number; mid: number; foot: number; ankle: THREE.Vector3; mid0: THREE.Vector3; fore: boolean }[];
  private bi: Record<string, number>;
  private zones: Zone[] = [];
  private t = 0; private st = 0; private next = 0; private sub = ''; private blinkT = 2; private blink = 0;
  private target = new THREE.Vector3(); private wantSpeed = 0; private gait = 'walk'; private hold: string | null = null;
  private fleeFrom = new THREE.Vector3(); private fleeLeft = 0; private dieAt = -1; private fallK = 0; private fallSide = 1;
  private bloodDist = 0; private lastPos = new THREE.Vector3(); private stepAcc = 0; private callT = 0;
  private ground = new Float32Array(4);
  private vel = new THREE.Vector3(); private prevRoot = new THREE.Vector3();
  private lookAt: THREE.Vector3 | null = null;

  static async create(species: Species, male: boolean): Promise<GameAnimal> { return new GameAnimal(await cervidModelAsync(species, male)); }

  constructor(readonly model: CervidModel) {
    this.k = KIND[model.species];
    this.skel = new Skel(model.bones);
    const { mat, depth, fx } = creatureMaterial(model.tex, model.sd, { shineCol: 0xe8f2c0 });
    this.fx = fx;
    this.mesh = this.skel.mesh(model.geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.customDepthMaterial = depth;
    this.mesh.frustumCulled = false;
    this.object.add(this.mesh);
    this.object.name = model.species === 'deer' ? (model.male ? 'WhitetailBuck' : 'WhitetailDoe') : model.male ? 'BullMoose' : 'CowMoose';
    this.anim = new Animator(cervidClips(this.skel.defs, model.species), this.skel.bones.length, 4);
    this.anim.play('idle');
    this.bi = this.skel.idx;
    const S = this.skel, rw = S.restWorld;
    this.legs = (['f', 'h'] as const).flatMap((pre) => (['L', 'R'] as const).map((s) => ({
      up: S.i(pre + 'u' + s), lo: S.i(pre + 'l' + s), mid: S.i(pre + 'm' + s), foot: S.i(pre + 'f' + s),
      ankle: rw[S.i(pre + 'f' + s)].clone(), mid0: rw[S.i(pre + 'm' + s)].clone(), fore: pre === 'f',
    })));
    // fur: shells over the coat, springs on the tail and the ears
    this.fur = model.fur ? addFur(this.mesh, {
      length: model.furLen, mask: model.fur, shells: model.species === 'deer' ? 12 : 14, density: 0.85, clump: 5, rootDark: 0.55,
      comb: [0, -0.2, -0.5], hz: model.species === 'deer' ? 3.2 : 2.2, damping: 0.3, droop: 0.25, wind: 0.5, fins: 0.35,
      springs: [{ bones: ['tail0'], hz: 3.5 }, { bones: ['earL', 'earR'], hz: 4.5 }], lod: [6, 28, 48],
    }) : null;
    this.buildZones();
  }

  get species(): Species { return this.model.species; }
  get male(): boolean { return this.model.male; }
  get alive(): boolean { return this.state !== 'dead' && this.state !== 'dying'; }
  get down(): boolean { return this.state === 'dead'; }

  place(x: number, z: number, heading: number, y?: number) {
    this.pos.set(x, y ?? 0, z); this.heading = heading; this.home.copy(this.pos); this.lastPos.copy(this.pos);
    this.object.position.copy(this.pos); this.object.rotation.set(0, heading, 0);
  }
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip].loop }); }
  get clips(): string[] { return Object.keys(this.anim.clips); }

  // ------------------------------------------------------------------------------------------------ hit zones
  private buildZones() {
    const S = this.skel, rw = S.restWorld, d = this.model.dims, w = d.width;
    const P = (n: string) => rw[S.i(n)];
    const z = (name: HitZone, bone: string, a: THREE.Vector3, b: THREE.Vector3, r: number, pri: number) => this.zones.push({ name, bone: S.i(bone), a: a.clone(), b: b.clone(), r, pri });
    const deer = this.species === 'deer', s = deer ? 1 : 1.9;
    // the vitals sit low in the chest, just behind the elbow: heart lowest and forward, lungs above and behind it
    const heart = new THREE.Vector3(0, d.chestY - 0.05 * s, d.chestZ + 0.02 * s);
    z('heart', 'chest', heart, heart, 0.055 * s, 9);
    z('lungs', 'chest', new THREE.Vector3(0, d.chestY + 0.04 * s, d.chestZ - 0.08 * s), new THREE.Vector3(0, d.chestY + 0.05 * s, d.chestZ + 0.06 * s), 0.1 * s, 8);
    z('head', 'head', P('head').clone().add(new THREE.Vector3(0, -0.02 * s, 0.04 * s)), P('head').clone().add(new THREE.Vector3(0, -0.08 * s, 0.16 * s)), 0.065 * s, 10);
    z('neck', 'neck', P('neck'), P('neck2'), 0.07 * s, 7);
    z('spine', 'root', new THREE.Vector3(0, P('chest').y + 0.13 * s, P('chest').z), new THREE.Vector3(0, P('loin').y + 0.13 * s, P('loin').z), 0.035 * s, 7.5);
    z('gut', 'root', new THREE.Vector3(0, P('root').y - 0.06 * s, P('root').z + 0.06 * s), new THREE.Vector3(0, P('loin').y - 0.06 * s, P('loin').z), w * 0.85, 5);
    z('flank', 'root', new THREE.Vector3(0, P('root').y, P('chest').z + 0.12 * s), new THREE.Vector3(0, P('pelvis').y, P('pelvis').z), w * 1.08, 1);
    for (const sd of ['L', 'R']) {
      z('haunch', 'hu' + sd, P('hu' + sd), P('hl' + sd), 0.07 * s, 4);
      z('leg', 'fl' + sd, P('fl' + sd), P('fm' + sd), 0.035 * s, 3);
      z('leg', 'fm' + sd, P('fm' + sd), P('ff' + sd), 0.025 * s, 3);
      z('leg', 'hl' + sd, P('hl' + sd), P('hm' + sd), 0.045 * s, 3);
      z('leg', 'hm' + sd, P('hm' + sd), P('hf' + sd), 0.025 * s, 3);
    }
  }
  /** the zones in world space now (debug drawing, the test page) */
  zonesWorld(): { name: HitZone; a: THREE.Vector3; b: THREE.Vector3; r: number }[] {
    this.object.updateMatrixWorld(true);
    const S = this.skel;
    return this.zones.map((z) => {
      const bm = S.bones[z.bone].matrixWorld, rest = S.restWorld[z.bone];
      const sc = this.object.scale.x;
      return { name: z.name, a: _v.copy(z.a).sub(rest).applyMatrix4(bm).clone(), b: _v.copy(z.b).sub(rest).applyMatrix4(bm).clone(), r: z.r * sc };
    });
  }
  /** a bullet's path segment a -> b against the zones: the most telling zone it crosses, where it went in (t 0..1) */
  hitTest(a: THREE.Vector3, b: THREE.Vector3): { zone: HitZone; t: number; point: THREE.Vector3 } | null {
    // cheap reject: the segment against a bounding sphere
    const c = _v.copy(this.object.position).add(_w.set(0, this.model.dims.withers * 0.6, 0));
    const R = this.model.dims.length * 0.75 + 0.2;
    if (segPoint(a, b, c) > R) return null;
    let best: { zone: HitZone; pri: number } | null = null, tmin = Infinity;
    for (const z of this.zonesWorld()) {
      const h = segSeg(a, b, z.a, z.b);
      if (h.d > z.r) continue;
      // where the bullet enters this zone (back off along the path by the chord's half length)
      const L = a.distanceTo(b) || 1, half = Math.sqrt(Math.max(0, z.r * z.r - h.d * h.d)) / L;
      const te = Math.max(0, h.s - half);
      tmin = Math.min(tmin, te);
      const pri = this.zones.find((q) => q.name === z.name)!.pri;
      if (!best || pri > best.pri) best = { zone: z.name, pri };
    }
    if (!best) return null;
    return { zone: best.zone, t: tmin, point: a.clone().lerp(b, tmin) };
  }

  /** the animal is hit: wounds, bleeding, flight, death */
  shot(zone: HitZone, point: THREE.Vector3, dir: THREE.Vector3, ctx: HuntCtx) {
    if (this.state === 'dead') { this.fur?.shake(0.6); return; }
    this.wounds.push(zone);
    this.fur?.shake(1);
    const from = point.clone().addScaledVector(dir, -30);
    ctx.emit('hit', { pos: point.clone(), who: this, zone });
    const pulse = (n: number, kind: 'bright' | 'frothy' | 'dark') => ctx.blood?.(point.clone().setY(ctx.heightAt(point.x, point.z)), n, kind);
    switch (zone) {
      case 'head': case 'neck': case 'spine':
        this.die(ctx, 0.15); pulse(1, 'bright'); return;
      case 'heart':
        this.bleed += 0.16; pulse(1, 'bright'); this.dieAt = this.t + 3.5 + Math.random() * 3; break;
      case 'lungs':
        this.bleed += 0.1; pulse(0.9, 'frothy'); this.dieAt = this.t + 5 + Math.random() * 4; break;
      case 'haunch': this.bleed += 0.02; pulse(0.6, 'bright'); break;
      case 'gut': this.bleed += 0.0065; pulse(0.35, 'dark'); break;
      case 'flank': this.bleed += 0.008; pulse(0.4, 'dark'); break;
      case 'leg': this.bleed += 0.008; pulse(0.4, 'bright'); break;
    }
    if (this.state === 'dying') return;
    // a heart-shot deer kicks and bolts; everything else just goes
    this.state = 'wounded'; this.st = 0; this.sub = 'run'; this.hold = null;
    this.fleeFrom.copy(from); this.fleeLeft = zone === 'heart' || zone === 'lungs' ? 40 + Math.random() * 40 : zone === 'leg' ? 160 : 120 + Math.random() * 120;
    this.awareness = 1;
    if (this.species === 'deer' && (zone === 'heart' || zone === 'lungs')) this.anim.play('kick', { restart: true });
    else this.anim.play('flinch', { restart: true });
    this.herd?.alarm(1, from, true);
    ctx.emit('flee', { pos: this.pos.clone(), who: this });
  }

  /** raise alarm (from a noise, the herd); flee says bolt now */
  alarm(k: number, from: THREE.Vector3, flee: boolean, share = true) {
    if (!this.alive || this.state === 'wounded' || this.state === 'bedded') return;
    if (k > this.awareness) { this.awareness = k; this.danger.copy(from); }
    if (flee && this.state !== 'flee' && this.state !== 'charge') {
      this.state = 'flee'; this.st = 0; this.fleeFrom.copy(from); this.fleeLeft = (90 + Math.random() * 80) * this.k.flight; this.hold = null;
    }
    if (share && this.herd) this.herd.alarm(k * 0.9, from, flee);
  }

  private die(ctx: HuntCtx, delay = 0) {
    if (this.state === 'dying' || this.state === 'dead') return;
    this.state = 'dying'; this.st = -delay; this.fallK = 0; this.fallSide = Math.random() < 0.5 ? 1 : -1;
    this.anim.play('death', { restart: true });
    this.wantSpeed = 0;
    ctx.emit('fall', { pos: this.pos.clone(), who: this });
  }

  // ------------------------------------------------------------------------------------------------ per frame
  update(ctx: HuntCtx) {
    const dt = Math.min(0.1, Math.max(0, ctx.dt));
    this.t += dt; this.st += dt;
    this.params.chew = 0;
    if (!this.manual) { this.sense(ctx, dt); this.think(ctx, dt); }
    this.move(ctx, dt);
    this.bleedOut(ctx, dt);
    this.animate(ctx, dt);
    // eye shine at night when a light is on the player
    const night = ctx.hour > 20 || ctx.hour < 5.5 ? 1 : ctx.hour > 18.5 || ctx.hour < 7 ? 0.4 : 0;
    this.fx.shine.value = this.alive ? night * (ctx.player.light ? 1 : 0.15) : 0;
    if (this.fur) {
      this.object.updateMatrixWorld(true);
      const rv = _v.copy(this.object.position).sub(this.prevRoot).divideScalar(Math.max(dt, 1e-3));
      this.prevRoot.copy(this.object.position);
      this.fur.update(dt, rv);
    }
  }

  // ------------------------------------------------------------------------------------------------ senses
  private sense(ctx: HuntCtx, dt: number) {
    if (!this.alive || this.state === 'wounded' && this.sub === 'run') return;
    const P = ctx.player, dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz) + 1e-3;
    let gain = 0;
    // hearing: the hunter's feet (crouched and slow is near silent), and every noise this frame
    const step = P.speed < 0.25 ? 0 : P.sprint ? 80 : P.crouch ? (P.speed < 1.0 ? 6 : 14) : P.speed < 1.6 ? 26 : 38;
    if (step > 0 && dist < step * this.k.hear) gain += (1 - dist / (step * this.k.hear)) * 0.9 * dt * (this.state === 'calm' ? 1 : 1.5);
    for (const n of ctx.noises) {
      const d = n.pos.distanceTo(this.pos), reach = (n.kind === 'shot' ? 700 : 25 + n.level * 140) * this.k.hear;
      if (d > reach) continue;
      const k = (1 - d / reach) * n.level;
      if (n.kind === 'shot') { this.alarm(1, n.pos, d < 450 || Math.random() < 0.5); continue; }
      gain += k * 1.2;
      if (k > 0.35) this.danger.copy(n.pos);
    }
    // sight: movement inside the field of view (all but straight behind)
    const rel = wrapAngle(Math.atan2(dx, dz) - this.heading);
    if (Math.abs(rel) < 2.6) {
      const mv = P.speed > 2.2 ? 85 : P.speed > 0.8 ? (P.crouch ? 28 : 65) : P.speed > 0.15 ? (P.crouch ? 13 : 30) : 9;
      const night = ctx.hour > 20.5 || ctx.hour < 5 ? 0.45 : 1;
      let reach = mv * this.k.see * night * (this.state === 'alert' ? 1.4 : 1);
      if (P.light && night < 1) reach = Math.max(reach, 70);
      if (dist < reach) gain += (1 - dist / reach) * 1.4 * dt * (Math.abs(rel) < 1 ? 1.4 : 0.8);
    }
    // scent: downwind of the hunter
    const wx = ctx.wind.x, wz = ctx.wind.z, down = (-dx * wx - dz * wz) / dist;
    const smell = 120 * this.k.smell * (0.4 + 0.6 * ctx.wind.k);
    if (down > 0.7 && dist < smell) gain += (1 - dist / smell) * 2.5 * dt * (down - 0.6);
    if (gain > 0) { this.awareness = Math.min(1, this.awareness + gain); this.danger.copy(P.pos); }
    else this.awareness = Math.max(0, this.awareness - dt * (this.state === 'alert' ? 0.04 : 0.08));
    if (gain > 0 && this.herd && this.awareness > 0.4) for (const m of this.herd.members) if (m !== this && m.alive) m.awareness = Math.max(m.awareness, this.awareness * 0.85);
  }

  // ------------------------------------------------------------------------------------------------ behaviour
  private go(s: AnimalState) { if (s !== this.state) { this.state = s; this.st = 0; this.sub = ''; this.hold = null; } }
  private emit(ctx: HuntCtx, ev: string, extra: Record<string, unknown> = {}) { ctx.emit(ev, { pos: this.pos.clone().setY(this.pos.y + this.model.dims.withers), who: this, ...extra }); }

  private think(ctx: HuntCtx, dt: number) {
    const P = ctx.player, dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const leader = this.herd?.leader;
    this.lookAt = null;
    switch (this.state) {
      case 'calm': {
        if (this.awareness > 0.4) { this.go('alert'); this.emitFirstAlert(ctx); break; }
        // a herd follows its leader at a few body lengths; the leader wanders between feeding patches
        if (leader && leader !== this) {
          const off = (this.id % 3) - 1, back = 3 + (this.id % 2) * 2.5;
          _v.set(Math.sin(leader.heading), 0, Math.cos(leader.heading));
          this.target.set(leader.pos.x - _v.x * back + _v.z * off * 2.5, 0, leader.pos.z - _v.z * back - _v.x * off * 2.5);
          const far = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
          if (far > 2.5) { this.wantSpeed = far > 8 ? this.k.trot * 0.7 : this.k.walk; this.gait = far > 8 ? 'trot' : 'walk'; this.hold = null; }
          else { this.wantSpeed = 0; this.hold = leader.hold === 'graze' || this.id % 2 ? 'graze' : 'idle'; }
          break;
        }
        if (this.sub === '' || this.sub === 'move' && Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 1.2) {
          this.sub = 'feed'; this.st = 0; this.next = 8 + Math.random() * 18;
        }
        if (this.sub === 'feed') {
          this.wantSpeed = 0; this.hold = Math.floor(this.st / 9) % 3 === 2 ? 'idle' : 'graze';
          if (this.species === 'moose' && this.male && this.st > 4 && this.t - this.callT > 40 && Math.random() < dt * 0.02 && (ctx.hour < 9 || ctx.hour > 17)) { this.callT = this.t; this.anim.play('call', { restart: true }); this.hold = 'call'; this.emit(ctx, 'call'); }
          if (this.st > this.next) {
            // on to the next patch, roughly round the home spot
            const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 16;
            this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r);
            this.sub = 'move'; this.st = 0; this.hold = null;
          }
        }
        if (this.sub === 'move') { this.wantSpeed = this.k.walk; this.gait = 'walk'; if (this.st > 25) this.sub = ''; }
        break;
      }
      case 'alert': {
        this.wantSpeed = 0; this.lookAt = this.danger; this.hold = this.hold === 'stomp' || this.hold === 'snort' ? (this.anim.done ? 'alert' : this.hold) : 'alert';
        // turn to face it
        const pa = Math.atan2(this.danger.x - this.pos.x, this.danger.z - this.pos.z);
        if (Math.abs(wrapAngle(pa - this.heading)) > 1.3) this.heading = dampAngle(this.heading, pa, 1.2, dt);
        if (this.st > this.next) {
          this.next = this.st + 2.5 + Math.random() * 3;
          const r = Math.random();
          if (r < 0.35) { this.hold = 'stomp'; this.anim.play('stomp', { restart: true }); setTimeout(() => this.emit(ctx, 'stomp'), 200); setTimeout(() => this.emit(ctx, 'stomp'), 800); }
          else if (r < 0.65) { this.hold = 'snort'; this.anim.play('snort', { restart: true }); this.emit(ctx, this.species === 'deer' ? 'snort' : 'grunt'); }
        }
        // a rutting bull crowded close may bluff-charge
        if (this.species === 'moose' && this.male && dist < 16 && this.awareness > 0.75 && this.st > 2 && Math.random() < dt * 0.3) { this.go('charge'); this.emit(ctx, 'grunt'); break; }
        if (this.awareness > 0.85 || dist < (this.species === 'deer' ? 18 : 9)) { this.alarm(1, this.danger, true); this.emit(ctx, this.species === 'deer' ? 'snort' : 'crash'); this.herd?.alarm(1, this.danger, true); break; }
        if (this.awareness < 0.2 && this.st > 6) this.go('calm');
        break;
      }
      case 'charge': {
        this.target.set(P.pos.x, 0, P.pos.z); this.wantSpeed = this.k.trot * 1.3; this.gait = 'trot'; this.lookAt = P.pos;
        this.params.ear = -1;
        if (dist < 4.5 || this.st > 5) {
          this.emit(ctx, 'charge_stop', { hitPlayer: dist < 2.2 });
          this.alarm(1, P.pos, true); this.fleeLeft = 50;
        }
        break;
      }
      case 'flee': {
        // away from the danger, with a swerve; a deer bounds, a moose trots and crashes through the brush
        const away = Math.atan2(this.pos.x - this.fleeFrom.x, this.pos.z - this.fleeFrom.z) + Math.sin(this.t * 0.4 + this.id) * 0.35;
        this.target.set(this.pos.x + Math.sin(away) * 20, 0, this.pos.z + Math.cos(away) * 20);
        this.wantSpeed = this.k.flee * (this.species === 'deer' ? 1 : 0.85); this.gait = this.species === 'deer' ? 'bound' : 'trot';
        this.params.flag = this.species === 'deer' ? 1 : 0;
        this.fleeLeft -= this.speed * dt;
        if (this.species === 'moose' && Math.random() < dt * 0.6) this.emit(ctx, 'crash');
        if (this.fleeLeft <= 0) { this.home.copy(this.pos); this.awareness = 0.45; this.go('alert'); this.next = 3; }
        break;
      }
      case 'wounded': {
        if (this.sub === 'run') {
          const away = Math.atan2(this.pos.x - this.fleeFrom.x, this.pos.z - this.fleeFrom.z) + Math.sin(this.t * 0.3 + this.id) * 0.5;
          this.target.set(this.pos.x + Math.sin(away) * 20, 0, this.pos.z + Math.cos(away) * 20);
          const leg = this.wounds.includes('leg') || this.wounds.includes('haunch');
          this.wantSpeed = leg ? this.k.trot * 0.8 : this.k.flee * 0.85; this.gait = leg ? 'limp' : this.species === 'deer' ? 'bound' : 'trot';
          this.params.flag = 0;
          this.fleeLeft -= this.speed * dt;
          if (this.fleeLeft <= 0) {
            this.sub = 'bed'; this.st = 0; this.home.copy(this.pos);
            // a leg wound that stopped bleeding: it walks on, a survivor
            if (this.wounds.every((w) => w === 'leg') && this.bleed < 0.004) { this.awareness = 0.5; this.go('alert'); }
          }
        } else {
          // bedded down, head low, watching its back trail; up and off again if pushed
          this.wantSpeed = 0; this.hold = 'limp_idle';
          if (dist < 28 && ctx.player.speed > 0.4 && this.blood > 0.5) { this.sub = 'run'; this.fleeLeft = 80 + Math.random() * 60; this.fleeFrom.copy(P.pos); this.emit(ctx, 'flee'); }
        }
        break;
      }
      case 'dying': {
        this.wantSpeed = 0;
        if (this.st >= 0) {
          this.fallK = Math.min(1, this.fallK + dt / 0.9);
          if (this.st > 3.4) { this.go('dead'); this.anim.play('dead'); }
        }
        break;
      }
      case 'dead': this.wantSpeed = 0; break;
      case 'bedded': break;
    }
    if (this.state !== 'charge' && this.state !== 'flee' && this.state !== 'wounded') this.params.flag = this.state === 'alert' && this.species === 'deer' ? 0.3 : 0;
    this.params.ear = this.state === 'alert' ? 1 : this.state === 'flee' || this.state === 'wounded' ? -0.6 : this.state === 'charge' ? -1 : 0;
    if (this.state === 'calm' && this.awareness > 0.15) this.params.ear = 0.6;
    if (this.state !== 'alert' && this.awareness > 0.2) this.lookAt = this.danger;
  }
  private emitFirstAlert(ctx: HuntCtx) { this.next = 1.5 + Math.random() * 2; if (Math.random() < 0.4) { this.anim.play('snort', { restart: true }); this.hold = 'snort'; this.emit(ctx, this.species === 'deer' ? 'snort' : 'grunt'); } }

  /** bleeding, blood trail, death from blood loss */
  private bleedOut(ctx: HuntCtx, dt: number) {
    if (this.bleed <= 0 || this.state === 'dead') return;
    const moving = this.speed > 0.5 ? 1.8 : 1;
    this.blood -= this.bleed * moving * dt / this.k.blood;
    // leg wounds clot
    if (this.wounds.every((w) => w === 'leg') && this.st > 25) this.bleed = Math.max(0, this.bleed - dt * 0.0005);
    if (this.alive && (this.blood < 0.35 || (this.dieAt > 0 && this.t > this.dieAt))) this.die(ctx);
    // drops on the ground: more where it ran, pools where it stood
    const d = this.pos.distanceTo(this.lastPos);
    this.lastPos.copy(this.pos);
    this.bloodDist += d + dt * 0.3;
    const every = clamp(0.25 / Math.max(this.bleed * 6, 0.02), 0.6, 5);
    if (this.bloodDist > every && ctx.blood) {
      this.bloodDist = 0;
      const kind = this.wounds.includes('lungs') ? 'frothy' : this.wounds.includes('gut') || this.wounds.includes('flank') ? 'dark' : 'bright';
      const side = (Math.random() - 0.5) * this.model.dims.width * 1.4;
      const p = new THREE.Vector3(this.pos.x + Math.cos(this.heading) * side, 0, this.pos.z - Math.sin(this.heading) * side);
      p.y = ctx.heightAt(p.x, p.z);
      ctx.blood(p, clamp(this.bleed * 8, 0.15, 1) * (this.speed > 0.5 ? 1 : 1.6), kind);
    }
  }

  // ------------------------------------------------------------------------------------------------ movement
  private move(ctx: HuntCtx, dt: number) {
    if (this.manual) {
      const m = this.manual, S = this.k.stride;
      this.speed = m === 'walk' ? this.k.walk : m === 'trot' ? this.k.trot : m === 'bound' ? this.k.flee : m === 'gallop' ? this.k.flee * 0.8 : m === 'limp' ? this.k.walk * 0.9 : 0;
      void S;
    } else if (this.state !== 'dying' && this.state !== 'dead') {
      const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
      let want = this.wantSpeed;
      if (d < 0.4) want = 0; else want = Math.min(want, d * 1.5 + 0.4);
      let desired = Math.atan2(tx, tz);
      // steer round trunks ahead and away from deep water
      if (want > 0.2 && ctx.trunks) {
        const look = 1.5 + this.speed * 0.6, ax = this.pos.x + Math.sin(this.heading) * look, az = this.pos.z + Math.cos(this.heading) * look;
        for (const t of ctx.trunks(ax, az, 2.2)) {
          const ox = t.x - this.pos.x, oz = t.z - this.pos.z, ahead = ox * Math.sin(this.heading) + oz * Math.cos(this.heading);
          if (ahead < 0 || ahead > look + 1) continue;
          const lat = ox * Math.cos(this.heading) - oz * Math.sin(this.heading);
          if (Math.abs(lat) < t.r + this.model.dims.width + 0.25) desired += (lat > 0 ? 0.9 : -0.9) * (1 - ahead / (look + 1));
        }
      }
      if (want > 0.2) {
        const ax = this.pos.x + Math.sin(desired) * 3, az = this.pos.z + Math.cos(desired) * 3;
        if (ctx.heightAt(ax, az) < ctx.waterY + (this.species === 'moose' ? -0.5 : 0.15)) desired += 1.2;
      }
      const err = wrapAngle(desired - this.heading);
      if (want > 0) this.heading = dampAngle(this.heading, desired, want > 4 ? 2.4 : 3, dt);
      want *= clamp(1.3 - Math.abs(err) * 0.5, 0.3, 1);
      this.speed = damp(this.speed, want, want > this.speed ? (this.state === 'flee' || this.state === 'wounded' ? 4 : 2.5) : 5, dt);
      const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt, nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
      this.pos.x = nx; this.pos.z = nz;
    } else this.speed = damp(this.speed, 0, 3, dt) * (this.state === 'dead' ? 0 : 1);
    if (this.state === 'dying' && this.speed > 0.05) { this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt; }
    if (!this.dragged) this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.object.position.copy(this.pos);
    this.object.rotation.set(0, this.heading, 0);
    // hoof prints when it walks
    if (this.speed > 0.3 && ctx.print) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > (this.species === 'deer' ? 0.45 : 0.75)) { this.stepAcc = 0; const s = Math.random() < 0.5 ? 1 : -1, w = this.model.dims.width * 0.6; ctx.print(this.pos.x + Math.cos(this.heading) * w * s, this.pos.z - Math.sin(this.heading) * w * s, this.heading, this.speed > 4 ? 0.25 : 0.12); }
    }
  }

  // ------------------------------------------------------------------------------------------------ animation
  private animate(ctx: HuntCtx, dt: number) {
    const a = this.params, sp = this.speed, St = this.k.stride;
    let clip: string;
    if (this.manual) clip = this.manual;
    else if (this.state === 'dying') clip = 'death';
    else if (this.state === 'dead') clip = 'dead';
    else if (this.anim.current === 'kick' && !this.anim.done) clip = 'kick';
    else if (this.anim.current === 'flinch' && !this.anim.done) clip = 'flinch';
    else if (this.hold && sp < 0.15) clip = this.hold === 'limp_idle' ? 'alert' : this.hold;
    else if (sp < 0.12) clip = this.state === 'alert' ? 'alert' : 'idle';
    else if (this.gait === 'limp') clip = 'limp';
    else if (sp < (this.species === 'deer' ? 1.7 : 2.6)) clip = 'walk';
    else if (sp < (this.species === 'deer' ? 4.2 : 6.5) || this.species === 'moose' && this.gait === 'trot') clip = 'trot';
    else clip = this.species === 'deer' ? 'bound' : 'gallop';
    if (!this.anim.clips[clip]) clip = 'idle';
    this.anim.play(clip);
    const stride = clip === 'walk' || clip === 'limp' ? St.walk : clip === 'trot' ? St.trot : clip === 'bound' ? St.bound : clip === 'gallop' ? St.gallop : 1;
    if (['walk', 'trot', 'bound', 'gallop', 'limp'].includes(this.anim.current)) a.phase = (a.phase + (sp / stride) * dt) % 1;
    a.speed = sp;
    // the look: toward the danger (or the player on the test page)
    const look = this.manual ? ctx.player.pos : this.lookAt;
    let ly = 0, lp = 0;
    if (look) {
      const hx = this.pos.x + Math.sin(this.heading) * this.model.dims.length * 0.45, hz = this.pos.z + Math.cos(this.heading) * this.model.dims.length * 0.45;
      const yaw = wrapAngle(Math.atan2(look.x - hx, look.z - hz) - this.heading);
      ly = clamp(yaw, -1.3, 1.3) * (Math.abs(yaw) < 2.4 ? 1 : 0);
      lp = clamp(Math.atan2(look.y + 1.2 - (this.pos.y + this.model.dims.withers * 1.2), Math.hypot(look.x - hx, look.z - hz)), -0.5, 0.5);
    }
    a.lookYaw = damp(a.lookYaw, ly, 3, dt); a.lookPitch = damp(a.lookPitch, lp, 3, dt);
    a.earYaw = damp(a.earYaw ?? 0, ly * 0.8, 5, dt);
    const p = this.anim.update(dt, a);
    // blinking
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.16; this.blinkT = 2 + Math.random() * 5; }
    this.blink = Math.max(0, this.blink - dt);
    const blinkK = this.alive ? Math.max(p.c[CH_BLINK], this.blink > 0 ? Math.sin((this.blink / 0.16) * Math.PI) : 0) : 0.35;
    // ground under each hoof
    const g0 = this.pos.y;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    for (let k = 0; k < 4; k++) {
      const L = this.legs[k], fx = L.ankle.x + p.f[k * FOOT], fz = L.ankle.z + p.f[k * FOOT + 2];
      this.ground[k] = this.alive ? clamp(ctx.heightAt(this.pos.x + fx * c + fz * s, this.pos.z - fx * s + fz * c) - g0, -0.35, 0.35) : 0;
    }
    const span = this.legs[0].ankle.z - this.legs[2].ankle.z;
    const slope = Math.atan2((this.ground[0] + this.ground[1]) * 0.5 - (this.ground[2] + this.ground[3]) * 0.5, span);
    this.applyPose(p, blinkK, slope, (this.ground[0] + this.ground[1] + this.ground[2] + this.ground[3]) * 0.25);
  }

  private applyPose(p: ReturnType<Animator['update']>, blink: number, slope: number, lift: number) {
    const S = this.skel, B = S.bones;
    S.rest();
    const root = B[0];
    root.position.x += p.t[0]; root.position.y += p.t[1] + lift; root.position.z += p.t[2];
    root.quaternion.setFromEuler(_e.set(p.rr[0] - slope, p.rr[1], p.rr[2]));
    for (let i = 1; i < B.length; i++) {
      const x = p.r[i * 3], y = p.r[i * 3 + 1], z = p.r[i * 3 + 2];
      if (x !== 0 || y !== 0 || z !== 0) B[i].quaternion.setFromEuler(_e.set(x, y, z));
    }
    // the fall: over onto one side, the head and the legs laid out
    const fk = this.state === 'dead' ? 1 : this.fallK;
    if (fk > 0) {
      const e = fk * fk * (3 - 2 * fk), side = this.fallSide;
      const w = this.model.dims.width;
      root.position.y = root.position.y * (1 - e) + (w * 1.05 + 0.02) * e;
      _q.setFromEuler(_e.set(0, 0, side * e * 1.45));
      root.quaternion.premultiply(_q);
      for (const n of ['neck', 'neck2', 'head']) B[this.bi[n]].quaternion.multiply(_q2.setFromEuler(_e.set(0.15 * e, -side * 0.35 * e, 0)));
      // the upper legs droop onto the lower ones
      for (const L of this.legs) { const up = (this.skel.restWorld[L.up].x > 0 ? 1 : -1) === side; B[L.up].quaternion.multiply(_q2.setFromEuler(_e.set(0, 0, (up ? -0.25 : 0.1) * side * e))); }
    }
    // lids and eyes
    const lid = 0.12 + blink * 1.35;
    for (const sd of ['L', 'R']) {
      const sgn = sd === 'L' ? 1 : -1;
      // the lid closes about the axis across the eye (up x the eye's axis)
      _w.set(sgn * 0.85, -0.15, 0.5).normalize();
      B[this.bi['lid' + sd]].quaternion.setFromAxisAngle(_v.set(0, 1, 0).cross(_w).normalize(), lid);
      B[this.bi['eye' + sd]].quaternion.setFromEuler(_e.set(-this.params.lookPitch * 0.3, this.params.lookYaw * 0.25, 0));
    }
    S.fk();
    if (fk >= 0.999 && this.state === 'dead') return;
    // legs: two-bone IK to the cannon's top, the cannon keeping its rest slant tipped by the clip
    for (let k = 0; k < 4; k++) {
      const L = this.legs[k], o = k * FOOT, w = clamp(p.f[o + 3], 0, 1) * (1 - fk);
      if (w < 0.002) continue;
      const par = S.defs[L.up].parent;
      _t.set(L.ankle.x + p.f[o], L.ankle.y + p.f[o + 1] + this.ground[k] - lift, L.ankle.z + p.f[o + 2]);
      const fwd = _v.set(0, 0, 1).applyQuaternion(S.Q[par]);
      const yawQ = _q.setFromAxisAngle(_w.set(0, 1, 0), Math.atan2(fwd.x, fwd.z));
      _pole.set(0, 0, L.fore ? -1 : 1).applyQuaternion(yawQ);
      const qm = new THREE.Quaternion().copy(yawQ).multiply(_q2.setFromEuler(_e.set(-p.f[o + 4], 0, 0)));
      const midT = _w.copy(L.ankle).sub(L.mid0).applyQuaternion(qm).multiplyScalar(-1).add(_t);
      S.ik2(L.up, L.lo, L.mid, midT, _pole, w);
      const fkm = S.Q[L.mid].clone();
      S.orient(L.mid, qm.slerp(fkm, 1 - w));
      S.fk1(L.foot);
      const fkf = S.Q[L.foot].clone();
      // the pastern and hoof: level on the ground in stance, flipped back in the swing
      S.orient(L.foot, new THREE.Quaternion().copy(yawQ).multiply(_q2.setFromEuler(_e.set(clamp(-p.f[o + 4] * 0.9, -0.2, 1.6), 0, 0))).slerp(fkf, 1 - w));
    }
    void _m;
  }

  dispose() { this.fur?.dispose(); this.object.removeFromParent(); }
}

// ------------------------------------------------------------------------------------------------ geometry
/** distance from a point to a segment */
function segPoint(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3): number {
  const ab = _t.copy(b).sub(a), L2 = ab.lengthSq() || 1e-9;
  const t = clamp(_w.copy(p).sub(a).dot(ab) / L2, 0, 1);
  return _w.copy(a).addScaledVector(ab, t).distanceTo(p);
}
/** closest approach of two segments: distance and the parameter on the first */
function segSeg(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): { d: number; s: number } {
  const d1 = new THREE.Vector3().subVectors(q1, p1), d2 = new THREE.Vector3().subVectors(q2, p2), r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return { d: r.length(), s: 0 };
  if (a <= 1e-9) { t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s), c2 = p2.clone().addScaledVector(d2, t);
  return { d: c1.distanceTo(c2), s };
}
