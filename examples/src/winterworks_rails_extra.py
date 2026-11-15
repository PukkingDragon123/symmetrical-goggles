"""Trap Rail and Drop Rail textures for Winterworks, drawn over the hand-drawn coaster rail (winterworks_art.py).

    python examples/src/winterworks_rails_extra.py

Each overlay is a hand-placed pixel grid: `.` keeps the pixel below, `_` clears it, other characters are palette keys.
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


def main():
    rail = Image.open(os.path.join(ROOT, "coaster_rail.png")).convert("RGBA")
    ties = Image.open(os.path.join(ROOT, "coaster_rail_ties.png")).convert("RGBA")
    paint(rail, TRAP_OFF).save(os.path.join(ROOT, "trap_rail.png"))
    paint(rail, TRAP_ON).save(os.path.join(ROOT, "trap_rail_on.png"))
    paint(rail, DROP).save(os.path.join(ROOT, "drop_rail.png"))
    ties.save(os.path.join(ROOT, "trap_rail_ties.png"))
    ties.save(os.path.join(ROOT, "drop_rail_ties.png"))
    paint(None, FRAME).save(os.path.join(ROOT, "drop_rail_frame.png"))
    print("wrote trap_rail, trap_rail_on, drop_rail, drop_rail_frame (+ tie layers)")


if __name__ == "__main__":
    main()
