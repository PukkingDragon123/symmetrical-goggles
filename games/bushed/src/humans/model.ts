// Assembles one person: look -> rig dims -> skinned lofted body + painted page -> material -> skeleton,
// sockets at the palms and the NPC animator. Geometry and page textures are cached per look (name + seed), so a
// crowd of the same person costs one build.
import * as THREE from 'three';
import type { HumanLook, LookId } from './looks';
import { makeLook } from './looks';
import type { Dims } from './rig';
import { rigDims, makeSkeleton } from './rig';
import { buildBody } from './body';
import type { BodyBuild } from './body';
import { paintPage } from './paint';
import { HumanAnimator } from './anim';
import { G } from '../gfx/globals';
import type { Shape } from './shape';

export interface HumanParts { look: HumanLook; dims: Dims; body: BodyBuild; tex: THREE.Texture; mat: THREE.MeshStandardMaterial }
const cache = new Map<string, HumanParts>();
const armsCache = new Map<string, THREE.BufferGeometry>();
const keyOf = (L: HumanLook) => L.name + ':' + L.seed + ':' + JSON.stringify(L).length;

/** the person's material: the painted page, nearest-filtered, alpha-cut hair edges, wet-darkening from G.uWet */
export function humanMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0, alphaTest: 0.5, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = G.uWet;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - 0.35 * uWet;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, uWet * 0.6);');
  };
  m.customProgramCacheKey = () => 'bushedHuman';
  return m;
}

export function humanParts(look: HumanLook): HumanParts {
  const key = keyOf(look);
  const hit = cache.get(key);
  if (hit) return hit;
  const dims = rigDims(look.build);
  const body = buildBody(look, dims);
  const page = paintPage(look, body.shape, dims);
  const tex = page.texture();
  const parts: HumanParts = { look, dims, body, tex, mat: humanMaterial(tex) };
  cache.set(key, parts);
  return parts;
}

/** arms + hands only (the first-person viewmodel), same page as the full body */
export function armsGeometry(look: HumanLook): { geometry: THREE.BufferGeometry; parts: HumanParts } {
  const parts = humanParts(look);
  const key = keyOf(look);
  let g = armsCache.get(key);
  if (!g) { g = buildBody(look, parts.dims, { arms: true }).geometry; armsCache.set(key, g); }
  return { geometry: g, parts };
}

/**
 * Palm sockets. Each socket sits in the hollow of a closed fist: +Y runs along a gripped handle out of the
 * thumb / index side (where an axe head or a bottle neck goes), +Z points the way the knuckles face (an axe
 * blade's edge), so a tool authored with its grip at the origin, handle along +Y, edge along +Z drops straight in.
 */
export function makeSocket(hand: THREE.Bone, side: 'L' | 'R', d: Dims): THREE.Object3D {
  const k = side === 'L' ? 1 : -1;
  const o = new THREE.Object3D();
  o.name = 'socket' + side;
  o.position.set(-k * 0.031 * d.hand, -0.07 * d.hand, 0.004 * d.hand);
  o.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  hand.add(o);
  return o;
}

export interface HumanModel {
  look: HumanLook;
  /** add this to the scene; feet on y = 0, facing +z */
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Record<string, THREE.Bone>;
  anim: HumanAnimator;
  dims: Dims;
  shape: Shape;
  /** palm socket: parent held items here (see makeSocket for the frame) */
  socket(hand: 'L' | 'R'): THREE.Object3D;
  /** standing height (m) */
  height: number;
}

export function buildHuman(look: HumanLook | LookId): HumanModel {
  const L = typeof look === 'string' ? makeLook(look) : look;
  const parts = humanParts(L);
  const { dims, body } = parts;
  const { bones, byName, skeleton } = makeSkeleton(dims);
  const mesh = new THREE.SkinnedMesh(body.geometry, parts.mat);
  mesh.add(bones[0]);
  mesh.bind(skeleton);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.position.y = body.sole;
  const root = new THREE.Group();
  root.name = 'human:' + L.name;
  root.add(mesh);
  const sockets = { L: makeSocket(byName.handL, 'L', dims), R: makeSocket(byName.handR, 'R', dims) };
  const anim = new HumanAnimator(byName, dims, mesh, L.seed);
  anim.sockets = sockets;
  anim.update(0);
  const height = dims.rest.head[1] + 0.215 * dims.hs + body.sole;
  return { look: L, root, mesh, bones: byName, anim, dims, shape: body.shape, socket: (h) => sockets[h], height };
}
