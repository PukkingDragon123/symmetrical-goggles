// Cookware and the stove-top work area, modelled to the cabin's standard (src/places/kit.ts shapes and the places
// textures): a welded cooking plate saddled onto the barrel stove's drum, Ray's seasoned cast-iron skillet, a
// white enamel stew pot with a blue rim and a wire bail, a blue speckle-enamel cowboy coffee pot with a hinged lid,
// a butcher knife, a steel turner, a lard pail, the prep counter and the pantry table, a stovepipe damper with a
// working handle and a wire drying rack for jerky.
// Frame: the stove's own (origin on the floor under the drum centre, door toward +Z).
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, board, lathe, tube, extrude, placeTex, defineMat, hasMat } from '../../places/kit';
import { STOVE } from '../../places/stove';

export const PLATE = { x0: -0.21, x1: 0.21, z0: -0.1, z1: 0.42, y: STOVE.AXIS_Y + STOVE.R + 0.022 };
export const COUNTER = { x0: 0.345, x1: 0.785, z0: -0.3, z1: 0.3, y: 0.76 };
export const PANTRY = { x0: -0.74, x1: -0.38, z0: -0.04, z1: 0.4, y: 0.74 };

/** extra materials for cookware (registered once with the places kit) */
export function ensureCookMats(): void {
  if (hasMat('castiron')) return;
  const iron = placeTex('iron'), ironN = placeTex('iron', true);
  defineMat('castiron', new THREE.MeshStandardMaterial({ name: 'castiron', map: iron, normalMap: ironN, color: 0x7a7470, roughness: 0.42, metalness: 0.45 }));
  defineMat('castiron_in', new THREE.MeshStandardMaterial({ name: 'castiron_in', map: iron, normalMap: ironN, color: 0x5a5450, roughness: 0.32, metalness: 0.5 }));
  defineMat('steel', new THREE.MeshStandardMaterial({ name: 'steel', map: placeTex('galv'), color: 0xd8d8d6, roughness: 0.32, metalness: 0.72 }));
  defineMat('brass', new THREE.MeshStandardMaterial({ name: 'brass', color: 0xb08a48, roughness: 0.35, metalness: 0.8 }));
  defineMat('lard', new THREE.MeshStandardMaterial({ name: 'lard', color: 0xf2ece0, roughness: 0.55 }));
  defineMat('handle_wood', new THREE.MeshStandardMaterial({ name: 'handle_wood', map: placeTex('board_warm'), color: 0x8a6a50, roughness: 0.6 }));
}

// ---------------------------------------------------------------------------------------------- the plate on the stove
export function buildPlate(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  const { x0, x1, z0, z1, y } = PLATE;
  const ay = STOVE.AXIS_Y, R = STOVE.R;
  // the plate: 12 mm steel, slightly rounded corners (two boxes)
  ms.pushT((x0 + x1) / 2, y - 0.006, (z0 + z1) / 2);
  box(ms, 'iron', x1 - x0 - 0.02, 0.012, z1 - z0, { uv: [0.3, 0.2] });
  box(ms, 'iron', x1 - x0, 0.012, z1 - z0 - 0.02, { uv: [0.3, 0.2] });
  ms.pop();
  // two saddles (curved plates welded to the drum) under the plate's front and back edges, and a middle one
  for (const z of [z0 + 0.03, (z0 + z1) / 2, z1 - 0.03]) {
    const sh = new THREE.Shape();
    const ytop = y - 0.012 - ay;
    sh.moveTo(x0 + 0.01, ytop);
    sh.lineTo(x1 - 0.01, ytop);
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const x = x1 - 0.01 - (i / steps) * (x1 - x0 - 0.02);
      sh.lineTo(x, Math.sqrt(Math.max(0, R * R - x * x)) - 0.004);
    }
    sh.lineTo(x0 + 0.01, ytop);
    ms.pushT(0, ay, z - 0.006);
    extrude(ms, 'iron', sh, 0.012, { curveSegments: 4 });
    ms.pop();
    // weld beads where the saddle meets the drum
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const x = x0 + 0.02 + (i / 8) * (x1 - x0 - 0.04); pts.push(V(x, ay + Math.sqrt(R * R - x * x) + 0.001, z + 0.008)); }
    tube(ms, 'soot', pts, 0.0035, 4);
  }
  // a bent-rod guard rail along the back so pans don't slide into the flue collar
  tube(ms, 'iron', [V(x0 + 0.01, y, z0 + 0.005), V(x0 + 0.01, y + 0.03, z0 + 0.005), V(x1 - 0.01, y + 0.03, z0 + 0.005), V(x1 - 0.01, y, z0 + 0.005)], 0.004, 5, { smooth: false });
  const g = ms.build({ name: 'cook_plate' });
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = false; });
  return g;
}

// ---------------------------------------------------------------------------------------------- vessels
/** 10" seasoned cast-iron skillet, origin at the bottom centre, handle toward +Z. returns the group + inner floor height */
export function buildSkillet(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  const prof: [number, number][] = [[0, 0.0], [0.098, 0.0], [0.104, 0.002], [0.122, 0.044], [0.126, 0.048], [0.12, 0.049], [0.104, 0.009], [0.098, 0.007], [0, 0.007]];
  lathe(ms, 'castiron', prof.slice(0, 6), 28);
  lathe(ms, 'castiron_in', prof.slice(5), 28);
  // the handle: a tapered bar with a hanging hole, rising slightly
  const sh = new THREE.Shape();
  sh.moveTo(-0.017, 0); sh.lineTo(0.017, 0); sh.lineTo(0.013, 0.13); sh.absarc(0, 0.135, 0.014, 0, Math.PI, false); sh.lineTo(-0.017, 0);
  const hole = new THREE.Path(); hole.absarc(0, 0.128, 0.006, 0, Math.PI * 2, true); sh.holes.push(hole);
  ms.pushT(0, 0.047, 0.115, 0, Math.PI / 2 - 0.18);
  extrude(ms, 'castiron', sh, 0.008, { curveSegments: 6 });
  ms.pop();
  // the helper lip opposite the handle
  ms.pushT(0, 0.04, -0.13, 0, 0);
  boxAt(ms, 'castiron', 0, 0, 0, 0.05, 0.008, 0.022);
  ms.pop();
  const g = ms.build({ name: 'skillet' });
  g.userData.floor = 0.007;
  g.userData.r = 0.1;
  return g;
}

/** white enamel stew pot, blue rim, wire bail and ears. origin at the bottom, inner floor y = 0.006 */
export function buildPot(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  const prof: [number, number][] = [[0, 0], [0.078, 0], [0.084, 0.006], [0.09, 0.1], [0.094, 0.108], [0.096, 0.112], [0.09, 0.112], [0.086, 0.104], [0.08, 0.008], [0, 0.006]];
  lathe(ms, 'enamel', prof, 24, { matFor: (i) => (i >= 3 && i <= 6 ? 'enamel_blue' : 'enamel') });
  // ears and a wire bail lying back
  for (const s of [-1, 1]) {
    ms.pushT(s * 0.094, 0.095, 0);
    lathe(ms, 'enamel_blue', [[0, -0.008], [0.009, -0.008], [0.009, 0.008], [0, 0.008]], 6);
    ms.pop();
  }
  const bail: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); bail.push(V(-Math.cos(a) * 0.098, 0.095 + Math.sin(a) * 0.035, -Math.sin(a) * 0.09)); }
  tube(ms, 'galv', bail, 0.0022, 4);
  const g = ms.build({ name: 'stew_pot' });
  g.userData.floor = 0.008; g.userData.r = 0.082; g.userData.rim = 0.11;
  return g;
}

/** blue speckle-enamel cowboy coffee pot with a hinged lid (userData.lid pivots about X at the back) */
export function buildCoffeePot(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  lathe(ms, 'enamel_blue', [[0, 0], [0.062, 0], [0.065, 0.005], [0.058, 0.105], [0.046, 0.15], [0.043, 0.154], [0.04, 0.154], [0.038, 0.148], [0, 0.148]], 20);
  tube(ms, 'enamel_blue', [V(0, 0.03, 0.056), V(0, 0.09, 0.085), V(0, 0.135, 0.11)], 0.014, 8, { rEnd: 0.0075 });
  tube(ms, 'iron', [V(0, 0.14, -0.042), V(0, 0.15, -0.085), V(0, 0.07, -0.088), V(0, 0.03, -0.058)], 0.006, 6);
  const g = ms.build({ name: 'coffee_pot' });
  const lid = new THREE.Group();
  lid.position.set(0, 0.154, -0.038);
  const lms = new Mesher();
  lms.pushT(0, 0, 0.038);
  lathe(lms, 'enamel_blue', [[0, 0.026], [0.012, 0.024], [0.016, 0.018], [0.03, 0.01], [0.044, 0.002], [0.045, 0], [0, 0]].reverse() as [number, number][], 16);
  lms.pop();
  lid.add(lms.build({ name: 'coffee_lid' }));
  g.add(lid);
  g.userData.lid = lid;
  g.userData.r = 0.056;
  return g;
}

// ---------------------------------------------------------------------------------------------- tools
/** butcher knife: grip at the origin, blade along +Y, edge toward +Z */
export function buildKnife(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  const sh = new THREE.Shape();
  // blade profile in (z = edge side, y = along): spine straight at z = -0.012, edge curving up to the tip
  sh.moveTo(-0.012, 0.045); sh.lineTo(-0.012, 0.215); sh.quadraticCurveTo(-0.004, 0.235, 0.014, 0.232);
  sh.quadraticCurveTo(0.024, 0.16, 0.02, 0.05); sh.lineTo(0.016, 0.045); sh.lineTo(-0.012, 0.045);
  const g0 = new THREE.ExtrudeGeometry(sh, { depth: 0.0022, bevelEnabled: false, curveSegments: 8 });
  // the shape is in XY: map x -> z (edge), y -> y, depth -> x
  g0.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(1, 0, 0)));
  g0.translate(-0.0011, 0, 0);
  ms.geom('steel', g0, undefined, 4);
  g0.dispose();
  // bolster + handle scales with three brass rivets
  boxAt(ms, 'steel', 0, 0.04, 0.002, 0.012, 0.012, 0.03);
  ms.pushT(0, -0.012, 0.001);
  box(ms, 'handle_wood', 0.019, 0.105, 0.026, { grain: 'y', uv: [0.2, 0.1] });
  ms.pop();
  for (const y of [-0.045, -0.01, 0.025]) {
    ms.pushT(0, y, 0.001, 0, 0, Math.PI / 2);
    lathe(ms, 'brass', [[0, -0.0102], [0.003, -0.0102], [0.003, 0.0102], [0, 0.0102]], 6);
    ms.pop();
  }
  return ms.build({ name: 'knife' });
}

/** steel turner (spatula): grip at the origin, handle along -Y, blade at +Y facing +Z (blade plane = XY) */
export function buildTurner(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  ms.pushT(0, -0.02, 0);
  box(ms, 'handle_wood', 0.02, 0.12, 0.016, { grain: 'y', uv: [0.6, 0.1] });
  ms.pop();
  tube(ms, 'steel', [V(0, 0.04, 0), V(0, 0.12, 0.004), V(0, 0.165, 0.022)], 0.0035, 5);
  ms.pushT(0, 0.2, 0.026, 0, -0.18);
  box(ms, 'steel', 0.068, 0.075, 0.0016, { uv: [0, 0] });
  ms.pop();
  return ms.build({ name: 'turner' });
}

/** a tin lard pail with the lid off and a scoop of white lard */
export function buildLard(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  lathe(ms, 'galv', [[0, 0], [0.05, 0], [0.052, 0.004], [0.052, 0.07], [0.054, 0.074], [0.05, 0.074], [0.049, 0.008], [0, 0.008]], 16);
  ms.pushT(0, 0.052, 0);
  lathe(ms, 'lard', [[0.049, 0], [0.045, 0.006], [0.03, 0.01], [0.012, 0.004], [0, 0.002]], 14);
  ms.pop();
  const bail: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); bail.push(V(-Math.cos(a) * 0.054, 0.065 + Math.sin(a) * 0.05, 0)); }
  tube(ms, 'galv', bail, 0.0016, 4);
  return ms.build({ name: 'lard' });
}

/** the bannock mix: a folded paper flour sack tied with string */
export function buildMixSack(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  const g = new THREE.BoxGeometry(0.11, 0.13, 0.075, 3, 4, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
    const k = y > 0.03 ? 1 - (y - 0.03) * 4.5 : 1;
    p.setXYZ(i, x * (1 + 0.04 * Math.sin(y * 60)), y + 0.065, z * k);
  }
  g.computeVertexNormals();
  ms.geom('canvas', g, undefined, 1);
  tube(ms, 'rope', [V(-0.056, 0.12, 0.012), V(0, 0.124, 0.014), V(0.056, 0.12, 0.012)], 0.0015, 4);
  return ms.build({ name: 'bannock_mix' });
}

/** game meat wrapped in butcher paper */
export function buildMeatPack(): THREE.Group {
  const ms = new Mesher();
  const g = new THREE.BoxGeometry(0.16, 0.05, 0.11, 4, 2, 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 - 0.3 * (p.getX(i) / 0.08) ** 2) + 0.025);
  g.computeVertexNormals();
  ms.geom('canvas', g);
  tube(ms, 'rope', [V(0, 0.052, -0.058), V(0, 0.054, 0), V(0, 0.052, 0.058)], 0.0015, 4);
  return ms.build({ name: 'meat_pack' });
}

// ---------------------------------------------------------------------------------------------- furniture
/** prep counter right of the stove: a thick plank top on a pair of legs braced to the hearth */
export function buildCounter(ms: Mesher, rnd: Rand): void {
  const { x0, x1, z0, z1, y } = COUNTER;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < 3; i++) board(ms, 'board_warm', rnd, x0 + (x1 - x0) * (i + 0.5) / 3, y - 0.022, cz, (x1 - x0) / 3 - 0.004, 0.044, z1 - z0, 0, { grain: 'z' });
  board(ms, 'board_dark', rnd, cx, y - 0.07, z0 + 0.03, x1 - x0 - 0.04, 0.05, 0.03, 0, { grain: 'x' });
  board(ms, 'board_dark', rnd, cx, y - 0.07, z1 - 0.03, x1 - x0 - 0.04, 0.05, 0.03, 0, { grain: 'x' });
  for (const [x, z] of [[x0 + 0.03, z0 + 0.04], [x1 - 0.03, z0 + 0.04], [x0 + 0.03, z1 - 0.04], [x1 - 0.03, z1 - 0.04]] as [number, number][]) {
    board(ms, 'board_warm', rnd, x, (y - 0.04) / 2 - 0.01, z, 0.045, y - 0.04 + 0.02, 0.045, 0, { grain: 'y' });
  }
  board(ms, 'board_dark', rnd, cx, 0.18, z0 + 0.04, x1 - x0 - 0.06, 0.04, 0.025, 0, { grain: 'x' });
  board(ms, 'board_dark', rnd, cx, 0.18, z1 - 0.04, x1 - x0 - 0.06, 0.04, 0.025, 0, { grain: 'x' });
  // a lower shelf with a crock and folded towel
  board(ms, 'board_warm', rnd, cx, 0.22, cz, x1 - x0 - 0.04, 0.02, z1 - z0 - 0.06, 0, { grain: 'z' });
  ms.pushT(cx - 0.08, 0.23, cz - 0.1);
  lathe(ms, 'enamel', [[0, 0], [0.06, 0], [0.065, 0.02], [0.062, 0.11], [0.066, 0.12], [0.058, 0.12], [0.055, 0.02], [0, 0.015]], 14);
  ms.pop();
  boxAt(ms, 'ticking', cx + 0.08, 0.245, cz + 0.08, 0.16, 0.03, 0.2);
  // nails on the edge with a hanging towel
  boxAt(ms, 'ticking', x1 + 0.004, y - 0.15, cz + 0.12, 0.006, 0.22, 0.14);
}

/** pantry table left of the stove: a split-slab top on a trestle */
export function buildPantry(ms: Mesher, rnd: Rand): void {
  const { x0, x1, z0, z1, y } = PANTRY;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < 2; i++) board(ms, 'board_grey', rnd, cx, y - 0.02, z0 + (z1 - z0) * (i + 0.5) / 2, x1 - x0, 0.04, (z1 - z0) / 2 - 0.004, 0, { grain: 'x' });
  for (const x of [x0 + 0.05, x1 - 0.05]) {
    board(ms, 'board_dark', rnd, x, (y - 0.04) / 2, cz, 0.04, y - 0.04, z1 - z0 - 0.08, 0, { grain: 'y' });
    board(ms, 'board_dark', rnd, x, 0.03, cz, 0.06, 0.05, z1 - z0 - 0.02, 0, { grain: 'z' });
  }
  board(ms, 'board_dark', rnd, cx, 0.3, cz, x1 - x0 - 0.1, 0.05, 0.03, 0, { grain: 'x' });
}

/** stovepipe damper handle (spins about the pipe axis); the pipe centre is (0, y, pz) */
export function buildDamper(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  boxAt(ms, 'iron', 0.12, 0, 0, 0.1, 0.008, 0.008);
  tube(ms, 'iron', [V(0.16, 0, -0.025), V(0.18, 0, 0), V(0.16, 0, 0.025)], 0.006, 5);
  ms.pushT(0.17, 0, 0, 0, 0, Math.PI / 2);
  lathe(ms, 'handle_wood', [[0, -0.02], [0.009, -0.02], [0.011, 0], [0.009, 0.02], [0, 0.02]], 8);
  ms.pop();
  return ms.build({ name: 'damper_handle' });
}

/** wire drying rack hung from the stovepipe for jerky (spans x, hangs at the origin) */
export function buildRack(): THREE.Group {
  ensureCookMats();
  const ms = new Mesher();
  const w = 0.34;
  tube(ms, 'galv', [V(-w / 2, 0, 0), V(w / 2, 0, 0)], 0.0025, 4);
  tube(ms, 'galv', [V(-w / 2, 0, 0.05), V(w / 2, 0, 0.05)], 0.0025, 4);
  for (let i = 0; i <= 6; i++) { const x = -w / 2 + (i / 6) * w; tube(ms, 'galv', [V(x, 0, 0), V(x, 0, 0.05)], 0.0018, 3); }
  for (const s of [-1, 1]) tube(ms, 'galv', [V(s * w / 2, 0, 0.025), V(s * w * 0.3, 0.12, -0.02), V(0, 0.16, -0.06)], 0.0016, 3);
  return ms.build({ name: 'jerky_rack' });
}

void Rand;
