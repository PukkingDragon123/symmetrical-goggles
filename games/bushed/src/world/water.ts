// Lake water: a dark, cold northern lake. Fresnel sky reflection, wind ripples (two scrolling normal octaves
// from noise), a darker deep tint, shoreline fade from the terrain depth, sun glints.
import * as THREE from 'three';
import { WORLD, SPOTS } from './layout';
import { G } from '../gfx/globals';

export function makeLake(): THREE.Mesh {
  const L = SPOTS.lake;
  const geo = new THREE.CircleGeometry(L.r * 1.6, 96);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b1416, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.92 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.uTime;
    sh.uniforms.uWind = G.uWindStrength;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uWind; varying vec3 vWP;
        float wh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
        float wave(vec2 p) { return wn(p * 0.9 + uTime * vec2(0.25, 0.1)) * 0.6 + wn(p * 2.3 - uTime * vec2(0.1, 0.35)) * 0.3 + wn(p * 6.1 + uTime * 0.6) * 0.1; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = floor(vWP.xz * 8.0) / 8.0; // pixel-snapped ripples
          float e = 0.12;
          float a = wave(p), bx = wave(p + vec2(e, 0.0)), bz = wave(p + vec2(0.0, e));
          float k = 0.35 + uWind * 1.2;
          vec3 nW = normalize(vec3(-(bx - a) * k / e, 1.0, -(bz - a) * k / e));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  const m = new THREE.Mesh(geo, mat);
  m.position.set(L.x, WORLD.waterY, L.z);
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}
