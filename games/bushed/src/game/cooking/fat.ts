// Fat in a pan: oil, butter, lard and rendered bacon fat as one pool on the pan floor.
//   * oil poured in lands where you pour it and spreads (faster as it thins with heat) toward a film over the floor
//   * pats of butter and lard sit there and melt into the pool
//   * butter foams while its water boils off (about 100-130 C), then its milk solids toast golden, hazelnut brown,
//     and finally black
//   * oil starts to shimmer around 160-200 C (the surface wavers in bright streaks), smokes past its smoke point
//     (canola ~225 C, lard ~190, butter long before), spits and splatters hotter still, and past ~290 C can catch:
//     a grease fire. A lid smothers it in a second or two; water on it makes it explode upward.
// The pool is a disc with its own shader (shimmer streaks, foam, browned specks, smoke haze); flames are three
// crossed billboards with a flame shader. Everything is in the vessel's local frame.
import * as THREE from 'three';
import { G } from '../../gfx/globals';

export type FatKind = 'oil' | 'butter' | 'lard' | 'drip';

const SMOKE: Record<FatKind, number> = { oil: 225, butter: 155, lard: 190, drip: 200 };
const COLOR: Record<FatKind, [number, number, number]> = { oil: [0.72, 0.5, 0.12], butter: [0.96, 0.82, 0.4], lard: [0.86, 0.8, 0.62], drip: [0.66, 0.42, 0.18] };

const LARD_SET = new THREE.Color(0.95, 0.93, 0.86);

interface Pat { kind: 'butter' | 'lard'; g: number; g0: number; mesh: THREE.Mesh; x: number; z: number }

let patGeo: THREE.BufferGeometry | null = null;
const patMats: Partial<Record<'butter' | 'lard', THREE.MeshStandardMaterial>> = {};

export interface FatMat extends THREE.MeshStandardMaterial {
  userData: { uShimmer: { value: number }; uFoam: { value: number }; uBrown: { value: number }; uSmoke: { value: number }; uTime: { value: number }; uBase: { value: THREE.Color } };
}

function fatMaterial(): FatMat {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 1, depthWrite: false }) as FatMat;
  m.userData = { uShimmer: { value: 0 }, uFoam: { value: 0 }, uBrown: { value: 0 }, uSmoke: { value: 0 }, uTime: { value: 0 }, uBase: { value: new THREE.Color(0.86, 0.66, 0.2) } };
  const U = m.userData;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uShimmer: U.uShimmer, uFoam: U.uFoam, uBrown: U.uBrown, uSmoke: U.uSmoke, uFT: U.uTime, uBase: U.uBase });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFU = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uShimmer; uniform float uFoam; uniform float uBrown; uniform float uSmoke; uniform float uFT; uniform vec3 uBase;
        varying vec2 vFU;
        float fh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 q = floor(vFU * 72.0) / 72.0;
        vec2 c = q - 0.5;
        float r = length(c) * 2.0;
        vec3 col = uBase;
        // browned butter: golden -> hazelnut -> black, with toasted specks
        col = mix(col, vec3(0.62, 0.36, 0.12), clamp(uBrown, 0.0, 1.0));
        col = mix(col, vec3(0.12, 0.07, 0.04), clamp((uBrown - 1.0) * 2.0, 0.0, 1.0));
        float sp = step(0.93, fh(floor(vFU * 40.0))) * smoothstep(0.3, 0.8, uBrown);
        col = mix(col, vec3(0.3, 0.16, 0.06), sp);
        // a bright meniscus at the rim
        float rim = smoothstep(0.8, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));
        col += rim * 0.25;
        // shimmer: thin wavering lines of light drifting over the surface (the heat haze in the oil)
        float w1 = abs(sin(q.x * 19.0 + sin(q.y * 9.0 + uFT * 2.3) * 2.2 + uFT * 2.1));
        float w2 = abs(sin(q.y * 15.0 - uFT * 1.7 + sin(q.x * 7.0 - uFT * 1.3) * 1.8));
        float streak = max(step(w1, 0.07), step(w2, 0.05) * 0.7) * uShimmer;
        col = mix(col, vec3(1.0, 0.94, 0.72), streak * 0.7);
        // foam: little white bubbles that pop and come back
        vec2 g = floor(vFU * 30.0);
        float h = fh(g);
        float ph = fract(uFT * (0.8 + h) + h * 9.0);
        vec2 f = fract(vFU * 30.0) - 0.5;
        float bub = step(length(f), 0.18 + 0.22 * ph) * step(1.0 - uFoam * 0.9, h);
        col = mix(col, vec3(0.98, 0.95, 0.86), bub * 0.9);
        // smoke haze
        col = mix(col, vec3(0.35, 0.33, 0.3), clamp(uSmoke, 0.0, 1.0) * 0.35);
        diffuseColor.rgb = col;
        // thin oil is a clear amber film (the black iron shows through); foam and browned butter are opaque
        diffuseColor.a = (0.38 + 0.12 * uShimmer + 0.45 * uFoam + 0.35 * clamp(uBrown, 0.0, 1.0) + 0.2 * clamp(uSmoke, 0.0, 1.0)) * (1.0 - smoothstep(0.92, 1.0, r));
        if (r > 1.0) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.9, 0.6) * streak * 0.25;`);
  };
  m.customProgramCacheKey = () => 'cook_fat';
  return m;
}

// ---------------------------------------------------------------------------------------------- flames
let flameMat: THREE.ShaderMaterial | null = null;
function flameMaterial(): THREE.ShaderMaterial {
  if (flameMat) return flameMat;
  flameMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uT; uniform float uK; varying vec2 vU;
      float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 u = floor(vU * vec2(24.0, 30.0)) / vec2(24.0, 30.0);
        float x = (u.x - 0.5) * 2.0, y = u.y;
        // ragged tongues: each column of the flame reaches its own flickering height
        float col = floor(u.x * 7.0);
        float n1 = n(vec2(col * 1.7, uT * 6.0)), n2 = n(vec2(u.x * 11.0, y * 6.0 - uT * 9.0));
        float h = (1.0 - abs(x) * 0.85) * (0.35 + 0.65 * n1) + (n2 - 0.5) * 0.18;
        float m = h - y;
        if (m < 0.0 || abs(x) > 0.98) discard;
        float k = m / max(h, 0.05);
        vec3 c = vec3(0.72, 0.16, 0.03);
        c = mix(c, vec3(1.0, 0.45, 0.08), step(0.18, k));
        c = mix(c, vec3(1.0, 0.72, 0.22), step(0.45, k));
        c = mix(c, vec3(1.0, 0.93, 0.62), step(0.75, k) * step(y, 0.45));
        gl_FragColor = vec4(c, uK * (0.7 + 0.3 * step(0.18, k)));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return flameMat;
}

export class Fat {
  oil = 0; butter = 0; lard = 0; drip = 0;
  /** water still in the melted butter (g): it foams till it's gone */
  bwater = 0;
  /** butter's milk solids: 0 pale .. 1 hazelnut .. 1.6 black */
  brown = 0;
  foam = 0;
  smoke = 0;
  shimmer = 0;
  /** grease fire 0..1+ (0 = none) */
  fire = 0;
  /** seconds the lid has been on while burning */
  smother = 0;
  /** the pool on the floor (vessel local) */
  readonly pool = { x: 0, z: 0, r: 0 };
  readonly mesh: THREE.Mesh;
  readonly mat: FatMat;
  readonly flames = new THREE.Group();
  pats: Pat[] = [];
  /** the hottest it has been and how long it has smoked (grading) */
  maxT = 20; smokedFor = 0; firedFor = 0;
  constructor(readonly parent: THREE.Object3D, readonly floor: number, readonly inner: number) {
    this.mat = fatMaterial();
    const g = new THREE.CircleGeometry(1, 28);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.y = floor + 0.0012;
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);
    const fg = new THREE.PlaneGeometry(1, 1);
    fg.translate(0, 0.5, 0);
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(fg, flameMaterial());
      f.rotation.y = (k / 3) * Math.PI;
      f.renderOrder = 6;
      this.flames.add(f);
    }
    this.flames.visible = false;
    this.flames.position.y = floor;
    parent.add(this.flames);
  }

  /** melted fat in ml */
  get total(): number { return this.oil + this.butter * 0.82 + this.lard + this.drip; }
  /** unmelted pats in g */
  get solid(): number { return this.pats.reduce((s, p) => s + p.g, 0); }
  get any(): boolean { return this.total + this.solid > 1; }
  /** the dominant fat */
  get main(): FatKind {
    const v: [FatKind, number][] = [['oil', this.oil], ['butter', this.butter * 0.82], ['lard', this.lard], ['drip', this.drip]];
    v.sort((a, b) => b[1] - a[1]);
    return v[0][0];
  }
  /** the lowest smoke point among the fats making up a real share of the pool */
  get smokePoint(): number {
    const t = Math.max(1, this.total);
    let sp = 400;
    if (this.oil / t > 0.15) sp = Math.min(sp, SMOKE.oil);
    if (this.lard / t > 0.15) sp = Math.min(sp, SMOKE.lard);
    if (this.drip / t > 0.15) sp = Math.min(sp, SMOKE.drip);
    if (this.butter * 0.82 / t > 0.15) sp = Math.min(sp, this.brown > 1.1 ? 150 : SMOKE.butter + 20 * Math.min(1, this.brown));
    return sp;
  }

  /** pour liquid fat at a point on the floor (vessel local x, z) */
  pour(kind: FatKind, ml: number, x: number, z: number): void {
    const v0 = this.total;
    if (kind === 'oil') this.oil += ml; else if (kind === 'drip') this.drip += ml; else if (kind === 'lard') this.lard += ml; else this.butter += ml / 0.82;
    const v1 = Math.max(1e-3, this.total);
    this.pool.x = (this.pool.x * v0 + x * ml) / v1;
    this.pool.z = (this.pool.z * v0 + z * ml) / v1;
    if (v0 < 0.5) this.pool.r = Math.min(this.pool.r, 0.01);
  }

  /** drop a pat of butter or lard (g) into the pan */
  addPat(kind: 'butter' | 'lard', g: number, x: number, z: number): void {
    if (!patGeo) {
      patGeo = new THREE.BoxGeometry(0.026, 0.011, 0.02, 2, 1, 2);
      const p = patGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const k = 1 - 0.18 * (Math.abs(p.getX(i)) / 0.013) * (p.getY(i) > 0 ? 1 : 0); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      patGeo.translate(0, 0.0055, 0);
      patGeo.computeVertexNormals();
    }
    const mat = patMats[kind] ?? (patMats[kind] = new THREE.MeshStandardMaterial({ color: kind === 'butter' ? 0xf4dc84 : 0xf2eee2, roughness: 0.42 }));
    const mesh = new THREE.Mesh(patGeo, mat);
    mesh.position.set(x, this.floor, z);
    mesh.rotation.y = Math.random() * 6;
    mesh.castShadow = true;
    this.parent.add(mesh);
    this.pats.push({ kind, g, g0: g, mesh, x, z });
  }

  /** soak up / burn off fat (ml), spread over the kinds */
  consume(ml: number): void {
    const t = this.total;
    if (t <= 0) return;
    const k = Math.max(0, 1 - ml / t);
    this.oil *= k; this.butter *= k; this.lard *= k; this.drip *= k;
  }

  /** water hits the fat: spits, and a burning pan erupts */
  water(): 'flare' | 'spit' | 'none' {
    if (this.fire > 0.05) { this.fire = 2.6; return 'flare'; }
    return this.total > 2 ? 'spit' : 'none';
  }

  /**
   * dt seconds at pan temperature T (C). lid: a lid is on. Returns the fire that started this frame (true once).
   */
  update(dt: number, T: number, lid: boolean): boolean {
    let ignited = false;
    this.maxT = Math.max(this.maxT, T);
    // pats melt
    for (let i = this.pats.length - 1; i >= 0; i--) {
      const p = this.pats[i];
      const rate = Math.max(0, (T - 32) / 60) * (p.kind === 'lard' ? 0.7 : 0.9);
      const d = Math.min(p.g, rate * dt);
      if (d > 0) {
        p.g -= d;
        if (p.kind === 'butter') { this.pour('butter', d * 0.82, p.x, p.z); this.bwater += d * 0.16; }
        else this.pour('lard', d * 1.05, p.x, p.z);
      }
      const k = Math.max(0, p.g / p.g0);
      p.mesh.scale.set(0.5 + k * 0.5, Math.max(0.15, k), 0.5 + k * 0.5);
      if (p.g <= 0.05) { p.mesh.removeFromParent(); this.pats.splice(i, 1); }
    }
    // butter: water boils off as foam, then the solids toast
    if (this.bwater > 0 && T > 98) this.bwater = Math.max(0, this.bwater - dt * (0.12 + (T - 98) / 150));
    this.foam += ((this.bwater > 0.05 && T > 96 ? Math.min(1, this.bwater / 2 + 0.4) : 0) - this.foam) * Math.min(1, dt * 3);
    if (this.butter > 0.5 && this.bwater < 0.2 && T > 125) this.brown += dt * Math.pow((T - 125) / 45, 1.4) * 0.035;
    // the pool spreads (thinner, faster when hot) and drifts to cover the floor
    const V = this.total;
    if (V > 0.3) {
      const th = 0.0014 + 0.0016 * THREE.MathUtils.clamp((90 - T) / 70, 0, 1);
      const rt = Math.min(this.inner, Math.sqrt((V * 1e-6) / (Math.PI * th)));
      this.pool.r += (rt - this.pool.r) * Math.min(1, dt * (0.35 + Math.max(0, T - 20) / 90));
      const lim = Math.max(0, this.inner - this.pool.r);
      const pull = Math.min(1, dt * 0.5 * (this.pool.r / this.inner));
      this.pool.x -= this.pool.x * pull; this.pool.z -= this.pool.z * pull;
      const d = Math.hypot(this.pool.x, this.pool.z);
      if (d > lim) { this.pool.x *= lim / d; this.pool.z *= lim / d; }
    } else this.pool.r = Math.max(0, this.pool.r - dt * 0.05);
    // shimmer, smoke, fire
    const oilShare = V > 0 ? (this.oil + this.lard + this.drip) / V : 0;
    this.shimmer = V > 1 ? THREE.MathUtils.smoothstep(T, 150, 195) * (0.35 + oilShare * 0.65) * (1 - this.foam) : 0;
    const sp = this.smokePoint;
    this.smoke = V > 1.5 ? THREE.MathUtils.clamp((T - sp) / 45, 0, 1.6) : 0;
    if (this.smoke > 0.1) this.smokedFor += dt;
    if (this.fire <= 0 && V > 4 && T > 290 && !lid && Math.random() < dt * (T - 290) / 25) { this.fire = 0.3; ignited = true; }
    if (this.fire > 0) {
      this.firedFor += dt;
      if (lid) { this.smother += dt; this.fire = Math.max(0, this.fire - dt * 1.4); }
      else { this.smother = 0; this.fire = Math.min(this.fire > 1.2 ? this.fire : 1.15, this.fire + dt * 0.8) - (this.fire > 1.2 ? dt * 1.2 : 0); }
      this.consume(dt * 2.2 * Math.min(1.5, this.fire));
      if (this.total < 1.5) this.fire = Math.max(0, this.fire - dt * 2);
      if (this.fire < 0.02) this.fire = 0;
    }
    this.draw(T);
    return ignited;
  }

  private draw(T: number): void {
    const V = this.total;
    this.mesh.visible = V > 0.3 && this.pool.r > 0.004;
    if (this.mesh.visible) {
      this.mesh.position.x = this.pool.x; this.mesh.position.z = this.pool.z;
      this.mesh.scale.set(this.pool.r, 1, this.pool.r);
      const U = this.mat.userData;
      // the colour of the mix
      const t = Math.max(1e-3, V);
      const c = U.uBase.value.setRGB(0, 0, 0);
      for (const [k, v] of [['oil', this.oil], ['butter', this.butter * 0.82], ['lard', this.lard], ['drip', this.drip]] as [FatKind, number][]) {
        const col = COLOR[k];
        c.r += col[0] * v / t; c.g += col[1] * v / t; c.b += col[2] * v / t;
      }
      if (T < 40 && this.lard / t > 0.5) c.lerp(LARD_SET, 0.5);
      U.uShimmer.value = this.shimmer;
      U.uFoam.value = this.foam;
      U.uBrown.value = this.butter * 0.82 / t > 0.25 ? this.brown : this.brown * 0.3;
      U.uSmoke.value = this.smoke;
      U.uTime.value = G.uTime.value;
    }
    this.flames.visible = this.fire > 0.02;
    if (this.flames.visible) {
      const k = Math.min(2.6, this.fire);
      const flick = 0.85 + 0.15 * Math.sin(G.uTime.value * 23) * Math.sin(G.uTime.value * 7.3);
      this.flames.position.set(this.pool.x, this.floor, this.pool.z);
      this.flames.scale.set(Math.max(0.06, this.pool.r * 1.9) * (k > 1.3 ? 1.5 : 1), (0.1 + 0.16 * k) * flick, Math.max(0.06, this.pool.r * 1.9));
      const fm = flameMaterial();
      fm.uniforms.uT.value = G.uTime.value;
      fm.uniforms.uK.value = Math.min(1, this.fire * 1.5);
    }
  }

  /** empty the pan (served or wiped) */
  clear(): void {
    this.oil = this.butter = this.lard = this.drip = 0;
    this.bwater = this.brown = this.foam = this.smoke = this.shimmer = this.fire = 0;
    this.pool.r = 0; this.pool.x = this.pool.z = 0;
    for (const p of this.pats) p.mesh.removeFromParent();
    this.pats = [];
    this.maxT = 20; this.smokedFor = 0; this.firedFor = 0;
    this.mesh.visible = false; this.flames.visible = false;
  }
}
