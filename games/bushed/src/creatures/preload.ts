// Preload every creature model before the creatures are constructed, without stalling the frame: each model comes
// from the IndexedDB cache when present, else it is built in ~30 ms slices (and cached). Constructors then use the
// loaded models instantly.
//   await preloadCreatures();                 // e.g. during the loading screen or the intro drive
//   new AxehandleHound({ ... });              // no build stall
import { houndModelAsync } from './hound';
import { bigfootModelAsync } from './bigfoot';

export interface PreloadOpts { cache?: boolean; onProgress?: (done: number, total: number, name: string) => void }
const extra: { name: string; load: (o: { cache?: boolean }) => Promise<unknown> }[] = [];
/** other creature modules register their model loaders here */
export function registerPreload(name: string, load: (o: { cache?: boolean }) => Promise<unknown>) { extra.push({ name, load }); }

export async function preloadCreatures(o: PreloadOpts = {}): Promise<void> {
  const all = [{ name: 'hound', load: houndModelAsync }, { name: 'bigfoot', load: bigfootModelAsync }, ...extra];
  let done = 0;
  for (const it of all) { await it.load({ cache: o.cache }); o.onProgress?.(++done, all.length, it.name); }
}
