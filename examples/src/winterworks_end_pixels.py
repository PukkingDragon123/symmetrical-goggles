#!/usr/bin/env python3
"""The Living End's block and item textures, 16 x 16 in vanilla Minecraft style (END_UPDATE.md section 15).

    python examples/src/winterworks_end_pixels.py                  # write the block + item PNGs (and .mcmeta)
    python examples/src/winterworks_end_pixels.py --preview DIR    # also contact sheets (tiled 3 x 3, 8x)
    python examples/src/winterworks_end_art.py                     # the same, plus particles, sky and effects

Vanilla rules, learnt from the look of vanilla textures (never copied): 16 x 16, one pixel = one Minecraft pixel; a
small hand-picked palette per material (4-6 tones, dark -> light, hue-shifted); soft, even noise in 2-3 pixel
clusters with no lone spots, blobs or motifs that stand out when the block repeats; light from the top-left; bricks
and tiles with a lit top-left lip, a shaded bottom-right lip and dark joints. Items: a 1-pixel outline in a darker
shade of the item's own colour (never black), shading from the top-left light, few colours.

Noise blocks are generated from periodic noise (every texture wraps at its edges) and quantised by rank, so each tone
covers a fixed share of the block. Masonry (bricks, tiles) is drawn from hand-made layouts, the meteorite's seams
from hand-placed crack lines, and the chorus fruit block from hand-placed lobed fruits (sphere-shaded lobes that
crease where they meet). Plants, items and small motifs are hand-placed ASCII grids: one character per pixel, '.'
transparent.

The fruits are End designs, not round fruit with a highlight. The End Bulb is the End Bloom's pale papery husk split
into three curling petals round its cluster of glowing violet seeds (the bloom shows the same husk closed, open and
emptied). The chorus fruit block is a heap of crumpled, lobed chorus fruit with pale buds on the sides and their
star-shaped stem ends on top. `--preview` also draws the rejected candidates.
Animated textures (meteorite, meteorite_core, end_bloom_glow) are vertical strips of 16 x 16 frames + `.mcmeta`.

The Chorus Cocoon is a vanilla-style block model (like cocoa): `models/block/chorus_cocoon_age0..3.json` (a few
boxes each: the pod, its tip, a cap of petals and the stalk) over the one 16 x 16 `block/chorus_cocoon`
texture, both written here.

Every random choice is seeded by the texture's name, so a run always writes the same files.
"""
from __future__ import annotations

import argparse
import json
import math
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "mods/winterworks/src/main/resources/assets/winterworks"
N = 16

OUT: dict[str, Image.Image] = {}      # relative path (under assets/winterworks) -> image
JSON: dict[str, dict] = {}            # relative path -> json body (.mcmeta, block models)
ANIM: dict[str, list] = {}            # relative path -> frames in play order (for the previews)
TILES: set[str] = set()               # textures that must tile (the previews show them 3 x 3)
EXTRA: dict[str, Image.Image] = {}    # design candidates (preview only, never written)


# ====================================================================== colour
def rgba(c):
    if c is None:
        return (0, 0, 0, 0)
    if isinstance(c, (tuple, list, np.ndarray)):
        c = tuple(int(v) for v in c)
        return c if len(c) == 4 else (*c, 255)
    c = c.lstrip("#")
    if len(c) == 6:
        c += "ff"
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4, 6))


def rng_for(name, *extra):
    return np.random.default_rng(zlib.crc32("/".join(map(str, (name,) + extra)).encode()))


# ---------------------------------------------------------------------- palettes (dark -> light)
END_STONE = ["#b3ab78", "#c4bd88", "#d1d293", "#dde2a2", "#e9f0b1", "#f4f8c0"]     # as vanilla end stone
GRASS = ["#2e1546", "#3e1d5c", "#4f2873", "#63368a", "#7746a0", "#8d5bb5", "#a676c9"]  # End grass, violet
MOSS = ["#4a1745", "#5c1f56", "#702a66", "#853676", "#994485", "#ad5794"]            # End moss, magenta
SAND = ["#8b8791", "#99959e", "#a7a3aa", "#b4b1b6", "#c2bfc1", "#cfcdcd"]            # End sand, cool grey
OBS = ["#050309", "#0c0915", "#151022", "#1f1830", "#2b2140", "#3a2c54", "#4c3b69"]   # obsidian, as vanilla's
CRY = ["#2d0868", "#4c0fa3", "#7420d6", "#9d54f0", "#c99cff", "#efe0ff"]            # crying-obsidian glow
ROCK = ["#120d0f", "#1b1517", "#251e20", "#31282a", "#3e3436", "#4e4244", "#615355"]  # meteorite crust
HEAT = ["#4a0f3e", "#8c1f4c", "#d0432f", "#f57a26", "#ffb83d", "#ffe57e", "#fffbe0"]  # meteorite heat
CHORUS = ["#2a0f2c", "#3a173c", "#4d244e", "#623362", "#784777", "#8f5f8d", "#aa80a6", "#c8a6c3"]
ROOTS = ["#1d111b", "#2b1928", "#3b2436", "#4d3146", "#614058", "#77526b", "#90697f"]
FRUIT = ["#2c0f31", "#43194a", "#5c2862", "#773a7a", "#915090", "#ab6ca8", "#c58fc0", "#e3c6de"]
BLOOM = ["#dccbe8", "#c4abd9", "#a688c4", "#8366a7", "#614a86", "#433262"]          # papery husk, light -> dark
SEED = ["#3d1380", "#6524c4", "#9150f0", "#bf8dff", "#e9d4ff", "#fdf7ff"]           # glowing End seeds
LEAF = ["#14262e", "#1d3a42", "#285058", "#386a6e", "#4f8984"]                      # stems: End teal-slate
TWIG = ["#2a2530", "#3e3844", "#57505b", "#726a73", "#8f878d", "#b0a8aa"]            # bleached dry twigs


# ====================================================================== grids and images
def grid(rows, key, w=N, h=N, name="?"):
    """An ASCII grid (one character per pixel, '.' transparent, spaces ignored) -> RGBA array."""
    lines = [ln.replace(" ", "") for ln in rows.strip("\n").splitlines()]
    lines = [ln for ln in lines if ln]
    if len(lines) != h or any(len(ln) != w for ln in lines):
        raise ValueError(f"{name}: grid is {[len(ln) for ln in lines]} x {len(lines)}, expected {w} x {h}")
    A = np.zeros((h, w, 4), np.uint8)
    for y, ln in enumerate(lines):
        for x, ch in enumerate(ln):
            if ch == ".":
                continue
            if ch not in key:
                raise ValueError(f"{name}: unknown character {ch!r} at ({x}, {y})")
            A[y, x] = rgba(key[ch])
    return A


def from_index(I, ramp_):
    """Palette indices -> RGBA (index -1 = transparent)."""
    cols = np.array([rgba(c) for c in ramp_], np.uint8)
    A = cols[np.clip(I, 0, len(ramp_) - 1)]
    A[I < 0] = 0
    return A


def to_img(A):
    return Image.fromarray(np.ascontiguousarray(A), "RGBA")


def put(path, A):
    OUT[path] = A if isinstance(A, Image.Image) else to_img(A)


def block(name, A, tiles=True):
    put(f"textures/block/{name}.png", A)
    if tiles:
        TILES.add(f"textures/block/{name}.png")


def item(name, A):
    put(f"textures/item/{name}.png", A)


def candidate(name, A, tiles=False):
    EXTRA[name] = to_img(A)
    if tiles:
        TILES.add(name)


def animated(path, frames, frametime=3, order=None, interpolate=False, tiles=True):
    """Frames stacked vertically + <path>.mcmeta (vanilla texture animation)."""
    ims = [to_img(f) if isinstance(f, np.ndarray) else f for f in frames]
    strip = Image.new("RGBA", (N, N * len(ims)), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        strip.paste(im, (0, i * N))
    put(path, strip)
    body = {"frametime": frametime}
    if interpolate:
        body["interpolate"] = True
    if order:
        body["frames"] = order
    JSON[path + ".mcmeta"] = {"animation": body}
    ANIM[path] = [ims[i] for i in (order or range(len(ims)))]
    if tiles:
        TILES.add(path)


# ====================================================================== periodic noise
YY, XX = np.mgrid[0:N, 0:N].astype(float)


def wave_noise(rng, fmin=1, fmax=4, power=1.0, aniso=(1.0, 1.0), n=N):
    """Smooth noise that wraps at the edges: a sum of whole-period waves (frequencies fmin..fmax per tile)."""
    y, x = np.mgrid[0:n, 0:n].astype(float) / n
    out = np.zeros((n, n))
    for fx in range(-fmax, fmax + 1):
        for fy in range(0, fmax + 1):
            if fy == 0 and fx <= 0:
                continue
            f = math.hypot(fx * aniso[0], fy * aniso[1])
            if f < fmin or f > fmax:
                continue
            out += rng.normal() / f ** power * np.cos(2 * math.pi * (fx * x + fy * y) + rng.random() * 2 * math.pi)
    return (out - out.mean()) / (out.std() + 1e-9)


def blur(V, k=1):
    """A small box blur (wrapping)."""
    acc = np.zeros_like(V, float)
    n = 0
    for dy in range(-k, k + 1):
        for dx in range(-k, k + 1):
            acc += np.roll(np.roll(V, dy, 0), dx, 1)
            n += 1
    return acc / n


def grain(rng, n=N, soft=0.5):
    """Pixel grain softened towards its neighbours (2-3 pixel clusters rather than lone pixels)."""
    g = rng.normal(size=(n, n))
    return (1 - soft) * g + soft * blur(g) * 3.0


def rank_levels(V, shares, mask=None):
    """Quantise V so that tone k covers shares[k] of the (masked) pixels: an even, controlled spread of tones."""
    shares = np.asarray(shares, float) / np.sum(shares)
    m = np.ones(V.shape, bool) if mask is None else mask
    vals = np.sort(V[m])
    cuts = [vals[min(len(vals) - 1, int(round(c * len(vals))))] for c in np.cumsum(shares)[:-1]]
    I = np.searchsorted(np.asarray(cuts), V, side="right")
    return np.where(m, I, -1)


def tame(I, passes=2, keep=None):
    """Remove lone pixels: a pixel two or more tones away from all four neighbours steps towards their median."""
    I = I.copy()
    for _ in range(passes):
        nb = np.stack([np.roll(I, s, a) for s in (1, -1) for a in (0, 1)])
        med = np.median(nb, axis=0)
        lone = np.all(np.abs(nb - I[None]) >= 1, axis=0) & (np.abs(med - I) >= 1)
        if keep is not None:
            lone &= ~keep
        step = np.sign(med - I).astype(int)
        I = np.where(lone, I + step, I)
    return I


def even(V, k=0.75):
    """Take out most of any row, column or 4 x 4 drift, so the repeat shows no bands or blobs."""
    V = V - k * V.mean(1, keepdims=True) - k * V.mean(0, keepdims=True)
    cells = V.reshape(4, 4, 4, 4).mean((1, 3))
    return V - k * np.kron(cells, np.ones((4, 4)))


def light_shift(V, strength=0.35):
    """Tilt noise into soft top-left-lit lumps: add the negative derivative along the light direction."""
    d = (np.roll(V, 1, 1) - np.roll(V, -1, 1)) + (np.roll(V, 1, 0) - np.roll(V, -1, 0))
    return V - strength * d


# ====================================================================== the previews
CHK = ((156, 156, 160, 255), (118, 118, 124, 255))


def checker(size, a, b, cell=8):
    im = Image.new("RGBA", size, a)
    d = ImageDraw.Draw(im)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                d.rectangle((x, y, x + cell - 1, y + cell - 1), fill=b)
    return im


def first_frame(im):
    return im.crop((0, 0, im.width, im.width)) if im.height > im.width else im


def tile3(im, s=8):
    im = first_frame(im)
    t = Image.new("RGBA", (im.width * 3, im.height * 3))
    for ty in range(3):
        for tx in range(3):
            t.alpha_composite(im, (tx * im.width, ty * im.height))
    return t.resize((t.width * s, t.height * s), Image.NEAREST)


def on(bg, im):
    base = bg.copy()
    base.alpha_composite(im)
    return base


def show(rel, im, s=8):
    """One preview cell: 3 x 3 tiled at s x if it tiles, else on a checkerboard and a dark backdrop at s x."""
    im = first_frame(im)
    if rel in TILES:
        return tile3(im, s)
    big = im.resize((im.width * s, im.height * s), Image.NEAREST)
    a = on(checker(big.size, *CHK, cell=s), big)
    b = on(Image.new("RGBA", big.size, (30, 26, 40, 255)), big)
    out = Image.new("RGBA", (big.width * 2 + 4, big.height), (0, 0, 0, 0))
    out.paste(a, (0, 0))
    out.paste(b, (big.width + 4, 0))
    return out


def sheet(cells, dst, cols=4, bg=(34, 32, 40, 255)):
    """cells: (label, image) -> a labelled grid."""
    cw = max(im.width for _, im in cells) + 12
    ch = max(im.height for _, im in cells) + 24
    rows = (len(cells) + cols - 1) // cols
    S = Image.new("RGBA", (cw * cols + 8, ch * rows + 8), bg)
    d = ImageDraw.Draw(S)
    for i, (label, im) in enumerate(cells):
        x, y = 8 + (i % cols) * cw, 8 + (i // cols) * ch
        d.text((x, y), label, fill=(235, 235, 240, 255))
        S.alpha_composite(im, (x, y + 16))
    S.save(dst)
    return dst


# ====================================================================== ground: sand, grass, moss
def field(name, lumps=(2, 5), lump_w=1.0, lit=0.4, grain_w=0.6, soft=0.5, power=0.8, aniso=(1.0, 1.0)):
    """Soft lumps lit from the top-left (smooth part only, so no streaks) plus clustered grain; wraps."""
    r = rng_for(name)
    L = light_shift(wave_noise(r, *lumps, power=power, aniso=aniso), lit)
    return even(lump_w * L / (L.std() + 1e-9) + grain_w * grain(r, soft=soft))


def end_sand_index(name="end_sand"):
    """Fine, even, low-contrast grains like vanilla sand, in cool grey."""
    V = field(name, lumps=(3, 7), lump_w=0.35, lit=0.5, grain_w=1.0, soft=0.3)
    return tame(rank_levels(V, [5, 14, 27, 29, 18, 7]), passes=1)


def end_sand():
    block("end_sand", from_index(end_sand_index(), SAND))


def end_stone_index(name):
    """Pale end stone: soft lumps with darker pitted seams (an even spread, so it sits next to vanilla end stone)."""
    V = field(name, lumps=(3, 7), lump_w=1.0, lit=0.5, grain_w=0.55, soft=0.55, power=0.5)
    return tame(rank_levels(V, [6, 12, 22, 28, 22, 10]), passes=1)


def end_grass_index(name):
    """Short, dense purple grass seen from above: fine clumps, darker gaps, a few lit tips; even all over."""
    V = field(name, lumps=(4, 8), lump_w=0.3, lit=0.3, grain_w=1.0, soft=0.25, power=0.3)
    return tame(rank_levels(V, [3, 9, 19, 28, 23, 13, 5]), passes=1)


def end_grass_block():
    block("end_grass_block_top", from_index(end_grass_index("end_grass_block_top"), GRASS))
    # side: end stone under a fringe of grass that hangs 2-4 pixels down in uneven tufts (tiles left-right)
    I = end_stone_index("end_grass_block_side")
    A = from_index(I, END_STONE)
    G = end_grass_index("end_grass_block_side")
    depth = [3, 4, 3, 2, 3, 3, 4, 6, 4, 3, 2, 3, 4, 5, 3, 2]
    for x in range(N):
        d = depth[x]
        for y in range(d):
            g = int(np.clip(G[y, x] + (1 if y == 0 else 0), 3 if y == d - 1 else (1 if y < 2 else 2), len(GRASS) - 1))
            A[y, x] = rgba(GRASS[g])
        # the stone right under the fringe is in the grass's shade
        A[d, x] = rgba(END_STONE[max(0, int(I[d, x]) - 2)])
    block("end_grass_block_side", A)


def end_moss_block():
    """Soft cushions of moss: rounded clumps lit from the top-left, evenly spread (carpets use it too)."""
    V = field("end_moss_block", lumps=(2, 5), lump_w=0.55, lit=0.3, grain_w=1.0, soft=0.55, power=0.6)
    block("end_moss_block", from_index(tame(rank_levels(V, [6, 15, 25, 26, 18, 10]), passes=2), MOSS))


# ====================================================================== masonry (obsidian and meteorite)
# A layout is a 16 x 16 array of cell ids (-1 = joint). Each cell is shaded as a block lit from the top-left: a lit
# top row and left column, a shaded bottom row and right column, a soft noisy face between.
def running_bond(h=4, w=8, offsets=(0, 4), joint=1):
    """Bricks h tall and w wide, every row shifted; joints are 1 pixel on the bottom and right of each brick."""
    L = -np.ones((N, N), int)
    cid = 0
    for r, y0 in enumerate(range(0, N, h)):
        off = offsets[r % len(offsets)]
        for x0 in range(-w, N + w, w):
            for y in range(y0, y0 + h - joint):
                for x in range(x0 + off, x0 + off + w - joint):
                    L[y % N, x % N] = cid + (x0 + off) // w % (N // w)
        cid += N // w
    return L


def masonry(name, layout, ramp_, face=2, top=4, left=3, bottom=1, joint=0, shares=(3, 6, 2), flecks=0.0,
            fleck_tone=4, vary=0):
    """Shade a layout lit from the top-left: a lit top row and left column, a shaded bottom row and right column,
    a softly noisy face between (tones face-1..face+1 in `shares`), dark joints. `flecks`: share of face pixels
    lifted to `fleck_tone` in short streaks (obsidian's glassy flecks)."""
    r = rng_for(name)
    V = even(wave_noise(r, 3, 7, power=0.5) + 0.8 * grain(r, soft=0.4), 0.5)
    F = even(wave_noise(r, 4, 8, power=0.2, aniso=(1.0, 2.2)) + 0.6 * grain(r, soft=0.5), 0.5)
    I = np.full((N, N), joint)
    for c in sorted(set(layout[layout >= 0].ravel())):
        m = layout == c
        dv = int(r.integers(-vary, vary + 1)) if vary else 0
        tone = face - 1 + rank_levels(V, shares, m) + dv
        if flecks:
            tone = np.where(m & (F > np.quantile(F[m], 1 - flecks)), fleck_tone, tone)
        up = m & ~np.roll(m, 1, 0)
        lf = m & ~np.roll(m, 1, 1)
        dn = m & ~np.roll(m, -1, 0)
        rt = m & ~np.roll(m, -1, 1)
        tone = np.where(rt & ~up, bottom + max(0, dv), tone)
        tone = np.where(dn, bottom + max(0, dv), tone)
        tone = np.where(lf & ~dn, left + dv, tone)
        tone = np.where(up & ~rt, top + dv, tone)
        tone = np.where(up & rt, left + dv, tone)
        I = np.where(m, tone, I)
    return np.clip(I, 0, len(ramp_) - 1)


def crack(A, pts, dark, lit=None):
    """A crack along pixel points (wrapping): a dark line, with a lit pixel under its upper-left side if given."""
    cells = {(x % N, y % N) for x, y in pts}
    for x, y in cells:
        A[y, x] = rgba(dark)
    if lit is not None:
        for x, y in cells:
            q = (x, (y + 1) % N)
            if q not in cells and ((x + 1) % N, (y + 1) % N) in cells:
                A[q[1], q[0]] = rgba(lit)


def polished_obsidian():
    """A smooth glassy slab with a bevelled rim (like vanilla's polished stones) and a faint diagonal sheen."""
    r = rng_for("polished_obsidian")
    V = even(wave_noise(r, 1, 3, power=1.5) + 0.25 * grain(r, soft=0.8), 0.3)
    I = 2 + rank_levels(V, [3, 10, 3])                      # soft glassy patches: tones 2-4
    d = XX + YY
    for c, x0, x1, t in ((10, 2, 9, 5), (11, 3, 8, 4), (17, 7, 14, 4), (5, 1, 4, 4)):   # sheen streaks (to the top right)
        I = np.where((d == c) & (XX >= x0) & (XX <= x1), np.maximum(I, t), I)
    I[0, :] = 5
    I[:, 0] = 4
    I[N - 1, :] = 1
    I[:, N - 1] = 2
    I[0, N - 1] = 3
    I[N - 1, 0] = 2
    I[0, 0] = 5
    block("polished_obsidian", from_index(I, OBS))


BRICKS = running_bond(4, 8, (0, 4))
TILE_LAYOUT = running_bond(4, 4, (0,))
OBS_BRICK_CRACKS = ([(1, 1), (2, 2), (3, 2), (4, 3), (4, 4), (5, 5), (6, 5)],
                    [(10, 9), (11, 9), (12, 10), (13, 11), (13, 12)],
                    [(3, 12), (3, 13), (4, 14), (5, 14)],
                    [(12, 2), (13, 2), (14, 3)])
OBS_TILE_CRACKS = ([(1, 1), (2, 2), (2, 3), (3, 4), (4, 5), (4, 6)],
                   [(9, 8), (10, 9), (11, 9), (12, 10), (12, 11), (13, 12)],
                   [(13, 1), (14, 2)],
                   [(5, 12), (6, 13)])


def obsidian_masonry(name, layout, cracks=(), vary=0):
    I = masonry(name, layout, OBS, face=3, top=5, left=4, bottom=2, joint=0, shares=(3, 6, 2), flecks=0.1,
                fleck_tone=4, vary=vary)
    A = from_index(I, OBS)
    for pts in cracks:
        crack(A, pts, OBS[0])
    return A


def obsidian_bricks():
    block("obsidian_bricks", obsidian_masonry("obsidian_bricks", BRICKS))
    block("cracked_obsidian_bricks", obsidian_masonry("obsidian_bricks", BRICKS, OBS_BRICK_CRACKS))


def obsidian_tiles():
    block("obsidian_tiles", obsidian_masonry("obsidian_tiles", TILE_LAYOUT, vary=1))
    B = obsidian_masonry("obsidian_tiles", TILE_LAYOUT, OBS_TILE_CRACKS, vary=1)
    for x, y in ((6, 9), (6, 10), (5, 10)):        # a chipped corner shows the joint behind it
        B[y, x] = rgba(OBS[0])
    block("cracked_obsidian_tiles", B)


def ramp_key(**ramps):
    """{'0': OBS[0], ...} style keys: ramp_key(digits=OBS, cry='abcde') maps each character to its ramp tone."""
    key = {}
    for chars, rmp in ramps.values():
        for ch, c in zip(chars, rmp):
            key[ch] = c
    return key


OBS_KEY = ramp_key(obs=("0123456", OBS), cry=("abcdew", CRY))

# A framed panel with a carved round eye (END_UPDATE.md "Eyes": round iris and pupil, a soft highlight); the iris
# holds a faint crying-obsidian glow. The top is the same frame round a carved ring.
CHISELED_SIDE = """
5555555555555553
5444444444444442
5411111111111132
5412222222222232
5412220000222232
5412004444002232
5410443bb3440232
541043bdcb340232
541043bc0b340232
5410443bb3440232
5412004444003232
5412220000332232
5412222333222232
5433333333333332
5444444444444442
3222222222222221
"""
CHISELED_TOP = """
5555555555555553
5444444444444442
5411111111111132
5412222002222232
5412220330222232
5412203223022232
5412032002302232
54103200dc023032
54103200cb023032
5412032002302232
5412203223022232
5412220330222232
5412222002222232
5433333333333332
5444444444444442
3222222222222221
"""


def chiseled_obsidian():
    block("chiseled_obsidian", grid(CHISELED_SIDE, OBS_KEY, name="chiseled_obsidian"))
    block("chiseled_obsidian_top", grid(CHISELED_TOP, OBS_KEY, name="chiseled_obsidian_top"))


# ====================================================================== meteorite
def line_px(x0, y0, x1, y1):
    """Bresenham pixels from (x0, y0) to (x1, y1), 8-connected."""
    pts = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        pts.append((x0, y0))
        if x0 == x1 and y0 == y1:
            return pts
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def path_mask(paths):
    """Polylines (lists of points, which may run off one edge and on at the other) -> a wrapping 1-pixel mask."""
    m = np.zeros((N, N), bool)
    for pts in paths:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for x, y in line_px(x0, y0, x1, y1):
                m[y % N, x % N] = True
    return m


def neighbours(m):
    return sum(np.roll(np.roll(m, dy, 0), dx, 1).astype(int) for dy, dx in
               ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)))


def crust(name, shares=(8, 18, 26, 26, 16, 6)):
    """Scorched fusion crust: soft dents lit from the top-left in clustered grain (ROCK tones)."""
    V = field(name, lumps=(3, 6), lump_w=1.0, lit=0.5, grain_w=0.7, soft=0.6, power=0.6)
    return tame(rank_levels(V, shares), passes=1)


# The meteorite's seams: a few cracks that wander across the block and meet (they run off one edge and on at the
# opposite one, so the network is continuous when the block repeats).
METEOR_SEAMS = [
    [(5, -1), (5, 2), (3, 4), (-1, 5)],
    [(15, 5), (12, 6), (10, 8), (9, 11), (6, 12), (5, 15)],
    [(9, 11), (11, 13), (13, 14), (14, 16)],
    [(12, 6), (13, 3), (12, 0)],
    [(3, 4), (2, 7)],
]


def meteorite():
    """Scorched crust split by thin seams of End-hot rock: orange-gold where they meet, cooling to rose at their
    ends, with a rose glow on the crust along them. Four frames: the heat pulses along the seams."""
    I = crust("meteorite")
    seam = path_mask(METEOR_SEAMS)
    nb = neighbours(seam)
    tone = np.where(seam & (nb >= 3), 3, np.where(seam & (nb <= 1), 1, 2))
    halo = ~seam & (np.roll(seam, 1, 0) | np.roll(seam, 1, 1))      # the glow spills down-right of a seam
    frames = []
    phase = (XX * 2 + YY * 3) % N / N
    for f in range(4):
        A = from_index(I, ROCK)
        A[halo] = rgba(HEAT[0])
        pulse = np.round(0.5 + 0.5 * np.cos(2 * math.pi * (phase - f / 4))).astype(int)
        H = np.clip(tone + pulse, 0, len(HEAT) - 1)
        A[seam] = np.array([rgba(c) for c in HEAT], np.uint8)[H[seam]]
        frames.append(A)
    animated("textures/block/meteorite.png", frames, frametime=6, order=[0, 1, 2, 3, 2, 1], interpolate=True)


def slabs(spec, power=3.0):
    """Rounded slabs (cx, cy, rx, ry), wrapping: -> (slab id per pixel or -1, local x, local y in -1..1)."""
    ids = -np.ones((N, N), int)
    lx = np.zeros((N, N))
    ly = np.zeros((N, N))
    for i, (cx, cy, rx, ry) in enumerate(spec):
        dx = (XX + 0.5 - cx + N / 2) % N - N / 2
        dy = (YY + 0.5 - cy + N / 2) % N - N / 2
        m = (np.abs(dx / rx) ** power + np.abs(dy / ry) ** power) <= 1.0
        ids = np.where(m, i, ids)
        lx = np.where(m, dx / rx, lx)
        ly = np.where(m, dy / ry, ly)
    return ids, lx, ly


# The core: crust slabs adrift on melt (cx, cy, rx, ry; they wrap), the melt white-hot where it runs widest.
CORE_SLABS = [(3.5, 3.0, 3.0, 2.3), (11.5, 2.5, 2.9, 2.2), (7.5, 8.5, 3.2, 2.4), (15.5, 9.0, 2.9, 2.5),
              (3.0, 13.8, 2.7, 2.1), (11.2, 14.2, 3.0, 2.1)]


def meteorite_core():
    """The heart of a meteorite: rounded plates of crust adrift on melt, each lit on its top-left and glowing rose on
    its lower-right rim; the melt is gold, white-hot where it runs widest. Four frames: the melt pulses."""
    ids, lx, ly = slabs(CORE_SLABS)
    plate = ids >= 0
    I = crust("meteorite_core", shares=(4, 14, 26, 30, 20, 6))
    shade = np.clip(np.round(-(lx + ly) * 1.2), -2, 2).astype(int)     # lit top-left, dark bottom-right
    I = np.clip(I + shade, 0, len(ROCK) - 1)
    melt = ~plate
    # distance (in pixels) from the plates, for the hot middle of wide melt
    far = np.zeros((N, N), int)
    grow = plate.copy()
    for k in range(1, 4):
        ring = ~grow & (neighbours(grow) > 0)
        far = np.where(ring & (far == 0), k, far)
        grow |= ring
    rim = plate & (np.roll(melt, -1, 0) | np.roll(melt, -1, 1)) & (lx + ly > 0)
    frames = []
    phase = (XX * 3 + YY * 2) % N / N
    for f in range(4):
        A = from_index(I, ROCK)
        A[rim] = rgba(HEAT[1])
        pulse = np.round(0.5 + 0.5 * np.cos(2 * math.pi * (phase - f / 4))).astype(int)
        H = np.clip(2 + far + pulse, 0, len(HEAT) - 1)
        A[melt] = np.array([rgba(c) for c in HEAT], np.uint8)[H[melt]]
        frames.append(A)
    animated("textures/block/meteorite_core.png", frames, frametime=5, order=[0, 1, 2, 3, 2, 1], interpolate=True)


# polished meteorite: a cut and polished face shows crossing bands of crystal (as iron meteorites do), here in the
# crust's warm metal tones; the face is smooth and bevelled like the other polished stones.
def bevel(I, lit=(5, 4), dark=(0, 1), corner=6):
    """A polished stone's rim: lit top row and left column, shaded bottom row and right column."""
    I = I.copy()
    I[0, :] = lit[0]
    I[:, 0] = lit[1]
    I[N - 1, :] = dark[0]
    I[:, N - 1] = dark[1]
    I[0, 0] = corner
    I[0, N - 1] = lit[1] - 1
    I[N - 1, 0] = dark[1] + 1
    return I


def polished_meteorite():
    """A smooth slab of crust with a bevelled rim, a faint sheen, and a seam of melt inlaid round its face."""
    r = rng_for("polished_meteorite")
    V = even(wave_noise(r, 1, 3, power=1.5) + 0.3 * grain(r, soft=0.8), 0.3)
    I = 2 + rank_levels(V, [4, 10, 3])                            # smooth face: tones 2-4
    d = XX + YY
    for c, x0, x1 in ((9, 4, 7), (10, 4, 8), (19, 9, 12)):            # sheen (to the top right)
        I = np.where((d == c) & (XX >= x0) & (XX <= x1), np.maximum(I, 4), I)
    I = bevel(I)
    ring = ((XX == 2) | (XX == 13) | (YY == 2) | (YY == 13)) & (XX >= 2) & (XX <= 13) & (YY >= 2) & (YY <= 13)
    I = np.where(((XX == 3) | (YY == 3)) & (XX >= 3) & (XX <= 12) & (YY >= 3) & (YY <= 12), 1, I)   # inlay shade
    I = np.where(((XX == 1) | (YY == 1)) & (XX >= 1) & (XX <= 14) & (YY >= 1) & (YY <= 14), 3, I)
    A = from_index(I, ROCK)
    A[ring] = rgba(HEAT[1])
    corner = ring & ((XX == 2) | (XX == 13)) & ((YY == 2) | (YY == 13))
    A[corner] = rgba(HEAT[2])
    block("polished_meteorite", A)


def meteorite_bricks():
    """Crust bricks in a running bond, the joints between them still molten (rose, gold where they meet)."""
    I = masonry("meteorite_bricks", BRICKS, ROCK, face=3, top=5, left=4, bottom=2, joint=0, shares=(3, 6, 2))
    A = from_index(I, ROCK)
    joint = BRICKS < 0
    horiz = joint & np.roll(joint, 1, 1) & np.roll(joint, -1, 1)
    tee = horiz & (np.roll(joint, 1, 0) | np.roll(joint, -1, 0))
    A[joint] = rgba(HEAT[1])
    A[tee] = rgba(HEAT[2])
    block("meteorite_bricks", A)


# ====================================================================== chorus trees
def fibres(name, ramp_n, shares, groove=0.12, dash=0.08):
    """Bark seen from the side: vertical fibres (each column its own tone, drifting slowly along its length), dark
    grooves between some of them and short pale dashes; wraps both ways. -> palette indices."""
    r = rng_for(name)
    col = blur(np.tile(r.normal(size=N), (N, 1)), 0) * 1.0
    col = 0.6 * col + 0.4 * np.roll(col, 1, 1)
    drift = np.zeros((N, N))
    for x in range(N):
        for k in (1, 2):
            drift[:, x] += r.normal() / k * np.cos(2 * math.pi * k * YY[:, 0] / N + r.random() * 2 * math.pi)
    V = even(col + 0.45 * drift + 0.25 * grain(r, soft=0.3), 0.3)
    I = rank_levels(V, shares)
    g = r.random((N, N)) < groove
    g = g & np.roll(g, 1, 0) | (g & (r.random((N, N)) < 0.3))        # grooves run 2+ pixels long
    I = np.where(g, np.maximum(I - 2, 0), I)
    d = (r.random((N, N)) < dash) & ~g
    d = d | np.roll(d, 1, 0)
    I = np.where(d, np.minimum(I + 1, ramp_n - 1), I)
    return I


def chorus_stem():
    """Side: the trunk's long fibres in chorus mauve with pale streaks between darker grooves (wraps both ways).
    Top: the cut trunk, square rings of pale flesh round a dark pith inside the bark (like a vanilla log top)."""
    block("chorus_stem", from_index(1 + fibres("chorus_stem", 6, [6, 16, 26, 26, 18, 8]), CHORUS))
    block("chorus_stem_top", grid(CHORUS_STEM_TOP, ramp_key(c=("01234567", CHORUS)), name="chorus_stem_top"))


CHORUS_STEM_TOP = """
3443443444344432
4222222222222221
4256666666666521
3265555555555621
4256677777765621
4265766666675521
4256765555765621
3265764334675621
4256764334675521
4256765555765621
4265766666675621
4256677777765521
3265555555555621
4256666666666521
4222222222222221
2111211121112110
"""


ROOT_BUNDLE = [(5.2, 5.0, 4.6), (12.6, 3.6, 3.3), (11.4, 11.4, 4.4), (3.8, 12.6, 3.3)]   # cut roots: cx, cy, r


def chorus_roots():
    """Side: three twisted root strands side by side, each lit on its left and shaded on its right, split by dark
    grooves that wander as the strands twist; wraps both ways. Top: the cut bundle, four roots of different sizes,
    each a dark bark ring round paler rings of wood."""
    F = fibres("chorus_roots", 3, [30, 45, 25])
    bounds = []
    for x0, amp, ph in ((0.0, 1.0, 0.0), (5.3, 1.2, 2.0), (10.6, 0.9, 4.2)):
        bounds.append(x0 + amp * np.sin(2 * math.pi * YY[:, :1] / N + ph))
    bounds = np.concatenate(bounds + [bounds[0] + N], axis=1)          # each row: the strand edges, left to right
    I = np.zeros((N, N), int)
    for y in range(N):
        for x in range(N):
            for k in range(3):
                for wrap in (0, N):
                    a, b = bounds[y, k] - wrap, bounds[y, k + 1] - wrap
                    if a <= x + 0.5 < b:
                        u = (x + 0.5 - a) / (b - a)                     # 0 at the strand's left edge, 1 at its right
                        I[y, x] = 0 if x + 0.5 - a < 1.0 else int(np.clip(5 - 3.6 * u + F[y, x] - 1, 1, 5))
    block("chorus_roots", from_index(I, ROOTS))
    T = np.zeros((N, N), int)
    for cx, cy, rad in ROOT_BUNDLE:
        dx = (XX + 0.5 - cx + N / 2) % N - N / 2
        dy = (YY + 0.5 - cy + N / 2) % N - N / 2
        d = np.hypot(dx, dy)
        inside = d <= rad
        ring = 3 + (np.floor(d) % 2 == 0)                                  # rings of wood
        tone = np.where(d > rad - 1.0, 1, np.where(d < 1.0, 2, ring))     # bark, rings, pith
        tone = np.where(inside & (d > rad - 1.0) & (dx + dy < -rad * 0.6), 3, tone)   # bark lit on the top-left
        tone = np.where(inside & (d <= rad - 1.0) & (d > rad - 2.0) & (dx + dy < 0), tone + 1, tone)
        T = np.where(inside, tone, T)
    block("chorus_roots_top", from_index(T, ROOTS))


# ====================================================================== chorus fruit block
LIGHT = np.array([-1.0, -1.1, 1.3]) / np.linalg.norm([-1.0, -1.1, 1.3])


def lumps(fruits, ss=4):
    """Lobed fruits on a wrapping tile. fruits: [(cx, cy, [(dx, dy, r), ...]), ...]: each lobe a sphere. Supersampled:
    -> (shade 0..1 lit from the top-left, crease 0..1 where lobes meet, coverage 0..1, fruit id) per pixel."""
    n = N * ss
    y, x = (np.mgrid[0:n, 0:n] + 0.5) / ss
    best = np.full((n, n), -1e9)
    second = np.full((n, n), -1e9)
    shade = np.zeros((n, n))
    fid = -np.ones((n, n), int)
    for i, (cx, cy, lobes) in enumerate(fruits):
        for dx0, dy0, rad in lobes:
            dx = (x - cx - dx0 + N / 2) % N - N / 2
            dy = (y - cy - dy0 + N / 2) % N - N / 2
            h2 = rad * rad - dx * dx - dy * dy
            inside = h2 > 0
            h = np.sqrt(np.maximum(h2, 0)) + 0.35 * rad       # bigger lobes sit higher
            nrm = np.stack([dx, dy, np.sqrt(np.maximum(h2, 0))]) / rad
            lam = np.clip(np.tensordot(LIGHT, nrm, 1), 0, 1)
            top = inside & (h > best)
            second = np.where(top, best, np.where(inside & (h > second), h, second))
            shade = np.where(top, lam, shade)
            fid = np.where(top, i, fid)
            best = np.where(top, h, best)
    crease = np.clip(1.0 - (best - second) / 0.9, 0, 1) * (second > -1e8)
    cov = (fid >= 0).astype(float)

    def d(a):
        return a.reshape(N, ss, N, ss).mean((1, 3))
    f = fid.reshape(N, ss, N, ss)[:, ss // 2, :, ss // 2]
    return d(shade * cov), d(crease * cov), d(cov), f


def fruit_paint(name, fruits, ramp_=FRUIT, levels=(0.3, 0.55, 0.78), hi=0.93):
    """Paint lobed fruits: body tones 2-5 by the light, a tone-6 highlight on each lobe's brightest pixels, creases
    where lobes meet (2, deep ones 1), the silhouette's lower-right edge in shade, dark gaps (0) between fruits."""
    sh, cr, cov, fid = lumps(fruits)
    t = sh / np.maximum(cov, 1e-6)
    c = cr / np.maximum(cov, 1e-6)
    I = 2 + np.searchsorted(np.asarray(levels), t)
    I = np.where(t > hi, 6, I)
    I = np.where(c > 0.5, np.minimum(I, 3), I)
    I = np.where(c > 0.8, 2, I)
    solid = cov >= 0.5
    edge = solid & (~np.roll(solid, -1, 0) | ~np.roll(solid, -1, 1))
    I = np.where(edge, np.minimum(I, 2), I)
    I = np.where(solid, I, np.where(np.roll(solid, 1, 0) | np.roll(solid, 1, 1), 0, 1))
    return np.clip(I, 0, len(ramp_) - 1), fid


def crowns(fid, fruits):
    """The top pixel of each fruit's middle column (where its bud sits)."""
    out = []
    for i, (cx, cy, _) in enumerate(fruits):
        x = int(math.floor(cx)) % N
        ys = [y for y in range(N) if fid[y, x] == i]
        near = sorted(ys, key=lambda y: (y - cy + N / 2) % N - N / 2)
        out.append((x, near[0] if near else int(cy)))
    return out


def fruit(cx, cy, s=1.0, turn=0):
    """One chorus fruit: a crumpled cluster of three or four lobes (a different arrangement per `turn`)."""
    shapes = [
        [(-1.3, -1.0, 2.8), (1.6, -0.7, 2.5), (0.1, 1.6, 2.6)],
        [(-1.5, 0.2, 2.7), (1.1, -1.4, 2.6), (1.3, 1.5, 2.4)],
        [(-1.2, -1.4, 2.5), (1.5, -0.6, 2.6), (-1.0, 1.5, 2.4), (1.4, 1.8, 2.1)],
    ]
    return (cx, cy, [(dx * s, dy * s, r_ * s) for dx, dy, r_ in shapes[turn % len(shapes)]])


STAR4 = """
.a.
aba
.a.
"""


def stamp(A, x, y, rows, key):
    lines = [ln.strip() for ln in rows.strip("\n").splitlines()]
    for dy, ln in enumerate(lines):
        for dx, ch in enumerate(ln):
            if ch in key:
                A[(y + dy) % N, (x + dx) % N] = rgba(key[ch])


def chorus_fruit_candidates():
    """Several designs for the chorus fruit block (preview only); chorus_fruit_block() draws the chosen one."""
    out = {}
    for k, turns in enumerate(((0, 1, 2, 1), (2, 0, 1, 0), (1, 2, 0, 2))):
        pile = [fruit(4, 3.8, 1.0, turns[0]), fruit(12, 3.8, 1.0, turns[1]), fruit(0, 11.8, 1.0, turns[2]),
                fruit(8, 11.8, 1.0, turns[3])]
        I, fid = fruit_paint(f"cf_{k}", pile)
        A = from_index(I, FRUIT)
        for x, y in crowns(fid, pile):              # the pale bud on each fruit's crown
            A[y % N, x % N] = rgba(FRUIT[7])
            A[y % N, (x - 1) % N] = rgba(FRUIT[6])
            A[(y + 1) % N, x % N] = rgba(FRUIT[5])
        candidate(f"cf_side_{k}", A, tiles=True)
        top = [fruit(4, 4, 1.0, turns[1]), fruit(12, 4, 1.0, turns[2]), fruit(0, 12, 1.0, turns[3]),
               fruit(8, 12, 1.0, turns[0])]
        I2, _ = fruit_paint(f"cf_t{k}", top)
        T = from_index(I2, FRUIT)
        for cx, cy, _ in top:
            stamp(T, int(cx) - 1, int(cy) - 2, STAR4, {"a": FRUIT[7], "b": FRUIT[5]})
        candidate(f"cf_top_{k}", T, tiles=True)
        out[k] = (A, T)
    return out


def chorus_fruit_block():
    A, T = chorus_fruit_candidates()[0]
    block("chorus_fruit_block", A)
    block("chorus_fruit_block_top", T)


# ====================================================================== plants (cross models; ASCII, '.' = clear)
PLANT_KEY = {**{str(i): c for i, c in enumerate(GRASS)}, "p": "#c39ade", "q": "#e3cdf0",
             **dict(zip("ABCDEF", BLOOM)), **dict(zip("stuvwx", SEED)), **dict(zip("ghijk", LEAF)),
             **dict(zip("abcdef", TWIG))}

# End grass: short violet blades, some ending in a little hooked curl, pale lilac at the tips
END_GRASS = """
................
................
................
................
................
................
.....pp.........
....5..p....56..
....5......5..p.
..6.4..6...4....
..5.4..5..64..5.
..5.3.5..5.3.5..
.6.43.4..4.3.4..
.5.3.34.4.3.43..
.4.3.33.3.3.32..
.3.2.22.2.2.22..
"""

def blades(h, spec):
    """Grass blades on an h x 16 canvas, back to front. spec: (x at the ground, height, lean: pixels sideways per
    pixel up (signed), curl: 0 / +1 / -1 (a hooked tip bending right / left), tone shift). Dark at the base, lighter
    up the blade, pale lilac at a curled tip."""
    A = np.zeros((h, N, 4), np.uint8)
    for x0, height, lean, curl, shift_ in spec:
        pts = []
        x = float(x0)
        for k in range(height):
            pts.append((int(round(x)), h - 1 - k))
            x += lean
        if curl:
            tx, ty = pts[-1]
            pts += [(tx + curl, ty - 1), (tx + 2 * curl, ty), (tx + 2 * curl, ty + 1)]
        for i, (px, py) in enumerate(pts):
            frac = min(i, height - 1) / max(1, height - 1)
            tone = int(np.clip(1 + round(frac * 4.4) + shift_, 0, len(GRASS) - 1))
            col = GRASS[tone]
            if curl and i >= height:
                col = PLANT_KEY["p"] if i < len(pts) - 1 else PLANT_KEY["q"]
            if 0 <= py < h:
                A[py, px % N] = rgba(col)
    return A


# Tall End grass: one 32-pixel-tall clump of blades split into the two halves: dense, leaning blades below, the
# tallest ones curling over at the top with pale lilac tips
TALL_BLADES = [(1, 20, 0.08, 0, 0), (3, 29, 0.0, 1, 0), (5, 17, -0.1, 0, -1), (7, 24, 0.0, 0, 0),
               (9, 28, 0.0, -1, 0), (11, 19, 0.06, 0, 0), (12, 26, 0.05, 1, 0), (14, 22, -0.06, 0, -1),
               (2, 12, 0.25, 0, -1), (6, 13, -0.2, 0, -1), (10, 11, 0.3, 0, -1), (13, 13, -0.25, 0, -1),
               (4, 8, -0.3, 0, -1), (0, 9, 0.2, 0, -1), (8, 9, 0.2, 0, -1), (15, 8, -0.2, 0, -1)]


def end_grass_plants():
    block("end_grass", grid(END_GRASS, PLANT_KEY, name="end_grass"), tiles=False)
    tall = blades(2 * N, TALL_BLADES)
    block("tall_end_grass_top", tall[:N], tiles=False)
    block("tall_end_grass_bottom", tall[N:], tiles=False)


# Dry End bush: bleached, brittle twigs that branch at right angles in knobbly segments like a chorus plant
DRY_END_BUSH = """
................
................
..e.........e...
..d.....e...d...
..dccdd.d..ed...
.....c..d..c....
..e..c..dcc.....
..d..c...c...e..
..dcccc..c..dd..
......c..c.d....
......cccccc....
........c.......
........c.......
.......cc.......
.......c........
.......b........
"""


# ---------------------------------------------------------------------- the End Bloom: a lantern flower
# Closed: a pale, papery, ribbed lantern husk on a slate-teal stem with two curling leaves. Open (only in an
# eclipse): the husk splits into three petals that curl outward round a cluster of glowing violet seeds (the End
# Bulb). Bare: the open husk after the bulb is taken, an empty cup. The glow overlay is the seeds alone.
BLOOM_CLOSED = """
................
................
.......BC.......
......BACD......
.....BACBCD.....
....BACBBCDE....
....BACBBCDE....
....BACBBCDE....
....CBCBCCEF....
.....CDCDEF.....
......DEEF......
.......ji.......
..kkk..ji..kkj..
.j...iiji.ii..i.
.......ji.......
.......hi.......
"""
BLOOM_OPEN = """
................
.AA..........DD.
A..A...CD...E..E
...AB.BCDD.DE...
...AB.BCDD.DE...
...ABwvwvvDDE...
....BvwxvwuDE...
....BvuvwvuDE...
....BCvuuvtDE...
....BCDDDEEF....
.....CDDDEF.....
.......ji.......
..kkk..ji..kkj..
.j...iiji.ii..i.
.......ji.......
.......hi.......
"""
BLOOM_BARE = """
................
.AA..........DD.
A..A...CD...E..E
...AB.BCDD.DE...
...AB.BCDD.DE...
...ABBFFFEDDE...
....BFFEEFFDE...
....BFEEEEFDE...
....BCFFFFEDE...
....BCDDDEEF....
.....CDDDEF.....
.......ji.......
..kkk..ji..kkj..
.j...iiji.ii..i.
.......ji.......
.......hi.......
"""


def end_bloom():
    """The three states, the inventory icon (the open bloom, as vanilla flowers use their block texture) and the
    glow overlay: the seeds only, pulsing over four frames."""
    block("end_bloom_closed", grid(BLOOM_CLOSED, PLANT_KEY, name="end_bloom_closed"), tiles=False)
    opened = grid(BLOOM_OPEN, PLANT_KEY, name="end_bloom_open")
    block("end_bloom_open", opened, tiles=False)
    block("end_bloom_open_bare", grid(BLOOM_BARE, PLANT_KEY, name="end_bloom_open_bare"), tiles=False)
    item("end_bloom", opened)
    lines = [ln.strip() for ln in BLOOM_OPEN.strip("\n").splitlines()]
    seeds = {(x, y): "stuvwx".index(ch) for y, ln in enumerate(lines) for x, ch in enumerate(ln) if ch in "stuvwx"}
    frames = []
    for shift_ in (-1, 0, 1, 1):
        A = np.zeros((N, N, 4), np.uint8)
        for (x, y), k in seeds.items():
            A[y, x] = rgba(SEED[int(np.clip(k + shift_, 0, len(SEED) - 1))])
        frames.append(A)
    frames[3][6, 7] = rgba(SEED[5])                       # a flash in the middle of the cluster at the peak
    animated("textures/block/end_bloom_glow.png", frames, frametime=4, order=[0, 1, 2, 3, 3, 2, 1, 0],
             interpolate=True, tiles=False)


def dry_end_bush():
    block("dry_end_bush", grid(DRY_END_BUSH, PLANT_KEY, name="dry_end_bush"), tiles=False)


# ====================================================================== suspicious End sand
def suspicious_end_sand():
    """End sand with something buried in it: brushing (stages 0-3) sweeps the grains into ever clearer rings round
    the find, and from stage 2 a shard of obsidian shows in the middle, a violet glint on it at stage 3."""
    base = end_sand_index("suspicious_end_sand")
    dx, dy = XX + 0.5 - 8, YY + 0.5 - 8
    d = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    for stage in range(4):
        I = base.copy()
        swept = d < 2.4 + 1.2 * stage                         # brushed smooth: the grain evens out
        I = np.where(swept & (stage > 0), (I + 3) // 2 + 1, I)
        for k, rad in enumerate((3.0, 5.6)):
            if k > stage:
                continue
            reach = 0.2 - 0.35 * (stage - k)                    # the arcs close up as the brushing goes on
            arc = (np.abs(d - rad) < 0.5) & (np.cos(ang * (2 + k) + 0.9 + k) > reach)
            I = np.where(arc, 1 if stage == 0 else 0, I)
            rim = np.roll(arc, 1, 0) & ~arc
            I = np.where(rim, np.minimum(I + 1, len(SAND) - 1), I)
        A = from_index(I, SAND)
        if stage >= 2:
            shard = {(8, 7): OBS[5], (9, 6): OBS[4], (7, 8): OBS[3], (8, 8): OBS[1]}
            if stage == 3:
                shard.update({(6, 9): OBS[2], (7, 9): OBS[1], (10, 5): OBS[4], (9, 7): OBS[1]})
            for (x, y), c in shard.items():
                A[y, x] = rgba(c)
            if stage == 3:
                A[6, 9] = rgba(CRY[4])
        block(f"suspicious_end_sand_{stage}", A, tiles=False)


# ====================================================================== items (16 x 16, outlined, lit from the top-left)
ITEM_KEY = {**dict(zip("ABCDEF", BLOOM)), **dict(zip("stuvwx", SEED)), **dict(zip("ghijk", LEAF)),
            "o": "#2b1d40"}

# End Bulb candidates. The chosen one is END_BULB.
# A: the End Bloom's husk split open into three curling petals round its cluster of glowing seeds (the seeds are
# stamped on the dark cup: SEED_STAMP at BULB_SEEDS)
BULB_SPLIT = """
................
.oo..........oo.
oAAo...oo...oDEo
oABAo.oCDo.oDEo.
.oABoFFEEFFoDEo.
..oABFEEEEFoEo..
..oABFEFFEFDEo..
..oBCFFEEFFDEo..
..oBCDFFFFEDEo..
...oBCDDDDEEo...
...oBCCDDDEEo...
....oBCDDEEo....
.....ooDEoo.....
.......oio......
.......oho......
........o.......
"""
SEED_STAMP = """
.wv.
wxvu
vvut
.ut.
"""
SEED_SMALL = """
wv
vt
"""
BULB_SEEDS = [((8, 3), SEED_STAMP), ((5, 4), SEED_STAMP), ((7, 6), SEED_STAMP), ((10, 6), SEED_SMALL),
              ((4, 7), SEED_SMALL)]


def bulb_split():
    A = grid(BULB_SPLIT, ITEM_KEY, name="end_bulb")
    for (x, y), st in BULB_SEEDS:
        stamp(A, x, y, st, ITEM_KEY)
    return A


# B: the closed husk as a paper lantern, the seeds' glow showing between its ribs
BULB_LANTERN = """
.......oo.......
......oiio......
.......oo.......
......oBCo......
.....oBvCwo.....
....oAvBwCvo....
...oAwBxCwDvo...
...oAvBwCwDvo...
...oAvBwCvDuo...
...oBuCvDvEuo...
....oCuDuEuo....
.....oDtEto.....
......oEFo......
.......oo.......
................
................
"""
# C: a cluster of glowing seeds cupped in a pale calyx of five curling sepals
BULB_CLUSTER = """
................
................
.....oo..oo.....
....owvoowvo....
...oovxwovwuo...
..oAowvuwvuoBo..
.oABowvwvuuoCBo.
.oAoBouvuuoDoCo.
..o.oBCooDDo.o..
....oBCDDDEo....
.....oCDDEo.....
......oDEo......
.......oio......
.......oho......
........o.......
................
"""


WING = ["#2a1d38", "#3d2b50", "#57426b", "#735c86", "#90799f", "#ae99b9", "#cdbdd3"]   # dusty lilac moth scales
MAG = ["#5a0d45", "#94196f", "#cc2c98", "#f04fbd", "#ff8ad6", "#ffd2ee"]               # the Enderfly's eye-spot glow
MEAT = ["#3a1530", "#5c2349", "#823766", "#a65084", "#c472a0", "#dc9cbe"]              # raw gucker flesh
HIDE = ["#1f1a26", "#322a3c", "#473d54", "#5f536c", "#7a6d88"]                         # gucker skin, slate violet
SEAR = ["#2a140f", "#4a2618", "#6e3b22", "#92552e", "#b2733f", "#cc9459", "#e3b77c"]   # cooked
GLAND = ["#3d1238", "#62205a", "#8a347d", "#b0529d", "#cf7dbb", "#e9b0d9", "#fbe3f2"]
SCLERA = ["#6d6279", "#9e93aa", "#cbc3d3", "#ede8f1"]
IRIS = ["#2a0a4a", "#4f1790", "#7f2fd6", "#ad6cf5", "#d8b6ff"]
VOID = ["#0b0916", "#151127", "#211a3b", "#30264f", "#433768", "#5d4f87"]
EGG = ["#06040a", "#0e0915", "#170f22", "#221631", "#2f1f44", "#43305e", "#5b4479"]
IRON = ["#2c2a33", "#47444f", "#66636d", "#8b8790", "#b4afb4", "#dcd6d6"]


def key(**ramps):
    """Grid keys: key(o="#hex", a=("abc", ramp)) -> {char: colour}."""
    out = {}
    for k, v in ramps.items():
        if isinstance(v, tuple):
            out.update(dict(zip(v[0], v[1])))
        else:
            out[k] = v
    return out


ENDERFLY_WING = ("""
................
.........ooooo..
.......oo66655o.
......o6665554o.
.....o665bbb44o.
....o665bdccb4o.
...o6654bdcfb3o.
...o6543bcaab3o.
..o65433bbbb32o.
..o54321333332o.
.o543212333322o.
.o43211222221o..
.o3321o1111oo...
.o221o.ooooo....
.o11o...........
..oo............
""", key(o="#24182f", w=("0123456", WING), m=("abcdef", MAG)))

GUCKER_MEAT = ("""
................
................
.....oooooo.....
...oo445544oo...
..o4554334454o..
.o455433ww3443o.
.o45433wWWw3432o
.o44543ww3w4432o
.o344554334433o.
.oy34443333322o.
.oyxy322222xyxo.
.oxyxxyxxxyxxyo.
..oxyxxyyxxyxo..
...ooxxxxxxoo...
.....oooooo.....
................
""", key(o="#26101f", m=("12345", MEAT[1:]), x=HIDE[1], y=HIDE[3], w="#efe3ea", W="#b98aa6"))

COOKED_GUCKER_MEAT = (GUCKER_MEAT[0], key(o="#1c0d09", m=("12345", SEAR[1:6]), x=SEAR[1], y=SEAR[3], w="#f1e0c4",
                                         W="#a87b52"))

GUCKER_GLAND = ("""
................
..oo............
.o54o...........
.o432o..........
..o32o..........
...o21oooo......
....o235665oo...
...o2356f6654o..
..o235665f5543o.
..o34565554443o.
..o3455f544432o.
..o2344544332o..
...o23343322o...
....oo23322o....
......ooooo.....
................
""", key(o="#2a0b26", g=("0123456", GLAND), f=GLAND[6]))

OBSIDIAN_SHARD = ("""
................
..............o.
............oo6o
..........oo665o
........oo66543o
.......o665443o.
......o6654332o.
.....o66543321o.
....o665432o1o..
...o66543o.oo...
..o6654321o.....
..o5543211o.....
.o54432o1o......
.o4332o.o.......
.o221o..........
..ooo...........
""", key(o="#0b0713", **{"0": OBS[0]}, d=("123456", [OBS[1], OBS[2], OBS[3], OBS[4], OBS[6], "#8d7bb8"])))

MONOLITH_EYE = ("""
................
.....oooooo.....
...oo122221oo...
..o12sSSSSs21o..
.o12SSaabbSSs1o.
.o1SSabccbaSs1o.
o12SabcWdcbaSs1o
o1sSbcdppdcbSs1o
o1sSbcdppdcbss1o
o12sabcddcbass1o
.o1sSabccbassl1o
.o12sSaabbsss21o
..o12sssssss21o.
...oo122221oo...
.....oooooo.....
................
""", key(o="#0a0612", **{"1": OBS[2], "2": OBS[4]}, l=OBS[3], s=SCLERA[1], S=SCLERA[2], a=IRIS[0], b=IRIS[1],
         c=IRIS[2], d=IRIS[3], p="#0b0614", W="#ffffff"))

DRAGON_EGG = """
................
......oooo......
.....o4553o.....
....o45a433o....
...o45654332o...
...o4554332ao...
..o4a54333221o..
..o455433322ao..
..o4543322211o..
..o44a3322211o..
..o3433222a10o..
..o3332221110o..
...o32a21110o...
...oo221110oo...
.....oooooo.....
................
"""
DRAGON_EGG_CRACKS = {
    1: [(7, 1), (7, 2), (8, 3), (7, 4), (8, 5), (9, 6)],
    2: [(7, 1), (7, 2), (8, 3), (7, 4), (8, 5), (9, 6), (10, 7), (9, 8), (10, 9), (6, 5), (5, 6), (5, 7), (4, 8),
        (11, 10)],
}
DRAGON_EGG_GLOW = {1: [(8, 3), (8, 5)], 2: [(8, 3), (8, 5), (9, 6), (5, 6), (10, 9)]}
EGG_KEY = key(o="#030206", **{str(i): EGG[i] for i in range(7)}, a="#5b4580")


# ---------------------------------------------------------------------- the three 3D gear items' flat icons
MEMBRANE = ["#1c0f33", "#2b174d", "#3d2268", "#523084", "#6a42a0", "#8259b8", "#9d7acc", "#bb9fde"]
VEIN = ["#7d45e0", "#a06df5", "#c39bff", "#e3cdff"]
SILVER = ["#25202e", "#3a3346", "#534a62", "#6f667f", "#8e859e", "#aea6bd", "#cfc9da", "#ece9f2"]

OBSIDIAN_SHIELD_ICON = ("""
................
.oooooooooooooo.
.oJIIIIIIIIIIio.
.oI4432c33322io.
.oI432oooo322io.
.oI43oSSSso32io.
.oI3oSWbbSo22io.
.oIcoSbpbSoc1io.
.oI3oSabcSo21io.
.oI32osSSo321io.
.oi332oooo321io.
..oi3322c3321o..
..oii332c321io..
...oii3222iio...
....ooiiiiioo...
......oooo......
""", key(o="#0c0912", I=IRON[3], J=IRON[5], i=IRON[1], **{str(k): OBS[k + 1] for k in range(1, 5)}, c=CRY[3],
         S=SCLERA[2], s=SCLERA[1], a=IRIS[1], b=IRIS[2], p="#0b0614", W="#ffffff"))

# the End Glider from above, drawn as its left half and mirrored: a pair of moth wings each side of a silver keel,
# glowing veins and a round eye-spot on each forewing, the grip bar below
GLIDER_HALF = """
........
.oo.....
o76oo...
o7v65oo.
o6v5sSoK
o65sMSoK
.o6v55oK
..oo5voK
..o76voK
.o6v5o.K
.o65vo.K
..ooo..K
...oHHHH
...ohhhh
....oooo
........
"""
GLIDER_KEY = key(o="#140a24", **{str(k): MEMBRANE[k] for k in range(8)}, v=VEIN[1], s="#9c1f7c", S="#d33da0",
                 M="#ff9fd8", K=SILVER[5], H=SILVER[6], h=SILVER[3])


def glider_icon():
    half = [ln.strip() for ln in GLIDER_HALF.strip("\n").splitlines()]
    rows = "\n".join(ln + ln[::-1] for ln in half)
    A = grid(rows, GLIDER_KEY, name="end_glider_icon")
    A[4:12, 8] = rgba(SILVER[3])                    # the keel's shaded right side
    return A


MONOLITH_WAND_ICON = ("""
..........y.....
.......y..rro.y.
........rroooyr.
......y.rosSSor.
.......rosaWbSor
.......roSbpbSo.
......yroSabcso.
.......rrossso..
......omrrooorr.
.....o3mo..y.r..
....o32o........
...o3w1o........
..omm1o.........
.oc3mo..........
.occo...........
..oo............
""", key(o="#0b0610", r=ROCK[4], y=HEAT[4], m=HEAT[2], c=HEAT[5], S=SCLERA[2], s=SCLERA[1], a=IRIS[1], b=IRIS[2],
         p="#0b0614", W="#ffffff", w="#e2c4ff", **{str(k): VOID[k + 1] for k in range(4)}))


def outline4(A, col):
    """A 1-pixel outline (4-neighbour) round the opaque pixels."""
    m = A[..., 3] > 0
    ring = ~m & (np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1))
    B = A.copy()
    B[ring] = rgba(col)
    return B


def void_rod_item():
    """A rod of starry void, two pixels thick, on the diagonal like vanilla's rods; pale violet ends."""
    A = np.zeros((N, N, 4), np.uint8)
    for t in range(12):
        x, y = 2 + t, 13 - t
        A[y, x] = rgba(VOID[3] if 0 < t < 11 else VOID[5])
        A[y, x + 1] = rgba(VOID[1] if 0 < t < 11 else VOID[4])
        if t in (1, 10):
            A[y, x] = rgba(VOID[4])
    for t, c in ((3, "#e2c4ff"), (6, "#bcdcff"), (8, "#ffffff")):
        A[13 - t, 2 + t] = rgba(c)
    A[13 - 7, 3 + 7] = rgba(VOID[2])
    item("void_rod", outline4(A, "#060410"))


def dragon_egg_items():
    """The Dragon Egg (black, flecked with violet) with one crack, then several, glowing crying-obsidian violet."""
    for stage in (1, 2):
        A = grid(DRAGON_EGG, EGG_KEY, name=f"dragon_egg_cracked_{stage}")
        for x, y in DRAGON_EGG_CRACKS[stage]:
            A[y, x] = rgba(CRY[2])
            if A[y + 1, x + 1, 3] and (x + 1, y + 1) not in DRAGON_EGG_CRACKS[stage] and stage == 2:
                A[y + 1, x + 1] = rgba(EGG[0])
        for x, y in DRAGON_EGG_GLOW[stage]:
            A[y, x] = rgba(CRY[3] if stage == 1 else CRY[4])
        item(f"dragon_egg_cracked_{stage}", A)


def items():
    item("end_bulb", bulb_split())
    candidate("end_bulb_lantern", grid(BULB_LANTERN, ITEM_KEY, name="lantern"))
    candidate("end_bulb_cluster", grid(BULB_CLUSTER, ITEM_KEY, name="cluster"))
    item("enderfly_wing", grid(*ENDERFLY_WING, name="enderfly_wing"))
    item("gucker_meat", grid(*GUCKER_MEAT, name="gucker_meat"))
    item("cooked_gucker_meat", grid(*COOKED_GUCKER_MEAT, name="cooked_gucker_meat"))
    item("gucker_gland", grid(*GUCKER_GLAND, name="gucker_gland"))
    item("obsidian_shard", grid(*OBSIDIAN_SHARD, name="obsidian_shard"))
    item("monolith_eye", grid(*MONOLITH_EYE, name="monolith_eye"))
    void_rod_item()
    dragon_egg_items()
    item("obsidian_shield_icon", grid(*OBSIDIAN_SHIELD_ICON, name="obsidian_shield_icon"))
    item("end_glider_icon", glider_icon())
    item("monolith_wand_icon", grid(*MONOLITH_WAND_ICON, name="monolith_wand_icon"))


# ====================================================================== the Chorus Cocoon (a block model, like cocoa)
# One 16 x 16 texture, laid out like vanilla's cocoa textures (u, v in pixels):
#   [0, 0]-[8, 8]   the mature pod's side (age 3), split by glowing cracks
#   [8, 0]-[16, 8]  the full pod's side (age 2)
#   [0, 8]-[8, 16]  the pod seen from below / above: silk wound round its tip
#   [8, 8]-[14, 14] the young pod's side (age 1; its middle 4 x 4 is the bud, age 0)
#   [14, 8]-[16, 16] the chorus stalk it hangs from
#   [8, 14]-[14, 16] the cap of pale chorus petals at its top
SILK = ["#3e1c40", "#5a2d5a", "#784777", "#946592", "#b088ab", "#cdb0c8", "#e8d6e3"]
COCOON_CRACK = [(3, 0), (3, 1), (2, 2), (3, 3), (4, 4), (4, 5), (3, 6), (5, 3), (6, 2), (2, 5), (1, 6)]


def silk_face(w, h, tilt=4):
    """A cocoon's side: silk wound round it in bands that climb one pixel every `tilt` pixels, each band's top
    thread catching the light and its lower edge in shade; lit from the left, darker to the right and bottom."""
    I = np.zeros((h, w), int)
    for y in range(h):
        for x in range(w):
            band = (y + x // tilt) % 3
            t = 5.0 - 2.4 * x / max(1, w - 1) - 0.6 * y / max(1, h - 1) + (0.9, 0.0, -1.1)[band]
            I[y, x] = int(np.clip(round(t), 1, 6))
    I[:, w - 1] = np.minimum(I[:, w - 1], 2)
    I[h - 1, :] = np.minimum(I[h - 1, :], 2)
    return I


def chorus_cocoon():
    T = np.zeros((N, N), int)
    T[0:8, 0:8] = silk_face(8, 8)
    T[0:8, 8:16] = silk_face(8, 8)
    T[8:14, 8:14] = silk_face(6, 6, 3)
    d = np.hypot(XX[:8, :8] - 3.5, YY[:8, :8] - 3.5)
    ang = np.arctan2(YY[:8, :8] - 3.5, XX[:8, :8] - 3.5)
    spiral = (np.floor(d * 1.2 + ang / math.pi) % 2 == 0)
    T[8:16, 0:8] = np.clip(np.where(spiral, 4, 3) - (d > 3.2) + (d < 1.0) * -2 + (XX[:8, :8] + YY[:8, :8] < 5), 1, 6)
    A = from_index(T, SILK)
    for x, y in COCOON_CRACK:                                   # age 3: cracks glowing crying-obsidian violet
        A[y, x] = rgba(CRY[2])
    for x, y in ((3, 3), (4, 4)):
        A[y, x] = rgba(CRY[4])
    for y in range(8, 16):                                      # the stalk: chorus stem, a node part way down
        A[y, 14] = rgba(CHORUS[4] if y != 11 else CHORUS[6])
        A[y, 15] = rgba(CHORUS[2] if y != 11 else CHORUS[4])
    petals = ["#e3cde6", "#c7a8cc", "#e3cde6", "#e3cde6", "#c7a8cc", "#e3cde6"]
    for i, c in enumerate(petals):                              # the cap: pale petals over their darker bases
        A[14, 8 + i] = rgba(c)
        A[15, 8 + i] = rgba("#9c7aa3" if i % 3 else "#7c5c86")
    block("chorus_cocoon", A, tiles=False)
    for age, els in enumerate(cocoon_ages()):
        JSON[f"models/block/chorus_cocoon_age{age}.json"] = {
            "parent": "minecraft:block/block", "ambientocclusion": False,
            "textures": {"particle": "winterworks:block/chorus_cocoon", "cocoon": "winterworks:block/chorus_cocoon"},
            "elements": els}


def cbox(frm, to, side, up=None, down=None):
    faces = {f: {"uv": list(side), "texture": "#cocoon"} for f in ("north", "south", "east", "west")}
    if up:
        faces["up"] = {"uv": list(up), "texture": "#cocoon"}
    if down:
        faces["down"] = {"uv": list(down), "texture": "#cocoon"}
    return {"from": list(frm), "to": list(to), "faces": faces}


def cocoon_ages():
    """Each age: the pod (side, top and bottom faces), the cap of petals and the stalk up to the block above."""
    stalk = [cbox((7, 14, 7), (9, 16, 9), (14, 8, 16, 10))]
    return [
        [cbox((6, 9, 6), (10, 13, 10), (9, 9, 13, 13), (2, 10, 6, 14), (2, 10, 6, 14)),
         cbox((7, 13, 7), (9, 16, 9), (14, 8, 16, 11))],
        [cbox((5, 7, 5), (11, 13, 11), (8, 8, 14, 14), (1, 9, 7, 15), (1, 9, 7, 15)),
         cbox((6, 13, 6), (10, 14, 10), (9, 14, 13, 15), (2, 10, 6, 14))] + stalk,
        [cbox((4, 5, 4), (12, 13, 12), (8, 0, 16, 8), (0, 8, 8, 16), (0, 8, 8, 16)),
         cbox((5, 4, 5), (11, 5, 11), (9, 7, 15, 8), None, (1, 9, 7, 15)),
         cbox((5, 13, 5), (11, 14, 11), (8, 14, 14, 15), (1, 9, 7, 15))] + stalk,
        [cbox((4, 4, 4), (12, 12, 12), (0, 0, 8, 8), (0, 8, 8, 16), (0, 8, 8, 16)),
         cbox((5, 3, 5), (11, 4, 11), (1, 7, 7, 8), None, (1, 9, 7, 15)),
         cbox((5, 12, 5), (11, 14, 11), (8, 14, 14, 16), (1, 9, 7, 15))] + stalk,
    ]


# ====================================================================== run
def build():
    """Draw every End block and item texture (and the cocoon's block models) into OUT / JSON."""
    end_sand()
    end_grass_block()
    end_moss_block()
    polished_obsidian()
    obsidian_bricks()
    obsidian_tiles()
    chiseled_obsidian()
    meteorite()
    meteorite_core()
    polished_meteorite()
    meteorite_bricks()
    chorus_stem()
    chorus_roots()
    chorus_fruit_block()
    end_grass_plants()
    end_bloom()
    dry_end_bush()
    suspicious_end_sand()
    chorus_cocoon()
    items()


def write_all(assets=ASSETS):
    for rel, im in sorted(OUT.items()):
        dst = assets / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst)
    for rel, body in sorted(JSON.items()):
        dst = assets / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(body, indent=2) + "\n")


def fruit_candidate_sheet():
    """The design candidates for the chorus fruit block and the End Bulb, each labelled."""
    chorus_fruit_candidates()
    others = {}
    pile = [fruit(4, 4, 1.0, 0), fruit(12, 4, 0.95, 1), fruit(0, 12, 1.0, 2), fruit(8, 12, 1.0, 1)]
    I, _ = fruit_paint("cf_a", pile)
    A = from_index(I, FRUIT)
    net = ((XX + YY) % 8 == 1) | ((XX - YY) % 8 == 5)
    A[~net & (np.roll(net, 1, 0) | np.roll(net, 1, 1))] = rgba(FRUIT[1])
    A[net] = rgba(FRUIT[6])
    others["fruit block: heap in a cord net (rejected: busy)"] = A
    r = rng_for("cf_c")
    V = even(light_shift(1 - np.abs(wave_noise(r, 2, 4, power=0.8)), 0.9) + 0.3 * grain(r, soft=0.6), 0.4)
    others["fruit block: one crumpled skin (rejected: noise)"] = from_index(1 + rank_levels(V, [6, 12, 22, 26, 20, 10,
                                                                                              4]), FRUIT)
    D = np.zeros((N, N, 4), np.uint8)
    D[:] = rgba(FRUIT[1])
    for cx, cy in ((4, 4), (12, 4), (0, 12), (8, 12)):
        dd = np.hypot((XX + 0.5 - cx + N / 2) % N - N / 2, (YY + 0.5 - cy + N / 2) % N - N / 2)
        D[dd < 3.9] = rgba(FRUIT[3])
        D[dd < 2.9] = rgba(FRUIT[6])
        stamp(D, cx - 1, cy - 1, STAR4, {"a": FRUIT[3], "b": FRUIT[2]})
    others["fruit block top: cut halves (rejected: buttons)"] = D
    cells = []
    for k in range(3):
        tag = " (CHOSEN)" if k == 0 else ""
        cells.append((f"fruit block side, heap {k}{tag}", tile3(EXTRA[f"cf_side_{k}"])))
        cells.append((f"fruit block top, star ends {k}{tag}", tile3(EXTRA[f"cf_top_{k}"])))
    for label, A in others.items():
        cells.append((label, tile3(to_img(A))))
    for label, A in (("End Bulb: split husk, glowing seeds (CHOSEN)", bulb_split()),
                     ("End Bulb: lit paper lantern", grid(BULB_LANTERN, ITEM_KEY)),
                     ("End Bulb: seed cluster in a calyx", grid(BULB_CLUSTER, ITEM_KEY))):
        cells.append((label, show("item", to_img(A), 12)))
    return cells


def previews(dst):
    dst.mkdir(parents=True, exist_ok=True)
    blocks = sorted(k for k in OUT if "/block/" in k)
    items_ = sorted(k for k in OUT if "/item/" in k)
    print("sheet:", sheet([(k.split("/")[-1], show(k, OUT[k])) for k in blocks], dst / "end_blocks16.png", cols=4))
    print("sheet:", sheet([(k.split("/")[-1], show(k, OUT[k])) for k in items_], dst / "end_items16.png", cols=4))
    print("sheet:", sheet(fruit_candidate_sheet(), dst / "end_fruit_candidates.png", cols=3))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write contact sheets here")
    ap.add_argument("--no-write", action="store_true", help="do not write into the mod assets")
    a = ap.parse_args()
    build()
    if not a.no_write:
        write_all()
    for rel, im in sorted(OUT.items()):
        print(f"{rel:52s} {im.size[0]}x{im.size[1]}")
    if a.preview:
        previews(a.preview)


if __name__ == "__main__":
    main()
