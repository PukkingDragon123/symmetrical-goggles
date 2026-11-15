# lowpix spec reference

A model is one JSON file. Units are arbitrary "model units" (think Blockbench
pixels: 16 units = 1 block). **Y is up, the model faces +Z**, +X is the model's
left side as seen from the front (screen-right in a front view). The ground is
`y = 0`.

```jsonc
{
  "name": "Ember Salamander",
  "density": 2,                       // texels per model unit (uniform across every face)
  "budget": {"tris": 320, "colors": 48},   // lint warnings when exceeded
  "light": {"dir": [-0.55, 1, 0.65], "strength": 1.0, "gradient": 0.6, "ao": 0.9, "ao_height": 3.2},
  "render": {"background": "#1f2b26", "hero": [38, 26], "shadow": 0.5},
  "palette": {"ramps": { "skin": ["#07060b", "..."], "gold": {"base": "#f59f2a", "steps": 6} }},
  "styles": { "skin": { /* paint */ } },
  "defaults": {"paint": { /* paint applied to every part first */ }},
  "parts": [ /* see below */ ]
}
```

## Palette and tone

* A **ramp** is an ordered colour list, darkest first. Give hex colours, or
  `{"base": "#hex", "steps": 6, "hue_shift": 18, "sat_shift": 0.12, "spread": 0.75}`
  to generate a hue-shifted ramp (`python -m lowpix ramp "#e2701a" --steps 7`).
* Painting happens in **tone space**: a float index into the texel's ramp.
  Lighting, rims and bevels add or subtract tone. The final tone is quantised
  (optionally ordered-dithered) back to a ramp entry, so the texture is always
  a strict limited palette.
* Colour references (stamps, `art_key`, `outline_color`): `"ramp:index"`
  (negative indexes count from the light end, e.g. `"gold:-1"`) or `"#rrggbb"`.

## Parts

| key | meaning |
|---|---|
| `id` | unique name (required). Mirrored copies get `<id>_mirror`. |
| `parent` | parent part id. Pivot and rotation are relative to the parent's pivot frame. |
| `shape` | `box`, `taper`, `prism` or `card` (see below). |
| `size` | `[w, h, d]` (`card`: `[w, h]`, optional when `art` is given). |
| `pivot` | `[x, y, z]` joint position in the parent frame (world for roots). |
| `offset` | `[x, y, z]` geometry centre relative to the pivot. Put a limb's pivot at its joint and offset the box away from it. |
| `rotation` | `[x, y, z]` degrees about the pivot, applied X, then Y, then Z. `+y` yaws the front (+Z) toward +X. `-x` pitches the front up. |
| `orient` | `"world"`: `rotation` is absolute (ignores the parent's rotation). Ideal for legs that must point straight down and feet that lie flat. |
| `mirror` | `true`: also build a copy (with all children) mirrored across X. Painted images stay un-flipped. Symmetric patterns by default. |
| `snap_ground` | `true` or a height: after posing, move the part vertically so its lowest point sits at that y (default 0.02). Use it on feet. |
| `attach` | `{"t": 0..1, "around": 0..1, "offset": 0, "align": "tangent"}`: place the pivot **on the surface of a loft parent**. `t` runs along the loft's path, and `around` goes 0 top → 0.25 the part's +X side → 0.5 bottom → 0.75 −X. `align`: `tangent` follows the path and stays upright (spines, crests), `surface` stands on the surface normal (glands, horns), `none` keeps the parent's axes (limbs). Mirrored copies attach on the reflected side of the *actual* surface, so asymmetric S-curved bodies work. |
| `hide` | face names to drop (internal faces hidden inside other parts). Saves triangles and atlas space. |
| `chamfer` | box/taper only: cut all four long edges by this many units. That gives eight sides (`top right bottom left` + `bevel_tl bevel_tr bevel_bl bevel_br`) and octagonal `front`/`back` caps. This is the hard-surface staple. |
| `style` | a style name or list of names (merged in order, then `paint`). |
| `paint` | per-part paint (see below). |

### Shapes

* **box**: cuboid. Faces `front back left right top bottom`.
* **taper**: box whose front (+Z) and back (-Z) ends can be scaled and
  shifted: `front_scale [sx, sy]`, `back_scale`, `front_shift [dx, dy]`,
  `back_shift`. A scale of `0` pinches an end into an edge (wedge). Use it for
  snouts, limbs, tail segments and tapering torsos.
* **prism**: n-sided low-poly cylinder along local Z. `sides` (3 to 12),
  `size [w, h, length]`, optional `front_scale`/`back_scale`, and `angle` to rotate the
  cross-section. Faces `front`/`back` (polygon caps) and `side0..side{n-1}`.
  Great for eyes, horns, barrels and logs.
* **loft**: a smooth low-poly tube through control rings, the tool for organic forms
  (bodies, tails, limbs, heads, domes, horns, handles). `rings`: `[{"at": [x, y, z], "size": w | [w, h], "shift": [dx, dy], "roll": deg}, ...]`
  (at least 2). `profile`: `{"sides": 8, "round": 2.5, "angle": 0}`, where `round` 2 = regular polygon or ellipse and
  higher = boxier (8 sides at 3 or more reads as a chamfered box). `subdiv`: Catmull-Rom rings inserted between each
  control pair (default 1). `caps`: `[start, end]`. A ring of size 0 pinches to a point (tail tips).
  Ring frames use parallel transport, so tubes can bend through vertical without twisting. Faces are
  `s{segment}_{side}`, tagged `top`/`right`/`bottom`/`left` (by position around the profile), `sides`, `flanks`;
  caps are `start`/`end`. Loft faces are *soft*: no rims or outlines between facets, and the faceted look comes
  from the painted light. Set `"hard": true` for rims on every facet. Each texel also knows its
  `path` coordinate (units along the loft) and `around` (0..1), which `stripes`, `band`, `gradient` and `spots.where`
  can use.
* **card**: a single double-sided quad with an alpha cut-out, for toes, fins,
  spines, hair, leaves and flames. `plane`: `xy` (faces +Z), `xz` (lies flat,
  faces +Y; image-top = -Z), `yz` (faces +X). `art` is a list of strings: `.`
  or space = transparent, any other char = opaque. `paint.art_key` maps chars
  to fixed colours. With `art`, the card is sized `cols/density x rows/density`.

### Face image orientation

Each face is painted as its own little image. For side faces, image-up is
world-up. For `top`, image-up is the back (-Z), so the front edge is the bottom
row. For `bottom`, image-up is the front. Prism caps are seen from outside with
+Y up. Use this when placing stamps.

## Paint

```jsonc
"paint": {
  "ramp": "skin", "tone": 2.0,        // base ramp and tone (default: ramp middle)
  "light": 1.0,                       // painted-lighting multiplier (0 = flat)
  "dither": 0.0,                      // 0 = clean bands, 1 = full 4x4 Bayer dithering between tones
  "rim": {"light": 1, "dark": 1, "light_shift": 1, "dark_shift": -1, "threshold": 0.25,
          "outline": "dark", "outline_width": 1, "outline_color": null},
  "layers": [ ... ],                  // pattern ops, in order
  "stamps": [ ... ],                  // hand-placed pixel art
  "art_key": {"t": "skin:6"}          // card art colours
}
```

**Painted light.** Per texel: `tone += light * (strength * dot(N, L) + gradient * local_y)`,
with darkening toward the ground below `ao_height`. **Rims**: a texel band along every
face edge whose outward direction faces the light gets `+light_shift`, and edges
facing away get `dark_shift`. `outline`: `none`, `dark` (edges facing away from the light),
`all`, `bottom` or a list of edge names (`top right bottom left`), painted with the
ramp's darkest colour.

### Layer ops

Every layer accepts `faces` (filter, below), `id` (lets a part patch a layer it
inherits from a style), `seed`, and either `ramp`+`tone` (set the colour) or
`shift` (add to the current tone). Mask layers (band, stripes, spots, patches)
also accept `bevel`.

| op | params | does |
|---|---|---|
| `fill` | | whole face |
| `band` | `axis` (x/y/z or vector), `from`, `to` (normalised -1..1 part coords), `wobble`, `wobble_scale`, `space` | a slab of the part, e.g. a belly band or a lip line |
| `stripes` | `axis`, `period`, `width` (0..1 duty), `phase`, `wobble`, `range` [a, b] | repeating bands in part units (costal grooves, tiger stripes, planks) |
| `spots` | `count`, `radius` [min, max], `stretch` [sx, sy, sz], `roughness`, `rough_scale`, `where` {axis: [a, b]}, `seed_faces`, `min_gap`, `asymmetric` | blotches seeded on the surface; 3D distance, so they wrap around edges |
| `patches` | `scale`, `threshold`, `octaves` | organic fBm noise islands (moss, rust, dapples) |
| `noise` | `scale`, `amount`, `octaves` | smooth tone variation (clusters, not pixel noise) |
| `gradient` | `axis`, `amount` | tone ramp across the part |
| `speckle` | `density`, `shift` | single-pixel speckles (use sparingly) |
| `gloss` | `post: true`, `dash: true`, `length`, `inset`, `density`, `shift`, `ramps` | wet highlight dashes inset along lit edges; without `dash`, random glints near lit edges |
| `rect` | `rect` [x0, y0, x1, y1] (face fractions, or pixels with `px: true`) | colour-blocked panels, screens, hubs (mask: takes `ramp`/`tone`/`bevel`) |
| `panel` | `inset`, `shift`, `highlight`, `shadow`, `min_size` | a recessed panel groove `inset` px inside the face edges, bevelled by the light |
| `rivets` | `inset`, `spacing`, `highlight`, `shadow`, `ramp`/`tone`, `min_size` | bolt heads at face corners (and every `spacing` px), each with a 1px cast shadow |
| `wear` | `width`, `density`, `scratches`, `ramp`/`tone` or `shift` | chipped paint along edges revealing another ramp (dark metal under enamel reads best) |
| `grille` | `rect`, `period`, `dir` (`h`/`v`), `slit_tone`, `lip` | vent slits with a lit lip under each slit |

Axes: `x`/`y`/`z` (part coordinates; normalised -1..1 for `band`/`gradient`), a vector, or on lofts
`path` (units along the loft for `stripes`; 0..1 for `band`/`gradient`/`range`) and `around` (0..1).
`spots` extras: `where` may also use `path` (0..1) and `around` (wrapping ranges like `[0.6, 0.4]` are fine),
and `taper: true` shrinks spots where a loft narrows. Any layer can take `min_light`/`max_light` to only paint
faces whose light term (dot of normal and light, -1..1) falls in range, for example sheen on the most-lit facets.

`space`: `"local"` (default; part coordinates, symmetric across mirrored copies)
or `"world"` (continuous across parts). `post: true` runs the layer after
lighting and rims.

`bevel`: `true` or `{"shadow": 1, "highlight": 1, "shadow_shift": -1.5, "highlight_shift": 1, "shadow_ramp": null}`.
It paints a 1px drop shadow on the side of the shape away from the light and a
highlight on the lit side, which is the classic hand-painted inset look.

### Face filters

`faces` is a list of tags: face names (`front back left right top bottom`,
`side0`...), `sides` (all four sides, or prism and loft sides), `flanks` (left and right), `bevels`
(chamfer strips), `start`/`end` (loft caps),
`ends` (front and back), `caps`, `up`/`down`/`level` (world normal), `lit`/`shaded`
(relative to the light), `local_up`/`local_down`, `all`. Prefix with `-` to
exclude: `["sides", "-front"]`.

### Stamps

```jsonc
{"face": "front", "at": "top", "offset": [0, 2],
 "art": ["n......n", "nn....nn"], "key": {"n": "skin:0"}, "flip_on_mirror": false}
```

`at`: `center`, `top`, `bottom`, `left`, `right`, `top-left` (and the other corners), or
`[x, y]` pixel coordinates. `.` and space skip a pixel, `_` punches it
transparent, and other characters come from `key`. Stamps are applied after lighting,
so paint the light into them yourself, with the highlight on the side facing the light.

### Styles and layer ids

`styles` are reusable paint blocks. A part's paint is `defaults.paint` →
each style in `style` → `paint`. Scalars override, `rim`/`art_key` merge,
`stamps` append, and `layers` append unless a layer has the same `id` as an
inherited one, in which case it is patched in place. That's how a part tunes a style's
`blotch` spots (`{"id": "blotch", "count": 5, "seed": 3}`) without restating them.

## Outputs (`python -m lowpix build spec.json -o out/x [--gif]`)

| file | what |
|---|---|
| `<slug>.glb` | glTF 2.0: unlit (`KHR_materials_unlit`), nearest-filtered, alpha-masked, one node per part at its pivot, so it's ready to pose or animate. Passes the Khronos validator. |
| `<slug>.obj/.mtl` | world-space OBJ (set texture filtering to Closest/Nearest on import) |
| `<slug>.bbmodel` | Blockbench generic model (mesh elements plus an embedded texture), for hand touch-ups. Experimental. |
| `<slug>_texture.png` | the atlas; `_texture_xN.png` is nearest-upscaled |
| `<slug>_hero.png`, `_sheet.png`, `_turntable.gif` | previews |
| `<slug>_report.json` | tris, verts, atlas fill, colours used, bounds and **warnings** |

## Rigging and animation

**The rig is the part hierarchy.** Every part instance is a joint at its `pivot`
(Blockbench-style rigid bones), exported as a glTF node with its rest
translation and rotation. Put pivots where the joint should bend: shoulder, elbow, neck,
hinge of the jaw, wing root. Children follow their parents.

**Chains.** A `loft` with `"chain": true` is split into rigid segments, one per
span between control rings, named `<id>_0`, `<id>_1`, and so on (mirrored copies get `_mirror`
appended). Each segment pivots at its first ring. Joint caps close the gaps
that open when segments bend. Patterns and `path` coordinates stay continuous
across segments, and parts with `attach` or a pivot ride on the segment they sit on.
Use chains for tails, necks, spines, tentacles and antennae. More control rings
give more joints.

**Clips** live under top-level `animations`:

```jsonc
"animations": {
  "idle": {"length": 2.4, "loop": true, "tracks": [
    {"part": "head", "osc": {"axis": "x", "amp": 4, "cycles": 1, "phase": 0.25}},
    {"parts": ["tail_1", "tail_2", "tail_3"], "wave": {"axis": "y", "amp": 8, "cycles": 1, "lag": 0.12, "growth": 1.2}},
    {"part": "jaw", "keys": [[0, 0], [0.4, 18], [0.6, 18], [1.0, 0]], "axis": "x", "ease": "smooth"},
    {"part": "body", "channel": "scale", "osc": {"amp": [0.04, -0.03, 0.04], "cycles": 2}},
    {"part": "leg", "osc": {"axis": "y", "amp": 25}, "mirror_phase": 0.5}
  ]}
}
```

| track key | meaning |
|---|---|
| `part` / `parts` | a part id (drives it **and** its mirrored copy), an instance id (`leg_mirror`, `tail_2`) for just that joint, or a list (`parts`), which is treated as a chain for `wave` |
| `channel` | `rotation` (degrees, Euler XYZ, in the joint's own frame after its rest rotation; default), `position` (units, parent frame) or `scale` (values are offsets from 1, so `0.1` = 110%) |
| `keys` | `[[time_s, value], ...]` or `[[t, v, "ease"], ...]`. `value` is `[x, y, z]`, or a number with `"axis"`. Interpolation `ease` per track or per key: `ease` (sine in-out, default), `smooth` (Catmull-Rom through the keys), `linear`, `step`, `in`, `out`, `back` (overshoot), `elastic` |
| `osc` | `{"axis": "x" or [x, y, z], "amp": n or [ax, ay, az], "cycles": int, "phase": 0..1, "bias": n, "shape": "sine"/"bounce"/"square"/"saw"/"pulse"}` |
| `wave` | an `osc` applied down a chain, with joint *k* delayed by `k * lag` cycles and its amplitude multiplied by `growth^k`. This gives follow-through and overlapping action for free |
| `mirror_phase` | time offset (fraction of the clip) for the mirrored copy: `0.5` gives alternating legs or wings |
| `segment` / `segments: "all"` | for non-wave tracks on a chain id: which segment (default 0) |
| `raw` | don't mirror the values for the mirrored copy (use it for symmetric motion like a wing *flap* on Z) |
| `only` | drive just the un-mirrored copy of a mirrored part |

Tracks on the same joint add up (scale multiplies). **Looping**: with `loop: true`,
keys wrap to the first key, and oscillators loop seamlessly when `cycles` is a whole number.

Outputs: every clip is baked into the `.glb` at 30 fps (`anim_fps` to change) as LINEAR
translation, rotation and scale channels, so three.js, Godot, Unity and Blender play them as-is.
`build --gif` also writes `<slug>_<clip>.gif`. `python -m lowpix animate spec.json --anim walk -o strip.png`
renders a filmstrip of evenly spaced poses (use `.gif` for a GIF). The MCP tool is `lowpix_animate`.
