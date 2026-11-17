// Creature rigs: a bone list (rest positions in creature space, rest rotations identity, as ODDWORLD's morph.ts rigs)
// turned into a THREE.Skeleton, a small model-space forward kinematics pass, two-bone IK that keeps each knee in its
// pole plane, and the creature material (MeshStandardMaterial with the anatomy page's surface data as roughness and
// metalness maps, alpha-cut hair, and eye shine: the tapetum lighting up when a light sits by the viewer's eye).
import * as THREE from 'three';
import { G } from '../gfx/globals';

export type V3 = [number, number, number];
export interface BoneDef { name: string; parent: number; pos: V3 }

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class Skel {
  readonly defs: BoneDef[];
  readonly bones: THREE.Bone[];
  readonly idx: Record<string, number> = {};
  /** rest offsets from the parent (creature space, rotations are identity at rest) */
  readonly restLocal: THREE.Vector3[];
  readonly restWorld: THREE.Vector3[];
  /** model-space rotation and position of every bone after fk() */
  readonly Q: THREE.Quaternion[];
  readonly P: THREE.Vector3[];
  readonly inverses: THREE.Matrix4[];
  constructor(defs: BoneDef[]) {
    this.defs = defs;
    this.restWorld = defs.map((d) => new THREE.Vector3(...d.pos));
    this.restLocal = defs.map((d, i) => (d.parent >= 0 ? this.restWorld[i].clone().sub(this.restWorld[d.parent]) : this.restWorld[i].clone()));
    this.bones = defs.map((d, i) => { const b = new THREE.Bone(); b.name = d.name; b.position.copy(this.restLocal[i]); this.idx[d.name] = i; return b; });
    defs.forEach((d, i) => { if (d.parent >= 0) { if (d.parent >= i) throw new Error('bones must follow their parents: ' + d.name); this.bones[d.parent].add(this.bones[i]); } });
    this.Q = defs.map(() => new THREE.Quaternion());
    this.P = defs.map(() => new THREE.Vector3());
    this.inverses = this.restWorld.map((p) => new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  }
  i(name: string): number { const k = this.idx[name]; if (k === undefined) throw new Error('no bone ' + name); return k; }
  /** a skinned mesh over this skeleton */
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.SkinnedMesh {
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(this.bones[0]);
    mesh.bind(new THREE.Skeleton(this.bones, this.inverses), new THREE.Matrix4());
    return mesh;
  }
  /** reset every bone to rest */
  rest() { this.bones.forEach((b, i) => { b.position.copy(this.restLocal[i]); b.quaternion.identity(); }); }
  /** model-space transforms of every bone from the bones' local position/quaternion (from bone `from` on) */
  fk(from = 0) {
    for (let i = from; i < this.bones.length; i++) {
      const b = this.bones[i], p = this.defs[i].parent;
      if (p < 0) { this.Q[i].copy(b.quaternion); this.P[i].copy(b.position); }
      else { this.Q[i].multiplyQuaternions(this.Q[p], b.quaternion); this.P[i].copy(b.position).applyQuaternion(this.Q[p]).add(this.P[p]); }
    }
  }
  /** fk for one bone (its parent must be current) */
  fk1(i: number) {
    const b = this.bones[i], p = this.defs[i].parent;
    if (p < 0) { this.Q[i].copy(b.quaternion); this.P[i].copy(b.position); return; }
    this.Q[i].multiplyQuaternions(this.Q[p], b.quaternion); this.P[i].copy(b.position).applyQuaternion(this.Q[p]).add(this.P[p]);
  }
  /** set a bone's local rotation so its model-space rotation is `q` (its parent must be current) */
  orient(i: number, q: THREE.Quaternion) {
    const p = this.defs[i].parent;
    if (p < 0) this.bones[i].quaternion.copy(q); else this.bones[i].quaternion.copy(_q.copy(this.Q[p]).invert().multiply(q));
    this.fk1(i);
  }
  /** two-bone IK: bones a (upper, at the hip), b (lower, at the knee) and the end joint c (its position is the joint
   *  the target is for). The knee bends toward `pole` (model space). Leaves a, b, c current in the model arrays. */
  ik2(a: number, b: number, c: number, target: THREE.Vector3, pole: THREE.Vector3, weight = 1) {
    this.fk1(a);
    const L1 = this.restLocal[b].length(), L2 = this.restLocal[c].length();
    const A = this.P[a];
    if (weight < 1) {
      // blend the target with where the leg's FK pose already puts the end joint
      this.fk1(b); this.fk1(c);
      _e.copy(this.P[c]).lerp(target, weight);
    } else _e.copy(target);
    const D = _a.copy(_e).sub(A);
    let d = D.length();
    const dir = d > 1e-6 ? D.multiplyScalar(1 / d) : D.set(0, -1, 0);
    d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-3, d));
    const aa = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
    const pp = _b.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1).addScaledVector(dir, -dir.z);
    pp.normalize();
    const K = _c.copy(A).addScaledVector(dir, aa).addScaledVector(pp, h);
    const E = _d.copy(A).addScaledVector(dir, d);
    // upper: rest basis (its rest direction, the pole) -> new basis (toward the knee, the knee's offset)
    const qa = basisRot(this.restLocal[b], pole, _e.copy(K).sub(A), pp, _q2);
    this.orient(a, qa);
    const qb = basisRot(this.restLocal[c], pole, _e.copy(E).sub(K), pp, _q2);
    this.orient(b, qb);
    this.fk1(c);
  }
}
/** the rotation taking the rest frame (x along restDir, y toward restPole) to the frame (x along dir, y toward pole) */
function basisRot(restDir: THREE.Vector3, restPole: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const x0 = new THREE.Vector3().copy(restDir).normalize();
  const y0 = new THREE.Vector3().copy(restPole).addScaledVector(x0, -restPole.dot(x0));
  if (y0.lengthSq() < 1e-8) y0.set(0, 0, 1).addScaledVector(x0, -x0.z);
  y0.normalize();
  const z0 = new THREE.Vector3().crossVectors(x0, y0);
  const x1 = new THREE.Vector3().copy(dir).normalize();
  const y1 = new THREE.Vector3().copy(pole).addScaledVector(x1, -pole.dot(x1));
  if (y1.lengthSq() < 1e-8) y1.copy(y0);
  y1.normalize();
  const z1 = new THREE.Vector3().crossVectors(x1, y1);
  _m.makeBasis(x1, y1, z1);
  _m2.makeBasis(x0, y0, z0).transpose();
  return out.setFromRotationMatrix(_m.multiply(_m2));
}

// ------------------------------------------------------------------------------------------------ material
export interface CreatureFx {
  /** 0..1 how strongly the eyes shine back (night, a light near the viewer) */
  shine: { value: number };
  shineCol: { value: THREE.Color };
}
/** the creature material: pixel-art colour page, the surface-data page as roughness (G) and metalness (B), alpha-cut
 *  hair, eye shine from the surface page's R channel. Picks up scene.environment for the steel's reflections. */
export function creatureMaterial(tex: THREE.Texture, sd: THREE.Texture, o: { shineCol?: THREE.ColorRepresentation; envMap?: THREE.Texture | null } = {}): { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial; fx: CreatureFx } {
  const fx: CreatureFx = { shine: { value: 0 }, shineCol: { value: new THREE.Color(o.shineCol ?? 0xc8ff9a) } };
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughnessMap: sd, metalnessMap: sd, roughness: 1, metalness: 1,
    alphaTest: 0.5, side: THREE.DoubleSide, envMap: o.envMap ?? null, envMapIntensity: 1,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uShine = fx.shine; sh.uniforms.uShineCol = fx.shineCol; sh.uniforms.uWet = G.uWet;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uShine, uWet; uniform vec3 uShineCol;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, uWet);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // eye shine: the tapetum throws light straight back toward a light by the viewer (a flashlight, a lantern)
  float shineM = texture2D(roughnessMap, vRoughnessMapUv).r;
  if (shineM > 0.02 && uShine > 0.0) {
    float facing = max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
    totalEmissiveRadiance += uShineCol * shineM * uShine * (0.25 + 1.6 * pow(facing, 6.0));
  }
}`);
  };
  mat.customProgramCacheKey = () => 'bushed-creature';
  const depth = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  return { mat, depth, fx };
}

// ------------------------------------------------------------------------------------------------ helpers
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
/** frame-rate independent exponential approach */
export const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt);
export const wrapAngle = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const dampAngle = (a: number, b: number, k: number, dt: number) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
