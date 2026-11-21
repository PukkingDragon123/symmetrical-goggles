// Preload every creature model before the creatures are constructed, without stalling the frame: each model comes
// from the IndexedDB cache when present, else it is built in ~30 ms slices (and cached). Constructors then use the
// loaded models instantly.
//   await preloadCreatures();                 // e.g. after the first frame (main.ts runs it as a deferred task)
//   new AxehandleHound({ ... });              // no build stall
// Loaders run a few at a time: cache reads and .glb downloads wait on I/O, so they overlap each other and the
// sliced builders; the builders themselves still share the main thread in slices, so the frame stays smooth.
import { houndModelAsync } from './hound';
import { bigfootModelAsync } from './bigfoot';
import { wildModelsAsync } from './wildlife/models';

export interface PreloadOpts { cache?: boolean; onProgress?: (done: number, total: number, name: string) => void; concurrency?: number }
const extra: { name: string; load: (o: { cache?: boolean }) => Promise<unknown> }[] = [];
/** other creature modules register their model loaders here */
export function registerPreload(name: string, load: (o: { cache?: boolean }) => Promise<unknown>) { extra.push({ name, load }); }

export async function preloadCreatures(o: PreloadOpts = {}): Promise<void> {
  // the cabin's own creatures first, then the rest in registration order
  const all = [{ name: 'hound', load: houndModelAsync }, { name: 'bigfoot', load: bigfootModelAsync }, { name: 'wildlife', load: wildModelsAsync }, ...extra];
  let done = 0, next = 0;
  const worker = async (): Promise<void> => {
    while (next < all.length) {
      const it = all[next++];
      try { await it.load({ cache: o.cache }); } catch (e) { console.warn(`[creatures] preload ${it.name} failed`, e); }
      o.onProgress?.(++done, all.length, it.name);
    }
  };
  const n = Math.max(1, Math.min(o.concurrency ?? 3, all.length));
  await Promise.all(Array.from({ length: n }, worker));
}
