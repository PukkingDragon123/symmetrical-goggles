#!/usr/bin/env python3
"""Winterworks pixel art: every hand-made texture of the Winterworks mod.

    python examples/src/winterworks_art.py                  # write all PNGs into the mod's assets
    python examples/src/winterworks_art.py --preview DIR    # also write contact sheets and the HUD mock-up to DIR

Every sprite is hand-placed: an ASCII grid (one character per pixel) plus a palette that maps
characters to colours. '.' is always transparent. Spaces inside grid rows are ignored; they only
help count columns in the wide HUD grids. Art direction: naturalistic and vanilla-adjacent; muted,
hue-shifted ramps (cool shadows, warm lights), dark hue-shifted outlines (never pure black), light
from the top-left; only glows (redstone, blaze, lamps, LEDs) are saturated.

Rails are drawn once with their sleepers in place (palette entries marked TIE); the script splits
that grid into the metal texture (sleepers left transparent) and the greyscale `_ties` layer, so the
two always line up exactly.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "mods/winterworks/src/main/resources/assets/winterworks"


# ====================================================================== palette ramps
# Ramps run dark -> light. Shadows lean cool/violet, lights lean warm.
IRON = {  # worn wrought iron
    "o": "#1e1c25", "d": "#33323d", "s": "#4a4954", "m": "#66656c", "l": "#87858a", "h": "#aba7a3",
    "g": "#dcd6cb",
}
BRASS = {  # tarnished brass
    "Z": "#2f2213", "B": "#4f3a1d", "b": "#7a5c2c", "y": "#a5843f", "Y": "#c9ab62", "G": "#e9d79c",
}
WOOD = {  # weathered spruce/oak
    "N": "#2b1d13", "n": "#46301f", "w": "#64462b", "q": "#82603a", "Q": "#a07d4d", "X": "#bf9e68",
}
SNOW = {"u": "#53627a", "v": "#8c9eb6", "W": "#c4d2e0", "A": "#e8eff5", "a": "#fbfdff"}
REDSTONE = {"R": "#4c0d10", "r": "#8f1813", "e": "#cf2a17", "E": "#f45a26", "F": "#ffb46a"}
BLAZE = {"K": "#6b3c0b", "k": "#b06c14", "j": "#e3a12a", "J": "#ffd552", "i": "#fff3ae"}
STONE = {"k": "#232227", "1": "#38373d", "2": "#4f4e54", "3": "#68676b", "4": "#828083", "5": "#a09d99",
         "6": "#c2bdb3"}
ICE = {"0": "#172338", "1": "#243a58", "2": "#335476", "3": "#476f93", "4": "#6290b0", "5": "#86b2ca",
       "6": "#b2d2e0", "7": "#e2f0f4", "8": "#ffffff"}


def pal(*ramps, **extra):
    p = {".": None}
    for r in ramps:
        p.update(r)
    p.update(extra)
    return p


# ====================================================================== grid plumbing
def parse(grid: str):
    rows = []
    for line in grid.strip("\n").splitlines():
        line = line.strip().replace(" ", "")
        if line:
            rows.append(line)
    return rows


def draw(rows, palette, size, name="?"):
    w, h = size
    if len(rows) != h:
        raise ValueError(f"{name}: {len(rows)} rows, expected {h}")
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        if len(row) != w:
            raise ValueError(f"{name}: row {y} has {len(row)} pixels, expected {w}: {row!r}")
        for x, ch in enumerate(row):
            if ch not in palette:
                raise ValueError(f"{name}: unknown colour {ch!r} at ({x},{y})")
            c = palette[ch]
            if c is None:
                continue
            px[x, y] = rgba(c)
    return im


def rgba(c):
    if isinstance(c, tuple):
        return c
    c = c.lstrip("#")
    if len(c) == 6:
        c += "ff"
    return tuple(int(c[i:i + 2], 16) for i in range(0, 8, 2))


OUT: dict[str, Image.Image] = {}      # relative path -> image


def put(path, im):
    OUT[path] = im


def item(name, palette, grid):
    put(f"textures/item/{name}.png", draw(parse(grid), palette, (16, 16), name))


# ====================================================================== items
item("cobble_ball", pal(STONE), """
................
.....kkkkkk.....
...kk565154kk...
..k5665515444k..
..k5555541443k..
.k555544144332k.
.k114431513322k.
.k551115441122k.
.k544154443111k.
.k443144331433k.
.k331411213322k.
..k1433113222k..
..k3332212221k..
...kk222121kk...
.....kkkkkk.....
................
""")

item("snowball_launcher", pal(IRON, BRASS, SNOW, REDSTONE, BLAZE, WOOD, u="#38445a", h="#8d8b90", l="#6c6b72",
                              m="#504f5a", s="#3b3a45", d="#2b2a33"), """
...uuu..........
..uaAWu......oo.
..uAWvu....oYgdo
uuuWvvu....oYyod
aAWuYo....oglBym
AWvYylo..ohlolbB
WvYylmsgYYlolmo.
uYylmshlmyBlmo..
oylmshlddmybo...
.omshldFEdsBo...
..oglmdEedsdo...
..olmmmddsdJo...
...omsssddJjo...
...oyssddijo....
....olddJko.....
.....oQwoo......
""")

item("heavy_shears", pal(IRON, BRASS, c="#4a8c88", C="#8cc6bb", T="#7a4d33", U="#9a6b48", P="#5a3424",
                         p="#3b2219"), """
...........oo...
..........ohCo..
.........ohmco..
........ohmsco..
.......ohmsco..o
.......olmsco.oC
......ohmsco.oCc
......olmcooCclo
.....olmsoCclmo.
...ooomsGYlmso..
...oTUTlybso....
.oTUPTpolmo.....
TPTUPpoTUpo.....
lppo.oTPpo......
moo.oUPpo.......
o...olmo........
""")

item("icebreaker_horn", pal(ICE, o="#172338"), """
............o...
...........o8o..
...........o87o.
..........o876o.
..........o7654o
.........o76543o
.........o4321o.
........o65543o.
.......o776543o.
......o5443221o.
....oo66554321o.
..oo5672432210o.
.o35672432210o..
.o2462432110o...
.o1231221oo.....
..ooooooo.......
""")

DARK_IRON = {"o": "#15141b", "1": "#23232d", "2": "#31323e", "3": "#444655", "4": "#5d5f6e", "5": "#7f8090",
             "6": "#a9a8ae"}
PAINT_RED = {"R": "#3e1a1a", "r": "#6c2a24", "e": "#8f3e2e", "E": "#b25c40"}
item("locomotive", pal(DARK_IRON, BRASS, PAINT_RED, L="#fff1b8", c="#ffc84e", W="#ffe7a6", w="#f0a848",
                       f="#b8682c"), """
..........ooooo.
ooooooo..o55432o
4555543o..o532o.
2222221oooo532o.
o4ooo3ooYbo532o.
o4Www356Y555Y42o
o3wwf244y444y32L
o3222233b333b21c
o3222222b222b21o
o2111111B111B11o
o4445444454444Er
o1ooo11ooo11oo1r
.oEerooEerooeroR
.oeYyyyyYroorRoo
.orrRoorrRo.oo..
..ooo..ooo......
""")

FOX = {"o": "#2b150d", "1": "#4a2312", "2": "#6b3417", "3": "#8f481e", "4": "#b0602a", "5": "#c97f3f",
       "6": "#dc9f62", "w": "#a9a196", "W": "#d9d2c5", "A": "#f1ece2", "N": "#1e1714", "k": "#0f0a08"}
item("fox_cart", pal(FOX, d="#33323d", s="#4a4954", m="#66656c", l="#87858a", h="#aba7a3"), """
.oo.............
oAAo.......o....
oAW6o.....oNo...
oW655o....o5No..
.o654o...o5544o.
.o5543o..o54k45o
..o543o..o44455N
..o432o..o43WWWo
.olhllllmwWWWwo.
.o55d555d554o...
.o44d444d443o...
.o33s333s332o...
.oooooooooooo...
..olmo..olmo....
..omdo..omdo....
...oo....oo.....
""")

ZOMBIE = {"o": "#161d10", "1": "#26341d", "2": "#364a29", "3": "#4b6337", "4": "#627d48", "5": "#7d955c",
          "k": "#0b0e08", "T": "#2a5257", "t": "#1c3a3f", "U": "#3b6a6d",
          "N": "#272216", "n": "#3a3422", "w": "#4f4830", "q": "#6a6040", "Q": "#857a52", "M": "#5a7a30"}
item("zombie_cart", pal(ZOMBIE, d="#33323d", s="#4a4954", m="#66656c", l="#87858a", r="#6a3e22"), """
................
...oooo.........
..o3445o........
..o34455ooooooo.
..o23k44ott2233o
..o23333ooooo2o4
..o22N2UTT455545
...o21ottT3333o3
.oQQMQQQMQQoooo.
.oqqrqqMqrqo....
.ownrnwnrnno....
.oNnrnnNnrNo....
.ooooooooooo....
..olmo.olmo.....
..omdo.omdo.....
...oo...oo......
""")

item("trailer_cart", pal(IRON, WOOD, L="#ffe9a0", c="#f6b94a", f="#d8862a", y="#a5843f"), """
................
........oooooo..
........olmmmo..
........omoosoo.
........omodlhdo
........omodLcdo
........osodcfdo
........osoosdo.
oXXQXXXXQXXXXQXo
oqqqmqqqqqmqqqqo
onwwnwwwwnwwwwno
..ooo.....ooo...
.oXwQo...oXwQo..
.owywo...owywo..
.oQwqo...oQwqo..
..ooo.....ooo...
""")

DRAGON = {"o": "#111a15", "1": "#1b2a22", "2": "#25392e", "3": "#33503d", "4": "#486a50", "5": "#64866a",
          "6": "#88a184", "N": "#0a100c", "R": "#3a0c08", "e": "#c84a12", "E": "#ff7a1c", "F": "#ffc670", "T": "#cfc6ae"}
item("dragon_locomotive", pal(DRAGON, B=BRASS["B"], b=BRASS["b"], y=BRASS["y"], Y=BRASS["Y"], G=BRASS["G"]), """
........oo......
ooooo..oGYo.....
56654o..oYyooo..
yyyyyo...oy554o.
o3oo2o..o342F44o
o3FE2ooo33455555
o3Ee265Y3334443N
o322244y22REFEeo
o222233b222T2T2o
o111122B112222o.
oYYYYYYYYYYYYoo.
o1ooo11ooo11oo1.
.o543oo543oo43o.
.o4GYYYYG2oo32o.
.o321oo321o.oo..
..ooo..ooo......
""")


# ====================================================================== rails (blocks)
# Seen flat from above, running vertically like vanilla rail.png. Every rail grid is drawn with its
# sleepers in place using the TIE characters: the metal texture leaves those pixels transparent and
# the matching `_ties` layer holds only them, in light-to-mid greyscale for dye multiplication.
TIE = {"T": "#d8d8d8", "U": "#c0c0c0", "V": "#a2a2a2", "W": "#868686"}
STEEL = {"m": "#7b7a84", "h": "#c9c7c3", "d": "#3c3b45", "g": "#f4f0e7", "b": "#aeacb0", "p": "#393842"}
GILT = {"m": "#a1653a", "h": "#ddb15c", "d": "#5a301f", "g": "#fff0b8", "b": "#c39a55", "p": "#47291b"}


def rail(names, grid, ties=None):
    """names: {texture name: palette}. Tie pixels are transparent in every metal texture."""
    rows = parse(grid)
    for name, metal in names.items():
        p = pal(metal)
        p.update({c: None for c in TIE})
        put(f"textures/block/{name}.png", draw(rows, p, (16, 16), name))
    if ties:
        used = set("".join(rows))
        p = {c: None for c in used}
        p.update(TIE)
        put(f"textures/block/{ties}.png", draw(rows, p, (16, 16), ties))


rail({"coaster_rail": STEEL}, """
..mhd......mhd..
WTmhdbTTUTbmhdTW
WVmhdpVVVVpmhdVW
..mgd......mhd..
..mhd......mhd..
WTmhdbTUTTbmhdUW
WVmhdpVVVVpmhdVW
..mhd......mgd..
..mhd......mhd..
WUmhdbTTTUbmhdTW
WVmhdpVVVVpmhdVW
..mgd......mhd..
..mhd......mhd..
WTmhdbUTTTbmhdTW
WVmhdpVVVVpmhdVW
..mhd......mgd..
""", ties="coaster_rail_ties")

rail({"coaster_rail_corner": STEEL}, """
............WW..
.............TV.
........WW..mmmm
........TVmmhhhh
.....W..mmhhhddd
....WWTmhhdddbp.
.....Vmhhdbp.TV.
.....mhhd.TV..TV
..WTmhhdbT.WW.TV
..WVmhd.VUT...TV
...mhdbT.VUT..bp
...mhdpVW.VUb.mm
W.mhhd..W..pmmhh
WTmhdbT.....mhdd
.VmhdpVTTTbmhddW
..mhd..VVVpmhdW.
""", ties="coaster_rail_corner_ties")

CHEVRON_OFF = {"A": "#62382b", "B": "#3c2019", "C": "#7a4631"}
CHEVRON_ON = {"A": "#ff8a3a", "B": "#d4311b", "C": "#ffe3a3"}
rail({"booster_rail": {**GILT, **CHEVRON_OFF}, "booster_rail_on": {**GILT, **CHEVRON_ON}}, """
..mhd......mhd..
WTmhdbTTUTbmhdTW
WVmhdpVCCVpmhdVW
..mgd.ABBA.mhd..
..mhdAB..BAmhd..
WTmhdbTUTTbmhdUW
WVmhdpVVVVpmhdVW
..mhd......mgd..
..mhd......mhd..
WUmhdbTTTUbmhdTW
WVmhdpVCCVpmhdVW
..mgd.ABBA.mhd..
..mhdAB..BAmhd..
WTmhdbUTTTbmhdTW
WVmhdpVVVVpmhdVW
..mhd......mgd..
""", ties="booster_rail_ties")

CHAIN = {"l": "#9d9ba1", "s": "#4c4b55", "k": "#1f1e25", "q": "#a3a1a8", "x": "#5f5e67", "Q": "#2e2d35",
         "c": "#2a2930"}
LAMP_OFF = {"L": "#4d1a15", "K": "#5e231b"}
LAMP_ON = {"L": "#e2381f", "K": "#ffb878"}
rail({"lift_rail": {**STEEL, **CHAIN, **LAMP_OFF}, "lift_rail_on": {**STEEL, **CHAIN, **LAMP_ON}}, """
..mhdq.lm.qmhd..
WTmhdTlmsdTmhdTW
WVmhdVlkkdVmhdVW
cKmhdQmkkdQmhdKc
cLmhdqmmsdqmhdLc
WTmhdTTsdTTmhdUW
WVmhdVVhsVVmhdVW
..mhdQ.hs.Qmhd..
..mhdq.lm.qmhd..
WUmhdTlmsdTmhdTW
WVmhdVlkkdVmhdVW
cKmhdQmkkdQmhdKc
cLmhdqmmsdqmhdLc
WTmhdTTsdTTmhdTW
WVmhdVVhsVVmhdVW
..mhdQ.hs.Qmhd..
""", ties="lift_rail_ties")


# ====================================================================== particles (8x8)
# stun_star_0..3 spin in-plane by 18 degrees per frame (a 5-point star repeats every 72).
def particle(name, palette, grid):
    put(f"textures/particle/{name}.png", draw(parse(grid), palette, (8, 8), name))


FLAKE = pal(a="#ffffff", A="#e4edf5", v="#a7bfd6")
particle("globe_snow_0", FLAKE, """
........
........
........
...a....
........
........
........
........
""")
particle("globe_snow_1", FLAKE, """
........
........
........
...aA...
...Av...
........
........
........
""")
particle("globe_snow_2", FLAKE, """
........
........
....A...
...Aav..
....v...
........
........
........
""")
particle("globe_snow_3", FLAKE, """
........
........
...A.A..
....a...
...v.v..
........
........
........
""")

STAR = pal(o="#5c3707", k="#b9801c", y="#efbf33", Y="#fff1a6", K="#d9a12b")
particle("stun_star_0", STAR, """
...oo...
..oYyo..
.ooYyoo.
oYyyyyko
.oyyyko.
.oyykko.
.oyooko.
..o..o..
""")
particle("stun_star_1", STAR, """
....o...
.oooYo..
oYyyyo..
.oyyyyo.
.oyyykko
oyyykoo.
.oooko..
....o...
""")
particle("stun_star_2", STAR, """
..o..o..
.oYooyo.
.oYyyyo.
.oyyyko.
oYyyykko
.ooykoo.
..oyko..
...oo...
""")
particle("stun_star_3", STAR, """
...o....
..oYooo.
..oYyyyo
.oYyyko.
oYyyyko.
.ooykkko
..okooo.
...o....
""")


# ====================================================================== mob effect icons (18x18)
def effect(name, palette, grid):
    put(f"textures/mob_effect/{name}.png", draw(parse(grid), palette, (18, 18), name))


effect("ramming", pal(ICE, o="#172338", w="#e9f1f5", W="#9fb6c8"), """
..................
..................
..................
...............oo.
.............oo87o
......oooooooo876o
.....o67757757654o
....o46664664543o.
ww..o3555355343o..
....o244424423o...
www.o2333132o.....
....o12221oo......
ww...o11oo........
......oo..........
..................
..................
..................
..................
""")

effect("stunned", pal(o="#5c3707", y="#efbf33", Y="#fff1a6", W="#ffffff", p="#8fa4b8", P="#dfe9f0"), """
..................
............o.....
...........oYo....
.........ooyYyoo..
.........oyyYyyo..
..........oyyyo...
....p.p.p.oyoyo...
....o.....oo.oop..
...oYo..........p.
.ooyYyoo..........
.oyyYyyo........P.
..oyyyo....o..PP..
..oyoyoPPPoYoP....
..oo.oo..oYWYo....
..........oYo.....
...........o......
..................
..................
""")


# ====================================================================== mod icon (32x32 -> 128x128)
ICON = pal(
    K="#1b2940", k="#3a5677", S="#a9cbe0", s="#8db6d2", z="#729fc4", Z="#5f8cb4", f="#f4f8fb", F="#c8dcea",
    a="#fbfdff", A="#e2ebf2", v="#b9cada", u="#90a6bd",
    o="#1c2127", **{"1": "#2c333b", "2": "#3e4750", "3": "#535d67", "4": "#6b757e", "5": "#858e95",
                    "6": "#a1a8ad"},
    m="#aaa69d", M="#c6c1b6", n="#88847d", w="#4e4a46", e="#0c0e11", E="#cdd9e2", N="#14161a",
    H="#172338", b="#335476", c="#476f93", d="#6290b0", g="#86b2ca", h="#b2d2e0", i="#e2f0f4", j="#ffffff")
ICON_GRID = """
..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..
.KkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.
KkSSSSSSSSSSSSSSSHSSSSSSSSSSSSkK
KkSSSFSSSSSSSSSSHjHSSSfSSSSSSSkK
KkSSFfFSSSSSSSSSHiHSSSSSSSSSSSkK
KkSSSFSSSSSSSSSHihHSSSSSSSSSSSkK
KkSSSSSSSSSSSSSHhgHSSSSSSFSSSSkK
KkSSSSSSSSSSSSHhgdHSSSSSFfFSSSkK
KkSSSSSSfSSSSSHgcbHSSSSSSFSSSSkK
KkSSSSSSSSSSSSHihdcHSSSSSSSSSSkK
KksssssssssssHhggdbHsssssssssskK
KksssssssssssHgccbbHsssssssssskK
KkssfssssssssHhgdcbHsssssssssskK
KksssssssssssHhgdcbHsssssssfsskK
Kkssssssssooo566554oossssssssskK
Kkssssssso56636655443osssssssskK
Kksssssso5665565543443ossssssskK
Kksssssso5565554444342ossssssskK
Kkzzzzzzo54Ee44544Ee32ozzzzzzzkK
Kkzzzzzzo43ee44443ee32ozzzzzzzkK
Kkzzzzzzo44343N22N3332ozzzzzzzkK
Kkzzzzzzo344mn2NN2nm32ozzzzzzzkK
Kkzzzzzzo34mMMmnnmMmn2ozzzzzzzkK
Kkzzzzzzo3mMwMwnnwmwn2ozzzzzzzkK
KkZZZZo32onmmwmnnmwn2o22oZZZZZkK
KkaAZo3322onmnnwwnn2o2211oZZAakK
KkAAo332221o233n321o111111oAAAkK
KkAaaaaAAaaaaaaaaaaaaaAAaaaaaAkK
KkAAvAAAAAAvAAAAAAAAAAvAAAAvAAkK
KkvvvvuvvvvvvvvvuvvvvvvvvuvvvvkK
.KkkkkkkkkkkkkkkkkkkkkkkkkkkkkK.
..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..
"""
put("icon.png", draw(parse(ICON_GRID), ICON, (32, 32), "icon").resize((128, 128), Image.NEAREST))


# ====================================================================== Snowball Launcher HUD (256x256 sheet)
# Layout contract (x, y, w, h), shared with the Java renderer:
#   panel (0,0,120,34); glass windows inside it: ammo (6,6,34,12), mode socket (44,6,12,12),
#   charge trough (6,22,66,8) with fill area (7,23,64,6), heat trough (76,22,38,8) with fill area
#   (77,23,36,6), heat dial (88,2,18,18) whose needle pivots on the dial centre (97,11).
#   digits 5x7 at (d*6, 40) lit and (d*6, 48) dim; charge fill (0,58,64,6); heat fill (0,66,36,6);
#   mode icons 10x10 at (0,76) snowball and (12,76) cobble ball; overheat plate 34x12 at (24,76)
#   lit and (60,76) dim; steam puffs 8x8 at (0,90), (10,90), (20,90).
HUD = pal(BRASS, {
    "O": "#121117", "D": "#1d1c24", "d": "#29282f", "p": "#38373f", "P": "#45444d", "l": "#5d5c66",
    "L": "#8f8d93",
    "k": "#090f12", "g": "#0e161b", "h": "#19262e", "H": "#2a3c47",
    "c": "#d3c9ad", "C": "#ada388", "t": "#2a241c", "x": "#7e2216", "X": "#bf3a22", "n": "#26252c",
    "N": "#8c8a91",
    "R": "#4c0d10", "e": "#8f1813", "E": "#cf2a17", "F": "#f45a26", "f": "#ffb46a", "w": "#ffd9c2"})

# The riveted iron plate, brass trims and the dark glass windows (columns grouped by ten).
HUD_PANEL = """
..OOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOO..
.OYYYYYYYY YYYYYYYYYY YYYYYYYYYY YYYYYYYYYY YYYYYYYYYY YYYYYYYYYY yyyyyyyyyy yyyyyyyyyy yyyyyyyyyy yyyyyyyyyy yyyyyyyyyy yyyyyyyyO.
OlPPPPPPLl PPPPPPPPPP PPLlPPPPPP PPPPPPLlPP PPPPPPPPLl PPPPPPPPPP PPPPPPPPPP PPPPPPPPPP PPPPPPPPPP PPPPPPPPPP PPPPPPPPPP PPPPPPPPdO
OlpppppplD pppppppppp pplDpppppp pppppplDpp pppppppplD pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppGYYYYY YYYYYYYYYY YYYYYYYYYY YYYYYYYYYY Yypppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDDDDD DDDDDDDDDD DDDDDDDDDD DDDDDDDDDD dbpDDDDDDD DDDDDDdppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkkkk kkkkkkkkkk kkkkkkkkkk kkkkkkkkkk lbpDkkkkkk kkkkkklppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gggHHgghgg lbpDkggggg ggghHglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg ggHHgghggg lbpDkggggg gggghglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gHHgghgggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlLlYDkggg gggggggggg gggggggggg Hhgghggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OllDYDkggg gggggggggg gggggggggg hggggggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gggggggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gggggggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gggggggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gggggggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gggggggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYDkggg gggggggggg gggggggggg gggggggggg lbpDkggggg gggggglppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlppYdllll llllllllll llllllllll llllllllll lbpdllllll lllllllppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
Olppbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bBpppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
Olpppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp ppppppppdO
OlpppDDDDD DDDDDDDDDD DDDDDDDDDD DDDDDDDDDD DDDDDDDDDD DDDDDDDDDD DDDDDDDDDD DDdppDDDDD DDDDDDDDDD DDDDDDDDDD DDDDDDDDDD DDDDdpppdO
OlpppDOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOlppDOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOlpppdO
OlpppDOkkk kkkkkhkkkk kkkhkkkkkk khkkkkkkkh kkkkkkkhkk kkkkkhkkkk kkkhkkkkkk kOlppDOkkk kkkhkkkkkh kkkkkhkkkk khkkkkkhkk kkkOlpppdO
OlpppDOkgg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gOlppDOkgg gggggggggg gggggggggg gggggggggg gggOlpppdO
OlLlpDOkgg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gOlppDOkgg gggggggggg gggggggggg gggggggggg gggOlLlpdO
OllDpDOkgg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gOlppDOkgg gggggggggg gggggggggg gggggggggg gggOllDpdO
OlpppDOkgg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gggggggggg gOlppDOkgg gggggggggg gggggggggg gggggggggg gggOlpppdO
OlpppDOkgg ggggghgggg ggghgggggg ghgggggggh ggggggghgg ggggghgggg ggghgggggg gOlppDOkgg ggghgggggh ggggghgggg ghggggghgg gggOlpppdO
OlpppDOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOlppDOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOlpppdO
Olpppdllll llllllllll llllllllll llllllllll llllllllll llllllllll llllllllll lllppdllll llllllllll llllllllll llllllllll lllllpppdO
Olpppppppp Lppppppppp pppppppppp pppppppppp Lppppppppp pppppppppp pppppppppp pppppppppp pppppppppp pppppppppp Lppppppppp ppppppppdO
.Obbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbbb bbbbbbbbO.
..OOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOOOO OOOOOOOO..
"""

# Pressure dial (18x18) at (88,2): brass bezel, aged face, scale from 7:30 round to 3:00, red zone
# from 1 o'clock to 3 o'clock, needle hub on the 2x2 centre (pixels 96-97, 10-11).
HUD_DIAL = """
......OOOOOO......
....OOYYYYyyOO....
...OYYCCttCCyyO...
..OYYCtcttctXyyO..
.OYYtCccccccxXyyO.
.OYCctcccccctxXyO.
OYYtcccccccccxXyyO
OYCcccccccccccxXyO
OYttccccNnccccttyO
ObttccccnnccccttBO
ObccccccccccccccBO
ObbtcccccccccccBBO
.ObcctcccccccccBO.
.ObbtcccccccccBBO.
..ObbccccccccBBO..
...ObbccccccBBO...
....OOBBBBBBOO....
......OOOOOO......
"""

# Redstone porthole, vent grille, brass steam pipe with a valve and a tee (30x19) at (57,2).
HUD_WORKS = """
..............................
.....OOOO......DDDDDDDDDDDDDD.
...OOYYyyOO....DOOOOOOOOOOOOl.
...OYReeRyO....DPPPPPPPPPPPPl.
..OYRwEEeRyO...DOOOOOOOOOOOOl.
..OYeEffEeyO...DPPPPPPPPPPPPl.
..ObeEffEebO...DOOOOOOOOOOOOl.
..ObReEEeRBO...DPPPPPPPPPPPPl.
...ObReeRBO....dlllllllllllll.
...OObbBBOO.............OOOOO.
.....OOOO...............OLldO.
OO...........OO..........OdOOO
YbOOOOOOOOOOOYbOOOOOOOOOOOdOYb
YbYYGYYYYYYYYYbYYGYYYYYYYYYYYb
yByyyyyyyyyyyyByyyyyyyyyyyyyyB
bZBBBBBBBBBBBbZBBBBBBBBBBBBBbZ
bZOOOOOOOOOOObZOyBOOOOOOOOOObZ
OO...........OOOYbO.........OO
...............OYbO...........
"""

# Brass maker's plate with a frost emblem, rivets and a pipe into the heat trough (12x19) at (106,2).
HUD_PLATE = """
............
..OOOOOOO...
.OYYYYYYyO..
.OYGbGbGBO..
.OYbGGGbBO..
.OYYYGYYBO..
.OYbGGGbBO..
.OYGbGbGBO..
.OyBBBBBBO..
..OOOOOOO...
............
.........Ll.
...OOOO..lD.
...OGBO.....
...OYbO.....
...OYbO.....
...OYbO..Ll.
...OYbO..lD.
...OYbO.....
"""

# Pipe dropping between the two troughs (2x11) at (73,21).
HUD_DOWNPIPE = """
Yb
Yb
Yb
Gb
Yb
yB
Yb
Yb
Yb
Yb
yB
"""

DIGITS = """
.aaa.. ..a... .aaa.. .aaa.. ...a.. aaaaa. ..aa.. aaaaa. .aaa.. .aaa.
a...a. .aa... a...a. a...a. ..aa.. a..... .a.... ....a. a...a. a...a
A...A. ..A... ....A. ....A. .A.A.. AAAA.. A..... ...A.. A...A. A...A
A...A. ..A... ...A.. ..AA.. A..A.. ....A. AAAA.. ..A... .AAA.. .AAAA
A...A. ..A... ..A... ....A. AAAAA. ....A. A...A. .A.... A...A. ....A
q...q. ..q... .q.... q...q. ...q.. q...q. q...q. .q.... q...q. ...q.
.qqq.. .qqq.. qqqqq. .qqq.. ...q.. .qqq.. .qqq.. .q.... .qqq.. .qq..
"""
DIGIT_LIT = pal(a="#ffe7a0", A="#ffb43c", q="#e8781c")
DIGIT_DIM = pal(a="#5d3a1c", A="#4f2f16", q="#432812")

CHARGE_FILL = """
aaaaaWaa aaaaaWaa aaaaaaWa aaaaaWaa aaaaaWaa aWaaaWaa aaaaaWaa aaaaaaWa
bbbbwbbb bbbbwbbb bbbbbwbb bbbbwbbb bbbbwbbb bbbbwbbb bbbbwbbb bbbbbwbb
cccbcccc cccbcccc ccccbccc cccbcccc cccbcccc cccbcccc cccbcccc ccccbccc
ddcddddd ddcddddd dddcdddd ddcddddd ddcddddd ddcddddd ddcddddd dddcdddd
dcdddddd dcdddddd ddcddddd dcdddddd dcdddddd dcdddddd dcdddddd ddcddddd
deeeeeee deeeeeee edeeeeee deeeeeee deeeeeee deeeeeee deeeeeee edeeeeee
"""
CHARGE_PAL = pal(W="#ffe6c8", w="#ffb088", a="#ff8a62", b="#f2502e", c="#d42a1c", d="#a8161a", e="#741014")

HEAT_FILL = """
222233334445555666777788889990000000
111222233344445556666777788899990000
111122223334444555666677778889999000
111122223334444555666677778889999000
111222233344445556666777788899990000
111111112223333444555566667778888999
"""
HEAT_PAL = pal(**{"1": "#24508c", "2": "#3a6ea6", "3": "#5f7e9e", "4": "#7a6478", "5": "#9a3a32",
                  "6": "#cc3a1e", "7": "#f06a1e", "8": "#ffa040", "9": "#ffd890", "0": "#fff4dc"})

MODE_SNOWBALL = """
...uuuu...
.uuaaAAuu.
.uaaaAAWu.
uaaaAAAWvu
uaaAAAWWvu
uAAAAWWvvu
uAAWWWvvVu
.uWWvvvVu.
.uuvvVVuu.
...uuuu...
"""
MODE_COBBLE = """
...kkkk...
.kk5541kk.
.k456413k.
k45541343k
k34411332k
k11343212k
k33412122k
.k231222k.
.kk2212kk.
...kkkk...
"""

OVERHEAT = """
.OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.
OlllllllllllllllllllllllllllllllDO
OlYYkkYYEEEEEEEEEEEEEEEEEEYYkkYYDO
OlYkkYYkWeeWeeWWeeWWWWWeWeYkkYYkDO
OlkkYYkkWeeWeWeeWeeeWeeeWekkYYkkDO
OlkYYkkYWWWWeWeeWeeeWeeeWekYYkkYDO
OlYYkkYYWeeWeWeeWeeeWeeeWeYYkkYYDO
OlYkkYYkWeeWeWeeWeeeWeeeeeYkkYYkDO
OlkkYYkkWeeWeeWWeeeeWeeeWekkYYkkDO
OlkYYkkYrrrrrrrrrrrrrrrrrrkYYkkYDO
ODDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDO
.OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.
"""
OVERHEAT_LIT = pal(O="#1a0d0b", l="#7a6a5c", D="#2a1c18", Y="#e8b838", k="#1c1612", E="#f0512c", e="#c8281a",
                   r="#8a1610", W="#fff1d2")
OVERHEAT_DIM = pal(O="#140b0a", l="#4a3f38", D="#1e1513", Y="#5e4a1e", k="#171210", E="#5a1c14", e="#4a1610",
                   r="#320e0a", W="#8a5a48")

STEAM = [pal(a="#f4f6f8", A="#d6dde4", v="#a9b4c0"),
         pal(a="#f4f6f8", A="#d6dde4", v="#a9b4c0"),
         pal(X="#eef2f5c0", x="#c8d2dc90")]
STEAM_GRIDS = ["""
........
........
........
........
...AA...
..AaaA..
..vAAv..
...vv...
""", """
........
........
...AA...
..AaaA..
.AaaaAA.
.vAaAAv.
..vvAv..
...vv...
""", """
..xx....
.xXXx.x.
xXXXXxXx
.xXXXXx.
..xXXx..
...xx...
........
........
"""]


def hud_sheet():
    sheet = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    panel = draw(parse(HUD_PANEL), HUD, (120, 34), "hud panel")
    for grid, size, at in ((HUD_DIAL, (18, 18), (88, 2)), (HUD_WORKS, (30, 19), (57, 2)),
                           (HUD_PLATE, (12, 19), (106, 2)), (HUD_DOWNPIPE, (2, 11), (73, 21))):
        panel.alpha_composite(draw(parse(grid), HUD, size, "hud part"), at)
    sheet.alpha_composite(panel, (0, 0))
    sheet.alpha_composite(draw(parse(DIGITS), DIGIT_LIT, (59, 7), "digits"), (0, 40))
    sheet.alpha_composite(draw(parse(DIGITS), DIGIT_DIM, (59, 7), "digits dim"), (0, 48))
    sheet.alpha_composite(draw(parse(CHARGE_FILL), CHARGE_PAL, (64, 6), "charge"), (0, 58))
    sheet.alpha_composite(draw(parse(HEAT_FILL), HEAT_PAL, (36, 6), "heat"), (0, 66))
    sheet.alpha_composite(draw(parse(MODE_SNOWBALL), pal(SNOW, u="#3f4c63", V="#73889f"), (10, 10), "m1"),
                          (0, 76))
    sheet.alpha_composite(draw(parse(MODE_COBBLE), pal(STONE), (10, 10), "m2"), (12, 76))
    sheet.alpha_composite(draw(parse(OVERHEAT), OVERHEAT_LIT, (34, 12), "overheat"), (24, 76))
    sheet.alpha_composite(draw(parse(OVERHEAT), OVERHEAT_DIM, (34, 12), "overheat dim"), (60, 76))
    for i, (g, p_) in enumerate(zip(STEAM_GRIDS, STEAM)):
        sheet.alpha_composite(draw(parse(g), p_, (8, 8), f"steam{i}"), (i * 10, 90))
    return sheet


put("textures/gui/launcher_hud.png", hud_sheet())

# ====================================================================== output
def write_all():
    for rel, im in sorted(OUT.items()):
        dst = ASSETS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst)


def checker(size, a, b, cell=8):
    im = Image.new("RGBA", size, a)
    px = im.load()
    for y in range(size[1]):
        for x in range(size[0]):
            if (x // cell + y // cell) % 2:
                px[x, y] = b
    return im


def contact_sheet(paths, dst, scale=8, cols=4):
    from PIL import ImageDraw
    tiles = []
    for rel in paths:
        im = OUT[rel]
        w, h = im.size
        s = scale if max(w, h) <= 32 else max(1, 256 // max(w, h))
        big = im.resize((w * s, h * s), Image.NEAREST)
        cell_w = big.width * 2 + w * 2 + 40
        cell = Image.new("RGBA", (cell_w, big.height + 22), (40, 40, 46, 255))
        grey = Image.new("RGBA", big.size, (139, 139, 139, 255))
        grey.alpha_composite(big)
        dark = Image.new("RGBA", big.size, (24, 24, 30, 255))
        dark.alpha_composite(big)
        cell.paste(grey, (0, 18))
        cell.paste(dark, (big.width + 6, 18))
        # 1x and 2x on grey
        one = Image.new("RGBA", (w + 4, h + 4), (139, 139, 139, 255))
        one.alpha_composite(im, (2, 2))
        cell.paste(one, (big.width * 2 + 12, 18))
        two = one.resize((one.width * 2, one.height * 2), Image.NEAREST)
        cell.paste(two, (big.width * 2 + 12, 18 + h + 8))
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


HUD_REGIONS = {  # name: (x, y, w, h) -- the layout contract, used for the labelled preview
    "panel": (0, 0, 120, 34), "ammo": (6, 6, 34, 12), "mode": (44, 6, 12, 12), "charge": (6, 22, 66, 8),
    "heat": (76, 22, 38, 8), "dial": (88, 2, 18, 18), "digits": (0, 40, 59, 7), "digits dim": (0, 48, 59, 7),
    "charge fill": (0, 58, 64, 6), "heat fill": (0, 66, 36, 6), "snowball": (0, 76, 10, 10),
    "cobble": (12, 76, 10, 10), "overheat": (24, 76, 34, 12), "overheat dim": (60, 76, 34, 12),
    "steam 0": (0, 90, 8, 8), "steam 1": (10, 90, 8, 8), "steam 2": (20, 90, 8, 8)}


def hud_preview(dst_dir):
    """Labelled 4x preview of the sheet, plus an in-context mock-up composited the way the Java draws it."""
    import math
    from PIL import ImageDraw
    sheet = OUT["textures/gui/launcher_hud.png"]
    crop = sheet.crop((0, 0, 128, 104))
    s = 4
    big = Image.new("RGBA", (crop.width * s + 260, crop.height * s), (70, 70, 76, 255))
    big.alpha_composite(checker((crop.width * s, crop.height * s), (84, 84, 90, 255), (96, 96, 102, 255), 16))
    big.alpha_composite(crop.resize((crop.width * s, crop.height * s), Image.NEAREST))
    d = ImageDraw.Draw(big)
    for i, (name, (x, y, w, h)) in enumerate(HUD_REGIONS.items()):
        col = [(255, 80, 80), (80, 220, 255), (255, 220, 60), (120, 255, 120)][i % 4] + (255,)
        if name != "panel":
            d.rectangle([x * s, y * s, (x + w) * s - 1, (y + h) * s - 1], outline=col)
        d.text((crop.width * s + 8, 6 + i * 14), f"{name}: {x},{y} {w}x{h}", fill=col)
    big.save(dst_dir / "hud_sheet_x4.png")

    # mock-up: ammo "042" (leading zero dim), snowball mode, half charge, 70% heat, at 3x
    m = Image.new("RGBA", (120, 34), (0, 0, 0, 0))
    m.alpha_composite(sheet.crop((0, 0, 120, 34)))
    for i, ch in enumerate("042"):
        dim = i == 0
        dx = int(ch) * 6
        m.alpha_composite(sheet.crop((dx, 48 if dim else 40, dx + 5, (48 if dim else 40) + 7)), (6 + 3 + i * 6, 6 + 2))
    m.alpha_composite(sheet.crop((0, 76, 10, 10 + 76)), (45, 7))
    m.alpha_composite(sheet.crop((0, 58, 32, 64)), (7, 23))
    m.alpha_composite(sheet.crop((0, 66, 25, 72)), (77, 23))
    # needle: scale from 7:30 (-135 deg) clockwise to 3:00 (+90 deg); 70% heat
    ang = math.radians(-135 + 0.7 * 225)
    px = m.load()
    for k in range(1, 7):
        x = 97 + math.sin(ang) * k
        y = 11 - math.cos(ang) * k
        px[int(math.floor(x)), int(math.floor(y))] = (150, 24, 16, 255)
    px[96, 10] = px[97, 10] = px[96, 11] = px[97, 11] = (38, 37, 44, 255)
    px[96, 10] = (140, 138, 145, 255)
    scene = Image.new("RGBA", (200, 70), (0, 0, 0, 255))
    sp = scene.load()
    for yy in range(70):
        for xx in range(200):
            sp[xx, yy] = (110 + yy // 3, 150 + yy // 4, 190, 255) if yy < 40 else (88, 120, 60, 255)
    hb = Image.new("RGBA", (182, 22), (40, 40, 40, 200))
    ImageDraw.Draw(hb).rectangle([0, 0, 181, 21], outline=(20, 20, 20, 255))
    scene.alpha_composite(hb, (9, 46))
    scene.alpha_composite(m, (40, 8))
    scene = scene.resize((scene.width * 3, scene.height * 3), Image.NEAREST)
    scene.save(dst_dir / "hud_mockup_x3.png")
    m.resize((360, 102), Image.NEAREST).save(dst_dir / "hud_panel_mock_x3.png")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write contact sheets / HUD mock-up here")
    ap.add_argument("--no-write", action="store_true", help="do not write into the mod assets")
    a = ap.parse_args()
    if not a.no_write:
        write_all()
    for rel, im in sorted(OUT.items()):
        print(f"{rel:58s} {im.size[0]}x{im.size[1]}")
    if a.preview:
        a.preview.mkdir(parents=True, exist_ok=True)
        groups = {}
        for rel in OUT:
            groups.setdefault(rel.split("/")[-2] if "/" in rel else "root", []).append(rel)
        for g, paths in groups.items():
            if g in ("gui",):
                continue
            print("sheet:", contact_sheet(sorted(paths), a.preview / f"sheet_{g}.png"))
        hud_preview(a.preview)
        print("hud previews:", a.preview / "hud_sheet_x4.png", a.preview / "hud_mockup_x3.png")


if __name__ == "__main__":
    main()
