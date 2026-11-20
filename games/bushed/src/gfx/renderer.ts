// The renderer: world + viewmodel drawn into a low internal-resolution HDR target, then a post chain:
//   0. sky probe: the sky function baked into a small equirect target (reflections for the lake and puddles)
//   1. atmosphere (half res): a jittered ray march through the sun's shadow map and the ground-mist field:
//      god rays through the canopy, dawn mist in the hollows and over the lake (lit by the low sun, shadowed by the
//      trees), and analytic in-scatter halos around practical lights (lanterns, windows, campfires)
//   2. shafts: sky/sun mask at quarter res, radial blur toward the sun (light streaming past the treeline)
//   3. bloom: soft-knee bright-pass at quarter res, blurred at 1/4, 1/8 and 1/16 (tight core + wide glow)
//   4. composite at internal res: lake reflections (screen-space ray march, sky probe fallback, Fresnel, wind
//      roughness), atmosphere, sun-tinted aerial perspective (Mie glow), shafts, bloom, filmic tone map, grade
//      (exposure, contrast, lift/gamma/gain, split toning, saturation), vignette, ordered dither + quantise, grain
//   5. nearest-neighbour upscale to the screen.
// Every pass snaps to the internal pixel grid so the picture reads as crisp, high-resolution pixel art.
import * as THREE from 'three';
import { G, WATER_GLSL } from './globals';
import { SKY_GLSL, SKY_UNIFORMS } from './sky';
import { MatteWatcher } from './matte';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export interface Grade {
  exposure: number; lift: THREE.Vector3; gamma: THREE.Vector3; gain: THREE.Vector3; saturation: number;
  vignette: number; grain: number; shafts: number; bloom: number; mie: number; quant: number;
  /** split toning: + warm highlights / teal shadows, - cooler (night) */
  warm: number;
  /** contrast around mid grey (1 = neutral) */
  contrast: number;
  /** god-ray air density multiplier (0 = no shafts in the air) */
  air: number;
}

export function defaultGrade(): Grade {
  return {
    exposure: 1.0,
    lift: new THREE.Vector3(0.0, 0.004, 0.012),
    gamma: new THREE.Vector3(1.0, 1.0, 1.0),
    gain: new THREE.Vector3(1.0, 1.0, 1.0),
    saturation: 0.92, vignette: 0.35, grain: 0.04, shafts: 0.6, bloom: 0.5, mie: 0.6, quant: 48,
    warm: 0.2, contrast: 1.05, air: 0.6,
  };
}

function fsQuad(mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

const MAX_LIGHTS = 8;

const COMMON = /* glsl */`
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x) + int(q.y) * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return m[i] / 16.0;
}
float linDepth(float d, float n, float f) { float z = d * 2.0 - 1.0; return (2.0 * n * f) / (f + n - z * (f - n)); }
`;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  /** screen pixels per internal pixel (2 = half resolution) */
  pixel = 2;
  grade = defaultGrade();
  /** sun direction (world, towards the sun) and colour for shafts / Mie */
  sunDir = new THREE.Vector3(0.3, 0.6, 0.2).normalize();
  sunColor = new THREE.Color(1, 0.9, 0.7);
  fogColor = new THREE.Color(0.5, 0.55, 0.6);
  /** the half-res atmosphere pass (god rays, mist, light halos); off = cheaper */
  atmosphere = true;

  private rt!: THREE.WebGLRenderTarget;
  private ldr!: THREE.WebGLRenderTarget;
  private volRT!: THREE.WebGLRenderTarget;
  private qA!: THREE.WebGLRenderTarget;
  private qB!: THREE.WebGLRenderTarget;
  private eA!: THREE.WebGLRenderTarget;
  private eB!: THREE.WebGLRenderTarget;
  private sA!: THREE.WebGLRenderTarget;
  private sB!: THREE.WebGLRenderTarget;
  private shaftRT!: THREE.WebGLRenderTarget;
  private probe: THREE.WebGLRenderTarget;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private quad: THREE.Mesh;
  private mProbe: THREE.ShaderMaterial;
  private mVol: THREE.ShaderMaterial;
  private mMask: THREE.ShaderMaterial;
  private mRadial: THREE.ShaderMaterial;
  private mBright: THREE.ShaderMaterial;
  private mBlur: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial;
  private mBlit: THREE.ShaderMaterial;
  private w = 1; private h = 1;
  private frame = 0;
  // scratch (no per-frame allocation)
  private v3 = new THREE.Vector3();
  private v3b = new THREE.Vector3();
  private sunUv = new THREE.Vector2();
  private lights: THREE.PointLight[] = [];
  private lightScanAt = -1;
  private lightPick: { l: THREE.PointLight; s: number }[] = [];
  private matte = new MatteWatcher();
  /** indoor volumes where the ground mist must not reach (the game's interior boxes); null = look for them on the
   *  game object (window.__game.interiors) */
  mistHoles: THREE.Box3[] | null = null;
  private holeCount = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.gl.setPixelRatio(1);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.autoClear = false;

    // ---- sky probe (equirect: u = azimuth, v = elevation)
    this.probe = new THREE.WebGLRenderTarget(128, 64, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.probe.texture.wrapS = THREE.RepeatWrapping;
    this.mProbe = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        ${SKY_GLSL}
        varying vec2 vUv;
        void main() {
          float az = (vUv.x - 0.5) * 6.2831853, el = (vUv.y - 0.5) * 3.14159265;
          vec3 d = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
          gl_FragColor = vec4(skyColor(d, 0.0), 1.0);
        }`,
      uniforms: SKY_UNIFORMS,
      depthTest: false, depthWrite: false,
    });

    // ---- atmosphere: god rays + mist + light halos (half res). out: rgb in-scatter, a = transmittance
    const lightsU = { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) };
    const lightsC = { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) };
    const lightsS = { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) };
    this.mVol = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        precision highp sampler2DShadow;
        uniform sampler2D tDepth; uniform sampler2DShadow tShadow; uniform mat4 uShadowMatrix; uniform float uShadowOn;
        uniform sampler2D tMist; uniform vec4 uMistBox; uniform float uMist;
        uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform float uNear; uniform float uFar;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform float uAir; uniform vec2 uRes;
        uniform float uTime; uniform vec2 uWindDir;
        uniform vec4 uL[${MAX_LIGHTS}]; uniform vec4 uLC[${MAX_LIGHTS}]; uniform vec4 uLS[${MAX_LIGHTS}]; uniform int uNL; uniform int uSteps; uniform vec3 uHoleMin[4]; uniform vec3 uHoleMax[4];
        varying vec2 vUv;
        ${COMMON}
        float vh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(vh(i), vh(i + vec2(1, 0)), f.x), mix(vh(i + vec2(0, 1)), vh(i + vec2(1, 1)), f.x), f.y); }
        float sunLit(vec3 p) {
          if (uShadowOn < 0.5) return 1.0;
          vec4 sc = uShadowMatrix * vec4(p, 1.0);
          sc.xyz /= sc.w;
          if (sc.x < 0.001 || sc.y < 0.001 || sc.x > 0.999 || sc.y > 0.999 || sc.z > 1.0) return 1.0;
          return texture(tShadow, vec3(sc.xy, sc.z - 0.0015));
        }
        float indoor(vec3 p) {
          float k = 0.0;
          for (int i = 0; i < 4; i++) {
            vec3 a = smoothstep(uHoleMin[i] - 0.4, uHoleMin[i] + 0.2, p) * (1.0 - smoothstep(uHoleMax[i] - 0.2, uHoleMax[i] + 0.4, p));
            k = max(k, a.x * a.y * a.z);
          }
          return k;
        }
        float mistAt(vec3 p) {
          if (indoor(p) > 0.99) return 0.0;
          vec2 m = texture2D(tMist, (p.xz - uMistBox.xy) / uMistBox.zw).rg;
          float k = clamp((m.r - p.y) / 2.2, 0.0, 1.0);
          if (k <= 0.0) return 0.0;
          vec2 q = p.xz * 0.045 - uWindDir * uTime * 0.25;
          float n = vn(q) * 0.6 + vn(q * 2.7 + vec2(uTime * 0.05, 3.0)) * 0.4;
          return k * k * (0.25 + 0.75 * smoothstep(0.2, 0.75, n)) * (1.0 - indoor(p));
        }
        void main() {
          float d = texture2D(tDepth, vUv).r;
          vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 vp = uInvProj * ndc; vp /= vp.w;
          float dist = d > 0.99999 ? 1e4 : length(vp.xyz);
          vec3 rd = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
          float mu = dot(rd, uSunDir);
          // Henyey-Greenstein, forward lobe + a little isotropic
          float g = 0.6, hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
          float phase = 0.02 + hg * 0.12;
          float jit = bayer4(gl_FragCoord.xy) + vh(gl_FragCoord.xy + fract(uTime) * 61.0) * 0.25;
          float maxT = min(dist, 150.0);
          float T = 1.0; vec3 S = vec3(0.0);
          float mistOn = uMist;
          float N = float(uSteps);
          for (int i = 0; i < 32; i++) {
            if (i >= uSteps) break;
            float f0 = (float(i) + jit) / N;
            float t = maxT * f0 * f0, dt = maxT * 2.0 * f0 / N;
            vec3 p = uCamPos + rd * t;
            float lit = sunLit(p);
            float air = uAir * 0.0018 * (1.0 - smoothstep(42.0, 60.0, t));
            float dm = mistOn > 0.001 ? mistOn * 0.011 * mistAt(p) : 0.0;
            vec3 Ls = uSunCol * phase * lit;
            S += T * (air * Ls + dm * (Ls * 0.45 + uAmb)) * dt;
            T *= exp(-dm * dt);
          }
          // practical lights: analytic single scattering along the ray (lantern and campfire halos in the air)
          float dens = 0.012 + 0.08 * uMist * mistAt(uCamPos + rd * min(dist, 6.0));
          for (int i = 0; i < ${MAX_LIGHTS}; i++) {
            if (i >= uNL) break;
            vec3 v = uL[i].xyz - uCamPos;
            float tc = dot(v, rd);
            float h2 = max(dot(v, v) - tc * tc, 0.0004);
            float h = sqrt(h2);
            float tEnd = min(dist, tc + uL[i].w);
            float I = (atan((tEnd - tc) / h) + atan(tc / h)) / h;
            // occluded light cores (lamps indoors seen through walls) barely glow
            float vis = 1.0;
            if (uLS[i].w > 0.5) { float sd = linDepth(texture2D(tDepth, uLS[i].xy).r, uNear, uFar); vis = sd < uLS[i].z - 0.35 ? 0.12 : 1.0; }
            float fall = 1.0 - smoothstep(0.0, uL[i].w, h);
            S += uLC[i].rgb * max(I, 0.0) * dens * fall * vis * 0.08;
          }
          gl_FragColor = vec4(S, T);
        }`,
      uniforms: {
        tDepth: { value: null }, tShadow: G.uShadowMap, uShadowMatrix: G.uShadowMatrix, uShadowOn: { value: 0 },
        tMist: G.uMistMap, uMistBox: G.uMistBox, uMist: { value: 0 },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uNear: { value: 0.1 }, uFar: { value: 1000 },
        uSunDir: G.uSunDir, uSunCol: G.uSunCol, uAmb: { value: new THREE.Color() }, uAir: { value: 1 }, uRes: { value: new THREE.Vector2() },
        uTime: G.uTime, uWindDir: G.uWindDir,
        uL: lightsU, uLC: lightsC, uLS: lightsS, uNL: { value: 0 }, uSteps: { value: 22 },
        uHoleMin: { value: Array.from({ length: 4 }, () => new THREE.Vector3(1e6, 1e6, 1e6)) }, uHoleMax: { value: Array.from({ length: 4 }, () => new THREE.Vector3(-1e6, -1e6, -1e6)) },
      },
      depthTest: false, depthWrite: false,
    });
    this.mMask = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uSunUv; uniform float uSunVis;
        varying vec2 vUv;
        void main() {
          float d = texture2D(tDepth, vUv).r;
          vec3 c = texture2D(tColor, vUv).rgb;
          float sky = step(0.99999, d);
          float l = dot(c, vec3(0.3, 0.55, 0.15));
          float near = 1.0 - smoothstep(0.0, 0.55, distance(vUv * vec2(1.6, 1.0), uSunUv * vec2(1.6, 1.0)));
          gl_FragColor = vec4(vec3(sky * min(l, 4.0) * (0.2 + near) * uSunVis), 1.0);
        }`,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uSunUv: { value: new THREE.Vector2() }, uSunVis: { value: 1 } },
      depthTest: false, depthWrite: false,
    });
    this.mRadial = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform vec2 uSunUv; uniform float uStep;
        varying vec2 vUv;
        void main() {
          vec2 dir = (uSunUv - vUv) * uStep / 24.0;
          vec2 p = vUv; float w = 1.0; vec3 s = vec3(0.0); float tw = 0.0;
          for (int i = 0; i < 24; i++) { s += texture2D(tSrc, p).rgb * w; tw += w; w *= 0.955; p += dir; }
          gl_FragColor = vec4(s / tw, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, uSunUv: { value: new THREE.Vector2() }, uStep: { value: 1 } },
      depthTest: false, depthWrite: false,
    });
    this.mBright = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform float uThresh; uniform vec2 uTexel; varying vec2 vUv;
        vec3 tap(vec2 o) { vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb; return min(c, vec3(60.0)); }
        void main() {
          // 4-tap box (the source is 4x larger) so small lamps and sparks are not missed
          vec3 c = (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.25;
          float l = max(c.r, max(c.g, c.b));
          // soft knee
          float k = uThresh * 0.5;
          float s = clamp(l - uThresh + k, 0.0, 2.0 * k);
          s = s * s / (4.0 * k + 1e-4);
          float w = max(s, l - uThresh) / max(l, 1e-4);
          gl_FragColor = vec4(c * w, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, uThresh: { value: 1.0 }, uTexel: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });
    this.mBlur = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
          s += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
          s += (texture2D(tSrc, vUv + uDir * 3.23).rgb + texture2D(tSrc, vUv - uDir * 3.23).rgb) * 0.070;
          gl_FragColor = vec4(s, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });
    this.mComp = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tShaft; uniform sampler2D tBloom; uniform sampler2D tBloom2;
        uniform sampler2D tBloom3; uniform sampler2D tVol; uniform sampler2D tProbe; uniform float uVolOn;
        uniform vec2 uRes; uniform float uTime; uniform float uFrame; uniform vec2 uWindDir; uniform float uWind;
        uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform mat4 uViewProj; uniform vec3 uCamPos; uniform float uNear; uniform float uFar;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uFogCol; uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec4 uLake;
        uniform float uExposure; uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain; uniform float uSat; uniform float uWarm; uniform float uCon;
        uniform float uVig; uniform float uGrain; uniform float uShafts; uniform float uBloom; uniform float uMie; uniform float uQuant;
        uniform float uFlash; uniform float uDamage; uniform float uCold; uniform float uFade;
        varying vec2 vUv;
        ${COMMON}
        ${WATER_GLSL}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.618) * 43758.5453); }
        vec3 filmic(vec3 x) {
          // ACES (Narkowicz) with a gentle shoulder
          x *= 0.9;
          return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        vec3 probe(vec3 d) {
          d.y = max(d.y, 0.0);
          vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
          return texture2D(tProbe, uv).rgb;
        }
        // half-res atmosphere, upsampled with depth weights so tree edges stay crisp
        vec4 volAt(vec2 uv, float dl) {
          vec2 hres = uRes * 0.5;
          vec2 base = floor(uv * hres - 0.5) + 0.5;
          vec4 acc = vec4(0.0); float tw = 0.0;
          for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
            vec2 tuv = (base + vec2(float(i), float(j))) / hres;
            float td = linDepth(texture2D(tDepth, tuv).r, uNear, uFar);
            vec2 f = abs(uv * hres - (base + vec2(float(i), float(j))));
            float w = (1.0 - f.x) * (1.0 - f.y) + 1e-3;
            w *= 1.0 / (1e-3 + abs(td - dl) / max(dl, 1.0) * 30.0);
            acc += texture2D(tVol, tuv) * w; tw += w;
          }
          return acc / tw;
        }

        void main() {
          vec2 px = floor(vUv * uRes) + 0.5;
          vec2 uv = px / uRes;
          // subtle chromatic fringing toward the edges
          vec2 cc = uv - 0.5;
          float ca = dot(cc, cc) * 0.0035;
          vec4 src = texture2D(tColor, uv);
          vec3 col;
          col.r = texture2D(tColor, uv + cc * ca).r;
          col.g = src.g;
          col.b = texture2D(tColor, uv - cc * ca).b;
          float d = texture2D(tDepth, uv).r;

          // view ray + linear distance
          vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 vp = uInvProj * ndc; vp /= vp.w;
          float dist = length(vp.xyz);
          vec3 rd = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
          float sky = step(0.99999, d);
          if (sky > 0.5) dist = uFar;
          float dl = -vp.z;

          // ---- lake: the water material marks its pixels with alpha < 1 (alpha = its opacity)
          vec3 wp = uCamPos + rd * dist;
          if (src.a < 0.995 && uLake.w > 0.0 && sky < 0.5 && abs(wp.y - uLake.y) < 0.05 + dist * 0.0006) {
            vec3 n = waterNormal(wp.xz, 1.0);
            // flatten the normal with distance (pixel ripples average out), keep the wind patches
            n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(30.0, 220.0, dist) * 0.6));
            vec3 r = reflect(rd, n);
            r.y = max(r.y, 0.015);
            float F = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
            vec3 refl = probe(r);
            // screen-space march for the treeline, the cabin, the far shore
            float t = 0.6;
            float hitK = 0.0; vec3 hitC = vec3(0.0);
            for (int i = 0; i < 30; i++) {
              t = t * 1.17 + 0.25;
              vec3 q = wp + r * t;
              vec4 cp = uViewProj * vec4(q, 1.0);
              if (cp.w <= 0.0) break;
              vec2 suv = cp.xy / cp.w * 0.5 + 0.5;
              if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
              float sd = texture2D(tDepth, suv).r;
              float sdl = linDepth(sd, uNear, uFar);
              if (sd < 0.99999 && cp.w > sdl + 0.05 && cp.w - sdl < max(1.5, t * 0.35)) {
                float edge = smoothstep(1.0, 0.86, suv.y) * smoothstep(0.0, 0.06, suv.x) * smoothstep(1.0, 0.94, suv.x);
                hitK = edge; hitC = texture2D(tColor, suv).rgb;
                break;
              }
            }
            refl = mix(refl, hitC, hitK);
            // the cold dark lake: reflections dominate at grazing angles, the body colour looking down
            float k = min(F * 0.85, 0.72) * (1.0 - 0.35 * (1.0 - src.a) / 0.5);
            col = mix(col, refl, k);
          }

          // ---- atmosphere (god rays, mist, lamp halos)
          if (uVolOn > 0.5) {
            vec4 vol = volAt(uv, dl);
            col = col * vol.a + vol.rgb;
          }

          // Mie forward scatter: haze glows toward the sun, stronger with distance
          float mu = max(dot(rd, uSunDir), 0.0);
          float phase = pow(mu, 8.0) * 0.7 + pow(mu, 48.0) * 1.6;
          float haze = 1.0 - exp(-dist * 0.012);
          col += uSunCol * phase * haze * uMie * (1.0 - sky * 0.6);

          col += texture2D(tShaft, uv).rgb * uSunCol * uShafts;
          col += (texture2D(tBloom, uv).rgb * 0.5 + texture2D(tBloom2, uv).rgb * 0.7 + texture2D(tBloom3, uv).rgb * 0.9) * uBloom;
          col += vec3(1.0, 0.95, 0.85) * uFlash;

          col *= uExposure;
          // contrast in log space around mid grey (the shoulder handles the highlights)
          col = 0.18 * pow(max(col, vec3(1e-5)) / 0.18, vec3(uCon));
          col = filmic(col);
          // grade
          col = pow(max(col, 0.0), 1.0 / uGamma);
          col = col * uGain + uLift * (1.0 - col);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          // split toning: warm highlights / teal shadows by day, blue shadows at night (firelight stays orange)
          col += max(uWarm, 0.0) * vec3(0.055, 0.022, -0.04) * smoothstep(0.25, 0.85, l);
          col += (0.35 + max(-uWarm, 0.0) * 1.0) * vec3(-0.010, 0.003, 0.016) * (1.0 - smoothstep(0.0, 0.32, l));
          col = max(col, 0.0);
          l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, uSat);
          // cold: desaturate and push blue at the edges
          float r2 = dot(cc, cc);
          col = mix(col, mix(vec3(l), col, 0.6) * vec3(0.88, 0.95, 1.08), uCold * smoothstep(0.05, 0.4, r2));
          // damage: red vignette
          col = mix(col, col * vec3(1.0, 0.35, 0.3), uDamage * smoothstep(0.08, 0.45, r2));
          // vignette
          col *= 1.0 - uVig * smoothstep(0.12, 0.7, r2 * 1.3);
          col = toSRGB(clamp(col, 0.0, 1.0));
          // grain (per internal pixel, animated)
          float g = hash(px + floor(uTime * 24.0) * 17.0) - 0.5;
          col += g * uGrain * (1.2 - l);
          // ordered dither + quantise (PS2 banding, without ugly steps)
          col = floor(col * uQuant + 0.5 + (bayer4(px) - 0.5) * 0.9) / uQuant;
          col *= 1.0 - uFade;
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }`,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tShaft: { value: null }, tBloom: { value: null }, tBloom2: { value: null },
        tBloom3: { value: null }, tVol: { value: null }, tProbe: { value: null }, uVolOn: { value: 1 },
        uRes: { value: new THREE.Vector2() }, uTime: G.uTime, uFrame: { value: 0 }, uWindDir: G.uWindDir, uWind: G.uWindStrength,
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uViewProj: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
        uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() },
        uLightDir: G.uSunDir, uLightCol: G.uSunCol, uLake: G.uLake,
        uExposure: { value: 1 }, uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) },
        uGain: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uWarm: { value: 0 }, uCon: { value: 1 },
        uVig: { value: 0.3 }, uGrain: { value: 0.04 },
        uShafts: { value: 0.6 }, uBloom: { value: 0.5 }, uMie: { value: 0.6 }, uQuant: { value: 48 },
        uFlash: { value: 0 }, uDamage: { value: 0 }, uCold: { value: 0 }, uFade: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });
    this.mBlit = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }',
      uniforms: { tSrc: { value: null } },
      depthTest: false, depthWrite: false,
    });
    this.quad = fsQuad(this.mComp);
    this.scene.add(this.quad);
    this.resize();
  }

  /** screen-space effect knobs driven by the game (0..1 each) */
  fx = { flash: 0, damage: 0, cold: 0, fade: 0 };

  resize(): void {
    const c = this.gl.domElement;
    const W = Math.max(1, c.clientWidth || window.innerWidth), H = Math.max(1, c.clientHeight || window.innerHeight);
    this.gl.setSize(W, H, false);
    this.w = Math.max(64, Math.round(W / this.pixel));
    this.h = Math.max(64, Math.round(H / this.pixel));
    for (const t of [this.rt, this.ldr, this.volRT, this.qA, this.qB, this.eA, this.eB, this.sA, this.sB, this.shaftRT]) t?.dispose();
    const depth = new THREE.DepthTexture(this.w, this.h);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(this.w, this.h, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth, samples: 0,
    });
    this.ldr = new THREE.WebGLRenderTarget(this.w, this.h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const mk = (w: number, h: number, near = false) => new THREE.WebGLRenderTarget(Math.max(8, w), Math.max(8, h), {
      type: THREE.HalfFloatType, minFilter: near ? THREE.NearestFilter : THREE.LinearFilter, magFilter: near ? THREE.NearestFilter : THREE.LinearFilter, depthBuffer: false,
    });
    this.volRT = mk(this.w >> 1, this.h >> 1, true);
    this.qA = mk(this.w >> 2, this.h >> 2); this.qB = mk(this.w >> 2, this.h >> 2);
    this.eA = mk(this.w >> 3, this.h >> 3); this.eB = mk(this.w >> 3, this.h >> 3);
    this.sA = mk(this.w >> 4, this.h >> 4); this.sB = mk(this.w >> 4, this.h >> 4);
    this.shaftRT = mk(this.w >> 2, this.h >> 2);
  }

  get internalSize(): [number, number] { return [this.w, this.h]; }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.scene, this.cam);
  }

  private blur(src: THREE.WebGLRenderTarget, tmp: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget): void {
    this.mBlur.uniforms.tSrc.value = src.texture; this.mBlur.uniforms.uDir.value.set(1 / tmp.width, 0);
    this.pass(this.mBlur, tmp);
    this.mBlur.uniforms.tSrc.value = tmp.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / tmp.height);
    this.pass(this.mBlur, dst);
  }

  /** merge the interior boxes into at most four volumes (one per building) for the mist mask */
  private updateHoles(): void {
    const boxes = this.mistHoles ?? ((globalThis as unknown as { __game?: { interiors?: THREE.Box3[] } }).__game?.interiors ?? null);
    if (!boxes || boxes.length === this.holeCount) return;
    this.holeCount = boxes.length;
    const cl: THREE.Box3[] = [];
    const c = new THREE.Vector3(), cc = new THREE.Vector3();
    for (const b of boxes) {
      b.getCenter(c);
      let hit = cl.find((k) => k.getCenter(cc).distanceTo(c) < 30);
      if (!hit && cl.length < 4) { hit = b.clone(); cl.push(hit); continue; }
      (hit ?? cl[cl.length - 1]).union(b);
    }
    const u = this.mVol.uniforms;
    for (let i = 0; i < 4; i++) {
      if (cl[i]) { u.uHoleMin.value[i].copy(cl[i].min); u.uHoleMax.value[i].copy(cl[i].max); }
      else { u.uHoleMin.value[i].set(1e6, 1e6, 1e6); u.uHoleMax.value[i].set(-1e6, -1e6, -1e6); }
    }
  }

  /** the brightest point lights near the camera (lanterns, windows, fires) for the air halos */
  private pickLights(world: THREE.Scene, camera: THREE.PerspectiveCamera): number {
    if (this.frame >= this.lightScanAt) {
      this.lightScanAt = this.frame + 45;
      this.lights.length = 0;
      world.traverse((o) => { if ((o as THREE.PointLight).isPointLight) this.lights.push(o as THREE.PointLight); });
    }
    const cp = camera.position;
    this.lightPick.length = 0;
    for (const l of this.lights) {
      if (l.intensity < 0.05 || !l.visible || !l.parent) continue;
      let vis = true;
      for (let p: THREE.Object3D | null = l.parent; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis) continue;
      l.getWorldPosition(this.v3);
      const d = this.v3.distanceTo(cp);
      if (d > 90) continue;
      this.lightPick.push({ l, s: l.intensity / (1 + d * d * 0.02) });
    }
    this.lightPick.sort((a, b) => b.s - a.s);
    const n = Math.min(MAX_LIGHTS, this.lightPick.length);
    const u = this.mVol.uniforms;
    for (let i = 0; i < n; i++) {
      const l = this.lightPick[i].l;
      l.getWorldPosition(this.v3);
      const range = l.distance > 0 ? Math.min(l.distance, 14) : 10;
      (u.uL.value[i] as THREE.Vector4).set(this.v3.x, this.v3.y, this.v3.z, range);
      (u.uLC.value[i] as THREE.Vector4).set(l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity, 0);
      // screen position + view depth for the occlusion test
      this.v3b.copy(this.v3).applyMatrix4(camera.matrixWorldInverse);
      const vz = -this.v3b.z;
      this.v3b.copy(this.v3).project(camera);
      const on = vz > 0.1 && Math.abs(this.v3b.x) < 1 && Math.abs(this.v3b.y) < 1 ? 1 : 0;
      (u.uLS.value[i] as THREE.Vector4).set(this.v3b.x * 0.5 + 0.5, this.v3b.y * 0.5 + 0.5, vz, on);
    }
    return n;
  }

  render(world: THREE.Scene, camera: THREE.PerspectiveCamera, view?: THREE.Scene, viewCam?: THREE.Camera): void {
    const gl = this.gl;
    this.frame++;
    // newly added objects (places, props, creatures streaming in) get the matte shading model
    this.matte.watch(world); if (view) this.matte.watch(view);
    this.matte.flush(this.frame, Math.min(8, this.gl.capabilities.getMaxAnisotropy()));
    // sky probe first: the lake and wet ground read it this frame
    this.pass(this.mProbe, this.probe);
    G.uSkyProbe.value = this.probe.texture;

    gl.setRenderTarget(this.rt);
    gl.setClearColor(this.fogColor, 1);
    gl.clear(true, true, false);
    gl.render(world, camera);
    if (view && viewCam) {
      gl.clearDepth();
      gl.render(view, viewCam);
    }
    const g = this.grade;

    // sun on screen
    const sp = this.v3.copy(this.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const sunUv = this.sunUv.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const facing = camera.getWorldDirection(this.v3b).dot(this.sunDir);
    const vis = THREE.MathUtils.smoothstep(facing, 0.0, 0.5) * THREE.MathUtils.smoothstep(this.sunDir.y, -0.05, 0.08);

    // atmosphere
    const volOn = this.atmosphere;
    if (volOn) {
      const u = this.mVol.uniforms;
      u.tDepth.value = this.rt.depthTexture;
      u.uShadowOn.value = gl.shadowMap.enabled && G.uShadowMap.value ? 1 : 0;
      G.uShadowOn.value = u.uShadowOn.value;
      u.uMist.value = G.uMistMap.value ? G.uMist.value : 0;
      u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld);
      u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      u.uNear.value = camera.near; u.uFar.value = camera.far;
      (u.uAmb.value as THREE.Color).copy(G.uFogCol.value).lerp(G.uSkyHor.value, 0.4).multiplyScalar(0.9);
      u.uAir.value = g.air;
      u.uRes.value.set(this.volRT.width, this.volRT.height);
      u.uNL.value = this.pickLights(world, camera);
      if (this.frame % 60 === 1) this.updateHoles();
      // the low preset (3 px pixels) marches fewer steps
      u.uSteps.value = this.pixel >= 3 ? 10 : 22;
      this.pass(this.mVol, this.volRT);
    }

    // shafts
    if (g.shafts > 0 && vis > 0.001) {
      this.mMask.uniforms.tColor.value = this.rt.texture;
      this.mMask.uniforms.tDepth.value = this.rt.depthTexture;
      this.mMask.uniforms.uSunUv.value.copy(sunUv);
      this.mMask.uniforms.uSunVis.value = vis;
      this.pass(this.mMask, this.qA);
      this.mRadial.uniforms.uSunUv.value.copy(sunUv);
      this.mRadial.uniforms.tSrc.value = this.qA.texture; this.mRadial.uniforms.uStep.value = 1.0;
      this.pass(this.mRadial, this.qB);
      this.mRadial.uniforms.tSrc.value = this.qB.texture; this.mRadial.uniforms.uStep.value = 0.35;
      this.pass(this.mRadial, this.shaftRT);
    } else {
      gl.setRenderTarget(this.shaftRT); gl.setClearColor(0x000000, 1); gl.clear(true, false, false);
    }

    // bloom: threshold follows the exposure, so a lantern blooms the same at noon and at night
    this.mBright.uniforms.tSrc.value = this.rt.texture;
    this.mBright.uniforms.uThresh.value = 1.05 / Math.max(0.5, g.exposure);
    this.mBright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this.pass(this.mBright, this.qA);
    this.blur(this.qA, this.qB, this.qA);
    this.mBlur.uniforms.tSrc.value = this.qA.texture; this.mBlur.uniforms.uDir.value.set(1 / this.eA.width, 0);
    this.pass(this.mBlur, this.eB);
    this.mBlur.uniforms.tSrc.value = this.eB.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / this.eA.height);
    this.pass(this.mBlur, this.eA);
    this.mBlur.uniforms.tSrc.value = this.eA.texture; this.mBlur.uniforms.uDir.value.set(1 / this.sA.width, 0);
    this.pass(this.mBlur, this.sB);
    this.mBlur.uniforms.tSrc.value = this.sB.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / this.sA.height);
    this.pass(this.mBlur, this.sA);

    const u = this.mComp.uniforms;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
    u.tShaft.value = this.shaftRT.texture; u.tBloom.value = this.qA.texture; u.tBloom2.value = this.eA.texture; u.tBloom3.value = this.sA.texture;
    u.tVol.value = this.volRT.texture; u.uVolOn.value = volOn ? 1 : 0; u.tProbe.value = this.probe.texture;
    u.uRes.value.set(this.w, this.h); u.uFrame.value = this.frame % 1000;
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld);
    u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uSunDir.value.copy(this.sunDir); u.uSunCol.value.copy(this.sunColor); u.uFogCol.value.copy(this.fogColor);
    u.uExposure.value = g.exposure; u.uLift.value.copy(g.lift); u.uGamma.value.copy(g.gamma); u.uGain.value.copy(g.gain);
    u.uSat.value = g.saturation; u.uWarm.value = g.warm; u.uCon.value = g.contrast;
    u.uVig.value = g.vignette; u.uGrain.value = g.grain; u.uShafts.value = g.shafts * vis;
    u.uBloom.value = g.bloom; u.uMie.value = g.mie * THREE.MathUtils.smoothstep(this.sunDir.y, -0.1, 0.05) * (volOn ? 0.5 : 1); u.uQuant.value = g.quant;
    u.uFlash.value = this.fx.flash; u.uDamage.value = this.fx.damage; u.uCold.value = this.fx.cold; u.uFade.value = this.fx.fade;
    this.pass(this.mComp, this.ldr);
    this.mBlit.uniforms.tSrc.value = this.ldr.texture;
    this.pass(this.mBlit, null);
  }
}
