"""Builds examples/nautilus_horn.json: the Nautilus Horn on its stand (Winterworks, Tides & Treasures; a block).

    python examples/src/nautilus_horn.py examples/nautilus_horn.json                       # the spec only
    python examples/src/nautilus_horn.py examples/nautilus_horn.json --mod mods/winterworks # + block files

A horn made from a great nautilus shell: the coiled shell stands on edge, cream with rust tiger flames that fade
toward its mouth, the spiral seam winding in to a dark umbilicus; the flared mouth on the right is lined with pearly
nacre; a brass mouthpiece with a ring is fitted at the left. It rests in the forked cradle of a small dark-oak stand
with a brass-trimmed foot.

Units are Minecraft pixels, density 2. Only boxes, axis-aligned or turned 45 degrees about Z (the shell's octagonal
outline), so every part is a legal block-model element. The shell's flat sides face south and north (the block has
no facing; give it one and turn the model with the blockstate's `y`).

`--mod` writes models/block/nautilus_horn.json, textures/block/nautilus_horn.png, the blockstate and the item model
(the 2D icon textures/item/nautilus_horn.png from winterworks_ocean_art.py; the item keeps vanilla's goat-horn-like
hand pose).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump  # noqa: E402
from ocean_kit import RAMPS, block_models, mod_args, res_dir, write_json  # noqa: E402

R = Rig(density=2, bone_style="wood")
part, bone = R.part, R.bone

bone("horn_block", None, at=(0, 0, 0))
# the stand: a foot, two posts, a forked cradle on each
part("foot", "horn_block", [11, 1.5, 5], "foot", centre=(0, 0.75, 0))
for s, x in (("l", -3.0), ("r", 3.0)):
    part(f"post_{s}", "horn_block", [1, 3.5, 1], "wood", centre=(x, 3.25, 0))
    part(f"fork_{s}", "horn_block", [1, 1.5, 2.5], "wood", centre=(x, 5.5, 0))
# the shell, on edge: a stepped disc (a core, a cross and the same turned 45 degrees about Z)
CY = 10.0
part("shell", "horn_block", [7, 7, 3.5], "shell_face", centre=(-0.5, CY, 0))
part("shell_h", "horn_block", [9, 5, 3], "shell", centre=(-0.5, CY, 0))
part("shell_v", "horn_block", [5, 9, 3], "shell", centre=(-0.5, CY, 0))
part("shell_d", "horn_block", [6.5, 6.5, 3], "shell", centre=(-0.5, CY, 0), rot=(0, 0, 45))
# the flared mouth on the right, pearly inside
part("mouth", "horn_block", [2, 6.5, 4], "mouth", centre=(4.0, CY - 0.75, 0))
# the brass mouthpiece at the left
part("pipe", "horn_block", [2.5, 1, 1], "brass", centre=(-6.0, CY, 0))
part("pipe_ring", "horn_block", [1, 1.5, 1.5], "brass_dark", centre=(-5.0, CY, 0))
part("pipe_cup", "horn_block", [1, 2, 2], "brass", centre=(-7.25, CY, 0))


def shell_face(n=14, cx=6.0, cy=7.5):
    """The coil seen side-on: a logarithmic spiral seam winding in to a dark umbilicus, rust flames on the outer
    whorl that fade toward the mouth (+x), the rest left to the paint."""
    rows = []
    for y in range(n):
        row = ""
        for x in range(n):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            r = math.hypot(dx, dy)
            th = math.atan2(dy, dx)
            seam = False
            for k in range(-1, 2):
                rk = 1.0 * math.exp(0.19 * (th + math.pi + 2 * math.pi * k))
                if abs(r - rk) < 0.5 and r < 6.0:
                    seam = True
            ch = "."
            ox, oy = x + 0.5 - n / 2, y + 0.5 - n / 2
            if math.hypot(ox, oy) > 6.6:
                ch = "c"                     # the square face's corners fall away: the shell is round
            elif r < 1.2:
                ch = "u"
            elif seam:
                ch = "k"
            elif r > 2.4 and math.sin(th * 6 + r * 0.55) > 0.1 and dx < 4.0:
                ch = "R" if r > 4.4 else "r"
            row += ch
        rows.append(row)
    return rows


MOUTH = ["..nnnn..",
         ".nNddnn.",
         "nNddddn.",
         "nddddddn",
         "nddddddn",
         "ndddddpn",
         "nddddpdn",
         "nddddddn",
         ".ndddpn.",
         ".nnddnn.",
         "..nnnn..",
         "........",
         "........"]
RIM = {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.4, "outline": "dark"}
FLAMES = [{"id": "flames", "op": "stripes", "axis": "x", "period": 1.5, "width": 0.4, "ramp": "flame", "tone": 2.6,
           "faces": ["top", "bottom", "left", "front", "back"], "wobble": 0.5, "range": [-6.0, 3.0]}]
styles = {
    "shell": {"ramp": "shell", "tone": 3.4, "rim": RIM, "brush": {"flow": "horizontal"},
              "layers": FLAMES + [{"id": "sheen", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                                   "density": 0.4, "shift": 1.2}]},
    "shell_face": {"ramp": "shell", "tone": 3.8, "rim": RIM, "brush": {"flow": "horizontal"},
                   "layers": FLAMES,
                   "stamps": [{"faces": ["front", "back"], "at": "top-left", "art": shell_face(),
                               "key": {"k": "flame:0", "u": "flame:1", "r": "flame:3", "R": "flame:2", "c": "shell:1"}}]},
    "mouth": {"ramp": "shell", "tone": 3.0, "rim": RIM, "brush": {"flow": "y"},
              "layers": [{"id": "lip", "op": "band", "axis": "x", "from": 0.4, "to": 1.01, "ramp": "nacre",
                          "tone": 3.6, "faces": ["front", "back", "top", "bottom"]}],
              "stamps": [{"face": "right", "at": "top-left", "art": MOUTH,
                          "key": {"n": "nacre:3", "N": "nacre:5", "d": "flesh:1", "p": "nacre:1"}}]},
    "brass": {"ramp": "brass", "tone": 4.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.8},
              "brush": {"off": True},
              "layers": [{"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                          "density": 0.6, "shift": 1.8}]},
    "brass_dark": {"ramp": "brass", "tone": 3.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.6,
                                                         "dark_shift": -1.4}, "brush": {"off": True}},
    "wood": {"ramp": "wood", "tone": 3.6, "rim": RIM, "brush": {"flow": "y"},
             "layers": [{"id": "grain", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3, "shift": -0.8,
                         "faces": ["front", "back"]}]},
    "foot": {"ramp": "wood", "tone": 3.2, "rim": RIM, "brush": {"flow": "x"},
             "layers": [{"id": "grain", "op": "noise", "scale": 0.8, "amount": 0.6},
                        {"id": "trim", "op": "band", "axis": "y", "from": 0.33, "to": 1.01, "ramp": "brass",
                         "tone": 3.0, "faces": ["sides"], "bevel": {"shadow": 1, "highlight": 0}}]},
}

spec = {
    "name": "Nautilus Horn",
    "description": "The Winterworks Nautilus Horn on its stand: a coiled nautilus shell with tiger flames, a pearly "
                   "mouth and a brass mouthpiece, in the cradle of a small dark-oak stand. Minecraft pixel units, "
                   "density 2; exported as a block model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "budget": {"tris": 200, "colors": 48},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.4, "ao_height": 3.0},
    "brush": {"flow": "horizontal", "length": 1.5, "width": 0.5, "rough": 0.45, "overshoot": 0.3,
              "textures": {"shell": "organic", "wood": "wood", "brass": "metal"}},
    "minecraft": {"fps": 12},
    "render": {"background": "#1c2a33", "hero": [-24, 16], "shadow": 0.4},
    "palette": {"ramps": {k: RAMPS[k] for k in ("shell", "flame", "nacre", "brass", "wood", "flesh")}},
    "styles": styles,
    "parts": R.P,
    "animations": {"idle": {"length": 1.0, "loop": True, "tracks": []}},
}

if __name__ == "__main__":
    out, mod = mod_args(sys.argv[1:], os.path.join(ROOT, "examples", "nautilus_horn.json"))
    dump(spec, out)
    if mod:
        tex, _, models, _ = block_models(spec, {"horn_block": (0.0, 0.0)}, "winterworks:block/nautilus_horn",
                                         "nautilus_horn")
        res = res_dir(mod)
        tex.save(os.path.join(res, "textures", "block", "nautilus_horn.png"))
        write_json(os.path.join(res, "models", "block", "nautilus_horn.json"), models["horn_block"], compact=True)
        write_json(os.path.join(res, "blockstates", "nautilus_horn.json"),
                   {"variants": {"": {"model": "winterworks:block/nautilus_horn"}}})
        write_json(os.path.join(res, "models", "item", "nautilus_horn.json"),
                   {"parent": "minecraft:item/generated", "textures": {"layer0": "winterworks:item/nautilus_horn"}})
        print("texture", tex.size, "elements", len(models["horn_block"]["elements"]))
