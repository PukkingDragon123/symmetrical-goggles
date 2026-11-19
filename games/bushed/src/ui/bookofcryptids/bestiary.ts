// The Book of Cryptids' field-guide data. story.ts CRITTERS stays the source of truth for names, Ray's notes and
// the rules the game teaches (learn(critter, rule)); this file adds what a field guide needs on top (habitat, the
// favourite food and its icon, how dangerous, the Book's own remark when it tastes one) and carries complete
// fallback entries for cryptids that are not in story.ts yet. To add a cryptid, either:
//   - add it to story.ts CRITTERS (it gets a page straight away, with defaults below), and/or
//   - add a FieldEntry here (habitat, food, taste line, portrait). Entries merge by id (or alias).
// Optional fields on a story.ts Critter are honoured too: habitat, food (an item id like 'bacon' or { name, icon }),
// taste, danger, active.
import { CRITTERS, type Critter, type CritterRule } from '../../game/story';
import { ITEMS } from '../../game/items';

export interface Food { icon: string; name: string; note?: string }

export interface FieldEntry {
  id: string;
  /** other ids the game might use for the same critter (observe('snow_wasset') finds 'wasset') */
  alias?: string[];
  name?: string;
  latin?: string;
  ray?: string[];
  rules?: CritterRule[];
  habitat: string;
  /** when it is about */
  active: string;
  /** a size comparison */
  size: string;
  food: Food;
  /** what the Book says when it tastes one */
  taste: string;
  /** 0 harmless .. 5 deadly (teeth on the plate) */
  danger: number;
  /** plate background: 'dusk' | 'night' | 'fog' | 'day' | 'burn' | 'snow' | 'swamp' | 'eave' */
  scene: string;
}

export interface Entry extends FieldEntry {
  name: string;
  latin: string;
  ray: string[];
  rules: CritterRule[];
  /** plate number (1-based, in book order) */
  plate: number;
}

const ICON_OF_ITEM: Record<string, string> = {
  jerky: 'jerky', beer: 'beer', coffee: 'coffee', beans: 'beans', bread: 'bread', eggs: 'eggs', bacon: 'bacon', syrup: 'syrup',
  cookies: 'cookies', berries: 'berries', chanterelle: 'mushroom', fish: 'fish',
};

export const FIELD: FieldEntry[] = [
  {
    id: 'hound', habitat: 'Woodpiles and wood yards. Anywhere an axe is left standing in the block overnight.',
    active: 'After sundown', size: 'A dachshund, if a dachshund were an axe.',
    food: { icon: 'handle', name: 'Axe handles', note: 'hickory. Jerky will do.' },
    taste: 'Hickory and wet dog. Splinters in its gums. It wants your handle, not your hand.', danger: 2, scene: 'night',
  },
  {
    id: 'bigfoot', alias: ['sasquatch'], habitat: 'The cedar hollow and the creek bottoms. Old growth, deep moss.',
    active: 'Dusk', size: 'Two of you, stacked.',
    food: { icon: 'berries', name: 'Wild blueberries', note: 'and whatever you leave on the stump' },
    taste: 'Wet cedar and old pennies. Very, very large. Very shy. Keep the light off it.', danger: 3, scene: 'dusk',
  },
  {
    id: 'gumberoo', habitat: 'The old burn. Charred stumps and hollow logs.',
    active: 'Afternoons, sleeping it off', size: 'A woodstove that walks.',
    food: { icon: 'beans', name: 'Anything at all', note: 'tin included' },
    taste: 'Rubbery. Smells of burnt tires. Hates fire.', danger: 2, scene: 'burn',
    rules: [
      { id: 'bounce', text: 'Run at it and it bounces you clear off your feet.' },
      { id: 'axe', text: 'Axes bounce off it like it is a tractor tire.' },
      { id: 'fire', text: 'Afraid of fire. A lit torch and it rolls off sulking.' },
    ],
  },
  {
    id: 'dingbat', alias: ['dingbats'], habitat: 'Eaves, attics and old barns. Roosts by the dozen.',
    active: 'Nights, and whenever disturbed', size: 'A barn owl with antlers.',
    food: { icon: 'moth', name: 'Moths', note: 'the big furry ones' },
    taste: 'Dust, antler velvet and mouse. Loud. So loud.', danger: 1, scene: 'eave',
    rules: [
      { id: 'light', text: 'Shine a light at the roost and the whole lot comes screeching round your head.' },
      { id: 'dark', text: 'Douse the light and stand still. They settle in a minute.' },
      { id: 'noise', text: 'Loud work under the eave wakes them up.' },
    ],
  },
  {
    id: 'granny', alias: ['granny_tamarack', 'tamarack'], habitat: 'The fog by the hollow. Tamarack swamps in the fall.',
    active: 'Foggy nights', size: 'Taller than the door. Mostly antler.',
    food: { icon: 'cookies', name: 'Oatmeal cookies', note: 'she washes the tin' },
    taste: 'Rain on cedar and warm oatmeal. Very old. Kind, I think. Mind your manners.', danger: 0, scene: 'fog',
    rules: [
      { id: 'cookies', text: 'Leave her oatmeal cookies. The tin comes back washed.' },
      { id: 'lost', text: 'Comes to the lost in thick fog and walks them home.' },
      { id: 'secret', text: 'Fed and thanked, she points out things worth finding.' },
    ],
  },
  {
    id: 'hidebehind', habitat: 'Always behind the tree you are not looking at.',
    active: 'Whenever you turn round', size: 'Unknown. Thin enough to hide behind a birch.',
    food: { icon: 'plaid', name: 'Lumberjacks', note: 'the soft middle bits' },
    taste: 'Nothing. I tasted NOTHING. It is right behind you.', danger: 5, scene: 'night',
    rules: [
      { id: 'unseen', text: 'Cannot be looked at. Turn round and it is already behind something else.' },
      { id: 'drink', text: 'Hates the smell of drink. A splash of beer and it keeps off.' },
      { id: 'tracks', text: 'Its tracks always end at a tree trunk.' },
    ],
  },
  {
    id: 'hodag', name: 'Hodag', latin: 'Bufocornus horribilis',
    ray: ['Big as an ox. Frog face, a grin full of tusks, horns, spikes all down the back.', 'Smells like a skunk that died in a dead skunk.', 'Marcel says it only eats white bulldogs, and only on Sundays. Marcel says a lot.'],
    rules: [
      { id: 'smell', text: 'You smell it a long way before you see it.' },
      { id: 'sunday', text: 'Eats on Sundays. The rest of the week it just sits and grins.' },
      { id: 'horns', text: 'Can not turn its head past its horns. Get round behind it.' },
    ],
    habitat: 'Tamarack swamps and deep windfalls. Dens under the roots.', active: 'Sundays', size: 'An ox. A grinning ox.',
    food: { icon: 'bacon', name: 'White bulldogs', note: 'Sundays only. Bacon will do.' },
    taste: 'Swamp, skunk and smoke. It grinned at me. I did not care for the grin.', danger: 4, scene: 'swamp',
  },
  {
    id: 'squonk', name: 'Squonk', latin: 'Lacrimacorpus dissolvens',
    ray: ['Weeps. All the time. Skin two sizes too big, all warts and moles.', 'Hides in the hemlocks at dusk. Ashamed of how it looks, poor thing.', 'J.P. Wentling bagged one once. When he got home the sack was just tears and bubbles.'],
    rules: [
      { id: 'tears', text: 'Follow the sobbing on a cold night and you will find it.' },
      { id: 'dissolve', text: 'Corner it and it melts away into a puddle of tears.' },
      { id: 'look', text: 'Hates being looked at. Look away and it calms down.' },
    ],
    habitat: 'Hemlock stands, at twilight. Follow the crying.', active: 'Twilight', size: 'A sad pig.',
    food: { icon: 'syrup', name: 'Maple syrup', note: 'cheers it up a little' },
    taste: 'Salt. Pure salt. Tears, I think. Do not let it see you looking.', danger: 0, scene: 'dusk',
  },
  {
    id: 'agropelter', name: 'Agropelter', latin: 'Anthropohurlus zobius',
    ray: ['Something up in the dead snags throws branches. Big ones.', 'Thin as a rake, arms like buggy whips, face like a jailbird.', 'Lives in hollow trees. Eats owls and woodpeckers, they say.'],
    rules: [
      { id: 'throws', text: 'Throws limbs from the top of a hollow snag. Listen for the crack.' },
      { id: 'sun', text: 'Can not aim into the sun. Come at it from the east in the morning.' },
      { id: 'fell', text: 'Drop its snag and it has nowhere to throw from.' },
    ],
    habitat: 'Hollow snags and lightning-struck trees.', active: 'Whenever you walk under it', size: 'A broom with a grudge.',
    food: { icon: 'feather', name: 'Owls and woodpeckers' },
    taste: 'Rotten wood and owl feathers. Mean as a wet cat. Watch the treetops.', danger: 3, scene: 'dusk',
  },
  {
    id: 'teakettler', name: 'Teakettler', latin: 'Ollacalida retrogradiens',
    ray: ['Little thing about the size of a cat. Walks backwards.', 'Whistles steam out of its nose like a kettle on the boil. You hear it before you see it.', 'Never seen one from the front.'],
    rules: [
      { id: 'steam', text: 'Follow the whistling. The steam hangs where it has been.' },
      { id: 'backwards', text: 'Walks backwards. Come up on it from the front.' },
      { id: 'frost', text: 'Only out on frosty mornings.' },
    ],
    habitat: 'Clearings and creek sides on frosty mornings.', active: 'Frosty mornings', size: 'A cat. A steaming cat.',
    food: { icon: 'coffee', name: 'Coffee', note: 'boiled, black, too hot' },
    taste: 'Hot copper and stewed tea. It walked backwards out of my mouth.', danger: 0, scene: 'day',
  },
  {
    id: 'wasset', alias: ['snow_wasset', 'snowwasset', 'snow-wasset', 'snowWasset'], name: 'Snow Wasset', latin: 'Mustela hiemalis',
    ray: ['Long and white, like a weasel the length of a canoe.', 'Swims under the snow like an otter in water and comes up under you.', 'Goes brown and heads north in summer. Back with the first snow.'],
    rules: [
      { id: 'under', text: 'Travels under the snow. Watch for the crust heaving.' },
      { id: 'ice', text: 'Stand on bare ice. It can not come up through ice.' },
      { id: 'summer', text: 'Gone north all summer. Comes back with the snow.' },
    ],
    habitat: 'Under the snow. Open meadows and frozen bogs.', active: 'Winter', size: 'A canoe, with teeth.',
    food: { icon: 'hare', name: 'Snowshoe hares' },
    taste: 'Cold. Musk and frozen hare. Its legs drop off in winter. It does not need them.', danger: 3, scene: 'snow',
  },
];

/** default field data for a story.ts critter with no FieldEntry */
function defaults(c: Critter): FieldEntry {
  return {
    id: c.id, habitat: 'Unknown. Somewhere out there.', active: 'Unknown', size: 'Unknown',
    food: { icon: 'unknown', name: 'Unknown' }, taste: 'New. I will need another bite.', danger: 2, scene: 'dusk',
  };
}

function foodOf(f: unknown, fallback: Food): Food {
  if (!f) return fallback;
  if (typeof f === 'string') {
    const it = ITEMS[f];
    return { icon: ICON_OF_ITEM[f] ?? f, name: it?.name ?? f };
  }
  const o = f as Partial<Food> & { id?: string; item?: string };
  const id = o.icon ?? o.item ?? o.id ?? fallback.icon;
  return { icon: ICON_OF_ITEM[id] ?? id, name: o.name ?? ITEMS[id]?.name ?? fallback.name, note: o.note ?? fallback.note };
}

/** every cryptid the book knows about, in book order: story.ts CRITTERS first (its order), then extra entries */
export function entries(): Entry[] {
  const out: Entry[] = [];
  const used = new Set<FieldEntry>();
  const find = (id: string) => FIELD.find((f) => f.id === id || f.alias?.includes(id));
  for (const c of CRITTERS) {
    const f = find(c.id);
    if (f) used.add(f);
    const base = f ?? defaults(c);
    const x = c as Critter & Partial<{ habitat: string; food: unknown; taste: string; danger: number; active: string; size: string }>;
    out.push({
      ...base,
      id: c.id,
      alias: [...(base.alias ?? []), ...(f && f.id !== c.id ? [f.id] : [])],
      name: c.name || base.name || c.id,
      latin: c.latin && c.latin !== '—' && c.latin !== '???' ? c.latin : base.latin ?? c.latin ?? '',
      ray: c.ray?.length ? c.ray : base.ray ?? [],
      rules: c.rules?.length ? c.rules : base.rules ?? [],
      habitat: x.habitat ?? base.habitat, taste: x.taste ?? base.taste, danger: x.danger ?? base.danger,
      active: x.active ?? base.active, size: x.size ?? base.size,
      food: foodOf(x.food, base.food),
      plate: 0,
    });
  }
  for (const f of FIELD) if (!used.has(f) && !out.some((e) => e.id === f.id || e.alias?.includes(f.id))) {
    out.push({ ...f, name: f.name ?? f.id, latin: f.latin ?? '', ray: f.ray ?? [], rules: f.rules ?? [], plate: 0 });
  }
  out.forEach((e, i) => { e.plate = i + 1; });
  return out;
}

/** resolve an id or alias to the canonical entry id */
export function canonical(list: Entry[], id: string): string | null {
  const e = list.find((x) => x.id === id) ?? list.find((x) => x.alias?.includes(id));
  return e ? e.id : null;
}

export const ROMAN = (n: number): string => {
  const t: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
};
