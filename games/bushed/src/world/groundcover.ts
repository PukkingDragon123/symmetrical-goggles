// Ground cover (stub, filled in below)
import * as THREE from 'three';
export interface Solid { kind: string; x: number; y: number; z: number; r: number; h: number }
export class GroundCover {
  readonly group = new THREE.Group();
  constructor(scene: THREE.Scene, _camera: THREE.Camera) { scene.add(this.group); }
  update(_cam: THREE.Camera): void {}
  solids(_x: number, _z: number, _r: number): Solid[] { return []; }
  stats(): string { return ''; }
}
