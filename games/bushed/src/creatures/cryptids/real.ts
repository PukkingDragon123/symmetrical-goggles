// The runtime of the camp-story cryptids that wear REAL models (the sidehill gouger, the hoop snake, the splinter cat
// and the goofus bird): a rigged, animated glTF from public/assets/models/creatures/cryptids/ (built by
// tools/blender/cryptids4/), shared between instances (SkeletonUtils.clone), its clips played by an AnimationMixer
// and cross-faded by AI state, walk clips time-scaled to the ground speed, the creature material (eye shine at night
// from the atlas's sd page, wet look, dithered dissolve), ground following with a slope tilt, steering and events.
// Same public face as base.ts's Cryptid (NewCryptid), so spawnNewCryptids, critters.ts and the Book treat it alike.
//
//   await loadReal('gouger');              // (registered with preloadCreatures; constructors also load lazily)
//   const g = new SidehillGouger({ pos }); scene.add(g.object); g.update(ctx); g.offer('chanterelle');
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { creatureMaterial, clamp, damp, dampAngle, wrapAngle, type CreatureFx } from '../rig';
import { dissolve } from '../fade';
import { registerPreload } from '../preload';
import type { CreatureCtx, GroundItem } from '../types';
import { daylight, type NewCryptid } from './base';

export interface RealModel {
  name: string;
  /** the loaded glTF scene (a template: instances are skinned clones of it) */
  scene: THREE.Object3D;
  clips: Record<string, THREE.AnimationClip>;
  map: THREE.Texture; sd: THREE.Texture;
}

const models = new Map<string, RealModel>();
const pending = new Map<string, Promise<RealModel>>();
let loader: GLTFLoader | null = null;
let flatSd: THREE.DataTexture | null = null;

export const realModel = (name: string): RealModel | null => models.get(name) ?? null;

/** load (once) a cryptid's glb */
export function loadReal(name: string): Promise<RealModel> {
  const have = models.get(name);
  if (have) return Promise.resolve(have);
  let p = pending.get(name);
  if (!p) {
    loader ??= new GLTFLoader();
    p = loader.loadAsync(`assets/models/creatures/cryptids/${name}.glb`).then((g) => {
      let mesh: THREE.SkinnedMesh | null = null;
      g.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh; });
      if (!mesh) throw new Error(name + ': no skinned mesh');
      const src = (mesh as THREE.SkinnedMesh).material as THREE.MeshStandardMaterial;
      const map = src.map!;
      // the game's look: nearest-filtered texels up close, smooth mips far off
      map.magFilter = THREE.NearestFilter; map.anisotropy = 4; map.needsUpdate = true;
      if (!flatSd) { flatSd = new THREE.DataTexture(new Uint8Array([0, 220, 0, 255]), 1, 1); flatSd.needsUpdate = true; }
      const sd = src.roughnessMap ?? flatSd;
      sd.magFilter = THREE.NearestFilter;
      const clips: Record<string, THREE.AnimationClip> = {};
      for (const c of g.animations) clips[c.name] = c;
      const m: RealModel = { name, scene: g.scene, clips, map, sd };
      models.set(name, m);
      return m;
    });
    pending.set(name, p);
  }
  return p;
}

/** the four models load with the other creatures (preloadCreatures) */
for (const n of ['gouger', 'hoopsnake', 'splintercat', 'goofus']) registerPreload('cryptid:' + n, () => loadReal(n).catch((e) => { console.warn('[cryptids] ' + n, e); }));

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ax = new THREE.Vector3();

export interface PlayOpts {
  /** cross-fade seconds */
  fade?: number;
  /** play once and hold the last frame */
  once?: boolean;
  /** playback rate */
  speed?: number;
  /** start again even if it is the current clip */
  restart?: boolean;
}

export abstract class RealCryptid implements NewCryptid {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly favoriteFood: string;
  abstract readonly rules: readonly string[];
  /** sound-bank id per event */
  abstract readonly sounds: Record<string, string | undefined>;
  /** world placement: position = pos, rotation.y = heading */
  readonly object = new THREE.Group();
  /** slope tilt (pitch, roll) and whatever a creature's gimmick does to its whole body */
  readonly tilt = new THREE.Group();
  /** the model, under the tilt (offset by a creature for rolls and hangs) */
  readonly holder = new THREE.Group();
  body: THREE.Object3D | null = null;
  mesh: THREE.SkinnedMesh | null = null;
  mixer: THREE.AnimationMixer | null = null;
  fx: CreatureFx | null = null;
  /** dithered dissolve 0 gone .. 1 solid (the Book reads it) */
  readonly fade = { value: 1 };
  readonly pos = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  heading = 0; speed = 0;
  state = 'idle';
  trust = 0;
  /** the test page / portraits drive clips by hand */
  manual: string | null = null;
  protected bones: Record<string, THREE.Bone> = {};
  protected ctx!: CreatureCtx;
  /** seconds alive, seconds in the current state */
  protected t = 0; protected st = 0;
  /** steering: where to go, how fast (m/s), arrive radius, a heading to face when standing, turn rate */
  protected target = new THREE.Vector3(); protected want = 0; protected arrive = 0.4; protected face: number | null = null;
  protected turnK = 2.4;
  /** it moves backwards (the goofus bird): it faces away from where it goes */
  protected reverse = false;
  /** the player: horizontal distance, smoothed speed */
  protected dist = 99; protected pSpeed = 0; private lastP = new THREE.Vector3();
  /** body length / width for the slope tilt (0 width: no roll) */
  protected tiltLen = 1; protected tiltWid = 0;
  /** extra roll (rad, + rolls toward its right) and pitch on top of the slope */
  protected roll = 0; protected pitch = 0;
  protected shineK = 0.6;
  /** the clip playing (or wanted, before the model loads) and how long it has */
  protected clip = ''; protected clipT = 0; private clipOpts: PlayOpts = {};
  private actions = new Map<string, THREE.AnimationAction>();
  private fadeU: { value: number } | null = null;
  private farAcc = 0; private farN = 0;
  private uFade = 1;

  constructor(readonly modelName: string, o: { pos?: THREE.Vector3; heading?: number } = {}) {
    this.object.name = 'cryptid';
    this.object.add(this.tilt); this.tilt.add(this.holder);
    if (o.pos) { this.pos.copy(o.pos); this.home.copy(o.pos); }
    this.heading = o.heading ?? 0;
    this.object.position.copy(this.pos); this.object.rotation.y = this.heading;
    // the model goes on at the first update (a subclass's own fields are not set up yet in here)
    if (!realModel(modelName)) loadReal(modelName).catch((e) => console.warn('[cryptids]', modelName, e));
  }

  /** the model's clips (the test page and the Book's portraits) */
  get clips(): string[] { const m = realModel(this.modelName); return m ? Object.keys(m.clips) : []; }
  get ready(): boolean { return !!this.mixer; }
  /** the test page: play a clip by hand (null hands back to the AI) */
  play(clip: string | null) { this.manual = clip; if (clip) this.anim(clip, { restart: true, fade: 0.15 }); }

  private attach(m: RealModel) {
    if (this.body) return;
    const body = cloneSkinned(m.scene);
    let mesh: THREE.SkinnedMesh | null = null;
    body.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone;
    });
    const sk = mesh as unknown as THREE.SkinnedMesh;
    const { mat, depth, fx } = creatureMaterial(m.map, m.sd, { shineCol: this.shineColor() });
    mat.roughness = 1; mat.metalness = 1;
    sk.material = mat; sk.customDepthMaterial = depth;
    sk.castShadow = true; sk.receiveShadow = true; sk.frustumCulled = false;
    this.fadeU = dissolve(mat, depth);
    this.fx = fx; this.mesh = sk; this.body = body;
    this.holder.add(body);
    this.mixer = new THREE.AnimationMixer(body);
    this.onAttach();
    const want = this.clip || (m.clips.idle ? 'idle' : Object.keys(m.clips)[0]);
    this.clip = '';
    this.anim(want, { ...this.clipOpts, fade: 0.01 });
  }
  /** after the model is in (find bones, measure) */
  protected onAttach() { /* */ }
  protected shineColor(): THREE.ColorRepresentation { return 0xc8ff9a; }

  // ------------------------------------------------------------------------------------------------ clips
  private action(name: string): THREE.AnimationAction | null {
    let a = this.actions.get(name);
    if (!a) {
      const c = realModel(this.modelName)?.clips[name];
      if (!c || !this.mixer) return null;
      a = this.mixer.clipAction(c);
      this.actions.set(name, a);
    }
    return a;
  }
  /** cross-fade to a clip (no-op when it is already playing, except a new speed) */
  protected anim(name: string, o: PlayOpts = {}) {
    if (!this.mixer) { this.clip = name; this.clipOpts = o; return; }
    const next = this.action(name);
    if (!next) return;
    if (name === this.clip && !o.restart) { if (o.speed !== undefined) next.timeScale = o.speed; return; }
    const fade = o.fade ?? 0.3;
    for (const [k, a] of this.actions) if (k !== name && a.isRunning() && a.getEffectiveWeight() > 0) a.fadeOut(fade);
    next.reset();
    next.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!o.once;
    next.timeScale = o.speed ?? 1;
    next.setEffectiveWeight(1);
    next.fadeIn(fade).play();
    this.clip = name; this.clipT = 0;
  }
  /** seconds a clip lasts (at speed 1) */
  protected clipLen(name: string): number { return realModel(this.modelName)?.clips[name]?.duration ?? 1; }
  /** the current one-shot has played out */
  protected get clipDone(): boolean { const a = this.actions.get(this.clip); return !a || (a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 0.02); }
  /** set the current clip's playback rate (walk clips follow the ground speed) */
  protected rate(r: number) { const a = this.actions.get(this.clip); if (a) a.timeScale = r; }

  // ------------------------------------------------------------------------------------------------ per frame
  update(ctx: CreatureCtx) {
    this.ctx = ctx;
    if (!this.body) { const m = realModel(this.modelName); if (m) this.attach(m); }
    const dt = Math.min(0.1, Math.max(0, ctx.dt)); this.t += dt; this.st += dt; this.clipT += dt;
    const P = ctx.player;
    this.dist = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    const ps = P.speed ?? (this.lastP.lengthSq() > 0 && dt > 0 ? Math.hypot(P.pos.x - this.lastP.x, P.pos.z - this.lastP.z) / dt : 0);
    this.pSpeed = damp(this.pSpeed, Math.min(12, ps), 6, dt); this.lastP.copy(P.pos);
    if (!this.manual) this.think(ctx, dt);
    this.move(ctx, dt);
    this.place(ctx, dt);
    // far away the clips tick at a third of the rate
    if (this.mixer) {
      this.farAcc += dt;
      if (this.dist < 90 || ++this.farN % 3 === 0) { this.mixer.update(this.farAcc); this.farAcc = 0; }
    }
    if (this.body) this.pose(ctx, dt);
    this.after(ctx, dt);
    if (this.fx) this.fx.shine.value = (1 - daylight(ctx.hour)) * (P.light ? 0.9 : 0.35) * this.shineK;
    if (this.fadeU) this.fadeU.value = this.fade.value;
    this.object.visible = this.fade.value > 0.01;
  }
  protected abstract think(ctx: CreatureCtx, dt: number): void;
  abstract offer(item: string): boolean;
  /** bone tweaks after the clips (looks, hoops, kicks) */
  protected pose(_ctx: CreatureCtx, _dt: number) { /* */ }
  protected after(_ctx: CreatureCtx, _dt: number) { /* */ }

  protected go(s: string) { if (s !== this.state) { this.state = s; this.st = 0; } }
  /** raise trust; true the moment it reaches 1 (befriended) */
  protected gainTrust(k: number) { const was = this.trust; this.trust = Math.min(1, this.trust + k); return was < 1 && this.trust >= 1; }
  protected emit(ev: string, extra: Record<string, unknown> = {}) {
    this.ctx?.emit(ev, { pos: this.object.position.clone(), who: this.id, sound: this.sounds[ev], ...extra });
  }
  protected faceToward(p: THREE.Vector3) { this.face = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }
  /** a loose item of a kind near a point */
  protected itemNear(ctx: CreatureCtx, kind: RegExp, at: THREE.Vector3, r: number): GroundItem | null {
    let best: GroundItem | null = null, bd = r;
    for (const it of ctx.items ?? []) { if (!kind.test(it.kind)) continue; const d = Math.hypot(it.pos.x - at.x, it.pos.z - at.z); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  /** the angle (rad) between the player's look and the line to a point */
  protected viewAngle(ctx: CreatureCtx, at: THREE.Vector3 = this.pos): number {
    const P = ctx.player, dx = at.x - P.pos.x, dz = at.z - P.pos.z, l = Math.hypot(dx, dz) || 1, dl = Math.hypot(P.dir.x, P.dir.z) || 1;
    return Math.acos(clamp((dx * P.dir.x + dz * P.dir.z) / (l * dl), -1, 1));
  }

  protected move(ctx: CreatureCtx, dt: number) {
    if (this.manual) { this.speed = 0; return; }
    const tx = this.target.x - this.pos.x, tz = this.target.z - this.pos.z, d = Math.hypot(tx, tz);
    let w = d < this.arrive ? 0 : this.want;
    const dirA = Math.atan2(tx, tz) + (this.reverse ? Math.PI : 0);
    if (w > 0) this.heading = dampAngle(this.heading, dirA, this.turnK, dt);
    else if (this.face !== null) this.heading = dampAngle(this.heading, this.face, this.turnK * 0.6, dt);
    w *= clamp(1.25 - Math.abs(wrapAngle(dirA - this.heading)) * 0.55, 0.15, 1);
    this.speed = damp(this.speed, w, w > this.speed ? 3 : 5, dt);
    const s = this.reverse ? -1 : 1;
    this.pos.x += Math.sin(this.heading) * this.speed * dt * s; this.pos.z += Math.cos(this.heading) * this.speed * dt * s;
    this.pos.y = ctx.heightAt(this.pos.x, this.pos.z);
  }
  /** the group follows pos / heading; the tilt follows the slope under the body (plus roll / pitch) */
  protected place(ctx: CreatureCtx, dt: number) {
    this.object.position.copy(this.pos); this.object.rotation.set(0, this.heading, 0);
    const s = Math.sin(this.heading), c = Math.cos(this.heading), L = this.tiltLen * 0.5, W = this.tiltWid * 0.5;
    const hf = ctx.heightAt(this.pos.x + s * L, this.pos.z + c * L), hb = ctx.heightAt(this.pos.x - s * L, this.pos.z - c * L);
    // + pitch dips the nose (Three's +X rotation); + roll drops its right side (+Z rotation, it faces +Z)
    const p = this.tiltLen > 0 ? Math.atan2(hb - hf, Math.max(0.2, L * 2)) : 0;
    let r = 0;
    if (W > 0) {
      // the creature's right is (-cos h, 0, sin h)
      const hr = ctx.heightAt(this.pos.x - c * W, this.pos.z + s * W), hl = ctx.heightAt(this.pos.x + c * W, this.pos.z - s * W);
      r = Math.atan2(hl - hr, W * 2);
    }
    this.tilt.rotation.x = damp(this.tilt.rotation.x, clamp(p * 0.8 + this.pitch, -1.6, 1.6), 6, dt);
    this.tilt.rotation.z = damp(this.tilt.rotation.z, clamp(r * 0.8 + this.roll, -3.3, 3.3), 6, dt);
  }

  /** turn a bone toward a world point (yaw about world up, then pitch), weight 0..1; call in pose() */
  protected turnBone(name: string, at: THREE.Vector3, w: number, maxYaw = 1, maxPitch = 0.5) {
    const b = this.bones[name];
    if (!b || w <= 0.001) return;
    b.updateWorldMatrix(true, false);
    const bp = _v.setFromMatrixPosition(b.matrixWorld);
    const fwd = _w.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const dx = at.x - bp.x, dz = at.z - bp.z;
    const yaw = clamp(wrapAngle(Math.atan2(dx, dz) - Math.atan2(fwd.x, fwd.z)), -maxYaw, maxYaw) * w;
    const pitch = clamp(Math.atan2(at.y - bp.y, Math.hypot(dx, dz) || 1), -maxPitch, maxPitch) * w;
    b.getWorldQuaternion(_q).invert();
    b.quaternion.multiply(_q2.setFromAxisAngle(_ax.copy(UP).applyQuaternion(_q), yaw));
    // pitch: about the creature's right axis, in the bone's frame
    b.quaternion.multiply(_q2.setFromAxisAngle(_ax.set(-Math.cos(this.heading + yaw), 0, Math.sin(this.heading + yaw)).applyQuaternion(_q), -pitch));
  }
  /** swing a bone about a world axis by `a` rad (on top of its clip pose); call in pose() */
  protected swingBone(name: string, axisWorld: THREE.Vector3, a: number) {
    const b = this.bones[name];
    if (!b || Math.abs(a) < 1e-4) return;
    b.updateWorldMatrix(true, false);
    b.getWorldQuaternion(_q).invert();
    b.quaternion.multiply(_q2.setFromAxisAngle(_ax.copy(axisWorld).applyQuaternion(_q).normalize(), a));
  }
}

export { clamp, damp, dampAngle, wrapAngle };
