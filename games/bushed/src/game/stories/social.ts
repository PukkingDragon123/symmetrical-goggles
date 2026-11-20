// Talk and paper: the mail at Pruneau's post wicket (Odile hands it over, or you check Ray's cubbyhole), the
// campfire tales at the campground after dark (one a night; each teaches the Book a rule), and the story's pages
// in Ray's book (the chapter's to-do, the folks who've asked you for something, every page you've found, and
// the tales you've heard).
import * as THREE from 'three';
import type { Game } from '../game';
import type { Block } from '../../ui/paper';
import { SPOTS } from '../../world/layout';
import { NPCS, chatter, type Npc } from '../npcs';
import { registerInteractable } from '../interact';
import { has, set, num, setNum, think, noted, setBookPages, storyDirty, cleanStory } from './kit';
import { LETTERS, PAGES } from './text';
import { TALES, type Tale } from './tales';
import { folks, isDone } from './quests';
import { todoBlocks } from './arc';

// ---------------------------------------------------------------------------------------------- mail
const after = (g: Game, days: number) => has(g, 'ending') && g.day >= (num(g, 'ending_day') ?? 999) + days;
const MAIL: { id: string; when: (g: Game) => boolean }[] = [
  { id: 'ray', when: () => true },
  { id: 'township', when: (g) => g.day >= 1 },
  { id: 'lise', when: (g) => g.day >= 2 },
  { id: 'ministry', when: (g) => g.day >= 2 && !has(g, 'q:megan:wellness:on') },
  { id: 'company', when: (g) => has(g, 'camp') },
  { id: 'listener', when: (g) => isDone(g, 'odile', 'caller') },
  { id: 'lachance', when: (g) => g.contracts.some((c) => c.id === 'lost_axe' && c.state === 'paid') },
  { id: 'jojo', when: (g) => isDone(g, 'doug', 'jojo') },
  { id: 'post1', when: (g) => after(g, 1) },
  { id: 'post2', when: (g) => after(g, 3) },
  { id: 'post3', when: (g) => after(g, 5) },
  { id: 'post4', when: (g) => after(g, 7) },
];
export function waitingMail(g: Game): string[] { return MAIL.filter((m) => !has(g, `mail:${m.id}`) && m.when(g)).map((m) => m.id); }

export function deliver(g: Game, id: string): void {
  const L = LETTERS[id];
  if (!L || !set(g, `mail:${id}`)) return;
  g.readPaper(L.blocks, L.seed);
  if (id === 'ray') { set(g, 'letter'); noted(g, 'Ray\'s letter. Into the book.'); }
  else if (id.startsWith('post')) noted(g, 'A postcard from Kissimmee. Into the book.');
}

export class Mail {
  private t = 0;
  constructor(private g: Game) {
    // Ray's cubbyhole: the drawer cabinet behind the counter
    const found: THREE.Object3D[] = [];
    g.store?.group.traverse((o) => { if (o.userData.propId === 'drawer_cabinet') found.push(o); });
    if (found[0]) registerInteractable(found[0], {
      kind: 'container', reach: 3.2,
      label: () => { const n = waitingMail(g).length; return n ? `Ray's cubbyhole (${n} letter${n > 1 ? 's' : ''})` : 'Ray\'s cubbyhole'; },
      use: () => { const w = waitingMail(g); if (w.length) deliver(g, w[0]); else think('Empty. A dead moth and the smell of stamps.', 2.5); },
    });
  }
  /** Odile hands it over */
  odile(n: Npc): string[] | null {
    if (n.def.id !== 'odile') return null;
    const w = waitingMail(this.g);
    if (!w.length) return null;
    const id = w[0];
    setTimeout(() => deliver(this.g, id), 1800);
    return [id === 'ray' ? 'Ah. You\'re the kid. This came for you. Well. It says "the kid, at Ray\'s". That\'s you.' : id.startsWith('post') ? 'A postcard. From Florida. I read it. Of course I read it.' : 'Mail. For you, or for Ray, which up here is the same thing now.'];
  }
  update(dt: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const g = this.g, st = SPOTS.store;
    if (Math.hypot(g.player.pos.x - st.x, g.player.pos.z - st.z) > 26) return;
    for (const id of waitingMail(g)) if (set(g, `mailseen:${id}`)) { think(id === 'ray' ? 'Ray said Pruneau\'s does the mail. Something in his cubbyhole?' : 'There\'s mail in Ray\'s cubbyhole.', 3); break; }
  }
}

// ---------------------------------------------------------------------------------------------- campfire tales
const TELLERS = ['hollis', 'marcel', 'esko', 'megan', 'doug', 'hunter'];
export class Campfire {
  private t = 0;
  telling: { tale: Tale; npc: Npc } | null = null;
  constructor(private g: Game) {}

  private atFire(n: Npc | undefined): boolean {
    if (!n || n.hidden) return false;
    const cs = SPOTS.campsite, p = n.model.root.position;
    return Math.hypot(p.x - cs.x, p.z - cs.z) < 3.4;
  }

  /** the next tale and its teller (null if nobody's there to tell one) */
  pick(): { tale: Tale; npc: Npc } | null {
    const g = this.g;
    const present = TELLERS.map((id) => NPCS.get(id)).filter((n): n is Npc => this.atFire(n));
    if (!present.length) return null;
    const untold = TALES.filter((t) => !has(g, `tale:${t.id}`) && (!t.after || has(g, t.after)));
    if (!untold.length) return null;
    const teaches = (t: Tale) => !t.critter || !g.journal.knows(t.critter, t.rule!);
    const byTeller = (t: Tale) => t.tellers.map((id) => present.find((n) => n.def.id === id)).find(Boolean);
    // the camp's own story first, once it's earned; then rules you don't know, told by the right voice
    const order = [...untold.filter((t) => !t.critter), ...untold.filter((t) => t.critter && teaches(t)), ...untold.filter((t) => t.critter && !teaches(t))];
    for (const t of order) { const n = byTeller(t); if (n) return { tale: t, npc: n }; }
    const t = order.find((x) => x.critter);
    return t ? { tale: t, npc: present[0] } : null;
  }

  start(tale: Tale, npc: Npc): void {
    this.telling = { tale, npc };
    npc.hush();
    const cs = SPOTS.campsite;
    chatter.quietAt = new THREE.Vector3(cs.x, npc.model.root.position.y, cs.z);
    think(`${npc.name} leans in to the fire. "${tale.title}."`, 3.5);
    setTimeout(() => { if (this.telling?.npc === npc) npc.say(tale.lines, 1.0); }, 2600);
  }

  update(dt: number): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const g = this.g, cs = SPOTS.campsite, p = g.player.pos;
    const d = Math.hypot(p.x - cs.x, p.z - cs.z);
    const nightId = g.hour < 12 ? g.day - 1 : g.day;
    if (this.telling) {
      const { tale, npc } = this.telling;
      if (d > 18) { npc.hush(); this.telling = null; chatter.quietAt = null; return; }
      if (!npc.busy && this.telling.npc.model) {
        // a beat after the last line
        if (!has(g, `tale:${tale.id}`)) {
          set(g, `tale:${tale.id}`);
          setNum(g, 'tale_night', nightId);
          if (tale.critter && tale.rule) g.journal.learn(tale.critter, tale.rule);
          noted(g, `Told at the fire: "${tale.title}".`);
        }
        this.telling = null;
        chatter.quietAt = null;
      }
      return;
    }
    const night = g.hour >= 19.3 || g.hour < 0.8;
    if (!night || d > 7 || num(g, 'tale_night') === nightId) return;
    const pk = this.pick();
    if (pk) this.start(pk.tale, pk.npc);
  }
}

// ---------------------------------------------------------------------------------------------- the book
const ORDER = ['ray1', 'ray2', 'ray3', 'ray4', 'ledger', 'notice', 'ray5', 'ray6', 'esko', 'crew', 'trailcam', 'jojo'];
let storyPage: Block[] = [];
export function composeBook(g: Game): void {
  const pages: Block[][] = [];
  const td = todoBlocks(g);
  storyPage = [
    { t: 'h', text: 'Ray\'s trail' },
    { t: 'small', text: td.title },
    { t: 'gap', h: 4 },
    ...td.lines.map((l): Block => ({ t: 'p', text: `${l.done ? '' : '— '}${l.text}`, struck: l.done, hand: 'patrick' })),
  ];
  const f = folks(g).slice(0, 7);
  storyPage.push({ t: 'line' }, { t: 'small', text: 'Folks' });
  if (f.length) for (const x of f) storyPage.push({ t: 'p', text: x.text, struck: x.done, hand: 'patrick' });
  else storyPage.push({ t: 'p', text: 'Nobody has asked me for anything yet. Give it a day.', hand: 'patrick' });
  pages.push(storyPage);
  if (has(g, 'mail:ray')) pages.push(LETTERS.ray.blocks);
  for (const id of ORDER) if (has(g, `page:${id}`)) pages.push(PAGES[id].blocks);
  for (const id of ['post1', 'post2', 'post3', 'post4']) if (has(g, `mail:${id}`)) pages.push(LETTERS[id].blocks);
  const told = TALES.filter((t) => has(g, `tale:${t.id}`));
  for (let i = 0; i < told.length; i += 4) {
    pages.push([
      { t: 'h', text: i ? 'Told at the fire (cont.)' : 'Told at the fire' },
      ...told.slice(i, i + 4).flatMap((t): Block[] => [{ t: 'p', text: t.title, hand: 'patrick' }, { t: 'small', text: t.gist }]),
    ]);
  }
  setBookPages(g, pages);
}

/** open the book at "Ray's trail" when something new went in (unless the Book has its own writing to do) */
export function bookOpensAtStory(g: Game): void {
  const j = g.journal as unknown as { toggle(): void; open: boolean; goto(i: number): void; pages?: { k: string; blocks?: Block[] }[]; pendingWrites?: unknown[] };
  const orig = j.toggle.bind(j);
  j.toggle = () => {
    orig();
    if (!j.open || !storyDirty || j.pendingWrites?.length) return;
    const i = j.pages?.findIndex((p) => p.k === 'blocks' && p.blocks === storyPage) ?? -1;
    if (i >= 0) j.goto(i);
    cleanStory();
  };
}
