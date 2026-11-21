# BUSHED: architecture and contracts

First-person lumberjack survival among the fearsome critters of the Canadian bush. Vite + TypeScript +
three.js 0.187 + Rapier (`@dimforge/rapier3d-compat`). No other runtime dependencies.

```bash
cd games/bushed && npm install && npm run dev      # http://localhost:5173
npx tsc --noEmit -p .                              # typecheck
```

## Conventions (everyone)

* Units are metres and seconds. **Y up, +X east, +Z south.** Models face **+Z**. Ground at the model's y = 0.
* World layout (terrain height, roads, clearings, biomes, named spots) lives in `src/world/layout.ts`. Never hard-code
  terrain heights: call `heightAt(x, z)`.
* Shared shader uniforms (time, wind, gusts, vegetation pushers, wetness, snow, camera position) live in
  `src/gfx/globals.ts` (`G`). Patch materials with `onBeforeCompile` and reference `G.*` objects directly.
  The main loop updates them once per frame.
* Materials: use `MeshStandardMaterial` (or `MeshLambertMaterial` for masses of foliage) with `onBeforeCompile`
  patches, never raw `ShaderMaterial` for world objects, so the sun, fire, flashlight, shadows and fog all apply.
  Alpha-cut foliage uses `alphaTest` (0.5) and `side: DoubleSide`, never alpha blending.
* Textures: **high-resolution pixel art**. `src/gfx/tex.ts` (`applyPixelTex`, `loadTex`, `canvasTex`): nearest
  magnification, mipmapped minification, sRGB colour maps. Target texel densities: props and hands 256 px/m,
  characters and creatures 200-256 px/m, bark 128-192 px/m, terrain 128 px/m. Rich, photo-based colour, painted
  detail (wrinkles, stitching, knots, scratches), no flat colours, no baked directional light in colour maps (the
  game lights everything dynamically; baked ambient occlusion and cavity darkening are good).
* The look: Chilla's Art style but more detailed. Low-poly-but-realistic proportions, crisp pixel textures, the
  renderer draws at a reduced internal resolution, then grades, dithers and adds grain (`src/gfx/renderer.ts`).
  Do not add your own post-processing.
* Determinism: procedural content seeds from `src/core/rng.ts` (`Rng`, `hashStr`). Noise: `src/core/noise.ts`.
* Never ship a bare primitive (box, sphere, cylinder) as visible content. Organic forms are lofted curves.
* Assets: `public/assets/{models,textures,sfx,hdri}`, loaded with URLs like `assets/models/x.glb`.
  Every third-party file is credited in `CREDITS.md` (source URL, author, licence). CC0 / public domain preferred,
  CC-BY allowed with attribution. No NC or ND licences.
* Test pages: each module has a standalone page in the project root (`trees.html`, `humans.html`, `creatures.html`,
  `audio.html`, `props.html`) with its own entry in `src/dev/`. Screenshot them with Playwright
  (`require('playwright')`, `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`)
  and look at the images.

## Module map

| dir | owns |
|---|---|
| `src/core` | rng, noise, input, events |
| `src/gfx` | renderer + post (`renderer.ts`), sky/sun/time of day (`sky.ts`), globals, texture conventions, particles |
| `src/world` | `layout.ts` (map), terrain, `forest.ts` (tree placement, instancing, LOD), `groundcover.ts`, water, footprints |
| `src/trees` | species data, tree generator, bark / needle / leaf textures, end grain (growth rings) |
| `src/physics` | Rapier world wrapper, collision groups |
| `src/player` | first-person controller, `arms.ts` (viewmodel hands), `hands.ts` (interaction, Q drop / E pick up) |
| `src/chop` | cut model (notches, kerfs), felling, limbing, bucking, splitting, wood pieces |
| `src/humans` | human builder ported from Limbophobia, outfits, NPC models and animation |
| `src/creatures` | creature anatomy (ported from Oddworld), Axehandle Hound, Bigfoot, ... and their AI |
| `src/vehicles` | the logging truck (`truck.ts`; `jeep.ts` re-exports it as `Jeep`): physics, sound, cargo and winch, crash damage and repair, autopilot and camera mounts, ported from หลอนยันปลายทาง; `installTruck` drives the per-frame side; `truckstock.ts` puts its parts on sale at Pruneau's |
| `src/places` | cabin, general store, campsites (buildings + dressing) |
| `src/game` | `game.ts` (loop, time, weather, survival feedback, vehicles, places, saves), `flow.ts` (porch menu, intro), `director.ts`, `cabinplay.ts` (stove, woodbox, woodshed, block, cooking, sleep), `storeplay.ts` (register, receipts, log scale, contracts board, world jobs), `critters.ts` (creature ctx, events, intro hound beat), `npcs.ts`, `physprops.ts`, `zones.ts`, `survival.ts`, `economy.ts`, `contracts.ts`, `dialogue.ts`, `story.ts`, `items.ts`, `save.ts` |
| `src/audio` | Web Audio engine (spatial, occlusion, reverb zones, ambience) and the sound bank |
| `src/ui` | the few physical UI pieces (journal, papers, money, prompts), `inventory/` (5-slot hotbar `slots.ts` + `hotbar.ts`, stash crate), `objective.ts` (top-left objective HUD) |
| `src/boot` | boot timing, weighted loading progress, the deferred `later` queue, light budget, shader precompile |
| `src/game/cinematic` | the shot runner, letterbox/subtitle overlay, scripted driving and the opening (`opening.ts`) |
| `src/game/talk` | dialogue face close-ups, typed subtitles, cryptid face beats |
| `src/audio/voice`, `src/audio/music` | formant gibberish voices (`voice.say`) and the Kettle Lake Waltz, both rendered in workers |

## Contracts between modules

### Trees (`src/trees`, `src/world/forest.ts`, `src/world/groundcover.ts`)

```ts
type SpeciesId = 'spruce' | 'fir' | 'pine' | 'birch' | 'cedar';
SPECIES[id]: { name, density /* kg/m3 green */, hardness /* 0..1 */, splitEase /* 0..1 */, value /* $ per m3 */,
               barkThickness /* m */, heartwood: [r,g,b], sapwood: [r,g,b], ringSpacing /* m */, ... }

buildTree(species, seed, { age /* 0..1 */ }): TreeModel
TreeModel {
  species, seed, height, dbh, mass, crownMass, crownCenter: THREE.Vector3,
  lean: THREE.Vector2,                       // xz lean (m of top offset per m of height)
  trunk: { y: number; r: number; x: number; z: number }[],   // centreline + radius samples, base to tip
  radiusAt(y): number, centerAt(y): [x, z],
  branches: { id, base: Vector3, dir: Vector3, len, r, mass }[],
  object(): THREE.Object3D                   // full-detail standalone mesh (bark + branches + foliage), origin at trunk base
}
Forest (src/world/forest.ts) {
  constructor(scene, camera); update(dt);
  near(x, z, r): TreeRef[]                   // TreeRef { id, species, x, y, z, rotY, scale, model(): TreeModel }
  raycastTrunk(origin, dir, maxDist): { ref, point, normal, h /* height on trunk */ } | null
  detach(id): { object: THREE.Object3D, model: TreeModel }   // hides the instance, returns a unique copy
  remove(id)                                 // permanently gone (felled); stump handled by src/chop
  trunkColliders(x, z, r): { id, x, z, r, h }[]
}
```

### Humans and arms

```ts
buildHuman(look: HumanLook): HumanModel     // { root, mesh: SkinnedMesh, bones, anim: HumanAnimator }
FPArms (src/player/arms.ts) {
  object: THREE.Object3D                     // goes into the viewmodel scene (own camera, drawn over the world)
  setHeld(kind: 'none'|'axe'|'hatchet'|'maul'|'saw'|'bottle'|'jerky'|'flashlight'|'item'|'log'|'two_hand', obj?)
  play(action: 'swing'|'chop_recover'|'drink'|'offer'|'grab'|'drop'|'split'|'push', opts?)
  update(dt, s: { speed, sprint, crouch, breath, shiver, aimPitch, swingCharge })
  socket(hand: 'L'|'R'): THREE.Object3D
  onEvent(cb)                                // 'impact' at the strike frame, 'drink_end', ...
}
```

### Creatures

```ts
interface CreatureCtx {
  dt: number; time: number; hour: number;
  player: { pos: Vector3; dir: Vector3; held: string; crouch: boolean; noise: number; light: boolean };
  heightAt(x, z): number;
  emit(ev: string, data?: unknown): void;   // 'growl', 'bark', 'befriended', ...
}
class AxehandleHound { object; update(ctx); offer(item: string): boolean; state: string; trust: number }
```

### Audio

```ts
audio.play(id, { pos?, vol?, rate?, loop? }): Voice | null;   // pos = spatial
audio.ambience(name, weight);                                  // 'forest_day', 'forest_night', 'cabin', 'rain', 'wind'
audio.setListener(camera); audio.setReverb('outdoor' | 'cabin' | 'store');
```

## Boot and play

`src/main.ts` builds the first view (terrain, forest, cabin, truck, item models, arms) behind the pixel-art loading
screen (`index.html`, drawn in a worker), then everything else through `later.add(...)` one task per frame after the
player has control; the story-critical tasks (`storyReady`) are awaited before the porch menu hands over to the intro
(`flow.runIntro`) or a saved game. Places call back into the game through `game.placeAction(name, ctx)`; creatures
get a `CreatureCtx` built by `critters.ts` every frame and report through `ctx.emit`.

Headless testing: `npx vite --config vite.test.config.ts` (port 5190, no HMR so other edits don't reload the page),
then Playwright scripts against `?play`, `?intro`, `?test`, `chop.html`. SwiftShader is slow: step the simulation
with `game.update(1/60)` in `page.evaluate` rather than waiting on frames.
