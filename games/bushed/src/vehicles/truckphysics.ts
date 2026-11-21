// Truck driving model, ported from the author's own taxi game หลอนยันปลายทาง (effective-octo-train/src/vehicle/
// CarPhysics.js) and re-tuned for an old lifted logging pickup in the Canadian bush:
//   * a tired straight-six (torque curve, idle, governor), 4-speed automatic with a torque converter, idle creep,
//     engine braking, reverse by holding the brake at a standstill
//   * kinematic bicycle yaw with a grip limit and slides, speed-sensitive steering that gets slow and heavy when
//     the bed is loaded, drum brakes that take longer to stop a heavy truck, the handbrake locks the rear
//   * BUSHED terrain: ground following on four wheels over heightAt(), gravity along slopes, surfaces from the road
//     network (highway asphalt, gravel road, dirt tracks, bush), bumps and potholes, mud drag, water
//   * leaf-spring body motion: pitch, roll and heave springs, squat under the cargo, a sag for a flat tyre
//   * damage: grip, pull, top speed, a flat tyre, engine health (stalls)
//   * an autopilot that follows a road at a lane offset (the intro's scripted drive)
// Frame: three.js, +Z forward, +X left (the driver's side), heading h: forward = (sin h, 0, cos h).
import * as THREE from 'three';
import { heightAt, roadInfo, ROADS, WORLD } from '../world/layout';
import { Noise } from '../core/noise';

const G = 9.81;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export interface TruckGeom { axleF: number; axleR: number; track: number; wheelR: number }

export const TRUCK = {
  mass: 1850,
  idle: 680,
  redline: 4200,
  limiter: 4450,
  final: 4.56,
  eff: 0.8,
  auto: [2.95, 1.7, 1.0, 0.73],
  autoR: -2.3,
  brakeForce: 14500,
  handbrakeForce: 5200,
  cdA: 1.9,
  roll: 260,
  maxSteer: 0.58,
};

/** torque (N m) of a tired 4.1 litre straight-six: fat low end, nothing up top */
export function torqueAt(rpm: number): number {
  const r = rpm / 1000;
  return Math.max(0, 150 + 110 * Math.sin(clamp((r - 0.35) / 4.0, 0, 1) * Math.PI) - Math.max(0, r - 3.9) * 90);
}

export type Surface = 'asphalt' | 'gravel' | 'dirt' | 'bush' | 'water';
const SURF: Record<Surface, { grip: number; drag: number; bump: number; dust: number }> = {
  asphalt: { grip: 1.0, drag: 0, bump: 0.006, dust: 0 },
  gravel: { grip: 0.78, drag: 160, bump: 0.016, dust: 1 },
  dirt: { grip: 0.7, drag: 420, bump: 0.028, dust: 0.7 },
  bush: { grip: 0.6, drag: 1100, bump: 0.045, dust: 0.4 },
  water: { grip: 0.45, drag: 5200, bump: 0.02, dust: 0 },
};

export interface AutopilotSpec {
  road: string;
  /** distance along the road to start from (projected from the truck's position when omitted) */
  from?: number;
  /** stop at this distance along the road (default: the road's end) */
  to?: number;
  /** cruise speed m/s (default 13) */
  speed?: number;
  /** lateral offset, + = right of travel (Canada drives on the right; default: half a lane) */
  lane?: number;
  /** drive the road backwards (toward t = 0) */
  reverse?: boolean;
  /** keep rolling at the end (the next leg of a route takes over) instead of stopping */
  through?: boolean;
}

interface RoadPath { pts: THREE.Vector3[]; s: number[]; len: number }
const PATHS = new Map<string, RoadPath>();
function roadPath(id: string): RoadPath | null {
  let p = PATHS.get(id);
  if (p) return p;
  const r = ROADS.find((x) => x.id === id);
  if (!r) return null;
  const pts = r.pts.map((q) => new THREE.Vector3(q.x, q.h, q.z));
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  p = { pts, s, len: s[s.length - 1] };
  PATHS.set(id, p);
  return p;
}
/** position and unit tangent at distance t along a road */
function roadAt(p: RoadPath, t: number, pos: THREE.Vector3, tan: THREE.Vector3): void {
  t = clamp(t, 0, p.len);
  let lo = 0, hi = p.s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.s[m] <= t) lo = m; else hi = m; }
  const a = p.pts[lo], b = p.pts[hi];
  const f = (t - p.s[lo]) / Math.max(1e-6, p.s[hi] - p.s[lo]);
  pos.lerpVectors(a, b, f);
  tan.set(b.x - a.x, 0, b.z - a.z).normalize();
}
function roadProject(p: RoadPath, x: number, z: number, near: number): number {
  // nearest station within +-60 m of a hint (cheap: the roads are 2 m polylines)
  let best = 1e18, bt = near;
  const i0 = Math.max(0, p.s.findIndex((v) => v >= near - 60)), i1 = p.s.length;
  for (let i = Math.max(0, i0); i < i1 && p.s[i] <= near + 60; i++) {
    const q = p.pts[i];
    const d = (q.x - x) ** 2 + (q.z - z) ** 2;
    if (d < best) { best = d; bt = p.s[i]; }
  }
  return bt;
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Vector3();
const bumpNoise = new Noise(WORLD.seed + 913);

export class TruckPhysics {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  /** forward speed m/s (signed) */
  v = 0;
  /** lateral slip m/s (+ = left) */
  vLat = 0;
  yawRate = 0;
  wheelAngle = 0;
  rpm = TRUCK.idle;
  engineLoad = 0;
  autoGear = 1;
  gear: 'P' | 'R' | 'N' | 'D' = 'D';
  engineOn = false;
  handbrake = false;
  shiftTimer = 0;
  groundPitch = 0;
  groundRoll = 0;
  groundY = 0;
  accLong = 0;
  accLat = 0;
  readonly wheelSpin = [0, 0, 0, 0];
  /** per wheel (fl, fr, rl, rr) vertical offset from the chassis plane: articulation over rough ground */
  readonly wheelDrop = [0, 0, 0, 0];
  readonly susp = { pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0, heaveV: 0 };
  surface: Surface = 'gravel';
  offRoad = 0;
  /** suspension bump strength this step (0..1+) */
  bump = 0;
  slip = 0;
  inWater = 0;
  readonly input = { throttle: 0, brake: 0, steer: 0 };
  /** cargo on the bed: kg and the load's centre in truck space */
  cargoKg = 0;
  readonly cargoAt = new THREE.Vector3(0, 1.2, -1.9);
  /** damage: 0..1 general, steering pull (rad), flat tyre index (-1 none), engine health 0..1 */
  damage = { level: 0, pull: 0, flat: -1, engine: 1 };
  frozen = false;
  onShift: ((g: number) => void) | null = null;
  onBump: ((k: number) => void) | null = null;
  private lastV = 0;
  private lastBumpH = 0;
  private distance = 0;
  private gInit = false;
  // autopilot
  auto: (AutopilotSpec & { t: number; done: boolean }) | null = null;
  private autoPath: RoadPath | null = null;

  constructor(readonly geom: TruckGeom) {}

  get mass(): number { return TRUCK.mass + 80 + this.cargoKg; }
  get loadK(): number { return clamp(this.cargoKg / 2500, 0, 1.4); }
  forward(out = _f): THREE.Vector3 { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  /** unit vector to the truck's left */
  left(out = _r): THREE.Vector3 { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  place(x: number, z: number, yaw: number): void {
    this.pos.set(x, heightAt(x, z), z);
    this.yaw = yaw;
    this.v = this.vLat = this.yawRate = 0;
    this.gInit = false;
    this.followGround(1 / 60);
  }

  gearRatio(): number {
    if (this.gear === 'R') return TRUCK.autoR;
    if (this.gear === 'D') return TRUCK.auto[this.autoGear - 1];
    return 0;
  }

  step(dt: number): void {
    if (this.frozen || dt <= 0) return;
    if (this.auto && !this.auto.done) this.autopilotStep(dt);
    const inp = this.input;
    const speed = Math.abs(this.v);
    const L = this.geom.axleF - this.geom.axleR;
    const load = this.loadK;
    const dmg = this.damage;
    const flat = dmg.flat >= 0;
    // ---- steering: quick in the yard, calm at speed, slow and heavy with logs on ------------------------------
    const maxA = TRUCK.maxSteer * lerp(1, 0.2, smooth(0, 26, speed));
    const pull = dmg.pull * Math.min(1, speed / 6) + (flat ? (dmg.flat % 2 === 0 ? 1 : -1) * 0.05 * Math.min(1, speed / 4) : 0);
    const target = clamp(inp.steer * maxA + pull, -TRUCK.maxSteer, TRUCK.maxSteer);
    const rate = 2.3 / (1 + load * 0.55);
    this.wheelAngle += clamp(target - this.wheelAngle, -rate * dt, rate * dt);
    // ---- drivetrain ----------------------------------------------------------------------------------------
    const engineOn = this.engineOn;
    const ratio = this.gearRatio();
    const total = ratio * TRUCK.final;
    const R = this.geom.wheelR;
    const wheelRpm = (this.v / R) * (60 / (2 * Math.PI));
    let throttle = engineOn ? inp.throttle : 0;
    let driveF = 0;
    let targetRpm: number;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.shiftTimer > 0) throttle *= 0.2;
    const health = 0.5 + 0.5 * dmg.engine;
    if (engineOn && total !== 0) {
      const coupled = Math.abs(wheelRpm * total);
      const launch = 950 + throttle * 1300;
      const slipping = coupled < launch;
      targetRpm = slipping ? Math.max(coupled, lerp(TRUCK.idle, launch, Math.min(1, throttle * 1.4))) : coupled;
      let tq = torqueAt(this.rpm) * throttle * health * (1 - 0.25 * dmg.level);
      if (this.rpm > TRUCK.limiter) tq = 0;
      if (!slipping) tq -= (1 - throttle) * (14 + this.rpm * 0.006);
      const mult = slipping ? lerp(2.1, 1, coupled / launch) : 1; // converter torque multiplication
      driveF = (tq * mult * total * TRUCK.eff) / R;
      if (slipping && throttle < 0.05) driveF += Math.sign(total) * 520 * (1 - Math.min(1, speed / 2.2)); // idle creep
    } else targetRpm = engineOn ? TRUCK.idle + throttle * (TRUCK.redline - TRUCK.idle) * 0.9 : 0;
    // automatic box: shifts early when cruising, holds gears under load and uphill
    if (this.gear === 'D' && engineOn) {
      const hill = clamp(this.groundPitch * 8, 0, 0.4);
      const up = lerp(1900, 3900, clamp(inp.throttle + hill, 0, 1));
      const dn = lerp(1050, 2000, clamp(inp.throttle + hill, 0, 1));
      const rpmNow = Math.abs(wheelRpm * TRUCK.auto[this.autoGear - 1] * TRUCK.final);
      if (rpmNow > up && this.autoGear < 4) { this.autoGear++; this.shiftTimer = 0.32; this.onShift?.(this.autoGear); }
      else if (rpmNow < dn && this.autoGear > 1) { this.autoGear--; this.shiftTimer = 0.22; this.onShift?.(this.autoGear); }
    }
    if (this.gear !== 'D') this.autoGear = 1;
    const rpmRate = targetRpm > this.rpm ? 3600 : 2600;
    this.rpm += clamp(targetRpm - this.rpm, -rpmRate * dt, rpmRate * dt);
    if (!engineOn) this.rpm = Math.max(0, this.rpm - 2200 * dt);
    this.rpm = clamp(this.rpm, 0, TRUCK.limiter + 120);
    this.engineLoad = damp(this.engineLoad, throttle, 8, dt);
    if (this.handbrake && speed < 1.5) driveF *= 0.12;
    if (this.gear === 'P') { driveF = 0; this.v = damp(this.v, 0, 20, dt); }
    // ---- longitudinal ----------------------------------------------------------------------------------------
    const S = SURF[this.surface];
    const mass = this.mass;
    const surfDrag = S.drag * (0.6 + 0.4 * mass / TRUCK.mass) + (flat ? 650 : 0);
    const resist = TRUCK.cdA * 0.6 * this.v * Math.abs(this.v) + Math.sign(this.v) * (TRUCK.roll * mass / TRUCK.mass + surfDrag) * Math.min(1, speed * 2);
    const slope = -mass * G * Math.sin(this.groundPitch); // nose up = uphill = gravity pulls back
    const brakeF = Math.min(inp.brake * TRUCK.brakeForce * (1 - 0.15 * dmg.level) + (this.handbrake ? TRUCK.handbrakeForce : 0), mass * 8);
    this.v += ((driveF - resist + slope) / mass) * dt;
    const dvB = (brakeF / mass) * dt;
    if (Math.abs(this.v) <= dvB) this.v = 0;
    else this.v -= Math.sign(this.v) * dvB;
    if (this.gear === 'R' && this.v < -4.5) this.v = -4.5;
    if (flat && this.v > 13) this.v = damp(this.v, 13, 2, dt);
    this.accLong = damp(this.accLong, (this.v - this.lastV) / dt, 10, dt);
    this.lastV = this.v;
    // ---- yaw / lateral -----------------------------------------------------------------------------------------
    const grip = S.grip * (1 - 0.2 * dmg.level) * (flat ? 0.8 : 1) * (this.handbrake ? 0.5 : 1) * (1 - 0.08 * load);
    let yawTarget = (this.v * Math.tan(this.wheelAngle)) / L;
    const maxYaw = (0.9 * G * grip) / Math.max(speed, 2);
    this.slip = Math.max(0, Math.abs(yawTarget) - maxYaw) * speed;
    yawTarget = clamp(yawTarget, -maxYaw, maxYaw);
    const yawK = (this.handbrake && speed > 4 ? 2.2 : 6.5) / (1 + load * 0.6);
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-yawK * dt));
    if (this.handbrake && speed > 6) this.vLat += this.yawRate * speed * 0.18 * dt;
    // a loose tail on gravel: lateral slip builds when the front asks for more than the tyres give
    this.vLat += Math.sign(this.yawRate) * this.slip * 0.08 * dt * (1 + load * 0.5);
    this.vLat *= Math.exp(-(this.handbrake ? 1.4 : 5 / (1 + load * 0.4)) * dt);
    this.yaw = wrap(this.yaw + this.yawRate * dt);
    this.accLat = damp(this.accLat, this.v * this.yawRate, 8, dt);
    const fw = this.forward(_f), lf = this.left(_r);
    this.pos.addScaledVector(fw, this.v * dt).addScaledVector(lf, this.vLat * dt);
    const lim = WORLD.playHalf - 4;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    this.distance += speed * dt;
    // ---- where are we ----------------------------------------------------------------------------------------
    this.surfaceAt();
    this.followGround(dt);
    // ---- bumps: surface noise along the distance travelled, potholes on the gravel ------------------------------
    let bumpH = 0;
    if (speed > 0.5) {
      const d = this.distance;
      bumpH = (bumpNoise.n2(d * 0.9, this.pos.x * 0.05) * 0.6 + bumpNoise.n2(d * 3.1, 7.7) * 0.3) * S.bump * (1 + load * 0.3);
      if (this.surface === 'gravel' || this.surface === 'dirt') {
        const cell = Math.floor(d / 7);
        const h = Math.abs(Math.sin(cell * 127.1 + 311.7) * 43758.5453) % 1;
        if (h < 0.16) { const dd = Math.abs(d - (cell * 7 + 3.5)); if (dd < 0.4) bumpH -= 0.045 * (1 - dd / 0.4); }
      }
      if (flat) bumpH += Math.sin(this.wheelSpin[dmg.flat] * 1) * 0.006;
    }
    const bumpV = (bumpH - this.lastBumpH) / dt;
    this.lastBumpH = bumpH;
    const s = this.susp;
    this.bump = 0;
    if (Math.abs(bumpV) > 0.2 && speed > 2) {
      s.heaveV += bumpV * 0.35;
      s.pitchV += bumpV * 0.09 * (Math.random() - 0.5);
      s.rollV += bumpV * 0.05 * (Math.random() - 0.5);
      this.bump = clamp(Math.abs(bumpV) * 0.6, 0, 1.5);
      if (Math.abs(bumpV) > 0.5) this.onBump?.(clamp(Math.abs(bumpV) * 0.6, 0, 1));
    }
    s.heaveV += bumpV * 0.05;
    // ---- leaf springs: squat under the load, dive under braking, roll in bends --------------------------------
    const sag = this.sag();
    const pitchT = clamp(this.accLong * 0.0085, -0.06, 0.06) + sag.pitch;
    const rollT = clamp(this.accLat * 0.011 * (1 + load * 0.35), -0.085, 0.085) + sag.roll;
    const kP = 55 / (1 + load * 0.3), cP = 7, kR = 42 / (1 + load * 0.3), cR = 5.5, kH = 130, cH = 11;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      s.pitchV += ((pitchT - s.pitch) * kP - s.pitchV * cP) * h; s.pitch += s.pitchV * h;
      s.rollV += ((rollT - s.roll) * kR - s.rollV * cR) * h; s.roll += s.rollV * h;
      s.heaveV += ((sag.heave - s.heave) * kH - s.heaveV * cH) * h; s.heave += s.heaveV * h;
    }
    if (engineOn) s.roll += Math.sin(performance.now() * 0.001 * this.rpm * 0.105) * 0.0004 * (1.2 - Math.min(1, this.rpm / 2500)) * (dmg.engine < 0.6 ? 2.5 : 1);
    // ---- wheels -----------------------------------------------------------------------------------------------
    const spin = (this.v / R) * dt;
    for (let i = 0; i < 4; i++) if (!(i >= 2 && this.handbrake)) this.wheelSpin[i] += spin;
  }

  /** body attitude from the cargo (rear squat), a flat tyre and a tired spring */
  private sag(): { heave: number; pitch: number; roll: number } {
    const g = this.geom, L = g.axleF - g.axleR;
    const kg = this.cargoKg;
    // share of the load on the rear axle from where it sits along the truck
    const rearShare = clamp((g.axleF - this.cargoAt.z) / L, 0, 1.15);
    const kRear = 230000, kFront = 160000; // N/m per axle (leaf packs)
    const dzR = -(kg * G * rearShare) / kRear;
    const dzF = -(kg * G * (1 - rearShare)) / kFront;
    let heave = (dzF + dzR) / 2;
    let pitch = Math.atan2(dzF - dzR, L); // + = nose up
    let roll = clamp(-this.cargoAt.x * kg * 0.00002, -0.04, 0.04);
    const f = this.damage.flat;
    if (f >= 0) {
      heave -= 0.02;
      pitch += (f < 2 ? -1 : 1) * 0.022;
      roll += (f % 2 === 0 ? -1 : 1) * 0.03;
    }
    return { heave, pitch, roll };
  }

  private surfaceAt(): void {
    const ri = roadInfo(this.pos.x, this.pos.z);
    const half = ri.road >= 0 ? ri.w : 0;
    const off = ri.road >= 0 ? clamp((ri.d + 0.9 - half) / 1.2, 0, 1) : 1;
    this.offRoad = off;
    const water = WORLD.waterY - this.groundY;
    this.inWater = clamp(water / 0.9, 0, 1);
    if (this.inWater > 0.15) { this.surface = 'water'; return; }
    // BUSHED's roads are all unpaved: packed gravel on the highway and the cabin road, dirt on the trails
    if (off < 0.5) this.surface = ri.id === 'highway' || ri.id === 'cabin_road' ? 'gravel' : 'dirt';
    else if (ri.road >= 0 && ri.d < half + 4) this.surface = 'dirt';
    else this.surface = 'bush';
  }

  followGround(dt: number): void {
    const g = this.geom;
    const fw = this.forward(_f), lf = this.left(_r);
    const ht = g.track / 2;
    const samp = (lz: number, lx: number) => {
      _p.copy(this.pos).addScaledVector(fw, lz).addScaledVector(lf, lx);
      return heightAt(_p.x, _p.z);
    };
    const fl = samp(g.axleF, ht), fr = samp(g.axleF, -ht), rl = samp(g.axleR, ht), rr = samp(g.axleR, -ht);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2, lft = (fl + rl) / 2, rgt = (fr + rr) / 2;
    const L = g.axleF - g.axleR;
    // ground plane through the four contacts; the body origin sits on it under its own (z = 0) station
    const y = rear + (front - rear) * (-g.axleR / L);
    const pitch = Math.atan2(front - rear, L);
    const roll = Math.atan2(lft - rgt, g.track);
    const k = 1 - Math.exp(-16 * dt);
    this.groundY = this.gInit ? lerp(this.groundY, y, k) : y;
    this.groundPitch = this.gInit ? lerp(this.groundPitch, pitch, k) : pitch;
    this.groundRoll = this.gInit ? lerp(this.groundRoll, roll, k) : roll;
    this.gInit = true;
    this.pos.y = this.groundY;
    // articulation: each wheel follows its own patch of ground relative to the fitted plane
    const planeAt = (lz: number, lx: number) => y + Math.tan(pitch) * lz + Math.tan(roll) * lx;
    const d = [fl - planeAt(g.axleF, ht), fr - planeAt(g.axleF, -ht), rl - planeAt(g.axleR, ht), rr - planeAt(g.axleR, -ht)];
    for (let i = 0; i < 4; i++) this.wheelDrop[i] = damp(this.wheelDrop[i], clamp(d[i], -0.14, 0.14), 18, dt);
  }

  // ------------------------------------------------------------------------------------------------- autopilot
  setAutopilot(spec: AutopilotSpec | null): void {
    if (!spec) { this.auto = null; this.autoPath = null; return; }
    const p = roadPath(spec.road);
    if (!p) { this.auto = null; return; }
    this.autoPath = p;
    const t = spec.from ?? roadProject(p, this.pos.x, this.pos.z, p.len / 2);
    this.auto = { ...spec, t, done: false };
  }

  private autopilotStep(dt: number): void {
    const a = this.auto!, p = this.autoPath!;
    const dir = a.reverse ? -1 : 1;
    a.t = roadProject(p, this.pos.x, this.pos.z, a.t);
    const speed = Math.abs(this.v);
    const look = 4.5 + speed * 0.7;
    roadAt(p, a.t + dir * look, _t, _q);
    _q.multiplyScalar(dir);
    const lane = a.lane ?? (a.road === 'highway' ? 1.7 : 0.55);
    // + lane = right of travel: right = -left
    const lx = Math.cos(Math.atan2(_q.x, _q.z)), lz = -Math.sin(Math.atan2(_q.x, _q.z));
    _t.x -= lx * lane; _t.z -= lz * lane;
    // pure pursuit in truck space
    const fw = this.forward(_f), lf = this.left(_r);
    const dx = _t.x - this.pos.x, dz = _t.z - this.pos.z;
    const x = dx * lf.x + dz * lf.z, z = dx * fw.x + dz * fw.z;
    const ld = Math.max(0.5, Math.hypot(x, z));
    const curv = (2 * x) / (ld * ld);
    const L = this.geom.axleF - this.geom.axleR;
    const wheel = Math.atan(curv * L);
    const maxA = TRUCK.maxSteer * lerp(1, 0.2, smooth(0, 26, speed));
    this.input.steer = clamp(wheel / Math.max(0.05, maxA), -1, 1);
    // speed: cruise, slow for bends ahead, stop at the end
    let vT = a.speed ?? 13;
    const end = a.to ?? (a.reverse ? 0 : p.len);
    const dist = (end - a.t) * dir;
    if (!a.through) vT = Math.min(vT, Math.sqrt(Math.max(0, 2 * 2.0 * Math.max(0, dist - 1))));
    else vT = Math.min(vT, Math.sqrt(36 + 2 * 2.2 * Math.max(0, dist - 2))); // roll into the junction at ~20 km/h
    roadAt(p, a.t, _p, _t);
    roadAt(p, a.t + dir * (14 + speed * 1.2), _p, _q);
    const ang = Math.acos(clamp(_t.dot(_q), -1, 1));
    vT = Math.min(vT, Math.max(5, 22 - ang * 26));
    const err = vT - this.v;
    this.gear = 'D';
    this.input.throttle = clamp(err * 0.3, 0, 1);
    this.input.brake = clamp(-err * 0.45, 0, 1);
    if (a.through && dist <= 2.5) a.done = true;
    else if (dist <= 1.2 && speed < 0.4) { this.input.throttle = 0; this.input.brake = 1; a.done = true; }
    void dt;
  }
}
