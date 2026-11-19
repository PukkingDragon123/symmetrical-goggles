// Cooking: the items it adds and the recipes it recognises. A dish is whatever ends up together in one vessel
// when you serve it: bacon slices and eggs in the skillet are bacon & eggs; beans and syrup in the pot are maple
// beans. Cooked food carries more energy and warmth than the raw ingredients, and a good cook gets a little more.
import { addItems, ITEMS, type ItemDef } from '../items';

const meal = (id: string, name: string, desc: string, kcal: number, warmth: number, extra: Partial<ItemDef> = {}): ItemDef => ({
  id, name, desc, price: 0, mass: 0.5, model: 'gen:enamel_plate', pocket: true, food: { kcal, warmth }, tags: ['meal'], ...extra,
});

export const COOK_ITEMS: Record<string, ItemDef> = {
  bannock_mix: {
    id: 'bannock_mix', name: 'Bannock mix', desc: 'Flour, baking powder, salt and a little lard in a paper sack. Add water, knead, fry.',
    price: 6, mass: 0.9, model: 'gen:bannock_mix', pocket: true, tags: ['ingredient'],
  },
  meal_bacon_eggs: meal('meal_bacon_eggs', 'Bacon & eggs', 'Back bacon fried golden, eggs in the fat. A lumberjack breakfast.', 1550, 0.4),
  meal_bacon: meal('meal_bacon', 'Fried back bacon', 'Peameal rounds with a crisp cornmeal edge.', 1050, 0.3),
  meal_eggs: meal('meal_eggs', 'Fried eggs', 'Lacy edges, soft yolks.', 520, 0.25),
  meal_trout: meal('meal_trout', 'Pan-fried trout', 'Crisp skin, flakes off the bone. Tastes like the lake.', 980, 0.35),
  meal_bannock: meal('meal_bannock', 'Fresh bannock', 'Hot pan bread, golden both sides. Better than the store\'s.', 900, 0.25),
  meal_berry_bannock: meal('meal_berry_bannock', 'Blueberry bannock', 'Bannock studded with wild blueberries. Something out there has a sweet tooth.', 1050, 0.25),
  meal_stew: meal('meal_stew', 'Camp stew', 'Meat, mushrooms and whatever else, simmered till it falls apart. Warms you to the boots.', 1350, 0.6),
  meal_maple_beans: meal('meal_maple_beans', 'Maple beans', 'Baked beans simmered with a glug of dark syrup.', 980, 0.45),
  meal_beans: meal('meal_beans', 'Hot beans', 'Beans out of the can, heated through.', 480, 0.3),
  meal_meat: meal('meal_meat', 'Seared game meat', 'Dark, rich, a little wild.', 900, 0.35),
  meal_chanterelles: meal('meal_chanterelles', 'Fried chanterelles', 'Golden mushrooms in hot fat. Apricot and pepper.', 160, 0.15),
  cowboy_coffee: meal('cowboy_coffee', 'Cowboy coffee', 'Boiled with the grounds, settled, poured black. Terrible. Perfect.', 10, 0.45, { food: { kcal: 10, warmth: 0.45, drink: true }, mass: 0.35, model: 'gen:enamel_mug' }),
  cryptid_jerky: {
    id: 'cryptid_jerky', name: 'Smoked jerky', desc: 'Dark, smoky, chewy strips cured over the stove. Things in the woods would trade their mothers for it.',
    price: 0, sell: 9, mass: 0.12, model: 'gen:jerky', pocket: true, food: { kcal: 380, houndTreat: 2 }, tags: ['treat'],
  },
  burnt_food: meal('burnt_food', 'Something burnt', 'Charred. Edible, technically.', 160, 0.05),
};

export function registerCookItems(): void {
  const add: Record<string, ItemDef> = {};
  for (const [k, v] of Object.entries(COOK_ITEMS)) if (!ITEMS[k]) add[k] = v;
  addItems(add);
}

/** item ids that count as game meat (other modules may add hunting) */
export function meatIds(): string[] {
  return Object.values(ITEMS).filter((d) => d.food?.raw && (d.tags?.includes('meat') || /meat|venison|moose|rabbit|hare|grouse|partridge/.test(d.id))).map((d) => d.id);
}

export type FoodKind = 'bacon' | 'egg' | 'trout' | 'dough' | 'meat' | 'shroom';

/** what a skillet's contents make */
export function skilletDish(counts: Partial<Record<FoodKind, number>>, berry: boolean): string | null {
  const c = (k: FoodKind) => counts[k] ?? 0;
  if (c('dough')) return berry ? 'meal_berry_bannock' : 'meal_bannock';
  if (c('bacon') && c('egg')) return 'meal_bacon_eggs';
  if (c('bacon')) return 'meal_bacon';
  if (c('egg')) return 'meal_eggs';
  if (c('trout')) return 'meal_trout';
  if (c('meat')) return 'meal_meat';
  if (c('shroom')) return 'meal_chanterelles';
  return null;
}

/** what a pot's contents make (once simmered) */
export function potDish(has: { beans: boolean; syrup: boolean; meat: boolean; bacon: boolean; shroom: boolean; water: boolean }): string | null {
  if ((has.meat || has.bacon || has.shroom) && has.water) return 'meal_stew';
  if (has.beans && has.syrup) return 'meal_maple_beans';
  if (has.beans) return 'meal_beans';
  return null;
}

export const DISH_LINES: Record<string, [string, string, string]> = {
  // [perfect, fine, poor]
  meal_bacon_eggs: ['Golden bacon, eggs with lace on the edges. The whole cabin smells like a Saturday.', 'Bacon and eggs. Good enough to make you forget the cold.', 'Bacon and eggs, more or less.'],
  meal_bacon: ['Every round crisp at the edge and pink in the middle. Perfect.', 'Back bacon. Hard to go wrong.', 'Chewy. Still bacon.'],
  meal_eggs: ['Whites set, yolks still runny. Just right.', 'Fried eggs. Simple. Warm.', 'Rubbery, but it\'s food.'],
  meal_trout: ['The skin crackles. The flesh falls off the bone.', 'Trout fried in fat. Better than any restaurant.', 'A little dry. Still a lake trout.'],
  meal_bannock: ['Golden on both sides, fluffy inside. Ray would be proud.', 'Hot bannock. Dense and good.', 'Doughy in the middle.'],
  meal_berry_bannock: ['The berries burst purple in the crumb. Unbelievable.', 'Blueberry bannock. Sweet and heavy.', 'Purple, gummy, still good.'],
  meal_stew: ['It falls apart on the spoon. That\'ll keep the cold out all night.', 'Thick and hot. Stew.', 'Thin and a bit raw. Hot, at least.'],
  meal_maple_beans: ['Dark, sweet, sticky. The good stuff.', 'Maple beans. Lumberjack candy.', 'Scorched on the bottom.'],
  meal_beans: ['Hot beans, just bubbling.', 'Hot beans out of the can. Lumberjack cuisine.', 'Lukewarm beans.'],
  meal_meat: ['Seared dark outside, rosy inside.', 'Game meat, fried. Rich.', 'Tough as a boot.'],
  meal_chanterelles: ['Golden and peppery.', 'Mushrooms fried in fat.', 'Soggy mushrooms.'],
  cowboy_coffee: ['Black, strong, no grounds in the teeth. Perfect.', 'Black coffee, boiled with the grounds. Terrible. Perfect.', 'Bitter as tar and full of grit.'],
};
