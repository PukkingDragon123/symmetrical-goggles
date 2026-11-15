# Mass production

`lowpix batch` builds and converts many models in parallel and gives you one place to
review them.

```bash
python -m lowpix batch examples/*.json -o out/specs
```

```bash
python -m lowpix batch my_models/ --style pixel-hd -j 4 -o out/hd
```

```bash
python -m lowpix batch "polyhaven?statue" --limit 12 --style painted -o out/statues
```

```bash
python -m lowpix batch manifest.json -o out/set
```

**Sources** can be mixed freely: spec `.json` files, model files (`.glb`, `.gltf`, `.obj`),
folders (searched recursively), glob patterns, `polyhaven:<id>`, `polyhaven?<query>` (top
`--limit` results), and manifests:

```json
{
  "defaults": {"style": "pixel", "height": 20},
  "items": [
    {"source": "polyhaven:street_rat", "name": "Rat", "tris": 900, "height": 12},
    {"source": "polyhaven:street_rat", "name": "Rat HD", "style": "pixel-hd"},
    {"source": "models/chair.glb", "style": "realistic", "atlas": 2048, "yaw": 90},
    {"source": "../examples/robot.json"}
  ]
}
```

Item keys: `source`, `name`, `style`, `height`, `yaw`, and any convert option (`tris`, `density`,
`atlas`, `ramps`, `steps`, `light`, `detail`, `smooth`, `grain`, `crease`, `dither`, `posterize`,
`saturation`, `chart_angle`, `spread`, `outline`). CLI flags (`--style`, `--height`, `--tris`,
`--atlas`) set defaults for every item.

**Outputs** in the out dir:
* one folder per item with the usual `.glb`, `.obj`, `.bbmodel`, texture, hero, sheet and report
* `summary.json` / `summary.csv`: status, triangles, colours and time per item. Failures
  are recorded with their error and never stop the batch
* `contact.png`: every hero render in one grid, so you can review a whole set at a glance
* `index.html`: a gallery that opens each `.glb` (with its animation clips) in a viewer.
  Serve the folder with `python -m http.server` and open `/index.html`

MCP: `lowpix_batch` returns the summary plus the contact grid image.

Typical speed per item on 4 cores: about 3 s for `pixel`, about 7 s for `pixel-hd`, and 30 to 50 s
for `painted`/`realistic` at a 1024 atlas and 6 to 20k triangles.
