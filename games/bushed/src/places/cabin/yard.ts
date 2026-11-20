// Ray's yard: forty years of a bush camp nobody ever cleaned up, laid out the way it grew.
//   back left   the outhouse with the moon (door ajar, the coffee can for the roll), the wash on a sagging line
//               that moves in the wind (red union suit, plaid shirts, jeans, a sheet, socks)
//   road side   the big 1990s C-band dish on its pipe post, cable run to the window; the canoe upside down on
//               sawhorses with the paddles; the dead snowmobile nosed into the weeds by the driveway
//   back right  a cordwood row capped with old tin and rocks, the fridge roped shut, the burn barrel
//   right       the tarp over the lumber pile (tires and rope holding it), coffee cans of nails on a crate,
//               the wheelbarrow, jerry cans, the trash can with a rock on the lid (bears), a propane bottle
//   woodyard    a heap of rounds waiting, bark and chips everywhere, the peavey on the shed post
//   fire pit    two stump seats more, a webbed lawn chair, a grill across the stones, the black coffee pot
// Coordinates: the cabin's local frame. Everything static is merged; the wash has its own wind shader.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, board, log, logAB, lathe, extrude, defineMat, hasMat, placeMat } from '../kit';
import { ltube as tube } from './bake';
import { writeRound, writeSplit } from '../products';
import { G } from '../../gfx/globals';
import type { DressCtx } from '../dressing';
import { CLOTH } from './tex';
import { fieldstone } from './structure';
import {
  bakeProduct, bakeProp, tire, lowSplit, cellBox, cellLathe, cellTube, cellGeom, cellUV, atlasQuad, groundDecal, tuft, noRay, farCull,
} from './bake';

type HAt = (x: number, z: number) => number;

export async function cabinYard(c: DressCtx): Promise<void> {
  const ms = c.xms ?? new Mesher();
  const r = new Rand(31337);
  const hA = c.hAt;
  const pending: Promise<unknown>[] = [];
  const hi = c.detail > 0, full = c.detail > 1;
  const weeds = (x: number, z: number, n: number, rad: number, fire = 0.15) => {
    if (!hi) return;
    for (let k = 0; k < n * (full ? 1 : 0.5); k++) {
      const a = r.range(0, 6.28), d = r.range(0.2, 1) * rad;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      tuft(ms, r, r.next() < fire ? 'fireweed' : 'weeds', px, hA(px, pz) - 0.02, pz, r.range(0.35, 0.7), r.range(0.3, 0.75));
    }
  };

  outhouse(ms, c, -6.0, -9.6, 0.55, r);
  weeds(-6.0, -9.6, 14, 1.6, 0.3);
  const wash = clothesline(c, -4.3, -5.1, -10.6, -2.9);
  satelliteDish(ms, c, -7.9, 0.9, 0.6);
  weeds(-7.9, 0.9, 10, 0.9, 0.1);
  canoe(ms, c, -6.4, 9.2, 0.35);
  weeds(-6.4, 9.2, 8, 2.0, 0.1);
  snowmobile(ms, c, -9.6, -5.8, 0.5);
  weeds(-9.6, -5.8, 16, 1.6, 0.25);
  // ---- back right: cordwood row under old tin, the fridge, the burn barrel
  cordRow(ms, c, 4.6, 8.4, -6.4, r);
  weeds(6.5, -7.0, 10, 2.2, 0.3);
  fridge(ms, c, 9.7, -4.6, -0.5);
  weeds(9.7, -4.6, 8, 1.0, 0.2);
  burnBarrel(ms, c, 2.6, -8.2);
  // ---- right side: tarp pile, crate of cans, wheelbarrow, jerry cans, trash can, propane
  tarpPile(ms, c, 6.6, -2.4, 0.25, pending);
  weeds(6.6, -2.4, 8, 1.8);
  {
    // a crate standing on end by the tarp pile with three coffee cans of nails and spikes on it
    pending.push(bakeProp(ms, 'wooden_crate_01', 5.0, hA(5.0, -0.9), -0.9, 1.3));
    for (let k = 0; k < 3; k++) nailCan(ms, 4.85 + k * 0.17 - (k === 2 ? 0.25 : 0), hA(5, -0.9) + 0.35, -0.95 + (k === 2 ? 0.14 : 0) + r.range(-0.03, 0.03));
    nailCan(ms, 5.35, hA(5.35, -0.4), -0.4, true);
    c.cols.box(5.0, hA(5, -0.9) + 0.18, -0.9, 0.42, 0.18, 0.22, -1.3);
  }
  wheelbarrow(ms, c, 9.8, 4.9, 2.4);
  weeds(9.8, 4.9, 6, 0.9);
  pending.push(bakeProp(ms, 'metal_jerrycan', 8.1, hA(8.1, -1.1), -1.1, 0.4));
  pending.push(bakeProp(ms, 'metal_jerrycan', 8.45, hA(8.45, -1.0), -1.0, 0.1));
  gasCan(ms, 8.3, hA(8.3, -0.55), -0.55, 1.2);
  c.cols.box(8.3, hA(8.3, -0.9) + 0.22, -0.9, 0.35, 0.22, 0.3, 0.3);
  pending.push(bakeProp(ms, 'metal_trash_can_rust', 3.45, hA(3.45, 4.15), 4.15, -0.3, 0, 0, 0.85));
  fieldstone(ms, r, 3.45, hA(3.45, 4.15) + 0.77, hA(3.45, 4.15) + 0.92, 4.15, 0.3, 0.26, 0.4);
  c.cols.box(3.45, 0.4, 4.15, 0.34, 0.4, 0.26, -0.3);
  propane(ms, 3.05, hA(3.05, -1.95), -1.95);
  cellTube(ms, 'cab_paint', 'paint', 'copper', [V(3.05, 1.05, -1.95), V(2.9, 1.1, -1.85), V(2.75, 1.0, -1.75)], 0.006, 4);
  c.cols.box(3.05, 0.6, -1.95, 0.2, 0.6, 0.2);
  wallWood(ms, c);
  fuelDrum(ms, c, -10.4, -1.2, 0.4);
  weeds(-10.4, -1.2, 8, 1.2);
  tireStack(ms, c, 11.6, -2.6, pending);
  workbench(ms, c, 8.2, 1.6, -0.3, r, pending);
  weeds(11.6, -2.6, 6, 0.8);
  // ---- the woodyard: a heap of rounds waiting by the block, the peavey, bark and chips spread wide
  roundsHeap(ms, c, 10.6, 5.9, r);
  {
    // the peavey leaning on the sawbuck side of the shed
    const px = 11.3, pz = -0.9;
    cellTube(ms, 'cab_paint', 'paint', 'wood_grey', [V(px, hA(px, pz), pz), V(px + 0.25, hA(px, pz) + 1.35, pz - 0.18)], 0.025, 5, 3);
    cellTube(ms, 'cab_paint', 'paint', 'steel', [V(px + 0.22, hA(px, pz) + 1.2, pz - 0.16), V(px + 0.28, hA(px, pz) + 1.42, pz - 0.2)], 0.03, 5, 2);
    cellTube(ms, 'cab_paint', 'paint', 'steel', [V(px + 0.26, hA(px, pz) + 1.3, pz - 0.18), V(px + 0.4, hA(px, pz) + 1.35, pz - 0.1), V(px + 0.45, hA(px, pz) + 1.2, pz - 0.05)], 0.012, 4);
  }
  // ---- fire pit additions (pit centre at 3.6, 8.3)
  firePitExtras(ms, c, 3.6, 8.3, r, pending);

  // ---- ground: chips and bark round the woodyard, oil under the sled, scorch at the barrel, leaves
  {
    const d = c.dms;
    for (let k = 0; k < 7; k++) groundDecal(d, 'chips', 11.6 + r.range(-1.6, 1.6), 3.0 + r.range(-1.8, 2.8), r.range(1.4, 2.4), r.range(1.4, 2.4), r.range(0, 6), hA, 0.017, 3);
    for (let k = 0; k < 4; k++) groundDecal(d, 'chips', 0.9 + 3.2 + r.range(-0.5, 0.5), 4.4 + r.range(-0.4, 0.4), 1.4, 1.4, r.range(0, 6), hA, 0.017, 2);
    groundDecal(d, 'oil', -9.4, -5.7, 1.2, 1.0, 0.3, hA, 0.016, 2);
    groundDecal(d, 'scorch', 2.6, -8.2, 1.8, 1.8, 0.4, hA, 0.016, 3);
    groundDecal(d, 'ash', 2.75, -8.0, 1.2, 1.2, 1.4, hA, 0.018, 2);
    groundDecal(d, 'ash', 3.6, 8.3, 2.4, 2.4, 0.5, hA, 0.018, 3);
    for (let k = 0; k < 18; k++) {
      const x = r.range(-12, 13), z = r.range(-11, 13);
      if (Math.abs(x) < 3.3 && Math.abs(z) < 5.5) continue;
      groundDecal(d, k % 3 ? 'leaves' : 'needles', x, z, r.range(0.8, 1.6), r.range(0.8, 1.6), r.range(0, 6), hA, 0.014, 2);
    }
    groundDecal(d, 'mud', 9.8, 5.3, 1.2, 1.0, 0.4, hA, 0.016, 2);
    groundDecal(d, 'path', -6.0, -8.4, 1.4, 1.4, 0.4, hA, 0.017, 2);
  }

  await Promise.all(pending);
  if (!c.xms) {
    const g = noRay(ms.build({ name: 'cabin_yard', noCast: ['cab_card'] }));
    c.group.add(g);
    c.updaters.push(farCull(g, V(0, 1, 0), full ? 170 : 110));
  }
  if (wash) {
    c.group.add(wash);
    c.updaters.push(farCull(wash, V(-7.4, 1.5, -4), 90));
  }
}

// ---------------------------------------------------------------------------------------------- outhouse
function outhouse(ms: Mesher, c: DressCtx, x: number, z: number, ry: number, r: Rand): void {
  const g = c.hAt(x, z);
  const w = 1.15, d = 1.25, hf = 2.25, hb = 1.95;
  ms.pushT(x, g, z, ry);
  // skids and floor
  for (const sx of [-w / 2 + 0.08, w / 2 - 0.08]) logAB(ms, V(sx, 0.05, -d / 2 - 0.1), V(sx, 0.05, d / 2 + 0.1), 0.07, { seed: 4000 + sx * 10, seg: 7, capA: 0, capB: 0 });
  board(ms, 'planks_grey', r, 0, 0.13, 0, w, 0.03, d, 0, { grain: 'z' });
  // walls: vertical rough boards with battens, the front with the door opening
  const wall = (len: number, h0: number, h1: number, place: (s: number) => [number, number, number], ry2: number, skip?: [number, number]) => {
    const bw = 0.19;
    for (let s = 0; s < len - 0.01; s += bw) {
      const m = s + bw / 2;
      if (skip && m > skip[0] && m < skip[1]) continue;
      const hh = h0 + (h1 - h0) * (m / len) + r.range(-0.03, 0.02);
      const [px, py, pz] = place(m);
      board(ms, 'board_grey', r, px, py + hh / 2, pz, bw - 0.012, hh, 0.022, ry2, { grain: 'y' });
    }
  };
  wall(d, hf, hb, (m) => [-w / 2, 0.14, d / 2 - m], Math.PI / 2);
  wall(d, hf, hb, (m) => [w / 2, 0.14, d / 2 - m], Math.PI / 2);
  wall(w, hb, hb, (m) => [-w / 2 + m, 0.14, -d / 2], 0);
  wall(w, hf, hf, (m) => [-w / 2 + m, 0.14, d / 2], 0, [0.22, 0.98]);
  // door: planks, a Z brace, the crescent moon cut out, left ajar on leather hinges
  {
    const dw = 0.72, dh = 1.85;
    ms.pushT(-w / 2 + 0.2, 0.17, d / 2 + 0.02, -0.55);
    const moon = new THREE.Shape();
    moon.moveTo(-dw / 2, 0); moon.lineTo(dw / 2, 0); moon.lineTo(dw / 2, dh); moon.lineTo(-dw / 2, dh); moon.lineTo(-dw / 2, 0);
    const hole = new THREE.Path();
    const cx = 0, cy = dh - 0.32, R0 = 0.11;
    for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + (k / 16) * Math.PI * 2 * 0.5 + Math.PI; hole.lineTo(cx + Math.cos(a) * R0 * (k === 0 ? 1 : 1), cy + Math.sin(a) * R0); }
    for (let k = 16; k >= 0; k--) { const a = -Math.PI / 2 + (k / 16) * Math.PI + Math.PI; hole.lineTo(cx + 0.06 + Math.cos(a) * R0 * 0.75, cy + Math.sin(a) * R0 * 0.95); }
    moon.holes.push(hole);
    ms.pushT(dw / 2, 0, 0);
    extrude(ms, 'board_grey', moon, 0.025, { curveSegments: 4 });
    // battens and brace on the inside
    for (const y of [0.3, dh - 0.55]) boxAt(ms, 'board_grey', 0, y, -0.012, dw - 0.06, 0.1, 0.02);
    ms.pushT(0, dh / 2 - 0.12, -0.012, 0, 0, 0.62);
    box(ms, 'board_grey', 1.2, 0.09, 0.02);
    ms.pop();
    // a wooden turn-button latch and a spool handle
    boxAt(ms, 'board_dark', dw / 2 - 0.08, 1.0, 0.03, 0.03, 0.08, 0.03);
    ms.pop();
    ms.pop();
  }
  // shed roof of tar paper on boards, battens over the laps
  {
    const yF = 0.14 + hf + 0.06, yB = 0.14 + hb + 0.06, ov = 0.18;
    const L = Math.hypot(d + 2 * ov, yF - yB), ang = Math.atan2(yF - yB, d + 2 * ov);
    ms.pushT(0, (yF + yB) / 2, 0, 0, ang);
    cellBox(ms, 'cab_paint', 'paint', 'tarpaper', 0, 0, 0, w + 0.3, 0.04, L);
    for (const sx of [-0.3, 0, 0.3]) boxAt(ms, 'board_grey', sx, 0.03, 0, 0.04, 0.02, L);
    ms.pop();
  }
  // a licence plate nailed over the moon, a toilet-roll coffee can on a nail inside, a vent pipe
  ms.pushT(-w / 2 + 0.75, 0.14 + hf - 0.25, d / 2 + 0.014);
  atlasQuad(ms, 'cab_paper', 'paper', 'plate', 0.3, 0.15);
  ms.pop();
  cellLathe(ms, 'cab_paint', 'paint', 'coffee_can', [[0, 0], [0.07, 0], [0.07, 0.15], [0, 0.15]], 10, new THREE.Matrix4().makeTranslation(0.35, 1.0, -d / 2 + 0.12));
  // the seat bench inside with the hole
  board(ms, 'board_grey', r, 0, 0.58, -d / 2 + 0.3, w - 0.05, 0.03, 0.55, 0, { grain: 'x' });
  board(ms, 'board_grey', r, 0, 0.36, -d / 2 + 0.57, w - 0.05, 0.44, 0.022, 0, { grain: 'x' });
  ms.pushT(0, 0.596, -d / 2 + 0.28, 0, -Math.PI / 2);
  ms.push(new THREE.Matrix4().makeScale(1, 0.8, 1));
  lathe(ms, 'soot', [[0.12, 0], [0, 0.001]], 9);
  ms.pop(); ms.pop();
  // a snow shovel leaning on the side
  ms.pushT(w / 2 + 0.12, 0.0, 0.2, Math.PI / 2, 0, -0.2);
  tube(ms, 'board_warm', [V(0, 0.3, 0), V(0, 1.4, 0)], 0.015, 5);
  cellBox(ms, 'cab_paint', 'paint', 'grey_plastic', 0, 0.18, 0.03, 0.45, 0.36, 0.02);
  ms.pop();
  ms.pop();
  c.cols.box(x, g + 1.1, z, w / 2 + 0.03, 1.1, d / 2 + 0.03, ry);
}

// ---------------------------------------------------------------------------------------------- the wash
let washMat: THREE.MeshStandardMaterial | null = null;
/** the clothes on the line: the cloth atlas with a vertex wind sway below the line (no shadow) */
function wash(L: number, y0: number, sag: number): THREE.MeshStandardMaterial {
  const base = placeMat('cab_cloth') as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ name: 'cab_wash', map: base.map, roughness: 1, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.uTime;
    sh.uniforms.uWind = G.uWindStrength;
    sh.uniforms.uLine = { value: new THREE.Vector3(y0, sag, L) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform float uWind; uniform vec3 uLine;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float lt = clamp(transformed.x / uLine.z, 0.0, 1.0);
        float ly = uLine.x - uLine.y * 4.0 * lt * (1.0 - lt);
        float w = clamp((ly - transformed.y) / 0.9, 0.0, 1.0);
        w *= w;
        float ph = transformed.x * 1.9;
        float gust = 0.55 + 0.45 * sin(uTime * 0.37 + ph * 0.15);
        float sway = 0.55 * sin(uTime * 2.3 + ph) + 0.3 * sin(uTime * 4.1 + ph * 2.3 + transformed.y * 3.0) + 0.4;
        transformed.z += w * (0.06 + 0.32 * uWind) * gust * sway;
        transformed.x += w * 0.025 * sin(uTime * 3.3 + ph * 2.0);
        transformed.y += w * 0.03 * (0.5 + 0.5 * sin(uTime * 2.9 + ph)) * uWind;
      }`);
  };
  washMat = m;
  return m;
}

/** two T-posts and a sagging line from A to B (cabin-local), garments pinned along it; returns the wash group */
function clothesline(c: DressCtx, ax: number, az: number, bx: number, bz: number): THREE.Object3D | null {
  const ms = new Mesher();
  const r = new Rand(777);
  const hA = c.hAt;
  const L = Math.hypot(bx - ax, bz - az);
  const ry = Math.atan2(-(bz - az), bx - ax); // local +x runs from A to B
  const ga = hA(ax, az), gb = hA(bx, bz);
  const y0 = 1.95, sag = 0.18;
  const frame = new THREE.Group();
  frame.position.set(ax, ga, az);
  frame.rotation.y = ry;
  // posts (peeled poles) with cross arms, one line on each end of the arms (the near one full)
  for (const [px, gy] of [[0, 0], [L, gb - ga]] as [number, number][]) {
    logAB(ms, V(px, gy - 0.2, 0), V(px + r.range(-0.03, 0.03), gy + 2.15, 0), 0.06, { seed: 900 + px, seg: 7, capA: -1, capB: 0, bend: 0.01 });
    logAB(ms, V(px, gy + 2.05, -0.4), V(px, gy + 2.07, 0.4), 0.04, { seed: 910 + px, seg: 6, capA: 0, capB: 0 });
  }
  c.cols.box(ax, ga + 1, az, 0.08, 1, 0.08);
  c.cols.box(bx, gb + 1, bz, 0.08, 1, 0.08);
  const lineY = (x: number, zz: number) => (zz > 0 ? y0 : y0 + 0.05) - sag * 4 * (x / L) * (1 - x / L) + (gb - ga) * (x / L) * 0.0;
  for (const zz of [0.35, -0.35]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) { const x = (k / 12) * L; pts.push(V(x, lineY(x, zz) + (gb - ga) * (x / L), zz)); }
    tube(ms, 'rope', pts, 0.005, 4, { samples: 24 });
  }
  // the garments, in the line frame: x along, hanging below the near line (z = 0.35)
  const wm = new Mesher();
  const items: { key: string; w: number; h: number; mask: (u: number, v: number) => boolean }[] = [
    { key: 'union', w: 0.55, h: 1.25, mask: (u, v) => (v < 0.42 ? (u > 0.22 && u < 0.78) || (v < 0.36 && (u < 0.2 || u > 0.8) && v > 0.04) : Math.abs(u - 0.5) > 0.04 && u > 0.18 && u < 0.82) },
    { key: 'plaid_red', w: 0.62, h: 0.78, mask: (u, v) => (u > 0.2 && u < 0.8) || v < 0.55 },
    { key: 'jeans', w: 0.46, h: 1.0, mask: (u, v) => v < 0.28 || Math.abs(u - 0.5) > 0.05 },
    { key: 'sheet', w: 1.25, h: 0.95, mask: () => true },
    { key: 'towel', w: 0.5, h: 0.62, mask: () => true },
    { key: 'wool_sock', w: 0.12, h: 0.42, mask: (u, v) => v < 0.75 || u > 0.4 },
    { key: 'wool_sock', w: 0.12, h: 0.4, mask: (u, v) => v < 0.75 || u > 0.4 },
    { key: 'plaid_green', w: 0.6, h: 0.76, mask: (u, v) => (u > 0.2 && u < 0.8) || v < 0.55 },
    { key: 'flannel_blue', w: 0.5, h: 0.5, mask: () => true },
  ];
  let x = 0.45;
  for (const it of items) {
    if (x + it.w > L - 0.3) break;
    const [u0, v0, u1, v1] = CLOTH.uv(it.key);
    const nx = Math.max(2, Math.round(it.w / 0.06)), ny = Math.max(2, Math.round(it.h / 0.06));
    const zz = 0.35;
    const P = (i: number, j: number) => {
      const px = x + (i / nx) * it.w, top = lineY(px, zz) + (gb - ga) * (px / L);
      // a little bag in the middle, folds
      return V(px, top - 0.015 - (j / ny) * it.h, zz + 0.02 * Math.sin(i * 1.1 + j * 0.4) * (j / ny));
    };
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (!it.mask((i + 0.5) / nx, (j + 0.5) / ny)) continue;
      const U = (k: number) => u0 + (u1 - u0) * (k / nx), Vv = (k: number) => v1 - (v1 - v0) * (k / ny);
      wm.quad('cab_wash', P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), [U(i), Vv(j)], [U(i + 1), Vv(j)], [U(i + 1), Vv(j + 1)], [U(i), Vv(j + 1)], V(0, 0, 1));
    }
    // pegs
    for (const px of [x + 0.03, x + it.w - 0.03]) {
      const top = lineY(px, zz) + (gb - ga) * (px / L);
      ms.pushT(px, top - 0.02, zz);
      box(ms, 'board_warm', 0.015, 0.075, 0.02);
      ms.pop();
    }
    x += it.w + r.range(0.12, 0.3);
  }
  if (!hasMat('cab_wash') || !washMat) defineMat('cab_wash', wash(L, y0, sag));
  const wg = wm.build({ name: 'wash', cast: false });
  frame.add(ms.build({ name: 'clothesline' }));
  frame.add(wg);
  noRay(frame);
  return frame;
}

// ---------------------------------------------------------------------------------------------- satellite dish
/** a 2.4 m C-band dish on a pipe post with a polar mount and actuator, aimed (yaw) south and up at the arc */
function satelliteDish(ms: Mesher, c: DressCtx, x: number, z: number, yaw: number): void {
  const g = c.hAt(x, z);
  ms.pushT(x, g, z, yaw);
  // concrete pad and the post
  cellLathe(ms, 'cab_paint', 'paint', 'cinder', [[0, 0.06], [0.3, 0.06], [0.34, 0.0], [0.34, -0.1]].reverse() as [number, number][], 10);
  cellTube(ms, 'cab_paint', 'paint', 'steel', [V(0, 0, 0), V(0, 1.75, 0)], 0.065, 8, 2);
  cellBox(ms, 'cab_paint', 'paint', 'steel', 0, 1.8, 0.05, 0.22, 0.16, 0.26, 0, 0.3);
  // dish: paraboloid (R 1.2, focal 0.9), concave face + back, aimed by elevation 0.62 rad
  const Rd = 1.2, f = 0.9, el = 0.62;
  const prof: [number, number][] = [];
  for (let k = 0; k <= 7; k++) { const rr = (k / 7) * Rd; prof.push([rr, (rr * rr) / (4 * f)]); }
  prof.push([Rd + 0.02, (Rd * Rd) / (4 * f) + 0.005]);
  const M = new THREE.Matrix4().compose(V(0, 1.85, 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - el, 0, 0)), V(1, 1, 1));
  ms.push(M);
  cellLathe(ms, 'cab_paint', 'paint', 'dish', prof, 9);
  cellLathe(ms, 'cab_paint', 'paint', 'dish', prof.slice().reverse().map(([a, b]) => [a, b - 0.012] as [number, number]), 9);
  // back ribs and hub
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const p = (rr: number) => V(Math.cos(a) * rr, (rr * rr) / (4 * f) - 0.03, Math.sin(a) * rr);
    tube(ms, 'galv', [p(0.15), p(0.6), p(1.15)], 0.012, 3, { smooth: false });
  }
  lathe(ms, 'galv', [[0.18, -0.12], [0.2, -0.02], [0.0, -0.02]].reverse() as [number, number][], 10);
  // feed support: three legs to the LNB at the focus, the LNB and its feedhorn
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    tube(ms, 'galv', [V(Math.cos(a) * 1.1, (1.1 * 1.1) / (4 * f), Math.sin(a) * 1.1), V(0, f - 0.12, 0)], 0.012, 4, { smooth: false });
  }
  cellLathe(ms, 'cab_paint', 'paint', 'lnb', [[0.0, f - 0.2], [0.07, f - 0.2], [0.07, f - 0.05], [0.09, f - 0.03], [0.09, f], [0.0, f]], 10);
  cellBox(ms, 'cab_paint', 'paint', 'black_paint', 0, f + 0.06, 0, 0.09, 0.12, 0.07);
  ms.pop();
  // the actuator jack from the post to the dish's edge
  cellTube(ms, 'cab_paint', 'paint', 'silver', [V(0.08, 1.45, 0.05), V(0.62, 2.0, 0.45)], 0.025, 6, 2);
  cellBox(ms, 'cab_paint', 'paint', 'black_paint', 0.12, 1.47, 0.05, 0.12, 0.1, 0.1);
  // coax down the post and away along the ground toward the cabin's window
  const cable = [V(0.02, 2.4, 0.5), V(0.07, 1.6, 0.06), V(0.07, 0.4, 0.06), V(0.15, 0.02, 0.2)];
  tube(ms, 'cab_rubber', cable, 0.006, 4);
  ms.pop();
  // cable runs on the ground to the left wall and up into the window frame
  const pts: THREE.Vector3[] = [];
  const ex = -CABIN_X, ez = 0.35;
  const sx = x + Math.cos(yaw) * 0.15 + Math.sin(yaw) * 0.2, sz = z - Math.sin(yaw) * 0.15 + Math.cos(yaw) * 0.2;
  for (let k = 0; k <= 10; k++) { const t = k / 10; const px = sx + (ex - sx) * t, pz = sz + (ez - sz) * t + Math.sin(t * 9) * 0.15; pts.push(V(px, c.hAt(px, pz) + 0.015, pz)); }
  pts.push(V(ex, 0.9, ez), V(ex + 0.02, 1.55, ez + 0.02));
  tube(ms, 'cab_rubber', pts, 0.006, 4, { samples: 40 });
  c.cols.box(x, g + 0.9, z, 0.1, 0.9, 0.1);
}
const CABIN_X = 2.56;

// ---------------------------------------------------------------------------------------------- canoe
/** a 16 ft cedar-canvas canoe upside down on two sawhorses, paddles leaning */
function canoe(ms: Mesher, c: DressCtx, x: number, z: number, ry: number): void {
  const g = c.hAt(x, z);
  const L = 4.9, B = 0.45, Dp = 0.33, top = 0.82;
  ms.pushT(x, g, z, ry);
  // sawhorses
  for (const sx of [-1.25, 1.2]) {
    ms.pushT(sx, 0, 0, Math.PI / 2);
    boxAt(ms, 'board_grey', 0, top - 0.04, 0, 0.9, 0.07, 0.09, 0, { grain: 'x' });
    for (const lx of [-0.35, 0.35]) for (const lz of [-1, 1]) {
      ms.pushT(lx, (top - 0.08) / 2, lz * 0.12, 0, lz * -0.25, 0);
      box(ms, 'board_grey', 0.05, top - 0.04, 0.08, { grain: 'y' });
      ms.pop();
    }
    ms.pop();
  }
  // hull: stations along x, elliptical sections, sheer rising at the ends; upside down (keel up)
  const NX = 22, NA = 12;
  const [u0, v0, u1, v1] = cellUV('cloth', 'canoe');
  const P = (i: number, k: number, inner = 0) => {
    const t = (i / NX) * 2 - 1;
    const b = B * Math.pow(Math.max(0, 1 - t * t), 0.62) + 0.005;
    const d = Dp * (1 - 0.15 * t * t) + 0.1 * Math.pow(Math.abs(t), 4);
    const a = (k / NA) * Math.PI;
    const sh = Math.pow(Math.sin(a), 0.55);
    return V(t * L / 2, top + 0.01 + d * sh - inner * 0.012 + 0.12 * Math.pow(Math.abs(t), 3) * (1 - sh) * 0, b * Math.cos(a) * (1 - inner * 0.03));
  };
  for (let i = 0; i < NX; i++) for (let k = 0; k < NA; k++) {
    const U = (q: number) => u0 + (u1 - u0) * (q / NX), Vv = (q: number) => v0 + (v1 - v0) * (q / NA);
    ms.quad('cab_cloth', P(i, k), P(i + 1, k), P(i + 1, k + 1), P(i, k + 1), [U(i), Vv(k)], [U(i + 1), Vv(k)], [U(i + 1), Vv(k + 1)], [U(i), Vv(k + 1)]);
    // inside: cedar planking (seen from under the gunwales)
    ms.quad('board_warm', P(i, k, 1), P(i, k + 1, 1), P(i + 1, k + 1, 1), P(i + 1, k, 1), [i * 0.22, k * 0.07], [i * 0.22, (k + 1) * 0.07], [(i + 1) * 0.22, (k + 1) * 0.07], [(i + 1) * 0.22, k * 0.07]);
  }
  // gunwales, stem bands, thwarts and seats (now underneath)
  for (const k of [0, NA]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= NX; i++) pts.push(P(i, k).add(V(0, -0.012, 0)));
    tube(ms, 'board_warm', pts, 0.018, 4, { samples: 30 });
  }
  for (const tx of [-0.55, 0, 0.6]) {
    const i = Math.round((tx / (L / 2) + 1) / 2 * NX);
    const a = P(i, 0), b = P(i, NA);
    boxAt(ms, 'board_warm', tx, top + 0.06, 0, 0.06, 0.025, Math.abs(a.z - b.z) - 0.02);
  }
  for (const s of [-1.6, 1.55]) boxAt(ms, 'board_warm', s, top + 0.11, 0, 0.22, 0.02, 0.5);
  ms.pop();
  // paddles leaning on the far sawhorse
  for (let k = 0; k < 2; k++) {
    ms.pushT(x + Math.cos(ry) * (1.35 + k * 0.08) + Math.sin(ry) * 0.25, g, z - Math.sin(ry) * (1.35 + k * 0.08) + Math.cos(ry) * 0.25, ry + 0.3 + k * 0.3, 0, -0.32 - k * 0.05);
    tube(ms, 'board_warm', [V(0, 0.55, 0), V(0, 1.45, 0)], 0.016, 5);
    const sh = new THREE.Shape();
    sh.absellipse(0, 0.3, 0.085, 0.3, 0, Math.PI * 2, false, 0);
    ms.pushT(0, 0, -0.006);
    extrude(ms, 'board_warm', sh, 0.012, { curveSegments: 10 });
    ms.pop();
    lathe(ms, 'board_warm', [[0.0, 1.45], [0.04, 1.47], [0.04, 1.52], [0, 1.53]], 6);
    ms.pop();
  }
  c.cols.box(x, g + 0.6, z, L / 2, 0.6, B + 0.05, ry);
}

// ---------------------------------------------------------------------------------------------- snowmobile
/** a 1990s trail sled that died in the spring: faded yellow hood, cracked seat, one ski kinked, in the weeds */
function snowmobile(ms: Mesher, c: DressCtx, x: number, z: number, ry: number): void {
  const g = c.hAt(x, z);
  ms.pushT(x, g - 0.06, z, ry, 0.0, 0.03);
  // track and tunnel (rear), running boards
  cellBox(ms, 'cab_paint', 'paint', 'rubber', -0.45, 0.2, 0, 1.75, 0.34, 0.4);
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) cellLathe(ms, 'cab_paint', 'paint', 'steel', [[0, -0.02], [0.07, -0.02], [0.07, 0.02], [0, 0.02]], 10, new THREE.Matrix4().compose(V(-1.1 + k * 0.42, 0.12, s * 0.21), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)));
  cellBox(ms, 'cab_paint', 'paint', 'black_paint', -0.45, 0.43, 0, 1.85, 0.12, 0.5);
  for (const s of [-1, 1]) cellBox(ms, 'cab_paint', 'paint', 'alu', -0.2, 0.38, s * 0.36, 1.3, 0.03, 0.24);
  // seat with a split, tail light, rear grab bar
  cellBox(ms, 'cab_paint', 'paint', 'sled_black', -0.55, 0.6, 0, 1.0, 0.2, 0.44);
  cellBox(ms, 'cab_paint', 'paint', 'tan_canvas', -0.25, 0.7, 0.12, 0.18, 0.03, 0.14, 0.4);
  cellTube(ms, 'cab_paint', 'paint', 'chrome', [V(-1.35, 0.5, -0.22), V(-1.45, 0.62, -0.18), V(-1.45, 0.62, 0.18), V(-1.35, 0.5, 0.22)], 0.014, 5, 12);
  // the hood: lofted sections tapering to the nose, decals along the sides
  const secs: [number, number, number, number][] = [[0.0, 0.5, 0.36, 0.42], [0.45, 0.55, 0.42, 0.38], [0.85, 0.48, 0.36, 0.3], [1.15, 0.36, 0.26, 0.2], [1.3, 0.18, 0.14, 0.12]];
  const ring = (s: [number, number, number, number]) => {
    const [px, hh, hw, y0] = s;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI; pts.push(V(px, y0 + Math.sin(a) * hh, Math.cos(a) * hw)); }
    return pts;
  };
  const rings = secs.map(ring);
  const [u0, v0, u1, v1] = cellUV('paint', 'sled_side');
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < 10; k++) {
    const U = (q: number) => u0 + (u1 - u0) * (q / (rings.length - 1)), Vv = (q: number) => v0 + (v1 - v0) * (Math.abs(q - 5) / 5);
    ms.quad('cab_paint', rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1], [U(i), Vv(k)], [U(i + 1), Vv(k)], [U(i + 1), Vv(k + 1)], [U(i), Vv(k + 1)]);
  }
  // belly pan under the hood
  cellBox(ms, 'cab_paint', 'paint', 'black_paint', 0.65, 0.26, 0, 1.2, 0.12, 0.74);
  // windshield (smoked, cracked) and handlebars
  ms.pushT(0.1, 0.92, 0, 0, 0, 0.5);
  ms.quad('cab_screen', V(0, 0, -0.32), V(0, 0, 0.32), V(0, 0.3, 0.26), V(0, 0.3, -0.26), [0, 0], [1, 0], [1, 1], [0, 1]);
  ms.pop();
  cellTube(ms, 'cab_paint', 'paint', 'chrome', [V(0.0, 0.85, -0.36), V(-0.08, 0.92, -0.3), V(-0.08, 0.92, 0.3), V(0.0, 0.85, 0.36)], 0.012, 5, 12);
  for (const s of [-1, 1]) cellTube(ms, 'cab_paint', 'paint', 'rubber', [V(0.0, 0.85, s * 0.36), V(0.02, 0.84, s * 0.46)], 0.018, 5, 2);
  // headlight
  cellLathe(ms, 'cab_paint', 'paint', 'silver', [[0, 0], [0.07, 0], [0.07, 0.02], [0, 0.03]], 10, new THREE.Matrix4().compose(V(1.25, 0.42, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2 + 0.3)), V(1, 1, 1)));
  // skis on spindles, the left one kinked and toed out
  for (const s of [-1, 1]) {
    const toe = s > 0 ? 0 : 0.35;
    ms.pushT(1.0, 0.05, s * 0.42, toe);
    cellTube(ms, 'cab_paint', 'paint', 'ski', [V(-0.55, 0.02, 0), V(0.3, 0.02, 0), V(0.5, 0.06, 0), V(0.6, 0.16, 0)], 0.025, 4, 10);
    cellBox(ms, 'cab_paint', 'paint', 'ski', -0.1, 0.02, 0, 0.9, 0.025, 0.12);
    cellTube(ms, 'cab_paint', 'paint', 'steel', [V(0, 0.04, 0), V(-0.12, 0.3, -s * 0.06)], 0.022, 5, 2);
    ms.pop();
  }
  ms.pop();
  c.cols.box(x, g + 0.45, z, 1.45, 0.45, 0.55, ry);
}

// ---------------------------------------------------------------------------------------------- back right
/** a free-standing cordwood row between crib ends, capped with two old tin sheets and rocks */
function cordRow(ms: Mesher, c: DressCtx, xa: number, xb: number, z: number, r: Rand): void {
  const g = c.hAt((xa + xb) / 2, z);
  // two poles on the ground to keep it off the dirt
  for (const dz of [-0.15, 0.15]) logAB(ms, V(xa - 0.2, g + 0.05, z + dz), V(xb + 0.2, g + 0.05, z + dz), 0.05, { seed: 1200 + dz * 10, seg: 6, capA: 0, capB: 0 });
  const fr = new Rand(1210);
  for (let layer = 0; layer < 8; layer++) {
    let x = xa + (layer % 2) * 0.05;
    const xEnd = layer < 6 ? xb : xb - 1.0 - layer * 0.2;
    while (x < xEnd) {
      const rr = fr.range(0.06, 0.085);
      ms.pushT(x + rr, g + 0.15 + layer * 0.13 + fr.range(-0.01, 0.01), z, Math.PI / 2 + fr.range(-0.06, 0.06), 0, fr.range(0, 6.28));
      lowSplit(ms, fr, 0.42 + fr.range(-0.03, 0.02), rr * 1.6);
      ms.pop();
      x += rr * 2 + 0.008;
    }
  }
  // crib ends: crossed splits
  for (const ex of [xa - 0.12, xb + 0.12]) for (let layer = 0; layer < 7; layer++) {
    ms.pushT(ex + (layer % 2 ? 0.08 : -0.08) * 0, g + 0.15 + layer * 0.13, z, layer % 2 ? 0 : Math.PI / 2);
    lowSplit(ms, fr, 0.5, 0.11);
    ms.pop();
  }
  // old tin over the top, rocks to hold it
  for (let k = 0; k < 2; k++) {
    const sx = xa + (k + 0.5) * (xb - xa) / 2;
    const y = g + 0.15 + 6 * 0.13 + 0.06;
    ms.pushT(sx, y + k * 0.01, z + 0.02, r.range(-0.05, 0.05), 0.1, r.range(-0.04, 0.04));
    box(ms, 'corrugated', (xb - xa) / 2 + 0.25, 0.012, 0.75, { uv: [r.range(0, 2), r.range(0, 2)] });
    ms.pop();
    fieldstone(ms, r, sx + r.range(-0.4, 0.4), y + 0.01, y + 0.17, z + r.range(-0.1, 0.1), 0.24, 0.22, r.range(0, 3));
  }
  c.cols.box((xa + xb) / 2, g + 0.55, z, (xb - xa) / 2 + 0.2, 0.55, 0.3);
}

/** an old fridge standing in the weeds, door roped shut, rusting from the bottom */
function fridge(ms: Mesher, c: DressCtx, x: number, z: number, ry: number): void {
  const g = c.hAt(x, z);
  ms.pushT(x, g - 0.03, z, ry, 0.03, 0.04);
  cellBox(ms, 'cab_paint', 'paint', 'fridge', 0, 0.8, 0, 0.72, 1.6, 0.66);
  cellBox(ms, 'cab_paint', 'paint', 'fridge_door', 0, 0.58, 0.345, 0.7, 1.08, 0.04);
  cellBox(ms, 'cab_paint', 'paint', 'fridge_door', 0, 1.37, 0.345, 0.7, 0.44, 0.04);
  for (const [y, h] of [[0.75, 0.42], [1.37, 0.2]] as [number, number][]) cellBox(ms, 'cab_paint', 'paint', 'chrome', -0.29, y, 0.38, 0.03, h, 0.03);
  // the rope round its middle (twice), knotted
  for (const y of [0.68, 1.2]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = Math.max(-0.375, Math.min(0.375, Math.cos(a) * 0.5)), pz = Math.max(-0.37, Math.min(0.37, Math.sin(a) * 0.5));
      pts.push(V(px, y + Math.sin(a * 2) * 0.01, pz));
    }
    cellTube(ms, 'cab_paint', 'paint', 'poly_rope', pts, 0.008, 4, 40);
  }
  ms.pop();
  c.cols.box(x, g + 0.8, z, 0.38, 0.8, 0.36, ry);
}

/** the burn barrel: a rusted drum with punched holes, a grate on top, charred cans inside */
function burnBarrel(ms: Mesher, c: DressCtx, x: number, z: number): void {
  const g = c.hAt(x, z);
  ms.pushT(x, g, z, 0.3);
  const prof: [number, number][] = [[0, 0.02], [0.28, 0.02], [0.29, 0.04], [0.29, 0.3], [0.3, 0.32], [0.29, 0.34], [0.29, 0.62], [0.3, 0.64], [0.29, 0.66], [0.29, 0.88], [0.275, 0.88], [0.275, 0.4]];
  lathe(ms, 'cab_rust', prof, 10);
  lathe(ms, 'soot', [[0.275, 0.62], [0, 0.6]], 9);
  // punched draft holes near the bottom (dark spots)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ms.pushT(Math.sin(a) * 0.292, 0.12, Math.cos(a) * 0.292, a);
    box(ms, 'soot', 0.05, 0.05, 0.004);
    ms.pop();
  }
  for (let k = -3; k <= 3; k++) cellTube(ms, 'cab_paint', 'paint', 'steel', [V(k * 0.07, 0.9, -0.3), V(k * 0.07, 0.9, 0.3)], 0.006, 3, 2);
  for (let k = 0; k < 3; k++) cellLathe(ms, 'cab_paint', 'paint', 'can_rust', [[0, 0], [0.04, 0], [0.04, 0.1], [0, 0.1]], 8, new THREE.Matrix4().compose(V(-0.1 + k * 0.1, 0.62, 0.05 * k), new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2 * k, 0, 0.5 * k)), V(1, 1, 1)));
  ms.pop();
  c.cols.box(x, g + 0.45, z, 0.3, 0.45, 0.3);
}

// ---------------------------------------------------------------------------------------------- the tarp pile
/** a blue tarp draped over a pile of lumber and a drum, tires and rope holding it down */
function tarpPile(ms: Mesher, c: DressCtx, x: number, z: number, ry: number, pending: Promise<unknown>[]): void {
  const g = c.hAt(x, z);
  const W2 = 3.0, D2 = 2.1, NX = 22, NZ = 16;
  // supports in the tarp frame: lumber stack (box), a drum (cylinder), a sawhorse end (ridge)
  const support = (px: number, pz: number) => {
    let h = 0.02;
    if (Math.abs(px + 0.2) < 0.95 && Math.abs(pz) < 0.55) h = Math.max(h, 0.62);
    if (Math.hypot(px - 1.0, pz - 0.15) < 0.3) h = Math.max(h, 0.9);
    if (Math.abs(px + 0.9) < 0.15 && Math.abs(pz) < 0.6) h = Math.max(h, 0.78);
    return h;
  };
  const H: number[][] = [];
  for (let i = 0; i <= NX; i++) { H.push([]); for (let j = 0; j <= NZ; j++) H[i].push(support((i / NX - 0.5) * W2, (j / NZ - 0.5) * D2)); }
  // drape: relax toward neighbours, never below the support
  for (let it = 0; it < 14; it++) {
    const N = H.map((row) => row.slice());
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const s = support((i / NX - 0.5) * W2, (j / NZ - 0.5) * D2);
      let sum = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = H[i + di]?.[j + dj]; if (a !== undefined) { sum += a; n++; } }
      N[i][j] = Math.max(s, sum / n - 0.035);
    }
    for (let i = 0; i <= NX; i++) H[i] = N[i];
  }
  const [u0, v0, u1, v1] = cellUV('cloth', 'tarp');
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const P = (i: number, j: number) => {
    const px = (i / NX - 0.5) * W2, pz = (j / NZ - 0.5) * D2;
    const wx = x + cs * px + sn * pz, wz = z - sn * px + cs * pz;
    const wr = 0.012 * Math.sin(i * 1.9 + j * 0.7) + 0.01 * Math.sin(j * 2.3);
    return V(wx, Math.max(c.hAt(wx, wz) + 0.015, g + H[i][j] + wr), wz);
  };
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const U = (q: number) => u0 + (u1 - u0) * (q / NX), Vv = (q: number) => v0 + (v1 - v0) * (q / NZ);
    ms.quad('cab_cloth', P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), P(i, j), [U(i), Vv(j + 1)], [U(i + 1), Vv(j + 1)], [U(i + 1), Vv(j)], [U(i), Vv(j)]);
  }
  // lumber ends sticking out of one side
  for (let k = 0; k < 5; k++) {
    const px = -1.2 - 0.02 * k, pz = -0.35 + k * 0.17;
    const wx = x + cs * px + sn * pz, wz = z - sn * px + cs * pz;
    boxAt(ms, 'wood_fresh', wx, g + 0.08 + (k % 2) * 0.09, wz, 0.5, 0.085, 0.14, ry, { grain: 'x' });
  }
  // tires on top, rope over it to stakes
  const top = (px: number, pz: number) => { const i = Math.round((px / W2 + 0.5) * NX), j = Math.round((pz / D2 + 0.5) * NZ); return g + H[i][j]; };
  tire(ms, x + cs * -0.4, top(-0.4, 0.1) + 0.06, z - sn * -0.4, ry + 0.3, Math.PI / 2 - 0.05);
  tire(ms, x + cs * 1.0 + sn * 0.15, top(1.0, 0.15) + 0.06, z - sn * 1.0 + cs * 0.15, ry + 1.2, Math.PI / 2 + 0.05);
  for (const px of [-0.6, 0.6]) {
    const pts: THREE.Vector3[] = [];
    for (let j = -2; j <= NZ + 2; j++) {
      const jj = Math.max(0, Math.min(NZ, j));
      const pz = (j / NZ - 0.5) * D2;
      const wx = x + cs * px + sn * pz, wz = z - sn * px + cs * pz;
      pts.push(V(wx, (j < 0 || j > NZ ? c.hAt(wx, wz) + 0.02 : P(Math.round((px / W2 + 0.5) * NX), jj).y + 0.015), wz));
    }
    cellTube(ms, 'cab_paint', 'paint', 'poly_rope', pts, 0.007, 4, 30);
  }
  c.cols.box(x, g + 0.45, z, W2 / 2 - 0.3, 0.45, D2 / 2 - 0.3, ry);
}

/** a red coffee can full of nails and spikes (optionally knocked over, nails spilled) */
function nailCan(ms: Mesher, x: number, y: number, z: number, spilled = false): void {
  ms.pushT(x, y + (spilled ? 0.075 : 0), z, 0.4, spilled ? Math.PI / 2 : 0);
  cellLathe(ms, 'cab_paint', 'paint', 'coffee_can', [[0, 0.002], [0.075, 0.002], [0.076, 0.01], [0.076, 0.165], [0.073, 0.168], [0.071, 0.165], [0.071, 0.02]], 9);
  cellLathe(ms, 'cab_paint', 'paint', 'nails', [[0.071, 0.13], [0.04, 0.15], [0, 0.155]], 10);
  ms.pop();
  if (spilled) for (let k = 0; k < 10; k++) {
    const a = k * 0.7, d = 0.12 + k * 0.02;
    boxAt(ms, 'iron', x + Math.cos(a) * d, y + 0.004, z + Math.sin(a) * d * 0.6 + 0.08, 0.065, 0.005, 0.005, a * 2);
  }
}

/** a red plastic gas can */
function gasCan(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  cellBox(ms, 'cab_paint', 'paint', 'gas_red', 0, 0.15, 0, 0.36, 0.3, 0.2);
  cellBox(ms, 'cab_paint', 'paint', 'gas_red', 0.05, 0.33, 0, 0.2, 0.05, 0.05);
  cellTube(ms, 'cab_paint', 'paint', 'orange', [V(-0.13, 0.28, 0), V(-0.2, 0.36, 0), V(-0.25, 0.37, 0)], 0.012, 5, 4);
  ms.pop();
}

/** the wheelbarrow, a few splits in it, tipped forward on its wheel */
function wheelbarrow(ms: Mesher, c: DressCtx, x: number, z: number, ry: number): void {
  const g = c.hAt(x, z);
  ms.pushT(x, g, z, ry);
  // tray: bottom and four sloped sides
  const yb = 0.3, yt = 0.6;
  const bot = [V(-0.3, yb, -0.2), V(0.25, yb, -0.2), V(0.25, yb, 0.2), V(-0.3, yb, 0.2)];
  const tp = [V(-0.42, yt, -0.32), V(0.6, yt + 0.04, -0.34), V(0.6, yt + 0.04, 0.34), V(-0.42, yt, 0.32)];
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3) => {
    for (const [p, u, v] of [[a, 0, 0], [b, 1, 0], [cc, 1, 1], [a, 0, 0], [cc, 1, 1], [d, 0, 1]] as [THREE.Vector3, number, number][]) { pos.push(p.x, p.y, p.z); uv.push(u, v); }
  };
  quad(bot[3], bot[2], bot[1], bot[0]);
  quad(bot[0], bot[3], bot[2], bot[1]);
  for (let k = 0; k < 4; k++) { const a = bot[k], b = bot[(k + 1) % 4], cc = tp[(k + 1) % 4], d = tp[k]; quad(a, b, cc, d); quad(b, a, d, cc); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  cellGeom(ms, 'cab_paint', 'paint', 'barrow', geo);
  // wheel, axle bracket, handles and legs
  ms.pushT(0.72, 0.19, 0, 0, 0, 0);
  const tire = new THREE.TorusGeometry(0.15, 0.05, 6, 14);
  ms.geom('cab_rubber', tire);
  tire.dispose();
  lathe(ms, 'cab_rust', [[0, -0.04], [0.1, -0.04], [0.1, 0.04], [0, 0.04]], 10, {});
  ms.pop();
  for (const s of [-1, 1]) {
    cellTube(ms, 'cab_paint', 'paint', 'wood_grey', [V(0.72, 0.19, s * 0.06), V(0.2, 0.3, s * 0.22), V(-0.6, 0.55, s * 0.27), V(-0.95, 0.62, s * 0.28)], 0.022, 5, 12);
    cellTube(ms, 'cab_paint', 'paint', 'barrow', [V(-0.25, 0.3, s * 0.22), V(-0.3, 0.0, s * 0.24)], 0.014, 4, 2);
  }
  const fr = new Rand(4321);
  for (let k = 0; k < 4; k++) { ms.pushT(fr.range(-0.15, 0.25), 0.4 + k * 0.05, fr.range(-0.12, 0.12), fr.range(-0.3, 0.3), 0, fr.range(0, 6)); lowSplit(ms, fr, 0.4, 0.12); ms.pop(); }
  ms.pop();
  c.cols.box(x, g + 0.35, z, 0.75, 0.35, 0.35, ry);
}

/** rounds bucked and waiting to be split, tumbled in a heap */
function roundsHeap(ms: Mesher, c: DressCtx, x: number, z: number, r: Rand): void {
  const g = c.hAt(x, z);
  for (let k = 0; k < 9; k++) {
    const a = r.range(0, 6.28), d = r.range(0, 0.8);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const h = r.range(0.36, 0.46), rr = r.range(0.16, 0.25);
    const lying = k % 3 !== 0;
    ms.pushT(px, (lying ? rr : 0) + c.hAt(px, pz) - 0.02 + (k > 5 ? 0.3 : 0), pz, r.range(0, 6.28), 0, lying ? Math.PI / 2 : 0);
    if (lying) ms.pushT(0, -h / 2, 0);
    writeRound(ms, r, h, rr, r.int(0, 9999), 'endgrain', 1);
    if (lying) ms.pop();
    ms.pop();
  }
  // bark strips and sawdust under them
  groundDecal(c.dms, 'chips', x, z, 2.4, 2.4, r.range(0, 6), c.hAt, 0.018, 3);
  c.cols.box(x, g + 0.35, z, 0.9, 0.35, 0.9);
}

// ---------------------------------------------------------------------------------------------- fire pit
function firePitExtras(ms: Mesher, c: DressCtx, fx: number, fz: number, r: Rand, pending: Promise<unknown>[]): void {
  const hA = c.hAt;
  const g = hA(fx, fz);
  // two stump seats at the gaps between the half-log benches
  for (const [a, d] of [[5.3, 1.55], [1.45, 1.75]] as [number, number][]) {
    const x = fx + Math.cos(a) * d, z = fz + Math.sin(a) * d;
    ms.pushT(x, hA(x, z) - 0.02, z);
    writeRound(ms, r, 0.42, 0.21, r.int(0, 9999), 'endgrain', 0);
    ms.pop();
    c.cols.box(x, hA(x, z) + 0.2, z, 0.2, 0.2, 0.2);
  }
  // an axe bitten into the far stump
  {
    const a = 5.3, x = fx + Math.cos(a) * 1.55, z = fz + Math.sin(a) * 1.55;
    pending.push(bakeProp(ms, 'wooden_axe_03', x + 0.05, hA(x, z) + 0.42, z, 0.8, 0.5, 0));
  }
  // a webbed lawn chair on the far side, facing the pit
  {
    const a = 3.15, x = fx + Math.cos(a) * 1.95, z = fz + Math.sin(a) * 1.95;
    lawnChair(ms, x, hA(x, z), z, -a - Math.PI / 2);
    c.cols.box(x, hA(x, z) + 0.4, z, 0.3, 0.4, 0.3, -a - Math.PI / 2);
  }
  // a grill across the stones, the black coffee pot on it, empties around
  for (let k = -4; k <= 4; k++) cellTube(ms, 'cab_paint', 'paint', 'steel', [V(fx + k * 0.06, g + 0.22, fz - 0.55), V(fx + k * 0.06, g + 0.24, fz + 0.5)], 0.006, 3, 2);
  cellTube(ms, 'cab_paint', 'paint', 'steel', [V(fx - 0.26, g + 0.21, fz - 0.45), V(fx + 0.26, g + 0.21, fz - 0.45)], 0.008, 3, 2);
  cellTube(ms, 'cab_paint', 'paint', 'steel', [V(fx - 0.26, g + 0.23, fz + 0.42), V(fx + 0.26, g + 0.23, fz + 0.42)], 0.008, 3, 2);
  {
    ms.pushT(fx + 0.12, g + 0.245, fz + 0.18);
    lathe(ms, 'soot', [[0, 0], [0.08, 0], [0.085, 0.12], [0.06, 0.17], [0.03, 0.2], [0.035, 0.21], [0, 0.21]], 10);
    ms.pop();
  }
  for (let k = 0; k < 4; k++) {
    const a = r.range(0, 6.28), d = r.range(0.95, 1.3);
    const x = fx + Math.cos(a) * d, z = fz + Math.sin(a) * d;
    if (k < 2) bakeProduct(ms, 'beer', x, hA(x, z) + 0.032, z, r.range(0, 6), 0, Math.PI / 2);
    else cellLathe(ms, 'cab_paint', 'paint', k === 2 ? 'silver' : 'jerry_red', [[0, 0], [0.033, 0], [0.033, 0.122], [0, 0.122]], 8, new THREE.Matrix4().compose(V(x, hA(x, z) + 0.03, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, r.range(0, 6), 0)), V(1, 1, 1)));
  }
  // a pile of kindling and birch bark by the near bench
  {
    const a = 0.6, x = fx + Math.cos(a) * 1.15, z = fz + Math.sin(a) * 1.15;
    for (let k = 0; k < 6; k++) { ms.pushT(x + r.range(-0.1, 0.1), hA(x, z) + 0.03 + k * 0.02, z + r.range(-0.1, 0.1), r.range(0, 6), 0, Math.PI / 2 * 0); lowSplit(ms, r, 0.35, 0.05); ms.pop(); }
  }
}

/** an aluminium lawn chair with green, white and yellow webbing */
function lawnChair(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  const fw = 0.25;
  for (const s of [-1, 1]) {
    cellTube(ms, 'cab_paint', 'paint', 'alu', [V(s * fw, 0, 0.25), V(s * fw, 0.38, 0.22), V(s * fw, 0.4, -0.2), V(s * fw, 0.85, -0.32)], 0.012, 4, 14);
    cellTube(ms, 'cab_paint', 'paint', 'alu', [V(s * fw, 0, -0.22), V(s * fw, 0.38, 0.05)], 0.012, 4, 2);
    cellTube(ms, 'cab_paint', 'paint', 'alu', [V(s * fw, 0.62, 0.18), V(s * fw, 0.62, -0.25)], 0.012, 4, 2);
  }
  // webbing straps: seat (front to back) and back
  for (let k = 0; k < 6; k++) {
    const px = -fw + 0.02 + k * (2 * fw - 0.04) / 5;
    cellTube(ms, 'cab_paint', 'paint', 'webbing', [V(px, 0.38, 0.22), V(px, 0.33, 0.0), V(px, 0.4, -0.2), V(px, 0.85, -0.32)], 0.025, 2, 12);
  }
  ms.pop();
}

// ---------------------------------------------------------------------------------------------- more junk
/** a 100 lb propane bottle, white, chained to a stake */
function propane(ms: Mesher, x: number, y: number, z: number): void {
  ms.pushT(x, y, z);
  cellLathe(ms, 'cab_paint', 'paint', 'propane', [[0, 0], [0.17, 0], [0.18, 0.04], [0.18, 0.95], [0.15, 1.05], [0.08, 1.1], [0, 1.1]], 9);
  cellLathe(ms, 'cab_paint', 'paint', 'propane', [[0.12, 1.08], [0.12, 1.25], [0.0, 1.25]], 10);
  cellLathe(ms, 'cab_paint', 'paint', 'brass', [[0, 1.12], [0.03, 1.12], [0.03, 1.2], [0, 1.2]], 6);
  ms.pop();
}

/** firewood stacked along the right wall under the eave, end-on, two high rows, a lean in the middle */
function wallWood(ms: Mesher, c: DressCtx): void {
  const fr = new Rand(1550);
  const x0 = 2.62, z0 = 0.35, z1 = 2.9;
  for (let row = 0; row < 2; row++) for (let layer = 0; layer < 9 - row * 2; layer++) {
    let z = z0 + (layer % 2) * 0.06 + row * 0.1;
    while (z < z1 - 0.08 - layer * 0.03) {
      const rr = fr.range(0.06, 0.085);
      ms.pushT(x0 + 0.24 + row * 0.44, c.hAt(x0 + 0.3, z) + 0.08 + layer * 0.125 + fr.range(-0.01, 0.01), z + rr, fr.range(-0.06, 0.06), 0, fr.range(0, 6.28));
      lowSplit(ms, fr, 0.42 + fr.range(-0.03, 0.02), rr * 1.6);
      ms.pop();
      z += rr * 2 + 0.008;
    }
  }
  c.cols.box(x0 + 0.45, 0.55, (z0 + z1) / 2, 0.45, 0.55, (z1 - z0) / 2);
}

/** a fuel drum lying in a log cradle with a hand pump, a funnel and a drip pan */
function fuelDrum(ms: Mesher, c: DressCtx, x: number, z: number, ry: number): void {
  const g = c.hAt(x, z);
  ms.pushT(x, g, z, ry);
  for (const dx of [-0.3, 0.3]) logAB(ms, V(dx, 0.12, -0.45), V(dx, 0.12, 0.45), 0.11, { seed: 1300 + dx * 10, seg: 7, capA: 0, capB: 0 });
  ms.pushT(0, 0.52, 0, 0, 0, Math.PI / 2);
  ms.pushT(0, -0.44, 0);
  lathe(ms, 'cab_rust', [[0, 0], [0.28, 0], [0.29, 0.02], [0.29, 0.28], [0.3, 0.3], [0.29, 0.32], [0.29, 0.56], [0.3, 0.58], [0.29, 0.6], [0.29, 0.86], [0.28, 0.88], [0, 0.88]], 9);
  ms.pop(); ms.pop();
  cellTube(ms, 'cab_paint', 'paint', 'steel', [V(0.32, 0.62, 0.1), V(0.45, 0.66, 0.1), V(0.55, 0.9, 0.1)], 0.018, 5, 6);
  cellBox(ms, 'cab_paint', 'paint', 'black_paint', 0.55, 0.95, 0.1, 0.07, 0.12, 0.07);
  cellTube(ms, 'cab_paint', 'paint', 'rubber', [V(0.55, 0.9, 0.13), V(0.7, 0.6, 0.25), V(0.75, 0.15, 0.3)], 0.01, 4, 10);
  ms.pushT(0.7, 0.0, 0.32);
  lathe(ms, 'galv', [[0, 0], [0.18, 0], [0.2, 0.05], [0.19, 0.05], [0.17, 0.005], [0, 0.005]], 9);
  ms.pop();
  ms.pop();
  groundDecal(c.dms, 'oil', x + 0.3, z + 0.2, 1.4, 1.2, ry, c.hAt, 0.016, 2);
  c.cols.box(x, g + 0.5, z, 0.55, 0.5, 0.5, ry);
}

/** old tires stacked by the shed */
function tireStack(ms: Mesher, c: DressCtx, x: number, z: number, pending: Promise<unknown>[]): void {
  const g = c.hAt(x, z);
  for (let k = 0; k < 4; k++) tire(ms, x + (k % 2) * 0.05, g + 0.08 + k * 0.155, z + (k === 3 ? 0.12 : 0), k * 0.7, Math.PI / 2 + (k === 3 ? 0.15 : 0));
  void pending;
  c.cols.box(x, g + 0.35, z, 0.32, 0.35, 0.32);
}

/** an outdoor bench: an old door on two sawhorses, a chainsaw, cans, a vise, a file and a rag */
function workbench(ms: Mesher, c: DressCtx, x: number, z: number, ry: number, r: Rand, pending: Promise<unknown>[]): void {
  const g = c.hAt(x, z);
  const top = 0.78;
  ms.pushT(x, g, z, ry);
  for (const sx of [-0.65, 0.65]) {
    ms.pushT(sx, 0, 0);
    boxAt(ms, 'board_grey', 0, top - 0.06, 0, 0.09, 0.07, 0.7, 0, { grain: 'z' });
    for (const lz of [-0.28, 0.28]) for (const lx of [-1, 1]) { ms.pushT(lx * 0.12, (top - 0.1) / 2, lz, 0, 0, lx * 0.22); box(ms, 'board_grey', 0.05, top - 0.08, 0.08, { grain: 'y' }); ms.pop(); }
    ms.pop();
  }
  // the door: five-panel, the paint long gone
  boxAt(ms, 'planks_grey', 0, top, 0, 1.95, 0.04, 0.78, 0, { grain: 'x' });
  for (const px of [-0.6, 0, 0.6]) boxAt(ms, 'board_grey', px, top + 0.022, 0, 0.42, 0.006, 0.55, 0, { grain: 'x' });
  ms.pop();
  const P = (lx: number, lz: number) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, z - Math.sin(ry) * lx + Math.cos(ry) * lz] as [number, number];
  { const [px, pz] = P(-0.5, 0.05); bakeProduct(ms, 'chainsaw', px, g + top + 0.02, pz, ry + 0.4); }
  { const [px, pz] = P(0.3, -0.15); nailCan(ms, px, g + top + 0.02, pz); }
  { const [px, pz] = P(0.5, 0.15); bakeProduct(ms, 'oil', px, g + top + 0.02, pz, ry - 0.3); }
  { const [px, pz] = P(0.75, -0.2); pending.push(bakeProp(ms, 'small_oil_can_01', px, g + top + 0.02, pz, ry + 1)); }
  { const [px, pz] = P(0.05, 0.25); pending.push(bakeProp(ms, 'garden_gloves_01', px, g + top + 0.02, pz, ry + 2)); }
  { const [px, pz] = P(-0.1, -0.25); bakeProduct(ms, 'file', px, g + top + 0.02, pz, ry + 0.2); }
  { const [px, pz] = P(1.1, 0.3); pending.push(bakeProp(ms, 'wooden_axe', px, g, pz, ry + 1.6, 0, -0.25)); }
  groundDecal(c.dms, 'chips', x, z, 2.4, 1.6, ry, c.hAt, 0.017, 2);
  void r;
  c.cols.box(x, g + 0.45, z, 1.0, 0.45, 0.42, ry);
}

void board; void log; void defineMat; void atlasQuad;
