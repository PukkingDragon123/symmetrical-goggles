// Lake water: a dark, cold, tannin-stained northern lake.
//   body     deep water near-black teal, shallows clear amber-brown over the stones (depth from a baked map)
//   surface  pixel-snapped wind ripples and drifting wind patches (cat's paws), shared with the Renderer
//   light    sun glitter: pixel sparkles where ripples catch the sun (bloom picks them up)
//   shore    a wet lapping band of foam and scum that breathes in and out
//   mirror   the Renderer reflects the treeline and sky in screen space (the material marks its pixels with
//            alpha = opacity through custom alpha blending, so the post pass knows where the water is)
import * as THREE from 'three';
import { WORLD, SPOTS, heightAt } from './layout';
import { G, WATER_GLSL } from '../gfx/globals';

function bakeDepth(cx: number, cz: number, size: number, n: number): THREE.DataTexture {
  const data = new Uint16Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = cx - size / 2 + ((i + 0.5) / n) * size, z = cz - size / 2 + ((j + 0.5) / n) * size;
    data[j * n + i] = THREE.DataUtils.toHalfFloat(WORLD.waterY - heightAt(x, z));
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function makeLake(): THREE.Mesh {
  const L = SPOTS.lake;
  const R = L.r * 1.6;
  const geo = new THREE.CircleGeometry(R, 96);
  geo.rotateX(-Math.PI / 2);
  const depthTex = bakeDepth(L.x, L.z, R * 2, 256);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0.0, transparent: true });
  // alpha out = the water's own opacity (< 1), the Renderer's water mask
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.ZeroFactor;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.uTime;
    sh.uniforms.uWind = G.uWindStrength;
    sh.uniforms.uWindDir = G.uWindDir;
    sh.uniforms.uSunDirW = G.uSunDir;
    sh.uniforms.uSunColW = G.uSunCol;
    sh.uniforms.tLakeDepth = { value: depthTex };
    sh.uniforms.uLakeBox = { value: new THREE.Vector3(L.x - R, L.z - R, R * 2) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform vec3 uSunDirW; uniform vec3 uSunColW;
        uniform sampler2D tLakeDepth; uniform vec3 uLakeBox;
        varying vec3 vWP;
        ${WATER_GLSL}
        float lakeDepth(vec2 xz) { return texture2D(tLakeDepth, (xz - uLakeBox.xy) / uLakeBox.z).r; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 wxz = floor(vWP.xz * 8.0) / 8.0;
        float wdep = lakeDepth(vWP.xz);
        float wpat = wPatch(vWP.xz);
        // body: near-black teal in the deep, tea-brown in the shallows, clear at the very edge
        vec3 deep = vec3(0.006, 0.016, 0.02), shal = vec3(0.07, 0.06, 0.035);
        diffuseColor.rgb = mix(shal, deep, smoothstep(0.1, 2.6, wdep)) * (1.0 - 0.25 * wpat);
        diffuseColor.a = mix(0.38, 0.97, smoothstep(0.02, 1.6, wdep));
        // shore: a lapping wet band with broken foam and scum
        float lap = 0.05 + 0.035 * sin(uTime * 1.1 + wN(wxz * 0.7) * 6.0) + 0.02 * sin(uTime * 2.3 + vWP.x * 0.9);
        float fn = wN(wxz * 2.3 + vec2(uTime * 0.05, 0.0)) * 0.6 + wN(wxz * 7.0) * 0.4;
        float foam = (1.0 - smoothstep(lap * 0.5, lap, wdep)) * smoothstep(0.38, 0.62, fn);
        float scum = (1.0 - smoothstep(0.0, lap * 2.6, wdep)) * smoothstep(0.55, 0.7, wN(wxz * 1.3 + 11.0)) * 0.6;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.62, 0.56), foam * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.14, 0.09), scum * (1.0 - foam));
        diffuseColor.a = max(diffuseColor.a, max(foam * 0.995, scum * 0.9));
        diffuseColor.a = min(diffuseColor.a, 0.99);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.05 + 0.08 * wpat, 0.7, foam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 wnW = waterNormal(vWP.xz, 1.0 - foam);
        normal = normalize((viewMatrix * vec4(wnW, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // sun glitter: pixel sparkles where a ripple facet mirrors the sun
          vec3 vd = normalize(vWP - cameraPosition);
          vec3 rr = reflect(vd, wnW);
          float s = max(dot(rr, uSunDirW), 0.0);
          float cell = wH(wxz * 1.37 + floor(uTime * 6.0) * 0.173);
          float sp = step(0.9965 - 0.004 * uWind, s) * step(0.55, cell) + pow(s, 400.0) * 0.4;
          totalEmissiveRadiance += uSunColW * sp * 2.2 * (1.0 - foam) * smoothstep(0.05, 0.4, wdep) * step(0.02, uSunDirW.y);
        }`);
  };
  mat.customProgramCacheKey = () => 'lake-v2';
  const m = new THREE.Mesh(geo, mat);
  m.position.set(L.x, WORLD.waterY, L.z);
  m.receiveShadow = true;
  m.renderOrder = 1;
  G.uLake.value.set(L.x, WORLD.waterY, L.z, R);
  return m;
}
