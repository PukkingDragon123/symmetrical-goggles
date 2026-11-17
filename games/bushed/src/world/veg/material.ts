// Ground-cover materials: Lambert (masses of small plants) or Standard (rocks, logs, stumps) patched with
//   * wind: sway by height (aWind.x metres at full strength), leaf flutter (aWind.z), gusts (G.uWindStrength / uGust)
//   * pushers: plants bend away from G.uPushers (player = slot 0, hound, creatures) and from a short trail of the
//     player's recent positions, so trampled grass springs back over ~1.5 s with a little overshoot
//   * distance fade: screen-space dither between uFade.x and uFade.y metres from G.uCamPos (stable, no popping)
//   * rocks / logs: world-space triplanar pixel texture (hard axis pick keeps texels crisp) and moss on top faces
import * as THREE from 'three';
import { G, MAX_PUSHERS } from '../../gfx/globals';
import { loadTex } from '../../gfx/tex';

export const TRAIL_N = 8;
/** recent player positions (xyz) and age in seconds (w); maintained by GroundCover.update */
export const TRAIL = { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector4(0, -999, 0, 99)) };

export interface VegMatOpts {
  kind: 'plant' | 'rock' | 'wood' | 'moss';
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  /** fade distance band (start, end) in metres */
  fade: [number, number];
  /** plants: bend from pushers */
  push?: boolean;
  /** rocks/wood: triplanar tile size (m); 0 = use mesh uvs */
  triplanar?: number;
  /** moss on upward faces 0..1 (rocks / logs / stumps) */
  moss?: number;
  /** plants: bent normals kept on back faces */
  keepNormal?: boolean;
  alphaTest?: number;
  side?: THREE.Side;
  roughness?: number;
  vertexColors?: boolean;
  /** translucency for leaves */
  trans?: number;
}

const V_COMMON = /* glsl */ `
attribute vec4 aWind;
uniform float uTime; uniform vec2 uWindDir; uniform float uWindStrength; uniform float uGust;
uniform vec3 uCamPos; uniform vec4 uPushers[${MAX_PUSHERS}]; uniform vec4 uTrail[${TRAIL_N}];
uniform vec2 uFade;
varying float vVegFade; varying vec3 vVegW; varying vec3 vVegN;
vec3 vegPush(vec3 o, vec3 p, float h) {
  vec3 off = vec3(0.0);
  for (int i = 0; i < ${MAX_PUSHERS}; i++) {
    vec4 q = uPushers[i];
    if (q.w <= 0.0) continue;
    vec2 d = o.xz - q.xz;
    float l = length(d);
    float R = q.w + 0.35;
    if (l > R || abs(o.y - q.y) > 2.5) continue;
    float k = 1.0 - l / R;
    vec2 dir = l > 1e-3 ? d / l : vec2(1.0, 0.0);
    off += vec3(dir.x, 0.0, dir.y) * k * h * 0.9 - vec3(0.0, k * h * 0.55, 0.0);
  }
  for (int i = 0; i < ${TRAIL_N}; i++) {
    vec4 q = uTrail[i];
    if (q.w > 2.0) continue;
    vec2 d = o.xz - q.xz;
    float l = length(d);
    float R = 0.85;
    if (l > R || abs(o.y - q.y) > 2.5) continue;
    float k = (1.0 - l / R) * exp(-q.w * 2.6) * (cos(q.w * 7.0) * 0.85 + 0.15);
    vec2 dir = l > 1e-3 ? d / l : vec2(1.0, 0.0);
    off += vec3(dir.x, 0.0, dir.y) * k * h * 0.7 - vec3(0.0, max(k, 0.0) * h * 0.4, 0.0);
  }
  float m = length(off);
  return m > h * 0.95 ? off * (h * 0.95 / m) : off;
}
`;

const V_BEGIN = /* glsl */ `
#include <begin_vertex>
{
  mat4 vM = modelMatrix;
  #ifdef USE_INSTANCING
  vM = modelMatrix * instanceMatrix;
  #endif
  vec3 o = vM[3].xyz;
  vVegFade = distance(o.xz, uCamPos.xz);
  vec3 wp = (vM * vec4(transformed, 1.0)).xyz;
  vec3 off = vec3(0.0);
  #ifdef VEG_WIND
  {
    float ws = uWindStrength;
    vec2 wd = uWindDir;
    float ph = dot(o.xz, vec2(0.37, 0.53)) + aWind.w * 6.283;
    float g = sin(dot(o.xz, wd) * 0.05 - uGust) * 0.5 + 0.5;
    float gust = g * g * ws;
    float sway = ws * (0.25 + 0.9 * gust) + (0.08 + ws * 0.35) * sin(uTime * (1.3 + aWind.w) + ph);
    off += vec3(wd.x, 0.0, wd.y) * sway * aWind.x;
    off += vec3(sin(uTime * 6.7 + ph * 3.0 + wp.y * 3.0), sin(uTime * 8.3 + ph * 2.0) * 0.6, sin(uTime * 7.4 + ph * 2.7 + wp.x * 3.0)) * aWind.z * (0.012 + 0.05 * ws + 0.06 * gust);
  }
  #endif
  #ifdef VEG_PUSH
  off += vegPush(o, wp, aWind.x * 3.0 + aWind.y);
  #endif
  mat3 vM3 = mat3(vM);
  float vS2 = max(1e-6, dot(vM3[0], vM3[0]));
  transformed += (transpose(vM3) * off) / vS2;
  vVegW = wp + off;
  vVegN = normalize(vM3 * objectNormal);
}
`;

const F_COMMON = /* glsl */ `
uniform vec2 uFade; uniform float uWet; uniform float uSnow; uniform float uMoss; uniform float uTri; uniform float uTrans;
uniform sampler2D uMossMap;
varying float vVegFade; varying vec3 vVegW; varying vec3 vVegN;
float vegIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float vegH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vegVN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vegH(i), vegH(i + vec2(1, 0)), f.x), mix(vegH(i + vec2(0, 1)), vegH(i + vec2(1, 1)), f.x), f.y); }
`;

const F_DITHER = /* glsl */ `
void main() {
  {
    float t = clamp((vVegFade - uFade.x) / max(uFade.y - uFade.x, 1e-3), 0.0, 1.0);
    if (vegIGN(gl_FragCoord.xy) < t) discard;
  }
`;

let mossTex: THREE.Texture | null = null;

export function vegMaterial(o: VegMatOpts): THREE.Material {
  const isPlant = o.kind === 'plant';
  const m: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial = isPlant
    ? new THREE.MeshLambertMaterial({ map: o.map ?? null, alphaTest: o.alphaTest ?? 0.5, side: o.side ?? THREE.DoubleSide, vertexColors: o.vertexColors ?? true })
    : new THREE.MeshStandardMaterial({
      map: o.map ?? null, normalMap: o.normalMap ?? null, roughness: o.roughness ?? 0.92, metalness: 0,
      vertexColors: o.vertexColors ?? false, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0,
    });
  if (!mossTex) mossTex = loadTex('veg/moss.png', { repeat: true });
  const fade = { value: new THREE.Vector2(o.fade[0], o.fade[1]) };
  const moss = { value: o.moss ?? 0 };
  const tri = { value: o.triplanar ?? 0 };
  const trans = { value: o.trans ?? (isPlant ? 0.35 : 0) };
  const wind = isPlant;
  const push = !!o.push;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTime: G.uTime, uWindDir: G.uWindDir, uWindStrength: G.uWindStrength, uGust: G.uGust, uCamPos: G.uCamPos,
      uPushers: G.uPushers, uTrail: TRAIL, uFade: fade, uWet: G.uWet, uSnow: G.uSnow, uMoss: moss, uTri: tri,
      uMossMap: { value: mossTex }, uTrans: trans,
    });
    let vs = sh.vertexShader;
    vs = vs.replace('#include <common>', `#include <common>\n${wind ? '#define VEG_WIND\n' : ''}${push ? '#define VEG_PUSH\n' : ''}${V_COMMON}`);
    vs = vs.replace('#include <begin_vertex>', V_BEGIN);
    sh.vertexShader = vs;
    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + F_COMMON);
    fs = fs.replace(/void main\(\)\s*\{/, F_DITHER);
    if (o.triplanar) {
      // hard-picked triplanar projection in world space (crisp pixel texels on any orientation)
      fs = fs.replace('#include <map_fragment>', `
        #ifdef USE_MAP
        {
          vec3 an = abs(vVegN);
          vec2 tuv = an.y > max(an.x, an.z) ? vVegW.xz : (an.x > an.z ? vVegW.zy : vVegW.xy);
          tuv /= uTri;
          diffuseColor *= texture2D(map, tuv);
        }
        #endif`);
    }
    if (o.kind !== 'plant') {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = floor(vVegW.xz * 20.0 + vVegW.y * 7.0) / 20.0;
          float n = vegVN(q * 1.7) * 0.6 + vegVN(q * 6.0) * 0.4;
          float up = vVegN.y;
          float mm = uMoss * (0.2 + 1.1 * smoothstep(0.1, 0.8, up)) + (n - 0.5) * 0.8;
          if (mm > 0.55) {
            vec3 an = abs(vVegN);
            vec2 muv = an.y > max(an.x, an.z) ? vVegW.xz : (an.x > an.z ? vVegW.zy : vVegW.xy);
            vec3 mc = texture2D(uMossMap, muv / 1.6).rgb;
            diffuseColor.rgb = mix(mc * vec3(0.82, 0.9, 0.75), mc, step(0.66, mm));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.95), step(0.6, uSnow * (0.3 + 0.9 * max(up, 0.0)) + (n - 0.5) * 0.3));
          diffuseColor.rgb *= 1.0 - 0.3 * uWet;
        }`);
      fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, uWet);');
    } else {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), step(0.7, uSnow * (0.5 + 0.6 * vVegN.y)));
        diffuseColor.rgb *= 1.0 - 0.2 * uWet;`);
      if (o.keepNormal !== false) {
        fs = fs.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
      }
      fs = fs.replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        #if NUM_DIR_LIGHTS > 0
        {
          float tt = pow(max(dot(-geometryViewDir, directLight.direction), 0.0), 3.0);
          reflectedLight.directDiffuse += directLight.color * diffuseColor.rgb * (tt + 0.1) * uTrans;
        }
        #endif`);
    }
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `bushed-veg:${o.kind}:${wind ? 1 : 0}${push ? 1 : 0}:${o.triplanar ? 1 : 0}:${o.keepNormal === false ? 0 : 1}`;
  m.userData.fade = fade;
  return m;
}

/** depth material for shadow casting (same wind + fade dither + alpha) */
export function vegDepthMaterial(o: VegMatOpts): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.map ?? null, alphaTest: o.map && o.kind === 'plant' ? 0.5 : 0 });
  if (o.kind === 'plant') m.side = THREE.DoubleSide;
  const fade = { value: new THREE.Vector2(o.fade[0], o.fade[1]) };
  const wind = o.kind === 'plant';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTime: G.uTime, uWindDir: G.uWindDir, uWindStrength: G.uWindStrength, uGust: G.uGust, uCamPos: G.uCamPos,
      uPushers: G.uPushers, uTrail: TRAIL, uFade: fade,
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${wind ? '#define VEG_WIND\n' : ''}${o.push ? '#define VEG_PUSH\n' : ''}${V_COMMON}`)
      .replace('#include <begin_vertex>', V_BEGIN.replace('vVegN = normalize(vM3 * objectNormal);', 'vVegN = vec3(0.0, 1.0, 0.0);'));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec2 uFade; varying float vVegFade;\nfloat vegIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }')
      .replace(/void main\(\)\s*\{/, F_DITHER);
  };
  m.customProgramCacheKey = () => `bushed-veg-depth:${wind ? 1 : 0}${o.push ? 1 : 0}:${o.map ? 1 : 0}`;
  return m;
}
