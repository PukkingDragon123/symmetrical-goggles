"""Builds examples/voltwing_wyvern.json, an original electric wyvern in the blocky, brush-painted style.

    python examples/src/voltwing_wyvern.py examples/voltwing_wyvern.json

Parts are boxes, tapers and cards. VFX are geometry too: lightning bolts are crossed alpha cards with
procedurally drawn jagged art, flickered by stepped scale keys in every clip; sparks are tiny glowing
cubes; the thunder-breath beam is a glowing box that the "breath" clip stretches out of the mouth.
The previews add bloom (`render.bloom`) to the glowing ramps.

Built the way the genre's references are (studied from public Sketchfab previews: faceted organic lofts,
chunky texels, one strong base ramp with a bold bevelled pattern, glowing accents with emission and bloom).
"""
import json
import math
import sys

import numpy as np

RNG = np.random.default_rng(23)
DENSITY = 3
P = []


def part(id, **kw):
    d = {"id": id}
    d.update(kw)
    P.append(d)
    return d


def box(id, parent, size, pivot, style, offset=None, rot=None, shape="box", **kw):
    d = dict(shape=shape, size=[round(v, 3) for v in size], pivot=[round(v, 3) for v in pivot], style=style)
    if parent:
        d["parent"] = parent
    if offset:
        d["offset"] = [round(v, 3) for v in offset]
    if rot:
        d["rotation"] = [round(v, 2) for v in rot]
    d.update(kw)
    return part(id, **d)


def taper(id, parent, size, pivot, style, fs=(0.2, 0.2), **kw):
    return box(id, parent, size, pivot, style, shape="taper", front_scale=list(fs), **kw)


# ------------------------------------------------------------------ art generators
def _line(grid, x0, y0, x1, y1, ch):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for k in range(n + 1):
        t = k / max(n, 1)
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        if 0 <= y < len(grid) and 0 <= x < len(grid[0]):
            grid[y][x] = ch


def bolt_art(w, h, branches=2, rng=RNG):
    """A jagged lightning bolt: white core ('x') with a halo ('o'), plus forks."""
    g = [["."] * w for _ in range(h)]

    def walk(x, y0, y1, drift, step=3):
        pts = [(x, y0)]
        y = y0
        while y < y1:
            y = min(y1, y + rng.integers(2, step + 2))
            x = float(np.clip(x + rng.uniform(-2.2, 2.2) + drift, 1, w - 2))
            pts.append((x, y))
        return pts
    lines = [walk(w / 2, 0, h - 1, 0.0)]
    for _ in range(branches):
        a = lines[0][rng.integers(1, max(2, len(lines[0]) - 2))]
        lines.append(walk(a[0], a[1], min(h - 1, a[1] + rng.integers(h // 5, h // 2)), float(rng.choice([-0.9, 0.9]))))
    for li, pts in enumerate(lines):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            _line(g, x0, y0, x1, y1, "x")
            if li == 0:  # the main channel is two pixels wide
                _line(g, x0 + 1, y0, x1 + 1, y1, "x")
    for y in range(h):
        for x in range(w):
            if g[y][x] == "." and any(0 <= y + dy < h and 0 <= x + dx < w and g[y + dy][x + dx] == "x"
                                      for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))):
                g[y][x] = "o"
    return ["".join(r) for r in g]


def membrane_art(cols, rows, anchors, fingers, veins=6, rng=RNG):
    """A wing membrane on an xz card (image top = back). anchors: [(x 0..1, depth 0..1)] along the trailing
    edge, scalloped between them. fingers: [(x0, x1, depth1)] bone lines from the leading edge.
    Chars: m membrane, f finger bone, v glowing vein, e trailing-edge rim."""
    g = [["."] * cols for _ in range(rows)]
    ax = np.array([a[0] for a in anchors])
    ad = np.array([a[1] for a in anchors])

    def edge(x):
        i = int(np.clip(np.searchsorted(ax, x) - 1, 0, len(ax) - 2))
        t = (x - ax[i]) / max(ax[i + 1] - ax[i], 1e-6)
        base = ad[i] * (1 - t) + ad[i + 1] * t
        return base * (1 - 0.32 * math.sin(math.pi * t))     # scallop between anchors
    for c in range(cols):
        x = (c + 0.5) / cols
        d = edge(x)
        for r in range(rows):
            depth = (rows - 1 - r + 0.5) / rows
            if depth <= d:
                g[r][c] = "m"
    for (x0, x1, d1) in fingers:
        for wofs in (0, 1):
            _line(g, x0 * cols + wofs, rows - 1, x1 * cols + wofs, (1 - d1) * rows, "f")
    for k in range(veins):  # glowing veins wander back from the fingers into the membrane
        f = fingers[k % len(fingers)]
        t = rng.uniform(0.2, 0.7)
        x = (f[0] + (f[1] - f[0]) * t) * cols
        y = rows - 1 - t * f[2] * rows
        for _ in range(int(rng.integers(8, 18))):
            nx, ny = x + rng.uniform(-2.5, 2.5) - 1.0, y - rng.uniform(1, 3)
            _line(g, x, y, nx, ny, "v")
            x, y = nx, ny
            if not (0 <= int(y) < rows and 0 <= int(x) < cols) or g[int(y)][int(x)] == ".":
                break
    for r in range(rows):
        for c in range(cols):
            if g[r][c] in "mv" and any(0 <= r + dr < rows and 0 <= c + dc < cols and g[r + dr][c + dc] == "."
                                       for dr, dc in ((-1, 0), (0, -1), (0, 1))):
                g[r][c] = "e"
            elif g[r][c] == "v" and (r + c) % 9 == 0:
                g[r][c] = "m"
    return ["".join(r) for r in g]


# ------------------------------------------------------------------ loft helpers
def loft(id, parent, rings, style, sides=8, rnd=2.6, subdiv=1, caps=(True, True), **kw):
    d = dict(shape="loft", profile={"sides": sides, "round": rnd}, subdiv=subdiv, caps=list(caps),
             rings=[{"at": [round(v, 3) for v in r[0]], "size": (round(r[1], 3) if not isinstance(r[1], (list, tuple))
                                                                 else [round(v, 3) for v in r[1]])} for r in rings],
             style=style)
    if parent:
        d["parent"] = parent
    d.update(kw)
    return part(id, **d)


def spike(id, parent, at, length, width, style, rot, sides=4, **kw):
    """A tapering horn/spike/crystal loft standing on a surface (local +y)."""
    return loft(id, parent, [((0, 0, 0), width), ((0, length * 0.55, 0), width * 0.7), ((0, length, 0), 0.0)], style,
                sides=sides, rnd=2.0, subdiv=0, caps=(False, False), attach=at, rotation=list(rot), **kw)


# ------------------------------------------------------------------ body + tail (one chain loft)
BODY = [((0, 15.0, 8.5), [9.4, 10.2]), ((0, 14.6, 3.5), [11.4, 11.4]), ((0, 13.6, -2.0), [10.6, 10.2]),
        ((0, 12.6, -7.5), [7.8, 7.4]), ((0.0, 11.4, -13.0), [5.8, 5.4]), ((-1.4, 10.4, -18.5), [4.4, 4.0]),
        ((-3.0, 10.0, -24.0), [3.2, 3.0]), ((-2.2, 10.8, -29.0), [2.8, 2.6]), ((0.8, 11.8, -33.0), [2.3, 2.1]),
        ((3.6, 12.4, -36.0), [1.8, 1.7])]
loft("body", None, BODY, ["scales", "bands"], chain=True, caps=[True, True])
TAIL = [f"body_{k}" for k in range(3, len(BODY) - 1)]
loft("neck", "body", [((0, 0, 0), [8.0, 8.6]), ((0, 4.6, 3.4), [6.4, 6.8]), ((0, 8.4, 5.4), [5.4, 5.8]),
                      ((0, 11.6, 8.2), [4.8, 5.2])], ["scales", "bands"], chain=True, caps=[False, False],
     pivot=[0, 16.6, 8.8])
NECK = ["neck_0", "neck_1", "neck_2"]
# ------------------------------------------------------------------ head
loft("head", "neck", [((0, 0.9, -2.4), [6.0, 5.6]), ((0, 1.3, 1.0), [7.8, 6.4]), ((0, 0.6, 4.4), [6.2, 4.8]),
                      ((0, 0.0, 7.6), [4.8, 3.6]), ((0, -0.3, 9.8), [3.6, 2.6]), ((0, -0.5, 11.0), [2.8, 2.2])],
     ["head", "head_bands"], pivot=[0, 11.9, 9.4], rotation=[12, 0, 0])
loft("jaw", "head", [((0, -0.2, -1.2), [5.8, 2.4]), ((0, -0.4, 3.6), [5.0, 2.2]), ((0, -0.2, 7.4), [3.6, 1.6]),
                     ((0, 0.0, 9.4), [2.6, 1.2])], "head_under", sides=6, subdiv=0, pivot=[0, -2.0, 0.6], rotation=[16, 0, 0])
part("mouth", parent="jaw", shape="card", plane="xz", pivot=[0, 0.75, 4.2], style="mouth",
     art=["..mmmmmm..", ".mmmmmmmm.", ".mmmggmmm.", "mmmgggmmmm", "mmmggggmmm", "mmmgggmmmm", "mmmmggmmmm", ".mmmmmmmm.",
          ".mmmmmmmm.", "..mmmmmm.."])
for k, (side, pz, art) in enumerate([("upper", 7.8, ["wt..t.wt..t.t.", "wt..t.wt..t...", ".w....w.......", ".w............"]),
                                     ("lower", 7.0, [".w....w..", "wt...wt..", "wt...wt.."])]):
    part(f"fangs_{side}", parent="head" if side == "upper" else "jaw", shape="card", plane="yz",
         pivot=[2.0, -2.0, pz] if side == "upper" else [1.7, 1.0, pz], rotation=[0, -10, 0], mirror=True,
         style="teeth", art=art)
loft("eye", "head", [((0, 0, -1.0), [3.8, 2.8]), ((0, 0, 0.6), [3.6, 2.6])], "eye", sides=6, rnd=2.2, subdiv=0,
     caps=[False, True], pivot=[3.3, 1.9, 3.4], rotation=[-6, 62, 0], mirror=True)
loft("brow", "head", [((0, 0.2, -0.6), [2.8, 2.0]), ((0.3, -0.2, 2.6), [2.2, 1.6]), ((0.4, -0.6, 4.2), [1.5, 1.2])],
     "storm", sides=5, rnd=2.4, subdiv=0, pivot=[2.6, 3.0, 0.9], rotation=[0, 12, -18], mirror=True)
loft("horn", "head", [((0, 0, 0), 2.4), ((0.3, 0.6, -2.6), 2.1), ((0.7, 1.2, -5.4), 1.7), ((1.0, 2.2, -8.2), 1.3),
                      ((1.0, 3.6, -10.4), 0.0)], "horn", sides=6, rnd=2.2, subdiv=0, caps=[True, False],
     pivot=[1.9, 3.0, -0.8], rotation=[-10, -14, 0], mirror=True)
loft("cheek_horn", "head", [((0, 0, 0), 1.8), ((0.2, 0.3, -2.2), 1.4), ((0.4, 0.8, -4.0), 0.0)], "horn", sides=5,
     rnd=2.2, subdiv=0, caps=[True, False], pivot=[3.4, -0.6, -0.4], rotation=[-6, -30, 0], mirror=True)
loft("nose_horn", "head", [((0, 0, 0), 1.4), ((0, 1.0, 0.4), 1.0), ((0, 2.0, -0.2), 0.0)], "horn", sides=4, rnd=2.0,
     subdiv=0, caps=[True, False], pivot=[0, 1.0, 9.0], rotation=[-20, 0, 0])
for k, t in enumerate([0.1, 0.45, 0.8]):  # crest of conductor fins down the neck
    spike(f"crest{k}", "neck", {"t": t, "around": 0.0, "align": "surface", "offset": -0.3}, 3.4 - k * 0.5, 1.6, "fin",
          (-34, 0, 0), sides=3)
spike("crest_head", "head", {"t": 0.12, "around": 0.0, "align": "surface", "offset": -0.3}, 2.8, 1.4, "fin", (-50, 0, 0),
      sides=3)
part("beam", parent="head", shape="box", size=[2.4, 2.4, 1.0], pivot=[0, -1.4, 9.8], offset=[0, 0, 0.5], rotation=[-16, 0, 0],
     style="beam")

# ------------------------------------------------------------------ hind legs (bipedal)
loft("leg", "body", [((-2.0, 1.4, 0.4), [5.2, 6.4]), ((1.4, -3.0, 2.8), [4.6, 5.0]), ((2.2, -6.6, -0.8), [3.0, 3.2]),
                     ((2.4, -10.2, 1.4), [2.4, 2.4]), ((2.5, -11.3, 1.8), [2.6, 1.6])], ["scales", "bands"],
     sides=6, rnd=2.3, subdiv=0, chain=True, caps=[False, False], attach={"t": 0.25, "around": 0.3, "align": "none"},
     mirror=True, hide=["joint1_end", "joint1_start", "joint3_end", "joint3_start"])
loft("foot", "leg", [((0, 0.8, -1.4), [3.2, 1.8]), ((0, 0.8, 1.0), [3.8, 1.8]), ((0, 0.6, 2.6), [3.4, 1.2])], "storm",
     sides=6, rnd=2.4, subdiv=0, caps=[False, True], attach={"t": 1.0, "around": 0.5, "align": "none"},
     orient="world", snap_ground=0.04)
for k, (x, ry) in enumerate([(0, 0), (1.2, 18), (-1.2, -18)]):
    loft(f"talon{k}", "foot", [((0, 0, 0), [1.3, 1.2]), ((0, 0.0, 1.2), [1.0, 0.9]), ((0, -0.6, 2.2), 0.0)], "talon",
         sides=3, rnd=2.0, subdiv=0, caps=[False, False], pivot=[x, 0.6, 2.4], rotation=[0, ry, 0])
loft("talon_back", "foot", [((0, 0, 0), [1.2, 1.1]), ((0, 0.0, -1.0), [0.9, 0.8]), ((0, -0.5, -1.8), 0.0)], "talon",
     sides=3, rnd=2.0, subdiv=0, caps=[False, False], pivot=[0, 0.6, -1.3])

# ------------------------------------------------------------------ wings: shoulder bone, arm lofts, fingers, membranes
part("wing_root", parent="body", shape="bone", style="storm", attach={"t": 0.06, "around": 0.16, "align": "none"},
     rotation=[-10, 26, 46], mirror=True)
loft("humerus", "wing_root", [((-1.0, 0, 0), [3.2, 3.6]), ((5.0, 0.3, 0), [2.6, 2.8]), ((11.0, 0, 0), [2.0, 2.2])],
     ["storm"], sides=6, rnd=2.3, subdiv=0)
loft("forearm", "humerus", [((0, 0, 0), [2.0, 2.2]), ((8.0, 0.2, 0), [1.6, 1.7]), ((15.0, 0, 0), [1.4, 1.5])],
     ["storm"], sides=6, rnd=2.3, subdiv=0, pivot=[11.0, 0, 0], rotation=[0, 10, -18])
loft("thumb", "forearm", [((0, 0, 0), [1.3, 1.2]), ((0, 0.6, 1.0), [1.0, 0.9]), ((0, 0.4, 2.0), 0.0)], "talon", sides=3,
     rnd=2.0, subdiv=0, caps=[False, False], pivot=[15.0, 0.4, 0.6])
WO, DO, WRIST = 34.0, 22.0, 15.0
FING = [(0.44, 0.98), (0.72, 0.72), (1.0, 0.15)]
for k, (x1, d1) in enumerate(FING):
    dx, dz = x1 * WO - WRIST, d1 * DO
    L = math.hypot(dx, dz)
    ang = math.degrees(math.atan2(dz, dx))
    loft(f"finger{k}", "forearm", [((0, 0, 0), 1.2), ((L * 0.5, 0.2, 0), 0.9), ((L, 0, 0), 0.3)], "storm", sides=4,
         rnd=2.2, subdiv=0, caps=[False, False], pivot=[WRIST, 0.3, 0], rotation=[0, ang, 0])
outer = membrane_art(int(WO * DENSITY), int(DO * DENSITY), [(0.0, 0.86), (0.44, 0.98), (0.72, 0.72), (1.0, 0.15)],
                     [(WRIST / WO, x1, d1) for x1, d1 in FING], veins=9)
part("membrane_out", parent="forearm", shape="card", plane="xz", size=[WO, DO], pivot=[0, 0, 0],
     offset=[WO / 2, 0, -DO / 2], art=outer, style="membrane", flip_on_mirror=True)
inner = membrane_art(int(13 * DENSITY), int(DO * DENSITY), [(0.0, 0.95), (1.0, 0.86)], [(0.99, 0.99, 0.86)], veins=3)
part("membrane_in", parent="humerus", shape="card", plane="xz", size=[13, DO], pivot=[0, 0, 0], offset=[4.5, 0, -DO / 2],
     art=inner, style="membrane", flip_on_mirror=True)

# ------------------------------------------------------------------ storm crystals (hard hex prisms) + tail blade
def crystal(id, parent, t, around, length, width, rot, offset=-0.6):
    loft(id, parent, [((0, 0, 0), width), ((0, length * 0.72, 0), width * 1.08), ((0, length, 0), 0.0)], "crystal",
         sides=6, rnd=2.0, subdiv=0, caps=[False, False], hard=True,
         attach={"t": t, "around": around, "align": "surface", "offset": offset}, rotation=list(rot))


for k, (t, a, L, w, r) in enumerate([(0.07, 0.0, 9.0, 2.8, (-12, 0, 4)), (0.05, 0.08, 6.5, 2.2, (-30, 0, -22)),
                                     (0.1, 0.93, 6.0, 2.0, (-6, 0, 24)), (0.13, 0.05, 5.0, 1.8, (18, 0, -26)),
                                     (0.03, 0.95, 4.6, 1.6, (-34, 0, 16)), (0.16, 0.97, 4.0, 1.5, (24, 0, 12))]):
    crystal(f"cry{k}", "body", t, a, L, w, r)
for k, (t, a, L, w, r) in enumerate([(0.55, 0.0, 3.4, 1.7, (24, 0, 0)), (0.68, 0.04, 3.0, 1.5, (30, 0, -10)),
                                     (0.8, 0.97, 2.6, 1.4, (34, 0, 10))]):
    crystal(f"tail_cry{k}", "body", t, a, L, w, r, offset=-0.3)
blade = bolt_art(24, 56, branches=2)
part("tail_blade", parent="body", shape="card", plane="yz", size=[6, 14], attach={"t": 1.0, "around": 0.0, "align": "tangent"},
     offset=[0, 6.0, -1.5], rotation=[-30, 0, 0], art=blade, style="blade")

# ------------------------------------------------------------------ VFX: lightning bolts (crossed cards) + sparks
BOLTS = []


def bolt(name, parent, size, pivot=None, attach=None, rot=(0, 0, 0)):
    w, h = size
    for k, plane in enumerate(("xy", "yz")):
        d = dict(parent=parent, shape="card", plane=plane, size=[w, h], offset=[0, h / 2, 0], rotation=list(rot),
                 art=bolt_art(max(6, int(w * DENSITY * 2)), int(h * DENSITY * 2), branches=int(RNG.integers(1, 3))),
                 style="arc")
        if attach:
            d["attach"] = attach
        else:
            d["pivot"] = list(pivot)
        part(f"{name}_{k}", **d)
        BOLTS.append(f"{name}_{k}")


bolt("arc_cry0", "body", [3, 10], attach={"t": 0.07, "around": 0.02, "align": "surface", "offset": 0.5}, rot=(0, 0, -10))
bolt("arc_cry1", "body", [2.6, 8], attach={"t": 0.12, "around": 0.95, "align": "surface", "offset": 0.5}, rot=(10, 0, 18))
bolt("arc_horn", "horn", [2.2, 6], pivot=[1.0, 3.0, -9.0], rot=(-40, 0, 0))
bolt("arc_jaw", "jaw", [2.0, 5], pivot=[2.2, 0.4, 8.6], rot=(0, 0, 160))
bolt("arc_wing", "forearm", [2.2, 6], pivot=[25, 0.5, -13], rot=(0, 0, -30))
bolt("arc_tail", "body", [2.6, 7], attach={"t": 0.75, "around": 0.0, "align": "surface", "offset": 0.4}, rot=(30, 0, 0))
SPARKS = []
for k, (par, at) in enumerate([("body", {"t": 0.05, "around": 0.1, "align": "surface", "offset": 6}),
                               ("body", {"t": 0.12, "around": 0.9, "align": "surface", "offset": 8}),
                               ("body", {"t": 0.09, "around": 0.0, "align": "surface", "offset": 11}),
                               ("head", {"t": 0.3, "around": 0.2, "align": "surface", "offset": 2.5}),
                               ("body", {"t": 0.7, "around": 0.1, "align": "surface", "offset": 3})]):
    part(f"spark{k}", parent=par, shape="box", size=[0.8, 0.8, 0.8], attach=at, rotation=[45, 45, 0], style="spark")
    SPARKS.append(f"spark{k}")
for k, pos in enumerate([(24, 1.5, -10), (31, 1.2, -4)]):
    part(f"wspark{k}", parent="forearm", shape="box", size=[0.8, 0.8, 0.8], pivot=list(pos), rotation=[45, 45, 0],
         style="spark")
    SPARKS.append(f"wspark{k}")


def flicker(name, length, rate=7.0, on=0.55, rng=RNG):
    keys, t = [], 0.0
    while t < length - 0.02:
        vis = rng.random() < on
        s = rng.uniform(-0.25, 0.25) if vis else -0.999
        keys.append([round(t, 3), [round(s, 3)] * 3 if vis else [-0.999, -0.999, -0.999], "step"])
        t += rng.uniform(0.6, 1.4) / rate
    keys[0] = [0.0, [0, 0, 0]]
    return {"part": name, "channel": "scale", "keys": keys}


def spark_track(name, length, rng=RNG):
    keys = [[0.0, [0, 0, 0]]]
    t = 0.0
    while t < length - 0.1:
        t += rng.uniform(0.12, 0.3)
        keys.append([round(min(t, length - 0.05), 3), [round(float(v), 2) for v in rng.uniform(-1.6, 1.6, 3)], "out"])
    return {"part": name, "channel": "position", "keys": keys}


def vfx(length, rate=7.0):
    return [flicker(b, length, rate) for b in BOLTS] + [spark_track(s, length) for s in SPARKS] + \
           [flicker(s, length, rate * 1.3, 0.7) for s in SPARKS]


HEADCHAIN = NECK + ["head"]
anim = {
    "idle": {"length": 3.0, "loop": True, "tracks": [
        {"part": "body_0", "channel": "scale", "osc": {"amp": [0.03, 0.0, 0.0], "cycles": 1}},
        {"parts": HEADCHAIN, "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.14}},
        {"parts": HEADCHAIN, "wave": {"axis": "x", "amp": 2.2, "cycles": 2, "lag": 0.1}},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [1.6, 0], [1.75, 9, "out"], [2.1, 3], [2.5, 0]]},
        {"part": "wing_root", "axis": "z", "osc": {"amp": 5, "cycles": 1}},
        {"part": "forearm", "axis": "z", "osc": {"amp": 4, "cycles": 1, "phase": 0.15}},
        {"parts": TAIL, "wave": {"axis": "y", "amp": 7, "cycles": 1, "lag": 0.1, "growth": 1.15}},
        {"parts": TAIL, "wave": {"axis": "x", "amp": 2.5, "cycles": 2, "lag": 0.1}},
    ] + vfx(3.0)},
    "fly": {"length": 1.2, "loop": True, "tracks": [
        {"part": "body", "channel": "position", "osc": {"amp": [0, 1.4, 0], "cycles": 1, "phase": 0.25, "bias": [0, 11, 0]}},
        {"part": "body", "axis": "x", "osc": {"amp": 3, "cycles": 1, "phase": 0.3}},
        {"part": "wing_root", "axis": "z", "osc": {"amp": 40, "cycles": 1, "bias": -8}},
        {"part": "humerus", "axis": "y", "osc": {"amp": 8, "cycles": 1, "phase": 0.2}},
        {"part": "forearm", "axis": "z", "osc": {"amp": 22, "cycles": 1, "phase": 0.12}},
        {"part": "leg_0", "axis": "x", "keys": [[0, -40]]},
        {"part": "leg_1", "axis": "x", "keys": [[0, 30]]},
        {"parts": HEADCHAIN, "wave": {"axis": "x", "amp": 4, "cycles": 1, "lag": 0.12, "phase": 0.4}},
        {"parts": TAIL, "wave": {"axis": "x", "amp": 6, "cycles": 1, "lag": 0.1, "growth": 1.2, "phase": 0.5}},
        {"parts": TAIL, "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.12}},
    ] + vfx(1.2, 9.0)},
    "breath": {"length": 3.2, "loop": True, "tracks": [
        {"part": "neck_0", "axis": "x", "keys": [[0, 0], [0.7, -14, "in"], [1.0, 12, "out_back"], [2.3, 10], [2.9, 0, "smooth"]]},
        {"part": "neck_1", "axis": "x", "keys": [[0, 0], [0.7, -10, "in"], [1.0, 9, "out_back"], [2.3, 7], [2.9, 0, "smooth"]]},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.7, -12, "in"], [1.0, 4, "out_back"], [2.3, 4], [2.9, 0, "smooth"]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.7, 4], [1.0, 26, "out_back"], [2.3, 24], [2.6, 0, "smooth"]]},
        {"part": "beam", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.95, [0, 0, 0], "step"], [1.12, [0.4, 0.4, 36], "out"],
                                                      [1.4, [0.1, 0.1, 40]], [1.6, [0.5, 0.5, 38]], [1.8, [0.0, 0.0, 42]],
                                                      [2.0, [0.4, 0.4, 39]], [2.2, [0.1, 0.1, 41]], [2.4, [-0.6, -0.6, 2], "in"],
                                                      [2.5, [0, 0, 0]]]},
        {"part": "wing_root", "axis": "z", "keys": [[0, 0], [0.7, 24, "in"], [1.0, -8, "out_back"], [2.3, -6], [2.9, 0, "smooth"]]},
        {"part": "body", "channel": "position", "keys": [[0, [0, 0, 0]], [0.7, [0, 0.6, -1.2], "in"], [1.0, [0, 0.3, 0.8], "out"],
                                                        [2.3, [0, 0.3, 0.6]], [2.9, [0, 0, 0], "smooth"]]},
        {"parts": TAIL, "axis": "x", "keys": [[0, 0], [0.7, -5], [1.0, 7, "out_back"], [2.3, 5], [2.9, 0, "smooth"]]},
        {"parts": TAIL, "wave": {"axis": "y", "amp": 5, "cycles": 4, "lag": 0.08}},
    ] + vfx(3.2, 12.0)},
}

ramps = {
    "gold": ["#1c0f2c", "#3a1a40", "#6a2e3e", "#a4522c", "#d8861c", "#f2b51e", "#ffdc4a", "#fff3a0"],
    "storm": ["#08071a", "#121230", "#1d2046", "#2a305e", "#3c4678", "#566494"],
    "belly": ["#2c1a1a", "#5a3626", "#8e5e34", "#c49048", "#e8c26c", "#fae6a6"],
    "membrane": ["#0e0a20", "#1c1438", "#2c2052", "#3e2e6c", "#544086", "#6e58a2", "#9078c0"],
    "bone": ["#24180e", "#4e3a26", "#82684a", "#b49c74", "#ddd0a8", "#fff8e0"],
    "volt": ["#4a2a00", "#9a6200", "#e6a000", "#ffcc1a", "#ffe45a", "#fff4a8", "#ffffff"],
    "arc": ["#062448", "#0c4a8a", "#1a86d0", "#4ac4ff", "#9ae8ff", "#d8f8ff", "#ffffff"],
    "mouth": ["#12040c", "#2a0816", "#4a1024", "#701c34"],
}
glow = {"light": 0, "rim": {"light": 0, "dark": 0}}
styles = {
    # the genre: one strong base ramp, a bold bevelled pattern with dark edges, a pale belly, sparse glints
    "scales": {"ramp": "gold", "tone": 4.6, "dither": 0.0, "layers": [
        {"id": "mottle", "op": "noise", "scale": 2.2, "amount": 0.4},
        {"id": "belly", "op": "fill", "ramp": "belly", "tone": 3.6, "faces": ["bottom"]},
        {"id": "sheen", "op": "patches", "scale": 1.1, "threshold": 0.7, "shift": 1.4, "min_light": 0.7, "post": True}]},
    "bands": {"layers": [
        {"id": "chevrons", "op": "stripes", "axis": "path", "period": 5.0, "width": 0.3, "zigzag": [2.2, 0.25],
         "ramp": "storm", "tone": 2.6, "faces": ["-bottom"],
         "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -2.0, "highlight_shift": 1.5}},
        {"id": "veins", "op": "stripes", "axis": "path", "period": 5.0, "width": 0.06, "phase": 0.75, "zigzag": [2.2, 0.25],
         "ramp": "volt", "tone": 4.2, "faces": ["-bottom"]}]},
    "head": {"ramp": "gold", "tone": 4.8, "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.6, "amount": 0.35},
        {"id": "chin", "op": "fill", "ramp": "belly", "tone": 3.8, "faces": ["bottom"]},
        {"id": "sheen", "op": "patches", "scale": 1.0, "threshold": 0.7, "shift": 1.4, "min_light": 0.7, "post": True}]},
    "head_bands": {"layers": [
        {"id": "chevrons", "op": "stripes", "axis": "path", "period": 4.0, "width": 0.28, "zigzag": [1.6, 0.25],
         "phase": 1.2, "ramp": "storm", "tone": 2.6, "faces": ["-bottom"], "range": [0.0, 0.62],
         "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -2.0, "highlight_shift": 1.5}}]},
    "head_under": {"ramp": "gold", "tone": 4.0, "layers": [{"id": "chin", "op": "fill", "ramp": "belly", "tone": 3.6,
                                                            "faces": ["bottom"]}]},
    "storm": {"ramp": "storm", "tone": 3.2, "layers": [{"id": "mottle", "op": "noise", "scale": 1.6, "amount": 0.35},
                                                     {"id": "glint", "op": "gloss", "density": 0.04, "post": True}]},
    "horn": {"ramp": "storm", "tone": 2.8, "layers": [
        {"id": "rings", "op": "stripes", "axis": "path", "period": 1.6, "width": 0.3, "shift": -0.9},
        {"id": "tip", "op": "band", "axis": "path", "from": 0.72, "to": 1.0, "ramp": "volt", "tone": 4.0}]},
    "fin": {"ramp": "storm", "tone": 3.0, "layers": [{"id": "tip", "op": "band", "axis": "path", "from": 0.55, "to": 1.0,
                                                     "ramp": "volt", "tone": 4.0}]},
    "eye": dict(glow, ramp="arc", tone=5.0, layers=[{"id": "slit", "op": "rect", "rect": [0.44, 0.08, 0.6, 0.92],
                                                     "ramp": "storm", "tone": 0, "faces": ["end"]}]),
    "teeth": {"ramp": "bone", "tone": 4.0, "light": 0.3, "rim": {"light": 0, "dark": 0},
              "art_key": {"w": "bone:5", "t": "bone:3"}},
    "talon": {"ramp": "bone", "tone": 3.0, "layers": [{"id": "tip", "op": "gradient", "axis": "path", "amount": 1.4}]},
    "mouth": dict(glow, ramp="mouth", tone=2.0, art_key={"m": "mouth:1", "g": "volt:4"}),
    "membrane": {"ramp": "membrane", "tone": 3.6, "light": 0.7, "dither": 0.0,
                 "art_key": {"f": "storm:1", "v": "volt:5", "e": "membrane:6"},
                 "layers": [{"id": "folds", "op": "stripes", "axis": "x", "period": 2.2, "width": 0.3, "shift": -0.7,
                             "wobble": 0.6},
                            {"id": "mottle", "op": "noise", "scale": 1.6, "amount": 0.4}]},
    "crystal": {"ramp": "arc", "tone": 3.0, "light": 0.6, "rim": {"light_shift": 2.0, "dark_shift": -1.0}, "layers": [
        {"id": "glow_up", "op": "gradient", "axis": "path", "amount": 2.4},
        {"id": "facet", "op": "stripes", "axis": "around", "period": 0.34, "width": 0.3, "shift": 1.2},
        {"id": "glint", "op": "gloss", "density": 0.08, "post": True}]},
    "arc": dict(glow, ramp="arc", tone=3.0, art_key={"x": "arc:6", "o": "arc:3"}),
    "blade": dict(glow, ramp="volt", tone=3.0, art_key={"x": "volt:6", "o": "volt:3"}),
    "spark": dict(glow, ramp="arc", tone=4.5),
    "beam": dict(glow, ramp="arc", tone=5.0, layers=[{"id": "core", "op": "stripes", "axis": "x", "period": 3.0,
                                                       "width": 0.34, "tone": 6.0, "phase": 1.0}]),
}

spec = {
    "name": "Voltwing Wyvern",
    "description": "Original electric wyvern in the low-poly pixel-art genre: faceted lofted forms, chunky hand-painted "
                   "pixels, gold scales with bevelled storm-indigo lightning chevrons and glowing volt seams, electric-vein "
                   "membrane wings, cyan storm crystals and a lightning-blade tail. VFX: flickering crossed-card bolts, "
                   "sparks, a thunder-breath beam, bloom in previews.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 2600, "colors": 64},
    "light": {"dir": [-0.55, 1.0, 0.65], "strength": 1.2, "gradient": 0.45, "ao": 0.9, "ao_height": 8.0},
    "render": {"background": "#141022", "hero": [-36, 18], "shadow": 0.5,
               "bloom": {"ramps": ["arc", "volt"], "min_step": 3, "radius": 1.6, "strength": 0.95}},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
    "anim_ground_tolerance": 0.3,
}
if __name__ == "__main__":
    with open(sys.argv[1] if len(sys.argv) > 1 else "examples/voltwing_wyvern.json", "w") as fh:
        json.dump(spec, fh, indent=1)
    print(len(P), "parts")
