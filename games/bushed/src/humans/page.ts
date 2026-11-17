// The texture page of one person: a 1024 x 512 pixel-art atlas. Each body part (and each garment shell) owns a
// rectangular region; the lofts map ring angle -> u (seam at the back, the front at u = 0.5) and height -> v, so
// painters work in (angle, height) and know where every pocket, button and seam falls on the mesh.
// Densities: clothing ~230-260 px/m, the face ~520 px/m, hands ~320 px/m.
import type { Reg } from './loft';

export const PAGE_W = 1024, PAGE_H = 512;

export type RegKey = 'TORSO' | 'OUTER' | 'LEG_L' | 'LEG_R' | 'ARM_L' | 'ARM_R' | 'HAND_L' | 'HAND_R'
  | 'HEAD' | 'HAIR' | 'BEARD' | 'FOOT_L' | 'FOOT_R' | 'TAILS' | 'NECK' | 'COLLAR' | 'HAT' | 'EXTRA' | 'LIDS' | 'APRON'
  | 'OSLV_L' | 'OSLV_R' | 'CUFF' | 'POCKET';

/** pixel rectangles [x, y, w, h] */
export const LAYOUT: Record<RegKey, [number, number, number, number]> = {
  TORSO: [1, 1, 256, 184], OUTER: [259, 1, 256, 184],
  LEG_L: [517, 1, 120, 232], LEG_R: [639, 1, 120, 232],
  ARM_L: [761, 1, 80, 156], ARM_R: [843, 1, 80, 156],
  HAND_L: [925, 1, 98, 112], HAND_R: [925, 115, 98, 112],
  NECK: [1, 187, 96, 46], COLLAR: [99, 187, 160, 46], HAT: [261, 187, 192, 46], EXTRA: [455, 187, 60, 46],
  OSLV_L: [761, 159, 80, 156], OSLV_R: [843, 159, 80, 156],
  CUFF: [925, 229, 98, 40],
  HEAD: [1, 235, 320, 128], HAIR: [323, 235, 160, 112], BEARD: [485, 235, 128, 96],
  FOOT_L: [615, 235, 72, 100], FOOT_R: [689, 235, 72, 100],
  TAILS: [1, 365, 256, 100], APRON: [323, 349, 168, 162], LIDS: [551, 337, 60, 22],
  POCKET: [925, 271, 98, 60],
};
export const R = (k: RegKey): Reg => { const [x, y, w, h] = LAYOUT[k]; return { x: x / PAGE_W, y: y / PAGE_H, w: w / PAGE_W, h: h / PAGE_H }; };
/** sub-rectangle of a region (u0, v0, u1, v1 in region units; v = 0 is the bottom row) */
export const subR = (r: Reg, u0: number, v0: number, u1: number, v1: number): Reg => ({ x: r.x + u0 * r.w, y: r.y + (1 - v1) * r.h, w: (u1 - u0) * r.w, h: (v1 - v0) * r.h });

/** ranges (reference metres) mapped onto each region's v axis (v = 0 bottom row, 1 top row) */
export const VMAP = {
  TORSO: [0.8, 1.5],          // body space y (reference)
  ARM: [-0.54, 0.07],         // uarm-local y (reference)
  LEG: [-0.87, 0.07],         // thigh-local y (reference)
  HEAD: [-0.035, 0.215],      // head-local y
  HAIR: [-0.26, 0.23],        // head-local y
  NECK: [1.42, 1.64],         // body y (reference)
  TAILS: [0.45, 0.92],        // body y (reference)
  APRON: [0.45, 1.42],        // body y (reference)
} as const;

(() => {
  // overlap check (dev aid)
  const ks = Object.keys(LAYOUT) as RegKey[];
  for (let i = 0; i < ks.length; i++) {
    const [x, y, w, h] = LAYOUT[ks[i]];
    if (x < 0 || y < 0 || x + w > PAGE_W || y + h > PAGE_H) throw new Error('human page overflow: ' + ks[i]);
    for (let j = i + 1; j < ks.length; j++) {
      const [x2, y2, w2, h2] = LAYOUT[ks[j]];
      if (x < x2 + w2 && x2 < x + w && y < y2 + h2 && y2 < y + h) throw new Error(`human page overlap: ${ks[i]} / ${ks[j]}`);
    }
  }
})();
