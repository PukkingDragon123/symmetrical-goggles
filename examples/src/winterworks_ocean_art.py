#!/usr/bin/env python3
"""Winterworks pixel art for Tides & Treasures (mods/winterworks/docs/OCEAN_UPDATE.md).

    python examples/src/winterworks_ocean_art.py                  # write all PNGs, .mcmeta and particle jsons
    python examples/src/winterworks_ocean_art.py --preview DIR    # also write contact sheets to DIR

Sizes follow the update's rules: blocks that sit beside vanilla's own sand and stone (Ash Sand and the ashstone set)
are 16 x 16 in vanilla's style; the special new blocks (barnacles, whale flesh and hide, the Angler Light) are
32 x 32; item icons are vanilla-style 16 x 16 sprites (dark hue-shifted outline, light from the top-left); particles
are 16 x 16 frame sequences; the Turtle Shell leggings and boots are vanilla 64 x 32 armour layers.

Block textures tile evenly: every noise, cell and stroke field here is periodic over the tile, features are spread
on jittered grids, and `clean` merges every patch of one tone smaller than four pixels into its neighbours, so a
block face has no lone specks, no little clusters of two or three dots and no standout spot. Tone runs on hand-picked
hue-shifted ramps (dark -> light): shadows lean cool, lights lean warm, only glows are saturated.

Items are hand-placed ASCII grids (one character per pixel, '.' transparent) on semantic palettes, so the raw and
cooked fish share one drawing. Every eye is round: a round iris and pupil with a catch-light.

Animated textures are vertical frame strips + `<png>.mcmeta`. Particles are frame sequences `<name>_<i>.png`
(frame 0 = birth, for `setSpriteFromAge`) plus `particles/<name>.json`. The 3D pieces (the vent, tube worms, horn
stand, lure, eye, cannon, shell armour) are lowpix specs in this folder; their textures come from those exports.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from obsidian_kit import in_disc, paint_iris  # noqa: E402  (the shared round-eye generator)
from winterworks_art import ASSETS, checker, draw, parse  # noqa: E402  (no side effects)
# the End art's periodic noise, cells, light and shape helpers (importing it builds its textures in memory only)
from winterworks_end_art import (  # noqa: E402
    bezier, bond, bevel_steps, blank, ca, carve, crack_path, dilate, down, erode, fbm, jitter_points, lit, pnoise,
    poly_px, puff_frame, quant, ramp, rgba, rng_for, sd_circle, sd_ellipse, sd_segment, seed, shift, smin, ss_coords,
    voronoi)

OUT: dict[str, Image.Image] = {}      # relative path -> image
JSON: dict[str, dict] = {}            # relative path -> json body
ANIM: dict[str, list] = {}            # relative path -> frames in play order (for the preview strips)
TILES: set[str] = set()               # textures that must tile (the preview shows them 3 x 3)


# ====================================================================== output helpers
def to_img(A):
    return Image.fromarray(np.ascontiguousarray(A), "RGBA")


def put(path, im):
    OUT[path] = im if isinstance(im, Image.Image) else to_img(im)


def block(name, A, tiles=True):
    put(f"textures/block/{name}.png", A)
    if tiles:
        TILES.add(f"textures/block/{name}.png")


def animated(path, frames, frametime=3, interpolate=False, tiles=True):
    """Frames stacked vertically + <path>.mcmeta (vanilla texture animation)."""
    ims = [to_img(f) if isinstance(f, np.ndarray) else f for f in frames]
    w, h = ims[0].size
    strip = Image.new("RGBA", (w, h * len(ims)), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        strip.paste(im, (0, i * h))
    put(path, strip)
    body = {"frametime": frametime}
    if interpolate:
        body["interpolate"] = True
    JSON[path + ".mcmeta"] = {"animation": body}
    ANIM[path] = ims
    if tiles:
        TILES.add(path)


def particle(name, frames):
    for i, f in enumerate(frames):
        put(f"textures/particle/{name}_{i}.png", f)
    JSON[f"particles/{name}.json"] = {"textures": [f"winterworks:{name}_{i}" for i in range(len(frames))]}


def paint(I, rmp):
    """Index map -> RGBA (index -1 = transparent)."""
    out = np.zeros(I.shape + (4,), np.uint8)
    m = I >= 0
    out[m] = rmp[np.clip(I[m], 0, len(rmp) - 1)]
    return out


# ====================================================================== even tiling: no specks, no little clusters
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))


def components(I, wrap=True, diag=False):
    """Label patches of equal value (4-connected, or 8-connected with `diag`). Returns (labels, sizes)."""
    h, w = I.shape
    steps = N8 if diag else N4
    lab = np.full((h, w), -1, int)
    sizes = []
    for y0 in range(h):
        for x0 in range(w):
            if lab[y0, x0] >= 0:
                continue
            k = len(sizes)
            v = I[y0, x0]
            stack = [(y0, x0)]
            lab[y0, x0] = k
            n = 0
            while stack:
                y, x = stack.pop()
                n += 1
                for dy, dx in steps:
                    yy, xx = y + dy, x + dx
                    if wrap:
                        yy, xx = yy % h, xx % w
                    elif not (0 <= yy < h and 0 <= xx < w):
                        continue
                    if lab[yy, xx] < 0 and I[yy, xx] == v:
                        lab[yy, xx] = k
                        stack.append((yy, xx))
            sizes.append(n)
    return lab, np.array(sizes)


def clean(I, min_size=4, wrap=True, keep=None, passes=8):
    """Merge every patch of one tone smaller than `min_size` pixels into the neighbouring tone closest to its own
    (ties: the commoner one). `keep` (bool mask) protects pixels (grooves, mortar). Repeats until stable."""
    I = I.copy()
    h, w = I.shape
    for _ in range(passes):
        lab, sizes = components(I, wrap)
        small = np.where(sizes < min_size)[0]
        changed = False
        for k in small:
            ys, xs = np.nonzero(lab == k)
            if keep is not None and keep[ys, xs].any():
                continue
            v = I[ys[0], xs[0]]
            nb, nb_kept = {}, {}
            for y, x in zip(ys, xs):
                for dy, dx in N4:
                    yy, xx = y + dy, x + dx
                    if wrap:
                        yy, xx = yy % h, xx % w
                    elif not (0 <= yy < h and 0 <= xx < w):
                        continue
                    if lab[yy, xx] != k:
                        d_ = nb if (keep is None or not keep[yy, xx]) else nb_kept
                        d_[I[yy, xx]] = d_.get(I[yy, xx], 0) + 1
            nb = nb or nb_kept          # walled in by protected pixels: join one of them
            if not nb:
                continue
            best = min(nb, key=lambda c: (abs(int(c) - int(v)), -nb[c]))
            I[ys, xs] = best
            changed = True
        if not changed:
            break
    return I


def smallest_patch(I, wrap=True, keep=None):
    """The size of the smallest one-colour patch, counting diagonal neighbours (a diagonal line reads as a line)."""
    lab, sizes = components(I, wrap, diag=True)
    if keep is not None:
        sizes = np.array([s if not keep[lab == k].any() else 99 for k, s in enumerate(sizes)])
    return int(sizes.min())


def anisotropic(w, h, cx, cy, sd, octaves=2, gain=0.5):
    """Periodic noise with cx x cy lattice cells (cx < cy: streaks along x), octaves doubling both."""
    tot, amp = np.zeros((h, w)), 1.0
    for o in range(octaves):
        tot += amp * pnoise(w, h, max(1, min(w, cx * 2 ** o)), max(1, min(h, cy * 2 ** o)), sd + 131 * o)
        amp *= gain
    tot -= tot.min()
    return tot / max(tot.max(), 1e-9)


# ====================================================================== ramps (dark -> light)
# Ash sand: grey volcanic sand, the dust colour 0x5E5A57 in the middle; shadows lean blue-violet, lights warm.
ASH = ramp("#38363b", "#423f44", "#4c494c", "#565253", "#5e5a57", "#68635f", "#726d67", "#7e7870", "#8a847b")
# Ashstone: dark welded volcanic stone, a cousin of tuff and deepslate: blue-slate shadows, warm grey lights.
ASHSTONE = ramp("#1b1b21", "#222228", "#2a2a30", "#323238", "#3a3a3f", "#434247", "#4d4b4f", "#575459", "#625e61",
                "#6f6a6b")
# Barnacles: chalky grey-white plates; their mouths dark slate, the rock under them dark grey-brown.
BARN = ramp("#2a2a33", "#3d3e47", "#53545c", "#6b6c72", "#85858a", "#9e9d9f", "#b6b4b2", "#cbc8c2", "#ddd9d0",
            "#ece8de")
ROCK = ramp("#16161b", "#1e1e24", "#27272d", "#303037", "#3a3a40")
# Whale flesh: pink-red muscle, wet and a little glossy; shadows lean plum, lights lean coral cream.
FLESH = ramp("#3e1024", "#561731", "#71203d", "#8c2c48", "#a63b53", "#bd4f5f", "#d0676f", "#df8584", "#eba79f",
              "#f6cec2")
# Whale hide: dark blue-grey leather.
HIDE = ramp("#0f131b", "#151a24", "#1c222e", "#232b38", "#2b3443", "#343e4f", "#3f4a5c", "#4b576a", "#5a677a")
# The Angler Light: bioluminescent cyan-white, deep teal membranes.
GLOW = ramp("#0a2f3e", "#0d4454", "#115c6c", "#167786", "#1f94a0", "#33b2b9", "#56cdcd", "#86e3dd", "#b8f3ea",
            "#e6fff9")


# ====================================================================== Ash Sand (16 x 16, vanilla style)
def ash_sand():
    """Fine grey volcanic sand: even grain in small clusters over a faint drift, a little darker glassy grit."""
    n = 16
    D = fbm(n, n, 2, seed("ash_sand", "drift"), 2)
    G = pnoise(n, n, 8, 8, seed("ash_sand", "grain"))
    G2 = pnoise(n, n, 16, 16, seed("ash_sand", "grit"))
    T = 4.2 + (D - 0.5) * 1.2 + (G - 0.5) * 3.6 + (G2 - 0.5) * 2.0
    I = clean(quant(T, len(ASH), 1, 7), 4)
    block("ash_sand", paint(I, ASH))


# ====================================================================== the ashstone set (16 x 16)
def ashstone_matrix(name, n=16, base=4.4, amount=1.0):
    """The welded-ash matrix: soft even grain, lit from the top-left."""
    B = fbm(n, n, 4, seed(name, "blobs"), 2)
    G = pnoise(n, n, 8, 8, seed(name, "grain"))
    H = B * 0.6 + G * 0.4
    return base + ((H - 0.5) * 2.4 + lit(H * 2.4, 1.0) * 1.6) * amount


def fiamme(name, n=16, nx=2, ny=4, rx=(2.6, 3.6), ry=(0.75, 0.95)):
    """Flattened pumice lenses (the dark streaks of welded tuff) on a jittered grid: a mask and a lit under-lip."""
    r = rng_for(name, "fiamme")
    ss = 4
    X, Y = ss_coords(n, n, ss)
    M = np.zeros(X.shape, bool)
    for k, (cx, cy) in enumerate(jitter_points(n, n, nx, ny, r, 0.7)):
        cx += (k // nx % 2) * (n / nx / 2)
        a, b = r.uniform(*rx), r.uniform(*ry)
        tilt = r.uniform(-0.12, 0.12)
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                M |= sd_ellipse(X, Y, cx + ox, cy + oy, a, b, tilt) < 0
    m = down(M.astype(float), ss) > 0.45
    lip = shift(m, 0, 1, wrap=True) & ~m
    return m, lip


def ashstone():
    """Dark welded volcanic stone: an even grey matrix streaked with dark flattened pumice lenses."""
    T = ashstone_matrix("ashstone")
    m, lip = fiamme("ashstone")
    T = np.where(m, 2.2, T)
    T = np.where(lip, T + 1.4, T)
    I = clean(quant(T, len(ASHSTONE), 1, 8), 4)
    block("ashstone", paint(I, ASHSTONE))


def polished_ashstone():
    """One smooth slab per face: a lit top-left rim, a shaded bottom-right rim, a faint calm cloud inside."""
    n = 16
    C = fbm(n, n, 2, seed("polished_ashstone", "cloud"), 2)
    T = 4.6 + (C - 0.5) * 1.8
    m, _ = fiamme("polished_ashstone", nx=2, ny=3, rx=(2.0, 2.8), ry=(0.6, 0.8))
    T = np.where(m, T - 0.9, T)
    yy, xx = np.mgrid[0:n, 0:n]
    T = np.where((yy == 0) | (xx == 0), 6.6, T)
    T = np.where((yy == n - 1) | (xx == n - 1), 2.0, T)
    rim = (yy == 0) | (xx == 0) | (yy == n - 1) | (xx == n - 1)
    I = quant(T, len(ASHSTONE), 1, 8)
    I = clean(I, 5, keep=rim)
    block("polished_ashstone", paint(I, ASHSTONE))


# rows of 4 px bricks; no two rows put their joints within 2 px of each other
ASH_BRICKS = [(0, 4, [0, 9]), (4, 4, [4, 12]), (8, 4, [1, 8]), (12, 4, [5, 13])]


def brick_tones(name, rows, n=16, base=4.6, spread=0.45):
    lab, U, V, BW, BH = bond(n, n, rows)
    r = rng_for(name, "bricks")
    off, mortar = bevel_steps(U, V, BW, BH, hi=(+1.6,), lo=(-1.0,))
    T = ashstone_matrix(name, n, base, 0.7)
    for k in range(lab.max() + 1):
        T[lab == k] += r.uniform(-spread, spread)
    T = T + off
    T = np.where(mortar, 1.2, T)
    return T, mortar


def ashstone_bricks():
    T, mortar = brick_tones("ashstone_bricks", ASH_BRICKS)
    I = quant(T, len(ASHSTONE), 1, 8)
    I = clean(I, 4, keep=mortar)
    block("ashstone_bricks", paint(I, ASHSTONE))


def wrapping_crack(r, x0, total, n=16, steps=(1, 2, 3)):
    """A slanting crack down the tile: each row it runs a few texels sideways (a staircase), and over the n rows it
    travels `total` texels (a multiple of n), so it leaves the tile exactly where its copy enters: it tiles."""
    runs = [int(r.choice(steps)) for _ in range(n)]
    want = abs(total)
    while sum(runs) != want:                    # nudge random rows until the runs add up
        i = int(r.integers(n))
        if sum(runs) < want and runs[i] < max(steps):
            runs[i] += 1
        elif sum(runs) > want and runs[i] > min(steps):
            runs[i] -= 1
    sgn = 1 if total > 0 else -1
    pix, x = [], x0
    for y, run in enumerate(runs):
        for k in range(max(run, 1)):
            pix.append((x + sgn * k, y))
        x += sgn * run
    return pix


def cracked_ashstone_bricks():
    """The same bricks split by two long hairline cracks that slant down through bricks and mortar alike, crossing
    once, so the cracking is spread evenly and joins up from block to block (each brick face holds a staircase of
    several texels, never a dot)."""
    n = 16
    T, mortar = brick_tones("ashstone_bricks", ASH_BRICKS)
    r = rng_for("cracked_ashstone_bricks", "cracks")
    groove = np.zeros((n, n), bool)
    for x0, total, steps in ((1, 32, (1, 2, 3)), (12, -16, (0, 1, 2))):
        for x, y in wrapping_crack(r, x0, total, n, steps):
            groove[y % n, x % n] = True
    lit_w = shift(groove, 0, 1, wrap=True) & ~groove & ~mortar
    T = np.where(groove, np.minimum(T, 1.6), T)
    T = np.where(lit_w, T + 0.9, T)
    I = quant(T, len(ASHSTONE), 1, 8)
    I = clean(I, 4, keep=mortar | groove)
    block("cracked_ashstone_bricks", paint(I, ASHSTONE))


# Chiseled side: a polished slab with a squared spiral wave (a meander, the old sea motif) carved across the whole
# panel. 'g' = groove, 'l' = the groove's lit far wall, '.' = the slab.
CHISEL_SIDE = """
................
.gggggggggggggg.
.g............l.
.g.gggggggggg.l.
.g.g........l.l.
.g.g.gggggg.l.l.
.g.g.g....l.l.l.
.g.g.g.gg.l.l.l.
.g.g.g.gl.l.l.l.
.g.g.g..l.l.l.l.
.g.g.gggl.l.l.l.
.g.g......l.l.l.
.g.gggggggl.l.l.
.g..........l.l.
.glllllllllll.l.
................
"""


def slab(name, n=16):
    C = fbm(n, n, 2, seed(name, "cloud"), 2)
    T = 4.6 + (C - 0.5) * 1.2
    yy, xx = np.mgrid[0:n, 0:n]
    T = np.where((yy == 0) | (xx == 0), 6.6, T)
    T = np.where((yy == n - 1) | (xx == n - 1), 2.0, T)
    keep = (yy == 0) | (xx == 0) | (yy == n - 1) | (xx == n - 1)
    return T, keep


def chiseled_ashstone():
    n = 16
    T, keep = slab("chiseled_ashstone")
    for y, row in enumerate(parse(CHISEL_SIDE)):
        for x, ch in enumerate(row):
            if ch == "g":
                T[y, x] = 1.6
            elif ch == "l":
                T[y, x] = 6.2
            if ch != ".":
                keep[y, x] = True
    I = clean(quant(T, len(ASHSTONE), 1, 8), 5, keep=keep)
    block("chiseled_ashstone", paint(I, ASHSTONE))
    # the top: a round groove and a round raised boss in the middle, lit from the top-left
    T, keep = slab("chiseled_ashstone_top")
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    d = np.hypot(xx - 8, yy - 8)
    groove = (d > 5.0) & (d < 6.1)
    boss = d < 2.9
    lit_w = (shift(groove, 1, 0) | shift(groove, 0, 1)) & ~groove
    shd_w = (shift(groove, -1, 0) | shift(groove, 0, -1)) & ~groove & ~lit_w
    T = np.where(groove, 1.6, T)
    T = np.where(lit_w, 6.0, T)
    T = np.where(shd_w, 3.2, T)
    blit = boss & ((xx - 8) + (yy - 8) < -1.6)
    bshd = boss & ((xx - 8) + (yy - 8) > 1.6)
    T = np.where(boss, np.where(blit, 6.4, np.where(bshd, 3.0, 5.0)), T)
    ring_out = dilate(boss) & ~boss
    T = np.where(ring_out & ((xx - 8) + (yy - 8) > 0), 2.0, T)
    keep |= groove | lit_w | shd_w | boss | ring_out
    I = clean(quant(T, len(ASHSTONE), 1, 8), 5, keep=keep)
    I = clean(I, 3)
    block("chiseled_ashstone_top", paint(I, ASHSTONE))


# ====================================================================== Barnacles (32 x 32)
def barnacles():
    """Crusty barnacle cones packed over dark rock: chalky plated walls lit from the top-left (bright up-left flank,
    shaded down-right flank), a pale rim round a dark slit of a mouth; big cones on a jittered 3 x 3 grid with small
    ones in the gaps, so the crust is even everywhere."""
    n = 32
    r = rng_for("barnacles", "cones")
    cones = [(x, y, r.uniform(5.6, 6.4), 1.0) for x, y in jitter_points(n, n, 3, 3, r, 0.35)]
    small = rng_for("barnacles", "small")
    cones += [((x + n / 6) % n, (y + n / 6) % n, small.uniform(3.4, 4.0), 0.7)
              for x, y in jitter_points(n, n, 3, 3, small, 0.3)]
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    best = np.full((n, n), -9.0)
    T = np.zeros((n, n))
    MOUTH = np.zeros((n, n), bool)
    for k, (cx, cy, rad, hgt) in enumerate(cones):
        dx = (xx - cx + n / 2) % n - n / 2
        dy = (yy - cy + n / 2) % n - n / 2
        d = np.hypot(dx, dy)
        t = d / rad
        h = (1.0 - t) * hgt * 3.0
        win = (t < 1.0) & (h > best)
        ang = np.arctan2(dy, dx)
        facing = -(dx + dy) / np.maximum(d, 1e-6) / math.sqrt(2)          # +1 on the up-left flank
        seam = np.cos((ang + k) * 3.0) > 0.94                              # six plate seams
        tone = 4.4 + facing * 2.0 * np.clip(t * 1.6, 0, 1) - (t > 0.8) * 1.2 - seam * (t > 0.5) * 1.0
        rim = (t > 0.34) & (t < 0.52)
        tone = np.where(rim, 6.8 + facing * 1.0, tone)
        u = (dx * math.cos(k * 1.3) + dy * math.sin(k * 1.3)) / rad
        v = (-dx * math.sin(k * 1.3) + dy * math.cos(k * 1.3)) / rad
        mouth = (u / 0.36) ** 2 + (v / 0.22) ** 2 < 1.0
        tone = np.where(mouth, 1.0, tone)
        T = np.where(win, tone, T)
        MOUTH = np.where(win, mouth, MOUTH)
        best = np.where(win, h, best)
    shell = best > -9.0
    I = quant(T, len(BARN), 1, 9)
    lip = shift(MOUTH, 0, 1, wrap=True) & ~MOUTH & shell
    I = np.where(lip, np.minimum(I, 3), I)
    R = fbm(n, n, 4, seed("barnacles", "rock"), 2)
    RI = quant(1.5 + (R - 0.5) * 2.0, len(ROCK), 0, 4)
    I = np.where(shell, I, 10 + RI)
    I = clean(I, 4)
    rmp = np.concatenate([BARN, ROCK])
    block("barnacles", paint(I, rmp))


# ====================================================================== Whale flesh and hide (32 x 32)
def whale_flesh():
    """Wet pink-red muscle: soft wavy fibre bands over gentle folds, a glossy sheen running along the lit ridges."""
    n = 32
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    warp = (fbm(n, n, 2, seed("whale_flesh", "warp"), 2) - 0.5) * 7.0
    fib = np.sin((yy + warp) * 2 * math.pi / 6.4)          # 5 fibre bands per tile, so the tile wraps
    folds = fbm(n, n, 3, seed("whale_flesh", "folds"), 2)
    H = fib * 0.45 + folds * 1.6
    L = lit(H * 2.0, 1.0)
    T = 5.0 + L * 3.6 + (folds - 0.5) * 2.2
    I = quant(T, len(FLESH), 2, 8)
    gloss = (L > 0.40) & (fib > 0.1)
    I = np.where(gloss, 9, I)
    I = clean(I, 4)
    block("whale_flesh", paint(I, FLESH))


def whale_hide():
    """Dark blue-grey whale leather: soft mottling crossed by long, shallow, wavy creases (each a dark line with a
    lit lip under it), mostly running across the hide."""
    n = 32
    N = anisotropic(n, n, 2, 4, seed("whale_hide", "creases"), 2, 0.4)
    bands = N * 6.0
    crease = np.abs(bands - np.round(bands)) < 0.11
    crease &= (np.round(bands) > 0) & (np.round(bands) < 6)
    M = fbm(n, n, 3, seed("whale_hide", "mottle"), 2)
    T = 4.0 + (M - 0.5) * 2.4 + lit(M * 2.0, 1.0) * 1.6
    T = np.where(crease, T - 1.8, T)
    lip = shift(crease, 0, 1, wrap=True) & ~crease
    T = np.where(lip, T + 1.0, T)
    I = quant(T, len(HIDE), 1, 8)
    I = clean(I, 4)
    block("whale_hide", paint(I, HIDE))


# ====================================================================== the Angler Light (32 x 32, pulsing)
ANGLER_FRAMES = 8


def angler_light():
    """A wall of bioluminescent globules: round cells of cyan-white light in fine teal membranes. The light breathes:
    eight frames (interpolated, 5 ticks each, a 2 s cycle) where each cell swells and dims a little out of step with
    its neighbours, so a slow wave of light rolls over the block."""
    n = 32
    r = rng_for("angler_light", "cells")
    pts = jitter_points(n, n, 4, 4, r, 0.55)
    F1, F2, idx, DX, DY = voronoi(n, n, pts, wrap=True)
    phase = rng_for("angler_light", "phase").random(len(pts))
    edge = (F2 - F1) < 1.1
    frames = []
    for f in range(ANGLER_FRAMES):
        u = f / ANGLER_FRAMES
        pulse = np.sin(2 * math.pi * (u + phase[idx])) * 0.45 + np.sin(2 * math.pi * u) * 0.55
        rad = 5.2 + pulse * 0.6
        core = np.clip(1.0 - F1 / rad, 0, 1)
        tilt = -(DX + DY) / 8.0 * 0.8                     # each globule lit from its own up-left
        T = 3.4 + core * 5.0 + tilt + pulse * 0.7
        I = quant(T, len(GLOW), 3, 9)
        I = clean(I, 4, keep=edge)
        I = np.where(edge, 1, I)
        I = clean(I, 4)
        frames.append(paint(I, GLOW))
    animated("textures/block/angler_light.png", frames, frametime=5, interpolate=True)


ash_sand()
ashstone()
polished_ashstone()
ashstone_bricks()
cracked_ashstone_bricks()
chiseled_ashstone()
barnacles()
whale_flesh()
whale_hide()
angler_light()


# ====================================================================== items (16 x 16, vanilla style)
# Hand-placed grids, '.' transparent, a dark hue-shifted outline, light from the top-left. Raw and cooked fish share
# one drawing on two palettes. Eyes are round: a round iris ring, a round pupil and a catch-light.
def item_img(name, im):
    put(f"textures/item/{name}.png", im)


def icon(name, palette, grid):
    item_img(name, draw(parse(grid), {".": None, **palette}, (16, 16), name))


# ---------------------------------------- anglerfish (raw / cooked share the drawing)
ANGLER = """
...s s... .... ....
..s. .s.. .... ....
.gg. ..s. .... ....
gWLg ..s. .... ....
gLLg .ooo ooo. .ooo
.gg. o334 4332 oo2o
...o 344i i433 22o.
..o3 44iw Ei33 221o
.o34 44iE Ei32 211o
otmt mt3i i322 21o.
omMM Mmo3 2222 11o.
otmt mto2 2221 111o
.obb bbb1 1111 o21o
..oo oooo oooo .oo.
.... .... .... ....
.... .... .... ....
"""
RAW = {"o": "#17131b", "1": "#2e2632", "2": "#433845", "3": "#5c4e5a", "4": "#786772", "b": "#8f7d84",
       "m": "#3a1220", "M": "#5c1c2c", "t": "#e6dfd2", "i": "#c8bd72", "E": "#120f16", "w": "#ffffff",
       "s": "#5c4e5a", "L": "#6fe0ea", "W": "#effffc", "g": "#249aab"}
COOKED = {"o": "#2a150c", "1": "#5c2f16", "2": "#7e451f", "3": "#a2622d", "4": "#c48543", "b": "#d8a865",
          "m": "#4a2412", "M": "#62321a", "t": "#efdfbd", "i": "#e9d8ae", "E": "#3a1f10", "w": "#fbf1df",
          "s": "#a2622d", "L": "#c99a58", "W": "#ead19c", "g": "#8b6334"}
icon("raw_anglerfish", RAW, ANGLER)
icon("cooked_anglerfish", COOKED, ANGLER)


# ---------------------------------------- lionfish (raw / cooked): digits 1..4 = shade, the
# stripes come from the column (bands two texels wide, leaning back); f = fin ray, F = fin membrane, s = spine tip
LION = """
.... .... .... ....
.... ..x. x.x. x...
.... .xmx mxmx ....
.... .xmx mxmx ....
.... x.x. x.x. ....
..oo oooo oooo o.o.
.o4i i444 4444 ooFo
o4iw Ei33 3333 3fFo
o3iE Ei33 3322 2ffo
.o3i i222 2222 1fFo
..o2 2222 1111 ooFo
...o FfFf FfFo .oo.
...o fFfF fFo. ....
.... oooo oo.. ....
.... .... .... ....
.... .... .... ....
"""


def lionfish(name, red, cream, fin, extra):
    rows = parse(LION)
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if ch in "1234":
                band = (x + (y - 8) // 4) % 3 != 0
                c = (red if band else cream)[int(ch) - 1]
            elif ch == "x":
                c = red[1] if y % 2 else cream[3]
            elif ch in "fFm":
                c = fin["fFm".index(ch)]
            else:
                c = extra[ch]
            px[x, y] = rgba(c)
    item_img(name, im)

lionfish("lionfish", ["#6e1a1c", "#922623", "#b5392c", "#d0553a"], ["#c9a48a", "#dcbca0", "#eed6bb", "#f8ebd8"],
         ["#b5392c", "#e7c8ae", "#f6e6d2"], {"o": "#2a0d10", "i": "#e0a23a", "E": "#140a0c", "w": "#ffffff"})
lionfish("cooked_lionfish", ["#6a3416", "#8a4a1f", "#a8642c", "#c2803f"], ["#c89a5e", "#d8ae70", "#e6c387", "#f2d9a6"],
         ["#a8642c", "#d8ae70", "#eccf98"], {"o": "#2c160b", "i": "#e8d6ae", "E": "#3a1f10", "w": "#fbf1df"})


# ---------------------------------------- the rest
GLOWP = {"o": "#0a2f3e", "2": "#1f94a0", "3": "#33b2b9", "4": "#56cdcd", "5": "#86e3dd", "6": "#b8f3ea",
         "W": "#f4fffd", "g": "#2aa8b8", "k": "#17131b", "a": "#433845", "A": "#5c4e5a"}
icon("angler_lure", GLOWP, """
.... .... .... ....
.... .... ...k kk..
.... .... ..kA aak.
.... .... .kAa kk..
.... ...k kAak ....
.... ..ka Aak. ....
.... .oaA ao.. ....
.... o56a 4o.. ....
...o 6WW5 43o. ....
..o6 WWW6 543o ....
..o6 WW66 543o ....
..o5 6665 432o ....
...o 5554 32o. ....
.... oo43 oo.. ....
.... .g.o .g.. ....
.... .W.. ..W. ....
""")

BUCKET = {"o": "#1e1c25", "d": "#33323d", "s": "#4a4954", "m": "#66656c", "l": "#87858a", "h": "#aba7a3",
          "G": "#dcd6cb", "1": "#1b3a6a", "2": "#24508c", "3": "#3268a8", "4": "#4f88c4",
          "a": "#2e2632", "A": "#5c4e5a", "L": "#7fe8f0", "W": "#ffffff", "t": "#e6dfd2"}
icon("anglerfish_bucket", BUCKET, """
.... .... .... ....
.... .ooo ooo. ....
.... o... ...o ....
...o .... .... o...
..oo oooo oooo oo..
.oGh hhhh hhhh hmo.
.ohm mmmm mmmm msdo
..ol 4444 4443 sdo.
..ol 4L44 4433 sdo.
..ol 3a43 3333 sdo.
...o laaA a333 so..
...o lata a322 so..
...o l322 2222 so..
...o mlmm mmms so..
.... oooo oooo o...
.... .... .... ....
""")

SHELL = {"o": "#1b2a14", "1": "#2d4620", "2": "#3c5f28", "3": "#4f7a31", "4": "#66963b", "5": "#84b14a",
         "y": "#b9a54e", "Y": "#dcc979", "e": "#d9cfa6", "E": "#f0e9cf"}
icon("turtle_shell_shard", SHELL, """
.... .... .... ....
.... .... .... ....
.... .ooo o... ....
.... o554 4oo. ....
...o 5544 4Y3o o...
..o5 5443 Y433 3o..
.o55 443Y 4433 32o.
.o54 43Y4 4333 22o.
.oYY Yy34 4333 21o.
.o43 3yYY Y332 21o.
..o3 33y3 3y22 1o..
..oE e333 2y21 o...
...o Eee2 21eo ....
.... ooeE eeo. ....
.... ..oo o... ....
.... .... .... ....
""")

SCALE = {"o": "#0e2628", "1": "#1d4746", "2": "#2b6660", "3": "#3c867a", "4": "#55a591", "5": "#78c3aa",
         "6": "#b3e5cf", "s": "#8a3d18", "S": "#c96d27", "T": "#f0a64c"}
icon("guardian_scale", SCALE, """
.... .... .... ....
.... ...o o... ....
.... ..oT To.. ....
.... ..oS so.. ....
..oo o6Ss s5oo o...
.o66 65Ss s554 4o..
o655 5444 4443 33o.
o544 4333 3333 22o.
o543 3222 2222 21o.
.o44 4444 4433 2o..
.o43 3333 3332 2o..
..o3 2222 2221 o...
..o3 3443 3321 o...
...o 3332 221o ....
.... o322 1o.. ....
.... .ooo o... ....
""")

TS = {"o": "#18260f", "1": "#2a421b", "2": "#3a5c25", "3": "#4c772f", "4": "#62933a", "5": "#80ae48",
      "y": "#b3a04a", "Y": "#d8c676", "p": "#cdbd86", "P": "#e9dcae"}
icon("turtle_shell_chestplate", TS, """
.... .... .... ....
.ooo o... ...o ooo.
o554 4o.. ..o4 435o
o544 3Yoo ooY3 342o
o443 Y4PP PP4Y 321o
.oo3 YPPP PPPY 3oo.
..o4 YPpP PpPY 2o..
..o4 YYYY YYYY 2o..
..o3 YPPp pPPY 2o..
..o3 YPpP PpPY 1o..
..o3 YYYY YYYY 1o..
..o3 YPPp pPPY 1o..
..o2 YPpP PpPY 1o..
..o2 3YYY YYY2 1o..
...o oooo oooo o...
.... .... .... ....
""")
icon("turtle_shell_leggings", TS, """
.... .... .... ....
..oo oooo oooo oo..
..oY YYYY YYYY Yo..
..o4 455Y Y543 2o..
..o4 54Y4 4Y32 2o..
..o4 4Y33 33Y2 1o..
..o3 Y3oo oo2Y 1o..
..o4 43o. .o32 1o..
..o4 32o. .o32 1o..
..oY Y2o. .oYY 1o..
..o4 32o. .o32 1o..
..o3 32o. .o21 1o..
..o3 21o. .o21 1o..
..oo ooo. .ooo oo..
.... .... .... ....
.... .... .... ....
""")
icon("turtle_shell_boots", TS, """
.... .... .... ....
.... .... .... ....
.... .... .... ....
..oo oooo ..oo oooo
..oY YYYo ..oY YYYo
..o4 432o ..o4 432o
..o4 321o ..o4 321o
..o4 321o ..o4 321o
.oo4 321o .oo4 321o
o554 321o o554 321o
o543 221o o543 221o
o433 211o o433 211o
.ooo oooo .ooo oooo
.... .... .... ....
.... .... .... ....
.... .... .... ....
""")


WORMS = {"o": "#2a1416", "r": "#8c1a22", "R": "#c8323a", "W": "#f08a86", "C": "#ece6da", "c": "#bdb3a4",
         "d": "#8e8476", "1": "#2c2b31", "2": "#45434b", "3": "#5e5b62"}
icon("tube_worms", WORMS, """
.... .... .... ....
...r .R.r .... ....
..R. rWr. R... ....
...r RWRr .... ....
.... rCcr .... ....
.... oCco .r.R .r..
.... odco ..rW Rr..
.r.R oCco R.rR Wr.R
R.rW roco .rCc r...
.rWr oCco ...o Cco.
..Cc odco ...o dco.
.oCc oCco ...o Cco.
.odc oCco ...o Cco.
o332 1233 3o32 321o
o122 1112 2111 211o
.ooo oooo oooo ooo.
""")

HORN = {"o": "#2a1810", "1": "#a58f72", "2": "#c9b494", "3": "#e4d4b4", "4": "#f5ecd8", "r": "#7a3518",
        "R": "#a54b22", "k": "#2a1a20", "n": "#c7c3d6", "N": "#f2f0fa", "p": "#d9b8c4", "b": "#6b4a1a",
        "B": "#a87b2c", "Y": "#dcb45a"}
icon("nautilus_horn", HORN, """
.... .... .... ....
.... .... .... ....
.... ..oo ooo. ....
.... oo4r 34ro o...
...o 43r4 3r33 No..
..o4 3r33 r33n kNo.
..o3 r3oo 33nk kNo.
oooo 3ok2 o3nk kpNo
oYBb o3o2 1onk kpNo
oBbb o3r1 1nkk pno.
oooo 2r21 1nkp no..
..o2 r21r 1npn o...
...o 21r1 1no. ....
.... oo11 oo.. ....
.... ..oo .... ....
.... .... .... ....
""")




def elder_eye():
    """A round eyeball: pale sclera lit from the top-left, a round amber iris, round pupil, catch-light."""
    n = 16
    rows = [["."] * n for _ in range(n)]
    cx = cy = 8.0
    for y in range(n):
        for x in range(n):
            if in_disc(x, y, cx, cy, 14):
                dx, dy = (x + 0.5 - cx) / 7, (y + 0.5 - cy) / 7
                t = -(dx + dy) * 0.7 - math.hypot(dx, dy) * 0.6
                rows[y][x] = "5" if t > 0.15 else "4" if t > -0.25 else "3" if t > -0.6 else "2" if t > -0.85 else "1"
            elif in_disc(x, y, cx, cy, 16):
                rows[y][x] = "o"
    # veins at the back of the eyeball (lower right), a pink rim of tissue
    for x, y in ((12, 11), (13, 10), (11, 12), (13, 6), (12, 13)):
        rows[y][x] = "v"
    paint_iris(rows, 8.6, 8.6, 8, 4, lambda x, y: True, ring="O", outer="i", body="I", lit="J", collar="J",
               hole="p", hole_edge="p", glint="W", soft="w", lid_shade=0)
    return ["".join(r) for r in rows]


EYEP = {"o": "#231a26", "1": "#6e6574", "2": "#948b97", "3": "#b7afb6", "4": "#d6d0d2", "5": "#efebe8",
        "v": "#b97a86", "O": "#5a2108", "i": "#a0420e", "I": "#d8701c", "J": "#f5ae3e", "p": "#120a0e",
        "W": "#ffffff", "w": "#ffe3b0"}
item_img("elder_guardian_eye", draw(elder_eye(), {".": None, **EYEP}, (16, 16), "eye"))


def dart():
    """A lionfish spine dart: a long banded spine from the fletching tuft (bottom-left) to the tip (top-right)."""
    n = 16
    rows = [["."] * n for _ in range(n)]
    for x in range(n):
        for y in range(n):
            s_ = x + y
            u = x - y            # along the shaft, -13 (base) .. 13 (tip)
            if 2 <= x <= 14 and 1 <= y <= 13 and s_ in (15, 16):
                if u >= 12 and s_ == 16:
                    continue
                band = ((u + 20) // 3) % 2
                rows[y][x] = ("C" if band else "R") if s_ == 15 else ("c" if band else "r")
    # the tuft of fin membrane at the base
    for x, y, ch in ((1, 12, "F"), (2, 12, "f"), (1, 13, "f"), (2, 14, "F"), (3, 13, "F"), (0, 13, "F"),
                     (1, 14, "F"), (3, 14, "f"), (2, 15, "F"), (0, 12, "f"), (1, 11, "F")):
        rows[y][x] = ch
    # outline
    out = [r[:] for r in rows]
    for y in range(n):
        for x in range(n):
            if rows[y][x] == "." and any(0 <= y + dy < n and 0 <= x + dx < n and rows[y + dy][x + dx] != "."
                                         for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = "o"
    out[0][15] = "W" if out[0][15] == "o" else out[0][15]
    return ["".join(r) for r in out]


DARTP = {"o": "#2a0d10", "R": "#c84a34", "r": "#8e2620", "C": "#f8ead6", "c": "#d9bfa4", "F": "#e8c3b0",
         "f": "#b5392c", "W": "#ffffff"}
item_img("lionfish_dart", draw(dart(), {".": None, **DARTP}, (16, 16), "dart"))


# ====================================================================== particles (16 x 16, frame 0 = birth)
# Smoke, spray, mist and bubbles carry alpha: draw them on the translucent particle sheet. Motes, notes and the
# bubble's glints are the brightest values; draw those three full-bright (light 15728880).
def alpha_of(A, a):
    A = A.copy()
    A[..., 3] = (A[..., 3].astype(float) * a).astype(np.uint8)
    return A


def put_px(A, x, y, c, a=1.0):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < A.shape[1] and 0 <= y < A.shape[0]:
        A[y, x] = ca(c, a)


def disc_px(A, cx, cy, r, c, a=1.0, keep=False):
    yy, xx = np.mgrid[0:A.shape[0], 0:A.shape[1]] + 0.5
    m = np.hypot(xx - cx, yy - cy) <= r
    if keep:
        m &= A[..., 3] == 0
    A[m] = ca(c, a)


SMOKE = ["#0c0a0b", "#161314", "#211c1c", "#2d2725", "#3b3330", "#4c433e"]


def vent_smoke():
    """A black-smoker plume: a dense knot of black water, hot at its heart for the first two frames, that billows,
    swells and thins out as it rises (6 frames)."""
    spec_ = [([(8, 9, 2.6), (8, 7, 2.0)], 0.95, 0.0), ([(8, 9, 3.2), (7, 6.5, 2.6), (9.5, 7.5, 2.2)], 0.92, 0.0),
             ([(8, 9.5, 3.8), (6.5, 6.5, 3.0), (10, 6.5, 2.8)], 0.86, 0.6),
             ([(8, 9.5, 4.3), (6, 6, 3.4), (10.5, 6, 3.2), (8, 4, 2.4)], 0.74, 1.2),
             ([(8, 10, 4.8), (5.5, 6, 3.8), (11, 6, 3.6), (8, 3.5, 3.0)], 0.56, 2.2),
             ([(8, 10, 5.2), (5, 6, 4.2), (11.5, 6, 4.0), (8, 3, 3.4)], 0.36, 3.4)]
    frames = []
    for k, (circles, a, rag) in enumerate(spec_):
        A = puff_frame(circles, SMOKE, a, ragged=rag, sd_=seed("vent_smoke", k), base=2.2, gain=4.0)
        if k < 2:          # the hot heart of fresh vent water
            stamp_rows(A, 7, 8, ["ab", "ba"] if k == 0 else ["a.", ".a"], {"a": "#a8401a", "b": "#e2702a"})
        frames.append(A)
    particle("vent_smoke", frames)


def stamp_rows(A, x, y, rows, key, a=1.0):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != ".":
                put_px(A, x + i, y + j, key[ch], a)


MOTE = ["#1f94a0", "#56cdcd", "#9cf0e8", "#e6fff9"]


def glow_dot(cx, cy, core, halo, bright=1.0, n=16):
    """A soft round glow: a bright round core and a faint round halo (alpha steps, no blur)."""
    A = blank(n)
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    d = np.hypot(xx - cx, yy - cy)
    A[(d <= halo) & (d > core + 1.0)] = ca(MOTE[0], 0.30 * bright)
    A[(d <= core + 1.0) & (d > core)] = ca(MOTE[1], 0.75 * bright)
    A[d <= core] = ca(MOTE[2], bright)
    A[d <= core * 0.55] = ca(MOTE[3], 1.0)
    return A


def bioluminescence():
    """Soft cyan motes of living light: a round glow that swells, flares and settles (4 frames, loop them for a
    twinkle or play them through for one blink)."""
    particle("bioluminescence", [glow_dot(8, 8, 1.0, 3.0, 0.8), glow_dot(8, 8, 1.6, 4.2, 0.9),
                                 glow_dot(8, 8, 2.2, 5.4, 1.0), glow_dot(8, 8, 1.6, 4.4, 0.85)])


SPRAY = ["#6f9bb6", "#a6cde0", "#d8eef6", "#ffffff"]


def whale_spout():
    """Blowhole spray: a white burst of mist and droplets that bursts, spreads and rains down (5 frames)."""
    r = rng_for("whale_spout", "drops")
    drops = [(r.uniform(-1, 1) * 0.9, r.uniform(-1.4, -0.3), r.uniform(0.8, 1.3)) for _ in range(9)]
    frames = []
    for k in range(5):
        t = k / 4
        A = puff_frame([(8, 10 - 2 * t, 3.0 + 1.6 * t), (8, 7 - 2.5 * t, 2.2 + 1.4 * t)], SPRAY, 0.75 - 0.6 * t,
                       ragged=1.2 * t + 0.3, sd_=seed("whale_spout", k), base=2.6, gain=3.0) if k < 4 else blank()
        for vx, vy, s in drops:
            x = 8 + vx * 7 * t
            y = 8 + vy * 7 * t + 9 * t * t
            if 0 <= y < 16:
                put_px(A, x, y, SPRAY[3], 1.0 - 0.5 * t)
                if s > 1.0:
                    put_px(A, x + 1, y, SPRAY[2], 0.9 - 0.5 * t)
                    put_px(A, x, y + 1, SPRAY[1], 0.9 - 0.5 * t)
        frames.append(A)
    particle("whale_spout", frames)


CURRENT = ["#5aa7b8", "#9fd6de", "#dff6f6", "#ffffff"]


def bubble_px(A, cx, cy, r, a=1.0):
    """A small round bubble: a pale rim, a clear middle, a white glint at the top-left."""
    yy, xx = np.mgrid[0:16, 0:16] + 0.5
    d = np.hypot(xx - cx, yy - cy)
    A[(d <= r) & (d > r - 1.0)] = ca(CURRENT[1], 0.9 * a)
    A[d <= r - 1.0] = ca(CURRENT[0], 0.25 * a)
    put_px(A, cx - r * 0.45 - 0.5, cy - r * 0.45 - 0.5, CURRENT[3], a)


def belly_current():
    """The rushing current in the whale's belly: long bright streaks sweeping along, bubbles tumbling with them
    (4 frames; the streaks run along +x of the sprite, so orient the particle with the flow)."""
    lines = [(3, 2, 9), (7, 0, 12), (12, 4, 8)]
    frames = []
    for k in range(4):
        A = blank()
        for j, (y, x0, ln) in enumerate(lines):
            x0 = (x0 + 3 * k + j) % 16
            for i in range(ln):
                x = (x0 + i) % 16
                a = 0.25 + 0.6 * i / ln
                A[y, x] = ca(CURRENT[2] if i > ln - 3 else CURRENT[1], a)
        bubble_px(A, (4 + 3 * k) % 16, 10.5 - 0.5 * k, 2.2)
        bubble_px(A, (11 + 2 * k) % 16, 5.0 + 0.3 * k, 1.6, 0.9)
        frames.append(A)
    particle("belly_current", frames)


NOTE = ["#2a8fb0", "#62c7dc", "#b5eef2", "#ffffff"]


def song_note():
    """A glowing musical note (a round head, a stem and a flag) in a soft halo that pulses (4 frames). It is pale, so
    the game can tint it per note (setColor) and still read it."""
    ss = 4
    X, Y = ss_coords(16, 16, ss)
    head = sd_ellipse(X, Y, 6.0, 11.6, 2.6, 1.9, -0.35)
    stem = sd_segment(X, Y, 8.1, 11.0, 8.1, 2.4, 0.65)
    flag = sd_segment(X, Y, 8.1, 2.6, 11.6, 6.6, 0.7)
    flag2 = sd_segment(X, Y, 11.6, 6.6, 11.0, 8.6, 0.6)
    glyph = np.minimum(np.minimum(head, stem), np.minimum(flag, flag2))
    g = down((glyph < 0).astype(float), ss) > 0.45
    frames = []
    for k, (halo, a) in enumerate(((1, 0.35), (2, 0.45), (2, 0.6), (1, 0.45))):
        A = blank()
        ring = g.copy()
        for _ in range(halo):
            ring = dilate(ring, diag=True)
        A[ring & ~g] = ca(NOTE[0], a)
        A[dilate(g) & ~g] = ca(NOTE[1], min(1.0, a + 0.35))
        A[g] = rgba(NOTE[2])
        core = g & erode(g)
        A[core] = rgba(NOTE[3])
        put_px(A, 5, 11, NOTE[3])
        sx, sy = [(12, 3), (13, 5), (3, 9), (10, 12)][k]
        put_px(A, sx, sy, NOTE[3], 0.9)
        frames.append(A)
    particle("song_note", frames)


IRIDESCENT = ["#ffb6e8", "#b8ffe0", "#fff1a8", "#b7d4ff"]
BUBBLE = ["#5fa9c0", "#a9e2ec", "#e8fbff", "#ffffff"]


def bubble_img(n, r, phase, pop=False, rng_name="elder_bubble"):
    """A big round shimmering bubble n x n: a thin pale rim with iridescent arcs that slide round it, a faint clear
    body, a round catch-light at the top-left and a small one at the bottom-right. `pop` breaks the rim into flying
    fragments."""
    A = np.zeros((n, n, 4), np.uint8)
    c = n / 2
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    d = np.hypot(xx - c, yy - c)
    ang = (np.arctan2(yy - c, xx - c) / (2 * math.pi) + 1.0 + phase) % 1.0
    rim = (d <= r) & (d > r - (1.0 if n <= 16 else 1.6))
    if pop:
        rim &= (np.floor(ang * 10) % 2 == 0)
        rim = rim & (d > r - 1.0)
        A2 = np.zeros_like(A)
        # fragments pushed outward
        for y, x in zip(*np.nonzero(rim)):
            dx, dy = (x + 0.5 - c) / max(d[y, x], 1e-6), (y + 0.5 - c) / max(d[y, x], 1e-6)
            X2, Y2 = int(round(x + dx * 1.5)), int(round(y + dy * 1.5))
            if 0 <= X2 < n and 0 <= Y2 < n:
                A2[Y2, X2] = ca(BUBBLE[2], 0.8)
        return A2
    A[d <= r - 1] = ca(BUBBLE[0], 0.16)
    A[(d <= r - 1) & (d > r - 2.2)] = ca(BUBBLE[1], 0.28)
    A[rim] = ca(BUBBLE[1], 0.9)
    seg = (ang * 4).astype(int) % 4
    band = ((ang * 4) % 1.0) < 0.45
    for k in range(4):
        m = rim & band & (seg == k)
        A[m] = ca(IRIDESCENT[k], 0.95)
    # catch-lights
    g = max(1.0, r * 0.22)
    A[np.hypot(xx - (c - r * 0.45), yy - (c - r * 0.45)) <= g] = ca(BUBBLE[3], 1.0)
    A[np.hypot(xx - (c + r * 0.5), yy - (c + r * 0.5)) <= max(0.6, g * 0.5)] = ca(BUBBLE[2], 0.9)
    return A


def elder_bubble():
    """The Elder Guardian's bubble: a big shimmering bubble whose rainbow sheen slides round it (frames 0-3), then
    bursts (frame 4). For a looping shimmer cycle frames 0-3; play 4 last when it pops."""
    frames = [bubble_img(16, 7.0, k / 4) for k in range(4)] + [bubble_img(16, 7.0, 0.0, pop=True)]
    particle("elder_bubble", frames)


vent_smoke()
bioluminescence()
whale_spout()
belly_current()
song_note()
elder_bubble()


# ====================================================================== entity textures
def entity_textures():
    """The elder_bubble projectile (a camera-facing billboard, 32 x 32: draw it with entityTranslucent, full-bright),
    in four shimmer frames stacked vertically (32 x 128): pick frame (age / 3) % 4 by offsetting V."""
    frames = [bubble_img(32, 14.5, k / 4) for k in range(4)]
    strip = np.concatenate(frames, axis=0)
    put("textures/entity/elder_bubble.png", strip)


entity_textures()


# ====================================================================== Turtle Shell armour layers (64 x 32)
# Vanilla layout. Layer 1 (helmet, chestplate, boots) paints only the boots, on the lower legs; its head, body and
# arm boxes stay transparent, because the vanilla Turtle Shell is the helmet and the chestplate is a 3D carapace
# drawn by its own renderer (so a vanilla pass over it draws nothing). Layer 2 (leggings) paints the waist and legs.
# Box faces (u, v, w, h, d): top, bottom, then right, front, left, back in a row under them.
TSKIN = ramp("#1a2614", "#26361c", "#334824", "#425c2c", "#527135", "#658741", "#7c9e50", "#96b766")
SCUTE = ramp("#18240f", "#263c19", "#344f21", "#43662a", "#567f33", "#6c973e", "#86ae4c")
SEAM = ramp("#7d6f34", "#a8974a", "#cbbb6c", "#e4d796")
PLAST = ramp("#8a7a4c", "#b0a06a", "#cfc08a", "#e6dab0")


def box_faces(u, v, w, h, d):
    return {"top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d), "right": (u, v + d, d, h),
            "front": (u + d, v + d, w, h), "left": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h)}


SIDE_LIGHT = {"front": 0.6, "left": 0.0, "right": 0.8, "back": -0.6, "top": 1.0, "bottom": -1.0}


def skin_scales(fw, fh, face, x0=0, y0=0):
    """Scaly turtle skin: offset rows of small round scales, each lit at its top-left and shaded at its base."""
    T = np.full((fh, fw), 3.4 + SIDE_LIGHT[face])
    for y in range(fh):
        for x in range(fw):
            gy = y + y0
            off = 1 if (gy // 2) % 2 else 0
            u = (x + x0 + off) % 3
            vv = gy % 2
            if vv == 1:
                T[y, x] -= 1.0
            elif u == 0:
                T[y, x] += 1.0
            if u == 2 and vv == 1:
                T[y, x] -= 0.6
    return quant(T, len(TSKIN), 0, 7)


def armor_layers():
    A1 = np.zeros((32, 64, 4), np.uint8)
    A2 = np.zeros((32, 64, 4), np.uint8)
    # ---------------------------------------------------------------- boots (layer 1, lower 7 rows of the legs)
    for face, (fx, fy, fw, fh) in box_faces(0, 16, 4, 12, 4).items():
        if face == "top":
            continue
        if face == "bottom":                      # the sole: pale plastron with a seam
            S = np.full((fh, fw), 2)
            S[:, fw // 2] = 1
            A1[fy:fy + fh, fx:fx + fw] = paint(S, PLAST)
            continue
        rows = 7
        I = skin_scales(fw, rows, face, fx)
        C = paint(I, TSKIN)
        # the cuff: a band of shell scute with a pale seam over it
        cuff = np.full((2, fw), 4 + (1 if face in ("front", "right") else 0))
        C[0:2] = paint(cuff, SCUTE)
        C[0] = paint(np.full(fw, 2), SEAM)
        if face == "front":                       # the flipper toe: darker, two pale claws at the tip
            C[rows - 2:rows] = paint(np.full((2, fw), 2), TSKIN)
            C[rows - 1, 0] = rgba(PLAST[3])
            C[rows - 1, fw - 1] = rgba(PLAST[3])
        C[rows - 1] = np.where(C[rows - 1, :, 3:4] > 0, C[rows - 1], C[rows - 1])
        A1[fy + fh - rows:fy + fh, fx:fx + fw] = C
    # ---------------------------------------------------------------- leggings (layer 2)
    for face, (fx, fy, fw, fh) in box_faces(0, 16, 4, 12, 4).items():
        if face in ("top", "bottom"):
            continue
        I = skin_scales(fw, fh, face, fx + 1, 1)
        C = paint(I, TSKIN)
        if face in ("front", "right", "left"):   # a shell plate over the thigh: scute with a pale seam rim
            ph = 6
            P = np.full((ph, fw), 4.0 + SIDE_LIGHT[face] * 0.6)
            P[0, :] += 1.0
            P[:, 0] += 0.6
            P[ph - 1, :] -= 1.2
            Q = quant(P, len(SCUTE), 1, 6)
            C[0:ph] = paint(Q, SCUTE)
            C[ph] = paint(np.full(fw, 1), SEAM)
            if face == "front":
                C[2:4, 1:3] = paint(np.full((2, 2), 6), SCUTE)       # a lit ring on the plate's boss
                C[3, 2] = rgba(SCUTE[4])
        A2[fy:fy + fh, fx:fx + fw] = C
    # the waist: the plastron's lower edge as a belt round the hips (body box, lower 4 rows)
    for face, (fx, fy, fw, fh) in box_faces(16, 16, 8, 12, 4).items():
        if face in ("top", "bottom"):
            continue
        rows = 4
        P = np.full((rows, fw), 2.0 + SIDE_LIGHT[face] * 0.5)
        P[0, :] += 1.0
        P[rows - 1, :] -= 1.0
        Q = quant(P, len(PLAST), 0, 3)
        C = paint(Q, PLAST)
        for x in range(0, fw, 4 if fw >= 8 else 2):
            C[1:rows, x] = rgba(SEAM[1])
        A2[fy + fh - rows:fy + fh, fx:fx + fw] = C
    put("textures/models/armor/turtle_shell_layer_1.png", A1)
    put("textures/models/armor/turtle_shell_layer_2.png", A2)


armor_layers()


# ====================================================================== preview sheets
CHK = ((156, 156, 160, 255), (118, 118, 124, 255))


def _on(bg, im):
    base = bg.copy()
    base.alpha_composite(im)
    return base


def _first(rel):
    im = OUT[rel]
    return ANIM[rel][0] if rel in ANIM else im


def contact_sheet(paths, dst, scale=8, cols=3):
    """Each texture big on a checkerboard and on dark, 3 x 3 if it tiles, and at 1x / 2x on vanilla grey."""
    tiles = []
    for rel in paths:
        im = _first(rel)
        w, h = im.size
        s = scale if max(w, h) <= 16 else max(1, scale * 16 // max(w, h)) if max(w, h) <= 32 else max(1, 256 // max(w, h))
        s = max(s, 4) if max(w, h) <= 32 else s
        big = im.resize((w * s, h * s), Image.NEAREST)
        parts = [_on(checker(big.size, *CHK, cell=s), big), _on(Image.new("RGBA", big.size, (24, 26, 34, 255)), big)]
        if rel in TILES:
            t = Image.new("RGBA", (w * 3, h * 3))
            for ty in range(3):
                for tx in range(3):
                    t.alpha_composite(im, (tx * w, ty * h))
            k = max(1, s // 2)
            parts.append(_on(Image.new("RGBA", (w * 3 * k, h * 3 * k), (40, 44, 52, 255)),
                             t.resize((w * 3 * k, h * 3 * k), Image.NEAREST)))
        one = Image.new("RGBA", (w + 4, h + 4), (139, 139, 139, 255))
        one.alpha_composite(im, (2, 2))
        two = one.resize((one.width * 2, one.height * 2), Image.NEAREST)
        cw = sum(q.width + 6 for q in parts) + two.width
        cell = Image.new("RGBA", (cw, max(max(q.height for q in parts), two.height + one.height + 6) + 18),
                         (40, 40, 46, 255))
        x = 0
        for q in parts:
            cell.paste(q, (x, 18))
            x += q.width + 6
        cell.paste(one, (x, 18))
        cell.paste(two, (x, 18 + one.height + 6))
        label = rel.split("/")[-1] + (f"  ({len(ANIM[rel])} frames)" if rel in ANIM else "")
        ImageDraw.Draw(cell).text((2, 3), label, fill=(235, 235, 235, 255))
        tiles.append(cell)
    cw = max(t.width for t in tiles) + 8
    ch = max(t.height for t in tiles) + 8
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cw * cols + 8, ch * rows + 8), (28, 28, 33, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, (8 + (i % cols) * cw, 8 + (i // cols) * ch))
    sheet.save(dst)
    return dst


def particle_rows():
    names = sorted({rel.split("/")[-1].rsplit("_", 1)[0] for rel in OUT if "/particle/" in rel})
    out = []
    for nm in names:
        fr = sorted((rel for rel in OUT if rel.startswith(f"textures/particle/{nm}_")),
                    key=lambda r_: int(r_.rsplit("_", 1)[1][:-4]))
        out.append((nm, [OUT[r_] for r_ in fr]))
    return out


def strips(rows_in, dst, scale=8, label_w=150):
    """One row per sequence: every frame left to right, on a checkerboard and on dark water."""
    rows = []
    for label, ims in rows_in:
        s = scale if ims[0].width <= 16 else max(1, scale * 16 // ims[0].width)
        tw, th = ims[0].width * s, ims[0].height * s
        row = Image.new("RGBA", (label_w + len(ims) * (tw * 2 + 12), th + 8), (34, 34, 40, 255))
        ImageDraw.Draw(row).text((4, 4), f"{label} x{len(ims)}", fill=(235, 235, 235, 255))
        for i, im in enumerate(ims):
            big = im.resize((tw, th), Image.NEAREST)
            x = label_w + i * (tw * 2 + 12)
            row.paste(_on(checker((tw, th), *CHK, cell=s), big), (x, 4))
            row.paste(_on(Image.new("RGBA", (tw, th), (10, 26, 40, 255)), big), (x + tw + 2, 4))
        rows.append(row)
    sheet = Image.new("RGBA", (max(r_.width for r_ in rows), sum(r_.height for r_ in rows)), (28, 28, 33, 255))
    y = 0
    for r_ in rows:
        sheet.paste(r_, (0, y))
        y += r_.height
    sheet.save(dst)
    return dst


def everything(dst, scale=6):
    """Every texture (first frame) on one dark sheet, labelled, grouped by folder."""
    cells = []
    for g in ("block", "item", "particle", "entity", "armor"):
        for rel in sorted(r_ for r_ in OUT if r_.split("/")[-2] == g):
            im = _first(rel)
            s = scale if max(im.size) <= 16 else max(2, scale * 16 // max(im.size)) if max(im.size) <= 32 else 4
            big = im.resize((im.width * s, im.height * s), Image.NEAREST)
            cells.append((rel.split("/")[-1][:-4], big))
    W, cw = 1400, 150
    x = y = rowh = 0
    placed = []
    for label, big in cells:
        w = max(cw, big.width + 8)
        if x + w > W:
            x, y, rowh = 0, y + rowh, 0
        placed.append((x, y, label, big))
        x += w
        rowh = max(rowh, big.height + 22)
    sheet = Image.new("RGBA", (W, y + rowh + 8), (20, 26, 34, 255))
    d = ImageDraw.Draw(sheet)
    for x, y, label, big in placed:
        sheet.paste(_on(Image.new("RGBA", big.size, (30, 40, 52, 255)), big), (x + 4, y + 18))
        d.text((x + 4, y + 4), label, fill=(226, 236, 240, 255))
    sheet.save(dst)
    return dst


def check_tiles():
    """Every tiling block texture: no patch of one colour under 4 pixels (wrapping), so no specks or dot clusters."""
    bad = []
    for rel in sorted(TILES):
        for k, im in enumerate(ANIM.get(rel, [OUT[rel]])):
            A = np.asarray(im)
            key = A[..., 0].astype(np.int64) << 24 | A[..., 1].astype(np.int64) << 16 | A[..., 2].astype(np.int64) << 8 \
                | A[..., 3]
            _, inv = np.unique(key, return_inverse=True)
            s = smallest_patch(inv.reshape(key.shape))
            if s < 3:
                bad.append(f"{rel}[{k}]: a patch of {s} px")
    return bad


# ====================================================================== output
def write_all(root=ASSETS):
    for rel, im in sorted(OUT.items()):
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst)
    for rel, body in sorted(JSON.items()):
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(body, indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write contact sheets here")
    ap.add_argument("--no-write", action="store_true", help="do not write into the mod assets")
    ap.add_argument("--out", type=Path, help="write the files under this folder instead of the mod assets")
    a = ap.parse_args()
    if a.out:
        write_all(a.out)
    elif not a.no_write:
        write_all()
    for rel, im in sorted(OUT.items()):
        print(f"{rel:58s} {im.size[0]}x{im.size[1]}")
    for rel in sorted(JSON):
        print(rel)
    for b in check_tiles():
        print("TILE WARNING:", b)
    if a.preview:
        p = a.preview
        p.mkdir(parents=True, exist_ok=True)
        for g in ("block", "item", "entity", "armor"):
            paths = sorted(r_ for r_ in OUT if r_.split("/")[-2] == g)
            if paths:
                print("sheet:", contact_sheet(paths, p / f"ocean_{g}.png", cols=2 if g == "armor" else 3))
        if particle_rows():
            print("sheet:", strips(particle_rows(), p / "ocean_particles.png", scale=10))
        if ANIM:
            print("sheet:", strips([(r_.split("/")[-1], ims) for r_, ims in sorted(ANIM.items())],
                                   p / "ocean_anim.png", scale=6))
        print("sheet:", everything(p / "ocean_everything.png"))


if __name__ == "__main__":
    main()
