// The cabin's bones that got old: a dry-stacked fieldstone footing under the sill logs, the green ribbed-steel
// roof (chalky, rust-streaked, mossy along the shady eave, needles in the pans, soot round the stovepipe, a dead
// branch and an old tire up there), sagging half-round gutters with downspouts into a blue rain barrel, and the
// green screen door that follows the plank door.
// Coordinates: the cabin's local frame (see cabin.ts).
import * as THREE from 'three';
import { Mesher, Rand, Cols, V, tf, box, boxAt, board, lathe, defineMat, hasMat } from '../kit';
import { ltube as tube } from './bake';
import { CABIN, EAVE, deckY, RIDGE, ROOF_T, ZB, ZF, ySide, yEnd } from '../cabinplan';
import { cellBox, cellLathe, cellTube, bakeProp } from './bake';
import { DECAL } from './tex';

const { W, D, R, K, XE, Y0 } = CABIN;
const hyp = Math.sqrt(1 + K * K);
const LS = XE * hyp;          // slope length from the eave edge to the ridge
const TOP0 = ROOF_T + 0.012;  // tin sits on the deck boards (+ strapping)

/** a point on the roof: side s (+-1), t = distance up the slope from the eave edge, h above the deck top, at z */
export function roofP(s: number, t: number, h: number, z: number): THREE.Vector3 {
  const x = s * (XE - t / hyp);
  const yb = deckY(x) + TOP0;
  return V(x + s * (K / hyp) * h, yb + (1 / hyp) * h, z);
}

// ---------------------------------------------------------------------------------------------- stones
/** a flat-bedded fieldstone: bottom at y0, top at y1, length along local x, depth along z, yaw ry */
export function fieldstone(ms: Mesher, r: Rand, x: number, y0: number, y1: number, z: number, len: number, dep: number, ry: number, mat = 'stone', detail = 0): void {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k == null) { k = r.range(0.84, 1.1); seen.set(key, k); }
    // squash toward a slab: flat beds top and bottom
    let yy = p.getY(i) * k;
    yy = Math.sign(yy) * Math.min(Math.abs(yy), 0.62 + 0.08 * k);
    p.setXYZ(i, p.getX(i) * k, yy, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const o = r.range(0, 2);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * len * 0.5 + p.getZ(i) * dep * 0.5 + o, p.getY(i) * (y1 - y0) * 0.6 + o);
  const sy = (y1 - y0) / (2 * 0.7);
  ms.geom(mat, g, tf(x, (y0 + y1) / 2, z, ry, r.range(-0.05, 0.05), r.range(-0.05, 0.05)).multiply(new THREE.Matrix4().makeScale(len / 2, sy, dep / 2)));
  g.dispose();
}

/** the footing: two or three courses of stones under every wall up to the bottom of the logs, a dark backing */
export function footing(ms: Mesher, cols: Cols): void {
  const r = new Rand(4711);
  const sideTop = ySide(0) - R * 0.9, endTop = yEnd(0) - R * 0.9;
  const runs: { a: THREE.Vector3; b: THREE.Vector3; top: number }[] = [
    { a: V(-W / 2, 0, -D / 2 - 0.3), b: V(-W / 2, 0, D / 2 + 0.3), top: sideTop },
    { a: V(W / 2, 0, -D / 2 - 0.3), b: V(W / 2, 0, D / 2 + 0.3), top: sideTop },
    { a: V(-W / 2 + 0.2, 0, D / 2), b: V(W / 2 - 0.2, 0, D / 2), top: endTop },
    { a: V(-W / 2 + 0.2, 0, -D / 2), b: V(W / 2 - 0.2, 0, -D / 2), top: endTop },
  ];
  for (const run of runs) {
    const L = run.a.distanceTo(run.b), dir = run.b.clone().sub(run.a).normalize();
    const ry = Math.atan2(-dir.z, dir.x);
    const courses = run.top > 0.3 ? 3 : 2;
    const ch = (run.top + 0.06) / courses;
    for (let c = 0; c < courses; c++) {
      let s = c % 2 ? -0.12 : 0;
      while (s < L) {
        const len = r.range(0.22, 0.42);
        const y0 = -0.06 + c * ch + r.range(-0.012, 0.01), y1 = y0 + ch + r.range(-0.01, 0.02);
        const m = Math.max(0, Math.min(L, s + len / 2));
        const px = run.a.x + dir.x * m, pz = run.a.z + dir.z * m;
        const off = r.range(-0.03, 0.03) + (c === courses - 1 ? 0 : 0.02);
        fieldstone(ms, r, px - dir.z * off, y0, Math.min(y1, run.top), pz + dir.x * off, len * 1.08, r.range(0.3, 0.38), ry + r.range(-0.08, 0.08));
        s += len;
      }
    }
    // dark backing (no daylight through the joints)
    ms.pushT((run.a.x + run.b.x) / 2, run.top / 2 - 0.03, (run.a.z + run.b.z) / 2, ry);
    box(ms, 'soot', L, run.top + 0.06, 0.14, { faces: { py: null, ny: null } });
    ms.pop();
  }
  // corner stones: big flat ones under the crossing logs
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) fieldstone(ms, r, x, -0.06, sideTop + 0.01, z, 0.55, 0.5, r.range(0, 3));
  void cols;
}

// ---------------------------------------------------------------------------------------------- roof
/** green ribbed steel over the deck boards; returns nothing (writes `ms` for metal, `dms` for decals) */
export function tinRoof(ms: Mesher, dms: Mesher, pipe: { x: number; z: number }, hasDetail: boolean): void {
  const r = new Rand(9090);
  const pw = 0.92, step = 0.9;
  for (const s of [-1, 1]) {
    let i = 0;
    for (let zp = ZB - 0.07; zp < ZF + 0.07; zp += step, i++) {
      const w = Math.min(pw, ZF + 0.08 - zp);
      if (w < 0.1) break;
      const ov = r.range(0.04, 0.09), lift = (i % 2) * 0.004;
      const uo = r.range(0, 4), vo = r.range(0, 4);
      // profile across the sheet: flats with trapezoid ribs every 0.23 m
      const prof: [number, number][] = [[0, 0]];
      for (let zr = 0.115; zr < w - 0.03; zr += 0.23) prof.push([zr - 0.032, 0], [zr - 0.012, 0.024], [zr + 0.012, 0.024], [zr + 0.032, 0]);
      prof.push([w, 0]);
      const dz = r.range(-0.012, 0.012); // sheets not quite square
      for (const [t0, t1, under] of [[-ov, 0, true], [0, LS + 0.01, false]] as [number, number, boolean][]) {
        for (let j = 0; j < prof.length - 1; j++) {
          const [za, ha] = prof[j], [zb, hb] = prof[j + 1];
          const sk0 = dz * (t0 / LS), sk1 = dz * (t1 / LS);
          const A = roofP(s, t0, ha + lift, zp + za + sk0), B = roofP(s, t0, hb + lift, zp + zb + sk0);
          const C = roofP(s, t1, hb + lift, zp + zb + sk1), Dd = roofP(s, t1, ha + lift, zp + za + sk1);
          const ua: [number, number] = [zp + za + uo, t0 + vo], ub: [number, number] = [zp + zb + uo, t0 + vo];
          const uc: [number, number] = [zp + zb + uo, t1 + vo], ud: [number, number] = [zp + za + uo, t1 + vo];
          if (s > 0) ms.quad('cab_tin', A, Dd, C, B, ua, ud, uc, ub); else ms.quad('cab_tin', A, B, C, Dd, ua, ub, uc, ud);
          if (under) { if (s > 0) ms.quad('galv', A, B, C, Dd, ua, ub, uc, ud); else ms.quad('galv', A, Dd, C, B, ua, ud, uc, ub); }
        }
      }
    }
    // rake flashing along both gable ends, ridge cap
    for (const z of [ZB - 0.075, ZF + 0.075]) {
      const a = roofP(s, -0.06, 0.03, z), b = roofP(s, LS, 0.03, z);
      ms.pushT((a.x + b.x) / 2, (a.y + b.y) / 2, z, 0, 0, Math.atan2(b.y - a.y, b.x - a.x));
      box(ms, 'cab_tin', a.distanceTo(b), 0.07, 0.025, { uv: [r.range(0, 3), r.range(0, 3)] });
      ms.pop();
    }
    {
      const a0 = roofP(s, LS - 0.17, 0.028, ZB - 0.09), a1 = roofP(s, LS, 0.045, ZB - 0.09);
      const b0 = roofP(s, LS - 0.17, 0.028, ZF + 0.09), b1 = roofP(s, LS, 0.045, ZF + 0.09);
      if (s > 0) ms.quad('cab_tin', a0, b0, b1, a1, [0, 0], [ZF - ZB, 0], [ZF - ZB, 0.17], [0, 0.17]);
      else ms.quad('cab_tin', a0, a1, b1, b0, [0, 0], [0, 0.17], [ZF - ZB, 0.17], [ZF - ZB, 0]);
    }
  }
  // ---- decals on the roof: moss along the shady (left) eave and the back, needles in drifts, soot at the pipe
  const roofDecal = (s: number, t: number, z: number, w: number, l: number, key: string, ang = 0) => {
    const [u0, v0, u1, v1] = DECAL.uv(key);
    const c = Math.cos(ang), sn = Math.sin(ang);
    const P = (a: number, b: number) => roofP(s, t + (a * c - b * sn), 0.027, z + (a * sn + b * c));
    const A = P(-l / 2, -w / 2), B = P(-l / 2, w / 2), C = P(l / 2, w / 2), Dd = P(l / 2, -w / 2);
    if (s > 0) dms.quad('cab_decal', A, Dd, C, B, [u0, v0], [u0, v1], [u1, v1], [u1, v0]);
    else dms.quad('cab_decal', A, B, C, Dd, [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  };
  const dr = new Rand(5151);
  for (let z = ZB + 0.2; z < ZF - 0.2; z += dr.range(0.35, 0.8)) {
    if (dr.next() < 0.8) roofDecal(-1, dr.range(0.0, 0.35), z, dr.range(0.3, 0.6), dr.range(0.25, 0.5), 'moss', dr.range(-0.4, 0.4));
    if (dr.next() < 0.35) roofDecal(-1, dr.range(0.5, 1.6), z, dr.range(0.2, 0.4), dr.range(0.2, 0.4), dr.next() < 0.5 ? 'moss' : 'lichen', dr.range(-1, 1));
    if (dr.next() < 0.3) roofDecal(1, dr.range(0.0, 0.3), z, dr.range(0.2, 0.4), dr.range(0.2, 0.35), 'lichen', dr.range(-1, 1));
    if (dr.next() < 0.55) roofDecal(dr.sign(), dr.range(0.1, LS - 0.3), z, dr.range(0.3, 0.7), dr.range(0.3, 0.7), 'needles', dr.range(0, 3));
  }
  for (let k = 0; k < 6; k++) roofDecal(-1, dr.range(0, 2.5), ZB + dr.range(0, 0.9), 0.5, 0.5, 'moss', dr.range(0, 3));
  // soot and creosote around the stovepipe boot (right slope), a streak running down
  const tp = (XE - Math.abs(pipe.x)) * hyp;
  roofDecal(1, tp, pipe.z, 0.9, 0.9, 'soot');
  roofDecal(1, tp - 0.55, pipe.z + 0.05, 0.22, 0.9, 'rust_streak', Math.PI);
  roofDecal(1, tp + 0.4, pipe.z - 0.1, 0.6, 0.6, 'needles', 0.7);
  if (hasDetail) {
    // a dead spruce branch lying across the left slope
    const a = roofP(-1, 1.2, 0.05, 0.6), b = roofP(-1, 2.2, 0.05, 1.9);
    tube(ms, 'bark_dark', [a, a.clone().lerp(b, 0.5).add(V(0, 0.02, 0)), b], 0.022, 5, { rEnd: 0.008 });
    for (let k = 1; k < 5; k++) {
      const p = a.clone().lerp(b, k / 5);
      tube(ms, 'bark_dark', [p, p.clone().add(V(0.12 * (k % 2 ? 1 : -1), 0.05, 0.2 * (k % 2 ? -1 : 1)))], 0.008, 4, { rEnd: 0.003 });
    }
  }
}

// ---------------------------------------------------------------------------------------------- gutters
/** half-round galvanised gutters on both eaves (the left one sags where a hanger let go), downspouts, the barrel */
export function gutters(ms: Mesher, dms: Mesher, cols: Cols, hAt: (x: number, z: number) => number): void {
  const r = new Rand(3131);
  const gr = 0.065;
  const eY = deckY(XE) + 0.0;
  for (const s of [-1, 1]) {
    const gx = s * (XE + 0.075);
    const N = 14;
    const z0 = ZB - 0.02, z1 = ZF + 0.02;
    const yAt = (z: number) => {
      const t = (z - z0) / (z1 - z0);
      let y = eY - 0.035 * (1 - t) * (s > 0 ? 1 : 0.4); // falls toward the back downspout
      if (s < 0) y -= 0.07 * Math.exp(-Math.pow((z - 3.4) / 1.1, 2)); // the sag over the porch
      return y;
    };
    const prof: [number, number][] = [];
    for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI; prof.push([s * gr * Math.cos(a), -gr * Math.sin(a)]); }
    for (let i = 0; i < N; i++) {
      const za = z0 + (z1 - z0) * (i / N), zb = z0 + (z1 - z0) * ((i + 1) / N);
      const ya = yAt(za), yb = yAt(zb);
      for (let k = 0; k < prof.length - 1; k++) {
        const [xa, ha] = prof[k], [xb, hb] = prof[k + 1];
        const A = V(gx + xa, ya + ha, za), B = V(gx + xb, yb + hb, zb), C = V(gx + xb, ya + hb, za), Dd = V(gx + xa, yb + ha, zb);
        // outer skin (normal away from the channel) and inner skin
        const P0 = V(gx + xa, ya + ha, za), P1 = V(gx + xa, yb + ha, zb), P2 = V(gx + xb, yb + hb, zb), P3 = V(gx + xb, ya + hb, za);
        if (s > 0) { ms.quad('galv', P0, P3, P2, P1, [za, k * 0.03], [za, (k + 1) * 0.03], [zb, (k + 1) * 0.03], [zb, k * 0.03]); ms.quad('galv', P0, P1, P2, P3, [za, k * 0.03], [zb, k * 0.03], [zb, (k + 1) * 0.03], [za, (k + 1) * 0.03]); }
        else { ms.quad('galv', P0, P1, P2, P3, [za, k * 0.03], [zb, k * 0.03], [zb, (k + 1) * 0.03], [za, (k + 1) * 0.03]); ms.quad('galv', P0, P3, P2, P1, [za, k * 0.03], [za, (k + 1) * 0.03], [zb, (k + 1) * 0.03], [zb, k * 0.03]); }
        void A; void B; void C; void Dd;
      }
      // needles and muck in the channel
      if (r.next() < 0.7) {
        const [u0, v0, u1, v1] = DECAL.uv(r.next() < 0.7 ? 'needles' : 'leaves');
        const y = (ya + yb) / 2 - gr * 0.75;
        dms.quad('cab_decal', V(gx - gr * 0.7, y, za), V(gx + gr * 0.7, y, za), V(gx + gr * 0.7, y, zb), V(gx - gr * 0.7, y, zb), [u0, v0], [u1, v0], [u1, v1], [u0, v1], V(0, 1, 0));
      }
    }
    // rolled bead on the outer lip
    tube(ms, 'galv', [V(gx + s * gr, yAt(z0), z0), V(gx + s * gr, yAt((z0 + z1) / 2), (z0 + z1) / 2), V(gx + s * gr, yAt(z1), z1)], 0.008, 4, { samples: 20 });
    // end caps
    for (const z of [z0, z1]) {
      ms.pushT(gx, yAt(z), z, s > 0 ? 0 : Math.PI);
      const shape = new THREE.Shape();
      shape.moveTo(gr, 0);
      for (let k = 1; k <= 8; k++) { const a = (k / 8) * Math.PI; shape.lineTo(gr * Math.cos(a), -gr * Math.sin(a)); }
      const g = new THREE.ShapeGeometry(shape);
      ms.geom('galv', g, new THREE.Matrix4().makeRotationY(z === z0 ? Math.PI : 0));
      g.dispose();
      ms.pop();
    }
    // hangers (strap over the gutter to the fascia); one missing at the sag
    for (let z = z0 + 0.3; z < z1; z += 0.85) {
      if (s < 0 && Math.abs(z - 3.4) < 0.5) continue;
      const y = yAt(z);
      tube(ms, 'galv', [V(s * XE, y + 0.015, z), V(gx, y + 0.02, z), V(gx + s * gr, y, z)], 0.006, 3, { smooth: false });
    }
    // downspout at the back: offset in to the wall, strapped down the logs
    const dz = s < 0 ? -2.5 : -2.62;
    const wx = s * (W / 2 + R + 0.06);
    const yTop = yAt(dz) - gr;
    const pts = [V(gx, yTop, dz), V(gx, yTop - 0.18, dz), V(wx, yTop - 0.45, dz)];
    const bottom = s < 0 ? 1.18 : 0.32;
    pts.push(V(wx, bottom, dz));
    if (s < 0) pts.push(V(wx - 0.22, bottom - 0.12, dz));
    else pts.push(V(wx + s * 0.38, 0.12, dz));
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], len = a.distanceTo(b);
      const m = new THREE.Matrix4().lookAt(a, b, V(0, 0, 1));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      const c = a.clone().add(b).multiplyScalar(0.5);
      ms.push(new THREE.Matrix4().compose(c, q, V(1, 1, 1)));
      box(ms, 'galv', 0.075, 0.055, len + 0.03, { grain: 'z', uv: [r.range(0, 2), 0] });
      ms.pop();
    }
    for (const y of [bottom + 0.4, (bottom + yTop) / 2 + 0.2]) boxAt(ms, 'galv', wx - s * 0.03, y, dz, 0.09, 0.025, 0.09);
    if (s > 0) {
      // the spout dumps on the ground: a muddy wash-out
      const gx2 = wx + 0.5;
      const [u0, v0, u1, v1] = DECAL.uv('mud');
      const y = hAt(gx2, dz) + 0.02;
      dms.quad('cab_decal', V(gx2 - 0.4, y, dz + 0.4), V(gx2 + 0.4, y, dz + 0.4), V(gx2 + 0.4, y, dz - 0.4), V(gx2 - 0.4, y, dz - 0.4), [u0, v0], [u1, v0], [u1, v1], [u0, v1], V(0, 1, 0));
    }
  }
  // ---- rain barrel under the left downspout: a faded blue drum on two cinder blocks, black water, a dipper
  {
    const bx = -W / 2 - R - 0.42, bz = -2.5, g = hAt(bx, bz);
    for (const dz of [-0.14, 0.14]) cellBox(ms, 'cab_paint', 'paint', 'cinder', bx, g + 0.1, bz + dz, 0.4, 0.2, 0.19, 0.05 * dz);
    ms.pushT(bx, g + 0.2, bz, 0.4);
    const prof: [number, number][] = [[0, 0], [0.27, 0], [0.285, 0.02], [0.285, 0.2], [0.295, 0.22], [0.285, 0.24], [0.285, 0.62], [0.295, 0.64], [0.285, 0.66], [0.285, 0.84], [0.27, 0.87], [0.26, 0.87], [0.26, 0.82]];
    cellLathe(ms, 'cab_paint', 'paint', 'drum_blue', prof, 9);
    ms.pop();
    ms.pushT(bx, g + 0.2 + 0.78, bz);
    lathe(ms, 'soot', [[0, 0], [0.262, 0]].reverse() as [number, number][], 16);
    ms.pop();
    // tin dipper hanging on the rim
    cellTube(ms, 'cab_paint', 'paint', 'silver', [V(bx + 0.2, g + 1.08, bz - 0.17), V(bx + 0.28, g + 1.12, bz - 0.2), V(bx + 0.34, g + 1.0, bz - 0.22)], 0.008, 4);
    ms.pushT(bx + 0.34, g + 0.9, bz - 0.22);
    lathe(ms, 'galv', [[0, 0], [0.05, 0], [0.06, 0.08], [0.058, 0.08], [0.048, 0.006], [0, 0.006]], 10);
    ms.pop();
    cols.box(bx, g + 0.55, bz, 0.3, 0.55, 0.3);
    // green garden hose snaking off the overflow
    const hp: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const a = k * 0.9;
      const x = bx - 0.5 - Math.cos(a) * (0.25 + k * 0.03), z = bz + 0.3 + Math.sin(a) * (0.25 + k * 0.03) + k * 0.04;
      hp.push(V(x, hAt(x, z) + 0.015, z));
    }
    hp.unshift(V(bx - 0.27, g + 0.95, bz + 0.05), V(bx - 0.36, g + 0.4, bz + 0.12));
    cellTube(ms, 'cab_paint', 'paint', 'hose', hp, 0.011, 5, 60);
  }
}

// ---------------------------------------------------------------------------------------------- screen door
let screenDone = false;
function screenMat(): void {
  if (screenDone || hasMat('cab_screen')) return;
  screenDone = true;
  defineMat('cab_screen', new THREE.MeshStandardMaterial({ name: 'cab_screen', color: 0x16181a, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
}

/** a green wooden screen door leaf; pivot on the hinge line (leaf extends +x), face toward +z */
export function screenDoor(w: number, h: number): THREE.Group {
  screenMat();
  const ms = new Mesher();
  const r = new Rand(616);
  const st = 0.075, t = 0.032;
  // stiles and rails (painted green, worn)
  board(ms, 'boards_green', r, st / 2, h / 2, 0, st, h, t, 0, { grain: 'y' });
  board(ms, 'boards_green', r, w - st / 2, h / 2, 0, st, h, t, 0, { grain: 'y' });
  board(ms, 'boards_green', r, w / 2, h - 0.04, 0, w - 2 * st, 0.08, t, 0, { grain: 'x' });
  board(ms, 'boards_green', r, w / 2, h * 0.44, 0, w - 2 * st, 0.11, t, 0, { grain: 'x' });
  board(ms, 'boards_green', r, w / 2, 0.1, 0, w - 2 * st, 0.2, t, 0, { grain: 'x' });
  // fancy corner brackets
  for (const [x, sx] of [[st, 1], [w - st, -1]] as [number, number][]) {
    ms.pushT(x, h - 0.08, 0.002);
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(sx * 0.14, 0), new THREE.Vector2(0, -0.14)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t * 0.6, bevelEnabled: false });
    g.translate(0, 0, -t * 0.3);
    ms.geom('boards_green', g);
    g.dispose();
    ms.pop();
  }
  // screen: upper panel whole, lower panel with a torn corner flapping out (the dog)
  const yU0 = h * 0.44 + 0.055, yU1 = h - 0.08, yL0 = 0.2, yL1 = h * 0.44 - 0.055;
  const x0 = st, x1 = w - st;
  ms.quad('cab_screen', V(x0, yU0, 0), V(x1, yU0, 0), V(x1, yU1, 0), V(x0, yU1, 0), [0, 0], [1, 0], [1, 1], [0, 1]);
  const tx = x1 - 0.2, ty = yL0 + 0.18;
  ms.quad('cab_screen', V(x0, yL0, 0), V(tx, yL0, 0), V(tx, yL1, 0), V(x0, yL1, 0), [0, 0], [1, 0], [1, 1], [0, 1]);
  ms.quad('cab_screen', V(tx, ty, 0), V(x1, ty, 0), V(x1, yL1, 0), V(tx, yL1, 0), [0, 0], [1, 0], [1, 1], [0, 1]);
  ms.tri('cab_screen', V(tx, yL0, 0), V(x1, yL0, 0), V(x1, ty, 0), V(0, 0, 1), V(0, 0, 1), V(0, 0, 1), [0, 0], [1, 0], [1, 1]);
  ms.tri('cab_screen', V(tx, yL0, 0), V(x1, ty, 0), V(tx + 0.02, ty + 0.03, 0.09), V(0, 0, 1), V(0, 0, 1), V(0, 0, 1), [0, 0], [1, 0], [1, 1]);
  // a patch sewn over an older tear, the pull handle, the kick plate, the closer spring
  ms.quad('cab_screen', V(x0 + 0.08, yU0 + 0.2, 0.004), V(x0 + 0.24, yU0 + 0.2, 0.004), V(x0 + 0.24, yU0 + 0.34, 0.004), V(x0 + 0.08, yU0 + 0.34, 0.004), [0, 0], [1, 0], [1, 1], [0, 1]);
  ms.pushT(w - 0.04, h * 0.47, t / 2 + 0.02);
  tube(ms, 'iron', [V(0, -0.07, -0.02), V(0, -0.06, 0), V(0, 0.06, 0), V(0, 0.07, -0.02)], 0.007, 5, { smooth: false });
  ms.pop();
  boxAt(ms, 'galv', w / 2, 0.08, t / 2 + 0.002, w - 0.04, 0.14, 0.004);
  const coil: THREE.Vector3[] = [];
  for (let k = 0; k <= 60; k++) { const a = k * 0.9, y = h * 0.62 + k * 0.004; coil.push(V(0.11 + Math.cos(a) * 0.009, y, -t / 2 - 0.012 + Math.sin(a) * 0.009)); }
  tube(ms, 'iron', coil, 0.0025, 3, { smooth: false });
  // hinges
  for (const y of [0.25, h - 0.3]) boxAt(ms, 'iron', 0.03, y, t / 2 + 0.003, 0.09, 0.05, 0.004);
  const g = ms.build({ name: 'screen_door' });
  const pivot = new THREE.Group();
  pivot.name = 'screen_door';
  pivot.add(g);
  void Y0; void EAVE; void RIDGE; void bakeProp;
  return pivot;
}
