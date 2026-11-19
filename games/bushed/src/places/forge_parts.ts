// The blacksmith's kit for the forge lean-to (src/places/forge.ts), each piece modelled from its real shape:
//   anvil      London-pattern anvil: lofted body (horn, throat, waist, heel), four feet, polished face with the
//              hardy (square) and pritchel (round) holes, step and table; on an elm stump with iron bands
//   bellows    great bellows: teardrop boards, pleated leather sides (lofted, they open as the top board lifts),
//              iron nozzle, a rocker lever with a cow-horn handle on a chain
//   grindstone sandstone wheel on a squared axle in an oak frame, crank, pitman arm and foot treadle, water trough
//   slack tub  half barrel: staves, iron hoops, water surface (ripples and quench steam come from the station)
//   tongs, hammers, swage block, files, horseshoes for the tool wall
// Shared frame conventions: metres, Y up, the front of each piece faces +Z. Textures: places kit + forge set.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, board, lathe, tube, extrude, log, defineMat, hasMat } from './kit';
import { loadTex } from '../gfx/tex';

// ---------------------------------------------------------------------------------------------- materials
const FTILE: Record<string, [number, number]> = {
  brick: [1, 1], brick_soot: [1, 1], firebrick: [1, 1], anvil: [0.5, 0.5], anvil_face: [0.4, 0.4], coal: [0.25, 0.25],
  ash: [0.6, 0.6], cinder_floor: [2, 2], sandstone: [0.5, 0.5],
};
export function forgeTex(name: string, normal = false): THREE.Texture {
  const t = loadTex(`forge/${name}${normal ? '_n' : ''}.png`, { repeat: true, srgb: !normal });
  const tile = FTILE[name] ?? [1, 1];
  t.repeat.set(1 / tile[0], 1 / tile[1]);
  return t;
}
/** forge materials registered with the places mesh writer (call once before building) */
export function ensureForgeMats(): void {
  if (hasMat('f_brick')) return;
  const std = (name: string, tex: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    defineMat(name, new THREE.MeshStandardMaterial({ name, map: forgeTex(tex), normalMap: forgeTex(tex, true), roughness: 0.85, ...o }));
  std('f_brick', 'brick', { roughness: 0.9 });
  std('f_brick_soot', 'brick_soot', { roughness: 0.95 });
  std('f_firebrick', 'firebrick', { roughness: 0.9 });
  std('f_anvil', 'anvil', { roughness: 0.6, metalness: 0.25, color: 0xb8bcc4 });
  std('f_face', 'anvil_face', { roughness: 0.32, metalness: 0.3, color: 0xe8eaee });
  std('f_coal', 'coal', { roughness: 0.45, metalness: 0.05 });
  std('f_ash', 'ash', { roughness: 1 });
  std('f_floor', 'cinder_floor', { roughness: 1 });
  std('f_sandstone', 'sandstone', { roughness: 0.95 });
  defineMat('f_hole', new THREE.MeshStandardMaterial({ name: 'f_hole', color: 0x060505, roughness: 1 }));
  defineMat('f_soot_board', new THREE.MeshStandardMaterial({ name: 'f_soot_board', map: loadTex('places/board_grey.png', { repeat: true }), color: 0x6a625a, roughness: 0.95 }));
  defineMat('f_horn', new THREE.MeshStandardMaterial({ name: 'f_horn', color: 0xc8b896, roughness: 0.5 }));
  defineMat('f_chain', new THREE.MeshStandardMaterial({ name: 'f_chain', color: 0x3a3634, roughness: 0.6, metalness: 0.6 }));
  if (!hasMat('handle_wood')) defineMat('handle_wood', new THREE.MeshStandardMaterial({ name: 'handle_wood', map: loadTex('places/board_warm.png', { repeat: true }), color: 0x8a6a50, roughness: 0.6 }));
}

// ---------------------------------------------------------------------------------------------- anvil
/**
 * London-pattern anvil, ~100 kg: 0.68 m from horn tip to heel, face 0.29 m above its base. Origin at the base
 * centre; the horn points to -X, the heel to +X. Returns the group and the face height (top of the face).
 */
export function buildAnvil(): { group: THREE.Group; faceY: number; faceX0: number; faceX1: number; hardyX: number; hornX: number } {
  ensureForgeMats();
  const ms = new Mesher();
  const H = 0.29;            // face height
  const faceW = 0.115;       // face width
  const x0 = -0.34, xHornRoot = -0.12, xStep = -0.06, xHeel = 0.34;
  // cross-sections lofted along X: each section is 12 points around (YZ), same count everywhere
  const N = 12;
  type Sec = { x: number; pts: [number, number][] };
  const rect = (yb: number, yt: number, wb: number, wt: number, waist: number, waistY: number): [number, number][] => {
    // a "waisted" body section: base width wb at yb, pinched waist at waistY, flaring to the face width wt at yt
    const half = [[wb, yb], [waist, waistY], [wt * 0.92, yt - 0.03], [wt, yt - 0.012], [wt, yt]] as [number, number][];
    const out: [number, number][] = [];
    // right side bottom -> top, then left side top -> bottom (12 points: 5 + 1 top centre + 5 + 1 bottom centre)
    for (const [w, y] of half) out.push([w / 2, y]);
    out.push([0, yt]);
    for (let i = half.length - 1; i >= 0; i--) out.push([-half[i][0] / 2, half[i][1]]);
    out.push([0, yb]);
    return out;
  };
  const circ = (cy: number, r: number, flat = 0): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i / N) * Math.PI * 2 + Math.PI * 0.08;
      out.push([Math.cos(a) * r, cy + Math.sin(a) * r * (1 - flat)]);
    }
    // order to match rect: start at the lower right going up
    return out;
  };
  const lerpSec = (a: [number, number][], b: [number, number][], t: number) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t] as [number, number]);
  const secs: Sec[] = [];
  const body = (x: number) => {
    // the waist sits over the feet in the middle and the section's bottom lifts toward the horn and the heel
    const mid = Math.max(0, 1 - Math.abs((x - 0.03) / 0.2));
    const yb = 0.06 + (1 - Math.min(1, mid * 1.6)) * 0.14;
    return rect(yb, H, 0.13 + 0.05 * mid, faceW, 0.085 + 0.02 * mid, 0.13 + 0.03 * (1 - mid));
  };
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = x0 + (xHornRoot - x0) * t;
    // horn: a cone curving up slightly to the tip, rising into the throat under the step
    const r = 0.006 + 0.052 * Math.pow(t, 0.85);
    const cy = H - 0.055 + 0.02 * (1 - t) - 0.012 * t;
    const hs = circ(cy, r, 0.08);
    secs.push({ x, pts: t < 0.85 ? hs : lerpSec(hs, body(x), (t - 0.85) / 0.15 * 0.5) });
  }
  // the step (a little lower than the face), then the face to the heel
  const stepSec = (x: number) => rect(0.13, H - 0.022, 0.1, 0.1, 0.08, 0.17);
  secs.push({ x: xHornRoot + 0.02, pts: lerpSec(stepSec(xHornRoot), body(xHornRoot + 0.02), 0.3) });
  secs.push({ x: xStep - 0.004, pts: stepSec(xStep) });
  secs.push({ x: xStep + 0.004, pts: body(xStep + 0.004) });
  for (let i = 1; i <= 10; i++) {
    const x = xStep + (xHeel - 0.04 - xStep) * (i / 10);
    secs.push({ x, pts: body(x) });
  }
  // heel: tapers in plan, the underside lifts to the face
  for (const [x, k] of [[xHeel - 0.015, 0.75], [xHeel, 0.5]] as [number, number][]) {
    const b = body(x).map(([z, y]) => [z * (0.6 + 0.4 * k), Math.max(y, H - 0.1 * k - 0.02)] as [number, number]);
    secs.push({ x, pts: b });
  }
  // write the loft: faces on the top row of quads (the face/step) get the polished material
  for (let s = 0; s < secs.length - 1; s++) {
    const A = secs[s], B = secs[s + 1];
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      const a0 = V(A.x, A.pts[k][1], A.pts[k][0]), a1 = V(A.x, A.pts[k2][1], A.pts[k2][0]);
      const b0 = V(B.x, B.pts[k][1], B.pts[k][0]), b1 = V(B.x, B.pts[k2][1], B.pts[k2][0]);
      const top = (k === 4 || k === 5 || k === 6) && A.x > xHornRoot - 0.01;
      const mat = top ? 'f_face' : 'f_anvil';
      const uv = (p: THREE.Vector3): [number, number] => (top ? [p.x, p.z] : [p.x, p.y + p.z * 0.5]);
      ms.quad(mat, a0, b0, b1, a1, uv(a0), uv(b0), uv(b1), uv(a1));
    }
  }
  // end caps: the horn tip and the heel face
  const cap = (S: Sec, dir: number) => {
    const c = S.pts.reduce((s, p) => [s[0] + p[0] / N, s[1] + p[1] / N], [0, 0]);
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      const p0 = V(S.x, S.pts[k][1], S.pts[k][0]), p1 = V(S.x, S.pts[k2][1], S.pts[k2][0]), pc = V(S.x, c[1], c[0]);
      const n = V(dir, 0, 0);
      if (dir > 0) ms.tri('f_anvil', pc, p0, p1, n, n, n, [pc.z, pc.y], [p0.z, p0.y], [p1.z, p1.y]);
      else ms.tri('f_anvil', pc, p1, p0, n, n, n, [pc.z, pc.y], [p1.z, p1.y], [p0.z, p0.y]);
    }
  };
  cap(secs[0], -1);
  cap(secs[secs.length - 1], 1);
  // the feet: four splayed blocks under the waist
  // the base: a flared block under the waist with four short feet at its corners
  ms.pushT(0.03, 0, 0);
  lathe(ms, 'f_anvil', [[0.0, 0.0], [0.17, 0.0], [0.17, 0.03], [0.13, 0.07], [0.1, 0.11], [0.0, 0.11]], 4, { phase: Math.PI / 4 });
  ms.pop();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxAt(ms, 'f_anvil', 0.03 + sx * 0.115, 0.015, sz * 0.09, 0.07, 0.03, 0.06, 0, { uv: [sx, sz] });
  // hardy hole (square) and pritchel hole (round) near the heel: dark recesses with walls
  const hardyX = xHeel - 0.07, pritchelX = xHeel - 0.13;
  const hole = (x: number, sq: boolean) => {
    const s = sq ? 0.012 : 0.0065;
    if (sq) {
      ms.quad('f_hole', V(x - s, H + 0.0006, s), V(x + s, H + 0.0006, s), V(x + s, H + 0.0006, -s), V(x - s, H + 0.0006, -s), [0, 0], [1, 0], [1, 1], [0, 1]);
    } else {
      ms.pushT(x, H + 0.0006, 0);
      lathe(ms, 'f_hole', [[0, 0], [s, 0], [s, 0.0001], [0, 0.0001]], 8);
      ms.pop();
    }
  };
  hole(hardyX, true); hole(pritchelX, false);
  const group = ms.build({ name: 'anvil' });
  return { group, faceY: H, faceX0: xStep, faceX1: xHeel, hardyX, hornX: x0 + 0.08 };
}

/** an elm stump for the anvil to sit on, banded with iron straps */
export function writeStump(ms: Mesher, r: number, h: number, seed: number): void {
  ms.push(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  log(ms, h, r, { seed, seg: 14, ring: 0.25, taper: 0.02, bend: 0, lump: 0.04, capA: 1, capB: 2, matFor: () => 'bark' });
  ms.pop();
  for (const y of [h * 0.25, h * 0.82]) {
    ms.pushT(0, y, 0);
    lathe(ms, 'iron', [[r * 1.035, -0.018], [r * 1.045, -0.012], [r * 1.045, 0.012], [r * 1.035, 0.018]], 18);
    ms.pop();
  }
}

// ---------------------------------------------------------------------------------------------- bellows
/**
 * Great bellows lying along Z: nozzle at -Z, the wide end at +Z. The bottom board is fixed; `top` pivots about
 * X at the nozzle (set top.rotation.x = -open) and `leather` is rebuilt for an opening angle with setOpen().
 */
export function buildBellows(): { group: THREE.Group; top: THREE.Group; setOpen(a: number): void; length: number } {
  ensureForgeMats();
  const group = new THREE.Group();
  group.name = 'bellows';
  const L = 0.95, Wd = 0.56;
  const outline = (s: number): [number, number][] => {
    // teardrop in (x, z): the nozzle end narrow at z = 0, the round end at z = L
    const pts: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = Math.PI * t;
      const zz = L * 0.62 + Math.sin(a) * L * 0.38 * 0.95;
      const xx = Math.cos(a) * Wd / 2;
      pts.push([xx * s, zz]);
    }
    pts.push([-0.06 * s, 0.05], [0.06 * s, 0.05]);
    return pts.reverse();
  };
  const boardShape = (s: number) => {
    const sh = new THREE.Shape();
    const o = outline(s);
    sh.moveTo(o[0][0], o[0][1]);
    for (const [x, z] of o.slice(1)) sh.lineTo(x, z);
    return sh;
  };
  const ms = new Mesher();
  // bottom board (on the frame): extruded teardrop, laid flat (shape XY -> XZ)
  ms.push(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  extrude(ms, 'board_warm', boardShape(1), 0.03, { curveSegments: 4 });
  ms.pop();
  // nozzle: a tapered iron pipe pointing -Z
  tube(ms, 'iron', [V(0, -0.0, 0.08), V(0, -0.005, -0.08), V(0, -0.01, -0.22)], 0.04, 10, { rEnd: 0.022 });
  boxAt(ms, 'iron', 0, -0.012, 0.09, 0.16, 0.05, 0.06);
  // iron studs around the bottom board's rim
  const o = outline(1);
  for (let i = 1; i < o.length - 2; i += 2) boxAt(ms, 'iron', o[i][0] * 0.95, -0.033, o[i][1] * 0.98, 0.012, 0.006, 0.012);
  group.add(ms.build({ name: 'bellows_base' }));
  // top board, hinged at the nozzle end
  const top = new THREE.Group();
  top.position.set(0, 0.035, 0.09);
  const tms = new Mesher();
  tms.pushT(0, 0, -0.09);
  tms.push(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  extrude(tms, 'board_warm', boardShape(1), 0.03, { curveSegments: 4 });
  tms.pop();
  // a ring bolt at the round end for the lever's chain
  tms.pushT(0, 0.02, L * 0.9, 0, 0, Math.PI / 2);
  lathe(tms, 'iron', [[0.012, -0.004], [0.016, 0], [0.012, 0.004]], 8);
  tms.pop();
  tms.pop();
  top.add(tms.build({ name: 'bellows_top' }));
  group.add(top);
  // leather: pleated sides between the boards, rebuilt for the opening angle
  const leatherMat = 'leather';
  let leatherMesh: THREE.Object3D | null = null;
  const setOpen = (a: number) => {
    top.rotation.x = -a;
    if (leatherMesh) { leatherMesh.removeFromParent(); leatherMesh.traverse((c) => (c as THREE.Mesh).geometry?.dispose()); }
    const lm = new Mesher();
    const ring = outline(0.97).filter((_, i) => i > 0);
    const n = ring.length;
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const t0 = r / rows, t1 = (r + 1) / rows;
      const P = (i: number, t: number) => {
        const [x, z] = ring[i];
        // the top board's height at this z for the angle, the pleat bulging out at the middle rows
        const hz = Math.max(0, z - 0.09);
        const yTop = 0.03 + Math.sin(a) * hz;
        const bulge = 1 + 0.07 * Math.sin(t * Math.PI) * (r % 2 ? 0.5 : 1) * Math.min(1, a * 4);
        return V(x * bulge, -0.0 + yTop * t, z);
      };
      for (let i = 0; i < n - 1; i++) {
        const a0 = P(i, t0), a1 = P(i + 1, t0), b0 = P(i, t1), b1 = P(i + 1, t1);
        lm.quad(leatherMat, a0, a1, b1, b0, [i * 0.06, t0 * 0.2], [(i + 1) * 0.06, t0 * 0.2], [(i + 1) * 0.06, t1 * 0.2], [i * 0.06, t1 * 0.2]);
        lm.quad(leatherMat, a1, a0, b0, b1, [i * 0.06, t0 * 0.2], [(i + 1) * 0.06, t0 * 0.2], [(i + 1) * 0.06, t1 * 0.2], [i * 0.06, t1 * 0.2]);
      }
    }
    leatherMesh = lm.build({ name: 'bellows_leather', cast: false });
    group.add(leatherMesh);
  };
  setOpen(0.12);
  return { group, top, setOpen, length: L };
}

// ---------------------------------------------------------------------------------------------- grindstone
/**
 * Treadle grindstone: a 0.6 m sandstone wheel on an axle along X in a frame, crank on +X driven by a pitman arm
 * from the treadle board, water trough under the wheel. Origin on the floor under the axle. Returns the spinning
 * wheel, crank and treadle parts.
 */
export function buildGrindstone(): { group: THREE.Group; wheel: THREE.Group; crank: THREE.Group; treadle: THREE.Group; pitman: THREE.Object3D; axleY: number; radius: number } {
  ensureForgeMats();
  const group = new THREE.Group();
  group.name = 'grindstone';
  const rnd = new Rand(77);
  const ms = new Mesher();
  const axleY = 0.66, R = 0.3, T = 0.075;
  // the frame: two long rails along Z on four splayed legs, cross stretchers
  for (const x of [-0.16, 0.16]) {
    board(ms, 'board_dark', rnd, x, axleY - 0.05, 0, 0.07, 0.07, 0.95, 0, { grain: 'z' });
    for (const z of [-0.4, 0.4]) {
      ms.pushT(x + Math.sign(x) * 0.04, (axleY - 0.08) / 2, z, 0, 0, -Math.sign(x) * 0.1);
      box(ms, 'board_dark', 0.06, axleY - 0.05, 0.06, { grain: 'y', uv: [rnd.range(0, 2), 0] });
      ms.pop();
    }
  }
  for (const z of [-0.4, 0.4]) board(ms, 'board_dark', rnd, 0, 0.18, z, 0.4, 0.05, 0.05, 0, { grain: 'x' });
  // bearing blocks
  for (const x of [-0.16, 0.16]) boxAt(ms, 'board_warm', x, axleY - 0.005, 0, 0.08, 0.05, 0.1);
  // the water trough under the wheel: a little plank box, dark water
  const tz0 = -0.2, tz1 = 0.2;
  board(ms, 'board_grey', rnd, 0, 0.22, 0, 0.14, 0.02, tz1 - tz0, 0, { grain: 'z' });
  for (const x of [-0.07, 0.07]) board(ms, 'board_grey', rnd, x, 0.28, 0, 0.02, 0.12, tz1 - tz0, 0, { grain: 'z' });
  for (const z of [tz0, tz1]) board(ms, 'board_grey', rnd, 0, 0.28, z, 0.16, 0.12, 0.02, 0, { grain: 'x' });
  ms.pushT(0, 0.315, 0);
  box(ms, 'enamel_blue', 0.12, 0.002, tz1 - tz0 - 0.02, { faces: { ny: null, px: null, nx: null, pz: null, nz: null } });
  ms.pop();
  // treadle pivot bar at the back
  tube(ms, 'iron', [V(-0.2, 0.06, -0.42), V(0.2, 0.06, -0.42)], 0.012, 6);
  group.add(ms.build({ name: 'grind_frame' }));
  // the wheel (spins about X)
  const wheel = new THREE.Group();
  wheel.position.set(0, axleY, 0);
  const wms = new Mesher();
  wms.push(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  lathe(wms, 'f_sandstone', [[0.03, -T / 2], [R - 0.01, -T / 2], [R, -T / 2 + 0.01], [R, T / 2 - 0.01], [R - 0.01, T / 2], [0.03, T / 2]], 32);
  // the axle through it, squared with wedges
  lathe(wms, 'iron', [[0, -0.24], [0.018, -0.24], [0.018, 0.24], [0, 0.24]], 8);
  wms.pop();
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    for (const s of [-1, 1]) boxAt(wms, 'board_warm', s * (T / 2 + 0.01), Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.02, 0.025, 0.025, 0, {}, a);
  }
  wheel.add(wms.build({ name: 'grind_wheel' }));
  group.add(wheel);
  // crank on +X (turns with the wheel)
  const crank = new THREE.Group();
  crank.position.set(0.24, axleY, 0);
  const cms = new Mesher();
  boxAt(cms, 'iron', 0, -0.06, 0, 0.012, 0.13, 0.025);
  tube(cms, 'iron', [V(0, -0.12, 0), V(0.05, -0.12, 0)], 0.009, 6);
  crank.add(cms.build({ name: 'grind_crank' }));
  group.add(crank);
  // pitman arm (crank pin -> treadle) and the treadle board pivoting at the back
  const pitman = new THREE.Group();
  const pms = new Mesher();
  boxAt(pms, 'board_warm', 0, -0.25, 0, 0.025, 0.5, 0.02);
  pitman.add(pms.build({ name: 'pitman' }));
  group.add(pitman);
  const treadle = new THREE.Group();
  treadle.position.set(0, 0.06, -0.42);
  const trms = new Mesher();
  board(trms, 'board_warm', rnd, 0.24, 0.0, 0.32, 0.12, 0.03, 0.66, 0, { grain: 'z' });
  treadle.add(trms.build({ name: 'treadle' }));
  group.add(treadle);
  return { group, wheel, crank, treadle, pitman, axleY, radius: R };
}

// ---------------------------------------------------------------------------------------------- slack tub
/** half barrel slack tub: staves and iron hoops; origin on the floor; water surface at waterY */
export function buildSlackTub(): { group: THREE.Group; waterY: number; r: number } {
  const ms = new Mesher();
  const rnd = new Rand(31);
  const h = 0.52, r0 = 0.27, r1 = 0.3;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, a2 = ((i + 0.94) / n) * Math.PI * 2;
    const sh = rnd.range(-0.01, 0.01);
    const P = (aa: number, y: number, r: number) => V(Math.cos(aa) * r, y, Math.sin(aa) * r);
    const yT = h + sh;
    // outside and inside faces of one stave (slight belly), the top edge
    const ro = (y: number) => r0 + (r1 - r0) * Math.sin((y / h) * Math.PI * 0.5);
    const ys = [0, h * 0.35, h * 0.7, yT];
    for (let k = 0; k < ys.length - 1; k++) {
      const y0 = ys[k], y1 = ys[k + 1];
      ms.quad('wood_fresh', P(a, y0, ro(y0)), P(a2, y0, ro(y0)), P(a2, y1, ro(y1)), P(a, y1, ro(y1)), [a * 0.3, y0], [a2 * 0.3, y0], [a2 * 0.3, y1], [a * 0.3, y1]);
      ms.quad('board_dark', P(a2, y0, ro(y0) - 0.02), P(a, y0, ro(y0) - 0.02), P(a, y1, ro(y1) - 0.02), P(a2, y1, ro(y1) - 0.02), [a * 0.3, y0], [a2 * 0.3, y0], [a2 * 0.3, y1], [a * 0.3, y1]);
    }
    ms.quad('board_warm', P(a, yT, ro(h)), P(a2, yT, ro(h)), P(a2, yT, ro(h) - 0.02), P(a, yT, ro(h) - 0.02), [0, 0], [0.1, 0], [0.1, 0.02], [0, 0.02]);
  }
  for (const y of [0.08, h - 0.08]) {
    ms.pushT(0, y, 0);
    const rr = r0 + (r1 - r0) * Math.sin((y / h) * Math.PI * 0.5) + 0.004;
    lathe(ms, 'rusty_red', [[rr, -0.02], [rr + 0.004, -0.015], [rr + 0.004, 0.015], [rr, 0.02]], 24);
    ms.pop();
  }
  ms.pushT(0, 0.02, 0);
  lathe(ms, 'board_dark', [[0, 0], [r0 - 0.01, 0], [r0 - 0.01, 0.02], [0, 0.02]], 18);
  ms.pop();
  const g = ms.build({ name: 'slack_tub' });
  return { group: g, waterY: h - 0.07, r: r0 - 0.012 };
}

// ---------------------------------------------------------------------------------------------- hand tools
/** blacksmith's tongs: grip at the origin on the reins, jaws at +Y (0.42 m out), jaws close along X */
export function buildTongs(open = 0.0): THREE.Group {
  const ms = new Mesher();
  for (const s of [-1, 1]) {
    const pts = [V(s * 0.012, -0.12, 0), V(s * 0.01, 0.1, 0), V(s * 0.008, 0.3, 0), V(s * (0.006 + open), 0.36, 0)];
    tube(ms, 'iron', pts, 0.0055, 5);
    // the boss and the flat jaw
    ms.pushT(s * (0.004 + open * 0.5), 0.38, 0);
    box(ms, 'iron', 0.012, 0.03, 0.022);
    ms.pop();
    ms.pushT(s * (0.004 + open), 0.42, 0);
    box(ms, 'iron', 0.008, 0.07, 0.016);
    ms.pop();
  }
  ms.pushT(0, 0.375, 0.012, 0, Math.PI / 2);
  lathe(ms, 'iron', [[0, 0], [0.009, 0], [0.009, 0.004], [0, 0.004]], 8);
  ms.pop();
  return ms.build({ name: 'tongs' });
}

/** cross-peen hammer: grip at the origin, head at +Y, the face toward +Z (the peen toward -Z) */
export function buildHammer(kind: 'cross' | 'ball' | 'sledge' = 'cross'): THREE.Group {
  const ms = new Mesher();
  const hl = kind === 'sledge' ? 0.75 : 0.36;
  ms.pushT(0, hl / 2 - 0.14, 0);
  lathe(ms, 'handle_wood', [[0.0, -hl / 2], [0.014, -hl / 2], [0.016, -hl / 2 + 0.03], [0.012, 0], [0.011, hl / 2 - 0.02], [0.012, hl / 2], [0, hl / 2]], 8);
  ms.pop();
  const hy = hl - 0.14 + 0.01;
  const L = kind === 'sledge' ? 0.2 : 0.15, r = kind === 'sledge' ? 0.035 : 0.027;
  ms.pushT(0, hy, 0, 0, Math.PI / 2);
  // the head along Z: square-ish body, round face at +Z, peen at -Z
  lathe(ms, 'f_anvil', [[0, L * 0.55], [r * 0.9, L * 0.55], [r, L * 0.48], [r * 0.95, 0], [r * 0.7, -L * 0.3], [kind === 'ball' ? r * 0.8 : 0.006, -L * 0.45], [0, -L * 0.48]], kind === 'cross' ? 4 : 10, { phase: Math.PI / 4 });
  ms.pop();
  return ms.build({ name: `hammer_${kind}` });
}

/** a horseshoe (wall dressing) in the XY plane */
export function writeHorseshoe(ms: Mesher, x: number, y: number, z: number, ry: number): void {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) { const a = Math.PI * 0.1 + (i / 12) * Math.PI * 1.8; pts.push(V(Math.cos(a) * 0.055, Math.sin(a) * 0.06, 0)); }
  ms.pushT(x, y, z, ry, 0, Math.PI / 2);
  tube(ms, 'iron', pts, 0.006, 5);
  ms.pop();
}

export { box, boxAt };
