// Where the story happens. Ray's trapline runs north from the lake trail, five sets curling round to the
// abandoned Kettle camp on the north shore; his dock is below the camp. Everything is placed on dry ground
// against the layout (src/world/layout.ts), never in the lake.
import * as THREE from 'three';
import { SPOTS, WORLD, heightAt, normalAt } from '../../world/layout';

const dry = (x: number, z: number) => heightAt(x, z) > WORLD.waterY + 0.6;

/** the nearest dry, gentle ground to (x, z) (spiral search) */
export function dryNear(x: number, z: number, maxR = 24): THREE.Vector3 {
  for (let r = 0; r <= maxR; r += 1.5) {
    const n = Math.max(1, Math.round(r * 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (dry(px, pz) && normalAt(px, pz, 1.5)[1] > 0.93) return new THREE.Vector3(px, heightAt(px, pz), pz);
    }
  }
  return new THREE.Vector3(x, heightAt(x, z), z);
}

/** the old camp: centre, and the yaw that turns the camp's +Z to face the lake */
export const CAMP = (() => {
  const c = dryNear(118, -126, 20);
  const yaw = Math.atan2(SPOTS.lake.x - c.x, SPOTS.lake.z - c.z);
  return { pos: c, yaw };
})();

/** camp-local (x right, z toward the lake) to world (x, z) */
export function campXZ(lx: number, lz: number): [number, number] {
  const c = Math.cos(CAMP.yaw), s = Math.sin(CAMP.yaw);
  return [CAMP.pos.x + lx * c + lz * s, CAMP.pos.z - lx * s + lz * c];
}

/** where the trapline starts (the split birch just north of the lake trail) and its five sets */
export const TRAP_HEAD = dryNear(56, -34, 10);
export const SETS = [[48, -60], [46, -90], [62, -116], [82, -138], [100, -142]].map(([x, z]) => dryNear(x, z, 10));

/** the water's edge below the camp: walk from the camp toward the lake until the ground goes under */
export const SHORE = (() => {
  const [sx, sz] = campXZ(0, 0);
  const dx = SPOTS.lake.x - sx, dz = SPOTS.lake.z - sz, L = Math.hypot(dx, dz);
  let last = new THREE.Vector3(sx, heightAt(sx, sz), sz);
  for (let d = 0; d < L; d += 0.5) {
    const x = sx + (dx / L) * d, z = sz + (dz / L) * d;
    if (heightAt(x, z) < WORLD.waterY + 0.15) return { edge: last, dir: Math.atan2(dx, dz) };
    last = new THREE.Vector3(x, heightAt(x, z), z);
  }
  return { edge: last, dir: Math.atan2(dx, dz) };
})();

/** a lookout on the west shore where the ranger watches the lake by day */
export const LOOKOUT = dryNear(112, -58, 14);
/** a stump seat on the shore by the campground, where old Hollis watches the lake by day */
export const HOLLIS_SEAT = (() => {
  const cs = SPOTS.campsite, dx = SPOTS.lake.x - cs.x, dz = SPOTS.lake.z - cs.z, L = Math.hypot(dx, dz);
  return dryNear(cs.x + (dx / L) * 13, cs.z + (dz / L) * 13, 8);
})();
/** the woodshed's cache, by the chopping block */
export const WOODYARD = new THREE.Vector3(SPOTS.woodyard.x, 0, SPOTS.woodyard.z);
