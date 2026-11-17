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
import { Jeep } from './vehicles/jeep';
import { readSave } from './game/save';
import { FPArms } from './player/arms';
import { buildProduct } from './places/products';
import { ITEMS } from './game/items';
import { CabinPlay } from './game/cabinplay';
import { Pause } from './ui/pause';
import { spawnNpcs } from './game/npcs';
import { Forest } from './world/forest';
import { GroundCover } from './world/groundcover';
import { treeMaterials } from './trees/materials';
import { setBarkSource } from './chop/wood';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

async function step<T>(label: string, f: () => Promise<T>): Promise<T | null> {
  try { return await f(); } catch (e) { console.warn(`[boot] ${label} failed`, e); return null; }
}

async function boot() {
  await loadFonts();
  hud.mount(document.getElementById('ui')!);
  hud.fadeTo(true, 0);
  hud.title('BUSHED', 'loading the bush…', 999);
  const game = new Game(canvas);
  await game.init();
  input.attach(canvas);
  canvas.addEventListener('click', () => { input.lock(); audio.unlock(); });
  (window as any).__game = game;
  const d = new Director();
  const pause = new Pause();
  pause.onChange = (st) => {
    input.sensitivity = 0.0022 * st.sensitivity;
    audio.setVolume('master', st.volume);
    if (game.R.pixel !== st.pixel) { game.R.pixel = st.pixel; game.onResize(); }
    game.R.gl.shadowMap.enabled = st.shadows;
  };
  pause.mount(document.getElementById('ui')!, canvas);

  // load the world
  game.terrain.prime(new THREE.Vector3(SPOTS.cabin.x, 0, SPOTS.cabin.z));
  await step('forest', async () => {
    const forest = new Forest(game.scene, game.camera, game.R.gl);
    forest.prewarm(SPOTS.cabin.x, SPOTS.cabin.z, 140);
    game.setForest(forest as never);
    game.ground = new GroundCover(game.scene, game.camera, { forest });
    game.sky.sun.shadow.camera.layers.enable(1);
    setBarkSource((sp) => treeMaterials(sp as never).bark);
  });
  await Promise.all([
    step('props', () => game.preloadItemModels()),
    step('cabin', async () => { const c = await buildCabin(); game.cabin = c; game.addPlace(c); }),
    step('jeep', async () => {
      const j = new Jeep(); await j.load(); game.jeep = j; game.scene.add(j.root);
      j.onEnter = () => game.enterVehicle();
    }),
  ]);
  await step('arms', async () => { const a = new FPArms(); game.setArms(a as never); });
  // generated products (jerky packs, beer bottles, tins...) become the item models
  await step('products', async () => {
    for (const it of Object.values(ITEMS)) if (it.model.startsWith('gen:')) {
      try { const m = buildProduct(it.model.slice(4) as never); if (m) game.setItemModel(it.id, m); } catch { /* not built yet */ }
    }
  });
  const cabinPlay = new CabinPlay(game);
  cabinPlay.attach();
  const critters = new Critters(game);
  await step('creatures', () => critters.spawn());
  game.updaters.push((dt) => critters.update(dt));
  await step('npcs', async () => { const npcs = spawnNpcs(game); game.updaters.push((dt) => npcs.forEach((n) => n.update(dt))); });

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
    pause.armed = game.mode === 'walk' || game.mode === 'drive';
    if (!pause.open) { d.update(dt); game.update(dt); }
    game.render();
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  hud.title('', '', 0);

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
  const choice = await runMenu(game, d);
  if (choice === 'continue' && readSave()) {
    game.load(readSave()!);
    game.player.teleport(SPOTS.cabin.x + 2, null, SPOTS.cabin.z + 4);
    game.mode = 'walk';
    hud.fadeTo(false, 2);
  } else {
    await runIntro(game, d);
  }
}
boot();
