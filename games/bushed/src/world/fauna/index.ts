// FAUNA: the birds (src/creatures/birds) and the bugs (./bugs.ts) wired to the game.
//   import { installFauna } from './world/fauna';
//   const fauna = installFauna(game);          // after the forest, ground cover and creatures exist; returns at once,
//                                              // the bird models stream in (fauna.ready resolves when they have)
// It reads game.player, game.hands.heldItem, game.forest.stands, game.ground.solids, game.hour, game.weather,
// game.fires, game.flashOn / game.flashlight, game.camera, game.events ('gunshot', 'felled', 'offer') and the
// mouse (a click swats mosquitoes), and pushes its update onto game.updaters. Sounds go through game.sound; the
// mosquito whine and the slap are synthesised here (the bank has neither).
import * as THREE from 'three';
import { Birds, BIRD_FOODS, type BirdWorld, type GroundFood } from '../../creatures/birds';
import { Bugs, type BugWorld } from './bugs';
import { WORLD, SPOTS, biome, clearance, heightAt } from '../layout';
import { outdoorTemp } from '../../game/survival';
import { propsNear, removeProp } from '../../game/physprops';
import { ITEMS } from '../../game/items';
import { input } from '../../core/input';
import { audio } from '../../audio/audio';
import { floatText } from '../../ui/float';

export { Birds, BIRD_FOODS } from '../../creatures/birds';
export { Bugs } from './bugs';

/** the slice of the Game this reads (all optional extras degrade gracefully) */
interface GameLike {
  scene: THREE.Scene; camera: THREE.Camera; hour: number; day: number;
  player: { pos: THREE.Vector3; speed: number; crouch: boolean; sprinting?: boolean; addShake(a: number): void };
  hands?: { heldItem: string; charging?: boolean; equip?(i: string | null): void } | null;
  forest?: unknown; ground?: { solids?(x: number, z: number, r: number): unknown[] } | null;
  weather?: { rain: number; fog: number; cloud: number };
  fires?: { pos: THREE.Vector3; level: () => number }[];
  flashOn?: boolean; mode?: string; indoors?: boolean;
  lastSwingAt?: number;
  events: { on(e: string, f: (d: any) => void): void };
  updaters: ((dt: number) => void)[];
  sound(id: string, pos?: THREE.Vector3, vol?: number, rate?: number): void;
  take(id: string, n?: number): boolean;
  owns?(id: string): boolean;
}

export interface Fauna { birds: Birds; bugs: Bugs; ready: Promise<void>; update(dt: number): void; dispose(): void }

export function installFauna(game: GameLike): Fauna {
  const birds = new Birds();
  const bugs = new Bugs();
  game.scene.add(birds.object, bugs.object);
  const ready = birds.load().catch((e) => console.warn('[fauna] bird models failed', e));
  const said = new Map<string, number>();
  const say = (key: string, text: string, every = 120) => {
    const now = performance.now() / 1000, t = said.get(key);
    if (t !== undefined && now - t < every) return;
    said.set(key, now);
    floatText.say(text, { kind: 'thought', dur: 3.5 });
  };
  birds.onEvent = (ev, d) => {
    if (ev === 'hand') say('hand:' + d.who, d.who === 'jay' ? 'A whisky jack. It\'s looking at the food. It\'s looking at me.' : 'A chickadee! Right there. Don\'t breathe.', 90);
    if (ev === 'dive') say('loon', 'The loon slid under without a ripple.', 300);
  };

  // ---- the world as the birds and bugs see it (built once, refreshed in place)
  const forest = () => game.forest as { stands?(x: number, z: number, r: number): { x: number; y: number; z: number; r: number; h: number; crown: number; conifer: boolean; dead: boolean }[] } | null;
  const stands = (x: number, z: number, r: number) => forest()?.stands?.(x, z, r) ?? [];
  const solids = (x: number, z: number, r: number) => (game.ground?.solids?.(x, z, r) ?? []) as { kind: string; shape: string; x: number; y: number; z: number; r: number; h: number; x2?: number; y2?: number; z2?: number }[];
  const habitat = (x: number, z: number) => {
    const b = biome(x, z), tot = b.spruce + b.fir + b.pine + b.birch + b.cedar + 1e-6;
    return { conifer: (b.spruce + b.fir + b.pine) / tot, birch: b.birch / tot, burn: b.burn, density: b.density };
  };
  const open = (x: number, z: number) => {
    const b = biome(x, z), cl = clearance(x, z);
    return Math.min(1, b.burn * 1.3 + (cl > 0.25 && cl < 0.9 ? 0.55 : 0) + (1 - b.density) * 0.5 + (stands(x, z, 3).length ? -0.3 : 0.2));
  };
  const food = (x: number, z: number, r: number): GroundFood[] => {
    const out: GroundFood[] = [];
    for (const p of propsNear(new THREE.Vector3(x, heightAt(x, z), z), r)) {
      if (!p.itemId || p.obj.userData.unpaid || !ITEMS[p.itemId]?.food) continue;
      let root: THREE.Object3D = p.obj; while (root.parent) root = root.parent;
      if (root !== game.scene) continue;
      out.push({ kind: p.itemId, pos: p.obj.getWorldPosition(new THREE.Vector3()), take: () => { removeProp(p); return true; } });
    }
    return out;
  };
  const cam = game.camera;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), eye = new THREE.Vector3(), hand = new THREE.Vector3(), flashPos = new THREE.Vector3(), flashDir = new THREE.Vector3();
  const lastPos = new THREE.Vector3(1e9, 0, 0);
  let still = 0, speed = 0, lastSwing = -1e9;
  const player = { pos: new THREE.Vector3(), dir: fwd, speed: 0, crouch: false, held: '', hand, still: 0, busy: false };
  const warmth = () => THREE.MathUtils.clamp((outdoorTemp(15, game.day ?? 0, 0) - 5) / 8, 0, 1);
  const bw: BirdWorld = {
    dt: 0, time: 0, hour: 12, player, heightAt, waterY: WORLD.waterY, lake: SPOTS.lake,
    stands, solids, food, habitat, warmth: 1,
    take: (item) => {
      if (!game.take(item)) return false;
      if (game.owns && !game.owns(item) && game.hands?.heldItem === item) game.hands.equip?.(null);
      return true;
    },
    sound: (id, pos, vol = 1, rate) => game.sound(id, pos, vol, rate),
    say: (key, text) => say(key, text),
    startle: (k) => game.player.addShake(k),
  };
  const lights: THREE.Vector3[] = [];
  const bgw: BugWorld = {
    dt: 0, time: 0, hour: 12, player: { pos: player.pos, eye, dir: fwd, speed: 0 }, heightAt, waterY: WORLD.waterY, lake: SPOTS.lake,
    lights, flash: null, stands, solids, open, warmth: 1, rain: 0, swat: false,
    say: (key, text) => say(key, text, 60),
    swatted: (n) => {
      slap();
      if (n > 1) floatText.pop(`x${n}`, eye.clone().addScaledVector(fwd, 0.5), '#e8d0c0');
      say('swat', n > 2 ? 'Got a handful of them. A drop in the bucket.' : 'Got one. Ten more where it came from.', 90);
    },
  };

  // ---- events: gunshots, falling trees, food held out
  game.events.on('gunshot', (e: { pos?: THREE.Vector3 }) => birds.shot(e?.pos ?? game.player.pos));
  game.events.on('felled', (t: { ref?: { x: number; y: number; z: number }; group?: THREE.Object3D }) => {
    const p = t?.ref ? new THREE.Vector3(t.ref.x, t.ref.y, t.ref.z) : game.player.pos.clone();
    birds.scare(p, 45, 30);
    bugs.freshStump(p.x, heightAt(p.x, p.z) + 0.3, p.z, 0.2);
  });
  game.events.on('offer', (o: { item: string; obj: THREE.Object3D; taken: boolean }) => {
    if (!o || o.taken) return;
    if (birds.offer(o.item, o.obj)) o.taken = true;
  });

  // ---- the mosquito whine and the slap (Web Audio; the sound bank has neither)
  let whine: { g: GainNode; pan: StereoPannerNode; o1: OscillatorNode; o2: OscillatorNode; lfo: OscillatorNode } | null = null;
  const ensureWhine = () => {
    if (whine || !audio.unlocked || !audio.buses.sfx) return;
    const ctx = audio.init();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = 610; o2.frequency.value = 655;
    lfo.frequency.value = 5.3; lg.gain.value = 28; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner();
    o1.connect(bp); o2.connect(bp); bp.connect(g); g.connect(pan); pan.connect(audio.buses.sfx);
    o1.start(); o2.start(); lfo.start();
    whine = { g, pan, o1, o2, lfo };
  };
  let slapBuf: AudioBuffer | null = null;
  const slap = () => {
    if (!audio.unlocked || !audio.buses.sfx) return;
    const ctx = audio.init();
    if (!slapBuf) {
      const n = Math.floor(ctx.sampleRate * 0.12);
      slapBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = slapBuf.getChannelData(0);
      for (let i = 0; i < n; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.9 + Math.sin(t * 2 * Math.PI * 140) * Math.exp(-t * 40) * 0.5; }
    }
    const s = ctx.createBufferSource(); s.buffer = slapBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.value = 0.55;
    s.connect(lp); lp.connect(g); g.connect(audio.buses.sfx); s.start();
  };

  const update = (dt: number) => {
    const P = game.player.pos;
    // the player, as the birds see them
    cam.getWorldDirection(fwd);
    right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.getWorldPosition(eye);
    hand.copy(eye).addScaledVector(fwd, 0.5).addScaledVector(right, 0.13).addScaledVector(up, -0.2);
    const moved = lastPos.x < 1e8 ? Math.hypot(P.x - lastPos.x, P.z - lastPos.z) : 0;
    lastPos.copy(P);
    speed = THREE.MathUtils.lerp(speed, moved / Math.max(dt, 1e-3), 1 - Math.exp(-8 * dt));
    still = speed < 0.25 ? still + dt : 0;
    const walking = game.mode === undefined || game.mode === 'walk';
    player.pos.copy(P); player.speed = walking ? speed : 30; player.crouch = game.player.crouch; player.still = walking ? still : 0;
    player.held = game.hands?.heldItem ?? '';
    const swing = game.lastSwingAt ?? -1e9;
    player.busy = !!game.hands?.charging || performance.now() - swing < 500;
    // axe work carries: every blow scares the birds near it
    if (swing > lastSwing + 1) { lastSwing = swing; if (performance.now() - swing < 600) birds.scare(P, 16, 12); }
    const h = game.hour;
    bw.dt = dt; bw.time += dt; bw.hour = h; bw.warmth = warmth();
    if (!game.indoors) birds.update(bw);
    // bugs
    lights.length = 0;
    for (const f of game.fires ?? []) if (f.level() > 0.15) lights.push(f.pos);
    if (game.flashOn) { flashPos.copy(eye); flashDir.copy(fwd); bgw.flash = { pos: flashPos, dir: flashDir }; } else bgw.flash = null;
    bgw.dt = dt; bgw.time += dt; bgw.hour = h; bgw.warmth = bw.warmth; bgw.rain = game.weather?.rain ?? 0;
    bgw.player.speed = speed;
    bgw.swat = input.pressed('Mouse0');
    if (!game.indoors) bugs.update(bgw);
    // the whine: loud at the ear, panned to the side the nearest one is on
    if (bugs.nearEar > 0.05) ensureWhine();
    if (whine) {
      const ctx = audio.init(), t = ctx.currentTime;
      const v = Math.min(0.07, bugs.nearEar * 0.03) * (game.indoors ? 0 : 1);
      whine.g.gain.setTargetAtTime(v, t, 0.08);
      whine.pan.pan.setTargetAtTime(Math.sin(performance.now() / 700) * 0.7, t, 0.2);
      whine.o1.frequency.setTargetAtTime(600 + Math.sin(performance.now() / 310) * 40, t, 0.1);
    }
  };
  game.updaters.push(update);
  return {
    birds, bugs, ready, update,
    dispose() {
      const i = game.updaters.indexOf(update); if (i >= 0) game.updaters.splice(i, 1);
      birds.object.removeFromParent(); bugs.dispose();
      if (whine) { whine.o1.stop(); whine.o2.stop(); whine.lfo.stop(); whine.g.disconnect(); whine = null; }
    },
  };
}
