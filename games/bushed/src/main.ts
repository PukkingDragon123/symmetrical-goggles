import * as THREE from 'three';
import { Game } from './game/game';
import { input } from './core/input';
import { hud } from './ui/hud';
import { loadFonts } from './ui/paper';
import { audio } from './audio/audio';
import { SPOTS, heightAt } from './world/layout';
import { WoodPiece } from './chop/wood';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

async function boot() {
  await loadFonts();
  hud.mount(document.getElementById('ui')!);
  const game = new Game(canvas);
  await game.init();
  input.attach(canvas);
  canvas.addEventListener('click', () => { input.lock(); audio.unlock(); });
  if (params.has('hour')) game.hour = Number(params.get('hour'));
  const sx = Number(params.get('x') ?? SPOTS.cabin.x - 8), sz = Number(params.get('z') ?? SPOTS.cabin.z - 6);
  game.player.teleport(sx, null, sz, Number(params.get('yaw') ?? 0));
  game.player.pitch = Number(params.get('pitch') ?? 0);
  game.terrain.prime(new THREE.Vector3(sx, 0, sz));
  game.mode = 'walk';
  if (params.has('test')) {
    // a few test rounds and a log near the start
    for (let i = 0; i < 4; i++) {
      const stem = [{ y: 0, r: 0.16, x: 0, z: 0 }, { y: 6, r: 0.11, x: 0, z: 0 }];
      const p = new WoodPiece({ species: (['spruce', 'birch', 'pine', 'cedar'] as const)[i], stem, y0: 0.4 * i, y1: 0.4 * i + (i === 3 ? 2.4 : 0.42), seed: i + 1 });
      const x = sx + 1.5 + i * 0.8, z = sz - 2;
      p.spawn(new THREE.Vector3(x, heightAt(x, z) + 0.6, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(i === 3 ? Math.PI / 2 : 0, 0, 0)));
      game.chop.addPiece(p);
    }
    game.give('axe_splitting'); game.give('hatchet'); game.give('bucksaw');
  }
  (window as any).__game = game;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    game.update(dt);
    game.render();
    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot();
