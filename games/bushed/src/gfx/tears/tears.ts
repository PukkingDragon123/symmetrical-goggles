// Tears as pixel-art particles, all in one instanced draw (sprites.ts holds the frames and the material).
//
//   const t = new TearSprites({ mesh, sources: [eyeL, eyeR] });   // bind-pose (mesh-local) points at the inner eyes
//   t.addTo(scene);
//   every frame, after the pose:  t.rate = 0.5; t.update({ dt, heightAt, light, glint, sim: near });
//   t.sob(2)            a burst: a couple of drops from each eye now
//   t.dissolve(pos)     a creature melting: a spray of drops and a pool of water that grows and fades
//   t.spot(x, z, h)     a tear spot left on the ground (the trail; lasts two minutes)
//
// Simple physics: a drop swells in the corner of each eye (riding the head), lets go with a small outward kick (plus
// the face's own motion), falls under gravity with a little air drag, and splashes where it meets the ground (4
// frames), leaving a little puddle (a ripple, then it fades in a few seconds). A sob lets the welling drops go at once
// and spills more; a sharp head shake flings them off. Mesh-agnostic: any SkinnedMesh with a head bone and the eye
// points in its bind space.
import * as THREE from 'three';
import { tearAtlas, tearMaterial, CELL, F } from './sprites';

const G = 9.81;
const FREE = 0, DROP = 1, SPLASH = 2, PUDDLE = 3, SPOT = 4, POOL = 5, WELL = 6;

export interface TearSpriteOpts {
  /** the creature's skinned mesh */
  mesh: THREE.SkinnedMesh;
  /** where tears come from: the inner corners of the eyes, bind-pose positions in the mesh's space */
  sources: THREE.Vector3[];
  /** the bone the eyes ride (name or index; default 'head') */
  head?: string | number;
  /** most sprites alive at once */
  max?: number;
  /** world size of one atlas pixel (m) */
  px?: number;
}
export interface TearFrame {
  dt: number;
  heightAt(x: number, z: number): number;
  /** 0 dark .. 1 full light (the sprites are dimmed by it) */
  light?: number;
  /** 0..1: a light by the viewer's eye catches the highlights (a flashlight at night) */
  glint?: number;
  /** false when nobody is near enough to see: no new drops, the rest just runs out */
  sim?: boolean;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3();

export class TearSprites {
  readonly mesh: THREE.Mesh;
  /** tears per second from each eye (each one swells for 1/rate seconds, at most 3); set from the mood every frame */
  rate = 0;
  /** what has happened (tests) */
  readonly stats = { dropped: 0, flung: 0, splashed: 0, live: 0 };
  private readonly max: number; private readonly px: number;
  /** the sources on the skin (bind pose), and the skin's outward normal there */
  private readonly src: THREE.Vector3[]; private readonly srcN: THREE.Vector3[]; private readonly head: number; private readonly skin: THREE.SkinnedMesh;
  private kind: Uint8Array; private P: Float32Array; private V: Float32Array; private age: Float32Array; private life: Float32Array; private size: Float32Array; private frame: Float32Array;
  private aPS: THREE.InstancedBufferAttribute; private aFA: THREE.InstancedBufferAttribute;
  /** the eyes this frame and last (and the skin's normal there), and the mesh's own origin (to tell a head shake from
   *  walking along) */
  private eye: Float32Array; private eyeWas: Float32Array; private eyeN: Float32Array; private org = new THREE.Vector3(); private orgWas = new THREE.Vector3();
  private well: Int16Array; private flingT: Float32Array; private fresh = true;
  private mat: THREE.ShaderMaterial;
  constructor(o: TearSpriteOpts) {
    this.max = o.max ?? 96; this.px = o.px ?? 0.0026;
    this.skin = o.mesh;
    // each source settles onto the skin: the nearest vertex, a few millimetres out along its normal (so the drop sits on
    // the skin, not inside a puffy lid)
    const pos = o.mesh.geometry.attributes.position, nrm = o.mesh.geometry.attributes.normal;
    this.srcN = o.sources.map(() => new THREE.Vector3(0, 0, 1));
    this.src = o.sources.map((v, k) => {
      let best = -1, bd = Infinity;
      for (let i = 0; i < pos.count; i++) { const d = (pos.getX(i) - v.x) ** 2 + (pos.getY(i) - v.y) ** 2 + (pos.getZ(i) - v.z) ** 2; if (d < bd) { bd = d; best = i; } }
      if (best < 0 || !nrm || bd > 0.03 * 0.03) return v.clone();
      this.srcN[k].set(nrm.getX(best), nrm.getY(best), nrm.getZ(best)).normalize();
      return new THREE.Vector3(pos.getX(best), pos.getY(best), pos.getZ(best)).addScaledVector(this.srcN[k], 0.005);
    });
    const bones = o.mesh.skeleton.bones, h = o.head ?? 'head';
    this.head = typeof h === 'number' ? h : Math.max(0, bones.findIndex((b) => b.name === h));
    const n = this.max;
    this.kind = new Uint8Array(n); this.P = new Float32Array(n * 3); this.V = new Float32Array(n * 3);
    this.age = new Float32Array(n); this.life = new Float32Array(n); this.size = new Float32Array(n); this.frame = new Float32Array(n);
    this.eye = new Float32Array(this.src.length * 3); this.eyeWas = new Float32Array(this.src.length * 3); this.eyeN = new Float32Array(this.src.length * 3);
    this.well = new Int16Array(this.src.length).fill(-1); this.flingT = new Float32Array(this.src.length);
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
    this.aPS = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aFA = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPS', this.aPS); geo.setAttribute('aFA', this.aFA);
    geo.instanceCount = 0;
    this.mat = tearMaterial(tearAtlas());
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.name = 'tears'; this.mesh.renderOrder = 2;
  }
  addTo(parent: THREE.Object3D) { if (this.mesh.parent !== parent) parent.add(this.mesh); }

  // ---------------------------------------------------------------------------------------------- spawning
  private alloc(): number {
    for (let i = 0; i < this.max; i++) if (this.kind[i] === FREE) return i;
    // full: the oldest tear spot makes room
    let best = -1, ba = -1;
    for (let i = 0; i < this.max; i++) if (this.kind[i] === SPOT && this.age[i] > ba) { ba = this.age[i]; best = i; }
    return best;
  }
  private put(i: number, k: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, frame: number, life: number) {
    this.kind[i] = k; this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.frame[i] = frame;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z; this.V[i * 3] = vx; this.V[i * 3 + 1] = vy; this.V[i * 3 + 2] = vz;
  }
  /** where a drop sits in the corner of eye e (on the skin) */
  private corner(e: number, out: THREE.Vector3) { return out.set(this.eye[e * 3], this.eye[e * 3 + 1], this.eye[e * 3 + 2]); }
  /** a drop leaves eye e: a small kick outward from the face (and down a little), plus the face's own motion. `i` is
   *  the drop that welled there, or -1 for a new one (a sob spilling more, a fling) */
  private launch(i: number, e: number, dt: number, fling = 0) {
    if (i < 0) { i = this.alloc(); if (i < 0) return; this.frame[i] = F.drop + (fling ? Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3)); }
    if (this.well[e] === i) this.well[e] = -1;
    const o = e * 3, p = this.corner(e, _p);
    // outward: off the skin, level
    let ox = this.eyeN[o], oz = this.eyeN[o + 2]; const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
    const k = 0.08 + Math.random() * 0.16, idt = dt > 0 ? 1 / dt : 0, f = fling ? 1.15 : 1;
    const fx = (this.eye[o] - this.eyeWas[o]) * idt, fy = (this.eye[o + 1] - this.eyeWas[o + 1]) * idt, fz = (this.eye[o + 2] - this.eyeWas[o + 2]) * idt;
    this.put(i, DROP, p.x, p.y, p.z, ox * k + (Math.random() - 0.5) * 0.05 + fx * f, -0.05 + Math.random() * 0.12 + fy, oz * k + (Math.random() - 0.5) * 0.05 + fz * f, CELL * this.px, this.frame[i], 6);
    if (fling) this.stats.flung++; else this.stats.dropped++;
  }
  /** a sob: the welling drops let go at once and n more spill from each eye */
  sob(n = 2) {
    if (this.fresh) return;
    for (let e = 0; e < this.src.length; e++) { if (this.well[e] >= 0) this.launch(this.well[e], e, 0); for (let k = 0; k < n; k++) this.launch(-1, e, 0); }
  }
  /** a creature melting where it stands: a spray of drops from all over it and a pool that grows and then fades */
  dissolve(at: THREE.Vector3, heightAt: (x: number, z: number) => number, n = 26) {
    for (let k = 0; k < n; k++) {
      const i = this.alloc(); if (i < 0) break;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.2, up = 0.08 + Math.random() * 0.32, sp = 0.3 + Math.random() * 0.8;
      this.put(i, DROP, at.x + Math.cos(a) * r, at.y + up, at.z + Math.sin(a) * r, Math.cos(a) * sp, 0.4 + Math.random() * 1.1, Math.sin(a) * sp, CELL * this.px, F.drop + Math.floor(Math.random() * 4), 6);
    }
    const i = this.alloc();
    if (i >= 0) this.put(i, POOL, at.x, heightAt(at.x, at.z) + 0.006, at.z, 0, 0, 0, 0.12, F.pool, 7.5);
  }
  /** a tear spot on the ground (the trail it leaves), drying over two minutes */
  spot(x: number, z: number, heightAt: (x: number, z: number) => number) {
    const i = this.alloc(); if (i < 0) return;
    this.put(i, SPOT, x, heightAt(x, z) + 0.004, z, 0, 0, 0, CELL * this.px * (1.6 + Math.random() * 0.8), F.spot, 120);
  }

  // ---------------------------------------------------------------------------------------------- the frame
  update(f: TearFrame) {
    const dt = Math.min(0.1, Math.max(0, f.dt));
    this.mat.uniforms.uLight.value = f.light ?? 1; this.mat.uniforms.uGlint.value = f.glint ?? 0;
    if (f.sim !== false) this.eyes(dt);
    else if (!this.fresh) {
      // nobody near: the drops in the eyes go, and the eyes are found afresh next time
      this.fresh = true;
      for (let e = 0; e < this.well.length; e++) { if (this.well[e] >= 0) this.kind[this.well[e]] = FREE; this.well[e] = -1; }
    }
    for (let i = 0; i < this.max; i++) {
      const k = this.kind[i]; if (k === FREE) continue;
      this.age[i] += dt;
      if (k === WELL) continue;
      if (this.age[i] > this.life[i]) {
        // a splash leaves a small puddle that ripples once and fades
        if (k === SPLASH) this.put(i, PUDDLE, this.P[i * 3], this.P[i * 3 + 1] + 0.004, this.P[i * 3 + 2], 0, 0, 0, this.size[i] * 0.8, F.ripple, 3.2 + Math.random());
        else this.kind[i] = FREE;
        continue;
      }
      if (k !== DROP) continue;
      // in the air: gravity, a little drag
      const o = i * 3, V = this.V;
      V[o + 1] -= G * dt;
      const drag = 1 / (1 + 0.6 * dt); V[o] *= drag; V[o + 1] *= drag; V[o + 2] *= drag;
      const x = this.P[o] + V[o] * dt, y = this.P[o + 1] + V[o + 1] * dt, z = this.P[o + 2] + V[o + 2] * dt;
      const gy = f.heightAt(x, z);
      if (y > gy) { this.P[o] = x; this.P[o + 1] = y; this.P[o + 2] = z; continue; }
      // the ground: a splash, standing on it
      this.put(i, SPLASH, x, gy, z, 0, 0, 0, this.size[i], F.splash, 0.24);
      this.stats.splashed++;
    }
    this.draw();
  }
  /** the eyes ride the head bone: where they are now, tears from them at the rate, and a sharp head shake flings some */
  private eyes(dt: number) {
    const sk = this.skin, bone = sk.skeleton.bones[this.head];
    sk.parent?.updateWorldMatrix(true, false); sk.updateMatrixWorld(true);
    // the head bone's skinning to world, as the GPU does it
    _mm.multiplyMatrices(sk.matrixWorld, sk.bindMatrixInverse);
    _m.multiplyMatrices(bone.matrixWorld, sk.skeleton.boneInverses[this.head]).multiply(sk.bindMatrix).premultiply(_mm);
    this.orgWas.copy(this.org); this.org.setFromMatrixPosition(sk.matrixWorld);
    for (let e = 0; e < this.src.length; e++) {
      const o = e * 3;
      this.eyeWas[o] = this.eye[o]; this.eyeWas[o + 1] = this.eye[o + 1]; this.eyeWas[o + 2] = this.eye[o + 2];
      _p.copy(this.src[e]).applyMatrix4(_m);
      this.eye[o] = _p.x; this.eye[o + 1] = _p.y; this.eye[o + 2] = _p.z;
      _p.copy(this.srcN[e]).transformDirection(_m);
      this.eyeN[o] = _p.x; this.eyeN[o + 1] = _p.y; this.eyeN[o + 2] = _p.z;
    }
    if (this.fresh) { this.fresh = false; this.eyeWas.set(this.eye); this.orgWas.copy(this.org); return; }
    if (dt <= 0) return;
    for (let e = 0; e < this.src.length; e++) {
      const o = e * 3;
      // the steady weeping: a drop swells in the corner (growing through the droplet frames), then lets go
      let w = this.well[e];
      if (w >= 0 && this.kind[w] !== WELL) w = this.well[e] = -1;
      if (w < 0 && this.rate > 0) {
        w = this.alloc();
        if (w >= 0) { this.well[e] = w; this.corner(e, _p); this.put(w, WELL, _p.x, _p.y, _p.z, 0, 0, 0, CELL * this.px, F.drop, Math.min(3, 1 / this.rate) * (e ? 0.9 : 1.1)); }
      }
      if (w >= 0) {
        this.corner(e, _p); this.P[w * 3] = _p.x; this.P[w * 3 + 1] = _p.y; this.P[w * 3 + 2] = _p.z;
        this.frame[w] = F.drop + Math.min(3, Math.floor((this.age[w] / this.life[w]) * 4));
        if (this.rate <= 0 && this.age[w] > 2) { this.kind[w] = FREE; this.well[e] = -1; }
        else if (this.age[w] >= this.life[w] && this.rate > 0) this.launch(w, e, dt);
      }
      // the eye's speed against the body's: a head shake (not walking along) throws drops off
      const vx = (this.eye[o] - this.eyeWas[o] - (this.org.x - this.orgWas.x)) / dt, vy = (this.eye[o + 1] - this.eyeWas[o + 1] - (this.org.y - this.orgWas.y)) / dt, vz = (this.eye[o + 2] - this.eyeWas[o + 2] - (this.org.z - this.orgWas.z)) / dt;
      const v = Math.hypot(vx, vy, vz);
      this.flingT[e] -= dt;
      if (v > 0.9 && this.flingT[e] <= 0 && Math.random() < (v - 0.9) * 0.6) { this.flingT[e] = 0.07; this.launch(this.well[e], e, dt, 1); }
    }
  }
  private draw() {
    const S = this.aPS.array as Float32Array, A = this.aFA.array as Float32Array;
    let c = 0;
    for (let i = 0; i < this.max; i++) {
      const k = this.kind[i]; if (k === FREE) continue;
      const a = this.age[i], L = this.life[i], o = i * 3;
      let fr = this.frame[i], al = 1, flat = 0, span = 1, size = this.size[i], y = this.P[o + 1];
      if (k === DROP || k === WELL) { /* as drawn */ }
      else if (k === SPLASH) { fr = F.splash + Math.min(3, Math.floor((a / L) * 4)); y += size * 0.5; }
      else if (k === PUDDLE) { flat = 1; fr = a < 0.36 ? F.ripple + Math.floor(a / 0.12) : F.puddle; al = 1 - smooth(L - 1.6, L, a); }
      else if (k === SPOT) { flat = 1; al = 0.9 * (1 - smooth(L * 0.6, L, a)); }
      else if (k === POOL) {
        // grows as the body runs out into it, ripples while it does, then lies still and fades
        flat = 1; span = 2; size = 0.12 + 0.62 * smooth(0, 2.4, a);
        fr = a < 2.4 ? F.pool + 2 * (Math.floor(a / 0.2) % 3) : F.pool + 6; al = 1 - smooth(L - 3, L, a);
      }
      S[c * 4] = this.P[o]; S[c * 4 + 1] = y; S[c * 4 + 2] = this.P[o + 2]; S[c * 4 + 3] = size;
      A[c * 4] = fr; A[c * 4 + 1] = al; A[c * 4 + 2] = flat; A[c * 4 + 3] = span;
      c++;
    }
    (this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = c;
    this.aPS.needsUpdate = true; this.aFA.needsUpdate = true;
    this.stats.live = c;
  }
}
const _mm = new THREE.Matrix4();
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
