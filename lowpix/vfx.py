"""Pixel-art VFX for cards: starburst flares, rune rings, slash arcs, sparkles, embers, energy wisps.

Each function draws an intensity field on a small grid and quantises it to a few tones (with ordered dither on
the soft edges, the way pixel artists hand-place transition pixels). It returns `(art, key)`: card ASCII art
plus an `art_key` mapping its tone characters to steps of a palette ramp, so the card stays strictly
on-palette.

    art, key = vfx.starburst(48, rays=12, ramp="sun")
    {"id": "flare", "shape": "card", "plane": "xy", "size": [12, 12], "art": art, "style": "fx"}
    # style "fx": {"ramp": "sun", "light": 0, "art_key": key}
"""
from __future__ import annotations

import math

import numpy as np

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
CHARS = "123456789"


def _art(I, ramp, steps=(1, 2, 3, 4, 5, 6), cut=0.1, dither=True):
    """Intensity (0..1) -> art rows + key. Tones map to ramp steps; soft edges get ordered dither."""
    H, W = I.shape
    n = len(steps)
    t = np.clip(I, 0, 1) * n
    if dither:
        t = t + (BAYER[np.arange(H)[:, None] % 4, np.arange(W)[None, :] % 4] - 0.5) * 0.9
    idx = np.clip(np.floor(t), 0, n - 1).astype(int)
    rows = []
    for y in range(H):
        row = []
        for x in range(W):
            if I[y, x] < cut or (dither and I[y, x] < cut * 2.2 and BAYER[y % 4, x % 4] > I[y, x] / (cut * 2.2)):
                row.append(".")
            else:
                row.append(CHARS[idx[y, x]])
        rows.append("".join(row))
    key = {CHARS[i]: f"{ramp}:{s}" for i, s in enumerate(steps)}
    return rows, key


def _grid(w, h=None):
    h = h or w
    y, x = np.mgrid[0:h, 0:w].astype(float)
    return (x + 0.5) / w * 2 - 1, (y + 0.5) / h * 2 - 1


def starburst(size=48, rays=12, inner=0.22, ramp="sun", hole=True, seed=0, steps=(2, 3, 4, 5, 6)):
    """A radiant flare: tapered rays (alternating long and short), a soft halo ring, an open centre."""
    rng = np.random.default_rng(seed)
    X, Y = _grid(size)
    r = np.hypot(X, Y)
    a = np.arctan2(Y, X)
    I = np.zeros_like(r)
    for k in range(rays):
        ang = 2 * math.pi * k / rays + rng.uniform(-0.05, 0.05)
        L = (0.98 if k % 2 == 0 else 0.68) * rng.uniform(0.9, 1.0)
        d = np.abs(np.angle(np.exp(1j * (a - ang))))
        width = 0.22 * (1 - np.clip(r / L, 0, 1)) + 0.03
        ray = np.clip(1 - d / (width / np.maximum(r, 0.05)), 0, 1) * np.clip(1 - r / L, 0, 1) ** 0.45 * (r > inner * 0.8)
        I = np.maximum(I, ray * (1.0 if k % 2 == 0 else 0.8))
    halo = np.exp(-((r - inner * 1.35) / 0.07) ** 2) * 0.9
    I = np.maximum(I, halo)
    if not hole:
        I = np.maximum(I, np.clip(1 - r / inner, 0, 1))
    return _art(I, ramp, steps)


def rune_ring(size=48, glyphs=10, ramp="neon", seed=0, steps=(2, 3, 4, 5, 6)):
    """A thin glowing ring with notched glyph marks around it (a magic circle seen face-on)."""
    rng = np.random.default_rng(seed)
    X, Y = _grid(size)
    r = np.hypot(X, Y)
    a = np.mod(np.arctan2(Y, X), 2 * math.pi)
    I = np.exp(-((r - 0.86) / 0.035) ** 2) + 0.7 * np.exp(-((r - 0.62) / 0.03) ** 2)
    seg = np.floor(a / (2 * math.pi) * glyphs)
    frac = a / (2 * math.pi) * glyphs - seg
    shape = rng.integers(0, 4, glyphs)
    band = (r > 0.66) & (r < 0.82)
    for g in range(glyphs):
        m = band & (seg == g)
        s = shape[g]
        mark = {0: np.abs(frac - 0.5) < 0.08, 1: (np.abs(frac - 0.3) < 0.06) | (np.abs(frac - 0.7) < 0.06),
                2: np.abs(r - 0.74) < 0.03, 3: (np.abs(frac - 0.5) < 0.25) & (np.abs(r - 0.7) < 0.025)}[s]
        I = np.where(m & mark, np.maximum(I, 0.95), I)
    return _art(np.clip(I, 0, 1), ramp, steps, dither=False)


def slash_arc(w=64, h=32, ramp="neon", steps=(2, 3, 4, 5, 6), thickness=0.5):
    """A crescent swipe trail: bright leading edge fading (dithered) toward the tail."""
    X, Y = _grid(w, h)
    cx, cy, R = 0.0, 0.95, 1.5
    d = np.hypot((X - cx) * 1.0, (Y - cy) * 1.0)
    edge = R - d
    t = np.clip((X + 1) / 2, 0, 1)                     # tail (left) -> head (right)
    th = thickness * (0.25 + 0.75 * np.sin(np.pi * np.clip(t, 0.02, 0.98)) ** 0.7)
    u = np.clip(1 - edge / th, 0, 1)
    I = np.where((edge > 0) & (edge < th), u ** 0.6 * (0.35 + 0.65 * t), 0.0)
    return _art(I, ramp, steps)


def sparkle(size=15, ramp="sun", steps=(3, 4, 5, 6)):
    """A four-point pixel star with long thin arms and a bright core."""
    X, Y = _grid(size)
    I = np.maximum(np.clip(1 - np.abs(X) / 0.08, 0, 1) * np.clip(1 - np.abs(Y), 0, 1) ** 1.5,
                   np.clip(1 - np.abs(Y) / 0.08, 0, 1) * np.clip(1 - np.abs(X), 0, 1) ** 1.5)
    I = np.maximum(I, np.clip(1 - np.hypot(X, Y) / 0.3, 0, 1))
    return _art(I, ramp, steps, dither=False)


def ember(w=7, h=11, ramp="sun", seed=0, steps=(2, 3, 4, 5, 6)):
    """A small flame-tongue ember: hot core, flickering tip."""
    rng = np.random.default_rng(seed)
    X, Y = _grid(w, h)
    lean = rng.uniform(-0.25, 0.25)
    body = 1 - np.hypot(X - lean * (1 - Y) / 2, (Y - 0.35) * 0.6)
    tip = np.clip(1 - np.abs(X - lean * (1 - Y)) / (0.5 * (Y + 1) / 2 + 0.05), 0, 1) * (Y < 0.4)
    I = np.clip(np.maximum(body, tip * 0.8), 0, 1) ** 1.3
    return _art(I, ramp, steps)


def wisp(w=24, h=40, ramp="neon", seed=0, steps=(2, 3, 4, 5, 6)):
    """A curling energy wisp rising: a sinuous ribbon that thins and fades upward."""
    rng = np.random.default_rng(seed)
    X, Y = _grid(w, h)
    ph = rng.uniform(0, 2 * math.pi)
    centre = 0.35 * np.sin((1 - Y) * 3.0 + ph)
    width = 0.28 * (Y + 1.2) / 2.2
    I = np.clip(1 - np.abs(X - centre) / np.maximum(width, 0.04), 0, 1) * ((Y + 1) / 2) ** 0.6
    return _art(I, ramp, steps)
