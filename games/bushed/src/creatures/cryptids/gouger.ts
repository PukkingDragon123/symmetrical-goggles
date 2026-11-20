// SIDEHILL GOUGER (Cox 1910; Tryon 1939: the "sidehill dodger"). A real doe with goat's horns whose right legs are
// shorter than its left, so it can only stand on a hillside, uphill on its right, and only walk round its hill one way
// (clockwise from above). It grazes its track round a steep knoll by the lake.
//   - stand on its track ahead of it and it snorts, then charges along the hillside to butt you;
//   - step up or down off its track and it cannot turn to follow: it stamps, and has to go all the way round;
//   - lure it off the slope (it follows chanterelles) and on flat ground it topples over and cannot get up;
//   - tip it back up (E) and, grateful, it gouges fatwood out of the old pine roots for you (twice a day at most);
//   - two chanterelles from the hand and it stops butting you.
// Events: circle, snort, charge, butt (damage), stuck, topple, bleat, righted, reward (give), eat, befriended, sleep.
import * as THREE from 'three';
import type { CreatureCtx } from '../types';
import { RealCryptid, clamp, damp, wrapAngle } from './real';
import { isNight } from './base';

export type GougerState = 'circle' | 'graze' | 'snort' | 'charge' | 'stuck' | 'lured' | 'fall' | 'toppled' | 'getup' | 'return' | 'eat' | 'liedown' | 'sleep';

export const GOUGER_SOUND: Record<string, string | undefined> = {
  snort: 'deer_snort', charge: 'deer_stomp', butt: 'log_thud', stuck: 'deer_stomp', topple: 'log_thud', bleat: 'moose_grunt',
  righted: 'grunt_effort', reward: 'foliage_rustle', eat: 'eat_crunch', befriended: 'deer_snort', circle: undefined, sleep: undefined,
};

/** its legs: how much shorter the right ones are (m, from the Blender build) and the spread of its feet */
const SHORT = 0.26, FEET = 0.23;
/** radius (m) of its track round the knoll, walking and charging speeds (m/s) and their clips' natural speeds */
const R = 10, WALK = 0.95, RUN = 5.2, WALK_CLIP = 1.15, TROT_CLIP = 2.4, RUN_CLIP = 5.5;

export class SidehillGouger extends RealCryptid {
  readonly id = 'gouger';
  readonly name = 'Sidehill Gouger';
  readonly favoriteFood = 'chanterelle';
  readonly rules = [
    'Its right legs are shorter than its left. It can only stand on a hillside with the uphill on its right, so it only ever walks round its hill one way.',
    'Stand on its path ahead of it and it snorts, then charges along the hillside to butt you. Step up or down off its path: it cannot turn to follow.',
    'Lure it onto flat ground (it follows chanterelles) and it falls over and cannot get up again.',
    'Tip a fallen gouger back onto its feet and it gouges fatwood out of the old pine roots for you.',
    'Feed it chanterelles twice from your hand and it stops butting you.',
    'At night it lies down on its hillside and sleeps.',
  ] as const;
  readonly sounds = GOUGER_SOUND;
  declare state: GougerState;
  /** the knoll it walks round (its home is the knoll's top) */
  readonly knoll = new THREE.Vector3();
  /** the player can tip it up (critters.ts registers this as an interactable on its object) */
  readonly interact = {
    label: () => (this.state === 'toppled' ? 'Tip the gouger back up' : ''),
    use: () => this.tipUp(),
    enabled: () => this.state === 'toppled',
  };
  private phi = 0;
  private calm = 0;
  private rewards: number[] = [];
  private bleatT = 3;
  private seen = false;
  private lean = 0;
  private kick = 0;
  private holdT = 0;
  private readonly side = new THREE.Vector3();

  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super('gouger', o);
    this.knoll.copy(this.home);
    this.state = 'circle';
    this.tiltLen = 1.4; this.tiltWid = 0;
    this.turnK = 3;
    // start on the track
    this.phi = (o.heading ?? 0) % (Math.PI * 2);
    this.trackPoint(this.phi, this.pos);
    this.heading = this.trackHeading(this.phi);
  }

  /** a point on its track at angle phi (round the knoll) */
  private trackPoint(phi: number, out: THREE.Vector3) { return out.set(this.knoll.x + Math.sin(phi) * R, out.y, this.knoll.z + Math.cos(phi) * R); }
  /** it walks with phi decreasing: the knoll on its right */
  private trackHeading(phi: number) { return Math.atan2(-Math.cos(phi), Math.sin(phi)); }
  private phiOf(p: THREE.Vector3) { return Math.atan2(p.x - this.knoll.x, p.z - this.knoll.z); }
  /** how far (m) a point is off its track (+ outside, - inside) */
  private offTrack(p: THREE.Vector3) { return Math.hypot(p.x - this.knoll.x, p.z - this.knoll.z) - R; }
  /** the ground's rise from its left feet to its right feet (m) where it stands now */
  private sideRise(ctx: CreatureCtx) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading), W = FEET / 2;
    return ctx.heightAt(this.pos.x - c * W, this.pos.z + s * W) - ctx.heightAt(this.pos.x + c * W, this.pos.z - s * W);
  }

  /** the ground's steepness where it stands (rise over run) */
  private slope(ctx: CreatureCtx) {
    const x = this.pos.x, z = this.pos.z;
    return Math.hypot(ctx.heightAt(x + 0.6, z) - ctx.heightAt(x - 0.6, z), ctx.heightAt(x, z + 0.6) - ctx.heightAt(x, z - 0.6)) / 1.2;
  }

  /** E on a fallen gouger */
  tipUp(): boolean {
    if (this.state !== 'toppled') return false;
    this.go('getup'); this.anim('getup', { once: true, fade: 0.25 });
    this.emit('righted');
    // the reward: fatwood gouged out of the old pine roots, at most twice a day
    const now = this.t;
    this.rewards = this.rewards.filter((x) => now - x < 600);
    if (this.rewards.length < 2) {
      this.rewards.push(now);
      const at = this.pos.clone().add(new THREE.Vector3(Math.sin(this.heading) * 1.2, 0.3, Math.cos(this.heading) * 1.2));
      setTimeout(() => this.emit('reward', { give: { item: 'firestarter', n: 2, at } }), 1800);
    }
    if (this.gainTrust(0.34)) this.emit('befriended');
    return true;
  }

  offer(item: string): boolean {
    if (item !== this.favoriteFood || this.dist > 3.2 || this.state === 'sleep' || this.state === 'fall' || this.state === 'getup') return false;
    this.emit('eat');
    if (this.gainTrust(0.5)) this.emit('befriended');
    this.calm = Math.max(this.calm, 240);
    if (this.state !== 'toppled') { this.go('eat'); this.anim('eat', { fade: 0.3 }); }
    return true;
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    this.calm = Math.max(0, this.calm - dt);
    const friend = this.trust >= 1;
    const night = isNight(ctx.hour);
    const pOff = this.offTrack(P.pos);
    // how far ahead of it (m along the track) the player stands, when they are on it
    let ahead = (wrapAngle(this.phi - this.phiOf(P.pos)) + Math.PI * 2) % (Math.PI * 2) * R;
    if (Math.abs(pOff) > 2.6) ahead = Infinity;
    if (!this.seen && this.dist < 30 && this.viewAngle(ctx) < 0.4 && (this.state === 'circle' || this.state === 'graze')) { this.seen = true; this.emit('circle'); }
    const lured = P.held === this.favoriteFood && this.dist < 13 && !night;
    // the lean it needs to stand here: its short right legs against the ground's rise to its right
    const need = Math.atan2(SHORT - this.sideRise(ctx), FEET);
    switch (this.state) {
      case 'circle': case 'graze': {
        // let a butt play out
        if (this.holdT > 0) { this.holdT -= dt; this.want = 0; break; }
        if (night) { this.go('liedown'); this.anim('liedown', { once: true }); this.want = 0; this.emit('sleep'); break; }
        if (lured) { this.go('lured'); break; }
        if (!friend && this.calm <= 0 && ahead < 15 && this.dist < 15) { this.go('snort'); this.anim('stamp', { once: true, fade: 0.2 }); this.want = 0; this.emit('snort'); break; }
        if (this.state === 'graze') {
          this.want = 0; this.anim('eat');
          if (this.st > 7) this.go('circle');
        } else {
          this.walkTrack(WALK, 2.2);
          if (this.st > 14 + (this.phi * 3 % 6)) this.go('graze');
        }
        break;
      }
      case 'snort':
        this.want = 0;
        if (this.st > 1.1) { this.go('charge'); this.emit('charge'); }
        break;
      case 'charge': {
        this.walkTrack(RUN, 1.0);
        if (Math.abs(pOff) > 2.8 || ahead > 30) { this.go('stuck'); this.anim('stamp', { once: true, fade: 0.2, restart: true }); this.want = 0; this.emit('stuck'); break; }
        if (this.dist < 1.7) {
          const f = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
          this.emit('butt', { damage: 0.28, impulse: f.multiplyScalar(6.5).add(new THREE.Vector3(0, 3, 0)) });
          this.anim('butt', { once: true, fade: 0.1 }); this.holdT = 1.3;
          this.calm = 25; this.go('circle');
        }
        if (this.st > 9) { this.calm = 10; this.go('circle'); }
        break;
      }
      case 'stuck':
        this.want = 0;
        if (this.st > 2.6) { this.calm = 14; this.go('circle'); }
        break;
      case 'lured': {
        // it follows the mushroom off its track, slowly; the flat ground does the rest
        this.target.copy(P.pos); this.want = this.dist > 2 ? 1.0 : 0; this.arrive = 1.8;
        this.anim(this.speed > 0.15 ? 'walk' : 'idle', { fade: 0.3 }); this.rate(Math.max(0.5, this.speed / WALK_CLIP));
        // off its hill (flat ground, or well off its track) the short legs give way
        // it limps and staggers for a couple of seconds before it goes over
        if (need > 0.68 && (this.slope(ctx) < 0.16 || Math.abs(this.offTrack(this.pos)) > 4)) { this.lean += dt; if (this.lean > 2.2) this.topple(); } else this.lean = Math.max(0, this.lean - dt);
        if (!lured && this.st > 2) this.go('return');
        break;
      }
      case 'fall':
        this.want = 0;
        if (this.clipDone) { this.go('toppled'); this.anim('lie_side', { fade: 0.35 }); }
        break;
      case 'toppled':
        this.want = 0;
        this.bleatT -= dt;
        if (this.bleatT < 0) { this.bleatT = 4 + Math.random() * 4; this.emit('bleat'); }
        // nobody came: after a long while it rocks itself back over
        if (this.st > 75) { this.go('getup'); this.anim('getup', { once: true, fade: 0.3 }); }
        break;
      case 'getup':
        this.want = 0;
        if (this.clipDone || this.st > 4) this.go('return');
        break;
      case 'return': {
        // back to the nearest point of its track (it hobbles: flat ground does not tip it now)
        const phi = this.phiOf(this.pos);
        this.trackPoint(phi, this.target); this.want = 0.8; this.arrive = 0.6;
        this.anim('walk', { fade: 0.3 }); this.rate(Math.max(0.5, this.speed / WALK_CLIP));
        if (Math.abs(this.offTrack(this.pos)) < 0.8) { this.phi = phi; this.go('circle'); }
        break;
      }
      case 'eat':
        this.want = 0;
        if (this.st > 4) this.go('circle');
        break;
      case 'liedown':
        this.want = 0;
        if (this.clipDone) { this.go('sleep'); this.anim('sleep', { fade: 0.5 }); }
        break;
      case 'sleep':
        this.want = 0;
        if (!night) { this.go('getup'); this.anim('getup', { once: true, fade: 0.4 }); }
        break;
    }
    // the lean: on its track it leans into the hill; flat ground or the wrong way round and it is over
    const lying = this.state === 'fall' || this.state === 'toppled' || this.state === 'getup' || this.state === 'sleep' || this.state === 'liedown';
    // it leans hard into its hill (the short legs uphill), hitches at every step on the short side, and off its
    // hill the hitch grows into a stagger before it falls over
    const stagger = clamp(this.lean / 2.2, 0, 1), stepping = this.speed > 0.15 ? 1 : 0;
    const hitch = Math.sin(this.t * (this.speed > 2 ? 11 : 6.5));
    this.roll = damp(this.roll, lying ? 0 : clamp(need * 0.9, -0.2, 0.75) + hitch * (0.05 * stepping + 0.2 * stagger), 7, dt);
    this.holder.position.y = lying ? 0 : -Math.max(0, hitch) * (0.025 * stepping + 0.07 * stagger);
    if (!lying && this.state !== 'lured' && this.state !== 'return' && this.state !== 'eat' && need > 0.8) { this.lean += dt; if (this.lean > 2.2) this.topple(); }
    else if (this.state !== 'lured') this.lean = Math.max(0, this.lean - dt);
    this.kick = this.state === 'toppled' ? 1 : damp(this.kick, 0, 3, dt);
  }

  private topple() {
    this.lean = 0; this.want = 0;
    this.go('fall'); this.anim('fall', { once: true, fade: 0.15 });
    this.emit('topple');
  }

  /** walk (or run) along its track, the knoll on its right; phi follows where it actually is */
  private walkTrack(v: number, lookAhead: number) {
    this.phi = this.phiOf(this.pos);
    this.trackPoint(this.phi - lookAhead / R, this.target);
    this.want = v; this.arrive = 0.2;
    const sp = this.speed;
    if (sp > 3.2) { this.anim('run', { fade: 0.25 }); this.rate(clamp(sp / RUN_CLIP, 0.6, 1.4)); }
    else if (sp > 1.6) { this.anim('trot', { fade: 0.25 }); this.rate(clamp(sp / TROT_CLIP, 0.6, 1.4)); }
    else if (sp > 0.12) { this.anim('walk_r', { fade: 0.3 }); this.rate(clamp(sp / WALK_CLIP, 0.5, 1.4)); }
    else this.anim('idle', { fade: 0.4 });
  }

  protected pose(ctx: CreatureCtx) {
    // helpless on its side: all four legs paddle at the air
    if (this.kick > 0.02) {
      const ax = this.side.set(-Math.cos(this.heading), 0, Math.sin(this.heading));
      const k = this.kick * 0.5, w = this.t * 7;
      this.swingBone('LFLeg1', ax, Math.sin(w) * k); this.swingBone('RFLeg1', ax, Math.sin(w + 2) * k);
      this.swingBone('LBLeg1', ax, Math.sin(w + 1) * k); this.swingBone('RBLeg1', ax, Math.sin(w + 3) * k);
    }
    const calmish = this.state === 'circle' || this.state === 'graze' || this.state === 'lured' || this.state === 'snort' || this.state === 'stuck';
    if (calmish && this.dist < 14) this.turnBone('Head', ctx.player.pos, 0.6, 0.9, 0.35);
  }
}
