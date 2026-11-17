// Global shader uniforms shared by every material in the game (wind, time, pushers, weather).
// Materials reference these objects directly (uniform objects are shared by reference), so updating
// .value once per frame updates every shader. Owned by the main loop: see updateGlobals().
import * as THREE from 'three';

export const MAX_PUSHERS = 8;

export const G = {
  uTime: { value: 0 },
  /** wind direction (xz, normalised) */
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  /** 0 calm .. 1 storm */
  uWindStrength: { value: 0.35 },
  /** gust field phase (scrolls with the wind) */
  uGust: { value: 0 },
  /**
   * things that push vegetation aside: xyz = world position of the feet/body centre, w = radius (m).
   * Slot 0 is the player, 1 the hound, the rest creatures/vehicles. w = 0 means unused.
   */
  uPushers: { value: Array.from({ length: MAX_PUSHERS }, () => new THREE.Vector4(0, -999, 0, 0)) },
  /** 0 dry .. 1 soaked (darkens and adds gloss to wettable materials) */
  uWet: { value: 0 },
  /** 0..1 snow cover */
  uSnow: { value: 0 },
  /** camera world position (for distance fades, LOD dithering) */
  uCamPos: { value: new THREE.Vector3() },
};

export function setPusher(slot: number, x: number, y: number, z: number, r: number): void {
  G.uPushers.value[slot].set(x, y, z, r);
}
