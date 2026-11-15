"""Builds examples/snow_globe.json: the Snow Globe, a decoration block (Winterworks mod block entity).

    python examples/src/snow_globe.py examples/snow_globe.json

A dark walnut pedestal with brass trim, ball feet and an engraved plaque holds a glass globe (stacked translucent
slabs stepping in and out so it reads round). Inside: a snowy clearing with two leaning pines, a log cabin with a
two-slab roof and lit windows, a snowman with a scarf, and loose snow that swirls up when the globe is shaken.

Units are Minecraft pixels (16 per block), density 2, every box size a multiple of 0.5, so the model exports 1:1 to a
vanilla entity model (python -m lowpix mc export). It fits one block: footprint 13 x 13, height 15.5, centred on
x = z = 0, base bottom at y = 0.

The glass slabs only show their outer shell: faces buried against the next slab are hidden, and the parts of a
slab's top/bottom face that sit under a narrower slab are punched transparent, so looking in through the glass you see
one layer of glass, never a stack of internal planes.

Part contract used by the mod's Java code: base (root), globe (bone), glass (bone, parent of every glass slab and
nothing else), scene (bone, parent of every scene piece): ground, tree0, tree1, cabin, window (glow), snowman.
Clips: shake, idle.
"""
import json
import math
import sys

import numpy as np

P = []
FRAMES = {}     # part id -> (world rotation, world pivot)
DENSITY = 2


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
    return part(id, parent, None, "walnut", shape="bone", **kw)


def mask_stamp(face, cols, rows, covered):
    """A stamp over a whole face that punches (makes transparent) the texels where covered(u, v) is true; u, v are
    the texel centre in units from the face centre. Returns None (nothing to punch) or "hide" (all of it)."""
    nu, nv = int(round(cols * DENSITY)), int(round(rows * DENSITY))
    art, n = [], 0
    for j in range(nv):
        v = -rows / 2 + (j + 0.5) / DENSITY
        row = ""
        for i in range(nu):
            u = -cols / 2 + (i + 0.5) / DENSITY
            hit = covered(u, v)
            row += "_" if hit else "."
            n += hit
        art.append(row)
    if n == 0:
        return None
    if n == nu * nv:
        return "hide"
    return {"face": face, "at": [0, 0], "art": art}


# ======================================================================= the pedestal (root pivot on the floor)
part("base", None, [12, 2.5, 12], "walnut", at=(0, 0, 0), centre=(0, 2.75, 0))
for k, (x, z) in enumerate([(5.25, 5.25), (-5.25, 5.25), (-5.25, -5.25), (5.25, -5.25)]):
    part(f"deco_foot{k}", "base", [2, 0.5, 2], "brass_dark", centre=(x, 0.25, z), rot=(0, 45, 0))
part("deco_plinth", "base", [13, 1, 13], "walnut_dark", centre=(0, 1.0, 0))
part("deco_trim", "base", [12.5, 0.5, 12.5], "brass", centre=(0, 4.25, 0))
part("deco_step", "base", [11, 1, 11], "walnut", centre=(0, 5.0, 0))
part("deco_collar", "base", [10, 1, 10], "brass", centre=(0, 6.0, 0))
part("deco_plaque", "base", [5, 1.5, 0.5], "plaque", centre=(0, 2.75, 6.1))
for k, x in enumerate((-2.1, 2.1)):
    part(f"deco_plaque_pin{k}", "deco_plaque", [0.5, 0.5, 0.5], "brass", centre=(x, 2.75, 6.35))

# ======================================================================= the globe: glass shell + the scene inside
bone("globe", "base", at=(0, 6.5, 0))
bone("glass", "globe", rel=(0, 0, 0))
# Each glass slab is a cross of an X-long box [W, h, D] and a Z-long box [D, h, W], so it reads as a rounded
# octagon from above; stacked slabs (y0, y1, W, D above the collar) follow a sphere of radius ~5.5 cut low down.
SLABS = [(0.0, 1.0, 9, 6.5), (1.0, 2.0, 10, 7), (2.0, 5.5, 11, 8), (5.5, 6.5, 10, 7), (6.5, 7.5, 9, 6.5),
         (7.5, 8.5, 7, 5), (8.5, 9.0, 4, 3)]
COLLAR = [(-5.0, 5.0, -5.0, 5.0)]


def _rects(W, D):
    return [(-W / 2, W / 2, -D / 2, D / 2), (-D / 2, D / 2, -W / 2, W / 2)]


def _inside(x, z, rects):
    return any(x0 - 1e-6 <= x <= x1 + 1e-6 and z0 - 1e-6 <= z <= z1 + 1e-6 for x0, x1, z0, z1 in rects)


GLASS = []
for k, (y0, y1, W, D) in enumerate(SLABS):
    above = _rects(*SLABS[k + 1][2:]) if k + 1 < len(SLABS) else []
    below = _rects(*SLABS[k - 1][2:]) if k > 0 else COLLAR
    boxes = [(f"glass{k}", (W, D))] + ([(f"glass{k}b", (D, W))] if D < W else [])
    for bi, (gid, (sx, sz)) in enumerate(boxes):
        h = y1 - y0
        same = [_rects(W, D)[0]] if bi == 1 else []      # the B box drops its top/bottom where A's coincide
        checks = {
            # top/bottom: u runs along x, v along z
            "top": (sx, sz, lambda u, v, o=above + same: _inside(u, v, o)),
            "bottom": (sx, sz, lambda u, v, o=below + same: _inside(u, v, o)),
        }
        if bi == 0 and D < W:   # A's front/back faces run through B in the middle
            checks["front"] = checks["back"] = (sx, h, lambda u, v: abs(u) < D / 2)
        if bi == 1:             # B's left/right faces run through A in the middle
            checks["left"] = checks["right"] = (sz, h, lambda u, v: abs(u) < D / 2)
        hide, stamps = [], []
        for face, (cu, cv, fn) in checks.items():
            st = mask_stamp(face, cu, cv, fn)
            if st == "hide":
                hide.append(face)
            elif st:
                stamps.append(st)
        GLASS.append(gid)
        extra = {}
        if hide:
            extra["hide"] = hide
        if stamps:
            extra["paint"] = {"stamps": stamps}
        part(gid, "glass", [sx, h, sz], "glass", centre=(0, 6.5 + (y0 + y1) / 2, 0), **extra)

bone("scene", "globe", rel=(0, 0, 0))
G = 6.5           # world y of the globe floor (collar top)

# snowy ground: a rounded disc of snow (a cross, the Z arm a step lower) with soft drifts and a rock
part("ground", "scene", [8.5, 1, 6], "snow_ground", centre=(0, G + 0.5, 0))
part("deco_ground_b", "ground", [6, 0.5, 8.5], "snow_ground", centre=(0, G + 0.25, 0))
part("deco_drift0", "ground", [4, 0.5, 2.5], "snow_ground", centre=(-1.6, G + 1.15, 1.5), rot=(0, 18, 0))
part("deco_drift1", "ground", [3.5, 0.5, 2.5], "snow_ground", centre=(2.0, G + 1.15, 0.6), rot=(0, -14, 0))
part("deco_rock", "ground", [1, 0.5, 1], "stone", centre=(1.4, G + 1.2, 3.0), rot=(0, 30, 6))
part("deco_rock1", "ground", [0.5, 0.5, 0.5], "stone", centre=(1.95, G + 1.1, 2.7), rot=(0, 10, -8))

# the big pine, back left, leaning a little; tiers taper and alternate 0 / 45 degrees so it reads round
part("tree0", "scene", [1, 1.5, 1], "bark", at=(-2.75, G + 1.0, -0.9), offset=(0, 0.75, 0), rot=(-3, 0, 5))
for k, (w, y, yaw) in enumerate([(4, 1.9, 0), (3.5, 2.85, 45), (2.5, 3.8, 0), (2, 4.7, 45), (1, 5.6, 0)]):
    part(f"deco_tree0_t{k}", "tree0", [w, 1 if k < 4 else 1.5, w], "pine" if k < 4 else "pine_tip",
         rel=(0, y, 0), rot=(0, yaw + 10, 0))
# the small pine, right, leaning the other way
part("tree1", "scene", [1, 1, 1], "bark", at=(2.9, G + 1.0, -0.6), offset=(0, 0.5, 0), rot=(4, 0, -6))
for k, (w, y, yaw) in enumerate([(3, 1.4, 20), (2.5, 2.2, 65), (1.5, 3.0, 20), (1, 3.8, 65)]):
    part(f"deco_tree1_t{k}", "tree1", [w, 1, w], "pine" if k < 3 else "pine_tip", rel=(0, y, 0), rot=(0, yaw, 0))

# the log cabin, back centre, turned a little toward the front left; two roof slabs meet at a ridge along X
part("cabin", "scene", [3.5, 2, 3], "logs", centre=(0.4, G + 2.0, -2.0), rot=(0, -14, 0))
part("deco_gable0", "cabin", [3.5, 0.5, 2.5], "logs", rel=(0, 1.25, 0))
part("deco_gable1", "cabin", [3.5, 0.5, 1.5], "logs", rel=(0, 1.75, 0))
part("deco_roof_f", "cabin", [4.5, 0.5, 2.5], "roof", rel=(0, 2.25, 0), offset=(0, 0, 1.2), rot=(36, 0, 0))
part("deco_roof_b", "cabin", [4.5, 0.5, 2.5], "roof", rel=(0, 2.25, 0), offset=(0, 0, -1.2), rot=(-36, 0, 0))
part("deco_ridge", "cabin", [4.5, 0.5, 0.5], "snow_cap", rel=(0, 2.45, 0))
part("deco_chimney", "cabin", [1, 2, 1], "stone", rel=(1.0, 1.9, -0.8))
part("deco_door", "cabin", [1, 1.5, 0.5], "door", rel=(-0.9, -0.25, 1.55))
part("deco_window_side", "cabin", [0.5, 1, 1.5], "window", rel=(1.8, 0.1, -0.1))
part("deco_woodpile", "cabin", [0.5, 1, 2], "woodpile", rel=(-2.05, -0.5, 0.2))
part("deco_woodpile1", "deco_woodpile", [0.5, 0.5, 1.5], "woodpile", rel=(-0.3, -0.25, 0.1), rot=(0, 6, 0))
# the lit front window (its own part so the mod can pulse it), with a snowy sill
_Rc, _tc = FRAMES["cabin"]
part("window", "scene", [1.5, 1, 0.5], "window", at=_tc + _Rc @ np.array([0.7, 0.1, 1.55]), rot=(0, -14, 0))
part("deco_sill", "window", [2, 0.5, 0.5], "snow_cap", rel=(0, -0.65, 0.15))

# the snowman, front left, head cocked
part("snowman", "scene", [1.5, 1, 1.5], "snowman", at=(-2.0, G + 1.0, 2.4), offset=(0, 0.5, 0), rot=(0, 25, 0))
part("deco_sm_round", "snowman", [1, 1.5, 1], "snowman", rel=(0, 0.6, 0))
part("deco_sm_scarf", "snowman", [1, 0.5, 1], "scarf", rel=(0, 1.3, 0), rot=(0, 20, 4))
part("deco_sm_tail", "deco_sm_scarf", [0.5, 1, 0.5], "scarf", rel=(0.4, -0.45, 0.4), rot=(0, 0, -12))
part("deco_sm_head", "snowman", [1, 1, 1], "snowman", rel=(0, 1.95, 0), rot=(0, -10, 12))
part("deco_sm_nose", "deco_sm_head", [0.5, 0.5, 1], "carrot", rel=(0, 0.0, 0.6))
part("deco_sm_hat", "deco_sm_head", [1, 0.5, 1], "coal", rel=(0, 0.6, 0), rot=(0, 0, -6))
for k, sgn in enumerate((1, -1)):
    part(f"deco_sm_arm{k}", "snowman", [1.5, 0.5, 0.5], "twig", rel=(sgn * 0.6, 1.0, 0), offset=(sgn * 0.7, 0, 0),
         rot=(0, 0, sgn * (30 if k == 0 else 16)))

# loose snow: three handfuls lying on the ground at rest, swirling up when the globe is shaken
FLAKES = {
    "deco_snow_a": [(-3.2, 1.1, 0.6), (-0.2, 1.1, 3.6), (0.6, 1.1, 1.2), (3.0, 1.4, 1.6)],
    "deco_snow_b": [(-0.6, 1.1, 0.0), (1.0, 1.1, 3.4), (-2.8, 1.1, -2.9), (3.6, 1.1, -2.6)],
    "deco_snow_c": [(2.6, 1.1, -3.2), (-1.4, 1.4, 0.8), (3.8, 1.1, 0.9), (0.2, 1.1, 2.4)],
}
for b, pts in FLAKES.items():
    bone(b, "scene", rel=(0, 0, 0))
    for k, (x, y, z) in enumerate(pts):
        part(f"{b}{k}", b, [0.5, 0.5, 0.5], "flake", centre=(x, G + y, z))


# ----------------------------------------------------------------------- fit checks: inside the block and the glass
def _corners(d):
    R, t = FRAMES[d["id"]]
    c = np.array(d.get("offset", (0, 0, 0)), float)
    h = np.array(d["size"], float) / 2
    return np.array([t + R @ (c + h * [sx, sy, sz]) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)])


_all = np.concatenate([_corners(d) for d in P if d["shape"] == "box"])
assert _all[:, 1].min() >= -1e-6 and _all[:, 1].max() <= 16 + 1e-6, _all[:, 1].min()
assert np.abs(_all[:, [0, 2]]).max() <= 7 + 1e-6, np.abs(_all[:, [0, 2]]).max()
_scene = {d["id"] for d in P if d["shape"] == "box"} - set(GLASS)
_scene = [d for d in P if d["id"] in _scene and d["id"] in FRAMES and FRAMES[d["id"]][1][1] >= G - 1e-6
          and not d["id"].startswith("deco_collar")]
_bad = []
for d in _scene:
    for x, y, z in _corners(d):
        if y < G - 1e-6:
            continue
        if not any(_inside(x, z, _rects(W, D)) for y0, y1, W, D in SLABS if y0 - 1e-6 <= y - G <= y1 + 1e-6):
            _bad.append(f"{d['id']} at {x:.2f},{y - G:.2f},{z:.2f}")
assert not _bad, "pokes out of the glass: " + "; ".join(_bad)

# ======================================================================= palette: muted, hue-shifted ramps
ramps = {
    "walnut": ["#0f0a09", "#18100d", "#211612", "#2b1c16", "#36231b", "#422b21", "#4f3428", "#5d3e30"],
    "brass": ["#19130c", "#2a2013", "#3d301a", "#524122", "#68532b", "#7e6634", "#94793f", "#a88d4e", "#bba263",
              "#cdb67c"],
    "verdigris": ["#232c27", "#313d35", "#415045"],
    "glass": ["#6f8496", "#8ea3b4", "#b3c5d2", "#d9e5ec", "#ffffff"],
    "snow": ["#4f5a6c", "#68758a", "#8592a6", "#a4b0c2", "#c3cdd9", "#dde4ec", "#f0f4f8", "#fbfdfe"],
    "pine": ["#0c1512", "#122019", "#192b21", "#21372a", "#2b4534", "#37533f", "#45624b"],
    "bark": ["#140d0b", "#1f1511", "#2b1d17", "#38261d", "#463024"],
    "logs": ["#1a110c", "#261911", "#332217", "#422c1e", "#513726", "#61432f", "#715038"],
    "roof": ["#141215", "#1e1b1f", "#29252a", "#353036", "#423c43"],
    "stone": ["#1a191c", "#28272a", "#37363a", "#48474a", "#5a585b", "#6e6b6d"],
    "window": ["#5c2c07", "#99560e", "#d48f22", "#f7c44c", "#ffe48a", "#fff6cf"],
    "wool": ["#2a1012", "#43181a", "#5e2323", "#77302c", "#8c3f36"],
    "carrot": ["#4a2108", "#7a3a0e", "#a45518", "#c06e26"],
    "coal": ["#0e0e10", "#18181b", "#232327", "#303035"],
}

RIM = {"light_shift": 1.3, "dark_shift": -1.3}
WALNUT = [
    {"id": "grain", "op": "stripes", "axis": "y", "period": 0.5, "width": 0.4, "shift": -0.7, "wobble": 0.5,
     "faces": ["sides"]},
    {"id": "grain_top", "op": "stripes", "axis": "x", "period": 0.5, "width": 0.4, "shift": -0.6, "wobble": 0.5,
     "faces": ["top", "bottom"]},
    {"id": "figure", "op": "noise", "scale": 0.8, "amount": 0.55},
    {"id": "photo", "op": "photo", "src": "assets/photos/bark_brown_02", "scale": 10.0, "amount": 0.25,
     "ramps": ["walnut"]},
    {"id": "polish", "op": "gloss", "dash": True, "length": 3, "shift": 1.2, "density": 0.45, "post": True},
]
BRASS = [
    {"id": "under", "op": "gradient", "axis": "y", "amount": 0.7},
    {"id": "mottle", "op": "noise", "scale": 0.6, "amount": 0.5},
    {"id": "tarnish", "op": "patches", "scale": 0.8, "threshold": 0.76, "ramp": "verdigris", "tone": 1.4,
     "faces": ["sides", "bottom"]},
    {"id": "polish", "op": "gloss", "dash": True, "length": 2, "shift": 1.4, "density": 0.5, "post": True},
]
PINE = [
    {"id": "needles", "op": "stripes", "axis": "y", "period": 0.5, "width": 0.4, "shift": -0.9, "wobble": 0.6,
     "faces": ["sides"]},
    {"id": "clumps", "op": "noise", "scale": 0.5, "amount": 0.8},
    {"id": "photo", "op": "photo", "src": "assets/photos/forest_leaves_02", "scale": 3.0, "amount": 0.5,
     "ramps": ["pine"]},
    {"id": "snow", "op": "drip", "ramp": "snow", "tone": 4.6, "depth": 0.08, "length": 0.35, "width": 0.5,
     "scale": 1.0, "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "pine", "shadow_tone": 1.0}},
    {"id": "bare", "op": "patches", "scale": 0.5, "threshold": 0.58, "ramp": "pine", "tone": 3.4, "faces": ["top"]},
]
SNOW = [
    {"id": "drifts", "op": "noise", "scale": 0.7, "amount": 0.7},
    {"id": "hollows", "op": "patches", "scale": 0.9, "threshold": 0.66, "shift": -0.8},
    {"id": "glint", "op": "speckle", "density": 0.03, "shift": 1.5},
]

styles = {
    "walnut": {"ramp": "walnut", "tone": 4.0, "rim": RIM, "brush": {"flow": "horizontal"}, "layers": WALNUT},
    "walnut_dark": {"ramp": "walnut", "tone": 3.2, "rim": RIM, "brush": {"flow": "horizontal"}, "layers": WALNUT},
    "brass": {"ramp": "brass", "tone": 4.0, "rim": {"light_shift": 1.6, "dark_shift": -1.3}, "layers": BRASS},
    "brass_dark": {"ramp": "brass", "tone": 3.4, "rim": {"light_shift": 1.5, "dark_shift": -1.0}, "layers": BRASS},
    # an engraved name line (10 x 3 texels on the front), cut dark with a lit lower lip
    "plaque": {"ramp": "brass", "tone": 5.0, "rim": {"light_shift": 1.6, "dark_shift": -1.4}, "layers": BRASS,
               "stamps": [{"face": "front", "at": [0, 1], "key": {"k": "brass:1", "K": "brass:3"},
                           "art": [".kk.kKk.k."]}]},
    # pale glass: barely shaded, a bright lip on the lit edges, and one continuous highlight streak running down the
    # front-left of the dome (world space, so it lines up across the slabs) plus a softer one on the left side
    "glass": {"ramp": "glass", "tone": 1.4, "light": 0.35, "brush": {"off": True}, "dither": 0.0,
              "rim": {"light_shift": 1.4, "dark": 0},
              "layers": [{"id": "sheen", "op": "band", "axis": "x", "space": "world", "from": -3.4, "to": -2.6,
                          "ramp": "glass", "tone": 4, "faces": ["front"]},
                         {"id": "sheen_soft", "op": "band", "axis": "x", "space": "world", "from": -2.2, "to": -1.9,
                          "ramp": "glass", "tone": 3, "faces": ["front"]},
                         {"id": "sheen_side", "op": "band", "axis": "z", "space": "world", "from": 2.4, "to": 3.2,
                          "ramp": "glass", "tone": 3.6, "faces": ["left"]},
                         {"id": "back_sheen", "op": "band", "axis": "x", "space": "world", "from": 2.6, "to": 3.0,
                          "ramp": "glass", "tone": 2.6, "faces": ["back"]},
                         {"id": "cap_glint", "op": "band", "axis": "x", "space": "world", "from": -2.6, "to": -1.6,
                          "ramp": "glass", "tone": 3.6, "faces": ["top"]}]},
    "snow_ground": {"ramp": "snow", "tone": 3.6, "rim": {"light_shift": 0.8, "dark_shift": -0.9},
                    "brush": {"flow": "horizontal", "rough": 0.45}, "layers": SNOW},
    "snow_cap": {"ramp": "snow", "tone": 4.4, "rim": {"light_shift": 0.8, "dark_shift": -1.0}, "layers": SNOW[:1]},
    "flake": {"ramp": "snow", "tone": 6.4, "light": 0.3, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "pine": {"ramp": "pine", "tone": 3.6, "rim": {"light_shift": 1.0, "dark_shift": -1.2},
             "brush": {"flow": "vertical", "rough": 0.7}, "layers": PINE},
    "pine_tip": {"ramp": "pine", "tone": 4.0, "rim": {"light_shift": 1.0, "dark_shift": -1.0},
                 "layers": PINE[1:2] + [dict(PINE[3], depth=0.25)]},
    "bark": {"ramp": "bark", "tone": 2.4, "rim": {"light_shift": 0.8, "dark_shift": -0.8},
             "layers": [{"id": "photo", "op": "photo", "src": "assets/photos/bark_brown_02", "scale": 2.0,
                         "amount": 0.7, "ramps": ["bark"]}]},
    "logs": {"ramp": "logs", "tone": 3.6, "rim": {"light_shift": 1.0, "dark_shift": -1.1},
             "brush": {"flow": "horizontal"},
             "layers": [{"id": "courses", "op": "stripes", "axis": "y", "period": 0.5, "width": 0.5, "shift": -1.2,
                         "faces": ["sides"]},
                        {"id": "grain", "op": "noise", "scale": 0.5, "amount": 0.6},
                        {"id": "snowline", "op": "drip", "ramp": "snow", "tone": 4.6, "depth": 0.1, "length": 0.4,
                         "width": 0.5, "scale": 1.0, "faces": ["top"]}]},
    "roof": {"ramp": "roof", "tone": 2.6, "rim": {"light_shift": 1.0, "dark_shift": -1.0},
             "layers": [{"id": "shingles", "op": "scales", "shape": "square", "along": "x", "size": [0.8, 0.5],
                         "gap": 1.0, "highlight": 0.7, "shadow": -1.0, "gradient": 0.4, "jitter": 0.6},
                        {"id": "snow", "op": "drip", "ramp": "snow", "tone": 4.8, "depth": 0.2, "length": 0.4,
                         "width": 0.5, "scale": 1.0,
                         "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "roof", "shadow_tone": 0.5}},
                        {"id": "bare", "op": "patches", "scale": 0.6, "threshold": 0.64, "ramp": "roof", "tone": 2.4,
                         "faces": ["top"]}]},
    "woodpile": {"ramp": "logs", "tone": 3.4, "rim": {"light_shift": 1.0, "dark_shift": -1.0},
                 "layers": [{"id": "ends", "op": "spots", "count": 6, "radius": [0.2, 0.3], "ramp": "logs", "tone": 5.5,
                             "faces": ["front", "back"]},
                            {"id": "snow", "op": "drip", "ramp": "snow", "tone": 5.0, "depth": 0.1, "length": 0.3,
                             "width": 0.5, "scale": 1.0}]},
    "door": {"ramp": "logs", "tone": 1.8, "rim": {"light_shift": 0.8, "dark_shift": -0.8},
             "layers": [{"id": "planks", "op": "stripes", "axis": "x", "period": 0.5, "width": 0.3, "shift": -0.8},
                        {"id": "knob", "op": "rect", "rect": [0.6, 0.45, 0.8, 0.6], "ramp": "brass", "tone": 6,
                         "faces": ["front"]}]},
    "window": {"ramp": "window", "tone": 3.4, "light": 0.2, "brush": {"off": True}, "dither": 0.0,
               "rim": {"light": 0, "dark": 1, "dark_shift": -1.4},
               "layers": [{"id": "mullion", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "ramp": "logs",
                           "tone": 1.0, "faces": ["front", "back"]},
                          {"id": "mullion_side", "op": "band", "axis": "z", "from": -0.2, "to": 0.2, "ramp": "logs",
                           "tone": 1.0, "faces": ["left", "right"]},
                          {"id": "warm", "op": "gradient", "axis": "y", "amount": -0.6}]},
    "stone": {"ramp": "stone", "tone": 3.2, "rim": {"light_shift": 1.0, "dark_shift": -1.0},
              "layers": [{"id": "photo", "op": "photo", "src": "assets/photos/rock_face_03", "scale": 2.0,
                          "amount": 0.8, "ramps": ["stone"]},
                         {"id": "snow", "op": "drip", "ramp": "snow", "tone": 5.4, "depth": 0.2, "length": 0.4,
                          "width": 0.5, "scale": 1.0}]},
    "snowman": {"ramp": "snow", "tone": 4.0, "rim": {"light_shift": 0.7, "dark_shift": -1.0},
                "brush": {"flow": "horizontal", "rough": 0.4},
                "layers": [{"id": "lumps", "op": "noise", "scale": 0.5, "amount": 0.7},
                           {"id": "under", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "scarf": {"ramp": "wool", "tone": 2.8, "rim": {"light_shift": 0.9, "dark_shift": -0.9},
              "layers": [{"id": "knit", "op": "stripes", "axis": "y", "period": 0.5, "width": 0.5, "shift": -0.7},
                         {"id": "fuzz", "op": "noise", "scale": 0.4, "amount": 0.5}]},
    "carrot": {"ramp": "carrot", "tone": 2.4, "rim": {"light_shift": 0.8, "dark_shift": -0.8}},
    "coal": {"ramp": "coal", "tone": 1.6, "rim": {"light_shift": 1.0, "dark_shift": -0.6}},
    "twig": {"ramp": "bark", "tone": 2.6, "rim": {"light_shift": 0.8, "dark_shift": -0.6}},
}

# ======================================================================= clips
SNOW_BONES = list(FLAKES)
anim = {
    # pick it up and shake it: the pedestal squashes, the globe stretches up and rocks, the loose snow is flung up
    # and swirls round before it settles; everything rings out on an elastic ease
    "shake": {"length": 0.9, "loop": False, "tracks": [
        {"part": "base", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.08, [0.07, -0.12, 0.07], "out"],
                                                      [0.2, [-0.03, 0.06, -0.03], "out"], [0.9, [0, 0, 0], "elastic"]]},
        {"part": "globe", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.08, [0.06, -0.1, 0.06], "out"],
                                                       [0.22, [-0.07, 0.13, -0.07], "out"],
                                                       [0.36, [0.04, -0.06, 0.04]], [0.9, [0, 0, 0], "elastic"]]},
        {"part": "globe", "axis": "z", "keys": [[0, 0], [0.1, -5], [0.24, 9, "out"], [0.4, -6.5], [0.56, 3.5],
                                                [0.9, 0, "elastic"]], "ease": "smooth"},
        {"part": "globe", "axis": "x", "keys": [[0, 0], [0.16, 4], [0.32, -5], [0.5, 3], [0.9, 0, "elastic"]],
         "ease": "smooth"},
        {"part": "deco_snow_a", "channel": "position", "keys": [[0, [0, 0, 0]], [0.18, [0, 4.4, 0], "out"],
                                                                [0.5, [0, 3.6, 0]], [0.9, [0, 0, 0], "in"]]},
        {"part": "deco_snow_a", "axis": "y", "keys": [[0, 0], [0.9, 360, "out"]]},
        {"part": "deco_snow_b", "channel": "position", "keys": [[0, [0, 0, 0]], [0.22, [0, 5.0, 0], "out"],
                                                                [0.55, [0, 3.0, 0]], [0.9, [0, 0, 0], "in"]]},
        {"part": "deco_snow_b", "axis": "y", "keys": [[0, 0], [0.9, -360, "out"]]},
        {"part": "deco_snow_c", "channel": "position", "keys": [[0, [0, 0, 0]], [0.15, [0, 3.0, 0], "out"],
                                                                [0.45, [0, 4.2, 0]], [0.9, [0, 0, 0], "in"]]},
        {"part": "deco_snow_c", "axis": "y", "keys": [[0, 0], [0.9, 360, "inout_back"]]},
        {"part": "tree0", "axis": "z", "keys": [[0, 0], [0.16, 4], [0.3, -5], [0.46, 3], [0.9, 0, "elastic"]],
         "ease": "smooth"},
        {"part": "tree1", "axis": "z", "keys": [[0, 0], [0.18, -5], [0.32, 5], [0.48, -2.5], [0.9, 0, "elastic"]],
         "ease": "smooth"},
        {"part": "deco_sm_head", "axis": "z", "keys": [[0, 0], [0.2, 8], [0.36, -6], [0.9, 0, "elastic"]],
         "ease": "smooth"},
        {"part": "window", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.1, [0.15, 0.15, 0.15]],
                                                        [0.9, [0, 0, 0], "elastic"]]},
    ]},
    # at rest: the windows breathe like a fire is burning inside
    "idle": {"length": 3.0, "loop": True, "tracks": [
        {"part": "window", "channel": "scale", "osc": {"amp": [0.06, 0.06, 0.06], "cycles": 2}},
        {"part": "window", "channel": "scale", "osc": {"amp": [0.03, 0.03, 0.03], "cycles": 5, "phase": 0.3}},
        {"part": "deco_window_side", "channel": "scale", "osc": {"amp": [0.05, 0.05, 0.05], "cycles": 2,
                                                                 "phase": 0.35}},
    ]},
}

spec = {
    "name": "Snow Globe",
    "description": "A snow globe decoration block (Winterworks mod block entity): a walnut and brass pedestal with an "
                   "engraved plaque, a glass globe built from stepped translucent slabs, and inside a snowy clearing "
                   "with two pines, a log cabin with lit windows and a snowman. Minecraft pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 1400, "colors": 110},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 1.0, "gradient": 0.8, "ao": 0.6, "ao_height": 2.0},
    "brush": {"flow": "long", "length": 2.0, "width": 0.5, "rough": 0.55, "overshoot": 0.3,
              "textures": {"brass": "metal", "walnut": "wood", "logs": "wood", "bark": "wood", "stone": "stone",
                           "pine": "fur"}},
    "minecraft": {"fps": 24, "glow_parts": ["window", "deco_window_side"],
                  "alpha_parts": {g: 0.35 for g in GLASS}},
    "render": {"background": "#1a1c22", "hero": [-34, 18], "shadow": 0.45},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/snow_globe.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts")
