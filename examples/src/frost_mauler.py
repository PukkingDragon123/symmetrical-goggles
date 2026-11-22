"""Builds examples/frost_mauler.json: the Frost Mauler, the Winterworks Cold Zone boss.

    python examples/src/frost_mauler.py examples/frost_mauler.json

A huge furry beast between a dire wolf and a giant bear, half dead and half frozen: deep slate-blue to indigo fur
with cyan frost tips, a heavy pale mane over the neck and shoulders, tall ice crystal clusters erupting from its back
and left shoulder, a left foreleg sheathed in ice plates, an icy tail club; the right half of its face is bare skull
(a dark socket round a glowing eye), its right flank is torn open to a cage of bare ribs over a dark cavity where a
frost core glows, the tail's middle is bare vertebrae. Two massive sabre fangs, long splayed toes with dark horn claws.

Units are Minecraft pixels (16 per block), density 1, and every box is a whole number of pixels, so the model exports
1:1 to a vanilla entity model (python -m lowpix mc export). Fur fringes, ribs, teeth and whiskers are alpha-cut cards
(zero-thickness cubes in Minecraft). Faces +Z, ground at y=0, "right" is -X.

Part contract (mods/winterworks/docs/COLD_UPDATE.md section 7): body (root), chest, hips, neck, head, jaw, fang_l,
fang_r, eye_l, eye_r (glow), front_leg_l/r, front_paw_l/r, back_leg_l/r, back_paw_l/r, tail, tail_tip. Extra joints:
front_fore_l/r (forearm, between leg and paw), back_shin_l/r (between leg and paw), tail_mid (between tail and
tail_tip), frost_core (glow). Clips: idle, walk, run, roar, claw_l, claw_r, fury, stunned, wake, frozen, death.

Every clip is keyed as a pose timeline; the body's height is then solved per frame so the lowest point of the model
sits on the ground (feet planted while standing, belly or flank on the ground when collapsed), plus an explicit lift
for airborne moments (the gallop's flight, the fury bounce).
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
    return part(id, parent, None, "fur", shape="bone", **kw)


def card(id, parent, art, style, plane="yz", **kw):
    return part(id, parent, None, style, shape="card", plane=plane, art=art, **kw)


def wpos(id, local):
    """World position of a point given in part `id`'s frame."""
    R, t = FRAMES[id]
    return t + R @ np.array(local, float)


def M(v, s):
    """Mirror a position across X for side s (+1 left, -1 right)."""
    return (v[0] * s, v[1], v[2])


def MR(r, s):
    """Mirror a rotation across X for side s."""
    return (r[0], r[1] * s, r[2] * s)


# ----------------------------------------------------------------------- card art: shaggy pixel-cut fur
def locks(w, h, seed, up=False, fill=0.9, min_len=0.3, tip="t", mid="m"):
    """Hanging (or, with up, standing) fur: pointed locks of random length, frosted at the tips."""
    rng = random.Random(seed)
    lens = [0] * w
    x = 0
    while x < w:
        lw = rng.choice((2, 3, 3, 4))
        if rng.random() < fill:
            L = rng.uniform(min_len, 1.0) * h
            prof = {2: [0.8, 1.0], 3: [0.7, 1.0, 0.8], 4: [0.6, 0.9, 1.0, 0.7]}[lw]
            if rng.random() < 0.5:
                prof = prof[::-1]
            for k in range(lw):
                if x + k < w:
                    lens[x + k] = max(1, int(round(L * prof[k])))
        x += lw
    rows = [["."] * w for _ in range(h)]
    for cx, L in enumerate(lens):
        for k in range(L):
            ch = tip if k == L - 1 else (mid if k == L - 2 and L > 3 else "f")
            rows[(h - 1 - k) if up else k][cx] = ch
    return ["".join(r) for r in rows]


def spikes(w, h, seed, tip="t", mid="m"):
    """Standing jagged spines (a crest): narrow triangles of random height."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    x = 0
    while x < w:
        sw = rng.choice((2, 3, 3))
        H = int(round(rng.uniform(0.45, 1.0) * h))
        for k in range(H):
            frac = k / max(H - 1, 1)
            half = (sw / 2) * (1 - frac)
            for cx in range(x, min(w, x + sw)):
                if abs(cx - (x + (sw - 1) / 2)) <= half + 0.01:
                    rows[h - 1 - k][cx] = tip if k >= H - 1 else (mid if k >= H - 2 and H > 3 else "f")
        x += sw - 1 + rng.choice((0, 1))
    return ["".join(r) for r in rows]


# old claw scars: three pale parallel rakes with a dark lip
SCAR = ["s.s.s....", "ds.s.s...", ".ds.s.s..", "..ds.s.s.", "...ds.s.s", "....d.d.d"]
SCAR_KEY = {"s": "mane:9", "d": "fur:1"}


# ======================================================================= torso: body (root), chest, hips
# A sabre-toothed cat's build: a long muscular trunk, a deep chest, high powerful shoulders, a tucked waist and
# lower haunches. The root joint sits between the hip joints, so rearing up pivots about the hind legs.
part("body", None, [20, 16, 26], "fur_torn", at=(0, 21, -21), centre=(1.5, 22, -6))
# the right flank is torn open: a fur roof along the spine and a strip of belly fur frame a dark cavity
part("roof_r", "body", [6, 5, 26], "fur_bitten", centre=(-9.5, 28.5, -6), rot=(0, 0, 8))
part("belly_r", "body", [5, 4, 24], "fur_bitten", centre=(-8.5, 15.5, -6), rot=(0, 0, -6))
part("frost_core", "body", [3, 6, 7], "core", centre=(-8.5, 22, -7), rot=(0, 0, 4))
for k, z in enumerate((-16.5, -12.6, -8.7, -4.8, -0.9, 3.0)):
    h = 13 if 0 < k < 5 else 11
    art = ["bb...", ".bb..", ".bbb.", "..bb.", "..bbb", "...bb", "...bb", "..bbb", "..bb.", ".bbb.", ".bb..",
           "bb...", "b...."][:h]
    card(f"rib{k}", "body", art, "rib", at=(-11.7, 27.6, z), offset=(0, -h / 2 + 0.5, 0),
         rot=(0, 180 + (6 if k % 2 else -6), -7))
card("belly_fringe_l", "body", locks(25, 6, 11), "fringe", at=(11.6, 14.5, -6), offset=(0, -2.5, 0), rot=(0, 0, 8))
card("belly_fringe_r", "body", locks(23, 5, 12), "fringe", at=(-11.1, 14.0, -6), offset=(0, -2, 0), rot=(0, 0, -8))
card("roof_fringe_r", "roof_r", locks(25, 4, 13, min_len=0.5), "fringe", rel=(-3.1, -2.1, 0), offset=(0, -1.5, 0),
     rot=(0, 0, -12))
part("shag_body", "body", [13, 3, 11], "fur", at=(5, 30.4, -2), rot=(-8, -6, -8))
part("shag_body_b", "body", [12, 3, 10], "fur", at=(4, 30.0, -13), rot=(-10, 5, -6))

# chest: deep and barrel-shaped, the shoulders standing high over the heavy forelegs
part("chest", "body", [24, 24, 20], "fur_body", at=(0, 23, 5), centre=(0, 23, 14), rot=(-6, 3, -1.5),
     paint={"stamps": [{"face": "right", "at": [5, 5], "art": SCAR, "key": SCAR_KEY}]})
part("brisket", "chest", [16, 6, 9], "mane_dark", centre=(0, 12.5, 19), rot=(22, 0, 0))
card("brisket_fringe", "brisket", locks(17, 8, 21), "fringe", rel=(0, -2.6, 4.65), offset=(0, -3.5, 0),
     plane="xy", rot=(-16, 0, 0))
card("chest_fringe_l", "chest", locks(16, 6, 22), "fringe", at=(12.1, 12.5, 14), offset=(0, -2.5, 0), rot=(0, 0, 10))
card("chest_fringe_r", "chest", locks(16, 6, 23), "fringe", at=(-12.1, 12.5, 14), offset=(0, -2.5, 0), rot=(0, 0, -10))

# hips: lower haunches, sloping down to a short bobbed tail
part("hips", "body", [20, 17, 16], "fur_body", at=(0, 23, -18), centre=(0, 21.5, -26), rot=(-9, -4, 1.5),
     paint={"stamps": [{"face": "left", "at": [3, 4], "art": SCAR, "key": SCAR_KEY}]})
part("shag_hips", "hips", [13, 3, 10], "fur", at=(0, 29.5, -26), rot=(-14, 0, 0))
card("rump_fringe", "hips", locks(16, 6, 31), "fringe", at=(0, 19, -34.2), offset=(0, -2.5, 0), plane="xy",
     rot=(-12, 0, 0))
card("hip_fringe_l", "hips", locks(14, 5, 32), "fringe", at=(10.1, 14.5, -26), offset=(0, -2, 0), rot=(0, 0, 8))
card("hip_fringe_r", "hips", locks(14, 5, 33), "fringe", at=(-10.1, 14.5, -26), offset=(0, -2, 0), rot=(0, 0, -8))
for k, z in enumerate((-20.5, -24.5, -28.5)):     # the bare spine over the right haunch
    part(f"vert_hip{k}", "hips", [3, 2, 3], "bone", centre=(-3.5, 30.4 - k * 0.7, z), rot=(-9, 0, 0))
    card(f"vert_hip{k}_spine", f"vert_hip{k}", ["b.", "bb", "bb"], "bone", rel=(0, 2.4, 0), plane="yz", rot=(-25, 0, 0))

# ======================================================================= the ruff: pale shaggy fur over neck and shoulders
part("mane", "chest", [22, 6, 13], "mane_dark", centre=(0, 34.5, 12), rot=(-14, 0, 0))
MANE_TUFTS = [  # (x, y, z, rx, ry, rz, w, h, d): shaggy locks fanning round the shoulders, each tilted its own way
    (-12, 30, 13, -14, 14, 32, 5, 10, 7), (12, 30, 13, -14, -14, -32, 5, 10, 7),
    (-7, 35.5, 9, -30, 8, 18, 8, 7, 7), (7, 35.5, 9, -30, -8, -18, 8, 7, 7),
    (0, 37, 6, -40, 0, 0, 9, 6, 7), (-10, 34, 3, -22, 22, 26, 6, 7, 6), (10, 34, 3, -22, -22, -26, 6, 7, 6),
    (0, 35, 17, -10, 0, 0, 12, 6, 6),
]
for k, (x, y, z, rx, ry, rz, w, h, d) in enumerate(MANE_TUFTS):
    part(f"mane{k}", "chest", [w, h, d], "mane" if k % 2 else "mane_dark", centre=(x, y, z), rot=(rx, ry, rz))
for k, (x, y, z, rx, ry, rz, w, h, d) in enumerate(MANE_TUFTS):
    if k in (4, 7):
        card(f"mane{k}_fringe", f"mane{k}", locks(w + 2, 7, 40 + k), "mane_fringe", rel=(0, -h / 2 + 1, d / 2 + 0.15),
             offset=(0, -3, 0), plane="xy", rot=(12, 0, 0))
    else:
        s = 1 if x >= 0 else -1
        card(f"mane{k}_fringe", f"mane{k}", locks(d + 3, 8, 40 + k), "mane_fringe",
             rel=(s * (w / 2 + 0.15), -h / 2 + 1.5, 0), offset=(0, -3.5, 0), rot=(0, 0, s * 8))
    if k in (0, 1, 5, 6):
        card(f"mane{k}_spikes", f"mane{k}", spikes(7, 5, 140 + k), "mane_spikes", rel=(0, h / 2, 0), offset=(0, 2.5, 0),
             rot=(-15, 0, 0))
card("mane_crest", "mane", spikes(18, 7, 51), "mane_spikes", rel=(0, 2.9, -3), offset=(0, 3.5, 0), rot=(-20, 0, 0))


# ======================================================================= ice: big crystal clusters erupting from the back
def cluster(name, parent, at, crystals, wrot_base=(0, 0, 0)):
    """crystals: [(dx, dz, w, h, rx, rz)] tall prisms fanning out of one root."""
    bone(name, parent, at=at, wrot=wrot_base)
    for k, (dx, dz, w, h, rx, rz) in enumerate(crystals):
        cid = f"{name}_{k}"
        part(cid, name, [w, h, w], "crystal" if k % 2 == 0 else "crystal_b", rel=(dx, -1.5, dz), offset=(0, h / 2, 0),
             rot=(rx, (k * 37) % 50 - 25, rz))
        if h >= 9:   # a smaller tip crystal riding up the side of the big ones
            part(f"{cid}_tip", cid, [max(1, w - 2), h // 2, max(1, w - 2)], "crystal_b",
                 rel=(w / 2 - 0.5, h * 0.55, 0), offset=(0, h / 4, 0), rot=(0, 0, -24))


cluster("ice_back0", "chest", (2, 36.5, 2), [(0, 0, 5, 21, -22, 4), (-3.5, 1, 4, 15, -16, 24), (3.5, -1, 3, 13, -32, -20),
                                             (0, -3.5, 3, 9, -50, 8), (-2, 3, 2, 7, 8, 30)])
cluster("ice_back1", "body", (-1, 30.5, -7), [(0, 0, 5, 17, -26, -6), (3, 1.5, 3, 11, -12, -28), (-3, -1, 3, 9, -40, 20)])
cluster("ice_back2", "hips", (1, 28.5, -23), [(0, 0, 4, 12, -34, 6), (-2.5, 0.5, 3, 8, -20, 26), (2.5, -1, 2, 6, -48, -22)])
# a crest of dark horn spikes and short fur spines along the spine between the clusters
for k, (par, at, h, rx) in enumerate((("chest", (0, 35.0, -1), 6, -34), ("body", (0, 30.6, 1.5), 5, -30),
                                      ("body", (0, 30.4, -14.5), 6, -36), ("hips", (0, 29.6, -19), 5, -40),
                                      ("hips", (0, 28.4, -30), 4, -46))):
    part(f"spine_spike{k}", par, [2, h, 3], "horn_spike", at=at, offset=(0, h / 2, 0), rot=(rx, 0, (k % 2 * 2 - 1) * 6))
card("spine_fur0", "body", spikes(16, 5, 61), "fur_spikes", at=(0, 30.8, -2), offset=(0, 2.5, 0), rot=(-6, 0, 0))
card("spine_fur1", "hips", spikes(12, 4, 62), "fur_spikes", at=(0, 29.6, -27), offset=(0, 2, 0), rot=(-10, 0, 0))
card("spine_fur2", "chest", spikes(12, 6, 138), "fur_spikes", at=(-1, 35.5, 3.5), offset=(0, 3, 0), rot=(-16, 0, 6))

# the left shoulder is sheathed in ice: a plate with crystals bursting out of it
part("ice_shoulder", "chest", [3, 13, 15], "ice_plate", centre=(13.4, 26, 13), rot=(-6, 0, 14))
cluster("ice_shoulder_c", "ice_shoulder", (14.5, 30, 12), [(0, 0, 4, 14, -18, -34), (0, 3.5, 3, 10, 8, -48),
                                                           (0, -3.5, 3, 8, -40, -20)])

# ======================================================================= legs: massive forelimbs, digitigrade hind legs
FRONT_BOTTOM = []     # the front paws' soles: the hind legs are sized to stand on the same ground


def front_leg(s):
    n = "l" if s > 0 else "r"
    up = part(f"front_leg_{n}", "chest", [11, 16, 13], "fur_leg", at=M((12.5, 23, 14), s), offset=(0, -5.5, 0),
              rot=MR((14, 0, 3), s))
    elbow = wpos(up["id"], (0, -12, 0))
    part(f"front_fore_{n}", up["id"], [10, 12, 10], "fur_leg", at=elbow, offset=(0, -5, 0.5), wrot=MR((-12, 0, 2), s))
    wrist = wpos(f"front_fore_{n}", (0, -10, 0.5))
    FRONT_BOTTOM.append(float(wrist[1]) - 4.0)
    part(f"front_paw_{n}", f"front_fore_{n}", [12, 5, 12], "paw_front", at=wrist,
         centre=(wrist[0], wrist[1] - 1.5, wrist[2] + 2.5), wrot=(0, 0, 0))
    # big round toes, each with a hooked horn claw unsheathed from it
    for k, (dx, yaw) in enumerate(((-4.2, 16), (-1.4, 5), (1.4, -5), (4.2, -16))):
        tid = f"front_toe_{n}{k}"
        part(tid, f"front_paw_{n}", [3, 3, 4], "paw", rel=(dx * s, -1.0, 6.0), offset=(0, 0, 1.0), rot=(0, -yaw * s, 0))
        part(f"front_claw_{n}{k}", tid, [1, 3, 3], "claw", rel=(0, 0.6, 2.6), offset=(0, -0.6, 1.2), rot=(42, 0, 0))
    part(f"elbow_spur_{n}", up["id"], [2, 6, 2], "horn_spike", rel=(s * 1.5, -10.5, -6), offset=(0, 3, 0), rot=(-120, 0, -s * 14))
    card(f"elbow_fringe_{n}", up["id"], locks(8, 6, 70 + s, min_len=0.5), "fringe", rel=(0, -8.5, -6.7),
         offset=(0, -2, 0), plane="xy", rot=(-25, 0, 0))
    card(f"wrist_fringe_{n}", f"front_fore_{n}", locks(10, 4, 72 + s), "fringe", rel=(s * 5.15, -6, 0),
         offset=(0, -1.5, 0), rot=(0, 0, s * 10))
    card(f"shoulder_fringe_{n}", up["id"], locks(12, 7, 130 + s, min_len=0.5), "fringe", rel=(s * 5.65, 0.5, 0),
         offset=(0, -3, 0), rot=(0, 0, s * 18))
    card(f"shoulder_spikes_{n}", up["id"], spikes(9, 5, 132 + s), "fur_spikes", rel=(s * 3, 2.2, 0),
         offset=(0, 2.5, 0), rot=(-10, 0, -s * 30))


def back_leg(s):
    n = "l" if s > 0 else "r"
    th = part(f"back_leg_{n}", "hips", [9, 16, 13], "fur_leg", at=M((9.5, 22, -24), s), offset=(0, -5.5, 1.5),
              wrot=MR((-28, 0, 2), s))
    part(f"haunch_{n}", th["id"], [10, 10, 14], "fur_body", rel=(s * 0.5, -1, 1), rot=(0, 0, 0))
    knee = wpos(th["id"], (0, -12, 0))
    # tibia, then the long raised metatarsus (back_paw) standing on its toes
    ls = (knee[1] - 11.3 - FRONT_BOTTOM[0]) / math.cos(math.radians(52))
    part(f"back_shin_{n}", th["id"], [6, round(ls) + 2, 7], "fur_leg", at=knee, offset=(0, -ls / 2, 0),
         wrot=MR((52, 0, 0), s))
    hock = wpos(f"back_shin_{n}", (0, -ls, 0))
    part(f"back_paw_{n}", f"back_shin_{n}", [6, 10, 6], "fur_leg", at=hock, offset=(0, -4.5, 0), wrot=(-12, 0, 0))
    end = wpos(f"back_paw_{n}", (0, -9, 0))
    part(f"back_toes_{n}", f"back_paw_{n}", [10, 4, 10], "paw_back", centre=(end[0], end[1] - 0.5, end[2] + 2.5),
         wrot=(0, 0, 0))
    for k, (dx, yaw) in enumerate(((-3.3, 14), (-1.1, 5), (1.1, -5), (3.3, -14))):
        tid = f"back_toe_{n}{k}"
        part(tid, f"back_toes_{n}", [2, 3, 3], "paw", rel=(dx * s, -0.5, 5.0), offset=(0, 0, 1.0), rot=(0, -yaw * s, 0))
        part(f"back_claw_{n}{k}", tid, [1, 2, 3], "claw", rel=(0, 0.4, 2.2), offset=(0, -0.4, 1.2), rot=(40, 0, 0))
    card(f"hock_fringe_{n}", f"back_shin_{n}", locks(6, 5, 80 + s, min_len=0.5), "fringe", rel=(0, -ls + 1, -3.65),
         offset=(0, -1.5, 0), plane="xy", rot=(-15, 0, 0))
    card(f"thigh_fringe_{n}", th["id"], locks(13, 5, 82 + s), "fringe", rel=(s * 5.2, -7.5, 1), offset=(0, -2, 0),
         rot=(0, 0, s * 8))


front_leg(1)
front_leg(-1)
back_leg(1)
back_leg(-1)
card("back_fringe_l", "body", locks(24, 6, 135), "fringe", at=(11.65, 30.0, -6), offset=(0, -2.5, 0), rot=(0, 0, 22))
card("shag_body_fringe", "shag_body", locks(11, 5, 136), "fringe", rel=(6.6, -1, 0), offset=(0, -2, 0), rot=(0, 0, 15))
card("shag_body_b_fringe", "shag_body_b", locks(10, 5, 137), "fringe", rel=(6.1, -1, 0), offset=(0, -2, 0),
     rot=(0, 0, 15))
# the left foreleg is sheathed in ice: plates on the outside and front, crystal spurs at the elbow and wrist
part("ice_arm_l", "front_leg_l", [2, 11, 10], "ice_plate", rel=(5.9, -4.5, 0), rot=(0, 0, 4))
part("ice_spur_l", "front_leg_l", [3, 9, 3], "crystal", rel=(5.2, -8.5, -3.5), offset=(0, 4.5, 0), rot=(-62, 0, -28))
part("ice_fore_l", "front_fore_l", [2, 8, 8], "ice_plate", rel=(5.3, -4.5, 0.5), rot=(0, 0, -3))
part("ice_shin_l", "front_fore_l", [7, 7, 2], "ice_plate", rel=(0.5, -4.5, 5.6), rot=(-4, 0, 0))
part("ice_wrist_l", "front_fore_l", [2, 6, 2], "crystal_b", rel=(5.4, -7, 3), offset=(0, 3, 0), rot=(30, 0, -40))

# ======================================================================= neck and head
part("neck", "chest", [16, 14, 16], "fur_neck", at=(0, 29, 20), centre=(0, 29, 27), wrot=(0, 0, 0))
part("throat", "neck", [12, 7, 9], "mane", rel=(0, -7, 2), rot=(-8, 0, 0))
part("neck_flesh", "neck", [17, 13, 3], "flesh", rel=(0, 0.5, 15.5))
for s in (1, -1):
    card(f"neck_fringe_{'l' if s > 0 else 'r'}", "neck", locks(12, 7, 150 + s), "mane_fringe", rel=(s * 8.15, -1, 0),
         offset=(0, -3, 0), rot=(0, 0, s * 12))
card("throat_fringe", "throat", locks(12, 8, 91), "mane_fringe", rel=(0, -3, 4.65), offset=(0, -3.5, 0), plane="xy",
     rot=(-5, 0, 0))
part("mane_neck", "neck", [19, 6, 13], "mane", rel=(0, 6.5, -1), rot=(-8, 0, 0))
card("mane_neck_fringe_l", "mane_neck", locks(14, 8, 92), "mane_fringe", rel=(9.65, -2.5, 0), offset=(0, -3.5, 0),
     rot=(0, 0, 10))
card("mane_neck_fringe_r", "mane_neck", locks(12, 6, 93), "mane_fringe", rel=(-9.65, -2.5, -1), offset=(0, -2.5, 0),
     rot=(0, 0, -10))
card("mane_neck_crest", "mane_neck", spikes(16, 6, 94), "mane_spikes", rel=(0, 3.1, 0), offset=(0, 3, 0), rot=(-10, 0, 0))

# the head: the whole head is a bare sabre-toothed cat's SKULL, bone white and ivory, cracked, a tall sagittal crest,
# heavy brow ridges over deep sockets where soul-fire burns, wide cheekbones, the dark nasal aperture, ice crystals
# growing out of the bone. Fur only from the neck back. Head frame: the cranium spans x -9..9, y -3.5..9.5, z -0.5..11.5.
part("head", "neck", [18, 13, 12], "skull", at=(0, 29.5, 34), offset=(0, 3, 5.5), wrot=(4, 0, 0))
part("crest", "head", [3, 4, 11], "skull", rel=(0, 10.5, 4), rot=(-10, 0, 0))
part("crest_back", "crest", [3, 3, 4], "skull", rel=(0, 0.6, -6.5), rot=(-24, 0, 0))
part("occiput", "head", [14, 9, 2], "skull_dark", rel=(0, 3.5, -1.2))
# soul eyes: a ghostly face-in-the-flame soul rising out of each socket, another streaming back along each temple
SOUL = ["...e...", "..eE...", "..EEe..", ".eEwEe.", "eEwWwEe", "EwfWfwE", "EwWWWwE", "eEwfwEe", ".eEwEe.", "..eWe..",
        "...W..."]
WISP = ["...eEe........", "..eEwEEe......", ".eEwfwwEEee.e.", "eEwWWWwwEEEe..", ".eEwfwEEee....", "..eEwEe.......",
        "...ee........."]
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"brow_{n}", "head", [7, 3, 4], "skull", rel=(s * 4.6, 7.9, 11.4), rot=(0, 0, s * 14))
    part(f"socket_{n}", "head", [5, 5, 1], "socket", rel=(s * 4.8, 5.0, 11.6))
    part(f"eye_{n}", "head", [2, 2, 1], "eye", rel=(s * 4.8, 5.0, 11.7))
    card(f"eye_{n}_flame", f"eye_{n}", SOUL, "flame", rel=(s * 0.3, 0.2, 2.0), offset=(0, 5.0, 0), plane="xy",
         rot=(0, 0, -s * 10))
    card(f"eye_{n}_wisp", f"eye_{n}", WISP, "flame", rel=(s * 4.7, 2.0, -1.0), offset=(0, 1.5, -6.0),
         rot=(0, s * 14, -s * 8))
    part(f"zygo_{n}", "head", [2, 4, 11], "skull", rel=(s * 9.5, 1.5, 6), rot=(0, -s * 5, -s * 4))
    part(f"temple_{n}", "head", [1, 4, 6], "socket", rel=(s * 9.1, 6.0, 4.5))
# the muzzle: short and broad bone, the nasal aperture, the tooth rows bare to the roots
part("snout", "head", [12, 7, 6], "skull", rel=(0, -1, 10.5), offset=(0, -0.5, 3), rot=(6, 0, 0))
part("nasal_bridge", "snout", [7, 2, 7], "skull", rel=(0, 3.0, 2.5), rot=(-8, 0, 0))
part("snout_tip", "snout", [10, 5, 3], "skull", rel=(0, -1.2, 5.5), offset=(0, -0.3, 1.5), rot=(4, 0, 0))
part("nasal", "snout_tip", [5, 3, 2], "socket", rel=(0, 1.4, 2.6))
for s in (1, -1):
    part(f"maxilla_{'l' if s > 0 else 'r'}", "snout", [1, 6, 6], "skull_dark", rel=(s * 6.1, -1.0, 3))
card("teeth_up_l", "snout", ["yyyyyy", "yyyyyy", "y.yy.y", "..y..."], "teeth", rel=(5.5, -4.0, 3), offset=(0, -2, 0))
card("teeth_up_r", "snout", ["yyyyyy", "yyyyyy", "y.yy.y", "..y..."], "teeth", rel=(-5.5, -4.0, 3), offset=(0, -2, 0))
card("teeth_up_f", "snout_tip", ["yyyyyyyy", "y.yy.yy.", "y.y..y.."], "teeth", rel=(0, -2.8, 2.8), offset=(0, -1.5, 0),
     plane="xy")
# the lower jaw: hinged far back so it can gape very wide, a bony flange at the chin sheathing the sabres
part("jaw", "head", [7, 3, 15], "skull", rel=(0, -3.5, 3.5), offset=(0, -1.5, 7.5), rot=(6, 0, 0))
for s in (1, -1):
    part(f"jaw_flange_{'l' if s > 0 else 'r'}", "jaw", [1, 4, 3], "skull", rel=(s * 3.0, -3.5, 13.5))
card("teeth_lo_l", "jaw", [".y...y...y....", "yy.yyy.yyy.yyy", "yyyyyyyyyyyyyy", "yyyyyyyyyyyyyy"], "teeth",
     rel=(3.4, 0.9, 7.5))
card("teeth_lo_r", "jaw", [".y...y...y....", "yy.yyy.yyy.yyy", "yyyyyyyyyyyyyy", "yyyyyyyyyyyyyy"], "teeth",
     rel=(-3.4, 0.9, 7.5))
card("teeth_lo_f", "jaw", [".y..y.", "yyyyyy"], "teeth", rel=(0, 0.9, 15.1), plane="xy")
# ice growing out of the bone: crystals bursting from the crown, a cheekbone and the brow
cluster("skull_ice0", "head", wpos("head", (5.5, 9.0, 2.5)), [(0, 0, 3, 9, -26, -30), (1.5, 2, 2, 6, -8, -50),
                                                               (-1, -1.5, 2, 5, -50, -14)])
cluster("skull_ice1", "head", wpos("head", (-9.6, 3.5, 7.5)), [(0, 0, 2, 7, 10, 62), (0, 2, 2, 5, 34, 74),
                                                                (0, -2.5, 1, 4, -20, 56)])
cluster("skull_ice2", "head", wpos("head", (-3.0, 9.4, 9.5)), [(0, 0, 2, 5, 18, 22), (1.2, -1, 1, 4, -10, -10)])

# the sabres: two enormous flattened blades curving back, reaching almost to the knees
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"fang_{n}", "head", [2, 9, 4], "fang", rel=(s * 4.6, -5.0, 14.5), offset=(0, -4.5, 0), rot=MR((-4, 0, 2), s))
    part(f"fang_{n}_mid", f"fang_{n}", [2, 6, 3], "fang", rel=(0, -9, -0.2), offset=(0, -3, 0), rot=(12, 0, 0))
    part(f"fang_{n}_tip", f"fang_{n}_mid", [1, 5, 2], "fang_tip", rel=(0, -6, -0.2), offset=(0, -2.5, 0), rot=(16, 0, 0))

# ======================================================================= tail: a short thick bobtail, bare vertebrae, an ice club
part("tail", "hips", [7, 7, 7], "fur_tail", at=(0, 26, -33.5), offset=(0, 0, -3), wrot=(-30, 8, 0))
card("tail_fringe_l", "tail", locks(8, 5, 123), "fringe", rel=(3.65, -1.5, -3), offset=(0, -2, 0), rot=(0, 0, 14))
card("tail_fringe_r", "tail", locks(8, 5, 124), "fringe", rel=(-3.65, -1.5, -3), offset=(0, -2, 0), rot=(0, 0, -14))
card("tail_crest", "tail", spikes(7, 4, 122), "fur_spikes", rel=(0, 3.6, -3), offset=(0, 2, 0))
part("tail_mid", "tail", [4, 4, 5], "bone", rel=(0, 0, -6), offset=(0, 0, -2.5), rot=(-12, 0, 0))
part("vert0", "tail_mid", [5, 4, 1], "bone", rel=(0, 0, -2))
card("vert0_spine", "vert0", ["b..", "bb.", "bbb"], "bone", rel=(0, 3.4, 0), plane="yz", rot=(-30, 0, 0))
part("tail_tip", "tail_mid", [6, 6, 6], "ice_club", rel=(0, 0, -5), offset=(0, 0, -2.5), rot=(-10, 0, 0))
for k, (rx, rz, h) in enumerate(((-60, 0, 7), (-40, 70, 6), (-40, -70, 6), (-120, 30, 5), (-110, -40, 5))):
    part(f"tail_spike{k}", "tail_tip", [2, h, 2], "crystal" if k % 2 == 0 else "crystal_b", rel=(0, 0, -3),
         offset=(0, h / 2 + 2, 0), rot=(rx, 0, rz))

# ======================================================================= palette: indigo fur, pale mane, ice, bone
ramps = {
    "fur": ["#090a17", "#0e1027", "#141836", "#1b2046", "#222a57", "#2b3567", "#354277", "#405186", "#4c6294",
            "#5b74a2", "#6c88ae", "#809dba", "#98b4c6"],
    "mane": ["#262b44", "#353c56", "#464e69", "#59617c", "#6d7690", "#838da5", "#9aa5b9", "#b2bccc", "#c9d2dd",
             "#dde4eb", "#edf2f6", "#f8fbfc"],
    "ice": ["#0b2440", "#113154", "#173f69", "#1f507f", "#2a6495", "#377aaa", "#4891bf", "#5ea9d0", "#7cc1de",
            "#a0d7ea", "#c8ecf5", "#effbfd"],
    # frostbitten flesh: blackened, bruised purple
    "bitten": ["#08060a", "#130e15", "#1f1622", "#2e2030", "#402c3f", "#553a50"],
    "bone": ["#271e15", "#392c1f", "#4d3d2b", "#635039", "#7a6449", "#927a5a", "#aa916d", "#c0a882", "#d3bf98",
             "#e3d4b2", "#efe5cc", "#f8f2e4"],
    "horn": ["#120b08", "#1d130d", "#2a1c13", "#38261a", "#473222", "#593f2b", "#6c4e36"],
    "cavity": ["#04040b", "#090914", "#0f0e1f", "#16142a", "#1f1b37"],
    "glow": ["#0d3a66", "#17609b", "#2490d0", "#47c0f2", "#8ce4ff", "#d4f7ff", "#ffffff"],
    # soul fire: deep teal to cyan to white
    "soul": ["#032826", "#06433f", "#0a6560", "#0f8c84", "#1ab8ad", "#43e0d2", "#8ff5ea", "#d4fffa", "#ffffff"],
    "nose": ["#06060c", "#0d0d18", "#161627", "#212238"],
}
light = {"dir": [-0.4, 1.0, 0.55], "strength": 0.55, "gradient": 0.7, "ao": 1.0, "ao_height": 10.0}
brush = {"flow": "z", "length": 3.4, "width": 1.0, "rough": 0.55, "overshoot": 0.3,
         "flows": {"ice": "y", "bone": "long"},
         "textures": {"fur": "fur", "mane": "fur", "bone": "organic", "ice": "crystal", "horn": "wood"}}

FROST = {"id": "frost_tips", "op": "drip", "ramp": "fur", "tone": 11.4, "depth": 0.35, "length": 1.2, "width": 0.4,
         "scale": 1.3, "faces": ["sides", "back", "front"]}
STRANDS = {"id": "strands", "op": "stripes", "axis": "x", "period": 1.3, "width": 0.3, "shift": -1.6, "wobble": 0.7,
           "faces": ["front", "back", "top", "bottom"]}
STRANDS_Z = {"id": "strands_z", "op": "stripes", "axis": "z", "period": 1.4, "width": 0.3, "shift": -1.5, "wobble": 0.8,
             "faces": ["left", "right"]}
NOISE = {"id": "clumps", "op": "noise", "scale": 0.9, "amount": 0.45}
STRIPES = {"id": "stripes", "op": "stripes", "axis": "z", "period": 5.2, "width": 0.36, "wobble": 1.5,
           "wobble_scale": 2.5, "ramp": "fur", "tone": 0.4, "post": True, "faces": ["left", "right", "top"]}
LEG_STRIPES = {"id": "stripes", "op": "stripes", "axis": "y", "period": 4.2, "width": 0.34, "wobble": 1.0,
               "ramp": "fur", "tone": 0.4, "post": True, "faces": ["left", "right", "front", "back"]}
def frostbite(centers, rough=0.55):
    """Frostbite: ragged patches of blackened dead flesh, each crusted round with white rime and ice.
    centers: [(x, y, z, r)] in the part's own coordinates (the flesh and its rime share them)."""
    return [{"id": "frostbite", "op": "spots", "centers": [[x, y, z, r * 0.8] for x, y, z, r in centers],
             "roughness": rough, "ramp": "bitten", "tone": 2.6, "post": True},
            {"id": "frostbite_bruise", "op": "spots", "centers": [[x, y, z, r * 0.45] for x, y, z, r in centers],
             "roughness": rough, "ramp": "bitten", "tone": 1.0, "post": True},
            {"id": "rime_crust", "op": "spots", "centers": [list(c) for c in centers], "roughness": rough, "ring": 0.7,
             "gaps": 0.0, "ramp": "mane", "tone": 11, "post": True}]
FRINGE_KEY = {"t": "fur:11", "m": "fur:9"}
MANE_KEY = {"t": "mane:11", "m": "mane:9"}

styles = {
    # body fur: dark saddle, paler blue flanks, strand stripes, frost-tipped clumps
    "fur_body": {"ramp": "fur", "tone": 6.4, "layers": [
        {"id": "saddle", "op": "gradient", "axis": "y", "amount": -1.2},
        NOISE, STRANDS, STRANDS_Z, STRIPES,
        {"id": "sheen", "op": "spots", "count": 8, "radius": [0.8, 1.6], "stretch": [1, 0.5, 2], "shift": 1.4,
         "faces": ["top"]},
        FROST,
        {"id": "under", "op": "band", "axis": "y", "from": -1.01, "to": -0.65, "shift": -1.2, "wobble": 0.3,
         "faces": ["sides", "front", "back"]}]},
    # the mid body: its right side is the inside of the torn flank, a dark frozen cavity
    "fur_torn": {"ramp": "fur", "tone": 6.4, "layers": [
        {"id": "saddle", "op": "gradient", "axis": "y", "amount": -1.2},
        NOISE, STRANDS, STRANDS_Z, dict(STRIPES, faces=["right", "top"]), FROST,
        {"id": "under", "op": "band", "axis": "y", "from": -1.01, "to": -0.65, "shift": -1.2, "wobble": 0.3,
         "faces": ["sides", "front", "back"]},
        {"id": "cavity", "op": "fill", "ramp": "cavity", "tone": 2.0, "faces": ["left"]},
        {"id": "cavity_frost", "op": "spots", "count": 9, "radius": [0.3, 0.8], "ramp": "ice", "tone": 3.0,
         "faces": ["left"]}]},
    # the neck, where the fur meets the bare skull: frostbitten flesh and rime crowding toward the bone
    "fur_neck": {"ramp": "fur", "tone": 6.2, "layers": [
        {"id": "saddle", "op": "gradient", "axis": "y", "amount": -1.0}, NOISE, STRANDS, STRANDS_Z,
        dict(STRIPES, period=4.0), FROST] + frostbite(
        [(5, 4, 15, 3.0), (-4.5, 6, 14.5, 2.6), (6.5, -3, 13, 2.8), (-6, -3, 14.5, 3.0), (0, 7, 12, 2.4),
         (1.5, -6.5, 14, 2.4), (8, 3, 9, 2.4), (-8, 2, 10, 2.2)])},
    "fur_bitten": {"ramp": "fur", "tone": 4.4, "layers": [NOISE, dict(STRANDS, shift=-1.4), dict(STRANDS_Z, shift=-1.4),
                                                         dict(FROST, tone=10.4)] + frostbite(
        [(-3, 0.5, -9, 3.0), (-3, -1, 2, 2.8), (-2.5, 1, 9, 2.6), (-3, -1.5, -3, 2.2)])},
    "fur_tail": {"ramp": "fur", "tone": 5.6, "layers": [
        {"id": "dark_root", "op": "gradient", "axis": "y", "amount": 1.0}, NOISE, STRANDS, STRANDS_Z,
        dict(STRIPES, period=3.0), FROST] + frostbite([(2, 3.5, -3, 3.0), (-3.5, -1, -4.5, 2.8), (1, -3.5, -1, 2.4),
                                                       (3.5, 0, -1.5, 2.2)])},
    "fur": {"ramp": "fur", "tone": 5.6, "layers": [
        {"id": "dark_root", "op": "gradient", "axis": "y", "amount": 1.0}, NOISE, STRANDS, STRANDS_Z,
        dict(STRIPES, period=4.0), FROST]},
    "fur_leg": {"ramp": "fur", "tone": 5.4, "brush": {"flow": "y"}, "layers": [
        {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 1.4}, NOISE,
        STRANDS, STRANDS_Z, LEG_STRIPES, dict(FROST, tone=10.6)]},
    "paw": {"ramp": "fur", "tone": 3.6, "layers": [NOISE, dict(LEG_STRIPES, period=3.4, faces=["left", "right"]),
                                                  {"id": "sole", "op": "fill", "ramp": "fur", "tone": 2.6,
                                                   "faces": ["bottom"]},
                                                  {"id": "pads", "op": "spots", "count": 6, "radius": [0.7, 1.3],
                                                   "ramp": "nose", "tone": 1.6, "faces": ["bottom"],
                                                   "bevel": {"highlight": 1, "shadow": 0}}]},

    "horn_spike": {"ramp": "horn", "tone": 3.6, "rim": {"light_shift": 1.8, "dark_shift": -1.2}, "brush": {"off": True},
                   "layers": [{"id": "tip", "op": "band", "axis": "y", "from": 0.45, "to": 1.01, "ramp": "bone",
                               "tone": 8.6},
                              {"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3,
                               "shift": -1.0}]},
    # soul fire round the eyes (fully emissive in game): rising souls, a faint face in each flame
    "flame": {"ramp": "soul", "tone": 4.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
              "art_key": {"W": "soul:8", "w": "soul:6", "E": "soul:5", "e": "soul:3", "f": "soul:2"}},
    # the skull: bone white and ivory, sutures and deep cracks, old stains, rime on the upper edges, dark outlines
    "skull": {"ramp": "bone", "tone": 8.6, "rim": {"light_shift": 1.4, "dark_shift": -1.8, "outline": "dark"},
              "brush": {"off": True},
              "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.8},
                         {"id": "stain", "op": "patches", "scale": 1.6, "threshold": 0.6, "shift": -1.6},
                         {"id": "sutures", "op": "cracks", "scale": 2.4, "width": 0.05, "shift": -3.6},
                         {"id": "cracks", "op": "cracks", "scale": 3.4, "width": 0.09, "shift": -6.0, "seed": 5,
                          "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.0}},
                         {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2},
                         {"id": "rime", "op": "drip", "ramp": "ice", "tone": 10.4, "depth": 0.22, "length": 0.8,
                          "width": 0.4, "scale": 1.2, "faces": ["sides", "front", "back"]}]},
    # frostbitten dead flesh: blackened and bruised, crusted with white rime and ice at its edges
    "flesh": {"ramp": "bitten", "tone": 2.6, "rim": {"light_shift": 1.0, "dark_shift": -1.0}, "brush": {"flow": "y"},
              "layers": [{"id": "bruise", "op": "noise", "scale": 0.6, "amount": 1.2},
                         {"id": "sinew", "op": "stripes", "axis": "x", "period": 1.4, "width": 0.3, "shift": -1.2,
                          "wobble": 0.8},
                         {"id": "rime", "op": "drip", "ramp": "mane", "tone": 10.8, "depth": 0.35, "length": 1.6,
                          "width": 0.5, "scale": 1.1, "faces": ["sides", "front", "back"]},
                         {"id": "ice", "op": "spots", "count": 6, "radius": [0.5, 0.9], "ramp": "ice", "tone": 9,
                          "faces": ["sides", "front", "back"]}]},
    "skull_dark": {"ramp": "bone", "tone": 6.6, "rim": {"light_shift": 1.2, "dark_shift": -1.6, "outline": "dark"},
                   "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.8},
                              {"id": "cracks", "op": "cracks", "scale": 3.0, "width": 0.05, "shift": -3.0}]},
    "claw": {"ramp": "horn", "tone": 3.0, "rim": {"light_shift": 1.6, "dark_shift": -1.0}, "brush": {"off": True},
             "layers": [{"id": "tip", "op": "band", "axis": "z", "from": 0.4, "to": 1.01, "ramp": "bone",
                         "tone": 9.0}]},
    "fringe": {"ramp": "fur", "tone": 5.0, "art_key": FRINGE_KEY, "brush": {"off": True},
               "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "fur_spikes": {"ramp": "fur", "tone": 4.6, "art_key": FRINGE_KEY, "brush": {"off": True},
                   "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": -1.4}]},
    "mane": {"ramp": "mane", "tone": 6.0, "layers": [
        {"id": "dark_root", "op": "gradient", "axis": "y", "amount": 1.6}, NOISE,
        dict(STRANDS, shift=-2.2, period=1.1, width=0.35), dict(STRANDS_Z, shift=-2.2, period=1.1, width=0.35),
        {"id": "white_tips", "op": "drip", "ramp": "mane", "tone": 10.6, "depth": 0.5, "length": 1.6, "width": 0.4,
         "scale": 1.2, "faces": ["sides", "back", "front"]}]},
    "mane_dark": {"ramp": "mane", "tone": 4.4, "layers": [NOISE, dict(STRANDS, shift=-2.2, period=1.0, width=0.35),
                                                          dict(STRANDS_Z, shift=-2.2, period=1.0, width=0.35),
                                                          {"id": "white_tips", "op": "drip", "ramp": "mane",
                                                           "tone": 9.6, "depth": 0.5, "length": 1.4, "width": 0.4,
                                                           "scale": 1.2, "faces": ["sides", "back", "front"]}]},
    "mane_fringe": {"ramp": "mane", "tone": 6.4, "art_key": MANE_KEY, "brush": {"off": True},
                    "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 1.8}]},
    "mane_spikes": {"ramp": "mane", "tone": 6.0, "art_key": MANE_KEY, "brush": {"off": True},
                    "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": -1.6}]},
    # ice crystals: a dark deep core, bright faceted edges, a highlight streak: reads as translucent
    "crystal": {"ramp": "ice", "tone": 7.0, "light": 0.6, "brush": {"off": True},
                "rim": {"light": 1, "dark": 1, "light_shift": 3.0, "dark_shift": 1.4},
                "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.45, "to": 0.45, "shift": -2.6,
                            "faces": ["front", "back"]},
                           {"id": "core_s", "op": "band", "axis": "z", "from": -0.45, "to": 0.45, "shift": -2.6,
                            "faces": ["left", "right"]},
                           {"id": "base", "op": "gradient", "axis": "y", "amount": 1.6},
                           {"id": "glint", "op": "band", "axis": "y", "from": 0.55, "to": 0.75, "shift": 2.0,
                            "faces": ["sides", "front", "back"]}]},
    "crystal_b": {"ramp": "ice", "tone": 8.2, "light": 0.6, "brush": {"off": True},
                  "rim": {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": 0.8},
                  "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.4, "to": 0.4, "shift": -2.2,
                              "faces": ["front", "back"]},
                             {"id": "core_s", "op": "band", "axis": "z", "from": -0.4, "to": 0.4, "shift": -2.2,
                              "faces": ["left", "right"]},
                             {"id": "base", "op": "gradient", "axis": "y", "amount": 1.2}]},
    "ice_plate": {"ramp": "ice", "tone": 6.0, "light": 0.8, "brush": {"off": True},
                  "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.0},
                  "layers": [{"id": "plates", "op": "scales", "shape": "square", "along": "z", "size": [3.0, 2.5],
                              "gap": 1.0, "highlight": 1.6, "shadow": -1.8, "gradient": 0.6, "jitter": 0.6},
                             {"id": "cracks", "op": "cracks", "scale": 2.5, "width": 0.05, "shift": 1.8}]},
    "ice_club": {"ramp": "ice", "tone": 5.6, "light": 0.8, "brush": {"off": True},
                 "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -0.8},
                 "layers": [{"id": "plates", "op": "scales", "shape": "square", "along": "z", "size": [2.5, 2.5],
                             "gap": 1.0, "highlight": 1.8, "shadow": -1.8, "jitter": 0.8},
                            {"id": "cracks", "op": "cracks", "scale": 2.0, "width": 0.06, "shift": 2.0}]},
    "core": {"ramp": "glow", "tone": 3.2, "light": 0.2, "brush": {"off": True},
             "rim": {"light": 1, "dark": 1, "light_shift": 1.5, "dark_shift": -1.0},
             "layers": [{"id": "pulse", "op": "noise", "scale": 0.5, "amount": 1.2},
                        {"id": "heart", "op": "band", "axis": "y", "from": -0.3, "to": 0.3, "shift": 1.4}]},
    "rib": {"ramp": "bone", "tone": 8.4, "art_key": {}, "brush": {"off": True},
            "layers": [{"id": "shade", "op": "gradient", "axis": "y", "amount": -1.4},
                       {"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.8}]},
    "bone": {"ramp": "bone", "tone": 8.2, "rim": {"light_shift": 1.4, "dark_shift": -1.4},
             "layers": [{"id": "grain", "op": "noise", "scale": 0.7, "amount": 0.8},
                        {"id": "cracks", "op": "cracks", "scale": 3.0, "width": 0.04, "shift": -2.4},
                        {"id": "under", "op": "gradient", "axis": "y", "amount": 0.8}]},
    "socket": {"ramp": "cavity", "tone": 1.0, "light": 0.2, "brush": {"off": True},
               "stamps": [{"face": "front", "at": "top-left", "art": ["bd.b", "d...", "....", "b..b"],
                           "key": {"b": "bone:6", "d": "cavity:3"}}]},
    "teeth": {"ramp": "bone", "tone": 9.4, "art_key": {}, "brush": {"off": True},
              "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "fang": {"ramp": "bone", "tone": 9.4, "rim": {"light_shift": 1.4, "dark_shift": -1.6}, "brush": {"flow": "y"},
             "layers": [{"id": "grain", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3, "shift": -0.8,
                         "faces": ["sides", "front", "back"]},
                        {"id": "root", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "fang_tip": {"ramp": "bone", "tone": 10.4, "brush": {"off": True}},
    "eye": {"ramp": "soul", "tone": 6.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"face": "front", "at": "top-left", "art": ["wb", "bd"],
                        "key": {"w": "soul:8", "b": "soul:6", "d": "soul:4"}}]},
}

# the paws: frostbite on the tops of the front paws and the hind feet (the toes stay plain)
styles["paw_front"] = dict(styles["paw"], layers=styles["paw"]["layers"] + frostbite(
    [(3, 1.0, 3.5, 3.2), (-3, 1.0, -0.5, 2.8), (-6, -1, 5, 2.4), (6, -1, 1, 2.2)]))
styles["paw_back"] = dict(styles["paw"], layers=styles["paw"]["layers"] + frostbite(
    [(2, 2.0, 0.5, 3.0), (-3, 1.5, -3, 2.4), (-5, -0.5, 3, 2.0)]))

# ======================================================================= animation: pose timelines + ground lock
LEGS_F = ("front_leg", "front_fore", "front_paw")
LEGS_B = ("back_leg", "back_shin", "back_paw")


def add(*poses):
    """Sum pose dicts {part: {"r"|"p"|"s": [x, y, z]}} (offsets add up)."""
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


def both(base, x=0, y=0, z=0, ch="r"):
    """A pose for base_l and base_r with mirrored y/z rotations."""
    if ch == "r":
        return {f"{base}_l": {"r": [x, y, z]}, f"{base}_r": {"r": [x, -y, -z]}}
    return {f"{base}_l": {ch: [x, y, z]}, f"{base}_r": {ch: [x, y, z]}}


def side(base, s, x=0, y=0, z=0):
    n = "l" if s > 0 else "r"
    return {f"{base}_{n}": {"r": [x, y * s, z * s]}}


def leg(kind, s, a, b, c, z=0.0):
    """One leg chain: upper, lower and paw x rotations (+x swings the lower end back), splay z (+ = outward)."""
    names = LEGS_F if kind == "f" else LEGS_B
    return add(side(names[0], s, a, 0, z), side(names[1], s, b), side(names[2], s, c))


def mirror_pose(p):
    """Swap left and right (claw_l -> claw_r)."""
    out = {}
    for k, chans in p.items():
        k2 = k[:-2] + "_r" if k.endswith("_l") else k[:-2] + "_l" if k.endswith("_r") else k
        o = {}
        for ch, v in chans.items():
            o[ch] = [v[0], -v[1], -v[2]] if ch == "r" else ([-v[0], v[1], v[2]] if ch == "p" else list(v))
        out[k2] = o
    return out


def timeline(length, keys, loop=False, extra=(), lift=None, lock=True):
    """keys: [(t, pose, ease)]. Returns a clip dict; the body's height is solved later (see ground_lock)."""
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
    """A looping keyed cycle shifted by `phase` (fraction of the clip). keys: [(u 0..1, [x, y, z])]."""
    ks = sorted(((((u + phase) % 1.0) * length), v) for u, v in keys)
    return {"part": part_, "channel": ch, "keys": [[round(t, 4), [round(float(a), 3) for a in v]] for t, v in ks],
            "ease": ease}


def gait(kind, s, length, phase, keys):
    """keys: [(u, (upper, lower, paw))] for one leg; mirrored splay is not needed (x rotations only)."""
    names = LEGS_F if kind == "f" else LEGS_B
    n = "l" if s > 0 else "r"
    return [cycle(f"{names[j]}_{n}", length, [(u, [v[j], 0, 0]) for u, v in keys], phase) for j in range(3)]


def jitter(part_, t0, t1, amp, step=0.05, axis=0, ch="rotation", base=None, seed=0):
    """Small alternating keys between t0 and t1 (trembling), zero outside."""
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


REST = {}
# lying down pushes the hanging fur aside
FLAT_FUR = add(r("brisket_fringe", -80), r("throat_fringe", -70), r("brisket", -20), r("throat", -25),
               r("belly_fringe_l", 0, 0, 75), r("belly_fringe_r", 0, 0, -75), r("chest_fringe_l", 0, 0, 75),
               r("chest_fringe_r", 0, 0, -75), r("hip_fringe_l", 0, 0, 70), r("hip_fringe_r", 0, 0, -70))

# ---------------------------------------------------------------- poses
FLAMES = ("eye_l_flame", "eye_r_flame", "eye_l_wisp", "eye_r_wisp")


def flames(sx=0.0, sy=0.0, sz=0.0):
    """Scale all four eye flames (offsets from 1)."""
    return {f: {"s": [sx, sy, sz]} for f in FLAMES}


def flicker(length, rate=7.0, amp=1.0):
    """Ice-fire flicker: the flames stretch, shrink and lick sideways, each on its own beat."""
    c, c2 = max(1, round(length * rate)), max(1, round(length * rate * 0.6))
    out = []
    for k, f in enumerate(FLAMES):
        ph = 0.13 * k
        if "wisp" in f:
            out.append({"part": f, "channel": "scale", "osc": {"amp": [0, 0.3 * amp, 0.28 * amp], "cycles": c,
                                                               "phase": ph}})
            out.append({"part": f, "axis": "y", "osc": {"amp": 7 * amp, "cycles": c2, "phase": ph + 0.3}})
        else:
            out.append({"part": f, "channel": "scale", "osc": {"amp": [0.16 * amp, 0.32 * amp, 0], "cycles": c,
                                                               "phase": ph}})
            out.append({"part": f, "axis": "z", "osc": {"amp": 9 * amp, "cycles": c2, "phase": ph + 0.25}})
    return out


# rearing roar: the body pitches up about the hip joints, the hind legs stay planted, the forelegs rake the air with
# the claws out, the head is thrown back and the jaw gapes to bare the sabres, the ruff and the eye-fire flare
REAR = add(r("body", -32), r("chest", -6), r("neck", -26), r("head", -18), r("jaw", 72),
           leg("f", 1, -66, 44, -24, 24), leg("f", -1, -56, 50, -30, 18),
           leg("b", 1, 30, -6, 8, 3), leg("b", -1, 30, -6, 8, 3),
           r("tail", 40), r("tail_mid", 14), r("tail_tip", 8), both("brow", z=6),
           sc("mane", 0.12, 0.2, 0.1), sc("mane_neck", 0.1, 0.18, 0.08), sc("throat", 0.08, 0.15, 0.05),
           pos("body", 0, 0, -2), flames(0.3, 0.6, 0.5))
CROUCH = add(r("body", 4), r("chest", 6), r("neck", 10), r("head", 8), r("jaw", 10),
             leg("f", 1, -12, 30, -18), leg("f", -1, -12, 30, -18),
             leg("b", 1, -20, 32, -12), leg("b", -1, -20, 32, -12),
             r("tail", 16), sc("mane", -0.04, -0.06, -0.02))
SLAM = add(r("body", 5), r("chest", 4), r("neck", 16), r("head", 10), r("jaw", 50),
           leg("f", 1, -22, 4, 18, 8), leg("f", -1, -22, 4, 18, 8),
           leg("b", 1, -8, 12, -4), leg("b", -1, -8, 12, -4), r("tail", 8), r("tail_mid", 6),
           sc("mane", 0.1, -0.06, 0.08), sc("mane_neck", 0.08, -0.05, 0.06), flames(0.2, 0.4, 0.3))
# collapsed on the belly: forelegs folded forward like a sphinx, hind legs folded under, head down on its cheek
DOWN = add(r("body", 2), r("chest", 2), r("neck", 8, -8, -10), r("head", 0, -14, -64), r("jaw", 20),
           leg("f", 1, 62, -132, 70, 10), leg("f", -1, 56, -128, 72, 14),
           leg("b", 1, -70, 118, -40, 8), leg("b", -1, -70, 118, -40, 8),
           r("tail", 14), r("tail_mid", 6, 14), r("tail_tip", 4, 10),
           sc("mane", 0.04, -0.08, 0.04), FLAT_FUR)
STUN_BASE = add(r("neck", 20), r("head", 12), r("jaw", 22), r("body", 3),
                leg("f", 1, -8, 14, -6, 9), leg("f", -1, -8, 14, -6, 9),
                leg("b", 1, -6, 10, -4, 6), leg("b", -1, -6, 10, -4, 6),
                r("tail", -18), r("tail_mid", -10), both("eye", ch="s", y=-0.45),
                flames(-0.4, -0.5, -0.4))

# ---------------------------------------------------------------- clips
ANIM = {}

# idle: heavy slow breathing, the ruff rising and ruffling, a low growl, looking around, the bobtail flicking, a blink,
# the eye-fire flickering
ANIM["idle"] = {"length": 3.0, "loop": True, "tracks": [
    {"part": "chest", "channel": "scale", "osc": {"amp": [0.022, 0, 0.01], "cycles": 2}},
    {"part": "chest", "axis": "x", "osc": {"amp": -1.2, "cycles": 2, "phase": 0.05}},
    {"part": "body", "channel": "scale", "osc": {"amp": [0.018, 0, 0], "cycles": 2, "phase": 0.08}},
    {"part": "mane", "channel": "scale", "osc": {"amp": [0.03, 0.06, 0.03], "cycles": 2, "phase": 0.1}},
    {"part": "mane_neck", "channel": "scale", "osc": {"amp": [0.03, 0.05, 0.02], "cycles": 2, "phase": 0.14}},
    {"part": "throat", "channel": "scale", "osc": {"amp": [0.04, 0.06, 0.03], "cycles": 2, "phase": 0.18}},
    {"part": "neck", "axis": "y", "keys": [[0, 0], [0.7, 12], [1.4, 12], [1.9, -9], [2.5, -9], [3.0, 0]], "ease": "smooth"},
    {"part": "head", "axis": "z", "keys": [[0, 0], [0.8, -6], [1.3, -6], [2.0, 5], [2.5, 5], [3.0, 0]], "ease": "smooth"},
    {"part": "neck", "axis": "x", "osc": {"amp": 1.8, "cycles": 2, "phase": 0.3}},
    {"part": "head", "axis": "x", "osc": {"amp": -1.5, "cycles": 2, "phase": 0.4}},
    {"part": "jaw", "axis": "x", "keys": [[0, 0], [1.5, 0], [1.62, 16, "out"], [1.85, 12], [2.1, 0, "back"], [3.0, 0]]},
    {"part": "jaw", "axis": "x", "osc": {"amp": 2, "cycles": 2, "phase": 0.5, "bias": 3}},
    {"part": "eye_l", "channel": "scale", "keys": [[0, [0, 0, 0]], [2.45, [0, 0, 0]], [2.5, [0, -0.85, 0]],
                                                    [2.6, [0, 0, 0]]]},
    {"part": "eye_r", "channel": "scale", "keys": [[0, [0, 0, 0]], [2.45, [0, 0, 0]], [2.5, [0, -0.85, 0]],
                                                    [2.6, [0, 0, 0]]]},
    {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "y", "amp": 7, "cycles": 2, "lag": 0.16,
                                                          "growth": 1.3}},
    {"part": "tail", "axis": "x", "keys": [[0, 0], [0.9, 0], [1.0, 18, "out"], [1.2, 6], [1.5, 0, "back"], [3.0, 0]]},
    {"part": "mane0", "axis": "z", "osc": {"amp": 4, "cycles": 3, "phase": 0.0}},
    {"part": "mane1", "axis": "z", "osc": {"amp": -4, "cycles": 3, "phase": 0.15}},
    {"part": "mane2", "axis": "z", "osc": {"amp": 3, "cycles": 3, "phase": 0.3}},
    {"part": "mane3", "axis": "z", "osc": {"amp": -3, "cycles": 3, "phase": 0.45}},
    {"part": "mane4", "axis": "x", "osc": {"amp": 3, "cycles": 3, "phase": 0.6}},
    {"part": "mane5", "axis": "z", "osc": {"amp": 3, "cycles": 3, "phase": 0.75}},
    {"part": "mane6", "axis": "z", "osc": {"amp": -3, "cycles": 3, "phase": 0.9}},
    {"part": "throat_fringe", "axis": "x", "osc": {"amp": 5, "cycles": 3, "phase": 0.2}},
    {"part": "brisket_fringe", "axis": "x", "osc": {"amp": 5, "cycles": 3, "phase": 0.5}},
] + flicker(3.0), "_lock": {}}

# walk: a stalking big cat: head low, shoulder blades rolling, lateral-sequence footfalls, the bobtail swinging
WALK_F = [(0.0, (-22, -4, 26)), (0.3, (0, 0, 0)), (0.55, (22, 4, -18)), (0.7, (14, 60, 30)), (0.86, (-24, 28, 10))]
WALK_B = [(0.0, (-20, 4, 14)), (0.3, (0, 0, 0)), (0.55, (24, -10, -12)), (0.7, (8, 40, -6)), (0.86, (-22, 26, -4))]
L = 1.6
ANIM["walk"] = {"length": L, "loop": True, "tracks": (
    gait("b", 1, L, 0.0, WALK_B) + gait("f", 1, L, 0.25, WALK_F) + gait("b", -1, L, 0.5, WALK_B)
    + gait("f", -1, L, 0.75, WALK_F) + [
        {"part": "chest", "axis": "y", "osc": {"amp": 4, "cycles": 1, "phase": 0.1}},
        {"part": "chest", "axis": "z", "osc": {"amp": 2.5, "cycles": 1, "phase": 0.1}},
        {"part": "hips", "axis": "y", "osc": {"amp": -4, "cycles": 1, "phase": 0.85}},
        {"part": "hips", "axis": "z", "osc": {"amp": 2, "cycles": 1, "phase": 0.85}},
        {"part": "neck", "axis": "x", "osc": {"amp": 2.5, "cycles": 2, "phase": 0.15, "bias": 8}},
        {"part": "head", "axis": "x", "osc": {"amp": -2.5, "cycles": 2, "phase": 0.2, "bias": -4}},
        {"part": "neck", "axis": "y", "osc": {"amp": -4, "cycles": 1, "phase": 0.15}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 1.5, "cycles": 2, "bias": 3}},
        {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "y", "amp": 9, "cycles": 1, "lag": 0.15,
                                                              "growth": 1.25}},
        {"part": "mane", "channel": "scale", "osc": {"amp": [0.02, 0.05, 0.02], "cycles": 2, "phase": 0.3}},
        {"part": "mane_neck", "channel": "scale", "osc": {"amp": [0.02, 0.05, 0.02], "cycles": 2, "phase": 0.35}},
        {"part": "throat_fringe", "axis": "x", "osc": {"amp": 8, "cycles": 2, "phase": 0.4}},
        {"part": "brisket_fringe", "axis": "x", "osc": {"amp": 8, "cycles": 2, "phase": 0.45}},
    ] + flicker(L)), "_lock": {}}

# run: a bounding big-cat gallop: the hind legs drive together, the spine coils and uncoils, the forelegs reach far,
# two flights (gathered after the hind push, extended after the forelegs push)
RUN_F = [(0.0, (-52, -8, 48)), (0.15, (-10, 0, 8)), (0.3, (42, 14, -24)), (0.48, (24, 100, 50)), (0.75, (-66, 30, 30))]
RUN_B = [(0.0, (-46, 8, 30)), (0.15, (-4, 0, 0)), (0.3, (50, -22, -18)), (0.48, (16, 66, -10)), (0.75, (-58, 36, 0))]
L = 0.7
ANIM["run"] = {"length": L, "loop": True, "tracks": (
    gait("b", 1, L, 0.0, RUN_B) + gait("b", -1, L, 0.06, RUN_B) + gait("f", -1, L, 0.42, RUN_F)
    + gait("f", 1, L, 0.49, RUN_F) + [
        {"part": "body", "axis": "x", "osc": {"amp": 9, "cycles": 1, "phase": 0.5}},
        {"part": "chest", "axis": "x", "osc": {"amp": 12, "cycles": 1, "phase": 0.55}},
        {"part": "hips", "axis": "x", "osc": {"amp": -15, "cycles": 1, "phase": 0.45}},
        {"part": "neck", "axis": "x", "osc": {"amp": -7, "cycles": 1, "phase": 0.6, "bias": 6}},
        {"part": "head", "axis": "x", "osc": {"amp": 5, "cycles": 1, "phase": 0.65, "bias": -5}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 6, "cycles": 1, "phase": 0.2, "bias": 14}},
        {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "x", "amp": 12, "cycles": 1, "lag": 0.15,
                                                              "growth": 1.2, "bias": 10}},
        {"part": "mane", "channel": "scale", "osc": {"amp": [0.03, 0.08, 0.03], "cycles": 1, "phase": 0.6}},
        {"part": "mane_neck", "channel": "scale", "osc": {"amp": [0.03, 0.08, 0.03], "cycles": 1, "phase": 0.65}},
        {"part": "throat_fringe", "axis": "x", "osc": {"amp": -14, "cycles": 1, "phase": 0.6, "bias": -10}},
        {"part": "brisket_fringe", "axis": "x", "osc": {"amp": -14, "cycles": 1, "phase": 0.6, "bias": -10}},
    ] + flicker(L, amp=1.3) + [{"part": f, "axis": "y" if "wisp" in f else "x",
                                "osc": {"amp": 0, "cycles": 1, "bias": -20 if "wisp" not in f else 0}} for f in FLAMES]),
    "_lock": {"lift": [[0, 0], [0.2, 0], [0.25, 1.6, "out"], [0.29, 0, "in"], [0.5, 0], [0.59, 4.2, "out"],
                       [0.66, 1.4], [0.7, 0, "in"]]}}

# roar: a crouch, rear up gaping with the forelegs raking the air, a long trembling hold, slam down
ANIM["roar"] = timeline(2.0, [
    (0.0, REST, None), (0.3, CROUCH, "ease"), (0.6, REAR, "out_back"), (1.15, add(REAR, r("neck", -4), r("jaw", 6)), "ease"),
    (1.38, SLAM, "in"), (1.55, add(r("body", -2), r("neck", 6), r("jaw", 20), sc("mane", 0.04, 0.04, 0.03)), "out"),
    (2.0, REST, "ease")],
    extra=[jitter("head", 0.62, 1.15, 2.2, axis=2, seed=1), jitter("jaw", 0.62, 1.15, 3.0, seed=2),
           jitter("mane", 0.62, 1.15, 0.04, ch="scale", axis=1, seed=3)] + flicker(2.0, amp=1.2))

# frozen: the roar's peak, held (frozen in its tomb mid-roar, the eye-fire banked low)
ANIM["frozen"] = timeline(1.0, [(0.0, add(REAR, flames(-0.7, -0.9, -0.8)), None),
                                (1.0, add(REAR, flames(-0.7, -0.9, -0.8)), None)], loop=True)

# claw_l: weight onto the right, the left paw cocks high and wide with the claws out, a whip-fast rake down and across,
# follow-through, a bouncy settle
CLAW_L_WIND = add(r("body", 2, 0, 6), pos("body", 0, 0, -1), r("chest", 2, 18, 3), r("neck", -6, -12), r("head", 0, -6, 6),
                  r("jaw", 24), leg("f", 1, -118, 58, -34, 42), leg("f", -1, 8, 8, -14, 4), r("tail", 14, -12), flames(0.1, 0.2, 0.2))
CLAW_L_HIT = add(r("body", 3, 0, -3), pos("body", 0, 0, 3), r("chest", 5, -20, -2), r("neck", 6, 10), r("head", 6, 8, -4),
                 r("jaw", 40), leg("f", 1, -40, -12, -18, -34), leg("f", -1, -6, 10, -4, 6), r("tail", 4, 14),
                 flames(0.2, 0.4, 0.3))
CLAW_L_FOLLOW = add(r("body", 2, 0, -4), pos("body", 0, 0, 3), r("chest", 6, -26, -3), r("neck", 8, 16), r("head", 5, 10, -6),
                    r("jaw", 20), leg("f", 1, -6, 22, 14, -46), leg("f", -1, -6, 10, -4, 6), r("tail", 0, 18))
CLAW_L = [(0.0, REST, None), (0.2, CLAW_L_WIND, "out"), (0.28, add(CLAW_L_WIND, leg("f", 1, -6, 6, -4)), "ease"),
          (0.36, CLAW_L_HIT, "in"), (0.48, CLAW_L_FOLLOW, "out"), (0.8, REST, "back")]
ANIM["claw_l"] = timeline(0.8, CLAW_L, extra=flicker(0.8))
ANIM["claw_r"] = timeline(0.8, [(t, mirror_pose(p), e) for t, p, e in CLAW_L], extra=flicker(0.8))

# fury: a loop of pouncing bites: coil low, spring forward stretched out with the claws reaching and the jaw gaping,
# the sabres stab down as the jaw snaps shut, land in a squash
FURY_GATHER = add(r("body", 5), r("chest", 6), r("neck", 6), r("head", 4), r("jaw", 12), pos("body", 0, 0, -1.5),
                  leg("f", 1, 6, 30, -36), leg("f", -1, 6, 30, -36), leg("b", 1, -26, 40, -14), leg("b", -1, -26, 40, -14),
                  sc("mane", -0.03, -0.06, -0.02), r("tail", 20))
FURY_LUNGE = add(r("body", -10), pos("body", 0, 0, 6), r("neck", -10), r("head", -16), r("jaw", 80),
                 leg("f", 1, -72, -10, -22), leg("f", -1, -66, -12, -26), leg("b", 1, 42, -14, 34), leg("b", -1, 42, -14, 34),
                 sc("mane", 0.06, 0.1, 0.04), r("tail", 12), flames(0.3, 0.6, 0.5))
FURY_BITE = add(r("body", 4), pos("body", 0, 0, 6.5), r("neck", 14), r("head", 22), r("jaw", -2),
                leg("f", 1, -38, 0, 30), leg("f", -1, -34, 0, 28), leg("b", 1, 14, 8, 4), leg("b", -1, 14, 8, 4), r("tail", 4), flames(0.2, 0.4, 0.3))
FURY_LAND = add(r("body", 7), pos("body", 0, 0, 2), r("chest", 5), r("neck", 10), r("head", 6), r("jaw", 18),
                leg("f", 1, -10, 30, -18), leg("f", -1, -10, 30, -18), leg("b", 1, -16, 30, -10), leg("b", -1, -16, 30, -10),
                sc("mane", 0.08, -0.08, 0.06), r("tail", 14))
ANIM["fury"] = timeline(0.5, [(0.0, FURY_GATHER, None), (0.13, FURY_LUNGE, "out"), (0.21, FURY_BITE, "in"),
                              (0.32, FURY_LAND, "out"), (0.5, FURY_GATHER, "ease")], loop=True,
                        extra=[{"parts": ["tail", "tail_mid", "tail_tip"],
                                "wave": {"axis": "x", "amp": 8, "cycles": 1, "lag": 0.12, "growth": 1.2}}]
                        + flicker(0.5, rate=8.0, amp=1.2),
                        lift=[[0, 0], [0.07, 0.6], [0.14, 7.0, "out"], [0.22, 4.0], [0.3, 0, "in"], [0.5, 0]])

# stunned: head low and swaying, jaw slack, wobbling on splayed legs, eyes half shut, the eye-fire guttering
ANIM["stunned"] = timeline(1.5, [(0.0, STUN_BASE, None), (1.5, STUN_BASE, None)], loop=True, extra=[
    {"part": "body", "axis": "z", "osc": {"amp": 4, "cycles": 1}},
    {"part": "body", "axis": "y", "osc": {"amp": 3, "cycles": 1, "phase": 0.25}},
    {"part": "neck", "axis": "y", "osc": {"amp": 12, "cycles": 1, "phase": 0.1}},
    {"part": "head", "axis": "z", "osc": {"amp": 10, "cycles": 1, "phase": 0.3}},
    {"part": "neck", "axis": "x", "osc": {"amp": 4, "cycles": 2, "phase": 0.2}},
    {"part": "jaw", "axis": "x", "osc": {"amp": 6, "cycles": 2, "phase": 0.35}},
    {"part": "front_leg_l", "axis": "z", "osc": {"amp": -3, "cycles": 1}},
    {"part": "front_leg_r", "axis": "z", "osc": {"amp": -3, "cycles": 1}},
    {"part": "back_leg_l", "axis": "z", "osc": {"amp": -2.5, "cycles": 1}},
    {"part": "back_leg_r", "axis": "z", "osc": {"amp": -2.5, "cycles": 1}},
    {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.18}},
] + flicker(1.5, rate=4.0, amp=0.8))

# wake: frozen mid-roar, the ice cracks, it crashes down onto its belly, lies stunned, the eye-fire flares up, it pushes
# up and shakes off the ice
SIT = add(r("body", -18), r("chest", 4), r("neck", 8), r("head", 6), r("jaw", 14),
          leg("f", 1, 18, -4, 4), leg("f", -1, 18, -4, 4), leg("b", 1, -60, 104, -30, 6), leg("b", -1, -60, 104, -30, 6),
          r("tail", -16), r("tail_mid", -8))
SHAKE = []
for k, (t, a) in enumerate([(2.24, 9), (2.33, -11), (2.42, 10), (2.51, -9), (2.6, 7), (2.69, -5), (2.78, 3)]):
    SHAKE.append((t, add(r("chest", 0, 0, a), r("hips", 0, 0, -a * 0.7), r("neck", -4, -a * 1.4, a * 0.8),
                         r("head", 0, -a * 1.2, a * 1.4), r("tail", 0, a * 2.2), r("tail_mid", 0, a * 1.6), sc("mane", 0.1, 0.12, 0.08), sc("mane_neck", 0.08, 0.12, 0.06),
                         r("jaw", 12)), "ease"))
DIM = flames(-0.7, -0.9, -0.8)
ANIM["wake"] = timeline(3.0, [
    (0.0, add(REAR, DIM), None), (0.3, add(REAR, DIM), None),
    (0.58, add(r("body", 10), r("chest", 4), r("neck", 18), r("head", 8), r("jaw", 36), leg("f", 1, -30, 10, 20, 8),
               leg("f", -1, -26, 8, 18, 8), leg("b", 1, -10, 18, -6), leg("b", -1, -10, 18, -6), r("tail", 10), DIM), "in"),
    (0.78, add(DOWN, DIM), "out"), (0.9, add(DOWN, r("neck", -4), r("head", -3), DIM), "ease"),
    (1.3, add(DOWN, DIM), "ease"), (1.45, add(DOWN, flames(0.4, 0.8, 0.6)), "out_back"), (1.55, DOWN, "ease"),
    (1.7, add(DOWN, r("neck", -26, 14, 0), r("head", -14, 10, 20), r("jaw", -10)), "ease"),
    (1.95, SIT, "out"), (2.15, add(CROUCH, r("body", -2)), "ease")] + SHAKE + [(3.0, REST, "back")],
    extra=[jitter("body", 0.12, 0.3, 0.8, step=0.04, axis=2, seed=4), jitter("head", 0.12, 0.3, 1.5, step=0.04, axis=1, seed=5),
           {"part": "eye_l", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.8, [0, -0.8, 0]], [1.3, [0, -0.8, 0]],
                                                          [1.4, [0, 0, 0], "out"], [3.0, [0, 0, 0]]]},
           {"part": "eye_r", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.8, [0, -0.8, 0]], [1.32, [0, -0.8, 0]],
                                                          [1.42, [0, 0, 0], "out"], [3.0, [0, 0, 0]]]},
           {"part": "chest", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.8, [0, 0, 0]], [1.0, [0.04, 0, 0.02]],
                                                          [1.15, [0, 0, 0]], [1.3, [0.04, 0, 0.02]], [1.45, [0, 0, 0]],
                                                          [3.0, [0, 0, 0]]]},
           {"part": "front_paw_l", "axis": "x", "keys": [[0, 0], [1.05, 0], [1.12, -18, "out"], [1.25, 0]]}]
    + flicker(3.0))

# death: hit, a last gaping howl, staggers, the forelegs give, crashes down, rolls onto its left flank (the bare ribs
# and the skull face up), a last breath; the eye-fire gutters out
DEATH_HOWL = add(r("body", -6), r("chest", -4), r("neck", -24), r("head", -14), r("jaw", 62),
                 leg("f", 1, -22, 18, 10), leg("f", -1, -12, 10, 6), r("tail", 12), flames(0.3, 0.6, 0.5))
DEATH_STAGGER = add(r("body", 0, 8, -7), r("neck", 6, -8), r("head", 10, 0, 10), r("jaw", 30),
                    leg("f", -1, -8, 10, -2, 6), leg("f", 1, -16, 46, -20, 4), leg("b", -1, -4, 10, -4),
                    leg("b", 1, -10, 22, -8), r("tail", -4))
DEATH_CRASH = add(r("body", 8, 6, -6), r("chest", 4), r("neck", 12, -6, 0), r("head", 6, 0, -30), r("jaw", 22),
                  leg("f", 1, 52, -122, 64, 16), leg("f", -1, 58, -128, 64, 20),
                  leg("b", 1, -12, 26, -10, 4), leg("b", -1, -16, 32, -12, 6), r("tail", -14), flames(-0.3, -0.4, -0.3))
DEATH_ROLL = add(r("body", 4, 6, -40), r("neck", -12, 14, -14), r("head", -6, 12, -40), r("jaw", 28),
                 leg("f", 1, 24, -30, 10, -46), leg("f", -1, 10, -14, 8, 28),
                 leg("b", 1, -24, 40, -16, -44), leg("b", -1, -14, 22, -8, 26),
                 r("tail", 6, -14), r("tail_mid", 2, -16), r("tail_tip", 2, -10), FLAT_FUR,
                 flames(-0.6, -0.7, -0.6))
DEATH_END = add(DEATH_ROLL, r("body", 0, 0, 3), r("jaw", 8), sc("chest", -0.03, 0, -0.02), sc("mane", -0.04, -0.08, -0.03),
                both("eye", ch="s", y=-0.85), flames(-0.35, -0.28, -0.38))
ANIM["death"] = timeline(2.0, [
    (0.0, REST, None), (0.12, DEATH_HOWL, "out"), (0.42, DEATH_STAGGER, "ease"), (0.72, DEATH_CRASH, "in"),
    (0.86, add(DEATH_CRASH, r("neck", -8), r("head", -4)), "out"), (1.18, DEATH_ROLL, "in"),
    (1.32, add(DEATH_ROLL, r("body", 0, 0, 5)), "out"), (1.7, DEATH_END, "ease"), (2.0, DEATH_END, None)],
    extra=flicker(2.0, rate=5.0, amp=0.6))


# ---------------------------------------------------------------- ground lock
def ground_lock(spec, step=1 / 60):
    """For every clip marked with `_lock`: sample the clip densely, and key the body's height so the model's lowest
    point sits on the ground (plus an optional airborne `lift`). Horizontal body offsets from the poses are kept."""
    sys.path.insert(0, ROOT)
    from lowpix.anim import Animator, eval_keys
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points

    insts = expand_instances(spec["parts"], float(spec["density"]))

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
        times = [length * k / n for k in range(n + (0 if loop else 1))]
        keys = []
        for t in times:
            bp = np.zeros(3)
            for tr in body_pos:
                bp += eval_keys(tr["keys"], t, length, loop, tr.get("ease", "ease"), tr.get("axis"))
            bp[1] = 0.0
            tracks = others + [{"part": "body", "channel": "position", "keys": [[0, list(bp)], [length, list(bp)]],
                                "ease": "linear"}]
            m.spec = {"animations": {"_": {"length": length, "loop": loop, "tracks": tracks}}}
            W = Animator(m).world_matrices("_", t)
            lo = min(float(transform_points(W[i.id], f.pts)[:, 1].min()) for i in insts for f in i.faces)
            lift = float(eval_keys(lock["lift"], t, length, loop, "ease")[0]) if lock.get("lift") else 0.0
            bp[1] = -lo + lift
            keys.append([round(t, 4), [round(float(v), 3) for v in bp]])
        clip["tracks"] = others + [{"part": "body", "channel": "position", "keys": keys, "ease": "linear"}]


spec = {
    "name": "Frost Mauler",
    "description": "The Winterworks Cold Zone boss: a huge indigo-furred beast between a dire wolf and a giant bear, "
                   "half dead and half frozen: a pale mane, ice crystal clusters erupting from its back and left "
                   "shoulder, an ice-sheathed foreleg and tail club, half its skull bare bone round a glowing socket, "
                   "a cage of bare ribs over a frost core on its right flank, two massive sabre fangs. "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model (fur fringes are cards).",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 4000, "colors": 96},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 20, "glow_parts": ["eye_l", "eye_r", "frost_core", "eye_l_flame", "eye_r_flame", "eye_l_wisp",
                                            "eye_r_wisp"]},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#232838", "hero": [-40, 16], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/frost_mauler.json"
    # put the lowest point of the rest pose exactly on the ground
    sys.path.insert(0, ROOT)
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points
    lo = min(float(transform_points(i.world, f.pts)[:, 1].min()) for i in expand_instances(P, 1.0) for f in i.faces)
    P[0]["pivot"][1] = round(P[0]["pivot"][1] - lo, 4)
    ground_lock(spec)
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts", f"(lifted {-lo:+.3f})")
