// Wood pieces: bucked logs, rounds and split firewood. Geometry is lofted from the source tree's trunk profile
// (radius + gentle irregularity) between two stem heights, optionally limited to a wedge of the circle for
// splits. Bark outside, end grain on the cut faces, rough split grain on split faces. Each piece is a Rapier
// body (cylinder for whole logs, convex hull for wedges) with a real mass.
import * as THREE from 'three';
import { physics, RAPIER, GROUP, groups } from '../physics/physics';
import { woodMaterial, type Species, WOOD } from './woodtex';
import { Rng, hashStr } from '../core/rng';
import { registerInteractable } from '../game/interact';

export interface StemSample { y: number; r: number; x: number; z: number }

/** green wood density, kg/m3 */
export const DENSITY: Record<Species, number> = { spruce: 470, fir: 480, pine: 520, birch: 640, cedar: 380 };

let barkSource: (sp: Species) => THREE.Material | null = () => null;
/** the forest module provides the species bark material (so logs match the standing trees) */
export function setBarkSource(fn: (sp: Species) => THREE.Material | null): void { barkSource = fn; }

const fallbackBark = new Map<Species, THREE.MeshStandardMaterial>();
export function barkMaterial(sp: Species): THREE.Material {
  const m = barkSource(sp);
  if (m) return m;
  let f = fallbackBark.get(sp);
  if (!f) {
    const b = WOOD[sp].bark;
    f = new THREE.MeshStandardMaterial({ color: new THREE.Color(b[0] / 255, b[1] / 255, b[2] / 255), roughness: 1 });
    fallbackBark.set(sp, f);
  }
  return f;
}

export function radiusAtStem(stem: StemSample[], y: number): { r: number; x: number; z: number } {
  if (y <= stem[0].y) return stem[0];
  for (let i = 1; i < stem.length; i++) {
    if (stem[i].y >= y) {
      const a = stem[i - 1], b = stem[i], t = (y - a.y) / Math.max(1e-6, b.y - a.y);
      return { r: a.r + (b.r - a.r) * t, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return stem[stem.length - 1];
}

export interface PieceSpec {
  species: Species;
  stem: StemSample[];
  y0: number; y1: number;
  /** angular range [a0, a1] in radians; full log = [0, 2PI] */
  a0?: number; a1?: number;
  seed: number;
  /** 0..1 quality (chewed ends, rot, splits lower it) */
  quality?: number;
  /** cut faces: 'axe' (rough, chewed) or 'saw' (clean) */
  ends?: 'axe' | 'saw';
}

export interface PieceGeo { geo: THREE.BufferGeometry; centroid: THREE.Vector3; volume: number; hull: number[]; rAvg: number; len: number }

/** loft the geometry. Local frame: Y along the stem, origin at the centroid */
export function buildPieceGeometry(s: PieceSpec): PieceGeo {
  const a0 = s.a0 ?? 0, a1 = s.a1 ?? Math.PI * 2;
  const full = a1 - a0 >= Math.PI * 2 - 1e-4;
  const len = s.y1 - s.y0;
  const rng = new Rng(s.seed);
  const ph = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)];
  const irr = (a: number, y: number) => 1 + 0.035 * Math.sin(a * 3 + ph[0] + y * 0.3) + 0.02 * Math.sin(a * 5 + ph[1]) + 0.012 * Math.sin(a * 9 + ph[2] + y);
  const nRing = Math.max(2, Math.ceil(len / 0.3) + 1);
  const span = a1 - a0;
  const nSeg = Math.max(4, Math.ceil((span / (Math.PI * 2)) * 22));
  const pos: number[] = [], uv: number[] = [], nor: number[] = [];
  const idx: [number[], number[], number[]] = [[], [], []];
  const groupStart: number[] = [];
  const P = (y: number, a: number, rr = 1) => {
    const c = radiusAtStem(s.stem, s.y0 + y);
    const r = c.r * irr(a, s.y0 + y) * rr;
    // straighten: keep the log axis straight-ish (sweep is small over a log length)
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  // bark
  const barkTile = 0.5; // metres per bark texture repeat around and along
  for (let i = 0; i < nRing; i++) {
    const y = (i / (nRing - 1)) * len;
    for (let j = 0; j <= nSeg; j++) {
      const a = a0 + (j / nSeg) * span;
      const p = P(y, a);
      pos.push(p.x, p.y, p.z);
      nor.push(Math.cos(a), 0, Math.sin(a));
      const circ = 2 * Math.PI * radiusAtStem(s.stem, s.y0 + y).r;
      uv.push(((a / (Math.PI * 2)) * circ) / barkTile, (s.y0 + y) / barkTile);
    }
  }
  for (let i = 0; i < nRing - 1; i++) for (let j = 0; j < nSeg; j++) {
    const a = i * (nSeg + 1) + j, b = a + 1, c = a + nSeg + 1, d = c + 1;
    idx[0].push(a, c, b, b, c, d);
  }
  // end caps
  const cap = (y: number, up: boolean) => {
    const base = pos.length / 3;
    const R = radiusAtStem(s.stem, s.y0 + y).r * 1.04;
    pos.push(0, y, 0); nor.push(0, up ? 1 : -1, 0); uv.push(0.5, 0.5);
    for (let j = 0; j <= nSeg; j++) {
      const a = a0 + (j / nSeg) * span;
      const p = P(y, a);
      pos.push(p.x, p.y, p.z); nor.push(0, up ? 1 : -1, 0);
      uv.push(0.5 + (p.x / R) * 0.5, 0.5 + (p.z / R) * 0.5);
    }
    for (let j = 0; j < nSeg; j++) {
      if (up) idx[1].push(base, base + 2 + j, base + 1 + j); else idx[1].push(base, base + 1 + j, base + 2 + j);
    }
  };
  cap(0, false); cap(len, true);
  // split faces
  if (!full) {
    for (const [a, flip] of [[a0, true], [a1, false]] as [number, boolean][]) {
      const base = pos.length / 3;
      const n = new THREE.Vector3(Math.cos(a + (flip ? -Math.PI / 2 : Math.PI / 2)), 0, Math.sin(a + (flip ? -Math.PI / 2 : Math.PI / 2)));
      for (let i = 0; i < nRing; i++) {
        const y = (i / (nRing - 1)) * len;
        const p = P(y, a);
        const R = Math.hypot(p.x, p.z);
        pos.push(0, y, 0, p.x, y, p.z);
        nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
        uv.push(0, (s.y0 + y) / 1.0, R / 0.25, (s.y0 + y) / 1.0);
      }
      for (let i = 0; i < nRing - 1; i++) {
        const a_ = base + i * 2, b = a_ + 1, c = a_ + 2, d = a_ + 3;
        if (flip) idx[2].push(a_, b, c, b, d, c); else idx[2].push(a_, c, b, b, c, d);
      }
    }
  }
  const all: number[] = [];
  const geo = new THREE.BufferGeometry();
  for (let g = 0; g < 3; g++) { groupStart.push(all.length); all.push(...idx[g]); }
  geo.setIndex(all);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (let g = 0; g < 3; g++) {
    const cnt = (g < 2 ? groupStart[g + 1] : all.length) - groupStart[g];
    if (cnt > 0) geo.addGroup(groupStart[g], cnt, g);
  }
  // volume + centroid (sampled)
  let vol = 0; const cen = new THREE.Vector3();
  const nS = 8;
  for (let i = 0; i < nS; i++) {
    const y = ((i + 0.5) / nS) * len;
    const r = radiusAtStem(s.stem, s.y0 + y).r;
    const dv = (span / 2) * r * r * (len / nS);
    vol += dv;
    // wedge centroid distance from the axis: 2 r sin(span/2) / (3 span/2)
    const cd = full ? 0 : (2 * r * Math.sin(span / 2)) / (1.5 * span);
    const am = (a0 + a1) / 2;
    cen.add(new THREE.Vector3(Math.cos(am) * cd, y, Math.sin(am) * cd).multiplyScalar(dv));
  }
  cen.divideScalar(vol);
  geo.translate(-cen.x, -cen.y, -cen.z);
  geo.computeBoundingSphere();
  // hull points (outline at both ends, shrunk a touch)
  const hull: number[] = [];
  for (const y of [0, len]) {
    if (!full) hull.push(-cen.x, y - cen.y, -cen.z);
    const k = full ? 10 : Math.max(3, Math.ceil(nSeg / 2));
    for (let j = 0; j <= k; j++) {
      const a = a0 + (j / k) * span;
      const p = P(y, a, 0.98);
      hull.push(p.x - cen.x, p.y - cen.y, p.z - cen.z);
    }
  }
  const rAvg = (radiusAtStem(s.stem, s.y0).r + radiusAtStem(s.stem, s.y1).r) / 2;
  return { geo, centroid: cen, volume: vol, hull, rAvg, len };
}

export type PieceKind = 'log' | 'round' | 'half' | 'split';

let nextId = 1;

export class WoodPiece {
  readonly id = nextId++;
  readonly spec: PieceSpec;
  readonly mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null = null;
  readonly mass: number;
  readonly volume: number;
  readonly len: number;
  readonly r: number;
  quality: number;
  kind: PieceKind;
  /** accumulated splitting progress 0..1 */
  splitProgress = 0;
  /** stacked in the woodshed / loaded on a vehicle */
  stacked = false;
  /** burning in a stove */
  burned = false;

  constructor(spec: PieceSpec) {
    this.spec = spec;
    const g = buildPieceGeometry(spec);
    const variant = hashStr(String(spec.seed)) % 6;
    const mats = [barkMaterial(spec.species), woodMaterial('end', spec.species, variant), woodMaterial('split', spec.species)];
    this.mesh = new THREE.Mesh(g.geo, mats);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.volume = g.volume;
    this.mass = g.volume * DENSITY[spec.species];
    this.len = g.len;
    this.r = g.rAvg;
    this.quality = spec.quality ?? 1;
    const span = (spec.a1 ?? Math.PI * 2) - (spec.a0 ?? 0);
    this.kind = span < Math.PI * 1.01 ? (span < Math.PI * 0.75 ? 'split' : 'half') : this.len < 0.8 ? 'round' : 'log';
    this.mesh.userData.woodPiece = this;
    (this.mesh.userData as any).hull = g.hull;
    registerInteractable(this.mesh, {
      kind: 'pickup',
      label: () => (this.mass > 32 ? 'Drag' : 'Pick up'),
      use: (ctx) => ctx.game.hands?.grab(this.mesh, this),
      reach: 2.4,
    });
  }

  /** create the physics body at a world transform */
  spawn(pos: THREE.Vector3, quat: THREE.Quaternion, linvel?: THREE.Vector3, angvel?: THREE.Vector3): void {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.05).setAngularDamping(0.25)
      .setCcdEnabled(this.mass < 20);
    if (linvel) desc.setLinvel(linvel.x, linvel.y, linvel.z);
    if (angvel) desc.setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z });
    this.body = physics.world.createRigidBody(desc);
    const full = this.kind === 'log' || this.kind === 'round';
    let cd: RAPIER.ColliderDesc | null = null;
    if (full) cd = RAPIER.ColliderDesc.cylinder(this.len / 2, this.r * 0.97);
    else cd = RAPIER.ColliderDesc.convexHull(new Float32Array((this.mesh.userData as any).hull));
    if (!cd) cd = RAPIER.ColliderDesc.cylinder(this.len / 2, this.r * 0.6);
    cd.setMass(this.mass).setFriction(0.85).setRestitution(0.08)
      .setCollisionGroups(groups(GROUP.DYNAMIC, 0xffff & ~GROUP.HELD))
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(this.mass * 25);
    const col = physics.world.createCollider(cd, this.body);
    physics.owner.set(col.handle, this);
    // the cylinder is centred on the axis midpoint; the mesh is centred on the centroid
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(quat);
    physics.sync(this.body, this.mesh);
    if (full) {
      // shift the collider so it matches the centroid-centred mesh (whole logs: centroid is on the axis midpoint)
      col.setTranslationWrtParent({ x: 0, y: 0, z: 0 });
    }
  }

  despawn(): void {
    if (this.body) { physics.removeBody(this.body); this.body = null; }
  }

  /** value at the store, dollars (timber only) */
  value(pricePerM3: number): number {
    const endsBonus = this.spec.ends === 'saw' ? 1.15 : 1;
    return Math.max(0, Math.round(this.volume * pricePerM3 * this.quality * endsBonus * 10) / 10);
  }
}
