// First-person body: a Rapier kinematic capsule driven by a character controller, mouse look, walk/sprint/crouch,
// head bob, landing dips, footstep events with surface types, trampling marks and the vegetation pusher.
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
  onStep: (surface: Surface, strength: number, pos: THREE.Vector3) => void = () => {};
  onLand: (v: number) => void = () => {};
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  private ctl!: RAPIER.KinematicCharacterController;
  private eye = EYE;
  private bobT = 0;
  private stepPhase = 0;
  private lastFoot = 0;
  private dip = 0;
  private shake = 0;
  private shakeT = 0;
  private airTime = 0;

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
    if (yaw !== undefined) this.yaw = yaw;
  }

  addShake(a: number): void { this.shake = Math.min(1.5, this.shake + a); }

  forward(out = new THREE.Vector3()): THREE.Vector3 { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  look(): void {
    if (!input.locked) return;
    this.yaw -= input.mouseDX * input.sensitivity;
    this.pitch -= input.mouseDY * input.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.look();
    const f = input.axis('KeyS', 'KeyW'), s = input.axis('KeyA', 'KeyD');
    this.crouch = input.held('ControlLeft') || input.held('KeyC');
    const wantSprint = input.held('ShiftLeft') && f > 0 && !this.crouch && this.canSprint;
    this.sprinting = wantSprint;
    let target = this.crouch ? 1.3 : wantSprint ? 4.9 : 2.5;
    target *= 1 - 0.5 * this.burden;
    const fw = this.forward(), rt = new THREE.Vector3(-fw.z, 0, fw.x);
    const wish = fw.multiplyScalar(f).addScaledVector(rt, s);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(target);
    const accel = this.grounded ? 10 : 2;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.grounded) {
      this.vel.y = -1;
      if (input.pressed('Space') && !this.crouch && this.burden < 0.6) { this.vel.y = 4.2; this.grounded = false; }
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
    if (!this.grounded) this.airTime += dt;
    if (this.grounded && !wasGrounded) {
      const v = Math.min(1, this.airTime * 1.6);
      if (this.airTime > 0.25) { this.dip = 0.06 + 0.1 * v; this.onLand(v); }
      this.airTime = 0;
    }
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    const realV = new THREE.Vector3(mv.x, 0, mv.z).divideScalar(Math.max(dt, 1e-4));
    this.speed = realV.length();
    this.pos.set(next.x, next.y - HALF - RADIUS, next.z);

    // footsteps on the step cadence
    if (this.grounded && this.speed > 0.4) {
      const cadence = this.sprinting ? 2.9 : this.crouch ? 1.4 : 1.95;
      this.stepPhase += dt * cadence * Math.min(1.3, this.speed / target + 0.3);
      if (this.stepPhase >= 1) {
        this.stepPhase -= 1;
        this.lastFoot ^= 1;
        const side = this.lastFoot ? 1 : -1;
        const fx = this.pos.x + Math.cos(this.yaw) * 0.14 * side, fz = this.pos.z - Math.sin(this.yaw) * 0.14 * side;
        const surf = this.surface();
        if (surf !== 'wood') marks.stamp(0, fx, fz, 0.12, 0.2, -this.yaw, this.sprinting ? 0.18 : 0.1);
        this.onStep(surf, this.sprinting ? 1 : this.crouch ? 0.35 : 0.7, new THREE.Vector3(fx, this.pos.y, fz));
      }
    } else this.stepPhase = 0.6;

    setPusher(0, this.pos.x, this.pos.y, this.pos.z, 0.55);

    // camera
    const targetEye = this.crouch ? EYE_CROUCH : EYE;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 8);
    this.dip *= Math.exp(-dt * 6);
    const moving = Math.min(1, this.speed / 2.5);
    this.bobT += dt * (this.sprinting ? 12 : 8.5) * (0.35 + moving * 0.65);
    const bobY = Math.sin(this.bobT * 2) * 0.03 * moving * (this.sprinting ? 1.7 : 1);
    const bobX = Math.cos(this.bobT) * 0.025 * moving;
    this.shake *= Math.exp(-dt * 5);
    this.shakeT += dt * 40;
    const sk = this.shake * 0.02;
    const cam = this.camera;
    cam.position.set(this.pos.x, this.pos.y + this.eye + bobY - this.dip, this.pos.z);
    cam.position.x += Math.cos(this.yaw) * bobX; cam.position.z -= Math.sin(this.yaw) * bobX;
    cam.rotation.set(0, 0, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + Math.sin(this.shakeT * 1.3) * sk;
    cam.rotation.x = this.pitch + Math.sin(this.shakeT) * sk + this.dip * 0.4;
    cam.rotation.z = -bobX * 0.4 + Math.sin(this.shakeT * 0.7) * sk * 0.5;
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
