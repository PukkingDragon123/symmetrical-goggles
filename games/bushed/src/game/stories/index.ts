// BUSHED's stories, installed in one call once the world, the town, the NPCs and the critters exist:
//
//   import { installStories } from './game/stories';
//   await step('stories', () => installStories(game));
//
// Adds: the main arc in five chapters (arc.ts) played through things in the world (world.ts: Pépère Ray's caches,
// his orange tape, the trapline and its plates, the abandoned Kettle camp, the dock, the finale where his spirit
// comes up from the water for supper), seven people with
// their own favours (people.ts, quests.ts), campfire tales that teach the Book rules, the mail at Pruneau's post
// wicket, CKLK's night call-in show on Ray's radio (radio.ts), and every page you find pasted back into Ray's book.
// All state is in game.flags (st:*), so it saves and loads with the rest of the game.
import * as THREE from 'three';
import type { Game } from '../game';
import { addNpc, npcTalkHooks, NPCS, type Npc } from '../npcs';
import { loadProp } from '../../places/props';
import { has, set, updateTapes, updateLods, think } from './kit';
import { buildStoryWorld } from './world';
import { spawnPeople, rayLook, jojoFound } from './people';
import { installQuests, folks } from './quests';
import { Arc, chapter, registerStoryItems } from './arc';
import { Radio } from './radio';
import { Mail, Campfire, composeBook, bookOpensAtStory, deliver, waitingMail } from './social';
import { CAMP, SETS, TRAP_HEAD, SHORE, LOOKOUT, HOLLIS_SEAT } from './sites';
import { TALES } from './tales';

/** what people say about the story once it has moved on (flag -> line), checked newest first */
const NEWS: Record<string, [string, string][]> = {
  gerard: [['ending', 'Odile says the line clicked on Thursday. At nine. I said it\'s the wiring. ...I\'m not so sure it\'s the wiring.'], ['letter', '"Gone up the line." That\'s what the old jacks said when a man died. Ray said it every time he went out to his plates. ...Pay for the coffee.']],
  marcel: [['ending', 'So it\'s you says goodnight to the trees now. ...Say it to him too. Doesn\'t hurt.'], ['camp', 'You found the old Kettle camp? I cut there one winter as a boy. The cook fed us like kings. She fed something else like kings too.']],
  hunter: [['ending', 'Heard the triangle on the north shore last night. Every hair on my arms stood up. In a good way, I think.'], ['camp_stove', 'That your smoke on the north shore? Something big sat on the hill all evening watching it. Happy, I\'d say. If big things get happy.']],
  doug: [['ending', 'Jojo says she saw an old man with a lantern on the lake road last night. I told her it was a reflection. It\'s always a reflection.']],
  esko: [['ending', 'Fool. Good fool.']],
  megan: [['ending', 'I\'ve closed the file on the camp lights. Under "cause" I wrote "family". Nobody\'s asked.']],
  lucien: [['supper', 'They tell me you cooked for the camp. Hot? Good. Not scraps? Good.']],
  hollis: [['ending', 'Délima would be pleased. She\'d never say so. She\'d just give you more potatoes to peel.']],
  ray: [['supper', 'Go on, eat. I\'m fine here. I\'m watching my crew eat.']],
};
const RAY_IDLE = ['Pass the salt. ...None? Délima would\'ve had salt.', 'Knock three times on your way out. Manners.', 'Don\'t look at the big fella. He\'s eating.'];

export async function installStories(game: Game): Promise<void> {
  const g = game;
  registerStoryItems(g);
  const W = buildStoryWorld(g);
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  await yieldFrame();
  const mail = new Mail(g);
  // who answers first: Jojo found by the Kettle, Odile with the mail, then the favours, then the news
  npcTalkHooks.push((gg, n) => jojoFound(gg, n));
  npcTalkHooks.push((_gg, n) => mail.odile(n));
  const questTick = installQuests(g);
  npcTalkHooks.push((gg, n) => {
    const news = NEWS[n.def.id]?.find(([f]) => has(gg, f));
    if (n.def.id === 'ray') return [news && Math.random() < 0.5 ? news[1] : RAY_IDLE[Math.floor(Math.random() * RAY_IDLE.length)]];
    return news && Math.random() < 0.45 && !has(gg, `news:${n.def.id}:${news[0]}`) ? (set(gg, `news:${n.def.id}:${news[0]}`), [news[1]]) : null;
  });
  spawnPeople(g);
  await yieldFrame();
  // Pépère: nowhere, until somebody rings for supper (then his spirit walks up from the dock; arc.ts, Finale)
  addNpc(g, { id: 'ray', name: 'Pépère', look: rayLook(), hidden: true, stops: [{ from: 0, to: 24, at: W.rayChair, face: W.rayFace, anim: 'sit' }], talk: () => RAY_IDLE[0] });
  await yieldFrame();
  // the radios: Ray's valve set on the cabin desk (it can call in), and the one behind the store counter
  const radio = new Radio(g);
  const desk = g.cabin?.anchors?.journal_desk as THREE.Object3D | undefined;
  if (desk) {
    try {
      const r = await loadProp('vintage_radio_transceiver');
      r.scale.setScalar(0.62); r.position.set(0.32, 0, 0.02); r.rotation.y = -0.25;
      desk.add(r);
      radio.add(r, 'Ray\'s radio', true);
    } catch { /* no prop */ }
  }
  const found: THREE.Object3D[] = [];
  g.store?.group.traverse((o) => { if (o.userData.propId === 'vintage_radio_transceiver') found.push(o); });
  if (found[0]) radio.add(found[0], 'the radio');
  const arc = new Arc(g, W);
  const fire = new Campfire(g);
  bookOpensAtStory(g);
  let sig = '', t = 0, tq = 0, clock = 0;
  const signature = () => [chapter(g), ...folks(g).map((f) => f.text + f.done), [...g.flags].filter((f) => f.startsWith('st:page:') || f.startsWith('st:tale:') || f.startsWith('st:mail:') || f.startsWith('st:set:') || f.startsWith('st:plate:fed')).sort().join(',')].join('|');
  g.updaters.push((dt) => {
    clock += dt;
    arc.update(dt);
    mail.update(dt);
    fire.update(dt);
    updateTapes(g, clock);
    tq -= dt;
    if (tq <= 0) { tq = 1; questTick(); }
    t -= dt;
    if (t <= 0) {
      t = 1;
      const s = signature();
      if (s !== sig) { sig = s; composeBook(g); }
      updateLods(g.player.pos.x, g.player.pos.z);
    }
  });
  composeBook(g);
  updateLods(g.player.pos.x, g.player.pos.z);
  // for tests and the curious: window.__stories
  (window as unknown as { __stories: unknown }).__stories = {
    g, W, arc, radio, fire, mail, NPCS, TALES,
    sites: { CAMP, SETS, TRAP_HEAD, SHORE, LOOKOUT, HOLLIS_SEAT },
    has: (f: string) => has(g, f), set: (f: string) => set(g, f), deliver: (id: string) => deliver(g, id), waiting: () => waitingMail(g),
    chapter: () => chapter(g), compose: () => composeBook(g), think,
    talk: (id: string) => { const n = NPCS.get(id) as Npc | undefined; if (!n) return; n.model.root.userData.__interact?.use?.({ held: '', point: n.model.root.position, game: g }); },
  };
}
