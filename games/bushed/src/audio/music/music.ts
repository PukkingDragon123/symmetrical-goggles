// Music: "Kettle Lake Waltz" (./songs.ts) rendered once in a worker, played on the music bus with long crossfades.
//
//   music.play('theme')                       menu / loading (loops)
//   music.play('campfire', { at: firePos })    the campground version, from the fire (loops)
//   music.play('ending', { hold: true })       a script takes the music: auto-switching waits until music.release()
//   music.stop(3)
//   installMusic(game)                         theme in the menu and while loading, the campfire tune near a lit
//                                              fire at night, silence otherwise; ducks under dialogue
import * as THREE from 'three';
import { audio } from '../audio';
import { voice } from '../voice/voice';
import { renderSong, type SongName, type SongAudio } from './songs';
import type { Game } from '../../game/game';

export interface MusicOpts {
  /** crossfade seconds */
  fade?: number;
  /** play from a point in the world (the campfire); omit for 2D */
  at?: THREE.Vector3 | null;
  volume?: number;
  /** a script owns the music until release() */
  hold?: boolean;
}

interface Playing { name: SongName; src: AudioBufferSourceNode; gain: GainNode; panner: PannerNode | null; vol: number; k: number; fade: number }

export class MusicSystem {
  /** overall level of the score under everything else */
  volume = 0.42;
  sr = 22050;
  held = false;
  private bufs = new Map<SongName, Promise<AudioBuffer | null>>();
  private cur: Playing | null = null;
  private wantName: SongName | null = null;
  private worker: Worker | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private pending = new Map<number, (s: SongAudio | null) => void>();
  private nextId = 1;
  private duckK = 1;
  private token = 0;
  private starting: SongName | null = null;

  get current(): SongName | null { return this.wantName; }

  /** render (once) and keep a song ready */
  prepare(name: SongName): Promise<AudioBuffer | null> {
    let p = this.bufs.get(name);
    if (!p) {
      p = this.renderAudio(name).then((s) => {
        if (!s) return null;
        const ctx = audio.init();
        const b = ctx.createBuffer(2, s.L.length, s.sr);
        b.copyToChannel(s.L as Float32Array<ArrayBuffer>, 0); b.copyToChannel(s.R as Float32Array<ArrayBuffer>, 1);
        return b;
      });
      this.bufs.set(name, p);
    }
    return p;
  }

  play(name: SongName, o: MusicOpts = {}): void {
    if (o.hold) this.held = true;
    this.ensureTick();
    const fade = o.fade ?? 2.5;
    if (this.wantName === name && (this.cur?.name === name || this.starting === name)) {
      if (o.at && this.cur?.panner) this.setPos(o.at);
      if (o.volume !== undefined && this.cur) this.cur.vol = o.volume;
      return;
    }
    this.starting = name;
    this.wantName = name;
    const tok = ++this.token;
    void this.prepare(name).then((buf) => {
      if (tok !== this.token) return;
      this.starting = null;
      if (!buf) return;
      const ctx = audio.ctx, bus = audio.buses.music;
      if (!ctx || !bus) return;
      this.fadeOut(fade);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = name !== 'ending';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      let out: AudioNode = gain;
      let panner: PannerNode | null = null;
      if (o.at) {
        panner = ctx.createPanner();
        panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = 3.5; panner.rolloffFactor = 1.2; panner.maxDistance = 40;
        panner.positionX.value = o.at.x; panner.positionY.value = o.at.y + 1; panner.positionZ.value = o.at.z;
        gain.connect(panner); out = panner;
      }
      src.connect(gain); out.connect(bus);
      const vol = o.volume ?? 1;
      src.start(ctx.currentTime + 0.02);
      src.onended = () => { try { src.disconnect(); gain.disconnect(); panner?.disconnect(); } catch { /* gone */ } if (this.cur?.src === src) { this.cur = null; if (this.wantName === 'ending') { this.wantName = null; this.held = false; } } };
      this.cur = { name, src, gain, panner, vol, k: 0, fade: Math.max(0.05, fade) };
    });
  }

  stop(fade = 2.5): void { this.token++; this.wantName = null; this.starting = null; this.fadeOut(fade); }

  /** hand the music back to installMusic's automatic choice */
  release(fade = 3): void { this.held = false; this.stop(fade); }

  setPos(p: THREE.Vector3): void {
    const pn = this.cur?.panner, ctx = audio.ctx;
    if (!pn || !ctx) return;
    pn.positionX.setTargetAtTime(p.x, ctx.currentTime, 0.2); pn.positionY.setTargetAtTime(p.y + 1, ctx.currentTime, 0.2); pn.positionZ.setTargetAtTime(p.z, ctx.currentTime, 0.2);
  }

  /** per frame: dialogue ducks the score */
  update(dt: number): void {
    const want = voice.speaking ? 0.5 : 1;
    this.duckK += (want - this.duckK) * Math.min(1, dt * (want < this.duckK ? 4 : 0.8));
    const c = this.cur, ctx = audio.ctx;
    if (c && ctx) {
      // fade in on our own clock so the ducking and the fade never fight over the gain's automation
      if (ctx.state === 'running') c.k = Math.min(1, c.k + dt / c.fade);
      c.gain.gain.setTargetAtTime(c.vol * this.volume * this.duckK * c.k * c.k, ctx.currentTime, 0.08);
    }
  }

  /** before installMusic() runs (the loading screen), the music keeps its own frame clock */
  installed = false;
  private raf = 0;
  private ensureTick(): void {
    if (this.installed || this.raf || typeof requestAnimationFrame === 'undefined') return;
    let last = performance.now();
    const f = (now: number) => {
      this.raf = 0;
      if (this.installed) return;
      this.update(Math.min(0.1, (now - last) / 1000)); last = now;
      this.raf = requestAnimationFrame(f);
    };
    this.raf = requestAnimationFrame(f);
  }

  private fadeOut(fade: number): void {
    const c = this.cur, ctx = audio.ctx;
    if (!c || !ctx) return;
    this.cur = null;
    const t = ctx.currentTime;
    c.gain.gain.cancelScheduledValues(t);
    c.gain.gain.setValueAtTime(c.gain.gain.value, t);
    c.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.05, fade));
    try { c.src.stop(t + fade + 0.1); } catch { /* stopped */ }
  }

  private renderAudio(name: SongName): Promise<SongAudio | null> {
    if (this.idle) { clearTimeout(this.idle); this.idle = null; }
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; res?: SongAudio; error?: string }>) => {
          const r = this.pending.get(e.data.id);
          this.pending.delete(e.data.id);
          if (!e.data.ok) console.warn('[music] render failed', e.data.error);
          r?.(e.data.ok ? e.data.res ?? null : null);
          // the worker goes away when nothing is left to render
          if (!this.pending.size) this.idle = setTimeout(() => { this.worker?.terminate(); this.worker = null; }, 8000);
        };
        this.worker.onerror = () => { this.worker = null; for (const [id, r] of this.pending) { this.pending.delete(id); r(null); } };
      } catch { this.worker = null; }
    }
    if (!this.worker) return new Promise((res) => setTimeout(() => { try { res(renderSong(name, this.sr)); } catch { res(null); } }, 0));
    const id = this.nextId++;
    return new Promise((res) => { this.pending.set(id, res); this.worker!.postMessage({ id, name, sr: this.sr }); });
  }
}

export const music = new MusicSystem();

const _fire = new THREE.Vector3();

/**
 * Boot step: the theme over the menu (and loading), the campfire version near a lit fire at night, silence in
 * between; the score ducks under dialogue.
 */
export function installMusic(g: Game): void {
  music.installed = true;
  music.sr = g.quality?.name === 'low' ? 16000 : 22050;
  voice.setQuality(g.quality?.name ?? 'high');
  void music.prepare('theme');
  // the opening cinematic's cues (src/game/cinematic: g.events 'music_cue'): the theme over the opening and the title,
  // eased out on arrival; 'finale' plays the ending; 'stop' fades out. While a cue holds the music, nothing auto-switches
  g.events.on('music_cue', (d: { cue?: string; fade?: number }) => {
    const cue = d?.cue, fade = d?.fade ?? 3;
    if (cue === 'opening' || cue === 'title') music.play('theme', { hold: true, fade });
    else if (cue === 'finale') music.play('ending', { hold: true, fade });
    else if (cue === 'arrive' || cue === 'stop') music.release(Math.max(4, fade * 2));
  });
  setTimeout(() => void music.prepare('campfire'), 6000);
  let fireT = 0;
  g.updaters.push((dt) => {
    music.update(dt);
    if (music.held) return;
    if (g.mode === 'menu' || g.mode === 'loading') { music.play('theme', { fade: 3 }); return; }
    fireT -= dt;
    if (fireT > 0) return;
    fireT = 0.5;
    // the campfire tune: close to a fire that's burning well
    let best = 1e9;
    for (const f of g.fires) {
      if (f.level() < 0.4) continue;
      const d = f.pos.distanceTo(g.player.pos);
      if (d < best) { best = d; _fire.copy(f.pos); }
    }
    if (best < 9 && g.mode !== 'drive') music.play('campfire', { at: _fire, fade: 4, volume: 0.9 });
    else if (music.current) music.stop(music.current === 'theme' ? 7 : 5);
  });
}
