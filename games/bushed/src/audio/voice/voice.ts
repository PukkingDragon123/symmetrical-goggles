// Voices. voice.say(speakerId, text, opts) renders the line as uncanny gibberish (./speech.ts, in a worker) and plays
// it from the speaker's mouth (HRTF, follows an Object3D) with its whispers and reversed echoes around your head.
// The returned VoiceLine is the clock everything else syncs to: line.revealed() is how much of the text the
// typewriter shows, line.mouth() is the mouth shape right now, line.done resolves when the words end.
//
//   const l = voice.say('grandpa', 'This place is yours now.', { close: true });
//   await l.done;
//
// The speaker id picks a preset (./presets.ts: gerard, doug, marcel, grandpa, hodag, squonk...); unknown names get a
// stable hashed voice. With audio locked (no gesture yet) or the voice bus muted the line still runs on a silent
// clock, so subtitles and mouths keep working.
import * as THREE from 'three';
import { audio } from '../audio';
import { presetFor, VOICES, type VoicePreset } from './presets';
import { renderLine, lineToWav, type LineResult, type LineArgs } from './speech';
import { readingTime } from './english';

export interface SayOpts {
  /** where the voice comes from: an object (followed; a person's head) or a point. Omit: inside your head (2D) */
  at?: THREE.Object3D | THREE.Vector3 | null;
  volume?: number;
  /** longest the words may take (s): over it, the speaker speeds up */
  maxDur?: number;
  tone?: 'whisper' | 'shout' | '';
  seed?: number;
  /** no distance fade (dialogue close-ups, narration) */
  close?: boolean;
}

const SR_BY_QUALITY: Record<string, number> = { low: 16000, medium: 20000, high: 22050, ultra: 24000 };
const _p = new THREE.Vector3();

/** where a person's mouth is: a human model's head height, a creature's head bone, or the object itself */
function mouthPos(o: THREE.Object3D | THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  if (o instanceof THREE.Vector3) return out.copy(o);
  const hm = o.userData.humanModel as { height?: number } | undefined;
  o.getWorldPosition(out);
  if (hm?.height) out.y += hm.height * 0.92;
  return out;
}

export class VoiceLine {
  readonly ready: Promise<boolean>;
  readonly done: Promise<void>;
  res: LineResult | null = null;
  private resolveDone!: () => void;
  private t0 = 0;           // ctx time (audio) or performance time (silent) of buffer start
  private silent = true;
  private started = false;
  private stopped = false;
  private est: number;
  private src: AudioBufferSourceNode | null = null;
  private halo: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private haloGain: GainNode | null = null;
  panner: PannerNode | null = null;
  private born = performance.now() / 1000;
  private open = 0;
  constructor(readonly speaker: string, readonly text: string, readonly opts: SayOpts, private sys: VoiceSystem, job: Promise<LineResult | null>) {
    this.est = readingTime(text);
    this.done = new Promise<void>((r) => (this.resolveDone = r));
    this.ready = job.then((r) => { if (r && !this.stopped) this.start(r); else if (!this.stopped) this.startSilent(); return !!r; }, () => { this.startSilent(); return false; });
  }

  /** seconds since the buffer started (negative while still rendering) */
  get time(): number {
    if (!this.started) return -1;
    const ctx = audio.ctx;
    return this.silent || !ctx ? performance.now() / 1000 - this.t0 : ctx.currentTime - this.t0;
  }
  get speechStart(): number { return this.res?.speechStart ?? 0; }
  get speechEnd(): number { return this.res ? this.res.speechEnd : this.est; }
  /** still saying words */
  get speaking(): boolean { const t = this.time; return t >= 0 && t < this.speechEnd + 0.05 && !this.stopped; }
  get finished(): boolean { return this.stopped || (this.started && this.time >= this.speechEnd); }
  /** how long since say() was called (s) */
  get age(): number { return performance.now() / 1000 - this.born; }

  /** characters of the text the typewriter should show now */
  revealed(): number {
    const t = this.time, n = this.text.length;
    if (t < 0) return 0;
    if (t >= this.speechEnd || this.stopped) return n;
    let r = 0;
    const s = this.res?.sylls;
    if (s && s.length) {
      for (let i = 0; i < s.length; i += 3) if (s[i + 2] <= t + 0.04) r = Math.max(r, s[i + 1]); else break;
    } else r = Math.floor((t / Math.max(0.5, this.est)) * n);
    // carry spaces and punctuation with the word before them
    while (r < n && !/[A-Za-z0-9]/.test(this.text[r])) r++;
    return Math.min(n, r);
  }

  /** the mouth right now: open 0..1 and rounded vowel */
  mouth(out: { open: number; round: number }): { open: number; round: number } {
    const t = this.time;
    if (t < 0 || this.finished) { this.open *= 0.6; out.open = this.open; out.round = 0; return out; }
    const r = this.res;
    let target = 0, round = 0;
    if (r) {
      const k = Math.min(r.env.length - 1, Math.max(0, Math.floor(t * 60)));
      target = r.env[k]; round = r.rnd[k];
    } else {
      // no audio: flap with the reading clock
      target = t < this.est ? 0.35 + 0.35 * Math.abs(Math.sin(t * 11.3) * Math.sin(t * 3.7)) : 0;
    }
    this.open += (target - this.open) * 0.6;
    out.open = this.open; out.round = round;
    return out;
  }

  stop(fade = 0.15): void {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = audio.ctx;
    if (ctx) {
      const t = ctx.currentTime;
      for (const g of [this.gain, this.haloGain]) if (g) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3)); }
      for (const s of [this.src, this.halo]) try { s?.stop(t + fade + 0.05); } catch { /* not started */ }
    }
    this.finish();
  }

  /** follow a moving speaker */
  update(): void {
    if (!this.panner || !this.opts.at || !audio.ctx) return;
    mouthPos(this.opts.at, _p);
    const p = this.panner, t = audio.ctx.currentTime;
    p.positionX.setTargetAtTime(_p.x, t, 0.03); p.positionY.setTargetAtTime(_p.y, t, 0.03); p.positionZ.setTargetAtTime(_p.z, t, 0.03);
    if (this.haloGain && !this.opts.close) this.haloGain.gain.setTargetAtTime(this.haloLevel(), t, 0.1);
  }

  private haloLevel(): number {
    if (this.opts.close || !this.opts.at) return 1;
    const d = mouthPos(this.opts.at, _p).distanceTo(audio.listenerPos);
    return Math.max(0, Math.min(1, 3 / Math.max(1, d))) ** 1.5;
  }

  private finish(): void {
    this.sys.release(this);
    this.resolveDone();
  }

  private startSilent(): void {
    if (this.started) return;
    this.started = true; this.silent = true; this.t0 = performance.now() / 1000;
    setTimeout(() => this.finish(), (this.speechEnd + 0.1) * 1000);
  }

  private start(r: LineResult): void {
    this.res = r;
    const ctx = audio.ctx, bus = audio.buses.voice;
    this.started = true;
    if (!ctx || ctx.state !== 'running' || !bus || this.sys.muted) { this.silent = true; this.t0 = performance.now() / 1000; setTimeout(() => this.finish(), (r.speechEnd + 0.1) * 1000); return; }
    this.silent = false;
    const vol = this.opts.volume ?? 1;
    const main = ctx.createBuffer(1, r.main.length, r.sr);
    main.copyToChannel(r.main as Float32Array<ArrayBuffer>, 0);
    const halo = ctx.createBuffer(2, r.haloL.length, r.sr);
    halo.copyToChannel(r.haloL as Float32Array<ArrayBuffer>, 0); halo.copyToChannel(r.haloR as Float32Array<ArrayBuffer>, 1);
    const at = ctx.currentTime + 0.03;
    this.t0 = at;
    this.src = ctx.createBufferSource(); this.src.buffer = main;
    this.gain = ctx.createGain(); this.gain.gain.value = vol;
    this.src.connect(this.gain);
    let out: AudioNode = this.gain;
    if (this.opts.at) {
      const p = (this.panner = ctx.createPanner());
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = this.opts.close ? 3 : 1.6; p.maxDistance = 60; p.rolloffFactor = this.opts.close ? 0.3 : 1;
      mouthPos(this.opts.at, _p);
      p.positionX.value = _p.x; p.positionY.value = _p.y; p.positionZ.value = _p.z;
      this.gain.connect(p);
      out = p;
    }
    out.connect(bus);
    if (audio.reverbIn) { const send = ctx.createGain(); send.gain.value = 0.22; out.connect(send).connect(audio.reverbIn); }
    this.halo = ctx.createBufferSource(); this.halo.buffer = halo;
    this.haloGain = ctx.createGain(); this.haloGain.gain.value = vol * this.haloLevel();
    this.halo.connect(this.haloGain).connect(bus);
    this.src.start(at); this.halo.start(at);
    this.src.onended = () => { try { this.src?.disconnect(); this.halo?.disconnect(); this.gain?.disconnect(); this.haloGain?.disconnect(); this.panner?.disconnect(); } catch { /* gone */ } };
    setTimeout(() => this.finish(), (r.speechEnd + 0.1) * 1000 + 30);
  }
}

interface Job { args: LineArgs; resolve: (r: LineResult | null) => void; low: boolean }

export class VoiceSystem {
  /** silent clock only (still drives subtitles and mouths) */
  muted = false;
  /** sample rate of new renders (set from the quality preset) */
  sr = 22050;
  readonly presets = VOICES;
  private worker: Worker | null = null;
  private workerBroken = false;
  private queue: Job[] = [];
  private busy: Job | null = null;
  private nextId = 1;
  private pending = new Map<number, Job>();
  private cache = new Map<string, Promise<LineResult | null>>();
  private active = new Set<VoiceLine>();

  /** use the quality preset's sample rate (low: 16 kHz .. ultra: 24 kHz) */
  setQuality(name: string): void { this.sr = SR_BY_QUALITY[name] ?? 22050; }

  /** add or replace a voice */
  register(id: string, preset: VoicePreset): void { VOICES[id] = preset; }

  /** say a line now. Returns the line (its clock, mouth, typewriter and done promise) */
  say(speakerId: string, text: string, opts: SayOpts = {}): VoiceLine {
    const job = this.render(speakerId, text, opts, false);
    const line = new VoiceLine(speakerId, text, opts, this, job);
    this.active.add(line);
    // at most four voices at once: the oldest gives way
    if (this.active.size > 4) { const old = this.active.values().next().value; old?.stop(0.2); }
    return line;
  }

  /** render a line ahead of time (low priority) so say() starts at once */
  prepare(speakerId: string, text: string, opts: SayOpts = {}): void { void this.render(speakerId, text, opts, true); }

  /** stop every voice */
  stop(fade = 0.15): void { for (const l of [...this.active]) l.stop(fade); }

  /** is anybody talking */
  get speaking(): boolean { for (const l of this.active) if (l.speaking) return true; return false; }

  update(): void { for (const l of this.active) l.update(); }

  release(l: VoiceLine): void { this.active.delete(l); }

  /** a rendered line as a 16-bit stereo WAV (tests, the audio report) */
  async renderWav(speakerId: string, text: string, opts: SayOpts = {}): Promise<ArrayBuffer | null> {
    const r = await this.render(speakerId, text, opts, false);
    return r ? lineToWav(r) : null;
  }

  private key(speakerId: string, text: string, o: SayOpts): string { return `${speakerId}|${o.seed ?? 0}|${o.tone ?? ''}|${o.maxDur ?? 0}|${this.sr}|${text}`; }

  private render(speakerId: string, text: string, o: SayOpts, low: boolean): Promise<LineResult | null> {
    const k = this.key(speakerId, text, o);
    const hit = this.cache.get(k);
    if (hit) { this.cache.delete(k); this.cache.set(k, hit); if (!low) this.promote(k); return hit; }
    const preset = presetFor(speakerId);
    const args: LineArgs = { text, preset, sr: this.sr, maxDur: o.maxDur, tone: o.tone, seed: o.seed !== undefined ? (o.seed ^ hash(speakerId + text)) >>> 0 : undefined };
    const p = new Promise<LineResult | null>((resolve) => {
      const job: Job = { args, resolve, low };
      (job as Job & { key: string }).key = k;
      if (low) this.queue.push(job); else this.queue.unshift(job);
      this.pump();
    });
    this.cache.set(k, p);
    while (this.cache.size > 14) this.cache.delete(this.cache.keys().next().value!);
    return p;
  }

  private promote(k: string): void {
    const i = this.queue.findIndex((j) => (j as Job & { key: string }).key === k);
    if (i > 0) { const [j] = this.queue.splice(i, 1); this.queue.unshift(j); }
  }

  private getWorker(): Worker | null {
    if (this.worker || this.workerBroken) return this.worker;
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; res?: LineResult; error?: string }>) => {
        const job = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        if (!e.data.ok) console.warn('[voice] render failed', e.data.error);
        job?.resolve(e.data.ok ? e.data.res ?? null : null);
        this.busy = null;
        this.pump();
      };
      this.worker.onerror = (e) => { console.warn('[voice] worker unavailable, rendering on the main thread', e.message); this.workerBroken = true; this.worker = null; const j = this.busy; this.busy = null; if (j) this.queue.unshift(j); this.pump(); };
    } catch { this.workerBroken = true; this.worker = null; }
    return this.worker;
  }

  private pump(): void {
    if (this.busy || !this.queue.length) return;
    const job = this.queue.shift()!;
    this.busy = job;
    const w = this.getWorker();
    if (w) {
      const id = this.nextId++;
      this.pending.set(id, job);
      w.postMessage({ id, args: job.args });
      return;
    }
    // no worker: render on the main thread, after this frame
    setTimeout(() => {
      let r: LineResult | null = null;
      try { r = renderLine(job.args); } catch (e) { console.warn('[voice] render failed', e); }
      job.resolve(r);
      this.busy = null;
      this.pump();
    }, 0);
  }
}

function hash(s: string): number { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const voice = new VoiceSystem();
