// Camp Kettle's seventy-five years of neglect, layered over the ruins world.ts builds (and never touching the
// story's anchors: the table, Ray's bench seat, the stove, the bedroll, the notice, the post, the tin): moss and
// leaf litter banked against the walls, roof boards fallen in, the cook's shelf of rusted tins and bottles, a
// crosscut saw on the wall, the 1951 company calendar and a torn safety poster, stencilled crates, a tipped
// wheelbarrow, a sawbuck with a rotten log, charred ends in the fire pit, a sunken plank walk, and the outhouse,
// leaning, door hanging by one hinge. One mesh per material for all of it, no shadows from the small stuff.
import * as THREE from 'three';
import { Mesher, Rand, V, boxAt, board, logAB, lathe } from '../../places/kit';
import { ensurePrintMats } from '../../places/signs';
import { ensureStoreMats, card, cardAt, floorDecal } from '../../places/store/print';
import { colorMat, propInstances, tb, type Xf } from '../../places/store/inst';
import { PSUB } from '../../places/store/print';

export interface KettleFrame {
  /** world ground height at camp-local x, z */
  hAt: (x: number, z: number) => number;
  ck: { x: number; z: number; w: number; d: number }; ckBase: number;
  bk: { x: number; z: number; w: number; d: number };
  /** register a static collider (camp-local centre, half extents, local yaw) */
  solid: (x: number, y: number, z: number, half: [number, number, number], ry?: number) => void;
}

export function dressKettle(grp: THREE.Group, f: KettleFrame): Promise<unknown> {
  ensurePrintMats();
  ensureStoreMats();
  const ms = new Mesher(), dms = new Mesher(), r = new Rand(1951);
  const { hAt, ck, ckBase, bk } = f;
  const rust = 'rusty_red';
  const pending: Promise<unknown>[] = [];
  const gd = (key: string, x: number, z: number, w: number, d: number, ry = 0, mat = 'grime') => floorDecal(dms, key, x, hAt(x, z) + 0.03, z, w, d, ry, mat);

  // ---- moss and litter banked against every wall, leaves blown into the corners, the trodden way in
  const walls: [number, number, number, number][] = [
    [ck.x, ck.z - ck.d / 2, ck.w, 0], [ck.x, ck.z + ck.d / 2, ck.w, 0], [ck.x - ck.w / 2, ck.z, ck.d, 1], [ck.x + ck.w / 2, ck.z, ck.d, 1],
    [bk.x, bk.z - bk.d / 2, bk.w, 0], [bk.x, bk.z + bk.d / 2, bk.w, 0], [bk.x - bk.w / 2, bk.z, bk.d, 1], [bk.x + bk.w / 2, bk.z, bk.d, 1],
  ];
  for (const [cx, cz, len, alongZ] of walls) {
    for (let t = -len / 2 + 0.6; t < len / 2; t += r.range(0.9, 1.6)) {
      for (const side of [-0.32, 0.32]) {
        const x = alongZ ? cx + side : cx + t, z = alongZ ? cz + t : cz + side;
        gd(r.next() < 0.55 ? 'g_moss' : 'g_leaves', x, z, r.range(0.6, 1.1), r.range(0.4, 0.7), alongZ ? Math.PI / 2 : 0);
      }
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = r.range(-12, 12), z = r.range(-9, 7);
    gd(i % 3 ? 'g_leaves' : 'g_moss', x, z, r.range(1, 2.2), r.range(1, 2.2), r.range(0, 3));
  }
  // moss on the top course of the cookhouse's crumbled east wall
  for (let k = 0; k < 4; k++) {
    const z = ck.z - ck.d / 2 + 0.6 + k * 1.2;
    floorDecal(dms, 'g_moss', ck.x + ck.w / 2, ckBase + 0.15 + 3 * 0.27 + 0.02, z, 0.3, 0.9, 0);
  }

  // ---- roof boards fallen in: inside the cookhouse's open half and outside its east wall
  for (let i = 0; i < 12; i++) {
    const inside = i < 6;
    const x = inside ? ck.x + r.range(0.5, 3.2) : ck.x + ck.w / 2 + r.range(0.4, 2.2), z = inside ? ck.z + r.range(-1.9, -0.2) : ck.z + r.range(-2.2, 1.6);
    const prop = i % 4 === 0;
    ms.pushT(x, hAt(x, z) + (prop ? 0.35 : 0.03), z, r.range(0, 3.1), prop ? r.range(0.4, 0.7) : r.range(-0.05, 0.05), r.range(-0.08, 0.08));
    boxAt(ms, 'planks_old', 0, 0, 0, 0.26, 0.025, r.range(1.2, 2.2), 0, { grain: 'z', uv: [r.range(0, 3), r.range(0, 3)] });
    ms.pop();
  }

  // ---- the cook's shelf on the west wall: two planks on iron brackets, rusted tins, bottles, a cast pot
  {
    const x = ck.x - ck.w / 2 + 0.2, z0 = ck.z - 0.3, y0 = ckBase + 1.25;
    for (const y of [y0, y0 + 0.42]) {
      board(ms, 'planks_old', r, x + 0.1, y, z0, 0.26, 0.03, 1.5, 0, { grain: 'z' });
      for (const dz of [-0.6, 0.6]) boxAt(ms, rust, x, y - 0.08, z0 + dz, 0.03, 0.16, 0.025, 0, {}, 0, 0.6);
    }
    for (let i = 0; i < 9; i++) {
      const top = i > 4, zz = z0 - 0.62 + (i % 5) * 0.28 + r.range(-0.05, 0.05), y = (top ? y0 + 0.42 : y0) + 0.015;
      dms.pushT(x + 0.1 + r.range(-0.05, 0.05), y, zz, r.range(0, 6), i === 3 ? Math.PI / 2 : 0, 0);
      if (i % 3 === 2) lathe(dms, colorMat(i % 2 ? 'bottle_g' : 'bottle_b', i % 2 ? 0x2a4a2a : 0x4a2a14, 0.15, 0.1), [[0.0001, 0], [0.035, 0], [0.036, 0.16], [0.014, 0.22], [0.012, 0.26], [0.0001, 0.26]], 7);
      else lathe(dms, 'sp_tin', [[0.0001, 0], [0.045, 0], [0.046, 0.11], [0.0001, 0.11]], 8, { uNorm: true, vNorm: true, uv: PSUB('can_label', 0, 1) });
      dms.pop();
    }
    dms.pushT(x + 0.3, ckBase + 0.02, z0 + 1.1);
    lathe(dms, 'soot', [[0.0001, 0], [0.13, 0.01], [0.17, 0.08], [0.16, 0.22], [0.15, 0.23], [0.0001, 0.2]], 12);
    boxAt(dms, 'soot', 0.19, 0.2, 0, 0.06, 0.02, 0.02);
    dms.pop();
    f.solid(x + 0.3, ckBase + 0.12, z0 + 1.1, [0.17, 0.12, 0.17]);
  }
  // ---- the crosscut saw on its nails, the poster and the calendar on the north wall inside
  {
    const zW = ck.z - ck.d / 2 + 0.17, y = ckBase + 1.55, x = ck.x + 1.2;
    dms.pushT(x, y, zW + 0.02);
    const blade: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; blade.push(V(-0.8 + 1.6 * t, -0.07 - Math.sin(Math.PI * t) * 0.07, 0)); }
    for (let i = 0; i < 10; i++) {
      const a = blade[i], b = blade[i + 1], n = V(0, 0, 1);
      dms.quad(rust, V(a.x, 0.02, 0), V(a.x, a.y, 0), V(b.x, b.y, 0), V(b.x, 0.02, 0), [0, 0], [0, 0.1], [0.16, 0.1], [0.16, 0], n);
      dms.quad(rust, V(b.x, 0.02, -0.002), V(b.x, b.y, -0.002), V(a.x, a.y, -0.002), V(a.x, 0.02, -0.002), [0, 0], [0, 0.1], [0.16, 0.1], [0.16, 0], V(0, 0, -1));
    }
    for (const s of [-1, 1]) { tb(dms, 'planks_old', [V(s * 0.8, 0.0, 0.01), V(s * 0.86, 0.22, 0.01)], 0.018, 5); }
    dms.pop();
    for (const dx of [-0.5, 0.5]) boxAt(ms, 'iron', x + dx, y + 0.04, zW + 0.03, 0.008, 0.008, 0.06);
    cardAt(dms, 'kettle_poster', ck.x - 1.4, ckBase + 1.35, zW + 0.02, 0, 0.3, 0.41, 0.06);
    cardAt(dms, 'kettle_cal', ck.x - 2.4, ckBase + 1.45, zW + 0.02, 0, 0.26, 0.37, -0.04);
    cardAt(dms, 'kettle_stencil', ck.x + 0.2, ckBase + 0.95, zW + 0.02, 0, 0.9, 0.22, 0.01);
  }

  // ---- a stencilled crate and a broken chair in the bunkhouse, bottles and cans in the leaves
  {
    const x = bk.x + 2.6, z = bk.z + 2.0, g = hAt(x, z);
    ms.pushT(x, g, z, 0.5);
    boxAt(ms, 'planks_old', 0, 0.24, 0, 0.8, 0.48, 0.5);
    boxAt(ms, 'planks_old', 0.05, 0.49, -0.04, 0.84, 0.03, 0.54, 0.08, {}, 0.04);
    dms.pushT(x, g, z, 0.5);
    dms.pushT(0, 0.26, 0.252); card(dms, 'kettle_stencil', 0.7, 0.18); dms.pop();
    dms.pop();
    ms.pop();
    f.solid(x, g + 0.25, z, [0.42, 0.25, 0.27], 0.5);
    // the chair: a seat, three legs and a back slat lying apart
    const cx = bk.x - 1.2, cz = bk.z + 0.4, cg = hAt(cx, cz);
    ms.pushT(cx, cg, cz, 1.1, 0, 0.35);
    boxAt(ms, 'planks_old', 0, 0.2, 0, 0.4, 0.03, 0.4);
    for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17]] as [number, number][]) boxAt(ms, 'planks_old', lx, 0.1, lz, 0.035, 0.2, 0.035);
    ms.pop();
    boxAt(ms, 'planks_old', cx + 0.6, cg + 0.02, cz + 0.3, 0.5, 0.03, 0.07, 0.4);
    const cans: Xf[] = [];
    for (let i = 0; i < 8; i++) {
      const px = r.range(-10, 11), pz = r.range(-7, 5);
      cans.push({ x: px, y: hAt(px, pz) + 0.01, z: pz, ry: r.range(0, 6), rx: i % 2 ? Math.PI / 2 : 0 });
    }
    pending.push(propInstances(grp, 'can_rusted', cans, { cast: false }));
    for (let i = 0; i < 6; i++) {
      const px = r.range(-9, 10), pz = r.range(-6, 5);
      dms.pushT(px, hAt(px, pz) + 0.035, pz, r.range(0, 6), Math.PI / 2, 0);
      lathe(dms, colorMat(i % 2 ? 'bottle_g' : 'bottle_b', i % 2 ? 0x2a4a2a : 0x4a2a14, 0.15, 0.1), [[0.0001, 0], [0.033, 0], [0.034, 0.15], [0.013, 0.2], [0.011, 0.24], [0.0001, 0.24]], 6);
      dms.pop();
    }
  }

  // ---- a tipped wheelbarrow, a sawbuck with a rotten log, charred ends in the fire pit, the sunken plank walk
  {
    const x = ck.x - 1.6, z = ck.z + ck.d / 2 + 2.2, g = hAt(x, z);
    ms.pushT(x, g + 0.32, z, 2.2, 0, 1.25);
    boxAt(ms, rust, 0, 0, 0, 0.6, 0.03, 0.8);
    for (const s of [-1, 1]) { boxAt(ms, rust, s * 0.3, 0.12, 0, 0.03, 0.24, 0.8, 0, {}, 0, s * 0.25); boxAt(ms, rust, 0, 0.12, s * 0.4, 0.6, 0.24, 0.03, 0, {}, s * 0.25); }
    for (const s of [-1, 1]) logAB(ms, V(s * 0.22, -0.05, -0.2), V(s * 0.28, -0.1, -1.05), 0.022, { seed: 60 + s, seg: 5, capA: 1, capB: 1, matFor: () => 'log_old' });
    ms.pushT(0, -0.12, 0.55, 0, 0, Math.PI / 2);
    lathe(ms, 'iron', [[0.0001, -0.03], [0.17, -0.03], [0.18, 0], [0.17, 0.03], [0.0001, 0.03]], 12);
    ms.pop();
    ms.pop();
    f.solid(x, g + 0.3, z, [0.45, 0.3, 0.6], 2.2);
    // sawbuck: two X frames and a rail, a mossy log across
    const sx = bk.x - 3.5, sz = bk.z + bk.d / 2 + 2.0, sg = hAt(sx, sz);
    for (const dz of [-0.5, 0.5]) {
      logAB(ms, V(sx - 0.35, sg - 0.05, sz + dz), V(sx + 0.3, sg + 0.85, sz + dz), 0.045, { seed: 70 + dz * 10, seg: 6, capA: 1, capB: 2, matFor: () => 'log_old' });
      logAB(ms, V(sx + 0.35, sg - 0.05, sz + dz), V(sx - 0.3, sg + 0.85, sz + dz), 0.045, { seed: 72 + dz * 10, seg: 6, capA: 1, capB: 2, matFor: () => 'log_old' });
    }
    logAB(ms, V(sx, sg + 0.25, sz - 0.6), V(sx, sg + 0.25, sz + 0.6), 0.035, { seed: 74, seg: 5, matFor: () => 'log_old' });
    logAB(ms, V(sx + 0.05, sg + 0.68, sz - 1.1), V(sx - 0.02, sg + 0.66, sz + 1.2), 0.16, { seed: 75, seg: 9, capA: 3, capB: 2, matFor: (_x, n) => (n.y > 0.5 ? 'stone_moss' : 'log_old') });
    floorDecal(dms, 'g_moss', sx, sg + 0.83, sz, 0.3, 1.6, 0);
    f.solid(sx, sg + 0.45, sz, [0.4, 0.45, 0.7]);
    // charred ends and a can in the old fire pit
    const fx = 0.5, fz = 3.6, fg = hAt(fx, fz);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + 0.3;
      logAB(ms, V(fx + Math.cos(a) * 0.1, fg + 0.06, fz + Math.sin(a) * 0.1), V(fx + Math.cos(a) * 0.45, fg + 0.1, fz + Math.sin(a) * 0.45), 0.045, { seed: 80 + k, seg: 6, capA: 3, capB: 1, matFor: (xm) => (xm < 0.2 ? 'soot' : 'log_old') });
    }
    gd('g_soot', fx, fz, 1.4, 1.4, 0.5);
    // plank walk from the cookhouse door toward the pit, sunk and half missing
    const dx0 = ck.x + 1.45, dz0 = ck.z + ck.d / 2 + 0.5;
    for (let k = 0; k < 9; k++) {
      if (k % 3 === 1 && r.next() < 0.7) continue;
      const t = k / 8, x = dx0 + (fx - 1.0 - dx0) * t, z = dz0 + (fz - 0.8 - dz0) * t;
      ms.pushT(x, hAt(x, z) + 0.005, z, Math.atan2(fx - 1.0 - dx0, fz - 0.8 - dz0) + Math.PI / 2 + r.range(-0.1, 0.1), r.range(-0.04, 0.04), r.range(-0.05, 0.05));
      boxAt(ms, 'planks_old', 0, 0, 0, 0.75, 0.03, 0.22, 0, { grain: 'x', uv: [r.range(0, 3), r.range(0, 3)] });
      ms.pop();
    }
  }

  // ---- the outhouse behind the cookhouse, leaning, its door hanging off one hinge
  {
    const x = ck.x - ck.w / 2 - 2.6, z = ck.z - ck.d / 2 - 2.2, g = hAt(x, z), w = 1.1, d = 1.1, h = 2.1;
    ms.pushT(x, g - 0.05, z, 0.35, 0.08, -0.06);
    for (let i = 0; i < 5; i++) {
      board(ms, 'planks_old', r, -w / 2 + 0.11 + i * 0.22, h / 2, -d / 2, 0.21, h, 0.025, 0, { grain: 'y' });
      board(ms, 'planks_old', r, -w / 2, h / 2 - (i === 4 ? 0.3 : 0), -d / 2 + 0.11 + i * 0.22, 0.025, h - (i === 4 ? 0.6 : 0), 0.21, 0, { grain: 'y' });
      board(ms, 'planks_old', r, w / 2, h / 2, -d / 2 + 0.11 + i * 0.22, 0.025, h, 0.21, 0, { grain: 'y' });
    }
    for (const sx of [-1, 1]) board(ms, 'planks_old', r, sx * (w / 2 - 0.1), h / 2, d / 2, 0.2, h, 0.025, 0, { grain: 'y' });
    ms.pushT(0, h + 0.08, 0.05, 0, 0.2);
    boxAt(ms, 'planks_old', 0, 0, 0, w + 0.25, 0.03, d + 0.35, 0, { grain: 'z' });
    ms.pop();
    // the door: hanging from its top hinge, swung out and down at a corner; a crescent moon in it
    ms.pushT(-w / 2 + 0.2, h - 0.1, d / 2 + 0.02, -0.9, 0, 0.25);
    boxAt(ms, 'planks_old', 0.35, -0.9, 0, 0.7, 1.8, 0.025);
    ms.pop();
    boxAt(ms, colorMat('black', 0x1c1c1e, 0.5), -w / 2 + 0.22, h - 0.4, d / 2 + 0.05, 0.03, 0.03, 0.02);
    // the seat box inside
    boxAt(ms, 'planks_old', 0, 0.22, -d / 2 + 0.25, w - 0.05, 0.44, 0.45);
    ms.pop();
    f.solid(x, g + h / 2, z, [w / 2 + 0.05, h / 2, d / 2 + 0.05], 0.35);
    gd('g_moss', x + 0.3, z + 0.7, 1.4, 1.0, 0.3);
  }

  grp.add(ms.build({ name: 'kettle_dressing', noCast: ['grime', 'sp'] }));
  grp.add(dms.build({ name: 'kettle_clutter', cast: false }));
  return Promise.all(pending);
}
