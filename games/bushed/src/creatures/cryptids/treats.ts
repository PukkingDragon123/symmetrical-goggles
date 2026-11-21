// The weird camp recipes the cryptids love (src/game/cooking/cryptid_recipes.ts): held out to a creature that loves
// one, it counts as a big feed (a trust jump), with a reaction of its own. The four helpers (helper.ts) read their
// `loves`; the older cryptids get it here, by wrapping their offer() (their own files stay untouched):
//   hodag      Hodag-heart pie            eats it as three feeds of bacon: friends at once, and it rolls over
//   squonk     Squonk-tear jelly          it stops crying; one happy tear: the Firefly-glow broth card
//   agropelter Smoked-bark brittle        two feeds of syrup, and it drops dry fatwood down instead of branches
//   teakettler Firefly-glow broth         two feeds of coffee and a long, happy whistle
//   goofus     Bannock of the damned      two feeds of bannock
//   hidebehind Bannock of the damned      held out at night, it takes it from your hand: the only thing it ever does
//                                         (left alone for the night)
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { NewCryptid } from './base';
import { HelperCryptid } from './helper';
import { isNight } from './base';
import { hud } from '../../ui/hud';

interface OldLove { food: string; feeds: number; line: string; give?: [string, number]; recipe?: string }

export const OLD_LOVES: Record<string, Record<string, OldLove>> = {
  hodag: { meal_hodag_pie: { food: 'bacon', feeds: 3, line: 'It ate the pie. ALL of it. Now it\'s on its back, purring like a cement mixer.' } },
  squonk: { meal_squonk_jelly: { food: 'berries', feeds: 2, line: 'It stopped crying. It cried one more tear, a happy one, into my hand. There\'s a card stuck to it.', recipe: 'firefly_broth' } },
  agropelter: { meal_bark_brittle: { food: 'syrup', feeds: 2, line: 'Crunch, crunch, up in the snag. Then down comes... dry fatwood. A thank-you.', give: ['firestarter', 3] } },
  teakettler: { meal_firefly_broth: { food: 'coffee', feeds: 2, line: 'It drank the broth and whistled a whole tune. Its steam is glowing.' } },
  goofus: { meal_bannock_damned: { food: 'bread', feeds: 2, line: 'It ate the black bannock backwards. Somehow.' } },
};

export interface CryptidHooks {
  /** route an event as if the creature had emitted it (critters.ts: sounds, the Book, lines) */
  event(ev: string, who: string, pos: THREE.Vector3, data?: Record<string, unknown>): void;
  think(text: string): void;
}

/** wrap the older cryptids' offer() so the loved recipes count big; per-frame check for the hidebehind's take */
export function installTreats(g: Game, list: NewCryptid[], hooks: CryptidHooks): (dt: number) => void {
  for (const c of list) {
    if (c instanceof HelperCryptid) continue;
    const loves = OLD_LOVES[c.id];
    if (!loves) continue;
    const base = c.offer.bind(c);
    (c as { offer(i: string): boolean }).offer = (item: string) => {
      const l = loves[item];
      if (!l) return base(item);
      if (!base(l.food)) return false;
      const was = c.trust;
      c.trust = Math.min(1, c.trust + 0.5 * (l.feeds - 1));
      const at = c.object.position;
      hooks.think(l.line);
      hooks.event('treat', c.id, at, { item });
      if (was < 1 && c.trust >= 1) hooks.event('befriended', c.id, at);
      if (l.give) hooks.event('gift', c.id, at, { give: { item: l.give[0], n: l.give[1], at: at.clone().add(new THREE.Vector3(0, 1.5, 0)) } });
      if (l.recipe) setTimeout(() => g.events.emit('recipe', { id: l.recipe, from: `the ${c.name.toLowerCase()}` }), 1800);
      return true;
    };
  }
  // the hidebehind: hold the black bannock out, at night, while it is about, and keep still
  const hb = list.find((c) => c.id === 'hidebehind') as (NewCryptid & { go?(s: string): void; satedTonight?: boolean }) | undefined;
  let held = 0;
  return (dt: number) => {
    if (!hb) return;
    const h = g.hands?.heldItem;
    const near = hb.pos.distanceTo(g.player.pos) < 30 && hb.state !== 'absent' && hb.state !== 'sated';
    if (h === 'meal_bannock_damned' && near && isNight(g.hour) && g.player.speed < 0.6) held += dt; else held = Math.max(0, held - dt * 2);
    if (held > 3) {
      held = 0;
      if (!g.take('meal_bannock_damned')) return;
      if (!g.owns('meal_bannock_damned')) g.hands?.equip(null);
      hb.satedTonight = true; hb.go?.('sated');
      hud.say('<i>Something long-fingered and cold takes the bannock out of my hand. I didn\'t see it. I didn\'t turn round.</i>', 5);
      hooks.event('steal', 'hidebehind', hb.pos, { item: 'meal_bannock_damned' });
    }
  };
}
