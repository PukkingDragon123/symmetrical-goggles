// Camp recipes: the cards in the recipe box, what each dish needs, the steps on its card (each one checked against
// what you actually did at the stove), how the result is graded, and the buff a good plate gives. A dish is
// whatever is together in one vessel when you serve it: the best recipe whose ingredients are all there, or, if
// none fits, a freestyle dish named after what's in it (anything sensibly combined is still food). Cards unlock
// on the 'recipe' event (the story hands them out) or when you cook one right without the card.
import { addItems, ITEMS, type ItemDef } from '../items';
import { registerGroceries, KEY_NAME } from './ingredients';

const meal = (id: string, name: string, desc: string, kcal: number, warmth: number, extra: Partial<ItemDef> = {}): ItemDef => ({
  id, name, desc, price: 0, mass: 0.5, model: 'gen:enamel_plate', pocket: true, food: { kcal, warmth }, tags: ['meal'], ...extra,
});
const bowlMeal = (id: string, name: string, desc: string, kcal: number, warmth: number): ItemDef => meal(id, name, desc, kcal, warmth, { model: 'gen:enamel_bowl', mass: 0.6 });
const drink = (id: string, name: string, desc: string, kcal: number, warmth: number): ItemDef => meal(id, name, desc, kcal, warmth, { food: { kcal, warmth, drink: true }, mass: 0.35, model: 'gen:enamel_mug' });

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
  meal_stew: bowlMeal('meal_stew', 'Camp stew', 'Meat, mushrooms and whatever else, simmered till it falls apart. Warms you to the boots.', 1350, 0.6),
  meal_maple_beans: bowlMeal('meal_maple_beans', 'Maple beans', 'Baked beans simmered with a glug of dark syrup.', 980, 0.45),
  meal_beans: bowlMeal('meal_beans', 'Hot beans', 'Beans out of the can, heated through.', 480, 0.3),
  meal_meat: meal('meal_meat', 'Seared game meat', 'Dark, rich, a little wild.', 900, 0.35),
  meal_chanterelles: meal('meal_chanterelles', 'Fried chanterelles', 'Golden mushrooms in hot fat. Apricot and pepper.', 160, 0.15),
  cowboy_coffee: drink('cowboy_coffee', 'Cowboy coffee', 'Boiled with the grounds, settled, poured black. Terrible. Perfect.', 10, 0.45),
  cryptid_jerky: {
    id: 'cryptid_jerky', name: 'Smoked jerky', desc: 'Dark, smoky, chewy strips cured over the stove. Things in the woods would trade their mothers for it.',
    price: 0, sell: 9, mass: 0.12, model: 'gen:jerky', pocket: true, food: { kcal: 380, houndTreat: 2 }, tags: ['treat'],
  },
  burnt_food: meal('burnt_food', 'Something burnt', 'Charred. Edible, technically.', 160, 0.05),
  // the recipe cards
  meal_flapjacks: meal('meal_flapjacks', 'Flapjacks with syrup', 'A stack of fluffy flapjacks drowned in maple syrup.', 1100, 0.3),
  meal_venison_stew: bowlMeal('meal_venison_stew', 'Venison stew', 'Venison, onion, carrot and potato, simmered dark with a bouillon cube.', 1500, 0.7),
  meal_moose_chili: bowlMeal('meal_moose_chili', 'Moose chili', 'Moose, beans and tomatoes, thick and dark. Hunting camp food.', 1450, 0.7),
  meal_hash_browns: meal('meal_hash_browns', 'Hash browns', 'Potatoes fried crisp in a hot skillet with onion.', 850, 0.3),
  meal_pea_soup: bowlMeal('meal_pea_soup', 'Pea soup', 'Soupe aux pois: yellow peas, salt pork, a whole afternoon.', 1100, 0.75),
  meal_beans_bacon: bowlMeal('meal_beans_bacon', 'Beans and bacon', 'Beans and back bacon with onion and a glug of syrup.', 1250, 0.5),
  meal_mac_cheese: bowlMeal('meal_mac_cheese', 'Mac and cheese', 'Macaroni in a sharp cheddar sauce. Nobody is too old for it.', 1200, 0.45),
  meal_tourtiere: meal('meal_tourtiere', 'Tourtiere', 'A meat pie, the pastry baked golden under the lid. Christmas in the bush.', 1700, 0.55),
  meal_pouding_chomeur: bowlMeal('meal_pouding_chomeur', 'Pouding chomeur', 'Cake baked on boiling maple syrup: the poor man\'s pudding.', 1150, 0.4),
  meal_blueberry_grunt: bowlMeal('meal_blueberry_grunt', 'Blueberry grunt', 'Dumplings steamed on stewed blueberries. It grunts while it cooks.', 900, 0.4),
  meal_labrador_tea: drink('meal_labrador_tea', 'Labrador tea', 'Steeped muskeg leaves, resinous and calming.', 5, 0.4),
  meal_hunters_breakfast: meal('meal_hunters_breakfast', 'Hunter\'s breakfast', 'Fried potatoes and onion, meat, eggs on top. Enough for a day in the bush.', 1900, 0.45),
  // freestyle
  meal_fry_up: meal('meal_fry_up', 'Skillet fry-up', 'Whatever was on hand, fried together in one pan.', 700, 0.3),
  meal_soup: bowlMeal('meal_soup', 'Pot of soup', 'Hot, wet and better than nothing.', 500, 0.55),
  meal_porridge: bowlMeal('meal_porridge', 'Porridge', 'Oats (or rice) cooked soft. Stick-to-your-ribs.', 600, 0.4),
  meal_tea: drink('meal_tea', 'Black tea', 'Orange pekoe, strong.', 5, 0.35),
};

export function registerCookItems(): void {
  registerGroceries();
  const add: Record<string, ItemDef> = {};
  for (const [k, v] of Object.entries(COOK_ITEMS)) if (!ITEMS[k]) add[k] = v;
  addItems(add);
}

/** item ids that count as game meat (other modules may add hunting) */
export function meatIds(): string[] {
  return Object.values(ITEMS).filter((d) => d.food?.raw && (d.tags?.includes('meat') || /meat|venison|moose|rabbit|hare|grouse|partridge|liver/.test(d.id)) && !['ground_beef', 'sausage'].includes(d.id)).map((d) => d.id);
}
/** the recipe key a meat item counts as */
export function meatKey(id: string): string { return id === 'venison' ? 'venison' : id === 'moose_meat' ? 'moose' : id === 'deer_liver' ? 'liver' : 'meat'; }

export type FoodKind = 'bacon' | 'egg' | 'trout' | 'dough' | 'meat' | 'shroom' | 'sausage' | 'flapjack' | 'dumpling' | 'pastry';

// ---------------------------------------------------------------------------------------------- what was cooked
/** what's in a vessel, summed up for recipes, tasting and grading */
export interface Dish {
  vessel: 'skillet' | 'pot' | 'coffee';
  /** recipe key -> units added (water in litres, salt and pepper in pinches, fats in tbsp) */
  has: Record<string, number>;
  /** key -> mean doneness, least-done side, most-done side */
  cooked: Record<string, number>; least: Record<string, number>; worst: Record<string, number>;
  /** key -> piece size class */
  sizes: Record<string, string>;
  /** keys that went into hot fat (seared) and that browned in fat before any liquid */
  seared: string[]; browned: string[];
  greasy: number;
  water: number;
  simmer: number; boil: number; lidSecs: number; scorch: number;
  tasted: boolean;
  salt: number; pepper: number;
  fat: { total: number; main: string; brown: number; smoked: number; fired: number; maxT: number };
  flips: number; badFlips: number;
  /** mixtures that went in */
  mixes: string[];
  lift: number;
  coffee?: { boil: number; settle: number; leaves: string; steep: number; maxT: number };
  /** melted cheese 0..1 */
  melt: number;
}

export interface CookEvent { k: string; ing?: string; v?: string; s?: string; n?: number; T?: number }
export type Log = CookEvent[];
const ev = (L: Log, k: string, f: (e: CookEvent) => boolean = () => true) => L.some((e) => e.k === k && f(e));
const has = (d: Dish, k: string, n = 0.01) => (d.has[k] ?? 0) >= n;
const anyOf = (d: Dish, ks: string[], n = 0.01) => ks.some((k) => has(d, k, n));
const MEAT = ['venison', 'moose', 'liver', 'meat'];
const golden = (d: Dish, k: string) => (d.least[k] ?? 0) >= 0.66 && (d.worst[k] ?? 0) <= 1.15;

export interface BuffSpec { warm?: number; hearty?: number; alert?: number; sweet?: number; hours: number }

export interface Recipe {
  id: string; name: string; item: string;
  vessel: 'skillet' | 'pot' | 'coffee';
  /** how it cooks: grading for doneness */
  cook: 'fry' | 'simmer' | 'bake' | 'brew';
  from: string;
  /** groups of alternatives, all required */
  need: string[][];
  /** optional groups: each one present makes it better */
  want: string[][];
  ingredients: string[];
  steps: { t: string; ok: (d: Dish, L: Log) => boolean }[];
  /** good salt, total pinches */
  salt: [number, number];
  /** seconds of simmering it wants */
  simmer?: number;
  buff: BuffSpec;
  kcal: number;
  lines: [string, string, string];
  start?: boolean;
  /** extra names the story might use for the card */
  alias?: string[];
}

export const RECIPES: Recipe[] = [
  {
    id: 'bannock', name: 'Bannock', item: 'meal_bannock', vessel: 'skillet', cook: 'fry', from: 'Ray\'s card, in pencil', start: true,
    need: [['dough']], want: [['lard', 'butter', 'oil']],
    ingredients: ['3 cups flour', '1 tbsp baking powder', '1 tsp salt', '2 tbsp lard', 'about 1 cup water', 'lard for the pan'],
    steps: [
      { t: 'Flour, baking powder and salt in the bowl', ok: (_d, L) => ev(L, 'measure', (e) => e.ing === 'flour') && ev(L, 'measure', (e) => e.ing === 'bp') },
      { t: 'Rub in a spoon of lard, add water, stir', ok: (_d, L) => ev(L, 'mix', (e) => e.s === 'dough' || e.s === 'pastry') },
      { t: 'Knead on the board, press it flat', ok: (_d, L) => ev(L, 'knead') },
      { t: 'Grease the skillet and get it hot', ok: (d) => d.fat.total > 0.5 && d.seared.includes('dough') },
      { t: 'Golden on both sides, a flip in between', ok: (d) => golden(d, 'dough') && d.flips > 0 },
    ],
    salt: [0, 99], buff: { hearty: 0.6, hours: 3 }, kcal: 900,
    lines: ['Golden on both sides, fluffy inside. Ray would be proud.', 'Hot bannock. Dense and good.', 'Doughy in the middle.'],
  },
  {
    id: 'flapjacks', name: 'Flapjacks with syrup', item: 'meal_flapjacks', vessel: 'skillet', cook: 'fry', from: 'Odile at the store', alias: ['pancakes', 'flapjack'],
    need: [['batter']], want: [['butter', 'oil', 'lard'], ['syrup'], ['berries']],
    ingredients: ['1 cup flour', '2 tsp baking powder', '1 tbsp sugar', '1 egg', '1 cup milk', 'butter, maple syrup'],
    steps: [
      { t: 'Flour, baking powder, sugar in the bowl', ok: (_d, L) => ev(L, 'measure', (e) => e.ing === 'flour') && ev(L, 'measure', (e) => e.ing === 'bp') },
      { t: 'Crack in an egg, pour in milk, stir smooth', ok: (_d, L) => ev(L, 'crack', (e) => e.v === 'bowl') && ev(L, 'mix', (e) => e.s === 'batter') },
      { t: 'Butter the skillet, medium heat', ok: (d) => d.fat.total > 0.5 },
      { t: 'Pour rounds; flip when the bubbles pop', ok: (d) => d.flips > 0 && golden(d, 'flapjack') },
      { t: 'Drown them in maple syrup', ok: (d) => has(d, 'syrup') },
    ],
    salt: [0, 4], buff: { hearty: 0.8, sweet: 0.5, hours: 3 }, kcal: 1100,
    lines: ['Tall, golden, soaked through with syrup. Saturday morning in a cabin.', 'Flapjacks and syrup. Can\'t go wrong.', 'Flat and a bit raw in the middle. Syrup helps.'],
  },
  {
    id: 'bacon_eggs', name: 'Bacon and eggs', item: 'meal_bacon_eggs', vessel: 'skillet', cook: 'fry', from: 'Ray\'s card, in pencil', start: true, alias: ['bacon_and_eggs'],
    need: [['bacon'], ['egg']], want: [['salt'], ['pepper']],
    ingredients: ['back bacon', '2 eggs', 'salt and pepper'],
    steps: [
      { t: 'Slice the back bacon, not too thick', ok: (_d, L) => ev(L, 'slice', (e) => e.ing === 'bacon') },
      { t: 'Fry it in a hot skillet; flip once', ok: (d) => d.flips > 0 && golden(d, 'bacon') },
      { t: 'Crack the eggs into the bacon fat', ok: (_d, L) => ev(L, 'crack', (e) => e.v === 'skillet') },
      { t: 'Whites set, yolks soft', ok: (d) => (d.least.egg ?? 0) >= 0.6 && (d.worst.egg ?? 0) < 1.15 },
      { t: 'Salt and pepper', ok: (d) => d.salt > 0 && d.pepper > 0 },
    ],
    salt: [1, 6], buff: { hearty: 1, hours: 4 }, kcal: 1550,
    lines: ['Golden bacon, eggs with lace on the edges. The whole cabin smells like a Saturday.', 'Bacon and eggs. Good enough to make you forget the cold.', 'Bacon and eggs, more or less.'],
  },
  {
    id: 'fried_trout', name: 'Pan-fried trout', item: 'meal_trout', vessel: 'skillet', cook: 'fry', from: 'Ray\'s card, in pencil', start: true, alias: ['trout'],
    need: [['trout']], want: [['butter', 'oil', 'lard'], ['salt'], ['pepper']],
    ingredients: ['a lake trout, in steaks', 'butter or oil', 'salt and pepper'],
    steps: [
      { t: 'Cut the trout into steaks', ok: (_d, L) => ev(L, 'slice', (e) => e.ing === 'trout') },
      { t: 'Heat butter or oil till it shimmers', ok: (d) => d.fat.total > 0.5 && d.fat.maxT > 160 },
      { t: 'Lay the steaks in: they should sizzle hard', ok: (d) => d.seared.includes('trout') },
      { t: 'Flip once, golden both sides', ok: (d) => d.flips > 0 && golden(d, 'trout') },
      { t: 'Salt and pepper', ok: (d) => d.salt > 0 && d.pepper > 0 },
    ],
    salt: [1, 6], buff: { hearty: 0.7, hours: 3 }, kcal: 980,
    lines: ['The skin crackles. The flesh falls off the bone.', 'Trout fried in fat. Better than any restaurant.', 'A little dry. Still a lake trout.'],
  },
  {
    id: 'venison_stew', name: 'Venison stew', item: 'meal_venison_stew', vessel: 'pot', cook: 'simmer', from: 'Ray\'s card, gravy on it', start: true, alias: ['stew', 'deer_stew'],
    need: [MEAT, ['water']], want: [['onion'], ['carrot'], ['potato'], ['bouillon'], ['salt'], ['pepper']],
    ingredients: ['a pound of venison (or moose)', '1 onion, diced', '2 carrots, sliced', '2 potatoes, cubed', 'water, a bouillon cube', 'salt and pepper'],
    steps: [
      { t: 'Cut the venison into strips or cubes', ok: (_d, L) => ev(L, 'slice', (e) => MEAT.includes(e.ing ?? '')) || ev(L, 'cut', (e) => MEAT.includes(e.ing ?? '')) },
      { t: 'Brown it in hot fat in the pot', ok: (d) => MEAT.some((k) => d.browned.includes(k) || d.seared.includes(k)) },
      { t: 'Dice an onion, cube potatoes, slice carrots', ok: (d) => has(d, 'onion') && has(d, 'potato') && has(d, 'carrot') },
      { t: 'Water to cover, a bouillon cube', ok: (d) => d.water > 0.4 && has(d, 'bouillon') },
      { t: 'Simmer with the lid on, stir now and then', ok: (d) => d.simmer > 60 && d.lidSecs > 20 && d.scorch < 0.3 },
      { t: 'Taste; salt and pepper', ok: (d) => d.tasted && d.salt > 2 && d.pepper > 0 },
    ],
    salt: [4, 14], simmer: 90, buff: { warm: 1, hearty: 0.5, hours: 5 }, kcal: 1500,
    lines: ['It falls apart on the spoon. That\'ll keep the cold out all night.', 'Thick and hot. Stew.', 'Thin and a bit raw. Hot, at least.'],
  },
  {
    id: 'moose_chili', name: 'Moose chili', item: 'meal_moose_chili', vessel: 'pot', cook: 'simmer', from: 'the hunters at Kenogami camp', alias: ['chili'],
    need: [['moose', 'venison', 'beef', 'meat'], ['tomatoes'], ['beans']], want: [['onion'], ['garlic'], ['salt'], ['pepper']],
    ingredients: ['a pound of moose, cubed or ground', '1 onion, 2 cloves garlic', 'a can of tomatoes', 'a can of beans', 'salt, a lot of pepper'],
    steps: [
      { t: 'Brown the moose in oil in the pot', ok: (d) => ['moose', 'venison', 'beef', 'meat'].some((k) => d.browned.includes(k) || d.seared.includes(k)) },
      { t: 'Onion and minced garlic in till soft', ok: (d) => has(d, 'onion') && has(d, 'garlic') },
      { t: 'The tomatoes and the beans', ok: (d) => has(d, 'tomatoes') && has(d, 'beans') },
      { t: 'Simmer it thick, stirring so it won\'t catch', ok: (d) => d.simmer > 50 && d.scorch < 0.3 },
      { t: 'Taste; salt, plenty of pepper', ok: (d) => d.tasted && d.pepper > 2 },
    ],
    salt: [3, 12], simmer: 70, buff: { warm: 1.2, hours: 5 }, kcal: 1450,
    lines: ['Dark, thick, peppery. The kind of chili that makes a hunting story longer.', 'Chili. Good and hot.', 'Watery chili.'],
  },
  {
    id: 'hash_browns', name: 'Hash browns', item: 'meal_hash_browns', vessel: 'skillet', cook: 'fry', from: 'Ray\'s card, in pencil', start: true, alias: ['hashbrowns'],
    need: [['potato']], want: [['onion'], ['oil', 'butter', 'lard', 'fatback'], ['salt']],
    ingredients: ['2 potatoes, diced small', '1 onion, diced', 'a good slick of oil or lard', 'salt'],
    steps: [
      { t: 'Dice the potatoes small', ok: (d) => ['fine', 'diced', 'minced'].includes(d.sizes.potato ?? '') },
      { t: 'Dice an onion', ok: (_d, L) => ev(L, 'scrape', (e) => e.ing === 'onion' && ['fine', 'diced', 'minced'].includes(e.s ?? '')) },
      { t: 'A good slick of fat, shimmering hot', ok: (d) => d.fat.total > 1 && d.seared.includes('potato') },
      { t: 'Leave them be to crisp, then turn them', ok: (d) => golden(d, 'potato') },
      { t: 'Salt', ok: (d) => d.salt > 0 },
    ],
    salt: [2, 7], buff: { hearty: 0.6, hours: 3 }, kcal: 850,
    lines: ['Crisp and brown outside, soft inside, sweet bits of onion. Diner-good.', 'Hash browns. Crunchy enough.', 'Pale and greasy.'],
  },
  {
    id: 'pea_soup', name: 'Pea soup', item: 'meal_pea_soup', vessel: 'pot', cook: 'simmer', from: 'Madame Lachance', alias: ['soupe_aux_pois', 'pea'],
    need: [['peas'], ['water']], want: [['bacon', 'fatback'], ['onion'], ['carrot'], ['salt']],
    ingredients: ['1 cup yellow split peas', 'lots of water (5 cups)', 'back bacon, diced', '1 onion, 1 carrot', 'salt'],
    steps: [
      { t: 'Peas in the pot with plenty of water', ok: (d) => has(d, 'peas', 0.5) && d.water > 0.8 },
      { t: 'Bacon, a diced onion and a carrot', ok: (d) => has(d, 'bacon') && has(d, 'onion') && has(d, 'carrot') },
      { t: 'Simmer a long time, lid on; stir, it sticks', ok: (d) => d.simmer > 110 && d.lidSecs > 30 && d.scorch < 0.3 },
      { t: 'Taste; salt', ok: (d) => d.tasted && d.salt > 2 },
    ],
    salt: [4, 14], simmer: 140, buff: { warm: 0.9, hearty: 0.4, hours: 6 }, kcal: 1100,
    lines: ['Thick enough to stand a spoon in. Madame Lachance would nod.', 'Yellow pea soup. Warm and filling.', 'Peas still hard.'],
  },
  {
    id: 'beans_bacon', name: 'Beans and bacon', item: 'meal_beans_bacon', vessel: 'pot', cook: 'simmer', from: 'a card tucked in the beans', alias: ['beans_and_bacon', 'pork_and_beans'],
    need: [['beans'], ['bacon']], want: [['onion'], ['syrup']],
    ingredients: ['a can of beans', 'back bacon, sliced', '1 onion, diced', 'a glug of maple syrup'],
    steps: [
      { t: 'Slice the bacon, fry it in the pot', ok: (d) => d.seared.includes('bacon') || d.browned.includes('bacon') },
      { t: 'Onion in with it', ok: (d) => has(d, 'onion') },
      { t: 'The beans and a glug of syrup', ok: (d) => has(d, 'beans') && has(d, 'syrup') },
      { t: 'Bubble it, stirring', ok: (d) => d.simmer > 25 && d.scorch < 0.3 },
    ],
    salt: [0, 6], simmer: 35, buff: { hearty: 0.8, warm: 0.4, hours: 4 }, kcal: 1250,
    lines: ['Smoky, sweet and sticky. Lumberjack candy.', 'Beans and bacon. Honest food.', 'Burnt on the bottom.'],
  },
  {
    id: 'mac_cheese', name: 'Mac and cheese', item: 'meal_mac_cheese', vessel: 'pot', cook: 'simmer', from: 'the kid at the gas pump', alias: ['mac_and_cheese', 'macaroni'],
    need: [['macaroni'], ['cheese']], want: [['milk'], ['butter'], ['salt'], ['pepper']],
    ingredients: ['1 cup macaroni', '1½ cups milk, a little water', 'a brick of cheddar, cubed', 'a pat of butter', 'salt and pepper'],
    steps: [
      { t: 'Macaroni, milk and a splash of water in the pot', ok: (d) => has(d, 'macaroni') && has(d, 'milk') },
      { t: 'Simmer, stirring, till it\'s tender', ok: (d) => d.simmer > 35 && d.scorch < 0.3 },
      { t: 'Cube the cheddar, stir it in till it melts', ok: (d) => has(d, 'cheese') && d.melt > 0.7 },
      { t: 'A pat of butter, salt and pepper', ok: (d) => has(d, 'butter') && d.salt > 0 },
    ],
    salt: [2, 8], simmer: 45, buff: { warm: 0.6, hearty: 0.6, hours: 3 }, kcal: 1200,
    lines: ['Creamy, sharp, stretchy. Nobody is too old for it.', 'Mac and cheese.', 'Lumpy cheese and hard noodles.'],
  },
  {
    id: 'tourtiere', name: 'Tourtiere', item: 'meal_tourtiere', vessel: 'skillet', cook: 'bake', from: 'Odile\'s mother', alias: ['tourtière', 'meat_pie'],
    need: [['beef', 'venison', 'moose', 'meat'], ['pastry']], want: [['onion'], ['potato'], ['garlic'], ['salt'], ['pepper']],
    ingredients: ['pastry: 2 cups flour, 6 tbsp lard, a little water', '1 lb ground beef (or game)', '1 onion, diced fine', '1 potato, diced', 'garlic, salt, pepper'],
    steps: [
      { t: 'Pastry: flour and lots of lard, a little water', ok: (_d, L) => ev(L, 'mix', (e) => e.s === 'pastry') },
      { t: 'Brown the meat with the onion in the skillet', ok: (d) => ['beef', 'venison', 'moose', 'meat'].some((k) => d.browned.includes(k) || d.seared.includes(k)) && has(d, 'onion') },
      { t: 'Press the pastry flat, lay it over the filling', ok: (d) => has(d, 'pastry') },
      { t: 'Lid on, low heat: bake till the crust is golden', ok: (d) => d.lidSecs > 30 && golden(d, 'pastry') },
      { t: 'Season the filling', ok: (d) => d.salt > 0 && d.pepper > 0 },
    ],
    salt: [2, 9], buff: { hearty: 1.1, warm: 0.6, hours: 6 }, kcal: 1700,
    lines: ['Flaky golden crust, spiced meat underneath. Reveillon in a cabin.', 'A good meat pie.', 'Pale crust, wet filling.'],
  },
  {
    id: 'pouding_chomeur', name: 'Pouding chomeur', item: 'meal_pouding_chomeur', vessel: 'pot', cook: 'bake', from: 'Odile at the store', alias: ['pouding', 'chomeur', 'pudding_chomeur', 'pouding_chômeur'],
    need: [['syrup'], ['batter', 'dumpling', 'dough']], want: [['butter'], ['water']],
    ingredients: ['½ cup maple syrup, ½ cup water', 'a pat of butter', 'batter: 1 cup flour, 2 tsp baking powder, ¼ cup sugar, ½ cup milk'],
    steps: [
      { t: 'Syrup, water and butter in the pot, to a boil', ok: (d) => has(d, 'syrup', 3) && d.water > 0.05 },
      { t: 'Batter: flour, baking powder, sugar, milk', ok: (_d, L) => ev(L, 'mix', (e) => e.s === 'batter' || e.s === 'dumpling') },
      { t: 'Spoon the batter onto the bubbling syrup', ok: (_d, L) => ev(L, 'pour', (e) => e.ing === 'batter' && e.v === 'pot') || ev(L, 'pour', (e) => e.ing === 'dumpling' && e.v === 'pot') },
      { t: 'Lid on, gentle heat, till it\'s set', ok: (d) => d.lidSecs > 25 && ((d.least.dumpling ?? 0) > 0.6 || (d.least.flapjack ?? 0) > 0.6) },
    ],
    salt: [0, 3], buff: { sweet: 1, warm: 0.5, hours: 2 }, kcal: 1150,
    lines: ['Cake on top, hot maple sauce underneath. Pure Quebec.', 'Pouding chomeur. Sweet as anything.', 'Gummy, but it\'s maple.'],
  },
  {
    id: 'blueberry_grunt', name: 'Blueberry grunt', item: 'meal_blueberry_grunt', vessel: 'pot', cook: 'bake', from: 'a card from Cape Breton', alias: ['grunt'],
    need: [['berries'], ['dumpling', 'dough', 'batter']], want: [['sugar'], ['water']],
    ingredients: ['3 handfuls of blueberries', '½ cup sugar, a little water', 'dumplings: flour, baking powder, sugar, butter, milk'],
    steps: [
      { t: 'Berries, sugar and a little water in the pot', ok: (d) => has(d, 'berries') && has(d, 'sugar') },
      { t: 'Simmer them to a sauce', ok: (d) => d.simmer > 20 },
      { t: 'Dumpling dough: flour, baking powder, sugar, butter, milk', ok: (_d, L) => ev(L, 'mix', (e) => e.s === 'dumpling') },
      { t: 'Drop spoonfuls on top, lid on: let it grunt', ok: (d) => d.lidSecs > 25 && (d.least.dumpling ?? 0) > 0.6 },
    ],
    salt: [0, 3], buff: { sweet: 1, warm: 0.4, hours: 2 }, kcal: 900,
    lines: ['Purple sauce, fluffy dumplings. It grunted the whole time.', 'Blueberry grunt. Sweet and hot.', 'Doughy dumplings in berry soup.'],
  },
  {
    id: 'camp_coffee', name: 'Camp coffee', item: 'cowboy_coffee', vessel: 'coffee', cook: 'brew', from: 'Ray\'s card, in pencil', start: true, alias: ['coffee', 'cowboy_coffee'],
    need: [['coffee']], want: [],
    ingredients: ['the coffee pot full of water', '2 big spoons of ground coffee per cup'],
    steps: [
      { t: 'Water in the coffee pot', ok: (d) => d.water > 0.2 },
      { t: 'Bring it to a boil, then the grounds in', ok: (d) => (d.coffee?.boil ?? 0) > 0.5 },
      { t: 'Boil a minute, pull it off the heat', ok: (d) => (d.coffee?.boil ?? 0) > 2 && (d.coffee?.settle ?? 0) > 0.5 },
      { t: 'Let the grounds settle, then pour', ok: (d) => (d.coffee?.settle ?? 0) > 3 },
    ],
    salt: [0, 99], buff: { alert: 1, hours: 2 }, kcal: 10,
    lines: ['Black, strong, no grounds in the teeth. Perfect.', 'Black coffee, boiled with the grounds. Terrible. Perfect.', 'Bitter as tar and full of grit.'],
  },
  {
    id: 'labrador_tea', name: 'Labrador tea', item: 'meal_labrador_tea', vessel: 'coffee', cook: 'brew', from: 'a trapper on the Kesagami', alias: ['labtea', 'the_du_labrador'],
    need: [['labtea']], want: [],
    ingredients: ['the coffee pot of water', 'a pinch of Labrador tea leaves'],
    steps: [
      { t: 'Water nearly to the boil', ok: (d) => (d.coffee?.maxT ?? 0) > 85 },
      { t: 'A pinch of leaves in', ok: (d) => has(d, 'labtea') },
      { t: 'Steep it off the boil; never let it roll', ok: (d) => (d.coffee?.steep ?? 0) > 15 && (d.coffee?.boil ?? 0) < 3 },
      { t: 'Pour', ok: () => true },
    ],
    salt: [0, 99], buff: { warm: 0.6, alert: 0.4, hours: 2 }, kcal: 5,
    lines: ['Resinous, a little minty, calm as the muskeg.', 'Labrador tea. Good for what ails you.', 'Boiled bitter.'],
  },
  {
    id: 'hunters_breakfast', name: 'Hunter\'s breakfast', item: 'meal_hunters_breakfast', vessel: 'skillet', cook: 'fry', from: 'the hunters at Kenogami camp', alias: ['hunter_breakfast', 'hunters', 'hunter\'s_breakfast'],
    need: [['venison', 'moose', 'sausage', 'meat', 'liver'], ['potato'], ['egg']], want: [['onion'], ['salt'], ['pepper']],
    ingredients: ['potatoes and an onion, diced', 'sausages, or strips of venison', '2 eggs', 'fat for the pan, salt, pepper'],
    steps: [
      { t: 'Dice potatoes and onion, fry crisp in fat', ok: (d) => has(d, 'potato') && has(d, 'onion') && d.seared.includes('potato') },
      { t: 'Meat in: sausage or venison strips', ok: (d) => anyOf(d, ['venison', 'moose', 'sausage', 'meat', 'liver']) },
      { t: 'Crack the eggs on top', ok: (_d, L) => ev(L, 'crack', (e) => e.v === 'skillet') },
      { t: 'Salt and pepper', ok: (d) => d.salt > 0 && d.pepper > 0 },
    ],
    salt: [2, 8], buff: { hearty: 1.3, hours: 6 }, kcal: 1900,
    lines: ['Crisp potatoes, sausage, runny eggs. Ready for a day in the bush.', 'A proper hunter\'s breakfast.', 'Greasy and a bit raw. You\'ll live.'],
  },
];

export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

/** a story id for a card ('tourtière', 'Pouding Chômeur', 'pancakes') -> recipe id */
export function resolveRecipe(id: string): string | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^recipe[:_-]?/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const n = norm(id);
  for (const r of RECIPES) if (norm(r.id) === n || norm(r.name) === n || (r.alias ?? []).some((a) => norm(a) === n) || norm(r.item) === n) return r.id;
  for (const r of RECIPES) if (n.length > 3 && (norm(r.id).includes(n) || n.includes(norm(r.id)))) return r.id;
  return null;
}

// ---------------------------------------------------------------------------------------------- grading
export type Grade = 'perfect' | 'good' | 'decent' | 'rough';
export const GRADE_NAME: Record<Grade, string> = { perfect: 'Perfect', good: 'Good', decent: 'Decent', rough: 'Rough' };
export const GRADE_STARS: Record<Grade, number> = { perfect: 3, good: 2, decent: 1, rough: 0 };
export const GRADE_MULT: Record<Grade, number> = { perfect: 1.25, good: 1, decent: 0.75, rough: 0.5 };
export function gradeOf(q: number): Grade { return q >= 0.85 ? 'perfect' : q >= 0.64 ? 'good' : q >= 0.4 ? 'decent' : 'rough'; }

const SEASONING = new Set(['salt', 'pepper', 'water', 'oil', 'butter', 'lard', 'fatback', 'bp', 'sugar', 'syrup', 'bouillon']);
const KCAL: Record<string, number> = {
  onion: 45, potato: 160, carrot: 30, garlic: 5, bacon: 900, beef: 550, sausage: 575, venison: 1300, moose: 1300, liver: 900, meat: 900,
  trout: 800, egg: 75, chanterelle: 40, berries: 30, cheese: 1600, butter: 100, lard: 115, oil: 120, milk: 150, flour: 455, sugar: 770,
  oats: 300, rice: 680, macaroni: 400, peas: 680, tomatoes: 90, beans: 420, syrup: 52, dough: 900, batter: 500, pastry: 900, dumpling: 500, flapjack: 120,
};

export interface Verdict {
  recipe: Recipe | null;
  item: string;
  name: string;
  q: number;
  grade: Grade;
  kcal: number;
  warmth: number;
  buff: BuffSpec | null;
  line: string;
  /** steps done / total (cards) */
  steps: boolean[];
  /** why it lost points (for the hud) */
  notes: string[];
  burnt: boolean;
  raw: boolean;
}

/** missing need groups of a recipe for a dish (empty: all there) */
export function missing(r: Recipe, d: Dish): string[][] { return r.need.filter((g) => !anyOf(d, g)); }

/** score the cooking itself (doneness of the solids) */
function cookScore(r: Recipe | null, d: Dish): { q: number; raw: boolean; burnt: boolean } {
  const keys = Object.keys(d.least).filter((k) => !SEASONING.has(k) && (d.has[k] ?? 0) > 0 && k !== 'cheese');
  if (!keys.length) return { q: d.water > 0 ? Math.min(1, d.simmer / 30) : 0.5, raw: false, burnt: false };
  let sum = 0, raw = 0, burnt = 0;
  const cook = r?.cook ?? (d.vessel === 'pot' && d.water > 0.1 ? 'simmer' : 'fry');
  for (const k of keys) {
    const lo = d.least[k], hi = d.worst[k];
    let s: number;
    if (cook === 'simmer' && d.water > 0.1) s = lo < 0.35 ? 0.1 : lo < 0.6 ? 0.55 : hi > 1.4 ? 0.3 : 1;
    else s = hi > 1.36 ? 0 : lo < 0.42 ? 0.05 : lo < 0.66 ? 0.5 : hi > 1.14 ? 0.65 : 1;
    if (hi > 1.36) burnt++;
    if (lo < 0.42) raw++;
    sum += s;
  }
  let q = sum / keys.length;
  if (cook === 'simmer' && r?.simmer) q = q * 0.5 + 0.5 * Math.min(1, d.simmer / r.simmer);
  return { q, raw: raw > keys.length / 2, burnt: burnt > keys.length / 2 };
}

function brewScore(r: Recipe, d: Dish): number {
  const c = d.coffee;
  if (!c) return 0;
  if (r.id === 'camp_coffee') {
    const boilQ = c.boil < 0.5 ? 0.25 : c.boil < 2 ? 0.55 : c.boil < 9 ? 1 : c.boil < 16 ? 0.6 : 0.2;
    const settleQ = c.settle > 3 ? 1 : c.settle > 1 ? 0.6 : 0.3;
    return boilQ * settleQ;
  }
  const steepQ = c.steep < 8 ? 0.4 : c.steep < 15 ? 0.7 : c.steep < 80 ? 1 : 0.7;
  const boilQ = c.boil < 3 ? 1 : c.boil < 10 ? 0.6 : 0.3;
  return steepQ * boilQ;
}

/** the best recipe for a dish (unlocked or not), or null */
export function matchRecipe(d: Dish): Recipe | null {
  let best: Recipe | null = null, bestS = -1;
  for (const r of RECIPES) {
    if (r.vessel !== d.vessel && !(r.vessel === 'coffee' && d.vessel === 'pot' && r.cook === 'brew')) continue;
    if (missing(r, d).length) continue;
    const wants = r.want.filter((g) => anyOf(d, g)).length;
    // more specific recipes (more needs) win; then the ones you have more of the wanted things for
    const s = r.need.length * 3 + wants;
    if (s > bestS) { bestS = s; best = r; }
  }
  return best;
}

/** freestyle: name a dish after what's in it */
export function freestyle(d: Dish): { item: string; name: string } | null {
  const main = Object.entries(d.has).filter(([k, v]) => v > 0 && !SEASONING.has(k)).sort((a, b) => (KCAL[b[0]] ?? 50) * b[1] - (KCAL[a[0]] ?? 50) * a[1]).map(([k]) => k);
  if (!main.length) return null;
  const nm = (k: string) => KEY_NAME[k] ?? k;
  const two = main.length > 1 ? `${nm(main[0])} and ${nm(main[1])}` : nm(main[0]);
  if (d.vessel === 'coffee') {
    if (has(d, 'tea')) return { item: 'meal_tea', name: 'Black tea' };
    return null;
  }
  if (d.vessel === 'pot' && d.water > 0.1) {
    if (anyOf(d, ['oats', 'rice']) && !anyOf(d, ['venison', 'moose', 'beef', 'meat', 'bacon', 'onion'])) return { item: 'meal_porridge', name: has(d, 'oats') ? 'Porridge' : 'Boiled rice' };
    if (has(d, 'beans') && !anyOf(d, ['venison', 'moose', 'beef', 'meat', 'bacon'])) return { item: has(d, 'syrup') ? 'meal_maple_beans' : 'meal_beans', name: has(d, 'syrup') ? 'Maple beans' : 'Hot beans' };
    if (anyOf(d, ['venison', 'moose', 'beef', 'meat', 'sausage', 'liver', 'chanterelle'])) return { item: 'meal_stew', name: `${cap(two)} stew` };
    return { item: 'meal_soup', name: `${cap(two)} soup` };
  }
  if (d.vessel === 'pot' && has(d, 'beans')) return { item: has(d, 'syrup') ? 'meal_maple_beans' : 'meal_beans', name: has(d, 'syrup') ? 'Maple beans' : 'Hot beans' };
  // the skillet (or a dry pot): the old one-ingredient dishes keep their names
  if (main.length === 1) {
    const k = main[0];
    const one: Record<string, [string, string]> = {
      bacon: ['meal_bacon', 'Fried back bacon'], egg: ['meal_eggs', 'Fried eggs'], trout: ['meal_trout', 'Pan-fried trout'],
      venison: ['meal_meat', 'Seared venison'], moose: ['meal_meat', 'Seared moose'], meat: ['meal_meat', 'Seared game meat'], liver: ['meal_meat', 'Fried liver'],
      chanterelle: ['meal_chanterelles', 'Fried chanterelles'], dough: ['meal_bannock', 'Fresh bannock'], flapjack: ['meal_flapjacks', 'Flapjacks'],
    };
    if (one[k]) return { item: one[k][0], name: one[k][1] };
  }
  if (has(d, 'bacon') && has(d, 'egg') && main.length === 2) return { item: 'meal_bacon_eggs', name: 'Bacon & eggs' };
  if (has(d, 'dough') && has(d, 'berries')) return { item: 'meal_berry_bannock', name: 'Blueberry bannock' };
  return { item: 'meal_fry_up', name: `Fried ${two}` };
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** grade a dish: the recipe it matches (or freestyle), quality, energy and the buff */
export function judge(d: Dish, L: Log, unlocked: (id: string) => boolean): Verdict | null {
  const r = matchRecipe(d);
  const notes: string[] = [];
  const kcal0 = Object.entries(d.has).reduce((s, [k, v]) => s + (KCAL[k] ?? 0) * v, 0);
  if (r && (unlocked(r.id) || r.want.every((g) => anyOf(d, g)) || r.want.length === 0)) {
    const steps = r.steps.map((s) => { try { return s.ok(d, L); } catch { return false; } });
    const stepQ = steps.filter(Boolean).length / steps.length;
    const c = r.cook === 'brew' ? { q: brewScore(r, d), raw: false, burnt: false } : cookScore(r, d);
    const sq = d.salt < r.salt[0] ? (r.salt[0] > 0 ? d.salt / r.salt[0] : 1) : d.salt > r.salt[1] ? Math.max(0, 1 - (d.salt - r.salt[1]) / Math.max(2, r.salt[1])) : 1;
    const full = (r.need.length + r.want.filter((g) => anyOf(d, g)).length) / (r.need.length + r.want.length);
    let q = 0.32 * c.q + 0.3 * stepQ + 0.18 * sq + 0.2 * full;
    if (d.greasy > 0.35) { q -= 0.12; notes.push('greasy'); }
    if (d.scorch > 0.3) { q -= 0.25 * Math.min(1, d.scorch); notes.push('scorched'); }
    if (d.fat.fired > 0.5) { q -= 0.2; notes.push('smoky'); } else if (d.fat.smoked > 6) { q -= 0.08; notes.push('smoky'); }
    if (d.fat.brown > 1.3) { q -= 0.1; notes.push('burnt butter'); } else if (d.fat.brown > 0.55 && d.fat.main === 'butter') { q += 0.04; notes.push('nutty'); }
    if (d.salt > r.salt[1]) notes.push('too salty'); else if (d.salt < r.salt[0]) notes.push('bland');
    if (c.raw) notes.push('underdone');
    if (d.mixes.length && d.lift < 0.7 && ['bannock', 'flapjacks', 'pouding_chomeur', 'blueberry_grunt'].includes(r.id)) { q -= 0.1; notes.push('flat'); }
    q = Math.max(0, Math.min(1, q));
    const grade = gradeOf(q);
    const line = r.lines[grade === 'perfect' ? 0 : grade === 'good' || grade === 'decent' ? 1 : 2];
    let item = r.item, name = r.name;
    if (r.id === 'bannock' && has(d, 'berries')) { item = 'meal_berry_bannock'; name = 'Blueberry bannock'; }
    if (c.burnt) return { recipe: r, item: 'burnt_food', name: 'Something burnt', q: 0, grade: 'rough', kcal: 160, warmth: 0.05, buff: null, line: 'Charcoal. Something out there might eat it.', steps, notes: ['burnt'], burnt: true, raw: false };
    const def = ITEMS[item]?.food;
    return { recipe: r, item, name, q, grade, kcal: Math.max(r.kcal * 0.7, Math.min(r.kcal * 1.3, kcal0 || r.kcal)) * (0.8 + q * 0.35), warmth: (def?.warmth ?? 0.3) * (0.7 + q * 0.5), buff: r.buff, line, steps, notes, burnt: false, raw: c.raw };
  }
  const f = freestyle(d);
  if (!f) return null;
  const c = cookScore(null, d);
  let q = 0.25 + 0.5 * c.q;
  if (d.salt > 0) q += 0.1;
  if (d.greasy > 0.35) { q -= 0.1; notes.push('greasy'); }
  if (d.scorch > 0.3) { q -= 0.2; notes.push('scorched'); }
  if (d.fat.fired > 0.5) { q -= 0.15; notes.push('smoky'); }
  q = Math.max(0, Math.min(0.8, q));
  if (c.burnt) return { recipe: null, item: 'burnt_food', name: 'Something burnt', q: 0, grade: 'rough', kcal: 160, warmth: 0.05, buff: null, line: 'Charcoal. Something out there might eat it.', steps: [], notes: ['burnt'], burnt: true, raw: false };
  const grade = gradeOf(q);
  const def = ITEMS[f.item]?.food;
  const lines = DISH_LINES[f.item];
  const line = lines ? lines[grade === 'perfect' ? 0 : grade === 'rough' ? 2 : 1] : grade === 'rough' ? `${f.name}. It's food.` : `${f.name}. Not bad, for making it up.`;
  return { recipe: null, item: f.item, name: f.name, q, grade, kcal: Math.max(150, kcal0 * 1.05), warmth: (def?.warmth ?? 0.3) * (0.7 + q * 0.4), buff: d.vessel === 'pot' && d.water > 0.1 ? { warm: 0.4, hours: 2 } : { hearty: 0.3, hours: 2 }, line, steps: [], notes, burnt: false, raw: c.raw };
}

export const DISH_LINES: Record<string, [string, string, string]> = {
  // [perfect, fine, poor]
  meal_bacon: ['Every round crisp at the edge and pink in the middle. Perfect.', 'Back bacon. Hard to go wrong.', 'Chewy. Still bacon.'],
  meal_eggs: ['Whites set, yolks still runny. Just right.', 'Fried eggs. Simple. Warm.', 'Rubbery, but it\'s food.'],
  meal_berry_bannock: ['The berries burst purple in the crumb. Unbelievable.', 'Blueberry bannock. Sweet and heavy.', 'Purple, gummy, still good.'],
  meal_stew: ['It falls apart on the spoon. That\'ll keep the cold out all night.', 'Thick and hot. Stew.', 'Thin and a bit raw. Hot, at least.'],
  meal_maple_beans: ['Dark, sweet, sticky. The good stuff.', 'Maple beans. Lumberjack candy.', 'Scorched on the bottom.'],
  meal_beans: ['Hot beans, just bubbling.', 'Hot beans out of the can. Lumberjack cuisine.', 'Lukewarm beans.'],
  meal_meat: ['Seared dark outside, rosy inside.', 'Game meat, fried. Rich.', 'Tough as a boot.'],
  meal_chanterelles: ['Golden and peppery.', 'Mushrooms fried in fat.', 'Soggy mushrooms.'],
  meal_fry_up: ['Everything crisp and golden. You should write this one down.', 'A fry-up. It hits the spot.', 'Greasy, a bit raw, filling.'],
  meal_soup: ['Clear, savoury, hot. Soup.', 'Hot soup.', 'Hot water with things in it.'],
  meal_porridge: ['Creamy, soft. Stick-to-your-ribs.', 'Porridge.', 'Gluey.'],
  meal_tea: ['Strong enough to trot a mouse on.', 'A mug of black tea.', 'Stewed.'],
};

/** the old fixed lookups (kept for anything that imported them) */
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
export function potDish(h: { beans: boolean; syrup: boolean; meat: boolean; bacon: boolean; shroom: boolean; water: boolean }): string | null {
  if ((h.meat || h.bacon || h.shroom) && h.water) return 'meal_stew';
  if (h.beans && h.syrup) return 'meal_maple_beans';
  if (h.beans) return 'meal_beans';
  return null;
}
