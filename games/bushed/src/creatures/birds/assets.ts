// Bird models: real rigged birds (tools/blender/birds_bugs, credits in CREDITS.md and
// public/assets/models/creatures/birds/ATTRIBUTION.json), loaded once and cloned per bird (SkeletonUtils.clone: shared
// geometry, material and clips; one skinned mesh = one draw call per bird).
//   songbird.glb   one feathered small-bird rig worn by the chickadee, the Canada jay, and the flying doubles of the
//                  woodpecker and the grouse; each gets its own painted coat (coat_*.webp) and size
//                  clips: idle, idle2, call, call2, eat, eat2, walk, fly, glide
//   raven.glb      idle, idle2, walk, run, hop, fly, glide, takeoff, caw
//   woodpecker.glb a hairy woodpecker scan: idle, drum, peck, hitch (it clings to bark; it flies as the songbird double)
//   grouse.glb     a ruffed grouse scan: idle, walk, drum, alert (it bursts away as the songbird double)
//   loon.glb       a swimming common loon: idle (head turns)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

export type BirdKind = 'chickadee' | 'jay' | 'raven' | 'woodpecker' | 'grouse' | 'loon';
/** a body: a model file worn at a size, optionally in another coat */
export type BodyId = 'chickadee' | 'jay' | 'woodfly' | 'grousefly' | 'raven' | 'woodpecker' | 'grouse' | 'loon';

interface BodySpec {
  file: string; coat?: string; scale: number;
  /** lift (m, at scale 1) so the toes stand on y=0 */
  lift: number;
  /** extra bone scales (tail length, bill) applied after load: [bone name prefix, x, y, z] */
  bones?: [string, number, number, number][];
  /** material look */
  rough?: number; tint?: number;
}
const BASE = 'assets/models/creatures/birds/';
export const BODY: Record<BodyId, BodySpec> = {
  // the source robin is 10.9 cm bill to tail
  chickadee: { file: 'songbird.glb', coat: 'coat_chickadee.webp', scale: 1.2, lift: 0.0095, rough: 0.85 },
  jay: { file: 'songbird.glb', coat: 'coat_jay.webp', scale: 2.55, lift: 0.0095, bones: [['Tail_1', 1, 1.35, 1], ['Head', 1.08, 1.08, 1.08]], rough: 0.9 },
  woodfly: { file: 'songbird.glb', coat: 'coat_woodpecker.webp', scale: 2.1, lift: 0.0095, bones: [['Tail_1', 1, 1.2, 1]], rough: 0.8 },
  grousefly: { file: 'songbird.glb', coat: 'coat_grouse.webp', scale: 3.9, lift: 0.0095, bones: [['Tail_1', 1.3, 1.3, 1.3]], rough: 0.9 },
  raven: { file: 'raven.glb', scale: 1, lift: 0, rough: 0.45, tint: 0.8 },
  woodpecker: { file: 'woodpecker.glb', scale: 1, lift: 0, rough: 0.85 },
  grouse: { file: 'grouse.glb', scale: 1, lift: 0, rough: 0.9 },
  loon: { file: 'loon.glb', scale: 1, lift: 0, rough: 0.55 },
};

interface Loaded { scene: THREE.Object3D; clips: THREE.AnimationClip[] }
const files = new Map<string, Promise<Loaded>>();
const coats = new Map<string, Promise<THREE.Texture>>();
const mats = new Map<BodyId, THREE.Material>();
const ready = new Map<BodyId, { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; mat: THREE.Material }>();
let gltf: GLTFLoader | null = null;

function pixelish(t: THREE.Texture): THREE.Texture {
  // the game's look: sharp texels up close, mipmapped far away
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
/** feathers are cards: point every normal outward from the bird's middle (blended with its own, turned the right way)
 *  so a card seen from either side is lit like the plumage it sits in, never black */
function featherNormals(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.geometry.userData.featherNormals) return;
    const g = m.geometry, P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute;
    if (!N) return;
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3()), r = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      r.fromBufferAttribute(P, i).sub(c).normalize();
      n.fromBufferAttribute(N, i);
      if (n.dot(r) < 0) n.negate();
      n.multiplyScalar(0.45).addScaledVector(r, 0.55).normalize();
      N.setXYZ(i, n.x, n.y, n.z);
    }
    N.needsUpdate = true;
    g.userData.featherNormals = true;
  });
}
/** double-sided without flipping the normal on the back face (the feather normals above are already outward) */
function oneNormal(m: THREE.Material): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `
      float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
      vec3 normal = normalize( vNormal );
      vec3 nonPerturbedNormal = normal;`);
  };
  m.customProgramCacheKey = () => 'bird-feathers';
}
function loadFile(f: string): Promise<Loaded> {
  let p = files.get(f);
  if (!p) {
    gltf ??= new GLTFLoader();
    p = gltf.loadAsync(BASE + f).then((g) => {
      // clips without scale tracks, so the per-species bone scales (tail, head) survive the mixer
      for (const c of g.animations) c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale'));
      if (f === 'songbird.glb' || f === 'raven.glb') featherNormals(g.scene);
      return { scene: g.scene, clips: g.animations };
    });
    files.set(f, p);
  }
  return p;
}
function loadCoat(f: string): Promise<THREE.Texture> {
  let p = coats.get(f);
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(BASE + f).then((t) => {
      // as a glTF texture: unflipped, sRGB, repeating (the feather atlas's UVs run past the edges)
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return pixelish(t);
    });
    coats.set(f, p);
  }
  return p;
}

/** load (once) every body the given kinds need */
export async function loadBodies(ids: BodyId[]): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    if (ready.has(id)) return;
    const s = BODY[id];
    const [L, coat] = await Promise.all([loadFile(s.file), s.coat ? loadCoat(s.coat) : Promise.resolve(null)]);
    let mat = mats.get(id);
    if (!mat) {
      let src: THREE.MeshStandardMaterial | null = null;
      L.scene.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (mm && !src) src = mm; });
      // a fresh material (the glTF's own is set up for alpha blending, without depth writes: the feather layers sort wrong)
      const map = coat ?? (src as THREE.MeshStandardMaterial | null)?.map ?? null;
      if (map && !coat) pixelish(map);
      const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.4, side: THREE.DoubleSide, roughness: s.rough ?? 0.85, metalness: 0 });
      if (s.tint !== undefined) m.color.setScalar(s.tint);
      if (s.file === 'songbird.glb' || s.file === 'raven.glb') oneNormal(m);
      mat = m; mats.set(id, m);
    }
    const clips = new Map<string, THREE.AnimationClip>();
    for (const c of L.clips) clips.set(c.name === 'Head Turn' ? 'idle' : c.name, c);
    ready.set(id, { scene: L.scene, clips, mat });
  }));
}

export function bodyLoaded(id: BodyId): boolean { return ready.has(id); }

/** one bird's body: a clone of the model with its own skeleton, the shared material, a mixer and its actions */
export class Body {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly actions = new Map<string, THREE.AnimationAction>();
  readonly bones = new Map<string, THREE.Bone>();
  cur = '';
  /** time not yet given to the mixer (far birds update every few frames) */
  acc = 0;
  private curAct: THREE.AnimationAction | null = null;
  constructor(readonly id: BodyId) {
    const r = ready.get(id);
    if (!r) throw new Error(`bird body ${id} not loaded`);
    const s = BODY[id];
    this.model = skClone(r.scene);
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) { m.material = r.mat; m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; }
      if ((o as THREE.Bone).isBone) this.bones.set(o.name.replace(/_\d+$/, ''), o as THREE.Bone);
    });
    for (const [pre, x, y, z] of s.bones ?? []) for (const [n, b] of this.bones) if (n === pre || n.startsWith(pre + '_')) { b.scale.set(x, y, z); break; }
    this.model.scale.setScalar(s.scale);
    this.model.position.y = s.lift * s.scale;
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [n, c] of r.clips) this.actions.set(n, this.mixer.clipAction(c));
  }
  has(name: string): boolean { return this.actions.has(name); }
  /** cross-fade to a clip (loops); timeScale for gait speed */
  play(name: string, fade = 0.25, timeScale = 1, once = false): void {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = timeScale;
    if (this.cur === name && !once) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true; a.setEffectiveWeight(1);
    a.play();
    if (this.curAct && this.curAct !== a) this.curAct.crossFadeTo(a, fade, false);
    this.curAct = a; this.cur = name;
  }
  /** the current clip has played through (for one-shots) */
  get done(): boolean { const a = this.curAct; return !!a && a.loop === THREE.LoopOnce && !a.isRunning(); }
  update(dt: number): void { this.mixer.update(dt); }
}
