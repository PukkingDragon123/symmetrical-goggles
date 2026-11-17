// The opening of the game, written as scripted beats on the Director:
//   menu   - a night on the porch with a beer by the fire; the options are things on the stump beside you
//   intro  - three weeks earlier: the drive in at dusk, Ray's note, the axe in the block, the flagged spruce,
//            the first fire, and the thing at the woodpile that wants your axe handle
import * as THREE from 'three';
import type { Game } from './game';
import type { Director } from './director';
import { hud } from '../ui/hud';
import { input } from '../core/input';
import { SPOTS, heightAt, roadPointAt } from '../world/layout';
import { registerInteractable, unregisterInteractable } from './interact';
import { paintPaper, paperMesh } from '../ui/paper';
import { RAY_NOTE } from './story';
import { hasSave } from './save';
import { debris, puffs } from '../gfx/particles';
import { flameCards } from '../places/fixtures';
import { loadProp } from '../places/props';
import { buildPieceGeometry, barkMaterial } from '../chop/wood';
import { woodMaterial } from '../chop/woodtex';

const think = (t: string, s = 3.5) => hud.say(`<i>${t}</i>`, s);

/** world position of a named place anchor, or a fallback */
export function anchorPos(game: Game, name: string, fallback: THREE.Vector3): THREE.Vector3 {
  for (const p of [game.cabin, game.store]) {
    const a = p?.anchors?.[name] as THREE.Object3D | undefined;
    if (a) return a.getWorldPosition(new THREE.Vector3());
  }
  return fallback;
}

/** a crackling campfire: flame cards from the places kit when present, light flicker, sparks, smoke */
export function campfire(game: Game, pos: THREE.Vector3, own = false): { level: number; update(dt: number): void; light: THREE.PointLight } {
  const light = new THREE.PointLight(0xff9a4a, 0, 14, 1.6);
  light.position.copy(pos).add(new THREE.Vector3(0, 0.6, 0));
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.002;
  game.scene.add(light);
  const pitAnchor = own ? undefined : game.cabin?.anchors?.firepit as THREE.Object3D | undefined;
  let setFire = pitAnchor?.userData.setFire as ((l: number) => void) | undefined;
  if (own) {
    // a stone ring and its own flames
    const flames = flameCards(0.55, 0.75, 11);
    flames.position.copy(pos);
    game.scene.add(flames);
    setFire = (l: number) => flames.userData.tick(1 / 60, l);
    loadProp('stone_fire_pit' as never).then((m) => { m.position.copy(pos); game.scene.add(m); }).catch(() => {});
  }
  let t = 0, sparkT = 0, smokeT = 0;
  const fire = {
    level: 1, light,
    update(dt: number) {
      t += dt;
      const f = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 23.7 + 1) + 0.05 * Math.sin(t * 5.3);
      light.intensity = (setFire ? 14 : 26) * fire.level * f;
      setFire?.(fire.level);
      light.position.x = pos.x + Math.sin(t * 7) * 0.03;
      sparkT -= dt; smokeT -= dt;
      if (sparkT <= 0 && fire.level > 0.2) {
        sparkT = 0.12 + Math.random() * 0.4;
        debris.emit('ember', pos.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3(0, 1.6, 0), 1, { spread: 0.6, color: new THREE.Color(1, 0.55, 0.2) });
      }
      if (smokeT <= 0 && fire.level > 0.05) {
        smokeT = 0.35;
        puffs.emit(pos.clone().add(new THREE.Vector3(0, 0.9, 0)), new THREE.Vector3(0, 0.5, 0), { size: 0.4, grow: 3, life: 4, color: new THREE.Color(0.32, 0.3, 0.29), alpha: 0.22, rise: 0.25 });
      }
    },
  };
  game.updaters.push((dt) => fire.update(dt));
  game.fires.push({ pos, level: () => fire.level });
  return fire;
}

// ---------------------------------------------------------------------------------------------------- menu
export async function runMenu(game: Game, d: Director): Promise<'new' | 'continue'> {
  game.mode = 'menu';
  game.hour = 23.3;
  game.weather = { cloud: 0.45, rain: 0, fog: 0.7, storm: 0 };
  const chair = anchorPos(game, 'porch_chair', new THREE.Vector3(SPOTS.cabin.x + 2, heightAt(SPOTS.cabin.x + 2, SPOTS.cabin.z + 5), SPOTS.cabin.z + 5));
  const pit = anchorPos(game, 'firepit', new THREE.Vector3(SPOTS.cabin.x + 5, heightAt(SPOTS.cabin.x + 5, SPOTS.cabin.z + 10), SPOTS.cabin.z + 10));
  const fire = campfire(game, pit);
  const look = pit.clone().sub(chair); look.y = 0; look.normalize();
  const baseYaw = Math.atan2(-look.x, -look.z);
  game.player.teleport(chair.x, chair.y - 0.45, chair.z, baseYaw);
  game.player.pitch = -0.05;
  game.arms?.setHeld('bottle', game.toolModel('beer') ?? undefined);
  const cam = game.camera;
  const eye = chair.clone().add(new THREE.Vector3(0, 0.75, 0));
  // menu objects sit on a stump to the right of the chair
  const right = new THREE.Vector3(-look.z, 0, look.x);
  const table = chair.clone().addScaledVector(right, 0.75).addScaledVector(look, 0.25);
  // a big spruce round stood on end beside the chair is the side table
  const groundY = Math.max(heightAt(table.x, table.z), chair.y - 0.45);
  const rg = buildPieceGeometry({ species: 'spruce', stem: [{ y: 0, r: 0.3, x: 0, z: 0 }, { y: 1, r: 0.29, x: 0, z: 0 }], y0: 0, y1: 0.46, seed: 77 });
  const stump = new THREE.Mesh(rg.geo, [barkMaterial('spruce'), woodMaterial('end', 'spruce', 3), woodMaterial('split', 'spruce')]);
  stump.position.set(table.x, groundY + 0.23, table.z);
  stump.castShadow = stump.receiveShadow = true;
  game.scene.add(stump);
  table.y = groundY + 0.465;
  const options: { obj: THREE.Object3D; label: string; act: string }[] = [];
  const mk = (canvasBlocks: Parameters<typeof paintPaper>[0], label: string, act: string, off: THREE.Vector3, rot: number, style: 'notebook' | 'kraft' | 'card') => {
    const m = paperMesh(paintPaper(canvasBlocks, { style, w: 192, h: 256, seed: options.length + 3 }), 0.12);
    m.rotation.set(-Math.PI / 2 + 0.05, 0, rot);
    m.position.copy(table).add(off);
    game.scene.add(m);
    registerInteractable(m, { kind: 'custom', label: () => label, use: () => {}, reach: 3 });
    options.push({ obj: m, label, act });
  };
  mk([{ t: 'h', text: 'Kettle Lake' }, { t: 'p', text: 'Hwy 11 / Rang 4' }, { t: 'sketch', h: 110, draw: (g, x, y, w, h) => { g.strokeStyle = '#7a3a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + h * 0.2); g.bezierCurveTo(x + w * 0.4, y, x + w * 0.5, y + h, x + w, y + h * 0.7); g.stroke(); g.fillStyle = '#3b5d7a'; g.beginPath(); g.ellipse(x + w * 0.7, y + h * 0.35, 26, 16, 0.3, 0, 7); g.fill(); } }], 'Start the season', 'new', right.clone().multiplyScalar(-0.12), 0.3, 'kraft');
  if (hasSave()) mk([{ t: 'h', text: 'Field journal' }, { t: 'p', text: 'R. Tremblay' }], 'Pick up where you left off', 'continue', right.clone().multiplyScalar(0.1).addScaledVector(look, 0.08), -0.2, 'card');
  mk([{ t: 'h', text: 'BUSHED' }, { t: 'small', text: 'a game about wood, cold, and the things in the bush' }, { t: 'gap', h: 8 }, { t: 'small', text: 'Sounds: BigSoundBank, Radio Aporee, NPS. Models & textures: Poly Haven (CC0). Fonts: Google Fonts (OFL). Code: lowpix, Limbophobia, Oddworld.' }], 'Credits', 'credits', right.clone().multiplyScalar(0.02).addScaledVector(look, -0.12), 0.05, 'notebook');

  let choice: 'new' | 'continue' | null = null;
  let yaw = baseYaw, pitch = -0.08, t = 0, eventT = 12;
  hud.fadeTo(false, 3);
  const ray = new THREE.Raycaster();
  const tick = (dt: number) => {
    if (game.mode !== 'menu') return;
    t += dt;
    if (input.locked) { yaw -= input.mouseDX * 0.0018; pitch -= input.mouseDY * 0.0018; }
    yaw = THREE.MathUtils.clamp(yaw, baseYaw - 1.2, baseYaw + 1.2);
    pitch = THREE.MathUtils.clamp(pitch, -0.9, 0.5);
    cam.position.copy(eye).add(new THREE.Vector3(0, Math.sin(t * 0.8) * 0.006, 0));
    cam.rotation.set(pitch + Math.sin(t * 0.37) * 0.004, yaw + Math.sin(t * 0.23) * 0.006, 0, 'YXZ');
    ray.setFromCamera(new THREE.Vector2(0, 0), cam);
    const hit = ray.intersectObjects(options.map((o) => o.obj))[0];
    const opt = hit ? options.find((o) => o.obj === hit.object) : null;
    hud.setLabel(opt ? opt.label : '');
    hud.showDot(true);
    if (opt && input.pressed('Mouse0')) {
      if (opt.act === 'credits') hud.say('Made with lowpix. Every sound is a real recording, every model was converted or built for this game.', 5);
      else choice = opt.act as 'new' | 'continue';
    }
    if (Math.random() < dt * 0.04) game.arms?.play('drink');
    // things in the dark
    eventT -= dt;
    if (eventT <= 0) {
      eventT = 18 + Math.random() * 25;
      game.events.emit('menu_scare', { pos: pit.clone().addScaledVector(look, 22 + Math.random() * 12).addScaledVector(right, (Math.random() - 0.5) * 30) });
    }
  };
  game.updaters.push(tick);
  await d.until(() => choice !== null);
  hud.setLabel('');
  game.arms?.play('drop');
  game.sound('bottle_set', table, 0.7);
  game.arms?.setHeld('none');
  await d.sleep(0.8);
  hud.fadeTo(true, 1.6);
  await d.sleep(1.8);
  for (const o of options) { unregisterInteractable(o.obj); o.obj.removeFromParent(); }
  if (choice !== 'continue') stump.removeFromParent();
  game.updaters.splice(game.updaters.indexOf(tick), 1);
  fire.level = choice === 'continue' ? 1 : 0;
  return choice!;
}

// ---------------------------------------------------------------------------------------------------- intro
export async function runIntro(game: Game, d: Director): Promise<void> {
  game.day = 0;
  game.hour = 18.1;
  game.weather = { cloud: 0.3, rain: 0, fog: 0.25, storm: 0 };
  hud.title('Three weeks earlier', '', 3);
  await d.sleep(3.2);
  // the drive in
  const jeep = game.jeep;
  if (jeep) {
    const start = roadPointAt('highway', 540);
    jeep.spawn(start.x, start.z, start.dir);
    jeep.running = true; jeep.headlights = true;
    game.enterVehicle();
  } else {
    game.player.teleport(SPOTS.cabin.x - 20, null, SPOTS.cabin.z - 10, 0.9);
    game.mode = 'walk';
  }
  hud.fadeTo(false, 2.5);
  hud.title('BUSHED', 'Kettle Lake, Northern Ontario — late September', 6);
  await d.sleep(4);
  think("Ray's letter said: left at Pruneau's store, then follow the logging road till it gives up.", 5);
  if (jeep) {
    await d.until(() => game.player.pos.distanceTo(new THREE.Vector3(SPOTS.store.x, game.player.pos.y, SPOTS.store.z)) < 45);
    think('Pruneau\'s. Lights on. Somebody\'s still awake out here.', 4);
    await d.until(() => game.player.pos.distanceTo(new THREE.Vector3(SPOTS.cabin.x, game.player.pos.y, SPOTS.cabin.z)) < 30);
    think('That must be it.', 3);
    await d.until(() => game.mode === 'walk');
  }
  game.timeScale = 30;
  think('Cold. Colder than the letter made it sound.', 3.5);
  game.journal.sawCritter('hound');
  // Ray's note on the door
  const door = anchorPos(game, 'door', new THREE.Vector3(SPOTS.cabin.x, heightAt(SPOTS.cabin.x, SPOTS.cabin.z) + 1.5, SPOTS.cabin.z + 3));
  const note = paperMesh(paintPaper(RAY_NOTE, { style: 'notebook', seed: 42 }), 0.18);
  note.position.copy(door).add(new THREE.Vector3(0, 0.1, 0));
  const doorObj = (game.cabin?.anchors?.door as THREE.Object3D | undefined);
  if (doorObj) { doorObj.add(note); note.position.set(0, 0.15, 0.06); note.rotation.set(0, 0, 0.04); } else game.scene.add(note);
  let read = false;
  registerInteractable(note, { kind: 'paper', label: () => 'Read the note', use: () => { game.readPaper(RAY_NOTE, 42); read = true; } });
  await d.either(() => read, 60);
  if (!read) think("There's a note on the door.", 3);
  await d.until(() => read);
  unregisterInteractable(note);
  note.removeFromParent();
  game.flags.add('ray_note');
  // the matches really are in the table drawer
  game.take('matches', 99);
  const drawer = game.cabin?.group.getObjectByName('drawer_0') ?? null;
  const box = game.toolModel('matches');
  if (box) {
    box.scale.setScalar(1);
    if (drawer) { drawer.add(box); box.position.set(0.05, 0.03, 0.05); }
    else { box.position.copy(anchorPos(game, 'table', door)); game.scene.add(box); }
    registerInteractable(box, { kind: 'pickup', label: () => 'Take the matches', use: () => { game.give('matches'); box.removeFromParent(); game.sound('pickup', undefined, 0.5); } });
  } else game.give('matches');
  // the axe in the block (Ray's axe is held until pulled)
  game.take('axe_old');
  const block = anchorPos(game, 'chopping_block', new THREE.Vector3(SPOTS.woodyard.x, heightAt(SPOTS.woodyard.x, SPOTS.woodyard.z) + 0.55, SPOTS.woodyard.z));
  const axeInBlock = game.axeInBlock(block);
  await d.until(() => game.owns('axe_old'));
  axeInBlock?.removeFromParent();
  think('Right. A little spruce with orange tape behind the shed.', 4);
  game.flagIntroTree();
  // fell, buck, split, burn
  await d.until(() => game.felledCount > 0);
  think('Timber. Now take the branches off and cut it into rounds.', 4);
  await d.until(() => game.stove.fuel > 2 || game.stove.lit);
  await d.until(() => game.stove.lit);
  think('There. The stove ticks as it warms. That sound is the best sound in the world.', 5);
  game.flags.add('first_fire');
  // night falls properly now, and something comes to the woodpile
  game.timeScale = 40;
  await d.until(() => game.hour > 20.4 && !game.indoors);
  game.events.emit('intro_hound');
  await d.until(() => game.flags.has('hound_fed'));
  await d.sleep(2);
  think('...Good dog?', 3);
  await d.sleep(4);
  think('The bunk. Sleep. Tomorrow: Pruneau\'s store, and whatever pays.', 4.5);
}
