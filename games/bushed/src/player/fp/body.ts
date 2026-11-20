// Your own body in first person: the player's Gacha Garage human (src/humans, the same lumberjack clothes as the
// viewmodel arms) walking under the camera, so looking down shows your shirt, suspenders, legs and boots.
// Ported from Gacha Garage's FPBody.js updateBody(): the head (and the arms while the viewmodel arms are on screen)
// are collapsed out of the colour pass but kept for shadow maps, so you also cast a whole shadow; the legs turn toward
// the direction of travel when you strafe or back up (the gait runs in reverse) while the chest keeps facing the
// view; looking down, the body slides back and the spine arches so you see belly, legs and feet rather than a wall of
// chest. BUSHED additions: the gait is locked to the player's footstep phase (the boots land when the footstep sounds
// play) and crouching drops the hips while GG's leg IK keeps the boots planted.
import * as THREE from 'three';
import { Human } from '../../humans/gg/Human';
import { BONE_INDEX } from '../../humans/gg/body';
import { makeLook } from '../../humans/looks';
import type { HumanLook } from '../../humans/looks';
import { lookToSpec } from '../../humans/spec';
import { wetMaterial } from '../../humans/model';

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
  /** optional viewmodel arm bones (src/humans/fprig.ts names) to copy for the shadow */
  armBones?: Record<string, THREE.Bone>;
}

const HEAD = ['neck', 'head', 'tailL', 'tailR', 'prop', 'tool'].map((b) => BONE_INDEX[b]);
const ARM = ['armL', 'foreL', 'handL', 'armR', 'foreR', 'handR'].map((b) => BONE_INDEX[b]);
const sm = (t: number) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const wrap = (a: number) => a - Math.round(a);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

export class FPBody {
  readonly human: Human;
  readonly root: THREE.Group;
  /** body scale so the eye sits at the player's standing eye height */
  readonly scale: number;
  private legYaw = 0;
  private armsHidden = true;
  private eyeZ: number;
  shown = false;

  constructor(look: HumanLook | 'player' = 'player', eyeHeight = 1.66) {
    const L = typeof look === 'string' ? makeLook(look) : look;
    const h = this.human = new Human(lookToSpec(L), { lazy: false });
    wetMaterial(h.mat);
    // no idle fidgets, glances or face repaints: we only ever see this body from the inside
    h.faceOn = false; h.fidgetT = Infinity; h.glanceT = Infinity;
    h.mesh.frustumCulled = false;
    this.root = new THREE.Group();
    this.root.name = 'fp-body';
    this.root.add(h.root);
    this.scale = THREE.MathUtils.clamp(eyeHeight / h.P.eyeY, 0.85, 1.2);
    h.root.scale.setScalar(this.scale);
    this.eyeZ = h.P.zf * this.scale;
    // colour pass: collapse hidden bones onto their joints (vertices slide to the joint instead of the origin);
    // shadow pass: the whole body
    const sk = h.mesh.skeleton;
    h.mesh.onBeforeRender = () => {
      sk.update();
      const m = sk.boneMatrices!;
      const hide = (i: number) => {
        const e = sk.bones[i].matrixWorld.elements;
        m.fill(0, i * 16, i * 16 + 12);
        m[i * 16 + 12] = e[12]; m[i * 16 + 13] = e[13]; m[i * 16 + 14] = e[14]; m[i * 16 + 15] = 1;
      };
      for (const i of HEAD) hide(i);
      if (this.armsHidden) for (const i of ARM) hide(i);
      if (sk.boneTexture) sk.boneTexture.needsUpdate = true;
    };
    h.mesh.onBeforeShadow = () => { sk.update(); };
    this.root.visible = false;
  }

  update(dt: number, s: BodyIn) {
    const h = this.human, b = h.b, bs = this.scale;
    // only while the camera is in our head (not in the menu, the truck or a cutscene camera)
    const eyeW = _v.set(s.pos.x, s.pos.y + 1.0 * bs, s.pos.z);
    s.camera.updateMatrixWorld();
    const camP = _v2.setFromMatrixPosition(s.camera.matrixWorld);
    const near = Math.hypot(camP.x - eyeW.x, camP.z - eyeW.z) < 0.5 && camP.y > s.pos.y + 0.6 && camP.y < s.pos.y + 2.3;
    this.shown = this.root.visible = near;
    if (!near) return;
    this.armsHidden = s.armsShown;
    const v = s.vel, spd = Math.hypot(v.x, v.z);
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    const fwd = -(v.x * sy + v.z * cy), side = v.x * cy - v.z * sy;
    const back = spd > 0.3 && fwd < -0.25 * spd;
    // legs turn toward the travel direction (strafing), at most ~60 degrees
    const off = spd > 0.3 ? THREE.MathUtils.clamp((back ? 1 : -1) * Math.atan2(side, Math.abs(fwd)), -1.05, 1.05) : 0;
    this.legYaw += (off - this.legYaw) * (1 - Math.exp(-dt * 7));
    // the eyes sit just behind the face; looking down, slide the body back so the belly and boots show
    const down = Math.max(0, -s.pitch);
    const zb = this.eyeZ - 0.012 + sm(down / 1.25) * 0.16 + s.crouch * 0.06;
    h.root.position.set(s.pos.x + sy * zb, s.pos.y, s.pos.z + cy * zb);
    h.root.rotation.set(0, s.yaw + Math.PI + this.legYaw, 0);
    // gait: nudge GG's phase toward the player's footsteps (left heel at 0, right at 0.5; odd step counts are right)
    const walking = spd > 0.35 && s.grounded;
    if (walking && s.step >= 0) {
      let want = ((s.steps + s.step) * 0.5) % 1;
      if (back) want = 1 - want;
      h.phase = ((h.phase + wrap(want - h.phase) * Math.min(1, dt * 8)) % 1 + 1) % 1;
    }
    const ph = h.phase;
    h.update(dt, { speed: walking ? spd / bs : 0, crouch: s.crouch });
    if (back) h.phase = (((2 * ph - h.phase) % 1) + 1) % 1; // walking backwards: run the gait in reverse
    // the upper body keeps facing the view, and arches back when you look down
    const arch = sm(down / 1.2);
    b.spine.quaternion.premultiply(_q.setFromAxisAngle(Y, -this.legYaw * 0.45)).multiply(_q.setFromAxisAngle(X, -arch * 0.3 + s.crouch * 0.1));
    b.chest.quaternion.premultiply(_q.setFromAxisAngle(Y, -this.legYaw * 0.55)).multiply(_q.setFromAxisAngle(X, -arch * 0.22));
    b.neck.quaternion.setFromEuler(_e.set(-s.pitch * 0.3, 0, 0));
    b.head.quaternion.setFromEuler(_e.set(-s.pitch * 0.6, 0, 0));
    // the shadow holds what the viewmodel arms hold (the FP rig's clavicle + upper arm -> arm, forearm + twist -> fore)
    const A = s.armBones;
    if (s.armsShown && A) for (const sd of ['L', 'R']) {
      b['arm' + sd].quaternion.copy(A['clav' + sd].quaternion).multiply(A['uarm' + sd].quaternion);
      b['fore' + sd].quaternion.copy(A['farm' + sd].quaternion).multiply(A['ftw' + sd].quaternion);
      b['hand' + sd].quaternion.copy(A['hand' + sd].quaternion);
    }
    this.root.updateMatrixWorld(true);
  }

  dispose() { this.root.removeFromParent(); this.human.dispose(); }
}
