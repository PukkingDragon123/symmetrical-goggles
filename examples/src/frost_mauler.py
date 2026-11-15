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


# ======================================================================= torso: body (root), chest, hips
# The root joint sits between the hip joints, so rearing up pivots about the hind legs.
part("body", None, [21, 19, 21], "fur_torn", at=(0, 22, -17), centre=(1.5, 23, -4.5))
# the right flank is torn open: a fur roof along the spine and a strip of belly fur frame a dark cavity
part("roof_r", "body", [6, 6, 21], "fur_dark", centre=(-10, 30.5, -4.5), rot=(0, 0, 8))
part("belly_r", "body", [5, 5, 19], "fur_dark", centre=(-9.5, 16, -4.5), rot=(0, 0, -6))
part("frost_core", "body", [3, 6, 6], "core", centre=(-9.5, 23, -5), rot=(0, 0, 4))
for k, z in enumerate((-12.5, -8.8, -5.1, -1.4, 2.3)):
    h = 14 if 0 < k < 4 else 12
    art = ["bb...", ".bb..", ".bbb.", "..bb.", "..bbb", "...bb", "...bb", "...bb", "..bbb", "..bb.", ".bbb.", ".bb..",
           "bb...", "b...."][:h]
    card(f"rib{k}", "body", art, "rib", at=(-12.6, 29.2, z), offset=(0, -h / 2 + 0.5, 0),
         rot=(0, 180 + (6 if k % 2 else -6), -7))
# fur fringes hanging off the belly edges and the torn edge of the roof
card("belly_fringe_l", "body", locks(21, 6, 11), "fringe", at=(12.1, 14.5, -4.5), offset=(0, -2.5, 0), rot=(0, 0, 8))
card("belly_fringe_r", "body", locks(19, 5, 12), "fringe", at=(-12.1, 14.5, -4.5), offset=(0, -2, 0), rot=(0, 0, -8))
card("roof_fringe_r", "roof_r", locks(21, 4, 13, min_len=0.5), "fringe", rel=(-3.1, -2.6, 0), offset=(0, -1.5, 0),
     rot=(0, 0, -12))
part("shag_body", "body", [14, 3, 11], "fur", at=(5, 32.4, -1), rot=(-8, -6, -8))
part("shag_body_b", "body", [13, 3, 10], "fur", at=(4, 32.0, -11), rot=(-10, 5, -6))

# chest: the bear's shoulder hump
part("chest", "body", [26, 23, 19], "fur_body", at=(0, 25, 3), centre=(0, 26.5, 11.5), rot=(-5, 0, 0))
part("brisket", "chest", [16, 6, 9], "mane_dark", centre=(0, 16.5, 16), rot=(22, 0, 0))
card("brisket_fringe", "brisket", locks(17, 8, 21), "fringe", rel=(0, -2.6, 4.65), offset=(0, -3.5, 0),
     plane="xy", rot=(-16, 0, 0))
card("chest_fringe_l", "chest", locks(16, 6, 22), "fringe", at=(13.1, 16, 11), offset=(0, -2.5, 0), rot=(0, 0, 10))
card("chest_fringe_r", "chest", locks(16, 6, 23), "fringe", at=(-13.1, 16, 11), offset=(0, -2.5, 0), rot=(0, 0, -10))

# hips: the haunches, sloping down to the tail
part("hips", "body", [22, 18, 15], "fur_body", at=(0, 24, -13), centre=(0, 23, -20), rot=(-7, 0, 0))
part("shag_hips", "hips", [14, 3, 10], "fur", at=(0, 31.5, -20), rot=(-12, 0, 0))
card("rump_fringe", "hips", locks(18, 6, 31), "fringe", at=(0, 21, -27.8), offset=(0, -2.5, 0), plane="xy",
     rot=(-12, 0, 0))
card("hip_fringe_l", "hips", locks(14, 5, 32), "fringe", at=(11.1, 15.5, -20), offset=(0, -2, 0), rot=(0, 0, 8))
card("hip_fringe_r", "hips", locks(14, 5, 33), "fringe", at=(-11.1, 15.5, -20), offset=(0, -2, 0), rot=(0, 0, -8))
# the bare spine over the right haunch: three vertebrae where the fur has rotted away
for k, z in enumerate((-15.5, -19.5, -23.5)):
    part(f"vert_hip{k}", "hips", [3, 2, 3], "bone", centre=(-3.5, 32.0 - k * 0.6, z), rot=(-7, 0, 0))
    card(f"vert_hip{k}_spine", f"vert_hip{k}", ["b.", "bb", "bb"], "bone", rel=(0, 2.4, 0), plane="yz", rot=(-25, 0, 0))

# ======================================================================= the mane: heavy pale fur over neck and shoulders
part("mane", "chest", [26, 7, 15], "mane_dark", centre=(0, 37.5, 10), rot=(-14, 0, 0))
MANE_TUFTS = [  # (x, y, z, rx, ry, rz, w, h, d): shaggy locks fanning round the shoulders, each tilted its own way
    (-13.5, 33, 11, -14, 14, 32, 6, 11, 8), (13.5, 33, 11, -14, -14, -32, 6, 11, 8),
    (-8, 38.5, 7, -30, 8, 18, 9, 8, 8), (8, 38.5, 7, -30, -8, -18, 9, 8, 8),
    (0, 40, 4, -40, 0, 0, 10, 7, 8), (-11, 37, 0, -22, 22, 26, 7, 8, 7), (11, 37, 0, -22, -22, -26, 7, 8, 7),
    (0, 38, 15, -10, 0, 0, 14, 7, 7),
]
for k, (x, y, z, rx, ry, rz, w, h, d) in enumerate(MANE_TUFTS):
    part(f"mane{k}", "chest", [w, h, d], "mane" if k % 2 else "mane_dark", centre=(x, y, z), rot=(rx, ry, rz))
# straggly fringes round the mane's edge: long pale locks hanging from every tuft, tips frosted white
for k, (x, y, z, rx, ry, rz, w, h, d) in enumerate(MANE_TUFTS):
    if k in (4, 7):
        card(f"mane{k}_fringe", f"mane{k}", locks(w + 2, 8, 40 + k), "mane_fringe", rel=(0, -h / 2 + 1, d / 2 + 0.15),
             offset=(0, -3.5, 0), plane="xy", rot=(12, 0, 0))
    else:
        s = 1 if x >= 0 else -1
        card(f"mane{k}_fringe", f"mane{k}", locks(d + 3, 9, 40 + k), "mane_fringe",
             rel=(s * (w / 2 + 0.15), -h / 2 + 1.5, 0), offset=(0, -4, 0), rot=(0, 0, s * 8))
card("mane_crest", "mane", spikes(20, 7, 51), "mane_spikes", rel=(0, 3.4, -3), offset=(0, 3.5, 0), rot=(-20, 0, 0))
card("mane_crest_b", "mane", spikes(16, 6, 52), "mane_spikes", rel=(0, 3.0, 3), offset=(0, 3, 0), rot=(-8, 0, 0))

# ======================================================================= ice: crystal clusters erupting from the back
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


cluster("ice_back0", "chest", (2, 40.5, 0), [(0, 0, 4, 17, -24, 4), (-3, 1, 3, 12, -18, 22), (3, -1, 3, 11, -34, -18),
                                             (0, -3, 2, 7, -52, 8)])
cluster("ice_back1", "body", (-1, 32.5, -6), [(0, 0, 4, 14, -26, -6), (2.5, 1.5, 3, 9, -14, -26), (-2.5, -1, 2, 7, -40, 20)])
cluster("ice_back2", "hips", (1, 30.5, -17), [(0, 0, 3, 10, -32, 6), (-2, 0.5, 2, 6, -20, 24), (2, -1, 2, 5, -48, -20)])
# a crest of short dark fur spines between the clusters
card("spine_fur0", "body", spikes(14, 5, 61), "fur_spikes", at=(0, 32.8, 1), offset=(0, 2.5, 0), rot=(-6, 0, 0))
card("spine_fur1", "hips", spikes(12, 4, 62), "fur_spikes", at=(0, 31.6, -24), offset=(0, 2, 0), rot=(-10, 0, 0))

# the left shoulder is sheathed in ice: a plate with crystals bursting out of it
part("ice_shoulder", "chest", [3, 13, 15], "ice_plate", centre=(14.4, 28, 11), rot=(-6, 0, 14))
cluster("ice_shoulder_c", "ice_shoulder", (15.5, 32, 10), [(0, 0, 3, 11, -18, -34), (0, 3, 2, 8, 8, -48),
                                                           (0, -3, 2, 7, -40, -20)])

# ======================================================================= legs
WRIST_Y = []    # the front wrists' height: the hind legs are sized to put their hocks at the same height


def front_leg(s):
    n = "l" if s > 0 else "r"
    up = part(f"front_leg_{n}", "chest", [9, 17, 11], "fur_leg", at=M((12, 25, 11), s), offset=(0, -6.5, 0),
              rot=MR((6, 0, 3), s))
    elbow = wpos(up["id"], (0, -14, 0))
    part(f"front_fore_{n}", up["id"], [8, 12, 8], "fur_leg", at=elbow, offset=(0, -5, 0.5), wrot=MR((-8, 0, 2), s))
    wrist = wpos(f"front_fore_{n}", (0, -11, 0.5))
    WRIST_Y.append(float(wrist[1]))
    part(f"front_paw_{n}", f"front_fore_{n}", [10, 4, 10], "paw", at=wrist,
         centre=(wrist[0], wrist[1] - 1.2, wrist[2] + 1.5), wrot=(0, 0, 0))
    # long splayed toes with dark horn claws
    for k, (dx, yaw) in enumerate(((-3.6, 22), (-1.2, 7), (1.2, -7), (3.6, -22))):
        tid = f"front_toe_{n}{k}"
        part(tid, f"front_paw_{n}", [2, 2, 4], "paw", rel=(dx * s, -0.9, 5.5), offset=(0, 0, 1.5),
             rot=(0, -yaw * s, 0))
        part(f"front_claw_{n}{k}", tid, [1, 2, 4], "claw", rel=(0, 0.2, 3.2), offset=(0, 0, 1.6), rot=(26, 0, 0))
    # elbow fringe trailing back, fur skirt round the wrist
    card(f"elbow_fringe_{n}", up["id"], locks(7, 6, 70 + s, min_len=0.5), "fringe", rel=(0, -10, -5.7),
         offset=(0, -2, 0), plane="xy", rot=(-25, 0, 0))
    card(f"wrist_fringe_{n}", f"front_fore_{n}", locks(8, 4, 72 + s), "fringe", rel=(s * 4.15, -6.5, 0),
         offset=(0, -1.5, 0), rot=(0, 0, s * 10))


def back_leg(s):
    n = "l" if s > 0 else "r"
    th = part(f"back_leg_{n}", "hips", [9, 16, 12], "fur_leg", at=M((10, 22, -19), s), offset=(0, -5.5, 1),
              wrot=MR((-22, 0, 2), s))
    part(f"haunch_{n}", th["id"], [10, 9, 13], "fur_body", rel=(s * 0.5, 0, 0.5), rot=(0, 0, 0))
    knee = wpos(th["id"], (0, -12.5, 0))
    part(f"back_shin_{n}", th["id"], [6, 13, 7], "fur_leg", at=knee, offset=(0, -5.5, 0), wrot=MR((30, 0, 0), s))
    shin = (knee[1] - WRIST_Y[0]) / math.cos(math.radians(30))
    hock = wpos(f"back_shin_{n}", (0, -shin, 0))
    part(f"back_paw_{n}", f"back_shin_{n}", [9, 4, 11], "paw", at=hock, centre=(hock[0], hock[1] - 1.2, hock[2] + 4),
         wrot=(0, 0, 0))
    for k, (dx, yaw) in enumerate(((-3.0, 18), (-1.0, 6), (1.0, -6), (3.0, -18))):
        tid = f"back_toe_{n}{k}"
        part(tid, f"back_paw_{n}", [2, 2, 3], "paw", rel=(dx * s, -0.9, 5.0), offset=(0, 0, 1.0), rot=(0, -yaw * s, 0))
        part(f"back_claw_{n}{k}", tid, [1, 2, 3], "claw", rel=(0, 0.2, 2.2), offset=(0, 0, 1.2), rot=(28, 0, 0))
    card(f"hock_fringe_{n}", f"back_shin_{n}", locks(6, 5, 80 + s, min_len=0.5), "fringe", rel=(0, -3, -3.65),
         offset=(0, -1.5, 0), plane="xy", rot=(-15, 0, 0))
    card(f"thigh_fringe_{n}", th["id"], locks(13, 5, 82 + s), "fringe", rel=(s * 5.2, -7, 1), offset=(0, -2, 0),
         rot=(0, 0, s * 8))


front_leg(1)
front_leg(-1)
back_leg(1)
back_leg(-1)
# the left foreleg is sheathed in ice: plates on the outside and front, a crystal spur at the elbow
part("ice_arm_l", "front_leg_l", [2, 11, 9], "ice_plate", rel=(4.9, -4.5, 0), rot=(0, 0, 4))
part("ice_spur_l", "front_leg_l", [2, 7, 2], "crystal", rel=(4.2, -10, -3), offset=(0, 3.5, 0), rot=(-62, 0, -28))
part("ice_fore_l", "front_fore_l", [2, 8, 7], "ice_plate", rel=(4.3, -4.5, 0.5), rot=(0, 0, -3))
part("ice_shin_l", "front_fore_l", [6, 7, 2], "ice_plate", rel=(0.5, -4.5, 4.6), rot=(-4, 0, 0))
part("ice_wrist_l", "front_fore_l", [2, 5, 2], "crystal_b", rel=(4.4, -7.5, 3), offset=(0, 2.5, 0), rot=(30, 0, -40))

# ======================================================================= neck and head
part("neck", "chest", [16, 15, 12], "fur_body", at=(0, 32, 15), centre=(0, 30, 20), wrot=(14, 0, 0))
part("throat", "neck", [12, 8, 10], "mane", rel=(0, -7.5, 2), rot=(-8, 0, 0))
card("throat_fringe", "throat", locks(12, 8, 91), "mane_fringe", rel=(0, -3.5, 5.15), offset=(0, -3.5, 0), plane="xy",
     rot=(-5, 0, 0))
part("mane_neck", "neck", [20, 8, 14], "mane", rel=(0, 6.5, -1), rot=(-8, 0, 0))
card("mane_neck_fringe_l", "mane_neck", locks(15, 9, 92), "mane_fringe", rel=(10.15, -3, 0), offset=(0, -4, 0),
     rot=(0, 0, 10))
card("mane_neck_fringe_r", "mane_neck", locks(13, 7, 93), "mane_fringe", rel=(-10.15, -3, -1), offset=(0, -3, 0),
     rot=(0, 0, -10))
card("mane_neck_crest", "mane_neck", spikes(16, 6, 94), "mane_spikes", rel=(0, 4.1, 0), offset=(0, 3, 0), rot=(-10, 0, 0))

# the head: a big, broad wolf-bear skull; the left half furred, the right half bare bone.
# Head frame: the cranium spans x -9..9, y -3..10, z 0..13; the muzzle runs on to z 26.
part("head", "neck", [18, 13, 13], "head", at=(0, 29.5, 24.5), offset=(0, 3.5, 6.5), wrot=(4, 0, 0))
part("brow_l", "head", [8, 3, 4], "fur_dark", rel=(5, 8.3, 12.2), rot=(0, 0, 14))
part("brow_r", "head", [8, 3, 4], "bone", rel=(-5, 8.3, 12.4), rot=(0, 0, -12))
part("socket_r", "head", [4, 4, 1], "socket", rel=(-5, 5.2, 13.1))
part("eye_l", "head", [2, 2, 1], "eye", rel=(5, 5.4, 13.25))
part("eye_r", "head", [2, 2, 1], "eye", rel=(-5, 5.2, 13.3))
part("zygo_r", "head", [2, 3, 12], "bone", rel=(-9.4, 2.0, 8.5), rot=(0, 5, 4))
part("temple_r", "head", [1, 4, 6], "socket", rel=(-9.1, 6.5, 6))
part("cheek_l", "head", [3, 11, 10], "fur_dark", rel=(9, 1.5, 7), offset=(0, -3, 0), rot=(-12, 0, 22))
card("cheek_fringe_l", "cheek_l", locks(10, 7, 101, min_len=0.5), "fringe", rel=(1.65, -8, 0), offset=(0, -3, 0),
     rot=(0, 0, 6))
part("crown", "head", [13, 3, 10], "fur_dark", rel=(2, 10.6, 5), rot=(-10, 0, 0))
card("crown_fringe", "crown", spikes(11, 5, 102), "fur_spikes", rel=(0, 1.6, -2), offset=(0, 2.5, 0), rot=(-35, 0, 0))
part("ear_l", "head", [5, 6, 2], "fur_dark", rel=(6, 9.5, 2.5), offset=(0, 3, 0), rot=(-30, 0, -16))
part("ear_l_tip", "ear_l", [3, 3, 1], "fur_dark", rel=(0, 6, 0), offset=(0, 1.5, 0))
card("ear_l_tuft", "ear_l_tip", ["t.", "tt", "mt", ".m", ".f"], "fringe", rel=(0, 2.5, 0), offset=(0, 2.5, 0),
     plane="xy", rot=(0, 0, -10))
part("ear_r", "head", [4, 3, 2], "torn", rel=(-6, 9.5, 2.5), offset=(0, 1.5, 0), rot=(-26, 0, 20))

# the muzzle: a broad base and a narrower tip with the nose, black lips on the furred side, bare maxilla on the right
part("snout", "head", [12, 8, 8], "snout", rel=(0, -0.5, 12), offset=(0, -0.5, 4), rot=(5, 0, 0))
part("snout_tip", "snout", [9, 7, 6], "snout_tip", rel=(0, -0.5, 7.5), offset=(0, -0.4, 3), rot=(6, 0, 0))
part("nose", "snout_tip", [6, 3, 2], "nose", rel=(0, 2.4, 6.0))
part("maxilla_r", "snout", [1, 6, 8], "bone", rel=(-6.1, -1.0, 4))
card("whiskers_l", "snout_tip", ["w....w..", ".w..w...", "..ww.www", "wwwww..."], "whisker", rel=(4.7, -0.6, 3),
     offset=(0, 0, -3.5), plane="xz", rot=(0, -24, -14))
# teeth: a row of individual pointed bone-yellow teeth along both sides and the front
card("teeth_up_l", "snout", ["yyyyyyyy", "y.yy.yy.", "..y...y."], "teeth", rel=(5.1, -4.7, 4), offset=(0, -1.5, 0))
card("teeth_up_r", "snout", ["yyyyyyyy", "yyyyyyyy", "y.yy.yy.", "..y...y."], "teeth", rel=(-5.1, -4.2, 4),
     offset=(0, -2, 0))
card("teeth_up_tl", "snout_tip", ["yyyyyy", "y.yy.y", "..y..."], "teeth", rel=(3.6, -3.9, 3), offset=(0, -1.5, 0))
card("teeth_up_tr", "snout_tip", ["yyyyyy", "yyyyyy", "y.yy.y", "..y..."], "teeth", rel=(-3.6, -3.4, 3),
     offset=(0, -2, 0))
card("teeth_up_f", "snout_tip", ["yyyyyyy", "y.yy.yy", "y.yy.y."], "teeth", rel=(0, -3.9, 5.8), offset=(0, -1.5, 0),
     plane="xy")

part("jaw", "head", [8, 3, 16], "jaw", rel=(0, -3.8, 8), offset=(0, -1.5, 8), rot=(7, 0, 0))
card("teeth_lo_l", "jaw", [".y...y...y...", "yy.yyy.yyy.yy", "yyyyyyyyyyyyy"], "teeth", rel=(3.7, 1.4, 9))
card("teeth_lo_r", "jaw", [".y...y...y...", "yy.yyy.yyy.yy", "yyyyyyyyyyyyy", "yyyyyyyyyyyyy"], "teeth",
     rel=(-3.9, 0.9, 9))
card("teeth_lo_f", "jaw", [".y..y..", "yyyyyyy"], "teeth", rel=(0, 0.9, 15.6), plane="xy")
part("tongue", "jaw", [6, 1, 13], "mouth", rel=(0, 0.2, 8.5))
part("jaw_bone_r", "jaw", [1, 3, 14], "bone", rel=(-4.4, -1.5, 8.5))
card("beard", "jaw", locks(7, 6, 111), "fringe", rel=(1.5, -3.1, 6), offset=(0, -2.5, 0), plane="xy", rot=(-25, 0, 0))

# the sabre fangs: three segments curving back like a smilodon's, far longer than the lower jaw
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"fang_{n}", "head", [3, 7, 3], "fang", rel=(s * 5.5, -4.2, 22), offset=(0, -3.5, 0), rot=MR((-6, 0, 3), s))
    part(f"fang_{n}_mid", f"fang_{n}", [2, 5, 2], "fang", rel=(0, -7, 0), offset=(0, -2.5, 0), rot=(16, 0, 0))
    part(f"fang_{n}_tip", f"fang_{n}_mid", [1, 3, 1], "fang_tip", rel=(0, -5, 0), offset=(0, -1.5, 0), rot=(18, 0, 0))

# ======================================================================= tail: fur, then bare vertebrae, then an ice club
part("tail", "hips", [7, 7, 11], "fur", at=(0, 27, -26.5), offset=(0, 0, -5), wrot=(-16, 0, 0))
card("tail_fringe", "tail", locks(11, 5, 121), "fringe", rel=(0, -3.6, -5), offset=(0, -2, 0), rot=(0, 0, 0))
card("tail_crest", "tail", spikes(10, 4, 122), "fur_spikes", rel=(0, 3.6, -5), offset=(0, 2, 0))
part("tail_mid", "tail", [3, 3, 10], "bone", rel=(0, 0, -10), offset=(0, 0, -5), rot=(-20, 0, 0))
for k, z in enumerate((-2.0, -5.0, -8.0)):
    part(f"vert{k}", "tail_mid", [5, 4, 2], "bone", rel=(0, 0, z))
    card(f"vert{k}_spine", f"vert{k}", ["b..", "bb.", "bbb"], "bone", rel=(0, 3.4, 0), plane="yz", rot=(-30, 0, 0))
part("tail_tip", "tail_mid", [7, 7, 9], "ice_club", rel=(0, 0, -10), offset=(0, 0, -4), rot=(-14, 0, 0))
for k, (rx, rz, h) in enumerate(((-60, 0, 7), (-40, 70, 6), (-40, -70, 6), (-120, 30, 5), (-110, -40, 5))):
    part(f"tail_spike{k}", "tail_tip", [2, h, 2], "crystal" if k % 2 == 0 else "crystal_b", rel=(0, 0, -4.5),
         offset=(0, h / 2 + 2.5, 0), rot=(rx, 0, rz))

# ======================================================================= palette: indigo fur, pale mane, ice, bone
ramps = {
    "fur": ["#090a17", "#0e1027", "#141836", "#1b2046", "#222a57", "#2b3567", "#354277", "#405186", "#4c6294",
            "#5b74a2", "#6c88ae", "#809dba", "#98b4c6"],
    "mane": ["#262b44", "#353c56", "#464e69", "#59617c", "#6d7690", "#838da5", "#9aa5b9", "#b2bccc", "#c9d2dd",
             "#dde4eb", "#edf2f6", "#f8fbfc"],
    "ice": ["#0b2440", "#113154", "#173f69", "#1f507f", "#2a6495", "#377aaa", "#4891bf", "#5ea9d0", "#7cc1de",
            "#a0d7ea", "#c8ecf5", "#effbfd"],
    "bone": ["#271e15", "#392c1f", "#4d3d2b", "#635039", "#7a6449", "#927a5a", "#aa916d", "#c0a882", "#d3bf98",
             "#e3d4b2", "#efe5cc", "#f8f2e4"],
    "horn": ["#120b08", "#1d130d", "#2a1c13", "#38261a", "#473222", "#593f2b", "#6c4e36"],
    "cavity": ["#04040b", "#090914", "#0f0e1f", "#16142a", "#1f1b37"],
    "glow": ["#0d3a66", "#17609b", "#2490d0", "#47c0f2", "#8ce4ff", "#d4f7ff", "#ffffff"],
    "nose": ["#06060c", "#0d0d18", "#161627", "#212238"],
    "mouth": ["#190915", "#2a1023", "#3e1834", "#552346", "#6e3059"],
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
NOISE = {"id": "clumps", "op": "noise", "scale": 0.9, "amount": 0.7}
FRINGE_KEY = {"t": "fur:11", "m": "fur:9"}
MANE_KEY = {"t": "mane:11", "m": "mane:9"}

styles = {
    # body fur: dark saddle, paler blue flanks, strand stripes, frost-tipped clumps
    "fur_body": {"ramp": "fur", "tone": 6.4, "layers": [
        {"id": "saddle", "op": "gradient", "axis": "y", "amount": -1.2},
        NOISE, STRANDS, STRANDS_Z,
        {"id": "sheen", "op": "spots", "count": 14, "radius": [0.8, 1.8], "stretch": [1, 0.5, 2], "shift": 1.6,
         "faces": ["sides", "top"]},
        FROST,
        {"id": "under", "op": "band", "axis": "y", "from": -1.01, "to": -0.65, "shift": -1.2, "wobble": 0.3,
         "faces": ["sides", "front", "back"]}]},
    # the mid body: its right side is the inside of the torn flank, a dark frozen cavity
    "fur_torn": {"ramp": "fur", "tone": 6.4, "layers": [
        {"id": "saddle", "op": "gradient", "axis": "y", "amount": -1.2},
        NOISE, STRANDS, STRANDS_Z, FROST,
        {"id": "under", "op": "band", "axis": "y", "from": -1.01, "to": -0.65, "shift": -1.2, "wobble": 0.3,
         "faces": ["sides", "front", "back"]},
        {"id": "cavity", "op": "fill", "ramp": "cavity", "tone": 2.0, "faces": ["left"]},
        {"id": "cavity_frost", "op": "spots", "count": 9, "radius": [0.3, 0.8], "ramp": "ice", "tone": 3.0,
         "faces": ["left"]}]},
    "fur": {"ramp": "fur", "tone": 5.6, "layers": [
        {"id": "dark_root", "op": "gradient", "axis": "y", "amount": 1.0}, NOISE, STRANDS, STRANDS_Z, FROST]},
    "fur_dark": {"ramp": "fur", "tone": 4.4, "layers": [NOISE, dict(STRANDS, shift=-1.4), dict(STRANDS_Z, shift=-1.4),
                                                       dict(FROST, tone=10.4)]},
    "fur_leg": {"ramp": "fur", "tone": 5.4, "brush": {"flow": "y"}, "layers": [
        {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 1.4}, NOISE,
        STRANDS, STRANDS_Z, dict(FROST, tone=10.6)]},
    "paw": {"ramp": "fur", "tone": 3.6, "layers": [NOISE,
                                                  {"id": "pads", "op": "fill", "ramp": "nose", "tone": 1.0,
                                                   "faces": ["bottom"]}]},
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
    "torn": {"ramp": "bone", "tone": 6.4, "layers": [{"id": "rot", "op": "patches", "scale": 1.2, "threshold": 0.5,
                                                      "ramp": "fur", "tone": 3.0}]},
    # the head: the left half fur, the right half bare skull with a ragged edge where the fur rotted away
    "head": {"ramp": "fur", "tone": 6.0, "layers": [
        {"id": "dark_top", "op": "gradient", "axis": "y", "amount": -0.8}, NOISE,
        dict(STRANDS, period=1.2, faces=["top"]), dict(STRANDS_Z, faces=["right"]),
        dict(FROST, tone=10.4, faces=["sides", "back"]),
        {"id": "skull", "op": "band", "axis": "x", "from": -1.01, "to": -0.08, "wobble": 0.22, "wobble_scale": 0.35,
         "ramp": "bone", "tone": 8.4, "bevel": {"shadow_ramp": "cavity", "shadow_shift": 0, "highlight": 0}},
        {"id": "bone_cracks", "op": "cracks", "scale": 3.0, "width": 0.035, "shift": -2.4, "faces": ["left", "top"]}]},
    "snout": {"ramp": "fur", "tone": 5.4, "layers": [
        {"id": "dark_tip", "op": "gradient", "axis": "z", "amount": -1.0}, NOISE,
        dict(STRANDS, period=1.1, faces=["top"]),
        {"id": "skull", "op": "band", "axis": "x", "from": -1.01, "to": -0.12, "wobble": 0.25, "wobble_scale": 0.3,
         "ramp": "bone", "tone": 8.0, "bevel": {"shadow_ramp": "cavity", "shadow_shift": 0, "highlight": 0}},
        {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.72, "ramp": "nose", "tone": 1.0,
         "faces": ["right"]}]},
    "snout_tip": {"ramp": "fur", "tone": 4.6, "layers": [
        NOISE,
        {"id": "skull", "op": "band", "axis": "x", "from": -1.01, "to": -0.15, "wobble": 0.25, "wobble_scale": 0.3,
         "ramp": "bone", "tone": 7.6, "bevel": {"shadow_ramp": "cavity", "shadow_shift": 0, "highlight": 0}},
        {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.6, "ramp": "nose", "tone": 1.0,
         "faces": ["right", "front"]},
        {"id": "nasal", "op": "rect", "rect": [0.0, 0.35, 0.35, 0.75], "ramp": "cavity", "tone": 0.5,
         "faces": ["front"], "post": True}]},
    "jaw": {"ramp": "fur", "tone": 4.4, "layers": [
        NOISE,
        {"id": "skull", "op": "band", "axis": "x", "from": -1.01, "to": -0.1, "wobble": 0.2, "ramp": "bone",
         "tone": 7.2},
        {"id": "gum", "op": "fill", "ramp": "mouth", "tone": 3.0, "faces": ["top"]}]},
    "nose": {"ramp": "nose", "tone": 1.4, "rim": {"light_shift": 1.0, "dark_shift": -0.6},
             "stamps": [{"face": "front", "at": "top-left", "art": ["h....h", ".n..n."], "key": {"h": "nose:3",
                                                                                                 "n": "cavity:0"}}]},
    "mouth": {"ramp": "mouth", "tone": 2.6},
    "teeth": {"ramp": "bone", "tone": 9.4, "art_key": {}, "brush": {"off": True},
              "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "fang": {"ramp": "bone", "tone": 9.4, "rim": {"light_shift": 1.4, "dark_shift": -1.6}, "brush": {"flow": "y"},
             "layers": [{"id": "grain", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3, "shift": -0.8,
                         "faces": ["sides", "front", "back"]},
                        {"id": "root", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "fang_tip": {"ramp": "bone", "tone": 10.4, "brush": {"off": True}},
    "eye": {"ramp": "glow", "tone": 5.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"face": "front", "at": "top-left", "art": ["wb", "bd"],
                        "key": {"w": "glow:6", "b": "glow:4", "d": "glow:3"}}]},
    "whisker": {"ramp": "mane", "tone": 10.0, "art_key": {"w": "mane:10"}, "brush": {"off": True}, "light": 0},
}

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
               r("chest_fringe_r", 0, 0, -75), r("hip_fringe_l", 0, 0, 70), r("hip_fringe_r", 0, 0, -70),
               r("cheek_fringe_l", 0, 0, -80), r("beard", -60))

# ---------------------------------------------------------------- poses
# rearing roar: the body pitches up about the hip joints, the hind legs stay planted, the forelegs claw the air,
# the head is thrown back with the jaw wide open, the mane flared
REAR = add(r("body", -32), r("chest", -6), r("neck", -24), r("head", -20), r("jaw", 44),
           leg("f", 1, -62, 40, 30, 22), leg("f", -1, -54, 46, 26, 16),
           leg("b", 1, 30, -6, 8, 3), leg("b", -1, 30, -6, 8, 3),
           r("tail", 46), r("tail_mid", 14), r("tail_tip", 8), both("brow", z=6), r("ear_l", -30),
           sc("mane", 0.12, 0.2, 0.1), sc("mane_neck", 0.1, 0.18, 0.08), sc("throat", 0.08, 0.15, 0.05),
           pos("body", 0, 0, -2))
CROUCH = add(r("body", 4), r("chest", 5), r("neck", 12), r("head", 8), r("jaw", 6),
             leg("f", 1, -10, 22, -12), leg("f", -1, -10, 22, -12),
             leg("b", 1, -14, 24, -10), leg("b", -1, -14, 24, -10),
             r("tail", -10), r("ear_l", -24, 0, 10), sc("mane", -0.04, -0.06, -0.02))
SLAM = add(r("body", 5), r("chest", 4), r("neck", 18), r("head", 10), r("jaw", 34),
           leg("f", 1, -18, 4, 14, 6), leg("f", -1, -18, 4, 14, 6),
           leg("b", 1, -8, 12, -4), leg("b", -1, -8, 12, -4), r("tail", 8), r("tail_mid", 6),
           sc("mane", 0.1, -0.06, 0.08), sc("mane_neck", 0.08, -0.05, 0.06), r("ear_l", -28))
# collapsed on the belly: forelegs folded forward like a sphinx, hind legs folded under, head down on its cheek
DOWN = add(r("body", 2), r("chest", 2), r("neck", 10, -8, -10), r("head", 2, -14, -64), r("jaw", 20),
           leg("f", 1, 62, -138, 76, 10), leg("f", -1, 56, -134, 78, 14),
           leg("b", 1, -74, 128, -54, 8), leg("b", -1, -74, 128, -54, 8),
           r("tail", 14), r("tail_mid", 6, 14), r("tail_tip", 4, 10), r("ear_l", 20, 0, -20),
           sc("mane", 0.04, -0.08, 0.04), FLAT_FUR)
STUN_BASE = add(r("neck", 22), r("head", 14), r("jaw", 16), r("body", 3),
                leg("f", 1, -8, 14, -6, 9), leg("f", -1, -8, 14, -6, 9),
                leg("b", 1, -6, 10, -4, 6), leg("b", -1, -6, 10, -4, 6),
                r("tail", -18), r("tail_mid", -10), r("ear_l", 30, 0, -26), both("eye", ch="s", y=-0.45))

# ---------------------------------------------------------------- clips
ANIM = {}

# idle: heavy slow breathing, the mane rising and ruffling, a low growl, looking around, tail sway, a blink
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
    {"part": "jaw", "axis": "x", "osc": {"amp": 2.5, "cycles": 2, "phase": 0.5, "bias": 3.5}},
    {"part": "ear_l", "axis": "z", "keys": [[0, 0], [1.05, 0], [1.1, 14, "out"], [1.3, 0], [2.3, 0], [2.35, 12, "out"],
                                            [2.5, 0]]},
    {"part": "eye_l", "channel": "scale", "keys": [[0, [0, 0, 0]], [1.95, [0, 0, 0]], [2.0, [0, -0.85, 0]],
                                                    [2.1, [0, 0, 0]]]},
    {"part": "eye_r", "channel": "scale", "keys": [[0, [0, 0, 0]], [1.95, [0, 0, 0]], [2.0, [0, -0.85, 0]],
                                                    [2.1, [0, 0, 0]]]},
    {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "y", "amp": 6, "cycles": 1, "lag": 0.14,
                                                          "growth": 1.25}},
    {"part": "tail", "axis": "x", "osc": {"amp": 2.5, "cycles": 2, "phase": 0.2}},
    {"part": "mane0", "axis": "z", "osc": {"amp": 4, "cycles": 3, "phase": 0.0}},
    {"part": "mane1", "axis": "z", "osc": {"amp": -4, "cycles": 3, "phase": 0.15}},
    {"part": "mane2", "axis": "z", "osc": {"amp": 3, "cycles": 3, "phase": 0.3}},
    {"part": "mane3", "axis": "z", "osc": {"amp": -3, "cycles": 3, "phase": 0.45}},
    {"part": "mane4", "axis": "x", "osc": {"amp": 3, "cycles": 3, "phase": 0.6}},
    {"part": "mane5", "axis": "z", "osc": {"amp": 3, "cycles": 3, "phase": 0.75}},
    {"part": "mane6", "axis": "z", "osc": {"amp": -3, "cycles": 3, "phase": 0.9}},
    {"part": "throat_fringe", "axis": "x", "osc": {"amp": 5, "cycles": 3, "phase": 0.2}},
    {"part": "brisket_fringe", "axis": "x", "osc": {"amp": 5, "cycles": 3, "phase": 0.5}},
], "_lock": {}}

# walk: a heavy lateral-sequence walk (left hind, left fore, right hind, right fore), shoulders rolling
WALK_F = [(0.0, (-20, -4, 24)), (0.3, (0, 0, 0)), (0.55, (20, 4, -16)), (0.7, (14, 56, 30)), (0.86, (-22, 26, 10))]
WALK_B = [(0.0, (-18, 4, 14)), (0.3, (0, 0, 0)), (0.55, (22, -10, -10)), (0.7, (8, 38, -6)), (0.86, (-20, 24, -4))]
L = 1.6
ANIM["walk"] = {"length": L, "loop": True, "tracks": (
    gait("b", 1, L, 0.0, WALK_B) + gait("f", 1, L, 0.25, WALK_F) + gait("b", -1, L, 0.5, WALK_B)
    + gait("f", -1, L, 0.75, WALK_F) + [
        {"part": "chest", "axis": "y", "osc": {"amp": 3, "cycles": 1, "phase": 0.1}},
        {"part": "chest", "axis": "z", "osc": {"amp": 2, "cycles": 1, "phase": 0.1}},
        {"part": "hips", "axis": "y", "osc": {"amp": -3, "cycles": 1, "phase": 0.85}},
        {"part": "hips", "axis": "z", "osc": {"amp": 2, "cycles": 1, "phase": 0.85}},
        {"part": "neck", "axis": "x", "osc": {"amp": 2.5, "cycles": 2, "phase": 0.15, "bias": 4}},
        {"part": "head", "axis": "x", "osc": {"amp": -2, "cycles": 2, "phase": 0.2}},
        {"part": "neck", "axis": "y", "osc": {"amp": -3, "cycles": 1, "phase": 0.15}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 1.5, "cycles": 2, "bias": 3}},
        {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "y", "amp": 7, "cycles": 1, "lag": 0.15,
                                                              "growth": 1.25}},
        {"part": "mane", "channel": "scale", "osc": {"amp": [0.02, 0.05, 0.02], "cycles": 2, "phase": 0.3}},
        {"part": "mane_neck", "channel": "scale", "osc": {"amp": [0.02, 0.05, 0.02], "cycles": 2, "phase": 0.35}},
        {"part": "throat_fringe", "axis": "x", "osc": {"amp": 8, "cycles": 2, "phase": 0.4}},
        {"part": "brisket_fringe", "axis": "x", "osc": {"amp": 8, "cycles": 2, "phase": 0.45}},
    ]), "_lock": {}}

# run: a rotary gallop: the hind pair drives, the spine flexes and extends, a flight phase after the forelegs push
RUN_F = [(0.0, (-34, -6, 40)), (0.16, (0, 0, 2)), (0.32, (34, 10, -20)), (0.5, (18, 92, 46)), (0.75, (-52, 24, 26))]
RUN_B = [(0.0, (-34, 6, 26)), (0.16, (0, 0, 0)), (0.32, (40, -18, -16)), (0.5, (14, 58, -8)), (0.75, (-46, 30, 0))]
L = 0.7
ANIM["run"] = {"length": L, "loop": True, "tracks": (
    gait("b", 1, L, 0.0, RUN_B) + gait("b", -1, L, 0.08, RUN_B) + gait("f", -1, L, 0.4, RUN_F)
    + gait("f", 1, L, 0.48, RUN_F) + [
        {"part": "body", "axis": "x", "osc": {"amp": 7, "cycles": 1, "phase": 0.5}},
        {"part": "chest", "axis": "x", "osc": {"amp": 9, "cycles": 1, "phase": 0.55}},
        {"part": "hips", "axis": "x", "osc": {"amp": -11, "cycles": 1, "phase": 0.45}},
        {"part": "neck", "axis": "x", "osc": {"amp": -6, "cycles": 1, "phase": 0.6, "bias": 6}},
        {"part": "head", "axis": "x", "osc": {"amp": 4, "cycles": 1, "phase": 0.65, "bias": -4}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 4, "cycles": 1, "phase": 0.2, "bias": 10}},
        {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "x", "amp": 9, "cycles": 1, "lag": 0.15,
                                                              "growth": 1.2, "bias": 8}},
        {"part": "mane", "channel": "scale", "osc": {"amp": [0.03, 0.08, 0.03], "cycles": 1, "phase": 0.6}},
        {"part": "mane_neck", "channel": "scale", "osc": {"amp": [0.03, 0.08, 0.03], "cycles": 1, "phase": 0.65}},
        {"part": "throat_fringe", "axis": "x", "osc": {"amp": -14, "cycles": 1, "phase": 0.6, "bias": -10}},
        {"part": "brisket_fringe", "axis": "x", "osc": {"amp": -14, "cycles": 1, "phase": 0.6, "bias": -10}},
        {"part": "ear_l", "axis": "x", "osc": {"amp": 0, "cycles": 1, "bias": -30}},
    ]), "_lock": {"lift": [[0, 0], [0.42, 0], [0.54, 3.2, "out"], [0.64, 1.6], [0.7, 0, "in"]]}}

# roar: anticipation crouch, rear up roaring with the forelegs clawing the air, a long trembling hold, slam down
ANIM["roar"] = timeline(2.0, [
    (0.0, REST, None), (0.3, CROUCH, "ease"), (0.6, REAR, "out_back"), (1.15, add(REAR, r("neck", -4), r("jaw", 4)), "ease"),
    (1.38, SLAM, "in"), (1.55, add(r("body", -2), r("neck", 6), r("jaw", 14), sc("mane", 0.04, 0.04, 0.03)), "out"),
    (2.0, REST, "ease")],
    extra=[jitter("head", 0.62, 1.15, 2.2, axis=2, seed=1), jitter("jaw", 0.62, 1.15, 3.0, seed=2),
           jitter("mane", 0.62, 1.15, 0.04, ch="scale", axis=1, seed=3)])

# frozen: the roar's peak, held (the Mauler is frozen in its tomb mid-roar)
ANIM["frozen"] = timeline(1.0, [(0.0, REAR, None), (1.0, REAR, None)], loop=True)

# claw_l: weight onto the right, the left foreleg winds up high and out, swipes down and across, follows through
CLAW_L_WIND = add(r("body", 0, 0, 5), r("chest", 0, 16, 3), r("neck", -6, -12), r("head", 0, -6, 6), r("jaw", 12),
                  leg("f", 1, -112, 56, 36, 40), leg("f", -1, 6, 4, -10, 4), r("tail", 6, -10), r("ear_l", -26))
CLAW_L_HIT = add(r("body", 2, 0, -3), pos("body", 0, 0, 2.5), r("chest", 4, -18, -2), r("neck", 6, 10), r("head", 4, 8, -4),
                 r("jaw", 26), leg("f", 1, -34, -8, 12, -30), leg("f", -1, -6, 10, -4, 6), r("tail", 0, 12))
CLAW_L_FOLLOW = add(r("body", 2, 0, -4), pos("body", 0, 0, 2.5), r("chest", 5, -24, -3), r("neck", 8, 16), r("head", 5, 10, -6),
                    r("jaw", 16), leg("f", 1, -8, 14, -4, -40), leg("f", -1, -6, 10, -4, 6), r("tail", 0, 16))
ANIM["claw_l"] = timeline(0.8, [(0.0, REST, None), (0.22, CLAW_L_WIND, "out"), (0.3, add(CLAW_L_WIND, leg("f", 1, -6, 6, 4)), "ease"),
                                (0.4, CLAW_L_HIT, "in"), (0.52, CLAW_L_FOLLOW, "out"), (0.8, REST, "back")])
ANIM["claw_r"] = timeline(0.8, [(0.0, REST, None), (0.22, mirror_pose(CLAW_L_WIND), "out"),
                                (0.3, mirror_pose(add(CLAW_L_WIND, leg("f", 1, -6, 6, 4))), "ease"),
                                (0.4, mirror_pose(CLAW_L_HIT), "in"), (0.52, mirror_pose(CLAW_L_FOLLOW), "out"),
                                (0.8, REST, "back")])

# fury: a loop of lunging bites: gather, spring forward with the jaw wide, snap shut, land with a squash
FURY_GATHER = add(r("body", 5), r("chest", 5), r("neck", 8), r("head", 4), r("jaw", 6), pos("body", 0, 0, -1),
                  leg("f", 1, 8, 22, -30), leg("f", -1, 8, 22, -30), leg("b", 1, -18, 30, -12), leg("b", -1, -18, 30, -12),
                  sc("mane", -0.03, -0.06, -0.02), r("ear_l", -30))
FURY_LUNGE = add(r("body", -8), pos("body", 0, 0, 4), r("neck", -8), r("head", -12), r("jaw", 46),
                 leg("f", 1, -44, -6, 40), leg("f", -1, -40, -8, 36), leg("b", 1, 34, -10, 26), leg("b", -1, 34, -10, 26),
                 sc("mane", 0.06, 0.1, 0.04), r("ear_l", -36), r("tail", 14))
FURY_BITE = add(r("body", 1), pos("body", 0, 0, 4.5), r("neck", 12), r("head", 14), r("jaw", -2),
                leg("f", 1, -24, 0, 22), leg("f", -1, -22, 0, 20), leg("b", 1, 22, -4, 12), leg("b", -1, 22, -4, 12),
                r("ear_l", -36), r("tail", 8))
FURY_LAND = add(r("body", 6), pos("body", 0, 0, 2), r("chest", 4), r("neck", 10), r("head", 6), r("jaw", 10),
                leg("f", 1, -8, 24, -14), leg("f", -1, -8, 24, -14), leg("b", 1, -6, 18, -10), leg("b", -1, -6, 18, -10),
                sc("mane", 0.08, -0.08, 0.06), r("ear_l", -30))
ANIM["fury"] = timeline(0.5, [(0.0, FURY_GATHER, None), (0.12, FURY_LUNGE, "out"), (0.2, FURY_BITE, "in"),
                              (0.32, FURY_LAND, "out"), (0.5, FURY_GATHER, "ease")], loop=True,
                        extra=[{"parts": ["tail", "tail_mid", "tail_tip"],
                                "wave": {"axis": "x", "amp": 7, "cycles": 1, "lag": 0.12, "growth": 1.2}}],
                        lift=[[0, 0], [0.06, 0.4], [0.13, 4.5, "out"], [0.2, 3.0], [0.3, 0, "in"], [0.5, 0]])

# stunned: head low and swaying, jaw slack, wobbling on splayed legs, eyes half shut
ANIM["stunned"] = timeline(1.5, [(0.0, STUN_BASE, None), (1.5, STUN_BASE, None)], loop=True, extra=[
    {"part": "body", "axis": "z", "osc": {"amp": 4, "cycles": 1}},
    {"part": "body", "axis": "y", "osc": {"amp": 3, "cycles": 1, "phase": 0.25}},
    {"part": "neck", "axis": "y", "osc": {"amp": 12, "cycles": 1, "phase": 0.1}},
    {"part": "head", "axis": "z", "osc": {"amp": 10, "cycles": 1, "phase": 0.3}},
    {"part": "neck", "axis": "x", "osc": {"amp": 4, "cycles": 2, "phase": 0.2}},
    {"part": "jaw", "axis": "x", "osc": {"amp": 5, "cycles": 2, "phase": 0.35}},
    {"part": "front_leg_l", "axis": "z", "osc": {"amp": -3, "cycles": 1}},
    {"part": "front_leg_r", "axis": "z", "osc": {"amp": -3, "cycles": 1}},
    {"part": "back_leg_l", "axis": "z", "osc": {"amp": -2.5, "cycles": 1}},
    {"part": "back_leg_r", "axis": "z", "osc": {"amp": -2.5, "cycles": 1}},
    {"parts": ["tail", "tail_mid", "tail_tip"], "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.18}},
    {"part": "ear_l", "axis": "z", "osc": {"amp": 6, "cycles": 2, "phase": 0.4}},
])

# wake: frozen mid-roar, the ice cracks, it crashes down onto its belly, lies stunned, pushes up, shakes off the ice
SIT = add(r("body", -18), r("chest", 4), r("neck", 8), r("head", 6), r("jaw", 10),
          leg("f", 1, 18, -4, 4), leg("f", -1, 18, -4, 4), leg("b", 1, -60, 112, -40, 6), leg("b", -1, -60, 112, -40, 6),
          r("tail", -16), r("tail_mid", -8))
SHAKE = []
for k, (t, a) in enumerate([(2.24, 9), (2.33, -11), (2.42, 10), (2.51, -9), (2.6, 7), (2.69, -5), (2.78, 3)]):
    SHAKE.append((t, add(r("chest", 0, 0, a), r("hips", 0, 0, -a * 0.7), r("neck", -4, -a * 1.4, a * 0.8),
                         r("head", 0, -a * 1.2, a * 1.4), r("tail", 0, a * 2.2), r("tail_mid", 0, a * 1.6),
                         r("ear_l", 0, 0, a * 2), sc("mane", 0.1, 0.12, 0.08), sc("mane_neck", 0.08, 0.12, 0.06),
                         r("jaw", 8)), "ease"))
ANIM["wake"] = timeline(3.0, [
    (0.0, REAR, None), (0.3, REAR, None),
    (0.58, add(r("body", 10), r("chest", 4), r("neck", 18), r("head", 8), r("jaw", 26), leg("f", 1, -30, 10, 20, 8),
               leg("f", -1, -26, 8, 18, 8), leg("b", 1, -10, 18, -6), leg("b", -1, -10, 18, -6), r("tail", 10)), "in"),
    (0.78, DOWN, "out"), (0.9, add(DOWN, r("neck", -4), r("head", -3)), "ease"), (1.45, DOWN, "ease"),
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
           {"part": "front_paw_l", "axis": "x", "keys": [[0, 0], [1.05, 0], [1.12, -18, "out"], [1.25, 0]]}])

# death: hit, a last howl, staggers, the forelegs give, crashes down, rolls onto its right flank, a last breath
DEATH_HOWL = add(r("body", -6), r("chest", -4), r("neck", -24), r("head", -14), r("jaw", 38),
                 leg("f", 1, -22, 18, 10), leg("f", -1, -12, 10, 6), r("tail", 12), r("ear_l", -30))
DEATH_STAGGER = add(r("body", 0, 8, -7), r("neck", 6, -8), r("head", 10, 0, 10), r("jaw", 24),
                    leg("f", -1, -8, 10, -2, 6), leg("f", 1, -16, 46, -20, 4), leg("b", -1, -4, 10, -4),
                    leg("b", 1, -10, 22, -8), r("tail", -4))
DEATH_CRASH = add(r("body", 8, 6, -6), r("chest", 4), r("neck", 12, -6, 0), r("head", 6, 0, -30), r("jaw", 18),
                  leg("f", 1, 52, -128, 70, 16), leg("f", -1, 58, -134, 70, 20),
                  leg("b", 1, -12, 26, -10, 4), leg("b", -1, -16, 32, -12, 6), r("tail", -14))
DEATH_ROLL = add(r("body", 4, 6, -40), r("neck", -12, 14, -14), r("head", -6, 12, -40), r("jaw", 22),
                 leg("f", 1, 24, -30, 10, -46), leg("f", -1, 10, -14, 8, 28),
                 leg("b", 1, -24, 40, -16, -44), leg("b", -1, -14, 22, -8, 26),
                 r("tail", 6, -14), r("tail_mid", 2, -16), r("tail_tip", 2, -10), r("ear_l", 20, 0, -20), FLAT_FUR)
DEATH_END = add(DEATH_ROLL, r("body", 0, 0, 3), r("jaw", 6), sc("chest", -0.03, 0, -0.02), sc("mane", -0.04, -0.08, -0.03),
                both("eye", ch="s", y=-0.85))
ANIM["death"] = timeline(2.0, [
    (0.0, REST, None), (0.12, DEATH_HOWL, "out"), (0.42, DEATH_STAGGER, "ease"), (0.72, DEATH_CRASH, "in"),
    (0.86, add(DEATH_CRASH, r("neck", -8), r("head", -4)), "out"), (1.18, DEATH_ROLL, "in"),
    (1.32, add(DEATH_ROLL, r("body", 0, 0, 5)), "out"), (1.7, DEATH_END, "ease"), (2.0, DEATH_END, None)])


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
    "minecraft": {"fps": 20, "glow_parts": ["eye_l", "eye_r", "frost_core"]},
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
