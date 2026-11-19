// THE HODAG: a territorial swamp beast that guards its den (model in hodag/model.ts).
//
//   const h = new Hodag({ pos: denPos }); scene.add(h.object); h.update(ctx); h.offer('bacon');
//
// Rules (learnable, fair):
//   den      it lives in a muddy wallow in the alder swamp and patrols about 24 m round it; outside that it ignores you
//   warn     come inside and it faces you, swells its yellow throat sac and bellows, spines up, then paws the mud
//   charge   keep coming and it charges. The first two charges stop short with a snap of the jaws (a bluff); back off
//            and it lets you go. Swing an axe at it, or crowd it a third time, and it gores ('gore', damage)
//   bacon    hold bacon and it forgets its temper: it waddles up sniffing, tongue out. Feed it and it is calm for the
//            day; feed it twice and it is yours (it flops over for a belly scratch and follows you round its swamp)
//   sleep    from midnight to dawn it sleeps in the den; tread softly and it does not wake
//   smell    you smell it before you see it ('stink' when you are close)
// Events: bellow, grunt, growl, snap (bluff), gore { damage, impulse }, sniff, eat, happy, befriended, stink, step.
import * as THREE from 'three';
import { Cryptid, CH, clipKit, isNight, clamp, damp, type Pose, type Clip, type AnimParams } from './base';
import { cryptidLoader } from './kit';
import { hodagModelGen, hodagBones, HODAG_MODEL_VERSION, HODAG_EYE, HODAG_FUR_SPEC } from './hodag/model';
import type { BoneDef } from '../rig';
import type { CreatureCtx } from '../types';

const HM = cryptidLoader(HODAG_MODEL_VERSION, () => hodagModelGen(), hodagBones);
export const hodagModel = () => HM.get();
export const hodagModelAsync = (o: { cache?: boolean } = {}) => HM.load(o);

export const HODAG_SOUND: Record<string, string | undefined> = {
  bellow: 'hound_growl', grunt: 'bigfoot_grunt', growl: 'hound_growl', snap: 'hound_snarl', gore: 'hound_snarl', sniff: 'hound_sniff',
  eat: 'hound_chew', happy: 'animal_frogs', befriended: 'animal_frogs', step: 'foot_mud',
};
export type HodagState = 'roam' | 'sleep' | 'warn' | 'charge' | 'retreat' | 'curious' | 'eat' | 'content' | 'friend';
const BACON = /bacon/i;
const TERR = 24;
const STRIDE = { walk: 0.62, run: 1.25, back: 0.5 };

function hodagClips(defs: BoneDef[]): Record<string, Clip> {
  const { I, R, F, gait } = clipKit(defs);
  const ROOT = 0, CHEST = I('chest'), NECK = I('neck'), HEAD = I('head'), JAW = I('jaw'), HIPS = I('hips');
  const TAIL = [0, 1, 2, 3, 4].map((k) => I('tail' + k));
  const LEGU = [I('fuL'), I('fuR'), I('huL'), I('huR')], LEGL = [I('flL'), I('flR'), I('hlL'), I('hlR')];
  const sin = Math.sin, cos = Math.cos, TAU = Math.PI * 2;
  const env = (t: number, a: number, b: number, c: number, d: number) => (t < a ? 0 : t < b ? sm((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - sm((t - c) / (d - c)) : 0);
  const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, NECK, -a.lookPitch * 0.25 * k, a.lookYaw * 0.3 * k); R(p, HEAD, -a.lookPitch * 0.35 * k, a.lookYaw * 0.4 * k); };
  const tail = (p: Pose, t: number, amp: number, f = 1, lift = 0) => TAIL.forEach((b, k) => R(p, b, -lift * (k === 0 ? 1 : 0.3), amp * sin(t * f * TAU - k * 0.7) * (0.5 + k * 0.2)));
  return {
    idle: { loop: true, dur: 9, fade: 0.5, fn: (p, t, a) => {
      const br = sin(t * 0.32 * TAU);
      p.t[1] += 0.008 * br; R(p, CHEST, -0.01 * br); p.c[CH.A] = 0.08 + 0.06 * Math.max(0, br);
      // now and then a lazy chew, a look round
      R(p, JAW, 0.05 * Math.max(0, sin(t * 2.3)) * env(t % 9, 4, 4.4, 6, 6.6));
      R(p, HEAD, 0.04 * sin(t * 0.21 * TAU), 0.25 * sin(t * 0.11 * TAU) * env(t % 9, 1, 2, 3.5, 4.5));
      tail(p, t, 0.08, 0.25); look(p, a);
    } },
    walk: { loop: true, dur: 1, fade: 0.35, fn: (p, _t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.66, STRIDE.walk, 0.07, [0, 0.5, 0.75, 0.25]);
      // the heavy waddle: the barrel rolls, the shoulders and hips work against each other, the head swings
      p.rr[2] += 0.06 * sin(w); p.t[1] += 0.012 * cos(w * 2); p.t[0] += 0.015 * sin(w);
      R(p, CHEST, 0, 0.06 * sin(w)); R(p, HIPS, 0, -0.07 * sin(w)); R(p, HEAD, 0.04 * cos(w * 2), -0.08 * sin(w));
      tail(p, a.phase, 0.18, 1); look(p, a, 0.6);
    } },
    run: { loop: true, dur: 1, fade: 0.25, fn: (p, _t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.45, STRIDE.run, 0.16, [0, 0.12, 0.55, 0.67]);
      // the charge: low, horns forward, the body rocking fore and aft, the jaw open
      p.rr[0] += 0.08 + 0.06 * sin(w); p.t[1] += 0.035 * Math.abs(sin(w)) - 0.04;
      R(p, NECK, 0.15); R(p, HEAD, 0.12 + 0.05 * sin(w)); R(p, JAW, 0.2 + 0.06 * sin(w * 2));
      tail(p, a.phase, 0.25, 1, 0.25); p.c[CH.A] = 0.2;
    } },
    back: { loop: true, dur: 1, fade: 0.35, fn: (p, _t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.66, STRIDE.back, 0.06, [0, 0.5, 0.75, 0.25], -1);
      p.rr[2] += 0.05 * sin(w); R(p, HEAD, 0.08, 0, 0); R(p, JAW, 0.04); tail(p, a.phase, 0.12, 1);
      look(p, a, 0.8);
    } },
    bellow: { loop: false, dur: 3.2, fade: 0.2, next: 'paw', fn: (p, t, a) => {
      // the display: the head up, the throat sac swelling to a yellow balloon that throbs with the bellow, the
      // forefeet planted wide, the tail lashing, the jaw cracked open
      const up = env(t, 0, 0.5, 2.5, 3.1), swell = env(t, 0.3, 0.9, 2.3, 3.0), throb = 0.1 * sin(t * 14) * env(t, 0.9, 1.1, 2.2, 2.4);
      R(p, NECK, -0.32 * up); R(p, HEAD, -0.22 * up); R(p, JAW, 0.16 * up + 0.08 * swell * Math.max(0, sin(t * 7)));
      p.c[CH.A] = swell * 0.95 + throb; p.rr[0] -= 0.1 * up; p.t[1] += 0.05 * up;
      F(p, 0, 0.06 * up, 0, 0.05 * up); F(p, 1, -0.06 * up, 0, 0.05 * up);
      tail(p, t, 0.45 * up, 1.6, 0.3 * up); p.c[CH.RAISE] = up; look(p, a, 0.3);
    } },
    paw: { loop: true, dur: 2.4, fade: 0.3, fn: (p, t, a) => {
      // pawing the mud: one forefoot raked back twice, the head low, the horns presented
      const k = Math.floor(t / 1.2) % 2, s = (t % 1.2) / 1.2;
      const lift = sin(Math.min(1, s * 1.6) * Math.PI);
      F(p, k, 0, 0.07 * lift, 0.14 - 0.3 * Math.min(1, s * 1.6), 1, -0.4 * lift);
      R(p, NECK, 0.18); R(p, HEAD, 0.14 + 0.03 * sin(t * 5)); p.rr[0] += 0.05; R(p, JAW, 0.03);
      p.c[CH.A] = 0.25 + 0.1 * sin(t * 3); tail(p, t, 0.35, 0.8, 0.2); look(p, a, 0.5);
    } },
    snap: { loop: false, dur: 1.4, fade: 0.08, next: 'paw', fn: (p, t) => {
      // the bluff: it skids to a stop with its forefeet braced, snaps twice at the air, throat up
      const skid = env(t, 0, 0.12, 0.6, 1.1), sn = Math.max(0, sin(t * 11)) * env(t, 0.15, 0.25, 0.8, 1.0);
      p.rr[0] -= 0.14 * skid; p.t[2] -= 0.08 * skid; F(p, 0, 0, 0, 0.16 * skid); F(p, 1, 0, 0, 0.16 * skid);
      R(p, NECK, -0.1 * skid); R(p, HEAD, -0.12 * sn); R(p, JAW, 0.55 * sn); p.c[CH.A] = 0.5 * skid; p.c[CH.RAISE] = skid;
    } },
    gore: { loop: false, dur: 1.3, fade: 0.06, next: 'idle', fn: (p, t) => {
      // the real thing: head down and a hooking toss of the horns up and to the side
      const dip = env(t, 0, 0.2, 0.3, 0.45), toss = env(t, 0.3, 0.45, 0.6, 1.2);
      R(p, NECK, 0.3 * dip - 0.35 * toss, 0.3 * toss); R(p, HEAD, 0.3 * dip - 0.4 * toss, 0.2 * toss, -0.3 * toss); R(p, JAW, 0.35 * toss);
      p.t[2] += 0.18 * dip + 0.1 * toss; p.rr[0] += 0.12 * dip - 0.1 * toss; p.t[1] += 0.06 * toss;
      F(p, 2, 0, 0, -0.08 * dip); F(p, 3, 0, 0, -0.08 * dip);
    } },
    sniff: { loop: true, dur: 3, fade: 0.4, fn: (p, t, a) => {
      // curious: the snout up into the wind, nostrils working, the tongue tip tasting the air, the tail wagging
      R(p, NECK, -0.22); R(p, HEAD, -0.12 + 0.04 * sin(t * 9)); R(p, JAW, 0.06 + 0.03 * sin(t * 4.5));
      p.c[CH.B] = 0.25 + 0.15 * Math.max(0, sin(t * 3)); tail(p, t, 0.3, 1.4); look(p, a, 0.7); p.c[CH.SAD] = 0.15;
    } },
    eat: { loop: false, dur: 3.6, fade: 0.2, next: 'idle', fn: (p, t) => {
      // the gobble: the head swings down, the tongue whips out and back, then the gulp (a bulge down the throat) and
      // three heavy chews
      const down = env(t, 0, 0.4, 1.2, 1.6), flick = env(t, 0.35, 0.5, 0.6, 0.8), gulp = env(t, 1.4, 1.6, 1.8, 2.2), chew = env(t, 1.8, 2, 3.2, 3.5);
      R(p, NECK, 0.3 * down - 0.15 * gulp); R(p, HEAD, 0.35 * down - 0.2 * gulp); R(p, JAW, 0.45 * flick + 0.18 * Math.max(0, sin(t * 7)) * chew);
      p.c[CH.B] = flick * 1.2; p.c[CH.A] = 0.6 * gulp; p.rr[0] += 0.06 * down; p.c[CH.SAD] = 0.5 * chew;
      tail(p, t, 0.3 * chew, 1.6);
    } },
    happy: { loop: false, dur: 5, fade: 0.4, next: 'idle', fn: (p, t) => {
      // joy: it flops onto its side, paws paddling in the air, tongue lolling out of the grin, tail thumping the mud
      const roll = env(t, 0.2, 1.0, 4.0, 4.8), pad = sin(t * 9) * roll;
      p.rr[2] += 1.15 * roll; p.t[1] -= 0.2 * roll; p.t[0] -= 0.12 * roll;
      for (let k = 0; k < 4; k++) { F(p, k, 0, 0, 0, 1 - roll); R(p, LEGU[k], (k < 2 ? -0.5 : 0.4) * roll + 0.3 * pad * (k % 2 ? 1 : -1), 0, (k % 2 ? -0.4 : 0.6) * roll); R(p, LEGL[k], 0.4 * roll + 0.2 * pad); }
      R(p, NECK, -0.1 * roll, 0, 0.3 * roll); R(p, HEAD, 0, 0, 0.2 * roll); R(p, JAW, 0.3 * roll);
      p.c[CH.B] = 0.85 * roll; p.c[CH.SAD] = 0.6 * roll; tail(p, t, 0.4 * roll, 1.8);
    } },
    sleep: { loop: true, dur: 8, fade: 1.2, fn: (p, t) => {
      // belly down in the mud, legs folded out, chin on the ground, slow breaths through the sac
      const br = sin(t * 0.2 * TAU);
      p.t[1] -= 0.26; p.c[CH.A] = 0.15 + 0.15 * Math.max(0, br); p.c[CH.BLINK] = 1; R(p, NECK, 0.18); R(p, HEAD, 0.15);
      for (let k = 0; k < 4; k++) F(p, k, (k % 2 ? -1 : 1) * 0.08, 0, k < 2 ? 0.12 : -0.14);
      tail(p, t, 0.04, 0.1);
    } },
  };
}

const _v = new THREE.Vector3();
export class Hodag extends Cryptid {
  readonly id = 'hodag';
  readonly name = 'Hodag';
  readonly favoriteFood = 'bacon';
  readonly rules = [
    'Its den is a muddy wallow in the alder swamp. About twenty-five paces round it is its yard, and it guards every inch.',
    'It warns before it fights: the yellow throat swells, it bellows, the spines go up. Back away and it lets you go.',
    'Its first two charges stop short with a snap. Swing an axe at it, or crowd it a third time, and the horns are real.',
    'It cannot think about anything else when it smells bacon. Feed it and it is calm for the day.',
    'Feed it twice and it rolls over for a belly scratch, and follows you about its swamp like a big ugly dog.',
    'It sleeps in the den from midnight to dawn. You will smell it long before you see it.',
  ] as const;
  readonly sounds = HODAG_SOUND;
  declare state: HodagState;
  private bluffs = 0; private provoked = false; private calmUntil = -1; private lastBellow = -99; private lastStink = -99; private lastGrunt = 0;
  private lidAxis: THREE.Vector3[];
  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super(hodagModel(), hodagClips(hodagBones()), { pos: o.pos, heading: o.heading, shineCol: 0xe8d070, fur: HODAG_FUR_SPEC, legs: [
      { up: 'fuL', lo: 'flL', foot: 'ffL', fore: true }, { up: 'fuR', lo: 'flR', foot: 'ffR', fore: true },
      { up: 'huL', lo: 'hlL', foot: 'hfL' }, { up: 'huR', lo: 'hlR', foot: 'hfR' }] });
    this.object.name = 'Hodag';
    this.state = 'roam';
    this.stride = { walk: STRIDE.walk, run: STRIDE.run, back: STRIDE.back };
    this.manualSpeed = { walk: 0.9, run: 5, back: 0.6 };
    this.stepSound = 'foot_mud';
    this.lidAxis = [1, -1].map((s) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * 0.62, 0.55, 0.56)).normalize());
    void HODAG_EYE;
  }
  /** calm (fed today) or befriended */
  get calm() { return this.state === 'friend' || (this.ctx && this.ctx.time < this.calmUntil); }

  offer(item: string): boolean {
    if (!BACON.test(item)) return false;
    if (this.state === 'eat' || this.state === 'sleep') return false;
    if (this.dist > 3.2) return false;
    this.go('eat'); this.once('eat'); this.want = 0;
    this.emit('eat', { item: 'bacon' });
    return true;
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player, d = this.dist, home = this.home;
    const pHome = Math.hypot(P.pos.x - home.x, P.pos.z - home.z), meHome = Math.hypot(this.pos.x - home.x, this.pos.z - home.z);
    const inYard = pHome < TERR, bacon = BACON.test(P.held), sleepy = ctx.hour >= 0 && ctx.hour < 5;
    this.lookAt = null; this.face = null;
    if (d < 7 && ctx.time - this.lastStink > 40) { this.lastStink = ctx.time; this.emit('stink'); }
    // provoked: an axe swung at it within reach
    if ((P.action === 'swing' || P.action === 'chop') && d < 3.5 && this.state !== 'friend') this.provoked = true;
    // bacon on the ground in its yard: it goes for it
    const gb = this.itemNear(ctx, BACON, home, TERR);
    if (gb && this.state !== 'eat' && this.state !== 'charge') {
      this.target.copy(gb.pos); this.want = 1.1;
      if (Math.hypot(gb.pos.x - this.pos.x, gb.pos.z - this.pos.z) < 1.2 && ctx.takeItem?.(gb.id) !== false) { this.go('eat'); this.once('eat'); this.emit('eat', { item: 'bacon', from: 'ground' }); }
      else if (this.state !== 'curious') this.go('curious');
      return;
    }
    switch (this.state) {
      case 'sleep': {
        this.want = 0; this.hold = 'sleep';
        if (!sleepy) { this.go('roam'); this.emit('grunt'); }
        else if ((d < 5 && this.pSpeed > 0.4) || (d < 14 && P.noise > 0.65)) { this.emit('growl'); this.go(this.calm ? 'roam' : 'warn'); }
        break;
      }
      case 'roam': {
        if (sleepy && meHome < 2 && d > 8) { this.go('sleep'); break; }
        if (bacon && d < 30) { this.go('curious'); this.emit('sniff'); break; }
        if (inYard && d < TERR && !this.calm) { this.go('warn'); break; }
        if (this.calm && this.trust >= 1) { this.go('friend'); break; }
        // a slow patrol round the den, a wallow now and then
        if (this.st > 6 + (this.t % 7)) {
          this.st = 0;
          const a = Math.random() * Math.PI * 2, r = sleepy ? 0 : 3 + Math.random() * 9;
          this.target.set(home.x + Math.sin(a) * r, 0, home.z + Math.cos(a) * r);
          if (ctx.time - this.lastGrunt > 20 && Math.random() < 0.4) { this.lastGrunt = ctx.time; this.emit('grunt'); }
        }
        this.want = 0.8;
        if (d < 30) this.lookAt = P.pos;
        break;
      }
      case 'warn': {
        this.want = 0; this.faceToward(P.pos); this.lookAt = P.pos;
        if (this.st < 0.05 && ctx.time - this.lastBellow > 8) { this.lastBellow = ctx.time; this.once('bellow'); this.emit('bellow'); }
        if (this.hold === 'bellow' && this.holdDone) this.hold = null;
        if (bacon) { this.go('curious'); this.emit('sniff'); break; }
        if (!inYard || d > TERR + 4 || this.calm) { this.go('roam'); this.bluffs = Math.max(0, this.bluffs - 1); this.emit('grunt'); break; }
        if (this.provoked || (d < 10 && this.st > 3) || (d < 14 && this.st > 9)) { this.go('charge'); this.emit('growl'); }
        break;
      }
      case 'charge': {
        this.target.copy(P.pos); this.want = 5.2; this.arrive = 0.1; this.lookAt = P.pos;
        if (d < 2.5) {
          this.arrive = 0.35;
          if (this.bluffs < 2 && !this.provoked) {
            this.bluffs++; this.go('warn'); this.st = 0.06; this.speed = 0; this.once('snap'); this.emit('snap', { bluff: this.bluffs });
          } else {
            const toP = _v.set(P.pos.x - this.pos.x, 0, P.pos.z - this.pos.z).normalize();
            this.once('gore'); this.emit('gore', { damage: 0.35, impulse: new THREE.Vector3(toP.x * 8, 4, toP.z * 8) });
            this.provoked = false; this.bluffs = 0; this.go('retreat'); this.hold = 'gore';
          }
        } else if (this.st > 6 || !inYard) { this.arrive = 0.35; this.go('warn'); }
        break;
      }
      case 'retreat': {
        if (this.hold === 'gore' && !this.holdDone) { this.want = 0; break; }
        this.hold = null;
        this.target.copy(home); this.want = 1.0; this.reverse = this.st < 2.5;
        if (meHome < 1.5 || this.st > 12) { this.reverse = false; this.go('roam'); }
        break;
      }
      case 'curious': {
        this.lookAt = P.pos; this.reverse = false;
        if (!bacon) { this.go(inYard && !this.calm ? 'warn' : 'roam'); break; }
        if (d > 2.1) { this.target.copy(P.pos); this.want = 1.3; this.arrive = 2.0; this.hold = null; }
        else { this.want = 0; this.faceToward(P.pos); this.hold = 'sniff'; if (Math.random() < dt * 0.5) this.emit('sniff'); }
        break;
      }
      case 'eat': {
        this.want = 0;
        if (this.holdDone || this.st > 4) {
          this.trust = Math.min(1, this.trust + 0.5); this.calmUntil = ctx.time + 900; this.bluffs = 0; this.provoked = false;
          this.go(this.trust >= 1 ? 'friend' : 'content'); this.once('happy'); this.emit('happy');
          if (this.trust >= 1) this.emit('befriended');
        }
        break;
      }
      case 'content': {
        if (this.hold === 'happy' && !this.holdDone) { this.want = 0; break; }
        this.hold = null;
        if (!this.calm) { this.go('roam'); break; }
        if (bacon && d < 20) { this.go('curious'); break; }
        // lazy and pleased with itself: back to the wallow
        this.target.copy(home); this.want = d < 4 ? 0 : 0.7; this.lookAt = d < 10 ? P.pos : null;
        break;
      }
      case 'friend': {
        if (this.hold === 'happy' && !this.holdDone) { this.want = 0; break; }
        this.hold = null; this.lookAt = P.pos;
        if (sleepy && d > 6) { this.target.copy(home); this.want = 0.9; if (meHome < 1.5) this.go('sleep'); break; }
        if (bacon && d < 20) { this.go('curious'); break; }
        // follow the player round its swamp (never far from the den), roll over when they stand close
        if (pHome < TERR * 1.8) { this.target.copy(P.pos); this.arrive = 3; this.want = d > 6 ? 2.2 : d > 3.2 ? 1.0 : 0; }
        else { this.target.copy(home); this.arrive = 1; this.want = 1; }
        if (d < 3 && this.pSpeed < 0.2 && this.st > 14) { this.st = 0; this.once('happy'); this.emit('happy'); }
        break;
      }
    }
  }
  protected clipFor(speed: number): string {
    if (this.state === 'sleep') return 'sleep';
    if (speed < 0.08) return this.state === 'warn' ? 'paw' : this.state === 'curious' ? 'sniff' : 'idle';
    if (this.reverse) return 'back';
    return speed > 2.6 ? 'run' : 'walk';
  }
  private sac = 0; private tongue = 0;
  protected pre(p: Pose) {
    const S = this.skel, B = S.bones, dt = Math.min(0.1, this.ctx?.dt ?? 0.016);
    // the throat sac swells on a soft spring; the tongue shoots out fast and back slower
    this.sac = damp(this.sac, clamp(p.c[CH.A], 0, 1.2), 7, dt);
    this.tongue = damp(this.tongue, clamp(p.c[CH.B], 0, 1.3), p.c[CH.B] > this.tongue ? 22 : 9, dt);
    const s = this.sac;
    B[this.bi('sac')].scale.set(1 + s * 0.9, 1 + s * 1.25, 1 + s * 0.8);
    const tg = 0.02 + this.tongue;
    B[this.bi('tongue')].scale.set(Math.min(1, tg * 1.2), Math.min(1, tg * 1.2), tg);
    // frog lids: the upper lid closes down over the bulging eye; contentment half-closes it
    const blink = clamp(Math.max(p.c[CH.BLINK], p.c[CH.SAD] * 0.55), 0, 1);
    B[this.bi('lidL')].quaternion.setFromAxisAngle(this.lidAxis[0], 0.1 + blink * 1.35);
    B[this.bi('lidR')].quaternion.setFromAxisAngle(this.lidAxis[1], 0.1 + blink * 1.35);
    const e = new THREE.Euler(-this.params.lookPitch * 0.4, this.params.lookYaw * 0.4, 0);
    B[this.bi('eyeL')].quaternion.setFromEuler(e); B[this.bi('eyeR')].quaternion.setFromEuler(e);
  }
}
