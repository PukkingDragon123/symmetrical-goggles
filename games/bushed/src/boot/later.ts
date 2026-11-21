// Work that is not needed for the first view (distant places, creatures, story props, Book portraits...) runs after
// the player is in control: one task at a time, each started between two frames, so a frame never carries more
// than one task's synchronous part (the long builders slice themselves). Tasks run in the order they were added.
import { mark } from './timing';

interface Task { label: string; fn: () => unknown; resolve: () => void }

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class Later {
  private q: Task[] = [];
  private running = false;
  private started = false;
  private idle: Promise<void> = Promise.resolve();
  private settle: (() => void) | null = null;
  private readonly named = new Map<string, Promise<void>>();
  /** called before every task starts */
  before: ((label: string) => void) | null = null;
  /** called after every task (re-apply quality rules, balance lights...) */
  after: ((label: string) => void) | null = null;
  /** called when the queue runs dry */
  drained: (() => void) | null = null;

  /** queue a task; the promise resolves when it has run (errors are logged, never thrown) */
  add(label: string, fn: () => unknown): Promise<void> {
    const p = new Promise<void>((resolve) => this.q.push({ label, fn, resolve }));
    this.named.set(label, p);
    if (!this.settle) this.idle = new Promise<void>((r) => { this.settle = r; });
    if (this.started) void this.pump();
    return p;
  }

  /** the promise of a named task (resolved at once if there is none) */
  task(label: string): Promise<void> { return this.named.get(label) ?? Promise.resolve(); }
  /** every task queued so far */
  all(): Promise<void> { return this.q.length || this.running ? this.idle : Promise.resolve(); }
  get busy(): boolean { return this.running || this.q.length > 0; }

  start(): void { this.started = true; void this.pump(); }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.q.length) {
      await nextFrame();
      const t = this.q.shift()!;
      const t0 = performance.now();
      try { this.before?.(t.label); } catch (e) { console.warn('[boot] before', e); }
      try { await t.fn(); } catch (e) { console.warn(`[boot] later ${t.label} failed`, e); }
      mark('later:' + t.label, t0);
      try { this.after?.(t.label); } catch (e) { console.warn('[boot] after', e); }
      t.resolve();
    }
    this.running = false;
    const s = this.settle; this.settle = null; s?.();
    try { this.drained?.(); } catch { /* ignore */ }
  }
}
