// The cinematic camera: authored shots drive game.camera every frame, after the game has placed it, so a shot always
// wins and the hand-back can blend from the shot into whatever the game wants (walking eyes, the driver's seat).
// Ported from the author's own game หลอนยันปลายทาง (effective-octo-train/src/game/Cinematic.js, the CineCam in
// src/game/opening/common.js and the cinematic layer of src/core/CameraRig.js): cuts and blends between shots, a
// shot is a function of its own progress, plus the moves a camera crew has (dolly, crane, orbit, tracking car,
// rigid mount, a flown spline), a lens (focal length, focus distance, aperture) and handheld drift.
//
//   const cam = new CineCam(game);
//   await cam.play(dolly(a, b, lookAt), 6, { lens: { mm: 35, focus: 8, fstop: 2.8 } });   // true unless cut short
//   cam.release(1.2);                                                                       // back to the player
import * as THREE from 'three';
import type { Game } from '../game';
import { cineHooks } from './hooks';

export interface Lens {
  /** focal length (mm, full-frame 36x24): 18 wide, 35 normal-wide, 50 normal, 85 portrait, 135 long */
  mm?: number;
  /** focus distance (m) and aperture (f-stop) for depth of field (the renderer's, through cineHooks.dof) */
  focus?: number;
  fstop?: number;
}
export interface ShotOpts {
  /** hard cut (default) or a blend from the current picture over `blend` seconds */
  cut?: boolean;
  blend?: number;
  lens?: Lens;
  /** handheld drift: 0 locked off on sticks, 0.3 on a car mount, 1 on the shoulder */
  handheld?: number;
  /** dutch angle (radians) */
  roll?: number;
}
/** a shot sets c.pos and c.look (and may pull focus, zoom, roll) from k = 0..1 and t = seconds into the shot */
export type ShotFn = (c: CineCam, k: number, t: number, dt: number) => void;

/** vertical field of view (degrees) of a full-frame lens */
export const mmToFov = (mm: number): number => (2 * Math.atan(12 / mm) * 180) / Math.PI;
export const smooth = (k: number): number => k * k * (3 - 2 * k);
export const easeInOut = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = (k: number): number => 1 - Math.pow(1 - k, 3);

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class CineCam {
  /** where the camera is and what it looks at: shots write these */
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3(0, 0, -1);
  mm = 35;
  focus = 10;
  fstop = 5.6;
  roll = 0;
  handheld = 0;
  /** true while shots own the camera (and during the hand-back) */
  active = false;
  private fn: ShotFn | null = null;
  private t = 0;
  private dur = 0;
  private done: ((finished: boolean) => void) | null = null;
  // blend between shots (from the last picture) and back to the game's camera
  private readonly fromPos = new THREE.Vector3();
  private readonly fromQuat = new THREE.Quaternion();
  private fromFov = 50;
  private blendT = 0;
  private blendDur = 0;
  private releaseT = -1;
  private releaseDur = 1;
  private readonly lastPos = new THREE.Vector3();
  private readonly lastQuat = new THREE.Quaternion();
  private lastFov = 50;
  private gameFov = 68;
  private ht = Math.random() * 100;
  private released: (() => void) | null = null;
  private readonly tick = (dt: number) => this.update(dt);

  constructor(private g: Game) {}

  /** take the camera (idempotent): the tick goes last among the game's updaters */
  begin(): this {
    if (!this.active) {
      this.active = true;
      this.gameFov = this.g.camera.fov;
      this.lastPos.copy(this.g.camera.position);
      this.lastQuat.copy(this.g.camera.quaternion);
      this.lastFov = this.g.camera.fov;
    }
    const i = this.g.updaters.indexOf(this.tick);
    if (i >= 0) this.g.updaters.splice(i, 1);
    this.g.updaters.push(this.tick);
    this.releaseT = -1;
    return this;
  }

  /** run a shot for `dur` seconds; resolves true when it ran to the end, false when cut short (skip, next shot) */
  play(fn: ShotFn, dur: number, o: ShotOpts = {}): Promise<boolean> {
    this.begin();
    this.done?.(false);
    this.fn = fn;
    this.t = 0;
    this.dur = Math.max(0.01, dur);
    if (o.lens?.mm) this.mm = o.lens.mm;
    if (o.lens?.focus) this.focus = o.lens.focus;
    if (o.lens?.fstop) this.fstop = o.lens.fstop;
    this.roll = o.roll ?? 0;
    this.handheld = o.handheld ?? 0.15;
    const cut = o.cut !== false;
    this.blendDur = cut ? 0 : (o.blend ?? 1.2);
    this.blendT = 0;
    this.fromPos.copy(this.lastPos); this.fromQuat.copy(this.lastQuat); this.fromFov = this.lastFov;
    // place the first frame now so a cut lands on the right picture this very frame
    fn(this, 0, 0, 0);
    return new Promise((r) => { this.done = r; });
  }

  /** hold the current picture (a still) until the next play or release */
  hold(): void { this.fn = null; this.done?.(false); this.done = null; }

  /** blend back to the game's own camera over `blend` seconds (the game must be driving it again: walk / drive) */
  release(blend = 1): Promise<void> {
    this.hold();
    this.releaseT = 0;
    this.releaseDur = Math.max(0.01, blend);
    this.fromPos.copy(this.lastPos); this.fromQuat.copy(this.lastQuat); this.fromFov = this.lastFov;
    return new Promise((r) => { this.released = r; });
  }

  /** stop at once (no blend) */
  stop(): void {
    this.hold();
    this.finish();
  }

  private finish(): void {
    this.active = false;
    this.releaseT = -1;
    const i = this.g.updaters.indexOf(this.tick);
    if (i >= 0) this.g.updaters.splice(i, 1);
    const cam = this.g.camera;
    if (Math.abs(cam.fov - this.gameFov) > 1e-3) { cam.fov = this.gameFov; cam.updateProjectionMatrix(); }
    cineHooks.dof?.(null);
    const r = this.released; this.released = null; r?.();
  }

  private update(dt: number): void {
    if (!this.active) return;
    const cam = this.g.camera;
    if (this.releaseT >= 0) {
      // the game has just placed the camera where it wants it: ease from the last shot toward that
      this.releaseT += dt;
      const k = easeInOut(Math.min(1, this.releaseT / this.releaseDur));
      cam.position.lerpVectors(this.fromPos, cam.position, k);
      cam.quaternion.slerpQuaternions(this.fromQuat, cam.quaternion, k);
      const fov = this.fromFov + (this.gameFov - this.fromFov) * k;
      if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
      cineHooks.dof?.(k < 1 ? { focus: this.focus, fstop: this.fstop * (1 + k * 8), mm: this.mm } : null);
      if (k >= 1) this.finish();
      return;
    }
    if (this.fn) {
      this.t += dt;
      const k = Math.min(1, this.t / this.dur);
      try { this.fn(this, k, this.t, dt); } catch (e) { console.warn('[cine] shot', e); this.fn = null; }
      if (this.t >= this.dur && this.done) { const d = this.done; this.done = null; d(true); }
    }
    // the picture: look-at frame, dutch roll, handheld drift (layered sines: no allocation, no noise texture)
    _m.lookAt(this.pos, this.look, UP);
    _q.setFromRotationMatrix(_m);
    this.ht += dt;
    const h = this.handheld, t = this.ht;
    const yaw = h * 0.006 * (Math.sin(t * 0.73) + 0.6 * Math.sin(t * 1.91 + 1.3) + 0.25 * Math.sin(t * 4.7));
    const pitch = h * 0.005 * (Math.sin(t * 0.61 + 2.1) + 0.5 * Math.sin(t * 2.3) + 0.2 * Math.sin(t * 5.3 + 0.4));
    _q2.setFromEuler(_e.set(pitch, yaw, this.roll + h * 0.004 * Math.sin(t * 0.9 + 0.7), 'YXZ'));
    _q.multiply(_q2);
    const fov = mmToFov(this.mm);
    if (this.blendT < this.blendDur) {
      this.blendT += dt;
      const b = easeInOut(Math.min(1, this.blendT / this.blendDur));
      cam.position.lerpVectors(this.fromPos, this.pos, b);
      cam.quaternion.slerpQuaternions(this.fromQuat, _q, b);
      const f = this.fromFov + (fov - this.fromFov) * b;
      if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
    } else {
      cam.position.copy(this.pos);
      cam.quaternion.copy(_q);
      if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    }
    cam.updateMatrixWorld();
    this.lastPos.copy(cam.position); this.lastQuat.copy(cam.quaternion); this.lastFov = cam.fov;
    cineHooks.dof?.({ focus: this.focus, fstop: this.fstop, mm: this.mm });
  }

  /** distance from the camera to a point (for pulling focus) */
  distTo(p: THREE.Vector3): number { return this.pos.distanceTo(p); }
}

// ---------------------------------------------------------------------------------------------- the moves
type V = THREE.Vector3;
type VFn = V | ((k: number) => V);
const at = (v: VFn, k: number): V => (typeof v === 'function' ? v(k) : v);

/** a locked-off shot (the camera can still pan to follow a moving look target) */
export function still(pos: V, look: VFn): ShotFn {
  return (c, k) => { c.pos.copy(pos); c.look.copy(at(look, k)); };
}

/** a dolly: the camera on rails from a to b (eased), looking at a fixed point or one that moves */
export function dolly(a: V, b: V, look: VFn, ease = smooth): ShotFn {
  return (c, k) => { c.pos.lerpVectors(a, b, ease(k)); c.look.copy(at(look, k)); };
}

/** a crane: rise (or fall) from h0 to h1 above a base point, the look tilting from look0 to look1 */
export function crane(base: V, h0: number, h1: number, look0: V, look1: V = look0, ease = easeInOut): ShotFn {
  return (c, k) => {
    const e = ease(k);
    c.pos.copy(base); c.pos.y += h0 + (h1 - h0) * e;
    c.look.lerpVectors(look0, look1, e);
  };
}

/** an orbit round a centre (angles in radians, 0 = +Z), at radius r and height h above it */
export function orbit(center: VFn, r: number, a0: number, a1: number, h: number, lookH = 0, ease = smooth): ShotFn {
  return (c, k) => {
    const p = at(center, k), a = a0 + (a1 - a0) * ease(k);
    c.pos.set(p.x + Math.sin(a) * r, p.y + h, p.z + Math.cos(a) * r);
    c.look.set(p.x, p.y + lookH, p.z);
  };
}

/** a flown path: Catmull-Rom through camera points, the look through its own points */
export function flight(points: V[], looks: V[], ease = (k: number) => k): ShotFn {
  const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const lp = looks.length > 1 ? new THREE.CatmullRomCurve3(looks, false, 'centripetal') : null;
  return (c, k) => {
    const e = ease(k);
    path.getPoint(e, c.pos);
    if (lp) lp.getPoint(e, c.look); else c.look.copy(looks[0]);
  };
}

/**
 * a tracking shot from a camera car: an offset in the subject's frame (x left, y up, z forward, as vehicles are)
 * moving from off0 to off1, looking at lookOff in the same frame; `lag` softens the follow (0 = rigid)
 */
export function track(subject: THREE.Object3D, off0: V, off1: V, lookOff: V, lag = 0.25, ease = smooth): ShotFn {
  const want = new THREE.Vector3(), off = new THREE.Vector3(), q = new THREE.Quaternion();
  const yawOnly = (o: THREE.Object3D) => {
    // follow the subject's heading but not its pitch and roll (a camera car stays level)
    _v.copy(_z).applyQuaternion(o.quaternion); _v.y = 0;
    q.setFromAxisAngle(UP, Math.atan2(_v.x, _v.z));
    return q;
  };
  let first = true;
  return (c, k, _t, dt) => {
    const qq = yawOnly(subject);
    off.lerpVectors(off0, off1, ease(k)).applyQuaternion(qq);
    want.copy(subject.position).add(off);
    if (first || lag <= 0 || dt <= 0) { c.pos.copy(want); first = false; }
    else c.pos.lerp(want, 1 - Math.exp(-dt / lag));
    c.look.copy(lookOff).applyQuaternion(qq).add(subject.position);
  };
}

/** rigidly mounted on a moving object (inside the cab): local camera point and local look point, both eased */
export function mounted(obj: THREE.Object3D, p0: V, p1: V, l0: V, l1: V = l0, ease = smooth): ShotFn {
  const lp = new THREE.Vector3(), ll = new THREE.Vector3();
  return (c, k) => {
    const e = ease(k);
    obj.updateWorldMatrix(true, false);
    c.pos.copy(lp.lerpVectors(p0, p1, e)).applyMatrix4(obj.matrixWorld);
    c.look.copy(ll.lerpVectors(l0, l1, e)).applyMatrix4(obj.matrixWorld);
  };
}

/** pull focus (and optionally zoom) across a shot: wrap another shot */
export function withLens(shot: ShotFn, f: (c: CineCam, k: number) => void): ShotFn {
  return (c, k, t, dt) => { shot(c, k, t, dt); f(c, k); };
}
