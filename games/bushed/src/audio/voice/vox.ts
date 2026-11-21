// Klatt-style cascade formant synthesiser rendered offline into a Float32Array: every voice in BUSHED (people, the
// things in the bush, the old man in the cutscenes) is a glottal pulse shaped by vocal-tract resonances.
// Ported from the author's own game หลอนยันปลายทาง (effective-octo-train/src/audio/Synth/vox.js).
//
//   const v = new VoxScore(); v.seg(0.12, { f0: 120, av: 0, af: 0.6, ff: 5500 }, { ... });
//   const out = renderVox(sr, v, { rng, jitter, shimmer, breath, formantScale, ... });
//
// Params (carried over from the previous segment when omitted): f0 Hz, av voicing, ah aspiration, af frication,
// ff/fq frication centre/Q, F1..F5 / B1..B5 formants, tilt (darker source), oq open quotient, sub (period doubling:
// growl / creak), nas (nasal murmur).
import { TAU, clamp, rngFrom, SVF, Wander, Biquad, type Rng, type BiquadType } from './dsp';

export interface VoxParams {
  f0: number; av: number; ah: number; af: number; ff: number; fq: number;
  F1: number; F2: number; F3: number; F4: number; F5: number;
  B1: number; B2: number; B3: number; B4: number; B5: number;
  tilt: number; oq: number; sub: number; nas: number;
}
type K = keyof VoxParams;
const KEYS: K[] = ['f0', 'av', 'ah', 'af', 'ff', 'fq', 'F1', 'F2', 'F3', 'F4', 'F5', 'B1', 'B2', 'B3', 'B4', 'B5', 'tilt', 'oq', 'sub', 'nas'];
const DEFAULTS: VoxParams = {
  f0: 120, av: 0, ah: 0, af: 0, ff: 4000, fq: 1.5, F1: 500, F2: 1500, F3: 2500, F4: 3400, F5: 4300,
  B1: 70, B2: 100, B3: 150, B4: 220, B5: 300, tilt: 0.3, oq: 0.55, sub: 0, nas: 0,
};
type Curve = 'lin' | 'in' | 'out' | 'smooth';
interface Seg { t0: number; dur: number; A: VoxParams; B: VoxParams; curve: Curve }

export interface Mark { t: number; ci: number; ce: number; stress: boolean; vowel: string }

export class VoxScore {
  segs: Seg[] = [];
  cur: VoxParams;
  duration = 0;
  marks: Mark[] = [];
  breaths: { t: number; dur: number; kind: 'in' | 'out'; gain: number }[] = [];
  speechStart = 0;
  speechEnd = 0;
  constructor(init: Partial<VoxParams> = {}) { this.cur = { ...DEFAULTS, ...init }; }
  /** a segment of `dur` seconds from `a` (merged onto the current params) to `b` (merged onto a) */
  seg(dur: number, a: Partial<VoxParams> = {}, b: Partial<VoxParams> | null = null, curve: Curve = 'lin'): this {
    const A = { ...this.cur, ...a };
    const B = b ? { ...A, ...b } : A;
    const d = Math.max(1e-4, dur);
    this.segs.push({ t0: this.duration, dur: d, A, B, curve });
    this.duration += d;
    this.cur = { ...B };
    return this;
  }
  rest(dur: number): this { return this.seg(dur, { av: 0, ah: 0, af: 0 }); }
}

/** Klatt cascade resonator (unity DC gain) */
class KRes {
  private y1 = 0; private y2 = 0; private A = 1; private B = 0; private C = 0;
  constructor(private sr: number) {}
  set(F: number, BW: number): void {
    const T = 1 / this.sr, f = clamp(F, 30, this.sr * 0.45), r = Math.exp(-Math.PI * Math.max(BW, 10) * T);
    this.C = -r * r; this.B = 2 * r * Math.cos(TAU * f * T); this.A = 1 - this.B - this.C;
  }
  process(x: number): number { const y = this.A * x + this.B * this.y1 + this.C * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

const EASE: Record<Curve, (t: number) => number> = {
  lin: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), smooth: (t) => t * t * (3 - 2 * t),
};

export interface VoxOpts {
  rng?: Rng; jitter?: number; shimmer?: number; breath?: number; formantScale?: number; pitchScale?: number;
  whisper?: boolean; vibrato?: { rate: number; depth: number; delay?: number; phase?: number } | null;
  /** slow f0 wander (semitones) */
  drift?: number; driftRate?: number;
  smooth?: number; smoothAmp?: number;
  tremor?: { rate: number; depth: number; amp?: number } | null;
  eq?: [BiquadType, number, number, number][];
  presence?: number; tail?: number; hpc?: boolean;
}

export function renderVox(sr: number, score: VoxScore, opts: VoxOpts = {}): Float32Array {
  const rng = opts.rng ?? rngFrom(1);
  const n = Math.max(1, Math.ceil((score.duration + (opts.tail ?? 0.05)) * sr));
  const out = new Float32Array(n);
  const fs = opts.formantScale ?? 1, ps = opts.pitchScale ?? 1;
  const jitter = opts.jitter ?? 0.012, shimmer = opts.shimmer ?? 0.06, breath = opts.breath ?? 0.05;
  const whisper = !!opts.whisper, vib = opts.vibrato ?? null, drift = opts.drift ?? 0.15, trem = opts.tremor ?? null;
  const upd = 24;
  const kF = (opts.smooth ?? 0) > 0 ? 1 - Math.exp(-upd / (sr * opts.smooth!)) : 1;
  const kA = (opts.smoothAmp ?? 0) > 0 ? 1 - Math.exp(-upd / (sr * opts.smoothAmp!)) : 1;
  const kP = (opts.smooth ?? 0) > 0 ? 1 - Math.exp(-upd / (sr * opts.smooth! * 1.6)) : 1;
  const S: VoxParams = { ...DEFAULTS }, P: VoxParams = { ...DEFAULTS };
  let sInit = false;
  const res = [new KRes(sr), new KRes(sr), new KRes(sr), new KRes(sr), new KRes(sr)];
  const hpc = opts.hpc ? [4950, 5900, 7000].filter((F) => F * fs < sr * 0.42).map((F, k) => { const r = new KRes(sr); r.set(F * fs, 380 + k * 160); return r; }) : [];
  const nasRes = new KRes(sr); nasRes.set(270, 100);
  const fric = new SVF(sr, 4000, 1.5), tiltLP = new SVF(sr, 3000, 0.5), aspHP = new SVF(sr, whisper ? 1300 : 400, 0.6);
  const w = new Wander(rng, 3 * (opts.driftRate ?? 1)), wSlow = new Wander(rng, 0.7 * (opts.driftRate ?? 1));
  const wTrem = trem ? new Wander(rng, trem.rate * 0.7) : null;
  let segI = 0, phase = 0, periodAmp = 1, periodCount = 0, prevSrc = 0, lastFlow = 0, curJ = 0, tremAmp = 1;
  let av = 0, ah = 0, af = 0, f0 = 120, oq = 0.55, sub = 0, nas = 0;
  const segs = score.segs;
  for (let i = 0; i < n; i++) {
    if (i % upd === 0) {
      const t = i / sr;
      while (segI < segs.length - 1 && t >= segs[segI].t0 + segs[segI].dur) segI++;
      const s = segs[segI];
      if (s) {
        const e = EASE[s.curve](clamp((t - s.t0) / s.dur));
        for (const key of KEYS) P[key] = s.A[key] + (s.B[key] - s.A[key]) * e;
        if (t > score.duration) P.av = P.ah = P.af = 0;
      }
      if (!sInit || (kF === 1 && kA === 1)) { for (const key of KEYS) S[key] = P[key]; sInit = true; }
      else for (const key of KEYS) { const c = key === 'av' || key === 'ah' || key === 'af' ? kA : key === 'f0' ? kP : kF; S[key] += c * (P[key] - S[key]); }
      res[0].set(S.F1 * fs, S.B1 * (whisper ? 1.6 : 1) * (1 + S.nas * 1.5));
      res[1].set(S.F2 * fs, S.B2 * (whisper ? 1.6 : 1) * (1 + S.nas * 0.4));
      res[2].set(S.F3 * fs, S.B3 * (whisper ? 1.6 : 1) * (1 + S.nas * 0.4));
      res[3].set(S.F4 * fs, S.B4 * (whisper ? 1.6 : 1) * (1 + S.nas * 0.4));
      res[4].set(S.F5 * fs, S.B5 * (whisper ? 1.6 : 1) * (1 + S.nas * 0.4));
      fric.set(S.ff, S.fq);
      tiltLP.set(clamp(5200 - S.tilt * 4600, 300, 8000), 0.5);
      av = S.av; ah = S.ah; af = S.af; oq = clamp(S.oq, 0.2, 0.9); sub = S.sub; nas = S.nas;
      let semis = w.next(upd / sr) * drift * 0.5 + wSlow.next(upd / sr) * drift;
      if (vib) semis += Math.sin(TAU * vib.rate * t + (vib.phase ?? 0)) * vib.depth * clamp(t / (vib.delay || 0.001));
      if (trem && wTrem) {
        const tw = Math.sin(TAU * trem.rate * t) * 0.75 + wTrem.next(upd / sr) * 0.5;
        semis += tw * trem.depth;
        tremAmp = 1 + tw * (trem.amp ?? 0.1);
      }
      f0 = S.f0 * ps * Math.pow(2, semis / 12);
    }
    // glottal source: Rosenberg pulse, differentiated (lip radiation)
    const f = Math.max(20, f0 * (1 + curJ));
    phase += f / sr;
    if (phase >= 1) {
      phase -= 1; periodCount++;
      curJ = (rng() * 2 - 1) * jitter * (1 + sub * 4);
      periodAmp = 1 + (rng() * 2 - 1) * shimmer;
      if (sub > 0 && periodCount & 1) periodAmp *= 1 - sub * 0.75;
    }
    const tp = oq * 0.62, tn = oq * 0.38;
    const flow = phase < tp ? 0.5 * (1 - Math.cos((Math.PI * phase) / tp)) : phase < tp + tn ? Math.cos((Math.PI * (phase - tp)) / (2 * tn)) : 0;
    const dflow = (flow - lastFlow) * (sr / Math.max(f, 50)) * 0.12;
    lastFlow = flow;
    let src = whisper ? 0 : dflow * av * periodAmp * tremAmp;
    const nz = rng() * 2 - 1;
    src += aspHP.process(nz) * (whisper ? (av * 0.9 + ah) * 2.2 : ah * 2.2 + av * breath * (0.4 + flow) * 0.6);
    src = tiltLP.process(src);
    if (nas > 0) src = src * (1 - nas * 0.6) + nasRes.process(src) * nas * 0.5;
    let y = src;
    for (let k = 0; k < 5; k++) y = res[k].process(y);
    for (let k = 0; k < hpc.length; k++) y = hpc[k].process(y);
    fric.process(rng() * 2 - 1);
    y += (fric.bp + fric.hp * 0.25) * af * 0.6;
    out[i] = y - prevSrc * 0.6;
    prevSrc = y;
  }
  const pres = opts.presence ?? (whisper ? 13 : 0);
  if (pres) {
    const hs = new Biquad(sr, 'highshelf', 1800, 0.7, pres), pk = new Biquad(sr, 'peak', 3200, 1.2, pres * 0.35);
    for (let i = 0; i < n; i++) out[i] = pk.process(hs.process(out[i]));
  }
  if (opts.eq) for (const [type, fq, q, g] of opts.eq) {
    if (fq >= sr * 0.45) continue;
    const bq = new Biquad(sr, type, fq, q, g);
    for (let i = 0; i < n; i++) out[i] = bq.process(out[i]);
  }
  if (!Number.isFinite(out[0])) out.fill(0);
  return out;
}

/** vowel formant targets (adult male, Hz) */
export const VOWELS: Record<string, [number, number, number, number]> = {
  a: [740, 1180, 2450, 3400], i: [280, 2250, 2950, 3600], ue: [330, 1450, 2400, 3400], u: [310, 850, 2250, 3300],
  e: [430, 2000, 2650, 3500], ae: [620, 1760, 2550, 3500], oe: [480, 1320, 2450, 3400], o: [450, 830, 2450, 3400],
  or: [590, 900, 2450, 3400], schwa: [520, 1450, 2500, 3500], oo: [360, 780, 2300, 3300], uh: [600, 1200, 2450, 3400],
};
export function vowelParams(v: string): { F1: number; F2: number; F3: number; F4: number } {
  const f = VOWELS[v] ?? VOWELS.schwa;
  return { F1: f[0], F2: f[1], F3: f[2], F4: f[3] };
}
