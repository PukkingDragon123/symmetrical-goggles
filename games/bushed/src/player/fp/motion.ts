// How the hands ride the camera. Ported from Gacha Garage's Held.update (the look sway spring, walk bob, breath and
// the tilt into turns on the camera anchor) and FPBody (presence: the hands rise back into view), extended for
// BUSHED: everything is weighted by what you hold (a maul lags, overshoots and settles slower than a jerky pouch),
// the bob is locked to the player's footsteps (the hands drop on each footfall and sway over the stance foot),
// strafing tilts the hands into the turn, accelerating leaves them behind, jumps and landings squash them.
//
// Output: a view-space offset (x right, y up, z toward the camera) and a small rotation (pitch, yaw, roll about
// the eye) applied to both hand targets before the hand springs and the IK.
import * as THREE from 'three';

export interface MotionIn {
  dt: number;
  /** camera turn rates (rad/s): yaw + = turning left, pitch + = looking up */
  yawRate: number; pitchRate: number;
  /** player velocity in view terms (m/s): forward +, right + */
  fwd: number; side: number;
  /** vertical velocity (m/s) while airborne, 0 grounded */
  vy: number;
  grounded: boolean;
  sprint: boolean;
  /** 0..1 */
  crouch: number;
  /** footstep phase 0..1 (0 = footfall) or < 0 when unknown; foot +1 right / -1 left */
  step: number; foot: number;
  /** footfall this frame (strength 0..1), landing this frame (0..1) */
  footfall: number; land: number;
  /** held mass (kg) */
  mass: number;
  /** 0..1 aiming down the sights (steadier) */
  aim: number;
}

const spring = (x: number, v: number, target: number, om: number, z: number, dt: number): [number, number] => {
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < n; i++) { v += ((target - x) * om * om - 2 * z * om * v) * h; x += v * h; }
  return [x, v];
};

export class ViewMotion {
  /** view-space offset and rotation (radians) to apply this frame */
  readonly pos = new THREE.Vector3();
  readonly rot = new THREE.Euler(0, 0, 0, 'YXZ');
  private sx = 0; private svx = 0; private sy = 0; private svy = 0;     // look sway
  private tilt = 0; private tiltV = 0;                                  // strafe roll
  private lag = 0; private lagV = 0;                                    // forward acceleration lag (z)
  private hy = 0; private hvy = 0;                                      // vertical inertia (steps, landings, jumps)
  private fwdSm = 0; private moving = 0; private ph = 0; private time = 0;

  update(i: MotionIn) {
    const dt = Math.min(0.1, Math.max(1e-4, i.dt));
    this.time += dt;
    // heavier things: lower spring frequency, bigger lag, more overshoot
    const m = Math.max(0, i.mass);
    const wgt = 1 + Math.min(1.6, m * 0.16);
    const steady = 1 - 0.75 * i.aim;
    const om = 15 / Math.sqrt(1 + m * 0.22);
    // look sway: the hands trail behind camera turns (Held.js: -mouse.dx * 0.00035 into a stiff spring, clamped)
    const tx = THREE.MathUtils.clamp(i.yawRate * 0.0055 * wgt * steady, -0.045, 0.045);
    const ty = THREE.MathUtils.clamp(-i.pitchRate * 0.0045 * wgt * steady, -0.04, 0.04);
    [this.sx, this.svx] = spring(this.sx, this.svx, tx, om, 0.55, dt);
    [this.sy, this.svy] = spring(this.sy, this.svy, ty, om, 0.55, dt);
    // strafe: the hands lag out of the move and roll into it
    [this.tilt, this.tiltV] = spring(this.tilt, this.tiltV, THREE.MathUtils.clamp(i.side / 4, -1, 1), om * 0.6, 0.7, dt);
    // forward acceleration: speeding up leaves the hands behind, stopping throws them forward
    this.fwdSm += (i.fwd - this.fwdSm) * Math.min(1, dt * 5);
    [this.lag, this.lagV] = spring(this.lag, this.lagV, THREE.MathUtils.clamp((i.fwd - this.fwdSm) * 0.012 * wgt, -0.03, 0.03), om * 0.8, 0.6, dt);
    // vertical inertia: footfalls knock the hands down, landings squash them, a jump leaves them behind
    if (i.footfall > 0) this.hvy -= i.footfall * 0.09 * Math.sqrt(wgt);
    if (i.land > 0) this.hvy -= i.land * (0.9 + 0.25 * wgt);
    const air = i.grounded ? 0 : THREE.MathUtils.clamp(-i.vy * 0.006, -0.03, 0.035);
    [this.hy, this.hvy] = spring(this.hy, this.hvy, air, om * 0.75, 0.42, dt);
    // walk bob on the footstep cadence (Held.js: cos(bob) x, |sin(bob)| y; here locked to the player's steps)
    const speed = Math.hypot(i.fwd, i.side);
    this.moving += (Math.min(1, speed / 2.5) * (i.grounded ? 1 : 0.3) - this.moving) * Math.min(1, dt * 6);
    let phase = i.step, foot = i.foot;
    if (phase < 0) { this.ph += dt * (i.sprint ? 2.9 : 1.95) * Math.min(1.3, speed / 2.5 + 0.3); phase = this.ph % 1; foot = Math.floor(this.ph) % 2 ? 1 : -1; }
    const run = i.sprint ? 1.7 : 1, mv = this.moving * steady;
    const lift = Math.sin(Math.PI * phase);                       // 0 at the footfall, 1 mid-stride
    const bx = foot * Math.sin(Math.PI * phase) * 0.007 * mv * run * Math.sqrt(wgt);
    const by = (lift - 0.55) * 0.011 * mv * run * Math.sqrt(wgt);
    // breath: a slow rise and fall, quieter when aiming
    const br = Math.sin(this.time * 1.7) * 0.0018 * steady;

    this.pos.set(
      this.sx - this.tilt * 0.012 + bx,
      this.sy + this.hy + by + br - i.crouch * 0.012 - (i.sprint ? 0.025 : 0),
      this.lag + i.crouch * 0.01,
    );
    // rotation: pitch with the vertical sway (and dip on footfalls), yaw trails turns, roll into strafes and steps
    this.rot.set(
      this.sy * 1.6 + this.hy * 1.2 + (i.sprint ? -0.07 : 0),
      -this.sx * 1.2,
      this.sx * 2.2 + this.tilt * 0.06 + bx * 1.8 + Math.sin(this.time * 0.7) * 0.004 * steady,
    );
  }
}
