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

  const species = view === 'bull' || view === 'cow' ? 'moose' : 'deer', male = view === 'buck' || view === 'bull' || view === 'trophy';
  let animal: GameAnimal | null = null, clip = qs.get('clip') ?? 'idle', spinA = Number(qs.get('yaw') ?? 0.6);
  const t0 = performance.now();
  if (view === 'arms') {
    // the FP arms holding the rifle, seen from outside (or from the eye with ?fp): ?aim=0..1
    Promise.all([import('../player/arms'), import('../places/props')]).then(async ([A, Pr]) => {
      const arms = new A.FPArms();
      const rig = new THREE.Group(); rig.position.set(0, 1.6, 0); rig.add(arms.object); scene.add(rig);
      const [body, bolt] = await Promise.all([Pr.loadProp('bolt_action_rifle_7_62'), Pr.loadProp('bolt_action_rifle_7_62_bolt')]);
      const model = new THREE.Group(); model.add(body); bolt.position.set(-0.21803, 0.12383, 0.01779); model.add(bolt);
      arms.setHeld('rifle', model, { instant: true });
      const aim = Number(qs.get('aim') ?? 0);
      const fp = qs.has('fp');
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial({ color: 0xff0000 })); eye.position.set(0, 1.6, 0); scene.add(eye);
      const ax = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1.6, 0), 1.2, 0x00ff00); scene.add(ax);
      if (fp) { camera.position.set(0, 1.6, 0); camera.fov = 58; camera.updateProjectionMatrix(); controls.target.set(0, 1.6, -1); }
      else { camera.position.set(1.4, 1.9, 0.6); controls.target.set(0, 1.45, -0.3); }
      const s = { speed: 0, sprint: false, crouch: false, breath: 0, shiver: 0, aimPitch: 0, swingCharge: 0, aim };
      for (let i = 0; i < 90; i++) arms.update(1 / 30, s);
      if (qs.get('act')) { arms.play(qs.get('act') as never); for (let i = 0; i < Number(qs.get('actf') ?? 12); i++) arms.update(1 / 30, s); }
      controls.update();
      ui.info.textContent = `arms + rifle, aim ${aim}`;
      (window as unknown as { __ready: boolean }).__ready = true;
    });
  } else if (view === 'trophy' || view === 'items') {
    // the trophies on a wall, and the item models on a table
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshStandardMaterial({ color: 0x5a4532, roughness: 0.9 }));
    wall.position.set(0, 1.5, -0.02); wall.receiveShadow = true; scene.add(wall);
    camera.position.set(0.2, 1.45, 1.7); controls.target.set(0, 1.35, 0);
    Promise.all([import('../creatures/game/model'), import('../creatures/anatomy'), import('../creatures/rig'), import('../game/hunting/fx')]).then(async ([M, A, R, F]) => {
      for (const [sp, x] of [['deer', -0.55], ['moose', 0.5]] as const) {
        const t = await A.runAsync(M.trophyGen(sp));
        const m = new THREE.Mesh(t.geo, R.creatureMaterial(t.tex, t.sd).mat); m.castShadow = true;
        m.position.set(x, sp === 'deer' ? 1.45 : 1.2, 0); scene.add(m);
      }
      const items = [F.meatParcel('venison'), F.meatParcel('moose_meat'), F.meatParcel('deer_liver'), F.hideRoll('deer_hide'), F.cartridgeBox(), F.tagCard('tag_deer')];
      items.forEach((o, i) => { o.position.set(-0.9 + i * 0.36, 0.86, 0.45); scene.add(o); });
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: 0x6a4a30 })); table.position.set(0, 0.84, 0.45); scene.add(table);
      ui.info.textContent = 'trophies and items';
      (window as unknown as { __ready: boolean }).__ready = true;
    });
  } else GameAnimal.create(species, male).then((a) => {
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
// The real game, trimmed: terrain, forest, ground cover, (the store with ?store), the FP arms, the hunt installed with
// spawning off. ?x=&z=&yaw=&hour= place the player; ?spawn=buck,doe,bull,cow puts animals ahead at ?dist= metres.
async function runWorld() {
  const { Game } = await import('../game/game');
  const { input } = await import('../core/input');
  const { hud } = await import('../ui/hud');
  const { floatText } = await import('../ui/float');
  const { loadFonts } = await import('../ui/paper');
  const { audio } = await import('../audio/audio');
  const { Forest } = await import('../world/forest');
  const { GroundCover } = await import('../world/groundcover');
  const { treeMaterials } = await import('../trees/materials');
  const { setBarkSource } = await import('../chop/wood');
  const { FPArms } = await import('../player/arms');
  const { QUALITY, applyRuntime } = await import('../game/quality');
  const { heightAt } = await import('../world/layout');
  const { install } = await import('../game/hunting');
  (document.getElementById('dev') as HTMLDivElement).style.display = qs.has('clean') ? 'none' : '';
  await loadFonts();
  const uiRoot = document.getElementById('ui')!;
  hud.mount(uiRoot); floatText.mount(uiRoot, null);
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  floatText.setCamera(game.camera);
  game.quality = QUALITY[(qs.get('quality') as 'low') ?? 'low'] ?? QUALITY.low;
  game.R.pixel = game.quality.pixel;
  await game.init();
  input.attach(document.getElementById('game')!);
  document.getElementById('game')!.addEventListener('click', () => { input.lock(); audio.unlock(); });
  const x = Number(qs.get('x') ?? 52), z = Number(qs.get('z') ?? 64), yaw = Number(qs.get('yaw') ?? 0);
  game.terrain.prime(new THREE.Vector3(x, 0, z));
  const fq = game.quality.forest;
  const forest = new Forest(game.scene, game.camera, game.R.gl, { lod0: fq.lod0, lod1: fq.lod1, far: fq.far, shadow: fq.shadow, density: fq.density });
  forest.prewarm(x, z, 70);
  game.setForest(forest as never);
  game.ground = new GroundCover(game.scene, game.camera, { forest, density: game.quality.ground });
  game.sky.sun.shadow.camera.layers.enable(1);
  setBarkSource((sp) => treeMaterials(sp as never).bark);
  if (qs.has('store')) { const { buildStore } = await import('../places/store'); const st = await buildStore(); game.store = st; game.addPlace(st); st.group.traverse((o) => { o.userData.game = game; }); }
  game.setArms(new FPArms() as never);
  applyRuntime(game.quality, game.R.gl, game.scene, game.sky.sun);
  const hunt = await install(game, { spawn: qs.has('spawnAuto'), trace: true });
  game.hour = Number(qs.get('hour') ?? 8);
  game.player.teleport(x, null, z, yaw);
  game.player.pitch = Number(qs.get('pitch') ?? 0);
  game.mode = 'walk'; game.flags.add('free');
  hud.fadeTo(false, 0);
  for (const [id, n] of [['rifle', 1], ['ammo_762', 15], ['hunting_knife', 1], ['tag_deer', 1], ['licence', 1]] as const) game.give(id, n);
  game.hands.equip(qs.get('hold') ?? 'rifle');
  hunt.rifle.mag = 5; hunt.rifle.chamber = 'live';
  // animals ahead of the player
  const fwd = game.player.forward();
  const dist = Number(qs.get('dist') ?? 30);
  const list = (qs.get('spawn') ?? '').split(',').filter(Boolean);
  await Promise.all(list.map(async (k, i) => {
    const side = (i - (list.length - 1) / 2) * 4;
    const ax = x + fwd.x * dist - fwd.z * side, az = z + fwd.z * dist + fwd.x * side;
    const a = await hunt.spawn(k === 'bull' || k === 'cow' ? 'moose' : 'deer', k === 'buck' || k === 'bull', ax, az, Number(qs.get('aheading') ?? Math.atan2(fwd.z, -fwd.x)));
    if (qs.has('freeze')) a.play(qs.get('freeze') || 'idle');
    return a;
  }));
  // a frame loop like main.ts; the Playwright hooks step it by hand
  let last = performance.now(), auto = !qs.has('manual');
  const press = (k: string) => (input as unknown as { pressedSet: Set<string> }).pressedSet.add(k);
  const hold = (k: string, on: boolean) => { const d = (input as unknown as { down: Set<string> }).down; if (on) d.add(k); else d.delete(k); };
  const step = (dt: number) => { game.update(dt); floatText.update(dt); input.endFrame(); };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (auto) step(dt);
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // warm up: a few frames so the terrain, trees and arms settle
  for (let i = 0; i < 20; i++) step(1 / 30);
  const lookAt = (p: THREE.Vector3) => {
    const e = game.camera.position, d = p.clone().sub(e);
    game.player.yaw = Math.atan2(-d.x, -d.z); game.player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  };
  const api = {
    game, hunt, input,
    step: (n: number, dt = 1 / 30) => { auto = false; for (let i = 0; i < n; i++) step(dt); game.render(); return hunt.status(); },
    run: (b: boolean) => { auto = b; },
    press, hold,
    /** aim (hold RMB) for n frames */
    aim: (on: boolean) => hold('Mouse2', on),
    fire: () => { press('Mouse0'); },
    key: (k: string) => press(k),
    lookAt: (x2: number, y2: number, z2: number) => lookAt(new THREE.Vector3(x2, y2, z2)),
    lookAtAnimal: (i = 0, dy = 0.75, dz = 0) => { const a = hunt.animals[i]; if (!a) return null; const p = a.object.localToWorld(new THREE.Vector3(0, a.model.dims.chestY + dy - 0.75, a.model.dims.chestZ + dz)); lookAt(p); return p.toArray(); },
    status: () => hunt.status(),
    /** a clean head shot on animal i (the dressing test) */
    kill: (i = 0) => { const a = hunt.animals[i]; if (!a) return null; a.shot('head', a.object.position.clone().setY(a.pos.y + 1), new THREE.Vector3(1, 0, 0), (hunt as unknown as { ctx(dt: number): never }).ctx(0)); return a.state; },
    /** hold E on whatever the crosshair is on */
    holdE: (on: boolean) => { if (on) press('KeyE'); hold('KeyE', on); },
    focus: () => game.hands.focus ? { label: game.hands.label, at: game.hands.focus.point.toArray() } : null,
    teleport: (x2: number, z2: number, yaw2 = 0) => game.player.teleport(x2, null, z2, yaw2),
    traces: () => hunt.ballistics.traces.map((t) => t.map((p) => p.toArray().map((v) => +v.toFixed(2)))),
    heightAt,
  };
  (window as unknown as { __hunt: unknown }).__hunt = api;
  ui.info.textContent = `world at ${x}, ${z}; ${list.length} animals`;
  (window as unknown as { __ready: boolean }).__ready = true;
}
