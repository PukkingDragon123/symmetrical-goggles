// SIX LUMBER-CAMP CRYPTIDS (after Cox 1910 "Fearsome Creatures of the Lumberwoods" and Tryon 1939 "Fearsome
// Critters"), each with a home on the map, learnable rules and a favourite food:
//   Hodag       the alder swamp south-east of the cabin   bacon
//   Squonk      the dark wet fir stand north of the hollow wild blueberries ('berries')
//   Hidebehind  the deep woods past the hollow, at night   stolen jerky (never from your hand)
//   Agropelter  a hollow snag beside the hollow path       maple syrup left at its tree
//   Teakettler  the woods behind the lake campsite         coffee
//   Snow Wasset the north shore of the lake                lake trout ('fish')
// and four more on real models (real.ts; tools/blender/cryptids4 builds them):
//   Sidehill Gouger  round a steep knoll by the lake (one way only)      chanterelles
//   Hoop Snake       the top of the steep bank south of the lake           eggs
//   Splinter Cat     the old timber west of the hollow                     maple syrup (left by a tree or a log)
//   Goofus Bird      a big pine by the cabin road (it nests upside down)   bannock ('bread')
//
//   await preloadCreatures();                       // builds or loads every model (registered by each module)
//   const cryptids = spawnNewCryptids(scene);       // NewCryptid[]: placed at their homes, added to the scene
//   for (const c of cryptids) c.update(ctx);         // every frame (CreatureCtx)
//   c.offer(item)                                    // the player holds an item out: true when it takes it
//   c.name, c.favoriteFood, c.rules                  // for the journal / Book of Cryptids
// Events go through ctx.emit(ev, { pos, who: c.id, sound, ... }) like the other creatures; `sound` is a bank id.
import * as THREE from 'three';
import { SPOTS, WORLD, biome, heightAt, clearance, roadInfo, normalAt } from '../../world/layout';
import type { NewCryptid } from './base';
import { Hodag } from './hodag';
import { Squonk } from './squonk';
import { Hidebehind } from './hidebehind';
import { Agropelter } from './agropelter';
import { Teakettler } from './teakettler';
import { SnowWasset } from './wasset';
import { SidehillGouger } from './gouger';
import { HoopSnake } from './hoopsnake';
import { SplinterCat } from './splintercat';
import { GoofusBird } from './goofus';

export { Cryptid, CH, daylight, type NewCryptid } from './base';
export { Hodag, hodagModel, hodagModelAsync, HODAG_SOUND, type HodagState } from './hodag';
export { Squonk, squonkModel, squonkModelAsync, SQUONK_SOUND, type SquonkState } from './squonk';
export { Hidebehind, hidebehindModel, hidebehindModelAsync, HIDEBEHIND_SOUND, type HidebehindState } from './hidebehind';
export { Agropelter, agropelterModel, agropelterModelAsync, snagModelAsync, AGROPELTER_SOUND, type AgropelterState } from './agropelter';
export { Teakettler, teakettlerModel, teakettlerModelAsync, TEAKETTLER_SOUND, type TeakettlerState } from './teakettler';
export { SnowWasset, wassetModel, wassetModelAsync, WASSET_SOUND, type WassetState } from './wasset';
export { RealCryptid, loadReal, realModel } from './real';
export { SidehillGouger, GOUGER_SOUND, type GougerState } from './gouger';
export { HoopSnake, HOOPSNAKE_SOUND, type HoopState } from './hoopsnake';
export { SplinterCat, SPLINTERCAT_SOUND, type SplinterState } from './splintercat';
export { GoofusBird, GOOFUS_SOUND, type GoofusState } from './goofus';

export type CryptidId = 'hodag' | 'squonk' | 'hidebehind' | 'agropelter' | 'teakettler' | 'wasset' | 'gouger' | 'hoopsnake' | 'splintercat' | 'goofus';

/** the best point in a disc by a score over the layout (deterministic grid search; never water, roads or clearings) */
export function findSpot(cx: number, cz: number, r: number, score: (x: number, z: number) => number, step = 6): THREE.Vector3 {
  let best = -Infinity, bx = cx, bz = cz;
  for (let x = cx - r; x <= cx + r; x += step) for (let z = cz - r; z <= cz + r; z += step) {
    if (Math.hypot(x - cx, z - cz) > r) continue;
    if (heightAt(x, z) < WORLD.waterY + 0.4 || clearance(x, z) < 0.6) continue;
    const s = score(x, z);
    if (s > best) { best = s; bx = x; bz = z; }
  }
  return new THREE.Vector3(bx, heightAt(bx, bz), bz);
}
const far = (x: number, z: number, p: { x: number; z: number }, d: number) => Math.min(1, Math.hypot(x - p.x, z - p.z) / d);
const lakeEdge = (x: number, z: number) => { const L = SPOTS.lake; return Math.hypot(x - L.x, z - L.z) / L.r; };
/** a knoll: how steep the ground stays all the way round a ring of radius r about (x, z), and how high it stands */
function knollScore(x: number, z: number, r: number): number {
  let minS = 9, mean = 0;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    minS = Math.min(minS, 1 - normalAt(px, pz, 1.5)[1]); mean += heightAt(px, pz) / 12;
    if (heightAt(px, pz) < WORLD.waterY + 0.5) return -9;
  }
  return minS * 10 + Math.min(2, heightAt(x, z) - mean) * 0.5;
}

/** where each cryptid lives (computed once from the layout) */
let spots: Record<CryptidId, THREE.Vector3> | null = null;
export function cryptidSpots(): Record<CryptidId, THREE.Vector3> {
  if (spots) return spots;
  spots = {
    // a wet, low wallow between the cabin and the lake, away from the trail
    hodag: findSpot(110, 70, 60, (x, z) => { const b = biome(x, z); return b.wet * 2 - (heightAt(x, z) - WORLD.waterY) * 0.05 + far(x, z, SPOTS.cabin, 90) + Math.min(1, roadInfo(x, z).d / 25); }),
    // dense, wet, dark fir and cedar on the north side of the hollow (Cox: the hemlock forests)
    squonk: findSpot(-30, 300, 70, (x, z) => { const b = biome(x, z); return b.density + b.wet + 0.3 * (b.fir + b.cedar) - b.birch * 0.5 + Math.min(1, roadInfo(x, z).d / 20); }),
    // the deep woods past the hollow: old growth, no roads, a long way from the cabin
    hidebehind: findSpot(170, 540, 80, (x, z) => { const b = biome(x, z); return b.old * 1.5 + b.density + Math.min(1, roadInfo(x, z).d / 40) + far(x, z, SPOTS.cabin, 400); }),
    // a snag a few metres off the hollow path, where people walk under it
    agropelter: findSpot(26, 165, 18, (x, z) => { const d = roadInfo(x, z).d; return -Math.abs(d - 7) + biome(x, z).density; }, 3),
    // in the woods behind the campers' site (it comes for the smell of their coffee)
    teakettler: findSpot(SPOTS.campsite.x + 20, SPOTS.campsite.z + 14, 16, (x, z) => -Math.abs(Math.hypot(x - SPOTS.campsite.x, z - SPOTS.campsite.z) - 22) + biome(x, z).density, 3),
    // the north shore of the lake: dry ground right at the water's edge
    wasset: findSpot(SPOTS.lake.x, SPOTS.lake.z - 110, 60, (x, z) => -Math.abs(lakeEdge(x, z) - 1.12) * 4 + biome(x, z).density * 0.3, 4),
    // the top of a steep knoll west of the lake: a ring 10 m out from it steep all the way round (its track)
    gouger: findSpot(132, 12, 24, (x, z) => knollScore(x, z, 10), 2),
    // the top of the steep bank south of the lake, with a long run down below it
    hoopsnake: findSpot(214, 28, 30, (x, z) => { const [, ny] = normalAt(x, z, 6); return (1 - ny) * 6 + heightAt(x, z) * 0.08 - (Math.hypot(x - 132, z - 12) < 40 ? 3 : 0); }, 3),
    // old timber west of the hollow, no roads (it smashes trees: keep it off the paths)
    splintercat: findSpot(-150, 250, 80, (x, z) => { const b = biome(x, z); return b.density * 1.5 + b.old + Math.min(1, roadInfo(x, z).d / 40) + far(x, z, SPOTS.cabin, 200); }, 6),
    // a big pine a little way off the cabin road, where you walk past it
    goofus: findSpot(-100, -100, 30, (x, z) => -Math.abs(roadInfo(x, z).d - 14) * 0.3 + biome(x, z).density + biome(x, z).pine * 0.5, 3),
  };
  return spots;
}

type Ctor = new (o: { pos?: THREE.Vector3; heading?: number }) => NewCryptid;
const CTORS: Partial<Record<CryptidId, Ctor>> = {
  hodag: Hodag, squonk: Squonk, hidebehind: Hidebehind, agropelter: Agropelter, teakettler: Teakettler, wasset: SnowWasset,
  gouger: SidehillGouger, hoopsnake: HoopSnake, splintercat: SplinterCat, goofus: GoofusBird,
};
/** register a cryptid class (each module does this for itself) */
export function registerCryptid(id: CryptidId, c: Ctor) { CTORS[id] = c; }

/** the heading from a point toward the nearest road or path (the agropelter's hollow faces the people it pelts) */
function towardRoad(p: THREE.Vector3): number {
  let best = 0, bd = Infinity;
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, d = roadInfo(p.x + Math.sin(a) * 4, p.z + Math.cos(a) * 4).d; if (d < bd) { bd = d; best = a; } }
  return best;
}
/** make every cryptid at its home and add it to the scene (preload the models first, or this builds them now) */
export function spawnNewCryptids(scene: THREE.Object3D, o: { only?: CryptidId[] } = {}): NewCryptid[] {
  const S = cryptidSpots(), out: NewCryptid[] = [];
  for (const id of Object.keys(S) as CryptidId[]) {
    if (o.only && !o.only.includes(id)) continue;
    const C = CTORS[id]; if (!C) continue;
    const c = new C({ pos: S[id].clone(), heading: id === 'agropelter' ? towardRoad(S[id]) : (id.length * 1.7) % (Math.PI * 2) });
    scene.add(c.object); out.push(c);
  }
  return out;
}
