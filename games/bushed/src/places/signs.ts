// Access to the printed-matter atlases (public/assets/textures/places/signs.png and labels.png, made by
// tools/make_print.py) and their materials.
import * as THREE from 'three';
import { loadTex } from '../gfx/tex';
import { SIGN_RECTS, LABEL_RECTS, ATLAS_SIZE } from './print_atlas';
import { defineMat } from './kit';

function uvOf(rects: Record<string, [number, number, number, number]>, key: string): [number, number, number, number] {
  const r = rects[key];
  if (!r) throw new Error(`no atlas entry ${key}`);
  const S = ATLAS_SIZE, e = 0.3;
  return [(r[0] + e) / S, 1 - (r[1] + r[3] - e) / S, (r[0] + r[2] - e) / S, 1 - (r[1] + e) / S];
}

export const SIGNS = { uv: (k: string) => uvOf(SIGN_RECTS, k), px: (k: string) => SIGN_RECTS[k] };
export const LABELS = { uv: (k: string) => uvOf(LABEL_RECTS, k), px: (k: string) => LABEL_RECTS[k] };

export function signTex(): THREE.Texture { return loadTex('places/signs.png', { repeat: false }); }
export function labelTex(): THREE.Texture { return loadTex('places/labels.png', { repeat: false }); }

let done = false;
/** register the atlas materials: signs, lab (matte print), lab_gloss (glass, glossy tins), lab_metal */
export function ensurePrintMats(): void {
  if (done) return;
  done = true;
  defineMat('signs', new THREE.MeshStandardMaterial({ name: 'place_signs', map: signTex(), roughness: 0.8 }));
  defineMat('signs_ds', new THREE.MeshStandardMaterial({ name: 'place_signs_ds', map: signTex(), roughness: 0.8, side: THREE.DoubleSide }));
  defineMat('lab', new THREE.MeshStandardMaterial({ name: 'place_lab', map: labelTex(), roughness: 0.75 }));
  defineMat('lab_gloss', new THREE.MeshStandardMaterial({ name: 'place_lab_gloss', map: labelTex(), roughness: 0.6 }));
  defineMat('lab_metal', new THREE.MeshStandardMaterial({ name: 'place_lab_metal', map: labelTex(), roughness: 0.7, metalness: 0.1 }));
  defineMat('lab_ds', new THREE.MeshStandardMaterial({ name: 'place_lab_ds', map: labelTex(), roughness: 0.8, side: THREE.DoubleSide }));
}
