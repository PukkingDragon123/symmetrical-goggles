// THE GUMBEROO (Cox 1910: a big, round creature of the burned-over lands whose tough hide makes bullets and axes
// bounce off; a forest fire is the only thing that can harm it). v3, a SCALY BEAST: a huge round body on four stumpy
// pillar legs, no neck, a broad blunt face with a wide crooked grin; heavy armour: rows of thick domed plates
// shingled down the back, a crest of keeled spikes, two blunt horns, heavy brow plates over big amber slit eyes; the
// hide between is painted as overlapping keeled scales (big on the back, scutes on the belly, beads on the face and
// legs), relief from the page as a bump map. Still rubbery: the whole armoured ball squashes and bounces.
// Creature space: metres, +z forward, +y up, ground y = 0.
import * as THREE from 'three';
import { Body, trunk, limb, legRings, eyeball, eyelid, sac, bulbs, spine, gridSurf, chainSkin, Px, RP, h3, cl, runSync, runAsync, type V3, type Chart, type Piece, type Station, type LimbRing } from '../anatomy';
import { fbm3, nz2 } from '../paintkit';
import type { BoneDef } from '../rig';

export const GUMBEROO_MODEL_VERSION = 'gumberoo@4';
export interface GumberooModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }
export const GB = { root: [0, 0.82, 0] as V3, head: [0, 0.86, 0.5] as V3, eye: [0.18, 1.04, 0.75] as V3,
  fl: { hip: [0.36, 0.42, 0.36] as V3, knee: [0.4, 0.22, 0.4] as V3, sole: [0.42, 0.0, 0.42] as V3 },
  hl: { hip: [0.38, 0.42, -0.36] as V3, knee: [0.42, 0.22, -0.4] as V3, sole: [0.43, 0.0, -0.42] as V3 } };
const mir = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];

export function gumberooBones(): BoneDef[] {
  const b: BoneDef[] = [];
  const A = (name: string, parent: string | null, pos: V3) => b.push({ name, parent: parent ? b.findIndex((x) => x.name === parent) : -1, pos: pos as [number, number, number] });
  A('root', null, GB.root);
  A('belly', 'root', [0, 0.5, 0]);
  A('head', 'root', GB.head);
  A('jaw', 'head', [0, 0.68, 0.62]);
  A('eyeL', 'head', GB.eye); A('eyeR', 'head', mir(GB.eye, -1));
  A('tail', 'root', [0, 0.85, -0.78]);
  for (const [s, sd] of [['L', 1], ['R', -1]] as const) { A('brow' + s, 'head', mir(BROWS, sd)); A('lid' + s, 'head', mir(GB.eye, sd)); }
  for (const [k, leg] of [['f', GB.fl], ['h', GB.hl]] as const) for (const [s, sd] of [['L', 1], ['R', -1]] as const) {
    A(k + 'u' + s, 'root', mir(leg.hip, sd)); A(k + 'l' + s, k + 'u' + s, mir(leg.knee, sd)); A(k + 'f' + s, k + 'l' + s, mir([leg.sole[0], 0.045, leg.sole[2]], sd));
  }
  return b;
}

const HIDE = RP('olive'), BLACK = RP('basalt'), SOOT = RP('ink'), ASH = RP('stone'), AMBER = RP('glowAmber'), GUM = RP('gum'), BELLY = RP('sand'), EMBER = RP('rust'), PLATE = RP('slate');
/** the face's moving parts (v3): heavy brow plates, eyelids */
export const GB_EYE_AX: V3 = [0.55, 0.15, 0.82];
const BROWS: V3 = [0.18, 1.105, 0.735];
/** the scaly hide: big keeled scales shingled down the back (tips to the tail), broad pale scutes across the belly,
 *  small beaded scales on the face and legs; dark olive and charcoal, an ember-rust stripe down the spine, soot and
 *  ash from the burn, each scale lit on its upper edge with a dark outline, glossy where it is worn */
function hidePaint(ch: Chart, _p: Piece, b: Body) { return hideGen(ch, b); }
function* hideGen(ch: Chart, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
  px.lightK = 0.8;
  const back = new Float32Array(px.n), belly = new Float32Array(px.n), small = new Float32Array(px.n);
  for (let i = 0; i < px.n; i++) {
    if ((i & 8191) === 0) yield;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1], ax = Math.abs(x);
    const m = fbm3(x * 3, y * 3, z * 3, 3);
    const face = z > 0.74 && ax < 0.3 && y > 0.5 && y < 0.95;
    const leg = y < 0.42;
    // the colour: charcoal and dark olive patches, an ember stripe down the spine, pale sand scutes underneath
    // two broad tones (dark olive on the back, charcoal down the flanks), the scales carry the detail
    const flank = ny < 0.35 + nz2(x * 3, z * 3) * 0.25;
    let R = flank ? BLACK : HIDE, st = (flank ? 2.6 : 2.2) + (m > 0.3 ? 0.4 : 0), rough = 120;
    if (ny > 0.6 && ax < 0.1 + nz2(z * 6, 1) * 0.03 && !face) { R = EMBER; st = 1.3 + m * 0.4; }
    if (ny < -0.35 && !leg) { R = BELLY; st = 2.8 + m * 0.4; rough = 170; }
    // the mouth: a long crooked grin across the blunt face, gum dark inside, a scaly lip above it
    const grin = y - (0.66 + 0.06 * Math.pow(ax / 0.34, 2) + 0.01 * Math.sin(x * 9));
    if (z > 0.55 && ax < 0.36) {
      if (Math.abs(grin) < mpt * 1.6) { px.put(i, GUM, 0.6); px.rough[i] = 60; continue; }
      if (grin > 0 && grin < 0.02) st += 0.8;
      if (grin < 0 && grin > -0.012) st -= 0.7;
    }
    // nostrils: two dark slots on the blunt snout
    for (const sx of [1, -1]) if (z > 0.7 && Math.hypot((x - sx * 0.07) * 1.0, (y - 0.82) * 2.2) < 0.022) { st = 0.2; R = BLACK; }
    // soot and ash from the burn: dark smudges low down, grey ash caked on the feet
    const soot = fbm3(x * 5 + 9, y * 5, z * 5, 3);
    if (soot > 0.38 && y < 0.75) { R = SOOT; st = 1 + soot; rough = 200; }
    if (y < 0.1) { R = ASH; st = 2.4 + m; rough = 230; }
    px.put(i, R, st); px.rough[i] = rough;
    if (face || leg) small[i] = 1; else if (ny < -0.35) belly[i] = 1; else back[i] = 1;
  }
  yield;
  // big keeled scales on the back and flanks (biggest along the spine), broad scutes on the belly, beads elsewhere
  px.scales({ size: 0.16, kind: 'keel', flow: -1, mask: (i) => back[i], sizeK: (i) => 0.65 + 0.5 * Math.max(0, px.gb.N[i * 3 + 1]), ink: 3, lit: 1.8, shade: 1.6, seed: 5 });
  yield;
  px.scales({ size: 0.1, kind: 'scute', flow: -1, mask: (i) => belly[i], ink: 2, lit: 0.9, shade: 0.9, seed: 9 });
  yield;
  px.pebbles(0.022, { mask: (i) => small[i], depth: 1.2, seed: 13 });
  yield;
  px.creaseInk(1.2, { dark: 1.1, lit: 0.6 });
  px.glints(PLATE, { every: 0.3, size: 0.3 });
  yield;
  px.flush();
}
/** the armour plates: thick slate shields with growth ridges, ember-rust worn edges, soot */
function platePaint(ch: Chart, _p: Piece, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N;
  px.lightK = 0.9;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], m = fbm3(x * 8, y * 8, z * 8, 2);
    const ridge = Math.abs(Math.sin((x * 3 + y * 7 + z * 5) * 40 + m * 3)) < 0.18;
    let R = PLATE, st = 1.8 + m * 0.7 - (ridge ? 0.8 : 0) + (N[i * 3 + 1] > 0.7 ? 0.6 : 0) + (px.gb.K[i] > 0.6 ? 0.9 : 0);
    // scorched: soot in the hollows, a few rust-red flecks where the fire licked it
    if (fbm3(x * 6 + 3, y * 6, z * 6, 2) > 0.3) { R = SOOT; st = 1.2 + m; }
    else if (fbm3(x * 20, y * 20 + 7, z * 20, 2) > 0.42) { R = EMBER; st = 1.6 + m; }
    px.put(i, R, st); px.rough[i] = 110;
  }
  px.creaseInk(1.3, { dark: 1.2, lit: 0.8 });
  px.glints(PLATE, { every: 0.2, size: 0.3 });
  px.flush();
}

export function* gumberooModelGen(o: { page?: number; den?: number } = {}): Generator<string | void, GumberooModel> {
  const bones = gumberooBones(), bi = (n: string) => bones.findIndex((b) => b.name === n);
  const body = new Body(o.page ?? 1024);
  const st: Station[] = [
    { c: [0, 0.86, -0.82], s: [0.06, 0.06], p: 'round' },
    { c: [0, 0.84, -0.74], s: [0.3, 0.3], p: 'round' },
    { c: [0, 0.82, -0.58], s: [0.56, 0.54], p: 'round' },
    { c: [0, 0.8, -0.3], s: [0.72, 0.68], p: 'barrel' },
    { c: [0, 0.8, 0.0], s: [0.78, 0.72], p: 'barrel' },
    { c: [0, 0.81, 0.3], s: [0.72, 0.66], p: 'barrel' },
    { c: [0, 0.83, 0.52], s: [0.56, 0.52], p: 'round' },
    { c: [0, 0.84, 0.68], s: [0.4, 0.36], p: 'round' },
    { c: [0, 0.82, 0.78], s: [0.2, 0.17], p: 'round' },
    { c: [0, 0.81, 0.81], s: [0.04, 0.04], p: 'round' },
  ];
  const J: V3[] = [[0, 0.85, -0.9], [0, 0.85, -0.7], [0, 0.82, 0.4], [0, 0.85, 0.6], [0, 0.85, 1.0]];
  const sk = chainSkin(J, [bi('tail'), bi('root'), bi('root'), bi('head')], 0.5);
  const skin = (p: V3) => {
    const w = sk(p);
    // below the grin the face rides the jaw (the mouth opens), the belly sags on its own bone
    const ax = Math.abs(p[0]), grin = p[1] - (0.66 + 0.06 * Math.pow(ax / 0.34, 2));
    if (p[2] > 0.5 && grin < 0 && grin > -0.2 && ax < 0.4) { const k = cl(-grin / 0.03, 0, 1) * cl((p[2] - 0.5) / 0.12, 0, 1); return [bi('head'), 1 - k, bi('jaw'), k]; }
    return p[1] < 0.55 && p[2] > -0.6 && p[2] < 0.5 ? [w[0], (w[1] ?? 1) * 0.6, bi('belly'), 0.4] : w;
  };
  const torso = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, levels: 1, k: 1.2, skin, paint: hidePaint }));
  body.finalize(torso);
  yield 'trunk';
  // the armour: rows of thick domed plates shingled down the back (each tipped toward the tail), a crest of keeled
  // spikes along the spine, two blunt horns
  const g = torso.grids[0], plates: { p: V3; n: V3; r: number; h: number }[] = [], spikes: { p: V3; n: V3 }[] = [];
  for (let r = 0; r < 7; r++) {
    const v = 0.17 + r * 0.068;
    for (const u of [0.5, 0.42, 0.58, 0.34, 0.66]) {
      const uu = u + (r % 2 ? 0.03 : -0.03) * (u === 0.5 ? 0 : 1);
      if (Math.abs(uu - 0.5) > 0.12 && (r < 1 || r > 5)) continue;
      const q = gridSurf(torso.m, g, uu, v);
      if (q.n[1] < 0.05) continue;
      const tilt = norm(add(q.n, [0, 0, -0.55]));
      const big = 1 - Math.abs(uu - 0.5) * 2.2;
      if (u === 0.5) { spikes.push({ p: q.p, n: norm(add(q.n, [0, 0, -0.5])) }); continue; }
      plates.push({ p: add(q.p, [-q.n[0] * 0.02, -q.n[1] * 0.02, -q.n[2] * 0.02]), n: tilt, r: 0.07 + 0.035 * big, h: 0.04 + 0.02 * big });
    }
  }
  body.add(bulbs({ name: 'plates', seats: plates, skin, paint: platePaint, levels: 1, k: 1.1, around: 7 }));
  spikes.forEach((sp, k) => body.add(spine({ name: 'spike' + k, at: sp.p, dir: sp.n, len: 0.1 + 0.05 * Math.sin((k / spikes.length) * Math.PI), r: 0.045, skin, paint: platePaint, levels: 1, around: 6 })));
  for (const s of [1, -1]) body.add(spine({ name: 'horn' + (s > 0 ? 'L' : 'R'), at: [s * 0.16, 1.12, 0.6], dir: [s * 0.35, 1, -0.35], len: 0.16, r: 0.045, skin: () => [bi('head'), 1], paint: platePaint, levels: 1, around: 7 }));
  yield 'armour';
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const c = mir(GB.eye, s), ax: V3 = [s * GB_EYE_AX[0], GB_EYE_AX[1], GB_EYE_AX[2]];
    body.add(eyeball({ name: 'eye' + S, c, ax, r: 0.046, bone: bi('eye' + S), iris: AMBER, pupil: 'slit', irisA: 0.7, sclera: RP('bone'), k: 3, levels: 1, around: 10, catchlight: { side: s, at: [0.3, 0.42] } }));
    body.add(eyelid({ name: 'lid' + S, c, ax, r: 0.046, bone: bi('lid' + S), paint: platePaint, cover: 1.05, root: 2.2 })).levels = 0;
    // a heavy brow plate over each eye: it lowers into a glower, lifts in surprise
    body.add(sac({ name: 'brow' + S, at: mir(BROWS, s), n: norm([s * 0.3, 1, 0.55]), r: [0.075, 0.038, 0.024], skin: () => [bi('brow' + S), 1], paint: platePaint, levels: 1, k: 1.6, sink: 0.25 }));
  }
  for (const [k, leg] of [['f', GB.fl], ['h', GB.hl]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const hip = mir(leg.hip, s), knee = mir(leg.knee, s), sole = mir(leg.sole, s);
    const segL = [Math.hypot(hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[1] - sole[1], knee[2] - sole[2])];
    let rings: LimbRing[] = legRings('pillar', k === 'f', 0.15, [0, 0.5, 1], segL, 0.04);
    rings = rings.map((r) => ({ ...r, r: r.r * (r.t < 0 ? 1.1 : 1) }));
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, around: 12, levels: 1, rise: 0.2,
      foot: { pad: 0.17, h: 0.03, fwd: 0.1, nail: 'nail', lobe: 0.15, toeAround: 5, toes: [-40, 0, 40].map((a) => ({ a, len: 0.03, r: 0.035, claw: 0.06, curl: 0.3, drop: 0.3 })) },
      bones: { parent: bi('root'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: hidePaint, clawPaint: (ch, _p, b) => { const px = new Px(ch, b); for (let i = 0; i < px.n; i++) { px.put(i, BLACK, 2 + (h3(i, 1, 1) < 0.2 ? 1 : 0) + (px.gb.N[i * 3 + 1] > 0.4 ? 1 : 0)); px.rough[i] = 90; } px.creaseInk(1, { dark: 1, lit: 1 }); px.flush(); }, k: 1 });
    out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
    yield 'leg';
  }
  const out = yield* body.buildGen({ den: o.den ?? 200, maxScale: 2, budget: 16000 });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, bones, tris: out.tris, den: body.den, stats };
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const buildGumberooModel = (o: { page?: number; den?: number } = {}) => runSync(gumberooModelGen(o));
export const buildGumberooModelAsync = (o: { page?: number; den?: number } = {}) => runAsync(gumberooModelGen(o));
export { cl };
