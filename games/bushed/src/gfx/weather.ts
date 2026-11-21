// Precipitation and air life around the camera, all GPU-animated instanced quads (no per-frame CPU work beyond a
// few uniforms):
//   rain     - long thin streaks falling fast, slanted by the wind, wrapping in a box around the camera
//   snow     - slow tumbling flakes with drift
//   motes    - dust specks that only show where the sun reaches them (they sample the sun's shadow map), so they
//              sparkle inside the god rays under the canopy; gnats and moths circling by dusk
//   pollen   - fine yellow grains drifting on warm afternoons
//   fluff    - cottonwood / fireweed seed fluff sailing on the breeze, catching the low sun
//   leaves   - yellow birch leaves torn loose by gusts
//   needles  - spruce and pine needles spinning down in the wind
//   fireflies- blinking green-gold lights low over the ground at dusk on calm dry nights (they bloom)
// Wind drift is integrated on the CPU (a wind offset uniform), so gusts never make the fields jump.
// Splashes and wet ground are driven from the game (G.uWet), not here.
import * as THREE from 'three';
import { G } from './globals';
import { currentQuality } from '../game/quality';

type Kind = 'rain' | 'snow' | 'mote' | 'leaf' | 'needle' | 'pollen' | 'fluff' | 'firefly';
const BOX = new THREE.Vector3(36, 22, 36);
const BOX_NEAR = new THREE.Vector3(24, 10, 24);

function field(n: number, kind: Kind): THREE.Mesh {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const seed = new Float32Array(n * 4);
  // sorted by w (the amount threshold): the first amount x n instances are exactly the live ones, so the draw
  // stops there (see WeatherFx.update) instead of running the vertex shader on thousands of hidden drops
  const ws = Array.from({ length: n }, () => Math.random()).sort((a, b) => a - b);
  for (let i = 0; i < n; i++) { seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = ws[i]; }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = n;
  g.userData.n = n;
  g.userData.ws = ws;
  const near = kind === 'firefly' || kind === 'mote' || kind === 'pollen';
  const uniforms = {
    uTime: G.uTime, uWindDir: G.uWindDir, uWind: G.uWindStrength, uCam: { value: new THREE.Vector3() }, uBox: { value: near ? BOX_NEAR : BOX },
    uAmount: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uLight: { value: new THREE.Color(1, 1, 1) },
    uWindOff: { value: new THREE.Vector2() },
    tShadow: G.uShadowMap, uShadowMatrix: G.uShadowMatrix, uShadowOn: G.uShadowOn, uSunDir: G.uSunDir, uSunCol: G.uSunCol,
  };
  const vs = /* glsl */`
    precision highp sampler2DShadow;
    attribute vec4 aSeed; uniform float uTime; uniform vec2 uWindDir; uniform float uWind; uniform vec3 uCam; uniform vec3 uBox; uniform float uAmount;
    uniform vec2 uWindOff; uniform sampler2DShadow tShadow; uniform mat4 uShadowMatrix; uniform float uShadowOn; uniform vec3 uSunDir; uniform vec3 uSunCol;
    varying vec2 vUv; varying float vA; varying float vSeed; varying vec3 vLit;
    float sunLit(vec3 p) {
      if (uShadowOn < 0.5) return 1.0;
      vec4 sc = uShadowMatrix * vec4(p, 1.0);
      sc.xyz /= sc.w;
      if (sc.x < 0.001 || sc.y < 0.001 || sc.x > 0.999 || sc.y > 0.999 || sc.z > 1.0) return 1.0;
      return texture(tShadow, vec3(sc.xy, sc.z - 0.002));
    }
    void main() {
      vUv = uv; vSeed = aSeed.w; vLit = vec3(1.0);
      float on = step(aSeed.w, uAmount);
      vec3 p = (aSeed.xyz - 0.5) * uBox;
      ${kind === 'rain' ? `
        p.y -= uTime * (9.0 + aSeed.w * 3.0);
        p.xz += uWindOff * 4.0;` : kind === 'snow' ? `
        p.y -= uTime * (0.8 + aSeed.w * 0.6);
        p.xz += uWindOff * 1.5 + vec2(sin(uTime * 0.7 + aSeed.x * 40.0), cos(uTime * 0.5 + aSeed.z * 40.0)) * 0.6;` : kind === 'mote' || kind === 'pollen' ? `
        p += vec3(sin(uTime * 0.31 + aSeed.x * 50.0), sin(uTime * 0.23 + aSeed.y * 40.0) * 0.5, cos(uTime * 0.27 + aSeed.z * 30.0)) * 1.6;
        p.xz += uWindOff * ${kind === 'pollen' ? '0.9' : '0.5'};` : kind === 'fluff' ? `
        p.y += sin(uTime * 0.4 + aSeed.x * 20.0) * 0.8 + uTime * 0.06;
        p += vec3(sin(uTime * 0.21 + aSeed.y * 30.0), 0.0, cos(uTime * 0.17 + aSeed.z * 30.0)) * 1.2;
        p.xz += uWindOff * 1.8;` : kind === 'firefly' ? `
        p += vec3(sin(uTime * 0.37 + aSeed.x * 50.0), sin(uTime * 0.53 + aSeed.y * 40.0) * 0.35, cos(uTime * 0.29 + aSeed.z * 30.0)) * 1.3;` : `
        p.y -= uTime * (${kind === 'needle' ? '1.6' : '0.9'} + aSeed.w * 0.5);
        p.xz += uWindOff * 3.0 + uTime * 0.4 * uWindDir + vec2(sin(uTime * 1.7 + aSeed.x * 30.0), cos(uTime * 1.3 + aSeed.y * 30.0)) * 0.8;`}
      // wrap into the box around the camera
      vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
      ${kind === 'firefly' ? 'rel.y = mod(p.y, 2.2) - 1.3 + 0.2 * sin(uTime * 0.8 + aSeed.x * 9.0);' : ''}
      vec3 wp = uCam + rel;
      ${kind === 'rain' ? `
        vec3 fallDir = normalize(vec3(uWindDir.x * uWind * 4.0, -10.0, uWindDir.y * uWind * 4.0));
        vec3 toCam = normalize(uCam - wp);
        vec3 side = normalize(cross(fallDir, toCam));
        wp += side * (position.x * 0.012) + fallDir * (position.y * 0.55);` : kind === 'leaf' || kind === 'needle' ? `
        float a = uTime * (2.0 + aSeed.y * 3.0) * ${kind === 'needle' ? '2.2' : '1.0'} + aSeed.x * 20.0;
        vec3 ax = vec3(cos(a), sin(a * 0.7) * 0.6, sin(a));
        vec3 ay = normalize(cross(ax, vec3(0.3, 1.0, 0.2)));
        wp += ${kind === 'needle' ? '(ax * position.x * 0.035 + ay * position.y * 0.004)' : '(ax * position.x + ay * position.y) * 0.05'};` : `
        vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float s = ${kind === 'snow' ? '0.03' : kind === 'fluff' ? '0.045' : kind === 'firefly' ? '0.03' : kind === 'pollen' ? '0.008' : '0.011'} * (0.6 + aSeed.y);
        wp += (r * position.x + u * position.y) * s;`}
      float d = length(rel);
      vA = on * smoothstep(${near ? '11.0, 3.0' : '18.0, 6.0'}, d) * smoothstep(0.4, 1.4, d);
      ${kind === 'mote' || kind === 'fluff' || kind === 'pollen' ? `
        // in the sun: bright, and brightest looking toward it (forward scatter); in shade: barely there
        float lit = vA > 0.01 ? sunLit(wp) : 0.0;
        float fw = pow(max(dot(normalize(wp - uCam), uSunDir), 0.0), 4.0);
        vLit = uSunCol * lit * (0.35 + 2.2 * fw) + vec3(${kind === 'fluff' ? '0.3' : '0.06'});` : kind === 'firefly' ? `
        float blink = smoothstep(0.55, 0.95, sin(uTime * (1.3 + aSeed.y * 1.4) + aSeed.z * 60.0)) * step(0.35, fract(aSeed.x * 7.0 + floor(uTime * 0.11 + aSeed.y * 5.0) * 0.37));
        vLit = vec3(blink);` : ''}
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    }`;
  const shape = kind === 'rain' ? 'float a = 0.35 * vA * (1.0 - abs(vUv.x - 0.5) * 2.0);'
    : kind === 'leaf' ? 'vec2 q = vUv - 0.5; float a = step(dot(q * vec2(1.0, 1.6), q * vec2(1.0, 1.6)), 0.2) * vA; if (a < 0.5) discard;'
    : kind === 'needle' ? 'float a = vA; if (a < 0.5) discard;'
    : kind === 'fluff' ? 'vec2 q = vUv - 0.5; float r = length(q); float a = (step(r, 0.12) + step(r, 0.42) * step(0.75, fract(atan(q.y, q.x) * 1.9 + vSeed * 7.0)) * 0.55) * vA * 0.85;'
    : kind === 'firefly' ? 'vec2 q = vUv - 0.5; float r = dot(q, q); float a = (step(r, 0.04) + step(r, 0.2) * 0.25) * vA;'
    : 'vec2 q = vUv - 0.5; float a = step(dot(q, q), 0.2) * vA;';
  const colour = kind === 'leaf' ? 'uColor * uLight * (0.7 + 0.4 * vSeed)'
    : kind === 'needle' ? 'uColor * uLight * (0.6 + 0.6 * vSeed)'
    : kind === 'mote' || kind === 'pollen' || kind === 'fluff' ? 'uColor * mix(uLight, vLit, 0.85)'
    : kind === 'firefly' ? 'uColor * vLit * 6.0'
    : 'uColor * uLight';
  const fs = /* glsl */`
    uniform vec3 uColor; uniform vec3 uLight; varying vec2 vUv; varying float vA; varying float vSeed; varying vec3 vLit;
    void main() {
      if (vA < 0.01) discard;
      ${shape}
      vec3 c = ${colour};
      ${kind === 'mote' || kind === 'pollen' ? 'a *= clamp(0.2 + dot(vLit, vec3(0.3, 0.5, 0.2)), 0.0, 1.0);' : ''}
      gl_FragColor = vec4(c, ${kind === 'leaf' || kind === 'needle' ? '1.0' : 'a'});
    }`;
  const solid = kind === 'leaf' || kind === 'needle';
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vs, fragmentShader: fs, transparent: !solid, depthWrite: solid, side: THREE.DoubleSide,
    blending: kind === 'firefly' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

export class WeatherFx {
  readonly group = new THREE.Group();
  private rain = field(9000, 'rain');
  private snow = field(5000, 'snow');
  private motes = field(700, 'mote');
  private pollen = field(400, 'pollen');
  private fluff = field(160, 'fluff');
  private leaves = field(260, 'leaf');
  private needles = field(420, 'needle');
  private fireflies = field(140, 'firefly');
  private all: THREE.Mesh[];
  private windOff = new THREE.Vector2();
  private lastT = -1;

  constructor() {
    this.all = [this.rain, this.snow, this.motes, this.pollen, this.fluff, this.leaves, this.needles, this.fireflies];
    this.group.add(...this.all);
    const col = (m: THREE.Mesh, r: number, g: number, b: number) => (m.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(r, g, b);
    col(this.rain, 0.75, 0.8, 0.9);
    col(this.leaves, 0.78, 0.66, 0.2);
    col(this.needles, 0.42, 0.36, 0.2);
    col(this.pollen, 1.0, 0.86, 0.45);
    col(this.fluff, 1.0, 0.98, 0.94);
    col(this.fireflies, 0.75, 1.0, 0.35);
  }

  /** amounts 0..1. light = ambient light colour/intensity at the camera (so particles dim at night) */
  update(cam: THREE.Vector3, rain: number, snow: number, motes: number, leaves: number, light: THREE.Color, dusk: number): void {
    const t = G.uTime.value;
    const dt = this.lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
    this.windOff.addScaledVector(G.uWindDir.value, G.uWindStrength.value * dt);
    // keep the offset small (the fields wrap anyway)
    if (Math.abs(this.windOff.x) > 1e4 || Math.abs(this.windOff.y) > 1e4) this.windOff.set(0, 0);
    const outdoors = leaves > 0.01 ? 1 : 0;
    const day = 1 - G.uDarkness.value;
    const calm = Math.max(0, 1 - G.uWindStrength.value * 1.4);
    const qs = currentQuality().name === 'low' ? 0.5 : 1;
    const set = (m: THREE.Mesh, a: number) => {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uCam.value.copy(cam); u.uAmount.value = a; u.uLight.value.copy(light); u.uWindOff.value.copy(this.windOff);
      m.visible = a > 0.001;
      // draw only the live instances (seeds are sorted by their threshold); the low preset draws half of them
      const g = m.geometry as THREE.InstancedBufferGeometry, ws = g.userData.ws as number[], n = g.userData.n as number;
      let k = 0, hi = n;
      while (k < hi) { const mid = (k + hi) >> 1; if (ws[mid] <= a) k = mid + 1; else hi = mid; }
      g.instanceCount = Math.max(1, Math.ceil(k * qs));
    };
    set(this.rain, rain); set(this.snow, snow);
    set(this.motes, motes * (0.5 + 0.5 * day));
    set(this.pollen, outdoors * motes * day * (1 - rain) * 0.7);
    set(this.fluff, outdoors * day * (1 - rain) * (0.25 + 0.5 * G.uWindStrength.value) * 0.8);
    set(this.leaves, leaves);
    set(this.needles, Math.min(1, leaves * 1.3));
    set(this.fireflies, outdoors * dusk * (1 - rain) * calm * (1 - G.uSnow.value));
    // dusk turns the motes into dark gnats
    (this.motes.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(1 - dusk * 0.85, 0.95 - dusk * 0.82, 0.8 - dusk * 0.72);
  }
}
