// BUSHED creatures: public API.
//   AxehandleHound (hound.ts)  the centrepiece: lurks, lunges, can be tamed with jerky, becomes a companion
//   Bigfoot (bigfoot.ts)       shy watcher in the dusk; knocks, leaves gifts, flees lights
//   DingbatRoost (dingbat.ts)  antlered bat-owls in the cabin eaves: light or noise sets the roost screeching round your head
//   GrannyTamarack (granny.ts) the antlered grandmother of the fog: takes oatmeal cookies, walks lost people home
//   giftMesh(kind)             Bigfoot's gifts as world props (bigfoot/props.ts)
//   CreatureCtx (types.ts)     what update(ctx) needs each frame
//   fur/ (addFur, furZones)    real shell fur with pixel-art strands, silhouette fins and spring physics
//   expression.ts              shared faces: moods (happy, joy, angry, scared, curious, pleading, sad, sleepy, eating),
//                              blinks, brows, ears, lips, tilts; Dangle (floppy-ear springs)
//   FOOD: every creature has favoriteFood and offer(item) -> true when taken ('eat' then 'happy' events):
//     hound jerky (HOUND_FOODS), Bigfoot fish/berries, Granny cookies, gumberoo beans, DingbatRoost maple syrup,
//     Wildlife squirrels nuts/berries (SQUIRREL_FOODS)
// The anatomy library (anatomy/) and the rig/animator are shared by both and by any future critter.
export { AxehandleHound, houndModel, daylight, HOUND_SOUND, HOUND_FOODS, type HoundState } from './hound';
export { Bigfoot, bigfootModel, BIGFOOT_SOUND, BIGFOOT_FOODS, type BigfootState } from './bigfoot';
export { giftMesh, handProp, GIFTS, type PropKind } from './bigfoot/props';
export type { CreatureCtx, PlayerView, GroundItem } from './types';
export { houndModelAsync } from './hound';
export { bigfootModelAsync } from './bigfoot';
export { preloadCreatures } from './preload';
export { Wildlife, Critter, SQUIRREL_FOODS } from './wildlife';
export { wildModel, wildModelsAsync, type Species } from './wildlife/models';
export { Gumberoo, gumberooModel, gumberooModelAsync, GUMBEROO_SOUND, GUMBEROO_FOODS, type GumberooState } from './gumberoo';
export { Dingbat, DingbatRoost, dingbatModel, dingbatModelAsync, DINGBAT_SOUND, DINGBAT_FOODS, type DingbatRoostOpts, type RoostState, type DingbatMode } from './dingbat';
export { GrannyTamarack, grannyModel, grannyModelAsync, GRANNY_SOUND, type GrannyState, type GrannySecret } from './granny';
export { Fur, addFur, furZones, type FurSpec, type FurSpring, type FurZone } from './fur';
export { Expression, Dangle, PRESETS as MOOD_PRESETS, type Mood, type Face } from './expression';
// The six lumber-camp cryptids (src/creatures/cryptids): Hodag, Squonk, Hidebehind, Agropelter, Teakettler, Snow Wasset.
//   await preloadCreatures(); const cryptids = spawnNewCryptids(scene); for (const c of cryptids) c.update(ctx); c.offer(item)
export {
  spawnNewCryptids, cryptidSpots, findSpot, Cryptid, Hodag, Squonk, Hidebehind, Agropelter, Teakettler, SnowWasset,
  HODAG_SOUND, SQUONK_SOUND, HIDEBEHIND_SOUND, AGROPELTER_SOUND, TEAKETTLER_SOUND, WASSET_SOUND,
  type NewCryptid, type CryptidId,
} from './cryptids';
