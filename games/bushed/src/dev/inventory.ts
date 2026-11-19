// inventory.html: the 3D backpack inventory on its own, over a patch of forest floor, through the game's renderer.
// A stand-in game (counts map, hands, set-down) is installed exactly the way game.ts installs the real one.
//   ?open=1        open the pack at once            ?fill=full|starter|heavy   what is in it
//   ?night=1       night light                       ?pixel=2                   renderer pixel size
//   ?icons=1       the pixel-art icon sheet instead (?scale=3)
// window.__pack (PackUI), __game (stand-in), __step(n) (advance n frames of 1/60 s).
import * as THREE from 'three';
import { ITEMS } from '../game/items';
import { loadFonts } from '../ui/paper';
import { itemIcon, allIconsReady, iconReady } from '../ui/inventory/icons';
import { PackUI, type PackGame } from '../ui/inventory/pack3d';
import { Renderer } from '../gfx/renderer';
import { loadTex } from '../gfx/tex';
import { input } from '../core/input';
import { floatText } from '../ui/float';
import { audio } from '../audio/audio';
import { buildProduct } from '../places/products';
import { loadProp, PROP_META } from '../places/props';
import { fitTool } from '../player/arms';

const q = new URLSearchParams(location.search);
const W = window as unknown as { __ready?: boolean; __errors?: string[]; __pack?: PackUI; __game?: unknown; __step?: (n: number) => void };
W.__errors = [];
addEventListener('error', (e) => W.__errors!.push(String(e.message)));
if (q.get('shot') === '1') document.body.classList.add('shot');

async function iconSheet(): Promise<void> {
  const sheet = document.getElementById('sheet')!;
  sheet.style.display = 'block';
  const scale = Number(q.get('scale') ?? 3);
  for (const id of Object.keys(ITEMS)) {
    const d = document.createElement('div');
    d.className = 'cell';
    const c = itemIcon(id);
    c.style.width = c.style.height = `${48 * scale}px`;
    d.append(c, document.createTextNode(id));
    sheet.appendChild(d);
  }
  await allIconsReady();
  W.__ready = true;
}

const FILLS: Record<string, [string, number][]> = {
  starter: [['axe_old', 1], ['matches', 1], ['jerky', 3], ['beer', 2], ['flashlight', 1]],
  full: [['axe_old', 1], ['hatchet', 1], ['matches', 2], ['jerky', 4], ['beer', 2], ['flashlight', 1], ['batteries', 3], ['beans', 2], ['coffee', 1],
    ['pot', 1], ['rope', 1], ['knife', 1], ['gloves', 1], ['chanterelle', 3], ['firestarter', 2], ['file', 1], ['bread', 1]],
  heavy: [['axe_felling', 1], ['maul', 1], ['pan', 1], ['pot', 1], ['sleeping_bag', 1], ['beer', 3], ['fish', 1], ['first_aid', 1], ['chainsaw', 1]],
};

async function main(): Promise<void> {
  await loadFonts();
  if (q.get('icons') === '1') return iconSheet();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const R = new Renderer(canvas);
  R.pixel = Number(q.get('pixel') ?? 2);
  const night = q.get('night') === '1';
  // the world: a patch of forest floor under an overcast evening
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.06, 400);
  camera.position.set(0, 1.62, 0);
  camera.rotation.set(-0.35, 0, 0, 'YXZ');
  scene.add(camera);
  const sun = new THREE.DirectionalLight(night ? 0x8090c0 : 0xffd7a8, night ? 0.15 : 2.2);
  sun.position.set(30, 40, 20);
  scene.add(sun, new THREE.HemisphereLight(night ? 0x223044 : 0x9fb3c8, 0x3a2e22, night ? 0.25 : 1.0));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  const gm = ground.material as THREE.MeshStandardMaterial;
  const alb = loadTex('terrain/forest_floor_albedo.png', { repeat: true }); alb.repeat.set(30, 30); gm.map = alb;
  scene.add(ground);
  for (let i = 0; i < 40; i++) {
    const a = i * 2.4, r = 6 + (i % 7) * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 14, 7), new THREE.MeshStandardMaterial({ color: 0x3b3024, roughness: 1 }));
    trunk.position.set(Math.cos(a) * r, 7, -Math.abs(Math.sin(a) * r) - 4);
    scene.add(trunk);
  }
  R.fogColor.set(night ? 0x0b0e14 : 0x6f7480);
  // the viewmodel scene, lit like game.ts does it
  const view = new THREE.Scene();
  const viewCam = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
  view.add(new THREE.HemisphereLight(0xbfc8d8, 0x3a3026, 0.9));
  const key = new THREE.DirectionalLight(night ? 0x8899cc : 0xffd7a8, night ? 0.05 : 2.2 * 0.45);
  key.position.set(0.5, 1, 0.6);
  view.add(key);
  const resize = () => { R.resize(); const [w, h] = R.internalSize; camera.aspect = viewCam.aspect = w / h; camera.updateProjectionMatrix(); viewCam.updateProjectionMatrix(); };
  addEventListener('resize', resize);
  resize();
  floatText.mount(document.getElementById('ui')!, camera);

  // item models, the way Game.preloadItemModels + main.ts products do it
  const models = new Map<string, THREE.Object3D>();
  await Promise.all(Object.values(ITEMS).map(async (d) => {
    try {
      if (d.model.startsWith('gen:')) models.set(d.id, buildProduct(d.id));
      else if (d.model in PROP_META) models.set(d.id, await loadProp(d.model));
    } catch { /* missing */ }
  }));
  const toolModel = (id: string): THREE.Object3D | null => {
    const m = models.get(id);
    if (!m) return null;
    const c = m.clone();
    return ITEMS[id]?.tool || id === 'flashlight' ? fitTool(c) : id === 'beer' ? fitTool(c, 0.3) : c;
  };

  // the stand-in game
  const items = new Map<string, number>(FILLS[q.get('fill') ?? 'full'] ?? FILLS.full);
  const dropped: THREE.Object3D[] = [];
  const game: PackGame & { hands: { equip(id: string | null): void; heldItem: string; busy: boolean } } = {
    inv: { items },
    give(id: string, n = 1) { items.set(id, (items.get(id) ?? 0) + n); },
    take(id: string, n = 1) { const c = items.get(id) ?? 0; if (c < n) return false; items.set(id, c - n); return true; },
    setDown(id: string, at: THREE.Vector3) {
      if (!this.take(id)) return;
      const m = toolModel(id);
      if (m) { m.position.copy(at); scene.add(m); dropped.push(m); }
      audio.play('log_thud', { vol: 0.25, rate: 1.6 });
    },
    useItem(id: string) {
      const d = ITEMS[id];
      if (!d?.food) return false;
      this.take(id);
      audio.play(d.food.drink ? 'drink_gulp' : 'eat_chew', { vol: 0.6 });
      floatText.say(`${d.name}.`, { dur: 2 });
      return true;
    },
    hands: { heldItem: '', busy: false, equip(id: string | null) { this.heldItem = id ?? ''; audio.play('branch_swish', { vol: 0.4 }); } },
    player: { pos: new THREE.Vector3(0, 0, 0), burden: 0, yaw: 0 },
    camera, viewCam, updaters: [], toolModel, mode: 'walk',
  };
  const pack = new PackUI((id) => toolModel(id));
  pack.install(game);
  view.add(pack.object);
  W.__pack = pack; W.__game = game;
  (window as unknown as { __icon: typeof iconReady }).__icon = iconReady;

  input.attach(canvas);
  canvas.addEventListener('click', () => { audio.unlock(); });
  let last = performance.now();
  const step = (dt: number) => {
    for (const u of game.updaters!) u(dt);
    if (input.pressed('KeyI')) pack.toggle(game.inv.items);
    if (pack.open) pack.control(dt);
    pack.update(dt);
    floatText.update(dt);
    input.endFrame();
  };
  // once a script calls __step the clock is manual (screenshots of in-between frames)
  let manual = false;
  W.__step = (n: number) => { manual = true; pack.overlayTimeout = Infinity; for (let i = 0; i < n; i++) step(1 / 60); R.render(scene, camera, view, viewCam); };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!manual) step(dt);
    R.render(scene, camera, view, viewCam);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (q.get('open') === '1') pack.toggle(game.inv.items);
  await allIconsReady(Object.keys(ITEMS).filter((id) => items.has(id)));
  setTimeout(() => { W.__ready = true; }, 300);
}
main().catch((e) => { W.__errors!.push(String(e?.stack ?? e)); console.error(e); });
