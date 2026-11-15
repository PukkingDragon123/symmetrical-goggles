---
name: lowpix-modeling
description: Model low-poly 3D assets with hand-painted pixel-art textures using lowpix (JSON specs -> glb/obj/bbmodel + previews). Use when asked to make, edit, recolour or critique a low-poly / pixel-art / Blockbench-style model, creature, prop or character.
---

# Modeling with lowpix

1. Read `docs/STYLE_GUIDE.md` (genre rules + critique checklist) and skim `docs/SPEC.md`.
   With the MCP server available, `lowpix_guide` returns both.
2. Start from the closest example in `examples/` (`salamander.json` for creatures,
   `glowcap.json` for props) and copy it to a new spec file.
3. Iterate: edit the spec → `lowpix_build` (MCP) or `python -m lowpix build <spec> -o out/<name>`
   → **open the `_sheet.png` and look at it** → fix the report's warnings first, then the worst
   art problem from the checklist → repeat. Use `lowpix_render part=<id>` (or
   `python -m lowpix render <spec> -o x.png --part <id>`) for pixel-level close-ups of eyes and faces.
4. Keep budgets: about 50 to 400 triangles, 15 to 40 colours, every face at least 2px. Feet use
   `snap_ground`, legs use `orient: "world"`, and buried faces are `hide`-den.
5. Finish with `--gif`, run `python -m unittest discover -s tests`, and report the triangle and
   colour counts and the output paths.

Never copy another artist's model or texture, and never feed assets tagged `noai` into tools.
Study the genre and make original designs.
