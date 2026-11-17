// Products generated in code: every ITEMS entry whose model is 'gen:<id>' (plus a few decor pieces used to dress
// the cabin and the store). Real dimensions in metres, origin at the bottom centre, front facing +Z. Labels and
// small surfaces come from the labels atlas (tools/make_print.py: invented bilingual brands, 512 px/m); wood,
// bark, iron, wool and canvas use the places textures.
//
//   buildProduct('beer')       // or the item id: buildProduct('fish') -> the lake trout
//   productSize('coffee')      // [w, h, d] metres
import * as THREE from 'three';
import { ITEMS } from '../game/items';
import { Mesher, Rand, V, tf, box, boxAt, lathe, tube, log, hasMat } from './kit';
import { LABELS, ensurePrintMats } from './signs';

type Rect = [number, number, number, number];
const L = (k: string): Rect => LABELS.uv(k);
/** a sub-rectangle of an atlas rect (fractions) */
const sub = (r: Rect, a: number, b: number, c: number, d: number): Rect => [r[0] + (r[2] - r[0]) * a, r[1] + (r[3] - r[1]) * b, r[0] + (r[2] - r[0]) * c, r[1] + (r[3] - r[1]) * d];

/** lathe whose u (around) and v (along) span an atlas rect; the rect's horizontal centre faces +Z */
function latheR(ms: Mesher, mat: string, profile: [number, number][], seg: number, r: Rect): void {
  lathe(ms, mat, profile, seg, { uNorm: true, vNorm: true, uv: r, phase: -Math.PI });
}

type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
/** box with each face mapped to a whole atlas rect */
function boxR(ms: Mesher, mat: string, w: number, h: number, d: number, faces: Partial<Record<Face, Rect>>, def: Rect): void {
  const x = w / 2, y = h / 2, z = d / 2;
  const q = (f: Face, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, dd: THREE.Vector3) => {
    const r = faces[f] ?? def;
    ms.quad(mat, a, b, c, dd, [r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]);
  };
  q('pz', V(-x, -y, z), V(x, -y, z), V(x, y, z), V(-x, y, z));
  q('nz', V(x, -y, -z), V(-x, -y, -z), V(-x, y, -z), V(x, y, -z));
  q('px', V(x, -y, z), V(x, -y, -z), V(x, y, -z), V(x, y, z));
  q('nx', V(-x, -y, -z), V(-x, -y, z), V(-x, y, z), V(-x, y, -z));
  q('py', V(-x, y, z), V(x, y, z), V(x, y, -z), V(-x, y, -z));
  q('ny', V(-x, -y, -z), V(x, -y, -z), V(x, -y, z), V(-x, -y, z));
}

/** soft pillowed box (pouches, packs) with planar front/back UVs into rects and a swatch on the rest */
function pouch(ms: Mesher, mat: string, w: number, h: number, d: number, puff: number, front: Rect, back: Rect, side: Rect, o: { seg?: number; pinchTop?: number } = {}): void {
  const s = o.seg ?? 4;
  const g = new THREE.BoxGeometry(w, h, d, s * 2, s * 3, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i) / (w / 2), py = p.getY(i) / (h / 2), pz = p.getZ(i) / (d / 2);
    const fx = 1 - px * px, fy = 1 - py * py;
    let z = p.getZ(i) + Math.sign(pz) * puff * fx * fy;
    const pin = o.pinchTop ? Math.max(0, (py - (1 - o.pinchTop)) / o.pinchTop) : 0;
    z *= 1 - 0.9 * pin;
    const xx = p.getX(i) * (1 - 0.05 * Math.abs(pz) * (1 - fy));
    p.setXYZ(i, xx, p.getY(i), z);
    const nz = nrm.getZ(i);
    let r: Rect = side;
    if (nz > 0.5) r = front; else if (nz < -0.5) r = back;
    const u = nz < -0.5 ? 1 - (px * 0.5 + 0.5) : px * 0.5 + 0.5;
    const v = py * 0.5 + 0.5;
    if (Math.abs(nz) > 0.5) uv.setXY(i, r[0] + (r[2] - r[0]) * u, r[1] + (r[3] - r[1]) * v);
    else uv.setXY(i, r[0] + (r[2] - r[0]) * (uv.getX(i)), r[1] + (r[3] - r[1]) * uv.getY(i));
  }
  g.computeVertexNormals();
  ms.geom(mat, g);
  g.dispose();
}

// ---------------------------------------------------------------------------------------------- wood
/**
 * A quartered firewood split along X centred at the origin: bark on the outer arc, fresh split faces, end grain
 * at both ends. r = radius of the round it was split from.
 */
export function writeSplit(ms: Mesher, rnd: Rand, len: number, r: number, seed: number): void {
  const R = new Rand(seed);
  const span = R.range(0.95, 1.55);
  const c = r * 0.55; // pith below the origin
  const ri = R.next() < 0.4 ? r * R.range(0.15, 0.35) : 0;
  const n = 6;
  const a0 = Math.PI / 2 - span / 2, a1 = Math.PI / 2 + span / 2;
  const outer: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * (k / n);
    const rr = r * (1 + 0.04 * Math.sin(k * 2.3 + seed));
    outer.push([Math.cos(a) * rr, Math.sin(a) * rr - c]);
  }
  const inner: [number, number][] = ri > 0 ? [[Math.cos(a1) * ri, Math.sin(a1) * ri - c], [Math.cos(a0) * ri, Math.sin(a0) * ri - c]] : [[0, -c]];
  // split faces bulge a little (mid points)
  const mid = (p: [number, number], q: [number, number], k: number): [number, number] => {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const dx = q[1] - p[1], dy = -(q[0] - p[0]);
    const l = Math.hypot(dx, dy) || 1;
    return [mx + (dx / l) * k, my + (dy / l) * k];
  };
  const x0 = -len / 2, x1 = len / 2;
  const P = (x: number, q: [number, number]) => V(x, q[1], q[0]);
  const xs = [x0, x0 + len * 0.33, x0 + len * 0.66, x1];
  const uo = R.range(0, 2), vo = R.range(0, 1);
  // bark arc
  let arc = 0;
  for (let k = 0; k < n; k++) {
    const pa = outer[k], pb = outer[k + 1];
    const da = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const na = V(0, pa[1] + c, pa[0]).normalize(), nb = V(0, pb[1] + c, pb[0]).normalize();
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1];
      ms.tri('bark', P(xa, pa), P(xb, pa), P(xb, pb), na, na, nb, [xa + uo, arc + vo], [xb + uo, arc + vo], [xb + uo, arc + da + vo]);
      ms.tri('bark', P(xa, pa), P(xb, pb), P(xa, pb), na, nb, nb, [xa + uo, arc + vo], [xb + uo, arc + da + vo], [xa + uo, arc + da + vo]);
    }
    arc += da;
  }
  // split faces: from the last outer point to the inner side, and from the inner side to the first outer point
  const faceStrip = (p: [number, number], q: [number, number]) => {
    const m = mid(p, q, R.range(-0.006, 0.01));
    const pts = [p, m, q];
    let v = 0;
    for (let k = 0; k < 2; k++) {
      const pa = pts[k], pb = pts[k + 1];
      const dv = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      const nn = V(0, -(pb[0] - pa[0]), (pb[1] - pa[1])).normalize();
      // outward normal: the polygon is CCW in (z, y); edge (pa->pb) outward = (dy, -dz) in (z,y) -> V(0, -dz, dy)
      ms.quad('wood_fresh', P(x0, pa), P(x1, pa), P(x1, pb), P(x0, pb), [uo, v + vo], [uo + len, v + vo], [uo + len, v + dv + vo], [uo, v + dv + vo], nn);
      v += dv;
    }
  };
  const poly = [...outer, ...inner];
  faceStrip(outer[n], inner[0]);
  if (inner.length === 2) faceStrip(inner[0], inner[1]);
  faceStrip(inner[inner.length - 1], outer[0]);
  // end caps (end grain, fresh cell 1), UV from the disc around the pith
  const cell = 1, cu = (cell % 2) * 0.5 + 0.25, cv = 1 - (Math.floor(cell / 2) * 0.5 + 0.25);
  const uvq = (q: [number, number]): [number, number] => [cu + (q[0] / (r * 1.12)) * 0.245, cv + ((q[1] + c) / (r * 1.12)) * 0.245];
  const ctr: [number, number] = [poly.reduce((s, q) => s + q[0], 0) / poly.length, poly.reduce((s, q) => s + q[1], 0) / poly.length];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    ms.tri('endgrain', P(x1, ctr), P(x1, b), P(x1, a), V(1, 0, 0), V(1, 0, 0), V(1, 0, 0), uvq(ctr), uvq(b), uvq(a));
    ms.tri('endgrain', P(x0, ctr), P(x0, a), P(x0, b), V(-1, 0, 0), V(-1, 0, 0), V(-1, 0, 0), uvq(ctr), uvq(a), uvq(b));
  }
  void rnd;
}

/** an upright round (bucked log section) standing on y = 0: bark sides, end grain top (cell) */
export function writeRound(ms: Mesher, rnd: Rand, h: number, r: number, seed: number, capMat = 'endgrain', cell = 1): void {
  ms.push(tf(0, 0, 0, rnd.range(0, 6.28), 0, Math.PI / 2));
  log(ms, h, r, { seed, seg: 14, ring: 0.2, taper: 0.03, bend: 0.0, lump: 0.025, capA: 1, capB: cell, capMat, matFor: () => 'bark' });
  ms.pop();
}

// ---------------------------------------------------------------------------------------------- products
type Builder = (ms: Mesher, r: Rand) => void;

const glassB = () => L('glass_brown'), tinR = () => L('tin');

const BUILD: Record<string, Builder> = {
  beer(ms) {
    // Canadian stubby: 341 ml, ~11.6 cm, brown glass, paper label, crown cap
    const g = glassB(), lab = L('beer');
    latheR(ms, 'lab_gloss', [[0, 0.0], [0.026, 0.0], [0.031, 0.004], [0.032, 0.012]], 16, g);
    latheR(ms, 'lab', [[0.0322, 0.012], [0.0322, 0.07]], 16, lab);
    latheR(ms, 'lab_gloss', [[0.032, 0.07], [0.031, 0.08], [0.024, 0.093], [0.0145, 0.101], [0.0135, 0.11], [0.0152, 0.112], [0.0152, 0.115]], 16, g);
    latheR(ms, 'lab_metal', [[0.0158, 0.114], [0.0162, 0.118], [0.0145, 0.121], [0, 0.1215]], 12, L('tin_gold'));
  },
  coffee(ms) {
    const lab = L('coffee'), t = tinR();
    latheR(ms, 'lab_metal', [[0, 0.0], [0.049, 0.0], [0.051, 0.003], [0.051, 0.006]], 18, t);
    latheR(ms, 'lab_metal', [[0.0505, 0.006], [0.0505, 0.122]], 20, lab);
    latheR(ms, 'lab_metal', [[0.051, 0.122], [0.0525, 0.124], [0.0525, 0.132], [0.05, 0.133], [0.048, 0.131], [0, 0.131]], 18, t);
  },
  beans(ms) {
    const lab = L('beans'), t = tinR();
    const rib = (y: number) => [[0.0375, y - 0.003], [0.0365, y], [0.0375, y + 0.003]] as [number, number][];
    latheR(ms, 'lab_metal', [[0, 0.0], [0.035, 0.0], [0.0385, 0.004], [0.0375, 0.008]], 16, t);
    latheR(ms, 'lab', [[0.0378, 0.008], [0.0378, 0.104]], 18, lab);
    void rib;
    latheR(ms, 'lab_metal', [[0.0375, 0.104], [0.0385, 0.108], [0.035, 0.11], [0.033, 0.108], [0, 0.108]], 16, t);
  },
  syrup(ms) {
    // rectangular maple syrup tin with a screw cap at the top
    const f = L('syrup'), red = sub(L('wool_red'), 0, 0, 1, 1);
    ms.pushT(0, 0.085, 0);
    boxR(ms, 'lab_metal', 0.13, 0.17, 0.055, { pz: f, nz: f, py: L('tin'), ny: L('tin') }, red);
    ms.pop();
    ms.pushT(0.035, 0.17, 0);
    latheR(ms, 'lab_metal', [[0.018, 0], [0.018, 0.008], [0.014, 0.01], [0.014, 0.02], [0, 0.021]], 12, L('tin_gold'));
    ms.pop();
  },
  cookies(ms) {
    const lab = L('cookies'), lid = L('cookies_lid'), t = tinR();
    latheR(ms, 'lab_metal', [[0, 0.0], [0.098, 0.0], [0.099, 0.004]], 24, t);
    latheR(ms, 'lab_metal', [[0.0985, 0.004], [0.0985, 0.06]], 28, sub(lab, 0, 0, 1, 1));
    // lid: rim band + top disc mapped with the round art
    latheR(ms, 'lab_metal', [[0.1015, 0.056], [0.1015, 0.08], [0.1, 0.082]], 28, sub(lab, 0, 0.0, 1, 0.18));
    const seg = 28;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const P = (a: number, rr: number) => V(Math.sin(a) * rr, 0.082, Math.cos(a) * rr);
      const U = (a: number, rr: number): [number, number] => [lid[0] + (lid[2] - lid[0]) * (0.5 + Math.sin(a) * rr / 0.2), lid[1] + (lid[3] - lid[1]) * (0.5 - Math.cos(a) * rr / 0.2)];
      ms.tri('lab_metal', V(0, 0.082, 0), P(a0, 0.1), P(a1, 0.1), V(0, 1, 0), V(0, 1, 0), V(0, 1, 0), U(0, 0), U(a0, 0.1), U(a1, 0.1));
    }
  },
  jerky(ms) {
    const f = L('jerky');
    ms.pushT(0, 0.09, 0);
    pouch(ms, 'lab', 0.12, 0.18, 0.02, 0.012, f, f, sub(f, 0, 0.9, 1, 1), { pinchTop: 0.12 });
    ms.pop();
    // stand-up gusset bottom
    ms.pushT(0, 0.004, 0);
    boxR(ms, 'lab', 0.115, 0.008, 0.035, {}, sub(f, 0, 0, 1, 0.08));
    ms.pop();
  },
  matches(ms) {
    const top = L('matches_top'), st = L('matches_striker'), cb = L('cardboard');
    ms.pushT(0, 0.015, 0);
    boxR(ms, 'lab', 0.11, 0.03, 0.065, { py: top, pz: st, nz: st }, cb);
    ms.pop();
  },
  batteries(ms) {
    const b = L('batteries'), t = tinR();
    for (const x of [-0.0175, 0.0175]) {
      ms.pushT(x, 0, 0);
      latheR(ms, 'lab_metal', [[0, 0], [0.016, 0], [0.017, 0.002]], 12, t);
      latheR(ms, 'lab', [[0.017, 0.002], [0.017, 0.058]], 14, b);
      latheR(ms, 'lab_metal', [[0.017, 0.058], [0.015, 0.061], [0.005, 0.061], [0.005, 0.0635], [0, 0.0635]], 12, t);
      ms.pop();
    }
    // a cardboard band holding them
    ms.pushT(0, 0.03, 0);
    boxR(ms, 'lab', 0.074, 0.03, 0.036, { pz: sub(b, 0, 0.3, 1, 1), nz: sub(b, 0, 0.3, 1, 1), py: L('cardboard'), ny: L('cardboard') }, L('cardboard'));
    ms.pop();
  },
  eggs(ms) {
    const p = L('pulp'), top = L('eggs');
    ms.pushT(0, 0.02, 0);
    boxR(ms, 'lab', 0.155, 0.04, 0.105, {}, p);
    ms.pop();
    ms.pushT(0, 0.052, 0);
    pouch(ms, 'lab', 0.158, 0.026, 0.108, 0.004, p, p, p, { seg: 3 });
    ms.pop();
    ms.pushT(0, 0.0655, 0, 0, -Math.PI / 2);
    ms.quad('lab', V(-0.06, -0.04, 0), V(0.06, -0.04, 0), V(0.06, 0.04, 0), V(-0.06, 0.04, 0), [top[0], top[1]], [top[2], top[1]], [top[2], top[3]], [top[0], top[3]]);
    ms.pop();
    // cup bumps on the sides of the base
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      ms.pushT(-0.05 + i * 0.05, 0.02, s * 0.05);
      latheR(ms, 'lab', [[0.022, -0.02], [0.024, 0.0], [0.02, 0.02]], 8, p);
      ms.pop();
    }
  },
  bacon(ms) {
    const bp = L('butcher');
    ms.pushT(0, 0.026, 0);
    pouch(ms, 'lab', 0.17, 0.05, 0.11, 0.008, bp, bp, bp, { seg: 3 });
    ms.pop();
    // twine both ways
    const ring = (axis: 'x' | 'z') => {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const u = Math.cos(a), v = Math.sin(a);
        pts.push(axis === 'x' ? V(u * 0.088, 0.026 + v * 0.031, 0) : V(0, 0.026 + v * 0.031, u * 0.058));
      }
      tube(ms, 'rope', pts, 0.0018, 4, { closed: true });
    };
    ring('x'); ring('z');
    const s = L('bacon');
    ms.quad('lab', V(0.02, 0.0525, -0.03), V(0.07, 0.0525, -0.03), V(0.07, 0.0525, -0.062), V(0.02, 0.0525, -0.062), [s[0], s[3]], [s[2], s[3]], [s[2], s[1]], [s[0], s[1]]);
  },
  bannock(ms) {
    const b = L('bannock'), w = L('wax');
    // wax paper square under the loaf
    boxR(ms, 'lab', 0.24, 0.002, 0.24, {}, w);
    ms.pushT(0, 0.002, 0);
    latheR(ms, 'lab', [[0, 0], [0.085, 0], [0.092, 0.012], [0.088, 0.03], [0.07, 0.048], [0.04, 0.058], [0, 0.062]], 18, b);
    ms.pop();
    const s = L('bannock');
    void s;
    const st = L('bannock');
    ms.pushT(0.08, 0.004, 0.08, 0.6, -Math.PI / 2);
    ms.quad('lab', V(-0.02, -0.013, 0), V(0.02, -0.013, 0), V(0.02, 0.013, 0), V(-0.02, 0.013, 0), [st[0], st[1]], [st[2], st[1]], [st[2], st[3]], [st[0], st[3]]);
    ms.pop();
  },
  berries(ms) {
    // birch-bark basket (mokuk) heaped with wild blueberries, spruce-root lashing at the rim
    const bb = L('birchbark');
    latheR(ms, 'lab_ds', [[0, 0], [0.055, 0], [0.06, 0.01], [0.064, 0.09], [0.066, 0.095]], 8, bb);
    latheR(ms, 'lab_ds', [[0.062, 0.095], [0.06, 0.012], [0.0, 0.012]], 8, sub(bb, 0, 0, 0.5, 0.5));
    ms.pushT(0, 0.095, 0);
    tube(ms, 'rope', Array.from({ length: 16 }, (_, k) => V(Math.sin(k / 16 * Math.PI * 2) * 0.066, 0, Math.cos(k / 16 * Math.PI * 2) * 0.066)), 0.004, 4, { closed: true });
    latheR(ms, 'lab', [[0.062, -0.01], [0.055, 0.012], [0.035, 0.024], [0, 0.03]], 10, L('blueberry'));
    ms.pop();
    const r = new Rand(9);
    for (let i = 0; i < 9; i++) {
      const a = r.range(0, 6.28), d = r.range(0.0, 0.05);
      ms.pushT(Math.cos(a) * d, 0.11 + 0.02 * (1 - d / 0.05), Math.sin(a) * d);
      latheR(ms, 'lab', [[0, -0.005], [0.005, -0.003], [0.006, 0.0], [0.005, 0.003], [0, 0.005]], 6, sub(L('blueberry'), 0.2, 0.2, 0.4, 0.4));
      ms.pop();
    }
  },
  chanterelle(ms) {
    const ch = L('chanterelle');
    const cap = sub(ch, 0, 0.5, 1, 1), gills = sub(ch, 0, 0, 1, 0.5);
    const r = new Rand(31);
    for (let i = 0; i < 4; i++) {
      const s = r.range(0.7, 1.15);
      const a = (i / 4) * Math.PI * 2 + r.range(0, 0.6);
      ms.pushT(Math.cos(a) * 0.025 * (i ? 1 : 0), 0, Math.sin(a) * 0.025 * (i ? 1 : 0), r.range(0, 6), r.range(-0.25, 0.25), r.range(-0.25, 0.25));
      // stem flaring into the gill underside, then the wavy cap top
      latheR(ms, 'lab', [[0, 0], [0.007 * s, 0], [0.008 * s, 0.02 * s], [0.014 * s, 0.035 * s], [0.026 * s, 0.045 * s], [0.031 * s, 0.05 * s]], 10, gills);
      latheR(ms, 'lab', [[0.031 * s, 0.05 * s], [0.03 * s, 0.054 * s], [0.02 * s, 0.052 * s], [0.008 * s, 0.047 * s], [0, 0.045 * s]], 10, cap);
      ms.pop();
    }
  },
  trout(ms) {
    // lofted lake trout lying on its side? no: upright profile, 0.5 m, head toward -X; side-projected skin
    const t = L('trout');
    const len = 0.5, n = 14, seg = 10;
    const prof = (u: number) => {
      // u 0 = snout .. 1 = tail root
      const h = 0.11 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08 + 0.04)), 0.8) * (u > 0.85 ? 1 - (u - 0.85) * 3.2 : 1) + 0.012;
      const w = h * 0.42;
      const yc = 0.065 + 0.01 * Math.sin(u * 3);
      return { h, w, yc };
    };
    const rings: { p: THREE.Vector3; n: THREE.Vector3 }[][] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const { h, w, yc } = prof(u);
      const x = -len / 2 + u * len * 0.86;
      const ring: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const yy = Math.cos(a) * h / 2, zz = Math.sin(a) * w / 2;
        ring.push({ p: V(x, yc + yy, zz), n: V(0, Math.cos(a) / h, Math.sin(a) / w).normalize() });
      }
      rings.push(ring);
    }
    const uvOf = (p: THREE.Vector3): [number, number] => {
      const u = (p.x + len / 2) / len, v = (p.y - 0.0) / 0.13;
      return [t[0] + (t[2] - t[0]) * u, t[1] + (t[3] - t[1]) * v];
    };
    for (let i = 0; i < n; i++) for (let k = 0; k < seg; k++) {
      const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k + 1], d = rings[i + 1][k];
      ms.tri('lab', a.p, b.p, c.p, a.n, b.n, c.n, uvOf(a.p), uvOf(b.p), uvOf(c.p));
      ms.tri('lab', a.p, c.p, d.p, a.n, c.n, d.n, uvOf(a.p), uvOf(c.p), uvOf(d.p));
    }
    // snout cap and forked tail fin (double-sided flat)
    const tailX = -len / 2 + len * 0.86, ty = 0.068;
    const tailPts = [V(tailX - 0.01, ty + 0.012, 0), V(len / 2, ty + 0.06, 0), V(len / 2 - 0.03, ty, 0), V(len / 2, ty - 0.055, 0), V(tailX - 0.01, ty - 0.012, 0)];
    for (const side of [1, -1]) {
      for (let k = 1; k < tailPts.length - 1; k++) {
        const a = tailPts[0], b = tailPts[k], c = tailPts[k + 1];
        const nn = V(0, 0, side);
        if (side > 0) ms.tri('lab', a, b, c, nn, nn, nn, uvOf(a), uvOf(b), uvOf(c));
        else ms.tri('lab', a, c, b, nn, nn, nn, uvOf(a), uvOf(c), uvOf(b));
      }
    }
    // dorsal fin
    const dx = -0.02;
    const fin = [V(dx - 0.04, 0.12, 0), V(dx + 0.02, 0.165, 0), V(dx + 0.04, 0.12, 0)];
    for (const side of [1, -1]) {
      const nn = V(0, 0, side);
      if (side > 0) ms.tri('lab', fin[0], fin[2], fin[1], nn, nn, nn, uvOf(fin[0]), uvOf(fin[2]), uvOf(fin[1]));
      else ms.tri('lab', fin[0], fin[1], fin[2], nn, nn, nn, uvOf(fin[0]), uvOf(fin[1]), uvOf(fin[2]));
    }
  },
  rope(ms) {
    // a coil of manila rope (several turns) with a paper band
    const pts: THREE.Vector3[] = [];
    const turns = 5, N = turns * 20;
    for (let i = 0; i <= N; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = 0.1 + 0.006 * Math.sin(i * 0.7);
      pts.push(V(Math.cos(a) * r, 0.012 + (i / N) * 0.05 + 0.004 * Math.sin(a * 2), Math.sin(a) * r));
    }
    tube(ms, 'rope', pts, 0.008, 5, { samples: N });
    const b = L('rope_band');
    ms.pushT(0.1, 0.04, 0, Math.PI / 2);
    boxR(ms, 'lab', 0.04, 0.075, 0.03, { pz: b, nz: b }, L('kraft'));
    ms.pop();
  },
  fatwood(ms) {
    const f = L('fatwood'), r = new Rand(17);
    for (let i = 0; i < 9; i++) {
      const x = ((i % 3) - 1) * 0.022 + r.range(-0.003, 0.003), y = Math.floor(i / 3) * 0.022 + 0.011;
      ms.pushT(x, y, 0, r.range(-0.03, 0.03), 0, r.range(-0.1, 0.1));
      boxR(ms, 'lab', 0.02, 0.02, 0.24 + r.range(-0.02, 0.02), {}, f);
      ms.pop();
    }
    const b = L('fatwood_band');
    ms.pushT(0, 0.034, 0.04);
    boxR(ms, 'lab', 0.074, 0.074, 0.03, { px: b, nx: b, py: b, ny: b }, b);
    ms.pop();
  },
  kindling(ms) {
    const r = new Rand(23);
    for (let i = 0; i < 16; i++) {
      const a = r.range(0, 6.28), d = r.range(0, 0.035);
      const len = r.range(0.32, 0.4);
      ms.pushT(Math.cos(a) * d, 0.04 + Math.sin(a) * d * 0.8, r.range(-0.02, 0.02), r.range(-0.08, 0.08), 0, r.range(-0.05, 0.05));
      ms.push(tf(0, 0, 0, Math.PI / 2));
      boxAt(ms, i % 3 ? 'wood_fresh' : 'bark', 0, 0, 0, len, r.range(0.01, 0.02), r.range(0.012, 0.025), 0, { grain: 'x', uv: [r.range(0, 2), r.range(0, 1)] });
      ms.pop(); ms.pop();
    }
    for (const z of [-0.09, 0.09]) {
      tube(ms, 'rope', Array.from({ length: 10 }, (_, k) => V(Math.cos(k / 10 * Math.PI * 2) * 0.046, 0.04 + Math.sin(k / 10 * Math.PI * 2) * 0.04, z)), 0.0025, 4, { closed: true });
    }
    const b = L('kindling');
    ms.pushT(0, 0.04, 0);
    ms.quad('lab', V(-0.032, -0.02, 0.0), V(0.032, -0.02, 0.0), V(0.032, 0.02, 0.0), V(-0.032, 0.02, 0.0), [b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]);
    ms.pop();
  },
  split(ms) {
    const r = new Rand(41);
    ms.pushT(0, 0.07, 0, Math.PI / 2, 0, Math.PI);
    writeSplit(ms, r, 0.42, 0.13, 4141);
    ms.pop();
  },
  bundle(ms) {
    const r = new Rand(43);
    // six splits in a ring, bark outward, along z
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 0.075, y = 0.15 + Math.sin(a) * 0.075;
      // writeSplit: length along x, bark toward +y; yaw to run along z, then roll so +y points outward
      ms.push(tf(x, y, 0, Math.PI / 2, 0, 0).multiply(new THREE.Matrix4().makeRotationX(a - Math.PI / 2)));
      writeSplit(ms, r, 0.4 + r.range(-0.02, 0.02), 0.13, 4300 + i);
      ms.pop();
    }
    for (const z of [-0.12, 0.12]) {
      tube(ms, 'rope', Array.from({ length: 14 }, (_, k) => V(Math.cos(k / 14 * Math.PI * 2) * 0.15, 0.16 + Math.sin(k / 14 * Math.PI * 2) * 0.15, z)), 0.003, 4, { closed: true });
    }
  },
  file(ms) {
    const s = L('steel');
    // tapered blade with a tang, wooden handle
    ms.pushT(0, 0.01, 0.06);
    boxR(ms, 'lab_metal', 0.026, 0.005, 0.2, {}, s);
    ms.pop();
    ms.pushT(0, 0.01, 0.17);
    boxR(ms, 'lab_metal', 0.014, 0.004, 0.03, {}, s);
    ms.pop();
    ms.pushT(0, 0.012, -0.04, 0, -Math.PI / 2);
    latheR(ms, 'lab', [[0, 0], [0.012, 0.0], [0.015, 0.02], [0.016, 0.07], [0.013, 0.1], [0.008, 0.105], [0, 0.106]], 8, L('kraft'));
    ms.pop();
    ms.pushT(0, 0.012, -0.045, 0, -Math.PI / 2);
    latheR(ms, 'lab_metal', [[0.0125, -0.006], [0.0125, 0.006]], 8, L('tin_gold'));
    ms.pop();
  },
  log_tongs(ms) {
    // two curved jaws crossing at a pivot, with a wooden handle bar on top
    for (const s of [-1, 1]) {
      const pts = [V(s * 0.03, 0.38, 0), V(-s * 0.04, 0.3, 0), V(-s * 0.13, 0.2, 0), V(-s * 0.16, 0.09, 0), V(-s * 0.12, 0.02, 0), V(-s * 0.09, 0.005, 0)];
      tube(ms, 'iron', pts, 0.011, 6);
      ms.pushT(-s * 0.09, 0.005, 0);
      latheR(ms, 'lab_metal', [[0.011, 0], [0.0, -0.025]], 6, L('steel'));
      ms.pop();
    }
    ms.pushT(0, 0.3, 0, 0, Math.PI / 2);
    latheR(ms, 'lab_metal', [[0.016, -0.02], [0.016, 0.02]], 8, L('steel'));
    ms.pop();
    tube(ms, 'iron', [V(0.03, 0.38, 0), V(0, 0.44, 0), V(-0.03, 0.38, 0)], 0.009, 6);
    ms.pushT(-0.17, 0.46, 0, 0, 0, -Math.PI / 2);
    lathe(ms, 'board_warm', [[0, 0], [0.018, 0], [0.02, 0.05], [0.02, 0.29], [0.018, 0.34], [0, 0.34]], 8);
    ms.pop();
  },
  chainsaw(ms) {
    const olive = L('plastic_olive'), cream = L('plastic_cream'), black = L('plastic_black'), steel = L('steel'), chain = L('chain');
    // engine housing
    ms.pushT(0, 0.105, -0.03);
    pouch(ms, 'lab', 0.16, 0.17, 0.3, 0.01, olive, olive, olive, { seg: 3 });
    ms.pop();
    // cream top cover with air slots
    ms.pushT(0, 0.2, -0.04);
    pouch(ms, 'lab', 0.15, 0.05, 0.26, 0.008, cream, cream, cream, { seg: 3 });
    ms.pop();
    for (let i = 0; i < 5; i++) boxAt(ms, 'iron', 0.0, 0.226, -0.12 + i * 0.03, 0.08, 0.004, 0.008);
    // decal on the left side
    const dcl = L('chainsaw_decal');
    ms.quad('lab', V(-0.0815, 0.07, 0.07), V(-0.0815, 0.07, -0.13), V(-0.0815, 0.13, -0.13), V(-0.0815, 0.13, 0.07), [dcl[0], dcl[1]], [dcl[2], dcl[1]], [dcl[2], dcl[3]], [dcl[0], dcl[3]]);
    // recoil starter cover + grip on the left
    ms.pushT(-0.085, 0.1, -0.09, 0, 0, Math.PI / 2);
    latheR(ms, 'lab', [[0.055, 0], [0.055, 0.015], [0.02, 0.022], [0, 0.022]], 14, black);
    ms.pop();
    tube(ms, 'iron', [V(-0.108, 0.15, -0.09), V(-0.112, 0.17, -0.09)], 0.003, 4);
    ms.pushT(-0.112, 0.175, -0.09, 0, 0, Math.PI / 2);
    latheR(ms, 'lab', [[0.009, -0.03], [0.011, -0.025], [0.011, 0.025], [0.009, 0.03]], 8, black);
    ms.pop();
    // rear handle loop with trigger
    tube(ms, 'lab', [V(0, 0.19, -0.17), V(0, 0.23, -0.26), V(0, 0.2, -0.39), V(0, 0.12, -0.42), V(0, 0.05, -0.38), V(0, 0.04, -0.2)], 0.017, 7);
    boxAt(ms, 'iron', 0, 0.185, -0.3, 0.012, 0.03, 0.04, 0, {}, 0.3);
    // front handle bar arching over the top
    tube(ms, 'iron', [V(-0.1, 0.03, 0.05), V(-0.11, 0.22, 0.04), V(-0.05, 0.3, 0.035), V(0.05, 0.29, 0.035), V(0.1, 0.2, 0.03), V(0.1, 0.06, 0.03)], 0.012, 7);
    // chain brake hand guard
    ms.pushT(-0.01, 0.27, 0.1, 0, -0.5);
    boxR(ms, 'lab', 0.16, 0.1, 0.008, {}, black);
    ms.pop();
    // muffler
    ms.pushT(-0.04, 0.07, 0.13);
    boxR(ms, 'lab_metal', 0.07, 0.07, 0.04, {}, steel);
    ms.pop();
    // sprocket cover on the right
    ms.pushT(0.085, 0.09, 0.08);
    pouch(ms, 'lab', 0.02, 0.1, 0.16, 0.004, black, black, black, { seg: 2 });
    ms.pop();
    // fuel + oil caps
    for (const [z, k] of [[-0.14, 'cream'], [-0.06, 'black']] as [number, string][]) {
      ms.pushT(0.07, 0.04, z, 0, 0, -Math.PI / 2);
      latheR(ms, 'lab', [[0.016, 0], [0.016, 0.012], [0, 0.014]], 10, k === 'cream' ? cream : black);
      ms.pop();
    }
    // the bar (steel plate with a rounded nose) inside a slightly larger chain plate
    const barShape = (w: number, r: number) => {
      const s = new THREE.Shape();
      s.moveTo(0, -w / 2); s.lineTo(0.42, -r); s.absarc(0.42, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(0, w / 2); s.lineTo(0, -w / 2);
      return s;
    };
    const ext = (shape: THREE.Shape, depth: number, rect: Rect, mat: string, x: number) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + (rect[2] - rect[0]) * ((uv.getX(i) * 8) % 1), rect[1] + (rect[3] - rect[1]) * Math.min(1, Math.abs(uv.getY(i)) * 20 % 1));
      ms.geom(mat, g, tf(x, 0.09, 0.12, -Math.PI / 2).multiply(new THREE.Matrix4().makeTranslation(0, 0, -depth / 2)));
      g.dispose();
    };
    ext(barShape(0.072, 0.034), 0.006, chain, 'lab_metal', 0.06);
    ext(barShape(0.058, 0.027), 0.012, steel, 'lab_metal', 0.06);
  },
  sleeping_bag(ms) {
    // a rolled wool bag in buffalo check, grey lining spiral at the ends, two leather straps, a tag
    const len = 0.42, r = 0.12;
    ms.pushT(-len / 2, r, 0, 0, 0, 0);
    log(ms, len, r, { seed: 77, seg: 16, ring: 0.1, taper: 0, bend: 0, lump: 0.02, capA: -1, capB: -1, matFor: () => 'blanket' });
    ms.pop();
    for (const s of [-1, 1]) {
      // spiral end: concentric rings alternating blanket / lining
      ms.pushT(s * len / 2, r, 0, 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      for (let k = 0; k < 5; k++) {
        const r0 = r * (1 - k / 5), r1 = r * (1 - (k + 1) / 5);
        lathe(ms, k % 2 ? 'wool_grey' : 'blanket', [[r0, 0.004 * (k % 2)], [r1, 0.004 * ((k + 1) % 2)]], 16);
      }
      ms.pop();
      // strap
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; pts.push(V(s * 0.12, r + Math.cos(a) * (r + 0.006), Math.sin(a) * (r + 0.006))); }
      tube(ms, 'leather', pts, 0.008, 4, { closed: true });
      boxAt(ms, 'galv', s * 0.12, r * 2 + 0.006, 0, 0.03, 0.006, 0.03);
    }
    const t = L('bag_tag');
    ms.pushT(0.05, r + 0.02, r + 0.004);
    ms.quad('lab', V(-0.03, -0.01, 0), V(0.03, -0.01, 0), V(0.03, 0.01, 0), V(-0.03, 0.01, 0), [t[0], t[1]], [t[2], t[1]], [t[2], t[3]], [t[0], t[3]]);
    ms.pop();
  },
  backpack(ms) {
    // waxed canvas rucksack: body, top flap with leather straps and buckles, front pocket, shoulder straps
    const cv = L('canvas_green');
    ms.pushT(0, 0.25, 0);
    pouch(ms, 'lab', 0.34, 0.5, 0.18, 0.03, cv, cv, cv, { seg: 4 });
    ms.pop();
    // front pocket
    ms.pushT(0, 0.17, 0.115);
    pouch(ms, 'lab', 0.24, 0.16, 0.06, 0.012, cv, cv, cv, { seg: 3 });
    ms.pop();
    // flap: a curved sheet from the back top over the front
    {
      const pts: THREE.Vector3[][] = [];
      const prof: [number, number][] = [[-0.09, 0.5], [0.0, 0.53], [0.09, 0.51], [0.12, 0.44], [0.13, 0.33]];
      for (const [z, y] of prof) {
        const row: THREE.Vector3[] = [];
        for (let k = 0; k <= 6; k++) row.push(V(-0.18 + 0.36 * (k / 6), y, z));
        pts.push(row);
      }
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 6; k++) {
        const a = pts[i][k], b = pts[i][k + 1], c = pts[i + 1][k + 1], d = pts[i + 1][k];
        const uv = (p: THREE.Vector3): [number, number] => [cv[0] + (cv[2] - cv[0]) * (p.x + 0.18) / 0.36, cv[1] + (cv[3] - cv[1]) * (p.y - 0.3) / 0.25];
        ms.quad('lab_ds', a, d, c, b, uv(a), uv(d), uv(c), uv(b));
      }
    }
    // straps over the flap with buckles
    for (const x of [-0.09, 0.09]) {
      tube(ms, 'leather', [V(x, 0.53, -0.08), V(x, 0.545, 0.0), V(x, 0.525, 0.1), V(x, 0.44, 0.135), V(x, 0.26, 0.15)], 0.009, 4);
      boxAt(ms, 'galv', x, 0.3, 0.155, 0.03, 0.025, 0.006);
    }
    // shoulder straps on the back
    for (const x of [-0.08, 0.08]) tube(ms, 'leather', [V(x, 0.48, -0.09), V(x * 1.4, 0.36, -0.13), V(x * 1.6, 0.12, -0.12), V(x * 1.5, 0.04, -0.09)], 0.012, 4);
    const pt = L('leather_patch');
    ms.pushT(0, 0.4, 0.137, 0, -0.35);
    ms.quad('lab', V(-0.04, -0.024, 0), V(0.04, -0.024, 0), V(0.04, 0.024, 0), V(-0.04, 0.024, 0), [pt[0], pt[1]], [pt[2], pt[1]], [pt[2], pt[3]], [pt[0], pt[3]]);
    ms.pop();
  },
  // ---------------------------------------------------------------- decor (not items)
  coffeepot(ms) {
    lathe(ms, 'enamel_blue', [[0, 0], [0.07, 0], [0.072, 0.006], [0.064, 0.12], [0.05, 0.17], [0.046, 0.175], [0.042, 0.175], [0.04, 0.19], [0.02, 0.2], [0.012, 0.2], [0.012, 0.212], [0, 0.215]], 16);
    tube(ms, 'enamel_blue', [V(0, 0.04, 0.066), V(0, 0.11, 0.1), V(0, 0.16, 0.125)], 0.016, 8, { rEnd: 0.009 });
    tube(ms, 'iron', [V(0, 0.16, -0.05), V(0, 0.15, -0.1), V(0, 0.08, -0.1), V(0, 0.04, -0.065)], 0.007, 6);
  },
  enamel_mug(ms) {
    lathe(ms, 'enamel', [[0, 0], [0.04, 0], [0.042, 0.004], [0.042, 0.085], [0.044, 0.088], [0.039, 0.088], [0.038, 0.01], [0, 0.01]], 16);
    tube(ms, 'enamel', [V(0.04, 0.072, 0), V(0.068, 0.068, 0), V(0.07, 0.03, 0), V(0.04, 0.02, 0)], 0.006, 6);
  },
  enamel_plate(ms) {
    lathe(ms, 'enamel', [[0, 0.002], [0.07, 0.002], [0.1, 0.016], [0.118, 0.022], [0.12, 0.024], [0.116, 0.024], [0.098, 0.019], [0.068, 0.006], [0, 0.006]], 20);
  },
  jar_preserves(ms) {
    latheR(ms, 'lab_gloss', [[0, 0], [0.036, 0], [0.038, 0.006], [0.038, 0.016]], 14, L('blueberry'));
    latheR(ms, 'lab', [[0.0385, 0.016], [0.0385, 0.056]], 14, L('jar_label'));
    latheR(ms, 'lab_gloss', [[0.038, 0.056], [0.038, 0.074], [0.031, 0.084], [0.031, 0.09]], 14, L('blueberry'));
    latheR(ms, 'lab', [[0.04, 0.084], [0.041, 0.092], [0.034, 0.1], [0, 0.102]], 10, L('wool_red'));
    tube(ms, 'rope', Array.from({ length: 10 }, (_, k) => V(Math.sin(k / 10 * 6.283) * 0.034, 0.086, Math.cos(k / 10 * 6.283) * 0.034)), 0.002, 3, { closed: true });
  },
  jar_flour(ms) {
    latheR(ms, 'lab_gloss', [[0, 0], [0.055, 0], [0.058, 0.008], [0.058, 0.03]], 14, L('egg'));
    latheR(ms, 'lab', [[0.0585, 0.03], [0.0585, 0.1]], 14, L('flour_label'));
    latheR(ms, 'lab_gloss', [[0.058, 0.1], [0.058, 0.15], [0.05, 0.165], [0.05, 0.172]], 14, L('egg'));
    latheR(ms, 'lab_metal', [[0.053, 0.168], [0.053, 0.18], [0, 0.182]], 12, L('tin'));
  },
  soap(ms) {
    ms.pushT(0, 0.016, 0);
    boxR(ms, 'lab', 0.09, 0.032, 0.06, { py: L('soap') }, L('paper_label'));
    ms.pop();
  },
  book_stack(ms) {
    const r = new Rand(3);
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const w = r.range(0.14, 0.2), d = r.range(0.2, 0.24), h = r.range(0.025, 0.04);
      ms.pushT(r.range(-0.01, 0.01), y + h / 2, 0, r.range(-0.15, 0.15));
      const sp = sub(L('book_spines'), i * 0.3, 0, i * 0.3 + 0.25, 1);
      boxR(ms, 'lab', w, h, d, { nx: sp, py: L('leather_patch'), ny: L('leather_patch') }, L('paper_label'));
      ms.pop();
      y += h;
    }
  },
  candle(ms) {
    lathe(ms, 'enamel', [[0, 0], [0.05, 0], [0.052, 0.006], [0.048, 0.01], [0.014, 0.012], [0.014, 0.022], [0, 0.022]], 14);
    latheR(ms, 'lab', [[0.011, 0.02], [0.011, 0.07], [0.008, 0.072], [0, 0.072]], 10, L('wax'));
    tube(ms, 'iron', [V(0, 0.072, 0), V(0.001, 0.08, 0)], 0.0012, 3);
    tube(ms, 'enamel', [V(0.05, 0.006, 0), V(0.07, 0.01, 0), V(0.07, 0.03, 0), V(0.05, 0.03, 0)], 0.004, 4);
  },
  inkwell(ms) {
    latheR(ms, 'lab_gloss', [[0, 0], [0.025, 0], [0.026, 0.035], [0.012, 0.045], [0.009, 0.055], [0, 0.056]], 8, L('plastic_black'));
  },
  pencil(ms) {
    ms.pushT(0, 0.004, 0, 0.4, 0, Math.PI / 2);
    lathe(ms, 'board_warm', [[0, -0.08], [0.004, -0.07], [0.004, 0.08], [0, 0.08]], 6);
    ms.pop();
  },
};

/** item id -> generator id (ITEMS model 'gen:<id>') */
function genId(id: string): string {
  const it = ITEMS[id];
  if (it && it.model.startsWith('gen:')) return it.model.slice(4);
  return id;
}

const cache = new Map<string, THREE.Group>();
const sizes = new Map<string, [number, number, number]>();

/** a new Object3D of the product (meshes share geometry + materials with every other copy) */
export function buildProduct(id: string): THREE.Object3D {
  ensurePrintMats();
  const gid = genId(id);
  let proto = cache.get(gid);
  if (!proto) {
    const b = BUILD[gid];
    const ms = new Mesher();
    if (b) b(ms, new Rand(gid.length * 131));
    else boxAt(ms, 'board_warm', 0, 0.05, 0, 0.1, 0.1, 0.1);
    proto = ms.build({ name: gid });
    proto.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    cache.set(gid, proto);
    const bb = new THREE.Box3().setFromObject(proto);
    const s = bb.getSize(new THREE.Vector3());
    sizes.set(gid, [s.x, s.y, s.z]);
  }
  const o = proto.clone(true);
  o.name = id;
  o.userData = { itemId: ITEMS[id] ? id : Object.values(ITEMS).find((it) => it.model === `gen:${gid}`)?.id ?? id, product: gid };
  return o;
}

/** [w, h, d] metres */
export function productSize(id: string): [number, number, number] {
  const gid = genId(id);
  if (!sizes.has(gid)) buildProduct(id);
  return sizes.get(gid)!;
}

/** every gen: product id in the item catalogue */
export const GEN_PRODUCTS: string[] = Object.values(ITEMS).filter((it) => it.model.startsWith('gen:')).map((it) => it.model.slice(4));
export const DECOR_PRODUCTS = ['coffeepot', 'enamel_mug', 'enamel_plate', 'jar_preserves', 'jar_flour', 'soap', 'book_stack', 'candle', 'inkwell', 'pencil'];
void hasMat; void box;
