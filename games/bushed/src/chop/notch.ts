// A notch in a standing trunk at one height. Per angular sector we track two kerfs:
//   diag  - the angled (downward 45 deg) cut, made by striking a little ABOVE the cut line
//   flat  - the horizontal cut, made by striking AT the cut line
// A chip only releases where both kerfs meet, so the depth actually removed is about min(diag, flat).
// Alternate high and low strikes to open a clean face notch; hammering the same spot just bruises the wood.
// The band mesh is a ring loft around the cut that carves the removed wedge, bark outside, fresh wood inside.
import * as THREE from 'three';
import { woodMaterial, type Species } from './woodtex';

export const SECTORS = 48;
const TAU = Math.PI * 2;

export interface Profile {
  /** mean outer radius at trunk-local height y */
  radiusAt(y: number): number;
  /** optional exact outline (trunk-local) */
  outlineAt?(y: number): [number, number][];
}

export type StrikeType = 'diag' | 'flat';

export class Notch {
  readonly y: number;
  readonly R: number;
  readonly diag = new Float32Array(SECTORS);
  readonly flat = new Float32Array(SECTORS);
  readonly depth = new Float32Array(SECTORS);
  lastType: StrikeType | null = null;
  readonly mesh: THREE.Mesh;
  /** strikes landed (for chips / bruising feedback) */
  hits = 0;
  private profile: Profile;
  private species: Species;
  private barkMat: THREE.Material;

  constructor(y: number, profile: Profile, species: Species, barkMat: THREE.Material) {
    this.y = y;
    this.profile = profile;
    this.species = species;
    this.R = profile.radiusAt(y);
    this.barkMat = barkMat;
    const inner = woodMaterial('split', species).clone();
    inner.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), [barkMat, inner]);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.rebuild();
  }

  /** height band the trunk material must hide (trunk-local) */
  get band(): [number, number] { return [this.y - 0.022, this.y + this.maxOpen() + 0.022]; }

  maxOpen(): number { let m = 0.02; for (let i = 0; i < SECTORS; i++) m = Math.max(m, this.depth[i]); return Math.min(m * 1.0 + 0.01, this.R * 1.2); }

  /**
   * Apply a strike centred on angle theta (trunk-local, atan2(z, x)). amount = kerf penetration (m).
   * Returns the depth of wood actually removed (for chips) and whether the strike bruised.
   */
  strike(theta: number, type: StrikeType, amount: number, bladeHalfWidth = 0.065): { removed: number; bruised: boolean } {
    // a deeper notch has to be wider: the face opens up as you chop in
    const ci = Math.round((((theta % TAU) + TAU) % TAU) / TAU * SECTORS) % SECTORS;
    const ang = Math.min(1.5, (bladeHalfWidth + 0.85 * this.depth[ci]) / Math.max(0.04, this.R));
    let removed = 0;
    const alt = this.lastType !== null && this.lastType !== type;
    const eff = this.lastType === null ? 1 : alt ? 1.2 : 0.75;
    for (let i = 0; i < SECTORS; i++) {
      const a = (i / SECTORS) * TAU;
      let da = Math.abs(((a - theta + Math.PI * 3) % TAU) - Math.PI);
      if (da > ang * 1.6) continue;
      const fall = da < ang ? 1 : 1 - (da - ang) / (ang * 0.6);
      // the kerf gets harder to drive the deeper it is (the blade wedges)
      const k = this[type];
      const room = this.R * 1.02 - k[i];
      if (room <= 0) continue;
      const add = Math.min(room, amount * eff * fall * (1 - 0.35 * (k[i] / this.R)));
      k[i] += add;
      const before = this.depth[i];
      const a2 = this.diag[i], b2 = this.flat[i];
      this.depth[i] = Math.min(this.R * 1.02, Math.max(before, Math.min(a2, b2) + 0.25 * Math.abs(a2 - b2)));
      removed += this.depth[i] - before;
    }
    this.lastType = type;
    this.hits++;
    this.rebuild();
    return { removed, bruised: removed < amount * 0.3 };
  }

  /** fraction of the cross-section area removed (0..1) */
  removedFraction(): number {
    let s = 0;
    const R = this.R;
    for (let i = 0; i < SECTORS; i++) {
      const r = Math.max(0, R - this.depth[i]);
      s += (R * R - r * r);
    }
    return s / (SECTORS * R * R);
  }

  /** horizontal direction (trunk-local xz) from the centre toward the removed wood (the side it will fall to) */
  openDir(): THREE.Vector2 {
    const v = new THREE.Vector2();
    for (let i = 0; i < SECTORS; i++) {
      const a = (i / SECTORS) * TAU, d = this.depth[i];
      v.x += Math.cos(a) * d * d; v.y += Math.sin(a) * d * d;
    }
    return v.lengthSq() > 1e-10 ? v.normalize() : v.set(1, 0);
  }

  /** remaining hinge as a fraction of the diameter on the side opposite the notch */
  sectorDepth(theta: number): number {
    const i = Math.round((((theta % TAU) + TAU) % TAU) / TAU * SECTORS) % SECTORS;
    return this.depth[i];
  }

  private removedAt(i: number, y: number): number {
    const d = this.depth[i];
    if (d <= 0.0005 || y < this.y) return 0;
    const h = d; // 45 degree face: opening height equals depth
    const t = (y - this.y) / h;
    return t >= 1 ? 0 : d * (1 - t);
  }

  rebuild(): void {
    const top = this.maxOpen();
    const ys = [this.y - 0.03, this.y - 0.0008, this.y];
    const nMid = 7;
    for (let k = 1; k <= nMid; k++) ys.push(this.y + (top * k) / nMid);
    ys.push(this.y + top + 0.03);
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    const carved: boolean[] = [];
    const ring = (y: number, floor: boolean) => {
      const R = this.profile.radiusAt(y);
      const ol = this.profile.outlineAt?.(y);
      for (let i = 0; i <= SECTORS; i++) {
        const ii = i % SECTORS;
        const a = (ii / SECTORS) * TAU;
        let r = R;
        if (ol && ol.length > 2) {
          // pick the outline radius closest to this angle
          let best = 1e9;
          for (const [px, pz] of ol) {
            const pa = Math.atan2(pz, px);
            const da = Math.abs(((pa - a + Math.PI * 3) % TAU) - Math.PI);
            if (da < best) { best = da; r = Math.hypot(px, pz); }
          }
        }
        const rem = floor ? this.depth[ii] : this.removedAt(ii, y);
        const rr = Math.max(0.004, r - rem);
        pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
        nor.push(Math.cos(a), 0, Math.sin(a));
        carved.push(rem > 0.002);
        uv.push(rem > 0.002 ? (a * this.R) / 0.25 : (a * R) / 0.5, rem > 0.002 ? (y + rem) / 0.25 : y / 0.5);
      }
    };
    ys.forEach((y, k) => ring(y, k === 2));
    const W = SECTORS + 1;
    const bark: number[] = [], wood: number[] = [];
    for (let k = 0; k < ys.length - 1; k++) for (let i = 0; i < SECTORS; i++) {
      const a = k * W + i, b = a + 1, c = a + W, d = c + 1;
      const isWood = carved[a] || carved[b] || carved[c] || carved[d] || (k === 1 && (this.depth[i] > 0.002 || this.depth[(i + 1) % SECTORS] > 0.002));
      (isWood ? wood : bark).push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([...bark, ...wood]);
    g.addGroup(0, bark.length, 0);
    g.addGroup(bark.length, wood.length, 1);
    g.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  /**
   * Cap polygon for the cut plane at this.y: per-sector radius = full (stump side) or R - depth (falling side).
   * Returns a mesh using the species end grain.
   */
  capMesh(side: 'stump' | 'top', variant = 0): THREE.Mesh {
    const pos: number[] = [0, this.y, 0], uv: number[] = [0.5, 0.5], idx: number[] = [];
    const R = this.R * 1.03;
    for (let i = 0; i <= SECTORS; i++) {
      const ii = i % SECTORS, a = (ii / SECTORS) * TAU;
      const r = side === 'stump' ? this.R : Math.max(0.003, this.R - this.depth[ii]);
      pos.push(Math.cos(a) * r, this.y, Math.sin(a) * r);
      uv.push(0.5 + (Math.cos(a) * r) / R * 0.5, 0.5 + (Math.sin(a) * r) / R * 0.5);
    }
    for (let i = 0; i < SECTORS; i++) {
      if (side === 'stump') idx.push(0, i + 2, i + 1); else idx.push(0, i + 1, i + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, woodMaterial('end', this.species, variant));
    m.receiveShadow = true; m.castShadow = true;
    return m;
  }

  /** split the band into the part that stays on the stump (y <= cut) and the part that leaves with the top */
  splitBand(): { lower: THREE.Mesh; upper: THREE.Mesh } {
    const mk = (keepUpper: boolean) => {
      const g = this.mesh.geometry.clone();
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const idx = g.getIndex()!;
      const keep: number[] = [];
      const groups = g.groups.map((gr) => ({ ...gr }));
      const out: number[][] = groups.map(() => []);
      groups.forEach((gr, gi) => {
        for (let t = gr.start; t < gr.start + gr.count; t += 3) {
          const ya = p.getY(idx.getX(t)), yb = p.getY(idx.getX(t + 1)), yc = p.getY(idx.getX(t + 2));
          const mid = (ya + yb + yc) / 3;
          if (keepUpper ? mid > this.y + 1e-4 : mid < this.y - 1e-4) out[gi].push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
        }
      });
      keep.push(...out[0], ...out[1]);
      g.setIndex(keep);
      g.clearGroups();
      g.addGroup(0, out[0].length, 0);
      g.addGroup(out[0].length, out[1].length, 1);
      const m = new THREE.Mesh(g, this.mesh.material);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    return { lower: mk(false), upper: mk(true) };
  }
}

/**
 * Patch a (cloned) bark material so it discards fragments of the trunk inside any of the given trunk-local
 * height bands, or outside [keepMin, keepMax]. Uniform objects are returned for live updates.
 */
export function clipMaterial(base: THREE.Material): { mat: THREE.Material; bands: THREE.Vector4[]; keep: THREE.Vector2 } {
  const mat = base.clone();
  const bands = [new THREE.Vector4(1, 0, 1, 0), new THREE.Vector4(1, 0, 1, 0)];
  const keep = new THREE.Vector2(-1e4, 1e4);
  const prev = (base as any).onBeforeCompile as ((s: any, r: any) => void) | undefined;
  mat.onBeforeCompile = (sh: any, r: any) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uClipBands = { value: bands };
    sh.uniforms.uClipKeep = { value: keep };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vClipY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClipY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vClipY; uniform vec4 uClipBands[2]; uniform vec2 uClipKeep;')
      .replace('void main() {', `void main() {
        if (vClipY < uClipKeep.x || vClipY > uClipKeep.y) discard;
        for (int i = 0; i < 2; i++) { if (vClipY > uClipBands[i].x && vClipY < uClipBands[i].y) discard; if (vClipY > uClipBands[i].z && vClipY < uClipBands[i].w) discard; }`);
  };
  const prevKey = (base as any).customProgramCacheKey?.bind(base);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|clip';
  return { mat, bands, keep };
}

/** matching shadow-depth material so hidden parts don't cast phantom shadows */
export function clipDepthMaterial(bands: THREE.Vector4[], keep: THREE.Vector2): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh: any) => {
    sh.uniforms.uClipBands = { value: bands };
    sh.uniforms.uClipKeep = { value: keep };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vClipY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClipY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vClipY; uniform vec4 uClipBands[2]; uniform vec2 uClipKeep;')
      .replace('void main() {', `void main() {
        if (vClipY < uClipKeep.x || vClipY > uClipKeep.y) discard;
        for (int i = 0; i < 2; i++) { if (vClipY > uClipBands[i].x && vClipY < uClipBands[i].y) discard; if (vClipY > uClipBands[i].z && vClipY < uClipBands[i].w) discard; }`);
  };
  m.customProgramCacheKey = () => 'clipdepth';
  return m;
}
