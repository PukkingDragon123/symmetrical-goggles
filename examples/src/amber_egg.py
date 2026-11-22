"""Builds examples/amber_egg.json: a Harvester egg sealed in amber, drawn in 3D inside amber blocks (Winterworks).

    python examples/src/amber_egg.py examples/amber_egg.json

The `egg` inclusion of Dig Site amber (mods/winterworks/docs/FIXES_0_4.md, "Reviving it"): a small Harvester egg,
about 5 x 7 x 5 Minecraft pixels, stacked into an egg shape (narrow top, round belly, a flat little foot), mustard
yellow speckled and blotched in dark green like the Harvester Egg block, with one hairline crack near the top.

Units are Minecraft pixels (16 per block), density 2 (seen up close through the amber): every box is a whole number of
texels, so it exports 1:1 to a vanilla entity model (python -m lowpix mc export). The game's amber block-entity
renderer draws it frozen in the middle of the block like `amber_seed`, so it has no clips. Faces +Z, its bottom at
y=0. Parts: egg (the root, its belly) and the stacked rings foot, low, upper, shoulder, tip.
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DENSITY = 2
P = []


def part(id, parent, size, style, y):
    d = {"id": id, "shape": "box", "size": [float(s) if s != int(s) else int(s) for s in size],
         "pivot": [0, y, 0], "style": style}
    assert all(abs(s * DENSITY - round(s * DENSITY)) < 1e-9 for s in size), f"{id}: {size} not whole texels"
    if parent:
        d["parent"] = parent
    P.append(d)
    return d


# the egg: rings stacked from a flat foot to a narrow tip, widest a little below the middle; no two share a face plane
part("egg", None, [5, 2.5, 5], "shell", 2.75)                 # the belly, the root
part("foot", "egg", [3, 0.5, 3], "shell_low", -2.5)
part("low", "egg", [4, 1, 4], "shell_low", -1.75)
part("upper", "egg", [4, 1.5, 4], "shell", 2.0)
part("shoulder", "egg", [3, 1, 3], "shell_crack", 3.25)
part("tip", "egg", [2, 0.5, 2], "shell_top", 4.0)

ramps = {
    "shell": ["#5a380b", "#7c5110", "#9c6913", "#ba8217", "#d39b1f", "#e5b02a", "#f2c63b", "#fbdb5e", "#fff0a0"],
    "moss": ["#0a2119", "#0e3024", "#14412f", "#1b543a", "#236845"],
    "crack": ["#2b1a08", "#fde98e"],
}
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.6, "gradient": 0.5, "ao": 0.4, "ao_height": 3.0}
brush = {"flow": "y", "length": 1.0, "width": 0.4, "rough": 0.4, "overshoot": 0.2, "textures": {"shell": "organic"}}
RIM = {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.0}
SPECKLES = {"id": "speckles", "op": "spots", "count": 14, "radius": [0.3, 0.6], "ramp": "moss", "tone": 2.0,
            "roughness": 0.3, "min_gap": 0.6}
BLOTCHES = {"id": "blotches", "op": "spots", "count": 3, "radius": [0.7, 1.0], "ramp": "moss", "tone": 1.6,
            "roughness": 0.5, "min_gap": 1.5}
styles = {
    "shell": {"ramp": "shell", "tone": 5.6, "rim": RIM, "layers": [SPECKLES, BLOTCHES]},
    "shell_low": {"ramp": "shell", "tone": 4.6, "rim": RIM, "layers": [dict(SPECKLES, count=4)]},
    "shell_top": {"ramp": "shell", "tone": 6.4, "rim": RIM, "layers": [dict(SPECKLES, count=3)]},
    "shell_crack": {"ramp": "shell", "tone": 6.4, "rim": RIM, "layers": [dict(SPECKLES, count=3)],
                    "stamps": [{"face": "front", "at": "top-left", "art": ["...c", "..c.", ".cl."],
                                "key": {"c": "crack:0", "l": "crack:1"}}]},
}

spec = {
    "name": "Amber Egg",
    "description": "A small Harvester egg sealed in amber: stacked into an egg shape, mustard yellow speckled and "
                   "blotched in dark green, a hairline crack near the top. Drawn in 3D inside amber blocks. Minecraft "
                   "pixel units, density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 200, "colors": 24},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 12},
    "render": {"background": "#2a1d16", "hero": [-34, 20], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "amber_egg.json")
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts")
