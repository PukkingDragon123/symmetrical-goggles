"""Builds examples/falling_meteorite.json: a falling meteorite (Winterworks "Living End", END_UPDATE.md section 16).

    python examples/src/falling_meteorite.py examples/falling_meteorite.json

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/falling_meteorite.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/falling_meteorite

A lumpy rock of meteorite, a stepped ball of crust with lumps knocked out of it at odd angles, its scorched fusion crust
(warm black-brown, cool iron-nickel glints) split everywhere by molten fissures glowing white-gold at heart, orange,
rose and violet at the edges, the lumps facing the fall white-hot; behind it two crossed pairs of flame cards stream
back, white-gold at the rock, orange, then rose and violet at their ragged tips. The game draws it big, a fiery glow
shell round it and a long trail behind (client.end.FallingMeteoriteRenderer).

Units are Minecraft pixels, density 2. The meteorite flies toward +Z (Minecraft -Z): the rock's centre is the root
joint at lowpix (0, 24, 0) = Minecraft model (0, 0, 0), the flames trail toward -Z. Bones: meteor (root), rock (the
rock, rolling about its flight), flames (the flame cards, flickering). Glow: every molten texel and the flames. Clip:
fall (2 s loop).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, osc, spin  # noqa: E402
from obsidian_kit import RAMPS  # noqa: E402

R = Rig(density=2, bone_style="crust")
part, bone, card = R.part, R.bone, R.card

C = 24.0
bone("meteor", None, at=(0, C, 0))
bone("rock", "meteor", at=(0, C, 0))
# a stepped ball (a cube crossed by three bars), turned off the axes, with lumps knocked out of it at odd angles
part("rock_core", "rock", [8.0, 8.0, 8.0], "crust", rel=(0, 0, 0), rot=(10, 14, 25))
part("rock_x", "rock_core", [11.0, 6.0, 6.0], "crust", rel=(0, 0.5, 0))
part("rock_y", "rock_core", [6.0, 11.0, 6.0], "crust", rel=(-0.5, 0, 0.5))
part("rock_z", "rock_core", [6.0, 6.0, 11.0], "crust_hot", rel=(0.5, -0.5, 0))
LUMPS = [((3.5, 2.5, 1.5), (5.0, 4.0, 5.0), (20, 35, 10), "crust"), ((-3.0, -3.0, 2.5), (5.0, 5.0, 4.0), (-15, 20, 30), "crust_hot"),
         ((-3.5, 3.0, -2.0), (5.0, 4.0, 4.0), (30, -25, 15), "crust"), ((3.0, -3.0, -2.5), (4.0, 5.0, 5.0), (-25, 40, -20), "crust"),
         ((0.5, 1.5, 4.0), (5.0, 4.0, 4.0), (10, 15, 40), "crust_hot"), ((1.0, 4.0, -1.0), (4.0, 3.0, 4.0), (45, 10, 25), "crust"),
         ((-4.0, 0.0, 1.0), (3.0, 5.0, 4.0), (5, -30, 50), "crust"), ((1.5, -4.0, 1.5), (4.0, 3.0, 4.0), (35, 60, 5), "crust_hot")]
for k, (at, size, rot, style) in enumerate(LUMPS):
    part(f"rock_lump_{k}", "rock_core", list(size), style, rel=at, rot=rot)


# ======================================================================= the flames
def flame(length, width, seed):
    """Flame art along its length (row 0 at the rock, row length-1 at the tail), `width` across: a hot core that
    narrows and cools down the trail, licked by ragged tongues."""
    rng = random.Random(seed)
    tongues = [rng.uniform(0.55, 1.0) for _ in range(width)]
    for _ in range(2):          # smooth the tongue lengths a little so they come in licks, not noise
        tongues = [(tongues[max(0, j - 1)] + 2 * tongues[j] + tongues[min(width - 1, j + 1)]) / 4 for j in range(width)]
    rows = []
    for i in range(length):
        f = i / (length - 1)
        row = ""
        for j in range(width):
            u = abs(j + 0.5 - width / 2) / (width / 2)          # 0 in the middle, 1 at the edges
            reach = tongues[j] * (1.0 - 0.75 * u ** 1.6)       # how far down the trail this column burns
            bulge = 0.55 + 0.45 * math.sin(min(1.0, f * 3.0) * math.pi / 2)
            if u > bulge or f > reach:
                row += "."
                continue
            heat = (1 - f / max(reach, 1e-3)) ** 0.8 * (1 - 0.5 * u)
            row += "W" if heat > 0.8 else "Y" if heat > 0.62 else "a" if heat > 0.45 else "o" if heat > 0.3 else \
                "r" if heat > 0.16 else "v"
        rows.append(row)
    return rows


FLAME_KEY = {"W": "molten:8", "Y": "molten:6", "a": "molten:5", "o": "molten:4", "r": "molten:2", "v": "molten:1"}
bone("flames", "meteor", at=(0, C, 0))
for k, (plane, roll, ln, wd) in enumerate([("xz", 0, 64, 26), ("yz", 0, 64, 26), ("xz", 45, 48, 20), ("yz", 45, 48, 20)]):
    art = flame(ln, wd, 11 + k)
    if plane == "xz":           # image top = -Z: the tail at the top
        rows = art[::-1]
    else:                       # image left = +Z: the rock on the left, rows across (Y)
        rows = ["".join(art[i][j] for i in range(ln)) for j in range(wd)]
    card(f"flame_{k}", "flames", rows, "flame", plane=plane, rel=(0, 0, -ln / 4 + 3.0), rot=(0, 0, roll))

# ======================================================================= palette and paint
ramps = {k: RAMPS[k] for k in ("meteor", "molten")}
CRUST_RIM = {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.2, "outline": "dark"}
PITS = {"id": "pits", "op": "patches", "scale": 1.6, "threshold": 0.55, "shift": -1.1,
        "bevel": {"shadow": 1, "highlight": 1, "highlight_shift": 1.6}}
FISSURES = {"id": "fissures", "op": "cracks", "scale": 5.0, "width": 0.04, "threshold": 0.32, "ramp": "molten",
            "tone": 1.8, "seed": 5}
FISSURES_HOT = {"id": "fissures_hot", "op": "cracks", "scale": 5.0, "width": 0.016, "threshold": 0.32, "ramp": "molten",
                "tone": 5.8, "seed": 5}
GLINT = {"id": "glint", "op": "gloss", "post": True, "dash": True, "length": 1, "inset": 0, "density": 0.4,
         "shift": 2.4, "ramps": ["meteor"]}
styles = {
    "crust": {"ramp": "meteor", "tone": 3.2, "rim": CRUST_RIM, "brush": {"off": True},
              "layers": [PITS, FISSURES, FISSURES_HOT, GLINT]},
    # the side facing the fall: the crust melting away, molten glowing through
    "crust_hot": {"ramp": "meteor", "tone": 3.4, "rim": CRUST_RIM, "brush": {"off": True},
                  "layers": [PITS, dict(FISSURES, width=0.06, tone=2.4), dict(FISSURES_HOT, width=0.025, tone=6.5),
                             {"id": "melt", "op": "fill", "ramp": "molten", "tone": 5.2, "faces": ["front"]},
                             {"id": "melt_crust", "op": "patches", "scale": 1.3, "threshold": 0.58, "ramp": "molten",
                              "tone": 2.2, "faces": ["front"]},
                             {"id": "melt_hot", "op": "patches", "scale": 1.0, "threshold": 0.6, "ramp": "molten",
                              "tone": 7.2, "faces": ["front"], "seed": 9}, GLINT]},
    "flame": {"ramp": "molten", "tone": 5.0, "light": 0.0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
              "art_key": FLAME_KEY},
}

ANIM = {"fall": {"length": 2.0, "loop": True, "tracks": [
    spin("rock", 2.0, 1.0, axis="z"),
    osc("rock", "x", 6, 1, 0.25),
    osc("flames", None, [0.12, 0.12, 0.18], 4, 0.0, ch="scale"),
] + [osc(f"flame_{k}", None, [0.1, 0.1, 0.22], 3, k / 4.0, ch="scale") for k in range(4)]}}

spec = {
    "name": "Falling Meteorite",
    "description": "A falling meteorite for the Winterworks End: a lumpy rock of scorched meteorite crust split by "
                   "molten fissures, trailing crossed flames. Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "grounded": False,
    "budget": {"tris": 300, "colors": 24},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.2, "ao": 0.0},
    "minecraft": {"fps": 20, "glow_parts": [f"flame_{k}" for k in range(4)], "glow_ramps": ["molten"]},
    "render": {"background": "#1a1424", "hero": [-50, 18], "shadow": 0.0},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "falling_meteorite.json")
    dump(spec, out)
