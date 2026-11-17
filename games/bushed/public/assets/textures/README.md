# BUSHED tiling textures

Seamless, high-resolution pixel-art PBR pairs made by `tools/make_textures.py` from CC0 Poly Haven scans
(credits: `CREDITS.md`, "Models and textures"). `index.json` lists every pair with its tile size, pixel size,
density and source, for code that wants to read them.

* `<set>/<name>_albedo.png`: sRGB colour, palette-quantised (40-64 photo-derived colours per tile, isolated pixels
  cleaned up). **No directional light is baked in**; only ambient occlusion / cavity darkening. Load with
  `loadTex('terrain/moss_albedo.png', { repeat: true })` (nearest magnification, mipmapped minification).
* `<set>/<name>_normal.png`: tangent-space normal map, **OpenGL convention (+Y up)**, which is three.js's default
  (`normalScale` positive). Load with `loadTex(..., { repeat: true, srgb: false })`.
* Repeat: `texture.repeat.set(surfaceWidthMetres / tile, surfaceHeightMetres / tile)` (or world-space UVs divided
  by the tile size).

## Terrain (`terrain/`)

| name | tile (m x m) | px | px/m | source scan | notes |
|---|---|---|---|---|---|
| `forest_floor` | 2.0 | 1024 | 512 | forrest_ground_03 | spruce / pine needle litter, warmed and darkened |
| `dead_leaves` | 3.0 | 512 | 171 | forest_leaves_02 | broadleaf litter with twigs |
| `moss` | 2.0 | 512 | 256 | sparse_grass | low mossy carpet, greened |
| `grass` | 2.0 | 512 | 256 | forrest_ground_01 | short forest grass with needles and twigs |
| `dirt` | 2.0 | 512 | 256 | dirt | bare packed earth |
| `mud` | 1.3 | 512 | 394 | brown_mud_02 | wet mud with clods |
| `mud_ruts` | 2.25 | 512 | 228 | muddy_tracks | tyre-tracked mud (desaturated to brown) |
| `gravel_road` | 2.0 | 512 | 256 | rocky_trail | gravel and dirt, plain (tiles both ways) |
| `gravel_road_ruts` | 4.0 | 1024 | 256 | rocky_trail + dirt + forrest_ground_01 | **road strip**: U runs across the road, V along it (tiles along V only; edges are plain gravel with grass). Two packed-dirt ruts at u = 0.34 and 0.66 (1.3 m apart, the Jeep's track) with a grassy crown; ruts are 4 cm deep in the normal map |
| `granite` | 1.5 | 512 | 341 | rock_08 | speckled grey granite (Canadian Shield outcrops, boulders) |
| `lichen_rock` | 2.0 | 512 | 256 | lichen_rock | dark rock crusted with pale lichen (rock tops, old boulders) |
| `pebbles` | 2.16 | 512 | 237 | ganges_river_pebbles | lake-shore pebbles, mixed grey and white |

## Building (`building/`)

| name | tile (m x m) | px | px/m | source scan | notes |
|---|---|---|---|---|---|
| `log_wall` | 1.25 | 512 | 410 | wood_trunk_wall | weathered, bark-stripped logs, **horizontal** (about 5 courses per tile) |
| `rough_planks` | 2.0 | 512 | 256 | weathered_planks | grey, rough-sawn vertical boards (sheds, interiors) |
| `floor_boards` | 2.0 | 512 | 256 | wood_floor_worn | worn honey-coloured floor boards, running along U |
| `cedar_shakes` | 1.6 | 512 | 320 | weathered_planks (synthesised) | split cedar shakes in 8 courses of 0.2 m exposure, butts at the bottom of each course; V points up the roof slope |
| `corrugated_rust` | 2.0 | 512 | 256 | rusty_corrugated_iron | rusty corrugated roofing, ribs along V |
| `fieldstone` | 2.0 | 512 | 256 | stone_wall | rounded fieldstones in mortar (chimneys, foundations) |
| `painted_siding` | 1.6 | 512 | 320 | distressed_painted_planks | faded grey-green painted lap siding with rust stains, boards **horizontal** |
| `concrete` | 2.0 | 512 | 256 | concrete_floor_02 | stained concrete (store floor, steps, pads) |
| `window_grime` | 1.0 | 512 | 512 | dirty_concrete (synthesised) | old window glass: **RGBA** albedo, alpha = grime opacity (12-80 %). Use `transparent: true` with the map (or `alphaMap`), low roughness; rain streaks run down V. Tiles both ways |

Rebuild: `cd /home/user/symmetrical-goggles && python games/bushed/tools/make_textures.py [names...]`
(downloads go to `out/bushed/texdl`, gitignored).
