// The renderer: world + viewmodel drawn into a low internal-resolution HDR target, then a post chain:
//   1. shafts: sky/sun mask at quarter res, radial blur toward the sun (light through the canopy)
//   2. bloom: bright-pass at quarter res, separable blur at 1/4 and 1/8
//   3. composite to the screen: sun-tinted aerial perspective (Mie glow), shafts, bloom, filmic tone map,
//      grade (lift/gamma/gain, saturation), vignette, ordered dither + quantise, film grain.
// Every pass snaps to the internal pixel grid so the picture reads as crisp, high-resolution pixel art.
import * as THREE from 'three';
import { G } from './globals';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export interface Grade {
  exposure: number; lift: THREE.Vector3; gamma: THREE.Vector3; gain: THREE.Vector3; saturation: number;
  vignette: number; grain: number; shafts: number; bloom: number; mie: number; quant: number;
}

export function defaultGrade(): Grade {
  return {
    exposure: 1.0,
    lift: new THREE.Vector3(0.0, 0.004, 0.012),
    gamma: new THREE.Vector3(1.0, 1.0, 1.0),
    gain: new THREE.Vector3(1.0, 1.0, 1.0),
    saturation: 0.92, vignette: 0.35, grain: 0.045, shafts: 0.6, bloom: 0.5, mie: 0.6, quant: 48,
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

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  /** screen pixels per internal pixel (2 = half resolution) */
  pixel = 2;
  grade = defaultGrade();
  /** sun direction (world, towards the sun) and colour for shafts / Mie */
  sunDir = new THREE.Vector3(0.3, 0.6, 0.2).normalize();
  sunColor = new THREE.Color(1, 0.9, 0.7);
  fogColor = new THREE.Color(0.5, 0.55, 0.6);

  private rt!: THREE.WebGLRenderTarget;
  private qA!: THREE.WebGLRenderTarget;
  private qB!: THREE.WebGLRenderTarget;
  private eA!: THREE.WebGLRenderTarget;
  private eB!: THREE.WebGLRenderTarget;
  private shaftRT!: THREE.WebGLRenderTarget;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private quad: THREE.Mesh;
  private mMask: THREE.ShaderMaterial;
  private mRadial: THREE.ShaderMaterial;
  private mBright: THREE.ShaderMaterial;
  private mBlur: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial;
  private w = 1; private h = 1;
  private frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.gl.setPixelRatio(1);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.autoClear = false;

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
          gl_FragColor = vec4(vec3(sky * min(l, 4.0) * (0.25 + near) * uSunVis), 1.0);
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
        uniform sampler2D tSrc; uniform float uThresh; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(uThresh, uThresh * 2.5, l), 1.0);
        }`,
      uniforms: { tSrc: { value: null }, uThresh: { value: 1.2 } },
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
        uniform vec2 uRes; uniform float uTime; uniform float uFrame;
        uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform float uNear; uniform float uFar;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uFogCol;
        uniform float uExposure; uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain; uniform float uSat;
        uniform float uVig; uniform float uGrain; uniform float uShafts; uniform float uBloom; uniform float uMie; uniform float uQuant;
        uniform float uFlash; uniform float uDamage; uniform float uCold; uniform float uFade;
        varying vec2 vUv;

        float bayer4(vec2 p) {
          vec2 q = mod(p, 4.0);
          int i = int(q.x) + int(q.y) * 4;
          float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          return m[i] / 16.0 - 0.5;
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.618) * 43758.5453); }
        vec3 filmic(vec3 x) {
          // ACES (Narkowicz) with a gentle shoulder
          x *= 0.9;
          return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

        void main() {
          vec2 px = floor(vUv * uRes) + 0.5;
          vec2 uv = px / uRes;
          // subtle chromatic fringing toward the edges
          vec2 cc = uv - 0.5;
          float ca = dot(cc, cc) * 0.0035;
          vec3 col;
          col.r = texture2D(tColor, uv + cc * ca).r;
          col.g = texture2D(tColor, uv).g;
          col.b = texture2D(tColor, uv - cc * ca).b;
          float d = texture2D(tDepth, uv).r;

          // view ray + linear distance
          vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 vp = uInvProj * ndc; vp /= vp.w;
          float dist = length(vp.xyz);
          vec3 rd = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
          float sky = step(0.99999, d);
          if (sky > 0.5) dist = uFar;

          // Mie forward scatter: haze glows toward the sun, stronger with distance
          float mu = max(dot(rd, uSunDir), 0.0);
          float phase = pow(mu, 8.0) * 0.7 + pow(mu, 48.0) * 1.6;
          float haze = 1.0 - exp(-dist * 0.012);
          col += uSunCol * phase * haze * uMie * (1.0 - sky * 0.6);

          col += texture2D(tShaft, uv).rgb * uSunCol * uShafts;
          col += (texture2D(tBloom, uv).rgb * 0.6 + texture2D(tBloom2, uv).rgb * 0.8) * uBloom;
          col += vec3(1.0, 0.95, 0.85) * uFlash;

          col *= uExposure;
          col = filmic(col);
          // grade
          col = pow(max(col, 0.0), 1.0 / uGamma);
          col = col * uGain + uLift * (1.0 - col);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
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
          col = floor(col * uQuant + 0.5 + bayer4(px) * 0.9) / uQuant;
          col *= 1.0 - uFade;
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }`,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tShaft: { value: null }, tBloom: { value: null }, tBloom2: { value: null },
        uRes: { value: new THREE.Vector2() }, uTime: G.uTime, uFrame: { value: 0 },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
        uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() },
        uExposure: { value: 1 }, uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) },
        uGain: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uVig: { value: 0.3 }, uGrain: { value: 0.04 },
        uShafts: { value: 0.6 }, uBloom: { value: 0.5 }, uMie: { value: 0.6 }, uQuant: { value: 48 },
        uFlash: { value: 0 }, uDamage: { value: 0 }, uCold: { value: 0 }, uFade: { value: 0 },
      },
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
    this.rt?.dispose(); this.qA?.dispose(); this.qB?.dispose(); this.eA?.dispose(); this.eB?.dispose(); this.shaftRT?.dispose();
    const depth = new THREE.DepthTexture(this.w, this.h);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(this.w, this.h, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth, samples: 0,
    });
    const mk = (w: number, h: number) => new THREE.WebGLRenderTarget(Math.max(8, w), Math.max(8, h), {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
    });
    this.qA = mk(this.w >> 2, this.h >> 2); this.qB = mk(this.w >> 2, this.h >> 2);
    this.eA = mk(this.w >> 3, this.h >> 3); this.eB = mk(this.w >> 3, this.h >> 3);
    this.shaftRT = mk(this.w >> 2, this.h >> 2);
  }

  get internalSize(): [number, number] { return [this.w, this.h]; }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.scene, this.cam);
  }

  render(world: THREE.Scene, camera: THREE.PerspectiveCamera, view?: THREE.Scene, viewCam?: THREE.Camera): void {
    const gl = this.gl;
    this.frame++;
    gl.setRenderTarget(this.rt);
    gl.setClearColor(this.fogColor, 1);
    gl.clear(true, true, false);
    gl.render(world, camera);
    if (view && viewCam) {
      gl.clearDepth();
      gl.render(view, viewCam);
    }

    // sun on screen
    const sp = this.sunDir.clone().multiplyScalar(1000).add(camera.position).project(camera);
    const sunUv = new THREE.Vector2(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const facing = camera.getWorldDirection(new THREE.Vector3()).dot(this.sunDir);
    const vis = THREE.MathUtils.smoothstep(facing, 0.0, 0.5) * THREE.MathUtils.smoothstep(this.sunDir.y, -0.05, 0.08);

    // shafts
    if (this.grade.shafts > 0 && vis > 0.001) {
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

    // bloom
    this.mBright.uniforms.tSrc.value = this.rt.texture;
    this.pass(this.mBright, this.qA);
    this.mBlur.uniforms.tSrc.value = this.qA.texture; this.mBlur.uniforms.uDir.value.set(1 / this.qA.width, 0);
    this.pass(this.mBlur, this.qB);
    this.mBlur.uniforms.tSrc.value = this.qB.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / this.qA.height);
    this.pass(this.mBlur, this.qA);
    this.mBlur.uniforms.tSrc.value = this.qA.texture; this.mBlur.uniforms.uDir.value.set(1 / this.eA.width, 0);
    this.pass(this.mBlur, this.eA);
    this.mBlur.uniforms.tSrc.value = this.eA.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / this.eA.height);
    this.pass(this.mBlur, this.eB);

    const u = this.mComp.uniforms, g = this.grade;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
    u.tShaft.value = this.shaftRT.texture; u.tBloom.value = this.qA.texture; u.tBloom2.value = this.eB.texture;
    u.uRes.value.set(this.w, this.h); u.uFrame.value = this.frame % 1000;
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uSunDir.value.copy(this.sunDir); u.uSunCol.value.copy(this.sunColor); u.uFogCol.value.copy(this.fogColor);
    u.uExposure.value = g.exposure; u.uLift.value.copy(g.lift); u.uGamma.value.copy(g.gamma); u.uGain.value.copy(g.gain);
    u.uSat.value = g.saturation; u.uVig.value = g.vignette; u.uGrain.value = g.grain; u.uShafts.value = g.shafts * vis;
    u.uBloom.value = g.bloom; u.uMie.value = g.mie * THREE.MathUtils.smoothstep(this.sunDir.y, -0.1, 0.05); u.uQuant.value = g.quant;
    u.uFlash.value = this.fx.flash; u.uDamage.value = this.fx.damage; u.uCold.value = this.fx.cold; u.uFade.value = this.fx.fade;
    this.pass(this.mComp, null);
  }
}
