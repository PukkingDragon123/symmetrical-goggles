// The truck's voice. A port of the author's own realtime engine from หลอนยันปลายทาง (effective-octo-train/
// src/audio/EngineSound.js + src/audio/Synth/engineModel.js), retuned for a big old straight-six:
//   * a piston pulse model rendered offline into seamless loops (3 rpm layers x on/off load), played at
//     playbackRate = rpm / baseRpm through fixed exhaust resonances, a soft drive shaper and a load/rpm low-pass
//   * intake roar amplitude-modulated by the firing pulses, gear whine, idle hunting, rev limiter, decel pops
//   * BUSHED's recorded idle / gravel loops layered in (veh_idle near idle rpm, veh_gravel under the tyres)
//   * the CC0 brush-scrape loop when the truck shoves through undergrowth, splashes in water
//   * procedural one-shots: crash thuds by severity, glass crack, tyre blow-out, steam hiss, the winch motor
// Everything is spatial (a PannerNode at the hood) and goes through BUSHED's sfx bus and reverb.
import * as THREE from 'three';
import { audio, type Voice } from '../audio/audio';
import { SOUNDS } from '../audio/bank';

// ---- extra sound ids (CC0 recordings reused from หลอนยันปลายทาง, credited in CREDITS.md) ---------------------------
const f = (name: string, n: number) => Array.from({ length: n }, (_, i) => `assets/sfx/truck/${name}_${i + 1}.mp3`);
Object.assign(SOUNDS, {
  truck_scrape: { files: f('bush_scrape', 3), vol: 0.8, cat: 'sfx', loop: true, spatial: true, refDist: 3, maxDist: 60 },
  truck_knock: { files: f('metal_knock', 4), vol: 1.0, cat: 'sfx', spatial: true, refDist: 2, maxDist: 50, rateJitter: 0.08 },
  truck_shift: { files: f('gear_shift', 3), vol: 0.6, cat: 'sfx', spatial: true, refDist: 1, maxDist: 15, rateJitter: 0.05 },
  truck_splash: { files: f('splash', 2), vol: 0.9, cat: 'sfx', spatial: true, refDist: 3, maxDist: 60, rateJitter: 0.1 },
});

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- DSP (ported from effective-octo-train/src/audio/Synth/dsp.js) ------------------------------------------------
function rngFrom(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class SVF {
  private ic1 = 0; private ic2 = 0; private a1 = 0; private a2 = 0; private a3 = 0;
  constructor(private sr: number, fc: number, q: number) {
    const g = Math.tan((Math.PI * clamp(fc, 5, sr * 0.47)) / sr), k = 1 / Math.max(q, 0.05);
    this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  process(x: number): number {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }
}
class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private b0: number; private b1: number; private b2: number; private c1: number; private c2: number;
  constructor(sr: number, hp: boolean, fc: number, q = 0.707) {
    const w0 = (2 * Math.PI * clamp(fc, 5, sr * 0.47)) / sr, cw = Math.cos(w0), al = Math.sin(w0) / (2 * q), a0 = 1 + al;
    this.b0 = (hp ? (1 + cw) / 2 : (1 - cw) / 2) / a0; this.b1 = (hp ? -(1 + cw) : 1 - cw) / a0; this.b2 = this.b0;
    this.c1 = (-2 * cw) / a0; this.c2 = (1 - al) / a0;
  }
  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.c1 * this.y1 - this.c2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
function normalize(a: Float32Array, target: number): void {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 1e-9) for (let i = 0; i < a.length; i++) a[i] *= target / m;
}

// ---- the pulse model (engineModel.js): a straight-six with a lazy cam and a rusty pipe --------------------------------
const SIX = {
  cylinders: 6, imbalance: [1.0, 0.93, 1.05, 0.97, 1.02, 0.9], pulseWidth: 0.42, snap: 0.45, rasp: 0.2,
  valveTick: 0.07, mech: 0.05, jitter: 0.035, ampVar: 0.14,
};
function pulseShape(phi: number, w: number): number {
  if (phi < 0) return 0;
  const x = phi / w, main = x * Math.exp(1 - x), y = (phi - w * 1.6) / (w * 1.3);
  return main + (y > 0 ? -0.38 * y * Math.exp(1 - y) : 0);
}
function snapShape(phi: number, w: number): number { if (phi < 0) return 0; const x = phi / (w * 0.12); return x * Math.exp(1 - x); }

/** seamless loop of whole engine cycles at a fixed rpm and load */
function renderEngineLoop(sr: number, rpm: number, load: number, seconds: number, seed: number): { buf: Float32Array; baseRpm: number } {
  const rng = rngFrom(seed), cfg = SIX;
  const cycle = 120 / rpm, cycles = Math.max(4, Math.round(seconds / cycle));
  const n = Math.round(cycles * cycle * sr), out = new Float32Array(n);
  const exact = (cycles * 120 * sr) / n, w = (exact / 60) * 2 * Math.PI, interval = (4 * Math.PI) / cfg.cylinders;
  const events: { s: number; amp: number }[] = [];
  const fires = cycles * cfg.cylinders;
  for (let k = 0; k < fires; k++) {
    const c = k % cfg.cylinders;
    const t = ((interval * (k + 0.5)) / w) * sr + (rng() * 2 - 1) * cfg.jitter * (interval / w) * sr;
    events.push({ s: t, amp: cfg.imbalance[c] * (1 + (rng() * 2 - 1) * cfg.ampVar) * (0.35 + 0.65 * load) });
  }
  const pw = cfg.pulseWidth * (1.15 - 0.3 * load);
  const len = Math.ceil(((pw * 7) / w) * sr);
  const snapAmp = cfg.snap * (0.4 + load);
  for (const e of events) {
    const raspAmp = cfg.rasp * (0.3 + 0.9 * load) * e.amp, s0 = Math.floor(e.s), fr = s0 - e.s;
    for (let j = 0; j < len; j++) {
      const idx = (((s0 + j) % n) + n) % n;
      const phi = ((j + fr) / sr) * w;
      let v = pulseShape(phi, pw) * e.amp + snapShape(phi, pw) * snapAmp * e.amp;
      if (phi < pw * 1.2) v += (rng() * 2 - 1) * raspAmp * Math.exp(-phi / (pw * 0.35));
      out[idx] += v;
    }
  }
  const tick = new SVF(sr, 4200, 3);
  for (const e of events) {
    const off = ((Math.PI * 0.8) / w) * sr;
    for (let k = 0; k < 2; k++) {
      const at = Math.floor(e.s + off * (1 + k * 1.7)), L = Math.floor(0.004 * sr);
      for (let j = 0; j < L; j++) out[(((at + j) % n) + n) % n] += tick.process((rng() * 2 - 1) * Math.exp(-j / (0.0007 * sr))) * cfg.valveTick * 3;
    }
  }
  const mech = new SVF(sr, 1800, 0.7);
  let env = 0;
  for (let i = 0; i < n; i++) { env += (Math.abs(out[i]) - env) * 0.004; out[i] += mech.process(rng() * 2 - 1) * cfg.mech * (0.3 + env * 2); }
  const lp = new Biquad(sr, false, 6500), hp = new Biquad(sr, true, 18);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) out[i] = hp.process(lp.process(out[i]));
  normalize(out, 0.7);
  return { buf: out, baseRpm: exact };
}

/** short noise/thump buffers for impacts, glass, blow-outs and steam */
function oneShot(ctx: AudioContext, kind: 'thud' | 'crunch' | 'glass' | 'pop' | 'hiss' | 'clank', seed: number): AudioBuffer {
  const sr = ctx.sampleRate, dur = kind === 'hiss' ? 2 : kind === 'thud' ? 0.7 : kind === 'crunch' ? 0.9 : 0.5;
  const n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), rng = rngFrom(seed);
  const lp = new SVF(sr, kind === 'glass' ? 6000 : kind === 'hiss' ? 5000 : 900, 0.7);
  const bp = new SVF(sr, kind === 'clank' ? 2200 : 1400, 4);
  for (let i = 0; i < n; i++) {
    const t = i / sr, r = rng() * 2 - 1;
    let v = 0;
    if (kind === 'thud') v = Math.sin(2 * Math.PI * (55 - 25 * t) * t) * Math.exp(-t * 7) * 1.2 + lp.process(r) * Math.exp(-t * 14);
    else if (kind === 'crunch') v = lp.process(r) * Math.exp(-t * 6) * (0.6 + 0.4 * Math.sin(t * 90 + rng())) + bp.process(r) * 0.6 * Math.exp(-t * 9) + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 9);
    else if (kind === 'glass') v = (r - lp.process(r)) * Math.exp(-t * 9) * (rng() < 0.03 ? 3 : 1);
    else if (kind === 'pop') v = (r * Math.exp(-t * 30) + Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 18)) * 1.2 + lp.process(r) * 0.5 * Math.exp(-t * 3);
    else if (kind === 'hiss') v = (r - lp.process(r) * 0.6) * 0.5 * smooth(0, 0.05, t) * smooth(dur, dur - 0.05, t);
    else v = bp.process(r) * Math.exp(-t * 16) * 2 + Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 22) * 0.6;
    d[i] = v;
  }
  normalize(d, 0.9);
  return b;
}

const _v = new THREE.Vector3();

export class TruckAudio {
  private ctx: AudioContext | null = null;
  private ready = false;
  private building = false;
  private panner!: PannerNode;
  private out!: GainNode;
  private sum!: GainNode;
  private lp!: BiquadFilterNode;
  private layers: { s: AudioBufferSourceNode; g: GainNode; i: number; on: boolean; base: number }[] = [];
  private intakeBP!: BiquadFilterNode;
  private intakeLevel!: GainNode;
  private whine!: OscillatorNode;
  private whineGain!: GainNode;
  private winchOsc!: OscillatorNode;
  private winchGain!: GainNode;
  private hissGain!: GainNode;
  private shots = new Map<string, AudioBuffer>();
  private idleRec: Voice | null = null;
  private gravel: Voice | null = null;
  private scrape: Voice | null = null;
  private rpmS = 0;
  private loadS = 0;
  private onGain = 0;
  private startAt = 0;
  private prevLoad = 0;
  private crackle = 0;
  private wander = 0;
  private wanderT = 0;
  private wa = 0;
  private wb = 0;
  // state pushed by the truck each frame
  on = false;
  rpm = 700;
  load = 0;
  gear = 1;
  speed = 0;
  surface = 'gravel';
  scraping = 0;
  winch = 0;
  steam = 0;
  /** the listener sits in the cab: the engine is muffled through the firewall */
  inside = false;
  readonly pos = new THREE.Vector3();
  readonly bodyPos = new THREE.Vector3();
  private static LAYERS = [800, 1800, 3600];

  private init(): boolean {
    if (this.ready) return true;
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== 'running' || this.building) return false;
    this.building = true;
    this.ctx = ctx;
    const sfx = audio.buses.sfx!;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 3;
    this.panner.maxDistance = 400;
    this.panner.rolloffFactor = 1;
    this.panner.connect(sfx);
    if (audio.reverbIn) { const send = ctx.createGain(); send.gain.value = 0.18; this.panner.connect(send).connect(audio.reverbIn); }
    this.sum = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2) + 0.05 * x * x; }
    shaper.curve = curve;
    this.sum.connect(shaper);
    let node: AudioNode = shaper;
    for (const [fr, q, g] of [[85, 1.4, 5], [240, 2.0, 6], [520, 2.6, 3], [1150, 2, 1], [2600, 1.5, -5]]) {
      const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = fr; b.Q.value = q; b.gain.value = g;
      node.connect(b); node = b;
    }
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 32;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.6; this.lp.frequency.value = 1800;
    node.connect(hp).connect(this.lp);
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.lp.connect(this.out).connect(this.panner);
    // intake roar: pink-ish noise AM'd by the engine signal
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    { const d = noise.getChannelData(0), r = rngFrom(9); let b0 = 0, b1 = 0; for (let i = 0; i < d.length; i++) { const w = r() * 2 - 1; b0 = 0.99 * b0 + w * 0.05; b1 = 0.6 * b1 + w * 0.3; d[i] = b0 + b1; } normalize(d, 0.8); }
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true; ns.start();
    this.intakeBP = ctx.createBiquadFilter(); this.intakeBP.type = 'bandpass'; this.intakeBP.Q.value = 1.2; this.intakeBP.frequency.value = 400;
    const am = ctx.createGain(); am.gain.value = 0;
    this.intakeLevel = ctx.createGain(); this.intakeLevel.gain.value = 0;
    ns.connect(this.intakeBP).connect(am).connect(this.intakeLevel).connect(this.out);
    this.sum.connect(am.gain);
    // gear whine
    this.whine = ctx.createOscillator(); this.whine.type = 'triangle'; this.whine.frequency.value = 300;
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(this.out); this.whine.start();
    // winch motor: a buzzing saw wave through a band-pass plus the drum's rattle (noise)
    this.winchOsc = ctx.createOscillator(); this.winchOsc.type = 'sawtooth'; this.winchOsc.frequency.value = 95;
    const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 700; wbp.Q.value = 0.8;
    this.winchGain = ctx.createGain(); this.winchGain.gain.value = 0;
    this.winchOsc.connect(wbp).connect(this.winchGain).connect(this.panner); this.winchOsc.start();
    // steam hiss from under the hood
    const hs = ctx.createBufferSource(); hs.buffer = oneShot(ctx, 'hiss', 4); hs.loop = true; hs.start();
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    hs.connect(this.hissGain).connect(this.panner);
    // the pulse loops render in the background, one per tick, so nothing hitches
    const jobs: { rpm: number; load: number; i: number }[] = [];
    TruckAudio.LAYERS.forEach((rpm, i) => { for (const load of [0.9, 0.12]) jobs.push({ rpm, load, i }); });
    const sr = Math.min(ctx.sampleRate, 24000);
    const next = () => {
      const j = jobs.shift();
      if (!j) { this.ready = true; return; }
      const r = renderEngineLoop(sr, j.rpm, j.load, 1.9, 10 + j.i * 3 + (j.load > 0.5 ? 1 : 0));
      const b = ctx.createBuffer(1, r.buf.length, sr);
      b.copyToChannel(r.buf as Float32Array<ArrayBuffer>, 0);
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g).connect(this.sum);
      s.start(ctx.currentTime, Math.random() * b.duration);
      this.layers.push({ s, g, i: j.i, on: j.load > 0.5, base: r.baseRpm });
      setTimeout(next, 30);
    };
    setTimeout(next, 30);
    for (const k of ['thud', 'crunch', 'glass', 'pop', 'clank'] as const) this.shots.set(k, oneShot(ctx, k, k.length * 7));
    return false;
  }

  /** the engine starts (recorded starter + catch) or stops (a stall coughs) */
  setOn(on: boolean, opts: { instant?: boolean; stall?: boolean } = {}): void {
    if (on === this.on) return;
    this.on = on;
    const now = audio.ctx?.currentTime ?? 0;
    if (on) {
      if (!opts.instant) { audio.play('veh_start', { pos: this.pos, vol: 0.9 }); this.startAt = now + 1.1; }
      else this.startAt = now;
      this.rpmS = 900;
    } else if (opts.stall) audio.play('veh_stop', { pos: this.pos, vol: 0.8, rate: 0.85 });
    else audio.play('veh_stop', { pos: this.pos, vol: 0.7 });
  }

  /** an impact by severity (m/s into the obstacle) */
  impact(at: THREE.Vector3, speed: number, metal = true): void {
    const sev = clamp(speed / 10, 0, 1);
    this.shot(sev > 0.45 ? 'crunch' : 'thud', at, 0.35 + sev * 0.8, sev > 0.6 ? 0.8 : 1 + (Math.random() - 0.5) * 0.2);
    if (metal && sev > 0.25) audio.play('truck_knock', { pos: at, vol: 0.5 + sev * 0.5, rate: 0.6 + Math.random() * 0.2 });
  }
  shot(kind: 'thud' | 'crunch' | 'glass' | 'pop' | 'clank', at: THREE.Vector3, vol = 1, rate = 1): void {
    const ctx = this.ctx, b = this.shots.get(kind);
    if (!ctx || !b || !this.panner) return;
    const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const p = ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 3; p.maxDistance = 300;
    p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(g).connect(p).connect(audio.buses.sfx!);
    s.start();
    s.onended = () => { s.disconnect(); g.disconnect(); p.disconnect(); };
  }

  update(dt: number): void {
    if (!this.init() || !this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime, tc = 0.03;
    dt = clamp(dt, 0, 0.1);
    this.panner.positionX.setTargetAtTime(this.pos.x, now, 0.02);
    this.panner.positionY.setTargetAtTime(this.pos.y, now, 0.02);
    this.panner.positionZ.setTargetAtTime(this.pos.z, now, 0.02);
    const idle = 680, redline = 4200;
    const target = this.on ? Math.max(this.rpm, now < this.startAt + 0.6 ? idle * 0.95 : 0, 200) : 0;
    this.rpmS += (target - this.rpmS) * (1 - Math.exp(-dt * 9));
    this.loadS += (this.load - this.loadS) * (1 - Math.exp(-dt * 7));
    const onT = this.on && now >= this.startAt ? 1 : 0;
    this.onGain += (onT - this.onGain) * (1 - Math.exp(-dt * (this.on ? 2.2 : 3.5)));
    if (!this.on) this.rpmS *= Math.exp(-dt * 3.2);
    // a carburettor straight-six hunting at idle
    this.wanderT += dt * 2.2;
    while (this.wanderT >= 1) { this.wanderT -= 1; this.wa = this.wb; this.wb = Math.random() * 2 - 1; }
    const ws = this.wanderT * this.wanderT * (3 - 2 * this.wanderT);
    this.wander = this.wa + (this.wb - this.wa) * ws;
    const idleness = 1 - smooth(idle * 1.2, idle * 2.2, this.rpmS);
    let rpm = this.rpmS * (1 + this.wander * 0.035 * idleness);
    let limCut = 1;
    if (this.on && this.rpm >= redline + 150 && this.load > 0.5) { if ((now * 11) % 1 < 0.45) { limCut = 0.2; rpm -= 200; } }
    if (this.on && this.prevLoad > 0.55 && this.load < 0.15 && this.rpmS > 2600) this.crackle = 1.0;
    this.prevLoad = this.load;
    if (this.crackle > 0) { this.crackle -= dt; if (Math.random() < dt * 7) this.shot('pop', this.pos, 0.18 + Math.random() * 0.2, 1.3 + Math.random() * 0.4); }
    // layer crossfade (log rpm, equal power) x load
    const L = TruckAudio.LAYERS, lr = Math.log(Math.max(rpm, 50)), wts = [0, 0, 0];
    if (lr <= Math.log(L[0])) wts[0] = 1;
    else if (lr >= Math.log(L[2])) wts[2] = 1;
    else for (let i = 0; i < 2; i++) {
      const a = Math.log(L[i]), b = Math.log(L[i + 1]);
      if (lr >= a && lr <= b) { const t = (lr - a) / (b - a); wts[i] = Math.cos((t * Math.PI) / 2); wts[i + 1] = Math.sin((t * Math.PI) / 2); }
    }
    const ld = Math.max(0, this.loadS), onW = smooth(0.08, 0.7, ld);
    for (const l of this.layers) {
      l.g.gain.setTargetAtTime(wts[l.i] * (l.on ? onW : 1 - onW * 0.85), now, tc);
      l.s.playbackRate.setTargetAtTime(clamp(rpm / l.base, 0.05, 4), now, tc);
    }
    const rpmN = clamp(rpm / redline, 0, 1);
    this.sum.gain.setTargetAtTime(0.45 + ld * 0.5 + rpmN * 0.15, now, tc);
    const muffle = this.inside ? 0.45 : 0;
    this.lp.frequency.setTargetAtTime(clamp((900 + rpm * 0.6 + ld * 2200) * (1 - 0.4 * muffle), 250, 8000), now, tc);
    // recorded idle dominates near idle, the model takes over as the revs rise
    const recW = (1 - smooth(idle * 1.1, idle * 1.9, rpm)) * (1 - 0.6 * smooth(0.15, 0.6, ld));
    const level = this.onGain * 0.55 * (0.5 + 0.25 * ld + 0.25 * rpmN) * limCut * (1 - 0.55 * recW) * (this.ready ? 1 : 0);
    this.out.gain.setTargetAtTime(level, now, 0.02);
    if (this.on && !this.idleRec) this.idleRec = audio.play('veh_idle', { pos: this.pos, loop: true, vol: 0 });
    if (this.idleRec) {
      this.idleRec.setPos(this.pos);
      this.idleRec.setVol(this.onGain * 0.75 * (this.ready ? recW : 1) * limCut, 0.08);
      this.idleRec.setRate(clamp(rpm / idle, 0.6, 2.2), 0.08);
      if (!this.on && this.onGain < 0.02) { this.idleRec.stop(0.2); this.idleRec = null; }
    }
    this.intakeBP.frequency.setTargetAtTime(200 + rpm * 0.16, now, tc);
    this.intakeLevel.gain.setTargetAtTime(this.onGain * (0.04 + 0.35 * ld * (0.3 + rpmN)), now, tc);
    // gear whine (strong in first and reverse)
    const hzPerKmh = [45, 34, 20, 12, 9][clamp(this.gear, 0, 4)];
    this.whine.frequency.setTargetAtTime(Math.max(30, this.speed * 3.6 * hzPerKmh), now, 0.05);
    this.whineGain.gain.setTargetAtTime(smooth(2, 15, this.speed * 3.6) * (0.006 + 0.01 * Math.abs(this.loadS)) * (this.gear === 0 ? 2.5 : 1) * this.onGain, now, 0.05);
    // tyres: recorded gravel loop on loose ground, the road hum on asphalt is the model's whine + wind
    const loose = this.surface === 'gravel' || this.surface === 'dirt' || this.surface === 'bush' ? 1 : 0.25;
    const roll = smooth(0.5, 16, this.speed) * (0.35 + 0.65 * Math.min(1, this.speed / 22));
    if (roll > 0.01 && !this.gravel) this.gravel = audio.play('veh_gravel', { pos: this.bodyPos, loop: true, vol: 0 });
    if (this.gravel) {
      this.gravel.setPos(this.bodyPos);
      this.gravel.setVol(roll * loose * 0.9 * (this.inside ? 0.7 : 1), 0.12);
      this.gravel.setRate(clamp(0.78 + this.speed / 45, 0.7, 1.4), 0.1);
      if (roll < 0.005) { this.gravel.stop(0.3); this.gravel = null; }
    }
    // brush scraping along the doors
    if (this.scraping > 0.05 && !this.scrape) this.scrape = audio.play('truck_scrape', { pos: this.bodyPos, loop: true, vol: 0 });
    if (this.scrape) {
      this.scrape.setPos(this.bodyPos);
      this.scrape.setVol(clamp(this.scraping, 0, 1) * 0.8, 0.12);
      this.scrape.setRate(clamp(0.8 + this.speed * 0.04, 0.8, 1.4), 0.1);
      if (this.scraping < 0.02) { this.scrape.stop(0.25); this.scrape = null; }
    }
    this.winchGain.gain.setTargetAtTime(this.winch * 0.18, now, 0.05);
    this.winchOsc.frequency.setTargetAtTime(80 + this.winch * 40, now, 0.1);
    this.hissGain.gain.setTargetAtTime(this.steam * 0.12, now, 0.3);
    void _v;
  }

  stopAll(): void {
    this.idleRec?.stop(0.2); this.gravel?.stop(0.2); this.scrape?.stop(0.2);
    this.idleRec = this.gravel = this.scrape = null;
    this.on = false;
  }
}
