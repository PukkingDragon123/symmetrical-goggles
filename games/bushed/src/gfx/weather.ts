// Precipitation and air life around the camera, all GPU-animated instanced quads (no per-frame CPU work):
//   rain   - long thin streaks falling fast, slanted by the wind, wrapping in a box around the camera
//   snow   - slow tumbling flakes with drift
//   motes  - pollen / dust drifting in sunlight by day, gnats and moths circling by dusk
//   leaves - yellow birch leaves torn loose by gusts
// Splashes and wet ground are driven from the game (G.uWet), not here.
import * as THREE from 'three';
import { G } from './globals';

const BOX = new THREE.Vector3(36, 22, 36);

function field(n: number, kind: 'rain' | 'snow' | 'mote' | 'leaf'): THREE.Mesh {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random(); }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = n;
  const uniforms = {
    uTime: G.uTime, uWindDir: G.uWindDir, uWind: G.uWindStrength, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX },
    uAmount: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) }, uLight: { value: new THREE.Color(1, 1, 1) },
  };
  const vs = /* glsl */`
    attribute vec4 aSeed; uniform float uTime; uniform vec2 uWindDir; uniform float uWind; uniform vec3 uCam; uniform vec3 uBox; uniform float uAmount;
    varying vec2 vUv; varying float vA; varying float vSeed;
    void main() {
      vUv = uv; vSeed = aSeed.w;
      float on = step(aSeed.w, uAmount);
      vec3 p = (aSeed.xyz - 0.5) * uBox;
      ${kind === 'rain' ? `
        float fall = 9.0 + aSeed.w * 3.0;
        p.y -= uTime * fall;
        p.xz += uWindDir * uWind * 4.0 * uTime;` : kind === 'snow' ? `
        p.y -= uTime * (0.8 + aSeed.w * 0.6);
        p.xz += uWindDir * uWind * 1.5 * uTime + vec2(sin(uTime * 0.7 + aSeed.x * 40.0), cos(uTime * 0.5 + aSeed.z * 40.0)) * 0.6;` : kind === 'mote' ? `
        p += vec3(sin(uTime * 0.31 + aSeed.x * 50.0), sin(uTime * 0.23 + aSeed.y * 40.0) * 0.5, cos(uTime * 0.27 + aSeed.z * 30.0)) * 1.6;
        p.xz += uWindDir * uWind * 0.6 * uTime;` : `
        p.y -= uTime * (0.9 + aSeed.w * 0.5);
        p.xz += uWindDir * (uWind * 3.0 + 0.4) * uTime + vec2(sin(uTime * 1.7 + aSeed.x * 30.0), cos(uTime * 1.3 + aSeed.y * 30.0)) * 0.8;`}
      // wrap into the box around the camera
      vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
      vec3 wp = uCam + rel;
      ${kind === 'rain' ? `
        vec3 fallDir = normalize(vec3(uWindDir.x * uWind * 4.0, -10.0, uWindDir.y * uWind * 4.0));
        vec3 toCam = normalize(uCam - wp);
        vec3 side = normalize(cross(fallDir, toCam));
        wp += side * (position.x * 0.012) + fallDir * (position.y * 0.55);` : kind === 'leaf' ? `
        float a = uTime * (2.0 + aSeed.y * 3.0) + aSeed.x * 20.0;
        vec3 ax = vec3(cos(a), sin(a * 0.7) * 0.6, sin(a));
        vec3 ay = normalize(cross(ax, vec3(0.3, 1.0, 0.2)));
        wp += (ax * position.x + ay * position.y) * 0.05;` : `
        vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float s = ${kind === 'snow' ? '0.03' : '0.012'} * (0.6 + aSeed.y);
        wp += (r * position.x + u * position.y) * s;`}
      float d = length(rel);
      vA = on * smoothstep(${kind === 'mote' ? '14.0, 4.0' : '18.0, 6.0'}, d) * smoothstep(0.4, 1.4, d);
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    }`;
  const fs = /* glsl */`
    uniform vec3 uColor; uniform vec3 uLight; varying vec2 vUv; varying float vA; varying float vSeed;
    void main() {
      if (vA < 0.01) discard;
      ${kind === 'rain' ? 'float a = 0.35 * vA * (1.0 - abs(vUv.x - 0.5) * 2.0);' :
        kind === 'leaf' ? 'vec2 q = vUv - 0.5; float a = step(dot(q * vec2(1.0, 1.6), q * vec2(1.0, 1.6)), 0.2) * vA; if (a < 0.5) discard;' :
          'vec2 q = vUv - 0.5; float a = step(dot(q, q), 0.2) * vA;'}
      vec3 c = uColor * uLight ${kind === 'leaf' ? '* (0.7 + 0.4 * vSeed)' : ''};
      gl_FragColor = vec4(c, ${kind === 'leaf' ? '1.0' : 'a'});
    }`;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: kind !== 'leaf', depthWrite: kind === 'leaf', side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

export class WeatherFx {
  readonly group = new THREE.Group();
  private rain = field(9000, 'rain');
  private snow = field(5000, 'snow');
  private motes = field(500, 'mote');
  private leaves = field(260, 'leaf');

  constructor() {
    this.group.add(this.rain, this.snow, this.motes, this.leaves);
    (this.rain.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(0.75, 0.8, 0.9);
    (this.leaves.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(0.78, 0.66, 0.2);
  }

  /** amounts 0..1. light = ambient light colour/intensity at the camera (so particles dim at night) */
  update(cam: THREE.Vector3, rain: number, snow: number, motes: number, leaves: number, light: THREE.Color, dusk: number): void {
    const set = (m: THREE.Mesh, a: number) => {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uCam.value.copy(cam); u.uAmount.value = a; u.uLight.value.copy(light);
      m.visible = a > 0.001;
    };
    set(this.rain, rain); set(this.snow, snow); set(this.motes, motes); set(this.leaves, leaves);
    // dusk turns the motes into dark gnats
    (this.motes.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(1 - dusk * 0.85, 0.95 - dusk * 0.82, 0.8 - dusk * 0.72);
  }
}
