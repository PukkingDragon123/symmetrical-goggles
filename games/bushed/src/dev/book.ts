// book.html: the Book of Cryptids test page. Modes:
//   (default)      the book in first person, held in the FP arms over a dusk clearing with a cryptid in view
//   ?sheet=sdf     the procedural plate portraits, raw and enlarged
//   ?sheet=pages   every page of the book laid out flat
// Playwright hooks: window.__book (the BookOfCryptids), window.__ready.
import { renderSdf } from '../ui/bookofcryptids/sdf';
import { SDF_SPECS } from '../ui/bookofcryptids/specs';
import { outline } from '../ui/bookofcryptids/pix';
import { loadFonts } from '../ui/paper';
import { entries } from '../ui/bookofcryptids/bestiary';
import { layout, paintPage, type BookView } from '../ui/bookofcryptids/pages';
import { initialContracts } from '../game/contracts';
import * as THREE from 'three';
import { setPortraitRenderer } from '../ui/bookofcryptids/portrait';
import { preloadCreatures } from '../creatures/preload';
import { Renderer } from '../gfx/renderer';
import { Sky } from '../gfx/sky';
import { G } from '../gfx/globals';
import { FPArms } from '../player/arms';
import { floatText } from '../ui/float';
import { BookOfCryptids, bookPose } from '../ui/bookofcryptids';
import { buildTree } from '../trees/build';
import type { CreatureCtx } from '../creatures/types';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[] };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));
if (q.has('shot')) document.body.classList.add('shot');

async function sheetSdf() {
  document.body.classList.add('sheet');
  const host = document.getElementById('sheet')!;
  const only = q.get('who');
  for (const [id, mk] of Object.entries(SDF_SPECS)) {
    if (only && only !== id) continue;
    const t0 = performance.now();
    const r = await renderSdf(mk(), 320, 232);
    outline(r.pix);
    const c = r.pix.toCanvas();
    c.style.width = `${c.width * Number(q.get('zoom') ?? 2)}px`;
    c.style.background = '#cdb68a';
    c.title = `${id} ${(performance.now() - t0).toFixed(0)} ms`;
    host.appendChild(c);
  }
  W.__ready = true;
}

async function sheetPages() {
  document.body.classList.add('sheet');
  // model portraits need a renderer and the creature models
  const gl = new THREE.WebGLRenderer({ antialias: false });
  setPortraitRenderer(gl);
  if (!q.has('nomodels')) { const t0 = performance.now(); await preloadCreatures({ onProgress: (d, n, name) => console.log(`loaded ${name} ${d}/${n} at ${(performance.now() - t0).toFixed(0)} ms`) }); }
  const host = document.getElementById('sheet')!;
  const list = entries();
  const contracts = initialContracts();
  contracts[0].state = 'taken'; contracts[0].progress = 4; contracts[1].state = 'paid'; contracts[4].state = 'taken';
  const tasted = new Map<string, number>(), known = new Map<string, Set<string>>(), seen = new Set<string>();
  for (const [i, e] of list.entries()) {
    known.set(e.id, new Set(e.rules.filter((_, k) => (k + i) % 2 === 0).map((r) => r.id)));
    if (i % 3 !== 2) tasted.set(e.id, i); else if (i % 2) seen.add(e.id);
  }
  const v: BookView = { entries: list, known, seen, tasted, contracts, pageOf: (id) => 4 + list.findIndex((e) => e.id === id) * 2 };
  const pages = layout(v);
  const from = Number(q.get('from') ?? 0), n = Number(q.get('n') ?? pages.length);
  const zoom = Number(q.get('zoom') ?? 1);
  const cvs: HTMLCanvasElement[] = [];
  const paintAll = () => {
    pages.slice(from, from + n).forEach((pk, j) => {
      const i = from + j;
      const r = paintPage(pk, i % 2 ? 'R' : 'L', v, i, () => setTimeout(paintAll, 0));
      const c = cvs[j] ?? (cvs[j] = document.createElement('canvas'));
      r.pix.toCanvas(c);
      c.style.width = `${c.width * zoom}px`;
      c.style.margin = i % 2 ? '6px 18px 6px 0' : '6px 0 6px 6px';
      if (!c.parentElement) host.appendChild(c);
    });
  };
  paintAll();
  // let portraits finish
  const t0 = performance.now();
  const wait = () => new Promise((r) => setTimeout(r, 300));
  while (performance.now() - t0 < Number(q.get('wait') ?? 30000)) { await wait(); paintAll(); if (pages.slice(from, from + n).every((pk, j) => !paintPage(pk, (from + j) % 2 ? 'R' : 'L', v, from + j, () => undefined).pending)) break; }
  W.__ready = true;
}

// ------------------------------------------------------------------------------------------------ first person
// ?open=1 starts open, ?page=N goes to a spread, ?hour=h, ?who=gumberoo|hound|bigfoot (the critter in view),
// ?demo=1 tastes a few and learns some rules first, ?pixel=2 the renderer's pixel size, ?run=1 real-time loop.
// Playwright: window.__step(seconds) advances the simulation at 30 fps then renders; window.__book.
async function firstPerson() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const R = new Renderer(canvas);
  R.pixel = Number(q.get('pixel') ?? 2);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.06, 900);
  const view = new THREE.Scene();
  const viewCam = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
  scene.add(camera);
  const sky = new Sky(scene);
  sky.shadowSize = 30;
  const hour = Number(q.get('hour') ?? 18.9);
  // a clearing: mossy ground, a few spruce and birch
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  const gg = gc.getContext('2d')!;
  gg.fillStyle = '#3a3522'; gg.fillRect(0, 0, 256, 256);
  const cols = ['#2c2a1b', '#4a4128', '#56492c', '#34361f', '#5d5232', '#2a2617', '#6b5a35', '#3f4a26'];
  let sd = 7; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { gg.fillStyle = cols[Math.floor(rr() * cols.length)]; gg.fillRect(Math.floor(rr() * 256), Math.floor(rr() * 256), 1 + Math.floor(rr() * 3), 1 + Math.floor(rr() * 2)); }
  const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(40, 40); gt.magFilter = THREE.NearestFilter; gt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 }));
  ground.receiveShadow = true; scene.add(ground);
  if (!q.has('notrees')) {
    const spots: [number, number, 'spruce' | 'birch' | 'fir', number][] = [[-6, -14, 'spruce', 1], [5, -18, 'spruce', 2], [-12, -6, 'fir', 3], [11, -9, 'birch', 4], [-3, -26, 'spruce', 5], [16, -22, 'spruce', 6], [-17, -20, 'birch', 7]];
    for (const [x, z, sp, seed] of spots) { try { const t = buildTree(sp, seed, { age: 0.8 }).object(); t.position.set(x, 0, z); scene.add(t); } catch (e) { console.warn('tree', e); } }
  }
  // the viewmodel: lit like the game's
  view.add(new THREE.HemisphereLight(0xbfc8d8, 0x3a3026, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(0.5, 1, 0.6); view.add(key);
  const arms = new FPArms();
  view.add(arms.object);
  const book = new BookOfCryptids();
  view.add(book.object);
  book.attach({ camera, viewCam });
  bookPose(arms, book);
  book.onOpenChange = (open) => { if (open) arms.setHeld('book'); };
  book.onPutAway = () => arms.setHeld('none');
  floatText.mount(document.getElementById('ui')!, camera);
  setPortraitRenderer(R.gl);
  // a critter to taste
  const who = q.get('who') ?? 'gumberoo';
  await preloadCreatures();
  const C = await import('../creatures');
  const critter: { object: THREE.Object3D; update(c: CreatureCtx): void; play(c: string | null): void; clips: string[]; pos: THREE.Vector3; heading: number } =
    who === 'hound' ? new C.AxehandleHound({ state: 'companion', trust: 1 }) as never : who === 'bigfoot' ? new C.Bigfoot({}) as never : new C.Gumberoo({ pos: new THREE.Vector3() }) as never;
  const cpos = new THREE.Vector3(Number(q.get('cx') ?? 1.2), 0, Number(q.get('cz') ?? -7.5));
  scene.add(critter.object);
  critter.play(critter.clips.includes('idle') ? 'idle' : critter.clips[0]);
  const ctx = (dt: number, t: number): CreatureCtx => ({ dt, time: t, hour, player: { pos: camera.position.clone(), dir: new THREE.Vector3(0, 0, -1), held: 'none', crouch: false, noise: 0, light: false, speed: 0 }, heightAt: () => 0, emit: () => undefined, items: [], fog: 0.1, lost: false, fires: [] });
  camera.position.set(0, 1.62, 0);
  let yaw = Number(q.get('yaw') ?? 0), pitch = Number(q.get('pitch') ?? -0.12);
  // state for screenshots
  if (q.has('demo')) {
    book.day = 2;
    for (const [id, r] of [['hound', 'night'], ['hound', 'jerky'], ['hound', 'handles'], ['bigfoot', 'light'], ['squonk', 'tears'], ['hodag', 'smell']] as const) book.learn(id, r, { silent: true });
    for (const id of ['hound', 'bigfoot', 'squonk', 'hodag', 'teakettler', 'wasset', 'agropelter', 'dingbat']) book.observe(id, { silent: true });
    book.sawCritter('hidebehind');
    (book as unknown as { pendingWrites: unknown[] }).pendingWrites = [];
  }
  if (q.has('page')) book.goto(Number(q.get('page')));
  if (q.has('open')) { book.toggle(); }
  const onResize = () => { R.resize(); const [w, h] = R.internalSize; camera.aspect = viewCam.aspect = w / h; camera.updateProjectionMatrix(); viewCam.updateProjectionMatrix(); };
  addEventListener('resize', onResize); onResize();
  let T = 0;
  const sim = (dt: number) => {
    T += dt; G.uTime.value = T;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    critter.update(ctx(dt, T));
    critter.pos.copy(cpos); critter.object.position.copy(cpos); critter.heading = 0.4; critter.object.rotation.y = 0.4;
    // the dev page's own tasting check (install() does this in the game)
    const v = critter.object.getWorldPosition(new THREE.Vector3()); v.y += 0.6;
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    if (book.open && fwd.angleTo(v.clone().sub(camera.position)) < 0.3 && v.distanceTo(camera.position) < 24) {
      book.look(v.clone().applyMatrix4(camera.matrixWorldInverse), 0.4);
      tasteT += dt; book.tasting = book.tastedIt(who) ? 0 : Math.min(1, tasteT / 1.4);
      if (tasteT > 1.4 && !book.tastedIt(who)) { book.observe(who, { dist: v.distanceTo(camera.position) }); }
    } else { tasteT = 0; book.tasting = 0; }
    arms.update(dt, { speed: 0, sprint: false, crouch: false, breath: 0.1, shiver: 0, aimPitch: pitch, swingCharge: 0 });
    book.update(dt);
    floatText.update(dt);
  };
  let tasteT = 0;
  // ?vc=x,y,z moves the viewmodel camera to inspect the book (looking at it), ?vfov=deg
  const vc = q.get('vc')?.split(',').map(Number);
  if (q.has('vfov')) viewCam.fov = Number(q.get('vfov'));
  const draw = () => {
    if (vc) { viewCam.position.set(vc[0], vc[1], vc[2]); viewCam.lookAt(book.object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(Number(q.get('lx') ?? 0), Number(q.get('ly') ?? 0), 0))); viewCam.updateProjectionMatrix(); }
    sky.update(hour, camera.position, { cloud: 0.3, rain: 0, fog: 0.08, storm: 0 }, R.grade, G.uTime.value);
    R.sunDir.copy(sky.sunDir); R.sunColor.copy(sky.sun.color); R.fogColor.copy(sky.fogColor);
    key.color.copy(sky.sun.color); key.intensity = sky.sun.intensity * 0.45;
    R.render(scene, camera, view, viewCam);
  };
  const keys = new Set<string>();
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') { e.preventDefault(); book.toggle(); }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') book.turn(-1);
    if (e.code === 'KeyD' || e.code === 'ArrowRight') book.turn(1);
    if (e.code === 'KeyO') book.observe(who);
    if (e.code === 'KeyL') { const e2 = ['hound', 'bigfoot', 'gumberoo', 'hodag', 'squonk'][Math.floor(Math.random() * 5)]; const rules = ['night', 'handles', 'jerky', 'friend', 'warn', 'watch', 'light', 'knock', 'gift', 'bounce', 'axe', 'fire', 'smell', 'sunday', 'horns', 'tears', 'dissolve', 'look']; for (const r of rules) if (book.learn(e2, r)) break; }
    if (e.code === 'KeyG') book.say('Hrrmm. Your thumbs are cold.');
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('mousemove', (e) => { if (e.buttons) { yaw -= e.movementX * 0.004; pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * 0.004)); } });
  const WW = window as unknown as { __step: (s: number) => void; __book: BookOfCryptids; __look: (y: number, p: number) => void };
  WW.__book = book;
  WW.__step = (s: number) => { const n = Math.max(1, Math.round(s * 30)); for (let i = 0; i < n; i++) sim(1 / 30); draw(); };
  WW.__look = (y: number, p: number) => { yaw = y; pitch = p; };
  // settle: let the book open and the portraits come in
  for (let i = 0; i < 45; i++) sim(1 / 30);
  draw();
  if (q.has('run')) {
    let last = performance.now();
    const loop = (now: number) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; sim(dt); draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  W.__ready = true;
}

// ?sheet=models: every registered model portrait next to its painted (SDF) fallback
async function sheetModels() {
  document.body.classList.add('sheet');
  const host = document.getElementById('sheet')!;
  const gl = new THREE.WebGLRenderer({ antialias: false });
  setPortraitRenderer(gl);
  await preloadCreatures();
  const P = await import('../ui/bookofcryptids/portrait');
  const ids = (q.get('ids') ?? 'hodag,squonk,hidebehind,agropelter,teakettler,wasset').split(',');
  for (const id of ids) {
    const row = document.createElement('div'); host.appendChild(row);
    const a = await P.portrait(id);
    for (const pix of a ? [a.color, a.sketch] : []) { const c = pix.toCanvas(); c.style.width = `${c.width * 2}px`; c.style.background = '#cdb68a'; row.appendChild(c); }
    if (SDF_SPECS[id]) { const r = await renderSdf(SDF_SPECS[id](), 320, 228); outline(r.pix); const c = r.pix.toCanvas(); c.style.width = `${c.width * 2}px`; c.style.background = '#cdb68a'; row.appendChild(c); }
  }
  W.__ready = true;
}

async function main() {
  await loadFonts();
  if (q.get('sheet') === 'models') return sheetModels();
  const sheet = q.get('sheet');
  if (sheet === 'sdf') return sheetSdf();
  if (sheet === 'pages') return sheetPages();
  return firstPerson();
}
main();
