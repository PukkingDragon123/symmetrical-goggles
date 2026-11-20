// Ray's blacksmith lean-to, beside the woodshed in the woodyard (same builder, same rusty corrugated roof): an
// open-fronted log-post shed on a packed cinder floor with
//   * a waist-high fieldstone forge with a brick table, a fire-brick firepot full of coal (instanced lumps that
//     glow with the blast), a brick hood and chimney through the roof
//   * great bellows on trestles beside it, worked by a rocker lever with a cow-horn handle and a counterweight
//   * a London-pattern anvil on a banded elm stump, the slack tub (half barrel), a treadle grindstone
//   * a workbench with a post vise, a tool wall (tongs, hammers, files, horseshoes), the chalk slate of jobs
//   * a charcoal bin and shovel, a steel-drum charcoal retort outside, a hurricane lantern on the front beam
// Frame: +Z is the open front (toward the cabin, like the woodshed), origin at the floor centre.
import * as THREE from 'three';
import { SPOTS, heightAt } from '../world/layout';
import { Mesher, Rand, Cols, V, box, boxAt, board, logAB, log, lathe, tube, flicker, shadowy, lightCuller, anchor, placeMat, type Place } from './kit';
import { rock, colorMat, tb, prop, r5off } from './store/inst';
import { ensurePrintMats, LABELS } from './signs';
import { G as GFX } from '../gfx/globals';
import { ensureStoreMats, card, cardAt, floorDecal, groundDecal } from './store/print';
import { writeRound, writeSplit } from './products';
import { loadProp } from './props';
import { flameCards } from './fixtures';
import { ensureForgeMats, buildAnvil, writeStump, buildBellows, buildGrindstone, buildSlackTub, buildTongs, buildHammer, writeHorseshoe } from './forge_parts';

export const FORGE = {
  W: 4.2, D: 2.8, hf: 2.55, hb: 2.1,
  hearth: { x0: -1.4, x1: -0.3, z0: -1.32, z1: -0.5, top: 0.8 },
  pot: { x: -0.85, z: -0.9, s: 0.34, depth: 0.13 },
  anvil: { x: 0.32, z: 0.12, stump: 0.52 },
  tub: { x: 0.06, z: -1.0 },
  grind: { x: 1.45, z: 0.42 },
  bench: { x0: 0.6, x1: 2.05, z0: -1.38, z1: -0.9, y: 0.86 },
  bellows: { x: -1.75, z: -1.2 },
  lever: { x: -1.72, y: 1.42, z: -1.22, yaw: 0.53, len: 0.93 },
};

/** world placement of the lean-to: beside the woodshed, in the woodyard's frame */
export function forgePlacement(): { x: number; z: number; rot: number } {
  const yardRot = (SPOTS.cabin.rot ?? 0) - Math.PI / 2;
  const lx = 4.75, lz = -1.45; // yard-local: the woodshed spans x -2.1..2.1 at z -2.8..-0.25
  const c = Math.cos(yardRot), s = Math.sin(yardRot);
  return { x: SPOTS.woodyard.x + c * lx + s * lz, z: SPOTS.woodyard.z - s * lx + c * lz, rot: yardRot };
}

export interface ForgePlace extends Place {
  floorY: number;
  parts: {
    bellows: ReturnType<typeof buildBellows>;
    lever: THREE.Group;
    rod: THREE.Object3D;
    grind: ReturnType<typeof buildGrindstone>;
    anvil: ReturnType<typeof buildAnvil> & { origin: THREE.Vector3 };
    tub: ReturnType<typeof buildSlackTub> & { origin: THREE.Vector3; water: THREE.Mesh };
    coal: { mesh: THREE.InstancedMesh; heat: THREE.InstancedBufferAttribute; uHeat: { value: number }; glow: THREE.MeshStandardMaterial; flames: THREE.Group; fuel(v: number): void };
    fireLight: THREE.PointLight;
    slate: THREE.Mesh;
    tongsRest: THREE.Object3D;
    hammerRest: THREE.Object3D;
    retort: THREE.Object3D;
    retortGlow: THREE.MeshStandardMaterial;
    bin: THREE.Object3D;
  };
  hits: Record<'fire' | 'anvil' | 'grind' | 'slate' | 'retort' | 'bin' | 'tub' | 'lever', THREE.Mesh>;
  /** 0..1 forge heat for the light and the glow (the station sets it) */
  setHeat(h: number): void;
}

function hitBox(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.set(x, y, z);
  m.userData.pickProxy = true;
  parent.add(m);
  return m;
}

export async function buildForge(): Promise<ForgePlace> {
  ensureForgeMats();
  ensurePrintMats();
  ensureStoreMats();
  const pl = forgePlacement();
  const F = FORGE;
  const c = Math.cos(pl.rot), s = Math.sin(pl.rot);
  const toW = (lx: number, lz: number) => [pl.x + c * lx + s * lz, pl.z - s * lx + c * lz] as [number, number];
  const gAt = (lx: number, lz: number) => { const [wx, wz] = toW(lx, lz); return heightAt(wx, wz); };
  // a level floor at the highest ground under the shed
  let gMax = -1e9, gMin = 1e9;
  for (let ix = -2; ix <= 2; ix++) for (let iz = -2; iz <= 2; iz++) { const h = gAt(ix * F.W / 4.2, iz * F.D / 4.2); gMax = Math.max(gMax, h); gMin = Math.min(gMin, h); }
  const floorY = gMax + 0.04;
  const group = new THREE.Group();
  group.name = 'forge';
  group.position.set(pl.x, floorY, pl.z);
  group.rotation.y = pl.rot;
  const ms = new Mesher();
  const cols = new Cols();
  const rnd = new Rand(1902);
  const anchors: Record<string, THREE.Object3D> = {};
  const lights: THREE.Light[] = [];
  const updaters: ((dt: number) => void)[] = [];
  const gh = (lx: number, lz: number) => gAt(lx, lz) - floorY; // ground height in local coords (<= 0)
  const hw = F.W / 2, hd = F.D / 2;

  // ---- floor: packed cinders on a raised pad edged with a log sill and stones
  ms.pushT(0, -0.005, 0);
  box(ms, 'f_floor', F.W + 0.3, 0.01, F.D + 0.2, { faces: { ny: null }, uv: [0.3, 0.2] });
  ms.pop();
  const padDrop = Math.max(0.12, floorY - gMin + 0.1);
  ms.pushT(0, -padDrop / 2 - 0.01, 0);
  box(ms, 'f_floor', F.W + 0.3, padDrop, F.D + 0.2, { faces: { py: null, ny: null }, uv: [0.1, 0.6] });
  ms.pop();
  logAB(ms, V(-hw - 0.2, -0.06, hd + 0.12), V(hw + 0.2, -0.06, hd + 0.12), 0.09, { seed: 1, seg: 8, capA: 0, capB: 0 });
  for (let i = 0; i < 9; i++) { const x = -hw + (i / 8) * F.W; rock(ms, rnd, x + rnd.range(-0.1, 0.1), -0.12, hd + 0.2 + rnd.range(0, 0.1), rnd.range(0.2, 0.32), 0.14, rnd.range(0.18, 0.26)); }
  // a few flat stones laid around the anvil and in front of the hearth (worn paths)
  for (const [x, z, w] of [[0.1, 0.65, 0.4], [-0.75, 0.15, 0.38], [0.7, 0.55, 0.3], [-0.2, -0.25, 0.3]] as [number, number, number][]) {
    ms.pushT(x, 0.006, z, rnd.range(0, 3));
    box(ms, 'stone', w, 0.014, w * 0.8, { uv: [rnd.range(0, 2), rnd.range(0, 2)] });
    ms.pop();
  }
  cols.box(0, -padDrop / 2, 0, hw + 0.15, padDrop / 2, hd + 0.1);

  // ---- posts, plates, rafters, corrugated roof (the woodshed's construction)
  const posts: [number, number, number][] = [[-hw, hd - 0.05, F.hf], [hw, hd - 0.05, F.hf], [-hw, -hd + 0.05, F.hb], [hw, -hd + 0.05, F.hb]];
  for (const [x, z, h] of posts) {
    logAB(ms, V(x, gh(x, z) - 0.1, z), V(x, h, z), 0.075, { seed: 30 + x * 3 + z, seg: 8, capA: -1, capB: 0, taper: 0.1 });
    cols.box(x, h / 2, z, 0.08, h / 2, 0.08);
  }
  logAB(ms, V(-hw - 0.25, F.hf, hd - 0.05), V(hw + 0.25, F.hf, hd - 0.05), 0.11, { seed: 40, seg: 9, capA: 0, capB: 0, bend: 0.004 });
  logAB(ms, V(-hw - 0.25, F.hb, -hd + 0.05), V(hw + 0.25, F.hb, -hd + 0.05), 0.08, { seed: 41, seg: 8, capA: 0, capB: 0 });
  for (const x of [-hw, -0.7, 0.7, hw]) logAB(ms, V(x, F.hf + 0.1, hd + 0.45), V(x, F.hb + 0.1, -hd - 0.35), 0.055, { seed: 50 + x, seg: 7, capA: 0, capB: 0 });
  const ya = F.hf + 0.17, yb = F.hb + 0.17, za = hd + 0.5, zb = -hd - 0.4;
  const roofY = (z: number) => yb + (ya - yb) * ((z - zb) / (za - zb));
  {
    const n = 72;
    const chim = { x0: -1.06, x1: -0.64, z0: -1.32, z1: -0.92 };
    for (let i = 0; i < n; i++) {
      const xa = -hw - 0.35 + (F.W + 0.7) * (i / n), xb = -hw - 0.35 + (F.W + 0.7) * ((i + 1) / n);
      const wa = 0.018 * Math.sin(i * Math.PI / 2), wb = 0.018 * Math.sin((i + 1) * Math.PI / 2);
      // leave a hole for the chimney
      const segs: [number, number][] = (xb > chim.x0 && xa < chim.x1) ? [[za, chim.z1], [chim.z0, zb]] : [[za, zb]];
      for (const [z0, z1] of segs) {
        const A = V(xa, roofY(z0) + wa, z0), B = V(xb, roofY(z0) + wb, z0), C = V(xb, roofY(z1) + wb, z1), D = V(xa, roofY(z1) + wa, z1);
        const L0 = za - z0, L1 = za - z1;
        ms.quad('corrugated', A, B, C, D, [L0, xa], [L0, xb], [L1, xb], [L1, xa]);
        ms.quad('corrugated', B, A, D, C, [L0, xb], [L0, xa], [L1, xa], [L1, xb]);
      }
    }
    cols.box(0, (ya + yb) / 2, (za + zb) / 2, hw + 0.35, 0.05, (za - zb) / 2);
  }
  // back wall: sooty slab boards; a short side wall behind the bellows
  for (let i = 0; i < 7; i++) board(ms, i < 4 ? 'f_soot_board' : 'board_grey', rnd, 0, gh(0, -hd) + 0.15 + i * 0.29, -hd - 0.03, F.W + 0.1, 0.25, 0.03, 0, { grain: 'x' });
  cols.box(0, 1.0, -hd - 0.03, hw, 1.0, 0.05);
  for (let i = 0; i < 6; i++) board(ms, 'board_grey', rnd, -hw - 0.03, 0.15 + i * 0.29, -0.55, 0.03, 0.25, 1.75, 0, { grain: 'z' });
  cols.box(-hw - 0.03, 0.9, -0.55, 0.05, 0.9, 0.88);

  // ---- the forge: fieldstone base, brick table, fire-brick firepot, brick back, hood and chimney
  const H = F.hearth, P = F.pot;
  {
    const cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
    ms.pushT(cx, 0.35, cz);
    box(ms, 'stone', H.x1 - H.x0, 0.7, H.z1 - H.z0, { uv: [0.4, 0.1] });
    ms.pop();
    // proud fieldstones in the base (lumpy, not a box)
    for (let i = 0; i < 14; i++) {
      const side = i % 3;
      const x = side === 2 ? H.x1 + 0.01 : H.x0 + rnd.range(0.1, H.x1 - H.x0 - 0.1);
      const z = side === 2 ? H.z0 + rnd.range(0.1, H.z1 - H.z0 - 0.1) : H.z1 + 0.01;
      rock(ms, rnd, x, rnd.range(0.05, 0.55), z, rnd.range(0.14, 0.22), rnd.range(0.1, 0.15), rnd.range(0.08, 0.12));
    }
    // brick table: three courses with a soldier course edge, sooted at the top
    const bh = 0.065, bl = 0.2;
    for (let k = 0; k < 2; k++) {
      const y = 0.7 + k * bh + bh / 2;
      for (let x = H.x0; x < H.x1 - 0.01; x += bl) {
        const w = Math.min(bl, H.x1 - x) - 0.008;
        boxAt(ms, k ? 'f_brick_soot' : 'f_brick', x + w / 2 + (k % 2) * 0.05 * 0, y, H.z1 - 0.05, w, bh - 0.008, 0.1, 0, { uv: [x * 3, y * 3] });
      }
      for (let z = H.z0; z < H.z1 - 0.1; z += bl) {
        const d = Math.min(bl, H.z1 - 0.1 - z) - 0.008;
        boxAt(ms, k ? 'f_brick_soot' : 'f_brick', H.x1 - 0.05, y, z + d / 2, 0.1, bh - 0.008, d, 0, { uv: [z * 3, y * 3] });
        boxAt(ms, k ? 'f_brick_soot' : 'f_brick', H.x0 + 0.05, y, z + d / 2, 0.1, bh - 0.008, d, 0, { uv: [z * 3 + 1, y * 3] });
      }
    }
    // the table top: sooty brick around the firepot opening
    const top = H.top;
    const ring = (x0: number, x1: number, z0: number, z1: number) => { ms.pushT((x0 + x1) / 2, top - 0.01, (z0 + z1) / 2); box(ms, 'f_brick_soot', x1 - x0, 0.02, z1 - z0, { faces: { ny: null }, uv: [x0, z0] }); ms.pop(); };
    ring(H.x0, P.x - P.s / 2, H.z0, H.z1);
    ring(P.x + P.s / 2, H.x1, H.z0, H.z1);
    ring(P.x - P.s / 2, P.x + P.s / 2, P.z + P.s / 2, H.z1);
    ring(P.x - P.s / 2, P.x + P.s / 2, H.z0, P.z - P.s / 2);
    // firepot walls (fire brick) and the ash floor
    const fy = top - P.depth;
    for (const [x, z, w, d] of [[P.x, P.z + P.s / 2, P.s, 0.01], [P.x, P.z - P.s / 2, P.s, 0.01], [P.x + P.s / 2, P.z, 0.01, P.s], [P.x - P.s / 2, P.z, 0.01, P.s]] as [number, number, number, number][]) {
      ms.pushT(x, fy + P.depth / 2, z);
      box(ms, 'f_firebrick', w, P.depth, d, { uv: [x * 4, z * 4] });
      ms.pop();
    }
    ms.pushT(P.x, fy, P.z);
    box(ms, 'f_ash', P.s, 0.01, P.s, { faces: { ny: null } });
    ms.pop();
    // brick back wall on the hearth, then the hood corbelling in to the chimney
    for (let y = top; y < 1.5; y += bh) for (let x = H.x0; x < H.x1 - 0.01; x += bl) {
      const off = (Math.round((y - top) / bh) % 2) * bl / 2;
      const xx = Math.min(H.x1 - 0.1, x + off);
      boxAt(ms, y > 1.1 ? 'f_brick_soot' : 'f_brick', xx + 0.1, y + bh / 2, H.z0 + 0.06, Math.min(bl, H.x1 - xx) - 0.008, bh - 0.008, 0.11, 0, { uv: [xx * 3, y * 3] });
    }
    const hood = (y0: number, y1: number, a: [number, number, number, number], b: [number, number, number, number]) => {
      // a = [x0, x1, z0, z1] at y0, b at y1: four sloped faces
      const q = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) => ms.quad('f_brick_soot', p0, p1, p2, p3, [p0.x + p0.z, p0.y], [p1.x + p1.z, p1.y], [p2.x + p2.z, p2.y], [p3.x + p3.z, p3.y]);
      q(V(a[0], y0, a[3]), V(a[1], y0, a[3]), V(b[1], y1, b[3]), V(b[0], y1, b[3]));
      q(V(a[1], y0, a[3]), V(a[1], y0, a[2]), V(b[1], y1, b[2]), V(b[1], y1, b[3]));
      q(V(a[0], y0, a[2]), V(a[0], y0, a[3]), V(b[0], y1, b[3]), V(b[0], y1, b[2]));
      // the hood's underside lip
      q(V(a[1], y0, a[3]), V(a[0], y0, a[3]), V(a[0], y0 - 0.06, a[3] + 0.0), V(a[1], y0 - 0.06, a[3]));
    };
    hood(1.5, 1.98, [H.x0 - 0.02, H.x1 + 0.02, H.z0, -0.62], [-1.06, -0.64, H.z0, -0.92]);
    // chimney through the roof with a rain cap
    for (let y = 1.98; y < roofY(-1.12) + 0.75; y += bh) {
      const k = Math.round((y - 1.98) / bh) % 2;
      boxAt(ms, 'f_brick_soot', -0.85, y + bh / 2, -1.12, 0.42 - (k ? 0.01 : 0), bh - 0.008, 0.4 - (k ? 0 : 0.01), 0, { uv: [y * 2, k] });
    }
    const ctop = roofY(-1.12) + 0.75;
    boxAt(ms, 'f_brick_soot', -0.85, ctop + 0.03, -1.12, 0.48, 0.05, 0.46);
    ms.pushT(-0.85, ctop + 0.22, -1.12);
    box(ms, 'galv', 0.56, 0.015, 0.54);
    ms.pop();
    for (const [dx, dz] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) boxAt(ms, 'iron', -0.85 + dx, ctop + 0.13, -1.12 + dz, 0.02, 0.18, 0.02);
    cols.box(cx, 0.4, cz, (H.x1 - H.x0) / 2, 0.4, (H.z1 - H.z0) / 2);
    cols.box(-0.85, 2.3, -1.12, 0.22, 0.8, 0.22);
    // the tuyere: an iron pipe from the bellows nozzle into the side of the firepot
    tube(ms, 'iron', [V(F.bellows.x, 0.57, F.bellows.z + 0.02), V(F.bellows.x + 0.01, 0.58, -1.27), V(-1.6, 0.6, -1.2), V(H.x0 + 0.02, 0.62, P.z - 0.05)], 0.03, 10);
    // the clinker breaker / ash dump lever under the firepot
    tube(ms, 'iron', [V(P.x, 0.5, H.z1 + 0.02), V(P.x, 0.42, H.z1 + 0.18), V(P.x + 0.02, 0.4, H.z1 + 0.22)], 0.01, 5);
  }
  anchors.forge_fire = anchor(group, 'forge_fire', P.x, H.top + 0.02, P.z);

  // ---- coal bed: instanced lumps heaped in the firepot, glowing from the centre as the blast feeds them
  const coalBed = (() => {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + ((i * 37) % 7) * 0.05), p.getY(i) * 0.7, p.getZ(i) * (0.9 + ((i * 13) % 5) * 0.04));
    geo.computeVertexNormals();
    const N = 150;
    const heat = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    geo.setAttribute('aHeat', heat);
    const uHeat = { value: 0.3 };
    const base = placeMat('f_coal') as THREE.MeshStandardMaterial;
    const mat = base.clone();
    mat.emissive = new THREE.Color(1, 1, 1);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uHeat = uHeat;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHeat; varying float vHeat; varying vec3 vLp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat; vLp = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uHeat; varying float vHeat; varying vec3 vLp;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // blackbody-ish ramp, glowing hardest in the cracks between the black facets (dark texels)
          float h = clamp(vHeat * uHeat * 1.25, 0.0, 1.0);
          float crack = 1.0 - smoothstep(0.05, 0.25, dot(diffuseColor.rgb, vec3(0.33)));
          float under = smoothstep(0.4, -0.6, vLp.y);
          float g = h * (0.25 + 0.75 * max(crack, under));
          vec3 hot = mix(vec3(0.55, 0.06, 0.0), vec3(1.0, 0.45, 0.08), smoothstep(0.25, 0.7, h));
          hot = mix(hot, vec3(1.0, 0.85, 0.5), smoothstep(0.75, 1.0, h));
          g = floor(g * 6.0 + 0.5) / 6.0;
          totalEmissiveRadiance = hot * g * 2.6;`);
    };
    mat.customProgramCacheKey = () => 'forge_coal';
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const r = new Rand(55);
    const dummy = new THREE.Object3D();
    const slots: { x: number; z: number; y: number; s: number; h: number }[] = [];
    for (let i = 0; i < N; i++) {
      // a mound in the pot, spilling a little onto the table
      const a = r.range(0, 6.28), d = Math.pow(r.next(), 0.8) * 0.36;
      const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d * 0.9;
      const inPot = Math.abs(x - P.x) < P.s / 2 - 0.015 && Math.abs(z - P.z) < P.s / 2 - 0.015;
      const mound = inPot ? 0.05 * (1 - d / 0.2) : 0;
      const y = inPot ? H.top - 0.06 + r.range(0, 0.05) + mound : H.top + 0.008 + r.range(0, 0.02) * (1 - d / 0.36);
      const sc = r.range(0.016, 0.03) * (inPot ? 1 : 0.85);
      slots.push({ x, z, y, s: sc, h: inPot ? Math.max(0.1, 1 - d / 0.17) : 0.05 });
    }
    const place = (fuel: number) => {
      // less fuel: the mound sinks into the pot
      slots.forEach((q, i) => {
        const sink = (1 - fuel) * 0.06 * (q.h > 0.1 ? 1 : 0);
        dummy.position.set(q.x, q.y - sink, q.z);
        dummy.rotation.set(i * 1.3, i * 2.1, i * 0.7);
        dummy.scale.set(q.s, q.s, q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        heat.setX(i, q.h);
      });
      mesh.instanceMatrix.needsUpdate = true;
      heat.needsUpdate = true;
    };
    place(0.8);
    group.add(mesh);
    // the glow under the coals (seen between lumps)
    const glow = new THREE.MeshStandardMaterial({ color: 0x100804, emissive: new THREE.Color(1, 0.4, 0.08), emissiveIntensity: 1, roughness: 1 });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(P.s - 0.02, P.s - 0.02), glow);
    gm.rotation.x = -Math.PI / 2;
    gm.position.set(P.x, H.top - P.depth + 0.03, P.z);
    group.add(gm);
    const flames = flameCards(0.22, 0.24, 11);
    flames.position.set(P.x, H.top - 0.02, P.z);
    group.add(flames);
    return { mesh, heat, uHeat, glow, flames, fuel: place };
  })();

  const fireLight = new THREE.PointLight(0xff7a30, 0, 6, 1.7);
  fireLight.position.set(P.x + 0.05, H.top + 0.35, P.z + 0.3);
  shadowy(fireLight, 512, -0.004);
  fireLight.shadow.camera.far = 6;
  group.add(fireLight);
  lights.push(fireLight);

  // ---- bellows on trestles, the rocker lever with a horn handle and a counterweight stone
  const bel = buildBellows();
  bel.group.position.set(F.bellows.x, 0.58, F.bellows.z + 0.22);
  bel.group.rotation.y = 0; // nozzle toward -Z (into the tuyere), the round end toward the front
  group.add(bel.group);
  for (const z of [F.bellows.z + 0.35, F.bellows.z + 0.95]) {
    for (const sx of [-1, 1]) logAB(ms, V(F.bellows.x + sx * 0.3, 0, z), V(F.bellows.x + sx * 0.18, 0.55, z), 0.03, { seed: 70 + z * 9 + sx, seg: 6, capA: 0, capB: 0 });
    board(ms, 'board_dark', rnd, F.bellows.x, 0.545, z, 0.5, 0.05, 0.06, 0, { grain: 'x' });
  }
  cols.box(F.bellows.x, 0.45, F.bellows.z + 0.6, 0.3, 0.45, 0.6);
  const L = F.lever;
  // the lever's post stands behind the bellows' nozzle; the pole reaches over to hang its horn handle at the
  // hearth's front-left corner, where the smith's left hand finds it
  logAB(ms, V(L.x, 0, L.z - 0.16), V(L.x, L.y + 0.1, L.z - 0.16), 0.05, { seed: 80, seg: 7, capA: -1, capB: 0 });
  boxAt(ms, 'iron', L.x, L.y, L.z - 0.08, 0.05, 0.05, 0.16);
  const lever = new THREE.Group();
  lever.rotation.order = 'YXZ';
  lever.position.set(L.x, L.y, L.z);
  lever.rotation.y = L.yaw;
  const lms = new Mesher();
  logAB(lms, V(0, 0, -0.32), V(0, 0, L.len + 0.03), 0.026, { seed: 81, seg: 6, capA: 0, capB: 0, matFor: () => 'board_warm' });
  // horn handle hanging off the front end on a short chain
  for (let k = 0; k < 4; k++) { lms.pushT(0, -0.03 - k * 0.025, L.len, k * 1.57); lathe(lms, 'f_chain', [[0.006, -0.012], [0.009, 0], [0.006, 0.012]], 6); lms.pop(); }
  lms.pushT(0, -0.16, L.len, 0, 0, Math.PI / 2);
  lathe(lms, 'f_horn', [[0.0, -0.09], [0.012, -0.08], [0.018, -0.02], [0.02, 0.04], [0.015, 0.09], [0, 0.1]], 8);
  lms.pop();
  // counterweight stone lashed to the back end
  rock(lms, rnd, 0, -0.08, -0.27, 0.15, 0.12, 0.13);
  tube(lms, 'rope', [V(-0.06, 0.0, -0.27), V(0.06, 0.0, -0.27)], 0.008, 4);
  lever.add(lms.build({ name: 'bellows_lever' }));
  group.add(lever);
  // the connecting rod from the lever down to the bellows' top board
  const rod = new THREE.Group();
  const rms = new Mesher();
  boxAt(rms, 'board_warm', 0, -0.5, 0, 0.025, 1.0, 0.025);
  rod.add(rms.build({ name: 'bellows_rod' }));
  group.add(rod);
  const hx = L.x + Math.sin(L.yaw) * L.len, hz = L.z + Math.cos(L.yaw) * L.len;
  anchors.bellows_handle = anchor(group, 'bellows_handle', hx, L.y - 0.16, hz);

  // ---- charcoal bin with a heap and a coal shovel
  const bin = new THREE.Group();
  bin.position.set(-1.78, 0, 0.42);
  {
    const bms = new Mesher();
    const w = 0.46, d = 0.38, h = 0.36;
    for (let k = 0; k < 2; k++) {
      board(bms, 'board_grey', rnd, 0, 0.1 + k * 0.17, d / 2, w, 0.16, 0.025, 0, { grain: 'x' });
      board(bms, 'board_grey', rnd, 0, 0.1 + k * 0.17, -d / 2, w, 0.16, 0.025, 0, { grain: 'x' });
      board(bms, 'board_grey', rnd, w / 2, 0.1 + k * 0.17, 0, 0.025, 0.16, d, 0, { grain: 'z' });
      board(bms, 'board_grey', rnd, -w / 2, 0.1 + k * 0.17, 0, 0.025, 0.16, d, 0, { grain: 'z' });
    }
    const r = new Rand(9);
    for (let i = 0; i < 70; i++) {
      const x = r.range(-w / 2 + 0.04, w / 2 - 0.04), z = r.range(-d / 2 + 0.04, d / 2 - 0.04);
      const dd = Math.hypot(x / (w / 2), z / (d / 2));
      bms.pushT(x, h - 0.08 + (1 - dd) * 0.08 + r.range(-0.01, 0.01), z, r.range(0, 6), r.range(0, 3), r.range(0, 3));
      box(bms, 'f_coal', r.range(0.03, 0.055), r.range(0.025, 0.04), r.range(0.03, 0.05), { uv: [r.range(0, 1), r.range(0, 1)] });
      bms.pop();
    }
    // the shovel leaning in it
    tube(bms, 'board_warm', [V(0.12, 0.25, -0.05), V(0.2, 0.95, -0.12)], 0.013, 6);
    bms.pushT(0.1, 0.22, -0.03, 0.3, -0.35);
    box(bms, 'iron', 0.17, 0.2, 0.012);
    bms.pop();
    bin.add(bms.build({ name: 'charcoal_bin' }));
    cols.box(-1.78, 0.2, 0.42, w / 2, 0.2, d / 2);
  }
  group.add(bin);

  // ---- anvil on its stump
  const A = F.anvil;
  const anv = buildAnvil();
  writeStumpAt(ms, A.x, A.z, A.stump);
  anv.group.position.set(A.x, A.stump, A.z);
  group.add(anv.group);
  cols.box(A.x, (A.stump + 0.3) / 2, A.z, 0.36, (A.stump + 0.3) / 2, 0.16);
  anchors.anvil_face = anchor(group, 'anvil_face', A.x + 0.12, A.stump + anv.faceY, A.z);

  // ---- slack tub
  const T = F.tub;
  const tub = buildSlackTub();
  tub.group.position.set(T.x, 0, T.z);
  group.add(tub.group);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(tub.r, 24).rotateX(-Math.PI / 2), waterMat);
  water.position.set(T.x, tub.waterY, T.z);
  group.add(water);
  cols.box(T.x, 0.27, T.z, 0.3, 0.27, 0.3);
  anchors.slack_tub = anchor(group, 'slack_tub', T.x, tub.waterY, T.z);

  // ---- grindstone
  const G = F.grind;
  const grind = buildGrindstone();
  grind.group.position.set(G.x, 0, G.z);
  group.add(grind.group);
  cols.box(G.x, 0.4, G.z, 0.25, 0.4, 0.5);
  anchors.grindstone = anchor(group, 'grindstone', G.x, grind.axleY, G.z + grind.radius);

  // ---- workbench with a post vise, the tool wall, the slate
  const B = F.bench;
  {
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    for (let i = 0; i < 3; i++) board(ms, 'board_warm', rnd, cx, B.y - 0.025, B.z0 + (B.z1 - B.z0) * (i + 0.5) / 3, B.x1 - B.x0, 0.05, (B.z1 - B.z0) / 3 - 0.005, 0, { grain: 'x' });
    for (const x of [B.x0 + 0.06, B.x1 - 0.06]) for (const z of [B.z0 + 0.05, B.z1 - 0.05]) board(ms, 'board_dark', rnd, x, (B.y - 0.05) / 2, z, 0.07, B.y - 0.05, 0.07, 0, { grain: 'y' });
    board(ms, 'board_dark', rnd, cx, 0.2, B.z1 - 0.05, B.x1 - B.x0 - 0.1, 0.06, 0.04, 0, { grain: 'x' });
    board(ms, 'board_grey', rnd, cx, 0.24, cz, B.x1 - B.x0 - 0.12, 0.025, B.z1 - B.z0 - 0.06, 0, { grain: 'x' });
    cols.box(cx, B.y / 2, cz, (B.x1 - B.x0) / 2, B.y / 2, (B.z1 - B.z0) / 2);
    // the post vise: jaws, screw and tommy bar, the leg down to the floor
    const vx = B.x0 + 0.1, vz = B.z1 + 0.04;
    boxAt(ms, 'f_anvil', vx, B.y + 0.06, vz, 0.11, 0.05, 0.025);
    boxAt(ms, 'f_anvil', vx, B.y + 0.06, vz + 0.09, 0.11, 0.05, 0.025);
    boxAt(ms, 'f_anvil', vx, B.y - 0.1, vz + 0.04, 0.05, 0.26, 0.05);
    tube(ms, 'iron', [V(vx, B.y + 0.03, vz - 0.04), V(vx, B.y + 0.03, vz + 0.2)], 0.012, 6);
    tube(ms, 'iron', [V(vx - 0.13, B.y + 0.03, vz + 0.2), V(vx + 0.13, B.y + 0.03, vz + 0.2)], 0.007, 5);
    tube(ms, 'iron', [V(vx, B.y - 0.22, vz + 0.04), V(vx, 0.02, vz + 0.06)], 0.018, 6);
    boxAt(ms, 'iron', vx, 0.01, vz + 0.06, 0.08, 0.02, 0.08);
    // bench clutter: files, a punch, a rag, some bar stock, a box of nails
    for (let i = 0; i < 3; i++) boxAt(ms, 'iron', B.x0 + 0.35 + i * 0.05, B.y + 0.006, cz + 0.05, 0.016, 0.006, 0.26, rnd.range(-0.1, 0.1));
    for (let i = 0; i < 4; i++) boxAt(ms, 'f_anvil', B.x1 - 0.5 + i * 0.03, B.y + 0.008, cz - 0.04, 0.016, 0.016, 0.6, 0.02);
    boxAt(ms, 'canvas', B.x0 + 0.62, B.y + 0.01, cz + 0.08, 0.2, 0.015, 0.14, 0.4);
    ms.pushT(B.x1 - 0.2, B.y, cz + 0.05);
    box(ms, 'board_warm', 0.18, 0.06, 0.12, { faces: { py: null } });
    ms.pop();
    for (let i = 0; i < 12; i++) boxAt(ms, 'iron', B.x1 - 0.26 + rnd.range(0, 0.12), B.y + 0.05, cz + 0.0 + rnd.range(0, 0.08), 0.005, 0.005, 0.06, rnd.range(0, 3), {}, Math.PI / 2 * rnd.range(0, 0.3));
    // the tool wall: a rail of pegs above the bench
    const wz = -hd + 0.0;
    board(ms, 'board_dark', rnd, 1.6, 1.62, wz + 0.02, 0.9, 0.08, 0.03, 0, { grain: 'x' });
    board(ms, 'board_dark', rnd, 1.6, 1.2, wz + 0.02, 0.9, 0.06, 0.03, 0, { grain: 'x' });
    for (let i = 0; i < 4; i++) writeHorseshoe(ms, 1.24 + i * 0.075, 1.82, wz + 0.03, 0);
  }
  // hanging tongs and hammers (separate objects so the station can borrow a pair and a hammer)
  const hang = (o: THREE.Object3D, x: number, y: number, rz = 0, ry = 0) => { o.position.set(x, y, -hd + 0.05); o.rotation.set(Math.PI, ry, rz); group.add(o); return o; };
  const tongsRest = hang(buildTongs(), 1.25, 1.6 + 0.0, 0.06);
  hang(buildTongs(0.01), 1.35, 1.58, -0.04);
  hang(buildTongs(0.004), 1.44, 1.6, 0.02);
  const hammerRest = hang(buildHammer('cross'), 1.66, 1.3, 0.05, Math.PI / 2);
  hammerRest.rotation.x = 0;
  hang(buildHammer('ball'), 1.78, 1.3, -0.05, Math.PI / 2).rotation.x = 0;
  const sledge = hang(buildHammer('sledge'), 2.0, 0.65, 0, Math.PI / 2);
  sledge.rotation.set(Math.PI - 0.12, Math.PI / 2, 0);
  // the slate of jobs, nailed above the bench (its canvas is painted by the station)
  const slate = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.9 }));
  slate.position.set(0.9, 1.45, -hd + 0.05);
  group.add(slate);
  boxAt(ms, 'board_warm', 0.9, 1.45, -hd + 0.035, 0.6, 0.46, 0.02);
  anchors.slate = anchor(group, 'slate', 0.9, 1.45, -hd + 0.06);

  // ---- outside: the charcoal retort (an oil drum over a brick firebox) and a stack of splits
  const retort = new THREE.Group();
  retort.position.set(hw + 0.55, gh(hw + 0.55, 0.85), 0.85);
  const retortGlowMat = new THREE.MeshStandardMaterial({ color: 0x100804, emissive: new THREE.Color(1, 0.38, 0.08), emissiveIntensity: 0, roughness: 1 });
  {
    const rms2 = new Mesher();
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + k * 0.4;
      if (k < 2 && i === 0) continue; // the firebox mouth
      boxAt(rms2, 'f_brick', Math.cos(a) * 0.24, 0.04 + k * 0.07, Math.sin(a) * 0.24, 0.2, 0.065, 0.1, -a + Math.PI / 2);
    }
    retort.add(rms2.build({ name: 'retort_base' }));
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), retortGlowMat);
    mouth.position.set(0.24, 0.08, 0);
    mouth.rotation.y = Math.PI / 2;
    retort.add(mouth);
    loadProp('Barrel_01').then((o) => { o.position.set(0, 0.21, 0); retort.add(o); }).catch(() => {});
    const pms = new Mesher();
    pms.pushT(0.12, 1.08, 0.1);
    lathe(pms, 'iron', [[0.035, 0], [0.035, 0.45], [0.05, 0.47], [0, 0.48]], 8);
    pms.pop();
    retort.add(pms.build({ name: 'retort_pipe' }));
  }
  group.add(retort);
  const [rwx, rwz] = toW(hw + 0.55, 0.85);
  void rwx; void rwz;
  cols.box(hw + 0.55, 0.55, 0.85, 0.32, 0.55, 0.32);
  for (let i = 0; i < 10; i++) {
    const r2 = new Rand(400 + i);
    ms.pushT(hw + 0.45 + (i % 4) * 0.13, gh(hw + 0.5, 1.4) + 0.06 + Math.floor(i / 4) * 0.11, 1.45, Math.PI / 2, 0, r2.range(0, 6));
    writeSplit(ms, r2, 0.4, 0.1, r2.int(0, 9999));
    ms.pop();
  }

  // ---- lantern on the front beam
  const lantern = new THREE.PointLight(0xffb070, 0, 7, 1.6);
  lantern.position.set(0.25, F.hf - 0.42, hd - 0.12);
  group.add(lantern);
  lights.push(lantern);
  loadProp('Lantern_01').then((o) => { o.position.set(0.25, F.hf - 0.62, hd - 0.12); group.add(o); }).catch(() => {});
  tube(ms, 'f_chain', [V(0.25, F.hf - 0.06, hd - 0.1), V(0.25, F.hf - 0.32, hd - 0.12)], 0.004, 4);

  // a round for sitting and an old drum of scrap
  ms.pushT(-0.4, 0, 0.95);
  writeRound(ms, new Rand(3), 0.42, 0.2, 303, 'endgrain', 2);
  ms.pop();
  cols.box(-0.4, 0.21, 0.95, 0.2, 0.21, 0.2);

  // ---- round 5: soot, scale, scrap, sacks, the apron, the rain barrel, paper on the wall
  const dms = new Mesher();
  if (!r5off()) dressForge(ms, dms, cols, group, gh, hw, hd, ya, yb, za, zb);

  // ---- static mesh and the hit proxies the station / interactables use
  group.add(ms.build({ name: 'forge_static', noCast: ['grime', 'sp'] }));
  const clutter = dms.build({ name: 'forge_clutter', cast: false });
  group.add(clutter);
  {
    const centre = new THREE.Vector3(pl.x, floorY + 1, pl.z);
    updaters.push(() => { clutter.visible = GFX.uCamPos.value.distanceToSquared(centre) < 45 * 45; });
  }
  const hits = {
    fire: hitBox(group, P.s + 0.1, 0.25, P.s + 0.1, P.x, H.top + 0.05, P.z),
    anvil: hitBox(group, 0.72, 0.3, 0.3, A.x, A.stump + 0.2, A.z),
    grind: hitBox(group, 0.4, 0.8, 0.9, G.x, 0.5, G.z),
    slate: hitBox(group, 0.6, 0.46, 0.06, 0.9, 1.45, -hd + 0.08),
    retort: hitBox(retort, 0.65, 1.2, 0.65, 0, 0.6, 0),
    bin: hitBox(bin, 0.46, 0.4, 0.38, 0, 0.2, 0),
    tub: hitBox(group, 0.6, 0.6, 0.6, T.x, 0.3, T.z),
    lever: hitBox(group, 0.16, 0.3, 0.16, hx, L.y - 0.16, hz),
  };

  // ---- per-frame: firelight flicker, lantern
  let heat = 0.25, t = 0;
  const cull = lightCuller(new THREE.Vector3(pl.x, floorY + 1.5, pl.z), lights, 70);
  updaters.push((dt) => {
    t += dt;
    const f = flicker(t, 2.3);
    fireLight.intensity = (1.2 + heat * 7) * f;
    coalBed.uHeat.value = 0.15 + heat * 0.95;
    coalBed.glow.emissiveIntensity = (0.4 + heat * 3) * (0.9 + 0.1 * f);
    coalBed.flames.userData.tick(dt, Math.max(0, heat - 0.35) * 1.2);
    lantern.intensity = 3.2 * (0.95 + 0.05 * f);
    const k = cull();
    if (k < 1) for (const l of lights) l.intensity *= k;
  });

  const place: ForgePlace = {
    group, colliders: cols.toWorld(pl.x, floorY, pl.z, pl.rot), anchors, lights,
    update: (dt) => { for (const u of updaters) u(dt); },
    interior: [],
    floorY,
    parts: {
      bellows: bel, lever, rod, grind, anvil: { ...anv, origin: new THREE.Vector3(A.x, A.stump, A.z) },
      tub: { ...tub, origin: new THREE.Vector3(T.x, 0, T.z), water }, coal: coalBed, fireLight, slate, tongsRest, hammerRest,
      retort, retortGlow: retortGlowMat, bin,
    },
    hits,
    setHeat: (h) => { heat = Math.max(0, Math.min(1, h)); },
  };
  return place;
}

function writeStumpAt(ms: Mesher, x: number, z: number, h: number): void {
  ms.pushT(x, 0, z, 0.3);
  writeStump(ms, 0.23, h, 61);
  ms.pop();
}

void log;

/**
 * The forge's lived-in layer: soot up the back wall and on the rafters by the chimney, black ground round the
 * hearth, mill scale round the anvil, a scrap heap and a rack of bar stock, coal sacks, the leather apron on its
 * nail, horseshoes over the beam for luck, a rain barrel under the drip line, the burned FORGE board, notes and an
 * old hardware calendar by the slate, a quench bucket, hardy tools at the stump, a chain off a rafter.
 */
function dressForge(ms: Mesher, dms: Mesher, cols: Cols, group: THREE.Group, gh: (x: number, z: number) => number, hw: number, hd: number,
  ya: number, yb: number, za: number, zb: number): void {
  const F = FORGE, r = new Rand(4242);
  const sack = colorMat('sack', 0x9a8a68, 0.95);
  const rust = 'rusty_red';
  // ---- soot and grime
  for (const [x, y, w, h] of [[-0.85, 1.75, 1.3, 1.1], [-0.4, 1.5, 0.6, 0.8], [-1.5, 1.4, 0.7, 0.9]] as [number, number, number, number][]) {
    dms.pushT(x, y, -hd + 0.012); card(dms, 'g_soot', w, h, 'grime'); dms.pop();
  }
  // under the roof near the chimney (facing down)
  const roofY = (z: number) => yb + (ya - yb) * ((z - zb) / (za - zb));
  dms.pushT(-0.85, roofY(-0.6) - 0.03, -0.6, 0, Math.PI / 2 + Math.atan2(ya - yb, za - zb));
  card(dms, 'g_soot', 2.0, 1.6, 'grime');
  dms.pop();
  floorDecal(dms, 'g_soot', -0.85, 0.008, -0.2, 1.6, 1.0, 0);
  floorDecal(dms, 'g_gravel', F.anvil.x, 0.009, F.anvil.z + 0.05, 1.3, 1.0, 0.4);
  floorDecal(dms, 'g_gravel', F.anvil.x - 0.6, 0.009, F.anvil.z - 0.3, 0.8, 0.7, 1.2);
  floorDecal(dms, 'g_blob', F.tub.x, 0.01, F.tub.z, 0.9, 0.9, 0);
  floorDecal(dms, 'g_puddle', F.tub.x + 0.3, 0.011, F.tub.z + 0.35, 0.6, 0.45, 0.6, 'puddle');
  floorDecal(dms, 'g_leaves', hw - 0.2, 0.01, hd - 0.1, 0.8, 0.6, 0.3);
  floorDecal(dms, 'g_leaves', -hw + 0.3, 0.01, hd - 0.2, 0.7, 0.7, 2.1);
  // ---- the burned FORGE board on the front beam, horseshoes over it (ends up, the luck stays in)
  cardAt(ms, 'forge_board', -1.0, F.hf - 0.2, hd + 0.04, 0, 0.7, 0.18, 0.03);
  boxAt(ms, 'board_warm', -1.0, F.hf - 0.2, hd + 0.025, 0.74, 0.2, 0.025);
  for (let i = 0; i < 3; i++) writeHorseshoe(dms, 0.9 + i * 0.16, F.hf + 0.02, hd + 0.08, 0);
  // ---- paper by the slate: jobs, the hardware calendar, a feed-store card
  cardAt(dms, 'forge_note', 0.35, 1.5, -hd + 0.045, 0, 0.22, 0.12, 0.05);
  cardAt(dms, 'forge_cal', 0.36, 1.18, -hd + 0.045, 0, 0.17, 0.25, -0.03);
  cardAt(dms, 'fl_card2', 1.3, 1.02, -hd + 0.045, 0, 0.12, 0.07, 0.08);
  // ---- the apron on a nail at the front-left post, a pair of gloves stuffed in its pocket
  dms.pushT(-hw + 0.09, 1.55, hd - 0.05, Math.PI / 2 + 0.2);
  for (const s of [1, -1]) {
    dms.pushT(0, 0, s * 0.003, s > 0 ? 0 : Math.PI);
    const n = V(0, 0, 1);
    const P = [V(-0.16, -0.62, 0), V(0.16, -0.62, 0), V(0.17, -0.1, 0), V(0.1, 0.02, 0), V(0.08, 0.18, 0), V(-0.08, 0.18, 0), V(-0.1, 0.02, 0), V(-0.17, -0.1, 0)];
    for (let i = 1; i < P.length - 1; i++) dms.tri('leather', P[0], P[i], P[i + 1], n, n, n, [P[0].x, P[0].y], [P[i].x, P[i].y], [P[i + 1].x, P[i + 1].y]);
    dms.pop();
  }
  tb(dms, 'leather', [V(-0.08, 0.18, 0), V(0, 0.28, -0.01), V(0.08, 0.18, 0)], 0.008, 3);
  boxAt(dms, 'leather', 0.05, -0.3, 0.012, 0.14, 0.12, 0.012);
  dms.pop();
  boxAt(dms, 'iron', -hw + 0.09, 1.84, hd - 0.05, 0.01, 0.01, 0.05);
  // ---- bar stock across two brackets on the side wall, above the charcoal bin
  for (const z of [-0.2, 0.25]) { boxAt(ms, 'iron', -hw + 0.06, 1.3, z, 0.12, 0.02, 0.02); boxAt(ms, 'iron', -hw + 0.06, 1.62, z, 0.12, 0.02, 0.02); }
  for (let i = 0; i < 6; i++) boxAt(dms, i % 2 ? 'f_anvil' : rust, -hw + 0.04 + (i % 3) * 0.03, 1.32 + Math.floor(i / 3) * 0.32 + 0.015, 0.05, 0.016, 0.016, 1.15 + (i % 2) * 0.2, 0, {}, r.range(-0.02, 0.02));
  // ---- coal sacks slumped by the bin, one open with lumps spilling
  for (const [x, z, s, open] of [[-1.85, 1.0, 1, false], [-1.45, 1.12, 0.85, true]] as [number, number, number, boolean][]) {
    dms.pushT(x, 0, z, r.range(0, 3), 0, open ? 0.15 : 0);
    lathe(dms, sack, [[0.0001, 0], [0.2 * s, 0.01], [0.23 * s, 0.14], [0.2 * s, 0.32 * s], [open ? 0.17 * s : 0.08 * s, 0.42 * s], [open ? 0.18 * s : 0.03 * s, 0.46 * s], [0.0001, open ? 0.38 * s : 0.48 * s]], 9);
    if (open) for (let k = 0; k < 8; k++) boxAt(dms, 'f_coal', r.range(-0.08, 0.08), 0.39 * s, r.range(-0.08, 0.08), 0.04, 0.03, 0.04, r.range(0, 3));
    dms.pop();
    floorDecal(dms, 'g_blob', x, 0.01, z, 0.6 * s, 0.6 * s, 0);
  }
  floorDecal(dms, 'g_soot', -1.6, 0.012, 0.85, 0.8, 0.5, 0.4);
  for (let k = 0; k < 9; k++) boxAt(dms, 'f_coal', -1.55 + r.range(-0.3, 0.3), 0.012, 0.85 + r.range(-0.2, 0.2), 0.035, 0.022, 0.03, r.range(0, 3));
  cols.box(-1.65, 0.22, 1.06, 0.4, 0.22, 0.2);
  // ---- hardy tools and a fuller at the stump, a quench bucket, a wire brush and a rag on the bench
  for (let i = 0; i < 3; i++) boxAt(dms, 'f_anvil', F.anvil.x - 0.3 + i * 0.07, 0.04, F.anvil.z + 0.3, 0.04, 0.08, 0.04, r.range(0, 1));
  dms.pushT(F.tub.x + 0.45, 0, F.tub.z + 0.15);
  lathe(dms, 'galv', [[0.0001, 0], [0.12, 0], [0.15, 0.3], [0.145, 0.3], [0.115, 0.008], [0.0001, 0.008]], 12);
  lathe(dms, colorMat('water_d', 0x10181c, 0.05, 0.3), [[0.0001, 0.22], [0.138, 0.22], [0.0001, 0.221]], 12);
  tb(dms, 'galv', [V(-0.15, 0.29, 0), V(0, 0.42, 0), V(0.15, 0.29, 0)], 0.004, 3);
  dms.pop();
  cols.box(F.tub.x + 0.45, 0.15, F.tub.z + 0.15, 0.15, 0.15, 0.15);
  const B = F.bench;
  boxAt(dms, 'board_warm', B.x0 + 0.95, B.y + 0.02, (B.z0 + B.z1) / 2 + 0.12, 0.2, 0.03, 0.05, 0.3);
  for (let k = 0; k < 6; k++) boxAt(dms, 'iron', B.x0 + 0.88 + k * 0.025, B.y + 0.045, (B.z0 + B.z1) / 2 + 0.12, 0.004, 0.02, 0.04, 0.3);
  dms.pushT(B.x0 + 0.3, B.y, B.z1 - 0.08);
  lathe(dms, 'lab_metal', [[0.0001, 0], [0.05, 0], [0.05, 0.12], [0.0001, 0.12]], 8, { uNorm: true, vNorm: true, uv: lUV('tin') });
  for (let k = 0; k < 6; k++) boxAt(dms, 'iron', Math.cos(k) * 0.02, 0.13, Math.sin(k) * 0.02, 0.004, 0.06, 0.004, k, {}, 0.3);
  dms.pop();
  // ---- a chain off the rafter over the anvil with an S-hook and a bundle of finished hooks
  {
    const x = 0.7, z = 0.9, top = roofY(z) - 0.05;
    for (let k = 0; k < 9; k++) { dms.pushT(x, top - 0.03 - k * 0.045, z, k * 1.57); lathe(dms, 'f_chain', [[0.008, -0.022], [0.012, 0], [0.008, 0.022]], 5); dms.pop(); }
    tb(dms, 'iron', [V(x, top - 0.44, z), V(x + 0.03, top - 0.48, z), V(x, top - 0.52, z), V(x - 0.03, top - 0.56, z)], 0.006, 4, { samples: 6 });
    for (let k = 0; k < 4; k++) tb(dms, 'iron', [V(x - 0.02 + k * 0.012, top - 0.56, z), V(x - 0.03 + k * 0.02, top - 0.85, z + 0.01 * k), V(x + k * 0.02, top - 0.9, z + 0.02)], 0.005, 4, { samples: 5 });
  }
  // ---- outside: the scrap heap at the back corner, a rain barrel under the drip line, an old wheel rim
  {
    const sx = hw + 0.55, sz = -0.95, g = gh(sx, sz);
    for (let i = 0; i < 14; i++) {
      const a = r.range(0, 6.28), d = r.range(0, 0.45);
      dms.pushT(sx + Math.cos(a) * d, g + 0.03 + r.range(0, 0.1) * (1 - d), sz + Math.sin(a) * d * 0.7, r.range(0, 6), r.range(-0.3, 0.3), r.range(-0.3, 0.3));
      const k = i % 4;
      if (k === 0) boxAt(dms, rust, 0, 0, 0, r.range(0.4, 0.9), 0.02, 0.02);
      else if (k === 1) writeHorseshoe(dms, 0, 0, 0, 0);
      else if (k === 2) boxAt(dms, rust, 0, 0, 0, 0.3, 0.012, 0.06);
      else boxAt(dms, 'iron', 0, 0, 0, 0.12, 0.05, 0.08);
      dms.pop();
    }
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2; rim.push(V(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0)); }
    dms.pushT(sx + 0.3, g + 0.38, sz - 0.35, 0.4, 0, 0.12);
    tb(dms, rust, rim, 0.018, 4, { closed: true, samples: 18 });
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; tb(dms, 'board_grey', [V(0, 0, 0), V(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0)], 0.016, 4); }
    lathe(dms, 'board_grey', [[0.0001, -0.07], [0.06, -0.07], [0.06, 0.07], [0.0001, 0.07]], 8);
    dms.pop();
    groundDecal(dms, 'g_drip', sx, sz, 1.4, 1.2, 0.3, (x, z) => gh(x, z), { nx: 2, nz: 2, lift: 0.02 });
    cols.box(sx, g + 0.2, sz, 0.45, 0.2, 0.35);
    // rain barrel at the back-left corner: staves and two hoops, a dark water disc
    const bx = -hw - 0.35, bz = -hd - 0.3, bg = gh(bx, bz);
    dms.pushT(bx, bg, bz);
    lathe(dms, 'board_dark', [[0.0001, 0.02], [0.24, 0.02], [0.27, 0.35], [0.24, 0.7], [0.0001, 0.7]], 14);
    for (const y of [0.15, 0.55]) lathe(dms, 'iron', [[0.255, y - 0.02], [0.268, y - 0.02], [0.268, y + 0.02], [0.255, y + 0.02]], 14);
    lathe(dms, colorMat('water_d', 0x10181c, 0.05, 0.3), [[0.0001, 0.66], [0.235, 0.66], [0.0001, 0.661]], 14);
    dms.pop();
    floorDecal(dms, 'g_moss', bx + 0.2, bg + 0.02, bz + 0.3, 0.9, 0.7, 0.2);
    cols.box(bx, bg + 0.35, bz, 0.27, 0.35, 0.27);
    // the drip line along the front of the roof
    groundDecal(dms, 'g_mud', 0, hd + 0.55, F.W + 0.6, 0.5, 0, (x, z) => gh(x, z), { nx: 4, nz: 1, lift: 0.02 });
  }
  void prop;
}
function lUV(k: string): [number, number, number, number] { return LABELS.uv(k); }
