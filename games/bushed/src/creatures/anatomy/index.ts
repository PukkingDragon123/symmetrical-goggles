// ANATOMY LIBRARY for BUSHED's creatures, ported from the user's ODDWORLD (src/life/anatomy, kit, cage, art/palette).
// A creature is assembled from PIECES: hand-blocked control cages (rings of points swept along a path, creased on
// their landmarks), subdivided (Catmull-Clark with semi-sharp creases), charted onto one texture page at an even
// texel density, rasterised (per texel: the 3D point, normal, curvature, ambient occlusion) and painted as pixel art
// from that real anatomy, then emitted as one skinned geometry.
//
//   const body = new Body(1024);                   page size (texels)
//   const torso = body.add(trunk({...}));           generators: trunk, skull, mandible, eyeball, eyelid, limb, locks, stalk...
//   body.finalize(torso);                           subdivide now, so other pieces can seat on its surface (gridSurf)
//   const { geo, tex, sd, tris } = body.build({ den: 220 });   skinned geometry, colour page, surface-data page
//
// Changes from ODDWORLD: no directional light baked into the colour page (sky occlusion, AO and cavities only); every
// texel carries roughness / metalness / eye shine in a second page (kit.ts surfaceTexture) for MeshStandardMaterial.
// PAINT (paint.ts): Px.base / put, scales, fur, locks, pelt, pebbles, folds, spots, mud, rosettes, scar, glints,
// outlineMat, creaseInk, flush. Colours are ramp steps (palette.ts RAMPS).
export * from './kit';
export * from './cage';
export * from './core';
export * from './trunk';
export * from './head';
export * from './limb';
export * from './legs';
export * from './locks';
export { curve, stalk, horn, fin, sac, bulbs, spine, type FinSpec } from './append';
export { Px, RP, cell3, h3, cl, ss } from './paint';
export { RAMPS, type RampName } from './palette';
