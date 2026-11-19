// First-person body: a Rapier kinematic capsule driven by a character controller, mouse look, walk/sprint/crouch,
// footsteps with surface types, trampling marks and the vegetation pusher.
//
// Movement feel after Gacha Garage's Player.js (the author's own game): velocity eases toward the wish on
// exponential curves, quicker to stop than to start (and slower to get going under a heavy load); footsteps come
// from distance walked over a stride, and the head bob is locked to them - the head is lowest on the footfall and
// sways over the stance foot - with a small thump on each step; strafing leans the camera into the move; landings
// squash the eye on a spring (deeper with a load) and nod the view; crouching eases the eye down and up on a damped
// spring; stepping up a stair or a root lifts the body at once but the camera follows smoothly.
import * as THREE from 'three';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { input } from '../core/input';
import { setPusher } from '../gfx/globals';
import { marks } from '../world/marks';
import { roadInfo, SPOTS, heightAt, biome } from '../world/layout';

export type Surface = 'forest' | 'grass' | 'gravel' | 'mud' | 'wood' | 'snow' | 'water';

const RADIUS = 0.3, HALF = 0.6;
const EYE = 1.66, EYE_CROUCH = 1.05;

export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  vel = new THREE.Vector3();
  grounded = false;
  crouch = false;
  sprinting = false;
  enabled = true;
  /** 0..1 slows walking (heavy carry, deep cold, exhaustion) */
  burden = 0;
  /** stamina gate set by survival: 0 = cannot sprint */
  canSprint = true;
  /** horizontal speed (m/s) */
  speed = 0;
  /** set by the game when walking on interior floors */
  indoor = false;
  /** the mouse is busy (turning an inspected item): don't turn the view */
  lookLocked = false;
  /** footstep phase 0..1 (0 = a footfall) and footfalls so far (odd = right foot): the arms and body sync to these */
  stepPhase = 0.6;
  stepCount = 0;
  /** crouch 0 standing .. 1 down, smoothed */
  crouchK = 0;
  /** landing strength (0..1) on the frame the feet touch down, else 0 */
  landImpulse = 0;
  /** camera roll from strafing (radians) */
  lean = 0;
  onStep: (surface: Surface, strength: number, pos: THREE.Vector3) => void = () => {};
  onLand: (v: number) => void = () => {};
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private ctl!: RAPIER.KinematicCharacterController;
  private eye = EYE;
  private eyeV = 0;
  private lastFoot = 0;
  private shake = 0;
  private shakeT = 0;
  private airTime = 0;
  private landY = 0;
  private landV = 0;
  private stepOff = 0;
  private moving = 0;
  private still = 0;
  private wasGrounded = false;

  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera; }

  init(x: number, z: number, yaw = 0): void {
    const y = heightAt(x, z) + HALF + RADIUS + 0.05;
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(groups(GROUP.PLAYER, GROUP.GROUND | GROUP.STATIC | GROUP.DYNAMIC | GROUP.VEHICLE)),
      this.body,
    );
    this.ctl = physics.world.createCharacterController(0.02);
    this.ctl.setUp({ x: 0, y: 1, z: 0 });
    this.ctl.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.ctl.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.ctl.enableAutostep(0.38, 0.2, false);
    this.ctl.enableSnapToGround(0.4);
    this.ctl.setApplyImpulsesToDynamicBodies(true);
    this.ctl.setCharacterMass(85);
    this.pos.set(x, y - HALF - RADIUS, z);
    this.yaw = yaw;
  }

  teleport(x: number, y: number | null, z: number, yaw?: number): void {
    const yy = (y ?? heightAt(x, z)) + HALF + RADIUS + 0.05;
    this.body.setNextKinematicTranslation({ x, y: yy, z });
    this.body.setTranslation({ x, y: yy, z }, true);
    this.pos.set(x, yy - HALF - RADIUS, z);
    this.vel.set(0, 0, 0);
    this.stepOff = 0; this.landY = 0; this.landV = 0; this.airTime = 0;
    if (yaw !== undefined) this.yaw = yaw;
  }

  addShake(a: number): void { this.shake = Math.min(1.5, this.shake + a); }

  forward(out = new THREE.Vector3()): THREE.Vector3 { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  look(): void {
    if (!input.locked || this.lookLocked) return;
    this.yaw -= input.mouseDX * input.sensitivity;
    this.pitch -= input.mouseDY * input.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.landImpulse = 0;
    this.look();
    const f = input.axis('KeyS', 'KeyW'), s = input.axis('KeyA', 'KeyD');
    this.crouch = input.held('ControlLeft') || input.held('KeyC');
    const wantSprint = input.held('ShiftLeft') && f > 0 && !this.crouch && this.canSprint;
    this.sprinting = wantSprint;
    let target = this.crouch ? 1.3 : wantSprint ? 4.9 : 2.5;
    target *= 1 - 0.5 * this.burden;
    const fw = this.forward(), rt = new THREE.Vector3(-fw.z, 0, fw.x);
    const wish = fw.clone().multiplyScalar(f).addScaledVector(rt, s);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(target);
    // acceleration curves: an exponential approach (Gacha Garage damp()), quicker to stop and to turn round than to
    // get going; a load makes starts sluggish; little control in the air
    const hv = Math.hypot(this.vel.x, this.vel.z), wv = Math.hypot(wish.x, wish.z);
    const against = this.vel.x * wish.x + this.vel.z * wish.z < 0;
    let rate: number;
    if (!this.grounded) rate = wv > 0.01 ? 1.6 : 0.4;
    else if (wv < 0.01) rate = 12.5;
    else if (against) rate = 15;
    else if (wv >= hv) rate = (wantSprint ? 6.5 : 9.5) * (1 - 0.45 * this.burden);
    else rate = 8;
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (wish.x - this.vel.x) * k;
    this.vel.z += (wish.z - this.vel.z) * k;
    if (this.grounded) {
      this.vel.y = -1;
      if (input.pressed('Space') && !this.crouch && this.burden < 0.6) {
        this.vel.y = 4.2; this.grounded = false;
        this.landV -= 0.35;                            // a little crouch into the jump
      }
    } else this.vel.y -= 9.81 * dt;

    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.ctl.computeColliderMovement(this.collider, desired, undefined, groups(0xffff, GROUP.GROUND | GROUP.STATIC | GROUP.DYNAMIC | GROUP.VEHICLE));
    const mv = this.ctl.computedMovement();
    const t = this.body.translation();
    const next = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z };
    // never fall through the terrain if a heightfield patch is missing
    const gy = heightAt(next.x, next.z) + HALF + RADIUS;
    if (next.y < gy - 0.3) next.y = gy;
    this.body.setNextKinematicTranslation(next);
    const wasGrounded = this.grounded;
    this.grounded = this.ctl.computedGrounded();
    // stepping up (autostep) or down a ledge while walking: the body moves at once, the eye eases after it
    const dh = Math.hypot(mv.x, mv.z), dy = next.y - t.y;
    if (this.grounded && this.wasGrounded && Math.abs(dy) > 0.6 * dh + 0.012) this.stepOff = THREE.MathUtils.clamp(this.stepOff - dy, -0.45, 0.45);
    this.wasGrounded = this.grounded;
    if (!this.grounded) this.airTime += dt;
    if (this.grounded && !wasGrounded) {
      const v = Math.min(1, this.airTime * 1.6);
      if (this.airTime > 0.18) {
        // squash: knock the eye down on a spring (deeper under a load), and tell the viewmodel
        this.landV -= (0.45 + 1.7 * v) * (1 + 0.6 * this.burden);
        this.landImpulse = 0.25 + 0.75 * v;
        this.onLand(v);
      }
      this.airTime = 0;
    }
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    const realV = new THREE.Vector3(mv.x, 0, mv.z).divideScalar(Math.max(dt, 1e-4));
    this.speed = realV.length();
    this.pos.set(next.x, next.y - HALF - RADIUS, next.z);

    // footsteps from distance walked over a stride (Gacha Garage), so the cadence follows the real speed
    if (this.grounded && this.speed > 0.35) {
      this.still = 0;
      const stride = (this.sprinting ? 0.98 : this.crouch ? 0.52 : 0.74) * (1 - 0.12 * this.burden);
      this.stepPhase += dh / stride;
      if (this.stepPhase >= 1) {
        this.stepPhase -= Math.floor(this.stepPhase);
        this.stepCount++;
        this.lastFoot = this.stepCount & 1;
        const side = this.lastFoot ? 1 : -1;
        const fx = this.pos.x + Math.cos(this.yaw) * 0.14 * side, fz = this.pos.z - Math.sin(this.yaw) * 0.14 * side;
        const surf = this.surface();
        if (surf !== 'wood') marks.stamp(0, fx, fz, 0.12, 0.2, -this.yaw, this.sprinting ? 0.18 : 0.1);
        this.onStep(surf, this.sprinting ? 1 : this.crouch ? 0.35 : 0.7, new THREE.Vector3(fx, this.pos.y, fz));
        // the footfall thump: a small knock on the same spring as the landings
        this.landV -= (this.sprinting ? 0.16 : this.crouch ? 0.03 : 0.08) * Math.min(1, this.speed / 2.5) * (1 + this.burden);
      }
    } else if ((this.still += dt) > 0.25) this.stepPhase = 0.55;

    setPusher(0, this.pos.x, this.pos.y, this.pos.z, 0.55);

    // camera
    // crouch: the eye eases down and back up on a damped spring
    const targetEye = this.crouch ? EYE_CROUCH : EYE;
    const om = 12, ze = 0.9, ol = 11, zl = 0.42;
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.eyeV += ((targetEye - this.eye) * om * om - 2 * ze * om * this.eyeV) * h; this.eye += this.eyeV * h;
      // landing / footfall spring
      this.landV += (-this.landY * ol * ol - 2 * zl * ol * this.landV) * h; this.landY += this.landV * h;
    }
    this.crouchK = THREE.MathUtils.clamp((EYE - this.eye) / (EYE - EYE_CROUCH), 0, 1);
    this.landY = Math.max(-0.22, this.landY);
    this.stepOff *= Math.exp(-dt * 11);
    // head bob locked to the footsteps: lowest on the footfall, the head over the stance foot mid-stride
    this.moving += ((this.grounded ? Math.min(1, this.speed / 2.5) : 0) - this.moving) * Math.min(1, dt * 6);
    const lift = Math.sin(Math.PI * this.stepPhase);
    const amp = this.moving * (this.sprinting ? 1.5 : this.crouch ? 0.55 : 1) * (1 + 0.5 * this.burden);
    const bobY = (lift - 0.5) * 0.03 * amp;
    const bobX = (this.lastFoot ? 1 : -1) * lift * 0.016 * amp;
    // strafing leans the view into the move
    const side = this.vel.x * rt.x + this.vel.z * rt.z;
    this.lean += (THREE.MathUtils.clamp(-side / 4.9, -1, 1) * 0.035 - this.lean) * Math.min(1, dt * 6);
    this.shake *= Math.exp(-dt * 5);
    this.shakeT += dt * 40;
    const sk = this.shake * 0.02;
    const cam = this.camera;
    cam.position.set(this.pos.x, this.pos.y + this.eye + bobY + this.landY + this.stepOff, this.pos.z);
    cam.position.x += rt.x * bobX; cam.position.z += rt.z * bobX;
    cam.rotation.set(0, 0, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + Math.sin(this.shakeT * 1.3) * sk;
    cam.rotation.x = this.pitch + Math.sin(this.shakeT) * sk + this.landY * 0.8;
    cam.rotation.z = this.lean - bobX * 0.45 + Math.sin(this.shakeT * 0.7) * sk * 0.5;
  }

  /** what the player is standing on (for footstep sounds) */
  surface(): Surface {
    if (this.indoor) return 'wood';
    const x = this.pos.x, z = this.pos.z;
    if (this.pos.y < 2.05) return 'water';
    const r = roadInfo(x, z);
    if (r.road >= 0 && r.d < r.w && (r.id === 'highway' || r.id === 'cabin_road')) return 'gravel';
    if (Math.hypot(x - SPOTS.cabin.x, z - SPOTS.cabin.z) < 22 || Math.hypot(x - SPOTS.store.x, z - SPOTS.store.z) < 40) return 'grass';
    const b = biome(x, z);
    if (b.wet > 0.82) return 'mud';
    return 'forest';
  }
}
