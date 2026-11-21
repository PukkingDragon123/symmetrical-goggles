// HUGAG (Cox 1910): moose-sized, with no joints in its legs, a long overhanging upper lip and a wrinkled hide. It
// cannot lie down, so it sleeps leaning on a tree, and the old hunters' trick was to saw the tree nearly through:
// over it goes, and it cannot get up again. Ours browses the old cedar east of the hollow, stiff-legged.
//   wild: it browses and wanders; at night it sleeps leaning on a tree (the tree creaks). Startle it (run, chop, shoot
//         near it) and it stampedes in a straight line: it cannot turn. Fell the tree it leans on and it goes over
//         and lies there kicking: help it up (E) and it remembers.
//   tame (wild onions twice, or helped up and fed once): whistle (G) at a standing tree and it leans on it until it
//         goes over, falling away from you. Hodag-heart pie: it leans twice as hard and takes the big trees too.
// Events: browse, lean, creak, startle, stampede, trample (damage), fall, down, helped, eat, befriended, push, reply.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { clamp, damp, wrapAngle } from './real';
import { HelperCryptid, type Job, type Love } from './helper';
import { registerPreload } from '../preload';
import { loadReal } from './real';

export type HugagState = 'browse' | 'lean' | 'stampede' | 'fall' | 'down' | 'rise' | 'eat' | 'idle' | 'follow' | 'home' | 'push' | 'wary';

export const HUGAG_SOUND: Record<string, string | undefined> = {
  browse: undefined, lean: 'tree_creak', creak: 'tree_creak', startle: 'moose_grunt', stampede: 'moose_call', trample: 'log_thud', fall: 'tree_fall_small',
  down: 'moose_grunt', helped: 'moose_grunt', eat: 'eat_chew', befriended: 'moose_call', push: 'tree_creak', reply: undefined, jobdone: undefined, jobfail: undefined,
};

const WALK_CLIP = 2.0, TROT_CLIP = 4.4, RUN_CLIP = 7.5;
const STIFF = ['fl2L', 'fl3L', 'fl2R', 'fl3R', 'hl2L', 'hl3L', 'hl2R', 'hl3R'];
const _a = new THREE.Vector3();

registerPreload('cryptid:hugag', () => loadReal('hugag').catch((e) => { console.warn('[cryptids] hugag', e); }));

export class Hugag extends HelperCryptid {
  readonly id = 'hugag';
  readonly name = 'Hugag';
  readonly favoriteFood = 'wild_onion';
  readonly rules = [
    'A hugag has no joints in its legs. It cannot lie down, so it sleeps standing, leaning its whole weight on a tree.',
    'Startle it and it stampedes in a dead straight line. It cannot turn: step aside.',
    'Fell the tree it is leaning on and it goes over and cannot get up. Help it up and it remembers you.',
    'Its upper lip is so long it cannot graze. It browses twigs and loves wild onions.',
    'A tame one leans on any tree you point at (whistle, G) until it goes over, falling away from you.',
    'Its hide is all folds and wrinkles. Bark rubs into them from all the leaning.',
  ] as const;
  readonly sounds = HUGAG_SOUND;
  readonly skills = ['tree'] as const;
  readonly replies = { tree: 'The hugag plods over to the tree and leans on it. Hard.', come: 'It comes plodding, stiff-legged.', stay: 'It goes back to its cedars.' };
  readonly loves: Record<string, Love> = {
    meal_hodag_pie: { trust: 1, boost: true, line: 'It ate the whole pie off the plate with that lip. It looks... stronger.' },
  };
  declare state: HugagState;
  /** the tree it leans on (sleeping or pushing) */
  private tree = { x: 0, z: 0, r: 0.3, ok: false };
  private leanK = 0;
  private creakT = 0;
  private dir = new THREE.Vector3();
  private stampedeT = 0;
  private helped = false;

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('hugag', o);
    this.state = 'browse';
    this.tiltLen = 2.0; this.tiltWid = 0.6;
    this.turnK = 1.1;
    this.shineK = 0.7;
    // E does double duty: help it up while it is down, follow / stay once tame
    const tame = { ...this.interact };
    Object.assign(this.interact, {
      label: () => (this.state === 'down' ? 'Help the hugag up' : tame.label()),
      use: () => (this.state === 'down' ? this.helpUp() : tame.use()),
      enabled: () => this.state === 'down' || tame.enabled(),
    });
  }
  protected shineColor() { return 0xd8ffb0; }
  protected canEat() { return this.state !== 'stampede' && this.state !== 'fall' && this.state !== 'down'; }
  protected eatClip() { return 'browse'; }
  protected canDo(_k: string, _at: THREE.Vector3, o: { r?: number }) { return (o.r ?? 0.3) < (this.boosted ? 0.85 : 0.5); }
  protected onJob(j: Job) { this.go('push'); j.step = 0; this.leanK = 0; this.tree.ok = false; }

  private helpUp() {
    if (this.state !== 'down') return;
    this.go('rise'); this.anim('rise', { once: true, fade: 0.3 });
    this.emit('helped');
    if (!this.helped) { this.helped = true; if (this.gainTrust(0.5)) this.emit('befriended'); }
  }

  /** a tree near a point: the nearest trunk, or none */
  private trunkNear(ctx: CreatureCtx, x: number, z: number, r: number) {
    const ts = ctx.trunks?.(x, z, r) ?? [];
    let best: { x: number; z: number; r: number } | null = null, bd = 1e9;
    for (const t of ts) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  /** is the tree still standing? (asked about once a second: the trunk query allocates) */
  private standT = 0; private stood = true;
  private standing(ctx: CreatureCtx) {
    if (this.t - this.standT > 1) { this.standT = this.t; this.stood = !!this.trunkNear(ctx, this.tree.x, this.tree.z, 0.6); }
    return this.stood;
  }

  // ------------------------------------------------------------------------------------------------ wild
  protected wild(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    const night = !this.isDay(ctx);
    // a sudden noise near it: a run, an axe, a shot
    const startled = this.dist < 13 && (P.noise > 0.75 || (this.pSpeed > 4 && this.dist < 9));
    switch (this.state) {
      case 'wary': case 'idle': case 'follow': case 'home': this.go('browse'); break;
      case 'browse': {
        this.roll = damp(this.roll, 0, 2, dt);
        if (startled) { this.startle(ctx); break; }
        if (night || (this.t % 400) > 330) {
          // bedtime: find a tree to lean on
          const t = this.trunkNear(ctx, this.pos.x, this.pos.z, 14);
          if (t && t.r > 0.15) { this.tree = { x: t.x, z: t.z, r: t.r, ok: true }; this.stood = true; this.standT = this.t; this.go('lean'); break; }
        }
        if (this.st > 14 || this.to(this.target) < 1.2) {
          const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 18;
          this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r); this.st = 0;
        }
        const munch = (this.t % 18) < 10;
        this.want = munch ? 0 : 1.6; this.arrive = 1.2;
        if (munch) this.anim('browse', { fade: 0.6 }); else this.gait('idle');
        break;
      }
      case 'lean': {
        // walk up beside the trunk, then lean the whole flank on it and sleep standing
        const side = this.sideOf(this.tree);
        this.target.set(side.x, 0, side.z); this.arrive = 0.5;
        const d = this.to(this.target);
        this.want = d > 0.6 ? 1.4 : 0;
        if (d > 0.6) { this.gait('idle'); this.leanK = damp(this.leanK, 0, 3, dt); }
        else {
          // its right flank against the trunk
          this.face = Math.atan2(this.tree.x - this.pos.x, this.tree.z - this.pos.z) - Math.PI / 2;
          this.leanK = damp(this.leanK, 1, 0.8, dt);
          this.anim('idle', { fade: 0.8, speed: 0.3 });
          if ((this.creakT -= dt) <= 0) { this.creakT = 6 + Math.random() * 6; this.emit('creak'); }
        }
        this.roll = -0.2 * this.leanK;
        if (this.tree.ok && this.dist < 60 && !this.standing(ctx)) { this.tree.ok = false; this.go('fall'); this.emit('fall'); this.anim('fall', { once: true, fade: 0.2 }); break; }
        if (startled) { this.startle(ctx); break; }
        if (!night && (this.t % 400) < 330 && this.st > 30) { this.roll = 0; this.go('browse'); }
        break;
      }
      case 'stampede': {
        // dead straight, no turning, anything in front gets trampled
        this.face = null;
        this.target.copy(this.pos).addScaledVector(this.dir, 20); this.want = 7; this.arrive = 0;
        this.turnK = 0.15;
        this.gait('idle');
        const px = P.pos.x - this.pos.x, pz = P.pos.z - this.pos.z, along = px * this.dir.x + pz * this.dir.z, sideD = Math.abs(px * this.dir.z - pz * this.dir.x);
        if (along > 0 && along < 2.4 && sideD < 1.1) {
          this.emit('trample', { damage: 0.35, impulse: this.dir.clone().multiplyScalar(8).add(_a.set(0, 3, 0)) });
          this.stampedeT = 0; this.go('browse'); this.turnK = 1.1; break;
        }
        if ((this.stampedeT -= dt) <= 0) { this.go('browse'); this.turnK = 1.1; this.target.copy(this.home); }
        break;
      }
      case 'fall':
        this.want = 0; this.roll = damp(this.roll, 0, 2, dt);
        if (this.clipDone || this.st > 2.5) { this.go('down'); this.anim('down', { fade: 0.3 }); this.emit('down'); }
        break;
      case 'down':
        // legs in the air, can't get up
        this.want = 0; this.anim('down', { fade: 0.3 });
        if (this.st > 240) this.helpUpSelf();
        break;
      case 'rise':
        this.want = 0;
        if (this.clipDone || this.st > 3.5) this.go('browse');
        break;
      default: this.go('browse');
    }
  }
  private helpUpSelf() { this.go('rise'); this.anim('rise', { once: true, fade: 0.3 }); }
  private startle(ctx: CreatureCtx) {
    // away from the player, in whatever line it is facing closest to that
    this.dir.set(this.pos.x - ctx.player.pos.x, 0, this.pos.z - ctx.player.pos.z).normalize();
    // it cannot turn quickly: half its own heading, half away
    _a.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.dir.add(_a).normalize();
    this.heading = Math.atan2(this.dir.x, this.dir.z);
    this.stampedeT = 3.5; this.go('stampede'); this.emit('startle'); this.emit('stampede');
    this.roll = 0;
  }
  /** a standing spot by a trunk: on the side away from where the push goes (dir), or the near side */
  private sideOf(t: { x: number; z: number; r: number }, dir?: THREE.Vector3) {
    const dx = dir ? -dir.x : this.pos.x - t.x, dz = dir ? -dir.z : this.pos.z - t.z, l = Math.hypot(dx, dz) || 1;
    const off = t.r + 0.75;
    return { x: t.x + (dx / l) * off, z: t.z + (dz / l) * off };
  }

  // ------------------------------------------------------------------------------------------------ work
  protected work(ctx: CreatureCtx, dt: number, j: Job) {
    if (j.step === 0) {
      const t = this.trunkNear(ctx, j.at.x, j.at.z, 2.5);
      if (!t) { this.done(false); return; }
      this.tree = { x: t.x, z: t.z, r: t.r, ok: true };
      this.stood = true; this.standT = this.t;
      j.step = 1;
    }
    const side = this.sideOf(this.tree, j.dir);
    switch (j.step) {
      case 1: {
        // to the far side of the push (the player's side)
        this.target.set(side.x, 0, side.z); this.arrive = 0.45;
        const d = this.to(this.target);
        this.want = d > 10 ? 3.5 : 1.4;
        this.gait('idle');
        if (d < 0.6) { j.step = 2; j.t = 0; this.leanK = 0; this.emit('lean'); }
        break;
      }
      case 2: {
        // chest to the trunk, push: the tree creaks and sways, then goes
        this.want = 0;
        this.face = Math.atan2(this.tree.x - this.pos.x, this.tree.z - this.pos.z);
        this.leanK = damp(this.leanK, 1, 1.2, dt);
        this.pitch = 0.14 * this.leanK;
        this.anim('walk', { fade: 0.4, speed: 0.35 });
        if ((this.creakT -= dt) <= 0) { this.creakT = 1.3; this.emit('creak'); }
        const need = this.boosted ? 3 : 6;
        if (j.t > need) {
          this.emit('push', { fell: { x: this.tree.x, z: this.tree.z, dx: j.dir.x, dz: j.dir.z }, big: this.boosted });
          j.step = 3; j.t = 0;
        }
        if (j.t > 1.5 && !this.standing(ctx)) { j.step = 3; j.t = 0; }
        break;
      }
      default:
        this.pitch = damp(this.pitch, 0, 3, dt); this.leanK = damp(this.leanK, 0, 3, dt);
        this.want = 0; this.anim('look', { fade: 0.4 });
        if (j.t > 2.5) { this.pitch = 0; this.done(true); }
    }
  }

  protected gait(idle: string) {
    const sp = this.speed;
    if (sp > 5) { this.anim('run', { fade: 0.25 }); this.rate(clamp(sp / RUN_CLIP, 0.6, 1.5)); }
    else if (sp > 2.4) { this.anim('trot', { fade: 0.3 }); this.rate(clamp(sp / TROT_CLIP, 0.6, 1.5)); }
    else if (sp > 0.12) { this.anim('walk', { fade: 0.35 }); this.rate(clamp(sp / WALK_CLIP, 0.5, 1.5)); }
    else this.anim(idle, { fade: 0.5 });
  }
  protected walkSpeed() { return 1.6; }
  protected runSpeed() { return 4.5; }
  protected followDist() { return 6; }

  protected pose(ctx: CreatureCtx) {
    // no knees: the lower legs stay as stiff as posts, whatever the clip does (it rocks along on them)
    if (this.state !== 'fall' && this.state !== 'down' && this.state !== 'rise') {
      for (const n of STIFF) { const b = this.bones[n]; if (b) b.quaternion.slerp(this.rest(n), 0.85); }
    }
    if (this.state === 'browse' || this.state === 'idle' || this.state === 'follow') if (this.dist < 12) this.turnBone('head', ctx.player.pos, 0.35, 0.7, 0.3);
    void wrapAngle;
  }
  private restQ = new Map<string, THREE.Quaternion>();
  private rest(n: string): THREE.Quaternion {
    let q = this.restQ.get(n);
    if (!q) { q = new THREE.Quaternion(); this.restQ.set(n, q); }
    return q;
  }
  protected onAttach() {
    // the rest pose of the stiff bones (the glb's bind pose)
    for (const n of STIFF) { const b = this.bones[n]; if (b) this.restQ.set(n, b.quaternion.clone()); }
  }
}
