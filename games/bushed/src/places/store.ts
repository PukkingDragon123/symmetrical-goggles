// Pruneau's General Store / Magasin général at SPOTS.store: a false-front frame building with faded red lap
// siding, a covered porch with a bench, an old gas pump, dusty display windows, warm hanging lamps and a bell
// over the door. Inside: wall shelves and a central gondola stocked with pickable products, a glass display case
// (knives, files, flashlights), a pegboard with axes, saws and rope, the counter with the cash register, the
// mushroom scale and the jerky jar, a barrel stove with the coffee pot, invented bilingual posters and the
// contracts noticeboard (pins). Beside it, the log deck where timber is dropped for sale.
//
// Local frame: the shop front faces +Z (SPOTS.store.rot turns it toward the highway), origin at the centre of the
// building footprint on the ground.
import * as THREE from 'three';
import { SPOTS, heightAt } from '../world/layout';
import {
  Place, Mesher, Rand, Cols, V, tf, box, boxAt, board, logAB, log, lathe, tube, rectsMinus, anchor, interiorBoxes,
  flicker, shadowy, defineMat, placeTex, hasMat, lightCuller,
} from './kit';
import { windowUnit, doorFrame, glassMat, glassMaterial } from './fixtures';
import { buildStove, STOVE } from './stove';
import { hingedDoor, registerInteractable } from '../game/interact';
import { ITEMS } from '../game/items';
import { buildProduct, productSize, writeSplit } from './products';
import { SIGNS, ensurePrintMats } from './signs';
import { prop, cushion, flagstones } from './dressing';
import { rock } from './cabin';

// ---------------------------------------------------------------------------------------------- plan
export const STORE = {
  W: 8.0,         // outside width (x)
  D: 11.0,        // outside depth (z)
  T: 0.16,        // wall thickness
  FLOOR: 0.42,    // floor above grade
  H: 3.1,         // floor to ceiling
  FRONT_H: 6.1,   // false front height above grade
  PORCH: 2.5,
};
const { W, D, T, FLOOR, H, FRONT_H, PORCH } = STORE;
const CEIL = FLOOR + H;
const WALL_TOP = CEIL + 0.25;
const RIDGE = WALL_TOP + 1.9;
const IX = W / 2 - T, IZ = D / 2 - T; // interior half extents

interface Hole { wall: 'front' | 'back' | 'left' | 'right'; c: number; w: number; y0: number; y1: number; kind: 'door' | 'window' | 'display' | 'pass' }
const HOLES: Hole[] = [
  { wall: 'front', c: 0, w: 1.0, y0: FLOOR, y1: FLOOR + 2.15, kind: 'door' },
  { wall: 'front', c: -2.45, w: 1.9, y0: FLOOR + 0.75, y1: FLOOR + 2.35, kind: 'display' },
  { wall: 'front', c: 2.45, w: 1.9, y0: FLOOR + 0.75, y1: FLOOR + 2.35, kind: 'display' },
  { wall: 'left', c: 2.15, w: 0.9, y0: FLOOR + 1.1, y1: FLOOR + 2.15, kind: 'window' },
  { wall: 'left', c: -4.5, w: 0.9, y0: FLOOR + 1.1, y1: FLOOR + 2.15, kind: 'window' },
  { wall: 'right', c: -1.6, w: 0.9, y0: FLOOR + 1.3, y1: FLOOR + 2.15, kind: 'window' },
  { wall: 'right', c: 3.0, w: 0.9, y0: FLOOR + 1.3, y1: FLOOR + 2.15, kind: 'window' },
  { wall: 'back', c: -2.2, w: 0.95, y0: FLOOR, y1: FLOOR + 2.1, kind: 'pass' },
];

/** wall frame: X along the wall (left->right seen from outside), +Z out of the wall, origin at wall centre at grade */
function wallFrame(wall: Hole['wall']): THREE.Matrix4 {
  switch (wall) {
    case 'front': return tf(0, 0, D / 2 - T / 2, 0);
    case 'back': return tf(0, 0, -D / 2 + T / 2, Math.PI);
    case 'left': return tf(-W / 2 + T / 2, 0, 0, -Math.PI / 2);
    default: return tf(W / 2 - T / 2, 0, 0, Math.PI / 2);
  }
}
const wallLen = (wall: Hole['wall']) => (wall === 'front' || wall === 'back' ? W : D);

// ---------------------------------------------------------------------------------------------- shell
function shell(ms: Mesher, cols: Cols, glass: string): void {
  const rnd = new Rand(808);
  for (const wall of ['front', 'back', 'left', 'right'] as const) {
    const len = wallLen(wall);
    const holes = HOLES.filter((h) => h.wall === wall).map((h) => [h.c - h.w / 2, h.c + h.w / 2, h.y0, h.y1] as [number, number, number, number]);
    const top = wall === 'front' ? FRONT_H : WALL_TOP;
    ms.push(wallFrame(wall));
    // ---- exterior lap siding (clapboards with real butt shadows), cut around the openings
    const exp = 0.14, z0 = T / 2;
    const yStart = 0.32;
    for (let y = yStart; y < top - 0.02; y += exp) {
      const ya = y, yb = Math.min(top, y + exp);
      // horizontal segments not blocked by holes at this board's mid-height
      const segs = rectsMinus(-len / 2, len / 2, ya, yb, holes.map((h) => [h[0] - 0.1, h[1] + 0.1, h[2] - 0.1, h[3] + 0.12]));
      for (const [xa, xb, sa, sb] of segs) {
        const butt = 0.022, thin = 0.004;
        const A = V(xa, sa, z0 + butt), B = V(xb, sa, z0 + butt), C = V(xb, sb, z0 + thin), Dd = V(xa, sb, z0 + thin);
        const uo = rnd.range(0, 1.5);
        ms.quad('siding_red', A, B, C, Dd, [xa + uo, sa], [xb + uo, sa], [xb + uo, sb], [xa + uo, sb]);
        // butt face
        ms.quad('siding_red', V(xa, sa, z0), V(xb, sa, z0), B, A, [xa, sa], [xb, sa], [xb, sa + 0.02], [xa, sa + 0.02]);
      }
    }
    // corner boards and the frieze under the eaves
    for (const x of [-len / 2 + 0.06, len / 2 - 0.06]) board(ms, 'trim_cream', rnd, x, (top + 0.3) / 2, z0 + 0.03, 0.13, top - 0.3, 0.03, 0, { grain: 'y' });
    board(ms, 'trim_cream', rnd, 0, Math.min(top, WALL_TOP) - 0.12, z0 + 0.03, len, 0.22, 0.03, 0, { grain: 'x' });
    // stone/concrete skirt
    ms.pushT(0, 0.17, z0 - 0.02);
    box(ms, 'stone', len + 0.06, 0.4, 0.12, { uv: [rnd.range(0, 2), 0] });
    ms.pop();
    // ---- interior: green-painted wainscot up to 1.05 m, warm boards above (vertical boards)
    const zi = -T / 2;
    const ilen = len - 2 * T;
    const ih: [number, number, number, number][] = holes.map((h) => [h[0], h[1], h[2], h[3]]);
    for (const [xa, xb, ya, yb] of rectsMinus(-ilen / 2, ilen / 2, FLOOR, CEIL, ih)) {
      const split = FLOOR + 1.05;
      const parts: [number, number, string][] = [];
      if (ya < split) parts.push([ya, Math.min(yb, split), 'boards_green']);
      if (yb > split) parts.push([Math.max(ya, split), yb, 'trim_cream']);
      for (const [pa, pb, m] of parts) {
        // vertical boards: u along y (grain), v along x
        ms.quad(m, V(xb, pa, zi), V(xa, pa, zi), V(xa, pb, zi), V(xb, pb, zi), [pa, xb], [pa, xa], [pb, xa], [pb, xb]);
      }
    }
    // chair rail at the top of the wainscot, baseboard
    board(ms, 'board_dark', rnd, 0, FLOOR + 1.06, zi - 0.012, ilen, 0.05, 0.024, 0, { grain: 'x' });
    board(ms, 'board_dark', rnd, 0, FLOOR + 0.07, zi - 0.012, ilen, 0.14, 0.024, 0, { grain: 'x' });
    // ---- openings
    for (const h of HOLES.filter((q) => q.wall === wall)) {
      ms.pushT(h.c, (h.y0 + h.y1) / 2, 0);
      if (h.kind === 'door') doorFrame(ms, { w: h.w, h: h.y1 - h.y0, depth: T + 0.02, seed: 21, buck: 'trim_cream', casingOut: 'trim_cream', casingIn: 'board_dark', casingW: 0.13 });
      else if (h.kind === 'pass') doorFrame(ms, { w: h.w, h: h.y1 - h.y0, depth: T + 0.02, seed: 23, buck: 'board_dark', casingOut: 'trim_cream', casingIn: 'board_dark', threshold: 'board_dark' });
      else windowUnit(ms, {
        w: h.w, h: h.y1 - h.y0, depth: T + 0.02, glass, seed: Math.round(h.c * 10) + 50, cols: h.kind === 'display' ? 3 : 2, rows: h.kind === 'display' ? 3 : 3,
        buck: 'trim_cream', casingOut: 'trim_cream', casingIn: 'board_dark', sash: 'trim_cream', sill: 'trim_cream', casingW: 0.13,
      });
      ms.pop();
    }
    ms.pop();
  }
  // ---- false front: the parapet cap, cornice with brackets, the sign board
  {
    const z = D / 2 + 0.01;
    board(ms, 'trim_cream', rnd, 0, FRONT_H + 0.06, z + 0.05, W + 0.4, 0.12, 0.22, 0, { grain: 'x' });
    board(ms, 'trim_cream', rnd, 0, FRONT_H - 0.12, z + 0.04, W + 0.3, 0.2, 0.08, 0, { grain: 'x' });
    for (let i = 0; i < 9; i++) {
      const x = -W / 2 + 0.1 + i * (W - 0.2) / 8;
      boxAt(ms, 'trim_cream', x, FRONT_H - 0.3, z + 0.08, 0.07, 0.18, 0.12);
    }
    // the sign board itself (painted), framed
    const sw = 5.6, sh = 1.15, sy = 4.75;
    ms.pushT(0, sy, z + 0.045);
    const [u0, v0, u1, v1] = SIGNS.uv('store_sign');
    ms.quad('signs', V(-sw / 2, -sh / 2, 0), V(sw / 2, -sh / 2, 0), V(sw / 2, sh / 2, 0), V(-sw / 2, sh / 2, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    ms.pop();
    board(ms, 'trim_cream', rnd, 0, sy + sh / 2 + 0.04, z + 0.05, sw + 0.16, 0.08, 0.05, 0, { grain: 'x' });
    board(ms, 'trim_cream', rnd, 0, sy - sh / 2 - 0.04, z + 0.05, sw + 0.16, 0.08, 0.05, 0, { grain: 'x' });
    // back of the false front (seen from the sides/back above the roof): plain boards
    ms.quad('board_grey', V(W / 2, WALL_TOP, D / 2 - T), V(-W / 2, WALL_TOP, D / 2 - T), V(-W / 2, FRONT_H, D / 2 - T), V(W / 2, FRONT_H, D / 2 - T), [0, WALL_TOP], [W, WALL_TOP], [W, FRONT_H], [0, FRONT_H]);
    // a pair of gooseneck lamps over the sign
    for (const x of [-1.8, 1.8]) {
      tube(ms, 'iron', [V(x, sy + 0.9, z + 0.02), V(x, sy + 1.0, z + 0.25), V(x, sy + 0.92, z + 0.45)], 0.012, 6);
      ms.pushT(x, sy + 0.86, z + 0.47);
      lathe(ms, 'enamel', [[0.03, 0.06], [0.06, 0.03], [0.11, -0.03], [0.1, -0.035], [0.055, 0.025], [0.025, 0.05]], 12);
      ms.pop();
    }
  }
  // ---- roof (gable along z behind the false front), corrugated iron, overhanging the sides and back
  {
    const K = (RIDGE - WALL_TOP) / (W / 2);
    const xe = W / 2 + 0.45, z0 = -D / 2 - 0.4, z1 = D / 2 - T;
    const yAt = (x: number) => WALL_TOP + K * (W / 2 - Math.abs(x));
    const n = 70;
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const za = z0 + (z1 - z0) * (i / n), zb = z0 + (z1 - z0) * ((i + 1) / n);
        const wa = 0.018 * Math.sin(i * Math.PI / 2), wb = 0.018 * Math.sin((i + 1) * Math.PI / 2);
        const A = V(0, RIDGE + 0.03 + wa, za), B = V(0, RIDGE + 0.03 + wb, zb), C = V(s * xe, yAt(xe) + 0.03 + wb, zb), Dd = V(s * xe, yAt(xe) + 0.03 + wa, za);
        const L = Math.hypot(xe, RIDGE - yAt(xe));
        if (s > 0) ms.quad('corrugated', A, B, C, Dd, [0, za], [0, zb], [L, zb], [L, za]);
        else ms.quad('corrugated', A, Dd, C, B, [0, za], [L, za], [L, zb], [0, zb]);
      }
      // soffit (underside of the overhang) and fascia
      const a = V(s * W / 2, WALL_TOP, z0), b = V(s * xe, yAt(xe), z0), c = V(s * xe, yAt(xe), z1), d = V(s * W / 2, WALL_TOP, z1);
      if (s > 0) ms.quad('board_grey', a, b, c, d, [0, 0], [0.5, 0], [0.5, z1 - z0], [0, z1 - z0]);
      else ms.quad('board_grey', a, d, c, b, [0, 0], [z1 - z0, 0], [z1 - z0, 0.5], [0, 0.5]);
      ms.pushT(s * (xe + 0.01), yAt(xe) - 0.04, (z0 + z1) / 2);
      box(ms, 'trim_cream', 0.025, 0.14, z1 - z0, { grain: 'z' });
      ms.pop();
    }
    // back gable: siding triangle + rake trim
    const zb = -D / 2 + T / 2;
    for (let y = WALL_TOP; y < RIDGE; y += 0.14) {
      const hw0 = (RIDGE - y) / K, hw1 = (RIDGE - Math.min(RIDGE, y + 0.14)) / K;
      const A = V(hw0, y, zb - T / 2 - 0.02), B = V(-hw0, y, zb - T / 2 - 0.02), C = V(-hw1, y + 0.14, zb - T / 2 - 0.005), Dd = V(hw1, y + 0.14, zb - T / 2 - 0.005);
      ms.quad('siding_red', A, B, C, Dd, [hw0, y], [-hw0, y], [-hw1, y + 0.14], [hw1, y + 0.14]);
    }
    for (const s of [-1, 1]) {
      const a0 = V(0, RIDGE + 0.05, z0 - 0.02), a1 = V(s * xe, yAt(xe) + 0.0, z0 - 0.02);
      ms.pushT((a0.x + a1.x) / 2, (a0.y + a1.y) / 2 - 0.05, z0 - 0.02, 0, 0, Math.atan2(a1.y - a0.y, a1.x - a0.x));
      box(ms, 'trim_cream', a0.distanceTo(a1), 0.16, 0.03, { grain: 'x' });
      ms.pop();
    }
    // roof colliders: a convex hull per slope
    for (const s of [-1, 1]) {
      const pts: number[] = [];
      for (const [x, y] of [[0, RIDGE + 0.05], [s * xe, yAt(xe) + 0.05]] as [number, number][]) for (const z of [z0, z1]) pts.push(x, y, z, x, y - 0.12, z);
      cols.hull(pts);
    }
  }
  // ---- floor and ceiling
  {
    const bw = 0.13;
    for (let x = -IX; x < IX - 0.01; x += bw) {
      const w = Math.min(bw, IX - x);
      ms.pushT(x + w / 2, FLOOR - 0.02 + rnd.range(-0.002, 0.002), 0, Math.PI / 2);
      box(ms, 'floor', 2 * IZ, 0.04, w - 0.004, { grain: 'x', uv: [rnd.range(0, 2), rnd.range(0, 2)], faces: { ny: null } });
      ms.pop();
    }
    ms.quad('board_dark', V(-IX, CEIL, -IZ), V(IX, CEIL, -IZ), V(IX, CEIL, IZ), V(-IX, CEIL, IZ), [0, 0], [2 * IX, 0], [2 * IX, 2 * IZ], [0, 2 * IZ]);
    // ceiling joists (exposed, every 1.2 m)
    for (let z = -IZ + 0.6; z < IZ; z += 1.2) boxAt(ms, 'board_dark', 0, CEIL - 0.06, z, 2 * IX, 0.12, 0.06, 0, { grain: 'x', uv: [rnd.range(0, 2), 0] });
    cols.box(0, FLOOR / 2, 0, W / 2, FLOOR / 2, D / 2);
  }
  // ---- wall colliders (door gaps left open)
  const door = HOLES[0], pass = HOLES[HOLES.length - 1];
  const hy = (WALL_TOP) / 2;
  cols.box((-W / 2 + (door.c - door.w / 2)) / 2, hy, D / 2 - T / 2, ((door.c - door.w / 2) + W / 2) / 2, hy, T / 2);
  cols.box((W / 2 + (door.c + door.w / 2)) / 2, hy, D / 2 - T / 2, (W / 2 - (door.c + door.w / 2)) / 2, hy, T / 2);
  cols.box(0, (door.y1 + WALL_TOP) / 2, D / 2 - T / 2, door.w / 2, (WALL_TOP - door.y1) / 2, T / 2);
  cols.box(-W / 2 + T / 2, hy, 0, T / 2, hy, D / 2);
  cols.box(W / 2 - T / 2, hy, 0, T / 2, hy, D / 2);
  // back wall around the pass door (local x of the back wall is mirrored)
  const pc = -pass.c;
  cols.box((pc + pass.w / 2 + W / 2) / 2, hy, -D / 2 + T / 2, (W / 2 - (pc + pass.w / 2)) / 2, hy, T / 2);
  cols.box((pc - pass.w / 2 - W / 2) / 2, hy, -D / 2 + T / 2, ((pc - pass.w / 2) + W / 2) / 2, hy, T / 2);
}

// ---------------------------------------------------------------------------------------------- porch
function porch(ms: Mesher, cols: Cols): void {
  const rnd = new Rand(919);
  const z0 = D / 2, z1 = D / 2 + PORCH, x0 = -W / 2 - 0.2, x1 = W / 2 + 0.2;
  const deck = FLOOR - 0.02;
  // deck boards along x (store porches run boards along the front)
  for (let z = z0 + 0.02; z < z1; z += 0.14) {
    ms.pushT(0, deck - 0.018 + rnd.range(-0.003, 0.003), z + 0.065, rnd.range(-0.003, 0.003));
    box(ms, 'planks_grey', x1 - x0, 0.036, 0.128, { grain: 'x', uv: [rnd.range(0, 2), rnd.range(0, 2)] });
    ms.pop();
  }
  // rim joist and skirt boards
  board(ms, 'board_grey', rnd, 0, deck - 0.15, z1 + 0.02, x1 - x0, 0.25, 0.04, 0, { grain: 'x' });
  for (const x of [x0, x1]) board(ms, 'board_grey', rnd, x, deck - 0.15, (z0 + z1) / 2, 0.04, 0.25, PORCH, 0, { grain: 'z' });
  // steps: three treads in front of the door
  for (let i = 0; i < 2; i++) {
    const y = deck - 0.14 * (i + 1), z = z1 + 0.15 + i * 0.28;
    board(ms, 'planks_grey', rnd, 0, y, z, 2.2, 0.04, 0.3, 0, { grain: 'x' });
    board(ms, 'board_grey', rnd, 0, y - 0.07, z + 0.14, 2.2, 0.12, 0.03, 0, { grain: 'x' });
    cols.box(0, y / 2, z, 1.1, y / 2 + 0.02, 0.15);
  }
  // posts (square, chamfered look via two boxes), beam, shed roof of corrugated iron
  const postZ = z1 - 0.12, beamY = FLOOR + 2.62;
  for (const x of [x0 + 0.12, -1.3, 1.3, x1 - 0.12]) {
    board(ms, 'trim_cream', rnd, x, (deck + beamY) / 2, postZ, 0.13, beamY - deck, 0.13, 0, { grain: 'y' });
    // brackets
    for (const s of [-1, 1]) {
      ms.pushT(x + s * 0.2, beamY - 0.16, postZ, 0, 0, s * 0.78);
      box(ms, 'trim_cream', 0.42, 0.06, 0.06, { grain: 'x' });
      ms.pop();
    }
    cols.box(x, (deck + beamY) / 2, postZ, 0.07, (beamY - deck) / 2, 0.07);
  }
  board(ms, 'trim_cream', rnd, 0, beamY + 0.1, postZ, x1 - x0 + 0.2, 0.2, 0.14, 0, { grain: 'x' });
  {
    const ya = FLOOR + 3.15, yb = beamY + 0.22, za = D / 2 + 0.02, zb = z1 + 0.35;
    const n = 70;
    for (let i = 0; i < n; i++) {
      const xa = x0 - 0.2 + (x1 - x0 + 0.4) * (i / n), xb = x0 - 0.2 + (x1 - x0 + 0.4) * ((i + 1) / n);
      const wa = 0.018 * Math.sin(i * Math.PI / 2), wb = 0.018 * Math.sin((i + 1) * Math.PI / 2);
      const L = Math.hypot(zb - za, ya - yb);
      ms.quad('corrugated', V(xa, ya + wa, za), V(xa, yb + wa, zb), V(xb, yb + wb, zb), V(xb, ya + wb, za), [0, xa], [L, xa], [L, xb], [0, xb]);
      ms.quad('corrugated', V(xb, ya + wb - 0.01, za), V(xb, yb + wb - 0.01, zb), V(xa, yb + wa - 0.01, zb), V(xa, ya + wa - 0.01, za), [0, xb], [L, xb], [L, xa], [0, xa]);
    }
    // rafters under the porch roof
    for (let x = x0; x <= x1 + 0.01; x += 1.0) boxAt(ms, 'board_grey', x, (ya + yb) / 2 - 0.08, (za + zb) / 2, 0.05, 0.12, Math.hypot(zb - za, ya - yb), 0, { grain: 'z' }, Math.atan2(ya - yb, zb - za));
    cols.box(0, (ya + yb) / 2 + 0.03, (za + zb) / 2, (x1 - x0) / 2 + 0.2, 0.06, (zb - za) / 2);
  }
  cols.box(0, deck / 2, (z0 + z1) / 2, (x1 - x0) / 2, deck / 2, PORCH / 2);
}

// ---------------------------------------------------------------------------------------------- shelving
interface ShelfRow { id: number; pos: THREE.Vector3; ry: number; len: number; depth: number }

/** a wooden wall shelf unit: uprights, boards, a top cornice; returns the board rows (local to the unit frame) */
function shelfUnit(ms: Mesher, rnd: Rand, x: number, z: number, ry: number, len: number, depth: number, levels: number[], back = true): { y: number; len: number; depth: number }[] {
  ms.pushT(x, 0, z, ry);
  const top = levels[levels.length - 1] + 0.32;
  for (const sx of [-len / 2, len / 2]) board(ms, 'board_warm', rnd, sx, (FLOOR + top) / 2, 0, 0.035, top - FLOOR, depth, 0, { grain: 'y' });
  if (len > 1.5) board(ms, 'board_warm', rnd, 0, (FLOOR + top) / 2, -depth / 2 + 0.02, 0.05, top - FLOOR, 0.035, 0, { grain: 'y' });
  for (const y of levels) {
    board(ms, 'board_warm', rnd, 0, y - 0.012, 0, len, 0.024, depth, 0, { grain: 'x' });
    board(ms, 'board_dark', rnd, 0, y - 0.04, depth / 2 - 0.01, len, 0.05, 0.02, 0, { grain: 'x' });
  }
  board(ms, 'board_dark', rnd, 0, top + 0.05, 0.02, len + 0.08, 0.1, depth + 0.06, 0, { grain: 'x' });
  board(ms, 'board_warm', rnd, 0, FLOOR + 0.06, depth / 2 - 0.02, len, 0.12, 0.02, 0, { grain: 'x' });
  if (back) ms.quad('board_dark', V(len / 2, FLOOR, -depth / 2 + 0.005), V(-len / 2, FLOOR, -depth / 2 + 0.005), V(-len / 2, top, -depth / 2 + 0.005), V(len / 2, top, -depth / 2 + 0.005), [0, 0], [len, 0], [len, top], [0, top]);
  ms.pop();
  return levels.map((y) => ({ y, len, depth }));
}

// ---------------------------------------------------------------------------------------------- build
export async function buildStore(): Promise<Place> {
  ensurePrintMats();
  if (!hasMat('siding_cream')) defineMat('siding_cream', new THREE.MeshStandardMaterial({ name: 'place_siding_cream', map: placeTex('trim_cream'), normalMap: placeTex('trim_cream', true), roughness: 0.85 }));
  ensureDsBlanket();
  const sp = SPOTS.store;
  const rot = sp.rot ?? 0;
  const gy = heightAt(sp.x, sp.z);
  const group = new THREE.Group();
  group.name = 'store';
  group.position.set(sp.x, gy, sp.z);
  group.rotation.y = rot;
  const ms = new Mesher();
  const cols = new Cols();
  const anchors: Record<string, THREE.Object3D> = {};
  const lights: THREE.Light[] = [];
  const updaters: ((dt: number) => void)[] = [];
  const pending: Promise<unknown>[] = [];
  const rnd = new Rand(31337);
  const glass = glassMat('store');

  shell(ms, cols, glass);
  porch(ms, cols);

  // ---- the door: glazed upper half, panel below, push bar; the bell on a spring bracket inside
  const dh = HOLES[0];
  {
    const dms = new Mesher();
    const w = dh.w - 0.08, h = dh.y1 - dh.y0 - 0.05, t = 0.045;
    const r = new Rand(5);
    // stiles and rails (green-painted), panel, glass
    board(dms, 'boards_green', r, 0.06, h / 2, 0, 0.12, h, t, 0, { grain: 'y' });
    board(dms, 'boards_green', r, w - 0.06, h / 2, 0, 0.12, h, t, 0, { grain: 'y' });
    board(dms, 'boards_green', r, w / 2, 0.1, 0, w - 0.24, 0.2, t, 0, { grain: 'x' });
    board(dms, 'boards_green', r, w / 2, 0.98, 0, w - 0.24, 0.14, t, 0, { grain: 'x' });
    board(dms, 'boards_green', r, w / 2, h - 0.07, 0, w - 0.24, 0.14, t, 0, { grain: 'x' });
    board(dms, 'boards_green', r, w / 2, 0.6, 0, w - 0.24, 0.6, t * 0.6, 0, { grain: 'y' });
    dms.quad(glass, V(0.12, 1.05, 0), V(w - 0.12, 1.05, 0), V(w - 0.12, h - 0.14, 0), V(0.12, h - 0.14, 0), [0, 0], [w, 0], [w, 1], [0, 1]);
    // OPEN / OUVERT sign hanging inside the glass
    dms.pushT(w / 2, 1.5, -0.03);
    {
      const [u0, v0, u1, v1] = SIGNS.uv('open_sign');
      for (const s of [1, -1]) {
        dms.pushT(0, 0, s * 0.003, s > 0 ? 0 : Math.PI);
        dms.quad('signs', V(-0.17, -0.07, 0), V(0.17, -0.07, 0), V(0.17, 0.07, 0), V(-0.17, 0.07, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
        dms.pop();
      }
      tube(dms, 'rope', [V(-0.12, 0.07, 0), V(0, 0.2, 0), V(0.12, 0.07, 0)], 0.002, 3);
    }
    dms.pop();
    // push plate and pull handle
    boxAt(dms, 'galv', w - 0.08, 1.0, t / 2 + 0.003, 0.06, 0.25, 0.004);
    tube(dms, 'galv', [V(w - 0.09, 0.9, -t / 2), V(w - 0.09, 0.9, -t / 2 - 0.05), V(w - 0.09, 1.12, -t / 2 - 0.05), V(w - 0.09, 1.12, -t / 2)], 0.01, 6);
    const leaf = dms.build({ name: 'store_door_leaf' });
    leaf.position.set(0, 0, 0);
    const pivot = new THREE.Group();
    pivot.name = 'door';
    pivot.add(leaf);
    pivot.position.set(dh.c - dh.w / 2 + 0.04, dh.y0 + 0.01, D / 2 - T + 0.03);
    group.add(pivot);
    // the bell rings when the door swings
    const bell = new THREE.Group();
    bell.position.set(dh.c + 0.25, dh.y1 + 0.02, D / 2 - T - 0.05);
    group.add(bell);
    const bms = new Mesher();
    tube(bms, 'iron', [V(0, 0.08, 0.04), V(0, 0.1, 0), V(0, 0.06, -0.06), V(0, 0.0, -0.08)], 0.004, 4);
    bms.pushT(0, -0.06, -0.08);
    lathe(bms, 'lab_metal', [[0.0, 0.06], [0.012, 0.058], [0.02, 0.04], [0.026, 0.01], [0.034, 0.0], [0.032, -0.004], [0.0, 0.0]].reverse() as [number, number][], 12);
    bms.pop();
    bell.add(bms.build({ name: 'bell' }));
    anchors.bell = bell;
    let ring = 0;
    const doorCtl = hingedDoor(pivot, { openAngle: 1.6, onSound: () => { ring = 1.6; pivot.userData.game?.sound?.('shop_bell'); } });
    updaters.push((dt) => {
      doorCtl.update(dt);
      ring = Math.max(0, ring - dt);
      bell.rotation.x = Math.sin(ring * 30) * 0.35 * ring;
    });
    anchors.door = anchor(group, 'door', dh.c, FLOOR, D / 2 + 0.8, 0);
    anchors.door.userData.interactable = doorCtl;
  }

  // ================================================================================ interior
  const F = FLOOR;
  const stockList: { obj: THREE.Object3D; itemId: string }[] = [];
  const stock = (id: string, x: number, y: number, z: number, ry: number, parent: THREE.Object3D = group): THREE.Object3D => {
    const o = buildProduct(id);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    parent.add(o);
    const itemId = o.userData.itemId as string;
    if (ITEMS[itemId]) stockList.push({ obj: o, itemId });
    // shelf goods do not cast shadows (hundreds of small meshes into a point-light shadow map is not worth it)
    o.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = false; });
    return o;
  };
  /** fill a shelf row (unit frame: x along, +z toward the aisle) with products in facings */
  const fillRow = (unit: THREE.Object3D, y: number, len: number, depth: number, ids: string[], rowSeed: number) => {
    const r = new Rand(rowSeed);
    let x = -len / 2 + 0.04;
    let k = 0;
    while (x < len / 2 - 0.05 && k < 400) {
      const id = ids[k % ids.length];
      const [w, , d] = productSize(id);
      const span = Math.max(0.04, w) + 0.012;
      const n = Math.max(1, Math.min(4, Math.floor((len / 2 - 0.04 - x) / span)));
      const facing = Math.min(n, 1 + r.int(1, 3));
      for (let i = 0; i < facing && x + span < len / 2; i++) {
        // two deep when it fits
        stock(id, x + span / 2, y, depth / 2 - 0.03 - d / 2, r.range(-0.08, 0.08), unit);
        x += span;
      }
      x += 0.03;
      k++;
    }
  };
  const unitFrame = (x: number, z: number, ry: number) => { const o = new THREE.Object3D(); o.position.set(x, 0, z); o.rotation.y = ry; group.add(o); return o; };

  // ---- left wall shelving (groceries), two units
  let shelfN = 0;
  {
    const levels = [F + 0.35, F + 0.8, F + 1.25, F + 1.7, F + 2.12];
    const units: [number, number, string[][]][] = [
      [-2.6, 2.1, [['beans', 'coffee'], ['cookies', 'syrup'], ['coffee', 'beans', 'beans'], ['matches', 'batteries', 'matches'], ['syrup', 'cookies']]],
      [0.1, 2.1, [['eggs', 'bacon'], ['jerky', 'jerky', 'beer'], ['beer', 'beer'], ['firestarter', 'rope'], ['kindling']]],
    ];
    for (const [z, len, rows] of units) {
      const x = -IX + 0.2, ry = Math.PI / 2;
      shelfUnit(ms, rnd, x, z, ry, len, 0.4, levels);
      const fr = unitFrame(x, z, ry);
      levels.forEach((y, i) => {
        fillRow(fr, y, len, 0.4, rows[i], shelfN * 31 + 7);
        anchors[`shelf_${shelfN}`] = anchor(fr, `shelf_${shelfN}`, 0, y, 0, 0);
        shelfN++;
      });
      cols.box(x, (F + 2.5) / 2, z, 0.2, (2.5 - F) / 2 + 0.2, len / 2, 0);
    }
  }
  // ---- central gondola (double-sided, low)
  {
    const gx = -0.7, gz = 0.6, len = 2.6, levels = [F + 0.3, F + 0.75, F + 1.2];
    for (const s of [1, -1]) {
      const ry = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      const x = gx + s * 0.22;
      shelfUnit(ms, rnd, x, gz, ry, len, 0.42, levels, s > 0);
      const fr = unitFrame(x, gz, ry);
      const rows = s > 0 ? [['sleeping_bag'], ['backpack_big', 'rope'], ['batteries', 'matches', 'file']] : [['bundle'], ['bread', 'cookies'], ['jerky', 'coffee', 'syrup']];
      levels.forEach((y, i) => {
        fillRow(fr, y, len, 0.42, rows[i], shelfN * 31 + 11);
        anchors[`shelf_${shelfN}`] = anchor(fr, `shelf_${shelfN}`, 0, y, 0, 0);
        shelfN++;
      });
    }
    cols.box(gx, F + 0.75, gz, 0.45, 0.75, len / 2);
  }
  // ---- a low table of camp goods by the window: lantern, pot, pan, gloves, first aid kit (props)
  {
    const tx = -2.35, tz = 4.72;
    board(ms, 'board_warm', rnd, tx, F + 0.72, tz, 1.2, 0.04, 0.6, 0, { grain: 'x' });
    for (const [lx, lz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]] as [number, number][]) boxAt(ms, 'board_warm', tx + lx, F + 0.35, tz + lz, 0.05, 0.7, 0.05, 0, { grain: 'y' });
    board(ms, 'board_dark', rnd, tx, F + 0.2, tz, 1.1, 0.025, 0.5, 0, { grain: 'x' });
    cols.box(tx, F + 0.37, tz, 0.6, 0.37, 0.3);
    const goods: [string, number, number, number][] = [['lantern', -0.4, 0.0, 0.3], ['pot', 0.0, 0.05, 0.4], ['first_aid', 0.42, -0.05, -0.2], ['gloves', 0.3, 0.15, 0.9], ['pan', -0.1, 0.0, 0.2]];
    for (const [id, ox, oz, ry] of goods) {
      const it = ITEMS[id];
      const y = id === 'pan' ? F + 0.2 : F + 0.74;
      pending.push(prop(group, it.model, tx + ox, y + 0.012, tz + oz, ry).then((o) => {
        if (!o) return;
        o.userData.itemId = id;
        stockList.push({ obj: o, itemId: id });
      }));
    }
    anchors.camp_table = anchor(group, 'camp_table', tx, F + 0.74, tz, 0);
  }
  // ---- the counter (right side) with the register, scale, jerky jar; display case at its front end
  const cx = 2.05, cz0 = -2.4, cz1 = 1.9, ch = F + 0.96, cd = 0.62;
  {
    const len = cz1 - cz0, czc = (cz0 + cz1) / 2;
    // front face: vertical beadboard panel with a kick rail, top: thick worn planks with a bullnose
    ms.pushT(cx - cd / 2, (F + ch) / 2, czc, -Math.PI / 2);
    box(ms, 'boards_green', len, ch - F - 0.06, 0.03, { grain: 'y', uv: [rnd.range(0, 2), 0] });
    ms.pop();
    for (let z = cz0 + 0.3; z < cz1; z += 0.6) boxAt(ms, 'board_dark', cx - cd / 2 - 0.02, (F + ch) / 2, z, 0.025, ch - F - 0.1, 0.07, 0, { grain: 'y' });
    board(ms, 'board_dark', rnd, cx - cd / 2 - 0.02, F + 0.07, czc, 0.04, 0.14, len, 0, { grain: 'z' });
    for (let i = 0; i < 3; i++) board(ms, 'board_warm', rnd, cx - cd / 2 + 0.04 + i * (cd + 0.08) / 3 + 0.06, ch - 0.025, czc, (cd + 0.08) / 3 - 0.004, 0.05, len + 0.06, 0, { grain: 'z' });
    // behind the counter: open shelves under the top (seen by the shopkeeper)
    board(ms, 'board_dark', rnd, cx + 0.1, F + 0.45, czc, cd - 0.1, 0.025, len - 0.1, 0, { grain: 'z' });
    for (const z of [cz0, cz1]) board(ms, 'board_dark', rnd, cx, (F + ch) / 2, z, cd, ch - F - 0.05, 0.03, 0, { grain: 'y' });
    cols.box(cx, (F + ch) / 2, czc, cd / 2, (ch - F) / 2, len / 2);
    anchors.counter = anchor(group, 'counter', cx - 0.05, ch, (cz0 + cz1) / 2 + 0.6, -Math.PI / 2);
    anchors.shopkeeper_spot = anchor(group, 'shopkeeper_spot', cx + 0.85, F, (cz0 + cz1) / 2 + 0.4, -Math.PI / 2);
    // the register
    const regZ = czc + 0.55;
    pending.push(prop(group, 'CashRegister_01', cx + 0.05, ch, regZ, -Math.PI / 2).then((o) => { if (o) anchors.register.add(new THREE.Object3D()); }));
    anchors.register = anchor(group, 'register', cx + 0.05, ch, regZ, -Math.PI / 2);
    const regHit = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.45), new THREE.MeshBasicMaterial({ visible: false }));
    regHit.position.set(cx + 0.05, ch + 0.2, regZ);
    group.add(regHit);
    registerInteractable(regHit, { kind: 'register', label: () => 'Pay / sell', use: (ctx) => ctx.game?.placeAction?.('register', ctx) });
    // mushroom scale: a hanging spring scale with a dial and a pan, a card that says so
    {
      const sx = cx - 0.05, sz = czc - 0.6;
      const g = new THREE.Group();
      g.position.set(sx, ch, sz);
      group.add(g);
      const sm = new Mesher();
      // gallows stand
      boxAt(sm, 'board_dark', 0.12, 0.01, 0, 0.3, 0.02, 0.22);
      tube(sm, 'iron', [V(0.22, 0.02, 0), V(0.22, 0.62, 0), V(0.0, 0.66, 0)], 0.008, 5, { smooth: false });
      // dial body
      sm.pushT(0, 0.5, 0, -Math.PI / 2);
      lathe(sm, 'galv', [[0, -0.02], [0.075, -0.02], [0.08, 0.0], [0.075, 0.02], [0, 0.02]], 16);
      sm.pop();
      {
        const [u0, v0, u1, v1] = SIGNS.uv('scale_dial');
        sm.pushT(-0.021, 0.5, 0, -Math.PI / 2);
        sm.quad('signs', V(-0.07, -0.07, 0), V(0.07, -0.07, 0), V(0.07, 0.07, 0), V(-0.07, 0.07, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
        sm.pop();
      }
      tube(sm, 'iron', [V(0, 0.64, 0), V(0, 0.58, 0)], 0.005, 4);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        tube(sm, 'iron', [V(0, 0.42, 0), V(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12)], 0.0015, 3);
      }
      sm.pushT(0, 0.18, 0);
      lathe(sm, 'galv', [[0, 0], [0.11, 0.0], [0.13, 0.03], [0.125, 0.032], [0.105, 0.006], [0, 0.006]], 16);
      sm.pop();
      g.add(sm.build({ name: 'mushroom_scale' }));
      const card = new Mesher();
      {
        const [u0, v0, u1, v1] = SIGNS.uv('sign_mushroom');
        card.pushT(-0.02, 0.06, 0.2, -Math.PI / 2 + 0.3, -0.35);
        card.quad('signs', V(-0.08, -0.05, 0), V(0.08, -0.05, 0), V(0.08, 0.05, 0), V(-0.08, 0.05, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
        card.pop();
      }
      g.add(card.build({ name: 'scale_card' }));
      anchors.scale = anchor(g, 'scale', 0, 0.19, 0, 0);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 0.35, 0);
      g.add(hit);
      registerInteractable(hit, { kind: 'custom', label: () => 'Weigh mushrooms', use: (ctx) => ctx.game?.placeAction?.('scale', ctx) });
    }
    // jar of jerky: glass jar with a tin lid and jerky strips inside
    {
      const jx = cx - 0.12, jz = czc + 1.25;
      const jm = new Mesher();
      jm.pushT(jx, ch, jz);
      lathe(jm, 'lab_gloss', [[0, 0], [0.09, 0], [0.095, 0.01], [0.095, 0.2], [0.07, 0.24], [0.07, 0.26]], 14);
      lathe(jm, 'lab_metal', [[0.076, 0.25], [0.076, 0.28], [0.05, 0.29], [0.02, 0.31], [0, 0.31]], 12);
      {
        const [u0, v0, u1, v1] = SIGNS.uv('jar_jerky');
        jm.pushT(0, 0.12, 0.097, -Math.PI / 2 - 0.0, 0, 0);
        jm.pop();
        jm.quad('signs', V(-0.07, 0.08, 0.097), V(0.07, 0.08, 0.097), V(0.07, 0.145, 0.097), V(-0.07, 0.145, 0.097), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      }
      jm.pop();
      const jar = jm.build({ name: 'jerky_jar' });
      // make the jar glass see-through
      const jg = new THREE.MeshStandardMaterial({ color: 0xc8d8d0, roughness: 0.12, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
      jar.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).name === 'place_lab_gloss') { m.material = jg; m.renderOrder = 3; m.castShadow = false; } });
      group.add(jar);
      for (let i = 0; i < 6; i++) stock('jerky', jx + (i % 2 ? 0.02 : -0.02), ch + 0.02 + i * 0.025, jz, i * 0.9).scale.set(0.6, 0.6, 0.6);
      anchors.jerky_jar = anchor(group, 'jerky_jar', jx, ch, jz, 0);
    }
    // a spike of receipts, a pencil, the radio behind the counter
    product(group, 'pencil', cx - 0.15, ch, czc - 0.05, 0.6);
    pending.push(prop(group, 'vintage_radio_transceiver', cx + 0.15, F + 0.46, czc - 1.2, -Math.PI / 2, 0.8));
    pending.push(prop(group, 'drawer_cabinet', IX - 0.3, F, czc - 0.6, -Math.PI / 2));
  }
  // ---- the glass display case at the front end of the counter: knives, files, flashlights
  {
    const dx0 = 1.05, dx1 = 2.55, dz = 2.55, dd = 0.55, dh2 = F + 0.95;
    const dcx = (dx0 + dx1) / 2;
    // wooden base cabinet
    board(ms, 'boards_green', rnd, dcx, F + 0.25, dz, dx1 - dx0, 0.5, dd, 0, { grain: 'x' });
    board(ms, 'board_dark', rnd, dcx, F + 0.51, dz, dx1 - dx0 + 0.04, 0.03, dd + 0.04, 0, { grain: 'x' });
    // glass box: wooden posts + glass panes + a top glass
    const gy0 = F + 0.53, gy1 = dh2;
    for (const [x, z] of [[dx0, dz - dd / 2], [dx1, dz - dd / 2], [dx0, dz + dd / 2], [dx1, dz + dd / 2]] as [number, number][]) boxAt(ms, 'board_dark', x, (gy0 + gy1) / 2, z, 0.03, gy1 - gy0, 0.03);
    board(ms, 'board_dark', rnd, dcx, gy1, dz - dd / 2, dx1 - dx0, 0.03, 0.03, 0, { grain: 'x' });
    board(ms, 'board_dark', rnd, dcx, gy1, dz + dd / 2, dx1 - dx0, 0.03, 0.03, 0, { grain: 'x' });
    const gm = glassMat('case');
    const pane = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => ms.quad(gm, a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1]);
    pane(V(dx0, gy0, dz + dd / 2), V(dx1, gy0, dz + dd / 2), V(dx1, gy1, dz + dd / 2), V(dx0, gy1, dz + dd / 2));
    pane(V(dx1, gy0, dz - dd / 2), V(dx0, gy0, dz - dd / 2), V(dx0, gy1, dz - dd / 2), V(dx1, gy1, dz - dd / 2));
    pane(V(dx0, gy0, dz - dd / 2), V(dx0, gy0, dz + dd / 2), V(dx0, gy1, dz + dd / 2), V(dx0, gy1, dz - dd / 2));
    pane(V(dx0, gy1, dz + dd / 2), V(dx1, gy1, dz + dd / 2), V(dx1, gy1, dz - dd / 2), V(dx0, gy1, dz - dd / 2));
    // felt bed
    boxAt(ms, 'wool_grey', dcx, gy0 + 0.006, dz, dx1 - dx0 - 0.04, 0.012, dd - 0.04);
    cols.box(dcx, (F + gy1) / 2, dz, (dx1 - dx0) / 2, (gy1 - F) / 2, dd / 2);
    // contents: knives, files, flashlights, batteries, a compass (pickable)
    const caseItems: [string, number, number, number][] = [['knife', -0.55, 0.0, 1.5], ['knife', -0.45, 0.08, 1.4], ['file', -0.2, -0.05, 0.1], ['file', -0.1, 0.06, -0.1], ['flashlight', 0.25, 0, 0.3], ['flashlight', 0.45, 0.05, 0.1], ['batteries', 0.6, -0.12, 0.2]];
    for (const [id, ox, oz, ry] of caseItems) {
      const it = ITEMS[id];
      const y = gy0 + 0.012;
      if (it.model.startsWith('gen:')) {
        const o = stock(id, dcx + ox, y, dz + oz, ry);
        if (id === 'file') o.rotation.z = 0;
      } else {
        pending.push(prop(group, it.model, dcx + ox, y, dz + oz, ry).then((o) => {
          if (!o) return;
          o.userData.itemId = id;
          stockList.push({ obj: o, itemId: id });
          // lay long things flat
          const bb = new THREE.Box3().setFromObject(o);
          const s = bb.getSize(new THREE.Vector3());
          if (s.y > 0.12) { o.rotation.set(Math.PI / 2, 0, ry); o.position.y = y + Math.min(s.x, s.z) / 2; }
        }));
      }
    }
    anchors.display_case = anchor(group, 'display_case', dcx, gy0, dz, 0);
    // the chainsaw sits on top of the case where everybody can covet it
    stock('chainsaw', dcx + 0.1, gy1 + 0.012, dz, -1.9);
  }
  // ---- pegboard (back wall, right): axes, saws, rope, maul
  {
    const px0 = -IX + 0.15, px1 = -1.45, py0 = F + 0.95, py1 = F + 2.55, pz = -IZ + 0.015;
    ms.quad('board_dark', V(px1, py0, pz), V(px0, py0, pz), V(px0, py1, pz), V(px1, py1, pz), [0, 0], [px1 - px0, 0], [px1 - px0, py1 - py0], [0, py1 - py0]);
    boxAt(ms, 'board_warm', (px0 + px1) / 2, py1 + 0.03, pz + 0.02, px1 - px0 + 0.06, 0.06, 0.04);
    boxAt(ms, 'board_warm', (px0 + px1) / 2, py0 - 0.03, pz + 0.02, px1 - px0 + 0.06, 0.06, 0.04);
    // peg holes: a grid of dark dots
    ensurePegMat();
    ms.quad('pegholes', V(px0 + 0.02, py0 + 0.02, pz + 0.002), V(px1 - 0.02, py0 + 0.02, pz + 0.002), V(px1 - 0.02, py1 - 0.02, pz + 0.002), V(px0 + 0.02, py1 - 0.02, pz + 0.002), [0, 0], [(px1 - px0) / 0.05, 0], [(px1 - px0) / 0.05, (py1 - py0) / 0.05], [0, (py1 - py0) / 0.05]);
    const hang: [string, number, number, number][] = [['axe_felling', -3.45, F + 1.75, 0], ['axe_felling', -3.2, F + 1.75, 0], ['axe_splitting', -2.9, F + 1.75, 0], ['hatchet', -2.55, F + 2.05, 0], ['hatchet', -2.35, F + 2.05, 0], ['bucksaw', -1.95, F + 1.6, 0]];
    for (const [id, x, y] of hang) {
      const it = ITEMS[id];
      // pegs
      tube(ms, 'galv', [V(x, y + 0.36, pz + 0.004), V(x, y + 0.36, pz + 0.06), V(x, y + 0.38, pz + 0.07)], 0.004, 4);
      pending.push(prop(group, it.model, x, y, pz + 0.07, 0).then((o) => {
        if (!o) return;
        o.userData.itemId = id;
        const bb = new THREE.Box3().setFromObject(o);
        const s = bb.getSize(new THREE.Vector3());
        // hang flat against the board: thinnest axis toward the wall
        if (s.x < s.z) o.rotation.y = Math.PI / 2;
        const bb2 = new THREE.Box3().setFromObject(o);
        o.position.y += (y + 0.42) - bb2.max.y;
        o.position.z += (pz + 0.02) - bb2.min.z;
        stockList.push({ obj: o, itemId: id });
      }));
    }
    // rope coils on pegs
    for (const [x, y] of [[-2.0, F + 2.25], [-1.7, F + 2.25]] as [number, number][]) {
      const o = stock('rope', x, y, pz + 0.07, 0);
      o.rotation.set(Math.PI / 2, 0, 0);
    }
    // log tongs on a hook, the maul leaning below
    const lt = stock('log_tongs', -2.4, F + 1.0, pz + 0.07, 0);
    lt.scale.setScalar(1);
    pending.push(prop(group, ITEMS.maul.model, -1.75, F, pz + 0.2, 0).then((o) => {
      if (!o) return;
      o.userData.itemId = 'maul';
      o.rotation.set(-0.22, 0, 0);
      stockList.push({ obj: o, itemId: 'maul' });
    }));
    anchors.pegboard = anchor(group, 'pegboard', (px0 + px1) / 2, (py0 + py1) / 2, pz + 0.1, 0);
  }
  // ---- the barrel stove with the coffee pot, chairs around it, checkerboard on a barrel
  let stove: ReturnType<typeof buildStove>;
  {
    const sx = -0.9, sz = -3.4;
    // stone pad
    flagstones(ms, new Rand(77), sx - 0.75, sx + 0.75, sz - 0.65, sz + 0.75, F + 0.05, 0.36);
    ms.pushT(sx, F + 0.02, sz + 0.05);
    box(ms, 'chink', 1.5, 0.04, 1.4);
    ms.pop();
    stove = buildStove({ pipeTop: CEIL + 0.1 - F - 0.06, seed: 19 });
    stove.group.position.set(sx, F + 0.06, sz);
    stove.group.rotation.y = 0.0;
    group.add(stove.group);
    lights.push(stove.light);
    stove.setFire(0.6);
    updaters.push((dt) => stove.update(dt));
    anchors.stove = stove.door;
    anchors.stove_fire = stove.fire;
    product(group, 'coffeepot', sx + 0.08, F + 0.06 + STOVE.AXIS_Y + STOVE.R - 0.01, sz + 0.12, -0.6);
    cols.box(sx, F + 0.5, sz, 0.38, 0.5, STOVE.L / 2 + 0.05);
    pending.push(prop(group, 'Rockingchair_01', sx + 1.15, F, sz + 0.95, -2.3));
    pending.push(prop(group, 'wooden_stool_01', sx - 1.0, F, sz + 1.0, 0.6));
    pending.push(prop(group, 'Barrel_01', sx + 0.95, F, sz + 2.0, 0.3).then((o) => {
      if (!o) return;
      // a checkerboard on the barrel head
      const top = new THREE.Box3().setFromObject(o).max.y;
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.36), new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.6 }));
      g.position.set(sx + 0.95, top + 0.008, sz + 2.0);
      g.rotation.y = 0.4;
      g.castShadow = g.receiveShadow = true;
      group.add(g);
    }));
    cols.box(sx + 0.95, F + 0.45, sz + 2.0, 0.3, 0.45, 0.3);
    // kindling and a split pile beside the stove
    const wr = new Rand(55);
    for (let i = 0; i < 9; i++) {
      ms.pushT(sx - 0.6 + (i % 3) * 0.13, F + 0.08 + Math.floor(i / 3) * 0.11, sz - 0.2, Math.PI / 2 + wr.range(-0.1, 0.1), 0, wr.range(0, 6));
      writeSplit(ms, wr, 0.38, 0.12, wr.int(0, 9999));
      ms.pop();
    }
  }
  // ---- posters and signs on the walls
  {
    const sign = (key: string, w: number, h: number, wall: 'left' | 'right' | 'back' | 'front', along: number, y: number, tilt = 0) => {
      ms.push(wallFrame(wall));
      ms.pushT(along, y, -T / 2 - 0.006, Math.PI, 0, tilt);
      const [u0, v0, u1, v1] = SIGNS.uv(key);
      ms.quad('signs', V(-w / 2, -h / 2, 0), V(w / 2, -h / 2, 0), V(w / 2, h / 2, 0), V(-w / 2, h / 2, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      // tacks
      for (const [tx, ty] of [[-w / 2 + 0.02, h / 2 - 0.02], [w / 2 - 0.02, h / 2 - 0.02]]) boxAt(ms, 'galv', tx, ty, -0.003, 0.008, 0.008, 0.006);
      ms.pop(); ms.pop();
    };
    // wall-frame "along" is mirrored for interior viewing (the frame looks from outside)
    // 'along' is the wall frame's x: front = local x, back = -local x, right = -local z, left = +local z
    sign('coffee_poster', 0.45, 0.6, 'right', -0.45, F + 1.75, 0.02);
    sign('chainsaw_poster', 0.45, 0.6, 'back', -0.05, F + 1.8, -0.02);
    sign('beer_sign', 0.5, 0.35, 'back', -1.1, F + 1.65, 0.0);
    sign('price_board', 0.8, 0.6, 'right', 1.0, F + 1.75, 0);
    sign('sign_credit', 0.4, 0.15, 'right', 1.0, F + 2.35, 0);
    sign('sign_hours', 0.2, 0.28, 'front', 0.75, F + 1.5, 0.03);
    sign('sign_bait', 0.4, 0.2, 'back', -2.2, F + 2.32, 0.01);
    sign('dog_poster', 0.22, 0.3, 'front', -0.78, F + 1.55, -0.04);
    sign('fire_danger', 0.42, 0.28, 'left', -1.25, F + 2.78, 0.0);
    pending.push(prop(group, 'wall_clock', IX - 0.03, F + 2.45, -0.3, -Math.PI / 2));
  }
  // ---- the noticeboard (left wall near the front): cork-ish board with contract pins
  const pins: THREE.Object3D[] = [];
  {
    const nb = new THREE.Group();
    nb.position.set(-IX + 0.03, F + 1.55, 3.75);
    nb.rotation.y = Math.PI / 2;
    group.add(nb);
    const nm = new Mesher();
    const bw = 1.3, bh = 0.9;
    boxAt(nm, 'board_dark', 0, 0, 0, bw + 0.1, bh + 0.1, 0.03);
    ensureCorkMat();
    nm.quad('cork', V(-bw / 2, -bh / 2, 0.016), V(bw / 2, -bh / 2, 0.016), V(bw / 2, bh / 2, 0.016), V(-bw / 2, bh / 2, 0.016), [0, 0], [bw, 0], [bw, bh], [0, bh]);
    for (const [x, y, w, h] of [[0, bh / 2 + 0.04, bw + 0.16, 0.06], [0, -bh / 2 - 0.04, bw + 0.16, 0.06], [-bw / 2 - 0.04, 0, 0.06, bh + 0.14], [bw / 2 + 0.04, 0, 0.06, bh + 0.14]] as [number, number, number, number][]) boxAt(nm, 'board_warm', x, y, 0.02, w, h, 0.03);
    // header sign
    {
      const [u0, v0, u1, v1] = SIGNS.uv('sign_board');
      nm.quad('signs', V(-0.6, bh / 2 + 0.08, 0.04), V(0.6, bh / 2 + 0.08, 0.04), V(0.6, bh / 2 + 0.26, 0.04), V(-0.6, bh / 2 + 0.26, 0.04), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    }
    // old notices already pinned, leaving 6 slots for contracts
    const old: [string, number, number, number][] = [['notice_0', -0.5, 0.22, 0.05], ['notice_1', 0.52, -0.25, -0.06], ['notice_2', -0.52, -0.22, 0.03], ['notice_3', 0.5, 0.24, -0.04]];
    for (const [k, x, y, a] of old) {
      const [u0, v0, u1, v1] = SIGNS.uv(k);
      nm.pushT(x, y, 0.02, 0, 0, a);
      nm.quad('signs', V(-0.075, -0.09, 0), V(0.075, -0.09, 0), V(0.075, 0.09, 0), V(-0.075, 0.09, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      boxAt(nm, 'blanket', 0, 0.07, 0.004, 0.01, 0.01, 0.008);
      nm.pop();
    }
    nb.add(nm.build({ name: 'noticeboard' }));
    const slots: [number, number][] = [[-0.2, 0.22], [0.15, 0.24], [-0.2, -0.2], [0.15, -0.22], [-0.02, 0.01], [0.33, 0.0]];
    slots.forEach(([x, y], i) => {
      const p = anchor(nb, `pin_${i}`, x, y, 0.025, 0);
      pins.push(p);
      anchors[`pin_${i}`] = p;
    });
    anchors.noticeboard = nb;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), new THREE.MeshBasicMaterial({ visible: false }));
    nb.add(hit);
    registerInteractable(hit, { kind: 'board', label: () => 'Read the job board', use: (ctx) => ctx.game?.placeAction?.('noticeboard', ctx) });
  }
  // ---- back room doorway curtain, crates and barrels for character
  {
    const pc = -HOLES[HOLES.length - 1].c; // back wall frame mirrors x
    const cz = -IZ + 0.02;
    const pts: THREE.Vector3[][] = [];
    for (let i = 0; i <= 2; i++) {
      const row: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) row.push(V(pc - 0.48 + 0.96 * (k / 8), F + 2.1 - i * 1.0, cz + 0.03 + 0.03 * Math.sin(k * 1.9 + i)));
      pts.push(row);
    }
    for (let i = 0; i < 2; i++) for (let k = 0; k < 8; k++) {
      const a = pts[i][k], b = pts[i][k + 1], c = pts[i + 1][k + 1], d = pts[i + 1][k];
      ms.quad('blanket_ds', a, b, c, d, [a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y]);
    }
    ensureDsBlanket();
    tube(ms, 'iron', [V(pc - 0.55, F + 2.12, cz + 0.03), V(pc + 0.55, F + 2.12, cz + 0.03)], 0.008, 4);
    pending.push(prop(group, 'wooden_crate_01', pc + 1.05, F, -IZ + 0.35, 0.1));
    pending.push(prop(group, 'wooden_crate_02', pc + 1.0, F + 0.35, -IZ + 0.35, -0.2));
    pending.push(prop(group, 'CheeseBox_01', pc + 1.05, F + 0.7, -IZ + 0.33, 0.4));
    pending.push(prop(group, 'Barrel_02', -IX + 0.4, F, -IZ + 0.5, 0));
    pending.push(prop(group, 'metal_jerrycan', 0.3, F, -IZ + 0.25, 0.2));
    pending.push(prop(group, 'propane_tank', -0.15, F, -IZ + 0.25, 0));
    cols.box(pc + 1.05, F + 0.5, -IZ + 0.35, 0.42, 0.5, 0.25);
    cols.box(-IX + 0.4, F + 0.45, -IZ + 0.5, 0.3, 0.45, 0.3);
  }
  // ---- hanging lamps: enamel pendant shades with warm bulbs (one shadowed over the counter)
  const lamps: { light: THREE.PointLight; base: number }[] = [];
  {
    const spots: [number, number, boolean][] = [[cx - 0.4, -0.2, true], [-0.8, 0.5, false], [-0.8, -2.6, false], [-1.4, 3.6, false]];
    for (const [x, z, sh] of spots) {
      tube(ms, 'iron', [V(x, CEIL, z), V(x, CEIL - 0.7, z)], 0.004, 4);
      ms.pushT(x, CEIL - 0.7, z);
      lathe(ms, 'enamel', [[0.0, 0.05], [0.03, 0.05], [0.05, 0.03], [0.2, -0.08], [0.21, -0.09], [0.205, -0.095], [0.19, -0.085], [0.045, 0.02], [0.0, 0.03]], 18);
      ms.pop();
      // the bulb: emissive
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x302010, emissive: new THREE.Color(1.0, 0.75, 0.42), emissiveIntensity: 1.6 }));
      bulb.position.set(x, CEIL - 0.79, z);
      group.add(bulb);
      const l = new THREE.PointLight(0xffc98a, 0, sh ? 10 : 7, 1.5);
      l.position.set(x, CEIL - 0.85, z);
      if (sh) { shadowy(l, 512, -0.003); l.shadow.camera.far = 9; }
      group.add(l);
      lights.push(l);
      lamps.push({ light: l, base: sh ? 11 : 6 });
      bulb.userData.lamp = true;
    }
  }
  // the gooseneck lamps over the sign
  {
    const l = new THREE.PointLight(0xffd6a0, 0, 6, 1.5);
    l.position.set(0, 4.75 + 0.8, D / 2 + 0.75);
    group.add(l);
    lights.push(l);
    lamps.push({ light: l, base: 4.5 });
  }
  for (const x of [-1.8, 1.8]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0x302010, emissive: new THREE.Color(1.0, 0.8, 0.5), emissiveIntensity: 3 }));
    bulb.position.set(x, 4.75 + 0.84, D / 2 + 0.47);
    bulb.userData.lamp = true;
    group.add(bulb);
  }
  // window spill toward the porch at night (warm dusty light)
  const spill: THREE.SpotLight[] = [];
  {
    const s = new THREE.SpotLight(0xffb366, 0, 10, 1.05, 0.85, 1.5);
    s.position.set(0, FLOOR + 1.6, D / 2 - 0.4);
    s.target.position.set(0, 0, D / 2 + 4.5);
    group.add(s, s.target);
    spill.push(s);
    lights.push(s);
  }

  // ================================================================================ exterior dressing
  {
    // porch bench, a crate of empties, a barrel, a dog bowl
    const pz = D / 2 + 0.55;
    pending.push(prop(group, 'painted_wooden_bench', -2.3, FLOOR - 0.02, pz, 0));
    anchors.porch_bench = anchor(group, 'porch_bench', -2.3, FLOOR + 0.45, pz + 0.1, 0);
    cols.box(-2.3, FLOOR + 0.45, pz, 0.6, 0.45, 0.25);
    pending.push(prop(group, 'wooden_crate_02', 3.1, FLOOR - 0.02, pz, 0.2).then((o) => {
      if (!o) return;
      for (let i = 0; i < 6; i++) stock('beer', 3.1 - 0.15 + (i % 3) * 0.1, FLOOR + 0.06, pz - 0.05 + Math.floor(i / 3) * 0.1, i);
    }));
    pending.push(prop(group, 'metal_trash_can_rust', 3.8, FLOOR - 0.02, pz + 0.9, 0.4));
    // bait sign on the right post, fire danger sign by the road
    {
      const [u0, v0, u1, v1] = SIGNS.uv('sign_bait');
      ms.pushT(1.3, FLOOR + 1.6, D / 2 + PORCH - 0.12 + 0.07);
      ms.quad('signs', V(-0.2, -0.1, 0), V(0.2, -0.1, 0), V(0.2, 0.1, 0), V(-0.2, 0.1, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      ms.pop();
    }
    {
      const fx = -6.2, fz = D / 2 + 6.5;
      const g = heightAt(...toWorld(sp, fx, fz)) - gy;
      for (const x of [fx - 0.55, fx + 0.55]) logAB(ms, V(x, g - 0.2, fz), V(x, g + 2.4, fz), 0.06, { seed: 900 + x, seg: 7, capA: -1, capB: 3 });
      const [u0, v0, u1, v1] = SIGNS.uv('fire_danger');
      ms.pushT(fx, g + 1.75, fz + 0.07, 0.25);
      boxAt(ms, 'board_grey', 0, 0, -0.03, 1.28, 0.88, 0.04);
      ms.quad('signs', V(-0.6, -0.4, 0), V(0.6, -0.4, 0), V(0.6, 0.4, 0), V(-0.6, 0.4, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      ms.pop();
      cols.box(fx, g + 1.2, fz, 0.7, 1.2, 0.08);
    }
    // the old gas pump on a concrete island in front of the porch, right side
    {
      const px = 3.4, pzz = D / 2 + PORCH + 2.6;
      const g = heightAt(...toWorld(sp, px, pzz)) - gy;
      ms.pushT(px, g + 0.08, pzz);
      box(ms, 'stone', 1.4, 0.16, 0.8, { uv: [0, 0] });
      ms.pop();
      gasPump(ms, px, g + 0.16, pzz, -0.1);
      cols.box(px, g + 1.1, pzz, 0.35, 1.1, 0.3, -0.1);
      anchors.gas_pump = anchor(group, 'gas_pump', px, g + 0.16, pzz + 0.6, 0);
    }
    // the jeep parks by the pump, nose toward the store
    {
      const jx = 0.5, jz = D / 2 + PORCH + 5.5;
      anchors.jeep_park = anchor(group, 'jeep_park', jx, heightAt(...toWorld(sp, jx, jz)) - gy, jz, Math.PI);
    }
  }
  // ---- clutter along the right side wall
  {
    const x = W / 2 + 0.45;
    const gh = (lz: number) => heightAt(...toWorld(sp, x, lz)) - gy;
    pending.push(prop(group, 'Barrel_01', x, gh(-4.6), -4.6, 0.4));
    pending.push(prop(group, 'old_tyre', x + 0.05, gh(-3.6), -3.6, Math.PI / 2).then((o) => { if (o) { o.rotation.set(0.25, Math.PI / 2, 0); } }));
    pending.push(prop(group, 'wooden_crate_01', x, gh(1.0), 1.0, Math.PI / 2 + 0.1));
    pending.push(prop(group, 'wooden_crate_02', x + 0.05, gh(1.0) + 0.35, 1.0, Math.PI / 2 - 0.15));
    pending.push(prop(group, 'metal_trash_can', x, gh(2.4), 2.4, 0.3));
    pending.push(prop(group, 'wooden_ladder', W / 2 + 0.15, gh(-1.0), -1.0, -Math.PI / 2).then((o) => { if (o) o.rotation.set(-0.28, -Math.PI / 2, 0, 'YXZ'); }));
    cols.box(x, 0.45, -4.6, 0.3, 0.45, 0.3);
    cols.box(x, 0.4, 1.0, 0.25, 0.4, 0.45);
  }
  // ---- log deck (right side): skids on the ground, a few logs already sold, a sign
  {
    const lx = W / 2 + 4.6, lz = -0.5;
    const g = heightAt(...toWorld(sp, lx, lz)) - gy;
    const deck = new THREE.Group();
    deck.position.set(lx, g, lz);
    group.add(deck);
    const dm = new Mesher();
    for (const z of [-2.2, 0, 2.2]) logAB(dm, V(-2.4, 0.13, z), V(2.4, 0.13, z), 0.15, { seed: 1200 + z * 10, seg: 9, capA: 1, capB: 1, matFor: () => 'bark' });
    const lr = new Rand(1300);
    for (let i = 0; i < 4; i++) {
      const r = lr.range(0.13, 0.2);
      dm.pushT(-1.8 + i * 0.45, 0.28 + r, -2.9, Math.PI / 2 + lr.range(-0.04, 0.04));
      log(dm, 5.8, r, { seed: 1310 + i, seg: 12, capA: 1, capB: 1, matFor: () => 'bark' });
      dm.pop();
    }
    dm.pushT(-1.6, 0.28 + 0.18 + 0.33, -2.9, Math.PI / 2);
    log(dm, 5.8, 0.17, { seed: 1320, seg: 12, capA: 1, capB: 1, matFor: () => (lr.next() > 2 ? 'bark' : 'bark') });
    dm.pop();
    // sign on a post
    logAB(dm, V(2.6, -0.2, 3.3), V(2.6, 1.9, 3.3), 0.06, { seed: 1330, seg: 7, capA: -1, capB: 3 });
    {
      const [u0, v0, u1, v1] = SIGNS.uv('sign_logs');
      dm.pushT(2.6, 1.55, 3.37, -0.5);
      boxAt(dm, 'board_grey', 0, 0, -0.025, 0.86, 0.36, 0.03);
      dm.quad('signs', V(-0.4, -0.16, 0), V(0.4, -0.16, 0), V(0.4, 0.16, 0), V(-0.4, 0.16, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      dm.pop();
    }
    // a few stones and a stump to sit on
    for (let i = 0; i < 4; i++) rock(dm, lr, lr.range(-3, 3), 0, lr.range(2.6, 3.4), 0.3, 0.2, 0.3);
    deck.add(dm.build({ name: 'log_deck' }));
    anchors.log_deck = anchor(group, 'log_deck', lx, g + 0.3, lz + 0.6, Math.PI / 2);
    anchors.log_deck.userData = { w: 4.8, d: 3.6 };
    for (const z of [-2.2, 0, 2.2]) cols.box(lx, g + 0.14, lz + z, 2.4, 0.15, 0.16);
    cols.box(lx, g + 0.6, lz - 2.9, 0.9, 0.5, 2.9);
  }

  // ---- static mesh
  const mesh = ms.build({ name: 'store_static' });
  group.add(mesh);
  await Promise.all(pending);

  // ---- pickups: every stocked product (and hung tool) is a 'pickup' with userData.itemId
  for (const { obj, itemId } of stockList) {
    const it = ITEMS[itemId];
    obj.userData.itemId = itemId;
    registerInteractable(obj, {
      kind: 'pickup',
      label: () => (it.price > 0 ? `${it.name}  $${it.price}` : it.name),
      use: (ctx) => ctx.game?.placeAction?.('pickup', { ...ctx, itemId, object: obj }),
      reach: 2.4,
    });
  }

  // ---- lamps on/off
  let lampLevel = 1;
  const glassM = glassMaterial('store');
  let t = 0;
  updaters.push((dt) => {
    t += dt;
    for (const l of lamps) l.light.intensity = l.base * lampLevel * (0.97 + 0.03 * flicker(t * 0.3, l.base));
    for (const s of spill) s.intensity = 7 * lampLevel;
    glassM.emissiveIntensity = 0.45 * lampLevel;
  });
  group.traverse((o) => { if (o.userData.lamp) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6; });

  const cull = lightCuller(new THREE.Vector3(sp.x, gy + 1.5, sp.z), lights, 90);
  updaters.push(() => {
    const k = cull();
    if (k < 1) for (const l of lights) l.intensity *= k;
  });
  const interior = interiorBoxes(sp.x, gy, sp.z, rot, -IX, IX, -IZ, IZ, FLOOR - 0.1, CEIL + 0.1);
  return {
    group,
    colliders: cols.toWorld(sp.x, gy, sp.z, rot),
    anchors,
    lights,
    stove: { setFire: (l: number) => stove.setFire(l) },
    update: (dt: number) => { for (const u of updaters) u(dt); },
    interior,
    pins,
    setLamps: (l: number) => {
      lampLevel = Math.max(0, Math.min(1, l));
      group.traverse((o) => { if (o.userData.lamp) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 * lampLevel; });
    },
  };

  function product(parent: THREE.Object3D, id: string, x: number, y: number, z: number, ry: number): THREE.Object3D {
    const o = buildProduct(id);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    parent.add(o);
    return o;
  }
}

// ---------------------------------------------------------------------------------------------- helpers
function toWorld(sp: { x: number; z: number; rot?: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(sp.rot ?? 0), s = Math.sin(sp.rot ?? 0);
  return [sp.x + c * lx + s * lz, sp.z - s * lx + c * lz];
}

function fitHeight(o: THREE.Object3D | null, h: number): void {
  if (!o) return;
  const bb = new THREE.Box3().setFromObject(o);
  const s = bb.getSize(new THREE.Vector3());
  if (s.y > h * 1.6) o.scale.multiplyScalar(h / s.y);
}

/** the old gas pump: a tall cabinet with a face plate, a glass globe on top, a hose and nozzle */
function gasPump(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  const r = new Rand(4);
  ms.pushT(x, y, z, ry);
  // base plinth and the tapered body (red painted, rusty)
  boxAt(ms, 'iron', 0, 0.06, 0, 0.5, 0.12, 0.42);
  ms.pushT(0, 0.12, 0);
  lathe(ms, 'rusty_red', [[0.0, 0], [0.26, 0], [0.24, 0.05], [0.22, 1.15], [0.24, 1.2], [0.25, 1.45], [0.2, 1.5], [0, 1.52]], 4, { phase: Math.PI / 4 });
  ms.pop();
  // face plates front and back
  const [u0, v0, u1, v1] = SIGNS.uv('pump_face');
  for (const s of [1, -1]) {
    ms.pushT(0, 0.12 + 0.95, s * 0.17, s > 0 ? 0 : Math.PI, -0.02 * s);
    ms.quad('signs', V(-0.15, -0.28, 0), V(0.15, -0.28, 0), V(0.15, 0.28, 0), V(-0.15, 0.28, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    ms.pop();
  }
  // globe: glass ball with a painted band
  ms.pushT(0, 1.66, 0);
  const [g0, gv0, g1, gv1] = SIGNS.uv('pump_globe');
  lathe(ms, 'signs', [[0.0, 0], [0.06, 0.0], [0.15, 0.06], [0.17, 0.16], [0.15, 0.26], [0.06, 0.32], [0, 0.32]], 16, { uNorm: true, vNorm: true, uv: [g0, gv0, g1, gv1] });
  ms.pop();
  // hose hanging from the side, nozzle in its holster
  tube(ms, 'soot', [V(0.2, 1.2, 0), V(0.32, 1.0, 0.05), V(0.36, 0.5, 0.12), V(0.3, 0.25, 0.2), V(0.25, 0.7, 0.22), V(0.24, 0.9, 0.18)], 0.016, 6);
  boxAt(ms, 'galv', 0.24, 0.95, 0.15, 0.05, 0.12, 0.05, 0, {}, 0.4);
  tube(ms, 'galv', [V(0.24, 0.92, 0.18), V(0.24, 0.85, 0.3)], 0.01, 5);
  void r;
  ms.pop();
}

let pegDone = false;
function ensurePegMat(): void {
  if (pegDone) return;
  pegDone = true;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 4, 4);
  g.fillStyle = 'rgba(10,8,6,1)';
  g.fillRect(1, 1, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  defineMat('pegholes', new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 1, color: 0x222222 }));
}

let corkDone = false;
function ensureCorkMat(): void {
  if (corkDone) return;
  corkDone = true;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  const r = new Rand(99);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const k = 0.7 + r.next() * 0.45;
    g.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(104 * k)},${Math.round(64 * k)})`;
    g.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,40,20,0.8)'; g.fillRect(r.int(0, 63), r.int(0, 63), 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(4, 4);
  defineMat('cork', new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
}

let dsDone = false;
function ensureDsBlanket(): void {
  if (dsDone) return;
  dsDone = true;
  // the wool texture as a double-sided curtain
  defineMat('blanket_ds', new THREE.MeshStandardMaterial({ map: placeTex('blanket'), roughness: 1, side: THREE.DoubleSide }));
}

let checker: THREE.Texture | null = null;
function checkerTex(): THREE.Texture {
  if (checker) return checker;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#2a1a12' : '#c8b48a';
    g.fillRect(x * 4, y * 4, 4, 4);
  }
  g.fillStyle = '#8a1a14'; g.fillRect(5, 5, 2, 2); g.fillRect(13, 9, 2, 2); g.fillRect(21, 5, 2, 2);
  g.fillStyle = '#101010'; g.fillRect(9, 21, 2, 2); g.fillRect(17, 25, 2, 2); g.fillRect(25, 21, 2, 2);
  checker = new THREE.CanvasTexture(c);
  checker.magFilter = THREE.NearestFilter; checker.colorSpace = THREE.SRGBColorSpace;
  return checker;
}
void cushion;
