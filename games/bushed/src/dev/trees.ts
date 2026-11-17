// Test page for the forest: terrain patch + Forest + GroundCover, sun + fog + shadows, free-fly / walk camera,
// species lineup (?lineup=1), fps counter.
// URL params: lineup=1, x, z (centre), cam=x,y,z,yaw,pitch, wind=0..1, hour=6..20, res=0.5..1, walk=1, noground=1,
//             nogc=1 (no ground cover), noforest=1, shot=1 (sets window.__ready when the scene has settled)
import * as THREE from 'three';
import { G } from '../gfx/globals';
import { applyPixelTex, loadTex } from '../gfx/tex';
import { heightAt, normalAt, biome } from '../world/layout';
import { buildTree, type TreeForm } from '../trees/build';
import { SPECIES_IDS, type SpeciesId } from '../trees/species';
import { endGrainTexture } from '../trees/textures';
import { Forest } from '../world/forest';
import { GroundCover } from '../world/groundcover';

const Q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (Q.has(k) ? parseFloat(Q.get(k)!) : d);
const lineup = Q.get('lineup') === '1' || Q.get('lineup') === 'gc';
const gcLineup = Q.get('lineup') === 'gc';
if (Q.get('gcdebug') === '1') (globalThis as unknown as { __gcdebug: boolean }).__gcdebug = true;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(num('res', Math.min(1, window.devicePixelRatio)));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fogCol = new THREE.Color(0xa9b5b4);
{
  // test-page sky: a vertical gradient that meets the fog colour at the horizon (the real sky is src/gfx/sky.ts)
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#6f8fae'); gr.addColorStop(0.42, '#9fb4bf'); gr.addColorStop(0.5, '#' + fogCol.getHexString()); gr.addColorStop(1, '#' + fogCol.getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = t;
}
scene.fog = new THREE.FogExp2(fogCol, num('fog', lineup ? 0.004 : 0.0125));

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
function terrainPatch(size: number, seg: number, ox: number, oz: number, hole = 0): THREE.Mesh {
  let g: THREE.BufferGeometry = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox, z = p.getZ(i) + oz;
    p.setXYZ(i, x, lineup ? 0 : heightAt(x, z), z);
    const n = lineup ? [0, 1, 0] : normalAt(x, z);
    nrm.setXYZ(i, n[0], n[1], n[2]);
    uv.setXY(i, x / 3, z / 3);
    // test-page stand-in for the real terrain shader: moss on wet / old ground (vertex colour r = moss weight)
    const b = lineup ? null : biome(x, z);
    const m = b ? Math.min(1, Math.max(0, 0.9 * b.wet + 0.5 * b.old - 0.35 + 0.35 * Math.sin(x * 0.21) * Math.cos(z * 0.17))) : 0;
    col[i * 3] = m; col[i * 3 + 1] = b ? b.burn : 0; col[i * 3 + 2] = 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (hole > 0) {
    // drop the triangles under the detailed patch (a coarse grid would poke through it in valleys)
    const idx = g.index!.array;
    const keep: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      let inside = true;
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k];
        if (Math.abs(p.getX(v) - ox) > hole || Math.abs(p.getZ(v) - oz) > hole) inside = false;
      }
      if (!inside) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    g.setIndex(keep);
  }
  const tex = loadTex('veg/forest_floor.png', { repeat: true });
  const ntex = loadTex('veg/forest_floor_n.png', { repeat: true, srgb: false });
  const moss = loadTex('veg/moss.png', { repeat: true });
  const m = new THREE.MeshStandardMaterial({ map: tex, normalMap: ntex, roughness: 0.97 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMoss = { value: moss };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 color;\nvarying vec3 vGc;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvGc = color;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uMoss;\nvarying vec3 vGc;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 q = floor(vMapUv * 128.0) / 128.0;
          float n = fract(sin(dot(floor(q * 40.0), vec2(12.9898, 78.233))) * 43758.5453);
          float mm = vGc.r + (n - 0.5) * 0.25;
          vec3 mc = texture2D(uMoss, vMapUv * 1.9).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, mc, step(0.45, mm) * 0.9);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.42, 0.4), vGc.g * 0.8);
        }`);
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}
if (Q.get('noground') !== '1') {
  scene.add(terrainPatch(lineup ? 200 : 520, lineup ? 20 : 260, cx, cz));
  if (!lineup) {
    // distant land so the horizon isn't empty
    const far = terrainPatch(2000, 200, cx, cz, 250);
    far.position.y = -0.05;
    scene.add(far);
  }
}

// ------------------------------------------------------------------------------------------- content
let forest: Forest | null = null;
let ground: GroundCover | null = null;
const info: string[] = [];
const t0 = performance.now();

if (gcLineup) {
  ground = new GroundCover(scene, camera, {});
  const show = ground.showcase(new THREE.Vector3(-27, 0, -30), 6, 10);
  scene.add(show);
  ground.group.visible = false;
  info.push(ground.protoNames().map((n, i) => `${i}:${n}`).join(' '));
  // the glb prototypes arrive asynchronously: re-run the showcase after a moment
  setTimeout(() => { scene.remove(show); scene.add(ground!.showcase(new THREE.Vector3(-27, 0, -30), 6, 10)); }, num('glbwait', 2500));
} else if (lineup) {
  const forms: { age: number; form?: TreeForm }[] = [
    { age: 0.08 }, { age: 0.25 }, { age: 0.5 }, { age: 0.8 }, { age: 1.0 }, { age: 1.0, form: 'broken' }, { age: 0.9, form: 'snag' },
  ];
  let tris = 0;
  const only = Q.get('only');
  SPECIES_IDS.forEach((sp, si) => {
    if (only && only !== sp) return;
    forms.forEach((f, fi) => {
      const m = buildTree(sp, 11 + fi * 7 + si, { age: sp === 'cedar' ? f.age * 1.15 : f.age, form: f.form });
      const o = m.object();
      const spacing = sp === 'cedar' ? 16 : 10;
      o.position.set((fi - 3) * spacing, 0, only ? 0 : (si - 2) * 22);
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
  if (Q.get('nogc') !== '1') ground = new GroundCover(scene, camera, { forest });
  if (forest && Q.get('vstats') === '1') info.push(forest.variantStats());
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
  // spawn somewhere not inside a trunk
  let bx = cx, bz = cz;
  if (forest) {
    for (let k = 0; k < 200; k++) {
      const a = k * 2.4, r = Math.sqrt(k) * 1.5;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!forest.trunkColliders(x, z, 3).length) { bx = x; bz = z; break; }
    }
  }
  camera.position.set(bx, heightAt(bx, bz) + 1.7, bz);
}
if (forest && Q.get('prewarm')) forest.prewarm(camera.position.x, camera.position.z, num('prewarm', 400));
// ?apitest=1 : exercise the Forest / GroundCover API and print the results in the HUD
if (forest && Q.get('apitest') === '1') {
  const p0 = camera.position;
  const t1 = performance.now();
  const near = forest.near(p0.x, p0.z, 12);
  const cols = forest.trunkColliders(p0.x, p0.z, 12);
  info.push(`near(12): ${near.length} trees, nearest ${near[0]?.species} id ${near[0]?.id} at ${near[0] ? Math.hypot(near[0].x - p0.x, near[0].z - p0.z).toFixed(1) : '-'} m; colliders ${cols.length}`);
  if (near.length) {
    const t = near[0];
    const m = t.model();
    // aim at the trunk centre 1.2 m up (lean / sweep included, rotated into the world)
    const [lx, lz] = m.centerAt(1.2);
    const cr = Math.cos(t.rotY), sr = Math.sin(t.rotY);
    const tx = t.x + cr * lx + sr * lz, tz = t.z - sr * lx + cr * lz;
    const o = new THREE.Vector3(t.x + (p0.x - t.x) * 3, t.y + 1.2, t.z + (p0.z - t.z) * 3);
    const dir = new THREE.Vector3(tx - o.x, 0, tz - o.z).normalize();
    const hit = forest.raycastTrunk(o, dir, 30);
    info.push(`model: ${m.species} h ${m.height.toFixed(1)} dbh ${m.dbh.toFixed(2)} r(1.3) ${m.radiusAt(1.3).toFixed(3)} outline ${m.outlineAt(1.3).length} pts, limbs ${m.branches.length}, mass ${m.mass.toFixed(0)} kg`);
    info.push(hit ? `raycast (target ${t.id}): id ${hit.ref.id} h ${hit.h.toFixed(2)} dist ${hit.point.distanceTo(o).toFixed(2)} normal ${hit.normal.x.toFixed(2)},${hit.normal.z.toFixed(2)}` : 'raycast: miss');
    if (Q.get('detach') === '1') {
      const d = forest.detach(t.id);
      scene.add(d.object);
      const names = d.object.children.map((c) => c.name);
      info.push(`detach: ${names.length} children: ${names.slice(0, 4).join(', ')} ... ${names[names.length - 1]}; near now ${forest.near(p0.x, p0.z, 12).length}`);
      // tilt it a little so the detached copy is obviously separate from the instanced forest
      d.object.rotation.z = 0.25;
      (d.object.userData.setWind as (k: number) => void)(0);
    }
    if (near[1]) { forest.remove(near[1].id); info.push(`remove: id ${near[1].id} gone -> treeAt ${forest.treeAt(near[1].id)}`); }
  }
  if (ground) {
    const so = ground.solids(p0.x, p0.z, 40);
    const k: Record<string, number> = {};
    for (const x of so) k[x.kind] = (k[x.kind] ?? 0) + 1;
    info.push(`solids(40): ${JSON.stringify(k)}`);
  }
  info.push(`api calls ${(performance.now() - t1).toFixed(1)} ms`);
}
// ?look=log|rock|stump : frame the nearest such thing
if (ground && Q.get('look')) {
  const kind = Q.get('look');
  const p0 = camera.position;
  const all = ground.solids(p0.x, p0.z, 90).filter((s) => s.kind === kind && (kind !== 'log' || s.r > num('minr', 0)));
  all.sort((a, b) => Math.hypot(a.x - p0.x, a.z - p0.z) - Math.hypot(b.x - p0.x, b.z - p0.z));
  const t = all[num('pick', 0)];
  if (t) {
    const tx = t.x2 !== undefined ? (t.x + t.x2) / 2 : t.x, tz = t.z2 !== undefined ? (t.z + t.z2) / 2 : t.z;
    const ty = t.y2 !== undefined ? (t.y + t.y2) / 2 : t.y;
    const dist = num('dist', 3 + t.r * 3), a = num('ang', 0.7);
    const ex = tx + Math.cos(a) * dist, ez = tz + Math.sin(a) * dist;
    camera.position.set(ex, Math.max(heightAt(ex, ez) + 1.6, ty + 0.8), ez);
    yaw = Math.atan2(-(tx - ex), -(tz - ez));
    pitch = Math.atan2(ty - camera.position.y, dist);
    info.push(`looking at ${t.kind} r ${t.r.toFixed(2)} at ${tx.toFixed(1)}, ${tz.toFixed(1)}`);
  }
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
  if (!gcLineup) ground?.update(camera);
  renderer.render(scene, camera);
  const ri = renderer.info.render;
  hud.textContent = `${fps.toFixed(0)} fps  ${(ri.triangles / 1000).toFixed(0)}k tris  ${ri.calls} calls  ${walk ? 'walk' : 'fly'}  wind ${G.uWindStrength.value.toFixed(2)}\n` +
    `pos ${camera.position.x.toFixed(1)} ${camera.position.y.toFixed(1)} ${camera.position.z.toFixed(1)} yaw ${yaw.toFixed(2)} pitch ${pitch.toFixed(2)}\n` +
    (forest ? forest.stats() + '\n' : '') + (ground ? ground.stats() + '\n' : '') + info.join('\n');
  (window as unknown as { __frame: number }).__frame = frame;
  (window as unknown as { __hud: string }).__hud = hud.textContent;
  if (frame < stopAt) requestAnimationFrame(tick);
}
const stopAt = num('stop', 1e12);
requestAnimationFrame(tick);
void applyPixelTex;
