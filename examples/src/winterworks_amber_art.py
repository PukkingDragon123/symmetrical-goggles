#!/usr/bin/env python3
"""Winterworks pixel art for the Amber Age update (mods/winterworks/docs/AMBER_UPDATE.md).

    python examples/src/winterworks_amber_art.py                  # write all PNGs + particle jsons
    python examples/src/winterworks_amber_art.py --preview DIR    # also write contact sheets to DIR

Same rules as winterworks_art.py (whose grid helpers this imports): every sprite is a hand-placed ASCII grid plus a
palette, '.' is transparent, spaces inside rows are ignored (they only help count columns). Hue-shifted ramps (amber
shadows lean red-brown, lights lean cream; stone and gravel shadows lean violet), light from the top-left, dark
hue-shifted outlines (never pure black); only glows (amber glints, the glowing Amberwood leaves, the faint blood glow)
are saturated. Palette colours may carry alpha (#rrggbbaa): the amber block is translucent, the blood stain thin, the
cave dust faint.

Variants that must line up (the amber block with a seed or a mosquito inside, the four dusted stages of the amber
fossil, the resin log, the chest boat icon) are composed from one hand-drawn base grid and hand-drawn overlay grids
(`over`), so they always match pixel for pixel. The Amberwood wood set is drawn in vanilla's conventions; its sign,
hanging-sign and boat entity textures are cut from the hand-drawn plank, bark and stripped-wood tiles into vanilla's
UV layouts (`paint_box`). Particles are frame sequences `<name>_<i>.png` (frame 0 = birth) plus
`particles/<name>.json`.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winterworks_art import ASSETS, checker, draw, pal, parse  # noqa: E402  (no side effects)

OUT: dict[str, Image.Image] = {}      # relative path -> image
JSON: dict[str, dict] = {}            # relative path -> json body


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


def block(name, palette, grid):
    put(f"textures/block/{name}.png", draw(parse(grid), palette, (16, 16), name))


def item(name, palette, grid):
    put(f"textures/item/{name}.png", draw(parse(grid), palette, (16, 16), name))


def frames(name, palette, grids, size=8):
    for i, g in enumerate(grids):
        put(f"textures/particle/{name}_{i}.png", draw(parse(g), palette, (size, size), f"{name}_{i}"))
    JSON[f"particles/{name}.json"] = {"textures": [f"winterworks:{name}_{i}" for i in range(len(grids))]}


# ====================================================================== shared ramps (dark -> light)
# amber: deep red-brown shadows, orange body, honey and cream lights
AMBER = {"0": "#3d0f0b", "1": "#601d0c", "2": "#86300e", "3": "#a84812", "4": "#c76516", "5": "#dd8420",
         "6": "#eea32f", "7": "#f8c454", "8": "#ffe28f", "9": "#fff6d6"}
BLOOD = {"k": "#2d0710", "r": "#58101c", "R": "#82182a", "e": "#ad2433", "E": "#d84444", "F": "#ff8a78"}


def translucent(ramp, alphas):
    """The same colours with alpha (two hex digits per entry)."""
    return {k: v + a for (k, v), a in zip(ramp.items(), alphas)}


# ====================================================================== amber block: honey amber, an even repeating pattern
# The game draws a real 3D mosquito or seed inside the block (a block-entity renderer), so every face is translucent.
# Blocks tile like vanilla stone or sand, so there is no rim, no centre and no lone feature: uniformly translucent
# honey amber (two body tones in soft flow bands, a few deeper and lighter pixels), flow streaks running diagonally
# (each a dash along a line x - y = k, so it carries on across the block edges) and small trapped bubbles (a cream
# glint over a dark underside) scattered evenly. Every edge wraps. The seed and mosquito variants are the same amber.
HONEY_BLOCK = {
    "h": "#f09a24b4", "o": "#e47e18b4", "c": "#d06212b8", "g": "#f5b640b8",     # body: honey, orange, deep, light
    "s": "#f9c552b4", "d": "#b85414bc",                                         # flow streaks (light / dark)
    "B": "#fff6dcf4", "b": "#f9d27ed8", "q": "#86380ed0",                         # bubbles: glint, body, underside
}
AMBER_BLOCK = """
ohhh hhoh hoco hooh
oohh shho bhoo ohoo
oohB bshh oohh hBoo
ohob qhsh ocdh hqho
hooo hhhh hocd hhho
scoh hhoh hhoc ohho
csco hhBh hhho chho
ocso hhqo ohhh hohb
hooo ohod ohhh ghoo
ohhh hooo ohhB bgho
ohho hhoo ohhb qsoh
hodh hhho hhoh hgoh
Bhcd hhhh ohhh ohgh
qhoc dhhh sohh hhoh
hhho cohh oboo hdhh
hhhh hohh occo oodo
"""
for _name in ("amber_block", "amber_block_seed", "amber_block_mosquito"):
    block(_name, pal(HONEY_BLOCK), AMBER_BLOCK)

# ====================================================================== amber fossil: amber in gravel (suspicious-gravel style)
# Vanilla-style gravel (fine pebbles in warm greys, a pinkish cast) with lumps of amber in it. Brushing digs a darker
# hollow into the gravel (the gravel below, in shadow) that grows over the four stages and uncovers more amber: two
# chips peek out at stage 0, the big lump (a petrified seed sealed in it) is half out at 2 and whole at 3.
GRAVEL = {"0": "#544a4d", "1": "#665c5d", "2": "#766d6c", "3": "#847c7b", "4": "#928987", "5": "#a29894",
          "6": "#b6aca6"}
DIG = {"0": "x", "1": "x", "2": "x", "3": "X", "4": "X", "5": "Z", "6": "Z"}     # gravel tone -> hollow tone
FOSSIL = {"x": "#3f3639", "X": "#4d4446", "Z": "#5d5355",                          # the shadowed hollow
          "k": "#4a1f0e", "a": "#8a3f13", "A": "#b9631c", "b": "#dc932f", "B": "#f3c15a", "W": "#fff0bc",
          "p": "#3b2416", "P": "#5c3a22"}                                           # amber, the seed inside
GRAVEL_BASE = """
3334 1543 3433 2303
3261 3334 0434 3124
5355 2334 4354 1225
3565 5544 3346 3331
3351 3143 3341 4133
2233 3313 6344 3343
2133 3305 1443 3232
3013 5464 4333 3131
4335 4314 3363 5336
3236 5133 3343 3334
2264 3431 3333 3512
2143 3363 3253 2343
3353 2333 2332 1432
3334 0333 6333 4322
3543 1323 4631 1321
4345 1253 4433 3433
"""
# the amber as it lies in the gravel: a rough lump (lit top-left, a cream glint, a small dark seed sealed in it)
# and two chips; no outline, the shadowed hollow round it does that
AMBER_IN = """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... Bb..
.... .... .... ba..
.... .... .... ....
.... .WBb .... ....
.... Bbbb bA.. ....
...B bbpP bAa. ....
...b bpPA Aaa. ....
.... AAAa aa.. ....
.... .aaa .... ....
.... .... .... ....
..B. .... .... ....
..ba .... .... ....
.... .... .... ....
"""
# per stage: '#' = gravel brushed away (amber shows where there is some, else the shadowed hollow)
REVEAL = ["""
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ##..
.... .... .... ##..
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ...# .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
..#. .... .... ....
..#. .... .... ....
.... .... .... ....
""", """
.... .... .... ....
.... .... .... ....
.... .... .... ##..
.... .... ...# ###.
.... .... .... ##..
.... .... .... ....
.... .... #... ....
.... ..## #... ....
.... .### ##.. ....
.... ..## #... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.#.# .... .... ....
.### .... .... ....
.... .... .... ....
""", """
.... .... .... ....
.... .... .... ....
.... .... .... ###.
.... .... ...# ####
.... .... ..## ###.
.... .### #... ##..
.... #### ##.. ....
...# #### ##.. ....
...# #### ###. ....
.... #### ##.. ....
.... .### #... ....
.... .... .... ....
..#. .... .... ....
.### .... .... ....
.### .... .... ....
..#. .... .... ....
""", """
.... .... .... ....
.... .... ...# ##..
.... ..#. ..## ###.
.... .### .### ####
.... #### #### ###.
...# #### #### ##..
..## #### ###. ....
..## #### ###. ....
..## #### ###. ....
..## #### ###. ....
...# #### ##.. ....
.... ###. #... ....
.##. .#.. .... ....
#### .... .... ....
.### .... .... ....
..## .... .... ....
"""]


def dusted(stage):
    """Compose one stage: gravel where not brushed; in the hollow the amber, else the gravel below in shadow."""
    g, a, m = parse(GRAVEL_BASE), parse(AMBER_IN), parse(REVEAL[stage])
    rows = []
    for y in range(16):
        row = ""
        for x in range(16):
            if m[y][x] != "#":
                row += g[y][x]
            elif a[y][x] != ".":
                row += a[y][x]
            else:
                row += DIG[g[y][x]]
        rows.append(row)
    return "\n".join(rows)


for k in range(4):
    block(f"amber_fossil_{k}", pal(GRAVEL, FOSSIL), dusted(k))

# ====================================================================== amber sand and amber gravel (brushable)
# Sand and gravel with loose amber in them, brushed like suspicious sand/gravel: honey-amber chunks (a cream glint,
# lit top-left, a deep red-amber underside) and single glinting grains scattered through. Brushing digs shadowed
# hollows that grow over the four stages: glints and a small chunk at stage 0, everything at stage 3. Unlike the
# Amber Fossil (one big lump with a seed sealed in it) these are loose scattered chunks. The gravel is the fossil's
# gravel turned round, with the amber laid out mirrored.
SAND = {"0": "#c4ab7c", "1": "#ccb685", "2": "#d3c091", "3": "#d8c99c", "4": "#dfd3a7", "5": "#e6ddb3",
        "6": "#eee8c6"}
SAND_DIG = {"0": "x", "1": "x", "2": "x", "3": "X", "4": "X", "5": "Z", "6": "Z"}
LOOSE = {"x": "#a99168", "X": "#b8a076", "Z": "#c6b083",                          # the shadowed hollow in sand
         "a": "#8a3a10", "A": "#c3601a", "b": "#e6922a", "B": "#f6c055", "W": "#fff2c4"}
GRAVEL_LOOSE = dict(LOOSE, x=FOSSIL["x"], X=FOSSIL["X"], Z=FOSSIL["Z"])
SAND_BASE = """
1344 3335 3443 4446
3154 3445 3344 5543
5624 5435 4343 2444
4556 6533 4443 3544
3454 6345 4543 3633
4454 4534 4423 3446
5356 4143 3235 2433
5334 4454 4444 4335
4544 3534 3434 4435
4524 5335 4454 3344
4523 4445 3324 3402
4535 4453 4543 3434
4544 5344 4345 3425
4365 2346 3232 4443
1544 4455 4433 5245
3445 4524 4454 5454
"""
# the loose amber: five chunks and four glinting grains
AMBER_LOOSE = """
.... .... .... ....
.... ...W .... ....
.... .... ...B b...
...W B... ...A a...
...B bA.. .... ....
.... Aa.. .... ....
.... .... .... ....
.... .... .... ..W.
.B.. .... .... ....
.... .... .WB. ....
.... .... BbbA ....
.... .... .AAa ....
..bA .... .... ....
..Aa .... .... BbA.
.... ..W. .... .Aa.
.... .... .... ....
"""
REVEAL_LOOSE = ["""
.... .... .... ....
.... ...# .... ....
.... .... ...# #...
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ..#.
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""", """
.... .... .... ....
.... ..## .... ....
...# #... ..## ##..
..## ##.. ..## ##..
.... .... ...# #...
.... .... .... ....
.... .... .... ....
.... .... .... .##.
.#.. .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ..#. .... ....
.... .... .... ....
""", """
.... .... .... ....
.... ..## .... ....
..## ##.. ..## ##..
.### ###. .### ##..
.### ###. ..## #...
..## ##.. .... ....
.... #... .... ....
.... .... .... .###
##.. .... #... ..#.
.#.. ...# ###. ....
.... ...# ###. ....
.... .... .... ....
..#. .... .... ....
.... .... .... ....
.... .##. .... ....
.... .... .... ....
""", """
.... ..#. .... ....
.... .### ..#. ....
..## ##.# .### ##..
.### ###. .### ###.
.### #### ..## #...
..## ###. .... ....
...# ###. .... ..#.
.... ##.. .... .###
##.. .##. #... ..#.
###. ..## ###. ....
.#.. ..## #### ....
.#.. ...# #### ....
.### .... ##.. #...
.### .... ...# ###.
..#. .##. ...# ###.
.... .... .... .#..
"""]


def mirrored_grid(grid):
    return "\n".join(r[::-1] for r in parse(grid))


def turned_grid(grid):
    """The grid turned half round (rows and columns reversed)."""
    return "\n".join(r[::-1] for r in parse(grid)[::-1])


def brushed(base, amber, reveal, dig):
    """One brushing stage: the base where not brushed; in the hollow the amber, else the base below in shadow."""
    g, a, m = parse(base), parse(amber), parse(reveal)
    return "\n".join("".join(g[y][x] if m[y][x] != "#" else (a[y][x] if a[y][x] != "." else dig[g[y][x]])
                             for x in range(16)) for y in range(16))


for k in range(4):
    block(f"amber_sand_{k}", pal(SAND, LOOSE), brushed(SAND_BASE, AMBER_LOOSE, REVEAL_LOOSE[k], SAND_DIG))
    block(f"amber_gravel_{k}", pal(GRAVEL, GRAVEL_LOOSE),
          brushed(turned_grid(GRAVEL_BASE), mirrored_grid(AMBER_LOOSE), mirrored_grid(REVEAL_LOOSE[k]), DIG))

# ====================================================================== petrified log: stone-hard fossil wood
# Side: deep vertical bark furrows turned to stone in short offset plates, rust, ochre and chalcedony mineral
# streaks spread through them; it tiles both ways like a vanilla log (no lone fracture line to stripe a pillar).
# Top: stony rings banded with minerals, a quartz heart.
PETRI = {"o": "#2a2228", "1": "#41363a", "2": "#5a4b4a", "3": "#77625c", "4": "#94806f", "5": "#b19c86",
         "6": "#cdbba0", "r": "#7e3f2c", "R": "#a65a3a", "y": "#a8843a", "Y": "#cdaa5a", "c": "#5f7d7a",
         "C": "#8fada4", "q": "#e7e3d6", "Q": "#fffdf4"}
block("petrified_log", pal(PETRI), """
5643 o542 6o54 3o43
4532 o431 5o43 2o32
o4R2 1o32 4o3y 21o4
o3R1 1o43 3oy2 1o53
54o2 2o54 2o32 o542
43o1 3o43 1o21 o431
32o5 3o65 42o5 3oR4
21o4 2o54 31o4 2oR3
4o53 2o54 3c4o 4o53
3o42 1o43 2c3o 3o42
4o3o 2o5R 2o43 2o31
3o2o 1o4R 1o32 1o2o
54o4 3o43 o543 o54o
43o3 2o32 o432 o43o
5o43 o5y3 4o21 54o3
4o32 o4y2 3o1o 43o2
""")
block("petrified_log_top", pal(PETRI), """
o122 2121 2112 21oo
1455 4554 5445 4521
2543 3333 3333 3451
25r3 RRRR RRRR 3352
253R yyyy yyyy R352
153R ycCC CCcy R351
253R yC54 45Cy R352
253R yC4q Q4Cy R352
153R yC4Q q4Cy R351
253R yC54 45Cy R352
253R ycCC CCcy R352
153R yyyy yyyy R351
2533 RRRR RRRR 3352
2543 3333 3333 3451
1455 4554 5445 4521
oo12 1121 2112 21oo
""")

# ====================================================================== Amberwood: a vanilla-style wood set
# Drawn the vanilla way (16 x 16, a handful of colours per texture, light from the top-left, low contrast): honey-gold
# wood (planks between golden acacia and oak) and a muted sandy grey-green bark, a desert tree, with thin amber resin
# streaks in its crevices. Planks: four boards (three rows of grain and a dark seam row), one butt joint each,
# staggered. Log side: vertical bark plates between wandering crevices. Log top: square growth rings inside a bark
# rim. Stripped: the same wood, smooth, with a fine vertical grain. Doors, trapdoor, signs and boats reuse the ramps.
# wood (dark -> light); the log tops use the same colours on letter keys so they can sit beside the bark digits
WOOD_RAMP = ["#6a3f17", "#82511f", "#966025", "#a66d2a", "#b57a30", "#c38736", "#cf943f"]
WOOD = {str(i): c for i, c in enumerate(WOOD_RAMP)}
WOODL = dict(zip("defghij", WOOD_RAMP))
# bark: deep crevices, olive-sand plates, pale sandy lights; resin: thin amber streaks and beads
BARK = {"0": "#3d3c2e", "1": "#504f3e", "2": "#636350", "3": "#76775f", "4": "#898b70", "5": "#9d9e82",
        "6": "#b1b093"}
BARKL = dict(zip("zyxwvut", BARK.values()))
RESIN = {"a": "#9c5a1a", "A": "#cf8a2c", "Y": "#f2c35c", "D": "#6e3a12"}
IRON = {"i": "#3f3f48", "I": "#6d6d78", "L": "#a3a3ad"}                     # hinges, handles, the boat-chest lock
CHAIN = {"c": "#2b2d3a", "C": "#4b4f63", "K": "#717892"}                     # hanging-sign chains

PLANKS = """
5665 6656 5626 6556
4554 4543 5414 5543
3443 3432 4323 4432
1012 1101 0110 1201
6562 6556 6665 6565
5441 5433 4554 4554
4332 4432 3443 3443
0112 1010 1201 0110
5656 6565 6656 6265
4545 5434 5545 4154
3434 4323 4434 3243
1010 1201 0110 1012
6655 6626 5665 6656
5544 5414 4554 5445
4433 4323 3443 4334
0110 1001 2101 1010
"""
block("amberwood_planks", pal(WOOD), PLANKS)

LOG_SIDE = """
3045 4314 5304 4312
3065 4314 4305 4312
2044 4304 4315 4302
2144 3305 4314 4203
3152 3205 4314 3203
3054 3215 3204 3313
3044 3314 3205 4312
2043 3404 4205 4312
2043 4420 4314 4202
2164 4320 4314 3203
3154 3321 5304 3203
3044 3220 5305 4313
3044 4204 4205 6312
2045 4304 4214 4312
2145 4314 5314 3302
3145 4314 5304 4302
"""
# two thin resin streaks run in the crevices of every log
LOG_STREAKS = """
.... .... .... ....
.... ..A. .... ....
.... ..a. .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... ..A. ....
.... .... ..a. ....
.... .... ..a. ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""
block("amberwood_log", pal(BARK, RESIN), over(LOG_SIDE, LOG_STREAKS))
# resin=true: amber oozing from the crevices, glossy beads that run down in thin drips (over the same bark)
block("amberwood_log_resin", pal(BARK, RESIN), over(over(LOG_SIDE, LOG_STREAKS), """
.... .... .... ....
.... ..A. .... ....
.... .YA. .... ....
.... ..a. .... ....
.... ..a. .... ....
.... ..D. .YA. ....
.... .... ..A. ....
.... .... ..a. ....
.... .... ..a. ....
.... .... ..D. .YA.
.Y.. .... .... ..a.
.A.. .... .... ..a.
.a.. .... .... ..D.
.D.. .... .... ....
.... .... .... ....
.... .... .... ....
"""))
# the cut end: a bark rim round square growth rings, light and dark, a darker heart
LOG_RINGS = """
1112 0021 1122 2111
2jjj ijjj jjij jjj0
0jff ffef ffff fej1
0jfh hhhh hghh hfj1
0ifh iiii iiii hfj1
2jfh iijh hhii hfi2
2jfg iihg ghii hfj2
2jfh iigf fhii gfj1
1jfh iihf fhji hfj0
0ifh iihg hhii hfj1
2jfh iiii iiii hfj1
1jfg iiii iiij hfi2
1jfh hhgh hhhh hfj2
2jfe ffff ffef ffj1
2jjj jijj jjjj ijj1
1011 1011 1002 2010
"""
block("amberwood_log_top", pal(BARK, WOODL), LOG_RINGS)
# stripped: the smooth honey wood with a fine vertical grain; the top keeps the rings inside a wooden rim
STRIPPED_SIDE = """
5456 5545 4565 5455
5456 5545 4565 5445
5446 5535 4465 5455
4456 5535 4565 6455
5456 4535 4565 6454
5455 4545 4556 5454
5455 4545 5556 5444
5465 4546 5455 5454
4465 4546 5455 4454
4565 5546 5355 4554
4565 5545 5355 4564
4566 5545 4355 4564
5456 5545 4365 4564
5456 5445 4465 5554
5456 5445 4565 5454
5456 5545 4565 5455
"""
block("stripped_amberwood_log", pal(WOOD), STRIPPED_SIDE)
block("stripped_amberwood_log_top", pal(WOODL), """
eeef eedf efee fede
fjjj ijjj jjij jjjd
efff ffef ffff fejd
efgh hhhh hghh hfje
dife iiii iiii hfje
ejfh iijh hhii hfie
ejfg iihg ghii hfje
ejfh iigf fhii gfjd
fjfh iihf fhji hfje
eifh iihg hhii hfjd
ejfh iiii iiii hfje
fjfg iiii iiij hfie
ejfh hhgh hhhh hfjd
ejfe ffff ffef ffje
ejjj jijj jjjj ijjd
deed dedd edde dded
""")

# doors and trapdoor: a lit left edge and top, a shaded right edge, recessed panels (shadow on the top and left
# inner edges, light on the bottom and right) and window holes; iron hinges on the left, a handle on the right
DOORS = pal(WOOD, IRON)
block("amberwood_door_top", DOORS, """
5665 6656 6665 6652
5433 3433 3343 3321
I410 0000 0000 0231
i410 ..05 20.. 0531
541. ...5 2... .531
541. ...5 2... .531
541. ...5 2... .531
541. ...5 2... .531
541. ...5 2... .531
5415 5555 5555 5531
5433 3433 3343 3321
5410 0000 0000 0231
5414 5445 4544 5531
5413 4334 3433 4531
5414 4544 5445 4531
5413 3433 4334 3531
""")
block("amberwood_door_bottom", DOORS, """
5414 5445 4544 5531
5413 4334 3433 L531
5414 4544 5445 i531
5413 3433 4334 3531
5414 5445 4544 5531
5415 5555 5555 5531
5433 3433 3343 3321
5410 0000 0000 0231
5414 5445 4544 5531
5413 4334 3433 4531
5414 4544 5445 4531
I413 3433 4334 3531
i414 5445 4544 5531
5415 5555 5555 5531
5433 4333 3433 3321
2111 1111 1111 1110
""")
block("amberwood_trapdoor", DOORS, """
5666 6566 6656 6652
5433 3433 3343 3321
5410 0000 0000 0231
541. ...5 2... .531
541. ...5 2... .531
5415 5555 5555 5531
5433 3433 3343 3321
5444 5445 4544 5421
5433 4334 3433 4321
5433 3433 3343 3321
5410 0000 0000 0231
541. ...5 2... .531
541. ...5 2... .531
5415 5555 5555 5531
5433 4333 3433 3321
2111 1111 1111 1110
""")

# item icons: the door, signs and boats as vanilla draws them (no outline on the door, a dark rim on the signs and
# boats, carved text marks on the boards, the sign post in bark)
ITEMW = pal(WOOD, BARKL, IRON, CHAIN, k="#4a2a10", o="#3b2410")
item("amberwood_door", ITEMW, """
...5 6666 6656 2...
...5 4000 0002 1...
...I 4..5 2..5 1...
...i 4..5 2..5 1...
...5 4..5 2..5 1...
...5 4555 5555 1...
...5 4333 3332 1...
...5 4000 0005 1...
...5 4144 545L 1...
...5 4133 434i 1...
...5 4144 5455 1...
...5 4555 5555 1...
...5 4333 3332 1...
...I 4144 5455 1...
...i 4555 5555 1...
...2 1111 1111 0...
""")
item("amberwood_sign", ITEMW, """
.... .... .... ....
.... .... .... ....
.566 6566 6656 652.
.544 4344 4434 441.
.5kk k4kk 4kk4 k31.
.433 3433 3343 331.
.5kk kk3k k4kk 431.
.433 3323 3332 331.
.4k4 kk4k k4kk 331.
.322 2212 2221 220.
.111 111v x111 110.
.... ...v x... ....
.... ...v x... ....
.... ...u x... ....
.... ...v y... ....
.... ...y z... ....
""")
item("amberwood_hanging_sign", ITEMW, """
.... .... .... ....
.566 6566 5665 652.
.222 2122 2212 221.
..cK .... .... Kc..
..Cc .... .... cC..
..cK .... .... Kc..
..Cc .... .... cC..
..56 6566 5665 62..
..4k k4kk 4kk4 k1..
..43 3433 3343 31..
..5k kk4k k4kk 41..
..43 3323 3332 31..
..4k 4kk4 k4kk 31..
..43 3433 3343 31..
..21 1111 1111 10..
.... .... .... ....
""")
BOAT_ICON = """
.... .... .... ....
.... .... .... ....
.... .... ...o o...
.... .... ..o6 5o..
.... .... .o65 4o..
.... .... o542 o...
.o.. .... 42oo ..o.
o5o. ...o 3o.. .o5o
o64o oooo 2ooo o46o
.o65 6656 5665 65o.
.okk kkkk 2kkk kko.
.o45 5455 3554 54o.
..o4 4344 4434 4o..
...o 3323 3332 o...
.... oooo oooo ....
.... .... .... ....
"""
item("amberwood_boat", ITEMW, BOAT_ICON)
item("amberwood_chest_boat", ITEMW, over(BOAT_ICON, """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .ooo ooo. ....
.... .o65 65o. ....
.... .o44 44o. ....
.... .ooL Loo. ....
.... .o43 i3o. ....
.... .o32 32o. ....
.... .ooo ooo. ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
"""))


# ====================================================================== Amberwood signs and boats (vanilla UV layouts)
# Entity textures cut from the hand-drawn tiles above the way vanilla's are: each box face (ModelPart box unwrap:
# top (u+d, v), bottom (u+d+w, v), right (u, v+d), front (u+d, v+d), left (u+d+w, v+d), back (u+2d+w, v+d)) is
# filled from a tile at an offset, so seams and grain line up across neighbouring faces.
def tiled(grid, w, h, ox=0, oy=0, sideways=False):
    """A w x h window into a 16 x 16 tile grid (wrapping), optionally turned sideways (grain along x)."""
    rows = parse(grid) if isinstance(grid, str) else grid
    if sideways:
        rows = ["".join(r[x] for r in rows[::-1]) for x in range(len(rows[0]))]
    return ["".join(rows[(y + oy) % len(rows)][(x + ox) % len(rows[0])] for x in range(w)) for y in range(h)]


def unwrap(u, v, w, h, d):
    return {"top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d), "right": (u, v + d, d, h),
            "front": (u + d, v + d, w, h), "left": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h)}


def paint_box(im, palette, u, v, w, h, d, **faces):
    """faces: name -> rows (list of strings) or a callable (fw, fh) -> rows."""
    for face, (x, y, fw, fh) in unwrap(u, v, w, h, d).items():
        src = faces.get(face, faces.get("all"))
        if src is None or fw == 0 or fh == 0:
            continue
        rows = src(fw, fh) if callable(src) else src
        im.alpha_composite(draw(rows, palette, (fw, fh), f"box {u},{v} {face}"), (x, y))


def framed(rows, edge="0"):
    """The same rows with a 1 px dark frame (chest faces)."""
    h, w = len(rows), len(rows[0])
    return ["".join(edge if x in (0, w - 1) or y in (0, h - 1) else rows[y][x] for x in range(w)) for y in range(h)]


SIGNP = pal(WOOD, BARKL, CHAIN, IRON, k="#3a2410")
# standing sign: the board in planks (three boards on the face), the post in bark
sign = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
paint_box(sign, SIGNP, 0, 0, 24, 12, 2,
          front=tiled(PLANKS, 24, 12, 0, 0), back=tiled(PLANKS, 24, 12, 5, 4),
          top=lambda w, h: tiled(PLANKS, w, h, 3, 0), bottom=lambda w, h: tiled(PLANKS, w, h, 7, 13),
          right=lambda w, h: tiled(PLANKS, w, h, 9, 0), left=lambda w, h: tiled(PLANKS, w, h, 2, 4))
BARK_TILE = LOG_SIDE.translate(str.maketrans("0123456", "zyxwvut"))
RINGS_TILE = LOG_RINGS.translate(str.maketrans("0123456defghij", "zyxwvut0123456"))
paint_box(sign, SIGNP, 0, 14, 2, 14, 2, all=lambda w, h: tiled(BARK_TILE, w, h, 5, 1),
          top=tiled(RINGS_TILE, 2, 2, 7, 7), bottom=tiled(RINGS_TILE, 2, 2, 7, 7))
put("textures/entity/signs/amberwood.png", sign)

# hanging sign: a stripped-log beam, iron chains (straight pairs and a V), a board of stripped wood
STRIP_TILE = STRIPPED_SIDE
hang = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
paint_box(hang, SIGNP, 0, 0, 16, 2, 4, all=lambda w, h: tiled(STRIP_TILE, w, h, 2, 5, sideways=True),
          right=tiled(parse(STRIPPED_SIDE.replace("6", "3")), 4, 2, 0, 0),
          left=tiled(parse(STRIPPED_SIDE.replace("6", "3")), 4, 2, 4, 0))
CHAIN_LINKS = [".K.", ".C.", "CKc", "C.c", "Ccc", ".c."]
for u in (0, 6):
    paint_box(hang, SIGNP, u, 6, 3, 6, 0, front=CHAIN_LINKS, back=CHAIN_LINKS)
V_CHAIN = ["K..........K", ".c........c.", "..K......K..", "...c....c...", "....K..K....", ".....cc....."]
paint_box(hang, SIGNP, 14, 6, 12, 6, 0, front=V_CHAIN, back=V_CHAIN)
paint_box(hang, SIGNP, 0, 12, 14, 10, 2, front=tiled(STRIP_TILE, 14, 10, 1, 2), back=tiled(STRIP_TILE, 14, 10, 6, 4),
          top=lambda w, h: tiled(STRIP_TILE, w, h, 0, 0, sideways=True),
          bottom=lambda w, h: tiled(STRIP_TILE, w, h, 3, 6, sideways=True),
          right=lambda w, h: tiled(STRIP_TILE, w, h, 4, 3), left=lambda w, h: tiled(STRIP_TILE, w, h, 9, 3))
put("textures/entity/signs/hanging/amberwood.png", hang)
# the hanging sign edit screen: the beam, two chains, the board (stripped wood, a darker rim)
put("textures/gui/hanging_signs/amberwood.png", draw(parse("""
5656 6566 5665 6565
2212 2122 1221 2122
..cK .... .... Kc..
..Cc .... .... cC..
..cK .... .... Kc..
..Cc .... .... cC..
2333 3233 3323 3332
3545 6545 5456 5453
3454 5455 4565 4543
3545 6545 5456 5453
3545 5545 5455 6453
3456 5456 4546 5543
3455 5455 4545 5443
3545 6545 5456 5453
3454 5455 4565 4543
2222 2122 2212 2221
"""), SIGNP, (16, 16), "gui/hanging_signs/amberwood"))


# boats: the hull boxes in planks (the floor's long face too), the paddles in stripped wood
def boat_texture(size):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    plank = lambda ox, oy: (lambda w, h: tiled(PLANKS, w, h, ox, oy))  # noqa: E731
    strip = lambda ox, oy, s=False: (lambda w, h: tiled(STRIP_TILE, w, h, ox, oy, sideways=s))  # noqa: E731
    paint_box(im, SIGNP, 0, 0, 28, 16, 3, all=plank(0, 0), back=plank(6, 2), right=plank(3, 1), left=plank(11, 5))
    paint_box(im, SIGNP, 0, 19, 18, 6, 2, all=plank(4, 0), back=plank(9, 4))
    paint_box(im, SIGNP, 0, 27, 16, 6, 2, all=plank(2, 8), back=plank(7, 12))
    paint_box(im, SIGNP, 0, 35, 28, 6, 2, all=plank(1, 4), back=plank(8, 8))
    paint_box(im, SIGNP, 0, 43, 28, 6, 2, all=plank(5, 12), back=plank(12, 0))
    for v in (0, 20):
        paint_box(im, SIGNP, 62, v, 2, 2, 18, all=strip(0, 3, True))
        paint_box(im, SIGNP, 62, v, 1, 6, 7, all=strip(5, 2), top=strip(1, 1), bottom=strip(1, 1))
    return im


put("textures/entity/boat/amberwood.png", boat_texture((128, 64)))
chest_boat = boat_texture((128, 128))
CHEST_EDGE = "o"
CHESTP = pal(SIGNP, o="#2e1d0d", d="#1e140a")
paint_box(chest_boat, CHESTP, 0, 76, 12, 8, 12, all=lambda w, h: framed(tiled(PLANKS, w, h, 2, 8), CHEST_EDGE),
          top=lambda w, h: ["d" * w] * h)
paint_box(chest_boat, CHESTP, 0, 59, 12, 4, 12, all=lambda w, h: framed(tiled(PLANKS, w, h, 4, 0), CHEST_EDGE),
          bottom=lambda w, h: ["d" * w] * h)
paint_box(chest_boat, CHESTP, 0, 59, 2, 4, 1, top=["LI"], bottom=["Ii"], right=["L", "I", "I", "i"],
          left=["I", "I", "i", "i"], front=["LI", "Ii", "Ii", "ii"], back=["LI", "Ii", "Ii", "ii"])
put("textures/entity/chest_boat/amberwood.png", chest_boat)

# amberwood_bloom: the Amberwood's flower, planted as its sapling (it grows into the tree) and worn as the crown of
# flowers on every trunk and arm top. Drawn like a vanilla sapling (no outline, a few tones, lit from the top-left):
# a fleshy sage stem that forks into three waxy cup flowers, pale cream petals blushing dusty apricot in the shade, a
# yellow heart of stamens, a few pale spines and a little leaf on the stem.
BLOOM = {"p": "#b0846e", "P": "#cc9f84", "q": "#e4c2a2", "Q": "#f3dec4", "h": "#fff6e6",      # petals
         "c": "#f3d36c", "C": "#c6913a", "k": "#8a5a3c",                                    # heart, throat
         "t": "#3f4c33", "T": "#596a45", "u": "#788c5c", "U": "#9db07c", "x": "#ece6cf"}      # stem, spines
BLOOM_PLANT = """
.... .... .... ....
.... ..hQ Qh.. ....
.... .hQq qQh. ....
.... qQcc ccQq ....
.... pqcC Ckqp ....
.hQ. .pqk kqp. ....
hQqQ h.pP Pp.. hQh.
qcCq Q..u T..h QqQq
pkCq p.uU Tt.q cCcq
.pqp ..uU Tt.p kCqp
..ux ..uU Tt.. pqp.
..UT u.uU Ttu. Tu..
...U Tu.U TuT. x...
.... UTuU TtT. ....
.... .UuU Tt.. ....
.... .tuT Tt.. ....
"""
block("amberwood_bloom", pal(BLOOM), BLOOM_PLANT)
item("amberwood_bloom", pal(BLOOM), BLOOM_PLANT)
# seen from above (the flat crown in the bloom's block model, 12 px up): the three open cups of the plant with
# buds and sage bracts between them, kept to the middle so it suits a planted bloom and a tree crown alike
block("amberwood_bloom_top", pal(BLOOM), """
.... .... .... ....
.... .... .... ....
.... .... ...q Qq..
.... .... ..qh Qcq.
.... .... ..qc Ckq.
.... ...q Qq.q kq..
.... ..qh Qcq. p...
.... ..qc Ckq. ....
.... uT.q kq.. ....
...q Qq.. p.Tu ....
..qh Qcq. .... ....
..qc Ckq. .... ....
...q kq.. .... ....
.... p... .... ....
.... .... .... ....
.... .... .... ....
""")
# the old ribbed sapling (amberwood_sapling, kept for its block id) in the earlier cactus-rib colours
RIB = {"1": "#332c26", "2": "#4a4238", "3": "#5f5c4b", "4": "#76785f", "5": "#8c9375", "6": "#a3ab8c",
       "7": "#bfc4a6", "w": "#b3aa92", "W": "#d3cbb6", "x": "#ddd6c4"}
# the sapling: a little ribbed sprout, a barrel of four soft ribs, a pale spine or two and a first bud on top
block("amberwood_sapling", pal(RIB, BLOOM, o="#3a332b"), """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... ..qQ .... ....
.... ..Pp .... ....
.... x.uT .x.. ....
.... .o54 3o.. ....
.... .o45 34o. ....
.... o453 2453 ....
.... o4W3 2453 ....
.... o453 24W3 ....
.... o453 2453 ....
.... .o53 243. ....
.... ..oo oo.. ....
""")
# amberwood_leaves (the cactus-like tree has none; kept for the block id): muted sage succulent leaves in clusters,
# cut out between them
LEAVES = {"o": "#3a3a2e", "1": "#4f5240", "2": "#646b52", "3": "#7a8466", "4": "#919b7a", "5": "#a8b190",
          "6": "#c0c6a8", "7": "#d8dbc2"}
block("amberwood_leaves", pal(LEAVES), """
.643 1.56 4..6 543.
6754 31.6 543. 7643
5643 2o.5 4321 6531
.32. ..54 3o.5 43o.
.5.. 6754 32.6 7543
5643 5643 1o.5 6432
4321 4321 o..4 321.
.1o. .1o. .65. .o..
..65 4..6 7543 ..6.
.675 43.5 6432 .754
6543 21.4 4321 6643
5431 o..3 1o.. 5432
.21. .654 3..6 431.
..6. 6754 3.67 54..
.754 5643 2.56 43.6
6543 .32. ..43 2..5
""")
# ====================================================================== blood stain: a thin, half-dried red layer
BLOOD_T = {"k": "#3a0712b0", "r": "#5c0e1cc0", "R": "#85162ac8", "e": "#a8202fd0", "E": "#d0404ad8",
           "s": "#4a0a1670"}
block("blood_stain", pal(BLOOD_T), """
.... .... .... ....
.... .... .s.. .r..
..s. .... .... ....
.... ..rR Rr.. ....
.... .rRe ERr. ....
...s rReE eRRr ....
.... rReR RRek ....
.... .rRR Rrk. .s..
.... ..rR rk.. ....
.... .... Rr.. ....
..r. .... .rk. ....
.rRr .... .... .rr.
.rk. .... .... rRer
.... ..s. .... .rk.
.... .... .r.. ....
.... .... .... ....
""")

# ====================================================================== items (16x16)
# An amber chunk: an irregular knapped nugget, glassy facets, a bubble, a bright rim, a dark red-brown outline.
# honey-like, as the blocks: a solid dark rim, a golden body at about 70-80% opacity, solid glints
HONEY = {"1": "#6b3a14", "2": "#8a5020", "3": "#a8692c", "4": "#c3843a", "5": "#d89d4c", "6": "#e8b55e",
         "7": "#f3cb78", "8": "#fbe2a4", "9": "#fff4d8"}
CHUNK = {"o": "#3e2410ec", **translucent(HONEY, ["e0", "d0", "c4", "bc", "c4", "d0", "e4", "f4", "fc"])}
item("amber_chunk", pal(CHUNK), """
.... .... .... ....
.... .... .... ....
.... .... ooo. ....
.... ..oo 877o ....
.... .o88 7665 o...
.... o879 7655 4o..
...o 8796 5554 3o..
..o8 7765 5443 3o..
..o7 7655 4433 2o..
..o6 6554 4332 o...
...o 5543 3322 o...
...o 4432 3221 o...
.... o332 221o ....
.... .ooo 11o. ....
.... .... oo.. ....
.... .... .... ....
""")
# An amber shard (amber blocks break into these): a long jagged splinter of honey amber, broken square at the base
# and snapped to a sharp point, a ridge down its length between a lit facet and a deep red-amber one, a cream
# highlight along the ridge, a chipped notch, a dark red-brown outline. Solid, so it reads at 1x.
SHARD = {"o": "#4a1a0c", "1": "#76300f", "2": "#9c4512", "3": "#c06118", "4": "#d98020", "5": "#eb9e2e",
         "6": "#f6bd4c", "7": "#fddc86", "8": "#fff6d6"}
item("amber_shard", pal(SHARD), """
.... .... .... ....
.... .... .... .o..
.... .... .... o8o.
.... .... ...o 783o
.... .... ..o6 783o
.... .... .o66 783o
.... .... o667 832o
.... ...o 6678 32o.
.... ..o6 6783 21o.
.... .o66 7832 1o..
...o 5667 8322 o...
..o4 5678 3221 o...
.o44 5783 221o ....
.o34 4583 1o.. ....
..o3 321o .... ....
...o ooo. .... ....
""")




# An Amberwood seed (as the 3D amber_seed model): a ribbed, pointed ovoid husk, lit from the left, a little
# pale-gold sprout curling out of the top like a fiddlehead
SEED = {"o": "#2a120c", "1": "#4a2414", "2": "#6b381e", "3": "#8a4f29", "4": "#a86836", "5": "#c4864a",
        "6": "#d9a25c", "7": "#efc777", "s": "#7d7c44", "S": "#bdb978"}
item("amberwood_seed", pal(SEED), """
.... .... .... ....
.... .... .sS. ....
.... .... S..s ....
.... .... s.S. ....
.... .... s... ....
.... ..oo oo.. ....
.... .o76 54o. ....
.... o765 543o ....
...o 7656 5432 o...
...o 6565 6432 o...
...o 6565 4321 o...
...o 5545 4321 o...
.... o454 321o ....
.... .o43 21o. ....
.... ..o2 1o.. ....
.... ...o o... ....
""")

# ====================================================================== mob effect icon (18x18)
# Immunity: an amber shield with a drop of blood sealed in it, a cream glint, a dark red-brown rim.
put("textures/mob_effect/immunity.png", draw(parse("""
.ooo oooo oooo oooo o.
o988 7777 6666 5554 4o
o8kk kkkk kkkk kkkk 3o
o8kk kkkk rkkk kkkk 3o
o7kk kkkr Rrkk kkkk 3o
o7kk kkkr Rrkk kkkk 3o
o7kk kkrR eRrk kkkk 3o
o7kk krRe EeRr kkkk 2o
o6kk krEW eeRr kkkk 2o
.o6k krEF eeRr kkk2 o.
.o6k krRe eeRr kkk2 o.
.o5k kkrR RRrk kkk2 o.
..o5 kkkr rrkk kk2o ..
..o5 kkkk kkkk kk1o ..
...o 4kkk kkkk k1o. ..
.... o4kk kkkk 1o.. ..
.... .o43 kk21 o... ..
.... ..oo oooo .... ..
"""), pal(AMBER, BLOOD, o="#2e0b09", k="#2a0a10", W="#fff4ea"), (18, 18), "immunity"))

# ====================================================================== particles (8x8)
# blood_drip: a drop gathers and hangs, falls as a teardrop, lands as a small splat (dark red, a wet glint)
DRIP = pal(k="#3a0814", r="#6a1222", R="#951c2c", e="#c22c38", F="#ff8a7a")
frames("blood_drip", DRIP, ["""
..rrrr..
...rR...
...rR...
..rReR..
.rReFer.
.rReeRk.
..rRRk..
...kk...
""", """
........
...r....
...R....
..rRr...
..ReR...
..RFek..
..rRek..
...kk...
""", """
........
........
........
........
...r..r.
.r.rRk..
.rReFeRr
..kRRkk.
"""])
# amber_glint: a golden twinkle: a spark, a cross, a four-point star with a hot cream core, fading back
GLINT = pal(a="#c7651690", A="#eea32fc8", b="#f8c454e0", Y="#ffe28ff0", W="#fffdf2ff")
frames("amber_glint", GLINT, ["""
........
........
........
...AY...
...YA...
........
........
........
""", """
........
...a....
...A....
.aAWYa..
...Y....
...a....
........
........
""", """
...a....
...A....
...b....
aAbWWbAa
...W....
...b....
...A....
...a....
""", """
........
........
...a....
..aYa...
...a....
........
........
........
"""])
# cave_dust: faint drifting motes of fossil dust (beige-grey, low alpha)
DUST = pal(d="#b8a89640", D="#cfc0ac60", L="#e6dccb80")
frames("cave_dust", DUST, ["""
........
........
...dD...
..dLDd..
...Dd...
........
........
........
""", """
........
.d......
........
....dD..
...dLd..
....d...
........
......d.
""", """
........
........
..d.....
........
....D...
...dL...
........
........
"""])


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


def contact_sheet(paths, dst, scale=8, cols=4):
    """Each sprite at `scale`x on a checkerboard and on dark, a 3x3 tiling for blocks, and 1x/2x on vanilla grey."""
    tiles = []
    for rel in paths:
        im = OUT[rel]
        w, h = im.size
        big = im.resize((w * scale, h * scale), Image.NEAREST)
        chk = _on(checker(big.size, (156, 156, 160, 255), (118, 118, 124, 255), cell=scale), big)
        dark = _on(Image.new("RGBA", big.size, (24, 26, 34, 255)), big)
        parts = [chk, dark]
        if "/block/" in rel:
            tile = Image.new("RGBA", (w * 3, h * 3), (0, 0, 0, 0))
            for ty in range(3):
                for tx in range(3):
                    tile.alpha_composite(im, (tx * w, ty * h))
            tile = tile.resize((w * 3 * scale // 3, h * 3 * scale // 3), Image.NEAREST)
            parts.append(_on(Image.new("RGBA", tile.size, (40, 44, 52, 255)), tile))
        one = Image.new("RGBA", (w + 4, h + 4), (139, 139, 139, 255))
        one.alpha_composite(im, (2, 2))
        two = one.resize((one.width * 2, one.height * 2), Image.NEAREST)
        cw = sum(p.width for p in parts) + 6 * len(parts) + two.width
        cell = Image.new("RGBA", (cw, max(big.height, two.height + one.height + 6) + 18), (40, 40, 46, 255))
        x = 0
        for p in parts:
            cell.paste(p, (x, 18))
            x += p.width + 6
        cell.paste(one, (x, 18))
        cell.paste(two, (x, 18 + one.height + 6))
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


def particle_strips(dst, scale=16):
    names = sorted({rel.split("/")[-1].rsplit("_", 1)[0] for rel in OUT if "/particle/" in rel})
    rows = []
    for n in names:
        fr = sorted((rel for rel in OUT if rel.startswith(f"textures/particle/{n}_")),
                    key=lambda r: int(r.rsplit("_", 1)[1][:-4]))
        ims = [OUT[r] for r in fr]
        tw, th = ims[0].width * scale, ims[0].height * scale
        row = Image.new("RGBA", (180 + len(ims) * (tw * 2 + 12), th + 8), (34, 34, 40, 255))
        ImageDraw.Draw(row).text((4, 4), f"{n} x{len(ims)}", fill=(235, 235, 235, 255))
        for i, im in enumerate(ims):
            big = im.resize((tw, th), Image.NEAREST)
            x = 180 + i * (tw * 2 + 12)
            row.paste(_on(checker((tw, th), (156, 156, 160, 255), (118, 118, 124, 255), cell=scale), big), (x, 4))
            row.paste(_on(Image.new("RGBA", (tw, th), (24, 26, 34, 255)), big), (x + tw + 2, 4))
        rows.append(row)
    sheet = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), (28, 28, 33, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(dst)
    return dst


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
        a.preview.mkdir(parents=True, exist_ok=True)
        print("sheet:", particle_strips(a.preview / "amber_particles.png"))
        blocks = sorted(r for r in OUT if "/block/" in r)
        print("sheet:", contact_sheet(blocks, a.preview / "amber_blocks.png", cols=3))
        rest = sorted(r for r in OUT if "/item/" in r or "/mob_effect/" in r)
        print("sheet:", contact_sheet(rest, a.preview / "amber_items.png", cols=3))


if __name__ == "__main__":
    main()
