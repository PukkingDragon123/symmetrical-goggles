// THE GUMBEROO: a big round rubbery hairless creature of the old burn (SPOTS.burn). Model in gumberoo/model.ts.
//
//   const g = new Gumberoo({ pos }); scene.add(g.object); g.update(ctx);   // ctx.fires: optional fire positions
//
// Rules (learnable, never cruel):
//   graze   it wanders the burn grazing on fireweed, placid; sleeps flat on its belly late at night
//   watch   when the player comes near it stops and stares, and shuffles off if crowded
//   hit     anything that strikes it bounces off: an axe swing at it within reach -> 'deflect' (the axe springs back,
//           { impulse } toward the player) and the whole body wobbles like a jelly
//   angry   strike it (or barge into it) and it charges, then rams with its belly and bounces the player away
//           ('bounce' with { impulse }); it calms down after a while if left alone
//   flee    fire is the one thing it fears: a campfire (ctx.fires), a torch or lantern held near it -> it squeals and
//           waddles off as fast as it can
// Events (ctx.emit(ev, { pos, who: 'gumberoo', sound, ... })): boing, deflect, bounce, squeak, grunt, step.
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, dampAngle, wrapAngle, type CreatureFx } from './rig';
import { Animator, FOOT, TAU, sin, cos, env, wander, footCycle, type AnimParams, type Clip, type Pose } from './animator';
import { buildGumberooModel, buildGumberooModelAsync, gumberooBones, GUMBEROO_MODEL_VERSION, type GumberooModel } from './gumberoo/model';
import { loader } from './cache';
import { registerPreload } from './preload';
import { daylight } from './hound';
import { SPOTS } from '../world/layout';
import { setPusher } from '../gfx/globals';
import type { CreatureCtx } from './types';

export const GUMBEROO_SOUND: Record<string, string | undefined> = { boing: 'gumberoo_boing', deflect: 'gumberoo_boing', bounce: 'gumberoo_boing', squeak: 'gumberoo_squeak', grunt: 'gumberoo_squeak', scorch: 'gumberoo_deflate' };
const GM = loader<GumberooModel>(GUMBEROO_MODEL_VERSION, () => buildGumberooModelAsync(), (b, m) => ({ ...b, bones: gumberooBones(), tris: m.tris as number, den: m.den as number, stats: m.stats as string }), (m) => ({ tris: m.tris, den: m.den, stats: m.stats }));
export function gumberooModel(): GumberooModel { let m = GM.get(); if (!m) { m = buildGumberooModel(); GM.set(m); } return m; }
export const gumberooModelAsync = (o: { cache?: boolean } = {}) => GM.load(o);
registerPreload('gumberoo', gumberooModelAsync);

export type GumberooState = 'graze' | 'watch' | 'angry' | 'flee' | 'sleep';
const CH_SQUASH = 0, CH_BLINK = 1;
const STRIDE: Record<string, number> = { walk: 0.7, charge: 1.3, flee: 1.2 };
const FIRE_ITEMS = /torch|lantern|flare|fire|brand/;

function gumberooClips(bones: { name: string }[]): Record<string, Clip> {
  const I = (n: string) => bones.findIndex((b) => b.name === n);
  const H = I('head'), JW = I('jaw'), T = I('tail'), BE = I('belly');
  const R = (p: Pose, b: number, x: number, y = 0, z = 0) => { p.r[b * 3] += x; p.r[b * 3 + 1] += y; p.r[b * 3 + 2] += z; };
  const foot = (p: Pose, k: number, dx: number, dy: number, dz: number, w = 1) => { const o = k * FOOT; p.f[o] += dx; p.f[o + 1] += dy; p.f[o + 2] += dz; p.f[o + 3] = w; };
  const gait = (p: Pose, ph: number, duty: number, stride: number, lift: number) => { for (let k = 0; k < 4; k++) { const [dz, l] = footCycle(ph + [0, 0.5, 0.5, 0][k], duty); foot(p, k, 0, l * lift, dz * stride * duty * 0.5); } };
  const look = (p: Pose, a: AnimParams) => R(p, H, -a.lookPitch * 0.4, a.lookYaw * 0.5);
  return {
    idle: { loop: true, dur: 8, fade: 0.5, fn: (p, t, a) => {
      p.c[CH_SQUASH] += 0.03 * sin(t * 0.3 * TAU); p.t[0] += 0.02 * wander(t * 0.4, 1); p.rr[2] += 0.03 * wander(t * 0.3, 2);
      // grazing: the blunt face down to the fireweed, chewing
      const g = env(t % 8, 2, 2.6, 5, 5.6);
      R(p, H, 0.4 * g); R(p, JW, g * Math.max(0, sin(t * 7)) * 0.12); p.rr[0] += 0.08 * g;
      R(p, T, 0, 0.3 * sin(t * 1.4)); look(p, a);
    } },
    walk: { loop: true, dur: 1, fade: 0.4, fn: (p, t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.62, STRIDE.walk, 0.08);
      // the waddle: the whole round body rolls from side to side, a little wobble at each footfall
      p.rr[2] += 0.09 * sin(w); p.t[0] += 0.03 * sin(w); p.t[1] += 0.015 * cos(w * 2); p.c[CH_SQUASH] += 0.04 * cos(w * 2);
      R(p, BE, 0, 0, -0.08 * sin(w - 0.6)); R(p, T, 0, 0.35 * sin(w)); R(p, H, 0.05, 0.05 * sin(w + 1)); look(p, a);
    } },
    charge: { loop: true, dur: 1, fade: 0.25, fn: (p, t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.45, STRIDE.charge, 0.18);
      p.t[1] += 0.05 * Math.abs(sin(w)); p.c[CH_SQUASH] += 0.14 * cos(w * 2); p.rr[0] += 0.1 + 0.05 * sin(w * 2); p.rr[2] += 0.05 * sin(w);
      R(p, H, 0.25); R(p, JW, 0.35 + 0.05 * sin(w * 2)); R(p, T, 0, 0.5 * sin(w * 2));
    } },
    flee: { loop: true, dur: 1, fade: 0.25, fn: (p, t, a) => {
      const w = a.phase * TAU;
      gait(p, a.phase, 0.48, STRIDE.flee, 0.16);
      p.t[1] += 0.04 * Math.abs(sin(w)); p.c[CH_SQUASH] += 0.1 * cos(w * 2) + 0.06; p.rr[2] += 0.1 * sin(w);
      R(p, H, -0.2, 0.3 * sin(w * 0.5)); R(p, JW, 0.5); R(p, T, 0.4); p.c[CH_BLINK] = 0.3;
    } },
    hit: { loop: false, dur: 1.1, fade: 0.06, next: 'idle', fn: (p, t) => {
      // struck: the body takes the blow like a ball (the spring does the wobble), the eyes squeeze shut
      const k = env(t, 0, 0.05, 0.3, 1.0);
      R(p, H, 0.2 * k, 0.2 * k); p.c[CH_BLINK] = k; p.t[2] -= 0.06 * k; R(p, JW, 0.15 * k);
    } },
    bounce: { loop: false, dur: 1.0, fade: 0.08, next: 'idle', fn: (p, t) => {
      // the ram: it crouches, bulges forward belly-first, then springs back
      const crouch = env(t, 0, 0.18, 0.2, 0.3), ram = env(t, 0.22, 0.32, 0.4, 0.75);
      p.c[CH_SQUASH] += -0.3 * crouch + 0.25 * ram; p.t[2] += 0.42 * ram - 0.05 * crouch; p.t[1] += 0.06 * ram;
      R(p, BE, -0.25 * ram); R(p, H, -0.3 * ram); R(p, JW, 0.3 * ram);
      foot(p, 0, 0, 0, 0.12 * ram); foot(p, 1, 0, 0, 0.12 * ram);
    } },
    sleep: { loop: true, dur: 10, fade: 1.2, fn: (p, t) => {
      // flat on its belly like a dropped pudding, legs splayed, slow deep breaths
      const b = sin(t * 0.18 * TAU);
      p.t[1] -= 0.36; p.c[CH_SQUASH] += -0.18 + 0.05 * b; p.c[CH_BLINK] = 1; R(p, H, 0.2, 0, 0.1);
      for (let k = 0; k < 4; k++) foot(p, k, (k % 2 ? -1 : 1) * 0.16, 0, (k < 2 ? 0.12 : -0.12));
      R(p, T, 0, 0.6);
    } },
  };
}

const _e = new THREE.Euler(), _t = new THREE.Vector3(), _pole = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
export class Gumberoo {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: Skel;
  readonly anim: Animator;
  readonly fx: CreatureFx;
  readonly model: GumberooModel;
  state: GumberooState = 'graze';
  readonly pos = new THREE.Vector3(); heading = 0; speed = 0;
  /** 0 placid .. 1 furious */
  anger = 0;
  manual: string | null = null;
  private params: AnimParams = { speed: 0, phase: 0, lookYaw: 0, lookPitch: 0 };
  private legs: { up: number; lo: number; foot: number; ankle: THREE.Vector3 }[];
  private t = 0; private st = 0; private next = 0; private target = new THREE.Vector3(); private want = 0; private hold: string | null = null;
  private sq = 0; private sqv = 0; private lastPlayer = new THREE.Vector3(); private pSpeed = 0; private lastSwing = -9; private blink = 0; private blinkT = 3;
  constructor(o: { pos?: THREE.Vector3; heading?: number; model?: GumberooModel } = {}) {
    const m = o.model ?? gumberooModel(); this.model = m;
    this.skel = new Skel(m.bones);
    const { mat, depth, fx } = creatureMaterial(m.tex, m.sd, { shineCol: 0xffc060 }); this.fx = fx;
    this.mesh = this.skel.mesh(m.geo, mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.customDepthMaterial = depth; this.mesh.frustumCulled = false;
    this.object.add(this.mesh); this.object.name = 'Gumberoo';
    this.anim = new Animator(gumberooClips(this.skel.defs), this.skel.bones.length, 4);
    this.anim.play('idle');
    const S = this.skel;
    this.legs = ['fL', 'fR', 'hL', 'hR'].map((n) => ({ up: S.i(n[0] + 'u' + n[1]), lo: S.i(n[0] + 'l' + n[1]), foot: S.i(n[0] + 'f' + n[1]), ankle: S.restWorld[S.i(n[0] + 'f' + n[1])].clone() }));
    if (o.pos) this.pos.copy(o.pos); else this.pos.set(SPOTS.burn.x, 0, SPOTS.burn.z);
    this.heading = o.heading ?? 0;
  }
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip].loop }); if (clip === 'hit') this.kick(-0.45); if (clip === 'bounce') this.kick(0.2); }
  get clips(): string[] { return Object.keys(this.anim.clips); }
  /** an impulse into the body's squash spring (- flattens, + stretches) */
  kick(v: number) { this.sqv += v * 9; }

  update(ctx: CreatureCtx) {
    const dt = Math.min(0.1, Math.max(0, ctx.dt)); this.t += dt; this.st += dt;
    const P = ctx.player, dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const ps = P.speed ?? (this.lastPlayer.lengthSq() > 0 && dt > 0 ? Math.hypot(P.pos.x - this.lastPlayer.x, P.pos.z - this.lastPlayer.z) / dt : 0);
    this.pSpeed = damp(this.pSpeed, Math.min(12, ps), 6, dt); this.lastPlayer.copy(P.pos);
    if (!this.manual) this.think(ctx, dt, dist);
    this.move(ctx, dt);
    this.fx.shine.value = (1 - daylight(ctx.hour)) * (P.light ? 0.8 : 0.3);
    this.animate(ctx, dt);
    setPusher(3, this.object.position.x, this.object.position.y, this.object.position.z, 1.1);
  }
  private go(s: GumberooState) { if (s !== this.state) { this.state = s; this.st = 0; this.hold = null; } }
  private think(ctx: CreatureCtx, dt: number, dist: number) {
    const P = ctx.player, me = this.object.position.clone();
    const emit = (ev: string, x: Record<string, unknown> = {}) => ctx.emit(ev, { pos: me, who: 'gumberoo', sound: GUMBEROO_SOUND[ev], ...x });
    const away = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
    this.anger = Math.max(0, this.anger - dt * 0.07);
    // fire first: a campfire nearby or a burning thing in the player's hand
    let fire: THREE.Vector3 | null = null;
    for (const f of ctx.fires ?? []) if (Math.hypot(f.x - this.pos.x, f.z - this.pos.z) < 14) fire = f;
    if (!fire && FIRE_ITEMS.test(P.held) && dist < 8) fire = P.pos;
    if (fire && this.state !== 'flee') { this.go('flee'); this.anger = 0; emit('squeak'); this.kick(-0.3); }
    // struck: an axe swing at it within reach bounces off
    const toMe = _v.set(this.pos.x - P.pos.x, 0, this.pos.z - P.pos.z).normalize();
    const facing = P.dir.x * toMe.x + P.dir.z * toMe.z;
    if ((P.action === 'swing' || P.action === 'chop') && dist < 2.8 && facing > 0.55 && this.t - this.lastSwing > 0.6) {
      this.lastSwing = this.t; this.kick(-0.55);
      emit('boing'); emit('deflect', { impulse: new THREE.Vector3(-toMe.x * 6, 2, -toMe.z * 6) });
      this.anger = Math.min(1, this.anger + 0.6); this.hold = 'hit'; this.anim.play('hit', { restart: true });
      if (this.state !== 'flee') { this.go('angry'); this.st = -1.1; }
    }
    // barged into
    if (dist < 1.5 && this.pSpeed > 3 && this.state !== 'flee' && this.state !== 'angry') { this.anger = Math.min(1, this.anger + 0.5); this.go('angry'); emit('grunt'); }
    switch (this.state) {
      case 'flee': {
        const from = fire ?? P.pos;
        const a = Math.atan2(this.pos.x - from.x, this.pos.z - from.z);
        this.target.set(this.pos.x + Math.sin(a) * 10, 0, this.pos.z + Math.cos(a) * 10); this.want = 3.2;
        if (Math.random() < dt * 1.2) emit('squeak');
        if (!fire && this.st > 4) this.go('graze');
        break;
      }
      case 'angry': {
        if (this.st < 0) { this.want = 0; break; }       // still reeling from the blow
        if (this.hold === 'bounce') { this.want = 0; if (this.anim.done || this.st > 1.1) { this.hold = null; this.st = 0.01; } break; }
        this.target.set(P.pos.x, 0, P.pos.z); this.want = 4.2;
        if (dist < 1.9) {
          this.hold = 'bounce'; this.st = 0; this.anim.play('bounce', { restart: true }); this.kick(0.25);
          emit('bounce', { impulse: new THREE.Vector3(-toMe.x * 9, 3.5, -toMe.z * 9) });
          this.anger -= 0.25;
        }
        if (this.anger <= 0.05 || dist > 30) this.go('graze');
        break;
      }
      case 'sleep': {
        this.want = 0; this.hold = 'sleep';
        if (!(ctx.hour > 23 || ctx.hour < 5) || dist < 3) { this.go('watch'); emit('grunt'); }
        break;
      }
      case 'watch': {
        this.want = 0; this.hold = null;
        if (dist > 14) this.go('graze');
        else if (dist < 4 && this.st > 3) { this.target.set(P.pos.x + Math.sin(away) * 9, 0, P.pos.z + Math.cos(away) * 9); this.want = 0.8; }
        break;
      }
      default: {
        if ((ctx.hour > 23 || ctx.hour < 5) && dist > 6) { this.go('sleep'); break; }
        if (dist < 10) { this.go('watch'); break; }
        // graze: amble to a new patch in the burn now and then
        if (this.st > this.next) {
          this.next = this.st + 6 + Math.random() * 10;
          const B = SPOTS.burn, a = Math.random() * TAU, d = Math.random() * B.r * 0.8;
          const hx = this.pos.x + (Math.random() - 0.5) * 16, hz = this.pos.z + (Math.random() - 0.5) * 16;
          const home = Math.hypot(hx - B.x, hz - B.z) > B.r;
          this.target.set(home ? B.x + Math.sin(a) * d : hx, 0, home ? B.z + Math.cos(a) * d : hz);
          if (Math.random() < 0.3) emit('grunt');
        }
        const d2 = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
        this.want = d2 > 0.6 ? 0.7 : 0;
      }
    }
  }
  private move(ctx: CreatureCtx, dt: number) {
    if (this.manual) this.speed = this.manual === 'walk' ? 0.7 : this.manual === 'charge' ? 4 : this.manual === 'flee' ? 3.2 : 0;
    else {
      const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
      let w = d < 0.3 ? 0 : this.want;
      if (w > 0) this.heading = dampAngle(this.heading, Math.atan2(tx, tz), this.state === 'angry' ? 2.5 : 1.6, dt);
      else if (this.state === 'watch' || this.state === 'angry') this.heading = dampAngle(this.heading, Math.atan2(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z), 1.2, dt);
      w *= clamp(1.2 - Math.abs(wrapAngle(Math.atan2(tx, tz) - this.heading)) * 0.5, 0.3, 1);
      this.speed = damp(this.speed, w, w > this.speed ? 2 : 4, dt);
      this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
    }
    this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.object.position.copy(this.pos); this.object.rotation.set(0, this.heading, 0);
  }
  private animate(ctx: CreatureCtx, dt: number) {
    const a = this.params, sp = this.speed;
    let clip = this.manual ?? this.hold ?? (sp < 0.1 ? 'idle' : this.state === 'angry' ? 'charge' : this.state === 'flee' ? 'flee' : 'walk');
    if (!this.manual && !this.hold && sp > 0.1) clip = this.state === 'angry' ? 'charge' : this.state === 'flee' ? 'flee' : 'walk';
    this.anim.play(clip);
    const cur = this.anim.current;
    if (STRIDE[cur]) {
      const before = a.phase; a.phase = (a.phase + (sp / STRIDE[cur]) * dt) % 1;
      if (Math.floor(before * 2) !== Math.floor(a.phase * 2)) { this.kick(-0.06 - sp * 0.02); ctx.emit('step', { pos: this.object.position.clone(), who: 'gumberoo', heavy: true }); }
    }
    const P = ctx.player, yaw = wrapAngle(Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.heading);
    a.lookYaw = damp(a.lookYaw, Math.abs(yaw) < 2 ? clamp(yaw, -0.8, 0.8) : 0, 3, dt); a.lookPitch = damp(a.lookPitch, 0, 3, dt);
    const p = this.anim.update(dt, a);
    // the rubber: a stiff, lively spring on the squash (volume-preserving scale of the whole body)
    const target = p.c[CH_SQUASH];
    this.sqv += (-(this.sq - target) * 180 - this.sqv * 7) * dt; this.sq += this.sqv * dt;
    this.sq = clamp(this.sq, -0.45, 0.45);
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.2; this.blinkT = 2.5 + Math.random() * 4; } this.blink = Math.max(0, this.blink - dt);
    this.apply(p, Math.max(p.c[CH_BLINK], this.blink > 0 ? 1 : 0));
  }
  private apply(p: Pose, blink: number) {
    const S = this.skel, B = S.bones;
    S.rest();
    const sy = 1 + this.sq, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    B[0].position.x += p.t[0]; B[0].position.y += p.t[1] - (1 - sy) * 0.55; B[0].position.z += p.t[2];
    B[0].quaternion.setFromEuler(_e.set(p.rr[0], p.rr[1], p.rr[2])); B[0].scale.set(sxz, sy, sxz);
    for (let i = 1; i < B.length; i++) { const x = p.r[i * 3], y = p.r[i * 3 + 1], z = p.r[i * 3 + 2]; if (x || y || z) B[i].quaternion.setFromEuler(_e.set(x, y, z)); }
    // eyes: lids are its own rubber, squeezed shut by flattening the eyeballs into the head
    for (const n of ['eyeL', 'eyeR']) B[S.i(n)].scale.set(1, 1 - blink * 0.85, 1);
    // legs: keep the feet unscaled and planted (the legs are children of the squashed root)
    for (let k = 0; k < 4; k++) B[this.legs[k].up].scale.set(1 / sxz, 1 / sy, 1 / sxz);
    S.fk();
    _pole.set(0, 0, 1).applyQuaternion(_q.setFromAxisAngle(_v.set(0, 1, 0), p.rr[1]));
    for (let k = 0; k < 4; k++) {
      const L = this.legs[k], o = k * FOOT, w = clamp(p.f[o + 3], 0, 1);
      if (w < 0.01) continue;
      _t.set(L.ankle.x + p.f[o], L.ankle.y + p.f[o + 1], L.ankle.z + p.f[o + 2]);
      S.ik2(L.up, L.lo, L.foot, _t, _pole, w);
      S.orient(L.foot, _q.setFromAxisAngle(_v.set(0, 1, 0), p.rr[1]));
    }
  }
}
