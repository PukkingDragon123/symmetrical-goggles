# Agent workflow

lowpix is built so an AI agent can model with a tight **write → build → look →
fix** loop, without a 3D viewport.

## Tools

* **MCP** (preferred inside Claude Code: the repo's `.mcp.json` registers it):
  `lowpix_guide`, `lowpix_build` (returns the report and the contact-sheet image),
  `lowpix_render` (any angle, or `part=` close-ups), `lowpix_texture`,
  `lowpix_ramp`.
* **CLI**: `python -m lowpix build|render|lint|ramp|schema` (see `--help`).
* **Python**: `from lowpix import build_model, render, export_all`.

## Loop

1. **Concept.** Write down 3 to 5 identity traits (for example "glossy black, molten
   gold blotches, bronze eyes, sprawl, S-tail"), the palette ramps, and a triangle
   budget.
2. **Block out** with plain `box`/`taper` parts, a single flat ramp and no layers.
   Build, then check the proportions, pose and ground contact in the front, side and top
   views. Fix every `below ground plane` or `floats` warning.
3. **Shape**: taper the ends, add prisms for eyes and cards for toes, hide internal faces,
   and add S-curves (small yaws per segment).
4. **Paint the base**: ramp, tone, rims and outline. Check that the light reads.
5. **Markings**: spots, stripes and bands with `bevel`. Put them in a style with an `id`
   and tune them per part with `{"id": ..., "count": .., "seed": ..}`.
6. **Focal details**: stamps for the eyes, nostrils and mouth. Use
   `lowpix_render part=head` to check them at pixel level.
7. **Polish**: gloss dashes, pores as tiny spots, colour budget. Run the critique
   checklist in `STYLE_GUIDE.md` and fix the worst problem first.
8. **Ship**: `build --gif`. Hand over the `.glb` (game engines and three.js), the `.obj`,
   and the `.bbmodel` (for a human to touch up in Blockbench).

## Fixing common warnings

| warning | fix |
|---|---|
| `below ground plane y=0: shin(-0.49)` | shorten that part's `size[1]` or raise its parent's pivot; feet → `snap_ground` |
| `model floats ... above ground` | lower the root pivot, or set `"grounded": false` for flying things |
| `faces are under 2px` | hide the face, make the part bigger, or raise `density` |
| `triangle count exceeds budget` | `hide` buried faces; use fewer prism sides; replace thin geometry with cards |
| `colours used ... budget` | shorten ramps; set `dither: 0`; reuse ramps across parts |
| `unknown ramp` / `stamp chars missing from key` | the message names the part and layer |

## Tips

* Seeds key on layer `id`, so adding or removing other layers doesn't reshuffle
  your patterns. Change `seed` to reroll one pattern.
* Mirrored parts share pattern seeds, so they're symmetric. Set `"asymmetric": true`
  on a layer for natural left/right variation.
* Patterns in `space: "world"` run continuously across neighbouring parts.
* Keep painted light consistent: stamps are not lit, so place their highlights on
  the side facing `light.dir`.
