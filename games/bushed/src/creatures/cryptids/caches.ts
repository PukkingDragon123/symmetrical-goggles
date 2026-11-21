// Ray's caches: old tobacco tins he hid round the bush, wired to a root or wedged by a stump, each with something
// in it (a recipe card for the cryptid kitchen, kit, a little money). You find them by walking past (E to open), or
// a tame wapaloosie spots them from a treetop and marks them (companions.ts). Opened tins stay open (flag cache:<id>).
//   const tins = placeCaches(game);   // after the cryptids are placed (their spots anchor some tins)
//   tins.list                          // [{ id, pos, label, opened }]
import * as THREE from 'three';
import type { Game } from '../../game/game';
import { SPOTS, heightAt } from '../../world/layout';
import { findSpot, cryptidSpots } from './index';
import { canvasTex } from '../../gfx/tex';
import { hud } from '../../ui/hud';

export interface CacheDef {
  id: string;
  /** a spot near which it hides */
  near: () => { x: number; z: number; r: number };
  items: [string, number][];
  money?: number;
  /** a recipe card inside (game.events 'recipe') */
  recipe?: string;
  note: string;
  /** what the scout calls it */
  label: string;
}

export const CACHE_DEFS: CacheDef[] = [
  {
    id: 'swamp', label: 'Ray\'s tin (swamp)', near: () => { const s = cryptidSpots().hodag; return { x: s.x + 14, z: s.z - 10, r: 16 }; },
    items: [['jerky', 2]], recipe: 'hodag_pie',
    note: 'A greasy card, folded small: "HODAG-HEART PIE. Makes a hodag roll over. Makes a hugag strong as a winch. — R."',
  },
  {
    id: 'deepwoods', label: 'Ray\'s tin (deep woods)', near: () => { const s = cryptidSpots().hidebehind; return { x: s.x - 20, z: s.z - 25, r: 22 }; },
    items: [['firestarter', 1], ['batteries', 1]], recipe: 'bannock_damned',
    note: 'A card scorched at one corner: "Burn one side black ON PURPOSE. The thing behind you will take it from your hand."',
  },
  {
    id: 'burn', label: 'Ray\'s tin (the burn)', near: () => ({ x: SPOTS.burn.x - 60, z: SPOTS.burn.z + 70, r: 40 }),
    items: [['nuts', 2], ['matches', 1]], money: 20,
    note: 'Two twists of hazelnuts and a twenty, rolled tight. "For the long dog in the spruces. It sees for miles."',
  },
  {
    id: 'lakeshore', label: 'Ray\'s tin (lake shore)', near: () => ({ x: SPOTS.lake.x + 30, z: SPOTS.lake.z + 112, r: 25 }),
    items: [['cheese', 1], ['first_aid', 1]],
    note: 'Old cheddar in wax and a note: "The billdad will fish for cheese. Do not ask me how I know."',
  },
  {
    id: 'meadow', label: 'Ray\'s tin (meadow)', near: () => { const s = cryptidSpots().roperite; return { x: s.x - 16, z: s.z + 18, r: 18 }; },
    items: [['carrots', 1], ['rope', 1]],
    note: 'Carrots, gone soft, and a coil of rope. "Stand still in the meadow. STILL. It gets bored."',
  },
  {
    id: 'hollow', label: 'Ray\'s tin (hollow)', near: () => ({ x: SPOTS.hollow.x - 90, z: SPOTS.hollow.z - 60, r: 30 }),
    items: [['wild_onion', 2], ['cookies', 1]], money: 10,
    note: 'Wild onions, dried, and cookies for Granny. "The big stiff-legged one by the cedars goes daft for onions."',
  },
];

export interface Cache { id: string; label: string; pos: THREE.Vector3; opened: boolean; obj: THREE.Object3D; def: CacheDef }

// ------------------------------------------------------------------------------------------------ the tin
let tinGeo: THREE.LatheGeometry | null = null, lidGeo: THREE.LatheGeometry | null = null, tinMat: THREE.MeshStandardMaterial | null = null;
function tinParts(): { geo: THREE.LatheGeometry; lid: THREE.LatheGeometry; mat: THREE.MeshStandardMaterial } {
  if (!tinGeo) {
    // a flat round tobacco tin: a rolled bottom edge, straight wall, the lid's lip a touch wider
    const P = (pts: [number, number][]) => pts.map(([r, y]) => new THREE.Vector2(r, y));
    tinGeo = new THREE.LatheGeometry(P([[0, 0], [0.052, 0.0], [0.058, 0.004], [0.06, 0.012], [0.06, 0.042]]), 14);
    lidGeo = new THREE.LatheGeometry(P([[0.063, 0.036], [0.064, 0.05], [0.06, 0.056], [0.03, 0.058], [0, 0.058]]), 14);
    const W = 64, H = 32, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const rust = n > 0.62 || (y > 22 && n > 0.35);
      const band = y > 10 && y < 20; // the faded red label band
      const o = (y * W + x) * 4;
      const c = rust ? [110 + n * 40, 58 + n * 20, 30] : band ? [128, 52, 40] : [92, 96, 84];
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    tinMat = new THREE.MeshStandardMaterial({ map: canvasTex(cv, { srgb: true, nearest: true, repeat: true }), roughness: 0.65, metalness: 0.55, side: THREE.DoubleSide });
  }
  return { geo: tinGeo, lid: lidGeo!, mat: tinMat! };
}

function tinObject(): THREE.Object3D {
  const { geo, lid, mat } = tinParts();
  const o = new THREE.Group(); o.name = 'cache_tin';
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(lid, mat);
  a.castShadow = b.castShadow = true;
  o.add(a, b);
  o.scale.setScalar(1.6);
  return o;
}

// ------------------------------------------------------------------------------------------------ placing
export function placeCaches(g: Game): { list: Cache[] } {
  const list: Cache[] = [];
  const flags = g.flags as Set<string>;
  for (const def of CACHE_DEFS) {
    const n = def.near();
    // tucked in by a big trunk if there is one, else just in the moss
    const p = findSpot(n.x, n.z, n.r, (x, z) => -Math.hypot(x - n.x, z - n.z) * 0.02 + ((g.forest as unknown as { trunkColliders?(x: number, z: number, r: number): unknown[] })?.trunkColliders?.(x, z, 2.2)?.length ? 1 : 0), 3);
    p.y = heightAt(p.x, p.z) + 0.01;
    const obj = tinObject();
    obj.position.copy(p);
    obj.rotation.set(0.18, (p.x * 7 + p.z * 3) % 6.28, 0.12);
    const c: Cache = { id: def.id, label: def.label, pos: p, opened: flags.has(`cache:${def.id}`), obj, def };
    if (!c.opened) g.scene.add(obj);
    list.push(c);
    import('../../game/interact').then(({ registerInteractable }) => registerInteractable(obj, {
      kind: 'pickup', reach: 2.4,
      label: () => (c.opened ? '' : 'Open the old tobacco tin'),
      enabled: () => !c.opened,
      use: () => openCache(g, c),
    }));
  }
  return { list };
}

export function openCache(g: Game, c: Cache): void {
  if (c.opened) return;
  c.opened = true;
  (g.flags as Set<string>).add(`cache:${c.id}`);
  const got: string[] = [];
  for (const [id, n] of c.def.items) { g.give(id, n); got.push(n > 1 ? `${n} ${id}` : id); }
  if (c.def.money) { g.inv.money += c.def.money; got.push(`$${c.def.money}`); }
  g.sound('paper_rustle', c.pos, 0.8);
  hud.say(`<i>${c.def.note}</i>`, 6);
  if (c.def.recipe) setTimeout(() => g.events.emit('recipe', { id: c.def.recipe, from: 'Ray\'s tin' }), 1500);
  c.obj.removeFromParent();
  g.events.emit('cache_opened', { id: c.id, items: got });
}
