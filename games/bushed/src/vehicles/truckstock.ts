// The truck's repair parts for sale at Pruneau's: a little auto corner beside the gas pump (spare tyres leaning on
// each other, the toolbox, boxed glass and lamps, a tin of bolts, a can of engine bits, the body hammer). Each is a
// display piece: taking one hands you a fresh copy (unpaid, rung up at the register like anything off the shelves).
import * as THREE from 'three';
import { ITEMS } from '../game/items';
import { registerInteractable } from '../game/interact';
import { loadProp, type PropId } from '../places/props';
import { heightAt } from '../world/layout';

// [item id, dx, dz (store-local, from the gas pump anchor), yaw, roll, scale]
const LAYOUT: [string, number, number, number, number, number][] = [
  ['tyre', 1.35, -0.15, 0.3, 1.32, 1],
  ['tyre', 1.62, 0.05, -0.2, 1.2, 1],
  ['toolbox', 2.15, 0.35, 0.4, 0, 1],
  ['windshield', 2.6, -0.1, -0.35, 0, 1.25],
  ['headlamp', 2.25, -0.35, 0.9, 0, 0.55],
  ['headlamp', 2.38, -0.5, 0.2, 0, 0.55],
  ['bumper_bolts', 2.05, 0.65, 0.2, 0, 1],
  ['engine_parts', 2.45, 0.6, -0.6, 0, 1],
  ['panel_hammer', 2.0, 0.05, 1.1, 0, 1],
];

const _w = new THREE.Vector3();

export function stockTruckParts(game: any): void {
  const st = game.store;
  const pump = st?.anchors?.gas_pump as THREE.Object3D | undefined;
  if (!st || !pump || st.group.getObjectByName('TruckStock')) return;
  const group = new THREE.Group(); group.name = 'TruckStock';
  st.group.add(group);
  st.group.updateMatrixWorld(true);
  for (const [id, dx, dz, ry, roll, s] of LAYOUT) {
    const it = ITEMS[id];
    if (!it) continue;
    loadProp(it.model as PropId).then((o) => {
      o.scale.multiplyScalar(s);
      o.rotation.set(0, ry, roll);
      // sit it on the real ground under that spot
      const lx = pump.position.x + dx, lz = pump.position.z + dz;
      _w.set(lx, 0, lz); st.group.localToWorld(_w);
      _w.y = heightAt(_w.x, _w.z);
      st.group.worldToLocal(_w);
      o.position.set(lx, _w.y, lz);
      group.add(o);
      o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o);
      o.position.y += (_w.y + 0.01) - st.group.worldToLocal(bb.min.clone()).y;
      o.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
      o.userData.itemId = id;
      registerInteractable(o, {
        kind: 'pickup', reach: 2.4,
        label: () => `${it.name}  $${it.price}`,
        use: (ctx) => {
          // the display stays put; a copy comes into the hands
          const copy = o.clone();
          const wp = o.getWorldPosition(new THREE.Vector3()), wq = o.getWorldQuaternion(new THREE.Quaternion());
          copy.scale.copy(o.getWorldScale(new THREE.Vector3()));
          game.scene.add(copy); copy.position.copy(wp); copy.quaternion.copy(wq);
          registerInteractable(copy, { kind: 'pickup', label: () => it.name, use: () => undefined });
          game.placeAction('pickup', { ...ctx, itemId: id, object: copy });
        },
      });
    }).catch(() => undefined);
  }
}
