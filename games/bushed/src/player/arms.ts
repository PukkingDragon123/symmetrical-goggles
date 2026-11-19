// First-person arms (the viewmodel): the player's own arms, sleeves, cuffs and gloved hands, built from the same
// lofted body and painted page as the third-person human (src/humans), posed every frame by two-bone IK onto
// hand targets authored in view space, with articulated fingers that close on the real surface of whatever the
// hands hold.
//
// The hand system follows Gacha Garage's (src/game/FPBody.js + Held.js, the author's own game): every hold is built
// from the held object's own shape (fp/fit.ts), fingers wrap it joint by joint (fp/grip.ts), the hands trail the
// camera on weighted springs (fp/motion.ts: look lag, footstep-locked bob, strafe tilt, landing squash), a slot
// switch dips the old item out of view and raises the new one, RMB turns a small item over in the hands (mouse to
// turn, wheel to zoom), using things reaches the free hand out to them (capped at arm's length, never a stretched
// pole), two-handed carries keep both hands on screen, and the player's own body walks under the camera
// (fp/body.ts) so looking down shows shirt, legs and boots.
//
// Layering, bottom to top: the hold (object-aware pose for the held kind) -> the swing charge wind-up -> a playing
// action (swing, split, drink, eat, offer, grab, drop, push, reach, press, pull, fire, bolt, chop_recover) ->
// inspect -> procedural motion (breath, footstep bob, look lag, strafe tilt, landing, crouch, shiver, strain) ->
// slot dip / rise into view -> springs on the hand targets (weighted by the item's mass) -> IK -> finger grips.
//
//   const arms = new FPArms();                     // the player's look by default
//   view.add(arms.object);                         // viewmodel scene (camera at the origin looking down -Z)
//   arms.bind({ player, scene, camera, hands });   // optional: body, footstep bob, reach-to-use, RMB inspect
//   arms.setHeld('axe', axeMesh);                  // tools: grip at the origin, handle +Y (head end), edge +Z
//   arms.onEvent((ev, d) => { if (ev === 'impact') chop.hit(d); });
//   on release: arms.play('swing', { power: charge });
//   each frame: arms.update(dt, { speed, sprint, crouch, breath, shiver, aimPitch, swingCharge });
//
// Socket frames (socket('L' | 'R')): origin in the hollow of the fist, +Y along a gripped handle out of the thumb
// side (the axe head / bottle neck / torch beam), +Z the way the knuckles face (the axe's edge). Objects given to
// setHeld are re-seated by their shape (a bottle neck-up with its body against the palm, a pouch flat on the palm,
// a can wrapped...), so any model works; the arms own the transform of what they hold until setHeld changes it.
import * as THREE from 'three';
import { makeLook } from '../humans/looks';
import type { HumanLook } from '../humans/looks';
import { armsGeometry, makeSocket } from '../humans/model';
import { makeSkeleton } from '../humans/rig';
import type { Dims } from '../humans/rig';
import { HumanAnimator } from '../humans/anim';
import { input } from '../core/input';
import { findInteractable } from '../game/interact';
import { ITEMS } from '../game/items';
import { NF, gripOf, applyFingers, mixFingers, sampleSurface, solveWrap } from './fp/grip';
import type { Fingers, WrapOpts } from './fp/grip';
import { analyse, radiusAt, extent, gripStyle, guessMass, axisVec } from './fp/fit';
import type { ObjShape, GripStyle } from './fp/fit';
import { ViewMotion } from './fp/motion';
import { FPBody } from './fp/body';

export type HeldKind = 'none' | 'axe' | 'hatchet' | 'maul' | 'saw' | 'chainsaw' | 'bottle' | 'jerky' | 'flashlight' | 'item' | 'book'
  | 'read' | 'log' | 'two_hand' | 'drag' | 'rifle';
export type ArmsAction = 'swing' | 'miss' | 'chop_recover' | 'drink' | 'eat' | 'offer' | 'grab' | 'drop' | 'split' | 'push'
  | 'reach' | 'press' | 'pull' | 'fire' | 'bolt';
export type ReachStyle = 'press' | 'push' | 'pull' | 'grab' | 'turn';
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
  /** optional camera yaw rate (rad/s) for turn lag (measured from the bound player when there is one) */
  turnRate?: number;
  /** optional 0..1 aim down the sights (rifle) */
  aim?: number;
  /** optional: hold RMB-inspect of a small held item (bound arms decide this themselves) */
  inspect?: boolean;
  /** optional inspect controls: mouse deltas (px) and wheel steps (bound arms read the input module) */
  lookDX?: number; lookDY?: number; wheel?: number;
  /** optional: where a dragged log's end is (view space, camera at origin looking down -Z) */
  dragPoint?: THREE.Vector3 | null;
}
export type ArmsEvent = 'impact' | 'swing_start' | 'stuck_free' | 'drink_start' | 'sip' | 'drink_end' | 'eat_bite' | 'offer_out' | 'offer_end'
  | 'grab' | 'drop' | 'push' | 'split_start' | 'action_end' | 'reach_contact' | 'fire' | 'bolt_open' | 'bolt_close' | 'inspect_start' | 'inspect_end'
  | 'held_swap';
type Listener = (ev: ArmsEvent, data?: { action?: ArmsAction; power?: number; hand?: 'L' | 'R' }) => void;
export interface HeldOpts {
  /** kg; default from the item catalogue / wood piece / bounds */
  mass?: number;
  /** false: the object stays where the game puts it and the hands grip it there ('read') */
  own?: boolean;
  /** skip the dip-out / raise-in of a slot switch */
  instant?: boolean;
}
export interface PlayOpts {
  power?: number; charge?: number;
  /** reach / offer / grab target and its space ('world' needs a bound camera; 'view' = camera space) */
  target?: THREE.Vector3 | null; space?: 'world' | 'view';
  hand?: 'L' | 'R'; style?: ReachStyle;
}
/** what bind() reads from the player (src/player/player.ts) */
export interface ArmsPlayer {
  pos: THREE.Vector3; yaw: number; pitch: number; vel: THREE.Vector3; grounded: boolean; crouch: boolean; sprinting: boolean; enabled: boolean;
  stepPhase?: number; stepCount?: number; crouchK?: number; landImpulse?: number; lookLocked?: boolean;
}
/** what bind() reads from the hands (src/player/hands.ts) */
export interface ArmsHands {
  focus: { obj: THREE.Object3D; point: THREE.Vector3 } | null;
  held: { kind: string };
}
export interface ArmsBinding {
  player?: ArmsPlayer;
  /** the world scene: the first-person body goes in here */
  scene?: THREE.Object3D;
  /** the world camera */
  camera?: THREE.Camera;
  hands?: ArmsHands;
  /** build the visible body (default true when scene + player + camera are given) */
  body?: boolean;
  /** react to the input module: E / LMB on things reaches out, RMB inspects small items (default true) */
  auto?: boolean;
}

// ------------------------------------------------------------------ small math helpers (body space = x left, y up, z forward)
const V = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z);     // view-right authoring -> body axes
/** hand positions are authored a little low; viewmodels sit higher in frame than strict anatomy */
const LIFT = 0.12;
const sm = (t: number) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const cl = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const outCubic = (t: number) => 1 - (1 - cl(t)) ** 3;
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
const PI_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** one hand's target: palm socket pose (body space), grip channels, wrap weight (solved grip on the held object) */
interface HandT { p: THREE.Vector3; q: THREE.Quaternion; grip: number[]; w: number }
interface ArmsPose { L: HandT; R: HandT; clavL: number; clavR: number; vis: number }
const newHand = (): HandT => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), grip: [0.3, 0.3, 0.3, 0, 0.1], w: 0 });
const newPose = (): ArmsPose => ({ L: newHand(), R: newHand(), clavL: 0, clavR: 0, vis: 1 });
function copyPose(a: ArmsPose, b: ArmsPose) {
  for (const s of ['L', 'R'] as const) { a[s].p.copy(b[s].p); a[s].q.copy(b[s].q); a[s].grip = b[s].grip.slice(); a[s].w = b[s].w; }
  a.clavL = b.clavL; a.clavR = b.clavR; a.vis = b.vis;
}
function mixPose(out: ArmsPose, a: ArmsPose, b: ArmsPose, t: number) {
  for (const s of ['L', 'R'] as const) {
    out[s].p.lerpVectors(a[s].p, b[s].p, t);
    out[s].q.slerpQuaternions(a[s].q, b[s].q, t);
    out[s].grip = a[s].grip.map((v, i) => lerp(v, b[s].grip[i], t));
    out[s].w = lerp(a[s].w, b[s].w, t);
  }
  out.clavL = lerp(a.clavL, b.clavL, t); out.clavR = lerp(a.clavR, b.clavR, t); out.vis = lerp(a.vis, b.vis, t);
}
function mixHand(out: HandT, a: HandT, b: HandT, t: number) {
  out.p.lerpVectors(a.p, b.p, t); out.q.slerpQuaternions(a.q, b.q, t);
  out.grip = a.grip.map((v, i) => lerp(v, b.grip[i], t)); out.w = lerp(a.w, b.w, t);
}

// grips: [curl, index, thumb, spread, cup]
const G_FIST = [0.9, 0.9, 0.95, 0, 0];
const G_HANDLE = [0.84, 0.82, 0.9, 0, 0];
const G_RELAX = [0.38, 0.3, 0.3, 0.08, 0.12];
const G_OPEN = [0.06, 0.05, 0.12, 0.45, 0.0];
const G_CUP = [0.42, 0.38, 0.45, 0.1, 0.35];
const G_BOTTLE = [0.7, 0.66, 0.72, 0, 0];
const G_PALM_UP = [0.12, 0.1, 0.2, 0.2, 0.3];
const G_POINT = [0.92, 0.02, 0.75, 0, 0];
const G_FLAT = [0.1, 0.08, 0.25, 0.12, 0.05];

interface ActionDef { dur: number; events: [number, ArmsEvent][]; fadeIn: number; fadeOut: number }
const ACTIONS: Record<ArmsAction, ActionDef> = {
  swing: { dur: 0.62, events: [[0.0, 'swing_start'], [0.13, 'impact'], [0.62, 'action_end']], fadeIn: 0.02, fadeOut: 0.22 },
  miss: { dur: 0.75, events: [[0.75, 'action_end']], fadeIn: 0.01, fadeOut: 0.25 },
  chop_recover: { dur: 0.75, events: [[0.48, 'stuck_free'], [0.75, 'action_end']], fadeIn: 0.05, fadeOut: 0.2 },
  split: { dur: 1.05, events: [[0.0, 'split_start'], [0.62, 'impact'], [1.05, 'action_end']], fadeIn: 0.08, fadeOut: 0.25 },
  drink: { dur: 2.6, events: [[0.0, 'drink_start'], [0.85, 'sip'], [1.35, 'sip'], [1.85, 'sip'], [2.6, 'drink_end']], fadeIn: 0.15, fadeOut: 0.3 },
  eat: { dur: 2.2, events: [[0.7, 'eat_bite'], [1.15, 'eat_bite'], [1.6, 'eat_bite'], [2.2, 'action_end']], fadeIn: 0.12, fadeOut: 0.3 },
  offer: { dur: 2.2, events: [[0.55, 'offer_out'], [2.2, 'offer_end']], fadeIn: 0.12, fadeOut: 0.35 },
  grab: { dur: 0.7, events: [[0.38, 'grab'], [0.7, 'action_end']], fadeIn: 0.06, fadeOut: 0.22 },
  drop: { dur: 0.65, events: [[0.3, 'drop'], [0.65, 'action_end']], fadeIn: 0.06, fadeOut: 0.22 },
  push: { dur: 0.8, events: [[0.3, 'push'], [0.8, 'action_end']], fadeIn: 0.08, fadeOut: 0.25 },
  reach: { dur: 0.78, events: [[0.3, 'reach_contact'], [0.78, 'action_end']], fadeIn: 0.05, fadeOut: 0.2 },
  press: { dur: 0.6, events: [[0.26, 'reach_contact'], [0.6, 'action_end']], fadeIn: 0.05, fadeOut: 0.2 },
  pull: { dur: 0.9, events: [[0.3, 'reach_contact'], [0.9, 'action_end']], fadeIn: 0.05, fadeOut: 0.2 },
  fire: { dur: 0.45, events: [[0.0, 'fire'], [0.45, 'action_end']], fadeIn: 0.01, fadeOut: 0.15 },
  bolt: { dur: 0.95, events: [[0.42, 'bolt_open'], [0.66, 'bolt_close'], [0.95, 'action_end']], fadeIn: 0.05, fadeOut: 0.2 },
};

/** default masses (kg) when nothing better is known */
const MASS: Partial<Record<HeldKind, number>> = { axe: 2.4, maul: 4.6, hatchet: 0.9, saw: 1.1, chainsaw: 6.2, bottle: 0.55, jerky: 0.12, flashlight: 0.6, item: 0.5, book: 0.6, two_hand: 12, log: 40, drag: 20, rifle: 3.6 };
const ONE_HAND_SMALL: HeldKind[] = ['bottle', 'jerky', 'item', 'book', 'flashlight'];
/** how far the socket sits in front of the palm surface (m) */
const PALM_GAP = 0.0068;

interface Hold {
  kind: HeldKind;
  obj: THREE.Object3D | null;
  /** which socket carries the object ('carry' = object-first, posed by the arms; null = no object) */
  side: 'L' | 'R' | 'carry' | null;
  own: boolean;
  /** object local -> socket space (or canonical carry frame) */
  place: THREE.Matrix4;
  shape: ObjShape | null;
  style: GripStyle | 'carry' | 'long' | 'rifle' | 'read' | 'none';
  mass: number;
  /** two-hand tools: offset of the left socket from the right one, in the right socket's frame */
  lOff: THREE.Vector3 | null;
  /** object-first holds: canonical object frame pose (body space) and both sockets in that frame */
  carry: { pose: THREE.Matrix4; ads?: THREE.Matrix4; gR: THREE.Matrix4 | null; gL: THREE.Matrix4 | null; bolt?: THREE.Vector3; size: THREE.Vector3 } | null;
  wrap: { L: WrapOpts | null; R: WrapOpts | null };
  solved: { L: Fingers | null; R: Fingers | null };
  inspectable: boolean;
  /** saved state of the object to restore when released */
  restore: { mau: boolean } | null;
}

export class FPArms {
  /** add to the viewmodel scene (local space: camera at the origin looking down -Z) */
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
  /** RMB inspect in progress (0..1 blend) */
  inspectK = 0;
  inspecting = false;
  /** the first-person body (after bind) */
  body: FPBody | null = null;
  private actionOpts: PlayOpts = {};
  private reachT: { p: THREE.Vector3; hand: 'L' | 'R'; style: ReachStyle } | null = null;
  private listeners: Listener[] = [];
  private sockets: { L: THREE.Object3D; R: THREE.Object3D };
  private holders: { L: THREE.Group; R: THREE.Group; carry: THREE.Group; oldL: THREE.Group; oldR: THREE.Group; oldC: THREE.Group };
  private carry = new THREE.Object3D();
  private rig = new THREE.Group();
  private ik: HumanAnimator;
  private eye = new THREE.Vector3();
  private time = 0; private walkPh = 0; private walkAmt = 0; private crouchK = 0; private sprintK = 0; private aimK = 0;
  private charge = 0; private shiverK = 0; private strain = 0; private lastPitch = 0; private lastYaw = NaN;
  private heldPose = newPose(); private actPose = newPose(); private outPose = newPose(); private prevHeld = newPose(); private basePose = newPose();
  private heldBlend = 1;
  private sp = { L: new THREE.Vector3(), R: new THREE.Vector3(), O: new THREE.Vector3() };
  private sv = { L: new THREE.Vector3(), R: new THREE.Vector3(), O: new THREE.Vector3() };
  private sq = { L: new THREE.Quaternion(), R: new THREE.Quaternion(), O: new THREE.Quaternion() };
  private sfing = { L: new Float32Array(NF), R: new Float32Array(NF) };
  private first = true;
  private motion = new ViewMotion();
  private hold: Hold;
  private gripDirty = false;
  /** slot switch: the old item dips out, then the new one rises */
  private dip: { t: number; phase: 'out' | 'in'; pending: { kind: HeldKind; obj: THREE.Object3D | null; opts: HeldOpts } | null; old: THREE.Object3D | null } | null = null;
  private presence = 1; private wasVisible = true;
  private inspectRot = new THREE.Euler(0, 0, 0, 'YXZ'); private inspectZoom = 0; private inspectIdle = 0;
  private keyLight: THREE.PointLight;
  private bind_: ArmsBinding | null = null;
  private lastFocus: { point: THREE.Vector3; kind: string; t: number } | null = null;
  private lookDownK = 0;
  private stepPrev = 0; private stepCountPrev = -1;
  private carryPose = new THREE.Matrix4();
  private drag = new THREE.Vector3(); private dragK = 0;

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
    const mk = (name: string, parent: THREE.Object3D) => { const g = new THREE.Group(); g.name = name; g.matrixAutoUpdate = false; parent.add(g); return g; };
    this.mesh.add(this.carry);
    this.holders = {
      L: mk('holdL', this.sockets.L), R: mk('holdR', this.sockets.R), carry: mk('holdCarry', this.carry),
      oldL: mk('oldL', this.sockets.L), oldR: mk('oldR', this.sockets.R), oldC: mk('oldC', this.carry),
    };
    this.ik = new HumanAnimator(byName, d, this.mesh, look.seed);
    // a soft key light rides along while inspecting so every detail reads (Held.js)
    this.keyLight = new THREE.PointLight(0xfff2e0, 0, 1.4, 2);
    this.keyLight.position.set(0.18, 0.12, -0.05);
    this.object.add(this.keyLight);
    this.hold = this.emptyHold('none');
    this.buildHeldPose(this.heldPose);
    copyPose(this.outPose, this.heldPose);
    for (const s of ['L', 'R'] as const) gripOf(this.heldPose[s].grip, this.sfing[s]);
  }

  socket(hand: 'L' | 'R'): THREE.Object3D { return this.sockets[hand]; }
  onEvent(cb: Listener) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((l) => l !== cb); }; }
  private emit(ev: ArmsEvent, data?: Parameters<Listener>[1]) { for (const l of this.listeners) l(ev, data); }

  /**
   * Hook the arms up to the player, the world and the hands: builds the visible body in `scene`, locks the bob to
   * the player's footsteps, measures camera turn rates, and (auto) reaches out when you use things (E / LMB on a
   * focus) and inspects small held items while RMB is held with nothing in focus. Everything stays optional.
   */
  bind(b: ArmsBinding) {
    this.bind_ = b;
    if (b.scene && b.player && b.camera && b.body !== false && !this.body) {
      this.body = new FPBody(this.look);
      b.scene.add(this.body.root);
    }
  }

  // ------------------------------------------------------------------ held things
  /**
   * What the hands hold. obj (optional) is re-seated by its shape in the right hand (left for the flashlight, out in
   * front of both hands for 'two_hand' and 'rifle'); 'two_hand' without obj adopts the object the hands just put in
   * the viewmodel scene. Switching between held things dips the old one out of view and raises the new one.
   */
  setHeld(kind: HeldKind, obj?: THREE.Object3D, opts: HeldOpts = {}) {
    if (!obj && kind === 'two_hand') obj = this.adopt() ?? undefined;
    const prev = this.hold;
    const visible = this.object.visible && this.presence > 0.9;
    const swap = !opts.instant && visible && !this.first && kind !== prev.kind && !this.action
      && ![prev.kind, kind].some((k) => k === 'two_hand' || k === 'log' || k === 'drag' || k === 'read')
      && (prev.obj !== null || obj !== undefined);
    // the old object: keep showing it while it dips out, unless the game has already put it somewhere else
    if (this.dip?.old) { this.dip.old.removeFromParent(); }
    let old: THREE.Object3D | null = null;
    if (swap && prev.obj && prev.own && (!prev.obj.parent || prev.obj.parent === this.holderOf(prev))) {
      const hs = prev.side === 'L' ? this.holders.oldL : prev.side === 'R' ? this.holders.oldR : this.holders.oldC;
      const src = this.holderOf(prev);
      if (src) hs.matrix.copy(src.matrix);
      hs.matrixWorldNeedsUpdate = true;
      hs.add(prev.obj);
      old = prev.obj;
    }
    if (swap) {
      // the hands keep the old pose until they are out of sight, then the new hold commits and rises (a borrowed
      // old object stays ours until then; one the game already took back is released now)
      if (!old) this.release(prev);
      this.hold = { ...prev, obj: old, solved: prev.solved };
      this.dip = { t: this.dip?.phase === 'out' ? this.dip.t : 0, phase: 'out', pending: { kind, obj: obj ?? null, opts }, old };
      this.held = kind; this.heldObj = obj ?? null;
      if (obj) obj.removeFromParent();
      return;
    }
    if (this.dip) { this.dip.old?.removeFromParent(); this.dip = null; }
    copyPose(this.prevHeld, this.outPose);
    this.heldBlend = this.first ? 1 : 0;
    this.commit(kind, obj ?? null, opts);
  }

  private holderOf(h: Hold): THREE.Group | null {
    return h.side === 'L' ? this.holders.L : h.side === 'R' ? this.holders.R : h.side === 'carry' ? this.holders.carry : null;
  }

  /** the object hands.ts just carried into the viewmodel scene (two_hand without an object) */
  private adopt(): THREE.Object3D | null {
    const par = this.object.parent;
    if (!par) return null;
    for (let i = par.children.length - 1; i >= Math.max(0, par.children.length - 3); i--) {
      const c = par.children[i];
      if (c === this.object) continue;
      const u = c.userData;
      if (u.woodPiece || u.physProp || u.itemId || u.carry) return c;
    }
    return null;
  }

  private emptyHold(kind: HeldKind): Hold {
    return { kind, obj: null, side: null, own: false, place: new THREE.Matrix4(), shape: null, style: 'none', mass: MASS[kind] ?? 0, lOff: null, carry: null, wrap: { L: null, R: null }, solved: { L: null, R: null }, inspectable: false, restore: null };
  }

  /** give back an object we owned (its own transform drives it again) */
  private release(h: Hold, keep: THREE.Object3D | null = null) {
    if (h.obj && h.restore) {
      h.obj.matrixAutoUpdate = h.restore.mau;
      if (h.obj !== keep && h.obj.parent && this.isOurs(h.obj.parent)) h.obj.removeFromParent();
    }
  }
  private isOurs(p: THREE.Object3D) { const H = this.holders; return p === H.L || p === H.R || p === H.carry || p === H.oldL || p === H.oldR || p === H.oldC; }

  private commit(kind: HeldKind, obj: THREE.Object3D | null, opts: HeldOpts) {
    this.release(this.hold);
    this.held = kind;
    this.heldObj = obj;
    const h = this.emptyHold(kind);
    h.obj = obj;
    if (obj) {
      const sc = obj.scale.clone();
      h.shape = analyseScaled(obj, sc);
      const u = obj.userData;
      const wp = u.woodPiece as { mass?: number } | undefined;
      const im = typeof u.itemId === 'string' ? ITEMS[u.itemId]?.mass : undefined;
      h.mass = opts.mass ?? wp?.mass ?? im ?? MASS[kind] ?? guessMass(h.shape);
      h.own = opts.own ?? kind !== 'read';
    }
    const s = h.shape;
    switch (kind) {
      case 'axe': case 'maul': case 'hatchet': case 'saw': case 'chainsaw':
        if (s && obj) { h.side = 'R'; h.style = 'handle'; this.placeHandle(h, 'R'); }
        h.wrap.R = { opp: 0.9, squeeze: 0.2 };
        if (kind === 'axe' || kind === 'maul') h.wrap.L = { opp: 0.9, squeeze: 0.2 };
        if (kind === 'axe' || kind === 'maul') {
          const along = kind === 'maul' ? -0.2 : -0.24;
          const dR = this.palmOff(h, 0), dL = this.palmOff(h, along);
          // both palms against the handle: the right palm faces socket +X, the left palm socket -X
          h.lOff = new THREE.Vector3(dR + dL, along, 0);
        }
        break;
      case 'flashlight':
        if (s && obj) { h.side = 'L'; h.style = 'handle'; this.placeHandle(h, 'L'); }
        h.wrap.L = { opp: 0.85, squeeze: 0.15 };
        break;
      case 'bottle': case 'jerky': case 'item': case 'book':
        if (s && obj) {
          h.side = 'R';
          h.style = gripStyle(s, kind);
          if (h.style === 'handle') this.placeHandle(h, 'R');
          else if (h.style === 'wrap') this.placeWrap(h, 'R');
          else if (h.style === 'flat') this.placeFlat(h, 'R');
          else this.placeCradle(h, 'R');
          h.wrap.R = h.style === 'flat' ? { opp: 0.15, maxCurl: 0.75, squeeze: 0.1 } : h.style === 'cradle' ? { opp: 0.35, maxCurl: 0.8, squeeze: 0.1 } : { opp: 0.75, squeeze: 0.18 };
          h.inspectable = Math.max(s.size.x, s.size.y, s.size.z) < 0.4 && h.mass < 3;
        }
        break;
      case 'two_hand':
        if (s && obj) { h.side = 'carry'; this.placeCarry(h); h.wrap.L = h.wrap.R = { opp: 0.25, maxCurl: 0.75, squeeze: 0.1 }; }
        break;
      case 'rifle':
        if (s && obj) { h.side = 'carry'; this.placeRifle(h); h.wrap.R = { opp: 0.9, squeeze: 0.15, fingers: [false, true, true, true] }; h.wrap.L = { opp: 0.55, squeeze: 0.1 }; }
        break;
      case 'read':
        if (s && obj) { h.side = 'carry'; h.style = 'read'; h.own = false; this.placeRead(h); h.wrap.L = h.wrap.R = { opp: 0.5, maxCurl: 0.6, squeeze: 0.05 }; }
        break;
    }
    if (obj && h.own && h.side) {
      const holder = this.holderOf(h)!;
      h.restore = { mau: obj.matrixAutoUpdate };
      holder.matrix.copy(h.side === 'carry' ? _m.multiplyMatrices(this.carryPose, h.place) : h.place);
      holder.matrixWorldNeedsUpdate = true;
      holder.add(obj);
      obj.matrixAutoUpdate = false;
      obj.matrix.makeScale(obj.scale.x, obj.scale.y, obj.scale.z);
      obj.matrixWorldNeedsUpdate = true;
    }
    this.hold = h;
    this.gripDirty = true;
    if (this.inspecting && !h.inspectable) this.setInspect(false);
  }

  /** palm offset for a handle: how far the object's axis sits from the socket so its surface meets the palm */
  private palmOff(h: Hold, along: number): number {
    const s = h.shape;
    if (!s) return 0;
    const r = s.fitted ? radiusAt(s, new THREE.Vector3(), axisVec(1), along) : 0.016;
    return THREE.MathUtils.clamp(r - PALM_GAP + 0.002, 0, 0.06);
  }

  /** a handle (tools, splits, knives, fish): the long axis along socket +Y through the fist */
  private placeHandle(h: Hold, side: 'L' | 'R') {
    const s = h.shape!, k = side === 'L' ? 1 : -1;
    let F: THREE.Matrix4;
    if (s.fitted) F = new THREE.Matrix4();      // fitTool(): already handle +Y, grip at the origin
    else {
      // long axis; the bulkier end up (like fitTool's head), held 30% of the way up from the other end
      const ax = axisVec(s.long), c = s.center;
      const [lo, hi] = extent(s, c, ax);
      const rLo = radiusAt(s, c, ax, lo + (hi - lo) * 0.12, (hi - lo) * 0.1), rHi = radiusAt(s, c, ax, hi - (hi - lo) * 0.12, (hi - lo) * 0.1);
      const up = rHi >= rLo ? ax.clone() : ax.clone().negate();
      const t = (rHi >= rLo ? lo : -hi) + (hi - lo) * 0.3;
      const o = c.clone().addScaledVector(up, t);
      const Z = axisVec(s.mid);
      F = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, Z), up, Z).setPosition(o);
    }
    const r = s.fitted ? radiusAt(s, new THREE.Vector3(), axisVec(1), 0) : radiusAt(s, new THREE.Vector3().setFromMatrixPosition(F), new THREE.Vector3().setFromMatrixColumn(F, 1), 0);
    const d = THREE.MathUtils.clamp(r - PALM_GAP + 0.002, 0, 0.06);
    // the palm faces socket -k X: push the object that way so its surface rests against the palm
    h.place.makeTranslation(-k * d, 0, 0).multiply(F.clone().invert());
  }

  /** a bottle / can / jar: upright axis (neck end) along socket +Y, the body wrapped a third of the way up */
  private placeWrap(h: Hold, side: 'L' | 'R') {
    const s = h.shape!, k = side === 'L' ? 1 : -1;
    // the axis: the long one for bottles (fitTool may have flipped it), y for upright products
    const ai = h.kind === 'bottle' ? s.long : 1;
    const ax = axisVec(ai), c = s.center.clone();
    // centre the axis on the cross-section
    const [lo, hi] = extent(s, c, ax);
    const L = hi - lo;
    const rLo = radiusAt(s, c, ax, lo + L * 0.15, L * 0.1), rHi = radiusAt(s, c, ax, hi - L * 0.12, L * 0.1);
    const up = h.kind === 'bottle' || ai !== 1 ? (rHi <= rLo ? ax.clone() : ax.clone().negate()) : ax.clone();
    const base = up.dot(ax) > 0 ? lo : -hi;
    const gT = base + L * (h.kind === 'bottle' ? 0.36 : 0.42);
    const o = c.clone().addScaledVector(up, gT);
    const Z = axisVec(ai === 2 ? 0 : 2);
    const F = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, Z), up, Z).setPosition(o);
    const r = radiusAt(s, o, up, 0, 0.02);
    const d = THREE.MathUtils.clamp(r - PALM_GAP + 0.003, 0, 0.08);
    h.place.makeTranslation(-k * d, 0, 0).multiply(F.invert());
  }

  /** a flat thing (pouch, book, packet): lying on the palm, face out, held by its lower half */
  private placeFlat(h: Hold, side: 'L' | 'R') {
    const s = h.shape!, k = side === 'L' ? 1 : -1;
    const thin = axisVec(s.short);
    // "up" on the object: y if it isn't the thin axis, else the long axis
    const upI = s.short !== 1 ? 1 : s.long;
    const up = axisVec(upI);
    const across = new THREE.Vector3().crossVectors(up, thin);
    const t = s.size.getComponent(s.short), hgt = s.size.getComponent(upI);
    // canonical frame: X = the face normal (out of the palm), Y = across (thumb side), Z = up (along the fingers)
    const F = new THREE.Matrix4().makeBasis(thin, across, up).setPosition(s.center);
    // palm surface at socket -k*X*gap; the object's back face rests on it; its bottom edge at the heel of the hand
    const zc = -0.085 + Math.min(hgt * 0.5, 0.11);
    const xc = -k * (-PALM_GAP + t / 2 + 0.002);
    // the socket's +X is the palm normal only for the right hand: mirror the face direction for the left
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(-k, 0, 0), new THREE.Vector3(0, -k, 0), new THREE.Vector3(0, 0, 1)).setPosition(xc, 0.0, zc);
    h.place.copy(M).multiply(F.invert());
  }

  /** anything else: sitting on the palm, fingers curled up round it */
  private placeCradle(h: Hold, side: 'L' | 'R') {
    const s = h.shape!, k = side === 'L' ? 1 : -1;
    const up = axisVec(1);
    const hz = s.size.x >= s.size.z ? axisVec(0) : axisVec(2);
    const F = new THREE.Matrix4().makeBasis(up, new THREE.Vector3().crossVectors(hz, up), hz).setPosition(s.center);
    const hh = s.size.y;
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(-k, 0, 0), new THREE.Vector3(0, -k, 0), new THREE.Vector3(0, 0, 1))
      .setPosition(-k * (-PALM_GAP + hh / 2 + 0.003), 0.004, -0.03);
    h.place.copy(M).multiply(F.invert());
  }

  /** object-first two-hand carry: the thing across the forearms, both palms on its ends (Held.js 'box' / 'long') */
  private placeCarry(h: Hold) {
    const s = h.shape!;
    const L = s.size.getComponent(s.long), M = s.size.getComponent(s.mid);
    const longI = L > 1.18 * M ? s.long : (s.size.x >= s.size.z ? 0 : 2);
    const X = axisVec(longI);
    // up: y unless y is the long axis (wood pieces lie along their y), then the remaining axes
    const upI = longI !== 1 ? 1 : (s.mid === longI ? s.short : s.mid);
    const Y = axisVec(upI);
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const F = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(s.center);
    h.place.copy(F.invert());
    const hx = s.size.getComponent(longI) / 2, hy = s.size.getComponent(upI) / 2, hz = s.size.dot(Z.clone().set(Math.abs(Z.x), Math.abs(Z.y), Math.abs(Z.z))) / 2;
    const e = this.eye;
    const long = hx > 0.33;
    h.style = long ? 'long' : 'carry';
    // the object low and close but well in view (view space y: the screen's bottom edge is ~0.55 z below the
    // eye), lower the heavier it is; a long log rides higher so the hands under it stay on screen
    const zc = 0.4 + hz;
    const yc = long ? -0.1 - Math.min(0.03, h.mass * 0.001) : -0.15 - Math.min(0.05, hy * 0.2) - Math.min(0.03, h.mass * 0.001);
    const pose = new THREE.Matrix4().compose(V(0, yc, zc).add(e), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0)), new THREE.Vector3(1, 1, 1));
    const gR = new THREE.Matrix4(), gL = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [sd, g] of [['R', gR], ['L', gL]] as const) {
      const k = sd === 'L' ? 1 : -1;     // body +x is the left
      if (long) {
        // under the log, a shoulder-width apart: palms up, fingers forward round the far side
        const c = new THREE.Vector3(k * Math.min(hx - 0.06, 0.19), -hy, -hz * 0.15);
        const n = new THREE.Vector3(-k * 0.15, 1, -0.15).normalize(), f = new THREE.Vector3(k * 0.3, 0.3, 1).normalize();
        handQ(sd, f, n, q).multiply(this.sockets[sd].quaternion);
        g.compose(c.addScaledVector(n, PALM_GAP), q, new THREE.Vector3(1, 1, 1));
      } else {
        // flat hands on the ends near the front corners, fingers forward and down (Held.js 'box')
        const c = new THREE.Vector3(k * hx, -hy * 0.18, -hz * 0.4);
        const n = new THREE.Vector3(-k, 0.05, 0).normalize(), f = new THREE.Vector3(0, -0.45, 1).normalize();
        handQ(sd, f, n, q).multiply(this.sockets[sd].quaternion);
        g.compose(c.addScaledVector(n, PALM_GAP), q, new THREE.Vector3(1, 1, 1));
      }
    }
    h.carry = { pose, gR, gL, size: new THREE.Vector3(hx * 2, hy * 2, hz * 2) };
    this.carryPose.copy(pose);
  }

  /** a rifle: right hand on the wrist of the stock, left under the forend; ready low, or up to the eye when aiming */
  private placeRifle(h: Hold) {
    const s = h.shape!;
    // barrel along the longest axis; the muzzle is the slimmer end; up is the model's y (or its taller side axis)
    const ax = axisVec(s.long), c = s.center;
    const [lo, hi] = extent(s, c, ax);
    const L = hi - lo;
    const sideI = [0, 1, 2].filter((i) => i !== s.long) as (0 | 1 | 2)[];
    const upI = sideI.includes(1) ? 1 : (s.size.getComponent(sideI[0]) >= s.size.getComponent(sideI[1]) ? sideI[0] : sideI[1]);
    const up = axisVec(upI);
    const spread = (t0: number, t1: number) => { let m = 0; const d = new THREE.Vector3(); for (const p of s.pts) { const t = d.subVectors(p, c).dot(ax); if (t >= t0 && t <= t1) m = Math.max(m, Math.abs(d.dot(up))); } return m; };
    const muzzleHi = spread(hi - L * 0.12, hi) < spread(lo, lo + L * 0.12);
    const Zc = muzzleHi ? ax.clone() : ax.clone().negate();        // toward the muzzle
    const butt = muzzleHi ? lo : -hi;                              // t of the butt along Zc
    const Xc = new THREE.Vector3().crossVectors(up, Zc);           // the rifle's left
    // stations along the rifle (t from the centre along Zc): wrist ~31%, forend ~60%, bolt ~40%
    const band = (u: number) => {
      const t = butt + L * u, d = new THREE.Vector3();
      let ymin = Infinity, ymax = -Infinity, xs = 0;
      const ys: number[] = [];
      for (const p of s.pts) { d.subVectors(p, c); if (Math.abs(d.dot(Zc) - t) > L * 0.025) continue; const y = d.dot(up); ys.push(y); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); xs = Math.max(xs, Math.abs(d.dot(Xc))); }
      ys.sort((a, b) => a - b);
      return { t, ymin, ymax, ylo: ys.length ? ys[Math.floor(ys.length * 0.15)] : 0, yhi: ys.length ? ys[Math.floor(ys.length * 0.6)] : 0, xs: Math.max(0.012, xs) };
    };
    const wr = band(0.3), fe = band(0.53), bo = band(0.42), sc = band(0.45);
    const wristY = wr.ymin + Math.min(0.045, (wr.ymax - wr.ymin) * 0.32);
    const feY = fe.ymin + Math.min(0.03, (fe.ymax - fe.ymin) * 0.4);
    const scopeY = sc.ymax - 0.018;
    // canonical frame: origin on the wrist, Zc to the muzzle, Y up, X left
    const O = c.clone().addScaledVector(Zc, wr.t).addScaledVector(up, wristY);
    const F = new THREE.Matrix4().makeBasis(Xc, up, Zc).setPosition(O);
    h.place.copy(F.clone().invert());
    h.style = 'rifle';
    const q = new THREE.Quaternion();
    // right hand round the wrist from the right side: palm in (+X), fingers down and forward under it
    const gR = new THREE.Matrix4();
    handQ('R', new THREE.Vector3(0.25, -1, 0.35).normalize(), new THREE.Vector3(1, -0.1, 0).normalize(), q).multiply(this.sockets.R.quaternion);
    gR.compose(new THREE.Vector3(-wr.xs + PALM_GAP + 0.004, -0.008, -0.004), q, new THREE.Vector3(1, 1, 1));
    // left hand cupped under the forend: palm up, fingers across to the left side
    const gL = new THREE.Matrix4();
    handQ('L', new THREE.Vector3(-0.85, 0.35, 0.45).normalize(), new THREE.Vector3(0.12, 1, 0).normalize(), q).multiply(this.sockets.L.quaternion);
    gL.compose(new THREE.Vector3(-0.012, (fe.ymin - wristY) - PALM_GAP * 0.0 + 0.004, fe.t - wr.t), q, new THREE.Vector3(1, 1, 1));
    void feY;
    const e = this.eye;
    const at = (x: number, y: number, z: number) => V(x, y + LIFT, z).add(e);
    // low ready: muzzle forward and a little down and left, the stock under the right arm
    const pose = new THREE.Matrix4().compose(at(0.12, -0.2, 0.22), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.1, -0.1, 'YXZ')), new THREE.Vector3(1, 1, 1));
    // aiming: the scope's axis through the eye, its ocular a hand's width ahead of it
    const zs = bo.t - wr.t;
    const ads = new THREE.Matrix4().makeTranslation(e.x, e.y - (scopeY - wristY), e.z + 0.1 - zs);
    h.carry = { pose, ads, gR, gL, bolt: new THREE.Vector3(-bo.xs - 0.03, bo.yhi - wristY + 0.01, bo.t - wr.t), size: new THREE.Vector3(0.06, wr.ymax - wr.ymin, L) };
    this.carryPose.copy(pose);
  }

  /** a sheet / open book the game holds up in front of you: hands on its lower corners, where it is */
  private placeRead(h: Hold) {
    const s = h.shape!;
    const F = new THREE.Matrix4().makeBasis(axisVec(0), axisVec(1), axisVec(2)).setPosition(s.center);
    h.place.copy(F.invert());
    const hx = s.size.x / 2, hy = s.size.y / 2;
    const q = new THREE.Quaternion();
    const gR = new THREE.Matrix4(), gL = new THREE.Matrix4();
    // object local: x right, y up, +z toward the reader; in body terms the reader looks down -z of the object
    for (const [sd, g] of [['R', gR], ['L', gL]] as const) {
      const sx = sd === 'R' ? 1 : -1;
      const c = new THREE.Vector3(sx * (hx - 0.02), -hy * 0.3, -0.008);
      handQ(sd, new THREE.Vector3(-sx * 0.75, 0.6, 0).normalize(), new THREE.Vector3(0, 0, 1), q).multiply(this.sockets[sd].quaternion);
      g.compose(c, q, new THREE.Vector3(1, 1, 1));
    }
    h.carry = { pose: new THREE.Matrix4(), gR, gL, size: s.size.clone() };
  }

  /** start an action (power / charge 0..1 for swings; 'miss' continues a swing that hit nothing into an overswing) */
  play(action: ArmsAction, opts: PlayOpts = {}) {
    if (!(action in ACTIONS)) return;
    this.action = action; this.actionT = 0; this.actionOpts = { ...opts };
    if (this.actionOpts.power === undefined) this.actionOpts.power = opts.charge ?? (action === 'swing' ? Math.max(0.3, this.charge) : 1);
    this.reachT = null;
    if (action === 'reach' || action === 'press' || action === 'pull' || action === 'offer' || action === 'grab') {
      let tgt = opts.target ?? null, space = opts.space ?? 'world';
      // grabs and offers reach toward what the crosshair was on when there is no explicit target
      if (!tgt && this.lastFocus && this.time - this.lastFocus.t < 0.5 && (action === 'grab' || action === 'offer')) { tgt = this.lastFocus.point; space = 'world'; }
      if (tgt) {
        const p = space === 'view' ? this.viewToBody(tgt, new THREE.Vector3()) : this.worldToBody(tgt, new THREE.Vector3());
        if (p) {
          const hand = opts.hand ?? this.freeHand();
          const style: ReachStyle = opts.style ?? (action === 'press' ? 'press' : action === 'pull' ? 'pull' : action === 'grab' || action === 'offer' ? 'grab' : 'push');
          this.reachT = { p, hand, style };
        }
      }
    }
    if (this.inspecting && action !== 'drink' && action !== 'eat') this.setInspect(false);
    this.fireEvents(-1, 0);
  }
  get busy() { return this.action !== null; }

  /** which hand is free to reach: the left when the right holds something (Gacha Garage FPBody.freeHand) */
  freeHand(): 'L' | 'R' {
    const k = this.held;
    if (k === 'none' || k === 'flashlight') return 'R';
    return 'L';
  }

  private fireEvents(t0: number, t1: number) {
    if (!this.action) return;
    for (const [et, ev] of ACTIONS[this.action].events) if (et > t0 && et <= t1) this.emit(ev, { action: this.action, power: this.actionOpts.power, hand: this.reachT?.hand });
  }

  /** start / stop turning a small held item over in the hands (RMB) */
  setInspect(on: boolean) {
    if (on && (!this.hold.inspectable || this.dip || (this.action && this.action !== 'drink'))) return;
    if (on === this.inspecting) return;
    this.inspecting = on;
    if (on) { this.inspectRot.set(0.15, -0.35, 0); this.inspectZoom = 0; this.inspectIdle = 0; }
    const p = this.bind_?.player;
    if (p) p.lookLocked = on;
    this.emit(on ? 'inspect_start' : 'inspect_end');
  }

  /** turn the inspected item (mouse px) and zoom (wheel steps) */
  inspectTurn(dx: number, dy: number, wheel = 0) {
    const moved = Math.abs(dx) + Math.abs(dy) > 0.5;
    if (moved) this.inspectIdle = 0;
    this.inspectRot.y = THREE.MathUtils.clamp(this.inspectRot.y + dx * 0.008, -1.5, 1.5);
    this.inspectRot.x = THREE.MathUtils.clamp(this.inspectRot.x + dy * 0.008, -0.9, 1.1);
    if (wheel) this.inspectZoom = THREE.MathUtils.clamp(this.inspectZoom - wheel * 0.025, -0.06, 0.09);
  }

  /**
   * Where the arms draw a two-handed carry (camera space), so hands.ts can place / throw it from where it is seen.
   * Returns false when nothing is carried.
   */
  carryOffset(out: THREE.Matrix4): boolean {
    if (this.hold.side !== 'carry' || !this.hold.obj) return false;
    this.holders.carry.updateWorldMatrix(true, false);
    _m.copy(this.object.matrixWorld).invert();
    out.multiplyMatrices(_m, this.holders.carry.matrixWorld);
    return true;
  }

  // ------------------------------------------------------------------ space helpers
  private viewToBody(v: THREE.Vector3, out: THREE.Vector3) { return out.set(-v.x, v.y, -v.z).add(this.eye); }
  private worldToBody(w: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    const cam = this.bind_?.camera;
    if (!cam) return null;
    cam.updateMatrixWorld();
    out.copy(w).applyMatrix4(_m.copy(cam.matrixWorld).invert());
    return this.viewToBody(out, out);
  }

  // ------------------------------------------------------------------ held poses
  private tool(p: ArmsPose, pos: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3, lOff: number | null, gR = G_HANDLE, gL = G_HANDLE) {
    // the right socket at pos on the tool frame; the left socket lOff metres along the handle (null: left hand free)
    const q = toolQ(Y, Z);
    p.R.p.copy(pos); p.R.q.copy(q); p.R.grip = gR.slice(); p.R.w = 1;
    if (lOff !== null) {
      const lo = this.hold.lOff;
      const off = lo ? _x.set(lo.x, lOff, lo.z) : _x.set(0, lOff, 0);
      p.L.p.copy(pos).add(off.applyQuaternion(q)); p.L.q.copy(q); p.L.grip = gL.slice(); p.L.w = 1;
    }
  }
  private free(p: ArmsPose, side: 'L' | 'R', pos: THREE.Vector3, f: THREE.Vector3, n: THREE.Vector3, grip: number[]) {
    const h = p[side];
    h.p.copy(pos);
    // free hands are authored as palm socket frames too: from the hand frame (fingers f, palm n) to its socket
    const hq = handQ(side, f, n);
    h.q.copy(hq).multiply(this.sockets[side].quaternion);
    h.grip = grip.slice();
    h.w = 0;
  }
  /** a hand on an object-first hold: the socket frame from the object pose and the grip in its frame */
  private onObject(h: HandT, pose: THREE.Matrix4, g: THREE.Matrix4, grip = G_HANDLE) {
    _m.multiplyMatrices(pose, g);
    _m.decompose(h.p, h.q, _z);
    h.grip = grip.slice(); h.w = 1;
  }

  /**
   * Empty hands (Gacha Garage FPBody.freePose): relaxed and low in the corners, breathing; they swing with the
   * stride (left arm with the right foot) and pump as loose fists when you run; the free hand rises and opens a
   * little toward something you can take.
   */
  private freeHandPose(p: ArmsPose, side: 'L' | 'R', ready: THREE.Vector3 | null) {
    const e = this.eye;
    const sd = side === 'L' ? -1 : 1;                 // view-right sign
    const T = this.time;
    const br = Math.sin(T * 1.7 + (side === 'L' ? 0 : 0.7));
    const u = Math.PI * this.stepU();
    const sw = (side === 'L' ? -1 : 1) * Math.cos(u) * this.walkAmt;      // + forward
    const run = this.sprintK;
    const stepK = Math.abs(Math.sin(u)) * this.walkAmt;
    let x = sd * (0.27 - Math.max(0, sw) * 0.03), y = -0.4 + br * 0.004 + sw * 0.035 - stepK * 0.01, z = 0.4 + sw * 0.07;
    x = lerp(x, sd * 0.23, run); y = lerp(y, -0.4 + Math.max(0, sw) * 0.09 - stepK * 0.012, run); z = lerp(z, 0.38 + sw * 0.13, run);
    // looking down they drop out of view (the body's own arms hang at your sides there)
    y -= this.lookDownK * 0.24;
    let grip = G_RELAX.map((v, i) => lerp(v, G_FIST[i] * 0.95, run));
    let f = V(-sd * 0.25, -0.12 + sw * 0.25 + run * 0.3, 0.96), n = V(-sd * 0.9, 0.38, 0.05);
    if (ready) {
      x = ready.x; y = ready.y; z = ready.z;
      grip = [0.14, 0.12, 0.25, 0.3, 0.05];
      f = V(-sd * 0.2, 0.12, 1); n = V(-sd * 0.8, -0.15, 0.2);
    }
    this.free(p, side, V(x, y + LIFT, z).add(e), f, n, grip);
  }

  /** the pose for the current hold (body space, around the eye) */
  private buildHeldPose(p: ArmsPose) {
    const e = this.eye;
    const at = (x: number, y: number, z: number) => V(x, y + LIFT, z).add(e);
    const H = this.hold;
    p.clavL = 0; p.clavR = 0; p.vis = 1;
    const ready = this.readyTarget();
    const restL = () => this.freeHandPose(p, 'L', ready?.hand === 'L' ? ready.p : null);
    const restR = () => this.freeHandPose(p, 'R', ready?.hand === 'R' ? ready.p : null);
    const sprint = this.sprintK;
    const kind = H.kind;
    switch (kind) {
      case 'axe': case 'maul': {
        // across the body, head up and right, both hands on the handle, the edge facing the work; sprinting, the
        // head swings down and back across the body (port arms)
        const lo = kind === 'maul' ? -0.2 : -0.24;
        this.tool(p, at(0.24 - sprint * 0.05, -0.2 - sprint * 0.04, 0.5), V(0.74 - sprint * 0.2, 0.5 + sprint * 0.15, 0.3 - sprint * 0.35), V(-0.5, 0.3, 0.8), lo);
        break;
      }
      case 'hatchet':
        this.tool(p, at(0.2, -0.27, 0.42), V(0.12, 0.85, 0.5), V(-0.5, -0.3, 0.8), null);
        restL();
        break;
      case 'saw': case 'chainsaw':
        // a saw held out front, the blade level, the teeth down; the left hand rests
        this.tool(p, at(0.16, -0.27, 0.45), V(-0.15, 0.2, 0.97), V(0, -1, 0.1), null, G_HANDLE);
        restL();
        break;
      case 'bottle':
        // neck up, the label turned toward you, the body wrapped
        this.tool(p, at(0.17, -0.24, 0.4), V(-0.1, 0.97, -0.12), V(-0.75, 0.0, 0.65), null, G_BOTTLE);
        restL();
        break;
      case 'jerky': case 'book': case 'item': {
        const st = H.style;
        if (st === 'flat') {
          // held up on the palm facing you, fingers up the back, thumb on the front (a phone grip)
          this.free(p, 'R', at(0.15, -0.2, 0.38), V(-0.28, 0.92, 0.18), V(0.25, 0.1, -0.96), G_FLAT);
          p.R.w = 1;
        } else if (st === 'cradle') {
          // sitting on the upturned palm, fingers curled round it
          this.free(p, 'R', at(0.16, -0.23, 0.4), V(-0.45, 0.15, 0.88), V(-0.12, 0.95, -0.25), G_CUP);
          p.R.w = 1;
        } else if (st === 'wrap') {
          this.tool(p, at(0.16, -0.24, 0.4), V(-0.1, 0.97, -0.1), V(-0.75, 0.0, 0.65), null, G_BOTTLE);
        } else {
          // a stick-like thing: like the hatchet carry, a little lower
          this.tool(p, at(0.2, -0.28, 0.42), V(0.1, 0.8, 0.6), V(-0.55, -0.35, 0.75), null);
        }
        restL();
        break;
      }
      case 'flashlight':
        // the torch in the left hand, beam forward; the right hand free and relaxed
        p.L.p.copy(at(-0.2, -0.27, 0.52)); p.L.q.copy(toolQ(V(0.06, 0.08, 1), V(0.4, 0.9, 0.1))); p.L.grip = G_HANDLE.slice(); p.L.w = 1;
        restR();
        break;
      case 'two_hand': case 'rifle': case 'read': {
        const C = H.carry;
        if (!C) { restL(); restR(); break; }
        const pose = this.carryPose;
        if (kind === 'rifle') {
          _m.copy(C.pose);
          if (C.ads && this.aimK > 0.001) {
            const a = sm(this.aimK);
            const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), p1 = new THREE.Vector3(), q1 = new THREE.Quaternion();
            C.pose.decompose(p0, q0, _z); C.ads.decompose(p1, q1, _z);
            _m.compose(p0.lerp(p1, a), q0.slerp(q1, a), _z.set(1, 1, 1));
          }
          pose.copy(_m);
        } else if (kind === 'read') {
          // where the game holds it, in body space
          const o = H.obj!;
          o.updateWorldMatrix(true, false); this.mesh.updateWorldMatrix(true, false);
          pose.copy(this.mesh.matrixWorld).invert().multiply(o.matrixWorld).multiply(_m.copy(H.place).invert());
        } else pose.copy(C.pose);
        if (C.gR) this.onObject(p.R, pose, C.gR, kind === 'rifle' ? [0.85, 0.35, 0.85, 0, 0] : G_FLAT);
        if (C.gL) this.onObject(p.L, pose, C.gL, G_FLAT);
        p.clavL = p.clavR = kind === 'two_hand' ? 0.12 : 0.04;
        break;
      }
      case 'log': {
        // dragging a log by its near end: both fists low in front on the bark, side by side, leaning into it; looking
        // down (with a drag point) the fists go to the log itself
        const yy = -0.27 - sprint * 0.02;
        this.free(p, 'R', at(0.06, yy, 0.42), V(-0.25, -0.75, 0.6), V(-0.6, -0.35, -0.7), G_FIST);
        this.free(p, 'L', at(-0.06, yy, 0.42), V(0.25, -0.75, 0.6), V(0.6, -0.35, -0.7), G_FIST);
        if (this.dragK > 0.01) {
          const d = this.drag;
          for (const [sd, dx] of [['R', -0.07], ['L', 0.07]] as const) p[sd].p.lerp(_x.copy(d).add(_y.set(dx, 0.02, -0.05)), this.dragK);
        }
        p.clavL = 0.1; p.clavR = 0.1;
        break;
      }
      case 'drag':
        // dragging behind: the right fist low at the edge of the view, arm straight back, knuckles back; the left swings
        this.free(p, 'R', at(0.24, -0.27, 0.33), V(0.1, -0.8, -0.55), V(-0.95, 0.15, 0.1), G_FIST);
        restL();
        p.clavR = -0.08;
        break;
      default:
        restL(); restR();
        break;
    }
    if (kind === 'axe' || kind === 'maul' || kind === 'hatchet') {
      // the wind-up: the head swings back over the right shoulder as the charge builds
      const c = sm(cl(this.charge));
      if (c > 0.001) {
        const wind = newPose();
        if (kind === 'hatchet') this.tool(wind, at(0.3, -0.06, 0.22), V(0.3, 0.55, -0.78), V(-0.9, 0.1, -0.1), null);
        else this.tool(wind, at(0.3, -0.1, 0.36), V(0.5, 0.62, -0.6), V(-0.8, 0.45, 0.2), kind === 'maul' ? -0.2 : -0.24);
        if (kind === 'hatchet') { wind.L.p.copy(p.L.p); wind.L.q.copy(p.L.q); wind.L.grip = p.L.grip.slice(); wind.L.w = p.L.w; }
        wind.clavR = 0.18; wind.clavL = 0.1;
        mixPose(p, p, wind, c);
      }
    }
  }

  /** Gacha Garage readyTarget: aiming at something to take, the free hand rises a little and opens */
  private readyTarget(): { hand: 'L' | 'R'; p: THREE.Vector3 } | null {
    const hs = this.bind_?.hands;
    if (!hs?.focus || this.action || hs.held.kind !== 'none' && hs.held.kind !== 'tool' && hs.held.kind !== 'item') return null;
    const f = findInteractable(hs.focus.obj);
    if (!f || f.it.kind !== 'pickup') return null;
    const hand = this.freeHand();
    if (hand === 'L' && (this.held === 'axe' || this.held === 'maul' || this.held === 'saw' || this.held === 'rifle')) return null;
    const sd = hand === 'L' ? -1 : 1;
    const v = this.worldToBody(hs.focus.point, new THREE.Vector3());
    if (!v) return null;
    v.sub(this.eye).normalize();     // body-space direction
    return { hand, p: new THREE.Vector3(sd * 0.21 - v.x * 0.05, -0.3 + v.y * 0.04, 0.42) };
  }

  // ------------------------------------------------------------------ actions
  private actionPose(p: ArmsPose, base: ArmsPose, a: ArmsAction, t: number) {
    const e = this.eye;
    const at = (x: number, y: number, z: number) => V(x, y + LIFT, z).add(e);
    copyPose(p, base);
    const kind = this.hold.kind;
    const two = kind === 'axe' || kind === 'maul';
    const lOff = kind === 'maul' ? -0.2 : two ? -0.24 : null;
    switch (a) {
      case 'swing': {
        if (kind === 'saw' || kind === 'chainsaw') {
          // one push-pull stroke
          const k = Math.sin(cl(t / 0.62) * Math.PI * 2);
          p.R.p.add(V(0, 0, 0.14 * k)); p.L.p.add(V(0, 0, 0.14 * k));
          break;
        }
        // from the wind-up a fast arc to the strike, bite, rebound and settle; slower and lower for a weak swing
        const pow = 0.5 + 0.5 * (this.actionOpts.power ?? 1);
        const wind = newPose(), hit = newPose(), follow = newPose();
        if (kind === 'hatchet' || !two) {
          this.tool(wind, at(0.3, -0.06, 0.22), V(0.3, 0.55, -0.78), V(-0.9, 0.1, -0.1), null);
          this.tool(hit, at(0.04, -0.2, 0.5), V(-0.55, 0.15, 0.82), V(-0.75, -0.35, -0.55), null);
          this.tool(follow, at(-0.04, -0.3, 0.44), V(-0.7, -0.05, 0.7), V(-0.5, -0.6, -0.55), null);
          for (const q of [wind, hit, follow]) { q.L.p.copy(base.L.p); q.L.q.copy(base.L.q); q.L.grip = base.L.grip.slice(); q.L.w = base.L.w; }
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
          for (const q of [fol, over]) { q.L.p.copy(base.L.p); q.L.q.copy(base.L.q); q.L.grip = base.L.grip.slice(); q.L.w = base.L.w; }
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
        if (lOff === null) { hit.L.p.copy(base.L.p); hit.L.q.copy(base.L.q); hit.L.grip = base.L.grip.slice(); hit.L.w = base.L.w; }
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
        const lo = kind === 'maul' ? -0.16 : -0.22;
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
        // bottle frame at the lips: neck toward the mouth, tipping up as tilt grows; the socket sits on the body
        const Y = V(-0.12, lerp(0.75, -0.25, tilt), lerp(-0.65, -0.96, tilt));
        r.R.p.copy(mouth).add(_x.copy(Y).normalize().multiplyScalar(-0.1));
        r.R.q.copy(toolQ(Y, V(-0.9, 0.1, 0.2)));
        r.clavR = 0.08;
        mixPose(p, base, r, sm(raise));
        break;
      }
      case 'eat': {
        // bring it up to the mouth, three bites (a tug away after each), lower it
        const raise = track(t, [[0, 0], [0.5, 1], [1.8, 1], [2.2, 0]]);
        const r = newPose(); copyPose(r, base);
        const tug = Math.max(0, Math.sin((t - 0.7) * Math.PI / 0.45)) * (t > 0.7 && t < 1.95 ? 1 : 0);
        this.free(r, 'R', at(0.03, -0.17 - tug * 0.012, 0.2 + tug * 0.025), V(-0.4, 0.75, 0.5), V(0.1, 0.1, -1), base.R.grip);
        r.R.w = base.R.w;
        r.clavR = 0.06;
        mixPose(p, base, r, sm(raise));
        break;
      }
      case 'offer': {
        // hold it out on a flat palm, low and steady (an animal's height) toward the creature, then draw back
        const k = track(t, [[0, 0], [0.55, 1], [1.75, 1], [2.2, 0]]);
        const o = newPose(); copyPose(o, base);
        let at0 = at(0.06, -0.33, 0.58);
        if (this.reachT) at0 = this.capReach('R', this.reachT.p.clone().add(V(0, 0.1, -0.05)), 0.9);
        this.free(o, 'R', at0, V(-0.15, -0.08, 0.98), V(0.05, 0.98, 0.1), G_PALM_UP);
        o.R.w = base.R.w * 0.5;
        o.clavR = 0.05;
        mixPose(p, base, o, sm(k));
        const tremble = Math.sin(t * 13) * 0.003 * k;
        p.R.p.y += tremble;
        break;
      }
      case 'grab': {
        // reach out with an open hand (toward the thing when we know where it is), close on it, bring it back
        const reach = track(t, [[0, 0], [0.32, 1], [0.42, 0.95], [0.7, 0]]);
        const close = cl((t - 0.3) / 0.12);
        const o = newPose(); copyPose(o, base);
        const hand = this.reachT?.hand ?? 'R';
        const tgt = this.reachT ? this.capReach(hand, this.reachT.p, 0.85) : at(hand === 'R' ? 0.08 : -0.08, -0.2, 0.68);
        const sd = hand === 'R' ? 1 : -1;
        this.free(o, hand, tgt, V(-0.1 * sd, -0.25, 0.96), V(-0.8 * sd, -0.3, 0.2), G_OPEN);
        mixHand(p[hand], base[hand], o[hand], sm(reach));
        p[hand].grip = G_OPEN.map((v, i) => lerp(lerp(v, base[hand].grip[i], 1 - reach), G_FIST[i] * 0.85, close * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.1)));
        p[hand].w = base[hand].w * (1 - reach);
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
        p.R.w *= 1 - open * out;
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
      case 'reach': case 'press': case 'pull': {
        // Gacha Garage 'tap': the free hand goes out to the thing (only as far as the arm goes), presses / pushes /
        // pulls / turns it, and comes back
        const R = this.reachT;
        const hand = R?.hand ?? this.freeHand(), sd = hand === 'R' ? 1 : -1;
        const style: ReachStyle = R?.style ?? (a === 'press' ? 'press' : a === 'pull' ? 'pull' : 'push');
        const dur = ACTIONS[a].dur, tc = ACTIONS[a].events[0][0];
        const out = t < tc ? outCubic(t / tc) : 1 - sm((t - (dur - 0.3)) / 0.3);
        const tgt0 = R ? R.p.clone() : at(sd * 0.05, -0.1, 0.62);
        const sh = this.shoulder(hand);
        const dir = _y.copy(tgt0).sub(sh).normalize().clone();
        const o = newPose(); copyPose(o, base);
        let tgt: THREE.Vector3, grip = G_OPEN, f: THREE.Vector3, n: THREE.Vector3;
        const act = cl((t - tc) / 0.18) * (t < dur - 0.3 ? 1 : 1 - sm((t - (dur - 0.3)) / 0.15));
        if (style === 'press') {
          // index finger out: the fingertip, not the socket, lands on the target
          tgt = this.capReach(hand, tgt0.clone().addScaledVector(dir, -0.085 + act * 0.012), 0.95);
          f = dir.clone(); n = V(-sd * 0.25, -0.9, 0.1); grip = G_POINT;
        } else if (style === 'push') {
          // a flat palm on it (a door, a lid), leaning in a little
          tgt = this.capReach(hand, tgt0.clone().addScaledVector(dir, PALM_GAP - 0.01 + act * 0.03), 0.95);
          f = V(-sd * 0.15, 1, 0.1).addScaledVector(dir, -0.3); n = dir.clone(); grip = G_FLAT;
        } else {
          // grab a handle and pull it toward you (drawers, the stove door) or turn it (knobs)
          const pull = style === 'pull' ? act : 0;
          tgt = this.capReach(hand, tgt0.clone().addScaledVector(dir, 0.01 - pull * 0.09), 0.95);
          f = dir.clone().add(V(0, -0.3, 0)); n = V(-sd * 0.9, 0.0, -0.1);
          grip = t > tc - 0.04 ? G_FIST : G_OPEN;
          if (style === 'turn') n.applyAxisAngle(dir, -sd * act * 0.9);
        }
        this.free(o, hand, tgt, f, n, grip);
        mixHand(p[hand], base[hand], o[hand], out);
        if (hand === 'R' && this.hold.side === 'R') p.R.w *= 1 - out;
        p[hand === 'R' ? 'clavR' : 'clavL'] = lerp(base[hand === 'R' ? 'clavR' : 'clavL'], 0.06, out);
        break;
      }
      case 'fire': {
        // the rifle kicks back and up into the shoulder, then settles
        const k = Math.exp(-t * 14) * (1 - Math.exp(-t * 80));
        for (const s of ['L', 'R'] as const) { p[s].p.add(V(0.004 * k, 0.025 * k, -0.06 * k)); p[s].q.premultiply(_q1.setFromAxisAngle(_x.set(1, 0, 0), -0.12 * k)); }
        break;
      }
      case 'bolt': {
        // right hand off the wrist to the bolt handle: up, back, forward, down, back to the wrist
        const C = this.hold.carry;
        if (!C?.bolt) break;
        const lift = track(t, [[0, 0], [0.22, 1], [0.78, 1], [0.95, 0]]);
        const back = track(t, [[0, 0], [0.25, 0], [0.42, 1], [0.52, 1], [0.66, 0], [0.95, 0]]);
        const g = new THREE.Matrix4().compose(C.bolt.clone().add(new THREE.Vector3(0, 0.012 * lift, -0.075 * back)),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0.5)).multiply(this.sockets.R.quaternion), new THREE.Vector3(1, 1, 1));
        const o = newHand();
        this.onObject(o, this.carryPose, g, [0.6, 0.5, 0.85, 0, 0]);
        o.w = 0;
        mixHand(p.R, base.R, o, sm(lift));
        break;
      }
    }
  }

  private shoulder(hand: 'L' | 'R') { const r = this.dims.rest['uarm' + hand]; return _v3.set(r[0], r[1], r[2]); }
  /** never a stretched pole: anything farther than the arm reaches is brought back to `frac` of the arm's reach */
  private capReach(hand: 'L' | 'R', tgt: THREE.Vector3, frac: number): THREE.Vector3 {
    const sh = this.shoulder(hand).clone();
    const max = (this.dims.L.uarm + this.dims.L.farm) * frac + 0.04;
    const d = tgt.clone().sub(sh);
    if (d.length() > max) d.setLength(max);
    return sh.add(d);
  }

  /** player footstep phase (steps + phase), or our own cadence when unbound */
  private stepU(): number {
    const pl = this.bind_?.player;
    if (pl && pl.stepPhase !== undefined && pl.stepCount !== undefined) return pl.stepCount + pl.stepPhase;
    return this.walkPh / Math.PI;
  }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, s: ArmsInput) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const B = this.bind_, pl = B?.player;
    this.charge += ((this.held === 'axe' || this.held === 'maul' || this.held === 'hatchet' ? s.swingCharge : 0) - this.charge) * Math.min(1, dt * 14);
    this.crouchK += (((pl?.crouchK ?? (s.crouch ? 1 : 0))) - this.crouchK) * Math.min(1, dt * 10);
    this.shiverK += (s.shiver - this.shiverK) * Math.min(1, dt * 2);
    this.sprintK += ((s.sprint && s.speed > 2.6 ? 1 : 0) - this.sprintK) * Math.min(1, dt * 6);
    this.aimK += (cl(s.aim ?? 0) - this.aimK) * Math.min(1, dt * 9);
    const heavy = this.held === 'log' || this.held === 'two_hand' || this.held === 'maul' || this.held === 'drag';
    this.strain += ((heavy ? 1 : 0) - this.strain) * Math.min(1, dt * 3);
    // walk / run cycle from speed
    const sp = Math.max(0, s.speed);
    this.walkAmt += (Math.min(1.6, sp / 1.6) - this.walkAmt) * Math.min(1, dt * 6);
    this.walkPh += dt * (sp > 0.05 ? (s.sprint ? 7.6 : 5.6) * Math.min(1.25, 0.55 + sp * 0.28) : 0);
    // camera turn rates (measured from the player when bound)
    let yawRate = s.turnRate ?? 0;
    const pitch = pl ? pl.pitch : s.aimPitch;
    if (pl) {
      if (!Number.isNaN(this.lastYaw)) { let d = pl.yaw - this.lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yawRate = d / Math.max(1e-3, dt); }
      this.lastYaw = pl.yaw;
    }
    const pitchRate = (pitch - this.lastPitch) / Math.max(1e-3, dt);
    this.lastPitch = pitch;
    this.lookDownK += (sm((-0.35 - pitch) / 0.5) - this.lookDownK) * Math.min(1, dt * 8);
    // presence: coming back into view (the game hides empty hands) the hands rise from below
    if (this.object.visible && !this.wasVisible) this.presence = 0;
    this.wasVisible = this.object.visible;
    this.presence = Math.min(1, this.presence + dt / 0.4);
    // what the hands should react to by themselves
    if (B) this.auto(dt, s);
    else if (s.inspect !== undefined) this.setInspect(!!s.inspect);
    if (this.inspecting && s.lookDX !== undefined) this.inspectTurn(s.lookDX, s.lookDY ?? 0, s.wheel ?? 0);
    this.inspectK += ((this.inspecting ? 1 : 0) - this.inspectK) * Math.min(1, dt * 9);
    this.keyLight.intensity += ((this.inspecting ? 0.6 : 0) - this.keyLight.intensity) * Math.min(1, dt * 8);
    this.keyLight.visible = this.keyLight.intensity > 0.01;
    // log drag point (looking down at the log end)
    if (s.dragPoint) { this.viewToBody(s.dragPoint, this.drag); this.dragK += (this.lookDownK - this.dragK) * Math.min(1, dt * 6); }
    else this.dragK *= Math.exp(-dt * 6);

    // slot switch: dip out, swap at the bottom, rise
    let dipE = 0;
    if (this.dip) {
      const D = this.dip;
      D.t += dt;
      if (D.phase === 'out') {
        dipE = sm(D.t / 0.16);
        if (D.t >= 0.16) {
          D.old?.removeFromParent();
          const P = D.pending!;
          this.commit(P.kind, P.obj, P.opts);
          this.heldBlend = 1;
          this.buildHeldPose(this.heldPose);
          copyPose(this.prevHeld, this.heldPose);
          this.emit('held_swap');
          this.dip = { t: 0, phase: 'in', pending: null, old: null };
          dipE = 1;
        }
      } else {
        dipE = 1 - outCubic(D.t / 0.28);
        if (D.t >= 0.28) this.dip = null;
      }
    }
    dipE = Math.max(dipE, 1 - outCubic(this.presence));

    // held pose (+ wind-up), blended in after a change of held item
    this.buildHeldPose(this.heldPose);
    if (this.gripDirty) this.solveGrips();
    let base = this.heldPose;
    if (this.heldBlend < 1) {
      this.heldBlend = Math.min(1, this.heldBlend + dt / 0.35);
      mixPose(this.basePose, this.prevHeld, this.heldPose, sm(this.heldBlend));
      base = this.basePose;
    }
    // action
    let pose = base;
    if (this.action) {
      const def = ACTIONS[this.action];
      const t0 = this.actionT;
      this.actionT += dt;
      this.fireEvents(t0, this.actionT);
      this.actionPose(this.actPose, base, this.action, Math.min(this.actionT, def.dur));
      if (this.actionT >= def.dur) { this.action = null; this.reachT = null; }
      pose = this.actPose;
    }
    const P = this.outPose;
    if (pose !== P) copyPose(P, pose);
    // inspect: the right hand brings the item to the middle and turns it over; the left comes up under it
    if (this.inspectK > 0.001 && this.hold.side === 'R' && this.hold.shape) this.inspectPose(P, dt);

    // procedural layers (body space offsets applied to both hands)
    const off = _x.set(0, 0, 0);
    const T = this.time;
    const breathK = 0.6 + s.breath * 1.6;
    const br = Math.sin(T * (1.6 + s.breath * 2.2)) * 0.005 * breathK * (1 - this.inspectK * 0.7);
    off.add(V(Math.sin(T * 0.7) * 0.003 + Math.sin(T * 0.31) * 0.002, br + Math.sin(T * 0.53) * 0.002, 0));
    // carrying strain: a heavy, slightly trembling hold that sags as breath runs out
    if (this.strain > 0.01) {
      const tr = (Math.sin(T * 23) * 0.5 + Math.sin(T * 31) * 0.5) * 0.0025 * this.strain * (0.6 + s.breath);
      off.add(V(tr, -0.02 * this.strain * s.breath + tr, 0));
    }
    // look lag, footstep bob, strafe tilt, landing (fp/motion.ts)
    const mass = this.hold.mass;
    let fwd = sp, side = 0, vy = 0, grounded = true, step = -1, foot = 1, footfall = 0, land = 0;
    if (pl) {
      const sy = Math.sin(pl.yaw), cy = Math.cos(pl.yaw), v = pl.vel;
      fwd = -(v.x * sy + v.z * cy); side = v.x * cy - v.z * sy; vy = pl.grounded ? 0 : v.y; grounded = pl.grounded;
      if (pl.stepPhase !== undefined && pl.stepCount !== undefined) {
        step = pl.stepPhase; foot = pl.stepCount % 2 ? 1 : -1;
        if (this.stepCountPrev >= 0 && pl.stepCount !== this.stepCountPrev) footfall = Math.min(1, Math.hypot(fwd, side) / 2.5);
        this.stepCountPrev = pl.stepCount;
      }
      land = pl.landImpulse ?? 0;
    }
    const swingy = this.action === 'swing' || this.action === 'split' || this.action === 'miss' ? 0.3 : 1;
    this.motion.update({
      dt, yawRate: yawRate * (1 - this.inspectK), pitchRate: pitchRate * (1 - this.inspectK), fwd: fwd * swingy, side: side * swingy, vy, grounded, sprint: this.sprintK > 0.5,
      crouch: this.crouchK, step, foot, footfall: footfall * swingy, land, mass: this.held === 'none' ? 0.4 : mass, aim: Math.max(this.aimK, this.inspectK * 0.8),
    });
    const M = this.motion;
    // view-space motion -> body space: x flips, z flips (body +z is the camera's -z)
    off.add(_v1.set(-M.pos.x, M.pos.y, -M.pos.z));
    off.y -= dipE * 0.32;
    off.z += dipE * 0.04;
    _q2.setFromEuler(M.rot);
    if (dipE > 0) _q2.multiply(_q3.setFromAxisAngle(_v2.set(1, 0, 0), -dipE * 0.45));
    const qm = _q1.copy(PI_Q).multiply(_q2).multiply(_q3.copy(PI_Q).invert());
    for (const sd of ['L', 'R'] as const) {
      P[sd].p.sub(this.eye).applyQuaternion(qm).add(this.eye).add(off);
      P[sd].q.premultiply(qm);
    }
    // object-first holds: the object rides the same motion on its own weighted spring, the hands stay on it
    const Hd = this.hold;
    if (Hd.carry && Hd.side === 'carry' && Hd.kind !== 'read') {
      const cp = this.carryPose;
      const pp = new THREE.Vector3(), pq = new THREE.Quaternion();
      cp.decompose(pp, pq, _z);
      if (this.action === 'fire') { const k = Math.exp(-this.actionT * 14) * (1 - Math.exp(-this.actionT * 80)); pp.add(V(0.004 * k, 0.025 * k, -0.06 * k)); pq.premultiply(_q4.setFromAxisAngle(_v2.set(1, 0, 0), -0.12 * k)); }
      pp.sub(this.eye).applyQuaternion(qm).add(this.eye).add(off);
      pq.premultiply(qm);
      this.springObj(pp, pq, dt, mass);
      cp.compose(this.sp.O, this.sq.O, _z.set(1, 1, 1));
      for (const sd of ['L', 'R'] as const) {
        const g = sd === 'R' ? Hd.carry.gR : Hd.carry.gL;
        if (!g || (sd === 'R' && this.action === 'bolt')) continue;
        const h = newHand(); this.onObject(h, cp, g, P[sd].grip);
        const k = this.action === 'reach' || this.action === 'press' || this.action === 'pull' ? 1 - (this.reachT?.hand === sd ? sm(cl(this.actionT / 0.3)) : 0) : 1;
        P[sd].p.lerp(h.p, k); P[sd].q.slerp(h.q, k);
      }
      if (Hd.own) { this.holders.carry.matrix.multiplyMatrices(cp, Hd.place); this.holders.carry.matrixWorldNeedsUpdate = true; }
    }
    // shiver: a fast irregular tremor, shoulders hunched, fingers twitching
    const shiv = [0, 0];
    if (this.shiverK > 0.01) {
      const k = this.shiverK;
      for (const [sd, ph] of [['L', 0], ['R', 1.7]] as const) {
        const tr = V(Math.sin(T * 41 + ph) * 0.004 + Math.sin(T * 67 + ph * 2) * 0.003, Math.sin(T * 53 + ph) * 0.004, 0).multiplyScalar(k);
        P[sd].p.add(tr);
        shiv[sd === 'L' ? 0 : 1] = k;
      }
      P.clavL += 0.1 * k; P.clavR += 0.1 * k;
    }

    // springs on the targets: weight and a little overshoot; fast strikes ride a stiffer spring; hands on an
    // object-first hold stay glued to it
    const fast = this.action === 'swing' || this.action === 'split' || this.action === 'chop_recover' || this.action === 'miss' || this.action === 'fire';
    const glued = Hd.side === 'carry';
    const wom = 22 / Math.sqrt(1 + mass * 0.12);
    for (const sd of ['L', 'R'] as const) {
      const om = fast ? 55 : glued ? 70 : wom, z = fast ? 0.9 : glued ? 1 : 0.72;
      if (this.first) { this.sp[sd].copy(P[sd].p); this.sq[sd].copy(P[sd].q); this.sv[sd].set(0, 0, 0); continue; }
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) {
        const acc = _z.copy(P[sd].p).sub(this.sp[sd]).multiplyScalar(om * om).addScaledVector(this.sv[sd], -2 * z * om);
        this.sv[sd].addScaledVector(acc, h);
        this.sp[sd].addScaledVector(this.sv[sd], h);
      }
      // wrist lag: the hand's orientation trails a little behind its position
      this.sq[sd].slerp(P[sd].q, 1 - Math.exp(-dt * (fast ? 40 : glued ? 50 : 14 / Math.sqrt(1 + mass * 0.1))));
    }
    // fingers: the classic grip channels, blended toward the solved wrap on the held object
    for (const sd of ['L', 'R'] as const) {
      const want = gripOf(P[sd].grip, _f1);
      const sol = this.hold.solved[sd];
      if (sol && P[sd].w > 0.001) mixFingers(want, want, sol, cl(P[sd].w));
      if (shiv[sd === 'L' ? 0 : 1] > 0) for (let i = 0; i < 12; i++) want[i] += shiv[sd === 'L' ? 0 : 1] * (0.12 + Math.sin(T * 47 + i) * 0.04);
      const cur = this.sfing[sd];
      if (this.first) cur.set(want);
      else mixFingers(cur, cur, want, 1 - Math.exp(-dt * 18));
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
      this.ik.armIK(sd, wrist, hq, 1);
      applyFingers(b, sd, this.sfing[sd]);
    }
    // the carry anchor (legacy: objects parented to it by older code ride between the palms)
    this.carry.position.set(0, 0, 0);
    this.mesh.updateMatrixWorld(true);
    // the first-person body
    if (this.body && B?.player && B.camera) {
      const bp = B.player;
      const armsShown = this.object.visible && !(this.held === 'none' && !this.action && this.lookDownK > 0.5);
      this.mesh.visible = !(this.held === 'none' && !this.action && this.lookDownK > 0.9);
      this.body.update(dt, {
        pos: bp.pos, yaw: bp.yaw, pitch: bp.pitch, vel: bp.vel, crouch: bp.crouchK ?? (bp.crouch ? 1 : 0), grounded: bp.grounded,
        step: bp.stepPhase ?? -1, steps: bp.stepCount ?? 0, camera: B.camera, armsShown: armsShown && bp.enabled, armBones: this.bones,
      });
      if (!bp.enabled) this.body.root.visible = false;
    }
  }

  /** inspect: the item to the middle of the view, turned by the mouse, zoomed by the wheel, idly spinning */
  private inspectPose(P: ArmsPose, dt: number) {
    const k = sm(this.inspectK), H = this.hold;
    this.inspectIdle += dt;
    if (this.inspecting && this.inspectIdle > 1.2) this.inspectRot.y = Math.sin((this.inspectIdle - 1.2) * 0.6) * 0.9;
    const s = H.shape!;
    // object centre in the right socket's frame
    const cS = s.center.clone().applyMatrix4(H.place);
    const big = Math.max(s.size.x, s.size.y, s.size.z);
    const C = V(0.01, -0.03 + LIFT * 0, 0.2 + big * 0.9 + this.inspectZoom).add(this.eye);
    // base orientation: the item's grip frame turned to face you (the hold's own orientation, levelled), then the
    // mouse rotation about the view axes
    const q0 = toolQ(V(-0.15, 0.95, -0.1), V(-0.85, 0, 0.5));
    if (H.style === 'flat') q0.copy(handQ('R', V(-0.2, 0.95, 0.1), V(0.15, 0.1, -1))).multiply(this.sockets.R.quaternion);
    if (H.style === 'cradle') q0.copy(handQ('R', V(-0.35, 0.3, 0.88), V(-0.1, 0.95, -0.3))).multiply(this.sockets.R.quaternion);
    const r = this.inspectRot;
    const qr = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, -r.y, 0, 'YXZ'));
    const q = qr.multiply(q0);
    const pR = C.clone().sub(cS.clone().applyQuaternion(q));
    const ins = newHand();
    ins.p.copy(pR); ins.q.copy(q); ins.grip = P.R.grip.slice(); ins.w = P.R.w;
    mixHand(P.R, P.R, ins, k);
    // the left hand comes up under it, palm up, fingertips just touching
    const L = newPose();
    const under = C.clone().add(V(-0.05, -big * 0.5 - 0.05, -0.02));
    this.free(L, 'L', under, V(0.55, 0.25, 0.8), V(0.15, 1, -0.1), G_CUP);
    mixHand(P.L, P.L, L.L, k * 0.9);
    P.clavR = lerp(P.clavR, 0.05, k);
  }

  /** the object-first hold's own weighted spring */
  private springObj(p: THREE.Vector3, q: THREE.Quaternion, dt: number, mass: number) {
    if (this.first || this.sp.O.lengthSq() === 0) { this.sp.O.copy(p); this.sq.O.copy(q); this.sv.O.set(0, 0, 0); return; }
    const om = 20 / Math.sqrt(1 + mass * 0.12), z = 0.7;
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const acc = _z.copy(p).sub(this.sp.O).multiplyScalar(om * om).addScaledVector(this.sv.O, -2 * z * om);
      this.sv.O.addScaledVector(acc, h);
      this.sp.O.addScaledVector(this.sv.O, h);
    }
    this.sq.O.slerp(q, 1 - Math.exp(-dt * 16 / Math.sqrt(1 + mass * 0.1)));
  }

  /** close each hand's fingers on the held object's real surface (fp/grip.ts) */
  private solveGrips() {
    this.gripDirty = false;
    const H = this.hold;
    H.solved = { L: null, R: null };
    if (!H.obj || !H.shape) return;
    const pose = this.heldPose;
    const T = (h: HandT) => new THREE.Matrix4().compose(h.p, h.q, new THREE.Vector3(1, 1, 1));
    for (const sd of ['L', 'R'] as const) {
      const opts = H.wrap[sd];
      if (!opts) continue;
      // object local -> this hand's socket
      let toSock: THREE.Matrix4 | null = null;
      if (H.side === sd) toSock = H.place.clone();
      else if (H.side === 'R' && sd === 'L' && H.lOff) toSock = T(pose.L).invert().multiply(T(pose.R)).multiply(H.place);
      else if (H.side === 'carry' && H.carry) {
        const g = sd === 'R' ? H.carry.gR : H.carry.gL;
        if (g) toSock = g.clone().invert().multiply(H.place);
      }
      if (!toSock) continue;
      const sock = this.sockets[sd];
      sock.updateMatrix();
      const toHand = sock.matrix.clone().multiply(toSock).multiply(new THREE.Matrix4().makeScale(H.obj.scale.x, H.obj.scale.y, H.obj.scale.z));
      const hs = this.dims.hand;
      const S = sampleSurface(H.obj, toHand, new THREE.Vector3(0, -0.06 * hs, 0), 0.14);
      const a = gripOf([0.04, 0.04, 0.1, opts.maxCurl !== undefined && opts.maxCurl < 0.8 ? 0.1 : 0.04, 0]);
      if (S.count > 0) solveWrap(S, this.dims, sd, a, opts);
      if (H.kind === 'rifle' && sd === 'R') { a[0] = 0.5; a[1] = 0.7; a[2] = 0.35; }       // trigger finger along the guard
      H.solved[sd] = a;
    }
  }

  /** bound mode: watch the hands and the input for things the arms should do by themselves (FPBody.updateFlags) */
  private auto(dt: number, s: ArmsInput) {
    const B = this.bind_!, hs = B.hands;
    void dt;
    if (hs?.focus) {
      const f = findInteractable(hs.focus.obj);
      this.lastFocus = { point: hs.focus.point.clone(), kind: f?.it.kind ?? '', t: this.time };
    }
    if (B.auto === false) { if (s.inspect !== undefined) this.setInspect(!!s.inspect); return; }
    // RMB with nothing in focus: turn a small held item over in the hands (not while carrying: RMB throws)
    const canInspect = this.hold.inspectable && !hs?.focus && (hs ? hs.held.kind === 'item' : true) && this.object.visible;
    const want = s.inspect ?? (input.held('Mouse2') && canInspect);
    this.setInspect(!!want && canInspect);
    if (this.inspecting) {
      this.inspectTurn(s.lookDX ?? input.mouseDX, s.lookDY ?? input.mouseDY, s.wheel ?? input.wheel);
    }
    // E / LMB on a thing: the free hand reaches out to it (decided after hands.update has done its thing)
    if (hs?.focus && !this.action && !this.dip && (input.pressed('KeyE') || input.pressed('Mouse0'))) {
      const f = findInteractable(hs.focus.obj);
      const kind = f?.it.kind;
      const busyCarry = hs.held.kind === 'carry' || hs.held.kind === 'drag';
      const toolSwing = (this.held === 'axe' || this.held === 'maul' || this.held === 'hatchet') && input.pressed('Mouse0') && !['door', 'drawer', 'register', 'switch', 'board', 'paper', 'stove', 'container'].includes(kind ?? '');
      if (kind && !busyCarry && !toolSwing) {
        const style: ReachStyle | null = kind === 'door' || kind === 'container' ? 'push' : kind === 'drawer' || kind === 'stove' ? 'pull'
          : kind === 'switch' || kind === 'register' ? 'press' : kind === 'board' || kind === 'paper' || kind === 'block' ? 'grab' : null;
        if (style) this.play(style === 'press' ? 'press' : style === 'pull' ? 'pull' : 'reach', { target: hs.focus.point, space: 'world', style });
      }
    }
  }
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _f1 = new Float32Array(NF);

/** analyse() in the frame the object will be drawn in (its own scale kept, its own rotation / position dropped) */
function analyseScaled(obj: THREE.Object3D, sc: THREE.Vector3): ObjShape {
  const s = analyse(obj);
  if (Math.abs(sc.x - 1) + Math.abs(sc.y - 1) + Math.abs(sc.z - 1) < 1e-6) return s;
  for (const p of s.pts) p.multiply(sc);
  s.box.min.multiply(sc); s.box.max.multiply(sc);
  s.box.getSize(s.size); s.box.getCenter(s.center);
  return s;
}

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
