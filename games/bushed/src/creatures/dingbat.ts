// DINGBATS: a roost of little antlered bat-owls under the cabin eaves. Model in dingbat/model.ts, clips in
// dingbat/clips.ts. Harmless, and the most frightening thing about the cabin.
//
//   const roost = new DingbatRoost({ pos: eavePoint, heading: wallFacing, count: 9, span: 3 });
//   scene.add(roost.object);
//   roost.update(ctx);           // every frame (CreatureCtx; uses ctx.heightAt, ctx.player.{pos,dir,light,held,noise,action,speed})
//
// `pos` is the underside of the eave the flock hangs from (world), `heading` the direction the wall faces (radians
// about Y, 0 = +Z: the bats hang with their faces that way), `span` the length of eave they spread along.
// Rules:
//   tucked   by day they are tucked away up in the eave gap (invisible); at dusk they come out to hang
//   roost    asleep, hanging head-down in clumps along the eave, wings wrapped, swaying; while it is dark and quiet
//            they stay asleep
//   wake     a flashlight beam on them (ctx.player.light and the player looking at them), a lantern or torch carried
//            close, loud noise near the cabin (ctx.player.noise > 0.6) or chopping nearby builds up `irritation`;
//            at 1 the bats in the beam wake first and the rest follow in a ripple (each one screeches as it drops)
//   swarm    for ~10-20 s they whirl in screeching spirals round the light (the flashlight in the player's hand) or,
//            in the dark, round the player's head, diving past the face; darkness and stillness (light off, the
//            player not moving, quiet) calm them about twice as fast, a light kept on them slows it, more noise
//            renews it
//   settle   they straggle back one by one to their places on the eave and hang up again ('settle' per bat)
// Events (ctx.emit(ev, { pos, who: 'dingbat', sound })): screech, flutter (a bat passing the player's head), settle
// ({ left }: bats still out). `sound` is a src/audio/bank.ts id (DINGBAT_SOUND).
import * as THREE from 'three';
import { Skel, creatureMaterial, clamp, damp, wrapAngle, type CreatureFx } from './rig';
import { Animator, type AnimParams } from './animator';
import { buildDingbatModel, buildDingbatModelAsync, dingbatBones, DINGBAT_MODEL_VERSION, DB, type DingbatModel } from './dingbat/model';
import { dingbatClips, CH_JAW, CH_LID } from './dingbat/clips';
import { loader } from './cache';
import { registerPreload } from './preload';
import { daylight } from './hound';
import type { CreatureCtx } from './types';

export const DINGBAT_SOUND: Record<string, string | undefined> = { screech: 'dingbat_screech', flutter: 'dingbat_flutter', settle: 'dingbat_flutter' };
const DM = loader<DingbatModel>(DINGBAT_MODEL_VERSION, () => buildDingbatModelAsync(), (b, m) => ({ ...b, bones: dingbatBones(), tris: m.tris as number, den: m.den as number, stats: m.stats as string }), (m) => ({ tris: m.tris, den: m.den, stats: m.stats }));
/** the dingbat's shared model: preloaded (dingbatModelAsync / preloadCreatures) or built now (blocks) */
export function dingbatModel(): DingbatModel { let m = DM.get(); if (!m) { m = buildDingbatModel(); DM.set(m); } return m; }
export const dingbatModelAsync = (o: { cache?: boolean } = {}) => DM.load(o);
registerPreload('dingbat', dingbatModelAsync);

export type DingbatMode = 'hidden' | 'hang' | 'wake' | 'fly' | 'return' | 'land';
export type RoostState = 'tucked' | 'roost' | 'swarm' | 'settle';
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ax = new THREE.Vector3();
const GRIP = new THREE.Vector3(...(DB.grip as [number, number, number]));
/** the hanging orientation (model space): head down, back to the wall, belly and face out */
const HANG_LOCAL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

/** one bat: a skinned mesh over the shared model, posed by the roost (or by a test page) */
export class Dingbat {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly skel: Skel;
  readonly anim: Animator;
  readonly model: DingbatModel;
  /** a test page's clip (null: the roost drives it) */
  manual: string | null = null;
  mode: DingbatMode = 'hang';
  readonly pos = new THREE.Vector3(); readonly vel = new THREE.Vector3();
  /** where it hangs (world) and which way it faces there */
  readonly spot = new THREE.Vector3(); spotHeading = 0;
  /** 0 flying orientation .. 1 hanging */
  hangW = 1;
  /** a screech in progress (s left), the eyes open while hanging (0..1) */
  screech = 0; alert = 0;
  t = 0; timer = 0; delay = 0;
  // the spiral it flies round the swarm's centre
  orbitA = 0; orbitW = 2; orbitR = 1.2; orbitH = 0; seed = 0; dive = 0; lastFlutter = -9;
  yaw = 0; private yawRate = 0; private roll = 0; private pitch = 0;
  readonly params: AnimParams = { speed: 0, phase: 0, lookYaw: 0, lookPitch: 0, alert: 0 };
  private bones: Record<string, number>;
  constructor(o: { model?: DingbatModel; mat?: { mat: THREE.Material; depth: THREE.Material } } = {}) {
    const m = o.model ?? dingbatModel(); this.model = m;
    this.skel = new Skel(m.bones);
    const mats = o.mat ?? creatureMaterial(m.tex, m.sd, { shineCol: 0xff7a3a });
    this.mesh = this.skel.mesh(m.geo, mats.mat);
    this.mesh.castShadow = true; this.mesh.customDepthMaterial = mats.depth; this.mesh.frustumCulled = false;
    this.object.add(this.mesh); this.object.name = 'Dingbat';
    this.anim = new Animator(dingbatClips(this.skel.defs), this.skel.bones.length, 0, 4);
    this.anim.play('hang');
    this.bones = this.skel.idx;
  }
  get clips(): string[] { return Object.keys(this.anim.clips); }
  play(clip: string | null) { this.manual = clip; if (clip) this.anim.play(clip, { restart: !this.anim.clips[clip].loop }); }
  /** the hanging orientation at its spot */
  hangQuat(out: THREE.Quaternion) { return out.setFromAxisAngle(_ax.set(0, 1, 0), this.spotHeading).multiply(HANG_LOCAL); }
  /** world position of the body (the root) when it hangs at its spot */
  hangPos(out: THREE.Vector3) { this.hangQuat(_q2); return out.copy(GRIP).applyQuaternion(_q2).negate().add(this.spot); }
  /** orient and place the object from pos / vel / hangW */
  place(dt: number) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.2) {
      const y = Math.atan2(this.vel.x, this.vel.z), dy = wrapAngle(y - this.yaw);
      this.yawRate = damp(this.yawRate, dt > 0 ? dy / dt : 0, 6, dt); this.yaw = y;
    }
    this.pitch = damp(this.pitch, clamp(Math.atan2(-this.vel.y, Math.max(0.3, sp)), -0.9, 0.9), 6, dt);
    this.roll = damp(this.roll, clamp(-this.yawRate * 0.22, -0.9, 0.9), 5, dt);
    _q.setFromEuler(_e.set(this.pitch, this.yaw, this.roll, 'YXZ'));
    if (this.hangW > 0.001) _q.slerp(this.hangQuat(_q2), clamp(this.hangW, 0, 1));
    this.object.quaternion.copy(_q);
    this.object.position.copy(this.pos);
  }
  /** run the clips and pose the skeleton */
  pose(dt: number, look?: THREE.Vector3) {
    this.t += dt;
    const a = this.params;
    a.alert = this.alert;
    const cur = this.anim.current;
    if (cur === 'fly') a.phase = (a.phase + dt * (9 + (this.seed % 3))) % 1;
    // look at a point (the player): head yaw and pitch in the body's frame
    if (look) {
      _v.copy(look).sub(this.object.position).applyQuaternion(_q.copy(this.object.quaternion).invert());
      const yaw = Math.atan2(_v.x, _v.z), pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      const hang = this.hangW > 0.5;
      // hanging, the head is already turned out from the chest: look in that frame (belly = forward)
      const ly = hang ? Math.atan2(_v.x, -_v.y) : yaw, lp = hang ? Math.atan2(_v.z, Math.hypot(_v.x, _v.y)) : pitch;
      a.lookYaw = damp(a.lookYaw, clamp(ly, -1.2, 1.2), 5, dt); a.lookPitch = damp(a.lookPitch, clamp(lp, -0.7, 0.7), 5, dt);
    } else { a.lookYaw = damp(a.lookYaw, 0, 3, dt); a.lookPitch = damp(a.lookPitch, 0, 3, dt); }
    const p = this.anim.update(dt, a);
    this.screech = Math.max(0, this.screech - dt);
    const jaw = clamp(p.c[CH_JAW] + (this.screech > 0 ? Math.sin(Math.min(1, (0.6 - this.screech) / 0.12) * Math.PI * 0.5) * (0.9 + 0.1 * Math.sin(this.t * 60)) : 0), 0, 1.1);
    const S = this.skel, B = S.bones, bi = this.bones;
    S.rest();
    B[0].position.x += p.t[0]; B[0].position.y += p.t[1]; B[0].position.z += p.t[2];
    B[0].quaternion.setFromEuler(_e.set(p.rr[0], p.rr[1], p.rr[2], 'XYZ'));
    for (let i = 1; i < B.length; i++) { const x = p.r[i * 3], y = p.r[i * 3 + 1], z = p.r[i * 3 + 2]; if (x || y || z) B[i].quaternion.setFromEuler(_e.set(x, y, z, 'XYZ')); }
    B[bi.jaw].quaternion.setFromEuler(_e.set(p.r[bi.jaw * 3] + jaw * 1.05, 0, 0, 'XYZ'));
    // lids: rotate down over the eyes about the side axis
    const lid = clamp(p.c[CH_LID], 0, 1);
    B[bi.lidL].quaternion.setFromEuler(_e.set(-0.2 + lid * 1.5, 0, 0, 'XYZ'));
    B[bi.lidR].quaternion.setFromEuler(_e.set(-0.2 + lid * 1.5, 0, 0, 'XYZ'));
  }
}

export interface DingbatRoostOpts {
  /** the underside of the eave the bats hang from (world) */
  pos: THREE.Vector3;
  /** which way the wall faces (rad about Y, 0 = +Z) */
  heading?: number;
  /** 6..12 */
  count?: number;
  /** metres of eave they spread along */
  span?: number;
  seed?: number;
  model?: DingbatModel;
}

/** the flock: 6-12 pooled bats sharing one geometry, one texture and one material */
export class DingbatRoost {
  readonly object = new THREE.Group();
  readonly bats: Dingbat[] = [];
  readonly pos = new THREE.Vector3();
  heading: number;
  state: RoostState = 'roost';
  /** 0..1 builds up from light and noise while they sleep; 1 sets them off */
  irritation = 0;
  /** seconds of swarming left (the calm-down clock) */
  agitation = 0;
  readonly fx: CreatureFx;
  /** test pages: keep them out by day too */
  alwaysOut = false;
  private swarmT = 0; private drowsy = 0; private nextScreech = 0; private t = 0;
  private centre = new THREE.Vector3(); private hasCentre = false;
  private rng: () => number;
  constructor(o: DingbatRoostOpts) {
    this.pos.copy(o.pos); this.heading = o.heading ?? 0;
    const n = clamp(Math.round(o.count ?? 9), 6, 12), span = o.span ?? 3;
    let s = (o.seed ?? 7) * 9301 + 49297;
    this.rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const m = o.model ?? dingbatModel();
    const mats = creatureMaterial(m.tex, m.sd, { shineCol: 0xff7a3a });
    this.fx = mats.fx;
    const along = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    // they hang in two or three clumps along the eave
    const clumps = n > 8 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const b = new Dingbat({ model: m, mat: mats });
      const c = i % clumps, f = (c + 0.5) / clumps - 0.5;
      b.spot.copy(this.pos).addScaledVector(along, f * span + (this.rng() - 0.5) * 0.5).add(new THREE.Vector3(0, -this.rng() * 0.03, 0));
      b.spotHeading = this.heading + (this.rng() - 0.5) * 0.5;
      b.seed = i; b.t = this.rng() * 9;
      b.hangPos(b.pos); b.hangW = 1; b.mode = 'hang';
      b.orbitA = this.rng() * Math.PI * 2; b.orbitW = (1.7 + this.rng() * 1.4) * (this.rng() < 0.2 ? -1 : 1); b.orbitR = 0.75 + this.rng() * 1.3; b.orbitH = this.rng() * 6;
      b.place(0); b.anim.update(this.rng() * 5, b.params);
      this.bats.push(b); this.object.add(b.object);
    }
    this.object.name = 'DingbatRoost';
  }
  get count() { return this.bats.length; }
  /** set them off now (scripted scares, tests) */
  disturb() { if (this.state === 'roost') this.irritation = 1; else if (this.state === 'swarm' || this.state === 'settle') this.agitation = Math.max(this.agitation, 10); }

  update(ctx: CreatureCtx) {
    const dt = Math.min(0.1, Math.max(0, ctx.dt)); this.t += dt;
    const P = ctx.player, day = daylight(ctx.hour);
    const emit = (ev: string, at: THREE.Vector3, x: Record<string, unknown> = {}) => ctx.emit(ev, { pos: at.clone(), who: 'dingbat', sound: DINGBAT_SOUND[ev], ...x });
    const dRoost = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const lightOn = P.light || /lantern|torch/.test(P.held);
    const lantern = /lantern|torch/.test(P.held);
    // which hanging bats are in the beam
    const inBeam = (at: THREE.Vector3, cone = 0.3) => {
      if (!P.light) return false;
      _v.copy(at).sub(P.pos); const d = _v.length();
      return d < 22 && _v.dot(P.dir) / Math.max(1e-4, d) > Math.cos(cone);
    };
    const noisy = P.noise > 0.6 && dRoost < 20, chopping = (P.action === 'chop' || P.action === 'swing') && dRoost < 25;
    this.fx.shine.value = (1 - day) * (P.light ? 1 : 0.35);

    // ---- the roost's state
    if (this.state === 'tucked') {
      if (day < 0.45 || this.alwaysOut) { this.state = 'roost'; for (const b of this.bats) { b.mode = 'hang'; b.hangW = 1; b.hangPos(b.pos); b.vel.set(0, 0, 0); b.object.visible = true; } }
    } else if (this.state === 'roost') {
      if (day > 0.6 && !this.alwaysOut) { this.state = 'tucked'; for (const b of this.bats) { b.mode = 'hidden'; b.object.visible = false; } }
      else {
        this.drowsy = Math.max(0, this.drowsy - dt);
        const k = this.drowsy > 0 ? 0.4 : 1;
        let lit = 0;
        for (const b of this.bats) { const on = inBeam(b.object.position); b.alert = damp(b.alert, on ? 1 : 0, 6, dt); if (on) lit++; }
        if (lit) this.irritation += dt * (2.2 + lit * 0.4) * k;
        if (lantern && dRoost < 8) this.irritation += dt * 1.6 * k;
        if (noisy) this.irritation += dt * (P.noise - 0.5) * 6 * (1 - dRoost / 20) * k;
        if (chopping) this.irritation += dt * 2.4 * k;
        this.irritation = Math.max(0, this.irritation - dt * 0.5);
        if (this.irritation >= 1) this.startSwarm(ctx, inBeam);
      }
    } else {
      // swarming or settling: the calm-down clock
      const dark = !lightOn, still = (P.speed ?? 0) < 0.6 && P.noise < 0.3 && !chopping;
      const onSwarm = P.light && this.hasCentre && inBeam(this.centre, 0.5);
      const rate = dark && still ? 2.2 : onSwarm ? 0.5 : 1;
      this.swarmT += dt;
      if (this.state === 'swarm') {
        this.agitation -= dt * rate;
        if (chopping || (noisy && P.noise > 0.8)) this.agitation = Math.max(this.agitation, 8);
        if (this.agitation <= 0 || this.swarmT > 35) {
          this.state = 'settle';
          for (const b of this.bats) b.delay = this.rng() * 2.5;
        }
      } else if (chopping || (P.light && onSwarm && this.swarmT < 6)) { this.state = 'swarm'; this.agitation = Math.max(this.agitation, 6); }
    }

    // ---- the swarm's centre: the light in the player's hand, or the player's head in the dark; they will not
    // follow far from the cabin
    if (dRoost < 26) {
      if (lightOn) this.centre.copy(P.pos).addScaledVector(P.dir, lantern ? 0.25 : 0.55).add(_v.set(0, -0.2, 0));
      else this.centre.copy(P.pos).add(_v.set(0, 0.15, 0));
    } else this.centre.set(this.pos.x + Math.sin(this.heading) * 3, this.pos.y - 0.8, this.pos.z + Math.cos(this.heading) * 3);
    this.hasCentre = true;

    // ---- each bat
    let out = 0;
    for (const b of this.bats) {
      if (b.mode === 'hidden') continue;
      b.timer += dt;
      switch (b.mode) {
        case 'hang': {
          b.hangPos(b.pos); b.vel.set(0, 0, 0); b.hangW = 1;
          if (b.anim.current !== 'hang') b.anim.play('hang');
          if (this.state === 'swarm') { b.delay -= dt; if (b.delay <= 0) { b.mode = 'wake'; b.timer = 0; b.anim.play('wake', { restart: true }); b.screech = 0.6; emit('screech', b.object.position); } }
          break;
        }
        case 'wake': {
          b.hangPos(b.pos);
          if (b.timer > 0.75) {
            // drop off the eave and away from the wall
            b.mode = 'fly'; b.timer = 0;
            b.vel.set(Math.sin(b.spotHeading) * 1.6, -2.2, Math.cos(b.spotHeading) * 1.6);
            b.anim.play('fly');
          }
          break;
        }
        case 'fly': case 'return': {
          out++;
          b.hangW = Math.max(0, b.hangW - dt * 3.2);
          const ret = b.mode === 'return' || (this.state === 'settle' && (b.delay -= dt) <= 0);
          if (ret && b.mode !== 'return') { b.mode = 'return'; b.timer = 0; }
          const T = _w;
          if (b.mode === 'return') {
            // swoop in under the eave just in front of its place
            b.hangPos(T); T.x += Math.sin(b.spotHeading) * 0.5; T.z += Math.cos(b.spotHeading) * 0.5; T.y -= 0.25;
            if (T.distanceTo(b.pos) < 0.35 || b.timer > 12) { b.mode = 'land'; b.timer = 0; b.anim.play('land', { restart: true }); }
          } else {
            // the spiral round the centre, with a dive past the face now and then
            b.orbitA += b.orbitW * dt;
            if (b.dive <= 0 && this.rng() < dt * 0.12) b.dive = 1.4;
            b.dive = Math.max(0, b.dive - dt);
            const dk = b.dive > 0 ? Math.sin((b.dive / 1.4) * Math.PI) : 0;
            const r = (b.orbitR + 0.3 * Math.sin(this.t * 0.7 + b.seed)) * (1 - 0.75 * dk);
            T.set(this.centre.x + Math.cos(b.orbitA) * r, this.centre.y + (0.25 + 0.55 * Math.sin(this.t * 1.3 + b.orbitH)) * (1 - dk), this.centre.z + Math.sin(b.orbitA) * r);
          }
          this.steer(b, T, dt, ctx, b.mode === 'return' ? 3.2 : 6.5);
          // the flap cycle, gliding on the fast stretches of the spiral
          const sp = b.vel.length();
          const glide = b.mode === 'fly' && sp > 4.5 && Math.sin(this.t * 0.9 + b.seed * 1.7) > 0.45;
          b.anim.play(glide ? 'glide' : 'fly');
          // screeches, and the flutter of a wing past the player's ear
          if (b.mode === 'fly' && this.t > this.nextScreech && this.rng() < dt * 0.6) { this.nextScreech = this.t + 0.3 + this.rng() * 0.5; b.screech = 0.6; emit('screech', b.pos); }
          if (b.pos.distanceTo(P.pos) < 1.1 && this.t - b.lastFlutter > 1.5) { b.lastFlutter = this.t; emit('flutter', b.pos); }
          break;
        }
        case 'land': {
          // ease into the hanging place and turn head-down
          b.hangPos(_w);
          const k = clamp(b.timer / 0.6, 0, 1);
          b.pos.lerp(_w, 1 - Math.exp(-dt * 12)); b.vel.multiplyScalar(Math.exp(-dt * 8));
          b.hangW = Math.max(b.hangW, k * k * (3 - 2 * k));
          if (b.timer > 0.85) {
            b.mode = 'hang'; b.hangW = 1; b.pos.copy(_w); b.vel.set(0, 0, 0); b.alert = 0.6;
            const left = this.bats.filter((x) => x !== b && (x.mode === 'fly' || x.mode === 'return' || x.mode === 'land' || x.mode === 'wake')).length;
            emit('settle', b.pos, { left });
          }
          break;
        }
      }
      b.alert = b.mode === 'hang' ? Math.max(0, b.alert - dt * 0.15) : 1;
      b.place(dt);
      b.pose(dt, b.mode === 'hang' && b.alert < 0.3 ? undefined : P.pos);
    }
    if (this.state === 'settle' && !out && this.bats.every((b) => b.mode === 'hang' || b.mode === 'hidden')) { this.state = 'roost'; this.irritation = 0; this.drowsy = 5; }
  }
  private startSwarm(ctx: CreatureCtx, inBeam: (at: THREE.Vector3, cone?: number) => boolean) {
    this.state = 'swarm'; this.agitation = 10 + this.rng() * 10; this.swarmT = 0; this.irritation = 0;
    // the ones in the beam go first, the rest in a ripple outward
    for (const b of this.bats) b.delay = inBeam(b.object.position) ? this.rng() * 0.15 : 0.15 + this.rng() * 1.3;
    void ctx;
  }
  /** fly toward a point: seek with a turn-limited acceleration, keep apart from the others, keep off the ground */
  private steer(b: Dingbat, T: THREE.Vector3, dt: number, ctx: CreatureCtx, vmax: number) {
    _v.copy(T).sub(b.pos);
    const d = _v.length();
    _v.multiplyScalar(Math.min(vmax, d * 2.4) / Math.max(1e-4, d));
    // a sideways swirl so they never fly straight at a point
    _v.x += -Math.sin(b.orbitA) * 0.8 * Math.sign(b.orbitW); _v.z += Math.cos(b.orbitA) * 0.8 * Math.sign(b.orbitW);
    _v.sub(b.vel).multiplyScalar(4.5);
    const a = _v.length(); if (a > 32) _v.multiplyScalar(32 / a);
    for (const o of this.bats) {
      if (o === b || o.mode === 'hang' || o.mode === 'hidden') continue;
      const dx = b.pos.x - o.pos.x, dy = b.pos.y - o.pos.y, dz = b.pos.z - o.pos.z, dd = dx * dx + dy * dy + dz * dz;
      if (dd < 0.09 && dd > 1e-6) { const k = (0.3 - Math.sqrt(dd)) * 60 / Math.sqrt(dd); _v.x += dx * k; _v.y += dy * k; _v.z += dz * k; }
    }
    b.vel.addScaledVector(_v, dt);
    const sp = b.vel.length();
    if (sp > vmax + 1) b.vel.multiplyScalar((vmax + 1) / sp);
    if (sp < 1.0 && b.mode === 'fly') b.vel.multiplyScalar(1.0 / Math.max(1e-3, sp));
    b.pos.addScaledVector(b.vel, dt);
    const g = ctx.heightAt(b.pos.x, b.pos.z) + 0.35;
    if (b.pos.y < g) { b.pos.y = g; if (b.vel.y < 0) b.vel.y *= -0.3; }
  }
}
