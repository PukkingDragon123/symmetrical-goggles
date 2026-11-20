// SPLINTER CAT (Cox 1910; Tryon 1939). A real lynx, a big one: it hunts at night in the old timber west of the
// hollow, picks a tree, crouches and rockets head first through it looking for honey, then sits there seeing stars.
// Where it lives the trunks are smashed to matchwood.
//   - never stand between it and the tree it is staring at: it does not stop for you;
//   - set maple syrup down by a standing tree and it smashes that tree for you (a free felling); by a log or a felled
//     trunk and it smashes that to rounds and splits (free bucking: firewood);
//   - hold syrup out while it sits dazed: twice and it stops pouncing on people who come close.
// Events: growl, yowl, launch, ram (damage), smash (smash: { x, z, dx, dz }), dazed, eat, befriended, sleep.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { RealCryptid, clamp, damp, wrapAngle } from './real';
import { daylight } from './base';

export type SplinterState = 'sleep' | 'prowl' | 'stalk' | 'crouch' | 'launch' | 'dazed' | 'lick' | 'eat' | 'warn';

export const SPLINTERCAT_SOUND: Record<string, string | undefined> = {
  growl: 'hound_snarl', yowl: 'creature_distant_scream', launch: 'branch_swish', ram: 'log_thud', smash: 'branch_break_big', smashlure: 'branch_break_big',
  dazed: undefined, eat: 'eat_chew', befriended: 'hound_whine', sleep: undefined,
};

const WALK_CLIP = 0.95, RUN_CLIP = 3.2, ROCKET = 15;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class SplinterCat extends RealCryptid {
  readonly id = 'splintercat';
  readonly name = 'Splinter Cat';
  readonly favoriteFood = 'syrup';
  readonly rules = [
    'Where the trunks are smashed to matchwood and the stumps splintered from the top down, a splinter cat lives.',
    'At night it picks a tree, crouches and rockets head first straight through it, looking for honey. Then it sits there seeing stars.',
    'Never stand between it and the tree it is staring at. It does not stop for you.',
    'Set maple syrup down by a standing tree and it smashes the tree down for you. Set it by a log or a felled trunk and it smashes that to firewood.',
    'Hold syrup out while it sits dazed. Twice, and it stops pouncing on whoever comes close.',
    'By day it sleeps curled up at the foot of a smashed stump.',
  ] as const;
  readonly sounds = SPLINTERCAT_SOUND;
  declare state: SplinterState;
  private aim = new THREE.Vector3();
  private aimR = 0.3;
  private lure: string | null = null;
  private lurePos = new THREE.Vector3();
  private nextHunt = 25;
  private hunts = 0;
  /** this launch is at a person who would not back off, not at a tree */
  private pounce = false;
  private warnT = 0;
  private wob = 0;
  private curl = 0;
  private readonly side = new THREE.Vector3(); private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('splintercat', o);
    this.state = 'sleep';
    this.tiltLen = 0.9; this.tiltWid = 0.3;
    this.turnK = 3.2;
    this.shineK = 1;
  }
  protected shineColor() { return 0xffd890; }

  offer(item: string): boolean {
    if (item !== this.favoriteFood || this.dist > 3.2 || this.state === 'launch' || this.state === 'crouch') return false;
    this.go('eat'); this.anim('eat', { fade: 0.25 }); this.want = 0;
    this.emit('eat');
    if (this.gainTrust(0.5)) this.emit('befriended');
    return true;
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    const friend = this.trust >= 1;
    const day = daylight(ctx.hour) > 0.6;
    if (day) this.hunts = 0;
    this.nextHunt -= dt;
    this.wob = damp(this.wob, this.state === 'dazed' ? 1 : 0, 3, dt);
    // syrup set down anywhere near: it can smell it a long way off, day or night
    if (!this.lure && this.state !== 'launch' && this.state !== 'crouch' && this.state !== 'dazed' && this.state !== 'lick') {
      const it = this.itemNear(ctx, /^(syrup|maple_syrup)$/, this.pos, 45);
      if (it) {
        this.lure = it.id; this.lurePos.copy(it.pos);
        // a tree right by it: that one; else the spot itself (a log lying there)
        const t = ctx.trunks?.(it.pos.x, it.pos.z, 3)?.sort((a, b) => Math.hypot(a.x - it.pos.x, a.z - it.pos.z) - Math.hypot(b.x - it.pos.x, b.z - it.pos.z))[0];
        if (t) { this.aim.set(t.x, 0, t.z); this.aimR = t.r; } else { this.aim.copy(it.pos); this.aimR = 0.2; }
        this.pounce = false; this.go('stalk');
      }
    }
    switch (this.state) {
      case 'sleep':
        // lying down, chin on its paws, tail wrapped round (pose() tucks them)
        this.want = 0; this.anim('sleep', { fade: 0.8 });
        if (!day || this.dist < 4) { this.go('prowl'); if (this.dist < 4 && !friend) this.go('warn'); }
        break;
      case 'prowl': {
        if (day && this.dist > 20) { this.go('sleep'); this.target.copy(this.home); break; }
        if (!friend && this.dist < 5.5) { this.go('warn'); break; }
        // wander round its stand of timber
        if (this.st > 8 || this.pos.distanceTo(this.target) < 1) {
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 18;
          this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r); this.st = 0;
        }
        this.want = 0.9; this.arrive = 0.8;
        this.gait();
        // a hunt: a tree near it, now and then at night (it shows off when someone is about)
        if (!day && this.nextHunt <= 0 && this.hunts < 4 && this.dist < 70) {
          this.nextHunt = 60 + Math.random() * 45;
          const ts = (ctx.trunks?.(this.pos.x, this.pos.z, 16) ?? []).filter((t) => t.r < 0.42 && Math.hypot(t.x - this.pos.x, t.z - this.pos.z) > 7);
          const t = ts[Math.floor(Math.random() * ts.length)];
          if (t) { this.aim.set(t.x, 0, t.z); this.aimR = t.r; this.pounce = false; this.hunts++; this.go('stalk'); }
        }
        break;
      }
      case 'warn':
        // ears back, hiss; stay close and it goes for you
        this.want = 0; this.faceToward(P.pos); this.anim('idle2', { fade: 0.2 });
        if (this.st < dt * 1.5) this.emit('growl');
        if (friend || this.dist > 7) { this.go('prowl'); break; }
        if (this.dist < 3.5) this.warnT += dt; else this.warnT = Math.max(0, this.warnT - dt);
        if (this.warnT > 1.6) { this.warnT = 0; this.aim.set(P.pos.x, 0, P.pos.z); this.aimR = 0.3; this.pounce = true; this.go('crouch'); this.emit('growl'); }
        break;
      case 'stalk': {
        // to a launch spot 8-16 m from the target, in line
        const d = Math.hypot(this.aim.x - this.pos.x, this.aim.z - this.pos.z);
        if (d > 7.5 && d < 17) { this.go('crouch'); break; }
        const a = Math.atan2(this.pos.x - this.aim.x, this.pos.z - this.aim.z);
        this.target.set(this.aim.x + Math.sin(a) * 11, 0, this.aim.z + Math.cos(a) * 11);
        this.want = d > 17 ? 2.6 : 1.2; this.arrive = 0.6;
        this.gait();
        if (this.st > 40) this.go('prowl');
        break;
      }
      case 'crouch':
        // eyes on the tree, belly down, the back end wiggles... then it goes
        this.want = 0; this.faceToward(this.aim); this.anim('idle2', { fade: 0.2 });
        this.pitch = 0.12;
        if (this.st > 1.3 && Math.abs(wrapAngle(this.heading - Math.atan2(this.aim.x - this.pos.x, this.aim.z - this.pos.z))) < 0.12) {
          this.go('launch'); this.emit('launch'); if (!day) this.emit('yowl');
          this.anim('run', { fade: 0.1, speed: 2.2 });
        }
        if (this.st > 4) this.go('prowl');
        break;
      case 'launch': {
        // a rocket: straight, head first, nothing stops it
        const f = _a.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        this.target.set(this.aim.x, 0, this.aim.z); this.want = ROCKET; this.arrive = 0;
        this.pitch = 0.3;
        // anybody in the way
        const px = P.pos.x - this.pos.x, pz = P.pos.z - this.pos.z, along = px * f.x + pz * f.z, side = Math.abs(px * f.z - pz * f.x);
        if (along > -0.3 && along < 1.6 && side < 0.9 && !friend) {
          this.emit('ram', { damage: 0.48, impulse: f.clone().multiplyScalar(9).add(_b.set(0, 3.5, 0)) });
          if (this.pounce) { this.pounce = false; this.go('dazed'); this.anim('idle2', { fade: 0.3 }); this.speed = 0; break; }
        }
        const d = Math.hypot(this.aim.x - this.pos.x, this.aim.z - this.pos.z);
        if (d < this.aimR + 0.45 || this.st > 2.5) {
          // through it: the tree (or the log) goes to splinters, the cat sits down hard
          if (!this.pounce) this.emit(this.lure ? 'smashlure' : 'smash', { smash: { x: this.aim.x, z: this.aim.z, dx: f.x, dz: f.z } });
          this.pounce = false;
          this.go('dazed'); this.anim('idle2', { fade: 0.25 }); this.speed = 0; this.emit('dazed');
        }
        break;
      }
      case 'dazed':
        this.want = 0; this.pitch = 0;
        if (this.st > 4) {
          if (this.lure) { this.go('lick'); this.target.copy(this.lurePos); }
          else this.go('prowl');
        }
        break;
      case 'lick':
        // it smashed what smelled of syrup: now the syrup
        this.want = 1; this.arrive = 0.5; this.target.copy(this.lurePos);
        this.gait();
        if (Math.hypot(this.pos.x - this.lurePos.x, this.pos.z - this.lurePos.z) < 0.8) {
          if (this.lure && ctx.takeItem?.(this.lure)) { this.go('eat'); this.anim('eat', { fade: 0.3 }); this.emit('eat'); if (this.gainTrust(0.25)) this.emit('befriended'); }
          else this.go('prowl');
          this.lure = null;
        }
        if (this.st > 30) { this.lure = null; this.go('prowl'); }
        break;
      case 'eat':
        this.want = 0; this.anim('eat', { fade: 0.3 });
        if (this.st > 4) this.go('prowl');
        break;
    }
    if (this.state !== 'launch' && this.state !== 'crouch') this.pitch = damp(this.pitch, 0, 6, dt);
    this.turnK = this.state === 'launch' ? 0.8 : 3.2;
  }

  private gait() {
    const sp = this.speed;
    if (sp > 1.8) { this.anim('run', { fade: 0.25 }); this.rate(clamp(sp / RUN_CLIP, 0.6, 2.2)); }
    else if (sp > 0.12) { this.anim('walk', { fade: 0.3 }); this.rate(clamp(sp / WALK_CLIP, 0.5, 1.6)); }
    else this.anim('idle', { fade: 0.4 });
  }

  protected pose(ctx: CreatureCtx) {
    // asleep: the head goes down onto the paws, the tail curls round its side, it breathes
    this.curl = damp(this.curl, this.clip === 'sleep' ? 1 : 0, 2, 1 / 60);
    if (this.curl > 0.01) {
      const k = this.curl, rt = this.side.set(-Math.cos(this.heading), 0, Math.sin(this.heading)), up = this.up;
      this.swingBone('spine_004', rt, 0.28 * k); this.swingBone('spine_005', rt, 0.3 * k); this.swingBone('spine_006', rt, 0.32 * k + Math.sin(this.t * 1.3) * 0.02 * k);
      this.swingBone('tail_001', up, 0.55 * k); this.swingBone('tail_002', up, 0.7 * k); this.swingBone('tail_003', up, 0.8 * k);
      this.swingBone('tail_001', rt, 0.35 * k);
      return;
    }
    // seeing stars: the head wobbles round in circles
    if (this.wob > 0.02) {
      const h = this.bones.spine_006;
      if (h) { const t = this.t * 5; h.rotateX(Math.sin(t) * 0.25 * this.wob); h.rotateZ(Math.cos(t) * 0.25 * this.wob); }
    } else if (this.state !== 'launch' && this.dist < 12) this.turnBone('spine_006', ctx.player.pos, 0.55, 0.9, 0.4);
  }
}
