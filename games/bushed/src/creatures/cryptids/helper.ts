// The four cryptids you can put to work once they trust you (roperite, hugag, billdad, wapaloosie): a RealCryptid
// with trust, a follow / stay order, a job queue of one, and the plumbing companions.ts drives:
//   c.command(kind, at, extra)   // sent at something (G + pointing): a log, a tree, the water, the ground
//   c.call(at)                   // whistled over (hold G): it follows you
//   c.interact                   // E when near: follow / stay (critters.ts registers it)
//   c.treat(item)                // a loved camp recipe (src/game/cooking/cryptid_recipes.ts): a big trust jump and
//                                // its "boosted" ability
// Each subclass runs its wild behaviour in wild(), its jobs in work(), and says what it can be sent at in `skills`.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { RealCryptid, clamp, damp } from './real';
import { daylight } from './base';

export type TargetKind = 'log' | 'tree' | 'water' | 'ground';

export interface Job {
  kind: TargetKind;
  /** where (a log's position, a tree's foot, a spot on the water, a spot on the ground) */
  at: THREE.Vector3;
  /** a way: the push direction for a tree, the facing for a scout */
  dir: THREE.Vector3;
  /** whatever the router passes along (a wood piece, a trunk radius) */
  ref?: unknown;
  r?: number;
  /** seconds on it */
  t: number;
  /** step within the job (each creature's own) */
  step: number;
}

/** a loved recipe: the dish item id -> what it does for each creature that loves it */
export interface Love { trust: number; boost?: boolean; line: string }

const _v = new THREE.Vector3();

export abstract class HelperCryptid extends RealCryptid {
  /** what it can be sent at, best first */
  abstract readonly skills: readonly TargetKind[];
  /** what it says (thinks, through the lumberjack) when it takes an order: 'on it' lines by job kind */
  abstract readonly replies: Partial<Record<TargetKind | 'come' | 'stay', string>>;
  /** loved camp recipes (dish item id) */
  abstract readonly loves: Readonly<Record<string, Love>>;
  /** the 'uncanny' buff from a cryptid recipe: trust comes faster (companions.ts sets it) */
  static trustK = 1;
  /** follow the player (befriended, whistled over) or keep to home */
  follow = false;
  job: Job | null = null;
  /** a loved recipe was eaten: its special ability is on (each creature says what it does) */
  boosted = false;
  /** feeds of its favourite food so far (the Book: 'twice and ...') */
  fed = 0;
  /** seconds of the current reply's cool-down (no chatter spam) */
  protected quiet = 0;
  /** last time the player whistled it over */
  protected calledAt = -99;
  protected eatT = 0;

  /** E near a befriended one: follow / stay (critters.ts registers this on the object) */
  readonly interact = {
    label: () => this.trust >= 1 ? `${this.name}: ${this.follow ? 'stay here' : 'come with me'}  ·  G sends it at what you look at` : '',
    use: () => { this.follow = !this.follow; if (!this.follow) this.job = null; this.say(this.follow ? 'come' : 'stay'); this.emit(this.follow ? 'follow' : 'stay'); },
    enabled: () => this.trust >= 1,
  };

  get friend(): boolean { return this.trust >= 1; }

  /** raise trust (the uncanny buff speeds it up); true the moment it is befriended */
  protected gainTrust(k: number) { const was = this.trust; const now = super.gainTrust(k * HelperCryptid.trustK); if (now && was < 1) { this.follow = true; } return now; }

  /** a reply through the event stream (critters.ts turns 'reply' lines into thoughts) */
  protected say(kind: keyof HelperCryptid['replies']) {
    const line = this.replies[kind];
    if (line && this.quiet <= 0) { this.quiet = 3; this.emit('reply', { line }); }
  }

  /** sent at something: true when it takes the job (befriended, able, not busy eating) */
  command(kind: TargetKind, at: THREE.Vector3, o: { dir?: THREE.Vector3; ref?: unknown; r?: number } = {}): boolean {
    if (!this.friend || !this.skills.includes(kind) || !this.canDo(kind, at, o)) return false;
    this.job = { kind, at: at.clone(), dir: (o.dir ?? _v.set(0, 0, 1)).clone(), ref: o.ref, r: o.r, t: 0, step: 0 };
    this.follow = true;
    this.say(kind);
    this.onJob(this.job);
    return true;
  }
  /** a subclass's veto (a log too heavy, no water near) */
  protected canDo(_kind: TargetKind, _at: THREE.Vector3, _o: { ref?: unknown; r?: number }): boolean { return true; }
  protected onJob(_j: Job) { /* */ }
  /** whistled over: drop what it is doing (unless mid-job) and follow */
  call(_at: THREE.Vector3): boolean {
    if (!this.friend) return false;
    this.follow = true; this.calledAt = this.t;
    if (!this.job) this.say('come');
    return true;
  }
  /** stop the job (finished or given up) */
  protected done(ok = true) { if (this.job) this.emit(ok ? 'jobdone' : 'jobfail', { job: this.job.kind }); this.job = null; this.go('idle'); }

  /** a loved camp recipe held out: trust jumps, a special reaction, maybe its boost. true when it takes it */
  treat(item: string): boolean {
    const l = this.loves[item];
    if (!l || this.dist > 3.6) return false;
    this.job = null; this.eatT = 4; this.go('eat'); this.want = 0;
    this.emit('eat'); this.emit('treat', { line: l.line, item });
    if (l.boost) this.boosted = true;
    if (this.gainTrust(l.trust)) this.emit('befriended');
    return true;
  }

  /** the favourite food held out */
  offer(item: string): boolean {
    if (this.loves[item]) return this.treat(item);
    if (item !== this.favoriteFood || this.dist > 3.4 || !this.canEat()) return false;
    this.job = null; this.eatT = 3; this.go('eat'); this.want = 0;
    this.fed++;
    this.emit('eat');
    if (this.gainTrust(0.5)) this.emit('befriended');
    return true;
  }
  protected canEat(): boolean { return true; }

  protected think(ctx: CreatureCtx, dt: number) {
    this.quiet -= dt;
    if (this.state === 'eat') {
      this.want = 0; this.faceToward(ctx.player.pos);
      this.anim(this.eatClip(), { fade: 0.3 });
      if ((this.eatT -= dt) <= 0) this.go(this.friend ? 'idle' : 'wary');
      return;
    }
    if (this.friend) {
      if (this.job) { this.job.t += dt; this.work(ctx, dt, this.job); if (this.job && this.job.t > 120) this.done(false); return; }
      this.tame(ctx, dt);
    } else this.wild(ctx, dt);
  }
  protected eatClip(): string { return 'eat'; }
  /** before it trusts you */
  protected abstract wild(ctx: CreatureCtx, dt: number): void;
  /** on a job */
  protected abstract work(ctx: CreatureCtx, dt: number, j: Job): void;
  /** befriended, no job: follow at a few metres or potter about home */
  protected tame(ctx: CreatureCtx, dt: number) {
    const P = ctx.player.pos;
    if (this.follow) {
      const k = this.followDist();
      if (this.dist > k + 1.5) {
        // trot to a spot beside and behind the player
        const a = Math.atan2(this.pos.x - P.x, this.pos.z - P.z);
        this.target.set(P.x + Math.sin(a) * k, 0, P.z + Math.cos(a) * k);
        this.want = this.dist > 25 ? this.runSpeed() : this.dist > 9 ? this.walkSpeed() * 1.8 : this.walkSpeed(); this.arrive = 0.8;
        this.go('follow');
      } else { this.want = 0; this.faceToward(P); this.go('idle'); }
    } else {
      // keep to home, grazing about
      if (this.pos.distanceTo(this.home) > 14 || this.st > 12) {
        if (this.st > 12) this.st = 0;
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
        this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r);
      }
      this.want = this.pos.distanceTo(this.target) > 1 ? this.walkSpeed() : 0; this.arrive = 0.8;
      this.go('home');
    }
    this.gait(this.idleClip());
  }
  protected followDist() { return 4; }
  protected idleClip() { return 'idle'; }
  protected walkSpeed() { return 1.2; }
  protected runSpeed() { return 4; }
  /** ground speed -> clip; subclasses give their clip speeds */
  protected abstract gait(idle: string): void;

  protected isDay(ctx: CreatureCtx) { return daylight(ctx.hour) > 0.5; }
  /** the player's horizontal distance to a point */
  protected pdist(ctx: CreatureCtx, p: THREE.Vector3) { return Math.hypot(ctx.player.pos.x - p.x, ctx.player.pos.z - p.z); }
  protected to(p: THREE.Vector3) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
}

export { clamp, damp };
