// installTruck(game): the per-frame side of the truck (call once after the 'jeep' boot step).
//   * the driver's camera feel, ported from the author's own หลอนยันปลายทาง (effective-octo-train/src/game/systems/
//     CameraFeel.js): engine tremor, road sway, the head trailing fast turns and leaning into them, braking dip,
//     bump jolts and a flinch on impacts. It runs after the physics step, so the eye never lags the cab.
//   * cab controls: L light bar, K work lights, G horn, X hazards; W (or R) restarts a stalled engine
//   * engine sound, repair jobs, winch and unload animations, the driver's door
//   * the repair parts join the item catalogue (TRUCK_ITEMS) when items.ts doesn't list them
import * as THREE from 'three';
import { input } from '../core/input';
import { hud } from '../ui/hud';
import { audio } from '../audio/audio';
import { Noise } from '../core/noise';
import { ITEMS } from '../game/items';
import { TRUCK_ITEMS } from './truckitems';
import { Truck } from './truck';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const nz = new Noise(4242);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _o = new THREE.Vector3();
const IDQ = new THREE.Quaternion();

export function installTruck(game: any): Truck | null {
  for (const [k, d] of Object.entries(TRUCK_ITEMS)) if (!ITEMS[k]) ITEMS[k] = d;
  const truck = game.jeep as Truck | null;
  if (!(truck instanceof Truck)) return null;
  truck.cargo.game = game;
  game.truck = truck;
  truck.lowQuality = game.quality?.name === 'low';
  const feel = { t: 0, lastYaw: null as number | null, yawRate: 0, lag: 0, lean: 0, dip: 0, kick: 0, kickV: 0, flinch: 0, flinchV: 0 };
  let wasIn = false, hinted = false, hornT = 0;
  truck.onCollision = (c) => {
    const k = clamp(c.speed / 9, 0.15, 1);
    feel.flinchV += k * 2.5;
    if (truck.occupied) { game.player?.addShake?.(k * 0.8); if (c.speed > 6) game.R && (game.R.fx.damage = Math.max(game.R.fx.damage ?? 0, k * 0.6)); }
  };
  truck.phys.onBump = (k) => { feel.kickV -= k * 0.35; if (k > 0.55 && Math.random() < 0.5) audio.play('veh_suspension', { pos: truck.root.position, vol: 0.25 + k * 0.3 }); };
  truck.phys.onShift = () => { if (truck.occupied) audio.play('truck_shift', { pos: truck.root.position, vol: 0.35 }); };

  game.updaters.push((dt: number) => {
    if (!truck.body) return;
    truck.frame(dt, game.camera);
    truck.damage.frame(dt);
    truck.cargo.frame(dt);
    // getting in and out: the door swings, the engine note moves behind the firewall
    if (truck.occupied !== wasIn) {
      wasIn = truck.occupied;
      truck.swingDoor();
      if (wasIn && !hinted) { hinted = true; hud.say('<i>W / S drive and brake (hold S to back up), Space handbrake, H lights, L light bar, G horn, E get out.</i>', 6); }
    }
    const driving = game.mode === 'drive' && truck.occupied;
    if (driving) {
      if (input.pressed('KeyL')) { truck.lightBar = !truck.lightBar; audio.play('flashlight_click', { vol: 0.5 }); }
      if (input.pressed('KeyK')) { truck.workLights = !truck.workLights; audio.play('flashlight_click', { vol: 0.5 }); }
      if (input.pressed('KeyX')) truck.damage.hazards = !truck.damage.hazards;
      hornT -= dt;
      if (input.held('KeyG') && hornT <= 0) { hornT = 0.55; audio.play('veh_horn', { pos: truck.root.position, vol: 0.9 }); game.events?.emit?.('horn', truck.root.position); }
      if (!truck.running && (input.pressed('KeyW') || input.pressed('KeyR'))) {
        if (truck.damage.tryStart()) hud.say('<i>It catches.</i>', 1.5);
        else hud.say('<i>The starter grinds. Nothing.</i>', 1.8);
      }
    }
    // ---- camera feel (after the physics step: the eye sits exactly in the seat) ----
    if (!driving || !truck.cameraEnabled) { feel.lastYaw = null; return; }
    feel.t += dt;
    const P = truck.phys, kmh = Math.abs(P.v) * 3.6, cam = game.camera as THREE.PerspectiveCamera;
    const o = _o.set(0, 0, 0);
    let yaw = 0, pitch = 0, roll = 0;
    if (truck.running) {
      const trem = (0.0004 + Math.min(kmh, 90) * 0.000004) * (P.damage.engine < 0.6 ? 2.2 : 1);
      o.x += nz.n2(feel.t * 23, 1.7) * trem; o.y += nz.n2(feel.t * 29, 5.3) * trem;
    }
    const sway = Math.min(kmh / 50, 1.3) * (P.surface === 'asphalt' ? 0.6 : 1.4);
    o.x += nz.n2(feel.t * 0.9, 11.1) * 0.004 * sway;
    o.y += nz.n2(feel.t * 1.7, 2.9) * 0.0026 * sway;
    roll += nz.n2(feel.t * 0.6, 7.7) * 0.0025 * sway;
    // yaw rate of the cab, smoothed: the head trails the turn and leans into it
    const y = P.yaw;
    if (feel.lastYaw !== null) {
      let d = y - feel.lastYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      feel.yawRate = damp(feel.yawRate, clamp(d / Math.max(dt, 1e-3), -3, 3), 6, dt);
    }
    feel.lastYaw = y;
    feel.lag = damp(feel.lag, clamp(-feel.yawRate * 0.035 * (kmh > 8 ? 1 : kmh / 8), -0.045, 0.045), 4, dt);
    feel.lean = damp(feel.lean, clamp(feel.yawRate * Math.min(kmh, 80) * 0.0004, -0.03, 0.03), 3, dt);
    yaw += feel.lag; roll += feel.lean; o.x += feel.lean * 0.4;
    // braking pitches the head forward, the throttle presses it back
    feel.dip = damp(feel.dip, clamp(-P.accLong * 0.006, -0.03, 0.04), 5, dt);
    pitch -= feel.dip; o.z += feel.dip * 0.6;
    // bumps: a damped kick through the seat springs
    feel.kickV += (-feel.kick * 160 - feel.kickV * 14) * dt;
    feel.kick += feel.kickV * dt;
    o.y += feel.kick * 0.06; pitch += feel.kick * 0.03;
    feel.flinchV += (-feel.flinch * 120 - feel.flinchV * 16) * dt;
    feel.flinch += feel.flinchV * dt;
    o.z += feel.flinch * 0.05; o.y += feel.flinch * 0.015; pitch += feel.flinch * 0.04;
    const fovT = 68 + Math.min(kmh, 110) * 0.03 - feel.flinch * 3;
    if (Math.abs(cam.fov - fovT) > 0.05) { cam.fov = damp(cam.fov, fovT, 3, dt); cam.updateProjectionMatrix(); }
    // compose: the cab's attitude (the neck soaks up half the body roll), the driver's look, the feel
    truck.eye(cam.position);
    _v.copy(o).applyQuaternion(truck.root.quaternion);
    cam.position.add(_v);
    _q2.copy(IDQ).slerp(truck.sprung.quaternion, 0.55);
    _q.copy(truck.root.quaternion).multiply(_q2);
    const pl = game.player;
    cam.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(pl.pitch + pitch, Math.PI + pl.yaw + yaw, roll, 'YXZ')));
    pl.pos.set(cam.position.x, cam.position.y - 1.2, cam.position.z);
  });
  return truck;
}
