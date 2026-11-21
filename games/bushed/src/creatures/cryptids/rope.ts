// A live rope: one tube of fixed size (segments x sides) whose centreline is rewritten every frame in place (no
// allocation), with a twisted-manila canvas texture shared by every rope. The roperite's snout is one (coiled into a
// lasso loop, thrown, pulled taut to a log). Points are given in the rope's parent space.
//   const r = new LiveRope(24, 0.022); parent.add(r.mesh); ... r.set(points); // points: N + 1 Vector3s
import * as THREE from 'three';
import { canvasTex } from '../../gfx/tex';

let mat: THREE.MeshStandardMaterial | null = null;
function ropeMat(): THREE.MeshStandardMaterial {
  if (mat) return mat;
  const W = 32, H = 64;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // three strands twisting round the rope: diagonal bands, a dark groove between them, fibre noise
    const u = (x / W + y / H * 1.5) * 3 % 1;
    const groove = Math.min(u, 1 - u) < 0.08 ? 0.45 : 1;
    const fib = 0.85 + 0.3 * Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1);
    const sh = 0.8 + 0.25 * Math.sin(u * Math.PI);
    const k = groove * fib * sh;
    const o = (y * W + x) * 4;
    img.data[o] = Math.min(255, 158 * k); img.data[o + 1] = Math.min(255, 128 * k); img.data[o + 2] = Math.min(255, 82 * k); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = canvasTex(cv, { srgb: true, repeat: true, nearest: true });
  mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0 });
  return mat;
}

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3();

export class LiveRope {
  readonly mesh: THREE.Mesh;
  readonly pts: THREE.Vector3[];
  private pos: Float32Array;
  private nrm: Float32Array;
  constructor(readonly segs = 24, public radius = 0.022, readonly sides = 6) {
    const nv = (segs + 1) * sides;
    this.pos = new Float32Array(nv * 3); this.nrm = new Float32Array(nv * 3);
    const uv = new Float32Array(nv * 2), idx: number[] = [];
    for (let i = 0; i <= segs; i++) for (let k = 0; k < sides; k++) {
      const v = i * sides + k;
      uv[v * 2] = k / sides; uv[v * 2 + 1] = i * 0.6;
      if (i < segs) { const a = v, b = i * sides + (k + 1) % sides, c = a + sides, d = b + sides; idx.push(a, c, b, b, c, d); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, ropeMat());
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.mesh.name = 'rope';
    this.pts = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
  }
  /** rebuild the tube round this.pts (fill them first) */
  commit(): void {
    const n = this.segs, s = this.sides, P = this.pts, r = this.radius;
    for (let i = 0; i <= n; i++) {
      _t.subVectors(P[Math.min(n, i + 1)], P[Math.max(0, i - 1)]);
      if (_t.lengthSq() < 1e-10) _t.set(0, 0, 1);
      _t.normalize();
      _n.crossVectors(_t, _up); if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0);
      _n.normalize(); _b.crossVectors(_n, _t);
      // the very ends thin to a frayed tip
      const rr = r * (i === n ? 0.6 : 1);
      for (let k = 0; k < s; k++) {
        const a = (k / s) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        _p.copy(_n).multiplyScalar(c).addScaledVector(_b, sn);
        const o = (i * s + k) * 3;
        this.nrm[o] = _p.x; this.nrm[o + 1] = _p.y; this.nrm[o + 2] = _p.z;
        this.pos[o] = P[i].x + _p.x * rr; this.pos[o + 1] = P[i].y + _p.y * rr; this.pos[o + 2] = P[i].z + _p.z * rr;
      }
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
  }
}
