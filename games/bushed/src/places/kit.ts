// Places kit: the Place contract, the places texture/material registry, a mesh writer that merges everything
// static into one mesh per material, and the shape helpers the cabin, store and products are built from.
// Conventions: metres, Y up, models face +Z. UVs are written in METRES; each material's textures repeat at
// 1 / tile so every surface gets ~256 texels per metre (public/assets/textures/places/index.json).
import * as THREE from 'three';
import { loadTex } from '../gfx/tex';
import { G } from '../gfx/globals';

// ---------------------------------------------------------------------------------------------- contract
export type Collider =
  | { kind: 'box'; pos: [number, number, number]; half: [number, number, number]; rotY: number }
  | { kind: 'hull'; points: number[] };

export interface Place {
  group: THREE.Group;
  /** world space */
  colliders: Collider[];
  anchors: Record<string, THREE.Object3D>;
  lights: THREE.Light[];
  stove?: { setFire(level: number): void };
  update(dt: number): void;
  /** world-space volumes counted as indoors (reverb, warmth) */
  interior: THREE.Box3[];
  /** cabin: moves the wall thermometer's red column */
  setThermometer?(celsius: number): void;
  /** store: noticeboard pin slots (contract papers go here; +Z of each slot faces out of the board) */
  pins?: THREE.Object3D[];
  /** turn interior lamps on/off (0..1) */
  setLamps?(level: number): void;
}

// ---------------------------------------------------------------------------------------------- textures
/** tile size in metres of every texture in public/assets/textures/places (see tools/make_textures.py) */
export const TILE: Record<string, [number, number]> = {
  log_ext: [2, 1], log_int: [2, 1], chink: [1, 1], floor: [2, 2], planks_grey: [1.5, 1.5], board_warm: [2, 1],
  board_grey: [2, 1], stone: [2, 2], iron: [2, 2], galv: [2, 2], corrugated: [2, 2], shakes: [2, 1], endgrain: [1, 1],
  woodchips: [2, 2], blanket: [1, 1], wool_grey: [1, 1], siding_red: [1.57, 1.57], trim_cream: [2, 2],
  boards_green: [2, 2], glass_grime: [0.5, 0.5], rope: [0.1, 0.05], wood_fresh: [2, 1], ticking: [1, 1], canvas: [1, 1],
  rug: [2, 0.5], leather: [1, 1], enamel: [0.5, 0.5], enamel_blue: [0.5, 0.5], rusty_red: [1, 1],
};
const HAS_NORMAL = new Set(['log_ext', 'log_int', 'chink', 'floor', 'planks_grey', 'board_warm', 'board_grey', 'stone', 'iron', 'galv',
  'corrugated', 'shakes', 'endgrain', 'woodchips', 'blanket', 'wool_grey', 'siding_red', 'trim_cream', 'boards_green',
  'wood_fresh', 'canvas', 'leather', 'rusty_red']);

/** textures borrowed from other modules (read-only use): name -> [path under assets/textures, tile] */
const EXTERNAL: Record<string, [string, [number, number]]> = {
  bark_spruce: ['trees/bark_spruce', [1.5, 1.5]],
  bark_birch: ['trees/bark_birch', [1.5, 1.5]],
  bark_pine: ['trees/bark_pine', [1.5, 1.5]],
};

export function placeTex(name: string, normal = false): THREE.Texture {
  const ext = EXTERNAL[name];
  const path = ext ? ext[0] : `places/${name}`;
  const t = loadTex(`${path}${normal ? '_n' : ''}.png`, { repeat: true, srgb: !normal });
  const tile = ext ? ext[1] : TILE[name] ?? [1, 1];
  t.repeat.set(1 / tile[0], 1 / tile[1]);
  return t;
}

export interface MatOpts {
  rough?: number; metal?: number; color?: THREE.ColorRepresentation; normalScale?: number; side?: THREE.Side;
  emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; transparent?: boolean; opacity?: number; alphaTest?: number;
}

const mats = new Map<string, THREE.Material>();

/** MATERIALS: name -> (texture, options). Keys used by the mesh writer. */
const MATDEF: Record<string, { tex?: string; o?: MatOpts }> = {
  log_ext: { tex: 'log_ext', o: { rough: 0.92 } },
  log_int: { tex: 'log_int', o: { rough: 0.7 } },
  chink: { tex: 'chink', o: { rough: 0.95 } },
  floor: { tex: 'floor', o: { rough: 0.78 } },
  planks_grey: { tex: 'planks_grey', o: { rough: 0.9 } },
  board_warm: { tex: 'board_warm', o: { rough: 0.72 } },
  board_dark: { tex: 'board_warm', o: { rough: 0.8, color: 0x8a7c70 } },
  board_grey: { tex: 'board_grey', o: { rough: 0.9 } },
  stone: { tex: 'stone', o: { rough: 0.9 } },
  iron: { tex: 'iron', o: { rough: 0.65, metal: 0.35 } },
  galv: { tex: 'galv', o: { rough: 0.5, metal: 0.55 } },
  corrugated: { tex: 'corrugated', o: { rough: 0.7, metal: 0.25 } },
  shakes: { tex: 'shakes', o: { rough: 0.95, normalScale: 1.2 } },
  endgrain: { tex: 'endgrain', o: { rough: 0.9 } },
  blanket: { tex: 'blanket', o: { rough: 1 } },
  wool_grey: { tex: 'wool_grey', o: { rough: 1 } },
  siding_red: { tex: 'siding_red', o: { rough: 0.85 } },
  trim_cream: { tex: 'trim_cream', o: { rough: 0.85 } },
  boards_green: { tex: 'boards_green', o: { rough: 0.8 } },
  rope: { tex: 'rope', o: { rough: 1 } },
  woodchips: { tex: 'woodchips', o: { rough: 1, alphaTest: 0.5 } },
  wood_fresh: { tex: 'wood_fresh', o: { rough: 0.85 } },
  ticking: { tex: 'ticking', o: { rough: 1 } },
  canvas: { tex: 'canvas', o: { rough: 0.95 } },
  rug: { tex: 'rug', o: { rough: 1 } },
  leather: { tex: 'leather', o: { rough: 0.7 } },
  enamel: { tex: 'enamel', o: { rough: 0.3 } },
  enamel_blue: { tex: 'enamel_blue', o: { rough: 0.3 } },
  bark: { tex: 'bark_spruce', o: { rough: 0.95 } },
  bark_birch: { tex: 'bark_birch', o: { rough: 0.9 } },
  soot: { tex: 'iron', o: { rough: 1, color: 0x2a2622 } },
  rusty_red: { tex: 'rusty_red', o: { rough: 0.6, metal: 0.3 } },
};

export function placeMat(name: string): THREE.Material {
  let m = mats.get(name);
  if (m) return m;
  const d = MATDEF[name];
  if (!d) throw new Error(`no place material ${name}`);
  const o = d.o ?? {};
  const sm = new THREE.MeshStandardMaterial({
    name: `place_${name}`,
    map: d.tex ? placeTex(d.tex) : null,
    normalMap: d.tex && (HAS_NORMAL.has(d.tex) || d.tex in EXTERNAL) ? placeTex(d.tex, true) : null,
    roughness: o.rough ?? 0.85, metalness: o.metal ?? 0,
    color: o.color ?? 0xffffff, side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false, opacity: o.opacity ?? 1, alphaTest: o.alphaTest ?? 0,
  });
  if (o.normalScale) sm.normalScale.set(o.normalScale, o.normalScale);
  if (o.emissive != null) { sm.emissive.set(o.emissive); sm.emissiveIntensity = o.emissiveIntensity ?? 1; }
  mats.set(name, sm);
  return sm;
}

/** register an extra material (canvas textures, atlases) under a key usable by the mesh writer */
export function defineMat(name: string, m: THREE.Material): THREE.Material {
  mats.set(name, m);
  return m;
}
export function hasMat(name: string): boolean { return mats.has(name) || name in MATDEF; }

// ---------------------------------------------------------------------------------------------- rng
export class Rand {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number { // mulberry32
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  sign(): number { return this.next() < 0.5 ? -1 : 1; }
}

// ---------------------------------------------------------------------------------------------- mesh writer
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

/** accumulates triangles per material (non-indexed) and builds one mesh per material */
export class Mesher {
  private parts = new Map<string, { p: number[]; n: number[]; uv: number[] }>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  get m(): THREE.Matrix4 { return this.stack[this.stack.length - 1]; }
  push(m: THREE.Matrix4): this { this.stack.push(this.m.clone().multiply(m)); return this; }
  pushT(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): this { return this.push(tf(x, y, z, ry, rx, rz)); }
  pop(): this { if (this.stack.length > 1) this.stack.pop(); return this; }

  private part(mat: string) {
    let p = this.parts.get(mat);
    if (!p) this.parts.set(mat, (p = { p: [], n: [], uv: [] }));
    return p;
  }

  /** a triangle in the current frame; normals per vertex (local) */
  tri(mat: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3,
    ua: [number, number], ub: [number, number], uc: [number, number]): void {
    const P = this.part(mat), M = this.m;
    _nm.getNormalMatrix(M);
    for (const [v, n, u] of [[a, na, ua], [b, nb, ub], [c, nc, uc]] as [THREE.Vector3, THREE.Vector3, [number, number]][]) {
      _v.copy(v).applyMatrix4(M); P.p.push(_v.x, _v.y, _v.z);
      _n.copy(n).applyMatrix3(_nm).normalize(); P.n.push(_n.x, _n.y, _n.z);
      P.uv.push(u[0], u[1]);
    }
  }

  /** quad a-b-c-d (counter-clockwise seen from the front), flat normal unless given */
  quad(mat: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
    ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number], n?: THREE.Vector3): void {
    const nn = n ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    this.tri(mat, a, b, c, nn, nn, nn, ua, ub, uc);
    this.tri(mat, a, c, d, nn, nn, nn, ua, uc, ud);
  }

  /** append a three.js geometry (any attributes; position/normal/uv used) */
  geom(mat: string, g: THREE.BufferGeometry, m?: THREE.Matrix4, uvScale = 1): void {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.attributes.normal) gg.computeVertexNormals();
    const P = this.part(mat);
    const M = m ? this.m.clone().multiply(m) : this.m;
    _nm.getNormalMatrix(M);
    const pa = gg.attributes.position, na = gg.attributes.normal, ua = gg.attributes.uv;
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa as THREE.BufferAttribute, i).applyMatrix4(M); P.p.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(na as THREE.BufferAttribute, i).applyMatrix3(_nm).normalize(); P.n.push(_n.x, _n.y, _n.z);
      if (ua) P.uv.push(ua.getX(i) * uvScale, ua.getY(i) * uvScale); else P.uv.push(0, 0);
    }
    if (gg !== g) gg.dispose();
  }

  isEmpty(): boolean { return this.parts.size === 0; }

  /** one mesh per material */
  build(opts: { cast?: boolean; receive?: boolean; name?: string; noCast?: string[] } = {}): THREE.Group {
    const g = new THREE.Group();
    g.name = opts.name ?? 'mesh';
    for (const [mat, P] of this.parts) {
      if (P.p.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(P.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, placeMat(mat));
      mesh.name = mat;
      const transp = (mesh.material as THREE.Material).transparent;
      mesh.castShadow = (opts.cast ?? true) && !transp && !(opts.noCast ?? []).includes(mat);
      mesh.receiveShadow = opts.receive ?? true;
      if (transp) mesh.renderOrder = 2;
      g.add(mesh);
    }
    return g;
  }
}

/** translation + Euler (Y, then X, then Z) */
export function tf(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));
  return m;
}
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------- shapes
export interface BoxOpts {
  /** which local axis the texture's u (grain) follows on the side faces: default the longest */
  grain?: 'x' | 'y' | 'z';
  uv?: [number, number];
  /** per-face material override: +x -x +y -y +z -z */
  faces?: Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', string | null>>;
  /** scale UVs (1 = metres) */
  uvs?: number;
}

/** an axis-aligned box centred at the current origin, UVs in metres, grain along one axis */
export function box(ms: Mesher, mat: string, w: number, h: number, d: number, o: BoxOpts = {}): void {
  const x = w / 2, y = h / 2, z = d / 2;
  const grain = o.grain ?? (w >= h && w >= d ? 'x' : h >= d ? 'y' : 'z');
  const [ou, ov] = o.uv ?? [0, 0];
  const s = o.uvs ?? 1;
  const F = o.faces ?? {};
  // for a face spanned by axes (a along +u candidate, b), choose u = the grain axis if present
  const face = (key: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', c: THREE.Vector3[], axA: 'x' | 'y' | 'z', la: number, axB: 'x' | 'y' | 'z', lb: number) => {
    const m = F[key] === undefined ? mat : F[key];
    if (!m) return;
    // c: corners in order (a0b0, a1b0, a1b1, a0b1) where a runs along axA
    // corners c0=(a0,b0) c1=(a1,b0) c2=(a1,b1) c3=(a0,b1); u follows the grain axis when the face contains it
    const raw: [number, number][] = axB === grain && axA !== grain
      ? [[0, 0], [0, la], [lb, la], [lb, 0]]
      : [[0, 0], [la, 0], [la, lb], [0, lb]];
    const uvs = raw.map(([u, v]) => [(u + ou) * s, (v + ov) * s]) as [number, number][];
    ms.quad(m, c[0], c[1], c[2], c[3], uvs[0], uvs[1], uvs[2], uvs[3]);
  };
  // +z face: a = x (left->right), b = y
  face('pz', [V(-x, -y, z), V(x, -y, z), V(x, y, z), V(-x, y, z)], 'x', w, 'y', h);
  face('nz', [V(x, -y, -z), V(-x, -y, -z), V(-x, y, -z), V(x, y, -z)], 'x', w, 'y', h);
  face('px', [V(x, -y, z), V(x, -y, -z), V(x, y, -z), V(x, y, z)], 'z', d, 'y', h);
  face('nx', [V(-x, -y, -z), V(-x, -y, z), V(-x, y, z), V(-x, y, -z)], 'z', d, 'y', h);
  face('py', [V(-x, y, z), V(x, y, z), V(x, y, -z), V(-x, y, -z)], 'x', w, 'z', d);
  face('ny', [V(-x, -y, -z), V(x, -y, -z), V(x, -y, z), V(-x, -y, z)], 'x', w, 'z', d);
}

/** box placed with its centre at (x,y,z) and yaw ry */
export function boxAt(ms: Mesher, mat: string, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, o: BoxOpts = {}, rx = 0, rz = 0): void {
  ms.pushT(x, y, z, ry, rx, rz);
  box(ms, mat, w, h, d, o);
  ms.pop();
}

/** a hand-made board: box with tiny random twist/height jitter and a random texture offset */
export function board(ms: Mesher, mat: string, r: Rand, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, o: BoxOpts = {}): void {
  boxAt(ms, mat, x, y + r.range(-0.002, 0.002), z, w, h, d, ry + r.range(-0.004, 0.004), { ...o, uv: [r.range(0, 4), r.range(0, 4)] }, r.range(-0.004, 0.004), r.range(-0.004, 0.004));
}

export interface LogOpts {
  seg?: number;
  /** ring spacing along the log (m) */
  ring?: number;
  taper?: number;
  bend?: number;
  lump?: number;
  seed?: number;
  uOff?: number; vOff?: number;
  /** end caps: endgrain atlas cell (0..3) or -1 for none */
  capA?: number; capB?: number;
  /** material for a side face; xm = position along the log (m), n = outward normal (local) */
  matFor?: (xm: number, n: THREE.Vector3) => string;
  /** extra x positions where rings must exist (material boundaries) */
  breaks?: number[];
  /** cut the bottom flat at -r*flat (0 = round) */
  capMat?: string;
}

/** a round log along +X from 0 to len, radius r, organic lumps and bend, UV u = along (m), v = around (m) */
export function log(ms: Mesher, len: number, r: number, o: LogOpts = {}): void {
  const seg = o.seg ?? 10;
  const rnd = new Rand(o.seed ?? 1);
  const taper = o.taper ?? 0.06, bend = o.bend ?? 0.015, lump = o.lump ?? 0.035;
  const ph1 = rnd.range(0, 6.28), ph2 = rnd.range(0, 6.28), ph3 = rnd.range(0, 6.28), bendA = rnd.range(0, 6.28);
  const xs = new Set<number>([0, len]);
  const nRing = Math.max(1, Math.ceil(len / (o.ring ?? 0.45)));
  for (let i = 1; i < nRing; i++) xs.add((i / nRing) * len);
  for (const b of o.breaks ?? []) if (b > 0 && b < len) xs.add(b);
  const X = [...xs].sort((a, b) => a - b);
  const rad = (x: number, a: number) => r * (1 - taper * (x / len - 0.5)) * (1 + lump * (0.6 * Math.sin(a * 2 + ph1 + x * 1.3) + 0.4 * Math.sin(a * 3 + ph2 - x * 2.1) + 0.5 * Math.sin(x * 3.1 + ph3)));
  const ctr = (x: number) => {
    const t = x / len;
    const b = Math.sin(Math.PI * t) * bend * len;
    return [Math.cos(bendA) * b, Math.sin(bendA) * b] as [number, number];
  };
  const ring = (x: number) => {
    const [cy, cz] = ctr(x);
    const pts: { p: THREE.Vector3; n: THREE.Vector3; v: number }[] = [];
    let arc = 0, prev: THREE.Vector3 | null = null;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const rr = rad(x, k === seg ? 0 : a);
      const p = V(x, cy + Math.cos(a) * rr, cz + Math.sin(a) * rr);
      if (prev) arc += p.distanceTo(prev);
      prev = p;
      pts.push({ p, n: V(0, Math.cos(a), Math.sin(a)), v: arc });
    }
    return pts;
  };
  const uO = o.uOff ?? rnd.range(0, 2), vO = o.vOff ?? rnd.range(0, 1);
  let prevR = ring(X[0]);
  for (let i = 1; i < X.length; i++) {
    const R = ring(X[i]);
    const xm = (X[i - 1] + X[i]) / 2;
    for (let k = 0; k < seg; k++) {
      const a0 = prevR[k], a1 = prevR[k + 1], b0 = R[k], b1 = R[k + 1];
      const nMid = V(0, (a0.n.y + a1.n.y) / 2, (a0.n.z + a1.n.z) / 2).normalize();
      const mat = o.matFor ? o.matFor(xm, nMid) : 'log_ext';
      const u0 = X[i - 1] + uO, u1 = X[i] + uO;
      // two triangles: (a0, b0, b1), (a0, b1, a1) with outward winding
      ms.tri(mat, a0.p, a1.p, b1.p, a0.n, a1.n, b1.n, [u0, a0.v + vO], [u0, a1.v + vO], [u1, b1.v + vO]);
      ms.tri(mat, a0.p, b1.p, b0.p, a0.n, b1.n, b0.n, [u0, a0.v + vO], [u1, b1.v + vO], [u1, b0.v + vO]);
    }
    prevR = R;
  }
  // caps
  const cap = (x: number, cell: number, dir: number) => {
    if (cell < 0) return;
    const R = ring(x);
    const [cy, cz] = ctr(x);
    const c = V(x - dir * 0.004, cy, cz);
    const n = V(dir, 0, 0);
    const cu = (cell % 2) * 0.5 + 0.25, cv = 1 - (Math.floor(cell / 2) * 0.5 + 0.25);
    const rot = rnd.range(0, 6.28);
    const maxR = r * 1.12;
    for (let k = 0; k < seg; k++) {
      const p0 = R[k].p, p1 = R[k + 1].p;
      const uv = (p: THREE.Vector3): [number, number] => {
        const dy = (p.y - cy) / maxR, dz = (p.z - cz) / maxR;
        const a = Math.atan2(dz, dy) + rot, l = Math.hypot(dy, dz);
        return [cu + Math.cos(a) * l * 0.245, cv + Math.sin(a) * l * 0.245];
      };
      if (dir > 0) ms.tri(o.capMat ?? 'endgrain', c, p0, p1, n, n, n, [cu, cv], uv(p0), uv(p1));
      else ms.tri(o.capMat ?? 'endgrain', c, p1, p0, n, n, n, [cu, cv], uv(p1), uv(p0));
    }
  };
  cap(0, o.capA ?? 0, -1);
  cap(len, o.capB ?? 0, 1);
}

/** log from point a to point b (any direction) */
export function logAB(ms: Mesher, a: THREE.Vector3, b: THREE.Vector3, r: number, o: LogOpts = {}): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), d.normalize());
  ms.push(new THREE.Matrix4().compose(a, q, V(1, 1, 1)));
  log(ms, len, r, o);
  ms.pop();
}

/** surface of revolution about Y. profile: [radius, y][] bottom to top. UV u = around (m or 0..1), v = along (m) */
export function lathe(ms: Mesher, mat: string, profile: [number, number][], seg = 16, o: { uNorm?: boolean; vNorm?: boolean; uv?: [number, number, number, number]; phase?: number; matFor?: (i: number) => string } = {}): void {
  const L: number[] = [0];
  for (let i = 1; i < profile.length; i++) L.push(L[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = L[L.length - 1] || 1;
  const rMax = Math.max(...profile.map((p) => p[0]));
  const [u0, v0, u1, v1] = o.uv ?? [0, 0, 1, 1];
  const ph = o.phase ?? 0;
  // smooth normals from the profile tangent
  const pn = profile.map((_, i) => {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(profile.length - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l] as [number, number];
  });
  for (let i = 0; i < profile.length - 1; i++) {
    const m = o.matFor ? o.matFor(i) : mat;
    // hard edge where the profile turns sharply: use segment normal
    const sx = profile[i + 1][1] - profile[i][1], sy = -(profile[i + 1][0] - profile[i][0]);
    const sl = Math.hypot(sx, sy) || 1;
    const segN: [number, number] = [sx / sl, sy / sl];
    const dot0 = pn[i][0] * segN[0] + pn[i][1] * segN[1], dot1 = pn[i + 1][0] * segN[0] + pn[i + 1][1] * segN[1];
    const nA = dot0 > 0.85 ? pn[i] : segN, nB = dot1 > 0.85 ? pn[i + 1] : segN;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2 + ph, a1 = ((k + 1) / seg) * Math.PI * 2 + ph;
      const P = (r: number, y: number, a: number) => V(Math.sin(a) * r, y, Math.cos(a) * r);
      const N = (n: [number, number], a: number) => V(Math.sin(a) * n[0], n[1], Math.cos(a) * n[0]);
      const uu = (kk: number) => o.uNorm ? u0 + (u1 - u0) * (kk / seg) : (kk / seg) * Math.PI * 2 * rMax;
      const vv = (ii: number) => o.vNorm ? v0 + (v1 - v0) * (L[ii] / total) : L[ii];
      const pa = P(profile[i][0], profile[i][1], a0), pb = P(profile[i][0], profile[i][1], a1);
      const pc = P(profile[i + 1][0], profile[i + 1][1], a1), pd = P(profile[i + 1][0], profile[i + 1][1], a0);
      ms.tri(m, pa, pb, pc, N(nA, a0), N(nA, a1), N(nB, a1), [uu(k), vv(i)], [uu(k + 1), vv(i)], [uu(k + 1), vv(i + 1)]);
      ms.tri(m, pa, pc, pd, N(nA, a0), N(nB, a1), N(nB, a0), [uu(k), vv(i)], [uu(k + 1), vv(i + 1)], [uu(k), vv(i + 1)]);
    }
  }
}

/** a tube along a polyline (Catmull-Rom smoothed when smooth=true), UV u = along (m), v = around (m) */
export function tube(ms: Mesher, mat: string, pts: THREE.Vector3[], r: number, seg = 6, o: { smooth?: boolean; samples?: number; closed?: boolean; rEnd?: number } = {}): void {
  const curve = new THREE.CatmullRomCurve3(pts, o.closed ?? false, 'catmullrom', 0.5);
  const n = o.samples ?? Math.max(2, (o.smooth ?? true) ? Math.ceil(curve.getLength() / 0.03) : pts.length - 1);
  const g = new THREE.TubeGeometry(curve, n, r, seg, o.closed ?? false);
  if (o.rEnd != null) {
    const pa = g.attributes.position as THREE.BufferAttribute;
    // taper: scale radial offset along the tube
    const frames = curve.computeFrenetFrames(n, o.closed ?? false);
    for (let i = 0; i <= n; i++) {
      const c = curve.getPointAt(i / n);
      const k = 1 + ((o.rEnd / r) - 1) * (i / n);
      for (let j = 0; j <= seg; j++) {
        const idx = i * (seg + 1) + j;
        _v.fromBufferAttribute(pa, idx).sub(c).multiplyScalar(k).add(c);
        pa.setXYZ(idx, _v.x, _v.y, _v.z);
      }
    }
    void frames;
  }
  const L = curve.getLength(), C = 2 * Math.PI * r;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * C);
  ms.geom(mat, g);
  g.dispose();
}

/** extrude a 2D shape (x,y in metres) along +Z by depth; UVs in metres (world UV generator) */
export function extrude(ms: Mesher, mat: string, shape: THREE.Shape, depth: number, o: { bevel?: number; sideMat?: string; curveSegments?: number } = {}): void {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: (o.bevel ?? 0) > 0, bevelSize: o.bevel ?? 0, bevelThickness: o.bevel ?? 0, bevelSegments: 1,
    curveSegments: o.curveSegments ?? 8,
  });
  if (o.sideMat) {
    // groups: 0 = caps, 1 = sides
    const ng = g.toNonIndexed();
    const groups = g.groups;
    const pos = ng.attributes.position as THREE.BufferAttribute;
    const capIdx: number[] = [], sideIdx: number[] = [];
    for (const gr of groups) for (let i = gr.start; i < gr.start + gr.count; i++) (gr.materialIndex === 0 ? capIdx : sideIdx).push(i);
    const sub = (idx: number[]) => {
      const b = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const a = ng.attributes[name] as THREE.BufferAttribute;
        const arr = new Float32Array(idx.length * a.itemSize);
        idx.forEach((v, i) => { for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.array[v * a.itemSize + c]; });
        b.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
      }
      return b;
    };
    void pos;
    ms.geom(mat, sub(capIdx));
    ms.geom(o.sideMat, sub(sideIdx));
    ng.dispose();
  } else ms.geom(mat, g);
  g.dispose();
}

/** flat polygon (convex or simple) in the XY plane facing +Z, UV = metres (+offset) */
export function poly(ms: Mesher, mat: string, pts: [number, number][], uvOff: [number, number] = [0, 0]): void {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(shape);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + uvOff[0], uv.getY(i) + uvOff[1]);
  ms.geom(mat, g);
  g.dispose();
}

/** rectangles covering [x0,x1]x[y0,y1] minus holes (each hole [x0,x1,y0,y1]) */
export function rectsMinus(x0: number, x1: number, y0: number, y1: number, holes: [number, number, number, number][]): [number, number, number, number][] {
  const ys = new Set<number>([y0, y1]);
  for (const h of holes) { if (h[2] > y0 && h[2] < y1) ys.add(h[2]); if (h[3] > y0 && h[3] < y1) ys.add(h[3]); }
  const Y = [...ys].sort((a, b) => a - b);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < Y.length - 1; i++) {
    const ya = Y[i], yb = Y[i + 1], ym = (ya + yb) / 2;
    const cut = holes.filter((h) => ym > h[2] && ym < h[3]).map((h) => [h[0], h[1]] as [number, number]).sort((a, b) => a[0] - b[0]);
    let x = x0;
    for (const [ha, hb] of cut) {
      if (ha > x) out.push([x, Math.min(ha, x1), ya, yb]);
      x = Math.max(x, hb);
    }
    if (x < x1) out.push([x, x1, ya, yb]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- colliders
export class Cols {
  readonly list: Collider[] = [];
  /** local-space box: centre, half extents, yaw */
  box(x: number, y: number, z: number, hx: number, hy: number, hz: number, ry = 0): void {
    this.list.push({ kind: 'box', pos: [x, y, z], half: [hx, hy, hz], rotY: ry });
  }
  hull(points: number[]): void { this.list.push({ kind: 'hull', points }); }
  /** transform every collider by a placement (yaw rot then translate) */
  toWorld(ox: number, oy: number, oz: number, rot: number): Collider[] {
    const c = Math.cos(rot), s = Math.sin(rot);
    return this.list.map((k) => {
      if (k.kind === 'box') {
        const [x, y, z] = k.pos;
        return { kind: 'box', pos: [ox + c * x + s * z, oy + y, oz - s * x + c * z], half: k.half, rotY: k.rotY + rot } as Collider;
      }
      const p = k.points.slice();
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], z = p[i + 2];
        p[i] = ox + c * x + s * z; p[i + 1] = oy + p[i + 1]; p[i + 2] = oz - s * x + c * z;
      }
      return { kind: 'hull', points: p } as Collider;
    });
  }
}

/** world AABBs approximating a rotated local rectangle (for Place.interior) */
export function interiorBoxes(ox: number, oy: number, oz: number, rot: number, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, cell = 0.5): THREE.Box3[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [ox + c * x + s * z, oz - s * x + c * z]);
  const minX = Math.min(...corners.map((p) => p[0])), maxX = Math.max(...corners.map((p) => p[0]));
  const minZ = Math.min(...corners.map((p) => p[1])), maxZ = Math.max(...corners.map((p) => p[1]));
  const inside = (wx: number, wz: number) => {
    const dx = wx - ox, dz = wz - oz;
    const lx = c * dx - s * dz, lz = s * dx + c * dz;
    return lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1;
  };
  const out: THREE.Box3[] = [];
  for (let wz = minZ; wz < maxZ; wz += cell) {
    let run = -1;
    for (let wx = minX; wx <= maxX + cell; wx += cell) {
      const ok = wx <= maxX && inside(wx + cell / 2, wz + cell / 2) && inside(wx, wz) && inside(wx + cell, wz) && inside(wx, wz + cell) && inside(wx + cell, wz + cell);
      if (ok && run < 0) run = wx;
      if (!ok && run >= 0) { out.push(new THREE.Box3(new THREE.Vector3(run, oy + y0, wz), new THREE.Vector3(wx, oy + y1, wz + cell))); run = -1; }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- misc
export function anchor(parent: THREE.Object3D, name: string, x: number, y: number, z: number, ry = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.rotation.y = ry;
  parent.add(o);
  return o;
}

/** a flickering fire light helper */
export function flicker(t: number, seed: number): number {
  return 0.82 + 0.1 * Math.sin(t * 13.1 + seed) + 0.06 * Math.sin(t * 27.3 + seed * 2.1) + 0.05 * Math.sin(t * 5.7 + seed * 0.7);
}

/**
 * Distance culling for a place's lights: beyond `far` metres from the camera (G.uCamPos) every light is dimmed to 0
 * and shadow maps stop re-rendering (shadow.autoUpdate = false), so a place on the other side of the map costs
 * almost nothing. Light count never changes (no shader recompiles). Returns a function giving the 0..1 activity.
 */
export function lightCuller(center: THREE.Vector3, lights: THREE.Light[], far = 70): () => number {
  return () => {
    const d = G.uCamPos.value.distanceTo(center);
    const k = d < far ? 1 : d < far + 15 ? 1 - (d - far) / 15 : 0;
    for (const l of lights) {
      const sh = (l as THREE.PointLight).shadow as THREE.LightShadow | undefined;
      if (sh && l.castShadow) sh.autoUpdate = k > 0;
    }
    return k;
  };
}

/** set common shadow parameters */
export function shadowy(l: THREE.PointLight | THREE.SpotLight, size = 512, bias = -0.002): void {
  l.castShadow = true;
  l.shadow.mapSize.set(size, size);
  l.shadow.bias = bias;
  l.shadow.normalBias = 0.03;
  l.shadow.camera.near = 0.05;
}
