"""Ground-cover textures: moss, forest floor, mossy rock (Poly Haven CC0 scans -> high-resolution pixel art).

    cd games/bushed && python3 tools/forest/ground.py

Writes public/assets/textures/veg/{moss,forest_floor,mossy_rock,litter}.png (+ _n normal maps for floor / rock).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import ph  # noqa: E402
from pix import blur, despeckle, flatten_light, hsv_adjust, kmeans, load_normal, load_rgb, quantize, save_rgb  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "assets", "textures", "veg")


def photo(asset, out, px, colours=32, hue=0.0, sat=1.0, val=1.0, flatten=0.7, normal=True, sharpen=0.6, seed=1, crop=None):
    info = ph.info(asset)
    src = ph.fetch(asset, "diff", "2k", prefer=("jpg", "png"))
    rgb = load_rgb(src, (px, px))
    rgb = flatten_light(rgb, radius=px / 5, amount=flatten)
    rgb = hsv_adjust(rgb, hue, sat, val)
    soft = blur(rgb, 1.2)
    rgb = np.clip(rgb + (rgb - soft) * sharpen, 0, 1)
    pal = kmeans(rgb.reshape(-1, 3), colours, seed=seed)
    q, idx = quantize(rgb, pal, dither=0.04)
    q, idx = despeckle(idx, pal)
    save_rgb(os.path.join(OUT, f"{out}.png"), q)
    if normal:
        n = load_normal(ph.fetch(asset, "nor_gl", "2k", prefer=("jpg", "png")), (px, px))
        save_rgb(os.path.join(OUT, f"{out}_n.png"), n)
    return {"file": f"veg/{out}.png", "asset": asset, "tile_m": round(info["dimensions"][0] / 1000, 3),
            "authors": list(info.get("authors", {}).keys()), "url": f"https://polyhaven.com/a/{asset}"}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = [
        # cushion moss: dense green moss scan, pushed toward the deep greens of feather moss
        photo("concrete_moss", "moss", 256, colours=20, hue=0.02, sat=1.25, val=0.95, flatten=0.9, normal=False, sharpen=1.4),
        # boreal floor: mossy patches, needles, twigs
        photo("forest_leaves_02", "forest_floor", 512, colours=40, sat=0.95, val=0.9),
        # Canadian Shield boulders: lichen-crusted grey rock
        photo("mossy_rock", "mossy_rock", 512, colours=36, sat=0.95),
        # needle / leaf litter under conifers
        photo("forrest_ground_03", "litter", 384, colours=28, sat=1.0, val=0.85),
    ]
    json.dump(meta, open(os.path.join(OUT, "ground.json"), "w"), indent=1)
    for m in meta:
        print(m)


if __name__ == "__main__":
    main()
