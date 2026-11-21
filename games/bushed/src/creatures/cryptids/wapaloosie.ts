// WAPALOOSIE (Cox 1910): the size and shape of a dachshund, but a tree dweller: it climbs by wriggling up the trunk
// like an inchworm, eats lichen and moss, and from the top of a tall spruce sees everything in the bush. Ours keeps
// the tall spruce west of the cabin.
//   wild: up and down its trunks, chattering; come close and it slips round to the far side of the trunk and peeks.
//         Hazelnuts left at the foot of its tree (or held out, crouched) bring it down.
//   tame (hazelnuts twice): whistle (G) at a tree (or anywhere: it picks the tallest near) and it climbs to the top
//         and scouts: caches and cryptids within 160 m get marked for you (companions.ts). Firefly-glow broth: it
//         sees 450 m and the marks last the whole night.
// Events: chatter, climb, hide, peek, come_down, eat, befriended, scout ({ r }), reply.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { clamp, damp, wrapAngle } from './real';
import { HelperCryptid, type Job, type Love } from './helper';
import { registerPreload } from '../preload';
import { loadReal } from './real';

export type WapaloosieState = 'tree' | 'down' | 'approach' | 'eat' | 'idle' | 'follow' | 'home' | 'scout' | 'wary';

export const WAPALOOSIE_SOUND: Record<string, string | undefined> = {
  chatter: 'animal_red_squirrel', climb: 'foliage_rustle', hide: 'foliage_rustle', peek: undefined, come_down: 'foliage_rustle', eat: 'eat_crunch',
  befriended: 'animal_red_squirrel', scout: 'animal_red_squirrel', reply: undefined, jobdone: undefined, jobfail: undefined,
};

const RUN_CLIP = 4.6;
const _a = new THREE.Vector3();

registerPreload('cryptid:wapaloosie', () => loadReal('wapaloosie').catch((e) => { console.warn('[cryptids] wapaloosie', e); }));

interface Trunk { x: number; z: number; r: number }

export class Wapaloosie extends HelperCryptid {
  readonly id = 'wapaloosie';
  readonly name = 'Wapaloosie';
  readonly favoriteFood = 'nuts';
  readonly rules = [
    'A wapaloosie is the size and shape of a dachshund, but it lives in the trees. It wriggles up a trunk like an inchworm.',
    'Come close and it slips round to the far side of the trunk. Stand still and it peeks.',
    'Hazelnuts at the foot of its tree, or held out while you crouch, bring it down.',
    'Feed it twice from your hand and it follows you, chattering.',
    'A tame one scouts: whistle (G) at a tree and it climbs to the top and marks every cache and cryptid it can see.',
    'It eats lichen and moss off the bark. Its fur goes green with it.',
  ] as const;
  readonly sounds = WAPALOOSIE_SOUND;
  readonly skills = ['tree', 'ground'] as const;
  readonly replies = { tree: 'The wapaloosie streaks up the trunk.', ground: 'The wapaloosie looks for the tallest tree.', come: 'It comes undulating along the ground.', stay: 'It goes back to its spruces.' };
  readonly loves: Record<string, Love> = {
    meal_firefly_broth: { trust: 1, boost: true, line: 'It lapped the broth up and its eyes started to glow. Green.' },
    meal_squonk_jelly: { trust: 0.75, line: 'It licked the jelly jar clean and chattered at you for a full minute.' },
  };
  declare state: WapaloosieState;
  /** the radius it scouts (m) */
  get scoutR() { return this.boosted ? 450 : 160; }
  /** on a trunk: how high (m above the ground), and which */
  climbH = 0;
  private trunk: Trunk | null = null;
  private side = 0;
  private wantH = 0;
  private chatterT = 4;
  private peek = 0;

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('wapaloosie', o);
    this.state = 'tree';
    this.tiltLen = 0.8; this.tiltWid = 0.2;
    this.turnK = 5;
    this.shineK = 0.9;
  }
  protected shineColor() { return 0xb8ffb0; }
  protected canEat() { return this.climbH < 0.4; }
  protected onJob(j: Job) { this.go('scout'); j.step = 0; }

  private trunkNear(ctx: CreatureCtx, x: number, z: number, r: number, minR = 0.12): Trunk | null {
    let best: Trunk | null = null, bs = -1e9;
    for (const t of ctx.trunks?.(x, z, r) ?? []) {
      if (t.r < minR) continue;
      const s = t.r * 4 - Math.hypot(t.x - x, t.z - z) * 0.1;
      if (s > bs) { bs = s; best = t; }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------------ climbing
  /** on its trunk at height climbH, on the side at angle `side` (rad round the trunk), belly to the bark */
  protected move(ctx: CreatureCtx, dt: number) {
    const t = this.trunk;
    if (!t || (this.climbH <= 0.02 && this.wantH <= 0.02)) { this.tiltLen = 0.8; super.move(ctx, dt); return; }
    // climb toward wantH, wriggling
    const v = this.wantH > this.climbH ? 1.8 : -2.4;
    this.climbH = Math.max(0, this.climbH + clamp(this.wantH - this.climbH, -2.4 * dt, 1.8 * dt));
    // the trunk tapers: hug the bark at this height (trunk colliders give the base radius)
    const off = t.r * Math.max(0.35, 1 - this.climbH / 24) + 0.07;
    this.pos.set(t.x + Math.sin(this.side) * off, ctx.heightAt(t.x, t.z) + this.climbH, t.z + Math.cos(this.side) * off);
    // belly to the trunk, nose up (down when it comes down)
    this.heading = this.side + Math.PI;
    this.pitch = this.climbH > 0.15 ? (v > 0 || this.climbH >= this.wantH ? -1.5 : 1.5) : damp(this.pitch, 0, 6, dt);
    this.tiltLen = 0;
    this.speed = 0;
    const moving = Math.abs(this.climbH - this.wantH) > 0.05;
    this.anim(moving ? 'run' : 'freeze', { fade: 0.2, speed: moving ? 1.3 : 1 });
  }
  /** round the trunk to the side away from a point (hiding), a little at a time */
  private slip(from: THREE.Vector3, dt: number) {
    if (!this.trunk) return;
    const away = Math.atan2(this.trunk.x - from.x, this.trunk.z - from.z);
    this.side += clamp(wrapAngle(away - this.side), -2.5 * dt, 2.5 * dt);
  }

  // ------------------------------------------------------------------------------------------------ wild
  protected wild(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    if (!this.trunk) this.trunk = this.trunkNear(ctx, this.home.x, this.home.z, 12);
    const nuts = this.itemNear(ctx, /^nuts$/, this.home, 14) ?? (this.trunk ? this.itemNear(ctx, /^nuts$/, _a.set(this.trunk.x, 0, this.trunk.z), 6) : null);
    const held = P.held === 'nuts' && P.crouch && this.dist < 14;
    this.chatterT -= dt;
    switch (this.state) {
      case 'wary': case 'idle': case 'follow': case 'home': this.go('tree'); break;
      case 'tree': {
        if (!this.trunk) { this.anim('idle'); break; }
        // up and down the trunk, round it; near people: round the far side, peeking
        if (this.dist < 16) {
          this.wantH = Math.max(this.wantH, 3.5);
          if (this.pSpeed < 0.3 && this.dist > 4) { this.peek = damp(this.peek, 1, 1, dt); if (this.peek > 0.95 && this.st > 3) { this.emit('peek'); this.st = 0; } }
          else { this.peek = damp(this.peek, 0, 3, dt); this.slip(P.pos, dt); if (this.st > 2) { this.emit('hide'); this.st = 0; } }
          if (this.peek > 0.5) this.side += clamp(wrapAngle(Math.atan2(P.pos.x - this.trunk.x, P.pos.z - this.trunk.z) - this.side), -0.6 * dt, 0.6 * dt) * 0.4;
        } else if (this.st > 7) {
          this.st = 0;
          this.wantH = 1.5 + Math.random() * 8;
          this.side += (Math.random() - 0.5) * 2;
          if (Math.random() < 0.25) { const t = this.trunkNear(ctx, this.home.x + (Math.random() - 0.5) * 16, this.home.z + (Math.random() - 0.5) * 16, 8); if (t) { this.wantH = 0; this.next = t; } }
        }
        if (this.next && this.climbH <= 0.02) { this.trunk = this.next; this.next = null; }
        if (this.chatterT <= 0) { this.chatterT = 9 + Math.random() * 14; this.emit('chatter'); }
        if (nuts || held) { this.wantH = 0; if (this.climbH <= 0.02) { this.go('approach'); this.emit('come_down'); } }
        break;
      }
      case 'approach': {
        this.wantH = 0;
        const goal = nuts?.pos ?? P.pos;
        this.target.copy(goal); this.arrive = nuts ? 0.5 : 1.6; this.want = 2.4;
        this.gait('idle');
        if (nuts && this.to(nuts.pos) < 0.7) { ctx.takeItem?.(nuts.id); this.fed++; this.eatT = 3; this.go('eat'); this.emit('eat'); if (this.gainTrust(0.5)) this.emit('befriended'); break; }
        if (!nuts && !held && this.st > 2) { this.go('tree'); break; }
        if (!nuts && this.dist < 1.8) { this.want = 0; this.faceToward(P.pos); this.anim('scout', { fade: 0.3 }); }
        if (this.dist > 30) this.go('tree');
        break;
      }
      default: this.go('tree');
    }
  }
  private next: Trunk | null = null;

  // ------------------------------------------------------------------------------------------------ tame
  protected tame(ctx: CreatureCtx, dt: number) {
    // a tame one comes down off its trunk to follow
    if (this.climbH > 0.02) { this.wantH = 0; return; }
    this.trunk = null;
    super.tame(ctx, dt);
  }
  protected work(ctx: CreatureCtx, dt: number, j: Job) {
    switch (j.step) {
      case 0: {
        // the tallest (thickest) trunk near the spot
        const t = this.trunkNear(ctx, j.at.x, j.at.z, j.kind === 'tree' ? 3 : 14, 0.15);
        if (!t) { this.emit('reply', { line: 'The wapaloosie can\'t find a tree there worth climbing.' }); this.done(false); return; }
        this.trunk = null; this.next = t; j.step = 1;
        break;
      }
      case 1: {
        const t = this.next!;
        this.target.set(t.x, 0, t.z); this.arrive = t.r + 0.35;
        this.want = this.to(this.target) > 8 ? 4.5 : 2; this.gait('idle');
        if (this.to(this.target) < t.r + 0.5) { this.trunk = t; this.side = Math.atan2(this.pos.x - t.x, this.pos.z - t.z); this.wantH = 11 + t.r * 6; j.step = 2; this.emit('climb'); }
        break;
      }
      case 2:
        if (this.climbH >= this.wantH - 0.05) { j.step = 3; j.t = 0; }
        break;
      case 3:
        // at the top: look round (it turns round the trunk), then call out what it saw
        this.side += dt * 0.9;
        if (j.t > 4.5) { this.emit('scout', { r: this.scoutR, at: this.pos.clone(), long: this.boosted }); j.step = 4; this.wantH = 0; }
        break;
      default:
        if (this.climbH <= 0.02) { this.trunk = null; this.done(true); }
    }
  }

  protected gait(idle: string) {
    const sp = this.speed;
    if (sp > 0.12) { this.anim('run', { fade: 0.2 }); this.rate(clamp(sp / RUN_CLIP, 0.5, 1.8)); }
    else this.anim(idle, { fade: 0.4 });
  }
  protected walkSpeed() { return 1.8; }
  protected runSpeed() { return 5; }
  protected followDist() { return 2.5; }

  protected pose(ctx: CreatureCtx) {
    if (this.climbH < 0.3 && this.dist < 8) this.turnBone('head', ctx.player.pos, 0.6, 1, 0.5);
    else if (this.peek > 0.3) this.turnBone('head', ctx.player.pos, 0.8 * this.peek, 1.2, 0.8);
  }
}
