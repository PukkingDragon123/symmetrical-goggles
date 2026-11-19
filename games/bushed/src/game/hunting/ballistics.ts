// BALLISTICS: hitscan-plus-drop. A bullet is a point moving at 820 m/s (a 7.62x54R soft point), falling under
// gravity and slowing with air drag; every frame it is advanced in short segments (<= 6 m) and each segment is
// tested against everything it could hit: the game animals (their hit zones), standing tree trunks
// (Forest.raycastTrunk), physics colliders (buildings, rocks, logs, the Jeep), the terrain (sampled heightAt with a
// binary refinement) and the lake. Travel time is real: at 200 m the bullet lands a quarter second after the shot
// and 30 cm low unless you hold over. The scope is zeroed at 100 m (the bore sits 3.2 cm under the sight line and is
// angled up to meet it).
//
//   const b = new Ballistics({ animals: () => list, forest, onHit });
//   b.fire(eye, aimDir);            // each frame: b.update(dt)
import * as THREE from 'three';
import { heightAt, normalAt, WORLD } from '../../world/layout';
import { physics, GROUP } from '../../physics/physics';
import type { GameAnimal, HitZone } from '../../creatures/game/animal';

export interface BulletHit {
  kind: 'terrain' | 'tree' | 'solid' | 'animal' | 'water';
  point: THREE.Vector3; normal: THREE.Vector3; dir: THREE.Vector3;
  /** metres flown, seconds in the air, speed at impact (m/s) */
  dist: number; time: number; speed: number;
  animal?: GameAnimal; zone?: HitZone; tree?: unknown;
}
interface Bullet { p: THREE.Vector3; v: THREE.Vector3; t: number; dist: number; done: boolean }
export interface ForestLike { raycastTrunk(o: THREE.Vector3, d: THREE.Vector3, max: number): { ref: unknown; point: THREE.Vector3; normal: THREE.Vector3 } | null }

export const MUZZLE_V = 820;
const G = 9.81, DRAG = 0.55, SEG = 6, LIFE = 3.0;
/** the sight is 3.2 cm over the bore: angle up so the bullet crosses the line of sight at 100 m */
const SIGHT_H = 0.032, ZERO = 100;
const ZERO_UP = (SIGHT_H + 0.5 * G * (ZERO / MUZZLE_V) ** 2 * 1.06) / ZERO;

export class Ballistics {
  readonly bullets: Bullet[] = [];
  /** the last few paths (test page): points along each flight */
  readonly traces: THREE.Vector3[][] = [];
  constructor(private o: { animals: () => GameAnimal[]; forest: () => ForestLike | null; onHit: (h: BulletHit) => void; trace?: boolean }) {}

  /** a shot from the eye along the aim */
  fire(eye: THREE.Vector3, aim: THREE.Vector3) {
    const d = aim.clone().normalize();
    // the bore: under the sight line, tipped up to the zero
    const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, d).normalize();
    const p = eye.clone().addScaledVector(up, -SIGHT_H);
    const v = d.clone().addScaledVector(up, ZERO_UP).normalize().multiplyScalar(MUZZLE_V);
    this.bullets.push({ p, v, t: 0, dist: 0, done: false });
    if (this.o.trace) { this.traces.push([p.clone()]); if (this.traces.length > 8) this.traces.shift(); }
  }

  update(dt: number) {
    for (const b of this.bullets) if (!b.done) this.fly(b, dt);
    for (let i = this.bullets.length - 1; i >= 0; i--) if (this.bullets[i].done) this.bullets.splice(i, 1);
  }

  /** advance a bullet through a frame, segment by segment */
  private fly(b: Bullet, dt: number) {
    let left = dt;
    const trace = this.o.trace ? this.traces[this.traces.length - 1] : null;
    while (left > 0 && !b.done) {
      const speed = b.v.length();
      const h = Math.min(left, SEG / Math.max(speed, 1));
      left -= h;
      const a = b.p.clone();
      // gravity and drag over the step
      const next = b.p.clone().addScaledVector(b.v, h).add(new THREE.Vector3(0, -0.5 * G * h * h, 0));
      const hit = this.segment(a, next, b);
      if (hit) { b.done = true; trace?.push(hit.point.clone()); this.o.onHit(hit); return; }
      b.v.y -= G * h; b.v.multiplyScalar(Math.exp(-DRAG * h));
      b.dist += a.distanceTo(next); b.t += h; b.p.copy(next);
      trace?.push(next.clone());
      if (b.t > LIFE || b.p.y < -50) b.done = true;
    }
  }

  /** the first thing on the segment a -> b */
  private segment(a: THREE.Vector3, b: THREE.Vector3, B: Bullet): BulletHit | null {
    const seg = b.clone().sub(a), L = seg.length();
    if (L < 1e-6) return null;
    const dir = seg.clone().divideScalar(L);
    let best: BulletHit | null = null, bestT = Infinity;
    const take = (t: number, h: Omit<BulletHit, 'dist' | 'time' | 'speed' | 'dir'>) => {
      if (t >= bestT) return;
      bestT = t;
      best = { ...h, dir: dir.clone(), dist: B.dist + t * L, time: B.t + (t * L) / Math.max(B.v.length(), 1), speed: B.v.length() };
    };
    // animals
    for (const an of this.o.animals()) {
      const r = an.hitTest(a, b);
      if (r) take(r.t, { kind: 'animal', point: r.point, normal: dir.clone().negate(), animal: an, zone: r.zone });
    }
    // trees
    const f = this.o.forest();
    if (f) {
      const r = f.raycastTrunk(a, dir, L);
      if (r) take(r.point.distanceTo(a) / L, { kind: 'tree', point: r.point.clone(), normal: r.normal.clone(), tree: r.ref });
    }
    // colliders (not the player, the hands, the creatures' own bodies)
    try {
      const r = physics.ray(a, dir, L, 0xffff & ~GROUP.PLAYER & ~GROUP.HELD & ~GROUP.CREATURE & ~GROUP.GROUND);
      if (r) take(r.toi / L, { kind: 'solid', point: r.point, normal: r.normal });
    } catch { /* physics not ready */ }
    // the terrain: sample along, refine the crossing
    const n = Math.max(2, Math.ceil(L / 0.5));
    let prevT = 0, prevD = a.y - heightAt(a.x, a.z);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (t >= bestT) break;
      const p = a.clone().addScaledVector(seg, t), d = p.y - heightAt(p.x, p.z);
      if (d < 0 && prevD >= 0) {
        let lo = prevT, hi = t;
        for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2, q = a.clone().addScaledVector(seg, m); if (q.y - heightAt(q.x, q.z) < 0) hi = m; else lo = m; }
        const q = a.clone().addScaledVector(seg, hi);
        const [nx, ny, nz] = normalAt(q.x, q.z);
        const water = heightAt(q.x, q.z) < WORLD.waterY;
        if (!water) take(hi, { kind: 'terrain', point: q, normal: new THREE.Vector3(nx, ny, nz) });
        break;
      }
      // the lake's surface
      if (p.y < WORLD.waterY && heightAt(p.x, p.z) < WORLD.waterY) { take(t, { kind: 'water', point: p.clone().setY(WORLD.waterY), normal: new THREE.Vector3(0, 1, 0) }); break; }
      prevT = t; prevD = d;
    }
    return best;
  }
}
