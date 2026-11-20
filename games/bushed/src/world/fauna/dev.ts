// Fauna test page (src/world/fauna/dev.html): the birds in a lineup (each in a chosen clip) for contact sheets, or the
// live birds and bugs round a stand-in player in a small test wood (trunks, snags, a log, stumps, a pond).
//   dev.html?mode=line&light=day|dusk|night     the lineup; window.__fauna.view(bird, 'front'|'q'|'side'|'head'|'walk')
//   dev.html?mode=live&light=...                the managers with forced populations; window.__fauna.birds / .bugs
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Birds, type BirdWorld, type Stand, type Solid } from '../../creatures/birds';
import { Body, BODY, loadBodies, type BodyId } from '../../creatures/birds/assets';
import { Bugs, type BugWorld } from './bugs';

const qs = new URLSearchParams(location.search);
const mode = qs.get('mode') ?? 'line';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 500);
camera.position.set(0, 1.6, 4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.5, 0);

// ---- a little test wood
const LAKE = { x: 26, z: -6, r: 12 };
const waterY = -0.5;
const heightAt = (x: number, z: number) => { const d = Math.hypot(x - LAKE.x, z - LAKE.z); return d < LAKE.r ? -2 * Math.min(1, (LAKE.r - d) / 3) : 0; };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 120, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a4f2c, roughness: 1 }));
{ const p = ground.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i))); ground.geometry.computeVertexNormals(); }
ground.receiveShadow = true; scene.add(ground);
const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 1, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b1416, roughness: 0.1, transparent: true, opacity: 0.92 }));
water.position.set(LAKE.x, waterY, LAKE.z); scene.add(water);
const bark = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 }), snagM = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1 });
const stands: Stand[] = [];
const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
for (let i = 0; i < 26; i++) {
  const a = rng() * Math.PI * 2, d = 4 + rng() * 16, x = Math.sin(a) * d - 4, z = Math.cos(a) * d - 3;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2) continue;
  const dead = i % 7 === 0, r = 0.12 + rng() * 0.16, h = dead ? 6 + rng() * 4 : 9 + rng() * 6;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 10), dead ? snagM : bark);
  m.position.set(x, h / 2, z); m.castShadow = true; scene.add(m);
  if (!dead) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.6, h * 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x24341f, roughness: 1 })); c.position.set(x, h * 0.62, z); c.castShadow = true; scene.add(c); }
  stands.push({ x, y: 0, z, r, h, crown: dead ? 0.4 : 1.4, conifer: true, dead });
}
const solids: Solid[] = [
  { kind: 'log', shape: 'capsule', x: -2.5, y: 0.25, z: 2.2, x2: 1.5, y2: 0.22, z2: 2.8, r: 0.25, h: 0 },
  { kind: 'stump', shape: 'cylinder', x: 2.2, y: 0, z: 1.2, r: 0.32, h: 0.45 },
];
for (const s of solids) {
  if (s.kind === 'log') { const L = Math.hypot(s.x2! - s.x, s.z2! - s.z); const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, L, 12).rotateZ(Math.PI / 2), bark); m.position.set((s.x + s.x2!) / 2, s.y, (s.z + s.z2!) / 2); m.rotation.y = -Math.atan2(s.z2! - s.z, s.x2! - s.x); m.castShadow = true; scene.add(m); }
  else { const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 1.1, s.h, 14), new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 1 })); m.position.set(s.x, s.h / 2, s.z); scene.add(m); }
}

// ---- light
const hemi = new THREE.HemisphereLight(0xbfd2e6, 0x3a3326, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(20, 30, 12); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 }); scene.add(sun);
const fire = new THREE.PointLight(0xff9a50, 0, 9, 1.6); fire.position.set(-1.5, 0.5, -1); scene.add(fire);
const flash = new THREE.SpotLight(0xfff2d8, 0, 25, 0.38, 0.45, 1.4); scene.add(flash, flash.target);
let hour = 12;
function setLight(l: string): void {
  hour = l === 'night' ? 22.5 : l === 'dusk' ? 19.6 : l === 'dawn' ? 6.2 : 12;
  const night = l === 'night';
  hemi.intensity = night ? 0.12 : l === 'dusk' || l === 'dawn' ? 0.55 : 1.1;
  sun.intensity = night ? 0.05 : l === 'dusk' || l === 'dawn' ? 0.8 : 2.6;
  sun.color.set(l === 'dusk' || l === 'dawn' ? 0xffb070 : 0xfff1dc);
  scene.background = new THREE.Color(night ? 0x05070b : l === 'dusk' || l === 'dawn' ? 0x6a5a58 : 0x9fb3c4);
  scene.fog = new THREE.FogExp2(scene.background.getHex(), night ? 0.03 : 0.012);
  fire.intensity = night || l === 'dusk' ? 6 : 0;
  flash.intensity = night ? 6 : 0;
}
setLight(qs.get('light') ?? 'day');

// ---- the lineup: one body of each in a chosen clip
const LINE: { name: string; id: BodyId; clip: string; t: number; at: [number, number, number]; yaw: number; size: number; walk: string; cling?: boolean }[] = [
  { name: 'chickadee', id: 'chickadee', clip: 'idle', t: 0.8, at: [-1.6, 0, 0], yaw: 0.6, size: 0.14, walk: 'fly' },
  { name: 'jay', id: 'jay', clip: 'idle', t: 0.8, at: [-0.9, 0, 0], yaw: 0.6, size: 0.3, walk: 'walk' },
  { name: 'raven', id: 'raven', clip: 'idle', t: 1.0, at: [0, 0, 0], yaw: 0.6, size: 0.67, walk: 'fly' },
  { name: 'grouse', id: 'grouse', clip: 'idle', t: 1.0, at: [1.1, 0, 0], yaw: 0.6, size: 0.45, walk: 'walk' },
  { name: 'woodpecker', id: 'woodpecker', clip: 'idle', t: 1.0, at: [2.2, 0, 0], yaw: 0.6, size: 0.23, walk: 'drum' },
  { name: 'loon', id: 'loon', clip: 'idle', t: 0.5, at: [LAKE.x - LAKE.r + 3, waterY, LAKE.z], yaw: 0.9, size: 0.8, walk: 'idle' },
  { name: 'woodfly', id: 'woodfly', clip: 'fly', t: 0.2, at: [3.2, 1.2, 0], yaw: 0.6, size: 0.4, walk: 'fly' },
  { name: 'grousefly', id: 'grousefly', clip: 'fly', t: 0.2, at: [4.4, 1.2, 0], yaw: 0.6, size: 0.6, walk: 'fly' },
];
const bodies = new Map<string, Body>();
const api: Record<string, unknown> = { ready: false, mode };
(window as unknown as { __fauna: unknown }).__fauna = api;

let birds: Birds | null = null, bugs: Bugs | null = null;
const player = { pos: new THREE.Vector3(0, 0, 3), dir: new THREE.Vector3(0, 0, -1), speed: 0, crouch: false, held: '', hand: new THREE.Vector3(), still: 10, busy: false };
const eye = new THREE.Vector3();
async function start(): Promise<void> {
  if (qs.has('nocoat')) BODY.chickadee.coat = undefined;
  if (mode === 'line') {
    await loadBodies(LINE.map((l) => l.id));
    for (const l of LINE) {
      const b = new Body(l.id);
      b.root.position.set(...l.at);
      b.root.rotation.y = l.yaw;
      b.play(l.clip, 0); b.update(l.t);
      if (qs.has('lambert')) b.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const sm = m.material as THREE.MeshStandardMaterial; m.material = new THREE.MeshLambertMaterial({ map: sm.map, alphaTest: 0.4, side: THREE.DoubleSide }); } });
      if (qs.has('std')) b.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const sm = m.material as THREE.MeshStandardMaterial; m.material = new THREE.MeshStandardMaterial({ map: sm.map, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }); } });
      if (qs.has('normals')) b.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }); });
      if (qs.has('basic')) b.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const sm = m.material as THREE.MeshStandardMaterial; m.material = new THREE.MeshBasicMaterial({ map: sm.map, alphaTest: 0.4, side: THREE.DoubleSide }); } });
      scene.add(b.root); bodies.set(l.name, b);
    }
    // the woodpecker sits up on a trunk of its own
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4, 12), snagM); tr.position.set(2.2, 2, -0.2); scene.add(tr);
    const wp = bodies.get('woodpecker')!;
    wp.root.position.set(2.2, 1.1, -0.2 + 0.2 + 0.035); wp.root.rotation.set(-0.62, Math.PI, 0, 'YXZ');
    LINE.find((l) => l.name === 'woodpecker')!.at = [2.2, 1.1, 0.03];
    api.view = (name: string, v: string, clip?: string, t?: number) => {
      const l = LINE.find((x) => x.name === name)!; const b = bodies.get(name)!;
      for (const [n, o] of bodies) o.root.visible = n === name || v === 'all';
      if (clip) { b.play(clip, 0); b.update(t ?? 0.3); } else { b.play(l.clip, 0); b.update(l.t); }
      const c = new THREE.Vector3(...l.at).add(new THREE.Vector3(0, l.size * (name === 'loon' ? 0.25 : 0.4), 0));
      if (name === 'woodpecker') c.set(2.2, 1.15, 0.0);
      const yaw = (b.root.rotation.y) + (v === 'front' ? 0 : v === 'q' ? 0.75 : v === 'side' ? Math.PI / 2 : v === 'head' ? 0.45 : 0.9);
      const d = l.size * (v === 'head' ? 0.75 : 2.4);
      const head = b.bones.get('Head') ?? b.bones.get('head') ?? b.bones.get('Bip001-head');
      if (v === 'head' && head) head.getWorldPosition(c);
      if (name === 'woodpecker' && v !== 'head') { camera.position.set(c.x + Math.sin(v === 'side' ? 1.5 : v === 'q' ? 0.7 : 0) * d, c.y + 0.05, c.z + Math.cos(v === 'side' ? 1.5 : v === 'q' ? 0.7 : 0) * d); }
      else camera.position.set(c.x + Math.sin(yaw) * d, c.y + d * 0.18, c.z + Math.cos(yaw) * d);
      controls.target.copy(c); camera.lookAt(c); controls.update();
    };
  } else {
    birds = new Birds({ max: 24, radius: [6, 14], despawn: 60 });
    await birds.load();
    bugs = new Bugs();
    scene.add(birds.object, bugs.object);
    const f = qs.get('force');
    if (f) {
      const o: Record<string, number> = {};
      for (const kv of f.split(',')) { const [k, n] = kv.split(':'); o[k] = Number(n ?? 1); }
      const BIRDS = ['chickadee', 'jay', 'raven', 'woodpecker', 'grouse', 'loon'];
      birds.forced = Object.fromEntries(Object.entries(o).filter(([k]) => BIRDS.includes(k)));
      bugs.forced = Object.fromEntries(Object.entries(o).filter(([k]) => !BIRDS.includes(k)));
    }
    api.birds = birds; api.bugs = bugs;
  }
  api.ready = true;
}
api.setLight = setLight;
api.setHour = (h: number) => { hour = h; };
api.camera = camera; api.controls = controls; api.scene = scene;
api.player = player;
api.stump = (x: number, z: number) => bugs?.freshStump(x, 0.45, z, 0.3);
/** put the camera by a bug: d metres off, looking at it */
api.focusBug = (kind: string, d = 0.25, i = 0) => {
  const p = bugs?.find(kind as never, i); if (!p) return false;
  const dir = new THREE.Vector3(0.6, 0.35, 0.75).normalize();
  camera.position.copy(p).addScaledVector(dir, d); controls.target.copy(p); camera.lookAt(p); controls.update();
  return true;
};
api.look = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); camera.lookAt(tx, ty, tz); controls.update(); };

const bw: BirdWorld = {
  dt: 0, time: 0, hour, player, heightAt, waterY, lake: LAKE,
  stands: (x, z, r) => stands.filter((s) => Math.hypot(s.x - x, s.z - z) < r),
  solids: (x, z, r) => solids.filter((s) => Math.hypot(s.x - x, s.z - z) < r),
  food: () => [], take: () => true, sound: () => undefined, say: (_k, t) => console.log('[say]', t), startle: () => undefined,
  habitat: () => ({ conifer: 0.7, birch: 0.3, burn: 0.1, density: 0.6 }), warmth: 1,
};
const gw: BugWorld = {
  dt: 0, time: 0, hour, player: { pos: player.pos, eye, dir: player.dir, speed: 0 }, heightAt, waterY, lake: LAKE,
  lights: [fire.position], flash: null,
  stands: (x, z, r) => stands.filter((s) => Math.hypot(s.x - x, s.z - z) < r),
  solids: (x, z, r) => solids.filter((s) => Math.hypot(s.x - x, s.z - z) < r),
  open: () => 0.8, warmth: 1, rain: 0, swat: false, say: (_k, t) => console.log('[say]', t), swatted: (n) => console.log('[swat]', n),
};
let last = performance.now(), paused = false;
api.pause = (on: boolean) => { paused = on; };
function frame(now: number): void {
  const dt = paused ? 0 : Math.min(0.05, (now - last) / 1000); last = now;
  controls.update();
  camera.getWorldPosition(eye);
  camera.getWorldDirection(player.dir);
  player.hand.copy(eye).addScaledVector(player.dir, 0.5).add(new THREE.Vector3(0, -0.2, 0));
  flash.position.copy(eye); flash.target.position.copy(eye).addScaledVector(player.dir, 5);
  if (birds) { bw.dt = dt; bw.time += dt; bw.hour = hour; birds.update(bw); }
  if (bugs) { gw.dt = dt; gw.time += dt; gw.hour = hour; gw.flash = flash.intensity > 0 ? { pos: eye.clone(), dir: player.dir.clone() } : null; bugs.update(gw); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
start().then(() => requestAnimationFrame(frame)).catch((e) => { console.error(e); api.error = String(e); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
