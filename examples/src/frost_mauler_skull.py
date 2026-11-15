"""Builds examples/frost_mauler_skull.json: the Frost Mauler's skull, a placeable block (Winterworks block-entity model).

    python examples/src/frost_mauler_skull.py examples/frost_mauler_skull.json

The boss's skull as it drops: its left half crusted in ancient ice with crystals bursting out of it, its right half bare
bone; the two sabre fangs reach down to the ground beside the lower jaw and prop the skull up; the right eye socket is
empty and dark, with an ice-blue eye that the block lights when the revival starts.

Units are Minecraft pixels (16 per block), density 2 (two texels per pixel: a block seen up close), every box size a
multiple of 0.5, so the model exports 1:1 to a vanilla model (python -m lowpix mc export). About 20 x 14 x 24 px,
faces +Z, sits on y = 0, centred on x = 0. "Right" is -X.

Part contract (mods/winterworks/docs/COLD_UPDATE.md section 8): skull (root), jaw, fang_l, fang_r, eye (glow, drawn
only when lit). Clip: idle (2 s loop: the eye's glow breathes, the jaw creaks).
"""
import json
import math
import os
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


def _euler(R):
    ry = math.asin(max(-1.0, min(1.0, -R[2, 0])))
    return [round(math.degrees(a), 3) for a in (math.atan2(R[2, 1], R[2, 2]), ry, math.atan2(R[1, 0], R[0, 0]))]


def part(id, parent, size, style=None, at=None, rel=None, centre=None, offset=None, rot=None, wrot=None,
         shape="box", **kw):
    """Joint at `at` (world) or `rel` (parent frame); box centre at `centre` (world) or `offset` (own frame).
    `rot` is local, `wrot` a world rotation."""
    Rp, tp = FRAMES[parent] if parent else (np.eye(3), np.zeros(3))
    if at is None and rel is None and centre is not None:
        at = centre
    if at is None:
        at = tp + Rp @ np.array(rel if rel is not None else (0, 0, 0), float)
    at = np.array(at, float)
    if wrot is not None:
        rot = _euler(Rp.T @ _rot(wrot))
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


# ======================================================================= the skull, gaping, tilted up on its fangs
# Skull frame: the jaw hinge is the origin; the cranium spans x -8..8, y -1..9, z -8..4; the muzzle runs to z 16.
# The lower jaw lies flat on the ground; the skull gapes 30 degrees above it, the fangs reaching down past the jaw.
part("skull", None, [16, 10, 12], "bone_skull", at=(0, 5.5, -1), offset=(0, 4, -2), rot=(-30, 0, 0))
part("crown", "skull", [12, 2, 9], "bone", rel=(0, 9.5, -3))
part("crest", "skull", [2.5, 3.5, 11], "bone", rel=(0, 11, -3.5), rot=(-6, 0, 0))
part("crest_back", "crest", [2, 2.5, 3], "bone", rel=(0, 0.5, -6), rot=(-20, 0, 0))
part("occiput", "skull", [12, 7, 2], "bone_dark", rel=(0, 4.5, -8.5))
part("brow_l", "skull", [7, 2.5, 3], "bone", rel=(4.5, 8.0, 3.5), rot=(0, 0, 12))
part("brow_r", "skull", [7, 2.5, 3], "bone", rel=(-4.5, 8.0, 3.5), rot=(0, 0, -12))
part("socket_l", "skull", [4, 3.5, 0.5], "socket", rel=(4.5, 5.5, 4.1))
part("socket_r", "skull", [4, 3.5, 0.5], "socket", rel=(-4.5, 5.5, 4.1))
part("eye", "skull", [2, 2, 0.5], "eye", rel=(-4.5, 5.5, 4.25))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"zygo_{n}", "skull", [2, 3, 10], "bone", rel=(s * 9.2, 2.4, -0.5), rot=(0, -s * 12, -s * 8))
    part(f"temple_{n}", "skull", [0.5, 4, 5], "socket", rel=(s * 8.05, 5.5, -3))
# the muzzle: maxilla and nasal bones, tapering, with the dark nasal opening
part("snout", "skull", [9, 5, 8], "bone", rel=(0, 1.5, 8))
part("snout_tip", "skull", [6.5, 4, 4], "bone", rel=(0, 1.5, 14), rot=(4, 0, 0))
part("nasal", "snout_tip", [3.5, 2, 0.5], "socket", rel=(0, 0.5, 2.1))
part("nasal_bridge", "snout", [4, 1.5, 9], "bone", rel=(0, 2.9, 1.5), rot=(-3, 0, 0))
part("palate", "snout", [7, 0.5, 9], "mouth", rel=(0, -2.35, 0.5))
# upper teeth: individual pointed teeth down both sides and across the front
TEETH = ["yyyyyyyyyyyyyyyy", "y.yy.yyy.yy.yy.y", "..y...y....y..y.", "..y...y........."]
card("teeth_up_l", "snout", TEETH, "teeth", rel=(4.0, -2.5, 1), offset=(0, -1, 0))
card("teeth_up_r", "snout", TEETH, "teeth", rel=(-4.0, -2.5, 1), offset=(0, -1, 0))
card("teeth_up_f", "snout_tip", ["yyyyyyyyyyyy", "y.yy.yy.yy.y", "y.yy..y..yy."], "teeth", rel=(0, -2.0, 1.6),
     offset=(0, -0.75, 0), plane="xy")

# the lower jaw lies flat on the ground; its ramus rises at the back to the hinge
part("jaw", "skull", [7, 2.5, 13], "jaw", rel=(0, 0, 0), centre=(0, 1.25, 6.5), wrot=(0, 0, 0))
part("jaw_ramus", "jaw", [8.5, 4, 3], "bone_dark", centre=(0, 3.5, -0.5))
part("tongue", "jaw", [4.5, 0.5, 10], "mouth", centre=(0, 2.6, 7))
card("teeth_lo_l", "jaw", [".y...y...y...y..", "yy.yyy.yyy.yyy.y", "yyyyyyyyyyyyyyyy"], "teeth", at=(3.1, 2.5, 6.5),
     offset=(0, 0.75, 0))
card("teeth_lo_r", "jaw", [".y...y...y...y..", "yy.yyy.yyy.yyy.y", "yyyyyyyyyyyyyyyy"], "teeth", at=(-3.1, 2.5, 6.5),
     offset=(0, 0.75, 0))
card("teeth_lo_f", "jaw", [".y..y..y..", "yyyyyyyyyy"], "teeth", at=(0, 2.5, 12.6), offset=(0, 0.5, 0), plane="xy")

# the sabre fangs: from the muzzle down past the jaw to the ground, curving back
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"fang_{n}", "skull", [3, 5.5, 3], "fang", rel=(s * 4.9, -1.5, 12.5), offset=(0, -2.75, 0),
         rot=(20, 0, s * 4))
    part(f"fang_{n}_mid", f"fang_{n}", [2.5, 3, 2.5], "fang", rel=(0, -5.5, 0), offset=(0, -1.5, 0), rot=(12, 0, 0))
    part(f"fang_{n}_tip", f"fang_{n}_mid", [1.5, 2, 1.5], "fang_tip", rel=(0, -3, 0), offset=(0, -1, 0),
         rot=(16, 0, 0))

# ======================================================================= the left half: crusted in ancient ice
part("ice_cap", "skull", [8.5, 2.5, 11], "ice_plate", rel=(4.3, 9.4, -2.5), rot=(0, 0, -6))
part("ice_cheek", "skull", [2.5, 6, 9], "ice_plate", rel=(8.8, 4, -1), rot=(0, -4, -4))
part("ice_snout", "snout", [4.5, 2, 8], "ice_plate", rel=(2.6, 3.0, 0), rot=(0, 0, -5))
part("ice_eye", "socket_l", [3.5, 3, 1.5], "crystal_b", rel=(0, 0, 0.4), rot=(0, 0, 8))
CRYSTALS = [  # (parent, rel, size w, h, rot): a cluster bursting out of the frozen side
    ("ice_cap", (1.5, 1, -2.5), 2.5, 7, (30, 20, -30)), ("ice_cap", (-0.5, 1, 0.5), 2, 5.5, (40, -10, -12)),
    ("ice_cap", (2.5, 1, 2.5), 1.5, 4, (52, 30, -44)), ("ice_cap", (0.5, 1, -5), 2, 4.5, (14, 0, -24)),
    ("ice_cheek", (1, 1.5, -2), 2, 5, (20, 0, -44)), ("ice_cheek", (1, -1, 2), 1.5, 4, (34, 0, -58)),
    ("ice_snout", (1, 1, 1.5), 1.5, 4, (34, 10, -40)), ("ice_snout", (-0.5, 1, -2.5), 1.5, 3, (10, 0, -22)),
]
for k, (par, rel, w, h, rot) in enumerate(CRYSTALS):
    part(f"crystal{k}", par, [w, h, w], "crystal" if k % 2 == 0 else "crystal_b", rel=rel, offset=(0, h / 2, 0), rot=rot)
card("frost_edge", "skull", ["i.ii.iii.ii.i..ii", "iiiiiiiiiiiiiiiii", ".iii.i..iii.ii.i."], "frost_card",
     rel=(0.2, 9.6, -2.5), plane="yz", rot=(0, 0, 70))

# ======================================================================= palette and paint
ramps = {
    "bone": ["#271e15", "#392c1f", "#4d3d2b", "#635039", "#7a6449", "#927a5a", "#aa916d", "#c0a882", "#d3bf98",
             "#e3d4b2", "#efe5cc", "#f8f2e4"],
    "ice": ["#0b2440", "#113154", "#173f69", "#1f507f", "#2a6495", "#377aaa", "#4891bf", "#5ea9d0", "#7cc1de",
            "#a0d7ea", "#c8ecf5", "#effbfd"],
    "cavity": ["#04040b", "#090914", "#0f0e1f", "#16142a", "#1f1b37"],
    "glow": ["#0d3a66", "#17609b", "#2490d0", "#47c0f2", "#8ce4ff", "#d4f7ff", "#ffffff"],
}
BONE = [{"id": "grain", "op": "noise", "scale": 0.5, "amount": 1.0},
        {"id": "sutures", "op": "cracks", "scale": 1.6, "width": 0.05, "shift": -3.2},
        {"id": "stain", "op": "patches", "scale": 0.9, "threshold": 0.58, "shift": -1.6},
        {"id": "pits", "op": "spots", "count": 10, "radius": [0.25, 0.5], "shift": -2.4},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4}]
BONE_RIM = {"light_shift": 1.6, "dark_shift": -2.0, "outline": "dark"}
ICE_RIM = {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": 1.0}
styles = {
    "bone_skull": {"ramp": "bone", "tone": 7.4, "rim": BONE_RIM, "layers": BONE + [
        # the left half is frozen over: a crust of ice with a ragged edge down the middle
        {"id": "ice", "op": "band", "axis": "x", "from": 0.12, "to": 1.01, "wobble": 0.25, "wobble_scale": 0.3,
         "ramp": "ice", "tone": 7.0, "bevel": {"shadow_ramp": "cavity", "shadow_shift": 0, "highlight": 1}},
        {"id": "ice_cracks", "op": "cracks", "scale": 2.0, "width": 0.05, "shift": 2.0, "faces": ["right", "top"]}]},
    "bone": {"ramp": "bone", "tone": 7.6, "rim": BONE_RIM, "layers": BONE},
    "bone_dark": {"ramp": "bone", "tone": 5.8, "rim": BONE_RIM, "layers": BONE},
    "jaw": {"ramp": "bone", "tone": 7.0, "rim": BONE_RIM, "layers": BONE + [
        {"id": "ice", "op": "band", "axis": "x", "from": 0.45, "to": 1.01, "wobble": 0.5, "wobble_scale": 0.4,
         "ramp": "ice", "tone": 6.4, "faces": ["right", "top"]}]},
    "socket": {"ramp": "cavity", "tone": 1.2, "light": 0.2, "brush": {"off": True},
               "stamps": [{"face": "front", "at": "top-left", "art": ["b......b", "........", "........", "........",
                                                                      "........", "........", "b......b"],
                           "key": {"b": "bone:5"}}]},
    "mouth": {"ramp": "cavity", "tone": 3.0, "light": 0.4},
    "eye": {"ramp": "glow", "tone": 4.6, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"face": "front", "at": "top-left", "art": [".bb.", "bwwb", "bwwd", ".dd."],
                        "key": {"w": "glow:6", "b": "glow:4", "d": "glow:2"}}]},
    "teeth": {"ramp": "bone", "tone": 9.6, "brush": {"off": True},
              "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 1.4}]},
    "fang": {"ramp": "bone", "tone": 9.4, "rim": {"light_shift": 1.4, "dark_shift": -1.8}, "brush": {"flow": "y"},
             "layers": [{"id": "grain", "op": "stripes", "axis": "x", "period": 0.8, "width": 0.3, "shift": -0.9,
                         "faces": ["front", "back"]},
                        {"id": "grain_z", "op": "stripes", "axis": "z", "period": 0.8, "width": 0.3, "shift": -0.9,
                         "faces": ["left", "right"]},
                        {"id": "root", "op": "gradient", "axis": "y", "amount": 1.2}]},
    "fang_tip": {"ramp": "bone", "tone": 10.6, "brush": {"off": True}},
    "ice_plate": {"ramp": "ice", "tone": 6.2, "light": 0.8, "brush": {"off": True}, "rim": dict(ICE_RIM, dark_shift=-1.0),
                  "layers": [{"id": "plates", "op": "scales", "shape": "square", "along": "z", "size": [2.0, 1.5],
                              "gap": 1.0, "highlight": 1.6, "shadow": -1.8, "gradient": 0.6, "jitter": 0.6},
                             {"id": "cracks", "op": "cracks", "scale": 2.0, "width": 0.05, "shift": 1.8}]},
    "crystal": {"ramp": "ice", "tone": 7.0, "light": 0.6, "brush": {"off": True}, "rim": dict(ICE_RIM, light_shift=3.0),
                "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.4, "to": 0.4, "shift": -2.6,
                            "faces": ["front", "back"]},
                           {"id": "core_s", "op": "band", "axis": "z", "from": -0.4, "to": 0.4, "shift": -2.6,
                            "faces": ["left", "right"]},
                           {"id": "base", "op": "gradient", "axis": "y", "amount": 1.6},
                           {"id": "glint", "op": "band", "axis": "y", "from": 0.5, "to": 0.7, "shift": 2.0,
                            "faces": ["sides", "front", "back"]}]},
    "crystal_b": {"ramp": "ice", "tone": 8.2, "light": 0.6, "brush": {"off": True}, "rim": ICE_RIM,
                  "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.35, "to": 0.35, "shift": -2.2,
                              "faces": ["front", "back"]},
                             {"id": "core_s", "op": "band", "axis": "z", "from": -0.35, "to": 0.35, "shift": -2.2,
                              "faces": ["left", "right"]},
                             {"id": "base", "op": "gradient", "axis": "y", "amount": 1.2}]},
    "frost_card": {"ramp": "ice", "tone": 9.0, "light": 0.4, "brush": {"off": True}},
}

anim = {
    # the eye's cold light breathes; the jaw creaks against the ground
    "idle": {"length": 2.0, "loop": True, "tracks": [
        {"part": "eye", "channel": "scale", "osc": {"amp": [0.12, 0.12, 0], "cycles": 1, "bias": [0.02, 0.02, 0]}},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.9, 0], [1.05, -1.6, "out"], [1.3, -0.4], [1.6, 0, "back"]]},
    ]},
}

spec = {
    "name": "Frost Mauler Skull",
    "description": "The Frost Mauler's skull, a Winterworks block: half bare bone, half crusted in ancient ice with "
                   "crystals bursting from it, propped up on its two sabre fangs, an empty socket where a cold eye "
                   "lights up. Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "budget": {"tris": 900, "colors": 48},
    "light": {"dir": [-0.4, 1.0, 0.55], "strength": 0.6, "gradient": 0.6, "ao": 0.8, "ao_height": 4.0},
    "brush": {"flow": "z", "length": 2.4, "width": 0.6, "rough": 0.55, "overshoot": 0.3,
              "textures": {"bone": "organic", "ice": "crystal"}},
    "minecraft": {"fps": 20, "glow_parts": ["eye"]},
    "render": {"background": "#232838", "hero": [-26, 20], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/frost_mauler_skull.json"
    sys.path.insert(0, ROOT)
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points
    lo = min(float(transform_points(i.world, f.pts)[:, 1].min()) for i in expand_instances(P, 2.0) for f in i.faces)
    P[0]["pivot"][1] = round(P[0]["pivot"][1] - lo, 4)
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts", f"(lifted {-lo:+.3f})")
