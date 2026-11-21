// Screen-size culling for plain meshes, installed on everything that joins the world (the Renderer's watcher):
// a mesh whose bounding sphere would be smaller than one internal pixel (radius) is skipped in the main pass (the
// renderer sets the focal length in pixels each frame), in the sun's shadow map beyond SUN_K x radius (a tin on a
// shelf stops casting at ~9 m, a chair at ~45 m, a house never), in lamp shadow maps beyond LAMP_K x radius. So the
// store's 600 shelf items cost nothing from the cabin and the yard junk does not fill the sun's map from afar.
// Pieces (under FOG_R m) past the distance where the scene's fog is opaque are skipped too (the cabin from the hollow).
// Never-culled shadow casters (creatures) keep being drawn by the camera but are culled per light (casterCull).
// Instanced meshes, skinned meshes the camera culls, and meshes with their own intersectsFrustum are left alone.
import * as THREE from 'three';
import { G } from './globals';

const SUN_K = 90, LAMP_K = 160;
let MAIN_K = 400;
/** the main camera's focal length in internal pixels (radius / distance * focal = projected radius in pixels) */
export function setCullFocal(px: number): void { MAIN_K = Math.max(150, px); }
let FOG2 = 1e18;
/** beyond this distance the scene's fog hides everything (< 1 % shows through): pieces smaller than FOG_R go */
export function setFogCull(d: number): void { FOG2 = d * d; }
const FOG_R = 24;
const _s = new THREE.Sphere();
const base = THREE.Mesh.prototype.intersectsFrustum;
const tagged = new WeakSet<THREE.Object3D>();

const _mainNear = new THREE.Plane(new THREE.Vector3(0, 0, 0), 0);
const _mf = new THREE.Frustum();
/** the main camera's view-projection this frame (the renderer calls this before drawing the world) */
export function setMainView(viewProj: THREE.Matrix4): void { _mf.setFromProjectionMatrix(viewProj); _mainNear.copy(_mf.planes[4]); }

/** 0 = the main camera's frustum, 1 = the sun's (orthographic), 2 = a lamp's (cube face or spot) or another camera */
export function frustumKind(f: THREE.Frustum): 0 | 1 | 2 {
  const p = f.planes;
  if (p[4].normal.dot(_mainNear.normal) > 0.99999 && Math.abs(p[4].constant - _mainNear.constant) < 1e-3) return 0;
  const lr = p[0].normal.dot(p[1].normal);
  return lr < -0.999 ? 1 : 2;
}

function sizeCull(this: THREE.Mesh, f: THREE.Frustum): boolean {
  const g = this.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const bs = g.boundingSphere!;
  _s.copy(bs).applyMatrix4(this.matrixWorld);
  const k = frustumKind(f);
  const lim = _s.radius * (k === 0 ? MAIN_K * (this.userData.cullGlow ? GLOW_K : 1) : k === 1 ? SUN_K : LAMP_K);
  const d2 = _s.center.distanceToSquared(G.uCamPos.value);
  if (d2 > lim * lim) return false;
  if (k === 0 && _s.radius < FOG_R && d2 > FOG2 + _s.radius * _s.radius && this.userData.cullFog) return false;
  return f.intersectsSphere(_s);
}

/** little lights (flames, bulbs, embers, lit windows) read from much farther than their size at night */
const GLOW_K = 6;
const GLOW_NAME = /flame|glow|ember|fire|lamp|lantern|bulb|window|candle|spark|neon|light/i;
function glows(m: THREE.Mesh): boolean {
  if (GLOW_NAME.test(m.name)) return true;
  for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
    if (!mat) continue;
    if (GLOW_NAME.test(mat.name) || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial || mat.blending === THREE.AdditiveBlending) return true;
    const e = (mat as THREE.MeshStandardMaterial).emissive;
    if (e && (e.r + e.g + e.b > 0.05 || (mat as THREE.MeshStandardMaterial).emissiveMap)) return true;
  }
  return false;
}

const _c = new THREE.Vector3(), _b = new THREE.Vector3();
/**
 * Never-culled shadow casters (creatures: skinned meshes whose bind-pose bounds do not follow the animation) are
 * always drawn by the camera as before, but only cast into a shadow map when a generous sphere around them (the
 * mesh's bounds x 1.5 plus the root bone's offset) touches that light's frustum, and into the sun's only within
 * SUN_K x radius of the camera: a roosting dingbat flock 80 m away no longer fills six lantern cube faces.
 */
function casterCull(this: THREE.Mesh, f: THREE.Frustum): boolean {
  const k = frustumKind(f);
  if (k === 0) return true;
  const g = this.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  _c.setFromMatrixPosition(this.matrixWorld);
  let r = g.boundingSphere!.radius * this.matrixWorld.getMaxScaleOnAxis() * 1.5 + 0.5;
  const bones = (this as unknown as THREE.SkinnedMesh).skeleton?.bones;
  if (bones && bones[0]) r += _b.setFromMatrixPosition(bones[0].matrixWorld).distanceTo(_c);
  _s.center.copy(_c); _s.radius = r;
  if (k === 1) {
    const lim = r * SUN_K;
    if (_c.distanceToSquared(G.uCamPos.value) > lim * lim) return false;
  }
  return f.intersectsSphere(_s);
}

/** install the culling on the plain meshes under root (idempotent) */
export function installCulling(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (tagged.has(o)) return;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    tagged.add(o);
    if ((m as THREE.InstancedMesh).isInstancedMesh) return;
    if (!m.frustumCulled) {
      // never culled by the camera: keep that, but cull it as a shadow caster
      if (m.castShadow && m.intersectsFrustum === base) { m.intersectsFrustum = casterCull; m.frustumCulled = true; }
      return;
    }
    if ((m as THREE.SkinnedMesh).isSkinnedMesh || m.intersectsFrustum !== base) return;
    if (glows(m)) m.userData.cullGlow = true;
    // only fogged materials vanish into the fog (custom shaders without fog would pop)
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.every((x) => x && (x as THREE.MeshStandardMaterial).fog !== false)) m.userData.cullFog = true;
    m.intersectsFrustum = sizeCull;
  });
}

/** watches the world: new children get the culling on the next flush, plus a slow sweep for deeper additions */
export class CullWatcher {
  private queue: THREE.Object3D[] = [];
  private root: THREE.Object3D | null = null;
  private sweepAt = 0;
  watch(root: THREE.Object3D): void {
    if (this.root === root) return;
    this.root = root;
    this.queue.push(root);
    root.addEventListener('childadded', (e) => { this.queue.push((e as unknown as { child: THREE.Object3D }).child); });
  }
  flush(frame: number): void {
    if (this.root && frame >= this.sweepAt) { this.sweepAt = frame + 600; this.queue.push(this.root); }
    while (this.queue.length) installCulling(this.queue.pop()!);
  }
}
