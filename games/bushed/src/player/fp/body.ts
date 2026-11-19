// Your own body in first person: the BUSHED player human (src/humans buildHuman('player'), the same lumberjack
// clothes as the viewmodel arms) walking under the camera, so looking down shows your shirt, belt, legs and boots.
// Ported from Gacha Garage's FPBody.js updateBody(): the head (and the arms while the viewmodel arms are on screen)
// are collapsed out of the colour pass but kept for shadow maps, so you also cast a whole shadow; the legs turn
// toward the direction of travel when you strafe or back up (the gait runs in reverse) while the chest keeps
// facing the view; looking down, the body slides back and the spine arches so you see belly, legs and feet rather
// than a wall of chest. BUSHED additions: the gait is locked to the player's footstep phase (the boots land when
// the footstep sounds play) and crouching lowers the hips with leg IK that keeps the boots planted.
import * as THREE from 'three';
import { buildHuman } from '../../humans/model';
import type { HumanModel } from '../../humans/model';
import type { HumanLook } from '../../humans/looks';
import { twoBone, framePos, frameRot, setFrameRot } from '../../humans/rig';

export interface BodyIn {
  /** feet position (world), view yaw / pitch (radians) */
  pos: THREE.Vector3; yaw: number; pitch: number;
  /** world velocity (m/s) */
  vel: THREE.Vector3;
  /** 0..1 smoothed */
  crouch: number;
  grounded: boolean;
  /** player footstep phase 0..1 and count (odd = right foot), or step < 0 to let the body walk on its own */
  step: number; steps: number;
  /** the world camera: the body only shows while the camera sits in its head */
  camera: THREE.Camera;
  /** viewmodel arms on screen: the body's own arms hide from the colour pass (shadows keep them) */
  armsShown: boolean;
  /** optional viewmodel arm bones to copy for the shadow (local quaternions by bone name) */
  armBones?: Record<string, THREE.Bone>;
}

const HEAD = ['neck', 'head', 'jaw', 'lids'];
const ARM = ['uarm', 'farm', 'ftw', 'hand', 'th1', 'th2', 'th3', 'ix1', 'ix2', 'ix3', 'md1', 'md2', 'md3', 'rg1', 'rg2', 'rg3', 'pk1', 'pk2', 'pk3'];
const COPY = ['clav', ...ARM];
const sm = (t: number) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

export class FPBody {
  readonly human: HumanModel;
  readonly root: THREE.Group;
  /** body scale so the eye sits at the player's standing eye height */
  readonly scale: number;
  private legYaw = 0;
  private hideHead: number[];
  private hideArms: number[];
  private armsHidden = true;
  private eyeZ: number;
  private feet = [new THREE.Vector3(), new THREE.Vector3()];
  private footQ = [new THREE.Quaternion(), new THREE.Quaternion()];
  shown = false;

  constructor(look: HumanLook | 'player' = 'player', eyeHeight = 1.66) {
    const h = this.human = buildHuman(look);
    this.root = new THREE.Group();
    this.root.name = 'fp-body';
    this.root.add(h.root);
    const d = h.dims;
    const eyeY = d.rest.head[1] + 0.1 * d.hs + (h.mesh.position.y);
    this.scale = THREE.MathUtils.clamp(eyeHeight / eyeY, 0.85, 1.2);
    h.root.scale.setScalar(this.scale);
    this.eyeZ = (d.rest.head[2] + 0.085 * d.hs) * this.scale;
    // no blinking or glancing: nobody sees this face
    h.anim.lookAt(null);
    const sk = h.mesh.skeleton;
    const idx = (n: string) => sk.bones.findIndex((b) => b.name === n);
    this.hideHead = HEAD.map(idx).filter((i) => i >= 0);
    this.hideArms = ['L', 'R'].flatMap((s) => ARM.map((n) => idx(n + s))).filter((i) => i >= 0);
    // colour pass: collapse hidden bones onto their joints (a weighted vertex slides toward the joint instead of
    // shooting to the origin); shadow pass: the whole body
    h.mesh.onBeforeRender = () => {
      sk.update();
      const m = sk.boneMatrices!;
      const hide = this.armsHidden ? this.hideHead.concat(this.hideArms) : this.hideHead;
      for (const i of hide) {
        const e = sk.bones[i].matrixWorld.elements;
        m.fill(0, i * 16, i * 16 + 12);
        m[i * 16 + 12] = e[12]; m[i * 16 + 13] = e[13]; m[i * 16 + 14] = e[14]; m[i * 16 + 15] = 1;
      }
      if (sk.boneTexture) sk.boneTexture.needsUpdate = true;
    };
    h.mesh.onBeforeShadow = () => { sk.update(); };
    this.root.visible = false;
  }

  update(dt: number, s: BodyIn) {
    const h = this.human, b = h.bones, bs = this.scale;
    // only while the camera is in our head (not in the menu, the truck or a cutscene camera)
    const eyeW = _v.set(s.pos.x, s.pos.y + 1.0 * bs, s.pos.z);
    const camP = _v2.setFromMatrixPosition(s.camera.matrixWorld);
    const near = Math.hypot(camP.x - eyeW.x, camP.z - eyeW.z) < 0.5 && camP.y > s.pos.y + 0.6 && camP.y < s.pos.y + 2.3;
    this.shown = this.root.visible = near;
    if (!near) return;
    this.armsHidden = s.armsShown;
    const v = s.vel, spd = Math.hypot(v.x, v.z);
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    const fwd = -(v.x * sy + v.z * cy), side = v.x * cy - v.z * sy;
    const back = spd > 0.3 && fwd < -0.25 * spd;
    // legs turn toward the travel direction (strafing), at most ~60 degrees; backing up runs the gait in reverse
    const off = spd > 0.3 ? THREE.MathUtils.clamp((back ? 1 : -1) * Math.atan2(side, Math.abs(fwd)), -1.05, 1.05) : 0;
    this.legYaw += (off - this.legYaw) * (1 - Math.exp(-dt * 7));
    // the eyes sit just behind the face; looking down, slide the body back so the belly and boots show
    const down = Math.max(0, -s.pitch);
    const zb = this.eyeZ - 0.012 + sm(down / 1.3) * 0.1 + s.crouch * 0.06;
    h.root.position.set(0, 0, 0);
    this.root.position.set(s.pos.x + sy * zb, s.pos.y, s.pos.z + cy * zb);
    this.root.rotation.set(0, s.yaw + Math.PI + this.legYaw, 0);
    // gait: the player's footstep phase drives the walk clip so the boots land on the footstep sounds
    const anim = h.anim;
    const walking = spd > 0.35 && s.grounded;
    anim.play(walking ? 'walk' : 'idle', { fade: 0.25 });
    anim.walkSpeed = Math.max(0.4, spd / bs);
    if (walking && s.step >= 0) {
      // walk clip footfalls: left at phase 1.35 (mod 2 pi), right half a cycle later; odd step counts are right feet
      let ph = 1.35 + Math.PI * (s.steps + s.step);
      if (back) ph = -ph + 2.7;
      (anim as unknown as { phase: number }).phase = ph;
      anim.speed = 1e-6;                                    // the phase is ours; don't let update() advance it
      anim.update(dt);
      anim.speed = 1;
      (anim as unknown as { time: number }).time += dt;
    } else anim.update(dt);
    // upper body keeps facing the view; arches back when you look down
    const arch = sm(down / 1.2);
    b.spine.quaternion.premultiply(_q.setFromAxisAngle(Y, -this.legYaw * 0.45)).multiply(_q.setFromAxisAngle(X, -arch * 0.3 + s.crouch * 0.28));
    b.chest.quaternion.premultiply(_q.setFromAxisAngle(Y, -this.legYaw * 0.55)).multiply(_q.setFromAxisAngle(X, -arch * 0.22 + s.crouch * 0.12));
    b.neck.quaternion.setFromEuler(_e.set(-s.pitch * 0.3, 0, 0));
    b.head.quaternion.setFromEuler(_e.set(-s.pitch * 0.6, 0, 0));
    // crouch: drop the hips and re-solve the legs so the boots stay where the gait put them
    if (s.crouch > 0.01) this.crouchLegs(s.crouch);
    // the shadow holds what the viewmodel arms hold
    if (s.armsShown && s.armBones) for (const sd of ['L', 'R']) for (const n of COPY) {
      const src = s.armBones[n + sd], dst = b[n + sd];
      if (src && dst) dst.quaternion.copy(src.quaternion);
    }
    this.root.updateMatrixWorld(true);
  }

  private crouchLegs(c: number) {
    const h = this.human, b = h.bones, d = h.dims, mesh = h.mesh;
    mesh.updateMatrixWorld(true);
    for (const [i, sd] of [[0, 'L'], [1, 'R']] as const) {
      framePos(b['foot' + sd], mesh, this.feet[i]);
      frameRot(b['foot' + sd], mesh, this.footQ[i]);
    }
    b.hips.position.y -= c * 0.42 * d.s;
    b.hips.position.z -= c * 0.06 * d.s;
    b.hips.quaternion.premultiply(_q.setFromAxisAngle(X, c * 0.25));
    mesh.updateMatrixWorld(true);
    const qU = new THREE.Quaternion(), qL = new THREE.Quaternion();
    for (const [i, sd] of [[0, 'L'], [1, 'R']] as const) {
      const thigh = b['thigh' + sd], shin = b['shin' + sd], foot = b['foot' + sd];
      const base = framePos(thigh, mesh, new THREE.Vector3());
      // knees forward and a little out
      const pole = new THREE.Vector3(sd === 'L' ? 0.25 : -0.25, 0, 1);
      twoBone(base, this.feet[i], pole, d.L.thigh, d.L.shin, qU, qL, undefined, true);
      setFrameRot(thigh, frameRot(b.hips, mesh, _q2), qU);
      const tq = frameRot(thigh, mesh, new THREE.Quaternion());
      setFrameRot(shin, tq, qL);
      setFrameRot(foot, frameRot(shin, mesh, new THREE.Quaternion()), this.footQ[i]);
    }
  }

  dispose() { this.root.removeFromParent(); }
}
