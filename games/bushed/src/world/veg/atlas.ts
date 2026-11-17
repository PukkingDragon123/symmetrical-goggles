// UV rects of the ground-cover atlas (public/assets/textures/veg/veg_atlas.png, made by tools/forest/veg.py).
// Units of 128 px in a 1024 x 768 image, y down; converted to three.js uv space (v up).
export const VEG_ATLAS = { w: 1024, h: 768, unit: 128 };

const UNITS = {
  grass_green: [0, 0, 1, 2], grass_yellow: [1, 0, 1, 2], grass_dry: [2, 0, 1, 2], grass_sedge: [3, 0, 1, 2],
  fern_a: [4, 0, 1, 4], fern_b: [5, 0, 1, 4],
  bracken: [6, 0, 2, 2], fireweed: [6, 2, 1, 2], bunch_flower: [7, 2, 1, 1], bunch_berry: [7, 3, 1, 1],
  blueberry_a: [0, 2, 2, 1], blueberry_b: [2, 2, 2, 1], juniper: [0, 3, 2, 1], alder: [2, 3, 2, 1],
  twig: [0, 4, 2, 1], agaric: [2, 4, 1, 1], chanterelle: [3, 4, 1, 1], bracket: [4, 4, 1, 1],
  clubmoss: [5, 4, 1, 1], aster: [6, 4, 1, 1], cone: [7, 4, 1, 1],
  moss_tuft: [0, 5, 2, 1], lichen: [2, 5, 2, 1], litter: [4, 5, 2, 1], needles: [6, 5, 2, 1],
} as const;

export type VegCell = keyof typeof UNITS;

/** [u0, v0, u1, v1] in three.js uv space (half-texel inset) */
export function vegRect(k: VegCell): [number, number, number, number] {
  const [x, y, w, h] = UNITS[k];
  const U = VEG_ATLAS.unit, W = VEG_ATLAS.w, H = VEG_ATLAS.h;
  const u0 = (x * U + 0.5) / W, u1 = ((x + w) * U - 0.5) / W;
  const v1 = 1 - (y * U + 0.5) / H, v0 = 1 - ((y + h) * U - 0.5) / H;
  return [u0, v0, u1, v1];
}
