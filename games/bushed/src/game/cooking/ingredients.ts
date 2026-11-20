// The kitchen's ingredients: the groceries the general store sells (each a real product model in
// src/places/products.ts) and what comes off the land (chanterelles, berries, wild onion, trout, venison, moose).
// ING maps every inventory item the stove can use to how the kitchen handles it: where it sits (pantry table,
// larder shelves, counter), how it goes in (cut on the board, poured, measured with a cup or spoon, shaken, cracked,
// a pat cut off a brick...), how many portions a package holds and the recipe key it counts as.
import { addItems, ITEMS, type ItemDef } from '../items';

const groc = (id: string, name: string, desc: string, price: number, mass: number, extra: Partial<ItemDef> = {}): ItemDef => ({
  id, name, desc, price, mass, model: `gen:${id}`, pocket: true, tags: ['ingredient', 'grocery'], ...extra,
});

/** groceries sold at Pruneau's (the store stocks its shelves with these ids) */
export const GROCERY_ITEMS: Record<string, ItemDef> = {
  oil: groc('oil', 'Canola oil (1 L)', 'Prairie Gold, pressed in Saskatoon. Pour it in a hot pan till it shimmers. Not past that.', 6, 0.95),
  butter: groc('butter', 'Butter (454 g)', 'Salted, from the Laurentide dairy. Melts, foams, then goes nutty brown. Then black, if you look away.', 6, 0.46, { food: { kcal: 900, raw: true } }),
  lard: groc('lard', 'Lard (454 g)', 'Pure white lard. Flaky pastry, crisp bannock, and a refill for the pail by the stove.', 4, 0.46),
  flour: groc('flour', 'Flour (2.5 kg)', 'All-purpose, Canadian wheat. Bannock, flapjacks, dumplings, pie crust.', 7, 2.5),
  sugar: groc('sugar', 'White sugar (2 kg)', 'For flapjacks, the grunt, and the pouding.', 4, 2),
  salt: groc('salt', 'Table salt', 'A round box of iodized salt. Fill the shaker by the stove.', 2, 1),
  pepper: groc('pepper', 'Black pepper', 'Ground black pepper in a tin.', 4, 0.1),
  baking_powder: groc('baking_powder', 'Baking powder', 'Lift: it makes bannock rise. A spoonful or two, not the tin.', 3, 0.23),
  oats: groc('oats', 'Rolled oats (1 kg)', 'Porridge for cold mornings.', 5, 1),
  rice: groc('rice', 'Long grain rice', 'Boil it. Two of water to one of rice.', 4, 0.9),
  macaroni: groc('macaroni', 'Elbow macaroni', 'For the mac and cheese.', 3, 0.5),
  peas: groc('peas', 'Yellow split peas', 'Soupe aux pois: peas, salt pork, onion, a whole afternoon.', 4, 0.9),
  milk: groc('milk', 'Milk (1 L)', 'Homo milk in a carton. Keep it cool.', 3, 1.05, { food: { kcal: 640, drink: true } }),
  onions: groc('onions', 'Onions (3)', 'Three yellow onions. Peel, halve, slice, cross-cut: diced.', 3, 0.6),
  potatoes: groc('potatoes', 'Potatoes (5 lb bag)', 'Ontario yellow potatoes. Stew, hash browns, tourtiere.', 5, 2.2),
  carrots: groc('carrots', 'Carrots (bunch)', 'A bunch of four, tops on.', 3, 0.5, { food: { kcal: 120, raw: true } }),
  garlic: groc('garlic', 'Garlic (2 bulbs)', 'Break off a clove, peel it, mince it fine.', 2, 0.1),
  tomatoes: groc('tomatoes', 'Diced tomatoes (796 ml)', 'Niagara tomatoes in a can. Chili.', 3, 0.85),
  bouillon: groc('bouillon', 'Beef bouillon cubes', 'Six cubes. One in the stew pot makes it taste like a stew.', 3, 0.07),
  ground_beef: groc('ground_beef', 'Ground beef (1 lb)', 'Lean, from the butcher in town. Tourtiere, chili, a fry-up.', 8, 0.47, { food: { kcal: 1100, raw: true }, tags: ['ingredient', 'grocery', 'meat'] }),
  sausage: groc('sausage', 'Pork sausages (4)', 'Four fat pork sausages. The hound has noticed.', 7, 0.45, { food: { kcal: 1150, raw: true }, tags: ['ingredient', 'grocery', 'meat'] }),
  cheese: groc('cheese', 'Old cheddar', 'A brick of sharp cheddar, waxed at the ends.', 8, 0.4, { food: { kcal: 1600 } }),
  tea: groc('tea', 'Orange pekoe tea', 'Black tea leaves. Strong enough to trot a mouse on.', 5, 0.15),
  labrador_tea: groc('labrador_tea', 'Labrador tea', 'Hand-picked leaves from the muskeg. Steep, never boil.', 6, 0.08),
  wild_onion: {
    id: 'wild_onion', name: 'Wild onions', desc: 'A bunch of wild onions from a wet meadow. Sharp and green.', price: 0, sell: 3, mass: 0.08,
    model: 'gen:wild_onion', pocket: true, food: { kcal: 30, raw: true }, tags: ['ingredient', 'forage'],
  },
};

/** register the groceries with the catalogue (idempotent, before the store stocks its shelves) */
export function registerGroceries(): void {
  const add: Record<string, ItemDef> = {};
  for (const [k, v] of Object.entries(GROCERY_ITEMS)) if (!ITEMS[k]) add[k] = { ...v };
  addItems(add);
}

// ---------------------------------------------------------------------------------------------- kitchen use
/**
 * How an ingredient goes in:
 *   produce  cut on the board (onion, potato, carrot, garlic, wild onion)
 *   unwrap   unwrapped on the board and cut there (bacon loin, game meat, cheese, trout)
 *   crumble  straight into a pan or pot, broken up there (ground beef)
 *   links    whole pieces into the pan (sausages)
 *   pour     tipped from the bottle / carton / can, as much as you hold it there (oil, milk, syrup, tomatoes, beans)
 *   measure  a cup or a spoon of it into the bowl or the pot (flour, sugar, oats, rice, macaroni, peas, baking powder)
 *   leaves   a spoon of leaves or grounds into the coffee pot (coffee, tea, Labrador tea)
 *   shake    the shaker over the food (salt, pepper)
 *   crack    one at a time into the pan or the bowl (eggs)
 *   pat      a pat cut off the brick (butter, lard)
 *   cube     dropped into the pot (bouillon)
 *   handful  a handful (berries, chanterelles)
 */
export type How = 'produce' | 'unwrap' | 'crumble' | 'links' | 'pour' | 'measure' | 'leaves' | 'shake' | 'crack' | 'pat' | 'cube' | 'handful';

export interface IngDef {
  /** recipe key it counts as */
  key: string;
  /** short name in hints */
  name: string;
  how: How;
  /** portions in one package (the inventory item is taken when a new package is opened) */
  uses: number;
  /** the portion's name: '¼ cup', 'egg', 'pinch' */
  unit: string;
  where: 'table' | 'larder' | 'counter';
  /** kcal per portion (dish energy) */
  kcal: number;
}

export const ING: Record<string, IngDef> = {
  // fresh, on the pantry table
  eggs: { key: 'egg', name: 'eggs', how: 'crack', uses: 6, unit: 'egg', where: 'table', kcal: 75 },
  milk: { key: 'milk', name: 'milk', how: 'pour', uses: 16, unit: '¼ cup', where: 'table', kcal: 38 },
  butter: { key: 'butter', name: 'butter', how: 'pat', uses: 16, unit: 'tbsp', where: 'counter', kcal: 100 },
  cheese: { key: 'cheese', name: 'cheddar', how: 'unwrap', uses: 1, unit: 'brick', where: 'table', kcal: 1600 },
  bacon: { key: 'bacon', name: 'back bacon', how: 'unwrap', uses: 1, unit: 'loin', where: 'table', kcal: 900 },
  ground_beef: { key: 'beef', name: 'ground beef', how: 'crumble', uses: 2, unit: 'half pound', where: 'table', kcal: 550 },
  sausage: { key: 'sausage', name: 'sausages', how: 'links', uses: 2, unit: 'pair', where: 'table', kcal: 575 },
  venison: { key: 'venison', name: 'venison', how: 'unwrap', uses: 1, unit: 'parcel', where: 'table', kcal: 1400 },
  moose_meat: { key: 'moose', name: 'moose', how: 'unwrap', uses: 1, unit: 'slab', where: 'table', kcal: 1300 },
  deer_liver: { key: 'liver', name: 'heart and liver', how: 'unwrap', uses: 1, unit: 'parcel', where: 'table', kcal: 900 },
  onions: { key: 'onion', name: 'onions', how: 'produce', uses: 3, unit: 'onion', where: 'table', kcal: 45 },
  wild_onion: { key: 'onion', name: 'wild onions', how: 'produce', uses: 4, unit: 'stalk', where: 'table', kcal: 8 },
  potatoes: { key: 'potato', name: 'potatoes', how: 'produce', uses: 8, unit: 'potato', where: 'table', kcal: 160 },
  carrots: { key: 'carrot', name: 'carrots', how: 'produce', uses: 4, unit: 'carrot', where: 'table', kcal: 30 },
  garlic: { key: 'garlic', name: 'garlic', how: 'produce', uses: 16, unit: 'clove', where: 'table', kcal: 5 },
  berries: { key: 'berries', name: 'blueberries', how: 'handful', uses: 3, unit: 'handful', where: 'table', kcal: 30 },
  chanterelle: { key: 'chanterelle', name: 'chanterelles', how: 'unwrap', uses: 1, unit: 'cluster', where: 'table', kcal: 40 },
  // staples, on the larder shelves
  flour: { key: 'flour', name: 'flour', how: 'measure', uses: 76, unit: '¼ cup', where: 'larder', kcal: 114 },
  sugar: { key: 'sugar', name: 'sugar', how: 'measure', uses: 40, unit: '¼ cup', where: 'larder', kcal: 194 },
  baking_powder: { key: 'bp', name: 'baking powder', how: 'measure', uses: 45, unit: 'tsp', where: 'larder', kcal: 2 },
  oats: { key: 'oats', name: 'oats', how: 'measure', uses: 40, unit: '¼ cup', where: 'larder', kcal: 75 },
  rice: { key: 'rice', name: 'rice', how: 'measure', uses: 20, unit: '¼ cup', where: 'larder', kcal: 170 },
  macaroni: { key: 'macaroni', name: 'macaroni', how: 'measure', uses: 18, unit: '¼ cup', where: 'larder', kcal: 100 },
  peas: { key: 'peas', name: 'split peas', how: 'measure', uses: 18, unit: '¼ cup', where: 'larder', kcal: 170 },
  tomatoes: { key: 'tomatoes', name: 'tomatoes', how: 'pour', uses: 3, unit: 'third of the can', where: 'larder', kcal: 30 },
  beans: { key: 'beans', name: 'beans', how: 'pour', uses: 2, unit: 'half can', where: 'larder', kcal: 210 },
  bouillon: { key: 'bouillon', name: 'bouillon', how: 'cube', uses: 6, unit: 'cube', where: 'larder', kcal: 10 },
  syrup: { key: 'syrup', name: 'maple syrup', how: 'pour', uses: 12, unit: 'tbsp', where: 'larder', kcal: 52 },
  coffee: { key: 'coffee', name: 'coffee', how: 'leaves', uses: 12, unit: 'spoon', where: 'larder', kcal: 2 },
  tea: { key: 'tea', name: 'tea', how: 'leaves', uses: 24, unit: 'spoon', where: 'larder', kcal: 1 },
  labrador_tea: { key: 'labtea', name: 'Labrador tea', how: 'leaves', uses: 10, unit: 'pinch', where: 'larder', kcal: 1 },
  // on the counter by the stove
  oil: { key: 'oil', name: 'canola oil', how: 'pour', uses: 66, unit: 'tbsp', where: 'counter', kcal: 120 },
  lard: { key: 'lard', name: 'lard', how: 'pat', uses: 32, unit: 'tbsp', where: 'counter', kcal: 115 },
  salt: { key: 'salt', name: 'salt', how: 'shake', uses: 400, unit: 'pinch', where: 'counter', kcal: 0 },
  pepper: { key: 'pepper', name: 'pepper', how: 'shake', uses: 300, unit: 'pinch', where: 'counter', kcal: 0 },
};

/** the order the pantry table and the larder set things out in (most useful first) */
export const TABLE_ORDER = ['eggs', 'milk', 'bacon', 'ground_beef', 'sausage', 'venison', 'moose_meat', 'deer_liver', 'onions', 'wild_onion', 'potatoes', 'carrots', 'garlic', 'cheese', 'berries', 'chanterelle'];
export const LARDER_ORDER = ['flour', 'baking_powder', 'sugar', 'oats', 'rice', 'macaroni', 'peas', 'tomatoes', 'beans', 'bouillon', 'syrup', 'coffee', 'tea', 'labrador_tea'];

/** recipe key -> a readable name */
export const KEY_NAME: Record<string, string> = {
  onion: 'onion', potato: 'potato', carrot: 'carrot', garlic: 'garlic', bacon: 'bacon', beef: 'ground beef', sausage: 'sausage',
  venison: 'venison', moose: 'moose', liver: 'liver', meat: 'meat', trout: 'trout', egg: 'egg', chanterelle: 'chanterelles', berries: 'blueberries',
  cheese: 'cheddar', butter: 'butter', lard: 'lard', oil: 'oil', milk: 'milk', water: 'water', flour: 'flour', sugar: 'sugar', salt: 'salt',
  pepper: 'pepper', bp: 'baking powder', oats: 'oats', rice: 'rice', macaroni: 'macaroni', peas: 'split peas', tomatoes: 'tomatoes',
  bouillon: 'bouillon', beans: 'beans', syrup: 'maple syrup', tea: 'tea', coffee: 'coffee', labtea: 'Labrador tea', dough: 'dough',
  batter: 'batter', pastry: 'pastry', dumplings: 'dumplings', fatback: 'bacon fat',
};
