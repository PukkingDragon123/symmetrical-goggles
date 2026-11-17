// Money moves physically. Buying: carry goods from the shelves to the counter, ring them up at the register,
// they go in a paper bag you carry out. Selling: timber you leave on the log deck behind the store is scaled
// (volume x species price x quality: rot, chewed ends and axe-mangled ends cost you; clean saw cuts pay more);
// mushrooms and berries are weighed on the counter scale.
import { ITEMS, TIMBER_PRICE } from './items';
import type { WoodPiece } from '../chop/wood';
import { ODILE, line } from './dialogue';

export interface Sale { total: number; lines: string[]; remark: string }

/** scale the logs on the deck */
export function scaleTimber(pieces: WoodPiece[]): Sale {
  let total = 0;
  const lines: string[] = [];
  const bySpecies = new Map<string, { vol: number; val: number; n: number; rotten: number }>();
  for (const p of pieces) {
    const sp = p.spec.species;
    const v = p.value(TIMBER_PRICE[sp] ?? 60);
    const e = bySpecies.get(sp) ?? { vol: 0, val: 0, n: 0, rotten: 0 };
    e.vol += p.volume; e.val += v; e.n++; if (p.quality < 0.5) e.rotten++;
    bySpecies.set(sp, e);
    total += v;
  }
  for (const [sp, e] of bySpecies) lines.push(`${e.n} ${sp} — ${e.vol.toFixed(2)} m³ — $${e.val.toFixed(2)}`);
  // what Odile says depends on the best (or worst) of the lot
  const species = [...bySpecies.keys()];
  const anyRotten = [...bySpecies.values()].some((e) => e.rotten > 0);
  let remark = '';
  if (anyRotten) remark = line(ODILE.sellRotten, 'rot');
  else if (species.includes('birch')) remark = line(ODILE.sellBirch, 'birch');
  else if (species.includes('cedar')) remark = line(ODILE.sellCedar, 'cedar');
  else if (species.includes('pine')) remark = line(ODILE.sellPine, 'pine');
  else if (species.includes('fir')) remark = line(ODILE.sellFir, 'fir');
  else if (species.length) remark = line(ODILE.sellSpruce, 'spruce');
  return { total: Math.round(total * 100) / 100, lines, remark };
}

/** ring up goods on the counter */
export function ringUp(items: string[]): Sale {
  let total = 0;
  const lines: string[] = [];
  for (const id of items) { const d = ITEMS[id]; if (!d) continue; total += d.price; lines.push(`${d.name}  $${d.price.toFixed(2)}`); }
  let remark = line(ODILE.buy, 'buy');
  if (items.includes('jerky')) remark = line(ODILE.buyJerky, 'jerky');
  else if (items.some((i) => ITEMS[i]?.tool?.kind === 'axe')) remark = line(ODILE.buyAxe, 'axe');
  return { total, lines, remark };
}

/** pay for forage on the scale */
export function weighForage(items: string[]): Sale {
  let total = 0;
  const lines: string[] = [];
  for (const id of items) { const d = ITEMS[id]; if (!d?.sell) continue; total += d.sell; lines.push(`${d.name}  $${d.sell.toFixed(2)}`); }
  return { total, lines, remark: items.includes('chanterelle') ? line(ODILE.sellMushrooms, 'mush') : line(ODILE.buy, 'buy') };
}
