"""Builds examples/cannon.json: the Cannon (Winterworks, Tides & Treasures; a block with a block entity).

    python examples/src/cannon.py examples/cannon.json

A ship's cannon: a bronze barrel weathered green in its shadows, banded with black iron at the breech, the middle,
the chase and the muzzle swell, a round dark bore and a cascabel knob at the back, its trunnions seated in iron cap
squares on the two oak cheeks of a swivelling yoke; the yoke turns on an iron turntable on a heavy oak deck with iron
corner plates.

Units are Minecraft pixels, density 2. The deck fills x, z = -7..7, y = 0..3; the barrel points along +Z (lowpix
front = the block's facing) and overhangs the block (the muzzle reaches z = 13).

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 9): bones base (root: the deck and the turntable), yoke
(child of base, pivot at the turntable's centre, (0, 3, 0): turn it about Y to aim the yaw), barrel (child of yoke,
pivot on the trunnion axis, (0, 9.5, 0): turn it about X to aim the pitch; positive pitch in the game raises the
muzzle, i.e. xRot = -pitch in model space). Clip: fire (0.6 s: the barrel recoils and kicks up, the yoke shudders).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, ring, timeline  # noqa: E402
from ocean_kit import RAMPS, mod_args, write_be_block  # noqa: E402

R = Rig(density=2, bone_style="oak")
part, bone = R.part, R.bone

# ======================================================================= the carriage
bone("base", None, at=(0, 0, 0))
part("deck", "base", [14, 2.5, 14], "deck", centre=(0, 1.25, 0))
for k, (x, z) in enumerate(((-6, -6), (6, -6), (-6, 6), (6, 6))):
    part(f"corner{k}", "base", [2.5, 3, 2.5], "iron", centre=(x, 1.5, z))
part("turntable", "base", [10, 1, 10], "iron_plate", centre=(0, 3.0, 0))
part("turntable_t", "base", [9, 0.5, 9], "iron_plate", centre=(0, 2.75, 0), rot=(0, 45, 0))

# ======================================================================= the yoke (yaw)
bone("yoke", "base", at=(0, 3.5, 0))
part("swivel", "yoke", [6, 1.5, 6], "iron", centre=(0, 4.25, 0))
for s, x in (("l", 3.75), ("r", -3.75)):
    part(f"cheek_{s}", "yoke", [1.5, 6.5, 7], "cheek", centre=(x, 8.0, 0))
    part(f"cap_{s}", "yoke", [2, 1, 3], "iron", centre=(x, 11.5, 0))
    part(f"strap_{s}", "yoke", [2, 6.5, 1], "iron", centre=(x, 8.0, -2.5))

# ======================================================================= the barrel (pitch)
Y = 9.5
bone("barrel", "yoke", at=(0, Y, 0))
part("trunnion", "barrel", [9, 1.5, 1.5], "bronze", centre=(0, Y, 0))
# every round section is a square box and its twin turned 45 degrees about the bore: an octagon in section
def round_section(name, w, d, z, style, twin_style=None):
    part(name, "barrel", [w, w, d], style, centre=(0, Y, z))
    t = w - 0.5 if w >= 3 else w
    part(name + "_r", "barrel", [t, t, d - 0.5 if d > 1 else d], twin_style or style, centre=(0, Y, z),
         rot=(0, 0, 45))


round_section("breech", 5, 4, -3, "bronze")
round_section("reinforce", 4.5, 7, 2.5, "bronze")
round_section("chase", 4, 5, 8.5, "bronze")
round_section("muzzle", 5, 1.5, 11.75, "muzzle", "bronze")
part("cascabel", "barrel", [1, 1, 1.5], "bronze", centre=(0, Y, -5.75))
part("knob", "barrel", [2, 2, 1.5], "bronze", centre=(0, Y, -7.0), rot=(0, 0, 45))
for k, (z, w) in enumerate(((-4.0, 5.5), (-0.5, 5.0), (6.0, 4.5), (10.75, 4.5))):
    part(f"band{k}", "barrel", [w, w, 1], "band", centre=(0, Y, z))
    part(f"band{k}_r", "barrel", [w - 0.5, w - 0.5, 1], "band", centre=(0, Y, z), rot=(0, 0, 45))

# ======================================================================= paint
ramps = {k: RAMPS[k] for k in ("bronze", "patina", "iron", "oak")}
RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4, "outline": "dark"}
BORE = [".kkkk.", "kKKKKk", "kKKKKk", "kKKKKk", "kKKKKk", ".kkkk."]
styles = {
    "oak": {"ramp": "oak", "tone": 3.4, "rim": RIM, "brush": {"flow": "long"}},
    "deck": {"ramp": "oak", "tone": 3.2, "rim": RIM, "brush": {"flow": "x"},
             "layers": [{"id": "planks", "op": "stripes", "axis": "z", "period": 3.5, "width": 0.12, "shift": -1.4,
                         "faces": ["top"]},
                        {"id": "plank_ends", "op": "stripes", "axis": "z", "period": 3.5, "width": 0.12, "shift": -1.4,
                         "faces": ["left", "right"]},
                        {"id": "grain", "op": "noise", "scale": 0.8, "amount": 0.5},
                        {"id": "bolts", "op": "rivets", "inset": 1, "spacing": 7, "highlight": 2.0, "shadow": -1.2,
                         "faces": ["front", "back", "left", "right"]}]},
    "cheek": {"ramp": "oak", "tone": 3.8, "rim": RIM, "brush": {"flow": "y"},
              "layers": [{"id": "grain", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.3, "shift": -0.8,
                          "faces": ["left", "right"]}]},
    "iron": {"ramp": "iron", "tone": 3.4, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "bolt", "op": "rivets", "inset": 1, "spacing": 6, "highlight": 2.0, "shadow": -1.0,
                         "min_size": 4}]},
    "iron_plate": {"ramp": "iron", "tone": 3.0, "rim": RIM, "brush": {"off": True},
                   "layers": [{"id": "ring", "op": "panel", "inset": 1, "shift": -0.8, "highlight": 1.2,
                               "shadow": -1.0, "faces": ["top"]}]},
    "bronze": {"ramp": "bronze", "tone": 4.2, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.8,
                                                     "outline": "dark"},
               "brush": {"flow": "z"},
               "layers": [{"id": "patina", "op": "patches", "scale": 1.3, "threshold": 0.56, "ramp": "patina",
                           "tone": 2.6, "space": "world", "max_light": 0.1, "bevel": {"shadow": 1, "highlight": 0}},
                          {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 0,
                           "density": 0.6, "shift": 1.6}]},
    "band": {"ramp": "iron", "tone": 2.6, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                         "density": 0.4, "shift": 1.6}]},
    "muzzle": {"ramp": "bronze", "tone": 4.6, "rim": RIM, "brush": {"off": True},
               "stamps": [{"face": "front", "at": "center", "art": BORE,
                           "key": {"k": "iron:1", "K": "iron:0"}}]},
}

# fire: the barrel slams back and kicks the muzzle up, the yoke shudders, everything settles
KICK = {"barrel": {"p": [0, 0, -2.2], "r": [-7, 0, 0]}, "yoke": {"p": [0, 0, -0.3]}}
ANIM = {"fire": timeline(0.6, [(0.0, {}, None), (0.05, KICK, "out"),
                               (0.3, {"barrel": {"p": [0, 0, -0.6], "r": [-2, 0, 0]}}, "ease"), (0.6, {}, "ease")],
                         lock=False, extra=[ring("yoke", 0.05, 2.5, freq=12, decay=9, axis=1, end=0.6)]),
        "idle": {"length": 1.0, "loop": True, "tracks": []}}

spec = {
    "name": "Cannon",
    "description": "The Winterworks Cannon: an iron-banded bronze barrel on a swivelling oak yoke over an iron "
                   "turntable and an oak deck. Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "budget": {"tris": 500, "colors": 40},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.85, "gradient": 0.4, "ao": 0.5, "ao_height": 4.0},
    "brush": {"flow": "horizontal", "length": 1.5, "width": 0.5, "rough": 0.45, "overshoot": 0.3,
              "textures": {"oak": "wood", "bronze": "metal", "iron": "metal"}},
    "minecraft": {"fps": 24},
    "render": {"background": "#1a2633", "hero": [-38, 22], "shadow": 0.45},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out, mod = mod_args(sys.argv[1:], os.path.join(ROOT, "examples", "cannon.json"))
    dump(spec, out)
    if mod:   # the block, blockstate and item files (the model itself: python -m lowpix mc export)
        write_be_block(mod, "cannon", "minecraft:block/dark_oak_planks", gui_scale=0.5, gui_rot=(30, 135, 0),
                       gui_y=-0.5)
