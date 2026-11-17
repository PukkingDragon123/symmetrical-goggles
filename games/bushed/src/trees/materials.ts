// Tree materials: MeshStandardMaterial patched (onBeforeCompile) with
//   * wind: trunk sway by height, branch bob/flap, leaf flutter, travelling gusts (G.uWindStrength/uWindDir/uGust),
//     driven by the per-vertex attribute aWind = (trunk sway m, branch sway m, flutter, phase 0..1)
//   * dithered LOD cross-fade (screen-space interleaved gradient noise, complementary between LOD buckets) keyed on
//     the instance's distance to G.uCamPos (so the shadow pass fades exactly like the main pass)
//   * foliage: outward-bent normals kept on back faces, coverage-preserving alpha on distant mips, translucency
//     (sun shining through the leaves), silver underside tint
//   * bark: pixel-snapped moss patches (aMoss attribute), wetness, snow on upward faces
// Geometry without aWind/aMoss reads (0,0,0,1)/0 and is static and moss-free, so these materials also suit logs.
import * as THREE from 'three';
import { G } from '../gfx/globals';
import { barkNormal, barkTexture, foliageTexture } from './textures';
import { loadTex } from '../gfx/tex';
import { SPECIES, type SpeciesId } from './species';

export type TreeMatKind = 'bark' | 'foliage' | 'impostor';

export interface TreeUniforms {
  /** 0 = no wind (felled / detached), 1 = normal */
  uWindAmt: { value: number };
  /** LOD fade: x..y fade-in distance band, z..w fade-out band (metres from G.uCamPos, xz) */
  uLod: { value: THREE.Vector4 };
}

export const ALWAYS = new THREE.Vector4(-2, -1, 1e8, 1e9);

const COMMON_V = /* glsl */ `
attribute vec4 aWind;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uGust;
uniform float uWindAmt;
uniform vec3 uCamPos;
varying float vTwDist;
vec3 twWind(vec3 o, vec3 p, vec4 w) {
  float ws = uWindStrength * uWindAmt;
  vec2 wd = uWindDir;
  vec3 dir = vec3(wd.x, 0.0, wd.y);
  vec3 side = vec3(-wd.y, 0.0, wd.x);
  float ph = dot(o.xz, vec2(0.071, 0.093));
  // travelling gust front along the wind + a slower cross modulation
  float g = sin(dot(o.xz, wd) * 0.045 - uGust) * 0.5 + 0.5;
  g = g * g * (0.65 + 0.35 * sin(dot(o.xz, side.xz) * 0.031 + uGust * 0.37));
  float gust = g * ws;
  float sway = ws * (0.3 + 0.9 * gust) + ws * (0.22 * sin(uTime * 0.71 + ph) + 0.1 * sin(uTime * 1.63 + ph * 1.7));
  vec3 off = (dir * sway + side * ws * 0.12 * sin(uTime * 0.93 + ph * 2.3)) * w.x;
  float bp = w.w * 6.2831 + ph;
  float bob = sin(uTime * (1.4 + w.w * 0.9) + bp) * (0.35 + gust);
  float flap = sin(uTime * (1.9 + w.w) + bp * 1.3);
  off += (vec3(0.0, bob * 0.6, 0.0) + dir * (0.55 * gust + 0.3 * flap) + side * 0.18 * flap) * w.y * ws;
  float fl = 0.015 + 0.06 * ws + 0.08 * gust;
  off += vec3(sin(uTime * 7.3 + bp * 3.1 + p.y * 2.1), sin(uTime * 8.7 + bp * 1.7 + p.x * 2.3), sin(uTime * 6.9 + bp * 2.3 + p.z * 1.9)) * w.z * fl;
  return off;
}
`;

const BEGIN_V = /* glsl */ `
#include <begin_vertex>
{
  mat4 twM = modelMatrix;
  #ifdef USE_INSTANCING
  twM = modelMatrix * instanceMatrix;
  #endif
  vec3 twO = twM[3].xyz;
  vec3 twP = (twM * vec4(transformed, 1.0)).xyz;
  vTwDist = distance(twO.xz, uCamPos.xz);
  vec3 twD = twWind(twO, twP, aWind);
  mat3 twM3 = mat3(twM);
  float twS2 = max(1e-6, dot(twM3[0], twM3[0]));
  transformed += (transpose(twM3) * twD) / twS2;
  #ifdef TW_EXTRA
  vTwSeed = twO.xz;
  vTwUp = normalize(twM3 * objectNormal).y;
  #endif
}
`;

const COMMON_F = /* glsl */ `
uniform vec4 uLod;
varying float vTwDist;
float twIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const DITHER_F = /* glsl */ `
void main() {
  {
    float twB = twIGN(gl_FragCoord.xy);
    float twIn = clamp((vTwDist - uLod.x) / max(uLod.y - uLod.x, 1e-3), 0.0, 1.0);
    float twOut = clamp((vTwDist - uLod.z) / max(uLod.w - uLod.z, 1e-3), 0.0, 1.0);
    if (twB >= twIn || twB < twOut) discard;
  }
`;

const ALPHA_MIP_F = /* glsl */ `
#include <map_fragment>
#ifdef USE_MAP
{
  vec2 twTs = vec2(textureSize(map, 0));
  vec2 twDx = dFdx(vMapUv * twTs), twDy = dFdy(vMapUv * twTs);
  float twLod = 0.5 * log2(max(max(dot(twDx, twDx), dot(twDy, twDy)), 1e-8));
  diffuseColor.a *= 1.0 + max(twLod, 0.0) * 0.3;
}
#endif
`;

function baseUniforms(shader: THREE.WebGLProgramParametersWithUniforms, u: TreeUniforms): void {
  shader.uniforms.uTime = G.uTime;
  shader.uniforms.uWindDir = G.uWindDir;
  shader.uniforms.uWindStrength = G.uWindStrength;
  shader.uniforms.uGust = G.uGust;
  shader.uniforms.uCamPos = G.uCamPos;
  shader.uniforms.uWindAmt = u.uWindAmt;
  shader.uniforms.uLod = u.uLod;
}

function patchVertex(vs: string, extra: boolean): string {
  let pre = COMMON_V;
  if (extra) pre = '#define TW_EXTRA\nvarying vec2 vTwSeed;\nvarying float vTwUp;\nattribute float aMoss;\nvarying float vTwMoss;\n' + pre;
  vs = vs.replace('#include <common>', '#include <common>\n' + pre);
  vs = vs.replace('#include <begin_vertex>', BEGIN_V + (extra ? 'vTwMoss = aMoss;\n' : ''));
  return vs;
}

function patchFragmentCommon(fs: string): string {
  fs = fs.replace('#include <common>', '#include <common>\n' + COMMON_F);
  fs = fs.replace(/void main\(\)\s*\{/, DITHER_F);
  return fs;
}

export interface FoliageOpts { translucency?: number; backTint?: THREE.Color }

function makeUniforms(lod?: THREE.Vector4): TreeUniforms {
  return { uWindAmt: { value: 1 }, uLod: { value: (lod ?? ALWAYS).clone() } };
}

/** patch a standard material for tree use (kind decides the extras). Returns its uniforms */
export function patchTreeMaterial(m: THREE.MeshStandardMaterial, kind: TreeMatKind, u: TreeUniforms, fo: FoliageOpts = {}): TreeUniforms {
  const trans = { value: fo.translucency ?? 0.6 };
  const back = { value: fo.backTint ?? new THREE.Color(1, 1, 1) };
  const moss = { value: loadTex('veg/moss.png', { repeat: true }) };
  m.onBeforeCompile = (shader) => {
    baseUniforms(shader, u);
    const extra = kind === 'bark' || kind === 'foliage';
    shader.vertexShader = patchVertex(shader.vertexShader, extra);
    let fs = patchFragmentCommon(shader.fragmentShader);
    shader.uniforms.uWet = G.uWet;
    shader.uniforms.uSnow = G.uSnow;
    const decl = 'uniform float uWet;\nuniform float uSnow;\n' + (extra ? 'varying vec2 vTwSeed;\nvarying float vTwUp;\nvarying float vTwMoss;\n' : '');
    fs = fs.replace('#include <common>', '#include <common>\n' + decl);
    if (kind === 'foliage' || kind === 'impostor') {
      fs = fs.replace('#include <map_fragment>', ALPHA_MIP_F);
    }
    if (kind === 'foliage') {
      shader.uniforms.uTrans = trans;
      shader.uniforms.uBackTint = back;
      fs = fs.replace('#include <common>', '#include <common>\nuniform float uTrans;\nuniform vec3 uBackTint;\n');
      // keep the outward-bent normal on back faces (soft, volumetric crowns)
      fs = fs.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        if (!gl_FrontFacing) diffuseColor.rgb *= uBackTint;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), step(0.62, uSnow * (0.55 + 0.6 * vTwUp)));
        diffuseColor.rgb *= 1.0 - 0.25 * uWet;`);
      // light through the leaves: when looking toward the sun, lit foliage glows (uses the shadowed sun colour)
      fs = fs.replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        #if NUM_DIR_LIGHTS > 0
        {
          float twT = pow(max(dot(-geometryViewDir, directLight.direction), 0.0), 3.0);
          reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * twT * uTrans;
          reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * 0.08 * uTrans;
        }
        #endif`);
    }
    if (kind === 'bark') {
      shader.uniforms.uMossMap = moss;
      fs = fs.replace('#include <common>', `#include <common>
        uniform sampler2D uMossMap;
        float twH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float twVN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(twH(i), twH(i + vec2(1, 0)), f.x), mix(twH(i + vec2(0, 1)), twH(i + vec2(1, 1)), f.x), f.y); }`);
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef USE_MAP
        {
          vec2 twTs = vec2(textureSize(map, 0));
          vec2 twQ = floor(vMapUv * twTs) / twTs;
          float twN = twVN(twQ * 9.0 + vTwSeed * 0.37) * 0.65 + twVN(twQ * 31.0 + vTwSeed) * 0.35;
          float twMs = vTwMoss * (0.6 + 0.7 * max(vTwUp, 0.0)) + (twN - 0.5) * 0.9;
          if (twMs > 0.42) {
            vec3 mc = texture2D(uMossMap, vMapUv * 1.7).rgb;
            diffuseColor.rgb = mix(mc, mc * vec3(0.8, 0.9, 0.7), step(twMs, 0.5));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.95), step(0.7, uSnow * (0.4 + 0.8 * max(vTwUp, 0.0)) + (twN - 0.5) * 0.3));
        }
        #endif
        diffuseColor.rgb *= 1.0 - 0.32 * uWet;`);
      fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, uWet);');
    }
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `bushed-tree:${kind}`;
  m.userData.tree = { kind, uniforms: u };
  return u;
}

/** depth material (shadow casting) with the same wind + LOD dither (+ alpha cut for cards) */
export function treeDepthMaterial(kind: TreeMatKind, u: TreeUniforms, map?: THREE.Texture): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map ?? null, alphaTest: map ? 0.5 : 0 });
  if (map) m.side = THREE.DoubleSide;
  m.onBeforeCompile = (shader) => {
    baseUniforms(shader, u);
    shader.vertexShader = patchVertex(shader.vertexShader, false);
    let fs = patchFragmentCommon(shader.fragmentShader);
    if (map) fs = fs.replace('#include <map_fragment>', ALPHA_MIP_F);
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `bushed-tree-depth:${kind}:${map ? 1 : 0}`;
  return m;
}

export interface TreeMaterialSet {
  bark: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  barkDepth: THREE.MeshDepthMaterial;
  foliageDepth: THREE.MeshDepthMaterial;
  uniforms: TreeUniforms;
}

const FOLIAGE_OPTS: Record<SpeciesId, FoliageOpts> = {
  spruce: { translucency: 0.35, backTint: new THREE.Color(0.95, 1.0, 1.04) },
  fir: { translucency: 0.35, backTint: new THREE.Color(1.12, 1.18, 1.16) },
  pine: { translucency: 0.45 },
  birch: { translucency: 0.8, backTint: new THREE.Color(1.08, 1.1, 0.95) },
  cedar: { translucency: 0.55, backTint: new THREE.Color(1.05, 1.08, 1.0) },
};

/** create a fresh bark / foliage material pair for a species (own uniforms: LOD band, wind amount) */
export function createTreeMaterials(species: SpeciesId, lod?: THREE.Vector4): TreeMaterialSet {
  const u = makeUniforms(lod);
  const bark = new THREE.MeshStandardMaterial({
    map: barkTexture(species), normalMap: barkNormal(species), normalScale: new THREE.Vector2(1.7, 1.7),
    vertexColors: true, roughness: 0.93, metalness: 0,
  });
  bark.name = `bark_${species}`;
  patchTreeMaterial(bark, 'bark', u);
  const ftex = foliageTexture(species);
  const foliage = new THREE.MeshStandardMaterial({
    map: ftex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82, metalness: 0,
  });
  foliage.name = `foliage_${species}`;
  patchTreeMaterial(foliage, 'foliage', u, FOLIAGE_OPTS[species]);
  return { bark, foliage, barkDepth: treeDepthMaterial('bark', u), foliageDepth: treeDepthMaterial('foliage', u, ftex), uniforms: u };
}

const shared = new Map<SpeciesId, TreeMaterialSet>();
/** the shared per-species materials (always visible, wind on). Bucked logs / firewood can use .bark */
export function treeMaterials(species: SpeciesId): TreeMaterialSet {
  let s = shared.get(species);
  if (!s) shared.set(species, (s = createTreeMaterials(species)));
  return s;
}

export { SPECIES };
