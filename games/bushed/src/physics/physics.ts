// Rapier wrapper: fixed-step world, streamed terrain heightfield patches, body<->mesh sync and query helpers.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { heightAt } from '../world/layout';

export { RAPIER };

/** collision membership bits */
export const GROUP = {
  GROUND: 0x0001, STATIC: 0x0002, DYNAMIC: 0x0004, PLAYER: 0x0008, VEHICLE: 0x0010, DEBRIS: 0x0020, CREATURE: 0x0040, HELD: 0x0080,
};
/** interaction groups word: membership << 16 | filter */
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

const PATCH = 32;
const PATCH_RES = 1;

export interface Synced { body: RAPIER.RigidBody; obj: THREE.Object3D; offset?: THREE.Vector3 }

class Physics {
  world!: RAPIER.World;
  ready = false;
  private patches = new Map<string, RAPIER.Collider>();
  private synced: Synced[] = [];
  private acc = 0;
  readonly step = 1 / 60;
  /** colliders' user data: what game object a collider belongs to */
  readonly owner = new Map<number, unknown>();
  events!: RAPIER.EventQueue;

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.step;
    this.events = new RAPIER.EventQueue(true);
    this.ready = true;
  }

  /** keep terrain heightfield patches loaded within r metres of each focus point */
  streamTerrain(foci: { x: number; z: number }[], r = 64): void {
    const want = new Set<string>();
    for (const f of foci) {
      const c0x = Math.floor((f.x - r) / PATCH), c1x = Math.floor((f.x + r) / PATCH);
      const c0z = Math.floor((f.z - r) / PATCH), c1z = Math.floor((f.z + r) / PATCH);
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) want.add(`${cx},${cz}`);
    }
    let built = 0;
    for (const k of want) {
      if (this.patches.has(k)) continue;
      if (built++ > 6) break;
      const [cx, cz] = k.split(',').map(Number);
      this.patches.set(k, this.buildPatch(cx, cz));
    }
    for (const [k, c] of this.patches) if (!want.has(k)) { this.world.removeCollider(c, false); this.patches.delete(k); }
  }

  private buildPatch(cx: number, cz: number): RAPIER.Collider {
    const n = PATCH / PATCH_RES; // cells per side
    const heights = new Float32Array((n + 1) * (n + 1));
    const x0 = cx * PATCH, z0 = cz * PATCH;
    // column-major: columns along x, rows along z
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) heights[i * (n + 1) + j] = heightAt(x0 + i * PATCH_RES, z0 + j * PATCH_RES);
    const desc = RAPIER.ColliderDesc.heightfield(n, n, heights, { x: PATCH, y: 1, z: PATCH })
      .setTranslation(x0 + PATCH / 2, 0, z0 + PATCH / 2)
      .setFriction(0.9)
      .setCollisionGroups(groups(GROUP.GROUND, 0xffff));
    return this.world.createCollider(desc);
  }

  /** ensure ground exists under a point right now (spawns) */
  ensureGround(x: number, z: number): void { this.streamTerrain([{ x, z }], 40); for (let i = 0; i < 10; i++) this.streamTerrain([{ x, z }], 40); }

  sync(body: RAPIER.RigidBody, obj: THREE.Object3D, offset?: THREE.Vector3): Synced {
    const s = { body, obj, offset };
    this.synced.push(s);
    return s;
  }

  unsync(body: RAPIER.RigidBody): void { this.synced = this.synced.filter((s) => s.body !== body); }

  removeBody(body: RAPIER.RigidBody): void {
    this.unsync(body);
    for (let i = 0; i < body.numColliders(); i++) this.owner.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  /** advance with a fixed step; returns the interpolation alpha. onStep runs before every sub-step. */
  update(dt: number, onStep?: (h: number) => void): void {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= this.step && n < 4) {
      onStep?.(this.step);
      this.world.step(this.events);
      this.acc -= this.step;
      n++;
    }
    if (n === 4) this.acc = 0;
    const q = new THREE.Quaternion();
    for (const s of this.synced) {
      const t = s.body.translation(), r = s.body.rotation();
      q.set(r.x, r.y, r.z, r.w);
      s.obj.position.set(t.x, t.y, t.z);
      if (s.offset) s.obj.position.add(s.offset.clone().applyQuaternion(q));
      s.obj.quaternion.copy(q);
    }
  }

  ray(origin: THREE.Vector3, dir: THREE.Vector3, max: number, filter = 0xffff, exclude?: RAPIER.RigidBody):
    { point: THREE.Vector3; normal: THREE.Vector3; collider: RAPIER.Collider; toi: number } | null {
    const r = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(r, max, true, undefined, groups(0xffff, filter), undefined, exclude);
    if (!hit) return null;
    const p = origin.clone().addScaledVector(dir, hit.timeOfImpact);
    return { point: p, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), collider: hit.collider, toi: hit.timeOfImpact };
  }
}

export const physics = new Physics();
