"""Builds examples/mosquito.json (+ examples/variants/mosquito_blood.json, mosquito_amber.json): the Winterworks
Amber Age mosquito.

    python examples/src/mosquito.py examples/mosquito.json

A small, mean, very cool prehistoric mosquito (about 8 x 6 x 11 Minecraft pixels without legs and needle): a humped
bronze-black thorax with a silver lyre, a big head that is mostly two blood-red compound eyes, feathery antennae,
a long giant needle (a sheath plus a glinting stylet that slides out when it stabs), a long striped abdomen in three
segments, four glassy iridescent wings in two pairs (alpha-cut cards) and six long, banded, jointed legs: standing
on four, the hind pair raised over the back like a tiger mosquito.

Units are Minecraft pixels (16 per block), density 2 (a small mob seen up close): every box is a whole number of
texels, so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). Wings, antennae, palps and
the abdomen's tail are cards. Faces +Z, ground at y=0, "right" is -X.

Contract (mods/winterworks/docs/AMBER_UPDATE.md section 6): bones body, head, needle, abdomen, wing_l1, wing_r1,
wing_l2, wing_r2, leg_l1..3 / leg_r1..3 (front, middle, hind). Extra joints: shin_*/foot_* (the lower leg segments),
abdomen_1, abdomen_2 (the abdomen curls), stylet (slides out of the needle), wing_*_m (the wing membranes), eye_l/r.
Clips: fly, idle, stab, drink, spit.

Swelling is in the texture: every abdomen segment has a bigger `swell_*` shell around it. The empty `mosquito`
texture leaves the shells fully transparent (the slim striped abdomen shows); `mosquito_blood` and `mosquito_amber`
paint them as a swollen, glossy dark-red or gold belly, the dark back plates pushed apart by the stretched membrane.
The blood belly also goes into mosquito_blood_glow.png (dark reds: a faint glow with RenderType.eyes).
"""
import copy
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DENSITY = 2

P = []
FRAMES = {}     # part id -> (world rotation, world pivot)


def _rot(deg):
    rx, ry, rz = (math.radians(float(a)) for a in deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _euler(R):
    """Inverse of _rot: degrees (x, y, z) with R = Rz Ry Rx."""
    ry = math.asin(max(-1.0, min(1.0, -R[2, 0])))
    rx = math.atan2(R[2, 1], R[2, 2])
    rz = math.atan2(R[1, 0], R[0, 0])
    return [round(math.degrees(a), 3) for a in (rx, ry, rz)]


def part(id, parent, size, style=None, at=None, rel=None, centre=None, offset=None, rot=None, wrot=None,
         shape="box", **kw):
    """Add a part. The joint goes at `at` (world) or `rel` (in the parent's rotated frame); the box centre at
    `centre` (world) or `offset` (in the part's own rotated frame; default: on the joint). `rot` is local, `wrot` a
    world rotation (converted to local)."""
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
        assert all(abs(s * DENSITY - round(s * DENSITY)) < 1e-9 for s in size), f"{id}: size {size} not whole texels"
        d["size"] = [float(s) if s != int(s) else int(s) for s in size]
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


def bone(id, parent, **kw):
    return part(id, parent, None, "chitin", shape="bone", **kw)


def card(id, parent, art, style, plane="yz", **kw):
    return part(id, parent, None, style, shape="card", plane=plane, art=art, **kw)


def wpos(id, local):
    R, t = FRAMES[id]
    return t + R @ np.array(local, float)


def aim_mat(d):
    """World rotation matrix whose local -Y points along d; local X is kept as level and as close to +X as possible,
    so on every leg joint +x rotation pitches like the body (points above the joint swing forward)."""
    d = np.array(d, float)
    y = -d / np.linalg.norm(d)
    ref = np.array([0.0, 0.0, 1.0]) if abs(y[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    x = np.cross(y, ref)
    x /= np.linalg.norm(x)
    if x[0] < 0:
        x = -x
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1)


def aim(d):
    return _euler(aim_mat(d))


def limb(id, parent, start, end, thick, style, **kw):
    """A thin box from `start` towards `end` (world), its length rounded to whole texels. Returns the real end."""
    start, end = np.array(start, float), np.array(end, float)
    d = end - start
    L = max(1.0 / DENSITY, round(float(np.linalg.norm(d)) * DENSITY) / DENSITY)
    part(id, parent, [thick, L, thick], style, at=start, wrot=aim(d), offset=(0, -L / 2 + thick / 4, 0), **kw)
    LEG_LEN[id] = L
    return start + d / np.linalg.norm(d) * L


LEG_LEN, LEG_TIPS = {}, {}


def M(v, s):
    return (v[0] * s, v[1], v[2])


# ======================================================================= card art
# wings: drawn for the LEFT side lying flat (plane xz: image top = -Z = the wing tip, bottom row = the root at the
# body); the right column is the outer, leading edge (the dark costa vein). Right wings use the mirrored rows.
# C costa, v vein, w white scale dot on a vein, m/n/h membrane (light/mid/highlight), i/t/g iridescent sheen
# (violet/teal/gold), f the fringe of dark scales on the trailing edge.
WING_FRONT = [
    "...fnh..",
    "..fnmhC.",
    ".fnmmhwC",
    ".fnimvhC",
    "fnimmvmC",
    "fnimtvhC",
    "fvmmtvmC",
    "fnvmmvhC",
    "fnvgmvmC",
    "fnvmmwhC",
    ".fnvmvmC",
    ".fnvmvhC",
    ".fnimvC.",
    "..fnvmC.",
    "..fnvhC.",
    "...nvC..",
    "...vC...",
]
WING_HIND = [
    "..fnh.",
    ".fnmhC",
    "fnimvC",
    "fnitvC",
    "fnmmwC",
    "fvmgvC",
    "fnvmhC",
    ".fnvmC",
    ".fnvC.",
    "..nvC.",
    "..vC..",
]
# plumose antenna (plane yz: left column = front): a dark shaft with whorls of pale hair
ANTENNA = [
    "..H..",
    ".hsh.",
    "H.s.H",
    ".hsh.",
    "h.s.h",
    ".hsh.",
    "h.s.h",
    "..s..",
    "..s..",
    "..d..",
]
PALP = ["ws...", ".sws.", "..sdw"]     # maxillary palps: dark with white tips, alongside the needle
TAIL = ["s.s", ".s."]                # cerci at the abdomen tip
TIP = ["gGG", "g.."]                 # the stylet's glinting point (plane yz)


def mirror_art(art):
    return [row[::-1] for row in art]


# ======================================================================= thorax (body), head, needle
# the root joint sits in the thorax; ground is under the four standing feet
part("body", None, [3, 3, 3.5], "thorax", at=(0, 4.5, 0), centre=(0, 4.5, 0.25))
part("scutum", "body", [2.5, 1, 3], "scutum", centre=(0, 6.15, 0.45), rot=(-12, 0, 0))
part("scutellum", "body", [2, 1, 1], "chitin", centre=(0, 5.85, -1.3), rot=(10, 0, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"pleuron_{n}", "body", [0.5, 2, 2.5], "pleuron", centre=(s * 1.6, 4.0, 0.4), rot=(0, 0, s * -6))

# head: a narrow face between two huge compound eyes, tipped down
part("head", "body", [2, 2.5, 2], "head", at=(0, 4.9, 1.9), centre=(0, 4.45, 2.85), wrot=(22, 0, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"eye_{n}", "head", [1.5, 3, 2.5], "eye", rel=(s * 1.65, -0.35, 0.95), rot=(0, s * 10, 0))
    card(f"antenna_{n}", "head", ANTENNA, "antenna", rel=(s * 0.55, 0.75, 1.6), offset=(0, 2.5, 0),
         rot=(34, s * 10, s * -22))
    card(f"palp_{n}", "head", PALP, "palp", rel=(s * 0.6, -1.15, 1.6), offset=(0, -0.4, 1.0), rot=(30, s * 4, 0))
# the needle: a sheath from the mouth, the stylet slides out of it; long, aimed down and forward
part("needle", "head", [1, 1, 2.5], "sheath", rel=(0, -1.0, 1.7), offset=(0, 0, 1.25), wrot=(24, 0, 0))
part("stylet", "needle", [0.5, 0.5, 4], "stylet", rel=(0, 0, 2.2), offset=(0, 0, 2.0), rot=(-3, 0, 0))
card("stylet_tip", "stylet", TIP, "stylet_tip", rel=(0, 0, 4.0), offset=(0, -0.25, 0.75), plane="yz")

# ======================================================================= abdomen: three segments that curl, swell shells
part("abdomen", "body", [2, 1.5, 2.5], "abd", at=(0, 4.3, -1.45), offset=(0, 0, -1.25), wrot=(-12, 0, 0))
part("abdomen_1", "abdomen", [2, 1.5, 2.5], "abd", rel=(0, 0, -2.3), offset=(0, 0, -1.25), rot=(-6, 0, 0))
part("abdomen_2", "abdomen_1", [1.5, 1, 2.5], "abd_tip", rel=(0, 0, -2.3), offset=(0, 0, -1.25), rot=(-8, 0, 0))
card("cerci", "abdomen_2", TAIL, "abd_tail", rel=(0, 0.1, -2.55), offset=(0, 0, -0.25), plane="xz")
# swollen shells (transparent in the empty texture)
part("swell_0", "abdomen", [3.5, 3, 2.5], "swell", rel=(0, -0.45, -1.25), rot=(-3, 0, 0))
part("swell_1", "abdomen_1", [4, 3.5, 3], "swell", rel=(0, -0.7, -1.3))
part("swell_2", "abdomen_2", [3, 2.5, 2.5], "swell", rel=(0, -0.4, -1.1), rot=(6, 0, 0))

# ======================================================================= wings: two pairs, flapped by their root bones
WINGS = {  # name: (root, art, yaw out, dihedral, membrane centre offset)
    "1": ((0.85, 6.0, 0.7), WING_FRONT, 38, 16, (0.25, 0, -4.1)),
    "2": ((0.75, 5.75, -0.6), WING_HIND, 58, 10, (0.0, 0, -2.6)),
}
for k, (root, art, yaw, dih, off) in WINGS.items():
    for s in (1, -1):
        n = "l" if s > 0 else "r"
        bone(f"wing_{n}{k}", "body", at=M(root, s))
        card(f"wing_{n}{k}_m", f"wing_{n}{k}", art if s > 0 else mirror_art(art), "wing", plane="xz",
             offset=M(off, s), rot=(0, -s * yaw, s * dih))

# ======================================================================= legs: femur (leg_*), tibia (shin_*), tarsus (foot_*)
LEGS = {  # name: (hip, knee, ankle, foot): left side, world, rest pose
    "1": ((0.8, 3.4, 1.3), (2.4, 5.6, 3.0), (3.7, 1.7, 4.6), (4.6, 0.0, 7.6)),      # front: reaching forward
    "2": ((1.1, 3.3, 0.3), (3.3, 5.7, 0.6), (5.0, 1.6, 0.9), (6.9, 0.0, 0.3)),      # middle: sprawled out
    "3": ((0.9, 3.4, -0.8), (2.5, 5.7, -1.9), (3.4, 4.4, -5.0), (3.7, 6.6, -7.2)),  # hind: raised over the back
}
for k, (hip, knee, ankle, foot) in LEGS.items():
    for s in (1, -1):
        n = "l" if s > 0 else "r"
        e = limb(f"leg_{n}{k}", "body", M(hip, s), M(knee, s), 0.5, "femur")
        part(f"knee_{n}{k}", f"leg_{n}{k}", [1, 1, 1], "knee", at=e)
        e2 = limb(f"shin_{n}{k}", f"leg_{n}{k}", e, M(ankle, s), 0.5, "tibia")
        limb(f"foot_{n}{k}", f"shin_{n}{k}", e2, e2 + (np.array(M(foot, s)) - np.array(M(ankle, s))), 0.5, "tarsus")

# ======================================================================= palette and paint
ramps = {
    # bronze-black chitin: violet-black shadows, warm bronze lights
    "chitin": ["#0c0912", "#151019", "#201721", "#2c1f29", "#3a2830", "#4b3437", "#5f423e", "#765446", "#8f6a50",
               "#a98460"],
    # silver-white scale bands (tiger mosquito)
    "scale": ["#2a2c3e", "#474b60", "#6c7286", "#979eac", "#c3c8cc", "#e7e8e0", "#fffdf1"],
    # blood-red compound eyes
    "eye": ["#19050f", "#330819", "#520e22", "#78142a", "#a11d2d", "#c93633", "#e86244", "#ff9a64", "#ffd9ad"],
    # glassy wing membrane, iridescent sheen
    "wing": ["#1b2439", "#2f4059", "#4f6a85", "#7895ad", "#a3c1d1", "#cde6ec", "#f1fffb"],
    "iris": ["#35296d", "#5844a3", "#3a86b0", "#56c0b4", "#c6d77a"],
    # swollen belly: blood (glows faintly in the blood texture) or amber
    "blood": ["#130309", "#260511", "#3f0819", "#5c0c1f", "#7c1226", "#9f1b2b", "#c22d30", "#e0503c", "#ff8660"],
    "amber": ["#2a0f04", "#481c06", "#6c2d08", "#91430b", "#b65d0f", "#d47c17", "#ea9c24", "#f7bf3e", "#ffe079",
              "#fff5c2"],
    "bloodcore": ["#2e0410", "#4a0718", "#680c22", "#86132b", "#a31c31"],
    "ambercore": ["#4a1c05", "#6e2c07", "#93420a", "#b05a0e", "#c9701a"],
}
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.6, "gradient": 0.5, "ao": 0.6, "ao_height": 3.0}
brush = {"flow": "long", "length": 1.4, "width": 0.5, "rough": 0.5, "overshoot": 0.25,
         "textures": {"chitin": "scales", "eye": "crystal", "blood": "liquid", "amber": "liquid"}}

GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.6,
         "shift": 2.0}
INVISIBLE = [{"faces": ["all"], "at": "top-left", "art": ["_" * 12] * 12}]
SCALE_KEY = {"w": "scale:5", "W": "scale:6", "s": "chitin:3", "d": "chitin:1", "h": "scale:4"}


def swell_style(kind):
    """A swollen belly: stretched glossy membrane with a dark liquid core and bright edges (reads as translucent),
    the dark back plates pushed apart into narrow bands. The core has its own ramp (`<kind>core`): in the blood
    texture exactly those texels go to the glow layer, a faint dark-red glow from inside."""
    if kind == "empty":
        return {"ramp": "chitin", "tone": 3, "light": 0, "brush": {"off": True}, "stamps": INVISIBLE}
    r, core = kind, kind + "core"
    return {"ramp": r, "tone": 5.4 if kind == "amber" else 5.0, "light": 0.8,
            "brush": {"flow": "z", "length": 1.0, "rough": 0.4},
            "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.4},
            "layers": [
                {"id": "belly", "op": "gradient", "axis": "y", "amount": -0.6},
                {"id": "core", "op": "band", "axis": "x", "from": -0.42, "to": 0.42, "ramp": core, "tone": 2.6,
                 "wobble": 0.12, "faces": ["front", "back", "bottom"]},
                {"id": "core_s", "op": "band", "axis": "z", "from": -0.4, "to": 0.4, "ramp": core, "tone": 2.4,
                 "wobble": 0.12, "faces": ["left", "right"], "where": {"y": [-0.7, 0.5]}},
                {"id": "core_s2", "op": "band", "axis": "y", "from": -0.75, "to": 0.45, "shift": 0.0,
                 "faces": ["left", "right"]},
                # the back plates (tergites), pushed apart into narrow dark bands with a lit lip
                {"id": "plates", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.34, "ramp": "chitin",
                 "tone": 3.4, "faces": ["top"],
                 "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.2, "highlight_shift": 1.6}},
                {"id": "plates_side", "op": "band", "axis": "y", "from": 0.72, "to": 1.01, "ramp": "chitin",
                 "tone": 2.8, "faces": ["left", "right", "front", "back"], "wobble": 0.12},
                {"id": "veins", "op": "cracks", "scale": 1.4, "width": 0.05, "shift": -1.2,
                 "faces": ["left", "right", "bottom"]},
                dict(GLOSS, length=3, density=0.9, shift=2.6),
            ]}


def styles_for(kind):
    st = {
        "chitin": {"ramp": "chitin", "tone": 3.6, "rim": {"light_shift": 1.6, "dark_shift": -1.0},
                   "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.7}, GLOSS]},
        "thorax": {"ramp": "chitin", "tone": 3.8, "rim": {"light_shift": 1.6, "dark_shift": -1.0},
                   "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.7},
                              {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.9},
                              {"id": "pale_spots", "op": "spots", "count": 4, "radius": [0.35, 0.55], "ramp": "scale",
                               "tone": 4.4, "faces": ["left", "right"], "where": {"y": [-0.3, 0.6]}},
                              GLOSS]},
        # the humped back: bronze-black with the silver lyre of scales
        "scutum": {"ramp": "chitin", "tone": 4.6, "rim": {"light_shift": 2.0, "dark_shift": -1.2},
                   "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.7}, GLOSS],
                   "stamps": [{"face": "top", "at": "top-left", "art": ["w...", "w..w", ".ww.", "w..w", "W..W",
                                                                         ".WW."],
                               "key": SCALE_KEY},
                              {"face": "front", "at": "top-left", "art": ["W.hW", "...."], "key": SCALE_KEY},
                              {"face": "left", "at": "top-left", "art": [".....w"], "key": SCALE_KEY},
                              {"face": "right", "at": "top-left", "art": ["w....."], "key": SCALE_KEY}]},
        "pleuron": {"ramp": "chitin", "tone": 3.0, "brush": {"off": True},
                    "layers": [{"id": "scales", "op": "spots", "count": 3, "radius": [0.4, 0.6], "ramp": "scale",
                                "tone": 5.0, "faces": ["left", "right"]}]},
        "head": {"ramp": "chitin", "tone": 3.2, "rim": {"light_shift": 1.4, "dark_shift": -1.0},
                 "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.6}],
                 "stamps": [{"face": "top", "at": "top-left", "art": ["....", ".WW.", ".ww."], "key": SCALE_KEY},
                            {"face": "front", "at": "top-left", "art": [".WW.", "....", "....", ".ss."],
                             "key": SCALE_KEY}]},
        # compound eyes: deep red facets, darker towards the back, a hot catchlight upper front
        "eye": {"ramp": "eye", "tone": 4.2, "light": 0.8, "brush": {"off": True},
                "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4},
                "layers": [{"id": "facets", "op": "scales", "shape": "round", "along": "z", "size": [1.0, 1.0],
                            "gap": 0.5, "highlight": 1.2, "shadow": -1.4, "gradient": 0.2, "jitter": 0.4},
                           {"id": "back_dark", "op": "gradient", "axis": "z", "amount": 1.2}],
                "stamps": [{"face": "front", "at": "top-left", "art": [".hH", ".Hh", "..."],
                            "key": {"h": "eye:7", "H": "eye:8"}},
                           {"face": "left", "at": "top-left", "art": ["...h.", "..hH.", "...h."],
                            "key": {"h": "eye:7", "H": "eye:8"}},
                           {"face": "right", "at": "top-left", "art": [".h...", ".Hh..", ".h..."],
                            "key": {"h": "eye:7", "H": "eye:8"}}]},
        "antenna": {"ramp": "chitin", "tone": 3.0, "light": 0.4, "brush": {"off": True},
                    "art_key": {"s": "chitin:5", "d": "chitin:2", "h": "chitin:7", "H": "scale:3"}},
        "palp": {"ramp": "chitin", "tone": 3.0, "light": 0.4, "brush": {"off": True},
                 "art_key": {"s": "chitin:3", "d": "chitin:1", "w": "scale:5"}},
        "sheath": {"ramp": "chitin", "tone": 3.4, "rim": {"light_shift": 1.6, "dark_shift": -1.0},
                   "brush": {"flow": "z"},
                   "layers": [{"id": "rings", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.25,
                               "shift": -1.2},
                              {"id": "band", "op": "band", "axis": "z", "from": 0.25, "to": 0.7, "ramp": "scale",
                               "tone": 4.6}]},
        # the stylet: glossy dark red-black blade with a pale glint running to the point
        # the stylet: a black blade with a silver glint along its top, blood-red at the point
        "stylet": {"ramp": "chitin", "tone": 2.2, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.0},
                   "brush": {"off": True},
                   "layers": [{"id": "glint", "op": "band", "axis": "z", "from": -0.6, "to": 0.55, "ramp": "scale",
                               "tone": 3.6, "faces": ["top"]},
                              {"id": "point", "op": "band", "axis": "z", "from": 0.55, "to": 1.01, "ramp": "eye",
                               "tone": 4.4, "faces": ["top", "left", "right", "bottom"]}]},
        "stylet_tip": {"ramp": "eye", "tone": 5, "light": 0, "brush": {"off": True},
                       "art_key": {"g": "eye:5", "G": "eye:7"}},
        # abdomen: bronze-black segments, each with a silver band at its base and pale side spots
        "abd": {"ramp": "chitin", "tone": 3.4, "rim": {"light_shift": 1.6, "dark_shift": -1.0}, "brush": {"flow": "z"},
                "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.6},
                           {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.8},
                           {"id": "bands", "op": "stripes", "axis": "z", "period": 1.25, "width": 0.4, "ramp": "scale",
                            "tone": 4.6, "faces": ["top", "left", "right", "bottom"],
                            "bevel": {"shadow": 1, "highlight": 0, "shadow_shift": -1.0, "shadow_ramp": "chitin"}},
                           GLOSS]},
        "abd_tip": {"ramp": "chitin", "tone": 3.0, "brush": {"flow": "z"},
                    "layers": [{"id": "bands", "op": "stripes", "axis": "z", "period": 1.25, "width": 0.4,
                                "ramp": "scale", "tone": 4.4, "faces": ["top", "left", "right"]}]},
        "abd_tail": {"ramp": "chitin", "tone": 3.0, "light": 0.3, "brush": {"off": True},
                     "art_key": {"s": "chitin:4"}},
        "swell": swell_style(kind),
        "wing": {"ramp": "wing", "tone": 4, "light": 0, "brush": {"off": True},
                 "art_key": {"C": "chitin:2", "v": "wing:1", "w": "scale:5", "m": "wing:4", "n": "wing:3",
                             "h": "wing:6", "i": "iris:1", "t": "iris:3", "g": "iris:4", "f": "chitin:3"}},
        # legs: bronze-black, the femur pale underneath, tibia and tarsus banded silver (tiger stripes)
        "femur": {"ramp": "chitin", "tone": 3.8, "brush": {"off": True}, "rim": {"light_shift": 1.4, "dark_shift": -1},
                  "layers": [{"id": "pale", "op": "band", "axis": "y", "from": -1.01, "to": -0.5, "ramp": "scale",
                              "tone": 4.2}]},
        "knee": {"ramp": "chitin", "tone": 2.0, "brush": {"off": True}, "rim": {"light_shift": 1.8, "dark_shift": -1}},
        "tibia": {"ramp": "chitin", "tone": 3.4, "brush": {"off": True},
                  "layers": [{"id": "bands", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.34,
                              "ramp": "scale", "tone": 3.6}]},
        "tarsus": {"ramp": "chitin", "tone": 3.0, "brush": {"off": True},
                   "layers": [{"id": "bands", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.5,
                               "ramp": "scale", "tone": 5.4}]},
    }
    return st


# ======================================================================= animation
WING_HZ = 20.0          # wing beats per second; the export samples at 2x this (fps 40) so every key is a stroke peak
FPS = 40
LEG_IDS = [f"{a}_{s}{k}" for s in "lr" for k in "123" for a in ("leg", "shin", "foot")]


def add(*poses):
    out = {}
    for p in poses:
        for k, chans in p.items():
            o = out.setdefault(k, {})
            for ch, v in chans.items():
                o[ch] = [a + b for a, b in zip(o.get(ch, [0, 0, 0]), v)]
    return out


def r(part_, x=0, y=0, z=0):
    return {part_: {"r": [x, y, z]}}


def pos(part_, x=0, y=0, z=0):
    return {part_: {"p": [x, y, z]}}


def sc(part_, x=0, y=0, z=0):
    return {part_: {"s": [x, y, z]}}


def both(base, x=0, y=0, z=0):
    """Rotate base_l* and base_r* together, mirrored (y and z flip on the right)."""
    out = {}
    for s, n in ((1, "l"), (-1, "r")):
        out[base.replace("*", n)] = {"r": [x, y * s, z * s]}
    return out


def legs(k, a=0, b=0, c=0, out=0):
    """Pose leg pair k: femur, tibia, tarsus x rotations (+x swings the far end back... in the limb frame), splay."""
    return add(both(f"leg_*{k}", a, 0, out), both(f"shin_*{k}", b), both(f"foot_*{k}", c))


def timeline(length, keys, loop=False, extra=()):
    names = sorted({k for _, p, _ in keys for k in p})
    tracks = []
    for n in names:
        for ch, cname in (("r", "rotation"), ("p", "position"), ("s", "scale")):
            vals = [p.get(n, {}).get(ch, [0, 0, 0]) for _, p, _ in keys]
            if all(abs(v) < 1e-9 for vec in vals for v in vec):
                continue
            ks = []
            for (t, _, ease), v in zip(keys, vals):
                k = [round(t, 4), [round(float(a), 3) for a in v]]
                if ease:
                    k.append(ease)
                ks.append(k)
            tracks.append({"part": n, "channel": cname, "keys": ks})
    return {"length": length, "loop": loop, "tracks": tracks + list(extra)}


def buzz(length, amp=38, sweep=12, hind_amp=None, bias=0.0):
    """Very fast wing beats: a flap (z) and a tilted stroke plane (y), the hind pair half a beat behind. Phase 0.25
    puts every exported key (fps = 2 x beat rate) on a stroke peak."""
    cyc = int(round(WING_HZ * length))
    hind_amp = amp * 0.85 if hind_amp is None else hind_amp
    tr = []
    for s, n in ((1, "l"), (-1, "r")):
        for k, a, ph in (("1", amp, 0.25), ("2", hind_amp, 0.75)):
            tr.append({"part": f"wing_{n}{k}", "osc": {"amp": [0, s * sweep * a / amp, s * a], "cycles": cyc,
                                                       "phase": ph, "bias": 0}})
            if bias:
                tr.append({"part": f"wing_{n}{k}", "axis": "z", "osc": {"amp": 0, "cycles": 1, "bias": s * bias}})
    return tr


def osc(part_, axis, amp, cycles, phase=0.0, bias=0.0, ch=None, shape=None):
    o = {"amp": amp, "cycles": cycles, "phase": phase}
    if bias:
        o["bias"] = bias
    if shape:
        o["shape"] = shape
    t = {"part": part_, "osc": o}
    if axis:
        t["axis"] = axis
    if ch:
        t["channel"] = ch
    return t


def jitter(part_, t0, t1, amp, step=0.025, axis=0, ch="rotation"):
    ks = [[0.0, [0, 0, 0]], [round(t0, 4), [0, 0, 0]]]
    t, sgn = t0 + step, 1
    while t < t1 - 1e-9:
        v = [0, 0, 0]
        v[axis] = sgn * amp
        ks.append([round(t, 4), v])
        t += step
        sgn = -sgn
    ks.append([round(t1, 4), [0, 0, 0]])
    return {"part": part_, "channel": ch, "keys": ks, "ease": "ease"}


def leg_pose(k, femur, tibia, tarsus):
    """Pose leg pair k by aiming its femur, tibia and tarsus along world directions (left side, body rest frame;
    lengths stay), the right side mirrored. Returns the pose; LEG_TIPS[k] gets the left foot tip (body frame)."""
    out = {}
    for s, n in ((1, "l"), (-1, "r")):
        ids = [f"leg_{n}{k}", f"shin_{n}{k}", f"foot_{n}{k}"]
        Wp, R0p = np.eye(3), np.eye(3)
        tip = FRAMES[ids[0]][1] - FRAMES["body"][1]
        for pid, d in zip(ids, (femur, tibia, tarsus)):
            R0 = FRAMES[pid][0]
            Rd = aim_mat(M(d, s))
            out[pid] = {"r": _euler((R0p.T @ R0).T @ Wp.T @ Rd)}
            Wp, R0p = Rd, R0
            tip = tip + Rd @ np.array([0, -LEG_LEN[pid], 0])
        if s > 0:
            LEG_TIPS[k] = tip
    return out


# hovering: knees out, the long lower legs hanging down and trailing back, the hind pair streaming behind
DANGLE = add(leg_pose(1, (0.7, -0.1, 0.6), (0.15, -0.65, -0.75), (0.0, -0.3, -0.95)),
             leg_pose(2, (0.9, -0.15, 0.0), (0.2, -0.6, -0.75), (0.05, -0.3, -0.95)),
             leg_pose(3, (0.6, 0.1, -0.75), (0.15, -0.35, -0.95), (0.0, -0.1, -1.0)),
             both("antenna_*", -6), r("needle", -4))
HOVER = add(DANGLE, pos("body", 0, 3.0, 0))
# fast flight: pitched nose down, legs folded back under the abdomen, antennae and needle streamlined
FLY = add(leg_pose(1, (0.6, -0.15, 0.2), (0.12, -0.35, -0.95), (0.0, -0.15, -1.0)),
          leg_pose(2, (0.8, -0.2, -0.3), (0.08, -0.3, -0.95), (0.0, -0.1, -1.0)),
          leg_pose(3, (0.55, 0.05, -0.8), (0.05, -0.15, -1.0), (-0.05, 0.1, -1.0)),
          r("body", 12), pos("body", 0, 2.4, 0), r("head", -10), r("needle", -14), r("abdomen", 6), r("abdomen_1", 4),
          both("antenna_*", 14))
ANIM = {}
L = 2.0
ANIM["idle"] = timeline(L, [(0.0, HOVER, None), (L, HOVER, None)], loop=True, extra=buzz(L) + [
    osc("body", None, [0, 0.45, 0], 2, 0.0, ch="position"),
    osc("body", "x", 3.0, 2, 0.12),
    osc("body", "z", 2.5, 1, 0.3),
    osc("body", "y", 4.0, 1, 0.55),
    {"part": "head", "axis": "y", "keys": [[0, 0], [0.45, 14], [0.9, 14], [1.3, -12], [1.7, -12], [2.0, 0]],
     "ease": "smooth"},
    osc("head", "x", -3, 2, 0.2),
    osc("needle", "x", 4, 2, 0.35),
    {"parts": ["abdomen", "abdomen_1", "abdomen_2"], "wave": {"axis": "x", "amp": 5, "cycles": 2, "lag": 0.12,
                                                              "growth": 1.2}},
    {"parts": ["abdomen", "abdomen_1", "abdomen_2"], "wave": {"axis": "y", "amp": 3, "cycles": 1, "lag": 0.1}},
    osc("antenna_l", "x", 10, 4, 0.1, shape="pulse"), osc("antenna_r", "x", 10, 4, 0.35, shape="pulse"),
    osc("antenna_l", "z", 4, 2, 0.0), osc("antenna_r", "z", -4, 2, 0.25),
] + [{"parts": [f"leg_{s}{k}", f"shin_{s}{k}", f"foot_{s}{k}"],
      "wave": {"axis": "x", "amp": 5, "cycles": 2, "lag": 0.12, "growth": 1.3,
               "phase": (0.17 * int(k) + (0.5 if s == "r" else 0))}} for s in "lr" for k in "123"])

L = 1.0
ANIM["fly"] = timeline(L, [(0.0, FLY, None), (L, FLY, None)], loop=True, extra=buzz(L, amp=44, sweep=16) + [
    osc("body", None, [0, 0.5, 0], 2, 0.0, ch="position"),
    osc("body", "x", 3.0, 2, 0.15),
    osc("body", "z", 5.0, 1, 0.0),
    osc("head", "z", -3, 1, 0.1),
    {"parts": ["abdomen", "abdomen_1", "abdomen_2"], "wave": {"axis": "x", "amp": 6, "cycles": 2, "lag": 0.14,
                                                              "growth": 1.25}},
    {"parts": ["abdomen", "abdomen_1", "abdomen_2"], "wave": {"axis": "y", "amp": -4, "cycles": 1, "lag": 0.12}},
    osc("antenna_l", "x", 6, 2, 0.1), osc("antenna_r", "x", 6, 2, 0.1),
] + [{"parts": [f"leg_{s}{k}", f"shin_{s}{k}", f"foot_{s}{k}"],
      "wave": {"axis": "x", "amp": 7, "cycles": 2, "lag": 0.15, "growth": 1.25,
               "phase": (0.21 * int(k) + (0.5 if s == "r" else 0))}} for s in "lr" for k in "123"])

# stab: rear back and cock the needle, a vicious lunge that drives the stylet out level at the target, a twitching
# hold, pull free. The front legs reach out to grab, the hind legs kick up.
REAR = add(HOVER, r("body", -22), pos("body", 0, 0.8, -1.6), r("head", -6), r("needle", -10),
           r("abdomen", 24), r("abdomen_1", 16), r("abdomen_2", 14),
           leg_pose(1, (0.5, 0.4, 0.6), (0.3, -0.6, 0.75), (0.15, -0.35, 0.9)),
           leg_pose(2, (0.9, 0.25, 0.1), (0.35, -0.7, -0.35), (0.15, -0.5, -0.8)),
           both("antenna_*", -24), sc("abdomen", 0.05, 0.05, -0.03))
LUNGE = add(HOVER, r("body", 12), pos("body", 0, 0.2, 3.0), r("head", -14), r("needle", -12),
            pos("stylet", 0, 0, 1.5), r("abdomen", -18), r("abdomen_1", -10), r("abdomen_2", -8),
            leg_pose(1, (0.35, 0.3, 0.9), (0.1, -0.2, 1.0), (-0.1, -0.15, 1.0)),
            leg_pose(2, (0.85, 0.2, 0.45), (0.3, -0.4, 0.85), (0.1, -0.4, 0.9)),
            leg_pose(3, (0.5, 0.4, -0.75), (0.15, 0.3, -0.95), (0.0, 0.7, -0.7)),
            both("antenna_*", 26), sc("body", -0.06, 0.08, 0.1))
STUCK = add(LUNGE, r("body", -3), pos("body", 0, 0, -0.4), pos("stylet", 0, 0, -0.3), sc("body", 0.12, -0.16, -0.2),
            sc("abdomen", 0.08, 0.08, 0.04))
ANIM["stab"] = timeline(0.6, [(0.0, HOVER, None), (0.16, REAR, "out"), (0.22, add(REAR, r("body", -4)), "ease"),
                              (0.29, LUNGE, "in"), (0.36, STUCK, "out"), (0.44, STUCK, "ease"),
                              (0.52, add(HOVER, r("body", -8), pos("body", 0, 0.3, -0.6)), "back"), (0.6, HOVER, "ease")],
                        extra=buzz(0.6, amp=48, sweep=18) + [
                            jitter("body", 0.36, 0.46, 3.0, axis=2), jitter("abdomen", 0.36, 0.46, 5.0),
                            jitter("wing_l1", 0.16, 0.24, 6, axis=2), jitter("wing_r1", 0.16, 0.24, -6, axis=2)])

# drink: needle sunk in (forward and down), pumping: gulps run down the abdomen and it swells with each one;
# front legs braced on the victim, hind legs raised and swaying, wings held up in a V with a shimmer
SIP = add(HOVER, r("body", 10), pos("body", 0, 0, 1.6), r("head", 2), r("needle", 2), pos("stylet", 0, 0, 1.0),
          r("abdomen", -12), r("abdomen_1", -6), r("abdomen_2", -4),
          leg_pose(1, (0.4, 0.3, 0.85), (0.15, -0.6, 0.8), (-0.05, -0.55, 0.8)),
          leg_pose(2, (0.9, 0.2, 0.35), (0.35, -0.75, 0.5), (0.1, -0.6, 0.75)),
          leg_pose(3, (0.45, 0.5, -0.7), (0.1, 0.4, -0.9), (-0.05, 0.8, -0.55)),
          both("antenna_*", 10))
L = 1.2
ANIM["drink"] = timeline(L, [(0.0, SIP, None), (L, SIP, None)], loop=True, extra=buzz(L, amp=8, sweep=3, bias=20) + [
    {"parts": ["abdomen", "abdomen_1", "abdomen_2"], "channel": "scale",
     "wave": {"amp": [0.12, 0.14, 0.04], "cycles": 3, "lag": 0.14, "growth": 1.15, "shape": "bounce"}},
    {"parts": ["abdomen", "abdomen_1", "abdomen_2"], "wave": {"axis": "x", "amp": 3, "cycles": 3, "lag": 0.12}},
    osc("head", "x", 3, 3, 0.0, shape="bounce"),
    osc("body", "x", -2.0, 3, 0.05, shape="bounce"),
    osc("stylet", None, [0, 0, 0.35], 3, 0.0, ch="position", shape="bounce"),
    osc("leg_l3", "x", 8, 1, 0.0), osc("leg_r3", "x", 8, 1, 0.5),
    osc("shin_l3", "x", 10, 1, 0.1), osc("shin_r3", "x", 10, 1, 0.6),
    osc("antenna_l", "x", 8, 3, 0.1, shape="pulse"), osc("antenna_r", "x", 8, 3, 0.2, shape="pulse"),
])

# spit: squeeze the abdomen (gather), rear up, a heave that snaps the head and needle down and out, recoil
GATHER = add(HOVER, r("body", -16), pos("body", 0, 0.6, -0.8), r("head", -14), r("needle", -12), r("abdomen", 18),
             r("abdomen_1", 12), r("abdomen_2", 10), sc("abdomen", 0.16, 0.16, -0.04), sc("abdomen_1", 0.14, 0.16, 0),
             leg_pose(1, (0.5, 0.45, 0.5), (0.3, -0.65, 0.65), (0.15, -0.45, 0.85)), both("antenna_*", -16))
HEAVE = add(HOVER, r("body", 10), pos("body", 0, 0.2, 1.6), r("head", 0), r("needle", -8), pos("stylet", 0, 0, 0.8),
            r("abdomen", -20), r("abdomen_1", -12), r("abdomen_2", -10), sc("abdomen", -0.16, -0.14, 0.08),
            sc("abdomen_1", -0.14, -0.12, 0.06), sc("head", 0.14, 0.14, 0.1),
            leg_pose(1, (0.7, -0.05, 0.6), (0.25, -0.75, -0.3), (0.05, -0.5, -0.85)), both("antenna_*", 24))
ANIM["spit"] = timeline(0.6, [(0.0, HOVER, None), (0.2, GATHER, "out"), (0.25, add(GATHER, sc("abdomen", 0.04, 0.04)),
                                                                                 "ease"),
                              (0.31, HEAVE, "in"), (0.4, add(HEAVE, r("body", -6), sc("head", -0.12, -0.12, -0.08)),
                                                         "out"),
                              (0.6, HOVER, "back")],
                        extra=buzz(0.6, amp=46, sweep=16) + [jitter("abdomen", 0.12, 0.24, 4.0, axis=1),
                                                             jitter("abdomen_1", 0.12, 0.24, 5.0, axis=1)])

spec = {
    "name": "Mosquito",
    "description": "The Winterworks Amber Age mosquito: a small, mean prehistoric mosquito with a humped bronze-black "
                   "thorax and silver lyre, huge blood-red compound eyes, feathery antennae, a long giant needle, a "
                   "striped three-segment abdomen, four glassy iridescent wings (cards) and six long banded jointed "
                   "legs. swell_* shells are transparent here; the blood and amber textures paint them as a swollen "
                   "belly. Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 1200, "colors": 72},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": FPS, "alpha_parts": {f"wing_{n}{k}_m": 0.8 for n in "lr" for k in "12"}},
    "anim_ground_tolerance": 0.3,
    "render": {"background": "#241f2b", "hero": [118, 22], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles_for("empty"),
    "parts": P,
    "animations": ANIM,
}

VARIANTS = {"blood": "mosquito_blood", "amber": "mosquito_amber"}


def variant_spec(kind):
    out = copy.deepcopy(spec)
    out["name"] = {"blood": "Mosquito Blood", "amber": "Mosquito Amber"}[kind]
    out["styles"] = styles_for(kind)
    if kind == "blood":
        out["minecraft"] = dict(out["minecraft"], glow_ramps=["bloodcore"])
    return out


def dumps(obj):
    return json.dumps(obj, indent=1)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "mosquito.json")
    sys.path.insert(0, ROOT)
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points
    lo = min(float(transform_points(i.world, f.pts)[:, 1].min()) for i in expand_instances(P, float(DENSITY))
             for f in i.faces)
    P[0]["pivot"][1] = round(P[0]["pivot"][1] - lo, 4)
    with open(out, "w") as fh:
        fh.write(dumps(spec))
    print(out, len(P), "parts", f"(lifted {-lo:+.3f})")
    vdir = os.path.join(os.path.dirname(os.path.abspath(out)), "variants")
    os.makedirs(vdir, exist_ok=True)
    for kind, fn in VARIANTS.items():
        with open(os.path.join(vdir, f"{fn}.json"), "w") as fh:
            fh.write(dumps(variant_spec(kind)))
    print("variants:", ", ".join(VARIANTS.values()))
