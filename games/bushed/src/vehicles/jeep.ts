// The old 4x4. Rapier raycast-vehicle physics (4 driven wheels, soft long-travel suspension, low gearing),
// a simple engine model (idle, RPM through 4 gears, engine braking) feeding the engine loop's pitch, headlights,
// a cargo bed that carries logs physically, and a first-person seat with the wheel turning in your hands.
// Model: public/assets/models/jeep.glb + jeep.json (wheel nodes, radius, seat) from the props pipeline.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { applyPixelTex } from '../gfx/tex';
import { marks } from '../world/marks';
import { heightAt } from '../world/layout';
import { debris, puffs } from '../gfx/particles';
import { registerInteractable } from '../game/interact';

export interface JeepMeta {
  wheels: { name: string; pos: [number, number, number]; radius: number; front: boolean; left: boolean }[];
  steeringWheel?: string;
  seat?: [number, number, number];
  size?: [number, number, number];
  doors?: string[];
}

export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }

export class Jeep {
  readonly root = new THREE.Group();
  model: THREE.Object3D | null = null;
  body!: RAPIER.RigidBody;
  ctl!: RAPIER.DynamicRayCastVehicleController;
  meta!: JeepMeta;
  private wheels: THREE.Object3D[] = [];
  private wheelBase: THREE.Quaternion[] = [];
  private steerWheel: THREE.Object3D | null = null;
  private steerBase = new THREE.Quaternion();
  private steerAxis = new THREE.Vector3(0, 0, 1);
  readonly lights: THREE.SpotLight[] = [];
  readonly seat = new THREE.Object3D();
  rpm = 800;
  gear = 1;
  speed = 0;
  steer = 0;
  running = false;
  headlights = false;
  occupied = false;
  private trackT = 0;
  onEnter: () => void = () => {};

  async load(): Promise<void> {
    const raw = await (await fetch('assets/models/jeep.json')).json();
    // the props pipeline writes wheels as an object keyed by node name
    const wheels = Array.isArray(raw.wheels) ? raw.wheels : Object.entries(raw.wheels as Record<string, { pos: [number, number, number]; radius: number }>)
      .map(([name, w]) => ({ name, pos: w.pos, radius: w.radius, front: w.pos[2] > 0, left: w.pos[0] > 0 }));
    const meta: JeepMeta = {
      wheels, size: raw.size,
      steeringWheel: typeof raw.steeringWheel === 'string' ? raw.steeringWheel : 'steering_wheel',
      seat: raw.driverEye ?? raw.seat,
    };
    if (raw.steeringWheel?.axis) this.steerAxis.fromArray(raw.steeringWheel.axis).normalize();
    this.meta = meta;
    const gltf = await new GLTFLoader().loadAsync('assets/models/jeep.glb');
    const m = gltf.scene;
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mt of mats) { const sm = mt as THREE.MeshStandardMaterial; if (sm.map) applyPixelTex(sm.map); }
    });
    this.model = m;
    this.root.add(m);
    for (const w of meta.wheels) {
      const o = m.getObjectByName(w.name);
      if (o) { this.wheels.push(o); this.wheelBase.push(o.quaternion.clone()); }
    }
    if (meta.steeringWheel) {
      this.steerWheel = m.getObjectByName(meta.steeringWheel) ?? null;
      if (this.steerWheel) this.steerBase.copy(this.steerWheel.quaternion);
    }
    const seat = meta.seat ?? [0.33, 1.5, -0.35];
    this.seat.position.set(seat[0], seat[1], seat[2]);
    this.root.add(this.seat);
    // headlights
    for (const sx of [-0.55, 0.55]) {
      const l = new THREE.SpotLight(0xfff0d0, 0, 60, 0.42, 0.55, 1.6);
      l.position.set(sx, 0.95, (meta.size?.[2] ?? 3.6) / 2 - 0.1);
      l.target.position.set(sx * 1.4, 0, 30);
      l.castShadow = sx < 0;
      l.shadow.mapSize.set(512, 512);
      this.root.add(l, l.target);
      this.lights.push(l);
    }
    registerInteractable(m, { kind: 'vehicle', label: () => (this.occupied ? '' : 'Drive'), use: () => this.onEnter(), reach: 3 });
  }

  spawn(x: number, z: number, heading: number): void {
    const y = heightAt(x, z) + 1.2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.05).setAngularDamping(0.4).setCanSleep(false));
    const S = this.meta.size ?? [1.7, 1.9, 3.6];
    // chassis: a low box for the body tub plus a narrow upper box for the cab (the mass sits low)
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(S[0] / 2 * 0.95, 0.32, S[2] / 2 * 0.95).setTranslation(0, 0.78, 0)
      .setMass(1250).setFriction(0.6).setCollisionGroups(groups(GROUP.VEHICLE, 0xffff & ~GROUP.PLAYER)), this.body);
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(S[0] / 2 * 0.85, 0.35, S[2] * 0.22).setTranslation(0, 1.35, -0.15)
      .setMass(150).setCollisionGroups(groups(GROUP.VEHICLE, 0xffff & ~GROUP.PLAYER)), this.body);
    this.ctl = physics.world.createVehicleController(this.body);
    // chassis frame: +Y up, +Z forward (Rapier defaults to +X forward)
    this.ctl.indexUpAxis = 1;
    this.ctl.setIndexForwardAxis = 2;
    this.meta.wheels.forEach((w, i) => {
      // suspension attaches above the wheel centre
      const rest = 0.32;
      this.ctl.addWheel({ x: w.pos[0], y: w.pos[1] + rest, z: w.pos[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, rest, w.radius);
      this.ctl.setWheelSuspensionStiffness(i, 22);
      this.ctl.setWheelSuspensionCompression(i, 2.6);
      this.ctl.setWheelSuspensionRelaxation(i, 3.0);
      this.ctl.setWheelMaxSuspensionTravel(i, 0.28);
      this.ctl.setWheelMaxSuspensionForce(i, 40000);
      this.ctl.setWheelFrictionSlip(i, 2.2);
      this.ctl.setWheelSideFrictionStiffness(i, 1.1);
    });
    physics.sync(this.body, this.root);
  }

  /** world position of the driver's eyes */
  eye(out = new THREE.Vector3()): THREE.Vector3 { return this.seat.getWorldPosition(out); }

  get forward(): THREE.Vector3 { return new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion); }

  update(dt: number, inp: DriveInput): void {
    if (!this.ctl) return;
    const v = this.body.linvel();
    const fwd = this.forward;
    this.speed = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
    // steering: slower at speed, self-centring
    const maxSteer = 0.55 - Math.min(0.3, Math.abs(this.speed) * 0.018);
    this.steer += (inp.steer * maxSteer - this.steer) * Math.min(1, dt * 4);
    // engine: 4 low gears, automatic
    const ratios = [3.9, 2.3, 1.5, 1.0], final = 4.1, wheelR = this.meta.wheels[0]?.radius ?? 0.38;
    const wheelRpm = (Math.abs(this.speed) / (2 * Math.PI * wheelR)) * 60;
    let rpm = wheelRpm * ratios[this.gear - 1] * final;
    if (rpm > 3600 && this.gear < 4) this.gear++;
    if (rpm < 1400 && this.gear > 1) this.gear--;
    rpm = wheelRpm * ratios[this.gear - 1] * final;
    const throttle = this.running ? inp.throttle : 0;
    const target = Math.max(780 + throttle * 1400, rpm);
    this.rpm += (Math.min(4600, target) - this.rpm) * Math.min(1, dt * 5);
    // torque curve: strong low end
    const torque = this.running ? 260 * (1 - Math.max(0, (this.rpm - 3200) / 2400)) : 0;
    const force = throttle * torque * ratios[this.gear - 1] * final / wheelR * 0.25;
    const reverse = inp.brake > 0 && this.speed < 0.5;
    for (let i = 0; i < this.meta.wheels.length; i++) {
      const w = this.meta.wheels[i];
      this.ctl.setWheelSteering(i, w.front ? this.steer : 0);
      this.ctl.setWheelEngineForce(i, reverse ? -inp.brake * 900 : force);
      const brake = (!reverse ? inp.brake * 60 : 0) + (inp.handbrake && !w.front ? 120 : 0) + (throttle < 0.05 && this.running ? 4 : 0);
      this.ctl.setWheelBrake(i, brake);
    }
    this.ctl.updateVehicle(dt, undefined, groups(0xffff, GROUP.GROUND | GROUP.STATIC | GROUP.DYNAMIC));
    // visuals: wheels spin and steer, the steering wheel turns
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.meta.wheels[i];
      const rot = this.ctl.wheelRotation(i) ?? 0;
      const st = this.ctl.wheelSteering(i) ?? 0;
      const susp = this.ctl.wheelSuspensionLength(i) ?? 0.32;
      const o = this.wheels[i];
      o.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rot)).multiply(this.wheelBase[i]);
      o.position.y = w.pos[1] + 0.32 - susp;
    }
    if (this.steerWheel) {
      // the axis is given in the parent's frame: rotate about it, then apply the rest pose
      const axisLocal = this.steerAxis.clone().applyQuaternion(this.steerBase.clone().invert());
      this.steerWheel.quaternion.copy(this.steerBase).multiply(new THREE.Quaternion().setFromAxisAngle(axisLocal, this.steer * 4.2));
    }
    for (const l of this.lights) l.intensity = this.headlights ? 120 : 0;
    // tyre tracks, dust and mud
    this.trackT += Math.abs(this.speed) * dt;
    if (this.trackT > 0.4) {
      this.trackT = 0;
      for (let i = 0; i < this.meta.wheels.length; i++) {
        if (!this.ctl.wheelIsInContact(i)) continue;
        const cp = this.ctl.wheelContactPoint(i);
        if (!cp) continue;
        marks.stamp(1, cp.x, cp.z, 0.16, 0.3, Math.atan2(fwd.x, fwd.z), 0.06);
        if (Math.abs(this.speed) > 6 && Math.random() < 0.3) puffs.emit(new THREE.Vector3(cp.x, cp.y + 0.2, cp.z), new THREE.Vector3(0, 0.5, 0), { size: 0.6, grow: 3, life: 2.2, color: new THREE.Color(0.55, 0.48, 0.38), alpha: 0.25 });
        if (Math.abs(this.speed) > 3 && Math.random() < 0.15) debris.emit('sawdust', new THREE.Vector3(cp.x, cp.y + 0.05, cp.z), fwd.clone().multiplyScalar(-1.5), 2, { color: new THREE.Color(0.5, 0.42, 0.33) });
      }
    }
  }

  /** suspension bump strength this frame (for creak sounds and camera shake) */
  bump(): number {
    let s = 0;
    for (let i = 0; i < this.meta.wheels.length; i++) s += Math.abs((this.ctl.wheelSuspensionForce(i) ?? 0) - 3500) / 3500;
    return s / Math.max(1, this.meta.wheels.length);
  }
}
