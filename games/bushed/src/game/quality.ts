// Quality presets. Picked automatically from the GPU on first run, changeable on the pause card.
// Runtime knobs apply at once (pixel size, shadow map size and refresh, point-light shadows, fur shells); the
// world's density and draw distance apply at the next start.
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
  forest: { lod0: number; lod1: number; far: number; shadow: number; density: number };
  ground: number;
  /** fur shell multiplier (0 = no fur shells) */
  fur: number;
}

export const QUALITY: Record<QualityName, Quality> = {
  low: { name: 'low', pixel: 3, shadowMap: 1024, shadowEvery: 3, lampShadows: false, forest: { lod0: 14, lod1: 46, far: 320, shadow: 28, density: 0.7 }, ground: 0.6, fur: 0.4 },
  medium: { name: 'medium', pixel: 2, shadowMap: 2048, shadowEvery: 2, lampShadows: true, forest: { lod0: 20, lod1: 62, far: 440, shadow: 38, density: 0.85 }, ground: 0.8, fur: 0.7 },
  high: { name: 'high', pixel: 2, shadowMap: 2048, shadowEvery: 1, lampShadows: true, forest: { lod0: 24, lod1: 72, far: 520, shadow: 44, density: 1 }, ground: 1, fur: 1 },
  ultra: { name: 'ultra', pixel: 2, shadowMap: 4096, shadowEvery: 1, lampShadows: true, forest: { lod0: 32, lod1: 96, far: 640, shadow: 60, density: 1.1 }, ground: 1.2, fur: 1.2 },
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

/** apply the runtime knobs to a scene */
export function applyRuntime(q: Quality, gl: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight): void {
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
