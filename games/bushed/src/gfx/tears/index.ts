// Tears: a small fluid system for a weeping creature (the squonk). See fluid.ts for the physics, surface.ts for the
// skinned surface the drops run on, wetmap.ts for the wet film on the skin and the melt, puddles.ts for the ground,
// water.ts for the clear-water look.
export { TearFluid, type TearOpts, type TearFrame, type TearAnchors } from './fluid';
export { Puddles, DRIP, SHEET } from './puddles';
export { WetMap, patchSkin, meltPoint, type MeltShape, type WetUniforms } from './wetmap';
export { SkinPatch, type SurfPt } from './surface';
export { dropMaterial, puddleMaterial } from './water';
