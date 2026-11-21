// Meshes for the inventory's world objects: the stash crate in the cabin (Ray's plank footlocker, lid on a hinge)
// and the canvas sack that holds whatever did not fit on the belt.
import * as THREE from 'three';
import { Mesher, Rand, board, boxAt, tube, V } from '../../places/kit';
import { canvasTex } from '../../gfx/tex';
import { paintDuck } from './paint';

/** crate size (outside, metres): width x height x depth; origin on the floor at the centre, front toward +Z */
export const CRATE = { w: 0.74, h: 0.44, d: 0.44 };

/** the stash: a plank footlocker with iron corners, rope handles and a hinged lid (returns the lid pivot) */
export function crateMesh(): { root: THREE.Group; lid: THREE.Group } {
  const r = new Rand(4417);
  const { w, h, d } = CRATE;
  const ms = new Mesher();
  const t = 0.022, lidH = 0.06, body = h - lidH;
  // floor and three planks a side with hairline gaps, end battens
  board(ms, 'board_dark', r, 0, 0.012, 0, w - 0.02, 0.024, d - 0.02, 0, { grain: 'x' });
  for (let k = 0; k < 3; k++) {
    const y = 0.02 + (k + 0.5) * ((body - 0.02) / 3);
    const ph = (body - 0.02) / 3 - 0.005;
    for (const s of [-1, 1]) board(ms, 'board_warm', r, 0, y, s * (d / 2 - t / 2), w - 0.03, ph, t, 0, { grain: 'x' });
    for (const s of [-1, 1]) board(ms, 'board_warm', r, s * (w / 2 - t / 2), y, 0, t, ph, d - 2 * t, 0, { grain: 'z' });
  }
  // corner posts and iron corner straps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    board(ms, 'board_dark', r, sx * (w / 2 - 0.03), body / 2, sz * (d / 2 - 0.03), 0.04, body, 0.04);
    boxAt(ms, 'iron', sx * (w / 2 + 0.001), body - 0.05, sz * (d / 2 - 0.035), 0.004, 0.07, 0.07);
    boxAt(ms, 'iron', sx * (w / 2 - 0.035), body - 0.05, sz * (d / 2 + 0.001), 0.07, 0.07, 0.004);
    boxAt(ms, 'iron', sx * (w / 2 + 0.001), 0.04, sz * (d / 2 - 0.035), 0.004, 0.06, 0.07);
    boxAt(ms, 'iron', sx * (w / 2 - 0.035), 0.04, sz * (d / 2 + 0.001), 0.07, 0.06, 0.004);
  }
  // rope handles on the ends, a dark inside
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + 0.012);
    tube(ms, 'rope', [V(x, body - 0.1, -0.09), V(x + s * 0.03, body - 0.14, -0.05), V(x + s * 0.035, body - 0.155, 0), V(x + s * 0.03, body - 0.14, 0.05), V(x, body - 0.1, 0.09)], 0.009, 5, { smooth: true, samples: 10 });
  }
  boxAt(ms, 'soot', 0, body - 0.006, 0, w - 2 * t - 0.01, 0.004, d - 2 * t - 0.01);
  const root = new THREE.Group();
  root.add(ms.build({ name: 'stash_crate' }));
  // the lid: a frame of planks on a hinge along the back edge
  const lid = new THREE.Group();
  lid.position.set(0, body, -d / 2);
  const lm = new Mesher();
  for (let k = 0; k < 3; k++) board(lm, 'board_warm', r, 0, lidH / 2, d / 2 + (k - 1) * (d / 3) - 0.0, w + 0.01, 0.024, d / 3 - 0.004, 0, { grain: 'x' });
  for (const s of [-1, 1]) board(lm, 'board_dark', r, s * (w / 2 - 0.05), lidH / 2 - 0.02, d / 2, 0.06, 0.03, d - 0.02, 0, { grain: 'z' });
  boxAt(lm, 'iron', 0, lidH / 2 + 0.002, d - 0.004, 0.06, 0.03, 0.006);
  boxAt(lm, 'iron', 0, lidH / 2 - 0.02, d + 0.002, 0.03, 0.05, 0.004);
  for (const s of [-1, 1]) boxAt(lm, 'iron', s * 0.22, lidH / 2 + 0.013, 0.05, 0.03, 0.003, 0.1);
  lid.add(lm.build({ name: 'stash_lid' }));
  root.add(lid);
  // a hasp on the front
  return { root, lid };
}

let sackMat: THREE.MeshStandardMaterial | null = null;
let sackGeo: THREE.BufferGeometry | null = null;
/** a canvas sack, cinched with a cord: about 30 cm tall (shared geometry and material; clone freely) */
export function sackMesh(): THREE.Mesh {
  sackMat ??= new THREE.MeshStandardMaterial({ map: canvasTex(paintDuck(128, [128, 112, 74], 77, { grime: 1.2 }), { repeat: true }), roughness: 1, side: THREE.DoubleSide });
  if (!sackGeo) {
    // a slumped lathe: flat bottom, a fat belly, the neck pinched by the cord, a flared ruff of cloth above it
    const prof: [number, number][] = [[0.001, 0], [0.09, 0.003], [0.125, 0.03], [0.135, 0.09], [0.12, 0.16], [0.075, 0.215], [0.04, 0.24], [0.034, 0.25], [0.05, 0.27], [0.065, 0.29], [0.05, 0.3]];
    const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14);
    const p = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      // folds and a lean: the weight of whatever is inside sags it to one side
      const fold = 1 + 0.07 * Math.sin(a * 5 + y * 30) * Math.min(1, y * 6) + 0.05 * Math.sin(a * 2.3 + 1);
      p.setXYZ(i, x * fold * 1.12 + y * 0.12 * Math.max(0, 0.16 - y), y * 0.92, z * fold * 0.92);
      uv.setXY(i, uv.getX(i) * 2.2, y * 3);
    }
    g.computeVertexNormals();
    sackGeo = g;
  }
  const m = new THREE.Mesh(sackGeo, sackMat);
  m.castShadow = true;
  m.name = 'sack';
  return m;
}
