# lowpix: make 3D models from a request

Code-first modeller, rigger, animator and converter (numpy + Pillow only, no Blender).
Everything you need is a CLI command (`python -m lowpix ...`) or an MCP tool (`.mcp.json` →
`lowpix_*`). Every build writes a `.glb` (plus `.obj`, `.bbmodel`) and a `_sheet.png` you
can look at.

## Pick the route (cheapest first)

| the user wants | do this |
|---|---|
| a realistic / real-world thing (animal, prop, furniture, statue) | **convert**: `python -m lowpix polyhaven <words>` → `python -m lowpix convert polyhaven:<id> --style <style> -o out/<name>` |
| a Sketchfab model (downloadable, CC) in this style | `python -m lowpix auth set sketchfab` (once) → `python -m lowpix sketchfab search <words>` → `python -m lowpix convert sketchfab:<uid> --style <style> -o out/<name>`; credit the author (`ATTRIBUTION.json`) |
| a model that must line up 1:1 with a photo | landmarks JSON (see `lowpix/match.py`) → `python -m lowpix match <spec> <landmarks> --image <photo> --project photo` |
| their own detailed model in this style | `python -m lowpix convert path/to/model.glb --style pixel -o out/<name>` |
| many models / a whole set | **batch**: `python -m lowpix batch <files, folders, globs, polyhaven?<query>> --style <style> -o out/<set>` → open `out/<set>/contact.png` |
| an original stylised character or creature, rigged and animated | **spec**: `python -m lowpix new <template> "<Name>"` → edit `examples/<name>.json` → `python -m lowpix build examples/<name>.json -o out/<name>` → look → iterate |
| 2D sprites / item icons (swords, gems, ores, fish, potions) | `python -m lowpix sprite <generator> --count 12 --scale 4` (`--param species=koi`, `--paint painted`) → edit the `.json` it writes → `python -m lowpix sprite my.json`. See docs/SPRITES.md |
| a texture from a real photo (realistic, painted or pixel) | `python -m lowpix photo search <words>` → `python -m lowpix photo polyhaven:<id> --style pixel-hd --size 64`. In models: paint op `{"op": "photo", ...}` (docs/PHOTOBASH.md) |
| a detailed blocky (Minecraft-style) monster | copy `examples/thornhide_behemoth.json`: boxes and tapers, `density` 4, a `brush` block, `scales`/`drip`/`cracks`/`photo` layers |
| animations on a spec | add `animations` (docs/SPEC.md "Rigging and animation") → `python -m lowpix animate <spec> --anim <clip> -o strip.png` |

Styles (`--style`): `pixel` (chunky pixel art, unlit, the house style), `pixel-hd`
(high-resolution pixel art), `painted` (smooth hand-painted, unlit, linear filtering) and
`realistic` (high-res source texture, lit PBR material, smooth normals: a game-ready LOD).
For more detail use `--tris`, and `--atlas 2048` on the HD styles.

Templates for `new`: `creature` (chain-loft body, walk), `quadruped`, `bird` (wings, fly),
`robot` (hard surface), `figure` (gacha figure on a plinth), `critter`, `prop`.

## Always
* **Look at the image** (`*_sheet.png`, or `animate` filmstrips) after every build before you
  claim it's good. Fix every `warnings` entry in the report.
* Never paste API tokens into chat or files; use `python -m lowpix auth set <service>`.
* Don't copy another artist's model or sprite. Poly Haven assets are CC0 and fine to convert or photo-bash.
* Organic shapes are curves: never ship a bare circle, box or straight polygon as a body. Paint with `brush` strokes.
  Don't make trademarked characters.
* Convert/batch outputs go to `out/` (gitignored). Only commit curated results.

## Repo map
* `lowpix/`: `geometry` (shapes, lofts, chains, attach), `painter` (texel painting), `brush` (stroke engine),
  `sprite` + `sprite_gen` (2D), `photo` (photo-bashing), `anim`
  (rigid-bone clips), `model` (build pipeline, report and lint), `render` (software rasteriser,
  filmstrips, GIFs), `export` (glb/obj/bbmodel), `convert` (detailed model → style), `batch`
  (parallel mass production, gallery, templates), `cli`, `mcp_server`.
* Docs: `docs/SPEC.md` (spec + animation reference), `docs/STYLE_GUIDE.md` (art and animation rules),
  `docs/AGENT_WORKFLOW.md`, `docs/CONVERT.md`, `docs/BATCH.md`, `docs/SPRITES.md`, `docs/PHOTOBASH.md`. Skill: `.claude/skills/lowpix-modeling/`.
* Tests: `python -m unittest discover -s tests -v` (every example must build with zero warnings
  and a strictly in-palette atlas).
* After changing an example spec, regenerate its committed outputs:
  `python -m lowpix build examples/<name>.json -o examples/output --gif`.
* Conventions: Y up, model faces +Z, ground at y=0. Mirroring never flips painted images.
  Pattern seeds key on layer `id`.
