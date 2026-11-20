// Neon window signs as real glass tubes: a tiny stroke font bent into tubes (merged per colour), dark electrode
// ends, a wire frame with chains, and a soft additive halo behind. One letter can be a separate mesh that
// stutters (every small-town OPEN sign has a tired letter).
import * as THREE from 'three';
import { Mesher, V, tube, boxAt, defineMat, hasMat } from '../kit';
import { GUV } from './print';
import { loadTex } from '../../gfx/tex';

/** strokes per letter on a 0..0.8 (wide) x 0..1 (tall) grid */
const STROKES: Record<string, [number, number][][]> = {
  O: [Array.from({ length: 19 }, (_, i) => { const a = (i / 18) * Math.PI * 2; return [0.4 + Math.sin(a) * 0.4, 0.5 + Math.cos(a) * 0.5] as [number, number]; })],
  P: [[[0, 0], [0, 1], [0.55, 1], [0.75, 0.9], [0.8, 0.75], [0.75, 0.6], [0.55, 0.5], [0, 0.5]]],
  E: [[[0.8, 1], [0, 1], [0, 0], [0.8, 0]], [[0, 0.5], [0.6, 0.5]]],
  N: [[[0, 0], [0, 1], [0.8, 0], [0.8, 1]]],
  B: [[[0, 0], [0, 1], [0.5, 1], [0.7, 0.92], [0.72, 0.65], [0.5, 0.54], [0, 0.54]], [[0.5, 0.54], [0.76, 0.44], [0.78, 0.12], [0.55, 0], [0, 0]]],
  I: [[[0.2, 0], [0.2, 1]]],
  R: [[[0, 0], [0, 1], [0.55, 1], [0.75, 0.9], [0.8, 0.75], [0.75, 0.6], [0.55, 0.5], [0, 0.5]], [[0.4, 0.5], [0.8, 0]]],
  È: [[[0.8, 1], [0, 1], [0, 0], [0.8, 0]], [[0, 0.5], [0.6, 0.5]], [[0.2, 1.3], [0.5, 1.12]]],
  A: [[[0, 0], [0.4, 1], [0.8, 0]], [[0.16, 0.4], [0.64, 0.4]]],
  T: [[[0, 1], [0.8, 1]], [[0.4, 1], [0.4, 0]]],
  V: [[[0, 1], [0.4, 0], [0.8, 1]]],
  L: [[[0, 1], [0, 0], [0.7, 0]]],
};
const ADV: Record<string, number> = { I: 0.45 };

const mats = new Map<string, THREE.MeshBasicMaterial>();
/** a neon tube colour (unlit, not tone mapped so it blooms) and its halo; returns the two material names */
export function neonMats(name: string, color: number, k = 5): { tube: string; halo: string; mat: THREE.MeshBasicMaterial } {
  const tn = `neon_${name}`, hn = `neonhalo_${name}`;
  if (!hasMat(tn)) {
    const m = new THREE.MeshBasicMaterial({ name: tn, color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
    mats.set(tn, m);
    defineMat(tn, m);
    defineMat(hn, new THREE.MeshBasicMaterial({
      name: hn, map: loadTex('places/store_grime.png', { repeat: false }), color: new THREE.Color(color).multiplyScalar(1.5),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    }));
  }
  return { tube: tn, halo: hn, mat: mats.get(tn)! };
}

/**
 * Write a neon word into `ms` (letters `h` tall) centred at the current origin in the XY plane, readable from +Z.
 * The letter at `flickerAt` (index) goes into `flick` instead, if given.
 */
export function neonWord(ms: Mesher, word: string, h: number, tubeMat: string, o: { r?: number; flick?: Mesher; flickerAt?: number; gap?: number } = {}): number {
  const r = o.r ?? 0.006, gap = (o.gap ?? 0.28) * h;
  const widths = [...word].map((c) => (ADV[c] ?? 0.8) * h);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (word.length - 1);
  let x = -total / 2;
  [...word].forEach((c, i) => {
    const target = o.flick && o.flickerAt === i ? o.flick : ms;
    for (const s of STROKES[c] ?? []) {
      const pts = s.map(([u, v]) => V(x + u * h, (v - 0.5) * h, 0));
      tube(target, tubeMat, pts, r, 6, { smooth: false });
      // dark electrode caps at the stroke ends
      for (const p of [pts[0], pts[pts.length - 1]]) boxAt(target, 'soot', p.x, p.y, -0.008, r * 2.2, r * 2.2, 0.03);
    }
    x += widths[i] + gap;
  });
  return total;
}

/** a rectangular neon border loop */
export function neonRect(ms: Mesher, w: number, h: number, tubeMat: string, r = 0.006): void {
  const R = 0.04;
  const pts: THREE.Vector3[] = [];
  const corner = (cx: number, cy: number, a0: number) => { for (let k = 0; k <= 3; k++) { const a = a0 + (k / 3) * Math.PI / 2; pts.push(V(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0)); } };
  corner(w / 2 - R, h / 2 - R, 0); corner(-w / 2 + R, h / 2 - R, Math.PI / 2); corner(-w / 2 + R, -h / 2 + R, Math.PI); corner(w / 2 - R, -h / 2 + R, Math.PI * 1.5);
  pts.push(pts[0].clone());
  tube(ms, tubeMat, pts, r, 6, { smooth: false });
}

/** the halo quad behind a sign (grime atlas glow cell; the halo material carries the colour) */
export function neonHalo(ms: Mesher, haloMat: string, w: number, h: number, z = -0.03): void {
  const [u0, v0, u1, v1] = GUV('g_glow');
  ms.quad(haloMat, V(-w / 2, -h / 2, z), V(w / 2, -h / 2, z), V(w / 2, h / 2, z), V(-w / 2, h / 2, z), [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
}
