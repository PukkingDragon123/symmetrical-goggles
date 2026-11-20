// Sky dome, sun/moon lights, fog, ground mist and colour grade driven by the hour of the day and the weather.
//   const sky = new Sky(scene); sky.update(hour, cameraPos, weather, grade, time, day?)
// Hour 0..24. The look follows a hand-tuned colour script rather than physics, so every time of day is
// intentionally graded (the Gacha Garage golden-hour recipe: warm low key light, cool sky fill, a glow band hugging
// the horizon toward the sun, teal shadows / warm highlights in the grade):
//   pre-dawn blue hour -> pink-peach sunrise with ground mist in the hollows and over the lake -> clean morning ->
//   neutral noon -> long golden hour -> orange sunset with a magenta belt -> violet dusk -> navy night with a moon,
//   stars, the Milky Way and, on some clear nights, an aurora over the north.
// The sky function (SKY_GLSL) is shared with the Renderer, which bakes it into a small equirect probe every frame
// for reflections (the lake, puddles, wet ground).
import * as THREE from 'three';
import type { Grade } from './renderer';
import { G } from './globals';

type V3 = [number, number, number];
interface Key {
  h: number;
  zen: V3; mid: V3; hor: V3; glow: V3; fog: V3;
  sun: V3; sunI: number; hemiS: V3; hemiG: V3; hemiI: number;
  fogD: number; exp: number; stars: number; sat: number; lift: V3;
  /** ground mist, god-ray air density, split-tone warmth (+ warm highs / teal lows), contrast */
  mist: number; air: number; warm: number; con: number;
}

// colour script. Sunrise ~5.5, sunset ~19.5 (late summer, 49 N)
const KEYS: Key[] = [
  { h: 0, zen: [0.004, 0.007, 0.018], mid: [0.007, 0.011, 0.026], hor: [0.016, 0.022, 0.04], glow: [0.016, 0.022, 0.04], fog: [0.012, 0.016, 0.028], sun: [0.42, 0.52, 0.82], sunI: 0.32, hemiS: [0.10, 0.13, 0.24], hemiG: [0.02, 0.022, 0.03], hemiI: 0.38, fogD: 0.022, exp: 1.75, stars: 1, sat: 0.62, lift: [0.0, 0.006, 0.02], mist: 0.35, air: 0.4, warm: -0.2, con: 1.04 },
  { h: 4.2, zen: [0.006, 0.009, 0.022], mid: [0.01, 0.014, 0.03], hor: [0.026, 0.028, 0.05], glow: [0.04, 0.03, 0.05], fog: [0.02, 0.022, 0.034], sun: [0.42, 0.52, 0.82], sunI: 0.26, hemiS: [0.10, 0.12, 0.22], hemiG: [0.02, 0.02, 0.028], hemiI: 0.38, fogD: 0.024, exp: 1.65, stars: 0.9, sat: 0.62, lift: [0.0, 0.006, 0.02], mist: 0.7, air: 0.4, warm: -0.2, con: 1.04 },
  { h: 5.0, zen: [0.03, 0.045, 0.10], mid: [0.08, 0.08, 0.14], hor: [0.30, 0.20, 0.22], glow: [0.55, 0.26, 0.18], fog: [0.14, 0.12, 0.15], sun: [1.0, 0.5, 0.36], sunI: 0.3, hemiS: [0.20, 0.20, 0.32], hemiG: [0.05, 0.045, 0.045], hemiI: 0.45, fogD: 0.028, exp: 1.3, stars: 0.35, sat: 0.78, lift: [0.008, 0.0, 0.022], mist: 1.0, air: 0.8, warm: 0.0, con: 1.04 },
  { h: 5.8, zen: [0.12, 0.18, 0.34], mid: [0.36, 0.34, 0.44], hor: [0.92, 0.60, 0.46], glow: [1.0, 0.56, 0.32], fog: [0.48, 0.42, 0.44], sun: [1.0, 0.58, 0.36], sunI: 1.3, hemiS: [0.36, 0.36, 0.48], hemiG: [0.10, 0.08, 0.07], hemiI: 0.55, fogD: 0.026, exp: 1.08, stars: 0.05, sat: 0.9, lift: [0.012, 0.0, 0.02], mist: 1.0, air: 1.0, warm: 0.45, con: 1.06 },
  { h: 7.0, zen: [0.18, 0.32, 0.60], mid: [0.42, 0.52, 0.68], hor: [0.82, 0.74, 0.64], glow: [1.0, 0.80, 0.58], fog: [0.62, 0.62, 0.62], sun: [1.0, 0.80, 0.60], sunI: 2.4, hemiS: [0.45, 0.52, 0.66], hemiG: [0.16, 0.14, 0.10], hemiI: 0.72, fogD: 0.016, exp: 1.0, stars: 0, sat: 0.94, lift: [0.0, 0.004, 0.012], mist: 0.55, air: 0.75, warm: 0.3, con: 1.06 },
  { h: 9.0, zen: [0.18, 0.36, 0.70], mid: [0.38, 0.54, 0.76], hor: [0.68, 0.76, 0.84], glow: [0.86, 0.84, 0.80], fog: [0.60, 0.66, 0.70], sun: [1.0, 0.92, 0.80], sunI: 3.0, hemiS: [0.48, 0.57, 0.72], hemiG: [0.19, 0.17, 0.12], hemiI: 0.82, fogD: 0.010, exp: 1.0, stars: 0, sat: 0.95, lift: [0.0, 0.004, 0.012], mist: 0.08, air: 0.45, warm: 0.1, con: 1.06 },
  { h: 13, zen: [0.17, 0.35, 0.70], mid: [0.36, 0.53, 0.76], hor: [0.66, 0.75, 0.82], glow: [0.82, 0.84, 0.84], fog: [0.60, 0.66, 0.70], sun: [1.0, 0.96, 0.88], sunI: 3.25, hemiS: [0.50, 0.58, 0.72], hemiG: [0.20, 0.18, 0.13], hemiI: 0.85, fogD: 0.009, exp: 1.0, stars: 0, sat: 0.96, lift: [0.0, 0.004, 0.012], mist: 0.0, air: 0.35, warm: 0.05, con: 1.05 },
  { h: 16.4, zen: [0.18, 0.34, 0.64], mid: [0.40, 0.52, 0.70], hor: [0.78, 0.76, 0.70], glow: [0.98, 0.86, 0.66], fog: [0.64, 0.64, 0.60], sun: [1.0, 0.88, 0.70], sunI: 3.0, hemiS: [0.48, 0.53, 0.64], hemiG: [0.21, 0.17, 0.11], hemiI: 0.8, fogD: 0.011, exp: 1.0, stars: 0, sat: 0.97, lift: [0.0, 0.004, 0.012], mist: 0.0, air: 0.55, warm: 0.3, con: 1.07 },
  { h: 18.1, zen: [0.20, 0.31, 0.56], mid: [0.48, 0.50, 0.60], hor: [0.96, 0.76, 0.54], glow: [1.0, 0.68, 0.38], fog: [0.72, 0.60, 0.48], sun: [1.0, 0.72, 0.42], sunI: 2.9, hemiS: [0.44, 0.46, 0.58], hemiG: [0.22, 0.15, 0.09], hemiI: 0.68, fogD: 0.013, exp: 1.02, stars: 0, sat: 1.05, lift: [0.006, 0.0, 0.016], mist: 0.0, air: 1.0, warm: 0.7, con: 1.09 },
  { h: 19.15, zen: [0.13, 0.17, 0.36], mid: [0.42, 0.34, 0.44], hor: [1.0, 0.50, 0.26], glow: [1.0, 0.40, 0.14], fog: [0.60, 0.40, 0.33], sun: [1.0, 0.46, 0.20], sunI: 2.0, hemiS: [0.36, 0.32, 0.44], hemiG: [0.17, 0.10, 0.07], hemiI: 0.6, fogD: 0.016, exp: 1.08, stars: 0, sat: 1.06, lift: [0.014, 0.0, 0.02], mist: 0.1, air: 1.0, warm: 0.75, con: 1.08 },
  { h: 19.9, zen: [0.05, 0.06, 0.16], mid: [0.18, 0.12, 0.24], hor: [0.62, 0.26, 0.26], glow: [0.86, 0.30, 0.14], fog: [0.20, 0.14, 0.18], sun: [1.0, 0.38, 0.22], sunI: 0.5, hemiS: [0.24, 0.20, 0.34], hemiG: [0.06, 0.05, 0.05], hemiI: 0.52, fogD: 0.02, exp: 1.22, stars: 0.12, sat: 0.95, lift: [0.016, 0.0, 0.03], mist: 0.25, air: 0.7, warm: 0.3, con: 1.06 },
  { h: 20.9, zen: [0.012, 0.018, 0.045], mid: [0.025, 0.03, 0.07], hor: [0.07, 0.07, 0.12], glow: [0.16, 0.08, 0.10], fog: [0.04, 0.042, 0.065], sun: [0.42, 0.52, 0.82], sunI: 0.28, hemiS: [0.12, 0.13, 0.25], hemiG: [0.025, 0.022, 0.03], hemiI: 0.42, fogD: 0.022, exp: 1.5, stars: 0.75, sat: 0.7, lift: [0.0, 0.006, 0.022], mist: 0.3, air: 0.45, warm: -0.15, con: 1.04 },
  { h: 24, zen: [0.004, 0.007, 0.018], mid: [0.007, 0.011, 0.026], hor: [0.016, 0.022, 0.04], glow: [0.016, 0.022, 0.04], fog: [0.012, 0.016, 0.028], sun: [0.42, 0.52, 0.82], sunI: 0.32, hemiS: [0.10, 0.13, 0.24], hemiG: [0.02, 0.022, 0.03], hemiI: 0.38, fogD: 0.022, exp: 1.75, stars: 1, sat: 0.62, lift: [0.0, 0.006, 0.02], mist: 0.35, air: 0.4, warm: -0.2, con: 1.04 },
];

const NUM_KEYS = ['sunI', 'hemiI', 'fogD', 'exp', 'stars', 'sat', 'mist', 'air', 'warm', 'con'] as const;
const VEC_KEYS = ['zen', 'mid', 'hor', 'glow', 'fog', 'sun', 'hemiS', 'hemiG', 'lift'] as const;
const scratchKey: Key = JSON.parse(JSON.stringify(KEYS[0]));

function sample(h: number): Key {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
  const k = scratchKey;
  k.h = h;
  for (const n of NUM_KEYS) k[n] = a[n] + (b[n] - a[n]) * t;
  for (const n of VEC_KEYS) for (let c = 0; c < 3; c++) k[n][c] = a[n][c] + (b[n][c] - a[n][c]) * t;
  return k;
}

export interface Weather { cloud: number; rain: number; fog: number; storm: number }

/** sunrise / sunset hours of the sun path (the colour script above is timed to these) */
export const SUNRISE = 5.5, SUNSET = 19.5;

/** the sky's shared uniforms (one sky per page): the dome, the Renderer's reflection probe and the lake read them */
export const SKY_UNIFORMS = {
  uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
  uGlow: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uBelt: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
  uStars: { value: 0 }, uCloud: { value: 0.4 }, uTime: { value: 0 }, uSunVis: { value: 1 }, uGlowAmt: { value: 1 },
  uAurora: { value: 0 }, uMoonPhase: { value: 0 }, uMoonLit: { value: 1 }, uCirrus: { value: 0.5 },
};

/** sky radiance for a direction. detail 0 skips stars and the Milky Way (the reflection probe) */
export const SKY_GLSL = /* glsl */`
uniform vec3 uZen; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uFog; uniform vec3 uBelt;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uMoonDir; uniform vec3 uCloudLit; uniform vec3 uCloudDark;
uniform float uStars; uniform float uCloud; uniform float uTime; uniform float uSunVis; uniform float uGlowAmt;
uniform float uAurora; uniform float uMoonPhase; uniform float uMoonLit; uniform float uCirrus;
float skH21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skH31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float skVn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skH21(i), skH21(i + vec2(1, 0)), f.x), mix(skH21(i + vec2(0, 1)), skH21(i + vec2(1, 1)), f.x), f.y); }
float skFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * skVn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
vec3 skyColor(vec3 d, float detail) {
  float y = d.y, yy = max(y, 0.0);
  vec2 hz = normalize(d.xz + vec2(1e-5));
  vec2 sz = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(hz, sz);
  // bands: horizon -> mid -> zenith
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.2, yy));
  col = mix(col, uZen, smoothstep(0.14, 0.8, yy));
  // the warm glow band hugging the horizon toward the sun, and the pink Belt of Venus opposite it
  col = mix(col, uGlow, pow(max(az, 0.0), 3.0) * (1.0 - smoothstep(0.0, 0.32, yy)) * uGlowAmt);
  col += uBelt * pow(max(-az, 0.0), 2.0) * smoothstep(0.0, 0.06, yy) * (1.0 - smoothstep(0.08, 0.3, yy));
  float mu = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(mu, 8.0) * 0.16 + pow(mu, 80.0) * 0.45) * uSunVis;
  // night: Milky Way, stars, moon
  if (uStars > 0.001) {
    vec3 mwN = normalize(vec3(0.42, 0.38, 0.82));
    vec3 mwU = normalize(cross(mwN, vec3(0.0, 1.0, 0.0))), mwV = cross(mwN, mwU);
    float md = dot(d, mwN);
    vec2 mq = vec2(dot(d, mwU), dot(d, mwV)) * 5.0;
    float mw = exp(-md * md * 22.0) * (0.35 + 0.65 * skFbm(mq * 1.7)) * (1.0 - 0.75 * smoothstep(0.0, 0.1, abs(md + 0.06 * (skVn(mq * 3.0) - 0.5))) * skVn(mq * 2.3));
    col += vec3(0.05, 0.055, 0.075) * mw * uStars * smoothstep(0.0, 0.25, y) * detail;
    if (detail > 0.5) {
      vec3 cell = floor(d * 280.0);
      float sh = skH31(cell);
      float st = step(0.9935 - mw * 0.006, sh);
      float mag = pow(skH31(cell + 7.1), 6.0) * 2.4 + 0.12;
      vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.68), skH31(cell + 3.3));
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + 3.0 * skH31(cell + 1.9)) + sh * 60.0);
      col += tint * st * mag * tw * uStars * smoothstep(0.02, 0.22, y) * (1.0 - 0.6 * uCloud);
    }
    // moon: a phased disc with maria, and a soft halo
    float mm = dot(d, uMoonDir);
    if (mm > 0.995) {
      vec3 mR = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), mUp = cross(mR, uMoonDir);
      vec2 q = vec2(dot(d, mR), dot(d, mUp)) / 0.0105;
      float r = length(q);
      if (r < 1.0) {
        vec3 n = vec3(q, sqrt(1.0 - r * r));
        vec3 L = vec3(sin(uMoonPhase), 0.0, cos(uMoonPhase));
        float lit = smoothstep(-0.08, 0.12, dot(n, L));
        float maria = 0.72 + 0.28 * smoothstep(0.35, 0.7, skFbm(q * 2.2 + 4.0));
        col = mix(col, vec3(0.012, 0.014, 0.022), 0.9) + vec3(0.95, 0.96, 1.0) * (lit * maria * 2.2 + 0.035) * uStars;
      }
    }
    col += vec3(0.35, 0.42, 0.6) * pow(max(mm, 0.0), 300.0) * 0.5 * uStars * uMoonLit + vec3(0.12, 0.15, 0.24) * pow(max(mm, 0.0), 24.0) * 0.12 * uStars * uMoonLit;
    // aurora borealis: curtains of light in layers over the north, green below, violet above
    if (uAurora > 0.001 && y > 0.03) {
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 16; i++) {
        float fi = float(i) / 15.0;
        float h = 1.0 + fi * 1.3;
        vec2 p = d.xz * (h / (y + 0.02));
        float t = uTime * 0.035;
        float line = -3.2 + 0.9 * sin(p.x * 0.23 + t * 2.0) + 0.5 * sin(p.x * 0.61 - t * 3.1 + 1.7) + 0.6 * (skVn(vec2(p.x * 0.3, t)) - 0.5);
        float line2 = line - 1.6 + 0.5 * sin(p.x * 0.37 + t * 2.6 + 4.0);
        float c1 = exp(-pow((p.y - line) * 2.2, 2.0)), c2 = exp(-pow((p.y - line2) * 2.6, 2.0)) * 0.6;
        float rays = 0.45 + 0.55 * skVn(vec2(p.x * 3.2 + t * 4.0, 0.5)) * skVn(vec2(p.x * 9.0 - t * 2.0, 3.0));
        float fall = (1.0 - fi) * (1.0 - fi) * 0.9 + 0.1;
        vec3 c = mix(vec3(0.12, 1.0, 0.42), vec3(0.55, 0.18, 0.95), smoothstep(0.35, 1.0, fi));
        c = mix(c, vec3(0.9, 0.2, 0.35), smoothstep(0.8, 1.0, fi) * 0.5);
        acc += c * (c1 + c2) * rays * fall;
      }
      col += acc * 0.022 * uAurora * smoothstep(0.03, 0.2, y) * (1.0 - 0.85 * uCloud);
    }
  }
  // clouds: a drifting deck with sun-lit edges and silver linings, plus high cirrus that catch the sunset
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.1) * 1.15 + vec2(uTime * 0.0045, uTime * 0.0017);
    float n = skFbm(cp);
    float cov = smoothstep(0.6 - uCloud * 0.42, 0.95 - uCloud * 0.22, n);
    float n2 = skFbm(cp + sz * 0.16);
    float shade = clamp((n - n2) * 5.0 + 0.45, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, shade);
    cc += uSunCol * pow(mu, 10.0) * (1.0 - smoothstep(0.4, 0.9, cov)) * 1.4 * uSunVis;
    vec2 ci = d.xz / (y + 0.05) * vec2(0.5, 2.4) + vec2(uTime * 0.002, 0.0);
    float cir = smoothstep(0.55, 0.85, skFbm(ci)) * uCirrus * smoothstep(0.02, 0.2, y) * (1.0 - smoothstep(0.5, 0.9, y));
    col = mix(col, mix(uCloudLit, uGlow * 1.2, 0.6), cir * 0.55);
    col = mix(col, cc, cov * smoothstep(0.0, 0.12, y) * 0.92);
  }
  // sun disc (on top of thin cloud, hidden by thick)
  col += uSunCol * smoothstep(0.99935, 0.99968, mu) * 20.0 * uSunVis * step(-0.01, y);
  // horizon and below melt into the fog (the treeline disappears into haze)
  col = mix(col, uFog, 1.0 - smoothstep(-0.04, 0.09, y));
  return col;
}
`;

const DAY_S = 24;

export class Sky {
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0x8899aa, 0x332211, 0.8);
  readonly fog = new THREE.FogExp2(0x88929a, 0.012);
  readonly dome: THREE.Mesh;
  /** direction towards the sun (or moon at night) */
  readonly lightDir = new THREE.Vector3();
  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  readonly lightColor = new THREE.Color();
  readonly fogColor = new THREE.Color();
  isNight = false;
  /** 0 (bright day) .. 1 (pitch night) */
  darkness = 0;
  /** day counter (the game passes its own; otherwise counted from midnight wraps) */
  day = 0;
  /** force the aurora on (0..1) or leave it to the night's luck (null) */
  auroraOverride: number | null = null;
  /** current aurora strength 0..1 (lights the snow and the lake) */
  aurora = 0;
  /** ground mist amount used this frame 0..1 */
  mist = 0;
  private lastHour = -1;
  private mat: THREE.ShaderMaterial;
  shadowSize = 60;
  private tmpQ = new THREE.Quaternion();
  private tmpQi = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpF = new THREE.Vector3();
  private zAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene) {
    scene.fog = this.fog;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 400;
    scene.add(this.sun, this.sun.target, this.hemi);
    G.uShadowMatrix.value = this.sun.shadow.matrix;

    this.mat = new THREE.ShaderMaterial({
      uniforms: SKY_UNIFORMS,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        ${SKY_GLSL}
        varying vec3 vDir;
        void main() { gl_FragColor = vec4(skyColor(normalize(vDir), 1.0), 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);
  }

  /** hour 0..24, focus = where the shadow frustum should centre (the player). day: the game's day counter */
  update(hour: number, focus: THREE.Vector3, weather: Weather, grade: Grade, time: number, day?: number): void {
    // count days from midnight wraps unless the game tells us
    if (day !== undefined) this.day = day;
    else if (this.lastHour >= 0 && hour < this.lastHour - 12) this.day++;
    this.lastHour = hour;
    const k = sample(hour);
    const cloud = weather.cloud, rain = weather.rain;

    // sun path: rises in the east (+x) at SUNRISE, sets in the west at SUNSET, culminating low in the south (+z)
    const a = ((hour - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.78, 0.42 + 0.12 * Math.sin(a)).normalize();
    // the moon runs the opposite arc, a little later each night; phase cycles over ~29.5 days
    const phase = (((this.day + 11) % 29.5) / 29.5) * Math.PI * 2; // 0 new .. PI full
    const ma = a + Math.PI + 0.35 * Math.cos(phase);
    this.moonDir.set(Math.cos(ma) * 0.85, Math.max(0.12, Math.sin(ma) * 0.72), 0.5).normalize();
    const moonLit = 0.5 - 0.5 * Math.cos(phase); // illuminated fraction
    const sy = this.sunDir.y;
    const dayAmt = THREE.MathUtils.smoothstep(sy, -0.12, 0.08);
    // the key light: the sun until it is well below the horizon, then the moon (both dim through the swap)
    this.isNight = sy < -0.07;
    const sunK = THREE.MathUtils.smoothstep(sy, -0.07, 0.03);
    const moonK = 1 - THREE.MathUtils.smoothstep(sy, -0.14, -0.07);
    if (this.isNight) this.lightDir.copy(this.moonDir);
    else this.lightDir.copy(this.sunDir).setY(Math.max(sy, 0.04)).normalize();

    const dim = 1 - 0.6 * cloud - 0.25 * rain;
    this.sun.color.setRGB(k.sun[0], k.sun[1], k.sun[2]);
    if (this.isNight) {
      this.sun.color.setRGB(0.42, 0.52, 0.82);
      this.sun.intensity = 0.34 * (0.35 + 0.65 * moonLit) * moonK * (1 - 0.7 * cloud);
    } else this.sun.intensity = k.sunI * dim * sunK;
    // overcast light is cooler and flatter
    if (cloud > 0.5) this.sun.color.lerp(this.tmpColor.setRGB(0.85, 0.88, 0.92), (cloud - 0.5) * 1.2);
    this.lightColor.copy(this.sun.color);
    this.hemi.color.setRGB(k.hemiS[0], k.hemiS[1], k.hemiS[2]);
    this.hemi.groundColor.setRGB(k.hemiG[0], k.hemiG[1], k.hemiG[2]);
    this.hemi.intensity = k.hemiI * (1 - 0.2 * rain) * (1 + 0.35 * cloud * dayAmt);

    const grey = (c: V3, amt: number): V3 => {
      const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
      return [c[0] + (l - c[0]) * amt, c[1] + (l - c[1]) * amt, c[2] + (l - c[2]) * amt];
    };
    const fogC = grey(k.fog, 0.55 * cloud + 0.35 * rain);
    this.fogColor.setRGB(fogC[0], fogC[1], fogC[2]).multiplyScalar(1 - 0.35 * rain);
    this.fog.color.copy(this.fogColor);
    this.fog.density = k.fogD * (1 + 1.6 * weather.fog + 0.9 * rain);

    // aurora: about one clear night in three, strongest after midnight
    const luck = fract(Math.sin((this.day + 3) * 91.7) * 4375.85);
    const auroraNight = this.auroraOverride ?? (luck < 0.34 ? 0.55 + luck * 1.3 : 0);
    this.aurora = auroraNight * THREE.MathUtils.smoothstep(k.stars, 0.5, 1) * Math.max(0, 1 - cloud * 1.6) * (1 - rain);

    const u = SKY_UNIFORMS;
    const sat = (c: V3, amt: number, mul = 1): V3 => grey(c, amt).map((v) => v * mul) as V3;
    const zen = sat(k.zen, 0.65 * cloud, 1 - 0.4 * rain), mid = sat(k.mid, 0.6 * cloud, 1 - 0.4 * rain), hor = sat(k.hor, 0.5 * cloud, 1 - 0.4 * rain);
    u.uZen.value.setRGB(zen[0], zen[1], zen[2]);
    u.uMid.value.setRGB(mid[0], mid[1], mid[2]);
    u.uHor.value.setRGB(hor[0], hor[1], hor[2]);
    u.uGlow.value.setRGB(k.glow[0], k.glow[1], k.glow[2]).lerp(u.uHor.value, Math.min(1, cloud * 0.9));
    u.uFog.value.copy(this.fogColor);
    // the Belt of Venus: pink opposite the low sun in twilight
    const twi = Math.max(0, 1 - Math.abs(sy + 0.02) / 0.12);
    u.uBelt.value.setRGB(0.22, 0.09, 0.14).multiplyScalar(twi * (1 - cloud));
    u.uGlowAmt.value = (0.35 + 0.65 * (1 - THREE.MathUtils.smoothstep(sy, 0.05, 0.5))) * (1 - 0.5 * cloud);
    u.uSunDir.value.copy(this.sunDir); u.uMoonDir.value.copy(this.moonDir);
    u.uSunCol.value.setRGB(k.sun[0], k.sun[1], k.sun[2]);
    u.uStars.value = k.stars; u.uCloud.value = cloud; u.uTime.value = time;
    u.uSunVis.value = dayAmt * (1 - 0.85 * cloud);
    u.uAurora.value = this.aurora;
    u.uMoonPhase.value = Math.PI - phase; u.uMoonLit.value = moonLit;
    u.uCirrus.value = 0.35 + 0.65 * (1 - cloud) * Math.max(0, 1 - Math.abs(sy - 0.05) / 0.35);
    // cloud shading: sun-lit tops warm at golden hour, pink-orange undersides at sunset, dark grey in rain
    const lowSun = 1 - THREE.MathUtils.smoothstep(sy, 0.0, 0.35);
    u.uCloudLit.value.copy(u.uHor.value).lerp(u.uGlow.value, 0.35 + 0.5 * lowSun).multiplyScalar(1.05 + 0.25 * dayAmt * (1 - cloud));
    u.uCloudDark.value.copy(u.uMid.value).lerp(u.uZen.value, 0.3).multiplyScalar(0.8 - 0.25 * cloud);
    if (dayAmt < 0.5) { u.uCloudLit.value.lerp(this.fogColor, (0.5 - dayAmt) * 1.4); u.uCloudDark.value.lerp(u.uZen.value, (0.5 - dayAmt)); }
    this.dome.position.copy(focus);

    // shared globals: light for volumetrics, sky colours for reflections, mist
    G.uSunDir.value.copy(this.lightDir);
    G.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    G.uSkyZen.value.copy(u.uZen.value); G.uSkyHor.value.copy(u.uHor.value); G.uFogCol.value.copy(this.fogColor);
    this.darkness = 1 - dayAmt;
    G.uDarkness.value = this.darkness;
    const shadowTex = (this.sun.shadow.map as THREE.WebGLRenderTarget | null)?.depthTexture ?? null;
    G.uShadowMap.value = shadowTex;
    G.uShadowMatrix.value = this.sun.shadow.matrix;
    this.mist = Math.min(1, k.mist * (1 - 0.5 * cloud * dayAmt) * (1 - 0.6 * rain) + weather.fog * 0.7);
    G.uMist.value = this.mist;

    // shadow frustum follows the focus, snapped to texels to avoid shimmering
    const S = this.shadowSize;
    const sc = this.sun.shadow.camera;
    if (sc.left !== -S) { sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.updateProjectionMatrix(); }
    const texel = (2 * S) / this.sun.shadow.mapSize.x;
    const f = this.tmpF.copy(focus);
    const lq = this.tmpQ.setFromUnitVectors(this.zAxis, this.tmpV.copy(this.lightDir).negate());
    const inv = this.tmpQi.copy(lq).invert();
    f.applyQuaternion(inv);
    f.x = Math.round(f.x / texel) * texel; f.y = Math.round(f.y / texel) * texel;
    f.applyQuaternion(lq);
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(this.lightDir, 180);
    this.sun.target.updateMatrixWorld();

    // grade: per time of day, then weather (overcast and rain flatten, cool and desaturate; fog lifts the blacks)
    const gloom = Math.min(1, cloud * 0.7 + rain * 0.6);
    grade.exposure = k.exp * (1 + 0.08 * gloom * dayAmt);
    grade.saturation = k.sat * (1 - 0.28 * gloom);
    grade.lift.set(k.lift[0], k.lift[1] + 0.006 * weather.fog, k.lift[2] + 0.008 * weather.fog);
    grade.warm = k.warm * (1 - 0.8 * gloom) - 0.12 * rain;
    grade.contrast = k.con - 0.06 * gloom - 0.05 * weather.fog;
    grade.shafts = 0.7 * (1 - cloud * 0.75) * (0.4 + 0.6 * k.air);
    grade.mie = 0.4 * (1 - 0.5 * cloud) * (1 + weather.fog);
    grade.air = k.air * (1 - 0.6 * cloud) * (1 + 0.5 * weather.fog);
    grade.bloom = 0.45 + 0.4 * this.darkness;
  }

  private tmpColor = new THREE.Color();
}

function fract(x: number): number { return x - Math.floor(x); }
void DAY_S;
