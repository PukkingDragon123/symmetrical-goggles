// Fixtures shared by the cabin and the store: six-pane windows with grimy glass, plank Z-brace doors with
// strap hinges and a thumb latch, door/window bucks and casings, hanging lamps' flame cards.
// Frame convention: the opening's centre at the origin, wall thickness along Z (outside = +Z), X across.
import * as THREE from 'three';
import { Mesher, Rand, V, box, boxAt, board, defineMat, placeTex, tube, lathe } from './kit';

// ---------------------------------------------------------------------------------------------- glass
const glassMats = new Map<string, THREE.MeshStandardMaterial>();
/** grimy window glass: dirt texture as colour + alpha; emissive warms it when the room behind is lit */
export function glassMat(key: string): string {
  const name = `glass_${key}`;
  if (!glassMats.has(name)) {
    const t = placeTex('glass_grime');
    const m = new THREE.MeshStandardMaterial({
      name, map: t, color: 0xd8e0d8, roughness: 0.55, metalness: 0.0, transparent: true, opacity: 1,
      depthWrite: false, side: THREE.DoubleSide, emissive: new THREE.Color(0xffa040), emissiveMap: t, emissiveIntensity: 0,
    });
    // keep a minimum opacity so clean areas still read as glass (reflections, slight tint)
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.a = max(diffuseColor.a, 0.16);`);
    };
    glassMats.set(name, m);
    defineMat(name, m);
  }
  return name;
}
export function glassMaterial(key: string): THREE.MeshStandardMaterial { glassMat(key); return glassMats.get(`glass_${key}`)!; }

// ---------------------------------------------------------------------------------------------- window
export interface WindowOpts {
  w: number; h: number; depth: number;
  cols?: number; rows?: number;
  sash?: string; buck?: string; casingOut?: string; casingIn?: string; sill?: string;
  glass: string;
  seed?: number;
  /** z of the glass plane (default slightly outside centre) */
  glassZ?: number;
  casingW?: number;
  noInnerCasing?: boolean;
}

/** a fixed six-pane (cols x rows) window in an opening of w x h through a wall of `depth` */
export function windowUnit(ms: Mesher, o: WindowOpts): void {
  const r = new Rand(o.seed ?? 3);
  const cols = o.cols ?? 2, rows = o.rows ?? 3;
  const w = o.w, h = o.h, dz = o.depth;
  const buck = o.buck ?? 'board_grey', sash = o.sash ?? 'trim_cream';
  const cw = o.casingW ?? 0.1;
  const bt = 0.035; // buck thickness
  // bucks: the frame lining the opening
  board(ms, buck, r, 0, h / 2 - bt / 2, 0, w, bt, dz, 0, { grain: 'x' });
  board(ms, buck, r, 0, -h / 2 + bt / 2, 0, w, bt, dz, 0, { grain: 'x' });
  board(ms, buck, r, -w / 2 + bt / 2, 0, 0, bt, h - 2 * bt, dz, 0, { grain: 'y' });
  board(ms, buck, r, w / 2 - bt / 2, 0, 0, bt, h - 2 * bt, dz, 0, { grain: 'y' });
  // exterior casing
  const zo = dz / 2 + 0.012;
  const co = o.casingOut ?? 'board_grey';
  board(ms, co, r, 0, h / 2 + cw / 2 - 0.01, zo, w + 2 * cw, cw, 0.025, 0, { grain: 'x' });
  board(ms, co, r, -w / 2 - cw / 2 + 0.01, -0.02, zo, cw, h + 0.04, 0.025, 0, { grain: 'y' });
  board(ms, co, r, w / 2 + cw / 2 - 0.01, -0.02, zo, cw, h + 0.04, 0.025, 0, { grain: 'y' });
  // drip cap over the head casing
  board(ms, co, r, 0, h / 2 + cw + 0.005, zo + 0.015, w + 2 * cw + 0.04, 0.025, 0.06, 0, { grain: 'x' });
  // sloped sill sticking out
  ms.pushT(0, -h / 2 - 0.012, dz / 2 + 0.03, 0, 0.12);
  box(ms, o.sill ?? co, w + 2 * cw + 0.06, 0.03, 0.12, { grain: 'x', uv: [r.range(0, 2), r.range(0, 2)] });
  ms.pop();
  if (!o.noInnerCasing) {
    const ci = o.casingIn ?? 'board_warm';
    const zi = -dz / 2 - 0.012;
    board(ms, ci, r, 0, h / 2 + cw / 2 - 0.01, zi, w + 2 * cw, cw, 0.025, 0, { grain: 'x' });
    board(ms, ci, r, -w / 2 - cw / 2 + 0.01, 0, zi, cw, h + 0.02, 0.025, 0, { grain: 'y' });
    board(ms, ci, r, w / 2 + cw / 2 - 0.01, 0, zi, cw, h + 0.02, 0.025, 0, { grain: 'y' });
    // interior stool (inside sill shelf)
    board(ms, ci, r, 0, -h / 2 - 0.0, zi - 0.03, w + 2 * cw + 0.04, 0.03, 0.1, 0, { grain: 'x' });
  }
  // sash: stiles, rails, muntins
  const gz = o.glassZ ?? dz * 0.12;
  const iw = w - 2 * bt, ih = h - 2 * bt;
  const st = 0.055, rl = 0.06, mt = 0.022, sd = 0.04;
  board(ms, sash, r, -iw / 2 + st / 2, 0, gz, st, ih, sd, 0, { grain: 'y' });
  board(ms, sash, r, iw / 2 - st / 2, 0, gz, st, ih, sd, 0, { grain: 'y' });
  board(ms, sash, r, 0, ih / 2 - rl / 2, gz, iw - 2 * st, rl, sd, 0, { grain: 'x' });
  board(ms, sash, r, 0, -ih / 2 + rl * 0.75, gz, iw - 2 * st, rl * 1.5, sd, 0, { grain: 'x' });
  const gx0 = -iw / 2 + st, gx1 = iw / 2 - st, gy0 = -ih / 2 + rl * 1.5, gy1 = ih / 2 - rl;
  for (let c = 1; c < cols; c++) {
    const x = gx0 + (gx1 - gx0) * (c / cols);
    boxAt(ms, sash, x, (gy0 + gy1) / 2, gz, mt, gy1 - gy0, sd * 0.8, 0, { grain: 'y' });
  }
  for (let k = 1; k < rows; k++) {
    const y = gy0 + (gy1 - gy0) * (k / rows);
    boxAt(ms, sash, 0, y, gz, gx1 - gx0, mt, sd * 0.8, 0, { grain: 'x' });
  }
  // glass (one pane sheet behind the muntins), UVs in metres with a random offset (different grime per window)
  const u0 = r.range(0, 4), v0 = r.range(0, 4);
  ms.quad(o.glass, V(gx0, gy0, gz), V(gx1, gy0, gz), V(gx1, gy1, gz), V(gx0, gy1, gz),
    [u0, v0], [u0 + gx1 - gx0, v0], [u0 + gx1 - gx0, v0 + gy1 - gy0], [u0, v0 + gy1 - gy0]);
}

// ---------------------------------------------------------------------------------------------- doors
export interface DoorOpts {
  w: number; h: number; depth: number;
  buck?: string; casingOut?: string; casingIn?: string;
  leafMat?: string; ledgeMat?: string;
  seed?: number;
  /** hinge side: -1 = left (x = -w/2) seen from outside, +1 = right */
  hinge?: -1 | 1;
  casingW?: number;
  noInnerCasing?: boolean;
  threshold?: string;
}

/** the static frame (bucks, casings, threshold) for a door opening */
export function doorFrame(ms: Mesher, o: DoorOpts): void {
  const r = new Rand(o.seed ?? 5);
  const w = o.w, h = o.h, dz = o.depth;
  const bt = 0.045, cw = o.casingW ?? 0.11;
  const buck = o.buck ?? 'board_grey';
  board(ms, buck, r, 0, h / 2 - bt / 2, 0, w, bt, dz, 0, { grain: 'x' });
  board(ms, buck, r, -w / 2 + bt / 2, 0, 0, bt, h - bt, dz, 0, { grain: 'y' });
  board(ms, buck, r, w / 2 - bt / 2, 0, 0, bt, h - bt, dz, 0, { grain: 'y' });
  // threshold: a worn oak sill
  board(ms, o.threshold ?? 'board_dark', r, 0, -h / 2 + 0.012, 0.02, w + 0.06, 0.035, dz + 0.06, 0, { grain: 'x' });
  const zo = dz / 2 + 0.012;
  const co = o.casingOut ?? 'board_grey';
  board(ms, co, r, 0, h / 2 + cw / 2 - 0.01, zo, w + 2 * cw, cw, 0.025, 0, { grain: 'x' });
  board(ms, co, r, -w / 2 - cw / 2 + 0.01, -0.0, zo, cw, h, 0.025, 0, { grain: 'y' });
  board(ms, co, r, w / 2 + cw / 2 - 0.01, -0.0, zo, cw, h, 0.025, 0, { grain: 'y' });
  board(ms, co, r, 0, h / 2 + cw + 0.005, zo + 0.015, w + 2 * cw + 0.04, 0.025, 0.06, 0, { grain: 'x' });
  if (!o.noInnerCasing) {
    const ci = o.casingIn ?? 'board_warm';
    const zi = -dz / 2 - 0.012;
    board(ms, ci, r, 0, h / 2 + cw / 2 - 0.01, zi, w + 2 * cw, cw, 0.025, 0, { grain: 'x' });
    board(ms, ci, r, -w / 2 - cw / 2 + 0.01, 0, zi, cw, h, 0.025, 0, { grain: 'y' });
    board(ms, ci, r, w / 2 + cw / 2 - 0.01, 0, zi, cw, h, 0.025, 0, { grain: 'y' });
  }
}

/**
 * A plank door leaf with a Z brace on the inside, strap hinges outside and a thumb latch.
 * Returns the pivot (on the hinge line, rotate .rotation.y to swing; positive = inward) with the leaf inside.
 * The pivot sits at the inner face of the opening, at the hinge side, at the bottom of the opening.
 */
export function doorLeaf(o: DoorOpts & { iron?: string }): { pivot: THREE.Group; leaf: THREE.Group } {
  const r = new Rand((o.seed ?? 5) + 11);
  const ms = new Mesher();
  const hinge = o.hinge ?? -1;
  const lw = o.w - 0.1, lh = o.h - 0.07, t = 0.045;
  const mat = o.leafMat ?? 'planks_grey', ledge = o.ledgeMat ?? 'board_grey', iron = o.iron ?? 'iron';
  // leaf local frame: hinge edge at x = 0, leaf extends to x = -hinge * lw ... build for hinge=-1 (extends +x), mirror otherwise
  const sx = -hinge; // +1 when the leaf extends toward +x
  const n = 5;
  const pw = lw / n;
  for (let i = 0; i < n; i++) {
    const x = sx * (pw * (i + 0.5));
    const hh = lh - r.range(0, 0.012);
    board(ms, mat, r, x, hh / 2 + 0.008, 0, pw - 0.006, hh, t, 0, { grain: 'y' });
    // V-groove shadow between planks: a thin dark strip
    if (i > 0) boxAt(ms, 'iron', sx * pw * i, lh / 2 + 0.008, 0.0, 0.006, lh - 0.02, t * 0.92, 0, { grain: 'y' });
  }
  // inside face (-Z): two ledges and a diagonal brace (Z)
  const zi = -t / 2 - 0.0125;
  const y1 = 0.28, y2 = lh - 0.3;
  board(ms, ledge, r, sx * lw / 2, y1, zi, lw - 0.06, 0.13, 0.025, 0, { grain: 'x' });
  board(ms, ledge, r, sx * lw / 2, y2, zi, lw - 0.06, 0.13, 0.025, 0, { grain: 'x' });
  {
    // brace runs from the bottom ledge at the hinge side up to the top ledge at the latch side (pushes toward hinge)
    const ax = sx * 0.1, ay = y1 + 0.06, bx = sx * (lw - 0.1), by = y2 - 0.06;
    const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
    ms.pushT((ax + bx) / 2, (ay + by) / 2, zi, 0, 0, ang);
    box(ms, ledge, len, 0.12, 0.024, { grain: 'x', uv: [r.range(0, 2), r.range(0, 2)] });
    ms.pop();
  }
  // outside face (+Z): strap hinges with nail heads, and the latch
  const zo = t / 2 + 0.004;
  for (const y of [y1, y2]) {
    // tapered strap
    const L = lw * 0.62;
    const shape: [number, number][] = [];
    const N = 8;
    for (let k = 0; k <= N; k++) { const u = k / N; shape.push([u * L, 0.022 - 0.01 * u]); }
    for (let k = N; k >= 0; k--) { const u = k / N; shape.push([u * L, -0.022 + 0.01 * u]); }
    ms.pushT(0, y, zo, 0, 0, 0);
    if (sx < 0) ms.push(new THREE.Matrix4().makeScale(-1, 1, 1));
    const sh = new THREE.Shape(shape.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: false });
    ms.geom(iron, g); g.dispose();
    // fleur end and nail heads
    for (let k = 1; k < 5; k++) boxAt(ms, iron, (k / 5) * L, 0, 0.008, 0.012, 0.012, 0.006);
    // knuckle (pintle barrel) at the hinge edge
    ms.pushT(-0.005, 0, -0.03, 0, 0, 0);
    lathe(ms, iron, [[0.0, -0.05], [0.014, -0.05], [0.014, 0.05], [0.0, 0.05]], 8);
    ms.pop();
    if (sx < 0) ms.pop();
    ms.pop();
  }
  // thumb latch (Suffolk): backplate + handle grip on the outside, near the latch edge
  {
    const lx = sx * (lw - 0.11), ly = 1.0;
    boxAt(ms, iron, lx, ly + 0.12, zo, 0.035, 0.07, 0.006);
    boxAt(ms, iron, lx, ly - 0.12, zo, 0.035, 0.07, 0.006);
    tube(ms, iron, [V(lx, ly + 0.1, zo), V(lx, ly + 0.07, zo + 0.045), V(lx, ly - 0.07, zo + 0.045), V(lx, ly - 0.1, zo)], 0.008, 6);
    // thumb lever through the door
    boxAt(ms, iron, lx, ly + 0.1, zo + 0.02, 0.012, 0.006, 0.05, 0, {}, -0.3);
    // inside: latch bar and a wooden pull knob
    boxAt(ms, iron, lx - sx * 0.08, ly + 0.1, zi - 0.03, 0.2, 0.018, 0.008);
    ms.pushT(lx, ly - 0.05, zi - 0.012, 0, -Math.PI / 2);
    lathe(ms, 'board_dark', [[0, 0], [0.012, 0], [0.012, 0.03], [0.02, 0.045], [0.018, 0.06], [0, 0.065]], 8);
    ms.pop();
  }
  const leaf = ms.build({ name: 'door_leaf' });
  const pivot = new THREE.Group();
  pivot.name = 'door';
  pivot.add(leaf);
  // place the leaf so its hinge edge is at the pivot: pivot at x = hinge * (w/2 - 0.05)
  leaf.position.set(0, 0, t / 2);
  void hinge;
  return { pivot, leaf };
}

// ---------------------------------------------------------------------------------------------- flames
let flameTex: THREE.Texture | null = null;
/** a pixel-art flame strip (4 frames side by side), additive */
export function flameTexture(): THREE.Texture {
  if (flameTex) return flameTex;
  const W = 16, H = 32, F = 4;
  const c = document.createElement('canvas');
  c.width = W * F; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W * F, H);
  const rnd = new Rand(77);
  for (let f = 0; f < F; f++) {
    const ph = rnd.range(0, 6.28);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = 1 - y / H; // 0 bottom .. 1 top (canvas y down)
      const t = y / H;     // 0 top .. 1 bottom
      const sway = Math.sin(t * 5 + ph) * 1.6 * (1 - t);
      const cx = W / 2 + sway;
      const wdt = (W * 0.42) * Math.pow(t, 0.7) * (1 - 0.15 * Math.sin(t * 9 + ph * 2));
      const d = Math.abs(x + 0.5 - cx) / Math.max(0.5, wdt);
      let a = (1 - d) * Math.min(1, t * 1.6);
      a += 0.15 * Math.sin(x * 2.1 + y * 0.7 + ph * 3);
      a = Math.max(0, Math.min(1, a));
      a = Math.round(a * 4) / 4;
      const hot = Math.min(1, a * 1.2 * (0.4 + t));
      const o = (y * W * F + f * W + x) * 4;
      img.data[o] = 255;
      img.data[o + 1] = Math.round(80 + 170 * hot * hot);
      img.data[o + 2] = Math.round(20 + 120 * Math.pow(hot, 4));
      img.data[o + 3] = Math.round(a * 255);
      void v;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  flameTex = t;
  return t;
}

/** a crossed pair of flame cards; call .userData.tick(t, level) to animate */
export function flameCards(w: number, h: number, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const base = flameTexture();
  const mats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 2; i++) {
    const tex = base.clone();
    tex.repeat.set(0.25, 1);
    tex.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff, fog: true });
    mats.push(m);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    q.position.y = h / 2;
    q.rotation.y = i * Math.PI / 2 + 0.3;
    q.renderOrder = 3;
    g.add(q);
  }
  let fr = 0, acc = 0;
  g.userData.tick = (dt: number, level: number) => {
    acc += dt * (8 + seed % 3);
    if (acc > 1) { acc = 0; fr = (fr + 1) % 4; }
    mats.forEach((m, i) => { (m.map as THREE.Texture).offset.x = ((fr + i * 2) % 4) * 0.25; m.opacity = Math.min(1, level * 1.3); });
    const s = 0.25 + 0.75 * level;
    g.scale.set(s, s * (0.9 + 0.2 * Math.sin(performance.now() * 0.011 + seed)), s);
    g.visible = level > 0.02;
  };
  return g;
}
