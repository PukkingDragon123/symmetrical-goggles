// HUNTING for BUSHED: a bolt-action rifle with a scope, real bullets, white-tailed deer and moose that hear, see and
// smell you, blood trails, field dressing, dragging, meat, hides, trophies, Ontario tags. See hunt.ts (the
// manager), rifle.ts (the rifle and the FP hold), ballistics.ts, fx.ts, items.ts and src/creatures/game (the animals).
//
//   import { install } from './hunting';
//   const hunt = await install(game);          // after game.init(), setArms() and the store are built
//
// install() registers the items (rifle, ammo, licence, tags, knife, venison, moose meat, hides, antlers) with prices
// for the store, loads the rifle, stocks the store (a rifle rack behind the counter: unlocked after $250 earned;
// cartridges and paper on the counter), builds the four animal models in the background (cached in IndexedDB),
// and adds one updater (spawning, animals, bullets, the rifle, dressing, dragging).
import type { Game } from '../game';
import { Hunt, type HuntOpts } from './hunt';

export { Hunt, type HuntOpts } from './hunt';
export { Rifle } from './rifle';
export { Ballistics, type BulletHit, MUZZLE_V } from './ballistics';
export { HUNT_ITEMS, registerHuntItems } from './items';
export { GameAnimal, Herd, type HuntCtx, type HitZone, type AnimalState } from '../../creatures/game/animal';

export async function install(game: Game, o: HuntOpts = {}): Promise<Hunt> {
  const hunt = new Hunt(game, o);
  await hunt.init();
  game.updaters.push((dt) => hunt.update(dt));
  (game as unknown as { hunt: Hunt }).hunt = hunt;
  return hunt;
}
