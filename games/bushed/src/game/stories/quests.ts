// Side stories: each person has a short chain of favours. Talking to them offers the next one (when it's
// available), nags while it's open, and pays when you come back with it done: money, a page for the book, or a
// recipe card. State lives in game.flags: st:q:<chain>:<step>:on / :ready / :done.
import type { Game } from '../game';
import { npcTalkHooks, NPCS, type Npc } from '../npcs';
import { has, set, noted, think } from './kit';

export interface QStep {
  id: string;
  /** the line in the book's "Folks" list */
  todo: string;
  /** offered only once this holds */
  requires?: (g: Game) => boolean;
  /** what they say when they ask */
  give: string[];
  /** what they say while it's open */
  nag?: string[];
  /** is it done? (checked when you talk to them, and every second for the "they'll want to know" thought) */
  done: (g: Game) => boolean;
  /** on hand-in: take the goods */
  take?: (g: Game) => void;
  thanks: string[];
  reward?: (g: Game) => void;
  /** once, when offered (spawn the thing to find, move somebody) */
  start?: (g: Game) => void;
  /** finished in the same breath it's offered */
  instant?: boolean;
  /** who it's handed in to, if not the asker */
  by?: string;
  /** the thought when it's ready to hand in */
  ready?: string;
}
export interface Chain { id: string; npc: string; who: string; steps: QStep[] }

export const CHAINS: Chain[] = [];

const key = (c: Chain, s: QStep, k: 'on' | 'ready' | 'done') => `q:${c.id}:${s.id}:${k}`;

/** the chain's next step (null when it's all done) */
export function current(g: Game, c: Chain): QStep | null { return c.steps.find((s) => !has(g, key(c, s, 'done'))) ?? null; }
export function isOn(g: Game, c: Chain, s: QStep): boolean { return has(g, key(c, s, 'on')) && !has(g, key(c, s, 'done')); }
export function isDone(g: Game, chain: string, step: string): boolean { return has(g, `q:${chain}:${step}:done`); }

function complete(g: Game, c: Chain, s: QStep, n: Npc, pre: string[] = []): void {
  s.take?.(g);
  set(g, key(c, s, 'done'));
  n.say([...pre, ...s.thanks]);
  // the reward lands with the last line of thanks ("Here: my dad's flapjacks"), not before
  const lines = [...pre, ...s.thanks];
  const delay = lines.slice(0, -1).reduce((t, l) => t + Math.min(9, 2.2 + l.split(/\s+/).length * 0.3) + 0.6, 0);
  setTimeout(() => { s.reward?.(g); noted(g, `${c.who}: ${s.todo.charAt(0).toLowerCase()}${s.todo.slice(1)}. Done.`); }, (delay + 0.8) * 1000);
}

function talk(g: Game, n: Npc): string[] | null {
  for (const c of CHAINS) {
    const s = current(g, c);
    if (!s) continue;
    const handIn = s.by ?? c.npc;
    if (!has(g, key(c, s, 'on'))) {
      if (c.npc !== n.def.id || (s.requires && !s.requires(g))) continue;
      set(g, key(c, s, 'on'));
      s.start?.(g);
      if (s.instant) { complete(g, c, s, n, s.give); return []; }
      noted(g, `${c.who}: ${s.todo.charAt(0).toLowerCase()}${s.todo.slice(1)}.`);
      return s.give;
    }
    if (handIn !== n.def.id) continue;
    if (s.done(g)) { complete(g, c, s, n); return []; }
    if (s.nag?.length && Math.random() < 0.7) return [s.nag[Math.floor(Math.random() * s.nag.length)]];
  }
  return null;
}

/** what's open and what's done, for the book */
export function folks(g: Game): { text: string; done: boolean }[] {
  const out: { text: string; done: boolean }[] = [];
  for (const c of CHAINS) for (const s of c.steps) {
    if (!has(g, key(c, s, 'on'))) continue;
    out.push({ text: `${c.who}: ${s.todo}`, done: has(g, key(c, s, 'done')) });
  }
  // open ones first, then the most recent done
  return [...out.filter((x) => !x.done), ...out.filter((x) => x.done).slice(-4)];
}

export function installQuests(g: Game): () => void {
  npcTalkHooks.push((game, n) => { const r = talk(game, n); return r === null ? null : r.length ? r : ['']; });
  // "they'll want to hear about that"
  return () => {
    for (const c of CHAINS) for (const s of c.steps) {
      if (!isOn(g, c, s) || has(g, key(c, s, 'ready')) || s.instant) continue;
      if (s.done(g)) { set(g, key(c, s, 'ready')); think(s.ready ?? `${NPCS.get(s.by ?? c.npc)?.name ?? c.who} will want to hear about that.`, 3.5); }
    }
  };
}
