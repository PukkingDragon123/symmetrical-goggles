// The people the story adds, where they spend their days, and their favours. Odile Pruneau (Gérard's wife: the
// post wicket by day, the radio show by night), Doug and his kid Jojo at the campground, Esko the Finnish trapper,
// Lucien the retired camp cook, Hollis the last living cookee of the Kettle camp, and Megan Kowalchuk, the
// conservation officer doing a wellness check on Ray. Each has a short chain with a real reward: money, a page,
// or a recipe card (game.events 'recipe').
import * as THREE from 'three';
import type { Game } from '../game';
import { makeLook, type HumanLook } from '../../humans';
import { SPOTS, heightAt } from '../../world/layout';
import { ITEMS } from '../items';
import { addNpc, lookOr, fireSlot, FIRE_BENCH, FIRE_STAND, NPCS, P, type Npc, type NpcDef, type Stop } from '../npcs';
import { buildPieceGeometry, barkMaterial } from '../../chop/wood';
import { woodMaterial } from '../../chop/woodtex';
import { CHAINS, isDone } from './quests';
import { has, giveRecipe, pay, foundPage, mealsHeld, think } from './kit';
import { PAGES } from './text';
import { TRAP_HEAD, LOOKOUT, HOLLIS_SEAT } from './sites';
import { cryptidSpots } from '../../creatures/cryptids';

// ---------------------------------------------------------------------------------------------- looks
/** Odile: Gérard's wife, from the same store (cardigan, reading glasses on a chain) */
function odileLook(): HumanLook {
  const b = makeLook('shopkeeper');
  return {
    ...b, name: 'Odile Pruneau', seed: 2031, age: 0.82,
    build: { ...b.build, fem: 0.92, belly: 0.3, s: 0.9, shoulders: 0.86, hunch: 0.25, mass: 0.98 },
    facial: 'none', hair: { style: 'ponytail', color: '#d4cfc6', grey: 1 },
    outer: { kind: 'cardigan', color: '#6a3a48', color2: '#3a2028', open: true },
    shirt: { kind: 'henley', color: '#d8cdb8', sleeve: 'long', tucked: true },
    extras: undefined,
  };
}
/** Ray: the player's build, forty years on (the eyebrows, mostly) */
export function rayLook(): HumanLook {
  const b = makeLook('player');
  return {
    ...b, name: 'Ray Tremblay', seed: 1923, age: 0.93,
    build: { ...b.build, hunch: 0.35, belly: 0.4, mass: 1.05 },
    hair: { style: 'thin', color: '#e6e2da', grey: 1 }, facial: 'fullBeard',
    outer: { kind: 'chore', color: '#7a5a34', color2: '#3a2818', open: true },
  };
}

// ---------------------------------------------------------------------------------------------- places
interface StoreFrame { at(lx: number, lz: number): THREE.Vector3; yaw(localYaw: number): number }
function storeFrame(g: Game): StoreFrame | null {
  const grp = g.store?.group, spot = g.store?.anchors?.shopkeeper_spot as THREE.Object3D | undefined;
  if (!grp || !spot) return null;
  grp.updateMatrixWorld(true);
  const F = spot.position.y;
  const yaw0 = new THREE.Euler().setFromQuaternion(grp.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
  return {
    at: (lx, lz) => grp.localToWorld(new THREE.Vector3(lx, F, lz)),
    yaw: (ly) => yaw0 + ly,
  };
}
const yawOf = (o: THREE.Object3D | undefined, fallback = 0) => o ? new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : fallback;

/** a short round to sit on (Hollis's spot on the shore) */
function stumpSeat(g: Game, at: THREE.Vector3): void {
  const g0 = buildPieceGeometry({ species: 'pine', stem: [{ y: 0, r: 0.24, x: 0, z: 0 }, { y: 1, r: 0.23, x: 0, z: 0 }], y0: 0, y1: 0.42, seed: 517 });
  const m = new THREE.Mesh(g0.geo, [barkMaterial('pine'), woodMaterial('end', 'pine', 1), woodMaterial('split', 'pine')]);
  m.position.set(at.x, heightAt(at.x, at.z) - 0.02, at.z);
  m.castShadow = m.receiveShadow = true;
  g.scene.add(m);
}

const meals = (g: Game) => mealsHeld(g, ITEMS);
const knowsAny = (g: Game, c: string, rules: string[]) => rules.some((r) => g.journal.knows(c, r));
/** how many cryptids the Book has tasted (a full entry) */
const tasted = (g: Game) => ['hound', 'bigfoot', 'gumberoo', 'dingbat', 'granny', 'hidebehind', 'hodag', 'squonk', 'agropelter', 'teakettler', 'wasset', 'gouger', 'hoopsnake', 'splintercat', 'goofus']
  .filter((id) => (g.journal as unknown as { tastedIt?(id: string): boolean }).tastedIt?.(id)).length;

// ---------------------------------------------------------------------------------------------- the people
export function spawnPeople(g: Game): Npc[] {
  const cs = SPOTS.campsite, sf = storeFrame(g);
  const st = SPOTS.store;
  // Odile: the post wicket behind the counter by day; the radio corner by night (on air 10 till 1)
  const odileDay: Stop = sf ? { from: 7, to: 21, at: sf.at(2.75, -0.9), face: sf.yaw(-Math.PI / 2), anim: 'idle' } : { from: 7, to: 21, at: P(st.x + 2, st.z + 2), face: 0, anim: 'idle' };
  const odileNight: Stop = sf ? { from: 21, to: 7, at: sf.at(2.85, -1.5), face: sf.yaw(-Math.PI / 2), anim: 'count' } : { ...odileDay, from: 21, to: 7 };
  // Lucien: the porch bench by day, warming his hands at the store stove by night
  const porch = g.store?.anchors?.porch_bench as THREE.Object3D | undefined;
  const porchAt = porch ? porch.getWorldPosition(new THREE.Vector3()) : P(st.x + 3, st.z - 9);
  const lucienDay: Stop = { from: 8, to: 20, at: porchAt, face: yawOf(porch, Math.PI), anim: 'sit' };
  const lucienNight: Stop = sf ? { from: 20, to: 8, at: sf.at(0.25, -3.4), face: sf.yaw(-Math.PI / 2), anim: 'warm' } : { ...lucienDay, from: 20, to: 8, anim: 'idle' };
  stumpSeat(g, HOLLIS_SEAT);
  const lake = new THREE.Vector3(SPOTS.lake.x, 0, SPOTS.lake.z);
  const toLake = (p: THREE.Vector3) => Math.atan2(lake.x - p.x, lake.z - p.z);
  const kettle = cryptidSpots().teakettler;
  const defs: NpcDef[] = [
    { id: 'odile', name: 'Odile', look: odileLook(), stops: [odileDay, odileNight], talk: (game) => odileSmall(game) },
    { id: 'lucien', name: 'Lucien', look: lookOr('camp_cook', 'shopkeeper', 808), stops: [lucienDay, lucienNight], talk: () => pick(LUCIEN) },
    {
      id: 'hollis', name: 'Hollis', look: lookOr('old_timer', 'oldLogger', 909),
      stops: [{ from: 8, to: 18, at: HOLLIS_SEAT.clone().setY(HOLLIS_SEAT.y + 0.32), face: toLake(HOLLIS_SEAT), anim: 'sit' }, fireSlot(FIRE_BENCH[1], 2.0, 'sit', 18, 8)],
      talk: () => pick(HOLLIS),
    },
    {
      id: 'esko', name: 'Esko', look: lookOr('trapper', 'hunter', 707),
      stops: [{ from: 6, to: 18, at: TRAP_HEAD.clone().add(new THREE.Vector3(1.6, 0, 1.2)), face: 2.6, anim: 'idle' }, fireSlot(FIRE_STAND[3], 2.7, 'warm', 18, 6)],
      talk: () => pick(ESKO),
    },
    {
      id: 'megan', name: 'Megan', look: lookOr('ranger', 'camper', 1010),
      stops: [{ from: 7, to: 18, at: LOOKOUT, face: toLake(LOOKOUT), anim: 'point' }, fireSlot(FIRE_STAND[4], 2.7, 'warm', 18, 7)],
      talk: () => pick(MEGAN),
    },
    {
      id: 'jojo', name: 'Jojo', look: lookOr('kid', 'camper', 1111),
      stops: [{ from: 7, to: 18, at: P(cs.x + 5.4, cs.z - 1.2), face: -1.9, anim: 'idle' }, fireSlot(FIRE_BENCH[2], 2.0, 'sit', 18, 7)],
      talk: () => pick(JOJO),
    },
  ];
  const out = defs.map((d) => addNpc(g, d));
  // Jojo's wander: to the Kettle with Doug's thermos while Doug's quest is open
  const jojo = NPCS.get('jojo')!;
  const kettleSpot = new THREE.Vector3(kettle.x - 2.2, heightAt(kettle.x - 2.2, kettle.z - 1.5), kettle.z - 1.5);
  g.updaters.push(() => {
    const away = has(g, 'q:doug:jojo:on') && !has(g, 'jojo_found');
    if (away && !jojo.override) jojo.override = { at: kettleSpot, face: Math.atan2(kettle.x - kettleSpot.x, kettle.z - kettleSpot.z), anim: 'idle' };
    if (!away && jojo.override) jojo.override = null;
  });
  return out;
}

const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

// small talk when no favour is going
const LUCIEN = [
  'Lucien Gagnon. Thirty-one years in the camp kitchens. I\'ve fed more men than the Company paid.',
  'A cook is the most important man in a camp. Ask anybody. Ask the foreman. Actually, don\'t, he\'ll lie.',
  'Pea soup on the back of the stove all day, every day. The men called it "the walls". Because it held up the walls.',
  'Gérard\'s coffee is not free and it is not coffee. I drink it every day.',
  'Ray could cook. Never measured. Never apologized. Good cook.',
];
const HOLLIS = [
  'Ninety-three. I don\'t buy green bananas.',
  'I was the cookee at the Kettle camp, winter of \'51. Peeled ten thousand potatoes and one cook\'s patience.',
  'Délima Tremblay could feed sixty men and a horse on what the Company sent up. And the others, after.',
  'Never sit with your back to the woods. Not because of what\'s in them. Because it\'s rude.',
  'The lake looks the same. Everything else moved.',
];
const ESKO = ['Esko.', 'Cold tonight.', 'No.', 'Thanks.', 'Ray is a fool. A good one.', 'Trout.'];
const MEGAN = [
  'Conservation Officer Kowalchuk. The Ministry sends its regards. The Ministry sends very little else.',
  'I have a degree in wildlife biology. I am currently trying to decide what to call a walking kettle.',
  'Fire hazard\'s moderate. Weirdness hazard is extreme.',
  'If you see anything with a tag on it, it\'s mine. If you see anything with antlers and an apron, it isn\'t.',
];
const JOJO = [
  'Did you know the Kettle walks backwards so it can see where it\'s been?',
  'Dad says I can\'t have a dog. The Kettle is not a dog.',
  'I\'m nine. I\'m nine and a quarter.',
  'Mum says the bush is dangerous. Dad says the bush is "a lot". I think it\'s good.',
];
function odileSmall(g: Game): string {
  if (has(g, 'ending')) return pick(['Florida. FLORIDA. That man has never once worn shorts.', 'He calls Thursdays. Collect. I accept the charges. Don\'t tell Gérard.', 'You\'re the cook now. Come in for the mail, and eat something.']);
  return pick([
    'Post wicket\'s open. If it\'s for Ray, I\'ll give it to you. If it\'s from Ray, I\'ll read it first.',
    'Thirty-one years on the radio. Ten till one. Gérard thinks I\'m doing the books.',
    'You have his eyebrows. And his way of standing like the floor owes you money.',
    'The bush isn\'t haunted, mon chou. It\'s just occupied. Ray always said that. He stole it from me.',
  ]);
}

// ---------------------------------------------------------------------------------------------- the favours
CHAINS.push(
  {
    id: 'odile', npc: 'odile', who: 'Odile', steps: [
      {
        id: 'caller', todo: 'Find something of Ray\'s with the radio in it', requires: (g) => has(g, 'letter'),
        give: [
          'So. Ray\'s kid. He said you\'d come. He didn\'t say where he was going, the old goat.',
          'Thirty-one years Ray called my show. Thursdays, nine o\'clock. He called himself "the Cookee". As if I wouldn\'t know his voice.',
          'He stopped in August. If you find anything of his with the radio in it, bring it to me.',
        ],
        nag: ['Anything with the radio in it. He wrote everything down. Everything but where he was going.'],
        done: (g) => g.owns('radio_log'),
        thanks: [
          'His log. Every call he made. He wrote down what he told me, the old fool, as if I would forget.',
          '"Aug 28. Told Odile the kid\'s coming. She said good. She said, and you, Ray? Hung up. Coward."',
          '...Well. He\'s alive enough to be a coward. Keep it. Here, the stamps he owes me, I\'m giving them to you instead.',
        ],
        reward: (g) => pay(g, 20),
      },
      {
        id: 'call_in', todo: 'Call in to After Dark from Ray\'s set (10 pm to 1 am)',
        give: [
          'Call my show tonight. Use Ray\'s set in the cabin. After ten.',
          'Tell them what you\'ve seen. Everybody listens: the camps, the mill gates, the trucks on the 11. And the others. They listen too.',
          'Somebody should be the Cookee on Thursdays.',
        ],
        nag: ['After ten, on Ray\'s set. Press the key and talk. It isn\'t hard. Ray managed.'],
        done: (g) => has(g, 'called_in'),
        thanks: [
          'I heard you. Everybody heard you. Bev in Smooth Rock has already written in. She wants to know if you\'re single.',
          'My mother\'s pouding chômeur. Poor man\'s pudding: brown sugar, flour and patience. Ray says it\'s the only thing I make he can\'t improve. He\'s right. Don\'t tell him.',
        ],
        reward: (g) => giveRecipe(g, 'pouding_chomeur', 'Odile'),
      },
    ],
  },
  {
    id: 'doug', npc: 'doug', who: 'Doug', steps: [
      {
        id: 'jojo', todo: 'Find Jojo (and the thermos)', requires: (g) => g.day >= 1 && g.hour >= 15 && g.hour < 22,
        give: ['Hey. Hey. Have you seen Jojo? Nine, about yay high, blue toque with a pom. She was here a minute ago. With my thermos.', 'She likes the bush behind the tent pads. I don\'t. Could you...?'],
        nag: ['Blue toque. Pom. Thermos. Bush behind the tent pads. I\'d go myself but somebody has to watch the... campground.'],
        done: (g) => has(g, 'jojo_found'),
        ready: 'Jojo\'s heading back. Doug will want to know.',
        thanks: [
          'Oh thank god. Jojo. JOJO. Sit by the fire. With the thermos. Is there any coffee left in the... no. Of course not.',
          'Thanks. Really. Her mum gets her back in two weeks and I\'d like to return the same number of kids.',
          'Here: my dad\'s flapjacks. The trick is you don\'t measure anything and you don\'t apologize.',
        ],
        reward: (g) => giveRecipe(g, 'flapjacks', 'Doug'),
      },
      {
        id: 'pet', todo: 'Doug owes you breakfast', requires: (g) => isDone(g, 'jojo', 'kettle'), instant: true,
        give: ['So I hear we have a pet kettle now. Great. Great great great.', 'Fine. A deal\'s a deal. Hunter\'s breakfast: eggs, bacon, potatoes, onions, all in one pan. Feeds a crew. Or one Doug.'],
        done: () => true, thanks: [],
        reward: (g) => { giveRecipe(g, 'hunters_breakfast', 'Doug'); pay(g, 30); },
      },
    ],
  },
  {
    id: 'jojo', npc: 'jojo', who: 'Jojo', steps: [
      {
        id: 'kettle', todo: 'Make the Kettle tame (it follows you)', requires: (g) => isDone(g, 'doug', 'jojo'),
        give: ['Dad says the Kettle can\'t stay unless it\'s "tame". What\'s tame?', 'Can you make it like you? Hold out coffee and don\'t stand up too tall. It\'s shy.'],
        nag: ['Coffee. And crouch. It doesn\'t like tall people. Dad is tall.'],
        done: (g) => g.journal.knows('teakettler', 'r4'),
        thanks: ['It followed you! It FOLLOWED you. Dad! DAD!', 'I drew you a picture. The steam is the best part. Put it in your book.'],
        reward: (g) => foundPage(g, 'jojo', PAGES.jojo.title),
      },
    ],
  },
  {
    id: 'esko', npc: 'esko', who: 'Esko', steps: [
      {
        id: 'bait', todo: 'Two lake trout for Esko\'s bait',
        give: ['Esko.', 'You are Ray\'s. I can tell. You stand like you are owed money.', 'I need bait. Two lake trout. I pay.'],
        nag: ['Two trout.', 'Trout. Two.'],
        done: (g) => (g.inv.items.get('fish') ?? 0) >= 2,
        take: (g) => g.take('fish', 2),
        thanks: ['Good fish.', 'Ray\'s line starts at the split birch, here. He thinks I don\'t know he hasn\'t caught anything since \'89. I know.', 'Thirty dollars. Buy jerky.'],
        reward: (g) => pay(g, 30),
      },
      {
        id: 'hodag', todo: 'Make friends with whatever robs Esko\'s sets by the swamp',
        give: ['Something robs my sets by the swamp. Takes the bait, leaves the trap. Smells like a wet barn on fire.', 'Hodag. Do not fight it. Feed it. Then it robs somebody else.'],
        nag: ['Bacon. It is always bacon.'],
        done: (g) => knowsAny(g, 'hodag', ['r3', 'r4']),
        thanks: [
          'It sleeps by my sets now. Like a dog. A horrible dog.',
          'My mother\'s mojakka. Venison stew, Finn way. You put in whatever is slowest.',
          'And this. Ray\'s tally. He gave it to me in \'89. He said I would know when to give it back.',
        ],
        reward: (g) => { giveRecipe(g, 'venison_stew', 'Esko'); foundPage(g, 'esko', PAGES.esko.title); },
      },
    ],
  },
  {
    id: 'lucien', npc: 'lucien', who: 'Lucien', steps: [
      {
        id: 'bannock', todo: 'Learn bannock from Lucien', instant: true,
        give: [
          'You\'re Ray\'s. Ray could cook. Can you cook?',
          '...That face says no. Every cook starts with bannock. Flour, baking powder, salt, a bit of lard, water. Fry it slow. Here.',
        ],
        done: () => true, thanks: [],
        reward: (g) => giveRecipe(g, 'bannock', 'Lucien'),
      },
      {
        id: 'taste', todo: 'Bring Lucien bannock you made yourself',
        give: ['Now make it. Bring me a piece. Not the store\'s. I\'ll know.'],
        nag: ['Bannock. Yours. Gérard\'s is a doorstop with ambitions.'],
        done: (g) => meals(g).some((id) => /bannock/i.test(id + ITEMS[id]?.name)),
        take: (g) => { const id = meals(g).find((i) => /bannock/i.test(i + ITEMS[i]?.name)); if (id) g.take(id); },
        thanks: [
          'Hm.', '...Hm!',
          'Burnt on one side. Good. That\'s how they like it out there.',
          'Soupe aux pois. Pea soup. The shanties ran on it: dried peas, salt pork, all day on the back of the stove. Here\'s how.',
        ],
        reward: (g) => giveRecipe(g, 'pea_soup', 'Lucien'),
      },
      {
        id: 'supper', todo: 'Three different hot dishes for the church supper',
        give: ['The church supper is Saturday and I\'m short three dishes and two volunteers. Bring me three different hot dishes.', 'You\'ll do it. You have the look of somebody who can\'t say no to old men.'],
        nag: ['Three dishes. Different ones. Three beans is one dish, three times.'],
        done: (g) => new Set(meals(g)).size >= 3,
        take: (g) => { for (const id of [...new Set(meals(g))].slice(0, 3)) g.take(id); },
        thanks: [
          'Three! You could cook in a camp. Not a good camp. But a camp.',
          'My tourtière. Pork, a bit of venison, cloves, and the crust is the whole point. Don\'t tell my sister I gave you this. She thinks she has the only copy.',
        ],
        reward: (g) => { giveRecipe(g, 'tourtiere', 'Lucien'); pay(g, 40); },
      },
    ],
  },
  {
    id: 'hollis', npc: 'hollis', who: 'Hollis', steps: [
      {
        id: 'tin', todo: 'Hollis\'s tobacco tin, in the old camp\'s bunkhouse',
        give: [
          'Hollis Beattie. I was the cookee at the Kettle camp, winter of \'51. Seventeen years old.',
          'I left a tobacco tin in the bunkhouse when we cleared out. Blue lid, H.B. scratched in it. North shore of the lake, past Ray\'s old line.',
          'I\'m ninety-three. I\'d like it back before I\'m ninety-four.',
        ],
        nag: ['North shore. Bunkhouse. Blue lid. I\'d go myself but my knees retired before I did.'],
        done: (g) => g.owns('hollis_tin'),
        take: (g) => g.take('hollis_tin'),
        thanks: [
          'That\'s it. That\'s the one.',
          '...Still has Mother\'s recipe in it. Blueberry grunt. You steam it in a pot with the lid on, and it grunts. You\'ll hear.',
          'Keep the card. I\'ve had it by heart since St-Laurent was prime minister. And this: the last crew. I wrote it down for the Company. They never asked for it.',
        ],
        reward: (g) => { giveRecipe(g, 'blueberry_grunt', 'Hollis'); foundPage(g, 'crew', PAGES.crew.title); },
      },
      {
        id: 'stove', todo: 'Light Délima\'s stove in the old cookhouse', requires: (g) => has(g, 'camp'),
        give: ['You found the camp. Does the cookhouse stove still draw? Délima\'s barrel stove.', 'Light it. They\'ll see the smoke. They\'ll know somebody\'s cooking again.'],
        nag: ['Dry kindling first. That stove sulks.'],
        done: (g) => has(g, 'camp_stove'),
        thanks: [
          'Smoke over the north shore. I saw it from here. First time since \'51.',
          'Délima didn\'t leave with the Company. She stayed the summer. Fed them. Then her daughter did. Then Ray.',
          'It isn\'t a curse, kid. It\'s a kitchen. Here, for the matches.',
        ],
        reward: (g) => pay(g, 25),
      },
    ],
  },
  {
    id: 'megan', npc: 'megan', who: 'Megan', steps: [
      {
        id: 'wellness', todo: 'Tell the ranger anything that says where Ray went',
        give: [
          'Conservation Officer Kowalchuk, Ministry of Natural Resources. I\'m doing a wellness check on Raymond Tremblay.',
          'He hasn\'t been seen since August, he hasn\'t renewed a trapping licence since 1990, and the Township says he owes fourteen dollars and sixty cents.',
          'If you find anything that says where he went, I\'d like to know before the Township does.',
        ],
        nag: ['Anything in writing. He seems like the kind of man who writes things down instead of telling people.'],
        done: (g) => has(g, 'cache2'),
        thanks: [
          '"Gone up the line." "The plates are for them." ...Right.',
          'I\'m going to write "subject is eccentric but appears to be fine". It\'s what I wrote last time too.',
          'The Ministry pays for information. Badly.',
        ],
        reward: (g) => pay(g, 25),
      },
      {
        id: 'trailcam', todo: 'Bring Megan the card from her trail camera on the north shore',
        give: ['I\'ve got a trail camera on the north shore, by the old logging camp. Battery died weeks ago. Bring me the memory card?', 'It\'s strapped to a big spruce. Camouflage case. You\'ll walk right past it. Everybody does. That\'s the point.'],
        nag: ['Camouflage case, on a spruce, north shore. If you can\'t find it, it\'s working.'],
        done: (g) => g.owns('sd_card'),
        take: (g) => g.take('sd_card'),
        thanks: [
          'Let\'s see. Deer. Deer. Something wet. Deer.', '...Huh.',
          'That\'s your uncle. Two weeks ago. Carrying a pot. He\'s waving at the camera.',
          'Wellness check complete. Subject is well. Subject is checked. Subject is a pain in my neck.',
          'Here. My dad\'s moose chili. If you ever get a moose, this is what it\'s for. The Ministry doesn\'t need to know about the beer in it.',
        ],
        reward: (g) => { giveRecipe(g, 'moose_chili', 'Megan'); foundPage(g, 'trailcam', PAGES.trailcam.title); },
      },
      {
        id: 'survey', todo: 'Get close to three uncatalogued species (the book tastes them)',
        give: ['Last thing. The Ministry wants a wildlife survey for the district. I am not writing "hodag" on a government form.', 'Get close to three... uncatalogued species. Close enough to be sure. I\'ll write "large toad, horned" or whatever.'],
        nag: ['Three. Close up. From a respectful distance. Those are not opposites, whatever you\'ve heard.'],
        done: (g) => tasted(g) >= 3,
        thanks: ['Three. "Large toad, horned." "Weasel, snow, unusual." "Kettle, walking."', 'My supervisor is going to love this. Survey fee. Don\'t spend it all in one place. There\'s only one place.'],
        reward: (g) => pay(g, 60),
      },
    ],
  },
);

/** Jojo, found by the Kettle: talk to her to send her home */
export function jojoFound(g: Game, n: Npc): string[] | null {
  if (n.def.id !== 'jojo' || !has(g, 'q:doug:jojo:on') || has(g, 'jojo_found')) return null;
  g.flags.add('st:jojo_found');
  think('She\'s fine. She\'s more than fine.', 2.5);
  return ['Shhh. It\'s drinking.', 'It\'s called the Kettle. It walks backwards so it can see where it\'s been. Dad says that\'s not how animals work.', '...Okay. I\'m coming. Don\'t tell him about the coffee. Tell him about the coffee, I don\'t care.'];
}
