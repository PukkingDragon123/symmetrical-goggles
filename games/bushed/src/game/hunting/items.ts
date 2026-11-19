// Hunting items: the rifle, its cartridges, the Ontario licence and tags, and what comes off an animal (meat for
// the cooking engineer's recipes, hides and antlers to sell or hang on the wall).
import { addItems, ITEMS, type ItemDef } from '../items';

export const HUNT_ITEMS: Record<string, ItemDef> = {
  rifle: {
    id: 'rifle', name: 'Bolt-action rifle, 7.62x54R', price: 340, mass: 4.1, model: 'bolt_action_rifle_7_62', pocket: false, unlockAt: 250,
    desc: 'A surplus Mosin with a little side scope and a birch stock somebody loved once. Five in the box magazine, one at a time through the bolt.',
    tags: ['hunting', 'weapon'],
  },
  ammo_762: {
    id: 'ammo_762', name: '7.62x54R cartridges', price: 1.5, mass: 0.022, model: 'bolt_action_rifle_7_62_round', pocket: true,
    desc: 'Soft-point hunting loads. Brass, lacquered, and heavy for what they are.', tags: ['hunting', 'ammo'],
  },
  ammo_box_762: {
    id: 'ammo_box_762', name: 'Box of 7.62x54R (20)', price: 28, mass: 0.48, model: 'ammo_box', pocket: true,
    desc: 'Twenty soft points in a paper box. Goes into your pockets as loose rounds.', tags: ['hunting', 'ammo'],
  },
  licence: {
    id: 'licence', name: 'Outdoors Card (hunting)', price: 18, mass: 0.01, model: 'hunt:paper', pocket: true,
    desc: 'The plastic card that says the province lets you try. Keep it on you.', tags: ['hunting', 'paper'],
  },
  tag_deer: {
    id: 'tag_deer', name: 'Deer tag (WMU 49)', price: 52, mass: 0.01, model: 'hunt:paper', pocket: true,
    desc: 'One white-tailed deer, either sex, this season. Notch the date and fix it to the animal before you move it.', tags: ['hunting', 'paper'],
  },
  tag_moose: {
    id: 'tag_moose', name: 'Moose tag (bull, WMU 49)', price: 96, mass: 0.01, model: 'hunt:paper', pocket: true, unlockAt: 500,
    desc: 'A bull moose tag. Odile "knows a guy who didn\'t draw his". Do not ask.', tags: ['hunting', 'paper'],
  },
  hunting_knife: {
    id: 'hunting_knife', name: 'Skinning knife', price: 22, mass: 0.2, model: 'fish_knife', pocket: true,
    desc: 'A short drop-point blade with a gut hook. Field dressing, skinning, the cutting board.', tags: ['hunting', 'tool'],
  },
  venison: {
    id: 'venison', name: 'Venison', price: 0, mass: 1.2, model: 'hunt:venison', pocket: true,
    desc: 'A butcher-paper parcel of white-tail: backstrap, a roast, a pile of stew meat. Cook it.', food: { kcal: 1400, raw: true }, tags: ['meat', 'raw', 'game'],
  },
  moose_meat: {
    id: 'moose_meat', name: 'Moose meat', price: 0, mass: 2.5, model: 'hunt:moose_meat', pocket: true,
    desc: 'Dark, lean, a lot of it. A moose fills a freezer and then some.', food: { kcal: 2600, raw: true }, tags: ['meat', 'raw', 'game'],
  },
  deer_liver: {
    id: 'deer_liver', name: 'Deer heart and liver', price: 0, mass: 0.9, model: 'hunt:venison', pocket: true,
    desc: 'The hunter\'s share. Fried with onions the same night, if you have onions.', food: { kcal: 900, raw: true }, tags: ['meat', 'raw', 'game'],
  },
  deer_hide: {
    id: 'deer_hide', name: 'Deer hide', price: 0, sell: 38, mass: 3.5, model: 'hunt:deer_hide', pocket: false,
    desc: 'Salted and rolled hair-side in. A tannery in Sudbury pays the store for them.', tags: ['hunting', 'hide'],
  },
  moose_hide: {
    id: 'moose_hide', name: 'Moose hide', price: 0, sell: 95, mass: 14, model: 'hunt:moose_hide', pocket: false,
    desc: 'Thick as a boot sole and heavy as a child. Moccasin leather, eventually.', tags: ['hunting', 'hide'],
  },
  antlers_deer: {
    id: 'antlers_deer', name: 'White-tail antlers', price: 0, sell: 65, mass: 1.1, model: 'hunt:antlers_deer', pocket: false,
    desc: 'A buck\'s rack on a scrap of skull cap and a pine plaque. Count the points, then count them again.', tags: ['hunting', 'trophy'],
  },
  antlers_moose: {
    id: 'antlers_moose', name: 'Moose paddles', price: 0, sell: 160, mass: 9, model: 'hunt:antlers_moose', pocket: false,
    desc: 'A bull\'s palms, wider than the cabin door. Nobody believes you without them.', tags: ['hunting', 'trophy'],
  },
};

/** register the hunting items with the catalogue (idempotent) */
export function registerHuntItems(): void {
  const add: Record<string, ItemDef> = {};
  for (const [k, v] of Object.entries(HUNT_ITEMS)) if (!ITEMS[k]) add[k] = { ...v };
  addItems(add);
}
