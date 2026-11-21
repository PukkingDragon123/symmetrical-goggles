// Voice synth worker: renders dialogue lines off the main thread and transfers the sample arrays back.
// Ported from the author's own game หลอนยันปลายทาง (effective-octo-train/src/audio/Synth/worker.js).
import { renderLine, type LineArgs } from './speech';

self.onmessage = (e: MessageEvent<{ id: number; args: LineArgs }>) => {
  const { id, args } = e.data;
  try {
    const r = renderLine(args);
    (self as unknown as Worker).postMessage({ id, ok: true, res: r }, [r.main.buffer, r.haloL.buffer, r.haloR.buffer, r.env.buffer, r.rnd.buffer, r.sylls.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.stack ?? err) });
  }
};
