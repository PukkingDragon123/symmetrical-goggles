// The story in the world: things you find and use. Ray's ammo can under the woodshed, his orange tape through
// the bush to the split rock, five trapline sets with their tin plates (the jaws wired shut), the abandoned
// Kettle camp on the north shore (cookhouse, bunkhouse, the gut hammer's empty post), his boot prints down to
// the dock, the gut hammer hanging at the end of it, and the ranger's trail camera on a spruce.
// Static geometry is written with the places kit (one mesh per material), props are Poly Haven conversions.
import * as THREE from 'three';
import type { Game } from '../game';
import { Mesher, Rand, log, logAB, board, boxAt, lathe, tube, placeMat, defineMat, hasMat, V } from '../../places/kit';
import { buildProduct } from '../../places/products';
import { flameCards } from '../../places/fixtures';
import { heightAt, WORLD } from '../../world/layout';
import { registerInteractable } from '../interact';
import { puffs } from '../../gfx/particles';
import { Noise } from '../../core/noise';
import { anchorPos } from '../flow';
import { CAMP, campXZ, SETS, TRAP_HEAD, SHORE, WOODYARD } from './sites';
import { solidBox, propIn, treesNear, clearTrees, tapeOn, lod } from './kit';
import { CAMP_SIGN } from './text';
import { dressKettle } from './kettle_dress';
import * as LP from '../../places/store/lowprops';
import { buildCampground } from '../../places/store/campground';
import { r5off } from '../../places/store/inst';

export interface StoryWorld {
  /** interact hooks: the arc fills these in */
  on: Record<string, (() => void) | undefined>;
  label: Record<string, (() => string) | undefined>;
  /** things whose look follows the story state */
  ammoCan: THREE.Object3D | null;
  plates: { root: THREE.Object3D; food: THREE.Object3D | null; pos: THREE.Vector3 }[];
  stove: { fire: THREE.Object3D; light: THREE.PointLight; pipeTop: THREE.Vector3; level: number };
  /** the lantern on the cookhouse table (lit for supper; Ray carries its light up from the dock) */
  lamp: { obj: THREE.Object3D; light: THREE.PointLight; level: number; home: THREE.Vector3 };
  hammerAtDock: THREE.Object3D;
  hammerOnPost: THREE.Object3D;
  table: THREE.Vector3;
  supper: THREE.Object3D | null;
  postTop: THREE.Vector3;
  doorOut: THREE.Vector3;
  rayChair: THREE.Vector3;
  rayFace: number;
  dockEnd: THREE.Vector3;
  pickups: Record<string, THREE.Object3D>;
}

const N = new Noise(4242);
let matsReady = false;
function ensureMats(): void {
  if (matsReady) return;
  matsReady = true;
  // weathered grey logs and boards for a camp seventy-five years abandoned; a mossy stone
  const tint = (from: string, name: string, color: number) => {
    if (hasMat(name)) return;
    const m = (placeMat(from) as THREE.MeshStandardMaterial).clone();
    m.color = new THREE.Color(color);
    defineMat(name, m);
  };
  tint('log_ext', 'log_old', 0xa89e90);
  tint('planks_grey', 'planks_old', 0xc4bab0);
  tint('stone', 'stone_moss', 0x9aa88a);
  tint('canvas', 'camo', 0x6a6a44);
}

/** an invisible box that takes the interaction ray (for things too thin or too fiddly to aim at) */
function hitBox(parent: THREE.Object3D, w: number, h: number, d: number, pos: THREE.Vector3): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.copy(pos);
  parent.add(m);
  return m;
}

/** the steel triangle the cook beat to call the men (and once, the others) */
export function gutHammerModel(): THREE.Group {
  ensureMats();
  const ms = new Mesher();
  const s = 0.48, k = 0.04;
  // three bars with rounded bends, open at the top-left corner where it hangs from
  const A = V(-s / 2, 0, 0), B = V(s / 2, 0, 0), C = V(0, s * 0.87, 0);
  const pts = [V(C.x - 0.03, C.y - 0.05, 0), C.clone().add(V(0.012, -0.02, 0)), C.clone().lerp(B, 0.5), B.clone().add(V(-k, k * 0.5, 0)), B.clone().add(V(-k * 1.6, 0, 0)), A.clone().lerp(B, 0.5), A.clone().add(V(k * 1.6, 0, 0)), A.clone().add(V(k * 0.6, k, 0)), A.clone().lerp(C, 0.82)];
  tube(ms, 'iron', pts, 0.011, 6);
  // the striker on its string
  ms.pushT(0.05, 0.05, 0.02, 0, 0, 0.2);
  lathe(ms, 'iron', [[0.0001, 0], [0.007, 0.002], [0.007, 0.26], [0.0001, 0.265]], 6);
  ms.pop();
  tube(ms, 'rope', [V(0, s * 0.87, 0), V(0.03, s * 0.6, 0.01), V(0.05, 0.25, 0.02)], 0.003, 4);
  const g = ms.build({ name: 'gut_hammer' });
  return g;
}

/** a small canvas texture: a tin lid with a number painted on it */
function lidTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a8a84'; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 70; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(120,60,30,0.5)' : 'rgba(180,180,170,0.4)'; g.fillRect(Math.random() * 32 | 0, Math.random() * 32 | 0, 2, 1); }
  g.fillStyle = '#1a1612'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 16, 17);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

/** a numbered tin lid nailed to a trunk, facing a point */
function lidOn(g: Game, tree: { x: number; z: number; r: number }, n: number, toward: THREE.Vector3): void {
  const a = Math.atan2(toward.x - tree.x, toward.z - tree.z);
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), new THREE.MeshStandardMaterial({ map: lidTexture(n), roughness: 0.5, metalness: 0.4 }));
  const rr = tree.r * 0.97 + 0.006;
  lid.position.set(tree.x + Math.sin(a) * rr, heightAt(tree.x, tree.z) + 1.3, tree.z + Math.cos(a) * rr);
  lid.rotation.set(0, a, (n * 0.37) % 0.4 - 0.2, 'YXZ');
  g.scene.add(lod(lid, 120, lid.position));
}

/** a deformed half-boulder with a flat broken face toward -X (two make the split rock) */
function halfBoulder(ms: Mesher, seed: number, r: number): void {
  const geo = new THREE.IcosahedronGeometry(r, 3);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.16 * N.n2(x * 2.1 + seed, z * 2.1 + y) + 0.07 * N.n2(x * 6 + seed * 3, y * 6);
    x *= n; y *= n * 0.72; z *= n;
    if (x < 0) x = -0.02 * N.n2(y * 9, z * 9 + seed); // the split face
    if (y < -r * 0.25) y = -r * 0.25; // sunk into the ground
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  ms.geom('stone_moss', geo, undefined, 1.4);
  geo.dispose();
}

// ---------------------------------------------------------------------------------------------- build it all
export function buildStoryWorld(g: Game): StoryWorld {
  ensureMats();
  const W: StoryWorld = {
    on: {}, label: {}, ammoCan: null, plates: [], pickups: {},
    stove: { fire: new THREE.Group(), light: new THREE.PointLight(0xff8a3a, 0, 11, 1.6), pipeTop: new THREE.Vector3(), level: 0 },
    lamp: { obj: new THREE.Group(), light: new THREE.PointLight(0xffb060, 0, 9, 1.5), level: 0, home: new THREE.Vector3() },
    hammerAtDock: new THREE.Group(), hammerOnPost: new THREE.Group(), table: new THREE.Vector3(), supper: null,
    postTop: new THREE.Vector3(), doorOut: new THREE.Vector3(), rayChair: new THREE.Vector3(), rayFace: 0, dockEnd: new THREE.Vector3(),
  };
  const act = (name: string, label: string | (() => string)) => ({
    label: () => W.label[name]?.() ?? (typeof label === 'string' ? label : label()),
    use: () => W.on[name]?.(),
  });

  // ---- 1. Ray's ammo can, under the bottom row of the woodshed stack
  {
    const stack = anchorPos(g, 'woodshed_stack', new THREE.Vector3(WOODYARD.x + 1.5, heightAt(WOODYARD.x + 1.5, WOODYARD.z), WOODYARD.z));
    const block = anchorPos(g, 'chopping_block', new THREE.Vector3(WOODYARD.x, heightAt(WOODYARD.x, WOODYARD.z), WOODYARD.z));
    const dir = block.clone().sub(stack).setY(0).normalize();
    const at = stack.clone().addScaledVector(dir, 0.75);
    at.y = heightAt(at.x, at.z);
    propIn(g.scene, 'ammo_box', at.x, at.y, at.z, Math.atan2(dir.x, dir.z) + 1.4, 1.15).then((o) => {
      if (!o) return;
      W.ammoCan = o;
      registerInteractable(o, { kind: 'container', reach: 2.4, ...act('ammo', 'Ray\'s ammo can') });
    });
  }

  // ---- 2. the split rock where the line starts, Ray's coffee can wedged in the crack, and the tape to it
  {
    const ms = new Mesher();
    const h = TRAP_HEAD;
    ms.pushT(h.x - 0.22, heightAt(h.x - 0.22, h.z) - 0.1, h.z, 0.4); ms.pushT(0, 0, 0, Math.PI); halfBoulder(ms, 3, 1.05); ms.pop(); ms.pop();
    ms.pushT(h.x + 0.22, heightAt(h.x + 0.22, h.z) - 0.1, h.z, 0.4); halfBoulder(ms, 7, 0.95); ms.pop();
    g.scene.add(lod(ms.build({ name: 'split_rock' }), 220, h));
    solidBox(new THREE.Vector3(h.x, h.y + 0.25, h.z), [1.2, 0.5, 0.9], 0.4);
    const can = buildProduct('coffee');
    can.position.set(h.x + Math.cos(0.4) * 0.02, h.y + 0.62, h.z - Math.sin(0.4) * 0.02);
    can.rotation.set(0.3, 0.4, 1.2);
    g.scene.add(lod(can, 120, h));
    W.pickups.coffeeCan = can;
    registerInteractable(can, { kind: 'container', reach: 2.4, ...act('can2', 'A coffee can, wedged in the crack') });
    // the tape from the woodshed to here, every dozen metres on the nearest trunk
    (g.forest as unknown as { prewarm?(x: number, z: number, r: number): void } | null)?.prewarm?.(h.x, h.z, 50);
    const from = WOODYARD.clone(), to = h.clone();
    const L = Math.hypot(to.x - from.x, to.z - from.z);
    let i = 0;
    for (let d = 18; d < L - 4; d += 11) {
      const x = from.x + ((to.x - from.x) / L) * d, z = from.z + ((to.z - from.z) / L) * d;
      const t = treesNear(g, x, z, 7)[0];
      if (t) tapeOn(g, t, ++i);
    }
    const tt = treesNear(g, h.x, h.z, 8)[0];
    if (tt) tapeOn(g, tt, 9);
  }

  // ---- 3. the trapline: five sets
  const forest = g.forest as unknown as { prewarm?(x: number, z: number, r: number): void } | null;
  SETS.forEach((p, i) => {
    const prev = i ? SETS[i - 1] : TRAP_HEAD;
    // Ray set his cubbies against a good trunk: take the nearest real tree to where the map says (and move the
    // set there), so the tape and the tin lid are on a tree that exists
    forest?.prewarm?.(p.x, p.z, 40);
    const near = treesNear(g, p.x, p.z, 26).filter((t) => t.r > 0.13 && t.r < 0.6 && heightAt(t.x, t.z) > WORLD.waterY + 0.8);
    const tree = near[0] ?? { x: p.x + 0.8, z: p.z, r: 0.18, id: -1, h: 10 };
    const a = Math.atan2(prev.x - tree.x, prev.z - tree.z); // the cubby opens toward where you came from
    const root = new THREE.Group();
    const base = new THREE.Vector3(tree.x + Math.sin(a) * (tree.r + 0.35), 0, tree.z + Math.cos(a) * (tree.r + 0.35));
    base.y = heightAt(base.x, base.z);
    root.position.copy(base); root.rotation.y = a;
    g.scene.add(root);
    lod(root, 140, base);
    p.copy(base);
    // the cubby: sticks leaned against the trunk in a little lean-to
    const ms = new Mesher(), r = new Rand(100 + i);
    for (let k = 0; k < 9; k++) {
      const sx = -0.32 + k * 0.08 + r.range(-0.02, 0.02);
      logAB(ms, V(sx * 1.15, -0.05, 0.3 + r.range(-0.04, 0.04)), V(sx * 0.6, 0.62 + r.range(-0.06, 0.06), -0.3), 0.018 + r.range(0, 0.008), { seg: 5, seed: 300 + i * 10 + k, capA: -1, capB: 1, matFor: () => 'bark_dark' });
    }
    // a rusty trap beside it, jaws wired shut, chain staked
    ms.pushT(0.46, 0.02, 0.22, r.range(0, 3));
    ms.push(new THREE.Matrix4().makeScale(1.8, 1.8, 1.8));
    tube(ms, 'rusty_red', [V(-0.07, 0, 0), V(-0.05, 0.035, 0), V(0, 0.05, 0), V(0.05, 0.035, 0), V(0.07, 0, 0)], 0.006, 5);
    tube(ms, 'rusty_red', [V(-0.07, 0, 0.01), V(-0.05, 0.03, 0.012), V(0, 0.045, 0.012), V(0.05, 0.03, 0.012), V(0.07, 0, 0.01)], 0.006, 5);
    tube(ms, 'rusty_red', [V(0.07, 0, 0), V(0.16, 0.005, 0.02), V(0.2, 0.004, -0.03)], 0.005, 4);
    tube(ms, 'galv', [V(0, 0.06, -0.01), V(0.004, 0.05, 0.025), V(0, 0.04, 0.012)], 0.0025, 4);
    ms.pop(); ms.pop();
    root.add(ms.build({ name: `set${i + 1}` }));
    // the plate
    const plate = buildProduct('enamel_plate');
    plate.position.set(-0.05, 0.02, 0.42);
    root.add(plate);
    const plateHit = hitBox(root, 0.36, 0.14, 0.36, V(-0.05, 0.07, 0.42));
    registerInteractable(plateHit, { kind: 'custom', reach: 2.3, ...act(`plate${i}`, 'Ray\'s plate') });
    W.plates.push({ root, food: null, pos: root.localToWorld(V(-0.05, 0.05, 0.42)) });
    if (near[0]) { tapeOn(g, tree, 20 + i); lidOn(g, tree, i + 1, prev); }
  });

  // ---- 4. the old camp
  buildCamp(g, W, act);
  // ---- the lakeside campground round Doug's fire (the tales are told there): tents, the table, the woodbox
  if (!r5off()) try { g.addPlace(buildCampground()); } catch (e) { console.warn('[story] campground dressing failed', e); }

  // ---- 5. Ray's dock below the camp, and the gut hammer hanging at the end of it
  {
    const e = SHORE.edge, dir = SHORE.dir, s = Math.sin(dir), c = Math.cos(dir);
    (g.forest as unknown as { prewarm?(x: number, z: number, r: number): void } | null)?.prewarm?.(e.x, e.z, 30);
    clearTrees(g, e.x - s * 3, e.z - c * 3, 5);
    const deckY = WORLD.waterY + 0.55;
    const grp = new THREE.Group();
    grp.position.set(e.x, 0, e.z); grp.rotation.y = dir;
    g.scene.add(lod(grp, 260, e));
    const ms = new Mesher(), r = new Rand(55);
    const len = 8, w = 1.3;
    for (const sx of [-w / 2 + 0.1, w / 2 - 0.1]) for (const z of [-1.5, 1.5, 4.2, 7]) {
      const gy = Math.min(heightAt(e.x + s * z + c * sx, e.z + c * z - s * sx), WORLD.waterY) - 0.6;
      logAB(ms, V(sx, gy, z), V(sx, deckY - 0.02 + (z === 7 ? 1.5 : 0), z), 0.08, { seed: 70 + z * 3, matFor: () => 'log_old', capB: 1 });
    }
    for (const sx of [-w / 2 + 0.1, w / 2 - 0.1]) logAB(ms, V(sx, deckY - 0.1, -1.8), V(sx, deckY - 0.1, len), 0.07, { seed: 90, matFor: () => 'log_old' });
    for (let z = -1.7; z < len; z += 0.24) {
      if (r.next() < 0.05) continue; // a missing plank
      board(ms, 'planks_old', r, 0, deckY, z, w + r.range(-0.05, 0.08), 0.04, 0.2, r.range(-0.03, 0.03), { grain: 'x' });
    }
    // the hook post at the end
    tube(ms, 'iron', [V(w / 2 - 0.1, deckY + 1.42, 7), V(w / 2 + 0.02, deckY + 1.42, 7), V(w / 2 + 0.07, deckY + 1.37, 7)], 0.007, 4);
    grp.add(ms.build({ name: 'dock' }));
    const mid = new THREE.Vector3(e.x + s * (len / 2 - 1), deckY - 0.02, e.z + c * (len / 2 - 1));
    solidBox(mid, [w / 2, 0.04, len / 2 + 0.8], dir);
    W.dockEnd.set(e.x + s * 6.6, deckY, e.z + c * 6.6);
    const hm = gutHammerModel();
    hm.position.set(w / 2 + 0.07, deckY + 1.37 - 0.42, 7);
    hm.rotation.y = 0.3; // face the shore: you see it from the bank
    grp.add(hm);
    W.hammerAtDock = hm;
    const hit = hitBox(grp, 0.6, 0.7, 0.5, V(w / 2 + 0.05, deckY + 1.15, 7));
    registerInteractable(hit, { kind: 'pickup', reach: 2.6, ...act('dockHammer', 'A steel triangle on a hook') });
  }
  return W;
}

// ---------------------------------------------------------------------------------------------- the camp
function buildCamp(g: Game, W: StoryWorld, act: (n: string, l: string | (() => string)) => { label: () => string; use: () => void }): void {
  const C = CAMP.pos, yaw = CAMP.yaw;
  (g.forest as unknown as { prewarm?(x: number, z: number, r: number): void } | null)?.prewarm?.(C.x, C.z, 60);
  clearTrees(g, C.x, C.z, 19);
  const grp = new THREE.Group();
  grp.position.set(C.x, 0, C.z); grp.rotation.y = yaw;
  g.scene.add(lod(grp, 240, C));
  grp.updateMatrixWorld(true);
  const hAt = (lx: number, lz: number) => { const [x, z] = campXZ(lx, lz); return heightAt(x, z); };
  const toW = (lx: number, ly: number, lz: number) => { const [x, z] = campXZ(lx, lz); return new THREE.Vector3(x, ly, z); };
  const ms = new Mesher(), rnd = new Rand(1923);
  const LR = 0.15, CS = 0.27;

  /** a log wall along local X (or Z) of `courses` courses, with an optional door gap, sunk to the lowest ground */
  const wall = (cx: number, cz: number, len: number, alongX: boolean, courses: number, base: number, o: { gap?: [number, number]; gapTo?: number; off?: number; crumble?: number } = {}) => {
    for (let k = 0; k < courses; k++) {
      const y = base + LR + k * CS + (o.off ?? 0);
      // crumbling: the top courses get shorter toward one end
      const cut = o.crumble && k >= courses - 2 ? rnd.range(0.25, 0.6) * len * (k - courses + 3) / 2 : 0;
      const segs: [number, number][] = [];
      const a0 = -len / 2 - 0.25, a1 = len / 2 + 0.25 - cut;
      if (o.gap && k < (o.gapTo ?? courses)) { segs.push([a0, o.gap[0]], [o.gap[1], a1]); } else segs.push([a0, a1]);
      for (const [s0, s1] of segs) {
        if (s1 - s0 < 0.3) continue;
        const A = alongX ? V(cx + s0, y, cz) : V(cx, y, cz + s0), B = alongX ? V(cx + s1, y, cz) : V(cx, y, cz + s1);
        logAB(ms, A, B, LR * rnd.range(0.9, 1.08), { seed: rnd.int(1, 9999), matFor: () => 'log_old', capA: rnd.int(0, 3), capB: rnd.int(0, 3), bend: 0.006, lump: 0.05 });
      }
    }
    // a collider for what stands
    const hh = (courses * CS) / 2;
    if (courses > 0) {
      const mid = toW(cx, base + hh + 0.05, cz);
      solidBox(mid, alongX ? [len / 2 + 0.1, hh, LR] : [LR, hh, len / 2 + 0.1], yaw);
    }
  };

  // ---- cookhouse
  const ck = { x: -5, z: -2.2, w: 7.6, d: 5.2 };
  const ckBase = Math.min(hAt(ck.x - ck.w / 2, ck.z - ck.d / 2), hAt(ck.x + ck.w / 2, ck.z - ck.d / 2), hAt(ck.x - ck.w / 2, ck.z + ck.d / 2), hAt(ck.x + ck.w / 2, ck.z + ck.d / 2)) - 0.08;
  wall(ck.x, ck.z - ck.d / 2, ck.w, true, 7, ckBase);
  wall(ck.x, ck.z + ck.d / 2, ck.w, true, 6, ckBase, { gap: [0.9, 2.0], gapTo: 5 });
  wall(ck.x - ck.w / 2, ck.z, ck.d, false, 7, ckBase, { off: CS / 2 });
  wall(ck.x + ck.w / 2, ck.z, ck.d, false, 3, ckBase, { off: CS / 2, crumble: 1 });
  // the logs that fell out of the east wall
  for (let k = 0; k < 3; k++) {
    const x0 = ck.x + ck.w / 2 + 0.5 + k * 0.35, z0 = ck.z - 1.6 + k * 1.1;
    logAB(ms, V(x0, hAt(x0, z0) + LR * 0.8, z0), V(x0 + rnd.range(0.4, 1.2), hAt(x0 + 0.8, z0 + 2.2) + LR * 0.8, z0 + rnd.range(2, 2.8)), LR, { seed: 600 + k, matFor: () => 'log_old', capA: 1, capB: 2 });
  }
  // roof: a ridge pole, rafters, and the back slope still half boarded, sagging
  const top = ckBase + LR + 7 * CS;
  logAB(ms, V(ck.x - ck.w / 2 - 0.3, top + 0.9, ck.z - 0.2), V(ck.x + ck.w / 2 - 1.4, top + 0.62, ck.z - 0.1), 0.11, { seed: 700, matFor: () => 'log_old' });
  for (let k = 0; k < 6; k++) {
    const x = ck.x - ck.w / 2 + 0.3 + k * 1.3;
    if (x > ck.x + ck.w / 2 - 1.2) break;
    logAB(ms, V(x, top + 0.05, ck.z - ck.d / 2 - 0.35), V(x, top + 0.86 - k * 0.03, ck.z - 0.2), 0.07, { seed: 710 + k, matFor: () => 'log_old' });
    if (k % 2 === 0) logAB(ms, V(x, top + 0.86, ck.z - 0.2), V(x + 0.1, top - 0.1 - k * 0.1, ck.z + ck.d / 2 + 0.2), 0.065, { seed: 720 + k, matFor: () => 'log_old' });
  }
  for (let x = ck.x - ck.w / 2 - 0.2; x < ck.x + 0.9; x += 0.3) {
    if (rnd.next() < 0.12) continue;
    const sag = x > ck.x - 0.6 ? (x - ck.x + 0.6) * 0.35 : 0;
    ms.pushT(x, top + 0.48 - sag * 0.5, ck.z - ck.d / 4 - 0.25, 0, Math.atan2(0.82, ck.d / 2 + 0.15), rnd.range(-0.03, 0.03));
    boxAt(ms, 'planks_old', 0, 0, 0, 0.28, 0.025, ck.d / 2 + 0.6, 0, { grain: 'z', uv: [rnd.range(0, 3), rnd.range(0, 3)] });
    ms.pop();
  }
  // a stovepipe through the roof
  const stoveL = { x: ck.x - ck.w / 2 + 0.9, z: ck.z - ck.d / 2 + 0.75 };
  tube(ms, 'soot', [V(stoveL.x, ckBase + 0.85, stoveL.z), V(stoveL.x, top + 0.2, stoveL.z), V(stoveL.x + 0.02, top + 1.25, stoveL.z + 0.03)], 0.075, 10, { smooth: false });
  W.stove.pipeTop.copy(toW(stoveL.x + 0.02, top + 1.3, stoveL.z + 0.03));
  // the long table and two benches (plank tops on round legs)
  const tz = ck.z + 0.35, tx = ck.x + 0.4, tl = 4.2;
  const ty = ckBase + 0.78;
  for (let k = 0; k < 3; k++) board(ms, 'planks_old', rnd, tx, ty, tz - 0.26 + k * 0.26, tl, 0.045, 0.25, 0, { grain: 'x' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) logAB(ms, V(tx + sx * (tl / 2 - 0.3), ckBase - 0.05, tz + sz * 0.3), V(tx + sx * (tl / 2 - 0.3), ty - 0.02, tz + sz * 0.3), 0.05, { seed: 800 + sx * 3 + sz, matFor: () => 'log_old', capA: -1 });
  for (const bz of [tz - 0.72, tz + 0.72]) {
    board(ms, 'planks_old', rnd, tx, ckBase + 0.45, bz, tl - 0.2, 0.05, 0.28, 0, { grain: 'x' });
    for (const sx of [-1, 1]) logAB(ms, V(tx + sx * (tl / 2 - 0.4), ckBase - 0.05, bz), V(tx + sx * (tl / 2 - 0.4), ckBase + 0.43, bz), 0.045, { seed: 820 + sx + bz, matFor: () => 'log_old', capA: -1 });
  }
  solidBox(toW(tx, ckBase + 0.4, tz), [tl / 2, 0.4, 0.42], yaw);
  W.table.copy(toW(tx - 0.6, ty + 0.03, tz));
  // feet under the bench: the sit pose's hips are 0.47 m above the root
  W.rayChair.copy(toW(tx + tl / 2 - 0.5, ckBase + 0.475 - 0.47, tz + 0.72));
  W.rayFace = yaw + Math.PI; // facing across the table (-Z local)
  const tableHit = new THREE.Mesh(new THREE.BoxGeometry(tl, 0.12, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  tableHit.position.set(tx, ty + 0.05, tz); grp.add(tableHit);
  registerInteractable(tableHit, { kind: 'custom', reach: 2.6, ...act('table', 'The cookhouse table') });
  // Ray's corner: a bedroll, a lantern, a stack of splits by the stove
  const bed = { x: ck.x + ck.w / 2 - 0.8, z: ck.z - ck.d / 2 + 0.7 };
  ms.pushT(bed.x - 0.55, ckBase + 0.16, bed.z, 0.1);
  log(ms, 1.1, 0.15, { seed: 31, matFor: () => 'blanket', capMat: 'wool_grey', taper: 0, lump: 0.08 });
  ms.pop();
  boxAt(ms, 'canvas', bed.x - 0.1, ckBase + 0.02, bed.z + 0.75, 1.9, 0.04, 0.75, 0.1);
  grp.add(ms.build({ name: 'camp' }));
  for (let k = 0; k < 7; k++) {
    const sp = buildProduct('split');
    sp.position.set(stoveL.x + 0.75 + (k % 4) * 0.13, ckBase + 0.06 + Math.floor(k / 4) * 0.12, stoveL.z - 0.1);
    sp.rotation.set(0, Math.PI / 2, Math.PI / 2 + (k % 2) * 0.2);
    grp.add(sp);
  }
  // props: the barrel stove (Délima's), a coffee pot on it, pots and bowls, Ray's lantern, the bunkhouse junk
  const pending: Promise<unknown>[] = [];
  pending.push(propIn(grp, 'barrel_stove', stoveL.x, ckBase + 0.02, stoveL.z, Math.PI / 2));
  solidBox(toW(stoveL.x, ckBase + 0.45, stoveL.z), [0.32, 0.45, 0.32], yaw);
  const pot = buildProduct('coffeepot'); pot.position.set(stoveL.x + 0.08, ckBase + 0.88, stoveL.z + 0.05); grp.add(pot);
  pending.push(propIn(grp, 'pot_enamel_01', tx + 1.2, ty + 0.03, tz - 0.1, 0.4));
  pending.push(propIn(grp, 'wooden_bowl_01', tx - 0.2, ty + 0.03, tz + 0.15, 0));
  pending.push(propIn(grp, 'wooden_spoon', tx + 0.1, ty + 0.035, tz - 0.2, 1.1));
  pending.push(propIn(grp, 'wooden_lantern_01', tx + tl / 2 - 0.35, ty + 0.03, tz - 0.15, 0.3).then((o) => { if (o) W.lamp.obj = o; }));
  W.lamp.home.copy(toW(tx + tl / 2 - 0.35, ty + 0.45, tz - 0.15));
  W.lamp.light.position.copy(W.lamp.home);
  g.scene.add(W.lamp.light);
  pending.push(propIn(grp, 'wooden_bucket_01', ck.x - ck.w / 2 + 0.5, ckBase, ck.z + ck.d / 2 - 0.6, 0.2));
  pending.push(propIn(grp, 'jug_01', stoveL.x + 1.4, ckBase, stoveL.z + 0.05, 2));
  // the stove's fire (lit by the story) and its light
  const fire = flameCards(0.22, 0.26, 23);
  fire.position.copy(toW(stoveL.x + 0.32, ckBase + 0.36, stoveL.z));
  g.scene.add(lod(fire, 240, C));
  W.stove.fire = fire;
  W.stove.light.position.copy(toW(stoveL.x + 0.6, ckBase + 0.7, stoveL.z + 0.4));
  g.scene.add(W.stove.light);
  const stoveHit = hitBox(grp, 0.7, 0.9, 0.7, V(stoveL.x, ckBase + 0.45, stoveL.z));
  registerInteractable(stoveHit, { kind: 'stove', reach: 2.4, ...act('stove', 'Délima\'s barrel stove') });
  // the ledger: an old book open on the table
  const ledger = buildProduct('book_stack');
  ledger.position.set(tx - 1.3, ty + 0.03, tz + 0.05); ledger.rotation.y = 0.3;
  grp.add(ledger);
  registerInteractable(ledger, { kind: 'paper', reach: 2.4, ...act('ledger', 'A cook\'s ledger') });
  // Ray's page, under the lantern by the bedroll
  W.pickups.bedroll = hitBox(grp, 1.3, 0.4, 0.9, V(bed.x - 0.1, ckBase + 0.2, bed.z + 0.3));
  registerInteractable(W.pickups.bedroll, { kind: 'custom', reach: 2.4, ...act('bedroll', 'Somebody\'s bedroll') });

  // ---- the gut hammer's post outside the cookhouse door
  {
    const px = ck.x + 1.45 + 1.0, pz = ck.z + ck.d / 2 + 1.3;
    const ms2 = new Mesher();
    const b = hAt(px, pz) - 0.3;
    logAB(ms2, V(px, b, pz), V(px, b + 2.6, pz), 0.09, { seed: 901, matFor: () => 'log_old', capB: 2 });
    logAB(ms2, V(px - 0.05, b + 2.35, pz), V(px - 0.75, b + 2.32, pz), 0.05, { seed: 902, matFor: () => 'log_old', capB: 1 });
    tube(ms2, 'iron', [V(px - 0.66, b + 2.3, pz), V(px - 0.66, b + 2.22, pz), V(px - 0.62, b + 2.2, pz)], 0.006, 4);
    grp.add(ms2.build({ name: 'gut_post' }));
    solidBox(toW(px, b + 1.3, pz), [0.1, 1.3, 0.1], yaw);
    const hm = gutHammerModel();
    hm.position.set(px - 0.62, b + 2.2 - 0.42, pz); hm.visible = false;
    grp.add(hm);
    W.hammerOnPost = hm;
    W.postTop.copy(toW(px - 0.66, b + 2.0, pz));
    W.doorOut.copy(toW(ck.x + 1.45, hAt(ck.x + 1.45, ck.z + ck.d / 2 + 0.7), ck.z + ck.d / 2 + 0.7));
    const hit = hitBox(grp, 0.9, 2.4, 0.5, V(px - 0.3, b + 1.3, pz));
    registerInteractable(hit, { kind: 'custom', reach: 2.6, ...act('post', 'An empty iron hook on a post') });
  }

  // ---- bunkhouse: low crumbled walls, no roof, two iron bed frames, the 1951 notice on the back wall
  {
    const bk = { x: 6, z: -3.6, w: 10, d: 6 };
    const bb = Math.min(hAt(bk.x - bk.w / 2, bk.z), hAt(bk.x + bk.w / 2, bk.z), hAt(bk.x, bk.z - bk.d / 2), hAt(bk.x, bk.z + bk.d / 2)) - 0.08;
    const ms3 = new Mesher();
    const m0 = ms;
    void m0;
    // reuse the wall writer on a second mesher
    const wallB = (cx: number, cz: number, len: number, alongX: boolean, courses: number, o: { gap?: [number, number]; off?: number } = {}) => {
      for (let k = 0; k < courses; k++) {
        const y = bb + LR + k * CS + (o.off ?? 0);
        const cut = k === courses - 1 ? rnd.range(0.2, 0.5) * len : 0;
        const segs: [number, number][] = o.gap && k < 4 ? [[-len / 2 - 0.25, o.gap[0]], [o.gap[1], len / 2 + 0.25 - cut]] : [[-len / 2 - 0.25 + cut * 0.3, len / 2 + 0.25 - cut * 0.7]];
        for (const [s0, s1] of segs) {
          if (s1 - s0 < 0.3) continue;
          logAB(ms3, alongX ? V(cx + s0, y, cz) : V(cx, y, cz + s0), alongX ? V(cx + s1, y, cz) : V(cx, y, cz + s1), LR * rnd.range(0.9, 1.08), { seed: rnd.int(1, 9999), matFor: () => 'log_old', capA: rnd.int(0, 3), capB: rnd.int(0, 3), lump: 0.05 });
        }
      }
      const hh = (courses * CS) / 2;
      solidBox(toW(cx, bb + hh + 0.05, cz), alongX ? [len / 2, hh, LR] : [LR, hh, len / 2], yaw);
    };
    wallB(bk.x, bk.z - bk.d / 2, bk.w, true, 4);
    wallB(bk.x, bk.z + bk.d / 2, bk.w, true, 3, { gap: [-1.6, -0.5] });
    wallB(bk.x - bk.w / 2, bk.z, bk.d, false, 3, { off: CS / 2 });
    wallB(bk.x + bk.w / 2, bk.z, bk.d, false, 2, { off: CS / 2 });
    // fallen rafters inside
    logAB(ms3, V(bk.x - 3, bb + 0.1, bk.z - 2), V(bk.x + 1.2, bb + 0.9, bk.z + 1.1), 0.07, { seed: 950, matFor: () => 'log_old' });
    logAB(ms3, V(bk.x + 1.5, bb + 0.08, bk.z - 2.5), V(bk.x + 3.8, bb + 0.1, bk.z + 2.2), 0.07, { seed: 951, matFor: () => 'log_old' });
    grp.add(ms3.build({ name: 'bunkhouse' }));
    // low-poly stand-ins (lowprops.ts) for the heavy conversions: bed frames, the bin, the army crate
    const lp = new Mesher();
    LP.bedFrame(lp, bk.x - 3, bb, bk.z - 1.6, 0.05);
    lp.pushT(bk.x + 2.4, bb, bk.z - 1.7, -0.12, 0, 0.06); LP.bedFrame(lp, 0, 0, 0, 0); lp.pop();
    LP.trashCan(lp, bk.x + 4.2, bb, bk.z + 2.1, 0.6);
    LP.armyCrate(lp, bk.x - 0.4, bb, bk.z + 1.9, 0.3, 7);
    pending.push(propIn(grp, 'picke_dirty_01', bk.x - bk.w / 2 + 0.35, bb, bk.z + 1.5, 1.2, 1, [0.25, 0]));
    pending.push(propIn(grp, 'rusted_spade_01', bk.x + bk.w / 2 - 0.3, bb, bk.z - 1, -0.6, 1, [0.3, 0]));
    for (let k = 0; k < 6; k++) { lp.pushT(bk.x - 2 + rnd.range(-2, 3), bb + (k % 2 ? 0.05 : 0.01), bk.z + rnd.range(-2, 2), rnd.range(0, 6), k % 2 ? Math.PI / 2 : 0); LP.rustyCan(lp, 0, 0, 0, 0); lp.pop(); }
    grp.add(lp.build({ name: 'kettle_lowprops' }));
    solidBox(toW(bk.x - 3, bb + 0.3, bk.z - 1.6), [0.45, 0.3, 1.0], yaw + Math.PI / 2);
    solidBox(toW(bk.x + 2.4, bb + 0.3, bk.z - 1.7), [0.45, 0.3, 1.0], yaw + Math.PI / 2);
    // the notice, nailed inside the back wall
    const noticeAt = V(bk.x + 0.6, bb + LR + 3 * CS - 0.05, bk.z - bk.d / 2 + LR + 0.01);
    W.pickups.notice = hitBox(grp, 0.4, 0.5, 0.12, noticeAt);
    registerInteractable(W.pickups.notice, { kind: 'paper', reach: 2.4, ...act('notice', 'A notice nailed to the wall') });
    W.pickups.noticeAt = new THREE.Object3D(); W.pickups.noticeAt.position.copy(noticeAt); grp.add(W.pickups.noticeAt);
    // Hollis's tobacco tin, in the corner under a fallen rafter
    pending.push(propIn(grp, 'cleaner_tin_01', bk.x - bk.w / 2 + 0.55, bb + 0.02, bk.z - bk.d / 2 + 0.55, 0.7).then((o) => {
      if (!o) return;
      o.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh) { mm.material = (mm.material as THREE.MeshStandardMaterial).clone(); (mm.material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(0.55, 0.7, 1.2)); } });
      W.pickups.tin = o;
      registerInteractable(o, { kind: 'pickup', reach: 2.2, ...act('tin', 'A tobacco tin, blue lid') });
    }));
  }

  // ---- the fire pit between the buildings, the camp sign on the trail in
  pending.push(propIn(grp, 'stone_fire_pit', 0.5, hAt(0.5, 3.6), 3.6, 0.3));
  {
    const toward = SETS[4];
    const sx = C.x + (toward.x - C.x) * 0.62, sz = C.z + (toward.z - C.z) * 0.62;
    const face = Math.atan2(toward.x - sx, toward.z - sz);
    const sg = new THREE.Group(); sg.position.set(sx, heightAt(sx, sz), sz); sg.rotation.y = face; g.scene.add(lod(sg, 200, sg.position));
    const ms4 = new Mesher(), r4 = new Rand(4);
    for (const px of [-0.85, 0.85]) logAB(ms4, V(px, -0.4, 0), V(px, 1.75, 0), 0.07, { seed: 40 + px * 10, matFor: () => 'log_old', capB: 1 });
    board(ms4, 'planks_old', r4, 0, 1.38, 0.08, 2.0, 0.42, 0.05, 0, { grain: 'x' });
    sg.add(ms4.build({ name: 'camp_sign' }));
    // the carved letters, painted on a canvas laid on the board
    const c = document.createElement('canvas'); c.width = 256; c.height = 54;
    const gg = c.getContext('2d')!;
    gg.clearRect(0, 0, 256, 54);
    // carved letters show the paler wood under the weathered face
    gg.fillStyle = 'rgba(222,204,168,0.95)'; gg.textAlign = 'center';
    gg.font = 'bold 26px Alagard, serif'; gg.fillText(CAMP_SIGN[0], 128, 26);
    gg.font = '14px Alagard, serif'; gg.fillText(`${CAMP_SIGN[1]}  ·  ${CAMP_SIGN[2]}`, 128, 46);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const letters = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.4), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false }));
    letters.position.set(0, 1.38, 0.108);
    sg.add(letters);
    solidBox(new THREE.Vector3(sx, heightAt(sx, sz) + 0.8, sz), [1.0, 0.8, 0.1], face);
  }

  // ---- Ray's boot prints from the cookhouse door down to the dock
  {
    const from = W.doorOut, to = SHORE.edge;
    const L = Math.hypot(to.x - from.x, to.z - from.z);
    const n = Math.floor(L / 0.36);
    const geo = new THREE.CircleGeometry(0.055, 10); geo.scale(1, 1.9, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), dir = Math.atan2(to.x - from.x, to.z - from.z);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, side = i % 2 ? 0.13 : -0.13;
      const wob = Math.sin(t * 9.3) * 0.6;
      const x = from.x + (to.x - from.x) * t + Math.cos(dir) * (side + wob), z = from.z + (to.z - from.z) * t - Math.sin(dir) * (side + wob);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dir + Math.sin(t * 9.3 + 1.2) * 0.25);
      m4.compose(new THREE.Vector3(x, heightAt(x, z) + 0.02, z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4);
    }
    im.frustumCulled = false;
    im.receiveShadow = true;
    g.scene.add(lod(im, 120, SHORE.edge.clone().lerp(from, 0.5)));
  }

  // ---- the ranger's trail camera, strapped to a spruce a little way off the camp
  {
    const [wx, wz] = campXZ(9, 9);
    const t = treesNear(g, wx, wz, 14)[0];
    if (t) {
      const a = Math.atan2(C.x - t.x, C.z - t.z);
      const cg = new THREE.Group();
      cg.position.set(t.x + Math.sin(a) * (t.r + 0.05), heightAt(t.x, t.z) + 1.25, t.z + Math.cos(a) * (t.r + 0.05));
      cg.rotation.y = a;
      g.scene.add(lod(cg, 120, cg.position));
      const ms5 = new Mesher();
      boxAt(ms5, 'camo', 0, 0, 0, 0.11, 0.15, 0.07);
      ms5.pushT(0, 0.03, 0.036, 0, Math.PI / 2); lathe(ms5, 'iron', [[0.0001, 0], [0.018, 0], [0.018, 0.01], [0.012, 0.012], [0.0001, 0.013]], 10); ms5.pop();
      boxAt(ms5, 'iron', 0, -0.045, 0.036, 0.05, 0.02, 0.004);
      tube(ms5, 'camo', [V(-0.055, 0.02, -0.02), V(-t.r * 0.9, 0.02, -t.r - 0.03), V(0, 0.02, -2 * t.r - 0.06), V(t.r * 0.9, 0.02, -t.r - 0.03), V(0.055, 0.02, -0.02)], 0.008, 4, { smooth: true });
      cg.add(ms5.build({ name: 'trail_cam' }));
      const hit = hitBox(cg, 0.2, 0.25, 0.15, V(0, 0, 0));
      W.pickups.trailcam = cg;
      registerInteractable(hit, { kind: 'pickup', reach: 2.4, ...act('trailcam', 'A trail camera in a camouflage case') });
    }
  }

  // ---- seventy-five years of neglect on top (kettle_dress.ts): moss, fallen boards, the cook's shelf, the outhouse
  if (!r5off()) pending.push(dressKettle(grp, {
    hAt, ck, ckBase, bk: { x: 6, z: -3.6, w: 10, d: 6 },
    solid: (x, y, z, half, ry = 0) => solidBox(toW(x, y, z), half, yaw + ry),
  }).catch((e) => console.warn('[story] kettle dressing', e)));
  // tidy: everything static casts and receives (except the small clutter, which stays shadowless)
  Promise.all(pending).then(() => grp.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = m.parent?.name !== 'kettle_clutter' && !(m instanceof THREE.InstancedMesh); m.receiveShadow = true; } }));
}

/** the cookhouse stove: fire level 0..1, smoke from the pipe while lit (call every frame) */
export function tickStove(W: StoryWorld, dt: number, playerNear: boolean): void {
  const s = W.stove;
  (s.fire.userData.tick as ((dt: number, l: number) => void) | undefined)?.(dt, s.level);
  // lights fade out with distance (the light count never changes: no shader recompiles)
  const k = playerNear ? 1 : 0;
  s.light.intensity = k * s.level * (14 + Math.sin(performance.now() * 0.013) * 1.6);
  W.lamp.light.intensity = k * W.lamp.level * (9 + Math.sin(performance.now() * 0.021 + 1) * 0.6);
  if (s.level > 0.1 && playerNear && Math.random() < dt * 3) {
    puffs.emit(s.pipeTop, new THREE.Vector3(0.1, 0.6, 0.05), { size: 0.35, grow: 3.5, life: 6, color: new THREE.Color(0.36, 0.34, 0.33), alpha: 0.25, rise: 0.3 });
  }
}

/** the food you set on a plate, as a model on it */
export function showOnPlate(g: Game, W: StoryWorld, i: number, item: string | null): void {
  const p = W.plates[i];
  if (p.food) { p.food.removeFromParent(); p.food = null; }
  if (!item) return;
  const m = g.toolModel(item) ?? buildProduct('kindling');
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
  const s = Math.min(1, 0.2 / Math.max(size.x, size.z, 0.01));
  m.scale.multiplyScalar(s);
  m.position.set(-0.05, 0.035, 0.42);
  m.rotation.y = i * 1.3;
  p.root.add(m);
  p.food = m;
}

