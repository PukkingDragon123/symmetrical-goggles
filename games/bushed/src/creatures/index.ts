// BUSHED creatures: public API.
//   AxehandleHound (hound.ts)  the centrepiece: lurks, lunges, can be tamed with jerky, becomes a companion
//   Bigfoot (bigfoot.ts)       shy watcher in the dusk; knocks, leaves gifts, flees lights
//   DingbatRoost (dingbat.ts)  antlered bat-owls in the cabin eaves: light or noise sets the roost screeching round your head
//   GrannyTamarack (granny.ts) the antlered grandmother of the fog: takes oatmeal cookies, walks lost people home
//   giftMesh(kind)             Bigfoot's gifts as world props (bigfoot/props.ts)
//   CreatureCtx (types.ts)     what update(ctx) needs each frame
// The anatomy library (anatomy/) and the rig/animator are shared by both and by any future critter.
export { AxehandleHound, houndModel, daylight, HOUND_SOUND, type HoundState } from './hound';
export { Bigfoot, bigfootModel, BIGFOOT_SOUND, type BigfootState } from './bigfoot';
export { giftMesh, handProp, GIFTS, type PropKind } from './bigfoot/props';
export type { CreatureCtx, PlayerView, GroundItem } from './types';
export { houndModelAsync } from './hound';
export { bigfootModelAsync } from './bigfoot';
export { preloadCreatures } from './preload';
export { Wildlife, Critter } from './wildlife';
export { wildModel, wildModelsAsync, type Species } from './wildlife/models';
export { Gumberoo, gumberooModel, gumberooModelAsync, GUMBEROO_SOUND, type GumberooState } from './gumberoo';
export { Dingbat, DingbatRoost, dingbatModel, dingbatModelAsync, DINGBAT_SOUND, type DingbatRoostOpts, type RoostState, type DingbatMode } from './dingbat';
export { GrannyTamarack, grannyModel, grannyModelAsync, GRANNY_SOUND, type GrannyState, type GrannySecret } from './granny';
