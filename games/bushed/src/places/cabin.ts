// The trapper's cabin at SPOTS.cabin: a one-room saddle-notched log cabin (6.5 x 5 m outside the corners) with
// overhanging log ends, chinking, a cedar-shake gable roof over a front porch, stovepipe with a rain cap, a plank
// Z-brace door (working hinge) and two six-pane windows. Inside: barrel stove on a stone hearth with a wood box,
// plank table + bench + chair, a log bunk with a buffalo-check wool blanket, kitchen shelves, coat hooks, the big
// wall thermometer (setThermometer), a calendar, a hand-drawn wall map, the journal desk with drawers, hanging
// bundles, a bucket and lamplight. Beside it the woodyard (SPOTS.woodyard) and a fire pit.
//
// Local frame: the door wall faces +Z, origin at the centre of the footprint on the ground (y = 0 at grade).
import * as THREE from 'three';
import { SPOTS, heightAt } from '../world/layout';
import {
  Place, Mesher, Rand, Cols, V, tf, box, boxAt, board, log, logAB, lathe, tube, poly, rectsMinus, anchor,
  interiorBoxes, flicker, shadowy, placeMat, lightCuller,
} from './kit';
import { windowUnit, doorFrame, doorLeaf, glassMat, glassMaterial } from './fixtures';
import { buildStove, STOVE } from './stove';
import { hingedDoor, registerInteractable } from '../game/interact';
import { dressing } from './dressing';
import { footing, tinRoof, gutters, screenDoor, fieldstone } from './cabin/structure';
import { ensureCabinTex, cabinGlass } from './cabin/tex';
import { detailTier, noRay } from './cabin/bake';

import { CABIN, EAVE, deckY, RIDGE, ROOF_T, ZB, ZF, ySide, yEnd, IN, OPENINGS, openingY, type Opening } from './cabinplan';
const { W, D, R, S, OH, FLOOR, NC, PORCH, K, XE } = CABIN;
export { CABIN };

// ---------------------------------------------------------------------------------------------- walls
function walls(ms: Mesher, cols: Cols): void {
  const rnd = new Rand(41);
  // inside a wall span the side facing the room is honey, outside silver. Every log end is cut by hand: the
  // overhangs vary course to course (axe and bucksaw, not a jig), the sills are fatter, the ends grey and checked.
  const wallLog = (wall: Opening['wall'], k: number, y: number) => {
    const along = wall === 'front' || wall === 'back' ? W : D;
    const er = new Rand(k * 97 + (wall === 'front' ? 1 : wall === 'back' ? 2 : wall === 'left' ? 3 : 4) * 1301);
    const ohA = OH + er.range(-0.12, 0.12) + (k === 0 ? 0.06 : 0), ohB = OH + er.range(-0.12, 0.12) + (k === 0 ? 0.06 : 0);
    const total = along + ohA + ohB;
    const start = -along / 2 - ohA; // wall coordinate of the log's start
    const ops = OPENINGS.filter((o) => o.wall === wall && k >= o.k0 && k <= o.k1);
    // segments along the log (in log coordinates 0..total, wall coordinate = s + start)
    let segs: [number, number][] = [[0, total]];
    for (const o of ops) {
      const a = o.c - o.w / 2 - start, b = o.c + o.w / 2 - start;
      segs = segs.flatMap(([s0, s1]) => {
        const out: [number, number][] = [];
        if (a > s0) out.push([s0, Math.min(a, s1)]);
        if (b < s1) out.push([Math.max(b, s0), s1]);
        return out;
      });
    }
    const inward = wall === 'front' ? V(0, 0, -1) : wall === 'back' ? V(0, 0, 1) : wall === 'left' ? V(1, 0, 0) : V(-1, 0, 0);
    const sill = k === 0 && (wall === 'left' || wall === 'right');
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len < 0.05) continue;
      const seed = rnd.int(1, 1e6);
      const capA = s0 < 0.01 ? (er.next() < 0.5 ? 0 : 3) : -1, capB = s1 > total - 0.01 ? (er.next() < 0.5 ? 0 : 3) : -1;
      // wall frame: X along the wall, origin at the log start
      let m: THREE.Matrix4;
      const sw = s0 + start; // wall coordinate of the segment start
      if (wall === 'front' || wall === 'back') m = tf(sw, y, wall === 'front' ? D / 2 : -D / 2);
      else m = tf(wall === 'left' ? -W / 2 : W / 2, y, -sw, Math.PI / 2); // along -Z after yaw: start at +z side
      ms.push(m);
      const inA = ohA - s0, inB = ohA + along - s0; // interior span in segment coords
      log(ms, len, R * (sill ? 1.12 : rnd.range(0.95, 1.05)), {
        seed, capA, capB, seg: 12, ring: 0.4, taper: 0.04, bend: 0.006, lump: sill ? 0.045 : 0.03,
        breaks: [inA, inB],
        matFor: (xm, n) => {
          if (xm < inA || xm > inB) return 'log_ext';
          // n is in segment-local space; compare with the inward direction in that space
          const wn = n.clone().transformDirection(m);
          return wn.dot(inward) > 0.05 ? 'log_int' : 'log_ext';
        },
      });
      ms.pop();
    }
  };
  for (let k = 0; k < NC; k++) {
    wallLog('left', k, ySide(k));
    wallLog('right', k, ySide(k));
    wallLog('front', k, yEnd(k));
    wallLog('back', k, yEnd(k));
  }
  // chinking: planes recessed between the logs, both faces of every wall, with holes for the openings
  const off = R * 0.58;
  for (const wall of ['front', 'back', 'left', 'right'] as const) {
    const along = wall === 'front' || wall === 'back' ? W : D;
    const yc = wall === 'front' || wall === 'back' ? yEnd : ySide;
    const holes = OPENINGS.filter((o) => o.wall === wall).map((o) => {
      const [y0, y1] = openingY(o);
      return [o.c - o.w / 2, o.c + o.w / 2, y0, y1] as [number, number, number, number];
    });
    const y0 = yc(0), y1 = yc(NC - 1);
    for (const side of [1, -1]) {
      const mat = side > 0 ? 'chink' : 'chink';
      const rects = rectsMinus(-along / 2, along / 2, y0, y1, holes);
      for (const [a, b, c, d] of rects) {
        let p: THREE.Vector3[];
        if (wall === 'front' || wall === 'back') {
          const z = (wall === 'front' ? D / 2 : -D / 2) + side * off * (wall === 'front' ? 1 : -1);
          p = [V(a, c, z), V(b, c, z), V(b, d, z), V(a, d, z)];
          if ((wall === 'front') !== (side > 0)) p = [p[1], p[0], p[3], p[2]];
        } else {
          const x = (wall === 'left' ? -W / 2 : W / 2) + side * off * (wall === 'left' ? -1 : 1);
          p = [V(x, c, -a), V(x, c, -b), V(x, d, -b), V(x, d, -a)];
          if ((wall === 'right') !== (side > 0)) p = [p[1], p[0], p[3], p[2]];
        }
        ms.quad('chink', p[0], p[1], p[2], p[3], [a, c], [b, c], [b, d], [a, d]);
      }
    }
  }
  // colliders: one box per wall (openings left open: the door is handled by its own leaf; windows are high)
  const th = R;
  const hW = W / 2 + R, hD = D / 2 + R;
  const door = OPENINGS[0];
  const dx0 = door.c - door.w / 2, dx1 = door.c + door.w / 2;
  cols.box(0, 1.45, -D / 2, hW, 1.45, th);
  cols.box(-W / 2, 1.45, 0, th, 1.45, hD);
  cols.box(W / 2, 1.45, 0, th, 1.45, hD);
  // front wall: left of the door, right of the door, above the door
  cols.box((-hW + dx0) / 2, 1.45, D / 2, (dx0 + hW) / 2, 1.45, th);
  cols.box((dx1 + hW) / 2, 1.45, D / 2, (hW - dx1) / 2, 1.45, th);
  cols.box(door.c, (openingY(door)[1] + 2.9) / 2, D / 2, door.w / 2, (2.9 - openingY(door)[1]) / 2, th);
}

// ---------------------------------------------------------------------------------------------- openings
function openings(ms: Mesher, glass: string): { door: ReturnType<typeof doorLeaf>; doorPos: THREE.Vector3 } {
  let door: ReturnType<typeof doorLeaf> | null = null;
  let doorPos = V(0, 0, 0);
  for (const o of OPENINGS) {
    const [y0, y1] = openingY(o);
    const h = y1 - y0;
    const depth = 2 * R + 0.01;
    let m: THREE.Matrix4;
    if (o.wall === 'front') m = tf(o.c, (y0 + y1) / 2, D / 2);
    else if (o.wall === 'left') m = tf(-W / 2, (y0 + y1) / 2, -o.c, -Math.PI / 2);
    else if (o.wall === 'right') m = tf(W / 2, (y0 + y1) / 2, o.c, Math.PI / 2);
    else m = tf(-o.c, (y0 + y1) / 2, -D / 2, Math.PI);
    ms.push(m);
    if (o.kind === 'window') {
      windowUnit(ms, { w: o.w, h, depth, glass, seed: Math.round(o.c * 100) + 7, buck: 'board_grey', casingOut: 'board_grey', casingIn: 'board_warm', sash: 'trim_cream' });
    } else {
      doorFrame(ms, { w: o.w, h, depth, seed: 13, buck: 'board_grey', casingOut: 'board_grey', casingIn: 'board_warm' });
      door = doorLeaf({ w: o.w, h, depth, seed: 13, hinge: -1, leafMat: 'planks_grey', ledgeMat: 'board_grey' });
      doorPos = V(o.c - o.w / 2 + 0.05, y0 + 0.01, D / 2 - depth / 2 + 0.01);
    }
    ms.pop();
  }
  return { door: door!, doorPos };
}

// ---------------------------------------------------------------------------------------------- floor + base
function floorAndBase(ms: Mesher, cols: Cols): void {
  const rnd = new Rand(7);
  // floorboards (individual boards along z with tiny height jitter; the texture's boards run along u)
  const bw = 0.16;
  for (let x = IN.x0 - 0.05; x < IN.x1 + 0.05; x += bw) {
    const w = Math.min(bw, IN.x1 + 0.05 - x);
    ms.pushT(x + w / 2, FLOOR - 0.02 + rnd.range(-0.003, 0.003), 0, Math.PI / 2 + rnd.range(-0.002, 0.002));
    box(ms, 'floor', D - 0.05, 0.04, w - 0.004, { grain: 'x', uv: [rnd.range(0, 2), rnd.range(0, 2)], faces: { ny: null } });
    ms.pop();
  }
  // a dark gap under the boards (seen between them)
  ms.quad('board_dark', V(IN.x0 - 0.1, FLOOR - 0.045, D / 2), V(IN.x1 + 0.1, FLOOR - 0.045, D / 2), V(IN.x1 + 0.1, FLOOR - 0.045, -D / 2), V(IN.x0 - 0.1, FLOOR - 0.045, -D / 2),
    [0, 0], [W, 0], [W, D], [0, D]);
  cols.box(0, FLOOR / 2, 0, W / 2, FLOOR / 2, D / 2);
  // the dry-stacked fieldstone footing under the sills
  footing(ms, cols);
}

/** a lumpy fieldstone (jittered icosahedron) */
export function rock(ms: Mesher, rnd: Rand, x: number, y: number, z: number, sx: number, sy: number, sz: number, mat = 'stone'): void {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k == null) { k = rnd.range(0.82, 1.12); seen.set(key, k); }
    let yy = p.getY(i) * k;
    if (yy < -0.3) yy = -0.3 - (yy + 0.3) * 0.2; // flattish bottom
    p.setXYZ(i, p.getX(i) * k, yy, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const o = rnd.range(0, 2);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * sx + p.getZ(i) * sz + o, p.getY(i) * sy + o);
  ms.geom(mat, g, tf(x, y + sy * 0.3, z, rnd.range(0, 6.28), 0, 0).multiply(new THREE.Matrix4().makeScale(sx / 2, sy / 2, sz / 2)));
  g.dispose();
}

// ---------------------------------------------------------------------------------------------- roof
function roof(ms: Mesher, dms: Mesher, cols: Cols, pipe: { x: number; z: number }, detail: number): void {
  const rnd = new Rand(77);
  const hyp = Math.sqrt(1 + K * K);
  // ---- purlins + ridge pole (logs along z, resting on the gable walls, out to the porch truss)
  const purl = [0, -1.2, 1.2];
  for (const x of purl) {
    const rp = x === 0 ? 0.14 : 0.12;
    const y = deckY(x) - rp * 0.9;
    logAB(ms, V(x, y, ZB + 0.05), V(x, y, ZF - 0.12), rp, {
      seed: 300 + x * 10, seg: 10, ring: 0.5, capA: 0, capB: 0, taper: 0.05, bend: 0.004,
      matFor: (_xm, _n) => 'log_ext',
    });
  }
  // interior honey for purlins: (exterior skin is fine: they are inside and outside) -> darken inside with soot via board_dark deck
  // ---- tie beams inside (across x), for hanging things
  for (const z of [-1.05, 1.35]) {
    logAB(ms, V(-W / 2, EAVE - 0.2, z), V(W / 2, EAVE - 0.2, z), 0.12, { seed: 330 + z * 10, seg: 10, capA: -1, capB: -1, matFor: () => 'log_int' });
  }
  // ---- gable fill above the top front/back logs: vertical boards outside, boards inside
  const gTop = yEnd(NC - 1) + R * 0.6;
  for (const zs of [D / 2, -D / 2]) {
    const out = zs > 0 ? 1 : -1;
    const bw = 0.2;
    for (let x = -W / 2 - R; x < W / 2 + R; x += bw) {
      const xa = x, xb = Math.min(x + bw, W / 2 + R);
      const ya = deckY(Math.abs(xa) > Math.abs(xb) ? xa : xb), yb = deckY(Math.abs(xa) < Math.abs(xb) ? xa : xb);
      const yTopA = deckY(xa), yTopB = deckY(xb);
      void ya; void yb;
      const z = zs + out * 0.04;
      const u = rnd.range(0, 3);
      // exterior board (quad with sloped top)
      const a = V(xa, gTop, z), b = V(xb, gTop, z), c = V(xb, yTopB, z), d = V(xa, yTopA, z);
      // vertical boards: grain (texture u) runs up the board
      if (out > 0) ms.quad('planks_grey', a, b, c, d, [gTop, u], [gTop, u + (xb - xa)], [yTopB, u + (xb - xa)], [yTopA, u]);
      else ms.quad('planks_grey', b, a, d, c, [gTop, u], [gTop, u + (xb - xa)], [yTopA, u + (xb - xa)], [yTopB, u]);
      // batten over the joint
      if (xb < W / 2 + R - 0.01) {
        const hb = Math.max(0.05, deckY(xb) - gTop - 0.02);
        boxAt(ms, 'board_grey', xb, gTop + hb / 2, zs + out * 0.055, 0.05, hb, 0.022, 0, { grain: 'y', uv: [rnd.range(0, 2), 0] });
      }
      // interior face
      const zi = zs - out * 0.04;
      const ai = V(xa, gTop, zi), bi = V(xb, gTop, zi), ci = V(xb, yTopB, zi), di = V(xa, yTopA, zi);
      if (out > 0) ms.quad('board_dark', bi, ai, di, ci, [gTop, u], [gTop, u + (xb - xa)], [yTopA, u + (xb - xa)], [yTopB, u]);
      else ms.quad('board_dark', ai, bi, ci, di, [gTop, u], [gTop, u + (xb - xa)], [yTopB, u + (xb - xa)], [yTopA, u]);
    }
  }
  // ---- roof boards (underside, seen from inside and from the porch)
  for (const s of [-1, 1]) {
    const x0 = 0, x1 = s * XE;
    const y0 = deckY(0), y1 = deckY(XE) - K * 0; // eave edge
    const a = V(x0, y0, ZB), b = V(x1, deckY(XE), ZB), c = V(x1, deckY(XE), ZF), d = V(x0, y0, ZF);
    const L = XE * hyp;
    if (s > 0) ms.quad('board_dark', a, b, c, d, [0, 0], [0, L], [ZF - ZB, L], [ZF - ZB, 0]);
    else ms.quad('board_dark', a, d, c, b, [0, 0], [ZF - ZB, 0], [ZF - ZB, L], [0, L]);
    void y1;
    // eave fascia and the underside of the eave edge
    const fx = s * XE;
    const fy0 = deckY(XE) - 0.1, fy1 = deckY(XE) + ROOF_T + 0.04;
    ms.pushT(fx + s * 0.012, (fy0 + fy1) / 2, (ZB + ZF) / 2);
    box(ms, 'board_grey', 0.025, fy1 - fy0, ZF - ZB + 0.08, { grain: 'z', uv: [rnd.range(0, 2), 0] });
    ms.pop();
    // rake (barge) boards along both gable ends
    for (const z of [ZB - 0.02, ZF + 0.02]) {
      const a0 = V(0, RIDGE + ROOF_T + 0.06, z), a1 = V(s * (XE + 0.02), deckY(XE) + ROOF_T + 0.06, z);
      const len = a0.distanceTo(a1);
      const ang = Math.atan2(a1.y - a0.y, a1.x - a0.x);
      ms.pushT((a0.x + a1.x) / 2, (a0.y + a1.y) / 2 - 0.06, z, 0, 0, ang);
      box(ms, 'board_grey', len, 0.2, 0.03, { grain: 'x', uv: [rnd.range(0, 2), 0] });
      ms.pop();
    }
  }
  // green ribbed steel over the deck (moss, needles, soot, a dead branch)
  tinRoof(ms, dms, pipe, detail > 0);
  // ---- stovepipe through the roof: flashing boot, storm collar, rain cap on three legs
  {
    const y = deckY(pipe.x) + ROOF_T + 0.05;
    const ang = Math.atan(K);
    ms.pushT(pipe.x, y, pipe.z, 0, 0, -ang);
    box(ms, 'galv', 0.5, 0.012, 0.5, { uv: [rnd.range(0, 2), 0] });
    ms.pop();
    ms.pushT(pipe.x, y, pipe.z);
    lathe(ms, 'galv', [[0.16, 0.0], [0.1, 0.14], [0.085, 0.2], [0.085, 0.22]], 14);
    ms.pop();
    const top = RIDGE + 0.55;
    ms.pushT(pipe.x, top, pipe.z, 0, 0, 0.04);
    // the rain cap: tarred black with creosote, a bit crooked
    lathe(ms, 'soot', [[0.0, 0.16], [0.17, 0.08], [0.18, 0.065], [0.0, 0.07]].reverse() as [number, number][], 14);
    lathe(ms, 'soot', [[0.0, 0.07], [0.18, 0.065], [0.17, 0.08], [0.0, 0.16]], 14);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      boxAt(ms, 'soot', Math.cos(a) * 0.09, 0.04, Math.sin(a) * 0.09, 0.012, 0.09, 0.02, -a);
    }
    ms.pop();
    // guy wires from a band on the pipe to the ridge, against the winter wind
    const band = top - 0.35;
    boxAt(ms, 'iron', pipe.x, band, pipe.z, 0.19, 0.03, 0.19);
    for (const dz of [-1.1, 1.0]) tube(ms, 'iron', [V(pipe.x, band, pipe.z), V(0.02, RIDGE + ROOF_T + 0.08, pipe.z + dz)], 0.003, 3, { smooth: false });
  }
  // roof colliders: one convex hull per slope (things can land on it; the porch roof stops jumps)
  for (const s of [-1, 1]) {
    const pts: number[] = [];
    for (const [x, y] of [[0, RIDGE + ROOF_T + 0.06], [s * XE, deckY(XE) + ROOF_T + 0.04]] as [number, number][]) {
      for (const z of [ZB, ZF]) pts.push(x, y, z, x, y - 0.14, z);
    }
    cols.hull(pts);
  }
}

// ---------------------------------------------------------------------------------------------- porch
function porch(ms: Mesher, cols: Cols): void {
  const rnd = new Rand(55);
  const z0 = D / 2 + R + 0.01, z1 = D / 2 + PORCH;
  const x0 = -W / 2 - R - 0.02, x1 = W / 2 + R + 0.02;
  const deck = FLOOR;
  // forty winters: the front rim has settled, so the deck sags toward the middle of the front edge
  const sag = (x: number, z: number) => -0.045 * (1 - Math.pow((x - (x0 + x1) / 2) / ((x1 - x0) / 2), 2)) * Math.max(0, (z - z0) / (z1 - z0));
  // joists: logs along z under the deck, a rim log along x at the front (bowed down in the middle)
  for (const x of [x0 + 0.12, -1.2, 0, 1.2, x1 - 0.12]) {
    logAB(ms, V(x, deck - 0.14, z0 - 0.1), V(x, deck - 0.14 + sag(x, z1), z1 + 0.05), 0.1, { seed: 500 + x * 7, seg: 8, capA: -1, capB: 0 });
  }
  {
    const pts = [V(x0 - 0.25, deck - 0.16, z1 - 0.05), V(0, deck - 0.16 - 0.04, z1 - 0.05), V(x1 + 0.25, deck - 0.16, z1 - 0.05)];
    tube(ms, 'log_ext', pts, 0.13, 10);
    for (const p of [pts[0], pts[2]]) { ms.pushT(p.x, p.y, p.z, Math.PI / 2 * (p.x < 0 ? 1 : -1)); ms.pop(); }
  }
  // deck boards along z (drain away from the wall), worn grey, two replaced with newer lumber, one cracked short
  const bw = 0.145;
  let bi = 0;
  for (let x = x0; x < x1 - 0.02; x += bw, bi++) {
    const w = Math.min(bw - 0.012, x1 - x);
    const xc = x + w / 2;
    let len = z1 + 0.06 - z0 + rnd.range(-0.03, 0.02);
    const fresh = bi === 7 || bi === 21;
    if (bi === 14) len -= 0.32; // the broken one: a gap at the front edge you can see the dirt through
    const dropF = sag(xc, z1);
    const tilt = Math.atan2(-dropF, len);
    ms.pushT(xc, deck - 0.018 + rnd.range(-0.004, 0.004), z0, Math.PI / 2 + rnd.range(-0.006, 0.006), tilt, rnd.range(-0.012, 0.012));
    ms.pushT(len / 2, 0, 0);
    box(ms, fresh ? 'board_warm' : 'planks_grey', len, 0.036, w, { grain: 'x', uv: [rnd.range(0, 2), rnd.range(0, 2)] });
    ms.pop();
    // nail heads at the joists (a few popped up)
    for (const nz of [0.05, len - 0.06]) boxAt(ms, 'iron', nz, 0.019 + (rnd.next() < 0.1 ? 0.006 : 0), 0, 0.012, 0.004 + (rnd.next() < 0.1 ? 0.01 : 0), 0.012);
    ms.pop();
  }
  // stacked fieldstone piers under the rim log and the joist ends
  for (const x of [x0 - 0.1, -1.2, 0, 1.2, x1 + 0.1]) {
    const top = deck - 0.16 - 0.13 + sag(x, z1) * 0.8;
    fieldstone(ms, rnd, x, -0.05, top * 0.55, z1 - 0.05, 0.42, 0.4, rnd.range(0, 3));
    fieldstone(ms, rnd, x + rnd.range(-0.03, 0.03), top * 0.55 - 0.01, top + 0.01, z1 - 0.05, 0.32, 0.3, rnd.range(0, 3));
  }
  // half-log steps up to the door: three risers of ~0.19 m on stone
  const door = OPENINGS[0];
  const nSteps = Math.max(2, Math.round(deck / 0.19));
  for (let i = 0; i < nSteps - 1; i++) {
    const zz = z1 + 0.2 + i * 0.3;
    const top = deck - (deck / nSteps) * (i + 1);
    const sw = 1.24 - i * 0.06;
    ms.pushT(door.c - sw / 2 + rnd.range(-0.03, 0.03), 0, zz, rnd.range(-0.03, 0.03));
    halfLog(ms, rnd, sw, 0.16, top, 900 + i);
    ms.pop();
    fieldstone(ms, rnd, door.c - sw / 2 + 0.15, -0.04, top - 0.12, zz, 0.3, 0.3, rnd.range(0, 3));
    fieldstone(ms, rnd, door.c + sw / 2 - 0.15, -0.04, top - 0.12, zz, 0.3, 0.3, rnd.range(0, 3));
    cols.box(door.c, top / 2, zz, sw / 2, top / 2, 0.16);
  }
  // posts and the porch front beam/side plates (the left post leans a little and has a shim under it)
  const postX = [-W / 2 - 0.02, W / 2 + 0.02];
  for (const x of postX) {
    const lean = x < 0 ? 0.035 : 0.0;
    logAB(ms, V(x, deck - 0.02 + sag(x, z1), z1 - 0.08), V(x + lean + rnd.range(-0.01, 0.01), EAVE - 0.14, z1 - 0.08), 0.1, { seed: 610 + x, seg: 9, capA: -1, capB: -1, taper: 0.1 });
    cols.box(x, (deck + EAVE) / 2, z1 - 0.08, 0.1, (EAVE - deck) / 2, 0.1);
  }
  boxAt(ms, 'wood_fresh', -W / 2 - 0.02, deck + sag(-W / 2, z1) - 0.005, z1 - 0.08, 0.16, 0.018, 0.07, 0.3);
  // middle post off-centre (between the steps and the chair)
  logAB(ms, V(0.32, deck - 0.02 + sag(0.32, z1), z1 - 0.08), V(0.32, EAVE - 0.14, z1 - 0.08), 0.09, { seed: 615, seg: 9, capA: -1, capB: -1, taper: 0.1 });
  cols.box(0.32, (deck + EAVE) / 2, z1 - 0.08, 0.09, (EAVE - deck) / 2, 0.09);
  // front beam at plate height, side plates continuing the walls' top logs
  logAB(ms, V(-XE - 0.1, EAVE - 0.07, z1 - 0.08), V(XE + 0.1, EAVE - 0.07, z1 - 0.08), 0.13, { seed: 620, seg: 10, capA: 0, capB: 0, bend: 0.004 });
  for (const x of postX) logAB(ms, V(x, EAVE - 0.07, D / 2 + OH), V(x, EAVE - 0.07, z1 + 0.1), 0.12, { seed: 630 + x, seg: 10, capA: -1, capB: 0 });
  // open gable truss at the porch front: king post from the beam to the ridge, two struts
  logAB(ms, V(0, EAVE + 0.02, z1 - 0.08), V(0, RIDGE - 0.2, z1 - 0.08), 0.085, { seed: 640, seg: 8, capA: -1, capB: -1 });
  for (const s of [-1, 1]) logAB(ms, V(0, EAVE + 0.5, z1 - 0.08), V(s * 1.2, deckY(1.2) - 0.2, z1 - 0.08), 0.07, { seed: 645 + s, seg: 8, capA: -1, capB: -1 });
  // railing on the right part of the porch and both ends: two rails of peeled poles + a few balusters
  const rail = (a: THREE.Vector3, b: THREE.Vector3, seed: number) => logAB(ms, a, b, 0.042, { seed, seg: 7, capA: 0, capB: 0, ring: 0.6, lump: 0.05, bend: 0.01 });
  const ry = [deck + 0.48, deck + 0.92];
  for (const y of ry) {
    rail(V(0.32, y + sag(0.32, z1), z1 - 0.08), V(W / 2 + 0.02, y, z1 - 0.08), 700 + y * 10);
    rail(V(W / 2 + 0.02, y, z1 - 0.08), V(W / 2 + 0.02, y, D / 2 + R + 0.05), 710 + y * 10);
    rail(V(-W / 2 - 0.02, y, z1 - 0.08), V(-W / 2 - 0.02, y, D / 2 + R + 0.05), 720 + y * 10);
  }
  // balusters: crooked peeled saplings between the rails
  for (const [xa, za, xb, zb] of [[0.32, z1 - 0.08, W / 2 + 0.02, z1 - 0.08], [W / 2 + 0.02, z1 - 0.08, W / 2 + 0.02, D / 2 + R + 0.05], [-W / 2 - 0.02, z1 - 0.08, -W / 2 - 0.02, D / 2 + R + 0.05]] as [number, number, number, number][]) {
    const n = Math.floor(Math.hypot(xb - xa, zb - za) / 0.42);
    for (let k = 1; k < n; k++) {
      const t = k / n + rnd.range(-0.03, 0.03), x = xa + (xb - xa) * t, z = za + (zb - za) * t;
      logAB(ms, V(x, deck + sag(x, z), z), V(x + rnd.range(-0.03, 0.03), deck + 0.95, z + rnd.range(-0.02, 0.02)), 0.026, { seed: 760 + k * 3 + xa * 10, seg: 6, capA: -1, capB: 0, lump: 0.08, bend: 0.03 });
    }
  }
  cols.box((0.32 + W / 2) / 2, deck + 0.5, z1 - 0.08, (W / 2 - 0.32) / 2, 0.5, 0.05);
  cols.box(W / 2 + 0.02, deck + 0.5, (z1 + D / 2) / 2, 0.05, 0.5, (z1 - D / 2) / 2);
  cols.box(-W / 2 - 0.02, deck + 0.5, (z1 + D / 2) / 2, 0.05, 0.5, (z1 - D / 2) / 2);
  // deck collider
  cols.box((x0 + x1) / 2, deck / 2, (z0 + z1) / 2, (x1 - x0) / 2, deck / 2, (z1 - z0) / 2 + 0.05);
}

/** a half log (flat face up) along +X, top at height y */
export function halfLog(ms: Mesher, rnd: Rand, len: number, r: number, y: number, seed: number, mat = 'planks_grey'): void {
  ms.pushT(0, y - 0.01, 0);
  // round part: lower half of a log (use log() and rely on the flat top to hide the upper half)
  log(ms, len, r, { seed, seg: 12, capA: 3, capB: 3, matFor: (_x, n) => (n.y > 0.2 ? mat : 'log_ext') });
  ms.pop();
  // flat top
  boxAt(ms, mat, len / 2, y + 0.0, 0, len, 0.02, r * 1.9, 0, { grain: 'x', uv: [rnd.range(0, 2), rnd.range(0, 2)], faces: { ny: null } });
}

// ---------------------------------------------------------------------------------------------- build
export async function buildCabin(): Promise<Place> {
  const sp = SPOTS.cabin;
  const rot = sp.rot ?? 0;
  const gy = heightAt(sp.x, sp.z);
  const group = new THREE.Group();
  group.name = 'cabin';
  group.position.set(sp.x, gy, sp.z);
  group.rotation.y = rot;
  const ms = new Mesher();
  const cols = new Cols();
  const anchors: Record<string, THREE.Object3D> = {};
  const lights: THREE.Light[] = [];
  const updaters: ((dt: number) => void)[] = [];

  ensureCabinTex();
  const detail = detailTier();
  const glass = 'cab_glass';
  const dms = new Mesher(); // decals: grime, moss, soot, needles (no shadows, no raycasts)
  const hAt = (lx: number, lz: number) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return heightAt(sp.x + c * lx + s * lz, sp.z - s * lx + c * lz) - gy;
  };
  const stoveAt = { x: 1.45, z: -2.2 };
  walls(ms, cols);
  const { door, doorPos } = openings(ms, glass);
  floorAndBase(ms, cols);
  roof(ms, dms, cols, { x: stoveAt.x, z: stoveAt.z - STOVE.L / 2 + 0.2 }, detail);
  porch(ms, cols);
  gutters(ms, dms, cols, hAt);

  // ---- door, and the screen door outside it that swings out when the plank door swings in
  door.pivot.position.copy(doorPos);
  group.add(door.pivot);
  const doorCtl = hingedDoor(door.pivot, { openAngle: 1.75, onSound: (open) => door.pivot.userData.game?.sound?.(open ? 'door_open' : 'door_close') });
  updaters.push((dt) => doorCtl.update(dt));
  anchors.door = anchor(group, 'door', OPENINGS[0].c, FLOOR, D / 2 + 0.6, 0);
  anchors.door.userData.interactable = doorCtl;
  {
    const o = OPENINGS[0];
    const [y0, y1] = openingY(o);
    const depth = 2 * R + 0.01;
    const sd = screenDoor(o.w + 0.04, y1 - y0 + 0.03);
    sd.position.set(o.c - o.w / 2 - 0.02, y0 + 0.005, D / 2 + depth / 2 + 0.045);
    group.add(sd);
    registerInteractable(sd, doorCtl);
    updaters.push(() => { sd.rotation.y = -Math.min(1.5, Math.max(0, door.pivot.rotation.y)) * 0.92; });
  }

  // ---- stove
  const stove = buildStove({ pipeTop: deckY(stoveAt.x) + 0.1, seed: 9 });
  stove.group.position.set(stoveAt.x, FLOOR + 0.1, stoveAt.z);
  group.add(stove.group);
  lights.push(stove.light);
  updaters.push((dt) => stove.update(dt));
  anchors.stove = stove.door;
  anchors.stove_fire = stove.fire;
  anchors.stove_top = stove.top;

  // ---- interior dressing (furniture, hearth, bunk, shelves, wall things) + woodyard + fire pit
  const dress = await dressing({ ms, dms, cols, group, anchors, lights, updaters, stoveAt, glass, detail, hAt });

  // ---- static mesh
  const mesh = ms.build({ name: 'cabin_static' });
  group.add(mesh);
  group.add(noRay(dms.build({ name: 'cabin_decals', cast: false })));

  // ---- lamps: table lantern (shadowed), ceiling fill, window spill
  const fill = new THREE.PointLight(0xffb070, 0.9, 3.4, 1.5);
  fill.position.set(0, 2.55, 0.2);
  group.add(fill);
  lights.push(fill);
  const spill: THREE.SpotLight[] = [];
  for (const o of OPENINGS.filter((q) => q.kind === 'window')) {
    const [y0, y1] = openingY(o);
    const sl = new THREE.SpotLight(0xffa860, 0, 7, 0.55, 0.8, 1.6);
    if (o.wall === 'front') { sl.position.set(o.c, (y0 + y1) / 2, D / 2 - 0.1); sl.target.position.set(o.c, 0, D / 2 + 3.5); }
    else { sl.position.set(-W / 2 + 0.1, (y0 + y1) / 2, -o.c); sl.target.position.set(-W / 2 - 3.5, 0, -o.c); }
    group.add(sl, sl.target);
    spill.push(sl);
    lights.push(sl);
  }
  let lamp = 1;
  const glassM = cabinGlass();
  let t = 0;
  updaters.push((dt) => {
    t += dt;
    const f = flicker(t, 1.7);
    dress.lantern.intensity = 4.2 * lamp * (0.94 + 0.06 * f);
    fill.intensity = 0.9 * lamp;
    for (const s of spill) s.intensity = 5 * lamp * (0.6 + 0.4 * stove.level);
    glassM.emissiveIntensity = 1.3 * lamp;
    dress.porchLamp.intensity = 3.2 * lamp * (0.92 + 0.08 * f);
  });

  // ---- interior volume, anchors
  const interior = interiorBoxes(sp.x, gy, sp.z, rot, IN.x0, IN.x1, IN.z0, IN.z1, FLOOR - 0.1, RIDGE);
  anchors.porch = anchor(group, 'porch', -0.9, FLOOR, D / 2 + 1.0, 0);
  const tmp = new THREE.Vector3();
  void tmp;

  // lights far from the camera go dark and stop rendering shadows (applied after every other updater)
  const cull = lightCuller(new THREE.Vector3(sp.x, gy + 1.5, sp.z), lights, 80);
  updaters.push(() => {
    const k = cull();
    if (k < 1) for (const l of lights) l.intensity *= k;
  });

  const place: Place = {
    group,
    colliders: cols.toWorld(sp.x, gy, sp.z, rot),
    anchors,
    lights,
    stove: { setFire: (l: number) => stove.setFire(l) },
    update: (dt: number) => { for (const u of updaters) u(dt); },
    interior,
    setThermometer: dress.setThermometer,
    setLamps: (l: number) => { lamp = Math.max(0, Math.min(1, l)); },
  };
  return place;
}

