# Converting detailed models

Hand-authoring a spec is the right tool for stylised, rigged characters. When you
want a **realistic shape**, converting an existing detailed model is faster and far
cheaper in tokens:

```bash
python -m lowpix polyhaven rat
```

```bash
python -m lowpix convert polyhaven:street_rat --style pixel -o out/rat --height 14
```

```bash
python -m lowpix convert my_scan.glb --style realistic --atlas 2048 -o out/scan --yaw 90
```

The first command finds free CC0 models on Poly Haven. MCP: `lowpix_polyhaven_search`, then
`lowpix_convert` (it returns the contact sheet). For many models at once see `docs/BATCH.md`.

## Styles

| style | look | defaults |
|---|---|---|
| `pixel` | the house style: chunky pixel art, hue-shifted ramps, painted light, unlit, nearest filtering | 900 tris, 2 px/unit |
| `pixel-hd` | high-resolution pixel art with fine pixel detail, still strictly palette-quantised | 3000 tris, 6 px/unit |
| `painted` | smooth hand-painted look: source colours, painterly value bands, cool shadows and warm lights, unlit, linear filtering | 6000 tris, 1024 atlas |
| `realistic` | high-res source texture, lit PBR material, smooth normals: a clean, game-ready LOD | 20000 tris, 1024 atlas (`--atlas 2048` for more) |

`--tris 0` keeps the source mesh untouched (realistic re-bake only).

## Pipeline
1. Load all meshes and base-colour textures from `.glb`, `.gltf` (external `.bin`/images) or
   `.obj` + `.mtl`, with node transforms baked in, then weld seams.
2. Normalise: optional `--yaw`, scale to `--height`, centre, and stand on y = 0.
3. **Decimate** by vertex clustering with quadric-optimal cluster positions (feature-preserving,
   no shrinkage), binary-searched to `--tris`, then re-fit to the exact height.
4. **Unwrap**: grow near-planar charts over the low-poly mesh (`--chart-angle`) and pack them,
   so texels run seamlessly across neighbouring faces. HD styles fit the texel density to `--atlas`.
5. **Transfer**: each texel finds the closest point on the detailed surface and samples its
   texture there (exact UV lookup, bilinear), falling back to a voxel colour field. The pixel style
   instead low-passes colour by `--smooth` texels so you get pixel clusters.
6. **Shade** per style. `pixel`/`pixel-hd`: k-means material groups → hue-shifted ramps
   (`--ramps`, `--steps`, `--spread`), tone from the source lightness (`--detail`) plus painted light on
   angle-limited smooth normals, clustered `--grain`, rims on creases (`--crease`), optional
   `--outline`, and the darkest step reserved. `painted`: posterised value bands (`--posterize`),
   `--saturation`, cool shadows and warm lights. `realistic`: the colour untouched, with lighting left to the engine.

## Options

| flag | effect |
|---|---|
| `--style` | `pixel`, `pixel-hd`, `painted`, `realistic` |
| `--tris` | target triangles (`0` = keep the source mesh) |
| `--height` | size in units (with the density this sets the pixel size) |
| `--density` / `--atlas` | texels per unit (pixel styles) or texture budget (HD styles) |
| `--ramps` `--steps` `--spread` | palette groups, colours per ramp, ramp value range |
| `--detail` `--light` `--smooth` `--grain` | source contrast kept, painted light, colour low-pass, painterly variation |
| `--crease` `--outline`/`--no-outline` `--dither` | rim angle, dark outlines on sharp folds, Bayer dithering |
| `--posterize` `--saturation` | value bands and chroma (painted) |
| `--chart-angle` | max normal spread inside one texture chart |
| `--yaw` `--name` `--background` `--gif` | orientation, display name, preview background, turntable |

## Tips
* Thin parts (tails, legs, ears) need triangles to survive. Raise `--tris` if they vanish.
* For chunkier pixels lower `--height` or `--density`. For finer ones use `pixel-hd`.
* Converted meshes aren't rigged. For animation, author the creature as a spec
  (`python -m lowpix new creature "<Name>"`) and use the conversion as a proportion reference.
* Poly Haven assets are CC0. Crediting "Poly Haven" is appreciated but not required.
