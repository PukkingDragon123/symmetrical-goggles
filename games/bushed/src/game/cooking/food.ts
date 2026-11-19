// Food as 3D objects: painted pixel textures (raw and cooked atlases, 128 x 64: the left square is the cut face /
// flesh, the right square the rim / skin / crust), a doneness material (raw -> golden -> browned -> charred, per
// side: the face against the pan cooks first, so a flip shows the other side), and geometry for every
// ingredient: peameal bacon loin and slices, eggs (shell, white, yolk), lake trout pieces, bannock dough, game
// meat strips and liquids in pots.
import * as THREE from 'three';
import { Pix, hex, vnoise, fbm, speck, ramp, mix, mul, type RGB } from './paint';

// ---------------------------------------------------------------------------------------------- textures
type Atlas = { raw: THREE.Texture; cooked: THREE.Texture };
const atlases = new Map<string, Atlas>();

/** paint a 128 x 64 atlas: face(x, y) on the left square, rim(x, y) on the right */
function atlas(face: (x: number, y: number, i: number) => RGB, rim: (x: number, y: number, i: number) => RGB): THREE.Texture {
  const p = new Pix(128, 64);
  p.each((x, y) => (x < 64 ? face(x, y, y * 64 + x) : rim(x - 64, y, y * 64 + (x - 64))));
  const t = p.tex({ repeat: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const N = (cell: number, seed: number, oct = 3) => fbm(64, 64, cell, seed, oct);
const S = (seed: number) => speck(64, 64, seed);

function paintAtlases(kind: string): Atlas {
  const a = atlases.get(kind);
  if (a) return a;
  let out: Atlas;
  switch (kind) {
    case 'bacon': {
      // peameal: lean pink pork loin, a few fat seams, rolled in yellow cornmeal
      const n = N(16, 1), m = vnoise(64, 64, 8, 2), sp = S(3), cn = N(8, 4);
      const meatR = ['#b8606a', '#c8707a', '#d6868a', '#e29a98', '#eab0a8'].map(hex);
      const meatC = ['#7a4228', '#8e5232', '#a4663e', '#b87a4c', '#c88e5c'].map(hex);
      const fat = hex('#f2dccf'), fatC = hex('#e8c08a');
      const corn = ['#b8862e', '#d0a040', '#e2b850', '#f0d078'].map(hex);
      const cornC = ['#7a4a18', '#9a6224', '#b87a30', '#d09a44'].map(hex);
      const seam = (x: number, y: number) => Math.abs(Math.sin((x * 0.11 + y * 0.07) * 3 + m[y * 64 + x] * 5)) < 0.06;
      out = {
        raw: atlas((x, y, i) => (seam(x, y) ? fat : ramp(meatR, n[i] * 0.8 + sp[i] * 0.2)), (_x, _y, i) => ramp(corn, cn[i] * 0.6 + sp[i] * 0.4)),
        cooked: atlas((x, y, i) => (seam(x, y) ? fatC : ramp(meatC, n[i] * 0.7 + sp[i] * 0.3)), (_x, _y, i) => ramp(cornC, cn[i] * 0.6 + sp[i] * 0.4)),
      };
      break;
    }
    case 'egg': {
      // face = the white (radial: u,v planar), rim = yolk
      const n = N(16, 11), sp = S(12);
      const wR = ['#c9cbbd', '#d3d5c8', '#dcdccf'].map(hex), wC = ['#ebe6da', '#f3efe6', '#faf7f0'].map(hex);
      const yR = ['#e88a08', '#f29e12', '#f8b424', '#fdd060'].map(hex), yC = ['#e8a838', '#f0b84c', '#f4c862', '#f8dc90'].map(hex);
      out = {
        raw: atlas((_x, _y, i) => ramp(wR, n[i] * 0.7 + sp[i] * 0.3), (_x, y, i) => ramp(yR, (1 - y / 64) * 0.6 + n[i] * 0.4)),
        cooked: atlas((_x, _y, i) => ramp(wC, n[i] * 0.7 + sp[i] * 0.3), (_x, y, i) => ramp(yC, (1 - y / 64) * 0.6 + n[i] * 0.4)),
      };
      break;
    }
    case 'trout': {
      // face = flesh (orange-pink with white flake lines), rim = skin (v: 0 belly .. 0.5 back .. 1 belly)
      const n = N(16, 21), sp = S(22), spots = vnoise(64, 64, 4, 23), mot = N(12, 24);
      const fR = ['#c8604a', '#d87058', '#e48468', '#ee9a7e'].map(hex), fC = ['#d8a888', '#e6b898', '#f0c8aa', '#f6dac0'].map(hex);
      const flake = (x: number, y: number) => ((x + Math.floor(y * 0.25)) % 9) === 0;
      const skinR = (x: number, y: number, i: number): RGB => {
        const back = 1 - Math.abs(y / 64 - 0.5) * 2; // 1 at the back, 0 at the belly
        const belly = ['#c8ccc0', '#b8beb4', '#a8b0a6'].map(hex);
        const side = ['#3a4a40', '#465848', '#56684e', '#687a5a'].map(hex);
        let c = back > 0.45 ? ramp(side, mot[i] * 0.7 + sp[i] * 0.3) : ramp(belly, mot[i]);
        if (back > 0.35 && spots[i] > 0.72) c = hex('#d8d4b0');
        if (back > 0.92) c = mul(c, 0.75);
        void x;
        return c;
      };
      const skinC = (x: number, y: number, i: number): RGB => {
        const c = skinR(x, y, i);
        const g = ramp(['#7a4a22', '#946030', '#ae7a40', '#c89458'].map(hex), n[i] * 0.6 + sp[i] * 0.4);
        return mix(c, g, 0.72);
      };
      out = {
        raw: atlas((x, y, i) => (flake(x, y) ? hex('#f2c8b8') : ramp(fR, n[i] * 0.7 + sp[i] * 0.3)), skinR),
        cooked: atlas((x, y, i) => (flake(x, y) ? hex('#fae8d8') : ramp(fC, n[i] * 0.7 + sp[i] * 0.3)), skinC),
      };
      break;
    }
    case 'dough': case 'dough_berry': {
      const n = N(16, 31), sp = S(32), bl = vnoise(64, 64, 5, 33);
      const dR = ['#d6c8a6', '#e0d4b4', '#e8dec2', '#f2ecdc'].map(hex), dC = ['#9a6828', '#b07e38', '#c49448', '#d8b064'].map(hex);
      const berry = kind === 'dough_berry';
      const b = (i: number, raw: boolean): RGB | null => (berry && bl[i] > 0.8 ? (raw ? hex(sp[i] > 0.5 ? '#3a3a72' : '#58507e') : hex(sp[i] > 0.5 ? '#2c2448' : '#40305a')) : null);
      out = {
        raw: atlas((_x, _y, i) => b(i, true) ?? ramp(dR, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => b(i, true) ?? ramp(dR, n[i] * 0.5 + sp[i] * 0.5)),
        cooked: atlas((_x, _y, i) => b(i, false) ?? ramp(dC, n[i] * 0.6 + sp[i] * 0.4), (_x, _y, i) => b(i, false) ?? ramp(['#c8a060', '#d8b878', '#e4c890', '#ecd8a8'].map(hex), n[i] * 0.5 + sp[i] * 0.5)),
      };
      break;
    }
    case 'meat': {
      const n = N(16, 41), sp = S(42), m = vnoise(64, 64, 6, 43);
      const mR = ['#6a1c1c', '#7e2624', '#92302c', '#a63e36'].map(hex), mC = ['#4a2616', '#5c321e', '#6e3e26', '#824c30'].map(hex);
      const fat = (i: number) => m[i] > 0.78;
      out = {
        raw: atlas((_x, _y, i) => (fat(i) ? hex('#e6d0c2') : ramp(mR, n[i] * 0.7 + sp[i] * 0.3)), (_x, _y, i) => (fat(i) ? hex('#d8c0b0') : ramp(mR, n[i] * 0.5 + sp[i] * 0.3))),
        cooked: atlas((_x, _y, i) => (fat(i) ? hex('#c89a6a') : ramp(mC, n[i] * 0.7 + sp[i] * 0.3)), (_x, _y, i) => ramp(mC, n[i] * 0.5 + sp[i] * 0.3)),
      };
      break;
    }
    default: {
      const t = new Pix(4, 4).each(() => [200, 200, 200]).tex();
      out = { raw: t, cooked: t };
    }
  }
  atlases.set(kind, out);
  return out;
}

let charTex: THREE.Texture | null = null;
function noiseTex(): THREE.Texture {
  if (charTex) return charTex;
  const n = fbm(64, 64, 16, 77, 3), s = speck(64, 64, 78);
  const p = new Pix(64, 64).each((_x, _y, i) => { const v = Math.round((n[i] * 0.7 + s[i] * 0.3) * 255); return [v, v, v]; });
  charTex = p.tex({ repeat: true, srgb: false });
  return charTex;
}

// ---------------------------------------------------------------------------------------------- doneness material
export interface FoodMat extends THREE.MeshStandardMaterial {
  userData: { uTop: { value: number }; uBot: { value: number }; uEdgeK: { value: number }; uOil: { value: number } };
}

/**
 * Raw -> cooked -> browned -> charred, separately for the up-facing (+Y object space) and down-facing sides.
 * aEdge (0..1 vertex attribute, optional) adds doneness at thin edges (lacy egg whites, crisp bacon rims).
 */
export function foodMat(kind: string, o: { rough?: number; transparentRaw?: boolean } = {}): FoodMat {
  const a = paintAtlases(kind);
  const m = new THREE.MeshStandardMaterial({ map: a.raw, roughness: o.rough ?? 0.55, metalness: 0, transparent: !!o.transparentRaw }) as FoodMat;
  m.userData = { uTop: { value: 0 }, uBot: { value: 0 }, uEdgeK: { value: 0.35 }, uOil: { value: 0 } };
  const U = m.userData;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTop = U.uTop; sh.uniforms.uBot = U.uBot; sh.uniforms.uEdgeK = U.uEdgeK; sh.uniforms.uOil = U.uOil;
    sh.uniforms.uCooked = { value: a.cooked }; sh.uniforms.uNoise = { value: noiseTex() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge; varying float vEdge; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTop; uniform float uBot; uniform float uEdgeK; uniform float uOil;
        uniform sampler2D uCooked; uniform sampler2D uNoise; varying float vEdge; varying vec3 vObjN;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dn = mix(uBot, uTop, smoothstep(-0.35, 0.35, vObjN.y)) + vEdge * uEdgeK * max(uTop, uBot);
        vec4 ck = texture2D(uCooked, vMapUv);
        float c1 = smoothstep(0.22, 0.8, dn);
        c1 = floor(c1 * 6.0 + 0.5) / 6.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, ck.rgb, c1);
        diffuseColor.a = mix(diffuseColor.a * ${o.transparentRaw ? '0.62' : '1.0'}, 1.0, smoothstep(0.1, 0.5, dn));
        float nz = texture2D(uNoise, vMapUv * 2.0).r;
        float br = smoothstep(0.98, 1.4, dn + (nz - 0.5) * 0.25);
        br = floor(br * 4.0 + 0.5) / 4.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.36, 0.24), br);
        float ch = step(nz, (dn - 1.3) * 1.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.035, 0.03), ch);
        float doneK = c1;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.32, roughnessFactor, doneK) * (1.0 - uOil * 0.45);`);
  };
  m.customProgramCacheKey = () => `food_${kind}_${o.transparentRaw ? 1 : 0}`;
  return m;
}

// ---------------------------------------------------------------------------------------------- geometry
/** an outline in the XZ plane: a wobbly ellipse */
export function blob(rx: number, rz: number, seed: number, n = 18, wob = 0.08): [number, number][] {
  const r = (k: number) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const ph = [r(1) * 6.28, r(2) * 6.28, r(3) * 6.28];
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wob * (0.6 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.25 * Math.sin(a * 5 + ph[2]));
    out.push([Math.cos(a) * rx * k, Math.sin(a) * rz * k]);
  }
  return out;
}

/**
 * A soft-edged slab: outline (XZ) extruded up by t with rounded top and bottom edges. Caps map to the face square
 * of the atlas (planar), the rim to the rim square. aEdge: 0 at the cap centre .. 1 at the rim. dome lifts the
 * top centre (eggs, dough).
 */
export function slab(outline: [number, number][], t: number, o: { dome?: number; round?: number; faceScale?: number; topOnly?: boolean } = {}): THREE.BufferGeometry {
  const n = outline.length;
  const rd = Math.min(o.round ?? t * 0.35, t * 0.45);
  const fs = o.faceScale ?? Math.max(...outline.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z)))) * 2;
  const P: number[] = [], NN: number[] = [], UV: number[] = [], E: number[] = [];
  const cx = outline.reduce((s, p) => s + p[0], 0) / n, cz = outline.reduce((s, p) => s + p[1], 0) / n;
  const faceUV = (x: number, z: number): [number, number] => [0.25 + (x / fs) * 0.48, 0.5 + (z / fs) * 0.96];
  const push = (p: THREE.Vector3, nn: THREE.Vector3, uv: [number, number], e: number) => { P.push(p.x, p.y, p.z); NN.push(nn.x, nn.y, nn.z); UV.push(uv[0], uv[1]); E.push(e); };
  const tri = (a: [THREE.Vector3, THREE.Vector3, [number, number], number], b: typeof a, c: typeof a) => { push(...a); push(...b); push(...c); };
  // rings: [inset, y, normal-y blend]
  const lift = (x: number, z: number, y: number) => (o.dome ? y + o.dome * Math.max(0, 1 - ((x - cx) ** 2 + (z - cz) ** 2) / (fs * fs * 0.25)) * (y > t * 0.5 ? 1 : 0) : y);
  const ring = (inset: number, y: number) => outline.map(([x, z]) => {
    const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
    const k = Math.max(0, (l - inset) / l);
    const px = cx + dx * k, pz = cz + dz * k;
    return new THREE.Vector3(px, lift(px, pz, y), pz);
  });
  const rings = [ring(rd, 0), ring(rd * 0.3, rd * 0.3), ring(0, rd), ring(0, t - rd), ring(rd * 0.3, t - rd * 0.3), ring(rd, t)];
  const ny = [-1, -0.7, -0.15, 0.15, 0.7, 1];
  const outN = (i: number, k: number) => {
    const [x, z] = outline[i]; const d = new THREE.Vector2(x - cx, z - cz).normalize();
    const h = Math.sqrt(1 - ny[k] * ny[k]);
    return new THREE.Vector3(d.x * h, ny[k], d.y * h).normalize();
  };
  let per = 0; const perim: number[] = [0];
  for (let i = 0; i < n; i++) { per += Math.hypot(outline[(i + 1) % n][0] - outline[i][0], outline[(i + 1) % n][1] - outline[i][1]); perim.push(per); }
  const rimUV = (i: number, k: number): [number, number] => [0.52 + (perim[i] / per) * 0.46, 0.04 + (k / 5) * 0.92];
  // sides
  for (let k = 0; k < 5; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
    const ea = 1, uvA = rimUV(i, k), uvB = rimUV(i + 1, k), uvC = rimUV(i + 1, k + 1), uvD = rimUV(i, k + 1);
    if (o.topOnly && k < 2) continue;
    tri([a, outN(i, k), uvA, ea], [c, outN(j, k + 1), uvC, ea], [b, outN(j, k), uvB, ea]);
    tri([a, outN(i, k), uvA, ea], [d, outN(i, k + 1), uvD, ea], [c, outN(j, k + 1), uvC, ea]);
  }
  // caps (fans from the centre)
  const top = new THREE.Vector3(cx, lift(cx, cz, t), cz), bot = new THREE.Vector3(cx, 0, cz);
  const up = new THREE.Vector3(0, 1, 0), dn = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ta = rings[5][i], tb = rings[5][j];
    tri([top, up, faceUV(top.x, top.z), 0], [tb, up, faceUV(tb.x, tb.z), 0.85], [ta, up, faceUV(ta.x, ta.z), 0.85]);
    if (!o.topOnly) {
      const ba = rings[0][i], bb = rings[0][j];
      tri([bot, dn, faceUV(bot.x, bot.z), 0], [ba, dn, faceUV(ba.x, ba.z), 0.85], [bb, dn, faceUV(bb.x, bb.z), 0.85]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1));
  g.computeBoundingSphere();
  return g;
}

/** a peameal loin (the uncut piece) lying along X from 0 to len: the cut faces at both ends, crust around */
export function loinGeo(rx: number, rz: number, len: number, seed: number): THREE.BufferGeometry {
  const g = slab(blob(rx, rz, seed, 16, 0.06), len, { round: Math.min(0.006, len * 0.2) });
  // slab thickness is along +Y: lay it along +X (y -> x), keep z
  g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, rx, 0));
  return g;
}

/** a lofted lake trout piece between body fractions u0..u1 lying on its side (flanks face +-Y), head toward -X */
export function troutGeo(len: number, u0: number, u1: number): THREE.BufferGeometry {
  const P: number[] = [], NN: number[] = [], UV: number[] = [], E: number[] = [];
  const prof = (u: number) => {
    const h = 0.17 * len * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.03)), 0.75) * (u > 0.82 ? Math.max(0.18, 1 - (u - 0.82) * 4.2) : 1) + 0.008;
    return { h, w: h * 0.45 };
  };
  const seg = 12, rings: { p: THREE.Vector3; n: THREE.Vector3; v: number }[][] = [];
  const steps = Math.max(2, Math.ceil((u1 - u0) * 16));
  for (let s = 0; s <= steps; s++) {
    const u = u0 + (u1 - u0) * (s / steps);
    const { h, w } = prof(u);
    const x = -len / 2 + u * len;
    const ring: { p: THREE.Vector3; n: THREE.Vector3; v: number }[] = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2; // 0 = belly (-Z), pi = back (+Z)
      const z = -Math.cos(a) * h / 2, y = Math.sin(a) * w / 2;
      ring.push({ p: new THREE.Vector3(x, y + w / 2, z), n: new THREE.Vector3(0, Math.sin(a) / w, -Math.cos(a) / h).normalize(), v: k / seg });
    }
    rings.push(ring);
  }
  const push = (p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, e: number) => { P.push(p.x, p.y, p.z); NN.push(n.x, n.y, n.z); UV.push(u, v); E.push(e); };
  for (let s = 0; s < steps; s++) for (let k = 0; k < seg; k++) {
    const a = rings[s][k], b = rings[s][k + 1], c = rings[s + 1][k + 1], d = rings[s + 1][k];
    const ua = 0.52 + (u0 + (u1 - u0) * (s / steps)) * 0.46, ud = 0.52 + (u0 + (u1 - u0) * ((s + 1) / steps)) * 0.46;
    push(a.p, a.n, ua, a.v, 0); push(c.p, c.n, ud, c.v, 0); push(b.p, b.n, ua, b.v, 0);
    push(a.p, a.n, ua, a.v, 0); push(d.p, d.n, ud, d.v, 0); push(c.p, c.n, ud, c.v, 0);
  }
  // cut faces (flesh) at both ends unless at the snout / tail tip
  const cap = (ring: typeof rings[0], dir: number) => {
    const c = ring.reduce((s, r) => s.add(r.p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    const n = new THREE.Vector3(dir, 0, 0);
    const hh = Math.max(...ring.map((r) => Math.abs(r.p.z - c.z))) * 2 || 0.01;
    const fu = (p: THREE.Vector3) => 0.25 + ((p.z - c.z) / hh) * 0.45, fv = (p: THREE.Vector3) => 0.5 + ((p.y - c.y) / hh) * 0.9;
    for (let k = 0; k < seg; k++) {
      const a = ring[k].p, b = ring[k + 1].p;
      if (dir > 0) { push(c, n, fu(c), fv(c), 0.3); push(a, n, fu(a), fv(a), 0.3); push(b, n, fu(b), fv(b), 0.3); }
      else { push(c, n, fu(c), fv(c), 0.3); push(b, n, fu(b), fv(b), 0.3); push(a, n, fu(a), fv(a), 0.3); }
    }
  };
  if (u0 > 0.01) cap(rings[0], -1);
  if (u1 < 0.99) cap(rings[steps], 1);
  // the forked tail on the last piece (flat, both sides)
  if (u1 >= 0.99) {
    const x = -len / 2 + len, { w } = prof(1);
    const pts = [new THREE.Vector3(x - 0.01, w / 2, 0.012), new THREE.Vector3(x + len * 0.16, w / 2, 0.07 * len / 0.5), new THREE.Vector3(x + len * 0.1, w / 2, 0), new THREE.Vector3(x + len * 0.16, w / 2, -0.065 * len / 0.5), new THREE.Vector3(x - 0.01, w / 2, -0.012)];
    for (const sgn of [1, -1]) for (let k = 1; k < pts.length - 1; k++) {
      const n = new THREE.Vector3(0, sgn, 0);
      const A = pts[0], B = pts[k], C = pts[k + 1];
      const uvs = (p: THREE.Vector3): [number, number] => [0.96, 0.5 + p.z * 2];
      if (sgn > 0) { push(A, n, ...uvs(A), 1); push(C, n, ...uvs(C), 1); push(B, n, ...uvs(B), 1); }
      else { push(A, n, ...uvs(A), 1); push(B, n, ...uvs(B), 1); push(C, n, ...uvs(C), 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1));
  g.computeBoundingSphere();
  return g;
}

/** bannock dough: shaggy lump (flat 0) .. kneaded ball .. pressed round (flat 1) */
export function doughGeo(flat: number, seed: number): THREE.BufferGeometry {
  const r = 0.055 + flat * 0.035, t = 0.05 - flat * 0.026;
  return slab(blob(r, r * 0.95, seed, 20, 0.12 * (1 - flat) + 0.03), t, { round: t * 0.45, dome: 0.012 * (1 - flat * 0.5) });
}

/** a fried egg's white (flat, wobbly, lacy edge) */
export function eggWhiteGeo(seed: number, spread = 1): THREE.BufferGeometry {
  const r = 0.05 * spread;
  return slab(blob(r, r * 0.86, seed, 22, 0.16), 0.006, { round: 0.003, dome: 0.004, faceScale: 0.12 });
}

/** a yolk dome; the rim square of the egg atlas paints it */
export function yolkGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.016, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.52 + uv.getX(i) * 0.46, uv.getY(i));
  g.scale(1, 0.62, 1);
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Float32Array(uv.count), 1));
  return g;
}

/** an egg in its shell */
export function eggShellGeo(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, a = t * Math.PI;
    const r = Math.sin(a) * (0.0215 - 0.003 * Math.cos(a));
    pts.push(new THREE.Vector2(Math.max(0.0001, r), -Math.cos(a) * 0.029 + 0.029));
  }
  return new THREE.LatheGeometry(pts, 12);
}

let shellMat: THREE.MeshStandardMaterial | null = null;
export function eggShellMat(): THREE.MeshStandardMaterial {
  if (shellMat) return shellMat;
  const n = fbm(64, 64, 8, 91, 3), s = speck(64, 64, 92);
  const p = new Pix(64, 64).each((_x, _y, i) => (s[i] > 0.93 ? hex('#a87a5a') : ramp(['#c99a74', '#d4a882', '#ddb690', '#e6c4a0'].map(hex), n[i])));
  shellMat = new THREE.MeshStandardMaterial({ map: p.tex(), roughness: 0.6 });
  return shellMat;
}

// ---------------------------------------------------------------------------------------------- liquids
export type LiquidKind = 'water' | 'coffee' | 'beans' | 'stew' | 'syrup' | 'fat';
const LIQ: Record<LiquidKind, { cols: string[]; rough: number; bumps: number }> = {
  water: { cols: ['#20303a', '#2a3c46', '#34505a', '#5a7a84'], rough: 0.08, bumps: 0 },
  coffee: { cols: ['#120a06', '#1c1008', '#2a180c', '#4a2c18'], rough: 0.12, bumps: 0 },
  beans: { cols: ['#6a2a10', '#84381a', '#a04a22', '#c46a34', '#d8884a'], rough: 0.35, bumps: 1 },
  stew: { cols: ['#3a2210', '#4e2e16', '#64401e', '#7a5028', '#8a6a3a'], rough: 0.3, bumps: 0.6 },
  syrup: { cols: ['#5a2a08', '#7a3a0c', '#9a5214', '#c07020'], rough: 0.1, bumps: 0 },
  fat: { cols: ['#b8902a', '#d0a838', '#e8c860', '#f4e0a0'], rough: 0.05, bumps: 0 },
};
const liqTex = new Map<string, THREE.Texture>();

export interface LiquidMat extends THREE.MeshStandardMaterial { userData: { uBoil: { value: number }; uSpin: { value: number }; uTime: { value: number }; uScorch: { value: number } } }

/** a liquid surface: painted ramp, stir swirl (uSpin), rolling boil (uBoil: bubbles pop as pixel rings), scorch */
export function liquidMat(kind: LiquidKind): LiquidMat {
  let t = liqTex.get(kind);
  const d = LIQ[kind];
  if (!t) {
    const n = fbm(64, 64, 16, kind.length * 7, 3), s = speck(64, 64, kind.length * 13), b = vnoise(64, 64, 6, kind.length * 3);
    const cols = d.cols.map(hex);
    t = new Pix(64, 64).each((_x, _y, i) => (d.bumps && b[i] > 0.66 ? mul(ramp(cols, 0.75 + s[i] * 0.25), 1.05) : ramp(cols, n[i] * 0.8 + s[i] * 0.2 * (d.bumps ? 1 : 0.4)))).tex();
    liqTex.set(kind, t);
  }
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: d.rough, metalness: 0 }) as LiquidMat;
  m.userData = { uBoil: { value: 0 }, uSpin: { value: 0 }, uTime: { value: 0 }, uScorch: { value: 0 } };
  const U = m.userData;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uBoil: U.uBoil, uSpin: U.uSpin, uLT: U.uTime, uScorch: U.uScorch, uNoise: { value: noiseTex() } });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBoil; uniform float uSpin; uniform float uLT; uniform float uScorch; uniform sampler2D uNoise;')
      .replace('#include <map_fragment>', `
        vec2 cuv = vMapUv - 0.5;
        float ang = uSpin * (1.2 - length(cuv) * 1.5);
        cuv = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * cuv;
        vec4 sampledDiffuseColor = texture2D(map, cuv + 0.5);
        diffuseColor *= sampledDiffuseColor;
        // rolling boil: pixel bubbles (rings) appearing and popping
        vec2 g = floor((vMapUv) * 24.0);
        float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
        float ph = fract(uLT * (0.6 + h * 1.4) + h * 7.0);
        float on = step(1.0 - uBoil * 0.55, h) * step(ph, 0.55);
        vec2 f = fract(vMapUv * 24.0) - 0.5;
        float ring = step(abs(length(f) - ph * 0.5), 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.6 + 0.08, on * ring * 0.8);
        float nz = texture2D(uNoise, vMapUv * 1.5).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.04, 0.03), step(nz, uScorch * 0.7) * smoothstep(0.3, 0.5, length(vMapUv - 0.5)));`);
  };
  m.customProgramCacheKey = () => 'liquid';
  return m;
}

/** a disc for a liquid surface (radius r), UV 0..1 across */
export function discGeo(r: number, seg = 20): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}
