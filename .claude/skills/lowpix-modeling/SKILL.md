---
name: lowpix-modeling
description: Model, rig and animate low-poly 3D assets with hand-painted pixel-art textures using lowpix (JSON specs -> animated glb/obj/bbmodel + previews), and make 2D pixel-art or painted sprites (swords, gems, ores, fish, potions) and photo-bashed textures. Use when asked to make, edit, recolour, rig, animate or critique a low-poly / pixel-art / Blockbench / Minecraft-style model, creature, prop, character, gacha figure, item icon, sprite sheet or stylised texture.
---

# Modeling with lowpix

1. Read `docs/STYLE_GUIDE.md` (genre rules + critique checklist) and skim `docs/SPEC.md`.
   With the MCP server available, `lowpix_guide` returns both.
   **Realistic shape wanted (an animal, a prop)?** Convert instead of hand-building. It's far cheaper:
   `python -m lowpix polyhaven <words>` then `python -m lowpix convert polyhaven:<id> --style <pixel|pixel-hd|painted|realistic> -o out/<name>`
   (MCP: `lowpix_polyhaven_search` → `lowpix_convert`). See `docs/CONVERT.md`.
   **Many models?** `python -m lowpix batch <sources> --style <style> -o out/<set>` and review `contact.png`
   (MCP: `lowpix_batch`). See `docs/BATCH.md`.
   **2D icons or sprites?** `python -m lowpix sprite <sword|gem|ore|fish|potion> --count 12 --scale 4`
   (MCP: `lowpix_sprite`). See `docs/SPRITES.md`. **A texture from a photo?** `python -m lowpix photo ...`
   (MCP: `lowpix_photo`). See `docs/PHOTOBASH.md`. **A detailed blocky monster?** Start from `examples/thornhide_behemoth.json`.
   **New original character?** `python -m lowpix new <creature|quadruped|bird|robot|figure|critter|prop> "<Name>"`.
2. Start from the closest example in `examples/` (`salamander.json` for creatures,
   `glowcap.json` for props) and copy it to a new spec file.
3. Iterate: edit the spec → `lowpix_build` (MCP) or `python -m lowpix build <spec> -o out/<name>`
   → **open the `_sheet.png` and look at it** → fix the report's warnings first, then the worst
   art problem from the checklist → repeat. Use `lowpix_render part=<id>` (or
   `python -m lowpix render <spec> -o x.png --part <id>`) for pixel-level close-ups of eyes and faces.
4. Keep budgets: about 100 to 400 triangles for props and 800 to 1600 for hero creatures, 20 to 56 colours, every face at least 2px. Feet use
   `snap_ground`, legs use `orient: "world"`, and buried faces are `hide`-den.
5. Rig and animate: pivots at joints, `"chain": true` lofts for tails, necks and spines, then
   `animations` clips (idle plus a signature action). Check every clip with
   `python -m lowpix animate <spec> --anim <clip> -o strip.png` (MCP: `lowpix_animate`) and apply the
   animation section of the style guide (overlap via `wave` lag, ease and holds, anticipation,
   squash and stretch, seamless loops).
6. Finish with `--gif`, run `python -m unittest discover -s tests`, and report the triangle and
   colour counts, the clips and the output paths.

Never copy another artist's model or texture, and never feed assets tagged `noai` into tools.
Study the genre and make original designs.
