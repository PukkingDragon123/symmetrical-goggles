// The Book of Cryptids' field-guide data. story.ts CRITTERS stays the source of truth for names, Ray's notes and
// the rules the game teaches (learn(critter, rule)); this file adds what a field guide needs on top (habitat, the
// favourite food and its icon, how dangerous, the Book's own remark when it tastes one) and carries complete
// fallback entries for cryptids that are not in story.ts yet. To add a cryptid, either:
//   - add it to story.ts CRITTERS (it gets a page straight away, with defaults below), and/or
//   - add a FieldEntry here (habitat, food, taste line, portrait). Entries merge by id (or alias).
// Optional fields on a story.ts Critter are honoured too: habitat, food (an item id like 'bacon' or { name, icon }),
// taste, danger, active.
import * as THREE from 'three';
import { CRITTERS, type Critter, type CritterRule } from '../../game/story';
import { ITEMS } from '../../game/items';
import { registerPortraitModel } from './portrait';

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
    id: 'hidebehind', habitat: 'The deep woods past the hollow. Always behind the tree you are not looking at.',
    active: 'Nights, whenever you turn round', size: 'Unknown. Thin enough to hide behind a birch.',
    food: { icon: 'jerky', name: 'Stolen jerky', note: 'never from your hand' },
    taste: 'Nothing. I tasted NOTHING. It is right behind you.', danger: 5, scene: 'night',
    rules: [
      { id: 'r0', text: 'It only hunts at night, in the deep woods: old timber, far from the roads and the cabin. By day it is nowhere.' },
      { id: 'r1', text: 'It never moves while you are looking at it. Look straight at it and it stops dead, behind whatever is nearest.' },
      { id: 'r2', text: 'Turn your back and it comes closer, tree by tree. A snapped twig behind you means turn around now.' },
      { id: 'r3', text: 'Firelight keeps it off: carry a lit lantern or stay by a fire. It cannot abide the smell of liquor either.' },
      { id: 'r4', text: 'It is no friend and takes nothing from your hand. Set jerky down and walk away: it steals it and leaves you be for the night.' },
    ],
  },
  {
    id: 'hodag', name: 'Hodag', latin: 'Bufocornus horribilis',
    ray: ['Big as an ox. Frog face, a grin full of tusks, horns, spikes all down the back.', 'Smells like a skunk that died in a dead skunk.', 'Marcel says it only eats white bulldogs, and only on Sundays. Marcel says a lot.'],
    rules: [
      { id: 'r0', text: 'Its den is a muddy wallow in the alder swamp. About twenty-five paces round it is its yard, and it guards every inch.' },
      { id: 'r1', text: 'It warns before it fights: the yellow throat swells, it bellows, the spines go up. Back away and it lets you go.' },
      { id: 'r2', text: 'Its first two charges stop short with a snap. Swing an axe at it, or crowd it a third time, and the horns are real.' },
      { id: 'r3', text: 'It cannot think about anything else when it smells bacon. Feed it and it is calm for the day.' },
      { id: 'r4', text: 'Feed it twice and it rolls over for a belly scratch, and follows you about its swamp like a big ugly dog.' },
      { id: 'r5', text: 'It sleeps in the den from midnight to dawn. You will smell it long before you see it.' },
    ],
    habitat: 'The alder swamp south-east of the cabin: a muddy wallow and a big yard round it.', active: 'All day. Sleeps midnight to dawn', size: 'An ox. A grinning ox.',
    food: { icon: 'bacon', name: 'Back bacon', note: 'white bulldogs, Marcel says' },
    taste: 'Swamp, skunk and smoke. It grinned at me. I did not care for the grin.', danger: 4, scene: 'swamp',
  },
  {
    id: 'squonk', name: 'Squonk', latin: 'Lacrimacorpus dissolvens',
    ray: ['Weeps. All the time. Skin two sizes too big, all warts and moles.', 'Hides in the hemlocks at dusk. Ashamed of how it looks, poor thing.', 'J.P. Wentling bagged one once. When he got home the sack was just tears and bubbles.'],
    rules: [
      { id: 'r0', text: 'It weeps all the time. Listen for the sobbing in the wet fir woods at dusk, and follow the trail of tear spots.' },
      { id: 'r1', text: 'By day it hides curled up under the ferns. It wanders from dusk through the night.' },
      { id: 'r2', text: 'It runs from anyone who comes close standing up. Crouch, go slowly, and it only watches you from behind a tree.' },
      { id: 'r3', text: 'Corner it, chase it, grab at it or shine a light in its face and it dissolves into a puddle of tears.' },
      { id: 'r4', text: 'Leave the puddle alone. When nobody is near, it pulls itself back together.' },
      { id: 'r5', text: 'Wild blueberries stop the crying. Crouch and hold some out; feed it three times and it follows you at dusk.' },
    ],
    habitat: 'The dark wet fir woods north of the hollow. Follow the crying.', active: 'Dusk through the night', size: 'A sad pig.',
    food: { icon: 'berries', name: 'Wild blueberries', note: 'stops the crying' },
    taste: 'Salt. Pure salt. Tears, I think. Do not let it see you looking.', danger: 0, scene: 'dusk',
  },
  {
    id: 'agropelter', name: 'Agropelter', latin: 'Anthropohurlus zobius',
    ray: ['Something up in the dead snags throws branches. Big ones.', 'Thin as a rake, arms like buggy whips, face like a jailbird.', 'Lives in hollow trees. Eats owls and woodpeckers, they say.'],
    rules: [
      { id: 'r0', text: 'It lives in the knot-hole of a dead, broken-topped snag. A heap of broken branches round the foot of a tree means one lives there.' },
      { id: 'r1', text: 'Walk under its tree and it leans out and pelts you with dead branches. It throws where you are, not where you are going: keep moving.' },
      { id: 'r2', text: 'Keep walking: once you are past, it ducks back into its hole, jeering.' },
      { id: 'r3', text: 'Leave maple syrup at the foot of its tree and walk away: it climbs down for it and leaves you alone for the day.' },
      { id: 'r4', text: 'Feed it twice and it is your friend: it drops dry kindling for you instead of throwing branches.' },
      { id: 'r5', text: 'It sleeps in its hole from one in the morning until dawn.' },
    ],
    habitat: 'A broken-topped snag by the hollow path. Look for the heap of branches.', active: 'Days. Sleeps from one till dawn', size: 'A broom with a grudge.',
    food: { icon: 'syrup', name: 'Maple syrup', note: 'left at its tree' },
    taste: 'Rotten wood and owl feathers. Mean as a wet cat. Watch the treetops.', danger: 3, scene: 'dusk',
  },
  {
    id: 'teakettler', name: 'Teakettler', latin: 'Ollacalida retrogradiens',
    ray: ['Little thing about the size of a cat. Walks backwards.', 'Whistles steam out of its nose like a kettle on the boil. You hear it before you see it.', 'Never seen one from the front.'],
    rules: [
      { id: 'r0', text: 'You hear it first: a kettle coming to the boil somewhere in the brush, and little puffs of steam.' },
      { id: 'r1', text: 'It walks backwards, so it is always looking at whatever it is walking away from. It never turns its back on you.' },
      { id: 'r2', text: 'It is shy: come within seven paces standing up (three crouching) and it whistles in alarm and backs off.' },
      { id: 'r3', text: 'It is mad for coffee. Hold some out and it backs right up to you, bum first, looking over its shoulder.' },
      { id: 'r4', text: 'Give it coffee twice and it follows you, and whistles like a kettle when something dangerous is near.' },
      { id: 'r5', text: 'At night it sleeps curled up by the campsite, steaming gently like a pot left to cool.' },
    ],
    habitat: 'The woods behind the lake campsite.', active: 'Days. Sleeps by the campsite', size: 'A cat. A steaming cat.',
    food: { icon: 'coffee', name: 'Coffee', note: 'boiled, black, too hot' },
    taste: 'Hot copper and stewed tea. It walked backwards out of my mouth.', danger: 0, scene: 'day',
  },
  {
    id: 'wasset', alias: ['snow_wasset', 'snowwasset', 'snow-wasset', 'snowWasset'], name: 'Snow Wasset', latin: 'Mustela hiemalis',
    ray: ['Long and white, like a weasel the length of a canoe.', 'Swims under the snow like an otter in water and comes up under you.', 'Goes brown and heads north in summer. Back with the first snow.'],
    rules: [
      { id: 'r0', text: 'It lives under the ground and the snow on the north shore of the lake. Watch for a line of heaving snow or earth.' },
      { id: 'r1', text: 'It is curious: it tunnels toward you, pops up a few paces away and stands up tall to stare.' },
      { id: 'r2', text: 'Stand still and it darts in to nip at your bootlaces. Harmless, but it unties them.' },
      { id: 'r3', text: 'Swing at it or rush it and it dives under. It comes up again somewhere else a while later.' },
      { id: 'r4', text: 'It loves lake trout. Hold one out and it sits up and begs; feed it twice and it follows you, popping up wherever you stop.' },
      { id: 'r5', text: 'At night it sleeps under the snow.' },
    ],
    habitat: 'Under the snow and the ground on the north shore of the lake.', active: 'Days. Sleeps under the snow', size: 'A canoe, with teeth.',
    food: { icon: 'fish', name: 'Lake trout' },
    taste: 'Cold. Musk and frozen hare. Its legs drop off in winter. It does not need them.', danger: 3, scene: 'snow',
  },
  // ---- four more on real models (src/creatures/cryptids: gouger, hoopsnake, splintercat, goofus). Rule texts match the
  // creatures' own `rules` (the Book adopts them live), ids r0.. by position, as critters.ts CRYPTID_RULES teaches them.
  {
    id: 'gouger', alias: ['sidehill_gouger', 'sidehill', 'gowger', 'sidehill_dodger'], name: 'Sidehill Gouger', latin: 'Declivicola inaequipes',
    ray: ['Goat-ish. Grazes round and round the steep knoll by the lake, leaning into the hill like a drunk on a stair.', 'Legs shorter on one side, the old-timers say, so it can only go round one way. If it ever gets onto flat ground it falls over.', 'Don\'t stand in its path. It cannot stop and it cannot turn.'],
    rules: [
      { id: 'r0', text: 'Its right legs are shorter than its left. It can only stand on a hillside with the uphill on its right, so it only ever walks round its hill one way.' },
      { id: 'r1', text: 'Stand on its path ahead of it and it snorts, then charges along the hillside to butt you. Step up or down off its path: it cannot turn to follow.' },
      { id: 'r2', text: 'Lure it onto flat ground (it follows chanterelles) and it falls over and cannot get up again.' },
      { id: 'r3', text: 'Tip a fallen gouger back onto its feet and it gouges fatwood out of the old pine roots for you.' },
      { id: 'r4', text: 'Feed it chanterelles twice from your hand and it stops butting you.' },
      { id: 'r5', text: 'At night it lies down on its hillside and sleeps.' },
    ],
    habitat: 'Round and round the steep knoll on the west shore of the lake. Look for the groove its feet have worn.', active: 'Days. Sleeps on its hill', size: 'A goat that leans.',
    food: { icon: 'mushroom', name: 'Chanterelles', note: 'it follows them anywhere, even off its hill' },
    taste: 'Goat, wet moss and pine pitch. One side of it tastes taller than the other.', danger: 2, scene: 'day',
  },
  {
    id: 'hoopsnake', alias: ['hoop_snake', 'hoop', 'snake'], name: 'Hoop Snake', latin: 'Rotaserpens caudistimulus',
    ray: ['Lies coiled on the bank above the lake. Bites its own tail and comes ROLLING down at you like a wagon wheel.', 'Stinger in the tail. Marcel swears it stung a hoe handle once and the handle swelled up and split.', 'Get out of the way sideways. Or jump. Jumping works, Marcel says.'],
    rules: [
      { id: 'r0', text: 'It lies coiled at the top of a steep bank, and comes for whatever walks below it.' },
      { id: 'r1', text: 'It bites its own tail and rolls downhill after you like a wheel. It can hardly steer: step aside at the last moment and it rolls right past.' },
      { id: 'r2', text: 'Jump as it reaches you and you go clean through the hoop.' },
      { id: 'r3', text: 'Its tail is a stinger. Whatever it stings withers and dies, trees included: dodge it in front of a tree and the tree falls. Mind which way.' },
      { id: 'r4', text: 'On flat ground it wobbles, falls over and slithers back up its hill.' },
      { id: 'r5', text: 'Eggs, held out or left by its coil, stop it rolling at you. Twice, and it stings the tree you are chopping for you.' },
    ],
    habitat: 'The top of the steep bank on the south side of the lake. A long run down below it.', active: 'Days. Sleeps coiled', size: 'A wagon wheel. A biting one.',
    food: { icon: 'eggs', name: 'Eggs', note: 'swallowed whole, shell and all' },
    taste: 'Dry scales and bad intentions. The tail end tastes of nettles. Do not let it near the axe handle.', danger: 3, scene: 'day',
  },
  {
    id: 'splintercat', alias: ['splinter_cat', 'splinter'], name: 'Splinter Cat', latin: 'Felis ligniclastes',
    ray: ['Whole stands of timber west of the hollow smashed to matchwood, stumps split from the top down. Not lightning.', 'A big lynx that climbs and comes down head first through the trees, Ray says, hunting honey. Then it sits there stunned.', 'Leave a jug of syrup by a log and it\'ll buck it for you. Don\'t stand in between.'],
    rules: [
      { id: 'r0', text: 'Where the trunks are smashed to matchwood and the stumps splintered from the top down, a splinter cat lives.' },
      { id: 'r1', text: 'At night it picks a tree, crouches and rockets head first straight through it, looking for honey. Then it sits there seeing stars.' },
      { id: 'r2', text: 'Never stand between it and the tree it is staring at. It does not stop for you.' },
      { id: 'r3', text: 'Set maple syrup down by a standing tree and it smashes the tree down for you. Set it by a log or a felled trunk and it smashes that to firewood.' },
      { id: 'r4', text: 'Hold syrup out while it sits dazed. Twice, and it stops pouncing on whoever comes close.' },
      { id: 'r5', text: 'By day it sleeps curled up at the foot of a smashed stump.' },
    ],
    habitat: 'The old timber west of the hollow, among the smashed trees.', active: 'Nights. Sleeps by day', size: 'A lynx that has been fired from a cannon.',
    food: { icon: 'syrup', name: 'Maple syrup', note: 'it is after honey, really' },
    taste: 'Pitch, sawdust and a headache. It has been head-first through a hundred trees and it tastes like it.', danger: 4, scene: 'night',
  },
  {
    id: 'goofus', alias: ['goofus_bird', 'goofang', 'goofus-bird'], name: 'Goofus Bird', latin: 'Corvus retrovolans',
    ray: ['Crow that flies backwards. Doesn\'t care where it\'s going, only where it\'s been.', 'Nests upside down in the big pine by the cabin road.', 'Follows a man\'s tracks. Brought Ray back his pipe once, he says. Two miles of it.'],
    rules: [
      { id: 'r0', text: 'It flies backwards. It does not care where it is going, only where it has been.' },
      { id: 'r1', text: 'It follows your old footprints, a little way behind you, tail first.' },
      { id: 'r2', text: 'Anything you leave lying on your trail, it picks up and brings back, and drops at your feet.' },
      { id: 'r3', text: 'It cannot see what is in front of it. Now and then it flies smack into a tree.' },
      { id: 'r4', text: 'Hold out bannock and it lands, backwards, and takes it. Feed it twice and it brings you little things it finds.' },
      { id: 'r5', text: 'Lost? A tame one knows where you have been: it flies back along your trail toward home. Follow it.' },
    ],
    habitat: 'A big pine by the cabin road. It hangs upside down under its nest at night.', active: 'Days. Roosts upside down', size: 'A crow, facing the wrong way.',
    food: { icon: 'bread', name: 'Bannock', note: 'camp robber' },
    taste: 'Crow, woodsmoke and yesterday. It tastes of where it has been.', danger: 0, scene: 'dusk',
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

/** a rule given as its id, its index ('0', 2) or its text: the rule id */
export function ruleId(e: Entry | undefined, rule: string | number): string {
  const r = String(rule);
  if (!e) return r;
  if (e.rules.some((x) => x.id === r)) return r;
  if (/^\d+$/.test(r) && e.rules[Number(r)]) return e.rules[Number(r)].id;
  const low = r.toLowerCase();
  const t = e.rules.find((x) => x.text.toLowerCase() === low) ?? (low.length > 12 ? e.rules.find((x) => x.text.toLowerCase().startsWith(low.slice(0, 40))) : undefined);
  return t ? t.id : r;
}

/** a live creature's own data (src/creatures/cryptids NewCryptid: id, name, favoriteFood, rules[]) */
export interface Adoptable { id: string; name?: string; favoriteFood?: string; rules?: readonly string[] }
/** fold a creature's own rules and favourite food into an entry (rule ids r0.. by position, kept when texts match) */
export function adoptInto(e: Entry, c: Adoptable): void {
  if (c.rules?.length) e.rules = c.rules.map((t, i) => ({ id: e.rules.find((x) => x.text === t)?.id ?? e.rules[i]?.id ?? `r${i}`, text: t }));
  if (c.favoriteFood) e.food = foodOf(c.favoriteFood, e.food);
  if (c.name && !e.name) e.name = c.name;
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

// ---- plate portraits of the four real-model cryptids (src/creatures/cryptids/real.ts): the posed model, rendered
interface RealPosable { object: THREE.Object3D; ready: boolean; play(c: string | null): void; update(c: unknown): void; pos: THREE.Vector3; heading: number }
const REAL_VIEW: Record<string, { cls: 'SidehillGouger' | 'HoopSnake' | 'SplinterCat' | 'GoofusBird'; model: string; clip: string; t: number; yaw: number; pitch: number; fill: number }> = {
  gouger: { cls: 'SidehillGouger', model: 'gouger', clip: 'idle', t: 0.6, yaw: 0.8, pitch: 0.12, fill: 0.86 },
  hoopsnake: { cls: 'HoopSnake', model: 'hoopsnake', clip: 'idle', t: 1.2, yaw: 0.9, pitch: 0.3, fill: 0.84 },
  splintercat: { cls: 'SplinterCat', model: 'splintercat', clip: 'idle2', t: 0.3, yaw: 0.75, pitch: 0.14, fill: 0.84 },
  goofus: { cls: 'GoofusBird', model: 'goofus', clip: 'idle', t: 0.4, yaw: 0.7, pitch: 0.12, fill: 0.8 },
};
for (const [id, v] of Object.entries(REAL_VIEW)) {
  registerPortraitModel(id, {
    make: async () => {
      const M = await import('../../creatures/cryptids');
      await M.loadReal(v.model);
      const c = new M[v.cls]({ pos: new THREE.Vector3() }) as unknown as RealPosable;
      c.play(v.clip);
      const ctx = {
        dt: 1 / 30, time: 2, hour: 13, heightAt: () => 0, emit: () => undefined, items: [], fires: [],
        player: { pos: new THREE.Vector3(3, 1.7, 40), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0, light: false, speed: 0 },
      };
      for (let i = 0; i < Math.round(v.t * 30); i++) { c.update(ctx); c.pos.set(0, 0, 0); c.heading = 0; }
      c.object.position.set(0, 0, 0); c.object.rotation.set(0, 0, 0);
      c.object.updateMatrixWorld(true);
      return c.object;
    },
    yaw: v.yaw, pitch: v.pitch, fill: v.fill,
  });
}
