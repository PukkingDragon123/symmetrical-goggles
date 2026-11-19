// hunting.html: the hunting test page.
//   ?view=buck|doe|bull|cow   a turntable of a game animal with its clips (and its hit zones), day light
//   ?view=world               the real game (terrain, forest, ground cover, FP arms) with the rifle and the hunt
//                             installed: aim, fire, cycle, animals spawned close by, the blood trail, field dressing
// Playwright hooks: window.__hunt (see the bottom of each mode).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GameAnimal, type HuntCtx } from '../creatures/game/animal';
import { G } from '../gfx/globals';

const qs = new URLSearchParams(location.search);
const view = qs.get('view') ?? 'buck';
const ui = {
  who: document.getElementById('who') as HTMLSelectElement,
  spin: document.getElementById('spin') as HTMLInputElement,
  zones: document.getElementById('zones') as HTMLInputElement,
  anims: document.getElementById('anims') as HTMLDivElement,
  info: document.getElementById('info') as HTMLDivElement,
};
ui.who.value = view;
ui.who.onchange = () => { qs.set('view', ui.who.value); location.search = qs.toString(); };
if (qs.has('nospin')) ui.spin.checked = false;
if (qs.has('zones')) ui.zones.checked = true;
const W = () => window.innerWidth, Hh = () => window.innerHeight;

if (view === 'world') runWorld().catch((e) => { ui.info.textContent = String(e?.stack ?? e); console.error(e); });
else studio();

function studio() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W(), Hh());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb4c4);
  scene.fog = new THREE.Fog(0x9fb4c4, 25, 90);
  const camera = new THREE.PerspectiveCamera(35, W() / Hh(), 0.05, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // the stage: a litter-strewn forest floor and a few trunks for scale
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b3423'; g.fillRect(0, 0, 256, 256);
  const cols = ['#2c2a1b', '#4a4128', '#56492c', '#34361f', '#5d5232', '#2a2617', '#6b5a35', '#3f4a26'];
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2)); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 24); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  ground.receiveShadow = true; scene.add(ground);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
  for (const [x, z, rr] of [[-3.5, -4, 0.28], [4.2, -5.5, 0.35], [-6, 2, 0.4], [5.5, 3.5, 0.3]] as const) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.9, rr, 9, 10), trunkMat); m.position.set(x, 4.5, z); m.castShadow = true; scene.add(m); }
  const hemi = new THREE.HemisphereLight(0xbfd2e0, 0x3a3020, 1.0);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.position.set(3, 6, 4);
  scene.add(hemi, sun, sun.target);
  const zoneGroup = new THREE.Group(); scene.add(zoneGroup);

  const species = view === 'bull' || view === 'cow' ? 'moose' : 'deer', male = view === 'buck' || view === 'bull';
  let animal: GameAnimal | null = null, clip = qs.get('clip') ?? 'idle', spinA = Number(qs.get('yaw') ?? 0.6);
  const t0 = performance.now();
  GameAnimal.create(species, male).then((a) => {
    animal = a; scene.add(a.object);
    a.place(0, 0, 0, 0);
    const big = species === 'moose' ? 2 : 1;
    controls.target.set(0, 0.75 * big, 0.1);
    camera.position.set(2.4 * big, 1.25 * big, 2.6 * big);
    if (qs.has('cam')) { const v = qs.get('cam')!.split(',').map(Number); camera.position.set(v[0], v[1], v[2]); if (v.length > 3) controls.target.set(v[3], v[4], v[5]); }
    for (const cl of a.clips) { const b = document.createElement('button'); b.textContent = cl; b.onclick = () => { clip = cl; a.play(cl); refresh(); }; ui.anims.appendChild(b); }
    a.play(clip); refresh();
    const geo = a.mesh.geometry as THREE.BufferGeometry;
    ui.info.textContent = `${a.object.name}: ${geo.index!.count / 3} tris (+fur ${a.fur?.tris ?? 0} tris x shells), ${a.skel.bones.length} bones, ${a.model.den.toFixed(0)} px/m, ready in ${(performance.now() - t0).toFixed(0)} ms`;
    (window as unknown as { __ready: boolean }).__ready = true;
  }).catch((e) => { ui.info.textContent = String(e?.stack ?? e); console.error(e); });
  function refresh() { for (const b of Array.from(ui.anims.children) as HTMLButtonElement[]) b.classList.toggle('on', b.textContent === clip); }

  const player = { pos: new THREE.Vector3(3, 0, 4), speed: 0, crouch: false, light: false, sprint: false };
  const ctx: HuntCtx = {
    dt: 0, time: 0, hour: 12, player, noises: [], wind: { x: 1, z: 0, k: 0.3 }, heightAt: () => 0, waterY: -10,
    emit: () => undefined,
  };
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0xff3020, wireframe: true, transparent: true, opacity: 0.6, depthTest: false });
  function drawZones() {
    zoneGroup.clear();
    if (!animal || !ui.zones.checked) return;
    for (const z of animal.zonesWorld()) {
      const L = z.a.distanceTo(z.b);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(z.r, Math.max(0.001, L), 3, 8), zoneMat);
      m.position.copy(z.a).add(z.b).multiplyScalar(0.5);
      if (L > 1e-4) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), z.b.clone().sub(z.a).normalize());
      m.renderOrder = 10; zoneGroup.add(m);
    }
  }
  let last = performance.now();
  function step(dt: number) {
    G.uTime.value += dt;
    if (ui.spin.checked) spinA += dt * 0.3;
    if (animal) {
      ctx.dt = dt; ctx.time += dt;
      player.pos.set(Math.sin(spinA) * -6, 0, Math.cos(spinA) * -6).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      animal.update(ctx);
      animal.heading = spinA; animal.object.rotation.y = spinA;
      G.uCamPos.value.copy(camera.position);
      drawZones();
    }
    controls.update();
  }
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { renderer.setSize(W(), Hh()); camera.aspect = W() / Hh(); camera.updateProjectionMatrix(); });
  (window as unknown as { __hunt: unknown }).__hunt = {
    step: (n: number, dt = 1 / 30) => { for (let i = 0; i < n; i++) step(dt); renderer.render(scene, camera); },
    play: (c: string) => { clip = c; animal?.play(c); refresh(); },
    cam: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update(); },
    get animal() { return animal; },
  };
}

// ------------------------------------------------------------------------------------------------ the world
async function runWorld() { ui.info.textContent = 'world: todo'; }
