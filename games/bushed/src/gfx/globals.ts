// Global shader uniforms shared by every material in the game (wind, time, pushers, weather, sky, sun shadow).
// Materials reference these objects directly (uniform objects are shared by reference), so updating
// .value once per frame updates every shader. Owned by the main loop and the Sky: see Sky.update().
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

  // ---- sky and light (written by Sky.update every frame)
  /** direction towards the sun (world); below the horizon at night */
  uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.2).normalize() },
  /** sun (or moon) light colour * intensity, linear */
  uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
  /** sky colours for cheap reflections (puddles, wet surfaces) */
  uSkyZen: { value: new THREE.Color(0.2, 0.35, 0.65) },
  uSkyHor: { value: new THREE.Color(0.7, 0.72, 0.75) },
  uFogCol: { value: new THREE.Color(0.5, 0.55, 0.6) },
  /** 0 bright day .. 1 night */
  uDarkness: { value: 0 },
  /** equirect sky probe (rendered by the Renderer each frame; null until the first frame) */
  uSkyProbe: { value: null as THREE.Texture | null },
  /** sun/moon shadow map (depth, compare sampler) + world -> shadow uv matrix; uShadowOn = 0 when not ready */
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  /** ground mist amount 0..1 (dawn hollows, the lake) and the mist field: R = mist top height, G = ground height */
  uMist: { value: 0 },
  uMistMap: { value: null as THREE.Texture | null },
  /** xz origin (min corner), size (m) */
  uMistBox: { value: new THREE.Vector4(-1024, -1024, 2048, 2048) },
  /** lake: xyz = centre (y = water level), w = radius of the water mesh (0 = no lake) */
  uLake: { value: new THREE.Vector4(0, 0, 0, 0) },
};

/**
 * Lake surface functions, shared by the lake material and the Renderer's reflection pass. The host shader declares
 * `uniform float uTime; uniform vec2 uWindDir; uniform float uWind;`.
 *   wPatch(xz)          0..1 wind patches (cat's paws) drifting downwind: rough, darker water
 *   waterNormal(xz, s)  world normal of the pixel-snapped ripples, s = ripple strength multiplier
 */
export const WATER_GLSL = /* glsl */`
float wH(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float wN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wH(i), wH(i + vec2(1, 0)), f.x), mix(wH(i + vec2(0, 1)), wH(i + vec2(1, 1)), f.x), f.y); }
float wPatch(vec2 xz) {
  vec2 q = xz * 0.02 - uWindDir * uTime * 0.05;
  return smoothstep(0.42, 0.78, wN(q) * 0.62 + wN(q * 2.9 + 7.0) * 0.38);
}
float wWave(vec2 p) {
  vec2 a = uWindDir * uTime;
  return wN(p * 0.9 - a * 0.35 + uTime * vec2(0.05, 0.02)) * 0.55 + wN(p * 2.3 - a * 0.6 + vec2(3.1, 0.0)) * 0.3
    + wN(p * 6.1 + uTime * vec2(0.4, -0.3)) * 0.1 + wN(p * 13.0 - a * 1.4) * 0.05;
}
vec3 waterNormal(vec2 xz, float s) {
  vec2 p = floor(xz * 8.0) / 8.0;
  float e = 0.12;
  float a = wWave(p), bx = wWave(p + vec2(e, 0.0)), bz = wWave(p + vec2(0.0, e));
  float k = (0.12 + uWind * 0.55) * (0.3 + 1.4 * wPatch(xz)) * s;
  return normalize(vec3(-(bx - a) * k / e, 1.0, -(bz - a) * k / e));
}
`;

export function setPusher(slot: number, x: number, y: number, z: number, r: number): void {
  G.uPushers.value[slot].set(x, y, z, r);
}
