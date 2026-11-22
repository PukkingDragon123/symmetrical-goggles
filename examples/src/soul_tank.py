"""Builds examples/soul_tank.json: the Soul Tank (Winterworks, Hexes & Havoc; a full block with a block entity).

    python examples/src/soul_tank.py examples/soul_tank.json

A reinforced glass tank of souls: a heavy netherite plinth and cap with gold trim and gold corner studs, four
netherite corner posts banded in gold and riveted, a gold valve wheel on top, a pressure gauge with a gold bezel
bolted to the front, and inside, on a bed of soul sand, a swirl of soul wisps: little ghost faces with curling
tails, glowing soul-fire cyan.

Units are Minecraft pixels (16 per block), density 1 (vanilla block texel size), every box a whole number of pixels,
so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). The block fills x, z = -8..8 and
y = 0..16; faces +Z (the gauge side). The wisps are cards.

Contract (mods/winterworks/docs/HEXES_UPDATE.md sections 2 and 9): bones frame (root: plinth, posts, cap, valve,
gauge dial), glass (alpha 0.35: draw it translucent), souls (the wisp swirl; its pivot is the centre of the tank
floor, so the game can spin it about Y and scale it by the fill level from the floor up), gauge_needle (pivot at the
dial centre; rotate it about Z to show the fill). Glow: the soul wisps and the soul sand's embers. Clip: idle (loop:
the souls swirl round and bob, the needle quivers).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, SOUL_KEY, Rig, dump, keys, osc, spin  # noqa: E402

R = Rig(density=1, bone_style="netherite")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= the netherite frame
part("frame", None, [16, 2, 16], "plinth", at=(0, 0, 0), centre=(0, 1, 0))
part("cap", "frame", [16, 2, 16], "cap", centre=(0, 14, 0))
for k, (x, z) in enumerate([(6, 6), (-6, 6), (-6, -6), (6, -6)]):
    p = part(f"post{k}", "frame", [3, 11, 3], "post", centre=(x, 7.5, z))
    part(f"band{k}", p["id"], [4, 1, 4], "gold", centre=(x, 8, z))
    part(f"foot{k}", p["id"], [4, 1, 4], "netherite_dark", centre=(x, 2.5, z))
    part(f"corner{k}", "cap", [2, 1, 2], "gold", centre=(x / 6 * 7, 15.5, z / 6 * 7))
# a gold valve wheel on top (a rim round a hub; spokes painted)
part("valve", "cap", [5, 1, 5], "gold_ring", centre=(0, 15.5, 0), rot=(0, 45, 0))
part("valve_hub", "valve", [2, 1, 2], "gold", rel=(0, 0, 0))
# the pressure gauge: a gold bezel (an octagon of two crossed plates) bolted to the front over the tank's foot
part("gauge", "frame", [6, 4, 1], "gold", centre=(0, 3.5, 7.5))
part("gauge_b", "gauge", [4, 6, 1], "gold", centre=(0, 3.5, 7.4))
part("dial", "gauge", [4, 4, 1], "dial", centre=(0, 3.5, 7.6))
card("gauge_needle", "dial", ["n", "n", "N"], "needle", at=(0, 3.5, 8.15), offset=(0, 1.0, 0), rot=(0, 0, 30))

# ======================================================================= the glass tank and the souls inside
part("glass", "frame", [12, 11, 12], "glass", centre=(0, 7.5, 0))
part("soul_sand", "frame", [11, 1, 11], "soul_sand", centre=(0, 2.5, 0))
bone("souls", "frame", at=(0, 3, 0))
# little ghosts with curling tails (the eyes are holes), facing out of the tank, leaning into the swirl
WISPS = [[".eEEe.", "EwWWwE", "W.WW.W", "EwWWwE", ".EWwE.", "..EWe.", "...Ee.", "....e."],
         [".eEe.", "EwWwE", "W.W.W", "EwWwE", ".EWE.", ".eWe.", "eE...", "e...."],
         [".eEEe", "eWwwE", "E.w.W", "EWwwE", ".eWE.", "..eE.", "...e."]]
for k in range(8):
    a = k * 45.0
    rad = 3.6 if k % 2 == 0 else 2.7
    y = 3.9 + (k % 3) * 1.15 + (k % 2) * 0.5
    x, z = rad * math.sin(math.radians(a)), rad * math.cos(math.radians(a))
    card(f"soul_{k}", "souls", WISPS[k % 3], "wisp", rel=(x, y, z), rot=(0, a, -16))
# the vortex at the heart of the swirl: two crossed ribbons of soul fire
SWIRL = ["..e.", ".eE.", "eW..", "EW..", ".Ww.", "..WE", "..WE", ".wW.", "EW..", "eE..", ".e.."]
card("soul_swirl", "souls", SWIRL, "wisp", rel=(0, 5.0, 0), rot=(0, 45, 0))
card("soul_swirl_b", "soul_swirl", SWIRL[::-1], "wisp", rel=(0, 0, 0), rot=(0, 90, 0))

# ======================================================================= palette and paint
ramps = {
    "netherite": ["#0e0b0d", "#171315", "#211b1e", "#2c2428", "#383034", "#463c41", "#55494f", "#665a60", "#7a6e73"],
    "gold": ["#3b1d06", "#5e300a", "#86470e", "#ad6213", "#cf8118", "#e8a422", "#f6c836", "#fde466", "#fff4ae"],
    "glass": ["#1a2a33", "#2c4652", "#456a76", "#6f97a0", "#a7c8cc", "#e2f2f1"],
    "soulsand": ["#1c120c", "#2b1d14", "#3d2a1d", "#503927", "#634832"],
    "soul": ["#06191d", "#0b2f36", "#0f4a52", "#136b72", "#1a9397", "#2cbdbb", "#5ee0d6", "#a4fcef", "#effffb"],
    "dial": ["#3a3226", "#8f8268", "#cfc3a4", "#efe6cc"],
    "red": ["#4a0d0d", "#9a1f1a"],
}
RIM = {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6}
GOLD_RIM = {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -2.0}
NETHERITE = [{"id": "grain", "op": "noise", "scale": 1.0, "amount": 0.6},
             {"id": "scratches", "op": "wear", "width": 1, "density": 0.12, "shift": 1.6}]
styles = {
    "netherite": {"ramp": "netherite", "tone": 4.0, "rim": RIM, "layers": NETHERITE},
    "netherite_dark": {"ramp": "netherite", "tone": 2.6, "rim": RIM, "layers": NETHERITE},
    "plinth": {"ramp": "netherite", "tone": 3.6, "rim": RIM,
               "layers": NETHERITE + [{"id": "trim", "op": "band", "axis": "y", "from": 0.35, "to": 1.01,
                                       "ramp": "gold", "tone": 4.6, "faces": ["sides"],
                                       "bevel": {"shadow": 1, "highlight": 0}},
                                      {"id": "rivets", "op": "rivets", "inset": 1, "spacing": 4, "highlight": 2.4,
                                       "shadow": -1.4, "faces": ["sides"]}]},
    "cap": {"ramp": "netherite", "tone": 3.8, "rim": RIM,
            "layers": NETHERITE + [{"id": "trim", "op": "band", "axis": "y", "from": -1.01, "to": -0.35,
                                    "ramp": "gold", "tone": 4.6, "faces": ["sides"],
                                    "bevel": {"shadow": 0, "highlight": 1}},
                                   {"id": "panel", "op": "panel", "inset": 2, "shift": -1.2, "highlight": 1.2,
                                    "shadow": -1.2, "faces": ["top"]}]},
    "post": {"ramp": "netherite", "tone": 4.2, "rim": RIM, "brush": {"flow": "y"},
             "layers": NETHERITE + [{"id": "groove", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "shift": -1.4,
                                     "faces": ["front", "back"]},
                                    {"id": "groove_s", "op": "band", "axis": "z", "from": -0.2, "to": 0.2,
                                     "shift": -1.4, "faces": ["left", "right"]}]},
    "gold": {"ramp": "gold", "tone": 5.6, "rim": GOLD_RIM, "brush": {"off": True},
             "layers": [{"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                         "density": 0.6, "shift": 2.0}]},
    "gold_ring": {"ramp": "gold", "tone": 5.6, "rim": GOLD_RIM, "brush": {"off": True},
                  "layers": [{"id": "hole", "op": "rect", "rect": [0.2, 0.2, 0.8, 0.8], "ramp": "netherite",
                              "tone": 1.0, "faces": ["top"]},
                             {"id": "spoke", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "ramp": "gold",
                              "tone": 5.0, "faces": ["top"]}]},
    "dial": {"ramp": "dial", "tone": 2.6, "rim": {"light": 0, "dark": 1, "dark_shift": -1.0}, "brush": {"off": True},
             "stamps": [{"face": "front", "at": "top-left", "art": ["t.tR", "....", "t...", "...."],
                         "key": {"t": "dial:0", "R": "red:1"}}]},
    "needle": {"ramp": "red", "tone": 1, "light": 0, "brush": {"off": True}, "art_key": {"n": "red:1", "N": "dial:0"}},
    # pale glass: barely shaded, a bright lip on the lit edges, a highlight streak down the front-left
    "glass": {"ramp": "glass", "tone": 2.0, "light": 0.35, "brush": {"off": True}, "dither": 0.0,
              "rim": {"light_shift": 1.4, "dark": 0},
              "layers": [{"id": "sheen", "op": "band", "axis": "x", "from": -0.7, "to": -0.5, "ramp": "glass",
                          "tone": 4.6, "faces": ["front", "back"]},
                         {"id": "sheen_s", "op": "band", "axis": "z", "from": 0.5, "to": 0.7, "ramp": "glass",
                          "tone": 4.2, "faces": ["left", "right"]},
                         {"id": "glint", "op": "band", "axis": "x", "from": -0.4, "to": -0.3, "ramp": "glass",
                          "tone": 3.6, "faces": ["front", "back"]}]},
    "soul_sand": {"ramp": "soulsand", "tone": 2.4, "rim": {"light": 1, "dark": 0, "light_shift": 1.0},
                  "brush": {"off": True},
                  "layers": [{"id": "faces", "op": "spots", "count": 5, "radius": [0.6, 0.9], "ramp": "soulsand",
                              "tone": 0.4, "faces": ["top"]},
                             {"id": "embers", "op": "spots", "count": 4, "radius": [0.3, 0.45], "ramp": "soul",
                              "tone": 5.0, "faces": ["top"]}]},
    "wisp": {"ramp": "soul", "tone": 5.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
             "art_key": SOUL_KEY},
}

# ======================================================================= clip
L = 4.0
SOULS = [f"soul_{k}" for k in range(8)]
tracks = [spin("souls", L, 1.0)]
for k, s in enumerate(SOULS):
    ph = k / 8.0
    tracks.append(osc(s, None, [0, 0.5, 0], 2, ph, ch="position"))
    tracks.append(osc(s, "z", 10, 2, ph + 0.25))
    tracks.append(osc(s, None, [0.12, 0.18, 0], 4, ph + 0.1, ch="scale"))
tracks += [osc("soul_swirl", None, [0.2, 0.08, 0.2], 4, ch="scale"), spin("soul_swirl", L, 2.0),
           osc("gauge_needle", "z", 3, 8), osc("gauge_needle", "z", 2, 3, 0.3)]
ANIM = {"idle": {"length": L, "loop": True, "tracks": tracks}}

spec = {
    "name": "Soul Tank",
    "description": "The Winterworks Soul Tank: a reinforced netherite-and-gold frame round a glass tank of swirling soul "
                   "wisps on a bed of soul sand, a valve wheel on top and a pressure gauge on the front. Minecraft "
                   "pixel units, density 1 (a full block).",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 500, "colors": 64},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.8, "gradient": 0.4, "ao": 0.6, "ao_height": 4.0},
    "brush": {"flow": "horizontal", "length": 2.0, "width": 1.0, "rough": 0.4, "overshoot": 0.3,
              "textures": {"netherite": "metal", "gold": "metal"}},
    "minecraft": {"fps": 24, "alpha_parts": {"glass": 0.35},
                  "glow_parts": SOULS + ["soul_swirl", "soul_swirl_b"], "glow_ramps": ["soul"]},
    "render": {"background": "#1c1a22", "hero": [-34, 20], "shadow": 0.45},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "soul_tank.json")
    dump(spec, out)
