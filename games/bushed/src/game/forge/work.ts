// The workpiece: a bar of steel that glows with its heat and moves under the hammer. A square bar (or a flat
// leaf-spring for an axe bit) along +X from the tongs (u = 0) to the working end (u = 1), 28 rings. Forging ops
// fill a progress field along the bar wherever the hammer lands: 'point' draws the end to a point, 'taper' flattens
// and spreads it into a blade or a wedge, 'head' upsets a nail head, 'bend' curls the end over the horn.
// Heat: one temperature at the working end, falling off toward the tongs; the colour is the smith's colour chart
// (dull red, blood red, cherry, orange, yellow, white), stepped like the rest of the game's pixel art. Below a
// visible glow the steel is black with forge scale; ground bright where the grindstone touched it.
import * as THREE from 'three';
import { placeTex } from '../../places/kit';

export type Op = 'point' | 'taper' | 'head' | 'bend' | 'bend90';
export interface Stock { len: number; w: number; t: number; kind: 'bar' | 'flat' | 'block' }

export const STOCK: Record<string, Stock> = {
  bar: { len: 0.24, w: 0.0127, t: 0.0127, kind: 'bar' },
  flat: { len: 0.17, w: 0.05, t: 0.009, kind: 'flat' },
  block: { len: 0.16, w: 0.045, t: 0.03, kind: 'block' },
};

const RINGS = 28;

/** colour of hot steel at T (degrees C): the forge's colour chart, stepped */
export function heatColor(T: number, out = new THREE.Color()): THREE.Color {
  const stops: [number, number, number, number][] = [
    [460, 0, 0, 0], [560, 0.22, 0.015, 0.0], [660, 0.55, 0.05, 0.0], [760, 0.95, 0.14, 0.02], [860, 1.0, 0.33, 0.04],
    [980, 1.0, 0.55, 0.1], [1100, 1.0, 0.78, 0.3], [1220, 1.0, 0.92, 0.55], [1320, 1.0, 1.0, 0.85],
  ];
  if (T <= stops[0][0]) return out.setRGB(0, 0, 0);
  for (let i = 1; i < stops.length; i++) if (T <= stops[i][0]) {
    const a = stops[i - 1], b = stops[i];
    const k = Math.round(((T - a[0]) / (b[0] - a[0])) * 2) / 2;
    return out.setRGB(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
  }
  return out.setRGB(1, 1, 0.9);
}
export function heatName(T: number): string {
  return T < 480 ? 'black' : T < 600 ? 'dull red' : T < 700 ? 'blood red' : T < 820 ? 'cherry red' : T < 960 ? 'orange' : T < 1120 ? 'yellow-orange' : T < 1260 ? 'yellow' : 'white, sparkling';
}

export class Workpiece {
  readonly mesh: THREE.Mesh;
  readonly geo: THREE.BufferGeometry;
  readonly prog: Record<Op, Float32Array>;
  /** temperature at the working end */
  T = 20;
  /** 0..1 how much of the scale is ground off (bright steel) */
  bright = 0;
  /** dings from strikes off the mark */
  dings = new Float32Array(RINGS + 1);
  private heatAttr: THREE.BufferAttribute;
  private uGlow = { value: 1 };
  constructor(readonly stock: Stock) {
    this.prog = { point: new Float32Array(RINGS + 1), taper: new Float32Array(RINGS + 1), head: new Float32Array(RINGS + 1), bend: new Float32Array(RINGS + 1), bend90: new Float32Array(RINGS + 1) };
    this.geo = new THREE.BufferGeometry();
    const S = 8; // cross-section points
    const vCount = (RINGS + 1) * S + 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vCount * 2), 2));
    this.heatAttr = new THREE.BufferAttribute(new Float32Array(vCount * 3), 3);
    this.geo.setAttribute('aHeat', this.heatAttr);
    const idx: number[] = [];
    for (let i = 0; i < RINGS; i++) for (let k = 0; k < S; k++) {
      const a = i * S + k, b = i * S + (k + 1) % S, c = (i + 1) * S + (k + 1) % S, d = (i + 1) * S + k;
      idx.push(a, b, c, a, c, d);
    }
    const c0 = (RINGS + 1) * S, c1 = c0 + 1;
    for (let k = 0; k < S; k++) { idx.push(c0, (k + 1) % S, k); idx.push(c1, RINGS * S + k, RINGS * S + (k + 1) % S); }
    this.geo.setIndex(idx);
    const uv = this.geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i <= RINGS; i++) for (let k = 0; k < S; k++) uv.setXY(i * S + k, (i / RINGS) * stock.len * 2, (k / S) * 0.2);
    const mat = new THREE.MeshStandardMaterial({ map: placeTex('iron'), color: 0x8a8580, roughness: 0.6, metalness: 0.5 });
    const U = this.uGlow;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = U;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aHeat; varying vec3 vHeat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow; varying vec3 vHeat;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float lum = max(vHeat.r, max(vHeat.g, vHeat.b));
          // glowing steel hides its scale and reads as pure colour; the colour sits in vHeat
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.15, smoothstep(0.1, 0.6, lum));
          totalEmissiveRadiance += vHeat * 3.2 * uGlow;`);
    };
    mat.customProgramCacheKey = () => 'forge_work';
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.rebuild();
  }

  get len(): number { return this.stock.len; }

  /** total progress of an op over its zone (0..1) */
  amount(op: Op, u0: number, u1: number): number {
    const p = this.prog[op];
    let s = 0, n = 0;
    for (let i = 0; i <= RINGS; i++) { const u = i / RINGS; if (u >= u0 - 1e-6 && u <= u1 + 1e-6) { s += Math.min(1, p[i]); n++; } }
    return n ? s / n : 0;
  }

  /** a hammer blow at u: moves the metal for an op inside its zone, dings it outside */
  strike(op: Op, u: number, power: number, zone: [number, number]): { inZone: boolean } {
    const p = this.prog[op];
    const inZone = u >= zone[0] - 0.04 && u <= zone[1] + 0.04;
    for (let i = 0; i <= RINGS; i++) {
      const ui = i / RINGS;
      const w = Math.exp(-((ui - u) ** 2) / (2 * 0.07 * 0.07));
      if (inZone && ui >= zone[0] - 0.02 && ui <= zone[1] + 0.02) p[i] = Math.min(1.15, p[i] + power * w * 0.38);
      else if (!inZone) this.dings[i] = Math.min(1, this.dings[i] + power * w * 0.25);
    }
    this.rebuild();
    return { inZone };
  }

  /** the centreline and frame at u (local), after bends */
  private frame(u: number): { p: THREE.Vector3; tx: THREE.Vector3; ny: THREE.Vector3 } {
    const L = this.stock.len;
    // integrate the bends from the tongs end: curvature where the bend progress is
    let x = 0, y = 0, a = 0;
    const steps = Math.max(1, Math.round(u * RINGS * 2));
    const du = u / steps;
    for (let s = 0; s < steps; s++) {
      const uu = (s + 0.5) * du;
      const i = Math.min(RINGS, Math.round(uu * RINGS));
      const kb = Math.min(1, this.prog.bend[i]) * (Math.PI / 0.3) + Math.min(1, this.prog.bend90[i]) * (Math.PI / 2 / 0.12);
      a += kb * du;
      x += Math.cos(a) * du * L; y += Math.sin(a) * du * L;
    }
    return { p: new THREE.Vector3(x, y, 0), tx: new THREE.Vector3(Math.cos(a), Math.sin(a), 0), ny: new THREE.Vector3(-Math.sin(a), Math.cos(a), 0) };
  }

  rebuild(): void {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const S = 8, st = this.stock;
    for (let i = 0; i <= RINGS; i++) {
      const u = i / RINGS;
      const f = this.frame(u);
      const pt = Math.min(1, this.prog.point[i]), tp = Math.min(1, this.prog.taper[i]), hd = Math.min(1, this.prog.head[i]);
      // how far along the zone the point/taper is: sharper toward the end
      const toEnd = Math.max(0, (u - 0.55) / 0.45);
      let w = st.w, t = st.t;
      w *= 1 - pt * (0.25 + 0.7 * toEnd);
      t *= 1 - pt * (0.25 + 0.7 * toEnd);
      t *= 1 - tp * (0.35 + 0.55 * toEnd);
      w *= 1 + tp * (st.kind === 'flat' ? 0.35 * toEnd : 0.08);
      w *= 1 + hd * 0.9; t *= 1 + hd * 0.9;
      const dg = this.dings[i];
      t *= 1 - dg * 0.25;
      for (let k = 0; k < S; k++) {
        // a square with chamfered corners
        const a = (k / S) * Math.PI * 2 + Math.PI / 8;
        const cx = Math.cos(a), cy = Math.sin(a);
        const m = Math.max(Math.abs(cx), Math.abs(cy));
        const z = (cx / m) * (w / 2) * 0.92, yy = (cy / m) * (t / 2) * 0.92;
        const p = f.p.clone().addScaledVector(f.ny, yy).add(new THREE.Vector3(0, 0, z));
        pos.setXYZ(i * S + k, p.x, p.y, p.z);
      }
    }
    const c0 = (RINGS + 1) * S;
    const f0 = this.frame(0), f1 = this.frame(1);
    pos.setXYZ(c0, f0.p.x - 0.001, f0.p.y, f0.p.z);
    pos.setXYZ(c0 + 1, f1.p.x + f1.tx.x * 0.002, f1.p.y + f1.tx.y * 0.002, f1.p.z);
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.paintHeat();
  }

  /** where along the bar a world point is (0..1), and the local point */
  uAt(world: THREE.Vector3): number {
    const l = this.mesh.worldToLocal(world.clone());
    let best = 0, bd = 1e9;
    for (let i = 0; i <= RINGS; i++) { const d = this.frame(i / RINGS).p.distanceTo(l); if (d < bd) { bd = d; best = i / RINGS; } }
    return best;
  }
  /** world position of the bar's centreline at u */
  at(u: number, out = new THREE.Vector3()): THREE.Vector3 { return out.copy(this.frame(u).p).applyMatrix4(this.mesh.matrixWorld); }

  /** recolour from the temperature (call after T changes) */
  paintHeat(): void {
    const S = 8;
    const c = new THREE.Color();
    for (let i = 0; i <= RINGS; i++) {
      const u = i / RINGS;
      const Ti = 20 + (this.T - 20) * (0.55 + 0.45 * THREE.MathUtils.smoothstep(u, 0.0, 0.35));
      heatColor(Ti, c);
      for (let k = 0; k < S; k++) this.heatAttr.setXYZ(i * S + k, c.r, c.g, c.b);
    }
    const ce = heatColor(this.T, c);
    this.heatAttr.setXYZ((RINGS + 1) * S, 0, 0, 0);
    this.heatAttr.setXYZ((RINGS + 1) * S + 1, ce.r, ce.g, ce.b);
    this.heatAttr.needsUpdate = true;
    const m = this.mesh.material as THREE.MeshStandardMaterial;
    m.color.setRGB(0.55 + this.bright * 0.5, 0.53 + this.bright * 0.5, 0.52 + this.bright * 0.52);
    m.roughness = 0.6 - this.bright * 0.35;
  }

  /** quality from the shape: how evenly the zone was worked, minus dings */
  shapeQuality(op: Op, zone: [number, number]): number {
    const p = this.prog[op];
    let s = 0, n = 0, dev = 0;
    for (let i = 0; i <= RINGS; i++) { const u = i / RINGS; if (u >= zone[0] && u <= zone[1]) { s += Math.min(1, p[i]); dev += Math.abs(1 - Math.min(1.15, p[i])); n++; } }
    let dg = 0;
    for (let i = 0; i <= RINGS; i++) dg += this.dings[i];
    return Math.max(0, Math.min(1, (n ? s / n : 0) - (n ? dev / n : 0) * 0.3 - dg * 0.04));
  }
}
