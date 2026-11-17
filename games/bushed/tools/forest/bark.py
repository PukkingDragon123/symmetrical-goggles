"""Bark textures for the five species: Poly Haven CC0 bark scans -> high-resolution pixel art (+ normal maps).

    cd games/bushed && python3 tools/forest/bark.py

Writes public/assets/textures/trees/bark_<species>.png (colour, sRGB) and bark_<species>_n.png (OpenGL normal map).
Tile sizes (metres) are mirrored in src/trees/species.ts (barkTile).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import ph  # noqa: E402
from pix import (blur, bleed, combine_normals, despeckle, flatten_light, hsv_adjust, kmeans, load_normal,  # noqa: E402,F401
                 load_rgb, luminance, normal_from_height, quantize, save_rgb, to_img)

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "assets", "textures", "trees")
PPM = 160  # texels per metre


def px_for(metres):
    return int(round(metres * PPM / 16.0)) * 16


def photo_bark(asset, out, colours=28, hue=0.0, sat=1.0, val=1.0, flatten=0.75, tint=None, extra=None, seed=1):
    info = ph.info(asset)
    w_m = info["dimensions"][0] / 1000.0
    h_m = info["dimensions"][1] / 1000.0
    W, H = px_for(w_m), px_for(h_m)
    rgb = load_rgb(ph.fetch(asset, "diff", "2k", prefer=("jpg", "png")), (W, H))
    nrm = load_normal(ph.fetch(asset, "nor_gl", "2k", prefer=("jpg", "png")), (W, H))
    rgb = flatten_light(rgb, radius=W / 5, amount=flatten)
    rgb = hsv_adjust(rgb, hue, sat, val)
    if tint is not None:
        rgb = np.clip(rgb * np.array(tint)[None, None], 0, 1)
    if extra:
        rgb, nrm = extra(rgb, nrm, np.random.default_rng(seed))
    # pixel-art: sharpen a touch, then quantise onto a photo palette, despeckle
    soft = blur(rgb, 1.2)
    rgb = np.clip(rgb + (rgb - soft) * 0.6, 0, 1)
    pal = kmeans(rgb.reshape(-1, 3), colours, seed=seed)
    q, idx = quantize(rgb, pal, dither=0.05)
    q, idx = despeckle(idx, pal)
    save_rgb(os.path.join(OUT, f"bark_{out}.png"), q)
    save_rgb(os.path.join(OUT, f"bark_{out}_n.png"), nrm)
    return {"species": out, "asset": asset, "tile": [round(w_m, 3), round(h_m, 3)], "px": [W, H],
            "authors": list(info.get("authors", {}).keys()), "url": f"https://polyhaven.com/a/{asset}"}


def fir_extra(rgb, nrm, rng):
    """balsam fir: smooth grey bark with raised resin blisters and crusty lichen"""
    h, w = rgb.shape[:2]
    hgt = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    for _ in range(int(w * h / 1400)):
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        rx, ry = rng.uniform(2.5, 6), rng.uniform(2, 4.5)
        dx = (xx - cx + w / 2) % w - w / 2
        dy = (yy - cy + h / 2) % h - h / 2
        d = (dx / rx) ** 2 + (dy / ry) ** 2
        bump = np.clip(1 - d, 0, 1) ** 0.6
        hgt = np.maximum(hgt, bump)
    blister = hgt > 0.05
    # blisters: slightly paler, glossy-grey crown with a darker rim
    rim = (hgt > 0.0) & (hgt < 0.25)
    rgb = rgb.copy()
    rgb[blister] = rgb[blister] * 0.85 + np.array([0.62, 0.62, 0.58]) * 0.15
    rgb[rim] *= 0.86
    # lichen crust patches (pale grey-green), low frequency noise thresholded
    n = blur(rng.random((h, w)).astype(np.float32), 6)
    n = (n - n.mean()) / (n.std() + 1e-6)
    lic = n > 1.1
    speck = rng.random((h, w)) < 0.35
    rgb[lic & speck] = rgb[lic & speck] * 0.4 + np.array([0.70, 0.73, 0.62]) * 0.6
    nb = normal_from_height(blur(hgt, 0.8), strength=1.6)
    return rgb, combine_normals(nrm, nb)


def birch(out="birch", size_m=1.6, seed=7):
    """paper birch: chalky white papery bark, horizontal lenticels, dark scars, peeling curls with salmon underbark"""
    rng = np.random.default_rng(seed)
    W = H = px_for(size_m)
    base_src = load_rgb(ph.fetch("japanese_sycamore", "diff", "1k", prefer=("jpg", "png")), (W, H))
    det = luminance(base_src)
    det = (det - blur(det, W / 6)) * 1.0
    yy, xx = np.mgrid[0:H, 0:W]
    # base: warm chalk white with faint grey-pink mottling
    mott = blur(rng.random((H, W)).astype(np.float32), 10)
    mott = (mott - mott.mean()) / (mott.std() + 1e-6)
    rgb = np.ones((H, W, 3), np.float32) * np.array([0.90, 0.89, 0.85])
    rgb += det[..., None] * np.array([0.55, 0.55, 0.52])
    rgb += mott[..., None] * np.array([0.025, 0.022, 0.028])
    # faint horizontal paper banding
    band = blur(rng.random((H, 1)).astype(np.float32).repeat(W, 1), 1.0)
    rgb *= (0.97 + 0.05 * (band - 0.5))[..., None]
    hgt = np.zeros((H, W), np.float32) + det * 0.6

    def wrapd(a, b, m):
        return (a - b + m / 2) % m - m / 2

    # peeled patches: salmon/tan inner bark, with a curled white edge above
    for _ in range(int(W * H / 9000)):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        rx, ry = rng.uniform(8, 26), rng.uniform(3, 8)
        dx, dy = wrapd(xx, cx, W), wrapd(yy, cy, H)
        jag = 1 + 0.25 * np.sin(dx * 0.5 + rng.uniform(0, 6)) + 0.15 * np.sin(dx * 1.3)
        d = (dx / rx) ** 2 + (dy / (ry * jag)) ** 2
        m = d < 1
        inner = np.array([0.80, 0.55, 0.42]) * rng.uniform(0.85, 1.05)
        rgb[m] = rgb[m] * 0.25 + inner * 0.75
        hgt[m] -= 0.5
        curl = (d >= 1) & (d < 1.6) & (dy < 0)
        rgb[curl] = rgb[curl] * 0.6 + np.array([0.98, 0.97, 0.93]) * 0.4
        hgt[curl] += 0.7
        shadow = (d >= 1) & (d < 1.5) & (dy > 0)
        rgb[shadow] *= 0.82
    # lenticels: dark horizontal dashes
    for _ in range(int(W * H / 300)):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        ln = rng.uniform(2, 14) * (2.2 if rng.random() < 0.12 else 1)
        th = rng.uniform(0.6, 1.6)
        dx, dy = wrapd(xx[0], cx, W), None
        row = int(cy) % H
        span = np.abs(wrapd(np.arange(W), cx, W)) < ln / 2
        rows = [row] + ([(row + 1) % H] if th > 1.1 else [])
        dark = np.array([0.30, 0.27, 0.26]) * rng.uniform(0.6, 1.5)
        for r in rows:
            rgb[r, span] = rgb[r, span] * 0.25 + dark * 0.75
            hgt[r, span] -= 0.6
        # pale raised lip under the lenticel
        r2 = (row + len(rows)) % H
        rgb[r2, span] = rgb[r2, span] * 0.7 + 0.3
    # black branch scars ("eyebrows"/chevrons) and rough dark patches
    for _ in range(int(W * H / 26000) + 2):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        s = rng.uniform(6, 16)
        dx, dy = wrapd(xx, cx, W), wrapd(yy, cy, H)
        chev = np.abs(dy - 0.35 * np.abs(dx) + s * 0.25) < (s * 0.18 * (1 - np.clip(np.abs(dx) / (s * 1.6), 0, 1)) + 0.6)
        chev &= np.abs(dx) < s * 1.6
        knot = (dx / (s * 0.35)) ** 2 + ((dy - s * 0.5) / (s * 0.3)) ** 2 < 1
        m = chev | knot
        rgb[m] = np.array([0.11, 0.10, 0.10]) + rng.uniform(0, 0.06)
        hgt[m] -= 0.4
        hgt[knot] += 0.9
    rgb = np.clip(rgb, 0, 1)
    pal = kmeans(rgb.reshape(-1, 3), 26, seed=seed)
    q, idx = quantize(rgb, pal, dither=0.03)
    q, idx = despeckle(idx, pal)
    nrm = normal_from_height(blur(hgt, 0.7), strength=1.3)
    save_rgb(os.path.join(OUT, f"bark_{out}.png"), q)
    save_rgb(os.path.join(OUT, f"bark_{out}_n.png"), nrm)
    return {"species": out, "asset": "japanese_sycamore (detail only) + procedural", "tile": [size_m, size_m], "px": [W, H],
            "authors": list(ph.info("japanese_sycamore").get("authors", {}).keys()),
            "url": "https://polyhaven.com/a/japanese_sycamore"}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = []
    # black/white spruce: thin, scaly grey-brown plates
    meta.append(photo_bark("bark_platanus", "spruce", hue=-0.01, sat=0.55, val=1.38, tint=(0.97, 0.95, 0.95)))
    # balsam fir: smooth grey with resin blisters and lichen
    meta.append(photo_bark("chinese_hackberry_bark", "fir", hue=0.02, sat=0.32, val=1.32, extra=fir_extra, colours=24))
    # red / jack pine: flaky red-brown plates with dark fissures
    meta.append(photo_bark("pine_bark", "pine", sat=1.05, val=1.02))
    # western red cedar: fibrous vertical strips, red-brown weathering to silver
    meta.append(photo_bark("metasequoia_bark", "cedar", hue=0.0, sat=0.72, val=1.08, tint=(1.0, 0.94, 0.9)))
    meta.append(birch())
    json.dump(meta, open(os.path.join(OUT, "bark.json"), "w"), indent=1)
    for m in meta:
        print(m)


if __name__ == "__main__":
    main()
