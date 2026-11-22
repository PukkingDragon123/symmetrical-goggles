#!/usr/bin/env python3
"""Winterworks pixel art for The Living End (mods/winterworks/docs/END_UPDATE.md, section 15).

    python examples/src/winterworks_end_art.py                  # write all PNGs, .mcmeta and particle jsons
    python examples/src/winterworks_end_art.py --preview DIR    # also write contact sheets to DIR

The block and item textures (16 x 16, vanilla style) and the Chorus Cocoon's block models come from
winterworks_end_pixels.py, which this script runs and writes with the rest. Drawn here: the particles (16 x 16), the
eclipse sky textures (256 x 256), the dragon's light beam, the obsidian shell of petrified mobs (32 x 32) and the
mob-effect icons (18 x 18). Each is built from hand-chosen parts: silhouettes (signed-distance shapes), height fields
and periodic noise lit from the top-left, quantised onto hand-picked, hue-shifted ramps (dark -> light), and small
hand-placed ASCII stamps for the pixels that must be exact. Every random choice is seeded by the texture's name, so a
run always writes the same files.

Rules (as winterworks_art.py): light from the top-left; dark hue-shifted outlines, never pure black; tone in
clusters, never single-pixel noise; only glows are saturated.

Animated textures are vertical frame strips + `<png>.mcmeta` (`frametime` in ticks, `interpolate` for the pulses):
environment/eclipse_corona is NOT on an atlas: its renderer picks the frame itself (see the corona section).
Particles are frame sequences `<name>_<i>.png` (frame 0 = birth, for `setSpriteFromAge`) plus
`particles/<name>.json`.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import winterworks_end_pixels as PIXELS  # noqa: E402  (the 16 x 16 blocks and items)
from winterworks_art import ASSETS, checker  # noqa: E402  (no side effects)

OUT: dict[str, Image.Image] = {}      # relative path -> image
JSON: dict[str, dict] = {}            # relative path -> json body
ANIM: dict[str, list] = {}            # relative path -> frames in play order (for the preview strips)
TILES: set[str] = set()               # textures that must tile (the preview shows them 3 x 3)


# ====================================================================== colour + ramps
def rgba(c):
    if isinstance(c, (tuple, list, np.ndarray)):
        c = tuple(int(v) for v in c)
        return c if len(c) == 4 else (*c, 255)
    c = c.lstrip("#")
    if len(c) == 6:
        c += "ff"
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4, 6))


def ramp(*hexes):
    """A ramp, dark -> light, as an (n, 4) uint8 array."""
    return np.array([rgba(h) for h in hexes], np.uint8)


def seed(name, *extra):
    return zlib.crc32("|".join(map(str, (name,) + extra)).encode()) & 0x7FFFFFFF


def rng_for(name, *extra):
    return np.random.default_rng(seed(name, *extra))


# Obsidian: violet-black glass. The body sits in 1-4, bevels and glass highlights 5-8, the specular dab 9.
OBS = ramp("#050307", "#0a0710", "#100b18", "#171022", "#20162e", "#2c1f3e", "#3c2b54", "#574475", "#8572aa",
           "#cbbfe6")
# the same steps with the faint purple sheen (swapped in where the sheen noise is high)
OBS_SHEEN = ramp("#060309", "#0c0715", "#140b22", "#1d1030", "#28163f", "#361d52", "#4a286b", "#683c8e",
                 "#9468c4", "#d8c4f5")
# Crying-obsidian light (cracks in the shell): ink violet -> lilac -> white.
CRY = ramp("#25064f", "#45099a", "#6c16d0", "#9440f2", "#bb82ff", "#e2c6ff", "#fbf3ff")
# The meteorite's glow, edge -> core: violet, magenta, rose, orange, amber, gold, white.
HOT = ramp("#3a0c5c", "#6c1585", "#a8237f", "#e04a5a", "#ff7d2a", "#ffad35", "#ffd76a", "#fff4c2", "#fffdf2")
# End teal (the recall icon and a few motes)
TEAL = ramp("#0c2c33", "#124a4f", "#1a6b6a", "#289082", "#4bb59d", "#86d9bb", "#c4f5df")
# End sand: pale grey moon dust; shadows lean violet, lights lean warm.
SAND = ramp("#46434e", "#5a5762", "#6f6c76", "#85828a", "#9a979d", "#aeacae", "#c1bfbd", "#d3d1cc", "#e3e1da")


# ====================================================================== periodic noise + cells
def pnoise(w, h, cx, cy, sd):
    """Smooth value noise, periodic over the w x h canvas (cx x cy lattice cells), 0..1."""
    g = np.random.default_rng(sd).random((cy, cx))

    def axis(n, c):
        u = (np.arange(n) + 0.5) * c / n
        i0 = np.floor(u).astype(int)
        f = u - i0
        return i0 % c, (i0 + 1) % c, f * f * (3 - 2 * f)

    x0, x1, fx = axis(w, cx)
    y0, y1, fy = axis(h, cy)
    a, b = g[np.ix_(y0, x0)], g[np.ix_(y0, x1)]
    c, d = g[np.ix_(y1, x0)], g[np.ix_(y1, x1)]
    fx, fy = fx[None, :], fy[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(w, h, cells, sd, octaves=3, gain=0.5):
    """Periodic fractal noise normalised to 0..1."""
    tot, amp = np.zeros((h, w)), 1.0
    for o in range(octaves):
        c = cells * 2 ** o
        tot += amp * pnoise(w, h, max(1, min(w, c)), max(1, min(h, c * h // w if h != w else c)), sd + 977 * o)
        amp *= gain
    tot -= tot.min()
    return tot / max(tot.max(), 1e-9)


def jitter_points(w, h, nx, ny, rng, jitter=0.8):
    """One point per cell of an nx x ny grid, jittered: an even, natural spread (periodic-friendly)."""
    pts = []
    for j in range(ny):
        for i in range(nx):
            pts.append(((i + 0.5 + (rng.random() - 0.5) * jitter) * w / nx,
                        (j + 0.5 + (rng.random() - 0.5) * jitter) * h / ny))
    return pts


def voronoi(w, h, pts, wrap=True, scale=(1.0, 1.0)):
    """Nearest-point cells. Returns F1, F2 (distances), the nearest index, and the offset (dx, dy) to it."""
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    D, DX, DY = [], [], []
    for px, py in pts:
        dx, dy = xx - px, yy - py
        if wrap:
            dx = (dx + w / 2) % w - w / 2
            dy = (dy + h / 2) % h - h / 2
        DX.append(dx)
        DY.append(dy)
        D.append(np.hypot(dx * scale[0], dy * scale[1]))
    D, DX, DY = np.stack(D), np.stack(DX), np.stack(DY)
    order = np.argsort(D, axis=0)
    i1 = order[0]
    take = lambda A, i: np.take_along_axis(A, i[None], 0)[0]  # noqa: E731
    return take(D, i1), take(D, order[1]), i1, take(DX, i1), take(DY, i1)


# ====================================================================== height fields, light, quantising
LIGHT = np.array([-1.0, -1.0, 1.25])
LIGHT /= np.linalg.norm(LIGHT)


def grad(H, wrap=True):
    if wrap:
        gx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) / 2
        gy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) / 2
    else:
        gy, gx = np.gradient(H)
    return gx, gy


def lit(H, strength=1.0, wrap=True, light=LIGHT):
    """Lambert light of a height field (light from the top-left), -1..1 relative to a flat face."""
    gx, gy = grad(H, wrap)
    n = np.dstack([-gx * strength, -gy * strength, np.ones_like(H)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return (n @ light) - light[2]


def quant(t, n, lo=0, hi=None):
    """Tone (in ramp steps, float) -> integer ramp index, clamped."""
    hi = n - 1 if hi is None else hi
    return np.clip(np.floor(t + 0.5), lo, hi).astype(int)


def despeckle(I, wrap=True, passes=2, keep=None):
    """Replace pixels that match none of their 4 neighbours by the neighbours' nearest value (no 1-px dust)."""
    I = I.copy()
    for _ in range(passes):
        if wrap:
            nb = [np.roll(I, s, a) for a in (0, 1) for s in (1, -1)]
        else:
            P = np.pad(I, 1, mode="edge")
            nb = [P[:-2, 1:-1], P[2:, 1:-1], P[1:-1, :-2], P[1:-1, 2:]]
        nb = np.stack(nb)
        lonely = np.all(nb != I, axis=0)
        if keep is not None:
            lonely &= ~keep
        # the neighbour value closest to the pixel's own (keeps gradients, drops dust)
        d = np.abs(nb - I[None])
        best = np.take_along_axis(nb, np.argmin(d, axis=0)[None], 0)[0]
        I = np.where(lonely, best, I)
    return I


def paint(I, rmp, alt=None, use_alt=None):
    """Index map -> RGBA array (index -1 = transparent). `alt` is a second ramp used where `use_alt`."""
    out = np.zeros(I.shape + (4,), np.uint8)
    m = I >= 0
    out[m] = rmp[np.clip(I[m], 0, len(rmp) - 1)]
    if alt is not None and use_alt is not None:
        k = m & use_alt
        out[k] = alt[np.clip(I[k], 0, len(alt) - 1)]
    return out


def to_img(A):
    return Image.fromarray(np.ascontiguousarray(A), "RGBA")


# ====================================================================== masks, shapes, strokes
def ss_coords(w, h, ss):
    yy, xx = np.mgrid[0:h * ss, 0:w * ss]
    return (xx + 0.5) / ss, (yy + 0.5) / ss


def down(a, ss):
    h, w = a.shape[0] // ss, a.shape[1] // ss
    return a.reshape(h, ss, w, ss, *a.shape[2:]).mean(axis=(1, 3))


def sd_circle(X, Y, cx, cy, r):
    return np.hypot(X - cx, Y - cy) - r


def sd_ellipse(X, Y, cx, cy, rx, ry, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    u = ((X - cx) * c + (Y - cy) * s) / rx
    v = (-(X - cx) * s + (Y - cy) * c) / ry
    k = np.hypot(u, v)
    return (k - 1) * min(rx, ry)


def sd_segment(X, Y, ax, ay, bx, by, ra, rb=None):
    """Capsule from a (radius ra) to b (radius rb)."""
    rb = ra if rb is None else rb
    px, py, vx, vy = X - ax, Y - ay, bx - ax, by - ay
    t = np.clip((px * vx + py * vy) / max(vx * vx + vy * vy, 1e-9), 0, 1)
    return np.hypot(px - vx * t, py - vy * t) - (ra + (rb - ra) * t)


def sd_poly(X, Y, pts):
    """Signed distance to a closed polygon (negative inside)."""
    pts = np.asarray(pts, float)
    d = np.full(X.shape, np.inf)
    inside = np.zeros(X.shape, bool)
    n = len(pts)
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        vx, vy = bx - ax, by - ay
        t = np.clip(((X - ax) * vx + (Y - ay) * vy) / max(vx * vx + vy * vy, 1e-9), 0, 1)
        d = np.minimum(d, np.hypot(X - ax - vx * t, Y - ay - vy * t))
        cond = ((ay > Y) != (by > Y)) & (X < (bx - ax) * (Y - ay) / np.where(by - ay == 0, 1e-9, by - ay) + ax)
        inside ^= cond
    return np.where(inside, -d, d)


def smin(a, b, k):
    """Smooth union of two distance fields."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def bezier(pts, n=48):
    """Points along a quadratic/cubic Bezier given its control points."""
    pts = np.asarray(pts, float)
    t = np.linspace(0, 1, n)[:, None]
    if len(pts) == 3:
        return (1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t ** 2 * pts[2]
    return ((1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t ** 2 * pts[2]
            + t ** 3 * pts[3])


def line_px(x0, y0, x1, y1):
    """Bresenham pixels from (x0, y0) to (x1, y1)."""
    x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err, out = dx + dy, []
    while True:
        out.append((x0, y0))
        if x0 == x1 and y0 == y1:
            return out
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def poly_px(points):
    """Pixels of a polyline (consecutive duplicates removed)."""
    out = []
    for (ax, ay), (bx, by) in zip(points[:-1], points[1:]):
        for p in line_px(ax, ay, bx, by):
            if not out or out[-1] != p:
                out.append(p)
    return out


def shift(m, dx, dy, wrap=False, fill=False):
    if wrap:
        return np.roll(np.roll(m, dy, 0), dx, 1)
    out = np.full_like(m, fill)
    h, w = m.shape[:2]
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = m[ys, xs]
    return out


def dilate(m, wrap=False, diag=False):
    out = m.copy()
    steps = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if diag else [])
    for dx, dy in steps:
        out |= shift(m, dx, dy, wrap)
    return out


def erode(m, wrap=False):
    return ~dilate(~m, wrap)


def chamfer(mask, wrap=False, cap=64, border_inside=False):
    """Distance (in px, 8-connected chamfer) from each inside pixel to the nearest outside pixel.

    Beyond the canvas (when not wrapping) counts as outside, or as inside with `border_inside`."""
    d = np.where(mask, float(cap), 0.0)
    fill = float(cap) if border_inside else 0.0
    for _ in range(cap):
        nd = d.copy()
        for dx, dy, c in ((1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.41), (1, -1, 1.41),
                          (-1, 1, 1.41), (-1, -1, 1.41)):
            nd = np.minimum(nd, shift(d, dx, dy, wrap, fill=fill) + c)
        nd = np.where(mask, nd, 0.0)
        if np.array_equal(nd, d):
            break
        d = nd
    return d


def stamp(A, x, y, art, key, wrap=False):
    """Hand-placed pixels: `art` rows ('.' = leave), `key` char -> colour."""
    h, w = A.shape[:2]
    for j, row in enumerate(art.strip("\n").splitlines()):
        row = row.strip().replace(" ", "")
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            px, py = x + i, y + j
            if wrap:
                px, py = px % w, py % h
            if 0 <= px < w and 0 <= py < h:
                A[py, px] = rgba(key[ch])


def outline(A, dark, lit=None, diag=False, inner=None):
    """Selective outline round the opaque pixels: `dark` everywhere, `lit` on the top-left facing side."""
    m = A[..., 3] > 0
    ring = dilate(m, diag=diag) & ~m
    out = A.copy()
    out[ring] = rgba(dark)
    if lit is not None:
        # outline pixels whose sprite neighbour is below/right of them face the light
        facing = ring & (shift(m, 0, -1) | shift(m, -1, 0)) & ~(shift(m, 0, 1) | shift(m, 1, 0))
        out[facing] = rgba(lit)
    return out


# ====================================================================== output helpers
def put(path, im):
    OUT[path] = im


def block(name, A, tiles=True):
    put(f"textures/block/{name}.png", to_img(A))
    if tiles:
        TILES.add(f"textures/block/{name}.png")


def item(name, A):
    put(f"textures/item/{name}.png", to_img(A))


def animated(path, frames, frametime=3, order=None, interpolate=False):
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
    if order:
        body["frames"] = order
    JSON[path + ".mcmeta"] = {"animation": body}
    ANIM[path] = [ims[i] for i in (order or range(len(ims)))]


def particle(name, frames):
    for i, f in enumerate(frames):
        put(f"textures/particle/{name}_{i}.png", to_img(f) if isinstance(f, np.ndarray) else f)
    JSON[f"particles/{name}.json"] = {"textures": [f"winterworks:{name}_{i}" for i in range(len(frames))]}


# ====================================================================== masonry: bonds, bevels, cracks
def bond(w, h, rows):
    """A masonry layout. rows: (y0, height, [x starts]) with the starts wrapping in x.

    Returns the brick label per pixel, the local (u, v) of each pixel inside its brick, and the brick's w, h."""
    lab = np.full((h, w), -1)
    U, V, BW, BH = (np.zeros((h, w), int) for _ in range(4))
    k = 0
    for y0, bh, starts in rows:
        starts = sorted(starts)
        for i, sx in enumerate(starts):
            ex = starts[i + 1] if i + 1 < len(starts) else starts[0] + w
            for x in range(sx, ex):
                for y in range(y0, y0 + bh):
                    lab[y % h, x % w] = k
                    U[y % h, x % w], V[y % h, x % w] = x - sx, y - y0
                    BW[y % h, x % w], BH[y % h, x % w] = ex - sx, bh
            k += 1
    return lab, U, V, BW, BH


def bevel_steps(U, V, BW, BH, hi=(+3, +2), lo=(-1.5,)):
    """Tone offsets of a bevelled block face: lit top/left rims, shaded bottom/right, mortar flagged."""
    mortar = (U == BW - 1) | (V == BH - 1)
    off = np.zeros(U.shape)
    for i, d in enumerate(hi):                      # the lit rims (outermost first)
        off = np.where(((V == i) & (U < BW - 1 - i)) | ((U == i) & (V < BH - 1 - i)), np.maximum(off, d), off)
    for i, d in enumerate(lo):                      # the shaded rims next to the mortar
        off = np.where(~mortar & ((V == BH - 2 - i) | (U == BW - 2 - i)) & (off == 0), d, off)
    return off, mortar


def crack_path(rng, x, y, ang, length, wobble=0.5, step=1.0):
    """A wandering crack: a list of float points."""
    pts = [(x, y)]
    for _ in range(int(length / step)):
        ang += rng.normal(0, wobble)
        x += math.cos(ang) * step
        y += math.sin(ang) * step
        pts.append((x, y))
    return pts


def carve(I, pix, w, h, deep=0, lit_step=2, shade_step=-1, wrap=True, lo=0, hi=None, mask=None):
    """Cut a 1-px groove into an index map: the groove is `deep`, its lower/right wall catches the light, its
    upper/left wall falls into shadow (light from the top-left)."""
    hi = I.max() if hi is None else hi
    groove = np.zeros((h, w), bool)
    for x, y in pix:
        if wrap:
            groove[y % h, x % w] = True
        elif 0 <= x < w and 0 <= y < h:
            groove[y, x] = True
    if mask is not None:
        groove &= mask
    litw = (shift(groove, 0, 1, wrap) | shift(groove, 1, 0, wrap)) & ~groove
    shdw = (shift(groove, 0, -1, wrap) | shift(groove, -1, 0, wrap)) & ~groove & ~litw
    if mask is not None:
        litw &= mask
        shdw &= mask
    I = I.copy()
    I[litw] = np.clip(I[litw] + lit_step, lo, hi)
    I[shdw] = np.clip(I[shdw] + shade_step, lo, hi)
    I[groove] = deep
    return I, groove


# ====================================================================== the blocks and items (16 x 16)
# Every block and item texture of the update, and the Chorus Cocoon's block models, are drawn in vanilla style by
# winterworks_end_pixels.py; they join this script's outputs (and its preview sheets) here.
PIXELS.build()
OUT.update(PIXELS.OUT)
JSON.update(PIXELS.JSON)
ANIM.update(PIXELS.ANIM)
TILES.update(t for t in PIXELS.TILES if t.startswith("textures/"))


# ====================================================================== shared by the particles and effects below
def sheen_mask(name, w, h, amount=0.66):
    return fbm(w, h, 2, seed(name, "sheen"), 2) > amount


def jag_path(rng, x, y, ang, length, turn=0.6, seg=(2, 5)):
    """An angular crack: straight runs of 2-5 px with sharp turns about a general heading."""
    pts, head, done = [(x, y)], ang, 0.0
    while done < length:
        a = head + rng.uniform(-turn, turn)
        s = rng.uniform(*seg)
        x, y = x + math.cos(a) * s, y + math.sin(a) * s
        pts.append((x, y))
        done += s
        head += rng.uniform(-0.25, 0.25)
    return pts


def fissures(name, w, h, specs, wrap=True):
    """Glowing fissures: (x, y, angle, length, branches). Returns the core mask and a 'thick' mask (the hot,
    two-pixel-wide middle of each main fissure)."""
    r = rng_for(name, "fissures")
    core = np.zeros((h, w), bool)
    thick = np.zeros((h, w), bool)
    for x, y, ang, length, branches in specs:
        pts = jag_path(r, x, y, ang, length)
        paths = [pts]
        for _ in range(branches):
            mx, my = pts[int(r.integers(1, max(2, len(pts) - 1)))]
            paths.append(jag_path(r, mx, my, ang + r.choice([-1, 1]) * r.uniform(0.8, 1.4), length * 0.35, 0.5,
                                  (2, 3)))
        for k, P in enumerate(paths):
            px = poly_px(P)
            for i, (a, b) in enumerate(px):
                if not wrap and not (0 <= a < w and 0 <= b < h):
                    continue
                core[b % h, a % w] = True
                if k == 0 and 0.2 < i / len(px) < 0.65:
                    thick[(b + 1) % h, a % w] = True
    return core, thick & ~core


# the End Bloom's petal violet and its bulb's light (the end_glow motes and the effect icons use them)
PETAL = ramp("#1c0a2d", "#2d1047", "#431965", "#5b2484", "#7832a2", "#9545bc", "#b061d1", "#cb86e4",
             "#e5b3f3", "#f8e0fc")
# the bulb's light, violet edge -> white core (also the End Bulb item and the end_glow motes)
BULB = ramp("#4a1f96", "#6d36c8", "#9259ea", "#b383f8", "#d3b2ff", "#ecdcff", "#fdf8ff")


def put_px(A, x, y, c):
    h, w = A.shape[:2]
    x, y = int(x), int(y)
    if 0 <= x < w and 0 <= y < h:
        A[y, x] = rgba(c) if not isinstance(c, np.ndarray) else c


class Layers:
    """Back-to-front shaded shapes at 4x supersampling, each quantised onto its own ramp."""

    def __init__(self, w=32, h=32, ss=4):
        self.w, self.h, self.ss = w, h, ss
        self.X, self.Y = ss_coords(w, h, ss)
        self.A = np.zeros((h, w, 4), np.uint8)
        self.top = np.full((h, w), -1)          # which layer owns each pixel
        self.n = 0

    def add(self, sdf, rmp, base, gain=6.0, bevel=2.0, lo=0, hi=None, edge=-2, extra=None, mask_only=False):
        D = sdf(self.X, self.Y) if callable(sdf) else sdf
        t = np.clip(-D / bevel, 0, 1)
        Hh = np.sqrt(1 - (1 - t) ** 2) * bevel
        if extra is not None:
            Hh = Hh + extra
        gy, gx = np.gradient(Hh, 1.0 / self.ss)
        nrm = np.dstack([-gx, -gy, np.ones_like(Hh)])
        nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
        Lt = (nrm @ LIGHT) - LIGHT[2]
        inside = D < 0
        cov = down(inside.astype(float), self.ss)
        Lm = down(np.where(inside, Lt, 0.0), self.ss) / np.maximum(cov, 1e-9)
        m = cov >= 0.5
        hi = len(rmp) - 1 if hi is None else hi
        I = quant(base + Lm * gain, len(rmp), lo, hi)
        # separate this shape from what lies behind it: its lower/right silhouette is darker
        rim = m & (~shift(m, 0, 1) | ~shift(m, 1, 0)) & (self.top >= 0)
        I = np.where(rim, np.clip(I + edge, lo, hi), I)
        if not mask_only:
            self.A[m] = rmp[I[m]]
            self.top[m] = self.n
        self.n += 1
        return m, I


WING = ramp("#170f21", "#261934", "#38264b", "#4c3562", "#614679", "#795b8f", "#9273a5", "#ad90b9", "#c9b1cf",
            "#e6d9e8")                                               # dusty lilac moth scales


# ====================================================================== particles (16 x 16, frame 0 = birth)
# Dust and puffs carry alpha (render them on the translucent particle sheet); sparks, motes, spores and shards are
# solid pixels with at most a faint halo.
def ca(c, a):
    """A colour with alpha a (0..1)."""
    r_, g_, b_, a0 = rgba(c)
    return (r_, g_, b_, int(round(a0 * a)))


def blank(n=16):
    return np.zeros((n, n, 4), np.uint8)


def puff_frame(circles, ramp_cols, alpha, n=16, ss=4, gain=5.0, base=2.6, ragged=0.0, sd_=0):
    """A puff of dust: a union of soft circles lit from the top-left, quantised onto a light ramp."""
    X, Y = ss_coords(n, n, ss)
    D = np.full(X.shape, np.inf)
    for cx, cy, r in circles:
        D = smin(D, sd_circle(X, Y, cx, cy, r), 1.2) if np.isfinite(D).any() else sd_circle(X, Y, cx, cy, r)
    if ragged:                                                        # thinning: the edge breaks into wisps
        D = D + pnoise(n * ss, n * ss, 6, 6, sd_) ** 2 * ragged
    t = np.clip(-D / 3.0, 0, 1)
    H = np.sqrt(1 - (1 - t) ** 2) * 3.0
    gy, gx = np.gradient(H, 1.0 / ss)
    nrm = np.dstack([-gx, -gy, np.ones_like(H)])
    nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    Lt = (nrm @ LIGHT) - LIGHT[2]
    inside = D < 0
    cov = down(inside.astype(float), ss)
    Lm = down(np.where(inside, Lt, 0.0), ss) / np.maximum(cov, 1e-9)
    m = cov >= 0.5
    I = quant(base + Lm * gain, len(ramp_cols), 0, len(ramp_cols) - 1)
    A = blank(n)
    for k in range(len(ramp_cols)):
        sel = m & (I == k)
        A[sel] = ca(ramp_cols[k], alpha)
    edge = m & ~erode(m)
    A[edge, 3] = (A[edge, 3] * 0.6).astype(np.uint8)                # soft rim
    return A


def end_spore():
    """Drifting violet spores: a glowing seed with four fine filaments that twirl as it floats."""
    frames = []
    for k in range(4):
        A = blank()
        a = k * math.pi / 8
        for j in range(4):
            ang = a + j * math.pi / 2
            for rr, col in ((3.0, PETAL[6]), (4.2, PETAL[7]), (5.3, PETAL[8])):
                put_px(A, 7.5 + math.cos(ang) * rr, 7.5 + math.sin(ang) * rr, col)
        stamp(A, 6, 6, """
            .ab.
            acdb
            bdeb
            .bb.
        """, {"a": BULB[3], "b": BULB[1], "c": BULB[6], "d": BULB[4], "e": BULB[5]})
        for x, y in ((5, 7), (10, 8), (7, 5), (8, 10)):
            if not A[y, x, 3]:
                A[y, x] = ca(BULB[2], 0.45)
        frames.append(A)
    particle("end_spore", frames)


def end_dust():
    """Fine grey dust: a few soft clumps of moon dust drifting apart and thinning out."""
    clumps_ = [(7.0, 7.0, "ab|bc"), (10.5, 9.0, "ab|b."), (5.0, 10.0, "a.|bc"), (9.0, 4.5, "ab")]
    frames = []
    for k in range(4):
        A = blank()
        spread = 1 + k * 0.4
        alpha = (0.95, 0.85, 0.65, 0.42)[k]
        for i, (x, y, art) in enumerate(clumps_[: 4 - (k // 2)]):
            x = 7.5 + (x - 7.5) * spread
            y = 7.5 + (y - 7.5) * spread - k * 0.5
            for j, row in enumerate(art.split("|")):
                for i2, ch in enumerate(row):
                    if ch != ".":
                        put_px(A, x + i2, y + j, ca(SAND[{"a": 7, "b": 5, "c": 3}[ch]], alpha))
        frames.append(A)
    particle("end_dust", frames)


def eclipse_mote():
    """A violet-gold mote: a four-pointed star that blooms, flares and fades (gold core, violet tips)."""
    arts = [
        """
        ..a..
        .aca.
        ..a..
        """,
        """
        ...a...
        ...b...
        .abdba.
        ...b...
        ...a...
        """,
        """
        ....a....
        ....b....
        ...bcb...
        .abcedba.
        ...bcb...
        ....b....
        ....a....
        """,
        """
        .....a.....
        .....a.....
        .....b.....
        ....bcb....
        ..abcdcba..
        aabcdedcbaa
        ..abcdcba..
        ....bcb....
        .....b.....
        .....a.....
        .....a.....
        """,
        """
        ....a....
        ....a....
        ...aba...
        .aabcbaa.
        ...aba...
        ....a....
        ....a....
        """,
        """
        ..a..
        .aba.
        ..a..
        """,
    ]
    key = {"a": BULB[1], "b": BULB[3], "c": HOT[5], "d": HOT[6], "e": HOT[8]}
    frames = []
    for art in arts:
        A = blank()
        rows = [r_.strip() for r_ in art.strip("\n").splitlines()]
        h = len(rows)
        stamp(A, 8 - (len(rows[0]) + 1) // 2, 8 - (h + 1) // 2, art, key)
        frames.append(A)
    particle("eclipse_mote", frames)


BLIND = ["#6c6679", "#8e899b", "#aeaab8", "#ccc9d2", "#e6e4e8", "#fbfaf8"]
BREATH = ["#3b3446", "#554d60", "#71697a", "#8d8696", "#aaa3b0"]


def blinding_dust():
    """Gucker spit: a dense pale puff that billows out and thins (6 frames)."""
    r = rng_for("blinding_dust")
    frames = []
    for k in range(6):
        s = 0.55 + 0.13 * k
        circles = [(8 + dx * s, 8 + dy * s, rr * s) for dx, dy, rr in
                   ((0, 0.5, 4.0), (-3.0, 1.5, 3.2), (3.0, 1.2, 3.4), (-1.5, -2.2, 3.0), (2.0, -2.5, 2.8),
                    (0.5, 3.5, 2.8))]
        alpha = (0.95, 0.95, 0.9, 0.8, 0.62, 0.42)[k]
        frames.append(puff_frame(circles, BLIND, alpha, base=3.2, gain=5.0, ragged=(0, 0, 0, 3, 6, 9)[k],
                                 sd_=seed("blinding_dust", k)))
    particle("blinding_dust", frames)


def gucker_breath():
    """Breath from a gucker's vents: a small dusty puff with a faint teal glow at birth, rising and fading."""
    frames = []
    for k in range(5):
        s = 0.5 + 0.14 * k
        circles = [(8 + dx * s, 9 - k * 0.6 + dy * s, rr * s) for dx, dy, rr in
                   ((0, 0, 3.8), (-2.6, 1.0, 2.8), (2.4, 0.8, 3.0), (0.6, -2.6, 2.8))]
        alpha = (0.9, 0.85, 0.75, 0.55, 0.35)[k]
        A = puff_frame(circles, BREATH, alpha, base=2.3, gain=4.5)
        if k <= 1:                                                    # the vent's glow, still in the puff
            cy = int(9 - k * 0.6 + 1)
            for x, y, c in ((7, cy, TEAL[5]), (8, cy, TEAL[4]), (7, cy + 1, TEAL[3]), (8, cy - 1, TEAL[3])):
                if A[y, x, 3]:
                    A[y, x] = ca(c, alpha if k == 0 else alpha * 0.7)
        frames.append(A)
    particle("gucker_breath", frames)


def enderfly_scale():
    """A shimmering wing scale tumbling: broad lilac, edge-on glint, broad teal, edge-on (4 frames)."""
    flat = """
         ..ab..
         .abbc.
         abbbcc
         bbbccd
         .bccd.
         ..cd..
         """
    edge = """
         ....a
         ...ab
         ..ab.
         .bc..
         bc...
         c....
         """
    arts = [(flat, {"a": WING[9], "b": WING[7], "c": WING[5], "d": WING[3]}),
            (edge, {"a": "#ffffff", "b": WING[8], "c": WING[5]}),
            (flat, {"a": TEAL[6], "b": TEAL[5], "c": TEAL[4], "d": TEAL[2]}),
            (edge.replace("a", "x").replace("c", "a").replace("x", "c"), {"a": PETAL[6], "b": TEAL[5], "c": "#ffffff"})]
    frames = []
    for art, key in arts:
        A = blank()
        stamp(A, 5, 5, art, key)
        frames.append(A)
    particle("enderfly_scale", frames)


def obsidian_crack():
    """Shards of a shattered obsidian shell: four angular chips (pick one, or let them tumble)."""
    shapes = [
        [(3, 11), (6, 4), (12, 3), (13, 8), (8, 13)],
        [(4, 6), (11, 3), (13, 11), (6, 12)],
        [(5, 12), (4, 7), (9, 3), (12, 6), (10, 11)],
        [(3, 9), (7, 4), (13, 6), (11, 9), (6, 12)],
    ]
    frames = []
    for k, poly in enumerate(shapes):
        X, Y = ss_coords(16, 16, 4)
        m = down((sd_poly(X, Y, poly) < 0).astype(float), 4) >= 0.5
        yy, xx = np.mgrid[0:16, 0:16] + 0.5
        cx, cy = np.mean([p[0] for p in poly]), np.mean([p[1] for p in poly])
        I = np.where((xx - cx) * 0.7 + (yy - cy) * -0.7 > 0, 2, 4)      # two facets
        I = np.where(m & ~erode(m) & ((xx < cx) | (yy < cy)), 6, I)    # lit edges toward the light
        A = paint(np.where(m, I, -1), OBS, OBS_SHEEN, (xx + yy) > cx + cy + 2)
        hx, hy = min(poly, key=lambda p: p[0] + p[1])
        put_px(A, hx + 1, hy + 1, OBS[9])
        frames.append(outline(A, "#030205"))
    particle("obsidian_crack", frames)


def meteor_spark():
    """A hot spark: a white-gold star with orange arms that shrinks and cools through orange to violet."""
    arts = [
        ("""
         ....a....
         ....b....
         ...bcb...
         .abcdcba.
         ...bcb...
         ....b....
         ....a....
         """, {"a": HOT[3], "b": HOT[5], "c": HOT[7], "d": HOT[8]}),
        ("""
         ...a...
         ...b...
         .abcba.
         ...b...
         ...a...
         """, {"a": HOT[3], "b": HOT[5], "c": HOT[7]}),
        ("""
         ..a..
         .abа.
         ..a..
         """.replace("а", "a"), {"a": HOT[2], "b": HOT[5]}),
        ("""
         .a.
         aba
         .a.
         """, {"a": HOT[1], "b": HOT[4]}),
        ("""
         ab
         bc
         """, {"a": HOT[2], "b": HOT[1], "c": HOT[0]}),
    ]
    frames = []
    for art, key in arts:
        A = blank()
        rows = [r_.strip() for r_ in art.strip("\n").splitlines()]
        stamp(A, 8 - (len(rows[0]) + 1) // 2, 8 - (len(rows) + 1) // 2, art, key)
        frames.append(A)
    particle("meteor_spark", frames)


end_spore()
end_dust()
eclipse_mote()
blinding_dust()
gucker_breath()
enderfly_scale()
obsidian_crack()
meteor_spark()


# ====================================================================== the eclipse sky (256 x 256)
# The moon and the corona share one frame: draw both on the same quad, centred, same size. The moon's disc has a
# radius of MOON_R px (of 256); the corona's light starts at that rim and fades out before the texture's edge.
# eclipse_moon: straight alpha, draw with ordinary alpha blending (the disc is opaque and hides the stars).
# eclipse_corona: straight alpha (rgb = colour, alpha = intensity), draw with SRC_ALPHA, ONE (additive, like
# vanilla's sun) after the moon. It is a strip of CORONA_FRAMES frames (256 x 256 each, top to bottom); environment
# textures are not on an atlas, so vanilla will not animate it: the renderer picks the frame itself,
# frame = (gameTime / 4) % 8, v0 = frame / 8, v1 = (frame + 1) / 8. The .mcmeta records the timing.
MOON_R = 72
CORONA_FRAMES = 8
MOON = ramp("#060409", "#0a0711", "#0f0a18", "#140e20", "#1a1229", "#211733", "#2a1d3f", "#35254d")
RIM_GOLD = ramp("#7a4a2a", "#c98a3c", "#ffc35a", "#ffe49a", "#fff8e0")
RIM_VIOLET = ramp("#3a1670", "#6a2fc0", "#9a5cf2", "#c79aff", "#efe0ff")
CORONA = ["#2a0f5c", "#43188c", "#6224b8", "#8336dc", "#a24cf0", "#c070f2", "#dc96e6", "#f2b98a", "#ffd47a",
          "#ffe9a8", "#fff6dc"]


def eclipse_moon():
    n = 256
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    cx = cy = n / 2
    r = np.hypot(xx - cx, yy - cy)
    disc = r < MOON_R
    # faint earthshine on the dark face: soft maria and a few ringed craters, lit from the top-left
    H = (fbm(n, n, 4, seed("moon", "maria"), 3) - 0.5) * 3.0
    rr = rng_for("moon", "craters")
    for _ in range(9):
        a, d = rr.uniform(0, 2 * math.pi), MOON_R * math.sqrt(rr.uniform(0, 0.75))
        px, py, rad = cx + math.cos(a) * d, cy + math.sin(a) * d, rr.uniform(4, 12)
        q = np.hypot(xx - px, yy - py) / rad
        H += np.where(q < 1, -(1 - q ** 2) * 1.0, 0) + np.exp(-((q - 1.1) / 0.2) ** 2) * 0.5
    T = 3.2 + lit(H, 0.9, wrap=False) * 4.0 - np.clip((r - MOON_R * 0.75) / (MOON_R * 0.25), 0, 1) * 1.6
    I = despeckle(quant(T, len(MOON), 0, 6), wrap=False)
    A = paint(np.where(disc, I, -1), MOON)
    # the lit rim: gold on the upper-left arc, violet round the rest, thickest and brightest where it is gold
    ang = np.arctan2(yy - cy, xx - cx)
    gold = np.clip(np.cos(ang - (-3 * math.pi / 4)), 0, 1) ** 1.5          # 1 toward the top-left
    depth = MOON_R - r                                                     # px in from the edge
    thick = 1.2 + 2.2 * gold + 0.6 * np.sin(ang * 7) ** 2
    ring = disc & (depth < thick)
    lvl = np.clip(np.floor((1 - depth / thick) * 4 + gold * 1.2), 0, 4).astype(int)
    for k in range(5):
        sel = ring & (lvl == k)
        A[sel] = np.where((gold[sel] > 0.35)[:, None], RIM_GOLD[k], RIM_VIOLET[k])
    halo = ~disc & (r < MOON_R + 1.5)                                     # a soft outer edge
    A[halo] = [ca(RIM_GOLD[3] if g > 0.35 else RIM_VIOLET[2], 0.55) for g in gold[halo]]
    put("textures/environment/eclipse_moon.png", to_img(A))


def eclipse_corona():
    n = 256
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    cx = cy = n / 2
    r = np.hypot(xx - cx, yy - cy)
    ang = np.arctan2(yy - cy, xx - cx)
    rr = rng_for("corona")
    rays = [(rr.uniform(-math.pi, math.pi), rr.uniform(0.03, 0.10), rr.uniform(16, 50), rr.uniform(0.35, 0.85),
             rr.uniform(-0.25, 0.25), rr.uniform(0, 2 * math.pi)) for _ in range(26)]
    out = r - MOON_R
    fade = np.clip((124 - r) / 14, 0, 1)                                   # gone before the quad's edge
    cols = np.array([rgba(c) for c in CORONA], np.uint8)
    frames = []
    for f in range(CORONA_FRAMES):
        ph = 2 * math.pi * f / CORONA_FRAMES
        I = np.exp(-((out - 1.5) / 3.5) ** 2) * 0.75                       # the gold ring hugging the rim
        I += np.exp(-np.clip(out, 0, None) / 12.0) * 0.5                   # the soft glow
        for th, wd, ln, b, curl, p in rays:
            th2 = th + curl * np.clip(out, 0, None) / 50                   # streamers bend a little outward
            dth = np.angle(np.exp(1j * (ang - th2)))
            shimmer = 0.72 + 0.28 * math.sin(ph + p)
            L = ln * (1 + 0.12 * math.sin(ph * 2 + p))
            I += np.exp(-(dth / wd) ** 2) * np.exp(-np.clip(out, 0, None) / L) * b * shimmer
        # fine flickering filaments
        I *= 0.9 + 0.1 * np.sin(ang * 37 + ph * 3) * np.clip(out / 20, 0, 1)
        I = np.where(out > 0, I, 0) * fade
        lvl = np.clip(np.floor(I * 7.2), 0, len(CORONA) - 1).astype(int)
        A = np.zeros((n, n, 4), np.uint8)
        on = (I > 0.07) & (out > 0)
        A[on] = cols[lvl[on]]
        A[on, 3] = np.clip(np.round(np.minimum(I[on], 1.0) * 255 / 17) * 17, 0, 255).astype(np.uint8)
        frames.append(A)
    animated("textures/environment/eclipse_corona.png", frames, frametime=4)


# ====================================================================== effects: the beam, the shell, icons
def dragon_light_beam():
    """A vertical strip of white-violet light (32 x 128, tiles vertically): a white core, lilac and violet
    falloff to the edges, bright streaks running along it and a few sparkles. Straight alpha; scroll v."""
    w, h = 32, 128
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    dx = np.abs(xx - w / 2)
    streak = pnoise(w, h, 8, 4, seed("beam", "streak"))                  # periodic along the beam
    I = np.exp(-(dx / 7.5) ** 2) * 1.1 + (streak - 0.5) * 0.5 * np.exp(-(dx / 11) ** 2)
    I = np.clip(I, 0, None)
    lvls = [("#3c148c", 0.22), ("#5a22c0", 0.38), ("#8040e8", 0.55), ("#a868ff", 0.72), ("#cba0ff", 0.86),
            ("#e8d6ff", 0.95), ("#ffffff", 1.0)]
    k = np.clip(np.floor(I * 6.2), -1, 6).astype(int)
    A = np.zeros((h, w, 4), np.uint8)
    for i, (c, a) in enumerate(lvls):
        A[k == i] = ca(c, a)
    A[dx < 1.5] = rgba("#ffffff")
    r = rng_for("beam", "sparkle")
    for _ in range(10):
        x, y = int(r.uniform(9, 23)), int(r.integers(h))
        stamp(A, x - 1, y - 1, """
            .a.
            aba
            .a.
        """, {"a": "#e8d6ff", "b": "#ffffff"}, wrap=True)
    put("textures/entity/dragon_light_beam.png", to_img(A))


def obsidian_shell():
    """32 x 32 tileable obsidian crust for petrified mobs: rough glassy flakes split by glowing crying cracks."""
    name = "obsidian_shell"
    w = h = 32
    r = rng_for(name)
    pts = jitter_points(w, h, 4, 4, r, 0.9)
    F1, F2, idx, dx, dy = voronoi(w, h, pts)
    Hf = np.sqrt(np.clip(1 - (F1 / 7.0) ** 2, 0, 1)) * 2.0 + (fbm(w, h, 4, seed(name, "g"), 2) - 0.5) * 0.8
    T = 2.8 + lit(Hf, 1.3) * 6.0
    tone = np.array([r.uniform(-0.5, 0.5) for _ in pts])[idx]
    I = despeckle(quant(T + tone, 10, 1, 6))
    I[(F2 - F1) < 1.0] = 1
    # glass glints on the flakes facing the light
    for k in range(len(pts)):
        ys, xs = np.nonzero((idx == k) & (lit(Hf, 1.3) > 0.25))
        if len(xs) and r.random() < 0.7:
            j = int(r.integers(len(xs)))
            I[ys[j], xs[j]] = 8
            I[ys[j], (xs[j] + 1) % w] = 7
    A = paint(I, OBS, OBS_SHEEN, sheen_mask(name, w, h, 0.6))
    core, thick = fissures(name, w, h, [(2, 5, 0.95, 24, 2), (30, 10, 2.3, 11, 1)])
    d = chamfer(~(core | thick), True, cap=6)
    A[(d > 0) & (d <= 1)] = OBS_SHEEN[np.clip(I + 2, 0, 9)][(d > 0) & (d <= 1)]
    A[thick] = CRY[2]
    A[core] = CRY[4]
    A[core & dilate(thick, True)] = CRY[5]
    put("textures/entity/obsidian_shell.png", to_img(A))
    TILES.add("textures/entity/obsidian_shell.png")


def effect_icon(name, A):
    put(f"textures/mob_effect/{name}.png", to_img(outline(A, "#0b0714", "#1d1430")))


def mob_effects():
    n = 18
    yy, xx = np.mgrid[0:n, 0:n] + 0.5
    # end_glow: a glowing bulb in a dashed ring of light, four glints round it
    A = np.zeros((n, n, 4), np.uint8)
    d = np.hypot(xx - 9, yy - 9)
    ang = np.arctan2(yy - 9, xx - 9)
    A[(np.abs(d - 7.0) < 0.6) & (np.cos(ang * 8) > 0.2)] = BULB[1]
    bulb = d < 4.7
    A[bulb] = BULB[2]
    A[bulb & (xx + yy < 18.5)] = BULB[3]
    A[d < 3.1] = BULB[4]
    A[d < 1.7] = BULB[6]
    put_px(A, 7, 7, "#ffffff")
    put_px(A, 6, 8, BULB[5])
    for x, y in ((3, 3), (14, 3), (3, 14), (14, 14)):
        stamp(A, x - 1, y - 1, """
            .a.
            aba
            .a.
        """, {"a": BULB[2], "b": BULB[5]})
    effect_icon("end_glow", A)
    # petrified: a figure frozen mid-flinch, arms up, cased in faceted obsidian and split by a glowing crack
    L = Layers(n, n)
    for sdf in (lambda X, Y: sd_segment(X, Y, 7.0, 11.5, 6.0, 16.0, 1.4),          # legs
                lambda X, Y: sd_segment(X, Y, 11.0, 11.5, 12.0, 16.0, 1.4),
                lambda X, Y: sd_segment(X, Y, 9.0, 7.5, 9.0, 11.5, 2.8),            # body
                lambda X, Y: sd_segment(X, Y, 6.5, 7.5, 2.8, 3.0, 1.2),             # arms raised
                lambda X, Y: sd_segment(X, Y, 11.5, 7.5, 15.2, 3.0, 1.2),
                lambda X, Y: sd_circle(X, Y, 9.0, 4.0, 2.6)):                       # head
        L.add(sdf, OBS, 4.8, gain=8, bevel=1.4, edge=-2)
    A = L.A
    for x, y in line_px(10, 2, 8, 6) + line_px(8, 6, 10, 9) + line_px(10, 9, 9, 13):
        if A[y, x, 3]:
            A[y, x] = CRY[4]
    put_px(A, 8, 6, CRY[6])
    put_px(A, 10, 9, CRY[5])
    put_px(A, 8, 3, OBS[9])
    effect_icon("petrified", A)
    # recall: a returning arrow sweeping clockwise round the spawn point (a white-teal spark)
    A = np.zeros((n, n, 4), np.uint8)
    c = (9.0, 9.5)
    d = np.hypot(xx - c[0], yy - c[1])
    ang = np.arctan2(yy - c[1], xx - c[0])
    a0, a1 = -0.45, -1.35                                             # the gap between 12:30 and 2 o'clock
    t = ((ang - a0) % (2 * math.pi)) / ((a1 - a0) % (2 * math.pi))   # 0 at the tail, 1 at the head
    arc = (d > 4.5) & (d < 6.9) & (t <= 1.0)
    rc = [TEAL[3], TEAL[4], TEAL[5], PETAL[6], PETAL[7]]
    lvl = np.clip(np.floor(t * 5), 0, 4).astype(int)
    for k in range(5):
        A[arc & (lvl == k)] = rgba(rc[k])
    A[arc & (d > 6.0) & (yy > c[1] + 1)] = rgba(TEAL[2])               # shade on the lower outer edge
    tip = (c[0] + 5.7 * math.cos(-0.8), c[1] + 5.7 * math.sin(-0.8))
    b1 = (c[0] + 2.9 * math.cos(a1), c[1] + 2.9 * math.sin(a1))
    b2 = (c[0] + 8.6 * math.cos(a1), c[1] + 8.6 * math.sin(a1))
    X, Y = ss_coords(n, n, 4)
    head = down((sd_poly(X, Y, [tip, b1, b2]) < 0).astype(float), 4) >= 0.5
    A[head] = rgba(PETAL[8])
    A[head & (xx + yy > tip[0] + tip[1] - 3)] = rgba(PETAL[6])
    stamp(A, 8, 8, """
        .a.
        aba
        .a.
    """, {"a": TEAL[5], "b": "#ffffff"})
    effect_icon("recall", A)


eclipse_moon()
eclipse_corona()
dragon_light_beam()
obsidian_shell()
mob_effects()


# ====================================================================== preview sheets
CHK = ((156, 156, 160, 255), (118, 118, 124, 255))


def _on(bg, im):
    base = bg.copy()
    base.alpha_composite(im)
    return base


def _first(rel):
    """The first frame of an animated strip (or the image itself)."""
    im = OUT[rel]
    return im.crop((0, 0, im.width, im.width)) if rel in ANIM and im.height > im.width else im


def contact_sheet(paths, dst, scale=8, cols=3):
    """Each texture big on a checkerboard and on dark, 3 x 3 if it tiles, and at 1x / 2x on vanilla grey."""
    tiles = []
    for rel in paths:
        im = _first(rel)
        w, h = im.size
        s = scale if max(w, h) <= 32 else max(1, 384 // max(w, h))
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
    for n in names:
        fr = sorted((rel for rel in OUT if rel.startswith(f"textures/particle/{n}_")),
                    key=lambda r: int(r.rsplit("_", 1)[1][:-4]))
        out.append((n, [OUT[r] for r in fr]))
    return out


def strips(rows_in, dst, scale=8, label_w=170):
    """One row per sequence: every frame left to right, on a checkerboard and on dark."""
    rows = []
    for label, ims in rows_in:
        s = scale if ims[0].width <= 32 else max(1, scale * 32 // ims[0].width)
        tw, th = ims[0].width * s, ims[0].height * s
        row = Image.new("RGBA", (label_w + len(ims) * (tw * 2 + 12), th + 8), (34, 34, 40, 255))
        ImageDraw.Draw(row).text((4, 4), f"{label} x{len(ims)}", fill=(235, 235, 235, 255))
        for i, im in enumerate(ims):
            big = im.resize((tw, th), Image.NEAREST)
            x = label_w + i * (tw * 2 + 12)
            row.paste(_on(checker((tw, th), *CHK, cell=s), big), (x, 4))
            row.paste(_on(Image.new("RGBA", (tw, th), (16, 12, 26, 255)), big), (x + tw + 2, 4))
        rows.append(row)
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), (28, 28, 33, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(dst)
    return dst


def everything(dst, scale=6):
    """Every texture (first frame) at `scale`x on one dark sheet, labelled, grouped by folder."""
    groups = {}
    for rel in sorted(OUT):
        groups.setdefault(rel.split("/")[-2], []).append(rel)
    cells = []
    for g in ("block", "item", "particle", "mob_effect", "entity", "environment"):
        for rel in groups.get(g, []):
            im = _first(rel)
            s = scale if max(im.size) <= 32 else max(1, 192 // max(im.size))
            if rel.endswith("dragon_light_beam.png"):
                s = 1
            big = im.resize((im.width * s, im.height * s), Image.NEAREST)
            cells.append((rel.split("/")[-1][:-4], big))
    cw = 200
    x = y = 0
    rowh = 0
    placed = []
    W = 1400
    for label, big in cells:
        w = max(cw, big.width + 8)
        if x + w > W:
            x, y, rowh = 0, y + rowh, 0
        placed.append((x, y, label, big))
        x += w
        rowh = max(rowh, big.height + 22)
    sheet = Image.new("RGBA", (W, y + rowh + 8), (22, 20, 30, 255))
    d = ImageDraw.Draw(sheet)
    for x, y, label, big in placed:
        sheet.paste(_on(Image.new("RGBA", big.size, (34, 30, 46, 255)), big), (x + 4, y + 18))
        d.text((x + 4, y + 4), label, fill=(230, 226, 240, 255))
    sheet.save(dst)
    return dst


# ====================================================================== output
def write_all():
    for rel, im in sorted(OUT.items()):
        dst = ASSETS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst)
    for rel, body in sorted(JSON.items()):
        dst = ASSETS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(body, indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write contact sheets here")
    ap.add_argument("--no-write", action="store_true", help="do not write into the mod assets")
    a = ap.parse_args()
    if not a.no_write:
        write_all()
    for rel, im in sorted(OUT.items()):
        print(f"{rel:58s} {im.size[0]}x{im.size[1]}")
    for rel in sorted(JSON):
        print(rel)
    if a.preview:
        p = a.preview
        p.mkdir(parents=True, exist_ok=True)
        for g in ("block", "item", "mob_effect", "entity", "environment"):
            paths = sorted(r for r in OUT if r.split("/")[-2] == g)
            if paths:
                print("sheet:", contact_sheet(paths, p / f"end_{g}.png", cols=2 if g == "environment" else 3))
        if particle_rows():
            print("sheet:", strips(particle_rows(), p / "end_particles.png", scale=10))
        if ANIM:
            print("sheet:", strips([(r.split("/")[-1], ims) for r, ims in sorted(ANIM.items())],
                                   p / "end_anim.png", scale=4))
        print("sheet:", everything(p / "end_everything.png"))


if __name__ == "__main__":
    main()
