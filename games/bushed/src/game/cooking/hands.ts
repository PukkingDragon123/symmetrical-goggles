// Station hands: the player's own arms (the same Gacha Garage sleeves and articulated hands as the FP viewmodel,
// src/humans/fprig.ts), but living in the WORLD scene and posed by two-bone IK onto world-space palm-socket
// targets, so a close-up station (the stove top, the anvil) can put the hands exactly on a pan handle, a knife,
// a pair of tongs or a hammer. The rig hangs off the camera (the shoulders follow the eye) and every target is
// given in world space; springs give the hands weight and a little overshoot.
//
//   const hands = new StationHands();
//   camera.add(hands.object);
//   hands.set('R', { pos, q: StationHands.toolQ(handleDir, edgeDir), grip: GRIP.handle });
//   hands.rest('L');                                     // drop the left hand out of view
//   hands.update(dt, camera);
//   hands.socket('R').add(knife);                        // tools: grip at the origin, handle +Y, edge +Z
import * as THREE from 'three';
import { makeLook } from '../../humans/looks';
import { FPRig } from '../../humans/fprig';
import { setGrip } from '../../player/fp/grip';

/** finger channels: [curl, index, thumb, spread, cup] */
export const GRIP = {
  fist: [0.9, 0.9, 0.95, 0, 0],
  handle: [0.84, 0.82, 0.9, 0, 0],
  pinch: [0.55, 0.62, 0.7, 0.05, 0.1],
  relax: [0.32, 0.26, 0.3, 0.05, 0.12],
  open: [0.06, 0.05, 0.12, 0.45, 0.0],
  cup: [0.42, 0.38, 0.45, 0.1, 0.35],
  claw: [0.62, 0.55, 0.35, 0.12, 0.25],
  flat: [0.1, 0.08, 0.15, 0.15, 0.05],
} as const;

export interface HandTarget {
  /** world position of the palm socket */
  pos: THREE.Vector3;
  /** world orientation of the palm socket (+Y along the gripped handle, +Z the knuckles / edge) */
  q: THREE.Quaternion;
  grip: readonly number[];
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class StationHands {
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private bones: Record<string, THREE.Bone>;
  private sockets: { L: THREE.Object3D; R: THREE.Object3D };
  private rig = new THREE.Group();
  private fp: FPRig;
  private eye = new THREE.Vector3();
  private tgt: { L: HandTarget | null; R: HandTarget | null } = { L: null, R: null };
  private w = { L: 0, R: 0 };
  private sp = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  private sv = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  private sq = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
  private sgrip: { L: number[]; R: number[] } = { L: [...GRIP.relax], R: [...GRIP.relax] };
  private first = true;
  private time = 0;
  /** spring stiffness (rad/s): fast for strikes */
  stiff = { L: 26, R: 26 };
  /** 0..1 shiver tremor (cold hands) */
  shiver = 0;

  constructor() {
    this.fp = new FPRig(makeLook('player'));
    const d = this.fp.dims;
    this.bones = this.fp.bones;
    this.mesh = this.fp.mesh;
    this.eye.set(d.eye[0], d.eye[1], d.eye[2]);
    // the body stands a little behind the eye so elbows and forearms come into view naturally
    this.mesh.position.copy(this.eye).negate().add(new THREE.Vector3(0, 0, -0.04));
    this.rig.rotation.y = Math.PI;
    this.rig.add(this.mesh);
    this.object.add(this.rig);
    this.object.name = 'StationHands';
    this.sockets = { L: this.fp.socket('L'), R: this.fp.socket('R') };
    this.object.visible = false;
  }

  socket(side: 'L' | 'R'): THREE.Object3D { return this.sockets[side]; }

  /** put a hand on a world target (weight eases in) */
  set(side: 'L' | 'R', t: HandTarget): void {
    const cur = this.tgt[side];
    if (cur) { cur.pos.copy(t.pos); cur.q.copy(t.q); cur.grip = t.grip; }
    else this.tgt[side] = { pos: t.pos.clone(), q: t.q.clone(), grip: t.grip };
  }

  /** let a hand drop out of view */
  rest(side: 'L' | 'R'): void { this.tgt[side] = null; }

  /** snap the springs to the current targets (no swoop in from the rest pose) */
  snap(): void { this.first = true; }

  /** socket frame from a handle axis (+Y, toward the head / blade) and the edge / knuckle direction (+Z) */
  static toolQ(Y: THREE.Vector3, Z: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
    _y.copy(Y).normalize();
    _z.copy(Z).addScaledVector(_y, -Z.dot(_y)).normalize();
    _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    return out.setFromRotationMatrix(_m);
  }

  /** a free (open / flat / claw) hand: fingers point along f, palm faces n (world). Returns the socket orientation */
  freeQ(side: 'L' | 'R', f: THREE.Vector3, n: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
    const k = side === 'L' ? 1 : -1;
    _y.copy(f).normalize().negate();
    _x.copy(n).normalize().multiplyScalar(-k);
    _x.addScaledVector(_y, -_x.dot(_y)).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    out.setFromRotationMatrix(_m);
    return out.multiply(this.sockets[side].quaternion);
  }

  /** the rest pose of a hand in camera space (low, at the edge of view) as a world target */
  private restTarget(side: 'L' | 'R', cam: THREE.Camera, out: HandTarget): HandTarget {
    const s = side === 'L' ? -1 : 1;
    out.pos.set(0.3 * s, -0.55, -0.32).applyMatrix4(cam.matrixWorld);
    const f = _v1.set(-0.25 * s, -0.4, -0.88).transformDirection(cam.matrixWorld);
    const n = _v2.set(-0.85 * s, 0.35, 0).transformDirection(cam.matrixWorld);
    this.freeQ(side, f, n, out.q);
    out.grip = GRIP.relax;
    return out;
  }
  private meshInv = new THREE.Matrix4();
  private meshQi = new THREE.Quaternion();
  private want = new THREE.Vector3();
  private camInv = new THREE.Matrix4();
  private restT = { L: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), grip: GRIP.relax as readonly number[] }, R: { pos: new THREE.Vector3(), q: new THREE.Quaternion(), grip: GRIP.relax as readonly number[] } };

  update(dt: number, cam: THREE.Camera): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (!this.object.visible) { this.first = true; return; }
    this.object.updateMatrixWorld(true);
    const meshInv = this.meshInv.copy(this.mesh.matrixWorld).invert();
    const meshQi = this.mesh.getWorldQuaternion(this.meshQi).invert();
    for (const sd of ['L', 'R'] as const) {
      const tg = this.tgt[sd];
      this.w[sd] += ((tg ? 1 : 0) - this.w[sd]) * Math.min(1, dt * 7);
      const rest = this.restTarget(sd, cam, this.restT[sd]);
      // the target in mesh (body) space
      const P = _v1.copy(rest.pos), Q = _q1.copy(rest.q);
      let grip = rest.grip as readonly number[];
      if (tg) {
        P.lerp(tg.pos, this.w[sd]);
        Q.slerp(tg.q, this.w[sd]);
        grip = tg.grip;
      }
      P.applyMatrix4(meshInv);
      Q.premultiply(meshQi);
      if (this.shiver > 0.01) P.x += Math.sin(this.time * 47 + (sd === 'L' ? 0 : 2)) * 0.003 * this.shiver;
      if (this.first) { this.sp[sd].copy(P); this.sq[sd].copy(Q); this.sv[sd].set(0, 0, 0); this.sgrip[sd] = [...grip]; continue; }
      const om = this.stiff[sd], z = 0.8;
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const acc = _v2.copy(P).sub(this.sp[sd]).multiplyScalar(om * om).addScaledVector(this.sv[sd], -2 * z * om);
        this.sv[sd].addScaledVector(acc, h);
        this.sp[sd].addScaledVector(this.sv[sd], h);
      }
      this.sq[sd].slerp(Q, 1 - Math.exp(-dt * om * 0.75));
      const sg = this.sgrip[sd], kg = 1 - Math.exp(-dt * 16);
      for (let i = 0; i < sg.length; i++) sg[i] += (grip[i] - sg[i]) * kg;
    }
    this.first = false;
    // lean the body toward far work (the shoulders follow, the eye stays): beyond arm's reach, shift the rig
    const want = this.want.set(0, 0, 0);
    let wsum = 0;
    const camInv = this.camInv.copy(cam.matrixWorld).invert();
    for (const sd of ['L', 'R'] as const) {
      const tg = this.tgt[sd];
      if (!tg || this.w[sd] < 0.3) continue;
      const t = _v1.copy(tg.pos).applyMatrix4(camInv);
      const sh = _v2.set(sd === 'R' ? 0.2 : -0.2, -0.26, 0.14);
      const d = t.sub(sh), l = d.length(), reach = 0.56;
      if (l > reach) want.addScaledVector(d.normalize(), (l - reach) * this.w[sd]);
      wsum += this.w[sd];
    }
    if (wsum > 0) want.multiplyScalar(1 / Math.max(1, wsum));
    if (want.length() > 0.38) want.setLength(0.38);
    this.object.position.lerp(want, Math.min(1, dt * 4));
    const b = this.bones;
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head']) b[n].quaternion.identity();
    b.clavL.quaternion.identity(); b.clavR.quaternion.identity();
    this.mesh.updateMatrixWorld(true);
    for (const sd of ['L', 'R'] as const) {
      const sock = this.sockets[sd];
      const hq = _q1.copy(this.sq[sd]).multiply(_q2.copy(sock.quaternion).invert());
      const wrist = _v1.copy(this.sp[sd]).sub(_v2.copy(sock.position).applyQuaternion(hq));
      this.fp.armIK(sd, wrist, hq, 1);
      const g = this.sgrip[sd];
      setGrip(b, sd, g[0], g[1], g[2], g[3], g[4]);
    }
    this.mesh.updateMatrixWorld(true);
  }

  /** world position of a palm socket after the last update */
  palm(side: 'L' | 'R', out = new THREE.Vector3()): THREE.Vector3 { return this.sockets[side].getWorldPosition(out); }
}
