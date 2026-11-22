"""Builds examples/eye_of_the_ocean.json: the Eye of the Ocean (Winterworks, Tides & Treasures; a block entity).

    python examples/src/eye_of_the_ocean.py examples/eye_of_the_ocean.json

The Elder Guardian's eye set in a cage of guardian scales, like a conduit: a lattice cube of dark prismarine bars with
pale prismarine knobs at its corners, a teal guardian scale at each of the eight corners with an orange spike
pointing out (the guardian's own spikes), and floating in the middle a round eyeball, pale and faintly veined toward
the back, its round amber iris with a round pupil and a catch-light on a card over the front.

Units are Minecraft pixels, density 2. The model's centre is the block's centre (0, 8, 0); the eye looks along +Z.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 6): bones cage (root: the bars and knobs; the idle clip spins
it about Y), scales (child of cage: the eight corner scales; the clip breathes them in and out), eye (root, pivot at
the eye's centre: the renderer turns it to face the nearest player, as the conduit's eye does), pupil (child of eye:
the iris card; the clip darts it about; glow). Clip: idle (4 s loop).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, keys, osc, spin  # noqa: E402
from obsidian_kit import iris_card  # noqa: E402
from ocean_kit import RAMPS, mod_args, write_be_block  # noqa: E402

R = Rig(density=2, bone_style="bar")
part, bone, card = R.part, R.bone, R.card
C = 8.0          # the block's centre height
H = 4.5          # the cage's half size (bar centre lines)

# ======================================================================= the cage
bone("cage", None, at=(0, C, 0))
for k, (x, z) in enumerate(((-H, -H), (H, -H), (-H, H), (H, H))):
    part(f"post{k}", "cage", [1, 10, 1], "bar", centre=(x, C, z))
for k, (y, z) in enumerate(((-H, -H), (H, -H), (-H, H), (H, H))):
    part(f"bar_x{k}", "cage", [8, 1, 1], "bar", centre=(0, C + y, z))
    part(f"bar_z{k}", "cage", [1, 1, 8], "bar", centre=(z, C + y, 0))
corners = [(sx, sy, sz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
for k, (sx, sy, sz) in enumerate(corners):
    part(f"knob{k}", "cage", [1.5, 1.5, 1.5], "knob", centre=(sx * H, C + sy * H, sz * H))

# the eight guardian scales, one on each corner, facing out along the diagonal with a spike
bone("scales", "cage", at=(0, C, 0))
for k, (sx, sy, sz) in enumerate(corners):
    pitch = -math.degrees(math.asin(sy / math.sqrt(3)))
    yaw = math.degrees(math.atan2(sx, sz))
    at = (sx * (H + 0.9), C + sy * (H + 0.9), sz * (H + 0.9))
    sc = part(f"scale{k}", "scales", [3, 3, 0.5], "scale", at=at, rot=(pitch, yaw, 0))
    part(f"spike{k}", sc["id"], [0.5, 0.5, 2], "spike", rel=(0, 0, 0.25), offset=(0, 0, 1.0))

# ======================================================================= the eye
bone("eye", None, at=(0, C, 0))
part("eye_ball", "eye", [6, 6, 6], "sclera", centre=(0, C, 0))
part("eye_ball_x", "eye", [7, 5, 5], "sclera", centre=(0, C, 0))
part("eye_ball_y", "eye", [5, 7, 5], "sclera", centre=(0, C, 0))
part("eye_ball_z", "eye", [5, 5, 7], "sclera_front", centre=(0, C, 0))
card("pupil", "eye", iris_card(10, 4), "iris", at=(0, C, 3.55))

# ======================================================================= paint
ramps = {k: RAMPS[k] for k in ("prismarine", "crystal", "scale", "spike", "sclera", "iris", "tissue")}
RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4, "outline": "dark"}
styles = {
    "bar": {"ramp": "prismarine", "tone": 2.8, "rim": RIM, "brush": {"flow": "long"},
            "layers": [{"id": "cells", "op": "patches", "scale": 1.2, "threshold": 0.55, "shift": 0.8,
                        "space": "world"}]},
    "knob": {"ramp": "crystal", "tone": 3.4, "rim": RIM, "brush": {"off": True}},
    "scale": {"ramp": "scale", "tone": 4.0, "rim": RIM, "brush": {"off": True},
              "layers": [{"id": "ridge", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "shift": 1.0,
                          "faces": ["front", "back"]},
                         {"id": "edge", "op": "panel", "inset": 1, "shift": -0.6, "highlight": 1.0, "shadow": -0.8,
                          "faces": ["front", "back"]}]},
    "spike": {"ramp": "spike", "tone": 2.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.0},
              "brush": {"off": True},
              "layers": [{"id": "tip", "op": "band", "axis": "z", "from": 0.2, "to": 1.01, "ramp": "spike",
                          "tone": 3.8}]},
    "sclera": {"ramp": "sclera", "tone": 5.2, "rim": {"light": 1, "dark": 1, "light_shift": 1.0, "dark_shift": -1.2},
               "brush": {"off": True},
               "layers": [{"id": "veins", "op": "band", "axis": "z", "from": -1.01, "to": -0.4, "ramp": "tissue",
                           "tone": 2.6, "wobble": 0.5, "wobble_scale": 2.0},
                          {"id": "shade", "op": "gradient", "axis": "z", "amount": 0.8}]},
    "sclera_front": {"ramp": "sclera", "tone": 5.8, "rim": {"light": 1, "dark": 1, "light_shift": 1.0,
                                                            "dark_shift": -1.2},
                     "brush": {"off": True},
                     "layers": [{"id": "veins", "op": "band", "axis": "z", "from": -1.01, "to": -0.5,
                                 "ramp": "tissue", "tone": 2.6, "wobble": 0.5, "wobble_scale": 2.0}]},
    "iris": {"ramp": "iris", "tone": 3, "light": 0, "brush": {"off": True},
             "art_key": {"o": "iris:1", "i": "iris:2", "I": "iris:3", "J": "iris:4", "c": "iris:5", "p": "iris:0",
                         "q": "iris:1", "W": "iris:6", "w": "iris:5"}},
}

L = 4.0
tracks = [spin("cage", L, 0.5),
          osc("scales", None, [0.07, 0.07, 0.07], 2, 0.0, ch="scale"),
          osc("eye", None, [0, 0.5, 0], 1, 0.25, ch="position"),
          osc("eye", "z", 3.0, 1, 0.5),
          keys("pupil", None, [[0, [0, 0, 0]], [0.6, [0, 0, 0]], [0.8, [0.45, 0.2, 0]], [1.6, [0.45, 0.2, 0]],
                               [1.8, [-0.4, -0.15, 0]], [2.8, [-0.4, -0.15, 0]], [3.0, [0, 0.3, 0]],
                               [3.6, [0, 0.3, 0]], [3.8, [0, 0, 0]], [4.0, [0, 0, 0]]], ease="ease",
               ch="position")]
ANIM = {"idle": {"length": L, "loop": True, "tracks": tracks}}

spec = {
    "name": "Eye of the Ocean",
    "description": "The Winterworks Eye of the Ocean: the Elder Guardian's round eye floating in a lattice cage of "
                   "dark prismarine with a guardian scale and orange spike on every corner, like a conduit. "
                   "Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "grounded": False,
    "budget": {"tris": 700, "colors": 48},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.85, "gradient": 0.3, "ao": 0.0},
    "brush": {"flow": "horizontal", "length": 1.5, "width": 0.5, "rough": 0.45, "overshoot": 0.3,
              "textures": {"prismarine": "stone"}},
    "minecraft": {"fps": 20, "glow_parts": ["pupil"]},
    "render": {"background": "#0b1e2c", "hero": [-32, 20], "shadow": 0.0},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out, mod = mod_args(sys.argv[1:], os.path.join(ROOT, "examples", "eye_of_the_ocean.json"))
    dump(spec, out)
    if mod:   # the block, blockstate and item files (the model itself: python -m lowpix mc export)
        write_be_block(mod, "eye_of_the_ocean", "minecraft:block/prismarine_bricks", gui_scale=0.6,
                       gui_rot=(30, 200, 0))
