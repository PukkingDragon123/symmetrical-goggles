// THE GUMBEROO (Cox 1910: a big, round, hairless creature of the burned-over lands whose tough rubbery hide makes
// bullets and axes bounce off; a forest fire is the only thing that can harm it). Model: a huge round body on four
// stumpy pillar legs, no neck, a broad blunt face with a wide crooked grin and small sunk eyes; the hide glossy
// plum-black rubber, creased at the leg joints and round the face, smudged with soot and ash, healed burn scars.
// Creature space: metres, +z forward, +y up, ground y = 0.
import * as THREE from 'three';
import { Body, trunk, limb, legRings, eyeball, chainSkin, Px, RP, h3, cl, cell3, runSync, runAsync, type V3, type Chart, type Piece, type Station, type LimbRing } from '../anatomy';
import { fbm3, nz2 } from '../paintkit';
import type { BoneDef } from '../rig';

export const GUMBEROO_MODEL_VERSION = 'gumberoo@2';
export interface GumberooModel { geo: THREE.BufferGeometry; tex: THREE.DataTexture; sd: THREE.DataTexture; bones: BoneDef[]; tris: number; den: number; stats: string }
export const GB = { root: [0, 0.82, 0] as V3, head: [0, 0.86, 0.5] as V3, eye: [0.2, 1.06, 0.72] as V3,
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
  for (const [k, leg] of [['f', GB.fl], ['h', GB.hl]] as const) for (const [s, sd] of [['L', 1], ['R', -1]] as const) {
    A(k + 'u' + s, 'root', mir(leg.hip, sd)); A(k + 'l' + s, k + 'u' + s, mir(leg.knee, sd)); A(k + 'f' + s, k + 'l' + s, mir([leg.sole[0], 0.045, leg.sole[2]], sd));
  }
  return b;
}

const HIDE = RP('plum'), BLACK = RP('basalt'), SOOT = RP('ink'), ASH = RP('stone'), AMBER = RP('glowAmber'), GUM = RP('gum');
function hidePaint(ch: Chart, _p: Piece, b: Body) { return hideGen(ch, b); }
function* hideGen(ch: Chart, b: Body) {
  const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, mpt = px.mpt;
  px.lightK = 0.8;
  for (let i = 0; i < px.n; i++) {
    if ((i & 8191) === 0) yield;
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1], ax = Math.abs(x);
    const m = fbm3(x * 3, y * 3, z * 3, 3);
    // plum-black rubber, a shade lighter on the back where it is stretched tight
    let R = m > 0.42 ? HIDE : BLACK, st = (R === HIDE ? 1.1 : 2.3) + (ny > 0.5 ? 0.5 : 0) + m * 0.4, rough = 95;
    // the mouth: a long crooked grin across the blunt face, dark inside, a rubbery lip roll above it
    const grin = y - (0.66 + 0.06 * Math.pow(ax / 0.34, 2) + 0.01 * Math.sin(x * 9));
    if (z > 0.55 && ax < 0.36) {
      if (Math.abs(grin) < mpt * 1.4) { px.put(i, GUM, 0.6); px.rough[i] = 60; continue; }
      if (grin > 0 && grin < 0.022) st += 0.9;
      if (grin < 0 && grin > -0.012) st -= 0.6;
    }
    // creases: rings round the leg tops, folds under the jowls, a few long wrinkles over the back
    const legC = Math.min(...[GB.fl.hip, GB.hl.hip].map((h) => Math.hypot(ax - h[0], y - 0.38, Math.abs(z) - Math.abs(h[2]))));
    if (legC < 0.2 && Math.abs(Math.sin(legC * 95)) < 0.16) st -= 1.2;
    if (z > 0.45 && y < 0.6 && y > 0.4 && Math.abs(Math.sin(y * 80 + x * 6)) < 0.15) st -= 1;
    if (ny > 0.6 && Math.abs(Math.sin(z * 22 + nz2(x * 4, z * 4) * 2)) < 0.05) st -= 0.8;
    // soot and ash from the burn: dark smudges low down, grey ash caked on the feet and belly
    const soot = fbm3(x * 5 + 9, y * 5, z * 5, 3);
    if (soot > 0.3 && y < 0.9) { R = SOOT; st = 1 + soot; rough = 200; }
    if (y < 0.12 || (ny < -0.6 && fbm3(x * 9, 1, z * 9, 2) > 0.1)) { R = ASH; st = 2.4 + m; rough = 230; }
    // old burn scars: pale shiny seams
    const c = cell3(x, y, z, 0.35, 41);
    if ((c.id % 11) === 0 && c.f1 < 0.05 && Math.abs(Math.sin(c.f1 * 260)) < 0.3 && y > 0.7) { R = BLACK; st = 3.6; rough = 55; }
    px.put(i, R, st); px.rough[i] = rough;
  }
  yield;
  px.creaseInk(1.2, { dark: 1.1, lit: 0.6 });
  px.glints(HIDE, { every: 0.25, size: 0.3 });
  yield;
  px.flush();
}

export function* gumberooModelGen(o: { page?: number; den?: number } = {}): Generator<string | void, GumberooModel> {
  const bones = gumberooBones(), bi = (n: string) => bones.findIndex((b) => b.name === n);
  const body = new Body(o.page ?? 512);
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
  body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, levels: 1, k: 1.2,
    skin: (p) => { const w = sk(p); return p[1] < 0.55 && p[2] > -0.6 && p[2] < 0.5 ? [w[0], (w[1] ?? 1) * 0.6, bi('belly'), 0.4] : w; },
    paint: hidePaint }));
  yield 'trunk';
  for (const [S, s] of [['L', 1], ['R', -1]] as const) body.add(eyeball({ name: 'eye' + S, c: mir(GB.eye, s), ax: [s * 0.55, 0.15, 0.82], r: 0.032, bone: bi('eye' + S), iris: AMBER, pupil: 'pin', irisA: 0.75, sclera: RP('basalt'), k: 2, levels: 0, around: 10 }));
  for (const [k, leg] of [['f', GB.fl], ['h', GB.hl]] as const) for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const hip = mir(leg.hip, s), knee = mir(leg.knee, s), sole = mir(leg.sole, s);
    const segL = [Math.hypot(hip[1] - knee[1], hip[2] - knee[2]), Math.hypot(knee[1] - sole[1], knee[2] - sole[2])];
    let rings: LimbRing[] = legRings('pillar', k === 'f', 0.15, [0, 0.5, 1], segL, 0.04);
    rings = rings.map((r) => ({ ...r, r: r.r * (r.t < 0 ? 1.1 : 1) }));
    const out = limb({ name: k + 'leg' + S, side: s, hip, knee, sole, tj: [0, 0.5, 1], rings, around: 12, levels: 1, rise: 0.2,
      foot: { pad: 0.17, h: 0.03, fwd: 0.1, nail: 'nail', lobe: 0.15, toeAround: 5, toes: [-40, 0, 40].map((a) => ({ a, len: 0.02, r: 0.035, claw: 0.04, curl: 0.2, drop: 0.3 })) },
      bones: { parent: bi('root'), up: bi(k + 'u' + S), lo: bi(k + 'l' + S), foot: bi(k + 'f' + S) }, paint: hidePaint, clawPaint: (ch, _p, b) => { const px = new Px(ch, b); for (let i = 0; i < px.n; i++) { px.put(i, ASH, 2 + (h3(i, 1, 1) < 0.2 ? 1 : 0)); px.rough[i] = 200; } px.flush(); }, k: 1 });
    out.toes.levels = 0; out.claws.levels = 0;
    body.add(out.skin); body.add(out.toes); body.add(out.claws);
    yield 'leg';
  }
  const out = yield* body.buildGen({ den: o.den ?? 150, maxScale: 2, budget: 9000 });
  const stats = [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + v).join(' ');
  return { geo: out.geo, tex: out.tex, sd: out.sd, bones, tris: out.tris, den: body.den, stats };
}
export const buildGumberooModel = (o: { page?: number; den?: number } = {}) => runSync(gumberooModelGen(o));
export const buildGumberooModelAsync = (o: { page?: number; den?: number } = {}) => runAsync(gumberooModelGen(o));
export { cl };
