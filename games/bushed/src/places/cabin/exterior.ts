// The outside of Ray's cabin, layered like everything else he owns: a whitetail rack over the door and moose
// palms on the porch gable, the hand-painted CHEZ RAY slab on the porch beam, a dial thermometer on the post, the
// coffee-can ashtray by the rocker, a two-four of empties, the cooler, rods in the corner, a wool blanket airing
// on the rail, a boot scraper at the steps, the boot tray and coir mat at the door, junk stored under the porch,
// and on the road side of the cabin a two-man crosscut saw, a toboggan and a NO HUNTING sign hung on the logs.
// Ground: worn paths, mud at the steps, needle drifts and the drip line under the eaves.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, lathe, tube, extrude } from '../kit';
import { CABIN, CABIN_GEOM } from '../cabinplan';
import type { DressCtx } from '../dressing';
import { bakeProduct, bakeProp, cellBox, cellLathe, cellTube, atlasQuad, groundDecal, tuft, noRay, farCull } from './bake';

const { W, D, R, FLOOR: F, PORCH, OH } = CABIN;
const { EAVE } = CABIN_GEOM;

export async function cabinExterior(c: DressCtx): Promise<void> {
  const ms = new Mesher();         // details that cast shadows
  const dms = c.dms;               // decals
  const r = new Rand(8080);
  const pending: Promise<unknown>[] = [];
  const z0 = D / 2 + R + 0.01, z1 = D / 2 + PORCH;
  const wallZ = D / 2 + R;         // outer face of the front logs
  const door = { c: -0.92, w: 0.92 };
  const hi = c.detail > 0;

  // ---- whitetail rack over the door, moose palms on the porch gable
  deerRack(ms, door.c, F + 2.32, wallZ + 0.02, 0, 1);
  moosePalms(ms, 0, EAVE + 0.3, z1 - 0.08 + 0.1, 0);

  // ---- CHEZ RAY: a live-edge slab nailed to the porch beam over the steps
  {
    const x = door.c - 0.25, y = EAVE - 0.11, z = z1 - 0.08 + 0.13;
    ms.pushT(x, y, z, 0, 0, -0.025);
    box(ms, 'board_grey', 1.12, 0.27, 0.035, { grain: 'x' });
    ms.pushT(0, 0, 0.0185);
    atlasQuad(ms, 'cab_paper', 'paper', 'sign_ray', 1.1, 0.27);
    ms.pop();
    for (const nx of [-0.5, 0.5]) boxAt(ms, 'iron', nx, 0.02, 0.022, 0.012, 0.012, 0.01);
    ms.pop();
  }
  // ---- dial thermometer on the left porch post, a coil of rope on a nail on the right post
  {
    const x = -W / 2 - 0.02, y = F + 1.45, z = z1 - 0.08 + 0.1;
    ms.pushT(x, y, z, 0, Math.PI / 2);
    cellLathe(ms, 'cab_paint', 'paint', 'enamel_white', [[0, 0], [0.085, 0], [0.09, 0.012], [0.085, 0.022], [0, 0.022]], 16);
    ms.pop();
    ms.pushT(x, y, z + 0.024, 0, 0, 0.6);
    boxAt(ms, 'rusty_red', 0, 0.03, 0, 0.006, 0.07, 0.003);
    ms.pop();
    ropeCoil(ms, W / 2 + 0.02, F + 1.6, z1 - 0.08 + 0.11, 0.08, 0.01, 'manila');
  }
  // ---- the rocker's corner: coffee-can ashtray (butts and ash), a two-four of empties, the dog's bowl
  {
    const ax = -2.3, az = 4.72;
    ms.pushT(ax, F, az);
    cellLathe(ms, 'cab_paint', 'paint', 'coffee_can', [[0, 0.002], [0.075, 0.002], [0.076, 0.01], [0.076, 0.165], [0.073, 0.168], [0.071, 0.165], [0.071, 0.02]], 14);
    lathe(ms, 'soot', [[0.071, 0.12], [0, 0.125]], 12);
    for (let k = 0; k < 7; k++) {
      const a = r.range(0, 6.28), d = r.range(0, 0.05);
      ms.pushT(Math.cos(a) * d, 0.13, Math.sin(a) * d, r.range(0, 6), r.range(0.6, 1.4));
      cellLathe(ms, 'cab_paint', 'paint', k % 3 ? 'enamel_white' : 'orange', [[0.004, 0], [0.004, 0.028], [0, 0.028]], 5);
      ms.pop();
    }
    ms.pop();
    groundDeck(dms, 'ash', ax + 0.1, az + 0.08, 0.3, 0.25);
    // two-four of empties against the wall under the snowshoes
    const bx = -2.05, bz = wallZ + 0.24;
    cellBox(ms, 'cab_paint', 'paint', 'kraft', bx, F + 0.125, bz, 0.42, 0.25, 0.28, 0.08);
    for (let k = 0; k < 4; k++) bakeProduct(ms, 'beer', bx - 0.15 + k * 0.08 + r.range(-0.01, 0.01), F + 0.25, bz + r.range(-0.06, 0.06), r.range(0, 6));
    bakeProduct(ms, 'beer', bx + 0.32, F + 0.032, bz + 0.12, 1.2, 0, Math.PI / 2);
    bakeProduct(ms, 'beer', -1.5, F, 4.05, 0.3);
    // the dog's bowl by the steps
    ms.pushT(-0.25, F, 4.75);
    lathe(ms, 'galv', [[0, 0], [0.09, 0], [0.11, 0.05], [0.115, 0.055], [0.11, 0.055], [0.085, 0.006], [0, 0.006]], 14);
    ms.pop();
  }
  // ---- boot tray and coir mat at the door, a rubber boot pair, a broom leaning
  {
    cellBox(ms, 'cab_paint', 'paint', 'tan_canvas', door.c, F + 0.006, wallZ + 0.33, 0.62, 0.012, 0.4, 0.04);
    boxAt(ms, 'cab_rubber', door.c + 0.78, F + 0.01, wallZ + 0.22, 0.62, 0.02, 0.34, -0.03);
    pending.push(bakeProp(ms, 'rubber_boots', door.c + 0.7, F + 0.02, wallZ + 0.22, 0.2));
    if (hi) pending.push(bakeProp(ms, 'garden_gloves_01', 1.2, F + 0.92 + 0.045, z1 - 0.08, 0.4));
    // the broom
    tube(ms, 'board_warm', [V(door.c + 0.55, F + 0.18, wallZ + 0.06), V(door.c + 0.62, F + 1.3, wallZ + 0.03)], 0.013, 5);
    ms.pushT(door.c + 0.55, F + 0.1, wallZ + 0.07, 0, -0.05, -0.06);
    lathe(ms, 'rope', [[0.02, 0.2], [0.05, 0.12], [0.09, 0.02], [0.1, 0.0], [0, 0.0]].reverse() as [number, number][], 10);
    ms.pop();
  }
  // ---- the right end of the porch: cooler, minnow bucket, rods leaning in the corner, a blanket on the rail
  {
    cellBox(ms, 'cab_paint', 'paint', 'hose', 1.85, F + 0.17, 4.55, 0.6, 0.32, 0.36, 0.12);
    cellBox(ms, 'cab_paint', 'paint', 'enamel_white', 1.85, F + 0.35, 4.55, 0.62, 0.06, 0.38, 0.12);
    ms.pushT(1.25, F, 4.62);
    lathe(ms, 'galv', [[0, 0], [0.12, 0], [0.135, 0.24], [0.14, 0.25], [0.13, 0.25], [0.12, 0.02], [0, 0.02]], 12);
    ms.pop();
    tube(ms, 'iron', [V(1.13, F + 0.25, 4.62), V(1.25, F + 0.36, 4.62), V(1.37, F + 0.25, 4.62)], 0.004, 3);
    for (let k = 0; k < 3; k++) {
      const bx = 2.45 - k * 0.07, bz = 4.85 - k * 0.04;
      const tx = bx - 0.35 - k * 0.1, ty = F + 2.0 - k * 0.12, tz = bz - 0.25;
      cellTube(ms, 'cab_paint', 'paint', k === 1 ? 'walnut' : 'blued', [V(bx, F + 0.02, bz), V(tx, ty, tz)], 0.007, 4, 2);
      cellLathe(ms, 'cab_paint', 'paint', 'silver', [[0, -0.02], [0.03, -0.02], [0.03, 0.02], [0, 0.02]], 8, new THREE.Matrix4().compose(V(bx - 0.06, F + 0.4, bz - 0.04), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), V(1, 1, 1)));
    }
    // a red-and-black wool blanket airing over the top rail
    drape(ms, 0.75, 1.75, F + 0.92 + 0.045, z1 - 0.08, 'mackinaw', 0.55);
    bakeProduct(ms, 'enamel_mug', 2.43, F + 0.92 + 0.04, z1 - 0.08, 0.5);
  }
  // ---- boot scraper at the foot of the steps, mud and a worn path in the dirt
  {
    const x = door.c - 0.85, z = z1 + 0.55, g = c.hAt(x, z);
    for (const dx of [-0.13, 0.13]) cellBox(ms, 'cab_paint', 'paint', 'steel', x + dx, g + 0.1, z, 0.025, 0.24, 0.025);
    cellBox(ms, 'cab_paint', 'paint', 'steel', x, g + 0.17, z, 0.28, 0.06, 0.008);
    groundDecal(dms, 'mud', x + 0.3, z + 0.1, 1.1, 0.8, 0.3, c.hAt, 0.015);
    groundDecal(dms, 'mud', door.c, z1 + 1.15, 1.5, 0.9, 0.0, c.hAt, 0.015);
    groundDecal(dms, 'boots', door.c + 0.05, z1 + 1.6, 0.5, 1.6, 0.1, c.hAt, 0.018);
  }
  // ---- on the deck: worn traffic lane and dirt from the steps to the door, needles blown into the corners
  groundDeck(dms, 'boots', door.c + 0.02, z0 + 0.95, 0.42, 1.5);
  groundDeck(dms, 'dust', door.c, z0 + 1.0, 1.0, 1.6);
  groundDeck(dms, 'needles', -2.35, z0 + 0.25, 0.5, 0.5);
  groundDeck(dms, 'needles', 2.3, z1 - 0.25, 0.6, 0.5);
  groundDeck(dms, 'leaves', 0.9, z1 - 0.2, 0.7, 0.4);
  // ---- stored under the porch: an old tire, cinder blocks, a sheet of tin, scrap boards (seen through the gaps)
  if (hi) {
    pending.push(bakeProp(ms, 'old_tyre', 1.6, 0.08, 4.2, 0.3, Math.PI / 2 - 0.15));
    cellBox(ms, 'cab_paint', 'paint', 'cinder', -0.6, 0.1, 4.4, 0.4, 0.2, 0.2, 0.4);
    for (let k = 0; k < 4; k++) boxAt(ms, k % 2 ? 'board_grey' : 'planks_grey', -1.9 + k * 0.05, 0.03 + k * 0.025, 4.3 + r.range(-0.1, 0.1), 1.6, 0.025, 0.14, r.range(-0.15, 0.15), { grain: 'x' });
  }

  // ---- the road side (left wall): crosscut saw on two nails, a toboggan leaning, the NO HUNTING sign
  {
    const x = -W / 2 - R - 0.02;
    crosscut(ms, x, F + 1.95, 1.75, -Math.PI / 2);
    toboggan(ms, x - 0.32, -1.75, -Math.PI / 2);
    ms.pushT(x - 0.005, F + 1.0, 1.95, -Math.PI / 2, 0, 0.04);
    box(ms, 'galv', 0.5, 0.25, 0.004, { faces: { pz: null } });
    ms.pushT(0, 0, 0.003);
    atlasQuad(ms, 'cab_paper', 'paper', 'sign_hunt', 0.5, 0.25);
    ms.pop();
    ms.pop();
    // a bow saw and a coil of rope on nails between the window and the back
    bowSaw(ms, x - 0.02, F + 1.6, -1.25, -Math.PI / 2);
    ropeCoil(ms, x - 0.04, F + 1.95, -2.2, 0.15, 0.012, 'poly_rope', -Math.PI / 2);
  }
  // ---- tools leaning on the right wall by the back corner
  {
    const x = W / 2 + R + 0.12;
    pending.push(bakeProp(ms, 'rusted_spade_01', x, c.hAt(x, -1.6) + 0.0, -1.6, Math.PI / 2, 0, -0.22));
    pending.push(bakeProp(ms, 'picke_dirty_01', x + 0.05, c.hAt(x, -1.0), -1.05, Math.PI / 2 + 0.1, 0, -0.2));
    if (hi) pending.push(bakeProp(ms, 'sledgehammer_01', x + 0.02, c.hAt(x, -0.55), -0.55, Math.PI / 2 - 0.2, 0, -0.18));
    // a rake, tines up (procedural)
    rake(ms, x + 0.04, c.hAt(x, 0.1), 0.1, -0.2);
  }

  // ---- ground around the cabin: paths, the drip line under the eaves, needles against the footing, weeds
  {
    const hA = c.hAt;
    // driveway to the steps, steps to the woodyard and the fire pit, left side round to the back (outhouse)
    pathLine(dms, hA, r, [[-12.5, 2.8], [-8.5, 4.4], [-5, 5.6], [-1.6, 5.8]]);
    pathLine(dms, hA, r, [[-0.5, 5.7], [3, 5.6], [7, 4.4], [10.8, 2.6]]);
    pathLine(dms, hA, r, [[-0.6, 6.1], [1.5, 7.2], [2.8, 7.8]]);
    pathLine(dms, hA, r, [[-3.3, 4.6], [-3.6, 1], [-3.7, -3.0], [-4.6, -6.3], [-5.6, -8.4]]);
    for (const s of [-1, 1]) {
      const x = s * (CABIN.XE + 0.05);
      for (let z = -D / 2 - 0.4; z < D / 2 + 0.2; z += 0.9) groundDecal(dms, 'needles', x + r.range(-0.15, 0.15), z, 0.7, 0.9, r.range(0, 3), hA, 0.012, 2);
    }
    for (let x = -W / 2; x < W / 2; x += 0.9) groundDecal(dms, 'needles', x, -D / 2 - R - 0.4, 0.9, 0.6, r.range(0, 3), hA, 0.012, 2);
    if (c.detail > 0) {
      // grass grown up against the footing where the mower never goes
      for (let k = 0; k < (c.detail > 1 ? 60 : 30); k++) {
        const side = k % 4;
        const t = r.range(-0.5, 0.5);
        const x = side === 0 ? -W / 2 - R - 0.12 : side === 1 ? W / 2 + R + 0.12 : t * (W + 0.6);
        const z = side === 2 ? -D / 2 - R - 0.12 : side < 2 ? t * (D + 0.8) : (r.next() < 0.5 ? -1 : 1) * (W / 2 + 0.3);
        if (side === 3) { tuft(ms, r, 'weeds', z, hA(z, z1 + 0.2), z1 + 0.15 + r.range(0, 0.2), r.range(0.3, 0.5), r.range(0.2, 0.4)); continue; }
        tuft(ms, r, r.next() < 0.15 ? 'fireweed' : 'weeds', x, hA(x, z), z, r.range(0.3, 0.6), r.range(0.22, 0.5));
      }
    }
  }

  await Promise.all(pending);
  const g = noRay(ms.build({ name: 'cabin_exterior', noCast: ['cab_card'] }));
  c.group.add(g);
  c.updaters.push(farCull(g, V(0, 1, 2), c.detail > 1 ? 150 : 100));
  void OH;
}

/** a decal lying on the porch deck (y = deck + 3 mm) */
function groundDeck(dms: Mesher, key: string, x: number, z: number, w: number, d: number): void {
  dms.pushT(x, F + 0.004, z, 0, -Math.PI / 2);
  atlasQuad(dms, 'cab_decal', 'decal', key, w, d);
  dms.pop();
}

/** a worn path along a polyline (cabin local), a chain of path decals */
function pathLine(dms: Mesher, hAt: (x: number, z: number) => number, r: Rand, pts: [number, number][]): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / 1.6));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      groundDecal(dms, 'path', ax + (bx - ax) * t + r.range(-0.1, 0.1), az + (bz - az) * t + r.range(-0.1, 0.1), r.range(1.0, 1.3), L / n * 1.5, ry + r.range(-0.1, 0.1), hAt, 0.016 + i * 0.001, 3);
    }
  }
}

// ---------------------------------------------------------------------------------------------- pieces
/** a whitetail rack on a shield plaque, facing +z at (x, y, z) */
export function deerRack(ms: Mesher, x: number, y: number, z: number, ry: number, s = 1): void {
  ms.pushT(x, y, z, ry);
  ms.push(new THREE.Matrix4().makeScale(s, s, s));
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.17); sh.quadraticCurveTo(0.11, 0.16, 0.11, 0.04); sh.quadraticCurveTo(0.1, -0.08, 0, -0.14); sh.quadraticCurveTo(-0.1, -0.08, -0.11, 0.04); sh.quadraticCurveTo(-0.11, 0.16, 0, 0.17);
  extrude(ms, 'board_dark', sh, 0.02, { bevel: 0.004 });
  ms.pushT(0, 0.03, 0.03);
  ms.push(new THREE.Matrix4().makeScale(0.07, 0.05, 0.04));
  const cap = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.rotateX(Math.PI / 2);
  ms.geom('cab_bone', cap);
  cap.dispose();
  ms.pop(); ms.pop();
  for (const sd of [-1, 1]) {
    const P = (a: number, b: number, c: number) => V(sd * a, b, c);
    const beam = [P(0.04, 0.06, 0.05), P(0.14, 0.12, 0.04), P(0.24, 0.2, 0.08), P(0.25, 0.3, 0.16), P(0.17, 0.37, 0.24), P(0.08, 0.38, 0.27)];
    tube(ms, 'cab_bone', beam, 0.017, 6, { rEnd: 0.006 });
    ms.pushT(sd * 0.04, 0.06, 0.05);
    lathe(ms, 'cab_bone', [[0.024, -0.01], [0.026, 0.01], [0.0, 0.015]], 8);
    ms.pop();
    // tines rise off the top of the beam
    const tines: [number, number, number][] = [[0.18, 0.15, 0.12], [0.235, 0.24, 0.18], [0.22, 0.33, 0.14], [0.14, 0.37, 0.09]];
    for (const [a, b, h] of tines) {
      const base = P(a, b, 0.06 + a * 0.6);
      tube(ms, 'cab_bone', [base, base.clone().add(V(sd * -0.015, h * 0.6, 0.02)), base.clone().add(V(sd * -0.03, h, 0.05))], 0.011, 5, { rEnd: 0.004 });
    }
    // brow tine
    tube(ms, 'cab_bone', [P(0.07, 0.09, 0.06), P(0.07, 0.15, 0.09), P(0.06, 0.2, 0.1)], 0.008, 5, { rEnd: 0.003 });
  }
  ms.pop(); ms.pop();
}

/** a bull moose's palms on a skull plate, facing +z */
export function moosePalms(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  ms.pushT(0, 0, 0);
  ms.push(new THREE.Matrix4().makeScale(0.1, 0.08, 0.06));
  const skull = new THREE.SphereGeometry(1, 10, 8);
  ms.geom('cab_bone', skull);
  skull.dispose();
  ms.pop(); ms.pop();
  for (const sd of [-1, 1]) {
    // beam out to the palm
    tube(ms, 'cab_palm', [V(sd * 0.06, 0.02, 0.0), V(sd * 0.2, 0.05, 0.03), V(sd * 0.3, 0.1, 0.06)], 0.03, 6);
    // the palm: a broad flat blade cupped forward, points along its top edge
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0, -0.05));
    pts.push(new THREE.Vector2(0.32, -0.06));
    pts.push(new THREE.Vector2(0.52, 0.02));
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const bx = 0.52 - t * 0.52, by = 0.06 + Math.sin(t * Math.PI) * 0.2;
      pts.push(new THREE.Vector2(bx + 0.02, by + 0.1 - (k === 0 ? 0.03 : 0)));
      pts.push(new THREE.Vector2(bx - 0.04, by + 0.02));
    }
    pts.push(new THREE.Vector2(0, 0.1));
    const shape = new THREE.Shape(pts);
    ms.pushT(sd * 0.3, 0.1, 0.06, sd > 0 ? -0.35 : Math.PI + 0.35, -0.5);
    if (sd < 0) ms.push(new THREE.Matrix4().makeScale(1, 1, -1));
    extrude(ms, 'cab_palm', shape, 0.025, { bevel: 0.006, curveSegments: 2 });
    if (sd < 0) ms.pop();
    ms.pop();
  }
  ms.pop();
}

/** a coil of rope hanging on a nail (in a wall plane facing +z, rotated by ry) */
function ropeCoil(ms: Mesher, x: number, y: number, z: number, rad: number, th: number, key: string, ry = 0): void {
  ms.pushT(x, y, z, ry);
  for (let k = 0; k < 4; k++) {
    const pts: THREE.Vector3[] = [];
    const rr = rad * (0.85 + k * 0.06);
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push(V(Math.sin(a) * rr * 0.8, -rr + Math.cos(a) * rr, 0.02 + k * 0.012)); }
    if (key === 'manila') tube(ms, 'rope', pts, th, 4, { samples: 20 }); else cellTube(ms, 'cab_paint', 'paint', key, pts, th, 4, 20);
  }
  if (key === 'manila') tube(ms, 'rope', [V(0.05, -rad * 1.9, 0.03), V(0.07, -rad * 2.6, 0.04), V(0.03, -rad * 3.1, 0.05)], th, 4); else cellTube(ms, 'cab_paint', 'paint', key, [V(0.05, -rad * 1.9, 0.03), V(0.07, -rad * 2.6, 0.04), V(0.03, -rad * 3.1, 0.05)], th, 4, 6);
  boxAt(ms, 'iron', 0, 0.0, 0.02, 0.008, 0.008, 0.05);
  ms.pop();
}

/** a two-man crosscut saw hanging on two nails: centre (x, y, z), length L, wall facing +z rotated by ry */
function crosscut(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  const L = 1.5;
  ms.pushT(x, y, z, ry);
  const pts: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) { const t = i / N, xx = -L / 2 + t * L; pts.push(new THREE.Vector2(xx, 0.035 + 0.02 * Math.sin(t * Math.PI))); }
  for (let i = N * 2; i >= 0; i--) {
    const t = i / (N * 2), xx = -L / 2 + t * L;
    const belly = -0.035 - 0.1 * Math.sin(t * Math.PI);
    pts.push(new THREE.Vector2(xx, belly - (i % 2 ? 0.018 : 0)));
  }
  extrude(ms, 'iron', new THREE.Shape(pts), 0.003);
  for (const sx of [-1, 1]) {
    ms.pushT(sx * (L / 2 + 0.04), 0.0, 0.0015, 0, 0, sx * 0.3);
    cellBox(ms, 'cab_paint', 'paint', 'walnut', 0, 0.06, 0, 0.035, 0.24, 0.035);
    ms.pop();
  }
  for (const nx of [-0.35, 0.35]) boxAt(ms, 'iron', nx, 0.065, 0.0, 0.008, 0.008, 0.05);
  ms.pop();
}

/** a bentwood toboggan leaning curl-up against a wall (foot at (x, z) on the ground), wall normal +z rotated by ry */
function toboggan(ms: Mesher, x: number, z: number, ry: number): void {
  ms.pushT(x, 0.02, z, ry);
  ms.push(new THREE.Matrix4().makeRotationX(-1.32));
  const W2 = 0.22;
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const s = i / 14 * 1.9;
    if (s < 1.55) path.push(V(0, s, 0));
    else { const a = (s - 1.55) / 0.2 * 2.2; path.push(V(0, 1.55 + Math.sin(a) * 0.16, (1 - Math.cos(a)) * 0.16)); }
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    for (const [x0, x1] of [[-W2, -W2 / 3], [-W2 / 3, W2 / 3], [W2 / 3, W2]]) {
      ms.quad('board_warm', V(x0, a.y, a.z), V(x1, a.y, a.z), V(x1, b.y, b.z), V(x0, b.y, b.z), [a.y * 1.5, x0], [a.y * 1.5, x1], [b.y * 1.5, x1], [b.y * 1.5, x0]);
      ms.quad('board_warm', V(x1, a.y, a.z - 0.01), V(x0, a.y, a.z - 0.01), V(x0, b.y, b.z - 0.01), V(x1, b.y, b.z - 0.01), [a.y * 1.5, x1], [a.y * 1.5, x0], [b.y * 1.5, x0], [b.y * 1.5, x1]);
    }
  }
  for (const s of [0.3, 0.8, 1.3]) boxAt(ms, 'board_dark', 0, s, 0.015, W2 * 2, 0.04, 0.02);
  tube(ms, 'rope', [V(-W2 + 0.02, 0.2, 0.03), V(-W2 + 0.02, 1.0, 0.04), V(-W2 + 0.02, 1.5, 0.05)], 0.008, 4);
  tube(ms, 'rope', [V(W2 - 0.02, 0.2, 0.03), V(W2 - 0.02, 1.0, 0.04), V(W2 - 0.02, 1.5, 0.05)], 0.008, 4);
  ms.pop(); ms.pop();
}

/** a bow saw hung on a nail, wall plane facing +z rotated by ry */
function bowSaw(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V(-0.38 + t * 0.76, 0.12 + Math.sin(t * Math.PI) * 0.2, 0.02)); }
  cellTube(ms, 'cab_paint', 'paint', 'orange', pts, 0.012, 5, 24);
  boxAt(ms, 'iron', 0, 0.1, 0.02, 0.76, 0.025, 0.002);
  boxAt(ms, 'iron', 0, 0.32, 0.0, 0.008, 0.008, 0.05);
  ms.pop();
}

/** a garden rake leaning on a wall, tines up */
function rake(ms: Mesher, x: number, y: number, z: number, lean: number): void {
  ms.pushT(x, y, z, Math.PI / 2, 0, lean);
  tube(ms, 'board_warm', [V(0, 0, 0), V(0, 1.45, 0)], 0.014, 5);
  boxAt(ms, 'iron', 0, 1.47, 0, 0.36, 0.025, 0.02);
  for (let k = -6; k <= 6; k++) boxAt(ms, 'iron', k * 0.028, 1.52, 0.012, 0.006, 0.07, 0.006);
  ms.pop();
}

/** a blanket hung over a rail running along x from xa to xb at height y, z (falls front and back) */
function drape(ms: Mesher, xa: number, xb: number, y: number, z: number, key: string, fall: number): void {
  const [u0, v0, u1, v1] = cellUVc(key);
  const nx = 8, ny = 8;
  const P = (i: number, j: number) => {
    // j: 0..ny from the front hem, over the rail, to the back hem
    const t = j / ny, x = xa + (xb - xa) * (i / nx);
    const a = t * Math.PI;
    const ripple = 0.015 * Math.sin(i * 1.7 + j) * Math.sin(t * Math.PI);
    const sideY = y + 0.04 - Math.max(0, Math.abs(t - 0.5) * 2 - 0.15) * fall;
    return V(x + ripple, Math.min(y + 0.05, sideY + 0.03 * Math.sin(a)), z + Math.cos(a) * 0.06 + ripple);
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const U = (k: number) => u0 + (u1 - u0) * (k / nx), Vv = (k: number) => v0 + (v1 - v0) * (k / ny);
    ms.quad('cab_cloth', P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), [U(i), Vv(j)], [U(i + 1), Vv(j)], [U(i + 1), Vv(j + 1)], [U(i), Vv(j + 1)]);
  }
}
import { CLOTH } from './tex';
function cellUVc(key: string): [number, number, number, number] { return CLOTH.uv(key); }
