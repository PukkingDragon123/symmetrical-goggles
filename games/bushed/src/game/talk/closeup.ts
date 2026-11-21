// The dialogue camera. Talking to someone eases the camera off your shoulder into a close-up of their face: a long
// lens, a slow push-in, the edges going dark and soft (vignette, shallow depth of field), letterbox bars. A cryptid's
// "thought" cuts to a dark, tight shot of the creature's face for a beat, its eyes catching the light, then snaps
// back. Presentation after the conversation framing of the author's own game หลอนยันปลายทาง
// (effective-octo-train/src/game/Cinematic.js converse(), src/game/Dialogue.js).
import * as THREE from 'three';
import type { Game } from '../game';
import type { HumanModel } from '../../humans';
import { heightAt } from '../../world/layout';
import { input } from '../../core/input';
import { physics } from '../../physics/physics';

const css = `
#talk-fx { position: fixed; inset: 0; pointer-events: none; z-index: 20; opacity: 0; }
#talk-fx .vig { position: absolute; inset: 0; background: radial-gradient(ellipse 62% 58% at 50% 46%, rgba(0,0,0,0) 38%, rgba(4,3,2,.55) 70%, rgba(2,1,1,.94) 100%); }
#talk-fx.creature .vig { background: radial-gradient(ellipse 52% 50% at 50% 48%, rgba(0,0,0,0) 34%, rgba(3,2,2,.7) 70%, rgba(0,0,0,.97) 96%); }
#talk-fx .dof { position: absolute; inset: 0; backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
#talk-fx .bar { position: absolute; left: 0; right: 0; height: 0; background: #000; }
#talk-fx .bar.t { top: 0; } #talk-fx .bar.b { bottom: 0; }
#hotbar, #hud-dot, #hud-label { transition: opacity .3s; }
body.talk-closeup #hotbar, body.talk-closeup #hud-dot, body.talk-closeup #hud-label, body.talk-closeup .bobj { opacity: 0 !important; }
`;

type Subject =
  | { kind: 'person'; model: HumanModel; side: number }
  | { kind: 'creature'; obj: THREE.Object3D; head: THREE.Object3D; size: number; fx: { shine: { value: number } } | null };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class CloseUp {
  phase: 'off' | 'in' | 'hold' | 'out' = 'off';
  /** the eye point being framed (world), valid while active */
  readonly focus = new THREE.Vector3();
  /** called when the player presses E / clicks during a person close-up (next line) */
  onAdvance: (() => void) | null = null;
  /** called when the close-up ends, early or not */
  onEnd: (() => void) | null = null;
  private subj: Subject | null = null;
  private k = 0;
  private t = 0;
  private holdFor = 0;
  private dur = { in: 0.8, out: 0.7 };
  private from = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 68 };
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private wasLocked = false;
  private grace = 0;
  private baseVig: number | null = null;
  private root: HTMLDivElement | null = null;
  private dof: HTMLDivElement | null = null;
  private bars: HTMLDivElement[] = [];
  private lastMask = '';
  private lastE = 0;
  private losT = 0;
  private clear = 1;
  private bodyCls = false;
  /** the shallow depth of field (a blurred overlay masked around the face); off on the low preset */
  dofEnabled = true;

  constructor(private g: Game) {}

  get active(): boolean { return this.phase !== 'off'; }
  get blend(): number { return this.phase === 'off' ? 0 : ease(this.k); }
  get isCreature(): boolean { return this.subj?.kind === 'creature'; }

  /** ease into a person's face; holds until release() */
  person(model: HumanModel, o: { side?: number } = {}): boolean {
    if (!this.begin()) return false;
    this.subj = { kind: 'person', model, side: o.side ?? (Math.random() < 0.5 ? -1 : 1) };
    this.dur = { in: 0.85, out: 0.75 };
    this.holdFor = Infinity;
    this.aim(0, true);
    return true;
  }

  /** a cryptid's face for a beat (seconds), then back */
  creature(obj: THREE.Object3D, o: { head?: THREE.Object3D | null; fx?: { shine: { value: number } } | null; hold?: number; size?: number } = {}): boolean {
    if (!this.begin()) return false;
    const head = o.head ?? findHead(obj) ?? obj;
    let size = o.size ?? 0;
    if (!size) { const b = new THREE.Box3().setFromObject(obj); size = b.isEmpty() ? 1.5 : b.getSize(_v).length(); }
    this.subj = { kind: 'creature', obj, head, size: THREE.MathUtils.clamp(size, 0.4, 6), fx: o.fx ?? null };
    this.dur = { in: 0.28, out: 0.4 };
    this.holdFor = o.hold ?? 1.6;
    this.aim(0, true);
    return true;
  }

  /** jump straight into the framed shot (tests, screenshots) */
  snap(): void {
    if (this.phase === 'off' || !this.subj) return;
    this.phase = 'hold'; this.k = 1; this.t = Math.max(this.t, 1.5);
    this.aim(0, true);
    this.update(0);
  }

  /** ease back to the player's eyes */
  release(): void {
    if (this.phase === 'off' || this.phase === 'out') return;
    this.phase = 'out';
    // blend back from wherever the camera is now
    this.k = 1;
  }

  private begin(): boolean {
    const g = this.g;
    if (this.phase !== 'off' || g.mode !== 'walk') return false;
    this.mount();
    const cam = g.camera;
    this.from.pos.copy(cam.position); this.from.q.copy(cam.quaternion); this.from.fov = cam.fov;
    this.phase = 'in'; this.k = 0; this.t = 0; this.grace = 0.35;
    this.wasLocked = input.locked;
    g.mode = 'cutscene';
    return true;
  }

  private mount(): void {
    if (this.root || typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const r = (this.root = document.createElement('div'));
    r.id = 'talk-fx';
    this.dof = document.createElement('div'); this.dof.className = 'dof';
    const vig = document.createElement('div'); vig.className = 'vig';
    const bt = document.createElement('div'); bt.className = 'bar t';
    const bb = document.createElement('div'); bb.className = 'bar b';
    this.bars = [bt, bb];
    r.append(this.dof, vig, bt, bb);
    document.body.appendChild(r);
  }

  /** where the camera wants to be this frame (camPos, camLook) and its lens */
  private aim(dt: number, snap = false): number {
    const s = this.subj!, g = this.g;
    let fov: number;
    // where the player stands (their eyes), not where the camera happens to be
    const eyeP = _d.copy(g.player.pos); eyeP.y += 1.6;
    if (s.kind === 'person') {
      const m = s.model, sc = m.height / 1.75;
      // the eyes sit a little above the head joint; the face points the way the body does (the head turns to you)
      m.bones.head.getWorldPosition(_v);
      this.focus.copy(_v).addScaledVector(UP, 0.085 * sc);
      const yaw = m.root.rotation.y;
      _f.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.focus.addScaledVector(_f, 0.04 * sc);
      _d.copy(eyeP).sub(this.focus); _d.y = 0; _d.normalize();
      const dir = _f.dot(_d) < -0.2 ? _f.copy(_d) : _f.lerp(_d, 0.5).normalize();
      _s.crossVectors(dir, UP).normalize().multiplyScalar(0.15 * s.side * sc);
      const push = THREE.MathUtils.lerp(1.0, 0.7, ease(Math.min(1, this.t / 7))) * sc;
      const want = _v.copy(this.focus).addScaledVector(dir, push).add(_s);
      want.y -= 0.035 * sc;
      want.y = Math.max(want.y, heightAt(want.x, want.z) + 0.4);
      this.clearSight(want, dt, snap);
      // aim a little under the eyes: the face sits high in the frame, the mouth clear of the subtitles
      const look = _f.copy(this.focus).addScaledVector(_s, -0.25); look.y -= 0.075 * sc;
      fov = THREE.MathUtils.lerp(34, 29, ease(Math.min(1, this.t / 7)));
      this.track(want, look, dt, snap, 6);
    } else {
      s.head.getWorldPosition(this.focus);
      s.obj.getWorldDirection(_f); _f.y = 0;
      if (_f.lengthSq() < 1e-4) _f.set(0, 0, 1);
      _f.normalize();
      _d.copy(eyeP).sub(this.focus); _d.y = 0; _d.normalize();
      const dir = _f.dot(_d) < -0.3 ? _d : _f.multiplyScalar(0.55).addScaledVector(_d, 0.45).normalize();
      const dist = THREE.MathUtils.clamp(s.size * 0.75, 1.1, 3.6) * THREE.MathUtils.lerp(1, 0.86, Math.min(1, this.t / this.holdFor));
      // from a little above: low heads hide in reeds and ferns
      const want = _v.copy(this.focus).addScaledVector(dir, dist);
      want.y += 0.3 * dist + 0.15;
      want.y = Math.max(want.y, heightAt(want.x, want.z) + 1.1);
      this.clearSight(want, dt, snap);
      fov = THREE.MathUtils.lerp(24, 19, Math.min(1, this.t / Math.max(0.5, this.holdFor)));
      this.track(want, this.focus, dt, snap, 14);
    }
    return fov;
  }

  /** a counter, a shelf, a wall or a trunk between the face and the lens pulls the camera in (checked 5x a second) */
  private clearSight(want: THREE.Vector3, dt: number, snap: boolean): void {
    this.losT -= dt;
    if (snap || this.losT <= 0) {
      this.losT = 0.2;
      _w.copy(want).sub(this.focus);
      const L = _w.length();
      if (L < 1e-3) return;
      _w.multiplyScalar(1 / L);
      let hit = null;
      try { hit = physics.ray(this.focus, _w, L); } catch { hit = null; }
      this.clear = hit ? Math.max(0.3, hit.toi - 0.12) / L : 1;
    }
    if (this.clear < 1) want.sub(this.focus).multiplyScalar(this.clear).add(this.focus);
  }

  private track(pos: THREE.Vector3, look: THREE.Vector3, dt: number, snap: boolean, rate: number): void {
    if (snap) { this.camPos.copy(pos); this.camLook.copy(look); return; }
    const k = 1 - Math.exp(-dt * rate);
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
  }

  /** late update: after the world moved, before the frame renders */
  update(dt: number): void {
    if (this.phase === 'off' || !this.subj) { this.fx(0); return; }
    const g = this.g, cam = g.camera;
    this.t += dt;
    const fov = this.aim(dt);
    if (this.phase === 'in') { this.k = Math.min(1, this.k + dt / this.dur.in); if (this.k >= 1) this.phase = 'hold'; }
    else if (this.phase === 'out') this.k = Math.max(0, this.k - dt / this.dur.out);
    else if (this.t > this.holdFor + this.dur.in) this.release();
    const e = ease(this.k);
    _m.lookAt(this.camPos, this.camLook, UP);
    _q.setFromRotationMatrix(_m);
    cam.position.copy(this.from.pos).lerp(this.camPos, e);
    cam.quaternion.copy(this.from.q).slerp(_q, e);
    const f = THREE.MathUtils.lerp(this.from.fov, fov, e);
    if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
    // the viewmodel stays out of the shot
    const arms = g.arms as unknown as { object?: THREE.Object3D } | null;
    if (arms?.object && e > 0.02) arms.object.visible = false;
    // a cryptid: darker, eyes catching the light
    if (this.subj.kind === 'creature') {
      g.R.grade.exposure *= 1 - 0.15 * e;
      g.R.grade.saturation *= 1 - 0.3 * e;
      if (this.subj.fx) this.subj.fx.shine.value = Math.max(this.subj.fx.shine.value, 1.8 * e);
    }
    this.fx(e);
    // input: E / click for the next line, step away (WASD, Esc, losing the mouse) to leave
    if (this.phase === 'hold' && this.subj.kind === 'person') {
      this.grace -= dt;
      if (this.grace <= 0) {
        if (input.pressed('KeyE') || input.pressed('Mouse0') || input.pressed('Space')) this.onAdvance?.();
        else if (input.pressed('Escape') || input.pressed('KeyW') || input.pressed('KeyS') || input.pressed('KeyA') || input.pressed('KeyD') || (this.wasLocked && !input.locked)) this.release();
      }
    }
    if (this.phase === 'out' && this.k <= 0) this.end();
  }

  private end(): void {
    const g = this.g, cam = g.camera;
    cam.position.copy(this.from.pos); cam.quaternion.copy(this.from.q); cam.fov = this.from.fov; cam.updateProjectionMatrix();
    this.phase = 'off';
    this.subj = null;
    if (g.mode === 'cutscene') g.mode = 'walk';
    this.fx(0);
    const cb = this.onEnd; this.onEnd = null; this.onAdvance = null;
    cb?.();
  }

  /** the overlay: vignette, depth of field around the face, letterbox, a darker grade */
  private fx(e: number): void {
    const g = this.g;
    if (e > 0) { if (this.baseVig === null) this.baseVig = g.R.grade.vignette; g.R.grade.vignette = this.baseVig + e * (this.isCreature ? 0.6 : 0.4); }
    else if (this.baseVig !== null) { g.R.grade.vignette = this.baseVig; this.baseVig = null; }
    if (e === 0 && this.lastE === 0) return;
    this.lastE = e;
    const cls = e > 0.05;
    if (cls !== this.bodyCls && typeof document !== 'undefined') {
      this.bodyCls = cls;
      // the HUD steps out of the shot (the hotbar, the dot, the label, the objective)
      document.body.classList.toggle('talk-closeup', cls);
      for (const el of document.querySelectorAll<HTMLElement>('#hotbar, #hud-dot, #hud-label, .bobj, .bobjm')) el.style.visibility = cls ? 'hidden' : '';
    }
    if (!this.root) return;
    this.root.style.opacity = e.toFixed(3);
    this.root.className = this.isCreature ? 'creature' : '';
    const bh = (e * (this.isCreature ? 11 : 8)).toFixed(2) + 'vh';
    for (const b of this.bars) if (b.style.height !== bh) b.style.height = bh;
    if (this.dof) {
      const on = this.dofEnabled && e > 0.01;
      this.dof.style.display = on ? '' : 'none';
      if (on) {
        _v.copy(this.focus).project(g.camera);
        const x = ((_v.x * 0.5 + 0.5) * 100).toFixed(1), y = ((-_v.y * 0.5 + 0.5) * 100).toFixed(1);
        const r = this.isCreature ? '30% 34%' : '24% 34%';
        const mask = `radial-gradient(ellipse ${r} at ${x}% ${y}%, transparent 45%, black 100%)`;
        if (mask !== this.lastMask) { this.lastMask = mask; this.dof.style.maskImage = mask; this.dof.style.setProperty('-webkit-mask-image', mask); }
      }
    }
  }
}

/** a creature's head: a bone or object named like one */
export function findHead(obj: THREE.Object3D): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  obj.traverse((o) => { if (!best && /^head$/i.test(o.name)) best = o; });
  if (!best) obj.traverse((o) => { if (!best && /head|skull/i.test(o.name)) best = o; });
  return best;
}
