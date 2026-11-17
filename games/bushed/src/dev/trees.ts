// Test page for the forest: terrain patch + Forest + GroundCover, sun + fog + shadows, free-fly / walk camera,
// species lineup (?lineup=1), fps counter.
// URL params: lineup=1, x, z (centre), cam=x,y,z,yaw,pitch, wind=0..1, hour=6..20, res=0.5..1, walk=1, noground=1,
//             nogc=1 (no ground cover), noforest=1, shot=1 (sets window.__ready when the scene has settled)
import * as THREE from 'three';
import { G } from '../gfx/globals';
import { applyPixelTex, loadTex } from '../gfx/tex';
import { heightAt, normalAt } from '../world/layout';
import { buildTree, type TreeForm } from '../trees/build';
import { SPECIES_IDS, type SpeciesId } from '../trees/species';
import { endGrainTexture } from '../trees/textures';
import { Forest } from '../world/forest';
import { GroundCover } from '../world/groundcover';

const Q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (Q.has(k) ? parseFloat(Q.get(k)!) : d);
const lineup = Q.get('lineup') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(num('res', Math.min(1, window.devicePixelRatio)));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fogCol = new THREE.Color(0xa9b5b4);
scene.background = fogCol.clone();
scene.fog = new THREE.FogExp2(fogCol, lineup ? 0.004 : 0.0125);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);

// ------------------------------------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xc4d4e0, 0x4a4030, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 45;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
let hour = num('hour', 10.5);
function placeSun(): void {
  const t = (hour - 6) / 12; // 0 sunrise .. 1 sunset
  const el = Math.max(0.08, Math.sin(t * Math.PI)) * 1.05;
  const az = -Math.PI * 0.75 + t * Math.PI * 1.1;
  sun.position.set(camera.position.x + Math.cos(az) * Math.cos(el) * 120, camera.position.y + Math.sin(el) * 120, camera.position.z + Math.sin(az) * Math.cos(el) * 120);
  sun.target.position.set(camera.position.x, camera.position.y - 4, camera.position.z);
  // snap the shadow camera to texels to avoid shimmering
  sun.target.updateMatrixWorld();
  const warm = 1 - Math.sin(t * Math.PI);
  sun.color.setRGB(1, 0.94 - 0.2 * warm, 0.84 - 0.35 * warm);
  sun.intensity = 2.2 + 0.8 * Math.sin(t * Math.PI);
}

// ------------------------------------------------------------------------------------------- ground
const cx = num('x', lineup ? 0 : 60), cz = num('z', lineup ? 0 : 330);
function terrainPatch(size: number, seg: number, ox: number, oz: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, z = p.getZ(i) + oz;
    p.setXYZ(i, x, lineup ? 0 : heightAt(x, z), z);
    const n = lineup ? [0, 1, 0] : normalAt(x, z);
    nrm.setXYZ(i, n[0], n[1], n[2]);
    uv.setXY(i, x / 3, z / 3);
  }
  const tex = loadTex('veg/forest_floor.png', { repeat: true });
  const ntex = loadTex('veg/forest_floor_n.png', { repeat: true, srgb: false });
  const m = new THREE.MeshStandardMaterial({ map: tex, normalMap: ntex, roughness: 0.97 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}
if (Q.get('noground') !== '1') {
  scene.add(terrainPatch(lineup ? 200 : 520, lineup ? 20 : 260, cx, cz));
  if (!lineup) {
    // distant land so the horizon isn't empty
    const far = terrainPatch(2000, 200, cx, cz);
    far.position.y = -0.05;
    scene.add(far);
  }
}

// ------------------------------------------------------------------------------------------- content
let forest: Forest | null = null;
let ground: GroundCover | null = null;
const info: string[] = [];
const t0 = performance.now();

if (lineup) {
  const forms: { age: number; form?: TreeForm }[] = [
    { age: 0.08 }, { age: 0.25 }, { age: 0.5 }, { age: 0.8 }, { age: 1.0 }, { age: 1.0, form: 'broken' }, { age: 0.9, form: 'snag' },
  ];
  let tris = 0;
  SPECIES_IDS.forEach((sp, si) => {
    forms.forEach((f, fi) => {
      const m = buildTree(sp, 11 + fi * 7 + si, { age: sp === 'cedar' ? f.age * 1.15 : f.age, form: f.form });
      const o = m.object();
      const spacing = sp === 'cedar' ? 16 : 10;
      o.position.set((fi - 3) * spacing, 0, (si - 2) * 22);
      scene.add(o);
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh) tris += ((c as THREE.Mesh).geometry.index!.count / 3); });
      if (fi === 4) info.push(`${sp}: h ${m.height.toFixed(1)} m dbh ${m.dbh.toFixed(2)} m mass ${(m.mass / 1000).toFixed(1)} t limbs ${m.branches.length}`);
    });
  });
  info.push(`lineup tris ${(tris / 1000).toFixed(0)}k, built in ${(performance.now() - t0).toFixed(0)} ms`);
  // end grain samples on little stands
  SPECIES_IDS.forEach((sp, i) => {
    const t = endGrainTexture(sp, sp === 'cedar' ? 0.6 : 0.25, 3);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    disc.geometry.attributes.uv.array.forEach((_, k, arr) => { /* circle uvs already 0..1 */ void arr; void k; });
    disc.position.set(-38 + i * 1.6, 0.02, 48);
    scene.add(disc);
  });
} else {
  if (Q.get('noforest') !== '1') forest = new Forest(scene, camera, renderer);
  if (Q.get('nogc') !== '1') ground = new GroundCover(scene, camera);
}

// ------------------------------------------------------------------------------------------- camera control
const cam = (Q.get('cam') ?? '').split(',').map(parseFloat);
let yaw = 0, pitch = 0;
if (cam.length >= 3 && !cam.some(isNaN)) {
  camera.position.set(cam[0], cam[1], cam[2]);
  yaw = cam[3] ?? 0; pitch = cam[4] ?? 0;
} else if (lineup) {
  camera.position.set(0, 9, 95); yaw = 0; pitch = -0.08;
} else {
  camera.position.set(cx, heightAt(cx, cz) + 1.7, cz);
}
let walk = Q.get('walk') === '1';
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyG') walk = !walk;
  if (e.code === 'KeyL') { location.search = lineup ? '' : '?lineup=1'; }
  if (e.code === 'KeyT') hour = hour >= 19 ? 6.5 : hour + 1.5;
  const d = '12345'.indexOf(e.key);
  if (d >= 0) G.uWindStrength.value = [0.05, 0.25, 0.45, 0.7, 1.0][d];
});
addEventListener('keyup', (e) => keys.delete(e.code));
let drag = false;
renderer.domElement.addEventListener('pointerdown', () => { drag = true; });
addEventListener('pointerup', () => { drag = false; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw -= e.movementX * 0.004;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.004));
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
G.uWindStrength.value = num('wind', 0.35);

// ------------------------------------------------------------------------------------------- loop
const hud = document.getElementById('hud')!;
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0, frame = 0;
const clock = { t: num('t', 0) };
function tick(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frame++;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  // camera
  const fast = keys.has('ShiftLeft') ? 4 : 1;
  const sp = (walk ? 2.2 : 12) * fast * dt;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  if (keys.has('KeyW')) camera.position.addScaledVector(fwd, sp);
  if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -sp);
  if (keys.has('KeyD')) camera.position.addScaledVector(right, sp);
  if (keys.has('KeyA')) camera.position.addScaledVector(right, -sp);
  if (keys.has('KeyE')) camera.position.y += sp;
  if (keys.has('KeyQ')) camera.position.y -= sp;
  if (walk && !lineup) camera.position.y = heightAt(camera.position.x, camera.position.z) + 1.7;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  // globals
  clock.t += dt;
  G.uTime.value = clock.t;
  G.uGust.value += dt * (0.6 + 1.6 * G.uWindStrength.value);
  G.uCamPos.value.copy(camera.position);
  // the player pushes vegetation (slot 0)
  G.uPushers.value[0].set(camera.position.x, camera.position.y - 1.6, camera.position.z, walk ? 0.6 : 0);
  placeSun();
  forest?.update(dt);
  ground?.update(camera);
  renderer.render(scene, camera);
  const ri = renderer.info.render;
  hud.textContent = `${fps.toFixed(0)} fps  ${(ri.triangles / 1000).toFixed(0)}k tris  ${ri.calls} calls  ${walk ? 'walk' : 'fly'}  wind ${G.uWindStrength.value.toFixed(2)}\n` +
    `pos ${camera.position.x.toFixed(1)} ${camera.position.y.toFixed(1)} ${camera.position.z.toFixed(1)} yaw ${yaw.toFixed(2)} pitch ${pitch.toFixed(2)}\n` +
    (forest ? forest.stats() + '\n' : '') + (ground ? ground.stats() + '\n' : '') + info.join('\n');
  (window as unknown as { __frame: number }).__frame = frame;
  (window as unknown as { __hud: string }).__hud = hud.textContent;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
void applyPixelTex;
