// Shared creature types. CreatureCtx is the contract from ARCHITECTURE.md ("Creatures"); the optional fields at the
// end are extras the game may pass so creatures can react to more of the world (each creature works without them).
import type * as THREE from 'three';

export interface PlayerView {
  pos: THREE.Vector3;
  /** look direction (normalised) */
  dir: THREE.Vector3;
  /** what the player holds: 'none' | 'axe' | 'jerky' | 'flashlight' | ... (FPArms.setHeld kinds) */
  held: string;
  crouch: boolean;
  /** 0 silent .. 1 loud (running, chopping, shouting) */
  noise: number;
  /** the flashlight is on */
  light: boolean;
  /** optional: what the player is doing right now ('chop', 'swing', 'offer', 'sprint', ...) */
  action?: string;
  /** optional: ground speed (m/s); estimated from position changes when absent */
  speed?: number;
}

/** something lying on the ground the creatures may care about (an axe handle, a dropped jerky, a gift) */
export interface GroundItem { id: string; kind: string; pos: THREE.Vector3 }

export interface CreatureCtx {
  dt: number;
  /** seconds since start */
  time: number;
  /** hour of day, 0..24 */
  hour: number;
  player: PlayerView;
  heightAt(x: number, z: number): number;
  /** sound cues and story beats: 'growl', 'bark', 'snap', 'howl', 'befriended', ... with { pos, ... } */
  emit(ev: string, data?: unknown): void;
  // ---- optional extras
  /** where the cabin stove is (the hound sleeps beside it at night); defaults to the cabin spot */
  stove?: THREE.Vector3 | null;
  /** loose items on the ground near the player (axe handles the companion hound steals) */
  items?: GroundItem[];
  /** remove an item from the world when a creature picks it up; return false if it is gone */
  takeItem?(id: string): boolean;
  /** put an item into the world (Bigfoot's gifts); returns its id */
  dropItem?(kind: string, pos: THREE.Vector3): string;
  /** things the companion should bark at (other creatures, a bear) */
  threats?: THREE.Vector3[];
  /** tree trunks near a point, for hiding behind (Bigfoot): { x, z, r } */
  trunks?(x: number, z: number, r: number): { x: number; z: number; r: number }[];
  /** 0..1 how kind the player has been lately (fed the hound, left food out, did not chase); Bigfoot gifts */
  kindness?: number;
}

export type Emit = CreatureCtx['emit'];
