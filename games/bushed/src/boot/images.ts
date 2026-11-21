// Off-main-thread image decoding. Textures loaded with THREE.TextureLoader hold an <img>; WebGL decodes it on the
// main thread the first time it is uploaded (tens of ms per 1-2k PNG, all in the first frame). createImageBitmap
// decodes on a browser worker thread instead, in parallel, and the upload is then a plain copy. Only textures that
// have not been uploaded yet are touched; the bitmap is pre-flipped (WebGL ignores FLIP_Y for ImageBitmaps).
import * as THREE from 'three';

const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'specularMap', 'lightMap'] as const;
const done = new WeakSet<THREE.Texture>();

function texturesOf(root: THREE.Object3D, out: Set<THREE.Texture>): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      const r = mat as unknown as Record<string, unknown>;
      for (const k of KEYS) { const t = r[k] as THREE.Texture | undefined; if (t && (t as THREE.Texture).isTexture) out.add(t); }
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const v of Object.values(u)) { const t = v?.value as THREE.Texture | undefined; if (t && t.isTexture) out.add(t); }
    }
  });
}

/** decode every not-yet-uploaded <img> texture under root into an ImageBitmap; resolves when all are swapped in */
export async function bitmapize(gl: THREE.WebGLRenderer, root: THREE.Object3D): Promise<number> {
  if (typeof createImageBitmap === 'undefined') return 0;
  const set = new Set<THREE.Texture>();
  texturesOf(root, set);
  const jobs: Promise<void>[] = [];
  for (const t of set) {
    const img = t.image as HTMLImageElement | undefined;
    if (done.has(t) || typeof HTMLImageElement === 'undefined' || !(img instanceof HTMLImageElement) || !img.complete || !img.naturalWidth) continue;
    if ((gl.properties.get(t) as { __webglInit?: boolean }).__webglInit) continue;      // already on the GPU
    done.add(t);
    const opts: ImageBitmapOptions = {
      imageOrientation: t.flipY ? 'flipY' : 'from-image',
      premultiplyAlpha: t.premultiplyAlpha ? 'premultiply' : 'none',
      colorSpaceConversion: t.colorSpace === THREE.NoColorSpace ? 'none' : 'default',
    };
    jobs.push(createImageBitmap(img, opts).then((bmp) => {
      // the texture may have been uploaded meanwhile (drawn by a frame): then keep it as it is
      if ((gl.properties.get(t) as { __webglInit?: boolean }).__webglInit || t.image !== img) { bmp.close(); return; }
      t.image = bmp; t.flipY = false; t.needsUpdate = true;
    }, () => undefined));
  }
  await Promise.all(jobs);
  return jobs.length;
}
