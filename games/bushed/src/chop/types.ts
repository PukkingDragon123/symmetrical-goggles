// The slice of the forest contract the chopping code relies on (see ARCHITECTURE.md "Trees").
import type * as THREE from 'three';
import type { Species } from './woodtex';

export interface BranchInfo { id: number | string; base: THREE.Vector3; dir: THREE.Vector3; len: number; r: number; mass: number }

export interface TreeLike {
  species: Species;
  seed: number;
  height: number;
  dbh: number;
  mass: number;
  crownMass: number;
  crownCenter: THREE.Vector3;
  lean: THREE.Vector2;
  trunk: { y: number; r: number; x: number; z: number }[];
  radiusAt(y: number): number;
  centerAt(y: number): [number, number];
  outlineAt?(y: number): [number, number][];
  branches: BranchInfo[];
  object(): THREE.Object3D;
}

export interface TreeRefLike {
  id: number | string;
  species: Species;
  x: number; y: number; z: number;
  rotY: number;
  scale: number;
}
