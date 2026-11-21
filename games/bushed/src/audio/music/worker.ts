// Music worker: renders a song off the main thread (a few seconds of work for the 80 s theme).
import { renderSong, type SongName } from './songs';

self.onmessage = (e: MessageEvent<{ id: number; name: SongName; sr: number }>) => {
  const { id, name, sr } = e.data;
  try {
    const s = renderSong(name, sr);
    (self as unknown as Worker).postMessage({ id, ok: true, res: s }, [s.L.buffer, s.R.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.stack ?? err) });
  }
};
