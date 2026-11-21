// ROPERITE (Cox 1910, "Fearsome Creatures of the Lumberwoods"): pony-sized and quick, with a rope for a snout. Bands
// of them roped rabbits, and the odd careless lumberjack, on the logging roads. Ours keeps the open beaver meadow
// north-west of the lake. A real donkey (tools/blender/lowpoly/roperite.py) wearing a live rope (rope.ts) that
// hangs from its muzzle in a lasso loop, flies, and pulls taut.
//   wild: it grazes; walk into its meadow and it gallops rings round you, then throws, and drags you a few steps and
//         laughs. Crouch and stand still and it gets bored. Hold carrots and it walks right up.
//   tame (carrots twice): whistle (G) at a log and it ropes it and drags it, walking backwards, to your truck (or to
//         wherever you are when there is no truck about). Smoked-bark brittle: it hauls every log lying near the
//         first, one after another.
// Events: notice, circle, throw, rope (you), laugh, bored, eat, befriended, haul, delivered, sleep, reply.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { clamp, damp } from './real';
import { HelperCryptid, type Job, type Love } from './helper';
import { LiveRope } from './rope';
import { registerPreload } from '../preload';
import { loadReal } from './real';

export type RoperiteState = 'graze' | 'sleep' | 'notice' | 'circle' | 'throw' | 'laugh' | 'approach' | 'eat' | 'idle' | 'follow' | 'home' | 'haul' | 'wary';

export const ROPERITE_SOUND: Record<string, string | undefined> = {
  notice: 'deer_snort', circle: 'deer_stomp', throw: 'branch_swish', rope: 'log_drag', laugh: 'deer_snort', bored: 'deer_snort',
  eat: 'eat_crunch', befriended: 'deer_snort', haul: 'branch_swish', delivered: 'log_thud', sleep: undefined, reply: undefined,
};

const WALK_CLIP = 1.4, TROT_CLIP = 3.4, GALLOP_CLIP = 7.5, BACK_CLIP = 0.9;
const SEGS = 26;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

registerPreload('cryptid:roperite', () => loadReal('roperite').catch((e) => { console.warn('[cryptids] roperite', e); }));

/** a log being hauled: companions.ts keeps pos (the log) and to (the truck's tailgate) up to date */
export interface HaulRef { pos: THREE.Vector3; to: THREE.Vector3; mass: number; piece: unknown }

export class Roperite extends HelperCryptid {
  readonly id = 'roperite';
  readonly name = 'Roperite';
  readonly favoriteFood = 'carrots';
  readonly rules = [
    'A roperite has a rope for a snout. It lassoes whatever runs through its meadow: rabbits, deer, lumberjacks.',
    'Walk into its meadow and it gallops rings round you, then throws. Crouch and stand dead still and it gets bored.',
    'Roped, you get dragged a few steps and laughed at. It does not hurt. Much.',
    'Hold out carrots and it walks right up for them. Twice, and it is yours.',
    'A tame one ropes logs for you: whistle (G) and point at a log, and it drags it backwards to your truck.',
    'At night it sleeps lying down in the long grass of its meadow.',
  ] as const;
  readonly sounds = ROPERITE_SOUND;
  readonly skills = ['log'] as const;
  readonly replies = { log: 'The roperite snorts and trots off for the log.', come: 'It comes trotting, the rope swinging.', stay: 'It goes back to its meadow.' };
  readonly loves: Record<string, Love> = {
    meal_bark_brittle: { trust: 1, boost: true, line: 'It crunched the brittle and stamped. It wants ALL the logs now.' },
  };
  declare state: RoperiteState;
  /** the rope: its loop's world shape is written every frame */
  readonly rope = new LiveRope(SEGS, 0.024);
  /** the lasso is out on something (a log, the player) */
  towing = false;
  /** 0 coiled .. 1 out at the target */
  private throwK = 0;
  private ropeAt = new THREE.Vector3();
  private ropeOn: 'none' | 'player' | 'log' = 'none';
  private tipLocal = new THREE.Vector3(0, 0.05, 0.3);
  private headBone: THREE.Bone | null = null;
  private ang = 0; private lap = 0;
  private still = 0;
  private cool = 0;
  private dragT = 0;

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('roperite', o);
    this.state = 'graze';
    this.tiltLen = 1.2; this.tiltWid = 0.4;
    this.turnK = 2.6;
    this.shineK = 0.6;
    this.object.add(this.rope.mesh);
  }
  protected shineColor() { return 0xe8f0c0; }

  protected onAttach() {
    this.headBone = this.bones.Head ?? null;
    // the muzzle tip: the most forward vertex of the rest mesh (in model space: through the bind matrix, as
    // glbmodel.ts does), carried in the head bone's frame
    const sm = this.mesh!, p = sm.geometry.attributes.position as THREE.BufferAttribute;
    let best = -1, bz = -1e9;
    for (let i = 0; i < p.count; i++) {
      _a.fromBufferAttribute(p, i).applyMatrix4(sm.bindMatrix);
      if (_a.z > bz && _a.y > 0.6) { bz = _a.z; best = i; }
    }
    if (best >= 0 && this.headBone) {
      // (the whole chain: worldToLocal updates the parents too, so a stale object matrix would skew it)
      this.object.updateWorldMatrix(true, true);
      _a.fromBufferAttribute(p, best).applyMatrix4(sm.bindMatrix).add(_b.set(0, -0.05, -0.04)).applyMatrix4(this.body!.matrixWorld);
      this.tipLocal.copy(this.headBone.worldToLocal(_a));
    }
  }

  protected canEat() { return this.state !== 'throw' && this.state !== 'sleep'; }
  protected canDo(_k: string, _at: THREE.Vector3, o: { ref?: unknown }) {
    const r = o.ref as HaulRef | undefined;
    return !!r && r.mass < (this.boosted ? 4000 : 1400);
  }
  protected onJob(j: Job) { this.towing = false; this.ropeOn = 'none'; this.go('haul'); j.step = 0; }

  /** the rope's hitch: the muzzle tip, world space (companions.ts pulls the log toward it) */
  hitch(out: THREE.Vector3): THREE.Vector3 {
    if (this.headBone) return this.headBone.localToWorld(out.copy(this.tipLocal));
    return out.copy(this.pos).add(_c.set(Math.sin(this.heading) * 1.2, 1.3, Math.cos(this.heading) * 1.2));
  }

  // ------------------------------------------------------------------------------------------------ wild
  protected wild(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    const night = !this.isDay(ctx);
    this.cool -= dt;
    // standing still, crouched: it gets bored of you
    this.still = P.crouch && this.pSpeed < 0.4 ? this.still + dt : 0;
    const carrots = P.held === 'carrots' && this.dist < 22;
    switch (this.state) {
      case 'wary': case 'idle': case 'follow': case 'home': this.go('graze'); break;
      case 'graze': {
        if (night && this.dist > 15) { this.go('sleep'); break; }
        if (carrots) { this.go('approach'); break; }
        if (this.dist < 24 && this.cool <= 0 && this.still < 1) { this.go('notice'); this.emit('notice'); break; }
        if (this.st > 10 || this.to(this.target) < 1) {
          const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 14;
          this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r); this.st = 0;
        }
        const grazing = (this.t % 14) < 8;
        this.want = grazing ? 0 : 1.2; this.arrive = 1;
        if (grazing) this.anim('eat', { fade: 0.5 }); else this.gait('idle');
        break;
      }
      case 'sleep':
        this.want = 0; this.anim('sleep', { fade: 1 });
        if (!night || this.dist < 6) { this.go('graze'); if (this.dist < 6) this.emit('notice'); }
        break;
      case 'notice':
        this.want = 0; this.faceToward(P.pos); this.anim('look', { fade: 0.3 });
        if (carrots) { this.go('approach'); break; }
        if (this.still > 1.5) { this.bored(); break; }
        if (this.st > 1.6) { this.go('circle'); this.ang = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z); this.lap = 0; this.emit('circle'); }
        break;
      case 'circle': {
        // gallop a ring round the player, then throw
        const R = 9;
        this.ang += dt * 0.62; this.lap += dt * 0.62;
        this.target.set(P.pos.x + Math.sin(this.ang + 0.5) * R, 0, P.pos.z + Math.cos(this.ang + 0.5) * R);
        this.want = 6.5; this.arrive = 0.5;
        this.gait('idle');
        if (carrots) { this.go('approach'); break; }
        if (this.still > 2.5) { this.bored(); break; }
        if (this.dist > 40) { this.go('graze'); this.cool = 20; break; }
        if (this.lap > Math.PI * 1.6 && this.dist < 13) { this.go('throw'); this.throwK = 0; this.ropeOn = 'player'; this.emit('throw'); }
        break;
      }
      case 'throw':
        this.want = 0; this.faceToward(P.pos); this.anim('idle', { fade: 0.2 });
        this.ropeAt.copy(P.pos).y -= 0.6;
        this.throwK = Math.min(1, this.throwK + dt * 1.8);
        if (this.throwK >= 1 && this.dragT === 0) {
          // got you: a tug toward it (a token knock, so the game applies the pull) and it laughs
          _a.set(this.pos.x - P.pos.x, 0, this.pos.z - P.pos.z).normalize().multiplyScalar(5.5).add(_b.set(0, 1.2, 0));
          this.emit('rope', { damage: 0.02, impulse: _a.clone() });
          this.dragT = 0.01;
        }
        if (this.dragT > 0) { this.dragT += dt; if (this.dragT > 1.2) { this.dragT = 0; this.go('laugh'); this.emit('laugh'); } }
        break;
      case 'laugh':
        this.want = 0; this.anim('neigh', { once: true, fade: 0.2 });
        this.throwK = damp(this.throwK, 0, 3, dt);
        if (this.st > 2.2) { this.ropeOn = 'none'; this.cool = 45; this.go('graze'); this.target.copy(this.home); }
        break;
      case 'approach':
        // carrots: it walks right up, nose out
        if (!carrots && this.st > 2) { this.go('graze'); break; }
        this.target.copy(P.pos); this.arrive = 2.2; this.want = this.dist > 8 ? 3.2 : 1.1;
        if (this.dist < 2.6) { this.want = 0; this.faceToward(P.pos); this.anim('idle', { fade: 0.3 }); } else this.gait('idle');
        break;
      default: this.go('graze');
    }
  }
  private bored() { this.go('graze'); this.cool = 30; this.ropeOn = 'none'; this.throwK = 0; this.emit('bored'); }

  // ------------------------------------------------------------------------------------------------ work
  protected work(_ctx: CreatureCtx, dt: number, j: Job) {
    const r = j.ref as HaulRef;
    if (!r) { this.done(false); return; }
    this.reverse = false;
    switch (j.step) {
      case 0: {
        // trot up to the log, stand off it a rope's length
        const d = this.to(r.pos);
        this.target.copy(r.pos); this.arrive = 3.4; this.want = d > 12 ? 3.4 : 1.4;
        this.gait('idle');
        if (d < 3.8) { j.step = 1; this.throwK = 0; this.ropeOn = 'log'; this.emit('throw'); }
        break;
      }
      case 1:
        this.want = 0; this.faceToward(r.pos); this.anim('idle', { fade: 0.2 });
        this.throwK = Math.min(1, this.throwK + dt * 1.6);
        if (this.throwK >= 1) { j.step = 2; this.towing = true; this.emit('haul'); }
        break;
      case 2: {
        // walk backwards to the tailgate, the log following on the rope
        this.reverse = true;
        this.target.copy(r.to); this.arrive = 1.5;
        const d = this.to(r.to);
        const lag = this.to(r.pos);
        this.want = lag > 6 ? 0.2 : clamp(d * 0.4, 0.4, 1.3);
        this.anim('back', { fade: 0.3 }); this.rate(clamp(this.speed / BACK_CLIP, 0.4, 1.6));
        if (d < 2.2) { j.step = 3; this.towing = false; this.emit('delivered'); }
        break;
      }
      default:
        this.reverse = false;
        this.want = 0; this.throwK = damp(this.throwK, 0, 3, dt); this.anim('shake', { once: true, fade: 0.2 });
        if (this.throwK < 0.05) { this.ropeOn = 'none'; this.done(true); }
    }
    if (this.ropeOn === 'log') this.ropeAt.copy(r.pos);
  }
  protected done(ok = true) { this.reverse = false; this.towing = false; super.done(ok); }

  protected gait(idle: string) {
    const sp = this.speed;
    if (sp > 4.6) { this.anim('gallop', { fade: 0.25 }); this.rate(clamp(sp / GALLOP_CLIP, 0.6, 1.6)); }
    else if (sp > 2.1) { this.anim('trot', { fade: 0.25 }); this.rate(clamp(sp / TROT_CLIP, 0.6, 1.6)); }
    else if (sp > 0.12) { this.anim(this.reverse ? 'back' : 'walk', { fade: 0.3 }); this.rate(clamp(sp / (this.reverse ? BACK_CLIP : WALK_CLIP), 0.5, 1.6)); }
    else this.anim(idle, { fade: 0.4 });
  }
  protected walkSpeed() { return 1.3; }
  protected runSpeed() { return 5.5; }
  protected followDist() { return 5; }

  // ------------------------------------------------------------------------------------------------ the rope
  protected pose(ctx: CreatureCtx) {
    // a look at whoever is near (not while it hauls or sleeps)
    if (this.state !== 'sleep' && !this.towing && this.dist < 14) this.turnBone('Head', ctx.player.pos, 0.4, 0.8, 0.3);
  }
  protected after(_ctx: CreatureCtx, dt: number) {
    if (!this.body) { this.rope.mesh.visible = false; return; }
    this.rope.mesh.visible = true;
    this.object.updateMatrixWorld(true);
    const tip = this.hitch(_a);
    _f.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const P = this.rope.pts, n = SEGS;
    const k = this.ropeOn === 'none' ? 0 : this.throwK;
    if (k <= 0.001) {
      // coiled: a short stem down from the muzzle and a lasso loop hanging under it, swaying with the head
      const sway = Math.sin(this.t * 1.7) * 0.25 + (this.speed > 0.5 ? Math.sin(this.t * 7) * 0.25 : 0);
      const stem = 5, R = 0.24;
      _c.copy(tip).addScaledVector(UP, -0.18 - R).addScaledVector(_f, 0.04);
      for (let i = 0; i <= n; i++) {
        if (i <= stem) { P[i].copy(tip).addScaledVector(UP, -0.18 * i / stem).addScaledVector(_f, 0.02 * i / stem); continue; }
        const u = (i - stem) / (n - stem), a = u * Math.PI * 2;
        // the loop's plane: forward/up, turned a little side to side
        _b.set(Math.cos(this.heading) * Math.sin(sway), 0, -Math.sin(this.heading) * Math.sin(sway)).addScaledVector(_f, Math.cos(sway));
        P[i].copy(_c).addScaledVector(UP, Math.cos(a) * R).addScaledVector(_b, Math.sin(a) * R * 0.85);
      }
    } else {
      // out: an arc from the muzzle toward the target (it flies out with k), a sag once it lands
      _c.copy(this.ropeAt);
      const len = tip.distanceTo(_c);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const reach = Math.min(1, u / Math.max(0.05, k));
        P[i].lerpVectors(tip, _c, u * k).addScaledVector(UP, Math.sin(Math.PI * u) * (k < 1 ? 1.2 * (1 - k) * len * 0.15 : -(this.towing ? 0.08 : 0.25)));
        if (reach >= 1 && k >= 1 && u > 0.86) {
          // the noose round the end of it
          const a = (u - 0.86) / 0.14 * Math.PI * 2;
          P[i].copy(_c).addScaledVector(UP, 0.25 + Math.cos(a) * 0.25).addScaledVector(_f, Math.sin(a) * 0.25);
        }
      }
    }
    // to the object's frame
    _m.copy(this.object.matrixWorld).invert();
    for (const p of P) p.applyMatrix4(_m);
    this.rope.commit();
    void dt;
  }
}
