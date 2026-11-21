// "Kettle Lake Waltz", the BUSHED theme: a melancholy folk-horror waltz in D minor for fiddle, fingerpicked guitar,
// harmonium / accordion, a reed drone, a soft heartbeat drum and a loon somewhere across the lake. Its middle section
// leans on a wrong chord (E-flat, the flat second) before it finds its way home. Three cuts:
//   theme     menu, loading: 32 bars at 72 bpm (~80 s), loops seamlessly
//   campfire  the short campground version: guitar and a humming harmonium, the fiddle once through (~44 s, loops)
//   ending    slower, through the last verse to a D major chord (Picardy third) and the loon (~45 s, no loop)
// An original composition, synthesised in code (no samples). Plans are data; renderSong() runs in the music worker.
// The plan-then-render approach is ported from the author's own game หลอนยันปลายทาง
// (effective-octo-train/src/audio/Synth/songs.js).
import { rngFrom, mtof, Verb, Wander, TAU, peakOf, Biquad, type Rng } from '../voice/dsp';
import { fiddle, guitarChord, guitarNote, reeds, drone, loonCall, farOverWater, heartbeat, type Note } from './instruments';

export type SongName = 'theme' | 'campfire' | 'ending';

const D4 = 62;
/** guitar voicings (bass first) and harmonium voicings */
const CH: Record<string, { gtr: number[]; org: number[] }> = {
  Dm: { gtr: [50, 57, 62, 65, 69], org: [57, 62, 65] },
  C: { gtr: [48, 55, 60, 64, 67], org: [55, 60, 64] },
  Bb: { gtr: [46, 53, 58, 62, 65], org: [58, 62, 65] },
  F: { gtr: [41, 48, 53, 57, 60], org: [57, 60, 65] },
  Gm: { gtr: [43, 50, 55, 58, 62], org: [58, 62, 67] },
  A: { gtr: [45, 52, 57, 61, 64], org: [57, 61, 64] },
  Eb: { gtr: [51, 58, 63, 67, 70], org: [58, 63, 67] },
  D: { gtr: [50, 57, 62, 66, 69], org: [57, 62, 66] },
};
type Bar = [number, number][];
const MEL_A: Bar[] = [[[7, 2], [3, 1]], [[0, 1.5], [2, 0.5], [3, 1]], [[5, 2], [2, 1]], [[-2, 3]], [[0, 1], [3, 1], [8, 1]], [[7, 2], [3, 1]], [[5, 1], [3, 1], [2, 1]], [[2, 2], [-1, 1]]];
const MEL_B: Bar[] = [[[10, 2], [12, 1]], [[10, 1], [8, 1], [7, 1]], [[7, 2], [5, 1]], [[3, 3]], [[8, 2], [10, 1]], [[12, 1.5], [10, 0.5], [8, 1]], [[7, 1], [5, 1], [3, 1]], [[1, 2], [1, 0.5], [-1, 0.5]]];
const MEL_A2: Bar[] = [[[7, 2], [3, 1]], [[0, 1.5], [2, 0.5], [3, 1]], [[5, 2], [8, 1]], [[7, 3]], [[10, 1], [8, 1], [7, 1]], [[3, 1.5], [5, 0.5], [3, 1]], [[2, 1], [-1, 1], [2, 1]], [[0, 3]]];
const CH_A = ['Dm', 'Dm', 'C', 'C', 'Bb', 'F', 'Gm', 'A'];
const CH_B = ['Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'Gm', 'Eb|A'];
const CH_A2 = ['Dm', 'Dm', 'Gm', 'Dm', 'Bb', 'Gm', 'A', 'Dm'];

interface Stems { fiddle: Float32Array; guitar: Float32Array; reeds: Float32Array; low: Float32Array; loonL: Float32Array; loonR: Float32Array }

function melody(bars: Bar[], bar0: number, beat: number, shift = 0, vel = 0.8): Note[] {
  const out: Note[] = [];
  bars.forEach((bar, b) => {
    let t = 0;
    for (const [s, d] of bar) { out.push({ t: (bar0 + b) * 3 * beat + t * beat, dur: d * beat * 0.97, midi: D4 + s + shift, vel: vel * (t === 0 ? 1 : 0.88) }); t += d; }
  });
  return out;
}

/** the chord(s) of a bar: 'Eb|A' = Eb for two beats, A for the third */
function barChords(name: string): { ch: string; from: number; to: number }[] {
  const [a, b] = name.split('|');
  return b ? [{ ch: a, from: 0, to: 2 }, { ch: b, from: 2, to: 3 }] : [{ ch: a, from: 0, to: 3 }];
}

/** fingerpicked waltz: bass on 1, the chord climbing and falling in eighths */
function pick(st: Stems, sr: number, chords: string[], bar0: number, beat: number, rng: Rng, vel = 0.7): void {
  chords.forEach((name, b) => {
    for (const { ch, from, to } of barChords(name)) {
      const v = CH[ch].gtr;
      const order = [v[0], v[2], v[3], v[4], v[3], v[2]];
      for (let e = from * 2; e < to * 2; e++) {
        const t = (bar0 + b) * 3 * beat + e * beat * 0.5 + (rng() - 0.5) * 0.012;
        const m = order[e % 6];
        const n = guitarNote(sr, m, e % 6 === 0 ? beat * 2.6 : beat * 1.4, (e % 6 === 0 ? 0.85 : 0.5) * vel, rng);
        addAt(st.guitar, n, t, sr);
      }
    }
  });
}

/** strummed waltz: a full down-strum on 1, light upper strums on 2 and 3 */
function strum(st: Stems, sr: number, chords: string[], bar0: number, beat: number, rng: Rng, vel = 0.6): void {
  chords.forEach((name, b) => {
    for (const { ch, from, to } of barChords(name)) {
      const v = CH[ch].gtr;
      for (let k = from; k < to; k++) {
        const t = (bar0 + b) * 3 * beat + k * beat;
        if (k === from) guitarChord(st.guitar, sr, t, v, beat * 1.2, vel, rng, 0.02, true);
        else guitarChord(st.guitar, sr, t, v.slice(2), beat * 0.8, vel * 0.55, rng, 0.012, k % 2 === 0);
      }
    }
  });
}

function organ(st: Stems, sr: number, chords: string[], bar0: number, beat: number, rng: Rng, vel = 0.5, musette = 6): void {
  chords.forEach((name, b) => {
    for (const { ch, from, to } of barChords(name)) reeds(st.reeds, sr, (bar0 + b) * 3 * beat + from * beat, (to - from) * beat * 0.98, CH[ch].org, vel, rng, { musette, attack: 0.3, release: 0.5 });
  });
}

function loon(st: Stems, sr: number, t: number, kind: 'wail' | 'tremolo', side: number, rng: Rng, vel = 0.55): void {
  const w = farOverWater(loonCall(sr, kind, rng), sr);
  const gl = vel * Math.sqrt(0.5 * (1 - side)), gr = vel * Math.sqrt(0.5 * (1 + side));
  addAt(st.loonL, w, t, sr, gl); addAt(st.loonR, w, t, sr, gr);
}

function addAt(dst: Float32Array, src: Float32Array, t: number, sr: number, g = 1): void {
  const o = Math.floor(t * sr);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * g;
}

function plan(name: SongName, st: Stems, sr: number, rng: Rng): { beat: number; bars: number } {
  if (name === 'theme') {
    const beat = 60 / 72;
    // intro: the drone, the loon, the harmonium breathing in, the guitar finding its feet
    drone(st.low, sr, 0, 10 * beat * 3, [38, 45], 0.55, rng);
    loon(st, sr, 0.8, 'wail', -0.55, rng);
    organ(st, sr, ['Dm', 'Dm'], 2, beat, rng, 0.35);
    pick(st, sr, ['Dm', 'Dm'], 2, beat, rng, 0.55);
    // A
    pick(st, sr, CH_A, 4, beat, rng);
    organ(st, sr, CH_A, 4, beat, rng, 0.32);
    fiddle(st.fiddle, sr, melody(MEL_A, 4, beat), rng, { vib: 0.2 });
    // B: the accordion comes forward, a heartbeat under it, the wrong chord at the end
    strum(st, sr, CH_B, 12, beat, rng, 0.55);
    organ(st, sr, CH_B, 12, beat, rng, 0.5, 9);
    for (let b = 12; b < 20; b++) heartbeat(st.low, sr, b * 3 * beat, b % 2 ? 0.35 : 0.5, rng);
    fiddle(st.fiddle, sr, melody(MEL_B, 12, beat, 0, 0.85), rng, { vib: 0.26, bright: 0.65 });
    drone(st.low, sr, 19 * 3 * beat, 3 * beat, [39], 0.4, rng); // the flat second, underneath
    // A2: home, with a ghost fiddle an octave down and a little out of tune
    pick(st, sr, CH_A2, 20, beat, rng, 0.65);
    organ(st, sr, CH_A2, 20, beat, rng, 0.3);
    fiddle(st.fiddle, sr, melody(MEL_A2, 20, beat), rng, { vib: 0.22 });
    fiddle(st.fiddle, sr, melody(MEL_A2, 20, beat, -12.12, 0.4), rngFrom(99), { vib: 0.12, bright: 0.2, gain: 0.55 });
    loon(st, sr, 22.5 * 3 * beat, 'tremolo', 0.6, rng, 0.4);
    // outro: the drone, a last picked chord, a high harmonic, the loon again
    drone(st.low, sr, 28 * 3 * beat, 4 * 3 * beat, [38, 45], 0.5, rng);
    pick(st, sr, ['Dm'], 28, beat, rng, 0.5);
    fiddle(st.fiddle, sr, [{ t: 29 * 3 * beat, dur: 5 * beat, midi: 81, vel: 0.35 }], rng, { vib: 0.1, bright: 0.1, gain: 0.7 });
    loon(st, sr, 29.5 * 3 * beat, 'wail', 0.5, rng, 0.45);
    return { beat, bars: 32 };
  }
  if (name === 'campfire') {
    const beat = 60 / 66;
    strum(st, sr, ['Dm', 'Dm'], 0, beat, rng, 0.45);
    reeds(st.reeds, sr, 0, 2 * 3 * beat, CH.Dm.org, 0.25, rng, { musette: 3, attack: 1.5, release: 1 });
    pick(st, sr, CH_A, 2, beat, rng, 0.6);
    fiddle(st.fiddle, sr, melody(MEL_A, 2, beat, 0, 0.7), rng, { vib: 0.18, bright: 0.35 });
    organ(st, sr, CH_A, 2, beat, rng, 0.2, 3);
    strum(st, sr, CH_A2.slice(0, 5).concat(['A', 'Dm', 'Dm']), 10, beat, rng, 0.5);
    organ(st, sr, CH_A2.slice(0, 5).concat(['A', 'Dm', 'Dm']), 10, beat, rng, 0.24, 3);
    return { beat, bars: 18 };
  }
  // ending
  const beat = 60 / 64;
  drone(st.low, sr, 0, 4 * 3 * beat, [38, 45], 0.5, rng);
  loon(st, sr, 0.5, 'wail', -0.4, rng, 0.5);
  pick(st, sr, ['Dm', 'Dm'], 0, beat, rng, 0.45);
  pick(st, sr, CH_A2.slice(0, 7), 2, beat, rng, 0.6);
  organ(st, sr, CH_A2.slice(0, 7), 2, beat, rng, 0.3);
  fiddle(st.fiddle, sr, melody(MEL_A2.slice(0, 7), 2, beat), rng, { vib: 0.24 });
  // the last chord is major: a D, held, the fiddle on the high D, the loon answering
  const end = 9 * 3 * beat;
  guitarChord(st.guitar, sr, end, CH.D.gtr, 6, 0.6, rng, 0.05);
  reeds(st.reeds, sr, end, 8, CH.D.org, 0.4, rng, { musette: 4, attack: 0.8, release: 3 });
  drone(st.low, sr, end, 9, [38, 45], 0.5, rng);
  fiddle(st.fiddle, sr, [{ t: end, dur: 7, midi: 74, vel: 0.55 }], rng, { vib: 0.18 });
  loon(st, sr, end + 3.5, 'wail', 0.55, rng, 0.4);
  return { beat, bars: 12.5 };
}

const META: Record<SongName, { beat: number; bars: number }> = { theme: { beat: 60 / 72, bars: 32 }, campfire: { beat: 60 / 66, bars: 18 }, ending: { beat: 60 / 64, bars: 12.5 } };

export interface SongAudio { sr: number; L: Float32Array; R: Float32Array; loop: boolean; duration: number }

export function renderSong(name: SongName, sr = 22050): SongAudio {
  const rng = rngFrom(name === 'theme' ? 1871 : name === 'campfire' ? 1867 : 1885);
  const probe = META[name];
  const loop = name !== 'ending';
  const len = name === 'ending' ? probe.bars * 3 * probe.beat + 2 : probe.bars * 3 * probe.beat;
  const tail = loop ? 6 : 4;
  const st = mkStems(sr, len + tail);
  plan(name, st, sr, rng);
  const n = st.fiddle.length;
  const L = new Float32Array(n), R = new Float32Array(n);
  // the room: one big dark hall for everyone, a little more for the fiddle
  const vl = new Verb(sr, { room: 0.86, damp: 0.45, wet: 1 }), vr = new Verb(sr, { room: 0.88, damp: 0.5, wet: 1 });
  const haas = Math.floor(0.011 * sr);
  const close = name === 'campfire';
  const lowcut = new Biquad(sr, 'highpass', 35, 0.7);
  for (let i = 0; i < n; i++) {
    const f = st.fiddle[i], g = st.guitar[i], r = st.reeds[i], lo = lowcut.process(st.low[i]);
    const rd = st.reeds[i - haas] ?? 0;
    const send = f * 0.55 + g * 0.3 + r * 0.35 + lo * 0.15;
    const w1 = vl.process(send), w2 = vr.process(send);
    const wet = close ? 0.45 : 0.85;
    L[i] = f * 0.82 + g * 1.05 + r * 0.9 + lo + st.loonL[i] + w1 * wet;
    R[i] = f * 1.0 + g * 0.8 + rd * 0.9 + lo + st.loonR[i] + w2 * wet;
  }
  // old tape: slow wow and a little flutter
  const wobL = tape(L, sr, rngFrom(7)), wobR = tape(R, sr, rngFrom(7));
  // seamless loop: the tail rings into the start
  const N = Math.floor(len * sr);
  let outL = wobL, outR = wobR;
  if (loop) {
    outL = wobL.slice(0, N); outR = wobR.slice(0, N);
    for (let i = N; i < wobL.length; i++) { outL[i - N] += wobL[i]; outR[i - N] += wobR[i]; }
  }
  const pk = Math.max(peakOf(outL), peakOf(outR), 1e-9);
  for (let i = 0; i < outL.length; i++) { outL[i] = Math.tanh((outL[i] / pk) * 1.1) * 0.82; outR[i] = Math.tanh((outR[i] / pk) * 1.1) * 0.82; }
  if (!loop) { const f = Math.floor(2 * sr); for (let i = 0; i < f; i++) { const k = 1 - i / f; outL[outL.length - 1 - i] *= 1 - k * k; outR[outR.length - 1 - i] *= 1 - k * k; } }
  return { sr, L: outL, R: outR, loop, duration: outL.length / sr };
}

function mkStems(sr: number, sec: number): Stems {
  const n = Math.max(1, Math.ceil(sec * sr));
  return { fiddle: new Float32Array(n), guitar: new Float32Array(n), reeds: new Float32Array(n), low: new Float32Array(n), loonL: new Float32Array(n), loonR: new Float32Array(n) };
}

function tape(a: Float32Array, sr: number, rng: Rng): Float32Array {
  const out = new Float32Array(a.length);
  const w = new Wander(rng, 0.35);
  let pos = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const rate = 1 + w.next(1 / sr) * 0.0016 + Math.sin(TAU * 6.1 * t) * 0.0003;
    pos += rate;
    const k = Math.floor(pos), f = pos - k;
    out[i] = k + 1 < a.length ? a[k] * (1 - f) + a[k + 1] * f : 0;
  }
  return out;
}

export { mtof };
