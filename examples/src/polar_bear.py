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

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")


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


class Rig:
    """Collects parts. Pivots/rotations can be given in WORLD space (rest pose) and are stored parent-relative, as
    lowpix and Minecraft want; rel=True takes them in the parent's frame instead."""

    def __init__(self):
        self.P, self.W = [], {}

    def part(self, shape, id, parent, pos, rot, style, rel=False, **kw):
        rot = rot or [0, 0, 0]
        R, t = _rot(rot), np.array(pos, float)
        if parent:
            Rp, tp = self.W[parent]
            if rel:
                lp, lr = list(pos), list(rot)
                R, t = Rp @ R, tp + Rp @ t
            else:
                lp, lr = Rp.T @ (t - tp), _euler(Rp.T @ R)
        else:
            lp, lr = pos, rot
        self.W[id] = (R, t)
        d = {"id": id, "shape": shape, "pivot": r3(lp), "style": style}
        if parent:
            d["parent"] = parent
        if any(abs(a) > 1e-6 for a in lr):
            d["rotation"] = r3(lr)
        if kw.get("offset") is not None:
            kw["offset"] = r3(kw["offset"])
        d.update({k: v for k, v in kw.items() if v is not None})
        self.P.append(d)
        return d

    def box(self, id, parent, size, pos, style, offset=None, rot=None, rel=False, **kw):
        return self.part("box", id, parent, pos, rot, style, rel, size=size, offset=offset, **kw)

    def card(self, id, parent, art, pos, style, plane="yz", offset=None, rot=None, rel=True, **kw):
        """An alpha-cut card (exports to Minecraft as a zero-thickness cube). Its art_key lives in its style."""
        return self.part("card", id, parent, pos, rot, style, rel, plane=plane, art=art, offset=offset, **kw)

    def bone(self, id, parent, pos, rot=None, rel=True, style="fur"):
        return self.part("bone", id, parent, pos, rot, style, rel)

    def local(self, parent, world_point):
        """A world point (rest pose) in a placed part's frame."""
        R, t = self.W[parent]
        return r3(R.T @ (np.array(world_point, float) - t))


RIG = Rig()
P, W = RIG.P, RIG.W
box, card, bone = RIG.box, RIG.card, RIG.bone


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

SOCKETS = [RIG.local("head", W[f"eye_{s}"][1]) for s, _ in SIDES]     # eye centres in head part space

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
    card(f"fur_forearm_{s}", f"front_forearm_{s}", strands(4, 5, 23 + (sx > 0)), [0, -0.8, -2.8], FUR,
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
            {"id": "sole", "op": "fill", "shift": -3.0, "faces": ["bottom"]}], "stamps": [
            {"face": "bottom", "at": "top-left", "art": [".p.p.p.", "p.....p", "..ppp..", ".ppppp.", ".ppppp.", "..ppp.."],
             "offset": [0, 1], "key": {"p": "skin:2"}}]},
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
        # In the style of vanilla's zombie horse: a green-grey rotten hide mottled with darker rot patches, soft flat
        # shading and little noise, bare pale bone where the zombie_* cards are, sunken dark sockets with glowing points.
        def hide(tone, flow="z", extra=()):
            return {"ramp": "fur", "tone": tone, "rim": {"light_shift": 0.6, "dark_shift": -0.7},
                    "brush": {"flow": flow, "length": 2.6, "rough": 0.35, "overshoot": 0.15}, "layers": [
                {"id": "under", "op": "gradient", "axis": "y", "amount": 1.8},
                {"id": "mottle", "op": "patches", "scale": 1.4, "threshold": 0.65, "shift": 1.0},
                {"id": "rot", "op": "patches", "ramp": "rot", "tone": 4.6, "scale": 1.9, "threshold": 0.62, "seed": 11},
                {"id": "rot_core", "op": "patches", "ramp": "rot", "tone": 2.6, "scale": 1.9, "threshold": 0.73,
                 "seed": 11},
                {"id": "strands", "op": "stripes", "axis": "z", "period": 2.2, "width": 0.2, "shift": -0.8,
                 "wobble": 0.5, "faces": ["left", "right"]},
                {"id": "strands_x", "op": "stripes", "axis": "x", "period": 2.2, "width": 0.2, "shift": -0.8,
                 "wobble": 0.5, "faces": ["front", "back", "top"]},
                {"id": "mange", "op": "spots", "count": 2, "radius": [0.6, 1.1], "ramp": "bone", "tone": 3.6,
                 "faces": ["sides", "top"], "bevel": {"highlight": 0, "shadow": 1, "shadow_ramp": "rot",
                                                      "shadow_shift": -2.0}}] + list(extra)}
        for k, tone in (("fur", 8.8), ("fur_body", 8.8), ("fur_top", 9.5), ("head", 9.3)):
            st[k] = hide(tone)
        st["leg"] = hide(8.2, "y")
        st["paw"] = dict(hide(7.4), stamps=st["paw"]["stamps"])
        # the open wound behind the bare ribs (body part space: the left flank at x = +8.5)
        st["fur_body"]["layers"].append({"id": "cavity", "op": "spots", "ramp": "eye", "tone": 1.6,
                                         "centers": [[8.5, 0.8, 4.2, 4.4], [8.5, -1.2, 6.6, 3.0], [8.5, 2.8, 2.0, 3.0]],
                                         "faces": ["left", "right"],
                                         "bevel": {"highlight": 1, "shadow": 0, "highlight_ramp": "rot", "highlight_shift": 3}})
        # sunken sockets round the glowing eyes
        st["head"]["layers"].append({"id": "sockets", "op": "spots", "ramp": "eye", "tone": 0.4,
                                     "faces": ["front", "sides"], "centers": [c + [1.7] for c in SOCKETS]})
        st["brow"] = {"ramp": "fur", "tone": 8.4, "rim": {"light_shift": 0.6, "dark_shift": -0.8},
                      "brush": {"rough": 0.3}, "layers": [
            {"id": "under", "op": "fill", "ramp": "eye", "tone": 1.0, "faces": ["bottom"]},
            {"id": "shade", "op": "gradient", "axis": "y", "amount": 2.0}]}
        st["eye"] = {"ramp": "eye", "tone": 0.2, "light": 0, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "top-left", "art": [".g"], "key": {"g": "glow:3"}}]}
        # the muzzle: rotten lips, bare bone and teeth showing on the right side
        st["muzzle"] = {"ramp": "fur", "tone": 8.6, "brush": {"length": 1.8, "rough": 0.3}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.8},
            {"id": "rot", "op": "patches", "ramp": "rot", "tone": 2.8, "scale": 1.4, "threshold": 0.66},
            {"id": "lip", "op": "band", "axis": "y", "from": -1.0, "to": -0.7, "ramp": "eye", "tone": 1.2,
             "faces": ["sides", "front"]},
            {"id": "bare", "op": "spots", "ramp": "bone", "tone": 4.6, "centers": [[-3.5, -1.0, 3.6, 1.8]],
             "faces": ["right"], "bevel": {"highlight": 0, "shadow": 1, "shadow_ramp": "eye", "shadow_shift": -3}}]}
        st["muzzle_top"] = {"ramp": "fur", "tone": 9.4, "brush": {"rough": 0.3}}
        st["nose"] = {"ramp": "eye", "tone": 1.4, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "bottom", "art": ["n..n"], "key": {"n": "eye:0"}}]}
        st["jaw"] = {"ramp": "fur", "tone": 7.8, "brush": {"rough": 0.3}, "layers": [
            {"id": "chin", "op": "gradient", "axis": "y", "amount": 1.4},
            {"id": "lip", "op": "band", "axis": "y", "from": 0.2, "to": 1.0, "ramp": "eye", "tone": 1.0,
             "faces": ["front"]},
            {"id": "gum", "op": "band", "axis": "x", "from": -1.0, "to": -0.4, "ramp": "rot", "tone": 1.2,
             "faces": ["sides", "front"]},
            {"id": "tongue", "op": "fill", "ramp": "mouth", "tone": 1.0, "faces": ["top"]}]}
        st["teeth"] = {"ramp": "bone", "tone": 4.6, "brush": {"off": True}}
        for e in ("ear_l", "ear_r"):
            st[e] = {"ramp": "fur", "tone": 8.4, "brush": {"off": True}, "layers": [
                {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2}], "stamps": [
                {"face": "front", "at": "top-left", "art": ["_._", ".d.", "..."], "key": {"d": "rot:2"}},
                {"face": "back", "at": "top-left", "art": ["_._"]}]}
        # the torn ear: a notch bitten out of the right ear
        st["ear_r"]["stamps"] = [
            {"face": "front", "at": "top-left", "art": ["___", "_d.", "..."], "key": {"d": "rot:1"}},
            {"face": "back", "at": "top-left", "art": ["___", "_.."]}]
        st["fur_card"] = {"ramp": "fur", "tone": 8.6, "light": 0.5, "rim": {"light": 0, "dark": 0},
                          "art_key": {"h": "fur:10", "d": "rot:1"}, "brush": {"flow": "y", "length": 2.4, "rough": 0.4},
                          "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4},
            {"id": "rot", "op": "patches", "ramp": "rot", "tone": 2.6, "scale": 1.6, "threshold": 0.64},
            {"id": "strand", "op": "stripes", "axis": "z", "period": 1.6, "width": 0.3, "shift": -1.0, "wobble": 0.3},
            {"id": "strand_x", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.3, "shift": -1.0, "wobble": 0.3}]}
        st["zombie_bone"] = {"ramp": "bone", "tone": 5.4, "rim": {"light": 0, "dark": 0}, "brush": {"off": True},
                             "art_key": {"b": "bone:5"}, "layers": [
            {"id": "shade", "op": "gradient", "axis": "y", "amount": 1.4},
            {"id": "grime", "op": "patches", "scale": 1.2, "threshold": 0.66, "shift": -1.6}]}
        st["zombie_flesh"] = {"ramp": "rot", "tone": 3.0, "art_key": {"f": "rot:3"}}
        st["claw"] = {"ramp": "eye", "tone": 1.2, "brush": {"off": True}}
    return st


# ------------------------------------------------------------------ animation helpers (shared with the cub)
def K(*ks):
    """(t, value[, ease]) tuples -> a lowpix key list."""
    return [list(k) for k in ks]


def trk(part, keys, axis=None, channel=None, ease=None, **kw):
    d = {"part": part, "keys": keys}
    for k, v in (("axis", axis), ("channel", channel), ("ease", ease)):
        if v is not None:
            d[k] = v
    d.update(kw)
    return d


def osc(part, amp, cycles=1, phase=0.0, axis=None, channel=None, bias=None, shape=None, **kw):
    o = {"amp": amp, "cycles": cycles}
    if phase:
        o["phase"] = phase
    if bias is not None:
        o["bias"] = bias
    if shape:
        o["shape"] = shape
    d = {"part": part, "osc": o}
    if axis:
        d["axis"] = axis
    if channel:
        d["channel"] = channel
    d.update(kw)
    return d


def delayed(keys, lag, scale=1.0, length=None):
    """A copy of scalar keys, later by `lag` seconds and scaled: follow-through for fur, ears and tails."""
    out = []
    for k in keys:
        t = k[0] + lag if k[0] > 0 else 0.0
        if length is not None:
            t = min(t, length)
        out.append([round(t, 4), k[1] * scale] + k[2:])
    return out


class Leg:
    """A three-joint leg: upper (shoulder/hip), lower (elbow/knee) and paw (wrist/ankle). bend -1: the middle joint
    points back (front legs), +1: forward (hind legs)."""

    def __init__(self, upper, lower, paw, bend, side):
        self.upper, self.lower, self.paw, self.bend, self.sx = upper, lower, paw, bend, side


def gait(T, phase, duty, stride, lift, curl=35.0, reach=12.0, dz=0.0, toe=7.0, heel=2.2):
    """A stepping paw for a looping gait of period T: planted and sliding back for `duty` of the cycle, then lifted
    (toes curled) and swung forward. Returns f(t, side) -> (offset from the rest wrist, paw pitch in degrees).
    The lift always clears the curled toes (`toe`: wrist-to-toe length) and the raised heel (`heel`)."""
    def f(t, sx):
        u = (t / T + phase) % 1.0
        if u < duty:
            return [0.0, 0.0, dz + stride * (0.5 - u / duty)], 0.0
        s = (u - duty) / (1 - duty)
        e = 0.5 - 0.5 * math.cos(math.pi * s)
        pitch = curl * math.sin(math.pi * s / 0.7) if s < 0.7 else -reach * math.sin(math.pi * (s - 0.7) / 0.3)
        p = math.radians(pitch)
        clear = toe * math.sin(p) if p > 0 else heel * math.sin(-p) + 2.7 * (1 - math.cos(p))
        y = max(lift * math.sin(math.pi * s), clear + 0.3 * math.sin(math.pi * s))
        return [0.0, y, dz + stride * (e - 0.5)], pitch
    return f


def keyed(pos_keys, pitch_keys=None, length=1.0, loop=False, ease="ease"):
    """A paw path from keys: offsets from the rest wrist ([dx, dy, dz], dx mirrored on the right) and pitch degrees."""
    sys.path.insert(0, ROOT)
    from lowpix.anim import eval_keys

    def f(t, sx):
        o = eval_keys(pos_keys, t, length, loop, ease)
        pch = float(eval_keys(pitch_keys, t, length, loop, ease, "x")[0]) if pitch_keys else 0.0
        return [float(o[0]) * sx, float(o[1]), float(o[2])], pch
    return f


def planted(dz=0.0):
    return lambda t, sx: ([0.0, 0.0, dz], 0.0)


def paddle(T, phase, centre, rz, ry, pitch=30.0, swing=25.0):
    """Swimming: the paw circles (forward high, then a power stroke down and back)."""
    def f(t, sx):
        th = 2 * math.pi * (t / T + phase)
        return [0.0, centre[1] + ry * math.cos(th), centre[2] + rz * math.sin(th)], pitch + swing * math.sin(th)
    return f


def _rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def _ang(v):          # angle in the leg's y-z plane; an x rotation by a adds a to it
    return math.atan2(v[2], v[1])


def _wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def thin(keys, tol=0.06):
    """Drop keys that linear interpolation between their neighbours reproduces within `tol` (degrees / units)."""
    if len(keys) <= 2:
        return keys
    out, i = [keys[0]], 0
    while i < len(keys) - 1:
        j = i + 2
        while j < len(keys):
            t0, v0 = keys[i][0], np.array(keys[i][1])
            t1, v1 = keys[j][0], np.array(keys[j][1])
            ok = all(np.abs(v0 + (v1 - v0) * (keys[m][0] - t0) / (t1 - t0) - np.array(keys[m][1])).max() <= tol
                     for m in range(i + 1, j))
            if not ok:
                break
            j += 1
        i = j - 1
        out.append(keys[i])
    return out


def dumps(spec):
    """JSON with short number lists kept on one line."""
    import re
    txt = json.dumps(spec, indent=1)
    num = r"-?\d+(?:\.\d+)?(?:e-?\d+)?"
    txt = re.sub(r"\[\s*(" + num + r"(?:,\s*" + num + r")*)\s*\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", txt)
    txt = re.sub(r"\[\s*(" + num + r"),\s*(\[[^\[\]]*\])(,\s*\"[a-z_]+\")?\s*\]",
                 lambda m: "[" + m.group(1) + ", " + m.group(2) + (", " + m.group(3).strip(", \n") if m.group(3) else "") + "]", txt)
    txt = re.sub(r"\[\s*(\[[^\[\]]*\](?:,\s*\[[^\[\]]*\])*)\s*\]",
                 lambda m: "[" + re.sub(r"\],\s*\[", "], [", m.group(1)) + "]", txt)
    return txt


def bake(spec, clips, legs, fps=30):
    """Solve the legs with IK on top of each clip's torso tracks, so paws stay planted or follow their paths.
    clips: {name: (clip, {leg: path})}. Returns lowpix animations with rotation keys (and, where a leg must reach
    further than it can, a small position drop of the hip/shoulder joint along its parent's -y)."""
    sys.path.insert(0, ROOT)
    from lowpix.model import build_model
    model = build_model(dict(spec, animations={}))
    insts = {i.id: i for i in model.instances}
    rest = model.animator().world_matrices(None)
    out = {}
    for name, (clip, paths) in clips.items():
        model.spec["animations"] = {name: clip}
        anim = model.animator()
        length, loop = float(clip["length"]), bool(clip.get("loop", True))
        n = max(8, int(round(length * fps)))
        times = {round(length * k / n, 4) for k in range(n + (0 if loop else 1))}
        for tr in clip["tracks"]:          # also sample exactly at the torso's key times (sharp changes of pace)
            for k in tr.get("keys", []):
                if 0 <= k[0] < length or (not loop and k[0] <= length):
                    times.add(round(float(k[0]), 4))
        times = sorted(times)
        worlds = [anim.world_matrices(name, t) for t in times]
        tracks = list(clip["tracks"])
        for leg_name, path in paths.items():
            leg = legs[leg_name]
            U, Lo, Pw = insts[leg.upper], insts[leg.lower], insts[leg.paw]
            Lu, Lf, Lp = U.rest_local, Lo.rest_local, Pw.rest_local
            e0, Rf, w0 = Lf[:3, 3], Lf[:3, :3], Lp[:3, 3]
            v0 = Rf @ w0
            l1, l2 = math.hypot(e0[1], e0[2]), math.hypot(v0[1], v0[2])
            g0 = _wrap(_ang(v0) - _ang(e0))
            wrest, prest = rest[leg.paw][:3, 3], rest[leg.paw][:3, :3]
            ku, kl, kp, kd = [], [], [], []
            def solve(q):
                x0 = e0[0] + v0[0]
                r = math.hypot(q[0], q[1])
                gam = 0.0
                if r > abs(x0) + 1e-6:
                    phi = math.atan2(q[1], q[0])
                    gam = _wrap(phi + math.acos(max(-1.0, min(1.0, x0 / r))))
                    if abs(gam) > math.pi / 2:
                        gam = _wrap(phi - math.acos(max(-1.0, min(1.0, x0 / r))))
                qp = _rz(-gam) @ q
                d = math.hypot(qp[1], qp[2])
                d = max(abs(l1 - l2) + 1e-3, min(l1 + l2 - 1e-3, d))
                cg = (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2)
                g = math.acos(max(-1.0, min(1.0, cg)))
                b = _wrap(leg.bend * g - g0)
                v = _rx(b) @ v0
                c = np.array([0.0, e0[1] + v[1], e0[2] + v[2]])
                return _wrap(_ang(qp) - _ang(c)), b, gam, math.hypot(qp[1], qp[2])

            def fk(a, b, gam):
                return _rz(gam) @ _rx(a) @ (e0 + Rf @ _rx(b) @ w0)

            for t, Wm in zip(times, worlds):
                off, pitch = path(t, leg.sx)
                target = wrest + np.array(off)
                Wpar = Wm[U.parent]
                drop = 0.0
                for _ in range(5):
                    Su = Wpar @ np.vstack([np.c_[np.eye(3), [0, -drop, 0]], [0, 0, 0, 1]]) @ Lu
                    q = Su[:3, :3].T @ (target - Su[:3, 3])
                    reach = 0.995 * (l1 + l2)
                    a, b, gam, d = solve(q)
                    if d <= reach or drop > 6:
                        break
                    drop += d - reach + 0.02
                qt = q.copy()
                for _ in range(4):           # the rest rotations aren't pure x turns: correct the residual
                    qt = qt + (q - fk(a, b, gam))
                    a, b, gam, _ = solve(qt)
                # the paw: world orientation = a world pitch on top of its rest orientation
                Rchain = Su[:3, :3] @ _rz(gam) @ _rx(a) @ Rf @ _rx(b) @ Lp[:3, :3]
                Rpaw = Rchain.T @ _rx(math.radians(pitch)) @ prest
                ku.append([round(t, 4), r3([math.degrees(a), 0, math.degrees(gam)])])
                kl.append([round(t, 4), r3([math.degrees(b), 0, 0])])
                kp.append([round(t, 4), r3(_euler(Rpaw))])
                kd.append([round(t, 4), r3([0, -drop, 0])])
            tracks += [{"part": leg.upper, "keys": thin(ku), "ease": "linear"},
                       {"part": leg.lower, "keys": thin(kl), "ease": "linear"},
                       {"part": leg.paw, "keys": thin(kp), "ease": "linear"}]
            if any(abs(k[1][1]) > 1e-3 for k in kd):
                tracks.append({"part": leg.upper, "channel": "position", "keys": thin(kd, 0.02), "ease": "linear"})
        out[name] = dict(clip, tracks=tracks)
    return out


# ------------------------------------------------------------------ the adult's clips
LEGS = {"fl": Leg("front_leg_l", "front_forearm_l", "front_paw_l", -1, 1),
        "fr": Leg("front_leg_r", "front_forearm_r", "front_paw_r", -1, -1),
        "bl": Leg("back_leg_l", "back_shin_l", "back_paw_l", 1, 1),
        "br": Leg("back_leg_r", "back_shin_r", "back_paw_r", 1, -1)}
STAND = {k: planted() for k in LEGS}
FUR_HANG = ["fur_mane", "fur_flank", "fur_chest_side", "fur_rump_side", "fur_neck_side", "fur_belly"]


def fur_sway(amp, cycles, phase=0.0, axis="z"):
    """Secondary motion: the hanging fur cards swing, each a little later than the last."""
    return [osc(p, amp * (1 + 0.15 * k), cycles, phase + 0.06 * k, axis=axis) for k, p in enumerate(FUR_HANG)]


def adult_clips():
    C = {}
    # idle: breathing, weight shifts, looking round, a sniff of the air, ear flicks, tail twitch
    C["idle"] = ({"length": 4.0, "loop": True, "tracks": [
        osc("body", [0.35, 0.2, 0], 1, channel="position", phase=0.25),
        osc("body", 1.2, 1, axis="z"),
        osc("hump", [0.03, 0.07, 0.02], 2, channel="scale"),
        osc("neck_ruff", [0.03, 0.08, 0.02], 2, channel="scale", phase=0.08),
        trk("neck", K((0, 0), (0.5, 0), (1.1, 16, "out_back"), (1.6, 16), (2.2, -4), (2.8, -14, "out_back"), (3.3, -14),
                      (3.8, 0)), axis="y"),
        trk("neck", K((0, 0), (1.6, 0), (1.9, -10, "out"), (2.4, -8), (2.7, 0)), axis="x"),
        trk("head", K((0, 0), (1.6, 0), (1.9, -12, "out"), (2.0, -9), (2.1, -12), (2.2, -9), (2.3, -12), (2.6, 0)), axis="x"),
        trk("head", K((0, 0), (1.15, 8, "out_back"), (1.6, 8), (2.0, 0), (2.85, -6, "out_back"), (3.3, -6), (3.7, 0)),
            axis="z"),
        trk("nose", K((0, [0, 0, 0]), (1.9, [0, 0, 0]), (1.95, [0.25, 0.2, 0]), (2.05, [0, 0, 0]), (2.15, [0.25, 0.2, 0]),
                      (2.25, [0, 0, 0])), channel="scale"),
        trk("ear_l", K((0, 0), (0.9, 0), (0.98, -28, "out"), (1.1, 6), (1.3, 0)), axis="z"),
        trk("ear_r", K((0, 0), (2.9, 0), (2.98, 28, "out"), (3.1, -6), (3.3, 0)), axis="z"),
        trk("jaw", K((0, 0), (3.3, 0), (3.45, 7, "out"), (3.6, 1), (3.7, 5), (3.85, 0)), axis="x"),
        osc("tail", 4, 1, axis="x"),
        trk("tail", K((0, 0), (2.4, 0), (2.5, 22, "out"), (2.62, -14), (2.76, 8), (2.95, 0)), axis="y"),
    ] + fur_sway(2.5, 2)}, STAND)

    # walk: a heavy shoulder-rolling amble, the head swinging low; diagonal-ish lateral sequence
    T = 1.2
    C["walk"] = ({"length": T, "loop": True, "tracks": [
        osc("body", [0, 0.35, 0], 2, channel="position", phase=0.0, bias=[0, -1.0, 0]),
        osc("body", 1.5, 1, axis="y", phase=0.25),
        osc("chest", 3.0, 1, axis="z", phase=0.5),
        osc("rump", -2.4, 1, axis="z", phase=0.25),
        osc("chest", 1.6, 2, axis="x", phase=0.1),
        osc("neck", 5, 1, axis="y", phase=0.6),
        osc("neck", 2.5, 2, axis="x", phase=0.2),
        osc("head", 3, 1, axis="y", phase=0.7),
        osc("head", -2.5, 2, axis="x", phase=0.3),
        osc("tail", 9, 1, axis="z", phase=0.4),
        osc("tail", 4, 2, axis="x"),
        osc("ear_l", 5, 2, axis="x", phase=0.3),
    ] + fur_sway(5, 2, 0.1)}, {
        "bl": gait(T, 0.0, 0.64, 9.0, 2.2, curl=30, toe=9.0), "fl": gait(T, 0.25, 0.62, 9.0, 2.8, curl=45, toe=8.5),
        "br": gait(T, 0.5, 0.64, 9.0, 2.2, curl=30, toe=9.0), "fr": gait(T, 0.75, 0.62, 9.0, 2.8, curl=45, toe=8.5)})

    # run: a rotary gallop, the spine flexing, the head low and driving, ears pinned
    T = 0.6
    C["run"] = ({"length": T, "loop": True, "tracks": [
        osc("body", [0, 1.3, 0], 1, channel="position", phase=0.1, bias=[0, -0.9, 0]),
        osc("body", 4, 1, axis="x", phase=0.0),
        osc("chest", 6, 1, axis="x", phase=0.15),
        osc("rump", -7, 1, axis="x", phase=0.0),
        osc("chest", 2, 1, axis="z", phase=0.3),
        osc("neck", -6, 1, axis="x", phase=0.25, bias=6),
        osc("head", -5, 1, axis="x", phase=0.35, bias=-4),
        osc("jaw", 4, 2, axis="x", bias=8),
        osc("tail", 12, 1, axis="x", phase=0.2, bias=-10),
        trk("ear_l", K((0, -22)), axis="x"), trk("ear_r", K((0, -22)), axis="x"),
        osc("hump", [0.03, -0.05, 0.02], 1, channel="scale", phase=0.2),
    ] + fur_sway(8, 1, 0.2, axis="x")}, {
        "bl": gait(T, 0.0, 0.4, 15.0, 4.0, curl=55, reach=20, dz=-1.0, toe=9.0),
        "br": gait(T, 0.08, 0.4, 15.0, 4.0, curl=55, reach=20, dz=-1.0, toe=9.0),
        "fl": gait(T, 0.5, 0.38, 15.0, 4.6, curl=60, reach=24, dz=1.0, toe=8.5),
        "fr": gait(T, 0.58, 0.38, 15.0, 4.6, curl=60, reach=24, dz=1.0, toe=8.5)})

    # swim: afloat and doggy-paddling, the head held up, fur streaming back
    T = 1.6
    C["swim"] = ({"length": T, "loop": True, "tracks": [
        osc("body", [0, 0.6, 0], 2, channel="position", bias=[0, 4.0, 0]),
        osc("body", 2, 2, axis="x", bias=-7),
        osc("body", 3, 1, axis="z", phase=0.25),
        osc("neck", 2, 2, axis="x", bias=-18, phase=0.1),
        osc("head", 2, 2, axis="x", bias=-6, phase=0.2),
        osc("head", 3, 1, axis="z", phase=0.5),
        osc("tail", 6, 1, axis="y"), trk("tail", K((0, 20)), axis="x"),
        trk("ear_l", K((0, -12)), axis="x"), trk("ear_r", K((0, -12)), axis="x"),
    ] + [osc(p, 6, 2, 0.08 * k, axis="x", bias=-24) for k, p in enumerate(FUR_HANG)]}, {
        "fl": paddle(T, 0.0, [0, 7.0, 3.0], 4.5, 3.0, 15, 20), "fr": paddle(T, 0.5, [0, 7.0, 3.0], 4.5, 3.0, 15, 20),
        "bl": paddle(T, 0.25, [0, 6.5, -2.5], 4.0, 2.0, 20, 20), "br": paddle(T, 0.75, [0, 6.5, -2.5], 4.0, 2.0, 20, 20)})

    # leap (1.2 s): crouch and growl, spring, a stretched flight, the front paws slam down, the hind paws follow
    L = 1.2
    C["leap"] = ({"length": L, "loop": False, "tracks": [
        trk("body", K((0, [0, 0, 0]), (0.30, [0, -2.4, -1.0], "out"), (0.36, [0, -2.6, -1.2]), (0.46, [0, 2.4, 2.0], "out"),
                      (0.62, [0, 6.0, 3.5], "out"), (0.80, [0, 3.2, 3.0], "in"), (0.88, [0, -2.0, 2.0], "in"),
                      (0.96, [0, -1.0, 1.0], "out"), (1.06, [0, 0.3, 0.3]), (1.2, [0, 0, 0])), channel="position"),
        trk("body", K((0, 0), (0.30, 3, "out"), (0.36, 3.5), (0.46, -14, "out"), (0.62, -6), (0.80, 8, "in"), (0.88, 6),
                      (0.96, 1), (1.06, -2), (1.2, 0)), axis="x"),
        trk("chest", K((0, 0), (0.30, 5), (0.46, -6, "out"), (0.62, -3), (0.84, 4), (0.90, 6, "out"), (1.0, 2), (1.2, 0)),
            axis="x"),
        trk("rump", K((0, 0), (0.30, -8), (0.46, 10, "out"), (0.62, 6), (0.85, -6), (0.95, -2), (1.2, 0)), axis="x"),
        trk("neck", K((0, 0), (0.30, 8), (0.46, -8, "out"), (0.62, -4), (0.86, -2), (0.92, 4, "out"), (1.05, 1), (1.2, 0)),
            axis="x"),
        trk("head", K((0, 0), (0.30, -6), (0.46, 6), (0.62, 2), (0.86, -10), (0.94, -16, "out"), (1.08, 2), (1.2, 0)),
            axis="x"),
        trk("jaw", K((0, 0), (0.30, 6), (0.36, 3), (0.46, 10), (0.62, 22, "out"), (0.86, 30), (0.92, 36), (1.0, 10),
                     (1.2, 0)), axis="x"),
        trk("ear_l", K((0, 0), (0.25, -26), (1.0, -26), (1.2, 0)), axis="x"),
        trk("ear_r", K((0, 0), (0.25, -26), (1.0, -26), (1.2, 0)), axis="x"),
        trk("hump", K((0, [0, 0, 0]), (0.30, [0.05, -0.08, 0.03]), (0.46, [-0.03, 0.08, -0.02]), (0.88, [0, 0, 0]),
                      (0.92, [0.08, -0.14, 0.06]), (1.05, [-0.02, 0.03, 0]), (1.2, [0, 0, 0])), channel="scale"),
        trk("tail", K((0, 0), (0.3, -10), (0.5, 26), (0.8, 18), (0.92, -12), (1.05, 6), (1.2, 0)), axis="x"),
    ] + [trk(p, delayed(K((0, 0), (0.30, -6), (0.46, -24), (0.62, -30), (0.84, -10), (0.90, 18), (1.0, -6), (1.2, 0)),
                        0.03 * k, 1 + 0.1 * k, L), axis="x") for k, p in enumerate(FUR_HANG)]}, {
        "fl": keyed(K((0, [0, 0, 0]), (0.36, [0, 0, 0]), (0.42, [0, 2.5, 1.5]), (0.50, [0, 6.0, 5.0], "out"),
                      (0.62, [0, 6.5, 7.0]), (0.80, [0, 3.0, 7.5]), (0.88, [0, 0, 6.0], "in"), (1.0, [0, 0, 6.0]),
                      (1.08, [0, 1.4, 3.0]), (1.2, [0, 0, 0])),
                    K((0, 0), (0.36, 0), (0.46, 25), (0.62, -15), (0.80, -25), (0.88, 0), (1.2, 0)), L),
        "fr": keyed(K((0, [0, 0, 0]), (0.36, [0, 0, 0]), (0.43, [0, 2.5, 1.5]), (0.51, [0, 6.0, 5.0], "out"),
                      (0.63, [0, 6.5, 7.0]), (0.81, [0, 3.0, 7.5]), (0.89, [0, 0, 6.0], "in"), (1.02, [0, 0, 6.0]),
                      (1.1, [0, 1.4, 3.0]), (1.2, [0, 0, 0])),
                    K((0, 0), (0.36, 0), (0.47, 25), (0.63, -15), (0.81, -25), (0.89, 0), (1.2, 0)), L),
        "bl": keyed(K((0, [0, 0, 0]), (0.44, [0, 0, 0]), (0.47, [0, 2.0, -1.5]), (0.53, [0, 6.0, -4.0], "out"),
                      (0.63, [0, 7.0, -6.0]), (0.80, [0, 5.0, -1.0]), (0.94, [0, 0, 1.5], "in"), (1.2, [0, 0, 0])),
                    K((0, 0), (0.44, 0), (0.47, 12), (0.53, 35), (0.63, 30), (0.80, 10), (0.92, 0), (1.2, 0)), L),
        "br": keyed(K((0, [0, 0, 0]), (0.45, [0, 0, 0]), (0.48, [0, 2.0, -1.5]), (0.54, [0, 6.0, -4.0], "out"),
                      (0.64, [0, 7.0, -6.0]), (0.81, [0, 5.0, -1.0]), (0.95, [0, 0, 1.5], "in"), (1.2, [0, 0, 0])),
                    K((0, 0), (0.45, 0), (0.48, 12), (0.54, 35), (0.64, 30), (0.81, 10), (0.93, 0), (1.2, 0)), L)})

    # swipe (0.9 s): a dip, rear up with both paws wound high, rake them down and across, slam back onto all fours
    L = 0.9
    front = keyed(K((0, [0, 0, 0]), (0.10, [0, 0, 0]), (0.30, [6, 28, -1], "out"), (0.38, [8, 33, -2]),
                    (0.48, [-3, 20, 7], "out"), (0.56, [-4, 13, 6]), (0.68, [0, 0.4, 4], "in"), (0.74, [0, 0, 3.5]),
                    (0.82, [0, 1.0, 1.5]), (0.9, [0, 0, 0])),
                  K((0, 0), (0.10, 0), (0.30, -60), (0.38, -85), (0.48, 10, "out"), (0.56, 45), (0.68, 0), (0.9, 0)), L)
    C["swipe"] = ({"length": L, "loop": False, "tracks": [
        trk("body", K((0, 0), (0.10, 3, "out"), (0.30, -42, "out"), (0.40, -44), (0.50, -36, "in"), (0.66, 6, "in"),
                      (0.74, 4), (0.9, 0)), axis="x"),
        trk("body", K((0, [0, 0, 0]), (0.10, [0, -1.0, 0]), (0.30, [0, 2.5, -1.5], "out"), (0.42, [0, 2.8, -1.0]),
                      (0.50, [0, 2.0, 0.5]), (0.66, [0, -1.8, 1.0], "in"), (0.76, [0, -0.6, 0.5]), (0.9, [0, 0, 0])),
            channel="position"),
        trk("chest", K((0, 0), (0.30, -6), (0.45, 8, "out"), (0.60, 3), (0.9, 0)), axis="z"),
        trk("neck", K((0, 0), (0.10, 6), (0.30, 18), (0.42, 26), (0.50, 30, "out"), (0.66, 6), (0.9, 0)), axis="x"),
        trk("head", K((0, 0), (0.30, 8), (0.45, 14), (0.60, 0), (0.9, 0)), axis="x"),
        trk("jaw", K((0, 0), (0.25, 20), (0.40, 32, "out"), (0.55, 26), (0.70, 8), (0.9, 0)), axis="x"),
        trk("ear_l", K((0, 0), (0.2, -26), (0.7, -26), (0.9, 0)), axis="x"),
        trk("ear_r", K((0, 0), (0.2, -26), (0.7, -26), (0.9, 0)), axis="x"),
        trk("hump", K((0, [0, 0, 0]), (0.66, [0, 0, 0]), (0.70, [0.07, -0.12, 0.05]), (0.9, [0, 0, 0], "elastic")),
            channel="scale"),
    ] + [trk(p, delayed(K((0, 0), (0.30, -10), (0.48, 14), (0.66, -16), (0.72, 12), (0.9, 0)), 0.03 * k, 1, L), axis="z")
         for k, p in enumerate(FUR_HANG)]}, {"fl": front, "fr": front, "bl": planted(), "br": planted()})

    # roar (1.6 s): head drops, rears up roaring, head shaking, ruff bristling, crashes back down
    L = 1.6
    shake = K((0.62, 0), (0.68, 3), (0.74, -3), (0.80, 3), (0.86, -3), (0.92, 3), (0.98, -3), (1.04, 2), (1.10, -2),
              (1.16, 1), (1.22, 0))
    C["roar"] = ({"length": L, "loop": False, "tracks": [
        trk("body", K((0, 0), (0.20, 4, "out"), (0.50, -46, "out"), (0.62, -44), (1.20, -42), (1.36, 5, "in"), (1.45, 3),
                      (1.6, 0)), axis="x"),
        trk("body", K((0, [0, 0, 0]), (0.20, [0, -1.2, 0.5]), (0.50, [0, 3.0, -1.5], "out"), (1.20, [0, 3.2, -1.5]),
                      (1.36, [0, -1.6, 1.0], "in"), (1.46, [0, -0.5, 0.4]), (1.6, [0, 0, 0])), channel="position"),
        trk("neck", K((0, 0), (0.20, 12), (0.50, 22), (0.60, 12, "out"), (1.20, 14), (1.36, 8), (1.6, 0)), axis="x"),
        trk("head", K((0, 0), (0.20, 8), (0.50, 0), (0.60, -16, "out"), (1.15, -12), (1.36, 0), (1.6, 0)), axis="x"),
        trk("head", K((0, 0)) + shake + K((1.6, 0)), axis="y", ease="linear"),
        trk("jaw", K((0, 0), (0.40, 4), (0.56, 42, "out_back"), (0.9, 38), (0.95, 42), (1.15, 38), (1.30, 10), (1.45, 0),
                     (1.6, 0)), axis="x"),
        trk("ear_l", K((0, 0), (0.40, -32), (1.25, -32), (1.5, 0)), axis="x"),
        trk("ear_r", K((0, 0), (0.40, -32), (1.25, -32), (1.5, 0)), axis="x"),
        trk("hump", K((0, [0, 0, 0]), (0.50, [0.06, 0.10, 0.04]), (1.20, [0.05, 0.08, 0.04]), (1.40, [0, 0, 0])),
            channel="scale"),
        trk("neck_ruff", K((0, [0, 0, 0]), (0.55, [0.08, 0.22, 0.05], "out_back"), (1.20, [0.06, 0.18, 0.04]),
                           (1.45, [0, 0, 0])), channel="scale"),
        trk("tail", K((0, 0), (0.5, -20), (1.2, -16), (1.45, 8), (1.6, 0)), axis="x"),
    ] + [trk(p, delayed(K((0, 0), (0.50, 16, "out_back"), (1.20, 14), (1.38, -8), (1.5, 3), (1.6, 0)), 0.03 * k, 1, L),
             axis="z") for k, p in enumerate(FUR_HANG)]}, {
        "fl": keyed(K((0, [0, 0, 0]), (0.20, [0, 0, 0]), (0.50, [6, 24, 1], "out"), (0.62, [8, 27, 1]), (1.20, [7, 26, 1]),
                      (1.34, [0, 1.0, 4], "in"), (1.38, [0, 0, 4]), (1.48, [0, 0.8, 2]), (1.6, [0, 0, 0])),
                    K((0, 0), (0.20, 0), (0.50, -30), (0.62, -50), (1.20, -45), (1.31, 0), (1.6, 0)), L),
        "fr": keyed(K((0, [0, 0, 0]), (0.20, [0, 0, 0]), (0.52, [6, 24, 1], "out"), (0.64, [8, 27, 1]), (1.22, [7, 26, 1]),
                      (1.35, [0, 1.0, 4], "in"), (1.39, [0, 0, 4]), (1.50, [0, 0.8, 2]), (1.6, [0, 0, 0])),
                    K((0, 0), (0.20, 0), (0.52, -30), (0.64, -50), (1.22, -45), (1.32, 0), (1.6, 0)), L),
        "bl": planted(), "br": planted()})

    # eat (1.0 s): head down to the fish, munch munch munch, head back up
    L = 1.0
    C["eat"] = ({"length": L, "loop": False, "tracks": [
        trk("chest", K((0, 0), (0.15, 5, "out"), (0.85, 5), (1.0, 0)), axis="x"),
        trk("body", K((0, [0, 0, 0]), (0.15, [0, -0.8, 0]), (0.85, [0, -0.8, 0]), (1.0, [0, 0, 0])), channel="position"),
        trk("neck", K((0, 0), (0.18, 14, "out_back"), (0.85, 13), (1.0, 0)), axis="x"),
        trk("head", K((0, 0), (0.18, 7), (0.30, 1), (0.40, 8), (0.55, 1), (0.65, 8), (0.80, 2), (0.88, 7), (1.0, 0)),
            axis="x"),
        trk("head", K((0, 0), (0.30, 5), (0.55, -5), (0.80, 4), (1.0, 0)), axis="y"),
        trk("jaw", K((0, 0), (0.20, 6), (0.30, 24), (0.40, 2), (0.55, 22), (0.65, 2), (0.80, 18), (0.88, 2), (1.0, 0)),
            axis="x", ease="ease"),
        trk("ear_l", K((0, 0), (0.3, -10), (0.45, 4), (0.6, -10), (0.9, 0)), axis="x"),
        trk("ear_r", K((0, 0), (0.35, -10), (0.5, 4), (0.65, -10), (0.95, 0)), axis="x"),
        trk("tail", K((0, 0), (0.3, 12), (0.5, -8), (0.7, 10), (1.0, 0)), axis="y"),
    ]}, STAND)

    # sit (loop): settled back on its haunches, hind paws out in front with the soles showing; slow breathing,
    # a contented head tilt, looking about
    L = 4.0
    C["sit"] = ({"length": L, "loop": True, "tracks": [
        osc("body", 0.8, 2, axis="x", bias=-36),
        trk("body", K((0, [0, -3.6, -1.5])), channel="position"),
        osc("chest", 1.0, 2, axis="x", bias=10, phase=0.1),
        osc("hump", [0.03, 0.06, 0.02], 2, channel="scale"),
        osc("neck", 1.5, 2, axis="x", bias=14, phase=0.15),
        trk("head", K((0, -6), (1.0, -6), (1.3, -10, "out_back"), (2.2, -10), (2.5, -6), (4.0, -6)), axis="x"),
        trk("head", K((0, 0), (1.0, 0), (1.3, 14, "out_back"), (2.2, 14), (2.5, 0), (4.0, 0)), axis="z"),
        trk("neck", K((0, 0), (2.7, 0), (3.0, 12, "out_back"), (3.5, 12), (3.8, 0)), axis="y"),
        trk("jaw", K((0, 3), (4.0, 3)), axis="x"),
        trk("ear_l", K((0, 0), (1.3, 0), (1.38, -24, "out"), (1.5, 4), (1.7, 0)), axis="z"),
        trk("ear_r", K((0, 0), (3.1, 0), (3.18, 24, "out"), (3.3, -4), (3.5, 0)), axis="z"),
        trk("tail", K((0, 30)), axis="x"),
    ] + fur_sway(2, 2)}, {
        "fl": planted(1.0), "fr": planted(1.0),
        "bl": lambda t, sx: ([2.0 * sx, 1.0, 9.0], -55.0), "br": lambda t, sx: ([2.0 * sx, 1.0, 9.0], -55.0)})

    # shake (0.8 s): a dog-style shake from the shoulders back, the head and the long fur flying after
    L = 0.8
    roll = K((0, 0), (0.06, -5, "out"), (0.14, 13), (0.24, -15), (0.34, 14), (0.44, -11), (0.54, 8), (0.64, -4), (0.72, 1.5),
             (0.8, 0))
    C["shake"] = ({"length": L, "loop": False, "tracks": [
        trk("chest", roll, axis="z"),
        trk("body", delayed(roll, 0.03, 0.6, L), axis="z"),
        trk("rump", delayed(roll, 0.06, 0.8, L), axis="z"),
        trk("neck", delayed(roll, 0.02, -0.7, L), axis="y"),
        trk("head", delayed(roll, 0.05, 1.2, L), axis="z"),
        trk("ear_l", delayed(roll, 0.08, 2.2, L), axis="z"),
        trk("ear_r", delayed(roll, 0.08, 2.2, L), axis="z"),
        trk("tail", delayed(roll, 0.1, 2.0, L), axis="y"),
        trk("body", K((0, [0, 0, 0]), (0.06, [0, -0.6, 0]), (0.30, [0, 0.4, 0]), (0.60, [0, 0.2, 0]), (0.8, [0, 0, 0])),
            channel="position"),
        trk("jaw", K((0, 0), (0.15, 8), (0.6, 6), (0.8, 0)), axis="x"),
    ] + [trk(p, delayed(roll, 0.06 + 0.02 * k, 1.8, L), axis="z") for k, p in enumerate(FUR_HANG)]}, STAND)
    return C


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
    "minecraft": {"fps": 24},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#28303c", "hero": [-38, 18], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles_for("base"),
    "parts": P,
    "animations": {},
}

VARIANT_RAMPS = {
    "sheared": {
        "fur": ["#1c1f2b", "#262a38", "#323746", "#3f4555", "#4e5566", "#5f6677", "#727889", "#878c9b", "#9da1ad",
                "#b2b5bd", "#c5c6c9", "#d4d3cf", "#e0ddd2", "#e9e4d5", "#f0eadb"],
        "pink": ["#2c2025", "#3d2c32", "#503a40", "#644a4f", "#7a5c60", "#8f6f71", "#a38384", "#b69897"],
    },
    "zombie": {
        # zombie-horse greens, a touch greyer and more teal: a rotten hide, not a green coat
        "fur": ["#0a140e", "#102016", "#172c1e", "#1f3827", "#284530", "#32533a", "#3d6044", "#486d4e", "#547a58",
                "#618763", "#6f936e", "#7e9f7a", "#8eab88", "#9eb797", "#afc3a7"],
        "rot": ["#0d1c13", "#13261a", "#1a3121", "#223d29", "#2b4a32", "#35573b"],
        "bone": ["#2a3427", "#46553f", "#64765a", "#859878", "#a5b697", "#c2d0b2", "#d9e3cb", "#e9f0df"],
        "eye": ["#030705", "#070e0a", "#0d1810", "#16241a", "#26362a"],
        "skin": ["#050a07", "#0a120d", "#101b14", "#17241b", "#1f2e23", "#2a3a2d"],
        "mouth": ["#070c09", "#0d150f", "#142017", "#1d2b20", "#283a2b", "#344a36"],
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
        out["light"] = dict(out["light"], strength=0.45, gradient=0.55, ao=0.9)   # flatter, vanilla-like shading
    return out


def finish():
    """Bake the clips (IK legs) into the spec."""
    spec["animations"] = bake(spec, adult_clips(), LEGS)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/polar_bear.json"
    finish()
    with open(out, "w") as fh:
        fh.write(dumps(spec))
    print(out, len(P), "parts")
    vdir = os.path.join(os.path.dirname(out) or ".", "variants")
    os.makedirs(vdir, exist_ok=True)
    for name, fn in VARIANTS.items():
        with open(os.path.join(vdir, f"{fn}.json"), "w") as fh:
            fh.write(dumps(variant_spec(name)))
    print("variants:", ", ".join(VARIANTS.values()))
