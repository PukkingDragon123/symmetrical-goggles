// The drink cooler's hum: a synthetic loop (60 Hz mains and its harmonics, a slow beat, a little compressor
// rattle) registered with the audio bank at runtime and played at the cooler while you're near. No asset needed.
import * as THREE from 'three';
import { audio } from '../../audio/audio';
import { SOUNDS } from '../../audio/bank';
import { G } from '../../gfx/globals';

const ID = 'cooler_hum', FILE = 'gen:cooler_hum';

function makeBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * 4);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // whole cycles of every partial in 4 s, so the loop point is seamless
    const beat = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.5 * t);
    let v = 0.55 * Math.sin(2 * Math.PI * 60 * t) + 0.3 * Math.sin(2 * Math.PI * 120 * t + 0.4) + 0.12 * Math.sin(2 * Math.PI * 180 * t + 1.1) + 0.05 * Math.sin(2 * Math.PI * 240 * t);
    lp += (rnd() - lp) * 0.08;
    v = v * beat + lp * 0.18 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 30 * t));
    d[i] = v * 0.5;
  }
  return b;
}

/** returns a per-frame tick: starts the hum when the camera comes within ~10 m of `at` (world), fades it far off */
export function coolerHum(at: THREE.Vector3): (dt: number) => void {
  let voice: ReturnType<typeof audio.play> = null;
  let ready = false, t = 0;
  return (dt: number) => {
    t -= dt;
    if (t > 0) return;
    t = 0.5;
    try {
      const d = G.uCamPos.value.distanceTo(at);
      if (!ready) {
        if (d > 12 || !audio.ctx) return;
        const bufs = (audio as unknown as { buffers?: Map<string, AudioBuffer> }).buffers;
        if (!bufs) return;
        if (!bufs.has(FILE)) bufs.set(FILE, makeBuffer(audio.ctx));
        if (!SOUNDS[ID]) SOUNDS[ID] = { files: [FILE], vol: 0.22, cat: 'sfx', loop: true, spatial: true, refDist: 1.2, maxDist: 14 };
        ready = true;
      }
      if (d < 10 && !voice) voice = audio.play(ID, { pos: at, loop: true, fadeIn: 1.5 });
      else if (d > 13 && voice) { voice.stop(1.0); voice = null; }
    } catch { ready = true; voice = null; }
  };
}
