// Procedural tree generator. buildTree(species, seed, { age }) -> TreeModel (see ARCHITECTURE.md "Trees").
//
// Two stages: (1) a deterministic skeleton (trunk rings with irregular cross-sections, root flare and surface roots,
// branches as curves, foliage cards as transforms), (2) geometry emitted from the skeleton at a level of detail:
//   LOD0  full: 8-24-sided trunk, every branch, every card (V-folded alpha cards, bent normals)
//   LOD1  reduced: 6-8-sided trunk, big branches only, ~1/3 of the cards scaled up to keep the coverage
// (the far LOD is an impostor baked by src/world/forest.ts).
// Conventions: metres, Y up, origin at the trunk base on the ground, the tree's "front" is irrelevant (round).
import * as THREE from 'three';
import { Rng, hashStr } from '../core/rng';
import { Noise, smoothstep, clamp, lerp } from '../core/noise';
import { SPECIES, type SpeciesId, type Species } from './species';
import { MeshBuilder, tube, card, v3, rot, type V3, type Col, type Wind } from './geom';
import { cellRect, CELLS } from './textures';
import { createTreeMaterials } from './materials';

export type TreeForm = 'normal' | 'snag' | 'broken' | 'dying';

export interface TreeOpts {
  /** 0 = seedling .. 1 = mature .. 1.3 = veteran giant */
  age?: number;
  form?: TreeForm;
  /** extra moss on the lower trunk (old growth, wet ground) 0..1 */
  moss?: number;
  /** charred lower trunk (burn) 0..1 */
  charred?: number;
}

export interface TrunkSample { y: number; r: number; x: number; z: number }
export interface BranchInfo { id: number; base: THREE.Vector3; dir: THREE.Vector3; len: number; r: number; mass: number }
export interface TreeLod { bark: THREE.BufferGeometry; foliage: THREE.BufferGeometry | null; tris: number }

export interface TreeModel {
  species: SpeciesId;
  seed: number;
  age: number;
  form: TreeForm;
  height: number;
  dbh: number;
  /** total green mass, kg (stem + branches + foliage) */
  mass: number;
  crownMass: number;
  crownCenter: THREE.Vector3;
  lean: THREE.Vector2;
  trunk: TrunkSample[];
  /** mean outer bark radius at height y (0 above the top) */
  radiusAt(y: number): number;
  centerAt(y: number): [number, number];
  /** closed cross-section polygon of the trunk at height y (trunk-local x, z), matches the LOD0 mesh */
  outlineAt(y: number): [number, number][];
  branches: BranchInfo[];
  /** crown radius (max horizontal extent of the foliage) */
  crownRadius: number;
  /** full-detail standalone object: children 'trunk', 'branch_<id>' (wood + foliage), 'crown_misc' */
  object(): THREE.Group;
  /** instancing geometry for a LOD level (0 full, 1 reduced). Cached. */
  lod(level: 0 | 1): TreeLod;
  /** the scale this model was built/scaled at (1 for buildTree) */
  scale: number;
}

// ----------------------------------------------------------------------------------------------- skeleton types
interface Ring { y: number; cx: number; cz: number; r: number; pts: [number, number][] }
interface Br {
  id: number;
  part: number;      // object part index (0 = trunk, 1.. = limbable branches, last = misc)
  pts: V3[];
  radii: number[];
  level: number;
  dead: boolean;
  wx: number;        // trunk sway weight at the base
  phase: number;
  len: number;
  col: Col;
  moss: number;
}
interface Cd {
  part: number;
  p: V3; d: V3; n: V3; len: number; wid: number; cell: number; fold: number;
  bend: V3; col: Col; colTip: Col;
  wb: Wind; wt: Wind;
  keep1: boolean;
  flipV: boolean;
}

interface Skeleton {
  sp: Species;
  H: number; Htop: number; dbh: number;
  rings: Ring[];
  sides: number;
  roots: Br[];
  branches: Br[];
  cards: Cd[];
  parts: number;          // number of object parts (trunk + limbs + misc)
  limbs: BranchInfo[];
  trunkWrap: number[];    // per ring: texture wraps
  trunkCol: Col[];
  trunkMoss: number[];
  trunkWind: Wind[];
  crownCenter: V3;
  crownMass: number;
  mass: number;
  crownRadius: number;
  lean: THREE.Vector2;
  /** bark scars: angle (rad), half width (rad), y0..y1 (m), kind 0 = bleached wood (frost crack / old wound), 1 = charred catface */
  scars: { a: number; w: number; y0: number; y1: number; kind: number }[];
}

const UP = new THREE.Vector3(0, 1, 0);

// ----------------------------------------------------------------------------------------------- build
export function buildTree(species: SpeciesId, seed: number, opts: TreeOpts = {}): TreeModel {
  const sk = skeleton(species, seed, opts);
  return makeModel(species, seed, opts, sk, 1);
}

function skeleton(species: SpeciesId, seed: number, opts: TreeOpts): Skeleton {
  const sp = SPECIES[species];
  const rng = new Rng((hashStr(species) ^ Math.imul(seed + 1, 2654435761)) >>> 0);
  const noise = new Noise((seed * 31 + hashStr(species)) >>> 0);
  const form: TreeForm = opts.form ?? 'normal';
  const age = clamp(opts.age ?? 0.75, 0.02, 1.35);
  const dead = form === 'snag';

  // ---------------------------------------------------------------- size
  const Hm = rng.range(sp.height[0], sp.height[1]);
  const H = age <= 1 ? Hm * (0.05 + 0.95 * Math.pow(age, 0.8)) : Hm * (1 + (age - 1) * 0.55);
  const Dm = rng.range(sp.dbh[0], sp.dbh[1]);
  let dbh = age <= 1 ? Dm * Math.pow(age, 1.2) : Dm * (1 + (age - 1) * 1.6);
  dbh = Math.max(dbh, H * 0.011, 0.012);
  const rB = dbh / 2;
  const small = clamp(H / 14, 0.32, 1.15); // size factor for cards / spacing
  const young = 1 - smoothstep(0.15, 0.55, age);

  let broken = form === 'broken' || (form === 'snag' && rng.chance(0.7));
  if (form === 'normal' && age > 0.6 && rng.chance(sp.brokenTopChance * 0.5)) broken = true;
  const cbGuess = (1 - sp.crownRatio) * H;
  const Htop = broken ? (dead ? H * rng.range(0.45, 0.85) : Math.max(H * rng.range(0.55, 0.85), cbGuess + (H - cbGuess) * 0.45)) : H;
  // cedar veterans: dead spike top above a living candelabra crown
  const spike = species === 'cedar' && age > 0.85 && !dead && rng.chance(0.55);
  const liveTop = spike ? Htop * rng.range(0.78, 0.88) : Htop;

  // ---------------------------------------------------------------- centreline: lean + sweep + wobble
  const la = rng.range(0, Math.PI * 2);
  const lm = rng.chance(0.15) ? rng.range(0.025, 0.06) : rng.range(0, 0.022);
  const lean = new THREE.Vector2(Math.cos(la) * lm, Math.sin(la) * lm);
  const crook = species === 'pine' ? 0.022 : species === 'birch' ? 0.018 : 0.008;
  const swA = rng.range(0.3, 1) * crook * H, swPh = rng.range(0, 6.28), swK = rng.range(0.8, 1.8);
  const swDir = rng.range(0, Math.PI * 2);
  const cOff = (y: number): [number, number] => {
    const t = y / H;
    const s = swA * (Math.sin(t * Math.PI * swK + swPh) - Math.sin(swPh));
    const wx = 0.012 * H * noise.n2(t * 4, 1.3) * t, wz = 0.012 * H * noise.n2(t * 4, 7.1) * t;
    return [lean.x * y + Math.cos(swDir) * s + wx, lean.y * y + Math.sin(swDir) * s + wz];
  };

  // ---------------------------------------------------------------- stem radius profile
  const k = sp.taper;
  const yb = Math.min(1.3, H * 0.12);
  const rTaper = (y: number): number => {
    if (y <= yb) return rB * (1 + 0.05 * (yb - y) / Math.max(0.1, yb));
    const t = clamp((H - y) / (H - yb), 0, 1);
    return Math.max(0.003, rB * Math.pow(t, k) * (1 - 0.15 * (1 - t) * (1 - t)) + 0.002);
  };
  const flareAmp = sp.flare * clamp(dbh / 0.35, 0.25, 1.15) * (age > 1 ? 1.2 : 1);
  const flareH = sp.flareHeight * clamp(dbh / 0.5, 0.5, 1.4);
  const flareW = (y: number) => flareAmp * Math.exp(-Math.max(0, y) / flareH * 1.7);
  const nLobes = rng.int(sp.lobes[0], sp.lobes[1]);
  const lobeAng: number[] = [], lobeAmp: number[] = [];
  for (let i = 0; i < nLobes; i++) {
    lobeAng.push((i / nLobes) * Math.PI * 2 + rng.range(-0.35, 0.35));
    lobeAmp.push(rng.range(0.5, 1.25));
  }
  const lobeW = (Math.PI / nLobes) * 0.55;
  const ecc = rng.range(0.02, 0.06), ecA = rng.range(0, 6.28), ec3 = rng.range(0, 6.28);
  const fluteK = species === 'cedar' ? rng.int(11, 16) : 0;
  const prof = (a: number, y: number): number => {
    let m = 1 + ecc * Math.cos(2 * a + ecA) + 0.025 * Math.cos(3 * a + ec3);
    let lob = 0;
    for (let i = 0; i < nLobes; i++) {
      const d = Math.atan2(Math.sin(a - lobeAng[i]), Math.cos(a - lobeAng[i]));
      lob += lobeAmp[i] * Math.exp(-(d / lobeW) * (d / lobeW));
    }
    m += flareW(y) * (lob * 0.9 - 0.35);
    if (fluteK) m += 0.045 * Math.exp(-Math.max(0, y) / (flareH * 2.5)) * Math.cos(a * fluteK + y * 0.15);
    m += 0.03 * noise.n2(Math.cos(a) * 1.6 + y * 0.5, Math.sin(a) * 1.6 - y * 0.3);
    return m;
  };
  const meanR = (y: number) => rTaper(y) * (1 + flareW(y) * 0.55);

  // ---------------------------------------------------------------- rings
  const sides = dbh > 0.14 ? 24 : dbh > 0.06 ? 14 : 8;
  const ys: number[] = [-0.5];
  const base = [0, 0.06, 0.14, 0.25, 0.4, 0.6, 0.85, 1.15, 1.5];
  for (const b of base) if (b < Htop * 0.5) ys.push(b * Math.max(1, flareH / 0.7) * (H < 4 ? 0.5 : 1));
  const step = H < 4 ? Math.max(0.12, H / 14) : Math.max(0.55, H / 30);
  let yy = ys[ys.length - 1] + step;
  while (yy < Htop - step * 0.4) { ys.push(yy); yy += step * rng.range(0.85, 1.15); }
  ys.push(Htop);
  const rings: Ring[] = [];
  for (const y of ys) {
    const [cx, cz] = cOff(Math.max(0, y));
    const r = meanR(Math.max(0, y));
    const pts: [number, number][] = [];
    let sum = 0;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const R = r * prof(a, Math.max(0, y));
      sum += R;
      pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
    rings.push({ y, cx, cz, r: sum / sides, pts });
  }
  // jagged broken top
  if (broken || spike || Htop < H) {
    const last = rings[rings.length - 1];
    const rr = last.r;
    last.r = rr;
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const R = meanR(Htop) * prof(a, Htop) * rng.range(0.7, 1.0);
      last.pts[j] = [last.cx + Math.cos(a) * R, last.cz + Math.sin(a) * R];
    }
  }
  const crownBaseFrac = lerp(1 - sp.crownRatio, 0.04, young);
  const crownBase = (dead ? Math.max(crownBaseFrac, 0.2) : crownBaseFrac) * H;
  const crownR = sp.crownWidth * H * lerp(1, 1.45, young) * rng.range(0.88, 1.12);
  const trunkWx = (y: number) => Math.pow(clamp(y / H, 0, 1), 2) * H * sp.flex;

  // trunk colour / moss / wind per ring
  const barkTile = sp.barkTile;
  const mossBase = clamp((opts.moss ?? 0) + { spruce: 0.35, fir: 0.3, pine: 0.12, birch: 0.15, cedar: 0.55 }[species] * clamp(dbh / 0.4, 0.3, 1.2), 0, 1.2);
  const charred = opts.charred ?? 0;
  const charH = rng.range(1.5, 5) * charred;
  const trunkCol: Col[] = [], trunkMoss: number[] = [], trunkWind: Wind[] = [], trunkWrap: number[] = [];
  let wrap = Math.max(1, Math.round((2 * Math.PI * rings[1].r) / barkTile[0]));
  for (const rg of rings) {
    const y = Math.max(0, rg.y);
    let ao = 0.6 + 0.4 * smoothstep(-0.3, 1.4, rg.y);
    if (sp.conifer && y > crownBase && species !== 'pine') ao *= lerp(1, 0.82, smoothstep(crownBase, crownBase + 2, y));
    const ut = smoothstep(crownBase * 0.6, crownBase + (H - crownBase) * 0.3, y);
    let col: Col = [lerp(1, sp.upperBarkTint[0], ut) * ao, lerp(1, sp.upperBarkTint[1], ut) * ao, lerp(1, sp.upperBarkTint[2], ut) * ao];
    if (dead) col = [col[0] * 0.92 + 0.04, col[1] * 0.92 + 0.04, col[2] * 0.95 + 0.05];
    if (charred > 0 && y < charH) {
      const t = 1 - smoothstep(charH * 0.5, charH, y);
      col = [lerp(col[0], 0.13, t), lerp(col[1], 0.12, t), lerp(col[2], 0.12, t)];
    }
    trunkCol.push(col);
    trunkMoss.push(mossBase * (1 - smoothstep(0, 1.2 + 2.2 * mossBase, y)) + 0.12 * mossBase);
    trunkWind.push([trunkWx(y), 0, 0, 0]);
    const ideal = (2 * Math.PI * rg.r) / barkTile[0];
    if (Math.abs(ideal - wrap) > 0.8 && wrap > 1) wrap = Math.max(1, Math.round(ideal));
    trunkWrap.push(wrap);
  }

  const centerAt = (y: number): [number, number] => cOff(clamp(y, 0, Htop));
  const radiusAtY = (y: number): number => {
    if (y > Htop) return 0;
    for (let i = 1; i < rings.length; i++) {
      if (rings[i].y >= y) {
        const a = rings[i - 1], b = rings[i];
        const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
        return lerp(a.r, b.r, clamp(t, 0, 1));
      }
    }
    return rings[rings.length - 1].r;
  };

  // ---------------------------------------------------------------- roots (surface roots radiating from the flare)
  const roots: Br[] = [];
  if (dbh > 0.12 && !(H < 3)) {
    for (let i = 0; i < nLobes; i++) {
      if (lobeAmp[i] < 0.7 && rng.chance(0.4)) continue;
      const a = lobeAng[i] + rng.range(-0.08, 0.08);
      const hd = v3(Math.cos(a), 0, Math.sin(a));
      const side = v3(-hd.z, 0, hd.x);
      const len = rB * rng.range(2.2, 4.2) * lobeAmp[i] + 0.3;
      const r0 = rB * 0.32 * lobeAmp[i] * (0.6 + 0.4 * flareAmp);
      const y0 = Math.min(0.35, rB * 0.8) * lobeAmp[i];
      const pts: V3[] = [], radii: number[] = [];
      const wig = rng.range(-1, 1);
      const n = 7;
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const p = hd.clone().multiplyScalar(rB * 0.55 + t * len)
          .addScaledVector(UP, y0 * Math.pow(1 - t, 1.7) - 0.12 * t - 0.02)
          .addScaledVector(side, wig * 0.18 * len * t * t);
        pts.push(p);
        radii.push(r0 * Math.pow(1 - t * 0.92, 1.1) + 0.012);
      }
      roots.push({ id: -1, part: 0, pts, radii, level: 0, dead: false, wx: 0, phase: 0, len, col: [0.72, 0.7, 0.68], moss: mossBase * 0.75 + 0.05 });
    }
  }

  // ---------------------------------------------------------------- branches + cards
  const branches: Br[] = [];
  const cards: Cd[] = [];
  const limbs: BranchInfo[] = [];
  let nextPart = 1;
  const MISC = -1; // resolved at the end
  const cellsOf = CELLS[species];
  const cardScale = clamp(0.5 + small * 0.5, 0.45, 1.05);
  const dying = form === 'dying';
  const dyingTint: Col = [1.25, 0.72, 0.38];

  const trunkPoint = (y: number, az: number, inset = 0.85): V3 => {
    const [cx, cz] = centerAt(y);
    const R = radiusAtY(y) * inset;
    return v3(cx + Math.cos(az) * R, y, cz + Math.sin(az) * R);
  };
  const axisAt = (y: number): V3 => { const [cx, cz] = centerAt(y); return v3(cx, y, cz); };

  const addCard = (part: number, p: V3, d: V3, n: V3, len: number, wid: number, cell: number,
    wxv: number, wy0: number, wy1: number, phase: number, ao: number, tint: Col, keep1: boolean) => {
    // bent normal: away from the crown axis with an upward bias
    const ax = axisAt(clamp(p.y, 0, H));
    const out = p.clone().sub(ax);
    out.y = out.y * 0.3 + Math.max(0.25, out.length() * 0.35);
    out.normalize();
    let col: Col = [tint[0] * ao, tint[1] * ao, tint[2] * ao];
    if (dying) col = [col[0] * dyingTint[0], col[1] * dyingTint[1], col[2] * dyingTint[2]];
    const colTip: Col = [col[0] * 1.07, col[1] * 1.09, col[2] * 1.04];
    cards.push({
      part, p, d: d.clone().normalize(), n: n.clone().normalize(), len, wid, cell, fold: rng.range(-0.45, 0.35),
      bend: out, col, colTip,
      wb: [wxv, wy0, 0.12, phase], wt: [wxv, wy1, 1, phase],
      keep1, flipV: rng.chance(0.5),
    });
  };
  const cardTint = (): Col => {
    const b = rng.range(0.84, 1.12), h = rng.range(-0.06, 0.06);
    return [sp.foliageTint[0] * b * (1 + h), sp.foliageTint[1] * b, sp.foliageTint[2] * b * (1 - h)];
  };
  const pathOf = (base: V3, az: number, el: number, L: number, droop: number, upturn: number, crookA: number, n: number): V3[] => {
    const hd = v3(Math.cos(az), 0, Math.sin(az));
    const sd = v3(-hd.z, 0, hd.x);
    const ph = rng.range(0, 6.28);
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const y = L * s * Math.sin(el) - droop * L * s * s + upturn * L * Math.pow(Math.max(0, s - 0.45), 2) * 1.6;
      const h = L * s * Math.cos(el);
      const lat = crookA * L * Math.sin(s * Math.PI * 2 + ph) * s;
      pts.push(base.clone().addScaledVector(hd, h).addScaledVector(UP, y).addScaledVector(sd, lat));
    }
    return pts;
  };
  const tangentAt = (pts: V3[], s: number): V3 => {
    const i = clamp(Math.floor(s * (pts.length - 1)), 0, pts.length - 2);
    return pts[i + 1].clone().sub(pts[i]).normalize();
  };
  const pointAt = (pts: V3[], s: number): V3 => {
    const f = s * (pts.length - 1);
    const i = clamp(Math.floor(f), 0, pts.length - 2);
    return pts[i].clone().lerp(pts[i + 1], f - i);
  };
  const crownEnv = (hrel: number): number => {
    const w = sp.crownWidest;
    if (hrel < w) return lerp(0.72, 1, hrel / Math.max(1e-3, w));
    return Math.pow(clamp((1 - hrel) / (1 - w), 0, 1), sp.crownShape);
  };
  const branchR = (y: number, L: number) => Math.min(radiusAtY(y) * 0.42, 0.006 + L * (sp.conifer ? 0.022 : 0.03));
  const newLimb = (br: Br, r: number): number => {
    if (r < 0.014 || br.len < 0.6) return MISC;
    const id = limbs.length;
    br.id = id;
    const part = nextPart++;
    const dir = br.pts[Math.min(1, br.pts.length - 1)].clone().sub(br.pts[0]).normalize();
    limbs.push({ id, base: br.pts[0].clone(), dir, len: br.len, r, mass: 0 });
    return part;
  };
  const limbMass = new Map<number, number>();
  const addMass = (part: number, m: number) => limbMass.set(part, (limbMass.get(part) ?? 0) + m);

  const barkColAt = (y: number): Col => {
    const i = Math.max(0, rings.findIndex((r) => r.y >= y));
    const c = trunkCol[i] ?? trunkCol[trunkCol.length - 1];
    return [c[0] * 0.92, c[1] * 0.92, c[2] * 0.92];
  };

  // ---- conifer foliage along a branch (spruce, fir, pine sprays)
  const coniferCards = (br: Br, part: number, hrel: number, L: number, lower: boolean) => {
    const cl = sp.card[0] * cardScale * clamp(0.62 + L * 0.2, 0.6, 1.12) * rng.range(0.88, 1.08);
    const cw = sp.card[1] * cardScale * clamp(0.62 + L * 0.2, 0.6, 1.12);
    const folDepth = (1.1 + 0.9 * cl) * (species === 'fir' ? 1.15 : 1);
    const sFol = clamp(1 - folDepth / L, 0.0, 0.75);
    const stepS = (cl * (species === 'pine' ? 0.62 : 0.5)) / sp.leafDensity / L;
    const wy = (s: number) => Math.pow(s, 1.4) * L * 0.14;
    let k = 0;
    for (let s = 1; s >= sFol - 1e-6; s -= stepS, k++) {
      const p = pointAt(br.pts, s);
      const t = tangentAt(br.pts, Math.min(0.999, s));
      const sideAx = t.clone().cross(UP).normalize();
      const upL = sideAx.clone().cross(t).normalize(); // local up, perpendicular to the branch
      const ax = axisAt(p.y);
      const radial = clamp(Math.hypot(p.x - ax.x, p.z - ax.z) / Math.max(0.2, crownR * crownEnv(hrel) + 0.2), 0, 1);
      let ao = (0.6 + 0.4 * Math.pow(radial, 0.8)) * lerp(0.8, 1.0, hrel);
      if (k === 0) ao = Math.min(1.08, ao + 0.12);
      const keep = (cards.length * 7919 + seed) % 100 < 36;
      if (k === 0) {
        // tip spray, continuing the branch
        const d = rot(t, upL, rng.range(-0.2, 0.2));
        const base = p.clone().addScaledVector(d, -cl * 0.45);
        addCard(part, base, d, rot(upL, d, rng.range(-0.5, 0.5)), cl, cw, rng.pick(cellsOf.tip.concat(cellsOf.live)), br.wx, wy(s - 0.1), wy(1) + cl * 0.15, br.phase, ao, cardTint(), true);
        continue;
      }
      const inner = s < 0.55 && L > 1.2;
      const nSide = species === 'pine' ? 1 : 2;
      for (let q = 0; q < nSide; q++) {
        const sgn = nSide === 1 ? (k % 2 ? 1 : -1) : q === 0 ? 1 : -1;
        let d = rot(t, upL, sgn * rng.range(0.45, 0.95));
        let cell = inner ? rng.pick(cellsOf.inner) : rng.pick(cellsOf.live);
        if (lower && species === 'spruce' && rng.chance(0.45)) {
          d = rot(d, sideAx, -rng.range(0.25, 0.7));
          cell = rng.pick(cellsOf.pendant);
        }
        if (species === 'spruce' && rng.chance(0.06)) cell = rng.pick(cellsOf.cones);
        if (species === 'fir' && hrel > 0.75 && rng.chance(0.12)) cell = rng.pick(cellsOf.cones);
        const n = rot(upL, d, rng.range(-0.55, 0.55) + sgn * 0.25);
        const sz = rng.range(0.85, 1.08);
        addCard(part, p.clone().addScaledVector(t, -cl * 0.1), d, n, cl * sz, cw * sz, cell, br.wx, wy(s), wy(s) + cl * 0.12, br.phase, ao, cardTint(), keep);
      }
      // a forward card riding on the branch (bottle-brush depth), every other station
      if (species !== 'pine' && k % 2 === 0 && s > sFol + stepS) {
        const d = rot(t, upL, rng.range(-0.25, 0.25));
        const n = rot(upL, d, rng.range(-1.2, 1.2));
        addCard(part, p.clone().addScaledVector(t, -cl * 0.3), d, n, cl * 0.9, cw * 0.9, rng.pick(cellsOf.live), br.wx, wy(s), wy(s) + cl * 0.1, br.phase, ao * 0.95, cardTint(), (k / 2) % 3 === 0);
      }
    }
  };

  // ---- pine tufts at tips
  const pineTuft = (part: number, p: V3, t: V3, wxv: number, wy0: number, phase: number, ao: number, scale = 1) => {
    const cl = sp.card[0] * cardScale * 1.05 * scale, cw = sp.card[1] * cardScale * 1.1 * scale;
    const n0 = rng.int(4, 5);
    for (let i = 0; i < n0; i++) {
      const ax = rot(UP, t, (i / n0) * Math.PI * 2 + rng.range(-0.3, 0.3));
      const d = rot(t, ax.clone().cross(t).normalize(), rng.range(0.15, 0.6)).normalize();
      const n = rot(ax, d, rng.range(-0.3, 0.3));
      addCard(part, p.clone().addScaledVector(d, -cl * 0.35), d, n, cl, cw, rng.pick(cellsOf.live), wxv, wy0, wy0 + cl * 0.15, phase, ao, cardTint(), i === 0);
    }
  };

  // ---- dead branch (stub or twiggy dead limb with lichen)
  const deadBranch = (y: number, az: number, Lnom: number) => {
    const stub = species === 'pine' || species === 'birch' ? rng.chance(0.75) : rng.chance(0.35 + 0.4 * (1 - sp.deadBranches));
    const L = stub ? rng.range(0.08, 0.35) * Math.min(1, Lnom + 0.3) : Math.min(1.8, Lnom * rng.range(0.4, 0.95));
    if (L < 0.05) return;
    const el = rng.range(-0.45, 0.1);
    const base = trunkPoint(y, az, 0.8);
    const pts = pathOf(base, az, el, L, 0.08, 0, 0.06, stub ? 2 : 4);
    const r = Math.min(radiusAtY(y) * 0.3, stub ? rng.range(0.008, 0.025) : 0.006 + L * 0.008);
    const br: Br = { id: -1, part: MISC, pts, radii: pts.map((_, i) => r * (1 - 0.75 * i / (pts.length - 1)) + 0.002), level: 0, dead: true,
      wx: trunkWx(y), phase: rng.next(), len: L, col: [0.82, 0.8, 0.78], moss: mossBase * 0.5 };
    br.part = newLimb(br, r);
    branches.push(br);
    addMass(br.part, Math.PI * r * r * L / 3 * sp.density);
    if (!stub && L > 0.4 && (sp.conifer || rng.chance(0.3))) {
      const nC = Math.max(1, Math.round(L / 0.45));
      for (let i = 0; i < nC; i++) {
        const s = 1 - i / nC * 0.75;
        const p = pointAt(pts, s);
        const t = tangentAt(pts, Math.min(0.99, s));
        const d = rot(t, UP, rng.range(-0.8, 0.8));
        const lich = sp.lichen > 0 && rng.chance(sp.lichen * 0.7);
        const cell = lich ? rng.pick(cellsOf.lichen) : rng.pick(cellsOf.dead);
        const cl = sp.card[0] * cardScale * rng.range(0.75, 1.0);
        addCard(br.part, p.clone().addScaledVector(d, -cl * 0.4), d, rot(UP, d, rng.range(-0.6, 0.6)), cl, cl * 0.5, cell,
          br.wx, 0.02, 0.06, br.phase, 0.85, [1, 1, 1], i === 0);
      }
    }
  };

  // ---- living conifer branch from the trunk
  const coniferBranch = (y: number, az: number, scaleL = 1, interwhorl = false) => {
    const hrel = clamp((y - crownBase) / Math.max(0.5, liveTop - crownBase), 0, 1);
    let L = crownR * crownEnv(hrel) * rng.range(0.85, 1.12) * scaleL;
    L = Math.max(L, 0.12 * small);
    if (y > liveTop - 0.25) L *= 0.5;
    const el = lerp(sp.branchAngle[0], sp.branchAngle[1], Math.pow(hrel, 0.8)) * lerp(1, 0.4, young * 0.5) + rng.range(-0.12, 0.12);
    const base = trunkPoint(y, az, 0.8);
    const n = L > 1.5 ? 7 : L > 0.6 ? 5 : 3;
    const droop = sp.droop * (1 - 0.6 * hrel) * (species === 'spruce' && hrel < 0.4 ? 1.4 : 1);
    const pts = pathOf(base, az, el, L, droop, sp.upturn * (1 - hrel * 0.5), species === 'pine' ? 0.08 : 0.025, n);
    const r = branchR(y, L) * (interwhorl ? 0.6 : 1);
    const radii = pts.map((_, i) => r * Math.pow(1 - i / (pts.length - 1), 0.85) * 0.92 + 0.0025);
    const br: Br = { id: -1, part: MISC, pts, radii, level: 0, dead: false, wx: trunkWx(y), phase: rng.next(), len: L, col: barkColAt(y), moss: mossBase * 0.3 };
    br.part = newLimb(br, r);
    branches.push(br);
    addMass(br.part, Math.PI * r * r * L / 3 * sp.density);
    if (dead) return;
    const before = cards.length;
    if (species === 'pine') {
      // forks with needle tufts at every tip
      const tips: { p: V3; t: V3; s: number }[] = [{ p: pts[pts.length - 1], t: tangentAt(pts, 0.999), s: 1 }];
      const nf = L > 0.8 ? rng.int(3, 5) : L > 0.4 ? 2 : 1;
      for (let f = 0; f < nf; f++) {
        const s = rng.range(0.35, 0.9);
        const p = pointAt(pts, s);
        const t = tangentAt(pts, s);
        const d = rot(t, UP, (f % 2 ? 1 : -1) * rng.range(0.5, 1.0));
        d.y += rng.range(0.05, 0.4);
        d.normalize();
        const ln = (1 - s) * L * rng.range(0.5, 0.85) + 0.15;
        const sp2 = [p, p.clone().addScaledVector(d, ln * 0.5).addScaledVector(UP, ln * 0.06), p.clone().addScaledVector(d, ln).addScaledVector(UP, ln * 0.16)];
        branches.push({ id: -1, part: br.part, pts: sp2, radii: [r * 0.45, r * 0.3, r * 0.15 + 0.002], level: 1, dead: false, wx: br.wx, phase: br.phase, len: ln, col: br.col, moss: 0 });
        tips.push({ p: sp2[2], t: sp2[2].clone().sub(sp2[1]).normalize(), s });
        if (ln > 0.5) {
          // a sub-fork from the fork
          const q0 = sp2[1];
          const d2 = rot(d, UP, (f % 2 ? -1 : 1) * rng.range(0.5, 0.9));
          d2.y += rng.range(0.1, 0.4);
          d2.normalize();
          const l2 = ln * rng.range(0.4, 0.6);
          const q2 = q0.clone().addScaledVector(d2, l2);
          branches.push({ id: -1, part: br.part, pts: [q0, q0.clone().lerp(q2, 0.5), q2], radii: [r * 0.25, r * 0.15, 0.002], level: 1, dead: false, wx: br.wx, phase: br.phase, len: l2, col: br.col, moss: 0 });
          tips.push({ p: q2, t: d2.clone(), s: (s + 1) / 2 });
        }
      }
      const ao0 = lerp(0.8, 1.05, hrel);
      for (const tp of tips) pineTuft(br.part, tp.p, tp.t, br.wx, Math.pow(tp.s, 1.4) * L * 0.14, br.phase, ao0, tp.s === 1 ? 1.1 : 0.9);
      if (L > 0.7) coniferCards(br, br.part, hrel, L, false);
    } else {
      coniferCards(br, br.part, hrel, L, hrel < 0.35);
    }
    addMass(br.part, (cards.length - before) * 0.12 * sp.card[0] * sp.card[1] * 8);
  };

  // ---- deciduous (birch) recursive branch
  const decidBranch = (part: number, level: number, base: V3, dir: V3, L: number, r: number, wxv: number, phase: number, hrel: number) => {
    const n = level === 0 ? 7 : 4;
    const pts: V3[] = [];
    const g = level === 0 ? 0.22 : 0.35;
    let p = base.clone(), d = dir.clone();
    const seg = L / n;
    for (let i = 0; i <= n; i++) {
      pts.push(p.clone());
      // phototropism early, gravity late (birch: graceful drooping tips)
      d.addScaledVector(UP, i < n * 0.3 ? 0.03 : -g * (i / n));
      d.add(v3(rng.range(-0.12, 0.12), rng.range(-0.05, 0.05), rng.range(-0.12, 0.12))).normalize();
      p = p.clone().addScaledVector(d, seg);
    }
    const radii = pts.map((_, i) => r * Math.pow(1 - i / (pts.length - 1) * 0.85, 1.1) + 0.002);
    branches.push({ id: -1, part, pts, radii, level, dead: false, wx: wxv, phase, len: L, col: level === 0 ? [0.95, 0.95, 0.95] : [0.55, 0.42, 0.38], moss: 0 });
    if (dead) return;
    const wy = (s: number) => Math.pow(s, 1.3) * L * 0.18 + (level > 0 ? 0.15 : 0);
    if (level < 1 && L > 0.6) {
      const nk = Math.max(2, Math.round(L / 0.42));
      for (let i = 0; i < nk; i++) {
        const s = 0.22 + 0.73 * (i + rng.range(0, 0.6)) / nk;
        const pp = pointAt(pts, s), t = tangentAt(pts, s);
        const side = rot(t.clone().cross(UP).normalize(), t, i * 2.4 + rng.range(-0.4, 0.4));
        const cd = t.clone().multiplyScalar(0.55).addScaledVector(side, 0.85).normalize();
        decidBranch(part, level + 1, pp, cd, (1 - s) * L * rng.range(0.45, 0.7) + 0.35, r * 0.45, wxv, (phase + i * 0.17) % 1, hrel);
      }
    }
    // leaf clusters along the outer part of this branch
    const cl = sp.card[0] * cardScale * rng.range(0.85, 1.1), cw = sp.card[1] * cardScale;
    const s0 = level === 0 ? 0.4 : 0.05;
    const stepS = Math.max(0.08, (cl * 0.36) / L);
    for (let s = 1; s >= s0; s -= stepS) {
      const pp = pointAt(pts, s), t = tangentAt(pts, Math.min(0.99, s));
      const tw = rot(t, UP, rng.range(-1.2, 1.2));
      tw.y -= rng.range(0, 0.5);
      tw.normalize();
      const nrm = rot(UP, tw, rng.range(-0.8, 0.8));
      const ax = axisAt(pp.y);
      const radial = clamp(Math.hypot(pp.x - ax.x, pp.z - ax.z) / (crownR + 0.3), 0, 1);
      const ao = (0.62 + 0.38 * radial) * lerp(0.8, 1.05, hrel);
      addCard(part, pp.clone().addScaledVector(tw, -cl * 0.2), tw, nrm, cl, cw, s > 0.9 ? rng.pick(cellsOf.tip.concat(cellsOf.live)) : rng.pick(cellsOf.live.concat(cellsOf.inner)),
        wxv, wy(s), wy(s) + cl * 0.2, phase, ao, cardTint(), rng.chance(0.4));
    }
  };

  // ---- cedar: J-shaped down-sweeping branches with hanging curtains of fronds
  const cedarBranch = (y: number, az: number, reit = false) => {
    const hrel = clamp((y - crownBase) / Math.max(0.5, liveTop - crownBase), 0, 1);
    let L = crownR * crownEnv(hrel) * rng.range(0.8, 1.15);
    L = Math.max(L, 0.2 * small);
    const el = reit ? rng.range(1.0, 1.25) : lerp(sp.branchAngle[0], sp.branchAngle[1], hrel) + rng.range(-0.15, 0.15);
    if (reit) L = H * rng.range(0.1, 0.16);
    const base = trunkPoint(y, az, 0.8);
    const pts = pathOf(base, az, el, L, reit ? 0 : sp.droop * (1 - 0.5 * hrel), reit ? 0.6 : sp.upturn, 0.05, L > 2 ? 8 : 5);
    const r = branchR(y, L) * (reit ? 1.6 : 1);
    const radii = pts.map((_, i) => r * Math.pow(1 - i / (pts.length - 1), 0.8) * 0.92 + 0.003);
    const br: Br = { id: -1, part: MISC, pts, radii, level: 0, dead: false, wx: trunkWx(y), phase: rng.next(), len: L, col: barkColAt(y), moss: mossBase * 0.4 };
    br.part = newLimb(br, r);
    branches.push(br);
    addMass(br.part, Math.PI * r * r * L / 3 * sp.density);
    if (dead) return;
    const before = cards.length;
    const cs = clamp(L / 2.6, 0.85, 1.7);
    const cl = sp.card[0] * cardScale * rng.range(0.85, 1.1) * cs, cw = sp.card[1] * cardScale * cs;
    const wy = (s: number) => Math.pow(s, 1.3) * L * 0.16;
    // hanging laterals along the outer part
    const nLat = reit ? 0 : Math.max(1, Math.round(L / 0.36));
    for (let i = 0; i < nLat; i++) {
      const s = 0.3 + 0.68 * (i + rng.range(0, 0.7)) / nLat;
      const p = pointAt(pts, s), t = tangentAt(pts, s);
      const out = v3(t.x, 0, t.z).normalize();
      const sd = v3(-out.z, 0, out.x).multiplyScalar(i % 2 ? 1 : -1);
      const hl = rng.range(0.35, 0.9) * clamp(L / 2, 0.4, 1.3);
      const dir = out.clone().multiplyScalar(0.35).addScaledVector(sd, 0.45).addScaledVector(UP, -0.85).normalize();
      const q1 = p.clone().addScaledVector(dir, hl);
      branches.push({ id: -1, part: br.part, pts: [p, p.clone().lerp(q1, 0.5).addScaledVector(out, 0.05), q1], radii: [r * 0.3, r * 0.2, 0.002], level: 1, dead: false, wx: br.wx, phase: br.phase, len: hl, col: br.col, moss: 0 });
      const ax = axisAt(p.y);
      const radial = clamp(Math.hypot(p.x - ax.x, p.z - ax.z) / (crownR + 0.3), 0, 1);
      const ao = (0.55 + 0.45 * radial) * lerp(0.78, 1.05, hrel);
      // fronds hanging from the lateral, fanning sideways
      const nF = rng.int(3, 4);
      for (let f = 0; f < nF; f++) {
        const ff = f / nF;
        const pp = p.clone().lerp(q1, ff * 0.7);
        const d = dir.clone().addScaledVector(sd, rng.range(-0.6, 0.6)).addScaledVector(out, rng.range(0, 0.4)).normalize();
        const nrm = out.clone().addScaledVector(UP, 0.3).normalize();
        addCard(br.part, pp, d, rot(nrm, d, rng.range(-0.5, 0.5)), cl * rng.range(0.8, 1.05), cw, rng.pick(cellsOf.pendant.concat(cellsOf.live)),
          br.wx, wy(s) + 0.05, wy(s) + cl * 0.25, br.phase, ao, cardTint(), f === 0);
      }
    }
    // upturned sprays along the tip
    const tipN = Math.max(1, Math.round((L * 0.35) / (cl * 0.5)));
    for (let i = 0; i < tipN; i++) {
      const s = 1 - (i / tipN) * 0.35;
      const p = pointAt(pts, s), t = tangentAt(pts, Math.min(0.99, s));
      const d = rot(t, UP, rng.range(-0.6, 0.6));
      addCard(br.part, p.clone().addScaledVector(d, -cl * (i === 0 ? 0.4 : 0.15)), d, rot(UP, d, rng.range(-0.5, 0.5)), cl, cw, rng.pick(i === 0 ? cellsOf.tip : cellsOf.live),
        br.wx, wy(s), wy(s) + cl * 0.15, br.phase, lerp(0.85, 1.05, hrel), cardTint(), i === 0);
    }
    if (reit) {
      // a reiterated leader carries its own little crown of hanging fronds
      for (let i = 0; i < 6; i++) {
        const s = 0.25 + i * 0.12;
        const p = pointAt(pts, s);
        const az2 = rng.range(0, 6.28);
        const d = v3(Math.cos(az2), -0.5, Math.sin(az2)).normalize();
        addCard(br.part, p, d, rot(UP, d, 0.3), cl, cw, rng.pick(cellsOf.pendant), br.wx, wy(s), wy(s) + 0.2, br.phase, 0.9, cardTint(), i % 2 === 0);
      }
    }
    addMass(br.part, (cards.length - before) * 0.15);
  };

  // ---------------------------------------------------------------- populate the crown
  const deadZoneTop = crownBase;
  if (sp.conifer && species !== 'cedar') {
    const ws = sp.whorlSpacing * clamp(H / 18, 0.45, 1.2) * rng.range(0.9, 1.1);
    let y = Math.max(0.3, H * 0.04);
    let wi = 0;
    while (y < liveTop - 0.12) {
      const n = rng.int(sp.branchesPerWhorl[0], sp.branchesPerWhorl[1]);
      const az0 = rng.range(0, Math.PI * 2);
      const live = y >= deadZoneTop && !dead;
      for (let i = 0; i < n; i++) {
        const az = az0 + (i / n) * Math.PI * 2 + rng.range(-0.35, 0.35);
        if (live) coniferBranch(y, az);
        else {
          // keep fewer dead limbs near the ground in old trees (they rot off), more near the crown
          const hr = y / Math.max(0.5, deadZoneTop);
          const keepP = sp.deadBranches * (dead ? 0.8 : 1) * (0.25 + 0.75 * hr) * (age > 0.8 ? 0.7 : 1);
          if (rng.chance(keepP)) {
            const LnomHrel = clamp((y - crownBase) / Math.max(0.5, liveTop - crownBase), 0, 1);
            deadBranch(y, az, crownR * crownEnv(LnomHrel) * 0.7 * (dead ? 1 : rng.range(0.5, 1)));
          }
        }
      }
      // interwhorl branches (spruce / fir): smaller, fill the gaps
      if (live && species !== 'pine' && y > crownBase) {
        const ni = rng.int(1, 2);
        for (let i = 0; i < ni; i++) coniferBranch(y + ws * rng.range(0.35, 0.7), rng.range(0, 6.28), 0.55, true);
      }
      y += ws * rng.range(0.82, 1.18) * (species === 'pine' ? rng.range(0.8, 1.3) : 1);
      wi++;
    }
    // leader: a dense spire of upward sprays around the top of the stem (no bare stem tip poking out)
    if (!dead && !broken) {
      const cl = sp.card[0] * cardScale * 0.95;
      const spire = Math.min(2.4, Math.max(0.6, H * 0.08));
      const n = Math.max(4, Math.round(spire / 0.16));
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = Htop - spire * (1 - t) - cl * 0.25;
        const a = i * 2.39996 + rng.range(-0.3, 0.3);
        const out = v3(Math.cos(a), 0, Math.sin(a));
        const d = UP.clone().multiplyScalar(0.55 + 0.4 * t).addScaledVector(out, 0.75 - 0.5 * t).normalize();
        const base = axisAt(Math.max(0, y)).addScaledVector(out, -0.02);
        const len = cl * (1.0 - 0.45 * t);
        addCard(MISC, base, d, rot(UP, d, rng.range(-0.4, 0.4)).cross(d).cross(d).negate().normalize(), len, sp.card[1] * cardScale * (1 - 0.3 * t),
          rng.pick(cellsOf.tip.concat(cellsOf.live)), trunkWx(Math.max(0, y)), 0.05, 0.12, 0.5, 1.04, cardTint(), i % 2 === 0);
      }
      // the very tip
      const top = axisAt(Htop);
      for (let i = 0; i < 2; i++) {
        const nrm = v3(Math.cos(i * 1.57), 0, Math.sin(i * 1.57));
        addCard(MISC, top.clone().addScaledVector(UP, -cl * 0.7), UP, nrm, cl * 0.85, sp.card[1] * cardScale * 0.7,
          rng.pick(cellsOf.tip), trunkWx(Htop * 0.95), 0.05, 0.15, 0.5, 1.05, cardTint(), true);
      }
    }
    // broken top on a living conifer (one or two laterals turn up into new leaders), or an occasional fork
    const forked = !broken && !dead && age > 0.5 && rng.chance(sp.forkChance);
    if ((broken || forked) && !dead && Htop > crownBase + 1) {
      for (let i = 0; i < (forked ? 1 : rng.int(1, 2)); i++) {
        const y0 = forked ? lerp(crownBase, Htop, rng.range(0.55, 0.8)) : Htop - rng.range(0.3, 1.2);
        const az = rng.range(0, 6.28);
        const base = trunkPoint(y0, az, 0.8);
        const L = forked ? (Htop - y0) * rng.range(0.6, 0.85) : rng.range(1.2, 2.4) * small;
        const pts = pathOf(base, az, forked ? 1.32 : 1.2, L, 0, 0.3, 0.03, 5);
        const r = branchR(y0, L) * 0.8;
        const br: Br = { id: -1, part: MISC, pts, radii: pts.map((_, j) => r * (1 - j / 6) + 0.003), level: 0, dead: false, wx: trunkWx(y0), phase: rng.next(), len: L, col: barkColAt(y0), moss: 0 };
        br.part = newLimb(br, r);
        branches.push(br);
        const cl = sp.card[0] * cardScale;
        const nj = forked ? Math.max(5, Math.round(L / 0.3)) : 5;
        for (let j = 0; j < nj; j++) {
          const p = pointAt(pts, 0.3 + (j / (nj - 1)) * 0.65);
          const az2 = rng.range(0, 6.28);
          const d = v3(Math.cos(az2), rng.range(-0.3, 0.4), Math.sin(az2)).normalize();
          addCard(br.part, p, d, rot(UP, d, 0.3), cl, sp.card[1] * cardScale, rng.pick(cellsOf.live), br.wx, 0.05 + j * 0.03, 0.15 + j * 0.03, br.phase, 0.95, cardTint(), j % 2 === 0);
        }
      }
    }
  } else if (species === 'cedar') {
    let y = Math.max(0.5, H * 0.05);
    let az = rng.range(0, 6.28);
    const spacing = clamp(0.22 * H / 20, 0.12, 0.42);
    while (y < liveTop - 0.1) {
      az += 2.39996 + rng.range(-0.3, 0.3);
      if (y >= crownBase && !dead) cedarBranch(y, az);
      else if (rng.chance(sp.deadBranches * 0.5)) deadBranch(y, az, crownR * 0.4);
      y += spacing * rng.range(0.6, 1.4);
    }
    if (spike) {
      for (let i = 0; i < rng.int(1, 3); i++) cedarBranch(liveTop - rng.range(0.5, 3.5), rng.range(0, 6.28), true);
      // bare dead spike branches
      for (let i = 0; i < 4; i++) deadBranch(lerp(liveTop, Htop, rng.range(0.1, 0.8)), rng.range(0, 6.28), 0.8);
    }
  } else {
    // birch: spiral primaries, optional codominant fork
    let y = Math.max(0.6, crownBase * 0.85);
    let az = rng.range(0, 6.28);
    // dead stubs / lower branches below the crown
    for (let yy2 = 1.0; yy2 < crownBase * 0.85; yy2 += rng.range(0.5, 1.4)) if (rng.chance(sp.deadBranches)) deadBranch(yy2, rng.range(0, 6.28), 0.8);
    const fork = !dead && age > 0.45 && rng.chance(sp.forkChance);
    if (fork) {
      const yf = lerp(crownBase, Htop, rng.range(0.15, 0.4));
      for (let i = 0; i < rng.int(1, 2); i++) {
        const a2 = rng.range(0, 6.28);
        const base = trunkPoint(yf, a2, 0.6);
        const L = (Htop - yf) * rng.range(0.75, 0.95);
        const r = radiusAtY(yf) * 0.75;
        const dir = v3(Math.cos(a2) * 0.4, 1, Math.sin(a2) * 0.4).normalize();
        const br: Br = { id: -1, part: MISC, pts: [], radii: [], level: 0, dead: false, wx: trunkWx(yf), phase: rng.next(), len: L, col: [1, 1, 1], moss: 0 };
        const part = newLimb({ ...br, pts: [base, base.clone().addScaledVector(dir, L)] }, r);
        decidBranch(part, 0, base, dir, L, r, trunkWx(yf), br.phase, 0.6);
        addMass(part, Math.PI * r * r * L / 3 * sp.density);
      }
    }
    while (y < Htop - 0.3) {
      az += 2.39996 + rng.range(-0.25, 0.25);
      const hrel = clamp((y - crownBase) / Math.max(0.5, Htop - crownBase), 0, 1);
      const L = Math.max(0.25, crownR * Math.sin(Math.PI * clamp(hrel * 0.85 + 0.12, 0, 1)) * rng.range(0.8, 1.2) * (dead ? 0.4 : 1));
      const el = lerp(sp.branchAngle[0], sp.branchAngle[1], hrel) + rng.range(-0.12, 0.12);
      const base = trunkPoint(y, az, 0.8);
      const dir = v3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const r = branchR(y, L);
      const phase = rng.next();
      const tmp: Br = { id: -1, part: MISC, pts: [base, base.clone().addScaledVector(dir, L)], radii: [], level: 0, dead: false, wx: 0, phase, len: L, col: [1, 1, 1], moss: 0 };
      const part = newLimb(tmp, r);
      decidBranch(part, 0, base, dir, L, r, trunkWx(y), phase, hrel);
      addMass(part, Math.PI * r * r * L / 3 * sp.density);
      y += rng.range(0.2, 0.42) * clamp(H / 18, 0.5, 1.1);
    }
  }

  // card budget (keeps LOD0 near 12-20k triangles): drop a deterministic subset, enlarge the rest
  const budget = Math.round(lerp(1300, 2300, clamp((H - 8) / 26, 0, 1)));
  if (cards.length > budget) {
    const keepP = budget / cards.length;
    const grow = Math.min(1.45, 1 / Math.sqrt(keepP));
    const kept: Cd[] = [];
    for (const c of cards) {
      if (c.part === MISC) kept.push(c); // the leader spire always stays
      else if (rng.next() < keepP) { c.len *= grow; c.wid *= grow; kept.push(c); }
    }
    cards.length = 0;
    cards.push(...kept);
  }
  // resolve MISC part index
  const misc = nextPart;
  for (const b of branches) if (b.part === MISC) b.part = misc;
  for (const c of cards) if (c.part === MISC) c.part = misc;
  for (const l of limbs) l.mass = limbMass.get(l.id + 1) ?? 0;

  // ---------------------------------------------------------------- mass, crown centre, crown radius
  let stemVol = 0;
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1], b = rings[i];
    if (b.y <= 0) continue;
    const r = (a.r + b.r) / 2;
    stemVol += Math.PI * r * r * (b.y - Math.max(0, a.y));
  }
  let crownMass = 0;
  const cc = v3();
  for (const b of branches) {
    const m = Math.PI * b.radii[0] * b.radii[0] * b.len / 3 * sp.density;
    crownMass += m;
    cc.addScaledVector(b.pts[Math.floor(b.pts.length / 2)], m);
  }
  let crownRadius = 0.3;
  for (const c of cards) {
    const m = c.len * c.wid * 1.2;
    crownMass += m;
    cc.addScaledVector(c.p, m);
    crownRadius = Math.max(crownRadius, Math.hypot(c.p.x, c.p.z) + c.len * 0.6);
  }
  for (const b of branches) crownRadius = Math.max(crownRadius, Math.hypot(b.pts[b.pts.length - 1].x, b.pts[b.pts.length - 1].z));
  if (crownMass > 0) cc.divideScalar(crownMass); else cc.set(0, H * 0.6, 0);
  const mass = stemVol * sp.density + crownMass;

  // scars: an old healed wound / frost crack on some mature stems; fire catfaces in the burn
  const scars: Skeleton['scars'] = [];
  if (dbh > 0.18 && rng.chance(0.22 + 0.3 * (opts.charred ?? 0))) {
    const y0 = rng.range(0.1, 0.6);
    scars.push({ a: rng.range(0, 6.28), w: rng.range(0.12, 0.35), y0, y1: y0 + rng.range(0.8, Math.min(4, H * 0.25)), kind: (opts.charred ?? 0) > 0 ? 1 : 0 });
  }
  return {
    sp, H, Htop, dbh, rings, sides, roots, branches, cards, parts: misc + 1, limbs,
    trunkWrap, trunkCol, trunkMoss, trunkWind, crownCenter: cc, crownMass, mass, crownRadius, lean, scars,
  };
}

// ----------------------------------------------------------------------------------------------- emit geometry
interface EmitOpts { lod: 0 | 1; perPart: boolean }

function emitTrunk(sk: Skeleton, mb: MeshBuilder, lod: 0 | 1): void {
  const sp = sk.sp;
  const N = lod === 0 ? sk.sides : Math.max(5, Math.round(sk.sides / 3));
  const step = Math.max(1, Math.round(sk.sides / N));
  let ringIdx = sk.rings.map((_, i) => i);
  if (lod === 1) ringIdx = ringIdx.filter((i) => i === 0 || i === sk.rings.length - 1 || i % 2 === 1);
  // arc length along the centreline (v coordinate)
  const len: number[] = [0];
  for (let i = 1; i < sk.rings.length; i++) {
    const a = sk.rings[i - 1], b = sk.rings[i];
    len.push(len[i - 1] + Math.hypot(b.y - a.y, b.cx - a.cx, b.cz - a.cz));
  }
  const P = (i: number, j: number) => {
    const rg = sk.rings[i];
    const jj = ((j * step) % sk.sides + sk.sides) % sk.sides;
    return rg.pts[jj];
  };
  let prevRow: number[] | null = null;
  let prevWrap = -1;
  for (let k = 0; k < ringIdx.length; k++) {
    const i = ringIdx[k];
    const rg = sk.rings[i];
    const wrap = sk.trunkWrap[i];
    const iPrev = ringIdx[Math.max(0, k - 1)], iNext = ringIdx[Math.min(ringIdx.length - 1, k + 1)];
    const mk = (wr: number) => {
      const row: number[] = [];
      for (let j = 0; j <= N; j++) {
        const [x, z] = P(i, j);
        // normal from neighbours
        const [xa, za] = P(i, j - 1), [xb, zb] = P(i, j + 1);
        const tA = v3(xb - xa, 0, zb - za);
        const [xu, zu] = P(iNext, j), [xd, zd] = P(iPrev, j);
        const tV = v3(xu - xd, sk.rings[iNext].y - sk.rings[iPrev].y, zu - zd);
        const n = tV.clone().cross(tA).normalize();
        const outw = v3(x - rg.cx, 0, z - rg.cz);
        if (n.dot(outw) < 0) n.negate();
        let col = sk.trunkCol[i];
        for (const sc of sk.scars) {
          const a = (j / N) * Math.PI * 2;
          const da = Math.abs(Math.atan2(Math.sin(a - sc.a), Math.cos(a - sc.a)));
          const t = (rg.y - sc.y0) / Math.max(0.01, sc.y1 - sc.y0);
          // lens-shaped wound, widest a third of the way up
          const half = sc.w * Math.sin(Math.PI * Math.min(1, Math.max(0, t)) ** 0.8);
          if (t > 0 && t < 1 && da < half) col = sc.kind === 1 ? [0.12, 0.11, 0.1] : [1.45, 1.25, 1.0];
          else if (t > -0.05 && t < 1.05 && da < half + 0.12) col = [col[0] * 0.75, col[1] * 0.72, col[2] * 0.7]; // callus roll
        }
        row.push(mb.vert(v3(x, rg.y, z), n, (j / N) * wr, len[i] / sp.barkTile[1], col, sk.trunkWind[i], sk.trunkMoss[i]));
      }
      return row;
    };
    if (prevRow && wrap !== prevWrap) {
      // close the previous band with the old wrap, start a new band (horizontal uv seam)
      const closing = mk(prevWrap);
      for (let j = 0; j < N; j++) mb.quad(prevRow[j], prevRow[j + 1], closing[j + 1], closing[j]);
      prevRow = mk(wrap);
    } else {
      const row = mk(wrap);
      if (prevRow) for (let j = 0; j < N; j++) mb.quad(prevRow[j], prevRow[j + 1], row[j + 1], row[j]);
      prevRow = row;
    }
    prevWrap = wrap;
  }
  // top cap (pointed for intact tops, splintered for broken ones)
  const last = sk.rings[sk.rings.length - 1];
  const broken = sk.Htop < sk.H - 0.01;
  const tipY = last.y + (broken ? last.r * 0.6 : last.r * 2 + 0.02);
  const cap = mb.vert(v3(last.cx, tipY, last.cz), UP, 0.5, (len[len.length - 1] + 0.1) / sp.barkTile[1],
    broken ? [1.25, 1.12, 0.95] : sk.trunkCol[sk.trunkCol.length - 1], sk.trunkWind[sk.trunkWind.length - 1], 0);
  for (let j = 0; j < N; j++) mb.tri(prevRow![j], prevRow![j + 1], cap);
}

function emitTube(b: Br, mb: MeshBuilder, sp: Species, lod: 0 | 1): void {
  const r0 = b.radii[0];
  let sides = r0 > 0.07 ? 8 : r0 > 0.04 ? 6 : r0 > 0.016 ? 4 : 3;
  let pts = b.pts, radii = b.radii;
  if (lod === 0 && pts.length > 5 && r0 < 0.03) {
    const keep = pts.map((_, i) => i).filter((i) => i % 2 === 0 || i === pts.length - 1);
    pts = keep.map((i) => b.pts[i]);
    radii = keep.map((i) => b.radii[i]);
  }
  if (lod === 1) {
    sides = r0 > 0.08 ? 5 : 3;
    if (pts.length > 4) {
      const keep = pts.map((_, i) => i).filter((i) => i % 2 === 0 || i === pts.length - 1);
      pts = keep.map((i) => b.pts[i]);
      radii = keep.map((i) => b.radii[i]);
    }
  }
  const L = b.len;
  const col = b.dead ? (b.col) : b.col;
  tube(mb, pts, radii, {
    sides, tile: sp.barkTile, wraps: 0,
    col: (i, s) => { const k = 0.85 + 0.15 * s; return [col[0] * k, col[1] * k, col[2] * k]; },
    wind: (i, s) => [b.wx, Math.pow(s, 1.4) * L * (b.level > 0 ? 0.2 : 0.14) + (b.level > 0 ? 0.12 : 0), 0, b.phase],
    moss: (i, s) => b.moss * (1 - s),
    rough: r0 > 0.03 ? 0.06 : 0, roughSeed: b.phase * 10, capTip: false,
  });
}

function emitCard(c: Cd, mb: MeshBuilder, scale = 1, flat = false): void {
  card(mb, {
    flat,
    p: c.p, d: c.d, n: c.n, len: c.len * scale, wid: c.wid * scale, rect: cellRect(c.cell), fold: c.fold,
    bend: c.bend, bendAmt: 0.72, col: c.col, colTip: c.colTip, windBase: c.wb, windTip: c.wt, flipV: c.flipV,
  });
}

function emitAll(sk: Skeleton, o: EmitOpts): { wood: MeshBuilder[]; leaves: MeshBuilder[] } {
  const nParts = o.perPart ? sk.parts : 1;
  const wood = Array.from({ length: nParts }, () => new MeshBuilder());
  const leaves = Array.from({ length: nParts }, () => new MeshBuilder());
  const P = (part: number) => (o.perPart ? part : 0);
  emitTrunk(sk, wood[0], o.lod);
  for (const r of sk.roots) {
    if (o.lod === 1 && r.radii[0] < 0.06) continue;
    tube(wood[0], o.lod === 1 ? r.pts.filter((_, i) => i % 2 === 0) : r.pts, o.lod === 1 ? r.radii.filter((_, i) => i % 2 === 0) : r.radii, {
      sides: o.lod === 0 ? 7 : 4, tile: sk.sp.barkTile, wraps: 1,
      col: (i, s) => { const k = 0.62 + 0.25 * s; return [k, k, k]; },
      wind: () => [0, 0, 0, 0], moss: (i, s) => r.moss * (0.7 + 0.3 * s), rough: 0.1, roughSeed: r.len * 7,
    });
  }
  for (const b of sk.branches) {
    if (o.lod === 1 && (b.radii[0] < 0.02 || (b.level > 0 && b.radii[0] < 0.03))) continue;
    if (b.radii[0] < 0.0055 && !b.dead) continue;
    emitTube(b, wood[P(b.part)], sk.sp, o.lod);
  }
  // LOD1: ~1/4 of the cards (tips first), each scaled up to keep the crown's coverage
  let kept = 0;
  sk.cards.forEach((c, i) => { if (c.keep1 && ((i * 2654435761) >>> 0) % 100 < 72) kept++; });
  const s1 = Math.min(1.95, Math.sqrt(sk.cards.length / Math.max(1, kept)));
  sk.cards.forEach((c, i) => {
    if (o.lod === 1) {
      if (!c.keep1 || ((i * 2654435761) >>> 0) % 100 >= 72) return;
      emitCard(c, leaves[P(c.part)], s1, true);
    } else emitCard(c, leaves[P(c.part)]);
  });
  return { wood, leaves };
}

// ----------------------------------------------------------------------------------------------- model
function makeModel(species: SpeciesId, seed: number, opts: TreeOpts, sk: Skeleton, scale: number): TreeModel {
  const lods: (TreeLod | undefined)[] = [];
  const S = scale;
  const trunk: TrunkSample[] = sk.rings.filter((r) => r.y >= 0).map((r) => ({ y: r.y * S, r: r.r * S, x: r.cx * S, z: r.cz * S }));
  const model: TreeModel = {
    species, seed, age: opts.age ?? 0.75, form: opts.form ?? 'normal',
    height: sk.H * S, dbh: sk.dbh * S, mass: sk.mass * S * S * S, crownMass: sk.crownMass * S * S * S,
    crownCenter: sk.crownCenter.clone().multiplyScalar(S), lean: sk.lean.clone(), trunk,
    crownRadius: sk.crownRadius * S,
    scale: S,
    branches: sk.limbs.map((l) => ({ id: l.id, base: l.base.clone().multiplyScalar(S), dir: l.dir.clone(), len: l.len * S, r: l.r * S, mass: l.mass * S * S * S })),
    radiusAt(y: number): number {
      const yy = y / S;
      if (yy > sk.Htop || yy < -0.5) return 0;
      const R = sk.rings;
      for (let i = 1; i < R.length; i++) {
        if (R[i].y >= yy) {
          const t = clamp((yy - R[i - 1].y) / Math.max(1e-6, R[i].y - R[i - 1].y), 0, 1);
          return lerp(R[i - 1].r, R[i].r, t) * S;
        }
      }
      return R[R.length - 1].r * S;
    },
    centerAt(y: number): [number, number] {
      const yy = clamp(y / S, 0, sk.Htop);
      const R = sk.rings;
      for (let i = 1; i < R.length; i++) {
        if (R[i].y >= yy) {
          const t = clamp((yy - R[i - 1].y) / Math.max(1e-6, R[i].y - R[i - 1].y), 0, 1);
          return [lerp(R[i - 1].cx, R[i].cx, t) * S, lerp(R[i - 1].cz, R[i].cz, t) * S];
        }
      }
      const l = R[R.length - 1];
      return [l.cx * S, l.cz * S];
    },
    outlineAt(y: number): [number, number][] {
      const yy = clamp(y / S, -0.5, sk.Htop);
      const R = sk.rings;
      let i = 1;
      while (i < R.length - 1 && R[i].y < yy) i++;
      const a = R[i - 1], b = R[i];
      const t = clamp((yy - a.y) / Math.max(1e-6, b.y - a.y), 0, 1);
      return a.pts.map((p, j) => [lerp(p[0], b.pts[j][0], t) * S, lerp(p[1], b.pts[j][1], t) * S] as [number, number]);
    },
    lod(level: 0 | 1): TreeLod {
      let l = lods[level];
      if (!l) {
        const { wood, leaves } = emitAll(sk, { lod: level, perPart: false });
        const bark = wood[0].build({ scale: S });
        const foliage = leaves[0].count ? leaves[0].build({ scale: S, moss: false }) : null;
        l = { bark, foliage, tris: wood[0].triangles + leaves[0].triangles };
        lods[level] = l;
      }
      return l;
    },
    object(): THREE.Group {
      const mats = createTreeMaterials(species);
      const { wood, leaves } = emitAll(sk, { lod: 0, perPart: true });
      const g = new THREE.Group();
      g.name = `tree_${species}`;
      const mesh = (mb: MeshBuilder, leaf: boolean, name: string) => {
        const m = new THREE.Mesh(mb.build({ scale: S, moss: !leaf }), leaf ? mats.foliage : mats.bark);
        m.name = name;
        m.castShadow = true;
        m.receiveShadow = true;
        m.customDepthMaterial = leaf ? mats.foliageDepth : mats.barkDepth;
        return m;
      };
      g.add(mesh(wood[0], false, 'trunk'));
      for (const l of sk.limbs) {
        const part = l.id + 1;
        const o = new THREE.Object3D();
        o.name = `branch_${l.id}`;
        if (wood[part].count) o.add(mesh(wood[part], false, `branch_${l.id}_wood`));
        if (leaves[part].count) o.add(mesh(leaves[part], true, `branch_${l.id}_foliage`));
        g.add(o);
      }
      const misc = new THREE.Object3D();
      misc.name = 'crown_misc';
      const mi = sk.parts - 1;
      if (wood[mi].count) misc.add(mesh(wood[mi], false, 'crown_misc_wood'));
      if (leaves[mi].count) misc.add(mesh(leaves[mi], true, 'crown_misc_foliage'));
      g.add(misc);
      g.userData.model = model;
      g.userData.materials = mats;
      g.userData.setWind = (k: number) => { mats.uniforms.uWindAmt.value = k; };
      return g;
    },
  };
  (model as TreeModel & { _sk: Skeleton })._sk = sk;
  return model;
}

/** the same tree uniformly scaled (instances in the forest carry a scale): geometry is regenerated at that scale */
export function scaledModel(m: TreeModel, s: number): TreeModel {
  if (Math.abs(s - 1) < 1e-4) return m;
  const sk = (m as TreeModel & { _sk: Skeleton })._sk;
  return makeModel(m.species, m.seed, { age: m.age, form: m.form }, sk, m.scale * s);
}
