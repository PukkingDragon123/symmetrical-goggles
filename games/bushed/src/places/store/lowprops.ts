// Low-poly stand-ins for the heavy Poly Haven conversions the places used for set dressing (a lantern was 5,000
// triangles, a bench 3,000): each piece is a handful of boxes and coarse lathes on the places kit's painted pixel
// textures (planks, rusty paint, galvanised steel, enamel), written straight into a Mesher so they merge with
// everything else. Origin at the foot of the piece, front toward +Z. Matte throughout.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, board, lathe, tube } from '../kit';
import { LABELS } from '../signs';
import { card, PUV, PSUB } from './print';

const lUV = (k: string) => LABELS.uv(k);
type W = (ms: Mesher, x: number, y: number, z: number, ry?: number, seed?: number) => void;
const at = (ms: Mesher, x: number, y: number, z: number, ry: number, f: () => void) => { ms.pushT(x, y, z, ry); f(); ms.pop(); };

/** hurricane lantern: tin base and cap, a glass globe (chimney), wire bail */
export const lantern: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'rusty_red', [[0.0001, 0], [0.06, 0], [0.065, 0.05], [0.04, 0.07]], 6);
  lathe(ms, 'lab_gloss', [[0.04, 0.07], [0.055, 0.12], [0.05, 0.18], [0.035, 0.21]], 6, { uNorm: true, vNorm: true, uv: lUV('glass_clear') });
  lathe(ms, 'rusty_red', [[0.035, 0.21], [0.05, 0.23], [0.03, 0.26], [0.0001, 0.27]], 6);
  tube(ms, 'iron', [V(-0.05, 0.24, 0), V(0, 0.33, 0), V(0.05, 0.24, 0)], 0.003, 3, { samples: 4 });
  for (const s of [-1, 1]) boxAt(ms, 'iron', s * 0.058, 0.14, 0, 0.006, 0.15, 0.006);
});

/** a pair of rubber boots (black, a red band at the top) */
export const boots: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  for (const s of [-0.065, 0.065]) {
    boxAt(ms, 'soot', s, 0.035, 0.03, 0.09, 0.07, 0.26);
    lathe(ms, 'soot', [[0.045, 0.06], [0.05, 0.3], [0.052, 0.34]], 6, { phase: 0.3 });
    ms.pushT(s, 0, -0.02); ms.pop();
    ms.pushT(s, 0.31, -0.02);
    lathe(ms, 'rusty_red', [[0.051, 0], [0.053, 0.035]], 6);
    ms.pop();
  }
});

/** a 20 lb propane cylinder: collar, body, foot ring */
export const propane: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'enamel', [[0.14, 0], [0.15, 0.04], [0.155, 0.38], [0.12, 0.47], [0.05, 0.49], [0.0001, 0.49]], 8);
  lathe(ms, 'galv', [[0.06, 0.49], [0.07, 0.56], [0.06, 0.57]], 6);
  boxAt(ms, 'iron', 0, 0.52, 0, 0.03, 0.05, 0.03);
});

/** a creosote power pole with a crossarm and three glass insulators */
export const powerPole: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'board_dark', [[0.14, -0.6], [0.13, 3], [0.11, 6.4], [0.0001, 6.45]], 7);
  boxAt(ms, 'board_dark', 0, 5.9, 0.12, 1.6, 0.1, 0.1);
  for (const dx of [-0.7, 0, 0.7]) { ms.pushT(dx, 5.95, 0.12); lathe(ms, 'lab_gloss', [[0.03, 0], [0.04, 0.05], [0.02, 0.1], [0.0001, 0.11]], 6, { uNorm: true, vNorm: true, uv: lUV('glass_clear') }); ms.pop(); }
  for (const s of [-1, 1]) boxAt(ms, 'iron', s * 0.35, 5.7, 0.12, 0.7, 0.03, 0.03, 0, {}, 0, s * -0.6);
  boxAt(ms, 'galv', 0, 5.2, 0.17, 0.3, 0.45, 0.25);
});

/** a rusted food tin, label half gone */
export const rustyCan: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'sp_tin', [[0.0001, 0], [0.045, 0], [0.046, 0.11], [0.0001, 0.11]], 7, { uNorm: true, vNorm: true, uv: uvP('can_label') });
});
function uvP(k: string): [number, number, number, number] { return PUV(k); }

/** a weathered picnic table: plank top and benches, splayed legs */
export const picnicTable: W = (ms, x, y, z, ry = 0, seed = 1) => at(ms, x, y, z, ry, () => {
  const r = new Rand(seed);
  for (let k = 0; k < 5; k++) board(ms, 'planks_grey', r, -0.36 + k * 0.18, 0.74, 0, 0.17, 0.04, 2.2, 0, { grain: 'z' });
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) board(ms, 'planks_grey', r, sx * (0.62 + k * 0.17), 0.44, 0, 0.16, 0.04, 2.2, 0, { grain: 'z' });
  for (const zz of [-0.75, 0.75]) {
    boxAt(ms, 'board_grey', 0, 0.4, zz, 1.7, 0.08, 0.06);
    for (const s of [-1, 1]) boxAt(ms, 'board_grey', s * 0.32, 0.37, zz, 0.08, 0.8, 0.06, 0, {}, 0, s * 0.45);
  }
});

/** a plank crate with corner battens */
export const crate: W = (ms, x, y, z, ry = 0, seed = 1) => at(ms, x, y, z, ry, () => {
  const r = new Rand(seed);
  const w = 0.62, h = 0.4, d = 0.42;
  for (let k = 0; k < 3; k++) {
    board(ms, 'board_warm', r, 0, 0.07 + k * 0.13, d / 2, w, 0.12, 0.02, 0, { grain: 'x' });
    board(ms, 'board_warm', r, 0, 0.07 + k * 0.13, -d / 2, w, 0.12, 0.02, 0, { grain: 'x' });
    board(ms, 'board_warm', r, w / 2, 0.07 + k * 0.13, 0, 0.02, 0.12, d, 0, { grain: 'z' });
    board(ms, 'board_warm', r, -w / 2, 0.07 + k * 0.13, 0, 0.02, 0.12, d, 0, { grain: 'z' });
  }
  boxAt(ms, 'board_dark', 0, 0.01, 0, w, 0.02, d);
  for (const s of [-1, 1]) for (const t of [-1, 1]) boxAt(ms, 'board_dark', s * (w / 2 - 0.02), h / 2, t * (d / 2 + 0.005), 0.04, h, 0.02);
});

/** a 45-gallon drum, rust and old paint, two rolling hoops */
export const drum: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'rusty_red', [[0.0001, 0.005], [0.28, 0.005], [0.28, 0.88], [0.27, 0.885], [0.0001, 0.87]], 10);
  for (const yy of [0.29, 0.59]) lathe(ms, 'rusty_red', [[0.28, yy - 0.015], [0.292, yy], [0.28, yy + 0.015]], 10);
  boxAt(ms, 'iron', 0.12, 0.88, 0.05, 0.05, 0.02, 0.05);
});

/** a galvanised garbage can with its lid */
export const trashCan: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'galv', [[0.0001, 0], [0.22, 0], [0.26, 0.72], [0.27, 0.74]], 8);
  for (const yy of [0.2, 0.5]) lathe(ms, 'galv', [[0.235, yy - 0.012], [0.248, yy], [0.24, yy + 0.012]], 8);
  lathe(ms, 'galv', [[0.28, 0.73], [0.28, 0.76], [0.1, 0.8], [0.0001, 0.81]], 8);
  boxAt(ms, 'galv', 0, 0.84, 0, 0.12, 0.03, 0.02);
});

/** a painted porch bench: slatted seat and back, chunky legs */
export const bench: W = (ms, x, y, z, ry = 0, seed = 1) => at(ms, x, y, z, ry, () => {
  const r = new Rand(seed);
  for (let k = 0; k < 3; k++) board(ms, 'boards_green', r, 0, 0.44, -0.12 + k * 0.12, 1.15, 0.035, 0.11, 0, { grain: 'x' });
  for (let k = 0; k < 2; k++) board(ms, 'boards_green', r, 0, 0.62 + k * 0.15, -0.22, 1.15, 0.1, 0.03, 0, { grain: 'x' });
  for (const s of [-1, 1]) {
    boxAt(ms, 'boards_green', s * 0.52, 0.22, 0.1, 0.06, 0.44, 0.06);
    boxAt(ms, 'boards_green', s * 0.52, 0.44, -0.22, 0.06, 0.88, 0.06);
    boxAt(ms, 'boards_green', s * 0.55, 0.62, -0.02, 0.05, 0.04, 0.4);
  }
});

/** a three-legged stool */
export const stool: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'board_warm', [[0.0001, 0.42], [0.17, 0.42], [0.17, 0.45], [0.0001, 0.45]], 8);
  for (let k = 0; k < 3; k++) { const a = k * 2.09; tube(ms, 'board_warm', [V(Math.cos(a) * 0.11, 0.42, Math.sin(a) * 0.11), V(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18)], 0.018, 5, { samples: 1 }); }
});

/** a rocking chair: rockers, seat, spindle back, arms */
export const rocker: W = (ms, x, y, z, ry = 0, seed = 1) => at(ms, x, y, z, ry, () => {
  const r = new Rand(seed);
  for (const s of [-0.24, 0.24]) {
    tube(ms, 'board_dark', [V(s, 0.06, -0.45), V(s, 0.0, -0.1), V(s, 0.0, 0.2), V(s, 0.07, 0.45)], 0.018, 4, { samples: 6 });
    boxAt(ms, 'board_dark', s, 0.22, 0.15, 0.04, 0.4, 0.04);
    boxAt(ms, 'board_dark', s, 0.5, -0.2, 0.04, 0.98, 0.04, 0, {}, -0.12);
    boxAt(ms, 'board_dark', s, 0.63, 0.0, 0.05, 0.03, 0.42);
  }
  board(ms, 'board_warm', r, 0, 0.44, -0.0, 0.5, 0.04, 0.44, 0, { grain: 'x' });
  for (let k = 0; k < 5; k++) boxAt(ms, 'board_warm', -0.16 + k * 0.08, 0.72, -0.25, 0.025, 0.55, 0.025, 0, {}, -0.12);
  board(ms, 'board_dark', r, 0, 0.99, -0.29, 0.52, 0.08, 0.04, 0, { grain: 'x' });
});

/** an old car tyre */
export const tyre: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  lathe(ms, 'soot', [[0.18, -0.08], [0.28, -0.08], [0.3, 0], [0.28, 0.08], [0.18, 0.08], [0.17, 0]], 10);
});

/** a wooden step ladder lying / leaning (rails along +Y) */
export const ladder: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  for (const s of [-0.22, 0.22]) boxAt(ms, 'board_grey', s, 1.2, 0, 0.05, 2.4, 0.08);
  for (let k = 0; k < 8; k++) boxAt(ms, 'board_grey', 0, 0.2 + k * 0.29, 0, 0.44, 0.04, 0.05);
});

/** a tall cabinet of small drawers (the store's mail drawers), each drawer a pull and a card slot */
export function drawerCabinet(ms: Mesher, x: number, y: number, z: number, ry = 0): void {
  at(ms, x, y, z, ry, () => {
    const w = 1.1, h = 1.85, d = 0.46;
    boxAt(ms, 'board_dark', 0, h / 2, 0, w, h, d);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 9; j++) {
      const dx = -w / 2 + 0.1 + i * 0.18, dy = 0.15 + j * 0.19;
      boxAt(ms, 'board_warm', dx, dy, d / 2 + 0.008, 0.165, 0.17, 0.016);
      boxAt(ms, 'galv', dx, dy - 0.03, d / 2 + 0.02, 0.05, 0.012, 0.012);
      ms.pushT(dx, dy + 0.04, d / 2 + 0.0175);
      card(ms, 'mail_names', 0.07, 0.022, 'sp', subName((i + j * 3) % 8));
      ms.pop();
    }
    boxAt(ms, 'board_dark', 0, h + 0.03, 0.01, w + 0.06, 0.06, d + 0.06);
  });
}
function subName(k: number): [number, number, number, number] { return PSUB('mail_names', k / 8, (k + 1) / 8); }

/** a cast-iron cash register: keys, the drawer, the crank, the number flags */
export function register(ms: Mesher, x: number, y: number, z: number, ry = 0): void {
  at(ms, x, y, z, ry, () => {
    boxAt(ms, 'iron', 0, 0.06, 0, 0.42, 0.12, 0.42);
    ms.pushT(0, 0.12, -0.04, 0, -0.5);
    box(ms, 'iron', 0.4, 0.22, 0.28);
    ms.pop();
    boxAt(ms, 'iron', 0, 0.36, -0.12, 0.4, 0.22, 0.16);
    boxAt(ms, 'lab_metal', 0, 0.5, -0.12, 0.3, 0.07, 0.03, 0, { uvs: 0.2 });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) boxAt(ms, 'enamel', -0.12 + i * 0.08, 0.2 + j * 0.03, 0.08 - j * 0.045, 0.035, 0.02, 0.035);
    tube(ms, 'iron', [V(0.21, 0.2, 0), V(0.27, 0.2, 0), V(0.27, 0.32, 0.05)], 0.008, 4, { samples: 3 });
  });
}

export function rad(seed: number): Rand { return new Rand(seed); }
void THREE;

/** an iron bed frame, rusted: head and foot rails of tube, a sagging spring of wire mesh (frame along Z, 2 m) */
export const bedFrame: W = (ms, x, y, z, ry = 0) => at(ms, x, y, z, ry, () => {
  const w = 0.9, L = 1.95;
  for (const zz of [-L / 2, L / 2]) {
    const hgt = zz < 0 ? 1.1 : 0.8;
    tube(ms, 'rusty_red', [V(-w / 2, 0, zz), V(-w / 2, hgt, zz), V(w / 2, hgt, zz), V(w / 2, 0, zz)], 0.016, 5, { smooth: false });
    for (let k = 1; k < 5; k++) tube(ms, 'rusty_red', [V(-w / 2 + k * w / 5, 0.38, zz), V(-w / 2 + k * w / 5, hgt, zz)], 0.008, 4, { smooth: false });
  }
  for (const s of [-1, 1]) boxAt(ms, 'rusty_red', s * w / 2, 0.38, 0, 0.03, 0.05, L);
  ms.quad('wiremesh', V(-w / 2, 0.36, L / 2), V(w / 2, 0.36, L / 2), V(w / 2, 0.3, -L / 2), V(-w / 2, 0.3, -L / 2), [0, 0], [w, 0], [w, L], [0, L]);
});

/** an army surplus crate with rope handles and a stencil */
export const armyCrate: W = (ms, x, y, z, ry = 0, seed = 1) => at(ms, x, y, z, ry, () => {
  const r = new Rand(seed);
  board(ms, 'planks_grey', r, 0, 0.23, 0, 1.2, 0.44, 0.5, 0, { grain: 'x' });
  board(ms, 'planks_grey', r, 0, 0.47, 0, 1.24, 0.04, 0.54, 0, { grain: 'x' });
  for (const s of [-1, 1]) tube(ms, 'rope', [V(s * 0.61, 0.32, -0.08), V(s * 0.66, 0.28, 0), V(s * 0.61, 0.32, 0.08)], 0.012, 4, { samples: 4 });
  ms.pushT(0, 0.25, 0.252); card(ms, 'kettle_stencil', 0.8, 0.2); ms.pop();
});
