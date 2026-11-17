// Director: tiny coroutine runner for scripted beats (menu, intro, encounters). Each beat is an async function
// that awaits conditions or time; the game ticks the director every frame.
type Waiter = { cond: () => boolean; resolve: () => void };

export class Director {
  private waiters: Waiter[] = [];
  private t = 0;
  private flags = new Set<string>();

  /** resolve when cond() becomes true (checked every frame) */
  until(cond: () => boolean): Promise<void> {
    if (cond()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ cond, resolve }));
  }

  sleep(seconds: number): Promise<void> {
    const end = this.t + seconds;
    return this.until(() => this.t >= end);
  }

  /** wait for cond, or give up after `timeout` seconds; returns whether cond happened */
  async either(cond: () => boolean, timeout: number): Promise<boolean> {
    const end = this.t + timeout;
    await this.until(() => cond() || this.t >= end);
    return cond();
  }

  flag(f: string): void { this.flags.add(f); }
  has(f: string): boolean { return this.flags.has(f); }
  once(f: string): boolean { if (this.flags.has(f)) return false; this.flags.add(f); return true; }

  update(dt: number): void {
    this.t += dt;
    const ready = this.waiters.filter((w) => w.cond());
    if (ready.length) {
      this.waiters = this.waiters.filter((w) => !ready.includes(w));
      for (const w of ready) w.resolve();
    }
  }

  get time(): number { return this.t; }
}
