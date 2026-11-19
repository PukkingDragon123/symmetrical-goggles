// Test page for the first-person hands, held items and body (fp.html): the real Player (Rapier character
// controller) on the real terrain at the cabin clearing, the FPArms viewmodel bound to it (visible body, footstep
// bob, reach-to-use, RMB inspect) and the game's own item models. Click to play (WASD, Shift, C, Space, mouse,
// 1-9 / 0 items, E use, RMB inspect, F fire, B bolt, V aim). Headless shots run a scripted scenario:
//
//   fp.html?shot=1&item=beer&t=1.2                 hold an item (any ITEMS id: tools, food, kit; equipped like hands.ts)
//   fp.html?shot=1&kind=two_hand&piece=round       carry (round | bundle | crate), kind=log | drag | rifle | read | book
//   &walk=fwd|back|strafe|run  &crouch=1  &pitch=-70 (degrees)  &turn=200 (deg/s, mouse)  &jump=0.3 (s)
//   &action=swing|drink|eat|offer|fire|bolt|...&at=0.5  &inspect=1&rx=20&ry=60&zoom=1  &reach=door|stove|register|drawer
//   &switch=<item id>&at=0.6 (slot switch)  &third=1 (debug camera outside the player)  &hideEmpty=1 (game's rule)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { physics } from '../physics/physics';
import { Player } from '../player/player';
import { FPArms, fitTool } from '../player/arms';
import type { HeldKind, ArmsAction, ArmsHands } from '../player/arms';
import { input } from '../core/input';
import { loadProp } from '../places/props';
import { buildProduct } from '../places/products';
import { ITEMS } from '../game/items';
import { WoodPiece } from '../chop/wood';
import { SPOTS, heightAt } from '../world/layout';
import { registerInteractable } from '../game/interact';
import type { InteractKind } from '../game/interact';
import { paintPaper, paperMesh } from '../ui/paper';

const Q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (Q.has(k) ? parseFloat(Q.get(k)!) : d);
declare global { interface Window { __ready?: boolean; __fp?: unknown } }
const SHOT = Q.get('shot') === '1';
if (SHOT) document.body.classList.add('shot');
const D2R = Math.PI / 180;

// ------------------------------------------------------------------ renderer + scenes (as game.ts: world, then the viewmodel over it)
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const world = new THREE.Scene();
world.background = new THREE.Color(0x9aa7a6);
world.fog = new THREE.Fog(0x9aa7a6, 8, 60);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.06, 400);
world.add(camera);
const hemi = new THREE.HemisphereLight(0xc8d4dc, 0x4a4034, 1.25);
world.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
world.add(sun, sun.target);
const view = new THREE.Scene();
const viewCam = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
view.add(new THREE.HemisphereLight(0xbfc8d8, 0x3a3026, 0.9));
const key = new THREE.DirectionalLight(0xfff2e0, 1.3); key.position.set(0.5, 1, 0.6); view.add(key);
const third = Q.get('third') === '1' ? new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 100) : null;

// ------------------------------------------------------------------ the clearing: terrain patch, a trunk, a door, a stove, a till
const SX = SPOTS.cabin.x - 8, SZ = SPOTS.cabin.z - 6;
function groundTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const n = r();
    g.fillStyle = n < 0.3 ? '#3e3a2a' : n < 0.55 ? '#4a4432' : n < 0.8 ? '#4f5a34' : '#5e5a3c';
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
{
  const N = 60, S = 40;
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(SX + p.getX(i), SZ + p.getZ(i)));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 1 }));
  m.position.set(SX, 0, SZ);
  m.receiveShadow = true;
  world.add(m);
}
const bark = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
const at = (dx: number, dz: number, dy = 0) => new THREE.Vector3(SX + dx, heightAt(SX + dx, SZ + dz) + dy, SZ + dz);
for (const [dx, dz, r] of [[-0.9, -1.7, 0.22], [2.6, -4, 0.3], [-3, -6, 0.26], [4, -9, 0.35]] as const) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, 9, 14), bark);
  t.position.copy(at(dx, dz, 4.5)); t.castShadow = t.receiveShadow = true; world.add(t);
}
const props: Record<string, THREE.Object3D> = {};
function prop(name: string, kind: InteractKind, size: [number, number, number], pos: THREE.Vector3, color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.copy(pos); m.castShadow = m.receiveShadow = true;
  registerInteractable(m, { kind, label: () => name, use: () => {} });
  world.add(m); props[name] = m;
  return m;
}
// targets for reach-to-use, in front of the spawn (the player faces -z); shots only build them when asked
if (!SHOT || Q.has('reach')) {
prop('door', 'door', [0.9, 2.0, 0.06], at(0.75, -1.05, 1.0), 0x6b4a2e);
prop('stove', 'stove', [0.55, 0.6, 0.5], at(-0.55, -0.95, 0.3), 0x2a2a2c);
prop('register', 'register', [0.36, 0.22, 0.3], at(0.15, -0.75, 0.95), 0x7a6a4a);
prop('drawer', 'drawer', [0.5, 0.18, 0.4], at(-0.2, -0.8, 0.7), 0x8a6a46);
}

// ------------------------------------------------------------------ player, arms, binding
const player = new Player(camera);
const arms = new FPArms();
view.add(arms.object);
const handsStub: ArmsHands = { focus: null, held: { kind: 'none' } };
let aim = 0, swingCharge = 0;

// ------------------------------------------------------------------ item models, exactly as game.toolModel() makes them
const gltf = new GLTFLoader();
async function modelFor(id: string): Promise<THREE.Object3D | null> {
  const def = ITEMS[id];
  if (!def) return null;
  let m: THREE.Object3D;
  try { m = def.model.startsWith('gen:') ? buildProduct(id) : await loadProp(def.model as never); } catch { return null; }
  const c = m.clone();
  return def.tool || id === 'flashlight' ? fitTool(c) : id === 'beer' ? fitTool(c, 0.3) : c;
}
/** hands.ts equip(): the held kind for an item id */
function kindFor(id: string): HeldKind {
  const def = ITEMS[id];
  if (def?.tool) return (def.tool.kind === 'splitter' ? 'axe' : def.tool.kind === 'chainsaw' ? 'saw' : def.tool.kind) as HeldKind;
  return id === 'flashlight' ? 'flashlight' : id === 'beer' ? 'bottle' : id === 'jerky' ? 'jerky' : 'item';
}
function book(): THREE.Object3D {
  // a closed field notebook (test page stand-in: leather boards round a page block)
  const g = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: 0.75 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xd8c9a4, roughness: 1 });
  const cov = new THREE.BoxGeometry(0.15, 0.21, 0.005);
  const a = new THREE.Mesh(cov, leather), b = new THREE.Mesh(cov, leather);
  a.position.z = 0.0125; b.position.z = -0.0125;
  const blk = new THREE.Mesh(new THREE.BoxGeometry(0.144, 0.204, 0.02), paper);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.21, 8, 1, false, Math.PI, Math.PI), leather);
  sp.position.x = -0.075;
  g.add(a, b, blk, sp);
  g.userData.itemId = 'journal';
  return g;
}
async function carryObject(piece: string): Promise<THREE.Object3D> {
  if (piece === 'bundle') { const o = buildProduct('bundle'); o.userData.carry = true; return o; }
  if (piece === 'crate') { const o = await loadProp('wooden_crate_01' as never); o.userData.carry = true; return o; }
  const len = piece === 'log' ? 1.1 : 0.42, r = piece === 'log' ? 0.1 : 0.15;
  const p = new WoodPiece({ species: 'spruce', stem: [{ y: 0, r, x: 0, z: 0 }, { y: 2, r: r * 0.95, x: 0, z: 0 }], y0: 0, y1: len, seed: 5 });
  return p.mesh;
}

// ------------------------------------------------------------------ what we hold
let heldId = '';
async function hold(id: string | null, instant = false) {
  if (!id) { heldId = ''; handsStub.held.kind = 'none'; arms.setHeld('none', undefined, { instant }); return; }
  const m = await modelFor(id);
  heldId = id;
  handsStub.held.kind = ITEMS[id]?.tool ? 'tool' : 'item';
  arms.setHeld(kindFor(id), m ?? undefined, { instant });
}
async function holdKind(kind: HeldKind) {
  handsStub.held.kind = kind === 'two_hand' ? 'carry' : kind === 'log' || kind === 'drag' ? 'drag' : 'item';
  if (kind === 'two_hand') {
    // like hands.grab(): the object goes into the viewmodel scene first, then setHeld('two_hand') adopts it
    const o = await carryObject(Q.get('piece') ?? 'round');
    view.add(o);
    arms.setHeld('two_hand', undefined, { instant: true });
  } else if (kind === 'rifle') {
    const g = await gltf.loadAsync('assets/models/bolt_action_rifle_7_62.glb').catch(() => null);
    arms.setHeld('rifle', g?.scene ?? undefined, { instant: true });
  } else if (kind === 'read') {
    const m = paperMesh(paintPaper([{ t: 'h', text: 'Contract No. 14' }, { t: 'p', text: 'Twelve cords of split spruce, delivered to the store by Friday. Pruneau pays on the scale.' }], { style: 'notebook', seed: 3 }), 0.2);
    m.position.set(0, -0.06, -0.3); m.rotation.set(-0.12, 0, 0.03);
    view.add(m);
    arms.setHeld('read', m, { own: false, instant: true });
  } else if (kind === 'book') {
    arms.setHeld('book', book(), { instant: true });
  } else arms.setHeld(kind, undefined, { instant: true });
}

// ------------------------------------------------------------------ scripted input
const keyDown = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
const keyUp = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
const tap = (code: string) => { keyDown(code); setTimeout(() => keyUp(code), 0); };
const script: { t: number; f: () => void }[] = [];
let simT = 0;
function scenario() {
  const walk = Q.get('walk');
  const keys: string[] = [];
  if (walk === 'fwd' || walk === 'run') keys.push('KeyW');
  if (walk === 'run') keys.push('ShiftLeft');
  if (walk === 'back') keys.push('KeyS');
  if (walk === 'strafe') keys.push('KeyD');
  if (Q.get('crouch') === '1') keys.push('KeyC');
  for (const k of keys) keyDown(k);
  if (Q.has('jump')) script.push({ t: num('jump', 0.3), f: () => { keyDown('Space'); script.push({ t: simT + 0.05, f: () => keyUp('Space') }); } });
  if (Q.has('action')) script.push({ t: num('at', 0.2), f: () => arms.play(Q.get('action') as ArmsAction, { power: 1 }) });
  if (Q.has('switch')) script.push({ t: num('at', 0.6), f: () => { void hold(Q.get('switch')); } });
  if (Q.has('reach')) {
    const o = props[Q.get('reach')!];
    script.push({ t: num('at', 0.3), f: () => {
      const p = o.position.clone().add(new THREE.Vector3(0, 0.05, 0.22 + (o === props.door ? -0.19 : 0)));
      if (o === props.register) p.y += 0.06;
      if (o === props.stove) p.set(o.position.x, o.position.y + 0.1, o.position.z + 0.26);
      handsStub.focus = { obj: o, point: p };
      keyDown('KeyE');
      script.push({ t: simT + 0.02, f: () => keyUp('KeyE') });
    } });
  }
  if (Q.get('inspect') === '1') script.push({ t: num('at', 0.3), f: () => { window.dispatchEvent(new MouseEvent('mousedown', { button: 2 })); } });
  if (Q.has('aim')) script.push({ t: 0.1, f: () => { aim = num('aim', 1); } });
}

// ------------------------------------------------------------------ loop
const hud = document.getElementById('hud')!;
let mdx = 0, mdy = 0;
function step(dt: number) {
  simT += dt;
  for (let i = script.length - 1; i >= 0; i--) if (script[i].t <= simT) { const s = script.splice(i, 1)[0]; s.f(); }
  if (SHOT) {
    // scripted mouse: turning (deg/s) or the inspect drag
    const turn = num('turn', 0) * D2R * dt / input.sensitivity;
    input.mouseDX += turn;
    if (arms.inspecting) { input.mouseDX += num('ry', 0) * D2R / 0.008 * dt / 0.6; input.mouseDY += num('rx', 0) * D2R / 0.008 * dt / 0.6; }
  } else { input.mouseDX += mdx; input.mouseDY += mdy; mdx = mdy = 0; }
  physics.streamTerrain([{ x: player.pos.x, z: player.pos.z }]);
  player.update(dt);
  physics.update(dt);
  if (Q.has('pitch') && SHOT && !arms.inspecting) player.pitch += (num('pitch', 0) * D2R - player.pitch) * Math.min(1, dt * 10);
  if (Q.has('zoom') && arms.inspecting) input.wheel = -1;
  arms.update(dt, {
    speed: player.speed, sprint: player.sprinting, crouch: player.crouch, breath: 0.15, shiver: num('shiver', 0), aimPitch: player.pitch,
    swingCharge, aim,
  });
  if (Q.get('hideEmpty') === '1') arms.object.visible = !(arms.held === 'none' && !arms.action);
  input.endFrame();
  handsStub.focus = Q.has('reach') && simT < num('at', 0.3) + 0.1 ? handsStub.focus : null;
}
function render() {
  sun.position.set(player.pos.x + 4, player.pos.y + 9, player.pos.z + 5);
  sun.target.position.copy(player.pos);
  renderer.autoClear = true;
  if (third) {
    const a = num('cy', 150) * D2R, d = num('dist', 2.6);
    third.position.set(player.pos.x + Math.sin(player.yaw + a) * d, player.pos.y + num('cyh', 1.3), player.pos.z + Math.cos(player.yaw + a) * d);
    third.lookAt(player.pos.x, player.pos.y + 0.9, player.pos.z);
    renderer.render(world, third);
    return;
  }
  if (Q.has('orbit')) {
    // debug: look at the viewmodel rig from outside (yaw degrees about the eye, camera space)
    const a = num('orbit', 60) * D2R, oc = new THREE.PerspectiveCamera(40, viewCam.aspect, 0.01, 10);
    oc.position.set(Math.sin(a) * 1.3, 0.25, -0.3 + Math.cos(a) * 1.3);
    oc.lookAt(0, -0.2, -0.35);
    renderer.setClearColor(0x40484a); renderer.clear();
    renderer.render(view, oc);
    return;
  }
  renderer.render(world, camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(view, viewCam);
}
function label() {
  const what = heldId || Q.get('kind') || 'none';
  hud.textContent = `${what}  held:${arms.held}${arms.action ? '  ' + arms.action : ''}${arms.inspecting ? '  inspect' : ''}  pitch ${(player.pitch / D2R).toFixed(0)}`;
}
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = viewCam.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); viewCam.updateProjectionMatrix();
});

async function main() {
  await physics.init();
  input.attach(renderer.domElement);
  physics.streamTerrain([{ x: SX, z: SZ }], 30);
  player.init(SX, SZ, 0);
  arms.bind({ player, scene: world, camera, hands: handsStub });
  window.__fp = { arms, player, hold, holdKind, input };
  if (SHOT) input.locked = true;
  // what to hold
  if (Q.has('item')) await hold(Q.get('item'), true);
  else if (Q.has('kind')) await holdKind(Q.get('kind') as HeldKind);
  // label atlases and prop textures load asynchronously: give them a moment before a shot
  if (SHOT) await new Promise((r) => setTimeout(r, 900));
  // let everything settle a moment (springs, the body's gait), then run the scenario
  for (let i = 0; i < 30; i++) step(1 / 60);
  simT = 0;
  if (SHOT) {
    scenario();
    const T = num('t', 1.2);
    while (simT < T) step(1 / 60);
    label();
    render();
    requestAnimationFrame(() => { render(); window.__ready = true; });
    return;
  }
  // interactive
  const ui = document.getElementById('ui')!;
  const ids = ['axe_felling', 'axe_old', 'maul', 'hatchet', 'bucksaw', 'flashlight', 'beer', 'jerky', 'beans', 'coffee', 'matches', 'cookies', 'knife', 'fish', 'firewood', 'file'];
  for (const id of [...ids, 'none']) {
    const b = document.createElement('button'); b.textContent = id;
    b.onclick = (e) => { e.stopPropagation(); void hold(id === 'none' ? null : id); };
    ui.appendChild(b);
  }
  for (const k of ['two_hand', 'log', 'drag', 'rifle', 'read', 'book'] as HeldKind[]) {
    const b = document.createElement('button'); b.textContent = k;
    b.onclick = (e) => { e.stopPropagation(); void holdKind(k); };
    ui.appendChild(b);
  }
  renderer.domElement.addEventListener('click', () => input.lock());
  window.addEventListener('keydown', (e) => {
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n)) void hold(n === 0 ? null : ids[n - 1] ?? null);
    if (e.code === 'KeyF') arms.play('fire');
    if (e.code === 'KeyB') arms.play('bolt');
    if (e.code === 'KeyV') aim = aim > 0.5 ? 0 : 1;
    if (e.code === 'KeyG') arms.play(arms.held === 'bottle' ? 'drink' : arms.held === 'jerky' || arms.held === 'item' ? 'eat' : 'swing', { power: 1 });
  });
  window.addEventListener('mousedown', (e) => { if (e.button === 0 && input.locked && arms.held !== 'none') swingCharge = 0.01; });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && swingCharge > 0) { arms.play('swing', { power: swingCharge }); swingCharge = 0; }
  });
  const clock = new THREE.Timer();
  const frame = () => {
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    if (swingCharge > 0) swingCharge = Math.min(1, swingCharge + dt / 0.7);
    // focus: whatever registered prop the crosshair is on (for reach-to-use)
    const ray = new THREE.Raycaster(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), 0, 2.2);
    const hit = ray.intersectObjects(Object.values(props), false)[0];
    handsStub.focus = hit ? { obj: hit.object, point: hit.point } : null;
    step(dt);
    label();
    render();
    requestAnimationFrame(frame);
  };
  frame();
}
void main();
