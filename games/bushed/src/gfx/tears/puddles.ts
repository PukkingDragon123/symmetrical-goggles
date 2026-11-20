// Puddles of tears on the ground: one instanced draw for all of them (drip puddles, the tear spots they leave, the
// sheet a dissolving squonk becomes).
//
// A puddle is a volume of water with an edge in 8 sectors. While it is deeper than the film the ground can hold it
// spreads like a gravity current (front speed ~ sqrt(g h)), faster down the slope and drawing back up it, and the
// whole puddle creeps a little downhill; meanwhile it soaks in (volume lost in proportion to its area). Two puddles that
// meet run together. When the water has gone the ground stays dark and damp in a halo round where it was, and dries.
// The soaking and the drying run in the shader from timestamps, so a trail of spots keeps drying while nobody
// simulates it.
import * as THREE from 'three';
import { puddleMaterial } from './water';

const G = 9.81, SEC = 8, DA = (Math.PI * 2) / SEC;
const COS = Array.from({ length: SEC }, (_, k) => Math.cos(k * DA)), SIN = Array.from({ length: SEC }, (_, k) => Math.sin(k * DA));

export interface PuddleKind {
  /** the film the ground holds (m): thinner than this, the edge stops */
  hMin: number;
  /** soaking in (m of depth per second) */
  soak: number;
  /** seconds the damp ground takes to dry after the water has gone */
  dry: number;
  /** damp halo radius / water radius (wicking into moss and soil) */
  halo: number;
}
export const DRIP: PuddleKind = { hMin: 0.0008, soak: 0.00004, dry: 110, halo: 1.7 };
export const SHEET: PuddleKind = { hMin: 0.0025, soak: 0.000004, dry: 60, halo: 1.12 };

export class Puddles {
  readonly mesh: THREE.InstancedMesh;
  readonly uNow = { value: 0 };
  readonly cap: number;
  /** puddles alive, the sheet's slot (-1 none) */
  count = 0; sheet = -1;
  private live: Uint8Array; private isSheet: Uint8Array; private moving: Uint8Array;
  private cx: Float32Array; private cy: Float32Array; private cz: Float32Array; private gx: Float32Array; private gz: Float32Array;
  private R: Float32Array; private halo: Float32Array;
  /** water volume (m3) at time tV, the time it was made */
  private V: Float32Array; private tV: Float32Array; private born: Float32Array; private seed: Float32Array;
  private aR0: THREE.InstancedBufferAttribute; private aR1: THREE.InstancedBufferAttribute; private aP: THREE.InstancedBufferAttribute; private aQ: THREE.InstancedBufferAttribute;
  private dirty = false; private mergeT = 0; private hiWater = 0;
  constructor(cap = 120) {
    this.cap = cap;
    const geo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aR0 = mk(); this.aR1 = mk(); this.aP = mk(); this.aQ = mk();
    geo.setAttribute('aR0', this.aR0); geo.setAttribute('aR1', this.aR1); geo.setAttribute('aP', this.aP); geo.setAttribute('aQ', this.aQ);
    this.mesh = new THREE.InstancedMesh(geo, puddleMaterial(this.uNow), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.name = 'tearPuddles'; this.mesh.renderOrder = 1;
    this.live = new Uint8Array(cap); this.isSheet = new Uint8Array(cap); this.moving = new Uint8Array(cap);
    const f = () => new Float32Array(cap);
    this.cx = f(); this.cy = f(); this.cz = f(); this.gx = f(); this.gz = f(); this.halo = f(); this.V = f(); this.tV = f(); this.born = f(); this.seed = f();
    this.R = new Float32Array(cap * SEC);
    const e = this.mesh.instanceMatrix.array as Float32Array; e.fill(0);
  }
  private kind(i: number) { return this.isSheet[i] ? SHEET : DRIP; }
  private area(i: number) { let a = 0; for (let k = 0; k < SEC; k++) { const r = this.R[i * SEC + k]; a += r * r; } return a * DA * 0.5; }
  private meanR(i: number) { let a = 0; for (let k = 0; k < SEC; k++) a += this.R[i * SEC + k]; return a / SEC; }
  /** water left now (m3), after soaking since tV */
  private water(i: number, now: number) { return Math.max(0, this.V[i] - this.kind(i).soak * this.area(i) * (now - this.tV[i])); }
  /** a free slot: an unused one, or the spot that has dried the longest (never the sheet) */
  private alloc(now: number): number {
    for (let i = 0; i < this.cap; i++) if (!this.live[i]) return i;
    let best = -1, bt = Infinity;
    for (let i = 0; i < this.cap; i++) { if (this.isSheet[i]) continue; const t = this.water(i, now) > 0 ? now : this.born[i]; if (t < bt) { bt = t; best = i; } }
    return best;
  }
  private terrain(i: number, heightAt: (x: number, z: number) => number) {
    const x = this.cx[i], z = this.cz[i], e = 0.05;
    this.gx[i] = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e); this.gz[i] = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    this.cy[i] = heightAt(x, z);
  }

  /** water lands at (x, z): it joins a puddle it falls into (or wets a damp spot again), else makes a new one.
   *  `settled` makes a spot already spread out (the cheap far-off trail). Returns the puddle. */
  add(x: number, z: number, vol: number, now: number, heightAt: (x: number, z: number) => number, settled = false): number {
    // into a puddle it lands in (the sheet first)
    let into = -1, bd = Infinity;
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i]) continue;
      const d = Math.hypot(x - this.cx[i], z - this.cz[i]), reach = this.meanR(i) * (this.isSheet[i] ? 1.05 : 1.0) + 0.004;
      if (d < reach && (this.isSheet[i] ? -1 : d) < bd) { bd = this.isSheet[i] ? -1 : d; into = i; }
    }
    if (into >= 0) {
      const w = this.water(into, now);
      if (this.isSheet[into]) return into;              // the sheet's volume is the body's; a drop only ripples it
      this.V[into] = w + vol; this.tV[into] = now; this.moving[into] = 1; this.dirty = true;
      return into;
    }
    const i = this.alloc(now); if (i < 0) return -1;
    this.live[i] = 1; this.isSheet[i] = 0; this.moving[i] = settled ? 0 : 1;
    this.cx[i] = x; this.cz[i] = z; this.terrain(i, heightAt);
    const r0 = settled ? Math.sqrt(vol / (Math.PI * DRIP.hMin)) : Math.max(0.003, Math.cbrt(vol) * 0.9);
    for (let k = 0; k < SEC; k++) this.R[i * SEC + k] = r0 * (0.9 + 0.2 * hash(i * 7 + k, now));
    this.halo[i] = r0 * DRIP.halo; this.V[i] = vol; this.tV[i] = now; this.born[i] = now; this.seed[i] = (hash(i, now) * 97) % 17;
    this.count++; this.dirty = true;
    return i;
  }

  /** the dissolve sheet: begin it at (x, z), then each frame set the volume the melted body has become; it spreads
   *  out over the ground, runs downhill, and draws back as the volume is taken back */
  sheetAt(x: number, z: number, now: number, heightAt: (x: number, z: number) => number) {
    if (this.sheet >= 0) return;
    const i = this.alloc(now); if (i < 0) return;
    this.sheet = i; this.live[i] = 1; this.isSheet[i] = 1; this.moving[i] = 1;
    this.cx[i] = x; this.cz[i] = z; this.terrain(i, heightAt);
    for (let k = 0; k < SEC; k++) this.R[i * SEC + k] = 0.12;
    this.halo[i] = 0.12; this.V[i] = 0; this.tV[i] = now; this.born[i] = now; this.seed[i] = 5.5; this.count++;
  }
  sheetVolume(vol: number, now: number) {
    const i = this.sheet; if (i < 0) return;
    const was = this.V[i];
    if (vol < was && was > 0) {
      // drawn back: the edge pulls in as the water goes back into the body
      const k = Math.sqrt(Math.max(0, vol) / was);
      for (let s = 0; s < SEC; s++) this.R[i * SEC + s] = Math.max(0.02, this.R[i * SEC + s] * (0.15 + 0.85 * k));
    }
    this.V[i] = Math.max(0, vol); this.tV[i] = now; this.moving[i] = 1; this.dirty = true;
  }
  /** all of it taken back: the ground it covered stays damp a while */
  sheetEnd(now: number) {
    const i = this.sheet; if (i < 0) return;
    this.isSheet[i] = 0; this.V[i] = 0; this.tV[i] = now; this.moving[i] = 0; this.sheet = -1; this.dirty = true;
    this.halo[i] = Math.max(this.halo[i], 0.2);
  }
  /** the sheet's mean radius (m), 0 when there is none */
  get sheetR() { return this.sheet >= 0 ? this.meanR(this.sheet) : 0; }

  /** spread, run downhill, soak in, run together */
  update(dt: number, now: number, heightAt: (x: number, z: number) => number) {
    this.uNow.value = now;
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i] || !this.moving[i]) continue;
      const K = this.kind(i), A = this.area(i), w = this.water(i, now);
      this.V[i] = w; this.tV[i] = now;
      const h = A > 0 ? w / A : 0;
      if (h <= K.hMin * 1.02 && !this.isSheet[i]) { this.moving[i] = 0; this.dirty = true; continue; }
      if (this.isSheet[i]) this.terrain(i, heightAt);
      const spread = Math.sqrt(G * h) * Math.max(0, (h - K.hMin) / Math.max(h, 1e-6));
      const x = this.cx[i], z = this.cz[i], o = i * SEC;
      for (let k = 0; k < SEC; k++) {
        const r = this.R[o + k];
        // the slope at the front, downhill positive
        let s: number;
        if (this.isSheet[i]) { const fx = x + COS[k] * r, fz = z + SIN[k] * r; s = (heightAt(fx, fz) - heightAt(fx + COS[k] * 0.06, fz + SIN[k] * 0.06)) / 0.06; }
        else s = -(this.gx[i] * COS[k] + this.gz[i] * SIN[k]);
        const thick = Math.min(3, Math.max(0, h / K.hMin - 0.5));
        let u = spread + 1.4 * s * thick * Math.sqrt(G * Math.max(h, K.hMin)) * 0.5;
        if (h < K.hMin) u = Math.min(u, 0) - 0.02 * (1 - h / K.hMin) * (this.isSheet[i] ? 1 : 0);
        this.R[o + k] = Math.min(this.isSheet[i] ? 1.6 : 0.35, Math.max(0.004, r + u * dt));
      }
      // the edge's own tension evens it out a little
      for (let k = 0; k < SEC; k++) _t[k] = this.R[o + k];
      for (let k = 0; k < SEC; k++) this.R[o + k] = 0.8 * _t[k] + 0.1 * (_t[(k + 1) % SEC] + _t[(k + SEC - 1) % SEC]);
      // a thick puddle creeps downhill
      if (!this.isSheet[i] && h > K.hMin * 1.3) {
        const c = 0.04 * Math.min(1, h / K.hMin - 1.3) * dt;
        this.cx[i] -= this.gx[i] * c; this.cz[i] -= this.gz[i] * c; this.cy[i] = heightAt(this.cx[i], this.cz[i]);
      }
      this.halo[i] = Math.max(this.halo[i], this.meanR(i) * K.halo);
      this.dirty = true;
    }
    // puddles that have spread into each other run together (a few times a second)
    this.mergeT += dt;
    if (this.mergeT > 0.12) {
      this.mergeT = 0;
      for (let i = 0; i < this.cap; i++) {
        if (!this.live[i] || !this.moving[i]) continue;
        for (let j = 0; j < this.cap; j++) {
          if (j === i || !this.live[j] || this.isSheet[j]) continue;
          const wj = this.water(j, now); if (wj <= 0) continue;
          const d = Math.hypot(this.cx[i] - this.cx[j], this.cz[i] - this.cz[j]);
          if (d > 0.85 * (this.meanR(i) + this.meanR(j))) continue;
          this.merge(i, j, now);
        }
      }
    }
  }
  private merge(i: number, j: number, now: number) {
    const wi = this.water(i, now), wj = this.water(j, now), sheet = !!this.isSheet[i];
    const k = sheet ? 0 : wj / Math.max(1e-12, wi + wj);
    const nx = this.cx[i] + (this.cx[j] - this.cx[i]) * k, nz = this.cz[i] + (this.cz[j] - this.cz[i]) * k;
    // the new edge in each sector: as far as either puddle reached that way from the new centre
    for (let s = 0; s < SEC; s++) {
      const ri = this.R[i * SEC + s] + (this.cx[i] - nx) * COS[s] + (this.cz[i] - nz) * SIN[s];
      const rj = this.R[j * SEC + s] + (this.cx[j] - nx) * COS[s] + (this.cz[j] - nz) * SIN[s];
      _t[s] = Math.max(0.004, ri, rj);
    }
    for (let s = 0; s < SEC; s++) this.R[i * SEC + s] = _t[s];
    this.halo[i] = Math.max(this.halo[i], this.halo[j] + Math.hypot(this.cx[j] - nx, this.cz[j] - nz));
    this.cx[i] = nx; this.cz[i] = nz;
    if (!sheet) this.V[i] = wi + wj;
    this.tV[i] = now; this.moving[i] = 1;
    this.live[j] = 0; this.moving[j] = 0; this.count--; this.dirty = true;
    const e = this.mesh.instanceMatrix.array as Float32Array; for (let q = 0; q < 16; q++) e[j * 16 + q] = 0;
  }

  /** write the instances (only when something changed) */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const E = this.mesh.instanceMatrix.array as Float32Array, R0 = this.aR0.array as Float32Array, R1 = this.aR1.array as Float32Array, P = this.aP.array as Float32Array, Q = this.aQ.array as Float32Array;
    let hi = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.live[i]) continue;
      hi = i + 1;
      const o = i * SEC, K = this.kind(i), A = this.area(i);
      let rmax = 0; for (let k = 0; k < SEC; k++) rmax = Math.max(rmax, this.R[o + k]);
      const S = Math.max(rmax * 1.25, this.halo[i] * 1.15, 0.01);
      for (let k = 0; k < 4; k++) { R0[i * 4 + k] = this.R[o + k] / S; R1[i * 4 + k] = this.R[o + 4 + k] / S; }
      // depth (mm) now and how fast it soaks away (mm/s)
      P[i * 4] = A > 0 ? (this.V[i] / A) * 1000 : 0; P[i * 4 + 1] = K.soak * 1000; P[i * 4 + 2] = this.tV[i]; P[i * 4 + 3] = this.halo[i] / S;
      Q[i * 4] = K.dry; Q[i * 4 + 1] = this.seed[i]; Q[i * 4 + 2] = S; Q[i * 4 + 3] = this.isSheet[i];
      // tilt the quad onto the ground's slope (the shortest turn from +y to the ground normal), scale it to S
      let nx = -this.gx[i], ny = 1, nz = -this.gz[i]; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const kk = 1 / (1 + ny), e = i * 16;
      E[e] = (1 - kk * nx * nx) * S; E[e + 1] = -nx * S; E[e + 2] = -kk * nx * nz * S; E[e + 3] = 0;
      E[e + 4] = nx; E[e + 5] = ny; E[e + 6] = nz; E[e + 7] = 0;
      E[e + 8] = -kk * nx * nz * S; E[e + 9] = -nz * S; E[e + 10] = (1 - kk * nz * nz) * S; E[e + 11] = 0;
      E[e + 12] = this.cx[i]; E[e + 13] = this.cy[i] + 0.004; E[e + 14] = this.cz[i]; E[e + 15] = 1;
    }
    this.hiWater = hi;
    this.mesh.count = hi;
    this.mesh.instanceMatrix.needsUpdate = true; this.aR0.needsUpdate = true; this.aR1.needsUpdate = true; this.aP.needsUpdate = true; this.aQ.needsUpdate = true;
  }
  /** drop the spots that have dried for good (cheap housekeeping, every few seconds) */
  sweep(now: number) {
    for (let i = 0; i < this.hiWater; i++) {
      if (!this.live[i] || this.isSheet[i]) continue;
      const K = this.kind(i), A = this.area(i);
      const gone = this.tV[i] + (A > 0 ? this.V[i] / (K.soak * A) : 0);
      if (now > gone + K.dry + 1) { this.live[i] = 0; this.count--; this.dirty = true; const e = this.mesh.instanceMatrix.array as Float32Array; for (let q = 0; q < 16; q++) e[i * 16 + q] = 0; }
    }
  }
  /** a puddle's centre and mean radius (tests) */
  info(i: number) { return { x: this.cx[i], z: this.cz[i], r: this.meanR(i), water: this.V[i], live: !!this.live[i], sheet: !!this.isSheet[i] }; }
}
const _t = new Float32Array(SEC);
function hash(a: number, b: number) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
