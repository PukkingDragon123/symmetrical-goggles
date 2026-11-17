// Hands: what the player holds and how they touch the world.
//   - focus: the interactable under the crosshair (pencilled label, E / LMB to use)
//   - carry: light things go into the hands (viewmodel, drawn over the world, no hovering), one or two hands
//   - drag:  heavy logs stay physical; a spherical joint ties the near end to a kinematic hand anchor
//   - place (LMB on a surface while carrying), drop (Q), throw (RMB), rotate (R + mouse)
//   - tools: 1 axe, 2 hatchet, 3 saw/maul, 4 flashlight, 0 empty; LMB hold = wind-up, release = swing
import * as THREE from 'three';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { input } from '../core/input';
import { findInteractable, type InteractCtx } from '../game/interact';
import { WoodPiece } from '../chop/wood';
import { marks } from '../world/marks';
import { ITEMS, type ToolStats } from '../game/items';

export interface ArmsLike {
  object: THREE.Object3D;
  setHeld(kind: string, obj?: THREE.Object3D): void;
  play(action: string, opts?: unknown): void;
  update(dt: number, s: Record<string, number | boolean>): void;
  socket(hand: 'L' | 'R'): THREE.Object3D;
  onEvent(cb: (e: string) => void): void;
}

export interface HandsGame {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  view: THREE.Scene;
  viewCam: THREE.PerspectiveCamera;
  player: { pos: THREE.Vector3; burden: number; speed: number; sprinting: boolean; crouch: boolean; pitch: number; yaw: number; addShake(a: number): void };
  arms: ArmsLike | null;
  stamina: () => number;
  spendStamina: (a: number) => void;
  sound: (id: string, pos?: THREE.Vector3, vol?: number, rate?: number) => void;
  swing: (tool: ToolStats, charge: number, origin: THREE.Vector3, dir: THREE.Vector3, swingDir: THREE.Vector3) => void;
  toolModel: (itemId: string) => THREE.Object3D | null;
  useItem: (itemId: string, target: { obj: THREE.Object3D | null; point: THREE.Vector3 | null }) => boolean;
  hint: (text: string) => void;
  owns: (itemId: string) => boolean;
  game: any;
}

type Held =
  | { kind: 'none' }
  | { kind: 'tool'; item: string; obj: THREE.Object3D | null }
  | { kind: 'item'; item: string; obj: THREE.Object3D | null }
  | { kind: 'carry'; obj: THREE.Object3D; piece?: WoodPiece; mass: number; two: boolean; restore: () => void; offset: THREE.Matrix4 }
  | { kind: 'drag'; obj: THREE.Object3D; piece: WoodPiece; anchor: RAPIER.RigidBody; joint: RAPIER.ImpulseJoint };

const TOOL_KEYS: Record<string, string[]> = {
  Digit1: ['axe_felling', 'axe_old', 'axe_splitting'], Digit2: ['hatchet'], Digit3: ['maul', 'bucksaw', 'axe_splitting'], Digit4: ['flashlight'],
};

export class Hands {
  held: Held = { kind: 'none' };
  focus: { obj: THREE.Object3D; label: string; point: THREE.Vector3 } | null = null;
  charge = 0;
  charging = false;
  private swingT = -1;
  private swingStats: { tool: ToolStats; charge: number } | null = null;
  private ray = new THREE.Raycaster();
  private rotX = 0;
  private rotY = 0;
  private g: HandsGame;
  private lastDrag: THREE.Vector3 | null = null;
  /** objects the interaction ray should test (scene by default) */
  targets: THREE.Object3D[] = [];

  constructor(g: HandsGame) {
    this.g = g;
    g.arms?.onEvent((e) => { if (e === 'impact') this.impact(); });
  }

  get heldItem(): string {
    const h = this.held;
    return h.kind === 'tool' || h.kind === 'item' ? h.item : h.kind === 'carry' && h.piece ? 'wood' : h.kind === 'drag' ? 'log' : '';
  }

  get busy(): boolean { return this.held.kind === 'carry' || this.held.kind === 'drag'; }

  private ctx(point: THREE.Vector3): InteractCtx { return { held: this.heldItem, point, game: this.g.game }; }

  equip(item: string | null): void {
    if (this.busy) return;
    this.clearHeldVisual();
    if (!item) { this.held = { kind: 'none' }; this.g.arms?.setHeld('none'); return; }
    const def = ITEMS[item];
    const obj = this.g.toolModel(item);
    if (def?.tool) {
      this.held = { kind: 'tool', item, obj };
      const k = def.tool.kind === 'splitter' ? 'axe' : def.tool.kind === 'chainsaw' ? 'saw' : def.tool.kind;
      this.g.arms?.setHeld(k, obj ?? undefined);
    } else {
      this.held = { kind: 'item', item, obj };
      this.g.arms?.setHeld(item === 'flashlight' ? 'flashlight' : item === 'beer' ? 'bottle' : item === 'jerky' ? 'jerky' : 'item', obj ?? undefined);
    }
    this.g.sound('equip', undefined, 0.5);
  }

  private clearHeldVisual(): void {
    const h = this.held;
    if ((h.kind === 'tool' || h.kind === 'item') && h.obj) h.obj.removeFromParent();
  }

  /** pick up a world object (called by WoodPiece / prop interactables) */
  grab(obj: THREE.Object3D, piece?: WoodPiece, mass = piece?.mass ?? 5): void {
    if (this.busy) return;
    if (piece && piece.body && mass > 32) return this.startDrag(obj, piece);
    this.clearHeldVisual();
    const parent = obj.parent;
    const body = piece?.body ?? null;
    if (piece) physics.unsync(piece.body!), piece.despawn();
    const two = mass > 6;
    // pose in camera space
    const off = new THREE.Matrix4();
    const len = piece ? piece.len : 0.3;
    if (two) {
      // across both forearms, chest height
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
      off.compose(new THREE.Vector3(0, -0.42, -0.62 - Math.min(0.2, (piece?.r ?? 0.1))), q, new THREE.Vector3(1, 1, 1));
    } else {
      off.compose(new THREE.Vector3(0.24, -0.3, -0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.4, 0.1)), new THREE.Vector3(1, 1, 1));
    }
    void len;
    obj.removeFromParent();
    this.g.view.add(obj);
    obj.matrixAutoUpdate = true;
    off.decompose(obj.position, obj.quaternion, obj.scale);
    this.held = {
      kind: 'carry', obj, piece, mass, two, offset: off,
      restore: () => { if (!piece && parent) parent.add(obj); void body; },
    };
    this.rotX = this.rotY = 0;
    this.g.arms?.setHeld(two ? 'two_hand' : 'item', two ? undefined : obj);
    this.g.arms?.play('grab');
    this.g.player.burden = Math.min(0.75, mass / 60);
    this.g.sound(piece ? 'wood_pickup' : 'pickup', undefined, 0.6);
  }

  private startDrag(obj: THREE.Object3D, piece: WoodPiece): void {
    const body = piece.body!;
    // grab the end nearest the player
    const t = body.translation(), r = body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const c = new THREE.Vector3(t.x, t.y, t.z);
    const e1 = c.clone().addScaledVector(ax, piece.len / 2), e2 = c.clone().addScaledVector(ax, -piece.len / 2);
    const near = e1.distanceTo(this.g.player.pos) < e2.distanceTo(this.g.player.pos) ? 1 : -1;
    const localEnd = new THREE.Vector3(0, (near * piece.len) / 2 * 0.92, 0);
    const handW = this.handAnchorWorld();
    const anchor = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(handW.x, handW.y, handW.z));
    const jd = RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: localEnd.x, y: localEnd.y, z: localEnd.z });
    const joint = physics.world.createImpulseJoint(jd, anchor, body, true);
    body.setAngularDamping(2.5);
    this.held = { kind: 'drag', obj, piece, anchor, joint };
    this.g.arms?.setHeld('log');
    this.g.arms?.play('grab');
    this.g.player.burden = THREE.MathUtils.clamp(piece.mass / 300, 0.25, 0.85);
    this.g.sound('log_lift', handW, 0.7);
  }

  private handAnchorWorld(): THREE.Vector3 {
    const cam = this.g.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
    return this.g.player.pos.clone().addScaledVector(f, 0.9).add(new THREE.Vector3(0, 0.75, 0));
  }

  /** world transform of a carried (viewmodel) object */
  private carriedWorld(obj: THREE.Object3D): { p: THREE.Vector3; q: THREE.Quaternion } {
    obj.updateMatrixWorld();
    const m = new THREE.Matrix4().multiplyMatrices(this.g.camera.matrixWorld, obj.matrixWorld);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    return { p, q };
  }

  /** release what we carry: drop where it is, place at a surface point, or throw */
  release(mode: 'drop' | 'place' | 'throw', at?: THREE.Vector3): void {
    const h = this.held;
    if (h.kind === 'drag') {
      this.lastDrag = null;
      physics.world.removeImpulseJoint(h.joint, true);
      physics.world.removeRigidBody(h.anchor);
      h.piece.body?.setAngularDamping(0.25);
      this.g.sound('log_thud', h.piece.mesh.position, 0.6);
    } else if (h.kind === 'carry') {
      const { p, q } = this.carriedWorld(h.obj);
      h.obj.removeFromParent();
      if (mode === 'place' && at) {
        p.copy(at);
        // stand rounds on end, lay logs flat, keep the yaw
        const yaw = this.g.player.yaw;
        if (h.piece && (h.piece.kind === 'round' || h.piece.kind === 'half')) {
          q.setFromEuler(new THREE.Euler(0, yaw, 0));
          p.y += h.piece.len / 2 + 0.01;
        } else if (h.piece) {
          q.setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2));
          p.y += (h.piece.r ?? 0.1) + 0.01;
        } else p.y += 0.02;
      }
      const v = new THREE.Vector3();
      if (mode === 'throw') v.set(0, 0, -1).applyQuaternion(this.g.camera.quaternion).multiplyScalar(Math.max(2, 9 - h.mass * 0.4)).add(new THREE.Vector3(0, 1.5, 0));
      if (h.piece) {
        this.g.game.chop?.group.add(h.obj);
        h.piece.spawn(p, q, v);
      } else {
        h.restore();
        h.obj.position.copy(p); h.obj.quaternion.copy(q);
        (h.obj.userData.onRelease as ((p: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3) => void) | undefined)?.(p, q, v);
      }
      this.g.sound(mode === 'place' ? 'place_wood' : 'drop', p, 0.5);
    } else return;
    this.held = { kind: 'none' };
    this.g.player.burden = 0;
    this.g.arms?.setHeld('none');
    this.g.arms?.play('drop');
  }

  /** take a carried wood piece away (stacking, burning, selling) */
  consumeCarried(): WoodPiece | null {
    const h = this.held;
    if (h.kind !== 'carry') return null;
    h.obj.removeFromParent();
    this.held = { kind: 'none' };
    this.g.player.burden = 0;
    this.g.arms?.setHeld('none');
    return h.piece ?? null;
  }

  private impact(): void {
    if (!this.swingStats) return;
    const cam = this.g.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const swingDir = dir.clone().add(new THREE.Vector3(0, -0.6 * (this.g.player.pitch < -0.3 ? 1.6 : 0.6), 0)).normalize();
    this.g.swing(this.swingStats.tool, this.swingStats.charge, cam.position.clone(), dir, swingDir);
    this.swingStats = null;
  }

  update(dt: number): void {
    const g = this.g, cam = g.camera;
    // tool hotkeys
    for (const [k, list] of Object.entries(TOOL_KEYS)) if (input.pressed(k)) {
      const it = list.find((i) => g.owns(i));
      if (it) this.equip(this.heldItem === it ? null : it);
    }
    if (input.pressed('Digit0')) this.equip(null);

    // focus ray
    const origin = cam.position.clone(), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.ray.set(origin, dir);
    this.ray.far = 3;
    this.focus = null;
    const hits = this.ray.intersectObjects(this.targets.length ? this.targets : [g.scene], true);
    let surface: THREE.Vector3 | null = null;
    for (const h of hits) {
      if (!h.object.visible) continue;
      if (!surface) surface = h.point.clone();
      const f = findInteractable(h.object);
      if (f) {
        const reach = f.it.reach ?? 2.2;
        if (h.distance <= reach) {
          const label = f.it.label(this.ctx(h.point));
          this.focus = { obj: f.obj, label, point: h.point.clone() };
        }
        break;
      }
      if (h.distance > 0.2) break;
    }

    const h = this.held;
    // carrying
    if (h.kind === 'carry') {
      if (input.held('KeyR')) { this.rotY += input.mouseDX * 0.01; this.rotX += input.mouseDY * 0.01; input.mouseDX = 0; input.mouseDY = 0; }
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      h.offset.decompose(p, q, s);
      const sway = Math.sin(performance.now() * 0.006) * 0.008 * Math.min(1, g.player.speed / 2);
      h.obj.position.copy(p).add(new THREE.Vector3(sway, -Math.abs(sway) * 0.6 - h.mass * 0.0015, 0));
      h.obj.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rotX, this.rotY, 0)));
      g.spendStamina(dt * h.mass * 0.0006);
      const pid = h.obj.userData.itemId as string | undefined;
      if (input.pressed('KeyQ')) this.release('drop');
      else if (input.pressed('KeyB') && !h.piece && pid && ITEMS[pid]?.pocket) {
        h.obj.removeFromParent();
        this.held = { kind: 'none' };
        this.g.player.burden = 0;
        this.g.arms?.setHeld('none');
        this.g.game.pocket?.(pid, h.obj);
      }
      else if (input.pressed('Mouse2') && h.mass < 15) this.release('throw');
      else if ((input.pressed('Mouse0') || input.pressed('KeyE')) && this.focus && findInteractable(this.focus.obj)?.it.kind !== 'pickup') {
        findInteractable(this.focus.obj)!.it.use(this.ctx(this.focus.point));
      } else if (input.pressed('Mouse0') && surface && surface.distanceTo(origin) < 2.6) this.release('place', surface);
      return;
    }
    if (h.kind === 'drag') {
      const a = this.handAnchorWorld();
      h.anchor.setNextKinematicTranslation({ x: a.x, y: a.y, z: a.z });
      // the far end gouges a drag mark through the litter
      const b = h.piece.body;
      if (b) {
        const t = b.translation(), r = b.rotation();
        const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        const c = new THREE.Vector3(t.x, t.y, t.z);
        const e1 = c.clone().addScaledVector(ax, h.piece.len / 2), e2 = c.clone().addScaledVector(ax, -h.piece.len / 2);
        const tail = e1.distanceTo(a) > e2.distanceTo(a) ? e1 : e2;
        if (!this.lastDrag || this.lastDrag.distanceTo(tail) > 0.25) {
          if (this.lastDrag) marks.line(2, this.lastDrag.x, this.lastDrag.z, tail.x, tail.z, h.piece.r * 1.2, 0.18);
          this.lastDrag = tail.clone();
        }
      }
      g.spendStamina(dt * 0.025 * (h.piece.mass / 100));
      if (g.stamina() <= 0.01) { g.hint('Too winded to keep hauling'); this.release('drop'); return; }
      if (input.pressed('KeyQ') || input.pressed('KeyE') || input.pressed('Mouse2')) this.release('drop');
      return;
    }

    // using the focused interactable
    if (input.pressed('KeyE') && this.focus) {
      const f = findInteractable(this.focus.obj);
      f?.it.use(this.ctx(this.focus.point));
      return;
    }
    if (input.pressed('Mouse2') && this.focus) {
      const f = findInteractable(this.focus.obj);
      if (f?.it.alt) { f.it.alt(this.ctx(this.focus.point)); return; }
    }

    // tools: charge and swing
    if (h.kind === 'tool') {
      const tool = ITEMS[h.item].tool!;
      if (this.swingT >= 0) {
        this.swingT += dt;
        if (this.swingStats && !g.arms && this.swingT >= tool.swingTime * 0.45) this.impact();
        if (this.swingT > tool.swingTime + 0.25) this.swingT = -1;
      } else if (input.held('Mouse0') && g.stamina() > 0.02) {
        this.charging = true;
        this.charge = Math.min(1, this.charge + dt / (tool.swingTime * 1.1));
      } else if (this.charging) {
        this.charging = false;
        const c = Math.max(0.2, this.charge);
        this.charge = 0;
        this.swingT = 0;
        this.swingStats = { tool, charge: c * (0.6 + 0.4 * Math.min(1, g.stamina() * 2)) };
        g.spendStamina(tool.stamina * (0.4 + 0.6 * c));
        g.arms?.play('swing', { charge: c });
        g.sound('axe_whoosh', undefined, 0.3 + c * 0.4, 0.9 + c * 0.2);
      }
      if (input.pressed('Mouse0') && this.focus && findInteractable(this.focus.obj)?.it.kind !== 'pickup' && findInteractable(this.focus.obj)?.it.kind !== 'block') {
        // tools don't swing at doors and NPCs: use them instead
        const f = findInteractable(this.focus.obj)!;
        if (['door', 'drawer', 'npc', 'board', 'paper', 'register', 'switch', 'vehicle', 'bed', 'seat'].includes(f.it.kind)) {
          this.charging = false; this.charge = 0;
          f.it.use(this.ctx(this.focus.point));
        }
      }
      return;
    }

    // items: LMB uses them (eat, drink, offer, toggle), Q sets one down where you look
    if (h.kind === 'item' && input.pressed('KeyQ')) {
      const at = surface && surface.distanceTo(origin) < 2.6 ? surface : this.g.player.pos.clone().add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize(), 0.7);
      this.g.game.setDown?.(h.item, at);
      return;
    }
    if (h.kind === 'item') {
      if (input.pressed('Mouse0')) {
        if (this.focus) {
          const f = findInteractable(this.focus.obj)!;
          if (!g.useItem(h.item, { obj: f.obj, point: this.focus.point })) f.it.use(this.ctx(this.focus.point));
        } else g.useItem(h.item, { obj: null, point: null });
      }
      return;
    }

    if ((input.pressed('Mouse0')) && this.focus) {
      const f = findInteractable(this.focus.obj);
      f?.it.use(this.ctx(this.focus.point));
    }
  }

  /** label for the crosshair hint */
  get label(): string {
    const h = this.held;
    if (h.kind === 'drag') return 'Q  let go';
    if (h.kind === 'carry') {
      if (this.focus) { const f = findInteractable(this.focus.obj); if (f && f.it.kind !== 'pickup') return f.it.label(this.ctx(this.focus.point)); }
      const pid = h.obj.userData.itemId as string | undefined;
      const pocket = !h.piece && pid && ITEMS[pid]?.pocket ? '     B  pocket' : '';
      return h.mass < 15 ? `Click  place     Q  drop     RMB  throw${pocket}` : 'Click  set down     Q  drop';
    }
    return this.focus?.label ?? '';
  }

  /** pocket / unpocket the held item; returns the item id that was stowed */
  stow(): string | null {
    const h = this.held;
    if (h.kind === 'item' || h.kind === 'tool') { const it = h.item; this.equip(null); return it; }
    return null;
  }
}

export { GROUP, groups };
