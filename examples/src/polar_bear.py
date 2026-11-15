"""Builds examples/polar_bear.json: the Winterworks polar bear (replaces the vanilla polar bear's look).

    python examples/src/polar_bear.py examples/polar_bear.json

A powerful, dangerous bear in Minecraft style: a massive shoulder hump, a long thick neck carried low, a long heavy
head with a strong brow and small dark eyes, black nose and lips, shaggy fur, big paws with dark claws. Cream fur with
cool blue-grey shadows. The fur is mostly alpha-cut cards (zero-thickness cubes in Minecraft, drawn with
entityCutoutNoCull): straggly fringes along the hump, back, neck, belly edge, elbows, thighs and the stub tail.
Minecraft pixel units (16 per block), density 1: exports 1:1 to a vanilla entity model (python -m lowpix mc export).
Faces +Z, ground at y=0.

Contract (mods/winterworks/docs/COLD_UPDATE.md section 3): bones body, neck, head, jaw, ear_l, ear_r, front_leg_l,
front_leg_r, back_leg_l, back_leg_r, tail, mouth_item (an empty locator where a carried salmon is drawn). Parts named
fur_* are the long fur (hidden when shorn; the boxes under them are complete on their own). Parts named zombie_* are
only drawn on the zombie polar bear (and are fully transparent in the other textures as well). "right" is -X.
Texture variants share the one box-UV layout and are written to examples/variants/:
polar_bear_sheared (cropped fur, pink-grey skin on the shorn areas) and zombie_polar_bear (rotting fur, wounds,
bone-white zombie_* parts, glowing icy eyes; its emissive texels go to zombie_polar_bear_glow.png).
"""
import copy
import json
import math
import os
import random
import sys

import numpy as np

P = []
W = {}      # rest frames (rotation, pivot) of the parts placed so far, in world space


def _rot(deg):
    """lowpix Euler rotation (degrees, applied X then Y then Z: Rz @ Ry @ Rx)."""
    rx, ry, rz = (math.radians(float(a)) for a in deg)
    Rx = np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]])
    Ry = np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]])
    Rz = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _euler(R):
    ry = math.asin(max(-1.0, min(1.0, -R[2, 0])))
    return [math.degrees(math.atan2(R[2, 1], R[2, 2])), math.degrees(ry), math.degrees(math.atan2(R[1, 0], R[0, 0]))]


def r3(v):
    return [round(float(x), 3) + 0.0 for x in v]


def part(shape, id, parent, pos, rot, style, rel=False, **kw):
    """Place a part. pos/rot: its pivot and absolute rotation in WORLD space (rest pose); rel=True: in the parent's
    frame, like a lowpix spec. Every part is stored parent-relative, as lowpix and Minecraft want."""
    rot = rot or [0, 0, 0]
    R, t = _rot(rot), np.array(pos, float)
    if parent:
        Rp, tp = W[parent]
        if rel:
            lp, lr = list(pos), list(rot)
            R, t = Rp @ R, tp + Rp @ t
        else:
            lp, lr = Rp.T @ (t - tp), _euler(Rp.T @ R)
    else:
        lp, lr = pos, rot
    W[id] = (R, t)
    d = {"id": id, "shape": shape, "pivot": r3(lp), "style": style}
    if parent:
        d["parent"] = parent
    if any(abs(a) > 1e-6 for a in lr):
        d["rotation"] = r3(lr)
    for k in ("offset",):
        if kw.get(k) is not None:
            kw[k] = r3(kw[k])
    d.update({k: v for k, v in kw.items() if v is not None})
    P.append(d)
    return d


def box(id, parent, size, pos, style, offset=None, rot=None, rel=False, **kw):
    return part("box", id, parent, pos, rot, style, rel, size=size, offset=offset, **kw)


def card(id, parent, art, pos, style, plane="yz", offset=None, rot=None, rel=True, **kw):
    return part("card", id, parent, pos, rot, style, rel, plane=plane, art=art, offset=offset, **kw)


def bone(id, parent, pos, rot=None, rel=True):
    return part("bone", id, parent, pos, rot, "fur", rel)


SIDES = (("l", 1), ("r", -1))      # left is +X, right is -X


def mx(v, sx):
    return [v[0] * sx, v[1], v[2]]


def mr(r, sx):
    return [r[0], r[1] * sx, r[2] * sx]


def strands(w, h, seed, up=False, root=2, lo=0.5):
    """Straggly fur: `w` x `h` card art of pointed clumps of strands hanging from the top rows (or standing up from
    the bottom rows with up=True). 't' is painted fur, 'h' a lighter tip, 'd' a dark crevice, '.' is cut away."""
    rnd = random.Random(seed)
    lengths = []
    while len(lengths) < w:
        cw = rnd.choice((2, 3, 3, 4))
        peak = rnd.randint(max(root + 1, int(round(h * lo))), h)
        prof = {2: [0, 1], 3: [1, 0, 1], 4: [2, 0, 0, 1]}[cw]
        if rnd.random() < 0.5:
            prof = prof[::-1]
        lengths += [max(root + 1, peak - d) for d in prof]
        if rnd.random() < 0.35:
            lengths.append(max(root, int(round(h * 0.3))))
    lengths = lengths[:w]
    g = [["." for _ in range(w)] for _ in range(h)]
    for x, n in enumerate(lengths):
        for y in range(n):
            g[y][x] = "t"
        if n >= root + 2:
            g[n - 1][x] = "h"
        nb = max(lengths[max(0, x - 1)], lengths[min(w - 1, x + 1)])
        if n < nb - 1 and n >= 1:
            g[n - 1][x] = "d"
    rows = ["".join(r) for r in g]
    return rows[::-1] if up else rows


# ------------------------------------------------------------------ the torso (world positions, rest pose)
# body (the barrel) is the root: its pivot sits just ahead of the hip joints, so rearing up turns on the hind legs.
L = 1.5      # torso lift above the legs
box("body", None, [17, 13, 10], [0, 14.5 + L, -6], "fur_body", offset=[0, 1.5, 4.5])
box("rump", "body", [16, 12, 11], [0, 15.5 + L, -6], "fur", offset=[0, -0.5, -5], rot=[-13, 0, 0])
box("rump_cap", "rump", [13, 3, 9], [0, 19.2 + L, -10.2], "fur_top", rot=[-19, 0, 0])
box("tail", "rump", [4, 4, 4], [0, 17.2 + L, -16.0], "fur_top", offset=[0, 0, -1.6], rot=[-38, 0, 0])
box("chest", "body", [18, 15, 12], [0, 15.5 + L, 0.5], "fur", offset=[0, 0, 6], rot=[-4, 0, 0])
# the shoulder hump: a heavy mass of muscle over the front legs, falling away into the neck and down the back
box("hump", "chest", [16, 5, 13], [0, 22 + L, 2], "fur_top", offset=[0, 1.6, 1.5], rot=[-7, 0, 0])
box("hump_rear", "body", [14, 4, 9], [0, 23 + L, -0.5], "fur_top", offset=[0, -0.8, -4], rot=[-16, 0, 0])
# a long thick neck, carried low and forward
box("neck", "chest", [12, 10, 10], [0, 19.5 + L, 9.5], "fur", offset=[0, 0, 4.5], rot=[26, 0, 0])
box("neck_ruff", "neck", [13, 4, 9], [0, 22.3 + L, 11.0], "fur_top", offset=[0, 0, 1.5], rot=[18, 0, 0])

# ------------------------------------------------------------------ the head: long and heavy, a strong frowning brow
H = 15.5 + L     # the skull's pivot height (the top of the neck)
box("head", "neck", [11, 9, 9], [0, H, 18], "head", offset=[0, 1.2, 4.0], rot=[6, 0, 0])
box("snout", "head", [7, 5, 8], [0, H + 0.2, 26.0], "muzzle", offset=[0, 0, 4], rot=[14, 0, 0])
box("snout_bridge", "snout", [5, 1, 6], [0, 2.8, 3.4], "muzzle_top", rel=True)
box("nose", "snout", [5, 2, 2], [0, 1.6, 7.7], "nose", rel=True)
box("jaw", "head", [6, 2, 8], [0, H - 2.9, 25.0], "jaw", offset=[0, -0.4, 4], rot=[14, 0, 0])
box("teeth", "jaw", [3, 1, 1], [0, 0.6, 7.3], "teeth", rel=True)
bone("mouth_item", "jaw", [0, 0.4, 5.8])
for s, sx in SIDES:
    box(f"brow_{s}", "head", [5, 2, 3], mx([2.8, H + 3.8, 26.3], sx), "brow", rot=mr([16, 0, 12], sx))
    box(f"eye_{s}", "head", [2, 1, 1], mx([4.2, H + 2.0, 26.9], sx), "eye", rot=mr([6, 14, -10], sx))
    box(f"ear_{s}", "head", [3, 3, 2], mx([4.4, H + 5.0, 19.8], sx), f"ear_{s}", offset=[0, 1.1, 0], rot=mr([-10, -24, -28], sx))
    box(f"cheek_{s}", "head", [2, 6, 7], mx([5.1, H - 0.4, 22.8], sx), "head", rot=mr([6, 10, 8], sx))
    box(f"fang_{s}", "snout", [1, 2, 1], mx([2.6, -2.6, 6.4], sx), "teeth", rel=True)
    box(f"jaw_fang_{s}", "jaw", [1, 2, 1], mx([2.1, 0.4, 6.0], sx), "teeth", rel=True)

HR, HT = W["head"]
SOCKETS = [r3(HR.T @ (W[f"eye_{s}"][1] - HT)) for s, _ in SIDES]     # eye centres in head part space

# ------------------------------------------------------------------ legs: thick pillars, big paws, dark claws
for s, sx in SIDES:
    fl, ff, fp = f"front_leg_{s}", f"front_forearm_{s}", f"front_paw_{s}"
    box(fl, "chest", [6, 10, 7], mx([6.2, 16.5 + L, 6.0], sx), "leg", offset=mx([0.3, -4.2, 0], sx), rot=mr([0, 0, -2], sx))
    box(ff, fl, [6, 8, 6], mx([6.4, 9.4, 6.2], sx), "leg", offset=[0, -3.0, 0.7])
    box(fp, ff, [7, 3, 9], mx([6.4, 2.7, 6.5], sx), "paw", offset=[0, -1.2, 2.3], snap_ground=0.0)
    for k, x in enumerate((-2.4, -0.8, 0.8, 2.4)):
        box(f"front_claw_{s}{k}", fp, [1, 1, 2], [x, -2.1, 7.2], "claw", rel=True)
    bl, bs, bp = f"back_leg_{s}", f"back_shin_{s}", f"back_paw_{s}"
    box(bl, "rump", [7, 11, 10], mx([5.6, 16.0 + L, -11.0], sx), "leg", offset=mx([0.4, -3.6, -0.6], sx),
        rot=mr([-4, 0, -2], sx))
    box(bs, bl, [5, 8, 6], mx([5.9, 9.2, -12.2], sx), "leg", offset=[0, -3.0, 0.2], rot=[10, 0, 0])
    box(bp, bs, [7, 3, 10], mx([5.9, 2.7, -11.6], sx), "paw", offset=[0, -1.2, 2.6], snap_ground=0.0)
    for k, x in enumerate((-2.4, -0.8, 0.8, 2.4)):
        box(f"back_claw_{s}{k}", bp, [1, 1, 2], [x, -2.1, 7.6], "claw", rel=True)

# ------------------------------------------------------------------ long fur (fur_*: hidden when the bear is shorn)
# Straggly card fringes, placed in their parent's frame. A card is centred on pivot + offset; hanging fringes pivot
# at their top edge so a roll (rot z) flares them out. Mirrored copies get _mirror (still fur_*).
FUR = "fur_card"
# shoulder hump: crests standing up along the top and a shaggy mane falling over the shoulders
card("fur_hump_crest", "hump", strands(14, 6, 1, up=True), [0, 3.6, 1.5], FUR, offset=[0, 1.6, 0], rot=[-8, 0, 0])
card("fur_hump_crest_side", "hump", strands(12, 5, 2, up=True), [4.0, 3.4, 1.5], FUR, offset=[0, 1.4, 0],
     rot=[-6, 0, -26], mirror=True)
card("fur_mane", "hump", strands(13, 8, 3), [7.6, 1.6, 1.5], FUR, offset=[0, -3.0, 0], rot=[0, 0, 24], mirror=True)
card("fur_back_crest", "hump_rear", strands(10, 5, 4, up=True), [0.3, 1.8, -4.0], FUR, offset=[0, 1.2, 0], rot=[-10, 0, 0])
card("fur_rump_crest", "rump_cap", strands(9, 4, 5, up=True), [-0.3, 1.3, -0.5], FUR, offset=[0, 1.0, 0], rot=[-6, 0, 0])
# neck: a crest along the top, shaggy sides and a throat mane
card("fur_neck_crest", "neck_ruff", strands(10, 5, 6, up=True), [-0.3, 1.8, 1.5], FUR, offset=[0, 1.2, 0], rot=[-14, 0, 0])
card("fur_neck_side", "neck", strands(10, 7, 7), [5.4, 1.5, 4.5], FUR, offset=[0, -2.8, 0], rot=[0, 0, 22], mirror=True)
card("fur_throat", "neck", strands(9, 7, 8), [2.4, -4.6, 5.0], FUR, offset=[0, -2.6, 0], rot=[0, 0, 8], mirror=True)
# the belly edge, the chest and the flanks
card("fur_flank", "body", strands(11, 8, 9), [8.2, -2.0, 4.5], FUR, offset=[0, -3.4, 0], rot=[0, 0, 18], mirror=True)
card("fur_belly", "body", strands(10, 6, 10), [3.6, -4.6, 4.5], FUR, offset=[0, -2.4, 0], rot=[0, 0, 8], mirror=True)
card("fur_belly_mid", "body", strands(10, 5, 11), [0, -4.6, 4.5], FUR, offset=[0, -2.0, 0])
card("fur_chest_side", "chest", strands(12, 8, 12), [8.8, -3.0, 6.0], FUR, offset=[0, -3.4, 0], rot=[0, 0, 16], mirror=True)
card("fur_chest", "chest", strands(14, 8, 13), [0, -5.0, 12.2], FUR, plane="xy", offset=[0, -3.0, 0], rot=[-14, 0, 0])
card("fur_chest_low", "chest", strands(10, 6, 14), [0, -6.4, 8.5], FUR, plane="xy", offset=[0, -2.4, 0], rot=[-6, 0, 0])
card("fur_rump_side", "rump", strands(10, 7, 15), [7.8, -2.8, -5.0], FUR, offset=[0, -3.0, 0], rot=[0, 0, 16],
     mirror=True)
card("fur_rump_back", "rump", strands(12, 6, 16), [0, -1.0, -10.7], FUR, plane="xy", offset=[0, -2.6, 0], rot=[16, 0, 0])
# the stub tail: a tuft
card("fur_tail", "tail", strands(5, 5, 17, up=True), [0.25, 1.0, -1.4], FUR, offset=[0, 1.2, -0.4], rot=[-20, 0, 0])
card("fur_tail_tip", "tail", strands(5, 5, 18), [0, -0.2, -3.5], FUR, plane="xy", offset=[0, -1.6, 0], rot=[24, 0, 0])
# legs: feathering behind the elbows and forearms, shaggy trousers on the hind legs; jowl ruffs on the head
for s, sx in SIDES:
    card(f"fur_cheek_{s}", f"cheek_{s}", strands(6, 5, 19 + (sx > 0)), mx([0.9, -2.2, -0.5], sx), FUR, offset=[0, -1.8, 0],
         rot=mr([0, 0, 16], sx))
    card(f"fur_elbow_{s}", f"front_leg_{s}", strands(5, 9, 21 + (sx > 0)), mx([0.3, -3.0, -3.6], sx), FUR,
         offset=[0, -3.4, 0], rot=[-14, 0, 0])
    card(f"fur_forearm_{s}", f"front_forearm_{s}", strands(4, 6, 23 + (sx > 0)), [0, -0.8, -2.8], FUR,
         offset=[0, -2.4, 0], rot=[-10, 0, 0])
    card(f"fur_shoulder_{s}", f"front_leg_{s}", strands(7, 7, 29 + (sx > 0)), mx([3.4, -3.0, 0.2], sx), FUR,
         offset=[0, -2.4, 0], rot=mr([0, 0, 12], sx))
    card(f"fur_thigh_{s}", f"back_leg_{s}", strands(6, 10, 25 + (sx > 0)), mx([0.4, -2.0, -5.8], sx), FUR,
         offset=[0, -3.8, 0], rot=[-12, 0, 0])
    card(f"fur_thigh_side_{s}", f"back_leg_{s}", strands(9, 7, 27 + (sx > 0)), mx([4.1, -4.6, -0.8], sx), FUR,
         offset=[0, -2.4, 0], rot=mr([0, 0, 12], sx))

# ------------------------------------------------------------------ zombie_* (only drawn on the zombie polar bear)
# bare ribs on the left flank (a bone card just off the body, over a painted wound), bare vertebrae along the back,
# a torn ear flap, the jaw bone bared on the right
RIBS = ["b..b..b..b...",
        "bb.bb.bb.bb..",
        ".b..b..b..b..",
        ".bb.bb.bb.bb.",
        "..b..b..b..b.",
        "..b..b..b..b.",
        "..bb.bb.bb.bb",
        "...b..b..b..b"]
card("zombie_ribs", "body", RIBS, [8.62, 2.0, 4.5], "zombie_bone")
SPINE = ["..b...b...b...b...",
         ".bb..bb..bb..bb..b",
         "bbbbbbbbbbbbbbbbbb"]
card("zombie_spine", "hump_rear", SPINE, [-0.55, 2.3, -4.6], "zombie_bone", rot=[-4, 0, 0])
card("zombie_spine_rump", "rump_cap", [".b...b...b.", "bb..bb..bb.", "bbbbbbbbbbb"], [0.5, 1.9, -0.5], "zombie_bone")
box("zombie_jaw", "jaw", [1, 3, 6], [-3.35, -1.2, 3.6], "zombie_bone", rel=True)
box("zombie_teeth", "snout", [1, 1, 4], [-3.2, -2.7, 3.4], "zombie_bone", rel=True)
card("zombie_ear", "ear_r", ["ff.", "fff", ".ff", "..f"], [-0.4, -0.4, 0.2], "zombie_flesh", plane="xy",
     offset=[0, -2.0, 0], rot=[18, 0, 34])

# ------------------------------------------------------------------ paint
RAMPS = {
    # cream fur: warm cream highlights, cool blue-grey shadows, a tinted near-black
    "fur": ["#1b1e2b", "#252a39", "#313748", "#3e4558", "#4d5569", "#5e677b", "#717a8e", "#868fa1", "#9ca4b3",
            "#b2b9c4", "#c8ccd2", "#d9dbd8", "#e7e4d8", "#f2ecda", "#f9f4e5"],
    "skin": ["#0b0c10", "#13151b", "#1c1f27", "#272b34", "#353a44", "#474c57"],
    "claw": ["#0e0c0b", "#181513", "#23201c", "#302b26", "#3f3932", "#504940"],
    "eye": ["#050506", "#0c0d10", "#16181c", "#252930", "#4a515b"],
    "mouth": ["#150b11", "#22121b", "#331a28", "#462436", "#5b3146", "#724157"],
    "bone": ["#3a3428", "#544c3b", "#706650", "#8d8367", "#aaa080", "#c4bb9a", "#dbd4b6", "#ece8d2", "#f8f6e8"],
}
LIGHT = {"dir": [-0.4, 1.0, 0.55], "strength": 0.75, "gradient": 0.8, "ao": 1.4, "ao_height": 10.0}
BRUSH = {"flow": "z", "length": 3.0, "width": 1.0, "rough": 0.75, "overshoot": 0.3,
         "textures": {"fur": "fur", "bone": "wood", "claw": "wood"}}
INVISIBLE = [{"faces": ["all"], "at": "top-left", "art": ["_" * 24] * 24}]


def styles_for(v="base"):
    """Paint for one coat. v: base | sheared | zombie. Only paint changes, so every coat fits the one UV layout."""
    zombie = v == "zombie"
    shorn = v == "sheared"
    # directional strands: dark strand lines and light strand lines, vertical on the sides, along the body on top
    hair = {"id": "hair", "op": "stripes", "axis": "z", "period": 1.7, "width": 0.26, "shift": -1.5, "wobble": 0.5,
            "faces": ["left", "right"]}
    hair_x = {"id": "hair_x", "op": "stripes", "axis": "x", "period": 1.7, "width": 0.26, "shift": -1.5, "wobble": 0.5,
              "faces": ["front", "back", "top"]}
    shine = {"id": "shine", "op": "stripes", "axis": "z", "period": 2.3, "width": 0.2, "phase": 0.45, "shift": 1.2,
             "wobble": 0.6, "faces": ["left", "right"]}
    shine_x = {"id": "shine_x", "op": "stripes", "axis": "x", "period": 2.3, "width": 0.2, "phase": 0.45, "shift": 1.2,
               "wobble": 0.6, "faces": ["front", "back", "top"]}
    clumps = {"id": "clumps", "op": "patches", "scale": 1.5, "threshold": 0.64, "shift": -0.9}
    lights = {"id": "lights", "op": "patches", "scale": 1.3, "threshold": 0.68, "shift": 0.9, "faces": ["top", "sides"]}
    tips = {"id": "tips", "op": "drip", "ramp": "fur", "tone": 13.4, "depth": 0.5, "length": 2.2, "width": 0.55,
            "scale": 1.6, "faces": ["sides", "front", "back"]}
    noise = {"id": "noise", "op": "speckle", "density": 0.05, "shift": -1.2}
    coat = [{"id": "under", "op": "gradient", "axis": "y", "amount": 2.6}, clumps, lights, tips, hair, hair_x, shine,
            shine_x, noise]
    st = {
        "fur": {"ramp": "fur", "tone": 9.6, "layers": coat},
        "fur_body": {"ramp": "fur", "tone": 9.6, "layers": coat},
        "fur_top": {"ramp": "fur", "tone": 10.4, "layers": [dict(coat[0], amount=1.8)] + coat[1:]},
        "leg": {"ramp": "fur", "tone": 9.2, "brush": {"flow": "y", "length": 2.4}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.8},
            clumps, lights, dict(hair, axis="z", faces=["left", "right"]), dict(hair_x, faces=["front", "back"]),
            noise]},
        "paw": {"ramp": "fur", "tone": 8.8, "brush": {"flow": "z", "length": 2.0}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6},
            {"id": "toes", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.22, "shift": -2.2,
             "faces": ["front", "top"]},
            {"id": "pads", "op": "fill", "ramp": "skin", "tone": 2.0, "faces": ["bottom"]}]},
        "claw": {"ramp": "claw", "tone": 2.6, "brush": {"off": True}, "layers": [
            {"id": "tip", "op": "gradient", "axis": "z", "amount": -1.6}]},
        "head": {"ramp": "fur", "tone": 10.2, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 2.0},
            dict(clumps, scale=1.2), dict(lights, scale=1.1), hair, hair_x, noise]},
        "brow": {"ramp": "fur", "tone": 10.2, "rim": {"light_shift": 1.4, "dark_shift": -2.0}, "layers": [
            {"id": "shade", "op": "gradient", "axis": "y", "amount": 2.2},
            {"id": "under", "op": "fill", "shift": -3.0, "faces": ["bottom"]}]},
        # the long Roman nose: cream on top, black lips along the bottom edge
        "muzzle": {"ramp": "fur", "tone": 10.2, "brush": {"length": 2.0}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 2.0},
            dict(hair_x, period=1.6),
            {"id": "lip", "op": "band", "axis": "y", "from": -1.0, "to": -0.7, "ramp": "skin", "tone": 1.4,
             "faces": ["sides", "front"]}]},
        "muzzle_top": {"ramp": "fur", "tone": 11.4, "brush": {"length": 2.0}},
        "nose": {"ramp": "skin", "tone": 1.6, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "bottom", "art": ["n..n"], "key": {"n": "skin:0"}},
            {"face": "front", "at": "top-left", "art": [".hh."], "key": {"h": "skin:5"}},
            {"face": "top", "at": "bottom-left", "art": [".h.."], "key": {"h": "skin:5"}}]},
        "jaw": {"ramp": "fur", "tone": 9.6, "brush": {"length": 2.0}, "layers": [
            {"id": "lip", "op": "band", "axis": "y", "from": 0.2, "to": 1.0, "ramp": "skin", "tone": 2.0,
             "faces": ["front"]},
            {"id": "chin", "op": "gradient", "axis": "y", "amount": 1.4},
            {"id": "tongue", "op": "fill", "ramp": "mouth", "tone": 3.0, "faces": ["top"]}]},
        "teeth": {"ramp": "bone", "tone": 6.6, "brush": {"off": True}},
        # small dark eyes, one dim glint
        "eye": {"ramp": "eye", "tone": 0.6, "light": 0, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "top-left", "art": ["h"], "key": {"h": "eye:4"}}]},
        "ear_l": {"ramp": "fur", "tone": 9.6, "brush": {"off": True}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4}], "stamps": [
            {"face": "front", "at": "top-left", "art": ["_._", ".d.", "..."], "key": {"d": "fur:8"}},
            {"face": "back", "at": "top-left", "art": ["_._"]}]},
        "fur_card": {"ramp": "fur", "tone": 9.4, "light": 0.6, "rim": {"light": 0, "dark": 0}, "art_key": {"h": "fur:12", "d": "fur:3"},
                     "brush": {"flow": "y", "length": 2.6, "rough": 0.9}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2},
            {"id": "strand", "op": "stripes", "axis": "z", "period": 1.3, "width": 0.34, "shift": -1.8, "wobble": 0.3},
            {"id": "strand_x", "op": "stripes", "axis": "x", "period": 1.3, "width": 0.34, "shift": -1.8, "wobble": 0.3},
            noise]},
        "mouth": {"ramp": "mouth", "tone": 2.6},
        "zombie_bone": {"ramp": "bone", "tone": 6.4, "rim": {"light": 0, "dark": 0}, "brush": {"off": True},
                        "art_key": {"b": "bone:6"}, "stamps": INVISIBLE},
        "zombie_flesh": {"ramp": "fur", "tone": 8.0, "stamps": INVISIBLE},
    }
    st["ear_r"] = copy.deepcopy(st["ear_l"])
    if shorn:
        # cropped short: no long strands or light tips, a shade greyer, rows of shear marks, and pink-grey skin
        # showing through where the shears went close (the flanks, belly, chest and thighs, where the long fur was).
        # The long-fur cards (fur_*) are hidden on a shorn bear, and transparent in this texture too.
        skin = {"id": "shorn", "op": "patches", "ramp": "pink", "tone": 4.6, "scale": 1.1, "threshold": 0.6,
                "faces": ["sides", "bottom"]}
        marks = {"id": "shear_marks", "op": "stripes", "axis": "y", "period": 2.2, "width": 0.18, "shift": -1.4,
                 "wobble": 0.35, "faces": ["sides"]}
        stubble = {"id": "stubble", "op": "speckle", "density": 0.1, "shift": -1.3}
        for k in ("fur", "fur_body", "fur_top", "leg"):
            st[k]["tone"] -= 0.7
            st[k]["layers"] = [l for l in st[k]["layers"] if l["id"] not in ("tips", "lights", "shine", "shine_x")] + [
                marks, dict(skin, threshold=0.66 if k in ("leg", "fur_top") else 0.6), stubble]
        st["fur_card"]["stamps"] = INVISIBLE
    if zombie:
        # rotting grey-green coat with mangy bald patches and wounds, a dark wound behind the bare ribs
        rot = {"id": "rot", "op": "patches", "ramp": "rot", "tone": 3.2, "scale": 1.3, "threshold": 0.72,
               "faces": ["sides", "back", "front", "top"]}
        mange = {"id": "mange", "op": "patches", "ramp": "flesh", "tone": 4.4, "scale": 1.9, "threshold": 0.68,
                 "faces": ["sides", "top"]}
        wounds = {"id": "wounds", "op": "spots", "count": 3, "radius": [0.6, 1.2], "ramp": "rot", "tone": 1.4,
                  "faces": ["sides", "top"], "bevel": {"highlight": 1, "shadow": 0, "highlight_shift": 2.0}}
        for k in ("fur", "fur_body", "fur_top", "leg", "head"):
            st[k]["tone"] -= 1.2
            st[k]["layers"] = st[k]["layers"] + [mange, rot, wounds]
        # dark sunken sockets round the eyes (head part space)
        st["head"]["layers"].append({"id": "sockets", "op": "spots", "ramp": "eye", "tone": 1.2, "faces": ["front", "sides"],
                                     "centers": [c + [1.3] for c in SOCKETS]})
        st["brow"]["layers"].append({"id": "brow_dark", "op": "fill", "ramp": "fur", "tone": 3.0, "faces": ["bottom", "front"]})
        # the cavity behind the ribs (body part space: the left flank at x=+8.5)
        st["fur_body"]["layers"].append({"id": "cavity", "op": "spots", "ramp": "rot", "tone": 0.6,
                                         "centers": [[8.5, 0.8, 7.2, 4.4], [8.5, -1.2, 9.6, 3.0], [8.5, 2.8, 5.0, 3.0]],
                                         "faces": ["left", "right"],
                                         "bevel": {"highlight": 1, "shadow": 0, "highlight_shift": 2.0}})
        st["fur_card"]["layers"] = st["fur_card"]["layers"] + [dict(rot, threshold=0.55)]
        st["fur_card"]["art_key"] = {"h": "fur:10", "d": "fur:2"}
        st["zombie_bone"] = {"ramp": "bone", "tone": 6.4, "rim": {"light": 0, "dark": 0}, "brush": {"off": True},
                             "art_key": {"b": "bone:6"}, "layers": [
            {"id": "shade", "op": "gradient", "axis": "y", "amount": 1.2},
            {"id": "grime", "op": "patches", "scale": 1.2, "threshold": 0.6, "shift": -2.0}]}
        st["zombie_flesh"] = {"ramp": "flesh", "tone": 4.0, "art_key": {"f": "flesh:4"}}
        # small intense glowing points in dark sockets
        st["eye"] = {"ramp": "eye", "tone": 0.2, "light": 0, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "top-left", "art": [".g"], "key": {"g": "glow:4"}}]}
        # the torn ear: a notch bitten out of the right ear
        st["ear_r"]["stamps"] = [
            {"face": "front", "at": "top-left", "art": ["___", "_d.", "..."], "key": {"d": "rot:2"}},
            {"face": "back", "at": "top-left", "art": ["___", "_.."]}]
        st["jaw"]["layers"].append({"id": "gum", "op": "band", "axis": "x", "from": -1.0, "to": -0.4, "ramp": "rot",
                                    "tone": 1.4, "faces": ["sides", "front"]})
    return st


def rest():
    return [[0, [0, 0, 0]]]


ANIM = {
    "idle": {"length": 4.0, "loop": True, "tracks": [
        {"part": "chest", "channel": "scale", "osc": {"amp": [0.012, 0.02, 0.006], "cycles": 2}},
        {"part": "neck", "axis": "x", "osc": {"amp": 3, "cycles": 1, "phase": 0.1}},
        {"part": "head", "axis": "y", "osc": {"amp": 8, "cycles": 1}},
    ]},
}

spec = {
    "name": "Polar Bear",
    "description": "The Winterworks polar bear: a powerful, dangerous bear with a massive shoulder hump, a long thick neck, "
                   "a long heavy head with a strong brow and small dark eyes, straggly fur cards (fur_*, hidden when "
                   "shorn) and big paws with dark claws. Cream fur with cool blue-grey shadows. Zombie parts (zombie_*) "
                   "are transparent here and only drawn on the zombie polar bear. Minecraft pixel units, density 1: "
                   "exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 2000, "colors": 72},
    "light": LIGHT,
    "brush": BRUSH,
    "minecraft": {"fps": 12},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#28303c", "hero": [-38, 18], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles_for("base"),
    "parts": P,
    "animations": ANIM,
}

VARIANT_RAMPS = {
    "sheared": {
        "fur": ["#1c1f2b", "#262a38", "#323746", "#3f4555", "#4e5566", "#5f6677", "#727889", "#878c9b", "#9da1ad",
                "#b2b5bd", "#c5c6c9", "#d4d3cf", "#e0ddd2", "#e9e4d5", "#f0eadb"],
        "pink": ["#2c2025", "#3d2c32", "#503a40", "#644a4f", "#7a5c60", "#8f6f71", "#a38384", "#b69897"],
    },
    "zombie": {
        "fur": ["#121513", "#191d1a", "#212622", "#2a302b", "#343b35", "#3f4740", "#4b534b", "#585f57", "#656c63",
                "#727870", "#7f847c", "#8b9088", "#969a91", "#a0a39a", "#a9aca2"],
        "rot": ["#0c0809", "#170e0f", "#231416", "#311b1c", "#3f2322", "#4d2d29", "#5a3830"],
        "flesh": ["#1b1719", "#272123", "#342c2d", "#423838", "#514544", "#605350", "#6f625d"],
        "glow": ["#06343d", "#0b5d6c", "#17a4b8", "#5ce3ef", "#c4fbff", "#f2ffff"],
    },
}
VARIANTS = {"sheared": "polar_bear_sheared", "zombie": "polar_bear_zombie"}   # files in examples/variants/


def variant_spec(name):
    out = copy.deepcopy(spec)
    out["name"] = {"sheared": "Polar Bear Sheared", "zombie": "Zombie Polar Bear"}[name]
    out["palette"]["ramps"].update(copy.deepcopy(VARIANT_RAMPS[name]))
    out["styles"] = styles_for(name)
    if name == "zombie":
        out["minecraft"] = dict(out["minecraft"], glow_ramps=["glow"])
        out["render"] = dict(out["render"], background="#1d2422")
    return out


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/polar_bear.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts")
    vdir = os.path.join(os.path.dirname(out) or ".", "variants")
    os.makedirs(vdir, exist_ok=True)
    for name, fn in VARIANTS.items():
        with open(os.path.join(vdir, f"{fn}.json"), "w") as fh:
            json.dump(variant_spec(name), fh, indent=1)
    print("variants:", ", ".join(VARIANTS.values()))
