// THE TEAKETTLER: a shy little kettle of a critter that walks backwards and whistles steam out of its nose (model in
// teakettler/model.ts). Steam is drawn with the game's puff particles (gfx/particles); the whistle plays straight
// through the audio engine (the bank's kettle_whistle is a loop, so it is started and stopped here).
//
//   const t = new Teakettler({ pos }); scene.add(t.object); t.update(ctx); t.offer('coffee');
//
// Rules (learnable, gentle):
//   whistle  you hear it before you see it: a kettle coming to the boil somewhere in the brush, puffs of steam
//   backward it walks backwards, so it always faces what it is walking away from: it never turns its back on you
//   shy      stand within ~7 m (or ~3 m crouching) and it whistles in alarm and backs away, staring at you
//   coffee   it is mad for coffee: hold some out and it backs up to you bum-first, looking over its shoulder; give it
//            some (or leave a tin out) and it laps it up and dances, steaming; twice, and it follows you about
//   kettle   once it is your friend it whistles a warning when something dangerous is near (ctx.threats)
//   night    it sleeps curled up under a spruce by the campsite, steam rising off it like a cooling pot
// Events: whistle { warn? }, puff, sniff, back_away, drink, happy, befriended, step.
import * as THREE from 'three';
import { Cryptid, CH, clipKit, clamp, damp, type Pose, type Clip, type AnimParams } from './base';
import { cryptidLoader } from './kit';
import { teakettlerModelGen, teakettlerBones, TEAKETTLER_MODEL_VERSION, TK_EYE_AX, TK_FUR_SPEC, TK_NOSTRIL, TK_MOUTH } from './teakettler/model';
import { puffs } from '../../gfx/particles';
import { audio, type Voice } from '../../audio/audio';
import type { BoneDef } from '../rig';
import type { CreatureCtx } from '../types';

const TM = cryptidLoader(TEAKETTLER_MODEL_VERSION, () => teakettlerModelGen(), teakettlerBones);
export const teakettlerModel = () => TM.get();
export const teakettlerModelAsync = (o: { cache?: boolean } = {}) => TM.load(o);

export const TEAKETTLER_SOUND: Record<string, string | undefined> = { sniff: 'hound_sniff', drink: 'hound_chew', happy: 'hound_yip', befriended: 'hound_yip', back_away: 'foliage_rustle' };
export type TeakettlerState = 'wander' | 'sleep' | 'alert' | 'retreat' | 'curious' | 'drink' | 'happy' | 'friend';
const COFFEE = /coffee/i;
const STRIDE = { walk: 0.2, run: 0.34 };
const STEAM = new THREE.Color(0.92, 0.93, 0.95);

function teakettlerClips(defs: BoneDef[]): Record<string, Clip> {
  const { I, R, F, gait } = clipKit(defs);
  const CHEST = I('chest'), NECK = I('neck'), HEAD = I('head'), JAW = I('jaw'), NOSE = I('nose'), HIPS = I('hips');
  const TAIL = [0, 1, 2, 3, 4].map((k) => I('tail' + k)), EAR = [I('earL'), I('earR')];
  const sin = Math.sin, cos = Math.cos, TAU = Math.PI * 2;
  const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const env = (t: number, a: number, b: number, c: number, d: number) => (t < a ? 0 : t < b ? sm((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - sm((t - c) / (d - c)) : 0);
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, NECK, -a.lookPitch * 0.3 * k, a.lookYaw * 0.35 * k); R(p, HEAD, -a.lookPitch * 0.4 * k, a.lookYaw * 0.45 * k); };
  const ears = (p: Pose, up: number, flick = 0) => { R(p, EAR[0], -0.2 * up, 0, -0.3 * (1 - up) + flick); R(p, EAR[1], -0.2 * up, 0, 0.3 * (1 - up) - flick); };
  const tail = (p: Pose, t: number, amp: number, f = 1) => TAIL.forEach((b, k) => R(p, b, 0, amp * sin(t * f * TAU - k * 0.5) * (0.3 + k * 0.15)));
  /** looking back over its shoulder (which way it is going) */
  const over = (p: Pose, side: number, k = 1) => { R(p, NECK, -0.1 * k, 1.0 * side * k); R(p, HEAD, 0.05 * k, 0.8 * side * k, 0.2 * side * k); };
  return {
    idle: { loop: true, dur: 6, fade: 0.5, fn: (p, t, a) => {
      // nose down, snuffling the moss, ears swivelling, a lazy wisp of steam
      const sn = env(t % 6, 0.5, 1.0, 3.4, 3.9);
      R(p, NECK, 0.3 * sn); R(p, HEAD, 0.2 * sn + 0.05 * sin(t * 13) * sn); R(p, NOSE, -0.1 * Math.max(0, sin(t * 13)) * sn);
      p.t[1] += 0.004 * sin(t * 1.8); ears(p, 0.7, 0.15 * sin(t * 0.9) * (1 - sn)); tail(p, t, 0.12, 0.4); look(p, a, 1 - sn);
      p.c[CH.FX] = 0.15;
    } },
    walk: { loop: true, dur: 1, fade: 0.3, fn: (p, _t, a) => {
      // backwards: the paws reach back, the bum leads, it peeks over its shoulder every few steps
      const w = a.phase * TAU;
      gait(p, a.phase, 0.62, STRIDE.walk, 0.03, [0, 0.5, 0.75, 0.25], -1);
      p.rr[2] += 0.06 * sin(w); p.t[1] += 0.006 * cos(w * 2); tail(p, a.phase, 0.18);
      over(p, (a.side ?? 1), 0.55 + 0.35 * sin(w * 0.25)); ears(p, 0.8); p.c[CH.FX] = 0.25;
    } },
    run: { loop: true, dur: 1, fade: 0.2, fn: (p, _t, a) => {
      // a backwards scurry, still staring at whatever scared it, puffing like a kettle on the boil
      const w = a.phase * TAU;
      gait(p, a.phase, 0.48, STRIDE.run, 0.05, [0, 0.12, 0.55, 0.67], -1);
      p.t[1] += 0.012 * Math.abs(sin(w)); p.rr[0] -= 0.05; tail(p, a.phase, 0.3, 2); ears(p, 0.3); R(p, JAW, 0.1);
      look(p, a, 0.8); p.c[CH.FX] = 0.9;
    } },
    whistle: { loop: false, dur: 2.4, fade: 0.15, next: 'idle', fn: (p, t, a) => {
      // the alarm: it rears a little, the chest swells, the snout goes up and the steam jets out of both nostrils
      const k = env(t, 0, 0.3, 1.8, 2.3), jet = env(t, 0.25, 0.4, 1.7, 2.0);
      p.t[1] += 0.02 * k; p.rr[0] -= 0.12 * k; R(p, CHEST, -0.1 * k); R(p, NECK, -0.35 * k); R(p, HEAD, -0.25 * k + 0.03 * sin(t * 30) * jet);
      R(p, NOSE, -0.15 * jet); F(p, 0, 0, 0.02 * k, 0.01); F(p, 1, 0, 0.02 * k, 0.01); ears(p, 1, 0.2 * sin(t * 20) * jet); tail(p, t, 0.1, 3);
      p.c[CH.FX] = 1.0 * jet + 0.2; p.c[CH.A] = jet; look(p, a, 0.3);
    } },
    sniff: { loop: true, dur: 2.5, fade: 0.4, fn: (p, t, a) => {
      // coffee on the air: the snout up, nostrils going, the ears forward, the tail whirling
      R(p, NECK, -0.25); R(p, HEAD, -0.2 + 0.03 * sin(t * 11)); R(p, NOSE, -0.12 * Math.max(0, sin(t * 11)));
      ears(p, 1, 0.1 * sin(t * 3)); tail(p, t, 0.5, 2.5); look(p, a, 0.6); p.c[CH.FX] = 0.35;
    } },
    drink: { loop: false, dur: 3.6, fade: 0.25, next: 'happy', fn: (p, t) => {
      // lapping: nose down in it, the jaw going, little puffs between laps, eyes closed in bliss
      const dn = env(t, 0, 0.4, 3.0, 3.5), lap = Math.max(0, sin(t * 16));
      R(p, NECK, 0.45 * dn); R(p, HEAD, 0.35 * dn); R(p, JAW, 0.18 * lap * dn); p.c[CH.BLINK] = 0.8 * dn; p.c[CH.FX] = 0.3 + 0.4 * lap * dn;
      ears(p, 0.6); tail(p, t, 0.3 * dn, 3); F(p, 0, 0, 0, 0.03 * dn); F(p, 1, 0, 0, 0.03 * dn);
    } },
    happy: { loop: false, dur: 4, fade: 0.25, next: 'idle', fn: (p, t) => {
      // the coffee dance: hops round in a little circle (backwards, of course), whistling a tune, steam puffing in time
      const k = env(t, 0, 0.3, 3.4, 4), hop = Math.abs(sin(t * 8)) * k;
      p.rr[1] += Math.sin(t * 1.6) * 1.2 * k; p.t[1] += 0.035 * hop; p.rr[2] += 0.1 * sin(t * 8) * k;
      R(p, NECK, -0.3 * k); R(p, HEAD, -0.2 * k, 0.2 * sin(t * 4) * k); ears(p, 1, 0.3 * sin(t * 8) * k); tail(p, t, 0.5 * k, 4);
      for (let j = 0; j < 4; j++) F(p, j, 0, 0.03 * Math.max(0, sin(t * 8 + j * 1.6)) * k, 0);
      p.c[CH.FX] = 0.4 + 0.6 * Math.max(0, sin(t * 8)) * k; p.c[CH.A] = k * 0.6; p.c[CH.SAD] = -k;
    } },
    sleep: { loop: true, dur: 6, fade: 1.2, fn: (p, t) => {
      // curled up in a ball, nose tucked under the tail, a wisp of steam rising with each breath
      const br = sin(t * 0.25 * TAU);
      p.t[1] -= 0.11; p.rr[2] += 0.25; R(p, CHEST, 0, 0.5); R(p, NECK, 0.4, 0.7); R(p, HEAD, 0.4, 0.4, 0.3); R(p, HIPS, 0, -0.5);
      for (let k = 0; k < 4; k++) F(p, k, (k % 2 ? 1 : -1) * 0.02, 0, k < 2 ? -0.04 : 0.05);
      TAIL.forEach((b, k) => R(p, b, 0.15, 0.25 + k * 0.05)); ears(p, 0.2); p.c[CH.BLINK] = 1; p.c[CH.FX] = 0.1 + 0.15 * Math.max(0, br); p.t[1] += 0.005 * br;
    } },
  };
}

const _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
export class Teakettler extends Cryptid {
  readonly id = 'teakettler';
  readonly name = 'Teakettler';
  readonly favoriteFood = 'coffee';
  readonly rules = [
    'You hear it first: a kettle coming to the boil somewhere in the brush, and little puffs of steam.',
    'It walks backwards, so it is always looking at whatever it is walking away from. It never turns its back on you.',
    'It is shy: come within seven paces standing up (three crouching) and it whistles in alarm and backs off.',
    'It is mad for coffee. Hold some out and it backs right up to you, bum first, looking over its shoulder.',
    'Give it coffee twice and it follows you, and whistles like a kettle when something dangerous is near.',
    'At night it sleeps curled up by the campsite, steaming gently like a pot left to cool.',
  ] as const;
  readonly sounds = TEAKETTLER_SOUND;
  declare state: TeakettlerState;
  private voice: Voice | null = null; private whistleT = 0; private puffT = 0; private lastWhistle = -99; private lastWarn = -99;
  private lidAxis: THREE.Vector3[]; private steam = 0; private jet = 0; private lookSide = 1; private mouthT = 0;
  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super(teakettlerModel(), teakettlerClips(teakettlerBones()), { pos: o.pos, heading: o.heading, shineCol: 0xffd090, fur: TK_FUR_SPEC, legs: [
      { up: 'fuL', lo: 'flL', foot: 'ffL', fore: true }, { up: 'fuR', lo: 'flR', foot: 'ffR', fore: true },
      { up: 'huL', lo: 'hlL', foot: 'hfL' }, { up: 'huR', lo: 'hlR', foot: 'hfR' }] });
    this.object.name = 'Teakettler';
    this.state = 'wander';
    this.stride = { walk: STRIDE.walk, run: STRIDE.run };
    this.manualSpeed = { walk: 0.32, run: 1.4 };
    this.turnK = 3.5;
    this.lidAxis = [1, -1].map((s) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * TK_EYE_AX[0], TK_EYE_AX[1], TK_EYE_AX[2])).normalize());
  }
  offer(item: string): boolean {
    if (!COFFEE.test(item)) return false;
    if (this.state === 'drink' || this.state === 'sleep' || this.dist > 2.2) return false;
    this.go('drink'); this.once('drink'); this.want = 0; this.reverse = false;
    this.emit('drink', { item: 'coffee' });
    return true;
  }
  /** whistle: the steam jet and the kettle sound for `dur` seconds */
  private whistle(ctx: CreatureCtx, dur: number, warn = false) {
    this.whistleT = dur; this.lastWhistle = ctx.time;
    this.emit('whistle', { warn, voice: 'kettle_whistle', dur });
    try {
      if (!this.voice) this.voice = audio.play('kettle_whistle', { pos: this.object.position, loop: true, vol: warn ? 1 : 0.7, rate: warn ? 1.15 : 1 });
    } catch { this.voice = null; }
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player, d = this.dist, coffee = COFFEE.test(P.held), night = ctx.hour >= 22 || ctx.hour < 5;
    const friend = this.trust >= 1, shyR = friend ? 0 : P.crouch ? 3 : 7;
    this.lookAt = P.pos; this.face = null; this.arrive = 0.3;
    // something dangerous near its friend: the kettle boils over
    if (friend && (ctx.threats ?? []).some((t) => Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < 22) && ctx.time - this.lastWarn > 12) { this.lastWarn = ctx.time; this.once('whistle'); this.whistle(ctx, 2.2, true); }
    // coffee left out
    const gc = this.itemNear(ctx, COFFEE, this.pos, 15);
    if (gc && Math.hypot(gc.pos.x - P.pos.x, gc.pos.z - P.pos.z) > 4 && this.state !== 'drink' && this.state !== 'happy' && this.state !== 'sleep') {
      this.target.copy(gc.pos); this.want = 0.55; this.reverse = true; this.arrive = 0.25;
      if (Math.hypot(gc.pos.x - this.pos.x, gc.pos.z - this.pos.z) < 0.35 && ctx.takeItem?.(gc.id) !== false) { this.go('drink'); this.once('drink'); this.reverse = false; this.emit('drink', { item: 'coffee', from: 'ground' }); }
      return;
    }
    switch (this.state) {
      case 'sleep': {
        this.want = 0; this.hold = 'sleep'; this.lookAt = null;
        if (!night) { this.go('wander'); this.hold = null; }
        else if (d < shyR * 0.6 && this.pSpeed > 0.5) { this.hold = null; this.go('alert'); }
        break;
      }
      case 'wander': {
        if (night && this.pos.distanceTo(this.home) < 1) { this.go('sleep'); break; }
        if (friend) { this.go('friend'); break; }
        if (coffee && d < 18) { this.go('curious'); this.emit('sniff'); break; }
        if (d < shyR) { this.go('alert'); break; }
        if (this.st > 4 + (this.t % 5)) { this.st = 0; const a = Math.random() * Math.PI * 2, r = night ? 0 : 1 + Math.random() * 6; this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r); if (Math.random() < 0.35) this.whistle(ctx, 0.9); }
        this.want = 0.25; this.reverse = true; this.lookAt = this.target.clone().setY(this.pos.y + 0.3);
        break;
      }
      case 'alert': {
        // it freezes, faces you, whistles in alarm, then backs away
        this.want = 0; this.faceToward(P.pos); this.reverse = false;
        if (this.st < 0.05) { this.once('whistle'); this.whistle(ctx, 1.6, true); }
        if (this.holdDone || this.st > 2.4) { this.hold = null; this.go('retreat'); this.emit('back_away'); }
        break;
      }
      case 'retreat': {
        // backwards away from you, still facing you: it never turns its back
        this.awayFrom(P.pos, 6, this.target); this.reverse = true; this.want = d < shyR * 0.6 ? 1.3 : 0.6;
        if (coffee) { this.go('curious'); break; }
        if (d > shyR + 6) this.go('wander');
        if (ctx.time - this.lastWhistle > 3 && Math.random() < dt * 0.5) this.whistle(ctx, 0.7);
        break;
      }
      case 'curious': {
        if (!coffee) { this.go(friend ? 'friend' : d < shyR ? 'retreat' : 'wander'); break; }
        // bum first toward you, peeking over its shoulder; at arm's length it turns round to face you
        if (d > 1.4) { this.target.copy(P.pos); this.want = d > 4 ? 0.8 : 0.45; this.reverse = true; this.arrive = 1.2; this.lookAt = P.pos; }
        else { this.want = 0; this.reverse = false; this.faceToward(P.pos); this.hold = 'sniff'; if (Math.random() < dt * 0.4) this.emit('sniff'); }
        break;
      }
      case 'drink': {
        this.want = 0;
        if (this.anim.current === 'happy' || this.st > 3.7) {
          const now = this.gainTrust(0.5); this.go('happy'); this.holdClip('happy');
          this.whistle(ctx, 3.2); this.emit('happy'); if (now) this.emit('befriended');
        }
        break;
      }
      case 'happy': {
        this.want = 0;
        if (this.holdDone || this.st > 4.2) { this.hold = null; this.go(this.trust >= 1 ? 'friend' : 'wander'); }
        break;
      }
      case 'friend': {
        if (night && d > 12) { this.target.copy(this.home); this.want = 0.6; this.reverse = true; if (this.pos.distanceTo(this.home) < 1) this.go('sleep'); break; }
        if (coffee && d < 10) { this.go('curious'); break; }
        // tags along a few steps off, backwards, of course
        if (d > 3.5) { this.target.copy(P.pos); this.want = d > 8 ? 1.2 : 0.4; this.reverse = true; this.arrive = 3; } else { this.want = 0; this.faceToward(P.pos); }
        if (ctx.time - this.lastWhistle > 20 && Math.random() < dt * 0.1) this.whistle(ctx, 0.8);
        break;
      }
    }
  }
  protected clipFor(speed: number): string {
    if (this.state === 'sleep') return 'sleep';
    if (speed > 0.75) return 'run';
    if (speed > 0.05) return 'walk';
    if (this.state === 'curious') return 'sniff';
    return 'idle';
  }
  protected animate(ctx: CreatureCtx, dt: number) {
    // over which shoulder it peeks while backing up: toward where it is going
    const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, ang = Math.atan2(tx, tz) - this.heading;
    this.lookSide = damp(this.lookSide, Math.sin(ang) >= 0 ? 1 : -1, 2, dt);
    this.params.side = this.lookSide;
    super.animate(ctx, dt);
  }
  protected pre(p: Pose) {
    const B = this.skel.bones, dt = Math.min(0.1, this.ctx?.dt ?? 0.016);
    const blink = clamp(Math.max(p.c[CH.BLINK], this.state === 'alert' || this.state === 'retreat' ? 0 : 0.1), 0, 1);
    B[this.bi('lidL')].quaternion.setFromAxisAngle(this.lidAxis[0], blink * 1.3);
    B[this.bi('lidR')].quaternion.setFromAxisAngle(this.lidAxis[1], blink * 1.3);
    _e.set(-this.params.lookPitch * 0.5, this.params.lookYaw * 0.5, 0);
    B[this.bi('eyeL')].quaternion.setFromEuler(_e); B[this.bi('eyeR')].quaternion.setFromEuler(_e);
    // the nostrils flare as the steam comes
    this.steam = damp(this.steam, clamp(p.c[CH.FX], 0, 1), 8, dt); this.jet = damp(this.jet, Math.max(p.c[CH.A], this.whistleT > 0 ? 1 : 0), 10, dt);
    B[this.bi('nose')].scale.setScalar(1 + 0.18 * this.jet);
  }
  protected after(ctx: CreatureCtx, dt: number) {
    // steam: wisps from the nostrils all the time, a jet while it whistles
    this.whistleT = Math.max(0, this.whistleT - dt);
    if (this.voice) { this.voice.setPos(this.object.position); if (this.whistleT <= 0) { this.voice.stop(0.25); this.voice = null; } }
    const rate = 0.4 + this.steam * 6 + this.jet * 18;
    this.puffT += dt * rate;
    if (this.puffT >= 1 && this.object.visible) {
      this.puffT = 0;
      this.object.updateMatrixWorld(true);
      const nose = this.bi('nose'), jaw = this.bi('jaw'), S = this.skel;
      for (const s of [1, -1]) {
        // the nostril tip in world space, blowing out along the snout
        _v.set(s * TK_NOSTRIL[0], TK_NOSTRIL[1], TK_NOSTRIL[2]).sub(S.restWorld[nose]).applyQuaternion(S.Q[nose]).add(S.P[nose]).applyMatrix4(this.mesh.matrixWorld);
        _w.set(0, 0, 1).applyQuaternion(S.Q[nose]).transformDirection(this.mesh.matrixWorld).multiplyScalar(0.25 + this.jet * 1.1);
        puffs.emit(_v, _w, { size: 0.025 + this.jet * 0.03, grow: 3 + this.jet * 2, life: 0.9 + this.jet * 0.6, color: STEAM, alpha: 0.35 + this.jet * 0.25, rise: 0.25, spread: 0.04 });
        // and out of the corners of its mouth, sideways, when it really boils
        if (this.jet > 0.3 || this.mouthT++ % 3 === 0) {
          _v.set(s * TK_MOUTH[0], TK_MOUTH[1], TK_MOUTH[2]).sub(S.restWorld[jaw]).applyQuaternion(S.Q[jaw]).add(S.P[jaw]).applyMatrix4(this.mesh.matrixWorld);
          _w.set(s * 0.8, 0.1, 0.6).applyQuaternion(S.Q[jaw]).transformDirection(this.mesh.matrixWorld).multiplyScalar(0.15 + this.jet * 0.6);
          puffs.emit(_v, _w, { size: 0.02 + this.jet * 0.02, grow: 2.5 + this.jet * 2, life: 0.7 + this.jet * 0.5, color: STEAM, alpha: 0.25 + this.jet * 0.2, rise: 0.3, spread: 0.05 });
        }
      }
    }
  }
}
