// FUR: real geometric fur for BUSHED's skinned creatures. Shell fur (8-24 shells of the fur-bearing triangles pushed
// out along their skinned normals, ONE instanced draw call per creature) with crisp pixel-art strands that line up
// with the painted page, gathered into tufts, darker at the roots, lighter at the tips; silhouette fin cards stand
// up where the skin turns edge-on (a second, small draw, only up close). The fur page (anatomy BuildOpts.fur, one
// texel per page texel: R density, G length, B clump, A tip) says where fur grows and how; without one, `where`
// does. FUR PHYSICS: spring groups (the body, the tail, the ears...) follow their bones' acceleration, the wind
// (G.uWindDir/uWindStrength/uGust), air drag and a `shake`; the outer shells bend the most. LOD: fewer shells
// with distance, none beyond `lod[2]` m. Wet and snow tint hooks (follow G.uWet / G.uSnow unless set).
//
//   const fur = addFur(hound.mesh, { length: 0.05, mask: model.fur, springs: [{ bones: ['tail2'] }] });
//   fur.update(dt);                  // every frame, after the creature has posed its skeleton
//   fur.shake(1);                    // a wet dog shake
//   dissolve(mat, depth, ...fur.materials);     // fur that fades with its creature (fade.ts)
import * as THREE from 'three';
import { G } from '../../gfx/globals';
import { FUR_VERT_PARS, FUR_VERT, FUR_FRAG_PARS, FUR_FRAG } from './shader';

export type V3 = [number, number, number];
export interface FurSpring {
  /** bone names: the group is these bones and everything below them; it tracks their mean position */
  bones: string[];
  /** spring rate in Hz (default the spec's) */
  hz?: number;
  /** how far acceleration throws it, relative to the spec's (default 1) */
  inertia?: number;
}
export interface FurSpec {
  /** the fur's length (m) where the fur page's length is 1 (or `where` returns 1) */
  length: number;
  /** most shells (8..24), default 16 */
  shells?: number;
  /** the fur page (same layout as the colour page): R density, G length, B clump, A tip. When given, `where` only
   *  gates triangles (0 = none) and the length comes from the page */
  mask?: THREE.Texture | null;
  /** per vertex (rest pose, creature space; its dominant bone): 0 bare .. 1 full length. Default 1 everywhere
   *  (or wherever the mask has fur) */
  where?: (p: V3, n: V3, bone: number) => number;
  /** the combing: which way the fur lies at a vertex (creature space, in fur lengths; 0 stands straight out).
   *  A vector for all, or a function. Default [0, -0.15, -0.45] (back and a little down) */
  comb?: V3 | ((p: V3, n: V3, bone: number) => V3);
  /** the colour page the strands take their colour from (default the mesh material's map) */
  map?: THREE.Texture | null;
  /** page texels per strand (1 = every texel a strand; 2 = 2x2 texels) */
  strand?: number;
  /** strands across a tuft (default 5) */
  clump?: number;
  /** 0..1 how hard tufts gather to points toward their tips (default 0.55) */
  clumpPull?: number;
  /** 0..1 how many strands grow (default 0.8) */
  density?: number;
  /** colour multiplier at the roots (self-shadow), default 0.5 */
  rootDark?: number;
  /** the tips' tint (a multiplier, > 1 lightens) and its strength 0..1 */
  tip?: THREE.ColorRepresentation; tipK?: number;
  /** spring rate (Hz, default 2.6), damping ratio (default 0.28) */
  hz?: number; damping?: number;
  /** bend (fur lengths) per m/s^2 of acceleration (default 0.05) */
  inertia?: number;
  /** air drag: bend per m/s of speed (default 0.05) */
  drag?: number;
  /** gravity sag in fur lengths (default 0.25) */
  droop?: number;
  /** wind response (default 0.6) */
  wind?: number;
  /** up to three groups that swing on their own (group 0 is everything else, on the root bone) */
  springs?: FurSpring[];
  /** silhouette fin cards: 0 none .. 1 one per fur root (default 0.5) */
  fins?: number;
  /** [full detail within, fewest shells by, no fur beyond] metres (default [5, 24, 40]); fins only within lod[0]*2.5 */
  lod?: [number, number, number];
  /** fewest shells at distance (default 4) */
  minShells?: number;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3();

interface Group { bones: THREE.Bone[]; prev: THREE.Vector3; vel: THREE.Vector3; acc: THREE.Vector3; x: THREE.Vector3; v: THREE.Vector3; hz: number; inertia: number; init: boolean }

/** a creature's fur: the shell mesh (and fin mesh) ride on the creature's skinned mesh as children */
export class Fur {
  readonly shells: THREE.SkinnedMesh;
  readonly fins: THREE.SkinnedMesh | null;
  readonly material: THREE.MeshStandardMaterial;
  readonly finMaterial: THREE.MeshStandardMaterial | null;
  /** both materials (for dissolve() and the like) */
  readonly materials: THREE.MeshStandardMaterial[];
  readonly spec: FurSpec;
  /** 0..1 soaked; null follows G.uWet */
  wet: number | null = null;
  /** 0..1 snow on the coat; null follows G.uSnow */
  snow: number | null = null;
  /** where LOD is measured from (default the camera position in G.uCamPos) */
  eye: THREE.Vector3 | null = null;
  /** the shells drawn last update and the distance they were chosen for */
  shellCount = 0; distance = 0;
  /** fur-bearing triangles, fin cards */
  readonly tris: number; readonly cards: number;
  private U: Record<string, { value: unknown }>;
  private groups: Group[] = [];
  private shakeA = 0; private shakeT = 0; private t = 0;
  private base: THREE.SkinnedMesh;
  private maxShells: number;

  constructor(base: THREE.SkinnedMesh, spec: FurSpec) {
    this.base = base; this.spec = spec;
    this.maxShells = Math.max(2, Math.min(32, Math.round(spec.shells ?? 16)));
    const geo = base.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute, nor = geo.getAttribute('normal') as THREE.BufferAttribute, uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute, sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
    const nv = pos.count;
    const bones = base.skeleton.bones;
    const mapTex = (spec.map ?? (base.material as THREE.MeshStandardMaterial).map) as THREE.Texture;
    const mask = spec.mask ?? null;
    const mimg = mask ? (mask.image as { data: Uint8Array; width: number; height: number }) : null;
    const timg = mapTex.image as { width: number; height: number };

    // ---- spring groups: each bone belongs to the first listed group above it
    const groupOf = new Int8Array(bones.length);
    const springs = (spec.springs ?? []).slice(0, 3);
    springs.forEach((s, gi) => {
      for (let b = 0; b < bones.length; b++) {
        if (groupOf[b]) continue;
        for (let o: THREE.Object3D | null = bones[b]; o && (o as THREE.Bone).isBone; o = o.parent) if (s.bones.includes(o.name)) { groupOf[b] = gi + 1; break; }
      }
    });
    this.groups.push(this.mkGroup([bones[0]], spec.hz ?? 2.6, 1));
    springs.forEach((s, gi) => { const bs = bones.filter((_, b) => groupOf[b] === gi + 1); this.groups.push(this.mkGroup(bs.length ? bs : [bones[0]], s.hz ?? spec.hz ?? 2.6, s.inertia ?? 1)); });

    // ---- per vertex: length, spring group, combing
    const aLen = new Float32Array(nv), aSpr = new Float32Array(nv), aComb = new Float32Array(nv * 3);
    const P: V3 = [0, 0, 0], N: V3 = [0, 0, 0];
    const combFn = typeof spec.comb === 'function' ? spec.comb : null, combV: V3 = (Array.isArray(spec.comb) ? spec.comb : [0, -0.15, -0.45]) as V3;
    const R = mimg ? Math.max(1, Math.round(Math.min(mimg.width, mimg.height) / 512)) * 2 : 0;
    for (let i = 0; i < nv; i++) {
      P[0] = pos.getX(i); P[1] = pos.getY(i); P[2] = pos.getZ(i); N[0] = nor.getX(i); N[1] = nor.getY(i); N[2] = nor.getZ(i);
      let bone = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bone = si.getComponent(i, k); } }
      let L = spec.where ? spec.where(P, N, bone) : 1;
      if (mimg && L > 0) {
        // the longest fur on the page round this vertex (so a triangle's shells reach its longest strand)
        const cx = Math.floor(uv.getX(i) * mimg.width), cy = Math.floor(uv.getY(i) * mimg.height);
        let mx = 0;
        for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
          if (x < 0 || y < 0 || x >= mimg.width || y >= mimg.height) continue;
          const o = (y * mimg.width + x) * 4;
          if (mimg.data[o] > 12) mx = Math.max(mx, mimg.data[o + 1] / 255);
        }
        L = mx;
      }
      aLen[i] = Math.max(0, L);
      aSpr[i] = groupOf[bone] ?? 0;
      const c = combFn ? combFn(P, N, bone) : combV;
      aComb[i * 3] = c[0]; aComb[i * 3 + 1] = c[1]; aComb[i * 3 + 2] = c[2];
    }
    // ---- the fur-bearing triangles (sharing the base geometry's buffers: only an index and three attributes are new)
    const idx = geo.index!, tri: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (Math.max(aLen[a], aLen[b], aLen[c]) > 0.02) tri.push(a, b, c);
    }
    this.tris = tri.length / 3;
    const sg = new THREE.InstancedBufferGeometry();
    for (const [k, a] of [['position', pos], ['normal', nor], ['uv', uv], ['skinIndex', si], ['skinWeight', sw]] as const) sg.setAttribute(k, a);
    sg.setAttribute('aFurLen', new THREE.BufferAttribute(aLen, 1));
    sg.setAttribute('aSpring', new THREE.BufferAttribute(aSpr, 1));
    sg.setAttribute('aComb', new THREE.BufferAttribute(aComb, 3));
    sg.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
    sg.instanceCount = this.maxShells;
    sg.boundingSphere = geo.boundingSphere?.clone() ?? null;

    // ---- uniforms (shared by shells and fins)
    const tip = new THREE.Color(spec.tip ?? 0xffffff); if (spec.tip === undefined) tip.multiplyScalar(1.35);
    this.U = {
      uFurLen: { value: spec.length }, uShells: { value: this.maxShells }, uDroop: { value: spec.droop ?? 0.25 }, uFurTime: { value: 0 }, uShake: { value: 0 },
      uFurWet: { value: 0 }, uFurSnow: { value: 0 },
      uBend: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uGrav: { value: new THREE.Vector3(0, -1, 0) }, uWindObj: { value: new THREE.Vector3() },
      uFurMask: { value: mask }, uFurTex: { value: new THREE.Vector4(timg.width, timg.height, spec.strand ?? 1, spec.clump ?? 5) },
      uFurK: { value: new THREE.Vector4(spec.density ?? 0.8, spec.clumpPull ?? 0.55, spec.rootDark ?? 0.5, mask ? 1 : 0) },
      uTipCol: { value: tip }, uTipK: { value: spec.tipK ?? 0.6 },
    };
    this.material = this.mkMaterial(mapTex, false);
    this.shells = new THREE.SkinnedMesh(sg, this.material);
    this.shells.name = 'fur';
    this.shells.bind(base.skeleton, base.bindMatrix);
    this.shells.frustumCulled = false; this.shells.castShadow = false; this.shells.receiveShadow = true;
    base.add(this.shells);

    // ---- fin cards on a sample of the roots (one per distinct position)
    const finK = spec.fins ?? 0.5;
    let cards = 0;
    this.fins = null; this.finMaterial = null;
    if (finK > 0 && tri.length) {
      const edge = new Float32Array(nv), cnt = new Uint16Array(nv);
      for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = tri[t + e], b = tri[t + (e + 1) % 3];
        const d = Math.hypot(pos.getX(a) - pos.getX(b), pos.getY(a) - pos.getY(b), pos.getZ(a) - pos.getZ(b));
        edge[a] += d; cnt[a]++; edge[b] += d; cnt[b]++;
      }
      const seen = new Set<string>(), roots: number[] = [];
      for (let i = 0; i < nv; i++) {
        if (!cnt[i] || aLen[i] < 0.25) continue;
        const key = Math.round(pos.getX(i) * 2000) + ',' + Math.round(pos.getY(i) * 2000) + ',' + Math.round(pos.getZ(i) * 2000);
        if (seen.has(key)) continue; seen.add(key);
        if (hashI(i) < finK) roots.push(i);
      }
      cards = roots.length;
      if (cards) {
        const n4 = cards * 4;
        const fp = new Float32Array(n4 * 3), fnn = new Float32Array(n4 * 3), fuv = new Float32Array(n4 * 2), fsi = new Uint16Array(n4 * 4), fsw = new Float32Array(n4 * 4);
        const fl = new Float32Array(n4), fs = new Float32Array(n4), fc = new Float32Array(n4 * 3), fa = new Float32Array(n4 * 3), fi: number[] = [];
        roots.forEach((r, k) => {
          const w = (edge[r] / cnt[r]) * 1.5;
          for (let c = 0; c < 4; c++) {
            const o = k * 4 + c;
            fp[o * 3] = pos.getX(r); fp[o * 3 + 1] = pos.getY(r); fp[o * 3 + 2] = pos.getZ(r);
            fnn[o * 3] = nor.getX(r); fnn[o * 3 + 1] = nor.getY(r); fnn[o * 3 + 2] = nor.getZ(r);
            fuv[o * 2] = uv.getX(r); fuv[o * 2 + 1] = uv.getY(r);
            for (let j = 0; j < 4; j++) { fsi[o * 4 + j] = si.getComponent(r, j); fsw[o * 4 + j] = sw.getComponent(r, j); }
            fl[o] = aLen[r]; fs[o] = aSpr[r]; fc[o * 3] = aComb[r * 3]; fc[o * 3 + 1] = aComb[r * 3 + 1]; fc[o * 3 + 2] = aComb[r * 3 + 2];
            fa[o * 3] = c === 1 || c === 2 ? 1 : 0; fa[o * 3 + 1] = c >= 2 ? 1 : 0; fa[o * 3 + 2] = w;
          }
          const b = k * 4; fi.push(b, b + 1, b + 2, b, b + 2, b + 3);
        });
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('normal', new THREE.BufferAttribute(fnn, 3)); fg.setAttribute('uv', new THREE.BufferAttribute(fuv, 2));
        fg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(fsi, 4)); fg.setAttribute('skinWeight', new THREE.BufferAttribute(fsw, 4));
        fg.setAttribute('aFurLen', new THREE.BufferAttribute(fl, 1)); fg.setAttribute('aSpring', new THREE.BufferAttribute(fs, 1)); fg.setAttribute('aComb', new THREE.BufferAttribute(fc, 3)); fg.setAttribute('aFin', new THREE.BufferAttribute(fa, 3));
        fg.setIndex(n4 > 65535 ? new THREE.Uint32BufferAttribute(fi, 1) : new THREE.Uint16BufferAttribute(fi, 1));
        fg.boundingSphere = geo.boundingSphere?.clone() ?? null;
        this.finMaterial = this.mkMaterial(mapTex, true);
        this.fins = new THREE.SkinnedMesh(fg, this.finMaterial);
        this.fins.name = 'furFins';
        this.fins.bind(base.skeleton, base.bindMatrix);
        this.fins.frustumCulled = false; this.fins.castShadow = false; this.fins.receiveShadow = true;
        base.add(this.fins);
      }
    }
    this.cards = cards;
    this.materials = this.finMaterial ? [this.material, this.finMaterial] : [this.material];
    this.shellCount = this.maxShells;
  }

  private mkGroup(bones: THREE.Bone[], hz: number, inertia: number): Group {
    return { bones, prev: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), x: new THREE.Vector3(), v: new THREE.Vector3(), hz, inertia, init: false };
  }
  private mkMaterial(map: THREE.Texture, fin: boolean): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, side: fin ? THREE.DoubleSide : THREE.FrontSide });
    const U = this.U;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = (fin ? '#define FUR_FIN\n' : '') + sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + FUR_VERT_PARS)
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + FUR_VERT);
      sh.fragmentShader = (fin ? '#define FUR_FIN\n' : '') + sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FUR_FRAG_PARS)
        .replace('#include <map_fragment>', FUR_FRAG);
    };
    mat.customProgramCacheKey = () => (fin ? 'bushed-fur-fin' : 'bushed-fur-shell');
    return mat;
  }

  /** a shake (a wet dog, a startled bigfoot): 0..1+ */
  shake(a = 1) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = 0; }
  /** fur lengths of bend right now (debugging, tests): the body group's spring */
  get bend(): number { return this.groups[0].x.length(); }

  /** every frame, after the creature posed its skeleton. rootVel (world m/s) replaces the root's measured velocity;
   *  wind (world, 0..1 per axis) replaces the global wind */
  update(dt: number, rootVel?: THREE.Vector3 | null, wind?: THREE.Vector3 | null) {
    dt = Math.min(0.05, Math.max(0, dt));
    this.t += dt;
    const base = this.base, U = this.U;
    base.updateWorldMatrix(true, true);
    base.getWorldQuaternion(_q).invert();
    // ---- LOD
    const eye = this.eye ?? G.uCamPos.value;
    base.getWorldPosition(_p);
    const d = this.distance = eye.distanceTo(_p);
    const [l0, l1, l2] = this.spec.lod ?? [5, 24, 40];
    const minS = Math.min(this.maxShells, this.spec.minShells ?? 4);
    const k = d <= l0 ? this.maxShells : Math.round(this.maxShells + (minS - this.maxShells) * Math.min(1, (d - l0) / Math.max(1e-3, l1 - l0)));
    this.shellCount = d > l2 ? 0 : Math.max(1, k);
    this.shells.visible = this.shellCount > 0;
    (this.shells.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(1, this.shellCount);
    U.uShells.value = Math.max(1, this.shellCount);
    if (this.fins) this.fins.visible = this.shellCount > 0 && d < l0 * 2.5;
    if (!this.shellCount) return;
    // ---- the wind (world): direction x strength, breathing with the gusts
    const ws = G.uWindStrength.value, gust = 0.6 + 0.4 * Math.sin(G.uGust.value * 1.7 + _p.x * 0.05 + _p.z * 0.04);
    const W = wind ? _w.copy(wind) : _w.set(G.uWindDir.value.x, 0, G.uWindDir.value.y).multiplyScalar(ws * gust);
    const windK = this.spec.wind ?? 0.6, drag = this.spec.drag ?? 0.05, inert = this.spec.inertia ?? 0.05, zeta = this.spec.damping ?? 0.28;
    // the shake: a fast side-to-side force in the creature's own frame, dying away
    this.shakeT += dt;
    this.shakeA *= Math.exp(-2.2 * dt);
    const sideways = Math.sin(this.shakeT * Math.PI * 2 * 6.5) * this.shakeA * 1.4;
    const toWorld = _q2.copy(_q).invert();
    // ---- springs
    for (let gi = 0; gi < this.groups.length; gi++) {
      const g = this.groups[gi];
      _v.set(0, 0, 0);
      for (const b of g.bones) { b.getWorldPosition(_p); _v.add(_p); }
      _v.multiplyScalar(1 / Math.max(1, g.bones.length));
      if (!g.init || dt <= 0) { g.prev.copy(_v); g.vel.set(0, 0, 0); g.acc.set(0, 0, 0); g.init = true; continue; }
      const vNew = _p.copy(_v).sub(g.prev).multiplyScalar(1 / dt);
      if (gi === 0 && rootVel) vNew.copy(rootVel);
      // acceleration, smoothed (finite differences of a posed skeleton are noisy)
      const a = vNew.clone().sub(g.vel).multiplyScalar(1 / dt);
      if (a.lengthSq() > 2500) a.setLength(50);
      g.acc.lerp(a, 1 - Math.exp(-18 * dt));
      g.vel.copy(vNew); g.prev.copy(_v);
      const w = Math.PI * 2 * g.hz, w2 = w * w;
      // where it would settle: blown by the wind, swept back by its own speed, thrown by its acceleration
      const tx = W.x * windK - g.vel.x * drag - g.acc.x * inert * g.inertia;
      const ty = W.y * windK - g.vel.y * drag * 0.5 - g.acc.y * inert * g.inertia;
      const tz = W.z * windK - g.vel.z * drag - g.acc.z * inert * g.inertia;
      const fx = w2 * (tx - g.x.x) - 2 * zeta * w * g.v.x, fy = w2 * (ty - g.x.y) - 2 * zeta * w * g.v.y, fz = w2 * (tz - g.x.z) - 2 * zeta * w * g.v.z;
      g.v.x += fx * dt; g.v.y += fy * dt; g.v.z += fz * dt;
      if (this.shakeA > 0.01) { _w.set(sideways * w2 * 0.6, 0, 0).applyQuaternion(toWorld); g.v.addScaledVector(_w, dt); }
      g.x.addScaledVector(g.v, dt);
      if (g.x.lengthSq() > 1.21) g.x.setLength(1.1);
      (U.uBend.value as THREE.Vector3[])[gi].copy(g.x).applyQuaternion(_q);
    }
    (U.uGrav.value as THREE.Vector3).set(0, -1, 0).applyQuaternion(_q);
    (U.uWindObj.value as THREE.Vector3).copy(wind ?? _w.set(G.uWindDir.value.x, 0, G.uWindDir.value.y).multiplyScalar(ws * gust)).multiplyScalar(windK * 0.35).applyQuaternion(_q);
    U.uShake.value = Math.min(1.5, this.shakeA);
    U.uFurTime.value = this.t;
    U.uFurWet.value = this.wet ?? G.uWet.value;
    U.uFurSnow.value = this.snow ?? G.uSnow.value;
  }
  /** remove from the creature and free the GPU buffers it owns */
  dispose() {
    this.shells.removeFromParent(); this.fins?.removeFromParent();
    // the shells share the creature's position/normal/uv/skin buffers: let go of those before disposing
    const sg = this.shells.geometry as THREE.InstancedBufferGeometry;
    for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) sg.deleteAttribute(k);
    sg.dispose(); this.fins?.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** grow fur on a skinned creature mesh (see FurSpec); call fur.update(dt) every frame */
export function addFur(mesh: THREE.SkinnedMesh, spec: FurSpec): Fur { return new Fur(mesh, spec); }

function hashI(i: number) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
