// THE HIDEBEHIND: the thing in the deep woods that is always behind the tree you are not looking at (model in
// hidebehind/model.ts). It never moves while you can see it: it only moves when it is outside your view or hidden
// behind a trunk (ctx.trunks), so you catch it, if at all, frozen between two trees.
//
//   const h = new Hidebehind({ pos }); scene.add(h.object); h.update(ctx);   // needs ctx.trunks
//
// Rules (learnable, deadly):
//   deep     it only hunts at night in the deep woods (old growth, far from roads and the cabin); by day it is nowhere
//   unseen   it moves only when you are not looking (outside your view cone, or with a trunk between you); look at
//            it and it stops dead
//   back     turn your back and it comes closer, tree by tree (twigs snap, then nothing); let it reach you and it
//            strikes ('attack', damage) and drags itself away. Turning round in time stops it in its tracks
//   fire     a lantern, a torch or a campfire keeps it off: it will not come within ~18 m of firelight, and if you
//            light one near it, it shrieks and is gone ('repelled'). It cannot abide the smell of liquor either
//   jerky    it is never your friend and takes nothing from your hand, but set jerky down and walk away: it steals it
//            ('steal') and leaves you alone for the rest of the night, gnawing somewhere out of sight
// Events: creep (a snapped twig), glimpse (you caught it), hiss, attack { damage, impulse }, repelled, gag, steal,
//         eat, step.
import * as THREE from 'three';
import { Cryptid, CH, clipKit, isNight, daylight, clamp, damp, type Pose, type Clip, type AnimParams } from './base';
import { cryptidLoader } from './kit';
import { hidebehindModelGen, hidebehindBones, HIDEBEHIND_MODEL_VERSION, HB_EYE_AX, HB_FUR_SPEC } from './hidebehind/model';
import { biome, roadInfo, SPOTS } from '../../world/layout';
import type { BoneDef } from '../rig';
import type { CreatureCtx } from '../types';

const HM = cryptidLoader(HIDEBEHIND_MODEL_VERSION, () => hidebehindModelGen(), hidebehindBones);
export const hidebehindModel = () => HM.get();
export const hidebehindModelAsync = (o: { cache?: boolean } = {}) => HM.load(o);

export const HIDEBEHIND_SOUND: Record<string, string | undefined> = {
  creep: 'branch_snap', hiss: 'hound_snarl', attack: 'hound_snarl', repelled: 'creature_distant_scream', gag: 'hound_snarl', steal: 'foliage_rustle', eat: 'hound_chew',
};
export type HidebehindState = 'absent' | 'stalk' | 'frozen' | 'attack' | 'retreat' | 'steal' | 'sated';
const FIRE = /lantern|torch|flare|fire|brand/i, BOOZE = /beer|whisk|rye|rum|liquor|moonshine|booze/i, JERKY = /jerky/i;
const STRIDE = { walk: 1.3, run: 2.6 };
/** half the player's view cone (rad) the hidebehind respects (wider than the screen: it takes no chances) */
const CONE = 0.82;

function hidebehindClips(defs: BoneDef[]): Record<string, Clip> {
  const { I, R, F, gait } = clipKit(defs);
  const HIPS = 0, SPINE = I('spine'), CHEST = I('chest'), NECK = I('neck'), NECK2 = I('neck2'), HEAD = I('head'), JAW = I('jaw');
  const CLA = [I('claL'), I('claR')], ARM = [I('armL'), I('armR')], ELB = [I('elbL'), I('elbR')], HAND = [I('handL'), I('handR')], FING = [I('fingL'), I('fingR')], FING2 = [I('fing2L'), I('fing2R')];
  const sin = Math.sin, cos = Math.cos, TAU = Math.PI * 2;
  const sm = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const env = (t: number, a: number, b: number, c: number, d: number) => (t < a ? 0 : t < b ? sm((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - sm((t - c) / (d - c)) : 0);
  const look = (p: Pose, a: AnimParams, k = 1) => { R(p, NECK2, -a.lookPitch * 0.3 * k, a.lookYaw * 0.35 * k); R(p, HEAD, -a.lookPitch * 0.4 * k, a.lookYaw * 0.45 * k); };
  /** the arms: a swing (+ forward), out from the body, the elbow bend, the fingers' curl */
  const arm = (p: Pose, k: number, sw: number, out = 0, bend = 0, curl = 0) => { const s = k ? -1 : 1; R(p, ARM[k], -sw, 0, s * out); R(p, ELB[k], -bend); R(p, FING[k], curl * 0.6); R(p, FING2[k], curl * 0.8); };
  const hunch = (p: Pose, k = 1) => { R(p, SPINE, 0.08 * k); R(p, CHEST, 0.12 * k); R(p, NECK, -0.1 * k); R(p, NECK2, -0.08 * k); };
  return {
    idle: { loop: true, dur: 7, fade: 0.6, fn: (p, t, a) => {
      // hunched, swaying a little, the long fingers flexing one at a time, the head tilting as if listening
      const br = sin(t * 0.24 * TAU);
      hunch(p, 1); p.t[1] += 0.008 * br; p.rr[2] += 0.02 * sin(t * 0.4);
      for (let k = 0; k < 2; k++) arm(p, k, 0.05 * sin(t * 0.5 + k), 0.06, 0.15, 0.3 + 0.25 * Math.max(0, sin(t * 1.3 + k * 2)));
      R(p, HEAD, 0, 0, 0.25 * env(t % 7, 2, 2.6, 4.4, 5.2)); R(p, JAW, 0.08 + 0.1 * env(t % 7, 4.6, 5, 5.6, 6.2)); look(p, a);
    } },
    walk: { loop: true, dur: 1, fade: 0.4, fn: (p, _t, a) => {
      // the stalk: long, slow, deliberate strides, the body low and leaning, the arms barely swinging
      const w = a.phase * TAU;
      gait(p, a.phase, 0.62, STRIDE.walk, 0.12, [0, 0.5]);
      hunch(p, 1.2); p.t[1] += 0.02 * cos(w * 2) - 0.04; p.rr[2] += 0.03 * sin(w);
      for (let k = 0; k < 2; k++) arm(p, k, 0.15 * sin(w + (k ? 0 : Math.PI)), 0.08, 0.25, 0.4);
      R(p, HEAD, 0.05 * cos(w * 2)); look(p, a, 0.6);
    } },
    run: { loop: true, dur: 1, fade: 0.25, fn: (p, _t, a) => {
      // the lope: bent almost double, long bounding strides, the arms reaching forward like it might drop to all fours
      const w = a.phase * TAU;
      gait(p, a.phase, 0.4, STRIDE.run, 0.25, [0, 0.5]);
      p.rr[0] += 0.38; p.t[1] += 0.05 * Math.abs(sin(w)) - 0.12; p.t[2] -= 0.05;
      R(p, NECK, -0.3); R(p, NECK2, -0.2); R(p, HEAD, -0.12);
      for (let k = 0; k < 2; k++) arm(p, k, 0.5 + 0.5 * sin(w + (k ? 0 : Math.PI)), 0.12, 0.4, 0.6);
    } },
    peek: { loop: true, dur: 5, fade: 0.8, fn: (p, t, a) => {
      // around the trunk: the head and one shoulder lean out to the side, the head tipped right over, one hand up
      // gripping the bark, the other hanging; then back
      const side = a.side ?? 1, k = env(t, 0.6, 1.8, 3.6, 4.6), K = side > 0 ? 0 : 1;
      hunch(p, 1); p.t[0] += 0.22 * side * k; p.rr[2] -= 0.22 * side * k;
      R(p, CHEST, 0, 0, -0.18 * side * k); R(p, NECK2, 0, 0, -0.2 * side * k); R(p, HEAD, 0.1 * k, -0.25 * side * k, -0.65 * side * k);
      arm(p, K, 1.2 * k, 0.25 * k, 1.1 * k, 0.9); arm(p, 1 - K, 0.05, 0.05, 0.2, 0.3); R(p, JAW, 0.14 * k);
      F(p, K, 0.1 * side * k, 0, 0); look(p, a, 0.3);
    } },
    freeze: { loop: true, dur: 4, fade: 0.08, fn: (p, t, a) => {
      // caught: dead still, mid-step, the head cocked; only the fingers twitch
      hunch(p, 1.1); R(p, HEAD, 0.05, 0, 0.32); p.t[1] += 0.002 * sin(t * 1.2); R(p, JAW, 0.16);
      for (let k = 0; k < 2; k++) arm(p, k, 0.1, 0.08, 0.3, 0.55 + 0.08 * Math.max(0, sin(t * 7 + k)));
      look(p, a, 0.25);
    } },
    lunge: { loop: false, dur: 1.4, fade: 0.06, next: 'run', fn: (p, t) => {
      // the strike: it rears, the jaw opens on the needles, both arms whip down and across
      const rear = env(t, 0, 0.18, 0.25, 0.4), strike = env(t, 0.25, 0.4, 0.55, 1.2);
      R(p, SPINE, -0.2 * rear + 0.3 * strike); R(p, CHEST, -0.15 * rear + 0.2 * strike); R(p, JAW, 0.5 * rear + 0.7 * strike);
      R(p, NECK, -0.2 * rear + 0.2 * strike); R(p, HEAD, -0.3 * rear);
      for (let k = 0; k < 2; k++) arm(p, k, 2.2 * rear - 0.4 * strike, 0.4 * rear - 0.25 * strike, 0.5 * rear, 0.2 + 0.8 * strike);
      p.t[2] += 0.4 * strike; p.t[1] += 0.06 * rear;
    } },
    eat: { loop: true, dur: 3, fade: 0.5, fn: (p, t) => {
      // squatting low, the jerky held up to its face in both hands, gnawing and tearing
      p.t[1] -= 0.45; p.rr[0] += 0.25; F(p, 0, 0.06, 0, 0.12, 1, 0.6); F(p, 1, -0.06, 0, 0.12, 1, 0.6);
      R(p, NECK, 0.25); R(p, HEAD, 0.15 + 0.08 * sin(t * 9), 0.1 * sin(t * 3)); R(p, JAW, 0.25 * Math.max(0, sin(t * 9)));
      for (let k = 0; k < 2; k++) arm(p, k, 1.0, -0.15, 1.9, 0.9);
    } },
    happy: { loop: true, dur: 4, fade: 0.5, fn: (p, t) => {
      // all it ever loves: crouched over its stolen jerky, rocking, a low rattle in the throat, eyes half shut
      p.t[1] -= 0.45; p.rr[0] += 0.3; p.rr[2] += 0.06 * sin(t * 1.6); F(p, 0, 0.06, 0, 0.12, 1, 0.6); F(p, 1, -0.06, 0, 0.12, 1, 0.6);
      R(p, NECK, 0.35); R(p, HEAD, 0.2, 0, 0.2 * sin(t * 0.8)); p.c[CH.SAD] = 0.6;
      for (let k = 0; k < 2; k++) arm(p, k, 0.9, -0.2, 1.8, 0.8);
    } },
    vanish: { loop: false, dur: 1.2, fade: 0.08, next: 'run', fn: (p, t) => {
      // repelled: it flinches back from the light, an arm over its eyes, and twists away
      const k = env(t, 0, 0.15, 0.8, 1.2);
      R(p, SPINE, -0.25 * k, 0.4 * k); R(p, HEAD, -0.2 * k, 0.4 * k); R(p, JAW, 0.6 * k); arm(p, 0, 1.6 * k, 0.3 * k, 1.6 * k, 0.5); p.t[2] -= 0.2 * k; p.c[CH.BLINK] = k;
    } },
  };
  void CLA; void HAND; void HIPS;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _e = new THREE.Euler();
type Trunk = { x: number; z: number; r: number };
export class Hidebehind extends Cryptid {
  readonly id = 'hidebehind';
  readonly name = 'Hidebehind';
  readonly favoriteFood = 'jerky';
  readonly rules = [
    'It only hunts at night, in the deep woods: old timber, far from the roads and the cabin. By day it is nowhere.',
    'It never moves while you are looking at it. Look straight at it and it stops dead, behind whatever is nearest.',
    'Turn your back and it comes closer, tree by tree. A snapped twig behind you means turn around now.',
    'Firelight keeps it off: carry a lit lantern or stay by a fire. It cannot abide the smell of liquor either.',
    'It is no friend and takes nothing from your hand. Set jerky down and walk away: it steals it and leaves you be for the night.',
  ] as const;
  readonly sounds = HIDEBEHIND_SOUND;
  declare state: HidebehindState;
  /** true/false forces "deep woods" (test pages); null judges it by the map */
  deep: boolean | null = null;
  /** the player can see it right now (in the cone, not behind a trunk) */
  seen = false;
  private D = 24; private spot = new THREE.Vector3(); private hasSpot = false; private sideK = 1; private cool = 0; private satedTonight = false; private lastGlimpse = -99;
  private fadeT = 0; private wait = 4; private backT = 0; private warned = false; private lastHiss = -99; private lastCreep = 0; private seenT = 0; private steal: { id: string; pos: THREE.Vector3 } | null = null; private repelT = 0;
  private lidAxis: THREE.Vector3[];
  constructor(o: { pos?: THREE.Vector3; heading?: number } = {}) {
    super(hidebehindModel(), hidebehindClips(hidebehindBones()), { pos: o.pos, heading: o.heading, shineCol: 0x9cff86, fur: HB_FUR_SPEC,
      legs: [{ up: 'thighL', lo: 'shinL', mid: 'metaL', foot: 'footL' }, { up: 'thighR', lo: 'shinR', mid: 'metaR', foot: 'footR' }] });
    this.object.name = 'Hidebehind';
    this.state = 'absent'; this.fade.value = 0;
    this.stride = { walk: STRIDE.walk, run: STRIDE.run };
    this.manualSpeed = { walk: 1.0, run: 5.5 };
    this.shineK = 2.2; this.turnK = 6;
    this.lidAxis = [1, -1].map((s) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * HB_EYE_AX[0], HB_EYE_AX[1], HB_EYE_AX[2])).normalize());
  }
  /** it takes nothing from a hand */
  offer(item: string): boolean { if (JERKY.test(item) && this.dist < 6 && this.state !== 'absent') this.emit('hiss'); return false; }
  play(clip: string | null) { super.play(clip); if (clip) { this.fade.value = 1; this.fadeT = 1; } }

  private isDeep(ctx: CreatureCtx): boolean {
    if (this.deep !== null) return this.deep;
    const P = ctx.player.pos, b = biome(P.x, P.z);
    return (b.old > 0.3 || b.density > 0.82) && roadInfo(P.x, P.z).d > 25 && Math.hypot(P.x - SPOTS.cabin.x, P.z - SPOTS.cabin.z) > 140;
  }
  /** a trunk on the line of sight from the player to a point */
  private occluded(ctx: CreatureCtx, at: THREE.Vector3, T: Trunk[]): boolean {
    const P = ctx.player.pos, dx = at.x - P.x, dz = at.z - P.z, L2 = dx * dx + dz * dz || 1e-6;
    for (const t of T) {
      const u = ((t.x - P.x) * dx + (t.z - P.z) * dz) / L2;
      if (u < 0.02 || u > 0.995) continue;
      const cx = P.x + dx * u - t.x, cz = P.z + dz * u - t.z;
      if (cx * cx + cz * cz < (t.r * 1.05) ** 2) return true;
    }
    return false;
  }
  /** the best trunk to stand behind at about distance D from the player, out of their sight */
  private pickSpot(ctx: CreatureCtx, T: Trunk[], wantBehind: boolean): boolean {
    const P = ctx.player.pos;
    let best = -Infinity, bx = 0, bz = 0;
    for (const t of T) {
      if (t.r < 0.14) continue;
      const dx = t.x - P.x, dz = t.z - P.z, l = Math.hypot(dx, dz);
      if (l < 2.2) continue;
      const sx = t.x + (dx / l) * (t.r + 0.16), sz = t.z + (dz / l) * (t.r + 0.16);
      _a.set(sx, 0, sz);
      const ang = this.viewAngle(ctx, _a);
      if (ang < CONE + 0.12) continue;                       // never step into view to get there
      const step = Math.hypot(sx - this.pos.x, sz - this.pos.z);
      const s = -Math.abs(l - this.D) * 1.2 + (wantBehind ? ang * 2.5 : 0) - step * 0.05 + (Math.random() - 0.5) * 0.3;
      if (s > best) { best = s; bx = sx; bz = sz; }
    }
    if (best === -Infinity) return false;
    this.spot.set(bx, 0, bz); this.hasSpot = true;
    return true;
  }

  protected think(ctx: CreatureCtx, dt: number) {
    const P = ctx.player, d = this.dist, night = isNight(ctx.hour), deep = this.isDeep(ctx);
    const T = ctx.trunks?.(P.pos.x, P.pos.z, 34) ?? [];
    const ang = this.viewAngle(ctx);
    this.seen = this.fade.value > 0.3 && ang < CONE && d < 60 && !this.occluded(ctx, _b.set(this.pos.x, 0, this.pos.z), T);
    this.cool = Math.max(0, this.cool - dt);
    this.lookAt = P.pos; this.face = null; this.arrive = 0.25;
    const fire = FIRE.test(P.held) || (ctx.fires ?? []).some((f) => Math.hypot(f.x - P.pos.x, f.z - P.pos.z) < 12);
    const booze = BOOZE.test(P.held) && d < 9;
    if (!night) this.satedTonight = false;
    const active = night && deep;
    // repelled: firelight or liquor close by sends it off shrieking, seen or not
    if ((fire && d < 18 || booze) && this.state !== 'absent' && this.state !== 'retreat') {
      this.go('retreat'); this.once('vanish'); this.emit(booze ? 'gag' : 'repelled'); this.repelT = 0; this.fadeT = 0;
      this.awayFrom(P.pos, 40, this.target); this.want = 7; return;
    }
    if (this.seen) { this.seenT += dt; if (this.seenT > 0.25 && ctx.time - this.lastGlimpse > 8 && this.state !== 'retreat' && this.state !== 'absent') { this.lastGlimpse = ctx.time; this.emit('glimpse', { d }); } } else this.seenT = 0;
    // jerky set down: the one thing it will come for
    const jk = this.itemNear(ctx, JERKY, P.pos, 35);
    if (jk && active && this.state !== 'retreat' && this.state !== 'sated' && Math.hypot(jk.pos.x - P.pos.x, jk.pos.z - P.pos.z) > 5) { if (this.state !== 'steal') this.go('steal'); this.steal = { id: jk.id, pos: jk.pos }; }
    switch (this.state) {
      case 'absent': {
        this.want = 0; this.fadeT = 0;
        if (active && this.cool <= 0 && !this.satedTonight && !fire) {
          // arrive somewhere well behind the player, out of sight
          this.D = 24;
          if (this.pickSpot(ctx, T, true) || T.length === 0) {
            if (!this.hasSpot) this.spot.set(P.pos.x - P.dir.x * 25, 0, P.pos.z - P.dir.z * 25);
            this.pos.set(this.spot.x, ctx.heightAt(this.spot.x, this.spot.z), this.spot.z); this.go('stalk'); this.fadeT = 1;
          }
        }
        break;
      }
      case 'stalk': {
        this.fadeT = 1;
        if (!active) { this.go('retreat'); this.awayFrom(P.pos, 40, this.target); break; }
        if (this.seen) { this.go('frozen'); this.want = 0; this.speed = 0; break; }
        const behind = ang > 2.0, atSpot = this.hasSpot && Math.hypot(this.spot.x - this.pos.x, this.spot.z - this.pos.z) < 0.35;
        // a back turned on it for too long, close enough: a hiss (the last warning), then the rush
        this.backT = behind && d < 16 ? this.backT + dt : 0;
        if (this.backT > 9 && !this.warned) { this.warned = true; this.lastHiss = ctx.time; this.emit('hiss'); }
        if (this.backT > 11 && !fire) { this.go('attack'); this.backT = 0; this.warned = false; break; }
        if (atSpot) {
          this.want = 0; this.faceToward(P.pos);
          // the player's back is turned: the next tree closer; looking round: settle further off
          if (behind && this.st > this.wait) {
            this.D = Math.max(3, this.D - 4); this.st = 0; this.wait = 3 + Math.random() * 4;
            if (this.D <= 3 && d < 6 && !fire) { this.go('attack'); break; }
            if (this.pickSpot(ctx, T, true) && ctx.time - this.lastCreep > 2) { this.lastCreep = ctx.time; if (Math.random() < 0.5) this.emit('creep'); }
          } else if (!behind && ang < 1.3) { this.D = Math.min(26, this.D + dt * 1.5); }
          if (Math.hypot(this.spot.x - P.pos.x, this.spot.z - P.pos.z) > this.D + 6 || !this.occluded(ctx, this.pos, T)) this.pickSpot(ctx, T, behind);
        } else {
          if (!this.hasSpot) this.pickSpot(ctx, T, true);
          this.target.copy(this.spot); this.want = 6.5;
        }
        if (d < 9 && behind && ctx.time - this.lastHiss > 6 && Math.random() < dt * 0.3) { this.lastHiss = ctx.time; this.emit('hiss'); }
        break;
      }
      case 'frozen': {
        this.want = 0; this.speed = 0; this.fadeT = 1;
        // it stays exactly where it was caught until you look away; then it is gone behind the nearest tree
        if (!this.seen) { this.go('stalk'); this.D = Math.min(26, Math.max(this.D, d + 3)); this.pickSpot(ctx, T, false); }
        break;
      }
      case 'attack': {
        this.fadeT = 1;
        if (this.hold === 'lunge') {
          this.want = 0;
          if (this.holdDone) { this.hold = null; this.go('retreat'); this.cool = 90; this.awayFrom(P.pos, 45, this.target); }
          break;
        }
        if (this.seen) { this.go('frozen'); break; }      // turning round in time stops it
        this.target.set(P.pos.x - P.dir.x * 0.9, 0, P.pos.z - P.dir.z * 0.9); this.want = 7.5; this.arrive = 0.2;
        if (d < 1.5) {
          this.once('lunge'); this.speed = 0;
          const fwd = new THREE.Vector3(P.dir.x, 0, P.dir.z).normalize();
          this.emit('attack', { damage: 0.4, impulse: fwd.multiplyScalar(6).setY(2) });
        }
        if (this.st > 6) this.go('stalk');
        break;
      }
      case 'retreat': {
        this.want = 6.5; this.repelT += dt;
        if (this.hold === 'vanish' && !this.holdDone) this.want = 0;
        if (d > 30 || this.repelT > 6) { this.fadeT = 0; if (this.fade.value < 0.02) { this.go('absent'); this.hasSpot = false; this.cool = Math.max(this.cool, 30); } }
        break;
      }
      case 'steal': {
        this.fadeT = 1;
        if (!this.steal || !(ctx.items ?? []).some((i) => i.id === this.steal!.id)) { this.go('stalk'); break; }
        if (this.seen) { this.want = 0; this.speed = 0; break; }
        this.target.copy(this.steal.pos); this.want = 6; this.arrive = 0.3;
        if (Math.hypot(this.steal.pos.x - this.pos.x, this.steal.pos.z - this.pos.z) < 0.6 && ctx.takeItem?.(this.steal.id) !== false) {
          this.emit('steal', { item: 'jerky' }); this.satedTonight = true; this.trust = Math.min(1, this.trust + 0.1);
          this.go('sated'); this.D = 30; this.pickSpot(ctx, T, false);
        }
        break;
      }
      case 'sated': {
        // off behind a far tree with its prize: it eats, then rocks over it, content; no hunting tonight
        this.fadeT = 1;
        if (this.seen) { this.want = 0; this.speed = 0; break; }
        if (this.hasSpot && this.pos.distanceTo(_a.set(this.spot.x, this.pos.y, this.spot.z)) > 0.4) { this.target.copy(this.spot); this.want = 5; this.hold = null; }
        else { this.want = 0; this.hold = this.st < 40 ? 'eat' : 'happy'; if (this.st > 1 && this.st < 1.1) this.emit('eat', { item: 'jerky' }); }
        if (!night || this.st > 240) { this.go('retreat'); this.awayFrom(P.pos, 40, this.target); }
        break;
      }
    }
    // it never moves while you can see it
    if (this.seen && this.state !== 'retreat' && this.hold !== 'lunge') { this.want = 0; this.speed = 0; }
  }
  protected move(ctx: CreatureCtx, dt: number) {
    super.move(ctx, dt);
    // the dissolve: in and out only when nobody is looking (or when repelled)
    if (!this.manual) {
      const can = !this.seen || this.state === 'retreat';
      if (can) this.fade.value = clamp(this.fade.value + clamp(this.fadeT - this.fade.value, -1.5 * dt, 1.5 * dt), 0, 1);
    }
  }
  protected clipFor(speed: number): string {
    if (this.state === 'frozen' || (this.seen && this.state === 'stalk')) return 'freeze';
    if (speed > 2.2) return 'run';
    if (speed > 0.15) return 'walk';
    if (this.state === 'stalk' && this.hasSpot) return 'peek';
    return 'idle';
  }
  protected animate(ctx: CreatureCtx, dt: number) {
    // which side of the trunk to peek round: toward the side the player is turned from
    if (this.state === 'stalk') { const P = ctx.player.pos, yaw = Math.atan2(P.x - this.pos.x, P.z - this.pos.z), dx = Math.sin(yaw - this.heading); this.sideK = damp(this.sideK, dx >= 0 ? 1 : -1, 2, dt); }
    this.params.side = this.sideK;
    super.animate(ctx, dt);
  }
  protected pre(p: Pose) {
    const B = this.skel.bones, blink = clamp(Math.max(p.c[CH.BLINK] * 0.9, p.c[CH.SAD] * 0.5), 0, 1);
    B[this.bi('lidL')].quaternion.setFromAxisAngle(this.lidAxis[0], 0.08 + blink * 1.3);
    B[this.bi('lidR')].quaternion.setFromAxisAngle(this.lidAxis[1], 0.08 + blink * 1.3);
    _e.set(-this.params.lookPitch * 0.5, this.params.lookYaw * 0.5, 0);
    B[this.bi('eyeL')].quaternion.setFromEuler(_e); B[this.bi('eyeR')].quaternion.setFromEuler(_e);
  }
}
void daylight;
