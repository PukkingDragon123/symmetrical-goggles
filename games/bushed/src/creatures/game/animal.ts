// GAME ANIMALS: white-tailed deer and moose in the world. Real rigged, animated bodies (realbody.ts): a whitetail
// doe and buck and a bull and cow moose, from WildMesh 3D's animated doe, stag and moose (Sketchfab, CC-BY 4.0),
// rebuilt by tools/blender/fauna/cervids.py (public/assets/models/creatures/deer|moose/). Clips: idle, alert,
// graze, walk, limp, trot, run, sprint, flinch, kick, death, dead, lie, bed, rise; a stomp, a snort and a bull's call
// are layered on the alert stance here, with the head turned to the danger, ears swivelled and a deer's white flag.
// Senses, behaviour and hit zones as before.
//
//   const deer = await GameAnimal.create('deer', true);     // a buck (each model loads once, then is cloned)
//   scene.add(deer.object); deer.place(x, z, heading);
//   deer.update(ctx);                                          // every frame (HuntCtx below)
//   const hit = deer.hitTest(a, b);                           // a bullet's path segment -> { zone, t, point } | null
//   deer.shot(hit.zone, hit.point, dir, ctx);                  // what that does to it
//
// SENSES. Hearing: footsteps (walking carries ~35 m, sprinting 80, a slow crouch 6), snapped branches, chopping,
// the rifle (everything for 700 m). Sight: a wide field of view; movement is what it sees (a walking hunter at 70 m,
// crouched and slow at 15, standing still only close up or with a light at night). Scent: downwind of the hunter
// it smells you out to 120 m and is gone. Awareness builds and decays; herd members share it.
// BEHAVIOUR. calm (graze, idle, walk on between patches), alert (head up, ears locked on, a stomp, a snort), flee
// (a deer bounds off with its flag up; a moose trots away, crashing through), and a bull moose in the rut that is
// crowded may bluff-charge. Shot: vitals (heart, lungs) run 30-80 m and fall; the head, neck or spine drop it where it
// stands; a gut or flank shot runs far, beds down and dies slowly (or gets up again if pushed); a leg limps off and
// may live. Every wound bleeds onto the ground (ctx.blood). Hit zones ride the skeleton's bones.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from '../rig';
import type { Fur } from '../fur';
import { RealBody, realAsset, AX, type RealAsset } from './realbody';

export type Species = 'deer' | 'moose';
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
export interface CervidModel {
  species: Species; male: boolean; asset: RealAsset; file: string;
  /** withers height, nose-to-rump length, chest (vitals) height and z, head length, half the body's width, hoof radius */
  dims: { withers: number; length: number; chestY: number; chestZ: number; headLen: number; width: number; hoofR: number };
  tris: number;
  /** texels per metre on the coat (test page) */
  den: number;
}
export const CERVID_FILES: Record<string, string> = { deerM: 'deer/buck.glb', deerF: 'deer/doe.glb', mooseM: 'moose/bull.glb', mooseF: 'moose/cow.glb' };
const SIZE: Record<string, { withers: number; width: number; den: number }> = {
  deerM: { withers: 1.0, width: 0.19, den: 560 }, deerF: { withers: 0.9, width: 0.17, den: 560 },
  mooseM: { withers: 1.85, width: 0.36, den: 380 }, mooseF: { withers: 1.72, width: 0.33, den: 380 },
};
const models = new Map<string, Promise<CervidModel>>();
/** a species' model (loaded once; every animal is a clone) */
export function cervidModelAsync(species: Species, male: boolean, o: { cache?: boolean } = {}): Promise<CervidModel> {
  void o;
  const key = species + (male ? 'M' : 'F');
  let p = models.get(key);
  if (!p) {
    p = realAsset(CERVID_FILES[key], { shineCol: 0xe8f2c0, cull: 1.8 }).then((asset) => {
      const z = SIZE[key], box = asset.box;
      // the vitals: low in the chest just behind the elbow (the top of the foreleg)
      const fl = restPos(asset, 'fl1L'), head = restPos(asset, 'head'), jaw = restPos(asset, 'jaw');
      return {
        species, male, asset, file: CERVID_FILES[key], tris: asset.tris, den: z.den,
        dims: { withers: z.withers, length: box.max.z - box.min.z, chestY: z.withers * 0.6, chestZ: fl.z - z.withers * 0.06, headLen: head.distanceTo(jaw) * 2.2, width: z.width, hoofR: z.width * 0.2 },
      };
    });
    models.set(key, p);
  }
  return p;
}
/** a bone's rest position (model space) from the skin's bind matrices */
function restPos(a: RealAsset, name: string): THREE.Vector3 {
  let out = new THREE.Vector3();
  a.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const i = m.skeleton.bones.findIndex((b) => b.name === name);
    if (i >= 0) out = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(m.skeleton.boneInverses[i]).invert());
  });
  return out;
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
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
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

/** clip names the AI uses -> the model's clips; stomp, snort and call are layers on the alert stance */
const ALIAS: Record<string, string> = { bound: 'sprint', gallop: 'run', stomp: 'alert', snort: 'alert', call: 'alert', limp_idle: 'alert' };
const ONCE = new Set(['flinch', 'kick', 'death', 'lie', 'rise']);
/** how long the layered one-shots last (s) */
const LAYER: Record<string, number> = { stomp: 1.3, snort: 0.9, call: 2.6 };
/** each gait's ground speed at playback rate 1 (m/s, from the clips' hoof travel) */
const NATURAL: Record<Species, Record<string, number>> = {
  deer: { walk: 1.4, limp: 1.0, trot: 2.3, run: 4.6, sprint: 5.8 },
  moose: { walk: 2.0, limp: 1.5, trot: 3.6, run: 7.0, sprint: 9.2 },
};
const GAITS = new Set(['walk', 'limp', 'trot', 'run', 'sprint']);

export class GameAnimal {
  readonly object = new THREE.Group();
  readonly body: RealBody;
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: { bones: THREE.Bone[] };
  /** the clip driver: current (the AI's clip name), done (a one-shot finished), play(name, { restart }) */
  readonly anim: { current: string; done: boolean; clips: Record<string, { loop: boolean }>; play: (name: string, o?: { restart?: boolean }) => void };
  /** no shell fur on the real coats (kept for the hunt code, which turns raycasts off on it) */
  readonly fur: Fur | null = null;
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
  private params = { lookYaw: 0, lookPitch: 0, ear: 0, earYaw: 0, flag: 0, chew: 0 };
  private zones: Zone[] = [];
  private t = 0; private st = 0; private next = 0; private sub = '';
  private target = new THREE.Vector3(); private wantSpeed = 0; private gait = 'walk'; private hold: string | null = null;
  private fleeFrom = new THREE.Vector3(); private fleeLeft = 0; private dieAt = -1; private fallK = 0; private fallSide = 1;
  private bloodDist = 0; private lastPos = new THREE.Vector3(); private stepAcc = 0; private callT = 0;
  private lookAt: THREE.Vector3 | null = null;
  private oneShot: string | null = null; private layer = ''; private layerT = 0; private pitchG = 0;
  private boneInv: THREE.Matrix4[];

  static async create(species: Species, male: boolean): Promise<GameAnimal> { return new GameAnimal(await cervidModelAsync(species, male)); }

  constructor(readonly model: CervidModel) {
    this.k = KIND[model.species];
    this.body = new RealBody(model.asset);
    this.mesh = this.body.mesh;
    this.skel = this.body.skel;
    this.boneInv = this.mesh.skeleton.boneInverses;
    this.object.add(this.body.object);
    this.object.name = model.species === 'deer' ? (model.male ? 'WhitetailBuck' : 'WhitetailDoe') : model.male ? 'BullMoose' : 'CowMoose';
    const clips: Record<string, { loop: boolean }> = {};
    for (const n of model.asset.clips.keys()) clips[n] = { loop: !ONCE.has(n) };
    for (const n of Object.keys(ALIAS)) clips[n] = { loop: !(n in LAYER) };
    const self = this;
    this.anim = {
      current: 'idle', done: false, clips,
      play(name: string, o: { restart?: boolean } = {}) {
        if (name in LAYER) { self.layer = name; self.layerT = 0; this.current = name; this.done = false; return; }
        const real = ALIAS[name] ?? name;
        if (ONCE.has(real) && o.restart) self.oneShot = real;
        self.body.play(real, { once: ONCE.has(real), restart: o.restart, fade: ONCE.has(real) ? 0.15 : 0.35 });
        this.current = name; this.done = false;
      },
    };
    this.body.play('idle', { fade: 0 });
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
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip]?.loop }); }
  get clips(): string[] { return Object.keys(this.anim.clips); }

  // ------------------------------------------------------------------------------------------------ hit zones
  private buildZones() {
    const bones = this.mesh.skeleton.bones, d = this.model.dims, w = d.width;
    const bi = (n: string) => Math.max(0, bones.findIndex((b) => b.name === n));
    const P = (n: string) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(this.boneInv[bi(n)]).invert());
    const z = (name: HitZone, bone: string, a: THREE.Vector3, b: THREE.Vector3, r: number, pri: number) => this.zones.push({ name, bone: bi(bone), a: a.clone(), b: b.clone(), r, pri });
    const s = this.species === 'deer' ? d.withers : d.withers * 1.03;
    // the vitals sit low in the chest, just behind the elbow: heart lowest and forward, lungs above and behind it
    const heart = new THREE.Vector3(0, d.chestY - 0.05 * s, d.chestZ + 0.02 * s);
    z('heart', 'chest', heart, heart, 0.055 * s, 9);
    z('lungs', 'chest', new THREE.Vector3(0, d.chestY + 0.04 * s, d.chestZ - 0.08 * s), new THREE.Vector3(0, d.chestY + 0.05 * s, d.chestZ + 0.06 * s), 0.1 * s, 8);
    const hd = P('head'), jw = P('jaw'), fwd = new THREE.Vector3(0, 0, 1);
    z('head', 'head', hd.clone().add(new THREE.Vector3(0, 0.0, -0.02 * s)), jw.clone().addScaledVector(fwd, 0.1 * s), 0.065 * s, 10);
    z('neck', 'neck2', P('neck1'), P('neck3'), 0.075 * s, 7);
    const ch = P('chest'), pv = P('pelvis');
    z('spine', 'spine2', ch.clone().add(new THREE.Vector3(0, 0.03 * s, 0)), pv.clone().add(new THREE.Vector3(0, 0.03 * s, 0)), 0.04 * s, 7.5);
    z('gut', 'spine1', new THREE.Vector3(0, d.withers * 0.56, ch.z - 0.12 * s), new THREE.Vector3(0, d.withers * 0.6, pv.z + 0.1 * s), w * 0.85, 5);
    z('flank', 'spine1', new THREE.Vector3(0, d.withers * 0.66, d.chestZ + 0.1 * s), new THREE.Vector3(0, d.withers * 0.68, pv.z), w * 1.08, 1);
    for (const sd of ['L', 'R']) {
      z('haunch', 'hl1' + sd, P('hl1' + sd), P('hl2' + sd), 0.07 * s, 4);
      z('leg', 'fl2' + sd, P('fl2' + sd), P('fl3' + sd), 0.035 * s, 3);
      z('leg', 'fl3' + sd, P('fl3' + sd), P('ff' + sd), 0.025 * s, 3);
      z('leg', 'hl2' + sd, P('hl2' + sd), P('hl3' + sd), 0.045 * s, 3);
      z('leg', 'hl3' + sd, P('hl3' + sd), P('hf' + sd), 0.025 * s, 3);
    }
  }
  /** the zones in world space now (debug drawing, the test page) */
  zonesWorld(): { name: HitZone; a: THREE.Vector3; b: THREE.Vector3; r: number }[] {
    this.object.updateMatrixWorld(true);
    const bones = this.mesh.skeleton.bones;
    return this.zones.map((z) => {
      _m.multiplyMatrices(bones[z.bone].matrixWorld, this.boneInv[z.bone]);
      const sc = this.object.scale.x;
      return { name: z.name, a: z.a.clone().applyMatrix4(_m), b: z.b.clone().applyMatrix4(_m), r: z.r * sc };
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
    const dt = Math.min(0.3, Math.max(0, ctx.dt));
    this.t += dt; this.st += dt;
    this.params.chew = 0;
    if (!this.manual) { this.sense(ctx, dt); this.think(ctx, dt); }
    this.move(ctx, dt);
    this.bleedOut(ctx, dt);
    this.animate(ctx, dt);
    // eye shine at night when a light is on the player (the material is shared by the species: the brightest wins)
    const night = ctx.hour > 20 || ctx.hour < 5.5 ? 1 : ctx.hour > 18.5 || ctx.hour < 7 ? 0.4 : 0;
    this.model.asset.fx.shine.value = night * (ctx.player.light ? 1 : 0.15);
    void this.fallSide;
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
    const a = this.params, sp = this.speed, b = this.body;
    let clip: string;
    if (this.manual) clip = ALIAS[this.manual] ?? this.manual;
    else if (this.state === 'dying') clip = this.st < 0 ? (b.current || 'alert') : 'death';
    else if (this.state === 'dead') clip = b.current === 'death' && !b.done ? 'death' : 'dead';
    else if (this.oneShot && b.current === this.oneShot && !b.done) clip = this.oneShot;
    else if (this.hold && sp < 0.15) {
      if (this.hold === 'limp_idle') clip = this.st > 2 ? (b.current === 'bed' || (b.current === 'lie' && b.done) ? 'bed' : 'lie') : 'alert';
      else clip = ALIAS[this.hold] ?? this.hold;
    } else if (sp < 0.12) clip = this.state === 'alert' ? 'alert' : 'idle';
    else if (this.gait === 'limp') clip = 'limp';
    else if (sp < (this.species === 'deer' ? 1.9 : 2.8)) clip = 'walk';
    else if (sp < (this.species === 'deer' ? 4.2 : 6.5) || this.species === 'moose' && this.gait === 'trot') clip = 'trot';
    else clip = this.species === 'deer' ? 'sprint' : 'run';
    if (!b.has(clip)) clip = 'idle';
    if (this.oneShot && clip !== this.oneShot) this.oneShot = null;
    if (clip !== b.current) b.play(clip, { once: ONCE.has(clip), fade: clip === 'dead' ? 0.6 : ONCE.has(clip) ? 0.2 : 0.35 });
    b.speed = GAITS.has(clip) ? clamp(Math.max(sp, 0.3) / NATURAL[this.species][clip], 0.6, 1.9) : 1;
    // the layered one-shots (stomp, snort, call) time out on their own
    if (this.layer) { this.layerT += dt; if (this.layerT > LAYER[this.layer]) { this.layer = ''; this.anim.done = true; } }
    else this.anim.done = b.done;
    if (!this.manual || !(this.manual in LAYER)) this.anim.current = this.layer || clip;
    b.update(dt);
    // the body pitches with the slope under it
    const c = Math.cos(this.heading), s = Math.sin(this.heading), half = this.model.dims.length * 0.3;
    const hf = ctx.heightAt(this.pos.x + s * half, this.pos.z + c * half), hb = ctx.heightAt(this.pos.x - s * half, this.pos.z - c * half);
    this.pitchG = damp(this.pitchG, this.alive && !this.dragged ? clamp(-Math.atan2(hf - hb, half * 2), -0.35, 0.35) : 0, 6, dt);
    this.object.rotation.set(this.pitchG, this.heading, 0, 'YXZ');
    if (!this.alive) return;
    // the look: toward the danger (or the player on the test page)
    const look = this.manual ? ctx.player.pos : this.lookAt;
    let ly = 0, lp = 0;
    if (look) {
      const hx = this.pos.x + s * this.model.dims.length * 0.45, hz = this.pos.z + c * this.model.dims.length * 0.45;
      const yaw = wrapAngle(Math.atan2(look.x - hx, look.z - hz) - this.heading);
      ly = clamp(yaw, -1.2, 1.2) * (Math.abs(yaw) < 2.4 ? 1 : 0);
      lp = clamp(Math.atan2(look.y + 1.2 - (this.pos.y + this.model.dims.withers * 1.2), Math.hypot(look.x - hx, look.z - hz)), -0.4, 0.4);
    }
    const free = clip === 'idle' || clip === 'alert' || clip === 'walk' || clip === 'limp';
    a.lookYaw = damp(a.lookYaw, free ? ly : 0, 3, dt); a.lookPitch = damp(a.lookPitch, free ? lp : 0, 3, dt);
    a.earYaw = damp(a.earYaw, ly * 0.8, 5, dt);
    const B = (n: string) => b.bone(n);
    b.turn(B('neck2'), AX.y, a.lookYaw * 0.35); b.turn(B('head'), AX.y, a.lookYaw * 0.5);
    b.turn(B('head'), AX.x, -a.lookPitch * 0.5);
    // ears: swivelled toward the danger, laid back in flight
    const earBack = this.params.ear < 0 ? this.params.ear * 0.6 : 0;
    b.turn(B('earL'), AX.y, a.earYaw * 0.6); b.turn(B('earR'), AX.y, a.earYaw * 0.6);
    b.turn(B('earL'), AX.x, earBack); b.turn(B('earR'), AX.x, earBack);
    // the white flag: a whitetail's tail goes up when it runs
    a.flag = damp(a.flag, this.params.flag, 6, dt);
    if (this.species === 'deer') { b.turn(B('tail1'), AX.x, a.flag * 1.1); b.turn(B('tail2'), AX.x, a.flag * 0.4); }
    // the layers on the alert stance
    const lt = this.layerT;
    if (this.layer === 'stomp') {
      const lift = Math.max(0, Math.sin(Math.min(1, lt / 0.45) * Math.PI)) + Math.max(0, Math.sin(Math.min(1, Math.max(0, lt - 0.6) / 0.45) * Math.PI));
      b.turn(B('fl1L'), AX.x, -0.45 * lift); b.turn(B('fl2L'), AX.x, 0.7 * lift);
    } else if (this.layer === 'snort') {
      const k = Math.sin(Math.min(1, lt / 0.5) * Math.PI);
      b.turn(B('neck1'), AX.x, -0.25 * k); b.turn(B('head'), AX.x, 0.2 * Math.sin(lt * 30) * k);
    } else if (this.layer === 'call') {
      const k = Math.sin(Math.min(1, lt / LAYER.call) * Math.PI);
      b.turn(B('neck1'), AX.x, -0.4 * k); b.turn(B('head'), AX.x, -0.35 * k); b.turn(B('jaw'), AX.x, 0.25 * k);
    }
  }

  dispose() { this.body.dispose(); this.object.removeFromParent(); }
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
