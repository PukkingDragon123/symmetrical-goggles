// Crash damage and repair for the logging truck. The damage half is ported from the author's own taxi game
// หลอนยันปลายทาง (effective-octo-train/src/vehicle/Damage.js):
//   * dents: body vertices round the hit pushed in (falloff), normals rebuilt; the original kept for repair
//   * headlights: a cracked lamp flickers, keeps flickering on the bumps, then dies; both gone = dark
//   * windshield: a spider-web crack (thin strips on the glass) where the driver looks, on a hard frontal hit
//   * bumper: the winch bumper hangs off one corner after a big hit
//   * steam from under the hood as the engine takes damage; handling and top speed get worse; it stalls
//   * a flat tyre on a hard hit (the wheel squats, the truck pulls, speed capped), impact sounds, sparks
// Repair (BUSHED): park at the cabin or the forge, own the toolbox, buy the parts at the store, then hold the use key
// on the damaged part: hammer blows / wrench work with progress on the charge ring, the part visibly comes back
// (dents ease out, the crack fades, the bumper swings up, the hood opens for the engine work).
import * as THREE from 'three';
import { debris, puffs } from '../gfx/particles';
import { audio } from '../audio/audio';
import { input } from '../core/input';
import { hud } from '../ui/hud';
import { SPOTS } from '../world/layout';
import { forgePlacement } from '../places/forge';
import type { InteractCtx } from '../game/interact';
import { propsNear } from '../game/physprops';
import type { Truck } from './truck';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _col = new THREE.Color();

type Part = 'dents' | 'bumper' | 'windshield' | 'headlight_l' | 'headlight_r' | 'tyre' | 'engine';
interface Job { part: Part; progress: number; beat: number; dur: number; need: string[]; done: () => void; tick?: (k: number) => void }

/** what each repair needs (item ids, see truckitems.ts) and how long the work takes (seconds held) */
export const REPAIRS: Record<Part, { need: string[]; dur: number; verb: string; done: string }> = {
  dents: { need: ['panel_hammer'], dur: 5, verb: 'Hammer out the dents', done: 'Not pretty. Straight enough.' },
  bumper: { need: ['bumper_bolts'], dur: 3.5, verb: 'Bolt the bumper back on', done: 'Bumper back where it belongs.' },
  windshield: { need: ['windshield'], dur: 6, verb: 'Fit the new windshield', done: 'New glass. You can see the road again.' },
  headlight_l: { need: ['headlamp'], dur: 2.5, verb: 'Swap the left headlamp', done: 'Left lamp burns bright.' },
  headlight_r: { need: ['headlamp'], dur: 2.5, verb: 'Swap the right headlamp', done: 'Right lamp burns bright.' },
  tyre: { need: ['tyre'], dur: 5, verb: 'Change the flat tyre', done: 'Spare on, lugs torqued in a star.' },
  engine: { need: ['engine_parts'], dur: 7, verb: 'Fix the engine', done: 'Hoses, belt, plugs. She idles smooth again.' },
};

export class TruckDamage {
  /** dent geometry: mesh -> original positions (repair restores) */
  private orig = new Map<THREE.Mesh, { src: THREE.BufferGeometry; pos: Float32Array; dented?: Float32Array }>();
  readonly lamps = { l: 0, r: 0 };
  private lampDie = { l: 0, r: 0 };
  private cracks: THREE.Mesh[] = [];
  private bumper: { rot: THREE.Euler; pos: THREE.Vector3; side: number; k: number } | null = null;
  private steamT = 0;
  hazards = false;
  private job: Job | null = null;
  private hoodOpen = 0;
  private hoodT = 0;
  private rng = 77;

  constructor(private t: Truck) {}

  private rand(): number { this.rng = (this.rng * 16807) % 2147483647; return (this.rng - 1) / 2147483646; }
  get level(): number { return this.t.phys.damage.level; }

  /** an impact: speed = m/s into the obstacle */
  hit(c: { point: THREE.Vector3; speed: number; normal: THREE.Vector3 }): void {
    const sev = Math.max(0, c.speed);
    if (sev < 1.4) return;
    const T = this.t, D = T.phys.damage;
    const local = T.root.worldToLocal(_v.copy(c.point));
    const front = local.z > 1.2, rear = local.z < -2.4;
    const side = Math.sign(local.x) || 1;
    if (sev > 3.5) debris.emit('spark', c.point, _w.copy(c.normal).multiplyScalar(2).add(_c.set(0, 1.5, 0)), Math.round(6 + sev * 2), { spread: 1.2 });
    debris.emit('chip', c.point, _w.copy(c.normal).multiplyScalar(1.5).add(_c.set(0, 1, 0)), Math.round(3 + sev), { color: _col.setRGB(0.25, 0.3, 0.22) });
    this.dent(c.point, Math.min(0.12, 0.014 + sev * 0.01), 0.3 + Math.min(0.32, sev * 0.03));
    if (front && sev > 3) this.breakLamp(side > 0 ? 'l' : 'r', sev > 7 ? 1 : 0.5);
    if (front && sev > 6.5) this.crack(sev);
    if ((front || rear) && sev > 5.5 && front) this.hangBumper(side);
    if (sev > 6.2 && D.flat < 0 && this.rand() < 0.55 + (sev - 6) * 0.1) this.flat(local);
    if (front && sev > 3.5) D.engine = Math.max(0, D.engine - sev * 0.045);
    D.level = Math.min(1, D.level + sev * 0.03);
    D.pull = clamp(D.pull + side * sev * 0.0035, -0.07, 0.07);
    if (sev > 7) this.hazards = true;
  }

  /** push body vertices near a world point in toward the truck's centre line */
  dent(p: THREE.Vector3, depth: number, radius: number): void {
    const T = this.t;
    T.root.getWorldPosition(_c);
    const body = T.nodes.body;
    if (!body) return;
    body.updateMatrixWorld(true);
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || /glass|wheel|light|interior|steering|needle|bed|chassis|plate/i.test(o.name + (o.parent?.name ?? ''))) return;
      if (this.isUnder(o, 'bed') || this.isUnder(o, 'interior')) return;
      const geo = mesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      _w.copy(geo.boundingSphere!.center).applyMatrix4(mesh.matrixWorld);
      if (_w.distanceTo(p) > geo.boundingSphere!.radius + radius) return;
      let rec = this.orig.get(mesh);
      if (!rec) {
        const own = geo.clone();
        rec = { src: geo, pos: Float32Array.from(geo.attributes.position.array as Float32Array) };
        mesh.geometry = own;
        this.orig.set(mesh, rec);
      }
      const pa = mesh.geometry.attributes.position as THREE.BufferAttribute;
      _m.copy(mesh.matrixWorld).invert();
      let any = false;
      for (let i = 0; i < pa.count; i++) {
        _v.fromBufferAttribute(pa, i).applyMatrix4(mesh.matrixWorld);
        const d = _v.distanceTo(p);
        if (d > radius) continue;
        const k = 1 - d / radius;
        _w.copy(_c).sub(p).setY(0).normalize().multiplyScalar(depth * k * k * (0.8 + 0.4 * this.rand()));
        _v.add(_w).applyMatrix4(_m);
        pa.setXYZ(i, _v.x, _v.y, _v.z);
        any = true;
      }
      if (any) { pa.needsUpdate = true; mesh.geometry.computeVertexNormals(); }
    });
  }
  private isUnder(o: THREE.Object3D, name: string): boolean { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name === name) return true; return false; }

  breakLamp(k: 'l' | 'r', amount: number): void {
    this.lamps[k] = Math.min(1, this.lamps[k] + amount);
    this.lampDie[k] = 8 + this.rand() * 14;
    this.t.sound.shot('glass', this.t.root.position, 0.7, 1.4);
  }

  /** a spider-web crack where the driver looks through the windshield */
  crack(sev: number): void {
    const T = this.t, pane = T.nodes.glass_windshield as THREE.Mesh | undefined;
    if (!pane || this.cracks.length >= 2) return;
    const mesh = (pane.isMesh ? pane : pane.children.find((c) => (c as THREE.Mesh).isMesh)) as THREE.Mesh | undefined;
    if (!mesh) return;
    const eye = T.eye(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(T.root.quaternion);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(T.root.quaternion);
    const dir = fwd.clone().addScaledVector(left, -0.25 * this.cracks.length).add(new THREE.Vector3(0, -0.06, 0)).normalize();
    mesh.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(eye, dir, 0.05, 3).intersectObject(mesh, false)[0];
    if (!hit) return;
    const n = hit.face ? hit.face.normal.clone().transformDirection(mesh.matrixWorld) : fwd.clone().negate();
    if (n.dot(fwd) > 0) n.negate();
    const u = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(u, n).normalize();
    const C = hit.point.clone().addScaledVector(n, 0.003);
    const pos: number[] = [];
    const seg = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
      const d = b.clone().sub(a).normalize(), s = new THREE.Vector3().crossVectors(d, n).normalize().multiplyScalar(w);
      pos.push(...a.clone().add(s).toArray(), ...a.clone().sub(s).toArray(), ...b.clone().add(s).toArray(), ...a.clone().sub(s).toArray(), ...b.clone().sub(s).toArray(), ...b.clone().add(s).toArray());
    };
    const P = (r: number, a: number) => C.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    const arms = 9 + Math.round(sev / 3), angs: number[] = [];
    for (let i = 0; i < arms; i++) {
      const a0 = (i / arms) * Math.PI * 2 + (this.rand() - 0.5) * 0.4;
      angs.push(a0);
      let prev = C.clone(), r = 0, a = a0;
      const len = 0.16 + this.rand() * 0.24 + sev * 0.012;
      while (r < len) { r += 0.02 + this.rand() * 0.035; a += (this.rand() - 0.5) * 0.18; const q = P(r, a); seg(prev, q, 0.0014 * (1 - r / len) + 0.0005); prev = q; }
    }
    for (const rr of [0.04, 0.09, 0.16]) for (let i = 0; i < arms; i++) if (this.rand() < 0.75) seg(P(rr * (0.9 + this.rand() * 0.2), angs[i]), P(rr * (0.9 + this.rand() * 0.2), angs[(i + 1) % arms]), 0.0007);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const crack = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe6ebe8, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    crack.name = 'windshieldCrack';
    crack.renderOrder = 6;
    mesh.add(crack);
    crack.applyMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).invert());
    this.cracks.push(crack);
    T.sound.shot('glass', hit.point, 0.9, 0.9);
  }

  hangBumper(side: number): void {
    const b = this.t.nodes.bumper_front;
    if (!b || this.bumper) return;
    this.bumper = { rot: b.rotation.clone(), pos: b.position.clone(), side, k: 0 };
    this.t.sound.shot('clank', this.t.root.position, 0.8, 0.7);
  }

  private flat(local: THREE.Vector3): void {
    const D = this.t.phys.damage;
    D.flat = (local.z > -0.3 ? 0 : 2) + (local.x > 0 ? 0 : 1);
    const w = this.t.nodes[['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'][D.flat]];
    if (w) { w.getWorldPosition(_v); this.t.sound.shot('pop', _v, 1, 1); puffs.emit(_v, _w.set(0, 0.8, 0), { size: 0.4, grow: 3, life: 1.2, color: _col.setRGB(0.55, 0.5, 0.42), alpha: 0.35, n: 4, spread: 0.3 }); }
    hud.say('<i>Bang. That was a tyre.</i>', 3);
  }

  /** headlamp brightness 0..1 for the spot (both lamps) */
  headlights(): number { return (this.lampLevel('l') + this.lampLevel('r')) / 2; }
  lampLevel(k: 'l' | 'r'): number {
    const d = this.lamps[k];
    if (d >= 1) return 0;
    if (d <= 0) return 1;
    const t = performance.now() * 0.001;
    return Math.max(0, 0.5 + 0.35 * Math.sin(t * 31 + (k === 'l' ? 0 : 2)) * Math.sin(t * 7.3)) * (Math.sin(t * 2.1 + d * 9) > 0.85 ? 0.1 : 1);
  }
  steamLevel(): number { return clamp((0.65 - this.t.phys.damage.engine) * 2, 0, 1); }

  /** the hurt engine coughs out (called every physics step) */
  stalled(dt: number): boolean {
    const T = this.t, P = T.phys, h = P.damage.engine;
    if (!P.engineOn) return false;
    let p = 0;
    if (h < 0.45) p = (0.45 - h) * 0.22 * (P.rpm < 1100 ? 2 : 1);
    if (P.inWater > 0.75) p = 2;
    if (Math.random() < p * dt) {
      P.engineOn = false;
      hud.say(P.inWater > 0.75 ? '<i>Water in the intake. It drowned.</i>' : '<i>It coughs and dies.</i>', 3);
      return true;
    }
    return false;
  }

  /** turn the key after a stall: a hurt engine may need a few tries */
  tryStart(): boolean {
    const T = this.t, h = T.phys.damage.engine;
    if (T.phys.inWater > 0.75) { audio.play('veh_crank_fail', { pos: T.root.position, vol: 0.9 }); return false; }
    if (h > 0.45 || Math.random() < 0.25 + h) { T.running = true; return true; }
    audio.play('veh_crank_fail', { pos: T.root.position, vol: 0.9 });
    return false;
  }

  /** per physics step: flicker-then-die lamps, the hanging bumper swing, steam */
  update(dt: number): void {
    const T = this.t, sp = Math.abs(T.phys.v);
    for (const k of ['l', 'r'] as const) if (this.lamps[k] > 0 && this.lamps[k] < 1) {
      this.lampDie[k] -= dt * (0.4 + sp * 0.05 + T.bump() * 4);
      if (this.lampDie[k] <= 0) { this.lamps[k] = 1; T.sound.shot('glass', T.root.position, 0.3, 2); }
    }
    const b = T.nodes.bumper_front;
    if (b && this.bumper) {
      const B = this.bumper;
      B.k = Math.min(1, B.k + dt * 3);
      const sway = Math.sin(performance.now() * 0.004 * (1 + sp * 0.1)) * 0.03 * Math.min(1, sp / 5 + T.bump());
      b.rotation.set(B.rot.x + 0.22 * B.k + sway, B.rot.y, B.rot.z + B.side * 0.13 * B.k);
      b.position.set(B.pos.x, B.pos.y - 0.07 * B.k, B.pos.z);
    }
    const st = this.steamLevel();
    if (st > 0 && (this.steamT -= dt) <= 0) {
      this.steamT = 0.12 / (0.3 + st);
      const a = T.tmeta.anchors.hood;
      if (a) {
        T.sprung.localToWorld(_v.set(a[0], a[1] + 0.05, a[2] - 0.2).sub(T.sprung.position));
        puffs.emit(_v, _w.set((Math.random() - 0.5) * 0.4, 0.9 + st * 0.6, 0.3), { size: 0.22, grow: 3.2, life: 1.8, color: _col.setRGB(0.86, 0.87, 0.88), alpha: 0.18 + st * 0.2, rise: 0.6, n: 2, spread: 0.25 });
      }
    }
    // the hood opens while the engine is being worked on
    this.hoodOpen += ((this.hoodT) - this.hoodOpen) * Math.min(1, dt * 3);
    const hood = T.nodes.hood;
    if (hood) hood.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -0.95 * this.hoodOpen);
  }

  // ------------------------------------------------------------------------------------------------- repair
  /** what is broken that this object stands for */
  private partsFor(o: THREE.Object3D): Part[] {
    const D = this.t.phys.damage, out: Part[] = [];
    const n = o.name;
    if (n === 'hood' && D.engine < 0.97) out.push('engine');
    if (n === 'bumper_front' && this.bumper) out.push('bumper');
    if (n === 'glass_windshield' && this.cracks.length) out.push('windshield');
    if (n === 'light_head_l' && this.lamps.l > 0) out.push('headlight_l');
    if (n === 'light_head_r' && this.lamps.r > 0) out.push('headlight_r');
    if (n.startsWith('wheel_') && D.flat === ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].indexOf(n)) out.push('tyre');
    // the cab and any panel: beat the dents out
    if ((n === 'body' || n === 'hood' || n === 'bumper_front') && this.orig.size) out.push('dents');
    return out;
  }

  /** where the truck may be worked on: the cabin yard or the forge (tools, a level spot, light) */
  workshop(): string | null {
    const p = this.t.root.position;
    if (Math.hypot(p.x - SPOTS.cabin.x, p.z - SPOTS.cabin.z) < 30) return 'cabin';
    const f = forgePlacement();
    if (Math.hypot(p.x - f.x, p.z - f.z) < 16) return 'forge';
    return null;
  }

  /** on the belt, or set down within a few steps of the truck (a five-slot belt can't carry the whole garage) */
  private has(g: any, id: string): boolean {
    if (g?.owns?.(id)) return true;
    for (const p of propsNear(this.t.root.position, 7)) if (p.itemId === id || p.obj.userData.itemId === id) return true;
    return false;
  }

  label(o: THREE.Object3D, ctx: InteractCtx): string {
    if (this.t.occupied || this.job) return this.job ? `${REPAIRS[this.job.part].verb}… ${Math.round(this.job.progress * 100)}%` : '';
    const parts = this.partsFor(o);
    if (!parts.length) return '';
    const part = parts[0], R = REPAIRS[part], g = ctx.game;
    if (Math.abs(this.t.phys.v) > 0.3 || !this.workshop()) return '';
    if (!this.has(g, 'toolbox')) return `${R.verb}: needs the toolbox (store)`;
    const miss = R.need.filter((id) => !this.has(g, id));
    if (miss.length) return `${R.verb}: needs ${miss.map((m) => NEED_NAMES[m] ?? m).join(', ')}`;
    return `${R.verb} (hold)`;
  }

  use(o: THREE.Object3D, ctx: InteractCtx): boolean {
    if (this.t.occupied) return false;
    const parts = this.partsFor(o);
    if (!parts.length) return false;
    const part = parts[0], R = REPAIRS[part], g = ctx.game;
    if (!this.workshop() || !this.has(g, 'toolbox') || R.need.some((id) => !this.has(g, id)) || Math.abs(this.t.phys.v) > 0.3) {
      hud.say(`<i>${this.label(o, ctx)}.</i>`, 2.5);
      return true;
    }
    this.startJob(part, g);
    return true;
  }

  private startJob(part: Part, g: any): void {
    const T = this.t, R = REPAIRS[part], D = T.phys.damage;
    const job: Job = { part, progress: 0, beat: 0, dur: R.dur, need: R.need, done: () => {} };
    if (part === 'dents') {
      for (const [, rec] of this.orig) rec.dented = undefined;
      for (const [mesh, rec] of this.orig) rec.dented = Float32Array.from((mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array);
      job.tick = (k) => {
        for (const [mesh, rec] of this.orig) {
          if (!rec.dented) continue;
          const pa = mesh.geometry.attributes.position as THREE.BufferAttribute, arr = pa.array as Float32Array;
          for (let i = 0; i < arr.length; i++) arr[i] = rec.dented[i] + (rec.pos[i] - rec.dented[i]) * k;
          pa.needsUpdate = true;
        }
      };
      job.done = () => {
        for (const [mesh, rec] of this.orig) { mesh.geometry.dispose(); mesh.geometry = rec.src; }
        this.orig.clear();
        D.level = Math.max(0, D.level - 0.5); D.pull *= 0.3;
      };
    } else if (part === 'bumper') {
      job.tick = (k) => { if (this.bumper) this.bumper.k = 1 - k; };
      job.done = () => { const b = T.nodes.bumper_front; if (b && this.bumper) { b.rotation.copy(this.bumper.rot); b.position.copy(this.bumper.pos); } this.bumper = null; D.level = Math.max(0, D.level - 0.15); };
    } else if (part === 'windshield') {
      job.tick = (k) => { for (const c of this.cracks) (c.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k); };
      job.done = () => { for (const c of this.cracks.splice(0)) { c.removeFromParent(); c.geometry.dispose(); (c.material as THREE.Material).dispose(); } };
    } else if (part === 'headlight_l' || part === 'headlight_r') {
      const k = part === 'headlight_l' ? 'l' : 'r';
      job.done = () => { this.lamps[k] = 0; };
    } else if (part === 'tyre') {
      job.done = () => { D.flat = -1; D.level = Math.max(0, D.level - 0.1); };
    } else if (part === 'engine') {
      this.hoodT = 1;
      job.tick = (k) => { D.engine = Math.max(D.engine, k * 0.999); };
      job.done = () => { D.engine = 1; this.hazards = false; setTimeout(() => { this.hoodT = 0; audio.play('door_shut', { pos: T.root.position, vol: 0.6 }); }, 600); };
    }
    this.job = job;
    this.game = g;
    hud.say(`<i>Hold to work.</i>`, 1.5);
  }
  private game: any = null;

  /** per frame (installTruck): hold-to-work progress, blows, sparks, the charge ring as a progress bar */
  frame(dt: number): void {
    const job = this.job, g = this.game;
    if (!job || !g) return;
    const T = this.t, held = input.held('KeyE') || input.held('Mouse0') || input.held('Mouse2');
    const near = g.player.pos.distanceTo(T.root.position) < 6;
    if (!near || T.occupied) { this.job = null; hud.setCharge(0); if (job.part === 'engine') this.hoodT = 0; return; }
    if (held) {
      job.progress = Math.min(1, job.progress + dt / job.dur);
      job.beat -= dt;
      if (job.beat <= 0) {
        job.beat = job.part === 'dents' ? 0.42 : job.part === 'windshield' ? 0.9 : 0.6;
        const at = g.hands?.focus?.point ?? T.root.position;
        if (job.part === 'dents' || job.part === 'bumper') {
          audio.play('truck_knock', { pos: at, vol: 0.9, rate: 0.85 + Math.random() * 0.3 });
          debris.emit('spark', at, _w.set(0, 1.2, 0), 3, { spread: 0.8 });
          g.player?.addShake?.(0.04);
        } else if (job.part === 'windshield') audio.play('bag_rustle', { pos: at, vol: 0.6 });
        else { T.sound.shot('clank', at, 0.5, 1 + Math.random() * 0.3); }
        g.arms?.play?.('push');
      }
      job.tick?.(job.progress);
    }
    g.hud?.setCharge?.(job.progress);
    hud.setCharge(job.progress);
    if (job.progress >= 1) {
      for (const id of job.need) {
        if (id === 'panel_hammer') continue;
        if (!g.take(id)) { const p = propsNear(T.root.position, 7).find((q) => q.itemId === id || q.obj.userData.itemId === id); if (p) p.obj.removeFromParent(); }
      }
      job.done();
      this.job = null;
      hud.setCharge(0);
      hud.say(`<i>${REPAIRS[job.part].done}</i>`, 3.5);
      audio.play('sigh_satisfied', { vol: 0.5 });
    }
  }

  get working(): boolean { return !!this.job; }

  /** everything fixed (a fresh truck, or the end of a long night at the forge) */
  repairAll(): void {
    for (const [mesh, rec] of this.orig) { mesh.geometry.dispose(); mesh.geometry = rec.src; }
    this.orig.clear();
    for (const c of this.cracks.splice(0)) { c.removeFromParent(); c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    const b = this.t.nodes.bumper_front;
    if (b && this.bumper) { b.rotation.copy(this.bumper.rot); b.position.copy(this.bumper.pos); }
    this.bumper = null;
    this.lamps.l = this.lamps.r = 0;
    Object.assign(this.t.phys.damage, { level: 0, pull: 0, flat: -1, engine: 1 });
    this.hazards = false;
  }

  /** a summary for saves and the journal */
  get state(): { level: number; flat: number; engine: number; lamps: [number, number]; cracked: boolean; bumper: boolean; dents: number } {
    const D = this.t.phys.damage;
    return { level: D.level, flat: D.flat, engine: D.engine, lamps: [this.lamps.l, this.lamps.r], cracked: this.cracks.length > 0, bumper: !!this.bumper, dents: this.orig.size };
  }
}

const NEED_NAMES: Record<string, string> = {
  toolbox: 'the toolbox', panel_hammer: 'a body hammer', bumper_bolts: 'bumper bolts', windshield: 'a windshield', headlamp: 'a headlamp',
  tyre: 'a spare tyre', engine_parts: 'engine parts',
};
void _m;
