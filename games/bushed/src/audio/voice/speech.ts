// A spoken line as gibberish: the text's syllables become formant-synth segments (onsets, vowels, codas, stress,
// intonation, pauses), the speaker's preset sets the throat, pitch and rhythm, and then the line is made wrong:
// held vowels that sag, stutters, pauses in the wrong place, a tail sucked back in reverse, a whispered double a beat
// late in one ear, skips and bit-crushed words. The things in the bush add an octave-down throat, a second whining
// voice, growl, wet clicks and smacks, sometimes the whole line backwards.
//
// renderLine() returns a mono `main` (it comes from the speaker's mouth), a stereo `halo` (the whisper, the breaths,
// the reversed echoes: they sit around your head), a 60 fps mouth envelope for lip sync and the syllable timing for
// the typewriter.
//
// Segment rules, prosody plumbing, ghost layers and levels ported from the author's own game หลอนยันปลายทาง
// (effective-octo-train/src/audio/Synth/speech.js, gibberish.js); the English front end and the wrongness are new.
import { VoxScore, renderVox, vowelParams, type VoxOpts, type VoxParams } from './vox';
import { parseEnglish, type Phrase, type Syl, type Tone } from './english';
import type { VoicePreset } from './presets';
import { clamp, rngFrom, hashStr, SVF, Wander, Biquad, mixInto, reverse, bakeVerb, fadeIn, fadeOut, peakOf, loud50, noiseBurst, dB, TAU, type Rng } from './dsp';

// intonation contours (semitones over the voiced rhyme at u = 0, .25, .5, .75, 1)
const SHAPES: Record<Tone, number[]> = {
  M: [0.15, 0.05, 0, -0.1, -0.25],
  acc: [0.2, 1.3, 2.0, 1.5, 0.8],
  fall: [1.6, 2.2, 0.8, -1.4, -3.2],
  rise: [-0.6, -0.9, -0.1, 1.6, 3.8],
  low: [-0.5, -0.7, -0.9, -1.0, -1.1],
};
function toneAt(shape: number[], u: number): number {
  const x = clamp(u) * 4, i = Math.min(3, Math.floor(x)), f = x - i;
  return shape[i] + (shape[i + 1] - shape[i]) * f;
}

type F3 = { F1: number; F2: number; F3: number };
const PLACE: Record<string, string> = { p: 'lab', ph: 'lab', b: 'lab', m: 'lab', f: 'lab', w: 'lab', t: 'alv', th: 'alv', d: 'alv', n: 'alv', s: 'alv', l: 'alv', r: 'alv', c: 'pal', ch: 'pal', y: 'pal', k: 'vel', kh: 'vel', ng: 'vel' };
function locus(cons: string, V: F3): F3 | null {
  switch (PLACE[cons]) {
    case 'lab': return { F1: 260, F2: 850, F3: 2200 };
    case 'alv': return { F1: 280, F2: 1750, F3: 2650 };
    case 'pal': return { F1: 260, F2: 2150, F3: 2900 };
    case 'vel': return V.F2 > 1600 ? { F1: 260, F2: 2300, F3: 2500 } : { F1: 270, F2: 1250, F3: 2150 };
    default: return null;
  }
}
const toward = (L: F3 | null, V: F3, k: number): F3 => (L ? { F1: L.F1 + (V.F1 - L.F1) * k, F2: L.F2 + (V.F2 - L.F2) * k, F3: L.F3 + (V.F3 - L.F3) * k } : { F1: V.F1, F2: V.F2, F3: V.F3 });
const BURST: Record<string, [number, number, number]> = { lab: [1100, 0.6, 0.55], alv: [4300, 1.0, 0.8], pal: [3300, 1.5, 0.75] };
const ASPIRATED: Record<string, 1> = { kh: 1, th: 1, ph: 1, ch: 1 };
const PLOSIVES: Record<string, 1> = { k: 1, t: 1, p: 1, c: 1, kh: 1, th: 1, ph: 1, ch: 1, b: 1, d: 1 };
const FRIC: Record<string, [number, number, number, number]> = { s: [6000, 2.2, 0.75, 0.085], f: [3600, 0.55, 0.3, 0.07] };
const SONOR: Record<string, Partial<VoxParams>> = {
  m: { F1: 260, F2: 1000, F3: 2300, nas: 1 }, n: { F1: 260, F2: 1500, F3: 2600, nas: 1 }, ng: { F1: 260, F2: 2000, F3: 2700, nas: 1 },
  l: { F1: 360, F2: 1150, F3: 2700, nas: 0 }, r: { F1: 420, F2: 1300, F3: 1700, nas: 0 }, w: { F1: 300, F2: 650, F3: 2300, nas: 0 }, y: { F1: 270, F2: 2200, F3: 3000, nas: 0 },
};
const VOICED_ONSET: Record<string, 1> = { b: 1, d: 1, m: 1, n: 1, ng: 1, l: 1, r: 1, w: 1, y: 1 };
const CONTINUANT: Record<string, 1> = { m: 1, n: 1, ng: 1, l: 1, r: 1, w: 1, y: 1, '': 1 };
const STOP_FINAL: Record<string, 1> = { k: 1, t: 1, p: 1 };
const ROUND = new Set(['u', 'o', 'oo', 'or', 'ue']);

/** a preset resolved for one line */
interface Live {
  f0: number; fs: number; rate: number; breath: number; jitter: number; shimmer: number; creak: number; oq: number; tilt: number;
  tremor: VoicePreset['tremor']; drift: number; driftRate: number; tune: number; whisper: boolean; shout: boolean; female: boolean;
}

interface Edits { drags: Map<number, number>; stutters: Map<number, number>; pauses: Map<number, number>; lilt: Map<number, number>; sags: Set<number> }

/** where this line goes wrong (deterministic for text + speaker) */
function planEdits(phrases: Phrase[], p: VoicePreset, rng: Rng): Edits {
  const w = p.wrong;
  const e: Edits = { drags: new Map(), stutters: new Map(), pauses: new Map(), lilt: new Map(), sags: new Set() };
  const all: Syl[] = [];
  for (const ph of phrases) all.push(...ph.sylls);
  const N = all.length;
  if (!N) return e;
  const content = all.map((s, i) => [s, i] as const).filter(([s]) => s.stress);
  // too-slow vowels: one or two content words held and sagging
  const nd = Math.round(w.drag * (0.6 + N / 14) * (0.5 + rng()));
  for (let k = 0; k < nd && content.length; k++) { const [, i] = rng.pick(content); e.drags.set(i, 1.9 + rng() * 1.6 * w.drag); if (rng() < w.sag) e.sags.add(i); }
  // a stutter on a word start
  const starts = all.map((s, i) => [s, i] as const).filter(([s]) => s.wordStart && !s.fn);
  if (starts.length && rng() < w.stutter * 1.3) e.stutters.set(rng.pick(starts)[1], rng() < w.stutter * 0.6 ? 2 : 1);
  // pauses mid-phrase, between two words that belong together
  const inner = all.map((s, i) => [s, i] as const).filter(([s, i]) => s.wordStart && i > 0 && all[i - 1].word === s.word - 1);
  const np = rng() < w.pause ? 1 + (rng() < w.pause * 0.5 ? 1 : 0) : 0;
  for (let k = 0; k < np && inner.length; k++) e.pauses.set(rng.pick(inner)[1], 0.22 + rng() * 0.45 * (0.5 + w.pause));
  // uneven meter: every few syllables one is stretched and the next clipped
  if (w.lilt > 0.05) {
    const period = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < N; i++) if (i % period === period - 1) { e.lilt.set(i, 1 + 0.5 * w.lilt); if (i + 1 < N) e.lilt.set(i + 1, 1 - 0.3 * w.lilt); }
  }
  return e;
}

interface SylCtx {
  base: number; depth: number; shape: number[]; ds: number; amp: number; afterPause: boolean; prevStop: boolean;
  isLast: boolean; lineEnd: boolean; drag: number; sag: boolean; rng: Rng; P: Live; next: Syl | null; cut?: number;
}

function buildScore(phrases: Phrase[], P: Live, rng: Rng, ed: Edits, rateMul: number, lead: number): VoxScore {
  const sc = new VoxScore({ f0: P.f0, av: 0, oq: P.oq, tilt: P.tilt });
  const rate = clamp(P.rate * rateMul, 0.35, 2.4);
  const depth0 = P.tune * (P.whisper ? 0.55 : 1);
  if (lead > 0) sc.rest(lead);
  if (lead > 0.2) sc.breaths.push({ t: Math.max(0, lead - 0.34), dur: Math.min(0.4, lead), kind: 'in', gain: 1 });
  sc.speechStart = sc.duration;
  const total = phrases.reduce((n, p) => n + p.sylls.length, 0) || 1;
  let gi = 0, prevStop = false;
  for (let pi = 0; pi < phrases.length; pi++) {
    const ph = phrases[pi], N = ph.sylls.length;
    let afterPause = true;
    for (let si = 0; si < N; si++, gi++) {
      const sy = ph.sylls[si];
      const isLast = si === N - 1, lineEnd = isLast && pi === phrases.length - 1;
      if (ed.pauses.has(gi) && si > 0) { sc.seg(0.03, {}, { av: 0, ah: 0, af: 0 }); sc.rest(ed.pauses.get(gi)! / Math.max(0.6, rate)); afterPause = true; prevStop = false; }
      const lineProg = total > 1 ? gi / (total - 1) : 0, phProg = N > 1 ? si / (N - 1) : 0;
      let semis = 1.2 - lineProg * 2.4 + (0.6 - phProg * 1.2) + (rng() - 0.5) * 0.7;
      if (ph.exclaim) semis += 1.8;
      if (sy.stress && rng() < 0.3) semis += 0.9;
      const base = P.f0 * Math.pow(2, semis / 12);
      let ds = (1 / rate) * (sy.stress ? 1.05 : sy.fn ? 0.62 : 0.74) * (isLast ? 1.38 : 1) * (0.88 + rng() * 0.24) * (ed.lilt.get(gi) ?? 1);
      if (P.shout) ds *= 0.95;
      const depth = depth0 * (sy.stress ? 1 : 0.55);
      const drag = ed.drags.get(gi) ?? 1;
      const amp = (sy.stress ? 1 : sy.fn ? 0.72 : 0.84) * (1 - 0.2 * lineProg) * (0.9 + rng() * 0.2) * (P.shout ? 1.15 : 1);
      const ctx: SylCtx = { base, depth, shape: SHAPES[sy.tone], ds, amp, afterPause, prevStop, isLast, lineEnd, drag, sag: ed.sags.has(gi), rng, P, next: si + 1 < N ? ph.sylls[si + 1] : null };
      const reps = ed.stutters.get(gi) ?? 0;
      for (let r = 0; r < reps; r++) {
        syllable(sc, { ...sy, coda: '', fric: '', glide: '', long: false, stress: false }, { ...ctx, cut: 0.45, amp: amp * 0.85, isLast: false, lineEnd: false, drag: 1, sag: false, next: null });
        sc.seg(0.02, {}, { av: 0, ah: 0, af: 0 });
        sc.rest(0.05 + rng() * 0.1);
        ctx.afterPause = true; ctx.prevStop = false;
      }
      syllable(sc, sy, ctx);
      prevStop = !!STOP_FINAL[sy.coda];
      afterPause = false;
    }
    let pause = ph.pause / rate * (0.85 + rng() * 0.3);
    if (pi === phrases.length - 1) pause = Math.min(pause, 0.12);
    sc.seg(0.02, {}, { av: 0, ah: 0, af: 0 });
    if (pi < phrases.length - 1 && pause > 0.36 && !P.whisper && rng() < 0.6) { const bd = Math.min(0.4, pause * 0.7); sc.breaths.push({ t: sc.duration + pause - bd - 0.04, dur: bd, kind: 'in', gain: 0.7 }); }
    sc.speechEnd = sc.duration;
    sc.rest(pause);
  }
  return sc;
}

function syllable(sc: VoxScore, sy: Syl, c: SylCtx): void {
  const P = c.P, rng = c.rng, ds = c.ds, amp = c.amp, base = c.base, depth = c.depth, shape = c.shape;
  const V = vowelParams(sy.vowel), on = sy.onset, Lc = locus(on, V);
  const f = (u: number, extra = 0) => base * Math.pow(2, (toneAt(shape, u) * depth + extra) / 12);
  const micro = VOICED_ONSET[on] ? -0.4 : PLOSIVES[on] || FRIC[on] || on === 'h' ? 0.7 : 0;
  const place = PLACE[on];
  const sizz = P.female ? 1.12 : 1;
  sc.marks.push({ t: sc.duration, ci: sy.ci, ce: sy.ce, stress: sy.stress, vowel: sy.vowel });
  // s- before a stop (st, sp, sk)
  if (sy.pre === 's') sc.seg(0.06 * ds, { av: 0, ah: 0, af: 0.7 * amp, ff: 6000 * sizz, fq: 2.2, nas: 0, sub: 0, f0: f(0, 0.8) }, { af: 0.45 * amp });
  // ---- onset
  if (PLOSIVES[on]) {
    const clos = c.afterPause && !sy.pre ? 0.02 : c.prevStop ? 0.022 : 0.04 * ds;
    const voicedBar = on === 'b' || on === 'd';
    sc.seg(clos, { av: voicedBar ? 0.16 * amp : 0, ah: 0, af: 0, nas: 0, oq: P.oq, sub: 0, f0: f(0, -1), ...(Lc ?? {}), F1: 220 });
    const [bf, bq, bg] = place === 'vel' ? [clamp(V.F2 * 1.2, 1500, 3000), 2.2, 0.8] : BURST[place] ?? BURST.alv;
    sc.seg(0.009, { av: 0, af: bg * amp, ff: bf, fq: bq, ...toward(Lc, V, 0.15) }, { af: bg * 0.4 * amp });
    if (on === 'c' || on === 'ch') sc.seg((on === 'ch' ? 0.05 : 0.03) * ds, { af: 0.62 * amp, ff: 3300, fq: 1.6 }, { af: 0.35 * amp });
    if (ASPIRATED[on] && !sy.pre) sc.seg(0.05 * ds, { af: 0.05, ah: 0.5 * amp, ...toward(Lc, V, 0.5), F1: 300 }, { ah: 0.32 * amp, af: 0 });
    else if (!voicedBar) sc.seg(0.012, { af: 0, ah: 0.18 * amp }, { ah: 0.05 });
  } else if (FRIC[on]) {
    const [ff, fq, fa, d] = FRIC[on];
    sc.seg(d * ds, { av: 0, ah: 0, af: fa * amp, ff: ff * sizz, fq, nas: 0, sub: 0, f0: f(0, 0.8), ...(Lc ?? {}) }, { af: fa * 0.75 * amp });
  } else if (on === 'h') {
    sc.seg(0.055 * ds, { av: 0, af: 0, ah: 0.55 * amp, nas: 0, sub: 0, f0: f(0, 0.6), F1: V.F1, F2: V.F2, F3: V.F3 }, { ah: 0.42 * amp });
  } else if (SONOR[on]) {
    sc.seg(0.05 * ds, { av: 0.55 * amp, ah: 0, af: 0, sub: 0, oq: P.oq, f0: f(0, -0.4), ...SONOR[on] }, { av: 0.62 * amp });
  } else if (c.afterPause) {
    sc.seg(0.018, { av: 0, ah: 0.06 * amp, af: 0, nas: 0, sub: 0.3, F1: V.F1, F2: V.F2, F3: V.F3, f0: f(0) });
  }
  if (sy.cluster && SONOR[sy.cluster] && rng() < 0.8) sc.seg(0.03 * ds, { av: 0.6 * amp, af: 0, ah: 0, ...SONOR[sy.cluster] });
  // ---- rhyme: the vowel (+ sonorant coda) carries the tune
  const cut = c.cut ?? 1;
  const vd = (sy.long ? 0.15 : 0.08) * ds * c.drag * cut;
  const cd = sy.coda;
  const sonCoda = cd === 'm' || cd === 'n' || cd === 'ng' || cd === 'w' || cd === 'y';
  const cdur = sonCoda && cut === 1 ? (sy.long ? 0.05 : 0.07) * ds * (c.isLast ? 1.25 : 1) : 0;
  const R = vd + cdur, u1 = (vd * 0.3) / R, u2 = (vd * 0.75) / R, u3 = vd / R;
  const Fon = CONTINUANT[on] && on ? toward((SONOR[on] as F3) ?? null, V, 0.55) : toward(Lc, V, 0.5);
  const sag = c.sag ? -2.6 : c.drag > 1 ? -0.8 : 0;
  sc.seg(vd * 0.3, { av: amp, ah: 0, af: 0, nas: 0, sub: 0, oq: P.oq, ...Fon, F4: V.F4, f0: f(0, micro) }, { ...V, f0: f(u1) }, 'out');
  sc.seg(vd * 0.45, {}, { f0: f(u2, sag * 0.5), av: amp * 0.97 }, 'smooth');
  const G = sy.glide ? vowelParams(sy.glide) : null;
  const Lcoda = cd ? ((SONOR[cd] as F3 | undefined) ?? locus(cd === 'k' ? 'k' : cd === 't' ? 't' : 'p', V)) : null;
  const endF = G ? { F1: G.F1, F2: G.F2, F3: G.F3 } : Lcoda && cut === 1 ? toward(Lcoda, V, 0.55) : {};
  const fry = (c.lineEnd || (c.isLast && rng() < 0.5)) && !sonCoda && (sy.tone === 'fall' || sy.tone === 'low' || sy.tone === 'M') ? P.creak : 0;
  sc.seg(vd * 0.25, {}, { f0: f(u3, sag), av: amp * (STOP_FINAL[cd] ? 0.85 : 0.9), sub: fry, oq: fry ? 0.36 : P.oq, ...endF }, 'smooth');
  if (cut < 1) { sc.seg(0.018, {}, { av: 0, sub: 0.3 }); return; }
  // ---- coda
  const next = c.next;
  const flowsOn = !!next && !!CONTINUANT[next.onset] && !c.isLast && !sy.fric;
  if (sonCoda) {
    const S = SONOR[cd];
    sc.seg(cdur, { ...S, av: amp * (S.nas ? 0.62 : 0.7) }, { av: amp * (S.nas ? 0.45 : 0.4), f0: f(1, c.lineEnd && fry ? -1 : 0), sub: c.lineEnd ? P.creak * 0.6 : 0 });
    if (!flowsOn && !sy.fric) sc.seg(c.isLast ? 0.05 : 0.025, {}, { av: 0, sub: 0, ah: c.isLast && P.female ? 0.04 : 0 });
  } else if (STOP_FINAL[cd]) {
    sc.seg(0.012, {}, { av: 0, ah: 0 });
    sc.seg(0.03 * ds, { av: 0, ah: 0, af: 0 });
    if (cd === 't' && sy.fric !== 's' && rng() < 0.4) sc.seg(0.008, { af: 0.3 * amp, ff: 4300, fq: 1 }, { af: 0 }); // a released t
  } else if (c.isLast || !flowsOn) {
    sc.seg(c.isLast ? 0.07 : 0.03, {}, { av: 0, sub: fry * 0.5, ah: c.isLast ? 0.05 + (P.female ? 0.04 : 0) : 0, f0: f(1, c.isLast ? -0.8 : 0) });
    if (c.isLast) sc.seg(0.05, {}, { ah: 0 });
  }
  // fricative tail (-s, -f, -sh): English hiss at word ends
  if (sy.fric) {
    const [ff, fq, fa] = sy.fric === 's' ? [6000 * sizz, 2.2, 0.4] : sy.fric === 'ch' ? [3300, 1.6, 0.38] : [3600, 0.55, 0.18];
    sc.seg(0.075 * ds * (c.isLast ? 1.3 : 1), { av: 0, ah: 0, af: fa * amp, ff, fq, nas: 0, sub: 0 }, { af: 0 });
  }
}

// ------------------------------------------------------------------------------------------------ levels
/** gated K-weighted loudness (BS.1770-ish, mono, dB FS) */
function kLoud(a: Float32Array, sr: number): number {
  let K = Math.tan((Math.PI * 1681.97) / sr);
  const Vh = Math.pow(10, 4 / 20), Vb = Math.pow(Vh, 0.4997), Q1 = 0.7072;
  let a0 = 1 + K / Q1 + K * K;
  const b = [(Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0];
  const c = [(2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0];
  K = Math.tan((Math.PI * 38.135) / sr);
  const Q2 = 0.5003;
  a0 = 1 + K / Q2 + K * K;
  const d = [(2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
  const blk = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr);
  const sq = new Float64Array(Math.ceil(a.length / hop) + 1);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - c[0] * y1 - c[1] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const z = y - 2 * u1 + u2 - d[0] * z1 - d[1] * z2;
    u2 = u1; u1 = y; z2 = z1; z1 = z;
    sq[Math.floor(i / hop)] += z * z;
  }
  const per = blk / hop, blocks: number[] = [];
  for (let k = 0; k + per <= sq.length; k++) { let e = 0; for (let j = 0; j < per; j++) e += sq[k + j]; blocks.push(e / blk); }
  const L = (z: number) => -0.691 + 10 * Math.log10(z + 1e-20);
  const abs = blocks.filter((z) => L(z) > -70);
  if (!abs.length) return -99;
  const mean = (arr: number[]) => arr.reduce((p, q) => p + q, 0) / arr.length;
  const rel = L(mean(abs)) - 10, g = abs.filter((z) => L(z) > rel);
  return L(mean(g.length ? g : abs));
}

function breathEvent(sr: number, kind: 'in' | 'out', dur: number, fs: number, rng: Rng, rattle = 0): Float32Array {
  const sc = new VoxScore({ f0: 60, av: 0 });
  if (kind === 'in') {
    sc.seg(dur * 0.6, { ah: 0.02, af: 0.03, ff: 2600, fq: 0.7, F1: 620, F2: 1200, F3: 2500, F4: 3500, B1: 160, B2: 200, B3: 260 }, { ah: 0.5, af: 0.16, F2: 1450 }, 'in');
    sc.seg(dur * 0.4, {}, { ah: 0, af: 0, F2: 1600, F1: 500 }, 'out');
  } else {
    sc.seg(dur * 0.25, { ah: 0.04, af: 0, F1: 520, F2: 1350, F3: 2450, F4: 3400, B1: 140, B2: 180, B3: 240 }, { ah: 0.45 }, 'out');
    sc.seg(dur * 0.75, {}, { ah: 0, F1: 450, F2: 1200 }, 'in');
  }
  const b = renderVox(sr, sc, { rng, whisper: true, formantScale: fs, presence: 8, tail: 0.05 });
  if (rattle > 0) {
    const r = new VoxScore({ f0: 34 + rng() * 10, av: 0, oq: 0.3, sub: 0.9 });
    r.seg(dur * 0.35, { av: 0, ah: 0.05, F1: 400, F2: 1100, F3: 2400 }, { av: 0.35 * rattle }, 'in');
    r.seg(dur * 0.45, {}, { av: 0.25 * rattle, f0: 28 });
    r.seg(dur * 0.2, {}, { av: 0 });
    const rb = renderVox(sr, r, { rng, jitter: 0.12, shimmer: 0.4, breath: 0.4, formantScale: fs * 0.9, tail: 0.05 });
    mixInto(b, rb, 0, (loud50(b, sr) / Math.max(1e-6, loud50(rb, sr))) * 0.8);
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ the line
export interface LineArgs { text: string; preset: VoicePreset; seed?: number; sr?: number; maxDur?: number; tone?: 'whisper' | 'shout' | '' }
export interface LineResult {
  sr: number;
  main: Float32Array; haloL: Float32Array; haloR: Float32Array;
  /** mouth openness 0..1 and rounded-vowel flag at 60 fps from the start of the buffer */
  env: Float32Array; rnd: Uint8Array;
  /** per syllable: [ci, ce, t] */
  sylls: Float32Array;
  speechStart: number; speechEnd: number; duration: number;
}

function live(p: VoicePreset, text: string, tone: string): Live {
  const shout = tone === 'shout' || (/!/.test(text) && /[A-Z]{3,}/.test(text));
  const P: Live = {
    f0: p.f0, fs: p.fs, rate: p.rate, breath: p.breath, jitter: p.jitter, shimmer: p.shimmer, creak: p.creak, oq: p.oq, tilt: p.tilt,
    tremor: p.tremor, drift: p.drift, driftRate: p.driftRate, tune: p.tune, whisper: !!p.whisper || tone === 'whisper', shout, female: p.fs > 1.08,
  };
  if (shout) { P.f0 *= 1.35; P.oq = 0.42; P.tilt = 0.1; P.rate *= 1.05; P.breath *= 0.6; }
  return P;
}

function voxOpts(P: Live, rng: Rng, extra: Partial<VoxOpts> = {}): VoxOpts {
  const whisper = extra.whisper ?? P.whisper;
  return {
    rng, formantScale: P.fs, jitter: P.jitter, shimmer: P.shimmer, breath: P.breath, whisper,
    drift: P.drift, driftRate: P.driftRate, smooth: 0.009, smoothAmp: 0.004, tremor: P.tremor, tail: 0.3, hpc: true,
    ...extra,
    eq: whisper ? [['highshelf', 5000, 0.7, 6]] : [['highshelf', 2200, 0.7, 5], ['highshelf', 5000, 0.7, 9]],
  };
}

/** time-preserving glitches in place: a skip (grain repeated), a bit-crushed span, a dropout, a ring-mod wobble */
function glitch(a: Float32Array, sr: number, from: number, to: number, amount: number, rng: Rng): void {
  const n = Math.round(amount * (1 + (to - from) / 3) * (0.4 + rng()));
  for (let k = 0; k < n; k++) {
    const t0 = from + rng() * Math.max(0.01, to - from - 0.2);
    const s0 = Math.floor(t0 * sr);
    const kind = rng();
    if (kind < 0.35) {
      // a skip: one grain stuck, like a scratched disc
      const g = Math.floor((0.035 + rng() * 0.05) * sr), reps = 2 + Math.floor(rng() * 3);
      const grain = a.slice(s0, s0 + g);
      for (let r = 1; r <= reps; r++) for (let i = 0; i < g; i++) { const j = s0 + r * g + i; if (j < a.length) { const w = i < 32 ? i / 32 : i > g - 32 ? (g - i) / 32 : 1; a[j] = a[j] * (1 - w) + grain[i] * w; } }
    } else if (kind < 0.65) {
      // bit-crushed: sample-and-hold at a low rate, few levels
      const len = Math.floor((0.06 + rng() * 0.1) * sr), hold = 5 + Math.floor(rng() * 7), lv = 10 + Math.floor(rng() * 14);
      let h = 0;
      for (let i = 0; i < len && s0 + i < a.length; i++) { if (i % hold === 0) h = Math.round(a[s0 + i] * lv) / lv; a[s0 + i] = h; }
    } else if (kind < 0.82) {
      // a dropout with a tick
      const len = Math.floor((0.03 + rng() * 0.05) * sr);
      for (let i = 0; i < len && s0 + i < a.length; i++) a[s0 + i] *= i < 24 || i > len - 24 ? 0.5 : 0.02;
      if (s0 < a.length) a[s0] += 0.12 * (rng() < 0.5 ? -1 : 1);
    } else {
      // ring-mod wobble
      const len = Math.floor((0.1 + rng() * 0.12) * sr), fr = 28 + rng() * 50;
      for (let i = 0; i < len && s0 + i < a.length; i++) { const w = Math.sin((Math.PI * i) / len); a[s0 + i] *= 1 - w + w * Math.sin((TAU * fr * i) / sr) * 1.3; }
    }
  }
}

/** a span [s0, s1) replaced by itself reversed (crossfaded): a word sucked back into the mouth */
function reverseSpan(a: Float32Array, s0: number, s1: number, xf: number): void {
  s0 = Math.max(0, s0); s1 = Math.min(a.length, s1);
  const n = s1 - s0;
  if (n < 64) return;
  const seg = a.slice(s0, s1);
  for (let i = 0; i < n; i++) { const w = Math.min(1, i / xf, (n - i) / xf); a[s0 + i] = a[s0 + i] * (1 - w) + seg[n - 1 - i] * w; }
}

export function renderLine(args: LineArgs): LineResult {
  const sr = args.sr ?? 22050;
  const p = args.preset, cr = p.cryptid;
  const text = args.text || '...';
  const seed = (args.seed ?? hashStr(text + '|' + p.label)) >>> 0;
  const rng = rngFrom(seed), rng2 = rngFrom(seed ^ 0x9e3779b9);
  const P = live(p, text, args.tone ?? '');
  let phrases = parseEnglish(text);
  if (!phrases.length || !phrases.some((ph) => ph.sylls.length)) {
    phrases = [{ sylls: [{ pre: '', onset: 'm', cluster: '', vowel: 'schwa', long: true, glide: '', coda: 'm', fric: '', tone: 'fall', ci: 0, ce: text.length, word: 0, wordStart: true, wordEnd: true, stress: true, fn: false }], pause: 0.2, question: false, exclaim: false, breakCi: text.length }];
  }
  const ed = planEdits(phrases, p, rngFrom(seed ^ 0x5bd1e995));
  const ghostly = !!cr || p.wrong.double > 0.5;
  const lead = cr ? 0.45 : ghostly ? 0.5 : 0.3;
  let score = buildScore(phrases, P, rngFrom(seed), ed, 1, lead);
  const maxDur = args.maxDur ?? 9;
  const spoken = score.speechEnd - score.speechStart;
  if (spoken > maxDur) score = buildScore(phrases, P, rngFrom(seed), ed, Math.min(2.2, spoken / maxDur), lead);
  // a growl rides the whole voicing
  if (cr?.growl) for (const s of score.segs) { s.A.sub = Math.max(s.A.sub, cr.growl * 0.7); s.B.sub = Math.max(s.B.sub, cr.growl * 0.7); }
  const tail = ghostly ? 1.3 : 0.6;
  const n = Math.max(1, Math.ceil((score.duration + tail) * sr));
  const fit = (x: Float32Array) => { if (x.length === n) return x; const y = new Float32Array(n); y.set(x.subarray(0, Math.min(n, x.length))); return y; };
  const t0 = score.speechStart, t1 = score.speechEnd;
  // ---- main voice
  const main = fit(renderVox(sr, score, voxOpts(P, rngFrom(seed + 1), { tail })));
  if (p.radio) {
    const hp = new Biquad(sr, 'highpass', 420, 0.8), lp = new Biquad(sr, 'lowpass', 2900, 0.9), pk = new Biquad(sr, 'peak', 1500, 1, 5);
    for (let i = 0; i < n; i++) main[i] = Math.tanh(pk.process(lp.process(hp.process(main[i]))) * 2.2) * 0.6;
  }
  if (p.warm) { const ls = new Biquad(sr, 'lowshelf', 260, 0.7, p.warm), hs = new Biquad(sr, 'highshelf', 4200, 0.7, -p.warm * 0.6); for (let i = 0; i < n; i++) main[i] = hs.process(ls.process(main[i])); }
  if (cr?.backwards && rng2() < cr.backwards) reverseSpan(main, Math.floor(t0 * sr), Math.floor((t1 + 0.08) * sr), 256);
  // the last syllable sucked back
  const lastMark = score.marks[score.marks.length - 1];
  if (lastMark && rng2() < p.wrong.reverseTail) reverseSpan(main, Math.floor((lastMark.t + (t1 - lastMark.t) * 0.35) * sr), Math.floor((t1 + 0.06) * sr), 200);
  if (p.wrong.glitch > 0.02) glitch(main, sr, t0, t1, p.wrong.glitch, rng2);
  // tame plosive spikes, then level by loudness (a creaky old man and a bright kid read equally loud)
  let T = loud50(main, sr) * 2.8;
  if (T > 1e-9) for (let i = 0; i < n; i++) main[i] = Math.tanh(main[i] / T) * T;
  const tgt = P.whisper ? -22.5 : P.shout ? -16.5 : -18.5;
  const g0 = Math.min(dB(tgt + (p.gain ?? 0) - kLoud(main, sr)), 0.95 / Math.max(peakOf(main), 1e-9));
  for (let i = 0; i < n; i++) main[i] *= g0;
  const ref = loud50(main, sr);
  // ---- the mouth: an envelope from the main voice, before the creature layers
  const fr = Math.floor(sr / 60), nf = Math.ceil(n / fr);
  const env = new Float32Array(nf), rnd = new Uint8Array(nf);
  let top = 1e-9;
  for (let k = 0; k < nf; k++) { let e = 0; for (let i = k * fr; i < Math.min(n, (k + 1) * fr); i++) e += main[i] * main[i]; env[k] = Math.sqrt(e / fr); }
  const sorted = Array.from(env).sort((a, b) => a - b);
  top = Math.max(1e-6, sorted[Math.floor(sorted.length * 0.95)]);
  let mi = 0;
  for (let k = 0; k < nf; k++) {
    env[k] = clamp(env[k] / top);
    const t = k / 60;
    while (mi + 1 < score.marks.length && score.marks[mi + 1].t <= t) mi++;
    rnd[k] = score.marks[mi] && ROUND.has(score.marks[mi].vowel) ? 1 : 0;
  }
  // ---- creature layers
  if (cr) {
    if (cr.sub > 0) {
      const half = renderVox(sr / 2, score, voxOpts(P, rngFrom(seed + 2), { tail, pitchScale: 0.5, formantScale: P.fs * 0.84, jitter: P.jitter + 0.02, whisper: false, tremor: null }));
      const sub = new Float32Array(n), lp = new SVF(sr, 900, 0.6);
      for (let i = 0; i < n; i++) { const x = i * 0.5, k = x | 0; sub[i] = lp.process(k + 1 < half.length ? half[k] + (half[k + 1] - half[k]) * (x - k) : 0); }
      mixInto(main, sub, 0, (ref * dB(-9 + 8 * cr.sub)) / Math.max(1e-9, loud50(sub, sr)));
    }
    if (cr.layers > 0) {
      // a second voice a fifth up, thin and breathy, drifting on its own
      const whine = fit(renderVox(sr, score, voxOpts(P, rngFrom(seed + 4), { tail, pitchScale: 1.5, formantScale: P.fs * 1.22, breath: 0.4, drift: P.drift * 1.6, whisper: !!cr.whisper })));
      mixInto(main, whine, Math.floor(0.012 * sr), (ref * dB(-16 + 8 * cr.layers)) / Math.max(1e-9, loud50(whine, sr)));
    }
    if (cr.whistle > 0) {
      const wh = new Float32Array(n), w = new Wander(rng2, 2.5);
      let ph = 0;
      for (let i = 0; i < n; i++) { const k = Math.min(nf - 1, Math.floor(i / fr)); ph += (TAU * (2100 + w.next(1 / sr) * 500)) / sr; wh[i] = Math.sin(ph) * env[k] * env[k]; }
      noiseBurst(wh, sr, rng2, t0, t1 - t0, { f: 4200, q: 3, a: 0.2, gain: 0.25 });
      mixInto(main, wh, 0, (ref * dB(-12 + 8 * cr.whistle)) / Math.max(1e-9, loud50(wh, sr)));
    }
    if (cr.wet > 0) {
      // throat gurgle: fast flutter over a few spans
      const spans = 1 + Math.floor(cr.wet * 3 * rng2());
      for (let k = 0; k < spans; k++) {
        const s0 = Math.floor((t0 + rng2() * (t1 - t0)) * sr), len = Math.floor((0.25 + rng2() * 0.5) * sr), hz = 18 + rng2() * 16;
        for (let i = 0; i < len && s0 + i < n; i++) { const w = Math.sin((Math.PI * i) / len); main[s0 + i] *= 1 - w * cr.wet * 0.7 * (0.5 + 0.5 * Math.sin((TAU * hz * i) / sr)); }
      }
    }
    if (cr.clicks > 0) {
      // wet clicks and smacks between syllables
      const cl = new Float32Array(n);
      for (let k = 0; k < score.marks.length; k++) {
        if (rng2() > cr.clicks * 0.55) continue;
        const at = score.marks[k].t - 0.02 - rng2() * 0.05;
        const f = rng2() < 0.5 ? 1200 + rng2() * 1800 : 600 + rng2() * 500;
        noiseBurst(cl, sr, rng2, at, 0.006 + rng2() * 0.01, { f, q: 6 + rng2() * 10, a: 0.0004, gain: 1 });
        if (rng2() < 0.4) noiseBurst(cl, sr, rng2, at + 0.012, 0.03, { f: 900, fEnd: 300, q: 4, a: 0.002, gain: 0.5 }); // the wet smack after
      }
      if (peakOf(cl) > 0) mixInto(main, cl, 0, (ref * dB(-4 + 6 * cr.clicks)) / Math.max(1e-9, loud50(cl, sr)));
    }
    const pk = peakOf(main);
    if (pk > 0.95) for (let i = 0; i < n; i++) main[i] *= 0.95 / pk;
  }
  // ---- the halo: whisper double, breaths, reversed echoes (stereo, around your head)
  const haloL = new Float32Array(n), haloR = new Float32Array(n);
  const left = rng2() < 0.5;
  const put = (buf: Float32Array, at: number, gain: number, pan: number) => {
    const gl = gain * Math.sqrt(0.5 * (1 - pan)), gr = gain * Math.sqrt(0.5 * (1 + pan));
    mixInto(haloL, buf, at, gl); mixInto(haloR, buf, at, gr);
  };
  const breaths = score.breaths.slice();
  if (ghostly) {
    breaths.push({ t: t1 + 0.05 + rng2() * 0.2, dur: 0.6, kind: 'out', gain: 0.9 });
    const stress = score.marks.filter((m) => m.stress);
    if (stress.length && rng2() < 0.6) breaths.push({ t: rng2.pick(stress).t, dur: 0.35, kind: 'in', gain: 0.8 }); // a breath that doesn't match the words
  }
  for (const b of breaths) {
    const buf = breathEvent(sr, b.kind, b.dur, P.fs, rngFrom(seed + 17 + Math.floor(b.t * 1000)), cr ? 0.7 : 0);
    put(buf, Math.floor(b.t * sr), (ref * dB(cr ? -15 : ghostly ? -14 : -23) * b.gain) / Math.max(1e-9, loud50(buf, sr)), (rng2() - 0.5) * 0.6);
  }
  if (p.wrong.double > 0.05 && !P.whisper) {
    const wh = renderVox(sr, score, voxOpts(P, rngFrom(seed + 3), { tail, whisper: true, formantScale: P.fs * 1.04, tremor: null }));
    const delay = Math.floor((0.03 + rng2() * 0.05 + p.wrong.double * 0.04) * sr);
    put(wh, delay, (ref * dB((cr ? -21 : -17) + (cr ? 7 : 10) * p.wrong.double)) / Math.max(1e-9, loud50(wh, sr)), left ? -0.85 : 0.85);
    if (ghostly) {
      // reverse-reverb swell: the first words' whisper, reversed, reverberated, reversed back, rushing into the line
      const segLen = Math.min(wh.length - Math.floor(t0 * sr), Math.floor(1.1 * sr));
      if (segLen > sr * 0.15) {
        const seg = wh.slice(Math.floor(t0 * sr), Math.floor(t0 * sr) + segLen);
        const sw = reverse(bakeVerb(reverse(seg), sr, { room: 0.95, damp: 0.3, wet: 1, dry: 0, tail: lead + 0.1, predelay: 0 }));
        const tl = Math.floor((lead + 0.1) * sr), keep = Math.min(sw.length, tl + Math.floor(0.3 * sr));
        const cutSw = sw.slice(0, keep); fadeOut(cutSw, sr, 0.18);
        put(cutSw, Math.floor(t0 * sr) - tl, (ref * dB((cr ? -16 : -12) + 6 * p.wrong.double)) / Math.max(1e-9, loud50(cutSw, sr)), left ? 0.5 : -0.5);
      }
    }
  } else if (P.whisper) {
    // a whisperer's double is a voiced murmur far behind
    const dv = renderVox(sr, score, voxOpts(P, rngFrom(seed + 3), { tail, whisper: false, pitchScale: 0.5, formantScale: P.fs * 0.9 }));
    put(dv, Math.floor(0.06 * sr), (ref * dB(-20)) / Math.max(1e-9, loud50(dv, sr)), left ? -0.7 : 0.7);
  }
  if (lastMark && rng2() < 0.35 + p.wrong.reverseTail * 0.6) {
    // the last word again, backwards, quietly, after the line
    let k = score.marks.length - 1;
    while (k > 0 && score.marks[k - 1].ci >= lastMark.ci - 12 && score.marks[k].ci > score.marks[k - 1].ci && k > score.marks.length - 3) k--;
    const s0 = Math.floor(score.marks[k].t * sr), s1 = Math.min(n, Math.floor((t1 + 0.05) * sr));
    if (s1 - s0 > sr * 0.08) {
      const echo = bakeVerb(reverse(main.slice(s0, s1)), sr, { room: 0.85, damp: 0.5, wet: 0.6, dry: 0.5, tail: 0.5 });
      fadeIn(echo, sr, 0.05); fadeOut(echo, sr, 0.3);
      put(echo, Math.floor((t1 + 0.12 + rng2() * 0.2) * sr), (ref * dB(-15 + 6 * p.wrong.reverseTail)) / Math.max(1e-9, loud50(echo, sr)), left ? 0.7 : -0.7);
    }
  }
  for (const ch of [main, haloL, haloR]) { for (let i = 0; i < n; i++) if (!Number.isFinite(ch[i])) ch[i] = 0; const pk = peakOf(ch); if (pk > 0.95) for (let i = 0; i < n; i++) ch[i] *= 0.95 / pk; }
  fadeIn(main, sr, 0.004); fadeOut(main, sr, 0.08); fadeOut(haloL, sr, 0.1); fadeOut(haloR, sr, 0.1);
  const sylls = new Float32Array(score.marks.length * 3);
  score.marks.forEach((m, i) => { sylls[i * 3] = m.ci; sylls[i * 3 + 1] = m.ce; sylls[i * 3 + 2] = m.t; });
  return { sr, main, haloL, haloR, env, rnd, sylls, speechStart: t0, speechEnd: t1, duration: n / sr };
}

/** 16-bit PCM WAV of a rendered line (main + halo to stereo), for reports and tests */
export function lineToWav(r: LineResult): ArrayBuffer {
  const n = r.main.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, r.sr, true); v.setUint32(28, r.sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const l = clamp(r.main[i] * 0.8 + r.haloL[i], -1, 1), rr = clamp(r.main[i] * 0.8 + r.haloR[i], -1, 1);
    v.setInt16(44 + i * 4, l * 32767, true); v.setInt16(46 + i * 4, rr * 32767, true);
  }
  return buf;
}
