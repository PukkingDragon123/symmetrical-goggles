// The shared runtime of the six lumber-camp cryptids: a skinned creature on a Skel, a procedural clip Animator,
// two-bone leg IK with ground following, steering toward a target, a look-at, blinks, eye shine at night, a dithered
// dissolve, and the event helper. Each cryptid (hodag.ts, squonk.ts, ...) supplies its model, clips, think() (its
// rules) and offer() (its favourite food).
//
//   const c = new Hodag({ pos }); scene.add(c.object);
//   c.update(ctx);                 // every frame (CreatureCtx, ../types)
//   c.offer('bacon');              // true when it takes it (and plays its eat / joy reaction)
//
// Events: ctx.emit(ev, { pos, who: c.id, sound, ... }); `sound` is a src/audio/bank.ts id (or undefined).
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, dampAngle, wrapAngle, type CreatureFx } from '../rig';
import { Animator, FOOT, type AnimParams, type Clip, type Pose } from '../animator';
import { dissolve } from '../fade';
import { addFur, type Fur, type FurSpec } from '../fur';
import type { CreatureCtx, GroundItem } from '../types';
import type { CryptidModel } from './kit';
import type { BoneDef } from '../rig';

/** free pose channels every cryptid clip may write */
export const CH = { BLINK: 0, SAD: 1, FX: 2, RAISE: 3, A: 4, B: 5, C: 6, D: 7 } as const;

/** the public face of a cryptid (spawnNewCryptids returns these) */
export interface NewCryptid {
  readonly id: string;
  readonly name: string;
  /** the item id it loves (src/game/items.ts) */
  readonly favoriteFood: string;
  /** short learnable rules, for the Book of Cryptids */
  readonly rules: readonly string[];
  readonly object: THREE.Object3D;
  readonly pos: THREE.Vector3;
  state: string;
  /** 0 wary .. 1 befriended */
  trust: number;
  update(ctx: CreatureCtx): void;
  /** the player holds `item` out to it: true when it takes it */
  offer(item: string): boolean;
}

/** 0 night .. 1 day (as hound.ts daylight) */
export function daylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return Math.min(clamp((h - 5) / 2.2, 0, 1), clamp((21 - h) / 2.2, 0, 1));
}
export const isNight = (hour: number) => daylight(hour) < 0.35;

export interface LegSpec {
  up: string; lo: string; foot: string;
  /** the metatarsus of a digitigrade hind leg (the hock IK path) */
  mid?: string;
  /** fore legs bend their elbow back; hind legs and biped knees bend forward */
  fore?: boolean;
}
interface Leg { up: number; lo: number; mid: number; foot: number; ankle: THREE.Vector3; hock: THREE.Vector3; fore: boolean }

/** clip-writing helpers over a bone list */
export function clipKit(defs: BoneDef[]) {
  const I = (n: string) => defs.findIndex((b) => b.name === n);
  const R = (p: Pose, b: number, x: number, y = 0, z = 0) => { if (b < 0) return; p.r[b * 3] += x; p.r[b * 3 + 1] += y; p.r[b * 3 + 2] += z; };
  const F = (p: Pose, k: number, dx: number, dy: number, dz: number, w = 1, pitch = 0) => { const o = k * FOOT; if (o >= p.f.length) return; p.f[o] += dx; p.f[o + 1] += dy; p.f[o + 2] += dz; p.f[o + 3] = w; p.f[o + 4] += pitch; };
  /** a gait: every leg on a foot cycle (offsets per leg), stride (m), lift (m) */
  const gait = (p: Pose, ph: number, duty: number, stride: number, lift: number, offs: number[], dir = 1) => {
    for (let k = 0; k < offs.length; k++) {
      const s = ((ph + offs[k]) % 1 + 1) % 1;
      let dz: number, l: number;
      if (s < duty) { dz = 1 - 2 * (s / duty); l = 0; } else { const q = (s - duty) / (1 - duty), e = q * q * (3 - 2 * q); dz = -1 + 2 * e; l = Math.sin(Math.PI * q); }
      F(p, k, 0, l * lift, dz * stride * duty * 0.5 * dir, 1, -l * 0.5 * dir);
    }
  };
  return { I, R, F, gait };
}

const _e = new THREE.Euler(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export abstract class Cryptid implements NewCryptid {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly favoriteFood: string;
  abstract readonly rules: readonly string[];
  /** sound-bank id per event */
  abstract readonly sounds: Record<string, string | undefined>;
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: Skel;
  readonly anim: Animator;
  readonly fx: CreatureFx;
  readonly model: CryptidModel;
  /** its shell fur (src/creatures/fur), grown from the model's fur page */
  readonly fur: Fur | null;
  /** dithered dissolve 0 gone .. 1 solid */
  readonly fade: { value: number };
  readonly pos = new THREE.Vector3();
  heading = 0; speed = 0;
  state = 'idle';
  trust = 0;
  /** where it lives (its den, tree, patch) */
  readonly home = new THREE.Vector3();
  /** the test page drives clips by hand */
  manual: string | null = null;
  protected params: AnimParams = { speed: 0, phase: 0, lookYaw: 0, lookPitch: 0 };
  protected legs: Leg[] = [];
  protected bi: (n: string) => number;
  /** seconds alive, seconds in the current state */
  protected t = 0; protected st = 0;
  /** steering: where to go, how fast (m/s), arrive radius; a heading to face when standing */
  protected target = new THREE.Vector3(); protected want = 0; protected arrive = 0.35; protected face: number | null = null;
  protected turnK = 2.2;
  /** moving backwards (the teakettler): it faces away from where it goes */
  protected reverse = false;
  /** a clip forced by the AI (a one-shot or a held pose) */
  protected hold: string | null = null;
  /** gait clips and their stride (m per cycle) */
  protected stride: Record<string, number> = {};
  /** speed the test page moves a manual gait clip at */
  protected manualSpeed: Record<string, number> = {};
  /** the player: distance, smoothed speed, last position */
  protected dist = 99; protected pSpeed = 0; protected lastPlayer = new THREE.Vector3();
  /** the head looks at this (world) point, or ahead when null */
  protected lookAt: THREE.Vector3 | null = null;
  protected ground = new Float32Array(4);
  protected ctx!: CreatureCtx;
  protected blinkT = 2; protected blinkK = 0;
  /** eye-shine strength at night */
  protected shineK = 0.6;
  /** foot sound for 'step' events */
  protected stepSound: string | undefined = undefined;
  protected bodyLift = 0;

  constructor(m: CryptidModel, clips: Record<string, Clip>, o: { legs: LegSpec[]; shineCol?: number; pos?: THREE.Vector3; heading?: number; nc?: number; fur?: Omit<FurSpec, 'mask'> }) {
    this.model = m;
    this.skel = new Skel(m.bones);
    const { mat, depth, fx } = creatureMaterial(m.tex, m.sd, { shineCol: o.shineCol ?? 0xc8ff9a });
    this.fx = fx;
    this.mesh = this.skel.mesh(m.geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.customDepthMaterial = depth; this.mesh.frustumCulled = false;
    this.object.add(this.mesh);
    // fur grows only where the model painted a fur page
    this.fur = o.fur && m.fur ? addFur(this.mesh, { ...o.fur, mask: m.fur }) : null;
    this.fade = dissolve(mat, depth, ...(this.fur?.materials ?? []));
    this.anim = new Animator(clips, this.skel.bones.length, o.legs.length, o.nc ?? 8);
    this.anim.play(clips.idle ? 'idle' : Object.keys(clips)[0]);
    const S = this.skel;
    this.bi = (n: string) => S.i(n);
    this.legs = o.legs.map((L) => {
      const foot = S.i(L.foot), mid = L.mid ? S.i(L.mid) : -1;
      return { up: S.i(L.up), lo: S.i(L.lo), mid, foot, ankle: S.restWorld[foot].clone(), hock: mid >= 0 ? S.restWorld[mid].clone() : new THREE.Vector3(), fore: !!L.fore };
    });
    if (o.pos) { this.pos.copy(o.pos); this.home.copy(o.pos); }
    this.heading = o.heading ?? 0;
  }
  get clips(): string[] { return Object.keys(this.anim.clips); }
  /** the test page: play a clip by hand (null hands back to the AI) */
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip].loop }); }

  // ---------------------------------------------------------------------------------------------- per frame
  update(ctx: CreatureCtx) {
    this.ctx = ctx;
    const dt = Math.min(0.1, Math.max(0, ctx.dt)); this.t += dt; this.st += dt;
    const P = ctx.player;
    this.dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const ps = P.speed ?? (this.lastPlayer.lengthSq() > 0 && dt > 0 ? Math.hypot(P.pos.x - this.lastPlayer.x, P.pos.z - this.lastPlayer.z) / dt : 0);
    this.pSpeed = damp(this.pSpeed, Math.min(12, ps), 6, dt); this.lastPlayer.copy(P.pos);
    if (!this.manual) this.think(ctx, dt);
    this.move(ctx, dt);
    this.fx.shine.value = (1 - daylight(ctx.hour)) * (P.light ? 0.9 : 0.35) * this.shineK;
    this.animate(ctx, dt);
    this.after(ctx, dt);
    this.object.visible = this.fade.value > 0.01;
    if (this.fur && this.object.visible) this.fur.update(dt);
  }
  protected abstract think(ctx: CreatureCtx, dt: number): void;
  /** the locomotion clip for the state and speed (when nothing is held) */
  protected abstract clipFor(speed: number): string;
  abstract offer(item: string): boolean;
  /** hooks: bone tweaks before FK (blinks, sacs, ears), after IK (props in hands), after everything (particles) */
  protected pre(_p: Pose) { /* */ }
  protected postIK(_p: Pose) { /* */ }
  protected after(_ctx: CreatureCtx, _dt: number) { /* */ }

  protected go(s: string) { if (s !== this.state) { this.state = s; this.st = 0; this.hold = null; this.holdEnd = -1; } }
  /** when the held one-shot ends (creature seconds; -1 for a held loop) */
  protected holdEnd = -1;
  /** a one-shot clip, held until it ends (then the hold lets go by itself) */
  protected once(clip: string) { this.hold = clip; this.holdEnd = this.t + this.anim.clips[clip].dur; this.anim.play(clip, { restart: true }); }
  /** hold a one-shot that is already playing (an animator `next`), without restarting it */
  protected holdClip(clip: string) { this.hold = clip; this.holdEnd = this.t + this.anim.clips[clip].dur; this.anim.play(clip); }
  protected get holdDone() { return this.hold !== null && this.holdEnd >= 0 && this.t >= this.holdEnd; }
  /** raise trust; true the moment it reaches 1 (befriended) */
  protected gainTrust(k: number) { const was = this.trust; this.trust = Math.min(1, this.trust + k); return was < 1 && this.trust >= 1; }
  protected emit(ev: string, extra: Record<string, unknown> = {}) {
    this.ctx?.emit(ev, { pos: this.object.position.clone(), who: this.id, sound: this.sounds[ev], ...extra });
  }
  /** the angle (rad) between the player's look and the line to this creature (0 = dead centre) */
  protected viewAngle(ctx: CreatureCtx, at: THREE.Vector3 = this.pos): number {
    const P = ctx.player, dx = at.x - P.pos.x, dz = at.z - P.pos.z, l = Math.hypot(dx, dz) || 1, dl = Math.hypot(P.dir.x, P.dir.z) || 1;
    return Math.acos(clamp((dx * P.dir.x + dz * P.dir.z) / (l * dl), -1, 1));
  }
  /** a loose item of a kind near a point */
  protected itemNear(ctx: CreatureCtx, kind: RegExp, at: THREE.Vector3, r: number): GroundItem | null {
    let best: GroundItem | null = null, bd = r;
    for (const it of ctx.items ?? []) { if (!kind.test(it.kind)) continue; const d = Math.hypot(it.pos.x - at.x, it.pos.z - at.z); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  /** a point d metres from the player along the line from the player through this creature (away from them) */
  protected awayFrom(from: THREE.Vector3, d: number, out = new THREE.Vector3()) {
    const a = Math.atan2(this.pos.x - from.x, this.pos.z - from.z);
    return out.set(this.pos.x + Math.sin(a) * d, 0, this.pos.z + Math.cos(a) * d);
  }
  protected faceToward(p: THREE.Vector3) { this.face = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  protected move(ctx: CreatureCtx, dt: number) {
    if (this.manual) this.speed = this.manualSpeed[this.manual] ?? 0;
    else {
      const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
      let w = d < this.arrive ? 0 : this.want;
      const dirA = Math.atan2(tx, tz) + (this.reverse ? Math.PI : 0);
      if (w > 0) this.heading = dampAngle(this.heading, dirA, this.turnK, dt);
      else if (this.face !== null) this.heading = dampAngle(this.heading, this.face, this.turnK * 0.6, dt);
      w *= clamp(1.25 - Math.abs(wrapAngle(dirA - this.heading)) * 0.55, 0.15, 1);
      this.speed = damp(this.speed, w, w > this.speed ? 3 : 5, dt);
      const s = this.reverse ? -1 : 1;
      this.pos.x += Math.sin(this.heading) * this.speed * dt * s; this.pos.z += Math.cos(this.heading) * this.speed * dt * s;
    }
    this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.object.position.copy(this.pos); this.object.rotation.set(0, this.heading, 0);
  }

  protected animate(ctx: CreatureCtx, dt: number) {
    const a = this.params, sp = this.speed;
    // a finished one-shot lets go (its `next` clip or the locomotion takes over)
    if (this.hold && this.holdEnd >= 0 && this.t > this.holdEnd + 0.1) { this.hold = null; this.holdEnd = -1; }
    if (this.hold && this.holdEnd < 0 && !this.anim.clips[this.hold]?.loop) this.holdEnd = this.t + (this.anim.clips[this.hold]?.dur ?? 0) - this.anim.time;
    const clip = this.manual ?? this.hold ?? this.clipFor(sp);
    this.anim.play(clip);
    const cur = this.anim.current, str = this.stride[cur];
    if (str) {
      const before = a.phase; a.phase = (a.phase + (sp / str) * dt) % 1;
      if (Math.floor(before * 2) !== Math.floor(a.phase * 2) && sp > 0.2) ctx.emit('step', { pos: this.object.position.clone(), who: this.id, sound: this.stepSound });
    }
    a.speed = sp;
    // the look: toward lookAt (the player's eyes by default when near), else ahead
    const L = this.lookAt ?? (this.dist < 25 ? ctx.player.pos : null);
    if (L) {
      const yaw = wrapAngle(Math.atan2(L.x - this.pos.x, L.z - this.pos.z) - this.heading);
      const head = this.skel.restWorld[0].y + this.pos.y;
      const pitch = Math.atan2(L.y - head, Math.max(0.5, Math.hypot(L.x - this.pos.x, L.z - this.pos.z)));
      a.lookYaw = damp(a.lookYaw, Math.abs(yaw) < 2.2 ? clamp(yaw, -1.1, 1.1) : 0, 4, dt);
      a.lookPitch = damp(a.lookPitch, clamp(pitch, -0.6, 0.6), 4, dt);
    } else { a.lookYaw = damp(a.lookYaw, 0, 3, dt); a.lookPitch = damp(a.lookPitch, 0, 3, dt); }
    const p = this.anim.update(dt, a);
    // blinks
    this.blinkT -= dt; if (this.blinkT < 0) { this.blinkK = 0.16; this.blinkT = 2.2 + Math.random() * 4.5; }
    this.blinkK = Math.max(0, this.blinkK - dt);
    p.c[CH.BLINK] = Math.max(p.c[CH.BLINK], this.blinkK > 0 ? 1 : 0);
    // feet on the ground: each foot's terrain height relative to the body's
    for (let k = 0; k < this.legs.length && k < 4; k++) {
      const an = this.legs[k].ankle, c = Math.cos(this.heading), s = Math.sin(this.heading);
      const wx = this.pos.x + an.x * c + an.z * s, wz = this.pos.z - an.x * s + an.z * c;
      this.ground[k] = clamp(ctx.heightAt(wx, wz) - this.pos.y, -0.4, 0.4);
    }
    this.applyPose(p);
  }

  protected applyPose(p: Pose) {
    const S = this.skel, B = S.bones, n = Math.min(4, this.legs.length);
    S.rest();
    let lift = 0; for (let k = 0; k < n; k++) lift += this.ground[k]; lift = n ? lift / n : 0;
    const slope = this.legs.length >= 4 ? Math.atan2((this.ground[0] + this.ground[1]) * 0.5 - (this.ground[2] + this.ground[3]) * 0.5, Math.max(0.3, this.legs[0].ankle.z - this.legs[2].ankle.z)) : 0;
    const root = B[0];
    root.position.x += p.t[0]; root.position.y += p.t[1] + lift + this.bodyLift; root.position.z += p.t[2];
    root.quaternion.setFromEuler(_e.set(p.rr[0] - slope, p.rr[1], p.rr[2]));
    for (let i = 1; i < B.length; i++) {
      const x = p.r[i * 3], y = p.r[i * 3 + 1], z = p.r[i * 3 + 2];
      if (x !== 0 || y !== 0 || z !== 0) B[i].quaternion.setFromEuler(_e.set(x, y, z));
    }
    this.pre(p);
    S.fk();
    for (let k = 0; k < this.legs.length; k++) {
      const L = this.legs[k], o = k * FOOT, w = clamp(p.f[o + 3], 0, 1);
      if (w < 0.002) continue;
      const par = S.defs[L.up].parent;
      _t.set(L.ankle.x + p.f[o], L.ankle.y + p.f[o + 1] + (k < 4 ? this.ground[k] : 0) - lift, L.ankle.z + p.f[o + 2]);
      const fwd = _v.set(0, 0, 1).applyQuaternion(S.Q[par]);
      const yawQ = _q.setFromAxisAngle(UP, Math.atan2(fwd.x, fwd.z));
      _pole.set(0, 0, L.fore ? -1 : 1).applyQuaternion(yawQ);
      if (L.mid < 0) {
        S.ik2(L.up, L.lo, L.foot, _t, _pole, w);
        const want = new THREE.Quaternion().copy(yawQ).multiply(_q2.setFromEuler(_e.set(p.f[o + 4], 0, 0)));
        S.orient(L.foot, want.slerp(S.Q[L.foot].clone(), 1 - w));
      } else {
        const qm = new THREE.Quaternion().copy(yawQ).multiply(_q2.setFromEuler(_e.set(-p.f[o + 4], 0, 0)));
        const hockT = _w.copy(L.ankle).sub(L.hock).applyQuaternion(qm).multiplyScalar(-1).add(_t);
        S.ik2(L.up, L.lo, L.mid, hockT, _pole, w);
        const fkm = S.Q[L.mid].clone();
        S.orient(L.mid, qm.slerp(fkm, 1 - w));
        S.fk1(L.foot);
        const fkf = S.Q[L.foot].clone();
        S.orient(L.foot, new THREE.Quaternion().copy(yawQ).multiply(_q2.setFromEuler(_e.set(clamp(p.f[o + 4] * 0.4, -0.5, 0.6), 0, 0))).slerp(fkf, 1 - w));
      }
    }
    // children of the legs (toes) follow their parents
    for (let i = 0; i < B.length; i++) { const par = S.defs[i].parent; if (par >= 0 && this.isLegChild(i)) S.fk1(i); }
    this.postIK(p);
  }
  private legChild: Uint8Array | null = null;
  private isLegChild(i: number): boolean {
    if (!this.legChild) {
      const S = this.skel, f = new Uint8Array(S.bones.length), leg = new Set<number>();
      for (const L of this.legs) { leg.add(L.foot); }
      for (let k = 0; k < S.bones.length; k++) { const par = S.defs[k].parent; if (par >= 0 && (leg.has(par) || f[par])) f[k] = 1; }
      this.legChild = f;
    }
    return !!this.legChild[i];
  }
  /** a bone's model-space position (after applyPose) in world space */
  protected boneWorld(name: string, out = new THREE.Vector3()) {
    const k = this.bi(name);
    return out.copy(this.skel.P[k]).applyQuaternion(_q.setFromAxisAngle(UP, this.heading)).add(this.object.position);
  }
  /** set a bone (whose parent is the root) so its model-space position is a world point */
  protected placeBone(name: string, world: THREE.Vector3, rot?: THREE.Quaternion) {
    const S = this.skel, k = this.bi(name), par = S.defs[k].parent;
    const local = _t.copy(world).sub(this.object.position).applyQuaternion(_q.setFromAxisAngle(UP, -this.heading));
    // into the parent's frame
    local.sub(S.P[par]).applyQuaternion(_q2.copy(S.Q[par]).invert());
    S.bones[k].position.copy(local);
    if (rot) S.bones[k].quaternion.copy(_q2.copy(S.Q[par]).invert().multiply(_q.setFromAxisAngle(UP, -this.heading).multiply(rot)));
    S.fk1(k);
  }
}
export { clamp, damp, dampAngle, wrapAngle };
export type { Pose, Clip, AnimParams };
