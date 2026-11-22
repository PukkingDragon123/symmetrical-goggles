"""Trap Rail, Drop Rail and Switch Rail art for Winterworks, drawn in the style of the hand-drawn coaster rail
(winterworks_art.py).

    python examples/src/winterworks_rails_extra.py

Each overlay is a hand-placed pixel grid: `.` keeps the pixel below, `_` clears it, other characters are palette keys.

The Switch Rail (a Y-junction) is drawn whole, in the coaster rail's steel, with the toe (the single-track end) at the
bottom of the texture (south), the straight track running on north, and the branch curving off to the east edge,
where its rails line up with an east-west rail (rows 2-4 and 11-13) just like a corner rail. Unpowered
(`switch_rail.png`) the branch's switch blade stands open (a dark gap at the toe) and the lamp between the rails is
dark; powered (`switch_rail_on.png`) the blade is thrown shut against the stock rail (polished steel) and the lamp
glows. Sleepers are a separate greyscale layer (`switch_rail_ties.png`, tinted like every Winter Express rail).

The rails themselves are 3D track now (examples/src/winterworks_track_rails.py writes every rail's block model, the
switch rail's included, and keeps its lever texture `block/switch_rail_lever.png` from here); these flat textures stay
for reference.
"""
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "mods", "winterworks", "src", "main",
                    "resources", "assets", "winterworks", "textures", "block")

PAL = {
    "k": (26, 24, 30, 255),      # outline / gap
    "d": (54, 56, 64, 255),      # dark iron
    "i": (98, 102, 112, 255),    # iron
    "l": (150, 156, 166, 255),   # iron light
    "y": (214, 170, 52, 255),    # hazard yellow
    "Y": (240, 206, 96, 255),    # hazard yellow light
    "b": (36, 30, 26, 255),      # hazard black
    "r": (120, 26, 22, 255),     # redstone off
    "R": (232, 54, 36, 255),     # redstone lit
    "o": (255, 156, 92, 255),    # redstone glow
    "s": (70, 66, 60, 255),      # brake pad
}

# clamp jaws: hazard-striped blocks outside the rails, brake pads inside, a redstone lamp between
TRAP_OFF = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "kk............kk",
    "yb.ss......ss.by",
    "by.ss..kk..ss.yb",
    "yb.ss..rr..ss.by",
    "by.ss..kk..ss.yb",
    "kk............kk",
    "................",
    "................",
    "................",
    "................",
    "................",
]
TRAP_ON = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "kk............kk",
    "ybss........ssby",
    "byss...kk...ssyb",
    "ybss..oRRo..ssby",
    "byss...kk...ssyb",
    "kk............kk",
    "................",
    "................",
    "................",
    "................",
    "................",
]
# hatch seams across the ends and down the sides, a red drop arrow in the middle
DROP = [
    "kkkkkkkkkkkkkkkk",
    "k..............k",
    "k..............k",
    "k..............k",
    "k..............k",
    "k......rr......k",
    "k......rr......k",
    "k......rr......k",
    "k....rrrrrr....k",
    "k.....rrrr.....k",
    "k......rr......k",
    "k..............k",
    "k..............k",
    "k..............k",
    "k..............k",
    "kkkkkkkkkkkkkkkk",
]
# the open hatch: a hazard-striped frame round an empty middle
FRAME = [
    "ybbyybbyybbyybby",
    "bYYbbyybbyybbYYb",
    "by____________yb",
    "yb____________by",
    "yb____________by",
    "by____________yb",
    "by____________yb",
    "yb____________by",
    "yb____________by",
    "by____________yb",
    "by____________yb",
    "yb____________by",
    "yb____________by",
    "by____________yb",
    "bYYbbyybbyybbYYb",
    "ybbyybbyybbyybby",
]


def paint(base, grid):
    im = base.copy() if base is not None else Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c == ".":
                continue
            px[x, y] = (0, 0, 0, 0) if c == "_" else PAL[c]
    return im


# ====================================================================== the Switch Rail (a Y-junction)
STEEL = {"m": (123, 122, 132, 255), "h": (201, 199, 195, 255), "d": (60, 59, 69, 255), "g": (244, 240, 231, 255),
         "b": (174, 172, 176, 255), "p": (57, 56, 66, 255),
         "P": (250, 248, 240, 255),          # the thrown blade, polished
         "Q": (30, 29, 36, 255)}             # the gap where the blade stands open
TIE = {"T": (216, 216, 216, 255), "U": (192, 192, 192, 255), "V": (162, 162, 162, 255), "W": (134, 134, 134, 255)}
LAMP_OFF = {"K": (77, 26, 21, 255), "L": (58, 18, 16, 255)}
LAMP_ON = {"K": (255, 184, 120, 255), "L": (226, 56, 31, 255)}
SWITCH = """
..mhd......mhd..
WTmhdbTTUTbmhdTW
WVmhdpVVVVpmhdmm
..mgd.....mmhhhh
..mhd...mmhhhddd
WTmhdbTmhhddddTW
WVmhdpmhhdVmhdVW
..mhdmhhd..mgd..
..mhdhhd...mhd..
WUmhdhdUTUbmhdTW
WVmhdQPVVVpmhdVW
..mhdQP.KL.mhdmm
..mhdQP.LK.mhdhh
WTmhdbTTUTbmhQdd
WVmhdpVVVVpmhQdW
..mhd......mgd..
"""
# powered: the blade thrown shut against the stock rail, the branch's inner blade shut too, the lamp lit
SWITCH_ON = """
..mhd......mhd..
WTmhdbTTUTbmhdTW
WVmhdpVVVVpmhdmm
..mgd.....mmhhhh
..mhd...mmhhhddd
WTmhdbTmhhddddTW
WVmhdpmhhdVmhdVW
..mhdmhhd..mgd..
..mhdhhd...mhd..
WUmhdPhUTUbmhdTW
WVmhdPVVVVpmhdVW
..mhdP..KL.mhdmm
..mhdP..LK.mhdhh
WTmhdbTTUTbmhPdd
WVmhdpVVVVpmhPdW
..mhd......mgd..
"""
# the ground throw: an iron stand (top 0-3 x 0-3, sides below it) and the lever (a 1 px wide rod, a red knob on top)
LEVER = """
oiio.kR.........
iIIi.kR.........
iIIi.ir.........
oiio.ir.........
oiio.ir.........
iIIi.ir.........
oiio.ir.........
.....ir.........
................
................
................
................
................
................
................
................
"""
LEVER_PAL = {"o": (40, 39, 46, 255), "i": (88, 88, 98, 255), "I": (140, 140, 150, 255), "r": (60, 58, 66, 255),
             "k": (150, 26, 20, 255), "R": (232, 64, 40, 255)}


def grid(rows):
    return [r for r in rows.strip("\n").splitlines()]


def draw_switch(rows, lamp):
    """The metal layer (ties clear) and the tie layer (greyscale, tinted in game)."""
    metal = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    ties = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    pal = dict(STEEL, **lamp)
    for y, row in enumerate(grid(rows)):
        assert len(row) == 16, row
        for x, c in enumerate(row):
            if c in TIE:
                ties.putpixel((x, y), TIE[c])
            elif c != ".":
                metal.putpixel((x, y), pal[c])
    return metal, ties


def draw_lever():
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(grid(LEVER)):
        for x, c in enumerate(row):
            if c != ".":
                im.putpixel((x, y), LEVER_PAL[c])
    return im


def switch_rail():
    off, ties = draw_switch(SWITCH, LAMP_OFF)
    on, ties_on = draw_switch(SWITCH_ON, LAMP_ON)
    ties.alpha_composite(ties_on)          # one tie layer for both states (a thrown blade covers a sleeper end)
    off.save(os.path.join(ROOT, "switch_rail.png"))
    on.save(os.path.join(ROOT, "switch_rail_on.png"))
    ties.save(os.path.join(ROOT, "switch_rail_ties.png"))
    draw_lever().save(os.path.join(ROOT, "switch_rail_lever.png"))


def main():
    rail = Image.open(os.path.join(ROOT, "coaster_rail.png")).convert("RGBA")
    ties = Image.open(os.path.join(ROOT, "coaster_rail_ties.png")).convert("RGBA")
    paint(rail, TRAP_OFF).save(os.path.join(ROOT, "trap_rail.png"))
    paint(rail, TRAP_ON).save(os.path.join(ROOT, "trap_rail_on.png"))
    paint(rail, DROP).save(os.path.join(ROOT, "drop_rail.png"))
    ties.save(os.path.join(ROOT, "trap_rail_ties.png"))
    ties.save(os.path.join(ROOT, "drop_rail_ties.png"))
    paint(None, FRAME).save(os.path.join(ROOT, "drop_rail_frame.png"))
    switch_rail()
    print("wrote trap_rail, trap_rail_on, drop_rail, drop_rail_frame, switch_rail, switch_rail_on (+ tie layers), "
          "switch_rail_lever")


if __name__ == "__main__":
    main()
