// Reading a held object's shape, the way Gacha Garage's FPBody.frame() reads an item's bounds so every grip lands
// on the thing itself: an object-local bounding box, a cloud of surface points, the principal (longest) axis and a
// radius profile along any axis. From that, how a hand should take it: round a handle, round a bottle's body with
// the neck up, a strip or pouch pinched flat, a can wrapped, a box cradled on the palm.
import * as THREE from 'three';

export type GripStyle = 'handle' | 'wrap' | 'flat' | 'cradle';

export interface ObjShape {
  /** object-local bounds (the object's own frame, children included) */
  box: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  /** index of the longest / middle / shortest local axis */
  long: 0 | 1 | 2; mid: 0 | 1 | 2; short: 0 | 1 | 2;
  /** object-local points (subsampled vertices) */
  pts: THREE.Vector3[];
  /** fitTool()ed tools: handle along +Y, grip at the origin */
  fitted: boolean;
}

const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
export const axisVec = (i: number, s = 1) => AX[i].clone().multiplyScalar(s);

export function analyse(obj: THREE.Object3D): ObjShape {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const box = new THREE.Box3();
  const pts: THREE.Vector3[] = [];
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 3000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      box.expandByPoint(v);
      pts.push(v.clone());
    }
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.04, -0.04, -0.04), new THREE.Vector3(0.04, 0.04, 0.04));
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const ord = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a)) as (0 | 1 | 2)[];
  return { box, size, center, long: ord[0], mid: ord[1], short: ord[2], pts, fitted: obj.userData.length !== undefined };
}

/**
 * Radius of the object around the line through `c` along unit `axis`, over the slice |t - t0| < band (object
 * local, t measured from c). 85th percentile, so a stray vertex doesn't fatten the grip.
 */
export function radiusAt(s: ObjShape, c: THREE.Vector3, axis: THREE.Vector3, t0: number, band = 0.018): number {
  const rs: number[] = [];
  const d = new THREE.Vector3();
  for (const p of s.pts) {
    d.subVectors(p, c);
    const t = d.dot(axis);
    if (Math.abs(t - t0) > band) continue;
    d.addScaledVector(axis, -t);
    rs.push(d.length());
  }
  if (!rs.length) return Math.min(s.size.getComponent(s.mid), s.size.getComponent(s.short)) / 2;
  rs.sort((a, b) => a - b);
  return rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.85))];
}

/** extent of the object along unit `axis` from point c: [min t, max t] */
export function extent(s: ObjShape, c: THREE.Vector3, axis: THREE.Vector3): [number, number] {
  let lo = Infinity, hi = -Infinity;
  const d = new THREE.Vector3();
  for (const p of s.pts) { const t = d.subVectors(p, c).dot(axis); lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return lo <= hi ? [lo, hi] : [-0.05, 0.05];
}

/** which way a hand should take a small object it holds by itself */
export function gripStyle(s: ObjShape, kind: string): GripStyle {
  const L = s.size.getComponent(s.long), M = s.size.getComponent(s.mid), S = s.size.getComponent(s.short);
  if (kind === 'book' || kind === 'jerky') return 'flat';
  if (kind === 'bottle') return 'wrap';
  if (s.fitted) return 'handle';
  if (L > 2.2 * M && M < 0.11) return 'handle';                       // splits, files, knives, fish, kindling
  if (S < 0.035 && L < 0.32) return 'flat';                            // pouches, papers, packets
  // upright cans, jars and bottles (products are built y-up): narrow and taller than wide
  const w = Math.max(s.size.x, s.size.z);
  if (s.size.y >= 0.75 * w && w < 0.095) return 'wrap';
  // wide tins, loaves and boxes: taken by the rim from the side (the hand stays in view, not hidden under it)
  if (w > 0.13 && w < 0.3 && s.size.y > 0.035) return 'wrap';
  return 'cradle';
}

/** a stand-in mass (kg) from the bounds when the game doesn't say (water-ish density, mostly air) */
export function guessMass(s: ObjShape): number {
  return Math.min(25, Math.max(0.1, s.size.x * s.size.y * s.size.z * 420));
}
