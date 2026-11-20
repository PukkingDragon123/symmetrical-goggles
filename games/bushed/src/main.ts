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
import { Jeep } from './vehicles/jeep';
import { Trailer } from './vehicles/trailer';
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

const canvas = document.getElementById('game') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

async function step<T>(label: string, f: () => Promise<T>): Promise<T | null> {
  try { return await f(); } catch (e) { console.warn(`[boot] ${label} failed`, e); return null; }
}

async function boot() {
  await loadFonts();
  // modules' items go in the catalogue before the store stocks its shelves
  registerCookItems(); registerForgeItems();
  hud.mount(document.getElementById('ui')!);
  floatText.mount(document.getElementById('ui')!, null);
  hud.fadeTo(true, 0);
  hud.title('BUSHED', 'loading the bush…', 999);
  const game = new Game(canvas);
  floatText.setCamera(game.camera);
  const qName: QualityName = (params.get('quality') as QualityName) ?? storedQuality() ?? guessQuality(game.R.gl);
  game.quality = QUALITY[qName] ?? QUALITY.high;
  game.R.pixel = game.quality.pixel;
  await game.init();
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

  // load the world
  game.terrain.prime(new THREE.Vector3(SPOTS.cabin.x, 0, SPOTS.cabin.z));
  await step('forest', async () => {
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
  });
  await Promise.all([
    step('props', () => game.preloadItemModels()),
    step('cabin', async () => { const c = await buildCabin(); game.cabin = c; game.addPlace(c); }),
    step('store', async () => { const st = await buildStore(); game.store = st; game.addPlace(st); st.group.traverse((o) => { o.userData.game = game; }); }),
    step('jeep', async () => {
      const j = new Jeep(); await j.load(); game.jeep = j; game.scene.add(j.root);
      j.onEnter = () => game.enterVehicle();
      // the Jeep waits at the cabin with the trailer beside it (the intro respawns it on the highway)
      const park = SPOTS.cabin;
      j.spawn(park.x - 11.5, park.z - 6.5, 2.4);
      const t = new Trailer(); await t.load(); game.scene.add(t.root);
      t.spawn(park.x - 15, park.z - 3.5, 2.4);
      game.trailer = t;
    }),
  ]);
  await step('arms', async () => {
    const a = new FPArms(); game.setArms(a as never);
    // the Gacha Garage port: body under the camera, footstep-synced hands, reach, inspect
    a.bind?.({ player: game.player, scene: game.scene, camera: game.camera, hands: game.hands } as never);
  });
  // generated products (jerky packs, beer bottles, tins...) become the item models
  await step('products', async () => {
    for (const it of Object.values(ITEMS)) if (it.model.startsWith('gen:')) {
      try { const m = buildProduct(it.model.slice(4) as never); if (m) game.setItemModel(it.id, m); } catch { /* not built yet */ }
    }
  });
  const cabinPlay = new CabinPlay(game);
  cabinPlay.attach();
  await step('kitchen', async () => { installCooking(game); });
  await step('forge', async () => { await installForge(game); });
  const storePlay = new StorePlay(game, (n, c) => cabinPlay.act(n, c));
  await step('store play', async () => storePlay.attach());
  await step('hunting', async () => { await installHunting(game, { hotkey: null } as never); });
  game.events.on('gunshot', () => { game.lastShotAt = performance.now(); });
  applyRuntime(game.quality, game.R.gl, game.scene, game.sky.sun);
  const critters = new Critters(game);
  await step('creatures', () => critters.spawn());
  game.updaters.push((dt) => critters.update(dt));
  game.critters = critters as never;
  installBook(game);
  await step('fauna', async () => { installFauna(game as never); });
  await step('npcs', async () => { const npcs = spawnNpcs(game); game.updaters.push((dt) => npcs.forEach((n) => n.update(dt))); });
  await step('stories', () => installStories(game));

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
    pause.armed = game.mode === 'walk' || game.mode === 'drive';
    if (!pause.open) { d.update(dt); game.update(dt); }
    floatText.update(dt);
    game.render();
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  floatText.clearTitles();

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
  if (choice === 'continue' && readSave()) {
    game.load(readSave()!);
    if (critters.hound && game.savedHoundTrust >= 99) { critters.hound.state = 'companion'; critters.hound.object.visible = true; game.flags.add('free'); }
    else if (critters.hound) critters.hound.trust = game.savedHoundTrust;
    game.flags.add('free');
    game.player.teleport(SPOTS.cabin.x + 2, null, SPOTS.cabin.z + 4);
    game.mode = 'walk';
    hud.fadeTo(false, 2);
  } else {
    await runIntro(game, d);
  }
}
boot();
