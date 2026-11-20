// THE HODAG's body: a low-poly realistic model (~3.6k faceted triangles, one 1024 atlas with the high-poly detail
// baked in), kitbashed from real models by tools/blender/lowpoly/hodag.py: a land crocodyliform's body, legs, tail and
// toothy grin (Anees Animates, CC-BY 4.0), a bull's horns (Poly Haven, CC0), keeled bone plates down the back and the
// tail, a three-bladed tail spear, a yellow throat sac, a tongue and small dark bead eyes. About 2.9 m snout to tail.
// Its joints carry the procedural rig's bone names (hodag.ts animates it: IK legs, the waddle, the bellow, the gore).
// Creature space: metres, +z forward, +y up, ground y = 0.
import { glbCryptidLoader } from '../glbmodel';
import type { CryptidModel } from '../kit';

/** the bones, parents first (the order the procedural clips index) */
export const HODAG_BONES = ['root', 'chest', 'neck', 'head', 'jaw', 'sac', 'tongue', 'eyeL', 'eyeR', 'hips', 'tail0', 'tail1', 'tail2', 'tail3', 'tail4',
  'fuL', 'flL', 'ffL', 'fuR', 'flR', 'ffR', 'huL', 'hlL', 'hfL', 'huR', 'hlR', 'hfR'];
export const HODAG_MODEL_VERSION = 'hodag@lowpoly1';
export const HODAG_LOADER = glbCryptidLoader('hodag', HODAG_BONES);
export type { CryptidModel };
