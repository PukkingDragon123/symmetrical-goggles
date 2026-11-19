// The Book of Cryptids as a 3D object: a living grimoire. Two boards hinged on a rounded, banded spine are its
// jaws; the fore-edge of each board carries fleshy stitched lips, wet gums and a row of little teeth (one of
// them gold), so opening the book opens its mouth and snapping it shut is a bite. A long tongue lies down the
// gutter as the bookmark and dangles out past the tail; it licks pages and tastes the air. Two amber goat eyes
// sit in a leather brow at the head of the spine. Brass corners, two strap clasps (a muzzle, really) and gilt
// page edges. Pages are curved blocks with the open book's gutter roll; a page turns as a real curling leaf.
//
// Book space: x across the spread (spine at x = 0), y out of the pages, z down the page (head at -z), metres.
import * as THREE from 'three';
import { frontCoverTex, backCoverTex, spineTex, edgeLeatherTex, pastedownTex, pageEdgeTex, lipTex, gumTex, tongueTex, eyeTex, brassTex, lidTex } from './textures';
import { canvasTex } from '../../gfx/tex';
import { hash2 } from '../../core/rng';

export const PAGE = { w: 0.2, h: 0.275 };
const G = 0.0045;                 // half the gap at the spine (hinge offset)
const BT = 0.0055;                // board thickness
const SQ = 0.009;                 // squares at head and tail
const FORE = 0.026;               // the boards overhang the fore-edge this much: lips and teeth live here
const BW = PAGE.w + FORE;         // board width from the hinge line
const BH = PAGE.h + SQ * 2;
const UG = 0.032;                 // width of the gutter roll
const NX = 22, NZ = 6;            // page block top grid
const LX = 26, LZ = 8;            // leaf grid

export interface BookPose {
  /** 0 shut .. 1 open flat */
  open: number;
  /** extra jaw flap in radians (talking, chomping): both covers lift */
  jaw: number;
  /** breathing swell 0..1 */
  breath: number;
  /** page turn progress 0..1 (right to left) or null */
  turn: number | null;
  /** 0..1 how far through the book (left block thickness) */
  through: number;
  /** tongue: lick stroke phase, tasting flick phase, wag while talking (0 = off) */
  lick: number; taste: number; wag: number;
  /** eyes: look target in book space (null: at the reader), blink 0..1, squint 0..1 */
  look: THREE.Vector3 | null; blink: number; squint: number;
  /** lips pulled back (snarl / grin) 0..1 */
  snarl: number;
  time: number;
}

export function restPose(): BookPose {
  return { open: 0, jaw: 0, breath: 0, turn: null, through: 0, lick: 0, taste: 0, wag: 0, look: null, blink: 0, squint: 0, snarl: 0, time: 0 };
}

/** the open book's page surface: rises out of the gutter, then lies almost flat */
function prof(u: number, P: number): number {
  if (u <= 0) return 0;
  const k = Math.min(1, u / UG);
  return P * (1 - (1 - k) * (1 - k)) + 0.0016 * Math.sin(Math.min(1, u / PAGE.w) * Math.PI);
}
function profSlope(u: number, P: number): number { return (prof(u + 0.0005, P) - prof(Math.max(0, u - 0.0005), P)) / (u > 0.0005 ? 0.001 : 0.0005 + u); }

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export class GrimoireModel {
  readonly object = new THREE.Group();
  /** the four page canvases: left, right, turning leaf front (right side) and back (left side) */
  readonly canvases: { L: HTMLCanvasElement; R: HTMLCanvasElement; F: HTMLCanvasElement; B: HTMLCanvasElement };
  readonly tex: { L: THREE.Texture; R: THREE.Texture; F: THREE.Texture; B: THREE.Texture };
  /** where the Book's voice comes from (the brow, between the eyes) */
  readonly mouthAnchor = new THREE.Object3D();
  private rightPivot = new THREE.Group();
  private leftPivot = new THREE.Group();
  private leftHalf = new THREE.Group();
  private blockR: THREE.Mesh; private blockL: THREE.Mesh;
  private leafF: THREE.Mesh; private leafB: THREE.Mesh;
  private spine: THREE.Mesh;
  private face = new THREE.Group();
  private eyes: { ball: THREE.Mesh; lid: THREE.Mesh; lower: THREE.Mesh }[] = [];
  private tongue: THREE.Mesh;
  private lips: THREE.Mesh[] = [];
  private teeth: THREE.Mesh[] = [];
  private straps: { mesh: THREE.Mesh; catch: THREE.Mesh; z: number }[] = [];
  private pL = 0.012; private pR = 0.012;
  private _m = new THREE.Matrix4(); private _v = new THREE.Vector3(); private _v2 = new THREE.Vector3();
  private pageMats: THREE.MeshStandardMaterial[] = [];

  constructor() {
    const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.canvases = { L: mk(384, 528), R: mk(384, 528), F: mk(384, 528), B: mk(384, 528) };
    this.tex = { L: canvasTex(this.canvases.L), R: canvasTex(this.canvases.R), F: canvasTex(this.canvases.F), B: canvasTex(this.canvases.B) };
    // crisp text: never blur a page, even slightly minified
    for (const t of Object.values(this.tex)) { t.anisotropy = 8; t.minFilter = THREE.NearestMipmapNearestFilter; }
    this.tex.B.wrapS = THREE.RepeatWrapping; this.tex.B.repeat.x = -1; this.tex.B.offset.x = 1;

    const leather = new THREE.MeshStandardMaterial({ map: edgeLeatherTex(), roughness: 0.72 });
    const pasted = new THREE.MeshStandardMaterial({ map: pastedownTex(), roughness: 0.9 });
    const front = new THREE.MeshStandardMaterial({ map: frontCoverTex(), roughness: 0.66, metalness: 0.05 });
    const back = new THREE.MeshStandardMaterial({ map: backCoverTex(), roughness: 0.7 });
    const edge = new THREE.MeshStandardMaterial({ map: pageEdgeTex(), roughness: 0.6, metalness: 0.15 });
    const brass = new THREE.MeshStandardMaterial({ map: brassTex(), roughness: 0.38, metalness: 0.55, color: 0xffffff });
    const page = (t: THREE.Texture) => {
      // a faint self-light, so the ink can be read in a dark cabin (the Book is not entirely natural)
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.93, emissive: 0x1c1712, emissiveMap: t, emissiveIntensity: 0.55 });
      this.pageMats.push(m);
      return m;
    };

    // ---- the two halves
    this.object.add(this.rightPivot, this.leftPivot);
    this.leftPivot.add(this.leftHalf);
    this.rightPivot.add(this.board('R', back, pasted, leather), this.corners('R', brass));
    this.leftHalf.add(this.board('L', front, pasted, leather), this.corners('L', brass));
    this.blockR = new THREE.Mesh(this.blockGeo('R'), [page(this.tex.R), edge]);
    this.blockL = new THREE.Mesh(this.blockGeo('L'), [page(this.tex.L), edge]);
    this.rightPivot.add(this.blockR); this.leftHalf.add(this.blockL);
    // ---- the mouth on each fore-edge
    const lipM = new THREE.MeshStandardMaterial({ map: lipTex(), roughness: 0.32 });
    const gumM = new THREE.MeshStandardMaterial({ map: gumTex(), roughness: 0.22 });
    const toothM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
    for (const side of ['R', 'L'] as const) {
      const parent = side === 'R' ? this.rightPivot : this.leftHalf;
      const lip = new THREE.Mesh(this.lipGeo(side), lipM); parent.add(lip); this.lips.push(lip);
      parent.add(new THREE.Mesh(this.gumGeo(side), gumM));
      const tt = new THREE.Mesh(this.teethGeo(side), toothM); parent.add(tt); this.teeth.push(tt);
    }
    // ---- clasps: straps from the back board, brass pins on the front board
    const strapM = new THREE.MeshStandardMaterial({ map: edgeLeatherTex(), roughness: 0.75, side: THREE.DoubleSide });
    for (const z of [-0.07, 0.07]) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), strapM);
      const c = new THREE.Mesh(this.claspGeo(), brass);
      this.object.add(mesh, c);
      this.straps.push({ mesh, catch: c, z });
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0028, 0.006, 8).rotateZ(Math.PI / 2), brass);
      pin.position.set(-(G + BW) - 0.002, -BT / 2, z);
      this.leftHalf.add(pin);
    }
    // ---- the spine (rebuilt as the book opens and shuts)
    this.spine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: spineTex(), roughness: 0.7, side: THREE.DoubleSide }));
    this.object.add(this.spine);
    // ---- the turning leaf
    const leafGeo = this.leafGeo();
    this.leafF = new THREE.Mesh(leafGeo, page(this.tex.F));
    const mb = page(this.tex.B); mb.side = THREE.BackSide;
    this.leafB = new THREE.Mesh(leafGeo, mb);
    this.leafF.visible = this.leafB.visible = false;
    this.leafF.frustumCulled = this.leafB.frustumCulled = false;
    this.object.add(this.leafF, this.leafB);
    // ---- the face: a leather brow at the head of the spine, two goat eyes; and a third in the front cover
    this.buildFace(leather);
    this.buildCoverEye();
    this.object.add(this.face);
    // ---- the tongue
    const tg = new THREE.BufferGeometry();
    this.tongue = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: tongueTex(), roughness: 0.26, metalness: 0.0, emissive: 0x2a0606, emissiveIntensity: 0.6 }));
    this.tongue.frustumCulled = false;
    this.initTongue(tg);
    this.object.add(this.tongue);
    this.object.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    this.update(restPose());
  }

  /** where a hand holds a board (model space): a point under the fore-edge, the direction in toward the spine,
   *  and the palm normal (pointing from the palm into the board) */
  handFrame(side: 'L' | 'R', out: { p: THREE.Vector3; x: THREE.Vector3; n: THREE.Vector3 }, open = 1): void {
    const mR = this.rightPivot.matrix;
    if (side === 'R') {
      out.p.set(G + BW - 0.014, -BT - 0.006, 0.05).applyMatrix4(mR);
      out.x.set(-1, 0, 0).transformDirection(mR);
      out.n.set(0, 1, 0).transformDirection(mR);
      return;
    }
    // the left hand: under the spine while the book is shut, under the front board's fore-edge once it is open;
    // it slides between the two rather than riding the cover through the air
    const k = smooth(clamp01((open - 0.15) / 0.75));
    const mL = this._m.multiplyMatrices(this.leftPivot.matrix, this.leftHalf.matrix);
    const pShut = this._v.set(-G - 0.012, -BT - 0.008, 0.05).applyMatrix4(mR);
    const pOpen = this._v2.set(-(G + BW - 0.014), -BT - 0.006, 0.05);
    // the open position, as if fully open (the right half's frame mirrored)
    pOpen.set(-(G + BW - 0.014) * Math.cos(this.rightPivot.rotation.z), (G + BW - 0.014) * Math.sin(this.rightPivot.rotation.z) - BT - 0.006, 0.05);
    out.p.copy(pShut).lerp(pOpen, k);
    out.x.set(1, 0, 0).transformDirection(mR).lerp(new THREE.Vector3(1, 0, 0).transformDirection(mL), k * k).normalize();
    out.n.set(0, 1, 0).transformDirection(mR);
    void mL;
  }

  /** mark the page textures changed */
  refresh(which: ('L' | 'R' | 'F' | 'B')[]): void { for (const k of which) this.tex[k].needsUpdate = true; }

  // ------------------------------------------------------------------------------------------------ boards
  private board(side: 'L' | 'R', outer: THREE.Material, inner: THREE.Material, edgeM: THREE.Material): THREE.Mesh {
    const s = side === 'R' ? 1 : -1;
    const x0 = G, x1 = G + BW, r = 0.007;
    const sh = new THREE.Shape();
    // in shape space: x across, y = book z
    sh.moveTo(x0, -BH / 2); sh.lineTo(x1 - r, -BH / 2); sh.quadraticCurveTo(x1, -BH / 2, x1, -BH / 2 + r);
    sh.lineTo(x1, BH / 2 - r); sh.quadraticCurveTo(x1, BH / 2, x1 - r, BH / 2); sh.lineTo(x0, BH / 2); sh.lineTo(x0, -BH / 2);
    const bev = 0.0011;
    const g = new THREE.ExtrudeGeometry(sh, { depth: BT - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.9, bevelSegments: 2, curveSegments: 5 });
    g.rotateX(Math.PI / 2);
    g.translate(0, -bev, 0);
    if (s < 0) { const p = g.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i)); }
    return new THREE.Mesh(regroup(g, s, (x, z, top) => {
      // top = the pastedown inside; bottom = the cover outside (front cover on the left board)
      const u = (Math.abs(x) - G) / BW, v = 1 - (z + BH / 2) / BH;
      return top ? [s > 0 ? u : 1 - u, v] : [s > 0 ? 1 - u : u, v];
    }), [inner, outer, edgeM]);
  }

  private corners(side: 'L' | 'R', brass: THREE.Material): THREE.Group {
    const s = side === 'R' ? 1 : -1, grp = new THREE.Group();
    const L = 0.028;
    for (const zs of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(-L, 0); sh.quadraticCurveTo(-L * 0.45, L * 0.18, 0, L); sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: BT + 0.0016, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0007, bevelSegments: 1, curveSegments: 6 });
      g.rotateX(Math.PI / 2);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { p.setX(i, s * (p.getX(i) + G + BW + 0.0006)); p.setZ(i, zs * (-p.getZ(i) + BH / 2 + 0.0006)); p.setY(i, p.getY(i) + 0.0008); }
      g.computeVertexNormals();
      // flip winding where the mirror turned it inside out
      if (s * zs > 0) flipWinding(g);
      grp.add(new THREE.Mesh(g, brass));
    }
    return grp;
  }

  // ------------------------------------------------------------------------------------------------ page blocks
  private blockGeo(side: 'L' | 'R'): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const nTop = (NX + 1) * (NZ + 1), nFore = (NZ + 1) * 2, nEnds = (NX + 1) * 2 * 2;
    const n = nTop + nFore + nEnds;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx: number[] = [];
    const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (flip) idx.push(a, c, b, c, d, b); else idx.push(a, b, c, c, b, d); };
    const flip = side === 'L';
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const a = i * (NZ + 1) + j;
      quad(a, a + 1, a + NZ + 1, a + NZ + 2, flip);
    }
    const topCount = idx.length;
    let o = nTop;
    for (let j = 0; j < NZ; j++) quad(o + j * 2, o + j * 2 + 1, o + j * 2 + 2, o + j * 2 + 3, flip);
    o += nFore;
    for (const e of [0, 1]) {
      const b = o + e * (NX + 1) * 2;
      for (let i = 0; i < NX; i++) quad(b + i * 2, b + i * 2 + 1, b + i * 2 + 2, b + i * 2 + 3, e === 0 ? flip : !flip);
    }
    g.setIndex(idx);
    g.addGroup(0, topCount, 0);
    g.addGroup(topCount, idx.length - topCount, 1);
    this.shapeBlock(g, side, 0.012, 0);
    return g;
  }

  private shapeBlock(g: THREE.BufferGeometry, side: 'L' | 'R', P: number, breath: number): void {
    const s = side === 'R' ? 1 : -1;
    const pos = g.getAttribute('position') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const W = PAGE.w, H = PAGE.h;
    const us: number[] = [];
    for (let i = 0; i <= NX; i++) us.push(W * Math.pow(i / NX, 1.5));
    const Pb = P * (1 + breath * 0.12);
    let k = 0;
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const z = -H / 2 + (H * j) / NZ;
      // breathing: a slow swell that moves down the page
      const sw = breath * 0.0012 * Math.sin((us[i] / W) * Math.PI) * (0.7 + 0.3 * Math.sin(z * 20));
      pos.setXYZ(k, s * (G + us[i]), prof(us[i], Pb) + sw, z);
      uv.setXY(k, s > 0 ? us[i] / W : 1 - us[i] / W, 1 - j / NZ);
      k++;
    }
    for (let j = 0; j <= NZ; j++) {
      const z = -H / 2 + (H * j) / NZ;
      pos.setXYZ(k, s * (G + W), 0, z); uv.setXY(k, 0, j / NZ * 4); k++;
      pos.setXYZ(k, s * (G + W), prof(W, Pb), z); uv.setXY(k, 1, j / NZ * 4); k++;
    }
    for (const zz of [-H / 2, H / 2]) for (let i = 0; i <= NX; i++) {
      pos.setXYZ(k, s * (G + us[i]), 0, zz); uv.setXY(k, 0, us[i] / W * 3); k++;
      pos.setXYZ(k, s * (G + us[i]), prof(us[i], Pb), zz); uv.setXY(k, 1, us[i] / W * 3); k++;
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  // ------------------------------------------------------------------------------------------------ the leaf
  private leafGeo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = (LX + 1) * (LZ + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    const idx: number[] = [];
    for (let i = 0; i <= LX; i++) for (let j = 0; j <= LZ; j++) { const k = i * (LZ + 1) + j; uv[k * 2] = i / LX; uv[k * 2 + 1] = 1 - j / LZ; }
    for (let i = 0; i < LX; i++) for (let j = 0; j < LZ; j++) { const a = i * (LZ + 1) + j; idx.push(a, a + 1, a + LZ + 1, a + LZ + 1, a + 1, a + LZ + 2); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  /** the leaf at turn progress t: arc-length integrated, the free edge leading as it lifts and lagging as it
   *  falls, the near (tail) corner ahead of the far one, settling onto the gutter roll at both ends */
  private shapeLeaf(t: number): void {
    const g = this.leafF.geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const W = PAGE.w, H = PAGE.h, ds = W / LX;
    const e = smooth(clamp01(t));
    const w = smooth(clamp01((t - 0.08) / 0.84));         // base angle share: 0 lying right .. 1 lying left
    const lift = Math.sin(Math.PI * clamp01(t));
    const B = 1.5 * lift * (1 - 2 * e);                    // + edge leads, - edge lags
    const baseX = G * (1 - 2 * w), P = (this.pR * (1 - w) + this.pL * w);
    for (let j = 0; j <= LZ; j++) {
      const z = -H / 2 + (H * j) / LZ, zn = (z / (H / 2));
      let x = baseX, y = 0.0009 + lift * 0.004;
      for (let i = 0; i <= LX; i++) {
        const s = i * ds;
        pos.setXYZ(i * (LZ + 1) + j, x, y, z);
        const thR = Math.atan(profSlope(s, this.pR)), thL = Math.PI - Math.atan(profSlope(s, this.pL));
        const f = Math.pow(s / W, 1.3);
        const th = thR * (1 - w) + thL * w + B * f + 0.28 * lift * zn * f;
        x += Math.cos(th) * ds; y += Math.sin(th) * ds;
        void P;
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }

  // ------------------------------------------------------------------------------------------------ mouth
  private lipPath(side: 'L' | 'R'): THREE.CatmullRomCurve3 {
    const s = side === 'R' ? 1 : -1;
    const xl = G + BW - 0.0048, zt = BH / 2;
    const pts = [
      [xl - 0.024, zt - 0.013], [xl - 0.012, zt - 0.019], [xl - 0.003, zt - 0.03], [xl, zt - 0.06], [xl, 0], [xl, -zt + 0.06], [xl - 0.003, -zt + 0.03], [xl - 0.012, -zt + 0.019], [xl - 0.024, -zt + 0.013],
    ].map(([x, z]) => new THREE.Vector3(s * x, 0.0024, z));
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }
  private lipGeo(side: 'L' | 'R'): THREE.BufferGeometry {
    const g = new THREE.TubeGeometry(this.lipPath(side), 64, 0.0056, 10, false);
    // taper the corners of the mouth, fatten the middle, a little lumpy
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const c = this.lipPath(side), mid = new THREE.Vector3();
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      c.getPointAt(t, mid);
      const k = Math.pow(Math.sin(t * Math.PI), 0.45) * (0.85 + 0.15 * Math.sin(t * 31));
      for (let r = 0; r <= 10; r++) {
        const vi = i * 11 + r;
        const v = new THREE.Vector3(p.getX(vi), p.getY(vi), p.getZ(vi)).sub(mid).multiplyScalar(Math.max(0.25, k));
        v.y *= 0.8;
        p.setXYZ(vi, mid.x + v.x, mid.y + v.y, mid.z + v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  }
  private gumGeo(side: 'L' | 'R'): THREE.BufferGeometry {
    const s = side === 'R' ? 1 : -1;
    const x0 = G + PAGE.w + 0.0012, x1 = G + BW - 0.006;
    const g = new THREE.PlaneGeometry(x1 - x0, PAGE.h + 0.006, 3, 40);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i);
      const lump = 0.0012 * Math.abs(Math.sin(z * 120)) * Math.sin(((x - x0) / (x1 - x0)) * Math.PI);
      p.setXYZ(i, s * x, 0.0009 + lump, z);
    }
    if (s < 0) flipWinding(g);
    g.computeVertexNormals();
    return g;
  }
  private teethGeo(side: 'L' | 'R'): THREE.BufferGeometry {
    const s = side === 'R' ? 1 : -1;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const xt = G + BW - 0.0112;
    const n = 23;
    for (let k = 0; k < n; k++) {
      const z = -PAGE.h / 2 + 0.012 + (k / (n - 1)) * (PAGE.h - 0.024) + (hash2(k, s, 1) - 0.5) * 0.003;
      const fang = k === 3 || k === n - 4 || k === 11;
      const broken = hash2(k, s, 7) < 0.12 && !fang;
      const gold = side === 'R' && k === 15;
      const h = (fang ? 0.017 : 0.0095 + hash2(k, s, 2) * 0.004) * (broken ? 0.55 : 1);
      const r = fang ? 0.0034 : 0.0026 + hash2(k, s, 3) * 0.0008;
      // they lean in over the page margin like a flytrap's, curving as they go
      const lean = -s * (fang ? 0.75 : 0.6), sides = 6, rings = 5;
      const base = pos.length / 3;
      for (let ri = 0; ri <= rings; ri++) {
        const t = ri / rings;
        const rr = r * Math.pow(1 - t, 0.85) + (ri === rings ? 0.0002 : 0);
        const cy = 0.0012 + h * t * (1 - Math.abs(lean) * 0.45 * t), cx = s * xt + lean * h * t * t * 0.9, cz = z;
        for (let si = 0; si < sides; si++) {
          const a = (si / sides) * Math.PI * 2;
          const crook = (hash2(k, s, 9) - 0.5) * 0.5 * t;
          pos.push(cx + Math.cos(a) * rr * 0.75, cy, cz + Math.sin(a) * rr * 1.25 + crook * h);
          // enamel: stained at the root, ivory at the tip, a darker back
          const shade = 0.6 + t * 0.42 - (Math.cos(a) * s > 0.5 ? 0.14 : 0);
          if (gold) col.push(0.95 * shade + 0.05, 0.7 * shade + 0.04, 0.25 * shade);
          else col.push((0.8 + 0.2 * t) * shade, (0.7 + 0.25 * t) * shade, (0.5 + 0.34 * t) * shade);
        }
      }
      for (let ri = 0; ri < rings; ri++) for (let si = 0; si < sides; si++) {
        const a = base + ri * sides + si, b = base + ri * sides + ((si + 1) % sides), c = a + sides, d = b + sides;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  private claspGeo(): THREE.BufferGeometry {
    const sh = new THREE.Shape();
    const w = 0.0095, h = 0.016, r = 0.003;
    sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, 0);
    const hole = new THREE.Path(); hole.absellipse(0, h * 0.62, 0.0028, 0.0028, 0, Math.PI * 2, true, 0); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.0014, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0005, bevelSegments: 1, curveSegments: 8 });
    g.translate(0, 0, -0.0007);
    return g;
  }

  // ------------------------------------------------------------------------------------------------ face
  private buildFace(leather: THREE.Material): void {
    // the brow: a lumpy leather hood, two sockets the eyes bulge out of
    const bg = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const p = bg.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ridge = Math.max(0, 1 - Math.abs(z + 0.35) / 0.4) * 0.25;
      p.setXYZ(i, x * 0.026, y * (0.005 + ridge * 0.003) + Math.sin(x * 11) * 0.0004, z * 0.014);
    }
    bg.computeVertexNormals();
    const brow = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: lidTex(), roughness: 0.6, color: 0xc89880 }));
    brow.position.set(0, -0.0015, -0.006);
    this.face.add(brow);
    const eyeM = new THREE.MeshStandardMaterial({ map: eyeTex(), roughness: 0.12, metalness: 0.0, emissive: 0x3a1c06, emissiveIntensity: 0.9 });
    const lidM = new THREE.MeshStandardMaterial({ map: lidTex(), roughness: 0.5, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const holder = new THREE.Group();
      holder.position.set(s * 0.0122, 0.0066, -0.003);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0082, 18, 14), eyeM);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0089, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), lidM);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0088, 16, 6, 0, Math.PI * 2, Math.PI * 0.66, Math.PI * 0.34), lidM);
      holder.add(ball, lid, lower);
      this.face.add(holder);
      this.eyes.push({ ball, lid, lower });
    }
    this.mouthAnchor.position.set(0, 0.016, 0);
    this.face.add(this.mouthAnchor);
  }

  private coverEye: { holder: THREE.Group; ball: THREE.Mesh; lid: THREE.Mesh; lower: THREE.Mesh } | null = null;
  private buildCoverEye(): void {
    // in the front cover's tooled eye (texture 448 x 592, eye at 224, 380): the left board's outer face
    const u = 0.5, v = 380 / 592;
    const x = -(G + u * BW), z = -BH / 2 + v * BH;
    const holder = new THREE.Group();
    holder.position.set(x, -BT - 0.0025, z);
    holder.rotation.x = Math.PI;           // facing out of the outer face (-y)
    const eyeM = new THREE.MeshStandardMaterial({ map: eyeTex(), roughness: 0.1, emissive: 0x3a1c06, emissiveIntensity: 0.9 });
    const lidM = new THREE.MeshStandardMaterial({ map: lidTex(), roughness: 0.5, side: THREE.DoubleSide });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 20, 16), eyeM);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0124, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), lidM);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0123, 18, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), lidM);
    lid.scale.set(1.25, 1, 0.9); lower.scale.set(1.25, 1, 0.9);
    // the socket rim: a squashed leather ring around it
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0128, 0.0032, 8, 24).rotateX(Math.PI / 2), lidM);
    rim.scale.set(1.35, 0.6, 1);
    rim.position.y = 0.0012;
    holder.add(ball, lid, lower, rim);
    this.leftHalf.add(holder);
    this.coverEye = { holder, ball, lid, lower };
  }

  // ------------------------------------------------------------------------------------------------ tongue
  private tN = 30; private tR = 8;
  private initTongue(g: THREE.BufferGeometry): void {
    const n = (this.tN + 1) * (this.tR + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2), idx: number[] = [];
    for (let i = 0; i <= this.tN; i++) for (let r = 0; r <= this.tR; r++) { const k = i * (this.tR + 1) + r; uv[k * 2] = r / this.tR; uv[k * 2 + 1] = i / this.tN * 3; }
    for (let i = 0; i < this.tN; i++) for (let r = 0; r < this.tR; r++) { const a = i * (this.tR + 1) + r; idx.push(a, a + 1, a + this.tR + 1, a + this.tR + 1, a + 1, a + this.tR + 2); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
  }
  private tonguePts(q: BookPose, out: THREE.Vector3[]): void {
    const H = PAGE.h, z0 = -H / 2 + 0.014;
    // rest: down the gutter like a bookmark ribbon, over the tail and dangling
    const rest = (u: number, v: THREE.Vector3) => {
      const L = H + 0.012 - 0.014;
      const s = u * (L + 0.05);
      if (s < L) v.set(Math.sin(s * 30) * 0.0012, 0.0052 + 0.0006 * Math.sin(s * 12), z0 + s);
      else { const d = s - L; v.set(Math.sin(L * 30) * 0.0012 + Math.sin(q.time * 2.1) * d * 0.15, 0.0042 - d * 0.75 - d * d * 4, z0 + L + d * 0.55); }
      if (q.wag > 0 && s > L * 0.6) v.x += Math.sin(q.time * 18 + s * 30) * 0.004 * q.wag * ((s - L * 0.6) / (L * 0.4 + 0.05));
    };
    // lick: the tongue peels up out of the gutter and drags its tip across the right page
    const lick = (u: number, v: THREE.Vector3) => {
      const ph = q.lick, sweep = Math.sin(ph * Math.PI);
      const tip = new THREE.Vector3(0.03 + 0.15 * sweep, 0.0035 + 0.006 * (1 - sweep), 0.02 + 0.03 * Math.sin(ph * Math.PI * 2));
      const root = new THREE.Vector3(0, 0.004, z0);
      const mid = new THREE.Vector3((root.x + tip.x) * 0.45, 0.05 * sweep + 0.012, (root.z + tip.z) * 0.5 - 0.02);
      quadBez(root, mid, tip, u, v);
    };
    // taste: curls up out of the gutter at the head and laps at the air, three quick flicks
    const taste = (u: number, v: THREE.Vector3) => {
      const ph = q.taste, flick = Math.pow(Math.abs(Math.sin(ph * Math.PI * 3)), 0.7);
      const reach = 0.025 + 0.05 * flick;
      const root = new THREE.Vector3(0, 0.004, z0 + 0.03);
      const mid = new THREE.Vector3(0, 0.03 + reach * 0.4, z0 - 0.005);
      const tip = new THREE.Vector3(Math.sin(q.time * 23) * 0.012 * flick, 0.022 + reach * 0.55, z0 - reach * 0.7 + 0.01 * Math.cos(q.time * 17));
      quadBez(root, mid, tip, u, v);
    };
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const wl = q.lick > 0 ? Math.min(1, Math.sin(q.lick * Math.PI) * 3) : 0;
    const wt = q.taste > 0 ? Math.min(1, Math.sin(q.taste * Math.PI) * 4) : 0;
    for (let i = 0; i <= this.tN; i++) {
      const u = i / this.tN;
      rest(u, out[i]);
      if (wl > 0) { lick(u, a); out[i].lerp(a, wl); }
      if (wt > 0) { taste(u, b); out[i].lerp(b, wt); }
    }
  }
  private tPts = Array.from({ length: 31 }, () => new THREE.Vector3());
  private shapeTongue(q: BookPose): void {
    const g = this.tongue.geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    this.tonguePts(q, this.tPts);
    const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const active = Math.max(q.lick > 0 ? 1 : 0, q.taste > 0 ? 1 : 0);
    for (let i = 0; i <= this.tN; i++) {
      const u = i / this.tN;
      const a = this.tPts[Math.max(0, i - 1)], b = this.tPts[Math.min(this.tN, i + 1)];
      T.subVectors(b, a).normalize();
      N.copy(up).addScaledVector(T, -up.dot(T));
      if (N.lengthSq() < 1e-6) N.set(0, 0, -1);
      N.normalize();
      Bn.crossVectors(T, N).normalize();
      // wide and flat, tapering to a rounded tip, thicker at the root
      let wd = 0.0095 * (1 - u * 0.25) * (active ? 1.05 : 1), th = 0.0034 * (1 - u * 0.3) + (u < 0.1 ? 0.0012 : 0);
      if (u > 0.9) { const k = Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)); wd *= Math.max(0.12, k); th *= Math.max(0.3, k); }
      for (let r = 0; r <= this.tR; r++) {
        const ang = (r / this.tR) * Math.PI * 2;
        const cx = Math.cos(ang) * wd, cy = Math.sin(ang) * th;
        const groove = Math.abs(Math.cos(ang)) < 0.2 && Math.sin(ang) > 0 ? -0.0008 : 0;
        const p = this.tPts[i];
        pos.setXYZ(i * (this.tR + 1) + r, p.x + Bn.x * cx + N.x * (cy + groove), p.y + Bn.y * cx + N.y * (cy + groove), p.z + Bn.z * cx + N.z * (cy + groove));
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  }

  // ------------------------------------------------------------------------------------------------ spine & straps
  private spineGeoUpdate(): void {
    const g = this.spine.geometry;
    const NP = 14, NS = 30;
    let pos = g.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) {
      const n = (NP + 1) * (NS + 1);
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const uv = new Float32Array(n * 2), idx: number[] = [];
      for (let i = 0; i <= NP; i++) for (let j = 0; j <= NS; j++) { const k = i * (NS + 1) + j; uv[k * 2] = i / NP; uv[k * 2 + 1] = 1 - j / NS; }
      for (let i = 0; i < NP; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j; idx.push(a, a + NS + 1, a + 1, a + 1, a + NS + 1, a + NS + 2); }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      pos = g.getAttribute('position') as THREE.BufferAttribute;
    }
    // hinge points: the outer edges of the boards at the spine
    this.rightPivot.updateMatrix(); this.leftPivot.updateMatrix(); this.leftHalf.updateMatrix();
    const mR = this.rightPivot.matrix, mL = this._m.multiplyMatrices(this.leftPivot.matrix, this.leftHalf.matrix);
    const P0 = new THREE.Vector3(-G, -BT * 0.55, 0).applyMatrix4(mL), P3 = new THREE.Vector3(G, -BT * 0.55, 0).applyMatrix4(mR);
    const fore = new THREE.Vector3(-(G + BW), 0, 0).applyMatrix4(mL).add(new THREE.Vector3(G + BW, 0, 0).applyMatrix4(mR)).multiplyScalar(0.5);
    const chord = P3.clone().sub(P0), mid = P0.clone().add(P3).multiplyScalar(0.5);
    const n = new THREE.Vector3(chord.y, -chord.x, 0).normalize();
    if (n.dot(fore.clone().sub(mid)) > 0) n.negate();
    const span = Math.max(chord.length(), 0.028);
    const d = 0.62 * span;
    const P1 = P0.clone().addScaledVector(n, d), P2 = P3.clone().addScaledVector(n, d);
    const c = new THREE.Vector3();
    for (let i = 0; i <= NP; i++) {
      const t = i / NP;
      bez(P0, P1, P2, P3, t, c);
      const bulgeN = Math.sin(t * Math.PI);
      for (let j = 0; j <= NS; j++) {
        const z = -BH / 2 + (BH * j) / NS;
        // raised bands under the leather, and the headcap turned over at each end
        const zb = (z + BH / 2) / BH;
        let bump = 0;
        for (const bz of [0.18, 0.36, 0.54, 0.72, 0.88]) bump += Math.max(0, 1 - Math.abs(zb - bz) / 0.025) * 0.0016;
        const cap = Math.min(zb, 1 - zb) < 0.02 ? 0.0012 : 0;
        pos.setXYZ(i * (NS + 1) + j, c.x + n.x * (bump + cap) * bulgeN, c.y + n.y * (bump + cap) * bulgeN, z);
      }
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  private strapLast = -1;
  private strapUpdate(closed: number): void {
    if (Math.abs(closed - this.strapLast) < 1e-4 && this.straps[0].mesh.geometry.getAttribute('position')) return;
    this.strapLast = closed;
    const mR = this.rightPivot.matrix;
    const mL = this._m.multiplyMatrices(this.leftPivot.matrix, this.leftHalf.matrix);
    for (const st of this.straps) {
      // hanging: out from the back board's fore-edge, drooping; shut: wrapped up over onto the front board's pin
      const root = new THREE.Vector3(G + BW - 0.004, -BT - 0.0004, st.z).applyMatrix4(mR);
      const hang = [new THREE.Vector3(G + BW + 0.008, -BT * 0.6, st.z), new THREE.Vector3(G + BW + 0.014, -0.014, st.z), new THREE.Vector3(G + BW + 0.012, -0.032, st.z)].map((v) => v.applyMatrix4(mR));
      const pin = new THREE.Vector3(-(G + BW) + 0.012, -BT - 0.0006, st.z).applyMatrix4(mL);
      const over = new THREE.Vector3(-(G + BW) - 0.003, -BT * 0.5, st.z).applyMatrix4(mL);
      const wrapped = [root.clone().add(new THREE.Vector3(0.006, 0.004, 0)), over.clone().add(new THREE.Vector3(0.003, -0.004, 0)), over, pin];
      const pts = [root, ...hang.map((h, i) => h.lerp(wrapped[i + 1] ?? pin, closed))];
      const curve = new THREE.CatmullRomCurve3(pts);
      const NSg = 14, w = 0.0075;
      const arr: number[] = [], idx: number[] = [], uv: number[] = [];
      const p = new THREE.Vector3(), tg = new THREE.Vector3(), side = new THREE.Vector3(0, 0, 1);
      for (let i = 0; i <= NSg; i++) {
        const t = i / NSg;
        curve.getPoint(t, p); curve.getTangent(t, tg);
        arr.push(p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
        uv.push(0, t * 2, 1, t * 2);
        if (i < NSg) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = st.mesh.geometry;
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      // the brass catch rides the end of the strap
      curve.getPoint(1, p); curve.getTangent(1, tg);
      st.catch.position.copy(p);
      st.catch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg.clone().negate());
      st.catch.position.addScaledVector(tg, 0.004);
    }
  }

  // ------------------------------------------------------------------------------------------------ per frame
  update(q: BookPose): void {
    const o = clamp01(q.open);
    const alpha = 0.075 * o + q.jaw + q.breath * 0.012;
    const a = Math.PI * (1 - smooth(o));
    // page blocks: thickness by how far through the book we are
    this.pR = 0.0045 + 0.012 * (1 - q.through);
    this.pL = 0.0045 + 0.012 * q.through;
    const h = (this.pL + this.pR) / 2;
    this.rightPivot.rotation.z = alpha;
    this.leftPivot.position.set(0, h, 0);
    this.leftPivot.rotation.z = -alpha - a;
    this.leftHalf.position.set(0, -h, 0);
    this.shapeBlock(this.blockR.geometry, 'R', this.pR, q.breath);
    this.shapeBlock(this.blockL.geometry, 'L', this.pL, q.breath);
    this.spineGeoUpdate();
    this.strapUpdate(1 - smooth(clamp01(o * 1.6)));
    // leaf
    const turning = q.turn !== null && o > 0.9;
    this.leafF.visible = this.leafB.visible = turning;
    if (turning) {
      this.leafF.rotation.z = 0;
      this.shapeLeaf(q.turn!);
      // ride the halves' tilt: blend from the right half's to the left half's
      const w = smooth(clamp01(q.turn!));
      this.leafF.rotation.z = this.leafB.rotation.z = alpha * (1 - w) - alpha * w;
    }
    // lips: thicker as they talk, curled back in a snarl
    for (const l of this.lips) { l.scale.y = 1 + q.wag * 0.25 * Math.abs(Math.sin(q.time * 14)) - q.snarl * 0.35; l.position.y = -q.snarl * 0.0012; }
    for (const t of this.teeth) t.scale.y = 1 + q.snarl * 0.15;
    // face: at the head of the gutter, riding between the two halves
    const mR = this.rightPivot.matrix, mL = this._m.multiplyMatrices(this.leftPivot.matrix, this.leftHalf.matrix);
    const pr = this._v.set(G * 0.5, 0, -PAGE.h / 2 - 0.0035).applyMatrix4(mR), pl = this._v2.set(-G * 0.5, 0, -PAGE.h / 2 - 0.0035).applyMatrix4(mL);
    this.face.position.copy(pr).add(pl).multiplyScalar(0.5);
    this.face.rotation.set(0, 0, (alpha - alpha - a) * 0.5);
    this.face.visible = o > 0.25;
    // eyes: look at the target (default: up at the reader), blink and squint with the lids
    const look = q.look ?? this.object.worldToLocal(new THREE.Vector3(0, 0, 0));
    for (const e of this.eyes) {
      const holder = e.ball.parent!;
      holder.updateMatrixWorld();
      const local = this.object.localToWorld(look.clone());
      const dir = holder.worldToLocal(local).normalize();
      // the iris looks along the ball's +z
      e.ball.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const close = Math.max(q.blink, q.squint * 0.5);
      // the lids sit over the iris: the upper one comes down from the head side of the book
      e.lid.rotation.set(-0.3 - 1.25 * (1 - close), 0, 0);
      e.lower.rotation.set(-1.2 - q.squint * 0.45, 0, 0);
    }
    // the cover eye: open and watching while the book is shut, shut tight once it opens
    if (this.coverEye) {
      const ce = this.coverEye;
      const shut = Math.max(q.blink, smooth(clamp01(o * 2.2)));
      // it stares at you, whatever the other two are looking at
      const local = new THREE.Vector3(0, 0, 0);
      ce.holder.updateMatrixWorld();
      const dir = ce.holder.worldToLocal(local).normalize();
      // the iris faces the ball's +z; here the eye looks out along the holder's +y
      ce.ball.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.lengthSq() > 0 ? dir : new THREE.Vector3(0, 1, 0));
      ce.lid.rotation.set(0.15 + 2.25 * (1 - shut), 0, 0);
      ce.lower.rotation.set(1.3 + 0.45 * shut + q.squint * 0.3, 0, 0);
    }
    // tongue: hidden while the book is shut
    this.tongue.visible = o > 0.55;
    if (this.tongue.visible) this.shapeTongue(q);
  }
}

// ------------------------------------------------------------------------------------------------ helpers
function bez(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
}
function quadBez(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(b, 2 * u * t).addScaledVector(c, t * t);
}
function flipWinding(g: THREE.BufferGeometry): void {
  const idx = g.getIndex();
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const b = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b); } idx.needsUpdate = true; }
  else {
    for (const name of Object.keys(g.attributes)) {
      const at = g.getAttribute(name) as THREE.BufferAttribute;
      for (let i = 0; i < at.count; i += 3) for (let k = 0; k < at.itemSize; k++) { const t = at.getComponent(i + 1, k); at.setComponent(i + 1, k, at.getComponent(i + 2, k)); at.setComponent(i + 2, k, t); }
      at.needsUpdate = true;
    }
  }
  g.computeVertexNormals();
}
/** a non-indexed extruded board, re-grouped by face direction (top / bottom / edges) with planar UVs on the caps */
function regroup(g: THREE.BufferGeometry, s: number, capUV: (x: number, z: number, top: boolean) => [number, number]): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.getAttribute('position') as THREE.BufferAttribute, uvSrc = src.getAttribute('uv') as THREE.BufferAttribute;
  const buckets: number[][] = [[], [], []];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    // the mirrored board's faces wind backwards: fix as we go
    const flip = s < 0;
    const order = flip ? [i, i + 2, i + 1] : [i, i + 1, i + 2];
    const ny = flip ? -n.y : n.y;
    buckets[ny > 0.7 ? 0 : ny < -0.7 ? 1 : 2].push(...order);
  }
  const out = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [];
  let start = 0;
  buckets.forEach((bk, gi) => {
    for (const i of bk) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      pos.push(x, y, z);
      if (gi < 2) uv.push(...capUV(x, z, gi === 0));
      else uv.push(uvSrc ? uvSrc.getX(i) * 30 : (x + z) * 40, uvSrc ? uvSrc.getY(i) * 30 : y * 40);
    }
    out.addGroup(start, bk.length, gi);
    start += bk.length;
  });
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeVertexNormals();
  return out;
}
