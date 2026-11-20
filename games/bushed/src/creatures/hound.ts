// THE AXEHANDLE HOUND, now a real dog: a scruffy black-and-tan shepherd mutt that hangs round the camp. The camp
// stories call it the Axehandle Hound because it steals axes and chews the handles; it is just a dog (Wisconsin and
// Minnesota lumber-camp lore, Cox 1910, made a camp dog of it). Body: public/assets/models/creatures/dog/dog.glb, a
// German Shepherd ("Police Dog" by Chenchanchong, Sketchfab, CC-BY 4.0) with its vest taken off, rebaked onto a 69-bone
// game rig by tools/blender/fauna/dog.py; clips idle, walk, trot, run, stalk, bark, sleep, sit, snarl, happy, alert
// from the source and beg, catch, chew, shake, howl, dig, lunge, flinch, wiggle authored there. On top of the clips:
// the head turns to what it watches, the tail wags with its mood, the jaw pants or snarls, the ears perk or pin, it
// blinks, and its eyes shine green in a flashlight at night.
//
//   await houndModelAsync();           // (preloadCreatures does it) the model must be loaded before it shows
//   const hound = new AxehandleHound({ pos: new THREE.Vector3(12, 0, -8) });
//   scene.add(hound.object);
//   hound.update(ctx);                 // every frame (CreatureCtx from ./types)
//   if (hound.offer('jerky')) ...      // the player holds out jerky: true if the hound takes it
//
// States: wild_lurk -> (jerky held) curious -> (offer) eat -> ... trust 1 -> befriended -> companion.
//   wild_lurk  night: circles the player at the edge of the light, eyes glinting, growling; day: watches from afar
//   lunge      a feint: charges, snaps short. No harm if the player stands still or holds out jerky ('bite' otherwise)
//   curious    jerky in the player's hand: creeps closer, sniffing, ready to bolt
//   eat        catches and chews the jerky; trust rises
//   befriended the moment it decides: a whole-body wiggle ('befriended')
//   companion  follows, sniffs about, sits while you chop, barks at danger, steals and chews axe handles left on the
//              ground (carried in its mouth: the 'jaw' bone in mesh.skeleton.bones is a mouth socket, x across the
//              muzzle, z forward), begs for jerky, sleeps by the stove at night, howls at the moon now and then
// Events (ctx.emit(ev, { pos, who: 'hound', sound, ... })): growl, snarl, snap, bite (damage), lunge_feint, bark, whine,
// sniff, chew, crunch, howl, yip, steal, befriended, dig, eat (item), happy, shake. `sound` is a suggested
// src/audio/bank.ts id (HOUND_SOUND).
// favoriteFood 'jerky': offer('jerky') (or sausage / bacon / meat) returns true when it takes it.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from './rig';
import type { Mood } from './expression';
import { RealBody, realAsset, realAssetNow, clipPose, AX, type RealAsset } from './game/realbody';
import { setPusher } from '../gfx/globals';
import { SPOTS } from '../world/layout';
import type { CreatureCtx, GroundItem } from './types';

/** the sound-bank id (src/audio/bank.ts) suggested for each event; events without one are story beats */
export const HOUND_SOUND: Record<string, string | undefined> = {
  growl: 'hound_growl', snarl: 'hound_snarl', bark: 'hound_bark', whine: 'hound_whine', sniff: 'hound_sniff', yip: 'hound_yip',
  chew: 'hound_chew', crunch: 'hound_chew', snap: 'hound_ting', bite: 'hound_ting', lunge_feint: 'hound_snarl', steal: 'hound_ting',
  eat: 'hound_chew', happy: 'hound_yip', shake: 'hound_sniff',
};
/** what the hound will take from the hand (the first is its favourite) */
export const HOUND_FOODS = ['jerky', 'sausage', 'bacon', 'meat'];
export type HoundState = 'wild_lurk' | 'lunge' | 'curious' | 'eat' | 'befriended' | 'companion';

export const HOUND_FILE = 'dog/dog.glb';
/** the hound's model when loaded (null before houndModelAsync / preloadCreatures has finished) */
export function houndModel(): RealAsset | null { return realAssetNow(HOUND_FILE); }
/** load the hound's model (once; cached by the browser) */
export function houndModelAsync(o: { cache?: boolean } = {}): Promise<RealAsset> { void o; return realAsset(HOUND_FILE, { shineCol: 0xd8f28a, cull: 2.2 }).then(mouthSocket); }
/** the real jaw becomes 'jawbone' (its clip tracks too), so the name 'jaw' is free for the mouth socket each hound adds */
function mouthSocket(a: RealAsset): RealAsset {
  if (a.scene.userData.jawbone) return a;
  a.scene.userData.jawbone = true;
  a.scene.traverse((o) => { if ((o as THREE.Bone).isBone && o.name === 'jaw') o.name = 'jawbone'; });
  for (const c of a.clips.values()) for (const t of c.tracks) if (t.name.startsWith('jaw.')) t.name = 'jawbone' + t.name.slice(3);
  return a;
}

/** clips played through once (then the AI or the next clip takes over) */
const ONCE = new Set(['catch', 'lunge', 'flinch', 'shake', 'bark']);
/** old clip names the AI and the test pages still use */
const ALIAS: Record<string, string> = { growl: 'snarl', stand: 'stand' };
/** each gait's ground speed at playback rate 1 (m/s; the clips' paw travel) */
const NATURAL: Record<string, number> = { walk: 0.75, trot: 1.6, run: 3.3, stalk: 0.5 };
const GAITS = new Set(['walk', 'trot', 'run', 'stalk']);
const TAIL = ['tail1', 'tail2', 'tail3'];
const LIDS = ['lidTL0', 'lidTL1', 'lidTL2', 'lidTL3', 'lidBL0', 'lidBL1', 'lidBL2', 'lidBL3', 'lidTR0', 'lidTR1', 'lidTR2', 'lidTR3', 'lidBR0', 'lidBR1', 'lidBR2', 'lidBR3'];
/** where the dog grips things (model space, the rest pose): between the carnassials, a little behind the nose */
const MOUTH = new THREE.Vector3(0, 0.615, 0.565);
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v3 = new THREE.Vector3();
/** a stand-in while the model loads */
const EMPTY = new THREE.SkinnedMesh(new THREE.BufferGeometry().setIndex([]), new THREE.MeshBasicMaterial());
EMPTY.bind(new THREE.Skeleton([]));

interface Look { yaw: number; pitch: number; tail: number; lift: number; wagHz: number; jaw: number; ears: number; tilt: number }

export class AxehandleHound {
  /** test pages: switch the procedural layers (look, tail, jaw, ears, blinks) off to see the bare clips */
  static layers = true;
  readonly object = new THREE.Group();
  /** the dog (null until its model has loaded) */
  body: RealBody | null = null;
  /** the face mood shown (test pages: hold one; null follows the AI) */
  faceMood: Mood | null = null;
  readonly fur: null = null;
  /** its favourite food (see HOUND_FOODS for the rest it takes) */
  readonly favoriteFood = 'jerky';
  state: HoundState = 'wild_lurk';
  /** 0..1: rises with every jerky; at 1 the hound is the player's */
  trust = 0;
  /** ground position and heading (radians about Y, 0 = facing +Z) */
  readonly pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  /** the test page drives clips by hand */
  manual: string | null = null;
  /** the clip now (test pages read anim.current; the AI reads anim.done for its one-shots) */
  readonly anim = { current: 'idle', done: false };
  private oneShot: string | null = null;
  private t = 0; private st = 0; private next = 0; private blink = 0; private blinkT = 2;
  private target = new THREE.Vector3(); private wantSpeed = 0; private gait = 'walk'; private holdClip: string | null = null;
  private orbitDir = 1; private lastPlayer = new THREE.Vector3(); private playerSpeed = 0; private playerNear = 99;
  private carrying: GroundItem | null = null; private eatsLeft = 0; private lastGrowl = 0; private sub = '';
  private pending: { ev: string; item?: string }[] = [];
  private joyT = 0;
  private look: Look = { yaw: 0, pitch: 0, tail: 0, lift: 0, wagHz: 0, jaw: 0, ears: 0, tilt: 0 };
  private wagPh = 0; private pitchG = 0;
  private lidQ: (THREE.Quaternion | null)[] = [];

  constructor(o: { pos?: THREE.Vector3; heading?: number; state?: HoundState; trust?: number } = {}) {
    this.object.name = 'AxehandleHound';
    const a = houndModel();
    if (a) this.attach(mouthSocket(a)); else houndModelAsync().then((m) => this.attach(m)).catch(() => undefined);
    if (o.pos) this.pos.copy(o.pos);
    this.heading = o.heading ?? 0;
    if (o.state) this.state = o.state;
    if (o.trust !== undefined) this.trust = o.trust;
  }
  private attach(a: RealAsset) {
    if (this.body) return;
    const b = new RealBody(a);
    this.body = b;
    b.mesh.frustumCulled = false;
    this.object.add(b.object);
    // a mouth socket bone named 'jaw' on the real jaw ('jawbone'): game code finds it in mesh.skeleton.bones and hangs
    // what the dog carries on it; model-aligned at rest, at the grip between the carnassials
    const jaw = b.bone('jawbone');
    if (jaw) {
      b.root.updateMatrixWorld(true);
      const sock = new THREE.Bone(); sock.name = 'jaw';
      _m.copy(jaw.matrixWorld).invert().multiply(_m2.makeTranslation(MOUTH.x, MOUTH.y, MOUTH.z));
      _m.decompose(sock.position, sock.quaternion, sock.scale);
      jaw.add(sock);
      const sk = b.mesh.skeleton;
      b.mesh.bind(new THREE.Skeleton([...sk.bones, sock], [...sk.boneInverses, new THREE.Matrix4()]), b.mesh.bindMatrix);
    }
    this.lidQ = LIDS.map((n) => clipPose(a, 'blink', n));
    b.play('idle', { fade: 0 });
  }
  /** the dog's skinned mesh (an empty stand-in until the model has loaded) */
  get mesh(): THREE.SkinnedMesh { return this.body?.mesh ?? EMPTY; }
  get skel(): { bones: THREE.Bone[] } { return this.body?.skel ?? { bones: [] }; }

  /** hold a clip by hand (test page); null returns control to the AI */
  play(clip: string | null) { this.manual = clip ? ALIAS[clip] ?? clip : null; if (this.manual) this.start(this.manual); }
  get clips(): string[] { return this.body ? [...this.body.asset.clips.keys()] : ['idle']; }
  /** start a clip from its beginning (a one-shot plays through before the AI's choice takes over again) */
  private start(clip: string) {
    clip = ALIAS[clip] ?? clip;
    if (ONCE.has(clip)) this.oneShot = clip;
    this.body?.play(clip, { restart: true, once: ONCE.has(clip), fade: 0.18 });
    this.anim.current = clip; this.anim.done = false;
  }

  /** the player holds out an item: true if the hound takes it (its favourite, jerky, or other meat, when it is near
   *  enough and willing). It catches it, chews (an 'eat' event next update), and wags with joy ('happy') after */
  offer(item: string): boolean {
    if (!HOUND_FOODS.includes(item)) return false;
    if (this.state === 'eat' || this.state === 'lunge') return false;
    if (this.playerNear > 3.2) return false;
    if (this.state === 'wild_lurk' && this.playerNear > 2.2) return false;
    this.state = 'eat'; this.st = 0; this.eatsLeft = 0;
    this.start('catch');
    this.holdClip = 'catch';
    this.pending.push({ ev: 'eat', item });
    return true;
  }
  /** a wet-dog shake from nose to tail */
  shakeOff() { if (this.state === 'eat' || this.state === 'lunge') return; this.shakeT = 1.4; this.start('shake'); this.pending.push({ ev: 'shake' }); }
  private shakeT = 0;

  // ------------------------------------------------------------------------------------------------ per frame
  update(ctx: CreatureCtx) {
    const dt = Math.min(0.1, Math.max(0, ctx.dt));
    this.t += dt; this.st += dt;
    const P = ctx.player;
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.playerNear = dist;
    const ps = P.speed ?? (this.lastPlayer.lengthSq() > 0 && dt > 0 ? Math.hypot(P.pos.x - this.lastPlayer.x, P.pos.z - this.lastPlayer.z) / dt : 0);
    this.playerSpeed = damp(this.playerSpeed, Math.min(ps, 12), 6, dt);
    this.lastPlayer.copy(P.pos);
    const night = 1 - daylight(ctx.hour);
    for (const e of this.pending.splice(0)) ctx.emit(e.ev, { pos: this.object.position.clone(), who: 'hound', sound: HOUND_SOUND[e.ev], item: e.item });
    if (!this.manual) this.think(ctx, dt, dist, night);
    this.move(ctx, dt);
    this.animate(ctx, dt, night);
    setPusher(1, this.object.position.x, this.object.position.y, this.object.position.z, 0.45);
  }

  // ------------------------------------------------------------------------------------------------ AI
  private go(s: HoundState) { if (s !== this.state) { this.state = s; this.st = 0; this.sub = ''; this.holdClip = null; } }
  private think(ctx: CreatureCtx, dt: number, dist: number, night: number) {
    const P = ctx.player;
    const jerky = P.held === 'jerky';
    const stillPlayer = this.playerSpeed < 0.35;
    const emit = (ev: string, extra: Record<string, unknown> = {}) => ctx.emit(ev, { pos: this.object.position.clone(), who: 'hound', sound: HOUND_SOUND[ev], ...extra });
    switch (this.state) {
      case 'wild_lurk': {
        // keep to the edge of the light: close at night, far by day
        const R = night > 0.5 ? (P.light ? 10.5 : 8) : 24;
        if (this.st > this.next) { this.next = this.st + 6 + Math.random() * 8; if (Math.random() < 0.3) this.orbitDir *= -1; }
        const ang = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + this.orbitDir * 0.35;
        this.target.set(P.pos.x + Math.sin(ang) * R, 0, P.pos.z + Math.cos(ang) * R);
        const off = Math.abs(dist - R);
        this.wantSpeed = off > 4 ? 2.2 : night > 0.5 ? 0.55 : 0.4; this.gait = off > 4 ? 'trot' : 'stalk';
        this.lookAtPlayer = true;
        if (night > 0.5 && this.t - this.lastGrowl > 5 + Math.random() * 4 && dist < 16) { this.lastGrowl = this.t; emit('growl', { k: 0.6 }); }
        if (jerky && dist < 14 && this.playerSpeed < 2) { this.go('curious'); emit('sniff'); break; }
        // a feint: now and then at night, or when the player rushes it
        const rushed = dist < 6 && this.playerSpeed > 2.5;
        if ((night > 0.5 && this.st > 14 && Math.random() < dt * 0.06 && dist < 14) || rushed) { this.go('lunge'); emit('snarl'); }
        break;
      }
      case 'lunge': {
        // charge at the player, stop short and snap, then back off
        if (this.sub === '') { this.sub = 'charge'; this.lungeHit = !stillPlayer && !jerky; }
        if (this.sub === 'charge') {
          this.target.set(P.pos.x, 0, P.pos.z); this.wantSpeed = 6.5; this.gait = 'run'; this.lookAtPlayer = true;
          if (!stillPlayer && !jerky) this.lungeHit = true;
          if (jerky || stillPlayer) this.lungeHit = false;
          if (dist < 2.4 || this.st > 3) { this.sub = 'snap'; this.st = 0; this.holdClip = 'lunge'; this.start('lunge'); emit('snap'); }
        } else if (this.sub === 'snap') {
          this.wantSpeed = 0;
          if (this.st > 0.5 && this.lungeHit !== null) { emit(this.lungeHit ? 'bite' : 'lunge_feint', { damage: this.lungeHit ? 12 : 0 }); this.lungeHit = null; }
          if (this.st > 1.6) { this.sub = 'back'; this.st = 0; this.holdClip = null; }
        } else {
          const away = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
          this.target.set(P.pos.x + Math.sin(away) * 11, 0, P.pos.z + Math.cos(away) * 11);
          this.wantSpeed = 2.4; this.gait = 'trot'; this.lookAtPlayer = false;
          if (dist > 9 || this.st > 4) this.go(jerky ? 'curious' : 'wild_lurk');
        }
        break;
      }
      case 'curious': {
        this.lookAtPlayer = true;
        if (!jerky) { if (this.st > 1.5) this.go(this.trust >= 1 ? 'companion' : 'wild_lurk'); this.wantSpeed = 0; break; }
        // creep in, stopping to sniff the air; bolt if the player lunges at it
        if (this.playerSpeed > 2.5 && dist < 5) { this.go('wild_lurk'); this.holdClip = null; this.start('flinch'); emit('whine'); break; }
        const stop = 1.35;
        const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
        this.target.set(P.pos.x + Math.sin(a) * stop, 0, P.pos.z + Math.cos(a) * stop);
        const pause = (this.st % 4) > 2.9;
        this.wantSpeed = dist > stop + 0.3 && !pause ? (this.trust > 0 ? 0.9 : 0.5) : 0; this.gait = this.trust > 0.3 ? 'walk' : 'stalk';
        this.holdClip = this.wantSpeed === 0 ? (this.trust > 0.5 ? 'beg' : dist < 2 ? 'sit' : null) : null;
        if (pause && Math.random() < dt * 2) emit('sniff');
        break;
      }
      case 'eat': {
        this.wantSpeed = 0; this.lookAtPlayer = false;
        if (this.holdClip === 'catch' && this.st > 1.1) { this.holdClip = 'chew'; emit('chew'); }
        if (this.holdClip === 'chew' && Math.random() < dt * 1.5) emit('crunch');
        if (this.st > 4.6) {
          const before = this.trust;
          this.trust = Math.min(1, this.trust + (this.trust >= 1 ? 0 : 0.34));
          emit('happy', { item: 'jerky' }); this.joyT = 3;
          if (before < 1 && this.trust >= 1) { this.go('befriended'); emit('befriended'); }
          else this.go(this.trust >= 1 ? 'companion' : 'curious');
        }
        break;
      }
      case 'befriended': {
        this.wantSpeed = 0; this.lookAtPlayer = true; this.holdClip = 'wiggle';
        if (Math.random() < dt * 0.7) emit('yip');
        if (this.st > 3.5) this.go('companion');
        break;
      }
      case 'companion': this.companion(ctx, dt, dist, night, emit); break;
    }
  }
  private lookAtPlayer = true;
  private lungeHit: boolean | null = null;
  private poi = new THREE.Vector3(); private hasPoi = false;

  private companion(ctx: CreatureCtx, dt: number, dist: number, night: number, emit: (ev: string, x?: Record<string, unknown>) => void) {
    const P = ctx.player;
    this.lookAtPlayer = false;
    // 1. danger first: bark at threats
    const threat = ctx.threats?.find((t) => Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < 25);
    if (threat) {
      this.target.copy(this.pos); this.wantSpeed = 0;
      this.poi.copy(threat); this.hasPoi = true;
      if (this.sub !== 'bark' || this.anim.done) { this.sub = 'bark'; this.holdClip = 'bark'; this.start('bark'); emit('bark', { at: threat.clone() }); }
      return;
    }
    if (this.sub === 'bark') { this.sub = ''; this.holdClip = null; }
    // 2. carrying an axe handle off to chew
    if (this.carrying) {
      if (this.sub === 'carry') {
        this.wantSpeed = 1.4; this.gait = 'trot';
        if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 0.6) { this.sub = 'gnaw'; this.st = 0; emit('chew', { item: this.carrying.kind }); }
      } else {
        this.wantSpeed = 0; this.holdClip = 'chew';
        if (Math.random() < dt * 1.2) emit('crunch', { item: this.carrying.kind });
        if (this.st > 9) { this.carrying = null; this.sub = ''; this.holdClip = null; }
      }
      return;
    }
    const handle = ctx.items?.find((it) => /axe_?handle|handle/.test(it.kind) && Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) < 14);
    if (handle) {
      // go and steal it
      this.target.set(handle.pos.x, 0, handle.pos.z); this.wantSpeed = 2.4; this.gait = 'trot'; this.holdClip = null;
      if (Math.hypot(handle.pos.x - this.pos.x, handle.pos.z - this.pos.z) < 0.7 && (ctx.takeItem ? ctx.takeItem(handle.id) : true)) {
        this.carrying = handle; this.sub = 'carry'; this.st = 0; emit('steal', { item: handle.kind, id: handle.id });
        const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + 0.8;
        this.target.set(this.pos.x + Math.sin(a) * 5, 0, this.pos.z + Math.cos(a) * 5);
      }
      return;
    }
    // 3. night by the cabin: sleep by the stove
    const stove = ctx.stove ?? new THREE.Vector3(SPOTS.cabin.x, 0, SPOTS.cabin.z);
    const late = ctx.hour > 22 || ctx.hour < 5;
    if (late && Math.hypot(P.pos.x - stove.x, P.pos.z - stove.z) < 30) {
      const sx = stove.x + 0.9, sz = stove.z + 0.6;
      this.target.set(sx, 0, sz);
      if (Math.hypot(sx - this.pos.x, sz - this.pos.z) > 0.5) { this.wantSpeed = 1.0; this.gait = 'walk'; this.holdClip = null; }
      else { this.wantSpeed = 0; this.holdClip = 'sleep'; }
      return;
    }
    // 4. jerky in hand: beg
    if (P.held === 'jerky' && dist < 6) {
      const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
      this.target.set(P.pos.x + Math.sin(a) * 1.3, 0, P.pos.z + Math.cos(a) * 1.3);
      this.wantSpeed = dist > 1.6 ? 1.6 : 0; this.gait = 'walk'; this.lookAtPlayer = true;
      this.holdClip = this.wantSpeed === 0 ? 'beg' : null;
      if (this.wantSpeed === 0 && Math.random() < dt * 0.4) emit('whine');
      return;
    }
    // 5. the player is chopping: sit and watch
    if ((P.action === 'chop' || P.action === 'swing' || P.action === 'split') && dist < 12) {
      // a spot 3 m off to the side of the player, on the hound's side, clear of the swing
      const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
      this.target.set(P.pos.x + Math.sin(a) * 3.2, 0, P.pos.z + Math.cos(a) * 3.2);
      const far = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) > 0.6;
      this.wantSpeed = far ? 1.2 : 0; this.gait = 'walk'; this.holdClip = far ? null : 'sit'; this.lookAtPlayer = true;
      return;
    }
    // 6. follow; when the player lingers, wander off to sniff and dig nearby, howl at night now and then
    const follow = 3.2;
    if (dist > 9) { this.sub = ''; this.hasPoi = false; }
    if (dist > follow + 1.2 || this.sub === '' && dist > follow) {
      const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
      this.target.set(P.pos.x + Math.sin(a) * follow, 0, P.pos.z + Math.cos(a) * follow);
      this.wantSpeed = dist > 14 ? 5.5 : dist > 7 ? 2.6 : 1.2; this.gait = dist > 14 ? 'run' : dist > 7 ? 'trot' : 'walk'; this.holdClip = null;
      if (this.sub !== 'follow') { this.sub = 'follow'; this.st = 0; }
      return;
    }
    if (this.sub === 'follow' || this.sub === '') { this.sub = 'idle'; this.st = 0; this.next = 3 + Math.random() * 4; }
    if (this.sub === 'idle') {
      this.wantSpeed = 0; this.holdClip = null; this.lookAtPlayer = this.st < 1.5;
      if (this.st > this.next) {
        const r = Math.random();
        if (night > 0.6 && r < 0.15) { this.sub = 'howl'; this.st = 0; emit('howl'); }
        else {
          const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 4;
          this.poi.set(P.pos.x + Math.sin(a) * d, 0, P.pos.z + Math.cos(a) * d); this.hasPoi = true;
          this.sub = 'explore'; this.st = 0;
        }
      }
    } else if (this.sub === 'explore') {
      this.target.copy(this.poi); this.wantSpeed = 0.9; this.gait = 'walk'; this.holdClip = null;
      if (Math.hypot(this.poi.x - this.pos.x, this.poi.z - this.pos.z) < 0.5 || this.st > 8) { this.sub = Math.random() < 0.35 ? 'dig' : 'sniff'; this.st = 0; emit(this.sub === 'dig' ? 'dig' : 'sniff'); }
    } else if (this.sub === 'sniff') {
      this.wantSpeed = 0; this.holdClip = 'idle';
      if (this.st > 4) { this.sub = 'idle'; this.st = 0; this.next = 2 + Math.random() * 5; }
    } else if (this.sub === 'dig') {
      this.wantSpeed = 0; this.holdClip = 'dig';
      if (Math.random() < dt * 2) emit('dig');
      if (this.st > 3.5) { this.sub = 'idle'; this.st = 0; this.next = 2 + Math.random() * 5; }
    } else if (this.sub === 'howl') {
      this.wantSpeed = 0; this.holdClip = 'howl';
      if (this.st > 6) { this.sub = 'idle'; this.st = 0; this.next = 6 + Math.random() * 6; }
    }
  }

  // ------------------------------------------------------------------------------------------------ movement
  private move(ctx: CreatureCtx, dt: number) {
    if (this.manual) {
      // a clip held by hand: locomotion clips walk on the spot at their natural speed
      const m = this.manual;
      this.speed = m === 'walk' ? 1.0 : m === 'trot' ? 2.4 : m === 'run' ? 6.0 : m === 'stalk' ? 0.45 : 0;
    } else {
      const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
      let want = this.wantSpeed;
      if (d < 0.25) want = 0; else want = Math.min(want, d * 1.6 + 0.2);
      const desired = Math.atan2(tx, tz);
      // a long body turns wide: turn rate falls with speed, and it slows into sharp turns
      const err = wrapAngle(desired - this.heading);
      if (want > 0 || Math.abs(err) > 0.6 && d > 0.3) this.heading = dampAngle(this.heading, desired, want > 3 ? 2.2 : 3.2, dt);
      if (want === 0 && this.lookAtPlayer && this.wantSpeed === 0) {
        // stationary: turn the body slowly to face the player if they wander far round
        const pa = Math.atan2(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z), e2 = wrapAngle(pa - this.heading);
        if (Math.abs(e2) > 1.1 && !this.holdClip) this.heading = dampAngle(this.heading, pa, 1.2, dt);
      }
      want *= clamp(1.3 - Math.abs(err) * 0.6, 0.25, 1);
      const acc = want > this.speed ? 3.5 : 6;
      this.speed = damp(this.speed, want, acc, dt);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
    }
    this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.object.position.copy(this.pos);
    this.object.rotation.set(0, this.heading, 0);
  }

  // ------------------------------------------------------------------------------------------------ animation
  private animate(ctx: CreatureCtx, dt: number, night: number) {
    const sp = this.speed;
    // choose the clip
    let clip: string;
    if (this.manual) clip = this.manual;
    else if (this.holdClip) clip = this.holdClip;
    else if (sp < 0.08) clip = this.state === 'wild_lurk' && night > 0.5 && this.playerNear < 9 ? 'snarl' : this.state === 'curious' ? 'alert' : 'idle';
    else if (this.gait === 'stalk' && sp < 1.2) clip = 'stalk';
    else clip = sp < 1.3 ? 'walk' : sp < 3.4 ? 'trot' : 'run';
    if (this.shakeT > 0) { this.shakeT -= dt; if (!this.manual) clip = 'shake'; }
    if (this.joyT > 0) { this.joyT -= dt; if (!this.manual && sp < 0.3 && this.state !== 'eat' && !this.holdClip) clip = 'wiggle'; }
    clip = ALIAS[clip] ?? clip;
    const b = this.body;
    // a one-shot runs to its end unless a new one-shot starts (or the hound has to move)
    if (this.oneShot && b) {
      if (b.current === this.oneShot && !b.done && !(GAITS.has(clip) && sp > 1 && this.oneShot !== 'lunge')) clip = this.oneShot;
      else this.oneShot = null;
    }
    this.anim.current = clip;
    // ground and slope: the body pitches with the ground between the fore and hind paws
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const hf = ctx.heightAt(this.pos.x + s * 0.32, this.pos.z + c * 0.32), hb = ctx.heightAt(this.pos.x - s * 0.32, this.pos.z - c * 0.32);
    this.pitchG = damp(this.pitchG, clamp(-Math.atan2(hf - hb, 0.64), -0.4, 0.4), 8, dt);
    this.object.position.y = Math.min(hf, hb, this.pos.y) + (Math.max(hf, hb) - Math.min(hf, hb)) * 0.5 - 0.005;
    this.object.rotation.set(this.pitchG, this.heading, 0, 'YXZ');
    if (!b) return;
    const once = ONCE.has(clip);
    if (clip !== b.current) b.play(clip, { once, fade: clip === 'sleep' || b.current === 'sleep' ? 0.8 : once ? 0.15 : 0.3 });
    b.speed = GAITS.has(clip) ? clamp(Math.max(sp, 0.2) / NATURAL[clip], 0.6, 1.9) : 1;
    this.anim.done = b.done;
    b.update(dt);
    // ---- what it looks at: yaw/pitch to the player (or a point of interest) relative to the body
    const look = this.lookAtPlayer || this.manual ? ctx.player.pos : this.hasPoi ? this.poi : null;
    let ly = 0, lp = 0;
    if (look) {
      const hx = this.pos.x + s * 0.45, hz = this.pos.z + c * 0.45;
      const yaw = wrapAngle(Math.atan2(look.x - hx, look.z - hz) - this.heading);
      const dy = (look.y + (look === ctx.player.pos ? 0 : 0.3)) - (this.pos.y + 0.7), dh = Math.hypot(look.x - hx, look.z - hz);
      ly = clamp(yaw, -1.1, 1.1) * (Math.abs(yaw) < 2.2 ? 1 : 0); lp = clamp(Math.atan2(dy, dh), -0.45, 0.6);
    }
    const busy = clip === 'sleep' || clip === 'shake' || clip === 'lunge' || clip === 'chew' || clip === 'catch' || clip === 'dig' || clip === 'howl' || clip === 'bark';
    const L = this.look, k = 1 - Math.exp(-4 * dt);
    L.yaw += ((busy ? 0 : ly) - L.yaw) * k; L.pitch += ((busy ? 0 : lp) - L.pitch) * k;
    // ---- the mood: tail, jaw, ears, head tilt
    const mood = this.faceMood ?? this.moodNow(clip, night);
    const want = MOODS[mood] ?? MOODS.neutral;
    const km = 1 - Math.exp(-3 * dt);
    L.tail += (want.wag - L.tail) * km; L.lift += (want.lift - L.lift) * km; L.wagHz += (want.hz - L.wagHz) * km;
    L.jaw += (want.jaw - L.jaw) * km; L.ears += (want.ears - L.ears) * km; L.tilt += (want.tilt - L.tilt) * km;
    this.wagPh += dt * L.wagHz * Math.PI * 2;
    if (!AxehandleHound.layers) return;
    const B = (n: string) => b.bone(n);
    b.turn(B('neck3'), AX.y, L.yaw * 0.4); b.turn(B('head'), AX.y, L.yaw * 0.55);
    b.turn(B('neck3'), AX.x, -L.pitch * 0.3); b.turn(B('head'), AX.x, -L.pitch * 0.5);
    b.turn(B('head'), AX.z, L.tilt * (0.6 + 0.4 * Math.sin(this.t * 0.7)));
    // the tail: lifted or tucked, and wagging (a wave down the tail)
    b.turn(B('tail1'), AX.x, L.lift);
    for (let i = 1; i <= 3; i++) b.turn(B(TAIL[i - 1]), AX.y, L.tail * (1.15 - i * 0.2) * Math.sin(this.wagPh - i * 0.55));
    // the jaw: a pant (the clips already hold the tongue out), a snarl's tremble
    const pant = clip === 'chew' || clip === 'catch' || clip === 'bark' || clip === 'howl' || clip === 'lunge' || clip === 'sleep' ? 0 : L.jaw;
    b.turn(B('jawbone'), AX.x, pant > 0 ? pant * (0.55 + 0.45 * Math.sin(this.t * Math.PI * 2 * 2.8)) : pant * (0.8 + 0.2 * Math.sin(this.t * 40)));
    // ears: perked forward (curious) or pinned back (angry, scared)
    b.turn(B('earL'), AX.x, L.ears); b.turn(B('earR'), AX.x, L.ears);
    // blinks (eyes shut asleep)
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.18; this.blinkT = 1.5 + Math.random() * 5; }
    this.blink = Math.max(0, this.blink - dt);
    const shut = clip === 'sleep' ? 1 : this.blink > 0 ? Math.sin((this.blink / 0.18) * Math.PI) : 0;
    if (shut > 0.01) for (let i = 0; i < LIDS.length; i++) { const q = this.lidQ[i]; if (q) b.blendTo(B(LIDS[i]), q, shut); }
    // eye shine: strong at night when a light is by the viewer
    b.asset.fx.shine.value = night * (ctx.player.light ? 1.0 : 0.4) * (this.state === 'companion' ? 0.6 : 1) * (1 - shut);
    void _v3;
  }
  /** the mood for a clip (and, between clips, for the state) */
  private moodNow(clip: string, night: number): Mood {
    if (this.shakeT > 0) return 'joy';
    switch (clip) {
      case 'snarl': case 'lunge': case 'stalk': return 'angry';
      case 'flinch': return 'scared';
      case 'beg': return 'pleading';
      case 'wiggle': case 'shake': return 'joy';
      case 'catch': case 'chew': return 'eating';
      case 'sleep': return 'sleepy';
      case 'howl': return 'sad';
      case 'alert': case 'bark': return this.state === 'companion' || this.manual ? 'curious' : 'angry';
      case 'dig': return 'happy';
    }
    if (this.manual) return clip === 'idle' || clip === 'sit' || GAITS.has(clip) ? 'happy' : 'neutral';
    switch (this.state) {
      case 'wild_lurk': return night > 0.5 ? 'angry' : 'curious';
      case 'lunge': return 'angry';
      case 'curious': return this.trust > 0.4 ? 'pleading' : 'curious';
      case 'eat': return 'eating';
      case 'befriended': return 'joy';
      case 'companion': return this.sub === 'explore' || this.sub === 'sniff' ? 'curious' : 'happy';
    }
    return 'neutral';
  }
}

/** the procedural layer for each mood: tail wag amplitude (rad) and rate (Hz), tail lift (+ up, - tucked), jaw
 *  (+ a pant, - a snarl's tremble), ears (+ perked forward, - pinned back), head tilt (rad) */
const MOODS: Record<string, { wag: number; hz: number; lift: number; jaw: number; ears: number; tilt: number }> = {
  neutral: { wag: 0.08, hz: 1.2, lift: 0, jaw: 0.04, ears: 0, tilt: 0 },
  happy: { wag: 0.42, hz: 4.2, lift: 0.18, jaw: 0.1, ears: -0.12, tilt: 0 },
  joy: { wag: 0.6, hz: 6.5, lift: 0.3, jaw: 0.14, ears: -0.2, tilt: 0 },
  curious: { wag: 0.12, hz: 1.5, lift: 0.1, jaw: 0, ears: 0.18, tilt: 0.22 },
  pleading: { wag: 0.3, hz: 3.5, lift: -0.05, jaw: 0.03, ears: -0.25, tilt: 0.18 },
  eating: { wag: 0.35, hz: 3.8, lift: 0.1, jaw: 0, ears: -0.1, tilt: 0 },
  angry: { wag: 0, hz: 0, lift: -0.15, jaw: -0.06, ears: -0.45, tilt: 0 },
  scared: { wag: 0, hz: 0, lift: -0.7, jaw: 0, ears: -0.6, tilt: 0 },
  sad: { wag: 0.05, hz: 0.8, lift: -0.2, jaw: 0, ears: -0.1, tilt: 0 },
  sleepy: { wag: 0, hz: 0, lift: 0, jaw: 0, ears: -0.15, tilt: 0 },
};

/** 0 night .. 1 day */
export function daylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const up = clamp((h - 5) / 2.2, 0, 1), down = clamp((21 - h) / 2.2, 0, 1);
  return Math.min(up, down);
}
