// Quality presets. Picked automatically from the GPU on first run, changeable on the pause card.
// Runtime knobs apply at once (pixel size, shadow map size and refresh, point-light shadows, fur shells, atmosphere
// steps, motion blur taps); the world's density and draw distance apply at the next start.
//
// Frame budgets (renderer.info with autoReset off, shadow passes included, measured at the cabin yard, the store and
// the deep forest): high and medium stay under 1500 draw calls and 6M triangles a frame, low under 900 calls and 3M.
//
// Motion blur (camera + per-object, see src/gfx/renderer.ts) is a player setting, ON by default:
//   motionBlur.on / motionBlur.strength (0..2) are read by the renderer every frame; setMotionBlur() changes and
//   stores them (localStorage 'bushed.motionblur'). Settings UI hook: a checkbox -> setMotionBlur({ on }) and a
//   slider 0..2 -> setMotionBlur({ strength }).
import * as THREE from 'three';

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface Quality {
  name: QualityName;
  /** screen pixels per internal pixel */
  pixel: number;
  shadowMap: number;
  /** sun shadows re-render every N frames */
  shadowEvery: number;
  /** point / spot lights (fire, lamps, headlights) cast shadows */
  lampShadows: boolean;
  /** shadowed point lights (6-face cubes) refreshed per frame, round robin, nearest first (0 = none) */
  lampCubesPerFrame: number;
  /** lamps farther than this (m) keep their last shadow map */
  lampShadowDist: number;
  forest: { lod0: number; lod1: number; far: number; shadow: number; density: number };
  ground: number;
  /** ground cover (ferns, shrubs, rocks, logs) casts sun shadows within this distance (m) */
  groundShadow: number;
  /** fur shell multiplier (0 = no fur shells) */
  fur: number;
  /** ray-march steps of the half-res atmosphere (god rays, mist) */
  atmoSteps: number;
  /** most motion blur taps per pixel (fewer on short streaks) */
  blurTaps: number;
}

export const QUALITY: Record<QualityName, Quality> = {
  low: {
    name: 'low', pixel: 3, shadowMap: 1024, shadowEvery: 3, lampShadows: false, lampCubesPerFrame: 0, lampShadowDist: 0,
    forest: { lod0: 12, lod1: 40, far: 300, shadow: 22, density: 0.65 }, ground: 0.55, groundShadow: 0, fur: 0.4, atmoSteps: 8, blurTaps: 6,
  },
  medium: {
    name: 'medium', pixel: 2, shadowMap: 2048, shadowEvery: 2, lampShadows: true, lampCubesPerFrame: 0.34, lampShadowDist: 22,
    forest: { lod0: 18, lod1: 56, far: 420, shadow: 32, density: 0.85 }, ground: 0.8, groundShadow: 14, fur: 0.7, atmoSteps: 14, blurTaps: 10,
  },
  high: {
    name: 'high', pixel: 2, shadowMap: 2048, shadowEvery: 1, lampShadows: true, lampCubesPerFrame: 0.5, lampShadowDist: 30,
    forest: { lod0: 22, lod1: 68, far: 500, shadow: 40, density: 1 }, ground: 1, groundShadow: 22, fur: 1, atmoSteps: 18, blurTaps: 14,
  },
  ultra: {
    name: 'ultra', pixel: 2, shadowMap: 4096, shadowEvery: 1, lampShadows: true, lampCubesPerFrame: 1, lampShadowDist: 40,
    forest: { lod0: 30, lod1: 90, far: 640, shadow: 56, density: 1.1 }, ground: 1.2, groundShadow: 32, fur: 1.2, atmoSteps: 24, blurTaps: 18,
  },
};

/** a first guess from the GPU string (integrated / software GPUs start low) */
export function guessQuality(gl: THREE.WebGLRenderer): QualityName {
  const ctx = gl.getContext();
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
  const r = String(dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)).toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(r)) return 'low';
  if (/intel|uhd|iris|adreno|mali|apple m1|vega 8|radeon\(tm\) graphics/.test(r)) return 'medium';
  if (/rtx (40|50)|rx 7[89]|rx 9/.test(r)) return 'ultra';
  return 'high';
}

const KEY = 'bushed.quality';
export function storedQuality(): QualityName | null {
  try { const q = localStorage.getItem(KEY) as QualityName | null; return q && q in QUALITY ? q : null; } catch { return null; }
}
export function storeQuality(q: QualityName): void { try { localStorage.setItem(KEY, q); } catch { /* ignore */ } }

let applied: Quality | null = null;
/**
 * the preset in use: the last one applied with applyRuntime, else the game's (window.__game.quality is set before
 * the world is built), else high. Lets the renderer, forest and ground cover read knobs main.ts does not pass.
 */
export function currentQuality(): Quality {
  const g = (globalThis as unknown as { __game?: { quality?: Quality } }).__game;
  return g?.quality ?? applied ?? QUALITY.high;
}

/** apply the runtime knobs to a scene */
export function applyRuntime(q: Quality, gl: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight): void {
  applied = q;
  if (sun.shadow.mapSize.x !== q.shadowMap) {
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sun.shadow.map?.dispose();
    (sun.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
  }
  scene.traverse((o) => {
    const l = o as THREE.Light & { isPointLight?: boolean; isSpotLight?: boolean };
    if (!(l.isPointLight || l.isSpotLight)) return;
    if (l.userData.wantsShadow === undefined) l.userData.wantsShadow = l.castShadow;
    l.castShadow = q.lampShadows && !!l.userData.wantsShadow;
  });
  void gl;
}

// ------------------------------------------------------------------------------------------------ motion blur
export interface MotionBlurSettings {
  /** on by default */
  on: boolean;
  /** 0..2: 1 = a 1/40 s shutter (strong, cinematic), 2 = twice that */
  strength: number;
}

const MB_KEY = 'bushed.motionblur';
/** live settings, read by the renderer every frame */
export const motionBlur: MotionBlurSettings = { on: true, strength: 1 };
try {
  const s = JSON.parse(localStorage.getItem(MB_KEY) ?? 'null') as Partial<MotionBlurSettings> | null;
  if (s && typeof s.on === 'boolean') motionBlur.on = s.on;
  if (s && typeof s.strength === 'number' && isFinite(s.strength)) motionBlur.strength = Math.max(0, Math.min(2, s.strength));
} catch { /* defaults */ }

/** change (and remember) the motion blur settings: the settings UI's checkbox and strength slider call this */
export function setMotionBlur(p: Partial<MotionBlurSettings>): MotionBlurSettings {
  if (typeof p.on === 'boolean') motionBlur.on = p.on;
  if (typeof p.strength === 'number' && isFinite(p.strength)) motionBlur.strength = Math.max(0, Math.min(2, p.strength));
  try { localStorage.setItem(MB_KEY, JSON.stringify(motionBlur)); } catch { /* ignore */ }
  return motionBlur;
}
