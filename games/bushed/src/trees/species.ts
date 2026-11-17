// Tree species of the BUSHED bush: wood properties (for chopping, splitting, hauling and the economy) and
// growth/shape parameters (for the procedural generator in build.ts). Values are real-world informed:
//   density      green (freshly felled) wood, kg/m3 (USDA Wood Handbook / Canadian Wood Council green weights)
//   hardness     Janka side hardness normalised: lbf / 1500 (white spruce 480, balsam fir 400, red pine 560,
//                paper birch 910, western red cedar 350)
//   splitEase    0 = stringy/interlocked .. 1 = splits at a look (cedar)
//   value        $ per m3 of merchantable log (stumpage-ish, game balanced: cedar is the prize)
//   barkThickness  mature bark thickness at breast height, m
//   ringSpacing  mean annual ring width, m (slow boreal growth = tight rings)

export type SpeciesId = 'spruce' | 'fir' | 'pine' | 'birch' | 'cedar';
export const SPECIES_IDS: SpeciesId[] = ['spruce', 'fir', 'pine', 'birch', 'cedar'];

export type RGB = [number, number, number];

export interface Species {
  id: SpeciesId;
  name: string;
  latin: string;
  // ---- wood
  density: number;
  hardness: number;
  splitEase: number;
  value: number;
  barkThickness: number;
  heartwood: RGB;
  sapwood: RGB;
  /** fraction of the radius (from the pith) that is heartwood in a mature stem */
  heartFraction: number;
  ringSpacing: number;
  /** latewood (dark band) share of each ring, 0..1 */
  latewood: number;
  /** bark colour seen on cut faces / end grain, outer and inner (phloem) */
  barkOuter: RGB;
  barkInner: RGB;
  /** pitch / resin pockets on cut faces (0..1) */
  resin: number;
  /** firewood: MJ per kg (oven-dry) and how well it burns 0..1 */
  heatValue: number;
  // ---- growth
  /** typical mature height range, m */
  height: [number, number];
  /** typical mature diameter at breast height range, m */
  dbh: [number, number];
  /** age at which the tree is "mature" in years (for ring counts) */
  matureYears: number;
  // ---- shape
  conifer: boolean;
  /** live crown length / tree height for a mature tree in a stand */
  crownRatio: number;
  /** max crown radius / tree height */
  crownWidth: number;
  /** crown profile exponent (1 = cone, <1 fuller/rounder, >1 spire) */
  crownShape: number;
  /** where along the crown (0 base .. 1 top) the crown is widest */
  crownWidest: number;
  /** distance between branch whorls (m, scaled a little by tree size); 0 = no whorls (spiral) */
  whorlSpacing: number;
  branchesPerWhorl: [number, number];
  /** branch elevation (radians, + up) at the crown base and at the top */
  branchAngle: [number, number];
  /** downward sag of the branch along its length (fraction of length) */
  droop: number;
  /** tip upturn (radians) */
  upturn: number;
  /** stem taper exponent: r ~ ((H - y) / (H - 1.3)) ^ taper; 1 = cone, 0.5 = paraboloid (stays thick) */
  taper: number;
  /** root flare: extra radius at the ground (fraction), height over which it decays (m), number of buttress lobes */
  flare: number;
  flareHeight: number;
  lobes: [number, number];
  /** how many dead branches survive below the live crown 0..1 (spruce keeps them, pine self-prunes) */
  deadBranches: number;
  /** beard lichen on dead twigs 0..1 */
  lichen: number;
  /** foliage card size (m) [length, width] */
  card: [number, number];
  /** foliage density multiplier */
  leafDensity: number;
  /** bark tile size in metres [around, up] (matches the PNG, see tools/forest/bark.py) */
  barkTile: [number, number];
  /** vertex tint for branch bark and the upper stem */
  upperBarkTint: RGB;
  /** foliage colour variation: base tint and per-tree random hue spread */
  foliageTint: RGB;
  /** chance of a fork / broken top for a mature tree */
  forkChance: number;
  brokenTopChance: number;
  /** wind flexibility (tip sway, fraction of height at full storm) */
  flex: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  spruce: {
    id: 'spruce', name: 'White spruce', latin: 'Picea glauca',
    density: 580, hardness: 0.32, splitEase: 0.7, value: 70, barkThickness: 0.008,
    heartwood: [0.86, 0.77, 0.6], sapwood: [0.93, 0.87, 0.72], heartFraction: 0.55,
    ringSpacing: 0.0025, latewood: 0.22, barkOuter: [0.36, 0.31, 0.27], barkInner: [0.72, 0.52, 0.36],
    resin: 0.25, heatValue: 19.6,
    height: [16, 28], dbh: [0.26, 0.6], matureYears: 110,
    conifer: true, crownRatio: 0.78, crownWidth: 0.13, crownShape: 1.0, crownWidest: 0.08,
    whorlSpacing: 0.42, branchesPerWhorl: [4, 6], branchAngle: [-0.55, 0.45], droop: 0.22, upturn: 0.45,
    taper: 0.95, flare: 0.45, flareHeight: 0.7, lobes: [4, 6], deadBranches: 0.9, lichen: 0.6,
    card: [0.62, 0.32], leafDensity: 1.0, barkTile: [1.5, 1.5], upperBarkTint: [0.92, 0.86, 0.8],
    foliageTint: [0.92, 1.0, 1.02], forkChance: 0.05, brokenTopChance: 0.06, flex: 0.03,
  },
  fir: {
    id: 'fir', name: 'Balsam fir', latin: 'Abies balsamea',
    density: 720, hardness: 0.27, splitEase: 0.78, value: 55, barkThickness: 0.006,
    heartwood: [0.82, 0.74, 0.62], sapwood: [0.92, 0.87, 0.76], heartFraction: 0.5,
    ringSpacing: 0.003, latewood: 0.18, barkOuter: [0.5, 0.5, 0.47], barkInner: [0.68, 0.5, 0.38],
    resin: 0.15, heatValue: 18.9,
    height: [12, 21], dbh: [0.2, 0.42], matureYears: 70,
    conifer: true, crownRatio: 0.85, crownWidth: 0.11, crownShape: 1.15, crownWidest: 0.05,
    whorlSpacing: 0.38, branchesPerWhorl: [4, 6], branchAngle: [-0.15, 0.5], droop: 0.08, upturn: 0.15,
    taper: 0.95, flare: 0.3, flareHeight: 0.5, lobes: [3, 5], deadBranches: 0.55, lichen: 0.35,
    card: [0.56, 0.3], leafDensity: 1.1, barkTile: [1.8, 1.8], upperBarkTint: [1.0, 1.0, 0.98],
    foliageTint: [0.95, 1.0, 0.95], forkChance: 0.03, brokenTopChance: 0.05, flex: 0.032,
  },
  pine: {
    id: 'pine', name: 'Red pine', latin: 'Pinus resinosa / P. banksiana',
    density: 650, hardness: 0.38, splitEase: 0.62, value: 65, barkThickness: 0.022,
    heartwood: [0.8, 0.53, 0.33], sapwood: [0.93, 0.83, 0.63], heartFraction: 0.45,
    ringSpacing: 0.0035, latewood: 0.3, barkOuter: [0.45, 0.28, 0.2], barkInner: [0.78, 0.5, 0.32],
    resin: 0.7, heatValue: 20.5,
    height: [17, 30], dbh: [0.28, 0.62], matureYears: 90,
    conifer: true, crownRatio: 0.45, crownWidth: 0.16, crownShape: 0.65, crownWidest: 0.3,
    whorlSpacing: 0.55, branchesPerWhorl: [4, 6], branchAngle: [-0.05, 0.75], droop: 0.12, upturn: 0.55,
    taper: 0.72, flare: 0.3, flareHeight: 0.5, lobes: [3, 5], deadBranches: 0.2, lichen: 0.1,
    card: [0.55, 0.28], leafDensity: 0.95, barkTile: [2.0, 2.0], upperBarkTint: [1.12, 0.92, 0.78],
    foliageTint: [1.0, 1.0, 0.92], forkChance: 0.08, brokenTopChance: 0.04, flex: 0.028,
  },
  birch: {
    id: 'birch', name: 'Paper birch', latin: 'Betula papyrifera',
    density: 800, hardness: 0.61, splitEase: 0.6, value: 80, barkThickness: 0.006,
    heartwood: [0.8, 0.66, 0.52], sapwood: [0.94, 0.89, 0.79], heartFraction: 0.3,
    ringSpacing: 0.004, latewood: 0.08, barkOuter: [0.9, 0.88, 0.84], barkInner: [0.78, 0.55, 0.4],
    resin: 0.0, heatValue: 18.6,
    height: [14, 24], dbh: [0.2, 0.42], matureYears: 70,
    conifer: false, crownRatio: 0.55, crownWidth: 0.26, crownShape: 0.6, crownWidest: 0.45,
    whorlSpacing: 0, branchesPerWhorl: [1, 1], branchAngle: [0.55, 0.95], droop: 0.2, upturn: -0.3,
    taper: 0.8, flare: 0.25, flareHeight: 0.4, lobes: [2, 4], deadBranches: 0.35, lichen: 0.0,
    card: [0.62, 0.31], leafDensity: 1.0, barkTile: [0.8, 1.6], upperBarkTint: [1.0, 1.0, 1.0],
    foliageTint: [1.0, 1.0, 1.0], forkChance: 0.3, brokenTopChance: 0.05, flex: 0.04,
  },
  cedar: {
    id: 'cedar', name: 'Western red cedar', latin: 'Thuja plicata',
    density: 430, hardness: 0.23, splitEase: 0.95, value: 140, barkThickness: 0.02,
    heartwood: [0.6, 0.33, 0.21], sapwood: [0.9, 0.82, 0.67], heartFraction: 0.8,
    ringSpacing: 0.002, latewood: 0.25, barkOuter: [0.48, 0.38, 0.32], barkInner: [0.66, 0.36, 0.24],
    resin: 0.05, heatValue: 19.1,
    height: [26, 46], dbh: [0.8, 2.2], matureYears: 400,
    conifer: true, crownRatio: 0.68, crownWidth: 0.16, crownShape: 0.85, crownWidest: 0.2,
    whorlSpacing: 0, branchesPerWhorl: [1, 1], branchAngle: [-0.75, 0.2], droop: 0.3, upturn: 0.85,
    taper: 1.15, flare: 0.95, flareHeight: 1.8, lobes: [6, 9], deadBranches: 0.5, lichen: 0.25,
    card: [0.7, 0.36], leafDensity: 1.0, barkTile: [1.94, 1.94], upperBarkTint: [1.0, 0.95, 0.9],
    foliageTint: [1.0, 1.0, 0.95], forkChance: 0.15, brokenTopChance: 0.18, flex: 0.022,
  },
};

/** mean annual rings in a stem of radius r (m) */
export function ringCount(species: SpeciesId, r: number): number {
  return Math.max(1, Math.round(r / SPECIES[species].ringSpacing));
}

/** green mass (kg) of a log of length len (m) with end radii r0, r1 (m), bark included */
export function logMass(species: SpeciesId, len: number, r0: number, r1: number): number {
  const vol = (Math.PI * len / 3) * (r0 * r0 + r0 * r1 + r1 * r1);
  return vol * SPECIES[species].density;
}
