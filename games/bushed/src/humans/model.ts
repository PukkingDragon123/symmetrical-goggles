// Assembles one person on the Gacha Garage human model: look -> Spec (spec.ts) -> GG Human (one rigidly skinned
// low-poly mesh, one painted 256 px atlas with a live-painted face: 1 draw call) -> the NPC animator.
import * as THREE from 'three';
import type { HumanLook, LookId } from './looks';
import { makeLook } from './looks';
import { lookToSpec } from './spec';
import { Human } from './gg/Human';
import { NpcAnimator } from './anim';
import { G } from '../gfx/globals';

/** the person's material, darkened and glossier when wet (G.uWet, rain) */
export function wetMaterial<M extends THREE.Material>(m: M): M {
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

export interface HumanModel {
  look: HumanLook;
  /** add this to the scene; feet on y = 0, facing +z */
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  /** the Gacha Garage human underneath (expressions, gestures, proportions) */
  human: Human;
  bones: Record<string, THREE.Bone>;
  anim: NpcAnimator;
  /** palm socket: parent held items here (origin in the fist, +Y along a gripped handle, +Z the knuckles) */
  socket(hand: 'L' | 'R'): THREE.Object3D;
  /** standing height (m) */
  height: number;
  dispose(): void;
}

/**
 * Build a person. lazy (default true): the detailed atlas is painted over the next few frames (a flat-coloured
 * placeholder shows meanwhile, GG's time-sliced painter) so spawning never hitches; human.finishPaint() forces it.
 */
export function buildHuman(look: HumanLook | LookId, opts: { lazy?: boolean } = {}): HumanModel {
  const L = typeof look === 'string' ? makeLook(look) : look;
  const human = new Human(lookToSpec(L), { lazy: opts.lazy ?? true });
  wetMaterial(human.mat);
  human.root.name = 'human:' + L.name;
  const anim = new NpcAnimator(human);
  anim.update(0);
  return {
    look: L, root: human.root, mesh: human.mesh, human, bones: human.b, anim,
    socket: (h) => human.sockets[h], height: human.height, dispose: () => human.dispose(),
  };
}
