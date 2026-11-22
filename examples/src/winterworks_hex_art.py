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

GUI sheet textures/gui/hexing_table.png (256x256). The screen is 176x166, like the vanilla enchanting table.
Region map: "sheet" = (u, v, w, h) on the sheet; "at" = where the screen draws it, relative to (leftPos, topPos).

    element              sheet (u, v, w, h)          at / notes
    panel                0, 0, 176, 166              0, 0. Title at 8,6 and "Inventory" at 8,72, drawn in light
                                                     colours (title 0xE6C77A, label 0xB8A58A; the panel is dark)
    book slot            (in the panel)              item at 34,47 (gold-ringed 18x18 frame at 33,46)
    Soul Elixir slot     (in the panel)              item at 56,47 (frame at 55,46); accepts 1-3
    blood slot           (in the panel)              item at 74,20 (gold-ringed frame at 73,19, blood-red corner
                                                     studs, a gold link down to the elixir slot): Potions of Blood
    player inventory     (in the panel)              items at 8+18*col, 84+18*row; hotbar 8+18*col, 142
    soul tank glass      (in the panel, empty)       inside 9,17 16x48 (gold caps 6,13 and 6,65)
    tank fill strip      176, 0, 16, 80              loops every 32 px. Fill h = 48*souls/1000: draw
                                                     (176, scroll + 48 - h, 16, h) at 9, 65 - h,
                                                     scroll = (ticks / 2) % 32 (souls rise)
    tank surface         176, 80, 16, 3              at 9, 64 - h (the glowing meniscus; skip if h = 0 or 48)
    tank glass overlay   176, 84, 16, 48             at 9, 17, over the fill (streaks, glint, gauge marks)
    swirling souls       192 + 16*(i%4), 16*(i//4),  i = 0..7, 16x16; frame (ticks / 3) % 8 at 9, 65 - h +
                         16, 16                      (h - 16) / 2 while h >= 16, clipped to the fill
    hex option rows      73x19 each                  at 95, 14 + 19*i (i = 0..2), inside the panel's well
                                                     (94,13 75x59; until 0.4 the rows were 88 wide at 80)
      normal             0, 166                      cost icon at row + (1, 1); glyph text at row + (20, 6)
      hovered            0, 185                      (soul-blue edge)
      disabled           0, 204
      locked             0, 223                      chains and a padlock: draw no cost icon or text on it
    cost icons           192 + 16*(n-1), 32, 16, 16  n = 1..3 Soul Elixir (lit); unaffordable: same u, v = 48
    ghost icons          240, 32 (book); 240, 48      16x16, in the empty book / elixir / blood slot
                         (Soul Elixir); 240, 64 (blood potion)
    cursed glyphs        6*i, 243, 6, 8              i = 0..15: a 5x7 glyph + its 1px shadow, light soul
                                                     colour (tint it); advance 6 px. Text resolving into
                                                     words swaps glyphs for font letters as you hover
    HEX button           32x28 cells                 at 37, 14 (hit box 32x28)
      normal             96, 166
      hover              128, 166
      pressed            160, 166
      disabled           192, 166                    (no book / not enough souls or elixir)
      glow halo          224, 166                    drawn first, behind the button, while hovered or hexing
      ignition 0..7      96 + 32*(i%5), 194 + 28*(i//5)   i.e. 0-4 on v = 194, 5-7 on v = 222; ~3 ticks a
                                                     frame; frame 7 is the lit end state (hold or fade back)

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
.###.|#.#.#|.###.|..#..|#.#..|.##..|..#..
#.#.#|#.#.#|.###.|..#..|..#..|.###.|#...#
#..#.|.#..#|..#.#|...##|..#.#|.#..#|#..#.
.#...|###..|.#..#|.#.##|.##.#|.#..#|.#...
""".strip().splitlines()]
GLYPHS = [g.split("|") for g in GLYPHS]          # 16 glyphs, each 7 rows of 5


# ====================================================================== items (16x16)
# --- the elixirs: vanilla-style potion bottles (a cork, a see-through neck, round shoulders and belly, pale blue
# glass lit from the left with a white streak inside, no outline) marked as elixirs by gold wire: a collar round the
# cork and a ring wound round the neck. Liquid zones 1-4 (shadow -> lit) are filled per elixir.
FLASK = """
.... .... .... ....
.... .... .... ....
.... ...k kk.. ....
.... ..kk KKq. ....
.... ..gy GGg. ....
.... ...l .m.. ....
.... ...g yG.. ....
.... ..a. ..m. ....
.... .ah3 333m ....
.... ah43 3332 m...
.... ah43 3322 m...
.... l443 32a1 n...
.... l333 22a1 n...
.... .m32 211n ....
.... ..mn nnn. ....
.... .... .... ....
"""
# glass (a lit edge, body, shade, deep shade, the white streak), cork, gold wire
GLASS = {"5": "#d2e4f03c", "6": "#9ab4c834", "z": "#eef8ff", "Z": "#ffffff"}      # the Elixir Jar's glass
BOTTLE = {"a": "#d8ecfa", "l": "#a9cbe8", "m": "#7aa2cc", "n": "#58779f", "h": "#ffffff",
          "k": "#c99a6b", "K": "#9b6a42", "q": "#6a4429",
          "g": "#a8701a", "G": "#e9b636", "y": "#fff0a0"}
FLASK_PAL = pal(BOTTLE)
EMPTY = """
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
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
# the empty elixir bottle: clear glass, a faint blue back wall
item("elixir_bottle", pal(FLASK_PAL, {"4": "#dceaf240", "3": "#b2c8da38", "2": "#86a0b834", "1": "#5f789040"}), FLASK)
# soul elixir: soul-blue, a little soul rising inside (a white head with two dark eyes, a curling cyan tail)
item("soul_elixir", pal(FLASK_PAL, {"1": "#1d4f8a", "2": "#2f7fc0", "3": "#4fb4e6", "4": "#9de4f7",
                                    "W": "#ffffff", "x": "#dcfffa", "e": "#173f6e", "u": "#7ff0ec"}),
     over(FLASK, """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ...x Wx.. ....
.... ...e We.. ....
.... ...x W... ....
.... .... u... ....
.... ...u .... ....
.... .... .... ....
.... .... .... ....
"""))
# elixir of greed: molten gold, a bright skin on top and a slow bubble
item("elixir_of_greed", pal(FLASK_PAL, {"1": "#8a3c0c", "2": "#c97316", "3": "#f0ad2a", "4": "#ffda62",
                                        "x": "#fff6c8", "u": "#ffe68c"}), over(FLASK, """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ..xu uu.. ....
.... .... .... ....
.... .... .x.. ....
.... .... x... ....
.... ..u. .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""))
# cursed elixir: molten gold with a vein of soul blue twisting through it, shoulder to foot
item("cursed_elixir", pal(FLASK_PAL, {"1": "#8a3c0c", "2": "#c97316", "3": "#f0ad2a", "4": "#ffda62",
                                      "t": SOUL["t"], "u": SOUL["u"], "x": SOUL["v"], "Y": SOUL["w"]}),
     over(FLASK, """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... Yx.. ....
.... ...x u... ....
.... ..Yu .... ....
.... ...x u... ....
.... .... xu.. ....
.... ...t u... ....
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
# the Soul Tank: a netherite cap and base with gold rivets, reinforced glass; the souls glow below their meniscus,
# one rising, the empty glass above dark with a glint
item("soul_tank", pal(NETH, SOUL, z="#d8f4ff70", o="#0b080d", O="#1a141c", e=GOLD["e"], c=GOLD["c"],
                      g=GOLD["g"]), """
................
.oooooooooooooo.
.o788877766654o.
.o6g555555443co.
.o6Oooooooooo2o.
.o6Ozknkkkknm2o.
.o6Okzkkkwknm2o.
.o6Okkzkkvkkn2o.
.o6Ovwwvwvwwv2o.
.o6Otuttuttum2o.
.o6OtWuttvttm2o.
.o6Otvwtttumn2o.
.o5Omtvuttmmn1o.
.o4g3333222c1oo.
.oooooooooooooo.
................
""")
# the Hexing Table: a netherite slab trimmed in gold on crying obsidian, a hexed book (the trident burning on its
# cover) floating over it among soul sparks
item("hexing_table", pal(NETH, GOLD, SOUL, PAGE, o="#0b080d", S="#3c3a63", s="#24203f", j="#0e0b1a",
                         **{"4": "#2a2848"}, x="#170a24", X="#2a1442", y="#4a2378", Y="#9b5cf0"), """
....ooooooo...w.
...oSj44444o..v.
.v.oSju4u4uoo...
...oSjv4v4voQo..
...oSj4vWv4oPo..
...oSj44v44oQo..
...osjooooooPo.t
..t.oqQPQPQPpo..
..oooooooooooo..
.o887777766665o.
.ogffffeeeeddco.
.oXxXyxxXxyXxbo.
.oexYyXxxXxxxbo.
.oexXxxxYXxyxbo.
.odccccbbbbbbao.
.oooooooooooooo.
""")


# ====================================================================== mob effect icons (18x18)
# hexed: a heart split by a crack that leaks soul fire, soul flames licking up round it (no heart lost: it is cracked,
# not broken). q is the dark lip of the crack, v/w the soul light inside it.
put("textures/mob_effect/hexed.png", img("""
.... .... .... .... ..
.... .... zz.. .... ..
...z .... vw.. ..z. ..
..zv ...u wv.. .vz. ..
.zvo ooo. uv.o ooov z.
.vo5 665o uvo6 554o v.
uo56 7765 ov66 5443 ou
uo56 7765 qv65 4432 ou
.o56 7665 vq55 4432 o.
.o56 665q wv44 4322 o.
..o5 6554 vq43 332o ..
...o 5554 qv33 22o. ..
.... o544 v332 2o.. ..
.... .o44 qv22 o... ..
.... ..o4 v32o .... ..
.... ...o 32o. .... ..
.... .... oo.. .... ..
.... .... .... .... ..
""", pal(CRIMSON, SOUL, o="#1e050c", q="#12030a", z="#4fe3e070"), (18, 18), "hexed"))

# golden: a piglin's head turned to solid gold: floppy ears, small cream eyes, the broad snout with its deep nostrils,
# cream tusks, a glint at the brow
put("textures/mob_effect/golden.png", img("""
..................
..................
...oooooooooooo...
..oggghWhgffeedo..
.oogfffffffeeedoo.
ofoffffffeeeeedoco
ofofYaffeeeeaYdoco
ogoffffeeeeeddcobo
ofofeghhgfffedcobo
.ooeefeeeeeedccoo.
..oedeaaeeaadcco..
..odddabddbaccbo..
..oYcbaaaaaabcYo..
..oYddddccccbbYo..
...oooooooooooo...
..................
..................
..................
""", pal(GOLD, o="#3b1608", Y="#fff1c8", W="#ffffff"), (18, 18), "golden"))


# ====================================================================== particles (8x8)
# hex_rune: a cursed glyph floating up, soul blue: a white-hot stroke edge, a cyan body, an indigo haze round it.
def rune_particle(g):
    core = {(1 + i, j): ch for j, row in enumerate(GLYPHS[g]) for i, ch in enumerate(row) if ch == "#"}
    rows = [["."] * 8 for _ in range(8)]
    for (x, y) in core:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            X, Y = x + dx, y + dy
            if 0 <= X < 8 and 0 <= Y < 8 and (X, Y) not in core:
                rows[Y][X] = "h"
    for (x, y) in core:
        lit = (x - 1, y) not in core or (x, y - 1) not in core       # strokes catch the light top-left
        rows[y][x] = "w" if lit and (x + y) % 3 == 0 else "v"
    return "\n".join("".join(r) for r in rows)


frames("hex_rune", pal(SOUL, h="#11507a78"), [rune_particle(g) for g in (0, 5, 9, 10, 13, 15)])

# gold_glint: a glint of gold (frame 0 = birth): a spark, a four-ray star, the rays turning, a last speck
frames("gold_glint", pal(GOLD, W="#ffffff", t="#fad55a90", T="#e8ad2f60"), ["""
........
........
...T....
..TgT...
...T....
........
........
........
""", """
...t....
...f....
..efe...
tfgWgft.
..efe...
...f....
...t....
........
""", """
........
.T...T..
..e.e...
...g....
..eWe...
.T...T..
........
........
""", """
........
........
........
...t....
..tet...
...t....
........
........
"""])


# ====================================================================== block particle textures (16x16)
def block(name, palette, grid):
    put(f"textures/block/{name}.png", img(grid, palette, (16, 16), name))


# Elixir Jar: brass straps and rivets over thick glass, soul elixir glowing in the lower half
block("elixir_jar_particle", pal(BRASS, GLASS, o="#1e1210", **{"1": "#164a6e", "2": "#1f7896", "3": "#33a9bf",
                                                              "4": "#6fd6dc"}), """
EEED DDCC CCBB BBBA
DCCB BBBB BBBB AAAA
CBz5 5556 6B5z 5556
CBz5 5566 6B5z 5566
CB55 5666 6B55 5666
CBzA 4433 3B44 3332
CB44 3332 2B43 3221
EEED DDCC CCBB BBBA
CBz4 3332 2B43 3221
CB43 3221 1B33 2211
CB43 3221 1B33 2211
CBz3 3221 1B32 2211
CB32 2211 1B32 2111
CB32 2111 1B21 1111
DCCB BBBB BBBB AAAA
BAAA AAAA AAAA AAAA
""")
# Soul Tank: a netherite frame with gold rivets round reinforced glass full of souls
block("soul_tank_particle", pal(NETH, SOUL, e=GOLD["e"], c=GOLD["c"], z="#d8f4ff"), """
7776 6665 5555 4443
7e55 5554 4444 3c32
65kn nmtt tuun mk32
65nz mtuv wvut nm32
65nm zuvW wvtt mn32
54mt uzvw vuut tm21
54tu vuvu utvW ut21
54tu tuuu vuwv tm21
54mt tvWv uuvt tm21
54tu vwvu tutt mn21
43mt uuut tuut nk21
43nm tuut mttm nk21
43kn mmtm mnnk kk21
43e2 2222 2222 2c10
3322 2222 1111 1110
2111 1111 1111 0000
""")
# Hexing Table: netherite with a gold inlay and a vein of crying obsidian
block("hexing_table_particle", pal(NETH, GOLD, x="#170a24", X="#2a1442", y="#4a2378", Y="#9b5cf0"), """
6665 5554 4555 4443
6ffe eeed dddd dcc3
6e54 4443 3444 3c32
5e4x XyXx xXXy Xc32
5d4X YyXx Xxyx xb32
5d4y xxXx YxXx xb21
5d4x Xxxx yxxx Xb21
5e43 3333 2333 2c21
5edd dddc cccc cbb1
5544 4444 3333 3221
6665 5554 4555 4443
5e44 4443 3444 3c32
5d43 3433 3343 3c21
4d33 3332 2333 2b21
4dcc cccc bbbb bba1
3222 2222 1111 1110
""")


# ====================================================================== hexed books (16x16 per frame, animated)
# One vanilla-book silhouette for all three: the cover faces us, the rounded spine (raised bands b) and the hinge
# groove j on the left, the page block (fore-edge lines) down the right and along the bottom. Zones: 1-5 cover
# (shadow -> lit), S/s/b spine, j hinge, c/C corner fittings (lit/shade), Q/P/p/q pages, o outline.
BOOK = """
.ooo oooo oooo oo..
oSsj cc55 555c Coo.
oSsj c444 4444 CoQo
obsj 5433 3333 2oPo
oSsj 5433 3333 2oQo
oSsj 5433 3333 2oPo
obsj 5433 3333 2oQo
oSsj 5433 3333 2oPo
oSsj 5433 3333 2oQo
obsj 5433 3333 2oPo
oSsj 5433 3333 2oQo
oSsj c322 2222 CoPo
ossj cC11 111C CoQo
.oso oooo oooo ooPo
..oq QPQP QPQP QPpo
...o oooo oooo ooo.
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
.... .012 3456 ....
.... .t.. ...7 ....
.... .s.. ...8 ....
.... .r.. ...9 ....
.... .q.. ...a ....
.... .p.. ...b ....
.... .o.. ...c ....
.... .n.. ...d ....
.... .m.. ...e ....
.... .lkj ihgf ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""")
LESSER_MOTIF = "##..#.#...##.#."
# the sigil: the HEX trident in small (glyph 0); its digit is the beat (0 = the heart, lit first)
LESSER_SIGIL = cells("""
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... 2... ....
.... .... 1... ....
.... ..2. 1.2. ....
.... ..1. 0.1. ....
.... ...1 01.. ....
.... .... 1... ....
.... ...2 .2.. ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""")
LESSER = pal(PAGE, o="#0b0816", S="#3c3a63", s="#24203f", j="#0e0b1a", b="#5d5b88", c="#8592a8", C="#4c566e",
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
.... .h.. ...h ....
.... .hh. ..hh ....
.... ..hh hhh. ....
.... ..ee eee. ....
.... .eei kiee ....
.... ..ee eee. ....
.... ...f .f.. ....
.... .... f... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
SIN_BLINK = """
.... .... .... ....
.... .... .... ....
.... .h.. ...h ....
.... .hh. ..hh ....
.... ..hh hhh. ....
.... ..33 333. ....
.... .eee eeee ....
.... ..22 222. ....
.... ...f .f.. ....
.... .... f... ....
.... .... .... ....
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
.... .... .... .ooo
.... .... .... gfdo
.... .... .... dcbo
.... .... .... .ooo
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
SIN_BASE = pal(PAGE, GOLD, o="#1c0409", S="#9a2a33", s="#5c111d", j="#2a050d", b=GOLD["e"], c=GOLD["f"], C=GOLD["c"],
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
.rrr rrrr rrrr r...
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.r.. .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
HIDDEN = pal(o="#050407", S="#100c16", s="#09070c", j="#060508", b="#100c16", c="#0c0a10", C="#0a080d",
             **{"1": "#09070c", "2": "#0b090f", "3": "#0d0b12", "4": "#100d16", "5": "#13101a"},
             Q="#3a3444", P="#2c2735", p="#201c28", q="#16131c")
RIM = ["#13101a", "#2a2338", "#4a3e60", "#7a6a9a"]                   # rim level 0 (gone) .. 3 (glint)
GLOW_H = ["#13101a", "#2a2240", "#4b3a78", "#8a6ad0"]               # surfacing glyph level
HIDDEN_SEQ = [  # (rim level, glyph index or None, glyph level)
    (1, None, 0), (2, None, 0), (1, None, 0), (0, None, 0), (0, 5, 1), (1, 5, 2), (3, 5, 3), (1, 5, 2),
    (0, None, 0), (0, None, 0), (2, None, 0), (0, 13, 1), (1, 13, 2), (0, 13, 1), (0, None, 0), (1, None, 0)]


def hidden_frame(f):
    rim, g, gl = HIDDEN_SEQ[f]
    lit = {xy: "r" for xy in cells(HIDDEN_RIM)}
    if g is not None:
        for y, row in enumerate(GLYPHS[g]):
            for x, ch in enumerate(row):
                if ch == "#":
                    lit[(6 + x, 3 + y)] = "g"
    p = pal(HIDDEN, r=RIM[rim], g=GLOW_H[gl])
    return img(paint(BOOK, lit), p, (16, 16), f"hexed_book_hidden#{f}")


animated("textures/item/hexed_book_hidden.png", [hidden_frame(f) for f in range(16)], frametime=3)


# ====================================================================== GUI: the Hexing Table screen (256x256)
# Netherite panel (outline, a gold inlay, a dark groove, a bevel), carved glyph inscriptions, a soul tank, a socket for
# the HEX rune button, gold-ringed book and elixir slots, a recessed well for the three hex options and the vanilla
# inventory grid. Every other piece (fill, glass, swirl, rows, button states, ignition, icons, glyphs) sits on the
# same sheet; the region map at the top of this file says where.
G = pal(NETH, GOLD, SOUL, O="#0b080d", q="#15131d", Q="#100e17")
REG: dict[str, tuple] = {}            # region name -> (x, y, w, h) on the sheet


def C(ch, palette=G):
    return rgba(ch if ch.startswith("#") else palette[ch])


def fill(im, x, y, w, h, c):
    im.paste(Image.new("RGBA", (w, h), c if isinstance(c, tuple) else C(c)), (x, y))


def stamp(im, x, y, grid, palette=G, only=None):
    """Draw a grid's non-'.' pixels at (x, y); `only` limits it to pixels whose target is in that set of colours."""
    px = im.load()
    rows = parse(grid)
    assert len({len(r) for r in rows}) == 1, f"ragged grid: {[len(r) for r in rows]}"
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "." or palette.get(ch) is None or not (0 <= x + i < im.width and 0 <= y + j < im.height):
                continue
            if only is not None and px[x + i, y + j] not in only:
                continue
            c = rgba(palette[ch])
            if c[3] == 255:
                px[x + i, y + j] = c
            else:                                   # alpha pixels blend over what is there
                base = Image.new("RGBA", (1, 1), px[x + i, y + j])
                base.alpha_composite(Image.new("RGBA", (1, 1), c))
                px[x + i, y + j] = base.getpixel((0, 0))


def bevel(im, x, y, w, h, light, dark, inner=None, corner=None):
    """1px raised (light top-left) or recessed (pass dark, light) box edge, optional inner fill."""
    if inner:
        fill(im, x + 1, y + 1, w - 2, h - 2, inner)
    fill(im, x, y, w - 1, 1, light)
    fill(im, x, y, 1, h - 1, light)
    fill(im, x + 1, y + h - 1, w - 1, 1, dark)
    fill(im, x + w - 1, y + 1, 1, h - 1, dark)
    if corner:
        fill(im, x + w - 1, y, 1, 1, corner)
        fill(im, x, y + h - 1, 1, 1, corner)


def glyph_text(im, x, y, idx, ink, lip=None):
    """Glyphs (indices into GLYPHS) left to right, 6 px apart; `lip` adds the carved highlight below-right."""
    px = im.load()
    for n, g in enumerate(idx):
        for j, row in enumerate(GLYPHS[g]):
            for i, ch in enumerate(row):
                if ch != "#":
                    continue
                X, Y = x + n * 6 + i, y + j
                if lip:
                    nb = GLYPHS[g][j + 1][i + 1] if j + 1 < 7 and i + 1 < 5 else "."
                    if nb != "#":
                        px[X + 1, Y + 1] = C(lip) if isinstance(lip, str) else lip
                px[X, Y] = C(ink) if isinstance(ink, str) else ink
    # second pass so a glyph's own strokes always cover the lips
    for n, g in enumerate(idx):
        for j, row in enumerate(GLYPHS[g]):
            for i, ch in enumerate(row):
                if ch == "#":
                    px[x + n * 6 + i, y + j] = C(ink) if isinstance(ink, str) else ink


def slot(im, x, y, gold=False):
    """An 18x18 vanilla-sized slot frame at (x, y): recessed netherite; `gold` adds a gold ring round it."""
    bevel(im, x, y, 18, 18, "1", "5", inner="q", corner="3")
    fill(im, x + 1, y + 1, 16, 1, "Q")
    fill(im, x + 1, y + 1, 1, 16, "Q")
    if gold:
        bevel(im, x - 1, y - 1, 20, 20, "e", "c", corner="d")
        for cx, cy in ((x - 1, y - 1), (x + 18, y - 1), (x - 1, y + 18), (x + 18, y + 18)):
            fill(im, cx, cy, 1, 1, "O")


# --- panel corners: a gold bracket with a soul-gem stud, drawn for the top-left; the others are its mirror images
# with the light and dark golds swapped so the light still comes from the top-left
CORNER = """
.OOOO OOOO
OghgO 1111
OhOOg ffe1
OgOkv Oe1.
OOvwO Od1.
O1OOO c1..
O1fe c1...
O1ed 1....
O1d1 .....
O11. .....
"""
DARKEN = {"h": "f", "g": "e", "f": "d", "e": "c", "d": "b", "w": "v", "v": "u"}


def mirror(grid, h=False, v=False, shade=None):
    rows = parse(grid)
    if v:
        rows = rows[::-1]
    if h:
        rows = [r[::-1] for r in rows]
    if shade:
        rows = ["".join(shade.get(c, c) for c in r) for r in rows]
    return "\n".join(rows)


# --- the HEX rune button (32x28): a flat-topped hexagon, a 2px gold rim (lit top-left), a dark groove, a bevelled
# netherite face and the HEX rune. 1-6 face and bevel,
# a-h gold, O outline. The rune map below gives each rune pixel its ignition frame (0 = the heart, 5 = the forks);
# its letters are the glow round the strokes (a = lit with frame 0 ...). The rune is a trident (forked prongs, clawed
# foot) whose stave runs through an open eye as its slit pupil: the fire starts in the pupil.
HEX_BASE = """
.......OOOOOOOOO OOOOOOOOO.......
......Oghfffffff fffffffffO......
......Ofgeeeeeee eeeeeeeefO......
.....Ogf11111111 11111111ddO.....
.....Ohf16666666 55555551ddO.....
....Ogf164444444 444444451ddO....
....Ogf164444444 444444451ddO....
...Ogf1644444444 4444444451ddO...
...Ohf1644444444 4444443351ddO...
..Ogf16444444444 44443333351ddO..
..Ogf16444444444 44433333351ddO..
.Ogf164444444444 433333333351ddO.
.Ohf164444444443 333333333351dcO.
Ogh1644444444333 3333333333351dcO
Oed1544444433333 3333333333321cbO
.Oed154444333333 333333333321cbO.
.Oed154433333333 333333333321cbO.
..Oed15333333333 33333333321cbO..
..Oed15333333333 33333333321cbO..
...Oed1533333333 3333333321cbO...
...Oed1533333333 3333333321cbO...
....Oed153333333 333333321cbO....
....Oed153333333 333333321cbO....
.....Oed15555555 22222221cbO.....
.....Oed11111111 11111111cbO.....
......Ocbbbbbbbb bbbbbbbbcO......
......Occccccccc cccccccbbO......
.......OOOOOOOOO OOOOOOOOO.......
"""
HEX_RUNE = """
................ ................
................ ................
................ ................
................ ................
.........fffffee eefffff.........
.........f5e5fe4 4ef5e5f.........
.........fe4efd4 4dfe4ef.........
..........d4d.c3 3c.d4d..........
..........d3d.c2 2c.d3d..........
..........d3ddb2 2bdd3d..........
..........dd3cb1 1bc3dd..........
...........bb221 122bb...........
.........cbb1ba0 0ab1bbc.........
.........c21bba0 0abb12c.........
.........c21bba0 0abb12c.........
.........cbb1ba0 0ab1bbc.........
...........bb221 122bb...........
............ccb1 1bcc............
..............b2 2b..............
..............c2 2c..............
.............ec3 3ce.............
...........ffe44 44eff...........
...........f55ee ee55f...........
...........ffff. .ffff...........
................ ................
................ ................
................ ................
................ ................
"""

# the HEX flames: soul fire licking up from the forks and hooks on the last ignition frames (x = w, X = W, y = v,
# z = a thin, half-transparent tongue tip)
HEX_FLAMES = ["""
................ ................
................ ................
...........z.... ....z...........
..........zy...z z...yz..........
..........yx...y y...xy..........
...............X X...............
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
""", """
...........z...z z...z...........
..........zy..zy yz..yz..........
..........yxz.yx xy.zxy..........
..........xXy.xX Xx.yXx..........
........z..X...X X...X..z........
.......zy....... .......yz.......
........x....... .......x........
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
""", """
..............z. ...z............
............y... ................
................ y......z........
.........z...... ................
................ .....y..........
..........z..... ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
................ ................
"""]
BRIGHTER = {"b": "c", "c": "d", "d": "e", "e": "f", "f": "g", "g": "h"}
DIMMER = {"c": "b", "d": "c", "e": "d", "f": "e", "g": "f", "h": "g"}
DULL_GOLD = {"a": "#241a1c", "b": "#36292a", "c": "#4b3c38", "d": "#615046", "e": "#776553", "f": "#8c7a64",
             "g": "#a08e76", "h": "#b3a189"}
RUNE_CORE = {(x, y): phase(ch) for y, row in enumerate(parse(HEX_RUNE)) for x, ch in enumerate(row) if ch.isdigit()}
RUNE_HALO = {(x, y): phase(ch) - 10 for y, row in enumerate(parse(HEX_RUNE)) for x, ch in enumerate(row)
             if ch.isalpha()}


def hex_button(core, halo, gold=None, face=None, flames=None, palette=None):
    """core(phase) -> rune char, halo(phase) -> char or None; gold/face: char swaps; flames: overlay grid."""
    base = parse(HEX_BASE)
    rows = [list(swap_row(r, gold, face)) for r in base]
    for (x, y), ph in RUNE_HALO.items():
        h = halo(ph)
        if h and base[y][x] in "34":
            rows[y][x] = h
    for (x, y), ph in RUNE_CORE.items():
        rows[y][x] = core(ph)
    grid = "\n".join("".join(r) for r in rows)
    if flames:
        grid = over(grid, swap(flames, x="w", X="W", y="v", z="Z"))
    return img(grid, palette or HEX_PAL, (32, 28), "hex_button")


def swap_row(row, *maps):
    for m in maps:
        if m:
            row = "".join(m.get(c, c) for c in row)
    return row


HEX_PAL = pal(G, P="#173845", K="#262b3b", N="#1b3a4f", M="#12557a", Z="#4fe3e088")
REG["hex_normal"] = (96, 166, 32, 28)
REG["hex_hover"] = (128, 166, 32, 28)
REG["hex_pressed"] = (160, 166, 32, 28)
REG["hex_disabled"] = (192, 166, 32, 28)
REG["hex_halo"] = (224, 166, 32, 28)
for i in range(8):
    REG[f"hex_ignite_{i}"] = (96 + 32 * (i % 5), 194 + 28 * (i // 5), 32, 28)

BUTTONS = {
    "hex_normal": hex_button(lambda p: "u" if p == 0 else "t", lambda p: None),
    "hex_hover": hex_button(lambda p: "w" if p == 0 else "v" if p < 2 else "u", lambda p: "N" if p < 2 else "K",
                            gold=BRIGHTER),
    "hex_pressed": hex_button(lambda p: "W" if p == 0 else "w" if p < 2 else "v", lambda p: "M" if p < 3 else "N",
                              gold=DIMMER, face={"6": "2", "5": "2", "2": "5", "4": "3", "3": "2"}),
    "hex_disabled": hex_button(lambda p: "P", lambda p: None, face={"4": "3", "3": "2", "6": "4", "5": "3"},
                               palette=pal(HEX_PAL, DULL_GOLD, P="#1a1419")),
}


def ignite(f):
    if f <= 4:      # the fire runs out from the heart along the staves and arms, a white-hot front ahead of it
        def core(p):
            return "t" if p > f else "W" if p == f else "w" if p == f - 1 else "v"
        return hex_button(core, lambda p: None if p > f else "M" if p >= f - 1 else "N",
                          gold=BRIGHTER if f >= 3 else None)
    if f == 5:      # the forks catch: the whole rune flashes, flames start
        return hex_button(lambda p: "W" if p >= 4 else "w", lambda p: "M", gold={**BRIGHTER, "b": "d", "c": "e"},
                          flames=HEX_FLAMES[0])
    if f == 6:      # full blaze, the face itself lit blue
        return hex_button(lambda p: "W", lambda p: "M", gold={**BRIGHTER, "b": "d", "c": "e", "d": "f", "e": "g"},
                          face={"4": "N", "3": "K"}, flames=HEX_FLAMES[1])
    return hex_button(lambda p: "W" if p == 0 else "w" if p < 3 else "v", lambda p: "N" if p < 3 else "K",
                      gold=BRIGHTER, flames=HEX_FLAMES[2])   # settles: the rune holds its glow, embers drift up


for i in range(8):
    BUTTONS[f"hex_ignite_{i}"] = ignite(i)


def halo_cell():
    """Soft soul glow just outside the button's hexagon (drawn behind it while hovered or hexing)."""
    mask = {(x, y) for y, row in enumerate(parse(HEX_BASE)) for x, ch in enumerate(row) if ch != "."}
    im = Image.new("RGBA", (32, 28), (0, 0, 0, 0))
    for y in range(28):
        for x in range(32):
            if (x, y) in mask:
                continue
            d = min(max(abs(x - mx), abs(y - my)) for mx, my in mask)
            if d <= 3:
                im.putpixel((x, y), rgba(["", "#4fe3e0a0", "#1cb4c460", "#11507a38"][d]))
    return im


BUTTONS["hex_halo"] = halo_cell()


# --- the soul tank: fill tile (16x32, tiles vertically: souls rising through glowing soul-stuff), its meniscus, and
# the glass that goes over it (streaks, a glint, gold gauge marks at 1/4, 1/2 and 3/4)
TANK_TILE = """
nmmt tttt tttt tmmn
nmmt tttt tttt tmmn
nmmt twWt tttt tmmn
nmmt tvwt tttt umnn
nmmt tuvt tttt tmmn
nmmt utvt tttt tmmn
nmmt utut tttt tmmn
nmmt tutt tttt tmmn
nmmt tttt tuut tmmn
nmut tttt tttt tmmn
nmmt tttt tttt tmmn
nmmt tttt tttt tmmn
nmmt tttt ttwW tmmn
nmmt tttt ttvw tmmn
nmmt tttt ttvu tmmn
nmmt tttt ttvt umnn
nmmt tttt tutt tmmn
nmmt tttt tutt tmmn
nmmt tttt ttut tmmn
nmmt ttut tttt tmmn
nmtu tttt tttt tmmn
nmmt tttt tttt tmmn
nmmt twWt tttt tmmn
nmmt tvwt tttt tmmn
nmmt tvut tttt tmmn
nmmt utvt tttt tmmn
nmmt uttu tttt tumn
nmmt tttu tttt tmmn
nmmt tttt uttt tmmn
nmmt tttt tttt tmmn
nmmt tttt tttu tmmn
nmmt tttt tttt tmmn
"""
TANK_SURFACE = """
Zwww wWww wwwW wwwZ
uvvv vvvv vvvv vvvu
.uuu uuuu uuuu uuu.
"""
TANK_GLASS = """
.... .... .... ....
.... .... .... ....
.xX. .... .... ....
.xX. .... .... ....
.xx. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... .Odd
.x.. .... .... ..Oc
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... Odde
.x.. .... .... .Odc
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... .Odd
.x.. .... .... ..Oc
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.x.. .... .... ....
.xx. .... .... ....
..xX .... .... ....
...x x... .... ....
.... .... .... ....
.... .... .... ....
"""
GLASS_PAL = pal(G, x="#d8f4ff30", X="#f2fdff70", Z="#ffffffd0")

# --- swirling souls (16x16, 8 frames): two souls chase each other round an orbit, two cells a frame, each a white
# head with a cyan tail fading behind it, while a spark circles the eye the other way. The orbits are timing maps
# (their cells in order: 0-9, a-v).
ORBIT = cells("""
.... .... .... ....
.... .... .... ....
.... ..uv 01.. ....
.... st.. ..23 ....
...r .... .... 4...
..q. .... .... .5..
..p. .... .... .6..
..o. .... .... .7..
..n. .... .... .8..
..m. .... .... .9..
..l. .... .... .a..
...k .... .... b...
.... ji.. ..dc ....
.... ..hg fe.. ....
.... .... .... ....
.... .... .... ....
""")
EYE = cells("""
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ...0 7... ....
.... .... .... ....
.... .1.. ..6. ....
.... .2.. ..5. ....
.... .... .... ....
.... ...3 4... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""")
ORBIT_AT = {i: xy for xy, i in ORBIT.items()}
EYE_AT = {i: xy for xy, i in EYE.items()}
SWIRL_PAL = pal(SOUL, a="#4fe3e0c0", b="#1cb4c490", c="#0f819960", d="#11507a40")


def swirl(f):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    lit = {}
    for start in (0, 16):
        head = (start + 2 * f) % 32
        for back, ch in ((7, "d"), (6, "c"), (5, "b"), (4, "a"), (3, "a"), (2, "v"), (1, "w")):
            lit[ORBIT_AT[(head - back) % 32]] = ch
        lit[ORBIT_AT[head]] = "W"
        lit[ORBIT_AT[(head + 1) % 32]] = "w"
    spark = (8 - f) % 8                                    # the eye's spark runs the other way
    lit[EYE_AT[spark]] = "v"
    lit[EYE_AT[(spark + 1) % 8]] = "b"
    px = im.load()
    for (x, y), ch in lit.items():
        px[x, y] = rgba(SWIRL_PAL[ch])
    return im


# --- hex option rows (73x19): netherite slabs in the enchanting-table style, a recessed cost box on the left. They
# were 88 wide at x 80; 0.4 narrowed them to make room for the blood slot (the longest curse name still fits: the row
# text gets ROW_W - 23 = 50 px)
ROW_X, ROW_W, ROW_H = 95, 73, 19
CHAIN = pal(i="#1f1b25", j="#5a5560", J="#8f8a95", K="#c9c4cc")
CHAIN_UNIT = """
.KJj ....
J..j i...
J..j KJJi
j..i i...
.jii ....
"""
PADLOCK = """
...jJ Jj...
..j.. ..i..
..J.. ..i..
..J.. ..i..
.OOOO OOOO.
.Ofee eedcO
.Oedd OdcbO
.Oedc OcbbO
.Odcc ObbaO
.Ocbb bbaaO
.OOOO OOOO.
"""


def option_row(state):
    im = Image.new("RGBA", (ROW_W, ROW_H), (0, 0, 0, 0))
    if state == "hover":
        edge, face, light, dark, box, boxl, boxd = "u", "#273042", "#3d6f86", "#192133", "#141b2c", "#0f1424", \
            "#2f5a70"
    elif state in ("disabled", "locked"):
        edge, face, light, dark, box, boxl, boxd = "1", "2", "2", "2", "1", "1", "2"
    else:
        edge, face, light, dark, box, boxl, boxd = "O", "4", "6", "2", "2", "1", "5"
    fill(im, 1, 0, ROW_W - 2, ROW_H, edge)
    fill(im, 0, 1, ROW_W, ROW_H - 2, edge)
    bevel(im, 1, 1, ROW_W - 2, ROW_H - 2, light, dark, inner=face)
    bevel(im, 1, 1, 17, 17, boxl, boxd, inner=box)
    if state == "hover":
        fill(im, 2, 2, 15, 1, "#1d3446")
    # gold studs at the right end
    stud = {"hover": ("g", "e"), "normal": ("f", "d")}.get(state, ("4", "3"))
    for sy in (4, 13):
        fill(im, ROW_W - 4, sy, 1, 1, stud[0])
        fill(im, ROW_W - 3, sy, 1, 1, stud[1])
        fill(im, ROW_W - 4, sy + 1, 2, 1, stud[1] if state in ("hover", "normal") else "3")
    if state == "locked":
        for n in range((ROW_W - 19 - 6) // 8):
            stamp(im, 19 + 8 * n, 7, CHAIN_UNIT, CHAIN)
        stamp(im, 4, 4, PADLOCK, pal(G, CHAIN))
    return im


ROWS = {s: option_row(s) for s in ("normal", "hover", "disabled", "locked")}
for i, s in enumerate(("normal", "hover", "disabled", "locked")):
    REG[f"row_{s}"] = (0, 166 + 19 * i, ROW_W, ROW_H)

# --- cost icons (16x16): 1, 2 or 3 drops of Soul Elixir; drawn in the row's cost box
DROP_BIG = """
...o...
..oWo..
..owo..
.owvuo.
owWvuto
owvuuto
ouuutto
.ottmo.
..ooo..
"""
DROP = """
..o..
.owo.
.ovo.
owvuo
ovuto
.oto.
..o..
"""


def cost_icon(n, palette):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    spots = {1: [(4, 3, DROP_BIG)], 2: [(2, 5, DROP), (9, 5, DROP)],
             3: [(5, 1, DROP), (1, 8, DROP), (9, 8, DROP)]}[n]
    for x, y, g in spots:
        stamp(im, x, y, g, palette)
    return im


COST_ON = pal(SOUL, o="#0b1630")
COST_OFF = pal(o="#120e14", W="#6b5f68", w="#5a4f57", v="#4a4048", u="#3c333b", t="#302830", m="#262026")
ICONS = {}
for n in (1, 2, 3):
    ICONS[f"cost_{n}"] = cost_icon(n, COST_ON)
    ICONS[f"cost_{n}_off"] = cost_icon(n, COST_OFF)
    REG[f"cost_{n}"] = (192 + 16 * (n - 1), 32, 16, 16)
    REG[f"cost_{n}_off"] = (192 + 16 * (n - 1), 48, 16, 16)


# --- ghost icons for the empty slots: the hexed book and the flask as flat silhouettes
def ghost(grid):
    g = "\n".join("".join("." if c == "." else ("b" if c in "oO" else "a") for c in row) for row in parse(grid))
    return img(g, pal(a="#5f515370", b="#7a6a668c"), (16, 16), "ghost")


# a potion bottle with a drop of blood in it, for the empty blood slot (b outline, a body, d the drop)
BLOOD_POTION = """
................
......bbbb......
......baab......
.......bb.......
......baab......
......baab......
.....baaaab.....
....baaaaaab....
...baaaddaaab...
...baaddddaab...
...baaddddaab...
...baadddddab...
....baddddab....
.....baaaab.....
......bbbb......
................
"""


ICONS["ghost_book"] = ghost(BOOK)
ICONS["ghost_elixir"] = ghost(FLASK)
ICONS["ghost_blood"] = img(BLOOD_POTION, pal(a="#5f515370", b="#7a6a668c", d="#9a2a3a96"), (16, 16), "ghost_blood")
REG["ghost_book"] = (240, 32, 16, 16)
REG["ghost_elixir"] = (240, 48, 16, 16)
REG["ghost_blood"] = (240, 64, 16, 16)
for i in range(8):
    REG[f"swirl_{i}"] = (192 + 16 * (i % 4), 16 * (i // 4), 16, 16)
REG["tank_fill"] = (176, 0, 16, 80)
REG["tank_surface"] = (176, 80, 16, 3)
REG["tank_glass"] = (176, 84, 16, 48)
REG["glyphs"] = (0, 243, 96, 8)
REG["panel"] = (0, 0, 176, 166)


# --- the panel (176x166)
TANK_CAP_TOP = """
.OOOOOOOOO OOOOOOOOOOO.
OghffffeeeeeeddddddcbO
OdcccccbbbbbbbbbbbbbaO
O6OOOOOOOOOOOOOOOOOO2O
"""
TANK_CAP_BOT = """
O6OOOOOOOOOOOOOOOOOO2O
OfeeeedddddddccccccbbO
OcbbbbbbbaaaaaaaaaaaaO
.OOOOOOOOO OOOOOOOOOOO.
"""
INSCRIPTION = [9, 2, 14, 0, 12, 6, 10, 4, 15, 1]
BLOOD_SLOT = (74, 20)                 # where the blood potion item is drawn (its 18x18 frame is one pixel further out)
ALTAR_L, ALTAR_R = [5, 11, 3], [8, 0, 12]
CARVE_INK, CARVE_LIP = "#183542", "5"


def panel():
    im = Image.new("RGBA", (176, 166), (0, 0, 0, 0))
    fill(im, 0, 0, 176, 166, "O")
    for x, y in ((0, 0), (175, 0), (0, 165), (175, 165)):
        im.putpixel((x, y), (0, 0, 0, 0))
    bevel(im, 1, 1, 174, 164, "f", "c", corner="d")                       # gold inlay
    bevel(im, 2, 2, 172, 162, "1", "1")                                   # dark groove
    bevel(im, 3, 3, 170, 160, "5", "2", inner="3", corner="3")            # netherite bevel + fill
    # corner brackets
    stamp(im, 0, 0, CORNER)
    stamp(im, 166, 0, mirror(CORNER, h=True, shade={"g": "f", "h": "g", "f": "e"}))
    stamp(im, 0, 156, mirror(CORNER, v=True, shade=DARKEN))
    stamp(im, 166, 156, mirror(CORNER, h=True, v=True, shade={**DARKEN, "e": "b", "f": "c"}))
    # the title band inscription (right of the title)
    glyph_text(im, 100, 5, INSCRIPTION, CARVE_INK, CARVE_LIP)
    # the soul tank: gold caps, netherite posts with rivets, dark empty glass
    stamp(im, 6, 13, TANK_CAP_TOP)
    stamp(im, 6, 65, TANK_CAP_BOT)
    fill(im, 6, 17, 1, 48, "O")
    fill(im, 7, 17, 1, 48, "6")
    fill(im, 8, 17, 1, 48, "O")
    fill(im, 25, 17, 1, 48, "O")
    fill(im, 26, 17, 1, 48, "2")
    fill(im, 27, 17, 1, 48, "O")
    fill(im, 9, 17, 16, 48, "#0b0e1c")
    for ry in (28, 40, 52):
        fill(im, 7, ry, 1, 1, "f")
        fill(im, 26, ry, 1, 1, "c")
    # the socket the HEX button sits in (a recessed hexagon one pixel larger), and carved glyph columns either side
    mask = {(x, y) for y, row in enumerate(parse(HEX_BASE)) for x, ch in enumerate(row) if ch != "."}
    bx, by = 37, 14
    for y in range(-1, 29):
        for x in range(-1, 33):
            if (x, y) in mask:
                continue
            near = [(x + dx, y + dy) in mask for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
            if any(near):
                lit = (x, y - 1) in mask or (x - 1, y) in mask or (x - 1, y - 1) in mask
                fill(im, bx + x, by + y, 1, 1, "5" if lit and y > 13 else "1" if not lit else "2")
    for n, g in enumerate(ALTAR_L):
        glyph_text(im, 29, 16 + 9 * n, [g], CARVE_INK, CARVE_LIP)
    for n, g in enumerate(ALTAR_R):
        glyph_text(im, 80, 41 + 9 * n, [g], CARVE_INK, CARVE_LIP)
    # the two input slots, ringed in gold, joined by a carved line
    slot(im, 33, 46, gold=True)
    slot(im, 55, 46, gold=True)
    fill(im, 52, 54, 2, 1, "e")
    fill(im, 52, 55, 2, 1, "c")
    # the blood slot right of the HEX button, ringed in gold with blood-red corner studs, linked down to the elixir
    bx, by = BLOOD_SLOT
    slot(im, bx - 1, by - 1, gold=True)
    for cx, cy in ((bx - 2, by - 2), (bx + 17, by - 2), (bx - 2, by + 17), (bx + 17, by + 17)):
        fill(im, cx, cy, 1, 1, "#9a1c2a")
    fill(im, bx - 2, by + 18, 1, 45 - (by + 18), "e")
    fill(im, bx - 1, by + 18, 1, 45 - (by + 18), "c")
    # the well the three hex option rows sit in
    bevel(im, ROW_X - 1, 13, ROW_W + 2, 59, "1", "5", inner="2", corner="3")
    # a carved rule from the "Inventory" label to the right edge, gold diamonds at its ends
    fill(im, 63, 76, 102, 1, "1")
    fill(im, 64, 77, 101, 1, "5")
    for dx in (61, 166):
        stamp(im, dx - 1, 75, """
.f.
fec
.c.
""")
    # player inventory, vanilla layout
    for r in range(3):
        for c in range(9):
            slot(im, 7 + 18 * c, 83 + 18 * r)
    for c in range(9):
        slot(im, 7 + 18 * c, 141)
    return im


PANEL = panel()


def glyph_strip():
    im = Image.new("RGBA", (96, 8), (0, 0, 0, 0))
    glyph_text(im, 1, 1, list(range(16)), "#0b1630")
    glyph_text(im, 0, 0, list(range(16)), "#c8fff8")
    return im


def tank_fill():
    tile = parse(TANK_TILE)
    return img("\n".join(tile[y % 32] for y in range(80)), pal(SOUL), (16, 80), "tank_fill")


def sheet():
    im = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    parts = {"panel": PANEL, "tank_fill": tank_fill(),
             "tank_surface": img(TANK_SURFACE, pal(SOUL, Z="#ffffffb0"), (16, 3), "surface"),
             "tank_glass": img(TANK_GLASS, GLASS_PAL, (16, 48), "glass"),
             "glyphs": glyph_strip(), **{f"swirl_{i}": swirl(i) for i in range(8)},
             **{f"row_{k}": v for k, v in ROWS.items()}, **BUTTONS, **ICONS}
    for name, (x, y, w, h) in REG.items():
        part = parts[name]
        assert part.size == (w, h), (name, part.size, (w, h))
        im.alpha_composite(part, (x, y))
    # no two regions may overlap
    boxes = sorted(REG.items())
    for i, (n1, (x1, y1, w1, h1)) in enumerate(boxes):
        for n2, (x2, y2, w2, h2) in boxes[i + 1:]:
            assert x1 + w1 <= x2 or x2 + w2 <= x1 or y1 + h1 <= y2 or y2 + h2 <= y1, (n1, n2)
    return im, parts


GUI_SHEET, GUI_PARTS = sheet()
put("textures/gui/hexing_table.png", GUI_SHEET)


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


# ====================================================================== preview: the screen mock-up
# A tiny stand-in for the Minecraft font (8 rows, descenders on row 7), used only by the mock-up.
FONT = {k: v.split(",") for k, v in {
    "A": ".###.,#...#,#...#,#####,#...#,#...#,#...#", "C": ".###.,#...#,#....,#....,#....,#...#,.###.",
    "E": "#####,#....,#....,####.,#....,#....,#####", "H": "#...#,#...#,#...#,#####,#...#,#...#,#...#",
    "I": "###,.#.,.#.,.#.,.#.,.#.,###", "L": "#....,#....,#....,#....,#....,#....,#####",
    "M": "#...#,##.##,#.#.#,#...#,#...#,#...#,#...#", "S": ".####,#....,#....,.###.,....#,....#,####.",
    "T": "#####,..#..,..#..,..#..,..#..,..#..,..#..", "V": "#...#,#...#,#...#,#...#,#...#,.#.#.,..#..",
    "a": ".....,.....,.###.,....#,.####,#...#,.####", "b": "#....,#....,#.##.,##..#,#...#,#...#,####.",
    "c": ".....,.....,.###.,#...#,#....,#...#,.###.", "d": "....#,....#,.##.#,#..##,#...#,#...#,.####",
    "e": ".....,.....,.###.,#...#,#####,#....,.####", "f": "..##,.#..,####,.#..,.#..,.#..,.#..",
    "g": ".....,.....,.####,#...#,#...#,.####,....#,####.", "h": "#....,#....,#.##.,##..#,#...#,#...#,#...#",
    "i": "#,.,#,#,#,#,#", "l": "#.,#.,#.,#.,#.,#.,.#", "m": ".....,.....,##.#.,#.#.#,#.#.#,#...#,#...#",
    "n": ".....,.....,####.,#...#,#...#,#...#,#...#", "o": ".....,.....,.###.,#...#,#...#,#...#,.###.",
    "p": ".....,.....,#.##.,##..#,#...#,####.,#....,#....", "r": ".....,.....,#.##.,##..#,#....,#....,#....",
    "s": ".....,.....,.####,#....,.###.,....#,####.", "t": ".#..,.#..,####,.#..,.#..,.#..,..##",
    "u": ".....,.....,#...#,#...#,#...#,#...#,.####", "v": ".....,.....,#...#,#...#,#...#,.#.#.,..#..",
    "x": ".....,.....,#...#,.#.#.,..#..,.#.#.,#...#", "y": ".....,.....,#...#,#...#,#...#,.####,....#,####.",
    "0": ".###.,#...#,#..##,#.#.#,##..#,#...#,.###.", "1": "..#..,.##..,..#..,..#..,..#..,..#..,#####",
    "2": ".###.,#...#,....#,..##.,.#...,#...#,#####", "3": ".###.,#...#,....#,..##.,....#,#...#,.###.",
    "4": "...##,..#.#,.#..#,#...#,#####,....#,....#", "6": "..##.,.#...,#....,####.,#...#,#...#,.###.",
    "5": "#####,#....,####.,....#,....#,#...#,.###.", "8": ".###.,#...#,#...#,.###.,#...#,#...#,.###.",
    "7": "#####,#...#,....#,...#.,..#..,..#..,..#..", "9": ".###.,#...#,#...#,.####,....#,...#.,.##..",
    ">": "#...,.#..,..#.,...#,..#.,.#..,#...", "+": ".....,..#..,..#..,#####,..#..,..#..,.....",
    ",": ".,.,.,.,.,#,#,#", ":": ".,.,#,.,.,#,.",
}.items()}


def text(im, x, y, s, colour, shadow=True):
    """Draw s with the stand-in font; returns the x after it. Glyph indices as ints draw cursed glyphs."""
    c = rgba(colour)
    sh = (c[0] // 4, c[1] // 4, c[2] // 4, 255)
    px = im.load()
    for ch in s:
        if isinstance(ch, int):
            rows, w = GLYPHS[ch], 5
        elif ch == " ":
            x += 4
            continue
        else:
            rows = FONT[ch]
            w = len(rows[0])
        for j, row in enumerate(rows):
            for i, b in enumerate(row):
                if b == "#":
                    if shadow:
                        px[x + i + 1, y + j + 1] = sh
                    px[x + i, y + j] = c
        x += w + 1
    return x


def blit(dst, x, y, name, u=0, v=0, w=None, h=None):
    rx, ry, rw, rh = REG[name]
    part = GUI_SHEET.crop((rx + u, ry + v, rx + u + (w or rw), ry + v + (h or rh)))
    dst.alpha_composite(part, (x, y))


def item_at(dst, x, y, rel, count=None, frame=0):
    im = ANIM[rel][frame] if rel in ANIM else OUT[rel]
    dst.alpha_composite(im, (x, y))
    if count:
        text(dst, x + 17 - 6 * len(str(count)), y + 9, str(count), "#ffffff")


def tooltip(dst, x, y, lines):
    w = max(text(Image.new("RGBA", (400, 20)), 0, 0, ln, "#ffffff") for ln, _ in lines) + 6
    h = 10 * len(lines) + 4
    bg, b1, b2 = rgba("#100010f0"), rgba("#1fb0c0"), rgba("#0f4a66")
    box = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    fill(box, 1, 0, w, h + 2, bg)
    fill(box, 0, 1, w + 2, h, bg)
    for yy in range(1, h + 1):                     # the vanilla border gradient, in soul blue
        t = (yy - 1) / max(1, h - 1)
        c = tuple(int(b1[i] * (1 - t) + b2[i] * t) for i in range(3)) + (255,)
        fill(box, 1, yy, 1, 1, c)
        fill(box, w, yy, 1, 1, c)
    fill(box, 1, 1, w, 1, b1)
    fill(box, 1, h, w, 1, b2)
    dst.alpha_composite(box, (x, y))
    for n, (ln, col) in enumerate(lines):
        text(dst, x + 4, y + 3 + 10 * n + (2 if n else 0), ln, col)


def screen(state):
    """The Hexing Table screen at 1x as the Java side would draw it from the sheet (state: 'hover' or 'hex')."""
    W, H = 300, 196
    im = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    for y in range(H):                             # the dimmed world behind a vanilla screen
        fill(im, 0, y, W, 1, (18 + y // 20, 16 + y // 24, 26 + y // 14, 255))
    L, T = 20, 15
    im.alpha_composite(PANEL, (L, T))
    text(im, L + 8, T + 6, "Hexing Table", "#e6c77a", shadow=False)
    text(im, L + 8, T + 72, "Inventory", "#b8a58a", shadow=False)
    # soul tank: fill strip scrolled, meniscus, a swirl inside the fill, glass on top
    souls = 640 if state == "hover" else 540
    hgt = 48 * souls // 1000
    top = T + 17 + 48 - hgt
    blit(im, L + 9, top, "tank_fill", v=6 + 48 - hgt, h=hgt)
    blit(im, L + 9, top - 1, "tank_surface")
    if hgt >= 16:
        blit(im, L + 9, top + (hgt - 16) // 2, "swirl_3" if state == "hover" else "swirl_6")
    blit(im, L + 9, T + 17, "tank_glass")
    # input slots
    book = img(BOOK, pal(PAGE, o="#1a0b26", S="#7a4fb0", s="#3a1f5c", j="#24103a", b="#a07ad8", c="#d8c0ff",
                         C="#8a6ab8",
                         **{"1": "#2c1648", "2": "#3b1e60", "3": "#4b2878", "4": "#5c3490", "5": "#7044a8"}),
               (16, 16))
    im.alpha_composite(book, (L + 34, T + 47))
    item_at(im, L + 56, T + 47, "textures/item/soul_elixir.png", 3)
    if state == "hover":                           # no blood offered: the ghost bottle shows
        blit(im, L + BLOOD_SLOT[0], T + BLOOD_SLOT[1], "ghost_blood")
    else:                                          # a Potion of Blood in the slot (a stand-in for vanilla's potion)
        im.alpha_composite(img(BLOOD_POTION, pal(b="#2b1820", a="#cfe0ec70", d="#c42232"), (16, 16)),
                           (L + BLOOD_SLOT[0], T + BLOOD_SLOT[1]))
    # the three hex options
    rows = [("hover" if state == "hover" else "normal", 1, [2, 9, 14, 6, 1, 11, 4]),
            ("normal" if state == "hover" else "hover", 3, [12, 5, 0, 7, 15, 3]),
            ("locked", None, None)]
    for i, (st, cost, glyphs) in enumerate(rows):
        x, y = L + ROW_X, T + 14 + 19 * i
        blit(im, x, y, f"row_{st}")
        if cost:
            blit(im, x + 1, y + 1, f"cost_{cost}")
            col = "#c8fff8" if st == "hover" else "#6fc4cc"
            text(im, x + 20, y + 6, glyphs, col, shadow=False)
    # the HEX button with its glow
    blit(im, L + 37, T + 14, "hex_halo")
    blit(im, L + 37, T + 14, "hex_hover" if state == "hover" else "hex_ignite_5")
    # inventory
    inv = [("soul_elixir", 12), ("elixir_of_greed", 2), ("cursed_elixir", None), ("hex_core", None),
           ("elixir_bottle", 5), ("hexed_book_sin", None), ("hexed_book_hidden", None), ("elixir_jar", None),
           ("soul_tank", None)]
    for c, (name, n) in enumerate(inv):
        item_at(im, L + 8 + 18 * c, T + 142, f"textures/item/{name}.png", n, frame=4)
    for c, name in ((0, "hexed_book_lesser"), (2, "hexing_table"), (5, "soul_elixir")):
        item_at(im, L + 8 + 18 * c, T + 84, f"textures/item/{name}.png", 7 if name == "soul_elixir" else None)
    if state == "hover":
        tooltip(im, L + 156, T + 2, [("Lesser Hex", "#7ff0ec"), ("Sharpness IV > V", "#a8a8a8"),
                                     (["C", "u", "r", "s", "e", " ", "o", "f", " ", "M", "i", 11, 4, 9],
                                      "#e05a50"), ("1 Soul Elixir, 100 souls", "#808080")])
    return im


def mockup(dst, scale=3):
    shots = [("hovering the lesser hex: the curse resolves into words", screen("hover")),
             ("HEX!  (ignition frame 5, souls draining)", screen("hex"))]
    w = max(s.width for _, s in shots) * scale
    sheet = Image.new("RGBA", (w, sum(s.height * scale + 24 for _, s in shots)), (24, 24, 30, 255))
    y = 0
    for label, s in shots:
        ImageDraw.Draw(sheet).text((8, y + 6), label, fill=(255, 230, 160, 255))
        sheet.paste(s.resize((s.width * scale, s.height * scale), Image.NEAREST), (0, y + 24))
        y += s.height * scale + 24
    sheet.save(dst)
    return dst


def sheet_map(dst, scale=3):
    """The GUI sheet at 3x on a checkerboard, every region outlined and named."""
    big = GUI_SHEET.resize((256 * scale, 256 * scale), Image.NEAREST)
    out = checker(big.size, (70, 70, 78, 255), (56, 56, 64, 255), cell=scale * 4)
    out.alpha_composite(big)
    d = ImageDraw.Draw(out)
    for name, (x, y, w, h) in REG.items():
        if name == "panel":
            continue
        d.rectangle((x * scale, y * scale, (x + w) * scale - 1, (y + h) * scale - 1), outline=(255, 80, 200, 255))
    legend = Image.new("RGBA", (out.width + 300, out.height), (28, 28, 33, 255))
    legend.paste(out, (0, 0))
    d = ImageDraw.Draw(legend)
    for n, (name, (x, y, w, h)) in enumerate(sorted(REG.items(), key=lambda kv: (kv[1][1], kv[1][0]))):
        d.text((out.width + 10, 8 + 14 * n), f"{name:15s} {x:3d},{y:3d} {w}x{h}", fill=(235, 235, 235, 255))
    legend.save(dst)
    return dst


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
        print("sheet:", strips([("hex button", [BUTTONS[k] for k in ("hex_normal", "hex_hover", "hex_pressed",
                                                                         "hex_disabled", "hex_halo")]),
                                ("ignition", [BUTTONS[f"hex_ignite_{i}"] for i in range(8)]),
                                ("swirling souls", [GUI_PARTS[f"swirl_{i}"] for i in range(8)])],
                               p / "hex_gui_anim.png", scale=6))
        print("sheet:", sheet_map(p / "hex_gui_sheet.png"))
        print("mockup:", mockup(p / "hex_screen_mockup.png"))


if __name__ == "__main__":
    main()
