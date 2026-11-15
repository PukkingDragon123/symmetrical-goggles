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
| `hide` | face names to drop (internal faces hidden inside other parts). Saves triangles and atlas space. |
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

`space`: `"local"` (default; part coordinates, symmetric across mirrored copies)
or `"world"` (continuous across parts). `post: true` runs the layer after
lighting and rims.

`bevel`: `true` or `{"shadow": 1, "highlight": 1, "shadow_shift": -1.5, "highlight_shift": 1, "shadow_ramp": null}`.
It paints a 1px drop shadow on the side of the shape away from the light and a
highlight on the lit side, which is the classic hand-painted inset look.

### Face filters

`faces` is a list of tags: face names (`front back left right top bottom`,
`side0`...), `sides` (all four sides, or prism sides), `flanks` (left and right),
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
