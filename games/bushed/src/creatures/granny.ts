// GRANNY TAMARACK: the tall antlered grandmother of the fog. Terrifying to meet; kind. Model in granny/model.ts,
// clips in granny/clips.ts.
//
//   const granny = new GrannyTamarack();               // absent until the fog or the night brings her
//   scene.add(granny.object);
//   granny.update(ctx);                                // every frame (CreatureCtx; reads ctx.fog, ctx.lost, ctx.stove, ctx.trunks)
//   if (granny.offer('cookies')) ...                   // the player holds out oatmeal cookies: true if she takes them
//   granny.appear(at?)                                 // a scripted appearance (near the player if no point is given)
//
// When she comes: in heavy fog (ctx.fog >= 0.55) or at night, and only near the cedar hollow (SPOTS.hollow) or when
// the player is lost far from the cabin (ctx.lost, or more than ~230 m from the cabin and the store). She fades in
// out of the fog 15-30 m off, to one side or behind, and stands watching.
// Rules:
//   watch     she stands still and watches, leaning on her staff, humming now and then; approach slowly and she
//             waits for you; walk away (beyond ~48 m) and she is gone
//   approach  hold out oatmeal cookies (ctx.player.held === 'cookies') and she comes to you, slow on her staff
//   take      offer('cookies') within reach: she takes them, draws them to her chest, bows (never raisin)
//   lead      then she walks you home: at walking pace toward ctx.stove (or the cabin spot); if you lag she stops,
//             turns and beckons until you catch up
//   secret    stand with her a moment while she waits and she points into the trees and tells you something
//             ('secret' { secret: 'chanterelles' | 'lost_axe' | 'bigfoot_stump', dir })
//   farewell  at the edge of the cabin clearing she turns, beckons you on, and fades into the fog
//   vanish    run at her, or put a light in her face, and she turns away, steps back into the fog and is gone
// Events (ctx.emit(ev, { pos, who: 'granny', sound, ... })): hum, beckon, take ({ item }), secret ({ secret, dir }),
// vanish ({ reason: 'fright' | 'home' | 'gone' | 'dawn' }), step. No dedicated sounds yet: `sound` suggests the
// nearest bank ids (GRANNY_SOUND) or is undefined.
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, dampAngle, wrapAngle, type CreatureFx } from './rig';
import { Animator, FOOT, type AnimParams, type Pose } from './animator';
import { buildGrannyModel, buildGrannyModelAsync, grannyBones, eyeAt, GRANNY_MODEL_VERSION, GT, type GrannyModel } from './granny/model';
import { grannyClips, CH_LID, CH_HUM, STRIDE, STAFF, TAKE_AT } from './granny/clips';
import { dissolve } from './fade';
import { loader } from './cache';
import { registerPreload } from './preload';
import { daylight } from './hound';
import { SPOTS } from '../world/layout';
import { setPusher } from '../gfx/globals';
import type { CreatureCtx } from './types';

/** suggested sound-bank ids (none of her own yet; undefined = silent until one exists) */
export const GRANNY_SOUND: Record<string, string | undefined> = { hum: undefined, beckon: 'foliage_rustle', take: 'paper_rustle', secret: undefined, vanish: 'branch_swish', step: 'foot_forest' };
export type GrannyState = 'absent' | 'appear' | 'watch' | 'approach' | 'take' | 'lead' | 'pause' | 'secret' | 'farewell' | 'vanish';
export type GrannySecret = 'chanterelles' | 'lost_axe' | 'bigfoot_stump';
const GM = loader<GrannyModel>(GRANNY_MODEL_VERSION, () => buildGrannyModelAsync(), (b, m) => ({ ...b, bones: grannyBones(), tris: m.tris as number, den: m.den as number, stats: m.stats as string }), (m) => ({ tris: m.tris, den: m.den, stats: m.stats }));
/** Granny's shared model: preloaded (grannyModelAsync / preloadCreatures) or built now (blocks) */
export function grannyModel(): GrannyModel { let m = GM.get(); if (!m) { m = buildGrannyModel(); GM.set(m); } return m; }
export const grannyModelAsync = (o: { cache?: boolean } = {}) => GM.load(o);
registerPreload('granny', grannyModelAsync);

const COOKIES = /cookie/, RAISIN = /raisin/;
const _e = new THREE.Euler(), _t = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pole = new THREE.Vector3();
const TIP0 = new THREE.Vector3(GT.staff.x, 0, GT.staff.z), WR0 = new THREE.Vector3(...(GT.armR.wr as [number, number, number])), GRIP0 = new THREE.Vector3(...(GT.grip as [number, number, number]));
const STAFF_DIR0 = TIP0.clone().sub(GRIP0).normalize();

export class GrannyTamarack {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: Skel;
  readonly anim: Animator;
  readonly fx: CreatureFx;
  readonly model: GrannyModel;
  /** 0 gone .. 1 solid (a dithered dissolve) */
  readonly fade: { value: number };
  state: GrannyState = 'absent';
  readonly pos = new THREE.Vector3(); heading = 0; speed = 0;
  /** she has had cookies this encounter */
  fed = false;
  manual: string | null = null;
  /** where she walks you to (defaults to ctx.stove, else the cabin spot) */
  home: THREE.Vector3 | null;
  readonly secrets: GrannySecret[];
  private told = 0; private secretT = -99; private secretDir = new THREE.Vector3(1, 0, 0);
  private params: AnimParams = { speed: 0, phase: 0, lookYaw: 0, lookPitch: 0 };
  private legs: { up: number; lo: number; foot: number; ankle: THREE.Vector3 }[];
  private arm: { up: number; lo: number; hand: number };
  private lidAxis: THREE.Vector3[]; private lid: number[];
  private t = 0; private st = 0; private hold: string | null = null; private fadeT = 0; private wantSpeed = 0; private target = new THREE.Vector3(); private face: number | null = null;
  private lastPlayer = new THREE.Vector3(); private pSpeed = 0; private closing = 0; private litT = 0; private stillT = 0; private noCookieT = 0;
  private cooldown = 0; private eligT = 0; private nextAppear = 20; private humT = 6; private beckonT = 0; private blink = 0; private blinkT = 3; private lastHum = 0;
  private reason = 'gone'; private ground = new Float32Array(3); private took = false;
  constructor(o: { pos?: THREE.Vector3; heading?: number; model?: GrannyModel; home?: THREE.Vector3; secrets?: GrannySecret[]; present?: boolean } = {}) {
    const m = o.model ?? grannyModel(); this.model = m;
    this.skel = new Skel(m.bones);
    const { mat, depth, fx } = creatureMaterial(m.tex, m.sd, { shineCol: 0xffd27a }); this.fx = fx;
    this.fade = dissolve(mat, depth);
    this.mesh = this.skel.mesh(m.geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.customDepthMaterial = depth; this.mesh.frustumCulled = false;
    this.object.add(this.mesh); this.object.name = 'GrannyTamarack';
    this.anim = new Animator(grannyClips(this.skel.defs), this.skel.bones.length, 3, 4);
    this.anim.play('idle');
    const S = this.skel;
    this.legs = ['L', 'R'].map((s) => ({ up: S.i('thigh' + s), lo: S.i('shin' + s), foot: S.i('foot' + s), ankle: S.restWorld[S.i('foot' + s)].clone() }));
    this.arm = { up: S.i('armR'), lo: S.i('elbR'), hand: S.i('handR') };
    const E = eyeAt();
    this.lidAxis = [1, -1].map((s) => new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s * E.ax[0], E.ax[1], E.ax[2])).normalize());
    this.lid = [S.i('lidL'), S.i('lidR')];
    if (o.pos) this.pos.copy(o.pos);
    this.heading = o.heading ?? 0;
    this.home = o.home ?? null;
    this.secrets = o.secrets ?? ['chanterelles', 'lost_axe', 'bigfoot_stump'];
    if (o.present) { this.state = 'watch'; this.fade.value = 1; } else { this.fade.value = 0; this.object.visible = false; }
  }
  get clips(): string[] { return Object.keys(this.anim.clips); }
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip].loop }); }
  get present() { return this.state !== 'absent'; }

  /** the player holds something out to her: true if she takes it (oatmeal cookies, within reach, while she is
   *  watching, waiting or coming to you) */
  offer(item: string): boolean {
    if (!COOKIES.test(item) || RAISIN.test(item)) return false;
    if (this.state !== 'approach' && this.state !== 'watch' && this.state !== 'pause') return false;
    if (this.lastPlayer.lengthSq() === 0 || Math.hypot(this.lastPlayer.x - this.pos.x, this.lastPlayer.z - this.pos.z) > 2.8) return false;
    this.go('take'); this.hold = 'take'; this.took = false; this.anim.play('take', { restart: true });
    this.fed = true;
    return true;
  }
  /** a scripted appearance: at a point, or 15-30 m from the player out of their line of sight */
  appear(at?: THREE.Vector3, ctx?: CreatureCtx) {
    if (at) this.pos.copy(at);
    else if (ctx) this.pickSpot(ctx);
    if (ctx) this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.go('appear'); this.fed = false; this.fadeT = 1;
    this.object.visible = true;
  }

  update(ctx: CreatureCtx) {
    const dt = Math.min(0.1, Math.max(0, ctx.dt)); this.t += dt; this.st += dt;
    const P = ctx.player, dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const ps = P.speed ?? (this.lastPlayer.lengthSq() > 0 && dt > 0 ? Math.hypot(P.pos.x - this.lastPlayer.x, P.pos.z - this.lastPlayer.z) / dt : 0);
    const closing = this.lastPlayer.lengthSq() > 0 && dt > 0 ? (Math.hypot(this.lastPlayer.x - this.pos.x, this.lastPlayer.z - this.pos.z) - dist) / dt : 0;
    this.pSpeed = damp(this.pSpeed, Math.min(12, ps), 5, dt); this.closing = damp(this.closing, clamp(closing, -10, 10), 4, dt);
    this.lastPlayer.copy(P.pos);
    if (this.manual) { this.fadeT = 1; this.fade.value = 1; this.object.visible = true; }
    else this.think(ctx, dt, dist);
    this.move(ctx, dt);
    // the dissolve: out of the fog over a few seconds, back into it a little quicker
    if (!this.manual) {
      const r = this.fadeT > this.fade.value ? 0.45 : 0.6;
      this.fade.value = clamp(this.fade.value + clamp(this.fadeT - this.fade.value, -r * dt, r * dt), 0, 1);
      this.object.visible = this.fade.value > 0.01;
    }
    this.fx.shine.value = (1 - daylight(ctx.hour)) * (P.light ? 0.9 : 0.3) * this.fade.value;
    if (this.object.visible) { this.animate(ctx, dt, dist); setPusher(4, this.object.position.x, this.object.position.y, this.object.position.z, 0.6); }
    else setPusher(4, 0, -999, 0, 0);
  }

  // ------------------------------------------------------------------------------------------------ AI
  private go(s: GrannyState) { if (s !== this.state) { this.state = s; this.st = 0; this.hold = null; this.face = null; } }
  private homeOf(ctx: CreatureCtx) { return this.home ?? ctx.stove ?? _w.set(SPOTS.cabin.x, 0, SPOTS.cabin.z); }
  /** the conditions she comes in: fog or night, near the hollow or with the player lost */
  eligible(ctx: CreatureCtx): boolean {
    const P = ctx.player, H = this.homeOf(ctx), fog = ctx.fog ?? 0, night = 1 - daylight(ctx.hour);
    const nearHollow = Math.hypot(P.pos.x - SPOTS.hollow.x, P.pos.z - SPOTS.hollow.z) < SPOTS.hollow.r;
    const lost = ctx.lost ?? (Math.hypot(P.pos.x - H.x, P.pos.z - H.z) > 230 && Math.hypot(P.pos.x - SPOTS.store.x, P.pos.z - SPOTS.store.z) > 150);
    return (fog >= 0.55 || night > 0.6) && (nearHollow || lost);
  }
  private vanish(reason: string, ctx: CreatureCtx) {
    if (this.state === 'vanish' || this.state === 'absent') return;
    this.reason = reason; this.go('vanish'); this.fadeT = 0;
    this.cooldown = reason === 'home' ? 600 : reason === 'fright' ? 240 : 120;
    ctx.emit('vanish', { pos: this.object.position.clone(), who: 'granny', sound: GRANNY_SOUND.vanish, reason });
  }
  /** 15-30 m from the player, off to one side or behind them, clear of tree trunks */
  private pickSpot(ctx: CreatureCtx) {
    const P = ctx.player, yaw = Math.atan2(P.dir.x, P.dir.z);
    for (let k = 0; k < 12; k++) {
      const a = yaw + (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.3), d = 18 + Math.random() * 9;
      const x = P.pos.x + Math.sin(a) * d, z = P.pos.z + Math.cos(a) * d;
      const tr = ctx.trunks ? ctx.trunks(x, z, 1.2) : [];
      if (tr.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + 0.6) && k < 11) continue;
      this.pos.set(x, ctx.heightAt(x, z), z); break;
    }
    this.heading = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
  }
  private think(ctx: CreatureCtx, dt: number, dist: number) {
    const P = ctx.player, me = this.object.position;
    const emit = (ev: string, x: Record<string, unknown> = {}) => ctx.emit(ev, { pos: me.clone(), who: 'granny', sound: GRANNY_SOUND[ev], ...x });
    const H = this.homeOf(ctx), elig = this.eligible(ctx), cookies = COOKIES.test(P.held) && !RAISIN.test(P.held);
    this.cooldown -= dt;
    // frights: rushed, or a light in her face
    if (this.state !== 'absent' && this.state !== 'vanish') {
      const rushed = this.closing > 2.8 && this.pSpeed > 3.0 && dist < 26;
      let lit = false;
      if (P.light && dist < 32) { _v.set(me.x - P.pos.x, me.y + 2.15 - P.pos.y, me.z - P.pos.z); const d = _v.length(); lit = _v.dot(P.dir) / d > Math.cos(Math.max(0.12, 0.6 / Math.max(1, d))); }
      this.litT = lit ? this.litT + dt : Math.max(0, this.litT - dt * 2);
      if (rushed || this.litT > (this.fed ? 1.6 : 0.6)) { this.vanish('fright', ctx); return; }
    }
    // humming while she waits
    const humming = this.state === 'watch' || this.state === 'appear' || this.state === 'pause' || this.state === 'lead';
    if (humming) { this.humT -= dt; if (this.humT <= 0) { this.humT = 9 + Math.random() * 12; this.lastHum = this.t; emit('hum'); } }
    switch (this.state) {
      case 'absent': {
        this.fadeT = 0; this.wantSpeed = 0;
        if (elig && this.cooldown <= 0) { this.eligT += dt; if (this.eligT > this.nextAppear) { this.eligT = 0; this.nextAppear = 40 + Math.random() * 80; this.appear(undefined, ctx); } }
        else this.eligT = Math.max(0, this.eligT - dt);
        break;
      }
      case 'appear': {
        this.fadeT = 1; this.wantSpeed = 0;
        if (this.st < dt * 1.5) { this.humT = 0.5; }
        if (this.st > 3.5) this.go('watch');
        break;
      }
      case 'watch': {
        this.fadeT = 1; this.wantSpeed = 0; this.hold = null;
        if (dist > 48) { this.vanish('gone', ctx); break; }
        if (!elig && !this.fed && this.st > 10) { this.vanish('dawn', ctx); break; }
        if (cookies && dist < 32) { this.go('approach'); break; }
        break;
      }
      case 'approach': {
        this.fadeT = 1;
        // come to arm's length in front of the player, slowly
        _v.set(this.pos.x - P.pos.x, 0, this.pos.z - P.pos.z).normalize();
        this.target.set(P.pos.x + _v.x * 1.5, 0, P.pos.z + _v.z * 1.5);
        this.wantSpeed = dist > 1.9 ? 0.8 : 0;
        this.noCookieT = cookies ? 0 : this.noCookieT + dt;
        if (this.noCookieT > 4) this.go('watch');
        if (dist > 45) this.vanish('gone', ctx);
        break;
      }
      case 'take': {
        this.wantSpeed = 0; this.hold = 'take';
        if (!this.took && this.st > TAKE_AT) { this.took = true; emit('take', { item: 'cookies' }); }
        if (this.st > 3.1) { this.go('pause'); this.stillT = 0; }
        break;
      }
      case 'lead': {
        this.fadeT = 1; this.hold = null;
        const dh = Math.hypot(H.x - this.pos.x, H.z - this.pos.z);
        this.target.set(H.x, 0, H.z); this.wantSpeed = 1.0;
        if (dh < SPOTS.cabin.r + 14) { this.go('farewell'); emit('beckon'); break; }
        if (dist > 7) { this.go('pause'); this.stillT = 0; this.beckonT = 0; }
        break;
      }
      case 'pause': {
        // wait for the player, beckoning; if they stand with her a while she tells them something
        this.wantSpeed = 0; this.fadeT = 1;
        this.hold = dist > 3.2 ? 'beckon' : null;
        this.beckonT -= dt;
        if (this.hold === 'beckon' && this.beckonT <= 0) { this.beckonT = 6; emit('beckon'); }
        if (dist < 4) this.stillT += this.pSpeed < 0.6 ? dt : dt * 0.3; else this.stillT = 0;
        if (this.fed && this.stillT > 2.5 && this.told < this.secrets.length && this.t - this.secretT > 45) { this.go('secret'); break; }
        if (dist < 4 && this.st > 1.5 && (this.stillT > 4 || this.pSpeed > 0.6 || !this.fed || this.told >= this.secrets.length)) { if (this.fed) this.go('lead'); else this.go('watch'); }
        if (dist > 50 && this.st > 20) this.vanish('gone', ctx);
        break;
      }
      case 'secret': {
        this.wantSpeed = 0; this.hold = 'point';
        if (this.st < dt * 1.5) {
          // point off into the trees, away from the path home
          const a = Math.atan2(H.x - this.pos.x, H.z - this.pos.z) + (this.told % 2 ? 1 : -1) * (1.0 + Math.random() * 0.8);
          this.secretDir.set(Math.sin(a), 0, Math.cos(a)); this.face = a;
          this.anim.play('point', { restart: true });
        }
        if (this.st > 1.3 && this.secretT < this.t - 5) {
          const secret = this.secrets[this.told++]; this.secretT = this.t;
          emit('secret', { secret, dir: this.secretDir.clone() });
        }
        if (this.st > 3.8) { this.go('lead'); }
        break;
      }
      case 'farewell': {
        this.wantSpeed = 0; this.hold = this.st < 3.2 ? 'beckon' : null;
        if (this.st > 3.6) this.vanish('home', ctx);
        break;
      }
      case 'vanish': {
        // turn away and walk off into the fog while she fades
        _v.set(this.pos.x - P.pos.x, 0, this.pos.z - P.pos.z).normalize();
        if (this.reason === 'home') _v.set(this.pos.x - H.x, 0, this.pos.z - H.z).normalize();
        this.target.set(this.pos.x + _v.x * 6, 0, this.pos.z + _v.z * 6);
        this.wantSpeed = this.st > 0.6 ? 0.6 : 0; this.fadeT = 0;
        if (this.fade.value < 0.02) { this.go('absent'); this.object.visible = false; this.fed = false; }
        break;
      }
    }
  }
  private move(ctx: CreatureCtx, dt: number) {
    const P = ctx.player;
    if (this.manual) this.speed = this.manual === 'walk' ? 0.9 : this.manual === 'vanish' ? 0.6 : 0;
    else {
      const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
      let want = d < 0.3 ? 0 : Math.min(this.wantSpeed, d * 1.2 + 0.2);
      if (want > 0) this.heading = dampAngle(this.heading, Math.atan2(tx, tz), 1.4, dt);
      else {
        const face = this.face ?? Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
        this.heading = dampAngle(this.heading, face, 1.0, dt);
      }
      want *= clamp(1.3 - Math.abs(wrapAngle(Math.atan2(tx, tz) - this.heading)) * 0.6, 0.15, 1);
      this.speed = damp(this.speed, want, want > this.speed ? 1.2 : 2.5, dt);
      this.pos.x += Math.sin(this.heading) * this.speed * dt; this.pos.z += Math.cos(this.heading) * this.speed * dt;
    }
    this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
    this.object.position.copy(this.pos); this.object.rotation.set(0, this.heading, 0);
  }

  // ------------------------------------------------------------------------------------------------ animation
  private animate(ctx: CreatureCtx, dt: number, dist: number) {
    const a = this.params, sp = this.speed;
    let clip = this.manual ?? this.hold ?? (sp > 0.12 ? (this.state === 'vanish' ? 'vanish' : 'walk') : 'idle');
    if (!this.manual && sp > 0.12 && this.hold !== 'take') clip = this.state === 'vanish' ? 'vanish' : 'walk';
    if (!(clip === 'take' && this.anim.current === 'take') && !(clip === 'point' && this.anim.current === 'point')) this.anim.play(clip);
    const cur = this.anim.current;
    if (cur === 'walk' || cur === 'vanish') {
      const before = a.phase; a.phase = (a.phase + (Math.max(sp, 0.15) / (STRIDE * (cur === 'vanish' ? 0.7 : 1))) * dt) % 1;
      if (Math.floor(before * 2) !== Math.floor(a.phase * 2)) ctx.emit('step', { pos: this.object.position.clone(), who: 'granny', sound: GRANNY_SOUND.step });
    }
    a.speed = sp;
    // look at the player (she always knows where you are), the head turned away when she goes
    const P = ctx.player;
    let ly = 0, lp = 0;
    if (dist < 60 && this.state !== 'vanish' && this.state !== 'secret') {
      const yaw = wrapAngle(Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.heading);
      ly = Math.abs(yaw) < 2.2 ? clamp(yaw, -1.1, 1.1) : 0;
      lp = clamp(Math.atan2(P.pos.y - (this.pos.y + 2.1), Math.max(1, dist)), -0.6, 0.4);
    }
    a.lookYaw = damp(a.lookYaw, ly, 2, dt); a.lookPitch = damp(a.lookPitch, lp, 2, dt);
    const p = this.anim.update(dt, a);
    if (p.c[CH_HUM] > 0.6 && this.t - this.lastHum > 14 && !this.manual && (this.state === 'watch' || this.state === 'pause')) { this.lastHum = this.t; ctx.emit('hum', { pos: this.object.position.clone(), who: 'granny', sound: GRANNY_SOUND.hum }); }
    // blinks: slow, heavy lids
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.28; this.blinkT = 3 + Math.random() * 5; } this.blink = Math.max(0, this.blink - dt);
    const lid = Math.max(p.c[CH_LID], this.blink > 0 ? Math.sin((this.blink / 0.28) * Math.PI) : 0);
    // feet and the staff on the ground
    const c = Math.cos(this.heading), s = Math.sin(this.heading), g0 = this.pos.y;
    const gnd = (fx: number, fz: number) => clamp(ctx.heightAt(this.pos.x + fx * c + fz * s, this.pos.z - fx * s + fz * c) - g0, -0.4, 0.4);
    for (let k = 0; k < 2; k++) { const L = this.legs[k]; this.ground[k] = gnd(L.ankle.x + p.f[k * FOOT], L.ankle.z + p.f[k * FOOT + 2]); }
    this.ground[2] = gnd(TIP0.x + p.f[STAFF * FOOT], TIP0.z + p.f[STAFF * FOOT + 2]);
    this.apply(p, Math.min(this.ground[0], this.ground[1]), lid);
  }
  private apply(p: Pose, lift: number, lid: number) {
    const S = this.skel, B = S.bones;
    S.rest();
    B[0].position.x += p.t[0]; B[0].position.y += p.t[1] + lift; B[0].position.z += p.t[2];
    B[0].quaternion.setFromEuler(_e.set(p.rr[0], p.rr[1], p.rr[2]));
    for (let i = 1; i < B.length; i++) { const x = p.r[i * 3], y = p.r[i * 3 + 1], z = p.r[i * 3 + 2]; if (x || y || z) B[i].quaternion.setFromEuler(_e.set(x, y, z)); }
    for (let k = 0; k < 2; k++) B[this.lid[k]].quaternion.setFromAxisAngle(this.lidAxis[k], 0.12 + lid * 0.9);
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
    // the staff: the right hand carries it so its foot lands where the pose puts it, the staff leaning to reach
    const o = STAFF * FOOT, w = clamp(p.f[o + 3], 0, 1);
    if (w > 0.002) {
      const tip = _t.set(TIP0.x + p.f[o], p.f[o + 1] + this.ground[2] - lift, TIP0.z + p.f[o + 2]);
      const wrist = new THREE.Vector3(WR0.x + p.f[o] * 0.45, WR0.y + (p.f[o + 1] + this.ground[2] - lift) * 0.8 + p.t[1] * 0.6, WR0.z + p.f[o + 2] * 0.45 + p.t[2]);
      const pole = new THREE.Vector3(-0.5, -0.2, -1).applyQuaternion(yawQ);
      const A = this.arm;
      S.ik2(A.up, A.lo, A.hand, wrist, pole, w);
      // turn the fist so the staff runs from the grip down to its foot
      const grip = GRIP0.clone().sub(WR0).add(S.P[A.hand]);
      const dir = tip.clone().sub(grip).normalize();
      _q2.setFromUnitVectors(STAFF_DIR0, dir);
      S.orient(A.hand, _q2.slerp(S.Q[A.hand].clone(), 1 - w));
    }
  }
}
