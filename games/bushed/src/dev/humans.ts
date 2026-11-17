// Test page for the humans: a lineup of every look (player, storekeeper, hunter, mechanic, camper, old logger,
// plus a few variants), a turntable, an animation picker and the texture page viewer; ?arms=1 switches to the
// first-person arms viewer that cycles every arms action.
// URL params: look=<id> (single person), anim=<clip>, turn=1 (turntable), close=face|hands|feet|body,
//             page=1 (show the painted page), t=<seconds to pre-run>, yaw=<deg>, variants=1, talk=1,
//             arms=1 (FP arms), action=<arms action>, held=<kind>, shot=1 (sets window.__ready when settled)
import * as THREE from 'three';
import { buildHuman, makeLook, variant, LOOK_IDS, NPC_ANIMS } from '../humans';
import type { HumanModel, NpcAnim, LookId } from '../humans';
import { humanParts } from '../humans/model';
import { FPArms, fitTool } from '../player/arms';
import type { HeldKind, ArmsAction, ArmsInput } from '../player/arms';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const Q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (Q.has(k) ? parseFloat(Q.get(k)!) : d);
declare global { interface Window { __ready?: boolean; __step?: (dt: number) => void } }


// ------------------------------------------------------------------ first-person arms viewer
interface Step { label: string; held: HeldKind; dur: number; action?: ArmsAction; at?: number; charge?: (t: number) => number; speed?: number; sprint?: boolean; shiver?: number; breath?: number; crouch?: boolean }
const STEPS: Step[] = [
  { label: 'empty hands, idle sway + breathing', held: 'none', dur: 2.5 },
  { label: 'empty hands, walking', held: 'none', dur: 2.5, speed: 1.6 },
  { label: 'grab', held: 'none', dur: 1.0, action: 'grab', at: 0.1 },
  { label: 'drop', held: 'item', dur: 1.0, action: 'drop', at: 0.1 },
  { label: 'push', held: 'none', dur: 1.1, action: 'push', at: 0.1 },
  { label: 'felling axe, ready', held: 'axe', dur: 2.0 },
  { label: 'axe wind-up (swingCharge 0..1)', held: 'axe', dur: 1.6, charge: (t) => Math.min(1, t / 1.1) },
  { label: 'axe swing -> impact', held: 'axe', dur: 0.9, action: 'swing', at: 0.0, charge: (t) => (t < 0.0 ? 1 : 0) },
  { label: 'axe stuck: chop_recover', held: 'axe', dur: 1.0, action: 'chop_recover', at: 0.0 },
  { label: 'axe swing, miss (overswing)', held: 'axe', dur: 1.2, action: 'miss', at: 0.15 },
  { label: 'axe, running', held: 'axe', dur: 2.0, speed: 4.5, sprint: true },
  { label: 'maul: overhead split', held: 'maul', dur: 1.4, action: 'split', at: 0.1 },
  { label: 'hatchet: one-hand swing', held: 'hatchet', dur: 1.0, action: 'swing', at: 0.0 },
  { label: 'saw: stroke', held: 'saw', dur: 1.2, action: 'swing', at: 0.1 },
  { label: 'carry a heavy round (two_hand), walking, winded', held: 'two_hand', dur: 2.5, speed: 1.2, breath: 0.8 },
  { label: 'drag a log end (log)', held: 'log', dur: 2.2, speed: 1.0, breath: 0.6 },
  { label: 'drag behind (drag), one arm back', held: 'drag', dur: 2.2, speed: 1.0, breath: 0.5 },
  { label: 'small item, one hand', held: 'item', dur: 1.8 },
  { label: 'beer: drink', held: 'bottle', dur: 2.9, action: 'drink', at: 0.1 },
  { label: 'beef jerky: offer', held: 'jerky', dur: 2.5, action: 'offer', at: 0.1 },
  { label: 'flashlight, walking', held: 'flashlight', dur: 2.2, speed: 1.4 },
  { label: 'axe, freezing: shiver', held: 'axe', dur: 2.2, shiver: 1 },
];

function runArms() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  // the world behind (a sky and a forest floor) and the viewmodel scene drawn over it with its own camera
  const world = new THREE.Scene();
  world.background = new THREE.Color(0x8d9a9c);
  world.fog = new THREE.Fog(0x8d9a9c, 4, 30);
  const wcam = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
  wcam.position.set(0, 1.7, 0);
  wcam.lookAt(0, 1.45, -3);
  world.add(new THREE.HemisphereLight(0xc8d4dc, 0x4a4034, 1.4));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x4a4432, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; world.add(ground);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 8, 14), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }));
  trunk.position.set(-0.4, 4, -1.6); world.add(trunk);

  const view = new THREE.Scene();
  const vcam = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
  view.add(new THREE.HemisphereLight(0xbfc8d8, 0x3a3026, 0.9));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.6); key.position.set(0.5, 1, 0.6); view.add(key);
  const rim = new THREE.DirectionalLight(0x9ab0ff, 0.5); rim.position.set(-0.6, 0.3, -0.5); view.add(rim);

  const arms = new FPArms();
  view.add(arms.object);
  if (Q.has('orbit')) {
    // debug: look at the viewmodel rig from outside (yaw degrees)
    const a = num('orbit', 60) * Math.PI / 180;
    vcam.position.set(Math.sin(a) * 1.4, 0.1, -0.3 + Math.cos(a) * 1.4);
    vcam.lookAt(0, -0.25, -0.3);
  }
  const hud = document.getElementById('hud')!;
  const events: string[] = [];
  arms.onEvent((ev, d) => { events.unshift(`${ev}${d?.power !== undefined ? ' power ' + d.power.toFixed(2) : ''}`); events.length = Math.min(events.length, 5); flash = ev === 'impact' ? 0.25 : flash; });
  let flash = 0;

  // held items: the props engineer's models when present, quick stand-ins otherwise
  const models: Partial<Record<HeldKind, THREE.Object3D>> = {};
  const stand: Partial<Record<HeldKind, () => THREE.Object3D>> = {
    axe: standInAxe, maul: standInAxe, hatchet: () => { const a = standInAxe(); a.scale.setScalar(0.55); return a; },
    bottle: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.2 })); m.position.y = 0.0; return m; },
    jerky: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.11), new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.8 })); m.position.set(0, 0.005, 0.02); return m; },
    item: () => new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.09), new THREE.MeshStandardMaterial({ color: 0xa08050 })),
    flashlight: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x303236, metalness: 0.6, roughness: 0.4 })); m.position.y = 0.04; return m; },
    saw: () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.08, 0.55), new THREE.MeshStandardMaterial({ color: 0x8a8e94, metalness: 0.7, roughness: 0.4 })); m.position.set(0, 0.0, 0.3); return m; },
    two_hand: () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16), new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.9 })); m.rotation.z = Math.PI / 2; return m; },
  };
  const files: Partial<Record<HeldKind, [string, number]>> = { axe: ['wooden_axe.glb', 0.42], hatchet: ['hatchet.glb', 0.3], maul: ['sledgehammer_01.glb', 0.3], flashlight: ['vintage_flashlight.glb', 0.5], bottle: ['wine_bottle_bordeaux.glb', 0.35], saw: ['handsaw_wood.glb', 0.15] };
  const loader = new GLTFLoader();
  let pending = 0;
  for (const [k, [f, grip]] of Object.entries(files) as [HeldKind, [string, number]][]) {
    if (Q.get('standin') === '1') continue;
    pending++;
    loader.load(`assets/models/${f}`, (g) => { g.scene.traverse((o) => { (o as THREE.Mesh).castShadow = false; }); models[k] = fitTool(g.scene, grip); pending--; if (k === cur.held) applyHeld(cur.held); }, undefined, () => { pending--; });
  }
  const itemFor = (k: HeldKind) => models[k] ?? (stand[k] ? (models[k] = stand[k]!()) : undefined);
  function applyHeld(k: HeldKind) { arms.setHeld(k, itemFor(k)); }

  // a single step (?held=..&action=..&t=..) or the full cycle
  const only = Q.get('held') as HeldKind | null;
  const stepIdx = Q.has('step') ? num('step', 0) : -1;
  const steps: Step[] = stepIdx >= 0 ? [STEPS[stepIdx]] : only ? [{ label: `${only}${Q.get('action') ? ' + ' + Q.get('action') : ''}`, held: only, dur: 3, action: (Q.get('action') as ArmsAction) || undefined, at: 0, charge: Q.has('charge') ? () => num('charge', 0) : undefined, speed: num('speed', 0), shiver: num('shiver', 0) }] : STEPS;
  let si = 0, st = 0, cur = steps[0];
  let started = false;
  function enter(i: number) {
    si = i % steps.length; cur = steps[si]; st = 0; started = false;
    applyHeld(cur.held);
  }
  enter(0);
  const input = (): ArmsInput => ({
    speed: cur.speed ?? 0, sprint: !!cur.sprint, crouch: !!cur.crouch, breath: cur.breath ?? 0.1, shiver: cur.shiver ?? 0,
    aimPitch: 0, swingCharge: cur.charge ? cur.charge(st) : 0,
  });
  function step(dt: number) {
    st += dt;
    if (cur.action && !started && st >= (cur.at ?? 0)) { started = true; arms.play(cur.action, { power: 1 }); }
    arms.update(dt, input());
    if (st >= cur.dur && steps.length > 1) enter(si + 1);
    flash = Math.max(0, flash - dt);
  }
  // shot mode: settle the spring, then run to ?t= seconds into the step at 60 Hz
  const shot = Q.get('shot') === '1';
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); wcam.aspect = vcam.aspect = window.innerWidth / window.innerHeight; wcam.updateProjectionMatrix(); vcam.updateProjectionMatrix(); });
  const clock = new THREE.Clock();
  let frames = 0, ran = false;
  function frame() {
    if (shot) {
      if (!ran && pending === 0) {
        applyHeld(cur.held);
        for (let i = 0; i < 40; i++) arms.update(1 / 60, { ...input(), swingCharge: 0 });
        st = 0; started = false;
        const T = num('t', 0.5);
        while (st < T) step(1 / 60);
        ran = true;
      }
    } else step(Math.min(0.05, clock.getDelta()));
    renderer.autoClear = true;
    renderer.render(world, wcam);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(view, vcam);
    hud.textContent = `FP arms  [${si + 1}/${steps.length}] ${cur.label}\nheld: ${arms.held}  action: ${arms.action ?? '-'}  t ${st.toFixed(2)}\n${events.join('\n')}${flash > 0 ? '\n*** IMPACT ***' : ''}`;
    if (ran && ++frames === 3) window.__ready = true;
    requestAnimationFrame(frame);
  }
  window.addEventListener('keydown', (e) => { if (e.code === 'ArrowRight') enter(si + 1); if (e.code === 'ArrowLeft') enter(si - 1 + steps.length); });
  frame();
}

function runLineup() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6f7a78);
  scene.fog = new THREE.Fog(0x6f7a78, 12, 40);
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 100);

  const hemi = new THREE.HemisphereLight(0xc8d4dc, 0x4a4034, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.position.set(4, 7, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb0c4ff, 0.5);
  fill.position.set(-5, 3, -2);
  scene.add(fill);
  // a forest-floor ground disc (test page only)
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gx = gc.getContext('2d')!;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const n = Math.random();
    gx.fillStyle = n < 0.3 ? '#3e3a2a' : n < 0.6 ? '#4a4432' : n < 0.85 ? '#545036' : '#5e5a3c';
    gx.fillRect(x, y, 1, 1);
  }
  const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(12, 12); gt.magFilter = THREE.NearestFilter; gt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  // ---- people
  const single = Q.get('look') as LookId | null;
  const ids: LookId[] = single ? [single] : LOOK_IDS;
  const people: HumanModel[] = [];
  const t0 = performance.now();
  for (const id of ids) people.push(buildHuman(makeLook(id)));
  if (Q.get('variants') === '1') for (const [id, sd] of [['hunter', 7], ['player', 11], ['camper', 23], ['oldLogger', 31]] as [LookId, number][]) people.push(buildHuman(variant(makeLook(id), sd)));
  const buildMs = performance.now() - t0;
  const spacing = 0.95;
  people.forEach((p, i) => {
    p.root.position.set((i - (people.length - 1) / 2) * spacing, 0, 0);
    p.root.rotation.y = num('yaw', 0) * Math.PI / 180;
    scene.add(p.root);
  });
  // props for the clips: an axe in the chopper's hand, bills for counting, a bottle
  const axe = standInAxe();
  const bills = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.15), new THREE.MeshStandardMaterial({ color: 0x6a8a5a, roughness: 0.9 }));
  bills.position.set(0, 0.02, 0.0);

  let anim: NpcAnim = (Q.get('anim') as NpcAnim) || 'idle';
  let turn = Q.get('turn') === '1';
  const talk = Q.get('talk') === '1';
  function setAnim(a: NpcAnim) {
    anim = a;
    for (const p of people) {
      p.anim.play(a, { restart: true });
      p.anim.talking = talk || a === 'talk';
      p.anim.lookAt(null);
    }
    const holder = people[Math.min(people.length - 1, single ? 0 : 0)];
    axe.removeFromParent(); bills.removeFromParent();
    if (a === 'chop') for (const p of people) { const ax = p === holder ? axe : axe.clone(); p.socket('R').add(ax); }
    if (a === 'count') for (const p of people) p.socket('L').add(p === holder ? bills : bills.clone());
    if (a !== 'chop') for (const p of people) for (const c of [...p.socket('R').children]) c.removeFromParent();
    if (a !== 'count') for (const p of people) for (const c of [...p.socket('L').children]) c.removeFromParent();
    refreshUI();
  }

  // ---- camera framing
  const close = Q.get('close');
  const target = new THREE.Vector3(0, 0.95, 0);
  let dist = people.length > 1 ? people.length * 0.95 + 1.2 : 3.2;
  let camYaw = 0, camPitch = 0.08;
  if (close === 'face') { target.set(people[0].root.position.x, people[0].height - 0.12, 0); dist = 0.75; camPitch = 0.02; }
  if (close === 'hands') { target.set(people[0].root.position.x, 0.95, 0.05); dist = 1.1; camPitch = 0.25; }
  if (close === 'feet') { target.set(people[0].root.position.x, 0.18, 0); dist = 1.1; camPitch = 0.3; }
  if (close === 'body') { target.set(people[0].root.position.x, 1.1, 0); dist = 1.9; }
  if (Q.has('cy')) camYaw = num('cy', 0) * Math.PI / 180;
  if (Q.has('cp')) camPitch = num('cp', 0) * Math.PI / 180;
  if (Q.has('dist')) dist = num('dist', dist);
  if (Q.has('tx')) target.x = num('tx', 0);
  if (Q.has('ty')) target.y = num('ty', 0);
  function placeCam() {
    camera.position.set(target.x + Math.sin(camYaw) * Math.cos(camPitch) * dist, target.y + Math.sin(camPitch) * dist, target.z + Math.cos(camYaw) * Math.cos(camPitch) * dist);
    camera.lookAt(target);
  }
  let drag = false, lx = 0, ly = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { drag = false; });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    camYaw -= (e.clientX - lx) * 0.006; camPitch = Math.max(-0.5, Math.min(1.2, camPitch + (e.clientY - ly) * 0.004));
    lx = e.clientX; ly = e.clientY;
  });
  window.addEventListener('wheel', (e) => { dist = Math.max(0.3, Math.min(20, dist * (1 + Math.sign(e.deltaY) * 0.1))); });
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

  // ---- UI
  const ui = document.getElementById('ui')!;
  const buttons: Record<string, HTMLButtonElement> = {};
  for (const a of NPC_ANIMS) {
    const b = document.createElement('button'); b.textContent = a; b.onclick = () => setAnim(a); ui.appendChild(b); buttons[a] = b;
  }
  const tb = document.createElement('button'); tb.textContent = 'turntable'; tb.onclick = () => { turn = !turn; refreshUI(); }; ui.appendChild(tb);
  const pb = document.createElement('button'); pb.textContent = 'page'; ui.appendChild(pb);
  const pageCv = document.getElementById('page') as HTMLCanvasElement;
  let pageIdx = -1;
  pb.onclick = () => {
    pageIdx = (pageIdx + 2) % (people.length + 1) - 1;
    showPage(pageIdx);
  };
  function showPage(i: number) {
    if (i < 0) { pageCv.style.display = 'none'; return; }
    const img = humanParts(people[i].look).tex.image as HTMLCanvasElement;
    pageCv.width = img.width; pageCv.height = img.height;
    pageCv.getContext('2d')!.drawImage(img, 0, 0);
    pageCv.style.display = 'block';
    if (Q.get('page') === 'full') { pageCv.style.width = '100vw'; pageCv.style.left = '0'; pageCv.style.top = '0'; }
  }
  if (Q.has('page')) { pageIdx = Math.max(0, num('pagei', 0)); showPage(pageIdx); }
  function refreshUI() {
    for (const [a, b] of Object.entries(buttons)) b.classList.toggle('on', a === anim);
    tb.classList.toggle('on', turn);
  }
  const hud = document.getElementById('hud')!;
  const events: string[] = [];
  for (const p of people) p.anim.onEvent((ev) => { events.unshift(`${p.look.name.split(',')[0]}: ${ev}`); events.length = Math.min(events.length, 4); });

  setAnim(anim);
  // pre-run so screenshots land mid-clip
  const pre = num('t', 0.8);
  for (let t = 0; t < pre; t += 1 / 30) for (const p of people) p.anim.update(1 / 30);

  const clock = new THREE.Clock();
  let frames = 0;
  const shot = Q.get('shot') === '1';
  function frame() {
    const dt = shot ? 0 : Math.min(0.05, clock.getDelta());
    if (turn) for (const p of people) p.root.rotation.y += dt * 0.6;
    for (const p of people) p.anim.update(dt);
    placeCam();
    renderer.render(scene, camera);
    let tris = 0; for (const p of people) tris += (p.mesh.geometry.index!.count / 3);
    hud.textContent = `humans: ${people.length}  build ${buildMs.toFixed(0)} ms  tris/person ${(tris / people.length).toFixed(0)}\nclip: ${anim}\n${people.map((p) => p.look.name).join('  |  ')}\n${events.join('\n')}`;
    if (++frames === 3) window.__ready = true;
    requestAnimationFrame(frame);
  }
  window.__step = (dt: number) => { for (const p of people) p.anim.update(dt); };
  frame();
}

/** a quick stand-in felling axe for the test page (grip at the origin, handle +Y, edge +Z) */
export function standInAxe(): THREE.Object3D {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a6e74, roughness: 0.4, metalness: 0.7 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.82, 10), wood);
  handle.position.y = 0.26;
  g.add(handle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), wood);
  knob.position.y = -0.15; knob.scale.set(1, 0.8, 1.2);
  g.add(knob);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.2), steel);
  head.position.set(0, 0.64, 0.04);
  g.add(head);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.04), steel);
  edge.position.set(0, 0.64, 0.15);
  g.add(edge);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

if (Q.get('arms') === '1') runArms();
else runLineup();
