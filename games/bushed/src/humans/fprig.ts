// The first-person arms on the Gacha Garage model (ported from GG's src/game/FPBody.js buildArms / armGeometry /
// handGeometry): the sleeves are the person's own arm triangles out of their painted Human (same atlas, same
// clothes, cuffs and gloves), re-skinned to an arm rig with clavicles and a forearm twist bone, and the hands are GG's
// articulated low-poly hands (palm prism, three-bone fingers, three-bone thumb, flat shaded, tinted palms and
// nails) in the colour of the painted hands (bare skin or the work gloves), plus a glove cuff when gloves are worn.
//
//   const rig = new FPRig(makeLook('player'));
//   parent.add(rig.mesh);                       // body space: feet at y = 0, facing +z (rig.dims.eye = the eye)
//   rig.armIK('R', wrist, handQ);               // body-space wrist target + hand frame
//   applyFingers(rig.bones, 'R', fingers);      // src/player/fp/grip.ts
//   rig.socket('R').add(tool);                  // grip at the origin, handle +Y, edge +Z
import * as THREE from 'three';
import type { HumanLook } from './looks';
import { makeLook } from './looks';
import { lookToSpec } from './spec';
import { Human } from './gg/Human';
import { BONE_INDEX } from './gg/body';
import { ATLAS } from './gg/mesh';
import { FINGERS, FING, THUMB, FIST_C, tdir, fpDims, makeFPSkeleton, twoBone, setFrameRot, frameRot, framePos, twistAboutY } from './rig';
import type { Dims } from './rig';
import { wetMaterial } from './model';

// ---------------------------------------------------------------- shared per look: a painted Human to cut the sleeves from
interface Parts { human: Human; dims: Dims; sleeves: THREE.BufferGeometry; hands: THREE.BufferGeometry; handMat: THREE.MeshStandardMaterial; mat: THREE.Material }
const cache = new Map<string, Parts>();
const keyOf = (L: HumanLook) => L.name + ':' + L.seed + ':' + JSON.stringify(L).length;

function partsFor(look: HumanLook): Parts {
  const key = keyOf(look);
  const hit = cache.get(key);
  if (hit) return hit;
  const human = new Human(lookToSpec(look), { lazy: false });
  human.faceOn = false;
  const dims = fpDims(human.P, human.J);
  const { bones, byName } = makeFPSkeleton(dims);
  const idx = (n: string) => bones.indexOf(byName[n]);
  const sleeves = sleeveGeometry(human, { armL: idx('uarmL'), foreL: idx('ftwL'), armR: idx('uarmR'), foreR: idx('ftwR') });
  const hc = handColor(human);
  const g = human.spec.gloves;
  const cuff = g ? new THREE.Color().setRGB((g.cuff || g.col)[0] / 255, (g.cuff || g.col)[1] / 255, (g.cuff || g.col)[2] / 255, THREE.SRGBColorSpace) : null;
  const hands = handGeometry(dims, byName, bones, hc, cuff, !g);
  const handMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: g ? 0.8 : 0.72, vertexColors: true, emissive: hc.clone().multiplyScalar(0.1) });
  const parts: Parts = { human, dims, sleeves, hands, handMat, mat: wetMaterial(human.mat) };
  cache.set(key, parts);
  return parts;
}

/** The person's sleeves: their arm triangles (upper arm + forearm), re-skinned onto the FP rig's bones. */
function sleeveGeometry(h: Human, map: Record<string, number>): THREE.BufferGeometry {
  const src = h.mesh.geometry, si = src.attributes.skinIndex, idx = src.index!.array;
  const want = new Map<number, number>(Object.entries(map).map(([n, i]) => [BONE_INDEX[n], i]));
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], sk: number[] = [], out: number[] = [];
  const P = src.attributes.position, N = src.attributes.normal, U = src.attributes.uv;
  const remap = new Map<number, number>();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (!want.has(si.getX(a)) || !want.has(si.getX(b)) || !want.has(si.getX(c))) continue;
    for (const v of [a, b, c]) {
      let n = remap.get(v);
      if (n === undefined) {
        n = pos.length / 3; remap.set(v, n);
        pos.push(P.getX(v), P.getY(v), P.getZ(v)); nrm.push(N.getX(v), N.getY(v), N.getZ(v)); uv.push(U.getX(v), U.getY(v));
        sk.push(want.get(si.getX(v))!, 0, 0, 0);
      }
      out.push(n);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sk, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(sk.length).map((_, i) => (i % 4 ? 0 : 1)), 4));
  g.setIndex(out);
  return g;
}

/** The hands' colour: median of the painted hand texels (skin, or the gloves) - GG FPBody.handColor. */
function handColor(h: Human): THREE.Color {
  const src = h.mesh.geometry, si = src.attributes.skinIndex, uv = src.attributes.uv, idx = src.index!.array, d = h.pix.d;
  const hl = BONE_INDEX.handL, hr = BONE_INDEX.handR, cols: number[][] = [];
  const cl = (v: number) => Math.max(0, Math.min(ATLAS - 1, v));
  for (let i = 0; i < idx.length; i += 3) {
    const b = si.getX(idx[i]);
    if (b !== hl && b !== hr) continue;
    const u = (uv.getX(idx[i]) + uv.getX(idx[i + 1]) + uv.getX(idx[i + 2])) / 3, v = (uv.getY(idx[i]) + uv.getY(idx[i + 1]) + uv.getY(idx[i + 2])) / 3;
    const o = (cl(Math.floor((1 - v) * ATLAS)) * ATLAS + cl(Math.floor(u * ATLAS))) * 4;
    cols.push([d[o], d[o + 1], d[o + 2]]);
  }
  const sk = h.spec.skin, c = new THREE.Color().setRGB(sk[0] / 255, sk[1] / 255, sk[2] / 255, THREE.SRGBColorSpace);
  if (!cols.length) return c;
  cols.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const m = cols[cols.length >> 1];
  return c.setRGB(m[0] / 255, m[1] / 255, m[2] / 255, THREE.SRGBColorSpace);
}

// ---------------------------------------------------------------- GG's hand mesh
const _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
type Tint = (n: THREE.Vector3, tip: boolean) => THREE.Color;
class HandGeo {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; si: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ref: THREE.Vector3, bone: number, tint: Tint, tip: boolean) {
    const n = _v2.subVectors(b, a).cross(_v3.subVectors(c, a));
    if (n.lengthSq() < 1e-14) return;
    n.normalize();
    // outward = away from `ref`, a point inside the segment
    if (n.dot(_v4.subVectors(a, ref)) < 0) { n.negate(); [b, c] = [c, b]; }
    const col = tint(n, tip);
    for (const p of [a, b, c]) { this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.col.push(col.r, col.g, col.b); this.si.push(bone, 0, 0, 0); }
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ref: THREE.Vector3, bone: number, tint: Tint, tip: boolean) { this.tri(a, b, c, ref, bone, tint, tip); this.tri(a, c, d, ref, bone, tint, tip); }
  /** Mirror everything onto the right hand (x -> -x, bones remapped). */
  mirror(boneMap: (b: number) => number) {
    const n = this.pos.length / 9;
    for (let t = 0; t < n; t++) {
      const o = t * 9;
      for (const k of [0, 2, 1]) {
        const i = o + k * 3;
        this.pos.push(-this.pos[i], this.pos[i + 1], this.pos[i + 2]);
        this.nrm.push(-this.nrm[i], this.nrm[i + 1], this.nrm[i + 2]);
        this.col.push(this.col[i], this.col[i + 1], this.col[i + 2]);
        this.si.push(boneMap(this.si[(o / 3 + k) * 4]), 0, 0, 0);
      }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.pos.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 ? 0 : 1)), 4));
    return g;
  }
}

/** Low-poly segment: chamfered rings stacked along y, rigidly skinned to `bone`. rings: [y, hx, hz, cx?, cz?] */
function prism(G: HandGeo, rings: number[][], bone: number, mat: THREE.Matrix4, tint: Tint) {
  const pts = rings.map(([y, hx, hz, cx = 0, cz = 0]) => {
    const c = 0.38 * Math.min(hx, hz);
    return [[hx, hz - c], [hx - c, hz], [-hx + c, hz], [-hx, hz - c], [-hx, -hz + c], [-hx + c, -hz], [hx - c, -hz], [hx, -hz + c]]
      .map(([x, z]) => new THREE.Vector3(cx + x, y, cz + z).applyMatrix4(mat));
  });
  const axis = rings.map(([y, , , cx = 0, cz = 0]) => new THREE.Vector3(cx, y, cz).applyMatrix4(mat));
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const A = pts[i], B = pts[i + 1], mid = axis[i].clone().add(axis[i + 1]).multiplyScalar(0.5);
    for (let k = 0; k < 8; k++) G.quad(A[k], A[(k + 1) % 8], B[(k + 1) % 8], B[k], mid, bone, tint, i === n - 2);
  }
  for (let k = 0; k < 8; k++) G.tri(axis[0], pts[0][k], pts[0][(k + 1) % 8], axis[1], bone, tint, false);
  for (let k = 0; k < 8; k++) G.tri(axis[n - 1], pts[n - 1][k], pts[n - 1][(k + 1) % 8], axis[n - 2], bone, tint, true);
}

function handGeometry(d: Dims, byName: Record<string, THREE.Bone>, bones: THREE.Bone[], hc: THREE.Color, cuff: THREE.Color | null, bare: boolean): THREE.BufferGeometry {
  const G = new HandGeo(), k = d.hand, S = (x: number) => x * k;
  const bi = (n: string) => bones.indexOf(byName[n]);
  const hr = d.rest.handL;
  const at = (p: number[], q = new THREE.Quaternion()) => new THREE.Matrix4().compose(new THREE.Vector3(hr[0] + p[0], hr[1] + p[1], hr[2] + p[2]), q, new THREE.Vector3(1, 1, 1));
  const rel = (n: string) => { const r = d.rest[n]; return [r[0] - hr[0], r[1] - hr[1], r[2] - hr[2]]; };
  // tints (linear colours): the palm side a little pinker, nails lighter (bare hands); gloves keep one colour
  const base = hc.clone(), palm = hc.clone().multiply(new THREE.Color(bare ? 1.06 : 1.04, bare ? 0.95 : 1.0, bare ? 0.93 : 0.98)), nail = hc.clone().multiply(new THREE.Color(1.18, 1.08, 1.06));
  const tint = (kind: string): Tint => (n, tip) => (n.x < -0.55 ? palm : tip && kind === 'nail' && bare && n.x > 0.55 ? nail : base);
  // palm
  prism(G, [[S(0.016), S(0.0098), S(0.019), S(0.001)], [0, S(0.0118), S(0.0225)], [S(-0.03), S(0.0135), S(0.031), S(-0.0008)], [S(-0.06), S(0.0132), S(0.0365), S(-0.001)],
    [S(-0.081), S(0.0112), S(0.0375), S(-0.001)], [S(-0.089), S(0.0078), S(0.031), S(-0.0005)]], bi('handL'), at([0, 0, 0]), tint('palm'));
  // a glove's cuff over the wrist
  if (cuff) {
    const cc = cuff.clone();
    prism(G, [[S(0.045), S(0.019), S(0.027)], [S(0.004), S(0.0175), S(0.029)], [S(-0.012), S(0.0145), S(0.026)]], bi('handL'), at([0, 0, 0]), () => cc);
  }
  // fingers
  FINGERS.forEach((fn) => {
    const F = FING[fn];
    F.len.forEach((len, j) => {
      const n = fn + (j + 1) + 'L';
      const tp = j === 2 ? 0.86 : 0.93, w = S(F.w * (1 - j * 0.07)), t = S(F.t * (1 - j * 0.08)), L = S(len);
      const rings = [[w * 0.55, t * 0.72, w * 0.7], [0, t, w], [-L, t * tp, w * tp]];
      rings.push(j === 2 ? [-L - w * 0.55, t * 0.55, w * 0.58] : [-L - w * 0.45, t * 0.78, w * 0.76]);
      prism(G, rings, bi(n), at(rel(n)), tint(j === 2 ? 'nail' : ''));
    });
  });
  // thumb (its base pad blends into the palm), along the thumb's rest direction
  const td = tdir(1), tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(td[0], td[1], td[2]));
  THUMB.len.forEach((len, j) => {
    const n = 'th' + (j + 1) + 'L';
    const w = S(THUMB.w * (1 - j * 0.06)), t = S(THUMB.t * (1 - j * 0.06)), L = S(len);
    const rings = j === 0 ? [[S(0.012), t * 0.9, w * 0.9], [0, t * 1.25, w * 1.2], [-L, t, w], [-L - w * 0.4, t * 0.8, w * 0.8]]
      : [[w * 0.5, t * 0.75, w * 0.75], [0, t, w], [-L, t * 0.88, w * 0.88], [-L - w * (j === 2 ? 0.55 : 0.4), t * 0.6, w * 0.62]];
    prism(G, rings, bi(n), at(rel(n), tq), tint(j === 2 ? 'nail' : ''));
  });
  // the right hand mirrors the left (vertices reflected through x = 0; the rest pose is symmetric)
  const L2R = (b: number) => bones.indexOf(byName[bones[b].name.replace(/L$/, 'R')]);
  G.mirror(L2R);
  // keep only the right hand's half reflected correctly: positions mirrored through x = 0 already land on the right
  return G.geometry();
}

// ---------------------------------------------------------------- the rig
const _q = new THREE.Quaternion(), _qU = new THREE.Quaternion(), _qL = new THREE.Quaternion(), _qC = new THREE.Quaternion(), _qF = new THREE.Quaternion();
const _base = new THREE.Vector3(), _pole = new THREE.Vector3(), _ax = new THREE.Vector3(0, 1, 0);

export class FPRig {
  /** the sleeves (body space: feet at y = 0, facing +z); the hands mesh rides along as its child */
  readonly mesh: THREE.SkinnedMesh;
  readonly hands: THREE.SkinnedMesh;
  readonly bones: Record<string, THREE.Bone>;
  readonly dims: Dims;
  readonly look: HumanLook;
  private sockets: { L: THREE.Object3D; R: THREE.Object3D };

  constructor(look: HumanLook = makeLook('player')) {
    this.look = look;
    const parts = partsFor(look);
    const d = this.dims = parts.dims;
    const { bones, byName } = makeFPSkeleton(d);
    this.bones = byName;
    this.mesh = new THREE.SkinnedMesh(parts.sleeves, parts.mat);
    this.mesh.add(bones[0]);
    this.mesh.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones);
    this.mesh.bind(skel);
    this.hands = new THREE.SkinnedMesh(parts.hands, parts.handMat);
    this.hands.bind(skel, this.mesh.matrixWorld);
    this.mesh.add(this.hands);
    for (const m of [this.mesh, this.hands]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; }
    const sock = (side: 'L' | 'R') => {
      const k = side === 'L' ? 1 : -1, o = new THREE.Object3D();
      o.name = 'socket' + side;
      o.position.set(k * FIST_C[0] * d.hand, FIST_C[1] * d.hand, FIST_C[2] * d.hand);
      o.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      byName['hand' + side].add(o);
      return o;
    };
    this.sockets = { L: sock('L'), R: sock('R') };
  }

  socket(side: 'L' | 'R'): THREE.Object3D { return this.sockets[side]; }

  /**
   * Two-bone arm IK in body (mesh) space: the wrist onto `wrist`, the hand frame onto `handQ` (blended by w). The
   * elbow points down, out and back; the wrist's twist about the forearm is shared between the forearm and the hand.
   */
  armIK(side: 'L' | 'R', wrist: THREE.Vector3, handQ: THREE.Quaternion, w = 1) {
    const b = this.bones, k = side === 'L' ? 1 : -1;
    const clav = b['clav' + side], uarm = b['uarm' + side], farm = b['farm' + side], ftw = b['ftw' + side], hand = b['hand' + side];
    framePos(uarm, this.mesh, _base);
    frameRot(clav, this.mesh, _qC);
    _pole.set(k * 0.6, -1, -0.5).normalize();
    twoBone(_base, wrist, _pole, this.dims.L.uarm, this.dims.L.farm, _qU, _qL);
    setFrameRot(uarm, _qC, _qU, w);
    frameRot(uarm, this.mesh, _qU);
    setFrameRot(farm, _qU, _qL, w);
    frameRot(farm, this.mesh, _qF);
    const tw = twistAboutY(_q.copy(_qF).invert().multiply(handQ));
    ftw.quaternion.setFromAxisAngle(_ax, tw * 0.6);
    _qF.multiply(ftw.quaternion);
    setFrameRot(hand, _qF, handQ, w);
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.skeleton.dispose(); }
}
