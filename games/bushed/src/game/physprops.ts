// Physical props: pots, lanterns, tins, products on the shelves, tools left on the ground. Each gets a Rapier
// body (convex hull from the prop metadata, or a box from its bounds) with its real mass, and a 'pickup'
// interactable: E picks it up into the hands, click places it, Q drops it, B pockets small things.
import * as THREE from 'three';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { registerInteractable } from './interact';
import { ITEMS } from './items';

export interface PhysProp { obj: THREE.Object3D; body: RAPIER.RigidBody | null; mass: number; itemId?: string; hull?: number[]; half: THREE.Vector3; center: THREE.Vector3 }

const all = new Set<PhysProp>();

function colliderFor(p: PhysProp): RAPIER.ColliderDesc {
  let cd: RAPIER.ColliderDesc | null = null;
  if (p.hull && p.hull.length >= 12) cd = RAPIER.ColliderDesc.convexHull(new Float32Array(p.hull));
  if (!cd) cd = RAPIER.ColliderDesc.cuboid(Math.max(0.01, p.half.x), Math.max(0.01, p.half.y), Math.max(0.01, p.half.z)).setTranslation(p.center.x, p.center.y, p.center.z);
  return cd.setMass(p.mass).setFriction(0.7).setRestitution(0.12).setCollisionGroups(groups(GROUP.DYNAMIC, 0xffff & ~GROUP.HELD));
}

export function spawnBody(p: PhysProp, pos: THREE.Vector3, q: THREE.Quaternion, v?: THREE.Vector3, sleeping = false): void {
  const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    .setLinearDamping(0.1).setAngularDamping(0.3).setCcdEnabled(p.mass < 3).setSleeping(sleeping);
  if (v) desc.setLinvel(v.x, v.y, v.z);
  p.body = physics.world.createRigidBody(desc);
  const col = physics.world.createCollider(colliderFor(p), p.body);
  physics.owner.set(col.handle, p);
  p.obj.position.copy(pos); p.obj.quaternion.copy(q);
  physics.sync(p.body, p.obj);
}

/**
 * Make a scene object a physical, pick-up-able prop. The object must already be in the scene at its world pose
 * (parented directly to the scene or a group at the origin). hull: convex points in the object's local frame.
 */
export function makePhysical(obj: THREE.Object3D, o: { mass: number; itemId?: string; hull?: number[]; asleep?: boolean; label?: string }): PhysProp {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    box.union(b);
  });
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const center = box.getCenter(new THREE.Vector3());
  const p: PhysProp = { obj, body: null, mass: o.mass, itemId: o.itemId, hull: o.hull, half, center };
  const pos = obj.getWorldPosition(new THREE.Vector3()), q = obj.getWorldQuaternion(new THREE.Quaternion());
  if (obj.parent && obj.parent.type !== 'Scene') {
    // re-home under the scene so the body owns the transform
    let root: THREE.Object3D = obj; while (root.parent) root = root.parent;
    obj.removeFromParent(); root.add(obj);
  }
  spawnBody(p, pos, q, undefined, o.asleep ?? true);
  obj.userData.physProp = p;
  obj.userData.itemId = o.itemId ?? obj.userData.itemId;
  obj.userData.onRelease = (pp: THREE.Vector3, qq: THREE.Quaternion, v: THREE.Vector3) => {
    // hands put it back in the world: give it a body again
    let root: THREE.Object3D | null = (obj.userData.home as THREE.Object3D) ?? null;
    if (!root) { root = obj; while (root.parent) root = root.parent; }
    if (obj.parent !== root) { obj.removeFromParent(); root.add(obj); }
    spawnBody(p, pp, qq, v);
  };
  const name = o.label ?? (o.itemId ? ITEMS[o.itemId]?.name : undefined);
  registerInteractable(obj, {
    kind: 'pickup',
    label: (ctx) => (ctx.game?.hands?.busy ? '' : name ? `Pick up ${name.toLowerCase()}` : 'Pick up'),
    use: (ctx) => {
      if (!p.body) return;
      let root: THREE.Object3D = obj; while (root.parent) root = root.parent;
      obj.userData.home = root;
      physics.removeBody(p.body);
      p.body = null;
      ctx.game.hands.grab(obj, undefined, p.mass);
    },
    reach: 2.3,
  });
  all.add(p);
  return p;
}

export function propsNear(pos: THREE.Vector3, r: number): PhysProp[] {
  return [...all].filter((p) => p.body && p.obj.position.distanceTo(pos) < r);
}

export function removeProp(p: PhysProp): void {
  if (p.body) physics.removeBody(p.body);
  p.body = null;
  p.obj.removeFromParent();
  all.delete(p);
}
