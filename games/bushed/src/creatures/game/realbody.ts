// Real animal bodies: rigged, animated glTF models (public/assets/models/creatures/<kind>/, built from Sketchfab
// sources by tools/blender/fauna/*.py; credits in CREDITS.md and ATTRIBUTION.json there). One asset per file, loaded
// once; every animal is a SkeletonUtils clone sharing its geometry, material and clips (one skinned mesh = one draw
// call), played by a THREE.AnimationMixer with cross-fades, plus small procedural layers on top (a head turned
// toward what it looks at, a wagging tail, a jaw, ears, blinks) applied in model space after the mixer.
//   const asset = await realAsset('deer/doe.glb');          // or realAssetNow(...) once preloaded
//   const body = new RealBody(asset); scene.add(body.object);
//   body.play('walk', { fade: 0.3, speed: 1.2 }); body.update(dt);
//   body.turn(body.bone('head'), UP, 0.4);                   // after update(): yaw the head 0.4 rad to its left
// Model space (glTF): +z forward, +y up, +x the animal's left, metres, ground at y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { creatureMaterial, type CreatureFx } from '../rig';
import { applyPixelTex } from '../../gfx/tex';

export const REAL_BASE = 'assets/models/creatures/';
/** model-space axes: +x the animal's left (pitch: + tips a forward-pointing bone down), +y up (yaw: + turns left),
 *  +z forward (roll) */
export const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) } as const;

export interface RealAsset {
  file: string;
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial; fx: CreatureFx;
  tris: number; bones: number;
  /** the rest-pose bounds of the mesh (model space) */
  box: THREE.Box3;
}

const pending = new Map<string, Promise<RealAsset>>();
const ready = new Map<string, RealAsset>();
let gltf: GLTFLoader | null = null;

/** load a real animal (cached): '<kind>/<file>.glb' under assets/models/creatures/ */
export function realAsset(file: string, o: { shineCol?: THREE.ColorRepresentation; cull?: number } = {}): Promise<RealAsset> {
  let p = pending.get(file);
  if (!p) {
    gltf ??= new GLTFLoader();
    p = gltf.loadAsync(REAL_BASE + file).then((g) => {
      let mesh: THREE.SkinnedMesh | null = null, bones = 0;
      g.scene.traverse((x) => { if ((x as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = x as THREE.SkinnedMesh; if ((x as THREE.Bone).isBone) bones++; });
      if (!mesh) throw new Error('no skinned mesh in ' + file);
      const m = mesh as THREE.SkinnedMesh;
      const src = m.material as THREE.MeshStandardMaterial;
      const map = src.map!, sd = (src.roughnessMap ?? src.metalnessMap)!;
      applyPixelTex(map, { srgb: true });
      applyPixelTex(sd, { srgb: false });
      const { mat, depth, fx } = creatureMaterial(map, sd, { shineCol: o.shineCol ?? 0xd8f0b0 });
      if (src.normalMap) { mat.normalMap = src.normalMap; applyPixelTex(mat.normalMap, { srgb: false }); mat.normalScale.set(0.8, 0.8); }
      mat.side = THREE.FrontSide;
      depth.side = THREE.FrontSide;
      src.dispose();
      m.material = mat;
      // the skinned bounds: the rest pose grown enough for every clip (a deer lying down, a dog rearing up)
      const geo = m.geometry;
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      geo.boundingSphere!.radius *= o.cull ?? 1.7;
      const clips = new Map<string, THREE.AnimationClip>();
      for (const c of g.animations) clips.set(c.name, c);
      const a: RealAsset = { file, scene: g.scene, clips, mat, depth, fx, tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3, bones, box: geo.boundingBox!.clone() };
      ready.set(file, a);
      return a;
    });
    pending.set(file, p);
    p.catch((e) => { console.warn('[real]', file, e); pending.delete(file); });
  }
  return p;
}
/** a loaded asset, or null while it is still loading */
export function realAssetNow(file: string): RealAsset | null { return ready.get(file) ?? null; }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

export interface PlayOpts { fade?: number; once?: boolean; restart?: boolean; speed?: number; at?: number }

export class RealBody {
  readonly object = new THREE.Group();
  readonly root: THREE.Object3D;
  readonly mesh: THREE.SkinnedMesh;
  readonly mixer: THREE.AnimationMixer;
  /** every bone, by name; `skel.bones` mirrors the old Skel API (test pages print the count) */
  readonly bones: Record<string, THREE.Bone> = {};
  readonly skel: { bones: THREE.Bone[] };
  private actions = new Map<string, THREE.AnimationAction>();
  private cur: THREE.AnimationAction | null = null;
  /** the clip playing (or fading in) now */
  current = '';
  private touched: THREE.Bone[] = [];
  private saved: THREE.Quaternion[] = [];
  private savedPos: THREE.Vector3[] = [];
  private nTouched = 0;

  constructor(readonly asset: RealAsset) {
    this.root = skClone(asset.scene);
    let mesh: THREE.SkinnedMesh | null = null;
    const list: THREE.Bone[] = [];
    this.root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh;
      if ((o as THREE.Bone).isBone) { this.bones[o.name] = o as THREE.Bone; list.push(o as THREE.Bone); }
    });
    this.mesh = mesh!;
    this.mesh.material = asset.mat;
    this.mesh.customDepthMaterial = asset.depth;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // cull with the grown rest-pose sphere (a skinned mesh would otherwise cache the sphere of its first pose)
    this.mesh.boundingSphere = this.mesh.geometry.boundingSphere!.clone();
    this.skel = { bones: list };
    this.object.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.root);
  }

  has(clip: string): boolean { return this.asset.clips.has(clip); }
  bone(name: string): THREE.Bone | null { return this.bones[name] ?? null; }
  action(clip: string): THREE.AnimationAction | null {
    let a = this.actions.get(clip);
    if (!a) {
      const c = this.asset.clips.get(clip);
      if (!c) return null;
      a = this.mixer.clipAction(c);
      this.actions.set(clip, a);
    }
    return a;
  }
  /** cross-fade to a clip (no-op when it is already playing, unless restart). once: play it through and hold the
   *  last frame; speed: the playback rate; at: start at this fraction of the clip */
  play(clip: string, o: PlayOpts = {}): boolean {
    const a = this.action(clip);
    if (!a) return false;
    if (o.speed !== undefined) a.timeScale = o.speed;
    if (a === this.cur && !o.restart) return true;
    const fade = o.fade ?? 0.3;
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    if (a !== this.cur || o.restart) {
      a.enabled = true;
      if (o.restart || o.once || a.getEffectiveWeight() < 0.05) a.time = (o.at ?? 0) * a.getClip().duration;
      a.paused = false;
      a.setEffectiveWeight(1);
      a.play();
      if (this.cur && this.cur !== a) { a.crossFadeFrom(this.cur, fade, false); }
      else if (!this.cur) a.fadeIn(0.0001);
    }
    this.cur = a; this.current = clip;
    return true;
  }
  /** the playback rate of the current clip */
  set speed(k: number) { if (this.cur) this.cur.timeScale = k; }
  /** seconds into the current clip, and its length */
  get time(): number { return this.cur ? this.cur.time : 0; }
  get duration(): number { return this.cur ? this.cur.getClip().duration : 0; }
  /** a one-shot finished (holding its last frame) */
  get done(): boolean { return !!this.cur && this.cur.loop === THREE.LoopOnce && this.cur.time >= this.cur.getClip().duration - 1e-3; }

  /** advance the clips; then the caller adds its procedural layers with turn()/shift() */
  update(dt: number) {
    // undo last frame's procedural layers on bones no clip track rewrites
    for (let i = 0; i < this.nTouched; i++) { this.touched[i].quaternion.copy(this.saved[i]); this.touched[i].position.copy(this.savedPos[i]); }
    this.nTouched = 0;
    this.mixer.update(dt);
  }
  private keep(b: THREE.Bone) {
    for (let i = 0; i < this.nTouched; i++) if (this.touched[i] === b) return;
    const i = this.nTouched++;
    if (i >= this.saved.length) { this.saved.push(new THREE.Quaternion()); this.savedPos.push(new THREE.Vector3()); this.touched.push(b); }
    this.touched[i] = b; this.saved[i].copy(b.quaternion); this.savedPos[i].copy(b.position);
  }
  /** the model-space rotation of a bone's parent (walking up to the model root) */
  private parentQ(b: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
    out.identity();
    for (let p = b.parent; p && p !== this.root; p = p.parent) out.premultiply(p.quaternion);
    return out;
  }
  /** rotate a bone (and so everything it carries) about a MODEL-space axis by `angle` rad, on top of the clip */
  turn(b: THREE.Bone | null, axis: THREE.Vector3, angle: number) {
    if (!b || Math.abs(angle) < 1e-5) return;
    this.keep(b);
    this.parentQ(b, _q2);
    _v.copy(axis).applyQuaternion(_q2.invert());
    b.quaternion.premultiply(_q.setFromAxisAngle(_v, angle));
  }
  /** move a bone by a model-space offset (m), on top of the clip */
  shift(b: THREE.Bone | null, x: number, y: number, z: number) {
    if (!b) return;
    this.keep(b);
    this.parentQ(b, _q2);
    // the parent's scale is ignored: these rigs carry no scale above their roots
    b.position.add(_v.set(x, y, z).applyQuaternion(_q2.invert()));
  }
  /** blend a bone's local rotation toward another clip's pose at time t (weight 0..1): blinks from a pose clip */
  blendTo(b: THREE.Bone | null, q: THREE.Quaternion, w: number) {
    if (!b || w <= 0) return;
    this.keep(b);
    b.quaternion.slerp(q, Math.min(1, w));
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); this.object.removeFromParent(); }
}

/** a pose clip's local rotation for one bone (its first key): blinks, a held mouth */
export function clipPose(asset: RealAsset, clip: string, bone: string): THREE.Quaternion | null {
  const c = asset.clips.get(clip);
  const t = c?.tracks.find((k) => k.name === bone + '.quaternion');
  if (!t) return null;
  const v = t.values;
  return new THREE.Quaternion(v[0], v[1], v[2], v[3]);
}
