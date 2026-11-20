// The matte pass: one painterly shading model for everything in the world, applied centrally after load (the
// Renderer runs it on new materials as they appear, so every place, prop, creature and tool is covered).
//   - roughness >= 0.85 (a little lower when soaked); no metalness except real bare metal (named steel, iron, axe,
//     saw... or metal in a surface map), which keeps a dull satin sheen
//   - environment reflections down to a whisper, no clearcoat / sheen / glossy phong
//   - soft wrapped diffuse: the light rolls round forms instead of cutting off at the terminator
//   - intentional small highlights survive: very low roughness from a roughness map (bead eyes, wet noses), and
//     materials named eye / glint / nose / glass / water / lake, or marked userData.keepGloss
//   - colour maps sample with a slight negative mip bias and 8x anisotropy (crisper texels at game distance), plus
//     a faint world-space paint grain up close that fades out before it could shimmer
import * as THREE from 'three';
import { G } from './globals';

const KEEP = /eye|glint|cornea|pupil|nose|glass|window|bottle|jar|water|lake|ice|lens|mirror|chrome_keep/i;
const METAL = /metal|steel|iron|blade|axe|saw|knife|tin\b|chrome|brass|copper|rifle|barrel|gun|anvil|tong|hammer|nail|wire|bolt|hinge|kettle|pot\b|pan\b|stove|tool/i;
/** materials that own their look: the terrain and lake shaders, the kitchen's food, fat and liquids */
const SKIP = /^(terrain|water)$|cook|fat|produce|liquid|food|broth|soup|stew/i;

const done = new WeakSet<THREE.Material>();
const upTex = new WeakSet<THREE.Texture>();

const GRAIN = /* glsl */`
varying vec3 vMatteW;
float mtH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float mtN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mtH(i), mtH(i + vec3(1, 0, 0)), f.x), mix(mtH(i + vec3(0, 1, 0)), mtH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mtH(i + vec3(0, 0, 1)), mtH(i + vec3(1, 0, 1)), f.x), mix(mtH(i + vec3(0, 1, 1)), mtH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
`;

function sharpen(t: THREE.Texture | null | undefined, aniso: number): void {
  if (!t || upTex.has(t)) return;
  upTex.add(t);
  if (t.anisotropy < aniso && t.minFilter !== THREE.NearestFilter && t.generateMipmaps !== false) { t.anisotropy = aniso; t.needsUpdate = true; }
}

function matteOne(m: THREE.Material, owner: THREE.Object3D, aniso: number): void {
  done.add(m);
  const std = m as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial;
  if (SKIP.test(m.name) || (m as THREE.ShaderMaterial).isShaderMaterial || m.userData.noMatte) return;
  const keep = !!m.userData.keepGloss || KEEP.test(m.name) || KEEP.test(owner.name) || (m.transparent && m.opacity < 0.9);
  if ((m as THREE.MeshPhongMaterial).isMeshPhongMaterial) {
    const p = m as THREE.MeshPhongMaterial;
    if (!keep) { p.shininess = Math.min(p.shininess, 6); p.specular.multiplyScalar(0.15); }
    sharpen(p.map, aniso);
    return;
  }
  if (!std.isMeshStandardMaterial) return;
  sharpen(std.map, aniso);
  if (keep) return;
  const metal = METAL.test(m.name) || METAL.test(owner.name);
  const hasRMap = !!std.roughnessMap, hasMMap = !!std.metalnessMap;
  const minR = metal ? 0.6 : 0.85;
  std.roughness = Math.max(std.roughness, hasRMap ? std.roughness : minR);
  if (!metal && !hasMMap) std.metalness = 0;
  else if (metal && !hasMMap) std.metalness = Math.min(std.metalness, 0.6);
  std.envMapIntensity = Math.min(std.envMapIntensity ?? 1, 0.25);
  if (std.isMeshPhysicalMaterial) { std.clearcoat = 0; std.sheen = 0; std.specularIntensity = Math.min(std.specularIntensity ?? 1, 0.4); }
  const prev = std.onBeforeCompile;
  const prevKey = std.customProgramCacheKey;
  // the default key is the hook's source: capture it now, before the hook is wrapped
  const baseKey = prevKey === THREE.Material.prototype.customProgramCacheKey ? prev.toString() : null;
  const tag = `|matte${metal ? 'M' : ''}${hasRMap ? 'R' : ''}${hasMMap ? 'm' : ''}`;
  std.onBeforeCompile = (sh, r) => {
    prev.call(std, sh, r);
    sh.uniforms.uMatteWet = G.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMatteW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 mtW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mtW = instanceMatrix * mtW;
          #endif
          vMatteW = (modelMatrix * mtW).xyz;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uMatteWet;\n${GRAIN}`)
      .replace('vec4 sampledDiffuseColor = texture2D( map, vMapUv );', 'vec4 sampledDiffuseColor = texture( map, vMapUv, -0.45 );')
      .replace('#include <normal_fragment_begin>', `
        // matte: rough, non-metallic, except the tiny glossy bits a roughness map asks for (eyes, noses)
        ${hasRMap ? 'roughnessFactor = roughnessFactor < 0.22 ? roughnessFactor : max(roughnessFactor, ' + minR.toFixed(2) + ' - 0.12 * uMatteWet);'
          : 'roughnessFactor = max(roughnessFactor, ' + minR.toFixed(2) + ' - 0.12 * uMatteWet);'}
        ${hasMMap ? 'metalnessFactor = metalnessFactor > 0.6 ? min(metalnessFactor, 0.7) : 0.0;' : ''}
        {
          // paint grain up close (fades out with the pixel footprint, so it never shimmers)
          vec3 gp = vMatteW * 18.0;
          float fw = length(fwidth(gp));
          float gn = mtN(gp) * 0.65 + mtN(gp * 2.3 + 5.0) * 0.35;
          diffuseColor.rgb *= 1.0 + (gn - 0.5) * 0.1 * (1.0 - smoothstep(0.35, 1.1, fw));
        }
        #include <normal_fragment_begin>`)
      .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\n\tvec3 irradiance = dotNL * directLight.color;',
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\n\tvec3 irradiance = saturate( ( dot( geometryNormal, directLight.direction ) + 0.3 ) / 1.3 ) * directLight.color;'));
  };
  std.customProgramCacheKey = () => (baseKey ?? prevKey.call(std)) + tag;
  std.needsUpdate = true;
}

/**
 * Watch a scene: objects added to it are queued and given the matte model on the next flush (no per-frame sweeps
 * over the whole scene; a slow safety sweep catches children added deeper inside groups later).
 */
export class MatteWatcher {
  private queue: THREE.Object3D[] = [];
  private roots = new Set<THREE.Object3D>();
  private sweepAt = 0;
  watch(root: THREE.Object3D): void {
    if (this.roots.has(root)) return;
    this.roots.add(root);
    this.queue.push(root);
    root.addEventListener('childadded', (e) => { this.queue.push((e as unknown as { child: THREE.Object3D }).child); });
  }
  flush(frame: number, aniso: number): void {
    if (frame >= this.sweepAt) { this.sweepAt = frame + 900; for (const r of this.roots) this.queue.push(r); }
    while (this.queue.length) mattePass(this.queue.pop()!, aniso);
  }
}

/** apply the matte model to every not-yet-seen material under root */
export function mattePass(root: THREE.Object3D, aniso = 8): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (m && !done.has(m)) { matteOne(m, o, aniso); n++; }
  });
  return n;
}
