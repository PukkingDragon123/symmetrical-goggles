// Texture conventions: every colour texture in BUSHED is high-resolution pixel art. Magnification is NEAREST
// (crisp texels up close), minification uses mipmaps (no shimmer at distance), colour maps are sRGB.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
let maxAniso = 8;
export function setMaxAnisotropy(n: number): void { maxAniso = Math.min(8, n); }

export interface TexOpts { srgb?: boolean; repeat?: boolean; nearest?: boolean; aniso?: number }

export function applyPixelTex(t: THREE.Texture, o: TexOpts = {}): THREE.Texture {
  const srgb = o.srgb ?? true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = (o.nearest ?? true) ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = o.aniso ?? maxAniso;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}

/** load a texture from public/assets/textures (path relative to it), cached */
export function loadTex(path: string, o: TexOpts = {}): THREE.Texture {
  const key = path + JSON.stringify(o);
  let t = cache.get(key);
  if (!t) {
    t = loader.load(`assets/textures/${path}`);
    applyPixelTex(t, o);
    cache.set(key, t);
  }
  return t;
}

/** canvas -> texture with pixel conventions */
export function canvasTex(c: HTMLCanvasElement | OffscreenCanvas, o: TexOpts = {}): THREE.Texture {
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  return applyPixelTex(t, o);
}
