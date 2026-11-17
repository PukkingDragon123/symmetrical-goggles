// A single-axle utility trailer that hitches to the Jeep's rear with a ball joint. Logs and splits loaded into
// its box ride along physically (and fall out if you take the ruts too fast).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { applyPixelTex } from '../gfx/tex';
import { heightAt } from '../world/layout';
import { registerInteractable } from '../game/interact';
import type { Jeep } from './jeep';

interface TrailerMeta { size: [number, number, number]; mass: number; hitch: [number, number, number]; wheels: Record<string, { pos: [number, number, number]; radius: number }> }

export class Trailer {
  readonly root = new THREE.Group();
  body!: RAPIER.RigidBody;
  private ctl!: RAPIER.DynamicRayCastVehicleController;
  private meta!: TrailerMeta;
  private wheels: { o: THREE.Object3D; base: THREE.Quaternion; y: number }[] = [];
  private joint: RAPIER.ImpulseJoint | null = null;
  onToggle: (hitched: boolean) => void = () => {};

  async load(): Promise<void> {
    this.meta = await (await fetch('assets/models/trailer.json')).json();
    const g = await new GLTFLoader().loadAsync('assets/models/trailer.glb');
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) { const sm = mt as THREE.MeshStandardMaterial; if (sm.map) applyPixelTex(sm.map); }
    });
    this.root.add(g.scene);
    for (const [name, w] of Object.entries(this.meta.wheels)) {
      const o = g.scene.getObjectByName(name);
      if (o) this.wheels.push({ o, base: o.quaternion.clone(), y: w.pos[1] });
    }
  }

  spawn(x: number, z: number, heading: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, heightAt(x, z) + 0.6, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setAngularDamping(0.5).setCanSleep(false));
    const [W, H, L] = this.meta.size;
    // floor + low sides as separate boxes so cargo sits inside the box
    const col = (hx: number, hy: number, hz: number, x: number, y: number, z: number, m: number) =>
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setMass(m).setFriction(0.9)
        .setCollisionGroups(groups(GROUP.VEHICLE, 0xffff & ~GROUP.PLAYER)), this.body);
    const boxL = L * 0.62, floorY = 0.42;
    col(W / 2 * 0.95, 0.04, boxL / 2, 0, floorY, -0.3, this.meta.mass * 0.6);
    col(0.03, 0.18, boxL / 2, W / 2 * 0.95, floorY + 0.2, -0.3, this.meta.mass * 0.1);
    col(0.03, 0.18, boxL / 2, -W / 2 * 0.95, floorY + 0.2, -0.3, this.meta.mass * 0.1);
    col(W / 2 * 0.95, 0.18, 0.03, 0, floorY + 0.2, -0.3 - boxL / 2, this.meta.mass * 0.1);
    col(0.05, 0.05, 0.6, 0, 0.25, 0.9, this.meta.mass * 0.1);
    this.ctl = physics.world.createVehicleController(this.body);
    this.ctl.indexUpAxis = 1;
    this.ctl.setIndexForwardAxis = 2;
    let i = 0;
    for (const w of Object.values(this.meta.wheels)) {
      this.ctl.addWheel({ x: w.pos[0], y: w.pos[1] + 0.25, z: w.pos[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.25, w.radius);
      this.ctl.setWheelSuspensionStiffness(i, 30); this.ctl.setWheelFrictionSlip(i, 1.8); this.ctl.setWheelMaxSuspensionForce(i, 20000);
      i++;
    }
    physics.sync(this.body, this.root);
    registerInteractable(this.root, {
      kind: 'vehicle', reach: 3,
      label: () => (this.joint ? 'Unhitch the trailer' : 'Hitch the trailer'),
      use: (ctx) => { const j = ctx.game.jeep as Jeep | null; if (j) this.toggle(j); },
    });
  }

  get hitched(): boolean { return !!this.joint; }

  /** ball hitch behind the Jeep's rear bumper */
  toggle(jeep: Jeep): void {
    if (this.joint) { physics.world.removeImpulseJoint(this.joint, true); this.joint = null; this.onToggle(false); return; }
    const S = jeep.meta.size ?? [1.7, 1.6, 3.4];
    const ball = new THREE.Vector3(0, 0.45, -S[2] / 2 - 0.12);
    const ballW = ball.clone().applyQuaternion(jeep.root.quaternion).add(jeep.root.position);
    const hitch = new THREE.Vector3(...this.meta.hitch);
    if (ballW.distanceTo(hitch.clone().applyQuaternion(this.root.quaternion).add(this.root.position)) > 2.5) return;
    const jd = RAPIER.JointData.spherical({ x: ball.x, y: ball.y, z: ball.z }, { x: hitch.x, y: hitch.y, z: hitch.z });
    this.joint = physics.world.createImpulseJoint(jd, jeep.body, this.body, true);
    this.onToggle(true);
  }

  update(dt: number): void {
    if (!this.ctl) return;
    for (let i = 0; i < this.wheels.length; i++) this.ctl.setWheelBrake(i, this.joint ? 0 : 15);
    this.ctl.updateVehicle(dt, undefined, groups(0xffff, GROUP.GROUND | GROUP.STATIC));
    this.wheels.forEach((w, i) => {
      const rot = this.ctl.wheelRotation(i) ?? 0;
      w.o.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rot)).multiply(w.base);
    });
  }
}
