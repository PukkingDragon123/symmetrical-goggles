// The hotbar: five slots on a leather strip at the bottom of the screen, the selected one in your hands.
//   1-5 / the wheel   select a slot; the arms dip the old thing out and raise the new one (arms.ts grips)
//                     (press the selected slot's key again to lower or raise what it holds; 0 lowers)
//   Q                 drop the held thing as a real physics object in front of you (Shift+Q: the whole stack)
//   E                 pick up what you look at into the selected slot (or the first free one)
//   logs, rounds, goods for the counter: carried in both hands, they take a slot until put down
//   stash             a plank footlocker at the back wall of the cabin: E takes the highlighted stack (the wheel
//                     moves the highlight while you look at it), RMB puts the held stack in. While you are at the
//                     cabin its contents count as yours (the kitchen and the stove use them).
//   overflow          what does not fit goes in a canvas sack at your feet (or the stash when you are at the cabin)
// The model is ./slots.ts (game.inv); this module draws the strip, wires the hands and owns the world objects.
//
//   game.inv = new SlotInventory(...); game.hotbar = new Hotbar(); after the hands exist: game.hotbar.install(game)
//   each frame in walk mode, before hands.update: hotbar.control();   every frame: hotbar.update(dt)
//   game.setDown(id, at) -> hotbar.drop(id, at);  saves: hotbar.save() / hotbar.load(slots, oldItems)
import * as THREE from 'three';
import { input } from '../../core/input';
import { audio } from '../../audio/audio';
import { floatText } from '../float';
import { ITEMS } from '../../game/items';
import { registerInteractable } from '../../game/interact';
import { makePhysical, removeProp, type PhysProp } from '../../game/physprops';
import { physics, RAPIER, GROUP, groups } from '../../physics/physics';
import { CABIN } from '../../places/cabinplan';
import type { WoodPiece } from '../../chop/wood';
import type { Game } from '../../game/game';
import { SlotInventory, SLOTS, stackMax, isTwoHand, soundMat, type InvSave, type SoundMat } from './slots';
import { itemIcon, iconDone, iconReady, objectIcon, setIconModelSource } from './icons';
import { crateMesh, sackMesh, CRATE } from './drops';

// ------------------------------------------------------------------------------------------------ layout (px)
const SLOT = 52, GAP = 4, PAD = 6;
const BAR_W = SLOTS * SLOT + (SLOTS - 1) * GAP + PAD * 2;
const ROW_H = SLOT + PAD * 2;
const CV_H = ROW_H * 2 + 4;        // the stash row sits above the bar while you look at the crate
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

// 3 x 5 pixel digits (rows top to bottom, 3 bits each)
const GLYPH: Record<string, number[]> = {
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [7, 1, 7, 4, 7], 3: [7, 1, 3, 1, 7], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 7, 1, 7], 6: [7, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 7],
};

const SND: Record<SoundMat, [string, number, number, string, number, number]> = {
  tool: ['wood_stack', 0.22, 1.35, 'log_thud', 0.2, 1.9],
  metal: ['pot_lid', 0.12, 1.5, 'pot_lid', 0.16, 1.25],
  glass: ['bottle_clink', 0.2, 1.1, 'bottle_set', 0.3, 1.05],
  tin: ['pot_lid', 0.1, 1.8, 'bottle_set', 0.22, 0.8],
  paper: ['paper_rustle', 0.24, 1.2, 'paper_rustle', 0.22, 0.85],
  food: ['paper_rustle', 0.18, 1.0, 'bag_rustle', 0.2, 1.2],
  cloth: ['bag_rustle', 0.24, 1.1, 'bag_rustle', 0.22, 0.8],
  wood: ['wood_stack', 0.18, 1.5, 'wood_stack', 0.24, 1.2],
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const nameOf = (id: string) => ITEMS[id]?.name ?? id;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

interface Carry { slot: number; key: string; icon: HTMLCanvasElement | null; name: string }
interface Crate { root: THREE.Group; lid: THREE.Group; pos: THREE.Vector3; open: number; body: RAPIER.RigidBody | null }

export class Hotbar {
  private g: Game | null = null;
  private cv: HTMLCanvasElement | null = null;
  private cx: CanvasRenderingContext2D | null = null;
  private nameEl: HTMLDivElement | null = null;
  private k = 1;
  private dirty = true;
  private shown = 0;
  private nameT = 0;
  private version = -1;
  private selKey = '';
  private prevMode = '';
  /** the selected slot's thing is put away (hands empty) */
  private lowered = false;
  private carry: Carry | null = null;
  private overflowQ: [string, number][] = [];
  private crate: Crate | null = null;
  private stashFocus = false;
  private stashCursor = 0;
  private waiting = new Set<string>();
  private pendingSync = false;

  // ---------------------------------------------------------------------------------------------- install
  install(g: Game): this {
    this.g = g;
    const inv = g.inv, hands = g.hands;
    inv.onOverflow = (id, n) => this.overflowQ.push([id, n]);
    setIconModelSource((id) => g.toolModel(id));
    // equipping from anywhere (stations, the book, the axe in the block) moves the selection to that thing's slot
    const equip = hands.equip.bind(hands);
    hands.equip = (id: string | null) => {
      if (id) { const k = inv.slotOf(id); if (k >= 0 && !hands.busy) inv.sel = k; this.lowered = false; }
      else if (!hands.busy) this.lowered = true;
      equip(id);
      this.dirty = true;
    };
    // picking things up: items go into a slot, logs and other big things into both hands (and take a slot)
    const grab = hands.grab.bind(hands);
    hands.grab = (obj: THREE.Object3D, piece?: WoodPiece, mass?: number) => this.grab(grab, obj, piece, mass);
    this.mount();
    return this;
  }

  get inv(): SlotInventory { return this.g!.inv; }

  save(): InvSave { return this.inv.serialize(); }

  /** restore from a save: the slots if it has them, else an old count list (overflow lands in the stash) */
  load(slots: InvSave | undefined, items: [string, number][]): void {
    if (slots && slots.v === 2) this.inv.deserialize(slots); else this.inv.migrate(items);
    this.selKey = ''; this.dirty = true;
  }

  // ---------------------------------------------------------------------------------------------- input
  /** keys and the wheel (walk mode, before hands.update) */
  control(): void {
    const g = this.g;
    if (!g) return;
    for (let k = 0; k < SLOTS; k++) if (input.pressed(DIGITS[k])) this.select(k, true);
    if (input.pressed('Digit0') && !g.hands.busy && g.hands.heldItem) g.hands.equip(null);
    const w = input.wheel;
    if (w && !(g.arms as unknown as { inspecting?: boolean } | null)?.inspecting) {
      if (this.stashFocus) { this.stashCursor += Math.sign(w); this.dirty = true; audio.play('paper_rustle', { vol: 0.12, rate: 1.6 }); }
      else this.select((g.inv.sel + Math.sign(w) + SLOTS) % SLOTS, false);
    }
  }

  /** select a slot; again on the same key lowers / raises what it holds */
  select(k: number, key: boolean): void {
    const g = this.g!, inv = g.inv, hands = g.hands;
    if (hands.busy) { if (k !== inv.sel) floatText.say('Both hands full. Q puts it down.', { dur: 1.8 }); return; }
    const s = inv.slots[k];
    if (k === inv.sel) {
      if (!key || !s) return;
      hands.equip(hands.heldItem === s.id ? null : s.id);
      this.showName();
      return;
    }
    inv.sel = k;
    this.lowered = false;
    this.selKey = `${k}:${s?.id ?? ''}`;
    this.syncHands();
    this.showName();
    this.dirty = true;
  }

  /** the hands hold what the selected slot holds (unless lowered, busy, or not walking) */
  private syncHands(): void {
    const g = this.g!, hands = g.hands;
    if (!hands || hands.busy) return;
    // not walking (loading, the menu, a cutscene): do it the moment you are
    if (g.mode !== 'walk') { this.pendingSync = true; return; }
    this.pendingSync = false;
    const s = g.inv.slots[g.inv.sel];
    const want = !s || this.lowered ? '' : s.id;
    if (hands.heldItem !== want) hands.equip(want || null);
  }

  // ---------------------------------------------------------------------------------------------- pick up
  private grab(orig: (o: THREE.Object3D, p?: WoodPiece, m?: number) => void, obj: THREE.Object3D, piece?: WoodPiece, mass?: number): void {
    const g = this.g!, hands = g.hands, inv = g.inv;
    if (hands.busy) return;
    const id = obj.userData.itemId as string | undefined;
    const unpaid = !!obj.userData.unpaid;
    if (!piece && id && ITEMS[id] && !unpaid) { this.pickUp(obj, id); return; }
    // both hands: the selected slot if it is empty, else the first free one (goods for the counter go regardless)
    const slot = !inv.slots[inv.sel] ? inv.sel : inv.firstFree();
    if (slot < 0 && !unpaid) { this.full(obj); return; }
    orig(obj, piece, mass);
    if (hands.busy) this.startCarry(slot, obj, piece);
  }

  private startCarry(slot: number, obj: THREE.Object3D, piece?: WoodPiece): void {
    const inv = this.inv, id = obj.userData.itemId as string | undefined;
    inv.reserved = slot;
    if (slot >= 0) inv.sel = slot;
    let key: string, icon: HTMLCanvasElement | null = null, name: string;
    if (piece) {
      key = `piece:${piece.spec.species}:${piece.kind}`;
      icon = objectIcon(key, piece.mesh);
      name = `${piece.spec.species.charAt(0).toUpperCase()}${piece.spec.species.slice(1)} ${piece.kind}`;
    } else if (id && ITEMS[id]) { key = id; icon = itemIcon(id); name = nameOf(id); } else { key = `prop:${obj.name || obj.uuid}`; icon = objectIcon(key, obj); name = obj.name || 'Something heavy'; }
    this.carry = { slot, key, icon, name };
    this.watch(key);
    this.selKey = `${inv.sel}:`;
    this.showName();
    this.dirty = true;
  }

  /** no room: say so and give a physical prop its body back (physprops took it away before asking) */
  private full(obj: THREE.Object3D): void {
    floatText.say('Hands full. Q drops what you hold.', { dur: 2 });
    audio.play('bag_rustle', { vol: 0.15, rate: 0.7 });
    const pp = obj.userData.physProp as PhysProp | undefined;
    if (pp && !pp.body) (obj.userData.onRelease as ((p: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3) => void) | undefined)?.(obj.getWorldPosition(new THREE.Vector3()), obj.getWorldQuaternion(new THREE.Quaternion()), new THREE.Vector3());
  }

  /** a world thing with an item id goes into a slot (the selected one first) */
  pickUp(obj: THREE.Object3D, id: string): void {
    const g = this.g!, inv = g.inv;
    const n = Math.max(1, (obj.userData.stackN as number | undefined) ?? 1);
    const room = inv.room(id);
    if (room <= 0) { this.full(obj); return; }
    const k = Math.min(n, room);
    const at = obj.getWorldPosition(new THREE.Vector3());
    inv.put(id, k, inv.sel);
    const pp = obj.userData.physProp as PhysProp | undefined;
    if (k < n) {
      obj.userData.stackN = n - k;
      if (pp && !pp.body) (obj.userData.onRelease as ((p: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3) => void) | undefined)?.(at, obj.getWorldQuaternion(new THREE.Quaternion()), new THREE.Vector3());
      floatText.say('No room for the rest.', { dur: 1.8 });
    } else if (pp) removeProp(pp); else obj.removeFromParent();
    this.snd(id, 'lift');
    floatText.pop(`+${k > 1 ? `${k} ` : ''}${nameOf(id)}`, at);
    (g.arms as unknown as { play(a: string): void } | null)?.play('grab');
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------------------------- drop
  /**
   * Q: one of the held thing (Shift: the whole stack) leaves the hands as a physics object, set down on the surface
   * you look at when it is within arm's reach, else dropped from the hands in front of you.
   */
  drop(id: string, at?: THREE.Vector3 | null): void {
    const g = this.g!, inv = g.inv;
    const all = input.held('ShiftLeft') || input.held('ShiftRight');
    const slot = inv.slotOf(id);
    let n = 1;
    if (slot >= 0) n = inv.takeFrom(slot, all ? inv.slots[slot]!.n : 1)?.n ?? 0;
    else if (!inv.take(id)) n = 0;
    if (!n) return;
    this.spawnDrop(id, n, at ?? null);
    this.snd(id, 'put');
    this.dirty = true;
  }

  private spawnDrop(id: string, n: number, at: THREE.Vector3 | null): THREE.Object3D {
    const g = this.g!, cam = g.camera;
    const eye = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = _v2.set(1, 0, 0).applyQuaternion(cam.quaternion);
    let m = g.toolModel(id);
    if (!m) { const grp = new THREE.Group(); grp.add(sackMesh().clone()); m = grp; }
    const pos = new THREE.Vector3(), vel = new THREE.Vector3();
    if (at && at.distanceTo(eye) < 1.6) {
      pos.copy(at).addScaledVector(fwd, -0.06); pos.y += 0.07;
    } else {
      pos.copy(eye).addScaledVector(fwd, 0.5).addScaledVector(right, 0.1); pos.y -= 0.32;
      vel.copy(fwd).setY(0).normalize().multiplyScalar(1.4); vel.y = 0.8;
    }
    m.position.copy(pos);
    m.quaternion.setFromEuler(new THREE.Euler(0, g.player.yaw + Math.random() * 0.8 - 0.4, 0));
    g.scene.add(m);
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    const pp = makePhysical(m, { mass: Math.min(30, Math.max(0.05, (ITEMS[id]?.mass ?? 0.3) * n)), itemId: id, asleep: false });
    if (pp.body) { pp.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true); pp.body.setAngvel({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }, true); }
    m.userData.stackN = n;
    registerInteractable(m, {
      kind: 'pickup', reach: 2.3,
      label: (ctx) => (ctx.game?.hands?.busy ? '' : `Pick up ${lower(nameOf(id))}${(m!.userData.stackN ?? 1) > 1 ? ` ×${m!.userData.stackN}` : ''}`),
      use: () => this.pickUp(m!, id),
    });
    return m;
  }

  // ---------------------------------------------------------------------------------------------- overflow
  private spawnSack(contents: Map<string, number>): void {
    const g = this.g!, cam = g.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const root = new THREE.Group();
    root.add(sackMesh().clone());
    root.position.copy(g.player.pos).addScaledVector(fwd, 0.65);
    root.position.y += 0.35;
    root.rotation.y = Math.random() * 6.28;
    g.scene.add(root);
    let kg = 0;
    for (const [id, n] of contents) kg += (ITEMS[id]?.mass ?? 0.3) * n;
    const pp = makePhysical(root, { mass: Math.min(30, Math.max(0.5, kg)), asleep: false });
    root.userData.contents = contents;
    const label = () => {
      const l = [...contents].filter(([, n]) => n > 0).map(([id, n]) => `${lower(nameOf(id))}${n > 1 ? ` ×${n}` : ''}`);
      return `Pick up the sack: ${l.slice(0, 2).join(', ')}${l.length > 2 ? ` +${l.length - 2}` : ''}`;
    };
    registerInteractable(root, {
      kind: 'pickup', reach: 2.3, label: (ctx) => (ctx.game?.hands?.busy ? '' : label()),
      use: () => {
        let got = 0;
        for (const [id, n] of contents) {
          const k = Math.min(n, this.inv.room(id));
          if (k <= 0) continue;
          this.inv.put(id, k, this.inv.sel);
          contents.set(id, n - k); got += k;
          if (n - k <= 0) contents.delete(id);
        }
        audio.play('bag_rustle', { vol: 0.5 });
        if (!contents.size) removeProp(pp);
        else floatText.say(got ? 'Hands full. The rest stays in the sack.' : 'Hands full. Q drops what you hold.', { dur: 2 });
        this.dirty = true;
      },
    });
  }

  // ---------------------------------------------------------------------------------------------- the stash
  private buildCrate(): void {
    const g = this.g!, cabin = g.cabin!;
    const { root, lid } = crateMesh();
    // the back wall, between the mouse hole and the stove, where a strip of floor stays dusty
    const z = -CABIN.D / 2 + CABIN.R + CRATE.d / 2 + 0.05;
    root.position.set(0.02, CABIN.FLOOR, z);
    root.rotation.y = 0.04;
    root.name = 'stash';
    cabin.group.add(root);
    root.updateWorldMatrix(true, true);
    const pos = root.getWorldPosition(new THREE.Vector3());
    const q = root.getWorldQuaternion(new THREE.Quaternion());
    let body: RAPIER.RigidBody | null = null;
    try {
      body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y + CRATE.h / 2, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(CRATE.w / 2, CRATE.h / 2, CRATE.d / 2).setCollisionGroups(groups(GROUP.STATIC, 0xffff)).setFriction(0.8), body);
    } catch { body = null; }
    this.crate = { root, lid, pos, open: 0, body };
    registerInteractable(root, {
      kind: 'container', reach: 2.4,
      label: () => this.stashLabel(),
      use: () => this.stashTake(),
      alt: () => this.stashPutHeld(),
    });
  }

  private stashList(): [string, number][] {
    const l = [...this.inv.stash].filter(([, n]) => n > 0);
    l.sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));
    return l;
  }
  private stashCur(): [string, number] | null {
    const l = this.stashList();
    if (!l.length) return null;
    this.stashCursor = ((this.stashCursor % l.length) + l.length) % l.length;
    return l[this.stashCursor];
  }
  private heldStashable(): string {
    const g = this.g!, h = g.hands.heldItem;
    return !g.hands.busy && h && g.inv.slotOf(h) >= 0 ? h : '';
  }
  private stashLabel(): string {
    if (this.g!.hands.busy) return '';
    const cur = this.stashCur(), held = this.heldStashable();
    const a = cur ? `E  take ${lower(nameOf(cur[0]))}${Math.min(cur[1], stackMax(cur[0])) > 1 ? ` ×${Math.min(cur[1], stackMax(cur[0]))}` : ''}` : 'The stash is empty';
    return held ? `${a}     RMB  put in ${lower(nameOf(held))}` : a;
  }
  private stashTake(): void {
    const inv = this.inv, cur = this.stashCur();
    if (!cur) return;
    const [id, n] = cur;
    const k = Math.min(n, stackMax(id), inv.room(id));
    if (k <= 0) { floatText.say('Hands full. RMB puts the held thing in.', { dur: 2 }); return; }
    inv.stashTake(id, k);
    inv.put(id, k, inv.sel);
    this.snd(id, 'lift');
    if (this.crate) this.crate.open = Math.max(this.crate.open, 0.6);
    this.dirty = true;
  }
  private stashPutHeld(): void {
    const inv = this.inv, id = this.heldStashable();
    if (!id) return;
    const slot = inv.slotOf(id);
    const s = inv.takeFrom(slot, inv.slots[slot]!.n);
    if (!s) return;
    inv.stashPut(s.id, s.n);
    this.snd(s.id, 'put');
    if (this.crate) this.crate.open = Math.max(this.crate.open, 0.6);
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt: number): void {
    const g = this.g;
    if (!g || !this.cv) return;
    const inv = g.inv, hands = g.hands;
    if (!this.crate && g.cabin) this.buildCrate();
    // the stash: in reach at the cabin, looked at, the lid lifting
    const cr = this.crate;
    if (cr) {
      const d = _v.copy(g.player.pos).sub(cr.pos).setY(0).length();
      inv.reach = g.mode !== 'drive' && ((g.indoors && d < 7) || d < 2.2);
      const look = !!hands.focus && hands.focus.obj === cr.root;
      if (look !== this.stashFocus) { this.stashFocus = look; this.dirty = true; }
      cr.open = Math.max(look ? 0.35 : 0, cr.open - dt * 0.5);
      const a = THREE.MathUtils.lerp(cr.lid.rotation.x, -cr.open * 1.6, Math.min(1, dt * 6));
      cr.lid.rotation.x = a;
    }
    // what the hands carry in both arms takes a slot
    if (this.carry && !hands.busy) { inv.reserved = -1; this.carry = null; this.dirty = true; this.syncHands(); }
    else if (!this.carry && hands.busy) {
      const h = hands.held as { obj?: THREE.Object3D; piece?: WoodPiece };
      if (h.obj) this.startCarry(!inv.slots[inv.sel] ? inv.sel : inv.firstFree(), h.obj, h.piece);
    }
    // overflow: into the stash at the cabin, else a sack at your feet
    if (this.overflowQ.length) {
      const q = this.overflowQ.splice(0);
      const m = new Map<string, number>();
      for (const [id, n] of q) m.set(id, (m.get(id) ?? 0) + n);
      if (inv.reach || g.mode !== 'walk') { for (const [id, n] of m) inv.stashPut(id, n); floatText.say('No room on the belt. It went in the stash.', { dur: 2.6 }); }
      else { this.spawnSack(m); floatText.say('Hands full. The rest is in a sack at your feet.', { dur: 2.6 }); }
    }
    // the hands follow the selected slot when its contents change
    const s = inv.slots[inv.sel];
    const key = `${inv.sel}:${s?.id ?? ''}`;
    if (key !== this.selKey) { this.selKey = key; this.lowered = false; this.syncHands(); this.dirty = true; }
    if (g.mode !== this.prevMode) {
      if (this.prevMode === 'drive' && g.mode === 'walk') { this.lowered = false; this.syncHands(); }
      this.prevMode = g.mode;
    }
    if (this.pendingSync && g.mode === 'walk') this.syncHands();
    if (inv.version !== this.version) { this.version = inv.version; this.dirty = true; if (this.nameT > 0) this.showName(); }
    // show / hide
    const want = g.mode === 'walk' && !g.journal.open ? 1 : 0;
    this.shown += (want - this.shown) * Math.min(1, dt * 10);
    const op = this.shown < 0.02 ? '0' : this.shown.toFixed(2);
    if (this.cv.style.opacity !== op) this.cv.style.opacity = op;
    this.nameT -= dt;
    if (this.nameEl) {
      const o = this.nameT > 0 && want ? Math.min(1, this.nameT * 2).toFixed(2) : '0';
      if (this.nameEl.style.opacity !== o) this.nameEl.style.opacity = o;
    }
    if (this.dirty && this.shown > 0.01) { this.dirty = false; this.draw(); }
  }

  private showName(): void {
    const g = this.g!, inv = g.inv, s = inv.slots[inv.sel];
    if (!this.nameEl) return;
    const txt = this.carry && this.carry.slot === inv.sel ? `${this.carry.name} (both hands)` : s ? `${nameOf(s.id)}${s.n > 1 ? `  ×${s.n}` : ''}` : '';
    this.nameEl.textContent = txt;
    this.nameT = txt ? 1.6 : 0;
  }

  private snd(id: string, kind: 'lift' | 'put'): void {
    const e = SND[soundMat(id)];
    if (kind === 'lift') audio.play(e[0], { vol: e[1], rate: e[2] }); else audio.play(e[3], { vol: e[4], rate: e[5] });
  }

  /** redraw when an icon finishes rendering */
  private watch(key: string): void {
    if (this.waiting.has(key) || iconDone(key)) return;
    this.waiting.add(key);
    const p = key.startsWith('piece:') || key.startsWith('prop:') ? null : iconReady(key);
    if (p) p.then(() => { this.waiting.delete(key); this.dirty = true; });
    else { const t = setInterval(() => { if (iconDone(key)) { clearInterval(t); this.waiting.delete(key); this.dirty = true; } }, 250); }
  }

  // ---------------------------------------------------------------------------------------------- drawing
  private mount(): void {
    if (typeof document === 'undefined' || this.cv) return;
    const cv = document.createElement('canvas');
    cv.width = BAR_W; cv.height = CV_H;
    cv.id = 'hotbar';
    cv.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);image-rendering:pixelated;pointer-events:none;z-index:6;opacity:0';
    document.body.appendChild(cv);
    this.cv = cv;
    this.cx = cv.getContext('2d')!;
    this.cx.imageSmoothingEnabled = false;
    const nm = document.createElement('div');
    nm.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);pointer-events:none;z-index:6;opacity:0;white-space:nowrap;'
      + 'font-family:Alagard,monospace;-webkit-font-smoothing:none;color:#f1e6c8;'
      + 'text-shadow:2px 0 0 #120d0a,-2px 0 0 #120d0a,0 2px 0 #120d0a,0 -2px 0 #120d0a,2px 2px 0 #120d0a,-2px 2px 0 #120d0a,2px -2px 0 #120d0a,-2px -2px 0 #120d0a';
    document.body.appendChild(nm);
    this.nameEl = nm;
    const layout = () => {
      this.k = Math.max(1, Math.floor(innerHeight / 540));
      cv.style.width = `${BAR_W * this.k}px`; cv.style.height = `${CV_H * this.k}px`;
      nm.style.fontSize = `${16 * this.k}px`;
      nm.style.bottom = `${6 + (ROW_H + 6) * this.k}px`;
    };
    addEventListener('resize', layout);
    layout();
  }

  private draw(): void {
    const c = this.cx!, g = this.g!, inv = g.inv, hands = g.hands;
    c.clearRect(0, 0, BAR_W, CV_H);
    const y0 = CV_H - ROW_H;
    // the strip: a dark oiled-leather belt with a stitched edge
    c.fillStyle = 'rgba(14,10,8,0.62)'; c.fillRect(1, y0 + 2, BAR_W - 2, ROW_H - 4); c.fillRect(2, y0 + 1, BAR_W - 4, ROW_H - 2);
    c.fillStyle = 'rgba(58,40,26,0.55)'; c.fillRect(3, y0 + 3, BAR_W - 6, ROW_H - 6);
    c.fillStyle = 'rgba(160,124,78,0.45)';
    for (let x = 6; x < BAR_W - 6; x += 4) { c.fillRect(x, y0 + 4, 2, 1); c.fillRect(x, y0 + ROW_H - 5, 2, 1); }
    for (let i = 0; i < SLOTS; i++) {
      const x = PAD + i * (SLOT + GAP), y = y0 + PAD;
      const s = inv.slots[i];
      const sel = i === inv.sel;
      const carry = this.carry && this.carry.slot === i ? this.carry : null;
      const held = sel && (carry || (s && hands.heldItem === s.id));
      this.slotFrame(c, x, y, sel, !!held);
      if (carry) {
        if (carry.icon) c.drawImage(carry.icon, x + 2, y + 2);
        this.twoHand(c, x, y);
      } else if (s) {
        const icon = itemIcon(s.id);
        this.watch(s.id);
        c.globalAlpha = sel && !held ? 0.6 : 1;
        c.drawImage(icon, x + 2, y + 2);
        c.globalAlpha = 1;
        if (s.n > 1) this.number(c, s.n, x + SLOT - 3, y + SLOT - 3, 2, '#f6ecd0');
        if (isTwoHand(s.id)) this.twoHand(c, x, y);
      }
      this.number(c, i + 1, x + 6, y + 8, 1, sel ? '#fff0c0' : '#a8916a', true);
    }
    // the stash row while you look at the crate
    if (this.stashFocus) {
      const l = this.stashList();
      const cur = this.stashCur();
      const n = Math.min(SLOTS, l.length);
      c.fillStyle = 'rgba(14,10,8,0.62)'; c.fillRect(1, 2, BAR_W - 2, ROW_H - 4); c.fillRect(2, 1, BAR_W - 4, ROW_H - 2);
      c.fillStyle = 'rgba(70,52,30,0.5)'; c.fillRect(3, 3, BAR_W - 6, ROW_H - 6);
      if (!n) { c.fillStyle = 'rgba(200,180,140,0.35)'; for (let x = 20; x < BAR_W - 20; x += 6) c.fillRect(x, ROW_H / 2, 3, 1); }
      // a window of up to five entries round the cursor
      const start = l.length <= SLOTS ? 0 : Math.max(0, Math.min(l.length - SLOTS, this.stashCursor - 2));
      for (let j = 0; j < n; j++) {
        const [id, k] = l[start + j];
        const x = PAD + j * (SLOT + GAP), y = PAD;
        const on = !!cur && cur[0] === id;
        this.slotFrame(c, x, y, on, on);
        this.watch(id);
        c.drawImage(itemIcon(id), x + 2, y + 2);
        if (k > 1) this.number(c, k, x + SLOT - 3, y + SLOT - 3, 2, '#f6ecd0');
      }
      if (start > 0) this.arrow(c, 2, ROW_H / 2, -1);
      if (start + SLOTS < l.length) this.arrow(c, BAR_W - 3, ROW_H / 2, 1);
    }
  }

  private slotFrame(c: CanvasRenderingContext2D, x: number, y: number, sel: boolean, held: boolean): void {
    // ink outline, sunken pocket, bevel
    c.fillStyle = 'rgba(8,6,5,0.9)';
    c.fillRect(x + 1, y, SLOT - 2, 1); c.fillRect(x + 1, y + SLOT - 1, SLOT - 2, 1); c.fillRect(x, y + 1, 1, SLOT - 2); c.fillRect(x + SLOT - 1, y + 1, 1, SLOT - 2);
    c.fillStyle = sel ? 'rgba(70,52,32,0.78)' : 'rgba(26,19,14,0.7)';
    c.fillRect(x + 1, y + 1, SLOT - 2, SLOT - 2);
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x + 1, y + 1, SLOT - 2, 2); c.fillRect(x + 1, y + 1, 2, SLOT - 2);
    c.fillStyle = 'rgba(120,92,60,0.35)'; c.fillRect(x + 1, y + SLOT - 2, SLOT - 2, 1); c.fillRect(x + SLOT - 2, y + 1, 1, SLOT - 2);
    if (!sel) return;
    // brass rim: bright when the thing is in your hands, dull when it is put away
    const hi = held ? '#f2d27c' : '#a8884a', mid = held ? '#c99a46' : '#7c6236', lo = held ? '#7a5420' : '#4a381c';
    c.fillStyle = mid;
    c.fillRect(x - 1, y - 1, SLOT + 2, 2); c.fillRect(x - 1, y + SLOT - 1, SLOT + 2, 2); c.fillRect(x - 1, y - 1, 2, SLOT + 2); c.fillRect(x + SLOT - 1, y - 1, 2, SLOT + 2);
    c.fillStyle = hi; c.fillRect(x - 1, y - 1, SLOT + 1, 1); c.fillRect(x - 1, y - 1, 1, SLOT + 1);
    c.fillStyle = lo; c.fillRect(x, y + SLOT, SLOT + 1, 1); c.fillRect(x + SLOT, y, 1, SLOT + 1);
    c.fillStyle = held ? '#fff4c4' : '#c8b07a';
    for (const [cx, cy] of [[x - 1, y - 1], [x + SLOT, y - 1], [x - 1, y + SLOT], [x + SLOT, y + SLOT]]) c.fillRect(cx, cy, 1, 1);
  }

  /** two little brass bars: held in both hands */
  private twoHand(c: CanvasRenderingContext2D, x: number, y: number): void {
    c.fillStyle = '#120d0a'; c.fillRect(x + SLOT - 12, y + 3, 9, 7);
    c.fillStyle = '#d9a54a'; c.fillRect(x + SLOT - 11, y + 4, 3, 5); c.fillRect(x + SLOT - 7, y + 4, 3, 5);
  }

  private arrow(c: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
    c.fillStyle = '#d9c08a';
    for (let i = 0; i < 4; i++) c.fillRect(x - (dir > 0 ? i : -i) - (dir > 0 ? 0 : 0), y - (3 - i), 1, (3 - i) * 2 + 1);
  }

  /** pixel digits; right-aligned at x unless left, baseline (bottom) at y; outlined in ink */
  private number(c: CanvasRenderingContext2D, n: number, x: number, y: number, s: number, col: string, left = false): void {
    const t = String(n), w = t.length * 4 * s - s;
    const x0 = left ? x - 1 : x - w, y0 = y - 5 * s;
    const put = (ox: number, oy: number) => {
      for (let i = 0; i < t.length; i++) {
        const gl = GLYPH[t[i]];
        for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (gl[r] & (4 >> b)) c.fillRect(x0 + ox + (i * 4 + b) * s, y0 + oy + r * s, s, s);
      }
    };
    c.fillStyle = '#120d0a';
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) put(ox, oy);
    c.fillStyle = col;
    put(0, 0);
  }
}
