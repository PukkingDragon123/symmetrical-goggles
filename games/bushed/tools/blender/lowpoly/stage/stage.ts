// Test stage for the four working cryptids (roperite, hugag, billdad, wapaloosie): a meadow with a few trunks, a log
// and a strip of lake; day or night; turntable shots and scripted sims of each one's wild behaviour and its job
// (hauling the log, leaning a tree over, fishing, scouting). Serve the game folder with vite and open
// tools/blender/lowpoly/stage/index.html?who=roperite. Playwright drives window.__stage (bottom).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Roperite, type HaulRef } from '../../../../src/creatures/cryptids/roperite';
import { Hugag } from '../../../../src/creatures/cryptids/hugag';
import { Billdad } from '../../../../src/creatures/cryptids/billdad';
import { Wapaloosie } from '../../../../src/creatures/cryptids/wapaloosie';
import { loadReal } from '../../../../src/creatures/cryptids/real';
import type { HelperCryptid } from '../../../../src/creatures/cryptids/helper';
import type { CreatureCtx, GroundItem, PlayerView } from '../../../../src/creatures/types';
import { puffs } from '../../../../src/gfx/particles';

const qs = new URLSearchParams(location.search);
const who = qs.get('who') ?? 'roperite';
const W = Number(qs.get('w') ?? 640), H = Number(qs.get('h') ?? 480);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W / H, 0.03, 400);
scene.add(camera);
puffs.setCamera(camera);
scene.add((puffs as unknown as { mesh?: THREE.Object3D }).mesh ?? new THREE.Group());
const info = document.getElementById('info')!;

// ---- ground at 2.6 m; the lake (x > 9) drops to 0.5 under water at WORLD.waterY = 2
const LAKE_X = 9;
const heightAt = (x: number, _z: number): number => (x < LAKE_X ? 2.6 : x < LAKE_X + 3 ? 2.6 - (x - LAKE_X) * 0.7 : 0.5);
function groundTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!; g.fillStyle = '#3d3a22'; g.fillRect(0, 0, 256, 256);
  const cols = ['#2c2a1b', '#4a4628', '#56502c', '#34401f', '#5d5a32', '#2a2e17', '#6b6235', '#3f4a26'];
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2)); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const geo = new THREE.PlaneGeometry(90, 90, 180, 180).rotateX(-Math.PI / 2);
const pa = geo.attributes.position as THREE.BufferAttribute;
for (let i = 0; i < pa.count; i++) pa.setY(i, heightAt(pa.getX(i), pa.getZ(i)));
geo.computeVertexNormals();
const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.95 }));
ground.receiveShadow = true; scene.add(ground);
const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 90).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c3038, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }));
water.position.set(LAKE_X + 20, 2.0, 0); scene.add(water);
// trunks: a stand of spruce (the wapaloosie's, the hugag's push)
const TRUNKS: { x: number; z: number; r: number }[] = [{ x: -4, z: -6, r: 0.32 }, { x: 3, z: -10, r: 0.28 }, { x: -9, z: 4, r: 0.4 }, { x: -2, z: 9, r: 0.3 }];
const bark = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
const trunkObjs: THREE.Object3D[] = [];
for (const t of TRUNKS) {
  const g = new THREE.Group(); g.position.set(t.x, heightAt(t.x, t.z), t.z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.45, t.r, 22, 10), bark); m.position.y = 11; m.castShadow = true; g.add(m);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 9), new THREE.MeshStandardMaterial({ color: 0x1f3322, roughness: 0.95 })); crown.position.y = 19.5; crown.castShadow = true; g.add(crown);
  scene.add(g); trunkObjs.push(g);
}
const fallen = new Set<number>();
const trunks = (x: number, z: number, r: number) => TRUNKS.filter((t, i) => !fallen.has(i) && Math.hypot(t.x - x, t.z - z) < r);
// a log to haul
const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 4, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5c4030, roughness: 0.9 }));
log.castShadow = true; log.position.set(-6, heightAt(-6, 14) + 0.25, 14); scene.add(log);
// the truck's tailgate stand-in
const gate = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.7 }));
gate.position.set(4, heightAt(4, 20) + 0.5, 22); scene.add(gate);

// ---- light
const hemi = new THREE.HemisphereLight(0xbfd2e0, 0x3a3020, 1.0);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -16; sc.right = sc.top = 16; sc.far = 80;
sun.position.set(6, 20, 8); scene.add(hemi, sun, sun.target);
const ENV = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const flash = new THREE.SpotLight(0xfff4e0, 0, 40, 0.42, 0.6, 1.5); camera.add(flash, flash.target); flash.target.position.set(0, 0, -5);
let hour = 13;
function setLight(mode: string) {
  if (mode === 'night') {
    hour = 23.5; hemi.intensity = 0.07; hemi.color.set(0x5a6a9a); sun.intensity = 0.12; sun.color.set(0x8fa6ff); flash.intensity = 30;
    scene.background = new THREE.Color(0x05070b); scene.fog = new THREE.Fog(0x05070b, 8, 40); renderer.toneMappingExposure = 1.2; scene.environment = null;
  } else {
    hour = 13; hemi.intensity = 1.0; hemi.color.set(0xbfd2e0); sun.intensity = 2.6; sun.color.set(0xfff0d8); flash.intensity = 0;
    scene.background = new THREE.Color(0x9fb4c4); scene.fog = new THREE.Fog(0x9fb4c4, 30, 120); renderer.toneMappingExposure = 1.0; scene.environment = ENV; scene.environmentIntensity = 0.45;
  }
}
setLight(qs.get('light') ?? 'day');

// ---- the creature and a stand-in player
const HOME: Record<string, THREE.Vector3> = { roperite: new THREE.Vector3(0, 2.6, 0), hugag: new THREE.Vector3(0, 2.6, 0), billdad: new THREE.Vector3(LAKE_X - 0.6, 2.6, 0), wapaloosie: new THREE.Vector3(-4, 2.6, -5) };
const home = HOME[who].clone();
let cur: HelperCryptid;
function make(): HelperCryptid {
  const o = { pos: home.clone(), heading: who === 'billdad' ? Math.PI / 2 : 0 };
  return who === 'hugag' ? new Hugag(o) : who === 'billdad' ? new Billdad(o) : who === 'wapaloosie' ? new Wapaloosie(o) : new Roperite(o);
}
const player: PlayerView & { action?: string } = { pos: new THREE.Vector3(0, 3.5, 20), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0, light: false, speed: 0 };
const items: GroundItem[] = [];
const events: string[] = [];
let T = 0;
let falling: { obj: THREE.Object3D; dx: number; dz: number; k: number } | null = null;
const ctx = (dt: number): CreatureCtx => ({
  dt, time: T, hour, player, heightAt, trunks, items, kindness: 0.5, fires: [], lost: false,
  emit: (e, d) => {
    const x = d as Record<string, unknown>;
    if (e === 'reply' || e === 'treat') { events.push(`${T.toFixed(1)} ${e}: ${x.line}`); return; }
    events.push(`${T.toFixed(1)} ${e}${x?.fell ? ' FELL' : ''}${x?.give ? ' GIVE ' + (x.give as { item: string }).item : ''}${x?.damage ? ' DMG ' + x.damage : ''}${x?.r ? ' R ' + x.r : ''}`);
    // the stage's own world: a pushed tree falls, a scout logs
    const f = x?.fell as { x: number; z: number; dx: number; dz: number } | undefined;
    if (f) { const i = TRUNKS.findIndex((t) => Math.hypot(t.x - f.x, t.z - f.z) < 1); if (i >= 0) { fallen.add(i); falling = { obj: trunkObjs[i], dx: f.dx, dz: f.dz, k: 0 }; } }
  },
  takeItem: (id) => { const i = items.findIndex((x) => x.id === id); if (i < 0) return false; items.splice(i, 1); return true; },
});
const pmark = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a3030 }));
scene.add(pmark);
const haul: HaulRef = { pos: log.position.clone(), to: new THREE.Vector3(gate.position.x, 0, gate.position.z - 3), mass: 250, piece: log };
const _h = new THREE.Vector3();
function step(dt: number) {
  T += dt; player.pos.y = heightAt(player.pos.x, player.pos.z) + 0.9;
  cur.update(ctx(dt));
  puffs.update(dt);
  // the stage's physics: the log follows the roperite's rope
  if (cur instanceof Roperite && cur.towing) {
    cur.hitch(_h);
    const d = Math.hypot(_h.x - log.position.x, _h.z - log.position.z), L = 3.5;
    if (d > L) { const k = (d - L) / d; log.position.x += (_h.x - log.position.x) * k; log.position.z += (_h.z - log.position.z) * k; log.rotation.y = Math.atan2(_h.x - log.position.x, _h.z - log.position.z) + Math.PI / 2; }
  }
  haul.pos.copy(log.position);
  if (falling && falling.k < 1) { falling.k = Math.min(1, falling.k + dt * (0.15 + falling.k * 1.6)); const a = falling.k * falling.k * Math.PI / 2; falling.obj.rotation.set(falling.dz * a, 0, -falling.dx * a); }
}

// ---- hooks for Playwright
async function setup() {
  await loadReal(who);
  cur = make(); scene.add(cur.object);
  (window as unknown as { __stage: unknown }).__stage = {
    ready: true, cur, items, player, events, trunks: TRUNKS, heightAt, log, haul,
    clips: () => cur.clips,
    /** pose a clip at time t (the AI off), heading, and render from cam to target */
    shot(o: { clip?: string; t?: number; heading?: number; light?: string; cam: [number, number, number]; target: [number, number, number]; fov?: number; hide?: boolean; set?: Record<string, unknown> }) {
      if (o.light) setLight(o.light);
      if (o.set) Object.assign(cur, o.set);
      cur.play(o.clip ?? 'idle');
      const n = Math.round((o.t ?? 0.5) * 30);
      for (let i = 0; i < n; i++) { step(1 / 30); cur.pos.copy(home); cur.heading = o.heading ?? 0; cur.object.position.copy(home); cur.object.rotation.y = cur.heading; }
      pmark.visible = !o.hide; pmark.position.copy(player.pos);
      camera.fov = o.fov ?? 35; camera.updateProjectionMatrix();
      camera.position.set(...o.cam); camera.lookAt(new THREE.Vector3(...o.target));
      renderer.render(scene, camera);
      return `${cur.state} clip=${(cur as unknown as { clip: string }).clip}`;
    },
    /** run the AI with a scripted player for `seconds` (stops early at `until` state); returns the state / event log */
    sim(o: { script: string; seconds: number; hour?: number; until?: string }) {
      cur.play(null);
      if (o.hour !== undefined) hour = o.hour;
      const log: string[] = []; let last = ''; events.length = 0;
      const dt = 1 / 30;
      for (let i = 0; i < o.seconds * 30; i++) {
        script(o.script, T, dt);
        step(dt);
        const st = `${cur.state}${cur.job ? ':' + cur.job.step : ''}`;
        if (st !== last) { log.push(`${T.toFixed(1)} -> ${st} pos=${cur.pos.x.toFixed(1)},${cur.pos.y.toFixed(1)},${cur.pos.z.toFixed(1)}`); last = st; }
        while (events.length) log.push('   ' + events.shift());
        if (o.until && st === o.until) break;
      }
      pmark.position.copy(player.pos);
      return log.join('\n');
    },
    follow(o: [number, number, number], fov = 40, up = 0.3) {
      const h = cur.heading, p = cur.object.position, tp = new THREE.Vector3(); cur.tilt.getWorldPosition(tp); tp.y += up;
      camera.position.set(p.x + Math.cos(h) * o[0] + Math.sin(h) * o[2], tp.y + o[1], p.z - Math.sin(h) * o[0] + Math.cos(h) * o[2]);
      pmark.position.copy(player.pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(tp); renderer.render(scene, camera);
    },
    render(cam: [number, number, number], target: [number, number, number], fov = 40, light?: string) { if (light) setLight(light); pmark.position.copy(player.pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.position.set(...cam); camera.lookAt(new THREE.Vector3(...target)); renderer.render(scene, camera); },
  };
  info.textContent = `${who}: ${cur.clips.join(' ')}`;
}
let t0 = -1;
let sent = false;
function walk(to: THREE.Vector3, v: number, dt: number) { const d = to.clone().sub(player.pos).setY(0); const L = d.length(); if (L > 0.05) { player.pos.addScaledVector(d.normalize(), Math.min(L, v * dt)); player.dir.copy(d).normalize(); } player.speed = L > 0.05 ? v : 0; }
function script(s: string, t: number, dt: number) {
  if (t0 < 0) t0 = t;
  const k = t - t0;
  switch (s) {
    // wild roperite: walk into its meadow and stand there
    case 'meadow': if (k < 0.1) player.pos.set(0, 0, 18); if (k < 4) walk(new THREE.Vector3(0, 0, 12), 1.4, dt); break;
    // tame: fed twice, then sent at the log
    case 'haul': if (!sent) { player.pos.set(2, 0, 18); cur.trust = 1; sent = cur.command('log', log.position, { ref: haul }); } break;
    case 'push': if (!sent) { player.pos.set(-4, 0, 2); cur.trust = 1; const t = TRUNKS[0]; sent = cur.command('tree', new THREE.Vector3(t.x, 0, t.z), { dir: new THREE.Vector3(t.x - player.pos.x, 0, t.z - player.pos.z).normalize(), r: t.r }); } break;
    case 'stampede': if (k < 0.1) player.pos.set(0, 0, 14); walk(new THREE.Vector3(0, 0, 4), 6, dt); player.noise = 1; break;
    case 'fish': if (!sent) { player.pos.set(LAKE_X - 3, 0, 6); cur.trust = 1; sent = cur.command('water', new THREE.Vector3(LAKE_X + 12, 2, 2)); } break;
    case 'perch': if (k < 0.1) player.pos.set(-12, 0, 0); break;
    case 'scout': if (!sent) { player.pos.set(-1, 0, 2); cur.trust = 1; const t = TRUNKS[2]; sent = cur.command('tree', new THREE.Vector3(t.x, 0, t.z)); } break;
    case 'tree': if (k < 0.1) player.pos.set(2, 0, 4); break;
  }
}
setup();
