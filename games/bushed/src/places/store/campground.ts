// Doug's lakeside campground round the fire ring (SPOTS.campsite): the log benches and the fire belong to npcs.ts;
// this is everything that makes it a campground somebody's been living in for a week. A canvas ridge tent with its
// guy lines, a nylon dome, the picnic table under a blue tarp (stove, cooler, lantern, marshmallows, empties), two
// folding chairs, Doug's chopping block with the axe in it and the woodbox (the 'campsite' drop zone, the honour box),
// a bear-proof bin, a clothesline, the rules board and the site post, a grill over the ring with the coffee pot,
// and the trampled ground: packed dirt, ash, chips, leaves, a puddle.
// Local frame: origin at the fire on the ground, +X east, +Z south (world axes; no rotation).
import * as THREE from 'three';
import { Mesher, Rand, Cols, V, boxAt, board, logAB, lathe, anchor, type Place } from '../kit';
import { heightAt, SPOTS } from '../../world/layout';
import { writeSplit, writeRound } from '../products';
import { LABELS } from '../signs';
import { ensurePrintMats } from '../signs';
import { ensureStoreMats, card, cardAt, floorDecal, groundDecal } from './print';
import { colorMat, propInstances, qualityLevel, prop, tb } from './inst';
import { PRINT_RECTS } from './print_rects';
import { G } from '../../gfx/globals';

const sz = (k: string, ppm = 300): [number, number] => [PRINT_RECTS[k][2] / ppm, PRINT_RECTS[k][3] / ppm];
const lUV = (k: string) => LABELS.uv(k);

export function buildCampground(): Place {
  ensurePrintMats();
  ensureStoreMats();
  const cs = SPOTS.campsite;
  const gy0 = heightAt(cs.x, cs.z);
  const group = new THREE.Group();
  group.name = 'campground';
  group.position.set(cs.x, gy0, cs.z);
  const ms = new Mesher(), cols = new Cols(), r = new Rand(9090);
  const anchors: Record<string, THREE.Object3D> = {};
  const pending: Promise<unknown>[] = [];
  const updaters: ((dt: number) => void)[] = [];
  const q = qualityLevel();
  const ground = (x: number, z: number) => heightAt(cs.x + x, cs.z + z) - gy0;
  const tarpBlue = colorMat('tarp', 0x2a5ab0, 0.7);
  const nylon = colorMat('nylon_o', 0xd8622a, 0.55);
  const nylonG = colorMat('nylon_g', 0x3a6a3a, 0.6);
  const cooler = colorMat('cooler_r', 0xb82a24, 0.5);
  const white = colorMat('white', 0xe4e2da, 0.5);
  const black = colorMat('black', 0x1c1c1e, 0.5);
  const chairCloth = colorMat('chair_b', 0x24407a, 0.9);
  const green = colorMat('stove_g', 0x2e5a34, 0.45, 0.3);
  const rope = 'rope';
  const peg = (x: number, z: number) => { const g = ground(x, z); boxAt(ms, 'galv', x, g + 0.03, z, 0.015, 0.08, 0.015, 0, {}, 0.3); return V(x, g + 0.06, z); };

  // ---- the trampled ground round the ring: packed dirt, ash, a few leaves and chips, a puddle by the table
  groundDecal(ms, 'g_mud', 0, 0, 7.5, 7.5, 0, ground, { nx: 6, nz: 6, lift: 0.03 });
  groundDecal(ms, 'g_soot', 0, 0, 2.6, 2.6, 0.6, ground, { nx: 3, nz: 3, lift: 0.035 });
  for (let i = 0; i < (q === 0 ? 4 : 10); i++) { const a = r.range(0, 6.28), d = r.range(3.5, 9); groundDecal(ms, 'g_leaves', Math.cos(a) * d, Math.sin(a) * d, r.range(1, 2.2), r.range(1, 2.2), r.range(0, 3), ground, { nx: 2, nz: 2, lift: 0.03 }); }
  groundDecal(ms, 'g_puddle', 1.2, 8.6, 1.2, 0.8, 0.4, ground, { nx: 2, nz: 2, lift: 0.04, mat: 'puddle' });

  // ---- the grill over one side of the ring, the black coffee pot and the cast-iron pan
  {
    const g = ground(0, 0) + 0.36;
    for (let k = 0; k < 9; k++) tb(ms, 'soot', [V(-0.1 + k * 0.05, g, -0.55), V(-0.1 + k * 0.05, g, 0.05)], 0.004, 3, { smooth: false });
    for (const z of [-0.55, 0.05]) tb(ms, 'soot', [V(-0.12, g, z), V(0.32, g, z)], 0.007, 4, { smooth: false });
    for (const [x, z] of [[-0.12, -0.55], [0.32, -0.55], [-0.12, 0.05], [0.32, 0.05]] as [number, number][]) tb(ms, 'soot', [V(x, g, z), V(x, g - 0.38, z)], 0.006, 3);
    ms.pushT(0.08, g + 0.005, -0.38);
    lathe(ms, 'soot', [[0.0001, 0], [0.07, 0], [0.08, 0.06], [0.06, 0.15], [0.035, 0.18], [0.04, 0.2], [0.0001, 0.2]], 10);
    tb(ms, 'soot', [V(0.06, 0.14, 0), V(0.11, 0.16, 0), V(0.1, 0.05, 0)], 0.006, 4);
    ms.pop();
    ms.pushT(0.15, g + 0.005, -0.08);
    lathe(ms, 'soot', [[0.0001, 0], [0.11, 0], [0.12, 0.04], [0.115, 0.045], [0.0001, 0.01]], 12);
    boxAt(ms, 'soot', 0.2, 0.025, 0, 0.16, 0.012, 0.025);
    ms.pop();
  }
  // ---- marshmallow sticks leaning on a bench, empties round the ring
  for (let k = 0; k < 3; k++) {
    const a = 2.674 + 0.25 + k * 0.08, x = Math.cos(a) * 2.45, z = Math.sin(a) * 2.45, g = ground(x, z);
    tb(ms, 'bark_birch', [V(x, g, z), V(x * 0.82, g + 0.75, z * 0.82 + 0.1)], 0.006, 4, { smooth: false });
    boxAt(ms, white, x * 0.8, g + 0.78, z * 0.8 + 0.1, 0.025, 0.03, 0.025);
  }
  for (let i = 0; i < (q === 0 ? 3 : 7); i++) {
    const a = r.range(0, 6.28), d = r.range(2.6, 3.6), x = Math.cos(a) * d, z = Math.sin(a) * d;
    ms.pushT(x, ground(x, z) + (i % 3 ? 0.03 : 0.0), z, r.range(0, 6), i % 3 ? Math.PI / 2 : 0);
    lathe(ms, 'lab_metal', [[0.0001, 0], [0.032, 0], [0.033, 0.12], [0.026, 0.125], [0.0001, 0.125]], 8, { uNorm: true, vNorm: true, uv: lUV('beer') });
    ms.pop();
  }

  // ---- the canvas ridge tent west of the fire, door toward it, guy lines to pegs
  {
    const x = -5.6, z = 2.8, ry = Math.PI / 2 - 0.3, L = 2.5, Wd = 2.1, H = 1.65;
    const g = ground(x, z);
    ms.pushT(x, g, z, ry);
    const A = V(-Wd / 2, 0.02, -L / 2), B = V(Wd / 2, 0.02, -L / 2), C = V(Wd / 2, 0.02, L / 2), Dd = V(-Wd / 2, 0.02, L / 2), T0 = V(0, H, -L / 2), T1 = V(0, H - 0.04, L / 2);
    // the two roof slopes (both faces), a sag in the ridge
    ms.quad('canvas', Dd, A, T0, T1, [0, 0], [L, 0], [L, 1.9], [0, 1.9]);
    ms.quad('canvas', A, Dd, T1, T0, [0, 0], [L, 0], [L, 1.9], [0, 1.9]);
    ms.quad('canvas', B, C, T1, T0, [0, 0], [L, 0], [L, 1.9], [0, 1.9]);
    ms.quad('canvas', C, B, T0, T1, [0, 0], [L, 0], [L, 1.9], [0, 1.9]);
    // back wall closed; the front: two flaps tied back
    ms.tri('canvas', A, T0, B, V(0, 0, -1), V(0, 0, -1), V(0, 0, -1), [0, 0], [1, 1.6], [2, 0]);
    ms.tri('canvas', B, T0, A, V(0, 0, 1), V(0, 0, 1), V(0, 0, 1), [0, 0], [1, 1.6], [2, 0]);
    for (const s of [-1, 1]) {
      const p0 = V(s * Wd / 2, 0.02, L / 2), p1 = V(0, H - 0.05, L / 2), p2 = V(s * 0.55, 0.3, L / 2 + 0.15);
      ms.tri('canvas', p0, p1, p2, V(0, 0, 1), V(0, 0, 1), V(0, 0, 1), [0, 0], [1, 1.6], [0.6, 0.3]);
      ms.tri('canvas', p2, p1, p0, V(0, 0, -1), V(0, 0, -1), V(0, 0, -1), [0, 0], [1, 1.6], [0.6, 0.3]);
      tb(ms, rope, [V(s * 0.5, 0.35, L / 2 + 0.14), V(s * Wd / 2, 0.4, L / 2)], 0.004, 3);
    }
    // ground sheet and a sleeping bag inside, poles front and back
    boxAt(ms, nylonG, 0, 0.01, 0, Wd - 0.1, 0.01, L - 0.1);
    ms.pushT(-0.4, 0.09, 0.1, 0, 0, 0);
    lathe(ms, 'blanket', [[0.0001, -0.9], [0.2, -0.85], [0.22, 0.6], [0.16, 0.85], [0.0001, 0.9]], 8);
    ms.pop();
    for (const zz of [-L / 2 - 0.02, L / 2 + 0.02]) tb(ms, 'board_warm', [V(0, 0, zz), V(0, H + 0.12, zz)], 0.018, 5);
    ms.pop();
    // guy lines off the pole tops and the slopes
    const toW = (lx: number, ly: number, lz: number) => { const c = Math.cos(ry), s = Math.sin(ry); return V(x + c * lx + s * lz, g + ly, z - s * lx + c * lz); };
    for (const [lx, lz, px, pz] of [[0, -L / 2 - 0.02, 0, -L / 2 - 1.2], [0, L / 2 + 0.02, 0, L / 2 + 1.2], [-Wd / 2, -0.8, -Wd / 2 - 0.8, -0.8], [-Wd / 2, 0.8, -Wd / 2 - 0.8, 0.8], [Wd / 2, -0.8, Wd / 2 + 0.8, -0.8], [Wd / 2, 0.8, Wd / 2 + 0.8, 0.8]] as [number, number, number, number][]) {
      const top = toW(lx, lx === 0 ? H + 0.1 : 0.55, lz), pw = toW(px, 0, pz);
      const pp = peg(pw.x, pw.z);
      tb(ms, rope, [top, pp], 0.003, 3);
    }
    cols.box(x, g + 0.8, z, Wd / 2, 0.8, L / 2, ry);
    floorDecal(ms, 'g_blob', x, g + 0.03, z, Wd + 0.6, L + 0.6, ry);
    // boots at the door, a cooler beside
    const door = toW(0, 0, L / 2 + 0.45);
    pending.push(propInstances(group, 'rubber_boots', [{ x: door.x - 0.15, y: ground(door.x, door.z), z: door.z, ry: ry + 0.2 }, { x: door.x + 0.12, y: ground(door.x, door.z), z: door.z + 0.05, ry: ry - 0.3, rz: 1.4 }]));
    const cl = toW(Wd / 2 + 0.45, 0, L / 2 - 0.2);
    ms.pushT(cl.x, ground(cl.x, cl.z), cl.z, ry + 0.2);
    boxAt(ms, cooler, 0, 0.19, 0, 0.6, 0.36, 0.38);
    boxAt(ms, white, 0, 0.39, 0, 0.62, 0.05, 0.4);
    tb(ms, white, [V(-0.2, 0.36, 0.2), V(-0.2, 0.42, 0.24), V(0.2, 0.42, 0.24), V(0.2, 0.36, 0.2)], 0.012, 4, { smooth: false });
    ms.pop();
    cols.box(cl.x, ground(cl.x, cl.z) + 0.2, cl.z, 0.3, 0.2, 0.2, ry + 0.2);
    // the site post
    const sp = toW(-Wd / 2 - 1.2, 0, L / 2 + 0.6);
    const sg = ground(sp.x, sp.z);
    boxAt(ms, 'board_grey', sp.x, sg + 0.45, sp.z, 0.1, 1.0, 0.1, ry);
    cardAt(ms, 'site_num', sp.x + Math.sin(ry) * 0.052, sg + 0.8, sp.z + Math.cos(ry) * 0.052, ry, 0.08, 0.08);
    anchors.tent = anchor(group, 'tent', door.x, ground(door.x, door.z), door.z, ry);
  }
  // ---- a nylon dome tent north of the fire, half zipped, a tarp-blue fly flapping loose
  {
    const x = -1.2, z = -6.4, g = ground(x, z), R = 1.1, H = 1.15;
    ms.pushT(x, g, z, 0.4);
    const prof: [number, number][] = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push([Math.max(0.0001, Math.cos(a) * R), Math.sin(a) * H]); }
    lathe(ms, nylon, prof, 10);
    for (let k = 0; k < 2; k++) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; pts.push(V(Math.cos(a) * (R + 0.01) * Math.cos(k ? 0.8 : -0.8), Math.sin(a) * (H + 0.01), Math.cos(a) * (R + 0.01) * Math.sin(k ? 0.8 : -0.8))); }
      tb(ms, black, pts, 0.008, 3);
    }
    // the door: a dark opening and the rolled flap
    ms.pushT(0, 0.4, R - 0.02, 0, -0.35);
    ms.quad(black, V(-0.3, -0.38, 0.02), V(0.3, -0.38, 0.02), V(0.15, 0.32, 0.02), V(-0.15, 0.32, 0.02), [0, 0], [1, 0], [1, 1], [0, 1]);
    ms.pop();
    tb(ms, nylonG, [V(-0.32, 0.72, R - 0.12), V(0, 0.82, R - 0.06), V(0.32, 0.72, R - 0.12)], 0.05, 6);
    ms.pop();
    for (const a of [0.8, 2.4, 3.9, 5.5]) { const px = x + Math.cos(a) * (R + 0.35), pz = z + Math.sin(a) * (R + 0.35); const pp = peg(px, pz); tb(ms, rope, [V(x + Math.cos(a) * R * 0.75, g + 0.65, z + Math.sin(a) * R * 0.75), pp], 0.003, 3); }
    floorDecal(ms, 'g_blob', x, g + 0.03, z, 2.6, 2.6);
    cols.box(x, g + 0.5, z, R * 0.8, 0.5, R * 0.8, 0.4);
    // a pair of socks drying on the dome
    boxAt(ms, 'wool_grey', x + 0.2, g + H + 0.01, z + 0.1, 0.08, 0.02, 0.25, 0.6);
  }
  // ---- the picnic table under a blue tarp: stove, cooler, lantern, marshmallows, cans, a pot
  {
    const x = 2.6, z = 6.6, g = ground(x, z), ry = 0.15;
    pending.push(prop(group, 'wooden_picnic_table', x, g, z, ry));
    cols.box(x, g + 0.38, z, 1.12, 0.38, 1.5, ry);
    const ty = g + 0.75;
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx: number, lz: number) => [x + c * lx + s * lz, z - s * lx + c * lz] as [number, number];
    // a checked plastic cloth half on
    const [clx, clz] = at(-0.05, -0.3);
    ms.pushT(clx, ty + 0.004, clz, ry + 0.05, -Math.PI / 2);
    ms.quad(colorMat('cloth', 0xb83a30, 0.8), V(-0.45, -1.0, 0), V(0.45, -1.0, 0), V(0.45, 1.0, 0), V(-0.45, 1.0, 0), [0, 0], [1, 0], [1, 1], [0, 1]);
    ms.pop();
    // the two-burner stove with its green lid up, a pot on it
    const [sx, sz2] = at(0.05, -0.75);
    ms.pushT(sx, ty, sz2, ry + Math.PI / 2);
    boxAt(ms, green, 0, 0.05, 0, 0.55, 0.1, 0.3);
    boxAt(ms, green, 0, 0.25, -0.16, 0.55, 0.3, 0.015, 0, {}, -0.12);
    for (const k of [-0.13, 0.13]) { ms.pushT(k, 0.1, 0.02); lathe(ms, 'soot', [[0.0001, 0], [0.06, 0], [0.06, 0.01], [0.0001, 0.01]], 8); ms.pop(); }
    ms.pushT(-0.13, 0.11, 0.02);
    lathe(ms, 'enamel_blue', [[0.0001, 0], [0.09, 0], [0.095, 0.12], [0.1, 0.125], [0.0001, 0.12]], 10);
    ms.pop();
    lathe(ms, colorMat('fuel', 0x2a50a0, 0.4, 0.4), [[0.0001, 0], [0.04, 0], [0.04, 0.16], [0.02, 0.2], [0.0001, 0.2]], 8);
    ms.pop();
    // cooler on the bench end, a bag of marshmallows, a paper-towel roll, a lantern, beer cans, a frying pan
    const [cx2, cz2] = at(0.6, 0.9);
    ms.pushT(cx2, g + 0.45, cz2, ry);
    boxAt(ms, cooler, 0, 0.17, 0, 0.55, 0.32, 0.36); boxAt(ms, white, 0, 0.35, 0, 0.57, 0.05, 0.38);
    ms.pop();
    const [mx, mz] = at(-0.15, 0.25);
    ms.pushT(mx, ty + 0.06, mz, ry + 0.5);
    boxAt(ms, colorMat('bag', 0xeef0f4, 0.3), 0, 0, 0, 0.22, 0.12, 0.14);
    boxAt(ms, colorMat('bag_b', 0x3a6ac8, 0.4), 0, 0.0, 0.071, 0.18, 0.08, 0.002);
    ms.pop();
    const [px2, pz2] = at(0.25, 0.4);
    ms.pushT(px2, ty, pz2);
    lathe(ms, white, [[0.0001, 0], [0.06, 0], [0.06, 0.25], [0.0001, 0.25]], 10);
    ms.pop();
    for (let k = 0; k < 4; k++) {
      const [bx, bz] = at(-0.25 + k * 0.09, 0.65 + (k % 2) * 0.07);
      ms.pushT(bx, ty + (k === 3 ? 0.032 : 0), bz, k, k === 3 ? Math.PI / 2 : 0);
      lathe(ms, 'lab_metal', [[0.0001, 0], [0.032, 0], [0.033, 0.12], [0.026, 0.125], [0.0001, 0.125]], 8, { uNorm: true, vNorm: true, uv: lUV('beer') });
      ms.pop();
    }
    const [lx, lz] = at(0.0, -0.05);
    pending.push(propInstances(group, 'Lantern_01', [{ x: lx, y: ty, z: lz, ry: 0.4 }]));
    floorDecal(ms, 'g_pool', lx, ty + 0.005, lz, 1.0, 1.0, 0, 'glowadd');
    // the tarp: four ropes to trees that aren't quite where you'd want them, a pole holding the middle up
    const corners = [at(-1.4, -1.9), at(1.5, -1.8), at(1.6, 1.9), at(-1.3, 1.8)];
    const hgt = [2.3, 2.0, 1.75, 2.1];
    const P = corners.map(([cx3, cz3], i) => V(cx3, ground(cx3, cz3) + hgt[i], cz3));
    const mid = V(x, ty + 1.65, z);
    for (let i = 0; i < 4; i++) {
      const a = P[i], b = P[(i + 1) % 4];
      // two triangles to the raised middle, both faces (a fan of four)
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(mid, a)).normalize();
      ms.tri(tarpBlue, a, b, mid, n, n, n, [0, 0], [1, 0], [0.5, 1]);
      const n2 = n.clone().negate();
      ms.tri(tarpBlue, b, a, mid, n2, n2, n2, [0, 0], [1, 0], [0.5, 1]);
    }
    tb(ms, 'board_warm', [V(x + 0.05, ty, z + 0.05), V(mid.x, mid.y, mid.z)], 0.02, 5);
    for (let i = 0; i < 4; i++) {
      const [cx3, cz3] = corners[i];
      const dx = cx3 - x, dz = cz3 - z, L = Math.hypot(dx, dz);
      const pole = V(cx3 + (dx / L) * 0.6, 0, cz3 + (dz / L) * 0.6);
      const pg = ground(pole.x, pole.z);
      logAB(ms, V(pole.x, pg - 0.3, pole.z), V(pole.x - (dx / L) * 0.15, pg + hgt[i] + 0.15, pole.z - (dz / L) * 0.15), 0.035, { seed: 50 + i, seg: 6, capA: -1, capB: 1, matFor: () => 'bark' });
      tb(ms, rope, [P[i], V(pole.x - (dx / L) * 0.14, pg + hgt[i] + 0.05, pole.z - (dz / L) * 0.14)], 0.004, 3);
      cols.box(pole.x, pg + 1.0, pole.z, 0.05, 1.0, 0.05);
    }
    anchors.picnic_table = anchor(group, 'picnic_table', x, ty, z, ry);
  }
  // ---- two folding chairs facing the fire
  for (const a of [0.98, 5.05]) {
    const d = 3.5, x = Math.cos(a) * d, z = Math.sin(a) * d, g = ground(x, z), ry = Math.atan2(-x, -z);
    ms.pushT(x, g, z, ry);
    for (const s of [-1, 1]) {
      tb(ms, 'galv', [V(s * 0.26, 0, -0.25), V(s * 0.26, 0.42, 0.18)], 0.01, 4, { smooth: false });
      tb(ms, 'galv', [V(s * 0.26, 0, 0.25), V(s * 0.26, 0.42, -0.2), V(s * 0.26, 0.85, -0.3)], 0.01, 4, { smooth: false });
      tb(ms, 'galv', [V(s * 0.26, 0.6, -0.22), V(s * 0.28, 0.6, 0.15)], 0.012, 4, { smooth: false });
    }
    ms.quad(chairCloth, V(-0.26, 0.42, 0.18), V(0.26, 0.42, 0.18), V(0.26, 0.4, -0.2), V(-0.26, 0.4, -0.2), [0, 0], [1, 0], [1, 1], [0, 1]);
    ms.quad(chairCloth, V(-0.26, 0.4, -0.2), V(0.26, 0.4, -0.2), V(0.26, 0.42, 0.18), V(-0.26, 0.42, 0.18), [0, 0], [1, 0], [1, 1], [0, 1]);
    ms.quad(chairCloth, V(-0.26, 0.45, -0.21), V(0.26, 0.45, -0.21), V(0.26, 0.84, -0.3), V(-0.26, 0.84, -0.3), [0, 0], [1, 0], [1, 1], [0, 1]);
    ms.quad(chairCloth, V(0.26, 0.45, -0.21), V(-0.26, 0.45, -0.21), V(-0.26, 0.84, -0.3), V(0.26, 0.84, -0.3), [0, 0], [1, 0], [1, 1], [0, 1]);
    // a can in the armrest cup
    ms.pushT(0.3, 0.6, 0.1);
    lathe(ms, 'lab_metal', [[0.0001, 0], [0.032, 0], [0.033, 0.12], [0.0001, 0.12]], 8, { uNorm: true, vNorm: true, uv: lUV('beer') });
    ms.pop();
    ms.pop();
    cols.box(x, g + 0.4, z, 0.3, 0.4, 0.3, ry);
  }
  // ---- Doug's chopping block, the axe left in it, splits and chips; the woodbox (the 'campsite' drop zone)
  {
    const bx = 4.5, bz = -3.6, g = ground(bx, bz);
    ms.pushT(bx, g - 0.02, bz);
    writeRound(ms, r, 0.5, 0.26, 4401, 'endgrain', 1);
    ms.pop();
    cols.box(bx, g + 0.24, bz, 0.26, 0.26, 0.26);
    pending.push(prop(group, 'wooden_axe_02', bx + 0.05, g + 0.46, bz + 0.02, 0.6).then((o) => { if (o) o.rotation.set(0.0, 0.6, -0.5, 'YXZ'); }));
    groundDecal(ms, 'g_leaves', bx, bz, 2.4, 2.4, 0.3, ground, { nx: 2, nz: 2, lift: 0.03 });
    for (let i = 0; i < (q === 0 ? 4 : 11); i++) {
      const a = r.range(0, 6.28), d = r.range(0.45, 1.4), x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      ms.pushT(x, ground(x, z) + 0.05, z, r.range(0, 6), 0, Math.PI / 2 + r.range(-0.3, 0.3));
      writeSplit(ms, r, 0.4, 0.12, r.int(0, 9999));
      ms.pop();
    }
    // the woodbox: slatted, open-topped, half full; the honour box nailed to it
    const wx = 3.2, wz = -2.0, wg = ground(wx, wz), w = 1.0, d = 0.6, h = 0.62, ry = -0.5;
    ms.pushT(wx, wg, wz, ry);
    for (let k = 0; k < 3; k++) {
      const y = 0.1 + k * 0.2;
      board(ms, 'board_grey', r, 0, y, d / 2, w, 0.16, 0.025, 0, { grain: 'x' });
      board(ms, 'board_grey', r, 0, y, -d / 2, w, 0.16, 0.025, 0, { grain: 'x' });
      board(ms, 'board_grey', r, w / 2, y, 0, 0.025, 0.16, d, 0, { grain: 'z' });
      board(ms, 'board_grey', r, -w / 2, y, 0, 0.025, 0.16, d, 0, { grain: 'z' });
    }
    for (const sx of [-1, 1]) for (const sz3 of [-1, 1]) boxAt(ms, 'board_grey', sx * (w / 2 - 0.03), h / 2, sz3 * (d / 2 - 0.03), 0.05, h, 0.05);
    for (let k = 0; k < (q === 0 ? 5 : 12); k++) {
      ms.pushT(r.range(-0.3, 0.3), 0.08 + (k % 4) * 0.1, r.range(-0.18, 0.18), r.range(-0.2, 0.2) + (k % 2) * 0.1, 0, r.range(0, 6));
      writeSplit(ms, r, 0.38, 0.11, r.int(0, 9999));
      ms.pop();
    }
    boxAt(ms, 'galv', 0.25, 0.42, d / 2 + 0.06, 0.16, 0.2, 0.1);
    boxAt(ms, black, 0.25, 0.5, d / 2 + 0.1, 0.06, 0.008, 0.012);
    cardAt(ms, 'honour_box', -0.18, 0.42, d / 2 + 0.016, 0, ...sz('honour_box', 240), 0.03);
    ms.pop();
    cols.box(wx, wg + h / 2, wz, w / 2, h / 2, d / 2, ry);
    floorDecal(ms, 'g_blob', wx, wg + 0.03, wz, w + 0.6, d + 0.6, ry);
    // store-bought bundles stacked beside it
    for (let k = 0; k < 3; k++) {
      const x = wx + 0.9 + (k % 2) * 0.1, z = wz - 0.55 + (k === 2 ? 0.25 : 0), y = ground(x, z) + (k === 2 ? 0.32 : 0);
      ms.pushT(x, y, z, ry + 0.2 + k * 0.1);
      for (let i = 0; i < 6; i++) { ms.pushT(0, 0.06 + Math.floor(i / 3) * 0.1, (i % 3 - 1) * 0.1, Math.PI / 2, 0, r.range(0, 6)); writeSplit(ms, r, 0.4, 0.06, r.int(0, 9999)); ms.pop(); }
      boxAt(ms, 'wrap', 0, 0.12, 0, 0.42, 0.24, 0.34);
      ms.pushT(0, 0.13, 0.172); card(ms, 'bundle_wrap', 0.16, 0.08); ms.pop();
      ms.pop();
    }
    anchors.woodbox = anchor(group, 'woodbox', wx, wg + h, wz, ry);
  }
  // ---- the bear-proof bin, the rules board by the trail, a clothesline with towels
  {
    const x = 7.2, z = 1.4, g = ground(x, z), ry = -1.3;
    ms.pushT(x, g, z, ry);
    boxAt(ms, colorMat('bin_g', 0x3a4a3a, 0.6, 0.3), 0, 0.55, 0, 1.2, 1.1, 0.7);
    boxAt(ms, colorMat('bin_g', 0x3a4a3a, 0.6, 0.3), 0, 1.13, 0.0, 1.24, 0.06, 0.74, 0, {}, -0.05);
    boxAt(ms, 'galv', 0, 1.0, 0.36, 0.5, 0.06, 0.02);
    ms.pushT(0, 0.8, 0.352); card(ms, 'g_drip', 1.1, 0.6, 'grime'); ms.pop();
    ms.pop();
    floorDecal(ms, 'g_blob', x, g + 0.03, z, 1.6, 1.1, ry);
    cols.box(x, g + 0.58, z, 0.6, 0.58, 0.35, ry);
    // rules board on two posts at the trail in
    const rx = 9.5, rz = -6.5, rg = ground(rx, rz), rry = -0.9;
    ms.pushT(rx, rg, rz, rry);
    for (const s of [-0.4, 0.4]) logAB(ms, V(s, -0.3, 0), V(s, 1.85, 0), 0.05, { seed: 70 + s * 10, seg: 6, capA: -1, capB: 1, matFor: () => 'bark' });
    boxAt(ms, 'board_grey', 0, 1.25, -0.02, 0.72, 0.84, 0.03);
    cardAt(ms, 'camp_rules', 0, 1.25, 0.0, 0, 0.66, 0.77);
    cardAt(ms, 'fl_fireban', 0.22, 0.82, 0.004, 0, ...sz('fl_fireban', 260), 0.08);
    ms.pushT(0, 1.25, 0.008); card(ms, 'g_drip', 0.7, 0.8, 'grime'); ms.pop();
    ms.pop();
    cols.box(rx, rg + 0.9, rz, 0.45, 0.9, 0.06, rry);
    anchors.rules = anchor(group, 'rules_board', rx, rg + 1.2, rz, rry);
    // clothesline: two leaning poles, towels and a swimsuit pegged on
    const a = V(-6.0, 0, -3.2), b = V(-2.8, 0, -4.4);
    const ga = ground(a.x, a.z), gb = ground(b.x, b.z);
    logAB(ms, V(a.x, ga - 0.3, a.z), V(a.x - 0.1, ga + 1.9, a.z + 0.05), 0.04, { seed: 81, seg: 6, capA: -1, capB: 1, matFor: () => 'bark' });
    logAB(ms, V(b.x, gb - 0.3, b.z), V(b.x + 0.08, gb + 1.85, b.z - 0.05), 0.04, { seed: 82, seg: 6, capA: -1, capB: 1, matFor: () => 'bark' });
    const t0 = V(a.x - 0.1, ga + 1.82, a.z + 0.05), t1 = V(b.x + 0.08, gb + 1.78, b.z - 0.05);
    const line: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; line.push(t0.clone().lerp(t1, t).add(V(0, -Math.sin(Math.PI * t) * 0.18, 0))); }
    tb(ms, rope, line, 0.003, 3);
    const cloths = [colorMat('towel_y', 0xe0c040, 0.95), colorMat('towel_s', 0x3a8ab8, 0.95), colorMat('towel_p', 0xc84870, 0.95), 'blanket'];
    const dir = Math.atan2(t1.x - t0.x, t1.z - t0.z) - Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const t = 0.18 + i * 0.2, p = t0.clone().lerp(t1, t).add(V(0, -Math.sin(Math.PI * t) * 0.18, 0));
      const w = i === 2 ? 0.28 : 0.5, h = i === 2 ? 0.35 : 0.7;
      ms.pushT(p.x, p.y, p.z, dir + r.range(-0.1, 0.1), r.range(-0.08, 0.08));
      ms.quad(cloths[i], V(-w / 2, -h, 0), V(w / 2, -h, 0), V(w / 2, 0, 0), V(-w / 2, 0, 0), [0, 0], [1, 0], [1, 1], [0, 1]);
      ms.quad(cloths[i], V(w / 2, -h, -0.003), V(-w / 2, -h, -0.003), V(-w / 2, 0, -0.003), V(w / 2, 0, -0.003), [0, 0], [1, 0], [1, 1], [0, 1]);
      for (const s of [-1, 1]) boxAt(ms, 'board_warm', s * (w / 2 - 0.05), 0.0, 0, 0.012, 0.06, 0.015);
      ms.pop();
    }
  }

  group.add(ms.build({ name: 'campground_static', noCast: ['grime', 'glowadd', 'puddle', 'sp'] }));
  // nothing here reads past ~130 m: hide it all (one distance check a frame)
  const centre = new THREE.Vector3(cs.x, gy0 + 1, cs.z);
  updaters.push(() => { group.visible = G.uCamPos.value.distanceToSquared(centre) < 130 * 130; });
  // a light pool on the packed dirt round the ring (the fire's own light does the rest)
  void pending;
  const place: Place = {
    group,
    colliders: cols.toWorld(cs.x, gy0, cs.z, 0),
    anchors,
    lights: [],
    update: (dt) => { for (const u of updaters) u(dt); },
    interior: [],
  };
  return place;
}
