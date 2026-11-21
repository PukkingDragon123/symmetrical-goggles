// A scripted driver for cinematics: drives any vehicle that takes DriveInput (the old Jeep, the logging truck) along
// a path with pure-pursuit steering and a speed governor, and brakes to a stop at the end. It hooks in by wrapping
// the vehicle's own update(dt, input), so the real physics (suspension, wheel spin, dust, tyre marks, engine pitch)
// all play: nothing is faked. If the vehicle brings its own autopilot later, Pilot steps aside for it.
import * as THREE from 'three';
import { ROADS } from '../../world/layout';

export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }
/** what the cinematics need from a vehicle (the Jeep's API; the logging truck keeps it) */
export interface VehicleLike {
  root: THREE.Object3D;
  speed: number;
  running: boolean;
  headlights: boolean;
  spawn(x: number, z: number, heading: number): void;
  update(dt: number, inp: DriveInput): void;
  eye?(out?: THREE.Vector3): THREE.Vector3;
  seat?: THREE.Object3D;
  body?: unknown;
  /** somebody at the wheel (the logging truck only answers its pedals when occupied) */
  occupied?: boolean;
  /** the logging truck's own physics state (its speed is phys.v) */
  phys?: { v: number };
}

export interface P2 { x: number; z: number }

/** points along a road from distance t0 to t1 (metres; t1 < t0 drives it backwards), every `step` m */
export function roadPath(id: string, t0: number, t1: number, step = 4): P2[] {
  const road = ROADS.find((r) => r.id === id);
  if (!road) return [];
  const cum: number[] = [0];
  for (let i = 1; i < road.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(road.pts[i].x - road.pts[i - 1].x, road.pts[i].z - road.pts[i - 1].z));
  const at = (t: number): P2 => {
    t = Math.max(0, Math.min(cum[cum.length - 1], t));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < t) i++;
    const a = road.pts[i - 1], b = road.pts[i], f = (t - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  };
  const out: P2[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / step));
  for (let k = 0; k <= n; k++) out.push(at(t0 + ((t1 - t0) * k) / n));
  return out;
}

const _l = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Pilot {
  /** cruising speed (m/s) */
  cruise: number;
  active = true;
  /** metres driven along the path (the pursuit cursor) */
  along = 0;
  readonly input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  private cum: number[] = [0];
  private cursor = 0;
  private orig: ((dt: number, inp: DriveInput) => void) | null = null;

  constructor(readonly v: VehicleLike, readonly path: P2[], o: { cruise?: number } = {}) {
    this.cruise = o.cruise ?? 11;
    for (let i = 1; i < path.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }

  get length(): number { return this.cum[this.cum.length - 1]; }
  get remaining(): number { return Math.max(0, this.length - this.along); }
  /** stopped at the end of the path */
  get arrived(): boolean { return this.remaining < 3 && Math.abs(this.v.speed) < 0.4; }

  /** put the vehicle on the path at distance s, rolling at `speed` m/s */
  place(s: number, speed = this.cruise): void {
    const p = this.pointAt(s), q = this.pointAt(s + 3);
    const heading = Math.atan2(q.x - p.x, q.z - p.z);
    this.v.spawn(p.x, p.z, heading);
    this.along = s;
    this.cursor = Math.max(0, this.cum.findIndex((c) => c >= s) - 1);
    // already rolling: the Jeep's rigid body takes a velocity, the logging truck's own physics a speed
    const body = this.v.body as { setLinvel?(v: { x: number; y: number; z: number }, wake: boolean): void; isDynamic?(): boolean } | undefined;
    if (body?.isDynamic?.()) body.setLinvel?.({ x: Math.sin(heading) * speed, y: 0, z: Math.cos(heading) * speed }, true);
    if (this.v.phys) this.v.phys.v = speed;
    this.v.root.position.set(p.x, this.v.root.position.y, p.z);
    this.v.root.rotation.set(0, heading, 0);
  }

  /** take the wheel (wraps the vehicle's update; idempotent) */
  attach(): this {
    if (this.orig) return this;
    const v = this.v, orig = v.update;
    this.orig = orig;
    v.update = (dt: number, inp: DriveInput) => orig.call(v, dt, this.active ? this.drive(dt) : inp);
    return this;
  }

  /** hand the wheel back */
  detach(): void {
    if (!this.orig) return;
    this.v.update = this.orig;
    this.orig = null;
  }

  pointAt(s: number): P2 {
    const c = this.cum, p = this.path;
    if (s <= 0) return p[0];
    if (s >= c[c.length - 1]) {
      // past the end: keep going the way the last segment points (for the lookahead)
      const a = p[p.length - 2] ?? p[0], b = p[p.length - 1], l = Math.max(1e-6, c[c.length - 1] - (c[c.length - 2] ?? 0)), over = s - c[c.length - 1];
      return { x: b.x + ((b.x - a.x) / l) * over, z: b.z + ((b.z - a.z) / l) * over };
    }
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const f = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, z: p[i - 1].z + (p[i].z - p[i - 1].z) * f };
  }

  /** this step's controls: pure pursuit to a point ahead on the path, throttle/brake to a speed that stops at the end */
  private drive(_dt: number): DriveInput {
    const v = this.v, pos = v.root.position, p = this.path, c = this.cum;
    // advance the cursor to the path point nearest the vehicle (only forward)
    let best = Infinity;
    for (let i = this.cursor; i < Math.min(p.length, this.cursor + 12); i++) {
      const d = (p[i].x - pos.x) ** 2 + (p[i].z - pos.z) ** 2;
      if (d < best) { best = d; this.cursor = i; }
    }
    // project onto the segment after the cursor for a smooth 'along'
    const i = Math.min(this.cursor, p.length - 2), a = p[i], b = p[i + 1] ?? a;
    const sx = b.x - a.x, sz = b.z - a.z, sl = Math.max(1e-6, Math.hypot(sx, sz));
    const f = Math.max(0, Math.min(1, ((pos.x - a.x) * sx + (pos.z - a.z) * sz) / (sl * sl)));
    this.along = c[i] + f * sl;
    const speed = v.speed;
    const look = this.pointAt(this.along + 5 + Math.max(0, speed) * 0.55);
    // into the vehicle's frame (+x is its left, +z forward)
    _q.copy(v.root.quaternion).invert();
    _l.set(look.x - pos.x, 0, look.z - pos.z).applyQuaternion(_q);
    const ang = Math.atan2(_l.x, _l.z);
    const inp = this.input;
    inp.steer = Math.max(-1, Math.min(1, ang * 2.2));
    // speed: cruise, slower through bends, and a braking curve into the stop
    const bend = Math.min(1, Math.abs(ang) * 1.6);
    const want = Math.min(this.cruise * (1 - bend * 0.45), Math.sqrt(2 * 2.2 * Math.max(0, this.remaining - 2.5)));
    const err = want - speed;
    inp.throttle = err > 0 ? Math.min(1, err * 0.35 + 0.1) : 0;
    inp.brake = err < -0.8 ? Math.min(1, -err * 0.25) : 0;
    inp.handbrake = this.remaining < 2.5 && Math.abs(speed) < 0.6;
    if (inp.handbrake) { inp.throttle = 0; inp.brake = 0; }   // (brake at a standstill means reverse on these)
    return inp;
  }
}
