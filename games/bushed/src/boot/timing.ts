// Boot timings: every step's wall time (ms) goes into window.__bootTimes and is logged as `[boot] <step> <ms>`.
export const bootT0 = performance.now();
export const bootTimes: Record<string, number> = ((window as any).__bootTimes = (window as any).__bootTimes ?? {});

export function mark(label: string, t0: number): number {
  const ms = Math.round(performance.now() - t0);
  bootTimes[label] = (bootTimes[label] ?? 0) + ms;
  console.info(`[boot] ${label} ${ms} ms`);
  return ms;
}
