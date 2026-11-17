// ChopSystem: turns a swing into wood. The axe lands where the player aims; what happens depends on the target
// (standing trunk -> notch / felling, fallen stem -> limbing or bucking, upright round -> splitting, lying log ->
// bucking, ground/rock -> a jarring clang that dulls the edge) and on swing charge, tool stats, sharpness,
// wood hardness and the angle of the strike relative to the cut.
import * as THREE from 'three';
import { physics } from '../physics/physics';
import { ChopTree, type TreeEvents } from './tree';
import { WoodPiece } from './wood';
import { debris, puffs } from '../gfx/particles';
import { WOOD, type Species } from './woodtex';
import type { TreeLike, TreeRefLike } from './types';
import type { ToolStats } from '../game/items';
import { heightAt } from '../world/layout';

export interface ForestLike {
  raycastTrunk(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { ref: TreeRefLike & { model(): TreeLike }; point: THREE.Vector3; normal: THREE.Vector3; h: number } | null;
  detach(id: number | string): { object: THREE.Object3D; model: TreeLike };
  remove(id: number | string): void;
}

/** wood properties used by the strike formula */
export const HARDNESS: Record<Species, number> = { spruce: 0.38, fir: 0.32, pine: 0.45, birch: 0.62, cedar: 0.28 };
export const SPLIT_EASE: Record<Species, number> = { spruce: 0.8, fir: 0.85, pine: 0.75, birch: 0.6, cedar: 1.0 };

export type SwingResult =
  | { kind: 'none' }
  | { kind: 'standing'; tree: ChopTree; removed: number; bruised: boolean; diag: boolean; felled: boolean }
  | { kind: 'limb'; tree: ChopTree; cut: boolean }
  | { kind: 'buck'; done: boolean }
  | { kind: 'split'; done: boolean; stuck: boolean }
  | { kind: 'ground'; rock: boolean }
  | { kind: 'refused'; reason: string }
  | { kind: 'object'; obj: THREE.Object3D };

export class ChopSystem {
  readonly trees = new Map<string, ChopTree>();
  readonly pieces = new Set<WoodPiece>();
  readonly group = new THREE.Group();
  private ray = new THREE.Raycaster();

  constructor(private forest: ForestLike | null, private ev: TreeEvents & { piecesChanged?(): void }) {}

  setForest(f: ForestLike): void { this.forest = f; }

  addPiece(p: WoodPiece): void {
    this.pieces.add(p);
    this.group.add(p.mesh);
  }

  removePiece(p: WoodPiece): void {
    p.despawn();
    p.mesh.removeFromParent();
    this.pieces.delete(p);
  }

  /** strike strength in metres of kerf for this swing (before target modifiers) */
  power(tool: ToolStats, charge: number, stamina: number): number {
    const c = Math.pow(THREE.MathUtils.clamp(charge, 0.15, 1), 1.25);
    return 0.03 * c * (0.35 + 0.65 * tool.sharp) * Math.sqrt(Math.max(0.2, tool.headMass) / 1.6) * (0.55 + 0.45 * stamina);
  }

  update(dt: number, cam: THREE.Vector3): void {
    for (const [k, t] of this.trees) {
      t.update(dt, cam);
      if (t.state === 'gone') { this.trees.delete(k); }
    }
  }

  /**
   * Resolve a swing. origin/dir = camera ray, reach = arm + tool, swingDir = the blade's travel direction.
   */
  swing(origin: THREE.Vector3, dir: THREE.Vector3, reach: number, swingDir: THREE.Vector3, tool: ToolStats, charge: number, stamina: number): SwingResult {
    const base = this.power(tool, charge, stamina);
    // 1. physics: pieces, fallen sections, stumps, ground, props
    const phit = physics.ray(origin, dir, reach);
    // 2. standing trees (instanced, not in physics)
    const fhit = this.forest?.raycastTrunk(origin, dir, reach) ?? null;
    // 3. detached standing trees we're already working on (mesh raycast)
    let shit: { tree: ChopTree; point: THREE.Vector3; dist: number; obj: THREE.Object3D } | null = null;
    this.ray.set(origin, dir); this.ray.far = reach;
    for (const t of this.trees.values()) {
      const roots = t.state === 'fallen' ? t.sections.map((s) => s.root) : t.state === 'standing' || t.state === 'creaking' ? [t.root] : [];
      for (const r of roots) {
        const hits = this.ray.intersectObject(r, true);
        if (hits.length && (!shit || hits[0].distance < shit.dist)) shit = { tree: t, point: hits[0].point, dist: hits[0].distance, obj: hits[0].object };
      }
    }
    const dP = phit ? phit.toi : Infinity, dF = fhit ? origin.distanceTo(fhit.point) : Infinity, dS = shit ? shit.dist : Infinity;
    const best = Math.min(dP, dF, dS);
    if (best === Infinity) return { kind: 'none' };

    if (best === dS && shit) {
      const t = shit.tree;
      if (t.state === 'standing' || t.state === 'creaking') return this.hitStanding(t, shit.point, swingDir, base, tool);
      const cls = t.classifyHit(shit.obj);
      if (cls) {
        if (cls.branch) {
          const cut = t.strikeBranch(cls.sec, cls.branch, base * tool.limb * 3.2, shit.point);
          return { kind: 'limb', tree: t, cut };
        }
        const r = t.strikeBuck(cls.sec, shit.point, base * tool.fell / (0.6 + HARDNESS[t.species]), tool.kind === 'saw' || tool.kind === 'chainsaw');
        this.chips(t.species, shit.point, dir, r.removed, false);
        this.ev.sound(tool.kind === 'saw' ? 'saw_stroke' : 'axe_chop', shit.point, 0.9);
        return { kind: 'buck', done: r.done };
      }
    }
    if (best === dF && fhit) {
      const id = String(fhit.ref.id);
      let t = this.trees.get(id);
      if (!t) {
        // giants are beyond an axe
        const model = fhit.ref.model();
        if (model.dbh * fhit.ref.scale > 1.1 && tool.kind !== 'chainsaw') {
          this.ev.sound('axe_glance', fhit.point, 0.8);
          debris.emit('bark', fhit.point, fhit.normal.clone().multiplyScalar(1.5), 3);
          return { kind: 'refused', reason: 'too_big' };
        }
        const d = this.forest!.detach(fhit.ref.id);
        const rot = (Number(fhit.ref.id) * 2654435761 % 1000) / 1000;
        t = new ChopTree(fhit.ref, d.model, d.object, this.ev, { rotten: model.height > 18 && rot < 0.08 });
        this.trees.set(id, t);
        this.group.add(t.root);
        this.group.updateMatrixWorld(true);
      }
      return this.hitStanding(t, fhit.point, swingDir, base, tool);
    }
    if (phit) {
      const owner = physics.owner.get(phit.collider.handle);
      if (owner instanceof WoodPiece) return this.hitPiece(owner, phit.point, dir, swingDir, base, tool, charge);
      if (owner instanceof ChopTree) {
        // fallen trunk collider without a mesh hit (rare): treat as bucking
        const sec = owner.sections.find((s) => s.body && s.body.handle === phit.collider.parent()?.handle);
        if (sec) { const r = owner.strikeBuck(sec, phit.point, base * tool.fell, tool.kind === 'saw'); return { kind: 'buck', done: r.done }; }
      }
      const g = heightAt(phit.point.x, phit.point.z);
      if (Math.abs(phit.point.y - g) < 0.3 && !owner) {
        const rock = phit.normal.y < 0.6;
        this.ev.sound(rock ? 'axe_rock' : 'axe_dirt', phit.point, 0.8);
        if (rock) debris.emit('spark', phit.point, phit.normal.clone().multiplyScalar(3), 6, { spread: 2, color: new THREE.Color(1, 0.7, 0.3) });
        else puffs.emit(phit.point, new THREE.Vector3(0, 0.4, 0), { size: 0.3, grow: 1.5, life: 0.9, color: new THREE.Color(0.4, 0.33, 0.25), alpha: 0.5, n: 2 });
        return { kind: 'ground', rock };
      }
      return { kind: 'object', obj: (phit.collider as any).__obj ?? new THREE.Object3D() };
    }
    return { kind: 'none' };
  }

  private hitStanding(t: ChopTree, point: THREE.Vector3, swingDir: THREE.Vector3, base: number, tool: ToolStats): SwingResult {
    if (t.protectedTree) return { kind: 'refused', reason: 'protected' };
    const amount = (base * tool.fell) / (0.6 + HARDNESS[t.species]);
    const r = t.strikeStanding(point, swingDir, amount);
    if (!r) return { kind: 'none' };
    this.chips(t.species, point, swingDir.clone().negate(), r.removed, r.bruised);
    this.ev.sound(r.bruised ? 'axe_chop_hard' : 'axe_chop', point, 0.7 + Math.min(0.3, r.removed * 20), 0.94 + Math.random() * 0.12);
    return { kind: 'standing', tree: t, removed: r.removed, bruised: r.bruised, diag: r.type === 'diag', felled: t.state === 'falling' };
  }

  private hitPiece(p: WoodPiece, point: THREE.Vector3, dir: THREE.Vector3, swingDir: THREE.Vector3, base: number, tool: ToolStats, charge: number): SwingResult {
    if (!p.body) return { kind: 'none' };
    const r = p.body.rotation();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    const upright = Math.abs(up.y) > 0.82;
    const fromAbove = swingDir.y < -0.35 || dir.y < -0.45;
    if ((p.kind === 'round' || p.kind === 'half') && upright && fromAbove && p.r > 0.06) {
      // splitting along the grain
      const knots = 1 + ((p.id * 7919) % 10) / 22;
      const power = charge * tool.split * (0.6 + 0.4 * tool.sharp) * Math.sqrt(Math.max(0.3, tool.headMass) / 1.6) * SPLIT_EASE[p.spec.species] / (Math.max(0.08, p.r) / 0.16) / knots;
      p.splitProgress += power * 0.6;
      this.chips(p.spec.species, point, new THREE.Vector3(0, 1, 0), 0.004, false);
      if (p.splitProgress >= 1) {
        this.splitPiece(p, point, dir);
        this.ev.sound('wood_split', point, 1, 0.95 + Math.random() * 0.1);
        return { kind: 'split', done: true, stuck: false };
      }
      const stuck = power < 0.55 && Math.random() < 0.5;
      this.ev.sound(stuck ? 'axe_stuck' : 'axe_chop_hard', point, 0.9);
      return { kind: 'split', done: false, stuck };
    }
    if (p.kind === 'log' && p.len > 0.7) {
      // bucking a clean log: progress per piece
      const lp = p.mesh.worldToLocal(point.clone());
      const key = Math.round(lp.y * 5) / 5;
      const kerfs = ((p as any).kerfs ??= new Map<number, number>()) as Map<number, number>;
      const prog = (kerfs.get(key) ?? 0) + (base * tool.fell * (tool.kind === 'saw' ? 1.4 : 1)) / (0.6 + HARDNESS[p.spec.species]) / (p.r * 2) * 1.6;
      kerfs.set(key, prog);
      this.chips(p.spec.species, point, dir.clone().negate(), 0.004, false);
      this.ev.sound(tool.kind === 'saw' ? 'saw_stroke' : 'axe_chop', point, 0.8);
      if (prog >= 1) {
        this.buckPiece(p, lp.y, tool.kind === 'saw');
        return { kind: 'buck', done: true };
      }
      return { kind: 'buck', done: false };
    }
    // anything else just gets knocked
    p.body.applyImpulseAtPoint({ x: dir.x * 25 * charge, y: 6 * charge, z: dir.z * 25 * charge }, point, true);
    this.ev.sound('log_thud', point, 0.5, 1.4);
    return { kind: 'object', obj: p.mesh };
  }

  /** replace a round/half with two pieces split along the blade line */
  splitPiece(p: WoodPiece, point: THREE.Vector3, dir: THREE.Vector3): WoodPiece[] {
    const body = p.body!;
    const r = body.rotation(), t = body.translation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    // blade line angle in piece-local xz
    const ld = dir.clone().applyQuaternion(q.clone().invert());
    const bladeA = Math.atan2(ld.z, ld.x) + Math.PI / 2;
    const a0 = p.spec.a0 ?? 0, a1 = p.spec.a1 ?? Math.PI * 2;
    let cuts: [number, number][];
    if (a1 - a0 >= Math.PI * 2 - 1e-3) cuts = [[bladeA, bladeA + Math.PI], [bladeA + Math.PI, bladeA + Math.PI * 2]];
    else { const m = (a0 + a1) / 2; cuts = [[a0, m], [m, a1]]; }
    const out: WoodPiece[] = [];
    const center = new THREE.Vector3(t.x, t.y, t.z);
    this.removePiece(p);
    for (const [ca, cb] of cuts) {
      const np = new WoodPiece({ ...p.spec, a0: ca, a1: cb, seed: p.spec.seed * 7 + Math.round(ca * 100) });
      const am = (ca + cb) / 2;
      const off = new THREE.Vector3(Math.cos(am), 0, Math.sin(am)).applyQuaternion(q);
      np.quality = p.quality;
      np.spawn(center.clone().addScaledVector(off, p.r * 0.35).add(new THREE.Vector3(0, 0.02, 0)), q, off.clone().multiplyScalar(1.6).add(new THREE.Vector3(0, 0.8, 0)), new THREE.Vector3(off.z * 2, 0, -off.x * 2));
      this.addPiece(np);
      out.push(np);
    }
    debris.emit('splinter', point, new THREE.Vector3(0, 1.5, 0), 6, { spread: 2 });
    debris.emit('chip', point, new THREE.Vector3(0, 1.2, 0), 4, { spread: 1.5 });
    return out;
  }

  /** cut a lying log into two at piece-local y (relative to its centroid) */
  buckPiece(p: WoodPiece, yLocal: number, saw: boolean): WoodPiece[] {
    const body = p.body!;
    const r = body.rotation(), t = body.translation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const ys = p.spec.y0 + (yLocal + p.len / 2);
    const cut = THREE.MathUtils.clamp(ys, p.spec.y0 + 0.2, p.spec.y1 - 0.2);
    const lv = body.linvel();
    const centroidY = (p.spec.y0 + p.spec.y1) / 2;
    this.removePiece(p);
    const out: WoodPiece[] = [];
    for (const [a, b] of [[p.spec.y0, cut], [cut, p.spec.y1]] as [number, number][]) {
      const np = new WoodPiece({ ...p.spec, y0: a, y1: b, seed: p.spec.seed * 3 + Math.round(a * 100), ends: saw ? 'saw' : p.spec.ends });
      np.quality = p.quality;
      const mid = new THREE.Vector3(0, (a + b) / 2 - centroidY, 0).applyQuaternion(q).add(new THREE.Vector3(t.x, t.y, t.z));
      np.spawn(mid, q, new THREE.Vector3(lv.x, lv.y, lv.z));
      this.addPiece(np);
      out.push(np);
    }
    return out;
  }

  chips(sp: Species, p: THREE.Vector3, out: THREE.Vector3, removed: number, bruised: boolean): void {
    const L = WOOD[sp];
    const n = bruised ? 1 : Math.min(9, 2 + Math.round(removed * 250));
    const v = out.clone().normalize().multiplyScalar(2.2).add(new THREE.Vector3(0, 1.4, 0));
    debris.emit('chip', p, v, n, { spread: 2.2, color: new THREE.Color(L.sap[0] / 230, L.sap[1] / 214, L.sap[2] / 174) });
    debris.emit(sp === 'birch' ? 'birchbark' : 'bark', p, v, bruised ? 1 : 2, { spread: 2, color: new THREE.Color(L.bark[0] / 92, L.bark[1] / 68, L.bark[2] / 52) });
    if (!bruised && Math.random() < 0.5) debris.emit('splinter', p, v, 1, { spread: 2 });
    debris.emit('sawdust', p, v.clone().multiplyScalar(0.5), 4, { spread: 1 });
  }
}
