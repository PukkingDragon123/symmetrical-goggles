// Test stage for the four real-model cryptids (tools/blender/cryptids4): a turntable and headless AI sims on a small
// terrain (a knoll for the gouger, a bank for the hoop snake), day or night. Serve the game folder with vite and open
// tools/blender/cryptids4/preview/index.html?who=gouger. Playwright hooks on window.__c4 (see the bottom).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SidehillGouger } from '../../../../src/creatures/cryptids/gouger';
import { HoopSnake } from '../../../../src/creatures/cryptids/hoopsnake';
import { SplinterCat } from '../../../../src/creatures/cryptids/splintercat';
import { GoofusBird } from '../../../../src/creatures/cryptids/goofus';
import { loadReal, type RealCryptid } from '../../../../src/creatures/cryptids/real';
import type { CreatureCtx, GroundItem, PlayerView } from '../../../../src/creatures/types';

const qs = new URLSearchParams(location.search);
const who = qs.get('who') ?? 'gouger';
const W = Number(qs.get('w') ?? 640), H = Number(qs.get('h') ?? 480);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W / H, 0.03, 400);
scene.add(camera);
const info = document.getElementById('info')!;

// ---- terrain per creature
const heightAt = (x: number, z: number): number => {
  if (who === 'gouger') return 5 * Math.exp(-((x * x + z * z) / 81));
  if (who === 'hoopsnake') return Math.min(8, Math.max(0, 4 - 0.5 * z));
  return 0;
};
function groundTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!; g.fillStyle = '#3b3423'; g.fillRect(0, 0, 256, 256);
  const cols = ['#2c2a1b', '#4a4128', '#56492c', '#34361f', '#5d5232', '#2a2617', '#6b5a35', '#3f4a26'];
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
// test trunks
const TRUNKS: { x: number; z: number; r: number }[] = who === 'hoopsnake' ? [{ x: 0.6, z: 17, r: 0.3 }, { x: -6, z: 4, r: 0.35 }, { x: 5, z: 20, r: 0.32 }]
  : who === 'splintercat' ? [{ x: 0, z: -9, r: 0.3 }, { x: 6, z: 5, r: 0.28 }, { x: -7, z: 3, r: 0.35 }, { x: 3, z: 12, r: 0.3 }]
    : who === 'goofus' ? [{ x: 1.5, z: 0, r: 0.45 }, { x: -6, z: 14, r: 0.3 }, { x: 8, z: 26, r: 0.3 }] : [{ x: -16, z: 6, r: 0.3 }, { x: 15, z: -9, r: 0.35 }];
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
const trunkObjs = new Map<string, THREE.Mesh>();
for (const t of TRUNKS) { const m = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.85, t.r, 12, 10), trunkMat); m.position.set(t.x, heightAt(t.x, t.z) + 6, t.z); m.castShadow = true; scene.add(m); trunkObjs.set(`${t.x},${t.z}`, m); }
const trunks = (x: number, z: number, r: number) => TRUNKS.filter((t) => Math.hypot(t.x - x, t.z - z) < r);

// ---- light
const hemi = new THREE.HemisphereLight(0xbfd2e0, 0x3a3020, 1.0);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -12; sc.right = sc.top = 12; sc.far = 60;
sun.position.set(6, 14, 8); scene.add(hemi, sun, sun.target);
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
const HOME: Record<string, THREE.Vector3> = { gouger: new THREE.Vector3(0, 5, 0), hoopsnake: new THREE.Vector3(0, 7, -6), splintercat: new THREE.Vector3(0, 0, 0), goofus: new THREE.Vector3(0, 0, 0) };
const home = HOME[who] ?? new THREE.Vector3();
let cur: RealCryptid;
function make(): RealCryptid {
  const o = { pos: home.clone(), heading: 0 };
  return who === 'hoopsnake' ? new HoopSnake(o) : who === 'splintercat' ? new SplinterCat(o) : who === 'goofus' ? new GoofusBird(o) : new SidehillGouger(o);
}
const player: PlayerView & { action?: string } = { pos: new THREE.Vector3(0, 1.0, 20), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0, light: false, speed: 0 };
const items: GroundItem[] = [];
const events: string[] = [];
let T = 0;
const ctx = (dt: number): CreatureCtx => ({
  dt, time: T, hour, player, heightAt, trunks, items, kindness: 0.5, fires: [], lost: false,
  emit: (e, d) => { if (e === 'step') return; const x = d as Record<string, unknown>; events.push(`${T.toFixed(1)} ${e}${x?.fell ? ' FELL' : ''}${x?.smash ? ' SMASH' : ''}${x?.give ? ' GIVE ' + (x.give as { item: string }).item : ''}${x?.damage ? ' DMG ' + x.damage : ''}`); },
  takeItem: (id) => { const i = items.findIndex((x) => x.id === id); if (i < 0) return false; items.splice(i, 1); return true; },
});
const pmark = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a3030 }));
scene.add(pmark);
let jumpH = 0;
function step(dt: number) { T += dt; player.pos.y = heightAt(player.pos.x, player.pos.z) + 0.9 + jumpH; cur.update(ctx(dt)); }

// ---- hooks for Playwright
async function setup() {
  await loadReal(who === 'gouger' ? 'gouger' : who);
  cur = make(); scene.add(cur.object);
  (window as unknown as { __c4: unknown }).__c4 = {
    ready: true, cur, items, player, events, trunks: TRUNKS, heightAt,
    clips: () => cur.clips,
    /** pose a clip at time t (stepped at 30 Hz, the AI off), heading, and render from cam to target */
    shot(o: { clip?: string; t?: number; heading?: number; light?: string; cam: [number, number, number]; target: [number, number, number]; fov?: number; hide?: boolean; ai?: boolean; set?: Record<string, unknown>; at?: [number, number, number] }) {
      if (o.light) setLight(o.light);
      if (o.at) home.set(...o.at);
      if (o.set) Object.assign(cur, o.set);
      if (o.clip) cur.play(o.clip); else if (!o.ai) cur.play(cur.clips.includes('idle') ? 'idle' : cur.clips[0]);
      const n = Math.round((o.t ?? 0.5) * 30);
      for (let i = 0; i < n; i++) { step(1 / 30); if (!o.ai) { cur.pos.copy(home); cur.heading = o.heading ?? 0; cur.object.position.copy(home); cur.object.rotation.y = cur.heading; } }
      if (!o.ai && o.set) Object.assign(cur, o.set);
      pmark.visible = !o.hide; pmark.position.copy(player.pos);
      camera.fov = o.fov ?? 35; camera.updateProjectionMatrix();
      camera.position.set(...o.cam); camera.lookAt(new THREE.Vector3(...o.target));
      renderer.render(scene, camera);
      return `${cur.state} clip=${(cur as unknown as { clip: string }).clip}`;
    },
    /** run the AI with a scripted player for `seconds`; returns the state / event log */
    sim(o: { script: string; seconds: number; hour?: number }) {
      if (o.hour !== undefined) hour = o.hour;
      const log: string[] = []; let last = ''; events.length = 0;
      const dt = 1 / 30;
      for (let i = 0; i < o.seconds * 30; i++) {
        script(o.script, T, dt);
        step(dt);
        const st = `${cur.state}`;
        if (st !== last) { log.push(`${T.toFixed(1)} -> ${st} pos=${cur.pos.x.toFixed(1)},${cur.pos.z.toFixed(1)} p=${player.pos.x.toFixed(1)},${player.pos.z.toFixed(1)}`); last = st; }
        while (events.length) log.push('   ' + events.shift());
      }
      pmark.position.copy(player.pos);
      return log.join('\n');
    },
    /** a camera near the creature: offset in its own frame (x its left, z ahead), looking at its body */
    follow(o: [number, number, number], fov = 40, up = 0.3) {
      const h = cur.heading, p = cur.object.position, tp = new THREE.Vector3(); cur.tilt.getWorldPosition(tp); tp.y += up;
      camera.position.set(p.x + Math.cos(h) * o[0] + Math.sin(h) * o[2], tp.y + o[1], p.z - Math.sin(h) * o[0] + Math.cos(h) * o[2]);
      pmark.position.copy(player.pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(tp); renderer.render(scene, camera);
    },
    render(cam: [number, number, number], target: [number, number, number], fov = 40) { pmark.position.copy(player.pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.position.set(...cam); camera.lookAt(new THREE.Vector3(...target)); renderer.render(scene, camera); },
  };
  info.textContent = `${who}: ${cur.clips.join(' ')}`;
}
let t0 = -1;
function walk(to: THREE.Vector3, v: number, dt: number) { const d = to.clone().sub(player.pos).setY(0); const L = d.length(); if (L > 0.05) { player.pos.addScaledVector(d.normalize(), Math.min(L, v * dt)); player.dir.copy(d).normalize(); } player.speed = L > 0.05 ? v : 0; }
function script(s: string, t: number, dt: number) {
  if (t0 < 0) t0 = t;
  const k = t - t0;
  const c = cur as unknown as Record<string, unknown>;
  switch (s) {
    // gouger: stand on its track ahead of it, then step off uphill as it charges
    case 'charge': if (k < 0.1) player.pos.set(-10, 0, 0); if (c.state === 'charge' && cur.pos.distanceTo(player.pos) < 6) walk(new THREE.Vector3(-6, 0, 0), 5, dt); break;
    // gouger: hold chanterelles and back away onto the flat
    case 'lure': if (k < 0.1) player.pos.set(0, 0, 13); player.held = 'chanterelle'; if (cur.pos.distanceTo(player.pos) < 4) walk(new THREE.Vector3(0, 0, 30), 1.1, dt); if (c.state === 'toppled' && k > 0) { player.held = 'none'; walk(cur.pos, 1.5, dt); if (cur.pos.distanceTo(player.pos) < 2) (cur as unknown as { tipUp(): boolean }).tipUp(); } break;
    // hoop snake: walk along below the bank, step aside when it is close
    case 'roll': if (k < 0.1) player.pos.set(-8, 0, 16); if (c.state !== 'roll') walk(new THREE.Vector3(0.6, 0, 16), 1.2, dt); else if (cur.pos.distanceTo(player.pos) < 3.5) walk(new THREE.Vector3(4, 0, 16), 4, dt); break;
    case 'jump': if (k < 0.1) player.pos.set(0, 0, 14); { const d = Math.hypot(cur.pos.x - player.pos.x, cur.pos.z + 1.3 - player.pos.z); jumpH = c.state === 'roll' && d < 3 ? 0.8 : 0; } break;
    case 'tree': if (k < 0.1) player.pos.set(0.6, 0, 15.6); if (c.state === 'roll' && Math.hypot(cur.pos.x - player.pos.x, cur.pos.z - player.pos.z) < 7) walk(new THREE.Vector3(3.5, 0, 15.6), 5, dt); break;
    // splinter cat: syrup by a tree (free felling)
    case 'syrup': if (k === 0) { player.pos.set(0, 0, 25); items.push({ id: 'syrup1', kind: 'syrup', pos: new THREE.Vector3(0.6, 0, -9) }); } break;
    case 'night': if (k < 0.1) player.pos.set(0, 0, 30); break;
    // goofus: walk a loop round the stage
    case 'trail': { const a = k * 0.08; walk(new THREE.Vector3(Math.sin(a) * 18, 0, 8 + Math.cos(a) * 14), 2, dt); if (Math.abs(k - 20) < dt) items.push({ id: 'jerky1', kind: 'jerky', pos: player.pos.clone() }); break; }
    case 'bread': player.held = 'bread'; walk(new THREE.Vector3(0, 0, 8), 1.5, dt); if (k > 18 && Math.floor(k * 2) !== Math.floor((k - dt) * 2) && cur.offer('bread')) events.push('(fed)'); break;
  }
}
setup();
