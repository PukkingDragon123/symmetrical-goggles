import * as THREE from 'three';
import { Game } from './game/game';
import { Director } from './game/director';
import { runMenu, runIntro } from './game/flow';
import { Critters } from './game/critters';
import { input } from './core/input';
import { hud } from './ui/hud';
import { loadFonts } from './ui/paper';
import { audio } from './audio/audio';
import { SPOTS, heightAt } from './world/layout';
import { WoodPiece } from './chop/wood';
import { buildCabin } from './places/cabin';
import { buildStore } from './places/store';
import { StorePlay } from './game/storeplay';
import { Jeep, installTruck } from './vehicles/jeep';
import { stockTruckParts } from './vehicles/truckstock';
import { readSave } from './game/save';
import { FPArms } from './player/arms';
import { buildProduct } from './places/products';
import { ITEMS } from './game/items';
import { CabinPlay } from './game/cabinplay';
import { Pause } from './ui/pause';
import { floatText } from './ui/float';
import { QUALITY, guessQuality, storedQuality, storeQuality, applyRuntime, type QualityName } from './game/quality';
import { spawnNpcs } from './game/npcs';
import { install as installHunting } from './game/hunting';
import { install as installBook } from './ui/bookofcryptids';
import { installCooking, registerCookItems } from './game/cooking';
import { installForge, registerForgeItems } from './game/forge';
import { installFauna } from './world/fauna';
import { installStories } from './game/stories';
import { Forest } from './world/forest';
import { GroundCover } from './world/groundcover';
import { treeMaterials } from './trees/materials';
import { barkTexture, barkNormal } from './trees/textures';
import { setBarkSource } from './chop/wood';
import { physics } from './physics/physics';
import { mark, bootTimes } from './boot/timing';
import { loading } from './boot/loading';
import { Later } from './boot/later';
import { LightBudget } from './boot/lights';
import { precompile, parallelCompile, Holdback } from './boot/precompile';
import { bitmapize } from './boot/images';

// Boot order (timings in window.__bootTimes, `[boot] <step> <ms>` in the console):
//   1. before the Game exists: physics' wasm compiles and the fonts download, in parallel
//   2. the first view, as parallel as it goes: downloads (cabin, Jeep + trailer, item models) start first, the
//      terrain and the forest are built while they are in flight, then the arms
//   3. the shaders for that view compile (in the background where the GPU allows) with the final light counts
//   4. one frame behind the loading screen, then the tree falls and the player is in control
//   5. everything else (the store and its people, kitchen, forge, hunting, creatures, the Book, birds and bugs,
//      the stories) loads one task per frame while you play, each object held back until its shaders are ready.
//      New installs that are not needed in the first second go in the `later.add(...)` list below.
const canvas = document.getElementById('game') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

async function step<T>(label: string, f: () => Promise<T> | T): Promise<T | null> {
  const t0 = performance.now();
  try { return await f(); } catch (e) { console.warn(`[boot] ${label} failed`, e); return null; } finally { mark(label, t0); }
}

// 1. physics and fonts start at once; physics.init is made idempotent so Game.init reuses the same promise
const physicsReady = (() => {
  const t0 = performance.now();
  const p = physics.init().finally(() => mark('physics', t0));
  physics.init = () => p;
  loading.begin('physics');
  void p.finally(() => loading.end('physics'));
  return p;
})();
const fontsReady = step('fonts', () => loading.step('fonts', () => loadFonts()));

async function boot() {
  mark('module eval', 0);
  // modules' items go in the catalogue before the store stocks its shelves
  registerCookItems(); registerForgeItems();
  await fontsReady;
  hud.mount(document.getElementById('ui')!);
  floatText.mount(document.getElementById('ui')!, null);
  hud.fadeTo(true, 0);
  const game = await step('game', () => loading.step('game', () => new Game(canvas)));
  if (!game) throw new Error('BUSHED: the game could not start');
  floatText.setCamera(game.camera);
  const qName: QualityName = (params.get('quality') as QualityName) ?? storedQuality() ?? guessQuality(game.R.gl);
  game.quality = QUALITY[qName] ?? QUALITY.high;
  game.R.pixel = game.quality.pixel;
  await physicsReady;
  await step('game init', () => game.init());
  input.attach(canvas);
  canvas.addEventListener('click', () => { input.lock(); audio.unlock(); });
  (window as any).__game = game;
  const d = new Director();
  (window as any).__director = d;
  const pause = new Pause();
  pause.onChange = (st) => {
    input.sensitivity = 0.0022 * st.sensitivity;
    audio.setVolume('master', st.volume);
    if (st.quality && st.quality !== game.quality.name) {
      game.quality = QUALITY[st.quality as QualityName] ?? game.quality;
      storeQuality(game.quality.name);
      applyRuntime(game.quality, game.R.gl, game.scene, game.sky.sun);
      st.pixel = game.quality.pixel;
    }
    if (game.R.pixel !== st.pixel) { game.R.pixel = st.pixel; game.onResize(); }
    game.R.gl.shadowMap.enabled = st.shadows;
  };
  pause.mount(document.getElementById('ui')!, canvas);

  // 2. the first view. Downloads go first so they are in flight while the CPU builds the terrain and forest.
  const cabinP = step('cabin', () => loading.step('cabin', async () => { const c = await buildCabin(); game.cabin = c; game.addPlace(c); }));
  const jeepP = step('jeep', () => loading.step('jeep', async () => {
    // the logging truck (its flatbed replaced the old 4x4's trailer); it waits at the cabin, the intro respawns it
    // on the highway. installTruck: camera feel, engine audio, cab keys, winch, repairs
    const j = new Jeep();
    await j.load();
    game.jeep = j; game.scene.add(j.root);
    j.onEnter = () => game.enterVehicle();
    const park = SPOTS.cabin;
    j.spawn(park.x - 11.5, park.z - 6.5, 2.4);
    installTruck(game);
  }));
  const propsP = step('props', () => loading.step('props', () => game.preloadItemModels()));
  await step('terrain', () => loading.step('terrain', async () => { game.terrain.prime(new THREE.Vector3(SPOTS.cabin.x, 0, SPOTS.cabin.z)); }));
  await step('forest', () => loading.step('forest', async () => {
    const fq = game.quality.forest;
    const forest = new Forest(game.scene, game.camera, game.R.gl, { lod0: fq.lod0, lod1: fq.lod1, far: fq.far, shadow: fq.shadow, density: fq.density });
    forest.prewarm(SPOTS.cabin.x, SPOTS.cabin.z, 140);
    game.setForest(forest as never);
    game.ground = new GroundCover(game.scene, game.camera, { forest, density: game.quality.ground });
    game.sky.sun.shadow.camera.layers.enable(1);
    // logs and firewood use the forest's bark textures in a plain lit material (the tree material's distance
    // fade would darken pieces carried in the viewmodel)
    const barks = new Map<string, THREE.MeshStandardMaterial>();
    setBarkSource((sp) => {
      let m = barks.get(sp);
      if (!m) {
        const base = treeMaterials(sp as never).bark as THREE.MeshStandardMaterial;
        m = new THREE.MeshStandardMaterial({ map: barkTexture(sp as never), normalMap: barkNormal(sp as never), roughness: 0.95, color: base.color });
        barks.set(sp, m);
      }
      return m;
    });
  }));
  // a placeholder light stands in for every lamp still to come, so nothing recompiles when they arrive. Where the
  // GPU compiles in the background (KHR_parallel_shader_compile: desktop Chrome/Electron on a real GPU) every
  // shader of the scene starts compiling now, on the GPU's threads, while the CPU carries on, so nothing stalls
  // later when you turn around. Without it a compile blocks the next GL call that needs the GPU, so the first
  // frame compiles only what it draws, as three.js does by itself.
  const lights = new LightBudget(game.scene, game.quality.name, game.quality.lampShadows);
  lights.onNewLight = () => applyRuntime(game.quality, game.R.gl, game.scene, game.sky.sun);
  const par = parallelCompile(game);
  const compiling: Promise<unknown>[] = [];
  const kick = (root: THREE.Object3D, cam: THREE.Camera, target: THREE.Scene) => { lights.balance(); if (par) compiling.push(precompile(game, root, cam, target)); };
  kick(game.scene, game.camera, game.scene);
  await step('arms', () => loading.step('arms', async () => {
    const a = new FPArms(); game.setArms(a as never);
    // the Gacha Garage port: body under the camera, footstep-synced hands, reach, inspect
    a.bind?.({ player: game.player, scene: game.scene, camera: game.camera, hands: game.hands } as never);
  }));
  kick(game.view, game.viewCam, game.view);
  await Promise.all([cabinP, jeepP, propsP]);
  // generated products (jerky packs, beer bottles, tins...) become the item models
  await step('products', () => loading.step('products', async () => {
    for (const it of Object.values(ITEMS)) if (it.model.startsWith('gen:')) {
      try { const m = buildProduct(it.model.slice(4) as never); if (m) game.setItemModel(it.id, m); } catch { /* not built yet */ }
    }
  }));
  const cabinPlay = new CabinPlay(game);
  await step('cabin play', () => loading.step('cabin play', () => cabinPlay.attach()));
  game.events.on('gunshot', () => { game.lastShotAt = performance.now(); });
  applyRuntime(game.quality, game.R.gl, game.scene, game.sky.sun);
  const critters = new Critters(game);
  game.updaters.push((dt) => critters.update(dt));
  game.critters = critters as never;

  // 3. one update so the streamed parts of the first view exist (forest impostors, ground cover chunks), then the
  //    shaders for everything added since the first kick; wait for all of them
  await step('warm update', () => { game.update(0); });
  kick(game.scene, game.camera, game.scene);
  kick(game.view, game.viewCam, game.view);
  // images decode on browser threads while the GPU compiles
  compiling.push(step('images', () => Promise.all([bitmapize(game.R.gl, game.scene), bitmapize(game.R.gl, game.view)])));
  await step('shaders', () => loading.step('shaders', () => Promise.all(compiling)));
  const progs = () => game.R.gl.info.programs?.length ?? 0;
  const precompiled = progs();
  (window as any).__bootLights = lights;

  // 4. one frame behind the loading screen (post passes and shadow programs compile here), then play
  let balancing = true;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
    pause.armed = game.mode === 'walk' || game.mode === 'drive';
    if (!pause.open) { d.update(dt); game.update(dt); }
    floatText.update(dt);
    if (balancing) lights.balance();
    game.render();
    input.endFrame();
    requestAnimationFrame(frame);
  };
  await step('first frame', () => loading.step('first frame', () => { game.update(0); lights.balance(); game.render(); }));
  mark('TOTAL', 0);
  console.info(`[boot] programs: ${precompiled} precompiled, ${progs()} after the first frame; lights ${lights.stats()}`);
  console.info('[boot] ' + Object.entries(bootTimes).map(([k, v]) => `${k} ${v}`).join(' | '));
  requestAnimationFrame(frame);
  void loading.done();
  floatText.clearTitles();

  // 5. the rest, one task per frame while you play (or sit on the porch)
  const later = new Later();
  // objects a task adds are held back until their shaders and images are ready (only while a task runs, so
  // gameplay never sees a dropped item appear a frame late)
  const hold = new Holdback(game);
  (window as any).__bootLater = later;
  later.before = () => { hold.start(); };
  later.after = () => { hold.stop(); lights.balance(); };
  later.drained = () => {
    lights.save();
    mark('IDLE_DONE', 0);
    console.info(`[boot] all loaded; lights ${lights.stats()}${lights.grew ? ` (grew ${lights.grew}x)` : ''}; held back ${hold.held}; parallel compile ${parallelCompile(game)}`);
    // keep the light counts steady a little longer (late lamps from the stories), then stop counting
    setTimeout(() => { lights.balance(); balancing = false; }, 15000);
  };
  // (the original relative order of the installs is kept: each may wrap game hooks the next relies on)
  later.add('store', async () => { const st = await buildStore(); game.store = st; game.addPlace(st); st.group.traverse((o) => { o.userData.game = game; }); stockTruckParts(game); });
  later.add('kitchen', () => { installCooking(game); });
  later.add('forge', () => installForge(game));
  later.add('store play', () => new StorePlay(game, (n, c) => cabinPlay.act(n, c)).attach());
  later.add('hunting', () => installHunting(game, { hotkey: null } as never));
  later.add('npcs', () => { const npcs = spawnNpcs(game); game.updaters.push((dt) => npcs.forEach((n) => n.update(dt))); });
  later.add('stories', () => installStories(game));
  later.add('fauna', () => { installFauna(game as never); });
  later.add('creatures', () => critters.spawn());
  later.add('book', () => { installBook(game); });
  later.start();
  /** what the story needs before the menu hands over to the intro or a saved game */
  const storyReady = () => Promise.all(['store', 'store play', 'kitchen', 'forge', 'hunting', 'npcs', 'stories'].map((k) => later.task(k)));

  // dev shortcuts: ?play skips menu and intro, ?test adds pieces to play with
  if (params.has('play') || params.has('test')) {
    if (params.has('hour')) game.hour = Number(params.get('hour'));
    const sx = Number(params.get('x') ?? SPOTS.cabin.x - 8), sz = Number(params.get('z') ?? SPOTS.cabin.z - 6);
    game.player.teleport(sx, null, sz, Number(params.get('yaw') ?? 0));
    game.player.pitch = Number(params.get('pitch') ?? 0);
    game.terrain.prime(new THREE.Vector3(sx, 0, sz));
    game.mode = 'walk';
    game.flags.add('free');
    hud.fadeTo(false, 0.5);
    if (game.jeep && params.has('jeep')) { game.jeep.spawn(sx + 4, sz, 0); }
    if (params.has('test')) {
      for (let i = 0; i < 4; i++) {
        const stem = [{ y: 0, r: 0.16, x: 0, z: 0 }, { y: 6, r: 0.11, x: 0, z: 0 }];
        const p = new WoodPiece({ species: (['spruce', 'birch', 'pine', 'cedar'] as const)[i], stem, y0: 0.4 * i, y1: 0.4 * i + (i === 3 ? 2.4 : 0.42), seed: i + 1 });
        const x = sx + 1.5 + i * 0.8, z = sz - 2;
        p.spawn(new THREE.Vector3(x, heightAt(x, z) + 0.6, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(i === 3 ? Math.PI / 2 : 0, 0, 0)));
        game.chop.addPiece(p);
      }
      game.give('axe_splitting'); game.give('hatchet'); game.give('bucksaw');
    }
    return;
  }
  const choice = params.has('intro') ? 'new' : await runMenu(game, d);
  await storyReady();
  if (choice === 'continue' && readSave()) {
    game.load(readSave()!);
    // the creatures may still be loading: the hound's trust is applied as soon as it exists
    const trust = game.savedHoundTrust;
    const applyHound = () => {
      if (critters.hound && trust >= 99) { critters.hound.state = 'companion'; critters.hound.object.visible = true; }
      else if (critters.hound) critters.hound.trust = trust;
    };
    if (critters.hound) applyHound(); else void later.task('creatures').then(applyHound);
    game.flags.add('free');
    game.player.teleport(SPOTS.cabin.x + 2, null, SPOTS.cabin.z + 4);
    game.mode = 'walk';
    hud.fadeTo(false, 2);
  } else {
    await runIntro(game, d);
  }
}
boot().catch((e) => {
  // never leave the player on a loading screen that will not finish
  console.error('[boot] failed', e);
  void loading.done();
});
