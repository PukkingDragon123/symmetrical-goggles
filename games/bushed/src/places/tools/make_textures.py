#!/usr/bin/env python3
"""BUSHED places: building / furniture textures (high-resolution pixel art from CC0 Poly Haven photos).

    cd games/bushed && python3 src/places/tools/make_textures.py            # everything
    python3 src/places/tools/make_textures.py log_ext shakes                # some

Photo -> pixel art: area-downsample to 256 texels per metre, flatten the photo's large-scale lighting, multiply
a little of the source's ambient occlusion (cavity darkening only, never directional light), grade, then quantise
onto a k-means palette extracted from the photo (rich photo colour, crisp texels). Normal maps come from the
photo's own OpenGL normal map. Composite textures (cedar shakes, end grain, painted siding, plaid wool, grimy
glass) are assembled from the same photo material with procedural layouts.

Output: public/assets/textures/places/<name>.png (+ <name>_n.png) and index.json (tile sizes in metres).
Sources are cached by tools/forest/ph.py in ~/.cache/bushed-forest (outside the repo).
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(GAME, "tools", "forest"))
import ph  # noqa: E402
import pix  # noqa: E402

OUT = os.path.join(GAME, "public", "assets", "textures", "places")
DENS = 256  # texels per metre
INDEX: dict[str, dict] = {}
CREDITS: dict[str, str] = {}


def rng(seed):
    return np.random.default_rng(seed)


# ---------------------------------------------------------------------------------------------- helpers
def resize(a, w, h):
    """area resample float image (H, W[, C]) to (h, w)"""
    if a.ndim == 2:
        im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), "L")
    else:
        im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    m = Image.Resampling.BOX if im.width >= w else Image.Resampling.LANCZOS
    return np.asarray(im.resize((w, h), m)).astype(np.float32) / 255.0


def tile_to(a, w, h):
    """repeat a tileable image to cover (h, w)"""
    ry = math.ceil(h / a.shape[0]); rx = math.ceil(w / a.shape[1])
    reps = (ry, rx) + ((1,) if a.ndim == 3 else ())
    return np.tile(a, reps)[:h, :w]


def vnoise(w, h, cell, seed, wrap=True):
    """smooth value noise in [0,1], tileable when w,h are multiples of cell"""
    r = rng(seed)
    gw, gh = max(1, int(round(w / cell))), max(1, int(round(h / cell)))
    g = r.random((gh + 1, gw + 1)).astype(np.float32)
    if wrap:
        g[-1, :] = g[0, :]; g[:, -1] = g[:, 0]
    ys = np.linspace(0, gh, h, endpoint=False); xs = np.linspace(0, gw, w, endpoint=False)
    y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
    fy = ys - y0; fx = xs - x0
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy[:, None]) + (c * (1 - fx) + d * fx) * fy[:, None]


def anoise(w, h, cu, cv, seed):
    """anisotropic tileable value noise: cell cu texels along x, cv along y"""
    r = rng(seed)
    gw, gh = max(1, int(round(w / cu))), max(1, int(round(h / cv)))
    g = r.random((gh, gw)).astype(np.float32)
    g = np.concatenate([g, g[:1]], 0); g = np.concatenate([g, g[:, :1]], 1)
    ys = np.linspace(0, gh, h, endpoint=False); xs = np.linspace(0, gw, w, endpoint=False)
    y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
    fy = ys - y0; fx = xs - x0
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy[:, None]) + (c * (1 - fx) + d * fx) * fy[:, None]


def log_skin(seed, W=512, H=256):
    """procedural large-scale log surface structure (2 m along u x 1 m around v, no repeats inside the tile).
    Returns (tone 0..1, crack mask 0..1, knot mask, height)"""
    r = rng(seed)
    p = Photo("rough_wood", 256, 256, res="2k", rot=1, flat=0.7, ao=0.0)
    det = tile_to(p.lum, W, H); det = (det - det.mean()) / (det.std() + 1e-6)
    grain = anoise(W, H, 90, 2, seed) * 0.5 + anoise(W, H, 40, 1, seed + 1) * 0.3 + anoise(W, H, 200, 6, seed + 2) * 0.2
    tone = 0.5 + 0.18 * (grain - 0.5) * 2 + 0.08 * det
    facet = anoise(W, H, 400, 30, seed + 3)
    tone += 0.06 * (facet - 0.5) * 2
    crack = np.zeros((H, W), np.float32); hgt = 0.4 * grain + 0.05 * det
    for _ in range(int(r.integers(5, 9))):
        L = int(r.integers(60, 360)); x0 = int(r.integers(0, W)); y = float(r.integers(0, H))
        wmax = 0.8 + 2.2 * r.random(); ph_ = r.random() * 6
        for i in range(L):
            t = i / L
            w = wmax * math.sin(math.pi * t) ** 0.6
            yy = y + 3.0 * math.sin(i / 37 + ph_) + 1.2 * math.sin(i / 11 + ph_ * 2)
            x = (x0 + i) % W
            for k in range(-2, 3):
                cy = int(round(yy)) + k
                dd = abs(cy - yy)
                if dd <= w:
                    crack[cy % H, x] = max(crack[cy % H, x], 1.0 if dd < w - 0.5 else 0.5)
    knot = np.zeros((H, W), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for _ in range(int(r.integers(2, 5))):
        cx, cy = r.random() * W, r.random() * H
        a, b = 6 + 8 * r.random(), 4 + 4 * r.random()
        dx = (xx - cx + W / 2) % W - W / 2; dy = (yy - cy + H / 2) % H - H / 2
        d = np.sqrt((dx / a) ** 2 + (dy / b) ** 2)
        knot = np.maximum(knot, np.clip(1.3 - d, 0, 1))
        # grain swirls around the knot: darken a halo
        tone -= 0.08 * np.clip(2.2 - d, 0, 1) * (0.5 + 0.5 * np.sin(d * 6))
    hgt = hgt - crack * 0.8 + knot * 0.2
    return np.clip(tone, 0, 1), crack, knot, hgt


def fbm(w, h, cell, seed, oct=4):
    s = np.zeros((h, w), np.float32); amp = 1.0; tot = 0.0
    for o in range(oct):
        c = max(2, cell / (2 ** o))
        s += amp * vnoise(w, h, c, seed + o * 17); tot += amp; amp *= 0.5
    return s / tot


def grade(rgb, hue=0.0, sat=1.0, val=1.0, gamma=1.0, tint=None, tint_amt=0.0):
    out = pix.hsv_adjust(np.clip(rgb, 0, 1), hue, sat, val) if (hue or sat != 1 or val != 1) else rgb.copy()
    if gamma != 1.0:
        out = np.clip(out, 0, 1) ** gamma
    if tint is not None and tint_amt > 0:
        lum = pix.luminance(out)[..., None]
        t = np.array(tint, np.float32)[None, None, :]
        out = out * (1 - tint_amt) + (lum * t * 2.0) * tint_amt
    return np.clip(out, 0, 1)


def quant(rgb, k, seed=1, dither=0.0, despeckle=1):
    pal = pix.kmeans(rgb.reshape(-1, 3), k, seed=seed)
    q, idx = pix.quantize(rgb, pal, dither=dither)
    if despeckle:
        q, idx = pix.despeckle(idx, pal, despeckle)
    return q


def save(name, rgb, tile, normal=None, alpha=None, note=""):
    os.makedirs(OUT, exist_ok=True)
    if alpha is not None:
        pix.save_rgba(os.path.join(OUT, f"{name}.png"), rgb, alpha)
    else:
        pix.save_rgb(os.path.join(OUT, f"{name}.png"), rgb)
    if normal is not None:
        pix.save_rgb(os.path.join(OUT, f"{name}_n.png"), normal)
    INDEX[name] = {"tile": tile, "px": [int(rgb.shape[1]), int(rgb.shape[0])], "normal": normal is not None, "note": note}
    print(f"  {name}: {rgb.shape[1]}x{rgb.shape[0]} tile {tile}")


class Photo:
    """a Poly Haven texture loaded at a given texel size (tileable), lighting flattened, AO applied"""

    def __init__(self, asset, w, h, res="1k", rot=0, flat=0.55, ao=0.45, nor=True):
        CREDITS[asset] = f"https://polyhaven.com/a/{asset}"
        d = pix.load_rgb(ph.fetch(asset, "diff", res))
        a = pix.load_l(ph.fetch(asset, "AO", res)) if ao > 0 else None
        n = pix.load_rgb(ph.fetch(asset, "nor_gl", res)) if nor else None
        if rot:
            d = np.rot90(d, rot); a = np.rot90(a, rot) if a is not None else None
            if n is not None:
                n = np.rot90(n, rot).copy()
                # rotating the image rotates the tangent frame: fix x/y of the encoded normal
                x, y = n[..., 0] * 2 - 1, n[..., 1] * 2 - 1
                for _ in range(rot % 4):
                    x, y = -y, x
                n[..., 0] = x * 0.5 + 0.5; n[..., 1] = y * 0.5 + 0.5
        self.rgb = resize(d, w, h)
        if flat > 0:
            self.rgb = pix.flatten_light(self.rgb, max(4, min(w, h) / 5), flat)
        if a is not None:
            self.ao = resize(a, w, h)
            self.rgb = self.rgb * (self.ao[..., None] ** ao)
        else:
            self.ao = np.ones((h, w), np.float32)
        if n is not None:
            nn = resize(n, w, h) * 2 - 1
            nn /= np.linalg.norm(nn, axis=-1, keepdims=True) + 1e-6
            self.nor = nn * 0.5 + 0.5
        else:
            self.nor = None
        self.lum = pix.luminance(self.rgb)


def soften_normal(n, amt):
    """flatten an encoded normal map toward +Z by amt (0..1)"""
    v = n * 2 - 1
    v[..., 0] *= (1 - amt); v[..., 1] *= (1 - amt)
    v /= np.linalg.norm(v, axis=-1, keepdims=True)
    return v * 0.5 + 0.5


# ---------------------------------------------------------------------------------------------- textures
def t_log_ext():
    # stripped, silver-weathered log skin. u = along the log (2 m), v = around it (1 m): procedural large-scale
    # structure (grain streaks, checks, knots) carrying rough_wood's photo micro-detail and colour.
    tone, crack, knot, hgt = log_skin(7)
    p = Photo("rough_wood", 256, 256, res="2k", rot=1, flat=0.6, ao=0.0)
    photo = tile_to(p.rgb, 512, 256)
    pl = pix.luminance(photo)[..., None] + 1e-3
    silver_lo = np.array([0.30, 0.29, 0.27]); silver_hi = np.array([0.74, 0.73, 0.69])
    t = tone[..., None]
    rgb = silver_lo * (1 - t) + silver_hi * t
    # keep a little of the photo's own hue (warm browns under the grey)
    rgb = rgb * 0.8 + (photo / pl * pix.luminance(rgb)[..., None]) * 0.2
    # brown weathering stains + green-grey algae on some patches
    st = fbm(512, 256, 120, 21)[..., None]
    rgb = rgb * (1 - 0.25 * np.clip((st - 0.55) * 4, 0, 1)) + np.array([0.30, 0.24, 0.17]) * 0.25 * np.clip((st - 0.55) * 4, 0, 1)
    al = fbm(512, 256, 80, 22)[..., None]
    rgb = rgb * (1 - 0.18 * np.clip((al - 0.6) * 5, 0, 1)) + np.array([0.34, 0.38, 0.28]) * 0.18 * np.clip((al - 0.6) * 5, 0, 1)
    c = crack[..., None]
    rgb = rgb * (1 - c) + np.array([0.13, 0.10, 0.08]) * c
    k = knot[..., None]
    rgb = rgb * (1 - 0.75 * k) + np.array([0.22, 0.17, 0.12]) * 0.75 * k
    li = (vnoise(512, 256, 6, 33) > 0.88) & (fbm(512, 256, 64, 34) > 0.55)
    rgb[li] = rgb[li] * 0.45 + np.array([0.62, 0.66, 0.52]) * 0.55
    rgb = quant(np.clip(rgb, 0, 1), 28, seed=2)
    nor = pix.combine_normals(pix.normal_from_height(pix.blur(hgt, 0.7), strength=2.5), soften_normal(tile_to(p.nor, 512, 256), 0.5))
    save("log_ext", rgb, [2.0, 1.0], nor, note="procedural log skin + rough_wood detail, silvered")


def t_log_int():
    # inside the cabin: peeled logs aged to honey/amber by decades of woodsmoke and lamp oil
    tone, crack, knot, hgt = log_skin(8)
    f = Photo("wood_table_worn", 282, 282, res="2k", rot=1, flat=0.6, ao=0.0)
    lf = tile_to(f.lum, 512, 256); lf = (lf - lf.mean()) / (lf.std() + 1e-6)
    honey_hi = np.array([0.80, 0.52, 0.24]); honey_lo = np.array([0.34, 0.17, 0.07])
    t = np.clip(tone + 0.05 * lf, 0, 1)[..., None]
    rgb = honey_lo * (1 - t) + honey_hi * t
    sm = fbm(512, 256, 160, 51)[..., None]
    rgb *= 0.8 + 0.28 * sm
    c = crack[..., None]
    rgb = rgb * (1 - c) + np.array([0.10, 0.05, 0.025]) * c
    k = knot[..., None]
    rgb = rgb * (1 - 0.7 * k) + np.array([0.24, 0.11, 0.04]) * 0.7 * k
    rgb = quant(np.clip(rgb, 0, 1), 26, seed=3)
    nor = pix.combine_normals(pix.normal_from_height(pix.blur(hgt, 0.8), strength=1.8), soften_normal(tile_to(f.nor, 512, 256), 0.5))
    save("log_int", rgb, [2.0, 1.0], nor, note="procedural log skin + wood_table_worn detail, honey")


def t_chink():
    p = Photo("white_rough_plaster", 256, 256, res="1k", flat=0.6, ao=0.6)
    rgb = grade(p.rgb, sat=0.5, val=0.82)
    lum = pix.luminance(rgb)[..., None]
    warm = np.array([0.74, 0.69, 0.60])
    rgb = lum * warm / 0.62
    lum2 = pix.luminance(rgb)
    rgb = rgb * 0.5 + rgb * (0.5 * (lum2.mean() / (lum2[..., None] + 1e-3)) ** 0.6)
    d = fbm(256, 256, 64, 61)[..., None]
    rgb *= 0.85 + 0.2 * d
    # soot and dirt specks
    sp = vnoise(256, 256, 3, 62) > 0.9
    rgb[sp] *= 0.7
    rgb = quant(np.clip(rgb, 0, 1), 16, seed=4)
    save("chink", rgb, [1.0, 1.0], p.nor, note="white_rough_plaster (mortar chinking)")


def t_floor():
    # worn floorboards, boards run along u. old_wood_floor is 3 m: take 2 m x 2 m at 256/m
    p = Photo("old_wood_floor", 768, 768, res="2k", rot=0, flat=0.5, ao=0.5)
    rgb = p.rgb[:512, :512]
    nor = p.nor[:512, :512]
    lum = pix.luminance(rgb)
    # check grain direction: we want boards along u (horizontal). Detect via gradient energy.
    gx = np.abs(np.diff(lum, axis=1)).mean(); gy = np.abs(np.diff(lum, axis=0)).mean()
    if gx > gy:  # strong vertical edges -> boards run vertically; rotate
        rgb = np.rot90(rgb).copy(); nor = np.rot90(nor).copy()
        x, y = nor[..., 0] * 2 - 1, nor[..., 1] * 2 - 1
        nor[..., 0] = -y * 0.5 + 0.5; nor[..., 1] = x * 0.5 + 0.5
    rgb = grade(rgb, sat=0.95, val=1.05, tint=(0.62, 0.48, 0.34), tint_amt=0.25)
    # traffic wear: lighter, smoother path
    w = fbm(512, 512, 200, 71)[..., None]
    rgb = rgb * (0.85 + 0.3 * w)
    rgb = quant(np.clip(rgb, 0, 1), 28, seed=5)
    save("floor", rgb, [2.0, 2.0], nor, note="old_wood_floor")


def t_planks_grey():
    # weathered grey boards (porch deck, door, gables, woodshed). Boards run along v (vertical).
    p = Photo("wood_planks_grey", 384, 384, res="1k", flat=0.5, ao=0.5)
    rgb = grade(p.rgb, sat=0.7, val=1.08)
    rgb = quant(np.clip(rgb, 0, 1), 26, seed=6)
    save("planks_grey", rgb, [1.5, 1.5], p.nor, note="wood_planks_grey")


def t_board():
    # single clear boards for furniture, shelves, trim: grain along u, no seams.
    p = Photo("wood_table_worn", 282, 282, res="2k", rot=1, flat=0.6, ao=0.4)
    q = Photo("fine_grained_wood", 308, 308, res="1k", rot=1, flat=0.6, ao=0.3)
    a = tile_to(p.rgb, 512, 256); b = tile_to(q.rgb, 512, 256)
    m = fbm(512, 256, 128, 81)[..., None]
    rgb = a * (0.6 + 0.4 * m) + b * (0.4 - 0.4 * m)
    # warm (interior furniture: pine darkened with age)
    warm = grade(rgb, hue=0.0, sat=1.05, val=1.15, tint=(0.70, 0.46, 0.26), tint_amt=0.35)
    warm = quant(np.clip(warm, 0, 1), 26, seed=7)
    save("board_warm", warm, [2.0, 1.0], tile_to(p.nor, 512, 256), note="wood_table_worn + fine_grained_wood")
    # grey (outdoor, weathered)
    lum = pix.luminance(rgb)[..., None]
    grey = lum * np.array([0.64, 0.62, 0.58]) / 0.42
    st = fbm(512, 256, 64, 82)[..., None]
    grey = grey * (0.85 + 0.25 * st)
    grey = quant(np.clip(grey, 0, 1), 22, seed=8)
    save("board_grey", grey, [2.0, 1.0], tile_to(p.nor, 512, 256), note="wood_table_worn silvered")


def t_stone():
    p = Photo("old_stone_wall", 512, 512, res="2k", flat=0.5, ao=0.6)
    rgb = grade(p.rgb, sat=0.85, val=1.0)
    rgb = quant(np.clip(rgb, 0, 1), 28, seed=9)
    save("stone", rgb, [2.0, 2.0], p.nor, note="old_stone_wall (fieldstone hearth, piers)")


def t_iron():
    # black stove iron with rust bloom and a little heat bluing
    p = Photo("rust_coarse_01", 512, 512, res="1k", flat=0.6, ao=0.4)
    lum = pix.luminance(p.rgb)[..., None]
    r = fbm(512, 512, 96, 91)[..., None]
    black = np.array([0.075, 0.07, 0.068]) * (0.6 + lum * 1.2)
    rust = p.rgb * 0.75
    m = np.clip((r - 0.56) * 4, 0, 1)
    rgb = black * (1 - m) + rust * m
    rgb = quant(np.clip(rgb, 0, 1), 18, seed=10)
    save("iron", rgb, [2.0, 2.0], soften_normal(p.nor, 0.3), note="rust_coarse_01 blackened")
    # tin / galvanised (pails, stovepipe rain cap): cool grey with white rust
    g = np.array([0.55, 0.57, 0.58]) * (0.7 + 0.5 * lum)
    sp = fbm(512, 512, 40, 92)[..., None]
    g = g * (0.85 + 0.3 * sp)
    g = quant(np.clip(g, 0, 1), 14, seed=11)
    save("galv", g, [2.0, 2.0], soften_normal(p.nor, 0.6), note="rust_coarse_01 as galvanised steel")


def t_corrugated():
    p = Photo("rusty_corrugated_iron", 512, 512, res="2k", flat=0.4, ao=0.5)
    rgb = grade(p.rgb, sat=0.9, val=1.0)
    rgb = quant(np.clip(rgb, 0, 1), 24, seed=12)
    save("corrugated", rgb, [2.0, 2.0], p.nor, note="rusty_corrugated_iron")


def t_shakes():
    """hand-split cedar shakes: 4 courses x 0.25 m exposure in a 2 m x 1 m tile, grain down the slope (v).
    Rows top->bottom in the image; each row is one course, its butt (thick lower edge) at the row's bottom."""
    W, H, ROWS = 512, 256, 4
    rh = H // ROWS
    src = Photo("rough_wood", 256, 256, res="2k", flat=0.6, ao=0.6)  # grain vertical: matches v
    moss = Photo("mossy_rock", 768, 768, res="1k", flat=0.6, ao=0.3, nor=False)
    out = np.zeros((H, W, 3), np.float32)
    hgt = np.zeros((H, W), np.float32)
    r = rng(5)
    sl = tile_to(src.rgb, 1024, 1024)
    for row in range(ROWS):
        x = int(r.integers(0, 40))
        y0 = row * rh
        while x < W + 40:
            sw = int(r.integers(22, 70))
            sx, sy = int(r.integers(0, 700)), int(r.integers(0, 700))
            patch = sl[sy:sy + rh, sx:sx + sw]
            tone = 0.82 + 0.3 * r.random()
            warm = r.random()
            for i in range(sw):
                xx = (x + i) % W
                col = patch[:, i] * tone
                # warm red-brown cedar under the silver on some shakes
                col = col * (1 - 0.25 * warm) + col * np.array([1.25, 0.95, 0.75]) * 0.25 * warm
                out[y0:y0 + rh, xx] = col
                # shake thickness ramps up toward the butt; split ridges along the grain
                hgt[y0:y0 + rh, xx] = np.linspace(0.2, 1.0, rh) + 0.1 * src.lum[(sy + np.arange(rh)) % 256, (sx + i) % 256]
            # keyway: dark gap between shakes (1-2 texels)
            gap = 1 + int(r.random() < 0.4)
            for g in range(gap):
                out[y0:y0 + rh, (x + sw + g) % W] *= 0.18
                hgt[y0:y0 + rh, (x + sw + g) % W] = 0
            x += sw + gap
        # under the course above: shadowed (ambient occlusion only) top band
        for k in range(10):
            out[y0 + k] *= 0.55 + 0.045 * k
        # ragged butt: a few texels darker at the very bottom edge (end grain)
        out[y0 + rh - 2:y0 + rh] *= 0.72
    # silver weathering like the logs, but a touch browner
    lum = pix.luminance(out)[..., None]
    out = out * 0.5 + lum * np.array([0.62, 0.58, 0.54]) / 0.48 * 0.5
    # moss: clumps that favour the butt edges and the lower roof; lichen dots
    mn = fbm(W, H, 80, 7)
    rowpos = (np.arange(H) % rh) / rh
    mm = np.clip((mn - 0.62) * 6 + (rowpos[:, None] - 0.75) * 1.5, 0, 1) * np.clip((fbm(W, H, 160, 77) - 0.45) * 4, 0, 1)
    mm *= vnoise(W, H, 5, 8) * 0.6 + 0.6
    mossc = grade(moss.rgb[:H, :W], sat=1.5, val=1.15, tint=(0.42, 0.55, 0.18), tint_amt=0.5)
    out = out * (1 - mm[..., None]) + mossc * mm[..., None]
    hgt += mm * 0.25
    li = (vnoise(W, H, 4, 9) > 0.88) & (mn > 0.4)
    out[li] = out[li] * 0.4 + np.array([0.62, 0.66, 0.5]) * 0.6
    out = quant(np.clip(out, 0, 1), 30, seed=13)
    nor = pix.normal_from_height(pix.blur(hgt, 0.6), strength=3.0)
    save("shakes", out, [2.0, 1.0], nor, note="rough_wood shakes + mossy_rock moss (composite)")


def t_endgrain():
    """end grain discs (u,v in [0,1] map the disc's bounding square), 4 variants in a 2x2 atlas, 256 px each:
    0 old weathered cabin log end, 1 fresh spruce round with bark ring, 2 chopping block top (axe scars),
    3 fresh split face is not a disc: weathered porch post top instead."""
    S = 256
    atlas = np.zeros((S * 2, S * 2, 3), np.float32)
    hgt = np.zeros((S * 2, S * 2), np.float32)
    bark = pix.load_rgb(os.path.join(GAME, "public", "assets", "textures", "trees", "bark_spruce.png"))
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for v in range(4):
        r = rng(100 + v)
        cx, cy = S / 2 + r.normal(0, 8), S / 2 + r.normal(0, 8)
        dx, dy = xx - cx, yy - cy
        ang = np.arctan2(dy, dx)
        wob = 1 + 0.03 * np.sin(ang * 3 + r.random() * 6) + 0.02 * np.sin(ang * 7 + r.random() * 6)
        rad = np.sqrt(dx * dx + dy * dy) * wob
        edge = np.sqrt((xx - S / 2) ** 2 + (yy - S / 2) ** 2) / (S / 2)
        rings = 0.5 + 0.5 * np.sin(rad / (2.6 + 0.8 * (rad / S)) * 2 * np.pi)
        late = np.clip((rings - 0.65) * 4, 0, 1)
        n = fbm(S, S, 16, 120 + v)
        if v in (1, 2):
            early = np.array([0.86, 0.72, 0.50]); latec = np.array([0.66, 0.46, 0.26])
            heart = np.clip(1.2 - edge * 1.6, 0, 1)[..., None]
            col = early * (1 - late[..., None]) + latec * late[..., None]
            col = col * (1 - 0.25 * heart) + col * np.array([1.05, 0.85, 0.65]) * 0.25 * heart
        else:
            early = np.array([0.56, 0.55, 0.52]); latec = np.array([0.36, 0.35, 0.33])
            col = early * (1 - late[..., None]) + latec * late[..., None]
        col *= (0.85 + 0.25 * n)[..., None]
        # radial checks (drying cracks)
        nck = 3 if v != 1 else 1
        for _ in range(nck):
            a0 = r.random() * 2 * np.pi; ln = 0.3 + 0.6 * r.random()
            da = np.abs(((ang - a0 + np.pi) % (2 * np.pi)) - np.pi)
            crack = (da * rad < 1.4) & (edge > 1 - ln) & (edge < 0.97)
            col[crack] *= 0.25
            hgt[(v // 2) * S:(v // 2 + 1) * S, (v % 2) * S:(v % 2 + 1) * S][crack] -= 0.6
        if v == 2:
            # axe scars: short straight cuts in random directions, dark lines with a light edge
            for _ in range(70):
                px, py = r.normal(S / 2, S / 5, 2)
                a = r.random() * np.pi; L = 14 + 30 * r.random()
                t = np.linspace(-L / 2, L / 2, int(L * 2))
                lx = (px + np.cos(a) * t).astype(int); ly = (py + np.sin(a) * t).astype(int)
                ok = (lx > 1) & (lx < S - 2) & (ly > 1) & (ly < S - 2)
                lx, ly = lx[ok], ly[ok]
                col[ly, lx] *= 0.35
                ox, oy = int(round(-np.sin(a))), int(round(np.cos(a)))
                col[np.clip(ly + oy, 0, S - 1), np.clip(lx + ox, 0, S - 1)] *= 1.18
            # grime + darker centre from years of use
            col *= (0.75 + 0.35 * edge)[..., None] ** 0.5
            col = col * 0.8 + col * np.array([0.9, 0.85, 0.8]) * 0.2
        if v == 3:
            # porch post top: grey and green-stained
            col = col * 0.85 + np.array([0.3, 0.36, 0.25]) * 0.15 * fbm(S, S, 30, 130)[..., None]
        # saw marks: faint parallel arcs
        if v in (0, 1, 3):
            arc = 0.5 + 0.5 * np.sin((xx * 0.9 + 0.002 * (yy - S / 2) ** 2) * 0.9)
            col *= (0.94 + 0.06 * arc)[..., None]
        # bark / outer rim
        if v in (1, 2):
            rim = edge > 0.9
            bk = bark[(yy.astype(int) * 3) % bark.shape[0], (xx.astype(int) * 3) % bark.shape[1]]
            col[rim] = bk[rim] * 0.9
            col[(edge > 0.86) & (edge <= 0.9)] *= 0.75  # cambium line
        else:
            col[edge > 0.92] *= 0.6
        col[edge > 1.0] = col[edge > 1.0] * 0.0 + 0.2
        oy, ox = (v // 2) * S, (v % 2) * S
        atlas[oy:oy + S, ox:ox + S] = col
        hgt[oy:oy + S, ox:ox + S] += late * 0.25 + n * 0.3
    atlas = quant(np.clip(atlas, 0, 1), 32, seed=14)
    nor = pix.normal_from_height(pix.blur(hgt, 0.7, wrap=False), strength=2.0, wrap=False)
    save("endgrain", atlas, [1.0, 1.0], nor, note="procedural rings + bark_spruce rim")


def t_woodchips():
    p = Photo("wood_chips", 512, 512, res="1k", flat=0.5, ao=0.5)
    rgb = grade(p.rgb, sat=0.9, val=1.15)
    rgb = quant(np.clip(rgb, 0, 1), 22, seed=15)
    # alpha: an irregular patch (decal) fading to transparent at the edges, hard-cut (alphaTest)
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.sqrt((xx - S / 2) ** 2 + (yy - S / 2) ** 2) / (S / 2)
    n = fbm(S, S, 48, 151)
    a = ((d + (n - 0.5) * 0.7) < 0.8).astype(np.float32)
    rgb = pix.bleed(rgb, a)
    save("woodchips", rgb, [2.0, 2.0], p.nor, alpha=a, note="wood_chips decal")


def t_blanket():
    """red and black buffalo-check wool from the herringbone weave photo"""
    p = Photo("poly_wool_herringbone", 70, 70, res="1k", flat=0.6, ao=0.3)
    W = H = 256  # 1 m tile
    weave = tile_to(pix.luminance(p.rgb), W, H)
    weave = (weave - weave.mean()) / (weave.std() + 1e-6)
    yy, xx = np.mgrid[0:H, 0:W]
    cell = 32  # 12.5 cm checks
    a = ((xx // cell) % 2).astype(np.float32); b = ((yy // cell) % 2).astype(np.float32)
    red = np.array([0.55, 0.07, 0.06]); black = np.array([0.06, 0.04, 0.045]); mid = np.array([0.27, 0.035, 0.04])
    col = np.where((a + b)[..., None] == 0, red, np.where((a + b)[..., None] == 2, black, mid))
    col = col * (1 + 0.16 * weave[..., None])
    fuzz = vnoise(W, H, 3, 160)
    col *= (0.92 + 0.12 * fuzz)[..., None]
    # a cream border stripe near one edge of the blanket (v ~ 0.05)
    stripe = (yy > 6) & (yy < 12)
    col[stripe] = np.array([0.72, 0.66, 0.52]) * (1 + 0.12 * weave[stripe][..., None])
    col = quant(np.clip(col, 0, 1), 14, seed=16, despeckle=0)
    save("blanket", col, [1.0, 1.0], tile_to(p.nor, W, H), note="poly_wool_herringbone, buffalo check")
    # grey wool (sleeping bag, jacket lining)
    g = np.array([0.36, 0.34, 0.31]) * (1 + 0.2 * weave[..., None])
    g = quant(np.clip(g, 0, 1), 10, seed=17, despeckle=0)
    save("wool_grey", g, [1.0, 1.0], tile_to(p.nor, W, H), note="poly_wool_herringbone grey")


def t_siding():
    """store siding: weathered lap siding with faded barn-red paint peeling to grey wood; and cream trim boards"""
    p = Photo("weathered_plank_siding", 402, 402, res="2k", flat=0.5, ao=0.6)
    W = H = 402
    lum = p.lum[..., None]
    wood = lum * np.array([0.62, 0.58, 0.54]) / 0.4
    n1 = fbm(W, H, 60, 171) * 0.6 + anoise(W, H, 30, 4, 179) * 0.4; n2 = anoise(W, H, 8, 2, 172)
    peel = np.clip((n1 * 0.8 + n2 * 0.35 - 0.64) * 8, 0, 1)[..., None]
    paint = np.array([0.50, 0.13, 0.09]) * (0.7 + 0.6 * lum) * (0.9 + 0.2 * fbm(W, H, 100, 173)[..., None])
    chalk = fbm(W, H, 120, 174)[..., None]
    paint = paint * (1 - 0.3 * chalk) + np.array([0.62, 0.42, 0.38]) * 0.3 * chalk  # chalky fade
    rgb = (paint * (1 - peel) + wood * peel) * (0.55 + 0.45 * p.ao[..., None] ** 1.5)
    # drips of rust/dirt below
    rgb = quant(np.clip(rgb, 0, 1), 26, seed=18)
    save("siding_red", rgb, [1.57, 1.57], p.nor, note="weathered_plank_siding painted red")
    q = Photo("weathered_planks", 512, 512, res="2k", flat=0.5, ao=0.5)
    lum2 = q.lum[..., None]
    wood2 = lum2 * np.array([0.6, 0.57, 0.53]) / 0.4
    n3 = fbm(512, 512, 60, 175) * 0.6 + anoise(512, 512, 4, 30, 178) * 0.4; n4 = anoise(512, 512, 2, 8, 176)
    peel2 = np.clip((n3 * 0.8 + n4 * 0.35 - 0.66) * 8, 0, 1)[..., None]
    cream = np.array([0.80, 0.74, 0.60]) * (0.75 + 0.45 * lum2)
    rgb2 = (cream * (1 - peel2) + wood2 * peel2) * (0.6 + 0.4 * q.ao[..., None] ** 1.5)
    rgb2 = quant(np.clip(rgb2, 0, 1), 22, seed=19)
    save("trim_cream", rgb2, [2.0, 2.0], q.nor, note="weathered_planks painted cream")
    # green-painted boards (store interior wainscot, shelves' fronts)
    green = np.array([0.20, 0.30, 0.22]) * (0.75 + 0.5 * lum2)
    rgb3 = green * (1 - peel2 * 0.7) + wood2 * peel2 * 0.7
    rgb3 = quant(np.clip(rgb3, 0, 1), 22, seed=20)
    save("boards_green", rgb3, [2.0, 2.0], q.nor, note="weathered_planks painted green")


def t_glass():
    """grimy window glass: RGBA; colour = dirt, alpha = how much dirt (the material adds base transparency)"""
    S = 128  # 0.5 m tile
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    n = fbm(S, S, 24, 181)
    streak = vnoise(S, S, 3, 182)
    streak = np.repeat(streak[:1], S, 0) * 0.5 + vnoise(S, S, 8, 183) * 0.5
    a = np.clip(0.18 + (n - 0.5) * 0.5 + (streak - 0.5) * 0.25, 0, 1)
    col = np.zeros((S, S, 3), np.float32) + np.array([0.42, 0.40, 0.33])
    col *= (0.8 + 0.4 * n)[..., None]
    spots = vnoise(S, S, 2, 184) > 0.93
    a[spots] = 0.75; col[spots] = np.array([0.25, 0.22, 0.17])
    a = np.round(a * 6) / 6  # pixel-art steps
    save("glass_grime", np.clip(col, 0, 1), [0.5, 0.5], None, alpha=a, note="procedural")


def t_rope():
    """manila rope twist / twine (tile 0.1 m along u x one wrap along v)"""
    W, H = 64, 32
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    s = np.sin((xx / W * 4 + yy / H) * 2 * np.pi)
    col = np.array([0.66, 0.52, 0.30]) * (0.65 + 0.35 * (s[..., None] * 0.5 + 0.5))
    col *= (0.9 + 0.2 * vnoise(W, H, 2, 190))[..., None]
    col[s < -0.85] *= 0.55
    col = quant(np.clip(col, 0, 1), 8, seed=21, despeckle=0)
    save("rope", col, [0.1, 0.05], None, note="procedural")


ALL = {
    "log_ext": t_log_ext, "log_int": t_log_int, "chink": t_chink, "floor": t_floor, "planks_grey": t_planks_grey,
    "board": t_board, "stone": t_stone, "iron": t_iron, "corrugated": t_corrugated, "shakes": t_shakes,
    "endgrain": t_endgrain, "woodchips": t_woodchips, "blanket": t_blanket, "siding": t_siding, "glass": t_glass,
    "rope": t_rope,
}


def main(argv):
    names = argv or list(ALL)
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, "index.json")
    if os.path.exists(idx_path):
        old = json.load(open(idx_path))
        INDEX.update(old.get("textures", {}))
        CREDITS.update(old.get("sources", {}))
    for n in names:
        print(n)
        ALL[n]()
    json.dump({"density": DENS, "textures": INDEX, "sources": CREDITS}, open(idx_path, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main(sys.argv[1:])
