// BUSHED creatures: public API.
//   AxehandleHound (hound.ts)  the centrepiece: lurks, lunges, can be tamed with jerky, becomes a companion
//   Bigfoot (bigfoot.ts)       shy watcher in the dusk; knocks, leaves gifts, flees lights
//   giftMesh(kind)             Bigfoot's gifts as world props (bigfoot/props.ts)
//   CreatureCtx (types.ts)     what update(ctx) needs each frame
// The anatomy library (anatomy/) and the rig/animator are shared by both and by any future critter.
export { AxehandleHound, houndModel, daylight, HOUND_SOUND, type HoundState } from './hound';
export { Bigfoot, bigfootModel, BIGFOOT_SOUND, type BigfootState } from './bigfoot';
export { giftMesh, handProp, GIFTS, type PropKind } from './bigfoot/props';
export type { CreatureCtx, PlayerView, GroundItem } from './types';
