// THE AGROPELTER: a wiry, whip-armed thing that lives in the hollow of a dead snag and pelts anyone who walks under its
// tree with dead branches (model and the snag in agropelter/model.ts).
//
//   const a = new Agropelter({ pos: treeBase, heading: holeFacing }); scene.add(a.object);   // the object holds the
//   a.update(ctx); a.offer('syrup');                                                          // snag and the creature
//   a.branch  // the branch in flight (world position, velocity) or null
//
// Rules (learnable, fair):
//   tree     it lives in the knot-hole of a dead, broken-topped snag; a heap of broken branches at its foot gives it away
//   pelt     walk within ~11 m of its tree and it leans out and throws a dead branch at you every few seconds
//            ('throw' with the projectile; 'hit' with damage if it connects; you can dodge: it aims where you were)
//   leave    keep walking: past ~15 m it ducks back into its hole, jeering
//   syrup    leave maple syrup at the foot of its tree and walk off: it climbs down, takes it and licks it off its long
//            fingers, and leaves you alone for the day (or hold it up to it from right under the tree: it reaches down
//            and snatches it). Twice, and it is your friend: it drops dry kindling for you instead of pelting you
//   nights   it sleeps in its hole from one in the morning until dawn
// Events: emerge, jeer, throw { from, vel, branch }, hit { damage, impulse }, thud, hide, climb, eat, happy, befriended,
//         gift (and ctx.dropItem('kindling')).
import * as THREE from 'three';
import { Cryptid, CH, clipKit, clamp, damp, type Pose, type Clip, type AnimParams } from './base';
import { cryptidLoader } from './kit';
import { agropelterModelGen, agropelterBones, snagModelGen, snagBones, AGROPELTER_MODEL_VERSION, SNAG_MODEL_VERSION, AG_EYE_AX, AG_FUR_SPEC, SNAG } from './agropelter/model';
import { Skel, creatureMaterial } from '../rig';
import type { BoneDef } from '../rig';
import type { CreatureCtx } from '../types';

const AM = cryptidLoader(AGROPELTER_MODEL_VERSION, () => agropelterModelGen(), agropelterBones);
const SM = cryptidLoader(SNAG_MODEL_VERSION, () => snagModelGen(), snagBones);
export const agropelterModel = () => AM.get();
export const agropelterModelAsync = (o: { cache?: boolean } = {}) => AM.load(o);
export const snagModelAsync = (o: { cache?: boolean } = {}) => SM.load(o);

export const AGROPELTER_SOUND: Record<string, string | undefined> = {
  emerge: 'foliage_rustle', jeer: 'hound_yip', throw: 'axe_whoosh', hit: 'branch_break_big', thud: 'branch_snap', hide: 'foliage_rustle', climb: 'foliage_rustle',
  eat: 'hound_chew', happy: 'hound_yip', befriended: 'hound_yip', gift: 'branch_snap',
};
export type AgropelterState = 'lurk' | 'out' | 'throw' | 'hide' | 'reach' | 'down' | 'fetch' | 'up' | 'eat' | 'friend';
const SYRUP = /syrup/i;
/** the creature's origin when it sits in the hollow, relative to the tree base (in the snag's frame: the hole faces +z) */
const HOLE = new THREE.Vector3(0.05, SNAG.holeY - 0.56, -0.04 + SNAG.r * 0.62);
const THROW_AT = 0.74;

function agropelterClips(defs: BoneDef[]): Record<string, Clip> {
  const { I, R, F, gait } = clipKit(defs);
  const SPINE = I('spine'), CHEST = I('chest'), NECK = I('neck'), HEAD = I('head'), JAW = I('jaw');
  const ARM = [I('armL'), I('armR')], ELB = [I('elbL'), I('elbR')], HAND = [I('handL'), I('handR')], FING = [I('fingL'), I('fingR')], CLA = [I('claL'), I('claR')];
  const THIGH = [I('thighL'), I('thighR')], SHIN = [I('shinL'), I('shinR')], EAR = [I('earL'), I('earR')];
  const sin = Math.sin, cos = Math.cos, TAU = Math.PI * 2;
  const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const env = (t: number, a: number, b: number, c: number, d: number) => (t < a ? 0 : t < b ? sm((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - sm((t - c) / (d - c)) : 0);
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, NECK, -a.lookPitch * 0.3 * k, a.lookYaw * 0.35 * k); R(p, HEAD, -a.lookPitch * 0.4 * k, a.lookYaw * 0.45 * k); };
  /** arm k: swing (+ forward/up), out, elbow bend, wrist, finger curl */
  const arm = (p: Pose, k: number, sw: number, out = 0, bend = 0, wrist = 0, curl = 0.3) => { const s = k ? -1 : 1; R(p, ARM[k], -sw, 0, s * out); R(p, ELB[k], -bend); R(p, HAND[k], -wrist); R(p, FING[k], curl); };
  /** in the tree: legs tucked into the hollow (no IK) */
  const tuck = (p: Pose) => { for (let k = 0; k < 2; k++) { F(p, k, 0, 0, 0, 0); R(p, THIGH[k], 1.3); R(p, SHIN[k], -1.8); } };
  const ears = (p: Pose, a: number) => { R(p, EAR[0], 0, 0, a); R(p, EAR[1], 0, 0, -a); };
  return {
    lurk: { loop: true, dur: 6, fade: 0.4, fn: (p, t, a) => {
      // down in the hollow: only the brow and the eyes at the hole, watching
      tuck(p); p.t[2] -= 0.3; p.t[1] -= 0.4; R(p, CHEST, 0.1); R(p, NECK, -0.2); R(p, HEAD, -0.05 + 0.04 * sin(t * 0.7));
      for (let k = 0; k < 2; k++) arm(p, k, 0.2, -0.25, 2.2, 0, 0.8);
      look(p, a, 0.7); ears(p, 0.1 * sin(t * 2));
    } },
    idle: { loop: true, dur: 5, fade: 0.4, fn: (p, t, a) => {
      // out on the lip of the hollow: leaning out, the long arms draped over the edge, fingers drumming on the bark
      tuck(p); p.t[2] += 0.04; R(p, SPINE, 0.2); R(p, CHEST, 0.25); R(p, NECK, -0.35);
      for (let k = 0; k < 2; k++) arm(p, k, 0.55 + 0.04 * sin(t * 1.3 + k), 0.12, 0.9, -0.4, 0.4 + 0.3 * Math.max(0, sin(t * 9 + k * 1.7)));
      look(p, a); ears(p, 0.15 * sin(t * 1.1));
    } },
    jeer: { loop: true, dur: 1.6, fade: 0.25, fn: (p, t, a) => {
      // taunting: bouncing on the lip, slapping the bark with both hands, the jaw chattering, the ears flicking
      const b = Math.abs(sin(t * 6)), sl = Math.max(0, sin(t * 12));
      tuck(p); p.t[1] += 0.03 * b; p.t[2] += 0.05; R(p, SPINE, 0.15); R(p, CHEST, 0.2 - 0.06 * b); R(p, NECK, -0.3);
      for (let k = 0; k < 2; k++) arm(p, k, 0.7 + 0.3 * (k ? sl : 1 - sl), 0.2, 0.6, -0.5, 0.2);
      R(p, JAW, 0.12 + 0.2 * Math.max(0, sin(t * 22))); R(p, HEAD, 0, 0, 0.15 * sin(t * 6)); ears(p, 0.4 * sin(t * 12)); look(p, a, 0.6);
    } },
    throw: { loop: false, dur: 1.6, fade: 0.12, next: 'jeer', fn: (p, t, a) => {
      // the throw: the right arm whips back over the head with the branch, the body coils, then the whole arm cracks
      // forward and down like a whiplash (release at THROW_AT), the body following through
      const wind = env(t, 0, 0.55, 0.62, 0.74), whip = env(t, 0.62, 0.78, 0.95, 1.5);
      tuck(p); p.t[2] += 0.06 + 0.1 * whip; R(p, SPINE, 0.15 - 0.2 * wind + 0.35 * whip, 0.3 * wind - 0.4 * whip); R(p, CHEST, 0.2 - 0.15 * wind + 0.2 * whip, 0.2 * wind - 0.3 * whip);
      R(p, NECK, -0.3); arm(p, 1, 2.9 * wind - 0.3 * whip + 0.5 * (1 - wind) * (1 - whip), 0.2 * wind, 0.4 * wind + 0.1, -0.6 * wind + 0.5 * whip, 0.9 * (1 - whip));
      R(p, CLA[1], 0, 0, -0.15 * wind);
      arm(p, 0, 0.5 + 0.3 * whip, 0.15, 0.8, -0.4, 0.4); R(p, JAW, 0.35 * whip); ears(p, -0.3 * wind); look(p, a, 0.6);
    } },
    hide: { loop: false, dur: 0.6, fade: 0.1, next: 'lurk', fn: (p, t) => {
      // a quick duck back into the hole
      const k = sm(t / 0.5); tuck(p); p.t[2] -= 0.3 * k; p.t[1] -= 0.4 * k; R(p, CHEST, 0.1); for (let j = 0; j < 2; j++) arm(p, j, 0.2 + 0.4 * (1 - k), -0.25 * k, 2.2 * k, 0, 0.8);
    } },
    reach: { loop: false, dur: 1.8, fade: 0.15, next: 'eat', fn: (p, t) => {
      // syrup held up under the tree: it pours half out of the hole, one arm unrolling down the trunk to snatch it
      const k = env(t, 0, 0.6, 1.0, 1.6);
      tuck(p); p.t[2] += 0.1 * k; p.t[1] -= 0.08 * k; R(p, SPINE, 0.6 * k); R(p, CHEST, 0.5 * k); R(p, NECK, -0.6 * k);
      arm(p, 1, -0.25 * k, 0.1, 0.0, 0.2, 0.9 * env(t, 0.9, 1.0, 1.6, 1.8)); arm(p, 0, 0.6, 0.15, 0.9, -0.4, 0.5);
    } },
    eat: { loop: false, dur: 4, fade: 0.25, next: 'happy', fn: (p, t) => {
      // licking syrup off its long fingers, one hand then the other, eyes screwed shut with pleasure
      const k = env(t, 0, 0.3, 3.6, 4), side = Math.floor(t / 1) % 2, lick = Math.max(0, sin(t * 14));
      tuck(p); p.t[2] += 0.04; R(p, SPINE, 0.1); R(p, CHEST, 0.1); R(p, NECK, -0.15); R(p, HEAD, 0.15 * k); R(p, JAW, 0.2 * lick * k);
      arm(p, side, 1.7 * k, -0.25 * k, 2.2 * k, 0.4, 0.2); arm(p, 1 - side, 0.5, 0.1, 1.0, -0.3, 0.5); p.c[CH.SAD] = 0.8 * k;
    } },
    happy: { loop: false, dur: 3, fade: 0.25, next: 'idle', fn: (p, t) => {
      // a hoot and a drum on its chest with both fists, swaying on the lip
      const k = env(t, 0, 0.2, 2.6, 3), dr = Math.max(0, sin(t * 16));
      tuck(p); p.t[2] += 0.04; p.rr[2] += 0.1 * sin(t * 4) * k; R(p, NECK, -0.4 * k); R(p, HEAD, -0.3 * k); R(p, JAW, 0.45 * k * env(t, 0, 0.1, 0.8, 1.1));
      for (let j = 0; j < 2; j++) arm(p, j, 1.0 * k, -0.35 * k, 2.0 * k - 0.3 * (j ? dr : 1 - dr) * k, 0, 1);
      ears(p, 0.5 * sin(t * 10) * k); p.c[CH.SAD] = 0.4 * k;
    } },
    climb: { loop: true, dur: 1, fade: 0.25, fn: (p, t) => {
      // on the trunk, facing it: hand over hand, the feet gripping in turn
      const w = t * TAU, a1 = sin(w), a2 = sin(w + Math.PI);
      p.t[2] -= 0.05; R(p, SPINE, -0.1); R(p, NECK, -0.4);
      arm(p, 0, 2.2 + 0.5 * a1, 0.3, 0.5 + 0.5 * Math.max(0, -a1), -0.3, 0.9); arm(p, 1, 2.2 + 0.5 * a2, 0.3, 0.5 + 0.5 * Math.max(0, -a2), -0.3, 0.9);
      for (let k = 0; k < 2; k++) { F(p, k, 0, 0, 0, 0); const q = k ? a1 : a2; R(p, THIGH[k], 0.9 + 0.4 * q, 0, (k ? -1 : 1) * 0.4); R(p, SHIN[k], -1.2 - 0.4 * q); }
    } },
    walk: { loop: true, dur: 1, fade: 0.3, fn: (p, _t, a) => {
      // on the ground: a bow-legged knuckle-walk, the long arms swinging down to the ground in turn
      const w = a.phase * TAU;
      gait(p, a.phase, 0.6, 0.55, 0.06, [0, 0.5]);
      p.rr[0] += 0.4; p.t[1] -= 0.06; p.rr[2] += 0.06 * sin(w); R(p, NECK, -0.45); R(p, HEAD, -0.15);
      for (let k = 0; k < 2; k++) arm(p, k, 0.55 + 0.55 * sin(w + (k ? Math.PI : 0)), 0.2, 0.2, -0.6, 0.8);
      look(p, a, 0.5);
    } },
  };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _b2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
export class Agropelter extends Cryptid {
  readonly id = 'agropelter';
  readonly name = 'Agropelter';
  readonly favoriteFood = 'syrup';
  readonly rules = [
    'It lives in the knot-hole of a dead, broken-topped snag. A heap of broken branches round the foot of a tree means one lives there.',
    'Walk under its tree and it leans out and pelts you with dead branches. It throws where you are, not where you are going: keep moving.',
    'Keep walking: once you are past, it ducks back into its hole, jeering.',
    'Leave maple syrup at the foot of its tree and walk away: it climbs down for it and leaves you alone for the day.',
    'Feed it twice and it is your friend: it drops dry kindling for you instead of throwing branches.',
    'It sleeps in its hole from one in the morning until dawn.',
  ] as const;
  readonly sounds = AGROPELTER_SOUND;
  declare state: AgropelterState;
  /** the snag it lives in (a child of `object`, at the tree base) */
  readonly snag: THREE.SkinnedMesh;
  /** the branch in flight */
  branch: { pos: THREE.Vector3; vel: THREE.Vector3 } | null = null;
  private holeYaw: number; private onTree = true; private climbY = HOLE.y; private throws = 0; private nextThrow = 1.5; private calmUntil = -1;
  private stickMode: 'hand' | 'air' | 'ground' | 'none' = 'none'; private stickT = 0; private stickRot = new THREE.Quaternion(); private stickSpin = new THREE.Vector3();
  private released = false; private lastGift = -999; private fetchId: string | null = null; private pv = new THREE.Vector3(); private pPrev = new THREE.Vector3();
  private lidAxis: THREE.Vector3[];
  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super(agropelterModel(), agropelterClips(agropelterBones()), { pos: o.pos, heading: o.heading, shineCol: 0xffb050, fur: AG_FUR_SPEC,
      legs: [{ up: 'thighL', lo: 'shinL', foot: 'footL' }, { up: 'thighR', lo: 'shinR', foot: 'footR' }] });
    this.object.name = 'Agropelter';
    this.holeYaw = o.heading ?? 0;
    this.state = 'lurk';
    this.anim.play('lurk');
    this.stride = { walk: 0.55 };
    this.manualSpeed = { walk: 0.7 };
    this.shineK = 1.6;
    // the snag: a static skinned mesh on one bone (so it shares the creature material and its dissolve-free page)
    const sm = SM.get(), sk = new Skel(sm.bones), { mat, depth } = creatureMaterial(sm.tex, sm.sd);
    this.snag = sk.mesh(sm.geo, mat); this.snag.name = 'agropelterSnag'; this.snag.castShadow = true; this.snag.receiveShadow = true; this.snag.customDepthMaterial = depth; this.snag.frustumCulled = false;
    this.object.add(this.snag);
    this.lidAxis = [1, -1].map((s) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * AG_EYE_AX[0], AG_EYE_AX[1], AG_EYE_AX[2])).normalize());
    this.placeOnTree();
  }
  /** the creature's world pose from its place on the tree (or on the ground) */
  private placeOnTree() {
    const c = Math.cos(this.holeYaw), s = Math.sin(this.holeYaw);
    if (this.onTree) {
      // on the trunk: at the hole when climbY is the hole height, hugging the trunk below it
      const k = clamp(this.climbY / HOLE.y, 0, 1), rr = HOLE.z * k + (SNAG.r * 1.25 + 0.16) * (1 - k) + (this.state === 'down' || this.state === 'up' ? 0.12 : 0);
      this.pos.set(this.home.x + HOLE.x * c + rr * s, this.home.y + this.climbY, this.home.z - HOLE.x * s + rr * c);
      this.heading = this.state === 'down' || this.state === 'up' ? this.holeYaw + Math.PI : this.holeYaw;
    }
  }
  /** the player is close enough to the trunk to hand it something */
  private get dTree() { return this.ctx ? Math.hypot(this.ctx.player.pos.x - this.home.x, this.ctx.player.pos.z - this.home.z) : 99; }
  get calm() { return this.trust >= 1 || (this.ctx && this.ctx.time < this.calmUntil); }

  offer(item: string): boolean {
    if (!SYRUP.test(item)) return false;
    if (!this.onTree || this.climbY < HOLE.y - 0.1 || this.state === 'eat' || this.state === 'reach') return false;
    if (this.dTree > 3.2) return false;
    this.go('reach'); this.once('reach'); this.emit('eat', { item: 'syrup', from: 'hand' });
    return true;
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player, dT = this.dTree, asleep = ctx.hour >= 1 && ctx.hour < 5;
    // the player's velocity (for nothing clever: it aims where you are)
    this.pv.copy(P.pos).sub(this.pPrev).multiplyScalar(1 / Math.max(dt, 1e-3)); this.pPrev.copy(P.pos);
    this.lookAt = P.pos; this.want = 0;
    // syrup left at the foot of the tree: down it comes once nobody is close
    const sy = this.itemNear(ctx, SYRUP, this.home, 4.5);
    if (sy && dT > 6 && (this.state === 'lurk' || this.state === 'out' || this.state === 'friend')) { this.fetchId = sy.id; this.go('down'); this.emit('climb'); }
    switch (this.state) {
      case 'lurk': {
        this.hold = 'lurk';
        if (!asleep && dT < (this.calm ? 14 : 11)) { this.go(this.trust >= 1 ? 'friend' : 'out'); this.hold = null; this.emit('emerge'); this.throws = 0; this.nextThrow = 0.8 + Math.random(); }
        break;
      }
      case 'out': {
        this.hold = !this.calm && this.st < 2 && this.throws > 0 ? 'jeer' : null;
        if (dT > 15 || asleep) { this.go('hide'); this.once('hide'); this.emit('hide'); if (this.throws) this.emit('jeer'); break; }
        if (!this.calm) {
          this.nextThrow -= dt;
          if (this.nextThrow <= 0 && this.throws < 8 && this.stickMode !== 'air') { this.go('throw'); this.once('throw'); this.released = false; this.stickMode = 'hand'; this.throws++; }
          else if (Math.random() < dt * 0.4) this.emit('jeer');
        }
        break;
      }
      case 'throw': {
        if (!this.released && this.anim.time >= THROW_AT) { this.released = true; this.release(ctx); }
        if (this.holdDone || this.st > 1.7) { this.go('out'); this.nextThrow = 2.2 + Math.random() * 1.6; }
        break;
      }
      case 'hide': if (this.holdDone || this.st > 0.7) this.go('lurk'); break;
      case 'reach': {
        if (this.anim.current === 'eat' || this.st > 1.8) { this.go('eat'); this.holdClip('eat'); }
        break;
      }
      case 'down': {
        this.onTree = true; this.hold = 'climb'; this.climbY = Math.max(0, this.climbY - dt * 1.1);
        if (this.climbY <= 0.001) { this.onTree = false; this.hold = null; this.go('fetch'); this.pos.y = ctx.heightAt(this.pos.x, this.pos.z); }
        break;
      }
      case 'fetch': {
        const it = (ctx.items ?? []).find((i) => i.id === this.fetchId);
        if (!it) { this.go('up'); break; }
        this.target.copy(it.pos); this.want = 0.8; this.arrive = 0.3;
        if (Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z) < 0.5) { ctx.takeItem?.(it.id); this.fetchId = null; this.emit('eat', { item: 'syrup', from: 'ground' }); this.go('up'); this.pendingEat = true; }
        break;
      }
      case 'up': {
        if (!this.onTree) {
          // walk back to the foot of the trunk first
          const c = Math.cos(this.holeYaw), s = Math.sin(this.holeYaw), bx = this.home.x + (SNAG.r * 1.25 + 0.28) * s, bz = this.home.z + (SNAG.r * 1.25 + 0.28) * c;
          this.target.set(bx, 0, bz); this.want = 0.8; this.arrive = 0.2;
          if (Math.hypot(bx - this.pos.x, bz - this.pos.z) < 0.3) { this.onTree = true; this.climbY = 0; }
          break;
        }
        this.hold = 'climb'; this.climbY = Math.min(HOLE.y, this.climbY + dt * 1.1);
        if (this.climbY >= HOLE.y) { this.hold = null; if (this.pendingEat) { this.pendingEat = false; this.go('eat'); this.once('eat'); } else this.go('lurk'); }
        break;
      }
      case 'eat': {
        if ((this.anim.current === 'happy' || this.st > 4.2) && !this.fed) {
          this.fed = true; this.holdClip('happy'); const now = this.gainTrust(0.5); this.calmUntil = ctx.time + 1800; this.emit('happy');
          if (now) this.emit('befriended');
        }
        if (this.fed && (this.holdDone || this.st > 8)) { this.fed = false; this.go(this.trust >= 1 ? 'friend' : 'out'); this.hold = null; }
        break;
      }
      case 'friend': {
        this.hold = null;
        if (dT > 15 || asleep) { this.go('hide'); this.once('hide'); break; }
        // a gift: a bundle of dry dead twigs dropped at your feet (kindling), now and then
        if (dT < 5 && ctx.time - this.lastGift > 120 && ctx.dropItem) {
          this.lastGift = ctx.time; this.once('happy'); this.emit('gift', { item: 'kindling' });
          ctx.dropItem('kindling', new THREE.Vector3(P.pos.x + (Math.random() - 0.5), ctx.heightAt(P.pos.x, P.pos.z), P.pos.z + (Math.random() - 0.5)));
        }
        if (this.hold === 'happy' && this.holdDone) this.hold = null;
        break;
      }
    }
  }
  private pendingEat = false; private fed = false; private hitDone = false;
  /** let go of the branch: aimed at the player's head (where they are now), flying a short arc */
  private release(ctx: CreatureCtx) {
    const from = this.handWorld(_a), P = ctx.player.pos, to = _b.set(P.x, P.y - 0.25, P.z);
    const d = Math.hypot(to.x - from.x, to.z - from.z), T = clamp(0.35 + d / 14, 0.4, 1.3);
    const vel = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y + 0.5 * 9.8 * T * T) / T, (to.z - from.z) / T);
    this.branch = { pos: from.clone(), vel }; this.hitDone = false;
    this.stickMode = 'air'; this.stickT = 0;
    this.stickSpin.set(Math.random() * 10 - 5, Math.random() * 6 - 3, 8 + Math.random() * 6);
    this.emit('throw', { from: from.clone(), vel: vel.clone(), branch: true });
  }
  private handWorld(out: THREE.Vector3) { this.object.updateMatrixWorld(true); return out.copy(this.skel.P[this.bi('handR')]).applyMatrix4(this.mesh.matrixWorld); }
  protected move(ctx: CreatureCtx, dt: number) {
    if (!this.manual && !this.onTree) {
      // on the ground it walks like anything else (in world space)
      super.move(ctx, dt);
    } else if (!this.manual) this.placeOnTree();
    // the object stays at the tree base, turned to the hole; the creature mesh moves inside it
    this.object.position.copy(this.home); this.object.rotation.set(0, this.holeYaw, 0);
    if (this.manual) {
      // the test page: in the hollow for the tree clips, at the foot of the tree for the walk, half way up for the climb
      const m = this.manual;
      if (m === 'walk' || m === 'idle_ground') this.mesh.position.set(0, 0, 1.4), this.mesh.rotation.set(0, 0, 0);
      else if (m === 'climb') this.mesh.position.set(HOLE.x, 1.4, SNAG.r * 1.25 + 0.28), this.mesh.rotation.set(0, Math.PI, 0);
      else this.mesh.position.copy(HOLE), this.mesh.rotation.set(0, 0, 0);
      this.speed = this.manualSpeed[m] ?? 0; return;
    }
    const c = Math.cos(-this.holeYaw), s = Math.sin(-this.holeYaw), dx = this.pos.x - this.home.x, dz = this.pos.z - this.home.z;
    this.mesh.position.set(dx * c + dz * s, this.pos.y - this.home.y, -dx * s + dz * c);
    this.mesh.rotation.set(0, this.heading - this.holeYaw, 0);
  }
  protected clipFor(speed: number): string {
    if (!this.onTree) return speed > 0.05 ? 'walk' : 'idle';
    if (this.state === 'lurk') return 'lurk';
    return 'idle';
  }
  protected pre(p: Pose) {
    const B = this.skel.bones, blink = clamp(Math.max(p.c[CH.BLINK], p.c[CH.SAD] * 0.7), 0, 1);
    B[this.bi('lidL')].quaternion.setFromAxisAngle(this.lidAxis[0], 0.1 + blink * 1.3);
    B[this.bi('lidR')].quaternion.setFromAxisAngle(this.lidAxis[1], 0.1 + blink * 1.3);
    _e.set(-this.params.lookPitch * 0.5, this.params.lookYaw * 0.5, 0);
    B[this.bi('eyeL')].quaternion.setFromEuler(_e); B[this.bi('eyeR')].quaternion.setFromEuler(_e);
  }
  protected postIK() {
    // the branch: in the right hand while it winds up, flying (simulated in after()), lying where it fell, or gone.
    // A stick vertex lands at P_hips + Q_hips (position + quat (v - rest)), so its middle goes where `position` says.
    const S = this.skel, k = this.bi('stick'), hq = _q.copy(S.Q[0]).invert();
    const holding = this.stickMode === 'hand' || (this.manual === 'throw' && this.anim.time < THROW_AT);
    let at: THREE.Vector3 | null = null, rot: THREE.Quaternion | null = null;
    if (holding) { at = _a.copy(S.P[this.bi('handR')]).add(_v.set(0, -0.07, 0.02).applyQuaternion(S.Q[this.bi('handR')])); rot = S.Q[this.bi('handR')]; }
    else if ((this.stickMode === 'air' || this.stickMode === 'ground') && this.branch) {
      this.object.updateMatrixWorld(true);
      at = _a.copy(this.branch.pos).applyMatrix4(_m.copy(this.mesh.matrixWorld).invert());
      rot = _b2.copy(this.stickRot).premultiply(_q2.setFromAxisAngle(_v.set(0, 1, 0), -(this.mesh.rotation.y + this.holeYaw)));
    }
    if (at && rot) {
      S.bones[k].position.copy(at).sub(S.P[0]).applyQuaternion(hq);
      S.bones[k].quaternion.copy(hq).multiply(rot);
      S.bones[k].scale.setScalar(1);
    } else S.bones[k].scale.setScalar(0.0001);
  }
  protected after(ctx: CreatureCtx, dt: number) {
    if (this.stickMode !== 'air' || !this.branch) {
      if (this.stickMode === 'ground') { this.stickT += dt; if (this.stickT > 15) { this.stickMode = 'none'; this.branch = null; } }
      return;
    }
    const b = this.branch;
    b.vel.y -= 9.8 * dt; b.pos.addScaledVector(b.vel, dt); this.stickT += dt;
    this.stickRot.multiply(_q.setFromEuler(_e.set(this.stickSpin.x * dt, this.stickSpin.y * dt, this.stickSpin.z * dt)));
    // the player: a capsule from the feet to the eyes
    const P = ctx.player.pos, cy = clamp(b.pos.y, P.y - 1.6, P.y), hd = Math.hypot(b.pos.x - P.x, cy - b.pos.y, b.pos.z - P.z);
    if (hd < 0.38 && this.stickT > 0.1 && !this.hitDone) {
      this.hitDone = true;
      this.emit('hit', { damage: 0.12, impulse: new THREE.Vector3(b.vel.x, 0, b.vel.z).multiplyScalar(0.25).setY(0.5) });
      b.vel.multiplyScalar(-0.25); b.vel.y = 1.5;
    }
    const g = ctx.heightAt(b.pos.x, b.pos.z) + 0.04;
    if (b.pos.y <= g) { b.pos.y = g; this.stickMode = 'ground'; this.stickT = 0; this.emit('thud', { at: b.pos.clone() }); this.stickRot.setFromEuler(_e.set(0, Math.random() * 6, Math.PI / 2)); }
    else if (this.stickT > 4) { this.stickMode = 'none'; this.branch = null; }
  }
}
