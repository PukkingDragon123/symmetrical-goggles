#!/usr/bin/env python3
"""Winterworks pixel art for the Cold Zone update (mods/winterworks/docs/COLD_UPDATE.md).

    python examples/src/winterworks_cold_art.py                  # write all PNGs + particle jsons
    python examples/src/winterworks_cold_art.py --preview DIR    # also write contact sheets to DIR

Same rules as winterworks_art.py (whose grid helpers this imports): every sprite is a hand-placed
ASCII grid plus a palette, '.' is transparent, spaces inside rows are ignored. Naturalistic and
vanilla-adjacent; hue-shifted ramps (cool violet shadows, warm cream lights), light from the
top-left, dark hue-shifted outlines (never pure black); only glows (frost eyes, cold auras) are
saturated. Palette colours may carry alpha (#rrggbbaa) for vapour, mist and ice.

Particles are frame sequences `<name>_<i>.png` (frame 0 = birth, for `setSpriteFromAge`; the static
variant sets work the same with `pickSprite`) plus `particles/<name>.json`. Entity skins are built
from hand-drawn box faces placed into the vanilla UV layout (`Skin.box`), so the faces always land
where the model samples them.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winterworks_art import ASSETS, SNOW, checker, draw, pal, parse  # noqa: E402  (no side effects)

OUT: dict[str, Image.Image] = {}      # relative path -> image
JSON: dict[str, dict] = {}            # relative path -> json body


def put(path, im):
    OUT[path] = im


# ====================================================================== shared ramps (dark -> light)
# Ice leans cobalt/indigo with cyan highlights (an ice-dragon look): crystal prisms with a bright edge
# and a darker core. Fangs are bone-yellow; fur is drawn in directional strands.
CRYSTAL = {"0": "#151446", "1": "#1f2a78", "2": "#2443a3", "3": "#2a66c6", "4": "#3392dc", "5": "#4bbde9",
           "6": "#8de3f6", "7": "#d0f7fd", "8": "#ffffff"}
FUR = {  # polar bear cream: violet-grey shadows, warm cream lights
    "o": "#3b3446", "1": "#625a6c", "2": "#8f8686", "3": "#bdb096", "4": "#ddd0ae", "5": "#f1e7cc",
    "6": "#fffbee"}
HIDE = {"n": "#3a241d", "N": "#5a3a2c", "t": "#835b44", "T": "#a87f60"}         # tanned skin side, straps
BONE = {"k": "#3a2618", "K": "#6a4a2c", "B": "#9c7a45", "y": "#c6a65e", "Y": "#e4cd8a", "G": "#fbf0c6"}
FROST = {"W": "#ffffff", "w": "#d0f7fd", "l": "#8de3f6", "c": "#4bbde9", "b": "#3392dc", "d": "#2a66c6",
         "g": "#b9ffff"}                                                         # cold light: effects, edges
GLOW = {"E": "#5ff0ff", "e": "#e8ffff"}                                          # saturated: eyes only


# ====================================================================== particles
def frames(name, palette, grids, size=8):
    """grids: list of ASCII frames -> textures/particle/<name>_<i>.png + particles/<name>.json"""
    for i, g in enumerate(grids):
        put(f"textures/particle/{name}_{i}.png", draw(parse(g), palette, (size, size), f"{name}_{i}"))
    JSON[f"particles/{name}.json"] = {"textures": [f"winterworks:{name}_{i}" for i in range(len(grids))]}


def window(master, x0, x1, dim=None):
    """Columns x0..x1 of a hand-drawn master grid (the rest transparent); dim maps colours one step down."""
    rows = parse(master)
    out = []
    for row in rows:
        r = "".join(c if x0 <= x <= x1 else "." for x, c in enumerate(row))
        if dim:
            r = "".join(dim.get(c, c) for c in r)
        out.append(r)
    return "\n".join(out)


# --- frost_breath: a vapour puff from a mouth, grows and thins out (8x8, 6 frames, alpha)
BREATH = pal(W="#ffffffd8", A="#eef6fcc8", B="#d5e6f3b0", C="#b5cde293", D="#9bb6d270", E="#c7dbec48")
frames("frost_breath", BREATH, ["""
........
........
........
...AA...
..AWAB..
...BC...
........
........
""", """
........
........
...AA...
..AWAB..
..ABBC..
...CC...
........
........
""", """
........
...AA...
..AWAAB.
.AAABBC.
.ABBBCD.
..CCDD..
........
........
""", """
........
..AA.B..
.AWABBC.
.AABBCC.
ABBBCCD.
.CBCDDD.
..DD.D..
........
""", """
..E.....
.CB.CC..
CBBCC.D.
.BC.CCD.
CC.CDD..
.DD.D.E.
..E.D...
........
""", """
.E...E..
...E....
.E..D.E.
E.D...D.
..E.D...
.D...E..
...E....
........
"""])

# --- ice_shard: broken crystal prisms (static variants): bright edge, dark core, indigo rim
SHARD = pal(CRYSTAL)
frames("ice_shard", SHARD, ["""
....1...
...181..
..17361.
..17351.
..16351.
..16251.
..11111.
........
""", """
........
........
....11..
...1781.
..17461.
..1631..
...11...
........
""", """
........
.1......
181..1..
1751181.
16317361
16317351
11116351
...11111
""", """
........
........
........
...11...
..1871..
..1531..
...11...
........
""", """
........
........
...1111.
..187761
.1744331
..11111.
........
........
"""])

# --- frost_burst: expanding ring of frost crystals (16x16, 6 frames)
BURST = pal(FROST)
frames("frost_burst", BURST, ["""
................
................
................
................
.......cc.......
....c..ll..c....
.....clwwlc.....
....clwWWwlc....
....clwWWwlc....
.....clwwlc.....
....c..ll..c....
.......cc.......
................
................
................
................
""", """
................
................
.......ww.......
......cWWc......
....clwllwlc....
...cWc....cWc...
...lw......wl...
..wWl......lWw..
..wWl......lWw..
...lw......wl...
...cWc....cWc...
....clwllwlc....
......cWWc......
.......ww.......
................
................
""", """
.......cc.......
.......wl.......
..c...WWWW...c..
...lWllccllWl...
...Wlc....clW...
...lc......cl...
..Wl........lW..
cwWc........cWwc
cwWc........cWwc
..Wl........lW..
...lc......cl...
...Wlc....clW...
...lWllccllWl...
..c...WWWW...c..
.......lw.......
.......cc.......
""", """
.......lw.......
.....wWWWWw.....
..g.wlc..clw.g..
................
................
.wl..........lw.
.Wc..........cW.
lWc..........cWl
lWc..........cWl
.Wc..........cW.
.wl..........lw.
................
................
..g.wlc..clw.g..
.....wWWWWw.....
.......wl.......
""", """
.....cwwwwc.....
....c......c....
..g..........g..
................
................
c..............c
w..............w
l..............l
l..............l
w..............w
c..............c
................
................
..g..........g..
....c......c....
.....cwwwwc.....
""", """
.......c........
................
..b..........c..
................
................
................
................
c...............
...............b
................
................
................
................
..c..........b..
................
........c.......
"""], size=16)

# --- roar_wave: pale shockwave ring with a soft trailing fill (16x16, 6 frames, alpha)
ROAR = pal(R="#eef8ffe6", r="#c6e2f6c0", s="#9fc8ea90", t="#88b6e060", u="#7eaedc38")
frames("roar_wave", ROAR, ["""
................
................
................
................
................
................
......RrrR......
......rsur......
......rusr......
......RrrR......
................
................
................
................
................
................
""", """
................
................
................
................
.......RR.......
.....RRrrRR.....
.....rssssr.....
....RrsttsrR....
....RrsttsrR....
.....rssssr.....
.....RRrrRR.....
.......RR.......
................
................
................
................
""", """
................
................
................
.....RRRRRR.....
....RrrssrrR....
...RrssttssrR...
...Rrst..tsrR...
...Rst....tsR...
...Rst....tsR...
...Rrst..tsrR...
...RrssttssrR...
....RrrssrrR....
.....RRRRRR.....
................
................
................
""", """
................
................
.....RRRRRR.....
...RRrrssrrRR...
...RrsttttsrR...
..Rrst....tsrR..
..Rst......tsR..
..Rst......tsR..
..Rst......tsR..
..Rst......tsR..
..Rrst....tsrR..
...RrsttttsrR...
...RRrrssrrRR...
.....RRRRRR.....
................
................
""", """
................
.....rrrrrr.....
...rrsssssssr...
..rstt....ttsr..
..st........ts..
.rt..........tr.
.st..........ts.
.st..........ts.
.st..........ts.
.st..........ts.
.rt..........tr.
..st........ts..
..rstt....ttsr..
...rrsssssssr...
.....rrrrrr.....
................
""", """
......ssss......
....sttttttt....
..stt......tts..
..tu........ut..
.st..........ts.
.tu..........ut.
st............ts
tu............ut
tu............ut
st............ts
.tu..........ut.
.st..........ts.
..tu........ut..
..stt......tts..
....tttttttt....
......ssss......
"""], size=16)

# --- frost_slash: an icy sweep arc (16x16, 8 frames). One hand-drawn master arc, revealed
# right-to-left and then eaten from the right, like vanilla's sweep_attack.
SLASH = pal(FROST)
SLASH_ARC = """
................
................
................
................
.....WWWWWW.....
...WWwwwwwwWW...
..WwwllllllwwW..
.Wwlc..g...clwW.
.Wlc........clW.
Wwc.g.....l..cwW
Wl.........g..lW
W....c.........W
................
................
................
................
"""
DIM = {"W": "w", "w": "l", "l": "c", "c": "b"}
frames("frost_slash", SLASH, [
    window(SLASH_ARC, 12, 15),
    window(SLASH_ARC, 7, 15),
    window(SLASH_ARC, 3, 15),
    window(SLASH_ARC, 0, 15),
    window(SLASH_ARC, 0, 12),
    window(SLASH_ARC, 0, 8, DIM),
    window(SLASH_ARC, 0, 4, DIM),
    window(SLASH_ARC, 0, 1, DIM),
], size=16)

# --- ice_crit: an icy crit twinkle (8x8, 4 frames: big plus, small plus, cross, spark)
CRIT = pal(FROST)
frames("ice_crit", CRIT, ["""
...c....
.g.l.g..
...W....
clWWWlc.
...W....
.g.l.g..
...c....
........
""", """
........
...c....
..gWg...
.cWWWc..
..gWg...
...c....
........
........
""", """
........
.c...c..
..l.l...
...W....
..l.l...
.c...c..
........
........
""", """
........
........
...c....
..cWc...
...c....
........
........
........
"""])

# --- fur_tuft: a drifting lock of cream fur (static variants)
TUFT = pal(FUR)
frames("fur_tuft", TUFT, ["""
........
....55..
...5664.
..45543.
..4432..
.343.2..
.3.2....
.2......
""", """
........
........
..556...
.456543.
4543.32.
.3.2..21
........
........
""", """
........
........
...56...
..5654..
..4433..
..3.2...
........
........
""", """
.....5..
....565.
....543.
...543..
..443...
.343....
.3..2...
........
"""])

# --- blizzard_flake: wind-driven snowflakes with a translucent streak (static variants)
BLIZZ = pal(a="#ffffff", A="#e2edf6", v="#a9c1d8", T="#dbe8f3a8", t="#c9dbeb68")
frames("blizzard_flake", BLIZZ, ["""
........
........
......A.
.ttTTAaA
......A.
........
........
........
""", """
........
t.......
.t......
..T.....
...T.A..
....AaA.
.....A..
........
""", """
........
........
........
...ttTa.
........
........
........
........
""", """
........
........
........
.....A.A
tttTT.a.
.....A.A
........
........
"""])

# --- snow_puff: a landing / slam puff of snow (8x8, 8 frames)
PUFF = pal(SNOW, u="#6c7d97")
frames("snow_puff", PUFF, ["""
........
........
........
...aA...
...AW...
........
........
........
""", """
........
........
...aA...
..aaAW..
..AAWv..
...Wv...
........
........
""", """
........
...aa...
..aaaAW.
.aaAAWW.
.AAAWWv.
..WWvv..
........
........
""", """
...aa...
.aaaaA..
.aaAAAW.
aaAAAWWv
AAAAWWvv
.AWWWvv.
..vvv...
........
""", """
..aa.A..
.aaAA.W.
aaA.AWWv
aAAAW.vv
.AA.WWv.
.WWv.vv.
..v..v..
........
""", """
.aA...A.
aAA..AW.
.A.....v
...aA...
a..AW..W
.W..v.vv
..v.....
........
""", """
.a....A.
........
A......W
...aA...
...Wv...
.A....v.
........
........
""", """
........
.A......
.......v
........
...A....
........
.v....A.
........
"""])

# --- cold_mist: low wisps hugging the ground (16x16, 4 frames, very soft alpha)
MIST = pal(**{"1": "#dce9f41c", "2": "#dce9f430", "3": "#e2eef746", "4": "#eaf3fa5a"})
frames("cold_mist", MIST, ["""
................
................
................
................
................
.....1122211....
..11223333221...
.1223344433221..
..122333332211..
...1122222111...
......111.......
................
..111......11...
.1222211.12221..
..11122211111...
................
""", """
................
................
................
................
................
................
...11122111.....
.1122333222111..
11233444333221..
.1222333332211..
..1112222111....
.......111......
.11.....1111....
1222111122221...
.111222211111...
................
""", """
................
................
................
................
................
................
................
....1112221.....
..112233333211..
.12233444433221.
.1123333332221..
...1122222111...
........11......
...1111.111.....
..122222222111..
...11111111.....
""", """
................
................
................
................
................
................
................
................
.......11111....
...1112222221...
..12233333221...
.1122333322211..
...11122221111..
.....111111.....
................
................
"""], size=16)


# ====================================================================== items (16x16)
def item(name, palette, grid):
    put(f"textures/item/{name}.png", draw(parse(grid), palette, (16, 16), name))


# A rolled pelt, fur outwards, tied with two hide straps; the spiral end faces us.
item("polar_bear_fur", pal(FUR, HIDE), """
.........oooo...
........o65654o.
.......oTT56443o
......o65TT5443o
.....o6565tt433o
....oTT5654tt32o
...o65TT5443tN2o
..oooo6tt4342No.
.oo5654ott432o..
o554TTt3otN2o...
o5T4632to2No....
o4T3NN3to2o.....
o4t32N2Noo......
o3tNtNn2o.......
.oo3221o........
...oooo.........
""")

# Vanilla-style armour icons, a dark violet outline: the hood is a helmet with round bear ears, the bear's eyes
# and nose on the brow, cheek flaps either side of the face hole.
item("fur_hood", pal(FUR, k="#241d29", i="#2e2836"), """
.... .... .... ....
.... .... .... ....
...o o... ...o o...
..o5 4ooo ooo4 5o..
..o4 6656 5665 4o..
..o5 6565 6555 3o..
..o5 5655 5654 3o..
..o5 k565 565k 3o..
..o4 545i i443 2o..
..o4 oooo oooo 2o..
..o4 o... ...o 2o..
..o4 o... ...o 2o..
..o3 o... ...o 1o..
..o3 o... ...o 1o..
...o .... .... o...
.... .... .... ....
""")

item("fur_coat", pal(FUR, HIDE, Y=BONE["Y"], y=BONE["y"]), """
.... .... .... ....
.ooo oo.. ..oo ooo.
o566 56o. .o65 654o
o656 656o o565 543o
o565 556t N544 432o
ooo5 656Y y544 3ooo
..o5 556t N443 3o..
..o6 565t N543 2o..
..o5 656Y y443 3o..
..o5 565t N432 2o..
..oT tTtY ytTN No..
..o6 556t N443 2o..
..o5 656t N543 2o..
..o4 545t N432 2o..
..oo 5o4o o3o2 oo..
.... .... .... ....
""")

item("fur_leggings", pal(FUR, HIDE, Y=BONE["Y"], y=BONE["y"]), """
................
..oooooooooooo..
..otTTtYytttNo..
..o5654554432o..
..o5664545433o..
..o5654oo5432o..
..o6545oo4432o..
..o5654oo5342o..
..o5645oo4432o..
..o6554oo4332o..
..o5645oo5432o..
..o5654oo4342o..
..o6545oo4432o..
..o5654oo5432o..
..o6565oo5443o..
..oo.oo..oo.oo..
""")

item("fur_boots", pal(FUR, HIDE), """
.... .... .... ....
.... .... .... ....
.... .... .... ....
.... .... .... ....
...o ooo. ...o ooo.
..o5 656o ..o5 656o
..o4 545o ..o4 545o
..o3 45o. ..o3 45o.
..o3 44o. ..o3 44o.
.o33 445o .o33 445o
o233 445o o233 445o
onNN tttT onNN tttT
.ooo ooo. .ooo ooo.
.... .... .... ....
.... .... .... ....
.... .... .... ....
""")

# A Frost Mauler sabre, as on the 3D model: a broad flattened blade of bone-yellow ivory curving to a point, the
# root torn out of the jaw at the top right.
item("mauler_fang", pal(BONE, FROST, N="#4a2e22"), """
.........kkkkk..
........kNKNKNk.
........kGYYyBk.
.......kGYYyyBk.
.......kGYyyBk..
......kGYYyBk...
......kGYyyBk...
.....kGYYyBk....
.....kGYyBk.....
....kGYyyk......
....kGYyBk......
....kGYyk.......
...kGYyk........
...kGYk.........
...kGk..........
...kk...........
""")

# Fang dagger, drawn from a render of its 3D model at the vanilla sword angle: the curved ivory fang blade with its
# frost-blue cutting edge, a burst of ice crystals for a guard, a grip wound in white polar fur, a bone knuckle pommel.
item("fang_dagger", pal(BONE, FROST, CRYSTAL, a=FUR["6"], A=FUR["4"], o=FUR["o"]), """
..............0.
.............kw0
............kGc0
............kGl0
...........kGYc0
....0.....kGYyc0
...070...kGYyl0.
....070.kGYyc0..
.....076GYyc0...
.....o5566c0....
...oaaA0670.....
..oaAoa0.670....
.oaaAo...000....
.kGAo...........
kGYyk...........
kyk.............
""")

# The sabre-toothed skull in profile, drawn from its 3D model: tall crest, the great dark orbit with the cold eye
# glowing in it, frost crusting the crown with crystals breaking through, the jaw dropped open and the sabre hanging
# far below it.
item("frost_mauler_skull", pal(BONE, CRYSTAL, GLOW, m="#120f22"), """
......6...7.6...
....k6765676k...
...k6765GYYYYk..
..k67YYGYYYYYYk.
.k6YmmmmYYYYYYYk
.kYmmmEemYYGGYYk
.kYmmmmmmYyyYYmk
.kyBmmmmByyyyyBk
..kyyBBBYyyGGYk.
..kBkkkkkkkGYk..
..kBYGGYk.kGYk..
...kByyGk.kGYk..
....kkByk.kGYk..
......kk.kGYk...
.........kGk....
.........kk.....
""")

# A hanging icicle: frozen-on chunk at the top, a crystal spike tapering down.
item("icicle", pal(CRYSTAL), """
.....2222222....
....278876652...
....2286746522..
.....2864652....
.....2864652....
......286452....
.....28674652...
......286452....
......286452....
.......28452....
.......28462....
.......28452....
........2852....
........2842....
........272.....
.........2......
""")


# ====================================================================== mob effect icon (18x18)
# Frostbite: a bold snowflake, lit top-left, indigo rim, white-hot core and a faint cyan glow.
put("textures/mob_effect/frostbite.png", draw(parse("""
........oo........
.......o66o.......
.....joo75ooj.....
....jo7o75o6oj....
...jjoo6755oojj...
..joo6oo75oo6ooj..
..o7oo7o75o6oo6o..
.ooo6oo7756oo5ooo.
o6777777WW7777775o
o6555555WW5555554o
.ooo6oo6755oo5ooo.
..o6oo6o75o5oo4o..
..joo6oo75oo4ooj..
...jjoo6755oojj...
....jo6o75o4oj....
.....joo75ooj.....
.......o54o.......
........oo........
"""), pal(CRYSTAL, o="#1b1f5c", W="#ffffff", j="#5fe0ff48"), (18, 18), "frostbite"))


# ====================================================================== blocks (16x16)
def block(name, palette, grid):
    put(f"textures/block/{name}.png", draw(parse(grid), palette, (16, 16), name))


# Ancient ice: deep layered glacier ice, translucent so the frozen Mauler shows through. It tiles like vanilla ice:
# gently tilted strata of cobalt and blue that run on across the edges, the same depth everywhere (no lighter or
# darker band to stripe a wall), and a few short, soft fractures, only a step or two paler than the ice round them
# (no white glints, bubbles or lone dark pockets to dot a wall). Animated (`.mcmeta`, interpolated): a slow band
# of cold light sweeps diagonally through the ice, then it rests; the band wraps round the block (x + y taken
# modulo 16), so across a wall it is one set of even diagonal stripes.
DEEP_ICE = pal(**{"0": "#0a0f3aa4", "1": "#111d5c98", "2": "#18307e90", "3": "#20499e90", "4": "#2c68bc98",
                  "5": "#3c86d4a4", "6": "#66b2e6b8", "7": "#a8e2f8cc", "8": "#ecfcffe4", "w": "#f4fdffe6",
                  "b": "#7ec0ecbc"})
ANCIENT_ICE = """
2333 2223 2324 3321
4311 5122 1351 3223
1225 1134 4511 1122
4351 4422 3122 3123
4415 4321 1211 3333
5132 2221 1233 3234
1232 1233 3121 2122
3213 4422 3322 3223
3343 3321 5222 3322
4322 2225 1233 4333
2232 1251 3121 3223
3223 4512 3223 4325
3455 4121 1222 4451
5322 2221 1244 4513
2332 2134 3222 2131
2112 3323 3333 3113
"""
# the shimmer: one frame per row of the strip; a 3 px band ((x + y - c) mod 16 in [0, 2]) is one tone brighter
SHIMMER_UP = {"0": "1", "1": "2", "2": "3", "3": "4", "4": "5", "5": "6", "6": "7", "7": "8", "8": "w", "b": "7",
              "w": "w"}


def shimmer(grid, centre):
    rows = parse(grid)
    return ["".join(SHIMMER_UP[c] if (x + y - centre) % 16 <= 2 else c for x, c in enumerate(r))
            for y, r in enumerate(rows)]


ICE_FRAMES = [shimmer(ANCIENT_ICE, c) for c in range(0, 16, 2)] + [parse(ANCIENT_ICE)] * 4
_ice = Image.new("RGBA", (16, 16 * len(ICE_FRAMES)), (0, 0, 0, 0))
for _i, _f in enumerate(ICE_FRAMES):
    _ice.alpha_composite(draw(_f, DEEP_ICE, (16, 16), f"ancient_ice_{_i}"), (0, 16 * _i))
put("textures/block/ancient_ice.png", _ice)
JSON["textures/block/ancient_ice.png.mcmeta"] = {"animation": {"frametime": 10, "interpolate": True}}

# Icicles (cross models like pointed dripstone): pale translucent ice prisms, bright left edge, darker
# core. `icicle_base` is the upper block (its bottom width matches the top of `icicle_tip`).
PALE_ICE = pal(a="#2a66c6c0", b="#3392dcc8", c="#4bbde9d0", d="#8de3f6d8", e="#d0f7fde6", f="#fffffff0",
               g="#2443a3c8")
block("icicle_base", PALE_ICE, """
....fedcbcdg....
....edcbacdg....
....edcbacdg....
...dfedcbcddg...
....edcbacdg....
....edcbacdg....
.....edbacdg....
.....edbacdg....
.....fdbacdg....
....dfdcbcdg....
.....edbacg.....
.....edbacg.....
.....fdbacg.....
.....edbacg.....
.....edbbcg.....
.....edbacg.....
""")
block("icicle_tip", PALE_ICE, """
.....edbacg.....
.....edbacg.....
.....fdbacg.....
.....edbag......
......edag......
......fdag......
......edbg......
......edg.......
.......dg.......
.......eg.......
.......dg.......
.......e........
.......d........
................
................
................
""")


# ====================================================================== entity skins (box UV layout)
class Skin:
    """A texture built from hand-drawn box faces placed at their vanilla UV spots.

    box(u, v, w, h, d) follows ModelPart's cube unwrap: top (u+d, v), bottom (u+d+w, v), right (u, v+d),
    front (u+d, v+d), left (u+d+w, v+d), back (u+2d+w, v+d). On `top` the last row touches the front;
    `right` is the model's right side (its last column touches the front), `left` its first column does.
    """

    def __init__(self, size=(64, 64)):
        self.im = Image.new("RGBA", size, (0, 0, 0, 0))

    def box(self, u, v, w, h, d, palette, name="?", **faces):
        spots = {"top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d), "right": (u, v + d, d, h),
                 "front": (u + d, v + d, w, h), "left": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h)}
        for face, grid in faces.items():
            x, y, fw, fh = spots[face]
            rows = parse(grid) if isinstance(grid, str) else grid
            self.im.alpha_composite(draw(rows, palette, (fw, fh), f"{name}.{face}"), (x, y))
        return self


def flip(grid):
    return [row[::-1] for row in (parse(grid) if isinstance(grid, str) else grid)]


def mirrored(faces):
    """The faces of the opposite limb, as vanilla's mirror() shows them (left/right swapped, flipped)."""
    swap = {"right": "left", "left": "right"}
    return {swap.get(f, f): flip(g) for f, g in faces.items()}


def patched(faces, **patches):
    """Copy of `faces` with some cells replaced: patch grids use '_' for 'keep the original pixel'."""
    out = {f: (parse(g) if isinstance(g, str) else list(g)) for f, g in faces.items()}
    for face, patch in patches.items():
        rows = []
        for base, over in zip(out[face], parse(patch)):
            rows.append("".join(b if o == "_" else o for b, o in zip(base, over)))
        out[face] = rows
    return out


# Player-model UV spots (64x64): head 0,0 / hat 32,0 / body 16,16 / right arm 40,16 / right leg 0,16;
# left arm 32,48 and left leg 16,48 (the drowned layout; the zombie layout mirrors the right limbs).
HEAD, HAT, BODY, R_ARM, R_LEG, L_ARM, L_LEG = (0, 0), (32, 0), (16, 16), (40, 16), (0, 16), (32, 48), (16, 48)


def humanoid(skin, palette, name, head=None, hat=None, body=None, arm=None, leg=None, l_arm=None, l_leg=None):
    if head:
        skin.box(*HEAD, 8, 8, 8, palette, f"{name}.head", **head)
    if hat:
        skin.box(*HAT, 8, 8, 8, palette, f"{name}.hat", **hat)
    if body:
        skin.box(*BODY, 8, 12, 4, palette, f"{name}.body", **body)
    if arm:
        skin.box(*R_ARM, 4, 12, 4, palette, f"{name}.right_arm", **arm)
        skin.box(*L_ARM, 4, 12, 4, palette, f"{name}.left_arm", **(l_arm or mirrored(arm)))
    if leg:
        skin.box(*R_LEG, 4, 12, 4, palette, f"{name}.right_leg", **leg)
        skin.box(*L_LEG, 4, 12, 4, palette, f"{name}.left_leg", **(l_leg or mirrored(leg)))
    return skin


# --- Frost Zombie: a frozen polar explorer. Frostbitten blue-grey skin (indigo fingertips, nose, ears),
# frosted hair and beard, icy eyes, a ragged leather parka lined with cream fur (hood = hat layer),
# indigo wool trousers, fur boots, ice crusts.
ZOMBIE = pal(FUR,
             a="#2c3550", b="#435370", c="#5f7390", d="#7f94ab", e="#a3b7c8", f="#c8d8e2",  # skin
             p="#2a275a", P="#46448a", m="#131728",                                        # frostbite, mouth
             E="#d8fdff", F="#55d8f2",                                                     # icy eyes
             h="#3f4558", H="#6c7690", i="#a9b8cc", I="#e4eff8",                           # frosted hair
             k="#241a19", l="#3f2b25", L="#5c3f33", r="#7c5945", R="#9b7659",              # parka leather
             t="#1b1d31", T="#292d47", u="#3b4262", U="#525a7e",                           # wool trousers
             j="#16131a", J="#352b2e", g="#a8956c", G="#d6c79d",                           # belt, bone toggles
             x="#2a66c6", X="#4bbde9", z="#8de3f6", Z="#d0f7fd", W="#ffffff",              # ice
             S="#eef4f8", s="#c4d2e0")                                                     # snow

FZ_HEAD = dict(top="""
hHhiHhHh
HhIhhHih
hiHhHhhH
HhhIhiHh
hHiHhHIh
iHhHiHhi
HIhiHIhH
IiHIiHiI
""", bottom="""
bbcbbcbb
bcbbcbbb
bbbcbbcb
cbHbbHbc
HhHhHhHh
hHihHihH
iHIiHiIH
IiIHIiHI
""", right="""
hHhhiHhH
HhhHhhIh
hhHhhfeh
hHhhcdde
hhhPpcdd
hHhbcdcH
hhHhbHiI
hHhHiIiH
""", front="""
hiIHhIih
HIhiHIhH
hdeffedh
dabccbac
cFEdcEFb
cdcPpdcb
iHammaHh
IiHiIHiH
""", back="""
hHhhHhhH
HhiHhhiH
hHhIhHhh
hiHhHhiH
HhHhiHhH
hHiHhHih
iHhiHIhH
IiIHiIiI
""")
FZ_HEAD["left"] = flip(FZ_HEAD["right"])

FZ_HOOD = dict(top="""
lLrLkLrl
LlLLkLlL
lrLlkLLl
LLlLkrLl
lLLrkLlL
LlLLkLrL
45545454
56456545
""", front="""
56656545
45....43
4......3
5......2
4......3
4......2
3......2
3......1
""", right="""
LlLLrlL5
lLrLlL45
LlLlLl54
lLLlrL43
LlLlLl54
lLlLlL43
LlLrlL32
.LlkL.l2
""", back="""
lLLklLLl
LlrkLlrL
lLLkLLlL
LrlklLLl
lLLkLrlL
LlLklLLr
lLlkLlLl
.Ll.kL.l
""")
FZ_HOOD["left"] = flip(FZ_HOOD["right"])

FZ_BODY = dict(top="""
rrr45LLl
r456654L
r465564l
rRr45LLl
""", bottom="""
34343434
43434343
34343434
43434343
""", front="""
45655654
r4566544
rrL45LLl
rLg54lLl
RrL45LlL
rLg45Lld
rrL54llc
jJjgGjJj
rRL45Lzl
rLL54LxZ
4r5L4l5l
54565454
""", right="""
rrRr
rRrr
rrrl
Rrrr
rrlr
rRrr
rrrl
jJjj
rrRr
rlrr
4r5r
5454
""", left="""
LLlL
LlLL
LLLl
lLLL
LLlL
LlLL
LLLl
jjJj
LLlL
lLLL
L5l4
4545
""", back="""
rrrlkLLL
rRrlkLlL
rcdlkLLl
RdclkLLL
rrrlkLlL
rRrlkLLl
rrrlkLLL
jJjjjjJj
rrrlkzZl
rRrlkxzL
4r5lk54l
54545454
""")

FZ_ARM = dict(top="""
rrRr
rRrr
rrrL
rLLL
""", bottom="""
PpPp
pPcP
PcpP
pPpP
""", right="""
rrRr
rRrr
rrrl
rcdl
ldcl
lllk
4535
5453
dcdb
edcb
dcPb
Pppp
""", front="""
rrrL
rRrL
rrLL
rrrL
llll
rrLl
5453
4535
edcc
fedc
dPcb
pPpp
""", left="""
LLLl
LLlL
LLLl
LlLL
llkl
LLLl
3545
5354
ccdb
cdcb
bPcb
pppP
""", back="""
LLrL
LrLL
LLLl
LrLL
lllk
LLLl
4545
5454
cdcb
dccb
cPbb
PpPp
""")

FZ_LEG = dict(top="""
TuTu
uTUT
TuTu
uTuT
""", bottom="""
lklk
klkl
lkLk
kLkl
""", right="""
TuUT
uTuT
TUTu
uTtT
TuTu
tTuT
UtTu
5454
4545
3545
4354
klLk
""", front="""
TuUT
uUTu
TuTu
UTuT
TxzT
uXxu
TuTt
5645
4545
5434
4543
lkLk
""", left="""
TuTt
tTuT
TtTu
tTuT
TuTt
tTtT
TtTu
4543
3454
4343
3434
klkl
""", back="""
TuTu
uTtT
TuTu
tTuT
TtTu
uTtT
TuTt
4545
5454
4543
3454
kLkl
""")

# The left limbs are the mirrored right ones with their own tears and ice (zombie layout ignores them).
FZ_L_ARM = patched(mirrored(FZ_ARM), left="""
____
____
____
____
____
____
____
____
____
____
____
____
""", right="""
____
____
_Rd_
_dc_
____
____
____
____
____
____
____
____
""")
FZ_L_LEG = mirrored(FZ_LEG)

put("textures/entity/frost_zombie.png", humanoid(Skin(), ZOMBIE, "frost_zombie", head=FZ_HEAD, hat=FZ_HOOD,
                                                 body=FZ_BODY, arm=FZ_ARM, leg=FZ_LEG, l_arm=FZ_L_ARM,
                                                 l_leg=FZ_L_LEG).im)

# Outer frost layer (drowned-style: head +0.25 under the hood, hat +0.75 over it, body and limbs +0.25):
# frost and icicles on the beard, snow and ice crystals on the hood, shoulders and back, icicles under
# the outstretched arms (the arm's front face points down when a zombie reaches), snow on the boots.
FZ_OUT_HEAD = dict(front="""
........
........
........
........
........
Z......z
.z....Z.
ZX.z..XZ
""", bottom="""
........
........
........
........
........
Z.z..Z.z
.X.ZX.Z.
zZ.XZ.zX
""", right="""
........
........
........
........
........
.......Z
......zZ
.....ZXz
""")
FZ_OUT_HEAD["left"] = flip(FZ_OUT_HEAD["right"])
FZ_OUT_HAT = dict(top="""
sSsS.SsS
SsZWsSzs
sSzXSs.S
S.sSsSsZ
.SsS.sSs
sS.sS..s
.s....S.
........
""", front="""
SsSSsSsS
.Z....z.
.z......
........
........
........
........
........
""", right="""
SsSsSsSs
.W.sSs.s
.ZX.....
.zx.....
........
........
........
........
""", back="""
SsSsSsSs
sSs.sSsS
.W...s..
.ZX.....
.zx.....
........
........
........
""")
FZ_OUT_HAT["left"] = flip(FZ_OUT_HAT["right"])
FZ_OUT_BODY = dict(top="""
SsS..SsS
sSsS.sSs
SsS..SsS
sS....sS
""", front="""
Ss....sS
z......Z
........
........
........
........
........
...ZW...
........
........
........
.z..Z..z
""", right="""
Ss.S
.s..
....
....
....
....
....
....
....
....
....
z..Z
""", left="""
S.sS
..s.
....
....
....
....
....
....
....
....
....
Z..z
""", back="""
SsSsSsSs
sWsSsSsS
.ZX..W..
.Zx..ZX.
.zx..zx.
........
........
........
........
........
........
z..Z...z
""")
FZ_OUT_ARM = dict(top="""
SsSs
sSsS
SsSs
sSsS
""", back="""
SsSs
sSsS
SsS.
.SsS
sS..
..Ss
S...
....
....
....
....
....
""", front="""
....
....
.Z..
.z..
....
...Z
...z
....
.Z..
....
....
....
""", right="""
S...
s...
...Z
..zX
....
....
...Z
..zx
....
....
....
....
""")
FZ_OUT_ARM["left"] = flip(FZ_OUT_ARM["right"])
FZ_OUT_LEG = dict(front="""
....
....
....
....
....
....
....
SsSs
.s.S
....
....
....
""", right="""
....
....
....
....
....
....
....
sSsS
S.s.
....
....
....
""", back="""
....
....
....
....
....
....
....
SsSs
.S.s
....
....
....
""")
FZ_OUT_LEG["left"] = flip(FZ_OUT_LEG["right"])
put("textures/entity/frost_zombie_outer.png", humanoid(Skin(), ZOMBIE, "frost_zombie_outer", head=FZ_OUT_HEAD,
                                                       hat=FZ_OUT_HAT, body=FZ_OUT_BODY, arm=FZ_OUT_ARM,
                                                       leg=FZ_OUT_LEG).im)

# Emissive eyes: only the eye texels of the head's front face.
put("textures/entity/frost_zombie_eyes.png", Skin().box(*HEAD, 8, 8, 8, ZOMBIE, "frost_zombie_eyes", front="""
........
........
........
........
.FE..EF.
........
........
........
""").im)


# ====================================================================== fur armour (vanilla armour layers, 64x32)
# Drawn for vanilla's armour renderer, with vanilla's coverage: layer 1 = the hood (head), the coat (body, and the
# arms down past the elbow), the boots (lower legs); layer 2 = the leggings (legs and the hips). White-cream polar
# fur in shaggy clumps (lit tips, violet-grey roots), each piece edged like vanilla armour (a lit top row, a shaded
# lower row) and finished with a ragged fringe where the fur ends; hints of tanned hide: the hood's bear face, a
# toggled closure and belt on the coat, a belt with a bone buckle on the leggings, hide soles wrapped onto the boots.
FURARM = pal(FUR, HIDE, k="#241d29", Y=BONE["Y"], y=BONE["y"])
# one 8 x 8 tile of fur clumps (lit tip, body, root), tiled with offsets over every face
FUR_CLUMPS = """
6545 5654
5544 4543
4543 4443
4433 3543
5654 6543
5543 5543
4443 5433
3433 4433
"""


def fur(w, h, ox=0, oy=0):
    """A w x h face of fur clumps: the motif at an offset, the top row lit and the bottom row shaded."""
    m = parse(FUR_CLUMPS)
    rows = []
    for y in range(h):
        r = ""
        for x in range(w):
            c = int(m[(y + oy) % 8][(x + ox) % 8])
            if y == 0:
                c = min(6, c + 1)
            elif y == h - 1:
                c = max(2, c - 1)
            r += str(c)
        rows.append(r)
    return rows


def shaped(rows, mask):
    """Apply a hand-drawn mask: '#' keeps the fur, '.' cuts it away, any other character is drawn as is."""
    out = []
    for r, m in zip(rows, parse(mask) if isinstance(mask, str) else mask):
        out.append("".join(c if k == "#" else k for c, k in zip(r, m)))
    return out


layer1 = Skin((64, 32))
# hood: a full crown, a brow band with the bear's little eyes, ear tufts on the top's front corners, cheek flaps
# hanging past the brow, a ragged hem
layer1.box(*HEAD, 8, 8, 8, FURARM, "fur_layer_1.hood", top=shaped(fur(8, 8, 1, 0), """
########
########
########
########
########
########
#32##23#
#21##12#
"""), front=shaped(fur(8, 8, 2, 5), """
########
##k##k##
###NN###
#1....1#
##....##
#.....##
#......#
........
"""), right=shaped(fur(8, 8, 5, 2), """
########
########
########
########
########
###.####
#.#..#.#
........
"""), left=shaped(fur(8, 8, 3, 2), """
########
########
########
########
########
####.###
#.#..#.#
........
"""), back=shaped(fur(8, 8, 6, 1), """
########
########
########
########
########
########
#.######
.#.#.#.#
"""))
# coat: the whole torso, a toggled hide closure down the front, a hide belt, a ragged hem; sleeves past the elbow
layer1.box(*BODY, 8, 12, 4, FURARM, "fur_layer_1.coat", top=fur(8, 4, 0, 3), front=shaped(fur(8, 12, 4, 0), """
##.##.##
###tN###
###Yy###
###tN###
###tN###
###Yy###
###tN###
###tN###
tTtYyTtN
###tN###
########
#.#.##.#
"""), right=shaped(fur(4, 12, 1, 1), """
####
####
####
####
####
####
####
####
TtNn
####
####
.#.#
"""), left=shaped(fur(4, 12, 5, 1), """
####
####
####
####
####
####
####
####
nNtT
####
####
#.#.
"""), back=shaped(fur(8, 12, 2, 4), """
########
########
########
########
########
########
########
########
NtTtTttN
########
########
#.##.#.#
"""))
SLEEVE = """
####
####
####
####
####
####
####
#.#.
....
....
....
....
"""
layer1.box(*R_ARM, 4, 12, 4, FURARM, "fur_layer_1.sleeve", top=fur(4, 4, 2, 0),
           right=shaped(fur(4, 12, 0, 2), SLEEVE), front=shaped(fur(4, 12, 4, 2), SLEEVE),
           left=shaped(fur(4, 12, 1, 6), flip(SLEEVE)), back=shaped(fur(4, 12, 6, 6), SLEEVE))
# boots: a fluffy cuff, fur over the shin, the hide sole wrapped up the foot
BOOT = """
....
....
....
....
....
....
.#.#
####
####
####
TttN
nNNn
"""
layer1.box(*R_LEG, 4, 12, 4, FURARM, "fur_layer_1.boot", bottom="""
NnNn
nNnN
NnNn
nNnN
""", right=shaped(fur(4, 12, 3, 0), BOOT), front=shaped(fur(4, 12, 0, 0), BOOT),
           left=shaped(fur(4, 12, 5, 4), flip(BOOT)), back=shaped(fur(4, 12, 7, 4), BOOT))
put("textures/models/armor/fur_layer_1.png", layer1.im)

layer2 = Skin((64, 32))
# leggings: fur trousers to below the knee, a hide belt with a bone buckle round the hips
TROUSER = """
####
####
####
####
####
####
####
####
#.##
....
....
....
"""
layer2.box(*R_LEG, 4, 12, 4, FURARM, "fur_layer_2.trouser", top=fur(4, 4, 1, 1),
           right=shaped(fur(4, 12, 2, 3), TROUSER), front=shaped(fur(4, 12, 6, 3), TROUSER),
           left=shaped(fur(4, 12, 0, 7), flip(TROUSER)), back=shaped(fur(4, 12, 4, 7), TROUSER))
layer2.box(*BODY, 8, 12, 4, FURARM, "fur_layer_2.hips", front=shaped(fur(8, 12, 3, 2), """
........
........
........
........
........
........
........
tTtYytTN
########
########
########
########
"""), right=shaped(fur(4, 12, 1, 2), """
....
....
....
....
....
....
....
tTtN
####
####
####
####
"""), left=shaped(fur(4, 12, 5, 2), """
....
....
....
....
....
....
....
NtTt
####
####
####
####
"""), back=shaped(fur(8, 12, 7, 2), """
........
........
........
........
........
........
........
NtTtTttN
########
########
########
########
"""))
put("textures/models/armor/fur_layer_2.png", layer2.im)


def armor_overlay(layer, parts):
    """Lay a 64x32 armour layer out as a 64x64 skin overlay (the left limbs mirror the right, as vanilla does)."""
    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    im.alpha_composite(layer, (0, 0))
    for src, dst in ((R_ARM, L_ARM), (R_LEG, L_LEG)):
        limb = layer.crop((src[0], src[1], src[0] + 16, src[1] + 16))
        # mirrored limb: faces swap right/left and each face flips; enough for a front/back/side preview
        m = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        for (x, y, w, h), (x2, y2) in (((0, 4, 4, 12), (8, 4)), ((8, 4, 4, 12), (0, 4)), ((4, 4, 4, 12), (4, 4)),
                                         ((12, 4, 4, 12), (12, 4)), ((4, 0, 4, 4), (4, 0)), ((8, 0, 4, 4), (8, 0))):
            m.alpha_composite(limb.crop((x, y, x + w, y + h)).transpose(Image.FLIP_LEFT_RIGHT), (x2, y2))
        im.alpha_composite(m, dst)
    return im, parts


def skin_mockup(base, overlays=(), size=64, scale=8):
    """Front / back / right / left views of a humanoid skin (zombie pose straightened), with overlay
    layers drawn inflated: overlays = [(image, {part: inflate})], e.g. hat 0.5, outer 0.25/0.75."""
    parts = {  # part: (uv, w, h, d)
        "head": (HEAD, 8, 8, 8), "hat": (HAT, 8, 8, 8), "body": (BODY, 8, 12, 4),
        "right_arm": (R_ARM, 4, 12, 4), "left_arm": (L_ARM, 4, 12, 4),
        "right_leg": (R_LEG, 4, 12, 4), "left_leg": (L_LEG, 4, 12, 4)}

    def face(im, part, which):
        (u, v), w, h, d = parts[part]
        x, y, fw, fh = {"front": (u + d, v + d, w, h), "back": (u + 2 * d + w, v + d, w, h),
                        "right": (u, v + d, d, h), "left": (u + d + w, v + d, d, h)}[which]
        return im.crop((x, y, x + fw, y + fh))

    # (part, face, x, y) in model pixels for each view (16 x 32 canvas; side views 8 wide)
    views = {
        "front": [("right_leg", "front", 4, 20), ("left_leg", "front", 8, 20), ("body", "front", 4, 8),
                  ("right_arm", "front", 0, 8), ("left_arm", "front", 12, 8), ("head", "front", 4, 0),
                  ("hat", "front", 4, 0)],
        "back": [("left_leg", "back", 4, 20), ("right_leg", "back", 8, 20), ("body", "back", 4, 8),
                 ("left_arm", "back", 0, 8), ("right_arm", "back", 12, 8), ("head", "back", 4, 0),
                 ("hat", "back", 4, 0)],
        "right": [("body", "right", 6, 8), ("right_leg", "right", 6, 20), ("right_arm", "right", 6, 8),
                  ("head", "right", 4, 0), ("hat", "right", 4, 0)],
        "left": [("body", "left", 6, 8), ("left_leg", "left", 6, 20), ("left_arm", "left", 6, 8),
                 ("head", "left", 4, 0), ("hat", "left", 4, 0)],
    }
    pad = 2 * scale
    out = Image.new("RGBA", ((16 * 4 + 6) * scale + pad * 2, 32 * scale + pad * 2 + 16), (34, 36, 44, 255))
    dr = ImageDraw.Draw(out)
    ox = pad
    layers = [(base, {})] + list(overlays)
    for vname, items in views.items():
        dr.text((ox, 2), vname, fill=(235, 235, 235, 255))
        # draw by inflation, smallest first, so outer shells cover inner ones
        order = []
        for li, (im, infl) in enumerate(layers):
            for part, which, x, y in items:
                if part == "hat" and li == 0 and "hat" not in infl:
                    infl_v = 0.5
                else:
                    infl_v = infl.get(part, 0.0) if li else (0.5 if part == "hat" else 0.0)
                if li and part not in infl:
                    continue
                order.append((infl_v, li, part, which, x, y, im))
        for infl_v, li, part, which, x, y, im in sorted(order, key=lambda o: (o[0], o[1])):
            f = face(im, part, which)
            g = int(round(infl_v * scale))
            big = f.resize((f.width * scale + 2 * g, f.height * scale + 2 * g), Image.NEAREST)
            out.alpha_composite(big, (ox + x * scale - g, 16 + pad + y * scale - g))
        ox += (16 if vname in ("front", "back") else 16) * scale + scale
    return out


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
    """Each sprite at `scale`x on a checkerboard and on dark, plus 1x and 2x on vanilla grey."""
    tiles = []
    for rel in paths:
        im = OUT[rel]
        w, h = im.size
        s = scale if max(w, h) <= 32 else max(1, 512 // max(w, h))
        big = im.resize((w * s, h * s), Image.NEAREST)
        chk = _on(checker(big.size, (156, 156, 160, 255), (118, 118, 124, 255), cell=s), big)
        dark = _on(Image.new("RGBA", big.size, (24, 26, 34, 255)), big)
        one = _on(Image.new("RGBA", (w + 4, h + 4), (139, 139, 139, 255)), Image.new("RGBA", (w + 4, h + 4)))
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


def particle_strips(dst, scale=8):
    """One row per particle: every frame left to right at `scale`x over a checkerboard."""
    names = sorted({rel.split("/")[-1].rsplit("_", 1)[0] for rel in OUT if "/particle/" in rel})
    rows = []
    for n in names:
        fr = sorted((rel for rel in OUT if rel.startswith(f"textures/particle/{n}_")),
                    key=lambda r: int(r.rsplit("_", 1)[1][:-4]))
        ims = [OUT[r] for r in fr]
        s = scale if ims[0].width > 8 else scale * 2
        tw, th = ims[0].width * s, ims[0].height * s
        row = Image.new("RGBA", (180 + len(ims) * (tw + 6), th + 8), (34, 34, 40, 255))
        ImageDraw.Draw(row).text((4, 4), f"{n} x{len(ims)}", fill=(235, 235, 235, 255))
        for i, im in enumerate(ims):
            big = im.resize((tw, th), Image.NEAREST)
            row.paste(_on(checker((tw, th), (156, 156, 160, 255), (118, 118, 124, 255), cell=s), big),
                      (180 + i * (tw + 6), 4))
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
        print("sheet:", particle_strips(a.preview / "cold_particles.png"))
        groups = {}
        for rel in OUT:
            g = rel.split("/")[-2]
            if g != "particle":
                groups.setdefault(g, []).append(rel)
        for g, paths in groups.items():
            print("sheet:", contact_sheet(sorted(paths), a.preview / f"cold_{g}.png", cols=2 if g in (
                "entity", "armor") else 4))
        base = OUT["textures/entity/frost_zombie.png"]
        outer = OUT["textures/entity/frost_zombie_outer.png"]
        eyes = OUT["textures/entity/frost_zombie_eyes.png"]
        rows = [("base skin + hood", skin_mockup(base)),
                ("+ outer frost layer + eyes", skin_mockup(base, [
                    (outer, {"head": 0.25, "body": 0.25, "right_arm": 0.25, "left_arm": 0.25,
                             "right_leg": 0.25, "left_leg": 0.25, "hat": 0.75}),
                    (eyes, {"head": 0.0})])),
                ("+ the fur armour (layer 2 at 0.5, layer 1 at 1.0, as vanilla inflates them)", skin_mockup(base, [
                    armor_overlay(OUT["textures/models/armor/fur_layer_2.png"],
                                  {"body": 0.5, "right_leg": 0.5, "left_leg": 0.5}),
                    armor_overlay(OUT["textures/models/armor/fur_layer_1.png"],
                                  {"head": 1.0, "body": 1.0, "right_arm": 1.0, "left_arm": 1.0, "right_leg": 1.0,
                                   "left_leg": 1.0})]))]
        w = max(r.width for _, r in rows)
        sheet = Image.new("RGBA", (w, sum(r.height + 20 for _, r in rows)), (26, 27, 33, 255))
        y = 0
        for label, r in rows:
            ImageDraw.Draw(sheet).text((8, y + 4), label, fill=(255, 230, 160, 255))
            sheet.paste(r, (0, y + 20))
            y += r.height + 20
        dst = a.preview / "frost_zombie_mockup.png"
        sheet.save(dst)
        print("mockup:", dst)


if __name__ == "__main__":
    main()
