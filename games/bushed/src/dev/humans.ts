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

const Q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (Q.has(k) ? parseFloat(Q.get(k)!) : d);
declare global { interface Window { __ready?: boolean; __step?: (dt: number) => void } }

if (Q.get('arms') === '1') runArms();
else runLineup();

function runArms() { /* filled in below once the arms exist */ }

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
