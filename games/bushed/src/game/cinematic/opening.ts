// The opening: the drive in, as a film. Golden hour over Kettle Lake and the bush, the truck on the gravel, the
// will on the passenger seat, the township sign, the title, and the truck pulling in at Pruneau's, where the
// player gets the wheel... the legs, rather. Pépère Ray reads his letter over it (subtitles; his voice when the
// voice system answers cineHooks.voice). Hold Space (or Esc) to skip.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Director } from '../director';
import { SPOTS, heightAt, roadPointAt } from '../../world/layout';
import { physics } from '../../physics/physics';
import { G } from '../../gfx/globals';
import { input } from '../../core/input';
import { hud } from '../../ui/hud';
import { CineCam, flight, track, mounted, dolly, withLens, easeInOut, smooth, type ShotFn } from './camera';
import { cineUI } from './overlay';
import { cineHooks } from './hooks';
import { Pilot, roadPath, type VehicleLike, type P2 } from './pilot';
import { willOnSeat, willLocal, driverIn, tickDriver, removeDriver, setDriverVisible, kettleSign, cabOf } from './props';

/** Pépère's letter, in his words (narration, one line per beat) */
export const OPENING_LINES = [
  'Kid. If the notary found you, then I\'m gone, and you\'re holding the will.',
  'The cabin\'s yours. Lot fourteen, Rang Four. The stove, the roof, and the leak in the roof.',
  'And Délima\'s camp on the north shore, with what goes with it. You\'ll see what goes with it.',
  'I meant to show you all this myself. The knee went, then the rest of me. Don\'t be sad too long. I wasn\'t.',
  'Go see Gérard and Odile at Pruneau\'s store. They were my friends. They\'ll be yours, if you let them.',
  'Keep the stove fed, and keep jerky in your pocket after dark. Welcome home, kid.',
];

/** the voice system (src/audio/voice), loaded on first use; null if it isn't there */
type Line = { stop?(fade?: number): void };
type VoiceMod = { voice?: { say?(who: string, text: string, o?: { close?: boolean }): Line } };
let voiceMod: Promise<VoiceMod | null> | null = null;
let lastLine: Line | null = null;
/** Pépère reads a line: through cineHooks.voice when it's wired, else straight to the voice system's 'grandpa' */
export function narrate(text: string, mood = 'letter'): void {
  lastLine?.stop?.(0.3); lastLine = null;
  try {
    if (cineHooks.voice) { void cineHooks.voice({ who: 'ray', text, mood }); return; }
    voiceMod ??= import('../../audio/voice').then((m) => m as unknown as VoiceMod).catch(() => null);
    void voiceMod.then((m) => { lastLine = m?.voice?.say?.('grandpa', text, { close: true }) ?? null; });
  } catch (e) { console.warn('[cine] voice', e); }
}
export function hushNarration(): void { lastLine?.stop?.(0.4); lastLine = null; }

/** whichever vehicle the game has (the logging truck keeps the Jeep's API) */
export function vehicleOf(g: Game): VehicleLike | null {
  return ((g as unknown as { truck?: VehicleLike }).truck ?? (g.jeep as unknown as VehicleLike | null)) ?? null;
}

/** where the drive in ends: the parking spot in front of the store, nose to the porch */
export function storePark(g: Game): { x: number; z: number; heading: number } {
  const a = g.store?.anchors?.jeep_park as THREE.Object3D | undefined;
  if (a) {
    const p = a.getWorldPosition(new THREE.Vector3());
    const d = new THREE.Vector3(0, 0, 1).applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()));
    return { x: p.x, z: p.z, heading: Math.atan2(d.x, d.z) };
  }
  return { x: SPOTS.store.x, z: SPOTS.store.z - 14, heading: 0 };
}

/** the drive: the highway east in the right-hand lane, then a turn into Pruneau's lot */
function drivePath(g: Game): { path: P2[]; signS: number } {
  const lane = 1.5;
  const hw = roadPath('highway', 160, 700, 4);
  // keep right: shift each point to the right of travel
  const path: P2[] = hw.map((p, i) => {
    const a = hw[Math.max(0, i - 1)], b = hw[Math.min(hw.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: p.x - (dz / l) * lane, z: p.z + (dx / l) * lane };
  });
  const park = storePark(g);
  const back = 9;
  const pre = { x: park.x - Math.sin(park.heading) * back, z: park.z - Math.cos(park.heading) * back };
  const last = path[path.length - 1];
  // a soft right turn into the lot
  for (let k = 1; k <= 6; k++) {
    const t = k / 6, u = 1 - t;
    const cx = (last.x + pre.x) / 2 + 6, cz = last.z;
    path.push({ x: u * u * last.x + 2 * u * t * cx + t * t * pre.x, z: u * u * last.z + 2 * u * t * cz + t * t * pre.z });
  }
  path.push({ x: park.x - Math.sin(park.heading) * 3, z: park.z - Math.cos(park.heading) * 3 }, { x: park.x, z: park.z });
  // the sign sits at highway t = 620: as a distance along this path
  return { path, signS: 620 - 160 };
}

/**
 * Play the opening. Resolves when the player stands outside the store with control (also after a skip).
 * `d` is the game's Director (time, conditions).
 */
export async function playOpening(g: Game, d: Director): Promise<void> {
  const v = vehicleOf(g);
  const cam = new CineCam(g);
  const sign = kettleSign(g);
  g.mode = 'cutscene';
  g.player.enabled = false;
  if (g.arms) g.arms.object.visible = false;
  g.hands?.equip(null);
  hud.setLabel(''); hud.showDot(false);
  g.timeScale = 1.5;
  g.hour = 18.8;
  g.weather = { cloud: 0.25, rain: 0, fog: 0.05, storm: 0 };
  const tw = (g as unknown as { targetWeather?: { cloud: number; rain: number; fog: number; storm: number } }).targetWeather;
  if (tw) Object.assign(tw, { cloud: 0.3, rain: 0, fog: 0.15, storm: 0 });
  cineUI.fade(true, 0);
  hud.fadeTo(false, 0.3);
  cineUI.letterbox(true, 0.01);

  // ---- skip: hold Space or Esc
  let skipped = false, hold = 0, hintT = 4;
  let air = 1;   // atmosphere: <1 thins the fog for the aerials
  let fill = 0;  // a soft warm fill for the cab (the flashlight light, which rides on the camera, turned right down)
  const flashCol = g.flashlight.color.clone();
  const onFrame = (dt: number) => {
    const held = input.held('Space') || input.held('Escape');
    hold = held ? hold + dt : Math.max(0, hold - dt * 2);
    if (held || input.pressed('KeyE') || input.pressed('Mouse0')) hintT = 3;
    hintT -= dt;
    cineUI.skip(skipped ? null : hold > 0 || hintT > 0 ? Math.min(1, hold / 0.9) : null);
    if (!skipped && hold >= 0.9) skipped = true;
    tickDriver(dt);
    // the player rides along (NPCs, story props and lights wake up around the truck, not the porch at home)
    if (v) { g.player.pos.copy(v.root.position); }
  };
  const late = () => {
    // runs after the sky has set this frame's fog: the cinematic thins it for the long views
    // and grades it a touch warmer and richer, golden hour as remembered (the sky rewrites these every frame)
    const gr = g.R.grade;
    gr.warm += 0.18; gr.saturation *= 1.08;
    if (air < 1) { g.sky.fog.density *= air; G.uMist.value *= air; gr.air *= air; gr.mie *= air; }
    if (fill > 0) { g.flashlight.intensity = fill; g.flashlight.color.setRGB(1, 0.8, 0.55); }
  };
  g.updaters.push(onFrame);
  g.lateUpdaters.push(late);
  const skipP = new Promise<void>((r) => { void d.until(() => skipped).then(r); });
  /** wait for a shot (or a pause), unless the player skips */
  const beat = async (p: Promise<unknown>) => { if (!skipped) await Promise.race([p, skipP]); return !skipped; };
  // dev: ?intro&cine=N starts at shot N (2 aerial, 3 high follow, 4 tracking, 5 cab, 6 sign, 7 title, 8 arrival)
  const from = Number(new URLSearchParams(location.search).get('cine') ?? 0) || 0;
  const at = (n: number) => !skipped && n >= from;
  const say = (i: number) => {
    if (skipped) return;
    const text = OPENING_LINES[i];
    cineUI.subtitle(text, i === 0 ? 'Pépère Ray' : '', Math.max(4, text.split(/\s+/).length * 0.42 + 1.6));
    narrate(text);
    g.events.emit('cine_voice', { who: 'ray', text, mood: 'letter' });
  };
  const music = (cue: string, fade = 2) => {
    try { cineHooks.music?.(cue, fade); } catch (e) { console.warn('[cine] music', e); }
    g.events.emit('music_cue', { cue, fade });
  };

  // ---- the truck: on the highway, engine running, you at the wheel, the will on the seat
  let pilot: Pilot | null = null;
  let signS = 460;
  if (v) {
    const dp = drivePath(g);
    signS = dp.signS;
    pilot = new Pilot(v, dp.path, { cruise: 12 }).attach();
    v.occupied = true;
    v.running = true;
    v.headlights = true;
    willOnSeat(v);
    driverIn(v);
  }
  const place = (s: number, speed = 12) => {
    if (!pilot || !v) return;
    pilot.place(s, speed);
    physics.ensureGround(v.root.position.x, v.root.position.z);
  };
  const truck = v?.root ?? new THREE.Object3D();
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const ground = (x: number, z: number, dy: number) => V3(x, heightAt(x, z) + dy, z);

  music('opening', 0.5);

  // 1. black: three weeks before the porch, then the first words
  if (from <= 1) {
    cineUI.subtitle('Three weeks earlier', '', 2.2);
    await beat(d.sleep(2.8));
    say(0);
    await beat(d.sleep(2.4));
  } else cineUI.fade(false, 0.5);

  // 2. AERIAL: over Kettle Lake at golden hour, the low sun at our backs, gliding north-east over the water and
  //    tilting up to the bush on the far shore
  if (at(2)) {
    place(40);
    air = 0.28;
    const L = SPOTS.lake;
    // looking down on the water first (the sky in it), then tilting up to find the bush on the far shore
    const pts = [V3(L.x - 90, 62, L.z + 75), V3(L.x - 30, 58, L.z + 20), V3(L.x + 30, 56, L.z - 35), V3(L.x + 90, 60, L.z - 90)];
    const looks = [V3(L.x + 10, 2, L.z - 20), V3(L.x + 90, 2, L.z - 100), V3(L.x + 190, 8, L.z - 190)];
    cineUI.fade(false, 3.2);
    await beat(cam.play(flight(pts, looks), 13, { lens: { mm: 28, focus: 200, fstop: 11 }, handheld: 0.25 }));
  }
  say(1);
  // 3. AERIAL 2: the highway from above, the truck small on the gravel, the camera sinking toward it
  if (at(3)) {
    place(260);
    air = 0.55;
    await beat(cam.play(track(truck, V3(22, 40, -34), V3(10, 17, -13), V3(0, 0, 12), 0.6, easeInOut), 8, { lens: { mm: 35, focus: 50, fstop: 8 }, handheld: 0.2 }));
  }
  air = 1;
  say(2);
  // 4. TRACKING: the camera car alongside on the sunny side, low, the gravel spitting, you at the wheel beyond
  if (at(4)) {
    await beat(cam.play(withLens(track(truck, V3(-3.3, 1.1, 3.4), V3(-3.1, 1.3, -0.4), V3(0.3, 1.25, 0.6), 0.18), (c) => { c.focus = c.distTo(truck.position); }), 8.5, { lens: { mm: 28, fstop: 2.8 }, handheld: 0.5 }));
  }
  // 5. INTERIOR: in the driver's seat, your eyes leave the road for the passenger seat: the notary's envelope,
  //    the will, his letter on top; then the insert, the will itself, the light coming and going through the trees
  say(3);
  if (at(5) && v) {
    place(330, 11);
    const seat = v.seat?.position ?? V3(0.33, 1.5, -0.4);
    const wl = willLocal(v);
    const cab = cabOf(v);
    const eyeP = V3(seat.x - 0.04, seat.y - 0.02, seat.z + 0.03);
    setDriverVisible(false);
    fill = 4;
    await beat(cam.play(mounted(cab, eyeP, V3(seat.x - 0.1, seat.y - 0.04, seat.z + 0.06), V3(seat.x * 0.7, seat.y - 0.3, seat.z + 14), V3(wl.x + 0.02, wl.y + 0.02, wl.z + 0.06), easeInOut), 6.5, { lens: { mm: 28, focus: 1.2, fstop: 2 }, handheld: 0.35 }));
    if (!skipped) {
      await beat(cam.play(mounted(cab, V3(wl.x + 0.02, wl.y + 0.46, wl.z - 0.16), V3(wl.x + 0.01, wl.y + 0.34, wl.z - 0.1), V3(wl.x, wl.y, wl.z), V3(wl.x, wl.y, wl.z + 0.01), easeInOut), 5, { lens: { mm: 45, focus: 0.36, fstop: 1.8 }, handheld: 0.3 }));
    }
    setDriverVisible(true);
  }
  fill = 0;
  g.flashlight.color.copy(flashCol);
  // 6. THE SIGN: first low in the ditch, the road going back west into the sun and the truck coming up out of the
  //    glare; then across the road from KETTLE LAKE as it goes by
  if (at(6)) {
    place(signS - 58, 12);
    const rp = roadPointAt('highway', sign.t);
    const fw = V3(Math.sin(rp.dir), 0, Math.cos(rp.dir)), toRoad = V3(Math.cos(rp.dir), 0, -Math.sin(rp.dir));
    const camP = sign.pos.clone().addScaledVector(sign.face, 2.6).addScaledVector(toRoad, 1.3);
    camP.y = heightAt(camP.x, camP.z) + 0.8;
    const back = V3(rp.x, 0, rp.z).addScaledVector(fw, -45);
    back.y = heightAt(back.x, back.z) + 1.2;
    const lookP = sign.pos.clone().lerp(back, 0.5);
    lookP.y = sign.pos.y - 0.1;
    await beat(cam.play((c) => { c.pos.copy(camP); c.look.copy(lookP); c.focus = Math.min(c.pos.distanceTo(truck.position), 30); }, 3.6, { lens: { mm: 20, fstop: 4 }, handheld: 0.12 }));
    if (!skipped) {
      // the far shoulder, a few lengths short of the sign: it reads square on, the truck crosses between
      place(signS - 44, 12);
      const camQ = V3(rp.x, 0, rp.z).addScaledVector(fw, -8.5).addScaledVector(toRoad, 4.6);
      camQ.y = heightAt(camQ.x, camQ.z) + 1.05;
      const lookQ = sign.pos.clone().lerp(V3(rp.x, sign.pos.y, rp.z), 0.3);
      lookQ.y -= 0.35;
      await beat(cam.play((c, k) => {
        c.pos.copy(camQ);
        c.look.copy(lookQ);
        c.focus = k < 0.45 ? c.pos.distanceTo(sign.pos) : Math.min(40, c.pos.distanceTo(truck.position));
      }, 5.2, { lens: { mm: 32, fstop: 2.8 }, handheld: 0.18 }));
    }
  }
  say(4);
  // 7. THE TITLE: the truck runs on toward the store, the camera rises off the road behind it
  if (at(7)) {
    music('title', 1.5);
    const p0 = truck.position.clone();
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(truck.quaternion).setY(0).normalize();
    const base = p0.clone().addScaledVector(back, 9);
    base.y = heightAt(base.x, base.z);
    const far = new THREE.Vector3();
    const shot: ShotFn = (c, k) => {
      const e = easeInOut(k);
      c.pos.copy(base); c.pos.y += 1.6 + e * 16;
      c.look.copy(truck.position); c.look.y += 1 + e * 2;
      c.look.lerp(far.copy(truck.position).addScaledVector(back, -60), e * 0.6);
    };
    setTimeout(() => { if (!skipped) cineUI.title('BUSHED', 'Kettle Lake, Northern Ontario — late September', 6.2); }, 1200);
    await beat(cam.play(shot, 8.5, { lens: { mm: 35, focus: 30, fstop: 8 }, handheld: 0.1 }));
  }
  // 8. ARRIVAL: from the porch at Pruneau's, the truck turns in off the highway and stops; dust settles
  say(5);
  if (at(8) && pilot && v) {
    music('arrive', 3);
    place(Math.max(0, pilot.length - 62), 10);
    const park = storePark(g);
    const door = g.store?.anchors?.door as THREE.Object3D | undefined;
    const dp = door ? door.getWorldPosition(new THREE.Vector3()) : ground(SPOTS.store.x, SPOTS.store.z, 0);
    const side = V3(Math.cos(park.heading), 0, -Math.sin(park.heading));
    const camA = dp.clone().addScaledVector(side, 4.5).add(V3(0, 1.1, 0));
    const camB = dp.clone().addScaledVector(side, 3.2).add(V3(0, 0.9, 0));
    camA.addScaledVector(V3(Math.sin(park.heading), 0, Math.cos(park.heading)), -1.5);
    camB.addScaledVector(V3(Math.sin(park.heading), 0, Math.cos(park.heading)), -2.5);
    await beat(cam.play((c, k, t, dt) => {
      dolly(camA, camB, truck.position, smooth)(c, k, t, dt);
      c.look.y += 1.1;
      c.focus = c.pos.distanceTo(truck.position);
    }, 9, { lens: { mm: 35, fstop: 4 }, handheld: 0.2 }));
    await beat(d.until(() => pilot!.arrived || pilot!.remaining < 1.5));
    if (!skipped) {
      v.running = false;
      g.sound('veh_door_open', truck.position, 0.7);
      await beat(d.sleep(1.0));
    }
  }

  // ---- the end (also where a skip lands): parked, engine off, you on your feet facing the store
  fill = 0;
  g.flashlight.color.copy(flashCol);
  const wasSkipped = skipped;
  if (wasSkipped) hushNarration();
  cineUI.clearSub();
  cineUI.clearTitle();
  cineUI.skip(null);
  if (wasSkipped) { cineUI.fade(true, 0.35); await new Promise((r) => setTimeout(r, 400)); }
  air = 1;
  g.updaters.splice(g.updaters.indexOf(onFrame), 1);
  g.lateUpdaters.splice(g.lateUpdaters.indexOf(late), 1);
  removeDriver();
  pilot?.detach();
  const park = storePark(g);
  if (v) {
    if (wasSkipped || !pilot?.arrived) {
      v.spawn(park.x, park.z, park.heading);
      physics.ensureGround(park.x, park.z);
    }
    v.running = false;
    v.headlights = false;
    v.occupied = false;
  }
  // out of the driver's door, facing the store
  const door = g.store?.anchors?.door as THREE.Object3D | undefined;
  const dp = door ? door.getWorldPosition(new THREE.Vector3()) : V3(SPOTS.store.x, 0, SPOTS.store.z);
  const fwd = V3(Math.sin(park.heading), 0, Math.cos(park.heading)), left = V3(Math.cos(park.heading), 0, -Math.sin(park.heading));
  const out = V3(park.x, 0, park.z).addScaledVector(left, 1.7).addScaledVector(fwd, 0.6);
  const yaw = Math.atan2(-(dp.x - out.x), -(dp.z - out.z));
  physics.ensureGround(out.x, out.z);
  g.player.teleport(out.x, null, out.z, yaw);
  g.player.pitch = 0.02;
  g.player.enabled = true;
  g.mode = 'walk';
  if (g.arms) g.arms.object.visible = true;
  g.sound('veh_door_close', out, 0.8);
  if (wasSkipped) {
    cam.stop();
    cineUI.letterbox(false, 0.01);
    cineUI.fade(false, 1.6);
    music('arrive', 1);
  } else {
    cineUI.letterbox(false, 1.4);
    await cam.release(1.4);
  }
  g.timeScale = 10;
}
