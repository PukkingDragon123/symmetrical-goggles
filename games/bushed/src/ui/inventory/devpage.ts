// src/ui/inventory/dev.html: the hotbar in a light game (the core, the cabin and its stash, the FP arms, the item
// models; no forest, creatures, store or NPCs). Frames run only when a script calls window.__step(n), so headless
// checks stay cheap on a shared machine. window.__game is the Game.
import * as THREE from 'three';
import { Game } from '../../game/game';
import { ITEMS } from '../../game/items';
import { registerCookItems } from '../../game/cooking';
import { registerForgeItems } from '../../game/forge';
import { registerHuntItems } from '../../game/hunting/items';
import { buildCabin } from '../../places/cabin';
import { buildProduct } from '../../places/products';
import { FPArms } from '../../player/arms';
import { hud } from '../hud';
import { floatText } from '../float';
import { loadFonts } from '../paper';
import { input } from '../../core/input';
import { SPOTS } from '../../world/layout';
import { QUALITY } from '../../game/quality';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[]; __game?: Game; __step?: (n: number) => void };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));

async function main(): Promise<void> {
  registerCookItems(); registerForgeItems(); registerHuntItems();
  await loadFonts();
  hud.mount(document.getElementById('ui')!);
  floatText.mount(document.getElementById('ui')!, null);
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  game.quality = QUALITY.low;
  game.R.pixel = Number(q.get('pixel') ?? 2);
  floatText.setCamera(game.camera);
  await game.init();
  input.attach(document.getElementById('game')!);
  const arms = new FPArms(); game.setArms(arms as never);
  arms.bind?.({ player: game.player, scene: game.scene, camera: game.camera, hands: game.hands } as never);
  const cabin = await buildCabin(); game.cabin = cabin; game.addPlace(cabin);
  await game.preloadItemModels();
  for (const it of Object.values(ITEMS)) if (it.model.startsWith('gen:')) { try { const m = buildProduct(it.model.slice(4) as never); if (m) game.setItemModel(it.id, m); } catch { /* */ } }
  game.hour = Number(q.get('hour') ?? 10);
  game.player.teleport(SPOTS.cabin.x - 8, null, SPOTS.cabin.z - 6, 0);
  game.terrain.prime(new THREE.Vector3(SPOTS.cabin.x, 0, SPOTS.cabin.z));
  game.mode = 'walk';
  hud.fadeTo(false, 0);
  W.__game = game;
  W.__step = (n: number) => { for (let i = 0; i < n; i++) { game.update(1 / 30); floatText.update(1 / 30); game.render(); input.endFrame(); } };
  W.__step(2);
  W.__ready = true;
}
main().catch((e) => { W.__errors!.push(String(e?.stack ?? e)); W.__ready = true; });
