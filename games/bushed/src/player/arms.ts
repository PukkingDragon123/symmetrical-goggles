// First-person arms (the viewmodel): the player's own arms, sleeves, cuffs and gloved hands, built from the same
// lofted body and painted page as the third-person human (src/humans), posed every frame by two-bone IK onto
// hand targets authored in view space, with articulated fingers wrapping whatever the palm sockets hold.
//
// Layering, bottom to top: the held pose (axe ready, carry, bottle, flashlight...) -> the swing charge wind-up ->
// a playing action (swing, split, drink, offer, grab, drop, push, chop_recover) -> procedural motion (idle sway
// and breathing, walk / run bob, camera-turn lag, crouch, shiver tremor, carrying strain) -> springs on the final
// hand targets (weight and overshoot) -> IK -> finger grips.
//
//   const arms = new FPArms();                     // the player's look by default
//   viewCamera.add(arms.object);                   // viewmodel scene camera, fov ~60, looking down -Z
//   arms.setHeld('axe', axeMesh);                  // tools: grip at the origin, handle +Y (head end), edge +Z
//   arms.onEvent((ev, d) => { if (ev === 'impact') chop.hit(d); });
//   on release: arms.play('swing', { power: charge });
//   each frame: arms.update(dt, { speed, sprint, crouch, breath, shiver, aimPitch, swingCharge });
//
// Socket frames (socket('L' | 'R')): origin in the hollow of the fist, +Y along a gripped handle out of the thumb
// side (the axe head / bottle neck / torch beam), +Z the way the knuckles face (the axe's edge).
import * as THREE from 'three';
import { makeLook } from '../humans/looks';
import type { HumanLook } from '../humans/looks';
import { armsGeometry, makeSocket } from '../humans/model';
import { makeSkeleton } from '../humans/rig';
import type { Dims } from '../humans/rig';
import { HumanAnimator, setGrip } from '../humans/anim';

export type HeldKind = 'none' | 'axe' | 'hatchet' | 'maul' | 'saw' | 'bottle' | 'jerky' | 'flashlight' | 'item' | 'log' | 'two_hand' | 'drag';
export type ArmsAction = 'swing' | 'miss' | 'chop_recover' | 'drink' | 'offer' | 'grab' | 'drop' | 'split' | 'push';
export interface ArmsInput {
  /** horizontal speed (m/s) */
  speed: number; sprint: boolean; crouch: boolean;
  /** 0 calm .. 1 out of breath */
  breath: number;
  /** 0 warm .. 1 freezing */
  shiver: number;
  /** view pitch (radians, + up) */
  aimPitch: number;
  /** 0..1 while the swing button is held */
  swingCharge: number;
  /** optional camera yaw rate (rad/s) for turn lag */
  turnRate?: number;
}
export type ArmsEvent = 'impact' | 'swing_start' | 'stuck_free' | 'drink_start' | 'sip' | 'drink_end' | 'offer_out' | 'offer_end' | 'grab' | 'drop' | 'push' | 'split_start' | 'action_end';
type Listener = (ev: ArmsEvent, data?: { action?: ArmsAction; power?: number; hand?: 'L' | 'R' }) => void;

// ------------------------------------------------------------------ small math helpers (view space = x right, y up, z forward)
const V = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z);     // view -> body axes (body +x is the left)
/** hand positions are authored a little low; viewmodels sit higher in frame than strict anatomy */
const LIFT = 0.12;
const sm = (t: number) => t * t * (3 - 2 * t);
const cl = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** hand frame from the finger direction and the palm normal (body space) */
function handQ(side: 'L' | 'R', f: THREE.Vector3, n: THREE.Vector3, out = new THREE.Quaternion()) {
  const k = side === 'L' ? 1 : -1;
  _y.copy(f).normalize().negate();
  _x.copy(n).multiplyScalar(-k);
  _x.addScaledVector(_y, -_x.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
/** tool frame from its handle axis (+Y, toward the head) and edge direction (+Z) */
function toolQ(Y: THREE.Vector3, Z: THREE.Vector3, out = new THREE.Quaternion()) {
  _y.copy(Y).normalize();
  _z.copy(Z).addScaledVector(_y, -Z.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** one hand's target: wrist-independent palm socket pose (body space), grip channels, IK weight */
interface HandT { p: THREE.Vector3; q: THREE.Quaternion; grip: number[] }
interface ArmsPose { L: HandT; R: HandT; clavL: number; clavR: number; vis: number }
const newHand = (): HandT => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), grip: [0.3, 0.3, 0.3, 0, 0.1] });
const newPose = (): ArmsPose => ({ L: newHand(), R: newHand(), clavL: 0, clavR: 0, vis: 1 });
function copyPose(a: ArmsPose, b: ArmsPose) {
  for (const s of ['L', 'R'] as const) { a[s].p.copy(b[s].p); a[s].q.copy(b[s].q); a[s].grip = b[s].grip.slice(); }
  a.clavL = b.clavL; a.clavR = b.clavR; a.vis = b.vis;
}
function mixPose(out: ArmsPose, a: ArmsPose, b: ArmsPose, t: number) {
  for (const s of ['L', 'R'] as const) {
    out[s].p.lerpVectors(a[s].p, b[s].p, t);
    out[s].q.slerpQuaternions(a[s].q, b[s].q, t);
    out[s].grip = a[s].grip.map((v, i) => lerp(v, b[s].grip[i], t));
  }
  out.clavL = lerp(a.clavL, b.clavL, t); out.clavR = lerp(a.clavR, b.clavR, t); out.vis = lerp(a.vis, b.vis, t);
}

// grips: [curl, index, thumb, spread, cup]
const G_FIST = [0.9, 0.9, 0.95, 0, 0];
const G_HANDLE = [0.84, 0.82, 0.9, 0, 0];
const G_RELAX = [0.32, 0.26, 0.3, 0.05, 0.12];
const G_OPEN = [0.06, 0.05, 0.12, 0.45, 0.0];
const G_CUP = [0.42, 0.38, 0.45, 0.1, 0.35];
const G_BOTTLE = [0.7, 0.66, 0.72, 0, 0];
const G_PALM_UP = [0.12, 0.1, 0.2, 0.2, 0.3];

interface ActionDef { dur: number; events: [number, ArmsEvent][]; fadeIn: number; fadeOut: number }
const ACTIONS: Record<ArmsAction, ActionDef> = {
  swing: { dur: 0.62, events: [[0.0, 'swing_start'], [0.13, 'impact'], [0.62, 'action_end']], fadeIn: 0.02, fadeOut: 0.22 },
  miss: { dur: 0.75, events: [[0.75, 'action_end']], fadeIn: 0.01, fadeOut: 0.25 },
  chop_recover: { dur: 0.75, events: [[0.48, 'stuck_free'], [0.75, 'action_end']], fadeIn: 0.05, fadeOut: 0.2 },
  split: { dur: 1.05, events: [[0.0, 'split_start'], [0.62, 'impact'], [1.05, 'action_end']], fadeIn: 0.08, fadeOut: 0.25 },
  drink: { dur: 2.6, events: [[0.0, 'drink_start'], [0.85, 'sip'], [1.35, 'sip'], [1.85, 'sip'], [2.6, 'drink_end']], fadeIn: 0.15, fadeOut: 0.3 },
  offer: { dur: 2.2, events: [[0.55, 'offer_out'], [2.2, 'offer_end']], fadeIn: 0.12, fadeOut: 0.35 },
  grab: { dur: 0.7, events: [[0.38, 'grab'], [0.7, 'action_end']], fadeIn: 0.06, fadeOut: 0.22 },
  drop: { dur: 0.65, events: [[0.3, 'drop'], [0.65, 'action_end']], fadeIn: 0.06, fadeOut: 0.22 },
  push: { dur: 0.8, events: [[0.3, 'push'], [0.8, 'action_end']], fadeIn: 0.08, fadeOut: 0.25 },
};

export class FPArms {
  /** add to the viewmodel camera (local space: camera at the origin looking down -Z) */
  readonly object = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: Record<string, THREE.Bone>;
  readonly dims: Dims;
  readonly look: HumanLook;
  held: HeldKind = 'none';
  heldObj: THREE.Object3D | null = null;
  /** the action playing (null when idle) */
  action: ArmsAction | null = null;
  actionT = 0;
  private actionOpts: { power?: number; charge?: number } = {};
  private listeners: Listener[] = [];
  private sockets: { L: THREE.Object3D; R: THREE.Object3D };
  private carry = new THREE.Object3D();
  private rig = new THREE.Group();
  private ik: HumanAnimator;
  private eye = new THREE.Vector3();
  private time = 0; private walkPh = 0; private walkAmt = 0; private crouchK = 0;
  private charge = 0; private shiverK = 0; private strain = 0; private lastPitch = 0; private pitchLag = 0; private yawLag = 0;
  private heldPose = newPose(); private actPose = newPose(); private outPose = newPose(); private prevHeld = newPose();
  private heldBlend = 1; private actW = 0;
  private sp = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  private sv = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  private sq = { L: new THREE.Quaternion(), R: new THREE.Quaternion() };
  private sgrip = { L: G_RELAX.slice(), R: G_RELAX.slice() };
  private first = true;
  private impactAt = new THREE.Vector3();
  private strainBob = 0;

  constructor(look: HumanLook = makeLook('player')) {
    this.look = look;
    const { geometry, parts } = armsGeometry(look);
    this.dims = parts.dims;
    const { bones, byName, skeleton } = makeSkeleton(this.dims);
    this.bones = byName;
    this.mesh = new THREE.SkinnedMesh(geometry, parts.mat);
    this.mesh.add(bones[0]);
    this.mesh.bind(skeleton);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    // the eye: between the eyes, in body space
    const d = this.dims;
    this.eye.set(0, d.rest.head[1] + 0.1 * d.hs, d.rest.head[2] + 0.085 * d.hs);
    this.mesh.position.copy(this.eye).negate();
    this.rig.rotation.y = Math.PI;        // body +z (forward) -> camera -z
    this.rig.add(this.mesh);
    this.object.add(this.rig);
    this.object.name = 'FPArms';
    this.sockets = { L: makeSocket(byName.handL, 'L', d), R: makeSocket(byName.handR, 'R', d) };
    this.mesh.add(this.carry);
    this.ik = new HumanAnimator(byName, d, this.mesh, look.seed);
    this.buildHeldPose(this.heldPose);
    copyPose(this.outPose, this.heldPose);
  }

  socket(hand: 'L' | 'R'): THREE.Object3D { return this.sockets[hand]; }
  onEvent(cb: Listener) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((l) => l !== cb); }; }
  private emit(ev: ArmsEvent, data?: Parameters<Listener>[1]) { for (const l of this.listeners) l(ev, data); }

  /** what the hands hold; obj (optional) is parented to the right socket (left for the flashlight, between the hands for logs) */
  setHeld(kind: HeldKind, obj?: THREE.Object3D) {
    if (this.heldObj && this.heldObj.parent) this.heldObj.removeFromParent();
    copyPose(this.prevHeld, this.outPose);
    this.heldBlend = 0;
    this.held = kind;
    this.heldObj = obj ?? null;
    if (obj) {
      if (kind === 'flashlight') this.sockets.L.add(obj);
      else if (kind === 'log' || kind === 'two_hand') this.carry.add(obj);
      else this.sockets.R.add(obj);
    }
  }

  /** start an action (power / charge 0..1 for swings; 'miss' continues a swing that hit nothing into an overswing) */
  play(action: ArmsAction, opts: { power?: number; charge?: number } = {}) {
    if (!(action in ACTIONS)) return;
    this.action = action; this.actionT = 0; this.actionOpts = { ...opts };
    if (this.actionOpts.power === undefined) this.actionOpts.power = opts.charge ?? (action === 'swing' ? Math.max(0.3, this.charge) : 1);
    this.fireEvents(-1, 0);
  }
  get busy() { return this.action !== null; }

  private fireEvents(t0: number, t1: number) {
    if (!this.action) return;
    for (const [et, ev] of ACTIONS[this.action].events) if (et > t0 && et <= t1) this.emit(ev, { action: this.action, power: this.actionOpts.power });
  }

  // ------------------------------------------------------------------ held poses
  private tool(p: ArmsPose, pos: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3, lOff: number | null, gR = G_HANDLE, gL = G_HANDLE) {
    // the right socket at pos on the tool frame; the left socket lOff metres along the handle (null: left hand free)
    const q = toolQ(Y, Z);
    p.R.p.copy(pos); p.R.q.copy(q); p.R.grip = gR.slice();
    if (lOff !== null) { p.L.p.copy(pos).addScaledVector(_y.set(0, 1, 0).applyQuaternion(q), lOff); p.L.q.copy(q); p.L.grip = gL.slice(); }
  }
  private free(p: ArmsPose, side: 'L' | 'R', pos: THREE.Vector3, f: THREE.Vector3, n: THREE.Vector3, grip: number[]) {
    const h = p[side];
    h.p.copy(pos);
    // free hands are authored as palm socket frames too: from the hand frame (fingers f, palm n) to its socket
    const hq = handQ(side, f, n);
    h.q.copy(hq).multiply(this.sockets[side].quaternion);
    h.grip = grip.slice();
  }
  /** the pose for the current held kind (body space, around the eye) */
  private buildHeldPose(p: ArmsPose) {
    const e = this.eye;
    const at = (x: number, y: number, z: number) => V(x, y + LIFT, z).add(e);
    p.clavL = 0; p.clavR = 0; p.vis = 1;
    // a resting left hand low on the left (mostly out of view)
    const restL = () => this.free(p, 'L', at(-0.27, -0.42, 0.4), V(0.2, -0.5, 0.84), V(0.85, 0.3, 0.0), G_RELAX);
    const restR = () => this.free(p, 'R', at(0.27, -0.42, 0.4), V(-0.2, -0.5, 0.84), V(-0.85, 0.3, 0.0), G_RELAX);
    switch (this.held) {
      case 'axe': case 'maul':
        // across the body, head up and right, both hands on the handle, the edge facing the work
        this.tool(p, at(0.24, -0.2, 0.52), V(0.74, 0.5, 0.3), V(-0.5, 0.3, 0.8), this.held === 'maul' ? -0.2 : -0.24);
        break;
      case 'hatchet':
        this.tool(p, at(0.2, -0.28, 0.4), V(0.12, 0.85, 0.5), V(-0.5, -0.3, 0.8), null);
        restL();
        break;
      case 'saw':
        // a bow saw held out front, the blade level
        this.tool(p, at(0.16, -0.3, 0.45), V(-0.15, 0.2, 0.97), V(0, -1, 0.1), null, G_HANDLE);
        this.free(p, 'L', at(-0.08, -0.22, 0.62), V(0.5, -0.4, 0.75), V(0.9, 0.1, -0.2), G_HANDLE);
        break;
      case 'bottle':
        this.tool(p, at(0.2, -0.3, 0.42), V(-0.05, 0.98, -0.08), V(-0.8, 0, 0.6), null, G_BOTTLE);
        restL();
        break;
      case 'jerky': case 'item':
        // a small thing held loosely in the right hand
        this.tool(p, at(0.19, -0.27, 0.42), V(-0.45, 0.6, 0.55), V(-0.6, -0.6, 0.4), null, G_CUP);
        restL();
        break;
      case 'flashlight':
        // the torch in the left hand, beam forward; the right hand free and relaxed
        p.L.p.copy(at(-0.22, -0.3, 0.56)); p.L.q.copy(toolQ(V(0.06, 0.08, 1), V(0.4, 0.9, 0.1))); p.L.grip = G_HANDLE.slice();
        restR();
        break;
      case 'two_hand':
        // a heavy round hugged at the chest: hands under it, palms up, elbows in; shoulders braced
        this.free(p, 'L', at(-0.25, -0.45, 0.62), V(0.25, 0.35, 0.9), V(0.95, 0.2, 0.0), G_CUP);
        this.free(p, 'R', at(0.25, -0.45, 0.62), V(-0.25, 0.35, 0.9), V(-0.95, 0.2, 0.0), G_CUP);
        p.clavL = 0.14; p.clavR = 0.14;
        break;
      case 'log':
        // dragging a log by its near end: both fists low in front on the bark, leaning into it
        this.tool(p, at(0.1, -0.38, 0.54), V(-0.97, 0.08, 0.2), V(0.1, 0.4, 0.9), -0.17, G_FIST, G_FIST);
        p.clavL = 0.1; p.clavR = 0.1;
        break;
      case 'drag':
        // the right arm back and low, gripping a rope / branch behind; the left arm swings free
        this.tool(p, at(0.3, -0.62, -0.02), V(0.1, 0.3, 0.95), V(-0.9, 0.1, 0.1), null, G_FIST);
        this.free(p, 'L', at(-0.24, -0.32, 0.44), V(0.25, -0.45, 0.85), V(0.85, 0.3, 0.0), G_RELAX);
        p.clavR = -0.1;
        break;
      default:
        // empty hands: both low and relaxed at the edges of the view
        this.free(p, 'L', at(-0.25, -0.36, 0.44), V(0.3, -0.35, 0.88), V(0.85, 0.35, 0.1), G_RELAX);
        this.free(p, 'R', at(0.25, -0.36, 0.44), V(-0.3, -0.35, 0.88), V(-0.85, 0.35, 0.1), G_RELAX);
        break;
    }
    if (this.held === 'axe' || this.held === 'maul' || this.held === 'hatchet') {
      // the wind-up: the head swings back over the right shoulder as the charge builds
      const c = sm(cl(this.charge));
      if (c > 0.001) {
        const wind = newPose();
        if (this.held === 'hatchet') this.tool(wind, at(0.3, -0.06, 0.22), V(0.3, 0.55, -0.78), V(-0.9, 0.1, -0.1), null);
        else this.tool(wind, at(0.3, -0.1, 0.36), V(0.5, 0.62, -0.6), V(-0.8, 0.45, 0.2), this.held === 'maul' ? -0.2 : -0.24);
        if (this.held === 'hatchet') { wind.L.p.copy(p.L.p); wind.L.q.copy(p.L.q); wind.L.grip = p.L.grip.slice(); }
        wind.clavR = 0.18; wind.clavL = 0.1;
        mixPose(p, p, wind, c);
      }
    }
  }

  // ------------------------------------------------------------------ actions
  private actionPose(p: ArmsPose, base: ArmsPose, a: ArmsAction, t: number) {
    const e = this.eye;
    const at = (x: number, y: number, z: number) => V(x, y + LIFT, z).add(e);
    copyPose(p, base);
    const two = this.held === 'axe' || this.held === 'maul';
    const lOff = this.held === 'maul' ? -0.2 : two ? -0.24 : null;
    switch (a) {
      case 'swing': {
        if (this.held === 'saw') {
          // one push-pull stroke
          const k = Math.sin(cl(t / 0.62) * Math.PI * 2);
          p.R.p.add(V(0, 0, 0.14 * k)); p.L.p.add(V(0, 0, 0.14 * k));
          break;
        }
        // from the wind-up a fast arc to the strike, bite, rebound and settle; slower and lower for a weak swing
        const pow = 0.5 + 0.5 * (this.actionOpts.power ?? 1);
        const wind = newPose(), hit = newPose(), follow = newPose();
        if (this.held === 'hatchet' || !two) {
          this.tool(wind, at(0.3, -0.06, 0.22), V(0.3, 0.55, -0.78), V(-0.9, 0.1, -0.1), null);
          this.tool(hit, at(0.04, -0.2, 0.5), V(-0.55, 0.15, 0.82), V(-0.75, -0.35, -0.55), null);
          this.tool(follow, at(-0.04, -0.3, 0.44), V(-0.7, -0.05, 0.7), V(-0.5, -0.6, -0.55), null);
          for (const q of [wind, hit, follow]) { q.L.p.copy(base.L.p); q.L.q.copy(base.L.q); q.L.grip = base.L.grip.slice(); }
        } else {
          this.tool(wind, at(0.3, -0.1, 0.36), V(0.5, 0.62, -0.6), V(-0.8, 0.45, 0.2), lOff);
          // the strike: the head level with the eye line, biting into the trunk ahead and a little left
          this.tool(hit, at(0.02, -0.26, 0.54), V(-0.52, 0.12, 0.85), V(-0.82, -0.12, -0.55), lOff === null ? null : lOff * 0.6);
          this.tool(follow, at(-0.03, -0.31, 0.5), V(-0.6, 0.04, 0.8), V(-0.78, -0.2, -0.58), lOff === null ? null : lOff * 0.6);
        }
        wind.clavR = 0.18; hit.clavR = -0.04; hit.clavL = 0.04;
        const tImp = 0.13;
        if (t < tImp) {
          // accelerate (ease-in) through the arc
          const k = t / tImp;
          mixPose(p, wind, hit, k * k * (1.6 - 0.6 * k));
        } else if (t < 0.24) {
          const k = (t - tImp) / 0.11;
          mixPose(p, hit, follow, Math.sin(k * Math.PI * 0.5));
          // the jolt of the bite travels up the arms
          const j = Math.exp(-k * 4) * 0.012 * pow;
          p.R.p.add(V(0, j, -j)); p.L.p.add(V(0, j, -j));
        } else {
          const k = sm((t - 0.24) / 0.38);
          mixPose(p, follow, base, k);
        }
        break;
      }
      case 'miss': {
        // nothing to bite: the head carries on round to the left and down, the body lurches after it, recover
        const fol = newPose(), over = newPose();
        if (two) {
          this.tool(fol, at(-0.03, -0.31, 0.5), V(-0.6, 0.04, 0.8), V(-0.78, -0.2, -0.58), (lOff ?? -0.24) * 0.6);
          this.tool(over, at(-0.12, -0.36, 0.48), V(-0.86, -0.3, 0.42), V(-0.3, -0.75, -0.6), (lOff ?? -0.24) * 0.6);
        } else {
          this.tool(fol, at(-0.04, -0.3, 0.44), V(-0.7, -0.05, 0.7), V(-0.5, -0.6, -0.55), null);
          this.tool(over, at(-0.16, -0.4, 0.34), V(-0.8, -0.4, 0.4), V(-0.3, -0.8, -0.5), null);
          for (const q of [fol, over]) { q.L.p.copy(base.L.p); q.L.q.copy(base.L.q); q.L.grip = base.L.grip.slice(); }
        }
        over.clavR = -0.08;
        if (t < 0.2) mixPose(p, fol, over, Math.sin((t / 0.2) * Math.PI * 0.5));
        else mixPose(p, over, base, sm((t - 0.2) / 0.55));
        break;
      }
      case 'chop_recover': {
        // the bit is stuck: brace, two yanks back and up, it comes free, recover
        const hit = newPose();
        this.tool(hit, at(0.02, -0.26, 0.54), V(-0.52, 0.12, 0.85), V(-0.82, -0.12, -0.55), lOff === null ? null : lOff * 0.6);
        if (lOff === null) { hit.L.p.copy(base.L.p); hit.L.q.copy(base.L.q); hit.L.grip = base.L.grip.slice(); }
        const yank = track(t, [[0, 0], [0.12, 0.25], [0.2, 0.05], [0.36, 0.45], [0.48, 1], [0.75, 0]]);
        mixPose(p, hit, base, sm(cl((t - 0.48) / 0.27)));
        const shake = Math.sin(t * 60) * 0.006 * (t < 0.48 ? 1 : 0);
        for (const s of ['L', 'R'] as const) p[s].p.add(V(0.03 * yank + shake, 0.05 * yank, -0.05 * yank));
        p.clavL = p.clavR = 0.1 * (t < 0.48 ? 1 : 0);
        break;
      }
      case 'split': {
        // overhead: the head swings up and back over the head, then straight down onto the round
        const up = newPose(), top = newPose(), hit = newPose(), fol = newPose();
        const lo = this.held === 'maul' ? -0.16 : -0.22;
        this.tool(up, at(0.05, -0.05, 0.42), V(0.05, 0.98, 0.1), V(0, 0.1, 1), lo);
        this.tool(top, at(0.03, 0.08, 0.32), V(0.0, 0.6, -0.8), V(0, 0.8, 0.6), lo);
        this.tool(hit, at(0.0, -0.36, 0.48), V(0.0, -0.32, 0.95), V(0, -0.95, -0.32), lo);
        this.tool(fol, at(0.0, -0.42, 0.44), V(0.0, -0.5, 0.86), V(0, -0.86, -0.5), lo);
        top.clavL = top.clavR = 0.3; up.clavL = up.clavR = 0.15;
        if (t < 0.25) mixPose(p, base, up, sm(t / 0.25));
        else if (t < 0.48) mixPose(p, up, top, sm((t - 0.25) / 0.23));
        else if (t < 0.62) { const k = (t - 0.48) / 0.14; mixPose(p, top, hit, k * k); }
        else if (t < 0.72) { mixPose(p, hit, fol, (t - 0.62) / 0.1); const j = Math.exp(-(t - 0.62) * 30) * 0.015; p.R.p.y += j; p.L.p.y += j; }
        else mixPose(p, fol, base, sm((t - 0.72) / 0.33));
        break;
      }
      case 'drink': {
        // raise the bottle to the mouth, tilt it up for three pulls, lower it
        const mouth = at(0.01, -0.075, 0.08);
        const raise = track(t, [[0, 0], [0.55, 1], [2.05, 1], [2.6, 0]]);
        const tilt = track(t, [[0, 0], [0.55, 0.25], [0.8, 0.75], [1.05, 0.62], [1.3, 0.85], [1.55, 0.72], [1.8, 1], [2.05, 0.4], [2.6, 0]]);
        const r = newPose(); copyPose(r, base);
        // bottle frame at the lips: neck toward the mouth, tipping up as tilt grows
        const Y = V(-0.12, lerp(0.75, -0.25, tilt), lerp(-0.65, -0.96, tilt));
        r.R.p.copy(mouth).add(_x.copy(Y).normalize().multiplyScalar(-0.13));
        r.R.q.copy(toolQ(Y, V(-0.9, 0.1, 0.2)));
        r.clavR = 0.08;
        mixPose(p, base, r, sm(raise));
        break;
      }
      case 'offer': {
        // hold out the jerky on a flat palm, low and steady (an animal's height), then draw back
        const k = track(t, [[0, 0], [0.55, 1], [1.75, 1], [2.2, 0]]);
        const o = newPose(); copyPose(o, base);
        this.free(o, 'R', at(0.06, -0.33, 0.58), V(-0.15, -0.08, 0.98), V(0.05, 0.98, 0.1), G_PALM_UP);
        o.clavR = 0.05;
        mixPose(p, base, o, sm(k));
        const tremble = Math.sin(t * 13) * 0.003 * k;
        p.R.p.y += tremble;
        break;
      }
      case 'grab': {
        // reach out with an open hand, close it on the thing, bring it back
        const reach = track(t, [[0, 0], [0.32, 1], [0.42, 0.95], [0.7, 0]]);
        const close = cl((t - 0.3) / 0.12);
        const o = newPose(); copyPose(o, base);
        this.free(o, 'R', at(0.08, -0.2, 0.68), V(-0.1, -0.25, 0.96), V(-0.8, -0.3, 0.2), G_OPEN);
        mixPose(p, base, o, sm(reach));
        p.R.grip = G_OPEN.map((v, i) => lerp(lerp(v, base.R.grip[i], 1 - reach), G_FIST[i] * 0.85, close * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.1)));
        break;
      }
      case 'drop': {
        // hold the hand out, open the fingers, let it fall, back to rest
        const out = track(t, [[0, 0], [0.25, 1], [0.4, 1], [0.65, 0]]);
        const open = cl((t - 0.24) / 0.08);
        const o = newPose(); copyPose(o, base);
        this.free(o, 'R', at(0.12, -0.3, 0.55), V(-0.1, -0.35, 0.93), V(-0.2, -0.95, 0.1), base.R.grip);
        mixPose(p, base, o, sm(out));
        p.R.grip = p.R.grip.map((v, i) => lerp(v, G_OPEN[i], open * out));
        break;
      }
      case 'push': {
        // both palms forward at chest height, a hard shove, back
        const k = track(t, [[0, 0], [0.18, 0.7], [0.3, 1], [0.45, 0.95], [0.8, 0]]);
        const o = newPose(); copyPose(o, base);
        this.free(o, 'L', at(-0.17, -0.16, 0.5 + 0.08 * k), V(0.15, 0.95, 0.15), V(0.05, 0.1, 1), G_OPEN);
        this.free(o, 'R', at(0.17, -0.16, 0.5 + 0.08 * k), V(-0.15, 0.95, 0.15), V(-0.05, 0.1, 1), G_OPEN);
        o.clavL = o.clavR = -0.05;
        mixPose(p, base, o, sm(cl(k * 1.4)));
        break;
      }
    }
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, s: ArmsInput) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.charge += ((this.held === 'axe' || this.held === 'maul' || this.held === 'hatchet' ? s.swingCharge : 0) - this.charge) * Math.min(1, dt * 14);
    this.crouchK += ((s.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 8);
    this.shiverK += (s.shiver - this.shiverK) * Math.min(1, dt * 2);
    const heavy = this.held === 'log' || this.held === 'two_hand' || this.held === 'maul' || this.held === 'drag';
    this.strainBob = heavy ? 1 : 0;
    this.strain += ((heavy ? 1 : 0) - this.strain) * Math.min(1, dt * 3);
    // walk / run cycle from speed
    const sp = Math.max(0, s.speed);
    this.walkAmt += (Math.min(1.6, sp / 1.6) - this.walkAmt) * Math.min(1, dt * 6);
    this.walkPh += dt * (sp > 0.05 ? (s.sprint ? 7.6 : 5.6) * Math.min(1.25, 0.55 + sp * 0.28) : 0);
    // camera-turn lag
    const pitchRate = (s.aimPitch - this.lastPitch) / Math.max(1e-3, dt);
    this.lastPitch = s.aimPitch;
    this.pitchLag += (-pitchRate * 0.012 - this.pitchLag) * Math.min(1, dt * 10);
    this.yawLag += (-(s.turnRate ?? 0) * 0.015 - this.yawLag) * Math.min(1, dt * 10);

    // held pose (+ wind-up), blended in after a change of held item
    this.buildHeldPose(this.heldPose);
    let base = this.heldPose;
    if (this.heldBlend < 1) {
      this.heldBlend = Math.min(1, this.heldBlend + dt / 0.35);
      mixPose(this.outPose, this.prevHeld, this.heldPose, sm(this.heldBlend));
      base = newPose(); copyPose(base, this.outPose);
    }
    // action
    let pose = base;
    if (this.action) {
      const def = ACTIONS[this.action];
      const t0 = this.actionT;
      this.actionT += dt;
      this.fireEvents(t0, this.actionT);
      this.actionPose(this.actPose, base, this.action, Math.min(this.actionT, def.dur));
      this.actW = Math.min(1, this.actW + dt / Math.max(0.001, def.fadeIn));
      if (this.actionT >= def.dur) { this.action = null; }
      pose = this.actPose;
    } else this.actW = 0;
    const P = this.outPose;
    if (pose !== P) copyPose(P, pose);

    // procedural layers (body space offsets applied to both hands)
    const off = _x.set(0, 0, 0);
    const T = this.time;
    const breathK = 0.6 + s.breath * 1.6;
    const br = Math.sin(T * (1.6 + s.breath * 2.2)) * 0.006 * breathK;
    const sway = V(Math.sin(T * 0.7) * 0.004 + Math.sin(T * 0.31) * 0.003, br + Math.sin(T * 0.53) * 0.003, 0);
    off.add(sway);
    const w = this.walkAmt * (this.action === 'swing' || this.action === 'split' ? 0.3 : 1);
    if (w > 0.01) {
      const ph = this.walkPh;
      const run = s.sprint ? 1.6 : 1;
      off.add(V(Math.sin(ph) * 0.016 * w * run, -Math.abs(Math.cos(ph)) * 0.018 * w * run + 0.006 * w, Math.sin(ph * 2) * 0.004 * w));
    }
    off.add(V(this.yawLag, this.pitchLag + this.crouchK * -0.02 - Math.max(0, -s.aimPitch) * 0.0 + Math.max(0, s.aimPitch) * -0.03, 0));
    // carrying strain: a heavy, slightly trembling hold that sags as breath runs out
    if (this.strain > 0.01) {
      const tr = (Math.sin(T * 23) * 0.5 + Math.sin(T * 31) * 0.5) * 0.0025 * this.strain * (0.6 + s.breath);
      off.add(V(tr, -0.02 * this.strain * s.breath + tr, 0));
    }
    P.L.p.add(off); P.R.p.add(off);
    // shiver: a fast irregular tremor, shoulders hunched, fingers twitching
    if (this.shiverK > 0.01) {
      const k = this.shiverK;
      for (const [sd, ph] of [['L', 0], ['R', 1.7]] as const) {
        const tr = V(Math.sin(T * 41 + ph) * 0.004 + Math.sin(T * 67 + ph * 2) * 0.003, Math.sin(T * 53 + ph) * 0.004, 0).multiplyScalar(k);
        P[sd].p.add(tr);
        P[sd].grip = P[sd].grip.map((v, i) => (i < 3 ? Math.min(1, v + k * 0.15 + Math.sin(T * 47 + i + ph) * 0.03 * k) : v));
      }
      P.clavL += 0.1 * k; P.clavR += 0.1 * k;
    }

    // springs on the targets: weight and a little overshoot; fast strikes ride a stiffer spring
    const fast = this.action === 'swing' || this.action === 'split' || this.action === 'chop_recover' || this.action === 'miss';
    const om = fast ? 55 : 22, z = fast ? 0.9 : 0.72;
    for (const sd of ['L', 'R'] as const) {
      if (this.first) { this.sp[sd].copy(P[sd].p); this.sq[sd].copy(P[sd].q); this.sv[sd].set(0, 0, 0); this.sgrip[sd] = P[sd].grip.slice(); continue; }
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const acc = _z.copy(P[sd].p).sub(this.sp[sd]).multiplyScalar(om * om).addScaledVector(this.sv[sd], -2 * z * om);
        this.sv[sd].addScaledVector(acc, h);
        this.sp[sd].addScaledVector(this.sv[sd], h);
      }
      this.sq[sd].slerp(P[sd].q, 1 - Math.exp(-dt * (fast ? 40 : 16)));
      this.sgrip[sd] = this.sgrip[sd].map((v, i) => v + (P[sd].grip[i] - v) * (1 - Math.exp(-dt * 18)));
    }
    this.first = false;

    // pose the rig: clavicles, then each arm onto its socket target
    const b = this.bones;
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head']) b[n].quaternion.identity();
    b.clavL.quaternion.setFromEuler(new THREE.Euler(0, 0, P.clavL, 'XZY'));
    b.clavR.quaternion.setFromEuler(new THREE.Euler(0, 0, -P.clavR, 'XZY'));
    this.mesh.updateMatrixWorld(true);
    for (const sd of ['L', 'R'] as const) {
      // socket target -> hand bone frame and wrist position
      const sock = this.sockets[sd];
      const hq = _q1.copy(this.sq[sd]).multiply(_q2.copy(sock.quaternion).invert());
      const wrist = _v1.copy(this.sp[sd]).sub(_v2.copy(sock.position).applyQuaternion(hq));
      // the mesh is offset by -eye: targets are in body space, the IK works in mesh space (the same: bones rest in body space)
      this.ik.armIK(sd, wrist, hq, 1);
      setGrip(b, sd, this.sgrip[sd][0], this.sgrip[sd][1], this.sgrip[sd][2], this.sgrip[sd][3], this.sgrip[sd][4]);
    }
    // the carry anchor rides between the palms
    this.carry.position.copy(this.sp.L).add(this.sp.R).multiplyScalar(0.5);
    this.carry.position.y += 0.06;
    this.carry.quaternion.setFromAxisAngle(_v1.set(0, 1, 0), 0);
    this.mesh.updateMatrixWorld(true);
    this.impactAt.copy(this.sp.R);
  }
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

/** keyframe track [[t, v], ...] with smoothstep easing */
function track(t: number, keys: number[][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) return lerp(v0, v1, sm((t - t0) / (t1 - t0 || 1)));
  }
  return keys[keys.length - 1][1];
}

/**
 * Fit an arbitrary tool model to the socket convention: the longest bounding-box axis becomes +Y with the bulkier
 * end (the head) up, the head's long cross direction becomes +Z with the edge (the side reaching furthest from
 * the handle) forward, and the origin moves onto the handle's centreline `grip` (0..1) of the way up from the
 * butt. Returns a wrapper group; the original object becomes its grandchild. userData.length = tool length (m).
 */
export function fitTool(obj: THREE.Object3D, grip = 0.42): THREE.Object3D {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const dims = [size.x, size.y, size.z];
  const li = dims.indexOf(Math.max(...dims));
  const others = [0, 1, 2].filter((i) => i !== li);
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).clone());
  });
  const L = dims[li], lo = box.min.getComponent(li);
  const tOf = (p: THREE.Vector3) => (p.getComponent(li) - lo) / L;
  // the handle's centreline: mean cross position of the middle of the tool
  const mid = pts.filter((p) => { const t = tOf(p); return t > 0.3 && t < 0.6; });
  const cA = mid.reduce((a, p) => a + p.getComponent(others[0]), 0) / Math.max(1, mid.length);
  const cB = mid.reduce((a, p) => a + p.getComponent(others[1]), 0) / Math.max(1, mid.length);
  // the head end: more spread across the handle
  const spread = (sel: (t: number) => boolean) => {
    let a = 0, b = 0;
    for (const p of pts) if (sel(tOf(p))) { a = Math.max(a, Math.abs(p.getComponent(others[0]) - cA)); b = Math.max(b, Math.abs(p.getComponent(others[1]) - cB)); }
    return [a, b];
  };
  const sLo = spread((t) => t < 0.22), sHi = spread((t) => t > 0.78);
  const headHigh = sHi[0] + sHi[1] >= sLo[0] + sLo[1];
  const sH = headHigh ? sHi : sLo;
  const bi = sH[0] >= sH[1] ? 0 : 1;
  const bAxis = others[bi], bc = bi === 0 ? cA : cB;
  // the edge: the side of the head reaching furthest from the handle
  let pos = 0, neg = 0;
  for (const p of pts) { const t = tOf(p); if (headHigh ? t > 0.78 : t < 0.22) { const d = p.getComponent(bAxis) - bc; pos = Math.max(pos, d); neg = Math.max(neg, -d); } }
  const axis = (i: number) => new THREE.Vector3().setComponent(i, 1);
  const Y = axis(li).multiplyScalar(headHigh ? 1 : -1);
  const Z = axis(bAxis).multiplyScalar(pos >= neg ? 1 : -1);
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const rot = new THREE.Matrix4().makeBasis(X, Y, Z).invert();
  const inner = new THREE.Group();
  inner.add(obj);
  inner.quaternion.setFromRotationMatrix(rot);
  const gripPt = new THREE.Vector3();
  gripPt.setComponent(li, headHigh ? lo + L * grip : lo + L * (1 - grip));
  gripPt.setComponent(others[0], cA); gripPt.setComponent(others[1], cB);
  inner.position.copy(gripPt.applyQuaternion(inner.quaternion).negate());
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.userData.length = L;
  return wrap;
}
