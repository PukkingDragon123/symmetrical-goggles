// Pruneau's from the road: the porch (ice merchandiser, bait fridge with its VERS / WORMS card, the bench's
// coffee-can ashtray, extension cords), a propane exchange cage, a firewood-bundle rack, the community corner (a
// roofed bulletin board layered with flyers, a pay phone, the rural route mailboxes), neon and light boxes in the
// display windows, a painted fascia valance, a ghost ad on the side wall, the gas island's signs and bucket, a
// power drop from the road, and the mud: tyre ruts with puddles, boot prints, drips and grime.
// Store-local frame (see store.ts): the shop front faces +Z, origin at the footprint centre on the ground.
import * as THREE from 'three';
import { Mesher, Rand, Cols, V, box, boxAt, board, logAB, lathe, defineMat, hasMat, placeMat } from '../kit';
import { LABELS } from '../signs';
import { writeSplit } from '../products';
import { PUV, PSUB, card, cardAt, floorDecal, groundDecal } from './print';
import { colorMat, propInstances, blob, prop, tb, type Xf } from './inst';
import { neonMats, neonWord, neonRect, neonHalo } from './neon';
import { PRINT_RECTS } from './print_rects';

export interface StoreDims { W: number; D: number; T: number; FLOOR: number; CEIL: number; IX: number; IZ: number; PORCH: number }
export interface DressStore {
  ms: Mesher;
  /** decoration that casts no shadows */
  dms: Mesher;
  cols: Cols; group: THREE.Group; anchors: Record<string, THREE.Object3D>;
  pending: Promise<unknown>[]; updaters: ((dt: number) => void)[];
  /** ground height (store-local y) at store-local x, z */
  ground: (x: number, z: number) => number;
  q: number; dims: StoreDims;
  /** neon / halo materials the store's update dims with the hour */
  glow: { flick: THREE.MeshBasicMaterial[]; halos: THREE.Material[] };
}

const px = (k: string) => PRINT_RECTS[k];
/** physical size of a print entry at `ppm` pixels per metre */
const sz = (k: string, ppm = 300): [number, number] => [px(k)[2] / ppm, px(k)[3] / ppm];

function ensureExtMats(): void {
  if (hasMat('wiremesh')) return;
  // a welded wire mesh (alpha-tested): 5 cm cells
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 8, 8);
  g.fillStyle = '#9aa0a4'; g.fillRect(0, 0, 8, 1); g.fillRect(0, 0, 1, 8);
  g.fillStyle = '#5c6064'; g.fillRect(1, 1, 7, 0.0001);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(20, 20);
  defineMat('wiremesh', new THREE.MeshStandardMaterial({ name: 'place_wiremesh', map: t, alphaTest: 0.5, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }));
  // shrink wrap on firewood bundles: clear, glossy, a little milky
  defineMat('wrap', new THREE.MeshStandardMaterial({ name: 'place_wrap', color: 0xe8eef0, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }));
}

/** an open-top carton of print `key` on its sides (store_print atlas), w x h x d, at the current frame */
function printBox(ms: Mesher, key: string, w: number, h: number, d: number, top = 'board_grey'): void {
  const [u0, v0, u1, v1] = PUV(key);
  const q = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, dd: THREE.Vector3) => ms.quad('sp', a, b, c, dd, [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  const x = w / 2, z = d / 2;
  q(V(-x, 0, z), V(x, 0, z), V(x, h, z), V(-x, h, z));
  q(V(x, 0, -z), V(-x, 0, -z), V(-x, h, -z), V(x, h, -z));
  q(V(x, 0, z), V(x, 0, -z), V(x, h, -z), V(x, h, z));
  q(V(-x, 0, -z), V(-x, 0, z), V(-x, h, z), V(-x, h, -z));
  if (top) ms.quad(top, V(-x, h, z), V(x, h, z), V(x, h, -z), V(-x, h, -z), [0, 0], [w, 0], [w, d], [0, d]);
}
export { printBox };

export function dressExterior(c: DressStore): void {
  ensureExtMats();
  const { ms, cols, group, q, ground } = c;
  const { W, D, T, FLOOR, PORCH } = c.dims;
  const r = new Rand(5150);
  const deck = FLOOR - 0.02;
  const white = colorMat('white', 0xe4e2da, 0.5);
  const styro = colorMat('styro', 0xf0eee6, 0.9);
  const black = colorMat('black', 0x1c1c1e, 0.5);
  const brass = colorMat('brass', 0xa88a40, 0.35, 0.7);
  const yellow = colorMat('yellow', 0xd8b020, 0.6);
  const cord = colorMat('cord', 0xc85a1a, 0.6);

  // ================================================================== porch
  // ---- ice merchandiser at the left end, against the wall
  {
    const x = -3.62, z = D / 2 + 0.42, w = 0.92, h = 1.28, d = 0.72;
    ms.pushT(x, deck, z);
    boxAt(ms, white, 0, 0.11 + (h - 0.1) / 2, 0, w, h - 0.1, d);
    // feet, the compressor grille, the door with its print, the hinge side, a gasket line
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) boxAt(ms, 'iron', sx * (w / 2 - 0.06), 0.05, sz2 * (d / 2 - 0.06), 0.05, 0.1, 0.05);
    boxAt(ms, black, 0, 0.17, d / 2 + 0.003, w - 0.1, 0.11, 0.01);
    for (let i = 0; i < 9; i++) boxAt(ms, 'galv', -w / 2 + 0.1 + i * (w - 0.2) / 8, 0.17, d / 2 + 0.01, 0.012, 0.09, 0.008);
    ms.pushT(0, 0.3 + 0.48, d / 2 + 0.008);
    card(ms, 'ice_door', 0.86, 0.95);
    ms.pop();
    boxAt(ms, 'galv', w / 2 - 0.12, 0.8, d / 2 + 0.03, 0.04, 0.3, 0.04);
    floorDecal(ms, 'g_frost', 0, h + 0.012, 0, w * 0.9, d * 0.8);
    // a bag of ice nobody paid for, melting on top; a stack of coffee cans
    boxAt(ms, 'wrap', 0.1, h + 0.07, 0.05, 0.36, 0.12, 0.24, 0.3);
    ms.pop();
    floorDecal(ms, 'g_drip', x, deck + 0.004, z + d / 2 + 0.2, 0.7, 0.4, Math.PI);
    floorDecal(ms, 'g_puddle', x + 0.15, deck + 0.006, z + d / 2 + 0.22, 0.55, 0.3, 0.2, 'puddle');
    blob(ms, x, deck, z, w * 1.2, d * 1.3);
    cols.box(x, deck + h / 2, z, w / 2, h / 2, d / 2);
  }
  // ---- the bait fridge right of the door: an old rounded fridge, VERS / WORMS taped to it, a cooler on top
  {
    const x = 2.08, z = D / 2 + 0.38, w = 0.68, h = 1.42, d = 0.6;
    ms.pushT(x, deck, z, -0.04);
    boxAt(ms, white, 0, 0.08 + (h - 0.16) / 2, 0, w, h - 0.16, d);
    // the crown, a little proud and rounded off by eye
    boxAt(ms, white, 0, h - 0.04, 0, w - 0.03, 0.08, d - 0.03);
    boxAt(ms, 'galv', 0, h - 0.085, d / 2 - 0.005, w - 0.04, 0.012, 0.012);
    boxAt(ms, 'iron', 0, 0.04, 0, w - 0.04, 0.08, d - 0.04);
    // door seam, chrome handle, the card and its tape
    boxAt(ms, 'galv', 0, h * 0.62, d / 2 + 0.002, w - 0.02, 0.008, 0.006);
    tb(ms, 'galv', [V(w / 2 - 0.07, 0.7, d / 2), V(w / 2 - 0.07, 0.7, d / 2 + 0.04), V(w / 2 - 0.07, 1.02, d / 2 + 0.04), V(w / 2 - 0.07, 1.02, d / 2)], 0.01, 6, { smooth: false });
    cardAt(ms, 'bait_card', -0.03, 1.02, d / 2 + 0.01, 0, ...sz('bait_card', 230), 0.04);
    for (const sx of [-1, 1]) boxAt(ms, 'wrap', -0.03 + sx * 0.19, 1.15, d / 2 + 0.012, 0.05, 0.02, 0.002, 0, {}, 0, sx * 0.6);
    cardAt(ms, 'minnow_sign', 0.02, 0.46, d / 2 + 0.01, 0, ...sz('minnow_sign', 260), -0.05);
    // the styrofoam cooler on top, lid askew
    boxAt(ms, styro, -0.05, h + 0.1, 0.02, 0.5, 0.2, 0.34, 0.1);
    boxAt(ms, styro, -0.02, h + 0.215, 0.04, 0.52, 0.04, 0.36, 0.25);
    ms.pop();
    blob(ms, x, deck, z, w * 1.3, d * 1.3);
    floorDecal(ms, 'g_stain', x - 0.2, deck + 0.005, z + d / 2 + 0.25, 0.5, 0.4, 0.7);
    cols.box(x, deck + h / 2, z, w / 2, h / 2, d / 2, -0.04);
    // extension cord from the fridge across the deck to an outlet box by the door
    const ox = 0.75, oy = deck + 0.45, oz = D / 2 + 0.005;
    boxAt(ms, 'galv', ox, oy, oz + 0.02, 0.07, 0.11, 0.04);
    tb(ms, cord, [V(ox, oy - 0.02, oz + 0.05), V(ox + 0.03, deck + 0.05, oz + 0.1), V(ox + 0.4, deck + 0.012, oz + 0.25), V(1.5, deck + 0.012, oz + 0.3), V(x - w / 2 + 0.05, deck + 0.04, z - 0.1)], 0.007, 5);
  }
  // ---- the bench's coffee-can ashtray, butts and a newspaper; boot mud from the steps to the door
  {
    const bx = -2.3, bz = D / 2 + 0.55;
    ms.pushT(bx + 0.78, deck, bz + 0.05);
    lathe(ms, 'lab_metal', [[0.0001, 0], [0.075, 0], [0.075, 0.16], [0.07, 0.165], [0.0001, 0.15]], 10, { uNorm: true, vNorm: true, uv: lUV('coffee') });
    ms.pop();
    floorDecal(ms, 'g_butts', bx + 0.6, deck + 0.004, bz + 0.35, 0.7, 0.6, 0.5);
    floorDecal(ms, 'g_leaves', -3.9, deck + 0.004, D / 2 + PORCH - 0.35, 0.7, 0.7, 0.3);
    floorDecal(ms, 'g_leaves', 3.85, deck + 0.004, D / 2 + 0.3, 0.6, 0.6, 1.3);
    floorDecal(ms, 'fl_faded', bx - 0.25, deck + 0.462, bz + 0.02, 0.2, 0.27, 0.4, 'sp');
    // worn path across the boards, muddy prints from the steps
    floorDecal(ms, 'g_wear', 0, deck + 0.003, D / 2 + PORCH / 2, 1.1, PORCH - 0.1);
    for (let i = 0; i < 7; i++) floorDecal(ms, 'g_mud', r.range(-0.5, 0.5), deck + 0.005, D / 2 + 0.25 + i * 0.32, 0.32, 0.32, r.range(0, 6));
    for (let i = 0; i < 2; i++) floorDecal(ms, 'g_mud', r.range(-0.6, 0.6), deck - 0.14 * (i + 1) + 0.025, D / 2 + PORCH + 0.15 + i * 0.28, 0.5, 0.25, r.range(-0.3, 0.3));
  }
  // ---- a bare bulb in a wire cage over the door, its pool on the boards
  {
    const y = FLOOR + 2.42, z = D / 2 + 0.05;
    ms.pushT(0.0, y, z);
    lathe(ms, white, [[0.0001, 0], [0.05, 0], [0.05, 0.02], [0.03, 0.05], [0.0001, 0.05]], 8);
    ms.pop();
    ms.pushT(0, y - 0.02, z + 0.1);
    boxAt(ms, white, 0, 0.02, -0.06, 0.05, 0.04, 0.1);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; tb(ms, 'galv', [V(0, 0, 0), V(Math.cos(a) * 0.06, -0.05, Math.sin(a) * 0.06), V(0, -0.13, 0)], 0.003, 3, { samples: 4 }); }
    boxAt(ms, colorMat('bulb', 0xffd9a0, 0.4, 0, 3), 0, -0.06, 0, 0.05, 0.07, 0.05);
    ms.pop();
    floorDecal(ms, 'g_pool', 0, deck + 0.006, D / 2 + 1.0, 2.6, 2.0, 0, 'glowadd');
  }
  // ---- painted fascia valance along the porch roof's front edge
  {
    const zf = D / 2 + PORCH + 0.37, y = FLOOR + 2.95;
    board(ms, 'boards_green', r, 0, y, zf - 0.012, 7.75, 0.34, 0.025, 0, { grain: 'x' });
    cardAt(ms, 'fascia', 0, y, zf + 0.002, 0, 7.6, 0.32);
  }
  // ---- neon and light boxes inside the two display windows (read from outside), vinyl letters on the glass
  {
    const zi = D / 2 - T - 0.07, F = FLOOR;
    const red = neonMats('red', 0xff2a1a), blue = neonMats('blue', 0x3a6cff, 4.0), amber = neonMats('amber', 0xffa020);
    c.glow.halos.push(...[red.halo, blue.halo, amber.halo].map((h) => mats(h)));
    const nm = new Mesher(), flick = new Mesher();
    // right window: OPEN in red, a blue border, the N tired
    nm.pushT(2.45, F + 1.86, zi);
    flick.pushT(2.45, F + 1.86, zi);
    neonWord(nm, 'OPEN', 0.22, red.tube, { flick, flickerAt: 3, r: 0.012 });
    flick.pop();
    neonRect(nm, 1.2, 0.4, blue.tube, 0.01);
    boxAt(nm, 'iron', 0, 0, -0.025, 1.0, 0.36, 0.004, 0, { faces: { pz: null } });
    // the glow sits on the dirty glass itself (light scattering in the grime), so it reads from the road
    neonHalo(nm, red.halo, 2.0, 1.25, D / 2 - T / 2 + 0.035 - zi);
    for (const sx of [-0.4, 0.4]) tb(nm, 'iron', [V(sx, 0.18, -0.02), V(sx, 0.56, -0.02)], 0.002, 3);
    nm.pop();
    // left window: BIÈRE in amber
    nm.pushT(-2.45, F + 1.98, zi);
    neonWord(nm, 'BIÈRE', 0.19, amber.tube, { r: 0.012 });
    neonHalo(nm, amber.halo, 1.9, 1.1, D / 2 - T / 2 + 0.035 - zi);
    for (const sx of [-0.4, 0.4]) tb(nm, 'iron', [V(sx, 0.1, -0.02), V(sx, 0.44, -0.02)], 0.002, 3);
    nm.pop();
    // the colour the signs throw on the porch boards outside
    for (const [x, h] of [[2.45, red.halo], [-2.45, amber.halo]] as [number, string][]) {
      nm.pushT(x, FLOOR - 0.015, D / 2 + 0.9, 0, -Math.PI / 2);
      neonHalo(nm, h, 2.2, 1.6, 0);
      nm.pop();
    }
    const nmesh = nm.build({ name: 'neon', cast: false });
    group.add(nmesh);
    const fmesh = flick.build({ name: 'neon_flicker', cast: false });
    // the tired letter has its own material so it can stutter
    const fm = red.mat.clone();
    fmesh.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = fm; });
    group.add(fmesh);
    c.glow.flick.push(fm);
    // light boxes (sp_glow) on chains, lower in the windows
    ms.pushT(-2.95, F + 1.25, zi + 0.02, 0.05);
    boxAt(ms, black, 0, 0, -0.045, 0.52, 0.36, 0.08);
    card(ms, 'lb_huard', 0.5, 0.33, 'sp_glow');
    ms.pop();
    ms.pushT(2.0, F + 1.22, zi + 0.02, -0.06);
    boxAt(ms, black, 0, 0, -0.045, 0.52, 0.27, 0.08);
    card(ms, 'lb_muskeg', 0.5, 0.25, 'sp_glow');
    ms.pop();
    for (const [x, y0, y1] of [[-3.15, 1.43, 2.3], [-2.75, 1.43, 2.3], [1.8, 1.35, 2.3], [2.2, 1.35, 2.3]] as [number, number, number][]) tb(ms, 'iron', [V(x, F + y0, zi), V(x, F + y1, zi)], 0.002, 3);
    // vinyl letters on the left glass, a CASH ONLY strip at the right glass's foot, sun-bleached posters inside
    ms.pushT(-2.45, F + 0.95, D / 2 - T / 2 + 0.01);
    card(ms, 'vinyl_lic', 1.25, 0.2, 'sp_ds');
    ms.pop();
    ms.pushT(2.9, F + 0.9, D / 2 - T / 2 + 0.01);
    card(ms, 'vinyl_cash', 0.45, 0.14, 'sp_ds');
    ms.pop();
    cardAt(ms, 'fl_fishfry', -1.85, F + 1.4, zi + 0.04, 0, ...sz('fl_fishfry', 280), 0.03);
    cardAt(ms, 'fl_moose', 1.75, F + 1.75, zi + 0.04, 0, ...sz('fl_moose', 280), -0.04);
    // window sill clutter seen from outside: a dead plant, flies, a sun-faded box
    floorDecal(ms, 'g_dust', -2.45, F + 0.78, zi + 0.02, 1.6, 0.12);
  }
  // ---- false-front grime: rust drips from the sign lamps, water streaks under the window sills
  {
    for (const x of [-2.45, 2.45]) {
      ms.pushT(x + 0.1, FLOOR + 0.5, D / 2 + 0.03);
      card(ms, 'g_drip', 1.6, 0.45, 'grime');
      ms.pop();
    }
    for (const x of [-1.8, 1.8]) {
      ms.pushT(x, 4.2, D / 2 + 0.06);
      card(ms, 'g_drip', 0.35, 0.9, 'grime');
      ms.pop();
    }
    // moss and grime along the stone skirt
    for (let i = 0; i < 6; i++) {
      ms.pushT(-W / 2 + 0.5 + i * 1.4, 0.15, D / 2 + 0.05, 0);
      card(ms, i % 2 ? 'g_moss' : 'g_mud', 1.2, 0.35, 'grime');
      ms.pop();
    }
  }
  // ---- the ghost ad on the right side wall, half weathered off
  {
    ms.pushT(W / 2 + 0.032, 3.12, -0.8, Math.PI / 2);
    const [u0, v0, u1, v1] = PUV('ghost_cola');
    ms.quad('sp_soft', V(-1.05, -0.52, 0), V(1.05, -0.52, 0), V(1.05, 0.52, 0), V(-1.05, 0.52, 0), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    ms.pop();
    // drips down the side wall below the eaves
    for (const z of [-3.6, -1.9, 0.6, 2.9]) {
      ms.pushT(W / 2 + 0.03, 3.25, z, Math.PI / 2);
      card(ms, 'g_drip', 0.9, 1.1, 'grime');
      ms.pop();
    }
  }

  // ================================================================== on the ground
  // ---- propane exchange cage at the left end of the porch
  {
    const x = -5.45, z = D / 2 + 1.3, gy = ground(x, z), w = 1.3, h = 1.5, d = 0.7;
    ms.pushT(x, gy, z, 0.06);
    // slab, angle frame, mesh panels, shelf, roof, the door with a padlock
    boxAt(ms, 'stone', 0, -0.05, 0, w + 0.2, 0.2, d + 0.2);
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) boxAt(ms, 'galv', sx * w / 2, h / 2 + 0.05, sz2 * d / 2, 0.035, h, 0.035);
    for (const y of [0.08, 0.72, h + 0.03]) {
      boxAt(ms, 'galv', 0, y, d / 2, w, 0.03, 0.03); boxAt(ms, 'galv', 0, y, -d / 2, w, 0.03, 0.03);
      boxAt(ms, 'galv', w / 2, y, 0, 0.03, 0.03, d); boxAt(ms, 'galv', -w / 2, y, 0, 0.03, 0.03, d);
    }
    boxAt(ms, 'galv', 0, 0.705, 0, w - 0.04, 0.015, d - 0.04);
    const mesh = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, dd: THREE.Vector3, uw: number, vh: number) => ms.quad('wiremesh', a, b, cc, dd, [0, 0], [uw, 0], [uw, vh], [0, vh]);
    mesh(V(-w / 2, 0.08, d / 2), V(w / 2, 0.08, d / 2), V(w / 2, h + 0.03, d / 2), V(-w / 2, h + 0.03, d / 2), w, h);
    mesh(V(w / 2, 0.08, -d / 2), V(-w / 2, 0.08, -d / 2), V(-w / 2, h + 0.03, -d / 2), V(w / 2, h + 0.03, -d / 2), w, h);
    mesh(V(w / 2, 0.08, d / 2), V(w / 2, 0.08, -d / 2), V(w / 2, h + 0.03, -d / 2), V(w / 2, h + 0.03, d / 2), d, h);
    mesh(V(-w / 2, 0.08, -d / 2), V(-w / 2, 0.08, d / 2), V(-w / 2, h + 0.03, d / 2), V(-w / 2, h + 0.03, -d / 2), d, h);
    ms.pushT(0, h + 0.09, 0, 0, 0.08);
    box(ms, 'corrugated', w + 0.2, 0.02, d + 0.25, { grain: 'z' });
    ms.pop();
    boxAt(ms, 'galv', 0, 0.8, d / 2 + 0.02, 0.025, h - 0.1, 0.02);
    boxAt(ms, brass, 0.06, 0.82, d / 2 + 0.05, 0.05, 0.06, 0.02);
    tb(ms, 'galv', [V(0.06, 0.85, d / 2 + 0.05), V(0.06, 0.88, d / 2 + 0.05), V(0.04, 0.88, d / 2 + 0.05)], 0.004, 4);
    cardAt(ms, 'propane_sign', -0.32, 1.12, d / 2 + 0.03, 0, 0.4, 0.22, 0.02);
    cardAt(ms, 'no_smoking', 0.38, 1.12, d / 2 + 0.03, 0, 0.27, 0.2, -0.03);
    ms.pop();
    blob(ms, x, gy, z, w * 1.6, d * 1.9);
    floorDecal(ms, 'g_gravel', x + 0.3, gy + 0.02, z + 0.8, 1.6, 1.0, 0.3);
    const tanks: Xf[] = [];
    const cc = Math.cos(0.06), ss = Math.sin(0.06);
    for (let row = 0; row < 2; row++) for (let i = 0; i < (row ? 3 : 3); i++) {
      if (row === 1 && i === 2) continue; // one already swapped out
      const lx = -0.4 + i * 0.4 + r.range(-0.03, 0.03), lz = r.range(-0.05, 0.05);
      tanks.push({ x: x + cc * lx + ss * lz, y: gy + (row ? 0.725 : 0.1), z: z - ss * lx + cc * lz, ry: r.range(0, 6) });
    }
    c.pending.push(propInstances(group, 'propane_tank', tanks));
    cols.box(x, gy + h / 2, z, w / 2 + 0.05, h / 2 + 0.05, d / 2 + 0.05, 0.06);
  }
  // ---- firewood bundles on a steel rack by the steps
  {
    const x = -2.9, z = D / 2 + PORCH + 0.85, gy = ground(x, z), w = 1.35, d = 0.5;
    const lv = [0.06, 0.5, 0.94];
    ms.pushT(x, gy, z, 0.1);
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) boxAt(ms, 'rusty_red', sx * w / 2, 0.67, sz2 * d / 2, 0.03, 1.34, 0.03);
    for (const y of lv) { boxAt(ms, 'rusty_red', 0, y, d / 2, w, 0.025, 0.03); boxAt(ms, 'rusty_red', 0, y, -d / 2, w, 0.025, 0.03); for (let k = 0; k < 6; k++) boxAt(ms, 'galv', -w / 2 + 0.1 + k * (w - 0.2) / 5, y, 0, 0.012, 0.012, d); }
    board(ms, 'board_grey', r, 0, 1.42, d / 2 + 0.01, w + 0.06, 0.28, 0.025, 0, { grain: 'x' });
    cardAt(ms, 'firewood_sign', 0, 1.42, d / 2 + 0.026, 0, 0.42, 0.25, 0.03);
    const nB = q === 0 ? 2 : 3;
    lv.forEach((y, li) => {
      for (let b = 0; b < nB; b++) {
        if (li === 2 && b === 1) continue; // sold
        const bx = -w / 2 + 0.24 + b * ((w - 0.48) / Math.max(1, nB - 1)), by = y + 0.02;
        ms.pushT(bx, by, 0, Math.PI / 2 + r.range(-0.08, 0.08));
        const n = q === 0 ? 4 : 7;
        for (let k = 0; k < n; k++) {
          const row = k < 3 ? 0 : k < 6 ? 1 : 2, col = row === 0 ? k : row === 1 ? k - 3 : 0;
          ms.pushT(0, 0.055 + row * 0.095, (col - (row === 1 ? 1 : row === 0 ? 1 : 0)) * 0.1 + (row === 1 ? 0.0 : 0), 0, 0, r.range(0, 6));
          writeSplit(ms, r, 0.4, 0.06, r.int(0, 9999));
          ms.pop();
        }
        boxAt(ms, 'wrap', 0, 0.16, 0, 0.42, 0.31, 0.34);
        ms.pushT(0, 0.17, 0.172, 0);
        card(ms, 'bundle_wrap', 0.16, 0.08);
        ms.pop();
        ms.pop();
      }
    });
    ms.pop();
    blob(ms, x, gy, z, w * 1.4, d * 2.2, 0.1);
    floorDecal(ms, 'g_leaves', x + 0.3, gy + 0.02, z + 0.4, 1.2, 0.8, 0.1);
    cols.box(x, gy + 0.75, z, w / 2, 0.75, d / 2, 0.1);
  }
  // ---- the community corner: a roofed bulletin board, a pay phone, the rural-route mailboxes
  communityCorner(c, r);
  // ---- gas island extras: price sign, no-smoking card on the pump post, a squeegee bucket, oil cans, a bollard
  {
    const px0 = 3.4, pz = D / 2 + PORCH + 2.6, gy = ground(px0, pz);
    logAB(ms, V(px0 + 1.0, gy - 0.3, pz - 0.2), V(px0 + 1.0, gy + 1.9, pz - 0.2), 0.05, { seed: 777, seg: 6, capA: -1, capB: 2, matFor: () => 'board_grey' });
    cardAt(ms, 'gas_price', px0 + 1.0, gy + 1.62, pz - 0.15, 0.25, 0.5, 0.42, 0);
    boxAt(ms, 'board_grey', px0 + 1.0, gy + 1.62, pz - 0.18, 0.54, 0.46, 0.02, 0.25);
    cardAt(ms, 'no_smoking', px0 - 0.62, gy + 0.55, pz + 0.41, 0, 0.2, 0.15, 0.04);
    // squeegee bucket on the island
    ms.pushT(px0 - 0.5, gy + 0.16, pz + 0.15);
    lathe(ms, 'enamel_blue', [[0.0001, 0], [0.12, 0], [0.15, 0.3], [0.145, 0.3], [0.115, 0.01], [0.0001, 0.01]], 12);
    floorDecal(ms, 'g_puddle', 0, 0.27, 0, 0.26, 0.26, 0, 'puddle');
    tb(ms, 'board_warm', [V(0.03, 0.15, 0.02), V(0.12, 0.85, 0.08)], 0.012, 5);
    boxAt(ms, black, 0.03, 0.18, 0.02, 0.22, 0.05, 0.03, 0.4);
    ms.pop();
    // oil cans stacked against the pump plinth
    for (let i = 0; i < 4; i++) {
      ms.pushT(px0 + 0.35 + (i % 2) * 0.11, gy + 0.16 + Math.floor(i / 2) * 0.17, pz + 0.3, r.range(0, 6));
      lathe(ms, 'lab_metal', [[0.0001, 0], [0.05, 0], [0.05, 0.16], [0.0001, 0.16]], 8, { uNorm: true, vNorm: true, uv: lUV('tin_gold') });
      ms.pop();
    }
    // a yellow bollard knocked crooked by somebody's pickup
    logAB(ms, V(px0 - 0.95, gy - 0.3, pz + 0.55), V(px0 - 1.05, gy + 0.85, pz + 0.68), 0.07, { seed: 778, seg: 8, capA: -1, capB: 1, matFor: () => yellow, capMat: yellow });
    floorDecal(ms, 'g_stain', px0 + 0.1, gy + 0.17, pz, 0.8, 0.5, 0.3);
    groundDecal(ms, 'g_stain', px0 - 0.6, pz + 1.0, 1.4, 1.2, 0.6, ground, { nx: 2, nz: 2, lift: 0.03 });
    cols.box(px0 + 1.0, gy + 0.9, pz - 0.2, 0.06, 0.9, 0.06);
  }
  // ---- power drop: a pole by the road and the service wire to a mast on the false front's back
  {
    const plx = 6.6, plz = D / 2 + PORCH + 8.5, gy = ground(plx, plz);
    c.pending.push(prop(group, 'electricity_pole_02', plx, gy - 0.1, plz, Math.PI / 2 + 0.2));
    const top = V(plx, gy + 5.6, plz), mast = V(3.3, 6.05, D / 2 - 0.25);
    tb(ms, 'galv', [V(3.3, 5.0, D / 2 - 0.25), V(3.3, 6.3, D / 2 - 0.25)], 0.025, 6);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(top.clone().lerp(mast, t).add(V(0, -Math.sin(Math.PI * t) * 0.55, 0))); }
    tb(ms, black, pts, 0.016, 4, { samples: 14 });
    tb(ms, black, [V(3.3, 6.0, D / 2 - 0.22), V(3.32, 5.6, D / 2 - 0.2), V(3.4, 4.2, D / 2 - 0.12)], 0.007, 4);
  }

  // ================================================================== the lot: ruts, puddles, gravel, oil
  {
    const L = (x0: number, z0: number, x1: number, z1: number, w = 0.42) => {
      // a pair of tyre tracks 1.6 m apart from (x0,z0) to (x1,z1), as a few bent segments
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const bend = (t: number) => Math.sin(t * Math.PI) * 0.9;
        const ax = x0 + (x1 - x0) * t0 + bend(t0), az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1 + bend(t1), bz = z0 + (z1 - z0) * t1;
        const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
        for (const s of [-0.8, 0.8]) {
          const ox = Math.cos(ry) * s, oz = -Math.sin(ry) * s;
          groundDecal(ms, 'g_tread', (ax + bx) / 2 + ox, (az + bz) / 2 + oz, w, len + 0.3, ry, ground, { nx: 1, nz: Math.max(2, Math.round(len / 0.8)) * 2, lift: 0.035, vRepeat: Math.max(1, Math.round(len / 0.9)) });
        }
      }
    };
    L(-1.2, D / 2 + PORCH + 16, 0.4, D / 2 + PORCH + 4.2);
    L(5.5, D / 2 + PORCH + 15, 2.8, D / 2 + PORCH + 3.6, 0.38);
    L(-6, D / 2 + PORCH + 14, -1.0, D / 2 + PORCH + 5.5, 0.36);
    // puddles where the tracks sink, a mud apron in front of the steps, gravel scatter, the jeep's oil spot
    for (const [x, z, w, d] of [[0.3, 12.8, 1.4, 0.9], [-0.9, 16.0, 1.0, 1.6], [3.9, 14.6, 1.2, 0.8], [-3.6, 15.4, 0.8, 0.6]] as [number, number, number, number][]) {
      groundDecal(ms, 'g_mud', x, z, w * 1.6, d * 1.6, r.range(0, 3), ground, { nx: 3, nz: 3, lift: 0.04 });
      groundDecal(ms, 'g_puddle', x, z, w, d, r.range(0, 3), ground, { nx: 3, nz: 3, lift: 0.05, mat: 'puddle' });
    }
    groundDecal(ms, 'g_mud', 0, D / 2 + PORCH + 1.0, 3.0, 1.6, 0, ground, { nx: 4, nz: 2, lift: 0.04 });
    for (let i = 0; i < (q === 0 ? 3 : 7); i++) groundDecal(ms, 'g_gravel', r.range(-6, 6), r.range(D / 2 + PORCH + 2, D / 2 + PORCH + 16), r.range(1.5, 3), r.range(1.5, 3), r.range(0, 3), ground, { nx: 2, nz: 2, lift: 0.03 });
    groundDecal(ms, 'g_stain', 0.5, D / 2 + PORCH + 5.5, 1.2, 1.6, 0.2, ground, { nx: 2, nz: 2, lift: 0.04 });
  }
}

// ---------------------------------------------------------------------------------------------- helpers
const matCache = new Map<string, THREE.Material>();
function mats(name: string): THREE.Material { let m = matCache.get(name); if (!m) { m = placeMat(name); matCache.set(name, m); } return m; }
/** a labels-atlas rectangle as lathe UVs (u0, v0, u1, v1) */
function lUV(k: string): [number, number, number, number] { return LABELS.uv(k); }

/** the bulletin board with its layers of paper, the pay phone on its post, the mailbox gang */
function communityCorner(c: DressStore, r: Rand): void {
  const { ms, cols, ground, q } = c;
  const { D, PORCH } = c.dims;
  const pin = [colorMat('pin_r', 0xc02020, 0.4), colorMat('pin_y', 0xe0c020, 0.4), colorMat('pin_b', 0x2050c0, 0.4), colorMat('pin_g', 0x30a040, 0.4)];
  // ---- bulletin board: two cedar posts, a plywood board edged in trim, a little shed roof
  {
    const x = -7.0, z = D / 2 + PORCH + 1.9, ry = 0.55, gy = Math.min(ground(x - 0.7, z), ground(x + 0.7, z));
    const bw = 1.4, bh = 1.0, by = 1.45;
    ms.pushT(x, gy, z, ry);
    for (const sx of [-1, 1]) logAB(ms, V(sx * (bw / 2 + 0.04), -0.4, 0), V(sx * (bw / 2 + 0.04), by + bh / 2 + 0.25, 0), 0.055, { seed: 300 + sx, seg: 7, capA: -1, capB: 2, matFor: () => 'bark' });
    boxAt(ms, 'board_grey', 0, by, -0.02, bw, bh, 0.03);
    for (const [bx2, by2, w, h] of [[0, by + bh / 2 + 0.03, bw + 0.08, 0.06], [0, by - bh / 2 - 0.03, bw + 0.08, 0.06]] as [number, number, number, number][]) boxAt(ms, 'board_warm', bx2, by2, 0.0, w, h, 0.04);
    ms.pushT(0, by + bh / 2 + 0.2, 0.05, 0, 0.35);
    box(ms, 'shakes', bw + 0.4, 0.03, 0.5, { grain: 'x' });
    ms.pop();
    // the paper: older layers first (faded, torn), then this season's, business cards, tabs
    const keys = ['fl_faded', 'fl_faded', 'fl_mower', 'fl_dog', 'fl_moose', 'fl_fishfry', 'fl_sled', 'fl_bingo', 'fl_guide', 'fl_supper', 'fl_puppies', 'fl_hunter', 'fl_ride', 'fl_fireban', 'fl_cat', 'fl_card1', 'fl_card2', 'fl_card1'];
    const spots: [number, number][] = [[-0.5, 0.25], [0.45, -0.2], [0.52, 0.22], [-0.42, 0.12], [-0.05, 0.2], [0.22, 0.24], [0.4, -0.12], [-0.38, -0.25], [0.02, -0.22], [-0.18, -0.08], [0.18, -0.02], [-0.58, -0.12], [0.58, -0.3], [-0.2, 0.33], [0.05, 0.02], [-0.62, 0.38], [0.6, 0.4], [0.32, 0.36]];
    const n = q === 0 ? 10 : keys.length;
    let zz = 0.0;
    for (let i = 0; i < n; i++) {
      const k = keys[i], [w, h] = sz(k, 290);
      const [sx, sy] = spots[i];
      zz += 0.0018;
      const rot = r.range(-0.09, 0.09);
      ms.pushT(sx, by + sy, zz, 0, 0, rot);
      card(ms, k, w, h);
      // staples at the top corners, sometimes a coloured push pin instead
      if (r.next() < 0.6) for (const s of [-1, 1]) boxAt(ms, 'galv', s * (w / 2 - 0.015), h / 2 - 0.012, 0.002, 0.012, 0.003, 0.003);
      else { const pm = pin[r.int(0, 3)]; boxAt(ms, pm, 0, h / 2 - 0.02, 0.006, 0.014, 0.014, 0.012); }
      ms.pop();
    }
    // a curled-up flyer corner hanging loose at the bottom
    ms.pushT(-0.25, by - bh / 2 + 0.06, zz + 0.01, 0, -0.5, 0.3);
    card(ms, 'fl_faded', 0.12, 0.08, 'sp_ds', PSUB('fl_faded', 0, 0.6, 0.6, 1));
    ms.pop();
    ms.pop();
    blob(ms, x, gy + 0.02, z, 1.8, 0.6, ry);
    c.cols.box(x, gy + 1.2, z, bw / 2 + 0.1, 1.2, 0.08, ry);
    c.anchors.bulletin_board = anchorAt(c.group, 'bulletin_board', x, gy + by, z, ry);
  }
  // ---- pay phone on a post with a hood, its phone book on a chain
  {
    const x = -4.75, z = D / 2 + PORCH - 0.25, gy = ground(x, z), ry = 0.15;
    ms.pushT(x, gy, z, ry);
    boxAt(ms, 'board_grey', 0, 0.85, -0.06, 0.12, 2.1, 0.12);
    // the hood: three sides and a top, pressed steel
    boxAt(ms, 'galv', 0, 1.9, 0.12, 0.56, 0.03, 0.36);
    for (const sx of [-1, 1]) boxAt(ms, 'galv', sx * 0.27, 1.55, 0.12, 0.02, 0.72, 0.36);
    boxAt(ms, 'galv', 0, 1.55, -0.04, 0.56, 0.72, 0.02);
    ms.pushT(0, 1.98, 0.29);
    card(ms, 'phone_sign', 0.5, 0.15);
    ms.pop();
    // phone body, plate, handset, coiled cord, the book
    const dark = colorMat('phone', 0x2a2c30, 0.4, 0.3);
    boxAt(ms, dark, 0, 1.5, 0.02, 0.22, 0.42, 0.11);
    cardAt(ms, 'phone_plate', 0.02, 1.48, 0.077, 0, 0.14, 0.19);
    boxAt(ms, dark, -0.09, 1.58, 0.1, 0.05, 0.24, 0.06);
    const coil: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 22; coil.push(V(-0.09 + Math.cos(a) * 0.012, 1.45 - t * 0.38 + Math.sin(t * 3) * 0.02, 0.1 + Math.sin(a) * 0.012)); }
    tb(ms, dark, coil, 0.004, 4);
    boxAt(ms, colorMat('book', 0xd8b830, 0.8), 0.06, 1.12, 0.12, 0.2, 0.04, 0.26, 0.2, {}, 0.1);
    tb(ms, 'galv', [V(0.08, 1.28, 0.06), V(0.07, 1.2, 0.1), V(0.06, 1.14, 0.12)], 0.003, 3);
    boxAt(ms, 'board_grey', 0.06, 1.1, 0.12, 0.26, 0.03, 0.3);
    ms.pop();
    blob(ms, x, gy + 0.02, z, 0.9, 0.9);
    floorDecal(ms, 'g_butts', x, gy + 0.03, z + 0.4, 0.6, 0.6, 2.0);
    cols.box(x, gy + 1.0, z, 0.3, 1.0, 0.22, ry);
    c.anchors.pay_phone = anchorAt(c.group, 'pay_phone', x, gy + 1.5, z + 0.5, ry);
  }
  // ---- the rural-route mailbox gang: 4 x 2 little doors, a slot, name strips, a red header
  {
    const x = -8.7, z = D / 2 + PORCH + 0.1, gy = ground(x, z), ry = 0.85;
    const w = 1.0, h = 0.56, d = 0.42, y0 = 0.95;
    ms.pushT(x, gy, z, ry);
    for (const sx of [-0.4, 0.4]) boxAt(ms, 'board_grey', sx, (y0 - 0.2) / 2 + 0.0, 0, 0.1, y0 + 0.3, 0.1);
    boxAt(ms, 'galv', 0, y0 + h / 2, 0, w, h, d);
    ms.pushT(0, y0 + h + 0.05, 0.0, 0, 0.0);
    box(ms, 'galv', w + 0.06, 0.04, d + 0.06);
    ms.pop();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const dx = -w / 2 + 0.125 + i * 0.25, dy = y0 + 0.14 + j * 0.27;
      boxAt(ms, 'galv', dx, dy, d / 2 + 0.006, 0.23, 0.25, 0.012);
      boxAt(ms, 'iron', dx + 0.08, dy - 0.03, d / 2 + 0.016, 0.02, 0.03, 0.01);
      const k = i + j * 4;
      ms.pushT(dx - 0.02, dy + 0.08, d / 2 + 0.014);
      card(ms, 'mail_names', 0.14, 0.05, 'sp', PSUB('mail_names', k / 8, (k + 1) / 8));
      ms.pop();
    }
    cardAt(ms, 'mail_head', 0, y0 + h + 0.18, 0.05, 0, 0.6, 0.15);
    boxAt(ms, 'galv', 0, y0 + h + 0.18, 0.03, 0.62, 0.17, 0.02);
    // rust weeping from the doors
    ms.pushT(0, y0 + 0.25, d / 2 + 0.024);
    card(ms, 'g_drip', w, 0.5, 'grime');
    ms.pop();
    ms.pop();
    blob(ms, x, gy + 0.02, z, 1.4, 0.8, ry);
    cols.box(x, gy + 0.8, z, w / 2, 0.8, d / 2, ry);
    c.anchors.mailboxes = anchorAt(c.group, 'mailboxes', x, gy + y0, z, ry);
  }
}

function anchorAt(parent: THREE.Object3D, name: string, x: number, y: number, z: number, ry: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name; o.position.set(x, y, z); o.rotation.y = ry;
  parent.add(o);
  return o;
}
