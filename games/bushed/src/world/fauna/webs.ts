// Spider webs, built thread by thread: orb webs strung between trunks, in the angle of a trunk and a low branch, under
// porch beams; dusty sheet webs in the corners of the cabin. Everything is 1-pixel line geometry (silk is far thinner
// than a pixel: what you see is coverage and the glints), lit by a hair-fibre highlight (Kajiya-Kay) from the sun or
// moon, the flashlight and the lamps, so a web is near invisible until the light catches it and the threads flare
// along arcs. Wind sways the middle while the anchors stay put; dew beads the capture spiral in the morning and after
// rain; a broken web collapses and leaves its mooring threads hanging.
//
//   orbWeb(spec)            -> WebMesh  (anchors: real surface points; the frame, radials, capture spiral, hub)
//   cornerWeb(spec)         -> WebMesh  (a dusty sheet in a corner: apex + three edge directions)
//   webMaterial(o)          one material per web (its own break / dust uniforms; the program is shared)
//   WEB_LIGHT / webLight()  the flashlight and dew, set once a frame by the fauna module
import * as THREE from 'three';
import { G } from '../../gfx/globals';

const TAU = Math.PI * 2;

/** frame-wide light and weather for every web (fauna/index.ts writes it each frame, indoors too) */
export const WEB_LIGHT = {
  uFlash: { value: 0 },
  uFlashPos: { value: new THREE.Vector3() },
  uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
  /** 0..1 dew on the outdoor webs (mornings, after rain) */
  uDew: { value: 0 },
  /** the drawing buffer's height in pixels (dew drops size themselves to it) */
  uScreenH: { value: 360 },
};

/** the flashlight (on, eye, beam direction) and the hour / wetness for dew */
export function webLight(on: boolean, pos: THREE.Vector3, dir: THREE.Vector3, hour: number, wet: number, screenH = 360): void {
  WEB_LIGHT.uScreenH.value = screenH;
  WEB_LIGHT.uFlash.value = on ? 1 : 0;
  WEB_LIGHT.uFlashPos.value.copy(pos);
  WEB_LIGHT.uFlashDir.value.copy(dir);
  const h = ((hour % 24) + 24) % 24;
  const morning = h > 4.3 && h < 10.5 ? Math.min(1, (h - 4.3) * 1.5) * Math.min(1, (10.5 - h) / 2.5) : 0;
  WEB_LIGHT.uDew.value = Math.max(morning, Math.min(1, wet * 1.2));
}

// ------------------------------------------------------------------------------------------------ rng
function mulberry(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------------------ geometry writer
/** line segments with per-vertex tangent (for the glint), sway weight (0 anchored .. 1 free), web normal */
class Lines {
  p: number[] = []; t: number[] = []; s: number[] = []; n: number[] = [];
  dew: number[] = []; dewS: number[] = []; dewN: number[] = [];
  constructor(readonly nrm: THREE.Vector3) {}
  seg(a: THREE.Vector3, b: THREE.Vector3, sa: number, sb: number): void {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z);
    this.t.push(dx / l, dy / l, dz / l, dx / l, dy / l, dz / l);
    this.s.push(sa, sb);
    const n = this.nrm;
    this.n.push(n.x, n.y, n.z, n.x, n.y, n.z);
  }
  /** a thread that sags between a and b (k segments, droop metres at the middle along `down`) */
  sag(a: THREE.Vector3, b: THREE.Vector3, sa: number, sb: number, droop: number, down: THREE.Vector3, k = 3): void {
    let prev = a, ps = sa;
    for (let i = 1; i <= k; i++) {
      const f = i / k;
      const q = i === k ? b : new THREE.Vector3().lerpVectors(a, b, f).addScaledVector(down, droop * 4 * f * (1 - f));
      const qs = sa + (sb - sa) * f + (i === k ? 0 : 0.15 * Math.sin(f * Math.PI));
      this.seg(prev, q, ps, qs);
      prev = q; ps = qs;
    }
  }
  bead(p: THREE.Vector3, s: number): void { this.dew.push(p.x, p.y, p.z); this.dewS.push(s); const n = this.nrm; this.dewN.push(n.x, n.y, n.z); }
  build(): { lines: THREE.BufferGeometry; dew: THREE.BufferGeometry | null } {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('aTan', new THREE.Float32BufferAttribute(this.t, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('aNrm', new THREE.Float32BufferAttribute(this.n, 3));
    g.computeBoundingSphere();
    let d: THREE.BufferGeometry | null = null;
    if (this.dew.length) {
      d = new THREE.BufferGeometry();
      d.setAttribute('position', new THREE.Float32BufferAttribute(this.dew, 3));
      d.setAttribute('aSway', new THREE.Float32BufferAttribute(this.dewS, 1));
      d.setAttribute('aNrm', new THREE.Float32BufferAttribute(this.dewN, 3));
      d.computeBoundingSphere();
    }
    return { lines: g, dew: d };
  }
}

// ------------------------------------------------------------------------------------------------ materials
const SWAY_GLSL = /* glsl */`
  uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform float uBreak; uniform float uSwayK;
  attribute float aSway; attribute vec3 aNrm;
  vec3 webSway(vec3 p) {
    float ph = dot(p, vec3(1.7, 0.9, 1.3));
    float w = (0.15 + uWind) * uSwayK;
    float gust = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 3.7 + ph * 2.1) * 0.25 + sin(uTime * 0.45 + ph * 0.3) * 0.5;
    vec3 d = aNrm * (gust * 0.028 * w * aSway);
    d += vec3(uWindDir.x, 0.0, uWindDir.y) * (0.012 * w * aSway * (0.6 + 0.4 * sin(uTime * 0.7 + ph)));
    // broken: the middle falls and balls up, the moorings stay
    d.y -= uBreak * uBreak * 0.55 * aSway;
    d *= 1.0;
    return p + d;
  }
`;

export interface WebMatOpts {
  /** 0 clean silk .. 1 a grey old cobweb furred with dust */
  dust?: number;
  /** indoors: no sun; a lamp (object-local position) instead */
  lamp?: THREE.Vector3 | null;
  lampCol?: THREE.Color;
  /** dew beads (outdoor webs) */
  dew?: boolean;
}

export interface WebMats { lines: THREE.LineBasicMaterial; dew: THREE.PointsMaterial | null; u: { uBreak: { value: number }; uFade: { value: number } } }

let dewTex: THREE.Texture | null = null;
function dewTexture(): THREE.Texture {
  if (dewTex) return dewTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  // a drop: a dark rim, a bright window highlight up-left, a caustic glow down-right
  const gr = g.createRadialGradient(8, 8, 0, 8, 8, 7.5);
  gr.addColorStop(0, 'rgba(235,242,248,1)'); gr.addColorStop(0.55, 'rgba(190,205,215,0.8)'); gr.addColorStop(0.85, 'rgba(60,70,80,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
  g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(5, 5, 3, 2); g.fillRect(6, 4, 1, 4);
  g.fillStyle = 'rgba(255,250,230,0.7)'; g.fillRect(9, 10, 2, 2);
  dewTex = new THREE.CanvasTexture(c);
  dewTex.colorSpace = THREE.SRGBColorSpace;
  return dewTex;
}

/** a web's materials (lines + dew). Programs are shared across webs; the uniforms are per web. */
export function webMaterial(o: WebMatOpts = {}): WebMats {
  const u = { uBreak: { value: 0 }, uFade: { value: 1 } };
  const indoor = !!o.lamp;
  const lamp = { value: (o.lamp ?? new THREE.Vector3()).clone() }, lampCol = { value: (o.lampCol ?? new THREE.Color(1.0, 0.72, 0.42)).clone() };
  const dust = { value: o.dust ?? 0 };
  const lines = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: false });
  lines.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTime: G.uTime, uWind: G.uWindStrength, uWindDir: G.uWindDir, uSunDir: G.uSunDir, uSunCol: G.uSunCol, uSkyHor: G.uSkyHor, uDark: G.uDarkness,
      uFlash: WEB_LIGHT.uFlash, uFlashPos: WEB_LIGHT.uFlashPos, uFlashDir: WEB_LIGHT.uFlashDir, uDew: WEB_LIGHT.uDew,
      uBreak: u.uBreak, uFade: u.uFade, uLamp: lamp, uLampCol: lampCol, uDust: dust, uSwayK: { value: indoor ? 0.12 : 1 },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${SWAY_GLSL}
        attribute vec3 aTan; varying vec3 vT; varying vec3 vW; varying float vS; uniform vec3 uLamp; varying vec3 vLampW;`)
      .replace('#include <begin_vertex>', `vec3 transformed = webSway(position);
        vT = normalize(mat3(modelMatrix) * aTan); vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vS = aSway;
        vLampW = (modelMatrix * vec4(uLamp, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyHor; uniform float uDark;
        uniform float uFlash; uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uDew;
        uniform float uBreak; uniform float uFade; uniform vec3 uLampCol; uniform float uDust;
        varying vec3 vT; varying vec3 vW; varying float vS; varying vec3 vLampW;
        // a hair fibre's highlight: bright when the half vector is square to the thread
        float kk(vec3 T, vec3 L, vec3 V, float e) { vec3 H = normalize(L + V); float c = dot(T, H); return pow(max(0.0, 1.0 - c * c), e); }
        vec3 spectral(float x) { return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0); }`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec3 V = normalize(cameraPosition - vW);
        vec3 T = normalize(vT);
        float dist = length(cameraPosition - vW);
        // silk is sub-pixel: what a pixel shows is its coverage
        float cover = clamp(0.6 / (0.5 + dist * 0.75), 0.0, 0.5);
        ${indoor ? `
        vec3 Ll = vLampW - vW; float ld = length(Ll); Ll /= max(ld, 1e-3);
        float g1 = kk(T, Ll, V, 40.0) * 1.6 / (1.0 + ld * ld * 0.35);
        vec3 key = uLampCol * g1;
        vec3 amb = vec3(0.34, 0.27, 0.2);` : `
        vec3 Ls = normalize(uSunDir);
        float sunUp = smoothstep(-0.08, 0.06, Ls.y);
        float g1 = kk(T, Ls, V, 140.0) * sunUp;
        vec3 key = uSunCol * g1 * 0.9 * (0.7 + 0.3 * spectral(fract(dot(T, normalize(Ls + V)) * 3.0 + vW.y * 2.0)));
        vec3 amb = uSkyHor * (0.55 - 0.35 * uDark);`}
        // the flashlight: a light at the eye, so the threads square to the view flare
        vec3 Lf = uFlashPos - vW; float fd = length(Lf); Lf /= max(fd, 1e-3);
        float cone = smoothstep(0.82, 0.97, dot(-Lf, normalize(uFlashDir)));
        float g2 = kk(T, Lf, V, 40.0) * uFlash * cone * 1.3 / (1.0 + fd * fd * 0.06);
        vec3 col = mix(vec3(0.86, 0.88, 0.9), vec3(0.62, 0.58, 0.52), uDust) * amb + key + vec3(1.0, 0.96, 0.86) * g2;
        float a = cover * mix(0.4, 0.8, uDust) * (1.0 + uDew * 1.2) + (g1 + g2) * mix(0.8, 0.35, uDust) * cover * 1.3;
        // broken: the free middle fades as it falls, the mooring threads stay
        a *= (1.0 - uBreak * smoothstep(0.05, 0.35, vS)) * uFade;
        vec4 diffuseColor = vec4(col, clamp(a, 0.0, 1.0));`);
  };
  lines.customProgramCacheKey = () => `bushed-web-${indoor ? 'in' : 'out'}`;
  let dewM: THREE.PointsMaterial | null = null;
  if (o.dew) {
    dewM = new THREE.PointsMaterial({ map: dewTexture(), transparent: true, depthWrite: false, size: 1, sizeAttenuation: false, fog: false });
    dewM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uTime: G.uTime, uWind: G.uWindStrength, uWindDir: G.uWindDir, uSunDir: G.uSunDir, uSunCol: G.uSunCol, uSkyHor: G.uSkyHor,
        uDew: WEB_LIGHT.uDew, uBreak: u.uBreak, uFade: u.uFade, uSwayK: { value: 1 },
        uFlash: WEB_LIGHT.uFlash, uFlashPos: WEB_LIGHT.uFlashPos, uFlashDir: WEB_LIGHT.uFlashDir, uScreenH: WEB_LIGHT.uScreenH,
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          ${SWAY_GLSL}
          uniform float uDew; uniform vec3 uSunDir; uniform float uFlash; uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform float uScreenH;
          varying float vSp; varying float vA;`)
        .replace('#include <begin_vertex>', 'vec3 transformed = webSway(position);')
        .replace('gl_PointSize = size;', `
          vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          float d = length(cameraPosition - wp);
          // a 2 mm drop: its true size in pixels, at least one pixel, the rest is coverage
          float px = 0.006 * projectionMatrix[1][1] * 0.5 * uScreenH / max(d, 0.05);
          gl_PointSize = max(1.0, px);
          vA = uDew * clamp(px * 1.2, 0.0, 1.0) * (1.0 - uBreak);
          // drops are lenses: they sparkle when the light is behind you or behind them
          vec3 V = normalize(cameraPosition - wp);
          float h = fract(sin(dot(wp, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          float sun = max(0.0, abs(dot(V, normalize(uSunDir)))) ;
          float fl = uFlash * smoothstep(0.85, 0.98, dot(-normalize(uFlashPos - wp), normalize(uFlashDir))) / (1.0 + d * d * 0.05);
          vSp = (pow(sun, 6.0) * 1.5 + fl * 2.0) * (0.4 + 0.6 * step(0.55, h)) * (0.7 + 0.3 * sin(uTime * (2.0 + h * 5.0) + h * 30.0));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uSunCol; uniform vec3 uSkyHor; uniform float uFade; varying float vSp; varying float vA;`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4(uSkyHor * 1.25 + vec3(0.12) + uSunCol * vSp + vec3(vSp * 0.3), vA * uFade);`);
    };
    dewM.customProgramCacheKey = () => 'bushed-web-dew';
  }
  return { lines, dew: dewM, u };
}

/** a web's renderable: lines (+ dew), its hub and radius, the materials' per-web uniforms */
export interface WebMesh { object: THREE.Group; hub: THREE.Vector3; normal: THREE.Vector3; radius: number; mats: WebMats; dispose(): void }

function assemble(L: Lines, mats: WebMats, hub: THREE.Vector3, normal: THREE.Vector3, radius: number): WebMesh {
  const { lines, dew } = L.build();
  const object = new THREE.Group();
  object.name = 'web';
  const ls = new THREE.LineSegments(lines, mats.lines);
  ls.frustumCulled = true; ls.renderOrder = 3; ls.castShadow = false; ls.receiveShadow = false;
  ls.userData.noRay = true; ls.raycast = () => {};
  object.add(ls);
  if (dew && mats.dew) {
    const pts = new THREE.Points(dew, mats.dew);
    pts.renderOrder = 4; pts.raycast = () => {};
    object.add(pts);
  }
  return {
    object, hub, normal, radius, mats,
    dispose() { object.removeFromParent(); lines.dispose(); dew?.dispose(); mats.lines.dispose(); mats.dew?.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ orb webs
export interface OrbSpec {
  /** the hub (where the spider sits) */
  hub: THREE.Vector3;
  /** the web's plane normal */
  normal: THREE.Vector3;
  /** attachment points on real surfaces (bark, a branch, a beam), at least one above and one below the hub */
  anchors: THREE.Vector3[];
  seed: number;
  /** largest frame radius (m) */
  maxR?: number;
  /** capture spiral spacing (m) */
  spacing?: number;
  /** 0 fresh .. 1 tattered */
  damage?: number;
  mats?: WebMats;
}

/**
 * An orb web: mooring threads from each anchor to a corner of the frame, frame threads between the corners, radials
 * from the hub to the frame, the hub's own little mesh, a free zone, then the sticky capture spiral (beaded with dew),
 * spacing following each radial's length so the web is denser where the frame is close (below the hub, usually).
 */
export function orbWeb(spec: OrbSpec): WebMesh {
  const rnd = mulberry(spec.seed);
  const n = spec.normal.clone().normalize();
  const hub = spec.hub.clone();
  // the plane's own up (gravity in the plane) and right
  const v = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y);
  if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
  v.normalize();
  const u = new THREE.Vector3().crossVectors(v, n).normalize();
  const down = v.clone().negate();
  const L = new Lines(n);
  const maxR = spec.maxR ?? 0.42;
  const P = (x: number, y: number, belly = 0) => hub.clone().addScaledVector(u, x).addScaledVector(v, y).addScaledVector(n, belly);
  // anchors in plane coordinates, round the hub
  const an = spec.anchors.map((A) => { const d = A.clone().sub(hub); return { A, x: d.dot(u), y: d.dot(v), a: Math.atan2(d.dot(v), d.dot(u)) }; });
  an.sort((a, b) => a.a - b.a);
  // frame corners: pulled in toward the hub, no further out than maxR
  const F = an.map((q) => {
    const l = Math.hypot(q.x, q.y) || 1, k = Math.min(0.82 + rnd() * 0.08, (maxR * (0.85 + rnd() * 0.3)) / l);
    return { x: q.x * k, y: q.y * k, A: q.A };
  });
  const belly = 0.004 + rnd() * 0.014;
  const bellyAt = (f: number) => belly * (1 - f * f);
  // moorings: one or two threads from each corner to the surface (a Y where the spider walked it twice)
  for (const c of F) {
    const C = P(c.x, c.y);
    L.sag(C, c.A, 0.08, 0, 0.004 + c.A.distanceTo(C) * 0.02, down, 3);
    if (rnd() < 0.6) {
      const off = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.12);
      L.sag(C.clone().lerp(c.A, 0.25), c.A.clone().add(off.projectOnPlane(n)), 0.06, 0, 0.003, down, 2);
    }
  }
  // frame threads between the corners
  for (let i = 0; i < F.length; i++) {
    const a = F[i], b = F[(i + 1) % F.length];
    L.sag(P(a.x, a.y), P(b.x, b.y), 0.08, 0.08, 0.006 + Math.hypot(a.x - b.x, a.y - b.y) * 0.015, down, 4);
  }
  // radials: hub -> the frame polygon
  const N = 22 + Math.floor(rnd() * 10);
  const dirs: { x: number; y: number; l: number }[] = [];
  for (let k = 0; k < N; k++) {
    const t = (k / N) * TAU + (rnd() - 0.5) * (TAU / N) * 0.35;
    const dx = Math.cos(t), dy = Math.sin(t);
    let best = maxR * 1.4;
    for (let i = 0; i < F.length; i++) {
      const a = F[i], b = F[(i + 1) % F.length];
      const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-6) continue;
      const s = (a.x * ey - a.y * ex) / den, w = (a.x * dy - a.y * dx) / den;
      if (s > 0.02 && w >= -0.001 && w <= 1.001) best = Math.min(best, s);
    }
    dirs.push({ x: dx, y: dy, l: best });
  }
  const R = dirs.reduce((m, d) => Math.max(m, d.l), 0);
  // the capture spiral is near round round the hub and only takes the frame's shape toward the edge
  const R0 = Math.min(...dirs.map((d) => d.l)) * 0.98;
  const ringR = (d: { l: number }, f: number) => f * (R0 + (d.l - R0) * THREE.MathUtils.smoothstep(f, 0.3, 0.95));
  for (const d of dirs) {
    // a radial in four pieces so it can belly and sway
    let prev = hub.clone(), ps = 1;
    for (let j = 1; j <= 4; j++) {
      const f = j / 4, q = P(d.x * d.l * f, d.y * d.l * f, bellyAt(f));
      const qs = 1 - f * f * 0.92;
      L.seg(prev, q, ps, qs);
      prev = q; ps = qs;
    }
  }
  // the hub: a few tight irregular loops
  for (const hr of [0.012, 0.02, 0.03, 0.042]) {
    let prev: THREE.Vector3 | null = null, first: THREE.Vector3 | null = null;
    for (const d of dirs) {
      const r = Math.min(hr * (0.85 + rnd() * 0.3), d.l * 0.3);
      const q = P(d.x * r, d.y * r, belly);
      if (prev) L.seg(prev, q, 1, 1); else first = q;
      prev = q;
    }
    if (prev && first) L.seg(prev, first, 1, 1);
  }
  // the capture spiral: from the outside in, with the free zone left open
  const sp = spec.spacing ?? 0.016;
  const fo = 0.9, fi = 0.2 + rnd() * 0.08;
  const meanL = dirs.reduce((s, d) => s + d.l, 0) / N;
  const turns = Math.max(6, Math.round(((fo - fi) * meanL) / sp));
  const dmg = spec.damage ?? rnd() * 0.15;
  let prev: THREE.Vector3 | null = null, pf = 0, holeLeft = 0;
  for (let m = 0; m <= turns * N; m++) {
    const d = dirs[m % N];
    const f = fo - (fo - fi) * (m / (turns * N)) + (rnd() - 0.5) * 0.012;
    const rr = ringR(d, f);
    const q = P(d.x * rr, d.y * rr, bellyAt(f));
    if (prev) {
      if (holeLeft > 0) holeLeft--;
      else if (rnd() < dmg * 0.04) holeLeft = 2 + Math.floor(rnd() * 8);
      else {
        // sticky thread sags a hair between radials
        const seg = prev.distanceTo(q);
        L.sag(prev, q, 1 - pf * pf, 1 - f * f, seg * 0.05, down, 2);
        if ((m & 1) === 0 && rnd() < 0.85) L.bead(new THREE.Vector3().lerpVectors(prev, q, 0.5).addScaledVector(down, seg * 0.035), 1 - f * f);
        if (rnd() < 0.18) L.bead(q, 1 - f * f);
      }
    }
    prev = q; pf = f;
  }
  // a few broken threads hanging off an old web
  for (let k = 0; k < Math.floor(dmg * 6); k++) {
    const d = dirs[Math.floor(rnd() * N)], f = fi + rnd() * (fo - fi), rr = ringR(d, f);
    const a = P(d.x * rr, d.y * rr, bellyAt(f));
    L.sag(a, a.clone().addScaledVector(down, 0.04 + rnd() * 0.12).addScaledVector(u, (rnd() - 0.5) * 0.05), 1, 1, 0.01, n, 3);
  }
  return assemble(L, spec.mats ?? webMaterial({ dew: true }), hub, n, R);
}

// ------------------------------------------------------------------------------------------------ corner webs
export interface CornerSpec {
  /** the corner point */
  apex: THREE.Vector3;
  /** unit directions along the corner's three edges (wall-ceiling, other wall-ceiling, down the corner) */
  e1: THREE.Vector3; e2: THREE.Vector3; e3: THREE.Vector3;
  /** reach along the edges (m) */
  size: number;
  seed: number;
  mats?: WebMats;
}

/**
 * An old sheet web in a corner: threads fanned from near the apex to points along the three edges, cross threads
 * hanging in catenaries between them (heavier, dust-furred, sagging toward the room), a few loose strands.
 */
export function cornerWeb(spec: CornerSpec): WebMesh {
  const rnd = mulberry(spec.seed);
  const { apex, e1, e2, e3, size } = spec;
  const into = e1.clone().add(e2).add(e3).normalize();
  const L = new Lines(into);
  const down = new THREE.Vector3(0, -1, 0);
  // anchor points along the edges (more along the top two)
  const pts: { p: THREE.Vector3; t: number }[] = [];
  const along = (e: THREE.Vector3, n: number, k: number) => { for (let i = 0; i < n; i++) { const f = (0.25 + 0.75 * (i + rnd() * 0.6) / n) * size * k; pts.push({ p: apex.clone().addScaledVector(e, f), t: f / size }); } };
  along(e1, 4, 1); along(e2, 4, 1); along(e3, 3, 0.8);
  // fan threads from just off the apex
  const hubs = [apex.clone().addScaledVector(into, 0.02), apex.clone().addScaledVector(into, 0.05 + rnd() * 0.04)];
  for (const q of pts) {
    const h = hubs[rnd() < 0.5 ? 0 : 1];
    L.sag(h, q.p, 0.3, 0, 0.01 + q.t * 0.03, down, 3);
  }
  // cross threads: catenaries between random pairs of fan threads, heavier further out (the dust weighs them)
  const ring: THREE.Vector3[] = [];
  for (let k = 0; k < 26; k++) {
    const a = pts[Math.floor(rnd() * pts.length)], b = pts[Math.floor(rnd() * pts.length)];
    if (a === b) continue;
    const fa = 0.25 + rnd() * 0.7, fb = Math.min(1, fa + (rnd() - 0.5) * 0.3);
    const A = hubs[0].clone().lerp(a.p, fa), B = hubs[0].clone().lerp(b.p, fb);
    const l = A.distanceTo(B);
    L.sag(A, B, 0.5, 0.5, l * (0.08 + rnd() * 0.18), down, 4);
    ring.push(A);
  }
  // loose strands with a lump of dust at the end
  for (let k = 0; k < 4; k++) {
    const A = ring[Math.floor(rnd() * ring.length)] ?? apex;
    const B = A.clone().addScaledVector(down, 0.06 + rnd() * 0.18).addScaledVector(into, (rnd() - 0.5) * 0.04);
    L.sag(A, B, 0.6, 1, 0.005, into, 3);
  }
  return assemble(L, spec.mats ?? webMaterial({ dust: 0.8 }), apex.clone(), into, size);
}
