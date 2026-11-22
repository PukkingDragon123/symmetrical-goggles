"""Builds examples/hex_core.json: the Hex Core (Winterworks, Hexes & Havoc; a 3D item in hand and in the GUI).

    python examples/src/hex_core.py examples/hex_core.json

A cursed hexagonal cage of dark netherite and gold: six fluted netherite posts on a hexagonal gold base and crown
(each plate three crossed slabs, so it reads as a true hexagon, engraved with a soul-blue glyph ring), gold rings round the top and bottom, gold studs at
every corner, a gold spike finial above and a point below. Inside it a swarm of soul wisps (little ghosts with
curling tails) swirls round a glowing soul centre (two crossed, turned cubes of soul fire).

Units are Minecraft pixels (16 per block), density 2 (seen up close in the hand), every box size a multiple of
0.5, so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). About 12 x 15 x 12 px, centred
on x = z = 0, its lowest point on y = 0, so an item renderer can draw it like a block item. The wisps are cards.

Contract (mods/winterworks/docs/HEXES_UPDATE.md sections 2 and 9): bones cage (the netherite and gold cage, pivot
on its axis at mid-height), souls (the wisps, same pivot), core (the soul centre, same pivot). The three are
separate roots, so turning the cage never turns the souls. Glow: souls (every wisp) and core. Clip: idle (loop: the
cage turns once, the souls swirl twice the other way and bob, the core pulses).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, SOUL_KEY, Rig, dump, osc, spin  # noqa: E402

R = Rig(density=2, bone_style="netherite")
part, bone, card = R.part, R.bone, R.card

CY = 7.5          # the axis centre: the cage spans y = 0 .. 15
RAD = 5.0         # hexagon circumradius (posts sit on the corners)
AP = RAD * math.cos(math.radians(30))     # apothem

# ======================================================================= the cage
bone("cage", None, at=(0, CY, 0))
for k in range(6):
    a = math.radians(60 * k)
    x, z = RAD * math.sin(a), RAD * math.cos(a)
    part(f"post{k}", "cage", [1, 9, 1], "post", centre=(x, CY, z), rot=(0, 60 * k, 0))
    # the gold rings: one bar per hexagon edge, top and bottom
    b = math.radians(60 * k + 30)
    for lvl, y in (("top", CY + 4.75), ("bot", CY - 4.75)):
        part(f"ring_{lvl}{k}", "cage", [RAD, 1, 1], "gold", centre=(AP * math.sin(b), y, AP * math.cos(b)),
             rot=(0, 60 * k + 30, 0))
    for lvl, y in (("top", CY + 5.25), ("bot", CY - 5.25)):
        part(f"stud_{lvl}{k}", "cage", [1.5, 1.5, 1.5], "gold_stud", centre=(x, y, z), rot=(0, 60 * k + 45, 0))
# the crown and the base: hexagonal gold plates (three crossed slabs each) with a netherite boss
for lvl, y, sgn in (("crown", CY + 5.75, 1), ("base", CY - 5.75, -1)):
    for j in range(3):
        part(f"{lvl}{j}", "cage", [RAD, 1, 8.5], "plate", centre=(0, y, 0), rot=(0, 60 * j + 30, 0))
    part(f"{lvl}_boss", "cage", [3, 1, 3], "netherite_boss", centre=(0, y + sgn * 0.75, 0), rot=(0, 45, 0))
# the finial above and the point below
part("finial", "cage", [1.5, 2, 1.5], "gold", centre=(0, CY + 7.5, 0), rot=(0, 45, 0))
part("finial_tip", "finial", [0.5, 1, 0.5], "gold", rel=(0, 1.5, 0))
part("point", "cage", [1.5, 1.0, 1.5], "gold", centre=(0, 0.5, 0), rot=(0, 45, 0))

# ======================================================================= the souls and the core
bone("souls", None, at=(0, CY, 0))
WISPS = [[".eEe.", "EwWwE", "W.w.W", "EwWwE", ".EWe.", "..Ee.", "...e."],
         [".eEe.", "eWwWe", "E.W.E", ".EWE.", ".eE..", ".e..."],
         [".eE.", "EwWE", "W.w.", ".EE.", "..e.", "..e."]]
for k in range(5):
    a = 72.0 * k
    rad = 2.6 if k % 2 == 0 else 2.0
    y = -2.6 + k * 1.3
    card(f"soul_{k}", "souls", WISPS[k % 3], "wisp", rel=(rad * math.sin(math.radians(a)), y,
                                                         rad * math.cos(math.radians(a))), rot=(0, a, -20))
bone("core", None, at=(0, CY, 0))
part("core_a", "core", [2.5, 2.5, 2.5], "core", rel=(0, 0, 0), rot=(45, 35, 0))
part("core_b", "core", [2, 2, 2], "core_hot", rel=(0, 0, 0), rot=(0, 45, 45))

# ======================================================================= palette and paint
ramps = {
    "netherite": ["#0d0a0c", "#161114", "#1f191d", "#2a2227", "#352c31", "#42383d", "#51464b", "#61565b", "#73686d"],
    "gold": ["#3b1d06", "#5e300a", "#86470e", "#ad6213", "#cf8118", "#e8a422", "#f6c836", "#fde466", "#fff4ae"],
    "soul": ["#06191d", "#0b2f36", "#0f4a52", "#136b72", "#1a9397", "#2cbdbb", "#5ee0d6", "#a4fcef", "#effffb"],
}
RIM = {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6}
GOLD_RIM = {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -2.0}
styles = {
    "netherite": {"ramp": "netherite", "tone": 4.0, "rim": RIM},
    "post": {"ramp": "netherite", "tone": 4.4, "rim": RIM, "brush": {"flow": "y"},
             "layers": [{"id": "flute", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.2, "shift": -1.6},
                        {"id": "glyph", "op": "spots", "count": 1, "radius": [0.3, 0.4], "ramp": "soul", "tone": 5.0,
                         "faces": ["front"]}]},
    "netherite_boss": {"ramp": "netherite", "tone": 3.4, "rim": RIM, "brush": {"off": True},
                       "stamps": [{"faces": ["top", "bottom"], "at": "center", "art": ["ss", "ss"],
                                   "key": {"s": "soul:5"}}]},
    "gold": {"ramp": "gold", "tone": 5.4, "rim": GOLD_RIM, "brush": {"off": True},
             "layers": [{"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                         "density": 0.5, "shift": 2.0}]},
    "gold_stud": {"ramp": "gold", "tone": 6.4, "rim": GOLD_RIM, "brush": {"off": True}},
    # the crown and base plates: dark netherite, a soul-blue glyph ring engraved in them, gold edges
    "plate": {"ramp": "netherite", "tone": 3.6, "rim": GOLD_RIM, "brush": {"off": True},
              "layers": [{"id": "edge", "op": "band", "axis": "x", "from": 0.6, "to": 1.01, "ramp": "gold", "tone": 4.6,
                          "faces": ["top", "bottom", "left", "right"]},
                         {"id": "edge2", "op": "band", "axis": "x", "from": -1.01, "to": -0.6, "ramp": "gold",
                          "tone": 4.6, "faces": ["top", "bottom", "left", "right"]},
                         {"id": "glyphs", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.25, "ramp": "soul",
                          "tone": 3.6, "range": [-0.55, 0.55], "faces": ["top", "bottom"]}]},
    "wisp": {"ramp": "soul", "tone": 5.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
             "art_key": SOUL_KEY},
    "core": {"ramp": "soul", "tone": 5.4, "light": 0.2, "brush": {"off": True},
             "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4}},
    "core_hot": {"ramp": "soul", "tone": 7.4, "light": 0.1, "brush": {"off": True},
                 "rim": {"light": 1, "dark": 0, "light_shift": 1.0}},
}

# ======================================================================= clip
L = 4.0
SOULS = [f"soul_{k}" for k in range(5)]
tracks = [spin("cage", L, 1.0), spin("souls", L, -2.0), spin("core", L, 3.0),
          osc("core", None, [0.18, 0.18, 0.18], 4, ch="scale"), osc("core", "x", 12, 2)]
for k, s in enumerate(SOULS):
    ph = k / 5.0
    tracks += [osc(s, None, [0, 0.7, 0], 2, ph, ch="position"), osc(s, "z", 12, 2, ph + 0.25),
               osc(s, None, [0.15, 0.2, 0], 4, ph + 0.1, ch="scale")]
ANIM = {"idle": {"length": L, "loop": True, "tracks": tracks}}

GLOW = SOULS + ["core_a", "core_b"]
spec = {
    "name": "Hex Core",
    "description": "The Winterworks Hex Core: a cursed hexagonal cage of dark netherite and gold, filled with "
                   "swirling soul wisps round a glowing soul centre. A 3D item; Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "grounded": False,
    "budget": {"tris": 700, "colors": 40},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.8, "gradient": 0.3, "ao": 0.4, "ao_height": 2.0},
    "brush": {"flow": "long", "length": 1.6, "width": 0.5, "rough": 0.4, "overshoot": 0.3,
              "textures": {"netherite": "metal", "gold": "metal"}},
    "minecraft": {"fps": 24, "glow_parts": GLOW, "glow_ramps": ["soul"]},
    "render": {"background": "#1b1722", "hero": [-30, 20], "shadow": 0.4},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "hex_core.json")
    dump(spec, out)
