"""Builds examples/monolith_wand.json: the Monolith Wand (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/monolith_wand.py examples/monolith_wand.json

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/monolith_wand.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/monolith_wand

A vanilla-style staff: a void-rod shaft (violet-black, speckled with glowing stars) banded with three rough rings of
meteorite crust, each with a molten seam glowing through. Below the grip a crusted meteorite pommel and, under it, the
glowing meteorite core turned on its point like a gem. Above, on a crust collar, a crown of seven blocky meteorite
shards (scorched crust, white-hot molten tips; the back ones tallest, the front ones short so the eye shows) round one
of the Monolith's eyes: a small obsidian block with the Monolith's flat glowing violet eye on its face (a heavy lid,
a violet slit, a bright 2 x 2 pupil), amid orbiting meteorite embers.

The hand holds the shaft at the root joint, which sits at lowpix (0, 24, 0) = Minecraft model (0, 0, 0); the wand
stands straight up from there (lowpix +Y, Minecraft -Y), the eye looks forward (lowpix +Z, Minecraft -Z). Units are
Minecraft pixels, density 1 (one texel per pixel, like vanilla), every box whole pixels.

Contract (mods/winterworks/docs/END_UPDATE.md sections 11 and 16). Bones: rod (root: shaft, bands, pommel), head (the
collar and the crown, on top of the rod), eye (the eye inside it: eye_ball, the block with the painted eye). Extra:
embers (the orbiting meteorite embers ember_0..5, a child of head), pommel_tip (the core). Glow: the eye, the stars,
every molten texel (seams, shard tips, the core, the embers). Clip: idle (3 s loop: the eye throbs and bobs, the
embers circle it, the hot chips pulse).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import (LIGHT, ROOT, Rig, dump, euler, obsidian, osc, ramps, rot_matrix, skin,  # noqa: E402
                             spin)
from obsidian_kit import scatter  # noqa: E402

R = Rig(density=1, bone_style="crust")
part, bone = R.part, R.bone


def lean(a, deg, twist=0.0):
    """A world rotation that tips +Y `deg` degrees out toward compass angle `a` (degrees, 0 = +Z, 90 = +X), after a
    `twist` about the part's own long axis (45 shows a shard's edge, not its face)."""
    ax, az = math.sin(math.radians(a)), math.cos(math.radians(a))
    return euler(rot_matrix((deg * az, 0, -deg * ax)) @ rot_matrix((0, twist, 0)))


G = 24.0                      # the grip (Minecraft y = 0)
bone("rod", None, at=(0, G, 0))
part("shaft", "rod", [2, 16, 2], "void", centre=(0, G + 1, 0))               # y 17 .. 33

# ======================================================================= meteorite bands round the shaft
for k, y in enumerate([G + 2.5, G - 3.5, G + 6.5]):
    part(f"band_{k}", "rod", [3, 1, 3], "crust_band", centre=(0, y, 0))

# ======================================================================= the meteorite-core pommel
PY = G - 8.0
part("pommel", "rod", [3, 2, 3], "crust", centre=(0, PY, 0))                  # y 15 .. 17
part("pommel_tip", "pommel", [2, 2, 2], "core", centre=(0, PY - 2.2, 0), rot=(35.264, 45, 0))

# ======================================================================= the head: collar and a crown of shards
HY = G + 9.0
bone("head", "rod", at=(0, HY, 0))
part("collar", "head", [4, 1, 4], "crust_band", centre=(0, HY + 0.5, 0))      # y 33 .. 34
part("collar_top", "collar", [5, 1, 5], "crust", centre=(0, HY + 1.5, 0))     # y 34 .. 35
# (compass angle, height, lean): a crown flaring out round the eye, tallest at the back, the two in front low
CROWN = [(180, 6, 12), (125, 5, 18), (235, 5, 18), (70, 4, 26), (290, 4, 26), (20, 2, 40), (340, 2, 40)]
for k, (a, h, l0) in enumerate(CROWN):
    ax, az = math.sin(math.radians(a)), math.cos(math.radians(a))
    lo = part(f"shard_{k}", "head", [2, h, 2], "shard", at=(2.5 * ax, HY + 2.0, 2.5 * az),
              offset=(0, h / 2, 0), wrot=lean(a, l0, 45))
    part(f"shard_{k}_tip", lo["id"], [1, 2, 1], "shard_tip", rel=(0, h - 0.3, 0), offset=(0, 1.0, 0),
         wrot=lean(a, l0 - 10, 45))

# ======================================================================= the eye and the embers
EY = HY + 5.0
bone("eye", "head", at=(0, EY, 0))
part("eye_ball", "eye", [4, 4, 4], "eye_block", rel=(0, 0, 0))
bone("embers", "head", at=(0, EY, 0))
# (radius, height, hot?): white-hot chips and crusted cinders
EMBERS = [(4.5, 1.5, True), (4.5, -1.0, True), (4.5, 0.5, False), (5.0, -2.0, True), (4.5, 2.5, True),
          (5.0, 0.0, False)]
for k, (rr, y, hot) in enumerate(EMBERS):
    a = math.radians(60 * k + 25)
    part(f"ember_{k}", "embers", [1, 1, 1], "ember" if hot else "cinder", rel=(rr * math.sin(a), y, rr * math.cos(a)),
         rot=(35 + 20 * k, 30 * k, 45))

# ======================================================================= palette and paint
RAMPS = ramps("eyeglow", "obsidian", "crying", "void", "star", "meteor", "molten")
CRUST = dict(grain=0.9, grain_scale=0.6, lip=1.6, shade=-1.0, dark_low=0)
SEAM = {"id": "seam", "op": "band", "axis": "y", "from": -0.2, "to": 0.2, "ramp": "molten", "tone": 3.6,
        "faces": ["sides"]}
STARS = scatter(2, 16, seed=7, density=0.08, chars="ssSt")
styles = {
    "crust": skin("meteor", 3.6, layers=[{"id": "pits", "op": "speckle", "density": 0.15, "shift": -1.4}, SEAM],
                  **CRUST),
    "crust_band": skin("meteor", 3.8, layers=[
        {"id": "pits", "op": "speckle", "density": 0.15, "shift": -1.4},
        {"id": "seam", "op": "patches", "scale": 0.9, "threshold": 0.6, "ramp": "molten", "tone": 3.4, "faces": ["sides"]}],
        **CRUST),
    # the shards: crust darkening toward the root, a molten crack up the middle
    "shard": skin("meteor", 3.8, layers=[{"id": "rise", "op": "gradient", "axis": "y", "amount": 1.0},
                                         {"id": "crack", "op": "band", "axis": "x", "from": -0.2, "to": 0.2,
                                          "ramp": "molten", "tone": 2.6, "faces": ["front", "back"]}], **CRUST),
    # white-hot shard tips: rose at the root, orange, gold, white at the point
    "shard_tip": skin("molten", 4.6, grain=0.3, light=0.3, lip=1.0, shade=-1.6, clusters=False, dark_low=0,
                      layers=[{"id": "heat", "op": "gradient", "axis": "y", "amount": 2.0}]),
    "core": skin("molten", 5.4, grain=0.6, light=0.2, lip=1.0, shade=-1.6, clusters=False, dark_low=0),
    "ember": skin("molten", 5.4, grain=0.3, light=0.3, lip=1.2, shade=-1.8, clusters=False, dark_low=0),
    "cinder": skin("meteor", 3.4, grain=0.5, lip=1.6, shade=-1.0, clusters=False, dark_low=0),
    # the void rod: violet-black, a drifting nebula, glowing stars
    "void": skin("void", 2.6, grain=0.8, light=0.6, lip=1.4, shade=-1.0, dark_low=0,
                 layers=[{"id": "nebula", "op": "patches", "scale": 1.6, "threshold": 0.55, "shift": 1.4}],
                 stamps=[{"faces": ["sides"], "at": [0, 0], "art": STARS,
                          "key": {"s": "star:1", "S": "star:2", "t": "star:3"}}]),
    # the eye: a small obsidian block with the Monolith's flat eye painted on its face
    "eye_block": obsidian(3.4, tears=0.4, stamps=[{"face": "front", "at": "top-left",
                                                   "art": ["kkkk", "aWwa", "abba", ".kk."],
                                                   "key": {"k": "obsidian:0", "a": "eyeglow:1", "b": "eyeglow:3",
                                                           "W": "eyeglow:6", "w": "eyeglow:5"}}]),
}

# ======================================================================= clip
L = 3.0
HOT_EMBERS = [k for k, e in enumerate(EMBERS) if e[2]]
ANIM = {"idle": {"length": L, "loop": True, "tracks": [
    spin("embers", L, 1.0),
    osc("eye", None, [0, 0.3, 0], 1, ch="position"),
    osc("eye", None, [0.08, 0.08, 0.08], 2, 0.2, ch="scale"),
    osc("eye", "y", 8, 1, 0.5),
    osc("embers", None, [0, 0.4, 0], 2, 0.3, ch="position"),
] + [osc(f"ember_{k}", None, [0.25, 0.25, 0.25], 3, k / 6.0, ch="scale") for k in HOT_EMBERS]}}

GLOW = ["pommel_tip"] + [f"ember_{k}" for k in HOT_EMBERS]
spec = {
    "name": "Monolith Wand",
    "description": "The Winterworks Monolith Wand in vanilla style: a starry void-rod shaft banded with molten-seamed "
                   "meteorite, a glowing meteorite-core pommel, and a crown of blocky meteorite shards with white-hot "
                   "tips round a small obsidian block bearing the Monolith's flat glowing violet eye, amid orbiting "
                   "embers. Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "grounded": False,
    "budget": {"tris": 400, "colors": 48},
    "light": dict(LIGHT, gradient=0.3, ao=0.0),
    "minecraft": {"fps": 20, "glow_parts": GLOW, "glow_ramps": ["eyeglow", "crying", "star", "molten"]},
    "render": {"background": "#2a2735", "hero": [-30, 14], "shadow": 0.3},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "monolith_wand.json")
    dump(spec, out)
