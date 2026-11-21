// Logs on the truck. Bucked logs (src/chop WoodPiece) get onto the bed two ways:
//   * by hand: drag or drop them on the deck; once they rest there (or the truck moves off) they are loaded
//   * with the winch: "Winch logs aboard" pulls every log lying behind the truck up over the tailboard, one by one,
//     on a cable from the sheave on the headache rack (the drum spins, the motor whines)
// Loaded logs ride asleep in the bed (no physics body, parented to the sprung body so they squat and sway with it);
// the truck feels their mass (TruckPhysics.cargoKg / cargoAt). A hard crash or a roll wakes them and they spill.
// At the store's log deck "Unload onto the deck" rolls them off into the scaling zone (sold at the register);
// anywhere else the alt action dumps them off the side.
import * as THREE from 'three';
import { physics } from '../physics/physics';
import { audio } from '../audio/audio';
import { hud } from '../ui/hud';
import { SPOTS, heightAt } from '../world/layout';
import { registerInteractable, type InteractCtx, type Interactable } from '../game/interact';
import type { WoodPiece } from '../chop/wood';
import type { Truck } from './truck';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const KEY = '__interact';
const MAX_KG = 3200;

interface Ride { piece: WoodPiece; orig: Interactable | undefined }
interface Move { piece: WoodPiece; t: number; dur: number; from: THREE.Vector3; fq: THREE.Quaternion; to: THREE.Vector3; tq: THREE.Quaternion; local: boolean; onDone: () => void }

export class TruckCargo {
  readonly rides: Ride[] = [];
  kg = 0;
  winching = 0;
  private bins = new Float32Array(20); // stack height across the bed (truck x), 0.1 m bins
  private watch = new Map<WoodPiece, number>();
  private scanT = 0;
  private queue: Move[] = [];
  private move: Move | null = null;
  private cable: THREE.Line;
  private drum: THREE.Object3D | null = null;
  game: any = null;

  constructor(private t: Truck) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.cable = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1c1b18 }));
    this.cable.frustumCulled = false;
    this.cable.visible = false;
    this.drum = t.nodes.winch_drum ?? null;
  }

  get bed(): THREE.Object3D { return this.t.nodes.bed ?? this.t.sprung; }
  get count(): number { return this.rides.length; }
  private get B() { return this.t.tmeta.bed; }

  /** the sheave on top of the headache rack (world) */
  private sheave(out: THREE.Vector3): THREE.Vector3 { return this.t.root.localToWorld(out.set(0, this.B.stakeTop - 0.02, this.B.z1 - 0.1)); }

  private chop(): { pieces: Set<WoodPiece>; group: THREE.Object3D } | null {
    const g = this.game ?? (globalThis as any).__game;
    if (g && !this.game) this.game = g;
    return g?.chop ?? null;
  }

  // ------------------------------------------------------------------------------------------- loading
  /** put a piece to sleep on the bed, keeping where it lies */
  load(p: WoodPiece): void {
    if (this.rides.some((r) => r.piece === p)) return;
    if (p.body) { physics.unsync(p.body); p.despawn(); }
    p.stacked = true;
    this.bed.attach(p.mesh);
    const orig = p.mesh.userData[KEY] as Interactable | undefined;
    registerInteractable(p.mesh, {
      kind: 'pickup', reach: 2.6,
      label: () => (this.t.occupied ? '' : p.mass > 32 ? 'Drag it off the bed' : 'Take it off the bed'),
      use: (ctx) => { this.wake(p); ctx.game.hands?.grab(p.mesh, p); },
    });
    this.rides.push({ piece: p, orig });
    this.recount();
  }

  /** a sleeping piece becomes physical again */
  wake(p: WoodPiece, vel?: THREE.Vector3, spin?: THREE.Vector3): void {
    const i = this.rides.findIndex((r) => r.piece === p);
    if (i < 0) return;
    const r = this.rides[i];
    this.rides.splice(i, 1);
    const ch = this.chop();
    p.mesh.updateWorldMatrix(true, false);
    p.mesh.matrixWorld.decompose(_v, _q, _w);
    (ch?.group ?? this.t.root.parent ?? this.t.root).attach(p.mesh);
    if (r.orig) p.mesh.userData[KEY] = r.orig;
    p.stacked = false;
    const v = vel ?? this.velocityAt(_w.copy(_v));
    p.spawn(_v.clone(), _q.clone(), v.clone(), spin);
    this.recount();
  }

  private velocityAt(out: THREE.Vector3): THREE.Vector3 {
    const P = this.t.phys;
    return out.set(Math.sin(P.yaw) * P.v, 0, Math.cos(P.yaw) * P.v);
  }

  private recount(): void {
    let kg = 0;
    const c = new THREE.Vector3();
    this.bins.fill(0);
    for (const r of this.rides) {
      kg += r.piece.mass;
      r.piece.mesh.getWorldPosition(_v);
      this.t.root.worldToLocal(_v);
      c.addScaledVector(_v, r.piece.mass);
      const top = _v.y + r.piece.r - this.B.bunkY;
      const b0 = Math.floor((_v.x - r.piece.r + 1) * 10), b1 = Math.ceil((_v.x + r.piece.r + 1) * 10);
      for (let b = Math.max(0, b0); b < Math.min(20, b1); b++) this.bins[b] = Math.max(this.bins[b], top);
    }
    this.kg = kg;
    this.t.phys.cargoKg = kg;
    if (kg > 0) this.t.phys.cargoAt.copy(c.multiplyScalar(1 / kg));
  }

  /** where the next log of radius r goes (truck space): the lowest spot across the bed between the stakes */
  private slot(r: number, len: number): { pos: THREE.Vector3; ok: boolean } {
    const B = this.B, half = B.stakeX - 0.06;
    let best = 1e9, bx = 0;
    for (let x = -half + r; x <= half - r + 1e-6; x += 0.05) {
      let top = 0;
      const b0 = Math.floor((x - r + 1) * 10), b1 = Math.ceil((x + r + 1) * 10);
      for (let b = Math.max(0, b0); b < Math.min(20, b1); b++) top = Math.max(top, this.bins[b]);
      const score = top + Math.abs(x) * 0.02;
      if (score < best) { best = score; bx = x; }
    }
    let top = 0;
    const b0 = Math.floor((bx - r + 1) * 10), b1 = Math.ceil((bx + r + 1) * 10);
    for (let b = Math.max(0, b0); b < Math.min(20, b1); b++) top = Math.max(top, this.bins[b]);
    const y = B.bunkY + top + r;
    // logs ride with their butt against the headache rack; long ones hang out over the tailboard
    const z = B.z1 - 0.08 - len / 2;
    return { pos: new THREE.Vector3(bx, y, z), ok: y + r < B.stakeTop + 0.15 && this.kg < MAX_KG };
  }

  /** pieces near the truck that the winch can reach (lying behind or beside the bed) */
  candidates(): WoodPiece[] {
    const ch = this.chop();
    if (!ch) return [];
    const out: WoodPiece[] = [];
    const tail = this.t.root.localToWorld(new THREE.Vector3(0, 0.5, this.B.z0 - 1.5));
    for (const p of ch.pieces) {
      if (!p.body || p.stacked || p.burned || p.len < 0.6 || p.kind === 'split' || this.game?.hands?.held?.piece === p) continue;
      if (p.mesh.position.distanceTo(tail) < 9) out.push(p);
    }
    return out.sort((a, b) => a.mesh.position.distanceTo(tail) - b.mesh.position.distanceTo(tail));
  }

  /** queue a winch pull: cable to the log, drag it up over the tailboard into its slot */
  winch(p: WoodPiece): boolean {
    const s = this.slot(p.r, p.len);
    if (!s.ok) return false;
    p.mesh.updateWorldMatrix(true, false);
    const from = p.mesh.getWorldPosition(new THREE.Vector3());
    const fq = p.mesh.getWorldQuaternion(new THREE.Quaternion());
    if (p.body) { physics.unsync(p.body); p.despawn(); }
    p.stacked = true;
    // the log lies along the truck (its axis is local +Y)
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    // reserve the slot now
    const b0 = Math.floor((s.pos.x - p.r + 1) * 10), b1 = Math.ceil((s.pos.x + p.r + 1) * 10);
    for (let b = Math.max(0, b0); b < Math.min(20, b1); b++) this.bins[b] = s.pos.y + p.r - this.B.bunkY;
    this.queue.push({ piece: p, t: 0, dur: 1.6 + Math.min(1.6, from.distanceTo(this.t.root.position) * 0.12), from, fq, to: s.pos, tq, local: true, onDone: () => this.load(p) });
    return true;
  }

  winchAll(): number {
    let n = 0;
    for (const p of this.candidates()) { if (this.winch(p)) n++; else break; }
    if (n) { hud.say(`<i>Winching ${n} log${n > 1 ? 's' : ''} aboard.</i>`, 2.5); audio.play('veh_handbrake_off', { pos: this.t.root.position, vol: 0.6 }); }
    else hud.say('<i>Nothing the winch can reach. Drag the logs within a few steps of the tailboard.</i>', 3);
    return n;
  }

  // ------------------------------------------------------------------------------------------- unloading
  /** the store's log deck, if the truck is parked beside it */
  deck(): THREE.Vector3 | null {
    const g = this.game ?? (globalThis as any).__game;
    const a = g?.store?.anchors?.log_deck as THREE.Object3D | undefined;
    const p = a ? a.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(SPOTS.store.x + 14, heightAt(SPOTS.store.x + 14, SPOTS.store.z), SPOTS.store.z);
    return p.distanceTo(this.t.root.position) < 16 ? p : null;
  }

  /** roll the load off onto the deck (it lands in the scaling zone; Gérard pays at the register) */
  unloadToDeck(): number {
    const deck = this.deck();
    if (!deck) return 0;
    const pieces = this.rides.map((r) => r.piece);
    pieces.forEach((p, i) => {
      const r = this.rides.find((x) => x.piece === p)!;
      p.mesh.updateWorldMatrix(true, false);
      const from = p.mesh.getWorldPosition(new THREE.Vector3()), fq = p.mesh.getWorldQuaternion(new THREE.Quaternion());
      const row = i % 5, layer = Math.floor(i / 5);
      const to = deck.clone().add(new THREE.Vector3((row - 2) * 0.62, 0.55 + layer * 0.45, ((i * 37) % 5 - 2) * 0.25));
      const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + (i % 3 - 1) * 0.15, Math.PI / 2));
      this.rides.splice(this.rides.indexOf(r), 1);
      (this.chop()?.group ?? this.t.root.parent!).attach(p.mesh);
      if (r.orig) p.mesh.userData[KEY] = r.orig;
      this.queue.push({ piece: p, t: 0, dur: 1.1, from, fq, to, tq, local: false, onDone: () => { p.stacked = false; p.spawn(p.mesh.position.clone(), p.mesh.quaternion.clone(), new THREE.Vector3(0, -0.5, 0)); audio.play('log_thud', { pos: p.mesh.position, vol: 0.8 }); } });
    });
    this.recount();
    if (pieces.length) hud.say(`<i>${pieces.length} log${pieces.length > 1 ? 's' : ''} rolled onto the deck. Settle up at the register.</i>`, 3.5);
    return pieces.length;
  }

  /** tip everything off the side, wherever you are */
  dump(): number {
    const n = this.rides.length;
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.t.root.quaternion);
    for (const r of [...this.rides]) this.wake(r.piece, side.clone().multiplyScalar(2.2 + Math.random()).add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, 0, (Math.random() - 0.5) * 2));
    if (n) { audio.play('log_roll', { pos: this.t.root.position, vol: 1 }); audio.play('log_thud', { pos: this.t.root.position, vol: 1, delay: 0.4 }); }
    return n;
  }

  /** a crash: hard enough and the load comes loose (forward over the cab on a head-on hit) */
  jolt(speed: number, normal: THREE.Vector3): void {
    if (!this.rides.length) return;
    const P = this.t.phys;
    const roll = Math.abs(P.groundRoll) > 0.55 || Math.abs(P.groundPitch) > 0.6;
    if (speed < 5.5 && !roll) return;
    const fwd = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    const k = speed > 8 || roll ? 1 : (speed - 5.5) / 2.5;
    const spill = this.rides.filter(() => Math.random() < k).map((r) => r.piece);
    for (const p of spill) {
      const v = fwd.clone().multiplyScalar(speed * (0.55 + Math.random() * 0.35)).addScaledVector(normal, -0.5).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, 0));
      this.wake(p, v, new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
    }
    if (spill.length) { audio.play('log_roll', { pos: this.t.root.position, vol: 1 }); hud.say('<i>The load came loose.</i>', 2.5); }
  }

  /** after a respawn: logs stay with the truck */
  settleAll(): void { this.recount(); }

  // ------------------------------------------------------------------------------------------- interaction
  label(ctx: InteractCtx): string {
    if (this.t.occupied || this.move || this.queue.length) return this.move ? 'Winch running…' : '';
    if (Math.abs(this.t.phys.v) > 0.5) return '';
    this.game ??= ctx.game;
    if (this.rides.length && this.deck()) return `Unload ${this.rides.length} log${this.rides.length > 1 ? 's' : ''} onto the deck`;
    const c = this.candidates().length;
    if (c) return `Winch ${c} log${c > 1 ? 's' : ''} aboard`;
    return '';
  }
  use(ctx: InteractCtx): boolean {
    this.game ??= ctx.game;
    if (this.t.occupied || this.move || Math.abs(this.t.phys.v) > 0.5) return false;
    if (this.rides.length && this.deck()) { this.unloadToDeck(); return true; }
    if (this.candidates().length) { this.winchAll(); return true; }
    return false;
  }
  altLabel(_ctx: InteractCtx): string { return this.rides.length && !this.t.occupied ? 'Roll the logs off here' : ''; }
  alt(ctx: InteractCtx): void { this.game ??= ctx.game; if (!this.t.occupied) this.dump(); }

  // ------------------------------------------------------------------------------------------- per step
  update(dt: number): void {
    const T = this.t, B = this.B;
    // pieces resting on the deck (dropped or dragged there) are loaded; when the truck moves off, at once
    this.scanT -= dt;
    const moving = Math.abs(T.phys.v) > 0.6;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      const ch = this.chop();
      if (ch) for (const p of ch.pieces) {
        if (!p.body || p.stacked || this.game?.hands?.held?.piece === p) continue;
        _v.copy(p.mesh.position);
        T.root.worldToLocal(_v);
        const inside = Math.abs(_v.x) < B.x + 0.05 && _v.z > B.z0 - 0.5 && _v.z < B.z1 + 0.05 && _v.y > B.deckY - 0.15 && _v.y < B.stakeTop + 0.4;
        if (!inside) { this.watch.delete(p); continue; }
        const lv = p.body.linvel();
        const rel = Math.hypot(lv.x, lv.y, lv.z);
        const t = (this.watch.get(p) ?? 0) + (rel < 0.35 || moving ? 0.25 : 0);
        this.watch.set(p, t);
        if (t >= 0.75 || moving) { this.watch.delete(p); this.load(p); audio.play('log_thud', { pos: p.mesh.getWorldPosition(_w), vol: 0.5 }); }
      }
    }
    // a roll-over spills the load
    if (this.rides.length && (Math.abs(T.phys.groundRoll) > 0.6 || Math.abs(T.phys.groundPitch) > 0.65)) this.jolt(6, new THREE.Vector3(0, 1, 0));
  }

  /** per frame: winch and unload animations, the cable, the drum */
  frame(dt: number): void {
    if (!this.move && this.queue.length) this.move = this.queue.shift()!;
    const m = this.move;
    this.winching += ((m && m.local ? 1 : 0) - this.winching) * Math.min(1, dt * 6);
    if (this.drum) this.drum.rotation.x += this.winching * dt * 9;
    this.cable.visible = !!m && m.local;
    if (!m) return;
    m.t += dt / m.dur;
    const k = clamp(m.t, 0, 1);
    const e = k * k * (3 - 2 * k);
    const T = this.t, p = m.piece;
    if (m.local) {
      // world path: drag along the ground to the tailboard, then up and over into the slot
      const tailW = T.root.localToWorld(new THREE.Vector3(m.to.x, this.B.deckY + 0.25, this.B.z0 - 0.2));
      const slotW = T.root.localToWorld(m.to.clone());
      if (e < 0.55) _v.lerpVectors(m.from, tailW, e / 0.55);
      else _v.lerpVectors(tailW, slotW, (e - 0.55) / 0.45);
      if (e < 0.55) _v.y = Math.max(_v.y, heightAt(_v.x, _v.z) + p.r);
      _q2.copy(T.root.quaternion).multiply(m.tq);
      _q.copy(m.fq).slerp(_q2, Math.min(1, e * 1.6));
      if (!p.mesh.parent || p.mesh.parent === this.bed) T.root.parent?.add(p.mesh);
      p.mesh.position.copy(_v);
      p.mesh.quaternion.copy(_q);
      // cable from the sheave to the log's near end
      const arr = (this.cable.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      this.sheave(_w);
      arr[0] = _w.x; arr[1] = _w.y; arr[2] = _w.z;
      arr[3] = _v.x; arr[4] = _v.y; arr[5] = _v.z;
      this.cable.geometry.attributes.position.needsUpdate = true;
      if (!this.cable.parent) T.root.parent?.add(this.cable);
      if (Math.random() < dt * 3) audio.play('log_drag', { pos: _v, vol: 0.4 });
    } else {
      _v.lerpVectors(m.from, m.to, e);
      _v.y += Math.sin(e * Math.PI) * 0.6;
      _q.copy(m.fq).slerp(m.tq, e);
      p.mesh.position.copy(_v);
      p.mesh.quaternion.copy(_q);
    }
    if (m.t >= 1) {
      if (m.local) {
        // settle into the slot on the bed (truck space) then hand over to load()
        this.bed.attach(p.mesh);
        p.mesh.updateWorldMatrix(true, false);
        audio.play('log_thud', { pos: p.mesh.getWorldPosition(_w), vol: 0.9 });
        m.onDone();
      } else m.onDone();
      this.move = null;
    }
  }
}
