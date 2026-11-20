// Trample map: a 64 m window (256 px = 25 cm/px) that follows the player and remembers where plants were pressed
// flat. Every active vegetation pusher (G.uPushers: player, hound, creatures, the Jeep and trailer) paints a capsule
// along its path as it moves: R = how flat (repeated passes wear a path in), G/B = the direction of travel (the
// blades lie along it). It recovers slowly (about seven minutes from fully flat), so paths you walk and tracks you
// drive stay visible for a while. The vegetation vertex shader samples it (veg/material.ts), together with the wheel
// ruts in the marks map.
import * as THREE from 'three';
import { G, MAX_PUSHERS } from '../../gfx/globals';

const RES = 256;
const SIZE = 64;
const STEP = 8;
const PX = SIZE / RES;

class Trample {
  readonly data = new Uint8Array(RES * RES * 4);
  readonly texture: THREE.DataTexture;
  /** xy = window min corner (world xz), z = size (m) */
  readonly uWin = { value: new THREE.Vector3(-SIZE / 2, -SIZE / 2, SIZE) };
  private last = Array.from({ length: MAX_PUSHERS }, () => new THREE.Vector3(1e9, 0, 0));
  private decayT = 0;
  private dirty = false;
  private upT = 0;
  private tmp = new Uint8Array(RES * RES * 4);

  constructor() {
    for (let i = 0; i < RES * RES; i++) { this.data[i * 4 + 1] = 128; this.data[i * 4 + 2] = 128; this.data[i * 4 + 3] = 255; }
    this.texture = new THREE.DataTexture(this.data, RES, RES, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
  }

  /** keep the window around (x, z): shifts the content in 8 m steps */
  private follow(x: number, z: number): void {
    const w = this.uWin.value;
    const cx = w.x + SIZE / 2, cz = w.y + SIZE / 2;
    if (Math.abs(x - cx) < STEP && Math.abs(z - cz) < STEP) return;
    const nx = Math.round((x - SIZE / 2) / STEP) * STEP, nz = Math.round((z - SIZE / 2) / STEP) * STEP;
    const dx = Math.round((nx - w.x) / PX), dz = Math.round((nz - w.y) / PX);
    const src = this.data, dst = this.tmp;
    for (let j = 0; j < RES; j++) {
      const sj = j + dz;
      for (let i = 0; i < RES; i++) {
        const si = i + dx, o = (j * RES + i) * 4;
        if (si < 0 || sj < 0 || si >= RES || sj >= RES) { dst[o] = 0; dst[o + 1] = 128; dst[o + 2] = 128; dst[o + 3] = 255; continue; }
        const so = (sj * RES + si) * 4;
        dst[o] = src[so]; dst[o + 1] = src[so + 1]; dst[o + 2] = src[so + 2]; dst[o + 3] = 255;
      }
    }
    src.set(dst);
    w.x = nx; w.y = nz;
    this.dirty = true;
  }

  /** press plants flat along a segment (world xz), radius r (m), strength 0..1 per pass */
  stroke(x0: number, z0: number, x1: number, z1: number, r: number, amt: number): void {
    const w = this.uWin.value;
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const ux = L > 1e-4 ? dx / L : 0, uz = L > 1e-4 ? dz / L : 0;
    const gx = Math.round(127.5 + ux * 127), gz = Math.round(127.5 + uz * 127);
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - r - w.x) / PX)), i1 = Math.min(RES - 1, Math.ceil((Math.max(x0, x1) + r - w.x) / PX));
    const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - r - w.y) / PX)), j1 = Math.min(RES - 1, Math.ceil((Math.max(z0, z1) + r - w.y) / PX));
    const d = this.data;
    for (let j = j0; j <= j1; j++) {
      const pz = w.y + (j + 0.5) * PX;
      for (let i = i0; i <= i1; i++) {
        const px = w.x + (i + 0.5) * PX;
        const t = L > 1e-4 ? Math.max(0, Math.min(1, ((px - x0) * ux + (pz - z0) * uz) / L)) : 0;
        const ex = px - (x0 + dx * t), ez = pz - (z0 + dz * t);
        const e = Math.sqrt(ex * ex + ez * ez) / r;
        if (e >= 1) continue;
        const k = (1 - e * e) * amt;
        const o = (j * RES + i) * 4;
        const cur = d[o];
        d[o] = Math.min(255, cur + Math.round(k * 255 * (1 - cur / 320)));
        if (L > 1e-4) {
          // blend the lying direction toward this pass's direction of travel
          const f = Math.min(1, k * 1.5);
          d[o + 1] = Math.round(d[o + 1] + (gx - d[o + 1]) * f);
          d[o + 2] = Math.round(d[o + 2] + (gz - d[o + 2]) * f);
        }
      }
    }
    this.dirty = true;
  }

  update(dt: number, cx: number, cz: number): void {
    this.follow(cx, cz);
    const P = G.uPushers.value;
    for (let s = 0; s < MAX_PUSHERS; s++) {
      const p = P[s], l = this.last[s];
      if (p.w <= 0 || p.y < -500) { l.x = 1e9; continue; }
      if (l.x > 1e8) { l.set(p.x, p.y, p.z); continue; }
      const mv = Math.hypot(p.x - l.x, p.z - l.z);
      if (mv > 6) { l.set(p.x, p.y, p.z); continue; } // teleport
      if (mv < 0.18) continue;
      // body radius -> the strip of flattened plants (vehicles press harder)
      const veh = s >= 5;
      this.stroke(l.x, l.z, p.x, p.z, veh ? p.w * 0.85 : Math.max(0.28, p.w * 0.75), veh ? 0.5 : 0.13);
      l.set(p.x, p.y, p.z);
    }
    // slow recovery: 1/255 every 1.6 s (about seven minutes from flat)
    this.decayT += dt;
    if (this.decayT > 1.6) {
      this.decayT = 0;
      const d = this.data;
      for (let o = 0; o < d.length; o += 4) if (d[o] > 0) d[o]--;
      this.dirty = true;
    }
    this.upT += dt;
    if (this.dirty && this.upT > 0.12) { this.texture.needsUpdate = true; this.dirty = false; this.upT = 0; }
  }
}

export const trample = new Trample();
