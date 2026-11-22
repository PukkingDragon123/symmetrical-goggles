"""Builds examples/pot_golem.json: the Winterworks Pot Golem (Amber Age update).

    python examples/src/pot_golem.py examples/pot_golem.json

A giant, muscular amber humanoid, a little jelly-like: a deep chest and hunched trapezius, slab pecs and abs, short
stumpy legs, long gorilla arms ending in huge knuckled fists. It is translucent-looking amber painted opaque: a dark
core and bright edges on every mass, trapped air bubbles, a fossil leaf in the left pec, a seed and a tiny mosquito
deeper in the back. Wobbly jelly blobs (`jelly_*`) sit on the shoulders, elbows, back, belly, hips and knees, with
alpha-cut drips hanging off them; hard amber crystal growths break out of the shoulders and back, and broken
terracotta sherds are stuck in its hide.

The decorated pot is its head: the `head` bone is only the seat (its pivot is the centre of the pot's bottom face; Java
draws the real 16x16x16 pot there). `face` is the small amber nub under the pot with a dumb face (two tiny dot eyes, one
bigger), shown only when it has no pot. Arm attachments (hidden by Java unless equipped): `blade` (a big knapped flint
arm blade bound with amber, on the right forearm), `pickaxe` (a flint pick head bound across the right fist) and `bow`
(an amberwood bow along the left forearm, with its string).

Units are Minecraft pixels (16 per block), density 1: every box is a whole number of pixels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). Faces +Z, ground at y=0, "right" is -X.

Contract (mods/winterworks/docs/AMBER_UPDATE.md section 9): bones body (root, the pelvis), chest, head, face, arm_l,
arm_r, blade, pickaxe, bow, leg_l, leg_r, jelly_*. Extra joints: forearm_l/r and fist_l/r (elbows and wrists; blade
hangs under forearm_r and pickaxe under fist_r, both inside arm_r; bow under forearm_l), shin_l/r (knees).
Clips: idle, walk, attack, slash, mine, shoot, howl, beam, giggle, sneeze, dazed, fuse. Every clip wobbles the jelly.
"""
import json
import math
import os
import random
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

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
        assert all(abs(s - round(s)) < 1e-9 for s in size), f"{id}: size {size} is not whole pixels"
        d["size"] = [int(round(s)) for s in size]
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
    return part(id, parent, None, "amber", shape="bone", **kw)


def card(id, parent, art, style, plane="xy", **kw):
    return part(id, parent, None, style, shape="card", plane=plane, art=art, **kw)


def M(v, s):
    return (v[0] * s, v[1], v[2])


def wpos(id, local):
    R, t = FRAMES[id]
    return t + R @ np.array(local, float)


def MR(r, s):
    return (r[0], r[1] * s, r[2] * s)


# ----------------------------------------------------------------------- card art
def drips(w, h, seed, fill=0.7):
    """Hanging jelly drips: rounded runs of random length with a bulb at the end, glossy at the root."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    x = 0
    while x < w:
        dw = rng.choice((1, 2, 2, 3))
        if rng.random() < fill:
            L = max(2, int(round(rng.uniform(0.35, 1.0) * h)))
            for cx in range(x, min(w, x + dw)):
                ln = L if dw == 1 or cx in (x, x + dw - 1) and dw > 2 else L
                for k in range(ln):
                    rows[k][cx] = "g" if k == 0 else ("b" if k >= ln - 2 else "d")
            if dw >= 2 and L < h:       # a fat bulb at the end
                for cx in range(x, min(w, x + dw)):
                    rows[min(h - 1, L)][cx] = "b" if dw > 2 and cx in (x, x + dw - 1) else "b"
        else:
            for cx in range(x, min(w, x + dw)):
                rows[0][cx] = "d"
        x += dw
    # one bright glint on every drip
    for cx in range(w):
        col = [rows[k][cx] for k in range(h)]
        if "b" in col:
            k = col.index("b")
            rows[k][cx] = "h" if (cx + seed) % 3 == 0 else rows[k][cx]
    return ["".join(r) for r in rows]


# a seed and a tiny mosquito trapped deep in the back (stamps on the lats)
SEED = ["..ss.", ".sSss", "ssSs.", ".ss.."]
MOSQ = ["w.....w", ".w...w.", "..mmm..", "llmmmll", ".l.m.l.", "l..m..l", "...m..."]
STAMP_KEY = {"s": "fossil:1", "S": "fossil:3", "w": "core:4", "m": "fossil:0", "l": "fossil:1"}


# ======================================================================= torso: body (pelvis, root), chest
part("body", None, [15, 7, 10], "amber", at=(0, 15, 0), centre=(0, 15.5, 0))
part("waist", "body", [12, 6, 9], "amber_dark", centre=(0, 20.5, 0.5))
part("jelly_gut", "body", [12, 6, 4], "jelly", at=(0, 21.5, 5.5), centre=(0, 19.5, 6.5))
card("jelly_gut_drip", "jelly_gut", drips(10, 4, 3), "drip", rel=(0, -3.1, 1.2), offset=(0, -1.5, 0), rot=(-8, 0, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"jelly_hip_{n}", "body", [4, 6, 8], "jelly", at=M((7.0, 16.5, 0), s), centre=M((8.0, 16, 0), s),
         rot=(0, 0, s * -6))
    card(f"jelly_hip_{n}_drip", f"jelly_hip_{n}", drips(6, 4, 10 + s), "drip", rel=M((1.2, -3, 0), s),
         offset=(0, -1.5, 0), plane="yz")

# the chest: a deep barrel, hunched forward, slab pecs over a six-pack, a heavy trapezius hump the pot sits on
part("chest", "body", [18, 12, 12], "amber", at=(0, 21, 0), offset=(0, 9.0, -0.5), wrot=(10, 0, 0))
part("pecs", "chest", [20, 7, 4], "amber_pec", rel=(0, 11.5, 6.2), rot=(-4, 0, 0))
part("abs", "chest", [10, 7, 2], "amber_abs", rel=(0, 4.8, 6.4))
part("traps", "chest", [14, 5, 11], "amber", rel=(0, 15.6, -0.6), rot=(-8, 0, 0))
part("lats", "chest", [21, 8, 6], "amber", rel=(0, 10.0, -3.4), rot=(4, 0, 0),
     paint={"stamps": [{"face": "back", "at": [1, 1], "art": SEED, "key": STAMP_KEY},
                       {"face": "back", "at": [14, 0], "art": MOSQ, "key": STAMP_KEY}]})
part("jelly_back", "chest", [12, 8, 5], "jelly", rel=(0, 9.5, -6.8), offset=(0, -1, 0), rot=(14, 0, 0))
card("jelly_back_drip", "jelly_back", drips(11, 5, 21), "drip", rel=(0, -5.1, -1.2), offset=(0, -2.0, 0), rot=(18, 0, 0))
card("pecs_drip", "pecs", drips(16, 4, 22, fill=0.55), "drip", rel=(0, -3.6, 2.1), offset=(0, -1.5, 0), rot=(-6, 0, 0))
# hard amber crystal growths breaking out of the back and shoulder line
for k, (rel, w, h, rx, rz) in enumerate([((-3.5, 16.8, -4.0), 3, 9, -40, 14), ((1.5, 17.0, -5.0), 4, 12, -34, -8),
                                        ((5.0, 16.0, -3.5), 3, 7, -46, -30), ((-6.5, 14.5, -3.0), 2, 6, -30, 40),
                                        ((-1.0, 12.5, -7.0), 3, 6, -70, 6)]):
    part(f"crystal{k}", "chest", [w, h, w], "crystal" if k % 2 == 0 else "crystal_b", rel=rel, offset=(0, h / 2 - 1, 0),
         rot=(rx, (k * 37) % 50 - 25, rz))
# broken terracotta sherds stuck in the hide
part("sherd0", "chest", [6, 5, 1], "sherd", rel=(-6.0, 9.0, -6.8), rot=(-14, 20, 18))
part("sherd1", "chest", [5, 4, 1], "sherd_b", rel=(6.5, 8.0, -6.6), rot=(10, -24, -12))

# ======================================================================= head: the pot seat, and the dumb face nub
bone("head", "chest", rel=(0, 18.2, 0.4), wrot=(0, 0, 0))
part("face", "head", [9, 7, 8], "face", rel=(0, 0, 0.5), offset=(0, 3.2, 0))
part("face_chin", "face", [7, 2, 6], "jelly", rel=(0, -0.5, 1.5), rot=(-6, 0, 0))

# ======================================================================= arms: deltoid blobs, thick forearms, huge fists
# gorilla arms: angled out and forward from the shoulders, the elbows bent so the fists hang forward and turned in
for s in (1, -1):
    n = "l" if s > 0 else "r"
    arm = part(f"arm_{n}", "chest", [7, 12, 8], "amber", at=M((11.5, 34.0, 0.5), s), offset=(s * 0.8, -5.5, 0),
               wrot=MR((-10, 0, 12), s))
    part(f"jelly_shoulder_{n}", arm["id"], [9, 7, 10], "jelly", rel=M((1.4, 1.0, 0.0), s), rot=MR((0, 0, 6), s))
    card(f"jelly_shoulder_{n}_drip", f"jelly_shoulder_{n}", drips(8, 4, 30 + s), "drip", rel=M((4.6, -2.5, 0), s),
         offset=(0, -1.5, 0), plane="yz", rot=MR((0, 0, 8), s))
    part(f"spike_{n}", f"jelly_shoulder_{n}", [3, 7, 3], "crystal", rel=M((1.0, 3.0, -1.5), s), offset=(0, 3, 0),
         rot=MR((-30, 0, -32), s))
    part(f"spike_{n}2", f"jelly_shoulder_{n}", [2, 5, 2], "crystal_b", rel=M((2.5, 2.5, 2.0), s), offset=(0, 2, 0),
         rot=MR((14, 0, -48), s))
    part(f"bicep_{n}", arm["id"], [5, 7, 4], "amber", rel=M((0.6, -5.5, 3.4), s), rot=(-4, 0, 0))
    fa = part(f"forearm_{n}", arm["id"], [8, 11, 9], "amber", rel=M((0.9, -11.0, 0.5), s), offset=(0, -4.8, 0.6),
              wrot=MR((-26, 0, 5), s))
    part(f"jelly_elbow_{n}", fa["id"], [5, 5, 4], "jelly", rel=(0, 0.5, -4.2), offset=(0, -1.5, 0), rot=(24, 0, 0))
    card(f"jelly_elbow_{n}_drip", f"jelly_elbow_{n}", drips(4, 5, 40 + s), "drip", rel=(0, -4.1, 0),
         offset=(0, -2.0, 0), plane="yz")
    part(f"crystal_fa_{n}", fa["id"], [2, 5, 2], "crystal_b", rel=M((3.2, -3.0, -3.6), s), offset=(0, 2.0, 0),
         rot=MR((-50, 0, -40), s))
    fist = part(f"fist_{n}", fa["id"], [9, 8, 10], "amber_fist", rel=(0, -10.0, 1.0), offset=(0, -3.6, 0.4),
                wrot=MR((-14, s * -8, -4), s))
    part(f"knuckles_{n}", fist["id"], [9, 3, 2], "knuckle", rel=(0, -5.0, 5.6))
    part(f"thumb_{n}", fist["id"], [3, 5, 4], "amber_fist", rel=M((-4.6, -5.0, 3.2), s), rot=MR((10, 0, 14), s))
    card(f"fist_drip_{n}", fist["id"], drips(8, 3, 50 + s), "drip", rel=M((4.6, -7.5, 0), s), offset=(0, -1.0, 0),
         plane="yz")


def fa(n, local):
    return wpos(f"forearm_{n}", local)


# ======================================================================= arm attachments (hidden unless equipped)
# blade: a big knapped flint blade on the outside of the right forearm, bound on with amber at the wrist; it curves
# forward past the fist like a tusk (sharp lower edge), a back spur over the elbow
bone("blade", "forearm_r", at=fa("r", (-4.8, -8.0, 1.0)))
part("blade_wrap", "blade", [10, 3, 11], "jelly", at=fa("r", (0, -6.2, 0.6)))
part("blade_wrap2", "blade", [10, 2, 11], "jelly", at=fa("r", (0, -9.3, 0.6)))
part("blade_base", "blade", [2, 6, 9], "flint", at=fa("r", (-5.1, -8.0, 1.5)), offset=(0, 0, 3.0), rot=(50, 0, 0))
part("blade_mid", "blade_base", [2, 5, 8], "flint", rel=(0, -0.3, 7.2), offset=(0, 0, 3.5), rot=(16, 0, 0))
part("blade_tip", "blade_mid", [1, 4, 6], "flint_edge", rel=(0, -0.2, 7.0), offset=(0, 0, 2.5), rot=(16, 0, 0))
part("blade_spur", "blade_base", [1, 4, 6], "flint_edge", rel=(0, 1.2, -1.5), offset=(0, 0, -2.5), rot=(-28, 0, 0))
card("blade_edge", "blade_mid", ["eeEeeeEe"], "flint_glint", rel=(0, -2.55, 0.0), plane="xz", rot=(0, 90, 0))
# pickaxe: a heavy flint pick head through the right fist, a point forward and a point back, bound with amber
bone("pickaxe", "fist_r", at=wpos("fist_r", (0, -3.0, 0.4)))
part("pick_bind", "pickaxe", [10, 4, 11], "jelly", at=wpos("fist_r", (0, -1.5, 0.4)))
part("pick_head", "pickaxe", [4, 4, 13], "flint", at=wpos("fist_r", (-1.0, -4.0, 0.4)))
part("pick_front", "pick_head", [3, 3, 7], "flint", rel=(0, -0.2, 6.0), offset=(0, 0, 3.0), rot=(26, 0, 0))
part("pick_front_tip", "pick_front", [2, 2, 4], "flint_edge", rel=(0, 0, 6.0), offset=(0, 0, 1.5), rot=(20, 0, 0))
part("pick_back", "pick_head", [3, 3, 6], "flint", rel=(0, -0.2, -6.0), offset=(0, 0, -2.5), rot=(-24, 0, 0))
part("pick_back_tip", "pick_back", [2, 2, 3], "flint_edge", rel=(0, 0, -5.0), offset=(0, 0, -1.2), rot=(-20, 0, 0))
# bow: an amberwood bow strapped along the outside of the left forearm (lying front to back at rest, upright once the
# arm is raised to aim, the string towards the golem), recurved tips
bone("bow", "forearm_l", at=fa("l", (5.2, -6.0, 0.8)))
part("bow_strap", "bow", [10, 3, 11], "jelly", at=fa("l", (0, -6.0, 0.6)))
part("bow_grip", "bow", [2, 3, 5], "wood", at=fa("l", (5.3, -6.0, 0.8)))
for k in (1, -1):
    lid = "bow_upper" if k > 0 else "bow_lower"
    part(lid, "bow_grip", [2, 2, 9], "wood", rel=(0, 0, k * 2.0), offset=(0, 0, k * 4.5), rot=(-k * 24, 0, 0))
    part(f"{lid}_tip", lid, [2, 2, 4], "wood_tip", rel=(0, 0, k * 9.0), offset=(0, 0, k * 1.5), rot=(k * 40, 0, 0))
card("bow_string", "bow", ["s" * 21], "string", rel=(0.1, 4.2, 0), plane="xz", rot=(0, 90, 0))

# ======================================================================= legs: short stumpy pillars, knees, big feet
for s in (1, -1):
    n = "l" if s > 0 else "r"
    leg = part(f"leg_{n}", "body", [8, 9, 9], "amber", at=M((5.0, 14.0, 0), s), centre=M((5.3, 10.0, 0.2), s),
               wrot=MR((0, 0, 3), s))
    part(f"jelly_knee_{n}", leg["id"], [6, 4, 3], "jelly", at=M((5.5, 6.8, 4.4), s), rot=(-10, 0, 0))
    shin = part(f"shin_{n}", leg["id"], [7, 6, 8], "amber_dark", at=M((5.5, 6.5, 0.4), s), centre=M((5.7, 4.0, 0.6), s),
                wrot=(0, 0, 0))
    part(f"foot_{n}", shin["id"], [9, 3, 11], "amber_fist", at=M((5.7, 1.5, 1.6), s), wrot=(0, 0, 0))
    for k, dx in enumerate((-3.0, 0.0, 3.0)):
        part(f"toe_{n}{k}", f"foot_{n}", [2, 2, 2], "knuckle", rel=M((dx, -0.5, 6.0), s))

# ======================================================================= palette and paint
ramps = {
    # honey amber: deep brown shadows, a golden-honey body, pale honey edges, cream glints (natural, not neon)
    "amber": ["#24100a", "#3a1a0c", "#52260f", "#6b3413", "#854518", "#9e581e", "#b66d27", "#cb8333", "#dc9b42",
              "#e9b356", "#f3c96f", "#f9de97", "#fdf0c8"],
    # the dark inside of the amber (core) and what is trapped in it
    "core": ["#2a120a", "#3d1c0e", "#522812", "#683616", "#7f461c"],
    "fossil": ["#170a06", "#2a140a", "#3f2010", "#563018"],
    # hard amber crystal (clearer, more yellow)
    "crystal": ["#40220c", "#5f3512", "#83501c", "#a86b28", "#c88a3a", "#e0a84e", "#f0c46a", "#f9dd98", "#fff4d0"],
    "flint": ["#101116", "#191b22", "#24262f", "#30333e", "#3f434f", "#525764", "#686e7c", "#848a97", "#a5abb5",
              "#ccd0d5", "#f1f2ee"],
    "terracotta": ["#28120d", "#3f1c14", "#5b291b", "#783722", "#94472b", "#ad5a37", "#c27149", "#d38c63", "#e2aa86"],
    "wood": ["#22120a", "#361d10", "#4d2b17", "#653a1f", "#7f4c28", "#9a6033", "#b47742", "#cb9157", "#ddae74"],
    "string": ["#6f6352", "#a99a80", "#ddd2b8", "#f6f0dc"],
    "eye": ["#120604", "#26100a"],
}
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.6, "gradient": 0.35, "ao": 0.8, "ao_height": 9.0}
brush = {"flow": "long", "length": 3.0, "width": 1.0, "rough": 0.45, "overshoot": 0.3,
         "flows": {"flint": "long", "wood": "long"},
         "textures": {"amber": "liquid", "crystal": "crystal", "flint": "stone", "terracotta": "stone", "wood": "wood"}}

GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.55,
         "shift": 2.4}
# translucent-looking amber, painted opaque: a dark core, bright edges (the rims) and a glow along the lower edges
# where the light comes out again; swirls of darker resin inside
CORE = [{"id": "core", "op": "band", "axis": "x", "from": -0.6, "to": 0.6, "shift": -2.0, "wobble": 0.3,
         "wobble_scale": 0.5, "faces": ["front", "back", "top", "bottom"]},
        {"id": "core_s", "op": "band", "axis": "z", "from": -0.55, "to": 0.55, "shift": -1.8, "wobble": 0.3,
         "wobble_scale": 0.5, "faces": ["left", "right"]},
        {"id": "exit_glow", "op": "band", "axis": "y", "from": -1.01, "to": -0.7, "shift": 1.8, "wobble": 0.15,
         "faces": ["sides"]}]
BUBBLES = {"id": "bubbles", "op": "spots", "count": 5, "radius": [0.35, 0.8], "ramp": "amber", "tone": 11.4,
           "bevel": {"shadow": 1, "highlight": 0, "shadow_shift": -2.0}, "post": True}
SWIRL = {"id": "swirl", "op": "stripes", "axis": [1, 0.6, 0.3], "period": 5.0, "width": 0.22, "wobble": 1.8,
         "wobble_scale": 2.0, "shift": -1.0, "faces": ["front", "back", "left", "right"]}
DRIP_KEY = {"g": "amber:10", "d": "amber:8", "b": "amber:7", "h": "amber:11"}

# a fossil leaf in the left pec, a seed and a mosquito deep in the back: painted, opaque, a little blurred by depth
# a ginkgo leaf: a fan with a notch, radiating veins, a stem
LEAF = ["ff.ff.", "fvfvff", "vfvfvf", ".fvff.", "..vf..", "..v...", ".v...."]
LEAF_KEY = {"f": "fossil:3", "v": "fossil:1"}

styles = {
    "amber": {"ramp": "amber", "tone": 4.4, "light": 0.8,
              "rim": {"light": 1, "dark": 1, "light_shift": 3.4, "dark_shift": -1.4},
              "layers": [SWIRL] + CORE + [BUBBLES, GLOSS]},
    "amber_dark": {"ramp": "amber", "tone": 3.6, "light": 0.8,
                   "rim": {"light": 1, "dark": 1, "light_shift": 3.2, "dark_shift": -1.2},
                   "layers": [SWIRL] + CORE + [dict(BUBBLES, count=2), GLOSS]},
    "amber_pec": {"ramp": "amber", "tone": 4.8, "light": 0.8,
                  "rim": {"light": 1, "dark": 1, "light_shift": 3.4, "dark_shift": -1.4},
                  "layers": [SWIRL] + CORE + [
                      {"id": "split", "op": "band", "axis": "x", "from": -0.06, "to": 0.06, "shift": -2.0,
                       "faces": ["front", "bottom"]}, dict(BUBBLES, count=3), GLOSS],
                  "stamps": [{"face": "front", "at": [12, 0], "art": LEAF, "key": LEAF_KEY}]},
    "amber_abs": {"ramp": "amber", "tone": 4.4, "light": 0.8,
                  "rim": {"light": 1, "dark": 1, "light_shift": 3.0, "dark_shift": -1.2},
                  "layers": [SWIRL,
                             {"id": "rows", "op": "stripes", "axis": "y", "period": 2.4, "width": 0.3, "shift": -1.8,
                              "faces": ["front"]},
                             {"id": "split", "op": "band", "axis": "x", "from": -0.1, "to": 0.1, "shift": -1.8,
                              "faces": ["front"]}, GLOSS]},
    "amber_fist": {"ramp": "amber", "tone": 4.8, "light": 0.8,
                   "rim": {"light": 1, "dark": 1, "light_shift": 3.4, "dark_shift": -1.4},
                   "layers": [SWIRL] + CORE + [dict(BUBBLES, count=3), GLOSS]},
    "knuckle": {"ramp": "amber", "tone": 6.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.6},
                "layers": [{"id": "gaps", "op": "stripes", "axis": "x", "period": 2.5, "width": 0.25, "shift": -2.4,
                            "faces": ["front", "top", "bottom"]}, GLOSS]},
    # the wobbly jelly: paler, yellower and glossier, almost liquid
    "jelly": {"ramp": "amber", "tone": 7.0, "light": 0.7, "brush": {"flow": "y", "rough": 0.35},
              "rim": {"light": 1, "dark": 1, "light_shift": 3.2, "dark_shift": -1.8},
              "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.5, "to": 0.5, "shift": -1.3,
                          "wobble": 0.3, "faces": ["front", "back", "top", "bottom"]},
                         {"id": "core_s", "op": "band", "axis": "z", "from": -0.45, "to": 0.45, "shift": -1.1,
                          "wobble": 0.3, "faces": ["left", "right"]},
                         {"id": "sag", "op": "gradient", "axis": "y", "amount": -0.8},
                         dict(BUBBLES, count=3, tone=12.0, radius=[0.3, 0.6]),
                         dict(GLOSS, density=0.9, shift=3.0)]},
    "drip": {"ramp": "amber", "tone": 8, "light": 0.3, "brush": {"off": True}, "art_key": DRIP_KEY},
    "face": {"ramp": "amber", "tone": 6.8, "rim": {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -1.4},
             "brush": {"flow": "y", "rough": 0.35},
             "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.45, "to": 0.45, "shift": -1.0,
                         "faces": ["back", "top"]},
                        {"id": "cheeks", "op": "band", "axis": "y", "from": -1.01, "to": -0.35, "shift": -0.8},
                        dict(BUBBLES, count=2, radius=[0.3, 0.5]), dict(GLOSS, density=0.9, shift=3.0)],
             # two tiny dot eyes, one bigger than the other, a little catchlight in the big one
             "stamps": [{"face": "front", "at": "top-left", "art": [".........", ".........", "..ee.....",
                                                                     "..eh..e..", "........."],
                         "key": {"e": "eye:0", "h": "eye:1"}}]},
    "crystal": {"ramp": "crystal", "tone": 4.0, "light": 0.6, "brush": {"off": True},
                "rim": {"light": 1, "dark": 1, "light_shift": 3.0, "dark_shift": 1.0},
                "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.4, "to": 0.4, "shift": -2.4,
                            "faces": ["front", "back"]},
                           {"id": "core_s", "op": "band", "axis": "z", "from": -0.4, "to": 0.4, "shift": -2.4,
                            "faces": ["left", "right"]},
                           {"id": "base", "op": "gradient", "axis": "y", "amount": 1.4},
                           {"id": "glint", "op": "band", "axis": "y", "from": 0.5, "to": 0.7, "shift": 2.0,
                            "faces": ["sides"]}]},
    "crystal_b": {"ramp": "crystal", "tone": 4.8, "light": 0.6, "brush": {"off": True},
                  "rim": {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": 0.6},
                  "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.35, "to": 0.35, "shift": -2.0,
                              "faces": ["front", "back"]},
                             {"id": "core_s", "op": "band", "axis": "z", "from": -0.35, "to": 0.35, "shift": -2.0,
                              "faces": ["left", "right"]},
                             {"id": "base", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "sherd": {"ramp": "terracotta", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
              "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.8}],
              "stamps": [{"face": "back", "at": "top-left", "art": ["......", ".dd.d.", "d..dd.", "......", "......"],
                          "key": {"d": "terracotta:1"}}]},
    "sherd_b": {"ramp": "terracotta", "tone": 5.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
                "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.8}],
                "stamps": [{"face": "back", "at": "top-left", "art": [".....", "d.d.d", ".d.d.", "....."],
                            "key": {"d": "terracotta:1"}}]},
    # knapped flint: dark blue-black stone, conchoidal flake scars, a pale sharp edge
    "flint": {"ramp": "flint", "tone": 4.0, "rim": {"light": 1, "dark": 1, "light_shift": 3.0, "dark_shift": -1.0},
              "layers": [{"id": "flakes", "op": "scales", "shape": "round", "along": "y", "size": [2.5, 2.0],
                          "gap": 0.5, "highlight": 1.6, "shadow": -1.4, "jitter": 0.8},
                         {"id": "patina", "op": "patches", "scale": 1.4, "threshold": 0.6, "shift": 1.0}]},
    "flint_edge": {"ramp": "flint", "tone": 5.2, "rim": {"light": 1, "dark": 1, "light_shift": 3.6, "dark_shift": -0.8},
                   "layers": [{"id": "flakes", "op": "scales", "shape": "round", "along": "y", "size": [2.0, 1.5],
                               "gap": 0.5, "highlight": 1.6, "shadow": -1.2, "jitter": 0.8}]},
    "flint_glint": {"ramp": "flint", "tone": 9, "light": 0, "brush": {"off": True},
                    "art_key": {"e": "flint:9", "E": "flint:10"}},
    "wood": {"ramp": "wood", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.4},
             "layers": [{"id": "grain", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3, "shift": -1.0,
                         "wobble": 0.4},
                        {"id": "resin", "op": "spots", "count": 2, "radius": [0.4, 0.7], "ramp": "amber",
                         "tone": 9.5}]},
    "wood_tip": {"ramp": "wood", "tone": 3.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.0}},
    "string": {"ramp": "string", "tone": 2, "light": 0, "brush": {"off": True}, "art_key": {"s": "string:2"}},
}

# ======================================================================= animation: pose timelines + foot lock
JELLY = [p["id"] for p in P if p["id"].startswith("jelly_") and p["shape"] != "card"]
JELLY_DRIPS = [p["id"] for p in P if p["id"].startswith("jelly_") and p["shape"] == "card"]
FEET = ["foot_l", "foot_r", "toe_l0", "toe_l1", "toe_l2", "toe_r0", "toe_r1", "toe_r2"]


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


def side(base, s, x=0, y=0, z=0):
    """Rotate base_l (s=1) or base_r (s=-1): y and z are mirrored, so the same numbers make a mirrored pose."""
    return {f"{base}_{'l' if s > 0 else 'r'}": {"r": [x, y * s, z * s]}}


def both(base, x=0, y=0, z=0):
    return add(side(base, 1, x, y, z), side(base, -1, x, y, z))


def arm(s, a=0, out=0, twist=0, elbow=0, wrist=0, ewrist=0):
    """One arm: shoulder pitch (- raises forward), abduction (+ out to the side), twist; elbow (- bends the forearm
    forward/up), wrist pitch and wrist roll."""
    return add(side("arm", s, a, twist, out), side("forearm", s, elbow), side("fist", s, wrist, 0, ewrist))


def leg(s, a=0, knee=0, foot=0, out=0):
    """One leg: hip pitch (- swings forward), knee (+ bends the shin back), foot pitch, splay (+ out)."""
    return add(side("leg", s, a, 0, out), side("shin", s, knee), side("foot", s, foot))


def mirror_pose(p):
    out = {}
    for k, chans in p.items():
        k2 = k[:-2] + "_r" if k.endswith("_l") else k[:-2] + "_l" if k.endswith("_r") else k
        o = {}
        for ch, v in chans.items():
            o[ch] = [v[0], -v[1], -v[2]] if ch == "r" else ([-v[0], v[1], v[2]] if ch == "p" else list(v))
        out[k2] = o
    return out


def timeline(length, keys, loop=False, extra=(), lift=None, lock=True):
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
    clip = {"length": length, "loop": loop, "tracks": tracks + list(extra)}
    if lock:
        clip["_lock"] = {"lift": lift}
    return clip


def cycle(part_, length, keys, phase, ch="rotation", ease="smooth"):
    ks = sorted(((((u + phase) % 1.0) * length), v) for u, v in keys)
    return {"part": part_, "channel": ch, "keys": [[round(t, 4), [round(float(a), 3) for a in v]] for t, v in ks],
            "ease": ease}


def osc(part_, axis, amp, cycles, phase=0.0, bias=None, ch=None, shape=None):
    o = {"amp": amp, "cycles": cycles, "phase": phase}
    if bias is not None:
        o["bias"] = bias
    if shape:
        o["shape"] = shape
    t = {"part": part_, "osc": o}
    if axis:
        t["axis"] = axis
    if ch:
        t["channel"] = ch
    return t


def jitter(part_, t0, t1, amp, step=0.05, axis=0, ch="rotation", seed=0):
    rng = random.Random(seed)
    ks = [[0.0, [0, 0, 0]], [round(t0, 4), [0, 0, 0]]]
    t, sgn = t0 + step, 1
    while t < t1 - 1e-9:
        v = [0, 0, 0]
        v[axis] = sgn * amp * rng.uniform(0.6, 1.0)
        ks.append([round(t, 4), v])
        t += step
        sgn = -sgn
    ks.append([round(t1, 4), [0, 0, 0]])
    return {"part": part_, "channel": ch, "keys": ks, "ease": "ease"}


def wobble(length, cycles=2, amp=1.0, loop=True):
    """Jelly: every blob squashes and stretches (volume kept) and sways, each on its own phase, the drips swing
    after their blobs. Whole cycles, so loops are seamless."""
    tr = []
    for k, j in enumerate(JELLY):
        ph = (k * 0.137) % 1.0
        tr.append(osc(j, None, [0.07 * amp, -0.08 * amp, 0.07 * amp], cycles, ph, ch="scale"))
        tr.append(osc(j, "x", 5 * amp, cycles, ph + 0.2))
        tr.append(osc(j, "z", 4 * amp, max(1, cycles - 1) if loop else cycles * 0.7, ph + 0.45))
    for k, d in enumerate(JELLY_DRIPS):
        tr.append(osc(d, "x", 9 * amp, cycles, (k * 0.21 + 0.3) % 1.0))
    return tr


def splash(t0, amp=1.0, length=None, freq=7.0, decay=5.0, parts=None):
    """A decaying jiggle on every jelly blob after an impact at t0 (squash first, then ringing)."""
    tr = []
    for k, j in enumerate(parts or JELLY):
        ks_s, ks_r = [[0.0, [0, 0, 0]], [round(t0, 4), [0, 0, 0]]], [[0.0, [0, 0, 0]], [round(t0, 4), [0, 0, 0]]]
        n, end = 0, length if length is not None else 1e9
        while True:
            t = t0 + (n + 1) * 0.5 / freq
            a = amp * math.exp(-decay * (t - t0)) * (-1 if n % 2 == 0 else 1)
            if t >= end - 0.02 or abs(a) < 0.04:
                break
            ks_s.append([round(t, 4), [round(-0.14 * a, 3), round(0.16 * a, 3), round(-0.14 * a, 3)]])
            ks_r.append([round(t, 4), [round(10 * a * (1 if k % 2 else -1), 2), 0, round(6 * a, 2)]])
            n += 1
        t = min(t, end)
        ks_s.append([round(t, 4), [0, 0, 0]])
        ks_r.append([round(t, 4), [0, 0, 0]])
        tr.append({"part": j, "channel": "scale", "keys": ks_s, "ease": "smooth"})
        tr.append({"part": j, "channel": "rotation", "keys": ks_r, "ease": "smooth"})
    return tr


REST = {}
# idle carries the ready stance (knees soft, a slight hunch); the game always plays idle and walk together and starts
# the one-shot clips on top of them, so walk and every one-shot clip are deltas from the rest pose (no stance of their
# own, or it would be counted twice). dazed replaces idle and walk, so it is a full pose.
STANCE = add(leg(1, -4, 8, -4, 2), leg(-1, -4, 8, -4, 2), r("body", 2), r("chest", 2))

# ---------------------------------------------------------------- idle: heavy breathing, jelly wobble, look around
ANIM = {}
L = 3.0
ANIM["idle"] = timeline(L, [(0.0, STANCE, None), (L, STANCE, None)], loop=True, extra=wobble(L, 3, 1.0) + [
    osc("chest", None, [0.025, 0.02, 0.03], 2, 0.0, ch="scale"),
    osc("chest", "x", -1.5, 2, 0.05),
    osc("traps", None, [0.02, 0.05, 0.02], 2, 0.1, ch="scale"),
    osc("arm_l", "x", 3, 2, 0.15), osc("arm_r", "x", 3, 2, 0.2),
    osc("arm_l", "z", 2.5, 2, 0.1), osc("arm_r", "z", -2.5, 2, 0.1),
    osc("forearm_l", "x", -3, 2, 0.25), osc("forearm_r", "x", -3, 2, 0.3),
    {"part": "head", "axis": "y", "keys": [[0, 0], [0.6, 16], [1.2, 16], [1.7, -12], [2.4, -12], [3.0, 0]],
     "ease": "smooth"},
    osc("head", "x", 2, 2, 0.3),
    {"part": "head", "axis": "z", "keys": [[0, 0], [0.7, -5], [1.2, -5], [1.8, 4], [2.4, 4], [3.0, 0]], "ease": "smooth"},
    osc("fist_l", "z", 3, 1, 0.0), osc("fist_r", "z", -3, 1, 0.5),
])

# ---------------------------------------------------------------- walk: a heavy stomp, shoulders rolling, jelly bouncing
L = 1.6
WALK_LEG = [(0.0, (-24, 6, 10)), (0.25, (-6, 4, 2)), (0.5, (20, 10, -8)), (0.62, (12, 46, -12)),
            (0.8, (-18, 34, 6))]
WALK_ARM = [(0.0, (22, -14)), (0.5, (-20, -26))]


def walk_tracks(L):
    tr = []
    for s, ph in ((1, 0.0), (-1, 0.5)):
        n = "l" if s > 0 else "r"
        for j, nm in enumerate(("leg", "shin", "foot")):
            tr.append(cycle(f"{nm}_{n}", L, [(u, [v[j], 0, 0]) for u, v in WALK_LEG], ph))
        tr.append(cycle(f"arm_{n}", L, [(u, [v[0], 0, s * 6]) for u, v in WALK_ARM], ph))
        tr.append(cycle(f"forearm_{n}", L, [(u + 0.08, [v[1], 0, 0]) for u, v in WALK_ARM], ph))
    return tr


ANIM["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True,
                        extra=walk_tracks(L) + wobble(L, 2, 1.0) + [
                            osc("chest", "y", 7, 1, 0.0), osc("chest", "z", 3, 1, 0.25),
                            osc("body", "y", -4, 1, 0.0), osc("body", "z", -3, 1, 0.25),
                            osc("chest", "x", 2.5, 2, 0.15, bias=4), osc("head", "x", -2, 2, 0.25),
                            osc("head", "y", -5, 1, 0.05),
                            osc("chest", None, [0.02, -0.03, 0.02], 2, 0.0, ch="scale", shape="bounce")])

# ---------------------------------------------------------------- attack: a double-fist hammer slam
WIND = add(r("chest", -18), r("body", -4), r("head", -12), arm(1, -168, 18, 0, -40, -20),
           arm(-1, -168, 18, 0, -40, -20), leg(1, -10, 16, -6), leg(-1, 4, 10, -6), sc("chest", 0.04, 0.06, 0.04))
SLAM = add(r("chest", 30), r("body", 8), r("head", 16), arm(1, -42, 6, 0, -10, 10), arm(-1, -42, 6, 0, -10, 10),
           leg(1, -26, 34, -8), leg(-1, 12, 22, -14), pos("body", 0, 0, 3), sc("chest", 0.06, -0.08, 0.06))
ANIM["attack"] = timeline(0.6, [(0.0, REST, None), (0.2, WIND, "out"), (0.25, add(WIND, r("chest", -3)), "ease"),
                                (0.33, SLAM, "in"), (0.42, add(SLAM, r("chest", 3), arm(1, 4), arm(-1, 4)), "out"),
                                (0.6, REST, "ease")],
                          extra=wobble(0.6, 1, 0.5, loop=False) + splash(0.33, 1.0, 0.6))

# ---------------------------------------------------------------- slash: the blade arm sweeps across in a wide arc
SLASH_WIND = add(r("chest", -6, -38, -4), r("body", 0, -10), r("head", 0, 26), arm(-1, -60, 74, -10, -50, 0, 20),
                 arm(1, -20, 10, 0, -30), leg(1, -14, 14, -4, 4), leg(-1, 10, 8, -4, 4))
SLASH_HIT = add(r("chest", 10, 30, 4), r("body", 4, 12), r("head", 6, -20), arm(-1, -84, 6, 30, -6, 0, -20),
                arm(1, 10, 18, 0, -10), leg(1, -20, 26, -6, 4), leg(-1, 16, 16, -8, 4), pos("body", 0, 0, 2))
SLASH_FOLLOW = add(r("chest", 12, 44, 6), r("body", 4, 16), r("head", 4, -28), arm(-1, -60, -24, 50, -20, 0, -30),
                   arm(1, 14, 22, 0, -10), leg(1, -18, 24, -6, 4), leg(-1, 14, 16, -8, 4), pos("body", 0, 0, 2))
ANIM["slash"] = timeline(0.7, [(0.0, REST, None), (0.24, SLASH_WIND, "out"),
                               (0.3, add(SLASH_WIND, r("chest", 0, -4)), "ease"),
                               (0.38, SLASH_HIT, "in"), (0.48, SLASH_FOLLOW, "out"), (0.7, REST, "ease")],
                         extra=wobble(0.7, 1, 0.5, loop=False) + splash(0.4, 0.8, 0.7))

# ---------------------------------------------------------------- mine: the pickaxe fist swings overhead and strikes
MINE_UP = add(r("chest", -14, -10), r("head", -8), arm(-1, -176, 6, 0, -50, -30), arm(1, -30, 14, 0, -40),
              leg(1, -12, 16, -4), leg(-1, 8, 10, -4))
MINE_HIT = add(r("chest", 26, 4), r("body", 8), r("head", 14), arm(-1, -58, 4, 0, -8, 20), arm(1, -20, 16, 0, -24),
               leg(1, -24, 32, -8), leg(-1, 12, 22, -12), sc("chest", 0.05, -0.06, 0.05))
ANIM["mine"] = timeline(0.8, [(0.0, REST, None), (0.3, MINE_UP, "out"), (0.36, add(MINE_UP, arm(-1, -4)), "ease"),
                              (0.44, MINE_HIT, "in"), (0.52, add(MINE_HIT, r("chest", 2), arm(-1, 6)), "out"),
                              (0.8, REST, "ease")],
                        extra=wobble(0.8, 1, 0.5, loop=False) + splash(0.44, 0.9, 0.8) +
                        [jitter("fist_r", 0.44, 0.56, 5, step=0.03, axis=2, seed=3)])

# ---------------------------------------------------------------- shoot: raise the bow arm, draw, hold, loose, recoil
AIM = add(r("chest", 0, 30), r("head", 0, -26), arm(1, -84, 0, -10, -6, 0, 0), arm(-1, -84, -12, 0, -30),
          leg(1, -12, 10, -4, 6), leg(-1, 10, 10, -4, 6))
DRAW = add(AIM, arm(-1, 6, 24, 0, -96, 0), r("chest", -2, 6), sc("chest", 0.04, 0.03, 0.04))
LOOSE = add(AIM, arm(1, -10, 0, 0, -4), arm(-1, 26, 48, 0, -40), r("chest", -4, 10), r("head", -4))
ANIM["shoot"] = timeline(0.8, [(0.0, REST, None), (0.16, AIM, "out"), (0.42, DRAW, "ease"), (0.52, DRAW, None),
                               (0.56, LOOSE, "out"), (0.64, add(LOOSE, arm(1, 4)), "ease"), (0.8, REST, "ease")],
                         extra=wobble(0.8, 1, 0.5, loop=False) + splash(0.56, 0.6, 0.8) +
                         [jitter("arm_l", 0.42, 0.54, 1.2, step=0.03, axis=0, seed=4)])

# ---------------------------------------------------------------- howl: gather, rise up and roar at the sky, trembling
GATHER = add(r("chest", 22), r("body", 6), r("head", 24), arm(1, -20, -10, 0, -60), arm(-1, -20, -10, 0, -60),
             leg(1, -18, 30, -10), leg(-1, -18, 30, -10), sc("chest", -0.03, -0.04, -0.03))
HOWL = add(r("chest", -24), r("body", -6), r("head", -46), arm(1, -30, 70, 0, -30, -10), arm(-1, -30, 70, 0, -30, -10),
           leg(1, -6, 6, -2, 6), leg(-1, -6, 6, -2, 6), sc("chest", 0.08, 0.1, 0.08), sc("traps", 0.1, 0.16, 0.08))
ANIM["howl"] = timeline(1.5, [(0.0, REST, None), (0.3, GATHER, "ease"), (0.5, HOWL, "out_back"),
                              (1.15, add(HOWL, r("head", -4), r("chest", -2)), "ease"), (1.5, REST, "ease")],
                        extra=wobble(1.5, 3, 0.5, loop=False) + splash(0.5, 0.8, 1.5, decay=2.5) + [
                            jitter("head", 0.55, 1.15, 2.0, step=0.04, axis=2, seed=5),
                            jitter("chest", 0.55, 1.15, 0.03, step=0.04, axis=0, ch="scale", seed=6),
                            jitter("chest", 0.55, 1.15, 1.2, step=0.04, axis=1, seed=7)])

# ---------------------------------------------------------------- beam: brace, charge (swelling), a long sonic blast
CHARGE = add(r("chest", -10), r("head", -18), arm(1, -10, 30, 0, -50), arm(-1, -10, 30, 0, -50), leg(1, -10, 18, -6, 8),
             leg(-1, 10, 14, -6, 8), sc("chest", 0.1, 0.08, 0.12), sc("traps", 0.12, 0.14, 0.1))
BLAST = add(r("chest", 18), r("head", 16), r("body", 4), arm(1, 30, 40, 0, -20, 10), arm(-1, 30, 40, 0, -20, 10),
            leg(1, -18, 24, -8, 8), leg(-1, 16, 16, -10, 8), pos("body", 0, 0, -1.5), sc("chest", -0.04, -0.04, -0.02))
ANIM["beam"] = timeline(1.2, [(0.0, REST, None), (0.4, CHARGE, "ease"), (0.46, BLAST, "out"),
                              (0.92, add(BLAST, r("chest", 2)), "ease"), (1.2, REST, "ease")],
                        extra=wobble(1.2, 2, 0.5, loop=False) + splash(0.46, 1.0, 1.2, decay=3.0) + [
                            jitter("chest", 0.5, 0.92, 1.5, step=0.03, axis=1, seed=8),
                            jitter("head", 0.5, 0.92, 2.5, step=0.03, axis=0, seed=9),
                            jitter("chest", 0.12, 0.4, 0.02, step=0.04, axis=0, ch="scale", seed=10)])

# ---------------------------------------------------------------- giggle: a ticklish shimmy, hands on the belly
TICKLE = add(r("chest", 10), r("body", 2), r("head", 8), arm(1, -24, -18, 0, -84, 0, 20), arm(-1, -24, -18, 0, -84, 0, 20),
             leg(1, -10, 18, -8), leg(-1, -10, 18, -8), sc("traps", 0.05, 0.1, 0.03))
ANIM["giggle"] = timeline(1.0, [(0.0, REST, None), (0.15, TICKLE, "out"), (0.85, TICKLE, None), (1.0, REST, "ease")],
                          extra=wobble(1.0, 6, 0.9, loop=False) + [
                              osc("chest", "z", 7, 5, 0.0), osc("chest", "y", 9, 5, 0.25),
                              osc("body", "z", -4, 5, 0.1), osc("head", "z", 9, 5, 0.3), osc("head", "x", 5, 10, 0.0),
                              osc("arm_l", "z", 6, 5, 0.1), osc("arm_r", "z", -6, 5, 0.1),
                              osc("chest", None, [0.03, 0.05, 0.03], 10, 0.0, ch="scale", shape="bounce"),
                              osc("shin_l", "x", 6, 5, 0.0), osc("shin_r", "x", 6, 5, 0.5)],
                          lift=[[0, 0], [0.15, 0], [0.25, 0.6], [0.35, 0], [0.45, 0.6], [0.55, 0], [0.65, 0.6],
                                [0.75, 0], [1.0, 0]])

# ---------------------------------------------------------------- sneeze: ah... ah... AH... CHOO! (the pot flies off)
AH1 = add(r("chest", -8), r("head", -16), arm(1, -10, 10, 0, -20), arm(-1, -10, 10, 0, -20), sc("chest", 0.04, 0.04, 0.05))
AH2 = add(r("chest", -16), r("body", -3), r("head", -30), arm(1, -24, 22, 0, -40), arm(-1, -24, 22, 0, -40),
          leg(1, -6, 6, -2), sc("chest", 0.08, 0.08, 0.1), sc("traps", 0.06, 0.1, 0.04))
AH3 = add(r("chest", -26), r("body", -6), r("head", -44), arm(1, -60, 40, 0, -70, -20), arm(-1, -60, 40, 0, -70, -20),
          leg(1, -10, 10, -4), leg(-1, 6, 6, -2), sc("chest", 0.13, 0.12, 0.16), sc("traps", 0.12, 0.18, 0.08))
CHOO = add(r("chest", 38), r("body", 12), r("head", 40), arm(1, -78, 30, 0, -16, 20), arm(-1, -78, 30, 0, -16, 20),
           leg(1, -30, 36, -10), leg(-1, 18, 28, -14), pos("body", 0, 0, 2.5), sc("chest", 0.08, -0.12, 0.06))
ANIM["sneeze"] = timeline(1.0, [(0.0, REST, None), (0.12, AH1, "out"), (0.2, add(AH1, r("head", 4)), "ease"),
                                (0.32, AH2, "out"), (0.38, add(AH2, r("head", 3)), "ease"), (0.52, AH3, "out"),
                                (0.6, add(AH3, r("head", -3), sc("chest", 0.02, 0.02, 0.02)), "ease"),
                                (0.65, CHOO, "in"), (0.74, add(CHOO, r("chest", -4), r("head", 6)), "out"),
                                (1.0, REST, "ease")],
                          extra=wobble(1.0, 2, 0.4, loop=False) + splash(0.65, 1.6, 1.0, decay=4.0) + [
                              jitter("head", 0.52, 0.64, 2.5, step=0.03, axis=2, seed=11),
                              jitter("chest", 0.52, 0.64, 0.025, step=0.03, axis=1, ch="scale", seed=12)],
                          lift=[[0, 0], [0.62, 0], [0.68, 1.2, "out"], [0.76, 0, "in"], [1.0, 0]])

# ---------------------------------------------------------------- dazed: head lolling in circles, swaying on wobbly legs
DAZED = add(r("chest", 14), r("body", 4), r("head", 18), arm(1, -14, 10, 0, -12), arm(-1, -14, 10, 0, -12),
            leg(1, -8, 16, -6, 6), leg(-1, -8, 16, -6, 6))
L = 2.0
ANIM["dazed"] = timeline(L, [(0.0, DAZED, None), (L, DAZED, None)], loop=True, extra=wobble(L, 2, 0.8) + [
    osc("head", "z", 14, 1, 0.0), osc("head", "x", 10, 1, 0.25), osc("chest", "z", 6, 1, 0.1),
    osc("chest", "y", 5, 1, 0.35), osc("body", "z", -3, 1, 0.15),
    {"parts": ["arm_l", "forearm_l", "fist_l"], "wave": {"axis": "z", "amp": 5, "cycles": 1, "lag": 0.12,
                                                         "growth": 1.2}},
    {"parts": ["arm_r", "forearm_r", "fist_r"], "wave": {"axis": "z", "amp": 5, "cycles": 1, "lag": 0.12,
                                                         "growth": 1.2, "phase": 0.1}},
    osc("arm_l", "x", 6, 1, 0.4), osc("arm_r", "x", 6, 1, 0.9),
    osc("shin_l", "x", 8, 2, 0.0), osc("shin_r", "x", 8, 2, 0.5)])

# ---------------------------------------------------------------- fuse: hissing, trembling harder and harder, swelling up
CLUTCH = add(r("chest", 16), r("body", 4), r("head", 10), arm(1, -30, -16, 0, -80, 0, 16), arm(-1, -30, -16, 0, -80, 0, 16),
             leg(1, -14, 24, -10, 6), leg(-1, -14, 24, -10, 6), sc("chest", -0.03, -0.04, -0.03))
SWELL = add(r("chest", -10), r("head", -18), arm(1, -40, 60, 0, -30), arm(-1, -40, 60, 0, -30), leg(1, -6, 8, -4, 8),
            leg(-1, -6, 8, -4, 8), sc("chest", 0.2, 0.18, 0.22), sc("traps", 0.2, 0.24, 0.16), sc("body", 0.1, 0.06, 0.1))
fuse_shake = []
for k in range(14):
    t0 = 0.2 + k * 0.07
    a = 1.5 + k * 0.5
    fuse_shake.append([round(t0, 3), [0, 0, round(a * (1 if k % 2 else -1), 2)]])
ANIM["fuse"] = timeline(1.5, [(0.0, REST, None), (0.25, CLUTCH, "ease"), (1.1, add(CLUTCH, sc("chest", 0.08, 0.08, 0.08)),
                                                                             "ease"),
                              (1.38, SWELL, "out_back"), (1.5, SWELL, None)],
                        extra=wobble(1.5, 6, 0.8, loop=False) + [
                            {"part": "chest", "channel": "rotation",
                             "keys": [[0, [0, 0, 0]], [0.2, [0, 0, 0]]] + fuse_shake + [[1.2, [0, 0, 0]],
                                                                                         [1.5, [0, 0, 0]]],
                             "ease": "ease"},
                            jitter("head", 0.2, 1.2, 3.0, step=0.035, axis=2, seed=13),
                            {"part": "chest", "channel": "scale",
                             "keys": [[0, [0, 0, 0]], [0.3, [0, 0, 0]], [0.5, [0.05, 0.05, 0.05]], [0.6, [0, 0, 0]],
                                      [0.75, [0.07, 0.07, 0.07]], [0.82, [0, 0, 0]], [0.94, [0.09, 0.09, 0.09]],
                                      [0.99, [0, 0, 0]], [1.07, [0.11, 0.11, 0.11]], [1.11, [0, 0, 0]],
                                      [1.5, [0, 0, 0]]], "ease": "ease"}])


# ---------------------------------------------------------------- foot lock
def foot_lock(spec, step=1 / 60):
    """For every clip marked `_lock`: key the body's height so the lowest foot sits on the ground (plus `lift`)."""
    sys.path.insert(0, ROOT)
    from lowpix.anim import Animator, eval_keys
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points

    insts = expand_instances(spec["parts"], float(spec["density"]))
    feet = [i for i in insts if i.id in FEET]

    class _M:
        pass

    for name, clip in spec["animations"].items():
        lock = clip.pop("_lock", None)
        if lock is None:
            continue
        length, loop = float(clip["length"]), bool(clip.get("loop", False))
        body_pos = [tr for tr in clip["tracks"] if tr.get("part") == "body" and tr.get("channel") == "position"]
        others = [tr for tr in clip["tracks"] if tr not in body_pos]
        m = _M()
        m.instances = insts
        n = max(2, int(round(length / step)))
        keys = []
        for k in range(n + (0 if loop else 1)):
            t = length * k / n
            bp = np.zeros(3)
            for tr in body_pos:
                bp += eval_keys(tr["keys"], t, length, loop, tr.get("ease", "ease"), tr.get("axis"))
            bp[1] = 0.0
            tracks = others + [{"part": "body", "channel": "position", "keys": [[0, list(bp)], [length, list(bp)]],
                                "ease": "linear"}]
            m.spec = {"animations": {"_": {"length": length, "loop": loop, "tracks": tracks}}}
            W = Animator(m).world_matrices("_", t)
            lo = min(float(transform_points(W[i.id], f.pts)[:, 1].min()) for i in feet for f in i.faces)
            lift = float(eval_keys(lock["lift"], t, length, loop, "ease")[0]) if lock.get("lift") else 0.0
            bp[1] = -lo + lift
            keys.append([round(t, 4), [round(float(v), 3) for v in bp]])
        clip["tracks"] = others + [{"part": "body", "channel": "position", "keys": keys, "ease": "linear"}]


# translucent jelly amber in the game (the renderer draws the golem with a translucent render type): every amber part
# gets an opacity, the darker core and bright rims painted under it; the arm tools (blade, pickaxe, bow and their
# bindings) and the terracotta sherds stay opaque
ALPHA = {"amber": 0.82, "amber_dark": 0.84, "amber_pec": 0.82, "amber_abs": 0.82, "amber_fist": 0.84, "knuckle": 0.84,
         "jelly": 0.72, "drip": 0.7, "crystal": 0.7, "crystal_b": 0.7, "face": 0.85}


def alpha_parts():
    parent = {p["id"]: p.get("parent") for p in P}

    def tool(pid):
        while pid:
            if pid in ("blade", "pickaxe", "bow"):
                return True
            pid = parent.get(pid)
        return False

    return {p["id"]: ALPHA[p["style"]] for p in P
            if p["shape"] != "bone" and p.get("style") in ALPHA and not tool(p["id"])}


spec = {
    "name": "Pot Golem",
    "description": "The Winterworks Pot Golem: a giant, muscular, slightly jelly-like amber humanoid (translucent-looking, "
                   "painted opaque: dark core, bright edges, trapped bubbles, a fossil leaf, a seed and a mosquito) "
                   "with wobbly jelly blobs and drips, amber crystal growths, stuck-in sherds and huge fists. The "
                   "`head` bone is the seat of the real decorated pot (drawn by the game); `face` is the potless dumb "
                   "face. Arm attachments blade, pickaxe and bow are shown only when equipped. Minecraft pixel units, "
                   "density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 2400, "colors": 96},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 20, "alpha_parts": alpha_parts()},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#1f2a2c", "hero": [-38, 16], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "pot_golem.json")
    sys.path.insert(0, ROOT)
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points
    lo = min(float(transform_points(i.world, f.pts)[:, 1].min()) for i in expand_instances(P, 1.0) for f in i.faces)
    P[0]["pivot"][1] = round(P[0]["pivot"][1] - lo, 4)
    foot_lock(spec)
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts", f"(lifted {-lo:+.3f})")
