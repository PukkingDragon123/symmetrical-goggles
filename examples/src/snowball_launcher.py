"""Builds examples/snowball_launcher.json: the Snowball Launcher, a homemade rapid-fire snowball gun (Winterworks
mod held item, drawn by an item renderer).

    python examples/src/snowball_launcher.py examples/snowball_launcher.json

A riveted iron receiver with a four-barrel drum (the mod spins `drum` about Z), a tilted funnel hopper full of
snowballs (or one cobblestone), a glowing redstone tank wound with copper on the +X side, a blaze rod in a lantern
cage slung under the front as a foregrip, a side crank, a brass pressure gauge turned toward the shooter, a pump
piston on top, a heat-vent flap, and an oiled walnut grip and stock.

Units are Minecraft pixels (16 per block), density 2 (two texels per pixel, it is seen up close in first person),
and every box size is a multiple of 0.5 so the model exports 1:1 to a vanilla entity model
(python -m lowpix mc export). Muzzle toward +Z, the bottom of the grip at y = 0, centred on x = 0.

Part contract used by the mod's Java code: frame (root), drum (+ barrel0..barrel3), hopper (+ snowballs, cobble),
core, blaze, crank, piston, gauge (+ needle), vent, stock, grip, trigger. Clips: idle, fire, charge, overheat.
"""
import json
import math
import sys

import numpy as np

P = []
FRAMES = {}     # part id -> (world rotation, world pivot)


def _rot(deg):
    rx, ry, rz = (math.radians(float(a)) for a in deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _half(v, what):
    for s in v:
        assert abs(s * 2 - round(s * 2)) < 1e-9, f"{what}: size {v} is not a multiple of 0.5"


def part(id, parent, size, style=None, at=None, rel=None, centre=None, offset=None, rot=None, shape="box", **kw):
    """Add a part. The joint goes at `at` (world) or `rel` (in the parent's rotated frame); the box centre at
    `centre` (world) or `offset` (in the part's own rotated frame; default: on the joint). `rot` is local."""
    Rp, tp = FRAMES[parent] if parent else (np.eye(3), np.zeros(3))
    if at is None and rel is None and centre is not None:
        at = centre                     # a plain box: its joint sits at its centre
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
        _half(size, id)
        d["size"] = list(size)
    d["pivot"] = [round(float(v), 4) for v in Rp.T @ (at - tp)]
    if offset is not None and np.abs(offset).max() > 1e-9:
        d["offset"] = [round(float(v), 4) for v in offset]
    if rot and any(rot):
        d["rotation"] = list(rot)
    if style:
        d["style"] = style
    d.update(kw)
    P.append(d)
    FRAMES[id] = (Rw, at)
    return d


def bone(id, parent, **kw):
    return part(id, parent, None, "iron_dark", shape="bone", **kw)


# ======================================================================= receiver (root: the hand sits at its pivot)
part("frame", None, [4, 4, 9.5], "iron_frame", at=(0, 4.5, -4), centre=(0, 6.5, -1.25))
part("deco_belly", "frame", [3, 0.5, 9], "iron_dark", centre=(0, 4.25, -1), hide=["top"])
part("deco_strap_b", "frame", [4.5, 4.5, 1], "iron_strap", centre=(0, 6.5, -5.25))
for k, x in enumerate((2.0, -2.0)):     # angle-iron rails along the top edges
    part(f"deco_rail{k}", "frame", [0.5, 0.5, 9.5], "iron_rail", centre=(x, 8.5, -1.25))
part("deco_collar", "frame", [5.5, 5.5, 1], "iron_collar", centre=(0, 6.5, 4.0))
part("deco_plate_l", "frame", [0.5, 3, 4], "iron_plate", at=(-2.25, 6.5, -3.4), rot=(7, 0, 0))   # bolted-on patch
part("deco_patch_r", "frame", [0.5, 1.5, 2.5], "iron_plate", at=(2.15, 5.3, 1.6), rot=(-11, 0, 0))
# the heat vent: a flap hinged at its front edge, left a little ajar
part("vent", "frame", [3.5, 0.5, 2], "iron_vent", at=(0, 8.45, 3.3), offset=(0, 0.25, -1.0), rot=(5, 0, 0))
part("deco_vent_hinge", "frame", [4, 0.5, 0.5], "iron_dark", centre=(0, 8.6, 3.3))
# the hot grille under the flap: glows through the gap, and blazes when the flap slaps open
part("deco_vent_glow", "frame", [3, 0.5, 1.5], "vent_glow", centre=(0, 8.3, 2.3))

# ======================================================================= the drum: four barrels round a Z axis
part("drum", "frame", [4.5, 4.5, 2], "iron_drum", at=(0, 6.5, 4.5), centre=(0, 6.5, 5.5))
part("deco_drum_x", "drum", [5.5, 3, 1.5], "iron_drum", centre=(0, 6.5, 5.5))
part("deco_drum_y", "drum", [3, 5.5, 1.5], "iron_drum", centre=(0, 6.5, 5.5))
for k, (bx, by) in enumerate([(1.25, 1.25), (-1.25, 1.25), (-1.25, -1.25), (1.25, -1.25)]):
    part(f"barrel{k}", "drum", [2, 2, 5.5], "barrel", centre=(bx, 6.5 + by, 8.75), hide=["back"])
    part(f"deco_muzzle{k}", f"barrel{k}", [2.5, 2.5, 1], "muzzle", centre=(bx, 6.5 + by, 10.4))
part("deco_drum_clamp", "drum", [5.5, 5.5, 1], "brass_band", centre=(0, 6.5, 8.0))
part("deco_drum_nose", "drum", [1, 1, 1.5], "brass", centre=(0, 6.5, 11.0))

# ======================================================================= hopper: a flared funnel bin, tilted
part("hopper", "frame", [3, 1, 3], "iron_dark", at=(0, 8.5, -1), offset=(0, 0.5, 0), rot=(-4, 9, 6))
part("deco_hop_floor", "hopper", [4, 0.5, 4], "iron_dark", rel=(0, 1.25, 0))
for wid, rel, size, rot in [("deco_hop_wf", (0, 1.0, 2.25), [5.5, 2, 0.5], (9, 0, 0)),
                            ("deco_hop_wb", (0, 1.0, -2.25), [5.5, 2, 0.5], (-9, 0, 0)),
                            ("deco_hop_wl", (2.25, 1.0, 0), [0.5, 2, 5], (0, 0, -9)),
                            ("deco_hop_wr", (-2.25, 1.0, 0), [0.5, 2, 5], (0, 0, 9))]:
    part(wid, "hopper", size, "hopper_wall", rel=rel, offset=(0, 1, 0), rot=rot)
bone("snowballs", "hopper", rel=(0, 1.5, 0))
# the magazine: six packed snowballs the mod shows one per loaded shot (ammo_s0 is the first to go)
for k, (x, y, z, rot) in enumerate([(-0.9, 0.9, -0.9, (0, 12, 0)), (0.9, 0.9, -0.9, (0, -20, 6)),
                                    (-0.9, 0.9, 0.9, (8, 30, -6)), (0.9, 0.9, 0.9, (-6, 8, 4)),
                                    (-0.4, 2.3, 0.1, (10, 40, -8)), (0.6, 2.4, -0.2, (-8, -25, 6))][::-1]):
    part(f"ammo_s{k}", "snowballs", [1.5, 1.5, 1.5], "snow", rel=(x, y, z), rot=rot)
    part(f"deco_sb{k}_r", f"ammo_s{k}", [2, 1, 1], "snow")
    part(f"deco_sb{k}_q", f"ammo_s{k}", [1, 1, 2], "snow")
bone("cobble", "hopper", rel=(0, 1.5, 0))
for k, (x, y, z, rot) in enumerate([(-0.9, 1.0, 0.0, (8, 20, 10)), (1.0, 1.0, 0.2, (-6, -30, 8)),
                                    (0.0, 2.6, 0.0, (12, 45, -10))][::-1]):
    part(f"ammo_c{k}", "cobble", [2, 2, 2], "cobble", rel=(x, y, z), rot=rot)
    part(f"deco_cob{k}_r", f"ammo_c{k}", [2.5, 1.5, 1.5], "cobble")

# ======================================================================= pump piston on top, behind the hopper
part("deco_piston_tube", "frame", [2, 2, 2.5], "brass_tube", centre=(0, 9.5, -4.75))
part("deco_piston_band", "deco_piston_tube", [2.5, 2.5, 0.5], "iron_strap", centre=(0, 9.5, -5.6))
part("piston", "frame", [1, 1, 5], "iron_rod", at=(0, 9.5, -6), centre=(0, 9.5, -6))
part("deco_piston_knob", "piston", [3, 1, 1], "wood_knob", centre=(0, 9.5, -8.75))

# ======================================================================= +X side: redstone tank and pressure gauge
part("core", "frame", [2, 2.5, 4], "redstone", at=(2.75, 6.6, 0.2), rot=(0, -5, 0))
part("deco_core_cap_b", "core", [2.5, 3, 0.5], "iron_cap", rel=(0, 0, -2.25))
part("deco_core_cap_f", "core", [2.5, 3, 0.5], "iron_cap", rel=(0, 0, 2.25))
part("deco_coil_0", "core", [2.5, 3, 0.5], "copper_coil", rel=(0, 0, -0.8), rot=(10, 0, 0))
part("deco_coil_1", "core", [2.5, 3, 0.5], "copper_coil", rel=(0, 0, 0.8), rot=(-8, 0, 0))
part("deco_pipe_a", "deco_core_cap_f", [0.5, 0.5, 1.5], "copper", rel=(-0.2, 1.0, 0.6), offset=(0, 0, 0.6),
     rot=(-12, -14, 0))

part("gauge", "frame", [1, 3.5, 3.5], "gauge", at=(2.95, 6.85, -4.2), rot=(0, 14, 10))
part("deco_needle_hub", "gauge", [0.5, 0.5, 0.5], "brass", rel=(1.0, 0, 0))
part("deco_gauge_body", "gauge", [1.5, 3, 3], "brass", rel=(-0.9, 0, 0))
part("needle", "gauge", [0.5, 1.5, 0.5], "needle", rel=(0.75, 0, 0), offset=(0, 0.5, 0))
part("deco_gauge_stem", "gauge", [1, 1.5, 1], "copper", rel=(-0.9, -1.9, 0.3), rot=(0, 0, -12))

# ======================================================================= -X side: the crank
part("crank", "frame", [0.5, 2.5, 1.5], "brass_gear", at=(-2.75, 6.5, -0.6), rot=(-35, 0, 0))
part("deco_crank_gear", "crank", [0.5, 1.5, 2.5], "brass_gear", rel=(0.25, 0, 0))
part("deco_crank_arm", "crank", [0.5, 3.5, 1], "iron_rod", rel=(-0.5, 0, 0), offset=(0, 1.25, 0))
part("deco_crank_handle", "deco_crank_arm", [1.5, 1, 1], "wood_knob", rel=(-0.75, 2.6, 0))

# ======================================================================= under: grip, trigger, blaze lantern
part("grip", "frame", [2, 4.5, 2.5], "wood_grip", at=(0, 4.5, -4), offset=(0, -2.25, 0), rot=(14, 0, 0))
part("deco_grip_cap", "grip", [2.5, 0.5, 3], "iron_cap", rel=(0, -4.5, 0))
part("deco_grip_wrap0", "grip", [2.5, 1, 3], "leather", rel=(0, -1.4, 0), rot=(0, 0, 7))
part("deco_grip_wrap1", "grip", [2.5, 0.5, 3], "leather", rel=(0, -2.8, 0), rot=(0, 0, -6))
part("trigger", "frame", [1, 1.5, 0.5], "iron_rod", at=(0, 4.05, -2.0), offset=(0, -0.75, 0), rot=(-14, 0, 0))
part("deco_guard", "frame", [1, 0.5, 4.5], "iron_dark", at=(0, 1.75, -1.5), rot=(-7, 0, 0))

bone("deco_lantern", "frame", at=(0, 4.1, 1.9), rot=(-16, 0, 0))
part("deco_lantern_top", "deco_lantern", [3.5, 0.5, 3.5], "iron_cap", rel=(0, -0.25, 0))
part("deco_lantern_hood", "deco_lantern", [2.5, 0.5, 2.5], "iron_dark", rel=(0, 0.1, 0))
part("deco_lantern_bot", "deco_lantern", [3.5, 0.5, 3.5], "iron_cap", rel=(0, -3.25, 0))
for k, (x, z) in enumerate([(1.5, 1.5), (-1.5, 1.5), (-1.5, -1.5), (1.5, -1.5)]):
    part(f"deco_lantern_bar{k}", "deco_lantern", [0.5, 2.5, 0.5], "iron_rod", rel=(x, -1.75, z))
part("blaze", "deco_lantern", [1.5, 2.5, 1.5], "blaze", rel=(0, -1.75, 0), rot=(5, 20, 13))

# ======================================================================= the stock: oiled walnut, angled down
part("stock", "frame", [2.5, 3, 4.5], "wood_stock", at=(0, 7.1, -5.7), offset=(0, -0.5, -2.25), rot=(-9, 0, 0))
part("deco_stock_comb", "stock", [2, 0.5, 3], "wood_stock", rel=(0, 1.1, -2.6))
part("deco_stock_butt", "stock", [3, 3.5, 0.5], "iron_cap", rel=(0, -0.6, -4.6))
part("deco_stock_strap", "stock", [3, 3.5, 0.5], "leather", rel=(0, -0.5, -1.6), rot=(12, 0, 0))


# ----------------------------------------------------------------------- put the bottom of the grip on y = 0
def _lowest():
    lo = 1e9
    for d in P:
        if d["shape"] != "box":
            continue
        R, t = FRAMES[d["id"]]
        c = np.array(d.get("offset", (0, 0, 0)), float)
        h = np.array(d["size"], float) / 2
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    lo = min(lo, float((t + R @ (c + h * [sx, sy, sz]))[1]))
    return lo


_dy = -_lowest()
P[0]["pivot"][1] = round(P[0]["pivot"][1] + _dy, 4)

# ======================================================================= palette: muted, hue-shifted ramps
ramps = {
    "iron": ["#121318", "#1b1c22", "#25262d", "#303139", "#3c3d44", "#4a4a50", "#59585c", "#6a6867", "#7d7a75",
             "#938e86", "#aaa499"],
    "rust": ["#22140f", "#361e15", "#4b291c", "#5f3523", "#72432c"],
    "wood": ["#120d0b", "#1b1310", "#251a15", "#30221a", "#3c2a20", "#493326", "#573d2d", "#664835", "#76543e"],
    "leather": ["#18110e", "#241914", "#31221a", "#3f2c22", "#4d372a"],
    "brass": ["#19130c", "#2a2013", "#3d301a", "#524122", "#68532b", "#7e6634", "#94793f", "#a88d4e", "#bba263"],
    "verdigris": ["#232c27", "#313d35", "#415045"],
    "copper": ["#1f110d", "#341a13", "#4c251a", "#643223", "#7b412d", "#91543b", "#a66a4d"],
    "redstone": ["#2a0505", "#4f0808", "#7c0e0b", "#a91711", "#d42417", "#f2442a", "#ff7a52", "#ffb894"],
    "blaze": ["#5a2a05", "#8f4c07", "#c67c0e", "#eba820", "#ffce45", "#ffeb94", "#fffbe0"],
    "snow": ["#56606f", "#738090", "#929fae", "#b2bdc9", "#cfd8e1", "#e7edf2", "#f8fafc"],
    "stone": ["#1a191c", "#28272a", "#37363a", "#48474a", "#5a585b", "#6e6b6d", "#838081", "#9a9697"],
    "dial": ["#383328", "#5f5848", "#8f8771", "#bcb49b", "#dcd5bf"],
    "paint": ["#2e100e", "#4e1915", "#70251d", "#8f3326"],
}

# handled iron: brushed along the part, gently mottled, darker toward the bottom, a little grime and rust low down,
# edges rubbed bright where hands touch them
IRON = [
    {"id": "under", "op": "gradient", "axis": "y", "amount": 0.9},
    {"id": "mottle", "op": "noise", "scale": 0.9, "amount": 0.55},
    {"id": "photo", "op": "photo", "src": "assets/photos/rusty_metal_02", "scale": 6.0, "amount": 0.5,
     "ramps": ["iron"]},
    {"id": "grime", "op": "band", "axis": "y", "from": -1.01, "to": -0.6, "shift": -0.6, "wobble": 0.25,
     "faces": ["sides", "front", "back"]},
    {"id": "rust", "op": "patches", "scale": 0.8, "threshold": 0.8, "ramp": "rust", "tone": 2.4,
     "faces": ["sides", "bottom"]},
    {"id": "rubbed", "op": "wear", "width": 1, "density": 0.18, "shift": 0.9, "faces": ["sides", "top"]},
]
RIVETS = {"id": "rivets", "op": "rivets", "inset": 1, "spacing": 6, "highlight": 1.5, "shadow": -1.3, "min_size": 6}
WOOD = [
    {"id": "grain", "op": "stripes", "axis": [0, 1, 0.1], "period": 0.5, "width": 0.4, "shift": -0.7, "wobble": 0.45,
     "faces": ["sides", "front", "back"]},
    {"id": "grain_top", "op": "stripes", "axis": "x", "period": 0.5, "width": 0.4, "shift": -0.6, "wobble": 0.45,
     "faces": ["top", "bottom"]},
    {"id": "figure", "op": "noise", "scale": 0.8, "amount": 0.45},
    {"id": "under", "op": "gradient", "axis": "y", "amount": 0.6},
    {"id": "oil", "op": "gloss", "dash": True, "length": 2, "shift": 1.0, "density": 0.35, "post": True},
]
BRASS = [
    {"id": "under", "op": "gradient", "axis": "y", "amount": 0.7},
    {"id": "mottle", "op": "noise", "scale": 0.8, "amount": 0.45},
    {"id": "tarnish", "op": "patches", "scale": 0.9, "threshold": 0.74, "ramp": "verdigris", "tone": 1.4,
     "faces": ["sides", "bottom"]},
    {"id": "rubbed", "op": "wear", "width": 1, "density": 0.25, "shift": 1.1, "faces": ["sides", "top"]},
]
RIM = {"light_shift": 1.3, "dark_shift": -1.4}

styles = {
    "iron_frame": {"ramp": "iron", "tone": 4.8, "rim": RIM,
                   "layers": IRON + [RIVETS,
                                     {"id": "vent_slots", "op": "grille", "rect": [0.12, 0.83, 0.88, 0.99], "period": 2,
                                      "slit_tone": 0.6, "lip": 0.7, "faces": ["top"]}]},
    "iron_dark": {"ramp": "iron", "tone": 4.0, "rim": RIM, "layers": IRON},
    "iron_plate": {"ramp": "iron", "tone": 5.0, "rim": {"light_shift": 1.5, "dark_shift": -1.3},
                   "layers": IRON + [dict(RIVETS, spacing=4, min_size=3)]},
    "iron_strap": {"ramp": "iron", "tone": 4.2, "rim": RIM,
                   "layers": IRON + [dict(RIVETS, spacing=4, min_size=3, inset=0)]},
    "iron_collar": {"ramp": "iron", "tone": 4.6, "rim": {"light_shift": 1.5, "dark_shift": -1.3},
                    "layers": IRON + [dict(RIVETS, spacing=4, min_size=3)]},
    "iron_drum": {"ramp": "iron", "tone": 4.4, "rim": {"light_shift": 1.5, "dark_shift": -1.3},
                  "layers": IRON + [{"id": "soot", "op": "gradient", "axis": "z", "amount": -0.5}]},
    "iron_cap": {"ramp": "iron", "tone": 3.8, "rim": {"light_shift": 1.5, "dark_shift": -1.0}, "layers": IRON},
    "iron_rod": {"ramp": "iron", "tone": 5.6, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
                 "layers": [{"id": "under", "op": "gradient", "axis": "y", "amount": 0.5},
                            {"id": "mottle", "op": "noise", "scale": 0.6, "amount": 0.4}]},
    "iron_vent": {"ramp": "iron", "tone": 4.8, "rim": {"light_shift": 1.5, "dark_shift": -1.2},
                  "layers": IRON + [{"id": "slots", "op": "grille", "rect": [0.12, 0.2, 0.88, 0.85], "period": 2,
                                     "slit_tone": 1.2, "lip": 0.5, "faces": ["top"]},
                                    {"id": "heat", "op": "patches", "scale": 0.8, "threshold": 0.66, "ramp": "copper",
                                     "tone": 2.6, "faces": ["top"]}]},
    "barrel": {"ramp": "iron", "tone": 4.0, "rim": {"light_shift": 1.6, "dark_shift": -1.3},
               "brush": {"flow": "z", "length": 3.0},
               "layers": IRON + [{"id": "heat", "op": "gradient", "axis": "z", "amount": -0.6, "faces": ["-front"]},
                                 {"id": "blued", "op": "band", "axis": "z", "from": 0.55, "to": 1.0, "shift": -0.6,
                                  "wobble": 0.15, "faces": ["-front"]},
                                 {"id": "face", "op": "fill", "ramp": "iron", "tone": 6.5, "faces": ["front"]},
                                 {"id": "bore", "op": "rect", "rect": [0.25, 0.25, 0.75, 0.75], "ramp": "iron",
                                  "tone": 0.0, "faces": ["front"], "post": True},
                                 {"id": "bore_lip", "op": "rect", "rect": [0.25, 0.25, 0.75, 0.5], "ramp": "iron",
                                  "tone": 2.0, "faces": ["front"], "post": True}]},
    "muzzle": {"ramp": "brass", "tone": 3.6, "rim": {"light_shift": 1.7, "dark_shift": -1.2},
               "layers": [{"id": "mottle", "op": "noise", "scale": 0.6, "amount": 0.5},
                          {"id": "soot", "op": "gradient", "axis": "z", "amount": 0.6},
                          {"id": "tarnish", "op": "patches", "scale": 0.6, "threshold": 0.7, "ramp": "verdigris",
                           "tone": 1.2}]},
    "brass_gear": {"ramp": "brass", "tone": 4.2, "rim": {"light_shift": 1.5, "dark_shift": -1.3},
                   "layers": BRASS + [{"id": "teeth", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.5,
                                       "shift": -1.0, "faces": ["top", "bottom", "front", "back"]},
                                      dict(RIVETS, spacing=0, min_size=2, inset=0, ramp="iron", tone=7)]},
    "iron_rail": {"ramp": "iron", "tone": 5.2, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
                  "layers": IRON[:3] + [dict(RIVETS, spacing=4, min_size=1, inset=0, highlight=1.2)]},
    "vent_glow": {"ramp": "blaze", "tone": 2.4, "light": 0.2, "brush": {"off": True}, "dither": 0.0,
                  "rim": {"light": 0, "dark": 1, "dark_shift": -1.0},
                  "layers": [{"id": "bars", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.5, "ramp": "iron",
                              "tone": 1.0, "faces": ["top"]},
                             {"id": "hot", "op": "noise", "scale": 0.5, "amount": 0.8}]},
    "brass": {"ramp": "brass", "tone": 4.6, "rim": {"light_shift": 1.5, "dark_shift": -1.2}, "layers": BRASS},
    "brass_band": {"ramp": "brass", "tone": 4.0, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
                   "layers": BRASS + [dict(RIVETS, spacing=4, min_size=3, inset=0, ramp="iron", tone=7)]},
    "brass_tube": {"ramp": "brass", "tone": 4.4, "rim": {"light_shift": 1.6, "dark_shift": -1.3},
                   "brush": {"flow": "z"}, "layers": BRASS},
    "copper": {"ramp": "copper", "tone": 4.0, "rim": {"light_shift": 1.4, "dark_shift": -1.0},
               "layers": [{"id": "mottle", "op": "noise", "scale": 0.6, "amount": 0.45},
                          {"id": "under", "op": "gradient", "axis": "y", "amount": 0.6},
                          {"id": "tarnish", "op": "patches", "scale": 0.8, "threshold": 0.72, "ramp": "verdigris",
                           "tone": 1.3}]},
    "copper_coil": {"ramp": "copper", "tone": 3.8, "rim": {"light_shift": 1.2, "dark_shift": -1.0},
                    "brush": {"off": True}, "dither": 0.0,
                    "layers": [{"id": "turns", "op": "stripes", "axis": "z", "period": 0.5, "width": 0.5,
                                "shift": -1.0, "faces": ["top", "bottom", "right", "left"]},
                               {"id": "mottle", "op": "noise", "scale": 0.6, "amount": 0.4},
                               {"id": "under", "op": "gradient", "axis": "y", "amount": 0.8}]},
    # a glass tank of churning redstone dust: dark at the glass edges, bright swirls inside, a glint down one side
    "redstone": {"ramp": "redstone", "tone": 3.6, "light": 0.3, "brush": {"off": True}, "dither": 0.0,
                 "rim": {"light": 1, "dark": 1, "light_shift": -1.2, "dark_shift": -1.8},
                 "layers": [{"id": "churn", "op": "noise", "scale": 0.45, "amount": 1.1},
                            {"id": "swirl", "op": "patches", "scale": 0.7, "threshold": 0.55, "shift": 1.4},
                            {"id": "dust", "op": "spots", "count": 12, "radius": [0.2, 0.4], "shift": 2.4},
                            {"id": "settled", "op": "band", "axis": "y", "from": -1.01, "to": -0.55, "shift": -1.2,
                             "wobble": 0.2},
                            {"id": "glint", "op": "band", "axis": "z", "from": -0.7, "to": -0.45, "ramp": "redstone",
                             "tone": 7, "faces": ["right", "left"], "post": True},
                            {"id": "glint_top", "op": "band", "axis": "x", "from": 0.35, "to": 0.6, "ramp": "redstone",
                             "tone": 6.5, "faces": ["top"], "post": True}]},
    "blaze": {"ramp": "blaze", "tone": 3.4, "light": 0.25, "brush": {"off": True}, "dither": 0.0,
              "rim": {"light": 0, "dark": 1, "dark_shift": -1.2},
              "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.5, "shift": -1.3},
                         {"id": "hot", "op": "band", "axis": "x", "from": -0.34, "to": 0.34, "shift": 1.4,
                          "faces": ["sides", "front", "back"]},
                         {"id": "core_top", "op": "fill", "shift": 1.0, "faces": ["top", "bottom"]}]},
    # 7x7 texel dial (image-left is +Z: the needle swings toward the front, into the red, as it rotates +x)
    "gauge": {"ramp": "brass", "tone": 4.8, "rim": {"light_shift": 1.5, "dark_shift": -1.2}, "layers": BRASS,
              "stamps": [{"face": "right", "at": [0, 0],
                          "key": {"o": "brass:2", "b": "brass:5", "B": "brass:7", "d": "dial:2", "D": "dial:3",
                                  "s": "dial:1", "k": "dial:0", "r": "paint:3", "R": "paint:2"},
                          "art": ["obBBBbo",
                                  "bRsDsdb",
                                  "BrDDDdb",
                                  "BsDDDsb",
                                  "bdDDddb",
                                  "obdsdbo",
                                  "oobbboo"]}]},
    "needle": {"ramp": "paint", "tone": 3.0, "light": 0.4, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
               "layers": [{"id": "tip", "op": "band", "axis": "y", "from": 0.4, "to": 1.01, "tone": 3.0}]},
    "hopper_wall": {"ramp": "iron", "tone": 4.8, "rim": {"light_shift": 1.5, "dark_shift": -1.3},
                    "layers": IRON + [dict(RIVETS, spacing=4, min_size=3),
                                      {"id": "lip", "op": "band", "axis": "y", "from": 0.5, "to": 1.01, "ramp": "brass",
                                       "tone": 4.2}]},
    "snow": {"ramp": "snow", "tone": 3.3, "light": 1.0, "rim": {"light_shift": 0.8, "dark_shift": -0.9},
             "brush": {"flow": "horizontal", "rough": 0.4, "length": 1.2},
             "layers": [{"id": "soft", "op": "noise", "scale": 0.5, "amount": 0.45},
                        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "cobble": {"ramp": "stone", "tone": 3.8, "rim": {"light_shift": 1.2, "dark_shift": -1.2},
               "layers": [{"id": "stones", "op": "scales", "shape": "square", "along": "x", "size": [1.2, 0.9],
                           "gap": 1.0, "highlight": 0.8, "shadow": -1.4, "gradient": 0.6, "jitter": 0.8},
                          {"id": "photo", "op": "photo", "src": "assets/photos/rock_face_03", "scale": 4.0,
                           "amount": 0.6, "ramps": ["stone"]},
                          {"id": "under", "op": "gradient", "axis": "y", "amount": 0.8}]},
    "wood_grip": {"ramp": "wood", "tone": 4.8, "rim": {"light_shift": 1.2, "dark_shift": -1.1}, "brush": {"flow": "y"},
                  "layers": [dict(WOOD[0], axis=[1, 0, 1]), dict(WOOD[1], axis=[1, 0, 1])] + WOOD[2:]},
    "wood_stock": {"ramp": "wood", "tone": 5.0, "rim": {"light_shift": 1.2, "dark_shift": -1.1},
                   "brush": {"flow": "z"}, "layers": WOOD},
    "wood_knob": {"ramp": "wood", "tone": 5.2, "rim": {"light_shift": 1.3, "dark_shift": -1.1}, "layers": WOOD[2:]},
    "leather": {"ramp": "leather", "tone": 2.6, "rim": {"light_shift": 1.0, "dark_shift": -0.8},
                "layers": [{"id": "photo", "op": "photo", "src": "assets/photos/brown_leather", "scale": 4.0,
                            "amount": 0.6, "ramps": ["leather"]},
                           {"id": "under", "op": "gradient", "axis": "y", "amount": 0.5}]},
}

# ======================================================================= clips (the mod spins the drum itself)
anim = {
    # breathing machine: the core pulses, the needle twitches, the hopper rocks, the blaze flickers
    "idle": {"length": 2.0, "loop": True, "tracks": [
        {"part": "core", "channel": "scale", "osc": {"amp": [0.05, 0.05, 0.03], "cycles": 2}},
        {"part": "blaze", "channel": "scale", "osc": {"amp": [0.12, 0.05, 0.12], "cycles": 4, "phase": 0.2}},
        {"part": "needle", "axis": "x", "keys": [[0, 0], [0.3, 4], [0.38, 1], [0.55, 6], [0.9, 2], [1.1, 7],
                                                  [1.16, 3], [1.5, 5], [1.7, 1], [2.0, 0]], "ease": "smooth"},
        {"part": "hopper", "channel": "position", "osc": {"amp": [0, 0.12, 0], "cycles": 1, "bias": [0, 0.12, 0]}},
        {"part": "hopper", "axis": "z", "osc": {"amp": 1.5, "cycles": 1, "phase": 0.15}},
        {"part": "snowballs", "channel": "position", "osc": {"amp": [0, 0.1, 0], "cycles": 2, "phase": 0.3,
                                                             "bias": [0, 0.1, 0]}},
        {"part": "vent", "axis": "x", "osc": {"amp": 2, "cycles": 1, "phase": 0.4, "bias": 2}},
    ]},
    # one shot: the whole gun kicks back and up, springs forward past rest, settles; the hopper squashes and
    # rebounds, the snowballs jump, the trigger snaps back
    "fire": {"length": 0.3, "loop": False, "tracks": [
        {"part": "frame", "channel": "position", "keys": [[0, [0, 0, 0]], [0.045, [0, 0.45, -1.6], "out"],
                                                           [0.3, [0, 0, 0], "back"]]},
        {"part": "frame", "axis": "x", "keys": [[0, 0], [0.05, -7, "out"], [0.3, 0, "elastic"]]},
        {"part": "hopper", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.05, [0.14, -0.24, 0.14], "out"],
                                                        [0.12, [-0.07, 0.16, -0.07], "ease"],
                                                        [0.3, [0, 0, 0], "elastic"]]},
        {"part": "snowballs", "channel": "position", "keys": [[0, [0, 0, 0]], [0.06, [0, -0.3, 0]],
                                                              [0.14, [0, 0.9, 0.2], "out"], [0.3, [0, 0, 0], "back"]]},
        {"part": "cobble", "channel": "position", "keys": [[0, [0, 0, 0]], [0.06, [0, -0.3, 0]],
                                                           [0.15, [0, 0.6, 0.1], "out"], [0.3, [0, 0, 0], "back"]]},
        {"part": "trigger", "axis": "x", "keys": [[0, 0], [0.03, 28, "out"], [0.12, 28], [0.3, 0, "back"]]},
        {"part": "needle", "axis": "x", "keys": [[0, 0], [0.06, 18, "out"], [0.3, 0, "elastic"]]},
        {"part": "core", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.04, [0.12, 0.12, 0.08], "out"],
                                                      [0.3, [0, 0, 0], "ease"]]},
        {"part": "vent", "axis": "x", "keys": [[0, 0], [0.06, 22, "out"], [0.3, 0, "elastic"]]},
    ]},
    # wind it up: the piston nudges forward then hauls back, the crank goes once round, the core swells
    "charge": {"length": 1.0, "loop": False, "tracks": [
        {"part": "piston", "channel": "position", "keys": [[0, [0, 0, 0]], [0.14, [0, 0, 0.45], "out"],
                                                           [0.5, [0, 0, -2.6], "in_back"], [0.72, [0, 0, -2.6]],
                                                           [1.0, [0, 0, 0], "back"]]},
        {"part": "crank", "axis": "x", "keys": [[0, 0], [0.12, 14, "out"], [0.82, -360, "inout_back"],
                                                [1.0, -360]]},
        {"part": "core", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.15, [-0.04, -0.04, -0.03]],
                                                      [0.62, [0.2, 0.2, 0.12], "in"], [0.74, [0.12, 0.12, 0.08]],
                                                      [1.0, [0, 0, 0], "elastic"]]},
        {"part": "needle", "axis": "x", "keys": [[0, 0], [0.15, -6], [0.68, 52, "in"], [1.0, 8, "elastic"]]},
        {"part": "frame", "axis": "z", "keys": [[0, 0], [0.3, 2.5], [0.5, -2], [0.7, 2], [0.85, -1], [1.0, 0]],
         "ease": "smooth"},
        {"part": "hopper", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.5, [0, 0, 0]],
                                                        [0.58, [0.08, -0.12, 0.08], "out"],
                                                        [1.0, [0, 0, 0], "elastic"]]},
    ]},
    # swap ammo: the hopper tips back, the old load flies out over the shoulder, the crank whips round,
    # the new load drops in with a bounce (the mod shows the old ammo for the first half, the new for the second)
    "swap": {"length": 0.9, "loop": False, "tracks": [
        {"part": "hopper", "axis": "x", "keys": [[0, 0], [0.12, 6, "out"], [0.3, -42, "out_back"], [0.45, -38],
                                                 [0.62, 4, "in"], [0.9, 0, "elastic"]]},
        {"part": "hopper", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.62, [0, 0, 0]], [0.68, [0.16, -0.22, 0.16], "out"],
                                                        [0.9, [0, 0, 0], "elastic"]]},
        {"part": "snowballs", "channel": "position", "keys": [[0, [0, 0, 0]], [0.12, [0, -0.3, 0]], [0.3, [0, 3.5, -3], "out"],
                                                              [0.45, [0, 6, -6]], [0.46, [0, 7, 0]], [0.7, [0, -0.3, 0], "in"],
                                                              [0.9, [0, 0, 0], "elastic"]]},
        {"part": "snowballs", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [-0.2, -0.2, -0.2]], [0.45, [-0.7, -0.7, -0.7]],
                                                           [0.46, [-0.4, -0.4, -0.4]], [0.7, [0.1, -0.15, 0.1]],
                                                           [0.9, [0, 0, 0], "elastic"]]},
        {"part": "cobble", "channel": "position", "keys": [[0, [0, 0, 0]], [0.12, [0, -0.3, 0]], [0.3, [0, 3.0, -3], "out"],
                                                           [0.45, [0, 5, -6]], [0.46, [0, 7, 0]], [0.7, [0, -0.3, 0], "in"],
                                                           [0.9, [0, 0, 0], "elastic"]]},
        {"part": "cobble", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [-0.2, -0.2, -0.2]], [0.45, [-0.7, -0.7, -0.7]],
                                                        [0.46, [-0.4, -0.4, -0.4]], [0.7, [0.1, -0.15, 0.1]],
                                                        [0.9, [0, 0, 0], "elastic"]]},
        {"part": "crank", "axis": "x", "keys": [[0, 0], [0.5, -360, "inout_back"], [0.9, -360]]},
        {"part": "frame", "channel": "position", "keys": [[0, [0, 0, 0]], [0.15, [0, 0.5, 0], "out"], [0.45, [0, 0.2, 0]],
                                                           [0.7, [0, -0.15, 0], "in"], [0.9, [0, 0, 0], "elastic"]]},
        {"part": "frame", "axis": "z", "keys": [[0, 0], [0.15, -8, "out"], [0.45, 6], [0.7, -3], [0.9, 0, "elastic"]]},
        {"part": "core", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.62, [0, 0, 0]], [0.7, [0.25, 0.25, 0.15], "out"],
                                                      [0.9, [0, 0, 0], "elastic"]]},
        {"part": "needle", "axis": "x", "keys": [[0, 0], [0.3, -10], [0.7, 30, "out"], [0.9, 0, "elastic"]]},
    ]},
    # one snowball drops from the hopper into the drum
    "load": {"length": 0.25, "loop": False, "tracks": [
        {"part": "hopper", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.06, [0.08, -0.14, 0.08], "out"],
                                                        [0.25, [0, 0, 0], "elastic"]]},
        {"part": "snowballs", "channel": "position", "keys": [[0, [0, 0.8, 0]], [0.08, [0, -0.25, 0], "in"],
                                                              [0.25, [0, 0, 0], "back"]]},
        {"part": "cobble", "channel": "position", "keys": [[0, [0, 0.8, 0]], [0.08, [0, -0.25, 0], "in"],
                                                           [0.25, [0, 0, 0], "back"]]},
    ]},
    # too hot: the frame rattles, the vent slaps open and shut, the needle hammers in the red
    "overheat": {"length": 0.8, "loop": True, "tracks": [
        {"part": "frame", "channel": "position", "keys": [[0, [0, 0, 0]], [0.05, [0.18, 0.12, -0.1]],
                                                           [0.1, [-0.15, -0.05, 0.12]], [0.15, [0.1, 0.16, 0]],
                                                           [0.2, [-0.2, 0, -0.12]], [0.25, [0.14, -0.1, 0.1]],
                                                           [0.3, [-0.08, 0.14, 0]], [0.35, [0.2, 0, 0.1]],
                                                           [0.4, [0, 0, 0]], [0.45, [-0.18, 0.1, -0.1]],
                                                           [0.5, [0.15, -0.06, 0.12]], [0.55, [-0.1, 0.15, 0]],
                                                           [0.6, [0.2, 0, -0.1]], [0.65, [-0.14, -0.08, 0.1]],
                                                           [0.7, [0.08, 0.12, 0]], [0.75, [-0.2, 0, 0.1]]],
         "ease": "linear"},
        {"part": "frame", "axis": "z", "osc": {"amp": 1.6, "cycles": 8}},
        {"part": "frame", "axis": "x", "osc": {"amp": 1.0, "cycles": 6, "phase": 0.25}},
        {"part": "vent", "axis": "x", "keys": [[0, 0], [0.08, 74, "out_back"], [0.2, 38], [0.32, 78, "out_back"],
                                               [0.46, 34], [0.58, 72, "out_back"], [0.8, 0]]},
        {"part": "needle", "axis": "x", "osc": {"amp": 7, "cycles": 8, "bias": 64}},
        {"part": "core", "channel": "scale", "osc": {"amp": [0.1, 0.1, 0.06], "cycles": 4}},
        {"part": "blaze", "channel": "scale", "osc": {"amp": [0.2, 0.1, 0.2], "cycles": 6}},
        {"part": "hopper", "axis": "z", "osc": {"amp": 3, "cycles": 4, "phase": 0.1}},
        {"part": "snowballs", "channel": "position", "osc": {"amp": [0, 0.25, 0], "cycles": 4, "shape": "bounce"}},
        {"part": "cobble", "channel": "position", "osc": {"amp": [0, 0.2, 0], "cycles": 4, "shape": "bounce"}},
    ]},
}

spec = {
    "name": "Snowball Launcher",
    "description": "A homemade rapid-fire snowball gun (Winterworks mod held item): riveted iron receiver, a "
                   "four-barrel drum, a tilted funnel hopper of snowballs, a glowing redstone tank wound with copper, "
                   "a blaze rod in a lantern-cage foregrip, a side crank, a brass gauge, a pump piston, a heat vent "
                   "and an oiled walnut grip and stock. Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "grounded": False,
    "budget": {"tris": 1400, "colors": 110},
    "light": {"dir": [0.35, 1.0, 0.45], "strength": 1.0, "gradient": 0.9, "ao": 0.0},
    "brush": {"flow": "long", "length": 3.2, "width": 0.5, "rough": 0.7, "overshoot": 0.35,
              "textures": {"iron": "metal", "brass": "metal", "copper": "metal", "wood": "wood",
                           "leather": "leather", "stone": "stone"}},
    "minecraft": {"fps": 24, "glow_parts": ["core", "blaze", "deco_vent_glow"]},
    "render": {"background": "#1b1d22", "hero": [62, 20], "shadow": 0.4},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/snowball_launcher.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts", f"(grip lifted {_dy:+.3f})")
