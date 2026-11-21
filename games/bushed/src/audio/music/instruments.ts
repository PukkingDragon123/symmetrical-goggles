// Folk instruments for the BUSHED theme, synthesised offline into Float32Arrays: a bowed fiddle (band-limited saw
// through a violin body, bow noise, delayed vibrato, slides), a fingerpicked steel-string guitar (Karplus-Strong
// through a box), a harmonium / accordion (detuned reeds, musette beating, bellows swell), a far-off loon over
// water, a low reed drone and a soft frame-drum heartbeat.
// The render-a-note-into-a-buffer approach is ported from the author's own game หลอนยันปลายทาง
// (effective-octo-train/src/audio/Synth/instruments.js); the instruments themselves are new.
import { TAU, clamp, mtof, Biquad, SVF, OnePole, Wander, ksString, mixInto, bakeVerb, type Rng } from '../voice/dsp';

/** polyBLEP oscillator */
class Osc {
  p: number;
  constructor(private sr: number, phase = 0) { this.p = phase; }
  private blep(t: number, dt: number): number {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }
  saw(f: number): number {
    const dt = f / this.sr;
    const y = 2 * this.p - 1 - this.blep(this.p, dt);
    this.p += dt; if (this.p >= 1) this.p -= 1;
    return y;
  }
  pulse(f: number, pw: number): number {
    const dt = f / this.sr;
    let y = this.p < pw ? 1 : -1;
    y += this.blep(this.p, dt);
    y -= this.blep((this.p + 1 - pw) % 1, dt);
    this.p += dt; if (this.p >= 1) this.p -= 1;
    return y;
  }
}

export interface Note { t: number; dur: number; midi: number; vel?: number }

/**
 * A fiddle line (legato: notes closer than 60 ms glide into each other). Adds into `out` from `notes` (seconds).
 * opts: vib (semitones), bright (0..1), slide (s)
 */
export function fiddle(out: Float32Array, sr: number, notes: Note[], rng: Rng, o: { vib?: number; bright?: number; slide?: number; gain?: number } = {}): void {
  if (!notes.length) return;
  const osc = new Osc(sr, rng()), osc2 = new Osc(sr, rng());
  const body = [new Biquad(sr, 'peak', 290, 2.2, 7), new Biquad(sr, 'peak', 470, 2, 4), new Biquad(sr, 'peak', 1050, 1.6, 3), new Biquad(sr, 'peak', 2700, 1.4, 6), new Biquad(sr, 'peak', 4100, 2, -5), new Biquad(sr, 'lowpass', 5200 + (o.bright ?? 0.5) * 2500, 0.7)];
  const bowN = new SVF(sr, 2600, 1.2), pressure = new Wander(rng, 1.8), vibW = new Wander(rng, 0.6);
  const vib = o.vib ?? 0.22, slide = o.slide ?? 0.07, gain = o.gain ?? 1;
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  const t0 = sorted[0].t, t1 = sorted[sorted.length - 1].t + sorted[sorted.length - 1].dur + 0.4;
  const s0 = Math.max(0, Math.floor(t0 * sr)), s1 = Math.min(out.length, Math.ceil(t1 * sr));
  let ni = 0, f = mtof(sorted[0].midi), amp = 0, vibPh = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / sr;
    while (ni + 1 < sorted.length && t >= sorted[ni + 1].t) ni++;
    const n = sorted[ni];
    const inNote = t < n.t + n.dur;
    const target = mtof(n.midi);
    const next = sorted[ni + 1];
    // glide toward the note (slides between legato notes, a small scoop up into detached ones)
    const into = t - n.t;
    const legato = ni > 0 && n.t - (sorted[ni - 1].t + sorted[ni - 1].dur) < 0.06;
    const tgt = legato ? target : target * Math.pow(2, (-0.35 * Math.exp(-into / 0.05)) / 12);
    f += (tgt - f) * (1 - Math.exp(-1 / (sr * (legato ? slide * 0.5 : 0.012))));
    // bow envelope: soft attack, swell with bow pressure, release at the note end (no gap when legato)
    const vel = n.vel ?? 0.8;
    const gapAfter = next ? next.t - (n.t + n.dur) : 1;
    let target_a = 0;
    if (inNote) target_a = vel * (0.82 + 0.18 * Math.sin(Math.PI * clamp(into / Math.max(0.2, n.dur))));
    else if (gapAfter < 0.06) target_a = vel * 0.8;
    const atk = into < 0.12 && !legato ? 0.07 : 0.03;
    amp += (target_a - amp) * (1 - Math.exp(-1 / (sr * (target_a > amp ? atk : 0.09))));
    const p = 1 + pressure.next(1 / sr) * 0.12;
    // vibrato fades in after a quarter second on held notes
    const vk = clamp((into - 0.22) / 0.35) * (n.dur > 0.4 ? 1 : 0.3);
    vibPh += (TAU * (5.4 + vibW.next(1 / sr) * 0.5)) / sr;
    const ff = f * Math.pow(2, (Math.sin(vibPh) * vib * vk) / 12);
    let y = osc.saw(ff) * 0.7 + osc2.saw(ff * 1.0015) * 0.3;
    bowN.process(rng() * 2 - 1);
    y += bowN.bp * 0.05 * (0.4 + 0.6 * p);
    for (const b of body) y = b.process(y);
    out[i] += y * amp * p * 0.22 * gain;
  }
}

/** a guitar note (steel strings in a box) */
export function guitarNote(sr: number, midi: number, dur: number, vel: number, rng: Rng, bright = 0.45): Float32Array {
  const f = mtof(midi);
  const b = ksString(sr, f, dur + 1.2, { rng, bright: bright + vel * 0.25, decay: 2.2 + 120 / f, pos: 0.12 + rng() * 0.06, damp: 0.5 });
  const box = [new Biquad(sr, 'peak', 105, 1.4, 6), new Biquad(sr, 'peak', 215, 1.8, 3), new Biquad(sr, 'peak', 2400, 1, 2), new Biquad(sr, 'lowpass', 6500, 0.7)];
  const env = Math.floor((dur + 0.25) * sr);
  for (let i = 0; i < b.length; i++) {
    let y = b[i];
    for (const q of box) y = q.process(y);
    // the fretting hand lets go a little after the note's length
    const d = i > env ? Math.exp(-(i - env) / (sr * 0.08)) : 1;
    b[i] = y * vel * 0.5 * d;
  }
  return b;
}

/** a strum or a picked chord: midis low to high, spread in time */
export function guitarChord(out: Float32Array, sr: number, t: number, midis: number[], dur: number, vel: number, rng: Rng, spread = 0.018, down = true): void {
  const order = down ? midis : [...midis].reverse();
  order.forEach((m, k) => {
    const n = guitarNote(sr, m, dur, vel * (0.75 + 0.25 * rng()), rng);
    mixInto(out, n, Math.floor((t + k * spread * (0.8 + rng() * 0.4)) * sr), 1);
  });
}

/**
 * A harmonium / accordion chord: two or three reeds per note (musette beating in cents), a bellows swell.
 * Adds into out.
 */
export function reeds(out: Float32Array, sr: number, t: number, dur: number, midis: number[], vel: number, rng: Rng, o: { musette?: number; cut?: number; attack?: number; release?: number; bellows?: number } = {}): void {
  const s0 = Math.floor(t * sr), rel = o.release ?? 0.6, atk = o.attack ?? 0.35;
  const n = Math.min(out.length - s0, Math.ceil((dur + rel) * sr));
  if (n <= 0) return;
  const musette = o.musette ?? 6;
  const voices = midis.flatMap((m) => [0, musette, -musette * 0.6].map((c) => ({ f: mtof(m) * Math.pow(2, c / 1200), osc: new Osc(sr, rng()), pw: 0.22 + rng() * 0.12 })));
  const lp = new SVF(sr, o.cut ?? 2200, 0.8), lp2 = new OnePole(sr, (o.cut ?? 2200) * 1.6), hp = new OnePole(sr, 90);
  const bel = new Wander(rng, 0.9), bk = o.bellows ?? 0.18;
  const norm = 1 / Math.sqrt(voices.length);
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const env = (tt < atk ? (tt / atk) ** 1.5 : 1) * (tt > dur ? Math.exp(-(tt - dur) / (rel / 3)) : 1);
    let y = 0;
    for (const v of voices) y += v.osc.pulse(v.f, v.pw);
    y = lp.process(y * norm);
    y = lp2.lp(y);
    y = hp.hp(y);
    out[s0 + i] += y * env * vel * 0.16 * (1 + bel.next(1 / sr) * bk);
  }
}

/** a low reed drone (no bellows rhythm, darker) */
export function drone(out: Float32Array, sr: number, t: number, dur: number, midis: number[], vel: number, rng: Rng): void {
  reeds(out, sr, t, dur, midis, vel, rng, { musette: 3, cut: 700, attack: 2.5, release: 3, bellows: 0.3 });
}

/** a loon on a far lake: 'wail' (the long two-note cry) or 'tremolo' (the laughing warble). Dry, mono. */
export function loonCall(sr: number, kind: 'wail' | 'tremolo', rng: Rng): Float32Array {
  const dur = kind === 'wail' ? 4.2 : 2.2;
  const out = new Float32Array(Math.ceil(dur * sr));
  const form = new Biquad(sr, 'peak', 950, 1.4, 6), lp = new Biquad(sr, 'lowpass', 2600, 0.7);
  let ph = 0;
  const base = 560 + rng() * 60;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let f: number, a: number;
    if (kind === 'wail') {
      // oo-AAH ... ooo: a slide up to the high note, held, then a drop to a middle note that wavers
      if (t < 0.35) { f = base * (1 + 0.15 * (t / 0.35)); a = t / 0.35; }
      else if (t < 1.9) { f = base * 1.5 * (1 + 0.006 * Math.sin(TAU * 4.5 * t) * clamp((t - 0.8) / 0.8)); a = 1; }
      else if (t < 2.15) { f = base * (1.5 - 0.27 * ((t - 1.9) / 0.25)); a = 0.85; }
      else { f = base * 1.23 * (1 + 0.012 * Math.sin(TAU * 5.2 * t) * clamp((t - 2.4) / 0.6)); a = Math.max(0, 1 - (t - 2.15) / (dur - 2.15)) ** 0.7; }
    } else {
      // the tremolo: fast up-down warble between two pitches
      const w = 0.5 + 0.5 * Math.sin(TAU * 9.5 * t);
      f = base * (1.42 + 0.12 * w);
      a = Math.sin(Math.PI * clamp(t / dur)) * (0.6 + 0.4 * w);
    }
    ph += (TAU * f) / sr;
    const y = Math.sin(ph) + 0.22 * Math.sin(2 * ph + 0.3) + 0.08 * Math.sin(3 * ph);
    out[i] = lp.process(form.process(y)) * a * 0.3;
  }
  return out;
}

/** the loon placed far across the water: echo off the far shore, big wet tail, highs gone */
export function farOverWater(dry: Float32Array, sr: number): Float32Array {
  const echo = new Float32Array(dry.length + Math.floor(0.42 * sr));
  mixInto(echo, dry, 0, 1); mixInto(echo, dry, Math.floor(0.42 * sr), 0.35);
  const wet = bakeVerb(echo, sr, { room: 0.93, damp: 0.55, wet: 1.4, dry: 0.35, tail: 3.5, predelay: 0.04 });
  const lp = new Biquad(sr, 'lowpass', 1700, 0.7);
  for (let i = 0; i < wet.length; i++) wet[i] = lp.process(wet[i]);
  return wet;
}

/** a soft frame-drum heartbeat (felt beater, far away) */
export function heartbeat(out: Float32Array, sr: number, t: number, vel: number, rng: Rng): void {
  const s0 = Math.floor(t * sr), n = Math.min(out.length - s0, Math.floor(0.5 * sr));
  let ph = rng() * 0.2;
  const click = new SVF(sr, 900, 0.8);
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const f = 48 + 30 * Math.exp(-tt / 0.04);
    ph += (TAU * f) / sr;
    click.process(rng() * 2 - 1);
    out[s0 + i] += (Math.sin(ph) * Math.exp(-tt / 0.16) + click.lp * 0.12 * Math.exp(-tt / 0.01)) * vel * 0.5;
  }
}
