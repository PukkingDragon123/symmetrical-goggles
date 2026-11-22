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
fossil, the resin log) are composed from one hand-drawn base grid and hand-drawn overlay grids (`over`), so they
always match pixel for pixel. Particles are frame sequences `<name>_<i>.png` (frame 0 = birth) plus
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
# gravel and stone: violet-grey shadows, warm grey lights
GRAVEL = {"o": "#2a2530", "1": "#3e3843", "2": "#555057", "3": "#6f686c", "4": "#8a8180", "5": "#a69c95",
          "6": "#c3b8ad", "7": "#dcd2c4"}
BLOOD = {"k": "#2d0710", "r": "#58101c", "R": "#82182a", "e": "#ad2433", "E": "#d84444", "F": "#ff8a78"}


def translucent(ramp, alphas):
    """The same colours with alpha (two hex digits per entry)."""
    return {k: v + a for (k, v), a in zip(ramp.items(), alphas)}


# ====================================================================== amber block: thick, golden honey
# The game draws a real 3D mosquito or seed inside the block (a block-entity renderer). The amber reads like thick
# honey, about as see-through as vanilla's honey block: a golden body at 60-72% opacity, a soft glow in the middle
# where light comes through (lighter but no more opaque, so a trapped thing still shows dark there), deepening to
# dark honey at the bottom right; a solid lit rim (top/left) and shaded rim (bottom/right), a soft sheen, slow round
# bubbles. The seed and mosquito variants are the same plain amber.
HONEY_BLOCK = {
    "c": "#dfa246b8", "b": "#cc8a34b0", "a": "#b47228a8", "d": "#985c20a0", "e": "#7e4a1a9a",      # the honey body
    "g": "#ebb95aa0", "G": "#f4cd769a",                                                             # inner glow
    "9": "#fff2cdf0", "8": "#f9dd98e8", "7": "#f1c770e0", "6": "#e2ad52d8",                          # lit rim
    "3": "#a2652ad8", "2": "#83501ee0", "1": "#653d18e8",                                           # shaded rim
    "S": "#fff0c8dc", "s": "#f9dea2cc",                                                             # sheen
    "O": "#fff6dcec", "o": "#f6d690d0", "h": "#efc472c4", "q": "#94581ec8",                          # bubbles
}
AMBER_BLOCK = """
9888 8888 8888 8876
877c cccc cccb bbb3
8cSS sccc ccbb bbb2
8sSc cccc cbbb bba2
8scc cOcc bbbb baa2
8ccc ccqg ggbb aaa2
8ccc ccgg ggga aaa2
8ccc cbgG GGga aaa2
8ccc bbgG GGga aad2
8ccb bbgg ggga add2
8cbb bbbg ggaO odd2
8bOo bbaa aaao qdd2
8boh oaaa aadd dde2
7bbo qaaa addd dee2
7bba aaaa dddd eee2
6322 2222 2222 2221
"""
for _name in ("amber_block", "amber_block_seed", "amber_block_mosquito"):
    block(_name, pal(HONEY_BLOCK), AMBER_BLOCK)

# ====================================================================== amber fossil: petrified fossils in gravel
# The gravel base, then four dusted stages: the brushed hollow grows and uncovers a petrified seed and the imprint of
# a ginkgo leaf. Fossil colours: d/D dust in the hollow, l/L/v the leaf imprint, p/P/q the stone seed, a amber gleam.
FOSSIL = {"d": "#6f625e", "D": "#9c8d80", "l": "#4a3a33", "L": "#6e5648", "v": "#2e2420", "p": "#3e2a1e",
          "P": "#6e4a30", "q": "#a47650", "a": "#e8a040"}
GRAVEL_BASE = """
6541 o566 5o35 541o
5432 o454 3o24 431o
o32o 1o3o o1o1 o2oo
3o56 65o4 6541 o56o
2o45 543o 5432 o454
1o34 32o1 o321 o343
oo1o o1oo 1oo1 oo2o
566o 4541 o567 6o45
4554 o343 o455 4o34
3433 o232 o344 3o23
o22o 1oo1 1o23 oo12
1o45 65o3 56oo 465o
1o34 54o2 454o 354o
o233 43o1 3432 o43o
oo11 oo2o o121 1o1o
6o45 o3o4 6o4o 56o5
"""
# the fossils as they lie under the gravel (only shown where a stage has brushed the gravel away): the dark imprint of
# a ginkgo leaf with its veins and stem, and a petrified seed with an amber gleam
FOSSILS = """
.... .... .... ....
.... .... .... ....
.lLL l.LL l... ....
lLvL LvLL vl.. ....
.lLv LvLv Ll.. ....
..lL vvvL l... ....
...l LvvL .... ....
.... lvl. .... ....
.... .v.. ..pp ....
.... ..v. .pqP p...
.... ...v pqPP p...
.... .... pPPa p...
.... .... .pPP p...
.... .... ..pp ....
.... .... .... ....
.... .... .... ....
"""
# brushed-away areas per stage: '#' = gravel removed (dust or fossil shows), stage 0 only a scratch
REVEAL = ["""
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .#.. .... ....
.... ##.. .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... ..#. ....
.... .... .##. ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""", """
.... .... .... ....
.... .... .... ....
.... ##.. .... ....
...# ###. .... ....
..## ###. .... ....
...# ##.. .... ....
.... .... .... ....
.... .... .... ....
.... .... ..## ....
.... .... .### ....
.... .... ###. ....
.... .... .##. ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""", """
.... .... .... ....
.... ###. .... ....
..## #### .... ....
.### #### #... ....
.### #### ##.. ....
.### #### ##.. ....
..## #### #... ....
...# ###. .... ....
.... ###. .### ....
.... .#.. #### #...
.... .... #### #...
.... .... .### #...
.... .... ..## ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
""", """
.... .... .... ....
.### #### .... ....
#### #### ##.. ....
#### #### ###. ....
#### #### ###. ....
#### #### ###. ....
.### #### ##.. ....
..## #### #### #...
...# #### #### ##..
...# #### #### ##..
.... #### #### ##..
.... .### #### ##..
.... .... #### ##..
.... .... .### #...
.... .... .... ....
.... .... .... ....
"""]


def dusted(stage):
    """Compose one stage: gravel where not revealed; in the hollow the fossil, else dust (darker at the rim)."""
    g, f, m = parse(GRAVEL_BASE), parse(FOSSILS), parse(REVEAL[stage])
    rows = []
    for y in range(16):
        row = ""
        for x in range(16):
            if m[y][x] != "#":
                row += g[y][x]
                continue
            if f[y][x] != ".":
                row += f[y][x]
                continue
            rim = any(not (0 <= y + dy < 16 and 0 <= x + dx < 16) or m[y + dy][x + dx] != "#"
                      for dy, dx in ((-1, 0), (0, -1)))
            row += "d" if rim else "D"
        rows.append(row)
    return "\n".join(rows)


for k in range(4):
    block(f"amber_fossil_{k}", pal(GRAVEL, FOSSIL), dusted(k))

# ====================================================================== petrified log: stone-hard fossil wood
# Side: deep vertical bark furrows turned to stone, a clean horizontal fracture (petrified trunks break into
# segments), rust, ochre and chalcedony mineral streaks. Top: stony rings banded with minerals, a quartz heart.
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
1oo1 oo1o 1oo1 o1oo
6566 5665 6556 6566
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

# ====================================================================== Amberwood: a columnar, cactus-like tree
# A saguaro-like trunk in muted desert colours: dusty sage crests, olive flanks, grey-brown grooves (hue-shifted:
# warm brown shadows, cool sage lights). Four soft ribs per face (they line up round the corners), a calm stippled
# skin, small felted areoles with a pale spine on every other crest. Amber only in the resin and the heart.
RIB = {"1": "#332c26", "2": "#4a4238", "3": "#5f5c4b", "4": "#76785f", "5": "#8c9375", "6": "#a3ab8c",
       "7": "#bfc4a6", "w": "#b3aa92", "W": "#d3cbb6", "x": "#ddd6c4"}
RESIN = {"Y": "#fbe7b0", "b": "#e2b35e", "A": "#c88c3a", "a": "#9a6428", "D": "#6e451e"}
LOG_SIDE = """
2453 2453 2453 2453
2453 2463 2453 2453
24W3 2453 24W3 2453
2w53 2453 2w53 2453
2453 2453 2453 2463
2453 24W3 2453 24W3
2453 2w53 2453 2w53
2463 2453 2453 2453
2453 2453 2463 2453
2453 2453 2453 2453
24W3 2453 24W3 2453
2w53 2453 2w53 2453
2453 2463 2453 2453
2453 24W3 2453 24W3
2453 2w53 2453 2w53
2453 2453 2453 2463
"""
block("amberwood_log", pal(RIB), LOG_SIDE)
# resin oozing from the grooves between the ribs: honey-gold beads that run down in thin drips and hang as drops
block("amberwood_log_resin", pal(RIB, RESIN), over(LOG_SIDE, """
D... .... .... ....
b... ...a Yb.. ....
a... ...a AA.. ....
.... .... a... ....
.... .... D... ....
...a Yb.. D... ....
...a AA.. b... ....
.... a... a... ....
.... D... .... ....
.... D... ...a Yb..
.... b... ...a AA..
.... a... .... a...
Yb.. .... .... D...
AA.. .... .... b...
a... .... .... a...
D... .... .... ....
"""))
# the cut trunk: the soft rib scallops, a grey-brown rind, pale sage-beige flesh with the ring of woody rods (the
# saguaro's skeleton) and a warm heart of resin
block("amberwood_log_top", pal(RIB, RESIN, f="#b9b596", F="#cdc9ab"), """
2453 2453 2453 2452
4222 2222 2222 2224
5233 3333 3333 3325
3233 fFFF FFFf 3323
2233 F33F F33F 3322
4233 FFFf fFFF 3324
5233 FfaA Aaf3 3325
323f 3FAY YAF3 f323
223f 3FAY bAF3 f322
4233 FfaA Aaf3 3324
5233 FFFf fFFF 3325
3233 F33F F33F 3323
2233 fFFF FFFf 3322
4233 3333 3333 3324
5222 2222 2222 2225
2453 2453 2453 2453
""")
# amberwood_bloom: the crown of flowers on every trunk and arm top. Waxy cup flowers on scaly sage tubes, soft
# apricot-cream petals (dusty rose in the shade), a pale yellow heart of stamens, a muted throat; a closed bud.
BLOOM = {"k": "#7a4e40", "p": "#b5806a", "P": "#cf9d7e", "q": "#e3ba96", "Q": "#efd2b0", "h": "#f8e8d0",
         "c": "#f1dea0", "C": "#fffaec", "s": "#2f2c25", "t": "#4b4a3d", "T": "#66684f", "u": "#848a6a"}
block("amberwood_bloom", pal(BLOOM), """
.... .... .... ....
.... hQ.c .Qh. ....
...Q qQcc cQqQ .qQ.
...p PqQc QqPp .Pq.
.... pPqk qPp. .pP.
.... .pPP Pp.. .uT.
.hQc Qh.u T... .uT.
Qqcc cqQu T... uT..
pPqc qPpu T..u T...
.pPk Pp.u T.uT ....
..pP p..u TuT. ....
...u T..u TT.. ....
.... uT.u T... ....
.... .uTu Ts.. ....
.... suTu Tts. ....
...s uTtu Ttts ....
""")
# seen from above: a crown of open flowers packed between scaly bracts, buds in the gaps
block("amberwood_bloom_top", pal(BLOOM), """
.qQq ...q Q... qQq.
qhcQ p..P p..q hcQp
QcCk P... ...Q cCkP
qQkq p..t T..q Qkqp
.pPp tT.u T..t pPp.
.... uT.q Qq.u T...
.... ..hQ hqP. ....
qQ.t TqQh ccQp ..qQ
Pp.u TQhc CckP tTPp
.... .qQc kcqp uT..
.... ..Pq kpP. ....
.qQq tT.p Pp.t qQq.
qhcQ pT.. tT.q hcQp
QcCk P... uT.Q cCkP
qQkq p..q Q..q Qkqp
.pPp ...P p... pPp.
""")
# the item: one big bloom on its scaly tube, a bud beside it, a dark warm-grey outline
item("amberwood_bloom", pal(BLOOM, o="#4a3a30"), """
.... .... .... ....
...o oo.o oo.. ....
..oh QQoc oQho ....
.oQh QqQc cQqQ o...
.oqQ hQcC cQqP o...
.opP qQcc kqPp o...
..op PqQk qPpo ....
...o pPPP Ppo. oo..
.... ooPp oo.o qQo.
.... .oTu o..o Ppo.
.... .oTu o.ou To..
.... .ouT ooTu o...
.... .ouT uTto ....
.... .otu Tto. ....
.... ..os tso. ....
.... ...o oo.. ....
""")
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
# planks: four boards of weathered grey-tan cactus wood, joints staggered, dark seams, a resin dot in one board
PLANK = {"o": "#3e352c", "1": "#5a4e40", "2": "#73654f", "3": "#8a7b60", "4": "#a19272", "5": "#b8a986",
         "6": "#ccbe9c", "a": "#c88c3a", "Y": "#fbe7b0"}
block("amberwood_planks", pal(PLANK), """
5665 6556 o566 5656
4454 5443 o445 4545
3343 3432 o334 3434
oooo oooo oooo oooo
6556 o665 5656 6556
4545 o544 5445 4454
3434 o433 4334 3343
oooo oooo oooo oooo
5656 6556 5665 o565
4445 4545 4454 o4Ya
3334 3434 3343 o3a3
oooo oooo oooo oooo
656o 5665 6556 5665
454o 4544 5445 4454
343o 3433 4334 3343
oooo oooo oooo oooo
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
