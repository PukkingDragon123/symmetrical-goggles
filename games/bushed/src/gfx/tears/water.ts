// Clear water for tears: the drop material (instanced spheres) and the puddle material (instanced ground quads).
//
// Both are MeshStandardMaterial with a black base (clean water scatters nothing of its own) and a low roughness, so
// the scene's lights give a sharp glint (the sun by day, the flashlight at night: a light right by the eye glints in
// every drop that faces it). On top, patched in: a faint reflection of the sky (the hemisphere light's colours, or the
// environment map when the scene has one) rising with the Fresnel term, and premultiplied blending that adds the light
// the water reflects while darkening what is behind it, little through the middle and a lot toward the rim, where a
// real drop bends the view onto darker surroundings. No teal anywhere: the colour is all from the world.
import * as THREE from 'three';

const PARS = /* glsl */ `
// the sky the water reflects, from the hemisphere light(s)
vec3 tearSky(vec3 r) {
  vec3 c = vec3(0.0);
#if NUM_HEMI_LIGHTS > 0
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
    float k = 0.5 + 0.5 * dot(r, hemisphereLights[i].direction);
    c += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, smoothstep(0.3, 0.8, k));
  }
  #pragma unroll_loop_end
#endif
  return c;
}
// light focused through a drop onto its far side (a bright crescent opposite the glint)
vec3 tearGlow(vec3 n, vec3 pos) {
  vec3 c = vec3(0.0);
#if NUM_DIR_LIGHTS > 0
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    c += directionalLights[i].color * pow(max(0.0, dot(-n, directionalLights[i].direction)), 4.0);
  }
  #pragma unroll_loop_end
#endif
#if NUM_SPOT_LIGHTS > 0
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
    vec3 l = spotLights[i].position - pos; float d = length(l); l /= max(d, 1e-4);
    float att = getSpotAttenuation(spotLights[i].coneCos, spotLights[i].penumbraCos, dot(l, spotLights[i].direction)) * getDistanceAttenuation(d, spotLights[i].distance, spotLights[i].decay);
    c += spotLights[i].color * att * pow(max(0.0, dot(-n, l)), 4.0);
  }
  #pragma unroll_loop_end
#endif
  return c;
}`;
/** fog fades the water's added light and its darkening together (the fog colour is already behind it) */
const FOG = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
  float tearFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
  float tearFog = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb *= 1.0 - tearFog; tearA *= 1.0 - tearFog;
#endif`;

// ------------------------------------------------------------------------------------------------ drops
/** the drop material: per-instance matrices place a unit sphere (a sessile cap squashed along the skin's normal, a
 *  falling drop stretched along its path) */
export function dropMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.09, metalness: 0, transparent: true, premultipliedAlpha: true, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_pars_begin>', '#include <lights_pars_begin>' + PARS)
      .replace('#include <opaque_fragment>', `
float tearA;
{
  vec3 V = normalize(vViewPosition);
  float ndv = clamp(dot(normal, V), 0.0, 1.0), rim = 1.0 - ndv;
  float F = 0.03 + 0.97 * pow(rim, 5.0);
#ifndef USE_ENVMAP
  outgoingLight += tearSky(reflect(-V, normal)) * F;
#endif
  outgoingLight += tearGlow(normal, -vViewPosition) * 0.05;
  // what is behind shows through the middle, darkened toward the rim (the bent view of darker surroundings)
  tearA = mix(0.1, 0.82, pow(rim, 1.35));
}
#include <opaque_fragment>`)
      .replace('#include <fog_fragment>', FOG)
      .replace('#include <premultiplied_alpha_fragment>', 'gl_FragColor.a = tearA;');
  };
  m.customProgramCacheKey = () => 'tear-drop';
  return m;
}

// ------------------------------------------------------------------------------------------------ puddles
/** per-instance puddle data the material reads (InstancedBufferAttributes on the quad geometry):
 *    aR0, aR1  the water's edge in 8 sectors (radius / quad half-size, sector k at angle k * 45 deg from local +x)
 *    aP        water depth (mm) at time aP.z, soak rate (mm/s), aP.z, the wet halo's radius / half-size
 *    aQ        seconds the wet ground takes to dry, a seed, the quad half-size (m), 1 for the dissolve sheet */
export function puddleMaterial(uNow: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0x000000, roughness: 0.07, metalness: 0, transparent: true, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNow = uNow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aR0; attribute vec4 aR1; attribute vec4 aP; attribute vec4 aQ;
varying vec4 vR0; varying vec4 vR1; varying vec4 vP; varying vec4 vQ; varying vec2 vLoc; varying vec3 vTX; varying vec3 vTZ;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vR0 = aR0; vR1 = aR1; vP = aP; vQ = aQ; vLoc = position.xz;
{
  mat4 im = mat4(1.0);
#ifdef USE_INSTANCING
  im = instanceMatrix;
#endif
  vTX = normalize((modelViewMatrix * im * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  vTZ = normalize((modelViewMatrix * im * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNow;
varying vec4 vR0; varying vec4 vR1; varying vec4 vP; varying vec4 vQ; varying vec2 vLoc; varying vec3 vTX; varying vec3 vTZ;
float tearEdge(float a) {
  // the water's edge at an angle: a periodic Catmull-Rom through the 8 sector radii
  float R[8] = float[8](vR0.x, vR0.y, vR0.z, vR0.w, vR1.x, vR1.y, vR1.z, vR1.w);
  float s = a / 6.2831853 * 8.0; s = mod(s, 8.0);
  int i = int(floor(s)); float f = s - floor(s);
  float p0 = R[(i + 7) % 8], p1 = R[i], p2 = R[(i + 1) % 8], p3 = R[(i + 2) % 8];
  return max(0.0, p1 + 0.5 * f * (p2 - p0 + f * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + f * (3.0 * (p1 - p2) + p3 - p0))));
}
float tearN(vec2 p) { return sin(p.x * 1.7 + sin(p.y * 1.3)) * sin(p.y * 1.9 + sin(p.x * 1.1) * 1.4); }`)
      .replace('#include <lights_pars_begin>', '#include <lights_pars_begin>' + PARS)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
// snap to a 5 mm grid on the ground (the house's chunky pixels), then the shape: water inside its edge, wet ground in
// the halo round it, nothing beyond
float tS = vQ.z, tPx = 0.005 / tS;
vec2 tq = (floor(vLoc / tPx) + 0.5) * tPx;
float tr = length(tq), ta = atan(tq.y, tq.x);
float tJag = 1.0 + 0.07 * tearN(tq * tS * 90.0 + vQ.y * 13.0) + 0.04 * sin(ta * 11.0 + vQ.y * 7.0);
float tEdge = tearEdge(ta) * tJag;
float tDepth = max(0.0, vP.x - vP.y * (uNow - vP.z));
float tGone = vP.y > 0.0 ? vP.z + vP.x / vP.y : 1e9;
float tDamp = tDepth > 0.0 ? 1.0 : 1.0 - smoothstep(0.0, vQ.x, uNow - tGone);
float tWater = tDepth > 0.02 && tr < tEdge ? 1.0 : 0.0;
float tHalo = max(vP.w, tEdge * 1.15) * (1.0 + 0.1 * tearN(tq * tS * 60.0 + vQ.y * 5.0));
if (tWater < 0.5 && (tr > tHalo || tDamp <= 0.01)) discard;
float tIn = tEdge - tr;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (tWater > 0.5) {
  // ripples (the sheet trembles), and the meniscus: the last pixel or two curl up to the edge and catch the light
  float tt = uNow * (vQ.w > 0.5 ? 2.3 : 1.2);
  vec2 w = tq * tS * 70.0;
  vec2 g = vec2(cos(w.x + tt * 3.1 + w.y * 0.3), cos(w.y * 1.13 - tt * 2.7 + w.x * 0.4)) * 0.05 * (vQ.w > 0.5 ? 1.0 : 0.5);
  float men = 1.0 - smoothstep(0.0, 2.5 * tPx, tIn);
  vec2 outw = tr > 1e-5 ? tq / tr : vec2(0.0);
  g += outw * men * 0.9;
  normal = normalize(normal + g.x * vTX + g.y * vTZ);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (tWater < 0.5) roughnessFactor = 0.85;')
      .replace('#include <opaque_fragment>', `
float tearA;
{
  vec3 V = normalize(vViewPosition);
  float ndv = clamp(dot(normal, V), 0.0, 1.0);
  float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  // wet ground: darker, no shine of its own
  float wetA = 0.42 * tDamp;
  if (tWater > 0.5) {
    float deep = clamp(tDepth / 3.0, 0.0, 1.0);
    // a darker band just inside the edge where the meniscus bends the view
    float band = smoothstep(0.5 * tPx, 1.5 * tPx, tIn) * (1.0 - smoothstep(2.0 * tPx, 4.0 * tPx, tIn));
#ifndef USE_ENVMAP
    outgoingLight += tearSky(reflect(-V, normal)) * F;
#endif
    tearA = clamp(0.5 + 0.22 * deep + 0.18 * band, 0.0, 0.92);
  } else {
    outgoingLight *= 0.0;
    tearA = wetA * (0.75 + 0.25 * (1.0 - smoothstep(tEdge, tHalo, tr)));
  }
}
#include <opaque_fragment>`)
      .replace('#include <fog_fragment>', FOG)
      .replace('#include <premultiplied_alpha_fragment>', 'gl_FragColor.a = tearA;');
  };
  m.customProgramCacheKey = () => 'tear-puddle';
  return m;
}
