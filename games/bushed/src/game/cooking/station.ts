// Close-up work stations (the stove top, the forge): the shared frame. A station takes over the camera (it eases
// from the player's eye down to a framed view of the work and back), gives the player a cursor (mouse deltas
// move it, like the backpack pointer), the player's own hands in the world (StationHands, posed onto the tools
// and the food), a hover label beside whatever the cursor is on, and a small particle system for fat spit,
// scale flakes and drips that land on surfaces. Subclasses fill in simulate() (always runs: a pan left on the
// stove keeps cooking) and work() (only while the player is at the station).
//
// Controls everywhere: mouse moves the cursor, LMB does the thing under it (hold / drag where it makes sense),
// RMB is the secondary action, S or Escape steps back.
import * as THREE from 'three';
import type { Game } from '../game';
import { input } from '../../core/input';
import { hud } from '../../ui/hud';
import { floatText } from '../../ui/float';
import { StationHands } from './hands';

export interface StationView {
  /** camera position (world) */
  pos: THREE.Vector3;
  /** look-at point (world) */
  look: THREE.Vector3;
  fov?: number;
}

/** the pointer as the station sees it: normalised device coords, buttons with edges */
export interface Pointer {
  x: number; y: number;
  down: boolean; pressed: boolean; released: boolean;
  rdown: boolean; rpressed: boolean; rreleased: boolean;
  /** cursor movement this frame (NDC) */
  dx: number; dy: number;
}

/** scripted pointer for tests: when set, replaces the mouse */
export interface PointerScript { x: number; y: number; down: boolean; rdown?: boolean }

const ease = (t: number) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------------------------- late UI hook
// game.update hides the dot and clears the label when the mode isn't 'walk'; stations draw theirs after it.
const lateHooks = new WeakMap<Game, ((dt: number) => void)[]>();
export function onLate(g: Game, f: (dt: number) => void): void {
  let list = lateHooks.get(g);
  if (!list) {
    list = [];
    lateHooks.set(g, list);
    const ext = g as unknown as { lateUpdaters?: ((dt: number) => void)[] };
    if (Array.isArray(ext.lateUpdaters)) ext.lateUpdaters.push((dt) => { for (const h of list!) h(dt); });
    else {
      const base = g.update.bind(g);
      const L = list;
      g.update = (dt: number) => { base(dt); const d = Math.max(0, Math.min(0.1, dt)); for (const h of L) h(d); };
    }
  }
  list.push(f);
}

export abstract class Station {
  readonly hands = new StationHands();
  /** 'off' walking around, 'in' easing to the work, 'on' at the work, 'out' easing back to the eye */
  phase: 'off' | 'in' | 'on' | 'out' = 'off';
  /** test hook: drive the pointer from a script */
  script: PointerScript | null = null;
  readonly ptr: Pointer = { x: 0, y: -0.15, down: false, pressed: false, released: false, rdown: false, rpressed: false, rreleased: false, dx: 0, dy: 0 };
  protected view: StationView = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 52 };
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private fov = 68;
  private from = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 68 };
  private k = 0;
  private grace = 0;
  private wasLocked = false;
  private prevHeld: string | null = null;
  private stand: { x: number; z: number; yaw: number } | null = null;
  private ray = new THREE.Raycaster();
  private lookOff = new THREE.Vector2();
  private lastScript: PointerScript | null = null;
  /** hover label (text + world point) drawn by the late UI pass */
  protected label: { text: string; at: THREE.Vector3 } | null = null;
  /** cursor dot visible */
  protected showCursor = true;
  /** the camera drifts a little toward the cursor (presence); 0 disables */
  protected parallax = 0.05;

  /** a soft work light riding with the eye while at a station (the hearth and the lamp aren't enough to read food by) */
  protected fill = new THREE.PointLight(0xffe0c0, 0, 2.6, 1.6);
  protected fillLevel = 0.9;

  constructor(protected g: Game) {
    g.camera.add(this.hands.object);
    this.fill.position.set(0.15, 0.25, 0.1);
    g.camera.add(this.fill);
    g.updaters.push((dt) => this.tick(dt));
    onLate(g, (dt) => this.late(dt));
  }

  get active(): boolean { return this.phase !== 'off'; }

  /** world simulation (runs whether or not the player is here) */
  protected abstract simulate(dt: number): void;
  /** input and hands while at the station */
  protected abstract work(dt: number): void;
  /** called once the camera starts easing in */
  protected onEnter(): void {}
  /** called when the player steps back */
  protected onExit(): void {}
  /** where the player stands when leaving (world x, z and yaw) */
  protected abstract standSpot(): { x: number; z: number; yaw: number };

  /** put the player at the station's standing spot, facing the work (dev pages, tests) */
  standAt(): void {
    const s = this.standSpot();
    this.g.player.teleport(s.x, null, s.z, s.yaw);
    this.g.player.pitch = -0.35;
  }

  /** step up to the work */
  enter(): boolean {
    const g = this.g;
    if (this.active || g.mode !== 'walk') return false;
    if (g.hands.busy) { hud.say('<i>Hands are full.</i>', 2); return false; }
    this.prevHeld = g.hands.heldItem || null;
    if (this.prevHeld) g.hands.equip(null);
    this.from.pos.copy(g.camera.position);
    this.from.q.copy(g.camera.quaternion);
    this.from.fov = g.camera.fov;
    this.camPos.copy(g.camera.position);
    this.camLook.copy(g.camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion));
    this.fov = g.camera.fov;
    this.phase = 'in';
    this.k = 0;
    this.grace = 0.35;
    this.wasLocked = input.locked;
    this.ptr.x = 0; this.ptr.y = -0.12;
    g.mode = 'cutscene';
    this.hands.object.visible = true;
    this.hands.snap();
    this.stand = this.standSpot();
    this.onEnter();
    return true;
  }

  /** step back from the work */
  exit(): void {
    if (this.phase === 'off' || this.phase === 'out') return;
    const g = this.g;
    this.onExit();
    this.phase = 'out';
    this.k = 0;
    // the eye we return to: standing at the station's spot, facing the work
    const st = this.stand ?? this.standSpot();
    g.player.teleport(st.x, null, st.z, st.yaw);
    g.player.pitch = -0.35;
    this.from.pos.copy(this.camPos);
    this.from.q.copy(g.camera.quaternion);
    this.from.fov = g.camera.fov;
    this.label = null;
  }

  /** move the camera to another framing of the work (eases there) */
  setView(v: StationView): void {
    this.view.pos.copy(v.pos); this.view.look.copy(v.look);
    if (v.fov) this.view.fov = v.fov;
  }

  // ------------------------------------------------------------------------------------------ per frame
  private tick(dt: number): void {
    this.simulate(dt);
    const fk = this.phase === 'on' || this.phase === 'in' ? this.fillLevel : 0;
    this.fill.intensity += (fk - this.fill.intensity) * Math.min(1, dt * 3);
    if (this.phase === 'off') return;
    const g = this.g, cam = g.camera;
    this.readPointer(dt);
    if (this.phase === 'in') {
      this.k = Math.min(1, this.k + dt / 0.85);
      const e = ease(this.k);
      this.camPos.copy(this.from.pos).lerp(this.view.pos, e);
      cam.position.copy(this.camPos);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(this.view.pos, this.view.look, new THREE.Vector3(0, 1, 0)));
      cam.quaternion.copy(this.from.q).slerp(q, e);
      cam.fov = THREE.MathUtils.lerp(this.from.fov, this.view.fov ?? 52, e);
      cam.updateProjectionMatrix();
      this.camLook.copy(this.view.look);
      if (this.k >= 1) this.phase = 'on';
      this.hands.update(dt, cam);
      return;
    }
    if (this.phase === 'out') {
      this.k = Math.min(1, this.k + dt / 0.7);
      const e = ease(this.k);
      const eye = g.player.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(g.player.pitch, g.player.yaw, 0, 'YXZ'));
      cam.position.copy(this.from.pos).lerp(eye, e);
      cam.quaternion.copy(this.from.q).slerp(q, e);
      cam.fov = THREE.MathUtils.lerp(this.from.fov, 68, e);
      cam.updateProjectionMatrix();
      this.hands.rest('L'); this.hands.rest('R');
      this.hands.update(dt, cam);
      if (this.k >= 1) {
        this.phase = 'off';
        this.hands.object.visible = false;
        g.mode = 'walk';
        cam.fov = 68; cam.updateProjectionMatrix();
        if (this.prevHeld && g.owns(this.prevHeld)) g.hands.equip(this.prevHeld);
      }
      return;
    }
    // at the work: the camera glides between framings and leans a touch toward the cursor
    const kk = 1 - Math.exp(-dt * 5);
    this.camPos.lerp(this.view.pos, kk);
    this.camLook.lerp(this.view.look, kk);
    this.lookOff.x += (this.ptr.x * this.parallax - this.lookOff.x) * Math.min(1, dt * 3);
    this.lookOff.y += (this.ptr.y * this.parallax * 0.6 - this.lookOff.y) * Math.min(1, dt * 3);
    this.fov += ((this.view.fov ?? 52) - this.fov) * kk;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.rotateY(-this.lookOff.x);
    cam.rotateX(this.lookOff.y);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
    this.grace -= dt;
    const back = input.pressed('KeyS') || input.pressed('Escape') || (this.wasLocked && !input.locked);
    if (back && this.grace <= 0) { this.exit(); this.hands.update(dt, cam); return; }
    if (this.grace <= 0) this.work(dt);
    else { this.ptr.pressed = this.ptr.rpressed = false; }
    this.hands.update(dt, cam);
  }

  private readPointer(_dt: number): void {
    const p = this.ptr;
    const px = p.x, py = p.y;
    const wasDown = p.down, wasR = p.rdown;
    if (this.script) {
      p.x = this.script.x; p.y = this.script.y;
      p.down = this.script.down; p.rdown = !!this.script.rdown;
      this.lastScript = this.script;
    } else {
      if (this.lastScript) { this.lastScript = null; p.down = p.rdown = false; }
      p.x = THREE.MathUtils.clamp(p.x + input.mouseDX * 0.0024, -0.96, 0.96);
      p.y = THREE.MathUtils.clamp(p.y - input.mouseDY * 0.0034, -0.94, 0.94);
      p.down = input.held('Mouse0');
      p.rdown = input.held('Mouse2');
    }
    p.pressed = p.down && !wasDown;
    p.released = !p.down && wasDown;
    p.rpressed = p.rdown && !wasR;
    p.rreleased = !p.rdown && wasR;
    p.dx = p.x - px; p.dy = p.y - py;
  }

  /** the pointer ray against a set of objects */
  pick(objects: THREE.Object3D[], recursive = true): THREE.Intersection | null {
    const cam = this.g.camera;
    cam.updateMatrixWorld(true);
    this.ray.setFromCamera(new THREE.Vector2(this.ptr.x, this.ptr.y), cam);
    this.ray.far = 4;
    // things moved this frame: bring their matrices up to date before testing
    for (const o of objects) o.updateWorldMatrix(true, true);
    const hits = this.ray.intersectObjects(objects, recursive);
    for (const h of hits) if (h.object.visible || (h.object as THREE.Mesh).userData.pickProxy) return h;
    return null;
  }

  /** the pointer ray as a world ray */
  pointerRay(): THREE.Ray {
    const cam = this.g.camera;
    cam.updateMatrixWorld(true);
    this.ray.setFromCamera(new THREE.Vector2(this.ptr.x, this.ptr.y), cam);
    return this.ray.ray.clone();
  }

  /** where the pointer ray meets a horizontal plane at height y (world) */
  pointerOnPlane(y: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const r = this.pointerRay();
    const t = (y - r.origin.y) / (r.direction.y || -1e-6);
    if (t < 0 || t > 6) return null;
    return out.copy(r.origin).addScaledVector(r.direction, t);
  }

  /** where the pointer ray meets an arbitrary plane */
  pointerOn(plane: THREE.Plane, out = new THREE.Vector3()): THREE.Vector3 | null {
    return this.pointerRay().intersectPlane(plane, out);
  }

  /** world point -> NDC */
  ndc(p: THREE.Vector3): THREE.Vector2 {
    const v = p.clone().project(this.g.camera);
    return new THREE.Vector2(v.x, v.y);
  }

  protected say(t: string, dur = 3): void { hud.say(`<i>${t}</i>`, dur); }
  protected pop(t: string, at: THREE.Vector3, color?: string): void { floatText.pop(t, at, color); }

  private late(_dt: number): void {
    if (this.phase !== 'on') { if (this.phase !== 'off') { floatText.label('', null); hud.showDot(false); } return; }
    hud.dotAt(this.ptr.x, this.ptr.y);
    hud.showDot(this.showCursor);
    if (this.label) floatText.label(this.label.text, this.label.at);
    else floatText.label('', null);
  }

  /** restore the dot to the centre when nothing uses it */
  protected centreDot(): void { hud.dotAt(0, 0); }
}

// ---------------------------------------------------------------------------------------------- bits
/**
 * Small station particles that land on surfaces and stay a while: fat spit on the stove plate, mill scale on the
 * anvil face, water drips. Each particle is a tiny square card (pixel), coloured per particle. floor(p) gives the
 * height of the surface under a point (or -Infinity for no surface: it falls through and dies).
 */
interface Bit { p: THREE.Vector3; v: THREE.Vector3; c: THREE.Color; s: number; life: number; stay: number; landed: boolean; floor: (p: THREE.Vector3) => number; glow: number; flat: boolean; rot: number }

export class Bits {
  readonly mesh: THREE.InstancedMesh;
  private list: Bit[] = [];
  private dummy = new THREE.Object3D();
  private cam: THREE.Camera | null = null;
  constructor(max = 500) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.renderOrder = 4;
  }
  setCamera(c: THREE.Camera): void { this.cam = c; }
  emit(p: THREE.Vector3, v: THREE.Vector3, o: { color: THREE.Color; size?: number; life?: number; stay?: number; spread?: number; n?: number; floor?: (p: THREE.Vector3) => number; glow?: number; flat?: boolean }): void {
    const n = o.n ?? 1;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= (this.mesh.instanceMatrix.count ?? 500)) this.list.shift();
      const sp = o.spread ?? 0.3;
      this.list.push({
        p: p.clone(), v: v.clone().add(new THREE.Vector3((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp * 0.5, (Math.random() - 0.5) * sp)),
        c: o.color.clone().multiplyScalar(0.85 + Math.random() * 0.3), s: (o.size ?? 0.004) * (0.6 + Math.random() * 0.8),
        life: (o.life ?? 1.5) * (0.7 + Math.random() * 0.6), stay: o.stay ?? 0, landed: false, floor: o.floor ?? (() => -Infinity),
        glow: o.glow ?? 0, flat: o.flat ?? false, rot: Math.random() * 6.28,
      });
    }
  }
  update(dt: number): void {
    let n = 0;
    const max = this.mesh.instanceMatrix.count;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (!b.landed) {
        b.life -= dt;
        b.v.y -= 9.81 * dt;
        b.v.multiplyScalar(1 - dt * 0.8);
        b.p.addScaledVector(b.v, dt);
        const f = b.floor(b.p);
        if (b.p.y <= f) {
          if (b.stay > 0) { b.landed = true; b.p.y = f + 0.0006; b.life = b.stay; }
          else { this.list.splice(i, 1); continue; }
        }
        if (b.life <= 0) { this.list.splice(i, 1); continue; }
      } else {
        b.life -= dt;
        if (b.life <= 0) { this.list.splice(i, 1); continue; }
      }
      if (n >= max) continue;
      this.dummy.position.copy(b.p);
      if (b.landed || b.flat) this.dummy.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, b.rot));
      else if (this.cam) this.dummy.quaternion.copy(this.cam.quaternion);
      const fade = b.landed ? Math.min(1, b.life / 2) : 1;
      this.dummy.scale.setScalar(b.s * (b.landed ? 1.3 : 1) * Math.max(0.3, fade));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      const c = b.c.clone();
      if (b.glow > 0) c.multiplyScalar(1 + b.glow * 3 * (b.landed ? fade * 0.3 : 1));
      this.mesh.setColorAt(n, c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear(pred?: (p: THREE.Vector3) => boolean): void { this.list = pred ? this.list.filter((b) => !pred(b.p)) : []; }
}

// ---------------------------------------------------------------------------------------------- misc
/** remove interactables another module registered under an object (we replace them) */
export function clearInteractables(root: THREE.Object3D, key = '__interact'): number {
  let n = 0;
  root.traverse((o) => { if (o.userData[key]) { delete o.userData[key]; n++; } });
  return n;
}

/** an invisible pick proxy mesh (raycastable, never drawn) */
export function proxy(geo: THREE.BufferGeometry): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
  m.userData.pickProxy = true;
  return m;
}
