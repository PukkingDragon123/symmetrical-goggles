"""Builds examples/fang_dagger.json: the Fang Dagger (Winterworks held item, drawn by an item renderer).

    python examples/src/fang_dagger.py examples/fang_dagger.json

A dagger whose blade is one huge curved Frost Mauler fang: ivory with a frost-blue cutting edge along its convex
underside, a guard of jagged ice crystals, a grip wrapped in white polar-bear fur with tufts sticking out, a knuckle
of bone as the pommel. Dual-wielded in pairs, so it reads at a glance in one hand.

Oriented like the Snowball Launcher (examples/src/snowball_launcher.py), so the same renderer set-up draws it: the
blade points toward +Z (forward, curving up), the hand sits on the grip at the root joint, the lowest point is on
y = 0 and it is centred on x = 0. Units are Minecraft pixels, density 2, every box size a multiple of 0.5, so it
exports 1:1 to a vanilla model (python -m lowpix mc export).

Part contract (mods/winterworks/docs/COLD_UPDATE.md section 9): dagger (root). Clip: idle (static).
"""
import json
import math
import os
import random
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

P = []
FRAMES = {}


def _rot(deg):
    rx, ry, rz = (math.radians(float(a)) for a in deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def part(id, parent, size, style=None, at=None, rel=None, centre=None, offset=None, rot=None, shape="box", **kw):
    """Joint at `at` (world) or `rel` (parent frame); box centre at `centre` (world) or `offset` (own frame)."""
    Rp, tp = FRAMES[parent] if parent else (np.eye(3), np.zeros(3))
    if at is None and rel is None and centre is not None:
        at = centre
    if at is None:
        at = tp + Rp @ np.array(rel if rel is not None else (0, 0, 0), float)
    at = np.array(at, float)
    Rw = Rp @ _rot(rot or (0, 0, 0))
    if centre is not None:
        offset = Rw.T @ (np.array(centre, float) - at)
    d = {"id": id, "shape": shape}
    if parent:
        d["parent"] = parent
    if shape == "box":
        assert all(abs(s * 2 - round(s * 2)) < 1e-9 for s in size), f"{id}: size {size} is not a multiple of 0.5"
        d["size"] = list(size)
    d["pivot"] = [round(float(v), 4) for v in Rp.T @ (at - tp)]
    if offset is not None and np.abs(offset).max() > 1e-9:
        d["offset"] = [round(float(v), 4) for v in offset]
    if rot is not None and any(abs(float(a)) > 1e-9 for a in rot):
        d["rotation"] = [round(float(a), 3) for a in rot]
    if style:
        d["style"] = style
    d.update(kw)
    P.append(d)
    FRAMES[id] = (Rw, at)
    return d


def card(id, parent, art, style, plane="yz", **kw):
    return part(id, parent, None, style, shape="card", plane=plane, art=art, **kw)


def tuft(w, h, seed):
    """A tuft of white fur: pointed locks standing up from the bottom row, the tips brightest."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    for x in range(w):
        L = max(1, int(round(h * rng.uniform(0.35, 1.0))))
        for k in range(L):
            rows[h - 1 - k][x] = "t" if k == L - 1 else "f"
    return ["".join(r) for r in rows]


# ======================================================================= root: the hand's grip point
part("dagger", None, None, "fur", at=(0, 2, -3.75), shape="bone")
part("grip", "dagger", [2, 2, 4.5], "horn", centre=(0, 2, -3.75))
# white polar-bear fur wound round the grip, tufts poking out between the turns
for k, (z, rz) in enumerate(((-5.4, 8), (-4.1, -10), (-2.8, 6))):
    part(f"wrap{k}", "grip", [2.5, 2.5, 1], "fur_white", centre=(0, 2, z), rot=(4 * (k - 1), 0, rz))
for k, (z, rz, w) in enumerate(((-4.75, 30, 6), (-3.45, -40, 5), (-2.15, 150, 6))):
    card(f"fur_tuft{k}", "grip", tuft(w, 3, 7 + k), "fur_white_card", at=(0, 2, z), offset=(0, 1.9, 0), plane="xy",
         rot=(0, 0, rz))
card("fur_tail", "grip", tuft(5, 5, 21), "fur_white_card", at=(0, 1.2, -6.0), offset=(0, -1.25, 0), plane="yz",
     rot=(30, 0, 180))
# the pommel: a knuckle of bone
part("pommel", "grip", [3, 3, 1.5], "bone", centre=(0, 2, -6.75), rot=(0, 0, 45))
part("pommel_cap", "pommel", [2, 2, 1], "bone_dark", centre=(0, 2, -7.75))
card("pommel_spike", "pommel_cap", ["..b..", ".bbb.", "bbbbb"], "bone_card", at=(0, 2, -8.25), offset=(0, 0, -0.75),
     plane="xz", rot=(0, 0, 0))

# ======================================================================= the guard: a burst of ice crystals
part("guard", "dagger", [4, 2.5, 1.5], "ice_plate", centre=(0, 2, -0.75))
GUARD = [  # (rel, w, h, rot): crystals jutting up, down and out, a little forward
    ((1.5, 0.5, 0), 1.5, 3.5, (14, 0, -55)), ((-1.5, 0.5, 0), 1.5, 3.0, (10, 0, 62)),
    ((0.8, 1.0, 0.2), 1.0, 2.5, (20, 10, -18)), ((-0.6, -1.0, 0), 1.5, 3.0, (-170, 0, -20)),
    ((1.0, -0.8, 0.2), 1.0, 2.0, (160, 0, 40)), ((-1.2, 1.0, 0.3), 1.0, 2.0, (24, 0, 30)),
]
for k, (rel, w, h, rot) in enumerate(GUARD):
    part(f"guard_crystal{k}", "guard", [w, h, w], "crystal" if k % 2 == 0 else "crystal_b", rel=rel,
         offset=(0, h / 2, 0), rot=rot)

# ======================================================================= the blade: one huge curved fang
# Each segment hangs from the bottom-front of the one before, so the frost-blue edge along the underside runs
# unbroken while the spine tapers; each bends up a little more toward the point.
SEGS = [("blade", [2, 3.5, 3], -4), ("blade1", [1.5, 3, 2.5], -8), ("blade2", [1.5, 2.5, 2.0], -10),
        ("blade3", [1, 2, 1.5], -13), ("blade_tip", [1, 1, 1.5], -16)]
parent, joint = "dagger", (0, 0.25, 0)
for k, (bid, size, rx) in enumerate(SEGS):
    at = None if k else (0, 0.25, -0.25)
    part(bid, parent, size, "fang_tip" if bid == "blade_tip" else "fang", at=at, rel=None if at else joint,
         offset=(0, size[1] / 2, size[2] / 2), rot=(rx if k else -2, 0, 0))
    parent, joint = bid, (0, 0, size[2] - 0.25)

# ======================================================================= palette and paint
ramps = {
    "bone": ["#271e15", "#392c1f", "#4d3d2b", "#635039", "#7a6449", "#927a5a", "#aa916d", "#c0a882", "#d3bf98",
             "#e3d4b2", "#efe5cc", "#f8f2e4"],
    "ice": ["#0b2440", "#113154", "#173f69", "#1f507f", "#2a6495", "#377aaa", "#4891bf", "#5ea9d0", "#7cc1de",
            "#a0d7ea", "#c8ecf5", "#effbfd"],
    "white": ["#4a4c55", "#62646d", "#7c7e86", "#96989f", "#afb1b7", "#c6c8cd", "#dadce0", "#eaebee", "#f6f7f8"],
    "horn": ["#120b08", "#1d130d", "#2a1c13", "#38261a", "#473222", "#593f2b", "#6c4e36"],
}
ICE_RIM = {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": 1.0}
styles = {
    "fur": {"ramp": "white", "tone": 6.0},
    # ivory fang: lengthwise grain, darker at the root, a frost-blue cutting edge along the underside
    "fang": {"ramp": "bone", "tone": 9.2, "rim": {"light_shift": 1.6, "dark_shift": -2.0, "outline": "dark"},
             "brush": {"flow": "z"},
             "layers": [{"id": "grain", "op": "stripes", "axis": "y", "period": 0.8, "width": 0.25, "shift": -1.0,
                         "wobble": 0.3, "faces": ["left", "right", "top"]},
                        {"id": "root", "op": "gradient", "axis": "z", "amount": 0.8},
                        {"id": "edge", "op": "band", "axis": "y", "from": -1.01, "to": -0.45, "ramp": "ice", "tone": 8.6,
                         "faces": ["left", "right", "bottom", "front"],
                         "bevel": {"shadow_ramp": "ice", "shadow_shift": -3, "highlight": 1}},
                        {"id": "edge_glint", "op": "band", "axis": "y", "from": -1.01, "to": -0.8, "ramp": "ice",
                         "tone": 11, "faces": ["left", "right"], "post": True}]},
    "fang_tip": {"ramp": "ice", "tone": 9.6, "brush": {"off": True}, "rim": {"light_shift": 1.4, "dark_shift": -1.0}},
    "bone": {"ramp": "bone", "tone": 8.0, "rim": {"light_shift": 1.6, "dark_shift": -2.0, "outline": "dark"},
             "layers": [{"id": "grain", "op": "noise", "scale": 0.5, "amount": 0.9},
                        {"id": "cracks", "op": "cracks", "scale": 1.2, "width": 0.05, "shift": -2.6}]},
    "bone_dark": {"ramp": "bone", "tone": 6.6, "rim": {"light_shift": 1.4, "dark_shift": -1.8, "outline": "dark"},
                  "layers": [{"id": "grain", "op": "noise", "scale": 0.5, "amount": 0.9}]},
    "bone_card": {"ramp": "bone", "tone": 8.6, "brush": {"off": True}},
    "horn": {"ramp": "horn", "tone": 3.4, "rim": {"light_shift": 1.2, "dark_shift": -1.0},
             "layers": [{"id": "rings", "op": "stripes", "axis": "z", "period": 0.5, "width": 0.4, "shift": -1.0}]},
    "fur_white": {"ramp": "white", "tone": 6.4, "rim": {"light_shift": 1.2, "dark_shift": -1.6},
                  "brush": {"flow": "x", "rough": 0.8},
                  "layers": [{"id": "strands", "op": "stripes", "axis": "z", "period": 0.5, "width": 0.35,
                              "shift": -1.6, "wobble": 0.6, "faces": ["left", "right", "top", "bottom"]},
                             {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2}]},
    "fur_white_card": {"ramp": "white", "tone": 6.4, "brush": {"off": True}, "art_key": {"t": "white:8"},
                       "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": -1.6}]},
    "ice_plate": {"ramp": "ice", "tone": 6.4, "light": 0.8, "brush": {"off": True}, "rim": dict(ICE_RIM, dark_shift=-1.0),
                  "layers": [{"id": "cracks", "op": "cracks", "scale": 1.0, "width": 0.06, "shift": 2.0}]},
    "crystal": {"ramp": "ice", "tone": 7.0, "light": 0.6, "brush": {"off": True}, "rim": dict(ICE_RIM, light_shift=3.0),
                "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.4, "to": 0.4, "shift": -2.6,
                            "faces": ["front", "back"]},
                           {"id": "core_s", "op": "band", "axis": "z", "from": -0.4, "to": 0.4, "shift": -2.6,
                            "faces": ["left", "right"]},
                           {"id": "base", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "crystal_b": {"ramp": "ice", "tone": 8.4, "light": 0.6, "brush": {"off": True}, "rim": ICE_RIM,
                  "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.35, "to": 0.35, "shift": -2.2,
                              "faces": ["front", "back"]},
                             {"id": "base", "op": "gradient", "axis": "y", "amount": 1.2}]},
}

spec = {
    "name": "Fang Dagger",
    "description": "A Winterworks dagger whose blade is one huge curved Frost Mauler fang: ivory with a frost-blue "
                   "cutting edge, a guard of ice crystals, a grip wound in white polar-bear fur, a bone pommel. "
                   "Minecraft pixel units, density 2; oriented like the Snowball Launcher (blade toward +Z).",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "grounded": False,
    "budget": {"tris": 500, "colors": 48},
    "light": {"dir": [0.35, 1.0, 0.45], "strength": 1.0, "gradient": 0.8, "ao": 0.0},
    "brush": {"flow": "long", "length": 2.4, "width": 0.5, "rough": 0.6, "overshoot": 0.3,
              "textures": {"bone": "organic", "ice": "crystal", "white": "fur", "horn": "wood"}},
    "minecraft": {"fps": 20},
    "render": {"background": "#1b1d22", "hero": [62, 20], "shadow": 0.4},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": {"idle": {"length": 1.0, "loop": True, "tracks": []}},
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/fang_dagger.json"
    # put the lowest point on y = 0 (like the launcher's grip)
    sys.path.insert(0, ROOT)
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points
    lo = min(float(transform_points(i.world, f.pts)[:, 1].min()) for i in expand_instances(P, 2.0) for f in i.faces)
    P[0]["pivot"][1] = round(P[0]["pivot"][1] - lo, 4)
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts", f"(lifted {-lo:+.3f})")
