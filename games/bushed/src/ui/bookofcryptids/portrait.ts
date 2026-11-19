// Plate portraits. Two sources, one look:
//   - model: the creature's real 3D model from src/creatures, posed, rendered offscreen from a 3/4 view at twice the
//     plate resolution, then turned into pixel art: box-downsampled, reduced to a small palette (median cut), cleaned
//     of stray single pixels, given hand-style highlights on lit planes and a 1-px selective dark outline;
//   - sdf: a procedural painting (sdf.ts, specs.ts) for cryptids without a model.
// registerPortraitModel(id, make) lets a creature module add (or replace) its own model later.
// Each portrait yields the colour art (transparent background) plus Ray's pencil sketch of the same silhouette,
// shown until the Book has tasted the creature. Results are cached per id.
import * as THREE from 'three';
import { Pix, type RGB, hex, mix, outline, bayer, ramp } from './pix';
import { renderSdf } from './sdf';
import { SDF_SPECS } from './specs';
import { hash2 } from '../../core/rng';

export const PW = 320, PH = 228;

export interface PortraitArt { color: Pix; sketch: Pix; /** ground contact (plate px): x, y, half-width */ foot: [number, number, number]; source: 'model' | 'sdf' }

export interface ModelSource {
  make: () => Promise<THREE.Object3D> | THREE.Object3D;
  /** view yaw / pitch (radians) around the model (yaw 0 = looking at its face, models face +Z) */
  yaw?: number; pitch?: number;
  /** fraction of the plate the model may fill */
  fill?: number;
}

const models = new Map<string, ModelSource>();
/** add or replace the 3D model a cryptid's plate portrait is rendered from */
export function registerPortraitModel(id: string, src: ModelSource | (() => Promise<THREE.Object3D> | THREE.Object3D)): void {
  models.set(id, typeof src === 'function' ? { make: src } : src);
  cache.delete(id);
}
export function hasPortraitSource(id: string): boolean { return models.has(id) || id in SDF_SPECS; }

const cache = new Map<string, Promise<PortraitArt | null>>();
let gl: THREE.WebGLRenderer | null = null;
/** the renderer used for model portraits (the game's); without one, model portraits wait */
export function setPortraitRenderer(r: THREE.WebGLRenderer): void { gl = r; }

const nextFrame = () => new Promise<void>((r) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export function portrait(id: string): Promise<PortraitArt | null> {
  let p = cache.get(id);
  if (!p) {
    p = build(id).catch((e) => { console.warn('[book] portrait failed', id, e); return null; });
    cache.set(id, p);
    // a failed model render (no renderer yet) may succeed later
    p.then((r) => { if (!r) setTimeout(() => cache.delete(id), 4000); });
  }
  return p;
}

async function build(id: string): Promise<PortraitArt | null> {
  const m = models.get(id);
  if (m) {
    if (!gl) return null;
    const color = await renderModel(m);
    if (color) return finish(color, 'model');
  }
  const mk = SDF_SPECS[id];
  if (!mk) return null;
  const r = await renderSdf(mk(), PW, PH, nextFrame);
  return finish(r.pix, 'sdf');
}

function finish(color: Pix, source: 'model' | 'sdf'): PortraitArt {
  outline(color, { selective: 0.4 });
  // where it stands: the lowest opaque row, and its width there
  let fy = 0, fx0 = PW, fx1 = 0;
  for (let y = PH - 1; y >= 0 && !fy; y--) for (let x = 0; x < PW; x++) if (color.alpha(x, y) > 128) { fy = y; break; }
  for (let y = Math.max(0, fy - 10); y <= fy; y++) for (let x = 0; x < PW; x++) if (color.alpha(x, y) > 128) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); }
  const foot: [number, number, number] = [(fx0 + fx1) / 2, fy, Math.max(8, (fx1 - fx0) / 2)];
  return { color, sketch: sketchOf(color), foot, source };
}

// ------------------------------------------------------------------------------------------------ model renders
const _box = new THREE.Box3(), _v = new THREE.Vector3();

async function renderModel(src: ModelSource): Promise<Pix | null> {
  const r = gl!;
  const obj = await src.make();
  await nextFrame();
  obj.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  scene.add(obj);
  // a studio for a field-guide plate: warm key from the upper left, cool fill, a rim behind
  scene.add(new THREE.HemisphereLight(0xd8d4c8, 0x3a3226, 1.1));
  const yaw = src.yaw ?? 0.75, pitch = src.pitch ?? 0.16;
  const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = new THREE.Vector3().crossVectors(right, back.clone().negate());
  const key = new THREE.DirectionalLight(0xffeedd, 2.2);
  key.position.copy(back).multiplyScalar(0.5).addScaledVector(up, 0.8).addScaledVector(right, -0.6).multiplyScalar(10);
  const rim = new THREE.DirectionalLight(0xc8d4ff, 1.4);
  rim.position.copy(back).multiplyScalar(-0.8).addScaledVector(right, 0.6).addScaledVector(up, 0.4).multiplyScalar(10);
  scene.add(key, rim);
  // frame the bounds in an orthographic camera
  _box.setFromObject(obj, true);
  if (_box.isEmpty()) return null;
  const c = _box.getCenter(new THREE.Vector3());
  const corners: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z));
  let sx = 0, sy = 0;
  for (const p of corners) { _v.copy(p).sub(c); sx = Math.max(sx, Math.abs(_v.dot(right))); sy = Math.max(sy, Math.abs(_v.dot(up))); }
  const fill = src.fill ?? 0.86;
  const aspect = PW / PH;
  const half = Math.max(sx / aspect, sy) / fill;
  const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.01, 100);
  cam.position.copy(c).addScaledVector(back, 20);
  cam.up.copy(up);
  cam.lookAt(c);
  const W2 = PW * 2, H2 = PH * 2;
  const rt = new THREE.WebGLRenderTarget(W2, H2, { type: THREE.HalfFloatType, depthBuffer: true });
  const prev = { rt: r.getRenderTarget(), auto: r.autoClear, cc: r.getClearColor(new THREE.Color()), ca: r.getClearAlpha(), sh: r.shadowMap.enabled };
  r.shadowMap.enabled = false;
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 0);
  r.clear(true, true, true);
  r.render(scene, cam);
  const buf = new Uint16Array(W2 * H2 * 4);
  r.readRenderTargetPixels(rt, 0, 0, W2, H2, buf);
  r.setRenderTarget(prev.rt); r.autoClear = prev.auto; r.setClearColor(prev.cc, prev.ca); r.shadowMap.enabled = prev.sh;
  rt.dispose();
  scene.remove(obj);
  // linear half floats -> sRGB, flipped, 2x2 box filter weighted by coverage
  const f = THREE.DataUtils.fromHalfFloat;
  const toS = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  const out = new Pix(PW, PH);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    let rr = 0, gg = 0, bb = 0, aa = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const o = ((H2 - 1 - (y * 2 + j)) * W2 + x * 2 + i) * 4;
      const a = Math.min(1, f(buf[o + 3]));
      rr += toS(Math.max(0, f(buf[o]))) * a; gg += toS(Math.max(0, f(buf[o + 1]))) * a; bb += toS(Math.max(0, f(buf[o + 2]))) * a; aa += a;
    }
    if (aa < 1.6) continue;
    out.set(x, y, [rr / aa, gg / aa, bb / aa]);
  }
  pixelise(out, 22);
  return out;
}

/** reduce to n colours (median cut, pushed toward a painter's palette), despeckle, add plane highlights */
export function pixelise(p: Pix, n: number): void {
  const px: RGB[] = [];
  for (let i = 0; i < p.w * p.h; i++) if (p.d[i * 4 + 3] > 128) px.push([p.d[i * 4], p.d[i * 4 + 1], p.d[i * 4 + 2]]);
  if (!px.length) return;
  // contrast and saturation lift first (renders come out flat)
  const lum = (c: RGB) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  let lo = 255, hi = 0;
  for (const c of px) { const l = lum(c); lo = Math.min(lo, l); hi = Math.max(hi, l); }
  const span = Math.max(30, hi - lo);
  const lift = (c: RGB): RGB => {
    const l = lum(c), k = ((l - lo) / span) * 235 + 10;
    const s = l > 0 ? k / l : 1;
    const g = (c[0] + c[1] + c[2]) / 3;
    return [c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, (g + (v - g) * 1.25) * s))) as RGB;
  };
  for (let i = 0; i < px.length; i++) px[i] = lift(px[i]);
  const pal = medianCut(px, n).map((c) => {
    // shadows lean cool and purple, lights lean warm: a painter's ramp, not a renderer's
    const l = lum(c) / 255;
    return l < 0.35 ? mix(c, [44, 30, 62], (0.35 - l) * 0.55) : l > 0.7 ? mix(c, [255, 236, 196], (l - 0.7) * 0.4) : c;
  });
  const idx = new Int16Array(p.w * p.h).fill(-1);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const o = (y * p.w + x) * 4;
    if (p.d[o + 3] < 128) continue;
    const c = lift([p.d[o], p.d[o + 1], p.d[o + 2]]);
    let best = 0, bd = 1e9;
    for (let k = 0; k < pal.length; k++) { const q = pal[k]; const d = (q[0] - c[0]) ** 2 * 0.3 + (q[1] - c[1]) ** 2 * 0.55 + (q[2] - c[2]) ** 2 * 0.15; if (d < bd) { bd = d; best = k; } }
    idx[y * p.w + x] = best;
  }
  // despeckle: a pixel unlike all four neighbours takes the commonest neighbour colour
  const idx2 = new Int16Array(idx);
  for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) {
    const i = y * p.w + x, v = idx[i];
    if (v < 0) continue;
    const nb = [idx[i - 1], idx[i + 1], idx[i - p.w], idx[i + p.w]];
    if (nb.includes(v) || nb.some((q) => q < 0)) continue;
    const cnt = new Map<number, number>();
    for (const q of nb) cnt.set(q, (cnt.get(q) ?? 0) + 1);
    let bk = v, bc = 0;
    for (const [k, c] of cnt) if (c > bc) { bc = c; bk = k; }
    if (bc >= 2) idx2[i] = bk;
  }
  // ordered palette by brightness, so "one step lighter" means something
  const order = pal.map((c, i) => [lum(c), i] as [number, number]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const rank = new Int16Array(pal.length); order.forEach((pi, r) => { rank[pi] = r; });
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = y * p.w + x, v = idx2[i];
    if (v < 0) continue;
    let c = pal[v];
    // hand highlight: the top-left edge of every lit mass catches one lighter pixel row
    const up = y > 0 ? idx2[i - p.w] : -1, left = x > 0 ? idx2[i - 1] : -1;
    if ((up < 0 || left < 0) && rank[v] > pal.length * 0.35 && rank[v] < pal.length - 1) c = mix(pal[order[rank[v] + 1]], [255, 240, 210], 0.15);
    // and the bottom-right rim sits a step darker
    const dn = y < p.h - 1 ? idx2[i + p.w] : -1, rt = x < p.w - 1 ? idx2[i + 1] : -1;
    if ((dn < 0 || rt < 0) && rank[v] > 0) c = pal[order[rank[v] - 1]];
    p.set(x, y, c);
  }
}

function medianCut(px: RGB[], n: number): RGB[] {
  let boxes: RGB[][] = [px];
  while (boxes.length < n) {
    // split the box with the widest channel range (weighted by population)
    let bi = -1, bw = -1, bc = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const c of b) { lo = Math.min(lo, c[ch]); hi = Math.max(hi, c[ch]); }
        const w = (hi - lo) * Math.sqrt(b.length);
        if (w > bw) { bw = w; bi = i; bc = ch; }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].slice().sort((a, c) => a[bc] - c[bc]);
    const m = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  return boxes.filter((b) => b.length).map((b) => {
    const s = [0, 0, 0];
    for (const c of b) { s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; }
    return [s[0] / b.length, s[1] / b.length, s[2] / b.length] as RGB;
  });
}

// ------------------------------------------------------------------------------------------------ Ray's sketch
const GRAPHITE = ramp('#4a4844', '#6a6660', '#8a857c');
/** Ray's pencil sketch of a silhouette: wobbly doubled contour lines, diagonal hatching, smudges */
export function sketchOf(color: Pix): Pix {
  const s = new Pix(color.w, color.h);
  const m = (x: number, y: number) => color.alpha(Math.round(x), Math.round(y)) > 128;
  const lumAt = (x: number, y: number) => { const c = color.get(x, y); return (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15) / 255; };
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    // a hand that wobbles: sample the silhouette through a slow wave
    const wx = x + Math.sin(y * 0.11 + x * 0.03) * 1.6, wy = y + Math.cos(x * 0.09) * 1.4;
    const inside = m(wx, wy);
    const edge = inside && (!m(wx + 1, wy) || !m(wx - 1, wy) || !m(wx, wy + 1) || !m(wx, wy - 1));
    const wx2 = x + Math.sin(y * 0.07 + 2) * 2.4, wy2 = y + Math.cos(x * 0.05 + 1) * 2;
    const ghost = m(wx2, wy2) && (!m(wx2 + 1, wy2) || !m(wx2, wy2 + 1));
    if (edge && hash2(x >> 2, y >> 2, 5) > 0.12) s.set(x, y, GRAPHITE[0]);
    else if (ghost && hash2(x, y, 6) > 0.45) s.set(x, y, GRAPHITE[2]);
    else if (inside) {
      // hatching: denser where the creature is darker
      const l = lumAt(x, y);
      if ((x + y) % 5 === 0 && hash2(x, y >> 3, 7) > l * 0.9) s.set(x, y, GRAPHITE[1]);
      else if (l < 0.3 && (x - y) % 6 === 0 && hash2(x >> 3, y, 8) > 0.4) s.set(x, y, GRAPHITE[2]);
    }
  }
  return s;
}

// ------------------------------------------------------------------------------------------------ plate scenes
const SCENES: Record<string, { sky: RGB[]; ground: RGB[]; trees: RGB; moon?: boolean; fog?: number; snow?: boolean; eave?: boolean; snags?: boolean; water?: boolean }> = {
  dusk: { sky: ramp('#3a3448', '#5a4a5e', '#8a6468', '#b88470', '#d8a47e'), ground: ramp('#1e1c18', '#2c2a22', '#3c3a2c'), trees: hex('#211e22') },
  night: { sky: ramp('#0c0e16', '#141a26', '#1c2636', '#283446'), ground: ramp('#0c0d0c', '#151614', '#1e201c'), trees: hex('#090a0c'), moon: true },
  fog: { sky: ramp('#7e8682', '#949a94', '#a8ada4', '#babdb2'), ground: ramp('#585e56', '#6a7066', '#7a8074'), trees: hex('#6c7470'), fog: 1 },
  day: { sky: ramp('#7e98a8', '#98b0bc', '#b4c6cc', '#cdd8d6'), ground: ramp('#3e4a2a', '#4e5c32', '#5e6c3a'), trees: hex('#2c3c32') },
  burn: { sky: ramp('#5a3c2c', '#80563a', '#a87448', '#c8925a'), ground: ramp('#1c1612', '#2c221a', '#3c2e22'), trees: hex('#140f0c'), snags: true },
  snow: { sky: ramp('#6a7a92', '#8a9ab0', '#aab8c8', '#c8d4de'), ground: ramp('#b0bed0', '#cad4e0', '#e2e8f0'), trees: hex('#2a3640'), snow: true },
  swamp: { sky: ramp('#3c4436', '#525a44', '#6c7252', '#8a8a62'), ground: ramp('#1a1e16', '#262c1e', '#323a26'), trees: hex('#1e2418'), water: true },
  eave: { sky: ramp('#141a26', '#1e2838', '#2c3a4c', '#3c4e60'), ground: ramp('#16120e', '#201a14', '#2a221a'), trees: hex('#0e0d0e'), eave: true, moon: true },
};

/** a painted plate background: a dithered sky, a treeline of spruce, ground, with soft vignette alpha */
export function plateScene(kind: string, w: number, h: number, seed: number, horizon = 0.66): Pix {
  const S = SCENES[kind] ?? SCENES.dusk;
  const p = new Pix(w, h);
  const hy = Math.round(h * horizon);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y < hy) {
      const v = 1 - y / hy;
      const k = Math.max(0, Math.min(S.sky.length - 1, Math.round((1 - v) * (S.sky.length - 1) + bayer(x, y) * 1.1)));
      p.set(x, y, S.sky[k]);
    } else {
      const v = (y - hy) / (h - hy);
      const k = Math.max(0, Math.min(S.ground.length - 1, Math.round(v * (S.ground.length - 1) * 1.2 + bayer(x, y) * 1.1)));
      p.set(x, y, S.ground[S.ground.length - 1 - k]);
    }
  }
  if (S.moon) {
    const mx = Math.round(w * 0.78), my = Math.round(h * 0.2);
    p.ellipse(mx, my, 11, 11, (_x, _y, u, v) => (u * u + v * v > 0.8 ? hex('#8a94a0') : (u + 0.3) ** 2 + (v - 0.2) ** 2 < 0.12 ? hex('#b8bcb4') : hex('#d8d8cc')));
  }
  // treelines: two layers of spruce spires
  const rows = S.fog ? [[0.5, 0.55], [0.85, 0.25]] : [[0.55, 1], [0.9, 0.55]];
  for (const [hgt, dark] of rows) {
    const col = mix(S.sky[Math.min(S.sky.length - 1, 1)], S.trees, dark);
    let x = -4;
    let i = 0;
    while (x < w + 4) {
      const th = (0.16 + hash2(i, seed, 3) * 0.22) * h * hgt, tw = 7 + hash2(i, seed, 4) * 9;
      const base = hy + 2;
      for (let y = Math.round(base - th); y <= base; y++) {
        const t = (y - (base - th)) / th;
        // spruce: a spire with tiers of drooping branches
        const tier = 0.75 + 0.25 * Math.abs(Math.sin(t * 14 + i));
        const half = Math.max(0.5, t * tw * 0.5 * tier);
        for (let xx = Math.round(x - half); xx <= Math.round(x + half); xx++) if (xx >= 0 && xx < w) p.set(xx, y, col);
      }
      x += tw * (0.55 + hash2(i, seed, 5) * 0.5);
      i++;
    }
  }
  if (S.snags) for (let k = 0; k < 6; k++) {
    const x = Math.round(w * (0.06 + k * 0.17 + hash2(k, seed, 9) * 0.05)), th = Math.round(h * (0.22 + hash2(k, seed, 8) * 0.25));
    for (let y = hy + 4 - th; y <= hy + 4; y++) for (let xx = x - 1; xx <= x + 1 + (y > hy - 6 ? 1 : 0); xx++) p.set(xx, y, S.trees);
    p.line(x, hy - th + 8, x + 6, hy - th + 2, S.trees);
  }
  if (S.water) for (let y = hy + 3; y < hy + 16; y++) for (let x = 0; x < w; x++) if ((y - hy) % 3 === 0 && hash2(x >> 3, y, seed) > 0.4) p.set(x, y, mix(S.sky[2], S.ground[2], 0.5));
  if (S.snow) for (let i = 0; i < 160; i++) p.set(Math.floor(hash2(i, 1, seed) * w), Math.floor(hash2(i, 2, seed) * hy), hex('#e8eef4'));
  if (S.eave) {
    // the cabin eave: dark logs and a rafter across the top
    for (let y = 0; y < 26; y++) for (let x = 0; x < w; x++) p.set(x, y, (y % 9 === 0) ? hex('#0c0a08') : mix(hex('#2a2018'), hex('#3c2e22'), (y % 9) / 9 * (0.5 + 0.5 * hash2(x >> 4, y / 9, 3))));
  }
  return p;
}

/** a cast shadow under the creature: a dithered ellipse */
export function groundShadow(p: Pix, cx: number, cy: number, rx: number): void {
  const ry = Math.max(3, rx * 0.16);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const u = (x - cx) / rx, v = (y - cy) / ry, d = u * u + v * v;
    if (d > 1) continue;
    if (d > 0.55 && ((x + y) & 1)) continue;
    p.mul(x, y, 0.55);
  }
}
