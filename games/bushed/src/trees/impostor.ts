// Far LOD: cross-billboard impostors (3 vertical planes at 60 degrees), each plane showing the tree rendered from
// its own direction. Albedo (with the baked crown AO from vertex colours) and view-space normals are baked into two
// shared atlases at startup, so distant trees are lit dynamically like the near ones.
import * as THREE from 'three';
import { barkTexture, foliageTexture } from './textures';
import { patchTreeMaterial, treeDepthMaterial, ALWAYS, type TreeUniforms } from './materials';
import type { TreeModel } from './build';

export const IMP = { cellW: 128, cellH: 256, cols: 16, rows: 8, views: 3 };

export interface Impostor { geometry: THREE.BufferGeometry; slot: number }

const NORMAL_VS = /* glsl */ `
varying vec3 vN; varying vec2 vUv; varying vec3 vCol;
attribute vec3 color;
void main() { vUv = uv; vCol = color; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const NORMAL_FS = /* glsl */ `
uniform sampler2D map; uniform float useMap;
varying vec3 vN; varying vec2 vUv;
void main() {
  if (useMap > 0.5 && texture2D(map, vUv).a < 0.5) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing && useMap < 0.5) n = -n;
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}`;

export class ImpostorAtlas {
  albedo: THREE.WebGLRenderTarget;
  normal: THREE.WebGLRenderTarget;
  material: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial;
  uniforms: TreeUniforms;
  private next = 0;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private scene = new THREE.Scene();

  constructor() {
    const W = IMP.cellW * IMP.cols, H = IMP.cellH * IMP.rows;
    const mk = (srgb: boolean) => {
      const rt = new THREE.WebGLRenderTarget(W, H, {
        generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.NearestFilter,
        depthBuffer: true, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
      });
      return rt;
    };
    this.albedo = mk(true);
    this.normal = mk(false);
    this.material = new THREE.MeshStandardMaterial({
      map: this.albedo.texture, normalMap: this.normal.texture, alphaTest: 0.5, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0, vertexColors: false,
    });
    this.material.name = 'tree_impostor';
    this.uniforms = { uWindAmt: { value: 1 }, uLod: { value: ALWAYS.clone() } };
    patchTreeMaterial(this.material, 'impostor', this.uniforms);
    this.depth = treeDepthMaterial('impostor', this.uniforms, this.albedo.texture);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
  }

  /** a material for a LOD band (shares the atlas, own fade uniforms) */
  lodMaterial(lod: THREE.Vector4): { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
    const u: TreeUniforms = { uWindAmt: { value: 1 }, uLod: { value: lod.clone() } };
    const mat = this.material.clone();
    patchTreeMaterial(mat, 'impostor', u);
    return { mat, depth: treeDepthMaterial('impostor', u, this.albedo.texture) };
  }

  /** render a tree into the atlas (3 views) and return its cross-billboard geometry */
  bake(renderer: THREE.WebGLRenderer, model: TreeModel, flex: number): Impostor | null {
    if (this.next + IMP.views > IMP.cols * IMP.rows) return null;
    const slot = this.next;
    this.next += IMP.views;
    const lod = model.lod(0);
    const sp = model.species;
    const albedoBark = new THREE.MeshBasicMaterial({ map: barkTexture(sp), vertexColors: true });
    const albedoLeaf = new THREE.MeshBasicMaterial({ map: foliageTexture(sp), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const nBark = new THREE.ShaderMaterial({ vertexShader: NORMAL_VS, fragmentShader: NORMAL_FS, uniforms: { map: { value: null }, useMap: { value: 0 } } });
    const nLeaf = new THREE.ShaderMaterial({ vertexShader: NORMAL_VS, fragmentShader: NORMAL_FS, side: THREE.DoubleSide, uniforms: { map: { value: foliageTexture(sp) }, useMap: { value: 1 } } });
    const bark: THREE.Mesh = new THREE.Mesh(lod.bark, albedoBark as THREE.Material);
    const leaf: THREE.Mesh | null = lod.foliage ? new THREE.Mesh(lod.foliage, albedoLeaf as THREE.Material) : null;
    const grp = new THREE.Group();
    grp.add(bark);
    if (leaf) grp.add(leaf);
    this.scene.add(grp);
    // frame: cell aspect 1:2 -> frustum height fh, width fh / 2
    const hgt = model.height * 1.03 + 0.6;
    const fh = Math.max(hgt, model.crownRadius * 2.15 * 2);
    const fw = fh / 2;
    const y0 = -0.6;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    const prevShadow = renderer.shadowMap.enabled;
    renderer.autoClear = false;
    renderer.shadowMap.enabled = false;
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    const cam = this.cam;
    cam.left = -fw / 2; cam.right = fw / 2; cam.top = fh; cam.bottom = 0;
    cam.near = 0.1; cam.far = 400;
    cam.updateProjectionMatrix();
    for (let v = 0; v < IMP.views; v++) {
      const cell = slot + v;
      const cx = cell % IMP.cols, cy = Math.floor(cell / IMP.cols);
      const ang = (v / IMP.views) * Math.PI; // 0, 60, 120 degrees
      const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
      cam.position.set(dir.x * 200, y0, dir.z * 200);
      cam.lookAt(0, y0, 0);
      cam.updateMatrixWorld();
      for (const [rt, mb, ml, clear] of [
        [this.albedo, albedoBark, albedoLeaf, 0x2a3320],
        [this.normal, nBark, nLeaf, 0x8080ff],
      ] as [THREE.WebGLRenderTarget, THREE.Material, THREE.Material, number][]) {
        (bark as THREE.Mesh).material = mb;
        if (leaf) (leaf as THREE.Mesh).material = ml;
        rt.viewport.set(cx * IMP.cellW, cy * IMP.cellH, IMP.cellW, IMP.cellH);
        rt.scissor.set(cx * IMP.cellW, cy * IMP.cellH, IMP.cellW, IMP.cellH);
        rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        renderer.setClearColor(clear, 0);
        renderer.clear(true, true, false);
        renderer.render(this.scene, cam);
      }
    }
    this.albedo.scissorTest = false;
    this.normal.scissorTest = false;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = prevAuto;
    renderer.shadowMap.enabled = prevShadow;
    renderer.toneMapping = prevTone;
    this.scene.remove(grp);
    albedoBark.dispose(); albedoLeaf.dispose(); nBark.dispose(); nLeaf.dispose();
    // cross-billboard geometry
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], wind: number[] = [], idx: number[] = [];
    const W = IMP.cellW * IMP.cols, Hh = IMP.cellH * IMP.rows;
    for (let v = 0; v < IMP.views; v++) {
      const cell = slot + v;
      const cx = cell % IMP.cols, cy = Math.floor(cell / IMP.cols);
      const u0 = (cx * IMP.cellW + 0.5) / W, u1 = ((cx + 1) * IMP.cellW - 0.5) / W;
      const v0 = (cy * IMP.cellH + 0.5) / Hh, v1 = ((cy + 1) * IMP.cellH - 0.5) / Hh;
      const ang = (v / IMP.views) * Math.PI;
      const n = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
      const r = new THREE.Vector3(n.z, 0, -n.x); // camera right when looking along -n
      const b = pos.length / 3;
      for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        pos.push(r.x * sx * fw / 2, y0 + sy * fh, r.z * sx * fw / 2);
        nrm.push(n.x, n.y, n.z);
        uv.push(sx < 0 ? u0 : u1, sy > 0 ? v1 : v0);
        const hh = Math.max(0, y0 + sy * fh) / Math.max(1, model.height);
        wind.push(hh * hh * model.height * flex, 0, 0, 0);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return { geometry: g, slot };
  }
}
