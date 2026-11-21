// Offline DSP for the voice and music synths: plain Float32Arrays, seeded and deterministic, no WebAudio, so it runs
// the same in the synth worker, on the main thread and in a test.
// Ported from the author's own game หลอนยันปลายทาง (effective-octo-train/src/audio/Synth/dsp.js).
export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dB = (x: number): number => Math.pow(10, x / 20);
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface Rng {
  (): number;
  range(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

/** mulberry32 */
export function rngFrom(seed = 1): Rng {
  let a = seed >>> 0;
  const r = (() => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

export function hashStr(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** smooth random walk in [-1, 1] */
export class Wander {
  private a: number; private b: number; private t = 0;
  constructor(private rng: Rng, public rate = 1) { this.a = rng() * 2 - 1; this.b = rng() * 2 - 1; }
  next(dt: number): number {
    this.t += dt * this.rate;
    while (this.t >= 1) { this.t -= 1; this.a = this.b; this.b = this.rng() * 2 - 1; }
    const s = this.t * this.t * (3 - 2 * this.t);
    return this.a + (this.b - this.a) * s;
  }
}

/** TPT state-variable filter (stable under fast modulation) */
export class SVF {
  private ic1 = 0; private ic2 = 0; private k = 1; private a1 = 0; private a2 = 0; private a3 = 0; private q = 0.707;
  lp = 0; bp = 0; hp = 0;
  constructor(private sr: number, f = 1000, q = 0.707) { this.set(f, q); }
  set(f: number, q = this.q): this {
    this.q = q;
    const g = Math.tan((Math.PI * clamp(f, 5, this.sr * 0.47)) / this.sr);
    this.k = 1 / Math.max(q, 0.05);
    this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
    return this;
  }
  process(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peak' | 'lowshelf' | 'highshelf' | 'allpass';
/** RBJ cookbook biquad (DF1) */
export class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  constructor(private sr: number, type: BiquadType = 'lowpass', f = 1000, q = 0.707, gainDb = 0) { this.set(type, f, q, gainDb); }
  set(type: BiquadType, f: number, q = 0.707, gainDb = 0): this {
    const w0 = (TAU * clamp(f, 5, this.sr * 0.47)) / this.sr;
    const cw = Math.cos(w0), sw = Math.sin(w0), alpha = sw / (2 * Math.max(q, 0.01)), A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s; break;
      }
      case 'allpass': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      default: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export class OnePole {
  private a = 1; y = 0;
  constructor(private sr: number, f = 1000) { this.set(f); }
  set(f: number): this { this.a = 1 - Math.exp((-TAU * clamp(f, 1, this.sr * 0.49)) / this.sr); return this; }
  lp(x: number): number { this.y += this.a * (x - this.y); return this.y; }
  hp(x: number): number { this.y += this.a * (x - this.y); return x - this.y; }
}

/** two-pole resonator (one mode), impulse-normalised */
export class Reson {
  private y1 = 0; private y2 = 0; private c1 = 0; private c2 = 0; private norm = 0;
  constructor(private sr: number, f: number, t60: number, private gain = 1) { this.set(f, t60); }
  set(f: number, t60: number): this {
    const r = Math.exp(-6.9078 / (Math.max(t60, 0.001) * this.sr));
    const w = (TAU * clamp(f, 1, this.sr * 0.48)) / this.sr;
    this.c1 = 2 * r * Math.cos(w); this.c2 = -r * r; this.norm = Math.sin(w) * this.gain;
    return this;
  }
  process(x: number): number {
    const y = this.c1 * this.y1 + this.c2 * this.y2 + x * this.norm;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Freeverb-style mono reverb, for baking tails into buffers */
export class Verb {
  private combs: { buf: Float32Array; i: number; f: number }[];
  private aps: { buf: Float32Array; i: number }[];
  private fb: number; private damp: number; private wet: number;
  constructor(sr: number, { room = 0.8, damp = 0.4, wet = 0.3 } = {}) {
    const s = sr / 44100;
    this.combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => ({ buf: new Float32Array(Math.max(1, Math.round(t * s))), i: 0, f: 0 }));
    this.aps = [556, 441, 341, 225].map((t) => ({ buf: new Float32Array(Math.max(1, Math.round(t * s))), i: 0 }));
    this.fb = room * 0.28 + 0.7; this.damp = damp; this.wet = wet;
  }
  process(x: number): number {
    const inp = x * 0.015;
    let out = 0;
    for (const c of this.combs) {
      const y = c.buf[c.i];
      c.f = y * (1 - this.damp) + c.f * this.damp;
      c.buf[c.i] = inp + c.f * this.fb;
      c.i = (c.i + 1) % c.buf.length;
      out += y;
    }
    for (const a of this.aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = out + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      out = b - out;
    }
    return out * this.wet;
  }
}

/** Karplus-Strong plucked string (guitar, banjo) */
export function ksString(sr: number, f: number, dur: number, o: { rng?: Rng; bright?: number; decay?: number; pos?: number; damp?: number } = {}): Float32Array {
  const rng = o.rng ?? rngFrom(7);
  const out = new Float32Array(Math.max(1, Math.ceil(sr * dur)));
  const period = sr / f, N = Math.max(2, Math.floor(period)), frac = period - N, apC = (1 - frac) / (1 + frac);
  const dl = new Float32Array(N + 2);
  const lp = new OnePole(sr, 300 + (o.bright ?? 0.5) * 9000);
  for (let i = 0; i < N; i++) dl[i] = lp.lp(rng() * 2 - 1);
  const pd = Math.max(1, Math.floor(N * (o.pos ?? 0.13)));
  for (let i = N - 1; i >= pd; i--) dl[i] -= dl[i - pd];
  const g = Math.pow(10, -3 / ((o.decay ?? 3) * f)), damp = o.damp ?? 0.5;
  let idx = 0, apx1 = 0, apy1 = 0;
  for (let i = 0; i < out.length; i++) {
    const x = dl[idx], next = dl[(idx + 1) % N];
    const y = g * ((1 - damp) * x + damp * next);
    const ap = apC * y + apx1 - apC * apy1;
    apx1 = y; apy1 = ap;
    dl[idx] = ap;
    idx = (idx + 1) % N;
    out[i] = x;
  }
  return out;
}

export function mixInto(dst: Float32Array, src: Float32Array, at = 0, gain = 1): Float32Array {
  const o = Math.round(at), n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * gain;
  return dst;
}
export function peakOf(a: Float32Array): number { let p = 0; for (let i = 0; i < a.length; i++) { const v = a[i] < 0 ? -a[i] : a[i]; if (v > p) p = v; } return p; }
export function normalize(a: Float32Array, target = 0.89): Float32Array { const p = peakOf(a); if (p > 1e-9) { const g = target / p; for (let i = 0; i < a.length; i++) a[i] *= g; } return a; }
/** loudest 50 ms RMS */
export function loud50(a: Float32Array, sr: number): number {
  const w = Math.max(1, Math.floor(sr * 0.05));
  let best = 0;
  for (let s0 = 0; s0 < a.length; s0 += w >> 1) {
    let e = 0;
    const end = Math.min(a.length, s0 + w);
    for (let i = s0; i < end; i++) e += a[i] * a[i];
    best = Math.max(best, Math.sqrt(e / w));
  }
  return best;
}
/** NaN/Inf out, DC blocked */
export function sanitize(a: Float32Array): Float32Array {
  const R = 0.9988;
  let x1 = 0, y1 = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number.isFinite(a[i]) ? a[i] : 0;
    const y = x - x1 + R * y1;
    x1 = x; y1 = y; a[i] = y;
  }
  return a;
}
export function fadeIn(a: Float32Array, sr: number, sec: number): Float32Array { const n = Math.min(a.length, Math.floor(sr * sec)); for (let i = 0; i < n; i++) a[i] *= i / n; return a; }
export function fadeOut(a: Float32Array, sr: number, sec: number): Float32Array { const n = Math.min(a.length, Math.floor(sr * sec)), s = a.length - n; for (let i = 0; i < n; i++) a[s + i] *= 1 - i / n; return a; }
export function reverse(a: Float32Array): Float32Array { const b = new Float32Array(a.length); for (let i = 0; i < a.length; i++) b[i] = a[a.length - 1 - i]; return b; }
/** a baked reverb tail: returns a new, longer buffer */
export function bakeVerb(a: Float32Array, sr: number, o: { room?: number; damp?: number; wet?: number; dry?: number; tail?: number; predelay?: number } = {}): Float32Array {
  const out = new Float32Array(a.length + Math.floor((o.tail ?? 1.5) * sr));
  const v = new Verb(sr, o), dry = o.dry ?? 1, pre = Math.floor((o.predelay ?? 0.01) * sr);
  for (let i = 0; i < out.length; i++) {
    const x = i < a.length ? a[i] : 0;
    out[i] += x * dry;
    const w = v.process(x);
    if (i + pre < out.length) out[i + pre] += w;
  }
  return out;
}
/** a shaped burst of filtered noise added into out (clicks, breaths, steam) */
export function noiseBurst(out: Float32Array, sr: number, rng: Rng, at: number, dur: number, o: { f?: number; q?: number; type?: 'bp' | 'lp' | 'hp'; a?: number; gain?: number; fEnd?: number } = {}): void {
  const s = Math.floor(at * sr), n = Math.min(out.length - s, Math.floor(dur * sr));
  const f = o.f ?? 1000, q = o.q ?? 0.7, flt = new SVF(sr, f, q), a = o.a ?? 0.002, gain = o.gain ?? 1;
  for (let i = 0; i < n; i++) {
    if (s + i < 0) continue;
    const t = i / sr;
    if (o.fEnd !== undefined && (i & 15) === 0) flt.set(f + (o.fEnd - f) * (i / n), q);
    flt.process(rng() * 2 - 1);
    const y = o.type === 'lp' ? flt.lp : o.type === 'hp' ? flt.hp : flt.bp;
    const env = t < a ? t / a : Math.exp((-6.9 * (t - a)) / Math.max(1e-4, dur - a));
    out[s + i] += y * env * gain;
  }
}
