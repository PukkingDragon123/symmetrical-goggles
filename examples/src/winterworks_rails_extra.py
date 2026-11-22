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

Models (written by this script): `block/switch_rail_right(_on)` branch to the east, `block/switch_rail_left(_on)` the
mirror image (branch to the west), all with the toe to the south: flat rail layers like the other rails, plus a little
3D ground throw (a low iron stand with a red-knobbed lever) on the side away from the branch, its lever leaning one
way unpowered and the other way powered (`block/switch_rail_lever.png`). Rotate in the blockstate with
"y": toe south 0, toe west 90, toe north 180, toe east 270. Item model `item/switch_rail` (flat, like the other rails).
"""
import json
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


def switch_model(name, rail, mirror, powered):
    """A flat switch rail (tinted sleepers under the steel) plus the ground throw on the side away from the branch."""
    M = "winterworks"
    up, down = ([16, 0, 0, 16], [16, 16, 0, 0]) if mirror else ([0, 0, 16, 16], [0, 16, 16, 0])

    def layer(y, tex, tint):
        faces = {"up": {"uv": up, "texture": tex}, "down": {"uv": down, "texture": tex}}
        if tint:
            for f in faces.values():
                f["tintindex"] = 0
        return {"from": [0, y, 0], "to": [16, y, 16], "faces": faces}

    def mx(a, b):                     # mirror an x range across the block
        return (16 - b, 16 - a) if mirror else (a, b)

    sx0, sx1 = mx(0.25, 1.75)
    lx0, lx1 = mx(0.75, 1.25)
    ox = 15.0 if mirror else 1.0
    side = {"uv": [0, 4, 3, 5.5], "texture": "#lever"}
    stand = {"from": [sx0, 1, 11.5], "to": [sx1, 2.5, 14.5], "faces": {
        "up": {"uv": [0, 0, 1.5, 3], "texture": "#lever"}, "north": dict(side, uv=[0, 4, 1.5, 5.5]),
        "south": dict(side, uv=[0, 4, 1.5, 5.5]), "east": side, "west": side,
        "down": {"uv": [0, 0, 1.5, 3], "texture": "#lever"}}}
    rod = {"uv": [5, 0, 6, 7], "texture": "#lever"}
    # a short throw (+-22.5 degrees, low enough to clear a passing cart): one way unpowered, the other powered
    angle = (22.5 if not powered else -22.5) * (-1 if mirror else 1)
    lever = {"from": [lx0, 2.5, 12.75], "to": [lx1, 7.5, 13.25],
             "rotation": {"origin": [ox, 2.5, 13], "axis": "z", "angle": angle},
             "faces": {f: rod for f in ("north", "south", "east", "west")} | {
                 "up": {"uv": [5, 0, 6, 1], "texture": "#lever"}}}
    return {"ambientocclusion": False,
            "textures": {"particle": f"{M}:block/{rail}", "rail": f"{M}:block/{rail}",
                         "ties": f"{M}:block/switch_rail_ties", "lever": f"{M}:block/switch_rail_lever"},
            "elements": [layer(1, "#ties", True), layer(1.01, "#rail", False), stand, lever]}


def write_json(path, body):
    with open(path, "w") as fh:
        json.dump(body, fh, indent=2)
        fh.write("\n")


def switch_rail():
    off, ties = draw_switch(SWITCH, LAMP_OFF)
    on, ties_on = draw_switch(SWITCH_ON, LAMP_ON)
    ties.alpha_composite(ties_on)          # one tie layer for both states (a thrown blade covers a sleeper end)
    off.save(os.path.join(ROOT, "switch_rail.png"))
    on.save(os.path.join(ROOT, "switch_rail_on.png"))
    ties.save(os.path.join(ROOT, "switch_rail_ties.png"))
    draw_lever().save(os.path.join(ROOT, "switch_rail_lever.png"))
    models = os.path.join(ROOT, "..", "..", "models")
    for side, mirror in (("right", False), ("left", True)):
        for powered in (False, True):
            on_ = "_on" if powered else ""
            write_json(os.path.join(models, "block", f"switch_rail_{side}{on_}.json"),
                       switch_model(f"switch_rail_{side}{on_}", "switch_rail" + on_, mirror, powered))
    write_json(os.path.join(models, "item", "switch_rail.json"),
               {"parent": "minecraft:item/generated", "textures": {"layer0": "winterworks:block/switch_rail_ties",
                                                                    "layer1": "winterworks:block/switch_rail"}})


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
          "switch_rail_lever and the switch rail models")


if __name__ == "__main__":
    main()
