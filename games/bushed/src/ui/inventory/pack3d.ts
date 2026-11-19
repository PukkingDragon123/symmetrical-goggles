// The rucksack inventory, in 3D. Press I: the old canvas Duluth-style pack swings up into view, its lid flops back
// and the stiff panel inside shows the 6 x 6 grid stitched onto it. Everything you carry lies in its cells as a real
// little model, with a paper tag for stacks. A brass spring scale hangs off the D-ring and reads the pack's weight.
//
// Mouse (free cursor, a pixel work-glove): hover lifts an item and floats its name, weight and icon beside it;
// drag moves it cell to cell with a green / amber / red ghost (fits / swaps or stacks / blocked); R turns it while
// dragging; click picks up, click again puts down; shift-click quick-moves it (tops up a stack of the same thing,
// else hops to the front or back of the pack, or onQuickMove hands it to another open container); right-click
// takes it into your hand (or eats / drinks food); Q drops it in the world (dragging it off the pack does too);
// T tidies the whole pack. Esc closes.
//
// It still answers the old Backpack API (open, toggle(items), pick, hover, update, object): constructing it in place
// of Backpack works unchanged (click picks an item into the hand). The full UI needs these edits:
//
// INTEGRATION (src/game/game.ts)
//   1. import { PackUI } from '../ui/inventory/pack3d';                  (instead of Backpack)
//      readonly pack = new PackUI((id) => this.toolModel(id));
//   2. init(), right after `this.hands = new Hands({...})`:   this.pack.install(this);
//      (wraps give / take / pocket so the grid follows inv.items at once, adds a per-frame updater that catches
//      direct writes to inv.items, drops overflow at your feet with "No room in the pack.", adds pack weight to
//      player.burden; pocketing with B when there is no room keeps the thing in your hands)
//   3. update(), the KeyI branch: keep `this.pack.toggle(this.inv.items)`, drop the zip / bag_rustle sound line and
//      packCursor (the pack plays its own zip, rustle and buckle clink).
//   4. update(): replace the whole `if (this.pack.open) { this.packCursor... }` block with
//         if (this.pack.open) this.pack.control(dt);
//      (keep the two packMouse lines around player.update that stop the view turning while the pack is open).
//      Esc closes; Q now drops the hovered item instead of closing.
//   5. hud: `else if (this.pack.open) { hud.showDot(false); hud.setCharge(0); hud.setLabel(''); }`
//      (the pack draws its own glove cursor and Alagard labels).
//   6. arms: `a.object.visible = (...existing...) && !this.pack.open;` so a held axe does not cover the pack.
//   7. saves: save() `pack: this.pack.serialize()`; load() after `this.inv.items = new Map(d.items)`:
//      `this.pack.deserialize(d.pack)`; SaveData (save.ts): `pack?: import('../ui/inventory/grid').PackSave`.
// Optional: pack.onQuickMove = (p) => ... when another container (woodbox, shelf) is open, for shift-click transfer.
import * as THREE from 'three';
import { input } from '../../core/input';
import { audio } from '../../audio/audio';
import { floatText } from '../float';
import { ITEMS } from '../../game/items';
import { canvasTex } from '../../gfx/tex';
import { Rng, hashStr } from '../../core/rng';
import { PackInventory, footprint, dimsOf, setFootprintSizer, type Placement, type SoundMat, type PackSave } from './grid';
import { itemIcon, itemIconTex, setIconModelSource } from './icons';
import { paintDuck, paintLeather, paintBoard, paintLining, paintTag, paintDial, paintGlow, paintShadow, paintChalk, paintGlove, paintMap } from './paint';

// ------------------------------------------------------------------------------------------------ dimensions
/** metres per cell in the viewmodel (the pack is held about 55 cm from your eyes) */
export const CELL = 0.05;
const COLS = 6, ROWS = 6;
const GW = COLS * CELL, GH = ROWS * CELL;
/** board margin around the grid (letters, tape) */
const MX = 0.026, MZT = 0.03, MZB = 0.03;
const PW = GW + MX * 2, PH = GH + MZT + MZB;
/** board centre offset (the grid is not centred on the board: more margin top and bottom) */
const BZ = (MZB - MZT) / 2;
/** the body's mouth (a superellipse a little outside the board) */
const AX = PW / 2 + 0.014, AZ = PH / 2 + 0.014;
const DEPTH = 0.11;
const AX0 = AX, AZ0 = AZ, DEPTH0 = DEPTH;
const LID_L = 0.165;
const LID_OPEN = 2.72;
const MAX_KG = 25, RED_KG = 16;
const DIAL_START = Math.PI * 0.75, DIAL_SWEEP = Math.PI * 1.5;

/** grid cell -> pack-local x / z of the cell's centre */
const cellX = (cx: number) => -GW / 2 + (cx + 0.5) * CELL;
const cellZ = (cy: number) => -GH / 2 + (cy + 0.5) * CELL + BZ;

// ------------------------------------------------------------------------------------------------ the game, loosely
export interface PackGame {
  inv: { items: Map<string, number> };
  give(id: string, n?: number): void;
  take(id: string, n?: number): boolean;
  pocket?(id: string, obj: THREE.Object3D): void;
  setDown?(id: string, at: THREE.Vector3): void;
  useItem?(id: string, t: { obj: THREE.Object3D | null; point: THREE.Vector3 | null }): boolean;
  hands?: { equip(id: string | null): void; heldItem: string; busy: boolean; grab?(obj: THREE.Object3D, piece?: undefined, mass?: number): void };
  player?: { pos: THREE.Vector3; burden: number; yaw?: number };
  camera?: THREE.Camera;
  viewCam?: THREE.Camera;
  updaters?: ((dt: number) => void)[];
  toolModel?(id: string): THREE.Object3D | null;
  mode?: string;
}

// ------------------------------------------------------------------------------------------------ materials
let MATS: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const duckTex = canvasTex(paintDuck(256, [122, 108, 70], 11), { repeat: true });
  const duckDark = canvasTex(paintDuck(256, [84, 80, 52], 12, { grime: 1.3 }), { repeat: true });
  const leatherTex = canvasTex(paintLeather(32, 256, [112, 70, 38], 5), { repeat: true });
  const leatherPlain = canvasTex(paintLeather(32, 256, [96, 60, 32], 6, false), { repeat: true });
  // board: 512 px over the board; grid in px
  const BPX = 512;
  const ppm = BPX / Math.max(PW, PH);
  const cs = Math.round(CELL * ppm);
  const bx0 = Math.round((PW / 2 - GW / 2) * ppm + (BPX - PW * ppm) / 2), by0 = Math.round(MZT * ppm + (BPX - PH * ppm) / 2);
  const board = canvasTex(paintBoard(BPX, COLS, ROWS, bx0, by0, cs, 21));
  const lining = canvasTex(paintLining(256, 31));
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...o });
  return {
    duck: std({ map: duckTex, side: THREE.DoubleSide }),
    duckDark: std({ map: duckDark, side: THREE.DoubleSide, color: 0x9a9a9a }),
    leather: std({ map: leatherTex, roughness: 0.62 }),
    leatherPlain: std({ map: leatherPlain, roughness: 0.6, side: THREE.DoubleSide }),
    board: std({ map: board }),
    boardUV: { ppm, BPX },
    lining: std({ map: lining, side: THREE.DoubleSide }),
    brass: std({ color: 0xb38a42, roughness: 0.38, metalness: 0.55 }),
    iron: std({ color: 0x4a4640, roughness: 0.5, metalness: 0.5 }),
    shadow: new THREE.MeshBasicMaterial({ map: canvasTex(paintShadow(64), { nearest: false }), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
    glowTex: canvasTex(paintGlow(64), { nearest: false }),
    dial: std({ map: canvasTex(paintDial(128, MAX_KG, RED_KG, DIAL_START, DIAL_SWEEP)), roughness: 0.5 }),
    paper: std({ color: 0xd8c39a, roughness: 1, side: THREE.DoubleSide }),
    needle: std({ color: 0x1c1410, roughness: 0.5 }),
    string: std({ color: 0xcdb889, roughness: 1 }),
  };
}

// ------------------------------------------------------------------------------------------------ geometry helpers
/** superellipse point (a rounded rectangle), angle a */
function sup(a: number, ax: number, az: number, p = 0.22): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [Math.sign(c) * Math.pow(Math.abs(c), p) * ax, Math.sign(s) * Math.pow(Math.abs(s), p) * az];
}

/** the body: a lofted, slightly bulging bag hanging from the mouth; wrinkles where the canvas sags */
function bodyGeo(AX = AX0, AZ = AZ0, DEPTH = DEPTH0, bulgeK = 0.13, seed = 4): THREE.BufferGeometry {
  const N = 72, rows = 10;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const r = new Rng(seed);
  const wr = Array.from({ length: 9 }, () => [r.range(0, 6.28), r.range(2, 7)]);
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = -t * DEPTH;
    const bulge = 1 + bulgeK * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.85) - 0.22 * Math.pow(t, 5);
    let arc = 0, prev: [number, number] | null = null;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, z] = sup(a, AX, AZ);
      if (prev) arc += Math.hypot(x - prev[0], z - prev[1]);
      prev = [x, z];
      let wob = 0;
      for (const [ph, f] of wr) wob += Math.sin(a * f + ph + t * 2) * 0.0012;
      const k = (bulge + wob * Math.sin(t * Math.PI) * 6);
      pos.push(x * k, y, z * k);
      uv.push(arc / 0.16, t * DEPTH / 0.16 * 1.2);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // rounded bottom
  const base = pos.length / 3;
  pos.push(0, -DEPTH - 0.012, 0); uv.push(0.5, 0.5);
  const last = rows * (N + 1);
  for (let i = 0; i < N; i++) idx.push(base, last + i + 1, last + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a flat ribbon (strap) along a curve: width w, the strap's face normal follows `up` */
function ribbon(curve: THREE.Curve<THREE.Vector3>, w: number, up: THREE.Vector3, segs = 24, vScale = 1, sideDir?: THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let len = 0, prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPoint(t), tan = curve.getTangent(t);
    if (prev) len += p.distanceTo(prev);
    prev = p.clone();
    const side = (sideDir ? sideDir.clone() : new THREE.Vector3().crossVectors(tan, up)).normalize().multiplyScalar(w / 2);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    uv.push(0, len / 0.1 * vScale, 1, len / 0.1 * vScale);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a rounded-rectangle loop of wire (buckle frames, D-rings) */
function loopTube(w: number, h: number, thick: number, open = false): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (open && (a < 0.6 || a > Math.PI * 2 - 0.6)) continue;
    const [x, z] = sup(a, w / 2, h / 2, 0.35);
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, !open), 48, thick, 5, !open);
}

/** a domed, rounded flap (pocket lids): w across x, l along +z from the hinge at z = 0 */
function cushion(w: number, l: number, dome: number, uvs = 0.16): THREE.BufferGeometry {
  const nx = 12, nz = 8, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / nz;
    const corner = Math.max(0, v - 0.6) / 0.4;
    const x = (u - 0.5) * w * (1 - 0.22 * corner * corner), z = v * l;
    pos.push(x, dome * Math.sin(u * Math.PI) * Math.sin(Math.min(1, v * 1.3) * Math.PI * 0.75), z);
    uv.push(u * w / uvs, v * l / uvs);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** the lid: a domed rounded flap, outer canvas + lining, bound edge. Built closed, hinge on the local X axis at z=0,
 *  extending toward +z. */
function buildLid(M: NonNullable<typeof MATS>): THREE.Group {
  const g = new THREE.Group();
  const nx = 20, nz = 14, W = AX * 2 + 0.008, L = LID_L;
  const mk = (top: boolean) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / nz;
      // rounded free end
      const corner = Math.max(0, v - 0.7) / 0.3;
      const narrow = 1 - 0.18 * corner * corner;
      const x = (u - 0.5) * W * narrow;
      const z = v * L;
      const dome = 0.016 * Math.sin(u * Math.PI) * Math.sin(Math.min(1, v * 1.4) * Math.PI * 0.8) + 0.004;
      pos.push(x, (top ? dome : dome - 0.004), z);
      uv.push(top ? u * W / 0.16 : u, top ? v * L / 0.16 : 1 - v);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (top) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  g.add(new THREE.Mesh(mk(true), M.duck), new THREE.Mesh(mk(false), M.lining));
  // bound edge
  const edge: THREE.Vector3[] = [];
  for (let j = 0; j <= nz; j++) { const v = j / nz, corner = Math.max(0, v - 0.7) / 0.3; edge.push(new THREE.Vector3(-W / 2 * (1 - 0.18 * corner * corner), 0.002, v * L)); }
  for (let i = 1; i < nx; i++) edge.push(new THREE.Vector3((i / nx - 0.5) * W * 0.82, 0.002, L));
  for (let j = nz; j >= 0; j--) { const v = j / nz, corner = Math.max(0, v - 0.7) / 0.3; edge.push(new THREE.Vector3(W / 2 * (1 - 0.18 * corner * corner), 0.002, v * L)); }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 80, 0.0055, 5, false), M.leather));
  // in the lining pocket: a folded topo map poking out, and a pencil in a loop
  {
    const map = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.36, L * 0.3), new THREE.MeshStandardMaterial({ map: canvasTex(paintMap(96, 64, 5)), roughness: 1, side: THREE.DoubleSide }));
    map.rotation.set(Math.PI / 2, 0, 0.12);
    map.position.set(-W * 0.12, -0.0065, L * 0.26);
    g.add(map);
    const pencil = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, L * 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xc9902e, roughness: 0.7 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0028, 0.01, 6), new THREE.MeshStandardMaterial({ color: 0xd9b88a, roughness: 0.8 }));
    tip.position.y = -L * 0.25 - 0.005; tip.rotation.x = Math.PI;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.001, 0.003, 5), new THREE.MeshStandardMaterial({ color: 0x2a2a2e }));
    lead.position.y = -L * 0.25 - 0.0105; lead.rotation.x = Math.PI;
    pencil.add(body, tip, lead);
    pencil.rotation.set(Math.PI / 2, 0, 0.05);
    pencil.position.set(W * 0.3, -0.008, L * 0.5);
    g.add(pencil);
    const loop = new THREE.Mesh(ribbon(new THREE.CatmullRomCurve3([new THREE.Vector3(W * 0.3 - 0.008, -0.0045, L * 0.52), new THREE.Vector3(W * 0.3, -0.0115, L * 0.52), new THREE.Vector3(W * 0.3 + 0.008, -0.0045, L * 0.52)]), 0.012, new THREE.Vector3(0, 0, 1), 8, 1, new THREE.Vector3(0, 0, 1)), M.leatherPlain);
    g.add(loop);
  }
  // two lid straps on the outside with their tongues
  for (const sx of [-0.085, 0.085]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sx, 0.022, 0.03), new THREE.Vector3(sx, 0.024, L * 0.6), new THREE.Vector3(sx, 0.012, L + 0.01), new THREE.Vector3(sx, -0.02, L + 0.035)]);
    g.add(new THREE.Mesh(ribbon(c, 0.022, new THREE.Vector3(0, 1, 0)), M.leatherPlain));
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ item fitting
/** lay a model flat in a footprint (default orientation, fw x fh cells): longest axis along the long side,
 *  thinnest axis up, heavy end toward the far side; centred, resting on y = 0. */
function fitModel(model: THREE.Object3D, fw: number, fh: number): THREE.Group {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  inner.add(model);
  model.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    const st = Math.max(1, Math.floor(p.count / 1500));
    for (let i = 0; i < p.count; i += st) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  });
  if (!pts.length) return g;
  const box = new THREE.Box3().setFromPoints(pts);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const dims = [s.x, s.y, s.z];
  const order = [0, 1, 2].sort((a, b) => dims[b] - dims[a]);
  const ax = (i: number) => new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
  // heavy end: more spread at that end of the long axis
  const li = order[0], mi = order[1];
  let lo = 0, hi = 0;
  for (const p of pts) {
    const t = (p.getComponent(li) - box.min.getComponent(li)) / Math.max(1e-5, dims[li]);
    const sp = Math.abs(p.getComponent(mi) - c.getComponent(mi));
    if (t < 0.25) lo = Math.max(lo, sp); else if (t > 0.75) hi = Math.max(hi, sp);
  }
  const vertical = fh >= fw;
  const L = ax(li).multiplyScalar(hi >= lo ? -1 : 1);   // heavy end -> toward -long
  const Mv = ax(mi);
  const S = new THREE.Vector3().crossVectors(L, Mv);
  // target: long -> z (vertical footprint) or x; mid -> the other; thin -> y
  const tL = vertical ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const tM = vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
  const tS = new THREE.Vector3().crossVectors(tL, tM);
  const from = new THREE.Matrix4().makeBasis(L, Mv, S);
  const to = new THREE.Matrix4().makeBasis(tL, tM, tS);
  inner.quaternion.setFromRotationMatrix(to.multiply(from.transpose()));
  model.position.sub(c);
  const longC = Math.max(fw, fh) * CELL, shortC = Math.min(fw, fh) * CELL;
  const sc = Math.min(longC * 0.9 / dims[li], shortC * 1.22 / dims[mi], (shortC >= CELL * 2 ? 0.07 : 0.04) / Math.max(1e-4, dims[order[2]]), fw === fh ? shortC * 0.9 / dims[mi] : Infinity);
  inner.scale.setScalar(sc);
  g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(inner);
  inner.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  g.userData.size = b2.getSize(new THREE.Vector3());
  return g;
}

// ------------------------------------------------------------------------------------------------ per-item view
interface Slot {
  uid: number;
  id: string;
  holder: THREE.Group;      // at the cell centre, turned for rot
  lift: THREE.Group;        // lifts on hover / drag
  model: THREE.Object3D | null;
  card: THREE.Mesh | null;  // icon card while there is no model
  shadow: THREE.Mesh;
  tag: THREE.Mesh | null;
  tagN: number;
  chalk: THREE.Mesh | null;
  // springs
  pos: THREE.Vector3; vel: THREE.Vector3; target: THREE.Vector3;
  rot: number; rotV: number; rotT: number;
  up: number; upV: number; upT: number;
  tilt: THREE.Vector2;
  delay: number;
  w: number; h: number;
}

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

export class PackUI {
  readonly object = new THREE.Group();
  /** the inventory model (grid + loose items), kept in step with the game's counts */
  readonly inv = new PackInventory(COLS, ROWS);
  /** the hovered item id (old API; the 3D hover is per stack) */
  hover: string | null = null;
  /** total pack weight (kg) and the burden it adds (0..0.35) */
  weight = 0;
  burden = 0;

  private game: PackGame | null = null;
  private items: Map<string, number> | null = null;
  private M = (MATS ??= makeMats());
  private rig = new THREE.Group();        // the whole pack, posed by the open spring
  private lidPivot = new THREE.Group();
  private slotsG = new THREE.Group();
  private cellsG = new THREE.Group();
  private cellMeshes: THREE.Mesh[] = [];
  private slots = new Map<number, Slot>();
  private version = -1;
  private isOpen = false;
  private t = 0; private tv = 0;            // open spring
  private lid = 0; private lidV = 0;
  private time = 0;
  private ray = new THREE.Raycaster();
  private cursor = new THREE.Vector2(0, -0.1);
  private absMouse: { x: number; y: number } | null = null;
  private hoverUid = -1;
  private hoverScale = false;
  private drag: { uid: number; rot: 0 | 1; off: THREE.Vector2; from: { x: number; y: number; rot: 0 | 1 }; moved: boolean; click: boolean; t: number; downAt: THREE.Vector2 } | null = null;
  private pressed: { uid: number; at: THREE.Vector2; t: number; hit: THREE.Vector2 } | null = null;
  private ghost: { x: number; y: number; w: number; h: number; r: string } | null = null;
  private scale!: { root: THREE.Group; needle: THREE.Object3D; swing: number; swingV: number; read: number; readV: number };
  private light = new THREE.PointLight(0xffe0b0, 0, 1.6, 2);
  private cursorEl: HTMLCanvasElement | null = null;
  private gloves = { point: paintGlove('point'), open: paintGlove('open'), grab: paintGlove('grab') };
  private gloveKind: 'point' | 'open' | 'grab' | '' = '';
  private label: HTMLDivElement | null = null;
  private counts_: HTMLDivElement | null = null;
  private countEls = new Map<number, HTMLDivElement>();
  private labelKey = '';
  private lastDom = 0;
  /** ms without an update() before the cursor and labels hide (the game paused); the dev page sets Infinity */
  overlayTimeout = 250;
  private controlled = false;
  private lastPanelHit = new THREE.Vector2();
  private sndT = 0;
  private handsBurden = 0;
  private lastBurden = -1;
  private overflowQ: [string, number][] = [];
  private modelRetry = 0;

  constructor(private modelFor: (id: string) => THREE.Object3D | null = () => null) {
    this.object.add(this.rig);
    this.object.visible = false;
    this.build();
    this.inv.onOverflow = (id, n) => this.overflowQ.push([id, n]);
    setIconModelSource((id) => this.modelFor(id));
    setFootprintSizer((id) => {
      const m = this.modelFor(id);
      if (!m) return null;
      const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
      return [s.x, s.y, s.z];
    });
  }

  // ---------------------------------------------------------------------------------------------- old API
  get open(): boolean { return this.isOpen; }
  set open(v: boolean) { if (v) this.show(); else this.close(); }

  /** open or close; items: the count map to show (defaults to the installed game's) */
  toggle(items?: Map<string, number>): void {
    if (items) this.items = items;
    if (this.isOpen) this.close(); else this.show();
  }

  /** the item id under a normalised device coordinate */
  pick(ndc: THREE.Vector2, cam: THREE.Camera): string | null {
    this.camOverride ??= cam;
    const h = this.panelHit(ndc, cam);
    if (!h) return null;
    const p = this.inv.grid.at(h.cx, h.cy);
    return p ? p.id : null;
  }

  // ---------------------------------------------------------------------------------------------- install
  /**
   * Hook into the game: the grid follows game.inv.items (give / take are wrapped so changes land at once; direct
   * writes to the map are caught every frame), pocketing something with no room keeps it in your hands, overflow is
   * dropped at your feet with "No room in the pack.", and the pack's weight adds to the player's burden.
   */
  install(game: PackGame): this {
    this.game = game;
    const g = game as PackGame & Record<string, unknown>;
    const give = game.give.bind(game), take = game.take.bind(game);
    g.give = (id: string, n = 1) => { give(id, n); this.sync(); };
    g.take = (id: string, n = 1) => { const ok = take(id, n); if (ok) this.sync(); return ok; };
    if (game.pocket) {
      const pocket = game.pocket.bind(game);
      g.pocket = (id: string, obj: THREE.Object3D) => {
        if (!obj.userData.unpaid && !this.inv.canFit(id)) {
          floatText.say('No room in the pack.', { dur: 2.2 });
          this.snd('bag_rustle', 0.3, 0.7);
          game.hands?.grab?.(obj, undefined, ITEMS[id]?.mass ?? 0.5);
          return;
        }
        pocket(id, obj);
      };
    }
    game.updaters?.push((dt) => this.tick(dt));
    if (game.toolModel) this.modelFor = (id) => game.toolModel!(id);
    // start neat (a saved layout replaces this through deserialize): place, tidy, then judge what does not fit
    const report = this.inv.onOverflow;
    this.inv.onOverflow = null;
    this.sync();
    this.inv.grid.autoArrange();
    this.inv.onOverflow = report;
    this.sync();
    for (const [id, n] of this.inv.loose) if (footprint(id).pack) this.overflowQ.push([id, n]);
    return this;
  }

  /** layout for saves */
  serialize(): PackSave { return this.inv.serialize(); }
  deserialize(s: PackSave | null | undefined): void { this.inv.deserialize(s, this.counts()); }

  private counts(): Map<string, number> { return this.game?.inv.items ?? this.items ?? new Map(); }

  /** reconcile the grid with the counts now */
  sync(): void { this.inv.reconcile(this.counts()); }

  /** per-frame (installed): reconcile, overflow drops, burden */
  private tick(dt: number): void {
    void dt;
    this.sync();
    // overflow: tell the player, put the extra down at their feet
    if (this.overflowQ.length) {
      const q = this.overflowQ.splice(0);
      floatText.say('No room in the pack.', { dur: 2.4 });
      const g = this.game;
      if (g?.setDown && g.player && g.mode !== 'drive') for (const [id, n] of q) for (let i = 0; i < n; i++) g.setDown(id, this.feet(i));
    }
    // the pack's weight on the player: hands set burden when carrying; we add ours on top
    const pl = this.game?.player;
    if (pl) {
      if (pl.burden !== this.lastBurden) this.handsBurden = pl.burden;
      pl.burden = Math.min(0.9, this.handsBurden + this.burden);
      this.lastBurden = pl.burden;
    }
  }

  /** a spot on the ground in front of the player */
  private feet(i = 0): THREE.Vector3 {
    const g = this.game!;
    const yaw = g.player?.yaw ?? 0;
    const fw = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    if (g.camera) { g.camera.getWorldDirection(fw); fw.y = 0; fw.normalize(); }
    const side = new THREE.Vector3(-fw.z, 0, fw.x);
    return g.player!.pos.clone().add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(fw, 0.65).addScaledVector(side, (i % 3 - 1) * 0.18);
  }

  // ---------------------------------------------------------------------------------------------- build
  private build(): void {
    const M = this.M;
    const rig = this.rig;
    // body
    const body = new THREE.Mesh(bodyGeo(), M.duck);
    rig.add(body);
    // inner wall darkening: a second, slightly smaller loft facing in, in the dark canvas
    const innerWall = new THREE.Mesh(bodyGeo(), M.duckDark);
    innerWall.scale.set(0.97, 0.35, 0.97);
    innerWall.position.y = -0.002;
    rig.add(innerWall);
    // rolled leather rim
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) { const [x, z] = sup((i / 96) * Math.PI * 2, AX, AZ); rim.push(new THREE.Vector3(x, 0.003, z)); }
    rig.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 192, 0.0075, 6, true), M.leather));
    // the stiff board
    const bw = PW, bh = PH;
    const boardGeo = new THREE.PlaneGeometry(bw, bh, 1, 1);
    boardGeo.rotateX(-Math.PI / 2);
    // uv: the board texture is square (BPX), the board is not: crop
    const { ppm, BPX } = M.boardUV;
    const uw = (bw * ppm) / BPX, uh = (bh * ppm) / BPX;
    const uvA = boardGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, 0.5 + (uvA.getX(i) - 0.5) * uw, 0.5 + (uvA.getY(i) - 0.5) * uh);
    const board = new THREE.Mesh(boardGeo, M.board);
    board.position.set(0, -0.004, 0);
    rig.add(board);
    // the gap between board and rim: a fold of canvas sloping down into the bag
    const fold: number[] = [], foldUv: number[] = [], foldIdx: number[] = [];
    const NF = 96;
    for (let i = 0; i <= NF; i++) {
      const a = (i / NF) * Math.PI * 2;
      const [x, z] = sup(a, AX - 0.002, AZ - 0.002);
      const [bx, bz] = sup(a, PW / 2, PH / 2, 0.08);
      fold.push(x, 0.0, z, bx, -0.006, bz);
      foldUv.push(i / NF * 8, 0, i / NF * 8, 0.12);
    }
    for (let i = 0; i < NF; i++) { const a = i * 2; foldIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fold, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(foldUv, 2));
    fg.setIndex(foldIdx); fg.computeVertexNormals();
    rig.add(new THREE.Mesh(fg, M.duckDark));
    // leather corner patches on the mouth
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const a0 = Math.atan2(sz, sx);
      const pts: THREE.Vector3[] = [];
      for (let k = -4; k <= 4; k++) { const [x, z] = sup(a0 + k * 0.05, AX + 0.002, AZ + 0.002); pts.push(new THREE.Vector3(x, -0.004, z)); }
      const c = new THREE.CatmullRomCurve3(pts);
      const patch = new THREE.Mesh(ribbon(c, 0.03, new THREE.Vector3(0, 0, 0).set(Math.cos(a0), 0, Math.sin(a0)), 12, 0.4), M.leather);
      patch.position.y = -0.008;
      rig.add(patch);
    }
    // front buckles: straps sewn to the near wall, brass buckles at the rim, tongues hanging out
    const nearZ = AZ * 1.03;
    for (const sx of [-0.085, 0.085]) {
      const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(sx, -0.1, nearZ * 1.04), new THREE.Vector3(sx, -0.05, nearZ * 1.07), new THREE.Vector3(sx, -0.012, nearZ * 1.035)]);
      rig.add(new THREE.Mesh(ribbon(strap, 0.022, new THREE.Vector3(0, 0, 1)), M.leatherPlain));
      const buckle = new THREE.Mesh(loopTube(0.03, 0.022, 0.0022), M.brass);
      buckle.position.set(sx, -0.008, nearZ * 1.04);
      buckle.rotation.x = Math.PI / 2 - 0.25;
      rig.add(buckle);
      const prong = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(sx, -0.016, nearZ * 1.05), new THREE.Vector3(sx, -0.002, nearZ * 1.06)]), 4, 0.0012, 4), M.iron);
      rig.add(prong);
      const tongue = new THREE.CatmullRomCurve3([new THREE.Vector3(sx, -0.006, nearZ * 1.05), new THREE.Vector3(sx + 0.004, 0.004, nearZ * 1.1), new THREE.Vector3(sx + 0.01, -0.012, nearZ * 1.2), new THREE.Vector3(sx + 0.014, -0.04, nearZ * 1.24)]);
      rig.add(new THREE.Mesh(ribbon(tongue, 0.02, new THREE.Vector3(0, 1, 0.3).normalize()), M.leatherPlain));
    }
    // side compression straps
    for (const sx of [-1, 1]) {
      const x = sx * AX * 1.06;
      const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(x * 0.98, -0.1, 0.02), new THREE.Vector3(x * 1.03, -0.05, 0.01), new THREE.Vector3(x, -0.004, 0)]);
      rig.add(new THREE.Mesh(ribbon(strap, 0.022, new THREE.Vector3(sx, 0, 0)), M.leatherPlain));
    }
    // bellows side pockets: a small bag on each side wall, a domed flap with a strap and buckle
    for (const sx of [-1, 1]) {
      const pw = 0.026, pl = 0.058, pd = 0.07;
      const pocket = new THREE.Mesh(bodyGeo(pw, pl, pd, 0.16, 9 + sx), M.duck);
      pocket.position.set(sx * (AX * 1.07 + pw * 0.55), -0.04, 0.07);
      pocket.rotation.z = sx * -0.2;
      rig.add(pocket);
      const fl = new THREE.Group();
      fl.position.set(sx * (AX * 1.07 + pw * 0.7), -0.036, 0.07 - pl * 1.04);
      fl.rotation.z = sx * -0.28;
      const flap = new THREE.Mesh(cushion(pw * 2.2, pl * 2.1, 0.026), M.duckDark);
      fl.add(flap);
      const fEdge: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) { const a = Math.PI + (k / 24) * Math.PI; fEdge.push(new THREE.Vector3(Math.cos(a) * pw * 1.15, 0.001, pl * 1.55 + Math.sin(-a) * pl * 0.57)); }
      fl.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fEdge), 32, 0.0035, 5), M.leather));
      const st = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.013, pl * 0.6), new THREE.Vector3(0, 0.014, pl * 1.6), new THREE.Vector3(0, 0.004, pl * 2.15), new THREE.Vector3(0, -0.03, pl * 2.2)]);
      fl.add(new THREE.Mesh(ribbon(st, 0.016, new THREE.Vector3(0, 1, 0), 16, 1, new THREE.Vector3(1, 0, 0)), M.leatherPlain));
      const bk = new THREE.Mesh(loopTube(0.02, 0.016, 0.0018), M.brass);
      bk.position.set(0, 0.016, pl * 1.75);
      fl.add(bk);
      rig.add(fl);
    }
    // carry handle at the far edge, between the body and the lid hinge
    {
      const z = -AZ - 0.004;
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.045, -0.006, z), new THREE.Vector3(-0.03, 0.012, z - 0.026), new THREE.Vector3(0.03, 0.012, z - 0.026), new THREE.Vector3(0.045, -0.006, z)]);
      rig.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.006, 6), M.leather));
    }
    // the lid
    this.lidPivot.position.set(0, 0.006, -AZ + 0.004);
    const lid = buildLid(M);
    this.lidPivot.add(lid);
    rig.add(this.lidPivot);
    // D-ring and the spring scale on the right
    {
      const ring = new THREE.Mesh(loopTube(0.018, 0.016, 0.0018), M.brass);
      ring.position.set(AX + 0.012, 0.004, -AZ * 0.8);
      ring.rotation.z = Math.PI / 2;
      rig.add(ring);
      const root = new THREE.Group();
      root.position.set(AX + 0.02, 0.004, -AZ * 0.8);
      rig.add(root);
      const hang = new THREE.Group();    // re-oriented to gravity every frame
      root.add(hang);
      // top hook through the ring
      const hook = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.006, 0.004, 0), new THREE.Vector3(0, 0.01, 0), new THREE.Vector3(0.006, 0.002, 0), new THREE.Vector3(0.002, -0.012, 0), new THREE.Vector3(0, -0.022, 0)]);
      hang.add(new THREE.Mesh(new THREE.TubeGeometry(hook, 16, 0.0016, 5), M.iron));
      // dial body: a lathed drum
      const prof = [new THREE.Vector2(0.0001, -0.005), new THREE.Vector2(0.024, -0.005), new THREE.Vector2(0.027, -0.003), new THREE.Vector2(0.027, 0.003), new THREE.Vector2(0.024, 0.005), new THREE.Vector2(0.0001, 0.005)];
      const drum = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), M.brass);
      drum.rotation.x = Math.PI / 2;
      drum.position.y = -0.05;
      hang.add(drum);
      const faceGeo = new THREE.CircleGeometry(0.0235, 32);
      const face = new THREE.Mesh(faceGeo, M.dial);
      face.position.set(0, -0.05, 0.0052);
      hang.add(face);
      const needle = new THREE.Group();
      needle.position.set(0, -0.05, 0.0062);
      const nGeo = new THREE.BufferGeometry();
      nGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.0012, 0, 0, 0.0012, 0, 0, 0, 0.019, 0, -0.001, 0, 0, 0.001, 0, 0, 0, -0.005, 0], 3));
      nGeo.computeVertexNormals();
      needle.add(new THREE.Mesh(nGeo, new THREE.MeshStandardMaterial({ color: 0x8c1d12, roughness: 0.5, side: THREE.DoubleSide })));
      hang.add(needle);
      // eye on top of the drum and hook below
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0014, 5, 12), M.brass);
      eye.position.set(0, -0.0245, 0);
      hang.add(eye);
      const low = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.077, 0), new THREE.Vector3(0, -0.088, 0), new THREE.Vector3(0.006, -0.094, 0), new THREE.Vector3(0.008, -0.088, 0)]);
      hang.add(new THREE.Mesh(new THREE.TubeGeometry(low, 12, 0.0016, 5), M.iron));
      hang.scale.setScalar(1.3);
      this.scale = { root: hang, needle, swing: 0, swingV: 0, read: 0, readV: 0 };
      hang.userData.scale = true;
    }
    // cell highlights
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96), new THREE.MeshBasicMaterial({ map: M.glowTex, color: 0xffd28a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(cellX(i), 0.0008, cellZ(j));
      m.renderOrder = 2;
      this.cellsG.add(m);
      this.cellMeshes.push(m);
    }
    rig.add(this.cellsG, this.slotsG);
    rig.add(this.light);
    this.light.position.set(-0.05, 0.3, 0.2);
  }

  // ---------------------------------------------------------------------------------------------- slots
  private makeSlot(p: Placement): Slot {
    const holder = new THREE.Group(), lift = new THREE.Group();
    holder.add(lift);
    const f = footprint(p.id);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.0007;
    shadow.renderOrder = 1;
    holder.add(shadow);
    const s: Slot = {
      uid: p.uid, id: p.id, holder, lift, model: null, card: null, shadow, tag: null, tagN: -1, chalk: null,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), target: new THREE.Vector3(),
      rot: p.rot ? -Math.PI / 2 : 0, rotV: 0, rotT: 0, up: 0.05, upV: 0, upT: 0, tilt: new THREE.Vector2(), delay: 0,
      w: f.w, h: f.h,
    };
    this.attachModel(s);
    holder.userData.uid = p.uid;
    this.slotsG.add(holder);
    const c = this.placeCentre(p);
    s.pos.copy(c); s.target.copy(c);
    return s;
  }

  private attachModel(s: Slot): void {
    const m = this.modelFor(s.id);
    if (m) {
      if (s.card) { s.card.removeFromParent(); s.card = null; }
      const fitted = fitModel(m, s.w, s.h);
      s.model = fitted;
      s.lift.add(fitted);
      const sz = fitted.userData.size as THREE.Vector3 | undefined;
      if (sz) s.shadow.userData.base = new THREE.Vector2(sz.x * 1.15 + 0.008, sz.z * 1.15 + 0.008);
    } else if (!s.card) {
      // no model (yet): the item's pixel icon on a paper card
      const card = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(s.w, s.h) * CELL * 0.86, Math.min(s.w, s.h) * CELL * 0.86), new THREE.MeshStandardMaterial({ map: itemIconTex(s.id), transparent: true, alphaTest: 0.5, roughness: 1 }));
      card.rotation.x = -Math.PI / 2;
      card.position.y = 0.002;
      s.card = card;
      s.lift.add(card);
      s.shadow.userData.base = new THREE.Vector2(Math.min(s.w, s.h) * CELL * 0.8, Math.min(s.w, s.h) * CELL * 0.8);
    }
  }

  private placeCentre(p: Placement): THREE.Vector3 {
    const d = dimsOf(p.id, p.rot);
    return new THREE.Vector3(-GW / 2 + (p.x + d.w / 2) * CELL, 0, -GH / 2 + (p.y + d.h / 2) * CELL + BZ);
  }

  private setTag(s: Slot, n: number, stackable: boolean): void {
    if (s.tagN === n) return;
    s.tagN = n;
    if (s.tag) { s.tag.removeFromParent(); (s.tag.material as THREE.MeshStandardMaterial).map?.dispose(); s.tag = null; }
    if (!stackable && n <= 1) return;
    const tex = canvasTex(paintTag(''));
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.017), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide }));
    tag.rotation.x = -Math.PI / 2;
    const r = new Rng(hashStr(s.id) + s.uid);
    tag.rotation.z = r.range(-0.25, 0.1);
    const top = ((s.model?.userData.size as THREE.Vector3 | undefined)?.y ?? 0.01) * 0.7;
    tag.position.set(s.w * CELL / 2 - 0.017, top + 0.003, s.h * CELL / 2 - 0.01);
    tag.rotation.x = -Math.PI / 2 + 0.25;
    tag.userData.text = `x${n}`;
    s.tag = tag;
    s.lift.add(tag);
  }

  private syncSlots(): void {
    const g = this.inv.grid;
    const live = new Set<number>();
    for (const p of g.items) {
      live.add(p.uid);
      let s = this.slots.get(p.uid);
      if (!s || s.id !== p.id) {
        if (s) { s.holder.removeFromParent(); }
        s = this.makeSlot(p);
        this.slots.set(p.uid, s);
        if (this.isOpen) { s.up = 0.06; s.upV = 0; s.delay = 0; }
      }
      if (!this.drag || this.drag.uid !== p.uid) s.target.copy(this.placeCentre(p));
      s.rotT = p.rot ? -Math.PI / 2 : 0;
      this.setTag(s, p.n, footprint(p.id).stack > 1);
    }
    for (const [uid, s] of this.slots) if (!live.has(uid)) { s.holder.removeFromParent(); this.slots.delete(uid); }
    this.version = g.version;
  }

  // ---------------------------------------------------------------------------------------------- open / close
  private show(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    if (!this.game) this.sync();
    this.syncSlots();
    // retry models that were not loaded last time
    for (const s of this.slots.values()) if (!s.model) this.attachModel(s);
    // items settle in from just above the board, one after another
    let k = 0;
    for (const s of [...this.slots.values()].sort((a, b) => a.pos.z - b.pos.z || a.pos.x - b.pos.x)) { s.up = 0.035; s.upV = 0; s.delay = 0.18 + k++ * 0.035; }
    this.lid = 0; this.lidV = 0;
    this.snd('zip', 0.55);
    setTimeout(() => this.snd('bag_rustle', 0.35, 1.1), 140);
    this.ensureDom();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.drag) this.cancelDrag();
    this.pressed = null;
    this.hoverUid = -1;
    this.hover = null;
    this.ghost = null;
    this.snd('bag_rustle', 0.4, 0.9);
    setTimeout(() => this.snd('coins', 0.1, 1.6), 260);
    this.showLabel(null);
    if (this.cursorEl) this.cursorEl.style.display = 'none';
  }

  // ---------------------------------------------------------------------------------------------- picking
  private panelHit(ndc: THREE.Vector2, cam: THREE.Camera): { x: number; z: number; cx: number; cy: number } | null {
    this.rig.updateMatrixWorld(true);
    this.ray.setFromCamera(ndc, cam);
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rig.getWorldQuaternion(tmpQ));
    const o = this.rig.getWorldPosition(tmpV.clone());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, o);
    const hit = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    const l = this.rig.worldToLocal(hit);
    const cx = Math.floor((l.x + GW / 2) / CELL), cy = Math.floor((l.z - BZ + GH / 2) / CELL);
    return { x: l.x, z: l.z, cx, cy };
  }

  private viewCam(): THREE.Camera | null { return this.game?.viewCam ?? this.camOverride; }
  /** shift-click handler when another container is open (a woodbox, a shelf): return true if it took the item.
   *  Unset, shift-click quick-moves inside the pack. */
  onQuickMove: ((p: Placement) => boolean) | null = null;
  /** the camera the pack is seen through (set by the dev page; the game's viewCam once installed) */
  camOverride: THREE.Camera | null = null;

  // ---------------------------------------------------------------------------------------------- control
  /** every frame while open: cursor, hover, drag and the keys. Call after the player update. */
  control(dt: number): void {
    if (!this.isOpen) return;
    this.controlled = true;
    const cam = this.viewCam();
    if (!cam) return;
    // cursor: mouse deltas while the pointer is locked, the real pointer otherwise
    if (input.locked) {
      this.cursor.x += input.mouseDX * (2 / innerWidth) * 1.1;
      this.cursor.y -= input.mouseDY * (2 / innerHeight) * 1.1;
    } else if (this.absMouse) this.cursor.set(this.absMouse.x / innerWidth * 2 - 1, -(this.absMouse.y / innerHeight) * 2 + 1);
    this.cursor.x = THREE.MathUtils.clamp(this.cursor.x, -0.98, 0.98);
    this.cursor.y = THREE.MathUtils.clamp(this.cursor.y, -0.98, 0.98);
    const hit = this.panelHit(this.cursor, cam);
    const g = this.inv.grid;
    const onBoard = !!hit && hit.cx >= 0 && hit.cy >= 0 && hit.cx < COLS && hit.cy < ROWS;
    const under = onBoard ? g.at(hit!.cx, hit!.cy) : null;
    if (hit) this.lastPanelHit.set(hit.x, hit.z);
    // the scale (a forgiving screen-space disc around the dial)
    {
      const dial = this.scale.root.localToWorld(new THREE.Vector3(0, -0.05, 0)).project(cam);
      const edge = this.scale.root.localToWorld(new THREE.Vector3(0.04, -0.05, 0)).project(cam);
      const r = Math.hypot((edge.x - dial.x) * innerWidth, (edge.y - dial.y) * innerHeight) / 2;
      const d = Math.hypot((this.cursor.x - dial.x) * innerWidth, (this.cursor.y - dial.y) * innerHeight) / 2;
      this.hoverScale = !this.drag && !under && d < Math.max(14, r);
    }

    const shift = input.held('ShiftLeft') || input.held('ShiftRight');
    if (this.drag) {
      this.updateDrag(dt, hit);
    } else {
      // hover
      const uid = under?.uid ?? -1;
      if (uid !== this.hoverUid) {
        this.hoverUid = uid;
        if (uid >= 0 && this.sndT <= 0) { this.snd('paper_rustle', 0.06, 1.9); this.sndT = 0.08; }
      }
      this.hover = under?.id ?? null;
      // press: start a drag (or a click-to-carry)
      if (input.pressed('Mouse0') && under && hit) {
        if (shift) {
          const s = this.slots.get(under.uid);
          const moved = this.onQuickMove ? this.onQuickMove(under) : g.quickMove(under.uid);
          if (moved) { this.matSnd(under.id, 'put'); if (s) { s.upV = 0.5; } }
          else this.snd('bag_rustle', 0.2, 0.6);
        } else this.pressed = { uid: under.uid, at: this.cursor.clone(), t: 0, hit: new THREE.Vector2(hit.x, hit.z) };
      }
      if (this.pressed) {
        this.pressed.t += dt;
        const moved = this.pressed.at.distanceTo(this.cursor) > 0.012;
        if (moved || this.pressed.t > 0.22) this.beginDrag(this.pressed.uid, this.pressed.hit, false);
        else if (input.released('Mouse0')) this.beginDrag(this.pressed.uid, this.pressed.hit, true);
      }
      if (input.pressed('Mouse2') && under) this.use(under);
      if ((input.pressed('KeyQ')) && under) this.dropOne(under);
      if (input.pressed('KeyT')) this.tidy();
      if (input.pressed('Escape')) this.close();
    }
    this.sndT -= dt;
  }

  private beginDrag(uid: number, hit: THREE.Vector2, click: boolean): void {
    const p = this.inv.grid.byUid(uid);
    const s = this.slots.get(uid);
    this.pressed = null;
    if (!p || !s) return;
    const c = this.placeCentre(p);
    this.drag = { uid, rot: p.rot, off: new THREE.Vector2(c.x - hit.x, c.z - hit.y), from: { x: p.x, y: p.y, rot: p.rot }, moved: false, click, t: 0, downAt: this.cursor.clone() };
    s.upT = 0.032;
    this.matSnd(p.id, 'lift');
  }

  private updateDrag(dt: number, hit: { x: number; z: number; cx: number; cy: number } | null): void {
    const d = this.drag!;
    d.t += dt;
    const p = this.inv.grid.byUid(d.uid);
    const s = this.slots.get(d.uid);
    if (!p || !s) { this.drag = null; this.ghost = null; return; }
    if (input.pressed('KeyR')) {
      d.rot = d.rot ? 0 : 1;
      s.rotT = d.rot ? -Math.PI / 2 : 0;
      // keep the grab point under the cursor as it turns (the same quarter turn the model makes)
      d.off.set(d.rot ? -d.off.y : d.off.y, d.rot ? d.off.x : -d.off.x);
      this.snd('bag_rustle', 0.16, 1.5);
    }
    const at = hit ? new THREE.Vector2(hit.x, hit.z) : this.lastPanelHit.clone();
    const cx = at.x + d.off.x, cz = at.y + d.off.y;
    s.target.set(cx, 0, cz);
    const dm = dimsOf(p.id, d.rot);
    const tx = Math.round((cx + GW / 2) / CELL - dm.w / 2), ty = Math.round((cz - BZ + GH / 2) / CELL - dm.h / 2);
    // off the pack entirely: drop it in the world on release
    const off = !hit || Math.abs(at.x) > GW / 2 + CELL * 1.2 || Math.abs(at.y - BZ) > GH / 2 + CELL * 1.2;
    const fit = off ? { r: 'out' as const } : this.inv.grid.fit(p, tx, ty, d.rot);
    this.ghost = off ? null : { x: tx, y: ty, w: dm.w, h: dm.h, r: fit.r };
    if (this.cursor.distanceTo(d.downAt) > 0.01) d.moved = true;
    const release = d.click ? input.pressed('Mouse0') : input.released('Mouse0');
    if (input.pressed('KeyQ')) { this.cancelDrag(); this.dropOne(p, true); return; }
    if (input.pressed('Escape') || input.pressed('Mouse2')) { this.cancelDrag(); return; }
    if (!release) return;
    if (off) {
      // dragged off the pack: out it goes
      const n = p.n;
      this.cancelDrag(false);
      for (let i = 0; i < n; i++) this.dropOne(p, i > 0);
      return;
    }
    const res = fit.r === 'ok' || fit.r === 'merge' || fit.r === 'swap' ? this.inv.grid.move(p.uid, tx, ty, d.rot) : null;
    this.drag = null;
    this.ghost = null;
    s.upT = 0;
    if (res) {
      s.upV = -0.25;   // a little bounce as it lands
      this.matSnd(p.id, 'put');
      if (res === 'merge') this.snd('paper_rustle', 0.2, 1.3);
      if (res === 'swap' && fit.other) { const o = this.slots.get(fit.other.uid); if (o) { o.upV = 0.4; this.matSnd(o.id, 'lift'); } }
    } else {
      // nope: back where it came from
      s.rotT = d.from.rot ? -Math.PI / 2 : 0;
      this.snd('bag_rustle', 0.25, 0.62);
    }
    this.syncSlots();
  }

  private cancelDrag(sound = true): void {
    const d = this.drag;
    if (!d) return;
    const s = this.slots.get(d.uid);
    const p = this.inv.grid.byUid(d.uid);
    if (s) { s.upT = 0; s.rotT = d.from.rot ? -Math.PI / 2 : 0; if (p) s.target.copy(this.placeCentre(p)); }
    this.drag = null;
    this.ghost = null;
    if (sound && p) this.matSnd(p.id, 'put');
  }

  /** right-click: eat / drink food, otherwise take it into your hand (or put it back if it is already there) */
  private use(p: Placement): void {
    const g = this.game;
    const def = ITEMS[p.id];
    if (!g || !def) return;
    if (def.food && g.useItem) {
      this.inv.preferUid = p.uid;
      g.useItem(p.id, { obj: null, point: null });
      return;
    }
    if (!g.hands) return;
    if (g.hands.busy) { floatText.say('Hands are full.', { dur: 1.6 }); return; }
    if (g.hands.heldItem === p.id) { g.hands.equip(null); this.matSnd(p.id, 'put'); return; }
    g.hands.equip(p.id);
    this.matSnd(p.id, 'lift');
    this.close();
  }

  /** Q: put one down in the world in front of you */
  private dropOne(p: Placement, quiet = false): void {
    const g = this.game;
    if (!g?.setDown || !g.player) { if (!quiet) this.snd('bag_rustle', 0.2, 0.6); return; }
    this.inv.preferUid = p.uid;
    g.setDown(p.id, this.feet(Math.floor(Math.random() * 3)));
    if (!quiet) this.snd('bag_rustle', 0.3, 1.2);
  }

  /** T: re-pack everything neatly; items fly to their new cells one after another */
  tidy(): void {
    if (this.drag) return;
    const before = new Map(this.inv.grid.items.map((p) => [p.uid, `${p.x},${p.y},${p.rot}`]));
    if (!this.inv.grid.autoArrange()) { this.snd('bag_rustle', 0.25, 0.6); return; }
    this.syncSlots();
    let k = 0;
    for (const p of this.inv.grid.items) {
      const s = this.slots.get(p.uid);
      if (!s || before.get(p.uid) === `${p.x},${p.y},${p.rot}`) continue;
      s.delay = k * 0.05; s.upT = 0; s.upV = 0.6;
      const kk = k++;
      setTimeout(() => this.matSnd(p.id, 'put', 0.6), 120 + kk * 50);
    }
    this.snd('bag_rustle', 0.4, 1.0);
  }

  // ---------------------------------------------------------------------------------------------- sound
  private snd(id: string, vol: number, rate = 1): void { audio.play(id, { vol, rate }); }

  private matSnd(id: string, kind: 'lift' | 'put', v = 1): void {
    const m: SoundMat = footprint(id).snd;
    const t: Record<SoundMat, [string, number, number, string, number, number]> = {
      tool: ['wood_stack', 0.22, 1.35, 'log_thud', 0.16, 1.9],
      metal: ['pot_lid', 0.12, 1.5, 'pot_lid', 0.16, 1.25],
      glass: ['bottle_clink', 0.2, 1.1, 'bottle_set', 0.3, 1.05],
      tin: ['pot_lid', 0.1, 1.8, 'bottle_set', 0.22, 0.8],
      paper: ['paper_rustle', 0.24, 1.2, 'paper_rustle', 0.22, 0.85],
      food: ['paper_rustle', 0.18, 1.0, 'bag_rustle', 0.2, 1.2],
      cloth: ['bag_rustle', 0.24, 1.1, 'bag_rustle', 0.22, 0.8],
      wood: ['wood_stack', 0.18, 1.5, 'wood_stack', 0.24, 1.2],
    };
    const e = t[m];
    if (kind === 'lift') this.snd(e[0], e[1] * v, e[2]); else this.snd(e[3], e[4] * v, e[5]);
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (!this.game && this.items) this.inv.reconcile(this.items);
    this.weight = this.inv.grid.weight();
    this.burden = Math.min(0.35, this.weight / 100 + Math.max(0, this.weight - RED_KG) / 40);
    // the open spring (slightly under-damped: the pack swings up and settles)
    const k = 90, c = 13;
    this.tv += ((this.isOpen ? 1 : 0) - this.t) * k * dt - this.tv * c * dt;
    this.t += this.tv * dt;
    this.object.visible = this.t > 0.01;
    if (!this.object.visible) { this.controlled = false; return; }
    if (this.inv.grid.version !== this.version) this.syncSlots();
    if ((this.modelRetry -= dt) <= 0) { this.modelRetry = 1; for (const s of this.slots.values()) if (!s.model) this.attachModel(s); }
    const t = this.t;
    // pose: up from below the view, a little roll, then a slow breathing sway and a tilt toward the cursor
    const breathe = Math.sin(this.time * 1.4) * 0.0025;
    const cx = this.cursor.x, cy = this.cursor.y;
    this.rig.position.set(0.02 * (1 - t), -0.7 + t * 0.675 + breathe, -0.56);
    this.rig.rotation.set(0.25 + t * 0.68 - cy * 0.02, cx * 0.035, -0.35 * (1 - t) - cx * 0.012);
    // lid: flops open once the pack is up, shuts as it goes
    const lidT = this.isOpen ? (t > 0.55 ? LID_OPEN : 0.4) : 0;
    this.lidV += (lidT - this.lid) * 140 * dt - this.lidV * 11 * dt;
    this.lid += this.lidV * dt;
    this.lidPivot.rotation.x = -this.lid;
    // warm fill so the pack reads at night and indoors
    this.light.intensity = 0.05 * t;
    // the old game loop drives `hover` by id instead of calling control()
    if (!this.controlled) {
      const p = this.hover ? this.inv.grid.items.find((i) => i.id === this.hover) : null;
      this.hoverUid = p ? p.uid : -1;
    }
    // held item: shown as a chalk outline in its cells
    const held = this.game?.hands?.heldItem ?? '';
    const g = this.inv.grid;
    // slots
    for (const s of this.slots.values()) {
      const p = g.byUid(s.uid);
      if (s.delay > 0) {
        s.delay -= dt;
        s.holder.position.copy(s.pos);
        s.holder.visible = false;
        continue;
      }
      s.holder.visible = true;
      const dragging = this.drag?.uid === s.uid;
      const hov = !this.drag && this.hoverUid === s.uid && this.isOpen;
      const target = dragging ? 0.032 : hov ? 0.008 : s.upT;
      // position: glued to the glove while dragging (velocity kept for the tilt), a bouncy spring otherwise
      if (dragging) {
        tmpV.copy(s.pos);
        s.pos.lerp(s.target, 1 - Math.exp(-28 * dt));
        if (dt > 0) s.vel.copy(s.pos).sub(tmpV).divideScalar(dt);
      } else {
        tmpV.copy(s.target).sub(s.pos).multiplyScalar(240).addScaledVector(s.vel, -24);
        s.vel.addScaledVector(tmpV, dt);
        s.pos.addScaledVector(s.vel, dt);
      }
      // lift spring (bouncy)
      s.upV += (target - s.up) * 320 * dt - s.upV * 16 * dt;
      s.up += s.upV * dt;
      // rotation spring
      s.rotV += (s.rotT - s.rot) * 260 * dt - s.rotV * 20 * dt;
      s.rot += s.rotV * dt;
      // tilt with motion while dragging
      s.tilt.x += (THREE.MathUtils.clamp(s.vel.z * 1.6, -0.3, 0.3) - s.tilt.x) * Math.min(1, dt * 14);
      s.tilt.y += (THREE.MathUtils.clamp(-s.vel.x * 1.6, -0.3, 0.3) - s.tilt.y) * Math.min(1, dt * 14);
      s.holder.position.copy(s.pos);
      s.holder.rotation.set(0, s.rot, 0);
      s.lift.position.y = Math.max(-0.002, s.up);
      s.lift.rotation.set(s.tilt.x, 0, s.tilt.y);
      // squash on landing
      const sq = THREE.MathUtils.clamp(-s.upV * 0.25, -0.12, 0.12);
      s.lift.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      // the contact shadow spreads and drifts down-right as the item lifts off the board
      const base = s.shadow.userData.base as THREE.Vector2 | undefined;
      const k = 1 + s.up * 9;
      if (base) s.shadow.scale.set(base.x * k, base.y * k, 1);
      s.shadow.position.set(0.004 + s.up * 0.35, 0.0007, 0.006 + s.up * 0.45);
      // held: chalk outline, model hidden
      const inHand = !!p && held === p.id && (this.counts().get(p.id) ?? 0) <= 1;
      if (inHand && !s.chalk) {
        const ch = new THREE.Mesh(new THREE.PlaneGeometry(s.w * CELL * 0.96, s.h * CELL * 0.96), new THREE.MeshBasicMaterial({ map: canvasTex(paintChalk(s.w * 32, s.h * 32)), transparent: true, depthWrite: false }));
        ch.rotation.x = -Math.PI / 2; ch.position.y = 0.001;
        s.chalk = ch; s.holder.add(ch);
      }
      if (s.chalk) s.chalk.visible = inHand;
      s.lift.visible = !inHand;
      s.shadow.visible = !inHand;
    }
    // cell highlights: hover glow, drag ghost
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const m = this.cellMeshes[j * COLS + i];
      const mat = m.material as THREE.MeshBasicMaterial;
      let a = 0;
      let col = 0xffcf86;
      const gh = this.ghost;
      if (gh && i >= gh.x && j >= gh.y && i < gh.x + gh.w && j < gh.y + gh.h) {
        a = 0.42 + 0.1 * Math.sin(this.time * 9);
        col = gh.r === 'ok' ? 0x6cff7a : gh.r === 'merge' || gh.r === 'swap' ? 0xffc23c : 0xff4a3a;
      } else if (!this.drag && this.hoverUid >= 0) {
        const p = g.byUid(this.hoverUid);
        if (p) { const d = g.dims(p); if (i >= p.x && j >= p.y && i < p.x + d.w && j < p.y + d.h) a = 0.16 + 0.04 * Math.sin(this.time * 4); }
      }
      mat.color.setHex(col);
      mat.opacity += (a - mat.opacity) * Math.min(1, dt * 18);
      m.visible = mat.opacity > 0.01;
    }
    // the spring scale: hangs plumb, swings when the pack moves, the needle hunts and settles
    {
      const sc = this.scale;
      const read = Math.min(MAX_KG, this.weight) / MAX_KG;
      sc.readV += (read - sc.read) * 60 * dt - sc.readV * 5 * dt;
      sc.read += sc.readV * dt;
      sc.needle.rotation.z = -(DIAL_START + sc.read * DIAL_SWEEP) + Math.PI / 2 + Math.PI;
      // gravity in the rig's frame
      this.rig.updateMatrixWorld(true);
      const parentQ = sc.root.parent!.getWorldQuaternion(new THREE.Quaternion());
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(parentQ.clone().invert());
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
      // face the viewer: twist about the hanging axis so the dial looks back at the camera
      const look = new THREE.Vector3(0, 0, 1).applyQuaternion(parentQ.clone().invert());
      const cur = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const axis = down.clone().normalize();
      const proj = (v: THREE.Vector3) => v.clone().sub(axis.clone().multiplyScalar(v.dot(axis))).normalize();
      const a1 = proj(cur), a2 = proj(look);
      const ang = Math.atan2(axis.dot(new THREE.Vector3().crossVectors(a1, a2)), a1.dot(a2));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
      sc.swingV += (-sc.swing) * 40 * dt - sc.swingV * 1.6 * dt + this.tv * dt * 6;
      sc.swing += sc.swingV * dt;
      sc.root.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sc.swing * 0.5)));
    }
    this.updateDom();
    this.controlled = false;
  }

  // ---------------------------------------------------------------------------------------------- DOM: cursor + label
  private ensureDom(): void {
    if (this.cursorEl || typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = `
@font-face { font-family: Alagard; src: url(assets/fonts/Alagard.ttf); }
.pk-cursor { position: fixed; left: 0; top: 0; width: 32px; height: 32px; image-rendering: pixelated; pointer-events: none; z-index: 30; will-change: transform; }
.pk-label { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 29; display: flex; gap: 8px; align-items: center; white-space: pre;
  font-family: Alagard, monospace; font-size: 16px; line-height: 18px; color: #f6eccf; -webkit-font-smoothing: none; font-smooth: never;
  text-shadow: 2px 0 0 #120d0a, -2px 0 0 #120d0a, 0 2px 0 #120d0a, 0 -2px 0 #120d0a, 2px 2px 0 #120d0a, -2px 2px 0 #120d0a, 2px -2px 0 #120d0a, -2px -2px 0 #120d0a, 0 4px 0 rgba(0,0,0,.45);
  transition: opacity .12s; will-change: transform, opacity; }
.pk-label canvas { width: 48px; height: 48px; image-rendering: pixelated; filter: drop-shadow(2px 2px 0 rgba(0,0,0,.55)); }
.pk-counts { position: fixed; inset: 0; pointer-events: none; z-index: 28; }
.pk-counts div { position: fixed; left: 0; top: 0; font-family: Alagard, monospace; font-size: 16px; line-height: 16px; color: #2a1a0c; -webkit-font-smoothing: none; font-smooth: never; will-change: transform;
  text-shadow: 1px 0 0 #dcc796, -1px 0 0 #dcc796, 0 1px 0 #dcc796, 0 -1px 0 #dcc796; }
.pk-label .w { color: #c9b894; } .pk-label .k { color: #e2a35a; } .pk-label .r { color: #ff8a6a; }
`;
    document.head.appendChild(st);
    this.cursorEl = document.createElement('canvas');
    this.cursorEl.width = this.cursorEl.height = 16;
    this.cursorEl.className = 'pk-cursor';
    document.body.appendChild(this.cursorEl);
    this.counts_ = document.createElement('div');
    this.counts_.className = 'pk-counts';
    document.body.appendChild(this.counts_);
    this.label = document.createElement('div');
    this.label.className = 'pk-label';
    this.label.style.opacity = '0';
    document.body.appendChild(this.label);
    addEventListener('mousemove', (e) => { this.absMouse = { x: e.clientX, y: e.clientY }; });
    // if the game stops updating us (pause menu, a cutscene), the overlay goes away with it
    const watch = () => {
      if (performance.now() - this.lastDom > this.overlayTimeout) { this.cursorEl!.style.display = 'none'; this.label!.style.opacity = '0'; this.counts_!.style.display = 'none'; }
      else this.counts_!.style.display = '';
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }

  private setGlove(k: 'point' | 'open' | 'grab'): void {
    if (!this.cursorEl || this.gloveKind === k) return;
    this.gloveKind = k;
    const g = this.cursorEl.getContext('2d')!;
    g.clearRect(0, 0, 16, 16);
    g.drawImage(this.gloves[k], 0, 0);
  }

  private showLabel(html: string | null, x = 0, y = 0, icon?: string, flip = false): void {
    const L = this.label;
    if (!L) return;
    if (!html) { L.style.opacity = '0'; this.labelKey = ''; return; }
    const key = html + (icon ?? '') + flip;
    if (key !== this.labelKey) {
      this.labelKey = key;
      L.innerHTML = '';
      const d = document.createElement('div');
      d.innerHTML = html;
      d.style.textAlign = flip ? 'right' : 'left';
      if (icon && !flip) L.appendChild(itemIcon(icon));
      L.appendChild(d);
      if (icon && flip) L.appendChild(itemIcon(icon));
    }
    L.style.opacity = '1';
    L.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(${flip ? '-100%' : '0'}, -50%)`;
  }

  /** screen pixel position of a cell's centre (tests, tutorials) */
  cellScreen(cx: number, cy: number): { x: number; y: number } | null {
    this.rig.updateMatrixWorld(true);
    const v = this.toScreen(new THREE.Vector3(cellX(cx), 0, cellZ(cy)));
    return v ? { x: v.x, y: v.y } : null;
  }

  /** screen pixel position of a pack-local point */
  private toScreen(local: THREE.Vector3): THREE.Vector2 | null {
    const cam = this.viewCam();
    if (!cam) return null;
    const w = this.rig.localToWorld(local.clone()).project(cam);
    return new THREE.Vector2((w.x * 0.5 + 0.5) * innerWidth, (-w.y * 0.5 + 0.5) * innerHeight);
  }

  private updateDom(): void {
    if (!this.cursorEl) return;
    this.lastDom = performance.now();
    const vis = this.isOpen && this.t > 0.7 && this.controlled;
    this.cursorEl.style.display = vis ? 'block' : 'none';
    // counts printed on the paper tags (crisp DOM text tracking each tag)
    const seen = new Set<number>();
    if (this.isOpen && this.t > 0.85) for (const s of this.slots.values()) {
      if (!s.tag || !s.holder.visible || !s.lift.visible) continue;
      seen.add(s.uid);
      let el = this.countEls.get(s.uid);
      if (!el) { el = document.createElement('div'); this.counts_!.appendChild(el); this.countEls.set(s.uid, el); }
      const txt = s.tag.userData.text as string;
      if (el.textContent !== txt) el.textContent = txt;
      s.tag.updateMatrixWorld();
      const at = this.toScreen(this.rig.worldToLocal(s.tag.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0.0035, 0, 0)));
      if (at) el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -55%)`;
    }
    for (const [uid, el] of this.countEls) if (!seen.has(uid)) { el.remove(); this.countEls.delete(uid); }
    if (!vis) { this.showLabel(null); return; }
    const sx = (this.cursor.x * 0.5 + 0.5) * innerWidth, sy = (-this.cursor.y * 0.5 + 0.5) * innerHeight;
    const kind = this.drag ? 'grab' : this.hoverUid >= 0 || this.hoverScale ? 'open' : 'point';
    this.setGlove(kind);
    const hx = kind === 'point' ? 8 : 16, hy = kind === 'point' ? 2 : 14;
    this.cursorEl.style.transform = `translate(${Math.round(sx - hx)}px, ${Math.round(sy - hy)}px)`;
    // label
    const g = this.inv.grid;
    const uid = this.drag?.uid ?? this.hoverUid;
    const p = uid >= 0 ? g.byUid(uid) : null;
    if (p) {
      const def = ITEMS[p.id];
      const s = this.slots.get(p.uid)!;
      // float beside the board at the item's row, on the side it is nearer to, so it never covers the pack
      const leftSide = s.pos.x < -CELL * 0.5;
      const edge = this.toScreen(new THREE.Vector3(leftSide ? -AX - 0.012 : AX + 0.012, 0, s.pos.z));
      const kg = (def?.mass ?? 0) * p.n;
      const held = this.game?.hands?.heldItem === p.id;
      const lines = [`${esc(def?.name ?? p.id)}${p.n > 1 ? `  <span class="w">x${p.n}</span>` : ''}`,
        `<span class="w">${kg.toFixed(kg < 1 ? 2 : 1)} kg${held ? '  ·  in hand' : ''}</span>`];
      if (this.drag) {
        const gh = this.ghost;
        lines.push(gh ? `<span class="${gh.r === 'blocked' || gh.r === 'out' ? 'r' : 'k'}">${gh.r === 'ok' ? 'R  turn' : gh.r === 'merge' ? 'stack' : gh.r === 'swap' ? 'swap' : 'no room there'}</span>` : '<span class="k">let go to drop it</span>');
      } else lines.push(`<span class="k">${def?.food ? (def.food.drink ? 'RMB  drink' : 'RMB  eat') : held ? 'RMB  put back' : 'RMB  take'}     Q  drop</span>`);
      const html = lines.join('<br>');
      if (edge) this.showLabel(html, edge.x, edge.y, p.id, leftSide);
    } else if (this.hoverScale) {
      const at = this.toScreen(new THREE.Vector3(AX + 0.06, -0.05, -AZ * 0.8));
      const over = this.weight > RED_KG;
      const html = `Pack weight<br><span class="${over ? 'r' : 'w'}">${this.weight.toFixed(1)} kg${over ? '  ·  heavy going' : ` of ${RED_KG}`}</span><br><span class="w">${this.inv.grid.usedCells()} of ${COLS * ROWS} cells</span>`;
      if (at) this.showLabel(html, at.x, at.y);
    } else this.showLabel(null);
  }
}

function esc(s: string): string { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!); }
