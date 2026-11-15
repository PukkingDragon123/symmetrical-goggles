# Style guide: low-poly with hand-painted pixel-art textures

This is a study of a widely shared genre: chunky low-poly models (often built in
Blockbench) wearing low-resolution, hand-painted pixel textures, shown **unlit**.
It was distilled from looking at public preview images in Sketchfab's curated
*Low poly & pixel art texture* collection. No meshes, textures or other assets
from that collection were downloaded or copied. Several artists there tag their
work `noai`, so do not feed their models to any tool. Learn the genre, then make
your own.

Each rule below names the lowpix feature that implements it.

## 1. Silhouette first, few triangles

* About 50 to 400 triangles for a creature or prop. Every part is a box, a tapered
  box or a 5 to 8 sided prism. No smoothing, no subdivision.
  → `box`, `taper`, `prism`; `budget.tris`.
* Read the creature from its silhouette: exaggerate the head and eyes, splay the limbs, and curve
  the spine and tail into an S or C. Segment long bodies into 2 to 4 boxes that each
  yaw a few degrees.
  → part hierarchy, `pivot`, `rotation`.
* Let segments overlap slightly instead of welding them. The stepped seams are part
  of the charm. Hide the faces buried inside other parts.
  → `hide`.
* Thin things (toes, spines, fins, whiskers, flames) are **alpha-cut cards**,
  not geometry.
  → `card` + `art`.
* **Organic means one continuous form, not stacked boxes.** Creatures read as "advanced" low poly when the
  body and tail are a single tube with an 8-sided, slightly boxy cross-section bending through an S-curve,
  and the head is a rounded chamfered loaf. The facets are flat-shaded by the painted light, with no seams.
  → `loft` (`profile.round` about 2.5 to 3, `subdiv` 1), parts placed on it with `attach`.
* **Hard surface means chamfered boxes and cylinders, layered.** Cut every long edge, stack a few
  chunky masses (chest, hips, helmet), put joints in contrasting cylinders, and give the silhouette one
  oversized readable feature (a single big eye, a lantern, a tank).
  → `chamfer`, `prism`, nested parts.

## 2. Uniform, visible texel density

* Every face gets the same texels-per-unit, so pixels are the same size all
  over the model. Large pixels are a feature.
  → `density` (lowpix sizes every face's pixel rectangle from it).
* Nearest-neighbour filtering only. Never blur.
  → glTF sampler `NEAREST`, renderer samples nearest.

## 3. All lighting is painted in

* The model is shown unlit (emissive or shadeless). Light and form are
  painted into the texture.
  → `KHR_materials_unlit` + the painter's light model.
* Faces toward a fixed key light (upper front-left by convention) are lighter, faces
  pointing down are darkest, and the lower body darkens toward the ground.
  → `light.dir`, `strength`, `gradient`, `ao`.
* **Edge rims**: a 1px lighter line along the edges that face the light, and a 1px
  darker line (or a near-black outline) along the edges that face away. This
  single trick sells the bevelled, "carved" look.
  → `rim.light`, `rim.dark`, `rim.outline: "dark"`.

## 4. Limited, hue-shifted palettes

* 15 to 40 colours for a whole model, grouped into ramps of 4 to 8.
* Ramps hue-shift: shadows go cooler and more saturated (toward violet or blue),
  highlights go warmer and lighter (toward yellow). The darkest colour is a tinted near-black, never
  #000.
  → `make_ramp` / `palette.ramps.{base, hue_shift}`; `budget.colors`.
* One dark, desaturated body colour plus one or two saturated accent colours.
  The accent carries the identity (stripes, blotches, eyes).

## 5. Patterns are bold shapes with a painted bevel

* Accent markings are big, readable shapes: bands, blotches, chevrons. They wrap
  continuously around the box edges.
  → `spots`, `stripes`, `band`, `patches` (evaluated in 3D, so they wrap).
* Each marking gets a 1px shadow on the side away from the light, in a darker
  hue-shifted shade of the accent, and a 1px highlight on the lit side. This is
  what makes flat colour look hand-inked.
  → `bevel`.
* Texture the base with **clusters** (groups of 2 to 6 pixels) of an adjacent
  ramp shade, not single-pixel noise. Pixel artists avoid noise.
  → `noise` (large `scale`), `spots` with tiny radii for pores; `speckle` sparingly.
* Dithering is a tool, not a texture. Keep `dither` near 0 for clean bands and use
  it only on large gradients.

## 5b. Hard-surface paint language

* Colour-block the shell: one light enamel, one saturated accent (stripes, pads, caps), and gunmetal
  for joints and mechanics.
  → `band`, `rect` with `bevel`.
* Recessed panel grooves on large faces, rivets at the corners, vent grilles, small stencils and gauges.
  → `panel`, `rivets`, `grille`, `stamps`.
* Wear is **sparse dark chips on outer edges** (paint flaked off to the metal underneath), not grey
  noise everywhere. Keep grime low and away from top faces.
  → `wear` (`density` about 0.15, `ramp` dark metal), `patches` with a negative `shift`.
* Light sources are flat, saturated, near-white at the core, with `light` about 0.25 so the shading
  doesn't dim them. They're the brightest values on the model, so use them for focal points.

## 6. Hand-placed focal details

* Eyes, nostrils, mouths, gems and buttons are placed pixel by pixel. Eyes get a
  lit ring, a dark pupil and a 1 to 2px white catchlight on the lit side.
  → `stamps`.
* Gloss on wet or shiny materials is short highlight dashes just inside
  lit edges, not scattered dots.
  → `gloss` with `dash: true`.

## 7. Presentation

* Hero angle about 35 to 40° yaw and 20 to 28° pitch, on a flat dark background that
  contrasts with the body value (a black creature on a dark moss green background, for example).
  → `render.hero`, `render.background`.

## Critique checklist (run it on every contact sheet)

1. Does the silhouette read at thumbnail size? Is the head or focal point the
   biggest, clearest shape?
2. Are pixels the same size everywhere? (Watch `tiny faces` warnings.)
3. Is it clear where the light comes from, on every part?
4. Do the markings have a bevel shadow and highlight? Do they wrap edges cleanly?
5. Is there any single-pixel noise that reads as dust? Replace it with clusters.
6. Do the eyes have a catchlight? Is the accent colour carrying the identity?
7. Do the feet touch the ground with nothing sunk below it? (`below ground plane` warnings.)
8. Are triangles and colours within budget?

## 8. Animation that reads as polished

Rigid-part animation lives or dies on timing and overlap. Steal from the
classic principles:

* **Overlap and follow-through**: never move a chain all at once. Use `wave` with a
  `lag` of 0.08 to 0.2 and a `growth` of 1.1 to 1.3 so tips trail and swing wider than roots
  (tails, necks, antennae, ears, feathers, flame crests).
* **Ease, then hold**: key poses with `ease` or `smooth`, and *hold* important poses
  (repeat a key) so they read. Snappy actions use short wind-ups and `back`
  overshoot.
* **Anticipation**: before a big move (pounce, roar, pop-up), move a little the
  other way first.
* **Squash and stretch**: small `scale` offsets on the body (about 0.03 to 0.12), with volume
  roughly kept (stretch Y, thin X/Z). Use it on landings, breaths and hops.
* **Secondary motion**: give idle clips at least three things moving at
  different rates (breathing at 1 cycle, a tail at 1 cycle with lag, a blink or twitch as a
  `pulse`, flames or leaves flickering at 3 to 4 cycles).
* **Arcs**: rotate joints rather than sliding positions, so motion follows arcs.
  Combine a swing (Y) with a lift (Z, `bias` so it never dips below rest) for legs and wings.
* **Gaits**: diagonal pairs move together. Give the front legs `mirror_phase: 0.5` and the
  back legs the same but `phase` offset by 0.5. Bob the body twice per stride.
* **Loops**: use whole-number `cycles`, and end keyed clips on their first pose.
  Check the filmstrip: the last cell should flow into the first.
