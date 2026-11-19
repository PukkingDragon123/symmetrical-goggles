// stations.html: the cabin (and the forge lean-to beside the woodshed) on terrain, a real Game with the FP arms,
// CabinPlay and the two close-up stations installed. Walk up and press E on the stove top or the forge, or use
// the buttons. Query: ?at=cook|forge enters straight away, ?hour=h, ?shot=1 hides the dev panel, ?full gives the
// pack every ingredient and material. window.__st = { game, cooking, forge } for scripted screenshots.
import * as THREE from 'three';
import { Game } from '../game/game';
import { input } from '../core/input';
import { hud } from '../ui/hud';
import { floatText } from '../ui/float';
import { loadFonts } from '../ui/paper';
import { audio } from '../audio/audio';
import { buildCabin } from '../places/cabin';
import { FPArms } from '../player/arms';
import { buildProduct } from '../places/products';
import { ITEMS } from '../game/items';
import { CabinPlay } from '../game/cabinplay';
import { installCooking, type CookingStation } from '../game/cooking';
import { installForge, type ForgeStation } from '../game/forge';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __st?: { game: Game; cooking: CookingStation | null; forge: ForgeStation | null }; __ready?: boolean; __errors?: string[] };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));
if (q.get('shot') === '1') document.body.classList.add('shot');

async function boot(): Promise<void> {
  await loadFonts();
  hud.mount(document.getElementById('ui')!);
  floatText.mount(document.getElementById('ui')!, null);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const game = new Game(canvas);
  floatText.setCamera(game.camera);
  await game.init();
  input.attach(canvas);
  canvas.addEventListener('click', () => { input.lock(); audio.unlock(); });
  const cabin = await buildCabin();
  game.cabin = cabin;
  game.addPlace(cabin);
  await game.preloadItemModels().catch(() => {});
  game.setArms(new FPArms() as never);
  for (const it of Object.values(ITEMS)) if (it.model.startsWith('gen:')) { try { game.setItemModel(it.id, buildProduct(it.model.slice(4))); } catch { /* */ } }
  const cp = new CabinPlay(game);
  cp.attach();
  const cooking = installCooking(game);
  const forge = await installForge(game);
  W.__st = { game, cooking, forge };
  // a warm evening at the cabin, the stove going
  game.hour = Number(q.get('hour') ?? 18.2);
  game.flags.add('free');
  game.stove.lit = true; game.stove.fuel = 6; game.stove.level = 0.7; game.stove.roomTemp = 19;
  if (q.has('full')) for (const id of ['bacon', 'eggs', 'fish', 'bannock_mix', 'berries', 'beans', 'syrup', 'coffee', 'chanterelle', 'kindling', 'iron_stock', 'tool_steel', 'axe_handle', 'coal', 'charcoal']) if (ITEMS[id]) game.give(id, 2);
  game.mode = 'walk';
  const at = q.get('at');
  const go = (w: string) => {
    if (w === 'cook' && cooking) { cooking.standAt(); cooking.enter(); }
    if (w === 'forge' && forge) { forge.standAt(); forge.enter(); }
  };
  document.getElementById('b-cook')!.onclick = () => go('cook');
  document.getElementById('b-forge')!.onclick = () => go('forge');
  document.getElementById('b-walk')!.onclick = () => { cooking?.exit(); forge?.exit(); };
  if (at) { if (at === 'cook') cooking?.standAt(); else forge?.standAt(); }
  else game.player.teleport(Number(q.get('x') ?? 9), null, Number(q.get('z') ?? 6), Number(q.get('yaw') ?? 0.8));
  let last = performance.now();
  const info = document.getElementById('dev-info')!;
  let infoT = 0;
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    game.update(dt);
    floatText.update(dt);
    game.render();
    input.endFrame();
    if ((infoT -= dt) <= 0) { infoT = 0.5; info.textContent = JSON.stringify(cooking?.active ? cooking.debug() : forge?.active ? forge.debug() : { pos: game.player.pos.toArray().map((v) => +v.toFixed(1)) }, null, 0).slice(0, 600); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (at) setTimeout(() => go(at), 300);
  W.__ready = true;
  void THREE;
}
boot();
