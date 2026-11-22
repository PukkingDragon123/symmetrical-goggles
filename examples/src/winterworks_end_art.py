#!/usr/bin/env python3
"""Winterworks pixel art for The Living End (mods/winterworks/docs/END_UPDATE.md, section 15).

    python examples/src/winterworks_end_art.py                  # write all PNGs, .mcmeta and particle jsons
    python examples/src/winterworks_end_art.py --preview DIR    # also write contact sheets to DIR

Twice the resolution of the older Winterworks art: blocks and items are 32 x 32, particles 16 x 16, the eclipse sky
textures 256 x 256 and the mob-effect icons 18 x 18. At that size every sprite is too big to place pixel by pixel
in an ASCII grid as the older generators do, so each one is *built* here from hand-chosen parts: brick and tile
layouts, crack paths, blade and branch lists, silhouettes (signed-distance shapes) and height fields, lit from the
top-left and then quantised onto hand-picked, hue-shifted ramps (dark -> light). Small hand-placed ASCII stamps add
the pixels that must be exact (eyes, catchlights, glints, glyphs). Every random choice is seeded by the texture's
name, so a run always writes the same files.

Rules (as winterworks_art.py): light from the top-left; dark hue-shifted outlines, never pure black; tone in
clusters, never single-pixel noise (`despeckle` cleans every block); only glows are saturated. Obsidian is
violet-black glass (crisp highlight dashes, a faint purple sheen); end stone matches vanilla's pale yellow;
chorus matches vanilla's chorus mauve. Blocks that tile wrap at their edges (all noise, voronoi and strokes here
are periodic); pillar sides tile vertically.

Animated textures are vertical frame strips + `<png>.mcmeta` (`frametime` in ticks, `interpolate` for the pulses):
meteorite, meteorite_core and end_bloom_glow (atlas textures, so vanilla animates them), and
environment/eclipse_corona, which is NOT on an atlas: its renderer picks the frame itself (see the corona section).
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
# Crying-obsidian light (cracks in the shell and the cracked dragon eggs): ink violet -> lilac -> white.
CRY = ramp("#25064f", "#45099a", "#6c16d0", "#9440f2", "#bb82ff", "#e2c6ff", "#fbf3ff")
# Meteorite: scorched fusion crust (warm black-brown) with cool iron-nickel lights.
MET = ramp("#0b0708", "#130e0f", "#1c1617", "#262021", "#312a2a", "#3e3535", "#4d4343", "#625857", "#867e7c",
           "#bab4b0")
# The meteorite's glow, edge -> core: violet, magenta, rose, orange, amber, gold, white.
HOT = ramp("#3a0c5c", "#6c1585", "#a8237f", "#e04a5a", "#ff7d2a", "#ffad35", "#ffd76a", "#fff4c2", "#fffdf2")
# End stone, close to vanilla's (pale yellow): pits lean olive, lights lean cream.
ENDSTONE = ramp("#8b8458", "#a49d6c", "#b9b27f", "#c9c48d", "#d6d699", "#e2e5a7", "#edf2b4", "#f7fbc6")
# End grass: violet, more saturated and bluer than purpur.
GRASS = ramp("#170b26", "#25123d", "#361b57", "#4a2574", "#5f318f", "#7740a8", "#9156bf", "#ad74d4", "#c995e4",
             "#e3bdf2")
# End moss: magenta body, teal tips.
MOSS = ramp("#1f0a22", "#3a1238", "#561a4e", "#752364", "#963079", "#b4448c", "#d0629f", "#ea8cb8")
TEAL = ramp("#0c2c33", "#124a4f", "#1a6b6a", "#289082", "#4bb59d", "#86d9bb", "#c4f5df")
# Chorus: vanilla's chorus-plant mauve, a little richer; roots darker and browner.
CHORUS = ramp("#1c0a1f", "#2b112e", "#3c1a3f", "#502752", "#653665", "#7c4a7b", "#956494", "#b083ad", "#cca6c8",
              "#e8cde4")
ROOTS = ramp("#0f080d", "#1a0f17", "#261622", "#341f2d", "#45293a", "#58364a", "#6d465a", "#86606f")
# End sand: pale grey moon dust; shadows lean violet, lights lean warm.
SAND = ramp("#46434e", "#5a5762", "#6f6c76", "#85828a", "#9a979d", "#aeacae", "#c1bfbd", "#d3d1cc", "#e3e1da")
# Dry End bush: brittle grey wood.
TWIG = ramp("#1f1b22", "#332e37", "#4a444d", "#625b62", "#7c7479", "#988f91", "#b6adab")


def mix(a, b, t):
    """Blend two colours (rgba tuples) by t in 0..1."""
    a, b = np.array(rgba(a), float), np.array(rgba(b), float)
    return tuple(int(round(v)) for v in a + (b - a) * t)


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


def from_img(im):
    return np.array(im.convert("RGBA"))


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


def item_shade(sdf_fn, w=32, h=32, ss=4, bevel=4.0, strength=1.0, light=LIGHT, extra=None):
    """Coverage + light for an item silhouette given as a signed-distance function of (X, Y).

    The inside distance is turned into a rounded bevel of radius `bevel` px; `extra(X, Y)` adds height detail.
    Returns (coverage 0..1, light -1..1, inside distance) at 1x."""
    X, Y = ss_coords(w, h, ss)
    D = sdf_fn(X, Y)
    t = np.clip(-D / bevel, 0, 1)
    H = np.sqrt(1 - (1 - t) ** 2) * bevel
    if extra is not None:
        H = H + extra(X, Y) * (D < 0)
    gy, gx = np.gradient(H, 1.0 / ss)
    n = np.dstack([-gx * strength, -gy * strength, np.ones_like(H)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = (n @ light) - light[2]
    inside = D < 0
    cov = down(inside.astype(float), ss)
    Lm = down(np.where(inside, L, 0.0), ss) / np.maximum(cov, 1e-9)
    return cov, Lm, down(np.where(inside, -D, 0.0), ss) / np.maximum(cov, 1e-9)


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


# ====================================================================== the obsidian set
# Like vanilla's deepslate set, cut from violet-black glass: a dark body (steps 1-4) with soft conchoidal ripples,
# lit top/left rims, crisp highlight dashes (7-9) and a faint purple sheen (OBS_SHEEN) drifting across the faces.
def glass_body(name, lab, U, V, BW, BH, base=2.7, spread=0.35, ripple=0.75):
    """Per-pixel tone (ramp steps) for an obsidian face: per-brick value, conchoidal ripple arcs, a soft cloud."""
    w, h = lab.shape[1], lab.shape[0]
    r = rng_for(name, "body")
    T = np.full((h, w), base) + (fbm(w, h, 2, seed(name, "cloud"), 2) - 0.5) * 0.9
    yy, xx = np.mgrid[0:h, 0:w]
    for k in range(lab.max() + 1):
        m = lab == k
        if not m.any():
            continue
        T[m] += r.uniform(-spread, spread)
        # a ripple of concentric arcs from a point near one of the brick's corners (a conchoidal fracture)
        bw, bh = BW[m][0], BH[m][0]
        cu, cv = r.choice([-0.6, 1.6]) * bw + r.uniform(-2, 2), r.choice([-0.5, 1.5]) * bh + r.uniform(-2, 2)
        d = np.hypot(U[m] - cu, (V[m] - cv) * 1.2)
        period = r.uniform(4.5, 6.5)
        band = np.cos(d / period * 2 * math.pi)
        T[m] += np.where(band > 0.78, ripple, 0.0) - np.where(band < -0.9, ripple * 0.5, 0.0)
    return T


def sheen_mask(name, w, h, amount=0.66):
    return fbm(w, h, 2, seed(name, "sheen"), 2) > amount


def glints(I, lab, U, V, BW, BH, rng, chance=0.8, long=(2, 4), wrap=True, diagonal=0.35):
    """Glass highlight dashes on the upper part of a face, and a dim reflected dash low on its right."""
    h, w = I.shape
    for k in range(lab.max() + 1):
        m = lab == k
        if not m.any() or rng.random() > chance:
            continue
        ys, xs = np.nonzero(m & (U == 0) & (V == 0))
        if not len(xs):
            continue
        x0, y0 = int(xs[0]), int(ys[0])
        bw, bh = int(BW[m][0]), int(BH[m][0])
        L = int(rng.integers(long[0], long[1] + 1))
        u = int(rng.integers(2, max(3, bw // 2 - L)))
        if rng.random() > diagonal or bh < 8:       # a dash along the upper lip
            v = int(rng.integers(2, 3 if bh < 10 else 4))
            px = [(x0 + u + i, y0 + v) for i in range(L)]
        else:                                       # a short diagonal glint
            px = [(x0 + u + i, y0 + 2 + i) for i in range(min(L, 3))]
        for i, (x, y) in enumerate(px):
            I[y % h, x % w] = 8 if i == 0 else 7
        if L >= 3 and rng.random() < 0.3:
            x, y = px[0]
            I[y % h, x % w] = 9
        if bw >= 10 and bh >= 6 and rng.random() < 0.6:  # reflected light low on the right
            for i in range(min(3, bw - 6)):
                x, y = x0 + bw - 3 - i, y0 + bh - 3
                I[y % h, x % w] = max(I[y % h, x % w], 4)
    return I


def obsidian_masonry(name, rows, base=2.7, ripple=0.75, glint=0.8, glint_long=(2, 4), hi=(+2.5, +1), lo=(-1.5,),
                     diagonal=0.35):
    w = h = 32
    lab, U, V, BW, BH = bond(w, h, rows)
    T = glass_body(name, lab, U, V, BW, BH, base=base, ripple=ripple)
    off, mortar = bevel_steps(U, V, BW, BH, hi=hi, lo=lo)
    I = quant(T, 10, 1, 4)
    I = despeckle(I)
    I = np.where(off != 0, quant(I + off, 10, 1, 7), I)
    I[mortar] = 0
    I = glints(I, lab, U, V, BW, BH, rng_for(name, "glint"), glint, glint_long, diagonal=diagonal)
    return I, (lab, U, V, BW, BH, mortar)


def obsidian_paint(name, I):
    return paint(I, OBS, OBS_SHEEN, sheen_mask(name, *I.shape[::-1]))


BRICKS = [(0, 8, [0, 18]), (8, 8, [9, 25]), (16, 8, [3, 17]), (24, 8, [11, 26])]
TILE_GRID = [(y, 8, [0, 8, 16, 24]) for y in (0, 8, 16, 24)]


def crack_bricks(name, I, geo, n=4, chips=3):
    """Cracks across the faces (dark grooves with a lit lower wall) and chipped corners."""
    lab, U, V, BW, BH, mortar = geo
    h, w = I.shape
    r = rng_for(name, "cracks")
    face = ~mortar
    for _ in range(n):
        x, y = r.uniform(0, w), r.uniform(0, h)
        ang = r.uniform(0, 2 * math.pi)
        pts = crack_path(r, x, y, ang, r.uniform(9, 15), wobble=0.6)
        if r.random() < 0.6:                            # a branch off the middle
            mx, my = pts[len(pts) // 2]
            pts2 = crack_path(r, mx, my, ang + r.choice([-1, 1]) * r.uniform(0.6, 1.2), r.uniform(3, 6), 0.5)
        else:
            pts2 = []
        for P in (pts, pts2):
            if P:
                I, _ = carve(I, poly_px(P), w, h, deep=0, lit_step=1, shade_step=-1, lo=0, hi=7, mask=face)
    # chipped corners: a small triangle broken out of a brick corner, dark, with a lit broken edge below it
    keys = list(range(lab.max() + 1))
    r.shuffle(keys)
    for k in keys[:chips]:
        m = lab == k
        corner = r.integers(0, 4)
        bw, bh = BW[m][0], BH[m][0]
        uu = U if corner in (0, 2) else (BW - 2 - U)
        vv = V if corner in (0, 1) else (BH - 2 - V)
        s = r.integers(2, 4)
        tri = m & face & (uu + vv < s)
        edge = m & face & (uu + vv == s)
        I[tri] = 1
        I[edge] = 4 if corner in (0, 1) else 2
    return I


def obsidian_set():
    # bricks
    I, geo = obsidian_masonry("obsidian_bricks", BRICKS)
    block("obsidian_bricks", obsidian_paint("obsidian_bricks", I))
    Ic = crack_bricks("cracked_obsidian_bricks", I.copy(), geo, n=4, chips=3)
    block("cracked_obsidian_bricks", obsidian_paint("obsidian_bricks", despeckle(Ic, passes=1, keep=Ic == 0)))
    # tiles
    I, geo = obsidian_masonry("obsidian_tiles", TILE_GRID, base=2.6, ripple=0.6, glint=0.4, glint_long=(2, 2),
                              hi=(+2.5,), lo=(-1,), diagonal=0.0)
    block("obsidian_tiles", obsidian_paint("obsidian_tiles", I))
    Ic = crack_bricks("cracked_obsidian_tiles", I.copy(), geo, n=5, chips=4)
    block("cracked_obsidian_tiles", obsidian_paint("obsidian_tiles", despeckle(Ic, passes=1, keep=Ic == 0)))
    # polished: one slab with a double bevel, a soft top-left to bottom-right fall-off and two diagonal reflections
    w = h = 32
    lab, U, V, BW, BH = bond(w, h, [(0, 32, [0])])
    yy, xx = np.mgrid[0:h, 0:w]
    T = 3.1 - (xx + yy) / 64 * 1.4 + (fbm(w, h, 2, seed("polished_obsidian"), 2) - 0.5) * 0.5
    diag = xx + yy
    T += np.where((diag > 14) & (diag < 19), 0.9, 0) + np.where((diag > 21) & (diag < 23), 0.7, 0)
    I = despeckle(quant(T, 10, 1, 5))
    off, mortar = bevel_steps(U, V, BW, BH, hi=(+3, +1.5), lo=(-1.5, -0.5))
    I = np.where(off != 0, quant(I + off, 10, 1, 7), I)
    I[mortar] = 0
    for (x, y, v) in ((3, 3, 9), (4, 3, 8), (5, 3, 7), (6, 3, 7), (3, 4, 7), (3, 5, 6), (8, 3, 6),
                      (26, 27, 4), (27, 26, 4), (25, 27, 4)):
        I[y, x] = v
    block("polished_obsidian", obsidian_paint("polished_obsidian", I))
    chiseled_obsidian()


def chiseled_frame(name, inset=3):
    """A bevelled 3-px frame round a recessed panel (index map + the panel mask)."""
    w = h = 32
    yy, xx = np.mgrid[0:h, 0:w]
    T = 2.8 + (fbm(w, h, 2, seed(name), 2) - 0.5) * 0.7
    I = despeckle(quant(T, 10, 1, 4))
    lab, U, V, BW, BH = bond(w, h, [(0, 32, [0])])
    off, mortar = bevel_steps(U, V, BW, BH, hi=(+3, +1.5), lo=(-1.5,))
    I = np.where(off != 0, quant(I + off, 10, 1, 7), I)
    I[mortar] = 0
    panel = (xx >= inset) & (xx <= w - 2 - inset) & (yy >= inset) & (yy <= h - 2 - inset)
    I[panel] = np.clip(I[panel] - 1, 1, 9)
    # the panel's sunken rim: shaded top/left wall, lit bottom/right wall
    top = panel & ((yy == inset) | (xx == inset))
    bot = panel & ((yy == h - 2 - inset) | (xx == w - 2 - inset))
    I[top] = 1
    I[bot] = 5
    I[(yy == inset) & (xx == w - 2 - inset)] = 3
    I[(xx == inset) & (yy == h - 2 - inset)] = 3
    return I, panel


def chiseled_obsidian():
    # side: the Monolith's eye, carved into the panel; the iris is a polished boss of sheen glass
    I, panel = chiseled_frame("chiseled_obsidian")
    w = h = 32
    cx, cy = 15.0, 15.0
    t = np.linspace(0, 1, 40)
    upper = [(5 + 20 * u, cy - 7.5 * math.sin(math.pi * u)) for u in t]
    lower = [(5 + 20 * u, cy + 6.5 * math.sin(math.pi * u)) for u in t]
    I, g1 = carve(I, poly_px(upper), w, h, deep=0, lit_step=3, shade_step=-1, wrap=False, hi=7)
    I, g2 = carve(I, poly_px(lower), w, h, deep=0, lit_step=3, shade_step=-1, wrap=False, hi=7)
    # inside the eye: a raised glassy iris (sheen ramp), a slit pupil, a catchlight
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx - cx, yy - cy)
    iris = d < 4.6
    Lr = lit(-np.clip(d, 0, 4.6) ** 2 / 4, strength=0.9, wrap=False)
    I[iris] = quant(4.6 + Lr[iris] * 6, 10, 3, 7)
    ring = (d >= 4.6) & (d < 5.6)
    I[ring & ~g1 & ~g2] = 1
    I[(np.abs(xx - cx) < 0.6) & (np.abs(yy - cy) < 3.2)] = 0
    I[int(cy) - 2, int(cx) - 2] = 9
    I[int(cy) - 3, int(cx) - 1] = 8
    # notches pointing at the eye from the panel corners
    for (x, y, dx, dy) in ((5, 5, 1, 1), (26, 5, -1, 1), (5, 26, 1, -1), (26, 26, -1, -1)):
        I, _ = carve(I, [(x + dx * i, y + dy * i) for i in range(3)], w, h, deep=0, lit_step=3, wrap=False, hi=7)
    sheen = sheen_mask("chiseled_obsidian", w, h) | iris
    block("chiseled_obsidian", paint(I, OBS, OBS_SHEEN, sheen))
    # top: an eclipse carved in the panel, a disc ringed by eight rays
    I, panel = chiseled_frame("chiseled_obsidian_top")
    d = np.hypot(xx - cx, yy - cy)
    ring = [(int(round(cx + 6.5 * math.cos(a))), int(round(cy + 6.5 * math.sin(a))))
            for a in np.linspace(0, 2 * math.pi, 80)]
    I, gr = carve(I, ring, w, h, deep=0, lit_step=3, shade_step=-1, wrap=False, hi=7)
    disc = d < 5.6
    Lr = lit(-np.clip(d, 0, 5.6) ** 2 / 5, strength=0.8, wrap=False)
    I[disc] = quant(3.6 + Lr[disc] * 6, 10, 2, 7)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        ray = [(cx + r * math.cos(a), cy + r * math.sin(a)) for r in (8.0, 11.0)]
        I, _ = carve(I, poly_px(ray), w, h, deep=0, lit_step=3, wrap=False, hi=7)
    I[int(cy) - 3, int(cx) - 2] = 9
    I[int(cy) - 3, int(cx) - 1] = 8
    I[int(cy) - 2, int(cx) - 3] = 8
    block("chiseled_obsidian_top", paint(I, OBS, OBS_SHEEN, sheen_mask("chiseled_obsidian_top", w, h) | disc))


obsidian_set()


# ====================================================================== meteorites
# Scorched iron-nickel: a warm black-brown fusion crust dimpled with thumbprint pits (regmaglypts), cool metal
# glinting on the ridges, and fissures glowing white-gold at the core, orange, then rose and violet at the edges,
# with a violet spill on the rock round them. Refined blocks show the etched lattice of the metal (Widmanstatten
# lamellae) and keep the glow in their seams.
MET_SPILL = ramp("#0f0611", "#1a0a1d", "#26102b", "#341739", "#431f46", "#542a52", "#66385e", "#7e4d6e",
                 "#9b6e88", "#c4a3b4")


def regmaglypts(name, w=32, h=32, n=(3, 3), wrap=True, depth=2.2):
    """Height field of a thumbprinted crust: shallow round pits between soft ridges, plus grit."""
    r = rng_for(name, "pits")
    pts = jitter_points(w, h, *n, r, 0.9)
    pts += jitter_points(w, h, n[0] + 2, n[1] + 2, r, 0.9)[::2]
    F1, F2, idx, dx, dy = voronoi(w, h, pts, wrap)
    rad = np.array([r.uniform(4.5, 7.5) for _ in pts])[idx]
    H = np.clip(F1 / rad, 0, 1) ** 1.6 * depth
    H += (fbm(w, h, 4, seed(name, "grit"), 2) - 0.5) * 0.9
    return H, F2 - F1


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


def glow_over(A, core, thick, rock_I, g, wrap=True, spill=2.0):
    """Paint fissure glow at level g (0..1) over a rock: core gold->white, the thick middle amber, a rose lip
    along the thick stretches, and a violet spill on the rock that widens as the glow rises."""
    A = A.copy()
    fis = core | thick
    d = chamfer(~fis, wrap, cap=8, border_inside=True)    # 0 on the fissure, distance outward
    lvl = 6 + int(round(2 * g))
    A[core] = HOT[lvl]
    A[thick] = HOT[4 + int(round(g))]
    near = (d > 0) & (d <= 1.0)
    hotlip = near & dilate(thick, wrap)
    A[near] = MET_SPILL[np.clip(rock_I[near] + 3, 0, 9)]
    A[hotlip] = HOT[1 + int(round(g))]
    sp = (d > 1.0) & (d <= spill + g)
    A[sp] = MET_SPILL[np.clip(rock_I[sp] + 1, 0, 9)]
    return A


def meteorite_rock(name, base=3.4, w=32, h=32):
    H, _ = regmaglypts(name, w, h)
    T = base + lit(H, 1.6) * 5.0 + (fbm(w, h, 2, seed(name, "val"), 2) - 0.5) * 1.0
    I = despeckle(quant(T, 10, 1, 6))
    # iron-nickel glints: short bright dashes where a ridge faces the light
    ridge = (H > np.quantile(H, 0.8)) & (lit(H, 1.6) > 0.12)
    r = rng_for(name, "flecks")
    ys, xs = np.nonzero(ridge)
    for k in r.choice(len(xs), size=min(6, len(xs)), replace=False):
        x, y = xs[k], ys[k]
        I[y, x] = 8
        I[y, (x + 1) % w] = 7
    return I


def meteorite():
    name = "meteorite"
    I = meteorite_rock(name)
    rock = paint(I, MET)
    core, thick = fissures(name, 32, 32, [(1, 9, 0.45, 34, 2), (22, 30, -2.0, 15, 1), (28, 2, 2.3, 9, 0)])
    frames = [glow_over(rock, core, thick, I, g) for g in (0.0, 0.34, 0.67, 1.0)]
    animated("textures/block/meteorite.png", frames, frametime=6, order=[0, 1, 2, 3, 2, 1], interpolate=True)
    TILES.add("textures/block/meteorite.png")


def meteorite_core():
    """A blazing heart seen through a grate of gnarled rock bars, set in a rock shell split by hot fissures."""
    name = "meteorite_core"
    w = h = 32
    I = meteorite_rock(name, base=3.0)
    X, Y = ss_coords(w, h, 4)
    cx, cy = 16.0, 16.0
    ang = np.arctan2(Y - cy, X - cx)
    hole = sd_circle(X, Y, cx, cy, 13.0) + np.sin(ang * 6 + 0.5) * 0.8
    # the cage: two bowed uprights and two bowed cross-bars of knobbly rock, thinner where they cross the heart
    knob = (pnoise(w * 4, h * 4, 8, 8, seed(name, "knob")) - 0.5) * 0.9
    bars = np.minimum.reduce([
        sd_segment(X, Y, 10.0, 1.0, 11.0, 16.0, 2.2, 1.3), sd_segment(X, Y, 11.0, 16.0, 9.8, 31.0, 1.3, 2.2),
        sd_segment(X, Y, 22.0, 1.0, 21.0, 16.0, 2.2, 1.3), sd_segment(X, Y, 21.0, 16.0, 22.2, 31.0, 1.3, 2.2),
        sd_segment(X, Y, 1.0, 10.2, 16.0, 11.2, 2.2, 1.3), sd_segment(X, Y, 16.0, 11.2, 31.0, 10.0, 1.3, 2.2),
        sd_segment(X, Y, 1.0, 22.0, 16.0, 21.0, 2.2, 1.3), sd_segment(X, Y, 16.0, 21.0, 31.0, 22.2, 1.3, 2.2),
    ]) + knob
    in_hole = down((hole < 0).astype(float), 4) >= 0.5
    bar_px = (down((bars < 0).astype(float), 4) >= 0.5) & in_hole
    open_px = in_hole & ~bar_px
    # bars: rough cylinders lit from the top-left; knots where they cross
    Hb = -down(np.clip(bars, -2.8, 0), 4)
    Ib = quant(4.6 + lit(Hb * 1.8, 1.0, wrap=False) * 7 + (fbm(w, h, 4, seed(name, "barg"), 2) - 0.5) * 1.4,
               10, 2, 8)
    Ib = despeckle(Ib, wrap=False)
    I = np.where(bar_px, Ib, I)
    shell = ~in_hole
    lip = dilate(in_hole) & shell                    # the shell's rim round the hollow, in shadow
    I[lip] = np.clip(I[lip] - 2, 1, 9)
    rock = paint(I, MET)
    core, thick = fissures(name, w, h, [(0, 1, 0.75, 7, 0), (31, 1, 2.4, 7, 0), (1, 31, -0.8, 7, 0),
                                        (31, 31, -2.35, 7, 0), (16, 0, 1.5, 3, 0)], wrap=False)
    core &= shell & ~lip
    thick &= shell & ~lip
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    rim = dilate(open_px) & bar_px                   # bar edges facing the heart catch its light...
    rim_hot = rim & (shift(open_px, 0, -1) | shift(open_px, -1, 0))   # ...brightest where the heart is below/right
    frames = []
    for g in (0.0, 0.34, 0.67, 1.0):
        A = glow_over(rock, core, thick, I, g, wrap=False, spill=1.2)
        t = np.clip(dist / (13.0 + 1.0 * g), 0, 1)
        heat = 8.8 - t ** 1.5 * 6.0 + 0.5 * g
        Hi = quant(heat, 9, 2, 8)
        A[open_px] = HOT[Hi[open_px]]
        A[rim] = MET_SPILL[np.clip(I[rim] + 2, 0, 9)]
        A[rim_hot] = HOT[np.clip(Hi[rim_hot] - 4, 2, 4)]
        frames.append(A)
    animated("textures/block/meteorite_core.png", frames, frametime=5, order=[0, 1, 2, 3, 2, 1], interpolate=True)


def lamellae(name, w=32, h=32):
    """The etched lattice of meteoric iron: three families of irregular bands (0, ~63, ~117 degrees), periodic."""
    r = rng_for(name, "lamellae")
    yy, xx = np.mgrid[0:h, 0:w]
    out = np.zeros((h, w))
    for f in (yy % 32, (2 * xx + yy) % 32, (2 * xx - yy) % 32):
        table = np.zeros(32)
        i = int(r.integers(0, 4))
        while i < 32:
            wd = int(r.integers(1, 3))
            table[i:i + wd] = r.choice([0.7, -0.6])
            i += wd + int(r.integers(4, 9))
        out += table[f]
    return out


def seam_glow(A, seam, I_face, name, w=32, h=32, hot=(3, 6)):
    """Glowing mortar: hot in some stretches and dim in others, with a violet spill on the face edges."""
    A = A.copy()
    heat = fbm(w, h, 3, seed(name, "seam"), 2)
    lvl = np.clip(np.floor(hot[0] + heat * (hot[1] - hot[0] + 0.99)), 0, 8).astype(int)
    A[seam] = HOT[lvl[seam]]
    near = dilate(seam, wrap=True) & ~seam & (heat > 0.45)
    A[near] = MET_SPILL[np.clip(I_face[near] + 1, 0, 9)]
    return A


def refined_meteorite():
    w = h = 32
    # polished: one slab with an etched lattice and a glowing seam all round
    name = "polished_meteorite"
    lab, U, V, BW, BH = bond(w, h, [(0, 32, [0])])
    yy, xx = np.mgrid[0:h, 0:w]
    T = 3.6 - (xx + yy) / 64 * 1.3 + (fbm(w, h, 2, seed(name), 2) - 0.5) * 0.8
    I = despeckle(quant(T, 10, 2, 5))
    lam = lamellae(name)                             # crisp etched lines: lighter kamacite bands, darker gaps
    I = np.clip(I + np.where(lam > 0.6, 2, 0) + np.where(lam > 1.3, 1, 0) - np.where(lam < -1.0, 1, 0), 1, 7)
    off, mortar = bevel_steps(U, V, BW, BH, hi=(+3, +1.5), lo=(-1.5, -0.5))
    I = np.where(off != 0, quant(I + off, 10, 1, 8), I)
    for (x, y, v) in ((3, 3, 9), (4, 3, 8), (5, 3, 7), (3, 4, 8), (3, 5, 7)):
        I[y, x] = v
    A = paint(I, MET)
    block(name, seam_glow(A, mortar, I, name, hot=(4, 6)))
    # bricks: hammered metal-rock bricks set in glowing mortar
    name = "meteorite_bricks"
    rows = [(0, 8, [5, 21]), (8, 8, [13, 29]), (16, 8, [0, 16]), (24, 8, [8, 23])]
    lab, U, V, BW, BH = bond(w, h, rows)
    r = rng_for(name)
    H, _ = regmaglypts(name, w, h, n=(4, 4), depth=1.2)
    T = 3.3 + lit(H, 1.0) * 3.0
    for k in range(lab.max() + 1):
        T[lab == k] += r.uniform(-0.45, 0.45)
    I = despeckle(quant(T, 10, 2, 6))
    lam = lamellae(name)
    I = np.clip(I + np.where(lam > 1.3, 1, 0), 1, 7)
    off, mortar = bevel_steps(U, V, BW, BH, hi=(+2.5, +1), lo=(-1.5,))
    I = np.where(off != 0, quant(I + off, 10, 1, 8), I)
    I = glints(I, lab, U, V, BW, BH, rng_for(name, "glint"), 0.5, (2, 3), diagonal=0.0)
    A = paint(I, MET)
    block(name, seam_glow(A, mortar, I, name, hot=(3, 6)))


meteorite()
meteorite_core()
refined_meteorite()


# ====================================================================== ground: end stone, End grass, moss, sand
def endstone_field(name, w=32, h=32):
    """End stone (index map on ENDSTONE): soft pale lumps and a scatter of small pits, like vanilla's."""
    r = rng_for(name, "es")
    pts = jitter_points(w, h, 4, 4, r, 0.9)
    F1, F2, idx, dx, dy = voronoi(w, h, pts)
    H = np.sqrt(np.clip(1 - (F1 / 7.5) ** 2, 0, 1)) * 2.0 + (fbm(w, h, 4, seed(name, "es2"), 2) - 0.5) * 1.0
    T = 4.7 + lit(H, 1.2) * 6.5 + (pnoise(w, h, 3, 3, seed(name, "es3")) - 0.5) * 0.9
    T = np.where((F2 - F1) < 1.2, T - 1.0, T)
    I = despeckle(quant(T, 8, 2, 7))
    for _ in range(7):                                           # pits: a dark dent with a lit lower-right lip
        x, y = int(r.integers(w)), int(r.integers(h))
        big = r.random() < 0.5
        cells = [(0, 0, 1), (1, 0, 2), (0, 1, 2), (1, 1, 5)] if big else [(0, 0, 2), (1, 0, 4), (0, 1, 5)]
        for ox, oy, t in cells:
            I[(y + oy) % h, (x + ox) % w] = t
    return I


def clumps(name, w, h, n, rad, wrap=True):
    """Tufted clumps (voronoi domes): height, the gap mask between clumps, and per-pixel clump offsets."""
    r = rng_for(name, "clumps")
    pts = jitter_points(w, h, n, n, r, 0.95)
    F1, F2, idx, dx, dy = voronoi(w, h, pts, wrap)
    size = np.array([r.uniform(*rad) for _ in pts])[idx]
    H = np.sqrt(np.clip(1 - (F1 / size) ** 2, 0, 1)) * 2.0
    gap = (F2 - F1) < 1.0
    return H, gap, dx, dy, idx, len(pts)


def combed(T, name, n, flow_cells=2, length=(2, 4), jitter=0.45, lo=1, hi=9, light=0.55, wrap=True, steps=10):
    """Grass blades seen from above, combed by a gentle flow: darker blades first, then lit blades (lighter
    tips) that cast a one-pixel shadow down-right. Returns an index map."""
    h, w = T.shape
    r = rng_for(name, "combed")
    flow = fbm(w, h, flow_cells, seed(name, "flow"), 1) * 2 * math.pi * 1.2
    I = quant(T, steps, lo, hi)
    blades = []
    for _ in range(n):
        x, y = r.uniform(0, w), r.uniform(0, h)
        a = flow[int(y) % h, int(x) % w] + r.normal(0, jitter)
        L = int(r.integers(length[0], length[1] + 1))
        px = [(int(round(x + math.cos(a) * i)) % w, int(round(y + math.sin(a) * i)) % h) for i in range(L)]
        blades.append((r.random() < light, px))
    for up, px in sorted(blades, key=lambda b: b[0]):
        if up:
            for (x, y) in px:
                sx, sy = (x + 1) % w, (y + 1) % h
                I[sy, sx] = max(lo, min(I[sy, sx], quant(T[sy, sx] - 1, steps, lo, hi)))
        for i, (x, y) in enumerate(px):
            base = quant(T[y, x], steps, lo, hi)
            v = base + (1 + (i >= len(px) - 2)) if up else base - 1
            I[y, x] = np.clip(v, lo, hi)
    return I


def end_grass_top():
    name = "end_grass_block_top"
    w = h = 32
    H, gap, dx, dy, idx, cnt = clumps(name, w, h, 4, (5.0, 7.0))
    T = 4.4 + lit(H, 1.2) * 4.0 + (fbm(w, h, 2, seed(name, "v"), 2) - 0.5) * 1.2
    T = np.where(gap, T - 1.2, T)
    I = combed(T, name, 150, flow_cells=2, length=(3, 4), lo=2, hi=8)
    I = despeckle(I, passes=1)
    block(name, paint(I, GRASS))


def end_grass_side():
    """End stone under a violet grass lip: the lip ends in blade points, the stone just below is shaded."""
    name = "end_grass_block_side"
    w = h = 32
    es = endstone_field(name)
    A = paint(es, ENDSTONE)
    r = rng_for(name, "lip")
    # blades along the lip: widths summing to 32 (so it tiles), each a point of its own length
    widths = []
    while sum(widths) < w:
        widths.append(int(r.choice([2, 3, 3, 4])))
    widths[-1] -= sum(widths) - w
    if widths[-1] < 2:
        widths[-2] += widths.pop()
    base = 6 + np.round((pnoise(w, 1, 4, 1, seed(name, "d"))[0] - 0.5) * 3).astype(int)
    depth = np.zeros(w, int)
    side = np.zeros(w, int)                                      # -1 left column (lit), +1 right column (shaded)
    x = 0
    for bw in widths:
        extra = int(r.choice([0, 1, 2, 2, 3, 5]))
        for i in range(bw):
            point = extra if (bw == 2 or i == bw // 2 or (bw == 4 and i == 1)) else max(0, extra - 2)
            depth[(x + i) % w] = base[(x + i) % w] + point
            side[(x + i) % w] = -1 if i == 0 else (1 if i == bw - 1 else 0)
        x += bw
    yy, xx = np.mgrid[0:h, 0:w]
    grass = yy < depth[None, :]
    T = 6.4 - yy * 0.42 + (pnoise(w, h, 8, 8, seed(name, "g")) - 0.5) * 1.0
    T = np.where(yy == 0, 7.6, T)
    T = T - side[None, :] * 0.9
    tip = grass & ~shift(grass, 0, -1)
    Ig = quant(T, 10, 2, 8)
    Ig = np.where(tip, np.clip(Ig - 1, 2, 9), Ig)
    G = paint(Ig, GRASS)
    A[grass] = G[grass]
    shadow = shift(grass, 0, 1) & ~grass                          # the stone just under the lip
    A[shadow] = ENDSTONE[np.clip(es - 3, 0, 7)[shadow]]
    shadow2 = shift(shadow, 0, 1) & ~grass & ~shadow
    A[shadow2] = ENDSTONE[np.clip(es - 1, 0, 7)[shadow2]]
    block(name, A)


def end_moss():
    """Magenta alien moss in soft fuzzy clumps, with a few teal sporangia gathered in little colonies."""
    name = "end_moss_block"
    w = h = 32
    H, gap, dx, dy, idx, cnt = clumps(name, w, h, 6, (3.4, 4.8))
    # small round bumps on the clumps: the moss's fuzz, big enough to read as soft lumps, not dust
    bp = jitter_points(w, h, 11, 11, rng_for(name, "bumps"), 1.0)
    b1, b2, bi, bx, by = voronoi(w, h, bp)
    H = H + np.sqrt(np.clip(1 - (b1 / 1.9) ** 2, 0, 1)) * 0.55
    T = 3.7 + lit(H, 1.5) * 6.0 + (H - 1.2) * 0.5
    T = np.where(gap, T - 1.6, T)
    I = despeckle(quant(T, 8, 1, 7))
    A = paint(I, MOSS)
    r = rng_for(name, "spor")
    taken = np.zeros((h, w), bool)
    for _ in range(6):
        cx, cy = r.uniform(0, w), r.uniform(0, h)
        for _ in range(int(r.integers(3, 6))):
            x = int(cx + r.normal(0, 1.6)) % w
            y = int(cy + r.normal(0, 1.6)) % h
            if taken[max(0, y - 2):y + 3, max(0, x - 2):x + 3].any():
                continue
            tall = r.random() < 0.3
            cells = [(0, 0, 6), (0, 1, 4), (0, 2, 2)] if tall else [(0, 0, 5), (1, 0, 4), (0, 1, 3), (1, 1, 2)]
            for ox, oy, t in cells:
                A[(y + oy) % h, (x + ox) % w] = TEAL[t]
                taken[(y + oy) % h, (x + ox) % w] = True
            foot = (y + 1 + max(c[1] for c in cells)) % h
            A[foot, x % w] = MOSS[1]
            A[foot, (x + 1) % w] = MOSS[2]
    block(name, A)


def sand_height(name, w=32, h=32, craters=3):
    r = rng_for(name, "sand")
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    H = (fbm(w, h, 8, seed(name, "g"), 2) - 0.5) * 0.9
    H += np.sin((xx + yy * 0.5) / 32 * 2 * math.pi * 2 + r.uniform(0, 6)) * 0.12   # faint drift ripples
    for _ in range(craters):
        cx, cy, rad = r.uniform(0, w), r.uniform(0, h), r.uniform(2.0, 3.4)
        d = np.hypot((xx - cx + w / 2) % w - w / 2, (yy - cy + h / 2) % h - h / 2) / rad
        H += np.where(d < 1, -(1 - d ** 2) * 1.5, 0) + np.exp(-((d - 1.15) / 0.3) ** 2) * 0.7
    return H


def pebbles(A, name, n, w=32, h=32, avoid=None):
    """Small grey stones lying on the dust: a dark body, a lit top-left pixel, a shadow down-right."""
    r = rng_for(name, "pebbles")
    for _ in range(n):
        x, y = int(r.integers(w)), int(r.integers(h))
        art = str(r.choice(["ab|bc", "abb|bcc", "a|b"])).split("|")
        if avoid is not None and avoid[y % h, x % w]:
            continue
        for j, row in enumerate(art):
            for i, ch in enumerate(row):
                A[(y + j) % h, (x + i) % w] = SAND[{"a": 5, "b": 3, "c": 2}[ch]]
        A[(y + len(art)) % h, (x + len(art[-1])) % w] = SAND[2]


def end_sand_I(name, extra=None):
    H = sand_height(name)
    if extra is not None:
        H = H + extra
    T = 5.6 + lit(H, 1.3) * 4.5 + (pnoise(32, 32, 3, 3, seed(name, "v")) - 0.5) * 0.7
    return despeckle(quant(T, 9, 2, 8))


def end_sand():
    I = end_sand_I("end_sand")
    A = paint(I, SAND)
    pebbles(A, "end_sand", 5)
    block("end_sand", A)
    suspicious_sand()


def suspicious_sand():
    """Something buried: brushing opens a hollow that grows stage by stage, uncovering an obsidian relic carved
    with a faintly glowing eye."""
    name = "suspicious_end_sand"
    w = h = 32
    cx, cy = 16.0, 17.0
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    # the relic: an obsidian tablet tipped in the dust, bevelled, an eye cut into it
    tablet = sd_poly(xx, yy, [(9.5, 12.5), (22.0, 10.0), (24.0, 21.5), (11.5, 24.0)])
    relic = tablet < 0
    t = np.clip(-tablet / 2.2, 0, 1)
    It = quant(3.0 + lit(np.sqrt(1 - (1 - t) ** 2) * 2.2, 1.3, wrap=False) * 7, 10, 1, 7)
    rim = relic & ~erode(relic)
    It[rim] = np.clip(It[rim] - 1, 0, 9)
    eye = np.hypot((xx - 16.8) / 3.8, (yy - 17.0) / 2.1) < 1
    lid = eye & ~erode(eye)
    It[lid] = 0
    Rc = paint(It, OBS)
    Rc[eye & ~lid] = CRY[1]
    Rc[(np.abs(xx - 16.8) < 1.6) & (np.abs(yy - 17.0) < 1.0)] = CRY[3]
    Rc[16, 16] = CRY[5]
    Rc[12, 12], Rc[12, 13], Rc[13, 12] = OBS[9], OBS[8], OBS[7]
    for stage, R in enumerate((2.6, 5.6, 8.6, 11.4)):
        # the hollow opens on the relic's corner and widens toward its middle; a dip with a raised rim of
        # pushed-aside dust, its upper-left wall in shadow
        hx, hy = cx + (stage - 3) * 1.4, cy + (stage - 3) * 1.4
        d = np.hypot((xx - hx) / 1.15, yy - hy) / R
        extra = np.where(d < 1, -(1 - d ** 2) * (1.6 + 0.25 * stage), 0) + np.exp(-((d - 1.12) / 0.22) ** 2) * 0.9
        ang = np.arctan2(yy - hy, xx - hx)
        extra += np.where((np.cos(ang * 7 + stage * 0.7) > 0.7) & (d > 1.05) & (d < 1.55), 0.45, 0)
        I = end_sand_I(name, extra)
        A = paint(I, SAND)
        pebbles(A, name, 4, avoid=d < 1.7)
        show = relic & (d < 0.9)
        A[show] = Rc[show]
        cling = show & ~shift(show, 0, -1) & (d > 0.3)           # dust still clinging along the lower edge
        A[cling] = SAND[4]
        block(f"suspicious_end_sand_{stage}", A, tiles=False)


# ====================================================================== chorus: stems, roots, fruit block
def chorus_stem():
    """Side: ribbed like a chorus plant, jointed at two nodes (a pinched ring) where pale buds sit. Tiles both
    ways. Top: the cut trunk, ribbed bark round pale flesh with growth rings and a dark pith."""
    name = "chorus_stem"
    w = h = 32
    r = rng_for(name)
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    ribs = [2.5, 8.5, 14.0, 19.5, 25.5]
    H = np.zeros((h, w))
    nodes = (5, 21)
    for i, x0 in enumerate(ribs):
        ph = r.uniform(0, 2 * math.pi)
        xc = x0 + 0.9 * np.sin(yy / 32 * 2 * math.pi + ph)          # a gentle sway (periodic in y)
        half = 2.8 - sum(1.0 * np.exp(-(((yy - n + 16) % 32 - 16) / 1.6) ** 2) for n in nodes)
        dxp = ((xx - xc + w / 2) % w) - w / 2
        H = np.maximum(H, np.sqrt(np.clip(1 - (dxp / half) ** 2, 0, 1)) * 2.2)
    H += (fbm(w, h, 4, seed(name, "f"), 2) - 0.5) * 0.5
    T = 4.6 + lit(H, 1.6) * 6.0 + (H - 1.4) * 0.8
    I = despeckle(quant(T, 10, 1, 8))
    groove = H < 0.35
    I[groove] = np.clip(I[groove] - 1, 1, 9)
    A = paint(I, CHORUS)
    for n in nodes:                                                  # pale bud nodules where the ribs pinch
        for i, x0 in enumerate(ribs):
            if r.random() < 0.4:
                continue
            x = int((x0 + 3.0) % w)
            y = (n + int(r.integers(-1, 2))) % h
            stamp(A, x - 1, y - 1, """
                .8..
                897.
                .75.
                ..2.
            """, {"9": CHORUS[9], "8": CHORUS[8], "7": CHORUS[7], "5": CHORUS[5], "2": CHORUS[1]}, wrap=True)
    block(name, A)
    name = "chorus_stem_top"
    u, v = (xx - 16) / 15.5, (yy - 16) / 15.5
    sq = (np.abs(u) ** 4 + np.abs(v) ** 4) ** 0.25                   # a squircle filling the face
    ang = np.arctan2(v, u)
    bark = sq > 0.82 + 0.05 * np.cos(ang * 10)
    T = 7.0 - sq * 1.8 + (fbm(w, h, 3, seed(name), 2) - 0.5) * 0.7
    for ring in (0.38, 0.62):
        T -= np.exp(-((sq - ring) / 0.035) ** 2) * 1.7
    pith = np.hypot(xx - 16, yy - 16)
    T = np.where(pith < 2.6, 4.2, T)
    I = quant(T, 10, 3, 9)
    I[(pith < 2.6) & (xx + yy > 33)] = 6                            # the pith hollow's lit lower-right wall
    Hb = np.where(bark, 1.0 + 0.6 * np.cos(ang * 10), 0.0)
    Ib = quant(3.4 + lit(Hb, 1.5, wrap=False) * 5 + np.cos(ang * 10) * 1.0, 10, 1, 6)
    I = np.where(bark, Ib, I)
    I[bark & ~erode(bark) & (sq < 0.95)] = 2                       # the bark's inner edge
    I = despeckle(I, wrap=False)
    block(name, paint(I, CHORUS), tiles=False)


def chorus_roots():
    """Side: three thick strands twisted round each other, knotted with burls (darker, browner than the stems).
    Tiles both ways. Top: the cut bundle, the strands in cross-section."""
    name = "chorus_roots"
    w = h = 32
    r = rng_for(name)
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    best = np.full((h, w), -9.0)
    T = np.full((h, w), 0.6)
    grain_ph = r.uniform(0, 6, 3)
    for i, (x0, amp, half) in enumerate(((5.0, 3.0, 5.6), (16.0, 3.0, 5.8), (26.5, 2.8, 5.4))):
        ph = i * 2 * math.pi / 3
        a = yy / 32 * 2 * math.pi + ph
        xc = x0 + amp * np.sin(a)
        z = np.cos(a)                                              # which strand is in front
        slope = amp * np.cos(a) * 2 * math.pi / 32
        dxp = ((xx - xc + w / 2) % w) - w / 2
        q = dxp / half
        inside = np.abs(q) < 1
        front = inside & (z > best)
        prof = np.sqrt(np.clip(1 - q ** 2, 0, 1))
        shade = -q * 0.9 - slope * 0.3                             # lit on the left of each strand
        grain = np.sin((yy * 0.9 - dxp * slope * 1.2 + grain_ph[i]) * 1.4) > 0.6   # twisted fibres
        t = 3.4 + shade * 2.2 + prof * 0.9 + z * 0.5 - grain * 1.0
        t = np.where(np.abs(q) > 0.86, 1.2, t)                     # a dark seam where strands meet
        T = np.where(front, t, T)
        best = np.where(front, z, best)
    covered = best > -9
    for (kx, ky, kr) in ((9.5, 8.0, 2.8), (21.5, 24.5, 2.6)):      # burls with a dark pit
        d = np.hypot((xx - kx + 16) % 32 - 16, (yy - ky + 16) % 32 - 16) / kr
        burl = d < 1
        T = np.where(burl, 4.0 + lit(np.sqrt(np.clip(1 - d ** 2, 0, 1)) * 2.4, 1.2) * 5 - (d < 0.4) * 3.2, T)
        covered |= burl
    I = quant(T, 8, 0, 7)
    I[~covered] = 0
    I = despeckle(I)
    block(name, paint(I, ROOTS))
    name = "chorus_roots_top"
    I = np.zeros((h, w), int)
    for (cx, cy, rad) in ((10.0, 10.5, 7.6), (22.5, 9.0, 6.6), (8.5, 23.5, 6.8), (21.0, 22.0, 8.2),
                          (15.5, 16.0, 3.6)):
        d = np.hypot(xx - cx, yy - cy) / rad
        disk = d < 1
        t = 5.8 - d * 1.8 + np.cos(np.arctan2(yy - cy, xx - cx) * 7) * 0.35 * d     # wood, faint rays
        t = np.where(d > 0.8, 2.8 - ((xx - cx) + (yy - cy)) / rad * 0.9, t)       # bark ring, lit top-left
        Iq = quant(t, 8, 1, 7)
        hx, hy = int(cx - 0.5), int(cy - 0.5)                                       # the dark heart
        Iq[hy:hy + 2, hx:hx + 2] = 2
        Iq[hy + 2, hx + 1] = 6
        Iq[hy + 1, hx + 2] = 6
        I = np.where(disk, Iq, I)
    I = despeckle(I, wrap=False)
    block(name, paint(I, ROOTS), tiles=False)


def chorus_fruit_block():
    """Chorus fruit packed tight: round knobbly mauve fruits with a glossy highlight, dark between them."""
    w = h = 32
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    for name, rows, dimple in (("chorus_fruit_block", 4, False), ("chorus_fruit_block_top", 3, True)):
        r = rng_for(name)
        pts = []
        if rows == 4:
            for j in range(4):
                for i in range(3):
                    pts.append(((i + 0.5 * (j % 2)) * 32 / 3 + r.uniform(-0.7, 0.7), j * 8 + 4 + r.uniform(-0.5, 0.5)))
            sc, rad = (1.0, 1.3), 5.6
        else:
            for j in range(3):
                for i in range(3):
                    pts.append((i * 32 / 3 + 5.3 + r.uniform(-0.8, 0.8), j * 32 / 3 + 5.3 + r.uniform(-0.8, 0.8)))
            sc, rad = (1.0, 1.0), 5.4
        F1, F2, idx, dx, dy = voronoi(w, h, pts, scale=sc)
        H = np.sqrt(np.clip(1 - (F1 / rad) ** 2, 0, 1)) * 2.4
        for k, (px, py) in enumerate(pts):                         # two soft lumps on every fruit
            for b in range(2):
                a = r.uniform(0, 2 * math.pi)
                bx, by = px + math.cos(a) * 2.8, py + math.sin(a) * 2.4
                d = np.hypot((xx - bx + 16) % 32 - 16, (yy - by + 16) % 32 - 16) / 2.0
                H += np.where((idx == k) & (d < 1), np.sqrt(np.clip(1 - d ** 2, 0, 1)) * 0.45, 0)
        gap = ((F2 - F1) < 1.1) | (F1 > rad)
        T = 5.2 + lit(H, 1.4) * 6 + (H - 1.2) * 0.5
        I = quant(T, 10, 2, 8)
        I[gap] = 1
        I = despeckle(I)
        for (px, py) in pts:
            x, y = int(px - 2.2) % w, int(py - 2.0) % h          # gloss on the lit shoulder
            I[y, x], I[y, (x + 1) % w], I[(y + 1) % h, x] = 9, 8, 8
            if dimple:                                             # the stalk scar on top
                x, y = int(px) % w, int(py) % h
                I[y, x], I[y, (x + 1) % w], I[(y + 1) % h, x], I[(y + 1) % h, (x + 1) % w] = 2, 3, 3, 6
        block(name, paint(I, CHORUS))


end_grass_top()
end_grass_side()
end_moss()
end_sand()
chorus_stem()
chorus_roots()
chorus_fruit_block()


# ====================================================================== plants (cross models, cutout: alpha is 0 or 255)
# End Bloom stem and leaves: a deep teal-indigo, so the violet petals and the glowing bulb stand out.
STEM = ramp("#0c1222", "#141f37", "#1d2f4c", "#284062", "#35557a", "#476f92", "#6690a8", "#91b5c2")
PETAL = ramp("#1c0a2d", "#2d1047", "#431965", "#5b2484", "#7832a2", "#9545bc", "#b061d1", "#cb86e4",
             "#e5b3f3", "#f8e0fc")
# the bulb's light, violet edge -> white core (also the End Bulb item and the end_glow motes)
BULB = ramp("#4a1f96", "#6d36c8", "#9259ea", "#b383f8", "#d3b2ff", "#ecdcff", "#fdf8ff")


def put_px(A, x, y, c):
    h, w = A.shape[:2]
    x, y = int(x), int(y)
    if 0 <= x < w and 0 <= y < h:
        A[y, x] = rgba(c) if not isinstance(c, np.ndarray) else c


def blade(A, rmp, base, tip, bend=0.0, width=2.0, tone=4, hook=0.0, lit_side=True):
    """A grass blade along a curve from base to tip: `width` px at the base, tapering to one; the left column
    lit, the right in shade, the tip lighter and the foot darker. `hook` curls the tip over sideways."""
    (bx, by), (tx, ty) = base, tip
    L = math.hypot(tx - bx, ty - by)
    px_, py_ = -(ty - by) / L, (tx - bx) / L
    if hook:
        ctrl = [(bx, by), (bx + px_ * bend * 0.6, by + (ty - by) * 0.45),
                (tx + px_ * bend - hook * 0.4, ty - 1.5), (tx + hook, ty + abs(hook) * 0.8)]
    else:
        mx, my = (bx + tx) / 2 + px_ * bend, (by + ty) / 2 + py_ * bend
        ctrl = [(bx, by), (mx, my), (tx, ty)]
    pts = bezier(ctrl, n=int(L * 4) + 8)
    n = len(pts)
    seen = {}
    for i, (x, y) in enumerate(pts):
        t = i / (n - 1)
        wd = max(1.0, width * (1 - t) ** 0.7)
        cols = range(int(math.floor(x - (wd - 1) / 2 + 0.5)), int(math.floor(x + (wd - 1) / 2 + 0.5)) + 1)
        cols = list(cols)
        yy = int(math.floor(y))
        for k, cx in enumerate(cols):
            v = tone
            if len(cols) >= 2 and lit_side:
                v += 1 if k == 0 else (-1 if k == len(cols) - 1 else 0)
            v += 2 if t > 0.82 else (1 if t > 0.62 else 0)
            v -= 1 if t < 0.15 else 0
            seen[(cx, yy)] = v
    for (cx, yy), v in seen.items():
        put_px(A, cx, yy, rmp[int(np.clip(v, 0, len(rmp) - 1))])


def end_grass_plants():
    # short tuft: back blades dark, front blades light, leaning outward
    A = np.zeros((32, 32, 4), np.uint8)
    r = rng_for("end_grass")
    spec = [  # (base x, tip x, tip y, bend, width, tone)
        (12, 5, 11, -2.0, 3.0, 2), (20, 27, 9, 2.0, 3.0, 2), (16, 15, 5, 1.0, 3.0, 2), (10, 2, 18, -1.5, 3.0, 3),
        (22, 30, 17, 1.5, 3.0, 3), (14, 9, 8, -1.0, 3.5, 3), (18, 22, 7, 1.5, 3.5, 4), (13, 7, 16, -1.0, 3.5, 4),
        (19, 25, 14, 1.0, 3.5, 4), (16, 17, 10, -1.0, 4.0, 5), (11, 13, 19, 0.5, 3.0, 5), (21, 19, 18, -0.5, 3.0, 5),
        (15, 12, 22, -0.5, 3.0, 6),
    ]
    for bx, tx, ty, bend, wd, tone in spec:
        blade(A, GRASS, (bx + r.uniform(-0.4, 0.4), 31.9), (tx, ty), bend, wd, tone)
    block("end_grass", A, tiles=False)
    # tall grass: one 32 x 64 drawing split into the two halves, so blades run on through the seam;
    # the tallest fronds curl over at the top (alien), a few carry pale seed tips
    T = np.zeros((64, 32, 4), np.uint8)
    r = rng_for("tall_end_grass")
    spec = [  # (base x, tip x, tip y, bend, width, tone, hook)
        (9, 3, 28, -3.0, 3.5, 2, 0), (23, 29, 24, 3.0, 3.5, 2, 0), (15, 9, 5, -2.0, 3.5, 2, -4),
        (18, 23, 3, 2.5, 3.5, 3, 4), (12, 4, 14, -3.0, 3.5, 3, -3), (21, 28, 12, 3.0, 3.5, 3, 3),
        (16, 17, 8, 1.0, 4.0, 4, 0), (13, 8, 22, -1.5, 3.5, 4, 0), (19, 25, 19, 1.5, 3.5, 4, 0),
        (14, 12, 15, -0.5, 3.0, 5, -2), (18, 20, 13, 0.5, 3.0, 5, 2),
        (11, 13, 34, 1.0, 3.0, 5, 0), (20, 18, 31, -1.0, 3.0, 6, 0), (16, 14, 38, 0.5, 3.0, 6, 0),
    ]
    tips = []
    for bx, tx, ty, bend, wd, tone, hook in spec:
        blade(T, GRASS, (bx + r.uniform(-0.4, 0.4), 63.9), (tx, ty), bend, wd, tone, hook=hook)
        if not hook and ty < 26:
            tips.append((tx, ty))
    for (x, y) in tips:                                               # pale seed tips on the straight fronds
        stamp(T, x - 1, y - 1, """
            .9.
            987
            .6.
        """, {"9": GRASS[9], "8": GRASS[8], "7": GRASS[7], "6": GRASS[5]})
    block("tall_end_grass_top", T[:32], tiles=False)
    block("tall_end_grass_bottom", T[32:], tiles=False)


def sd_stroke(X, Y, pts, radii):
    d = np.full(X.shape, np.inf)
    for i in range(len(pts) - 1):
        d = np.minimum(d, sd_segment(X, Y, *pts[i], *pts[i + 1], radii[i], radii[i + 1]))
    return d


def lens(ctrl, wmax, n=14, taper=(0.9, 0.7), base_w=None):
    """Sample points and radii of a leaf/petal along a Bezier: widest in the middle, pointed at the tip."""
    pts = bezier(ctrl, n)
    t = np.linspace(0, 1, n)
    rad = wmax * np.sin(np.pi * np.clip(t, 0.02, 1) ** taper[0]) ** taper[1]
    if base_w is not None:
        rad = np.maximum(rad, base_w * (1 - t) ** 2)
    rad[-1] = 0.15
    return [tuple(p) for p in pts], list(rad)


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


def bloom_body(L, state):
    """Stem and leaves (and the sepals), shared by every End Bloom state."""
    stem_pts = bezier([(16.2, 32.5), (14.8, 26), (17.2, 20), (16.0, 15.5)], 12)
    L.add(lambda X, Y: sd_stroke(X, Y, [tuple(p) for p in stem_pts], list(np.linspace(1.25, 0.95, 12))),
          STEM, 3.6, gain=5, bevel=1.2)
    for ctrl, wm in (([(15.5, 28.5), (11, 25), (6, 23.5), (3.5, 19.5)], 2.3),
                     ([(16.5, 26.5), (21, 23.5), (25, 22.5), (28.5, 17.5)], 2.1)):
        pts, rad = lens(ctrl, wm)
        m, I = L.add(lambda X, Y, p=pts, r=rad: sd_stroke(X, Y, p, r), STEM, 4.0, gain=6, bevel=1.6)
        mid = bezier(ctrl, 30)[3:-3]                                    # the leaf's midrib
        for x, y in mid:
            if m[int(y), int(x)]:
                put_px(L.A, x, y, STEM[2])


def bloom_petals(L, open_):
    if not open_:
        # the closed bud: a tight teardrop of wrapped petals twisting up to a point, cupped by two sepals
        bud = lambda X, Y: sd_stroke(X, Y, *lens([(16, 16.5), (15.5, 11), (16.5, 6), (16.5, 2.5)], 4.4, 16,
                                                  taper=(0.6, 0.6)))  # noqa: E731
        m, I = L.add(bud, PETAL, 4.8, gain=7, bevel=3.2)
        for k, (a, b) in enumerate((((12.0, 13.0), (19.5, 7.0)), ((14.0, 16.0), (20.0, 11.0)))):
            seam = bezier([a, ((a[0] + b[0]) / 2 + 1.5, (a[1] + b[1]) / 2 + 1.0), b], 30)
            for x, y in seam:
                xi, yi = int(x), int(y)
                if 0 <= xi < 32 and 0 <= yi < 32 and m[yi, xi]:
                    L.A[yi, xi] = PETAL[max(1, I[yi, xi] - 2)]
                    if 0 <= yi + 1 < 32 and m[yi + 1, xi] and k < 2:
                        L.A[yi + 1, xi] = PETAL[min(9, I[yi + 1, xi] + 1)]
        for x, y in ((16, 3), (16, 4)):                               # a magenta tip
            put_px(L.A, x, y, PETAL[7])
        for ctrl in (([(16, 17), (13, 16), (11.5, 13.5)]), ([(16, 17), (19, 16), (20.5, 13.0)])):
            pts, rad = lens(ctrl, 1.5, 8)
            L.add(lambda X, Y, p=pts, r=rad: sd_stroke(X, Y, p, r), STEM, 4.4, gain=5, bevel=1.0)
        return None
    # open: five petals unfurled round the receptacle; the inner faces are lighter, the tips curl
    specs = [  # (control points, width, base tone)
        ([(16, 15), (16.5, 9), (15.5, 4.5), (16.5, 1.5)], 2.6, 3.0),          # back petal, in shade
        ([(15, 15), (12, 9), (8.5, 5.5), (6.5, 2.5)], 2.8, 4.2),               # upper left
        ([(17, 15), (20, 9), (23.5, 5.5), (25.5, 2.5)], 2.8, 3.8),             # upper right
        ([(15, 16), (9, 14.5), (4.5, 12), (2.5, 15.5)], 3.0, 5.2),             # left, curling down
        ([(17, 16), (23, 14.5), (27.5, 12), (29.5, 15.5)], 3.0, 4.6),          # right, curling down
    ]
    masks = []
    for ctrl, wm, base in specs:
        pts, rad = lens(ctrl, wm, 16, taper=(0.8, 0.8))
        m, I = L.add(lambda X, Y, p=pts, r=rad: sd_stroke(X, Y, p, r), PETAL, base, gain=6, bevel=2.2)
        # the inner face: a lighter magenta vein down the petal's middle
        for x, y in bezier(ctrl, 40)[6:-4]:
            xi, yi = int(x), int(y)
            if 0 <= xi < 32 and 0 <= yi < 32 and m[yi, xi] and L.top[yi, xi] == L.n - 1:
                L.A[yi, xi] = PETAL[min(9, I[yi, xi] + 2)]
        for tip in bezier(ctrl, 40)[-7:-3:2]:                         # a glowing tip, on the petal
            xi, yi = int(tip[0]), int(tip[1])
            if 0 <= xi < 32 and 0 <= yi < 32 and m[yi, xi]:
                L.A[yi, xi] = PETAL[8]
        masks.append(m)
    # the receptacle cup
    L.add(lambda X, Y: sd_ellipse(X, Y, 16, 15.6, 3.6, 1.8), PETAL, 2.6, gain=4, bevel=1.0)
    return masks


def bulb_layer(L, cx=16.0, cy=11.8, r=3.7):
    """The luminous bulb: violet rim, lilac body, white core and a catch-light; returns its mask."""
    m, I = L.add(lambda X, Y: sd_circle(X, Y, cx, cy, r), BULB, 3.6, gain=4.0, bevel=2.4, edge=-1)
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    d = np.hypot(xx - cx, yy - cy)
    core = m & (d < r * 0.45)
    L.A[core] = BULB[5]
    put_px(L.A, cx - 1.6, cy - 1.6, BULB[6])
    put_px(L.A, cx - 0.6, cy - 1.6, BULB[6])
    return m


def end_bloom():
    # closed
    L = Layers()
    bloom_body(L, "closed")
    bloom_petals(L, False)
    block("end_bloom_closed", L.A, tiles=False)
    # open, bare (the bulb sheared off: an empty cup with a stub)
    L = Layers()
    bloom_body(L, "open")
    bloom_petals(L, True)
    bare = L.A.copy()
    stamp(bare, 14, 12, """
        .ab.
        abba
        .cc.
    """, {"a": PETAL[3], "b": PETAL[1], "c": PETAL[5]})
    block("end_bloom_open_bare", bare, tiles=False)
    # open with the bulb
    m = bulb_layer(L)
    openA = L.A.copy()
    block("end_bloom_open", openA, tiles=False)
    # the glow overlay: the bulb and the petal veins' brightest pixels, pulsing; at the peak the light spills
    # a pixel onto the petals round the bulb
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    d = np.hypot(xx - 16.0, yy - 11.8)
    vein = (openA[..., 3] > 0) & ~m & np.all(openA[..., :3] == PETAL[8][:3], axis=-1)
    frames = []
    for g in range(4):
        F = np.zeros((32, 32, 4), np.uint8)
        F[m] = openA[m]
        lift = np.clip(np.round((1 - d / 3.7) * (1 + g)), 0, 3).astype(int)
        for k in range(1, 4):
            sel = m & (lift >= k)
            idx = np.array([np.argmin(np.abs(BULB[:, :3].astype(int) - c[:3].astype(int)).sum(1)) for c in F[sel]],
                           int) if sel.any() else np.array([], int)
            F[sel] = BULB[np.clip(idx + 1, 0, 6)]
        if g >= 2:
            halo = dilate(m) & ~m & (openA[..., 3] > 0)
            F[halo] = BULB[1 if g == 2 else 2]
        F[vein] = PETAL[8] if g < 2 else PETAL[9]
        frames.append(F)
    animated("textures/block/end_bloom_glow.png", frames, frametime=4, order=[0, 1, 2, 3, 3, 2, 1, 0],
             interpolate=True)
    return openA


def dry_end_bush():
    """A brittle grey dead shrub: a short trunk forking into a fan of kinked twigs, a few snapped stubs."""
    A = np.zeros((32, 32, 4), np.uint8)
    r = rng_for("dry_end_bush")
    segs = []

    def grow(x, y, ang, length, depth):
        pts = [(x, y)]
        for _ in range(3):                                          # kinked, never smooth
            ang += r.normal(0, 0.2)
            ang = min(-0.15, max(-math.pi + 0.15, ang))             # twigs keep reaching up
            x, y = x + math.cos(ang) * length / 3, y + math.sin(ang) * length / 3
            pts.append((x, y))
        segs.append((pts, depth))
        if depth >= 3:
            return
        n = 2 if r.random() < 0.6 else 3
        for k in range(n):
            if depth >= 2 and r.random() < 0.2:                     # snapped off
                continue
            spread = (k - (n - 1) / 2) * r.uniform(0.5, 0.8) + r.normal(0, 0.12)
            grow(x, y, ang + spread, length * r.uniform(0.6, 0.75), depth + 1)

    trunk = [(16.0, 31.5), (15.6, 28.5), (16.3, 25.5)]
    segs.append((trunk, -1))
    for a, L0 in ((-math.pi / 2 - 0.95, 8.5), (-math.pi / 2 - 0.25, 10.0), (-math.pi / 2 + 0.35, 9.5),
                  (-math.pi / 2 + 1.0, 8.0)):
        grow(16.2, 25.5, a + r.normal(0, 0.08), L0, 1)
    for pts, depth in sorted(segs, key=lambda s: -s[1]):
        px = poly_px(pts)
        tone = {-1: 2, 1: 2, 2: 3, 3: 4}[depth]
        for i, (x, y) in enumerate(px):
            put_px(A, x, y, TWIG[tone])
            if depth <= 1 and i < len(px) * (1.0 if depth < 0 else 0.5):   # thick near the base: lit left edge
                put_px(A, x - 1, y, TWIG[tone + 2])
        ex, ey = px[-1]
        put_px(A, ex, ey, TWIG[6] if depth >= 3 else TWIG[5])        # pale broken ends
    block("dry_end_bush", A, tiles=False)


end_grass_plants()
END_BLOOM_OPEN = end_bloom()
dry_end_bush()


# ====================================================================== items (32 x 32, outlined)
WING = ramp("#170f21", "#261934", "#38264b", "#4c3562", "#614679", "#795b8f", "#9273a5", "#ad90b9", "#c9b1cf",
            "#e6d9e8")                                               # dusty lilac moth scales
MEAT = ramp("#26102c", "#401a47", "#5c2763", "#7a397f", "#975299", "#b170b1", "#c993c9", "#e0b9df", "#f3dff1")
HIDE = ramp("#17131d", "#262030", "#382f44", "#4d4259", "#655870", "#7f7189")   # gucker skin, slate violet
SEAR = ramp("#1f0d16", "#391820", "#562826", "#773c2e", "#975437", "#b46f45", "#cb8d58", "#e0b077", "#f0d3a0")
GLAND = ramp("#2a0f2b", "#4a1a45", "#6c2862", "#8f3a7e", "#ae5498", "#c977b1", "#df9fcb", "#f0c9e2")
VOID = ramp("#040309", "#0a0817", "#110e26", "#1b1638", "#28204e", "#372c69", "#4b3d88", "#6a5aa8")
STEEL = ramp("#1c1a24", "#302e3b", "#474552", "#62606b", "#83808a", "#a8a4aa", "#d6d1cf")
VSTEEL = ramp("#1a1424", "#2c2240", "#40325a", "#584775", "#735f91", "#9580b0", "#c3b2d8")   # violet steel
EGG = ramp("#050308", "#0b0710", "#130b1b", "#1c1027", "#271535", "#341c46", "#45265a", "#5d3576")
STAR = {"W": "#ffffff", "b": "#bcdcff", "v": "#e2c4ff", "t": "#8ff0e0"}


def outlined(A, dark, lit=None):
    return outline(A, dark, lit)


def end_bulb_item():
    L = Layers()
    pear = lambda X, Y: smin(sd_circle(X, Y, 16, 20, 8.6), sd_circle(X, Y, 16, 13.5, 5.0), 3.0)  # noqa: E731
    m, I = L.add(pear, BULB, 3.0, gain=5.0, bevel=4.0)
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    for k in (-2, -1, 1, 2):                                          # faint lantern ribs
        for y in range(9, 29):
            half = 8.0 * math.sqrt(max(0.0, 1 - ((y - 20) / 9.5) ** 2))
            x = 16 + k * half * 0.42
            if m[y, int(x)] and abs(k) == 1 or (m[y, int(x)] and y % 2 == 0):
                L.A[y, int(x)] = BULB[max(0, I[y, int(x)] - 1)]
    d = np.hypot(xx - 15.5, (yy - 20.5) * 1.1)
    L.A[m & (d < 4.4)] = BULB[5]                                      # the light inside
    L.A[m & (d < 2.4)] = BULB[6]
    for x, y in ((11, 15), (11, 16), (12, 14)):
        put_px(L.A, x, y, BULB[6])
    # calyx, stalk and a little leaf (teal, like the End Bloom's stem)
    for ctrl in ([(16, 10), (13, 11), (10.5, 13.5)], [(16, 10), (16, 12), (16.2, 14.5)], [(16, 10), (19, 11), (21.5, 13.5)]):
        pts, rad = lens(ctrl, 1.6, 8)
        L.add(lambda X, Y, p=pts, r=rad: sd_stroke(X, Y, p, r), STEM, 4.6, gain=5, bevel=1.0)
    stalk = [tuple(p) for p in bezier([(16, 10), (16.5, 6), (19, 4), (21.5, 4.5)], 10)]
    L.add(lambda X, Y: sd_stroke(X, Y, stalk, [1.1] * 10), STEM, 4.2, gain=4, bevel=0.8)
    pts, rad = lens([(17, 6), (13.5, 3.5), (10, 4)], 1.9, 10)
    L.add(lambda X, Y: sd_stroke(X, Y, pts, rad), STEM, 5.0, gain=5, bevel=1.0)
    item("end_bulb", outlined(L.A, "#160a2a", "#2c1655"))


def enderfly_wing_item():
    """A moth forewing: hooked apex, dark base, wavy cross-lines, a pale outer field with a scalloped fringe,
    veins from the root and a big eye-spot (dark ring, glowing teal iris, violet core, catch-light)."""
    L = Layers()
    wing = [(2.5, 17.0), (3.0, 14.0), (9.5, 8.0), (17.5, 4.5), (24.5, 3.0), (29.5, 3.0), (30.0, 5.0),
            (29.0, 7.0), (29.8, 11.0), (28.5, 17.5), (25.5, 23.0), (21.5, 27.0), (16.0, 25.5), (10.0, 23.0),
            (4.5, 20.0)]
    m, I = L.add(lambda X, Y: sd_poly(X, Y, wing) + 0.3, WING, 5.0, gain=1.6, bevel=1.5)
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    u = np.hypot(xx - 3, yy - 17)                                      # distance out from the wing root
    A = L.A
    wav = np.sin(np.arctan2(yy - 17, xx - 3) * 9) * 0.9
    A[m & (u < 9 + wav)] = WING[3]                                     # the dark basal field
    A[m & (np.abs(u - 9 - wav) < 0.7)] = WING[1]                       # antemedial line
    A[m & (np.abs(u - 10.3 - wav) < 0.5)] = WING[7]
    A[m & (np.abs(u - 19 - wav) < 0.7)] = WING[1]                      # postmedial line, pale-edged outside
    A[m & (np.abs(u - 20.2 - wav) < 0.5)] = WING[8]
    A[m & (u > 21 + wav)] = WING[6]                                    # the pale outer field
    for tx, ty in ((24, 4), (29, 9), (28, 17), (24, 24), (16, 25)):    # veins from the root
        for x, y in line_px(4, 17, tx, ty)[4:-2]:
            if m[y, x] and u[y, x] > 10.5:
                A[y, x] = WING[3] if u[y, x] < 19 else WING[4]
    edge = m & ~erode(m)
    outer = edge & (u > 21)
    A[outer & ((xx.astype(int) + yy.astype(int)) % 3 == 0)] = WING[2]  # the scalloped fringe
    A[outer & ((xx.astype(int) + yy.astype(int)) % 3 != 0)] = WING[8]
    cx, cy = 20.5, 13.5
    d = np.hypot(xx - cx, yy - cy)
    A[m & (d < 4.4)] = rgba("#120818")
    A[m & (d < 3.5)] = TEAL[4]
    A[m & (d < 3.5) & (xx + yy < cx + cy - 1.0)] = TEAL[5]
    A[m & (d < 2.0)] = PETAL[6]
    A[m & (d < 1.0)] = rgba("#16061f")
    put_px(A, cx - 1.5, cy - 1.5, "#ffffff")
    put_px(A, cx - 0.5, cy - 2.5, TEAL[6])
    stamp(A, 1, 15, """
        .ab
        abc
        .bc
    """, {"a": WING[6], "b": WING[4], "c": WING[2]})
    item("enderfly_wing", outlined(A, "#0d0915", "#221a30"))


def meat_shape(X, Y, shrink=0.0):
    base = sd_ellipse(X, Y, 16, 16.5, 12.6, 8.6, -0.5)
    lobe = sd_circle(X, Y, 9.5, 22.0, 5.0)
    d = smin(base, lobe, 3.0) + np.sin(X * 0.9) * np.cos(Y * 0.7) * 0.6 + shrink
    return d


def gucker_meat_items():
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    # the rind: the slab's upper-right edge keeps a strip of slate skin
    rind_dir = (xx - 16) * 0.5 - (yy - 16.5) * 0.86
    for cooked in (False, True):
        L = Layers()
        rmp = SEAR if cooked else MEAT
        m, I = L.add(lambda X, Y: meat_shape(X, Y, 0.5 if cooked else 0.0), rmp, 4.6 if cooked else 5.0,
                     gain=4.5, bevel=3.0)
        A = L.A
        d_in = chamfer(m)
        rind = m & (d_in <= 2.5) & (rind_dir > 4)
        if cooked:
            A[rind] = SEAR[np.clip(I[rind] - 3, 0, 8)]
            A[rind & ((xx.astype(int) * 3 + yy.astype(int)) % 5 == 0)] = SEAR[4]
        else:
            Ih = np.clip(I - 3, 0, 5)
            A[rind] = HIDE[Ih[rind]]
            A[rind & ((xx.astype(int) * 3 + yy.astype(int) * 2) % 7 == 0)] = HIDE[5]   # pale skin spots
        # marbling: wavy streaks of fat along the slab
        for k, off in enumerate((-3.5, 0.5, 4.0)):
            pts = [(x, 16.5 + off + (x - 16) * 0.52 + 1.2 * math.sin(x * 0.5 + k)) for x in np.linspace(5, 27, 60)]
            for x, y in pts:
                xi, yi = int(x), int(y)
                if 0 <= yi < 32 and m[yi, xi] and not rind[yi, xi] and d_in[yi, xi] > 1.5:
                    A[yi, xi] = (SEAR[7] if cooked else MEAT[7]) if (xi + k) % 5 else (SEAR[6] if cooked else MEAT[6])
        if cooked:                                                    # grill marks: dark bars with a lit lip
            for c in (-7, 0, 7):
                for x in range(32):
                    y = int(round(-(x - 16) * 0.95 + 16.5 + c))
                    for yy_ in (y, y + 1):
                        if 0 <= yy_ < 32 and m[yy_, x] and d_in[yy_, x] > 1:
                            A[yy_, x] = SEAR[1]
                    if 0 <= y + 2 < 32 and m[y + 2, x] and d_in[y + 2, x] > 1:
                        A[y + 2, x] = SEAR[6]
        for x, y in ((9, 12), (10, 11), (11, 11)):                    # a wet / glossy highlight
            if m[y, x]:
                A[y, x] = (SEAR[8] if cooked else MEAT[8])
        item("cooked_gucker_meat" if cooked else "gucker_meat",
             outlined(A, "#1c0b0c" if cooked else "#2a0f24", "#3b1a1a" if cooked else "#4a1a3c"))


def gucker_gland_item():
    """A pulsing sac: a lumpy, glossy membrane veined in plum, lit from inside by teal nodules, with a ringed duct."""
    L = Layers()
    sac = lambda X, Y: smin(smin(sd_circle(X, Y, 14.0, 20.0, 8.2), sd_circle(X, Y, 20.5, 15.0, 6.4), 3.0),  # noqa
                            sd_circle(X, Y, 9.5, 14.5, 4.6), 2.5)
    m, I = L.add(sac, GLAND, 4.2, gain=6.0, bevel=4.5)
    duct = [tuple(p) for p in bezier([(21.5, 10), (22.5, 6.5), (24.5, 4.5), (26.5, 3.5)], 8)]
    L.add(lambda X, Y: sd_stroke(X, Y, duct, list(np.linspace(2.6, 1.8, 8))), GLAND, 3.6, gain=5, bevel=1.2)
    A = L.A
    for x, y in ((22, 7), (23, 7), (23, 6), (24, 6)):                 # a ring round the duct
        put_px(A, x, y, GLAND[1])
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    wob = (pnoise(32, 32, 5, 5, seed("gland_glow")) - 0.5) * 2.4      # the light inside, soft and lumpy
    glow = np.clip(1 - (np.hypot((xx - 14.5) / 1.15, yy - 19.5) + wob) / 7.0, 0, 1)
    A[m & (glow > 0.12)] = GLAND[5]
    A[m & (glow > 0.42)] = GLAND[6]
    A[m & (glow > 0.7)] = GLAND[7]
    r = rng_for("gucker_gland")
    for start, ang in (((21, 11), 2.0), ((18, 10), 2.7), ((23, 13), 1.7), ((9, 11), 1.8)):   # veins
        pts = jag_path(r, start[0], start[1], ang, 11, 0.5, (2, 3))
        for x, y in poly_px(pts):
            if 0 <= x < 32 and 0 <= y < 32 and m[y, x] and glow[y, x] < 0.42:
                A[y, x] = GLAND[1] if glow[y, x] < 0.12 else GLAND[3]
    for x, y in ((8, 12), (9, 11), (15, 13), (16, 12), (17, 12)):     # wet gloss
        if m[y, x]:
            A[y, x] = GLAND[7]
    item("gucker_gland", outlined(A, "#22081e", "#3e1238"))


def obsidian_shard_item():
    """A glassy flake of obsidian: three facets (lit, mid, shadow) meeting at bright ridges, ripple marks."""
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    shard = [(7.0, 30.0), (3.0, 23.5), (6.5, 16.5), (12.5, 12.0), (18.0, 5.5), (28.0, 1.5), (26.5, 9.0),
             (26.0, 16.0), (20.5, 21.5), (14.5, 27.5)]
    X, Y = ss_coords(32, 32, 4)
    m = down((sd_poly(X, Y, shard) < 0).astype(float), 4) >= 0.5

    def side(a, b):                                                  # which side of the line a-b
        return (xx - a[0]) * (b[1] - a[1]) - (yy - a[1]) * (b[0] - a[0])

    r1 = side((7.0, 27.0), (27.5, 2.0))                               # the main ridge, butt to point
    r2 = side((12.0, 21.0), (6.5, 16.5))                              # a chip off the butt
    I = np.where(r1 > 0, 5, 2)                                        # lit facet (upper left) / shadow facet
    I = np.where((r1 <= 0) & (side((15, 24), (26.5, 9.0)) < 0), 3, I)  # a narrow mid facet on the right
    I = np.where((r2 < 0) & (r1 > 0), 4, I)
    t = np.hypot(xx - 30, yy - 0)
    I = np.where((r1 <= 0) & (I == 2) & (np.cos(t * 1.1) > 0.8), 3, I)   # conchoidal ripples in the shadow
    I = np.where((r1 > 0) & (I == 5) & (np.cos(t * 0.9) > 0.9), 6, I)
    for a, b, v in (((7, 27), (27, 2), 8), ((15, 24), (26, 9), 6), ((12, 21), (7, 17), 7)):   # bright ridges
        for x, y in line_px(*a, *b):
            if m[y, x]:
                I[y, x] = v
    for x, y, v in ((24, 5, 9), (25, 4, 8), (23, 6, 8)):
        I[y, x] = v
    sheen = (r1 <= 0) & (np.hypot(xx - 18, yy - 19) < 4.5)
    A = paint(np.where(m, I, -1), OBS, OBS_SHEEN, sheen)
    item("obsidian_shard", outlined(A, "#030205", "#1a1226"))


def eye_in_setting(A, m_setting, cx, cy, ew, eh, iris_r, glow=True):
    """An almond eye (glowing violet iris, slit pupil, catch-light) cut into an obsidian setting."""
    yy, xx = np.mgrid[0:A.shape[0], 0:A.shape[1]] + 0.5
    # almond: the intersection of two circles
    R = (ew ** 2 / 4 + eh ** 2) / (2 * eh) * 1.0
    up = np.hypot(xx - cx, yy - (cy - eh / 2 + R)) < R
    dn = np.hypot(xx - cx, yy - (cy + eh / 2 - R)) < R
    eye = up & dn & m_setting
    rim = dilate(eye) & ~eye & m_setting
    A[rim] = OBS[0]
    A[eye] = PETAL[3]
    A[eye & (yy < cy - eh / 4)] = PETAL[2]                          # the lid's shadow on the eyeball
    d = np.hypot(xx - cx, yy - cy)
    iris = eye & (d < iris_r)
    A[iris] = BULB[2]
    A[iris & (d < iris_r * 0.66)] = BULB[3]
    A[iris & (d < iris_r * 0.66) & (xx + yy > cx + cy)] = BULB[4]
    A[eye & (np.abs(xx - cx) < 0.7) & (np.abs(yy - cy) < iris_r * 0.85)] = rgba("#0d0418")
    put_px(A, cx - iris_r * 0.5, cy - iris_r * 0.5, "#ffffff")
    put_px(A, cx - iris_r * 0.5 + 1, cy - iris_r * 0.5, BULB[5])
    if glow:
        spill = dilate(rim) & ~rim & ~eye & m_setting & (yy > cy)
        A[spill] = OBS_SHEEN[6]
    return eye


def monolith_eye_item():
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    setting = [(16, 2.5), (24.5, 5.5), (29.5, 13), (28.5, 21), (23, 28), (14, 29.5), (6.5, 26), (2.5, 17),
               (5.5, 8)]
    X, Y = ss_coords(32, 32, 4)
    m = down((sd_poly(X, Y, setting) < 0).astype(float), 4) >= 0.5
    # facets fanning from the middle, lit by their direction (top-left bright)
    ang = np.arctan2(yy - 16, xx - 16)
    facet = np.floor((ang + math.pi) / (2 * math.pi) * 9).astype(int)
    fa = (facet + 0.5) / 9 * 2 * math.pi - math.pi
    lightness = -(np.cos(fa) + np.sin(fa)) / 1.41                     # 1 toward the top-left
    I = np.clip(np.round(3.3 + lightness * 2.2), 1, 6).astype(int)
    edges = m & (facet != shift(facet, 1, 0, fill=-1)) & (np.hypot(xx - 16, yy - 16) > 9)
    I = np.where(edges, np.clip(I + 2, 0, 8), I)
    A = paint(np.where(m, I, -1), OBS, OBS_SHEEN, np.hypot(xx - 21, yy - 22) < 5)
    for x, y in ((8, 9), (9, 8), (10, 7), (15, 4)):
        put_px(A, x, y, OBS[8])
    put_px(A, 9, 8, OBS[9])
    eye_in_setting(A, m, 16.0, 16.5, 19.0, 10.0, 4.4)
    item("monolith_eye", outlined(A, "#030205", "#1a1226"))


def void_rod_item(A=None, a=(6.5, 26.5), b=(25.5, 7.5), name="void_rod", seed_name="void_rod", draw=True):
    """A dark starry rod: a window into the void between two violet-steel caps."""
    if A is None:
        A = np.zeros((32, 32, 4), np.uint8)
    L = Layers()
    L.A = A
    rod = lambda X, Y: sd_segment(X, Y, *a, *b, 2.3)  # noqa: E731
    m, I = L.add(rod, VOID, 2.6, gain=5.0, bevel=2.0)
    r = rng_for(seed_name)
    ys, xs = np.nonzero(m & erode(m))
    for k in r.choice(len(xs), size=min(9, len(xs)), replace=False):
        x, y = int(xs[k]), int(ys[k])
        A[y, x] = rgba(STAR[str(r.choice(list("Wbvt")))])
    x, y = int((a[0] * 0.6 + b[0] * 0.4)), int((a[1] * 0.6 + b[1] * 0.4))
    stamp(A, x - 1, y - 1, """
        .b.
        bWb
        .b.
    """, {"b": STAR["b"], "W": STAR["W"]})
    ux, uy = (b[0] - a[0]), (b[1] - a[1])
    n = math.hypot(ux, uy)
    ux, uy = ux / n, uy / n
    for (px, py), s in ((a, 1), (b, -1)):                            # violet-steel caps
        cx, cy = px + ux * 2.0 * s, py + uy * 2.0 * s
        cap = lambda X, Y, cx=cx, cy=cy: sd_segment(X, Y, cx - ux * 2.2, cy - uy * 2.2, cx + ux * 1.6,  # noqa
                                                     cy + uy * 1.6, 2.9)
        L.add(cap, VSTEEL, 3.4, gain=6, bevel=1.6)
    put_px(A, b[0] + 0.5, b[1] - 0.5, BULB[5])                     # a violet glint at the tip
    if draw:
        item(name, outlined(A, "#06040e", "#1a1530"))
    return A


def egg_mask():
    """Vanilla's dragon egg outline, front on: its stacked slabs (8 ... 28 px wide), each step a ledge."""
    m = np.zeros((32, 32), bool)
    y = 1
    for wd, ht in ((8, 2), (12, 2), (16, 2), (20, 4), (24, 6), (28, 8), (24, 4), (18, 2)):
        m[y:y + ht, 16 - wd // 2:16 + wd // 2] = True
        y += ht
    return m


def dragon_egg_items():
    m = egg_mask()
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    nx, ny = (xx - 16) / 14.5, (yy - 19) / 17
    nz = np.sqrt(np.clip(1 - nx ** 2 - ny ** 2, 0.05, 1))
    lam = (-nx - ny + nz * 1.25) / math.sqrt(1 + 1 + 1.25 ** 2)
    I = np.clip(np.round(1.0 + lam * 5.2), 1, 6).astype(int)
    stepedge = m & ~shift(m, 0, 1)                                  # the lit top of each step
    I = np.where(stepedge & (xx < 20), np.clip(I + 1, 0, 7), I)
    r = rng_for("dragon_egg")
    A = paint(np.where(m, I, -1), EGG)
    ys, xs = np.nonzero(erode(m))
    for k in r.choice(len(xs), 22, replace=False):                   # violet specks, in little pairs
        x, y = int(xs[k]), int(ys[k])
        A[y, x] = rgba("#4c1662")
        if r.random() < 0.6 and m[y, x + 1]:
            A[y, x + 1] = rgba("#36104a")
    rc = rng_for("dragon_egg", "cracks")
    main = jag_path(rc, 16.0, 1.5, 1.95, 17, 0.55, (2, 4))
    cracks = [main, jag_path(rc, *main[3], 2.6, 6, 0.5, (2, 3)),
              jag_path(rc, 28.5, 18.0, 2.75, 13, 0.6, (2, 4)), jag_path(rc, 21.0, 22.0, 0.9, 5, 0.5, (2, 3)),
              jag_path(rc, *main[-1], 2.2, 5, 0.5, (2, 3))]
    for stage, n in ((1, 2), (2, 5)):
        B = A.copy()
        core = np.zeros((32, 32), bool)
        for pts in cracks[:n]:
            for x, y in poly_px(pts):
                if 0 <= x < 32 and 0 <= y < 32 and m[y, x]:
                    core[y, x] = True
        lip = dilate(core) & ~core & m
        spill = dilate(lip, diag=True) & ~lip & ~core & m
        B[spill] = EGG[7] if stage == 2 else EGG[6]
        B[lip] = CRY[1] if stage == 1 else CRY[2]
        B[core] = CRY[4] if stage == 1 else CRY[5]
        if stage == 2:                                               # hottest where the cracks meet
            for x, y in ((14, 12), (22, 22), (15, 13)):
                if core[y, x]:
                    B[y, x] = CRY[6]
        for x, y in ((10, 7), (11, 6), (9, 9)):                       # gloss
            if m[y, x] and not core[y, x] and not lip[y, x]:
                B[y, x] = EGG[7]
        item(f"dragon_egg_cracked_{stage}", outlined(B, "#020103", "#140a1e"))


def end_bloom_item():
    """The open bloom with its bulb, outlined for the inventory."""
    A = outlined(END_BLOOM_OPEN, "#0b0716", "#1c1030")
    item("end_bloom", A)


def obsidian_shield_icon():
    yy, xx = np.mgrid[0:32, 0:32] + 0.5
    shape = [(5, 3.5), (27, 3.5), (28.5, 5.5), (28.5, 15), (25, 23), (16, 30), (7, 23), (3.5, 15), (3.5, 5.5)]
    X, Y = ss_coords(32, 32, 4)
    m = down((sd_poly(X, Y, shape) < 0).astype(float), 4) >= 0.5
    rimw = m & (chamfer(m) <= 2.0)
    face = m & ~rimw
    # the face: a mosaic of obsidian shards, each with its own tone and a lit edge
    r = rng_for("obsidian_shield")
    pts = [(r.uniform(5, 27), r.uniform(5, 27)) for _ in range(9)]
    F1, F2, idx, dx, dy = voronoi(32, 32, pts, wrap=False)
    tone = np.array([r.integers(2, 5) for _ in pts])[idx]
    I = np.where((F2 - F1) < 1.0, 1, tone)
    I = np.where(((F2 - F1) >= 1.0) & ((F2 - F1) < 2.0) & (dx + dy > 0), np.clip(tone + 2, 0, 7), I)
    A = paint(np.where(face, I, -1), OBS, OBS_SHEEN, sheen_mask("obsidian_shield", 32, 32, 0.55))
    # the iron rim, bevelled: lit top-left, dark bottom-right
    Lr = np.clip(np.round(3.5 - ((xx - 16) + (yy - 16)) / 16 * 2.2), 1, 6).astype(int)
    inner = rimw & ~dilate(~m) | (rimw & (chamfer(m) > 1.0))
    A[rimw] = STEEL[Lr[rimw]]
    A[rimw & (chamfer(m) > 1.0)] = STEEL[np.clip(Lr - 1, 0, 6)[rimw & (chamfer(m) > 1.0)]]
    for (x, y) in ((6, 5), (26, 5), (6, 14), (26, 14), (16, 27)):     # rivets
        put_px(A, x, y, STEEL[6])
    # the eye boss in the middle
    boss = np.hypot(xx - 16, yy - 14.5) < 5.4
    A[boss & face] = OBS[2]
    eye_in_setting(A, boss & face, 16.0, 14.5, 9.0, 5.0, 2.4)
    item("obsidian_shield_icon", outlined(A, "#06040b", "#1d1a26"))


def end_glider_icon():
    L = Layers()
    # wings: two moth wings spread up from the frame ends
    for sgn in (-1, 1):
        wing = [(16 + sgn * 3, 17), (16 + sgn * 6, 9), (16 + sgn * 11, 3.5), (16 + sgn * 15, 3), (16 + sgn * 15.5, 8),
                (16 + sgn * 14, 14), (16 + sgn * 9, 18.5)]
        m, I = L.add(lambda X, Y, w=wing: sd_poly(X, Y, w) + 0.2, WING, 4.6, gain=3, bevel=1.6)
        cx, cy = 16 + sgn * 11.5, 8.5
        yy, xx = np.mgrid[0:32, 0:32] + 0.5
        d = np.hypot(xx - cx, yy - cy)
        L.A[m & (d < 2.6)] = rgba("#120818")
        L.A[m & (d < 1.8)] = TEAL[4]
        L.A[m & (d < 0.8)] = PETAL[6]
        for tx, ty in ((16 + sgn * 15, 4), (16 + sgn * 14, 12)):
            for x, y in line_px(16 + sgn * 4, 16, tx, ty)[2:-1]:
                if m[y, x] and d[y, x] > 2.6:
                    L.A[y, x] = WING[2]
    # the frame bar and its grip
    L.add(lambda X, Y: sd_segment(X, Y, 4.5, 19.5, 27.5, 19.5, 1.5), STEEL, 3.6, gain=6, bevel=1.2)
    L.add(lambda X, Y: sd_segment(X, Y, 16, 18, 16, 27.5, 1.6), SEAR, 3.4, gain=5, bevel=1.2)
    for y in (21, 23, 25):
        put_px(L.A, 15, y, SEAR[1])
        put_px(L.A, 16, y, SEAR[2])
    # jets: gland-sac pods under the bar ends, flames streaming down
    for jx in (7.0, 25.0):
        L.add(lambda X, Y, jx=jx: sd_ellipse(X, Y, jx, 22.5, 2.6, 3.4), GLAND, 4.2, gain=5, bevel=1.6)
        L.add(lambda X, Y, jx=jx: sd_segment(X, Y, jx, 25, jx, 26.2, 1.6), STEEL, 3.0, gain=4, bevel=1.0)
        flame = [(jx, 27.5, 7), (jx - 1, 27.5, 5), (jx + 1, 27.5, 5), (jx, 28.5, 6), (jx, 29.5, 4),
                 (jx - 1, 28.5, 4), (jx + 1, 28.5, 3), (jx, 30.5, 3)]
        for x, y, t in flame:
            put_px(L.A, x, y, HOT[t])
    item("end_glider_icon", outlined(L.A, "#0d0915", "#221a30"))


def monolith_wand_icon():
    A = np.zeros((32, 32, 4), np.uint8)
    void_rod_item(A, a=(4.5, 28.5), b=(18.5, 14.5), seed_name="monolith_wand", draw=False)
    L = Layers()
    L.A = A
    # the head: an obsidian claw of three prongs round a glowing eye-orb, a meteorite-core collar
    L.add(lambda X, Y: sd_circle(X, Y, 19.5, 13.5, 3.0), MET, 4.0, gain=5, bevel=1.5)
    for x, y in ((19, 13), (20, 13), (19, 14), (18, 14)):
        put_px(A, x, y, HOT[5])
    put_px(A, 19, 13, HOT[7])
    for ctrl in ([(18.5, 13.5), (17.5, 8.0), (20.0, 3.5)], [(20.5, 15.0), (26.0, 15.5), (29.0, 11.0)],
                 [(20.0, 13.0), (24.5, 7.5), (27.0, 3.0)]):
        pts, rad = lens(ctrl, 1.7, 10, taper=(0.5, 0.5), base_w=1.6)
        L.add(lambda X, Y, p=pts, r=rad: sd_stroke(X, Y, p, r), OBS, 3.6, gain=7, bevel=1.4)
    m, I = L.add(lambda X, Y: sd_circle(X, Y, 23.5, 9.0, 4.0), PETAL, 3.0, gain=3, bevel=2.0)
    eye_in_setting(A, m, 23.5, 9.0, 7.6, 4.6, 2.2, glow=False)
    item("monolith_wand_icon", outlined(A, "#06040e", "#1a1530"))


end_bulb_item()
enderfly_wing_item()
gucker_meat_items()
gucker_gland_item()
obsidian_shard_item()
monolith_eye_item()
void_rod_item()
dragon_egg_items()
end_bloom_item()
obsidian_shield_icon()
end_glider_icon()
monolith_wand_icon()


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
