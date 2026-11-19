// BIGFOOT (Sasquatch): shy, curious, enormous. Model in bigfoot/model.ts, clips in bigfoot/clips.ts, props (branch,
// gifts) in bigfoot/props.ts.
//
//   const bf = new Bigfoot({ pos: new THREE.Vector3(80, 0, 430) });
//   scene.add(bf.object);
//   bf.update(ctx);                    // every frame (CreatureCtx from ./types; uses ctx.trunks, ctx.kindness, ctx.dropItem)
//
// States:
//   roam   by day, or when it has been frightened: keeps far off (80-150 m) in the deep woods, walking slowly
//   watch  at dusk and night: picks a spot 25-80 m from the player, behind a tree trunk if it can, and watches;
//          stands and stares, or crouches behind the trunk and peeks round it; backs off if the player comes closer
//   knock  now and then at night it knocks a branch against a trunk, three times ('knock' events)
//   gift   when the player has been kind (ctx.kindness) and is away from the cabin: walks to the edge of the cabin
//          clearing and sets down a gift (a trout, blueberries, a carved stick) with ctx.dropItem, then slips away
//   flee   approached fast, or caught in the flashlight's beam: runs for it ('crash', 'whoop')
//   tempted (v7) the player stands still holding fish or berries (its favourites): it creeps out of the trees,
//          stooping, and holds out a big hand within reach; it bolts if rushed or lit
//   eat    offer('fish') when it is close: it takes it with care, sits back on its heels and eats, rocking happily
// Events (ctx.emit(ev, { pos, who: 'bigfoot', sound, ... })): knock, gift (item, id, at), crash, whoop, grunt, step,
// eat (item), happy. `sound` is a suggested src/audio/bank.ts id (BIGFOOT_SOUND).
// v7: a shaggy coat of real fur with physics (src/creatures/fur) and a face that moves (expression.ts): heavy
// brows that rise and knit, slow blinks under leather lids, a curious head tilt, a lip that curls.
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, dampAngle, wrapAngle, type CreatureFx } from './rig';
import { Animator, FOOT, type AnimParams } from './animator';
import { buildBigfootModel, buildBigfootModelAsync, bigfootBones, BIGFOOT_MODEL_VERSION, type BigfootModel } from './bigfoot/model';
import { loader } from './cache';
import { bigfootClips, CH_PROP, CH_KNOCK, CH_PLACE } from './bigfoot/clips';
import { handProp, GIFTS, type PropKind } from './bigfoot/props';
import { daylight } from './hound';
import { SPOTS } from '../world/layout';
import { setPusher } from '../gfx/globals';
import type { CreatureCtx } from './types';
import { BIGFOOT_FUR_LEN, BF_EYE_AX } from './bigfoot/model';
import { addFur, type Fur } from './fur';
import { Expression, type Mood } from './expression';

/** the sound-bank id (src/audio/bank.ts) suggested for each event */
export const BIGFOOT_SOUND: Record<string, string | undefined> = { knock: 'bigfoot_wood_knock', whoop: 'bigfoot_whoop', step: 'bigfoot_step', crash: 'bigfoot_branch_break', grunt: 'bigfoot_grunt', eat: 'eat_chew', happy: 'bigfoot_grunt' };
export type BigfootState = 'roam' | 'watch' | 'knock' | 'gift' | 'flee' | 'tempted' | 'eat';
/** what Bigfoot takes from the hand (its favourites first) */
export const BIGFOOT_FOODS = ['fish', 'trout', 'berries', 'blueberries'];
const BIGFOOT = loader<BigfootModel>(BIGFOOT_MODEL_VERSION, () => buildBigfootModelAsync(), (b, m) => ({ ...b, bones: bigfootBones(), tris: m.tris as number, den: m.den as number, stats: m.stats as string }), (m) => ({ tris: m.tris, den: m.den, stats: m.stats }));
/** Bigfoot's shared model: preloaded (bigfootModelAsync / preloadCreatures) or built now (blocks) */
export function bigfootModel(): BigfootModel { let m = BIGFOOT.get(); if (!m) { m = buildBigfootModel(); BIGFOOT.set(m); } return m; }
/** load Bigfoot's model without stalling (IndexedDB cache, else built in slices) */
export function bigfootModelAsync(o: { cache?: boolean } = {}): Promise<BigfootModel> { return BIGFOOT.load(o); }
const STRIDE: Record<string, number> = { walk: 1.7, run: 3.2 };
const _e = new THREE.Euler(), _t = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _pole = new THREE.Vector3();

export class Bigfoot {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: Skel;
  readonly anim: Animator;
  readonly fx: CreatureFx;
  readonly model: BigfootModel;
  /** the shaggy coat (null if the model has no fur page) */
  readonly fur: Fur | null;
  readonly face = new Expression({ seed: 23, rate: 3.5 });
  /** test pages: hold a mood (null: follows the AI) */
  faceMood: Mood | null = null;
  readonly favoriteFood = 'fish';
  state: BigfootState = 'roam';
  readonly pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  manual: string | null = null;
  private params: AnimParams = { speed: 0, phase: 0, lookYaw: 0, lookPitch: 0 };
  private legs: { up: number; lo: number; foot: number; ankle: THREE.Vector3 }[];
  private props: Partial<Record<PropKind, THREE.Object3D>> = {};
  private hand: THREE.Bone;
  private t = 0; private st = 0; private next = 0; private target = new THREE.Vector3(); private wantSpeed = 0;
  private spot = new THREE.Vector3(); private hasSpot = false; private cover: { x: number; z: number; r: number } | null = null;
  private lastPlayer = new THREE.Vector3(); private playerSpeed = 0; private approach = 0; private hold: string | null = null;
  private giftT = -200; private giftK = 0; private knockT = 0; private lastKnock = -1; private placed = false; private fear = 0;
  private ground = new Float32Array(2);

  constructor(o: { pos?: THREE.Vector3; heading?: number; model?: BigfootModel } = {}) {
    const m = o.model ?? bigfootModel();
    this.model = m;
    this.skel = new Skel(m.bones);
    const { mat, depth, fx } = creatureMaterial(m.tex, m.sd, { shineCol: 0xff9a50 });
    this.fx = fx;
    this.mesh = this.skel.mesh(m.geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.customDepthMaterial = depth; this.mesh.frustumCulled = false;
    this.object.add(this.mesh); this.object.name = 'Bigfoot';
    this.anim = new Animator(bigfootClips(this.skel.defs), this.skel.bones.length, 2);
    this.anim.play('watch');
    const S = this.skel;
    this.legs = ['L', 'R'].map((s) => ({ up: S.i('thigh' + s), lo: S.i('shin' + s), foot: S.i('foot' + s), ankle: S.restWorld[S.i('foot' + s)].clone() }));
    this.hand = S.bones[S.i('handR')];
    for (const k of ['branch', ...GIFTS] as PropKind[]) {
      const p = handProp(k); p.visible = false;
      // the fist: a hand's length below the wrist, a little forward
      p.position.set(0, -0.15, 0.03);
      this.hand.add(p); this.props[k] = p;
    }
    if (o.pos) this.pos.copy(o.pos);
    this.heading = o.heading ?? 0;
    this.lidAxis = [1, -1].map((s) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * BF_EYE_AX[0], BF_EYE_AX[1], BF_EYE_AX[2]).normalize()).normalize());
    this.fur = m.fur ? addFur(this.mesh, {
      length: BIGFOOT_FUR_LEN, mask: m.fur, shells: 14, density: 0.82, clump: 6, clumpPull: 0.65, rootDark: 0.4, tipK: 0.5, tip: 0xffcc99, fins: 0.45,
      comb: (p) => (p[1] > 2.25 ? [0, -0.35, -0.25] : [0, -0.6, -0.08]),
      springs: [{ bones: ['armL', 'armR'], hz: 2, inertia: 1.2 }, { bones: ['head'], hz: 2.6 }, { bones: ['thighL', 'thighR'], hz: 2.2 }],
      droop: 0.42, inertia: 0.05, hz: 2.0, damping: 0.22, lod: [6, 30, 55],
    }) : null;
  }
  private lidAxis: THREE.Vector3[];
  private pendingEv: { ev: string; item?: string }[] = [];
  private eatItem = 'fish';
  /** the player holds out food: true if Bigfoot takes it (fish or berries, when it has come close enough) */
  offer(item: string): boolean {
    if (!BIGFOOT_FOODS.includes(item)) return false;
    if (this.state === 'flee' || this.state === 'eat') return false;
    if (this.playerDist > 3.4) return false;
    this.go('eat'); this.eatItem = item; this.hold = 'take'; this.anim.play('take', { restart: true });
    this.pendingEv.push({ ev: 'eat', item });
    return true;
  }
  private playerDist = 99;
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip].loop }); }
  get clips(): string[] { return Object.keys(this.anim.clips); }

  update(ctx: CreatureCtx) {
    const dt = Math.min(0.1, Math.max(0, ctx.dt));
    this.t += dt; this.st += dt;
    const P = ctx.player;
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    const ps = P.speed ?? (this.lastPlayer.lengthSq() > 0 && dt > 0 ? Math.hypot(P.pos.x - this.lastPlayer.x, P.pos.z - this.lastPlayer.z) / dt : 0);
    // how fast the player closes on it
    const closing = this.lastPlayer.lengthSq() > 0 && dt > 0 ? (Math.hypot(this.lastPlayer.x - this.pos.x, this.lastPlayer.z - this.pos.z) - dist) / dt : 0;
    this.playerSpeed = damp(this.playerSpeed, Math.min(ps, 12), 5, dt);
    this.approach = damp(this.approach, clamp(closing, -10, 10), 4, dt);
    this.lastPlayer.copy(P.pos);
    if (!this.manual) this.think(ctx, dt, dist);
    this.move(ctx, dt);
    const night = 1 - daylight(ctx.hour);
    this.fx.shine.value = night * (P.light ? 1 : 0.35);
    this.animate(ctx, dt, dist);
    setPusher(2, this.object.position.x, this.object.position.y, this.object.position.z, 0.7);
  }

  // ------------------------------------------------------------------------------------------------ AI
  private go(s: BigfootState) { if (s !== this.state) { this.state = s; this.st = 0; this.hold = null; this.hasSpot = false; this.placed = false; } }
  private lit(ctx: CreatureCtx, dist: number): boolean {
    const P = ctx.player;
    if (!P.light || dist > 45) return false;
    _v.set(this.pos.x - P.pos.x, this.pos.y + 1.6 - P.pos.y, this.pos.z - P.pos.z).normalize();
    return _v.dot(P.dir) > Math.cos(0.2) && !(this.hold === 'hide' && this.cover);
  }
  private think(ctx: CreatureCtx, dt: number, dist: number) {
    const P = ctx.player, dusk = 1 - daylight(ctx.hour);
    const emit = (ev: string, x: Record<string, unknown> = {}) => ctx.emit(ev, { pos: this.object.position.clone(), who: 'bigfoot', sound: BIGFOOT_SOUND[ev], ...x });
    this.fear = Math.max(0, this.fear - dt * 0.01);
    // frights first: rushed at, or the beam on it
    this.playerDist = dist;
    for (const e of this.pendingEv.splice(0)) emit(e.ev, { item: e.item });
    const food = BIGFOOT_FOODS.includes(P.held), calm = this.approach < 1.2 && (P.speed ?? this.playerSpeed) < 1.5;
    const brave = (this.state === 'tempted' || this.state === 'eat') && calm && !this.lit(ctx, dist);
    if (this.state !== 'flee' && !brave && ((this.approach > 3 && dist < 45) || this.lit(ctx, dist) || dist < 12)) { this.go('flee'); this.fear = 1; emit('whoop'); emit('crash'); }
    // fish or berries held out by a still player: tempted out of the trees
    if (food && calm && this.fear < 0.5 && dusk > 0.3 && dist < 60 && (this.state === 'watch' || this.state === 'roam')) { this.go('tempted'); emit('grunt'); }
    const away = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
    switch (this.state) {
      case 'tempted': {
        if (!food) { if (this.st > 2) this.go('watch'); this.wantSpeed = 0; break; }
        const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
        this.target.set(P.pos.x + Math.sin(a) * 2.3, 0, P.pos.z + Math.cos(a) * 2.3);
        const pause = (this.st % 5) > 3.6;
        this.wantSpeed = dist > 2.6 && !pause ? (dist > 15 ? 1.2 : 0.55) : 0;
        this.hold = this.wantSpeed === 0 && dist < 4 ? 'reach' : null;
        if (pause && Math.random() < dt * 0.5) emit('grunt');
        break;
      }
      case 'eat': {
        this.wantSpeed = 0; this.faceTo = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        if (this.hold === 'take' && this.st > 1.4) this.hold = 'eat';
        if (this.st > 9) { emit('happy', { item: this.eatItem }); this.giftT = Math.min(this.giftT, this.t - 200); this.go('watch'); this.fear = 0.6; }
        break;
      }
      case 'flee': {
        this.target.set(P.pos.x + Math.sin(away) * 160, 0, P.pos.z + Math.cos(away) * 160);
        this.wantSpeed = dist > 90 ? 1.6 : 7.5;
        if (Math.random() < dt * 1.5 && dist < 70) emit('crash');
        if (dist > 120) this.go('roam');
        break;
      }
      case 'roam': {
        // day, or still shaken: keep to the deep woods
        if (!this.hasSpot || this.st > this.next) {
          const a = away + (Math.random() - 0.5) * 1.6, d = 90 + Math.random() * 50;
          this.spot.set(P.pos.x + Math.sin(a) * d, 0, P.pos.z + Math.cos(a) * d); this.hasSpot = true; this.next = this.st + 20 + Math.random() * 20;
        }
        this.target.copy(this.spot); this.wantSpeed = dist < 70 ? 1.6 : 1.1; this.hold = null;
        if (dusk > 0.45 && this.fear < 0.3) {
          if ((ctx.kindness ?? 0) >= 0.5 && this.t - this.giftT > 240 && this.awayFromCabin(ctx)) this.go('gift');
          else this.go('watch');
        }
        break;
      }
      case 'watch': {
        if (dusk < 0.3) { this.go('roam'); break; }
        // choose a watching spot: behind a trunk 25-80 m off, the trunk between it and the player
        if (!this.hasSpot || dist < 22 || dist > 85) this.pickSpot(ctx, dist);
        const ds = Math.hypot(this.spot.x - this.pos.x, this.spot.z - this.pos.z);
        this.target.copy(this.spot);
        this.wantSpeed = ds > 1 ? (dist < 25 ? 1.8 : 1.4) : 0;
        if (ds <= 1.2) {
          // watching: crouched behind cover, or standing tall in the shadows
          if (this.st > this.next) { this.next = this.st + 10 + Math.random() * 14; this.hold = this.cover && Math.random() < 0.6 ? 'hide' : 'watch'; }
          if (!this.hold) this.hold = this.cover ? 'hide' : 'watch';
          if (dusk > 0.7 && this.t - this.knockT > 50 + Math.random() * 40 && this.cover) { this.go('knock'); this.knockT = this.t; break; }
          if ((ctx.kindness ?? 0) >= 0.5 && this.t - this.giftT > 240 && this.awayFromCabin(ctx)) this.go('gift');
          if (Math.random() < dt * 0.05) emit('grunt');
        } else this.hold = null;
        break;
      }
      case 'knock': {
        // face the trunk it hides behind and knock on it with a branch
        this.wantSpeed = 0; this.hold = 'knock';
        if (this.cover) this.faceTo = Math.atan2(this.cover.x - this.pos.x, this.cover.z - this.pos.z);
        if (this.st > 4.1) { this.go('watch'); this.hasSpot = true; }
        break;
      }
      case 'gift': {
        const C = ctx.stove ?? new THREE.Vector3(SPOTS.cabin.x, 0, SPOTS.cabin.z);
        if (!this.hasSpot) {
          // the edge of the clearing on the side away from the player
          const a = Math.atan2(C.x - P.pos.x, C.z - P.pos.z) + (Math.random() - 0.5);
          this.spot.set(C.x + Math.sin(a) * 9, 0, C.z + Math.cos(a) * 9); this.hasSpot = true;
        }
        const ds = Math.hypot(this.spot.x - this.pos.x, this.spot.z - this.pos.z);
        if (!this.placed && ds > 1.0) { this.target.copy(this.spot); this.wantSpeed = 1.5; this.hold = null; this.giftStart = -1; }
        else if (!this.placed) {
          this.wantSpeed = 0; this.faceTo = Math.atan2(C.x - this.pos.x, C.z - this.pos.z);
          if (this.giftStart < 0) { this.giftStart = this.st; this.anim.play('gift', { restart: true }); }
          this.hold = 'gift';
          if (this.st - this.giftStart > 4.3) {
            this.placed = true; this.giftT = this.t;
            const kind = GIFTS[this.giftK++ % GIFTS.length];
            _v.set(this.pos.x + Math.sin(this.heading) * 0.75, 0, this.pos.z + Math.cos(this.heading) * 0.75);
            _v.y = ctx.heightAt(_v.x, _v.z);
            const id = ctx.dropItem ? ctx.dropItem(kind, _v.clone()) : kind;
            emit('gift', { item: kind, id, at: _v.clone() });
          }
        } else { this.go('roam'); this.fear = 0.5; }
        break;
      }
    }
  }
  private faceTo: number | null = null;
  private giftStart = -1;
  private awayFromCabin(ctx: CreatureCtx) { const C = ctx.stove ?? new THREE.Vector3(SPOTS.cabin.x, 0, SPOTS.cabin.z); return Math.hypot(ctx.player.pos.x - C.x, ctx.player.pos.z - C.z) > 35; }
  private pickSpot(ctx: CreatureCtx, dist: number) {
    const P = ctx.player, d = clamp(dist, 30, 70);
    const a0 = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
    this.cover = null;
    const trunks = ctx.trunks ? ctx.trunks(P.pos.x + Math.sin(a0) * d, P.pos.z + Math.cos(a0) * d, 25) : [];
    let best = Infinity;
    for (const t of trunks) {
      const td = Math.hypot(t.x - P.pos.x, t.z - P.pos.z);
      if (td < 25 || td > 80 || t.r < 0.2) continue;
      const score = Math.abs(td - d) + Math.hypot(t.x - this.pos.x, t.z - this.pos.z) * 0.3;
      if (score < best) { best = score; this.cover = t; }
    }
    if (this.cover) {
      const a = Math.atan2(this.cover.x - P.pos.x, this.cover.z - P.pos.z), back = this.cover.r + 0.75;
      this.spot.set(this.cover.x + Math.sin(a) * back, 0, this.cover.z + Math.cos(a) * back);
    } else this.spot.set(P.pos.x + Math.sin(a0) * d, 0, P.pos.z + Math.cos(a0) * d);
    this.hasSpot = true;
  }

  // ------------------------------------------------------------------------------------------------ movement
  private move(ctx: CreatureCtx, dt: number) {
    if (this.manual) this.speed = this.manual === 'walk' ? 1.5 : this.manual === 'run' ? 6.5 : 0;
    else {
      const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
      let want = d < 0.4 ? 0 : Math.min(this.wantSpeed, d * 1.2 + 0.3);
      if (want > 0) this.heading = dampAngle(this.heading, Math.atan2(tx, tz), 2.4, dt);
      else {
        // still: face the cover's trunk to knock or hide, else turn slowly to keep the player in view
        const P = ctx.player;
        const face = this.faceTo ?? (this.hold === 'hide' && this.cover ? Math.atan2(this.cover.x - this.pos.x, this.cover.z - this.pos.z) : Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z));
        this.heading = dampAngle(this.heading, face, 0.9, dt);
      }
      if (this.state !== 'knock' && this.state !== 'gift' && this.state !== 'eat') this.faceTo = null;
      want *= clamp(1.3 - Math.abs(wrapAngle(Math.atan2(tx, tz) - this.heading)) * 0.5, 0.3, 1);
      this.speed = damp(this.speed, want, want > this.speed ? 1.6 : 3, dt);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
    }
    this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.object.position.copy(this.pos);
    this.object.rotation.set(0, this.heading, 0);
  }

  // ------------------------------------------------------------------------------------------------ animation
  private animate(ctx: CreatureCtx, dt: number, dist: number) {
    const a = this.params, sp = this.speed;
    let clip = this.manual ?? this.hold ?? (sp < 0.1 ? 'watch' : sp < 3 ? 'walk' : 'run');
    if (!this.manual && sp > 0.3) clip = sp < 3 ? 'walk' : 'run';
    if (clip !== 'gift' || this.anim.current !== 'gift') this.anim.play(clip);
    if (this.anim.current === 'walk' || this.anim.current === 'run') {
      const before = a.phase;
      a.phase = (a.phase + (sp / STRIDE[this.anim.current]) * dt) % 1;
      if (Math.floor(before * 2) !== Math.floor(a.phase * 2) || a.phase < before) ctx.emit('step', { pos: this.object.position.clone(), who: 'bigfoot', sound: 'bigfoot_step', heavy: true });
    }
    a.speed = sp;
    // look at the player when it can see them
    const P = ctx.player;
    let ly = 0, lp = 0;
    if (dist < 120) {
      const yaw = wrapAngle(Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.heading);
      ly = Math.abs(yaw) < 2 ? clamp(yaw, -1.0, 1.0) : 0;
      lp = clamp(Math.atan2(P.pos.y - (this.pos.y + 2.4), Math.max(1, dist)), -0.5, 0.5);
    }
    a.lookYaw = damp(a.lookYaw, ly, 2.5, dt); a.lookPitch = damp(a.lookPitch, lp, 2.5, dt);
    const p = this.anim.update(dt, a);
    // props: the branch while knocking, the gift until it is set down
    const show: PropKind | null = p.c[CH_PROP] > 0.5 && p.c[CH_PROP] < 1.5 ? 'branch' : p.c[CH_PROP] > 2.5 ? (/berr/.test(this.eatItem) ? 'berries' : 'fish') : p.c[CH_PROP] > 1.5 ? GIFTS[this.giftK % GIFTS.length] : null;
    for (const k of Object.keys(this.props) as PropKind[]) this.props[k]!.visible = k === show;
    if (p.c[CH_KNOCK] > 0.5 && this.t - this.lastKnock > 0.3 && this.anim.current === 'knock') { this.lastKnock = this.t; ctx.emit('knock', { pos: this.object.position.clone(), who: 'bigfoot', sound: 'bigfoot_wood_knock' }); }
    void CH_PLACE;
    // feet on the ground
    const c = Math.cos(this.heading), s = Math.sin(this.heading), g0 = this.pos.y;
    for (let k = 0; k < 2; k++) {
      const L = this.legs[k], fx = L.ankle.x + p.f[k * FOOT], fz = L.ankle.z + p.f[k * FOOT + 2];
      this.ground[k] = clamp(ctx.heightAt(this.pos.x + fx * c + fz * s, this.pos.z - fx * s + fz * c) - g0, -0.4, 0.4);
    }
    // the face: curious when it watches, scared when it runs, rapt when tempted, happy as it eats
    const mood: Mood = this.faceMood ?? (this.state === 'flee' ? 'scared' : this.state === 'eat' ? (this.st > 6 ? 'joy' : 'eating') : this.state === 'tempted' ? 'pleading' : this.state === 'knock' ? 'angry' : this.state === 'gift' ? 'happy' : this.state === 'watch' ? 'curious' : 'neutral');
    this.face.set(mood, mood === 'angry' ? 0.45 : mood === 'curious' && this.hold === 'hide' ? 0.6 : 1);
    this.face.update(dt);
    this.apply(p, Math.min(this.ground[0], this.ground[1]));
    this.fur?.update(dt, this.manual ? null : _v.set(Math.sin(this.heading) * this.speed, 0, Math.cos(this.heading) * this.speed));
  }
  private apply(p: ReturnType<Animator['update']>, lift: number) {
    const S = this.skel, B = S.bones;
    S.rest();
    B[0].position.x += p.t[0]; B[0].position.y += p.t[1] + lift; B[0].position.z += p.t[2];
    B[0].quaternion.setFromEuler(_e.set(p.rr[0], p.rr[1], p.rr[2]));
    for (let i = 1; i < B.length; i++) { const x = p.r[i * 3], y = p.r[i * 3 + 1], z = p.r[i * 3 + 2]; if (x || y || z) B[i].quaternion.setFromEuler(_e.set(x, y, z)); }
    // the face: brows rise and knit, lids blink and droop, the lip curls (a snarl) or lifts (a grin), the jaw drops
    const F = this.face.face, I = S.idx;
    for (const [nm, sd] of [['browL', 1], ['browR', -1]] as const) { const b = B[I[nm]]; b.position.y += F.brow * 0.014; b.position.z += F.brow * 0.004; b.quaternion.setFromEuler(_e.set(-F.brow * 0.1, 0, -sd * F.browIn * 0.3)); }
    const blink = Math.min(1, F.blink + F.lid * 0.75);
    B[I.lidL].quaternion.setFromAxisAngle(this.lidAxis[0], 0.05 + blink * 1.35);
    B[I.lidR].quaternion.setFromAxisAngle(this.lidAxis[1], 0.05 + blink * 1.35);
    B[I.lip].position.y += F.lip * 0.012 + F.smile * 0.004; B[I.lip].position.z += F.lip * 0.004; B[I.lip].quaternion.setFromEuler(_e.set(-F.lip * 0.25, 0, 0));
    const j = I.jaw; B[j].quaternion.setFromEuler(_e.set(p.r[j * 3] + F.jaw * 0.22 + F.lip * 0.05, p.r[j * 3 + 1], p.r[j * 3 + 2]));
    const h = I.head; B[h].quaternion.setFromEuler(_e.set(p.r[h * 3], p.r[h * 3 + 1], p.r[h * 3 + 2] + F.tilt * 0.28));
    S.fk();
    const fwd = _v.set(0, 0, 1).applyQuaternion(S.Q[0]);
    const yawQ = _q.setFromAxisAngle(_w.set(0, 1, 0), Math.atan2(fwd.x, fwd.z));
    _pole.set(0, 0, 1).applyQuaternion(yawQ);
    for (let k = 0; k < 2; k++) {
      const L = this.legs[k], o = k * FOOT, w = clamp(p.f[o + 3], 0, 1);
      if (w < 0.002) continue;
      _t.set(L.ankle.x + p.f[o], L.ankle.y + p.f[o + 1] + this.ground[k] - lift, L.ankle.z + p.f[o + 2]);
      S.ik2(L.up, L.lo, L.foot, _t, _pole, w);
      const want = new THREE.Quaternion().copy(yawQ).multiply(new THREE.Quaternion().setFromEuler(_e.set(p.f[o + 4], 0, 0)));
      S.orient(L.foot, want.slerp(S.Q[L.foot].clone(), 1 - w));
    }
  }
}
