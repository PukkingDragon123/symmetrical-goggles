// HOOP SNAKE (camp story all over North America; Tryon 1939). A real black mamba, rigged: it lies coiled at the top
// of the steep bank by the lake, and when you walk below it, it bites its own tail and comes rolling down after you
// like a wagon wheel. The game rolls it by turning each of its ~96 spine bones a little (a ring of the right size for
// its length) and spinning the ring about its centre at the ground speed.
//   - it can barely steer: step sideways at the last moment and it rolls right past;
//   - jump as it reaches you and you go clean through the hoop;
//   - its tail is a stinger: roll it into a tree and the tree withers and falls (a free felling; mind which way);
//   - on flat ground it wobbles, falls over and slithers back up the hill;
//   - eggs: hold them out or leave them by its coil; twice and it stops rolling at you, and stings the tree you chop.
// Events: hiss, roll, sting (damage), through, wither, tree (fell), miss, flop, eat, befriended, coil.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { RealCryptid, clamp, damp, wrapAngle } from './real';
import { isNight } from './base';

export type HoopState = 'coil' | 'watch' | 'grab' | 'roll' | 'stuck' | 'flop' | 'unroll' | 'return' | 'eat' | 'fetch';

export const HOOPSNAKE_SOUND: Record<string, string | undefined> = {
  hiss: 'gumberoo_deflate', roll: 'log_roll', sting: 'branch_snap', through: 'branch_swish', wither: 'tree_creak', tree: 'branch_break_big',
  miss: 'branch_swish', flop: 'foliage_rustle', eat: 'eat_crunch', befriended: 'gumberoo_deflate', coil: undefined,
};

/** how much of a full ring the body closes (the head sits in the gap, mouth on the tail) */
const CLOSE = 0.93;
/** the body's radius (m), so the ring rolls on its belly */
const GIRTH = 0.045;
const _a = new THREE.Vector3(), _m = new THREE.Matrix4();

export class HoopSnake extends RealCryptid {
  readonly id = 'hoopsnake';
  readonly name = 'Hoop Snake';
  readonly favoriteFood = 'eggs';
  readonly rules = [
    'It lies coiled at the top of a steep bank, and comes for whatever walks below it.',
    'It bites its own tail and rolls downhill after you like a wheel. It can hardly steer: step aside at the last moment and it rolls right past.',
    'Jump as it reaches you and you go clean through the hoop.',
    'Its tail is a stinger. Whatever it stings withers and dies, trees included: dodge it in front of a tree and the tree falls. Mind which way.',
    'On flat ground it wobbles, falls over and slithers back up its hill.',
    'Eggs, held out or left by its coil, stop it rolling at you. Twice, and it stings the tree you are chopping for you.',
  ] as const;
  readonly sounds = HOOPSNAKE_SOUND;
  declare state: HoopState;
  /** 0 lying straight / coiled .. 1 a hoop */
  hoop = 0;
  private chain: THREE.Bone[] = [];
  private restQ: THREE.Quaternion[] = [];
  private restP: THREE.Vector3[] = [];
  private hoopQ: THREE.Quaternion[] = [];
  private root: THREE.Bone | null = null;
  private rootQ = new THREE.Quaternion(); private rootP = new THREE.Vector3();
  /** the ring: radius, centre (model space, before the shift) */
  private R = 0.45; private C = new THREE.Vector3();
  private rollA = 0;
  private hitT = 0; private slowT = 0;
  private hissed = false;
  private standH = 1;
  private tree: { x: number; z: number; r: number } | null = null;
  private stingDir = new THREE.Vector3();
  private witherT = -1;
  private helpT = 0;
  private egg: string | null = null;
  private eggPos = new THREE.Vector3();

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('hoopsnake', o);
    this.state = 'coil';
    this.tiltLen = 2.0; this.tiltWid = 0;
    this.turnK = 1.6;
    this.shineK = 0.4;
  }

  protected onAttach() {
    const body = this.body!;
    const names = Object.keys(this.bones).filter((n) => /^(spine|tail)_\d+$/.test(n));
    names.sort((a, b) => (a[0] === b[0] ? Number(a.split('_')[1]) - Number(b.split('_')[1]) : a.startsWith('spine') ? -1 : 1));
    this.chain = names.map((n) => this.bones[n]);
    this.root = this.bones.root ?? null;
    if (this.root) { this.rootQ.copy(this.root.quaternion); this.rootP.copy(this.root.position); }
    // rest pose (straight along +Z, head first), in model space
    body.updateMatrixWorld(true);
    const inv = _m.copy(body.matrixWorld).invert();
    const P: THREE.Vector3[] = [], Q: THREE.Quaternion[] = [];
    for (const b of this.chain) {
      this.restQ.push(b.quaternion.clone()); this.restP.push(b.position.clone());
      const M = new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      M.decompose(p, q, s); P.push(p); Q.push(q);
    }
    let L = 0; const cum = [0];
    for (let i = 1; i < P.length; i++) { L += P[i].distanceTo(P[i - 1]); cum.push(L); }
    const last = P.length > 1 ? P[P.length - 1].distanceTo(P[P.length - 2]) : 0.03;
    L += last;
    const total = Math.PI * 2 * CLOSE;
    this.R = L / total;
    // each bone turns the ring a little about the model's X axis (curling the body up and over)
    let prev = 0;
    const X = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < this.chain.length; i++) {
      const segMid = (cum[i] + (i + 1 < cum.length ? cum[i + 1] : L)) * 0.5;
      const a = (segMid / L) * total;
      const axis = X.clone().applyQuaternion(Q[i].clone().invert()).normalize();
      this.hoopQ.push(this.restQ[i].clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, a - prev)));
      prev = a;
    }
    this.C.copy(P[0]).add(new THREE.Vector3(0, this.R, 0));
  }

  offer(item: string): boolean {
    if (item !== this.favoriteFood || this.dist > 3.2 || this.hoop > 0.2) return false;
    this.feed();
    return true;
  }
  private feed() {
    this.go('eat'); this.anim('strike', { once: true, fade: 0.2 }); this.want = 0;
    this.emit('eat');
    if (this.gainTrust(0.5)) this.emit('befriended');
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    const friend = this.trust >= 1;
    const night = isNight(ctx.hour);
    // is the player in the air (jumping)? their height over the ground against how they usually stand
    const ph = P.pos.y - ctx.heightAt(P.pos.x, P.pos.z);
    this.standH = ph < this.standH ? ph : damp(this.standH, ph, 0.25, dt);
    const airborne = ph > this.standH + 0.3;
    const below = this.pos.y - ctx.heightAt(P.pos.x, P.pos.z);
    this.hitT = Math.max(0, this.hitT - dt);
    this.helpT = Math.max(0, this.helpT - dt);
    const H = this.home;
    switch (this.state) {
      case 'coil': {
        this.want = 0; this.anim(night ? 'coiled' : this.dist < 30 ? 'idle' : 'coiled', { fade: 0.6 });
        // eggs left by its coil
        const egg = this.itemNear(ctx, /^eggs$/, this.pos, 9);
        if (egg && this.dist > 6) { this.egg = egg.id; this.eggPos.copy(egg.pos); this.go('fetch'); break; }
        if (friend) {
          // a friend chopping a tree near it: it rolls over and stings that tree
          if (this.helpT <= 0 && (P.action === 'swing' || P.action === 'chop') && this.dist < 28) {
            const t = ctx.trunks?.(P.pos.x + P.dir.x * 1.2, P.pos.z + P.dir.z * 1.2, 2.2)?.[0];
            if (t) { this.tree = t; this.helpT = 90; this.faceToward(_a.set(t.x, 0, t.z)); this.go('grab'); this.anim('strike', { fade: 0.2 }); }
          }
          break;
        }
        if (!night && this.dist < 30 && below > 1.2) { this.go('watch'); this.faceToward(P.pos); }
        break;
      }
      case 'watch':
        this.want = 0; this.faceToward(P.pos); this.anim('idle', { fade: 0.3 });
        if (!this.hissed) { this.hissed = true; this.emit('hiss'); }
        if (this.dist > 34 || below < 0.6) { this.go('coil'); this.hissed = false; break; }
        if (this.st > 1.6 && Math.abs(wrapAngle(this.heading - Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z))) < 0.25) { this.tree = null; this.go('grab'); this.anim('strike', { fade: 0.2 }); }
        break;
      case 'grab':
        this.want = 0;
        this.hoop = Math.min(1, this.hoop + dt / 0.7);
        if (this.hoop >= 1) { this.go('roll'); this.speed = this.tree ? 2.5 : 1.2; this.slowT = 0; this.emit('roll'); }
        break;
      case 'roll': {
        // contact point: under the ring's centre
        const f = _a.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        const cx = this.pos.x + f.x * this.C.z, cz = this.pos.z + f.z * this.C.z;
        // the player: sting, or straight through a jumper
        if (this.hitT <= 0 && Math.hypot(P.pos.x - cx, P.pos.z - cz) < 0.75 && !friend) {
          this.hitT = 1.5;
          if (airborne) this.emit('through');
          else this.emit('sting', { damage: 0.32, impulse: f.clone().multiplyScalar(4).add(new THREE.Vector3(0, 2.5, 0)) });
        } else if (this.hitT <= 0 && this.dist < 3 && Math.hypot(P.pos.x - cx, P.pos.z - cz) < 2 && this.speed > 2) {
          // rolled right past
          const side = (P.pos.x - cx) * f.z - (P.pos.z - cz) * f.x;
          if (Math.abs(side) > 0.75 && (P.pos.x - cx) * f.x + (P.pos.z - cz) * f.z < 0) { this.hitT = 2; this.emit('miss'); }
        }
        // a tree in the way: the stinger goes in
        for (const t of ctx.trunks?.(cx, cz, 1.6) ?? []) {
          const dx = t.x - cx, dz = t.z - cz;
          if (Math.hypot(dx, dz) < t.r + 0.3 && dx * f.x + dz * f.z > -0.1) {
            this.tree = t; this.stingDir.copy(f); this.witherT = 1.6;
            this.go('stuck'); this.speed = 0; this.emit('wither'); break;
          }
        }
        if (this.state !== 'roll') break;
        if (this.speed < 0.7) this.slowT += dt; else this.slowT = 0;
        if (this.slowT > 0.9 || this.st > 25 || Math.hypot(this.pos.x - H.x, this.pos.z - H.z) > 70) { this.go('flop'); this.emit('flop'); }
        break;
      }
      case 'stuck':
        this.want = 0;
        this.witherT -= dt;
        if (this.witherT <= 0 && this.tree) {
          const t = this.tree; this.tree = null;
          this.emit('tree', { fell: { x: t.x, z: t.z, dx: this.stingDir.x, dz: this.stingDir.z } });
        }
        if (this.st > 2.2) this.go('unroll');
        break;
      case 'flop':
        this.want = 0;
        // it wobbles over and lets go of its tail
        this.roll = Math.min(1.2, this.st * 2.2) * Math.sign(Math.sin(this.heading * 7) + 0.1);
        if (this.st > 0.6) this.go('unroll');
        break;
      case 'unroll':
        this.want = 0;
        this.hoop = Math.max(0, this.hoop - dt / 0.8);
        this.roll = damp(this.roll, 0, 5, dt);
        if (this.hoop <= 0) { this.rollA = 0; this.go('return'); }
        break;
      case 'return': {
        this.target.copy(H); this.want = 1.0; this.arrive = 0.8;
        this.anim(this.speed > 0.2 ? 'move_slow' : 'idle', { fade: 0.4 }); this.rate(clamp(this.speed / 0.55, 0.6, 2));
        if (Math.hypot(this.pos.x - H.x, this.pos.z - H.z) < 1) { this.go('coil'); this.hissed = false; this.emit('coil'); }
        if (this.st > 120) { this.pos.copy(H); this.go('coil'); }
        break;
      }
      case 'fetch': {
        this.target.copy(this.eggPos); this.want = 0.9; this.arrive = 0.5;
        this.anim(this.speed > 0.2 ? 'move_slow' : 'idle', { fade: 0.4 }); this.rate(clamp(this.speed / 0.55, 0.6, 2));
        if (Math.hypot(this.pos.x - this.eggPos.x, this.pos.z - this.eggPos.z) < 0.7) {
          if (this.egg && ctx.takeItem?.(this.egg)) this.feed(); else this.go('return');
          this.egg = null;
        }
        if (this.st > 40) this.go('return');
        break;
      }
      case 'eat':
        this.want = 0;
        if (this.st > 2.5) this.go(this.dist < 30 && Math.hypot(this.pos.x - H.x, this.pos.z - H.z) < 1.5 ? 'coil' : 'return');
        break;
    }
    if (this.state !== 'flop' && this.state !== 'unroll') this.roll = damp(this.roll, 0, 4, dt);
    // straight on the ground it follows the slope; as a hoop it stands upright
    this.tiltLen = this.hoop > 0.05 ? 0 : 2.0;
  }

  protected move(ctx: CreatureCtx, dt: number) {
    if (this.state !== 'roll' || this.manual) { if (this.state !== 'stuck' && this.state !== 'grab') super.move(ctx, dt); else this.speed = 0; return; }
    const P = ctx.player;
    const f = _a.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    // downhill pulls it on; it barely steers (toward its tree, or toward you while you are ahead of it)
    const grade = (ctx.heightAt(this.pos.x + f.x, this.pos.z + f.z) - ctx.heightAt(this.pos.x - f.x, this.pos.z - f.z)) * 0.5;
    let acc = -grade * 9.8 * 0.6 - 1.1;
    let aim: number | null = null;
    if (this.tree) { aim = Math.atan2(this.tree.x - this.pos.x, this.tree.z - this.pos.z); acc = Math.max(acc, (4 - this.speed) * 2); }
    else if (this.trust < 1) {
      const a = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      // it commits in the last few metres: it cannot steer at you any more
      if (Math.abs(wrapAngle(a - this.heading)) < 1.1 && this.dist > 8) aim = a;
    }
    if (aim !== null) this.heading += clamp(wrapAngle(aim - this.heading), -0.4 * dt, 0.4 * dt);
    this.speed = clamp(this.speed + acc * dt, 0, 9);
    this.pos.x += f.x * this.speed * dt; this.pos.z += f.z * this.speed * dt;
    this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.rollA += (this.speed / this.R) * dt;
  }

  protected pose(_ctx: CreatureCtx, dt: number) {
    const k = this.hoop;
    // the whole ring: centre over the neck, spinning about its axle while it rolls
    const s = k * k * (3 - 2 * k);
    this.body!.position.set(-this.C.x * s, -this.C.y * s, -this.C.z);
    this.holder.position.set(0, (this.R + GIRTH) * s, this.C.z);
    this.holder.rotation.x = this.state === 'roll' || this.state === 'stuck' ? this.rollA : damp(this.holder.rotation.x, Math.round(this.holder.rotation.x / (Math.PI * 2)) * Math.PI * 2, 4, dt);
    if (k <= 0.001 || !this.chain.length) return;
    if (this.root) { this.root.quaternion.slerp(this.rootQ, s); this.root.position.lerp(this.rootP, s); }
    for (let i = 0; i < this.chain.length; i++) {
      const b = this.chain[i];
      b.quaternion.slerp(this.hoopQ[i], s);
      b.position.lerp(this.restP[i], s);
    }
  }
}
