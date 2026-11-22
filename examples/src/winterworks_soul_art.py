#!/usr/bin/env python3
"""Winterworks 0.4 pixel art for the soul content (mods/winterworks/docs/FIXES_0_4.md): the Wither Bone, the soul bar
HUD and the soul glint. (The cursed books are drawn with the hexed books in winterworks_hex_art.py, which share their
vanilla book form.)

    python examples/src/winterworks_soul_art.py                  # write the PNGs into the mod's assets
    python examples/src/winterworks_soul_art.py --preview DIR    # also write a contact sheet to DIR

Same rules as winterworks_art.py (whose grid helpers this imports): every sprite is a hand-placed ASCII grid plus a
palette, '.' is transparent. Item art follows vanilla's look: light from the top-left, hue-shifted ramps, and no black
outline (the outermost pixels are the darkest tone of their own material, never near-black). The soul glint is drawn
procedurally (it is a tiling texture, not a sprite) and is greyscale-to-blue for additive blending, like vanilla's
enchanted_glint_item.png.

Files and layouts:

    textures/item/wither_bone.png        32 x 32  a charred wither bone, dark charcoal greys, ember flecks in its cracks
    textures/gui/soul_bar.png           182 x 25  the soul bar, drawn where the experience bar is (182 x 5 at the same
                                                  place). Row v = 0: the empty bar (background). Rows v = 5, 10, 15, 20:
                                                  the full bar, flicker frames 0-3 (draw frame (ticks / 3) % 4, cropped to
                                                  the soul fraction: width = 182 * soul / max)
    textures/gui/soul_bar_icon.png        9 x 36  a soul flame to sit left of the bar (at x - 10, y - 2): 4 frames of 9 x 9
                                                  stacked vertically (frame i at v = 9 * i), same flicker timing
    textures/misc/soul_glint_item.png   128 x 128 the cursed items' glint (replaces enchanted_glint_item.png): drifting
                                                  soul wisps over a slow spiral swirl; RGB, black = no glint
    textures/misc/soul_glint_entity.png 128 x 128 the same for worn armour (replaces enchanted_glint_entity.png): fewer,
                                                  larger wisps, a broader swirl
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winterworks_art import ASSETS, draw, pal, parse  # noqa: E402  (no side effects)

OUT: dict[str, Image.Image] = {}


def put(path, im):
    OUT[path] = im


# ====================================================================== the Wither Bone (32 x 32)
# A charred bone lying corner to corner, knobbly ends, wither-skeleton charcoal greys (1 shadowed rim .. 6 lit edge,
# 7 a worn sheen), three cracks across the shaft (0) with embers still glowing in them (e E F G) and a few ember pits.
WITHER_BONE = """
........ ........ ........ ........
........ ........ ........ ........
........ ........ ........ ........
........ ........ .....654 4.......
........ ........ ....6574 32......
........ ........ ....54e3 32......
........ ........ ....5433 2054....
........ ........ .....54e 34432...
........ ........ ....6543 E4332...
........ ........ ...65432 23322...
........ ........ ..607322 23221...
........ ........ .654F221 .221....
........ ........ 6543201. ........
........ .......6 573211.. ........
........ ......65 43211... ........
........ .....604 3211.... ........
........ ....657G 211..... ........
........ ...65432 E1...... ........
........ ..604321 1....... ........
........ .657E211 ........ ........
....655. 6543201. ........ ........
...65445 573221.. ........ ........
...54034 43221... ........ ........
...443e4 3221.... ........ ........
...4332E 222..... ........ ........
....2224 4332.... ........ ........
......54 e322.... ........ ........
......43 3021.... ........ ........
.......2 221..... ........ ........
........ ........ ........ ........
........ ........ ........ ........
........ ........ ........ ........
"""
BONE_PAL = pal({"0": "#121213", "1": "#1d1e1e", "2": "#272828", "3": "#323434", "4": "#3f4242", "5": "#4f5353",
                "6": "#646867", "7": "#858987", "e": "#6a200c", "E": "#c4440f", "F": "#ff8a2a", "G": "#ffd57e"})
put("textures/item/wither_bone.png", draw(parse(WITHER_BONE), BONE_PAL, (32, 32), "wither_bone"))


# ====================================================================== the soul bar HUD
# Soul fire: ink blue -> blue -> cyan -> white (the Soul Bull's soul ramp).
# vanilla soul fire's teal (sampled along the soul_fire / soul_torch gradient for colour only), deep teal -> near white
SOUL = ["#021c1e", "#03383b", "#015a5e", "#018085", "#08a5aa", "#2ccfd2", "#6fe9ea", "#b6fbfc", "#e8ffff"]
BAR_W = 182
NOTCHES = [round(BAR_W * k / 10) for k in range(1, 10)]          # a mark every tenth of the soul


def rgb(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def bar_frame(full, f):
    """One 182 x 5 strip: a 1 px dark frame with clipped corners round a 3 px channel. Empty: dark glass with a faint
    sheen and the tenth marks. Full: soul fire, brightest along the middle row, its tongues (clusters 3-6 px wide)
    shifting with the frame so the bar flickers; the tenth marks show as cooler notches."""
    im = Image.new("RGBA", (BAR_W, 5), (0, 0, 0, 0))
    px = im.load()
    edge = rgb("#0a1024") if not full else rgb("#06112b")
    for x in range(BAR_W):
        for y in (0, 4):
            if 0 < x < BAR_W - 1:
                px[x, y] = edge
    for y in (1, 2, 3):
        px[0, y] = px[BAR_W - 1, y] = edge
    for x in range(1, BAR_W - 1):
        notch = x in NOTCHES
        if not full:
            cols = ["#262d44", "#1a2033", "#20273c"] if not notch else ["#141a2a", "#0f1422", "#141a2a"]
            if x % 9 == 3 and not notch:
                cols[0] = "#323a55"                                # a faint glass sheen on the top row
            for y, c in zip((1, 2, 3), cols):
                px[x, y] = rgb(c)
            continue
        # flame intensity 0..1: two travelling waves and a slower swell, frame-shifted
        u = (0.5 + 0.28 * math.sin(x * 0.42 + f * 1.7) + 0.22 * math.sin(x * 0.17 - f * 1.1 + 1.3)
             + 0.12 * math.sin(x * 0.9 + f * 2.9))
        u = min(1.0, max(0.0, u))
        tones = [3.6 + 4.6 * u ** 1.4, 5.0 + 3.4 * u, 2.6 + 2.6 * u]     # top licks, hot middle, deep base
        for y, tn in zip((1, 2, 3), tones):
            if notch:
                tn -= 2.0
            px[x, y] = rgb(SOUL[int(min(8, max(0, round(tn))))])
    return im


bar = Image.new("RGBA", (BAR_W, 25), (0, 0, 0, 0))
bar.alpha_composite(bar_frame(False, 0), (0, 0))
for f in range(4):
    bar.alpha_composite(bar_frame(True, f), (0, 5 + 5 * f))
put("textures/gui/soul_bar.png", bar)

# a 9 x 9 soul flame to sit left of the bar, four flicker frames (k ink-blue lick, b E c w W blue -> white core)
ICON_FRAMES = ["""
....k....
...kb....
...bEk.k.
..kEckbb.
..bEcEEk.
.kEcwcEb.
.bEwWwcEk
.bEwWWwEb
..kbEEbk.
""", """
...k.....
...bk....
..kEb..k.
..bEbkbb.
.kEcEbEk.
.bEcwcEb.
.bEwWwcEk
.bEwWWwEb
..kbEEbk.
""", """
.....k...
....kb...
....bE.k.
..k.bEkb.
..bkEcEb.
.kEcwcEk.
.bEwWwcEb
.bEwWWwEb
..kbEEbk.
""", """
....k....
.k..bk...
.bk.Eb...
.bbkEbk..
.kEEcEb..
.bEcwcEk.
kEcwWwcEb
.bEwWWwEb
..kbEEbk.
"""]
ICON_PAL = pal(k=SOUL[1], b=SOUL[3], E=SOUL[5], c=SOUL[6], w=SOUL[7], W=SOUL[8])
icon = Image.new("RGBA", (9, 36), (0, 0, 0, 0))
for i, g in enumerate(ICON_FRAMES):
    icon.alpha_composite(draw(parse(g), ICON_PAL, (9, 9), f"soul_bar_icon#{i}"), (0, 9 * i))
put("textures/gui/soul_bar_icon.png", icon)


# ====================================================================== the soul glint (128 x 128, tiling)
G = 128


def wrap(d):
    """Shortest periodic offset on the tile (so every shape tiles seamlessly)."""
    return (d + G / 2) % G - G / 2


def swirl_field(arms=3, twist=3.2, reach=56.0, centres=((64, 64),)):
    """Logarithmic spiral arms round each centre, faded out by `reach` and summed over the neighbouring tiles."""
    yy, xx = np.mgrid[0:G, 0:G] + 0.5
    out = np.zeros((G, G))
    for cx, cy in centres:
        for ox in (-G, 0, G):
            for oy in (-G, 0, G):
                dx, dy = xx - cx - ox, yy - cy - oy
                r = np.hypot(dx, dy)
                th = np.arctan2(dy, dx)
                arm = 0.5 + 0.5 * np.cos(arms * th - twist * np.log1p(r / 4.0))
                out += arm ** 3 * np.exp(-(r / reach) ** 2) * (1 - np.exp(-(r / 6.0) ** 2))
    return out


def wisp_field(n, size, seed):
    """Drifting souls: a soft round head with two dark eyes, a tapering tail that curls behind it, a faint halo.
    Positions and headings are random; every distance wraps, so the field tiles."""
    rng = random.Random(seed)
    yy, xx = np.mgrid[0:G, 0:G] + 0.5
    out = np.zeros((G, G))
    for _ in range(n):
        x0, y0 = rng.uniform(0, G), rng.uniform(0, G)
        a = rng.uniform(0, 2 * math.pi)
        s = size * rng.uniform(0.75, 1.2)
        ux, uy = math.cos(a), math.sin(a)
        px_, py_ = -uy, ux
        curl = rng.choice((-1, 1)) * rng.uniform(0.6, 1.0)
        dx, dy = wrap(xx - x0), wrap(yy - y0)
        # head
        hr = s * 0.4
        d = np.hypot(dx, dy)
        head = np.clip(1.2 - d / hr, 0, 1) ** 0.8
        halo = np.exp(-(d / (s * 0.9)) ** 2) * 0.35
        # tail: sample a curling centre line behind the head
        tail = np.zeros((G, G))
        for k in range(1, 25):
            t = k / 24
            off = curl * s * 0.3 * math.sin(math.pi * t * 1.3)
            cx = -ux * s * 1.25 * t + px_ * off
            cy = -uy * s * 1.25 * t + py_ * off
            w = hr * (1.0 - 0.75 * t) * (1 + 0.15 * math.sin(t * 9 + curl))      # a flickering, flame-like tail
            dd = np.hypot(dx - cx, dy - cy)
            tail = np.maximum(tail, np.clip(1.0 - dd / w, 0, 1) * (1.0 - 0.6 * t))
        body = np.maximum(head, tail * 0.85)
        # a soul's face: two eye holes side by side across the heading, a little forward, and a gaping mouth below
        for ex, ey, rr in ((ux * hr * 0.3 + px_ * hr * 0.36, uy * hr * 0.3 + py_ * hr * 0.36, 0.17),
                           (ux * hr * 0.3 - px_ * hr * 0.36, uy * hr * 0.3 - py_ * hr * 0.36, 0.17),
                           (-ux * hr * 0.25, -uy * hr * 0.25, 0.14)):
            body *= 1 - 0.85 * np.exp(-((dx - ex) ** 2 + (dy - ey) ** 2) / (hr * rr) ** 2)
        out = np.maximum(out, body + halo)
    return out


def soul_colour(v):
    """Intensity 0..1 -> additive colour: black, ink blue, soul blue, cyan, white-blue."""
    v = np.clip(v, 0, 1)
    r = 210 * v ** 2.4
    g = 235 * v ** 1.45
    b = 255 * v ** 0.75
    return np.stack([r, g, b], -1).round().astype(np.uint8)


def glint(base, swirl, souls, n, size, seed, centres):
    v = base + swirl * swirl_field(centres=centres) + souls * wisp_field(n, size, seed)
    return Image.fromarray(soul_colour(v), "RGB")


put("textures/misc/soul_glint_item.png", glint(0.14, 0.5, 0.75, 8, 15.0, 7, ((64, 64), (0, 0))))
put("textures/misc/soul_glint_entity.png", glint(0.03, 0.4, 0.6, 6, 19.0, 5, ((64, 64), (0, 0))))


# ====================================================================== output
def write_all():
    for rel, im in sorted(OUT.items()):
        dst = ASSETS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst)


def contact_sheet(dst, scale=8):
    from PIL import ImageDraw
    tiles = []
    for rel, im in sorted(OUT.items()):
        w, h = im.size
        s = scale if max(w, h) <= 32 else max(1, 256 // max(w, h)) if max(w, h) > 64 else 4
        big = im.resize((w * s, h * s), Image.NEAREST)
        cell = Image.new("RGBA", (max(big.width * 2 + 10, 200), big.height + 22), (40, 40, 46, 255))
        for k, bg in enumerate(((139, 139, 139, 255), (24, 24, 30, 255))):
            b = Image.new("RGBA", big.size, bg)
            b.alpha_composite(big.convert("RGBA"))
            cell.paste(b, (k * (big.width + 6), 18))
        ImageDraw.Draw(cell).text((2, 3), rel.split("/")[-1], fill=(235, 235, 235, 255))
        tiles.append(cell)
    W = max(t.width for t in tiles) + 8
    H = sum(t.height + 8 for t in tiles) + 8
    sheet = Image.new("RGBA", (W, H), (28, 28, 33, 255))
    y = 8
    for t in tiles:
        sheet.paste(t, (8, y))
        y += t.height + 8
    sheet.save(dst)
    return dst


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write a contact sheet here")
    ap.add_argument("--no-write", action="store_true", help="do not write into the mod assets")
    a = ap.parse_args()
    if not a.no_write:
        write_all()
    for rel, im in sorted(OUT.items()):
        print(f"{rel:48s} {im.size[0]}x{im.size[1]}")
    if a.preview:
        a.preview.mkdir(parents=True, exist_ok=True)
        for rel, im in OUT.items():
            im.save(a.preview / rel.split("/")[-1])
        print("sheet:", contact_sheet(a.preview / "soul_art.png"))


if __name__ == "__main__":
    main()
