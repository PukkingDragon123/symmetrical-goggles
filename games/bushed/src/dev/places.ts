// places.html: the cabin (with woodyard + fire pit) and the general store on heightAt terrain, through the game's
// renderer and sky. Golden hour by default; ?night=1 for night with the lamps lit; ?hour=h for any hour.
// Free-fly camera (drag + WASD/QE), named viewpoints: ?view=cabin_ext|cabin_int|store_ext|store_int|woodyard|porch
// ?only=cabin|store builds one place. ?shot=1 hides the UI (screenshots). window.__ready flags the first frames.
import * as THREE from 'three';
import { Renderer } from '../gfx/renderer';
import { Sky } from '../gfx/sky';
import { G } from '../gfx/globals';
import { loadTex } from '../gfx/tex';
import { heightAt, SPOTS } from '../world/layout';
import { buildCabin } from '../places/cabin';
import type { Place } from '../places/kit';
import { Forest } from '../world/forest';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[]; __places?: unknown };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));
if (q.get('shot') === '1') document.body.classList.add('shot');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const R = new Renderer(canvas);
R.pixel = Number(q.get('pixel') ?? 2);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 62), 16 / 9, 0.05, 900);
const sky = new Sky(scene);
sky.shadowSize = 40;
let hour = Number(q.get('hour') ?? (q.get('night') === '1' ? 22.5 : 18.6));

// ---------------------------------------------------------------------------------------------- ground
function groundPatch(cx: number, cz: number, half: number, step: number): THREE.Mesh {
  const n = Math.round((half * 2) / step);
  const g = new THREE.PlaneGeometry(half * 2, half * 2, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz;
    p.setXYZ(i, x, heightAt(x, z) - 0.02, z);
    uv.setXY(i, x / 2, z / 2);
  }
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const a = loadTex('terrain/forest_floor_albedo.png', { repeat: true });
  const nm = loadTex('terrain/forest_floor_normal.png', { repeat: true, srgb: false });
  mat.map = a; mat.normalMap = nm;
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** dark conifer silhouettes around a clearing (dev-page stand-in for the forest module) */
function treeRing(cx: number, cz: number, r0: number, r1: number, n: number, seed: number): THREE.InstancedMesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.ConeGeometry(1 - k * 0.2, 0.42, 8, 1);
    c.translate(0, 0.21 + 0.14 + k * 0.19, 0);
    parts.push(c.toNonIndexed());
  }
  const tr = new THREE.CylinderGeometry(0.05, 0.08, 0.4, 6);
  tr.translate(0, 0.2, 0);
  parts.push(tr.toNonIndexed());
  const pos: number[] = [];
  for (const p of parts) pos.push(...(p.attributes.position.array as Float32Array));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x18241a, roughness: 1 });
  const im = new THREE.InstancedMesh(g, mat, n);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = r0 + (r1 - r0) * Math.sqrt(rnd());
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const h = 12 + rnd() * 14, w = h * (0.17 + rnd() * 0.05);
    m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w));
    im.setMatrixAt(i, m);
  }
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

// ---------------------------------------------------------------------------------------------- views
interface View { pos: THREE.Vector3; look: THREE.Vector3 }
const views: Record<string, View> = {};
function localView(place: Place, name: string, p: [number, number, number], l: [number, number, number]): void {
  place.group.updateMatrixWorld(true);
  views[name] = { pos: new THREE.Vector3(...p).applyMatrix4(place.group.matrixWorld), look: new THREE.Vector3(...l).applyMatrix4(place.group.matrixWorld) };
}

const places: Place[] = [];
let forest: Forest | null = null;
let yaw = 0, pitch = 0;
function setView(name: string): void {
  const v = views[name];
  if (!v) return;
  camera.position.copy(v.pos);
  const d = v.look.clone().sub(v.pos).normalize();
  yaw = Math.atan2(-d.x, -d.z);
  pitch = Math.asin(d.y);
  q.set('view', name);
  history.replaceState(null, '', '?' + q.toString());
}

// ---------------------------------------------------------------------------------------------- build
async function main(): Promise<void> {
  const only = q.get('only');
  if (q.get('products') === '1') { await productLineup(); return; }
  if (only !== 'store') {
    const cabin = await buildCabin();
    scene.add(cabin.group);
    places.push(cabin);
    scene.add(groundPatch(SPOTS.cabin.x + 4, SPOTS.cabin.z + 4, 60, 1));
    if (q.get('forest') !== '1') scene.add(treeRing(SPOTS.cabin.x + 3, SPOTS.cabin.z + 3, 24, 60, 220, 11));
    localView(cabin, 'cabin_ext', [-5.2, 1.7, 10.2], [0.3, 2.0, 1.5]);
    localView(cabin, 'cabin_int', [-0.7, 1.95, 2.45], [0.9, 1.1, -2.2]);
    localView(cabin, 'stove', [0.1, 1.35, -0.4], [1.45, 0.75, -2.2]);
    localView(cabin, 'bunk', [0.3, 1.6, 0.2], [-1.8, 0.7, -2.0]);
    localView(cabin, 'cabin_int2', [1.6, 1.85, -0.6], [-1.8, 1.1, 1.4]);
    localView(cabin, 'porch', [3.0, 1.55, 7.2], [-1.2, 1.3, 3.4]);
    localView(cabin, 'front', [0.4, 1.6, 9.0], [0.0, 2.0, 3.0]);
    localView(cabin, 'back', [-6.5, 2.0, -7.5], [0, 1.8, 0]);
    localView(cabin, 'woodyard', [9.6, 1.8, 5.6], [15.5, 0.9, 1.0]);
    localView(cabin, 'firepit', [2.0, 1.6, 4.3], [6.2, 0.4, 7.4]);
    localView(cabin, 'menu', [-1.95, 1.2, 4.35], [3.5, 0.6, 9.5]);
    if (q.get('night') === '1' || hour > 20 || hour < 5) { cabin.stove?.setFire(0.85); (cabin.anchors.firepit?.userData.setFire as ((l: number) => void) | undefined)?.(q.get('pit') === '0' ? 0 : 1); }
    cabin.setThermometer?.(Number(q.get('temp') ?? 21));
  }
  if (only !== 'cabin') {
    try {
      const mod = await import('../places/store');
      const store = await mod.buildStore();
      scene.add(store.group);
      places.push(store);
      scene.add(groundPatch(SPOTS.store.x, SPOTS.store.z, 60, 1));
      if (q.get('forest') !== '1') scene.add(treeRing(SPOTS.store.x, SPOTS.store.z, 34, 70, 220, 23));
      localView(store, 'store_ext', [-4.5, 1.7, 14.5], [0.6, 2.6, 4.5]);
      localView(store, 'store_int', [-2.9, 1.95, 4.4], [1.0, 1.2, -2.6]);
      localView(store, 'store_counter', [0.1, 1.75, 1.6], [2.2, 1.2, 0.6]);
      localView(store, 'store_int2', [2.2, 1.7, -3.5], [-2.0, 1.3, 3.0]);
      localView(store, 'log_deck', [12.5, 2.4, 7.5], [8.0, 0.6, -0.5]);
    } catch (e) { W.__errors!.push('store: ' + String(e)); }
  }
  if (q.get('forest') === '1') {
    try {
      forest = new Forest(scene, camera, R.gl, { far: Number(q.get('far') ?? 140), shadow: 40 });
    } catch (e) { W.__errors!.push('forest: ' + String(e)); }
  }
  const lamps = q.get('lamps') ?? (hour > 17 || hour < 7 ? '1' : '0.25');
  for (const p of places) p.setLamps?.(Number(lamps));
  W.__places = places;

  // UI
  const vdiv = document.getElementById('views')!;
  Object.keys(views).forEach((k, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1} ${k}`;
    b.onclick = () => setView(k);
    vdiv.appendChild(b);
  });
  const hs = document.getElementById('hour') as HTMLInputElement;
  hs.value = String(hour);
  hs.oninput = () => { hour = Number(hs.value); q.set('hour', hs.value); history.replaceState(null, '', '?' + q.toString()); };
  let lampOn = Number(lamps) > 0.5, fireOn = true, pitOn = q.get('night') === '1';
  document.getElementById('lamps')!.onclick = () => { lampOn = !lampOn; for (const p of places) p.setLamps?.(lampOn ? 1 : 0); };
  document.getElementById('fire')!.onclick = () => { fireOn = !fireOn; for (const p of places) p.stove?.setFire(fireOn ? 0.85 : 0); };
  document.getElementById('pit')!.onclick = () => { pitOn = !pitOn; for (const p of places) (p.anchors.firepit?.userData.setFire as ((l: number) => void) | undefined)?.(pitOn ? 1 : 0); };
  addEventListener('keydown', (e) => { const i = Number(e.key) - 1; const k = Object.keys(views)[i]; if (k) setView(k); });

  setView(q.get('view') ?? Object.keys(views)[0]);
  const lc = q.get('lc');
  if (lc && places[0]) {
    const v = lc.split(',').map(Number);
    localView(places[0], '_lc', [v[0], v[1], v[2]], [v[3], v[4], v[5]]);
    const keep = q.get('view');
    setView('_lc');
    if (keep) q.set('view', keep);
  }
  // let textures land, then flag ready after a few frames
  let frames = 0;
  const go = () => { frames++; if (frames > Number(q.get('frames') ?? 12)) { W.__ready = true; if (q.get('shot') === '1') stopAfter = 2; } else requestAnimationFrame(go); };
  setTimeout(() => requestAnimationFrame(go), 1500);
}

// ---------------------------------------------------------------------------------------------- product lineup
async function productLineup(): Promise<void> {
  const { buildProduct, GEN_PRODUCTS, DECOR_PRODUCTS, productSize } = await import('../places/products');
  const ids = [...new Set([...GEN_PRODUCTS, ...DECOR_PRODUCTS])];
  const ox = SPOTS.cabin.x + 30, oz = SPOTS.cabin.z - 30;
  const y0 = heightAt(ox, oz) + 0.8;
  const table = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.04, 2.6), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 }));
  table.position.set(ox, y0 - 0.02, oz);
  table.receiveShadow = true;
  scene.add(table);
  let x = -2.0, z = -1.0, row = 0;
  for (const id of ids) {
    const o = buildProduct(id);
    const [w, , d] = productSize(id);
    if (x + w > 2.1) { x = -2.0; z += row + 0.12; row = 0; }
    o.position.set(ox + x + w / 2, y0, oz + z + d / 2);
    o.rotation.y = 0.35;
    scene.add(o);
    x += w + 0.1;
    row = Math.max(row, d);
  }
  const key = new THREE.PointLight(0xfff0dd, 25, 12, 1.5);
  key.position.set(ox - 1.5, y0 + 2.2, oz + 2.5);
  key.castShadow = true;
  scene.add(key);
  views.products = { pos: new THREE.Vector3(ox, y0 + 1.5, oz + 2.6), look: new THREE.Vector3(ox, y0, oz + 0.1) };
  views.products_close = { pos: new THREE.Vector3(ox - 1.0, y0 + 0.55, oz + 0.3), look: new THREE.Vector3(ox - 1.0, y0 + 0.05, oz - 0.8) };
  scene.add(groundPatch(ox, oz, 20, 1));
  setView(q.get('view') ?? 'products');
  let frames = 0;
  const go = () => { frames++; if (frames > 10) { W.__ready = true; if (q.get('shot') === '1') stopAfter = 2; } else requestAnimationFrame(go); };
  setTimeout(() => requestAnimationFrame(go), 1500);
}

// ---------------------------------------------------------------------------------------------- fly camera
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
let drag = false;
canvas.addEventListener('mousedown', () => (drag = true));
addEventListener('mouseup', () => (drag = false));
addEventListener('mousemove', (e) => {
  if (!drag) return;
  yaw -= e.movementX * 0.004;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.004));
});

function onResize(): void {
  R.resize();
  const [w, h] = R.internalSize;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);
onResize();

let last = performance.now();
let stopAfter = -1;
function frame(now: number): void {
  if (stopAfter === 0) return;
  if (stopAfter > 0) stopAfter--;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.uTime.value += dt;
  const sp = keys.has('ShiftLeft') ? 12 : 3;
  const fw = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (keys.has('KeyW')) camera.position.addScaledVector(fw, sp * dt);
  if (keys.has('KeyS')) camera.position.addScaledVector(fw, -sp * dt);
  if (keys.has('KeyD')) camera.position.addScaledVector(rt, sp * dt);
  if (keys.has('KeyA')) camera.position.addScaledVector(rt, -sp * dt);
  if (keys.has('KeyE')) camera.position.y += sp * dt;
  if (keys.has('KeyQ')) camera.position.y -= sp * dt;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  G.uCamPos.value.copy(camera.position);
  for (const p of places) p.update(dt);
  forest?.update(dt);
  sky.update(hour, camera.position, { cloud: 0.3, rain: 0, fog: Number(q.get('fog') ?? 0.05), storm: 0 }, R.grade, G.uTime.value);
  R.sunDir.copy(sky.sunDir); R.sunColor.copy(sky.sun.color); R.fogColor.copy(sky.fogColor);
  R.render(scene, camera);
  requestAnimationFrame(frame);
}
main().catch((e) => { W.__errors!.push(String(e?.stack ?? e)); W.__ready = true; });
requestAnimationFrame(frame);
