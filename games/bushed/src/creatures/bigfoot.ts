// placeholder (being written)
import * as THREE from 'three';
import { Skel } from './rig';
import { Animator } from './animator';
import type { CreatureCtx } from './types';
export class Bigfoot {
  readonly object = new THREE.Group(); mesh!: THREE.SkinnedMesh; skel!: Skel; anim!: Animator; manual: string | null = null;
  state = 'watch'; readonly pos = new THREE.Vector3(); heading = 0;
  constructor(_o: object) { throw new Error('bigfoot not built yet'); }
  get clips(): string[] { return []; }
  play(_c: string | null) {}
  update(_ctx: CreatureCtx) {}
}
