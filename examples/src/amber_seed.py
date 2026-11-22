"""Builds examples/amber_seed.json: a fossil Amberwood seed, drawn in 3D inside amber blocks (Winterworks).

    python examples/src/amber_seed.py examples/amber_seed.json

A petrified Amberwood seed, about 4 x 6 x 4 Minecraft pixels: a ribbed ovoid husk (eight ribs, like the cactus-like
Amberwood trunk it would grow into) of dark stony umber with gold-brown rib crests and amber flecks, a stalk cap, and a
little pale-gold sprout curling out of the top like a fiddlehead with one tiny leaf.

Units are Minecraft pixels (16 per block), density 2 (seen up close through the amber): every box is a whole number of
texels, so it exports 1:1 to a vanilla entity model (python -m lowpix mc export). The game's amber block-entity
renderer draws it frozen in the middle of the block, so it has no clips. Faces +Z, ground (its bottom) at y=0.
Parts: seed (root), sprout (the curl's base joint), plus the ribs, shoulder, cap, belly, tip, curl segments and leaf.
"""
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DENSITY = 2
P = []
FRAMES = {}


def _rot(deg):
    rx, ry, rz = (math.radians(float(a)) for a in deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def part(id, parent, size, style, rel=(0, 0, 0), offset=None, rot=None, shape="box", **kw):
    """A part whose joint is at `rel` in the parent's rotated frame, its box centre at `offset` from the joint."""
    Rp, tp = FRAMES[parent] if parent else (np.eye(3), np.zeros(3))
    at = tp + Rp @ np.array(rel, float)
    d = {"id": id, "shape": shape}
    if parent:
        d["parent"] = parent
    if shape == "box":
        assert all(abs(s * DENSITY - round(s * DENSITY)) < 1e-9 for s in size), f"{id}: {size} not whole texels"
        d["size"] = [float(s) if s != int(s) else int(s) for s in size]
    d["pivot"] = [round(float(v), 4) for v in rel]
    if offset is not None:
        d["offset"] = [round(float(v), 4) for v in offset]
    if rot is not None:
        d["rotation"] = [round(float(a), 3) for a in rot]
    d["style"] = style
    d.update(kw)
    P.append(d)
    FRAMES[id] = (Rp @ _rot(rot or (0, 0, 0)), at)
    return d


# ======================================================================= the husk: a ribbed ovoid
# stacked tapering layers: a pointed tip, the ribbed belly, a narrower shoulder and the stalk cap
part("seed", None, [3, 3, 3], "husk", rel=(0, 3.5, 0))
for k, (x, z) in enumerate(((0, 1.6), (0, -1.6), (1.6, 0), (-1.6, 0))):          # face ribs
    sz = [1, 3.5, 0.5] if x == 0 else [0.5, 3.5, 1]
    part(f"rib{k}", "seed", sz, "rib", rel=(x, -0.05, z))
for k, (sx, sz) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):              # corner ribs, turned 45 degrees
    part(f"rib_c{k}", "seed", [0.5, 3, 1], "rib_c", rel=(sx * 1.15, -0.1, sz * 1.15), rot=(0, sx * sz * 45, 0))
part("shoulder", "seed", [2.5, 1, 2.5], "husk", rel=(0, 2.0, 0))
part("cap", "seed", [1.5, 0.5, 1.5], "cap", rel=(0, 2.75, 0))                   # the stalk scar
part("belly", "seed", [2.5, 1, 2.5], "husk", rel=(0, -2.0, 0))
part("tip", "seed", [1.5, 0.5, 1.5], "husk_dark", rel=(0, -2.75, 0))
part("point", "seed", [0.5, 0.5, 0.5], "husk_dark", rel=(0, -3.25, 0))

# ======================================================================= the sprout: a little fiddlehead curl, one leaf
part("sprout", "seed", [0.5, 1.5, 0.5], "sprout", rel=(0.25, 3.0, 0.25), offset=(0, 0.75, 0), rot=(-8, 0, 6))
part("curl0", "sprout", [0.5, 1, 0.5], "sprout", rel=(0, 1.5, 0), offset=(0, 0.5, 0), rot=(38, 0, 0))
part("curl1", "curl0", [0.5, 1, 0.5], "sprout", rel=(0, 1.0, 0), offset=(0, 0.5, 0), rot=(52, 0, 0))
part("curl2", "curl1", [0.5, 1, 0.5], "sprout_tip", rel=(0, 1.0, 0), offset=(0, 0.5, 0), rot=(60, 0, 0))
part("curl3", "curl2", [0.5, 0.5, 0.5], "sprout_tip", rel=(0, 1.0, 0), offset=(0, 0.25, 0), rot=(64, 0, 0))
part("leaf", "sprout", None, "leaf", rel=(0, 0.7, 0), offset=(0.75, 0.5, 0), rot=(0, 0, -30), shape="card",
     plane="xy", art=["..ll", ".lLl", "lLl.", "s..."])

# ======================================================================= palette and paint
ramps = {
    # petrified husk: stony umber with violet-brown shadows, gold-brown crests
    "husk": ["#150b0a", "#24130e", "#351d13", "#4a2a19", "#603920", "#784a29", "#915e34", "#aa7642", "#c39054",
             "#d9ad6c"],
    "amber": ["#86300e", "#c76516", "#eea32f", "#ffe28f"],
    # the living sprout: pale olive-gold, a warm tip
    "sprout": ["#2f2a10", "#4b4416", "#6c631d", "#8f8526", "#b3a734", "#d2c652", "#ece27f", "#fff8c0"],
}
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.7, "gradient": 0.5, "ao": 0.0}
brush = {"flow": "y", "length": 1.2, "width": 0.5, "rough": 0.45, "textures": {"husk": "stone", "sprout": "organic"}}
FLECKS = {"id": "flecks", "op": "spots", "count": 2, "radius": [0.25, 0.4], "ramp": "amber", "tone": 2.4}
styles = {
    "husk": {"ramp": "husk", "tone": 3.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.2},
             "layers": [{"id": "grain", "op": "noise", "scale": 0.5, "amount": 0.9},
                        {"id": "rings", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.25, "shift": -0.8},
                        FLECKS]},
    "husk_dark": {"ramp": "husk", "tone": 2.4, "rim": {"light_shift": 1.2, "dark_shift": -1.0}},
    "rib": {"ramp": "husk", "tone": 5.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6},
            "layers": [{"id": "taper", "op": "band", "axis": "y", "from": -1.01, "to": -0.7, "shift": -1.6},
                       {"id": "taper_t", "op": "band", "axis": "y", "from": 0.75, "to": 1.01, "shift": -1.0},
                       {"id": "pits", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.25, "shift": -1.2},
                       dict(FLECKS, count=1)]},
    "rib_c": {"ramp": "husk", "tone": 4.8, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.4},
              "layers": [{"id": "pits", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.25, "shift": -1.0}]},
    "cap": {"ramp": "husk", "tone": 6.4, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
            "stamps": [{"face": "top", "at": "top-left", "art": ["ddd", "dKd", "ddd"],
                        "key": {"d": "husk:2", "K": "husk:0"}}]},
    "sprout": {"ramp": "sprout", "tone": 4.4, "brush": {"off": True},
               "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.4}},
    "sprout_tip": {"ramp": "sprout", "tone": 5.6, "brush": {"off": True},
                   "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.2}},
    "leaf": {"ramp": "sprout", "tone": 5, "light": 0.3, "brush": {"off": True},
             "art_key": {"l": "sprout:4", "L": "sprout:6", "s": "sprout:2"}},
}

spec = {
    "name": "Amber Seed",
    "description": "A fossil Amberwood seed (about 4 x 6 x 4 px): a ribbed, petrified umber husk with gold-brown rib "
                   "crests and amber flecks, a stalk cap and a little pale-gold fiddlehead sprout with one leaf. Drawn "
                   "in 3D inside amber blocks. Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 400, "colors": 40},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 12},
    "render": {"background": "#2a1d16", "hero": [-34, 20], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "amber_seed.json")
    sys.path.insert(0, ROOT)
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points
    lo = min(float(transform_points(i.world, f.pts)[:, 1].min()) for i in expand_instances(P, float(DENSITY))
             for f in i.faces)
    P[0]["pivot"][1] = round(P[0]["pivot"][1] - lo, 4)
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts", f"(lifted {-lo:+.3f})")
