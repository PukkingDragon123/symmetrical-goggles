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


def cushion_moss(out="moss", px=256, seed=4):
    """concrete_moss colour, re-shaped into cushions: voronoi lumps with dark crevices and lit-agnostic AO"""
    rng = np.random.default_rng(seed)
    base = load_rgb(ph.fetch("concrete_moss", "diff", "2k", prefer=("jpg", "png")), (px, px))
    base = flatten_light(base, radius=px / 5, amount=0.9)
    base = hsv_adjust(base, 0.03, 1.35, 1.05)
    n = 260
    pts = rng.random((n, 2)) * px
    yy, xx = np.mgrid[0:px, 0:px].astype(np.float32)
    wx = blur(rng.random((px, px)).astype(np.float32), 5)
    wy = blur(rng.random((px, px)).astype(np.float32), 5)
    xx = xx + (wx - wx.mean()) / (wx.std() + 1e-6) * 3.5
    yy = yy + (wy - wy.mean()) / (wy.std() + 1e-6) * 3.5
    d1 = np.full((px, px), 1e9, np.float32)
    d2 = np.full((px, px), 1e9, np.float32)
    idx = np.zeros((px, px), np.int32)
    for i, (x, y) in enumerate(pts):
        for ox in (-px, 0, px):
            for oy in (-px, 0, px):
                d = np.hypot(xx - x - ox, yy - y - oy)
                m = d < d1
                d2 = np.where(m, d1, np.minimum(d2, d))
                idx = np.where(m, i, idx)
                d1 = np.where(m, d, d1)
    edge = np.clip((d2 - d1) / 2.5, 0, 1)
    dome = np.clip(1 - d1 / (px / np.sqrt(n) * 0.75), 0, 1)
    tint = rng.uniform(0.86, 1.12, (n, 3)) * np.array([1.0, 1.0, 0.92])
    hue = tint[idx]
    ao = 0.68 + 0.32 * edge ** 0.5
    fuzz = 1 + 0.18 * (rng.random((px, px)) - 0.5)
    rgb = np.clip(base * hue * ao[..., None] * (0.9 + 0.2 * dome[..., None]) * fuzz[..., None], 0, 1)
    # fine stem speckle
    sp = rng.random((px, px)) < 0.12
    rgb[sp] *= 1.18
    pal = kmeans(rgb.reshape(-1, 3), 22, seed=seed)
    q, idx2 = quantize(rgb, pal, dither=0.04)
    q, _ = despeckle(idx2, pal)
    save_rgb(os.path.join(OUT, f"{out}.png"), q)
    info = ph.info("concrete_moss")
    return {"file": f"veg/{out}.png", "asset": "concrete_moss (colour) + procedural cushions", "tile_m": 1.6,
            "authors": list(info.get("authors", {}).keys()), "url": "https://polyhaven.com/a/concrete_moss"}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = [
        # cushion moss: dense green moss scan, pushed toward the deep greens of feather moss
        cushion_moss(),
        # boreal floor: mossy patches, needles, twigs
        photo("forest_leaves_02", "forest_floor", 512, colours=40, sat=0.95, val=0.9),
        # Canadian Shield boulders: lichen-crusted grey rock
        photo("mossy_rock", "mossy_rock", 512, colours=36, sat=0.95),
        # needle / leaf litter under conifers
        photo("forrest_ground_03", "litter", 384, colours=28, sat=1.0, val=0.85, normal=False),
    ]
    json.dump(meta, open(os.path.join(OUT, "ground.json"), "w"), indent=1)
    for m in meta:
        print(m)


if __name__ == "__main__":
    main()
