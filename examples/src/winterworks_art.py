#!/usr/bin/env python3
"""Winterworks pixel art: every hand-made texture of the Winterworks mod.

    python examples/src/winterworks_art.py                  # write all PNGs into the mod's assets
    python examples/src/winterworks_art.py --preview DIR    # also write contact sheets to DIR

Every sprite is hand-placed: an ASCII grid (one character per pixel) plus a palette that maps
characters to colours. '.' is always transparent. Spaces inside grid rows are ignored; they only
help count columns in wide grids. Art direction: naturalistic and vanilla-adjacent; muted,
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


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write contact sheets here")
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
            print("sheet:", contact_sheet(sorted(paths), a.preview / f"sheet_{g}.png"))


if __name__ == "__main__":
    main()
