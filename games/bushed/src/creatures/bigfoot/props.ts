// BIGFOOT's props, built with the anatomy kit (lofted cages, painted pixel-art pages): the branch it knocks trees with
// and the gifts it leaves by the cabin: a brook trout, a twig of blueberries, a stick carved with a spiral.
//   handProp(kind)  oriented for the grip in Bigfoot's right hand (origin at the fist)
//   giftMesh(kind)  lying on the ground (origin on the ground under its middle) for the game to place
import * as THREE from 'three';
import { Body, stalk, trunk, bulbs, curve, Px, RP, h3, cell3, type Chart, type Piece } from '../anatomy';
import { creatureMaterial } from '../rig';

export type PropKind = 'branch' | 'fish' | 'berries' | 'carved_stick';
export const GIFTS: PropKind[] = ['fish', 'berries', 'carved_stick'];

const BARK = RP('soil'), WOOD = RP('bone'), OLIVE = RP('olive'), SILVER = RP('quartz'), PINK = RP('coral'), BLUE = RP('sapphire'), VIOLET = RP('violet');

function barkPaint(carved = false) {
  return (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b);
    for (let y = 0, i = 0; y < px.h; y++) for (let x = 0; x < px.w; x++, i++) {
      const u = (x + 0.5) / px.w, v = px.Y[y];
      const fis = Math.abs(Math.sin(u * Math.PI * 2 * 7 + Math.sin(v * 9) * 0.8)) < 0.22;
      if (carved && v > 0.08 && v < 0.42) {
        // a spiral band carved through the bark to the pale wood, knife facets along it
        const sp = ((u + v * 5) % 1 + 1) % 1;
        if (sp < 0.5) { px.put(i, WOOD, 3.4 + (Math.floor(v * 90) % 2 ? 0.4 : -0.2) - (sp < 0.04 || sp > 0.46 ? 1.5 : 0)); px.rough[i] = 190; continue; }
      }
      px.put(i, BARK, 3 - (fis ? 1.2 : 0) + (h3(x, y, 3) < 0.06 ? 0.8 : 0)); px.rough[i] = 230;
    }
    px.flush();
  };
}
function fishPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.lightK = 0.6;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1];
    const fin = z < -0.19;
    if (fin) { px.put(i, OLIVE, 2.5 + (Math.abs(Math.sin(y * 260)) < 0.3 ? -0.8 : 0)); px.rough[i] = 120; continue; }
    // the eye
    if (z > 0.15 && Math.hypot(z - 0.165, y - 0.012) < 0.009 && Math.abs(x) > 0.01) { px.put(i, z > 0.163 && Math.hypot(z - 0.165, y - 0.012) < 0.004 ? RP('ink') : RP('gold'), 2); px.rough[i] = 30; continue; }
    const band = Math.abs(y - 0.0 + Math.sin(z * 20) * 0.003) < 0.009;
    let R = ny > 0.35 || y > 0.012 ? OLIVE : ny < -0.4 ? SILVER : band ? PINK : SILVER;
    let st = R === OLIVE ? 2.6 : R === PINK ? 3.4 : 3.6;
    // vermiculated back and spots along the flank (a brook trout), red spots with pale halos low on the side
    const c = cell3(x, y, z, 0.014, 4);
    if (R === OLIVE && Math.abs(Math.sin(c.id)) > 0.6 && c.f1 < 0.004) { st = 4.5; }
    if (R === SILVER && y > -0.01 && c.f1 < 0.0032 && (c.id % 4) === 0) { R = PINK; st = 2; }
    if (z > 0.13 && Math.abs(x) > 0.004 && Math.abs(z - 0.145 - y * 0.3) < 0.002) st -= 1.5; // the gill cover
    px.put(i, R, st); px.rough[i] = 60;
  }
  px.creaseInk(1, { dark: 1, lit: 0.8 });
  px.glints(SILVER, { every: 0.4, size: 0.03 });
  px.flush();
}
function berryPaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), N = px.gb.N;
  for (let i = 0; i < px.n; i++) { px.put(i, h3(i, 2, 5) < 0.3 ? VIOLET : BLUE, 2.4 + N[i * 3 + 1] * 1.1 + (h3(i, 1, 7) < 0.1 ? 1.2 : 0)); px.rough[i] = 150; }
  px.creaseInk(0.8, { dark: 1.2 });
  px.flush();
}

const cache = new Map<PropKind, { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }>();
function build(kind: PropKind) {
  let got = cache.get(kind);
  if (got) return got;
  const body = new Body(256);
  const skin = () => [0, 1];
  if (kind === 'branch' || kind === 'carved_stick') {
    const L = kind === 'branch' ? 0.95 : 0.55, r0 = kind === 'branch' ? 0.03 : 0.018;
    body.add(stalk({ name: 'stick', path: curve([[0, 0, -0.06], [0.01, 0.005, L * 0.4], [-0.015, 0.0, L * 0.75], [0.0, 0.01, L]], 9), r: (t) => r0 * (1 - t * 0.45), around: 7, capS: true, capE: true, levels: 1, k: 1, skin, paint: barkPaint(kind === 'carved_stick') }));
    if (kind === 'branch') body.add(stalk({ name: 'twig', path: curve([[0.0, 0, L * 0.55], [0.07, 0.03, L * 0.68], [0.12, 0.05, L * 0.76]], 5), r: (t) => 0.012 * (1 - t * 0.7), around: 5, capE: true, levels: 1, k: 1, skin, paint: barkPaint() }));
  } else if (kind === 'fish') {
    const st = (z: number, w: number, h: number, y = 0) => ({ c: [0, y, z], s: [w, h] as [number, number], p: 'flat' as const });
    body.add(trunk({ name: 'fish', stations: [st(-0.26, 0.002, 0.055), st(-0.235, 0.003, 0.045), st(-0.2, 0.006, 0.022), st(-0.12, 0.016, 0.035), st(-0.02, 0.024, 0.05), st(0.08, 0.026, 0.05), st(0.15, 0.021, 0.038), st(0.19, 0.014, 0.024, -0.004), st(0.21, 0.006, 0.012, -0.006)], tween: 1, capS: true, capE: true, levels: 1, k: 1, skin, paint: fishPaint }));
  } else {
    body.add(stalk({ name: 'twig', path: curve([[0, 0, -0.04], [0.005, 0.01, 0.06], [-0.01, 0.015, 0.14]], 6), r: (t) => 0.006 * (1 - t * 0.5), around: 5, capE: true, levels: 0, k: 1, skin, paint: barkPaint() }));
    const seats = Array.from({ length: 14 }, (_, k) => { const a = k * 2.4, z = 0.05 + (k / 14) * 0.08, rr = 0.012 + 0.006 * h3(k, 1, 2); return { p: [Math.cos(a) * rr * 1.2, Math.sin(a) * rr * 1.2, z], n: [Math.cos(a), Math.sin(a), 0.2], r: 0.0105 + 0.003 * h3(k, 3, 4) }; });
    body.add(bulbs({ name: 'berries', seats, skin, paint: berryPaint, levels: 1, around: 6 }));
  }
  const out = body.build({ den: 900, maxScale: 2 });
  const { mat } = creatureMaterial(out.tex, out.sd);
  got = { geo: out.geo, mat };
  cache.set(kind, got);
  return got;
}
/** a prop oriented for Bigfoot's right fist (parent it to the hand bone, at the fist) */
export function handProp(kind: PropKind): THREE.Object3D {
  const { geo, mat } = build(kind);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.name = 'prop:' + kind;
  // the fist sits a hand's length below the wrist; sticks point forward out of it, the fish hangs by its tail
  if (kind === 'fish') { m.rotation.set(Math.PI / 2, 0, 0); m.position.set(0, -0.05, 0.23); }
  else if (kind === 'berries') m.rotation.set(0.3, 0, 0);
  // sticks run down and back out of the fist: raised overhead they point up behind the head, brought down they strike ahead
  else m.rotation.set(1.92, 0, 0);
  return g;
}
/** a gift lying on the ground (origin on the ground under its middle) */
export function giftMesh(kind: PropKind): THREE.Object3D {
  const { geo, mat } = build(kind);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); g.name = 'gift:' + kind;
  if (kind === 'fish') { m.rotation.set(0, 0, Math.PI / 2); m.position.set(0.0, 0.026, 0); }
  else if (kind === 'berries') { m.position.set(0, 0.02, -0.06); }
  else { m.position.set(0, 0.02, -0.25); }
  return g;
}
