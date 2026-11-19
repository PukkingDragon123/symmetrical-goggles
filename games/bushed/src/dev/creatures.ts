// creatures.html: the creature test page. A turntable per creature with an animation picker, day / dusk / night
// lighting (night has a flashlight on the camera), and an AI demo where a stand-in player walks about holding jerky.
// Playwright hooks: window.__creatures (see bottom).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AxehandleHound } from '../creatures/hound';
import { Bigfoot } from '../creatures/bigfoot';
import { Gumberoo } from '../creatures/gumberoo';
import { Dingbat, DingbatRoost } from '../creatures/dingbat';
import { GrannyTamarack } from '../creatures/granny';
import type { CreatureCtx, GroundItem } from '../creatures/types';
import { preloadCreatures } from '../creatures/preload';
import { Wildlife, Critter } from '../creatures/wildlife';
import type { Species } from '../creatures/wildlife/models';
import { PROFILE } from '../creatures/anatomy';
import { G } from '../gfx/globals';
import { CRYPTID_DEV, isCryptid, cryptidDemo, simCryptid, testTrunks } from '../creatures/cryptids/dev';
import { Cryptid } from '../creatures/cryptids/base';
import { puffs, debris } from '../gfx/particles';

const ui = {
  who: document.getElementById('who') as HTMLSelectElement,
  light: document.getElementById('light') as HTMLSelectElement,
  spin: document.getElementById('spin') as HTMLInputElement,
  ai: document.getElementById('ai') as HTMLInputElement,
  wire: document.getElementById('wire') as HTMLInputElement,
  fur: document.getElementById('fur') as HTMLInputElement,
  mood: document.getElementById('mood') as HTMLSelectElement,
  wind: document.getElementById('wind') as HTMLInputElement,
  offer: document.getElementById('offer') as HTMLButtonElement,
  shake: document.getElementById('shake') as HTMLButtonElement,
  wet: document.getElementById('wet') as HTMLButtonElement,
  snow: document.getElementById('snow') as HTMLButtonElement,
  anims: document.getElementById('anims') as HTMLDivElement,
  info: document.getElementById('info') as HTMLDivElement,
};
const qs = new URLSearchParams(location.search);
if (qs.has('clean')) document.body.classList.add('clean');
const W = () => window.innerWidth, Hh = () => window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(qs.get('pr') ?? 1)));
renderer.setSize(W(), Hh());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W() / Hh(), 0.05, 400);
camera.position.set(2.6, 1.1, 2.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.4, 0);
controls.enableDamping = true;

// ------------------------------------------------------------------------------------------------ the stage
function groundTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b3423'; g.fillRect(0, 0, 256, 256);
  const cols = ['#2c2a1b', '#4a4128', '#56492c', '#34361f', '#5d5232', '#2a2617', '#6b5a35', '#3f4a26'];
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; const w = 1 + Math.floor(r() * 3); g.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), w, 1 + Math.floor(r() * 2)); }
  for (let i = 0; i < 90; i++) { g.strokeStyle = r() < 0.5 ? '#6e5c33' : '#2a2214'; g.beginPath(); const x = r() * 256, y = r() * 256, a = r() * 6; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.95 }));
ground.receiveShadow = true;
scene.add(ground);
// a stove-ish block and a few trunks for scale (test props)
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
for (const [x, z, r] of [[-3.5, -4, 0.28], [4.2, -5.5, 0.35], [-6, 2, 0.4], [5.5, 3.5, 0.3]] as const) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, 9, 10), trunkMat); m.position.set(x, 4.5, z); m.castShadow = true; scene.add(m);
}

const hemi = new THREE.HemisphereLight(0xbfd2e0, 0x3a3020, 1.0);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(hemi, sun, sun.target);
scene.add(puffs.mesh, debris.mesh); // steam, snow spray, thrown bark (the cryptids use the game's particles)
const flash = new THREE.SpotLight(0xfff1d6, 0, 40, 0.42, 0.45, 1.4);
flash.castShadow = true; flash.shadow.mapSize.set(1024, 1024); flash.shadow.bias = -0.0005;
camera.add(flash); flash.position.set(0.15, -0.12, 0); camera.add(flash.target); flash.target.position.set(0, -0.05, -1);
scene.add(camera); puffs.setCamera(camera);

// environment maps for the steel: a sky-and-forest gradient by day, a dark one by night
const pmrem = new THREE.PMREMGenerator(renderer);
function envFrom(top: number, mid: number, low: number, sunC?: number): THREE.Texture {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const cols: number[] = [];
  const pos = geo.attributes.position;
  const a = new THREE.Color(top), b = new THREE.Color(mid), c = new THREE.Color(low);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const col = y > 0 ? b.clone().lerp(a, Math.min(1, y * 1.6)) : b.clone().lerp(c, Math.min(1, -y * 3)); cols.push(col.r, col.g, col.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // dark tree trunks round the horizon
  for (let k = 0; k < 28; k++) { const an = (k / 28) * Math.PI * 2 + (k % 3) * 0.07; const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 + (k % 4) * 0.2, 6, 0.5), new THREE.MeshBasicMaterial({ color: low })); m.position.set(Math.cos(an) * 8, 1.5, Math.sin(an) * 8); s.add(m); }
  if (sunC) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: sunC })); m.position.set(5, 6, 3); s.add(m); }
  return pmrem.fromScene(s, 0.02).texture;
}
const ENV = {
  day: envFrom(0x8fb3d9, 0xb9c3b8, 0x2e2a1c, 0xfff6e0),
  dusk: envFrom(0x3a3f63, 0xc98a5a, 0x1e1912, 0xffb070),
  night: envFrom(0x070a12, 0x0c1016, 0x050605),
};

let lightMode = qs.get('light') ?? 'day';
let hour = 12;
function setLight(mode: string) {
  lightMode = mode; ui.light.value = mode;
  if (mode === 'day') {
    hour = 12; hemi.intensity = 1.0; hemi.color.set(0xbfd2e0); hemi.groundColor.set(0x3a3020);
    sun.intensity = 2.6; sun.color.set(0xfff0d8); sun.position.set(3, 6, 4); flash.intensity = 0;
    scene.background = new THREE.Color(0x9fb4c4); scene.fog = new THREE.Fog(0x9fb4c4, 25, 90); scene.environment = ENV.day; renderer.toneMappingExposure = 1.0;
  } else if (mode === 'dusk') {
    hour = 19.6; hemi.intensity = 0.45; hemi.color.set(0x7c7ea8); hemi.groundColor.set(0x2a1d14);
    sun.intensity = 1.6; sun.color.set(0xffa060); sun.position.set(-6, 1.6, 2); flash.intensity = 0;
    scene.background = new THREE.Color(0x5b5470); scene.fog = new THREE.Fog(0x4a4558, 12, 60); scene.environment = ENV.dusk; renderer.toneMappingExposure = 1.1;
  } else if (mode === 'fog') {
    // a thick grey fog by day: silhouettes at 15-30 m
    hour = 9; hemi.intensity = 0.8; hemi.color.set(0xb4bcc0); hemi.groundColor.set(0x3a3a32);
    sun.intensity = 0.5; sun.color.set(0xe8ecf0); sun.position.set(2, 8, 3); flash.intensity = 0;
    scene.background = new THREE.Color(0x8d9597); scene.fog = new THREE.Fog(0x8d9597, 1.5, 24); scene.environment = ENV.dusk; renderer.toneMappingExposure = 1.0;
  } else if (mode === 'nightfog') {
    hour = 23.5; hemi.intensity = 0.09; hemi.color.set(0x6a7890); hemi.groundColor.set(0x0a0a0a);
    sun.intensity = 0.08; sun.color.set(0x8fa6ff); sun.position.set(-3, 7, -4); flash.intensity = 32;
    scene.background = new THREE.Color(0x0e1216); scene.fog = new THREE.Fog(0x0e1216, 1.0, 16); scene.environment = ENV.night; renderer.toneMappingExposure = 1.25;
  } else {
    hour = 23.5; hemi.intensity = 0.06; hemi.color.set(0x5a6a9a); hemi.groundColor.set(0x0a0a0a);
    sun.intensity = 0.12; sun.color.set(0x8fa6ff); sun.position.set(-3, 7, -4); flash.intensity = 32;
    scene.background = new THREE.Color(0x05070b); scene.fog = new THREE.Fog(0x05070b, 6, 30); scene.environment = ENV.night; renderer.toneMappingExposure = 1.2;
  }
}

// ------------------------------------------------------------------------------------------------ creatures
type Beast = AxehandleHound | Bigfoot | Gumberoo | GrannyTamarack | Cryptid;
// the six lumber-camp cryptids (src/creatures/cryptids) join the picker
for (const [k, d] of Object.entries(CRYPTID_DEV)) ui.who.add(new Option(d.label, k));
const made: Partial<Record<string, Beast>> = {};
let cur: Beast | null = null, curName = '';
let spinA = 0;
// wildlife: a lineup of every species to look at, and a live population round the stand-in player (AI demo)
const SPECIES: Species[] = ['squirrel', 'hare', 'grouse', 'raven', 'jay', 'chickadee'];
const lineup = new THREE.Group(); const lineCritters: Critter[] = [];
const wild = new Wildlife({ max: 12, radius: [6, 14], despawn: 30, waterY: -10 });
function showWildlife() {
  if (cur) scene.remove(cur.object);
  scene.remove(batStage); scene.remove(eave); if (roost) scene.remove(roost.object);
  cur = null; curName = 'wildlife'; ui.who.value = 'wildlife';
  if (!lineCritters.length) SPECIES.forEach((k, i) => { const c = new Critter(k); c.reset((i - 2.5) * 0.55, 0, 0); c.heading = 0.6; lineCritters.push(c); lineup.add(c.object); });
  scene.add(lineup); scene.add(wild.object);
  controls.target.set(0, 0.15, 0); camera.position.set(0.6, 0.9, 2.6);
  ui.anims.innerHTML = '';
  for (const st of ['perch', 'move', 'fly', 'freeze']) { const b = document.createElement('button'); b.textContent = st; b.onclick = () => { for (const c of lineCritters) c.state = (st === 'fly' && !c.bird) ? 'move' : (st === 'perch' && !c.bird) ? 'idle' : st as Critter['state']; }; ui.anims.appendChild(b); }
  ui.info.textContent = 'wildlife: ' + SPECIES.map((k) => k + ' ' + (lineCritters[SPECIES.indexOf(k)].mesh.geometry.index!.count / 3) + ' tris').join(', ');
}
// dingbats: one bat on the turntable (hung from a test beam for the roost clips), and the roost under a test eave
// (AI demo): a wall, an eave beam, and the stand-in player strolling about with a flashlight
const batStage = new THREE.Group();
let bat: Dingbat | null = null, roost: DingbatRoost | null = null, batClip = 'hang';
const eave = new THREE.Group();
{
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.3), wood); wall.position.set(0, 1.3, -1.9); wall.castShadow = wall.receiveShadow = true;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.16, 0.5), wood); beam.position.set(0, 2.68, -1.55); beam.castShadow = beam.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 1.4), wood); roof.position.set(0, 2.85, -1.4); roof.rotation.x = 0.25; roof.castShadow = true;
  eave.add(wall, beam, roof);
}
const turnBeam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.9 }));
turnBeam.position.set(0, 1.275, 0); batStage.add(turnBeam);
function showDingbat() {
  if (cur) scene.remove(cur.object);
  scene.remove(lineup); scene.remove(wild.object);
  cur = null; curName = 'dingbat'; ui.who.value = 'dingbat';
  const t0 = performance.now();
  if (!bat) { bat = new Dingbat(); batStage.add(bat.object); }
  if (!roost) { roost = new DingbatRoost({ pos: new THREE.Vector3(0, 2.6, -1.5), heading: 0, count: 9, span: 3.2 }); roost.alwaysOut = true; }
  scene.add(batStage);
  controls.target.set(0, 1.0, 0); camera.position.set(0.75, 1.15, 0.85);
  ui.anims.innerHTML = '';
  for (const c of bat.clips) { const b = document.createElement('button'); b.textContent = c; b.onclick = () => { ui.ai.checked = false; batClip = c; bat!.play(c); refreshBat(); }; ui.anims.appendChild(b); }
  bat.play(batClip); refreshBat();
  const geo = bat.mesh.geometry as THREE.BufferGeometry, st = bat.model;
  ui.info.textContent = `dingbat: ${geo.index!.count / 3} tris, ${bat.skel.bones.length} bones, built in ${(performance.now() - t0).toFixed(0)} ms\n${st.den.toFixed(0)} px/m\n${st.stats}`;
  (window as unknown as { __info: string }).__info = ui.info.textContent;
}
function refreshBat() { for (const b of Array.from(ui.anims.children) as HTMLButtonElement[]) b.classList.toggle('on', b.textContent === batClip); }
/** the single bat on the turntable: hung from the test beam for the roost clips, level for the flight clips */
function batPreview(dt: number) {
  if (!bat) return;
  const hang = batClip === 'hang' || batClip === 'wake' || batClip === 'land';
  bat.spot.set(0, 1.25, 0); bat.spotHeading = spinA; bat.yaw = spinA; bat.vel.set(0, 0, 0);
  bat.hangW = hang ? 1 : 0;
  if (hang) bat.hangPos(bat.pos); else bat.pos.set(0, 0.95, 0);
  turnBeam.visible = hang; turnBeam.rotation.y = spinA;
  bat.place(dt); bat.pose(dt, camera.position);
}
/** the roost demo: the stand-in player strolls in front of the cabin wall, now and then shining the light up at the eave */
function roostDemo(dt: number, t: number, script = 'demo') {
  if (!roost) return;
  const a = t * 0.18;
  player.pos.set(Math.sin(a) * 4, 1.7, 3 + Math.cos(a) * 1.5);
  const cyc = t % 24;
  player.light = lightMode === 'night' || lightMode === 'nightfog' || script === 'light';
  const aim = script === 'light' ? t > 2 && t < 4.5 : cyc > 6 && cyc < 8.5;
  if (aim) player.dir.set(0, 2.6, -1.5).sub(player.pos).normalize();
  else player.dir.set(-Math.cos(a), -0.1, Math.sin(a)).normalize();
  player.noise = 0.1; player.held = 'flashlight';
  roost.update({ ...ctxFor(dt, t), hour: hour > 6 && hour < 18 ? 23 : hour, player: { ...player, speed: 1 } });
}
function pick(name: string) {
  if (name === 'wildlife') { showWildlife(); return; }
  if (name === 'dingbat') { showDingbat(); return; }
  scene.remove(lineup); scene.remove(wild.object); scene.remove(batStage); scene.remove(eave); if (roost) scene.remove(roost.object);
  const t0 = performance.now();
  if (!made[name] && isCryptid(name)) made[name] = CRYPTID_DEV[name].make();
  if (!made[name]) made[name] = name === 'hound' ? new AxehandleHound({ state: 'companion', trust: 1 }) : name === 'gumberoo' ? new Gumberoo({ pos: new THREE.Vector3() }) : name === 'granny' ? new GrannyTamarack({ pos: new THREE.Vector3(), present: true }) : new Bigfoot({});
  const ms = performance.now() - t0;
  if (cur) scene.remove(cur.object);
  cur = made[name]!; curName = name; ui.who.value = name; (window as unknown as { __dbg: Beast }).__dbg = cur;

  scene.add(cur.object);
  cur.play(cur.clips.includes('idle') ? 'idle' : cur.clips[0]);
  const tall = name === 'bigfoot' || name === 'granny', big = name === 'gumberoo';
  controls.target.set(0, tall ? 1.4 : big ? 0.7 : 0.4, 0);
  camera.position.set(tall ? 5.5 : big ? 3.6 : 2.4, tall ? 2.0 : big ? 1.6 : 1.0, tall ? 5.5 : big ? 3.6 : 2.4);
  if (isCryptid(name)) { controls.target.set(...CRYPTID_DEV[name].target); camera.position.set(...CRYPTID_DEV[name].cam); }
  ui.anims.innerHTML = '';
  for (const c of cur.clips) {
    const b = document.createElement('button'); b.textContent = c;
    b.onclick = () => { ui.ai.checked = false; cur!.play(c); refreshButtons(); };
    ui.anims.appendChild(b);
  }
  refreshButtons();
  const geo = (cur.mesh.geometry as THREE.BufferGeometry);
  const st = (cur as unknown as { model?: { stats: string; den: number } }).model;
  const fur = (cur as unknown as Furry).fur;
  ui.info.textContent = `${name}: ${geo.index!.count / 3} tris, ${cur.skel.bones.length} bones, built in ${ms.toFixed(0)} ms` + (fur ? `\nfur: ${fur.tris} tris x ${fur.shellCount} shells (1 draw), ${fur.cards} fin cards` : '') + (st ? `\n${st.den.toFixed(0)} px/m\n${st.stats}` : '');
  applyFurUi();
  (window as unknown as { __info: string }).__info = ui.info.textContent;
}
function refreshButtons() { for (const b of Array.from(ui.anims.children) as HTMLButtonElement[]) b.classList.toggle('on', b.textContent === cur?.manual); }

// the stand-in player for the AI demo
const player = { pos: new THREE.Vector3(0, 1.7, 4), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0.1, light: false, action: undefined as string | undefined };
const items: GroundItem[] = [];
const events: string[] = [];
function ctxFor(dt: number, t: number): CreatureCtx {
  return {
    dt, time: t, hour, player, heightAt: () => 0,
    emit: (ev) => { events.push(ev); if (events.length > 6) events.shift(); },
    items, takeItem: (id) => { const k = items.findIndex((i) => i.id === id); if (k < 0) return false; items.splice(k, 1); return true; },
    dropItem: (kind, pos) => { const id = kind + Math.random().toString(36).slice(2, 6); items.push({ id, kind, pos: pos.clone() }); return id; },
    kindness: 0.8, threats: [], stove: new THREE.Vector3(-2, 0, -2),
    fog: lightMode === 'fog' || lightMode === 'nightfog' ? 0.9 : 0.1, lost: true,
  };
}

// ------------------------------------------------------------------------------------------------ loop
let last = performance.now(), T = 0, frozen = false;
function frame(dt: number) {
  puffs.update(dt); debris.update(dt);
  T += dt; G.uTime.value = T; G.uCamPos.value.copy(camera.position);
  if (curName === 'wildlife') {
    for (const c of lineCritters) { c.t += dt; if (c.state === 'move' || c.state === 'fly') c.phase = (c.phase + dt * 2.2) % 1; c.speed = c.state === 'move' ? 1 : 0; if (c.state === 'fly') { c.alt = 0.35; } else c.alt = 0; c.object.position.set(c.pos.x, c.alt, c.pos.z); c.object.rotation.set(0, c.heading, 0); c.pose(dt); }
    if (ui.ai.checked) {
      lineup.visible = false;
      const a = T * 0.15; player.pos.set(Math.sin(a) * 5, 1.7, Math.cos(a) * 5); player.dir.set(Math.cos(a), 0, -Math.sin(a));
      wild.forced = { squirrel: 2, hare: 1, raven: 1, jay: 1, chickadee: 2, grouse: 1 };
      const tr = (x: number, z: number, r: number) => [[-3.5, -4, 0.28], [4.2, -5.5, 0.35], [-6, 2, 0.4], [5.5, 3.5, 0.3]].filter(([tx, tz]) => Math.hypot(tx - x, tz - z) < r).map(([tx, tz, tr2]) => ({ x: tx, z: tz, r: tr2 }));
      wild.update({ ...ctxFor(dt, T), trunks: tr });
      ui.info.textContent = `wildlife: ${wild.count} active\nevents: ${events.join(' ')}`;
    } else lineup.visible = true;
    return;
  }
  if (curName === 'dingbat') {
    if (ui.ai.checked && roost) {
      scene.remove(batStage); scene.add(eave); scene.add(roost.object);
      roostDemo(dt, T);
      ui.info.textContent = `dingbats: ${roost.state} irritation ${roost.irritation.toFixed(2)} agitation ${roost.agitation.toFixed(1)}\n${roost.bats.map((b) => b.mode).join(' ')}\nevents: ${events.join(' ')}`;
    } else {
      scene.add(batStage); scene.remove(eave); if (roost) scene.remove(roost.object);
      if (ui.spin.checked) spinA += dt * 0.35;
      batPreview(dt);
    }
    return;
  }
  if (!cur) return;
  if (ui.ai.checked) {
    if (cur.manual) cur.play(null);
    // the player strolls a slow figure-eight round the creature's area, holding jerky half the time
    const a = T * 0.12;
    player.pos.set(Math.sin(a) * 6, 1.7, Math.sin(a * 2) * 3.5);
    player.held = Math.floor(T / 12) % 2 ? (cur instanceof GrannyTamarack ? 'cookies' : 'jerky') : 'none';
    if (cur instanceof Cryptid) cryptidDemo(cur, player, T, events);
    if (cur instanceof GrannyTamarack) {
      if (!cur.present) cur.appear(new THREE.Vector3(0, 0, 0));
      if (player.held === 'cookies' && Math.floor(T * 2) !== Math.floor((T - dt) * 2) && cur.offer('cookies')) events.push('(offered)');
    }
    player.light = lightMode === 'night';
    player.dir.copy(cur.object.position).sub(player.pos).normalize();
  } else {
    // turntable: the creature stays at the origin and turns; the player stands where the camera is
    player.pos.copy(camera.position); player.held = 'none'; player.light = lightMode === 'night';
    cur.pos.set(0, 0, 0);
    if (ui.spin.checked) spinA += dt * 0.35;
    cur.heading = spinA;
  }
  cur.update(cur instanceof Cryptid ? { ...ctxFor(dt, T), trunks: testTrunks } : ctxFor(dt, T));
  if (!ui.ai.checked) { cur.pos.set(0, 0, 0); cur.object.position.set(0, 0, 0); cur.heading = spinA; cur.object.rotation.y = spinA; }
  if (ui.ai.checked) ui.info.textContent = `${curName}: ${cur.state}${'trust' in cur ? ' trust ' + cur.trust.toFixed(2) : ''}${cur instanceof GrannyTamarack ? ' fade ' + cur.fade.value.toFixed(2) + (cur.fed ? ' fed' : '') : ''}  clip ${cur.anim.current}\nevents: ${events.join(' ')}`;
}
function render() { controls.update(); renderer.render(scene, camera); }
function loop() {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!frozen) frame(dt);
  render();
  requestAnimationFrame(loop);
}

ui.who.onchange = () => pick(ui.who.value);
ui.light.onchange = () => setLight(ui.light.value);
ui.wire.onchange = () => { if (cur) (cur.mesh.material as THREE.MeshStandardMaterial).wireframe = ui.wire.checked; };
window.addEventListener('resize', () => { camera.aspect = W() / Hh(); camera.updateProjectionMatrix(); renderer.setSize(W(), Hh()); });

// ---- fur, faces and food
type Furry = { fur?: { shells: THREE.Object3D; fins: THREE.Object3D | null; tris: number; cards: number; shellCount: number; distance: number; wet: number | null; snow: number | null } | null; faceMood?: string | null; favoriteFood?: string; offer?: (item: string) => boolean; shakeOff?: () => void };
/** every furry thing on stage (the current creature, the bat, the wildlife lineup) */
function furries(): Furry[] {
  const out: Furry[] = [];
  if (cur) out.push(cur as unknown as Furry);
  if (curName === 'dingbat') { if (bat) out.push(bat as unknown as Furry); if (roost) for (const b of roost.bats) out.push(b as unknown as Furry); }
  if (curName === 'wildlife') for (const c of [...lineCritters, ...wild.active]) out.push(c as unknown as Furry);
  return out;
}
function applyFurUi() { for (const f of furries()) if (f.fur) { f.fur.shells.visible = ui.fur.checked; if (f.fur.fins) f.fur.fins.visible = ui.fur.checked; } }
ui.fur.onchange = applyFurUi;
ui.mood.onchange = () => { for (const f of furries()) if ('faceMood' in f) f.faceMood = ui.mood.value || null; };
ui.wind.oninput = () => { G.uWindStrength.value = Number(ui.wind.value); };
ui.offer.onclick = () => {
  if (curName === 'dingbat' && roost) { player.pos.set(0, 1.7, 1.5); events.push('offer maple_syrup -> ' + roost.offer('maple_syrup')); return; }
  if (curName === 'wildlife') { events.push('offer nuts -> ' + wild.offer('nuts')); return; }
  const c = cur as unknown as Furry;
  if (c?.offer && c.favoriteFood) { (cur as unknown as { pos: THREE.Vector3 }).pos.set(0, 0, 0); player.pos.set(0, 1.7, 1.6); events.push('offer ' + c.favoriteFood + ' -> ' + c.offer(c.favoriteFood)); ui.info.textContent = events.join(' '); }
};
ui.shake.onclick = () => { const c = cur as unknown as Furry; c?.shakeOff?.(); };
let wetOn = false, snowOn = false;
ui.wet.onclick = () => { wetOn = !wetOn; G.uWet.value = wetOn ? 1 : 0; };
ui.snow.onclick = () => { snowOn = !snowOn; G.uSnow.value = snowOn ? 1 : 0; };

setLight(lightMode);
// load the models without stalling: from the IndexedDB cache, or built in ~30 ms slices; a meter records the worst
// gap between frames while that happens (?nocache=1 forces a rebuild, ?sync=1 builds on the spot as before)
let loadInfo = '';
async function start() {
  if (!qs.has('sync')) {
    ui.info.textContent = 'loading creature models...';
    const t0 = performance.now();
    let worst = 0, lastF = t0, loading = true;
    const meter = () => { const n = performance.now(); worst = Math.max(worst, n - lastF); lastF = n; if (loading) requestAnimationFrame(meter); };
    requestAnimationFrame(meter);
    PROFILE.on = true;
    await preloadCreatures({ cache: !qs.has('nocache'), onProgress: (d, n, name) => { ui.info.textContent = `loaded ${name} (${d}/${n})`; } });
    loading = false;
    console.log('slow steps:', PROFILE.slow.join(' | '));
    loadInfo = `preloaded in ${(performance.now() - t0).toFixed(0)} ms (${qs.has('nocache') ? 'built' : 'cache or built'}), worst frame gap ${worst.toFixed(0)} ms`;
  }
  pick(qs.get('who') ?? 'hound');
  if (qs.get('clip')) cur!.play(qs.get('clip'));
  ui.info.textContent += '\n' + loadInfo;
  (window as unknown as { __creatures: { ready: boolean } }).__creatures.ready = true;
}
loop();

// ------------------------------------------------------------------------------------------------ headless AI sims
/** the dingbat roost under an eave at (0, 2.6, -1.5) facing +z; the player stands 6 m out in front.
 *  scripts: 'quiet' (dark and still: nothing happens), 'light' (the flashlight on the roost at 5-7 s, then off and
 *  still), 'lit' (the light left on the swarm), 'noise' (sprinting past at 5-8 s), 'chop' (chopping 4 m from the wall
 *  at 5-9 s), 'day' (noon: tucked away) */
function simRoost(script: string, seconds: number, hr: number): string {
  const log: string[] = [];
  const r = new DingbatRoost({ pos: new THREE.Vector3(0, 2.6, -1.5), heading: 0, count: 9, span: 3.2 });
  const pl = { pos: new THREE.Vector3(1, 1.7, 6), dir: new THREE.Vector3(0, 0, -1), held: 'flashlight', crouch: false, noise: 0.05, light: false, action: undefined as string | undefined, speed: 0 };
  let T1 = 0, last = '', near = 0;
  const hour = script === 'day' ? 12 : hr;
  for (let k = 0; k < seconds * 60; k++) {
    const dt = 1 / 60; T1 += dt;
    pl.light = false; pl.action = undefined; pl.noise = 0.05; pl.speed = 0;
    pl.dir.set(0, -0.2, -1).normalize();
    if (script === 'light' && T1 > 5 && T1 < 7) { pl.light = true; pl.dir.set(0, 2.6, -1.5).sub(pl.pos).normalize(); }
    if (script === 'lit' && T1 > 5) { pl.light = true; pl.dir.set(0, 2.6, -1.5).sub(pl.pos).normalize(); if (T1 > 9) pl.dir.set(0, 0.3, -1).normalize(); }
    if (script === 'noise' && T1 > 5 && T1 < 8) { pl.noise = 1; pl.speed = 5; pl.pos.x = -6 + (T1 - 5) * 4; }
    if (script === 'chop' && T1 > 5 && T1 < 9) { pl.pos.set(2, 1.7, 2.5); pl.action = Math.floor(T1 * 1.2) % 2 ? 'chop' : 'swing'; pl.noise = 0.7; }
    // 'syrup': the light sets them off at 5 s; at 9 s the player walks under the eave and holds out maple syrup
    if (script === 'syrup') {
      if (T1 > 5 && T1 < 7) { pl.light = true; pl.dir.set(0, 2.6, -1.5).sub(pl.pos).normalize(); }
      if (T1 > 9) { pl.pos.set(0.5, 1.7, 1.5); pl.held = 'maple_syrup'; pl.light = T1 > 12; if (Math.abs(T1 - 9.5) < 1 / 120) log.push(`${T1.toFixed(1)} offer syrup -> ${r.offer('maple_syrup')}`); }
    }
    r.update({ dt, time: T1, hour, player: pl, heightAt: () => 0, emit: (e, d) => { const x = d as { left?: number }; log.push(`${T1.toFixed(1)} ${e}${x.left !== undefined ? ' left=' + x.left : ''}`); } });
    for (const b of r.bats) if (b.mode !== 'hang' && b.mode !== 'hidden') near = Math.max(near, 0) + (b.pos.distanceTo(pl.pos) < 2.5 ? 1 : 0);
    const st = `${r.state} irr=${r.irritation.toFixed(2)} agit=${r.agitation.toFixed(1)} [${r.bats.map((b) => b.mode[0]).join('')}]`;
    if (r.state + r.bats.map((b) => b.mode[0]).join('') !== last) { log.push(`${T1.toFixed(1)} ${st}`); last = r.state + r.bats.map((b) => b.mode[0]).join(''); }
  }
  log.push(`bat-frames within 2.5 m of the player: ${near}`);
  // squash runs of screeches into counts
  const out: string[] = []; let run = 0;
  for (const l of log) { if (/ screech$/.test(l)) { run++; continue; } if (run) { out.push(`   (${run} screeches)`); run = 0; } out.push(l); }
  if (run) out.push(`   (${run} screeches)`);
  return out.join('\n');
}
/** Granny in the fog by the hollow (the player at the hollow's centre, home 70 m north).
 *  scripts: 'watch' (the player stands), 'slow' (walks slowly up to her), 'rush' (runs at her at 12 s), 'flash'
 *  (the flashlight in her face at 12 s), 'cookies' (holds out cookies from 8 s, offers them when she is close,
 *  then follows her home lagging behind now and then), 'clear' (no fog, daytime: she never comes) */
function simGranny(script: string, seconds: number, hr: number): string {
  const log: string[] = [];
  const home = new THREE.Vector3(80, 0, 360);
  const g = new GrannyTamarack({ home });
  const pl = { pos: new THREE.Vector3(80, 1.7, 430), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0.1, light: false, action: undefined as string | undefined, speed: 0 };
  let T2 = 0, last = '', offered = false;
  const fog = script === 'clear' ? 0 : 0.85, hour = script === 'clear' ? 12 : hr;
  const trunks = (x: number, z: number, r: number) => { const out: { x: number; z: number; r: number }[] = []; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const tx = Math.round(x / 7) * 7 + i * 7 + 2, tz = Math.round(z / 7) * 7 + j * 7 + 3; if (Math.hypot(tx - x, tz - z) < r) out.push({ x: tx, z: tz, r: 0.4 }); } return out; };
  for (let k = 0; k < seconds * 60; k++) {
    const dt = 1 / 60; T2 += dt;
    const toG = new THREE.Vector3().subVectors(g.pos, pl.pos).setY(0), d = toG.length();
    pl.speed = 0; pl.light = false;
    const walk = (v: number, to: THREE.Vector3) => { const dd = to.clone().sub(pl.pos).setY(0); if (dd.length() > 0.05) { pl.pos.addScaledVector(dd.normalize(), Math.min(v * dt, dd.length())); pl.speed = v; } };
    if (g.present && T2 > 6) pl.dir.copy(toG).normalize().setY(-0.15).normalize();
    switch (script) {
      case 'slow': if (T2 > 10 && g.present && d > 3) walk(1.0, g.pos); break;
      case 'rush': if (T2 > 12 && g.present && d > 1) walk(5.5, g.pos); break;
      case 'flash': if (T2 > 12) { pl.light = true; pl.dir.copy(g.pos).add(new THREE.Vector3(0, 2.15, 0)).sub(pl.pos).normalize(); } break;
      case 'cookies': {
        pl.held = T2 > 8 && !g.fed ? 'cookies' : 'none';
        if (pl.held === 'cookies' && d < 2.5 && !offered && (g.state === 'approach' || g.state === 'watch')) { offered = g.offer('cookies'); log.push(`${T2.toFixed(1)} offer -> ${offered}`); }
        // follow her home, dawdling now and then
        if (g.fed && g.state !== 'take' && g.present) { const dawdle = Math.floor(T2 / 25) % 3 === 2; if (!dawdle && d > 2.5) walk(1.15, g.pos); }
        break;
      }
      default: break;
    }
    g.update({ dt, time: T2, hour, player: pl, heightAt: () => 0, fog, trunks, stove: home,
      emit: (e, dd) => { if (e === 'step') return; const x = dd as { secret?: string; reason?: string; item?: string }; log.push(`${T2.toFixed(1)} ${e}${x.secret ? ':' + x.secret : ''}${x.reason ? ':' + x.reason : ''}${x.item ? ':' + x.item : ''}`); } });
    const st = `${g.state} clip=${g.anim.current} d=${d.toFixed(1)} fade=${g.fade.value.toFixed(2)} home=${Math.hypot(g.pos.x - home.x, g.pos.z - home.z).toFixed(0)}`;
    if (g.state + g.anim.current !== last) { log.push(`${T2.toFixed(1)} ${st}`); last = g.state + g.anim.current; }
  }
  return log.join('\n');
}

// ------------------------------------------------------------------------------------------------ hooks for screenshots
(window as unknown as Record<string, unknown>).__creatures = {
  ready: false,
  loadInfo: () => loadInfo,
  /** freeze the clock and pose a creature: clip at time t (stepped at 60 Hz), heading, camera orbit */
  pose(o: { who?: string; clip?: string; t?: number; heading?: number; light?: string; cam?: [number, number, number]; target?: [number, number, number]; fov?: number; roost?: string; ai?: boolean; screech?: boolean; mood?: string | null; offer?: string; shake?: boolean; wind?: number }) {
    frozen = true;
    if (o.wind !== undefined) G.uWindStrength.value = o.wind;
    if (o.who && o.who !== curName) pick(o.who);
    if (o.mood !== undefined) { ui.mood.value = o.mood ?? ''; }
    if (curName === 'dingbat') {
      if (o.light) setLight(o.light);
      if (o.mood !== undefined && bat) bat.faceMood = (o.mood || null) as typeof bat.faceMood;
      ui.spin.checked = false; spinA = o.heading ?? 0;
      if (o.roost) {
        // a fresh roost and the scripted player from t = 0 ('light': the beam on the eave at 2-4.5 s; 'demo')
        if (roost) scene.remove(roost.object);
        roost = new DingbatRoost({ pos: new THREE.Vector3(0, 2.6, -1.5), heading: 0, count: 9, span: 3.2 }); roost.alwaysOut = true;
        ui.ai.checked = true; T = 0; events.length = 0;
        scene.remove(batStage); scene.add(eave); scene.add(roost.object);
        const steps = Math.round((o.t ?? 1) * 60);
        for (let i = 0; i < steps; i++) { T += 1 / 60; roostDemo(1 / 60, T, o.roost); }
      } else {
        ui.ai.checked = false;
        if (o.clip) { batClip = o.clip; bat!.play(o.clip); }
        const steps = Math.round((o.t ?? 1) * 60); for (let i = 0; i < steps; i++) frame(1 / 60);
        if (o.screech && bat) { bat.screech = 0.35; batPreview(0); }
      }
      if (o.cam) camera.position.set(...o.cam);
      if (o.target) controls.target.set(...o.target);
      if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
      controls.update(); renderer.render(scene, camera);
      return roost && o.roost ? `${roost.state} ${roost.bats.map((b) => b.mode).join(' ')} | ${events.join(' ')}` : ui.info.textContent;
    }
    if (curName === 'wildlife') {
      if (o.light) setLight(o.light);
      if (o.clip) for (const c of lineCritters) c.state = (o.clip === 'fly' && !c.bird) ? 'move' : (o.clip === 'perch' && !c.bird) ? 'idle' : o.clip as Critter['state'];
      if (o.heading !== undefined) for (const c of lineCritters) c.heading = o.heading;
      const steps = Math.round((o.t ?? 1) * 60); for (let i = 0; i < steps; i++) frame(1 / 60);
      if (o.cam) camera.position.set(...o.cam); if (o.target) controls.target.set(...o.target);
      controls.update(); renderer.render(scene, camera); return ui.info.textContent;
    }
    if (o.light) setLight(o.light);
    ui.ai.checked = false; ui.spin.checked = false;
    spinA = o.heading ?? 0;
    if (o.clip) cur!.play(o.clip);
    const c = cur as unknown as { faceMood?: string | null; offer?: (i: string) => boolean; shakeOff?: () => void };
    if (o.mood !== undefined && 'faceMood' in c) c.faceMood = o.mood;
    if (o.offer && c.offer) events.push('offer ' + o.offer + ' -> ' + c.offer(o.offer));
    if (o.shake && c.shakeOff) c.shakeOff();
    const steps = Math.round((o.t ?? 1) * 60);
    for (let i = 0; i < steps; i++) frame(1 / 60);
    if (o.cam) camera.position.set(...o.cam);
    if (o.target) controls.target.set(...o.target);
    if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
    controls.update(); renderer.render(scene, camera);
    return ui.info.textContent;
  },
  info: () => ui.info.textContent,
  /** run a creature's AI for `seconds` (60 Hz) with a scripted stand-in player; returns the state/event log */
  sim(o: { who: string; script: string; seconds: number; hour?: number }) {
    const log: string[] = [];
    if (o.who === 'wildlife') {
      // the player walks a straight line through a forced population, past a few trunks
      const w = new Wildlife({ max: 12, radius: [8, 16], despawn: 40, waterY: -10 });
      w.forced = { squirrel: 2, hare: 2, raven: 1, jay: 1, chickadee: 2, grouse: 1 };
      const pl = { pos: new THREE.Vector3(0, 1.7, -30), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0.2, light: false, speed: 1.4 };
      const trunks = (x: number, z: number, r: number) => { const out: { x: number; z: number; r: number }[] = []; for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) { const tx = i * 6 + 1, tz = j * 6 + 2; if (Math.hypot(tx - x, tz - z) < r) out.push({ x: tx, z: tz, r: 0.3 }); } return out; };
      const seen = new Map<Critter, string>();
      let T1 = 0;
      for (let k = 0; k < o.seconds * 60; k++) {
        const dt = 1 / 60; T1 += dt;
        if (T1 > 8) pl.pos.z += 1.4 * dt;
        w.update({ dt, time: T1, hour: o.hour ?? 10, player: pl, heightAt: () => 0, emit: (e, d) => log.push(`${T1.toFixed(1)} ${(d as { who: string }).who} ${e}${(d as { sound?: string }).sound ? ' [' + (d as { sound?: string }).sound + ']' : ''}`), trunks });
        for (const c of w.active) { const st = c.state + (c.alt > 0.5 ? ' alt=' + c.alt.toFixed(1) : ''); const was = seen.get(c); if (!was || was.split(' ')[0] !== c.state) { seen.set(c, st); log.push(`${T1.toFixed(1)} ${c.kind} -> ${st} d=${Math.hypot(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z).toFixed(1)}`); } }
      }
      return log.join('\n');
    }
    if (o.who === 'dingbats') return simRoost(o.script, o.seconds, o.hour ?? 23);
    if (o.who === 'granny') return simGranny(o.script, o.seconds, o.hour ?? 23);
    if (isCryptid(o.who)) return simCryptid(o.who, o.script, o.seconds, o.hour ?? 14);
    const pl = { pos: new THREE.Vector3(0, 1.7, 0), dir: new THREE.Vector3(0, 0, 1), held: 'none', crouch: false, noise: 0.1, light: false, action: undefined as string | undefined, speed: 0 };
    const its: GroundItem[] = [];
    let T0 = 0, last = '';
    const trunks = (x: number, z: number, r: number) => { const out: { x: number; z: number; r: number }[] = []; for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) { const tx = Math.round(x / 9) * 9 + i * 9 + ((i * 7 + j * 3) % 4), tz = Math.round(z / 9) * 9 + j * 9 + ((i * 5 + j * 11) % 4); if (Math.hypot(tx - x, tz - z) < r) out.push({ x: tx, z: tz, r: 0.35 }); } return out; };
    const c: Beast = o.who === 'gumberoo' ? new Gumberoo({ pos: new THREE.Vector3(0, 0, 12) }) : o.who === 'hound' ? new AxehandleHound({ pos: new THREE.Vector3(0, 0, 14), state: o.script === 'companion' || o.script === 'handle' || o.script === 'chop' ? 'companion' : 'wild_lurk', trust: o.script === 'companion' || o.script === 'handle' || o.script === 'chop' ? 1 : 0 }) : new Bigfoot({ pos: new THREE.Vector3(0, 0, o.script === 'feed' ? 40 : 100) });
    const ev = (e: string) => log.push(`${T0.toFixed(1)} ${e}`);
    for (let k = 0; k < o.seconds * 60; k++) {
      const dt = 1 / 60; T0 += dt;
      const toC = new THREE.Vector3().subVectors(c.pos, pl.pos).setY(0);
      pl.speed = 0; pl.action = undefined;
      switch (o.script) {
        case 'feed': {
          // the player stands still holding the creature's favourite food, and offers it when it is close
          const cc = c as unknown as { favoriteFood: string; offer(i: string): boolean };
          pl.held = T0 > 3 ? cc.favoriteFood : 'none';
          if (T0 > 3 && toC.length() < 3.3 && k % 30 === 0 && cc.offer(cc.favoriteFood)) ev('offer accepted: ' + cc.favoriteFood);
          break;
        }
        case 'tame': pl.held = T0 > 5 ? 'jerky' : 'none'; if (c instanceof AxehandleHound && c.offer && T0 > 5 && toC.length() < 2.0 && c.state === 'curious' && k % 30 === 0) { if (c.offer('jerky')) ev('offer accepted'); } break;
        case 'rush': if (T0 > 8 && T0 < 12) { const d = toC.clone().normalize(); pl.pos.addScaledVector(d, 4 * dt); pl.speed = 4; } break;
        case 'flash': pl.light = T0 > 20; pl.dir.copy(toC).setY(1.5).normalize(); if (T0 > 20 && toC.length() > 42) { pl.pos.addScaledVector(toC.clone().normalize(), 1.2 * dt); pl.speed = 1.2; } break;
        case 'chop': pl.action = T0 > 10 ? 'chop' : undefined; break;
        case 'handle': if (k === 600) its.push({ id: 'h1', kind: 'axe_handle', pos: new THREE.Vector3(4, 0, -3) }); break;
        case 'kind': pl.pos.set(60, 1.7, 40); break;
        case 'swing': if (T0 > 3 && T0 < 9) { pl.pos.addScaledVector(toC.clone().normalize(), 1.5 * dt); pl.dir.copy(toC).normalize(); } pl.action = toC.length() < 2.5 && T0 < 9 ? 'swing' : undefined; break;
        case 'torch': pl.held = T0 > 20 ? 'torch' : 'none'; if (T0 > 20) pl.pos.addScaledVector(toC.clone().normalize(), 1.2 * dt); break;
        default: break;
      }
      c.update({ dt, time: T0, hour: o.hour ?? 23, player: pl, heightAt: () => 0, emit: (e, d) => { if (e !== 'step' && e !== 'crunch' && e !== 'sniff' && e !== 'chew') ev(e + (d && (d as { item?: string }).item ? ':' + (d as { item?: string }).item : '')); },
        items: its, takeItem: (id) => { const i = its.findIndex((x) => x.id === id); if (i < 0) return false; its.splice(i, 1); return true; },
        dropItem: (kind, pos) => { its.push({ id: kind, kind, pos: pos.clone() }); return kind; },
        trunks, kindness: o.script === 'kind' ? 0.9 : 0.2, stove: new THREE.Vector3(0, 0, 0), threats: [] });
      const st = `${c.state}${'trust' in c ? ' trust=' + c.trust.toFixed(2) : ''} clip=${c.anim.current} d=${toC.length().toFixed(1)}`;
      if (c.state + c.anim.current !== last) { log.push(`${T0.toFixed(1)} ${st}`); last = c.state + c.anim.current; }
    }
    return log.join('\n');
  },
};
void start();
