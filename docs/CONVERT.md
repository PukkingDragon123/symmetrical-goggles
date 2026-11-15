# Converting detailed models

Hand-authoring a spec is the right tool for stylised, rigged characters. When you
want a **realistic shape**, converting an existing detailed model is faster and far
cheaper in tokens:

```bash
python -m lowpix polyhaven rat                       # find free CC0 models on Poly Haven
```

```bash
python -m lowpix convert polyhaven:street_rat -o out/rat --tris 900 --height 14
```

```bash
python -m lowpix convert my_scan.glb -o out/scan --tris 1200 --height 24 --yaw 90
```

MCP: `lowpix_polyhaven_search`, then `lowpix_convert` (it returns the contact sheet).

**What happens**
1. Load all meshes and base-colour textures from `.glb`, `.gltf` (with external `.bin`/images)
   or `.obj` + `.mtl`, with node transforms baked in.
2. Normalise: optional `--yaw`, scale to `--height`, centre, and stand on y = 0.
3. Bake colour: dense, area-weighted samples of the detailed surface go into a voxel colour
   field, low-passed by `--smooth` texels so you get pixel clusters instead of noise.
4. Decimate by vertex clustering, binary-searched to `--tris`, then re-fit to the exact height.
5. Palette: k-means groups the colours by material (hue and chroma), near-duplicates are merged,
   and each group gets one hue-shifted ramp of `--steps` colours.
6. Paint every texel at a uniform `--density`: the ramp comes from the baked colour, the tone from
   its lightness (`--detail`) plus painted light on smooth vertex normals, clustered
   `--grain`, lit rims and dark rims on creases sharper than `--crease`, and outlines only on
   very sharp folds and open edges. Fills never use the darkest step.

The result is an ordinary lowpix model: the same `.glb`, `.obj`, `.bbmodel`, previews and report as a spec.

| flag | default | effect |
|---|---|---|
| `--tris` | 900 | target triangle count |
| `--height` | 24 | size in units. With `--density` this sets how big the pixels are |
| `--density` | 2 | texels per unit |
| `--ramps` / `--steps` | 6 / 6 | max material groups and colours per ramp |
| `--detail` | 0.7 | how much of the source texture's light and dark survives (0 = flat materials) |
| `--light` | 1.0 | painted light strength |
| `--smooth` | 2.5 | colour low-pass in texels (bigger = chunkier clusters) |
| `--grain` | 0.45 | clustered painterly variation |
| `--crease` | 60 | dihedral angle (degrees) that gets rims |
| `--no-outline`, `--dither`, `--yaw`, `--name`, `--background`, `--gif` | | |

Tips: thin parts (tails, legs, ears) need enough triangles to survive. Raise `--tris`
if they vanish. Lower `--height` for chunkier pixels. Converted meshes aren't rigged;
for animation, author the creature as a spec and use the converted model as a
proportion reference.

Poly Haven assets are CC0. Crediting "Poly Haven" is appreciated but not required.
