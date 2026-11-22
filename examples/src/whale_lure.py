"""Builds examples/whale_lure.json: the Whale Lure (Winterworks, Tides & Treasures; a block with a block entity).

    python examples/src/whale_lure.py examples/whale_lure.json

A deep-sea fishing lure made of an Angler Light and eight prismarine crystals: a prismarine plinth with an octagonal
step, two crossed prismarine arches over it meeting under a turned cap, eight pale prismarine crystals bristling
outward round the plinth's rim; from the middle of the plinth a dark fleshy stalk rises, bends forward and over, and
from its tip hangs the lure itself: a round glowing bulb of cyan-white light under a fleshy cap, two fine filaments
trailing under it.

Units are Minecraft pixels (16 per block), density 2, every box a whole number of texels, so the model exports to a
vanilla entity model (python -m lowpix mc export). The block fills x, z = -8..8, y = 0..16; faces +Z.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md sections 2 and 8): bones frame (root: plinth, arches, cap, crystals),
stalk (child of frame, pivot at its foot on the plinth; segments stalk_0..2), bulb (child of the stalk's tip, pivot at
the bulb's centre, so the renderer can scale it to pulse; glow: every bulb part, the `lure` ramp). Clip: idle (3 s
loop: the stalk sways, the bulb bobs and breathes, the filaments trail).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, osc  # noqa: E402
from ocean_kit import RAMPS, mod_args, write_be_block  # noqa: E402

R = Rig(density=2, bone_style="prismarine")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= the frame
bone("frame", None, at=(0, 0, 0))
part("plinth", "frame", [13, 1.5, 13], "plinth", centre=(0, 0.75, 0))
part("plinth_step", "frame", [9.5, 1, 9.5], "prismarine", centre=(0, 2.0, 0), rot=(0, 45, 0))
# two arches crossing over the corners, so every side stays open
for k, (x, z) in enumerate(((-5.0, -5.0), (5.0, 5.0), (5.0, -5.0), (-5.0, 5.0))):
    part(f"arch_post{k}", "frame", [1.5, 11, 1.5], "post", centre=(x, 7.0, z), rot=(0, 45, 0))
part("arch_x", "frame", [15, 1.5, 1.5], "prismarine", centre=(0, 13.25, 0), rot=(0, 45, 0))
part("arch_z", "frame", [15, 1, 1.5], "prismarine", centre=(0, 13.25, 0), rot=(0, -45, 0))
part("cap", "frame", [3, 1.5, 3], "prismarine_lit", centre=(0, 14.5, 0), rot=(0, 45, 0))
for k in range(8):
    a = math.radians(22.5 + 45 * k)
    x, z = 5.0 * math.sin(a), 5.0 * math.cos(a)
    part(f"crystal{k}", "frame", [1, 3, 1], "crystal", at=(x, 1.5, z), offset=(0, 1.5, 0),
         wrot=(28 * math.cos(a), 0, -28 * math.sin(a)))

# ======================================================================= the stalk and the lure
bone("stalk", "frame", at=(0, 2.5, 0))
part("stalk_0", "stalk", [1.5, 6.5, 1.5], "stalk", at=(0, 2.5, -1.5), offset=(0, 3.25, 0), rot=(-10, 0, 0))
part("stalk_1", "stalk_0", [1.5, 3, 1.5], "stalk", rel=(0, 6.5, 0), offset=(0, 1.5, 0), rot=(45, 0, 0))
part("stalk_2", "stalk_1", [1, 2.5, 1], "stalk", rel=(0, 3, 0), offset=(0, 1.25, 0), rot=(70, 0, 0))
# the bulb hangs under the stalk's tip; its bone's pivot is its centre (the renderer scales it to pulse)
tip = R.wpos("stalk_2", (0, 2.5, 0))
bone("bulb", "stalk_2", at=(tip[0], tip[1] - 2.6, tip[2]), wrot=(0, 0, 0))
by = tip[1] - 2.6
part("bulb_cap", "bulb", [2, 1, 2], "flesh", centre=(tip[0], by + 2.25, tip[2]))
part("bulb_core", "bulb", [3.5, 3.5, 3.5], "lure_core", centre=(tip[0], by, tip[2]))
part("bulb_x", "bulb", [4.5, 2.5, 2.5], "lure", centre=(tip[0], by, tip[2]))
part("bulb_y", "bulb", [2.5, 4.5, 2.5], "lure", centre=(tip[0], by, tip[2]))
part("bulb_z", "bulb", [2.5, 2.5, 4.5], "lure", centre=(tip[0], by, tip[2]))
FIL = ["g", "g", "G", "g", "G", "W"]
card("filament_a", "bulb", FIL, "filament", at=(tip[0] - 0.75, by - 2.25, tip[2]), offset=(0, -1.5, 0), rot=(0, 30, 0))
card("filament_b", "bulb", FIL[:5], "filament", at=(tip[0] + 0.75, by - 2.25, tip[2] + 0.5), offset=(0, -1.25, 0),
     rot=(0, -40, 0))

# ======================================================================= paint
ramps = {k: RAMPS[k] for k in ("prismarine", "crystal", "lure", "flesh")}
RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4, "outline": "dark"}
PRIS = [{"id": "cells", "op": "patches", "scale": 1.4, "threshold": 0.5, "shift": 0.9, "space": "world",
         "bevel": {"shadow": 1, "highlight": 1}},
        {"id": "grain", "op": "noise", "scale": 1.0, "amount": 0.5}]
styles = {
    "prismarine": {"ramp": "prismarine", "tone": 3.6, "rim": RIM, "layers": PRIS},
    "prismarine_lit": {"ramp": "prismarine", "tone": 5.0, "rim": RIM, "layers": PRIS},
    "plinth": {"ramp": "prismarine", "tone": 3.2, "rim": RIM,
               "layers": PRIS + [{"id": "trim", "op": "panel", "inset": 1, "shift": -0.8, "highlight": 1.2,
                                  "shadow": -1.0, "faces": ["sides"]}]},
    "post": {"ramp": "prismarine", "tone": 3.8, "rim": RIM, "brush": {"flow": "y"},
             "layers": PRIS + [{"id": "rings", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.18,
                                "shift": -1.2}]},
    "crystal": {"ramp": "crystal", "tone": 3.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4},
                "brush": {"off": True},
                "layers": [{"id": "tip", "op": "band", "axis": "y", "from": 0.4, "to": 1.01, "ramp": "crystal",
                            "tone": 4.8}]},
    "stalk": {"ramp": "flesh", "tone": 3.6, "rim": RIM, "brush": {"flow": "y"},
              "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3, "shift": -0.9},
                         {"id": "glow_tint", "op": "gradient", "axis": "y", "amount": 0.6}]},
    "flesh": {"ramp": "flesh", "tone": 4.4, "rim": RIM, "brush": {"off": True}},
    "lure": {"ramp": "lure", "tone": 4.4, "light": 0.3, "dither": 0.0, "brush": {"off": True}, "rim": {"light": 1, "dark": 0,
                                                                                       "light_shift": 1.2}},
    "lure_core": {"ramp": "lure", "tone": 5.8, "light": 0.3, "dither": 0.0, "brush": {"off": True},
                  "rim": {"light": 1, "dark": 0, "light_shift": 1.0}},
    "filament": {"ramp": "lure", "tone": 4.0, "light": 0.0, "brush": {"off": True},
                 "art_key": {"g": "lure:3", "G": "lure:5", "W": "lure:7"}},
}

BULB = [p["id"] for p in R.P if p["id"].startswith(("bulb_", "filament"))]
L = 3.0
tracks = [osc("stalk_0", "z", 3.0, 1, 0.0), osc("stalk_0", "x", 2.0, 1, 0.3),
          osc("stalk_1", "x", 4.0, 1, 0.15), osc("stalk_2", "x", 5.0, 1, 0.3),
          osc("bulb", None, [0, 0.35, 0], 2, 0.1, ch="position"),
          osc("bulb", None, [0.06, 0.06, 0.06], 2, 0.35, ch="scale"),
          osc("filament_a", "x", 12, 1, 0.5), osc("filament_b", "x", 10, 1, 0.7),
          osc("filament_a", "z", 6, 2, 0.2), osc("filament_b", "z", -6, 2, 0.4)]
ANIM = {"idle": {"length": L, "loop": True, "tracks": tracks}}

spec = {
    "name": "Whale Lure",
    "description": "The Winterworks Whale Lure: a prismarine plinth bristling with prismarine crystals under two "
                   "crossed arches, and from its middle a fleshy stalk curling over to hang a glowing cyan-white "
                   "anglerfish lure. Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "budget": {"tris": 600, "colors": 48},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.85, "gradient": 0.4, "ao": 0.5, "ao_height": 4.0},
    "brush": {"flow": "horizontal", "length": 1.5, "width": 0.5, "rough": 0.45, "overshoot": 0.3,
              "textures": {"prismarine": "stone", "flesh": "organic"}},
    "minecraft": {"fps": 20, "glow_parts": BULB, "glow_ramps": ["lure"]},
    "render": {"background": "#0b1e2c", "hero": [-32, 18], "shadow": 0.4},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out, mod = mod_args(sys.argv[1:], os.path.join(ROOT, "examples", "whale_lure.json"))
    dump(spec, out)
    if mod:   # the block, blockstate and item files (the model itself: python -m lowpix mc export)
        write_be_block(mod, "whale_lure", "minecraft:block/prismarine", gui_scale=0.6)
