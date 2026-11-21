// BILLDAD (Cox 1910, after the Boundary Lakes of Maine): beaver-sized, with a kangaroo's hind legs, webbed hind feet,
// a broad flat tail and a hooked bill. It sits on a log at the edge of the lake, and when a trout rises it leaps
// sixty rods (ours, twenty-odd metres) and slaps it senseless with its tail. Ours sits on the north-west shore.
//   wild: it perches on the shore; a trout rises, it leaps out, slaps, and comes back to eat. Walk up on it and it
//         leaps away along the shore. Crouch and creep, or hold out cheddar, and it hops to you.
//   tame (cheddar twice): whistle (G) at the water and it leaps out where you point and brings you back a trout
//         (three a day). Bannock-of-the-damned: two trout a trip, six a day.
// Events: rise, leap, slap, splash, spook, eat, befriended, fetch (give: fish), tired, reply.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { clamp, damp } from './real';
import { HelperCryptid, type Job, type Love } from './helper';
import { registerPreload } from '../preload';
import { loadReal } from './real';
import { WORLD, SPOTS } from '../../world/layout';
import { puffs } from '../../gfx/particles';

export type BilldadState = 'perch' | 'sleep' | 'crouch' | 'leap' | 'slap' | 'back' | 'spook' | 'approach' | 'eat' | 'idle' | 'follow' | 'home' | 'fish' | 'wary';

export const BILLDAD_SOUND: Record<string, string | undefined> = {
  rise: undefined, leap: 'branch_swish', slap: 'log_thud', splash: 'foliage_rustle', spook: 'animal_red_squirrel', eat: 'eat_chew', befriended: 'animal_red_squirrel',
  fetch: 'foliage_rustle', tired: undefined, reply: undefined, jobdone: undefined, jobfail: undefined,
};

const HOP_CLIP = 2.6, RUN_CLIP = 7;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color(0xdde8f0);
const SPLASH_V = new THREE.Vector3(0, 2.6, 0);

registerPreload('cryptid:billdad', () => loadReal('billdad').catch((e) => { console.warn('[cryptids] billdad', e); }));

export class Billdad extends HelperCryptid {
  readonly id = 'billdad';
  readonly name = 'Billdad';
  readonly favoriteFood = 'cheese';
  readonly rules = [
    'A billdad sits on a log at the edge of the lake, watching the water. It has a beaver\'s tail, a hawk\'s bill and a kangaroo\'s legs.',
    'When a trout rises it leaps clear out over the water, slaps the fish senseless with its tail, and comes back with it.',
    'Walk up on it and it leaps away along the shore. Crouch and creep.',
    'It cannot resist old cheddar. Hold some out and it hops right to you. Twice, and it is yours.',
    'A tame billdad fishes for you: whistle (G) and point at the water and it brings you back a trout. Three a day.',
    'At night it sleeps on its log, tail tucked under it.',
  ] as const;
  readonly sounds = BILLDAD_SOUND;
  readonly skills = ['water'] as const;
  readonly replies = { water: 'The billdad crouches on the shore, staring at the water.', come: 'It comes hopping, tail thumping.', stay: 'It hops back to its log.' };
  readonly loves: Record<string, Love> = {
    meal_bannock_damned: { trust: 1, boost: true, line: 'It ate the black bannock and its eyes went wide. It wants to FISH.' },
    meal_trout: { trust: 0.5, line: 'It ate the fried trout, bones and all, and looked at you like you were a genius.' },
  };
  declare state: BilldadState;
  /** trout left to catch today (reset at dawn) */
  private catchLeft = 3;
  private lastHour = 12;
  private from = new THREE.Vector3(); private dest = new THREE.Vector3();
  private arcT = 0; private arcDur = 1.2; private arcH = 3; private leaping = false;
  private nextRise = 12;
  private slapK = 0;
  private carrying = false;

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('billdad', o);
    this.state = 'perch';
    this.tiltLen = 0.6; this.tiltWid = 0.25;
    this.turnK = 4;
    this.shineK = 0.8;
  }
  protected shineColor() { return 0xffe0a0; }
  protected canEat() { return !this.leaping; }
  protected canDo() {
    if (this.catchLeft <= 0) { this.emit('tired'); this.emit('reply', { line: 'The billdad looks at the lake and flops down. Fished out for today.' }); return false; }
    return !this.leaping;
  }
  protected onJob(j: Job) { this.go('fish'); j.step = 0; }
  protected think(ctx: CreatureCtx, dt: number) {
    // dawn: the lake has more trout
    if (this.lastHour < 5 && ctx.hour >= 5) this.catchLeft = this.boosted ? 6 : 3;
    this.lastHour = ctx.hour;
    super.think(ctx, dt);
  }
  /** a loved recipe: a fresh day's fishing at once */
  treat(item: string): boolean { const ok = super.treat(item); if (ok && this.boosted) this.catchLeft = Math.max(this.catchLeft, 6); return ok; }

  /** the nearest dry shore to a point on the water (radial search) */
  private shore(p: THREE.Vector3, ctx: CreatureCtx, out: THREE.Vector3): THREE.Vector3 {
    let best = 1e9;
    out.copy(this.home);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      for (let r = 2; r < 60; r += 2) {
        const x = p.x + s * r, z = p.z + c * r;
        if (ctx.heightAt(x, z) > WORLD.waterY + 0.3) { if (r < best) { best = r; out.set(x, 0, z); } break; }
      }
    }
    return out;
  }
  private leap(to: THREE.Vector3, ctx: CreatureCtx, h = 3) {
    this.from.copy(this.pos); this.dest.copy(to);
    this.dest.y = Math.max(WORLD.waterY, ctx.heightAt(to.x, to.z));
    const d = this.to(to);
    this.arcT = 0; this.arcDur = clamp(0.5 + d * 0.05, 0.6, 2.2); this.arcH = h + d * 0.08; this.leaping = true;
    this.heading = Math.atan2(to.x - this.pos.x, to.z - this.pos.z);
    this.emit('leap');
  }
  protected move(ctx: CreatureCtx, dt: number) {
    if (!this.leaping) {
      super.move(ctx, dt);
      // out on the water (after a leap): it swims, low; never walks into the lake from the shore
      const ground = ctx.heightAt(this.pos.x, this.pos.z);
      if (ground < WORLD.waterY - 0.3 && this.state !== 'perch') { this.pos.y = WORLD.waterY - 0.12; return; }
      if (ground < WORLD.waterY + 0.1) { this.pos.x -= Math.sin(this.heading) * this.speed * dt; this.pos.z -= Math.cos(this.heading) * this.speed * dt; this.pos.y = ctx.heightAt(this.pos.x, this.pos.z); }
      return;
    }
    this.arcT += dt;
    const u = Math.min(1, this.arcT / this.arcDur);
    this.pos.lerpVectors(this.from, this.dest, u);
    this.pos.y = this.from.y + (this.dest.y - this.from.y) * u + 4 * this.arcH * u * (1 - u);
    this.speed = 0;
    this.pitch = (0.5 - u) * 0.9;
    this.anim('hop', { fade: 0.15, speed: 0.4 });
    if (u >= 1) { this.leaping = false; this.pitch = 0; this.pos.y = this.dest.y; }
  }
  /** a splash at a point on the water */
  private splash(at: THREE.Vector3) {
    _a.set(at.x, WORLD.waterY + 0.05, at.z);
    puffs.emit(_a, SPLASH_V, { n: 16, spread: 1.1, size: 0.45, grow: 1.4, life: 1.1, color: _c, alpha: 0.75, rise: 0.4 });
    this.emit('splash');
  }

  // ------------------------------------------------------------------------------------------------ wild
  protected wild(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    const night = !this.isDay(ctx);
    const cheese = P.held === 'cheese' && this.dist < 18;
    this.nextRise -= dt;
    if (this.leaping) return;
    switch (this.state) {
      case 'wary': case 'idle': case 'follow': case 'home': this.go('perch'); break;
      case 'perch': {
        // on its log at the edge, facing the water
        if (this.to(this.home) > 1.2) { this.target.copy(this.home); this.want = 2; this.arrive = 0.5; this.gait('idle'); break; }
        this.want = 0;
        this.face = Math.atan2(SPOTS.lake.x - this.pos.x, SPOTS.lake.z - this.pos.z);
        this.anim((this.t % 11) < 7 ? 'idle' : 'alert', { fade: 0.6 });
        if (cheese) { this.go('approach'); break; }
        if (night) { this.go('sleep'); break; }
        if (this.dist < 9 && !(P.crouch && this.pSpeed < 1.6)) { this.spook(ctx); break; }
        if (this.nextRise <= 0) {
          // a trout rises out there: crouch, then go
          this.nextRise = 25 + Math.random() * 25;
          const a = Math.atan2(SPOTS.lake.x - this.pos.x, SPOTS.lake.z - this.pos.z) + (Math.random() - 0.5) * 0.9, r = 10 + Math.random() * 12;
          this.dest.set(this.pos.x + Math.sin(a) * r, 0, this.pos.z + Math.cos(a) * r);
          if (ctx.heightAt(this.dest.x, this.dest.z) < WORLD.waterY - 0.2) { this.emit('rise', { at: this.dest.clone() }); this.go('crouch'); }
        }
        break;
      }
      case 'sleep':
        this.want = 0; this.anim('freeze', { fade: 1, speed: 0.2 });
        if (!night || this.dist < 5) this.go('perch');
        break;
      case 'crouch':
        this.want = 0; this.anim('freeze', { fade: 0.2 }); this.faceToward(this.dest);
        if (this.st > 0.8) { _b.copy(this.dest); this.leap(_b, ctx, 3.5); this.go('slap'); }
        break;
      case 'slap':
        // in the air: the tail comes over as it lands
        this.slapK = damp(this.slapK, this.arcT / this.arcDur > 0.7 ? 1 : 0, 10, dt);
        if (!this.leaping) { this.splash(this.pos); this.emit('slap'); this.go('back'); this.carrying = true; }
        break;
      case 'back':
        this.slapK = damp(this.slapK, 0, 6, dt);
        if (this.st > 0.5 && !this.leaping) { this.leap(this.home, ctx, 2.5); this.go('eat'); this.eatT = 4 + 2.5; }
        break;
      case 'spook':
        if (!this.leaping && this.st > 20) this.go('perch');
        else if (!this.leaping) { this.want = 0; this.anim('alert', { fade: 0.3 }); }
        break;
      case 'approach':
        if (!cheese && this.st > 2) { this.go('perch'); break; }
        this.target.copy(P.pos); this.arrive = 1.8; this.want = 1.8;
        if (this.dist < 2.2) { this.want = 0; this.faceToward(P.pos); this.anim('alert', { fade: 0.3 }); } else this.gait('idle');
        break;
      default: this.go('perch');
    }
  }
  private spook(ctx: CreatureCtx) {
    // away along the shore from the player
    const a = Math.atan2(this.pos.x - ctx.player.pos.x, this.pos.z - ctx.player.pos.z);
    _b.set(this.pos.x + Math.sin(a) * 14, 0, this.pos.z + Math.cos(a) * 14);
    this.shore(_b, ctx, _b);
    this.leap(_b, ctx, 2.5); this.go('spook'); this.emit('spook');
  }

  // ------------------------------------------------------------------------------------------------ work
  protected work(ctx: CreatureCtx, dt: number, j: Job) {
    if (this.leaping) return;
    switch (j.step) {
      case 0: {
        // to the shore nearest the spot
        this.shore(j.at, ctx, this.target); this.arrive = 0.6;
        const dd = this.to(this.target);
        this.want = dd > 8 ? 4 : 1.8; this.gait('idle');
        if (dd < 0.9) { j.step = 1; j.t = 0; }
        break;
      }
      case 1:
        this.want = 0; this.faceToward(j.at); this.anim('freeze', { fade: 0.2 });
        if (j.t > 0.8) { this.leap(j.at, ctx, 3.5); j.step = 2; }
        break;
      case 2:
        this.splash(this.pos); this.emit('slap'); this.slapK = 1; this.carrying = true;
        j.step = 3; j.t = 0;
        break;
      case 3:
        this.slapK = damp(this.slapK, 0, 6, dt);
        if (j.t > 0.6) { this.shore(this.pos, ctx, _b); this.leap(_b, ctx, 2.5); j.step = 4; }
        break;
      case 4: {
        // hop back to the player and drop it at their feet
        const P = ctx.player.pos;
        this.target.copy(P); this.arrive = 1.6;
        this.want = this.dist > 10 ? 4 : 1.8; this.gait('idle');
        if (this.dist < 2) {
          const n = this.boosted ? 2 : 1;
          this.catchLeft -= n; this.carrying = false;
          _a.set(P.x - this.pos.x, 0, P.z - this.pos.z).multiplyScalar(0.5).add(this.pos);
          this.emit('fetch', { give: { item: 'fish', n, at: _a.clone().setY(ctx.heightAt(_a.x, _a.z) + 0.3) } });
          this.done(true);
        }
        if (j.t > 60) this.done(false);
        break;
      }
    }
  }

  protected gait(idle: string) {
    const sp = this.speed;
    if (sp > 3) { this.anim('run', { fade: 0.2 }); this.rate(clamp(sp / RUN_CLIP, 0.6, 1.6)); }
    else if (sp > 0.12) { this.anim('hop', { fade: 0.25 }); this.rate(clamp(sp / HOP_CLIP, 0.6, 1.6)); }
    else this.anim(idle, { fade: 0.4 });
  }
  protected walkSpeed() { return 1.6; }
  protected runSpeed() { return 5; }
  protected followDist() { return 3; }
  protected idleClip() { return 'idle'; }

  protected pose(ctx: CreatureCtx) {
    // the tail slap: the paddle comes up and over
    if (this.slapK > 0.01) {
      _a.set(-Math.cos(this.heading), 0, Math.sin(this.heading));
      this.swingBone('tail0', _a, -1.6 * this.slapK);
    }
    if (!this.leaping && this.dist < 10 && this.state !== 'sleep') this.turnBone('head', ctx.player.pos, 0.5, 0.9, 0.4);
    void this.carrying;
  }
}
