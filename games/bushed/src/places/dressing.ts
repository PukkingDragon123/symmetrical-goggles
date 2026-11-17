// Cabin dressing: everything that makes the one room lived in (hearth, wood box, table, bench, chair, bunk,
// kitchen shelves, washstand, desk with drawers, thermometer, calendar, wall map, coat hooks, hanging bundles,
// rug, bucket, lamps), the porch (rocker, firewood, lantern), the woodyard and the fire pit.
// Coordinates are the cabin's local frame (see cabin.ts).
import * as THREE from 'three';
import { Mesher, Rand, Cols, V, tf, box, boxAt, board, log, logAB, lathe, tube, anchor, shadowy, flicker, placeMat, defineMat } from './kit';
import { CABIN, CABIN_GEOM, rock, halfLog } from './cabin';
import { registerInteractable, slidingDrawer } from '../game/interact';
import { loadProp, PROP_META } from './props';
import { buildProduct, writeSplit, writeRound } from './products';
import { SIGNS, ensurePrintMats } from './signs';
import { wallMapTexture } from './wallmap';
import { STOVE } from './stove';
import { flameCards } from './fixtures';
import { SPOTS, heightAt } from '../world/layout';

const { W, D, R, FLOOR } = CABIN;
const { IN } = CABIN_GEOM;

export interface DressCtx {
  ms: Mesher; cols: Cols; group: THREE.Group; anchors: Record<string, THREE.Object3D>; lights: THREE.Light[];
  updaters: ((dt: number) => void)[]; stoveAt: { x: number; z: number }; glass: string;
}

/** load a prop and place it (local coords); resolves null if the prop is missing */
export async function prop(parent: THREE.Object3D, id: string, x: number, y: number, z: number, ry = 0, s = 1): Promise<THREE.Object3D | null> {
  try {
    const o = await loadProp(id);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.scale.setScalar(s);
    parent.add(o);
    return o;
  } catch {
    return null;
  }
}

function product(parent: THREE.Object3D, id: string, x: number, y: number, z: number, ry = 0, pickable = false): THREE.Object3D {
  const o = buildProduct(id);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  parent.add(o);
  if (!pickable) o.userData.decor = true;
  return o;
}

/** a flat sign/paper quad from the signs atlas facing +Z at the current frame */
export function signQuad(ms: Mesher, key: string, w: number, h: number, mat = 'signs'): void {
  const [u0, v0, u1, v1] = SIGNS.uv(key);
  ms.quad(mat, V(-w / 2, -h / 2, 0), V(w / 2, -h / 2, 0), V(w / 2, h / 2, 0), V(-w / 2, h / 2, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
}

export function ensureSignMat(): void { ensurePrintMats(); }

export async function dressing(c: DressCtx): Promise<{ lantern: THREE.PointLight; porchLamp: THREE.PointLight; setThermometer: (cel: number) => void }> {
  const { ms, cols, group, anchors, stoveAt } = c;
  ensureSignMat();
  const rnd = new Rand(1234);
  const F = FLOOR;
  const wallZ = D / 2 - R; // interior face of the front/back logs (z = +-wallZ)
  const wallX = W / 2 - R;
  const pending: Promise<unknown>[] = [];

  // ================================================================================ hearth + stove corner
  const hx0 = 0.7, hx1 = 2.22, hz0 = -2.93, hz1 = -1.4;
  {
    // raised stone platform with a board kerb
    ms.pushT((hx0 + hx1) / 2, F + 0.05, (hz0 + hz1) / 2);
    box(ms, 'stone', hx1 - hx0, 0.1, hz1 - hz0, { uv: [0.3, 0.7] });
    ms.pop();
    board(ms, 'board_dark', rnd, (hx0 + hx1) / 2, F + 0.05, hz1 + 0.02, hx1 - hx0 + 0.04, 0.11, 0.04, 0, { grain: 'x' });
    board(ms, 'board_dark', rnd, hx0 - 0.02, F + 0.05, (hz0 + hz1) / 2, 0.04, 0.11, hz1 - hz0, 0, { grain: 'z' });
    // heat shield: stacked fieldstone wall on the back logs, capped with a board shelf
    ms.pushT((hx0 + hx1) / 2, F + 0.72, hz0 + 0.07);
    box(ms, 'stone', hx1 - hx0, 1.25, 0.14, { uv: [0.7, 0.1] });
    ms.pop();
    board(ms, 'board_dark', rnd, (hx0 + hx1) / 2, F + 1.37, hz0 + 0.11, hx1 - hx0 + 0.1, 0.04, 0.24, 0, { grain: 'x' });
    // side cheek on the room side
    ms.pushT(hx0 + 0.07, F + 0.5, hz0 + 0.3);
    box(ms, 'stone', 0.14, 0.8, 0.46, { uv: [0.2, 0.4] });
    ms.pop();
    cols.box((hx0 + hx1) / 2, F + 0.7, hz0 + 0.12, (hx1 - hx0) / 2, 0.7, 0.14);
    cols.box(stoveAt.x, F + 0.5, stoveAt.z, 0.38, 0.5, STOVE.L / 2 + 0.05);
    // things on the shield shelf: matches, a tin, the coffee
    product(group, 'matches', hx0 + 0.25, F + 1.39, hz0 + 0.12, 0.2);
    product(group, 'coffee', hx0 + 0.55, F + 1.39, hz0 + 0.12, -0.3);
    product(group, 'syrup', hx1 - 0.3, F + 1.39, hz0 + 0.12, 0.1);
    // a cast pan hanging from a nail on the shield, poker + shovel leaning
    pending.push(prop(group, 'brass_pan_01', hx1 - 0.35, F + 0.85, hz0 + 0.17, 0).then((o) => { if (o) { o.rotation.x = -Math.PI / 2 + 0.08; o.position.y = F + 1.0; } }));
    tube(ms, 'iron', [V(hx0 + 0.22, F + 0.1, hz1 - 0.12), V(hx0 + 0.26, F + 0.75, hz0 + 0.28)], 0.008, 5);
    tube(ms, 'iron', [V(hx0 + 0.26, F + 0.75, hz0 + 0.28), V(hx0 + 0.25, F + 0.8, hz0 + 0.26), V(hx0 + 0.27, F + 0.83, hz0 + 0.29)], 0.01, 5);
    // the stove top: coffee pot and a pot
    product(group, 'coffeepot', stoveAt.x - 0.12, F + 0.1 + STOVE.AXIS_Y + STOVE.R - 0.01, stoveAt.z + 0.18, 0.8);
    pending.push(prop(group, 'pot_enamel_01', stoveAt.x + 0.1, F + 0.1 + STOVE.AXIS_Y + STOVE.R - 0.015, stoveAt.z - 0.15, 0.4));
  }
  // ================================================================================ wood box
  {
    const x0 = 1.74, x1 = wallX - 0.01, z0 = -1.32, z1 = -0.5, h = 0.56;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const z of [z0, z1]) board(ms, 'board_warm', rnd, cx, F + h / 2, z, x1 - x0, h, 0.025, 0, { grain: 'x' });
    board(ms, 'board_warm', rnd, x0, F + h / 2, cz, 0.025, h, z1 - z0, 0, { grain: 'z' });
    board(ms, 'board_warm', rnd, x1, F + h / 2, cz, 0.025, h, z1 - z0, 0, { grain: 'z' });
    board(ms, 'board_dark', rnd, cx, F + 0.03, cz, x1 - x0, 0.03, z1 - z0, 0, { grain: 'z' });
    // splits inside, lying along z
    const wr = new Rand(88);
    for (let layer = 0; layer < 4; layer++) for (let i = 0; i < 3; i++) {
      const x = x0 + 0.08 + i * 0.13 + wr.range(-0.02, 0.02);
      const y = F + 0.1 + layer * 0.11;
      ms.pushT(x, y, z0 + 0.04, -Math.PI / 2 + wr.range(-0.1, 0.1), 0, wr.range(0, 6.28));
      writeSplit(ms, wr, 0.4 + wr.range(-0.04, 0.03), 0.13, wr.int(0, 9999));
      ms.pop();
    }
    // kindling bundle leaning in the corner
    product(group, 'kindling', x0 - 0.08, F, z1 + 0.1, 0.4);
    const wb = anchor(group, 'woodbox', cx, F + h, cz, -Math.PI / 2);
    anchors.woodbox = wb;
    cols.box(cx, F + h / 2, cz, (x1 - x0) / 2, h / 2, (z1 - z0) / 2);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(cx, F + h / 2, cz);
    group.add(hit);
    registerInteractable(hit, { kind: 'container', label: () => 'Wood box', use: (ctx) => ctx.game?.placeAction?.('woodbox', ctx) });
  }
  // ================================================================================ tools hanging on the east wall
  {
    const x = wallX - 0.02;
    // peg board
    board(ms, 'board_dark', rnd, x - 0.01, F + 1.62, -0.95, 0.025, 0.12, 1.0, 0, { grain: 'z' });
    for (const z of [-1.35, -1.05, -0.75, -0.5]) {
      ms.pushT(x - 0.04, F + 1.64, z, 0, 0, Math.PI / 2 - 0.25);
      lathe(ms, 'board_warm', [[0.012, 0], [0.012, 0.09], [0.016, 0.1], [0, 0.11]], 6);
      ms.pop();
    }
    pending.push(prop(group, 'handsaw_wood', x - 0.06, F + 1.0, -1.1, -Math.PI / 2).then((o) => { if (o) { o.rotation.set(0, -Math.PI / 2, Math.PI / 2 - 0.05); o.position.set(x - 0.05, F + 1.2, -1.15); } }));
    pending.push(prop(group, 'hatchet', x - 0.05, F + 1.15, -0.5, -Math.PI / 2).then((o) => { if (o) { o.rotation.set(Math.PI, -Math.PI / 2, 0); o.position.set(x - 0.06, F + 1.7, -0.52); } }));
    product(group, 'rope', x - 0.1, F + 1.32, -0.78, Math.PI / 2).rotation.set(Math.PI / 2, 0, Math.PI / 2);
  }
  // ================================================================================ kitchen shelves + washstand (east wall)
  {
    const x = wallX, z0 = -0.15, z1 = 1.3, dep = 0.27;
    const cz = (z0 + z1) / 2;
    const ys = [F + 1.18, F + 1.52, F + 1.86];
    for (const y of ys) {
      board(ms, 'board_warm', rnd, x - dep / 2, y, cz, dep, 0.03, z1 - z0, 0, { grain: 'z' });
      // brackets
      for (const z of [z0 + 0.1, z1 - 0.1]) {
        boxAt(ms, 'board_dark', x - 0.03, y - 0.09, z, 0.04, 0.15, 0.025);
        ms.pushT(x - 0.1, y - 0.07, z, 0, 0, 0.8);
        box(ms, 'board_dark', 0.2, 0.025, 0.022, { grain: 'x' });
        ms.pop();
      }
    }
    for (let i = 0; i < ys.length; i++) anchors[`shelf_${i}`] = anchor(group, `shelf_${i}`, x - dep / 2, ys[i] + 0.015, cz, -Math.PI / 2);
    // shelf contents
    const top = (i: number) => ys[i] + 0.015;
    product(group, 'beans', x - 0.13, top(0), z0 + 0.12, -1.6);
    product(group, 'beans', x - 0.15, top(0), z0 + 0.22, -1.4);
    product(group, 'beans', x - 0.12, top(0) + 0.105, z0 + 0.17, -1.5);
    product(group, 'cookies', x - 0.14, top(0), z0 + 0.45, -1.6);
    product(group, 'coffee', x - 0.14, top(0), z0 + 0.7, -1.7);
    product(group, 'jar_preserves', x - 0.13, top(0), z0 + 0.9, 0);
    product(group, 'jar_preserves', x - 0.15, top(0), z0 + 1.02, 1);
    product(group, 'jar_flour', x - 0.14, top(0), z1 - 0.15, 0);
    pending.push(prop(group, 'jug_01', x - 0.14, top(1), z0 + 0.18, -1.2));
    pending.push(prop(group, 'brass_pot_01', x - 0.14, top(1), z0 + 0.55, 0.4));
    pending.push(prop(group, 'wooden_bowl_01', x - 0.14, top(1), z0 + 0.92, 0));
    pending.push(prop(group, 'wooden_bowl_02', x - 0.14, top(1) + 0.05, z0 + 0.92, 0.5));
    product(group, 'syrup', x - 0.14, top(1), z1 - 0.18, -1.7);
    product(group, 'enamel_mug', x - 0.12, top(2), z0 + 0.2, 0.4);
    product(group, 'enamel_mug', x - 0.16, top(2), z0 + 0.32, 2.2);
    product(group, 'jar_preserves', x - 0.14, top(2), z0 + 0.55, 2);
    product(group, 'batteries', x - 0.13, top(2), z0 + 0.8, -1.6);
    pending.push(prop(group, 'mantel_clock_01', x - 0.14, top(2), z1 - 0.3, -Math.PI / 2));
    // washstand below: a plank counter on legs with an enamel basin and a pail
    const wy = F + 0.82, wd = 0.5;
    board(ms, 'board_warm', rnd, x - wd / 2, wy, cz, wd, 0.04, z1 - z0, 0, { grain: 'z' });
    board(ms, 'board_warm', rnd, x - wd / 2, F + 0.2, cz, wd - 0.06, 0.03, z1 - z0 - 0.08, 0, { grain: 'z' });
    for (const z of [z0 + 0.04, z1 - 0.04]) for (const xx of [x - wd + 0.04, x - 0.04]) boxAt(ms, 'board_warm', xx, F + wy / 2 - F / 2 + 0.0, z, 0.05, wy - F, 0.05, 0, { grain: 'y' });
    // apron board
    board(ms, 'board_warm', rnd, x - wd + 0.02, wy - 0.08, cz, 0.025, 0.12, z1 - z0, 0, { grain: 'z' });
    ms.pushT(x - 0.25, wy + 0.02, cz - 0.15);
    lathe(ms, 'enamel', [[0, 0], [0.12, 0], [0.17, 0.08], [0.2, 0.1], [0.205, 0.105], [0.19, 0.1], [0.16, 0.08], [0.11, 0.008], [0, 0.008]], 18);
    ms.pop();
    product(group, 'soap', x - 0.28, wy + 0.02, cz + 0.32, 0.3);
    pending.push(prop(group, 'wooden_bucket_01', x - 0.25, F + 0.22, cz + 0.2, 0.7, 0.9));
    cols.box(x - wd / 2, F + 0.45, cz, wd / 2, 0.45, (z1 - z0) / 2);
  }
  // ================================================================================ table, bench, chair (west wall under the window)
  {
    const tx0 = -wallX + 0.03, tx1 = tx0 + 0.74, tz0 = -0.8, tz1 = 1.05, ty = F + 0.76;
    const tcx = (tx0 + tx1) / 2, tcz = (tz0 + tz1) / 2;
    // three thick planks for the top, breadboard ends
    const pw = (tx1 - tx0) / 3;
    for (let i = 0; i < 3; i++) board(ms, 'board_warm', rnd, tx0 + pw * (i + 0.5), ty - 0.025, tcz, pw - 0.006, 0.05, tz1 - tz0 - 0.08, 0, { grain: 'z' });
    for (const z of [tz0 + 0.03, tz1 - 0.03]) board(ms, 'board_warm', rnd, tcx, ty - 0.025, z, tx1 - tx0, 0.05, 0.06, 0, { grain: 'x' });
    // trestle legs: slab + feet + stretcher
    for (const z of [tz0 + 0.25, tz1 - 0.25]) {
      board(ms, 'board_warm', rnd, tcx, F + 0.38, z, 0.2, 0.68, 0.06, 0, { grain: 'y' });
      board(ms, 'board_warm', rnd, tcx, F + 0.04, z, tx1 - tx0 - 0.08, 0.08, 0.08, 0, { grain: 'x' });
      board(ms, 'board_warm', rnd, tcx, ty - 0.08, z, tx1 - tx0 - 0.12, 0.06, 0.07, 0, { grain: 'x' });
    }
    board(ms, 'board_warm', rnd, tcx, F + 0.28, tcz, 0.07, 0.07, tz1 - tz0 - 0.4, 0, { grain: 'z' });
    cols.box(tcx, (F + ty) / 2, tcz, (tx1 - tx0) / 2, (ty - F) / 2, (tz1 - tz0) / 2);
    anchors.table = anchor(group, 'table', tcx, ty, tcz, Math.PI / 2);
    // on the table: lantern, a tin plate, mug, the beer, a deck of cards... and bannock in a cloth
    pending.push(prop(group, 'Lantern_01', tcx + 0.05, ty, tcz - 0.25, 0.3));
    product(group, 'enamel_plate', tcx + 0.12, ty, tcz + 0.35, 0);
    product(group, 'enamel_mug', tcx - 0.1, ty, tcz + 0.12, 2.5);
    product(group, 'beer', tcx + 0.15, ty, tcz - 0.55, 0.2);
    product(group, 'bread', tcx - 0.12, ty, tcz + 0.62, 0.4);
    pending.push(prop(group, 'wooden_cutting_board', tcx - 0.1, ty, tcz + 0.62, 0.3).then((o) => { if (o) o.position.y = ty; }));
    // bench
    const bx = tx1 + 0.3, bz0 = -0.62, bz1 = 0.9, by = F + 0.45;
    board(ms, 'board_warm', rnd, bx, by - 0.025, (bz0 + bz1) / 2, 0.3, 0.05, bz1 - bz0, 0, { grain: 'z' });
    for (const z of [bz0 + 0.2, bz1 - 0.2]) {
      board(ms, 'board_warm', rnd, bx, F + 0.21, z, 0.26, 0.42, 0.05, 0, { grain: 'y' });
    }
    board(ms, 'board_warm', rnd, bx, F + 0.12, (bz0 + bz1) / 2, 0.05, 0.06, bz1 - bz0 - 0.4, 0, { grain: 'z' });
    cols.box(bx, (F + by) / 2, (bz0 + bz1) / 2, 0.15, (by - F) / 2, (bz1 - bz0) / 2);
    anchors.bench = anchor(group, 'bench', bx, by, (bz0 + bz1) / 2, -Math.PI / 2);
    const bhit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, bz1 - bz0), new THREE.MeshBasicMaterial({ visible: false }));
    bhit.position.set(bx, by - 0.02, (bz0 + bz1) / 2);
    group.add(bhit);
    registerInteractable(bhit, { kind: 'seat', label: () => 'Sit', use: (ctx) => ctx.game?.placeAction?.('sit_bench', ctx) });
    // chair at the head of the table
    chair(ms, rnd, tcx + 0.05, F, tz1 + 0.42, Math.PI + 0.15);
    cols.box(tcx + 0.05, F + 0.45, tz1 + 0.42, 0.22, 0.45, 0.22);
    anchors.chair = anchor(group, 'chair', tcx + 0.05, F + 0.45, tz1 + 0.42, Math.PI + 0.15);
  }
  // ================================================================================ bunk (west wall, back corner)
  {
    const bx0 = -wallX + 0.02, bx1 = bx0 + 0.88, bz0 = -wallZ + 0.03, bz1 = bz0 + 1.98;
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    const deck = F + 0.42;
    // four posts (peeled poles), rails, slats
    const posts: [number, number, number][] = [[bx0 + 0.05, bz0 + 0.05, 1.05], [bx1 - 0.05, bz0 + 0.05, 1.05], [bx0 + 0.05, bz1 - 0.05, 0.75], [bx1 - 0.05, bz1 - 0.05, 0.75]];
    for (const [x, z, h] of posts) logAB(ms, V(x, F, z), V(x, F + h, z), 0.055, { seed: 1000 + x * 10 + z, seg: 8, capA: -1, capB: 3, matFor: () => 'log_int' });
    for (const x of [bx0 + 0.05, bx1 - 0.05]) logAB(ms, V(x, deck - 0.06, bz0 + 0.02), V(x, deck - 0.06, bz1 - 0.02), 0.05, { seed: 1010 + x * 10, seg: 8, capA: -1, capB: -1, matFor: () => 'log_int' });
    for (const z of [bz0 + 0.05, bz1 - 0.05]) {
      logAB(ms, V(bx0 + 0.02, deck - 0.06, z), V(bx1 - 0.02, deck - 0.06, z), 0.045, { seed: 1020 + z * 10, seg: 8, capA: -1, capB: -1, matFor: () => 'log_int' });
      logAB(ms, V(bx0 + 0.02, F + (z < cz ? 0.95 : 0.66), z), V(bx1 - 0.02, F + (z < cz ? 0.95 : 0.66), z), 0.04, { seed: 1030 + z * 10, seg: 8, capA: -1, capB: -1, matFor: () => 'log_int' });
    }
    board(ms, 'board_dark', rnd, cx, deck - 0.01, cz, bx1 - bx0 - 0.1, 0.025, bz1 - bz0 - 0.1, 0, { grain: 'z' });
    // straw-tick mattress (soft pillowed box), blanket over it and hanging down the room side, pillow
    const mh = 0.13;
    cushion(ms, 'ticking', cx, deck + mh / 2, cz, bx1 - bx0 - 0.12, mh, bz1 - bz0 - 0.12, 0.03, 4);
    // blanket: drapes over the top from the foot to 0.45 m from the head, folds down the room side
    const bl = { x0: bx0 + 0.02, x1: bx1 + 0.04, z0: bz0 + 0.42, z1: bz1 - 0.02, y: deck + mh + 0.012 };
    blanket(ms, rnd, bl.x0, bl.x1, bl.z0, bl.z1, bl.y, deck - 0.04);
    cushion(ms, 'ticking', cx + 0.02, deck + mh + 0.05, bz0 + 0.24, 0.55, 0.1, 0.3, 0.04, 3);
    cols.box(cx, (F + deck + mh) / 2, cz, (bx1 - bx0) / 2, (deck + mh - F) / 2, (bz1 - bz0) / 2);
    anchors.bed = anchor(group, 'bed', cx, deck + mh + 0.1, cz, 0);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, 0.2, bz1 - bz0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(cx, deck + mh, cz);
    group.add(hit);
    registerInteractable(hit, { kind: 'bed', label: () => 'Sleep', use: (ctx) => ctx.game?.placeAction?.('sleep', ctx) });
    // a shelf above the bunk with books and a candle, and the snowshoes on the wall over it
    board(ms, 'board_warm', rnd, -wallX + 0.12, F + 1.62, cz + 0.25, 0.22, 0.03, 0.9, 0, { grain: 'z' });
    product(group, 'book_stack', -wallX + 0.12, F + 1.635, cz + 0.05, Math.PI / 2);
    product(group, 'candle', -wallX + 0.12, F + 1.635, cz + 0.5, 0);
    // boots under the bunk
    pending.push(prop(group, 'rubber_boots', cx + 0.15, F, bz1 + 0.22, 0.3));
  }
  // ================================================================================ desk with drawers (front wall, under the window)
  {
    const dx0 = 0.45, dx1 = 1.68, dz1 = wallZ - 0.02, dz0 = dz1 - 0.58, dy = F + 0.76;
    const cx = (dx0 + dx1) / 2, cz = (dz0 + dz1) / 2;
    board(ms, 'board_warm', rnd, cx, dy - 0.02, cz, dx1 - dx0, 0.04, dz1 - dz0, 0, { grain: 'x' });
    // legs, side panels, back
    for (const x of [dx0 + 0.04, dx1 - 0.04]) {
      board(ms, 'board_warm', rnd, x, (F + dy - 0.04) / 2, cz, 0.04, dy - 0.04 - F, dz1 - dz0 - 0.04, 0, { grain: 'y' });
    }
    board(ms, 'board_warm', rnd, cx, (F + dy) / 2 + 0.15, dz1 - 0.02, dx1 - dx0 - 0.08, dy - F - 0.34, 0.02, 0, { grain: 'x' });
    // drawer carcass under the top: two drawers sliding toward -Z (into the room)
    const frame = new THREE.Group();
    frame.position.set(0, 0, 0);
    frame.rotation.y = Math.PI; // local +Z of the frame = cabin -Z
    group.add(frame);
    const dw = (dx1 - dx0 - 0.1) / 2;
    for (let i = 0; i < 2; i++) {
      const x = dx0 + 0.05 + dw * (i + 0.5);
      const dms = new Mesher();
      const dr = new Rand(300 + i);
      // drawer box in its own frame: front at local +Z
      board(dms, 'board_warm', dr, 0, 0, 0.27, dw - 0.012, 0.13, 0.022, 0, { grain: 'x' });
      board(dms, 'board_dark', dr, 0, -0.055, 0.0, dw - 0.04, 0.012, 0.52, 0, { grain: 'z' });
      board(dms, 'board_dark', dr, -dw / 2 + 0.02, -0.01, 0.0, 0.012, 0.1, 0.52, 0, { grain: 'z' });
      board(dms, 'board_dark', dr, dw / 2 - 0.02, -0.01, 0.0, 0.012, 0.1, 0.52, 0, { grain: 'z' });
      board(dms, 'board_dark', dr, 0, -0.01, -0.26, dw - 0.04, 0.1, 0.012, 0, { grain: 'x' });
      // knob
      dms.pushT(0, 0, 0.285, 0, Math.PI / 2);
      lathe(dms, 'board_dark', [[0, 0], [0.012, 0], [0.01, 0.015], [0.018, 0.025], [0, 0.03]], 8);
      dms.pop();
      const drawer = dms.build({ name: `drawer_${i}` });
      // frame coords: x flips under the rotation; z: cabin cz -> frame -cz
      drawer.position.set(-x, dy - 0.11, -cz);
      frame.add(drawer);
      const ctl = slidingDrawer(drawer, 0.3);
      c.updaters.push((dt) => ctl.update(dt));
      anchors[`drawer_${i}`] = drawer;
      // something in each drawer
      const inside = buildProduct(i === 0 ? 'matches' : 'file');
      inside.position.set(0, -0.045, 0.05);
      inside.rotation.y = i ? 0.4 : 0;
      drawer.add(inside);
    }
    cols.box(cx, (F + dy) / 2, cz, (dx1 - dx0) / 2, (dy - F) / 2, (dz1 - dz0) / 2);
    anchors.journal_desk = anchor(group, 'journal_desk', cx - 0.1, dy, cz - 0.05, Math.PI);
    // on the desk: oil lamp, inkwell, pencil, a tin of nails
    pending.push(prop(group, 'vintage_oil_lamp', dx1 - 0.17, dy, cz + 0.12, 0, 0.8));
    product(group, 'inkwell', dx0 + 0.18, dy, cz + 0.15, 0);
    product(group, 'pencil', cx + 0.15, dy, cz - 0.12, 0.4);
    pending.push(prop(group, 'seadogs_compass', dx0 + 0.32, dy, cz + 0.2, 0.3));
    pending.push(prop(group, 'wooden_stool_01', cx - 0.05, F, dz0 - 0.32, 0.2));
  }
  // ================================================================================ wall things
  // thermometer (front wall, between door and window)
  let setThermometer: (cel: number) => void = () => {};
  {
    const z = wallZ - 0.025, x = 0.05, y = F + 1.32;
    const tw = 0.17, th = 0.78;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = Math.PI;
    group.add(g);
    const tms = new Mesher();
    signQuad(tms, 'thermometer', tw, th);
    // backing board edges and screws
    boxAt(tms, 'board_dark', 0, 0, -0.012, tw + 0.02, th + 0.02, 0.02);
    for (const sy of [-th / 2 + 0.025, th / 2 - 0.025]) boxAt(tms, 'iron', 0, sy, 0.004, 0.012, 0.012, 0.006);
    // glass tube brackets
    for (const sy of [-0.24, 0.3]) boxAt(tms, 'galv', 0, sy, 0.012, 0.03, 0.012, 0.016);
    g.add(tms.build({ name: 'thermometer' }));
    // tube, bulb, red column
    const tubeM = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0xdfe8e8, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }));
    tubeM.position.set(0, 0.03, 0.016);
    tubeM.renderOrder = 2;
    g.add(tubeM);
    const red = new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.3, emissive: new THREE.Color(0x400000), emissiveIntensity: 0.4 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), red);
    bulb.position.set(0, -0.28, 0.016);
    g.add(bulb);
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.004, 1, 0.004), red);
    col.position.set(0, 0, 0.016);
    g.add(col);
    // scale: -40 C at y = -0.24 .. +50 C at y = +0.3 (matches the painted face)
    const yAt = (cel: number) => -0.24 + (Math.max(-40, Math.min(50, cel)) + 40) / 90 * 0.54;
    setThermometer = (cel: number) => {
      const y0 = -0.27, y1 = yAt(cel);
      col.scale.y = Math.max(0.001, y1 - y0);
      col.position.y = (y0 + y1) / 2;
    };
    setThermometer(18);
    anchors.thermometer = anchor(group, 'thermometer', x, y, z - 0.02, Math.PI);
  }
  // calendar on the east wall by the desk
  {
    const g = new THREE.Group();
    g.position.set(wallX - 0.02, F + 1.42, 1.98);
    g.rotation.y = -Math.PI / 2;
    group.add(g);
    const cms = new Mesher();
    cms.pushT(0, 0, 0.002, 0, 0.0, 0.03);
    signQuad(cms, 'calendar', 0.3, 0.46);
    cms.pop();
    boxAt(cms, 'iron', 0, 0.21, 0.008, 0.008, 0.008, 0.02);
    g.add(cms.build({ name: 'calendar' }));
    anchors.calendar = g;
  }
  // wall map (runtime canvas from the world layout) on the back wall
  {
    const g = new THREE.Group();
    g.position.set(-0.35, F + 1.48, -wallZ + 0.02);
    group.add(g);
    const mw = 0.95, mh = 0.68;
    const tex = wallMapTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const geo = new THREE.PlaneGeometry(mw, mh, 6, 4);
    // a little paper waviness
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.006 * Math.sin(p.getX(i) * 9 + p.getY(i) * 5));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    g.add(m);
    const pms = new Mesher();
    for (const [x, y] of [[-mw / 2 + 0.02, mh / 2 - 0.02], [mw / 2 - 0.02, mh / 2 - 0.02], [-mw / 2 + 0.02, -mh / 2 + 0.02], [mw / 2 - 0.02, -mh / 2 + 0.03]]) boxAt(pms, 'iron', x, y, 0.01, 0.01, 0.01, 0.01);
    g.add(pms.build());
    anchors.map = g;
  }
  // coat hooks (front wall, left of the door) with the mackinaw jacket and a hat
  {
    const z = wallZ - 0.02;
    board(ms, 'board_warm', rnd, -1.83, F + 1.66, z, 0.66, 0.1, 0.025, 0, { grain: 'x' });
    const pegs = [-2.06, -1.83, -1.6];
    for (const x of pegs) {
      ms.pushT(x, F + 1.66, z - 0.01, 0, -Math.PI / 2 + 0.35);
      lathe(ms, 'board_dark', [[0.013, 0], [0.012, 0.1], [0.018, 0.11], [0, 0.12]], 6);
      ms.pop();
    }
    jacket(ms, -2.04, F + 1.7, z - 0.13);
    pending.push(prop(group, 'fishermans_hat', -1.6, F + 1.6, z - 0.1, 0).then((o) => { if (o) { o.rotation.set(-1.25, 0, 0); } }));
    product(group, 'backpack', -1.86, F + 0.0, z - 0.2, Math.PI + 0.2);
    anchors.coat_hooks = anchor(group, 'coat_hooks', -1.83, F + 1.66, z - 0.12, Math.PI);
  }
  // hanging bundles and a drying line over the stove
  {
    const beamZ = -1.05, beamY = CABIN_GEOM.EAVE - 0.2 - 0.12;
    for (const [x, kind] of [[0.25, 0], [0.5, 1], [-0.15, 0], [-0.6, 2], [0.85, 1]] as [number, number][]) {
      herbBundle(ms, rnd, x, beamY, beamZ, kind);
    }
    // line from the back wall to the beam above the stove, socks and mittens pegged on it
    const a = V(stoveAt.x - 0.55, CABIN_GEOM.EAVE - 0.45, -wallZ + 0.03), b = V(stoveAt.x - 0.55, CABIN_GEOM.EAVE - 0.4, beamZ);
    tube(ms, 'rope', [a, V((a.x + b.x) / 2, a.y - 0.06, (a.z + b.z) / 2), b], 0.004, 4);
    sock(ms, rnd, a.x, a.y - 0.05, -2.3, 0);
    sock(ms, rnd, a.x, a.y - 0.06, -2.05, 1);
    mitten(ms, rnd, a.x, a.y - 0.06, -1.75);
  }
  // braided rug in the middle of the room
  {
    ms.pushT(0.55, F + 0.003, 0.35, 0.2);
    rug(ms, 0.85, 0.6);
    ms.pop();
  }
  // a broom by the door, an axe by the door
  {
    const x = -0.28, z = wallZ - 0.08;
    tube(ms, 'board_warm', [V(x, F + 0.2, z), V(x + 0.02, F + 1.3, z + 0.04)], 0.014, 6);
    ms.pushT(x, F + 0.12, z - 0.005, 0, 0.04, -0.02);
    lathe(ms, 'rope', [[0.02, 0.2], [0.05, 0.12], [0.09, 0.02], [0.1, 0.0], [0, 0.0]].reverse() as [number, number][], 10);
    ms.pop();
  }

  // ================================================================================ porch
  {
    const pz = D / 2 + R + 0.02;
    // firewood stacked against the front wall under the window (two rows deep, between the window and the corner)
    const fr = new Rand(5150);
    const fx0 = 0.55, fx1 = W / 2 + 0.05;
    for (let row = 0; row < 2; row++) for (let layer = 0; layer < 6; layer++) {
      let x = fx0 + (layer % 2) * 0.06;
      while (x < fx1 - 0.08) {
        const rr = fr.range(0.06, 0.08);
        ms.pushT(x + rr, F + 0.075 + layer * 0.125 + fr.range(-0.01, 0.01), pz + 0.02 + row * 0.42, Math.PI / 2 + fr.range(-0.06, 0.06), 0, fr.range(0, 6.28));
        writeSplit(ms, fr, 0.4 + fr.range(-0.03, 0.03), rr * 1.6, fr.int(0, 99999));
        ms.pop();
        x += rr * 2 + 0.01;
      }
    }
    cols.box((fx0 + fx1) / 2, F + 0.4, pz + 0.42, (fx1 - fx0) / 2, 0.4, 0.42);
    // the rocker: looking out over the clearing toward the fire pit
    const chairX = -1.95, chairZ = D / 2 + 1.25, chairRy = 0.35;
    pending.push(prop(group, 'Rockingchair_01', chairX, F, chairZ, chairRy));
    anchors.porch_chair = anchor(group, 'porch_chair', chairX, F + 0.45, chairZ, chairRy);
    const chit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    chit.position.set(chairX, F + 0.45, chairZ);
    chit.rotation.y = chairRy;
    group.add(chit);
    registerInteractable(chit, { kind: 'seat', label: () => 'Sit', use: (ctx) => ctx.game?.placeAction?.('sit_porch', ctx) });
    cols.box(chairX, F + 0.45, chairZ, 0.3, 0.45, 0.35, chairRy);
    // a stump side table with a beer on it
    ms.pushT(chairX + 0.55, F, chairZ - 0.15);
    writeRound(ms, new Rand(81), 0.42, 0.16, 81, 'endgrain', 1);
    ms.pop();
    product(group, 'beer', chairX + 0.57, F + 0.42, chairZ - 0.13, 1.2);
    // a lantern hanging from a nail in the middle post
    pending.push(prop(group, 'Lantern_01', 0.32, CABIN_GEOM.EAVE - 0.65, D / 2 + CABIN.PORCH - 0.22, 0.4));
    tube(ms, 'iron', [V(0.32, CABIN_GEOM.EAVE - 0.3, D / 2 + CABIN.PORCH - 0.18), V(0.32, CABIN_GEOM.EAVE - 0.3, D / 2 + CABIN.PORCH - 0.24)], 0.004, 4);
    // snowshoes crossed on the wall left of the door, antlers above the door
    snowshoe(ms, -1.95, F + 1.35, pz + 0.04, 0.35);
    snowshoe(ms, -1.62, F + 1.32, pz + 0.05, -0.3);
    // a washtub hanging on the wall
    ms.pushT(-2.25, F + 0.95, pz + 0.12, 0, Math.PI / 2);
    lathe(ms, 'galv', [[0, 0], [0.22, 0], [0.26, 0.2], [0.27, 0.21], [0.26, 0.21], [0.21, 0.01], [0, 0.01]], 16);
    ms.pop();
  }
  // porch lamp light (the lantern on the post) and the table lantern light
  const porchLamp = new THREE.PointLight(0xffa14a, 1.6, 4.2, 1.8);
  porchLamp.position.set(0.32, CABIN_GEOM.EAVE - 0.5, D / 2 + CABIN.PORCH - 0.22);
  group.add(porchLamp);
  c.lights.push(porchLamp);
  const lantern = new THREE.PointLight(0xffb366, 4, 10, 1.7);
  lantern.position.set(-wallX + 0.42, F + 0.76 + 0.2, (-0.8 + 1.05) / 2 - 0.25);
  shadowy(lantern, 512, -0.003);
  lantern.shadow.camera.far = 10;
  group.add(lantern);
  c.lights.push(lantern);

  // ================================================================================ woodyard + fire pit
  await woodyard(c);

  await Promise.all(pending);
  // flames in the lanterns (the props carry a flame card; make sure it glows) + mark decor
  group.traverse((o) => {
    if (o.name === 'flame') {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m && 'emissiveIntensity' in m) m.emissiveIntensity = 2.5;
    }
  });
  void flicker; void tf; void flameCards; void PROP_META; void log; void halfLog;
  return { lantern, porchLamp, setThermometer };
}

// ---------------------------------------------------------------------------------------------- pieces
/** a soft cushion: a subdivided box with rounded (pillowed) faces */
export function cushion(ms: Mesher, mat: string, x: number, y: number, z: number, w: number, h: number, d: number, puff: number, seg = 4): void {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, 2, seg * 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i) / (w / 2), py = p.getY(i) / (h / 2), pz = p.getZ(i) / (d / 2);
    const fx = 1 - px * px, fz = 1 - pz * pz;
    // round the edges in, puff the faces out
    let yy = p.getY(i) + Math.sign(py) * puff * fx * fz;
    const shrink = 1 - 0.18 * Math.abs(py) * (1 - Math.min(fx, fz));
    yy *= 1;
    p.setXYZ(i, p.getX(i) * shrink, yy, p.getZ(i) * shrink);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + p.getY(i) * 0.3, p.getZ(i) + p.getY(i) * 0.3);
  ms.geom(mat, g, tf(x, y, z));
  g.dispose();
}

/** a wool blanket over a bed: top sheet with soft rumples, folding down the +x (room) side */
function blanket(ms: Mesher, rnd: Rand, x0: number, x1: number, z0: number, z1: number, y: number, yDrop: number): void {
  const nx = 10, nz = 16, nd = 4;
  const ph = rnd.range(0, 6);
  // grid over the top, then rows hanging down at x1
  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i <= nz; i++) {
    const row: THREE.Vector3[] = [];
    const z = z0 + (z1 - z0) * (i / nz);
    for (let j = 0; j <= nx; j++) {
      const x = x0 + (x1 - x0 - 0.04) * (j / nx);
      const ru = 0.012 * Math.sin(i * 1.3 + ph) * Math.sin(j * 0.9 + ph * 2) + 0.01 * Math.sin(i * 0.5 + j * 0.3);
      const edge = i === 0 ? -0.005 : 0;
      row.push(V(x, y + ru + edge, z));
    }
    for (let k = 1; k <= nd; k++) {
      const t = k / nd;
      row.push(V(x1 - 0.02 + 0.03 * Math.sin(t * Math.PI) + 0.01 * Math.sin(i * 1.7 + ph), y - (y - yDrop) * t, z + 0.015 * Math.sin(t * 3 + i)));
    }
    pts.push(row);
  }
  const cols = pts[0].length;
  const uvAt = (i: number, j: number): [number, number] => {
    // distance-ish UVs in metres
    const p = pts[i][j];
    return [p.z, (j <= nx ? p.x : x1 + (y - p.y))];
  };
  for (let i = 0; i < nz; i++) for (let j = 0; j < cols - 1; j++) {
    const a = pts[i][j], b = pts[i][j + 1], cc = pts[i + 1][j + 1], d = pts[i + 1][j];
    const n = new THREE.Vector3().subVectors(d, a).cross(new THREE.Vector3().subVectors(b, a)).normalize();
    ms.quad('blanket', a, d, cc, b, uvAt(i, j), uvAt(i + 1, j), uvAt(i + 1, j + 1), uvAt(i, j + 1), n);
  }
  // folded-back edge at the head (z0): a rolled lip
  tube(ms, 'blanket', [V(x0, y + 0.01, z0 + 0.02), V((x0 + x1) / 2, y + 0.02, z0 + 0.01), V(x1 - 0.02, y + 0.005, z0 + 0.02), V(x1 + 0.005, y - 0.05, z0 + 0.025)], 0.022, 6);
}

function chair(ms: Mesher, rnd: Rand, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  const sh = 0.45, w = 0.42, d = 0.4;
  board(ms, 'board_warm', rnd, 0, sh - 0.015, 0, w, 0.03, d, 0, { grain: 'x' });
  for (const [lx, lz, h] of [[-w / 2 + 0.03, -d / 2 + 0.03, 0.95], [w / 2 - 0.03, -d / 2 + 0.03, 0.95], [-w / 2 + 0.03, d / 2 - 0.03, sh], [w / 2 - 0.03, d / 2 - 0.03, sh]] as [number, number, number][]) {
    tube(ms, 'board_warm', [V(lx, 0, lz), V(lx, h, lz + (h > 0.6 ? -0.04 : 0))], 0.018, 6);
  }
  // stretchers and back slats (ladder back)
  for (const zz of [-d / 2 + 0.03, d / 2 - 0.03]) tube(ms, 'board_warm', [V(-w / 2 + 0.03, 0.18, zz), V(w / 2 - 0.03, 0.18, zz)], 0.011, 5);
  for (const xx of [-w / 2 + 0.03, w / 2 - 0.03]) tube(ms, 'board_warm', [V(xx, 0.14, -d / 2 + 0.03), V(xx, 0.14, d / 2 - 0.03)], 0.011, 5);
  for (const yy of [0.62, 0.76, 0.9]) board(ms, 'board_warm', rnd, 0, yy, -d / 2 + 0.03 - (yy - sh) * 0.08, w - 0.06, 0.06, 0.015, 0, { grain: 'x' });
  ms.pop();
}

function herbBundle(ms: Mesher, rnd: Rand, x: number, y: number, z: number, kind: number): void {
  const len = 0.12 + rnd.range(0, 0.08);
  tube(ms, 'rope', [V(x, y, z), V(x, y - 0.12, z)], 0.003, 4);
  ms.pushT(x, y - 0.12, z, rnd.range(0, 6.28), rnd.range(-0.1, 0.1));
  // stems tied at the top, flaring down: a cone of stalks
  const mat = kind === 2 ? 'wool_grey' : 'herbs';
  ensureHerbMat();
  lathe(ms, kind === 1 ? 'herbs_dark' : mat, [[0.012, 0], [0.04, -len * 0.4], [0.06, -len * 0.85], [0.045, -len], [0, -len - 0.01]], 7);
  lathe(ms, 'rope', [[0.014, 0.012], [0.014, -0.012]], 7);
  ms.pop();
}

let herbsDone = false;
function ensureHerbMat(): void {
  if (herbsDone) return;
  herbsDone = true;
  const mk = (base: number[], name: string) => {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d')!;
    const r = new Rand(name.length * 77);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const k = 0.65 + r.next() * 0.5 + (x % 3 === 0 ? -0.2 : 0);
      g.fillStyle = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
      g.fillRect(x, y, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    defineMat(name, new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
  };
  mk([96, 104, 58], 'herbs');
  mk([120, 74, 40], 'herbs_dark');
}

function sock(ms: Mesher, rnd: Rand, x: number, y: number, z: number, k: number): void {
  ms.pushT(x, y, z, Math.PI / 2 + rnd.range(-0.2, 0.2));
  tube(ms, 'wool_grey', [V(0, 0, 0), V(0, -0.2, 0.0), V(0.02, -0.28, 0.04), V(0.02, -0.29, 0.12)], 0.035, 7);
  // red heel/toe band
  tube(ms, 'blanket', [V(0, -0.005, 0), V(0, -0.04, 0)], 0.037, 7);
  boxAt(ms, 'board_warm', 0, 0.01, 0, 0.012, 0.04, 0.02);
  void k;
  ms.pop();
}

function mitten(ms: Mesher, rnd: Rand, x: number, y: number, z: number): void {
  ms.pushT(x, y - 0.12, z, Math.PI / 2 + rnd.range(-0.2, 0.2));
  cushion(ms, 'blanket', 0, 0, 0, 0.1, 0.2, 0.035, 0.012, 2);
  ms.pop();
  boxAt(ms, 'board_warm', x, y + 0.0, z, 0.02, 0.04, 0.012);
}

function jacket(ms: Mesher, x: number, y: number, z: number): void {
  // a hanging wool mackinaw: lofted body from the collar (hook) down, sleeves hanging at the sides
  ms.pushT(x, y, z, Math.PI);
  const sec = (yy: number, w: number, d: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      pts.push(V(Math.cos(a) * w, yy, Math.sin(a) * d * (Math.sin(a) > 0 ? 1 : 0.55)));
    }
    return pts;
  };
  const rings = [sec(0.02, 0.05, 0.03), sec(-0.06, 0.2, 0.07), sec(-0.25, 0.23, 0.09), sec(-0.55, 0.22, 0.1), sec(-0.78, 0.23, 0.1), sec(-0.8, 0.22, 0.09)];
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < 10; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % 10], cc = rings[i + 1][(k + 1) % 10], d = rings[i + 1][k];
    const u0 = k / 10 * 1.4, u1 = (k + 1) / 10 * 1.4;
    ms.quad('blanket', a, b, cc, d, [u0, a.y], [u1, b.y], [u1, cc.y], [u0, d.y]);
  }
  for (const s of [-1, 1]) tube(ms, 'blanket', [V(s * 0.2, -0.08, 0.02), V(s * 0.25, -0.35, 0.05), V(s * 0.22, -0.62, 0.07)], 0.055, 7);
  // collar + buttons
  tube(ms, 'blanket', [V(-0.08, -0.02, 0.04), V(0, 0.0, 0.07), V(0.08, -0.02, 0.04)], 0.025, 6);
  for (let i = 0; i < 4; i++) boxAt(ms, 'board_dark', 0.0, -0.15 - i * 0.15, 0.1, 0.02, 0.02, 0.01);
  ms.pop();
}

function rug(ms: Mesher, rx: number, rz: number): void {
  // braided oval: concentric rings; u = around (m), v = across the braid (m)
  const rings = 12, seg = 40;
  for (let i = 0; i < rings; i++) {
    const t0 = i / rings, t1 = (i + 1) / rings;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const P = (t: number, a: number) => V(Math.cos(a) * rx * t, 0.002 * Math.sin(t * 40), Math.sin(a) * rz * t);
      const arc = (t: number, a: number) => a * (rx + rz) / 2 * t * 2;
      const up = V(0, 1, 0);
      ms.quad('rug', P(t0, a0), P(t1, a0), P(t1, a1), P(t0, a1), [arc(t0, a0), t0 * 0.5], [arc(t1, a0), t1 * 0.5], [arc(t1, a1), t1 * 0.5], [arc(t0, a1), t0 * 0.5], up);
    }
  }
}

function snowshoe(ms: Mesher, x: number, y: number, z: number, tilt: number): void {
  // bentwood frame (beavertail) with a few rawhide cross laces
  ms.pushT(x, y, z, 0, 0, tilt);
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const yy = Math.sin(a) * 0.45;
    const w = 0.15 * Math.cos(a) * (yy < 0 ? 1 - Math.pow(-yy / 0.45, 3) * 0.85 : 1);
    pts.push(V(w, yy + (yy < 0 ? -0.1 * Math.pow(-yy / 0.45, 2) : 0), 0));
  }
  tube(ms, 'board_warm', pts, 0.011, 5, { smooth: false });
  tube(ms, 'board_warm', [V(-0.13, 0.12, 0), V(0.13, 0.12, 0)], 0.008, 4);
  tube(ms, 'board_warm', [V(-0.14, -0.12, 0), V(0.14, -0.12, 0)], 0.008, 4);
  for (let k = -3; k <= 3; k++) tube(ms, 'leather', [V(k * 0.035, 0.12, 0), V(k * 0.035 * 1.1, -0.12, 0)], 0.003, 3);
  for (let k = -4; k <= 4; k++) tube(ms, 'leather', [V(-0.14, k * 0.028, 0), V(0.14, k * 0.028 + 0.01, 0)], 0.003, 3);
  ms.pop();
}

// ---------------------------------------------------------------------------------------------- woodyard
async function woodyard(c: DressCtx): Promise<void> {
  const { group, anchors, cols } = c;
  const sp = SPOTS.cabin, rot = sp.rot ?? 0, gy = heightAt(sp.x, sp.z);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  // world -> cabin local
  const toLocal = (wx: number, wz: number) => {
    const dx = wx - sp.x, dz = wz - sp.z;
    return [cs * dx - sn * dz, sn * dx + cs * dz] as [number, number];
  };
  const toWorld = (lx: number, lz: number) => [sp.x + cs * lx + sn * lz, sp.z - sn * lx + cs * lz] as [number, number];
  const hAt = (lx: number, lz: number) => { const [wx, wz] = toWorld(lx, lz); return heightAt(wx, wz) - gy; };
  const [wyx, wyz] = toLocal(SPOTS.woodyard.x, SPOTS.woodyard.z);
  // the woodyard frame: +Z faces the cabin (cabin -X)
  const yard = new THREE.Group();
  yard.name = 'woodyard';
  yard.position.set(wyx, hAt(wyx, wyz), wyz);
  yard.rotation.y = -Math.PI / 2;
  group.add(yard);
  const ms = new Mesher();
  const rnd = new Rand(4242);
  const ycols = new Cols();
  const yh = (x: number, z: number) => {
    // ground height in yard-local coordinates (relative to the yard origin)
    const lx = wyx - z, lz = wyz + x; // yard (x,z) -> cabin local (rotation -90 deg: x' = -z? see below)
    return hAt(lx, lz) - yard.position.y;
  };
  // yard-local -> cabin-local: rotation.y = -pi/2: local +X -> cabin (cos, -sin) = (0, 1)?? compute via matrix
  const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const ylocal = (x: number, z: number) => { const v = V(x, 0, z).applyMatrix4(m); return [wyx + v.x, wyz + v.z] as [number, number]; };
  const gh = (x: number, z: number) => { const [lx, lz] = ylocal(x, z); return hAt(lx, lz) - yard.position.y; };
  void yh;

  // ---- lean-to woodshed: open toward +Z, roof sloping down to the back (-Z), rusty corrugated iron
  const sw = 3.6, sd = 1.7, hf = 2.25, hb = 1.65;
  const sz0 = -2.4, sz1 = sz0 + sd;
  const postPts: [number, number, number][] = [[-sw / 2, sz1, hf], [sw / 2, sz1, hf], [-sw / 2, sz0, hb], [sw / 2, sz0, hb], [0, sz1, hf], [0, sz0, hb]];
  for (const [x, z, h] of postPts) {
    const g0 = gh(x, z);
    logAB(ms, V(x, g0 - 0.1, z), V(x, g0 + h, z), 0.07, { seed: 2000 + x * 3 + z, seg: 8, capA: -1, capB: 0, taper: 0.1 });
    ycols.box(x, g0 + h / 2, z, 0.08, h / 2, 0.08);
  }
  // plates front and back, rafters
  const g0 = gh(0, (sz0 + sz1) / 2);
  logAB(ms, V(-sw / 2 - 0.2, g0 + hf, sz1), V(sw / 2 + 0.2, g0 + hf, sz1), 0.075, { seed: 2010, seg: 8, capA: 0, capB: 0 });
  logAB(ms, V(-sw / 2 - 0.2, g0 + hb, sz0), V(sw / 2 + 0.2, g0 + hb, sz0), 0.075, { seed: 2011, seg: 8, capA: 0, capB: 0 });
  for (const x of [-sw / 2, -0.6, 0.6, sw / 2]) logAB(ms, V(x, g0 + hf + 0.1, sz1 + 0.35), V(x, g0 + hb + 0.1, sz0 - 0.3), 0.05, { seed: 2020 + x, seg: 7, capA: 0, capB: 0 });
  {
    // corrugated sheets: rippled surface along x
    const ya = g0 + hf + 0.17, yb = g0 + hb + 0.17, za = sz1 + 0.45, zb = sz0 - 0.4;
    const n = 64;
    for (let i = 0; i < n; i++) {
      const xa = -sw / 2 - 0.3 + (sw + 0.6) * (i / n), xb = -sw / 2 - 0.3 + (sw + 0.6) * ((i + 1) / n);
      const wa = 0.018 * Math.sin(i * Math.PI / 2), wb = 0.018 * Math.sin((i + 1) * Math.PI / 2);
      const slope = (ya - yb) / (za - zb);
      const A = V(xa, ya + wa, za), B = V(xb, ya + wb, za), C = V(xb, yb + wb, zb), Dd = V(xa, yb + wa, zb);
      const L = Math.hypot(za - zb, ya - yb);
      ms.quad('corrugated', A, B, C, Dd, [0, xa], [0, xb], [L, xb], [L, xa]);
      ms.quad('corrugated', B, A, Dd, C, [0, xb], [0, xa], [L, xa], [L, xb]);
      void slope;
    }
    ycols.box(0, (ya + yb) / 2, (za + zb) / 2, sw / 2 + 0.3, 0.05, (za - zb) / 2, 0);
  }
  // back wall: rough slab boards nailed horizontally
  for (let i = 0; i < 5; i++) {
    const yy = gh(0, sz0) + 0.15 + i * 0.3;
    board(ms, 'board_grey', rnd, 0, yy, sz0 - 0.08, sw + 0.1, 0.24, 0.03, 0, { grain: 'x' });
  }
  ycols.box(0, gh(0, sz0) + 0.8, sz0 - 0.08, sw / 2, 0.8, 0.05);
  // floor poles to keep the wood off the ground
  for (const z of [sz0 + 0.25, sz0 + 0.75, sz0 + 1.25]) logAB(ms, V(-sw / 2 + 0.1, gh(0, z) + 0.05, z), V(sw / 2 - 0.1, gh(0, z) + 0.05, z), 0.05, { seed: 2030 + z * 10, seg: 7, capA: 0, capB: 0 });
  // the stack: splits, ends facing out, 2 rows, partly full (left section full, right half-built)
  const fr = new Rand(777);
  for (let row = 0; row < 2; row++) {
    const zc = sz0 + 0.42 + row * 0.5;
    for (let layer = 0; layer < 11; layer++) {
      let x = -sw / 2 + 0.12 + (layer % 2) * 0.05;
      const xEnd = layer < 5 ? sw / 2 - 0.15 : layer < 8 ? 0.6 : -0.4;
      while (x < xEnd) {
        const rr = fr.range(0.06, 0.085);
        ms.pushT(x + rr, gh(x, zc) + 0.15 + layer * 0.13 + fr.range(-0.01, 0.01), zc - 0.21, 0, 0, 0);
        ms.push(tf(0, 0, 0, -Math.PI / 2, 0, fr.range(0, 6.28)));
        writeSplit(ms, fr, 0.42 + fr.range(-0.03, 0.02), rr * 1.6, fr.int(0, 99999));
        ms.pop(); ms.pop();
        x += rr * 2 + 0.008;
      }
    }
  }
  ycols.box(0, gh(0, sz0 + 0.7) + 0.8, sz0 + 0.7, sw / 2, 0.8, 0.55);
  anchors.woodshed_stack = anchor(yard, 'woodshed_stack', 0, gh(0, sz0 + 0.7) + 0.15, sz0 + 0.7, 0);
  anchors.woodshed_stack.userData = { w: sw - 0.3, d: 1.0, h: 1.45 };
  {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(sw, 1.5, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, gh(0, sz0 + 0.7) + 0.9, sz0 + 0.7);
    yard.add(hit);
    registerInteractable(hit, { kind: 'container', label: () => 'Stack firewood', use: (ctx) => ctx.game?.placeAction?.('woodshed', ctx) });
  }

  // ---- chopping block with an axe in it, rounds waiting, chips on the ground
  const bx = 0.9, bz = 1.3;
  {
    const g = gh(bx, bz);
    ms.pushT(bx, g - 0.02, bz);
    writeRound(ms, new Rand(91), 0.52, 0.31, 91, 'endgrain', 2);
    ms.pop();
    ycols.box(bx, g + 0.25, bz, 0.3, 0.27, 0.3);
    anchors.chopping_block = anchor(yard, 'chopping_block', bx, g + 0.5, bz, 0);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.52, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(bx, g + 0.25, bz);
    yard.add(hit);
    registerInteractable(hit, { kind: 'block', label: () => 'Chopping block', use: (ctx) => ctx.game?.placeAction?.('block', ctx) });
    // the axe bitten into the top
    prop(yard, 'wooden_axe_02', bx, g + 0.5, bz, 0.6).then((o) => {
      if (!o) return;
      const sz = PROP_META.wooden_axe_02?.size ?? [0.2, 0.9, 0.05];
      o.rotation.set(0, 0.6, -1.15);
      o.position.set(bx + 0.18, g + 0.48 + sz[1] * 0.18, bz + 0.02);
    });
    // woodchips decal + chips and split pieces around
    const chip = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), placeMat('woodchips'));
    chip.rotation.x = -Math.PI / 2;
    chip.position.set(bx - 0.2, gh(bx, bz) + 0.015, bz + 0.1);
    chip.receiveShadow = true;
    yard.add(chip);
    const sr = new Rand(19);
    for (let i = 0; i < 6; i++) {
      const a = sr.range(0, 6.28), d = sr.range(0.45, 1.0);
      const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      ms.pushT(x, gh(x, z) + 0.05, z, sr.range(0, 6.28), 0, sr.range(-0.2, 0.2) + Math.PI / 2 * (i % 2));
      writeSplit(ms, sr, 0.38 + sr.range(-0.04, 0.04), 0.11, sr.int(0, 9999));
      ms.pop();
    }
    // rounds waiting to be split
    for (const [x, z, h, r] of [[2.0, 0.6, 0.42, 0.22], [2.35, 1.2, 0.4, 0.18], [1.9, 1.9, 0.44, 0.24], [2.6, 0.2, 0.38, 0.2]] as [number, number, number, number][]) {
      ms.pushT(x, gh(x, z) - 0.01, z, sr.range(0, 6.28));
      writeRound(ms, sr, h, r, sr.int(0, 9999), 'endgrain', 1);
      ms.pop();
      ycols.box(x, gh(x, z) + h / 2, z, r, h / 2, r);
    }
    // one round lying on its side
    ms.pushT(2.7, gh(2.7, 1.8) + 0.2, 1.8, 0.4, 0, Math.PI / 2);
    writeRound(ms, sr, 0.4, 0.2, 333, 'endgrain', 1);
    ms.pop();
  }
  // ---- sawbuck with a log on it
  {
    const x0 = -1.7, z0 = 1.5;
    const g = gh(x0, z0);
    for (const dz of [-0.35, 0.35]) {
      for (const s of [-1, 1]) {
        logAB(ms, V(x0 + s * 0.38, g - 0.05, z0 + dz), V(x0 - s * 0.22, g + 1.0, z0 + dz), 0.04, { seed: 2100 + s * 3 + dz * 10, seg: 7, capA: 0, capB: 0 });
      }
    }
    logAB(ms, V(x0, g + 0.38, z0 - 0.42), V(x0, g + 0.38, z0 + 0.42), 0.035, { seed: 2110, seg: 6, capA: 0, capB: 0 });
    logAB(ms, V(x0 - 0.15, g + 0.55, z0 - 0.38), V(x0 + 0.12, g + 0.3, z0 + 0.38), 0.03, { seed: 2111, seg: 6, capA: 0, capB: 0 });
    // the log resting in the crotches
    ms.pushT(x0 + 0.05, g + 0.77, z0 - 1.0, -Math.PI / 2 - 0.04);
    log(ms, 2.1, 0.12, { seed: 2120, seg: 10, capA: 1, capB: 1, matFor: () => 'bark' });
    ms.pop();
    ycols.box(x0, g + 0.45, z0, 0.45, 0.45, 0.5);
    anchors.sawbuck = anchor(yard, 'sawbuck', x0, g + 0.77, z0, 0);
  }
  yard.add(ms.build({ name: 'woodyard_static' }));
  // yard colliders -> cabin-local -> world (handled by the cabin's Cols)
  for (const k of ycols.list) {
    if (k.kind !== 'box') continue;
    const [x, y, z] = k.pos;
    const [lx, lz] = ylocal(x, z);
    cols.box(lx, y + yard.position.y, lz, k.half[0], k.half[1], k.half[2], k.rotY - Math.PI / 2);
  }

  // ---- fire pit with log seats, out in front of the porch
  {
    const fx = 6.2, fz = 7.4;
    const pit = new THREE.Group();
    pit.position.set(fx, hAt(fx, fz), fz);
    group.add(pit);
    const pms = new Mesher();
    const pr = new Rand(606);
    // ring of fieldstones
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2 + pr.range(-0.08, 0.08);
      rock(pms, pr, Math.cos(a) * 0.62, -0.02, Math.sin(a) * 0.62, pr.range(0.22, 0.3), pr.range(0.15, 0.22), pr.range(0.2, 0.26));
    }
    // ash bed and charred logs
    pms.pushT(0, 0.005, 0);
    lathe(pms, 'soot', [[0.55, 0.0], [0.4, 0.03], [0, 0.04]].reverse().map(([a, b]) => [a, b] as [number, number]), 14);
    pms.pop();
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      pms.pushT(Math.cos(a) * 0.12, 0.08, Math.sin(a) * 0.12, -a, 0, 0.35);
      log(pms, 0.45, 0.05, { seed: 610 + k, seg: 7, capA: 0, capB: 0, matFor: () => 'soot', capMat: 'soot' });
      pms.pop();
    }
    // log seats: three half-logs on short rounds
    for (const [a, len] of [[0.6, 1.5], [2.3, 1.3], [4.0, 1.4]] as [number, number][]) {
      const d = 1.65;
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      const sg = new THREE.Group();
      sg.position.set(sx, 0, sz);
      sg.rotation.y = -a + Math.PI / 2;
      pit.add(sg);
      const sms = new Mesher();
      const sr = new Rand(700 + a * 10);
      for (const ox of [-len / 2 + 0.2, len / 2 - 0.2]) {
        sms.pushT(ox, -0.02, 0);
        writeRound(sms, sr, 0.24, 0.15, sr.int(0, 9999), 'endgrain', 1);
        sms.pop();
      }
      sms.pushT(-len / 2, 0, 0);
      halfLog(sms, sr, len, 0.17, 0.44, sr.int(0, 9999), 'board_grey');
      sms.pop();
      sg.add(sms.build());
      const lp = V(fx + sx, 0, fz + sz);
      cols.box(lp.x, hAt(lp.x, lp.z) + 0.22, lp.z, len / 2, 0.22, 0.18, -a + Math.PI / 2);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 0.42, 0);
      sg.add(hit);
      registerInteractable(hit, { kind: 'seat', label: () => 'Sit by the fire', use: (ctx) => ctx.game?.placeAction?.('sit_firepit', ctx) });
    }
    pit.add(pms.build({ name: 'firepit' }));
    anchors.firepit = anchor(group, 'firepit', fx, hAt(fx, fz) + 0.05, fz, 0);
    // a campfire (off by default; the game lights it)
    const fire = flameCards(0.5, 0.7, 7);
    fire.position.set(0, 0.06, 0);
    pit.add(fire);
    const fl = new THREE.PointLight(0xff8840, 0, 12, 1.6);
    fl.position.set(0, 0.5, 0);
    pit.add(fl);
    c.lights.push(fl);
    let level = 0, t = 0;
    anchors.firepit.userData.setFire = (l: number) => { level = l; };
    c.updaters.push((dt) => {
      t += dt;
      fire.userData.tick(dt, level);
      fl.intensity = level * 9 * flicker(t, 5.3);
    });
  }
  // ---- jeep park at the end of the cabin road
  {
    const [jx, jz] = toLocal(-11.5, -6.5);
    anchors.jeep_park = anchor(group, 'jeep_park', jx, hAt(jx, jz), jz, -rot - 1.1);
  }
}
