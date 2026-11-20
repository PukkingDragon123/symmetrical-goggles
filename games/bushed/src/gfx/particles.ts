// Particles. Two systems, both single instanced draws:
//   debris  - small solid bits (wood chips, bark flakes, splinters, sawdust, needles, leaves, twigs, sparks)
//             simulated on the CPU with gravity, drag, flutter, terrain bounce and settling. Settled chips stay
//             on the ground for minutes (chopping leaves a carpet of chips around the stump).
//   puffs   - soft camera-facing sprites (dust, breath condensation, smoke, steam, sawdust clouds).
import * as THREE from 'three';
import { heightAt } from '../world/layout';
import { G } from './globals';

export type DebrisKind = 'chip' | 'bark' | 'splinter' | 'sawdust' | 'needle' | 'leaf' | 'twig' | 'spark' | 'ember' | 'birchbark';

interface D {
  p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; s: THREE.Vector3;
  life: number; max: number; settled: boolean; kind: DebrisKind; flutter: number; col: THREE.Color; tile: number; glow: number;
}

const MAX = 1400;
// atlas: 4x2 tiles painted in code
const TILES: Record<DebrisKind, number> = { chip: 0, bark: 1, splinter: 2, sawdust: 3, needle: 4, leaf: 5, twig: 6, spark: 7, ember: 7, birchbark: 1 };

function paintAtlas(): THREE.CanvasTexture {
  const T = 32;
  const c = document.createElement('canvas');
  c.width = T * 4; c.height = T * 2;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const tile = (i: number, fn: (x: number, y: number) => void) => { g.save(); g.translate((i % 4) * T, Math.floor(i / 4) * T); fn(0, 0); g.restore(); };
  // chip: irregular pale wedge with fibres
  tile(0, () => {
    g.fillStyle = '#e9d6ae'; g.beginPath(); g.moveTo(4, 10); g.lineTo(27, 5); g.lineTo(29, 20); g.lineTo(8, 27); g.closePath(); g.fill();
    g.fillStyle = '#cdb58a'; for (let k = 0; k < 6; k++) g.fillRect(6 + k * 3.5, 9 + (k % 2) * 3, 2, 14);
    g.fillStyle = '#6b4e36'; g.fillRect(4, 10, 23, 2);
  });
  // bark flake
  tile(1, () => {
    g.fillStyle = '#5c4434'; g.beginPath(); g.moveTo(3, 8); g.lineTo(28, 4); g.lineTo(26, 26); g.lineTo(6, 29); g.closePath(); g.fill();
    g.fillStyle = '#3e2c22'; for (let k = 0; k < 5; k++) g.fillRect(5, 8 + k * 4, 21, 1);
    g.fillStyle = '#7a5c46'; g.fillRect(8, 12, 6, 2); g.fillRect(16, 20, 7, 2);
  });
  // splinter
  tile(2, () => { g.fillStyle = '#e4cfa3'; g.beginPath(); g.moveTo(2, 15); g.lineTo(30, 13); g.lineTo(30, 16); g.lineTo(2, 19); g.closePath(); g.fill(); g.fillStyle = '#b89b6d'; g.fillRect(4, 16, 24, 1); });
  // sawdust: speckle
  tile(3, () => { g.fillStyle = '#e8d3a6'; for (let k = 0; k < 18; k++) g.fillRect((k * 7) % 28 + 2, (k * 11) % 28 + 2, 3, 3); });
  // needle
  tile(4, () => { g.fillStyle = '#3f5a2c'; g.fillRect(2, 15, 28, 2); g.fillStyle = '#56713a'; g.fillRect(4, 15, 22, 1); });
  // leaf (birch, yellowing)
  tile(5, () => {
    g.fillStyle = '#a8a53c'; g.beginPath(); g.ellipse(16, 16, 12, 8, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7d7e2a'; g.fillRect(6, 15, 20, 1);
  });
  // twig
  tile(6, () => { g.fillStyle = '#4a3627'; g.fillRect(2, 14, 28, 3); g.fillRect(14, 8, 2, 7); g.fillStyle = '#6a4f3a'; g.fillRect(2, 14, 28, 1); });
  // spark (white-hot, tinted by instance colour)
  tile(7, () => { g.fillStyle = '#ffffff'; g.fillRect(12, 12, 8, 8); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(9, 14, 14, 4); g.fillRect(14, 9, 4, 14); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  return t;
}

class Debris {
  readonly mesh: THREE.InstancedMesh;
  private list: D[] = [];
  private tileAttr: THREE.InstancedBufferAttribute;
  private glowAttr: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aTile', this.tileAttr);
    geo.setAttribute('aGlow', this.glowAttr);
    const mat = new THREE.MeshStandardMaterial({ map: paintAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile; attribute float aGlow; varying float vGlow;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vMapUv = (uv + vec2(mod(aTile, 4.0), 1.0 - floor(aTile / 4.0))) * vec2(0.25, 0.5);
          vGlow = aGlow;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 6.0;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  }

  /** emit n pieces at p with base velocity v (plus spread) */
  emit(kind: DebrisKind, p: THREE.Vector3, v: THREE.Vector3, n: number, o: { spread?: number; size?: number; color?: THREE.Color; life?: number } = {}): void {
    const spread = o.spread ?? 1.5;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX) {
        // recycle the oldest settled piece
        const k = this.list.findIndex((d) => d.settled);
        if (k < 0) return;
        this.list.splice(k, 1);
      }
      const base = o.size ?? ({ chip: 0.05, bark: 0.06, splinter: 0.09, sawdust: 0.012, needle: 0.03, leaf: 0.045, twig: 0.12, spark: 0.012, ember: 0.02, birchbark: 0.06 } as Record<DebrisKind, number>)[kind];
      const sz = base * (0.6 + Math.random() * 0.8);
      const life = (o.life ?? ({ chip: 240, bark: 200, splinter: 200, sawdust: 30, needle: 60, leaf: 90, twig: 200, spark: 1.2, ember: 2.5, birchbark: 200 } as Record<DebrisKind, number>)[kind]) * (0.7 + Math.random() * 0.6);
      const col = (o.color ?? new THREE.Color(1, 1, 1)).clone().multiplyScalar(0.85 + Math.random() * 0.3);
      this.list.push({
        p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05)),
        v: v.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.8, (Math.random() - 0.5) * spread)),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        w: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
        s: new THREE.Vector3(sz * (kind === 'splinter' || kind === 'needle' || kind === 'twig' ? 1 : 1), sz * (kind === 'splinter' || kind === 'needle' ? 0.35 : 0.8), 1),
        life, max: life, settled: false, kind, flutter: kind === 'leaf' || kind === 'needle' || kind === 'sawdust' || kind === 'birchbark' ? 1 : 0,
        col, tile: TILES[kind], glow: kind === 'spark' || kind === 'ember' ? 1 : 0,
      });
    }
  }

  private dq = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private tmpCol = new THREE.Color();
  private settleE = new THREE.Euler();
  private t = 0;

  update(dt: number): void {
    const wind = G.uWindDir.value, ws = G.uWindStrength.value;
    const dq = this.dq;
    this.t += dt;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.life -= dt;
      if (d.life <= 0) { this.list.splice(i, 1); continue; }
      if (!d.settled) {
        const drag = d.flutter ? 3.2 : d.glow ? 0.6 : 0.25;
        d.v.y -= (d.glow ? (d.kind === 'ember' ? -0.4 : 2) : 9.81) * dt * (d.flutter ? 0.35 : 1);
        d.v.x += (wind.x * ws * 2.5 - d.v.x) * Math.min(1, drag * dt) * (d.flutter ? 1 : 0.2);
        d.v.z += (wind.y * ws * 2.5 - d.v.z) * Math.min(1, drag * dt) * (d.flutter ? 1 : 0.2);
        if (d.flutter) { d.v.x += Math.sin(d.life * 7 + i) * dt * 1.5; d.v.z += Math.cos(d.life * 6 + i) * dt * 1.5; d.v.y *= 1 - dt * 2.5; }
        if (d.kind === 'ember') {
          // embers ride the fire's updraft in lazy spirals, then wink out
          d.v.x += Math.sin(this.t * 3.1 + i * 1.7) * dt * 1.8; d.v.z += Math.cos(this.t * 2.7 + i * 2.3) * dt * 1.8;
          d.v.y += dt * 0.6 * Math.max(0, d.life / d.max);
        }
        d.p.addScaledVector(d.v, dt);
        const wl = d.w.length();
        if (wl > 1e-3) { dq.setFromAxisAngle(this.axis.copy(d.w).divideScalar(wl), wl * dt); d.q.premultiply(dq); }
        const gy = heightAt(d.p.x, d.p.z) + 0.004;
        if (d.p.y < gy) {
          d.p.y = gy;
          if (d.glow) { d.life = Math.min(d.life, 0.3); }
          if (Math.abs(d.v.y) < 0.8 || d.flutter) {
            d.settled = true;
            // lie flat on the ground with a random yaw
            d.q.setFromEuler(this.settleE.set(-Math.PI / 2, 0, Math.random() * 6.28));
          } else {
            d.v.y = -d.v.y * 0.25; d.v.x *= 0.5; d.v.z *= 0.5; d.w.multiplyScalar(0.5);
          }
        }
      }
      const fade = Math.min(1, d.life / Math.min(3, d.max * 0.2));
      this.dummy.position.copy(d.p);
      this.dummy.quaternion.copy(d.q);
      this.dummy.scale.copy(d.s).multiplyScalar(d.glow ? fade : Math.max(0.2, fade));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      if (d.glow) {
        // hot embers cool from white-gold through orange to a dull red as they fly; sparks flicker
        const age = 1 - d.life / d.max;
        const fl = d.kind === 'ember' ? 0.75 + 0.25 * Math.sin(this.t * 31 + i * 7.3) : 1;
        this.tmpCol.setRGB(1, Math.max(0.12, 0.85 - age * 0.9), Math.max(0.02, 0.45 - age * 0.8)).multiply(d.col).multiplyScalar(fade * fl);
        this.mesh.setColorAt(n, this.tmpCol);
      } else this.mesh.setColorAt(n, d.col);
      this.tileAttr.setX(n, d.tile);
      this.glowAttr.setX(n, d.glow * fade);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.tileAttr.needsUpdate = true;
    this.glowAttr.needsUpdate = true;
  }

  /** chips settled within r of p (to sweep them up / for kindling) */
  settledNear(p: THREE.Vector3, r: number): number { return this.list.filter((d) => d.settled && d.p.distanceTo(p) < r).length; }
}

interface P { p: THREE.Vector3; v: THREE.Vector3; size: number; grow: number; life: number; max: number; col: THREE.Color; alpha: number; rise: number }

class Puffs {
  readonly mesh: THREE.InstancedMesh;
  private list: P[] = [];
  private alphaAttr: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();
  private cam: THREE.Camera | null = null;

  constructor() {
    const N = 600;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const img = g.createImageData(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 16;
      const n = Math.sin(x * 3.1 + y * 1.7) * 0.08 + Math.sin(x * 0.9 - y * 2.3) * 0.08;
      const a = Math.max(0, 1 - d * d * 1.2 + n);
      const o = (y * 32 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(Math.min(1, a) * 4) / 4 * 255; // stepped alpha: pixel-art puffs
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    geo.setAttribute('aAlpha', this.alphaAttr);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha; varying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlpha;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  }

  setCamera(c: THREE.Camera): void { this.cam = c; }

  emit(p: THREE.Vector3, v: THREE.Vector3, o: { size?: number; grow?: number; life?: number; color?: THREE.Color; alpha?: number; rise?: number; n?: number; spread?: number } = {}): void {
    const n = o.n ?? 1;
    for (let i = 0; i < n; i++) {
      if (this.list.length >= 600) this.list.shift();
      const sp = o.spread ?? 0.2;
      const life = (o.life ?? 1.5) * (0.8 + Math.random() * 0.4);
      this.list.push({
        p: p.clone(), v: v.clone().add(new THREE.Vector3((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp)),
        size: (o.size ?? 0.3) * (0.8 + Math.random() * 0.4), grow: o.grow ?? 1, life, max: life,
        col: (o.color ?? new THREE.Color(0.8, 0.8, 0.8)).clone(), alpha: o.alpha ?? 0.5, rise: o.rise ?? 0.2,
      });
    }
  }

  update(dt: number): void {
    const wind = G.uWindDir.value, ws = G.uWindStrength.value;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.life -= dt;
      if (d.life <= 0) { this.list.splice(i, 1); continue; }
      d.v.y += d.rise * dt;
      d.v.multiplyScalar(1 - dt * 0.9);
      d.p.addScaledVector(d.v, dt);
      d.p.x += wind.x * ws * dt * 0.8; d.p.z += wind.y * ws * dt * 0.8;
      const t = 1 - d.life / d.max;
      this.dummy.position.copy(d.p);
      if (this.cam) this.dummy.quaternion.copy(this.cam.quaternion);
      const s = d.size * (1 + d.grow * t);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, d.col);
      this.alphaAttr.setX(n, d.alpha * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.05)) );
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}

export const debris = new Debris();
export const puffs = new Puffs();
