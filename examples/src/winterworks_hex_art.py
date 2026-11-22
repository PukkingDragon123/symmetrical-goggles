#!/usr/bin/env python3
"""Winterworks pixel art for the Hexes & Havoc update (mods/winterworks/docs/HEXES_UPDATE.md).

    python examples/src/winterworks_hex_art.py                  # write all PNGs, .mcmeta and particle jsons
    python examples/src/winterworks_hex_art.py --preview DIR    # also write contact sheets + the screen mock-up

Same rules as winterworks_art.py (whose grid helpers this imports): every sprite is a hand-placed ASCII grid plus a
palette, '.' is transparent, spaces inside rows are ignored (they only help count columns). Hue-shifted ramps
(netherite shadows lean violet, lights warm; gold shadows lean red-brown, lights cream), light from the top-left, dark
hue-shifted outlines (never pure black); only glows (soul fire, the sin sigil, molten gold) are saturated.

Animations are hand-placed too: a sprite's moving part is a second hand-drawn grid, a *timing map*, whose characters
say on which frame each pixel lights (0-9, a-v), so the crawl of a rune, the spread of fire through the HEX rune or
the orbit of a soul is drawn pixel by pixel and only the light/fade is stepped per frame.

GUI sheet textures/gui/hexing_table.png (256x256). The screen is 176x166 like the vanilla enchanting table.
Region map (x, y, w, h on the sheet; "at" = where the screen draws it, relative to leftPos/topPos):

    panel ................ 0,0 176x166         the background, at 0,0 (title at 8,6; "Inventory" label at 8,72;
                                                labels in light colours, e.g. 0xE6C77A gold or 0x9FE8EA soul)
    slots (in the panel)   book slot item at 34,47; Soul Elixir slot item at 56,47 (18x18 frames at 33,46 / 55,46)
                           player inventory items at 8+18c, 84+18r; hotbar at 8+18c, 142 (vanilla)
    soul tank gauge        inside at 10,17 16x48 (the glass, drawn empty in the panel)
      fill strip ......... 176,0 16x80   loops every 32 px: draw (u=176, v=scroll+48-h, 16, h) at (10, 17+48-h),
                                         scroll = (ticks/2) % 32, h = 48*souls/1000
      surface ............ 176,80 16x4   the glowing meniscus, at (10, 17+48-h-1) when 0 < h < 48
      glass overlay ...... 176,84 16x48  drawn over the fill at 10,17 (streaks, gauge marks)
    hex option rows ...... 192,0 is not used; rows are 88x19, at (80, 14+19*i), i = 0..2
      normal ............. 0,166 88x19
      hovered ............ 0,185 88x19
      disabled ........... 0,204 88x19
      locked ............. 0,223 88x19   (chains + padlock; draw no cost icon/text on it)
      cost icons ......... 192,32 + 16*n, 0 16x16 n = 0..2 (1, 2, 3 Soul Elixir), enabled; disabled at 192+16*n, 48;
                           at (row.x+2, row.y+2); glyph text at (row.x+20, row.y+6)
    cursed glyphs ........ 0,243 6x8 cells, 16 glyphs in a row (0,243 .. 95,250); glyph i at (6*i, 243)
    HEX button ........... 32x28 cells at (88+32*c, 166+28*r); drawn at 37,14 (hit box 32x28)
      normal 88,166  hover 120,166  pressed 152,166  disabled 184,166  (216,166: the glow halo, additive)
      ignition frames 0..7: 88,194 120,194 152,194 184,194 216,194 / 88,222 120,222 152,222 (row 2, then 3)
    swirling souls ....... 8 frames 16x16 at (192+16*(i%4), 0+16*(i//4)), i = 0..7 (draw over the fill, clipped)
    ghost icons .......... book 240,32 16x16, Soul Elixir 240,48 16x16 (in empty slots)
    rune glow halo ....... 216,166 32x28

Particles are frame sequences `<name>_<i>.png` plus `particles/<name>.json`; hex_rune_0..5 are six different glyphs (a
glyph that changes as it floats when played with setSpriteFromAge), gold_glint_0..3 a glint's life (frame 0 = birth).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winterworks_art import ASSETS, checker, draw, pal, parse, rgba  # noqa: E402  (no side effects)

OUT: dict[str, Image.Image] = {}      # relative path -> image
JSON: dict[str, dict] = {}            # relative path -> json body
ANIM: dict[str, list] = {}            # relative path -> frames (for the preview strips)


def put(path, im):
    OUT[path] = im


def over(base, top):
    """Overlay grid `top` on grid `base`: every non-'.' character of top replaces the base pixel."""
    b, t = parse(base), parse(top)
    assert len(b) == len(t), (len(b), len(t))
    rows = []
    for rb, rt in zip(b, t):
        assert len(rb) == len(rt), (rb, rt)
        rows.append("".join(ct if ct != "." else cb for cb, ct in zip(rb, rt)))
    return "\n".join(rows)


def swap(grid, **m):
    """Replace characters of a grid (a palette swap done on the grid)."""
    return "\n".join("".join(m.get(c, c) for c in row) for row in parse(grid))


def img(grid, palette, size, name="?"):
    return draw(parse(grid), palette, size, name)


def item(name, palette, grid):
    put(f"textures/item/{name}.png", img(grid, palette, (16, 16), name))


def frames(name, palette, grids, size=8):
    for i, g in enumerate(grids):
        put(f"textures/particle/{name}_{i}.png", img(g, palette, (size, size), f"{name}_{i}"))
    JSON[f"particles/{name}.json"] = {"textures": [f"winterworks:{name}_{i}" for i in range(len(grids))]}


def animated(path, ims, frametime=3, order=None):
    """Frames stacked vertically + <path>.mcmeta (vanilla texture animation)."""
    w, h = ims[0].size
    strip = Image.new("RGBA", (w, h * len(ims)), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        strip.alpha_composite(im, (0, i * h))
    put(path, strip)
    body = {"frametime": frametime}
    if order:
        body["frames"] = order
    JSON[path + ".mcmeta"] = {"animation": body}
    ANIM[path] = [ims[i] for i in (order or range(len(ims)))]


def phase(ch):
    """Timing-map character -> frame number (0-9, a-v = 10-31)."""
    return int(ch, 36)


# ====================================================================== shared ramps (dark -> light)
# Netherite: near-black with a violet cast in the shadows, warm grey in the lights.
NETH = {"0": "#0d0a10", "1": "#17121a", "2": "#211a23", "3": "#2c232d", "4": "#3a2f37", "5": "#4a3e44",
        "6": "#5f5153", "7": "#7a6a66", "8": "#9a8a80"}
# Gold: red-brown shadows, orange body, butter and cream lights.
GOLD = {"a": "#3b1608", "b": "#6a2c0c", "c": "#9c4f12", "d": "#c97e1b", "e": "#e8ad2f", "f": "#fad55a",
        "g": "#fff1a8", "h": "#fffbe6"}
# Soul fire (a glow, so saturated): ink-indigo -> teal -> cyan -> white.
SOUL = {"k": "#0a1230", "n": "#0f2a55", "m": "#11507a", "t": "#0f8199", "u": "#1cb4c4", "v": "#4fe3e0",
        "w": "#b4fff5", "W": "#ffffff"}
# Crimson (the sin book): plum-black shadows, blood red, ember lights.
CRIMSON = {"0": "#1e050c", "1": "#3a0914", "2": "#5c0f1c", "3": "#801726", "4": "#a6222d", "5": "#c93a34",
           "6": "#e8673f", "7": "#ffa56a"}
# Aged vellum pages: violet-brown shade, warm cream light.
PAGE = {"p": "#8d7563", "P": "#c7b08e", "Q": "#e9dcbc", "q": "#5a4640"}


# ====================================================================== cursed glyphs (5x7, the shared alphabet)
# Angular occult marks: hooks, crossed staves, eyes and barbs. Used on the GUI (carvings, the glyph text strip), on
# the hexed books and in the hex_rune particles, so the whole update writes in one script.
GLYPHS = [g.strip("\n") for g in """
..#..|..#..|#.#.#|#.#.#|.###.|..#..|.#.#.
.###.|#...#|#.#.#|#...#|.###.|..#..|..#..
#...#|.#.#.|..#..|.#.#.|#.#.#|..#..|..#..
..#..|.###.|..#..|..#..|#.#.#|.#.#.|..#..
..#..|.###.|..#..|#####|..#..|.#.#.|#...#
.###.|#.#.#|.###.|..#..|.###.|..#..|.#.#.
.##..|#..#.|#....|#..#.|.##.#|....#|...#.
#...#|#...#|#####|#...#|.#.#.|..#..|..#..
..#..|.#.#.|#...#|.#.#.|..#..|..#..|#####
#....|##...|#.#..|#..#.|#.#..|##...|#....
.#.#.|.#.#.|#####|..#..|#####|.#.#.|.#.#.
###..|..#..|..###|..#..|###..|..#..|..#..
..#..|..#..|.#.#.|#.#.#|..#..|.#.#.|.#.#.
#.#.#|#.#.#|.###.|..#..|..#..|.###.|#...#
#..#.|.#..#|..#.#|...##|..#.#|.#..#|#..#.
.#...|###..|.#..#|.#.##|.##.#|.#..#|.#...
""".strip().splitlines()]
GLYPHS = [g.split("|") for g in GLYPHS]          # 16 glyphs, each 7 rows of 5


# ====================================================================== items (16x16)
# --- the elixir flask: a round-bellied glass flask, a soul-gem finial on a gold cap, a gold collar, a gold belly band
# set with a soul gem, and a gold foot (four gold ingots' worth, on purpose). Liquid zones 1-4 (shadow -> lit) are
# filled per elixir; 5/6 are always glass (the neck and the air above the liquid); the glass highlight z/Z is on top.
FLASK = """
.... ...o o... ....
.... ..ow vo.. ....
.... .ogf edo. ....
.... .odc cbo. ....
.... ..oz 6o.. ....
.... ..oz 5o.. ....
.... .ogf edo. ....
.... ozf5 5c6o ....
...o z443 3322 o...
..oz 4433 3322 1o..
..og ffew vdcc bo..
..oz 4433 3221 1o..
...o 3433 2211 o...
.... o332 214o ....
.... .ogf edo. ....
.... .ooo ooo. ....
"""
GLASS = {"5": "#d2e4f03c", "6": "#9ab4c834", "z": "#eef8ff", "Z": "#ffffff"}
FLASK_PAL = pal(GOLD, GLASS, o="#24121c", v=SOUL["v"], w=SOUL["w"])
SHINE = """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .Z.. .... ....
.... .z.. .... ....
.... z... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
item("elixir_bottle", pal(FLASK_PAL, {"4": "#dceaf23c", "3": "#b2c8da34", "2": "#86a0b830", "1": "#5f78903c"}),
     over(over(FLASK, SHINE), """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... z... .... ....
.... .z.. .... ....
.... .... .z.. ....
.... .... .... ....
.... .... .... ....
"""))
# soul elixir: pale soul-blue, a soul wisp rising inside (white head with two dark eyes, a curling cyan tail)
item("soul_elixir", pal(FLASK_PAL, {"1": "#1d5680", "2": "#2f86ad", "3": "#53b4cf", "4": "#8fdbe6",
                                    "W": "#ffffff", "x": "#dcfffa", "y": "#7ff0ec", "q": "#1d5680"}),
     over(over(FLASK, SHINE), """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ..xW Wx.. ....
.... ..qW qx.. ....
.... .... .... ....
.... ..y. .... ....
.... ...y y... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""))
# elixir of greed: molten gold, a bright skin on top and a slow bubble
item("elixir_of_greed", pal(FLASK_PAL, {"1": "#8a3c0c", "2": "#c97316", "3": "#f0ad2a", "4": "#ffda62",
                                        "x": "#fff6c8", "y": "#ffe68c"}), over(over(FLASK, SHINE), """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .xyy y... ....
.... .... ..x. ....
.... .... .... ....
.... .... .x.. ....
.... ..y. .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""))
# cursed elixir: molten gold with a vein of soul blue twisting through it (an S from the shoulder to the foot)
item("cursed_elixir", pal(FLASK_PAL, {"1": "#8a3c0c", "2": "#c97316", "3": "#f0ad2a", "4": "#ffda62",
                                      "t": SOUL["t"], "u": SOUL["u"], "x": SOUL["v"], "y": SOUL["w"]}),
     over(over(FLASK, SHINE), """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ...y xu.. ....
.... ..yx .... ....
.... .... .... ....
.... .... xu.. ....
.... .uxy yt.. ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""))

# --- the hex core: a hexagon of dark netherite rimmed in gold, a window of swirling souls (the 3D item's fallback)
item("hex_core", pal(NETH, GOLD, SOUL, o="#120c12"), """
.... ...o o... ....
.... .oog eoo. ....
...o ogf6 5dco o...
.oog f665 544d coo.
.of6 65kk kk44 3co.
.of6 5knn muk4 3co.
.oe6 5nmt uvm4 3co.
.oe5 4mtw Wnk3 2co.
.oe5 4knW wtm3 2bo.
.oe5 4mvu tmn3 2bo.
.od5 4kut nnk3 2bo.
.od5 43kk kk32 2bo.
.ood c322 211b boo.
...o ocb2 1bao o...
.... .oob aoo. ....
.... ...o o... ....
""")



# --- block item fallbacks (the real ones are 3D)
BRASS = {"A": "#2e1a10", "B": "#553018", "C": "#7f5026", "D": "#a87a3a", "E": "#cfa65a", "F": "#ecd28e"}
# the Elixir Jar: a lantern-sized brass-and-glass jar, a ring on the lid, brass straps, soul elixir glowing inside
item("elixir_jar", pal(BRASS, GLASS, o="#1e1210", **{"1": "#164a6e", "2": "#1f7896", "3": "#33a9bf",
                                                     "4": "#6fd6dc", "w": SOUL["w"]}), """
.... ..oo oo.. ....
.... .oFE EDo. ....
.... .oD. .Bo. ....
.... ooEC CBoo ....
..oo FEED DCCB oo..
.oFE EDDD CCCB BAo.
.oCB BBBB AAAA AAo.
..oD z555 5556 Bo..
..oD z555 5566 Bo..
..oD z4w4 3332 Bo..
..oD z443 3221 Bo..
..oD z333 2211 Bo..
..oD z332 2111 Bo..
.oFE EDDD CCCB BAo.
.oDC CBBB BAAA AAo.
..oo oooo oooo oo..
""")
# the Soul Tank: a netherite cap and base with gold rivets, reinforced glass, souls swirling in a glowing fill
item("soul_tank", pal(NETH, SOUL, z="#eef8ff40", o="#0b080d", e=GOLD["e"], c=GOLD["c"], g=GOLD["g"]), """
.... .... .... ....
.ooo oooo oooo ooo.
.o78 8877 7666 54o.
.o6g 5555 5544 c3o.
.o63 znkk kkkn 42o.
.o63 kznk ukkn 42o.
.o63 kkzu Wvkk 42o.
.o63 mtuv wvtm 42o.
.o63 tuvt uutt 42o.
.o63 uvuu tvWv 42o.
.o63 tuWw uvut 42o.
.o63 mtuu ttum 42o.
.o54 eeee eccc 32o.
.o4g 3333 2222 c1o.
.ooo oooo oooo ooo.
.... .... .... ....
""")
# the Hexing Table: a netherite slab trimmed in gold on crying obsidian, a hexed book floating over it in soul fire
item("hexing_table", pal(NETH, GOLD, SOUL, PAGE, o="#0b080d", x="#170a24", X="#2a1442", y="#4a2378",
                         Y="#9b5cf0"), """
.... ...v .... ....
.... ..uw t... ....
.... oot. utoo ....
...o QPPo oPPp o...
..oQ PPPP PPPp qo..
...o onnn nnno o...
.... .... .... ....
..oo oooo oooo oo..
.oge ffff eeee dco.
.oe8 7777 6666 5bo.
.odc dddc cccb bao.
.oxX XyXx xXXy Xxo.
.oXY yXxx Xxyx xXo.
.oXy xxXx YxXx xxo.
.oxx Xxxx yxxx Xxo.
.ooo oooo oooo ooo.
""")


# ====================================================================== hexed books (16x16 per frame, animated)
# One vanilla-book silhouette for all three: the cover faces us, the spine (with raised bands b) on the left, the page
# block showing down the right edge and along the bottom. Zones: 1-5 cover (shadow -> lit), S/s/b spine, c corner
# fittings, Q/P/p/q pages, o outline.
BOOK = """
.... .... .... ....
..oo oooo oooo o...
.oSc c555 555c Co..
.oSc 4444 4444 CQo.
.ob5 4333 3333 2Po.
.oS5 4333 3333 2Qo.
.oS5 4333 3333 2Po.
.ob5 4333 3333 2Qo.
.oS5 4333 3333 2Po.
.oS5 4333 3333 2Qo.
.ob5 4333 3333 2Po.
.oSc 3222 2222 CQo.
.osC C111 111C CPo.
.oso oooo oooo oPo.
..oq QPQP QPQP Ppo.
...o oooo oooo oo..
"""


def cells(grid):
    """Timing map -> {(x, y): frame} for every non-'.' character."""
    return {(x, y): phase(ch) for y, row in enumerate(parse(grid)) for x, ch in enumerate(row) if ch != "."}


def paint(grid, lit):
    """Put characters into a grid: lit = {(x, y): char}."""
    rows = [list(r) for r in parse(grid)]
    for (x, y), ch in lit.items():
        rows[y][x] = ch
    return "\n".join("".join(r) for r in rows)


# --- lesser hex: deep indigo leather, a ring of soul-blue runes crawling round the cover (the inscription slides one
# pixel per frame, a brighter spark runs round twice as fast) and a hex sigil breathing in the middle.
# The ring path: its 30 cells in order (0-9, a-t); the inscription is a 15-pixel motif written twice round it.
LESSER_PATH = cells("""
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... 0123 4567 ....
.... t... ...8 ....
.... s... ...9 ....
.... r... ...a ....
.... q... ...b ....
.... p... ...c ....
.... o... ...d ....
.... n... ...e ....
.... mlkj ihgf ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""")
LESSER_MOTIF = "##..#.#...##.#."
# the sigil: the six-armed hex star (the HEX rune in small); its digit is the beat (0 = the heart, lit first)
LESSER_SIGIL = cells("""
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .2.1 .2.. ....
.... ..10 1... ....
.... ...0 .... ....
.... ..10 1... ....
.... .2.1 .2.. ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""")
LESSER = pal(PAGE, o="#0b0816", S="#3c3a63", s="#1c1934", b="#5d5b88", c="#8592a8", C="#4c566e",
             **{"1": "#100d1d", "2": "#171429", "3": "#1f1c37", "4": "#2a2848", "5": "#37365a"},
             r="#132a45", R="#1a4a63", t=SOUL["t"], u=SOUL["u"], v=SOUL["v"], w=SOUL["w"], W=SOUL["W"])
LEVEL = "rRtuvwW"                     # rune brightness 0 (carved) .. 6 (white-hot)


def lesser_frame(f, n=15):
    lit = {}
    for (x, y), i in LESSER_PATH.items():
        if LESSER_MOTIF[(i - f) % n] != "#":
            continue
        # two sparks run round the ring (2 px a frame), lighting the runes they pass; the rest stay faintly lit
        d = min((2 * f - i) % 30, (2 * f + 15 - i) % 30)
        lit[(x, y)] = LEVEL[{0: 6, 1: 5, 2: 4, 3: 3, 4: 2}.get(d, 1)]
    breath = [2, 2, 3, 3, 4, 4, 5, 5, 4, 4, 3, 3, 2, 2, 2][f]
    for (x, y), beat in LESSER_SIGIL.items():
        lit[(x, y)] = LEVEL[max(1, breath - beat)]
    return img(paint(BOOK, lit), LESSER, (16, 16), f"hexed_book_lesser#{f}")


animated("textures/item/hexed_book_lesser.png", [lesser_frame(f) for f in range(15)], frametime=3)


# --- sin hex: crimson leather, gold corner fittings and a gold-banded spine, and the sin sigil: a horned eye that
# pulses ember -> gold -> white and blinks once a cycle. Sigil zones: h horns, e eye, i iris, k pupil, f flame tears.
SIN_SIGIL = """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... h... ..h. ....
.... hh.. .hh. ....
.... .hhh hh.. ....
.... .eee ee.. ....
.... eeik ie.. ....
.... .eee ee.. ....
.... .f.. f... ....
.... ..f. .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
SIN_BLINK = """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... h... ..h. ....
.... hh.. .hh. ....
.... .hhh hh.. ....
.... .333 33.. ....
.... eeee ee.. ....
.... .222 22.. ....
.... .f.. f... ....
.... ..f. .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
SIN_CLASP = """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ooo.
.... .... .... gfdo
.... .... .... dcbo
.... .... .... ooo.
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
SIN_BASE = pal(PAGE, GOLD, o="#1c0409", S="#9a2a33", s="#3b0a13", b=GOLD["e"], c=GOLD["f"], C=GOLD["c"],
               **{"1": "#2e0610", "2": "#460a17", "3": "#5e0f1e", "4": "#7a1626", "5": "#962131"},
               k="#1c0409")
SIN_PULSE = [  # (horns, eye white, iris) per frame: ember -> gold -> white-hot and back
    ("#7a2a12", "#8c1b29", "#c93a34"), ("#9c4f12", "#a6222d", "#e8673f"), ("#c97e1b", "#c93a34", "#fad55a"),
    ("#e8ad2f", "#e8673f", "#fff1a8"), ("#fad55a", "#ffa56a", "#ffffff"), ("#fff1a8", "#ffd0a0", "#ffffff"),
    ("#fad55a", "#ffa56a", "#ffffff"), ("#e8ad2f", "#e8673f", "#fff1a8"), ("#c97e1b", "#c93a34", "#fad55a"),
    ("#9c4f12", "#a6222d", "#e8673f"), ("#7a2a12", "#8c1b29", "#c93a34"), ("#7a2a12", "#8c1b29", "#c93a34")]


def sin_frame(f):
    h, e, i = SIN_PULSE[f]
    grid = over(over(BOOK, SIN_CLASP), SIN_BLINK if f in (10,) else SIN_SIGIL)
    p = pal(SIN_BASE, h=h, e=e, i=i, f="#e8673f" if f % 4 < 2 else "#c93a34")
    return img(grid, p, (16, 16), f"hexed_book_sin#{f}")


animated("textures/item/hexed_book_sin.png", [sin_frame(f) for f in range(12)], frametime=3)


# --- hidden hex: a black book you can barely see. Its rim (top/left edges, spine, fittings: zone r) flickers between
# invisible and a cold violet glint, and now and then an unreadable glyph surfaces on the cover and sinks again.
HIDDEN_RIM = """
.... .... .... ....
.... .... .... ....
..rr rrrr rrrr r...
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
..r. .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
HIDDEN = pal(o="#050407", S="#100c16", s="#09070c", b="#100c16", c="#0c0a10", C="#0a080d",
             **{"1": "#09070c", "2": "#0b090f", "3": "#0d0b12", "4": "#100d16", "5": "#13101a"},
             Q="#3a3444", P="#2c2735", p="#201c28", q="#16131c")
RIM = ["#13101a", "#2a2338", "#4a3e60", "#7a6a9a"]                   # rim level 0 (gone) .. 3 (glint)
GLOW_H = ["#13101a", "#2a2240", "#4b3a78", "#8a6ad0"]               # surfacing glyph level
HIDDEN_SEQ = [  # (rim level, glyph index or None, glyph level)
    (1, None, 0), (2, None, 0), (1, None, 0), (0, None, 0), (0, 12, 1), (1, 12, 2), (3, 12, 3), (1, 12, 2),
    (0, None, 0), (0, None, 0), (2, None, 0), (0, 7, 1), (1, 7, 2), (0, 7, 1), (0, None, 0), (1, None, 0)]


def hidden_frame(f):
    rim, g, gl = HIDDEN_SEQ[f]
    lit = {xy: "r" for xy in cells(HIDDEN_RIM)}
    if g is not None:
        for y, row in enumerate(GLYPHS[g]):
            for x, ch in enumerate(row):
                if ch == "#":
                    lit[(5 + x, 4 + y)] = "g"
    p = pal(HIDDEN, r=RIM[rim], g=GLOW_H[gl])
    return img(paint(BOOK, lit), p, (16, 16), f"hexed_book_hidden#{f}")


animated("textures/item/hexed_book_hidden.png", [hidden_frame(f) for f in range(16)], frametime=3)


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


def _on(bg, im):
    base = bg.copy()
    base.alpha_composite(im)
    return base


CHK = ((156, 156, 160, 255), (118, 118, 124, 255))


def contact_sheet(paths, dst, scale=8, cols=4):
    """Each sprite at `scale`x on a checkerboard and on dark, plus 1x and 2x on vanilla grey. Animated textures show
    their first frame here (the strips are in hex_anim.png)."""
    tiles = []
    for rel in paths:
        im = ANIM[rel][0] if rel in ANIM else OUT[rel]
        w, h = im.size
        s = scale
        big = im.resize((w * s, h * s), Image.NEAREST)
        chk = _on(checker(big.size, *CHK, cell=s), big)
        dark = _on(Image.new("RGBA", big.size, (24, 26, 34, 255)), big)
        one = Image.new("RGBA", (w + 4, h + 4), (139, 139, 139, 255))
        one.alpha_composite(im, (2, 2))
        two = one.resize((one.width * 2, one.height * 2), Image.NEAREST)
        cell = Image.new("RGBA", (big.width * 2 + two.width + 20, max(big.height, two.height + one.height + 6)
                                  + 18), (40, 40, 46, 255))
        cell.paste(chk, (0, 18))
        cell.paste(dark, (big.width + 6, 18))
        cell.paste(one, (big.width * 2 + 12, 18))
        cell.paste(two, (big.width * 2 + 12, 18 + one.height + 6))
        ImageDraw.Draw(cell).text((2, 3), rel.split("/")[-1], fill=(235, 235, 235, 255))
        tiles.append(cell)
    cw = max(t.width for t in tiles) + 8
    ch = max(t.height for t in tiles) + 8
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cw * cols + 8, ch * rows + 8), (28, 28, 33, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, (8 + (i % cols) * cw, 8 + (i // cols) * ch))
    sheet.save(dst)
    return dst


def strips(rows_in, dst, scale=8, label_w=190):
    """One row per sequence: every frame left to right at `scale`x over a checkerboard."""
    rows = []
    for label, ims in rows_in:
        tw, th = ims[0].width * scale, ims[0].height * scale
        row = Image.new("RGBA", (label_w + len(ims) * (tw + 6), th + 8), (34, 34, 40, 255))
        ImageDraw.Draw(row).text((4, 4), f"{label} x{len(ims)}", fill=(235, 235, 235, 255))
        for i, im in enumerate(ims):
            big = im.resize((tw, th), Image.NEAREST)
            row.paste(_on(checker((tw, th), *CHK, cell=scale), big), (label_w + i * (tw + 6), 4))
        rows.append(row)
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), (28, 28, 33, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
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


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write contact sheets and the screen mock-up here")
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
        groups = {}
        for rel in OUT:
            g = rel.split("/")[-2]
            if g not in ("particle", "gui"):
                groups.setdefault(g, []).append(rel)
        for g, paths in groups.items():
            print("sheet:", contact_sheet(sorted(paths), p / f"hex_{g}.png"))
        if particle_rows():
            print("sheet:", strips(particle_rows(), p / "hex_particles.png", scale=16, label_w=150))
        if ANIM:
            print("sheet:", strips([(r.split("/")[-1], ims) for r, ims in sorted(ANIM.items())], p / "hex_anim.png"))


if __name__ == "__main__":
    main()
