// Hunting effects and small models: blood on the ground (a trail you can follow), bullet impacts (dust off the
// litter, bark chips off a trunk, sparks off rock, a splash), and the generated item models (butcher-paper meat
// parcels, a rolled hide, a paper box of cartridges, a licence tag).
import * as THREE from 'three';
import { debris, puffs } from '../../gfx/particles';
import { heightAt, normalAt } from '../../world/layout';
import { applyPixelTex } from '../../gfx/tex';
import { paintPaper, paperMesh } from '../../ui/paper';

// ------------------------------------------------------------------------------------------------ blood
type BloodKind = 'bright' | 'frothy' | 'dark';
const KIND_ROW: Record<BloodKind, number> = { bright: 0, frothy: 1, dark: 2 };
/** an atlas of 4 x 3 hand-pixelled splats: bright arterial drops, frothy pink lung blood with bubbles, dark gut blood */
function bloodAtlas(): THREE.Texture {
  const T = 32, c = document.createElement('canvas'); c.width = T * 4; c.height = T * 3;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height), D = img.data;
  const pal: Record<BloodKind, string[]> = {
    bright: ['#3c0a0c', '#5e100f', '#7c1a15', '#9e2219', '#b8402c'],
    frothy: ['#5e1b1d', '#8a2c2a', '#b04a42', '#cf7468', '#e8a79b'],
    dark: ['#1c0707', '#2e0c0b', '#45110e', '#5c1a12', '#6e2a1a'],
  };
  const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  (['bright', 'frothy', 'dark'] as BloodKind[]).forEach((k, row) => {
    const P = pal[k].map(hex);
    for (let v = 0; v < 4; v++) {
      // blobs: a main splat and satellite drops (a running animal throws them forward)
      const blobs: [number, number, number][] = [[16 + (rnd() - 0.5) * 4, 16 + (rnd() - 0.5) * 4, 5 + rnd() * 4 + (v === 0 ? 3 : 0)]];
      for (let k2 = 0; k2 < 5 + v * 2; k2++) { const a = rnd() * 6.28, d = 6 + rnd() * 9; blobs.push([16 + Math.cos(a) * d, 16 + Math.sin(a) * d * (v === 3 ? 0.4 : 1), 0.8 + rnd() * 2.2]); }
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        let f = 0;
        for (const [bx, by, br] of blobs) f = Math.max(f, 1 - Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br);
        const i = ((row * T + y) * c.width + v * T + x) * 4;
        if (f <= 0) { D[i + 3] = 0; continue; }
        // darker rim, lit wet core, a glint; froth: little pale bubbles
        let s = f > 0.65 ? 2 : f > 0.3 ? 1 : 0;
        if (f > 0.75 && ((x * 3 + y * 5) % 11 === 0)) s = 4;
        if (k === 'frothy' && f > 0.2 && ((x * 7 + y * 13 + v) % 9 === 0)) s = 4;
        if (k === 'frothy' && f > 0.4 && ((x * 5 + y * 3) % 7 === 0)) s = 3;
        const q = P[s];
        D[i] = q[0]; D[i + 1] = q[1]; D[i + 2] = q[2]; D[i + 3] = 255;
      }
    }
  });
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** blood on the ground: an instanced ring of decals laid on the terrain */
export class BloodDecals {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly max: number;
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _s = new THREE.Vector3(); private _n = new THREE.Vector3();
  /** recent drops (for the test page and the tracking hint): position, time */
  readonly recent: { p: THREE.Vector3; t: number }[] = [];
  constructor(max = 900) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // each instance picks its atlas cell through an instanced attribute
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    geo.setAttribute('aCell', cell);
    const mat = new THREE.MeshStandardMaterial({ map: bloodAtlas(), alphaTest: 0.5, roughness: 0.32, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (uv + aCell) * vec2(0.25, 1.0 / 3.0);\n#endif');
    };
    mat.customProgramCacheKey = () => 'bushed-blood';
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'BloodTrail';
  }
  /** a drop (amount 0..1 sizes it) at a ground point */
  add(p: THREE.Vector3, amount: number, kind: BloodKind, time = 0) {
    const i = this.n % this.max;
    this.n++;
    const y = heightAt(p.x, p.z);
    const [nx, ny, nz] = normalAt(p.x, p.z);
    this._n.set(nx, ny, nz);
    this._q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this._n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2));
    const s = 0.07 + amount * 0.26 * (0.7 + Math.random() * 0.6);
    this._s.set(s, 1, s * (0.7 + Math.random() * 0.6));
    this._m.compose(new THREE.Vector3(p.x, y + 0.015, p.z), this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    const cell = this.mesh.geometry.getAttribute('aCell') as THREE.InstancedBufferAttribute;
    cell.setXY(i, Math.floor(Math.random() * 4), 2 - KIND_ROW[kind]);
    cell.needsUpdate = true;
    this.mesh.count = Math.min(this.max, this.n);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.recent.push({ p: new THREE.Vector3(p.x, y, p.z), t: time });
    if (this.recent.length > 300) this.recent.shift();
  }
  /** a pool: several overlapping splats */
  pool(p: THREE.Vector3, r: number, kind: BloodKind, n = 6, time = 0) {
    for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, d = Math.random() * r; this.add(new THREE.Vector3(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d), 0.7 + Math.random() * 0.6, kind, time); }
  }
}

// ------------------------------------------------------------------------------------------------ impacts
const DUST = new THREE.Color(0.42, 0.36, 0.27), MIST = new THREE.Color(0.55, 0.12, 0.1), WATER = new THREE.Color(0.75, 0.8, 0.82);
export function impactFx(kind: 'terrain' | 'tree' | 'solid' | 'animal' | 'water', p: THREE.Vector3, n: THREE.Vector3, dir: THREE.Vector3) {
  const out = n.clone().multiplyScalar(1.4).addScaledVector(dir, -0.4);
  switch (kind) {
    case 'terrain':
      puffs.emit(p, out.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.4, 0)), { size: 0.12, grow: 4, life: 1.6, color: DUST, alpha: 0.45, rise: 0.05, n: 5, spread: 0.12 });
      debris.emit('needle', p, out.clone().multiplyScalar(2.2), 6, { spread: 1.8 });
      debris.emit('leaf', p, out.clone().multiplyScalar(1.6), 3, { spread: 1.4 });
      break;
    case 'tree':
      debris.emit('bark', p, out.clone().multiplyScalar(2.6), 7, { spread: 1.5 });
      debris.emit('chip', p, out.clone().multiplyScalar(3.2), 4, { spread: 1.2 });
      puffs.emit(p, out.clone().multiplyScalar(0.5), { size: 0.06, grow: 3, life: 1.0, color: new THREE.Color(0.5, 0.42, 0.33), alpha: 0.35, n: 3, spread: 0.05 });
      break;
    case 'solid':
      debris.emit('spark', p, out.clone().multiplyScalar(3), 5, { spread: 2, color: new THREE.Color(1, 0.75, 0.35) });
      puffs.emit(p, out.clone().multiplyScalar(0.4), { size: 0.08, grow: 3, life: 1.0, color: new THREE.Color(0.6, 0.6, 0.6), alpha: 0.3, n: 3, spread: 0.05 });
      break;
    case 'animal':
      puffs.emit(p, dir.clone().multiplyScalar(1.2), { size: 0.07, grow: 3, life: 0.7, color: MIST, alpha: 0.55, n: 5, spread: 0.08 });
      debris.emit('chip', p, dir.clone().multiplyScalar(2).add(new THREE.Vector3(0, 0.5, 0)), 3, { spread: 1, color: new THREE.Color(0.45, 0.08, 0.06), size: 0.5 });
      break;
    case 'water':
      puffs.emit(p, new THREE.Vector3(0, 2.2, 0), { size: 0.1, grow: 3, life: 0.8, color: WATER, alpha: 0.5, rise: 0.3, n: 6, spread: 0.1 });
      break;
  }
}

// ------------------------------------------------------------------------------------------------ item models
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; draw(g);
  const t = new THREE.CanvasTexture(c);
  applyPixelTex(t, { srgb: true });
  return t;
}
function speckle(g: CanvasRenderingContext2D, w: number, h: number, cols: string[], n: number, seed = 3) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1); }
}
/** a soft pillow shape (a lathe of a rounded profile, squashed): parcels, bundles */
function pillow(w: number, h: number, d: number, segs = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) ** 0.55), Math.sin(a))); }
  const geo = new THREE.LatheGeometry(pts, segs);
  geo.scale(w / 2, h / 2, d / 2);
  geo.translate(0, h / 2, 0);
  return geo;
}
/** a butcher-paper parcel tied with twine, a pencilled label; venison or moose */
export function meatParcel(kind: 'venison' | 'moose_meat' | 'deer_liver'): THREE.Object3D {
  const tex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#cdbb9a'; g.fillRect(0, 0, 64, 64);
    speckle(g, 64, 64, ['#b9a582', '#d9c9aa', '#bfa98a', '#a99070'], 260, kind.length);
    // creases, a bloody seep, the twine
    g.fillStyle = '#a8946f'; for (let k = 0; k < 6; k++) g.fillRect(4 + k * 10, 0, 1, 64);
    g.fillStyle = kind === 'deer_liver' ? '#5a1414' : '#7a2420'; g.fillRect(40, 44, 9, 5); g.fillRect(43, 49, 4, 3); g.fillStyle = '#9a3a2c'; g.fillRect(42, 45, 4, 2);
    g.fillStyle = '#e2d6b6'; g.fillRect(0, 30, 64, 3); g.fillRect(30, 0, 3, 64); g.fillStyle = '#8a7a5a'; g.fillRect(0, 33, 64, 1); g.fillRect(33, 0, 1, 64);
    g.fillStyle = '#3a3530'; g.font = '8px monospace'; g.fillText(kind === 'moose_meat' ? 'MOOSE' : kind === 'deer_liver' ? 'HEART' : 'DEER', 6, 20);
  });
  const s = kind === 'moose_meat' ? 1.4 : kind === 'deer_liver' ? 0.8 : 1;
  const m = new THREE.Mesh(pillow(0.24 * s, 0.09 * s, 0.17 * s), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.name = kind;
  return g;
}
/** a hide salted and rolled hair-side in, tied twice */
export function hideRoll(kind: 'deer_hide' | 'moose_hide'): THREE.Object3D {
  const moose = kind === 'moose_hide';
  const tex = canvasTex(64, 32, (g) => {
    g.fillStyle = moose ? '#2e241d' : '#7b6650'; g.fillRect(0, 0, 64, 32);
    speckle(g, 64, 32, moose ? ['#3e3026', '#1d1612', '#4f3e31'] : ['#8d7860', '#6a5644', '#a39079', '#5b4a3a'], 500, moose ? 5 : 9);
    // the flesh side showing at the ends, two ties
    g.fillStyle = '#c9b28e'; g.fillRect(0, 0, 64, 3); g.fillStyle = '#b39a76'; g.fillRect(0, 29, 64, 3);
    g.fillStyle = '#d8c79f'; g.fillRect(14, 0, 3, 32); g.fillRect(46, 0, 3, 32); g.fillStyle = '#8f7c58'; g.fillRect(17, 0, 1, 32); g.fillRect(49, 0, 1, 32);
  });
  const L = moose ? 0.9 : 0.55, R = moose ? 0.17 : 0.1;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(R * (0.78 + 0.22 * Math.sin(Math.PI * t) + (i % 3 === 0 ? 0.04 : 0)), t * L)); }
  const geo = new THREE.LatheGeometry(prof, 12); geo.rotateZ(Math.PI / 2); geo.translate(L / 2, R, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.name = kind;
  return g;
}
/** a paper box of twenty soft points: printed lid, a lifted flap */
export function cartridgeBox(): THREE.Object3D {
  const tex = canvasTex(64, 32, (g) => {
    g.fillStyle = '#a6382a'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#e8dcc0'; g.fillRect(3, 8, 58, 16);
    g.fillStyle = '#2a2420'; g.font = 'bold 8px monospace'; g.fillText('7.62x54R', 6, 16); g.font = '6px monospace'; g.fillText('SOFT POINT  20', 6, 22);
    g.fillStyle = '#7c241c'; g.fillRect(0, 0, 64, 2); g.fillRect(0, 30, 64, 2);
    speckle(g, 64, 32, ['#b8473a', '#932d22'], 60, 4);
  });
  const shape = new THREE.Shape();
  const w = 0.105, d = 0.06, r = 0.004;
  shape.moveTo(-w / 2 + r, -d / 2); shape.lineTo(w / 2 - r, -d / 2); shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); shape.lineTo(w / 2, d / 2 - r); shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); shape.lineTo(-w / 2, -d / 2 + r); shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.032, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  // planar uv from the top
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getZ(i) / d + 0.5 + pos.getY(i) * 3);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.name = 'ammo_box_762';
  return g;
}
/** a licence or a tag: a small printed card */
export function tagCard(kind: 'licence' | 'tag_deer' | 'tag_moose'): THREE.Object3D {
  const lines = kind === 'licence'
    ? [{ t: 'h' as const, text: 'Outdoors Card' }, { t: 'small' as const, text: 'Ontario  ·  Hunting version' }, { t: 'p' as const, text: 'Valid 3 years. Carry it with you.' }]
    : [{ t: 'h' as const, text: kind === 'tag_deer' ? 'Deer Tag' : 'Moose Tag' }, { t: 'small' as const, text: kind === 'tag_deer' ? 'White-tailed deer · WMU 49 · either sex' : 'Bull moose · WMU 49' }, { t: 'p' as const, text: 'Notch the date. Fix to the animal before moving it.' }];
  const m = paperMesh(paintPaper(lines, { style: 'card', w: 320, h: 200, seed: kind.length }), 0.09);
  const g = new THREE.Group(); g.add(m); m.rotation.x = -Math.PI / 2; m.position.y = 0.002; g.name = kind;
  return g;
}
