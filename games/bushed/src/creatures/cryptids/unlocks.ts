// Where the five cryptid recipe cards come from (each one game.events 'recipe' { id, from }, once):
//   Hodag-heart pie         Ray's tin in the hodag's swamp (caches.ts)
//   Bannock of the damned   Ray's tin in the deep woods (caches.ts)
//   Squonk-tear jelly       the Book of Cryptids writes it in once you have seen a squonk pull itself back together
//   Smoked-bark brittle     the agropelter: the first branch it throws at you has a card wrapped round it
//   Firefly-glow broth      a campfire tale ("The lantern up the spruce", added to the tales here); or the squonk's
//                           happy tear when it eats the jelly (treats.ts)
import * as THREE from 'three';
import type { Game } from '../../game/game';
import { TALES } from '../../game/stories/tales';
import { hud } from '../../ui/hud';
import { CRYPTID_RECIPES } from '../../game/cooking/cryptid_recipes';

/** a tale for the campground fire: it teaches the wapaloosie's scouting rule and hands over the broth card */
const TALE_ID = 'lantern_spruce';
if (!TALES.some((t) => t.id === TALE_ID)) {
  TALES.push({
    id: TALE_ID, title: 'The lantern up the spruce', tellers: ['esko', 'hollis', 'marcel'], critter: 'wapaloosie', rule: 'r4',
    gist: 'The cook fed the long dog in the spruces a broth that glowed; from the top of the tree it found the lost crew.',
    lines: [
      'Camp Nine, up the Kapuskasing, the year the snow came in September. Four men went out to cruise timber and did not come back.',
      'The cook had a pet. Long as a dachshund, lived in the spruces, ate the lichen off the bark. A wapaloosie, the Finns called it.',
      'She made it a broth that night. Chanterelles fried in butter, wild onion, a cube of bouillon, and the lid OFF so the glow gets out.',
      'It drank it down, and its eyes lit up green as foxfire, and it went up the tallest spruce in camp like a caterpillar on a hot stove.',
      'From the top it saw everything. The four men, a cache of pork, two hodags and the Company\'s inspector. It chattered till they went and got them.',
      'She wrote the broth down on a card. I have it here somewhere. Here. Mind the grease.',
    ],
  });
}

const give = (g: Game, id: string, from: string, line?: string) => {
  const f = g.flags as Set<string>;
  if (f.has(`cryptid_card:${id}`)) return;
  f.add(`cryptid_card:${id}`);
  const name = CRYPTID_RECIPES.find((r) => r.id === id)?.name ?? id;
  hud.say(`<i>${line ? line + ' ' : ''}A recipe card for the box by the stove: ${name}.</i>`, 5.5);
  g.events.emit('recipe', { id, from });
};

/** poll the Book and the tales; listen for the agropelter's branch */
export function installUnlocks(g: Game): { onEvent(ev: string, who: string, pos: THREE.Vector3): void } {
  let t = 0;
  g.updaters.push((dt) => {
    if ((t -= dt) > 0) return;
    t = 1;
    const f = g.flags as Set<string>;
    if (g.journal?.knows?.('squonk', 'r4')) give(g, 'squonk_jelly', 'the Book of Cryptids', 'The Book licks its lips and writes a recipe in the squonk\'s margin, in red: Squonk-tear jelly.');
    if (f.has(`tale:${TALE_ID}`)) give(g, 'firefly_broth', 'the campfire');
  });
  return {
    onEvent(ev, who, pos) {
      if (who === 'agropelter' && (ev === 'throw' || ev === 'hit') && g.player.pos.distanceTo(pos) < 40) {
        give(g, 'bark_brittle', 'the agropelter', 'That branch had a card tied round it with fishing line. A recipe? "SMOKED-BARK BRITTLE. Shut him up for good."');
      }
    },
  };
}
