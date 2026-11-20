// Produce on the cutting board, cut for real. A vegetable (or a brick of cheddar, a strip of meat) is a set of
// blocks, each a solid shape (ellipsoid, half dome, tapered cylinder, rounded box) in its own frame. Every knife
// stroke adds a cutting plane; the pieces are the cells between the planes, clipped by the shape, built as real
// geometry: a double heightfield (the curved skin top and bottom) with flat cut faces on the cut sides. So a
// carrot cut every 6 mm gives 6 mm coins, an onion peeled, halved, sliced and cross-cut gives dice whose size is
// exactly the spacing you cut at, and garlic rocked over again and again ends up minced.
//
// The cut faces show what is inside: the material works out each fragment's normalised radius in the shape (aP)
// and paints the onion's rings, the carrot's pale core, the potato's thin skin line. Doneness (raw -> golden ->
// browned -> charred, top and bottom separately, like the other food) sits on the material.
//
// Bits that leave the board become a Pile: all the pieces of one ingredient merged into one mesh (one draw call)
// scattered over a pan, floating in a pot, heaped on a plate.
import * as THREE from 'three';
import { Pix, hex, fbm, speck, vnoise, ramp, mix, mul, type RGB } from './paint';

export type ProduceKind = 'onion' | 'potato' | 'carrot' | 'garlic' | 'scallion' | 'meat' | 'cheese' | 'beef' | 'chanterelle';

export interface Shape {
  kind: 'ell' | 'dome' | 'cyl' | 'box';
  /** half extent along x */
  a: number;
  /** ell: vertical radius; dome / box: height */
  b: number;
  /** half extent along z */
  c: number;
  /** cyl: radius at -a (tip) and +a (shoulder) */
  r0?: number; r1?: number;
  /** skin on the dome's flat underside too (a whole clove lying on its side) */
}

const EPS = 0.998;

/** vertical extent [y0, y1] of the shape over (x, z) (thin at the outline) */
export function span(s: Shape, x: number, z: number, out: [number, number]): [number, number] {
  switch (s.kind) {
    case 'ell': {
      const k = Math.max(0, 1 - (x / s.a) ** 2 - (z / s.c) ** 2), h = s.b * Math.sqrt(k);
      out[0] = s.b - h; out[1] = s.b + h; return out;
    }
    case 'dome': {
      const k = Math.max(0, 1 - (x / s.a) ** 2 - (z / s.c) ** 2);
      out[0] = 0; out[1] = s.b * Math.sqrt(k); return out;
    }
    case 'cyl': {
      const r = cylR(s, x), k = Math.max(0, 1 - (z / r) ** 2), h = r * Math.sqrt(k);
      out[0] = r - h; out[1] = r + h; return out;
    }
    case 'box': default: {
      const rr = Math.min(0.004, s.b * 0.3);
      const e = Math.min(s.a - Math.abs(x), s.c - Math.abs(z));
      const drop = e < rr ? rr - Math.sqrt(Math.max(0, rr * rr - (rr - Math.max(0, e)) ** 2)) : 0;
      out[0] = Math.min(drop * 0.6, s.b * 0.3); out[1] = s.b - drop; return out;
    }
  }
}
function cylR(s: Shape, x: number): number {
  const t = THREE.MathUtils.clamp((x + s.a) / (2 * s.a), 0, 1);
  // a rounded tip and a rounded shoulder
  const base = (s.r0 ?? 0.004) + ((s.r1 ?? 0.014) - (s.r0 ?? 0.004)) * Math.pow(t, 0.8);
  const tip = Math.min(1, t * 9), sh = Math.min(1, (1 - t) * 14);
  return Math.max(0.0008, base * Math.sqrt(tip) * Math.sqrt(sh));
}
/** clamp a point into the shape's outline (keeping it in its cell) */
function clampIn(s: Shape, x: number, z: number, out: [number, number]): [number, number] {
  if (s.kind === 'box') { out[0] = THREE.MathUtils.clamp(x, -s.a, s.a); out[1] = THREE.MathUtils.clamp(z, -s.c, s.c); return out; }
  const xm = s.a * EPS;
  const xc = THREE.MathUtils.clamp(x, -xm, xm);
  const zm = s.kind === 'cyl' ? cylR(s, xc) * EPS : s.c * Math.sqrt(Math.max(0, 1 - (xc / s.a) ** 2)) * EPS;
  out[0] = xc; out[1] = THREE.MathUtils.clamp(z, -zm, zm);
  return out;
}
/** normalised position in the shape (|aP| = 1 on the skin) */
function normP(s: Shape, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  switch (s.kind) {
    case 'ell': return out.set(x / s.a, (y - s.b) / s.b, z / s.c);
    case 'dome': return out.set(x / s.a, y / s.b, z / s.c);
    case 'cyl': { const r = cylR(s, x); return out.set(0, (y - r) / r, z / r); }
    default: return out.set(x / s.a, (y - s.b / 2) / (s.b / 2), z / s.c);
  }
}
export function shapeVolume(s: Shape): number {
  switch (s.kind) {
    case 'ell': return (4 / 3) * Math.PI * s.a * s.b * s.c;
    case 'dome': return (2 / 3) * Math.PI * s.a * s.b * s.c;
    case 'cyl': { let v = 0; for (let i = 0; i < 16; i++) { const x = -s.a + (i + 0.5) / 16 * 2 * s.a; v += Math.PI * cylR(s, x) ** 2; } return v * (2 * s.a) / 16; }
    default: return 8 * s.a * s.c * s.b / 2;
  }
}
function extentX(s: Shape): number { return s.a; }
function shapeHeight(s: Shape): number { return s.kind === 'ell' ? 2 * s.b : s.kind === 'cyl' ? 2 * Math.max(s.r0 ?? 0, s.r1 ?? 0.014) : s.b; }
/** mean spacing between knife cuts (the outline counts as an edge too) */
function meanGap(cuts: number[], ext: number): number {
  if (!cuts.length) return ext * 2;
  const all = [-ext, ...cuts, ext];
  let sum = 0;
  for (let i = 1; i < all.length; i++) sum += all[i] - all[i - 1];
  return sum / (all.length - 1);
}
function extentZ(s: Shape): number { return s.kind === 'cyl' ? Math.max(s.r0 ?? 0, s.r1 ?? 0.014) : s.c; }

// ---------------------------------------------------------------------------------------------- cells
export interface Cell {
  /** geometry centred on the cell's own centroid (block frame orientation) */
  geo: THREE.BufferGeometry;
  /** centroid in the block frame */
  c: THREE.Vector3;
  vol: number;
  /** extents (m): along x, up, along z */
  dx: number; dy: number; dz: number;
}

const _sp: [number, number] = [0, 0], _cl: [number, number] = [0, 0], _np = new THREE.Vector3();

/**
 * The piece of a shape between x0..x1 and z0..z1, or null when the cell misses the shape. cutX / cutZ say which
 * of the four sides are knife cuts (flesh) rather than the shape's own outline. flatSkin: the underside of a dome
 * is skin (a clove lying on its side), not a cut face.
 */
export function cellGeo(s: Shape, x0: number, x1: number, z0: number, z1: number, cut: { x0: boolean; x1: boolean; z0: boolean; z1: boolean }, res = 0.0045, flatSkin = false, ya = -1, yb = 99): Cell | null {
  // quick reject + measure on a fine grid
  let any = false, vol = 0, hmax = 0;
  const qn = 6;
  for (let i = 0; i < qn; i++) for (let j = 0; j < qn; j++) {
    const x = x0 + (i + 0.5) / qn * (x1 - x0), z = z0 + (j + 0.5) / qn * (z1 - z0);
    span(s, x, z, _sp);
    const h = Math.min(_sp[1], yb) - Math.max(_sp[0], ya);
    if (h > 0.0004) { any = true; vol += h; hmax = Math.max(hmax, h); }
  }
  if (!any) return null;
  vol *= (x1 - x0) * (z1 - z0) / (qn * qn);
  if (vol < 4e-9) return null;
  const nx = Math.max(2, Math.min(14, Math.ceil((x1 - x0) / res))), nz = Math.max(2, Math.min(14, Math.ceil((z1 - z0) / res)));
  // grid of (clamped) points
  const gx: number[] = [], gz: number[] = [], top: number[] = [], bot: number[] = [], tcut: number[] = [], bcut: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + (i / nx) * (x1 - x0), z = z0 + (j / nz) * (z1 - z0);
    clampIn(s, x, z, _cl);
    const cx = THREE.MathUtils.clamp(_cl[0], x0, x1), cz = THREE.MathUtils.clamp(_cl[1], z0, z1);
    span(s, cx, cz, _sp);
    // a horizontal slab of it (layered dice): clipped faces are cut flesh
    let b0 = _sp[0], t0 = _sp[1];
    tcut.push(t0 > yb ? 1 : 0); bcut.push(b0 < ya ? 1 : 0);
    t0 = Math.min(t0, yb); b0 = Math.max(b0, ya);
    if (t0 < b0) { const m = THREE.MathUtils.clamp((t0 + b0) / 2, ya, yb); t0 = b0 = m; }
    gx.push(cx); gz.push(cz); bot.push(b0); top.push(t0);
  }
  const at = (i: number, j: number) => j * (nx + 1) + i;
  // centroid
  let sx = 0, sy = 0, sz = 0, sw = 0, minX = 9, maxX = -9, minZ = 9, maxZ = -9;
  for (let k = 0; k < gx.length; k++) {
    const h = top[k] - bot[k];
    if (h <= 1e-5) continue;
    sx += gx[k] * h; sy += (top[k] + bot[k]) / 2 * h; sz += gz[k] * h; sw += h;
    minX = Math.min(minX, gx[k]); maxX = Math.max(maxX, gx[k]); minZ = Math.min(minZ, gz[k]); maxZ = Math.max(maxZ, gz[k]);
  }
  if (sw <= 0) { sx = (x0 + x1) / 2; sz = (z0 + z1) / 2; sy = 0; sw = 1; minX = x0; maxX = x1; minZ = z0; maxZ = z1; }
  const c = new THREE.Vector3(sx / sw, sy / sw, sz / sw);
  const P: number[] = [], N: number[] = [], UV: number[] = [], AP: number[] = [], SK: number[] = [], E: number[] = [];
  const push = (x: number, y: number, z: number, nx_: number, ny_: number, nz_: number, skin: number, edge: number) => {
    P.push(x - c.x, y - c.y, z - c.z); N.push(nx_, ny_, nz_);
    normP(s, x, y, z, _np);
    AP.push(_np.x, _np.y, _np.z); SK.push(skin); E.push(edge);
    // skin uv: planar over the shape (tiles a small swatch); flesh faces use aP in the shader
    UV.push(0.5 + (((x + z * 0.7) * 9) % 1 + 1) % 1 * 0.48, 0.02 + (((y + z) * 9) % 1 + 1) % 1 * 0.96);
  };
  const nrm = (i: number, j: number, which: 0 | 1, o: THREE.Vector3) => {
    // surface normal from the heightfield gradient (flat where the slab was cut)
    const k = at(i, j), arr = which ? top : bot;
    if ((which ? tcut : bcut)[k]) return o.set(0, which ? 1 : -1, 0);
    const il = Math.max(0, i - 1), ir = Math.min(nx, i + 1), jl = Math.max(0, j - 1), jr = Math.min(nz, j + 1);
    const dx = gx[at(ir, j)] - gx[at(il, j)] || 1e-6, dz = gz[at(i, jr)] - gz[at(i, jl)] || 1e-6;
    const hx = (arr[at(ir, j)] - arr[at(il, j)]) / dx, hz = (arr[at(i, jr)] - arr[at(i, jl)]) / dz;
    const sgn = which ? 1 : -1;
    o.set(-hx * sgn, sgn, -hz * sgn);
    if (!isFinite(o.x) || !isFinite(o.z)) o.set(0, sgn, 0);
    void k;
    return o.normalize();
  };
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3(), nd = new THREE.Vector3();
  const topSkin = 1, botSkin = s.kind === 'dome' && !flatSkin ? 0 : 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const A = at(i, j), B = at(i + 1, j), C = at(i + 1, j + 1), D = at(i, j + 1);
    if (top[A] - bot[A] < 1e-5 && top[B] - bot[B] < 1e-5 && top[C] - bot[C] < 1e-5 && top[D] - bot[D] < 1e-5) continue;
    // top (counter-clockwise from above: A D C, A C B)
    nrm(i, j, 1, na); nrm(i + 1, j, 1, nb); nrm(i + 1, j + 1, 1, nc); nrm(i, j + 1, 1, nd);
    const ts = tcut[A] + tcut[B] + tcut[C] + tcut[D] >= 2 ? 0 : topSkin, bs = bcut[A] + bcut[B] + bcut[C] + bcut[D] >= 2 ? 0 : -1;
    push(gx[A], top[A], gz[A], na.x, na.y, na.z, ts, 0); push(gx[D], top[D], gz[D], nd.x, nd.y, nd.z, ts, 0); push(gx[C], top[C], gz[C], nc.x, nc.y, nc.z, ts, 0);
    push(gx[A], top[A], gz[A], na.x, na.y, na.z, ts, 0); push(gx[C], top[C], gz[C], nc.x, nc.y, nc.z, ts, 0); push(gx[B], top[B], gz[B], nb.x, nb.y, nb.z, ts, 0);
    // bottom
    nrm(i, j, 0, na); nrm(i + 1, j, 0, nb); nrm(i + 1, j + 1, 0, nc); nrm(i, j + 1, 0, nd);
    const bsk = bs === 0 ? 0 : botSkin;
    if (bsk === 0) { na.set(0, -1, 0); nb.set(0, -1, 0); nc.set(0, -1, 0); nd.set(0, -1, 0); }
    push(gx[A], bot[A], gz[A], na.x, na.y, na.z, bsk, 0); push(gx[C], bot[C], gz[C], nc.x, nc.y, nc.z, bsk, 0); push(gx[D], bot[D], gz[D], nd.x, nd.y, nd.z, bsk, 0);
    push(gx[A], bot[A], gz[A], na.x, na.y, na.z, bsk, 0); push(gx[B], bot[B], gz[B], nb.x, nb.y, nb.z, bsk, 0); push(gx[C], bot[C], gz[C], nc.x, nc.y, nc.z, bsk, 0);
  }
  // side walls along the four edges: (i, j) runs along the edge; outward normal n
  const wall = (pts: number[], n: [number, number, number], flesh: boolean) => {
    const skin = flesh ? 0 : 1;
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k], q = pts[k + 1];
      if (top[p] - bot[p] < 1e-5 && top[q] - bot[q] < 1e-5) continue;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        const ya0 = bot[p] + (top[p] - bot[p]) * (r / rows), ya1 = bot[p] + (top[p] - bot[p]) * ((r + 1) / rows);
        const yb0 = bot[q] + (top[q] - bot[q]) * (r / rows), yb1 = bot[q] + (top[q] - bot[q]) * ((r + 1) / rows);
        const e = flesh ? 0.9 : 0;
        // winding chosen so the face looks along n
        const v = [[gx[p], ya0, gz[p]], [gx[q], yb0, gz[q]], [gx[q], yb1, gz[q]], [gx[p], ya1, gz[p]]];
        const ex = v[1][0] - v[0][0], ez = v[1][2] - v[0][2];
        // edge direction x up (0,1,0) = (ez, 0, -ex)... pick the order whose normal matches n
        // the natural order (0 1 2, 0 2 3) faces (-ez, 0, ex)
        const natural = -ez * n[0] + ex * n[2] > 0;
        const ord = natural ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const o of ord) push(v[o][0], v[o][1], v[o][2], n[0], n[1], n[2], skin, e);
      }
    }
  };
  const row = (j: number) => Array.from({ length: nx + 1 }, (_, i) => at(i, j));
  const col = (i: number) => Array.from({ length: nz + 1 }, (_, j) => at(i, j));
  wall(row(0), [0, 0, -1], cut.z0); wall(row(nz), [0, 0, 1], cut.z1);
  wall(col(0), [-1, 0, 0], cut.x0); wall(col(nx), [1, 0, 0], cut.x1);
  if (!P.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(AP, 3));
  g.setAttribute('aSkin', new THREE.Float32BufferAttribute(SK, 1));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1));
  g.computeBoundingSphere();
  return { geo: g, c, vol, dx: Math.max(0.001, maxX - minX), dy: Math.max(0.001, hmax), dz: Math.max(0.001, maxZ - minZ) };
}

/** merge pieces with per-piece transforms into one geometry (attributes: position, normal, uv, aP, aSkin, aEdge) */
export function mergePieces(parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[], into?: THREE.BufferGeometry): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.geo.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), ap = new Float32Array(n * 3), sk = new Float32Array(n), ed = new Float32Array(n);
  let o = 0;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of parts) {
    const g = p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, A = g.attributes.aP, S = g.attributes.aSkin, E = g.attributes.aEdge;
    nm.getNormalMatrix(p.m);
    for (let i = 0; i < P.count; i++, o++) {
      v.fromBufferAttribute(P as THREE.BufferAttribute, i).applyMatrix4(p.m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      v.fromBufferAttribute(N as THREE.BufferAttribute, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
      uv[o * 2] = U ? U.getX(i) : 0; uv[o * 2 + 1] = U ? U.getY(i) : 0;
      ap[o * 3] = A ? A.getX(i) : 0; ap[o * 3 + 1] = A ? A.getY(i) : 0; ap[o * 3 + 2] = A ? A.getZ(i) : 0;
      sk[o] = S ? S.getX(i) : 1; ed[o] = E ? E.getX(i) : 0;
    }
  }
  const g = into ?? new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aP', new THREE.BufferAttribute(ap, 3));
  g.setAttribute('aSkin', new THREE.BufferAttribute(sk, 1));
  g.setAttribute('aEdge', new THREE.BufferAttribute(ed, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------- painted atlases
// 128 x 64: left square = the flesh ramp (u = normalised radius from the centre out to the skin, v = variation),
// right square = the skin. Raw and cooked.
type PAtlas = { raw: THREE.Texture; cooked: THREE.Texture };
const patl = new Map<string, PAtlas>();

function atlas2(flesh: (u: number, v: number, i: number) => RGB, skin: (x: number, y: number, i: number) => RGB): THREE.Texture {
  const p = new Pix(128, 64);
  p.each((x, y) => (x < 64 ? flesh(x / 63, y / 63, y * 64 + x) : skin(x - 64, y, y * 64 + (x - 64))));
  const t = p.tex({ repeat: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function paintProduce(kind: ProduceKind): PAtlas {
  const have = patl.get(kind);
  if (have) return have;
  const n = fbm(64, 64, 16, kind.length * 11 + 3, 3), sp = speck(64, 64, kind.length * 7 + 1), vn = vnoise(64, 64, 6, kind.length * 5);
  let out: PAtlas;
  switch (kind) {
    case 'onion': case 'scallion': {
      const green = kind === 'scallion';
      // concentric layers: thick white-cream flesh with thin translucent lines between, a pale green heart
      const layer = (green ? ['#e8f0d8', '#dce8c4', '#cfe0b4'] : ['#f2ecdc', '#ece4cc', '#e4dabc']).map(hex);
      const line = hex(green ? '#9ab878' : '#c8c49a'), heart = hex(green ? '#a8c880' : '#d8dcae');
      const layerC = ['#e8c278', '#dcae5c', '#cc9848'].map(hex), lineC = hex('#a86c2c'), heartC = hex('#e0b860');
      const fl = (raw: boolean) => (u: number, v: number, i: number): RGB => {
        const r = u * 1.02, k = (r * 7.5) % 1;
        if (r < 0.12) return raw ? heart : heartC;
        if (k < 0.12) return raw ? line : lineC;
        return ramp(raw ? layer : layerC, n[i] * 0.6 + sp[i] * 0.4);
      };
      const skinR = (x: number, y: number, i: number): RGB => {
        const vein = Math.abs(Math.sin(x * 0.7 + vn[i] * 3)) > 0.92;
        const base = green ? ramp(['#5a8a3c', '#6a9c44', '#7cae50'].map(hex), n[i]) : ramp(['#ece2c4', '#f4ecd4', '#faf4e2'].map(hex), n[i] * 0.7 + sp[i] * 0.3);
        void y;
        return vein ? mul(base, 0.9) : base;
      };
      const skinC = (x: number, y: number, i: number): RGB => mix(skinR(x, y, i), ramp(['#b06c24', '#c88434', '#d8a048'].map(hex), n[i]), 0.75);
      out = { raw: atlas2(fl(true), skinR), cooked: atlas2(fl(false), skinC) };
      break;
    }
    case 'potato': {
      const fR = ['#ecdca0', '#f2e4ae', '#f6ecbe'].map(hex), fC = ['#d8a048', '#e4b45c', '#eec474'].map(hex);
      const skin = ['#a88452', '#b8945e', '#c4a26a'].map(hex), skinCk = ['#7a4e22', '#8c5c2a', '#a06c34'].map(hex);
      out = {
        raw: atlas2((u, _v, i) => (u > 0.95 ? hex('#b8945e') : ramp(fR, n[i] * 0.7 + sp[i] * 0.3)), (_x, _y, i) => (sp[i] > 0.96 ? hex('#6a4a2a') : ramp(skin, n[i] * 0.7 + sp[i] * 0.3))),
        cooked: atlas2((u, _v, i) => (u > 0.95 ? hex('#7a4e22') : ramp(fC, n[i] * 0.7 + sp[i] * 0.3)), (_x, _y, i) => ramp(skinCk, n[i] * 0.7 + sp[i] * 0.3)),
      };
      break;
    }
    case 'carrot': {
      const core = ['#f2a040', '#f6b050'].map(hex), outer = ['#e87a1c', '#ee8828', '#f29434'].map(hex);
      const coreC = ['#d8782a', '#e08834'].map(hex), outerC = ['#b85414', '#c4601c', '#cc6a24'].map(hex);
      out = {
        raw: atlas2((u, _v, i) => (Math.abs(u - 0.5) < 0.04 ? hex('#f8c070') : ramp(u < 0.5 ? core : outer, n[i] * 0.6 + sp[i] * 0.4)), (x, _y, i) => (x % 9 === 0 ? hex('#c8641a') : ramp(outer, n[i] * 0.7 + sp[i] * 0.3))),
        cooked: atlas2((u, _v, i) => ramp(u < 0.5 ? coreC : outerC, n[i] * 0.6 + sp[i] * 0.4), (x, _y, i) => (x % 9 === 0 ? hex('#8a3c10') : ramp(outerC, n[i] * 0.7 + sp[i] * 0.3))),
      };
      break;
    }
    case 'garlic': {
      const f = ['#f4eed6', '#f8f2e0', '#fcf8ec'].map(hex), fC = ['#e8c070', '#f0cc80', '#f4d890'].map(hex);
      out = {
        raw: atlas2((_u, _v, i) => ramp(f, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => ramp(['#efe6cc', '#f4ecd6', '#f8f2e2'].map(hex), n[i])),
        cooked: atlas2((_u, _v, i) => ramp(fC, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => ramp(['#d8a048', '#e4b45c', '#eec474'].map(hex), n[i])),
      };
      break;
    }
    case 'meat': {
      const f = ['#6a1c1c', '#7e2624', '#92302c', '#a63e36'].map(hex), fC = ['#4a2616', '#5c321e', '#6e3e26', '#824c30'].map(hex);
      out = {
        raw: atlas2((u, v, i) => (vn[i] > 0.8 ? hex('#e0c8b8') : ramp(f, n[i] * 0.7 + sp[i] * 0.3 + (u + v) * 0)), (_x, _y, i) => (vn[i] > 0.82 ? hex('#d8c0b0') : ramp(f, n[i] * 0.5 + sp[i] * 0.3))),
        cooked: atlas2((_u, _v, i) => (vn[i] > 0.8 ? hex('#c89a6a') : ramp(fC, n[i] * 0.7 + sp[i] * 0.3)), (_x, _y, i) => ramp(fC, n[i] * 0.5 + sp[i] * 0.3)),
      };
      break;
    }
    case 'beef': {
      const f = ['#9a2a2a', '#b23634', '#c44a44'].map(hex), fC = ['#5c3420', '#6c4028', '#7c4c30'].map(hex);
      out = {
        raw: atlas2((_u, _v, i) => (sp[i] > 0.8 ? hex('#ecd8cc') : ramp(f, n[i] * 0.5 + sp[i] * 0.5)), (_x, _y, i) => (sp[i] > 0.8 ? hex('#ecd8cc') : ramp(f, n[i] * 0.5 + sp[i] * 0.5))),
        cooked: atlas2((_u, _v, i) => (sp[i] > 0.85 ? hex('#a87a54') : ramp(fC, n[i] * 0.5 + sp[i] * 0.5)), (_x, _y, i) => ramp(fC, n[i] * 0.5 + sp[i] * 0.5)),
      };
      break;
    }
    case 'cheese': {
      const f = ['#e89a34', '#eea640', '#f2b24c'].map(hex), fC = ['#f0b84c', '#f4c460', '#f8d27a'].map(hex);
      out = {
        raw: atlas2((_u, _v, i) => ramp(f, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => ramp(f, n[i] * 0.5 + sp[i] * 0.3)),
        cooked: atlas2((_u, _v, i) => ramp(fC, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => ramp(fC, n[i])),
      };
      break;
    }
    case 'chanterelle': default: {
      const f = ['#f0c060', '#f4cc70', '#f8d884'].map(hex), fC = ['#c88a34', '#d49a40', '#e0aa50'].map(hex);
      out = {
        raw: atlas2((_u, _v, i) => ramp(f, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => ramp(['#e8a838', '#f0b848', '#f4c458'].map(hex), n[i])),
        cooked: atlas2((_u, _v, i) => ramp(fC, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => ramp(['#a86c24', '#b87c2c', '#c88c38'].map(hex), n[i])),
      };
    }
  }
  patl.set(kind, out);
  return out;
}

let noiseT: THREE.Texture | null = null;
function noiseTex(): THREE.Texture {
  if (noiseT) return noiseT;
  const n = fbm(64, 64, 16, 177, 3), s = speck(64, 64, 178);
  noiseT = new Pix(64, 64).each((_x, _y, i) => { const v = Math.round((n[i] * 0.7 + s[i] * 0.3) * 255); return [v, v, v]; }).tex({ repeat: true, srgb: false });
  return noiseT;
}

export interface ProduceMat extends THREE.MeshStandardMaterial {
  userData: { uTop: { value: number }; uBot: { value: number }; uOil: { value: number }; uMelt: { value: number } };
}

/** cut produce: rings / core / skin line on cut faces (from aP), the painted skin elsewhere, doneness per side */
export function produceMat(kind: ProduceKind): ProduceMat {
  const a = paintProduce(kind);
  const m = new THREE.MeshStandardMaterial({ map: a.raw, roughness: kind === 'cheese' ? 0.5 : 0.62, metalness: 0 }) as ProduceMat;
  m.userData = { uTop: { value: 0 }, uBot: { value: 0 }, uOil: { value: 0 }, uMelt: { value: 0 } };
  const U = m.userData;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTop: U.uTop, uBot: U.uBot, uOil: U.uOil, uMelt: U.uMelt, uCooked: { value: a.cooked }, uNoise: { value: noiseTex() } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aP; attribute float aSkin; attribute float aEdge; varying vec3 vP; varying float vSkin; varying float vEdge; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = aP; vSkin = aSkin; vEdge = aEdge; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTop; uniform float uBot; uniform float uOil; uniform float uMelt; uniform sampler2D uCooked; uniform sampler2D uNoise;
        varying vec3 vP; varying float vSkin; varying float vEdge; varying vec3 vObjN;`)
      .replace('#include <map_fragment>', `
        float rr = clamp(length(vP), 0.0, 0.999);
        // pixel-snap the radius so the rings stay crisp
        rr = floor(rr * 40.0) / 40.0;
        vec2 fuv = vec2(0.008 + rr * 0.484, 0.06 + fract(dot(floor(vP * 18.0), vec3(0.131, 0.371, 0.217))) * 0.88);
        vec2 suv = vMapUv;
        vec2 puv = vSkin > 0.5 ? suv : fuv;
        vec4 rawC = texture2D(map, puv);
        vec4 ckC = texture2D(uCooked, puv);
        float dn = mix(uBot, uTop, smoothstep(-0.35, 0.35, vObjN.y)) + vEdge * 0.25 * max(uTop, uBot);
        float c1 = smoothstep(0.2, 0.8, dn);
        c1 = floor(c1 * 6.0 + 0.5) / 6.0;
        diffuseColor.rgb *= mix(rawC.rgb, ckC.rgb, c1);
        float nz = texture2D(uNoise, puv * 2.0 + vP.xz * 0.5).r;
        float br = smoothstep(0.98, 1.4, dn + (nz - 0.5) * 0.25);
        br = floor(br * 4.0 + 0.5) / 4.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.36, 0.24), br);
        float ch = step(nz, (dn - 1.3) * 1.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.035, 0.03), ch);
        float doneK = c1;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, max(uOil, uMelt) * 0.8);`);
  };
  m.customProgramCacheKey = () => 'produce';
  return m;
}

/** the papery onion / garlic skin (a shell over the whole bulb until it's peeled) */
let paperMat: THREE.MeshStandardMaterial | null = null;
export function papery(): THREE.MeshStandardMaterial {
  if (paperMat) return paperMat;
  const n = fbm(64, 64, 8, 191, 3), vn = vnoise(64, 64, 4, 192);
  const p = new Pix(64, 64).each((x, _y, i) => (Math.abs(Math.sin(x * 0.6 + vn[i] * 3)) > 0.9 ? hex('#7a4618') : ramp(['#a8662a', '#bc7a36', '#cc8c44', '#dca460'].map(hex), n[i])));
  paperMat = new THREE.MeshStandardMaterial({ map: p.tex(), roughness: 0.85, side: THREE.DoubleSide });
  return paperMat;
}

// ---------------------------------------------------------------------------------------------- produce on the board
export interface Block {
  shape: Shape;
  /** position on the produce frame (x along the board, z across it) */
  x: number; z: number;
  /** quarter turns about Y */
  turn: number;
  xs: number[]; zs: number[];
  cells: Cell[];
  mesh: THREE.Mesh | null;
  flatSkin: boolean;
}

export interface ProduceDef { shape: Shape; peel: boolean; halve: boolean; units: number; key: string; kind: ProduceKind; name: string }

export const PRODUCE: Record<string, ProduceDef> = {
  onions: { shape: { kind: 'ell', a: 0.04, b: 0.038, c: 0.04 }, peel: true, halve: true, units: 1, key: 'onion', kind: 'onion', name: 'onion' },
  potatoes: { shape: { kind: 'ell', a: 0.052, b: 0.03, c: 0.036 }, peel: false, halve: false, units: 1, key: 'potato', kind: 'potato', name: 'potato' },
  carrots: { shape: { kind: 'cyl', a: 0.085, b: 0, c: 0.015, r0: 0.004, r1: 0.0145 }, peel: false, halve: false, units: 1, key: 'carrot', kind: 'carrot', name: 'carrot' },
  garlic: { shape: { kind: 'dome', a: 0.014, b: 0.011, c: 0.0085 }, peel: true, halve: false, units: 1, key: 'garlic', kind: 'garlic', name: 'garlic clove' },
  wild_onion: { shape: { kind: 'cyl', a: 0.07, b: 0, c: 0.006, r0: 0.0035, r1: 0.0055 }, peel: false, halve: false, units: 1, key: 'onion', kind: 'scallion', name: 'wild onion' },
  cheese: { shape: { kind: 'box', a: 0.055, b: 0.042, c: 0.032 }, peel: false, halve: false, units: 1, key: 'cheese', kind: 'cheese', name: 'cheddar' },
};

/** a size class for the pieces (what a recipe means by "diced") */
export function sizeClass(dx: number, dy: number, dz: number): 'minced' | 'fine' | 'diced' | 'chunks' | 'slices' | 'big' {
  const mx = Math.max(dx, dy, dz), mn = Math.min(dx, dy, dz);
  if (mx <= 0.0055) return 'minced';
  if (mx <= 0.011) return 'fine';
  if (mn <= 0.0065 && mx > 0.016) return 'slices';
  if (mx <= 0.02) return 'diced';
  if (mx <= 0.032) return 'chunks';
  return 'big';
}

export class Produce {
  readonly obj = new THREE.Group();
  readonly mat: ProduceMat;
  blocks: Block[] = [];
  /** 0..1 peeled; a shell of papery skin until 1 */
  peel = 0;
  skin: THREE.Mesh | null = null;
  halved = false;
  cuts = 0;
  /** doneness carried over (a strip of meat already seared before it was cubed) */
  done = { a: 0, b: 0 };
  /** where it lies on the board (board frame x, z) */
  local = new THREE.Vector2();
  /** an invisible box over the whole produce for the pointer (the halves have a gap between them) */
  readonly hit: THREE.Mesh;
  constructor(readonly id: string, readonly def: ProduceDef, shape?: Shape) {
    this.mat = produceMat(def.kind);
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.userData.pickProxy = true;
    this.obj.add(this.hit);
    const s = shape ?? def.shape;
    this.blocks.push({ shape: s, x: 0, z: 0, turn: 0, xs: [], zs: [], cells: [], mesh: null, flatSkin: def.kind === 'garlic' });
    if (def.peel) {
      this.peel = 0;
      const g = s.kind === 'dome' ? new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(1, 14, 10);
      g.scale(s.a * 1.05, s.b * 1.05, s.c * 1.05);
      if (s.kind === 'ell') g.translate(0, s.b, 0);
      // the dome's shell is a clove on its side: rotate it so the rounded back is up
      this.skin = new THREE.Mesh(g, papery());
      this.skin.castShadow = true;
      this.obj.add(this.skin);
    } else this.peel = 1;
    this.rebuild();
  }
  get key(): string { return this.def.key; }
  get needsPeel(): boolean { return this.def.peel && this.peel < 1; }
  get whole(): boolean { return this.cuts === 0; }

  /** board-frame x extent (for knife placement) */
  extent(): { x0: number; x1: number; z0: number; z1: number } {
    let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
    for (const b of this.blocks) {
      const odd = b.turn % 2 === 1, ex = odd ? extentZ(b.shape) : extentX(b.shape), ez = odd ? extentX(b.shape) : extentZ(b.shape);
      x0 = Math.min(x0, b.x - ex); x1 = Math.max(x1, b.x + ex); z0 = Math.min(z0, b.z - ez); z1 = Math.max(z1, b.z + ez);
    }
    return { x0, x1, z0, z1 };
  }

  /** knife down at board-frame x (relative to the produce). Returns what happened */
  cut(X: number): 'halved' | 'cut' | 'miss' | 'peel' {
    if (this.needsPeel) return 'peel';
    if (this.def.halve && !this.halved) {
      // the first cut halves it through the root; the halves lie down on their cut faces
      const s = this.blocks[0].shape;
      const d: Shape = { kind: 'dome', a: s.a, b: s.c, c: s.b * 0.98 };
      this.disposeMeshes();
      this.blocks = [-1, 1].map((k) => ({ shape: d, x: 0, z: k * (s.b + 0.006), turn: 0, xs: [], zs: [], cells: [], mesh: null, flatSkin: false }));
      this.halved = true; this.cuts++;
      this.rebuild();
      return 'halved';
    }
    let hit = false;
    for (const b of this.blocks) {
      const odd = b.turn % 2 === 1;
      const sgn = b.turn === 2 || b.turn === 3 ? -1 : 1;
      // board x maps to block x (turn 0/2) or block z (turn 1/3)
      const lx = (X - b.x) * sgn;
      const ext = odd ? extentZ(b.shape) : extentX(b.shape);
      if (Math.abs(lx) >= ext * 0.97) continue;
      const list = odd ? b.zs : b.xs;
      if (list.some((q) => Math.abs(q - lx) < 0.0018)) continue;
      list.push(lx); list.sort((p, q) => p - q);
      hit = true;
    }
    if (!hit) return 'miss';
    this.cuts++;
    this.rebuild();
    return 'cut';
  }

  /** turn it a quarter on the board (to cross-cut) */
  turn(): void {
    for (const b of this.blocks) {
      b.turn = (b.turn + 1) % 4;
      const x = b.x, z = b.z;
      b.x = z; b.z = -x;
    }
    this.rebuild();
  }

  private disposeMeshes(): void {
    for (const b of this.blocks) {
      if (b.mesh) { b.mesh.geometry.dispose(); this.obj.remove(b.mesh); b.mesh = null; }
      for (const c of b.cells) c.geo.dispose();
      b.cells = [];
    }
  }

  /** rebuild every block's cells and its merged mesh (cut gaps opened a little) */
  rebuild(): void {
    this.disposeMeshes();
    for (const b of this.blocks) {
      const s = b.shape, ex = s.kind === 'cyl' ? s.a : extentX(s), ez = extentZ(s);
      const xs = [-ex * 1.001, ...b.xs, ex * 1.001], zs = [-ez * 1.001, ...b.zs, ez * 1.001];
      const parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
      const ang = (b.turn * Math.PI) / 2;
      const rot = new THREE.Matrix4().makeRotationY(ang);
      // cut both ways and it falls apart into layers too (the onion's own layers, the cook's flat cuts): dice
      let ys = [-1, 99];
      if (b.xs.length && b.zs.length) {
        const sp = (meanGap(b.xs, ex) + meanGap(b.zs, ez)) / 2, H = shapeHeight(s);
        const n = Math.max(1, Math.min(10, Math.round(H / Math.max(0.0035, sp * 1.05))));
        ys = Array.from({ length: n + 1 }, (_, k) => (k * H) / n);
        ys[0] = -1; ys[n] = 99;
      }
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) for (let k = 0; k < ys.length - 1; k++) {
        const cell = cellGeo(s, xs[i], xs[i + 1], zs[j], zs[j + 1], { x0: i > 0, x1: i < xs.length - 2, z0: j > 0, z1: j < zs.length - 2 }, ys.length > 2 ? 0.006 : 0.0045, b.flatSkin, ys[k], ys[k + 1]);
        if (!cell) continue;
        b.cells.push(cell);
        // open the cut gaps: each piece sits a hair away from its neighbours
        const gap = new THREE.Vector3(i - (xs.length - 2) / 2, 0, j - (zs.length - 2) / 2).multiplyScalar(0.0016);
        const m = new THREE.Matrix4().makeTranslation(b.x, 0, b.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(cell.c.x + gap.x, cell.c.y, cell.c.z + gap.z));
        parts.push({ geo: cell.geo, m });
      }
      if (!parts.length) continue;
      b.mesh = new THREE.Mesh(mergePieces(parts), this.mat);
      b.mesh.castShadow = true; b.mesh.receiveShadow = true;
      this.obj.add(b.mesh);
    }
    if (this.skin) this.skin.visible = this.peel < 1;
    const e = this.extent();
    let h = 0.01;
    for (const b of this.blocks) h = Math.max(h, shapeHeight(b.shape));
    this.hit.scale.set(e.x1 - e.x0 + 0.02, h + 0.01, e.z1 - e.z0 + 0.02);
    this.hit.position.set((e.x0 + e.x1) / 2, (h + 0.01) / 2, (e.z0 + e.z1) / 2);
  }

  /** all the pieces (for a pile) */
  pieces(): Cell[] { return this.blocks.flatMap((b) => b.cells); }

  /** volume-weighted mean piece extents */
  stats(): { n: number; dx: number; dy: number; dz: number; cls: ReturnType<typeof sizeClass>; min: number } {
    const cs = this.pieces();
    let w = 0, dx = 0, dy = 0, dz = 0;
    for (const c of cs) { w += c.vol; dx += c.dx * c.vol; dy += c.dy * c.vol; dz += c.dz * c.vol; }
    w = w || 1;
    dx /= w; dy /= w; dz /= w;
    return { n: cs.length, dx, dy, dz, cls: sizeClass(dx, dy, dz), min: Math.min(dx, dy, dz) };
  }

  dispose(): void { this.disposeMeshes(); this.obj.removeFromParent(); }
}

// ---------------------------------------------------------------------------------------------- piles
export interface Bit { geo: THREE.BufferGeometry; dx: number; dy: number; dz: number; vol: number; own?: boolean }

/**
 * Many small pieces of one ingredient as one mesh: diced onion in the skillet, cubed venison in the stew, ground
 * beef crumbles. Doneness is per pile (the bottom browns, a stir turns the pieces and mixes the sides).
 */
export class Pile {
  readonly obj = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly mat: ProduceMat;
  /** doneness of the up-facing and down-facing sides */
  a = 0; b = 0;
  /** soaked-up fat (greasy), 0..1 */
  greasy = 0;
  /** went into hot fat (seared) */
  seared = false;
  /** reached golden in fat */
  browned = false;
  /** cheese: melted into the sauce 0..1 */
  melt = 0;
  /** recipe units (1 onion, 2 potatoes) */
  units: number;
  cls: ReturnType<typeof sizeClass>;
  /** mean smallest dimension (m): cooking speed */
  min: number;
  spread = 1;
  calls = new Set<string>();
  constructor(readonly key: string, readonly kind: ProduceKind, readonly bits: Bit[], units: number, mat?: ProduceMat) {
    this.mat = mat ?? produceMat(kind);
    this.units = units;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.obj.add(this.mesh);
    this.obj.name = `pile_${key}`;
    let w = 0, dx = 0, dy = 0, dz = 0;
    for (const b of bits) { w += b.vol; dx += b.dx * b.vol; dy += b.dy * b.vol; dz += b.dz * b.vol; }
    w = w || 1;
    this.cls = sizeClass(dx / w, dy / w, dz / w);
    this.min = Math.min(dx, dy, dz) / w;
  }
  get done(): number { return (this.a + this.b) / 2; }
  get worst(): number { return Math.max(this.a, this.b); }
  setDone(): void { this.mat.userData.uTop.value = this.a; this.mat.userData.uBot.value = this.b; }

  /** scatter the pieces over a disc of radius r (y up from 0); stacked a little when crowded */
  layout(r: number, seed = Math.random() * 1000, heap = 0): void {
    const R = new Rnd(Math.floor(seed));
    const parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];
    const n = this.bits.length;
    const totalA = this.bits.reduce((s, b) => s + b.dx * b.dz, 0);
    const layers = Math.max(1, totalA / (Math.PI * r * r * 0.75));
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const b = this.bits[i];
      const a = R.next() * Math.PI * 2, d = Math.sqrt(R.next()) * Math.max(0.002, r - Math.max(b.dx, b.dz) * 0.4);
      const layer = Math.floor(R.next() * layers);
      const mn = Math.min(b.dx, b.dy, b.dz), mx = Math.max(b.dx, b.dy, b.dz);
      let rest = b.dy;
      if (mx / mn < 2.2) {
        // a chunky die tumbles any which way
        e.set(R.next() * 6.28, R.next() * 6.28, R.next() * 6.28);
        rest = (b.dx + b.dy + b.dz) / 3;
      } else if (b.dx === mn && b.dx < 0.7 * b.dy) { e.set(0, R.next() * 6.28, Math.PI / 2 * (R.next() < 0.5 ? 1 : -1) + (R.next() - 0.5) * 0.3); rest = b.dx; }
      else if (b.dz === mn && b.dz < 0.7 * b.dy) { e.set(Math.PI / 2 * (R.next() < 0.5 ? 1 : -1) + (R.next() - 0.5) * 0.3, R.next() * 6.28, 0); rest = b.dz; }
      else e.set((R.next() - 0.5) * 0.3, R.next() * Math.PI * 2, (R.next() - 0.5) * 0.3);
      const y = rest / 2 + layer * rest * 0.8 + heap * (1 - d / Math.max(r, 1e-3)) * 0.02;
      q.setFromEuler(e);
      parts.push({ geo: b.geo, m: new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d), q, new THREE.Vector3(1, 1, 1)) });
    }
    const old = this.mesh.geometry;
    this.mesh.geometry = mergePieces(parts);
    old.dispose();
    this.spread = r;
  }

  /** a stir or a toss: the pieces turn over, the sides even out */
  stir(k: number): void {
    const m = (this.a + this.b) / 2;
    this.a += (m - this.a) * k; this.b += (m - this.b) * k;
    if (k > 0.5) { const t = this.a; this.a = this.b; this.b = t; }
    this.setDone();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const b of this.bits) if (b.own) b.geo.dispose();
    this.obj.removeFromParent();
  }
}

/** small deterministic random */
export class Rnd {
  private s: number;
  constructor(seed: number) { this.s = (seed * 2654435761) >>> 0 || 1; }
  next(): number { let t = (this.s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
}

/** ground beef crumbles (or any small lumps): n blobs cut from a rough shape */
export function crumbleBits(n: number, size: number, seed: number): Bit[] {
  const out: Bit[] = [];
  const R = new Rnd(seed);
  for (let i = 0; i < n; i++) {
    const s: Shape = { kind: 'ell', a: size * (0.6 + R.next() * 0.6), b: size * (0.35 + R.next() * 0.25), c: size * (0.5 + R.next() * 0.5) };
    const c = cellGeo(s, -s.a, s.a, -s.c, s.c, { x0: false, x1: false, z0: false, z1: false }, Math.max(0.002, size * 0.5));
    if (c) out.push({ geo: c.geo, dx: c.dx, dy: c.dy, dz: c.dz, vol: c.vol, own: true });
  }
  return out;
}

/** pieces of a produce as pile bits (geometry stays owned by the pile) */
export function bitsOf(p: Produce): Bit[] {
  const out: Bit[] = [];
  for (const c of p.pieces()) out.push({ geo: c.geo, dx: c.dx, dy: c.dy, dz: c.dz, vol: c.vol, own: true });
  // the pile owns the geometry now: forget it here without disposing
  for (const b of p.blocks) { b.cells = []; if (b.mesh) { b.mesh.geometry.dispose(); p.obj.remove(b.mesh); b.mesh = null; } }
  return out;
}

void mul;
