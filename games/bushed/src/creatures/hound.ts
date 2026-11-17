// THE AXEHANDLE HOUND (Wisconsin/Minnesota lumber-camp folklore, Cox 1910: a hatchet head, a body like an axe handle,
// short stumpy legs; it prowls the camps at night eating axe handles). Model in hound/model.ts, clips in hound/clips.ts.
//
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
//              ground, begs for jerky, sleeps by the stove at night, howls at the moon now and then
// Events (ctx.emit(ev, { pos, who: 'hound', sound, ... })): growl, snarl, snap, bite (damage), lunge_feint, bark, whine,
// sniff, chew, crunch, howl, yip, steal, befriended, dig. `sound` is a suggested src/audio/bank.ts id (HOUND_SOUND).
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, dampAngle, wrapAngle, smooth, type CreatureFx } from './rig';
import { Animator, FOOT, type AnimParams } from './animator';
import { buildHoundModel, buildHoundModelAsync, houndBones, LEGS, H, HOUND_MODEL_VERSION, type HoundModel } from './hound/model';
import { loader } from './cache';
import { houndClips, CH_BLINK, CH_SHINE } from './hound/clips';
import { setPusher } from '../gfx/globals';
import { SPOTS } from '../world/layout';
import type { CreatureCtx, GroundItem } from './types';

/** the sound-bank id (src/audio/bank.ts) suggested for each event; events without one are story beats */
export const HOUND_SOUND: Record<string, string | undefined> = {
  growl: 'hound_growl', snarl: 'hound_snarl', bark: 'hound_bark', whine: 'hound_whine', sniff: 'hound_sniff', yip: 'hound_yip',
  chew: 'hound_chew', crunch: 'hound_chew', snap: 'hound_ting', bite: 'hound_ting', lunge_feint: 'hound_snarl', steal: 'hound_ting',
};
export type HoundState = 'wild_lurk' | 'lunge' | 'curious' | 'eat' | 'befriended' | 'companion';

const HOUND = loader<HoundModel>(HOUND_MODEL_VERSION, () => buildHoundModelAsync(), (b, m) => ({ ...b, bones: houndBones(), tris: m.tris as number, den: m.den as number, stats: m.stats as string }), (m) => ({ tris: m.tris, den: m.den, stats: m.stats }));
/** the hound's model, shared by every hound: preloaded (houndModelAsync / preloadCreatures) or built now (blocks) */
export function houndModel(): HoundModel { let m = HOUND.get(); if (!m) { m = buildHoundModel(); HOUND.set(m); } return m; }
/** load the hound's model without stalling: from IndexedDB if cached, else built in ~30 ms slices (then cached) */
export function houndModelAsync(o: { cache?: boolean } = {}): Promise<HoundModel> { return HOUND.load(o); }

const STRIDE: Record<string, number> = { walk: 0.46, trot: 0.64, run: 1.0, stalk: 0.32 };
const GAITS = new Set(['walk', 'trot', 'run', 'stalk']);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _pole = new THREE.Vector3(), _t = new THREE.Vector3();

export class AxehandleHound {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: Skel;
  readonly anim: Animator;
  readonly fx: CreatureFx;
  readonly model: HoundModel;
  state: HoundState = 'wild_lurk';
  /** 0..1: rises with every jerky; at 1 the hound is the player's */
  trust = 0;
  /** ground position and heading (radians about Y, 0 = facing +Z) */
  readonly pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  /** the test page drives clips by hand */
  manual: string | null = null;
  private params: AnimParams = { speed: 0, phase: 0, lookYaw: 0, lookPitch: 0 };
  private bi: Record<string, number>;
  private legs: { up: number; lo: number; mid: number; foot: number; ankle: THREE.Vector3; hock: THREE.Vector3; fore: boolean; side: number }[];
  private lidAxis: THREE.Vector3[];
  private t = 0; private st = 0; private next = 0; private blink = 0; private blinkT = 2;
  private target = new THREE.Vector3(); private wantSpeed = 0; private gait = 'walk'; private holdClip: string | null = null;
  private orbitDir = 1; private lastPlayer = new THREE.Vector3(); private playerSpeed = 0; private playerNear = 99;
  private carrying: GroundItem | null = null; private eatsLeft = 0; private lastGrowl = 0; private sub = '';
  private ground = new Float32Array(4);

  constructor(o: { pos?: THREE.Vector3; heading?: number; model?: HoundModel; state?: HoundState; trust?: number } = {}) {
    const m = o.model ?? houndModel();
    this.model = m;
    this.skel = new Skel(m.bones ?? houndBones());
    const { mat, depth, fx } = creatureMaterial(m.tex, m.sd, { shineCol: 0xd8f28a });
    this.fx = fx;
    this.mesh = this.skel.mesh(m.geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.customDepthMaterial = depth;
    this.mesh.frustumCulled = false;
    this.object.add(this.mesh);
    this.object.name = 'AxehandleHound';
    this.anim = new Animator(houndClips(this.skel.defs), this.skel.bones.length, 4);
    this.anim.play('idle');
    this.bi = this.skel.idx;
    const S = this.skel, rw = S.restWorld;
    this.legs = [['fuL', 'flL', '', 'ffL', true, 1], ['fuR', 'flR', '', 'ffR', true, -1], ['huL', 'hlL', 'hmL', 'hfL', false, 1], ['huR', 'hlR', 'hmR', 'hfR', false, -1]].map(([u, l, m2, f, fore, side]) => ({
      up: S.i(u as string), lo: S.i(l as string), mid: m2 ? S.i(m2 as string) : -1, foot: S.i(f as string), ankle: rw[S.i(f as string)].clone(), hock: m2 ? rw[S.i(m2 as string)].clone() : new THREE.Vector3(), fore: fore as boolean, side: side as number,
    }));
    this.lidAxis = [1, -1].map((s) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * 0.8, 0.08, 0.6).normalize()).normalize());
    if (o.pos) this.pos.copy(o.pos);
    this.heading = o.heading ?? 0;
    if (o.state) this.state = o.state;
    if (o.trust !== undefined) this.trust = o.trust;
    void LEGS; void H;
  }

  /** hold a clip by hand (test page); null returns control to the AI */
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip].loop }); }
  get clips(): string[] { return Object.keys(this.anim.clips); }

  /** the player holds out an item: true if the hound takes it (jerky, when it is near enough and willing) */
  offer(item: string): boolean {
    if (item !== 'jerky') return false;
    if (this.state === 'eat' || this.state === 'lunge') return false;
    if (this.playerNear > 3.2) return false;
    if (this.state === 'wild_lurk' && this.playerNear > 2.2) return false;
    this.state = 'eat'; this.st = 0; this.eatsLeft = 0;
    this.anim.play('catch', { restart: true });
    this.holdClip = 'catch';
    return true;
  }

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
    if (!this.manual) this.think(ctx, dt, dist, night);
    this.move(ctx, dt);
    // eye shine: strong at night when a light is by the viewer
    this.fx.shine.value = night * (P.light ? 1.0 : 0.4) * (this.state === 'companion' ? 0.6 : 1);
    this.animate(ctx, dt);
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
          if (dist < 2.4 || this.st > 3) { this.sub = 'snap'; this.st = 0; this.holdClip = 'lunge'; this.anim.play('lunge', { restart: true }); emit('snap'); }
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
        if (this.playerSpeed > 2.5 && dist < 5) { this.go('wild_lurk'); this.holdClip = null; this.anim.play('flinch', { restart: true }); emit('whine'); break; }
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
      if (this.sub !== 'bark' || this.anim.done) { this.sub = 'bark'; this.holdClip = 'bark'; this.anim.play('bark', { restart: true }); emit('bark', { at: threat.clone() }); }
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
  private animate(ctx: CreatureCtx, dt: number) {
    const a = this.params, sp = this.speed;
    // choose the clip
    let clip: string;
    if (this.manual) clip = this.manual;
    else if (this.holdClip) clip = this.holdClip;
    else if (sp < 0.08) clip = this.state === 'wild_lurk' && ctx.hour > 0 && (1 - daylight(ctx.hour)) > 0.5 ? 'snarl' : this.state === 'curious' ? 'idle' : 'idle';
    else if (this.gait === 'stalk' && sp < 1.2) clip = 'stalk';
    else clip = sp < 1.5 ? 'walk' : sp < 3.6 ? 'trot' : 'run';
    if (this.state === 'wild_lurk' && !this.manual && clip === 'snarl' && this.playerNear > 9) clip = 'idle';
    this.anim.play(clip);
    if (GAITS.has(this.anim.current)) a.phase = (a.phase + (sp / (STRIDE[this.anim.current] ?? 0.5)) * dt) % 1;
    a.speed = sp;
    // the look: yaw/pitch to the player (or a point of interest) relative to the body
    const look = this.lookAtPlayer || this.manual ? ctx.player.pos : this.hasPoi ? this.poi : null;
    let ly = 0, lp = 0;
    if (look) {
      const hx = this.pos.x + Math.sin(this.heading) * 0.65, hz = this.pos.z + Math.cos(this.heading) * 0.65;
      const yaw = wrapAngle(Math.atan2(look.x - hx, look.z - hz) - this.heading);
      const dy = (look.y + (look === ctx.player.pos ? 0 : 0.3)) - (this.pos.y + 0.66), dh = Math.hypot(look.x - hx, look.z - hz);
      ly = clamp(yaw, -1.2, 1.2) * (Math.abs(yaw) < 2.2 ? 1 : 0); lp = clamp(Math.atan2(dy, dh), -0.5, 0.7);
    }
    a.lookYaw = damp(a.lookYaw, ly, 4, dt); a.lookPitch = damp(a.lookPitch, lp, 4, dt);
    const p = this.anim.update(dt, a);
    // blinking
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.18; this.blinkT = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);
    const blinkK = Math.max(p.c[CH_BLINK], this.blink > 0 ? Math.sin((this.blink / 0.18) * Math.PI) : 0);
    this.fx.shine.value *= 1 + p.c[CH_SHINE] * 0.5;
    // ground under each foot (IK adapts the feet to the slope)
    const g0 = this.pos.y;
    for (let k = 0; k < 4; k++) {
      const L = this.legs[k], fx = L.ankle.x + p.f[k * FOOT], fz = L.ankle.z + p.f[k * FOOT + 2];
      const c = Math.cos(this.heading), s = Math.sin(this.heading);
      this.ground[k] = clamp(ctx.heightAt(this.pos.x + fx * c + fz * s, this.pos.z - fx * s + fz * c) - g0, -0.25, 0.25);
    }
    // the body pitches with the slope between the fore and hind feet
    const slope = Math.atan2((this.ground[0] + this.ground[1]) * 0.5 - (this.ground[2] + this.ground[3]) * 0.5, 0.83);
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
    // lids close about their side axis
    B[this.bi.lidL].quaternion.setFromAxisAngle(this.lidAxis[0], 0.12 + blink * 1.45);
    B[this.bi.lidR].quaternion.setFromAxisAngle(this.lidAxis[1], 0.12 + blink * 1.45);
    // eyes follow the look a little
    B[this.bi.eyeL].quaternion.setFromEuler(_e.set(-this.params.lookPitch * 0.3, this.params.lookYaw * 0.3, 0));
    B[this.bi.eyeR].quaternion.copy(B[this.bi.eyeL].quaternion);
    S.fk();
    // legs: two-bone IK to the foot targets
    for (let k = 0; k < 4; k++) {
      const L = this.legs[k], o = k * FOOT, w = clamp(p.f[o + 3], 0, 1);
      if (w < 0.002) continue;
      const par = S.defs[L.up].parent;
      _t.set(L.ankle.x + p.f[o], L.ankle.y + p.f[o + 1] + this.ground[k] - lift, L.ankle.z + p.f[o + 2]);
      // the paw keeps the body's heading, pitched by the clip
      const fwd = _v.set(0, 0, 1).applyQuaternion(S.Q[par]);
      const yawQ = _q.setFromAxisAngle(_w.set(0, 1, 0), Math.atan2(fwd.x, fwd.z));
      _pole.set(0, 0, L.fore ? -1 : 1).applyQuaternion(yawQ);
      if (L.fore) {
        S.ik2(L.up, L.lo, L.foot, _t, _pole, w);
        const want = new THREE.Quaternion().copy(yawQ).multiply(new THREE.Quaternion().setFromEuler(_e.set(p.f[o + 4], 0, 0)));
        S.orient(L.foot, want.slerp(_q2.copy(S.Q[L.foot]), 1 - w));
      } else {
        // the metatarsus keeps its rest slant, tipped by the clip (a sit lays it flat); the hock goes where that puts it
        const qm = new THREE.Quaternion().copy(yawQ).multiply(new THREE.Quaternion().setFromEuler(_e.set(-p.f[o + 4], 0, 0)));
        const hockT = _w.copy(L.ankle).sub(L.hock).applyQuaternion(qm).multiplyScalar(-1).add(_t);
        S.ik2(L.up, L.lo, L.mid, hockT, _pole, w);
        const fkm = S.Q[L.mid].clone();
        S.orient(L.mid, qm.slerp(fkm, 1 - w));
        S.fk1(L.foot);
        const fkf = S.Q[L.foot].clone();
        S.orient(L.foot, new THREE.Quaternion().copy(yawQ).multiply(new THREE.Quaternion().setFromEuler(_e.set(clamp(p.f[o + 4] * 0.4, -0.5, 0.6), 0, 0))).slerp(fkf, 1 - w));
      }
    }
    void smooth;
  }
}

/** 0 night .. 1 day */
export function daylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const up = clamp((h - 5) / 2.2, 0, 1), down = clamp((21 - h) / 2.2, 0, 1);
  return Math.min(up, down);
}
