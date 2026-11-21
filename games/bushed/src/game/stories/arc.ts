// The main story, in chapters, played out with things you find and do:
//   1 Gone up the line  Pépère's last letter at the post wicket (read with the will), his ammo can under the
//                       woodshed, the orange tape to the split rock where his trapline starts
//   2 The plates        five sets, jaws wired shut: put food on the tin plates, and in the morning something has
//                       eaten it and left a thank-you
//   3 Camp Kettle       the abandoned logging camp on the north shore: the cook's ledger, the 1951 notice, a
//                       bedroll somebody has been sleeping in, Délima's barrel stove
//   4 The lake          fresh boot prints from the cookhouse door to a dock; the gut hammer hanging at the end
//   5 Supper's on       hang it back on its post, put a hot supper on the table, ring it at sundown: the others
//                       come to the edge of the firelight, and Pépère walks up from the dock with a lantern
// What happened to Ray: Pépère Ray, your grandfather, died this spring. He left you the cabin, Camp Kettle and
// Délima's tradition in his will, and hid his pages so you'd find the rest yourself. Somebody has been sleeping in
// the cookhouse since; the boot prints are fresh; the ranger's camera caught him in October. The night you ring
// for supper his spirit walks up from the dock to eat with the crew one last time, then he's gone. Why the camp:
// his grandmother cooked there and never left. What the critters want: supper, and somebody to tell it to.
import * as THREE from 'three';
import type { Game } from '../game';
import { ITEMS, addItems } from '../items';
import { NPCS, type Npc } from '../npcs';
import { hud } from '../../ui/hud';
import { floatText } from '../../ui/float';
import { heightAt } from '../../world/layout';
import { audio } from '../../audio/audio';
import { SOUNDS } from '../../audio/bank';
import { loadProp } from '../../places/props';
import { has, set, count, num, setNum, think, noted, dirty, foundPage, giveRecipe, mealsHeld, clang, paperOn, RECIPE_NAMES } from './kit';
import { PAGES, RADIO_LOG } from './text';
import { CAMP, SETS, SHORE, TRAP_HEAD, WOODYARD } from './sites';
import { showOnPlate, tickStove, gutHammerModel, type StoryWorld } from './world';
import { buildProduct } from '../../places/products';
import { puffs } from '../../gfx/particles';
import { objectiveSources, type Objective } from '../../ui/objectives';
import { chapterCard, cineUI } from '../cinematic/overlay';

// ---------------------------------------------------------------------------------------------- chapters
interface Step { id: string; todo: (g: Game) => string; done: (g: Game) => boolean }
interface Chapter { n: number; title: string; steps: Step[]; hint: string }
const S = (id: string, todo: string | ((g: Game) => string), done?: (g: Game) => boolean): Step => ({ id, todo: typeof todo === 'string' ? () => todo : todo, done: done ?? ((g) => has(g, id)) });

export const CHAPTERS: Chapter[] = [
  {
    n: 1, title: 'Gone up the line', hint: 'Pépère left more than the will. Odile at Pruneau\'s has his last letter.', steps: [
      S('letter', 'Ask Odile at the post wicket for Pépère\'s letter'),
      S('cache1', 'Look under the woodshed stack, by the block'),
      S('cache2', 'Follow Ray\'s orange tape into the bush'),
    ],
  },
  {
    n: 2, title: 'The plates', hint: 'Five sets north of the lake trail. Tin lids on the trees, numbered.', steps: [
      S('sets', (g) => `Walk Ray's line: five sets (${Math.min(5, count(g, 'set:'))}/5)`, (g) => count(g, 'set:') >= 5),
      S('fed', (g) => `Put food on Ray's plates (${Math.min(3, count(g, 'plate:fed:'))}/3)`, (g) => count(g, 'plate:fed:') >= 3),
      S('gift', 'Check a plate the next morning'),
    ],
  },
  {
    n: 3, title: 'Camp Kettle', hint: 'Set five said the camp is just past it, on the shore. His camp now. Yours.', steps: [
      S('camp', 'Find the old camp past set five'),
      S('ledger', 'Look round the cookhouse'),
      S('camp_stove', 'Light the cookhouse stove'),
    ],
  },
  {
    n: 4, title: 'The lake', hint: 'Boot prints in the mud outside the cookhouse door. Fresh ones. His size.', steps: [
      S('dock', 'Follow the boot prints from the cookhouse door'),
      S('hammer', 'See what\'s hanging at the end of the dock'),
    ],
  },
  {
    n: 5, title: 'Supper\'s on', hint: 'Délima\'s rules: one plate for the bush, every night. Hot.', steps: [
      S('hung', 'Hang the gut hammer back on its post'),
      S('supper', 'Cook supper and set it on the cookhouse table'),
      S('ending', 'Ring it at sundown. Once, for the others.'),
    ],
  },
];
const EPILOGUE = { title: 'The cook', lines: ['Keep the plates full. Hot, not scraps.', 'Tell them stories at the fire.', 'After Dark, Thursdays at nine.'] };
const WORDS = ['One', 'Two', 'Three', 'Four', 'Five'];

/** the chapter you're in (6 after the ending) */
export function chapter(g: Game): number {
  for (const c of CHAPTERS) if (!c.steps.every((s) => s.done(g))) return c.n;
  return 6;
}
/** the book's to-do page for the current chapter */
export function todoBlocks(g: Game): { title: string; lines: { text: string; done: boolean }[] } {
  const n = chapter(g);
  if (n > 5) return { title: `Epilogue — ${EPILOGUE.title}`, lines: EPILOGUE.lines.map((t) => ({ text: t, done: false })) };
  const c = CHAPTERS[n - 1];
  return { title: `Chapter ${['One', 'Two', 'Three', 'Four', 'Five'][n - 1]} — ${c.title}`, lines: c.steps.map((s) => ({ text: s.todo(g), done: s.done(g) })) };
}

// ---------------------------------------------------------------------------------------------- the objective line
let arcW: StoryWorld | null = null;
const introDone = (g: Game) => g.flags.has('intro_done') || g.flags.has('free') || g.day >= 1;
const _tp = new THREE.Vector3();
/** where a step happens (for the objective's distance, direction and pin) */
function stepTarget(g: Game, id: string): THREE.Vector3 | THREE.Object3D | null {
  const W = arcW;
  if (!W) return null;
  switch (id) {
    case 'letter': return (g.store?.anchors?.post_wicket as THREE.Object3D | undefined) ?? NPCS.get('odile')?.model.root ?? null;
    case 'cache1': return W.ammoCan ?? (g.cabin?.anchors?.woodshed_stack as THREE.Object3D | undefined) ?? WOODYARD;
    case 'cache2': return TRAP_HEAD;
    case 'sets': return SETS.find((_, i) => !has(g, `set:${i}`)) ?? null;
    case 'fed': return W.plates.find((_, i) => !has(g, `plate:fed:${i}`))?.pos ?? null;
    case 'gift': return W.plates.find((_, i) => num(g, `plate${i}`) !== null)?.pos ?? null;
    case 'camp': return _tp.copy(CAMP.pos).setY(CAMP.pos.y + 1);
    case 'ledger': case 'supper': return W.table;
    case 'camp_stove': return W.stove.light.position;
    case 'dock': case 'hammer': return W.dockEnd;
    case 'hung': case 'ending': return W.postTop;
    default: return null;
  }
}
/** the story's line for the objective HUD: this chapter's next step (null during the intro) */
export function storyObjective(g: Game): Objective | null {
  if (!arcW || !introDone(g)) return null;
  const n = chapter(g);
  if (n > 5) return { id: 'epilogue', kicker: `Epilogue · ${EPILOGUE.title}`, text: EPILOGUE.lines[0] };
  const c = CHAPTERS[n - 1], st = c.steps.find((x) => !x.done(g));
  if (!st) return null;
  return { id: `ch${n}:${st.id}`, kicker: `Chapter ${WORDS[n - 1]} · ${c.title}`, text: st.todo(g), target: stepTarget(g, st.id), reach: 3 };
}

// ---------------------------------------------------------------------------------------------- items
export function registerStoryItems(g: Game): void {
  addItems({
    gut_hammer: { id: 'gut_hammer', name: 'The gut hammer', desc: 'Délima\'s steel triangle and its striker. Twice for the men. Once for the others.', price: 0, mass: 1.2, model: 'story:gut_hammer', pocket: true, tags: ['story'] },
    radio_log: { id: 'radio_log', name: 'Ray\'s radio log', desc: 'A school scribbler: every Thursday call to After Dark, since 1995.', price: 0, mass: 0.15, model: 'story:radio_log', pocket: true, tags: ['story', 'paper'] },
    hollis_tin: { id: 'hollis_tin', name: 'A tobacco tin', desc: 'Blue lid, "H.B." scratched in it. Something papery rattles inside.', price: 0, mass: 0.15, model: 'cleaner_tin_01', pocket: true, tags: ['story'] },
    sd_card: { id: 'sd_card', name: 'Memory card', desc: 'From the ranger\'s trail camera. Ministry property, it says, in very small letters.', price: 0, mass: 0.01, model: 'story:sd_card', pocket: true, tags: ['story'] },
  });
  g.setItemModel('gut_hammer', gutHammerModel());
  g.setItemModel('radio_log', buildProduct('book_stack'));
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.002, 0.032), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.5 }));
  g.setItemModel('sd_card', card);
  loadProp('cleaner_tin_01').then((o) => g.setItemModel('hollis_tin', o)).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------- the arc
const FOOD_ORDER = ['cryptid_jerky', 'jerky', 'bread', 'cookies', 'berries', 'fish', 'bacon', 'beans', 'syrup', 'eggs', 'nuts', 'chanterelle', 'coffee'];
const GIFTS: { item: string; n: number; text: string }[] = [
  { item: 'kindling', n: 3, text: 'Licked clean. In its place, a neat bundle of dry kindling, broken to length. Somebody up a tree has manners.' },
  { item: 'berries', n: 2, text: 'Licked clean. A pile of wild blueberries on the plate, and a seventeen-inch print beside it.' },
  { item: 'chanterelle', n: 2, text: 'Licked clean, and washed. Golden chanterelles, arranged in a ring. That\'s somebody\'s grandmother.' },
  { item: 'firestarter', n: 2, text: 'Licked clean. Two sticks of fatwood, gouged out of an old pine root. The tracks only go one way round the hill.' },
  { item: 'fish', n: 1, text: 'Licked clean. A lake trout on the plate, still cold. The snow by the shore has been heaved up in a line.' },
];

export class Arc {
  private t = 0;
  /** seconds on your feet since the last cutscene or sleep (chapter cards wait for the morning's own card) */
  private walkT = 0;
  finale: Finale | null = null;
  constructor(private g: Game, private W: StoryWorld) {
    this.wire();
    arcW = W;
    if (!objectiveSources.includes(storyObjective)) objectiveSources.push(storyObjective);
  }

  private wire(): void {
    const g = this.g, W = this.W;
    // Ray's ammo can
    W.label.ammo = () => has(g, 'cache1') ? 'Ray\'s ammo can (empty but for the smell of jerky)' : 'Open Ray\'s ammo can';
    W.on.ammo = () => {
      if (has(g, 'cache1')) { think('Empty. It smells like jerky and gun oil.', 2.5); return; }
      set(g, 'cache1');
      g.sound('drawer_open', undefined, 0.7, 0.8);
      g.give('jerky', 3);
      g.readPaper(PAGES.ray1.blocks, 51);
      foundPage(g, 'ray1', PAGES.ray1.title);
      think('A page torn out of the book, three packs of jerky, and a roll of orange flagging tape.', 4.5);
    };
    // the coffee can at the split rock
    W.label.can2 = () => has(g, 'cache2') ? 'Ray\'s coffee can' : 'Pull the coffee can out of the crack';
    W.on.can2 = () => {
      if (has(g, 'cache2')) { g.readPaper(PAGES.ray2.blocks, 52); return; }
      set(g, 'cache2');
      g.sound('pickup', undefined, 0.6);
      g.readPaper(PAGES.ray2.blocks, 52);
      foundPage(g, 'ray2', PAGES.ray2.title);
    };
    // plates
    W.plates.forEach((_, i) => {
      W.label[`plate${i}`] = () => this.plateLabel(i);
      W.on[`plate${i}`] = () => this.usePlate(i);
    });
    // the camp
    W.label.ledger = () => 'Read the cook\'s ledger';
    W.on.ledger = () => { g.readPaper(PAGES.ledger.blocks, 53); if (set(g, 'ledger')) foundPage(g, 'ledger', PAGES.ledger.title); };
    W.label.notice = () => 'Read the notice';
    W.on.notice = () => { g.readPaper(PAGES.notice.blocks, 54); foundPage(g, 'notice', PAGES.notice.title); };
    W.label.bedroll = () => has(g, 'bedroll') ? 'Somebody\'s bedroll (still warm-ish)' : 'Look at the bedroll';
    W.on.bedroll = () => {
      g.readPaper(PAGES.ray5.blocks, 55);
      if (set(g, 'bedroll')) { foundPage(g, 'ray5', PAGES.ray5.title); think('Somebody\'s been sleeping here. Recently. The page is in his hand, fresh pencil. ...He died in April.', 5); }
    };
    W.label.stove = () => has(g, 'camp_stove') ? 'Délima\'s stove (drawing well)' : g.owns('matches') ? 'Light Délima\'s stove' : 'A barrel stove. Matches?';
    W.on.stove = () => {
      if (has(g, 'camp_stove')) { think('It ticks as it warms. Same sound as the one at the cabin.', 2.5); return; }
      if (!g.owns('matches')) { think('Dry splits stacked beside it, a coffee pot on top. No matches.', 3); return; }
      set(g, 'camp_stove');
      g.sound('match_strike', W.stove.light.position, 0.8);
      g.sound('fire_ignite', W.stove.light.position, 0.8);
      think('The splits Ray left are bone dry. It catches first time.', 3.5);
      noted(g, 'Smoke over the north shore.');
    };
    W.label.tin = () => 'Take the tobacco tin';
    W.on.tin = () => { const o = W.pickups.tin; if (!o || g.owns('hollis_tin') || has(g, 'tin')) return; set(g, 'tin'); o.visible = false; g.give('hollis_tin'); g.sound('pickup', undefined, 0.5); think('"H.B." scratched in the lid. Somebody\'s, once.', 3); };
    W.label.trailcam = () => has(g, 'sdcard') ? 'Megan\'s trail camera (no card)' : 'Take the memory card out';
    W.on.trailcam = () => { if (!set(g, 'sdcard')) return; g.give('sd_card'); g.sound('flashlight_click', undefined, 0.6); think('A little memory card. Ministry property, it says, very small.', 3); };
    // the dock
    W.label.dockHammer = () => has(g, 'hammer') ? '' : 'Take the triangle (and the page tied to it)';
    W.on.dockHammer = () => {
      if (!set(g, 'hammer')) return;
      W.hammerAtDock.visible = false;
      g.give('gut_hammer');
      clang(W.dockEnd, 0.5);
      g.readPaper(PAGES.ray6.blocks, 56);
      foundPage(g, 'ray6', PAGES.ray6.title);
    };
    // the post: hang it, ring it
    W.label.post = () => has(g, 'hung') ? 'Ring the gut hammer' : g.owns('gut_hammer') ? 'Hang the gut hammer back on its hook' : 'An empty iron hook on a post';
    W.on.post = () => {
      if (!has(g, 'hung')) {
        if (!g.owns('gut_hammer')) { think('An empty hook. Something hung here a long time. The post is worn smooth under it.', 3.5); return; }
        g.take('gut_hammer'); set(g, 'hung'); W.hammerOnPost.visible = true;
        g.sound('pickup', undefined, 0.5); clang(W.postTop, 0.25);
        return;
      }
      this.ring();
    };
    // the table: supper
    W.label.table = () => has(g, 'supper') ? 'Supper\'s on the table' : this.supperItem() ? `Set the ${ITEMS[this.supperItem()!]?.name ?? 'supper'} on the table` : 'Délima\'s table';
    W.on.table = () => {
      if (has(g, 'supper')) { think('Steam off it in the cold. Enough for everybody, nearly.', 2.5); return; }
      const id = this.supperItem();
      if (!id) { think('It wants something hot on it. Something I cooked.', 3); return; }
      g.take(id); set(g, 'supper'); set(g, `supper_id:${id}`);
      this.showSupper(id);
      g.sound('bottle_set', W.table, 0.6);
    };
  }

  /** something cooked to put on the table (any meal; if this build has no cooking, plain food will do) */
  private supperItem(): string | null {
    const meals = mealsHeld(this.g, ITEMS);
    if (meals.length) return meals[0];
    const anyMeals = Object.values(ITEMS).some((i) => i.tags?.includes('meal'));
    return anyMeals ? null : (['bread', 'beans', 'bacon'].find((id) => this.g.owns(id)) ?? null);
  }

  private showSupper(id: string): void {
    const W = this.W;
    W.supper?.removeFromParent();
    const m = this.g.toolModel(id) ?? buildProduct('enamel_plate');
    m.position.copy(W.table); m.rotation.y = CAMP.yaw;
    this.g.scene.add(m);
    W.supper = m;
    // and a bowl at every place, for the others
    for (let k = 0; k < 5; k++) {
      const b = buildProduct('enamel_bowl');
      const off = new THREE.Vector3(-1.2 + k * 0.62, 0, k % 2 ? 0.22 : -0.22).applyAxisAngle(new THREE.Vector3(0, 1, 0), CAMP.yaw);
      b.position.copy(W.table).add(off).add(new THREE.Vector3(Math.cos(CAMP.yaw) * 0.6, 0, -Math.sin(CAMP.yaw) * 0.6));
      this.g.scene.add(b);
    }
  }

  // ---- plates
  private plateState(i: number): 'empty' | 'waiting' | 'gift' {
    const g = this.g, d = num(g, `plate${i}`);
    if (d === null) return 'empty';
    if (d < 0) return 'gift';
    return g.day > d && g.hour >= 5 ? 'gift' : 'waiting';
  }
  private foodToGive(): string | null {
    const g = this.g, held = g.hands?.heldItem;
    if (held && ITEMS[held]?.food && !ITEMS[held]?.food?.drink) return held;
    return FOOD_ORDER.find((id) => g.owns(id)) ?? mealsHeld(g, ITEMS)[0] ?? null;
  }
  private plateLabel(i: number): string {
    const s = this.plateState(i);
    if (s === 'gift') return 'Something was left on the plate';
    if (s === 'waiting') return 'Ray\'s plate (something will come for it tonight)';
    const f = this.foodToGive();
    return f ? `Put ${ITEMS[f]?.name.toLowerCase() ?? f} on Ray's plate` : 'Ray\'s plate (empty; I have no food)';
  }
  private usePlate(i: number): void {
    const g = this.g, s = this.plateState(i);
    if (s === 'waiting') { think('Not yet. Whatever comes for it comes at night.', 2.5); return; }
    if (s === 'gift') {
      const gift = GIFTS[i % GIFTS.length];
      g.give(gift.item, gift.n);
      g.flags.delete(`st:plate${i}=${num(g, `plate${i}`)}`);
      showOnPlate(g, this.W, i, null);
      g.sound('pickup', undefined, 0.6);
      think(gift.text, 5.5);
      if (set(g, 'gift')) noted(g, 'They always pay. Ray said so.');
      return;
    }
    const f = this.foodToGive();
    if (!f) { think('Nothing to put on it. Jerky, bannock, berries. Anything.', 3); return; }
    g.take(f);
    if (g.hands?.heldItem === f && !g.owns(f)) g.hands.equip(null);
    setNum(g, `plate${i}`, g.day);
    set(g, `plate:fed:${i}`);
    showOnPlate(g, this.W, i, f);
    g.sound('place_wood', this.W.plates[i].pos, 0.3, 1.6);
    think(i === 0 && count(g, 'plate:fed:') === 1 ? 'There. Come back in the morning, Ray says.' : 'On the plate.', 2.5);
  }

  /** the plates' look follows the state (after loading, overnight) */
  private syncPlates(): void {
    const g = this.g, W = this.W;
    W.plates.forEach((p, i) => {
      const s = this.plateState(i);
      if (s === 'empty' && p.food) showOnPlate(g, W, i, null);
      if (s === 'waiting' && !p.food) showOnPlate(g, W, i, 'jerky');
      if (s === 'gift' && (!p.food || p.food.userData.gift !== true)) { showOnPlate(g, W, i, GIFTS[i % GIFTS.length].item); if (p.food) p.food.userData.gift = true; }
    });
  }

  // ---- ringing
  private ring(): void {
    const g = this.g, W = this.W;
    clang(W.postTop, 1);
    if (has(g, 'ending')) { think('Once, for the others. Something answers from the treeline.', 3); setTimeout(() => clang(W.postTop, 0.7), 900); return; }
    const sundown = g.hour >= 17.5 && g.hour < 22.5;
    if (!has(g, 'supper')) { think('Nothing on the table. Ringing for supper with no supper is just being cruel.', 3.5); return; }
    if (!sundown) { think('It rings out over the lake. Nothing comes. Ray said sundown.', 3.5); return; }
    if (this.finale) return;
    this.finale = new Finale(g, W);
  }

  // ---- every frame
  update(dt: number): void {
    const g = this.g, W = this.W;
    tickStove(W, dt, g.player.pos.distanceTo(CAMP.pos) < 120);
    W.stove.level += ((has(g, 'camp_stove') ? 1 : 0) - W.stove.level) * Math.min(1, dt * 0.8);
    W.lamp.level += (((has(g, 'supper') || has(g, 'ending')) && (g.hour > 17 || g.hour < 7) ? 1 : 0) - W.lamp.level) * Math.min(1, dt * 1.5);
    this.finale?.update(dt);
    this.walkT = g.mode === 'walk' ? this.walkT + dt : 0;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const p = g.player.pos;
    // walking the line
    SETS.forEach((s, i) => {
      if (has(g, `set:${i}`) || Math.hypot(p.x - s.x, p.z - s.z) > 4.5) return;
      set(g, `set:${i}`);
      think(i === 0 ? 'Set one. A tin plate, a cubby of sticks. The trap\'s jaws are wired shut.' : `Set ${['one', 'two', 'three', 'four', 'five'][i]}.`, 3);
      if (i === 2) this.dropPage(i, 'ray3', 57);
      if (i === 4) this.setFive();
    });
    if (!has(g, 'camp') && p.distanceTo(CAMP.pos) < 22) {
      set(g, 'camp');
      void chapterCard({ kicker: 'Rang 4 Timber Co., 1923–1951', title: 'Camp Kettle', sub: 'His camp. Délima\'s camp. Yours, the will says.', secs: 5 });
    }
    if (!has(g, 'dock') && has(g, 'camp') && p.distanceTo(W.dockEnd) < 5) { set(g, 'dock'); think('A dock. New boards nailed over old ones. Something hanging at the end.', 3.5); }
    this.syncPlates();
    W.hammerAtDock.visible = !has(g, 'hammer');
    W.hammerOnPost.visible = has(g, 'hung');
    if (has(g, 'tin') && W.pickups.tin) W.pickups.tin.visible = false;
    if (has(g, 'supper') && !W.supper && !this.finale) { const f = [...g.flags].find((x) => x.startsWith('st:supper_id:')); this.showSupper(f ? f.slice(13) : 'beans'); }
    // chapter title cards
    const ch = chapter(g);
    if (g.mode === 'walk' && this.walkT > 4.5 && (g.flags.has('free') || g.day >= 1) && !has(g, `ch:${ch}`)) {
      set(g, `ch:${ch}`);
      if (ch <= 5) { const c = CHAPTERS[ch - 1]; void chapterCard({ kicker: `Chapter ${WORDS[ch - 1]}`, title: c.title, sub: c.hint, secs: 6 }); dirty(); }
    }
    // Pépère is only ever there on the night somebody rings for supper (and in a save from before, he's gone too)
    const ray = NPCS.get('ray');
    if (ray && !this.finale?.running) {
      ray.hidden = true;
      ray.override = null;
      if (has(g, 'ending') && !has(g, 'ray_gone')) set(g, 'ray_gone');
    }
  }

  private dropPage(i: number, id: keyof typeof PAGES, seed: number): void {
    const pl = this.W.plates[i];
    const at = pl.pos.clone().add(new THREE.Vector3(0.25, 0.01, 0.1));
    at.y = heightAt(at.x, at.z) + 0.015;
    let m: THREE.Mesh | null = null;
    m = paperOn(this.g, PAGES[id].blocks, seed, at, 0.6, { label: 'A page, weighted down with a stone', take: () => { foundPage(this.g, id, PAGES[id].title); m?.removeFromParent(); } });
  }

  private setFive(): void {
    const g = this.g;
    const pl = this.W.plates[4];
    const at = pl.pos.clone().add(new THREE.Vector3(-0.3, 0, 0.2)); at.y = heightAt(at.x, at.z) + 0.03;
    let log: THREE.Mesh | null = null;
    log = paperOn(g, RADIO_LOG, 58, at, 1.1, {
      label: 'A school scribbler in a bread bag', style: 'card',
      take: () => { g.give('radio_log'); log?.removeFromParent(); think('Ray\'s radio log. Odile at the store would want this.', 3.5); },
    });
    const at2 = pl.pos.clone().add(new THREE.Vector3(0.3, 0, -0.1)); at2.y = heightAt(at2.x, at2.z) + 0.02;
    let pg: THREE.Mesh | null = null;
    pg = paperOn(g, PAGES.ray4.blocks, 59, at2, -0.4, { label: 'A page under the plate', take: () => { foundPage(g, 'ray4', PAGES.ray4.title); pg?.removeFromParent(); } });
  }

  get finaleRunning(): boolean { return !!this.finale?.running; }
}

// ---------------------------------------------------------------------------------------------- the finale
/** cryptid voices from the treeline, by what you've made friends with */
const VOICES: [critter: string, rule: string, sound: string][] = [
  ['hound', 'friend', 'hound_yip'], ['bigfoot', 'gift', 'bigfoot_whoop'], ['teakettler', 'r4', 'kettle_whistle'], ['gumberoo', 'fire', 'gumberoo_boing'],
  ['dingbat', 'dark', 'dingbat_flutter'], ['goofus', 'r4', 'bird_raven'], ['hodag', 'r4', 'moose_grunt'], ['squonk', 'r5', 'bird_loon'],
];

/**
 * Pépère as he is now: see-through and cold, lit warm only by the lantern he carries. Clones the model's materials
 * once (the people share theirs), and gives them back when he goes.
 */
class Ghost {
  private meshes: THREE.Mesh[] = [];
  private orig = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private clones = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  private ghosts = new Set<THREE.Material>();
  private cast = new Map<THREE.Mesh, boolean>();
  private glitch = 0;
  private glitchT = 3;
  constructor(private root: THREE.Object3D) {
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) this.meshes.push(m); });
  }
  private ghostOf(src: THREE.Material): THREE.Material {
    if (this.ghosts.has(src)) return src;
    let gm = this.clones.get(src);
    if (!gm) {
      const base = src as THREE.MeshStandardMaterial;
      gm = (base.isMeshStandardMaterial ? base.clone() : new THREE.MeshStandardMaterial({ color: 0xb8c4d6 })) as THREE.MeshStandardMaterial;
      gm.transparent = true;
      gm.depthWrite = true;
      gm.color = (base.color?.clone() ?? new THREE.Color(1, 1, 1)).lerp(new THREE.Color(0.72, 0.8, 0.92), 0.55);
      gm.emissive = new THREE.Color(0.2, 0.26, 0.36);
      gm.emissiveMap = base.map ?? null;
      gm.opacity = 0;
      this.clones.set(src, gm);
      this.ghosts.add(gm);
    }
    return gm;
  }
  /** level 0..1 (how much of him is here), t for the flicker */
  set(level: number, t: number, dt: number): void {
    // now and then he isn't quite there for a moment
    this.glitchT -= dt;
    if (this.glitchT <= 0) { this.glitchT = 2.5 + Math.random() * 5; this.glitch = 0.09 + Math.random() * 0.1; }
    this.glitch -= dt;
    const flick = this.glitch > 0 ? 0.25 : 0.86 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + 0.04 * Math.sin(t * 23.0);
    const op = Math.max(0, Math.min(1, level)) * 0.58 * flick;
    for (const m of this.meshes) {
      if (!this.orig.has(m)) { this.orig.set(m, m.material); this.cast.set(m, m.castShadow); }
      const cur = m.material;
      if (Array.isArray(cur)) { if (!cur.every((x) => this.ghosts.has(x))) m.material = cur.map((x) => this.ghostOf(x)); }
      else if (!this.ghosts.has(cur)) m.material = this.ghostOf(cur);
      m.castShadow = false;
    }
    for (const gm of this.clones.values()) { gm.opacity = op; gm.emissiveIntensity = 0.5 + 0.5 * level; }
  }
  /** solid again (for the next time anyone looks: nobody will) */
  restore(): void {
    for (const [m, mat] of this.orig) { m.material = mat; m.castShadow = this.cast.get(m) ?? true; }
    this.orig.clear();
    for (const gm of this.clones.values()) gm.dispose();
    this.clones.clear(); this.ghosts.clear();
  }
}

class Finale {
  running = true;
  private t = 0;
  private eyes: { m: THREE.Group; on: number; blink: number }[] = [];
  private ray: Npc | null;
  private stage = 0;
  private lantern: THREE.Object3D | null = null;
  private ghost: Ghost | null = null;
  private level = 0;
  private want = 0;
  private goneT = 0;
  private readonly _p = new THREE.Vector3();
  constructor(private g: Game, private W: StoryWorld) {
    this.ray = NPCS.get('ray') ?? null;
    clang(W.postTop, 1, 0.9); clang(W.postTop, 1, 1.8);
    think('It goes out over the lake and doesn\'t come back.', 3.5);
    g.timeScale = Math.min(g.timeScale, 30);
  }

  private spawnEyes(): void {
    const g = this.g, c = this.W.doorOut;
    const friends = VOICES.filter(([cr, r]) => g.journal.knows(cr, r)).length;
    const n = Math.min(22, 8 + friends * 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const geo = new THREE.PlaneGeometry(0.035, 0.022);
    for (let i = 0; i < n; i++) {
      const a = CAMP.yaw + Math.PI * 0.15 + (i / n) * Math.PI * 1.7 + Math.random() * 0.2;
      const r = 12 + Math.random() * 6;
      const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      const e = new THREE.Group();
      const s = 0.8 + Math.random() * 1.6;
      for (const ex of [-0.07, 0.07]) { const m = new THREE.Mesh(geo, mat); m.position.x = ex * s; m.scale.setScalar(s); e.add(m); }
      e.position.set(x, heightAt(x, z) + 0.35 + Math.random() * 1.9, z);
      e.lookAt(c.x, e.position.y, c.z);
      e.visible = false;
      g.scene.add(e);
      this.eyes.push({ m: e, on: i * 0.35 + Math.random() * 0.5, blink: 2 + Math.random() * 4 });
    }
  }

  private voices(): void {
    const g = this.g, c = this.W.doorOut;
    let k = 0;
    for (const [cr, r, snd] of VOICES) {
      if (!g.journal.knows(cr, r) && k > 2) continue;
      const a = CAMP.yaw + 0.6 + k * 0.7, p = new THREE.Vector3(c.x + Math.sin(a) * 15, 0, c.z + Math.cos(a) * 15);
      p.y = heightAt(p.x, p.z) + 1;
      if (snd in SOUNDS) audio.play(snd, { pos: p, vol: 0.7, delay: 0.5 + k * 1.3 });
      k++;
    }
  }

  private bigfootAtTreeline(): void {
    const b = (this.g.critters as unknown as { bigfoot?: { object: THREE.Object3D; pos?: THREE.Vector3 } } | null)?.bigfoot;
    if (!b) return;
    const c = this.W.doorOut, a = CAMP.yaw + 2.4;
    const p = new THREE.Vector3(c.x + Math.sin(a) * 15, 0, c.z + Math.cos(a) * 15);
    p.y = heightAt(p.x, p.z);
    b.object.position.copy(p); b.pos?.copy(p);
    b.object.lookAt(c.x, p.y, c.z);
    b.object.visible = true;
  }

  /** from the water's edge where his boot prints end, the lantern swinging, not quite all there */
  private rayWalksUp(): void {
    const W = this.W, ray = this.ray;
    if (!ray) return;
    ray.hidden = false;
    const edge = SHORE.edge.distanceTo(W.doorOut) < 45 ? SHORE.edge.clone() : W.dockEnd.clone().sub(W.doorOut).setY(0).normalize().multiplyScalar(16).add(W.doorOut);
    edge.y = heightAt(edge.x, edge.z);
    ray.model.root.position.copy(edge);
    ray.override = { at: W.doorOut.clone(), face: CAMP.yaw + Math.PI, anim: 'idle', speed: 0.8 };
    this.ghost = new Ghost(ray.model.root);
    this.ghost.set(0, this.t, 0);
    this.want = 1;
    // he carries the table's lantern up from the dock (its light goes with it: no new lights)
    const lamp = W.lamp.obj;
    try { this.lantern = lamp; ray.model.socket('L').add(lamp); lamp.position.set(0, -0.3, 0); lamp.rotation.set(0, 0, 0); lamp.scale.setScalar(0.85); } catch { /* no socket: it stays on the table */ }
    audio.play('amb_drone', { pos: edge, vol: 0.35 });
    puffs.emit(edge.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3(0, 0.2, 0), { size: 0.8, grow: 2.5, life: 5, color: new THREE.Color(0.7, 0.76, 0.86), alpha: 0.18, n: 5, spread: 0.6 });
    think('Somebody\'s coming up from the water. A lantern. ...I know that walk.', 4);
  }

  /** he goes the way he came: thinner and thinner, and the cold goes with him */
  private fade(dt: number): void {
    const ray = this.ray;
    this.want = 0;
    this.goneT += dt;
    if (ray && Math.random() < dt * 6) {
      ray.model.root.getWorldPosition(this._p);
      puffs.emit(this._p.add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 1.1, (Math.random() - 0.5) * 0.4)), new THREE.Vector3(0, 0.35, 0), { size: 0.3, grow: 3, life: 3.5, color: new THREE.Color(0.75, 0.8, 0.9), alpha: 0.16, rise: 0.3 });
    }
  }

  update(dt: number): void {
    if (!this.running) return;
    const g = this.g, W = this.W;
    this.t += dt;
    for (const e of this.eyes) {
      const on = this.t > e.on && (this.stage < 9 || this.t < e.on + 400);
      e.blink -= dt;
      if (e.blink < 0) e.blink = 2 + Math.random() * 5;
      e.m.visible = on && e.blink > 0.14;
    }
    // how much of him is here: in over a few seconds, out slower
    this.level += (this.want - this.level) * Math.min(1, dt * (this.want > this.level ? 0.5 : 0.35));
    if (this.ghost) this.ghost.set(this.level, this.t, dt);
    if (this.stage === 0 && this.t > 3) { this.stage = 1; this.spawnEyes(); this.voices(); }
    if (this.stage === 1 && this.t > 8) { this.stage = 2; this.bigfootAtTreeline(); think('They\'ve come to the edge of the firelight. All of them. Waiting.', 4); }
    if (this.stage === 2 && this.t > 13) { this.stage = 3; this.rayWalksUp(); }
    const ray = this.ray;
    if (this.stage === 3 && (!ray || ray.model.root.position.distanceTo(W.doorOut) < 0.6 || this.t > 100)) {
      this.stage = 4;
      ray?.model.root.position.copy(W.doorOut);
      ray?.say([
        'Smelled that from the dock. Let it catch on one side, did you? Good. They like it a bit burnt.',
        'Don\'t look at the big fella. He\'s shy, and he\'s eating.',
        'Sit, sit. You found the line, the camp and the hammer. Took me till I was forty to find the hammer, and it was hanging in the kitchen.',
      ]);
    }
    if (this.lantern && this.stage <= 4) { this.lantern.getWorldPosition(W.lamp.light.position); W.lamp.light.position.y += 0.2; W.lamp.level = 1; }
    if (this.stage === 4 && ray && !ray.busy) {
      this.stage = 5;
      // the lantern back on the table
      if (this.lantern) { W.lamp.light.position.copy(W.lamp.home); this.lantern.removeFromParent(); this.lantern.position.copy(W.lamp.home).add(new THREE.Vector3(0, -0.42, 0)); this.lantern.scale.setScalar(1); this.g.scene.add(this.lantern); this.lantern = null; }
      ray.override = { at: W.rayChair, face: W.rayFace, anim: 'sit', speed: 0.8 };
      ray.say([
        'My grandmother cooked here. When the Company left, she stayed. Somebody had to feed them.',
        'They\'re our stories, kid. Thirty winters of men at the bunkhouse stove making things up, and the bush believed every word.',
        'They don\'t want to scare anybody. They want what the men wanted. Supper, and somebody to tell it to.',
        'Don\'t make that face. I know what I am. I was there for it. April, in my own bunk, with the stove going. There are worse ways.',
        'I couldn\'t go till somebody rang it. Délima\'s rules. Whoever cooks here keeps the book.',
        'The cabin\'s yours. The plates, the book, the crew. Feed them hot. Tell them stories. Learn their rules: the book\'ll help, if it likes you.',
        'And here. Délima\'s recipe box. It\'s mostly grease stains, but they\'re good grease stains.',
        'You\'re the cook now. ...Tell Odile. Thursdays, nine o\'clock. She\'ll know.',
      ]);
    }
    if (this.stage === 5 && (!ray || !ray.busy)) {
      this.stage = 6;
      set(g, 'ending'); setNum(g, 'ending_day', g.day);
      // the recipe box: every card you haven't been given yet
      let delay = 0;
      for (const id of Object.keys(RECIPE_NAMES)) if (!has(g, `recipe:${id}`)) { setTimeout(() => giveRecipe(g, id, 'Délima'), (5 + delay) * 1000); delay += 1.6; }
      audio.play('bird_loon', { pos: SHORE.edge, vol: 0.6, delay: 1.2 });
    }
    if (this.stage === 6) {
      this.fade(dt);
      if (this.level < 0.03 || this.goneT > 12) {
        this.stage = 7;
        if (ray) { ray.hidden = true; ray.override = null; }
        this.ghost?.restore(); this.ghost = null;
        set(g, 'ray_gone');
        think('The bench is empty. The lantern\'s on the table where it always was. His bowl is clean.', 5.5);
        floatText.clearTitles();
        setTimeout(() => cineUI.title('BUSHED', 'Supper\'s on.', 7.5), 4200);
        noted(g, 'Pépère ate with his crew one last time.');
      }
    }
    if (this.stage === 7) {
      // the guests stay till you leave; then the night takes them back
      if (g.player.pos.distanceTo(W.doorOut) > 60 || (g.hour > 5 && g.hour < 12)) {
        this.stage = 9;
        for (const e of this.eyes) e.m.removeFromParent();
        this.eyes = [];
        this.running = false;
      }
    }
    if (!ray && this.stage === 3) this.stage = 5;
  }
}
