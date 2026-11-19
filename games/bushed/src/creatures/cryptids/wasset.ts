// THE SNOW WASSET: a long shaggy white-and-brown weasel of the north shore that travels under the ground and the
// snow and pops up wherever it likes (model in wasset/model.ts). Its tunnelling throws up puffs of snow or earth
// (gfx/particles), so you can follow the line it takes.
//
//   const w = new SnowWasset({ pos }); scene.add(w.object); w.update(ctx); w.offer('fish');
//
// Rules (learnable, playful):
//   under    it lives under the ground and the snow on the north shore of the lake: watch for a line of heaving snow
//   curious  it tunnels toward anyone who comes along, pops up a few paces off and stands up tall to stare at you
//   laces    stand still and it darts in to nip at your bootlaces ('nip'), then darts off: harmless, but it unties them
//   dive     swing at it or rush it and it dives; it comes up again somewhere else a while later
//   trout    it loves lake trout: hold one out and it sits up and begs; feed it twice and it follows you about,
//            tunnelling alongside and popping up wherever you stop
//   night    it sleeps under the snow at night
// Events: burrow, popup, chitter, nip { tug }, dive, beg, eat, happy, befriended, step.
import * as THREE from 'three';
import { Cryptid, CH, clipKit, clamp, damp, type Pose, type Clip, type AnimParams } from './base';
import { cryptidLoader } from './kit';
import { wassetModelGen, wassetBones, WASSET_MODEL_VERSION, WS_FUR_SPEC, WS_HEAD } from './wasset/model';
import { puffs, debris } from '../../gfx/particles';
import { G } from '../../gfx/globals';
import type { BoneDef } from '../rig';
import type { CreatureCtx } from '../types';

const WM = cryptidLoader(WASSET_MODEL_VERSION, () => wassetModelGen(), wassetBones);
export const wassetModel = () => WM.get();
export const wassetModelAsync = (o: { cache?: boolean } = {}) => WM.load(o);

export const WASSET_SOUND: Record<string, string | undefined> = {
  burrow: 'foot_snow', popup: 'foliage_rustle', chitter: 'hound_yip', nip: 'hound_ting', dive: 'foot_snow', beg: 'hound_whine', eat: 'hound_chew', happy: 'hound_yip', befriended: 'hound_yip', step: undefined,
};
export type WassetState = 'roam' | 'surface' | 'nip' | 'beg' | 'eat' | 'happy' | 'friend' | 'sleep';
const FISH = /fish|trout/i;
const STRIDE = { walk: 0.32, run: 0.7 };
const SNOWC = new THREE.Color(0.93, 0.94, 0.97), DIRTC = new THREE.Color(0.32, 0.25, 0.18);

function wassetClips(defs: BoneDef[]): Record<string, Clip> {
  const { I, R, F, gait } = clipKit(defs);
  const BACK = I('back'), HIPS = I('hips'), CHEST = I('chest'), NECK = I('neck'), NECK2 = I('neck2'), HEAD = I('head'), JAW = I('jaw');
  const TAIL = [0, 1, 2, 3].map((k) => I('tail' + k)), EAR = [I('earL'), I('earR')], FU = [I('fuL'), I('fuR')], FL = [I('flL'), I('flR')];
  const sin = Math.sin, cos = Math.cos, TAU = Math.PI * 2;
  const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const env = (t: number, a: number, b: number, c: number, d: number) => (t < a ? 0 : t < b ? sm((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - sm((t - c) / (d - c)) : 0);
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, NECK2, -a.lookPitch * 0.3 * k, a.lookYaw * 0.4 * k); R(p, HEAD, -a.lookPitch * 0.4 * k, a.lookYaw * 0.5 * k); };
  const tail = (p: Pose, t: number, amp: number, f = 1) => TAIL.forEach((b, k) => R(p, b, 0, amp * sin(t * f * TAU - k * 0.8) * (0.4 + k * 0.15)));
  const slink = (p: Pose, t: number, amp: number) => { R(p, BACK, 0, amp * sin(t)); R(p, CHEST, 0, -amp * sin(t - 0.6)); R(p, NECK, 0, -amp * 0.6 * sin(t - 1.2)); };
  /** standing up on its hind legs, the body upright from the hips (the periscope) */
  const upright = (p: Pose, k: number) => {
    p.rr[0] -= 1.15 * k; p.t[1] += 0.06 * k; p.t[2] -= 0.12 * k; R(p, NECK, 0.55 * k); R(p, NECK2, 0.35 * k); R(p, HEAD, 0.25 * k);
    for (let j = 0; j < 2; j++) { F(p, j, 0, 0, 0, 1 - k); R(p, FU[j], 0.9 * k); R(p, FL[j], -1.3 * k); }
  };
  return {
    idle: { loop: true, dur: 5, fade: 0.4, fn: (p, t, a) => {
      // low to the ground, the long neck weaving, sniffing, the tail flicking
      slink(p, t * 1.3, 0.06); R(p, NECK, 0.05 * sin(t * 0.9)); R(p, HEAD, 0.1 * Math.max(0, sin(t * 2.3)));
      tail(p, t, 0.15, 0.6); look(p, a); R(p, EAR[0], 0, 0, 0.1 * sin(t * 3)); R(p, EAR[1], 0, 0, -0.1 * sin(t * 3 + 1));
    } },
    walk: { loop: true, dur: 1, fade: 0.3, fn: (p, _t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.6, STRIDE.walk, 0.03, [0, 0.5, 0.5, 0]);
      slink(p, w, 0.12); p.t[1] += 0.008 * cos(w * 2); tail(p, a.phase, 0.25); look(p, a, 0.5);
    } },
    run: { loop: true, dur: 1, fade: 0.2, fn: (p, _t, a) => {
      // the weasel bound: the back humps up as the hind feet land behind the fore feet, then stretches out
      const w = a.phase * TAU;
      gait(p, a.phase, 0.42, STRIDE.run, 0.08, [0, 0.05, 0.5, 0.55]);
      R(p, BACK, -0.35 * Math.max(0, sin(w)), 0); R(p, HIPS, 0.25 * Math.max(0, sin(w))); R(p, CHEST, 0.15 * sin(w));
      p.t[1] += 0.05 * Math.max(0, sin(w)); R(p, HEAD, -0.1); tail(p, a.phase, 0.2, 1);
    } },
    periscope: { loop: true, dur: 5, fade: 0.35, fn: (p, t, a) => {
      // stood up tall, the forepaws tucked, the head swivelling to stare (the classic weasel look-round)
      upright(p, 1); R(p, HEAD, 0, 0.5 * sin(t * 0.9) * env(t % 5, 0.5, 1, 3, 3.5)); p.t[1] += 0.004 * sin(t * 2);
      tail(p, t, 0.1, 0.6); look(p, a, 0.8);
    } },
    popup: { loop: false, dur: 1.0, fade: 0.05, next: 'periscope', fn: (p, t) => {
      // bursting up through the crust: it comes out nearly vertical and shakes the snow off
      const k = sm(t / 0.5), sh = sin(t * 40) * 0.06 * env(t, 0.5, 0.6, 0.8, 1.0);
      upright(p, 1); R(p, HEAD, -0.3 * (1 - k), sh * 3); R(p, NECK, 0, sh * 2); R(p, JAW, 0.3 * (1 - k));
      p.c[CH.A] = 1 - k;
    } },
    dive: { loop: false, dur: 0.9, fade: 0.06, fn: (p, t) => {
      // the dive: it arches its back and goes in nose-first like a seal into water
      const k = sm(t / 0.7);
      p.rr[0] += 0.9 * k; R(p, NECK, 0.4 * k); R(p, HEAD, 0.3 * k); R(p, BACK, -0.3 * k); tail(p, t, 0.3, 2);
      p.c[CH.A] = k;
    } },
    nip: { loop: false, dur: 0.9, fade: 0.08, fn: (p, t) => {
      // a dart in, a snap at the laces, a tug with a shake of the head
      const lunge = env(t, 0, 0.15, 0.4, 0.6), snap = env(t, 0.15, 0.22, 0.3, 0.38), tug = sin(t * 30) * env(t, 0.35, 0.4, 0.6, 0.75);
      p.t[2] += 0.15 * lunge; R(p, NECK, 0.35 * lunge); R(p, HEAD, 0.4 * lunge, tug * 0.3); R(p, JAW, 0.4 * snap);
      R(p, NECK2, 0, tug * 0.4);
    } },
    beg: { loop: true, dur: 3, fade: 0.35, fn: (p, t, a) => {
      // a trout! upright, the forepaws held together, the nose working, little bounces of impatience
      upright(p, 1); p.t[1] += 0.015 * Math.abs(sin(t * 5)); R(p, HEAD, -0.15 + 0.04 * sin(t * 12));
      for (let j = 0; j < 2; j++) R(p, FU[j], 0.3, 0, (j ? 1 : -1) * 0.25);
      tail(p, t, 0.35, 2); look(p, a, 0.8);
    } },
    eat: { loop: false, dur: 3.4, fade: 0.25, next: 'happy', fn: (p, t) => {
      // the gulp: head down on the fish, the jaw going, then the swallow travelling down the long neck
      const dn = env(t, 0, 0.3, 2.6, 3.2), chew = Math.max(0, sin(t * 11)) * env(t, 0.3, 0.5, 2.2, 2.5), gulp = env(t, 2.4, 2.6, 2.8, 3.1);
      R(p, NECK, 0.35 * dn - 0.2 * gulp); R(p, NECK2, 0.3 * dn); R(p, HEAD, 0.25 * dn); R(p, JAW, 0.35 * chew);
      F(p, 0, 0, 0, 0.04 * dn); F(p, 1, 0, 0, 0.04 * dn); tail(p, t, 0.2, 1.5); p.c[CH.BLINK] = 0.5 * chew;
    } },
    happy: { loop: false, dur: 3.6, fade: 0.25, next: 'idle', fn: (p, t) => {
      // the weasel war dance: hops sideways with its back arched high, twists in the air, a roll on the snow
      const k = env(t, 0, 0.2, 3.0, 3.6), hop = Math.abs(sin(t * 7)) * k;
      R(p, BACK, -0.45 * k); R(p, HIPS, 0.25 * k); p.t[1] += 0.07 * hop; p.t[0] += 0.08 * sin(t * 3.5) * k; p.rr[1] += 0.6 * sin(t * 3.5) * k;
      p.rr[2] += 0.25 * sin(t * 7) * k; R(p, HEAD, -0.2 * k, 0.3 * sin(t * 7)); R(p, JAW, 0.2 * k); tail(p, t, 0.5 * k, 3);
    } },
    under: { loop: true, dur: 1, fade: 0.1, fn: (p) => { p.c[CH.A] = 1; } },
  };
}

const _v = new THREE.Vector3(), _e = new THREE.Euler();
export class SnowWasset extends Cryptid {
  readonly id = 'wasset';
  readonly name = 'Snow Wasset';
  readonly favoriteFood = 'fish';
  readonly rules = [
    'It lives under the ground and the snow on the north shore of the lake. Watch for a line of heaving snow or earth.',
    'It is curious: it tunnels toward you, pops up a few paces away and stands up tall to stare.',
    'Stand still and it darts in to nip at your bootlaces. Harmless, but it unties them.',
    'Swing at it or rush it and it dives under. It comes up again somewhere else a while later.',
    'It loves lake trout. Hold one out and it sits up and begs; feed it twice and it follows you, popping up wherever you stop.',
    'At night it sleeps under the snow.',
  ] as const;
  readonly sounds = WASSET_SOUND;
  declare state: WassetState;
  /** 0 on the surface .. 1 under the ground */
  depth = 0;
  private wantDepth = 0; private dug = 0; private nips = 0; private puffT = 0; private lastBurrow = 0; private popAt = new THREE.Vector3(); private hasPop = false; private fleeT = 0;
  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super(wassetModel(), wassetClips(wassetBones()), { pos: o.pos, heading: o.heading, shineCol: 0xc8e0ff, fur: WS_FUR_SPEC, legs: [
      { up: 'fuL', lo: 'flL', foot: 'ffL', fore: true }, { up: 'fuR', lo: 'flR', foot: 'ffR', fore: true },
      { up: 'huL', lo: 'hlL', foot: 'hfL' }, { up: 'huR', lo: 'hlR', foot: 'hfR' }] });
    this.object.name = 'SnowWasset';
    this.state = 'roam'; this.depth = 1; this.wantDepth = 1;
    this.stride = { walk: STRIDE.walk, run: STRIDE.run };
    this.manualSpeed = { walk: 0.6, run: 3 };
    this.turnK = 4;
  }
  get under() { return this.depth > 0.6; }
  offer(item: string): boolean {
    if (!FISH.test(item)) return false;
    if (this.under || this.state === 'eat' || this.dist > 2.4) return false;
    this.go('eat'); this.once('eat'); this.want = 0; this.wantDepth = 0;
    this.emit('eat', { item: 'fish' });
    return true;
  }
  private dive(ctx: CreatureCtx) { this.wantDepth = 1; this.once('dive'); this.emit('dive'); this.burst(ctx, 10); }
  private pop(ctx: CreatureCtx) { this.wantDepth = 0; this.depth = Math.min(this.depth, 0.85); this.once('popup'); this.emit('popup'); this.burst(ctx, 14); if (Math.random() < 0.6) this.emit('chitter'); }
  /** a spray of snow (or earth) where it breaks the surface */
  private burst(_ctx: CreatureCtx, n: number) {
    const snow = G.uSnow.value > 0.3, col = snow ? SNOWC : DIRTC, at = _v.set(this.pos.x + Math.sin(this.heading) * 0.35, this.pos.y + 0.05, this.pos.z + Math.cos(this.heading) * 0.35);
    puffs.emit(at, new THREE.Vector3(0, 0.6, 0), { size: 0.12, grow: 2.5, life: 1.2, color: col, alpha: snow ? 0.6 : 0.4, rise: -0.1, n: Math.ceil(n / 3), spread: 0.8 });
    debris.emit(snow ? 'sawdust' : 'bark', at, new THREE.Vector3(0, 2.2, 0), n, { spread: 1.6, color: snow ? new THREE.Color(0.95, 0.96, 1) : new THREE.Color(0.3, 0.22, 0.15), life: 2 });
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player, d = this.dist, fish = FISH.test(P.held), night = ctx.hour >= 22.5 || ctx.hour < 5, friend = this.trust >= 1;
    this.lookAt = P.pos; this.face = null; this.arrive = 0.3;
    const swing = (P.action === 'swing' || P.action === 'chop') && d < 3.5, rush = this.pSpeed > 3.2 && d < 5;
    if ((swing || rush) && !this.under && this.state !== 'eat' && !friend) { this.dive(ctx); this.go('roam'); this.fleeT = 6; this.awayFrom(P.pos, 16, this.target); this.hasPop = false; return; }
    this.fleeT = Math.max(0, this.fleeT - dt);
    // trout on the ground: up it comes right under it
    const gf = this.itemNear(ctx, FISH, this.pos, 25);
    if (gf && d > 3 && this.state !== 'eat' && this.state !== 'happy') {
      if (!this.under && this.state !== 'roam') { this.dive(ctx); this.go('roam'); }
      this.target.copy(gf.pos); this.want = 3; this.arrive = 0.2;
      if (this.under && Math.hypot(gf.pos.x - this.pos.x, gf.pos.z - this.pos.z) < 0.4 && ctx.takeItem?.(gf.id) !== false) { this.pop(ctx); this.go('eat'); this.hold = null; this.once('eat'); this.emit('eat', { item: 'fish', from: 'ground' }); }
      return;
    }
    switch (this.state) {
      case 'sleep': {
        this.wantDepth = 1; this.want = 0; this.hold = 'under';
        if (!night) { this.go('roam'); this.hold = null; }
        break;
      }
      case 'roam': {
        if (!this.under) { if (this.holdDone || this.hold !== 'dive') this.dive(ctx); this.want = 0; break; }
        this.hold = null;
        if (night && this.pos.distanceTo(this.home) < 2) { this.go('sleep'); break; }
        // where to come up: near the player (curious), or somewhere round its home
        if (!this.hasPop) {
          if ((d < 28 && this.fleeT <= 0) || friend && d < 60) { const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + (Math.random() - 0.5) * 1.2, r = friend ? 2.5 : 3.5 + Math.random() * 1.5; this.popAt.set(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r); }
          else if (this.fleeT > 0) this.popAt.copy(this.target);
          else { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 12; this.popAt.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r); }
          this.hasPop = true;
        }
        this.target.copy(this.popAt); this.want = friend ? 3.5 : 2.6; this.arrive = 0.3;
        if (Math.hypot(this.popAt.x - this.pos.x, this.popAt.z - this.pos.z) < 0.4 && this.fleeT <= 0.5 && !(night && !friend)) { this.hasPop = false; this.pop(ctx); this.go('surface'); this.nips = 0; this.faceToward(P.pos); }
        else if (Math.hypot(this.popAt.x - this.pos.x, this.popAt.z - this.pos.z) < 0.4) this.hasPop = false;
        break;
      }
      case 'surface': {
        this.want = 0; this.faceToward(P.pos);
        if (fish && d < 12) { this.go('beg'); this.emit('beg'); break; }
        if (friend) { this.go('friend'); break; }
        if (d > 22 || this.st > 14 || night) { this.dive(ctx); this.go('roam'); break; }
        // the player stands still close by: in for the laces
        if (this.st > 2.5 && d < 6 && this.pSpeed < 0.6 && this.nips < 3) { this.go('nip'); this.hold = null; }
        break;
      }
      case 'nip': {
        // dart to the boots, nip, dart back a few metres; two or three goes, then away under
        const back = this.st > 0.3 && this.hold === 'nip';
        if (!back) { this.target.set(P.pos.x, 0, P.pos.z); this.want = 4.5; this.arrive = 0.55; }
        if (!back && d < 0.75) { this.once('nip'); this.nips++; this.emit('nip', { tug: true, item: 'bootlace' }); this.st = 0.31; }
        if (back) {
          this.want = 0;
          if (this.holdDone) { this.hold = null; this.awayFrom(P.pos, 3, this.target); this.want = 4; this.reverse = false; }
          if (this.st > 1.6) { this.go(this.nips >= 3 ? 'roam' : 'surface'); if (this.nips >= 3) this.dive(ctx); this.st = this.nips >= 3 ? 0 : 1.5; }
        }
        if (fish) this.go('beg');
        break;
      }
      case 'beg': {
        this.faceToward(P.pos);
        if (!fish) { this.go(friend ? 'friend' : 'surface'); break; }
        if (d > 1.6) { this.target.copy(P.pos); this.want = 1.6; this.arrive = 1.2; this.hold = null; } else { this.want = 0; this.hold = 'beg'; }
        if (Math.random() < dt * 0.3) this.emit('beg');
        break;
      }
      case 'eat': {
        this.want = 0; this.wantDepth = 0;
        if (this.anim.current === 'happy' || this.st > 3.5) {
          this.trust = Math.min(1, this.trust + 0.5); this.go('happy'); this.hold = 'happy'; this.anim.play('happy'); this.emit('happy');
          if (this.trust >= 1) this.emit('befriended');
        }
        break;
      }
      case 'happy': if (this.holdDone || this.st > 3.8) { this.hold = null; this.go(this.trust >= 1 ? 'friend' : 'surface'); } break;
      case 'friend': {
        if (night && d > 10) { this.dive(ctx); this.go('roam'); break; }
        if (fish && d < 10) { this.go('beg'); break; }
        // tunnels after you while you walk, up beside you when you stop
        if (this.pSpeed > 0.8 && d > 3) { if (!this.under) this.dive(ctx); this.target.copy(P.pos); this.want = 4; this.arrive = 2; }
        else if (this.under && d < 4) { this.pop(ctx); this.want = 0; }
        else if (d > 2.2 && !this.under) { this.target.copy(P.pos); this.want = 1.5; this.arrive = 2; }
        else { this.want = 0; this.faceToward(P.pos); }
        break;
      }
    }
  }
  protected move(ctx: CreatureCtx, dt: number) {
    // it can only travel under the ground or on it; diving and popping take a moment
    if (!this.manual) {
      const rate = this.wantDepth > this.depth ? 1.4 : 2.4;
      this.depth = clamp(this.depth + clamp(this.wantDepth - this.depth, -rate * dt, rate * dt), 0, 1);
      if (this.depth > 0.05 && this.depth < 0.95) this.want = Math.min(this.want, 0.3);
    } else this.depth = 0;
    super.move(ctx, dt);
    this.bodyLift = -0.55 * this.depth;
    // the tunnel: a travelling heave of snow or earth (puffs, clods) and a scuffle now and then
    if (this.under && this.speed > 0.5) {
      this.puffT += dt;
      if (this.puffT > 0.12) {
        this.puffT = 0;
        const snow = G.uSnow.value > 0.3, at = _v.set(this.pos.x + Math.sin(this.heading) * 0.4, this.pos.y + 0.03, this.pos.z + Math.cos(this.heading) * 0.4);
        puffs.emit(at, new THREE.Vector3(0, 0.25, 0), { size: 0.08, grow: 2, life: 0.9, color: snow ? SNOWC : DIRTC, alpha: snow ? 0.5 : 0.3, rise: -0.05, n: 1, spread: 0.3 });
        if (Math.random() < 0.4) debris.emit(snow ? 'sawdust' : 'bark', at, new THREE.Vector3(0, 1.2, 0), 2, { spread: 0.8, color: snow ? new THREE.Color(0.95, 0.96, 1) : new THREE.Color(0.3, 0.22, 0.15), life: 1.5 });
      }
      this.dug += this.speed * dt;
      if (this.dug > 2.5 && ctx.time - this.lastBurrow > 0.8) { this.dug = 0; this.lastBurrow = ctx.time; this.emit('burrow'); }
    }
  }
  protected clipFor(speed: number): string {
    if (this.depth > 0.97 && this.hold !== 'popup') return 'under';
    if (this.state === 'beg' && speed < 0.2) return 'beg';
    if (speed > 1.8) return 'run';
    if (speed > 0.08) return 'walk';
    if (this.state === 'surface') return 'periscope';
    return 'idle';
  }
  protected after() {
    // under the ground there is nothing to draw (the fur and the shadow included)
    this.mesh.visible = this.depth < 0.97 || !!this.manual;
  }
  protected pre(p: Pose) {
    const B = this.skel.bones, blink = clamp(p.c[CH.BLINK], 0, 1);
    for (const s of ['L', 'R']) B[this.bi('eye' + s)].scale.set(1, 1 - blink * 0.8, 1);
    _e.set(-this.params.lookPitch * 0.4, this.params.lookYaw * 0.4, 0);
    void WS_HEAD;
  }
}
export { damp };
