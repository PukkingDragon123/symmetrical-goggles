// Inside Ray's cabin, the layers of forty years: the kitchen shelves crammed to the edges, an apple-crate
// bookcase, the gun rack over the door (the good rifle's pegs empty), leg-hold traps hanging on the logs, the
// orange vest and a toque on the pegs, curtains sagging on wires, calendars over calendars, polaroids above the
// bunk, newspapers pasted on the logs and stacked for kindling, a topo map with a red X, QSL cards round the
// radio, mugs everywhere, cobwebs in the corners, dust under things, mud tracked in from the door, and a mouse
// hole at the foot of the back wall with Ray's trap set in front of it.
// The cooking corner (the stove top, the hearth front) and the desk's radio spot are left clear.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, board, lathe, tube, extrude } from '../kit';
import { CABIN, CABIN_GEOM } from '../cabinplan';
import type { DressCtx } from '../dressing';
import { CLOTH } from './tex';
import { bakeProduct, bakeProp, cellBox, cellLathe, cellTube, cellUV, atlasQuad, noRay, farCull } from './bake';

const { W, D, R, FLOOR: F } = CABIN;
const { EAVE } = CABIN_GEOM;
const wallX = W / 2 - R, wallZ = D / 2 - R;

export async function cabinInterior(c: DressCtx): Promise<void> {
  const ms = new Mesher();
  const dms = c.dms;
  const r = new Rand(2468);
  const pending: Promise<unknown>[] = [];
  const hi = c.detail > 0;

  // ---- kitchen shelves (east wall, z -0.15..1.3, shelves at F+1.18/1.52/1.86): fill every gap
  {
    const x = wallX - 0.135;
    const top = [F + 1.195, F + 1.535, F + 1.875];
    const row0 = ['tea', 'baking_powder', 'salt', 'pepper', 'bouillon', 'beans', 'tomatoes', 'peas'];
    const zs0 = [0.33, 0.62, 0.84, 1.15, 1.22];
    void row0;
    // shelf 0 already has beans x3, cookies, coffee, two jars, flour: squeeze more in between and in front
    bakeProduct(ms, 'bouillon', x + 0.07, top[0], 0.36, -1.6);
    bakeProduct(ms, 'salt', x + 0.06, top[0], 0.62, -1.4);
    bakeProduct(ms, 'pepper', x + 0.08, top[0], 0.78, -1.7);
    bakeProduct(ms, 'matches', x + 0.08, top[0], 1.12, -1.5);
    // shelf 1 (jug, brass pot, bowls, syrup): oats, rice, macaroni, a stack of plates, tea tin
    bakeProduct(ms, 'oats', x - 0.02, top[1], 0.22, -1.5);
    bakeProduct(ms, 'rice', x + 0.0, top[1], 1.0, -1.6);
    bakeProduct(ms, 'macaroni', x + 0.03, top[1], 1.15, -1.7);
    for (let k = 0; k < 4; k++) bakeProduct(ms, 'enamel_plate', x + 0.06, top[1] + k * 0.014, 0.42, k * 0.3);
    bakeProduct(ms, 'tea', x + 0.08, top[1], 0.75, -1.4);
    // shelf 2 (mugs, a jar, batteries, the clock): sugar, a coffee tin (old, for nails), tins of milk, a lamp
    bakeProduct(ms, 'sugar', x + 0.0, top[2], 0.7, -1.6);
    bakeProduct(ms, 'milk', x + 0.05, top[2], 0.92, -1.5);
    cellLathe(ms, 'cab_paint', 'paint', 'coffee_can', [[0, 0], [0.075, 0], [0.075, 0.165], [0, 0.165]], 12, new THREE.Matrix4().makeTranslation(x + 0.02, top[2], -0.05));
    // mugs hanging on cup hooks under the bottom shelf
    for (let k = 0; k < 5; k++) {
      const z = -0.05 + k * 0.13;
      boxAt(ms, 'iron', x + 0.08, top[0] - 0.05, z, 0.004, 0.03, 0.004);
      bakeProduct(ms, 'enamel_mug', x + 0.09, top[0] - 0.16, z, Math.PI / 2 + r.range(-0.3, 0.3), 0, r.range(-0.15, 0.15));
    }
    void zs0;
    // a dish towel over the washstand edge and a kettle on its board
    clothSheet(ms, 'towel', wallX - 0.5, F + 0.72, 0.95, 0.24, 0.26, Math.PI / 2, 0.015);
    ms.pushT(wallX - 0.25, F + 0.86, 1.1);
    lathe(ms, 'soot', [[0, 0], [0.1, 0], [0.11, 0.1], [0.08, 0.15], [0.03, 0.16], [0.03, 0.17], [0, 0.17]], 12);
    ms.pop();
    cellTube(ms, 'cab_paint', 'paint', 'steel', [V(wallX - 0.33, F + 0.95, 1.1), V(wallX - 0.25, F + 1.08, 1.1), V(wallX - 0.17, F + 0.95, 1.1)], 0.006, 4);
  }

  // ---- apple-crate bookcase between the washstand and the desk (east wall, z 1.45..2.25)
  {
    const x = wallX - 0.16;
    for (let k = 0; k < 3; k++) {
      const cz = 1.66 + (k === 2 ? 0.02 : 0) + (k % 2 ? 0.0 : 0), y = F + k * 0.31, cz2 = k === 2 ? 1.62 : cz;
      crate(ms, r, x, y, cz2, k === 2 ? 0.05 : 0);
      // books on their spines, leaning, a few lying flat
      let z = cz2 - 0.22;
      while (z < cz2 + 0.2) {
        const t = r.range(0.025, 0.05), h = r.range(0.18, 0.25);
        const lean = z > cz2 + 0.1 ? 0.25 : 0;
        book(ms, r, x + 0.02, y + 0.03, z + t / 2, t, h, 0.15, lean);
        z += t + 0.003 + (lean ? 0.04 : 0);
      }
    }
    // on top: the wooden lantern, a tin of pencils, the framed fish photo
    pending.push(bakeProp(ms, 'wooden_lantern_01', x + 0.02, F + 0.93, 1.5, -1.4, 0, 0, 0.9));
    cellLathe(ms, 'cab_paint', 'paint', 'coffee_can', [[0, 0], [0.05, 0], [0.05, 0.11], [0, 0.11]], 10, new THREE.Matrix4().makeTranslation(x + 0.04, F + 0.93, 1.86));
    for (let k = 0; k < 5; k++) cellTube(ms, 'cab_paint', 'paint', k % 2 ? 'orange' : 'jerry_green', [V(x + 0.04 + r.range(-0.02, 0.02), F + 0.97, 1.86 + r.range(-0.02, 0.02)), V(x + 0.04 + r.range(-0.05, 0.05), F + 1.12, 1.86 + r.range(-0.05, 0.05))], 0.004, 3, 2);
    frame(ms, x + 0.05, F + 0.93, 1.72, -Math.PI / 2 + 0.25, 'photo_0', 0.16, 0.2);
    c.cols.box(x, F + 0.47, 1.65, 0.16, 0.47, 0.27);
  }

  // ---- the gun rack over the door (inside): the .22 on the lower pegs, the top pegs empty
  {
    const z = wallZ - 0.03, x0 = -1.38, x1 = -0.46, y = F + 2.06;
    for (const x of [x0 + 0.08, x1 - 0.08]) {
      for (const dy of [0, 0.2]) {
        ms.pushT(x, y + dy, z, Math.PI, -0.35);
        lathe(ms, 'board_dark', [[0.016, 0], [0.016, 0.08], [0.022, 0.09], [0, 0.1]], 6);
        ms.pop();
      }
    }
    rifle(ms, (x0 + x1) / 2 + 0.02, y + 0.045, z - 0.07, Math.PI);
  }

  // ---- traps and a stretcher board hung on the west wall between the chair and the corner
  {
    const x = -wallX + 0.03;
    for (let k = 0; k < 4; k++) trap(ms, r, x, F + 1.62 - (k % 2) * 0.08, 1.7 + k * 0.24, Math.PI / 2);
    // a fur stretcher board (no fur on it, the season's not open)
    ms.pushT(x + 0.02, F + 1.15, 2.65, Math.PI / 2, 0, 0);
    const sh = new THREE.Shape();
    sh.moveTo(-0.09, -0.45); sh.lineTo(0.09, -0.45); sh.lineTo(0.08, 0.25); sh.quadraticCurveTo(0, 0.42, -0.08, 0.25); sh.lineTo(-0.09, -0.45);
    extrude(ms, 'board_warm', sh, 0.012);
    ms.pop();
    boxAt(ms, 'iron', x + 0.03, F + 1.55, 2.65, 0.05, 0.008, 0.008);
  }

  // ---- coats, the orange vest and a toque on the pegs by the door
  {
    const z = wallZ - 0.02;
    vest(ms, -1.83, F + 1.62, z - 0.1);
    toque(ms, -1.6, F + 1.74, z - 0.12, 0.3);
    // mitts on a string over the peg
    clothSheet(ms, 'grey_wool', -2.12, F + 1.45, z - 0.2, 0.09, 0.18, 0.2, 0.01);
    tube(ms, 'rope', [V(-2.12, F + 1.54, z - 0.2), V(-2.07, F + 1.68, z - 0.14), V(-2.0, F + 1.56, z - 0.2)], 0.003, 3);
  }

  // ---- curtains: gingham on the west window (one panel pulled across), flour-sack on the front window
  {
    const o = { c: 0.15, w: 0.92 }; // west window: z = -c on the left wall
    const y1 = F + 1.97, y0 = F + 1.03;
    const zc = -o.c;
    tube(ms, 'iron', [V(-wallX + 0.05, y1, zc - 0.6), V(-wallX + 0.05, y1 - 0.025, zc), V(-wallX + 0.05, y1, zc + 0.6)], 0.003, 3);
    const cx = -wallX + 0.07;
    curtain(ms, 'gingham', cx, zc - 0.58, cx, zc - 0.22, y1, y1 - y0 + 0.05, 3.5);
    curtain(ms, 'gingham', cx, zc + 0.1, cx, zc + 0.58, y1, y1 - y0 - 0.1, 1.6);
    // front window (x 0.59..1.51 on the front wall): a cafe curtain on the lower half, a valance on top
    const fz = wallZ - 0.06;
    tube(ms, 'iron', [V(0.48, F + 1.5, fz), V(1.62, F + 1.5, fz)], 0.003, 3);
    curtain(ms, 'floursack', 0.5, fz, 1.6, fz, F + 1.5, 0.42, 1.5);
    curtain(ms, 'floursack', 0.5, fz, 1.6, fz, F + 1.97, 0.18, 1.3);
    // on the inside stool of the front window: a mug, a dead-fly jar, a pine cone
    bakeProduct(ms, 'enamel_mug', 1.35, F + 1.025, wallZ - 0.06, 0.6);
    bakeProduct(ms, 'jar_preserves', 0.8, F + 1.025, wallZ - 0.05, 0.2);
  }

  // ---- around the desk and the radio: QSL cards, notes, a frequency list, a mic on a hook, the antenna lead
  {
    const z = wallZ - 0.015;
    const pin = (key: string, x: number, y: number, w: number, h: number, rot: number) => {
      ms.pushT(x, y, z, Math.PI, 0, rot);
      atlasQuad(ms, 'cab_paper', 'paper', key, w, h);
      ms.pop();
      boxAt(ms, 'board_dark', x, y + h / 2 - 0.01, z - 0.004, 0.006, 0.006, 0.006);
    };
    pin('qsl_0', 0.32, F + 1.45, 0.14, 0.09, 0.05);
    pin('qsl_1', 0.36, F + 1.32, 0.14, 0.09, -0.08);
    pin('qsl_2', 0.27, F + 1.2, 0.14, 0.09, 0.03);
    pin('note_1', 0.3, F + 1.6, 0.12, 0.09, -0.04);
    pin('note_0', 1.72, F + 1.6, 0.11, 0.08, 0.06);
    pin('receipt', 1.78, F + 1.42, 0.07, 0.12, -0.05);
    pin('cal_lake', 1.95, F + 1.45, 0.3, 0.45, 0.02);
    // the microphone hanging on its hook by the window casing, coiled cord down to the desk
    boxAt(ms, 'iron', 0.5, F + 1.18, z - 0.02, 0.01, 0.01, 0.04);
    cellBox(ms, 'cab_paint', 'paint', 'black_paint', 0.5, F + 1.11, z - 0.05, 0.05, 0.09, 0.035);
    const coil: THREE.Vector3[] = [];
    for (let k = 0; k <= 40; k++) { const t = k / 40, a = k * 1.4; coil.push(V(0.5 + Math.cos(a) * 0.012 - t * 0.05, F + 1.06 - t * 0.28, z - 0.06 + Math.sin(a) * 0.012 - t * 0.12)); }
    tube(ms, 'cab_rubber', coil, 0.003, 3, { smooth: false });
    // antenna lead from the back of the desk up the casing and out under the sash
    tube(ms, 'cab_rubber', [V(0.62, F + 0.77, z - 0.12), V(0.6, F + 0.9, z - 0.02), V(0.56, F + 1.4, z - 0.01), V(0.58, F + 1.9, z - 0.01), V(0.65, F + 1.96, z + 0.05)], 0.004, 3);
    // on the desk: a mug of pens, papers, reading glasses, the radio's log notes under a stone
    const dy = F + 0.76;
    bakeProduct(ms, 'enamel_mug', 1.25, dy, wallZ - 0.12, 2.0);
    for (let k = 0; k < 4; k++) cellTube(ms, 'cab_paint', 'paint', k % 2 ? 'blued' : 'gas_red', [V(1.25 + r.range(-0.015, 0.015), dy + 0.06, wallZ - 0.12 + r.range(-0.015, 0.015)), V(1.25 + r.range(-0.04, 0.04), dy + 0.15, wallZ - 0.12 + r.range(-0.04, 0.04))], 0.004, 3, 2);
    for (let k = 0; k < 3; k++) {
      ms.pushT(1.05 + k * 0.02, dy + 0.002 + k * 0.002, 2.55 + k * 0.01, r.range(-0.3, 0.3), -Math.PI / 2);
      atlasQuad(ms, 'cab_paper_ds', 'paper', k === 2 ? 'note_2' : 'news_1', 0.21, 0.28, k === 2 ? undefined : [0.1, 0.1, 0.6, 0.6]);
      ms.pop();
    }
    glasses(ms, 0.98, dy + 0.012, 2.47, 0.4);
  }

  // ---- calendars over calendars, photos above the bunk, the topo map, newspapers on the logs
  {
    const bz = -wallZ + 0.015;
    const onBack = (key: string, x: number, y: number, w: number, h: number, rot: number, k = 0) => {
      ms.pushT(x, y, bz + k * 0.002, 0, 0, rot);
      atlasQuad(ms, 'cab_paper', 'paper', key, w, h);
      ms.pop();
      boxAt(ms, 'iron', x, y + h / 2 - 0.02, bz + 0.006, 0.008, 0.008, 0.012);
    };
    onBack('topo', 0.33, F + 1.38, 0.42, 0.52, 0.03);
    onBack('cal_moose', -1.0, F + 1.45, 0.3, 0.45, -0.06);
    onBack('cal_lake', -1.02, F + 1.42, 0.3, 0.45, 0.04, 1);
    onBack('fishchart', 0.36, F + 1.95, 0.24, 0.33, -0.04);
    // newspaper pasted over a draughty chink high on the back wall, peeling at a corner
    ms.pushT(-0.75, F + 2.05, bz + 0.004, 0, 0, 0.02);
    atlasQuad(ms, 'cab_paper', 'paper', 'news_0', 0.48, 0.62);
    ms.pop();
    // polaroids pinned on the logs above the bunk (west wall)
    const wx = -wallX + 0.015;
    for (let k = 0; k < 6; k++) {
      ms.pushT(wx, F + 1.92 + (k % 2) * 0.12 + r.range(-0.03, 0.03), -2.45 + k * 0.17, Math.PI / 2, 0, r.range(-0.15, 0.15));
      atlasQuad(ms, 'cab_paper', 'paper', `photo_${(k + 1) % 8}`, 0.085, 0.1);
      ms.pop();
    }
    // magazines and a stack of newspapers for kindling by the hearth
    for (let k = 0; k < 9; k++) {
      ms.pushT(0.32 + r.range(-0.02, 0.02), F + 0.005 + k * 0.012, -2.55 + r.range(-0.02, 0.02), r.range(-0.2, 0.2), -Math.PI / 2);
      atlasQuad(ms, 'cab_paper_ds', 'paper', k === 8 ? 'mag_0' : `news_${k % 2}`, 0.38, 0.5);
      ms.pop();
    }
    cellBox(ms, 'cab_paint', 'paint', 'kraft', 0.32, F + 0.05, -2.55, 0.4, 0.004, 0.52);
    // a newspaper left open on the table
    ms.pushT(-1.75, F + 0.763, 0.6, 0.3, -Math.PI / 2);
    atlasQuad(ms, 'cab_paper_ds', 'paper', 'news_1', 0.36, 0.48);
    ms.pop();
  }

  // ---- by the stove: an ash bucket, a stove glove on the shield shelf edge, a stovetop toaster on a nail
  {
    ms.pushT(0.55, F, -1.55);
    lathe(ms, 'galv', [[0, 0], [0.13, 0], [0.15, 0.28], [0.155, 0.285], [0.145, 0.285], [0.125, 0.02], [0, 0.02]], 14);
    lathe(ms, 'soot', [[0.14, 0.22], [0.0, 0.24]], 12);
    ms.pop();
    cellTube(ms, 'cab_paint', 'paint', 'steel', [V(0.42, F + 0.28, -1.55), V(0.55, F + 0.42, -1.55), V(0.68, F + 0.28, -1.55)], 0.005, 4);
    clothSheet(ms, 'duck', 0.85, F + 1.27, -2.73, 0.12, 0.2, 0, 0.01);
  }

  // ---- the bunk: a grey wool blanket folded at the foot, a paperback face down, a suitcase under it
  {
    const bx0 = -wallX + 0.02, bx1 = bx0 + 0.88, bz1 = -wallZ + 0.03 + 1.98;
    const deck = F + 0.42 + 0.13;
    cellBox(ms, 'cab_cloth', 'cloth', 'grey_wool', (bx0 + bx1) / 2 + 0.02, deck + 0.06, bz1 - 0.3, 0.7, 0.07, 0.34, 0.04);
    book(ms, r, -1.75, deck + 0.04, -1.6, 0.03, 0.18, 0.12, 0, true);
    if (hi) pending.push(bakeProp(ms, 'vintage_suitcase_02', (bx0 + bx1) / 2, F + 0.0, -2.0, Math.PI / 2 + 0.1, 0, 0, 0.8));
  }

  // ---- overhead: fishing rods laid across the tie beams, a paddle, a cold lantern hanging
  {
    const y = EAVE - 0.2 + 0.12 + 0.01;
    for (let k = 0; k < 3; k++) cellTube(ms, 'cab_paint', 'paint', k === 1 ? 'walnut' : 'blued', [V(-0.9 + k * 0.08, y, -1.4), V(-0.88 + k * 0.08, y + 0.005, 1.7)], 0.006, 4, 2);
    ms.pushT(0.6, y + 0.02, 0.15, 0, Math.PI / 2, 0);
    tube(ms, 'board_warm', [V(0, -1.3, 0), V(0, 0.2, 0)], 0.016, 5);
    const sh = new THREE.Shape();
    sh.absellipse(0, -0.95, 0.08, 0.32, 0, Math.PI * 2, false, 0);
    extrude(ms, 'board_warm', sh, 0.012, { curveSegments: 8 });
    ms.pop();
  }

  // ---- the mouse hole at the foot of the back wall, droppings, chewed crumbs, Ray's trap set in front
  {
    const x = -0.98, z = -wallZ + 0.003;
    ms.pushT(x, F + 0.035, z);
    atlasQuad(ms, 'cab_card', 'decal', 'hole', 0.08, 0.07);
    ms.pop();
    for (let k = 0; k < 9; k++) boxAt(ms, 'soot', x + r.range(-0.15, 0.2), F + 0.003, z + r.range(0.03, 0.25), 0.008, 0.005, 0.004, r.range(0, 3));
    pending.push(bakeProp(ms, 'mousetrap', x + 0.06, F + 0.001, z + 0.2, 0.3));
    dmsDecal(dms, 'dust', x, z + 0.18, 0.5, 0.35);
  }

  // ---- dust, mud and wear on the floor: tracks from the door to the stove and the table, dust under things
  {
    dmsDecal(dms, 'mud', -0.92, wallZ - 0.35, 0.8, 0.55);
    dmsDecal(dms, 'boots', -0.75, wallZ - 1.25, 0.42, 1.6, 0.25);
    dmsDecal(dms, 'boots', 0.3, -0.4, 0.4, 1.7, 0.75);
    dmsDecal(dms, 'boots', -0.95, 0.6, 0.4, 1.4, -0.6);
    dmsDecal(dms, 'chips', 1.5, -0.95, 0.9, 0.8, 0.4);
    for (const [x, z, w, d] of [[-wallX + 0.25, -wallZ + 0.25, 0.6, 0.6], [wallX - 0.2, wallZ - 0.2, 0.5, 0.5], [-wallX + 0.2, wallZ - 0.25, 0.5, 0.6], [-1.8, -1.9, 0.9, 1.9], [-1.8, 0.15, 0.7, 1.7], [wallX - 0.25, 0.55, 0.5, 1.4], [0.0, -wallZ + 0.2, 1.2, 0.35]] as [number, number, number, number][]) dmsDecal(dms, 'dust', x, z, w, d);
    dmsDecal(dms, 'ring', -1.95, 0.25, 0.09, 0.09, 0, F + 0.762);
    dmsDecal(dms, 'ring', 1.32, wallZ - 0.2, 0.09, 0.09, 0, F + 0.762);
    // a rag rug inside the door
    ms.pushT(-0.92, F + 0.004, wallZ - 0.55, 0.05);
    box(ms, 'rug', 0.62, 0.008, 0.95, { grain: 'z' });
    ms.pop();
  }

  // ---- cobwebs in the upper corners and between the beams and the logs
  if (hi) {
    const yTop = EAVE - 0.15;
    const web = (x: number, y: number, z: number, ry: number, s: number) => {
      ms.pushT(x, y, z, ry, 0, Math.PI);
      ms.pushT(s / 2, s / 2, 0);
      atlasQuad(ms, 'cab_card', 'decal', 'cobweb', s, s);
      ms.pop(); ms.pop();
    };
    web(-wallX + 0.01, yTop, -wallZ + 0.25, Math.PI / 4, 0.38);
    web(wallX - 0.01, yTop, wallZ - 0.2, Math.PI / 4 + Math.PI, 0.35);
    web(-wallX + 0.25, yTop, wallZ - 0.01, -Math.PI / 4 + Math.PI, 0.3);
    web(0.4, EAVE - 0.33, -1.0, 0, 0.3);
    web(-1.6, F + 0.42, -wallZ + 0.02, 0, 0.18);
  }

  await Promise.all(pending);
  const g = noRay(ms.build({ name: 'cabin_interior', noCast: ['cab_card', 'cab_paper', 'cab_paper_ds'] }));
  c.group.add(g);
  c.updaters.push(farCull(g, V(0, 1.4, 0), 32));
}

// ---------------------------------------------------------------------------------------------- pieces
function dmsDecal(dms: Mesher, key: string, x: number, z: number, w: number, d: number, ry = 0, y = F + 0.003): void {
  dms.pushT(x, y, z, ry, -Math.PI / 2);
  atlasQuad(dms, 'cab_decal', 'decal', key, w, d);
  dms.pop();
}

/** an apple crate on its side (open toward -x, the room), slatted sides */
function crate(ms: Mesher, r: Rand, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  const w = 0.3, h = 0.3, d = 0.5;
  for (const zz of [-d / 2 + 0.01, d / 2 - 0.01]) board(ms, 'board_warm', r, 0, h / 2, zz, w, h, 0.02, 0, { grain: 'y' });
  for (const yy of [0.02, 0.15, 0.28]) board(ms, 'board_warm', r, 0.01, yy, 0, w - 0.02, 0.09, d - 0.04, 0, { grain: 'z', faces: { nx: null } });
  board(ms, 'board_warm', r, w / 2 - 0.01, h / 2, 0, 0.015, h - 0.02, d - 0.04, 0, { grain: 'z' });
  ms.pop();
}

/** a book standing on its bottom edge with the spine toward -x (the room), optionally lying flat */
function book(ms: Mesher, r: Rand, x: number, y: number, z: number, t: number, h: number, d: number, lean = 0, flat = false): void {
  const [u0, v0, u1, v1] = cellUV('paper', 'spines');
  const i = r.int(0, 31);
  const su0 = u0 + (u1 - u0) * (i / 32), su1 = u0 + (u1 - u0) * ((i + 1) / 32);
  ms.pushT(x, y, z, 0, 0, 0);
  if (flat) ms.push(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  ms.push(new THREE.Matrix4().makeRotationX(lean));
  // covers + page block (box), spine quad on -x
  boxAt(ms, 'board_dark', 0, h / 2, 0, d, h, t, 0, { faces: { nx: null } });
  ms.quad('cab_paper', V(-d / 2 - 0.001, 0, t / 2), V(-d / 2 - 0.001, 0, -t / 2), V(-d / 2 - 0.001, h, -t / 2), V(-d / 2 - 0.001, h, t / 2), [su1, v0], [su0, v0], [su0, v1], [su1, v1]);
  ms.pop();
  if (flat) ms.pop();
  ms.pop();
}

/** a little framed photo standing on a ledge */
function frame(ms: Mesher, x: number, y: number, z: number, ry: number, key: string, w: number, h: number): void {
  ms.pushT(x, y, z, ry, -0.12);
  boxAt(ms, 'board_dark', 0, h / 2, -0.006, w + 0.03, h + 0.03, 0.012);
  ms.pushT(0, h / 2, 0.001);
  atlasQuad(ms, 'cab_paper', 'paper', key, w, h, [0.06, 0.2, 0.94, 0.95]);
  ms.pop();
  ms.pop();
}

/** a single-shot .22 on the rack, barrel along +x of the rack frame */
function rifle(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  const st = new THREE.Shape();
  st.moveTo(-0.5, -0.06); st.lineTo(-0.48, 0.03); st.lineTo(-0.2, 0.025); st.lineTo(-0.08, 0.015); st.lineTo(0.18, 0.012); st.lineTo(0.2, -0.01); st.lineTo(-0.1, -0.02); st.lineTo(-0.2, -0.05); st.lineTo(-0.5, -0.06);
  ms.pushT(0, 0, -0.015);
  extrude(ms, 'board_warm', st, 0.03, { bevel: 0.004, curveSegments: 2 });
  ms.pop();
  cellTube(ms, 'cab_paint', 'paint', 'blued', [V(-0.12, 0.022, 0), V(0.52, 0.02, 0)], 0.009, 6, 2);
  cellBox(ms, 'cab_paint', 'paint', 'blued', -0.08, 0.025, 0, 0.14, 0.03, 0.022);
  cellTube(ms, 'cab_paint', 'paint', 'blued', [V(-0.1, -0.005, 0.0), V(-0.06, -0.03, 0), V(-0.03, -0.01, 0)], 0.004, 3, 6);
  ms.pop();
}

/** a leg-hold trap hanging from a nail by its chain, set closed */
function trap(ms: Mesher, r: Rand, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  boxAt(ms, 'iron', 0, 0, 0.02, 0.008, 0.008, 0.05);
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 8; k++) pts.push(V((k % 2 ? 0.006 : -0.006), -k * 0.03, 0.01));
  tube(ms, 'iron', pts, 0.004, 3, { smooth: false });
  ms.pushT(r.range(-0.01, 0.01), -0.3, 0.015, 0, 0, r.range(-0.15, 0.15));
  // jaws (closed: two arcs meeting), base plate, spring arms out the sides
  const jaw: THREE.Vector3[] = [];
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; jaw.push(V(Math.cos(a) * 0.06, Math.sin(a) * 0.06 - 0.02, 0)); }
  tube(ms, 'cab_rust', jaw, 0.005, 4, { smooth: false });
  boxAt(ms, 'cab_rust', 0, -0.02, -0.004, 0.03, 0.12, 0.004);
  for (const s of [-1, 1]) {
    tube(ms, 'cab_rust', [V(s * 0.06, -0.02, 0), V(s * 0.11, 0.0, 0), V(s * 0.16, -0.02, 0)], 0.004, 3, { smooth: false });
  }
  ms.pop();
  ms.pop();
}

/** the blaze-orange vest on a peg */
function vest(ms: Mesher, x: number, y: number, z: number): void {
  const [u0, v0, u1, v1] = CLOTH.uv('vest');
  const nx = 6, ny = 8;
  const P = (i: number, j: number) => {
    const u = i / nx, v = j / ny;
    const w = 0.12 + 0.12 * Math.min(1, v * 3);
    const a = (u - 0.5) * Math.PI * 0.9;
    return V(x + Math.sin(a) * w * 1.1, y + 0.02 - v * 0.62, z + 0.07 - Math.cos(a) * 0.08 * Math.min(1, v * 2) + 0.01 * Math.sin(j));
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (j < 2 && i > 1 && i < 4) continue; // neck opening
    const U = (k: number) => u0 + (u1 - u0) * (k / nx), Vv = (k: number) => v1 - (v1 - v0) * (k / ny);
    ms.quad('cab_cloth', P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), [U(i), Vv(j)], [U(i), Vv(j + 1)], [U(i + 1), Vv(j + 1)], [U(i + 1), Vv(j)]);
  }
}

/** a striped toque with a pompom hanging off a peg */
function toque(ms: Mesher, x: number, y: number, z: number, tilt: number): void {
  ms.pushT(x, y, z, 0, tilt + Math.PI, 0);
  cellLathe(ms, 'cab_cloth', 'cloth', 'toque', [[0.0, -0.17], [0.07, -0.16], [0.095, -0.1], [0.1, 0.0], [0.1, 0.03]], 12);
  ms.pushT(0, -0.19, 0);
  ms.push(new THREE.Matrix4().makeScale(0.04, 0.04, 0.04));
  const s = new THREE.IcosahedronGeometry(1, 1);
  ms.geom('wool_grey', s);
  s.dispose();
  ms.pop(); ms.pop();
  ms.pop();
}

/** a cloth panel hanging from a rod from (ax, az) to (bx, bz) at height y, length l, gathered into folds */
function curtain(ms: Mesher, key: string, ax: number, az: number, bx: number, bz: number, y: number, l: number, gather: number): void {
  const [u0, v0, u1, v1] = CLOTH.uv(key);
  const L = Math.hypot(bx - ax, bz - az);
  const nx = Math.max(4, Math.round(L / 0.035)), ny = 5;
  const tx = (bx - ax) / L, tz = (bz - az) / L;
  const P = (i: number, j: number) => {
    const t = i / nx, s = j / ny;
    const fold = 0.012 * gather * Math.sin(t * nx * 1.4) * (0.7 + 0.3 * s);
    return V(ax + tx * L * t - tz * fold, y - s * l, az + tz * L * t + tx * fold);
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const U = (k: number) => u0 + (u1 - u0) * (k / nx) * Math.min(1, L / 0.5), Vv = (k: number) => v1 - (v1 - v0) * (k / ny) * Math.min(1, l / 0.5);
    ms.quad('cab_cloth', P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), [U(i), Vv(j)], [U(i + 1), Vv(j)], [U(i + 1), Vv(j + 1)], [U(i), Vv(j + 1)]);
  }
}

/** a small flat cloth (towel, mitt, glove) hanging, centred at (x, y, z) */
function clothSheet(ms: Mesher, key: string, x: number, y: number, z: number, w: number, h: number, ry: number, fold: number): void {
  const [u0, v0, u1, v1] = CLOTH.uv(key);
  ms.pushT(x, y, z, ry);
  const n = 3;
  for (let j = 0; j < n; j++) {
    const ya = h / 2 - (j / n) * h, yb = h / 2 - ((j + 1) / n) * h;
    const za = fold * Math.sin(j * 2), zb = fold * Math.sin((j + 1) * 2);
    const va = v1 - (v1 - v0) * (j / n), vb = v1 - (v1 - v0) * ((j + 1) / n);
    ms.quad('cab_cloth', V(-w / 2, ya, za), V(w / 2, ya, za), V(w / 2, yb, zb), V(-w / 2, yb, zb), [u0, va], [u1, va], [u1, vb], [u0, vb]);
  }
  ms.pop();
}

/** wire reading glasses folded on the desk */
function glasses(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  ms.pushT(x, y, z, ry);
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; pts.push(V(s * 0.03 + Math.cos(a) * 0.024, 0.0, Math.sin(a) * 0.018)); }
    tube(ms, 'galv', pts, 0.0015, 3, { smooth: false });
  }
  tube(ms, 'galv', [V(-0.055, 0, -0.005), V(-0.06, 0.005, -0.1)], 0.0015, 3, { smooth: false });
  tube(ms, 'galv', [V(0.055, 0, -0.005), V(0.05, 0.005, -0.1)], 0.0015, 3, { smooth: false });
  ms.pop();
}

void board; void box;
