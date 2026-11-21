// Item icons: hand-quality 48 x 48 pixel art for every item, made from the item's own 3D model. The model is posed
// like a classic inventory icon (long tools on the diagonal, head top-right; bottles upright, leaning; everything
// else in a three-quarter view from above), rendered offscreen at 4x under a fixed top-left key light, then
// pixel-art processed:
//   1. 4x4 box downsample with a hard alpha cut (no anti-aliased fringe)
//   2. value and saturation punched up, shadows hue-shifted cool, lights warm (hand-picked ramps, not photo colour)
//   3. per-icon palette (k-means, 14 colours) and a cleanup pass that removes lonely pixels
//   4. lit-edge pixels lifted and shade-edge pixels sunk one palette step (the hand-drawn rim light)
//   5. a 1 px selective outline: dark, hue-tinted from the colour it wraps, lighter on the lit top-left side
//
//   itemIcon('jerky')          -> HTMLCanvasElement 48x48 (filled in place as soon as the model is ready)
//   itemIconTex('jerky')       -> THREE.Texture (nearest, updates with the canvas)
//   iconReady('jerky')         -> Promise<HTMLCanvasElement>
//   setIconModelSource(fn)     -> use the game's models (game.toolModel) instead of loading them here
import * as THREE from 'three';
import { ITEMS } from '../../game/items';
import { buildProduct } from '../../places/products';
import { loadProp, PROP_META } from '../../places/props';

export const ICON_PX = 48;
const SS = 4;
const INNER = 42;

type ModelSource = (id: string) => THREE.Object3D | null | Promise<THREE.Object3D | null>;
let source: ModelSource | null = null;
/** where icons get their models (defaults: products are built, props are loaded) */
export function setIconModelSource(f: ModelSource | null): void { source = f; }

interface Entry { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture | null; ready: Promise<HTMLCanvasElement>; done: boolean }
const icons = new Map<string, Entry>();

/** the icon canvas for an item (48 x 48). Blank until its model has been rendered; then drawn in place. */
export function itemIcon(id: string): HTMLCanvasElement { return entry(id).canvas; }

/** the icon as a texture (nearest filtering, no mipmaps), refreshed when the icon is drawn */
export function itemIconTex(id: string): THREE.Texture {
  const e = entry(id);
  if (!e.tex) {
    e.tex = new THREE.CanvasTexture(e.canvas);
    e.tex.colorSpace = THREE.SRGBColorSpace;
    e.tex.magFilter = THREE.NearestFilter;
    e.tex.minFilter = THREE.NearestFilter;
    e.tex.generateMipmaps = false;
  }
  return e.tex;
}

export function iconReady(id: string): Promise<HTMLCanvasElement> { return entry(id).ready; }
/** an icon (item or objectIcon key) has been drawn */
export function iconDone(key: string): boolean { return icons.get(key)?.done ?? false; }

/** every icon in ITEMS (for warming up or a contact sheet) */
export function allIconsReady(ids = Object.keys(ITEMS)): Promise<HTMLCanvasElement[]> { return Promise.all(ids.map(iconReady)); }

/**
 * An icon of any object (a carried log or round, a prop with no item id), cached by key: the first object rendered
 * under a key stands for every later one (keys like 'piece:birch:round').
 */
export function objectIcon(key: string, obj: THREE.Object3D): HTMLCanvasElement {
  let e = icons.get(key);
  if (e) return e.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PX;
  const m = obj.clone(true);
  m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.setScalar(1);
  e = { canvas, tex: null, ready: null as unknown as Promise<HTMLCanvasElement>, done: false };
  const ent = e;
  ent.ready = enqueue(async () => {
    await texturesReady(m);
    canvas.getContext('2d')!.putImageData(pixelArt(renderModel(m, key), key), 0, 0);
    ent.done = true;
    return canvas;
  });
  icons.set(key, ent);
  return canvas;
}

function entry(id: string): Entry {
  let e = icons.get(id);
  if (e) return e;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PX;
  canvas.dataset.item = id;
  const ent: Entry = { canvas, tex: null, ready: null as unknown as Promise<HTMLCanvasElement>, done: false };
  ent.ready = enqueue(() => make(id, ent));
  icons.set(id, ent);
  return ent;
}

// one icon at a time through the shared offscreen renderer; its WebGL context is released when the queue idles
let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
function enqueue<T>(f: () => Promise<T>): Promise<T> {
  pending++;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const p = chain.then(f, f);
  chain = p.catch(() => undefined).then(() => { if (--pending === 0) idleTimer = setTimeout(release, 4000); });
  return p;
}
function release(): void {
  if (!R || pending) return;
  R.dispose();
  R.forceContextLoss();
  R = null; scene = null; cam = null; readback = null;
}

async function modelFor(id: string): Promise<THREE.Object3D | null> {
  if (source) { try { const m = await source(id); if (m) return m.clone(true); } catch { /* fall through */ } }
  const def = ITEMS[id];
  if (!def) return null;
  try {
    if (def.model.startsWith('gen:')) return buildProduct(id);
    if (def.model in PROP_META) return await loadProp(def.model);
  } catch { /* missing asset */ }
  return null;
}

/** wait (up to 8 s) until every texture the model uses has its image */
export async function texturesReady(root: THREE.Object3D, timeout = 8000): Promise<void> {
  const texs = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) for (const v of Object.values(mat)) if (v instanceof THREE.Texture) texs.add(v);
  });
  const ok = (t: THREE.Texture) => {
    const img = t.image as { complete?: boolean; naturalWidth?: number; width?: number } | null | undefined;
    if (!img) return false;
    if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) return img.complete && (img.naturalWidth ?? 0) > 0;
    return (img.width ?? 1) > 0;
  };
  const t0 = performance.now();
  while ([...texs].some((t) => !ok(t)) && performance.now() - t0 < timeout) await new Promise((r) => setTimeout(r, 50));
}

async function make(id: string, e: Entry): Promise<HTMLCanvasElement> {
  const m = await modelFor(id);
  const g = e.canvas.getContext('2d')!;
  g.clearRect(0, 0, ICON_PX, ICON_PX);
  if (m) await texturesReady(m);
  if (m) {
    const img = renderModel(m, id);
    g.putImageData(pixelArt(img, id), 0, 0);
  } else drawUnknown(g, id);
  e.done = true;
  if (e.tex) e.tex.needsUpdate = true;
  return e.canvas;
}

// ------------------------------------------------------------------------------------------------ offscreen render
let R: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let cam: THREE.OrthographicCamera | null = null;
let readback: CanvasRenderingContext2D | null = null;

function setup(): void {
  if (R) return;
  const N = ICON_PX * SS;
  R = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  R.setPixelRatio(1);
  R.setSize(N, N, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.NoToneMapping;
  R.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  // a fixed studio: warm key from the top left (in front), cool sky fill, a rim from behind on the right
  scene.add(new THREE.HemisphereLight(0xe8eefc, 0x3a3024, 1.15));
  const key = new THREE.DirectionalLight(0xfff0d8, 3.0); key.position.set(-1.2, 1.6, 1.4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb8d0ff, 1.6); rim.position.set(1.4, 0.6, -1.2); scene.add(rim);
  const front = new THREE.DirectionalLight(0xffffff, 0.55); front.position.set(0, 0, 1); scene.add(front);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  cam.position.set(0, 0, 20);
  const rc = document.createElement('canvas');
  rc.width = rc.height = N;
  readback = rc.getContext('2d', { willReadFrequently: true })!;
}

/** world-space vertices of a model (subsampled) */
function verts(root: THREE.Object3D, max = 6000): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const pos = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / max));
    for (let i = 0; i < pos.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  return out;
}

/** pose the model like a hand-drawn inventory icon */
function pose(m: THREE.Object3D, id: string): THREE.Group {
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  holder.add(inner);
  inner.add(m);
  m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.setScalar(1);
  // glow cards (lantern flames) stay out of the icon
  m.traverse((o) => { if (o.name === 'flame') o.visible = false; });
  m.updateMatrixWorld(true);
  const pts = verts(m);
  const box = new THREE.Box3().setFromPoints(pts);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  m.position.sub(c);
  for (const p of pts) p.sub(c);
  const dims = [size.x, size.y, size.z];
  const order = [0, 1, 2].sort((a, b) => dims[b] - dims[a]);
  const elong = dims[order[0]] / Math.max(1e-4, dims[order[1]]);
  const axis = (i: number) => new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
  const q = new THREE.Quaternion();
  const def = ITEMS[id];
  const roundish = dims[order[1]] / Math.max(1e-4, dims[order[2]]) < 1.5;
  if (elong > 1.75 && !(order[0] === 1 && roundish && !def?.tool)) {
    // long thing: profile on the diagonal, heavy end (more spread) top right
    const li = order[0], mi = order[1];
    const spread = (lo: boolean) => {
      let s = 0;
      const L = dims[li];
      for (const p of pts) {
        const t = (p.getComponent(li) + L / 2) / L;
        if (lo ? t < 0.2 : t > 0.8) s = Math.max(s, Math.abs(p.getComponent(mi)) + Math.abs(p.getComponent(order[2])) * 0.5);
      }
      return s;
    };
    const head = spread(false) >= spread(true) ? 1 : -1;
    const L = axis(li).multiplyScalar(head), M = axis(mi);
    const S = new THREE.Vector3().crossVectors(L, M);
    const from = new THREE.Matrix4().makeBasis(L, M, S);
    const d = Math.SQRT1_2;
    const to = new THREE.Matrix4().makeBasis(new THREE.Vector3(d, d, 0), new THREE.Vector3(-d, d, 0), new THREE.Vector3(0, 0, 1));
    q.setFromRotationMatrix(to.multiply(from.transpose()));
    // a little roll so the thickness reads, and the edge catches the key light
    holder.quaternion.setFromAxisAngle(new THREE.Vector3(d, d, 0), -0.42);
  } else if (order[0] === 1 && elong > 1.35) {
    // bottles, tins standing up: upright, leaning, seen a little from above
    q.setFromEuler(new THREE.Euler(0, 0.6, 0));
    holder.quaternion.setFromEuler(new THREE.Euler(0.32, 0, -0.18));
  } else {
    // compact things: three-quarter view from above; flat things more from above
    const flat = order[2] === 1 && dims[1] < dims[order[0]] * 0.45;
    q.setFromEuler(new THREE.Euler(0, flat ? 0.45 : 0.7, 0));
    holder.quaternion.setFromEuler(new THREE.Euler(flat ? 0.85 : 0.5, 0, 0));
  }
  inner.quaternion.copy(q);
  return holder;
}

function renderModel(model: THREE.Object3D, id: string): ImageData {
  setup();
  const N = ICON_PX * SS;
  const holder = pose(model, id);
  scene!.add(holder);
  holder.updateMatrixWorld(true);
  // fit the ortho camera to the posed silhouette
  const pts = verts(holder);
  const b = new THREE.Box3().setFromPoints(pts);
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
  const span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) * (ICON_PX / INNER) / 2;
  cam!.left = cx - span; cam!.right = cx + span; cam!.top = cy + span; cam!.bottom = cy - span;
  cam!.near = 0.01; cam!.far = 100; cam!.position.set(0, 0, Math.max(10, b.max.z + 5));
  cam!.updateProjectionMatrix();
  R!.render(scene!, cam!);
  scene!.remove(holder);
  readback!.clearRect(0, 0, N, N);
  readback!.drawImage(R!.domElement, 0, 0);
  return readback!.getImageData(0, 0, N, N);
}

// ------------------------------------------------------------------------------------------------ pixel-art pass
type RGB = [number, number, number];

function rgb2hsl(r: number, g: number, b: number): RGB {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hsl2rgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** perceptual-ish distance (weighted RGB) */
function dist(a: RGB, b: RGB): number {
  const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm) * dr * dr + 4 * dg * dg + (3 - rm) * db * db;
}
/** move a hue toward a target hue by up to amt (0..1 of a turn) */
function hueToward(h: number, target: number, amt: number): number {
  let d = target - h;
  if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
  return (h + Math.sign(d) * Math.min(Math.abs(d), amt) + 1) % 1;
}

/** the hand-pixel look: value punch, hue-shifted ramps */
function stylise(c: RGB): RGB {
  let [h, s, l] = rgb2hsl(c[0], c[1], c[2]);
  // contrast S-curve around the middle, keep a little headroom
  const k = 1.35;
  l = 0.5 + (l - 0.5) * k;
  l = Math.max(0.03, Math.min(0.97, l));
  s = Math.min(1, s * 1.22 + 0.03);
  if (l < 0.42) { h = hueToward(h, 0.72, (0.42 - l) * 0.12); s = Math.min(1, s + (0.42 - l) * 0.15); }
  else if (l > 0.62) h = hueToward(h, 0.12, (l - 0.62) * 0.1);
  return hsl2rgb(h, s, l);
}

function kmeans(cols: RGB[], k: number): RGB[] {
  if (cols.length <= k) return cols.map((c) => [...c] as RGB);
  // seed: spread along luminance, then farthest-point
  const sorted = [...cols].sort((a, b) => lum(a) - lum(b));
  const cent: RGB[] = [sorted[0], sorted[sorted.length - 1], sorted[sorted.length >> 1]].map((c) => [...c] as RGB);
  while (cent.length < k) {
    let best = cols[0], bd = -1;
    for (const c of cols) { let d = Infinity; for (const m of cent) d = Math.min(d, dist(c, m)); if (d > bd) { bd = d; best = c; } }
    cent.push([...best] as RGB);
  }
  const asg = new Int32Array(cols.length);
  for (let it = 0; it < 10; it++) {
    const sum = cent.map(() => [0, 0, 0, 0]);
    cols.forEach((c, i) => {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < cent.length; j++) { const d = dist(c, cent[j]); if (d < bd) { bd = d; bi = j; } }
      asg[i] = bi; const s = sum[bi]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++;
    });
    cent.forEach((m, j) => { const s = sum[j]; if (s[3]) { m[0] = s[0] / s[3]; m[1] = s[1] / s[3]; m[2] = s[2] / s[3]; } });
  }
  return cent;
}

function nearest(pal: RGB[], c: RGB): number {
  let bi = 0, bd = Infinity;
  for (let j = 0; j < pal.length; j++) { const d = dist(c, pal[j]); if (d < bd) { bd = d; bi = j; } }
  return bi;
}

/** the palette colour one step lighter / darker than pal[i] with the closest hue */
function step(pal: RGB[], i: number, dir: 1 | -1): number {
  const c = pal[i], L = lum(c), hs = rgb2hsl(c[0], c[1], c[2]);
  let bi = i, bs = Infinity;
  for (let j = 0; j < pal.length; j++) {
    const d = lum(pal[j]) - L;
    if (dir > 0 ? d < 0.04 : d > -0.04) continue;
    const h2 = rgb2hsl(pal[j][0], pal[j][1], pal[j][2]);
    let dh = Math.abs(h2[0] - hs[0]); dh = Math.min(dh, 1 - dh);
    const sc = Math.abs(d) * 1.2 + dh * (hs[1] > 0.12 ? 2.5 : 0.3) + Math.abs(h2[1] - hs[1]) * 0.6;
    if (sc < bs) { bs = sc; bi = j; }
  }
  return bi;
}

export function pixelArt(src: ImageData, seedId = ''): ImageData {
  const N = ICON_PX, S = src.width / N, d = src.data;
  const alpha = new Uint8Array(N * N);
  const col: (RGB | null)[] = new Array(N * N).fill(null);
  // 1. box downsample, hard alpha
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = 0, r = 0, g = 0, b = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = ((y * S + j) * src.width + x * S + i) * 4, w = d[k + 3] / 255;
      a += w; r += d[k] * w; g += d[k + 1] * w; b += d[k + 2] * w;
    }
    const cov = a / (S * S);
    if (cov >= 0.3 && a > 0) { alpha[y * N + x] = 1; col[y * N + x] = stylise([r / a / 255, g / a / 255, b / a / 255]); }
  }
  // remove one-pixel specks and fill pinholes in the silhouette
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && alpha[Y * N + X]) n++; }
    if (alpha[i] && n === 0) { alpha[i] = 0; col[i] = null; }
    else if (!alpha[i] && n >= 3) {
      const nb: RGB[] = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = col[(y + dy) * N + x + dx]; if (c) nb.push(c); }
      alpha[i] = 1; col[i] = [nb.reduce((s, c) => s + c[0], 0) / nb.length, nb.reduce((s, c) => s + c[1], 0) / nb.length, nb.reduce((s, c) => s + c[2], 0) / nb.length];
    }
  }
  // 2. palette
  const solid: RGB[] = [];
  for (let i = 0; i < N * N; i++) if (alpha[i]) solid.push(col[i]!);
  const pal = kmeans(solid, Math.min(14, Math.max(4, Math.round(Math.sqrt(solid.length) / 2.4))));
  const idx = new Int16Array(N * N).fill(-1);
  for (let i = 0; i < N * N; i++) if (alpha[i]) idx[i] = nearest(pal, col[i]!);
  // 3. cleanup: a pixel unlike all 8 neighbours joins the neighbour colour it is closest to (keeps bright glints)
  const brightest = pal.reduce((bi, c, j) => (lum(c) > lum(pal[bi]) ? j : bi), 0);
  const cleaned = idx.slice();
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x, v = idx[i];
    if (v < 0 || v === brightest) continue;
    const cnt = new Map<number, number>();
    let same = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const u = idx[(y + dy) * N + x + dx];
      if (u === v) same++;
      if (u >= 0) cnt.set(u, (cnt.get(u) ?? 0) + 1);
    }
    if (same === 0 && cnt.size) {
      let bu = v, bd = Infinity;
      for (const u of cnt.keys()) { const dd = dist(pal[u], pal[v]); if (dd < bd) { bd = dd; bu = u; } }
      cleaned[i] = bu;
    }
  }
  idx.set(cleaned);
  // 4. rim light on the lit (top-left) silhouette edge, shade on the bottom-right edge
  const out = idx.slice();
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && idx[y * N + x] >= 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (idx[i] < 0) continue;
    const lit = !opaque(x, y - 1) || !opaque(x - 1, y);
    const shade = !opaque(x, y + 1) || !opaque(x + 1, y);
    if (lit && !shade) out[i] = step(pal, idx[i], 1);
    else if (shade && !lit) out[i] = step(pal, idx[i], -1);
  }
  // 5. selective outline
  const img = new ImageData(N, N);
  const px = img.data;
  for (let i = 0; i < N * N; i++) if (out[i] >= 0) {
    const c = pal[out[i]];
    px[i * 4] = Math.round(c[0] * 255); px[i * 4 + 1] = Math.round(c[1] * 255); px[i * 4 + 2] = Math.round(c[2] * 255); px[i * 4 + 3] = 255;
  }
  const ink: RGB = [0.07, 0.045, 0.06];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (idx[i] >= 0) continue;
    let src2: RGB | null = null, litSide = false;
    for (const [dx, dy, l] of [[1, 0, true], [0, 1, true], [-1, 0, false], [0, -1, false]] as [number, number, boolean][]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= N || Y >= N || idx[Y * N + X] < 0) continue;
      if (!src2) { src2 = pal[idx[Y * N + X]]; litSide = l; }
    }
    if (!src2) continue;
    const [h, s] = rgb2hsl(src2[0], src2[1], src2[2]);
    const tint = hsl2rgb(hueToward(h, 0.78, 0.06), Math.min(1, s * 0.8 + 0.1), litSide ? 0.2 : 0.11);
    const m = litSide ? 0.55 : 0.4;
    const o: RGB = [ink[0] * (1 - m) + tint[0] * m, ink[1] * (1 - m) + tint[1] * m, ink[2] * (1 - m) + tint[2] * m];
    px[i * 4] = Math.round(o[0] * 255); px[i * 4 + 1] = Math.round(o[1] * 255); px[i * 4 + 2] = Math.round(o[2] * 255); px[i * 4 + 3] = 255;
  }
  void seedId;
  return img;
}

/** no model: a wrapped parcel with a question mark */
function drawUnknown(g: CanvasRenderingContext2D, id: string): void {
  g.fillStyle = '#1a1210'; g.fillRect(9, 13, 30, 24);
  g.fillStyle = '#a07d4e'; g.fillRect(10, 14, 28, 22);
  g.fillStyle = '#c49a62'; g.fillRect(10, 14, 28, 3);
  g.fillStyle = '#6e5232'; g.fillRect(10, 33, 28, 3);
  g.fillStyle = '#e8dcc0'; g.fillRect(23, 14, 3, 22); g.fillRect(10, 24, 28, 3);
  g.fillStyle = '#1a1210'; g.font = '16px Alagard, monospace'; g.fillText('?', 29, 23);
  void id;
}
