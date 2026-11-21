// Bridge to the pixel-art loading screen (the cabin at night, the lumberjack and the tree). index.html starts it
// before any module has loaded, as window.__bushedLoading; this file only reports real progress to it.
// Progress is weighted by how long each boot step takes (measured), so the % moves at an even pace; while a step
// runs the screen creeps toward the step's end, never past it.

interface Screen {
  set(p: number, next: number): void;
  done(): Promise<void>;
  hide(): void;
}
const screen = (): Screen | null => ((window as unknown as { __bushedLoading?: Screen }).__bushedLoading ?? null);

/** step -> weight (≈ share of a warm boot); the module download/parse before this file runs is the first 6 % */
const PLAN: Record<string, number> = {
  script: 6, fonts: 2, game: 7, physics: 3, terrain: 6, forest: 14, cabin: 9, jeep: 5, props: 6,
  arms: 3, products: 1, 'cabin play': 2, shaders: 26, 'first frame': 10,
};
const total = Object.values(PLAN).reduce((a, b) => a + b, 0);
const ended = new Set<string>(['script']);
const running = new Set<string>();

function sum(s: Set<string>): number { let n = 0; for (const k of s) n += PLAN[k] ?? 0; return n; }
function push(): void {
  const p = sum(ended) / total, next = (sum(ended) + sum(running)) / total;
  try { screen()?.set(Math.min(0.995, p), Math.min(0.995, Math.max(p, next))); } catch { /* the screen is optional */ }
}

export const loading = {
  begin(step: string): void { running.add(step); push(); },
  end(step: string): void { running.delete(step); ended.add(step); push(); },
  /** run f as a named step */
  async step<T>(step: string, f: () => Promise<T> | T): Promise<T> {
    loading.begin(step);
    try { return await f(); } finally { loading.end(step); }
  },
  /** 100 %: the tree falls, then the screen fades away by itself (the game keeps running underneath) */
  done(): Promise<void> {
    const s = screen();
    if (!s) return Promise.resolve();
    try { return s.done().catch(() => undefined); } catch { return Promise.resolve(); }
  },
};
push();
