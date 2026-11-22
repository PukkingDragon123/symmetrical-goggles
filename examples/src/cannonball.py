"""Builds examples/cannonball.json: the Cannonball projectile (Winterworks, Tides & Treasures; an entity).

    python examples/src/cannonball.py examples/cannonball.json

A cast-iron round shot: a stepped sphere (a cube and three crossed slabs) of black iron with a dull sheen on its
upper left, a faint casting seam round its middle and a little rust in its shadows.

Units are Minecraft pixels, density 2. The ball's centre sits on the model origin (lowpix (0, 24, 0) = Minecraft
model (0, 0, 0)), so a renderer translates to the entity's centre (half its 0.4 height up), scales (-1, -1, 1) and
draws; spin the `ball` bone for a tumble. Six pixels across (0.375 blocks, a touch inside the 0.4 hitbox).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, spin  # noqa: E402
from ocean_kit import RAMPS  # noqa: E402

R = Rig(density=2, bone_style="iron")
part, bone = R.part, R.bone
C = (0, 24, 0)
bone("ball", None, at=C)
part("core", "ball", [5, 5, 5], "iron", centre=C)
part("slab_x", "ball", [6, 4, 4], "iron", centre=C)
part("slab_y", "ball", [4, 6, 4], "iron", centre=C)
part("slab_z", "ball", [4, 4, 6], "iron", centre=C)

ramps = {"iron": RAMPS["iron"], "rust": ["#2a140c", "#4a2412", "#6a3618"]}
styles = {
    "iron": {"ramp": "iron", "tone": 3.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.2,
                                                 "outline": "dark"},
             "brush": {"off": True},
             "layers": [{"id": "seam", "op": "band", "axis": "y", "from": -0.06, "to": 0.06, "shift": -0.8,
                         "faces": ["sides"]},
                        {"id": "rust", "op": "patches", "scale": 1.0, "threshold": 0.6, "ramp": "rust", "tone": 1.2,
                         "space": "world", "max_light": -0.2},
                        {"id": "sheen", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                         "density": 0.5, "shift": 1.8}]},
}

spec = {
    "name": "Cannonball",
    "description": "The Winterworks Cannonball: a round shot of black cast iron with a dull sheen. Minecraft pixel "
                   "units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "grounded": False,
    "budget": {"tris": 60, "colors": 16},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.0},
    "minecraft": {"fps": 20},
    "render": {"background": "#22303a", "hero": [-30, 20], "shadow": 0.0},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": {"spin": {"length": 1.0, "loop": True, "tracks": [spin("ball", 1.0, 1.0, axis="x")]}},
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "cannonball.json")
    dump(spec, out)
