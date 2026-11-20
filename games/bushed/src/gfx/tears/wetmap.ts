// The wet film a tear leaves on the skin, and the skin shader that shows it (and the melt).
//
// The film is painted into a small texture laid over the face in three planar charts by bind-pose (mesh-local)
// position inside a box round the face: the front (x, y), the left side and the right side (z, y), a fragment picking
// its chart by its bind normal, so the film stays on the skin wherever the skin moves. Any skinned mesh whose material
// is a MeshStandardMaterial (or one with its chunks) can take it. Each texel keeps the time it was last wetted (16 bits, 1/16 s)
// and how wet (8 bits); the shader dries it from that, so nothing is decayed on the CPU: a fresh film is dark and
// glossy (a sharp highlight runs along it), the gloss goes first, then the darkening.
//
// The same patch slumps the body when it melts (a vertex function after skinning: everything falls by a share of its
// height above the ground, the overhanging parts first, in runs, and what falls spreads out over the ground) and wets
// all of it. The body's centre, radius and ground are uniforms (mesh-local), so it fits any body.
//
//   const wet = new WetMap(box);  patchSkin(mat, depth, wet.uniforms);  wet.paint(restP, restN, r, amount, now);  wet.flush();
import * as THREE from 'three';

const CW = 128, CHH = 120, TW = CW * 3;
const MAXR = 160;
/** the melt's body: centre (x, z), radius, ground height, all mesh-local */
export interface MeltShape { x: number; z: number; r: number; ground: number }

export interface WetUniforms {
  uTearWet: { value: THREE.DataTexture };
  /** now, in 1/16 s ticks mod 65536 */
  uTearNow: { value: number };
  /** seconds a fresh film takes to dry */
  uTearDry: { value: number };
  /** 0 solid .. 1 melted flat */
  uMelt: { value: number };
  /** the box the charts cover (bind pose, mesh-local): its low corner and its size */
  uTearBox0: { value: THREE.Vector3 }; uTearBoxS: { value: THREE.Vector3 };
  /** the melt's body: centre x, centre z, radius, ground */
  uMeltC: { value: THREE.Vector4 };
}

export class WetMap {
  readonly data = new Uint8Array(TW * CHH * 4);
  readonly tex: THREE.DataTexture;
  readonly uniforms: WetUniforms;
  private ranges: { start: number; count: number }[] = [];
  private nr = 0; private full = 2; private dirty = false; private sweepT = 0;
  private b0: THREE.Vector3; private bs: THREE.Vector3;
  constructor(box: THREE.Box3, melt: MeltShape, dry = 34) {
    this.b0 = box.min.clone(); this.bs = box.getSize(new THREE.Vector3());
    this.tex = new THREE.DataTexture(this.data, TW, CHH, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace; this.tex.needsUpdate = true;
    for (let i = 0; i < MAXR; i++) this.ranges.push({ start: 0, count: 0 });
    this.uniforms = { uTearWet: { value: this.tex }, uTearNow: { value: 0 }, uTearDry: { value: dry }, uMelt: { value: 0 },
      uTearBox0: { value: this.b0 }, uTearBoxS: { value: this.bs }, uMeltC: { value: new THREE.Vector4(melt.x, melt.z, melt.r, melt.ground) } };
  }
  private tick(now: number) { return Math.floor(now * 16) & 0xffff; }
  /** how wet a texel is now (0..1), as the shader sees it */
  private wetAt(o: number, nowT: number) {
    const b = this.data[o + 2]; if (!b) return 0;
    const age = ((nowT - ((this.data[o] << 8) | this.data[o + 1]) + 65536) & 0xffff) / 16;
    return (b / 255) * (1 - smooth(this.uniforms.uTearDry.value * 0.2, this.uniforms.uTearDry.value, age));
  }
  /** wet a spot of skin: bind-pose position and normal (mesh-local), radius (m), wetness 0..1 */
  paint(p: THREE.Vector3, n: THREE.Vector3, r: number, amount: number, now: number) {
    const b0 = this.b0, bs = this.bs;
    const u = (p.x - b0.x) / bs.x, v = (p.y - b0.y) / bs.y, w = (p.z - b0.z) / bs.z;
    if (u < 0 || u > 1 || v < 0 || v > 1 || w < 0 || w > 1) return;
    const ax = Math.abs(n.x), az = Math.abs(n.z);
    // the chart the shader will pick, and the neighbouring one too near the seam between them
    if (ax > az || ax > az * 0.7) this.disc(n.x > 0 ? 1 : 2, w * CW, v * CHH, (r / bs.z) * CW, amount, now);
    if (az >= ax || az > ax * 0.7) this.disc(0, u * CW, v * CHH, (r / bs.x) * CW, amount, now);
  }
  private disc(chart: number, u: number, v: number, rt: number, amount: number, now: number) {
    const nowT = this.tick(now), rr = Math.max(0.75, rt), a8 = Math.round(Math.min(1, amount) * 255);
    const y0 = Math.max(0, Math.floor(v - rr)), y1 = Math.min(CHH - 1, Math.floor(v + rr));
    const x0 = Math.max(0, Math.floor(u - rr)), x1 = Math.min(CW - 1, Math.floor(u + rr));
    for (let y = y0; y <= y1; y++) {
      let lo = -1, hi = -1;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - u, dy = y + 0.5 - v;
        if (dx * dx + dy * dy > rr * rr) continue;
        const o = (y * TW + chart * CW + x) * 4;
        const w = Math.max(this.wetAt(o, nowT) * 255, a8);
        this.data[o] = nowT >> 8; this.data[o + 1] = nowT & 255; this.data[o + 2] = Math.min(255, Math.round(w)); this.data[o + 3] = 255;
        if (lo < 0) lo = x; hi = x;
      }
      if (lo < 0) continue;
      this.dirty = true;
      if (this.nr < MAXR) { const R = this.ranges[this.nr++]; R.start = (y * TW + chart * CW + lo) * 4; R.count = (hi - lo + 1) * 4; }
      else this.full = Math.max(this.full, 1);
    }
  }
  /** once per frame: the clock, and the texels painted since the last flush up to the GPU */
  flush(now: number, dt: number) {
    this.uniforms.uTearNow.value = this.tick(now);
    // now and then clear the films that have long dried (so the 68-minute clock wrapping round never wakes them)
    this.sweepT += dt;
    if (this.sweepT > 20) {
      this.sweepT = 0;
      const nowT = this.tick(now), dry = this.uniforms.uTearDry.value, D = this.data;
      for (let o = 0; o < D.length; o += 4) if (D[o + 2] && ((nowT - ((D[o] << 8) | D[o + 1]) + 65536) & 0xffff) / 16 > dry * 1.2) { D[o + 2] = 0; this.full = 1; }
    }
    if (this.full > 0) { this.tex.clearUpdateRanges(); this.tex.needsUpdate = true; this.full--; this.nr = 0; this.dirty = false; return; }
    if (!this.dirty) return;
    const U = this.tex.updateRanges; U.length = 0;
    for (let i = 0; i < this.nr; i++) U.push(this.ranges[i]);
    this.tex.needsUpdate = true; this.nr = 0; this.dirty = false;
  }
  /** dry everything at once (a fresh start) */
  clear() { this.data.fill(0); this.full = 1; }
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ the skin shader
const COMMON_V = /* glsl */ `
varying vec3 vTearP; varying vec3 vTearN;
uniform float uMelt; uniform vec4 uMeltC;
// the melt: everything falls by a share of its height above the ground (the overhanging parts first, in runs), and
// what falls spreads out over the ground; mesh-local, the body round (uMeltC.x, uMeltC.y), radius uMeltC.z, ground
// at y = uMeltC.w
vec3 tearMelt(vec3 p, vec3 r) {
  vec2 c = uMeltC.xy, d = p.xz - c;
  float G0 = uMeltC.w, S = uMeltC.z / 0.42;
  p.y -= G0;
  float n = 0.5 + 0.5 * sin(r.x * 31.0 / S + sin(r.z * 23.0 / S) * 1.7 + r.y * 13.0 / S);
  float lag = clamp(length(r.xz - c) / uMeltC.z, 0.0, 1.0);
  float delay = 0.32 * (1.0 - lag) * (0.45 + 0.55 * n);
  float mm = clamp((uMelt - delay) / (1.0 - delay), 0.0, 1.0);
  float e = mm * mm * (3.0 - 2.0 * mm);
  float ang = atan(d.y, d.x);
  float run = pow(max(0.0, sin(ang * 7.0 + r.y * 11.0 / S + sin(r.x * 37.0 / S) * 1.5)), 5.0);
  float h = max(p.y, 0.0);
  float fall = h * clamp(e * 0.955 + run * e * (1.0 - e) * 0.9, 0.0, 0.985);
  float y = h - fall;
  float spread = 1.0 + e * (0.25 + 1.05 * (1.0 - smoothstep(0.0, 0.16 * S, y))) * (0.8 + 0.4 * n);
  p.xz = c + d * spread;
  p.y = y + min(p.y, 0.0) + 0.002 * e + G0;
  return p;
}`;
const COMMON_F = /* glsl */ `
varying vec3 vTearP; varying vec3 vTearN;
uniform sampler2D uTearWet; uniform float uTearNow; uniform float uTearDry; uniform float uMelt; uniform vec4 uMeltC; uniform vec3 uTearBox0; uniform vec3 uTearBoxS;
// the film here: x = darkening (0..1), y = gloss (0..1)
vec2 tearFilm() {
  vec3 q = (vTearP - uTearBox0) / uTearBoxS, n = normalize(vTearN);
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z < 0.0 || q.z > 1.0) return vec2(0.0);
  vec2 uv = abs(n.x) > abs(n.z) ? vec2((q.z + (n.x > 0.0 ? 1.0 : 2.0)) / 3.0, q.y) : vec2(q.x / 3.0, q.y);
  vec4 t = texture2D(uTearWet, uv);
  if (t.b <= 0.0) return vec2(0.0);
  float t16 = floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5);
  float age = mod(uTearNow - t16 + 65536.0, 65536.0) / 16.0;
  return t.b * vec2(1.0 - smoothstep(uTearDry * 0.2, uTearDry, age), 1.0 - smoothstep(0.0, uTearDry * 0.55, age));
}`;

/** wet film + melt on a creature's skin material (and the melt on its shadow's depth material). Chains onto
 *  whatever onBeforeCompile they already have. */
export function patchSkin(mat: THREE.Material, depth: THREE.Material | null, u: WetUniforms) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + COMMON_V)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTearP = position; vTearN = normal;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nif (uMelt > 0.001) transformed = tearMelt(transformed, position);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + COMMON_F)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec2 tearF = tearFilm();
{
  // the melt wets all of it, in runs down the hide, and turns it to clear dark water
  float mw = smoothstep(0.03, 0.4, uMelt);
  float runs = pow(abs(sin(atan(vTearP.z - uMeltC.y, vTearP.x - uMeltC.x) * 9.0 + sin(vTearP.y * 16.8 / uMeltC.z) * 0.7)), 10.0);
  tearF = max(tearF, vec2(mw * (0.6 + 0.4 * runs), mw));
  vec3 c = diffuseColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.0 + 0.25 * tearF.x) * (1.0 - 0.4 * tearF.x);
  diffuseColor.rgb = mix(c, c * vec3(0.55, 0.58, 0.62), smoothstep(0.45, 0.95, uMelt));
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.13, tearF.y);');
  };
  mat.customProgramCacheKey = () => key + '-tears';
  mat.needsUpdate = true;
  if (depth) {
    const pd = depth.onBeforeCompile, kd = depth.customProgramCacheKey();
    depth.onBeforeCompile = (sh, r) => {
      pd.call(depth, sh, r);
      sh.uniforms.uMelt = u.uMelt; sh.uniforms.uMeltC = u.uMeltC;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>' + COMMON_V)
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nif (uMelt > 0.001) transformed = tearMelt(transformed, position);');
    };
    depth.customProgramCacheKey = () => kd + '-tears';
    depth.needsUpdate = true;
  }
}

/** the melt on the CPU (the same function as the shader): where a skinned mesh-local point `p` with bind position
 *  `r` is drawn to */
export function meltPoint(p: THREE.Vector3, r: THREE.Vector3, melt: number, M: MeltShape): THREE.Vector3 {
  if (melt <= 0.001) return p;
  const cx = M.x, cz = M.z, S = M.r / 0.42, dx = p.x - cx, dz = p.z - cz, py = p.y - M.ground;
  const n = 0.5 + 0.5 * Math.sin((r.x * 31) / S + Math.sin((r.z * 23) / S) * 1.7 + (r.y * 13) / S);
  const lag = Math.min(1, Math.hypot(r.x - cx, r.z - cz) / M.r);
  const delay = 0.32 * (1 - lag) * (0.45 + 0.55 * n);
  const mm = Math.min(1, Math.max(0, (melt - delay) / (1 - delay))), e = mm * mm * (3 - 2 * mm);
  const ang = Math.atan2(dz, dx), run = Math.pow(Math.max(0, Math.sin(ang * 7 + (r.y * 11) / S + Math.sin((r.x * 37) / S) * 1.5)), 5);
  const h = Math.max(py, 0), fall = h * Math.min(0.985, Math.max(0, e * 0.955 + run * e * (1 - e) * 0.9)), y = h - fall;
  const yy = Math.min(1, Math.max(0, y / (0.16 * S))), sp = 1 + e * (0.25 + 1.05 * (1 - yy * yy * (3 - 2 * yy))) * (0.8 + 0.4 * n);
  p.x = cx + dx * sp; p.z = cz + dz * sp; p.y = y + Math.min(py, 0) + 0.002 * e + M.ground;
  return p;
}
