// Inside Pruneau's, dressed around the shelf rows (those belong to the cooking worker): the post wicket on the
// counter and the pigeonholes behind it (round Ray's cubbyhole, the drawer cabinet the story uses), merchandise
// hanging from the joists, a lure end-cap on the gondola, the minnow tank (live minnows, bubbles), the humming
// drink cooler, the penny-candy case, scratch tickets and the lotto light box, the coffee corner by the stove,
// cardboard displays, cartons, mitts drying by the stovepipe, cobwebs, dust in the lamplight, the worn path to the
// counter, light pools under the lamps, and Odile's cat asleep on the counter.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, board, lathe, defineMat, hasMat, anchor } from '../kit';
import { glassMat } from '../fixtures';
import { SIGNS, LABELS } from '../signs';
import { G } from '../../gfx/globals';
import { loadTex } from '../../gfx/tex';
import { PUV, PSUB, card, cardAt, floorDecal } from './print';
import { colorMat, blob, tb } from './inst';
import { printBox, type DressStore } from './dress_ext';
import { PRINT_RECTS } from './print_rects';
import { sleepingCat } from './cat';
import { coolerHum } from './hum';
import * as LP from './lowprops';

const sz = (k: string, ppm = 300): [number, number] => [PRINT_RECTS[k][2] / ppm, PRINT_RECTS[k][3] / ppm];
const lUV = (k: string) => LABELS.uv(k);

function ensureIntMats(): void {
  if (hasMat('water')) return;
  defineMat('water', new THREE.MeshStandardMaterial({ name: 'place_water', color: 0x4a6a5a, roughness: 0.5, metalness: 0, transparent: true, opacity: 0.38, depthWrite: false }));
  defineMat('cool_lit', new THREE.MeshStandardMaterial({ name: 'place_cool_lit', color: 0xdfe8ee, emissive: new THREE.Color(0.75, 0.85, 1.0), emissiveIntensity: 0.9, roughness: 0.6 }));
  defineMat('glowcool', new THREE.MeshBasicMaterial({
    name: 'place_glowcool', map: loadTex('places/store_grime.png', { repeat: false }), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: new THREE.Color(0.3, 0.42, 0.55), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false, fog: false,
  }));
}

export function dressInterior(c: DressStore): void {
  ensureIntMats();
  const { cols, group, q } = c;
  const ms = c.dms; // small things: no shadow casting (the counter lamp's cube map would draw them six times)
  const { FLOOR: F, CEIL, IX, IZ } = c.dims;
  const r = new Rand(7070);
  const ch = F + 0.96;           // counter top
  const JY = CEIL - 0.12;        // underside of the ceiling joists
  const joists = [-4.74, -3.54, -2.34, -1.14, 0.06, 1.26, 2.46, 3.66, 4.86];
  void joists;
  const candy = [colorMat('cy_r', 0xd02830, 0.35), colorMat('cy_y', 0xf0c830, 0.35), colorMat('cy_g', 0x40b050, 0.35), colorMat('cy_p', 0xe060a0, 0.35),
    colorMat('cy_o', 0xf08020, 0.35), colorMat('cy_w', 0xf0ece0, 0.35), colorMat('cy_b', 0x3050c0, 0.35), colorMat('cy_k', 0x3a2418, 0.35)];
  const black = colorMat('black', 0x1c1c1e, 0.5);
  const white = colorMat('white', 0xe4e2da, 0.5);
  const styro = colorMat('styro', 0xf0eee6, 0.9);
  const brass = colorMat('brass', 0xa88a40, 0.35, 0.7);
  const orange = colorMat('blaze', 0xf26a10, 0.8);
  const amber = colorMat('flypaper', 0xc89a30, 0.5);

  // ================================================================== the post office
  // ---- the wicket on the counter's back end: posts, an arched head, brass bars, the sign, the hours
  {
    const x = 1.96, z0 = -2.34, z1 = -1.14, top = ch + 0.74;
    ms.pushT(0, 0, 0);
    for (const z of [z0, z1]) board(ms, 'board_dark', r, x, (ch + top) / 2, z, 0.07, top - ch, 0.07, 0, { grain: 'y' });
    board(ms, 'board_dark', r, x, top + 0.04, (z0 + z1) / 2, 0.09, 0.08, z1 - z0 + 0.12, 0, { grain: 'z' });
    board(ms, 'board_dark', r, x, ch + 0.12, (z0 + z1) / 2, 0.05, 0.03, z1 - z0, 0, { grain: 'z' });
    // the arched window and its bars
    const zm = (z0 + z1) / 2, hw = (z1 - z0) / 2 - 0.06, yb = ch + 0.18, yt = top - 0.12;
    for (let i = 0; i <= 14; i++) {
      const z = zm - hw + (i / 14) * 2 * hw;
      const arch = yt - 0.08 * (1 - Math.cos(Math.asin(Math.min(1, Math.abs(z - zm) / hw))));
      tb(ms, brass, [V(x, yb, z), V(x, arch, z)], 0.0045, 4, { smooth: false });
    }
    const arc: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); arc.push(V(x, yt - 0.08 + Math.sin(a) * 0.08, zm - Math.cos(a) * hw)); }
    tb(ms, brass, arc, 0.007, 5);
    tb(ms, brass, [V(x, yb, zm - hw), V(x, yb, zm + hw)], 0.007, 5);
    // header panel with the sign facing the customers (-X)
    boxAt(ms, 'boards_green', x, top + 0.22, zm, 0.04, 0.26, z1 - z0 + 0.06);
    cardAt(ms, 'post_sign', x - 0.022, top + 0.22, zm, -Math.PI / 2, 0.72, 0.2);
    cardAt(ms, 'post_hours', x - 0.04, ch + 0.48, z0 + 0.02, -Math.PI / 2 + 0.15, ...sz('post_hours', 330), 0.03);
    // stamps under the bars, a stamp pad, a stamp on its rack, a letter scale
    floorDecal(ms, 'stamps', x - 0.12, ch + 0.002, zm + 0.12, 0.16, 0.12, 0.3, 'sp');
    boxAt(ms, black, x + 0.15, ch + 0.012, zm - 0.25, 0.1, 0.02, 0.07);
    ms.pushT(x + 0.16, ch, zm + 0.3);
    boxAt(ms, 'board_dark', 0, 0.01, 0, 0.16, 0.02, 0.12);
    for (let i = 0; i < 4; i++) { boxAt(ms, 'board_warm', -0.06 + i * 0.04, 0.06, 0, 0.012, 0.09, 0.012); boxAt(ms, black, -0.06 + i * 0.04, 0.02, 0, 0.025, 0.012, 0.02); }
    ms.pop();
    ms.pushT(x + 0.15, ch, zm - 0.02);
    lathe(ms, 'galv', [[0.0001, 0], [0.06, 0], [0.05, 0.02], [0.015, 0.03], [0.012, 0.12], [0.045, 0.13], [0.0001, 0.135]], 8);
    ms.pop();
    ms.pop();
    cols.box(x, (ch + top) / 2 + 0.1, zm, 0.05, (top - ch) / 2 + 0.15, (z1 - z0) / 2);
    c.anchors.post_wicket = anchor(group, 'post_wicket', x - 0.2, ch, zm, -Math.PI / 2);
  }
  // ---- the pigeonholes on the wall behind: a tall bank beside the drawer cabinet, a row above it
  {
    const xb = IX - 0.005, dep = 0.28, xf = xb - dep;
    const bank = (za: number, zb: number, ya: number, yb: number, nc: number, nr: number, seed: number) => {
      const rr = new Rand(seed);
      const cw = (zb - za) / nc, rh = (yb - ya) / nr;
      boxAt(ms, 'board_dark', xb - 0.005, (ya + yb) / 2, (za + zb) / 2, 0.01, yb - ya, zb - za);
      for (let i = 0; i <= nc; i++) boxAt(ms, 'board_warm', xb - dep / 2, (ya + yb) / 2, za + i * cw, dep, yb - ya, 0.012, 0, { grain: 'y', uv: [rr.range(0, 2), 0] });
      for (let j = 0; j <= nr; j++) boxAt(ms, 'board_warm', xb - dep / 2, ya + j * rh, (za + zb) / 2, dep, 0.012, zb - za, 0, { grain: 'z', uv: [rr.range(0, 2), 0] });
      board(ms, 'board_dark', rr, xf - 0.01, yb + 0.03, (za + zb) / 2, 0.04, 0.06, zb - za + 0.04, 0, { grain: 'z' });
      for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) {
        const zc = za + (i + 0.5) * cw, yc = ya + j * rh + 0.006;
        const k = rr.next();
        if (k < 0.45) {
          // a bundle of letters leaning in the cell
          const n = 1 + rr.int(0, 2);
          for (let e = 0; e < n; e++) {
            const ek = rr.int(0, 5);
            ms.pushT(xf + 0.06 + e * 0.02, yc + Math.min(rh - 0.02, 0.07) / 2 + 0.002, zc + rr.range(-0.01, 0.01), -Math.PI / 2 + rr.range(-0.1, 0.1), 0, rr.range(-0.25, 0.25));
            card(ms, 'letters', Math.min(cw - 0.02, 0.105), Math.min(rh - 0.02, 0.065), 'sp_ds', PSUB('letters', ek / 6, (ek + 1) / 6));
            ms.pop();
          }
        } else if (k < 0.55) {
          ms.pushT(xf + 0.12, yc, zc, rr.range(-0.2, 0.2));
          printBox(ms, 'parcel', cw - 0.025, Math.min(rh - 0.03, 0.08), 0.16, 'board_grey');
          ms.pop();
        }
        if (rr.next() < 0.35) {
          const nk = rr.int(0, 7);
          ms.pushT(xf - 0.002, ya + j * rh + 0.012, zc, -Math.PI / 2);
          card(ms, 'mail_names', Math.min(cw - 0.02, 0.08), 0.018, 'sp', PSUB('mail_names', nk / 8, (nk + 1) / 8));
          ms.pop();
        }
      }
    };
    bank(-2.5, -1.48, F + 0.98, F + 2.38, 7, 9, 41);
    bank(-1.44, -0.3, F + 1.95, F + 2.42, 8, 3, 42);
    // the sorting ledge under the tall bank, mail sacks and parcels on the floor behind the counter
    board(ms, 'board_warm', r, IX - 0.22, F + 0.96, -1.99, 0.42, 0.035, 1.0, 0, { grain: 'z' });
    for (const [z, h] of [[-2.3, 0.0], [-1.75, 0.0]] as [number, number][]) {
      ms.pushT(IX - 0.22, F + 0.98 + h, z, r.range(-0.3, 0.3));
      printBox(ms, 'parcel', 0.3, 0.16, 0.22);
      ms.pop();
    }
    const sack = colorMat('sack', 0x9a8a68, 0.95);
    for (const [x, z, s] of [[3.25, -2.15, 1], [3.05, -1.75, 0.8]] as [number, number, number][]) {
      ms.pushT(x, F, z, r.range(0, 3));
      lathe(ms, sack, [[0.0001, 0], [0.2 * s, 0.01], [0.24 * s, 0.15], [0.22 * s, 0.38 * s], [0.12 * s, 0.5 * s], [0.06 * s, 0.56 * s], [0.0001, 0.56 * s]], 9);
      tb(ms, 'rope', [V(-0.06 * s, 0.53 * s, 0), V(0, 0.5 * s, 0.07 * s), V(0.06 * s, 0.53 * s, 0)], 0.008, 4);
      ms.pop();
      blob(ms, x, F, z, 0.6 * s, 0.6 * s);
    }
    cardAt(ms, 'calendar', 3.25, F + 1.62, -IZ + 0.006, 0, 0.3, 0.46, 0.02, 'signs', SIGNS.uv('calendar'));
    c.anchors.cubbyholes = anchor(group, 'cubbyholes', IX - 0.3, F + 1.6, -1.99, -Math.PI / 2);
  }

  // ================================================================== hanging from the joists
  {
    const hook = (x: number, z: number, y: number) => tb(ms, 'galv', [V(x, JY, z), V(x, y, z)], 0.0025, 3, { smooth: false });
    // galvanised pails nested on a hook (left aisle)
    for (const [x, z] of [[-2.35, -1.14], [0.95, -2.34]] as [number, number][]) {
      hook(x, z, 3.02);
      for (let k = 0; k < 3; k++) {
        ms.pushT(x, 2.62 + k * 0.035, z, k * 0.7);
        lathe(ms, 'galv', [[0.0001, 0], [0.12, 0], [0.155, 0.3], [0.15, 0.3], [0.115, 0.008], [0.0001, 0.008]], 8);
        ms.pop();
      }
      tb(ms, 'galv', [V(x - 0.15, 2.95, z), V(x, 3.03, z), V(x + 0.15, 2.95, z)], 0.003, 3);
    }
    // snowshoes, a pair hung flat by their tails
    for (const [x, z, a] of [[-2.55, 1.26, 0.1], [-2.15, 1.26, -0.08]] as [number, number, number][]) {
      hook(x, z, 3.25);
      ms.pushT(x, 2.75, z, a);
      const frame: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) { const t = (i / 16) * Math.PI * 2; frame.push(V(Math.sin(t) * 0.14 * (1 - 0.35 * Math.max(0, -Math.cos(t))), Math.cos(t) * 0.42 - (Math.cos(t) < 0 ? 0.08 : 0), 0)); }
      tb(ms, 'board_warm', frame, 0.012, 5, { closed: true });
      ms.quad('rope', V(-0.12, -0.35, 0.002), V(0.12, -0.35, 0.002), V(0.12, 0.3, 0.002), V(-0.12, 0.3, 0.002), [0, 0], [0.24, 0], [0.24, 0.65], [0, 0.65]);
      for (const y of [-0.1, 0.15]) boxAt(ms, 'board_warm', 0, y, 0, 0.26, 0.02, 0.02);
      ms.pop();
    }
    // a toboggan hung flat under the joists over the gondola, its curl at the front
    {
      const x = -0.7, za = -0.6, zb = 1.05, y = 3.12;
      for (let k = 0; k < 4; k++) board(ms, 'board_warm', r, x - 0.18 + k * 0.12, y, (za + zb) / 2, 0.11, 0.015, zb - za, 0, { grain: 'z' });
      const curl: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 1.1; curl.push(V(0, y + 0.12 - Math.cos(a) * 0.12, zb + Math.sin(a) * 0.12)); }
      for (let k = 0; k < 4; k++) tb(ms, 'board_warm', curl.map((p) => p.clone().add(V(x - 0.18 + k * 0.12, 0, 0))), 0.008, 3, { smooth: false });
      for (const z of [za + 0.2, zb - 0.2]) { tb(ms, 'rope', [V(x - 0.25, y, z), V(x - 0.25, JY, z)], 0.006, 4); tb(ms, 'rope', [V(x + 0.25, y, z), V(x + 0.25, JY, z)], 0.006, 4); }
      tb(ms, 'rope', [V(x - 0.24, y + 0.02, za + 0.1), V(x, y + 0.04, za), V(x + 0.24, y + 0.02, za + 0.1)], 0.006, 4);
    }
    // canoe paddles across the right aisle, a coil of rope, a blaze-orange vest on a hanger
    for (const [z, y] of [[2.46, 3.28], [2.5, 3.2]] as [number, number][]) {
      ms.pushT(0.6, y, z, 0, 0, Math.PI / 2 + r.range(-0.03, 0.03));
      lathe(ms, 'board_warm', [[0.0001, -0.75], [0.016, -0.74], [0.016, 0.2], [0.07, 0.35], [0.075, 0.6], [0.04, 0.74], [0.0001, 0.75]], 6);
      ms.pop();
    }
    for (const x of [0.0, 1.25]) tb(ms, 'galv', [V(x, JY, 2.46), V(x, 3.18, 2.46), V(x, 3.18, 2.56)], 0.003, 3, { smooth: false });
    for (const [x, z] of [[-2.0, -2.34], [-2.5, -2.34]] as [number, number][]) {
      hook(x, z, 3.0);
      const coil: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) { const a = (i / 60) * Math.PI * 10; coil.push(V(x + Math.cos(a) * 0.13, 2.85 + Math.sin(a) * 0.13 - i * 0.0004, z + (i / 60) * 0.06)); }
      tb(ms, 'rope', coil, 0.011, 4);
    }
    {
      const x = 1.0, z = -1.14;
      hook(x, z, 3.05);
      tb(ms, 'galv', [V(x - 0.2, 2.95, z), V(x, 3.05, z), V(x + 0.2, 2.95, z), V(x - 0.2, 2.95, z)], 0.004, 3, { smooth: false });
      ms.pushT(x, 2.68, z, Math.PI / 2 + 0.2);
      for (const s of [1, -1]) {
        ms.pushT(0, 0, s * 0.004, s > 0 ? 0 : Math.PI);
        for (const side of [-1, 1]) {
          // one front panel: hem, side seam under the arm hole, shoulder strap, the V neck
          const P = (x: number, y: number) => V(side * x, y, 0);
          const pts = [P(0.015, -0.3), P(0.2, -0.3), P(0.2, 0.02), P(0.15, 0.1), P(0.13, 0.25), P(0.07, 0.25), P(0.015, -0.02)];
          for (let i = 1; i < pts.length - 1; i++) {
            const [a, b, cc] = side > 0 ? [pts[0], pts[i], pts[i + 1]] : [pts[0], pts[i + 1], pts[i]];
            const n = V(0, 0, 1);
            ms.tri(orange, a, b, cc, n, n, n, [0, 0], [1, 0], [1, 1]);
          }
          boxAt(ms, colorMat('reflect', 0xd8d8c8, 0.3, 0.4), side * 0.11, -0.12, 0.002, 0.17, 0.025, 0.002);
        }
        ms.pop();
      }
      ms.pop();
    }
    // mitts and work gloves pinned on a line strung over the front aisle
    {
      const z = 3.66, xa = -2.9, xb = -0.6;
      const line: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; line.push(V(xa + (xb - xa) * t, 3.25 - Math.sin(Math.PI * t) * 0.12, z)); }
      tb(ms, 'rope', line, 0.003, 3);
      const wool = ['blanket', 'wool_grey', colorMat('mitt_g', 0x3e6a44, 0.95), colorMat('mitt_b', 0x2a3a6a, 0.95)];
      for (let i = 0; i < 7; i++) {
        const t = (i + 0.5) / 7, x = xa + (xb - xa) * t, y = 3.25 - Math.sin(Math.PI * t) * 0.12;
        ms.pushT(x, y - 0.12, z, r.range(-0.2, 0.2), 0, r.range(-0.12, 0.12));
        const m = wool[i % 4];
        boxAt(ms, m, 0, 0, 0, 0.1, 0.2, 0.035);
        boxAt(ms, m, 0.06, 0.02, 0, 0.035, 0.08, 0.03, 0, {}, 0, -0.4);
        boxAt(ms, 'galv', 0, 0.11, 0, 0.02, 0.025, 0.04);
        ms.pop();
      }
    }
    // lanterns on hooks over the counter end, rubber boots by their pull loops (props, instanced)
    for (const [x, z] of [[1.0, 3.66], [1.35, 3.66], [-1.3, 4.86]]) { hook(x, z, 3.25); LP.lantern(ms, x, 2.98, z, r.range(0, 6)); }
    [[-2.45, 0.06], [-2.15, 0.06], [-1.85, 0.06]].forEach(([x, z], i) => { hook(x, z, 3.05); LP.boots(ms, x, 2.7, z, i * 0.6 + 0.3); });
    // fly paper spirals: one over the counter, one by the stove, a few flies stuck
    for (const [x, z] of [[2.2, 0.9], [-1.6, -3.0]] as [number, number][]) {
      tb(ms, 'galv', [V(x, CEIL, z), V(x, 3.05, z)], 0.002, 3);
      ms.pushT(x, 2.8, z, 0, 0, 0);
      for (let k = 0; k < 10; k++) {
        ms.pushT(0, 0.22 - k * 0.05, 0, k * 0.45);
        boxAt(ms, amber, 0, 0, 0, 0.045, 0.05, 0.002);
        if (k % 3 === 1) boxAt(ms, black, 0.01, 0.01, 0.002, 0.006, 0.004, 0.003);
        ms.pop();
      }
      ms.pop();
    }
  }

  // ================================================================== the lure end-cap on the gondola
  {
    const x0 = -1.13, x1 = -0.27, z = 1.935, ya = F + 0.25, yb = F + 1.62;
    boxAt(ms, 'board_dark', (x0 + x1) / 2, (ya + yb) / 2, z, x1 - x0, yb - ya, 0.03);
    ms.quad('pegholes', V(x0 + 0.02, ya + 0.02, z + 0.016), V(x1 - 0.02, ya + 0.02, z + 0.016), V(x1 - 0.02, yb - 0.02, z + 0.016), V(x0 + 0.02, yb - 0.02, z + 0.016),
      [0, 0], [(x1 - x0) / 0.05, 0], [(x1 - x0) / 0.05, (yb - ya) / 0.05], [0, (yb - ya) / 0.05]);
    const nc = 6, nr = q === 0 ? 4 : 7;
    for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) {
      const lx = x0 + 0.08 + i * ((x1 - x0 - 0.16) / (nc - 1)), ly = yb - 0.1 - j * ((yb - ya - 0.22) / (nr - 1));
      tb(ms, 'galv', [V(lx, ly + 0.035, z + 0.017), V(lx, ly + 0.035, z + 0.08)], 0.0018, 3, { smooth: false });
      const k = r.int(0, 7);
      const m = r.next() < 0.15 ? 0 : 1 + (r.next() < 0.5 ? 1 : 0); // some hooks sold out, some two deep
      for (let e = 0; e < m; e++) {
        ms.pushT(lx, ly, z + 0.03 + e * 0.012, 0, -0.05, r.range(-0.06, 0.06));
        card(ms, 'lure_cards', 0.046, 0.072, 'sp', PSUB('lure_cards', (k * 24) / 192, (k * 24 + 22) / 192));
        ms.pop();
      }
    }
    ms.pushT((x0 + x1) / 2, yb + 0.12, z + 0.02);
    const [u0, v0, u1, v1] = SIGNS.uv('sign_bait');
    ms.quad('signs', V(-0.36, -0.1, 0), V(0.36, -0.1, 0), V(0.36, 0.1, 0), V(-0.36, 0.1, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    ms.pop();
    boxAt(ms, 'board_dark', (x0 + x1) / 2, yb + 0.12, z + 0.005, 0.76, 0.22, 0.02);
  }

  // ================================================================== the minnow tank under the left window
  const tank = { x: -3.56, z0: 1.42, z1: 2.74, y0: F + 0.56, y1: F + 0.98, d: 0.42 };
  {
    const T = tank, zc = (T.z0 + T.z1) / 2, L = T.z1 - T.z0;
    // stand
    for (const sx of [-1, 1]) for (const z of [T.z0 + 0.04, T.z1 - 0.04]) board(ms, 'board_dark', r, T.x + sx * (T.d / 2 - 0.03), (F + T.y0) / 2, z, 0.05, T.y0 - F, 0.05, 0, { grain: 'y' });
    board(ms, 'board_warm', r, T.x, T.y0 - 0.02, zc, T.d + 0.04, 0.04, L + 0.06, 0, { grain: 'z' });
    board(ms, 'board_warm', r, T.x, F + 0.16, zc, T.d - 0.04, 0.025, L - 0.06, 0, { grain: 'z' });
    // glass, angle-iron edges, the water and gravel
    const gm = glassMat('tank');
    const P = (x: number, y: number, z: number) => V(x, y, z);
    const xa = T.x - T.d / 2, xb = T.x + T.d / 2;
    ms.quad(gm, P(xb, T.y0, T.z1), P(xb, T.y0, T.z0), P(xb, T.y1, T.z0), P(xb, T.y1, T.z1), [0, 0], [L, 0], [L, 0.42], [0, 0.42]);
    ms.quad(gm, P(xa, T.y0, T.z0), P(xb, T.y0, T.z0), P(xb, T.y1, T.z0), P(xa, T.y1, T.z0), [0, 0], [0.42, 0], [0.42, 0.42], [0, 0.42]);
    ms.quad(gm, P(xb, T.y0, T.z1), P(xa, T.y0, T.z1), P(xa, T.y1, T.z1), P(xb, T.y1, T.z1), [0, 0], [0.42, 0], [0.42, 0.42], [0, 0.42]);
    for (const [x, z] of [[xa, T.z0], [xb, T.z0], [xa, T.z1], [xb, T.z1]] as [number, number][]) boxAt(ms, 'galv', x, (T.y0 + T.y1) / 2, z, 0.02, T.y1 - T.y0, 0.02);
    for (const y of [T.y0 + 0.01, T.y1]) { boxAt(ms, 'galv', xb, y, zc, 0.02, 0.02, L); boxAt(ms, 'galv', xa, y, zc, 0.02, 0.02, L); }
    boxAt(ms, colorMat('gravel', 0x6a6458, 1), T.x, T.y0 + 0.025, zc, T.d - 0.02, 0.05, L - 0.02);
    ms.pushT(T.x, T.y0 + 0.05, zc);
    box(ms, 'water', T.d - 0.025, T.y1 - T.y0 - 0.1, L - 0.025, { faces: { ny: null } });
    ms.pop();
    // the aerator line and stone, a plywood lid half on, the dip net on the side, cups and a worm cooler
    tb(ms, black, [V(T.x + 0.1, T.y1 + 0.15, T.z1 - 0.12), V(T.x + 0.12, T.y1 + 0.02, T.z1 - 0.15), V(T.x + 0.12, T.y0 + 0.07, T.z1 - 0.18)], 0.004, 4);
    boxAt(ms, colorMat('airstone', 0xc8c0b0, 1), T.x + 0.12, T.y0 + 0.065, T.z1 - 0.18, 0.04, 0.025, 0.04);
    boxAt(ms, black, T.x + 0.12, T.y1 + 0.2, T.z1 - 0.08, 0.12, 0.08, 0.09);
    board(ms, 'board_grey', r, T.x - 0.02, T.y1 + 0.012, T.z0 + L * 0.3, T.d + 0.02, 0.012, L * 0.6, 0.03, { grain: 'z' });
    tb(ms, 'galv', [V(xb + 0.02, T.y1 - 0.02, T.z0 + 0.2), V(xb + 0.06, T.y1 + 0.5, T.z0 + 0.18)], 0.008, 4);
    const hoop: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2; hoop.push(V(xb + 0.04 + Math.cos(a) * 0.07, T.y1 - 0.12 + Math.sin(a) * 0.09, T.z0 + 0.2)); }
    tb(ms, 'galv', hoop, 0.004, 3, { closed: true });
    for (let k = 0; k < 4; k++) {
      ms.pushT(T.x + 0.05, F + 0.18 + k * 0.012, T.z0 + 0.25);
      lathe(ms, styro, [[0.0001, 0], [0.04, 0], [0.05, 0.09], [0.0001, 0.09]], 8);
      ms.pop();
    }
    ms.pushT(T.x + 0.02, F, T.z1 + 0.32, 0.2);
    boxAt(ms, styro, 0, 0.16, 0, 0.42, 0.32, 0.3);
    boxAt(ms, styro, 0.02, 0.335, 0.01, 0.44, 0.04, 0.32, 0.12);
    ms.pop();
    blob(ms, T.x + 0.02, F, T.z1 + 0.32, 0.7, 0.55);
    cardAt(ms, 'minnow_sign', T.x + T.d / 2 + 0.012, T.y0 - 0.2, zc, Math.PI / 2, ...sz('minnow_sign', 260), 0.04);
    floorDecal(ms, 'g_puddle', T.x + 0.35, F + 0.004, zc - 0.2, 0.7, 0.5, 0.4, 'puddle');
    floorDecal(ms, 'g_stain', T.x + 0.4, F + 0.004, zc + 0.3, 0.6, 0.6, 1.4);
    blob(ms, T.x, F, zc, T.d + 0.4, L + 0.3);
    cols.box(T.x, (F + T.y1) / 2, zc, T.d / 2 + 0.02, (T.y1 - F) / 2, L / 2 + 0.02);
    c.anchors.minnow_tank = anchor(group, 'minnow_tank', T.x + T.d / 2 + 0.3, T.y1, zc, Math.PI / 2);
  }
  // live minnows and bubbles (instanced, animated only when you're near)
  {
    const T = tank;
    const fishGeo = new THREE.OctahedronGeometry(1, 0);
    fishGeo.scale(0.008, 0.007, 0.024);
    const nF = q === 0 ? 10 : 26;
    const fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ color: 0x9aa4a0, roughness: 0.7, metalness: 0.05 }), nF);
    fish.castShadow = false;
    const bubGeo = new THREE.IcosahedronGeometry(0.004, 0);
    const nB = 14;
    const bubs = new THREE.InstancedMesh(bubGeo, new THREE.MeshBasicMaterial({ color: 0xdfeff0, transparent: true, opacity: 0.7 }), nB);
    bubs.castShadow = false;
    group.add(fish, bubs);
    fish.userData.nearOnly = bubs.userData.nearOnly = true;
    const ph = Array.from({ length: nF }, (_, i) => [((i * 7919) % 1000) / 1000 * 6.28, 0.6 + ((i * 104729) % 100) / 200, ((i * 31) % 10) / 10]);
    const d = new THREE.Object3D();
    const zc = (T.z0 + T.z1) / 2, hz = (T.z1 - T.z0) / 2 - 0.08, hx = T.d / 2 - 0.06, ym = (T.y0 + T.y1) / 2 - 0.02;
    const center = new THREE.Vector3();
    let t = 0;
    const place = () => {
      for (let i = 0; i < nF; i++) {
        const [p0, sp, lane] = ph[i];
        const a = t * sp * 0.7 + p0;
        // a school milling about: an ellipse per fish, a shared drift
        const x = T.x + Math.cos(a) * hx * (0.4 + 0.6 * lane), z = zc + Math.sin(a) * hz * (0.5 + 0.5 * lane) + Math.sin(t * 0.3) * 0.08;
        const y = ym + Math.sin(a * 2 + p0) * 0.06 - lane * 0.04;
        d.position.set(x, y, z);
        d.rotation.set(0, Math.atan2(-Math.sin(a) * hx, Math.cos(a) * hz) + Math.PI / 2 + Math.sin(t * 9 + p0) * 0.15, 0);
        d.updateMatrix();
        fish.setMatrixAt(i, d.matrix);
      }
      fish.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < nB; i++) {
        const f = ((t * 0.35 + i / nB) % 1);
        d.position.set(T.x + 0.12 + Math.sin(i * 3.1 + t * 4) * 0.01, T.y0 + 0.08 + f * (T.y1 - T.y0 - 0.12), T.z1 - 0.18 + Math.cos(i * 1.7) * 0.012);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(0.6 + f);
        d.updateMatrix();
        bubs.setMatrixAt(i, d.matrix);
      }
      d.scale.setScalar(1);
      bubs.instanceMatrix.needsUpdate = true;
    };
    place();
    c.updaters.push((dt) => {
      group.localToWorld(center.set(T.x, T.y0, zc));
      if (G.uCamPos.value.distanceToSquared(center) > 14 * 14) return;
      t += dt;
      place();
    });
  }

  // ================================================================== the drink cooler on the back wall
  {
    const x0 = 0.52, x1 = 1.66, zb = -IZ + 0.02, d = 0.68, h = 2.02, zf = zb + d;
    const xc = (x0 + x1) / 2, w = x1 - x0;
    // body: sides, top, kick plate with its grille, the lit back and the shelves
    boxAt(ms, white, x0 + 0.03, F + h / 2, zb + d / 2, 0.06, h, d);
    boxAt(ms, white, x1 - 0.03, F + h / 2, zb + d / 2, 0.06, h, d);
    boxAt(ms, white, xc, F + h - 0.05, zb + d / 2, w, 0.1, d);
    boxAt(ms, black, xc, F + 0.08, zb + d / 2, w, 0.16, d);
    for (let i = 0; i < 12; i++) boxAt(ms, 'galv', x0 + 0.08 + i * (w - 0.16) / 11, F + 0.08, zf + 0.002, 0.01, 0.1, 0.006);
    ms.quad('cool_lit', V(x1 - 0.06, F + 0.16, zb + 0.03), V(x0 + 0.06, F + 0.16, zb + 0.03), V(x0 + 0.06, F + h - 0.1, zb + 0.03), V(x1 - 0.06, F + h - 0.1, zb + 0.03), [0, 0], [1, 0], [1, 1], [0, 1]);
    boxAt(ms, 'cool_lit', xc, F + h - 0.14, zb + d / 2 - 0.05, w - 0.14, 0.02, 0.05);
    const shelves = [F + 0.2, F + 0.62, F + 1.04, F + 1.46];
    for (const y of shelves) boxAt(ms, 'galv', xc, y, zb + d / 2 - 0.02, w - 0.12, 0.012, d - 0.12);
    // stock: cans, brown bottles, milk jugs, pop; a gap or two where it sold
    shelves.forEach((y, si) => {
      const kind = si === 0 ? 'milk' : si === 1 ? 'pop' : si === 2 ? 'bottle' : 'can';
      const step = kind === 'milk' ? 0.12 : kind === 'can' ? 0.075 : 0.08;
      for (let x = x0 + 0.12; x < x1 - 0.1; x += step) {
        if (r.next() < 0.12) continue;
        for (let row = 0; row < 3; row++) {
          ms.pushT(x, y + 0.006, zf - 0.1 - row * 0.15);
          if (kind === 'can') lathe(ms, 'lab_metal', [[0.0001, 0], [0.032, 0], [0.033, 0.01], [0.033, 0.11], [0.028, 0.122], [0.0001, 0.122]], 8, { uNorm: true, vNorm: true, uv: lUV('beer') });
          else if (kind === 'bottle') lathe(ms, 'lab_gloss', [[0.0001, 0], [0.03, 0], [0.031, 0.15], [0.012, 0.2], [0.012, 0.24], [0.0001, 0.24]], 8, { uNorm: true, vNorm: true, uv: lUV('glass_brown') });
          else if (kind === 'milk') lathe(ms, 'lab', [[0.0001, 0], [0.05, 0], [0.05, 0.2], [0.02, 0.25], [0.018, 0.27], [0.0001, 0.27]], 6, { uNorm: true, vNorm: true, uv: lUV('plastic_cream') });
          else lathe(ms, candy[(Math.floor(x * 13) + row) % 5], [[0.0001, 0], [0.032, 0], [0.034, 0.18], [0.014, 0.24], [0.014, 0.27], [0.0001, 0.27]], 7);
          ms.pop();
        }
      }
    });
    // two glass doors with steel frames and long handles, frost along the bottoms
    const gmat = glassMat('cooler');
    for (let k = 0; k < 2; k++) {
      const a = x0 + 0.06 + k * (w - 0.12) / 2, b = a + (w - 0.12) / 2;
      for (const xx of [a + 0.02, b - 0.02]) boxAt(ms, 'galv', xx, F + 0.16 + (h - 0.26) / 2, zf, 0.04, h - 0.26, 0.04);
      for (const yy of [F + 0.18, F + h - 0.12]) boxAt(ms, 'galv', (a + b) / 2, yy, zf, b - a, 0.04, 0.04);
      ms.quad(gmat, V(a + 0.04, F + 0.2, zf), V(b - 0.04, F + 0.2, zf), V(b - 0.04, F + h - 0.14, zf), V(a + 0.04, F + h - 0.14, zf), [0, 0], [b - a, 0], [b - a, h], [0, h]);
      const hx = k === 0 ? b - 0.06 : a + 0.06;
      tb(ms, 'galv', [V(hx, F + 0.8, zf + 0.02), V(hx, F + 0.8, zf + 0.06), V(hx, F + 1.4, zf + 0.06), V(hx, F + 1.4, zf + 0.02)], 0.01, 5, { smooth: false });
      ms.pushT((a + b) / 2, F + 0.32, zf + 0.025);
      card(ms, 'g_frost', b - a - 0.06, 0.25, 'grime');
      ms.pop();
    }
    // the lit header and a beer price card taped crooked to the glass
    ms.pushT(xc, F + h + 0.12, zf - 0.02);
    boxAt(ms, white, 0, 0, -0.04, w, 0.26, 0.1);
    card(ms, 'lb_cooler', w - 0.08, 0.24, 'sp_glow');
    ms.pop();
    cardAt(ms, 'cat_sign', x0 + 0.3, F + 1.2, zf + 0.025, 0, 0.18, 0.09, 0.08);
    cols.box(xc, F + h / 2, zb + d / 2, w / 2, h / 2, d / 2);
    floorDecal(ms, 'g_pool', xc, F + 0.005, zf + 0.6, 1.6, 1.3, 0, 'glowcool');
    floorDecal(ms, 'g_puddle', xc - 0.2, F + 0.004, zf + 0.12, 0.5, 0.25, 0.2, 'puddle');
    blob(ms, xc, F, zb + d / 2, w + 0.3, d + 0.3);
    c.anchors.cooler = anchor(group, 'cooler', xc, F + 1.0, zf + 0.5, 0);
    // and its hum, played while you're near
    const humAt = new THREE.Vector3();
    const hum = coolerHum(humAt);
    c.updaters.push((dt) => { group.localToWorld(humAt.set(xc, F + 0.3, zf)); hum(dt); });
  }

  // ================================================================== the penny-candy case, front right
  {
    const x = IX - 0.27, z0 = 3.2, z1 = 4.5, zc = (z0 + z1) / 2, L = z1 - z0, dep = 0.5, h = 0.72;
    board(ms, 'boards_green', r, x, F + h / 2, zc, dep, h, L, 0, { grain: 'y' });
    for (let z = z0 + 0.15; z < z1; z += 0.3) boxAt(ms, 'board_dark', x - dep / 2 - 0.01, F + h / 2, z, 0.02, h - 0.12, 0.05);
    board(ms, 'board_dark', r, x, F + h + 0.015, zc, dep + 0.04, 0.03, L + 0.04, 0, { grain: 'z' });
    // three stepped trays behind a sloped glass front (facing -X)
    const trays = 3;
    for (let k = 0; k < trays; k++) {
      const tx = x - dep / 2 + 0.09 + k * 0.14, ty = F + h + 0.05 + k * 0.075;
      boxAt(ms, 'board_warm', tx, ty - 0.02, zc, 0.13, 0.02, L - 0.06);
      for (let s = 0; s < 6; s++) {
        const za = z0 + 0.04 + s * ((L - 0.08) / 6), zb2 = za + (L - 0.08) / 6 - 0.01;
        boxAt(ms, 'galv', tx, ty, zb2 + 0.005, 0.13, 0.03, 0.006);
        const m = candy[(s + k * 2) % candy.length];
        if (q === 0) { boxAt(ms, m, tx, ty, (za + zb2) / 2, 0.12, 0.02, zb2 - za - 0.01); continue; }
        for (let i = 0; i < 14; i++) {
          const kind = (s + k) % 3;
          const px = tx + r.range(-0.05, 0.05), pz = r.range(za + 0.012, zb2 - 0.012), py = ty - 0.005 + r.range(0, 0.02);
          if (kind === 0) boxAt(ms, m, px, py, pz, 0.018, 0.012, 0.03, r.range(0, 3));
          else if (kind === 1) boxAt(ms, i % 2 ? m : candy[5], px, py, pz, 0.014, 0.014, 0.014, r.range(0, 3), {}, r.range(0, 1), r.range(0, 1));
          else tb(ms, m, [V(px - 0.02, py, pz), V(px, py + 0.006, pz + 0.01), V(px + 0.02, py, pz)], 0.004, 3, { smooth: false });
        }
      }
    }
    const gm = glassMat('case');
    const ga = V(x - dep / 2 + 0.02, F + h + 0.03, z0), gb = V(x - dep / 2 + 0.02, F + h + 0.03, z1), gc = V(x + 0.1, F + h + 0.34, z1), gd = V(x + 0.1, F + h + 0.34, z0);
    ms.quad(gm, ga, gb, gc, gd, [0, 0], [L, 0], [L, 0.4], [0, 0.4]);
    ms.quad(gm, gb, ga, gd, gc, [0, 0], [L, 0], [L, 0.4], [0, 0.4]);
    for (const z of [z0, z1]) ms.quad('board_dark', V(x - dep / 2 + 0.02, F + h + 0.03, z), V(x + dep / 2, F + h + 0.03, z), V(x + dep / 2, F + h + 0.34, z), V(x + 0.1, F + h + 0.34, z), [0, 0], [0.5, 0], [0.5, 0.3], [0, 0.3]);
    boxAt(ms, 'board_dark', x + 0.17, F + h + 0.35, zc, 0.18, 0.02, L);
    // jars of jawbreakers and licorice on top, the scoop, the card
    for (let j = 0; j < 3; j++) {
      const jz = z0 + 0.25 + j * 0.4, jx = x + 0.16;
      ms.pushT(jx, F + h + 0.36, jz);
      lathe(ms, gm, [[0.0001, 0], [0.07, 0], [0.075, 0.02], [0.075, 0.17], [0.05, 0.2], [0.05, 0.215], [0.0001, 0.215]], 8);
      lathe(ms, 'lab_metal', [[0.055, 0.21], [0.055, 0.235], [0.0001, 0.24]], 8, { uNorm: true, vNorm: true, uv: lUV('tin_gold') });
      for (let i = 0; i < (q === 0 ? 4 : 16); i++) {
        const a = i * 2.4, rr = 0.045 * Math.sqrt((i % 6) / 6 + 0.1);
        boxAt(ms, candy[(i + j * 3) % candy.length], Math.cos(a) * rr, 0.02 + Math.floor(i / 6) * 0.025, Math.sin(a) * rr, 0.022, 0.022, 0.022, a);
      }
      ms.pop();
    }
    boxAt(ms, 'galv', x - 0.05, F + h + 0.37, z0 + 0.6, 0.06, 0.04, 0.12, 0.6);
    cardAt(ms, 'candy_card', x - 0.02, F + h + 0.47, z1 - 0.12, -Math.PI / 2 + 0.25, ...sz('candy_card', 300), 0.05);
    // the candy bar rack hung on the wall above: three stepped rows of wrappers
    for (let k = 0; k < 3; k++) {
      const yy = F + 1.45 + k * 0.1, xx = IX - 0.06 - k * 0.0;
      boxAt(ms, 'board_dark', xx, yy - 0.012, zc, 0.12, 0.012, L - 0.1);
      for (let i = 0; i < 12; i++) {
        const wk = (i + k * 5) % 6;
        ms.pushT(xx - 0.05, yy + 0.03, z0 + 0.12 + i * ((L - 0.24) / 11), -Math.PI / 2, -0.25);
        card(ms, 'candy_bars', 0.09, 0.036, 'sp', PSUB('candy_bars', wk / 6, (wk + 1) / 6));
        ms.pop();
      }
    }
    cardAt(ms, 'wmu_map', IX - 0.006, F + 2.12, zc, -Math.PI / 2, ...sz('wmu_map', 190), 0.01);
    cardAt(ms, 'licences', IX - 0.006, F + 2.1, z0 - 0.3, -Math.PI / 2, ...sz('licences', 260), -0.03);
    floorDecal(ms, 'g_wear', x - dep / 2 - 0.35, F + 0.003, zc, 0.6, L + 0.4, 0);
    blob(ms, x, F, zc, dep + 0.3, L + 0.3);
    cols.box(x, F + 0.55, zc, dep / 2, 0.55, L / 2);
    c.anchors.candy_case = anchor(group, 'candy_case', x - dep / 2 - 0.4, F + h, zc, -Math.PI / 2);
  }

  // ================================================================== scratch tickets, the lotto box, the counter's clutter
  {
    const x = 1.86, z = 0.86;
    ms.pushT(x, ch, z);
    boxAt(ms, 'wrap', 0, 0.13, 0, 0.12, 0.26, 0.3);
    boxAt(ms, black, 0, 0.005, 0, 0.13, 0.01, 0.31);
    for (let k = 0; k < 3; k++) {
      const zz = -0.1 + k * 0.1;
      ms.pushT(-0.03, 0.2, zz, -Math.PI / 2);
      card(ms, 'scratch', 0.075, 0.11, 'sp', PSUB('scratch', (k * 22) / 66, (k * 22 + 20) / 66));
      ms.pop();
      // the strip folding out over the front lip, two tickets hanging
      ms.pushT(-0.065, 0.06, zz, -Math.PI / 2, 0.15);
      card(ms, 'scratch', 0.075, 0.11, 'sp_ds', PSUB('scratch', (k * 22) / 66, (k * 22 + 20) / 66));
      ms.pop();
    }
    ms.pop();
    // the lotto light box hung over the counter on chains
    ms.pushT(1.92, 2.72, 0.5, -Math.PI / 2);
    boxAt(ms, black, 0, 0, -0.04, 0.6, 0.24, 0.07);
    card(ms, 'lotto', 0.56, 0.2, 'sp_glow');
    for (const s of [-0.25, 0.25]) tb(ms, 'iron', [V(s, 0.12, -0.04), V(s, CEIL - 2.72, -0.04)], 0.002, 3);
    ms.pop();
    // a spike of receipts, a jar of pens, a donation jar for the fire hall, a call bell
    ms.pushT(1.9, ch, -0.62);
    boxAt(ms, black, 0, 0.005, 0, 0.06, 0.01, 0.06);
    tb(ms, 'galv', [V(0, 0, 0), V(0, 0.16, 0)], 0.002, 3);
    for (let k = 0; k < 6; k++) { ms.pushT(0, 0.02 + k * 0.012, 0, k * 1.1, -Math.PI / 2 + 0.06); ms.quad('lab', V(-0.04, -0.06, 0), V(0.04, -0.06, 0), V(0.04, 0.06, 0), V(-0.04, 0.06, 0), [0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02]); ms.pop(); }
    ms.pop();
    ms.pushT(1.84, ch, -0.18);
    lathe(ms, glassMat('case'), [[0.0001, 0], [0.04, 0], [0.04, 0.11], [0.0001, 0.11]], 8);
    for (let k = 0; k < 5; k++) tb(ms, candy[k], [V(0.0, 0.01, 0), V(Math.cos(k * 1.3) * 0.02, 0.17 + k * 0.006, Math.sin(k * 1.3) * 0.02)], 0.004, 3, { smooth: false });
    ms.pop();
    ms.pushT(2.25, ch, -0.95 + 0.5);
    lathe(ms, glassMat('case'), [[0.0001, 0], [0.06, 0], [0.065, 0.15], [0.045, 0.18], [0.0001, 0.18]], 8);
    for (let k = 0; k < 8; k++) boxAt(ms, k % 2 ? colorMat('coin', 0xb0a890, 0.4, 0.6) : colorMat('bill', 0x6a8a5a, 0.9), Math.cos(k) * 0.03, 0.01 + k * 0.006, Math.sin(k) * 0.03, 0.03, 0.004, k % 2 ? 0.03 : 0.05, k);
    ms.pop();
    ms.pushT(1.84, ch, 0.04);
    lathe(ms, 'galv', [[0.0001, 0], [0.04, 0], [0.04, 0.008], [0.035, 0.03], [0.02, 0.045], [0.0001, 0.05]], 8);
    tb(ms, 'galv', [V(0, 0.05, 0), V(0, 0.062, 0)], 0.004, 3);
    ms.pop();
    // the jerky display box at the counter's front edge
    ms.pushT(1.86, ch, -0.4, -Math.PI / 2 + 0.1);
    printBox(ms, 'ship_box', 0.2, 0.08, 0.14, '');
    cardAt(ms, 'jerky_box', 0, 0.15, -0.065, 0, 0.2, 0.125, 0);
    for (let k = 0; k < 6; k++) boxAt(ms, colorMat('jerky_s', 0x5a2a18, 0.8), -0.06 + k * 0.025, 0.09, 0, 0.012, 0.1, 0.02, 0, {}, 0.15, r.range(-0.2, 0.2));
    ms.pop();
    cardAt(ms, 'notice_in', 1.735, ch - 0.25, 1.4, -Math.PI / 2, ...sz('notice_in', 280), 0.02);
    cardAt(ms, 'fl_cat', 1.735, ch - 0.35, -1.75, -Math.PI / 2, ...sz('fl_cat', 300), -0.04);
  }
  // ---- the cat, asleep at the counter's front end
  {
    const cat = sleepingCat(3);
    cat.group.position.set(2.06, ch + 0.002, 1.52);
    cat.group.rotation.y = 2.3;
    group.add(cat.group);
    cat.group.userData.nearOnly = true;
    c.updaters.push((dt) => cat.tick(dt));
    blob(ms, 2.06, ch, 1.52, 0.42, 0.38);
    floorDecal(ms, 'g_dust', 2.06, ch + 0.002, 1.52, 0.5, 0.45, 0.3);
    c.anchors.cat = anchor(group, 'cat', 2.06, ch, 1.52, 0);
  }

  // ================================================================== the coffee corner by the stove
  {
    const x = -0.9, z = -IZ + 0.24, ty = F + 0.78;
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) board(ms, 'board_warm', r, x + sx * 0.36, (F + ty) / 2, z + sz2 * 0.17, 0.04, ty - F, 0.04, 0, { grain: 'y' });
    board(ms, 'board_warm', r, x, ty, z, 0.82, 0.03, 0.44, 0, { grain: 'x' });
    board(ms, 'board_dark', r, x, F + 0.2, z, 0.74, 0.02, 0.38, 0, { grain: 'x' });
    // drip machine with its carafe, a stack of cups, sugar, the honour can, a mug tree
    ms.pushT(x - 0.2, ty + 0.015, z - 0.04);
    boxAt(ms, black, 0, 0.16, -0.05, 0.18, 0.32, 0.12);
    boxAt(ms, black, 0, 0.3, 0.04, 0.18, 0.06, 0.16);
    boxAt(ms, black, 0, 0.015, 0.05, 0.18, 0.03, 0.16);
    boxAt(ms, colorMat('led', 0xff3020, 0.5, 0, 2), 0.06, 0.06, 0.011, 0.012, 0.008, 0.004);
    ms.pushT(0, 0.03, 0.05);
    lathe(ms, glassMat('case'), [[0.0001, 0], [0.065, 0], [0.07, 0.06], [0.05, 0.13], [0.045, 0.15], [0.0001, 0.15]], 8);
    lathe(ms, colorMat('coffee', 0x2a160c, 0.15), [[0.0001, 0.005], [0.062, 0.005], [0.066, 0.05], [0.0001, 0.05]], 8);
    ms.pop();
    ms.pop();
    for (let k = 0; k < 2; k++) {
      ms.pushT(x + 0.02 + k * 0.1, ty + 0.015, z + 0.08);
      for (let i = 0; i < 6; i++) { ms.pushT(0, i * 0.02, 0); lathe(ms, styro, [[0.0001, 0], [0.03, 0], [0.042, 0.1], [0.0001, 0.1]], 8); ms.pop(); }
      ms.pop();
    }
    ms.pushT(x + 0.22, ty + 0.015, z - 0.08);
    lathe(ms, glassMat('case'), [[0.0001, 0], [0.04, 0], [0.04, 0.12], [0.0001, 0.12]], 8);
    lathe(ms, white, [[0.0001, 0], [0.037, 0], [0.037, 0.08], [0.0001, 0.08]], 8);
    lathe(ms, 'galv', [[0.042, 0.12], [0.03, 0.15], [0.008, 0.17], [0.0001, 0.17]], 8);
    ms.pop();
    ms.pushT(x + 0.3, ty + 0.015, z + 0.1);
    lathe(ms, 'lab_metal', [[0.0001, 0], [0.065, 0], [0.065, 0.16], [0.0001, 0.16]], 8, { uNorm: true, vNorm: true, uv: lUV('coffee') });
    boxAt(ms, black, 0, 0.162, 0, 0.06, 0.004, 0.012);
    ms.pop();
    ms.pushT(x + 0.08, ty + 0.015, z - 0.1);
    tb(ms, 'board_dark', [V(0, 0, 0), V(0, 0.3, 0)], 0.008, 4);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      ms.pushT(Math.cos(a) * 0.07, 0.12 + (k % 2) * 0.08, Math.sin(a) * 0.07, -a);
      lathe(ms, candy[[0, 6, 2, 5][k]], [[0.0001, 0], [0.035, 0], [0.038, 0.09], [0.0001, 0.09]], 8);
      ms.pop();
    }
    ms.pop();
    floorDecal(ms, 'g_stain', x + 0.05, ty + 0.017, z + 0.02, 0.5, 0.35, 0.4);
    cardAt(ms, 'coffee_card', x - 0.25, F + 1.32, -IZ + 0.006, 0, ...sz('coffee_card', 280), 0.04);
    blob(ms, x, F, z, 1.0, 0.6);
    cols.box(x, (F + ty) / 2, z, 0.42, (ty - F) / 2, 0.22);
    c.anchors.coffee = anchor(group, 'coffee', x, ty, z + 0.6, Math.PI);
  }
  // ---- mitts and socks drying on a wire from the stovepipe to a joist
  {
    const a = V(-0.83, 2.55, -3.63), b = V(-2.9, 2.72, -3.54);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(a.clone().lerp(b, t).add(V(0, -Math.sin(Math.PI * t) * 0.1, 0))); }
    tb(ms, 'galv', pts, 0.0018, 3);
    tb(ms, 'galv', [b, V(b.x, JY, b.z)], 0.002, 3);
    const things = ['wool_grey', 'blanket', 'wool_grey', colorMat('sock_r', 0x8a2a24, 1)];
    for (let i = 0; i < 4; i++) {
      const t = 0.2 + i * 0.18, p = a.clone().lerp(b, t).add(V(0, -Math.sin(Math.PI * t) * 0.1, 0));
      ms.pushT(p.x, p.y, p.z, r.range(-0.3, 0.3));
      if (i % 2) { boxAt(ms, things[i], 0, -0.1, 0, 0.1, 0.2, 0.03); boxAt(ms, things[i], 0.06, -0.08, 0, 0.035, 0.08, 0.03, 0, {}, 0, -0.4); }
      else { tb(ms, things[i], [V(0, 0, 0), V(0, -0.2, 0), V(0.04, -0.27, 0), V(0.1, -0.28, 0)], 0.025, 5); }
      boxAt(ms, 'board_warm', 0, 0.005, 0, 0.012, 0.05, 0.02);
      ms.pop();
    }
  }

  // ================================================================== cardboard: the bug-spray dump bin, cartons
  {
    const x = -1.45, z = 3.42;
    ms.pushT(x, F, z, 0.2);
    printBox(ms, 'ship_box', 0.46, 0.55, 0.46, '');
    boxAt(ms, 'board_grey', 0, 0.42, 0, 0.42, 0.01, 0.42);
    for (let i = 0; i < (q === 0 ? 5 : 14); i++) {
      const px = r.range(-0.17, 0.17), pz = r.range(-0.17, 0.17);
      ms.pushT(px, 0.43, pz, 0, r.range(-0.25, 0.25), r.range(-0.25, 0.25));
      lathe(ms, colorMat('spray', 0x2a6a3a, 0.4, 0.4), [[0.0001, 0], [0.03, 0], [0.03, 0.16], [0.02, 0.18], [0.0001, 0.19]], 7);
      boxAt(ms, colorMat('cy_y', 0xf0c830, 0.35), 0, 0.2, 0, 0.03, 0.02, 0.03);
      ms.pop();
    }
    // header on a cardboard stalk
    boxAt(ms, 'board_grey', 0, 0.75, -0.2, 0.04, 0.4, 0.01);
    cardAt(ms, 'bug_spray', 0, 0.92, -0.19, 0, 0.36, 0.24, 0);
    ms.pop();
    blob(ms, x, F, z, 0.7, 0.7);
    cols.box(x, F + 0.3, z, 0.24, 0.3, 0.24, 0.2);
    // cartons by the propane tank, one open with packing paper
    const cz = -4.42;
    for (const [bx, by, ry, open] of [[-0.37, 0, 0.1, false], [-0.35, 0.34, -0.15, false], [0.15, 0, 0.5, true]] as [number, number, number, boolean][]) {
      ms.pushT(bx, F + by, cz, ry);
      printBox(ms, 'ship_box', 0.48, 0.34, 0.34, open ? '' : 'board_grey');
      if (open) {
        boxAt(ms, 'board_grey', 0, 0.2, 0, 0.44, 0.01, 0.3);
        for (let k = 0; k < 4; k++) { ms.pushT(r.range(-0.15, 0.15), 0.26, r.range(-0.1, 0.1), r.range(0, 3), r.range(-0.6, 0.6)); boxAt(ms, white, 0, 0, 0, 0.12, 0.06, 0.1); ms.pop(); }
        for (const s of [-1, 1]) { ms.pushT(s * 0.24, 0.34, 0, 0, 0, -s * 0.9); boxAt(ms, 'board_grey', s * 0.08, 0, 0, 0.16, 0.006, 0.33); ms.pop(); }
      }
      ms.pop();
    }
    blob(ms, -0.1, F, cz, 1.1, 0.6);
    cols.box(-0.1, F + 0.35, cz, 0.55, 0.35, 0.2);
  }

  // ================================================================== a boot tray and a broom by the door, the mat
  {
    boxAt(ms, colorMat('mat', 0x2a2622, 1), 0, F + 0.007, IZ - 0.42, 0.95, 0.014, 0.6);
    for (let i = 0; i < 4; i++) floorDecal(ms, 'g_mud', r.range(-0.3, 0.3), F + 0.016, IZ - 0.42 + r.range(-0.2, 0.2), 0.32, 0.32, r.range(0, 6));
    boxAt(ms, black, -1.0, F + 0.02, IZ - 0.25, 0.7, 0.03, 0.38);
    LP.boots(ms, -1.18, F + 0.035, IZ - 0.26, 0.15);
    LP.boots(ms, -0.82, F + 0.035, IZ - 0.24, -0.4);
    floorDecal(ms, 'g_mud', -1.0, F + 0.037, IZ - 0.25, 0.65, 0.34, 0);
    // broom leaning in the corner by the door
    tb(ms, 'board_warm', [V(0.78, F + 0.2, IZ - 0.08), V(0.86, F + 1.45, IZ - 0.06)], 0.012, 5);
    ms.pushT(0.775, F + 0.12, IZ - 0.085, 0, 0, 0.06);
    lathe(ms, colorMat('straw', 0xc8a858, 1), [[0.0001, -0.12], [0.11, -0.11], [0.05, 0.08], [0.015, 0.12], [0.0001, 0.12]], 8);
    ms.pop();
  }

  // ================================================================== wear, dust, cobwebs, light pools
  {
    // the path from the door to the counter, round the stove, along the shelves
    const path: [number, number][] = [[0, 4.8], [0.25, 3.8], [0.6, 2.8], [0.9, 1.9], [1.2, 1.0], [1.25, 0.1], [1.15, -0.8]];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      floorDecal(ms, 'g_wear', (ax + bx) / 2, F + 0.002, (az + bz) / 2, 0.95, Math.hypot(bx - ax, bz - az) + 0.35, Math.atan2(bx - ax, bz - az));
    }
    for (const [x, z, w, d, ry] of [[-2.25, 0.1, 0.9, 4.2, 0], [-0.1, -2.2, 1.6, 1.2, 0.3], [-0.9, -2.3, 1.3, 0.6, 0]] as [number, number, number, number, number][]) floorDecal(ms, 'g_wear', x, F + 0.002, z, w, d, ry);
    for (let i = 0; i < 9; i++) floorDecal(ms, 'g_mud', r.range(-0.4, 0.9), F + 0.0035, r.range(2.6, 4.6), 0.28, 0.28, r.range(0, 6));
    // grime along the foot of the shelving and the counter
    for (const [x, z, w, d] of [[-3.42, -2.6, 0.25, 2.2], [-3.42, 0.1, 0.25, 2.2], [-0.7, 0.6, 1.0, 2.8], [1.68, -0.25, 0.22, 4.4]] as [number, number, number, number][]) floorDecal(ms, 'g_blob', x, F + 0.0025, z, w * 1.6, d * 1.05, 0);
    // dust on shelf tops and up high
    for (const [x, y, z, w, d] of [[-3.64, F + 2.12 + 0.37, -2.6, 0.5, 2.0], [-3.64, F + 2.12 + 0.37, 0.1, 0.5, 2.0], [-0.7, F + 1.2 + 0.32 + 0.11, 0.6, 0.9, 2.5]] as [number, number, number, number, number][]) floorDecal(ms, 'g_dust', x, y, z, w, d, 0);
    // cobwebs in the corners under the joists
    const web = (x: number, y: number, z: number, ry: number, s: number) => { ms.pushT(x, y, z, ry, 0, Math.PI); card(ms, 'g_web', s, s, 'grime'); ms.pop(); };
    web(-IX + 0.3, CEIL - 0.3, -IZ + 0.01, 0, 0.6);
    web(IX - 0.01, CEIL - 0.25, -IZ + 0.3, -Math.PI / 2, 0.5);
    web(-IX + 0.01, CEIL - 0.3, IZ - 0.35, Math.PI / 2, 0.55);
    web(IX - 0.3, CEIL - 0.3, IZ - 0.01, Math.PI, 0.45);
    web(-0.83, CEIL - 0.2, -3.6, 0.6, 0.35);
    // warm light pools under the pendants (additive), and on the counter
    for (const [x, z, s] of [[2.05 - 0.4, -0.2, 2.2], [-0.8, 0.5, 2.6], [-0.8, -2.6, 2.4], [-1.4, 3.6, 2.4]] as [number, number, number][]) floorDecal(ms, 'g_pool', x, F + 0.006, z, s, s, 0, 'glowadd');
    floorDecal(ms, 'g_pool', 2.05, ch + 0.004, -0.2, 0.62, 1.6, 0, 'glowadd');
  }
  // floating dust in the lamplight (one Points draw; skipped on low)
  if (q > 0) {
    const n = q >= 2 ? 220 : 100;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = r.range(-IX + 0.2, IX - 0.2); pos[i * 3 + 1] = F + r.range(0.3, 2.9); pos[i * 3 + 2] = r.range(-IZ + 0.3, IZ - 0.3);
      seed[i] = r.range(0, 100);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const uTime = { value: 0 };
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime },
      vertexShader: `attribute float seed; uniform float uTime; varying float vA;
        void main(){ vec3 p = position;
          p.x += sin(uTime*0.13 + seed)*0.22; p.y += sin(uTime*0.09 + seed*1.7)*0.16; p.z += cos(uTime*0.11 + seed*0.7)*0.22;
          vec4 mv = modelViewMatrix*vec4(p,1.);
          vA = 0.5 + 0.5*sin(uTime*0.8 + seed*3.0);
          gl_PointSize = clamp(3.0 / -mv.z, 1.0, 2.0); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0,0.82,0.55)*vA*vA*0.14,1.0); }',
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'store_dust';
    pts.frustumCulled = false;
    group.add(pts);
    pts.userData.nearOnly = true;
    const center = new THREE.Vector3();
    c.updaters.push((dt) => {
      group.localToWorld(center.set(0, F + 1.5, 0));
      pts.visible = G.uCamPos.value.distanceToSquared(center) < 30 * 30;
      if (pts.visible) uTime.value += dt;
    });
  }
}

void box;
