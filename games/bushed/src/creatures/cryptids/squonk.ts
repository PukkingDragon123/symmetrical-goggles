// THE SQUONK: a small, saggy, warty, perpetually weeping creature of the dark wet fir woods (model in squonk/model.ts).
//
//   const s = new Squonk({ pos }); scene.add(s.object); s.update(ctx); s.offer('berries');
//
// Rules (learnable, gentle):
//   weeps    it sobs all the time (you hear it before you see it) and leaves a trail of tear spots behind it. The tears
//            are a fluid simulation (src/gfx/tears): they well up in the inner corners of its eyes, run down its face,
//            drip from its jowls, splash and puddle on the ground; it sobs in bursts, fear floods them, and now and then
//            it shakes its head and sprays them about
//   dusk     it wanders at dusk and through the night; by day it hides curled up under the ferns, crying quietly
//   shy      it flees anyone who comes within ~9 m standing up (~4 m crouching) and cowers behind a tree, peeking out
//   melts    corner it, chase it, grab at it or shine a light in its face and it dissolves into a puddle of tears (its
//            body sags and runs, a sheet of water slumps out over the ground and runs downhill); the puddle pulls itself
//            back together once you have been gone for a while
//   berries  wild blueberries stop the crying: crouch and hold them out and it creeps up to you; feed it and it smiles
//            (the tears stop for a while); feed it three times and it follows you about at dusk
// Events: sob, wail, flee, cower, peek, dissolve, reform, sniff, eat, happy, befriended, step.
import * as THREE from 'three';
import { Cryptid, CH, clipKit, daylight, clamp, damp, type Pose, type Clip, type AnimParams } from './base';
import { cryptidLoader, REG } from './kit';
import { squonkModelGen, squonkBones, SQUONK_MODEL_VERSION, SQ_EYE_AX, SQ_TEAR, SQ_DRIPS } from './squonk/model';
import { TearFluid } from '../../gfx/tears';
import type { BoneDef } from '../rig';
import type { CreatureCtx } from '../types';

const SM = cryptidLoader(SQUONK_MODEL_VERSION, () => squonkModelGen(), squonkBones);
export const squonkModel = () => SM.get();
export const squonkModelAsync = (o: { cache?: boolean } = {}) => SM.load(o);

export const SQUONK_SOUND: Record<string, string | undefined> = {
  sob: 'hound_whine', wail: 'hound_whine', flee: 'foliage_rustle', dissolve: 'foot_mud', reform: 'foot_mud', sniff: 'hound_sniff',
  eat: 'hound_chew', happy: 'hound_yip', befriended: 'hound_yip', step: 'foot_forest',
};
export type SquonkState = 'hide' | 'wander' | 'flee' | 'cower' | 'curious' | 'eat' | 'happy' | 'melt' | 'puddle' | 'reform' | 'friend';
const BERRY = /berr/i;
const STRIDE = { walk: 0.22, run: 0.36 };

function squonkClips(defs: BoneDef[]): Record<string, Clip> {
  const { I, R, F, gait } = clipKit(defs);
  const BODY = I('body'), BELLY = I('belly'), CHEST = I('chest'), NECK = I('neck'), HEAD = I('head'), JAW = I('jaw'), NOSE = I('nose'), HIPS = I('hips'), TAIL = I('tail');
  const EAR = [I('earL'), I('earR')], EAR2 = [I('ear2L'), I('ear2R')];
  const sin = Math.sin, cos = Math.cos, TAU = Math.PI * 2;
  const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const env = (t: number, a: number, b: number, c: number, d: number) => (t < a ? 0 : t < b ? sm((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - sm((t - c) / (d - c)) : 0);
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, NECK, -a.lookPitch * 0.2 * k, a.lookYaw * 0.3 * k); R(p, HEAD, -a.lookPitch * 0.35 * k, a.lookYaw * 0.4 * k); };
  /** ears: a swing out and back, a droop */
  const ears = (p: Pose, sw: number, droop = 0, back = 0) => { for (let k = 0; k < 2; k++) { const s = k ? -1 : 1; R(p, EAR[k], back * 0.4, 0, s * (droop * 0.3 + sw * 0.25)); R(p, EAR2[k], back * 0.3, 0, s * sw * 0.3); } };
  /** a sob's heave h (0..1) on the body: the shoulders heave, the head drops, a sniffle through the nose; the heave
   *  goes out on channel C (each one squeezes out a gush of tears) */
  const heave = (p: Pose, t: number, h: number, k: number, shud: number) => {
    const sh = sin(t * 28) * 0.012 * shud;
    R(p, CHEST, -0.06 * h, 0, sh); R(p, NECK, 0.05 * h); R(p, HEAD, 0.1 * h + 0.06 * k, 0, sh * 2); R(p, JAW, 0.12 * h); R(p, NOSE, -0.08 * h);
    p.t[1] += 0.008 * h; p.c[CH.SAD] = Math.max(p.c[CH.SAD], 0.8 * k); p.c[CH.FX] = Math.max(p.c[CH.FX], k); p.c[CH.C] = Math.max(p.c[CH.C], h);
  };
  /** steady sobs, one every `period` seconds */
  const sob = (p: Pose, t: number, k = 1, period = 1.7) => {
    const ph = (t % period) / period, h = (ph < 0.25 ? sin(ph / 0.25 * Math.PI) : 0) * k;
    heave(p, t, h, k, env(ph, 0, 0.05, 0.25, 0.35) * k);
  };
  /** sobs in a burst, quickening, then a lull: at these times (s), these strengths */
  const BURST = [[0.15, 0.7], [1.0, 1], [1.72, 1], [2.38, 0.9], [2.95, 0.55]] as const;
  const burst = (p: Pose, t: number, k = 1) => {
    let h = 0, sh = 0;
    for (const [at, a] of BURST) { const u = (t - at) / 0.46; if (u > 0 && u < 1) { h = Math.max(h, sin(u * Math.PI) * a); sh = Math.max(sh, env(u, 0, 0.1, 0.5, 0.8) * a); } }
    heave(p, t, h * k, k, sh * k);
  };
  return {
    idle: { loop: true, dur: 6.8, fade: 0.5, fn: (p, t, a) => {
      burst(p, t, 1); ears(p, 0.08 * sin(t * 0.7), 0.4); R(p, BELLY, 0.03 * sin(t * 1.1)); R(p, TAIL, 0, 0.1 * sin(t * 0.6));
      // a long miserable look round now and then
      R(p, HEAD, 0, 0.3 * sin(t * 0.25 * TAU) * env(t % 6.8, 3, 3.8, 5, 6)); look(p, a, 0.5);
    } },
    walk: { loop: true, dur: 1, fade: 0.35, fn: (p, t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.62, STRIDE.walk, 0.03, [0, 0.5, 0.75, 0.25]);
      // the shuffle: the whole loose hide sways and jiggles a beat behind the body
      p.rr[2] += 0.07 * sin(w); p.t[1] += 0.006 * cos(w * 2); R(p, BELLY, 0.04 * cos(w * 2 - 0.8), 0, -0.07 * sin(w - 0.7));
      R(p, HEAD, 0.08 + 0.03 * cos(w * 2), 0, -0.05 * sin(w)); ears(p, 0.25 * sin(w - 0.6), 0.3); R(p, TAIL, 0, 0.3 * sin(w));
      p.c[CH.SAD] = 0.85; p.c[CH.FX] = 1; look(p, a, 0.4);
      void t;
    } },
    run: { loop: true, dur: 1, fade: 0.2, fn: (p, _t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.48, STRIDE.run, 0.05, [0, 0.12, 0.55, 0.67]);
      // the scurry: head down, ears streaming, the hide bouncing
      p.t[1] += 0.015 * Math.abs(sin(w)); p.rr[0] += 0.05 * sin(w * 2); R(p, BELLY, 0.08 * cos(w * 2 - 1));
      R(p, NECK, 0.15); R(p, HEAD, 0.12); ears(p, 0.15 * sin(w * 2), 0, 0.8); R(p, JAW, 0.15);
      p.c[CH.SAD] = 1; p.c[CH.FX] = 1;
    } },
    hide: { loop: true, dur: 5.1, fade: 0.8, fn: (p, t) => {
      // curled up in a heap, the face pressed into its forepaws, sobbing quietly
      p.t[1] -= 0.035; R(p, NECK, 0.35); R(p, HEAD, 0.45); R(p, CHEST, 0.15); ears(p, 0, 1);
      F(p, 0, -0.02, 0.0, 0.07); F(p, 1, 0.02, 0.0, 0.07); F(p, 2, 0.03, 0, 0.04); F(p, 3, -0.03, 0, 0.04);
      sob(p, t, 0.6, 2.55); p.c[CH.BLINK] = 1;
    } },
    peek: { loop: true, dur: 6, fade: 0.5, fn: (p, t, a) => {
      // cowering behind a tree: low, then the head lifts and turns to peep at you, then ducks again
      const up = env(t, 0.8, 1.6, 3.2, 4.0);
      p.t[1] -= 0.03 * (1 - up); R(p, NECK, 0.3 * (1 - up) - 0.1 * up); R(p, HEAD, 0.35 * (1 - up), 0.15 * up); ears(p, 0, 0.6 + 0.3 * (1 - up));
      look(p, a, up); p.c[CH.SAD] = 0.9; p.c[CH.FX] = 1;
    } },
    sniff: { loop: true, dur: 3, fade: 0.4, fn: (p, t, a) => {
      // berries! the nose up and twitching, the ears half lifted, the tears drying up
      R(p, NECK, -0.15); R(p, HEAD, -0.12 + 0.03 * sin(t * 8)); R(p, NOSE, -0.12 * Math.max(0, sin(t * 11)));
      ears(p, 0.1 * sin(t * 2), -0.3); look(p, a, 0.8); p.c[CH.SAD] = 0.2; R(p, TAIL, 0, 0.3 * sin(t * 6));
    } },
    eat: { loop: false, dur: 3.4, fade: 0.25, next: 'happy', fn: (p, t) => {
      // it takes the berries in both forepaws and nibbles, eyes closing with pleasure
      const dn = env(t, 0, 0.4, 2.9, 3.3), nib = Math.max(0, sin(t * 13)) * env(t, 0.5, 0.7, 2.8, 3.1);
      R(p, NECK, 0.15 * dn); R(p, HEAD, 0.25 * dn); R(p, JAW, 0.2 * nib); R(p, NOSE, -0.06 * nib);
      F(p, 0, -0.02 * dn, 0.06 * dn, 0.06 * dn, 1 - 0.3 * dn); F(p, 1, 0.02 * dn, 0.06 * dn, 0.06 * dn, 1 - 0.3 * dn);
      p.c[CH.SAD] = -0.7 * dn; p.c[CH.BLINK] = 0.6 * dn; ears(p, 0.05 * sin(t * 4), 0.2);
    } },
    happy: { loop: false, dur: 3.6, fade: 0.3, next: 'idle', fn: (p, t) => {
      // the rarest sight in the woods: it smiles, the ears lift, it gives a little hop and wiggles its whole hide
      const k = env(t, 0, 0.3, 3.0, 3.6), hop = Math.max(0, sin(t * 6.5)) * env(t, 0.4, 0.6, 2.2, 2.6);
      p.t[1] += 0.035 * hop; p.rr[2] += 0.08 * sin(t * 9) * k; R(p, BELLY, 0.06 * sin(t * 9 - 1) * k);
      R(p, HEAD, -0.12 * k, 0.1 * sin(t * 3)); ears(p, 0.35 * sin(t * 9), -0.4 * k); R(p, TAIL, 0, 0.6 * sin(t * 12) * k);
      p.c[CH.SAD] = -1 * k; p.c[CH.FX] = 0;
    } },
    shake: { loop: false, dur: 1.25, fade: 0.12, next: 'idle', fn: (p, t) => {
      // the tears get too much: it screws its eyes shut and shakes its head like a wet dog, ears and jowls flapping,
      // and the tears fly off it
      const k = env(t, 0, 0.14, 0.82, 1.15), w = sin(t * TAU * 5.5);
      R(p, NECK, 0.05 * k, 0.32 * w * k, 0.08 * w * k); R(p, HEAD, 0.04 * k, 0.5 * w * k, 0.22 * w * k);
      R(p, CHEST, 0, -0.06 * w * k, -0.03 * w * k); p.rr[1] -= 0.04 * w * k;
      ears(p, -1.1 * w * k, 0.2 * (1 - k)); R(p, JAW, 0.06 * k);
      p.c[CH.SAD] = 0.8; p.c[CH.FX] = 1; p.c[CH.BLINK] = Math.max(p.c[CH.BLINK], k);
    } },
    melt: { loop: false, dur: 2.6, fade: 0.1, next: 'puddle', fn: (p, t) => {
      // cornered: a wail, the whole body shudders, sags, and runs down into a spreading puddle of tears (the slump and
      // the water are the tear system's, driven by channel A)
      const wail = env(t, 0, 0.2, 0.9, 1.2), shud = sin(t * 40) * 0.03 * env(t, 0.1, 0.3, 1.4, 1.8), m = sm((t - 0.7) / 1.8);
      R(p, HEAD, -0.3 * wail, shud); R(p, JAW, 0.45 * wail); R(p, NECK, -0.15 * wail); ears(p, shud * 3, 0.6 * m);
      p.rr[2] += shud; p.c[CH.SAD] = 1; p.c[CH.FX] = 1; p.c[CH.A] = m;
      for (let k = 0; k < 4; k++) F(p, k, 0, 0, 0, 1 - m);
    } },
    puddle: { loop: true, dur: 4, fade: 0.1, fn: (p, t) => { p.c[CH.A] = 1; p.c[CH.B] = 0.02 * sin(t * 1.5); for (let k = 0; k < 4; k++) F(p, k, 0, 0, 0, 0); } },
    reform: { loop: false, dur: 2.8, fade: 0.1, next: 'idle', fn: (p, t) => {
      // the puddle draws itself up into a squonk again, shakes, and sniffles
      const m = 1 - sm((t - 0.2) / 1.9), shake = sin(t * 30) * 0.025 * env(t, 1.9, 2.1, 2.4, 2.8);
      p.c[CH.A] = m; p.rr[2] += shake; ears(p, shake * 6, 0.5); p.c[CH.SAD] = 0.9; p.c[CH.FX] = 1;
      for (let k = 0; k < 4; k++) F(p, k, 0, 0, 0, 1 - m);
    } },
  };
  void HIPS; void BODY;
}

const _v = new THREE.Vector3(), _e = new THREE.Euler(), _q2 = new THREE.Quaternion();
/** tear production per eye (m3/s): a quiet weep, its ordinary misery, fear's flood, the wail as it melts */
const RATE = { quiet: 14e-9, weep: 34e-9, scared: 120e-9, wail: 320e-9 };
/** beyond this (m) nobody can see the tears: no simulation, just the trail of spots */
const SIM_R = 60;

const _up = new THREE.Vector3(0, 1, 0);
const _tf: { dt: number; heightAt(x: number, z: number): number } = { dt: 0, heightAt: () => 0 };

export class Squonk extends Cryptid {
  readonly id = 'squonk';
  readonly name = 'Squonk';
  readonly favoriteFood = 'berries';
  readonly rules = [
    'It weeps all the time. Listen for the sobbing in the wet fir woods at dusk, and follow the trail of tear spots.',
    'By day it hides curled up under the ferns. It wanders from dusk through the night.',
    'It runs from anyone who comes close standing up. Crouch, go slowly, and it only watches you from behind a tree.',
    'Corner it, chase it, grab at it or shine a light in its face and it dissolves into a puddle of tears.',
    'Leave the puddle alone. When nobody is near, it pulls itself back together.',
    'Wild blueberries stop the crying. Crouch and hold some out; feed it three times and it follows you at dusk.',
  ] as const;
  readonly sounds = SQUONK_SOUND;
  declare state: SquonkState;
  /** the tears: drops on its face and in the air, the wet film on its skin, the puddles and the sheet it melts into */
  readonly tears: TearFluid;
  /** the trail of tear spots (the puddles' instanced mesh) */
  get trail(): { mesh: THREE.InstancedMesh } { return this.tears.puddles; }
  private dryUntil = -1; private glare = 0; private chaseT = 0; private lastSob = 0; private trailD = 0; private puddleT = 0; private lastPos = new THREE.Vector3();
  private lidAxis: THREE.Vector3[]; private eyeAxis: THREE.Vector3[];
  private melt = 0; private cry = 0; private nextShake = 12;
  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super(squonkModel(), squonkClips(squonkBones()), { pos: o.pos, heading: o.heading, shineCol: 0xa8c8ff, legs: [
      { up: 'fuL', lo: 'flL', foot: 'ffL', fore: true }, { up: 'fuR', lo: 'flR', foot: 'ffR', fore: true },
      { up: 'huL', lo: 'hlL', foot: 'hfL' }, { up: 'huR', lo: 'hlR', foot: 'hfR' }] });
    this.object.name = 'Squonk';
    this.state = 'wander';
    this.stride = { walk: STRIDE.walk, run: STRIDE.run };
    this.manualSpeed = { walk: 0.35, run: 1.6 };
    this.stepSound = undefined;
    this.shineK = 0.8;
    this.eyeAxis = [1, -1].map((s) => new THREE.Vector3(s * SQ_EYE_AX[0], SQ_EYE_AX[1], SQ_EYE_AX[2]).normalize());
    this.lidAxis = this.eyeAxis.map((ax) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), ax).normalize());
    // the tears run on the skinned mesh from its anchors (mesh-agnostic: a new body only needs the same anchors)
    const v = (p: readonly number[], sx = 1) => new THREE.Vector3(p[0] * sx, p[1], p[2]);
    this.tears = new TearFluid({
      mesh: this.mesh, head: 'head',
      sources: [v(SQ_TEAR), v(SQ_TEAR, -1)], drips: [v(SQ_DRIPS[0]), v(SQ_DRIPS[1]), v(SQ_DRIPS[1], -1)],
      regs: [REG.head], bodyRegs: [REG.torso, REG.head, REG.jaw, REG.legs, REG.tail],
      melt: { x: 0, z: -0.04, r: 0.42, ground: 0 },
    });
  }
  get crying() { return !(this.ctx && this.ctx.time < this.dryUntil) && this.state !== 'puddle' && this.state !== 'happy' && this.state !== 'eat'; }

  offer(item: string): boolean {
    if (!BERRY.test(item)) return false;
    if (this.state === 'melt' || this.state === 'puddle' || this.state === 'reform' || this.state === 'eat') return false;
    if (this.dist > 2.4) return false;
    this.go('eat'); this.once('eat'); this.want = 0;
    this.emit('eat', { item: 'berries' });
    return true;
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player, d = this.dist, berries = BERRY.test(P.held), day = daylight(ctx.hour) > 0.75;
    const friend = this.trust >= 1;
    const scareR = friend ? 0 : berries && P.crouch ? 1.6 : P.crouch ? 4.2 : 9;
    this.lookAt = null; this.face = null; this.reverse = false; this.arrive = 0.35;
    // a flashlight in its face, close up: it can bear it for a moment, then it goes to pieces
    const lit = P.light && d < 7 && this.viewAngle(ctx) < 0.22;
    this.glare = lit ? this.glare + dt : Math.max(0, this.glare - dt * 2);
    const caught = d < 1.25 && this.pSpeed > 0.8 && !friend && this.state !== 'eat';
    if (this.state !== 'melt' && this.state !== 'puddle' && this.state !== 'reform' && (caught || this.glare > 1.6 || this.chaseT > 4)) {
      this.go('melt'); this.once('melt'); this.want = 0; this.chaseT = 0; this.glare = 0; this.emit('wail'); return;
    }
    if (this.crying && ctx.time - this.lastSob > 3.2 && d < 40 && this.state !== 'hide') { this.lastSob = ctx.time + Math.random() * 2; this.emit('sob'); }
    // too many tears: it stops and shakes them off (they fly)
    if (this.hold === 'shake') { if (!this.holdDone) { this.want = 0; return; } this.hold = null; }
    if (this.crying && !this.hold && this.t > this.nextShake && this.tears.stats.onFace >= 5 && (this.state === 'wander' || this.state === 'cower' || this.state === 'friend')) {
      this.nextShake = this.t + 14 + Math.random() * 18; this.once('shake'); this.want = 0; return;
    }
    // berries left on the ground: it creeps over when nobody is near
    const gb = this.itemNear(ctx, BERRY, this.pos, 20);
    if (gb && d > 6 && (this.state === 'wander' || this.state === 'cower' || this.state === 'hide' || this.state === 'friend')) {
      this.target.copy(gb.pos); this.want = 0.35; this.arrive = 0.25;
      if (Math.hypot(gb.pos.x - this.pos.x, gb.pos.z - this.pos.z) < 0.4 && ctx.takeItem?.(gb.id) !== false) { this.go('eat'); this.once('eat'); this.emit('eat', { item: 'berries', from: 'ground' }); }
      return;
    }
    switch (this.state) {
      case 'hide': {
        this.want = 0;
        if (!day) { this.go('wander'); break; }
        if (d < scareR * 0.6 || (d < scareR && this.pSpeed > 2.5)) { this.go('flee'); this.emit('flee'); }
        else if (berries && P.crouch && d < 8) this.go('curious');
        break;
      }
      case 'wander': {
        if (day && !friend) { this.target.copy(this.home); this.want = 0.3; if (this.pos.distanceTo(this.home) < 1) this.go('hide'); break; }
        if (friend) { this.go('friend'); break; }
        if (d < scareR) { this.go('flee'); this.emit('flee'); break; }
        if (berries && d < 12) { this.go('curious'); this.emit('sniff'); break; }
        if (this.st > 5 + (this.t % 6)) { this.st = 0; const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 10; this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r); }
        this.want = 0.3;
        break;
      }
      case 'flee': {
        // away from the player toward the nearest tree that puts its trunk between them
        this.chaseT = d < 3.5 && this.pSpeed > 1.2 ? this.chaseT + dt : Math.max(0, this.chaseT - dt * 0.5);
        const hide = this.hideSpot(ctx);
        if (hide) this.target.copy(hide); else this.awayFrom(P.pos, 8, this.target);
        this.want = 1.6; this.arrive = 0.3;
        if ((hide && this.pos.distanceTo(_v.set(hide.x, this.pos.y, hide.z)) < 0.4) || d > 16) { this.go('cower'); this.emit('cower'); }
        break;
      }
      case 'cower': {
        this.want = 0; this.lookAt = P.pos; this.faceToward(P.pos);
        if (d < scareR * 0.75 && this.st > 1) { this.go('flee'); break; }
        if (berries && (P.crouch || d > 6)) { this.go('curious'); this.emit('sniff'); break; }
        if (d > 18 && this.st > 6) this.go('wander');
        if (Math.random() < dt * 0.15) this.emit('peek');
        break;
      }
      case 'curious': {
        this.lookAt = P.pos;
        if (!berries) { this.go(friend ? 'friend' : 'cower'); break; }
        if (!P.crouch && d < 5 && !friend && this.pSpeed > 0.3) { this.go('flee'); this.emit('flee'); break; }
        if (d > 1.5) { this.target.copy(P.pos); this.want = 0.3; this.arrive = 1.3; }
        else { this.want = 0; this.faceToward(P.pos); }
        break;
      }
      case 'eat': {
        this.want = 0;
        if (this.anim.current === 'happy' || this.st > 3.5) {
          const now = this.gainTrust(0.34); this.dryUntil = ctx.time + 240;
          this.go('happy'); this.once('happy'); this.emit('happy');
          if (now) this.emit('befriended');
        }
        break;
      }
      case 'happy': {
        this.want = 0; this.lookAt = P.pos;
        if (this.holdDone || this.st > 3.8) { this.hold = null; this.go(this.trust >= 1 ? 'friend' : 'wander'); }
        break;
      }
      case 'melt': {
        this.want = 0;
        if (this.holdDone || this.st > 2.7) { this.go('puddle'); this.hold = 'puddle'; this.puddleT = 0; this.emit('dissolve'); }
        break;
      }
      case 'puddle': {
        this.want = 0; this.hold = 'puddle';
        this.puddleT = d > 10 ? this.puddleT + dt : 0;
        if (this.puddleT > 25) { this.go('reform'); this.once('reform'); this.emit('reform'); }
        break;
      }
      case 'reform': {
        this.want = 0;
        if (this.holdDone || this.st > 2.9) { this.hold = null; this.go(friend ? 'friend' : 'wander'); }
        break;
      }
      case 'friend': {
        this.lookAt = P.pos;
        if (day && d > 25) { this.go('hide'); break; }
        if (d > 3.2) { this.target.copy(P.pos); this.want = d > 7 ? 1.2 : 0.35; this.arrive = 2.8; } else { this.want = 0; this.faceToward(P.pos); }
        break;
      }
    }
  }
  /** a spot just behind the nearest trunk on the far side from the player */
  private hideSpot(ctx: CreatureCtx): THREE.Vector3 | null {
    const T = ctx.trunks?.(this.pos.x, this.pos.z, 9) ?? [];
    let best: THREE.Vector3 | null = null, bs = Infinity;
    for (const t of T) {
      const dx = t.x - ctx.player.pos.x, dz = t.z - ctx.player.pos.z, l = Math.hypot(dx, dz) || 1;
      if (l < 3) continue;
      const hx = t.x + (dx / l) * (t.r + 0.3), hz = t.z + (dz / l) * (t.r + 0.3);
      const toMe = Math.hypot(hx - this.pos.x, hz - this.pos.z), s = toMe - l * 0.3;
      if (s < bs) { bs = s; best = new THREE.Vector3(hx, 0, hz); }
    }
    return best;
  }
  protected clipFor(speed: number): string {
    if (speed > 0.9) return 'run';
    if (speed > 0.06) return 'walk';
    if (this.state === 'hide') return 'hide';
    if (this.state === 'cower') return 'peek';
    if (this.state === 'curious') return 'sniff';
    if (this.state === 'puddle') return 'puddle';
    return 'idle';
  }
  protected pre(p: Pose) {
    const S = this.skel, B = S.bones, dt = Math.min(0.1, this.ctx?.dt ?? 0.016);
    // melting: the tear system slumps the body in the skin shader and runs it out into a sheet of water
    this.melt = damp(this.melt, clamp(p.c[CH.A], 0, 1), 6, dt);
    B[this.bi('body')].position.y -= 0.012 * this.melt;
    // the face: sad lids slant down at the outer corners and droop; the mouth corners turn down (or, rarely, up)
    const sad = clamp(p.c[CH.SAD], -1, 1), blink = clamp(Math.max(p.c[CH.BLINK], 0.08 + 0.22 * Math.max(0, sad)), 0, 1);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, lid = B[this.bi(k ? 'lidR' : 'lidL')];
      lid.quaternion.setFromAxisAngle(this.lidAxis[k], blink * 0.85).premultiply(_q2.setFromAxisAngle(this.eyeAxis[k], -s * 0.3 * sad));
      const mc = B[this.bi(k ? 'mouthR' : 'mouthL')];
      mc.position.y += -0.007 * sad; mc.position.x += s * 0.003 * Math.max(0, -sad);
    }
    _e.set(-this.params.lookPitch * 0.4 + 0.12, this.params.lookYaw * 0.4, 0);
    B[this.bi('eyeL')].quaternion.setFromEuler(_e); B[this.bi('eyeR')].quaternion.setFromEuler(_e);
    // how hard it cries (tears per eye per second): none when it is happy or fed; quiet hidden away; its ordinary
    // misery; floods when it is frightened (running, cowering) or wailing; every sob squeezes out a gush
    const clip = this.anim.current;
    let rate = 0;
    if (p.c[CH.FX] > 0.5 && this.crying) {
      rate = clip === 'melt' ? RATE.wail : this.state === 'flee' || this.state === 'cower' || clip === 'run' || clip === 'peek' ? RATE.scared
        : this.state === 'hide' || this.state === 'curious' ? RATE.quiet : RATE.weep;
      rate *= 0.55 + 2.4 * clamp(p.c[CH.C], 0, 1);
    }
    this.cry = rate;
  }
  protected after(ctx: CreatureCtx, dt: number) {
    const T = this.tears;
    if (this.object.parent) T.addTo(this.object.parent);
    T.rate = this.cry; T.melt = this.melt;
    // the body is gone into the water by the end of the melt (and comes back out of it as it re-forms)
    const m = clamp((this.melt - 0.68) / 0.3, 0, 1);
    this.fade.value = 1 - m * m * (3 - 2 * m);
    _tf.dt = dt; _tf.heightAt = ctx.heightAt;
    const moved = this.pos.distanceTo(this.lastPos); this.lastPos.copy(this.pos);
    if (this.dist < SIM_R || this.manual) { T.update(_tf); this.trailD = 0; return; }
    // nobody near: no drops simulated, but the tears still fall somewhere: a spot under its chin every half metre
    T.idle(_tf);
    this.trailD += moved;
    if (this.trailD > 0.55 && this.cry > 0) {
      this.trailD = 0;
      _v.set(Math.sign(Math.random() - 0.5) * 0.09, 0, 0.33).applyQuaternion(_q2.setFromAxisAngle(_up, this.heading)).add(this.pos);
      T.spot(_v.x, _v.z, 1.4e-7, ctx.heightAt);
    }
  }
}
