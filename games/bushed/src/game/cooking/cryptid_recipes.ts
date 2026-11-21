// Five weird camp recipes made for cryptids. Each is a real recipe at the stove (the same checks, grading and buff as
// the others) and each is loved by particular cryptids: held out to one, it counts as a big feed, with a reaction or
// an ability of its own (src/creatures/cryptids/treats.ts and helper.ts `loves`). They all leave you with an
// 'uncanny' calm (buffs.ts): while it lasts, cryptids come round to you faster.
//   Hodag-heart pie          skillet bake   hodag (friends at once), hugag (pushes the big trees)
//   Squonk-tear jelly        pot            squonk (stops crying; a happy tear), wapaloosie
//   Smoked-bark brittle      pot, no water  agropelter (drops fatwood), roperite (hauls every log near)
//   Firefly-glow broth       pot, lid off   wapaloosie (scouts the whole bush), teakettler
//   Bannock of the damned    skillet        hidebehind (takes it from your hand), billdad (fishes double), goofus
// None is in the box at the start: the cards turn up in the world (src/creatures/cryptids/unlocks.ts, caches.ts).
// This file only depends on recipes.ts for types, so recipes.ts can spread these in without an import cycle.
import type { ItemDef } from '../items';
import type { Recipe, Dish, Log, CookEvent } from './recipes';

const ev = (L: Log, k: string, f: (e: CookEvent) => boolean = () => true) => L.some((e) => e.k === k && f(e));
const has = (d: Dish, k: string, n = 0.01) => (d.has[k] ?? 0) >= n;
const anyOf = (d: Dish, ks: string[], n = 0.01) => ks.some((k) => has(d, k, n));
const MEAT = ['liver', 'moose', 'venison', 'beef', 'meat'];
const golden = (d: Dish, k: string) => (d.least[k] ?? 0) >= 0.66 && (d.worst[k] ?? 0) <= 1.15;

const dish = (id: string, name: string, desc: string, kcal: number, warmth: number, model: string, extra: Partial<ItemDef> = {}): ItemDef => ({
  id, name, desc, price: 0, sell: 0, mass: 0.5, model, pocket: true, food: { kcal, warmth }, tags: ['meal', 'cryptid_treat'], ...extra,
});

export const CRYPTID_COOK_ITEMS: Record<string, ItemDef> = {
  meal_hodag_pie: dish('meal_hodag_pie', 'Hodag-heart pie', 'A black-peppered heart pie with a syrup-glazed crust. Smells like a dare. Hodags and hugags lose their minds for it.', 1800, 0.55, 'gen:enamel_plate'),
  meal_squonk_jelly: dish('meal_squonk_jelly', 'Squonk-tear jelly', 'Blueberry jelly with a pinch of salt in it, for the tears. Wobbles sadly. The squonk would stop crying for this.', 700, 0.1, 'gen:enamel_bowl'),
  meal_bark_brittle: dish('meal_bark_brittle', 'Smoked-bark brittle', 'Maple and sugar cooked till it smokes like burning bark, cracked into shards. Agropelters. Roperites. Teeth.', 1100, 0.1, 'gen:enamel_plate'),
  meal_firefly_broth: dish('meal_firefly_broth', 'Firefly-glow broth', 'Chanterelle broth simmered with the lid off. In the dark it seems to glow a little. The wapaloosie sees for miles on it.', 420, 0.6, 'gen:enamel_bowl'),
  meal_bannock_damned: dish('meal_bannock_damned', 'Bannock of the damned', 'Blueberry bannock fried in bacon fat, one side burnt black on purpose and peppered. The thing behind you will take it from your hand.', 1100, 0.3, 'gen:enamel_plate'),
};

export const CRYPTID_RECIPES: Recipe[] = [
  {
    id: 'hodag_pie', name: 'Hodag-heart pie', item: 'meal_hodag_pie', vessel: 'skillet', cook: 'bake', from: 'Ray\'s tin, swamp', alias: ['heart_pie', 'hodag_heart_pie', 'moose_heart_pie'],
    hint: 'Ray hid this one in a tobacco tin by the hodag\'s wallow.', loved: 'hodag, hugag',
    // (the syrup is a need, so a tourtiere stays a tourtiere)
    need: [MEAT, ['pastry'], ['syrup']], want: [['bacon', 'fatback'], ['onion'], ['garlic'], ['pepper']],
    ingredients: ['the heart and liver (or moose), cubed', 'back bacon, diced', '1 onion, 2 cloves garlic', 'a FISTFUL of pepper', 'pastry: flour, lots of lard', 'a glug of syrup'],
    steps: [
      { t: 'Render the bacon in the skillet', ok: (d) => d.seared.includes('bacon') || d.browned.includes('bacon') || has(d, 'fatback') },
      { t: 'Sear the heart dark in the bacon fat', ok: (d) => MEAT.some((k) => d.browned.includes(k) || d.seared.includes(k)) },
      { t: 'Onion, garlic, and a fistful of pepper (a dozen shakes)', ok: (d) => has(d, 'onion') && has(d, 'garlic') && d.pepper >= 10 },
      { t: 'Pastry over, lid on, low and slow till golden', ok: (d) => has(d, 'pastry') && d.lidSecs > 30 && golden(d, 'pastry') },
      { t: 'A glug of syrup over the crust', ok: (d) => has(d, 'syrup') },
    ],
    salt: [2, 9], buff: { hearty: 1.2, warm: 0.6, uncanny: 1, hours: 6 }, kcal: 1800,
    lines: ['Black-peppered, dark, glossy with syrup. Out in the swamp, something just bellowed.', 'Hodag-heart pie. It smells like a dare.', 'Burnt pepper and pale pastry. The hodag might not mind.'],
  },
  {
    id: 'squonk_jelly', name: 'Squonk-tear jelly', item: 'meal_squonk_jelly', vessel: 'pot', cook: 'simmer', from: 'the Book of Cryptids', alias: ['squonk_jelly', 'tear_jelly', 'jelly'],
    hint: 'The Book will write this one in, once you have seen a squonk pull itself back together.', loved: 'squonk, wapaloosie',
    need: [['berries'], ['sugar']], want: [['water'], ['salt']],
    ingredients: ['3 handfuls of blueberries', 'a cup of sugar', 'a splash of water', 'ONE pinch of salt (the tears)'],
    steps: [
      { t: 'Three handfuls of blueberries in the pot', ok: (d) => has(d, 'berries', 2.5) },
      { t: 'Sugar, and a splash of water', ok: (d) => has(d, 'sugar', 0.5) && d.water > 0.04 },
      { t: 'One pinch of salt: the tears. Only one', ok: (d) => d.salt >= 1 && d.salt <= 2 },
      { t: 'Boil it hard, stirring, till it sheets off the spoon', ok: (d) => d.boil > 20 && d.scorch < 0.3 },
      { t: 'Never cover it: it has to cry it out', ok: (d) => d.lidSecs < 3 && d.simmer > 25 },
    ],
    salt: [1, 2], simmer: 35, buff: { sweet: 1.2, uncanny: 1, hours: 3 }, kcal: 700,
    lines: ['Deep purple, set just right, and it wobbles sadly. Somewhere a squonk stops crying.', 'Squonk-tear jelly. Sweet and a little salty.', 'Runny and a bit scorched. Still sad.'],
  },
  {
    id: 'bark_brittle', name: 'Smoked-bark brittle', item: 'meal_bark_brittle', vessel: 'pot', cook: 'fry', from: 'the agropelter', alias: ['brittle', 'bark_brittle', 'smoked_brittle'],
    hint: 'Something up a snag by the hollow path throws more than branches.', loved: 'agropelter, roperite',
    need: [['sugar'], ['syrup']], want: [['butter'], ['salt']],
    ingredients: ['a pat of butter', 'a cup of sugar', 'a good glug of maple syrup', 'NO water', 'a pinch of salt'],
    steps: [
      { t: 'Butter, sugar and a good glug of syrup in the dry pot', ok: (d) => has(d, 'butter') && has(d, 'sugar', 0.5) && has(d, 'syrup', 2) },
      { t: 'No water. Heat it till it smokes like burning bark', ok: (d) => d.water < 0.05 && d.fat.smoked > 2 },
      { t: 'Do not let it catch fire', ok: (d) => d.fat.fired < 0.2 && d.fat.smoked > 0.5 },
      { t: 'Salt over the top; tip it out to crack', ok: (d) => d.salt >= 1 },
    ],
    salt: [1, 4], buff: { sweet: 1, alert: 0.5, uncanny: 1, hours: 3 }, kcal: 1100,
    lines: ['Dark amber shards that taste of a forest fire and maple. It shatters like bark.', 'Smoked-bark brittle. Hard on the teeth.', 'Bitter and sticky. The agropelter will still want it.'],
  },
  {
    id: 'firefly_broth', name: 'Firefly-glow broth', item: 'meal_firefly_broth', vessel: 'pot', cook: 'simmer', from: 'the campfire', alias: ['firefly_broth', 'glow_broth', 'broth'],
    hint: 'Somebody tells this one at the campground fire, after dark.', loved: 'wapaloosie, teakettler',
    need: [['chanterelle'], ['bouillon'], ['water']], want: [['onion'], ['garlic'], ['butter'], ['salt']],
    ingredients: ['a cluster of chanterelles', 'a pat of butter', 'wild onion, a clove of garlic', 'water and a bouillon cube', 'salt'],
    steps: [
      { t: 'Fry the chanterelles golden in butter in the pot', ok: (d) => d.seared.includes('chanterelle') || d.browned.includes('chanterelle') },
      { t: 'Wild onion and a clove of garlic', ok: (d) => has(d, 'onion') && has(d, 'garlic') },
      { t: 'Water to cover and a bouillon cube', ok: (d) => d.water > 0.4 && has(d, 'bouillon') },
      { t: 'Simmer with the lid OFF, so the glow gets out', ok: (d) => d.simmer > 45 && d.lidSecs < 4 },
      { t: 'Taste; salt', ok: (d) => d.tasted && d.salt > 1 },
    ],
    salt: [3, 10], simmer: 55, buff: { warm: 1, alert: 0.4, uncanny: 1, hours: 5 }, kcal: 420,
    lines: ['Golden, clear, and in the dark corner of the cabin it seems to glow. Just a little.', 'Firefly-glow broth. Warm and earthy.', 'Cloudy and thin. No glow to speak of.'],
  },
  {
    id: 'bannock_damned', name: 'Bannock of the damned', item: 'meal_bannock_damned', vessel: 'skillet', cook: 'fry', from: 'Ray\'s tin, deep woods', alias: ['damned_bannock', 'bannock_of_the_damned', 'black_bannock'],
    hint: 'Ray left this one in a tin out in the deep woods, past the hollow.', loved: 'hidebehind, billdad, goofus bird',
    // (the pepper is a need, so plain blueberry bannock stays blueberry bannock)
    need: [['dough'], ['berries'], ['pepper']], want: [['fatback', 'bacon']],
    ingredients: ['bannock dough (flour, baking powder, salt, lard, water)', 'a handful of blueberries', 'bacon fat for the pan', 'pepper'],
    steps: [
      { t: 'Knead a handful of blueberries into the dough', ok: (d, L) => ev(L, 'knead') && has(d, 'berries') },
      { t: 'Fry it in bacon fat', ok: (d) => anyOf(d, ['fatback', 'bacon']) && d.fat.total > 0.3 },
      { t: 'Burn one side black. ON PURPOSE', ok: (d) => (d.worst.dough ?? 0) > 1.15 },
      { t: 'Flip: the other side golden', ok: (d) => d.flips > 0 && (d.least.dough ?? 0) > 0.62 },
      { t: 'Pepper the black side', ok: (d) => d.pepper >= 3 },
    ],
    salt: [0, 6], buff: { hearty: 0.8, uncanny: 1, hours: 4 }, kcal: 1100,
    lines: ['One side charcoal, one side gold, purple berries bleeding through. Perfectly damned.', 'Bannock of the damned. Crunchy.', 'Just burnt bannock, really. It might still work.'],
  },
];

/** the cards, in the order the box shows them after the camp ones */
export const CRYPTID_CARD_IDS = CRYPTID_RECIPES.map((r) => r.id);
