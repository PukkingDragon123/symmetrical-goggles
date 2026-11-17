// Sky dome, sun/moon lights, fog and colour grade driven by the hour of the day and the weather.
//   const sky = new Sky(scene); sky.update(hour, cameraPos, weather)
// Hour 0..24. The look follows a hand-tuned colour script (golden afternoon, violet dusk, black night with a
// cold moon, pink dawn) rather than physics, so every time of day is intentionally graded.
import * as THREE from 'three';
import type { Grade } from './renderer';

interface Key {
  h: number;
  zen: [number, number, number]; hor: [number, number, number]; fog: [number, number, number];
  sun: [number, number, number]; sunI: number; hemiS: [number, number, number]; hemiG: [number, number, number]; hemiI: number;
  fogD: number; exp: number; stars: number; sat: number; lift: [number, number, number];
}

// colour script
const KEYS: Key[] = [
  { h: 0, zen: [0.004, 0.006, 0.014], hor: [0.012, 0.016, 0.026], fog: [0.010, 0.013, 0.020], sun: [0.35, 0.45, 0.75], sunI: 0.22, hemiS: [0.10, 0.13, 0.22], hemiG: [0.02, 0.02, 0.025], hemiI: 0.35, fogD: 0.028, exp: 1.7, stars: 1, sat: 0.7, lift: [0.0, 0.004, 0.012] },
  { h: 4.6, zen: [0.006, 0.008, 0.02], hor: [0.02, 0.022, 0.04], fog: [0.016, 0.018, 0.028], sun: [0.35, 0.45, 0.75], sunI: 0.2, hemiS: [0.10, 0.12, 0.2], hemiG: [0.02, 0.02, 0.025], hemiI: 0.35, fogD: 0.03, exp: 1.6, stars: 0.9, sat: 0.7, lift: [0.0, 0.004, 0.012] },
  { h: 5.6, zen: [0.08, 0.1, 0.2], hor: [0.55, 0.36, 0.32], fog: [0.30, 0.26, 0.28], sun: [1.0, 0.55, 0.42], sunI: 0.9, hemiS: [0.32, 0.30, 0.42], hemiG: [0.08, 0.07, 0.06], hemiI: 0.55, fogD: 0.030, exp: 1.1, stars: 0.2, sat: 0.85, lift: [0.01, 0.0, 0.02] },
  { h: 7.5, zen: [0.22, 0.36, 0.62], hor: [0.75, 0.70, 0.64], fog: [0.56, 0.58, 0.58], sun: [1.0, 0.82, 0.62], sunI: 2.4, hemiS: [0.45, 0.52, 0.66], hemiG: [0.16, 0.14, 0.10], hemiI: 0.75, fogD: 0.018, exp: 1.0, stars: 0, sat: 0.92, lift: [0.0, 0.004, 0.012] },
  { h: 12, zen: [0.20, 0.38, 0.70], hor: [0.66, 0.74, 0.80], fog: [0.58, 0.64, 0.68], sun: [1.0, 0.95, 0.86], sunI: 3.2, hemiS: [0.50, 0.58, 0.72], hemiG: [0.20, 0.18, 0.13], hemiI: 0.85, fogD: 0.010, exp: 1.0, stars: 0, sat: 0.95, lift: [0.0, 0.004, 0.012] },
  { h: 16, zen: [0.20, 0.34, 0.62], hor: [0.74, 0.72, 0.66], fog: [0.60, 0.60, 0.58], sun: [1.0, 0.86, 0.66], sunI: 2.8, hemiS: [0.48, 0.52, 0.62], hemiG: [0.20, 0.16, 0.11], hemiI: 0.8, fogD: 0.012, exp: 1.0, stars: 0, sat: 0.95, lift: [0.0, 0.004, 0.012] },
  { h: 18.4, zen: [0.16, 0.22, 0.42], hor: [0.95, 0.62, 0.36], fog: [0.62, 0.48, 0.38], sun: [1.0, 0.58, 0.28], sunI: 2.3, hemiS: [0.42, 0.38, 0.46], hemiG: [0.18, 0.12, 0.08], hemiI: 0.65, fogD: 0.016, exp: 1.05, stars: 0, sat: 1.0, lift: [0.01, 0.0, 0.015] },
  { h: 19.6, zen: [0.06, 0.07, 0.16], hor: [0.52, 0.28, 0.24], fog: [0.22, 0.16, 0.18], sun: [1.0, 0.42, 0.25], sunI: 0.7, hemiS: [0.22, 0.20, 0.32], hemiG: [0.06, 0.05, 0.05], hemiI: 0.5, fogD: 0.022, exp: 1.2, stars: 0.15, sat: 0.9, lift: [0.01, 0.0, 0.025] },
  { h: 20.8, zen: [0.012, 0.016, 0.04], hor: [0.06, 0.05, 0.09], fog: [0.035, 0.035, 0.055], sun: [0.4, 0.45, 0.75], sunI: 0.22, hemiS: [0.12, 0.13, 0.24], hemiG: [0.025, 0.022, 0.03], hemiI: 0.4, fogD: 0.028, exp: 1.5, stars: 0.7, sat: 0.75, lift: [0.0, 0.004, 0.016] },
  { h: 24, zen: [0.004, 0.006, 0.014], hor: [0.012, 0.016, 0.026], fog: [0.010, 0.013, 0.020], sun: [0.35, 0.45, 0.75], sunI: 0.22, hemiS: [0.10, 0.13, 0.22], hemiG: [0.02, 0.02, 0.025], hemiI: 0.35, fogD: 0.028, exp: 1.7, stars: 1, sat: 0.7, lift: [0.0, 0.004, 0.012] },
];

function sample(h: number): Key {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
  const m3 = (x: [number, number, number], y: [number, number, number]): [number, number, number] =>
    [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    h, zen: m3(a.zen, b.zen), hor: m3(a.hor, b.hor), fog: m3(a.fog, b.fog), sun: m3(a.sun, b.sun), sunI: m(a.sunI, b.sunI),
    hemiS: m3(a.hemiS, b.hemiS), hemiG: m3(a.hemiG, b.hemiG), hemiI: m(a.hemiI, b.hemiI), fogD: m(a.fogD, b.fogD),
    exp: m(a.exp, b.exp), stars: m(a.stars, b.stars), sat: m(a.sat, b.sat), lift: m3(a.lift, b.lift),
  };
}

export interface Weather { cloud: number; rain: number; fog: number; storm: number }

export class Sky {
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0x8899aa, 0x332211, 0.8);
  readonly fog = new THREE.FogExp2(0x88929a, 0.012);
  readonly dome: THREE.Mesh;
  /** direction towards the sun (or moon at night) */
  readonly lightDir = new THREE.Vector3();
  readonly sunDir = new THREE.Vector3();
  readonly lightColor = new THREE.Color();
  readonly fogColor = new THREE.Color();
  isNight = false;
  /** 0 (bright day) .. 1 (pitch night) */
  darkness = 0;
  private mat: THREE.ShaderMaterial;
  shadowSize = 60;

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

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3() },
        uStars: { value: 0 }, uCloud: { value: 0.4 }, uTime: { value: 0 }, uSunVis: { value: 1 },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uMoonDir;
        uniform float uStars; uniform float uCloud; uniform float uTime; uniform float uSunVis;
        varying vec3 vDir;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 col = mix(uHor, uZen, pow(y, 0.45));
          // horizon melts into the fog colour (the treeline disappears into haze)
          col = mix(col, uFog, 1.0 - smoothstep(-0.02, 0.22, d.y));
          float mu = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(mu, 6.0) * 0.25 + pow(mu, 64.0) * 0.6) * uSunVis;
          // sun disc
          col += uSunCol * smoothstep(0.9993, 0.99965, mu) * 18.0 * uSunVis;
          // moon disc + halo
          float mm = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.75, 0.8, 0.95) * (smoothstep(0.99955, 0.9998, mm) * 3.0 + pow(mm, 200.0) * 0.12) * uStars;
          // stars (pixel-sized, twinkling)
          vec2 sp = vec2(atan(d.z, d.x) * 180.0, d.y * 260.0);
          float st = step(0.9965, h21(floor(sp))) * smoothstep(0.05, 0.3, d.y);
          st *= 0.5 + 0.5 * sin(uTime * 2.0 + h21(floor(sp) + 3.1) * 40.0);
          col += vec3(0.8, 0.85, 1.0) * st * uStars * 0.9;
          // clouds: a slow drifting layer
          if (d.y > 0.0) {
            vec2 cp = d.xz / (d.y + 0.12) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
            float c = smoothstep(0.55 - uCloud * 0.35, 0.95, fbm(cp));
            vec3 cl = mix(uHor * 0.9, uSunCol * 0.9 + uHor * 0.4, pow(mu, 3.0) * uSunVis);
            cl = mix(cl, uFog * 0.7, uStars * 0.8);
            col = mix(col, cl, c * smoothstep(0.0, 0.15, d.y) * 0.85);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);
  }

  /** hour 0..24, focus = where the shadow frustum should centre (the player) */
  update(hour: number, focus: THREE.Vector3, weather: Weather, grade: Grade, time: number): void {
    const k = sample(hour);
    // sun path: rises in the east (+x), sets in the west, low in the south (+z), latitude ~ 49 N
    const a = ((hour - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.78, 0.42 + 0.1 * Math.sin(a)).normalize();
    const moonDir = new THREE.Vector3(-Math.cos(a) * 0.7, Math.max(0.35, -Math.sin(a) * 0.8), -0.4).normalize();
    this.isNight = this.sunDir.y < -0.04;
    const dayAmt = THREE.MathUtils.smoothstep(this.sunDir.y, -0.12, 0.08);
    this.lightDir.copy(this.isNight ? moonDir : this.sunDir);

    const cloud = weather.cloud, rain = weather.rain;
    const dim = 1 - 0.55 * cloud - 0.25 * rain;
    this.sun.color.setRGB(k.sun[0], k.sun[1], k.sun[2]);
    this.sun.intensity = k.sunI * (this.isNight ? 1 - 0.6 * cloud : dim * (0.15 + 0.85 * dayAmt));
    this.lightColor.copy(this.sun.color);
    this.hemi.color.setRGB(k.hemiS[0], k.hemiS[1], k.hemiS[2]);
    this.hemi.groundColor.setRGB(k.hemiG[0], k.hemiG[1], k.hemiG[2]);
    this.hemi.intensity = k.hemiI * (1 - 0.2 * rain);

    const grey = (c: [number, number, number], amt: number): [number, number, number] => {
      const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
      return [c[0] + (l - c[0]) * amt, c[1] + (l - c[1]) * amt, c[2] + (l - c[2]) * amt];
    };
    const fogC = grey(k.fog, 0.5 * cloud + 0.3 * rain);
    this.fogColor.setRGB(fogC[0], fogC[1], fogC[2]).multiplyScalar(1 - 0.35 * rain);
    this.fog.color.copy(this.fogColor);
    this.fog.density = k.fogD * (1 + 1.5 * weather.fog + 0.8 * rain);

    const u = this.mat.uniforms;
    const zen = grey(k.zen, 0.6 * cloud), hor = grey(k.hor, 0.5 * cloud);
    (u.uZen.value as THREE.Color).setRGB(zen[0], zen[1], zen[2]).multiplyScalar(1 - 0.4 * rain);
    (u.uHor.value as THREE.Color).setRGB(hor[0], hor[1], hor[2]).multiplyScalar(1 - 0.4 * rain);
    (u.uFog.value as THREE.Color).copy(this.fogColor);
    u.uSunDir.value.copy(this.sunDir); u.uMoonDir.value.copy(moonDir);
    (u.uSunCol.value as THREE.Color).setRGB(k.sun[0], k.sun[1], k.sun[2]);
    u.uStars.value = k.stars * (1 - cloud); u.uCloud.value = cloud; u.uTime.value = time;
    u.uSunVis.value = dayAmt * (1 - 0.8 * cloud);
    this.dome.position.copy(focus);

    // shadow frustum follows the focus, snapped to texels to avoid shimmering
    const S = this.shadowSize;
    const sc = this.sun.shadow.camera;
    sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S;
    sc.updateProjectionMatrix();
    const texel = (2 * S) / this.sun.shadow.mapSize.x;
    const f = focus.clone();
    // snap in light space
    const lq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.lightDir.clone().negate());
    const inv = lq.clone().invert();
    const lp = f.clone().applyQuaternion(inv);
    lp.x = Math.round(lp.x / texel) * texel; lp.y = Math.round(lp.y / texel) * texel;
    f.copy(lp.applyQuaternion(lq));
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(this.lightDir, 180);
    this.sun.target.updateMatrixWorld();

    this.darkness = 1 - dayAmt;
    grade.exposure = k.exp;
    grade.saturation = k.sat * (1 - 0.25 * rain);
    grade.lift.set(k.lift[0], k.lift[1], k.lift[2]);
    grade.shafts = 0.75 * (1 - cloud * 0.7);
    grade.mie = 0.42 * (1 - 0.5 * cloud) * (1 + weather.fog);
  }
}
