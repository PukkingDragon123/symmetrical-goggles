// A procedural cryptid (base.ts: Skel + Animator + IK) wearing a baked low-poly glTF instead of an anatomy-cage model.
// The glb (tools/blender/lowpoly/<id>.py) is a skinned mesh whose joints carry the cryptid's own bone names, placed
// where its rig wants them; it has no clips (the cryptid's procedural clips animate it). This turns it into the
// CryptidModel base.ts expects: the bind-pose geometry with its skin re-indexed to the bone order the clips use, the
// bone rest positions (model space, metres), the colour atlas and the sd page (R eye shine, G roughness, B metal) as
// DataTextures (nearest-filtered up close, mipmapped far off).
//
//   const HM = glbCryptidLoader('hodag', ['root', 'chest', ...]);   // registered with preloadCreatures()
//   const model = HM.get();                                           // after the preload
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { registerPreload } from '../preload';
import type { BoneDef } from '../rig';
import type { CryptidModel } from './kit';

export const CRYPTID_GLB_DIR = 'assets/models/creatures/cryptids/';
let loader: GLTFLoader | null = null;

/** a texture's pixels as an RGBA DataTexture (same orientation: glTF images are not flipped) */
function dataTex(t: THREE.Texture, color: boolean): THREE.DataTexture {
  const img = t.image as CanvasImageSource & { width: number; height: number };
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0);
  const px = new Uint8Array(cx.getImageData(0, 0, W, H).data.buffer.slice(0));
  const d = new THREE.DataTexture(px, W, H, THREE.RGBAFormat);
  d.flipY = false;
  d.magFilter = THREE.NearestFilter;
  if (color) { d.colorSpace = THREE.SRGBColorSpace; d.minFilter = THREE.LinearMipmapLinearFilter; d.generateMipmaps = true; d.anisotropy = 4; }
  else { d.minFilter = THREE.NearestFilter; }
  d.needsUpdate = true;
  return d;
}

function convert(id: string, scene: THREE.Object3D, order: string[]): CryptidModel {
  scene.updateMatrixWorld(true);
  let mesh: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh; });
  if (!mesh) throw new Error(id + ': no skinned mesh');
  const sm = mesh as THREE.SkinnedMesh, sk = sm.skeleton;
  const src = sk.bones.map((b) => b.name);
  const at = (n: string) => { const k = src.indexOf(n); if (k < 0) throw new Error(`${id}: no joint ${n}`); return k; };
  // rest positions (model space): the joints' bind matrices (the inverse of their inverses)
  const m = new THREE.Matrix4();
  const restPos = (k: number) => new THREE.Vector3().setFromMatrixPosition(m.copy(sk.boneInverses[k]).invert().premultiply(sm.bindMatrix));
  const bones: BoneDef[] = order.map((n) => {
    const b = sk.bones[at(n)];
    let p: THREE.Object3D | null = b.parent, parent = -1;
    while (p && (p as THREE.Bone).isBone) { const k = order.indexOf(p.name); if (k >= 0) { parent = k; break; } p = p.parent; }
    const pos = restPos(at(n));
    return { name: n, parent, pos: [pos.x, pos.y, pos.z] };
  });
  bones.forEach((b, i) => { if (b.parent >= i) throw new Error(`${id}: bone ${b.name} before its parent`); });
  // the geometry in model space, its skin re-indexed to `order`
  const geo = sm.geometry.clone();
  geo.applyMatrix4(sm.bindMatrix);
  const remap = src.map((n) => order.indexOf(n));
  const si = geo.attributes.skinIndex as THREE.BufferAttribute, sw = geo.attributes.skinWeight as THREE.BufferAttribute;
  const idx = new Uint16Array(si.count * 4);
  for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) {
    const r = remap[si.getComponent(i, c)];
    if (r < 0 && sw.getComponent(i, c) > 0.001) throw new Error(`${id}: vertex weighted to unlisted joint ${src[si.getComponent(i, c)]}`);
    idx[i * 4 + c] = Math.max(0, r);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
  const mat = sm.material as THREE.MeshStandardMaterial;
  if (!mat.map) throw new Error(id + ': no colour texture');
  const tex = dataTex(mat.map, true);
  const sd = mat.roughnessMap ? dataTex(mat.roughnessMap, false) : (() => { const d = new THREE.DataTexture(new Uint8Array([0, 220, 0, 255]), 1, 1); d.needsUpdate = true; return d; })();
  const tris = geo.index!.count / 3;
  return { geo, tex, sd, bones, tris, den: tex.image.width, stats: `${id}: low-poly glb, ${tris} tris, ${tex.image.width}px atlas` };
}

/** the shared model of a glb-wearing procedural cryptid: load() (registered with preloadCreatures), get() after it */
export function glbCryptidLoader(id: string, order: string[]) {
  let model: CryptidModel | null = null;
  let pending: Promise<CryptidModel> | null = null;
  const load = (): Promise<CryptidModel> => {
    if (model) return Promise.resolve(model);
    loader ??= new GLTFLoader();
    pending ??= loader.loadAsync(CRYPTID_GLB_DIR + id + '.glb').then((g) => (model = convert(id, g.scene, order)));
    return pending;
  };
  registerPreload(id, () => load().catch((e) => { console.warn('[cryptids] ' + id, e); }));
  return {
    load,
    /** the model; it must have been loaded (preloadCreatures, or await load()) */
    get(): CryptidModel { if (!model) throw new Error(`${id}: model not loaded (preloadCreatures or ${id} load())`); return model; },
  };
}
