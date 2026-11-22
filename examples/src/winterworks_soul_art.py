#!/usr/bin/env python3
"""Winterworks 0.4 pixel art for the soul content (mods/winterworks/docs/FIXES_0_4.md): the Wither Bone, the soul bar
HUD and the soul glint. (The cursed books are drawn with the hexed books in winterworks_hex_art.py, which share their
vanilla book form.)

    python examples/src/winterworks_soul_art.py                  # write the PNGs into the mod's assets
    python examples/src/winterworks_soul_art.py --preview DIR    # also write a contact sheet to DIR

Same rules as winterworks_art.py (whose grid helpers this imports): every sprite is a hand-placed ASCII grid plus a
palette, '.' is transparent. Item art follows vanilla's look: light from the top-left, hue-shifted ramps, and no black
outline (the outermost pixels are the darkest tone of their own material, never near-black). The soul glint is drawn
procedurally (it is a tiling texture, not a sprite): black to soul-fire teal to pale cyan, for additive blending like
vanilla's enchanted_glint_item.png.

Files and layouts:

    textures/item/wither_bone.png        32 x 32  a charred wither bone, dark charcoal greys, ember flecks in its cracks
    textures/gui/soul_bar.png           182 x 25  the soul bar, drawn where the experience bar is (182 x 5 at the same
                                                  place). Row v = 0: the empty bar (background). Rows v = 5, 10, 15, 20:
                                                  the full bar, flicker frames 0-3 (draw frame (ticks / 3) % 4, cropped to
                                                  the soul fraction: width = 182 * soul / max)
    textures/gui/soul_bar_icon.png        9 x 36  a soul flame to sit left of the bar (at x - 10, y - 2): 4 frames of 9 x 9
                                                  stacked vertically (frame i at v = 9 * i), same flicker timing
    textures/misc/soul_glint_item.png   128 x 128 the cursed items' glint (replaces enchanted_glint_item.png): three
                                                  souls drifting through soft teal swirls; one tile covers a whole item
                                                  (SoulGlint item scale 64), RGB, black = no glint
    textures/misc/soul_glint_entity.png 128 x 128 the same for worn armour (replaces enchanted_glint_entity.png): three
                                                  souls drawn 1:2 so they look round on a 64 x 32 armour texture at
                                                  SoulGlint entity scale 2 (a tile = 32 x 16 armour px)
"""
from __future__ import annotations

import argparse
import math
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
# Three souls (a round head with two dark dot eyes, a flowing tail curling behind it) drifting through soft teal
# swirls: smoke curls, rising wisps and a faint wash, each soul ringed by a dark moat and a soft halo so it reads.
# Everything is drawn in "design units" on a periodic tile (every distance wraps, the blurs are periodic FFT blurs),
# so the texture tiles seamlessly. client.hex.SoulGlint shows one whole tile per 16 px item (item scale 64 on the
# 1024-wide item atlas), so every cursed item carries all three souls; worn armour (entity scale 2 on its 64 x 32
# texture) sees a tile as 32 x 16 armour pixels, so the entity glint is drawn in armour pixels (a texel is 1/4 px
# wide and 1/8 px tall) and its souls look round on the armour. The colour is vanilla soul fire's teal (sampled
# from soul_fire / soul torch for colour only), additive: the glint pass adds (0.75 * texel)^2, black adds nothing.
G = 128           # texture size
SS = 4            # supersampling of the soul and swirl shapes


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def wrap(d, period):
    """Shortest periodic offset (so every shape tiles seamlessly)."""
    return (d + period / 2) % period - period / 2


def texel_grid(pw, ph, ss=1):
    """Design-space coordinates of every (sub)texel centre of a tile pw x ph design units big."""
    n = G * ss
    j, i = np.mgrid[0:n, 0:n]
    return (i + 0.5) * pw / n, (j + 0.5) * ph / n


def shrink(a, ss):
    n = a.shape[0] // ss
    return a.reshape(n, ss, n, ss).mean(axis=(1, 3))


def blur(a, sx, sy):
    """Gaussian blur (sigma in texels per axis) done with the FFT: periodic, so it tiles too."""
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * math.pi ** 2 * ((fx * sx) ** 2 + (fy * sy) ** 2))))


def soul(X, Y, pw, ph, cx, cy, r, lean, curl, tail, aa):
    """One soul: head centre (cx, cy), head radius r, leaning `lean` rad off upright, the tail swinging to `curl`
    (+1 right, -1 left) over `tail` units. Returns (brightness, coverage)."""
    dx, dy = wrap(X - cx, pw), wrap(Y - cy, ph)
    hx, hy = math.sin(lean), -math.cos(lean)            # heading (up)
    px, py = -hy, hx                                    # its right-hand side
    along = dx * hx + dy * hy
    side = dx * px + dy * py
    head = smooth(r + aa, r - aa, np.hypot(side, along))
    core = np.clip(1 - np.hypot(side + 0.25 * r, along - 0.25 * r) / (1.1 * r), 0, 1)     # lit from the top-left
    body = head * (0.80 + 0.20 * core ** 0.7)
    tail_pts = []
    for k in range(56):                                 # the tail: tapering discs along an S-curve, fading
        t = k / 55
        a_c = -(0.3 * r + tail * t)
        s_c = curl * r * 0.95 * math.sin(math.pi * 1.55 * t) * (0.3 + 0.7 * t)
        tail_pts.append((cx + s_c * px + a_c * hx, cy + s_c * py + a_c * hy, r * 0.93 * (1 - t) ** 1.1 + 0.05 * r,
                         0.80 - 0.5 * t ** 0.8))
    tl = stroke(X, Y, pw, ph, tail_pts, aa)
    body = np.maximum(body, tl)
    for sgn in (-1, 1):                                 # two dark dot eyes, side by side
        de = np.hypot(side - sgn * 0.42 * r, along - 0.06 * r)
        body = body * (1 - 0.96 * smooth(0.27 * r + 0.8 * aa, 0.27 * r - 0.8 * aa, de) * head)
    return body, np.maximum(head, smooth(0.0, 0.25, tl))


def stroke(X, Y, pw, ph, pts, aa):
    """A soft brush stroke: discs (x, y, width, level) stamped along a path, each only over the texels it can touch
    (wrapping round the tile)."""
    out = np.zeros_like(X)
    n = X.shape[0]
    for x, y, w, lv in pts:
        reach = w + aa
        cols = np.arange(math.floor((x - reach) / pw * n) - 1, math.ceil((x + reach) / pw * n) + 2) % n
        rows = np.arange(math.floor((y - reach) / ph * n) - 1, math.ceil((y + reach) / ph * n) + 2) % n
        win = np.ix_(rows, cols)
        d = np.hypot(wrap(X[win] - x, pw), wrap(Y[win] - y, ph))
        out[win] = np.maximum(out[win], smooth(w + aa, w - aa, d) * lv)
    return out


def curl_path(cx, cy, rad, turns, sgn, phase, tail_len, tail_bend, n=160):
    """A smoke curl: a spiral winding out of its eye, then a tail flowing off along its tangent and thinning."""
    pts = []
    for k in range(n):
        t = k / (n - 1)
        th = phase + sgn * turns * 2 * math.pi * t
        rho = rad * (0.12 + 0.88 * t)
        pts.append((cx + rho * math.cos(th), cy + rho * math.sin(th), 0.12 + 0.30 * t, 0.35 + 0.65 * t))
    th = phase + sgn * turns * 2 * math.pi
    x, y = pts[-1][:2]
    ang = math.atan2(math.cos(th) * sgn, -math.sin(th) * sgn)
    for k in range(1, n):
        t = k / (n - 1)
        a = ang + tail_bend * t
        x, y = x + math.cos(a) * tail_len / (n - 1), y + math.sin(a) * tail_len / (n - 1)
        pts.append((x, y, 0.42 * (1 - t) ** 0.8 + 0.04, 1.0 - 0.85 * t))
    return pts


def wisp_path(x0, y0, length, sway, waves, phase, n=200, w=0.26):
    """A rising wisp of soul smoke: a wavy upward stroke that swells in the middle and fades at both ends."""
    pts = []
    for k in range(n):
        t = k / (n - 1)
        env = math.sin(math.pi * t) ** 0.8
        pts.append((x0 + sway * math.sin(2 * math.pi * waves * t + phase), y0 - length * t, w * (0.35 + 0.65 * env),
                    env))
    return pts


# intensity -> colour: black, deep teal, soul-fire teal, cyan, pale cyan (red stays low, so souls stay soul-coloured
# even over white items)
SOUL_RAMP = [(0.00, "#000000"), (0.12, "#001618"), (0.30, "#01454a"), (0.55, "#029a9e"), (0.78, "#38e6ea"),
             (0.92, "#7ef9fb"), (1.00, "#b4ffff")]


def soul_colour(v):
    v = np.clip(v, 0, 1)
    xs = [p for p, _ in SOUL_RAMP]
    chans = [[int(c[1 + 2 * i:3 + 2 * i], 16) for _, c in SOUL_RAMP] for i in range(3)]
    return np.stack([np.interp(v, xs, ch) for ch in chans], -1).round().astype(np.uint8)


def glint(pw, ph, souls, curls, wisps, swirl, wash, halo, aa):
    X, Y = texel_grid(pw, ph, SS)
    body, cover, smoke = np.zeros_like(X), np.zeros_like(X), np.zeros_like(X)
    for s in souls:
        b, c = soul(X, Y, pw, ph, *s, aa)
        body, cover = np.maximum(body, b), np.maximum(cover, c)
    for c in curls:
        smoke = np.maximum(smoke, stroke(X, Y, pw, ph, curl_path(*c), 2 * aa))
    for w in wisps:
        smoke = np.maximum(smoke, stroke(X, Y, pw, ph, wisp_path(*w), 2 * aa))
    body, cover, smoke = shrink(body, SS), shrink(cover, SS), shrink(smoke, SS)
    sx, sy = G / pw, G / ph                             # texels per design unit
    smoke = blur(smoke, 0.12 * sx, 0.12 * sy)
    moat = np.clip(blur(cover, 0.45 * sx, 0.45 * sy) * 2.0, 0, 1)
    glow = blur(cover, 0.6 * sx, 0.6 * sy)
    mist = blur(smoke, 1.6 * sx, 1.6 * sy) + 0.6 * blur(cover, 2.2 * sx, 2.2 * sy)
    v = wash * mist / mist.max() + swirl * smoke * (1 - 0.95 * moat) + halo * glow * (1 - cover)
    return Image.fromarray(soul_colour(np.maximum(v, body)), "RGB")


# the item glint, in item pixels (one 16 x 16 tile per item)
put("textures/misc/soul_glint_item.png", glint(
    16, 16,
    souls=[(3.5, 3.3, 1.65, -0.14, 1, 4.1), (11.6, 6.1, 1.65, 0.14, -1, 4.2), (7.3, 11.9, 1.65, 0.04, 1, 4.0)],
    curls=[(8.7, 3.0, 1.45, 1.25, 1, 0.0, 3.2, 1.2), (14.4, 12.9, 1.3, 1.2, -1, 2.0, 3.0, -1.0),
           (1.9, 10.2, 1.2, 1.2, 1, 3.5, 2.8, 1.0)],
    wisps=[(5.6, 9.6, 6.0, 0.7, 1.0, 0.0), (15.2, 6.0, 7.0, 0.8, 1.2, 2.0), (10.6, 16.6, 5.0, 0.6, 1.0, 1.0)],
    swirl=0.52, wash=0.36, halo=0.30, aa=0.09))
# the armour glint, in armour pixels (one tile = 32 x 16 armour px)
put("textures/misc/soul_glint_entity.png", glint(
    32, 16,
    souls=[(5.5, 3.6, 1.75, -0.10, 1, 4.4), (16.5, 11.4, 1.75, 0.10, -1, 4.4), (26.8, 5.2, 1.75, 0.02, 1, 4.4)],
    curls=[(11.0, 4.2, 1.5, 1.2, 1, 0.5, 3.0, 1.1), (22.0, 13.0, 1.4, 1.2, -1, 2.2, 3.0, -1.0),
           (0.8, 12.6, 1.3, 1.2, 1, 3.4, 2.6, 1.0)],
    wisps=[(9.0, 15.0, 7.0, 0.8, 1.0, 0.0), (21.5, 8.5, 7.0, 0.8, 1.2, 2.0), (30.5, 15.5, 6.0, 0.7, 1.0, 1.0)],
    swirl=0.48, wash=0.30, halo=0.30, aa=0.10))


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
