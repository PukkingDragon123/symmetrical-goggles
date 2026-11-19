// Forge: materials you buy (or make), what you forge, and how it changes the tools. Tool upgrades and damage live
// in game.flags so they survive saves (flags are saved):
//   'bit:<toolId>:<q>'  a new hand-forged felling bit steeled on (q 0..1): bites deeper, swings a touch quicker,
//                       takes a keener edge (sharpening goes to 1.0 instead of 0.92)
//   'chewed:<toolId>'   the Axehandle Hound chewed the handle: it flexes and stings (slower swing, less bite)
//                       until you re-hang the head on a new hickory handle
// Owning forged hardware helps too: log dogs hold a log on the sawbuck (the bow saw cuts faster), a splitting
// wedge opens knotty rounds (more split for the maul and splitting axe).
import { addItems, ITEMS, type ItemDef, type ToolStats } from '../items';
import type { Game } from '../game';

export const FORGE_ITEMS: Record<string, ItemDef> = {
  iron_stock: { id: 'iron_stock', name: 'Mild steel bar', desc: 'A metre of half-inch square bar. Hooks, nails, dogs and wedges.', price: 5, mass: 1.0, model: 'gen:iron_bar', pocket: true, tags: ['smithing'] },
  tool_steel: { id: 'tool_steel', name: 'High-carbon steel', desc: 'An old leaf spring, the best steel there is for an axe bit. Hardens like glass.', price: 16, mass: 1.2, model: 'gen:leaf_spring', pocket: true, tags: ['smithing'] },
  axe_handle: { id: 'axe_handle', name: 'Hickory axe handle', desc: '32 inches of straight-grained hickory with a wooden wedge. Something out there would love to chew it.', price: 14, mass: 0.9, model: 'gen:axe_handle', pocket: false, tags: ['smithing', 'handle'] },
  coal: { id: 'coal', name: 'Smithing coal', desc: 'A sack of bituminous coal. Burns hotter and longer than charcoal.', price: 12, mass: 9, model: 'gen:coal_sack', pocket: false, tags: ['fuel'] },
  charcoal: { id: 'charcoal', name: 'Lump charcoal', desc: 'A sack of hardwood charcoal. Clean and quick. Make your own in the retort.', price: 7, sell: 4, mass: 4, model: 'gen:charcoal_sack', pocket: false, tags: ['fuel'] },
  iron_hooks: { id: 'iron_hooks', name: 'Iron S-hooks', desc: 'Three hand-forged hooks. Hang meat to smoke, pots over the fire, the lantern.', price: 0, sell: 7, mass: 0.3, model: 'gen:s_hooks', pocket: true, tags: ['forged'] },
  nails: { id: 'nails', name: 'Hand-forged nails', desc: 'A dozen square nails with rosehead tops. Pruneau pays well for them.', price: 0, sell: 9, mass: 0.3, model: 'gen:nails', pocket: true, tags: ['forged'] },
  log_dogs: { id: 'log_dogs', name: 'Log dogs', desc: 'A pair of iron staples that pin a log to the sawbuck. The saw runs straight and fast.', price: 0, sell: 12, mass: 1.2, model: 'gen:log_dog', pocket: true, tags: ['forged'] },
  wedge: { id: 'wedge', name: 'Splitting wedge', desc: 'A hardened steel wedge. Knotty rounds give up.', price: 0, sell: 14, mass: 2.0, model: 'gen:file', pocket: true, tags: ['forged'] },
};

export function registerForgeItems(): void {
  const add: Record<string, ItemDef> = {};
  for (const [k, v] of Object.entries(FORGE_ITEMS)) if (!ITEMS[k]) add[k] = v;
  addItems(add);
}

/** the axes a forged bit or a new handle can go on */
export function axeIds(g: Game): string[] {
  return Object.values(ITEMS).filter((d) => d.tool && (d.tool.kind === 'axe' || d.tool.kind === 'splitter' || d.tool.kind === 'hatchet') && g.owns(d.id)).map((d) => d.id);
}

export function bitQuality(g: Game, id: string): number {
  for (const f of g.flags) if (f.startsWith(`bit:${id}:`)) return Number(f.split(':')[2]) || 0;
  return 0;
}
export function setBit(g: Game, id: string, q: number): void {
  for (const f of [...g.flags]) if (f.startsWith(`bit:${id}:`)) g.flags.delete(f);
  g.flags.add(`bit:${id}:${q.toFixed(2)}`);
}
/** the best edge a tool can take on the grindstone */
export function maxSharp(g: Game, id: string): number { return bitQuality(g, id) > 0 ? 0.92 + 0.08 * bitQuality(g, id) : 0.92; }

/** the hound chewed this tool's handle (integrator: call when the hound gives an axe back) */
export function chewHandle(g: Game, id: string): void { g.flags.add(`chewed:${id}`); }

// ---------------------------------------------------------------------------------------------- tool modifiers
const BASE = new Map<string, Omit<ToolStats, 'sharp'>>();

/** re-derive every tool's stats from its base and the forge's flags / owned hardware (cheap; run every second) */
export function applyToolMods(g: Game): void {
  for (const d of Object.values(ITEMS)) {
    const t = d.tool;
    if (!t) continue;
    let b = BASE.get(d.id);
    if (!b) { const { sharp: _s, ...rest } = t; b = { ...rest }; BASE.set(d.id, b); }
    const bit = bitQuality(g, d.id), chewed = g.flags.has(`chewed:${d.id}`);
    t.fell = b.fell * (1 + 0.28 * bit) * (chewed ? 0.85 : 1);
    t.limb = b.limb * (1 + 0.15 * bit) * (chewed ? 0.9 : 1);
    t.swingTime = b.swingTime - 0.03 * bit + (chewed ? 0.06 : 0);
    t.stamina = b.stamina * (chewed ? 1.15 : 1);
    t.split = b.split * (g.owns('wedge') && (t.kind === 'maul' || t.kind === 'splitter') ? 1.25 : g.owns('wedge') && t.kind === 'axe' ? 1.1 : 1);
    if (t.kind === 'saw' && g.owns('log_dogs')) { t.fell = b.fell * 1.35; t.limb = b.limb * 1.2; t.stamina = b.stamina * 0.8; }
  }
}
