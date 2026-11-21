# Low-poly cryptids: how to rebuild a monster

BUSHED's monsters are realistic, but they're kept deliberately low-poly. Each is built from real CC-BY or CC0 models:
kitbashed and reshaped in Blender, decimated to a clean faceted silhouette, with the high-poly detail baked into one
texture. The game shows that texture with nearest filtering, so it reads as finely painted pixel art up close.
Eyes stay small dark beads.

Two pilots are done:

| creature | route | source | tris | atlas | build |
|---|---|---|---|---|---|
| splinter cat | mixer (`cryptids/real.ts`): the glb carries the clips | lynx (Paleo Modelist, CC-BY) | 2.36k (body 2.2k + beads) | 1024 | 16 s |
| hodag | procedural (`cryptids/base.ts`): the glb carries only a skin; `hodag.ts`'s clips animate it | Baurusuchus (Anees Animates, CC-BY) + Poly Haven bull's horns (CC0) + parts made in Blender | 3.64k (body 3k) | 1024 | 57 s |

Four more, the cryptids you can put to work (round 6), share `newfour.py` (load a source, find eyes, made parts on a
tube, the low-poly half in one call, `fix_groups`):

| creature | source | made parts | tris | atlas |
|---|---|---|---|---|
| roperite | WildMesh donkey (CC-BY, fetched) | tail with a tuft and an upright mane, rigged to the donkey's own bones; the rope is live in TS (`rope.ts`) | 3.2k | 1024 |
| hugag | the game's moose cow (`creatures/moose/cow.glb`) | none: lip pulled long, ears enlarged, legs thickened in numpy | 3.4k | 1024 |
| billdad | the game's hare (`creatures/hare/hare.glb`) | hooked bill (head), flat scaly paddle tail (rigid on `tail0`) | 2.1k | 1024 |
| wapaloosie | the game's squirrel (`creatures/squirrel/squirrel.glb`) | none: the front half moved forward on the rig, legs thickened | 2.3k | 1024 |

Their test stage is `stage/index.html?who=<id>` (window.__stage: shot, sim with scripted jobs, follow, render) and the
recipe cards are on `stage/cards.html`.

`build.sh [downloads dir] [dev-server port]` fetches the sources, rebuilds both and, given a port, shoots the
contact sheets. Each `<id>.py` writes its glb straight into `public/assets/models/creatures/cryptids/`, and its
textures and stats into `_build/` (gitignored).

## The kit (`lowkit.py`, on top of `../cryptids4/common.py` and `kit.py`)

```python
low = L.lowpoly([hi], 2200, 'name', protect=(['spine_006'], 0.75))  # decimated, skinned copy; head spared
L.unwrap(low, boost={'spine_006': 2.5})          # fresh UVs; the head gets 2.5x the texel density
M = L.bake_maps(low, [hi, beads], 1024, pose=(idle_action, 0))
col = L.finish(M, paint=my_paint)                # base x AO x cavity, plus your painted detail
mat = L.save_material('name', col, M['shine'])   # name_col.png + name_sd.png (R eye shine, G roughness)
L.apply_material(low, mat); C.export(armature, low, out_glb, actions)
```

`M` holds per-texel numpy maps:
* `base`: the high's colour (linear).
* `ao`: ambient occlusion.
* `cav`: Cycles pointiness (0.5 is flat).
* `shine`: the bead eyes.
* `part`: an index into `M['parts']`, the high's material names. Use it to paint made parts by part.
* `valid`: the texels the low covers.
* `pos` and `nrm`: the position and smooth normal in game space (metres; x left, y up, z forward).

Paint in numpy from these. Take landmarks from the maps themselves: the eyes are `pos[shine > 0.5]`, and the tail
tip is the lowest `valid` texel behind the rump. Use `L.fbm` and `L.smooth` for mottling, bands, scars, mud, ear tips
and lip lines.

## Route A: a mixer cryptid (gouger, hoop snake, goofus bird)

These already run on `RealCryptid` with a rigged glb from `../cryptids4/<id>.py`.

1. Copy `splintercat.py`. Paste the source-loading half of `../cryptids4/<id>.py` (load, bead eyes, `C.rebake` with
   its clips), then the low-poly half from here.
2. Keep every clip name and every bone name that the TS file's `pose()` uses (`grep bones\. <id>.ts`). Then nothing
   in TS changes.
3. Bake the maps at a standing pose: `pose=(acts[0], 0)`. The rebaked rest pose is the source's bind pose.
4. A glb with an animated root sits far from the origin at rest. That's fine: `bake_maps` handles it.

## Route B: a procedural cryptid (squonk, hidebehind, agropelter, teakettler, snow wasset)

These run on `Cryptid` (`base.ts`), with IK legs, procedural clips and pose channels. Keep all of that and swap only
the mesh, the way `hodag.py` does:

1. Read the bone list from the cryptid's current `<id>/model.ts` (`<id>Bones()`). Take its names, parents and rough
   positions, and note which bones the clips and `pre()` touch (sacs, tongues, ears, lids).
2. Source the parts. Find animals on Sketchfab through the API: `curl
   'https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=<words>'`, then `.../v3/models/<uid>/download`
   for the glb URL. The proxy authenticates. Take CC-BY or CC0 only. Use Poly Haven too
   (`lowpix.convert.polyhaven_fetch`).
3. In Blender:
   * Make one static mesh in game space (Blender: -Y forward, +Z up, ground at 0).
   * Build an armature with exactly the cryptid's bone names, placed on the source's joints, with parents as the
     procedural rig wants them.
   * Map the source vertex groups onto it.
   * Weight made parts rigidly to one bone.
   * Export the armature and mesh with no clips.
4. In TS:
   * Rewrite `<id>/model.ts` as `export const X_LOADER = glbCryptidLoader('<id>', BONES)` (`../glbmodel.ts`).
   * In the class, set `const m = X_LOADER.get(); super(m, xClips(m.bones), {...})`.
   * Drop `fur` and the lid code, or rewrite them for the new mesh.
   * The loader registers with `preloadCreatures()`.
5. Any page that builds the creature before preloading must `await X_LOADER.load()` first. One page does this today:
   the Book's `src/ui/bookofcryptids/sources.ts` (see "Known gaps").

## Gotchas (each cost a rebuild)

* **Bake colour, AO and cavity at the rest pose; take `pos` and `nrm` at a standing pose.** The low's interpolated
  weights differ from the high's, so in a far pose the surfaces drift apart and the bake misses: black streaks
  appear.
* **Weld seams (about 2.5 mm) and recalculate the normals (`L.outward`) before subdividing.** Otherwise subdivision
  opens cracks, or flipped faces bake and shade black.
* **Protect strength is 0 to 0.95.** At 1.0 the protected part can't collapse at all, and the triangle target can
  never be reached.
* **Bakes are linear.** `save_material` writes sRGB, so paint in linear or convert with `L.to_srgb` and
  `L.to_linear`.
* **Leave a gap between touching surfaces.** A mouth closed fully, for example, welds lip to lip and the decimator
  tears the head apart. Leave it a little open: it reads as a grin.
* **Keep the beads separate.** Build them small (8x6 segments) and smooth, and join them after decimating.
* **Budgets:** about 3 to 4k triangles for a big creature, about 2.2k for a lynx, about 1k for a small one. Use a
  1024 atlas, with the head boosted 2 to 2.5x.
* **A source whose vertex groups already carry the new bone names** (the game's own animals): the copied mesh keeps
  them and `C.rebake` adds its own as `X.001`. Run `newfour.fix_groups` after the rebake, and again on the low after
  `L.lowpoly`: its `protect` group is not a bone, and left on it takes one of the four weight slots (paws come loose).
  (`hodag.py` and `splintercat.py` still export with that group on.)
* **Credit every source** in `CREDITS.md` (the cryptid table and the attribution lines) and in
  `public/assets/models/creatures/cryptids/ATTRIBUTION.json`.

## Checks

* `node sheet.cjs <id> <port> _build/sheets` then `python3 sheet.py <id> _build/sheets` makes the contact sheet. It
  shows day and night (front, 3/4, side and head), a walk frame and every clip. Add the creature to the `V` table in
  `sheet.cjs`: procedural cryptids use `creatures.html`, mixer ones the `../cryptids4/preview` stage.
* `node ingame.cjs <port> _build/sheets <id>...` checks the creature in the real game (`/?play`), by day and at
  night, and reports console errors.

## Effort (from the pilots)

* **Route A** (the source and rig already exist): about 30 to 45 minutes of agent time. Most of it goes on one or
  two paint passes and a look at the sheet.
* **Route B** (a new kitbash plus a rig mapping): about 2 to 3 hours. That covers sourcing, joint mapping, reshaping,
  made parts (plates, sacs) and two or three bake and look loops.
* Each build takes 15 to 60 s. A contact sheet takes about 3 minutes on software GL.
