// A dithered dissolve for a creature's material (and its shadow-casting depth material): an ordered 4x4 Bayer
// threshold against `fade`, so a creature can come and go in the fog without alpha blending (the renderer's own
// dither and grain hide the pattern). Chains onto whatever onBeforeCompile the material already has.
//   const fade = dissolve(mat, depth); fade.value = 0.4;
import type * as THREE from 'three';

const DITHER = `
uniform float uFade;
float bayerA(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayerA(0.5 * a) * 0.25 + bayerA(a); }`;
const CLIP = `
if (uFade < 0.999 && uFade <= bayer4(gl_FragCoord.xy) * 0.94 + 0.03) discard;`;

export function dissolve(...mats: THREE.Material[]): { value: number } {
  const u = { value: 1 };
  for (const m of mats) {
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.uFade = u;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>' + DITHER)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + CLIP);
    };
    m.customProgramCacheKey = () => key + '-dissolve';
    m.needsUpdate = true;
  }
  return u;
}
