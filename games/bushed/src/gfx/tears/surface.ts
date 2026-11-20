// The skinned surface a tear runs on: a patch of any THREE.SkinnedMesh (the face), welded across its UV seams into one
// connected surface with triangle adjacency, skinned on the CPU exactly as the GPU skins it (bone.matrixWorld x
// boneInverse, the bind matrices), only for the vertices a drop is on, once per frame, so a drop is carried along the
// actual deforming skin and walked across triangle edges. Nothing here knows which creature it is.
//
//   const patch = SkinPatch.from(mesh, { box, seeds: [tearL, tearR] });   // bind-pose (mesh-local) positions
//   patch.begin(mesh);                          // once per frame, after the pose is set on the bones
//   patch.point(t, b1, b2, out);                // world position of a surface point
//   patch.walk(s, d, v);                        // move a surface point by a world displacement (tangent)
import * as THREE from 'three';

export interface PatchOpts {
  /** keep triangles whose vertices all carry one of these aReg region tags (when the geometry has aReg) */
  regs?: number[];
  /** and lie inside this bind-pose (mesh-local) box */
  box?: { min: [number, number, number]; max: [number, number, number] };
  /** keep only the connected pieces of surface at these points: for each, the biggest piece within `seedR` of it (the
   *  skull, not an eyelid or a wart that happens to be nearer) */
  seeds?: THREE.Vector3[];
  seedR?: number;
}

/** a point on the patch: triangle, barycentric weights of its 2nd and 3rd corners */
export interface SurfPt { t: number; b1: number; b2: number }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _n2 = new THREE.Vector3();

export class SkinPatch {
  /** welded vertices: rest (bind-pose, mesh-local) position and normal, 4 bone indices and weights */
  readonly nv: number;
  readonly rest: Float32Array;
  readonly restN: Float32Array;
  readonly sIdx: Uint16Array;
  readonly sW: Float32Array;
  /** triangles (welded vertex ids) and their neighbours across the edge opposite each corner (-1: open edge) */
  readonly nt: number;
  readonly tri: Uint32Array;
  readonly adj: Int32Array;
  /** skinned world positions and normals (valid where stamp == frame) */
  readonly W: Float32Array;
  readonly WN: Float32Array;
  private stamp: Uint32Array;
  private frame = 1;
  /** bones the patch is skinned to, and their world 3x4 matrices this frame (row-major, 12 per used bone) */
  private boneOf: Int16Array;
  readonly usedBones: number[];
  private M: Float32Array;
  /** total skin weight per used bone (the bone that carries the patch most) */
  readonly boneWeight: Float32Array;

  private constructor(rest: Float32Array, restN: Float32Array, sIdx: Uint16Array, sW: Float32Array, tri: Uint32Array) {
    this.nv = rest.length / 3; this.nt = tri.length / 3;
    this.rest = rest; this.restN = restN; this.sIdx = sIdx; this.sW = sW; this.tri = tri;
    this.adj = new Int32Array(this.nt * 3).fill(-1);
    const edges = new Map<number, number>();
    const N = this.nv;
    for (let t = 0; t < this.nt; t++) for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + (k + 1) % 3], b = tri[t * 3 + (k + 2) % 3];
      const key = Math.min(a, b) * N + Math.max(a, b);
      const o = edges.get(key);
      if (o === undefined) edges.set(key, t * 3 + k);
      else if (o >= 0) { const ot = Math.floor(o / 3); this.adj[t * 3 + k] = ot; this.adj[o] = t; edges.set(key, -1); }
    }
    this.W = new Float32Array(this.nv * 3); this.WN = new Float32Array(this.nv * 3); this.stamp = new Uint32Array(this.nv);
    const used = new Set<number>();
    for (let i = 0; i < this.nv * 4; i++) if (sW[i] > 0) used.add(sIdx[i]);
    this.usedBones = [...used].sort((a, b) => a - b);
    this.boneOf = new Int16Array(Math.max(...this.usedBones, 0) + 1).fill(-1);
    this.usedBones.forEach((b, i) => { this.boneOf[b] = i; });
    this.M = new Float32Array(this.usedBones.length * 12);
    this.boneWeight = new Float32Array(this.usedBones.length);
    for (let i = 0; i < this.nv * 4; i++) if (sW[i] > 0) this.boneWeight[this.boneOf[sIdx[i]]] += sW[i];
  }

  /** cut a patch out of a skinned mesh's geometry (position, normal, skinIndex, skinWeight, index; aReg optional) */
  static from(mesh: THREE.SkinnedMesh, o: PatchOpts = {}): SkinPatch {
    const geo = mesh.geometry;
    const P = geo.attributes.position.array as ArrayLike<number>, Nn = geo.attributes.normal.array as ArrayLike<number>;
    const SI = geo.attributes.skinIndex.array as ArrayLike<number>, SW = geo.attributes.skinWeight.array as ArrayLike<number>;
    const REG = geo.attributes.aReg?.array as ArrayLike<number> | undefined;
    const I = geo.index ? geo.index.array as ArrayLike<number> : Uint32Array.from({ length: geo.attributes.position.count }, (_, i) => i);
    const ok = (v: number) => {
      if (o.regs && REG && !o.regs.includes(REG[v])) return false;
      if (o.box) { for (let k = 0; k < 3; k++) { const x = P[v * 3 + k]; if (x < o.box.min[k] || x > o.box.max[k]) return false; } }
      return true;
    };
    // weld the seams: vertices at the same place become one
    const weld = new Map<string, number>(), map = new Map<number, number>();
    const wp: number[] = [], wn: number[] = [], wi: number[] = [], ww: number[] = [], wc: number[] = [];
    const id = (v: number) => {
      let w = map.get(v); if (w !== undefined) return w;
      const key = Math.round(P[v * 3] * 2e4) + ',' + Math.round(P[v * 3 + 1] * 2e4) + ',' + Math.round(P[v * 3 + 2] * 2e4);
      w = weld.get(key);
      if (w === undefined) {
        w = wp.length / 3; weld.set(key, w);
        wp.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); wn.push(0, 0, 0); wc.push(0);
        for (let k = 0; k < 4; k++) { wi.push(SI[v * 4 + k]); ww.push(SW[v * 4 + k]); }
      }
      wn[w * 3] += Nn[v * 3]; wn[w * 3 + 1] += Nn[v * 3 + 1]; wn[w * 3 + 2] += Nn[v * 3 + 2]; wc[w]++;
      map.set(v, w); return w;
    };
    const tris: number[] = [];
    for (let f = 0; f < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2];
      if (!ok(a) || !ok(b) || !ok(c)) continue;
      const A = id(a), B = id(b), C = id(c);
      if (A === B || B === C || A === C) continue;
      tris.push(A, B, C);
    }
    let patch = new SkinPatch(new Float32Array(wp), normalise(new Float32Array(wn)), new Uint16Array(wi), new Float32Array(ww), new Uint32Array(tris));
    if (o.seeds?.length) {
      // keep the connected pieces nearest the seeds
      const comp = new Int32Array(patch.nt).fill(-1);
      let nc = 0;
      for (let t = 0; t < patch.nt; t++) {
        if (comp[t] >= 0) continue;
        const st = [t]; comp[t] = nc;
        while (st.length) { const u = st.pop()!; for (let k = 0; k < 3; k++) { const w = patch.adj[u * 3 + k]; if (w >= 0 && comp[w] < 0) { comp[w] = nc; st.push(w); } } }
        nc++;
      }
      // per seed: the biggest piece with a triangle near it
      const size = new Int32Array(nc); for (let t = 0; t < patch.nt; t++) size[comp[t]]++;
      const keep = new Set<number>(), R2 = (o.seedR ?? 0.012) ** 2;
      for (const s of o.seeds) {
        let best = comp[patch.nearestRest(s)];
        for (let t = 0; t < patch.nt; t++) {
          let x = 0, y = 0, z = 0;
          for (let k = 0; k < 3; k++) { const v = patch.tri[t * 3 + k]; x += patch.rest[v * 3]; y += patch.rest[v * 3 + 1]; z += patch.rest[v * 3 + 2]; }
          if ((x / 3 - s.x) ** 2 + (y / 3 - s.y) ** 2 + (z / 3 - s.z) ** 2 < R2 && size[comp[t]] > size[best]) best = comp[t];
        }
        keep.add(best);
      }
      const kt: number[] = [], vmap = new Int32Array(patch.nv).fill(-1), kp: number[] = [], kn: number[] = [], ki: number[] = [], kw: number[] = [];
      for (let t = 0; t < patch.nt; t++) {
        if (!keep.has(comp[t])) continue;
        for (let k = 0; k < 3; k++) {
          const v = patch.tri[t * 3 + k];
          if (vmap[v] < 0) {
            vmap[v] = kp.length / 3;
            kp.push(patch.rest[v * 3], patch.rest[v * 3 + 1], patch.rest[v * 3 + 2]); kn.push(patch.restN[v * 3], patch.restN[v * 3 + 1], patch.restN[v * 3 + 2]);
            for (let j = 0; j < 4; j++) { ki.push(patch.sIdx[v * 4 + j]); kw.push(patch.sW[v * 4 + j]); }
          }
          kt.push(vmap[v]);
        }
      }
      patch = new SkinPatch(new Float32Array(kp), new Float32Array(kn), new Uint16Array(ki), new Float32Array(kw), new Uint32Array(kt));
    }
    return patch;
  }

  /** the patch's bind-pose bounding box */
  bounds(out = new THREE.Box3()): THREE.Box3 { out.makeEmpty(); for (let v = 0; v < this.nv; v++) out.expandByPoint(_a.fromArray(this.rest, v * 3)); return out; }
  /** the triangle whose centre (rest pose) is nearest a bind-pose point */
  nearestRest(p: THREE.Vector3): number {
    let best = 0, bd = Infinity;
    for (let t = 0; t < this.nt; t++) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { const v = this.tri[t * 3 + k]; x += this.rest[v * 3]; y += this.rest[v * 3 + 1]; z += this.rest[v * 3 + 2]; }
      const d = (x / 3 - p.x) ** 2 + (y / 3 - p.y) ** 2 + (z / 3 - p.z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  /** the surface point (rest pose) nearest a bind-pose point: projected into the nearest triangles */
  closestRest(p: THREE.Vector3, out: SurfPt): SurfPt {
    let bd = Infinity;
    for (let t = 0; t < this.nt; t++) {
      const i0 = this.tri[t * 3], i1 = this.tri[t * 3 + 1], i2 = this.tri[t * 3 + 2];
      _a.fromArray(this.rest, i0 * 3); _b.fromArray(this.rest, i1 * 3); _c.fromArray(this.rest, i2 * 3);
      const cx = (_a.x + _b.x + _c.x) / 3 - p.x, cy = (_a.y + _b.y + _c.y) / 3 - p.y, cz = (_a.z + _b.z + _c.z) / 3 - p.z;
      if (cx * cx + cy * cy + cz * cz > 0.0004 && bd < Infinity) continue;
      bary(_a, _b, _c, _d.copy(p), _n);
      const b1 = Math.max(0, _n.y), b2 = Math.max(0, _n.z), s = b1 + b2 > 1 ? 1 / (b1 + b2) : 1;
      const u1 = b1 * s, u2 = b2 * s, u0 = 1 - u1 - u2;
      const qx = _a.x * u0 + _b.x * u1 + _c.x * u2, qy = _a.y * u0 + _b.y * u1 + _c.y * u2, qz = _a.z * u0 + _b.z * u1 + _c.z * u2;
      const d = (qx - p.x) ** 2 + (qy - p.y) ** 2 + (qz - p.z) ** 2;
      if (d < bd) { bd = d; out.t = t; out.b1 = u1; out.b2 = u2; }
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------- skinning
  /** start a frame: every used bone's skinning matrix to world, exactly as the GPU applies it
   *  (matrixWorld x bindMatrixInverse x bone.matrixWorld x boneInverse x bindMatrix). The bones' world matrices are
   *  brought up to date first (the pose was set on them this frame, before the renderer gets to them). */
  begin(mesh: THREE.SkinnedMesh) {
    this.frame++;
    mesh.parent?.updateWorldMatrix(true, false);
    mesh.updateMatrixWorld(true);
    const sk = mesh.skeleton, M = this.M;
    _pre.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
    for (let u = 0; u < this.usedBones.length; u++) {
      const k = this.usedBones[u];
      _bm.multiplyMatrices(sk.bones[k].matrixWorld, sk.boneInverses[k]).multiply(mesh.bindMatrix).premultiply(_pre);
      const e = _bm.elements, o = u * 12;
      M[o] = e[0]; M[o + 1] = e[4]; M[o + 2] = e[8]; M[o + 3] = e[12];
      M[o + 4] = e[1]; M[o + 5] = e[5]; M[o + 6] = e[9]; M[o + 7] = e[13];
      M[o + 8] = e[2]; M[o + 9] = e[6]; M[o + 10] = e[10]; M[o + 11] = e[14];
    }
  }
  /** skin one welded vertex (once per frame) */
  vtx(v: number) {
    if (this.stamp[v] === this.frame) return;
    this.stamp[v] = this.frame;
    const r = this.rest, n = this.restN, M = this.M, W = this.W, WN = this.WN;
    const px = r[v * 3], py = r[v * 3 + 1], pz = r[v * 3 + 2], nx = n[v * 3], ny = n[v * 3 + 1], nz = n[v * 3 + 2];
    let x = 0, y = 0, z = 0, a = 0, b = 0, c = 0;
    for (let k = 0; k < 4; k++) {
      const w = this.sW[v * 4 + k]; if (w <= 0) continue;
      const o = this.boneOf[this.sIdx[v * 4 + k]] * 12;
      x += w * (M[o] * px + M[o + 1] * py + M[o + 2] * pz + M[o + 3]);
      y += w * (M[o + 4] * px + M[o + 5] * py + M[o + 6] * pz + M[o + 7]);
      z += w * (M[o + 8] * px + M[o + 9] * py + M[o + 10] * pz + M[o + 11]);
      a += w * (M[o] * nx + M[o + 1] * ny + M[o + 2] * nz);
      b += w * (M[o + 4] * nx + M[o + 5] * ny + M[o + 6] * nz);
      c += w * (M[o + 8] * nx + M[o + 9] * ny + M[o + 10] * nz);
    }
    const l = Math.hypot(a, b, c) || 1;
    W[v * 3] = x; W[v * 3 + 1] = y; W[v * 3 + 2] = z; WN[v * 3] = a / l; WN[v * 3 + 1] = b / l; WN[v * 3 + 2] = c / l;
  }
  private corners(t: number) {
    const i0 = this.tri[t * 3], i1 = this.tri[t * 3 + 1], i2 = this.tri[t * 3 + 2];
    this.vtx(i0); this.vtx(i1); this.vtx(i2);
    _a.fromArray(this.W, i0 * 3); _b.fromArray(this.W, i1 * 3); _c.fromArray(this.W, i2 * 3);
  }
  /** world position of a surface point */
  point(t: number, b1: number, b2: number, out: THREE.Vector3): THREE.Vector3 {
    this.corners(t);
    const b0 = 1 - b1 - b2;
    return out.set(_a.x * b0 + _b.x * b1 + _c.x * b2, _a.y * b0 + _b.y * b1 + _c.y * b2, _a.z * b0 + _b.z * b1 + _c.z * b2);
  }
  /** the smooth (interpolated, skinned) normal at a surface point */
  normal(t: number, b1: number, b2: number, out: THREE.Vector3): THREE.Vector3 {
    const i0 = this.tri[t * 3], i1 = this.tri[t * 3 + 1], i2 = this.tri[t * 3 + 2], WN = this.WN, b0 = 1 - b1 - b2;
    this.vtx(i0); this.vtx(i1); this.vtx(i2);
    return out.set(WN[i0 * 3] * b0 + WN[i1 * 3] * b1 + WN[i2 * 3] * b2, WN[i0 * 3 + 1] * b0 + WN[i1 * 3 + 1] * b1 + WN[i2 * 3 + 1] * b2, WN[i0 * 3 + 2] * b0 + WN[i1 * 3 + 2] * b1 + WN[i2 * 3 + 2] * b2).normalize();
  }
  /** the flat normal of a triangle (world, outward) */
  faceNormal(t: number, out: THREE.Vector3): THREE.Vector3 {
    this.corners(t);
    return out.subVectors(_b, _a).cross(_d.subVectors(_c, _a)).normalize();
  }
  /** rest-pose (bind, mesh-local) position and normal of a surface point */
  restPoint(t: number, b1: number, b2: number, out: THREE.Vector3, outN?: THREE.Vector3): THREE.Vector3 {
    const i0 = this.tri[t * 3], i1 = this.tri[t * 3 + 1], i2 = this.tri[t * 3 + 2], r = this.rest, n = this.restN, b0 = 1 - b1 - b2;
    out.set(r[i0 * 3] * b0 + r[i1 * 3] * b1 + r[i2 * 3] * b2, r[i0 * 3 + 1] * b0 + r[i1 * 3 + 1] * b1 + r[i2 * 3 + 1] * b2, r[i0 * 3 + 2] * b0 + r[i1 * 3 + 2] * b1 + r[i2 * 3 + 2] * b2);
    outN?.set(n[i0 * 3] * b0 + n[i1 * 3] * b1 + n[i2 * 3] * b2, n[i0 * 3 + 1] * b0 + n[i1 * 3 + 1] * b1 + n[i2 * 3 + 1] * b2, n[i0 * 3 + 2] * b0 + n[i1 * 3 + 2] * b1 + n[i2 * 3 + 2] * b2).normalize();
    return out;
  }

  /** move a surface point by a world displacement `d` (projected into the surface as it goes), walking across
   *  triangle edges and carrying the velocity `v` round each fold (its speed kept). Returns false when the point ran
   *  off an open edge of the patch (it is left on that edge). */
  walk(s: SurfPt, d: THREE.Vector3, v: THREE.Vector3): boolean {
    let t = s.t, b1 = s.b1, b2 = s.b2;
    const rem = _n2.copy(d);
    for (let it = 0; it < 10; it++) {
      this.corners(t);
      const n = _n.subVectors(_b, _a).cross(_d.subVectors(_c, _a)).normalize();
      const len = rem.length();
      rem.addScaledVector(n, -rem.dot(n));
      const l2 = rem.length(); if (l2 > 1e-12) rem.multiplyScalar(len / l2);
      if (len < 1e-9) break;
      // the barycentric change of the displacement
      bary(_a, _b, _c, _d.copy(_a).add(rem), _c2);
      const d1 = _c2.y, d2 = _c2.z, d0 = -d1 - d2;
      const b0 = 1 - b1 - b2;
      const e0 = b0 + d0, e1 = b1 + d1, e2 = b2 + d2;
      if (e0 >= 0 && e1 >= 0 && e2 >= 0) { b1 = e1; b2 = e2; break; }
      // it leaves through the edge whose opposite corner's weight reaches zero first
      let sMin = 1, k = -1;
      if (e0 < 0) { const q = b0 / (b0 - e0); if (q < sMin) { sMin = q; k = 0; } }
      if (e1 < 0) { const q = b1 / (b1 - e1); if (q < sMin) { sMin = q; k = 1; } }
      if (e2 < 0) { const q = b2 / (b2 - e2); if (q < sMin) { sMin = q; k = 2; } }
      if (k < 0) { b1 = Math.max(0, e1); b2 = Math.max(0, e2); break; }
      sMin = Math.max(0, sMin);
      let w0 = b0 + d0 * sMin, w1 = b1 + d1 * sMin, w2 = b2 + d2 * sMin;
      if (k === 0) w0 = 0; else if (k === 1) w1 = 0; else w2 = 0;
      const tot = w0 + w1 + w2 || 1; w0 /= tot; w1 /= tot; w2 /= tot;
      rem.multiplyScalar(1 - sMin);
      const nb = this.adj[t * 3 + k];
      if (nb < 0) { s.t = t; s.b1 = w1; s.b2 = w2; return false; }
      // into the neighbour: the shared edge's two corners keep their weights
      _wv[0] = w0; _wv[1] = w1; _wv[2] = w2;
      const ia = this.tri[t * 3 + (k + 1) % 3], ib = this.tri[t * 3 + (k + 2) % 3];
      const wa = _wv[(k + 1) % 3], wb = _wv[(k + 2) % 3];
      let nb1 = 0, nb2 = 0;
      for (let j = 0; j < 3; j++) { const vj = this.tri[nb * 3 + j]; const wj = vj === ia ? wa : vj === ib ? wb : 0; if (j === 1) nb1 = wj; else if (j === 2) nb2 = wj; }
      // the velocity folds over the edge into the new face (its speed kept)
      this.faceNormal(nb, _n3);
      const sp = v.length(); v.addScaledVector(_n3, -v.dot(_n3)); const sv = v.length(); if (sv > 1e-9) v.multiplyScalar(sp / sv);
      t = nb; b1 = nb1; b2 = nb2;
    }
    s.t = t; s.b1 = Math.max(0, Math.min(1, b1)); s.b2 = Math.max(0, Math.min(1 - s.b1, b2));
    return true;
  }
}
const _c2 = new THREE.Vector3(), _n3 = new THREE.Vector3(), _wv = new Float32Array(3), _pre = new THREE.Matrix4(), _bm = new THREE.Matrix4();
/** barycentric weights of p in triangle (a, b, c), projected into its plane: out = (w0, w1, w2) */
function bary(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const v0x = b.x - a.x, v0y = b.y - a.y, v0z = b.z - a.z, v1x = c.x - a.x, v1y = c.y - a.y, v1z = c.z - a.z, v2x = p.x - a.x, v2y = p.y - a.y, v2z = p.z - a.z;
  const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z, d11 = v1x * v1x + v1y * v1y + v1z * v1z;
  const d20 = v2x * v0x + v2y * v0y + v2z * v0z, d21 = v2x * v1x + v2y * v1y + v2z * v1z, den = d00 * d11 - d01 * d01 || 1e-12;
  const w1 = (d11 * d20 - d01 * d21) / den, w2 = (d00 * d21 - d01 * d20) / den;
  return out.set(1 - w1 - w2, w1, w2);
}
function normalise(a: Float32Array): Float32Array {
  for (let i = 0; i < a.length; i += 3) { const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1; a[i] /= l; a[i + 1] /= l; a[i + 2] /= l; }
  return a;
}
