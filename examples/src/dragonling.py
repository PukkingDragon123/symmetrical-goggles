"""Builds examples/dragonling_baby.json, examples/dragonling_teen.json and the teen's armour texture variants
examples/variants/dragonling_teen_armor_{iron,gold,diamond}.json (Winterworks, The Living End).

    python examples/src/dragonling.py

Dragonlings are young Ender Dragons, drawn like the vanilla dragon but boxier and simpler: black scales with
very dark grey scale rows and lighter grey lips on the lit edges, light grey spines running in one row from the crown
of the head to the tip of the tail, flat glowing violet pixel eyes, a long, flat, box-like snout with nostril bumps
over a separate jaw, grey horn plates standing on the head like ears, flat membrane wings stretched over bony finger
spars, and a long tail. An original design in the Ender Dragon's spirit, not a copy of the vanilla model.

* **Baby** (about 14 x 16 x 30 px, wings half open): cute proportions: a big square head with 2 x 2 glowing eyes
  under a dark lid line, a short flat snout with two nostril bumps and two milk fangs, stubby horn plates; a chunky
  body with a charcoal belly, small wings (three finger spars each), short chunky legs and a long tail that curls to
  one side, a spine on most segments.
* **Teen** (about 30 x 32 x 82 px, wings folded): lean and rideable: a long two-part neck, a long Ender-Dragon head
  (a flat box snout with nostril bumps and a row of teeth, a separate jaw, two pairs of swept-back horn plates, 3 x 2
  almond eyes under brow ridges), big wings (arm and hand, four finger spars, a `_tip` joint at the wrist) folded
  along the flanks at rest, long legs with shins, a long six-part tail, spines from crown to tail tip (with a gap for
  the saddle), and a `saddle` (a seat with pommel and cantle, a blanket, side flaps with stirrups and a girth) that
  the renderer shows or hides. Armour shells (a helm, a snout plate, neck plates, a chest plate, flank plates:
  `armor_*`) are transparent in the plain texture; each armour variant paints them as iron, gold or diamond plate
  over the same UVs, so the renderer only swaps the texture.

Units are Minecraft pixels (16 per block), density 1 (one texel per pixel, like vanilla): every box is whole pixels,
so the models export 1:1 to vanilla entity models (python -m lowpix mc export). Faces +Z, ground at y = 0, "left" is
+X; the root (body) pivots in the middle of the torso.

Contract (mods/winterworks/docs/END_UPDATE.md section 13): bones body, neck, head, jaw, wing_l, wing_r, wing_l_tip,
wing_r_tip, tail_0..tail_3, leg_fl, leg_fr, leg_bl, leg_br, and on the teen saddle. Extra joints: neck_1 (teen),
shin_* (teen) and foot_* (legs), eye_l/r (flat eye cards; blinks squash them), tail_4 and tail_5 (the tail's tip,
swinging with the rest). Clips: idle, walk, fly, glide, eat (0.8 s), breath (1.0 s), sit; the baby also hatch
(1.5 s). Glow: the eyes (ramp eyeglow).

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/dragonling_baby.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/dragonling
    python -m lowpix mc export examples/dragonling_teen.json (same options)
    python -m lowpix mc export examples/variants/dragonling_teen_armor_iron.json --mod mods/winterworks \\
        --modid winterworks --texture-only --name dragonling_teen_armor_iron -o out/dragonling   (and gold, diamond)
"""
import copy
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import abs_track, toward  # noqa: E402
from end_vanilla_kit import (DENSITY, EPS, LIGHT, LR, M, MR, ROOT, Canvas, Rig, add, card_style, dump,  # noqa: E402
                             euler, ground_lock, keys, limb, mirror_art, osc, r, ramps, rest_on_ground, ring,
                             rot_matrix, sc, shake, skin, timeline, wave)

# ======================================================================= palette and paint (shared)
RAMPS = ramps(
    "eyeglow", "iron", "gold", "leather",
    # black scales with cool, very dark grey lights
    scale=["#030205", "#08070b", "#0f0e13", "#17161c", "#201e26", "#2a2832", "#35323e", "#413e4b", "#4e4a59",
           "#5c5868", "#6b6778"],
    # charcoal belly plates, a step lighter than the scales
    belly=["#0b0a0e", "#131217", "#1c1b21", "#26252c", "#313038", "#3d3b45", "#4a4853", "#585662", "#676572"],
    # light grey spines, horn plates, claws and teeth (cool shadows, warm highlights)
    bone=["#1c1b21", "#2b2a31", "#3e3c45", "#54525b", "#6c6a73", "#86848c", "#a09ea5", "#bbb9bd", "#d5d3d4",
          "#ecebe8"],
    # wing membrane: very dark grey with a violet cast
    membrane=["#09070c", "#110d16", "#1a1421", "#241c2d", "#2f243a", "#3a2d47", "#463656", "#534066", "#614b77",
              "#715889"],
    # the inside of the mouth
    maw=["#11050e", "#1d0918", "#2b0e24", "#3b1432", "#4d1b42", "#612453", "#782f66"],
    # the saddle's purpur blanket
    cloth=["#1f0d24", "#33163c", "#4a2156", "#622d70", "#7c3c8b", "#9750a4", "#b06abb", "#c98bd2", "#e0b2e6"],
    diamond=["#071f26", "#0b3039", "#11454f", "#195e68", "#237a84", "#3199a1", "#46b8bd", "#6bd2d2", "#9fe7e3",
             "#d4f8f4"],
)
LIGHT_D = dict(LIGHT, ao_height=6.0)
INVISIBLE = [{"faces": ["all"], "at": "top-left", "art": ["_" * 64] * 64}]

# rows of dark grey scales on the black hide (each lit at its top, shadowed under the next row), like the dragon's
SCALES = {"id": "scales", "op": "scales", "shape": "square", "along": "z", "size": [3, 2], "gap": 0.0,
          "highlight": 1.3, "shadow": -0.9, "gradient": 0.6, "jitter": 0.8, "faces": ["top", "sides"]}
BELLY_BAND = {"id": "belly", "op": "band", "axis": "y", "from": -1.01, "to": -0.55, "ramp": "belly", "tone": 3.6,
              "faces": ["sides", "front", "back", "bottom"]}
PLATES = {"id": "plates", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.34, "shift": -1.2}
HIDE = dict(grain=0.7, grain_scale=0.8, lip=2.0, shade=-0.8)

STYLES = {
    "scale": skin("scale", 3.4, layers=[SCALES], **HIDE),
    "scale_body": skin("scale", 3.4, layers=[SCALES, BELLY_BAND], **HIDE),
    "chest": skin("belly", 3.8, layers=[dict(PLATES, axis="y", faces=["front"]),
                                        {"id": "scaled", "op": "fill", "ramp": "scale", "tone": 3.4,
                                         "faces": ["top", "flanks"]}], **HIDE),
    "head": skin("scale", 3.6, layers=[dict(SCALES, size=[2, 2])], **HIDE),
    # the flat box snout: fine scale rows, a charcoal lip line, a lit nose ridge
    "snout": skin("scale", 3.6, layers=[dict(SCALES, size=[2, 1]),
                                        {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.4,
                                         "ramp": "belly", "tone": 3.2, "faces": ["sides", "front"]}], **HIDE),
    "jaw": skin("belly", 3.4, layers=[{"id": "mouth", "op": "fill", "ramp": "maw", "tone": 2.0, "faces": ["top"]},
                                      {"id": "tongue", "op": "band", "axis": "x", "from": -0.35, "to": 0.35,
                                       "ramp": "maw", "tone": 4.0, "faces": ["top"]},
                                      {"id": "scaled", "op": "band", "axis": "y", "from": 0.0, "to": 1.01,
                                       "ramp": "scale", "tone": 3.4, "faces": ["sides", "front"]},
                                      dict(PLATES, faces=["bottom"])], **HIDE),
    "brow": skin("scale", 4.8, grain=0.5, lip=2.4, shade=-1.2, clusters=False, dark_low=0),
    "nostril": skin("scale", 5.0, grain=0.4, lip=2.0, shade=-1.2, clusters=False, dark_low=0,
                    layers=[{"id": "hole", "op": "fill", "tone": 0.5, "faces": ["front"]}]),
    # flat painted eyes (cards): every texel comes from EYE_KEY
    "eye": {"ramp": "scale", "tone": 1.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "art_key": {}},
    # light grey horn plates and spines: darker at the root, a lit edge, growth lines
    "horn": skin("bone", 5.4, grain=0.6, lip=1.4, shade=-1.4, clusters=False, dark_low=0,
                 layers=[{"id": "rings", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.3, "shift": -0.8},
                         {"id": "root", "op": "gradient", "axis": "y", "amount": 1.6}]),
    "spine": skin("bone", 5.2, grain=0.6, lip=1.4, shade=-1.6, clusters=False, dark_low=0,
                  layers=[{"id": "root", "op": "gradient", "axis": "y", "amount": 2.4}]),
    # wing bones: dark grey bone, lighter than the membrane
    "wingbone": skin("bone", 3.4, grain=0.5, lip=1.6, shade=-1.0, clusters=False, dark_low=0),
    "spar": skin("bone", 3.8, grain=0.4, lip=1.4, shade=-0.8, clusters=False, dark_low=0),
    "leg": skin("scale", 3.4, layers=[dict(SCALES, along="y", size=[2, 2])], **HIDE),
    # feet: black scales, a charcoal sole, three pale claws on the front edge
    "foot": skin("scale", 3.2, grain=0.6, lip=1.8, shade=-0.8, dark_low=0,
                 layers=[{"id": "sole", "op": "fill", "ramp": "belly", "tone": 2.0, "faces": ["bottom"]}]),
    "tail": skin("scale", 3.4, layers=[SCALES, BELLY_BAND], **HIDE),
    "saddle": skin("leather", 4.0, grain=0.7, lip=1.4, shade=-1.0, dark_low=0, layers=[
        {"id": "stitch", "op": "panel", "inset": 1, "shift": -1.2, "highlight": 0.8, "shadow": -0.8,
         "min_size": 4}]),
    "brass": skin("gold", 4.4, grain=0.4, lip=1.8, shade=-1.6, clusters=False, dark_low=0),
    "blanket": skin("cloth", 4.4, grain=0.6, lip=1.2, shade=-1.0, dark_low=0, layers=[
        {"id": "trim", "op": "band", "axis": "x", "from": 0.75, "to": 1.01, "ramp": "gold", "tone": 4.4,
         "faces": ["top", "sides"]},
        {"id": "trim_r", "op": "band", "axis": "x", "from": -1.01, "to": -0.75, "ramp": "gold", "tone": 4.4,
         "faces": ["top", "sides"]},
        {"id": "fringe", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.5, "ramp": "gold", "tone": 3.6,
         "faces": ["left", "right"], "range": [-1.01, 1.01]}]),
    "strap": skin("leather", 3.0, grain=0.5, lip=1.0, shade=-0.8, clusters=False, dark_low=0),
    "stirrup": skin("leather", 3.0, grain=0.4, lip=1.0, shade=-0.8, clusters=False, dark_low=0, layers=[
        {"id": "iron", "op": "band", "axis": "y", "from": -1.01, "to": -0.3, "ramp": "gold", "tone": 4.6}]),
    "armor": {"ramp": "iron", "tone": 4, "light": 0, "brush": {"off": True}, "stamps": INVISIBLE},
}


def wing_style(s):
    """Dark membrane, deepest by the body and lighter toward the trailing edge; veins and a pale rim."""
    g = 1.0 if s > 0 else -1.0
    return card_style("membrane", 4.6, {"r": "membrane:8", "R": "membrane:6", "v": "membrane:7"}, light=0.3,
                      grain=0.6, dither=0.3,
                      layers=[{"id": "out_light", "op": "gradient", "axis": "x", "amount": -0.8 * g},
                              {"id": "trail_light", "op": "gradient", "axis": "z", "amount": 1.4}])


STYLES["wing_l"] = wing_style(1)
STYLES["wing_r"] = wing_style(-1)

# Eyes are flat painted pixels, like vanilla mob eyes: a card a hair in front of the head's surface (the eye_l / eye_r
# joints, so the blink clips squash them), lined up with the head's own texels. W a white catchlight, e bright violet,
# E deeper violet, p the pupil. Above each card the head paints a dark lid line.
EYE_KEY = {"W": "eyeglow:6", "e": "eyeglow:4", "E": "eyeglow:3", "p": "scale:0"}
EYE_BABY = ["We",          # 2 x 2 texels: a catchlight and a bright violet eye
            "eE"]
EYE_TEEN = ["Wee",         # 3 x 2 texels: a catchlight at the front, a pupil, sharper and more grown-up
            "epE"]
STYLES["eye"]["art_key"] = dict(EYE_KEY)


# ======================================================================= card art
def wing_hand(fingers, root_depth=None, scallop=0.16, seed=0):
    """The outer wing membrane of a left wing, lying flat (card plane xz) in the wrist frame: column 0 at the wrist,
    columns outward (+X); the bottom row is the leading edge at the wrist, rows above reach back (-Z).

    fingers: [(angle back from +X in degrees, length in px)], leading finger first. The membrane is stretched from
    the wrist between the finger tips with a scalloped edge between each pair, and from the last finger back to the
    wrist edge (`root_depth` px behind the wrist, where the inner membrane meets it). Returns (art, tips, (W, H)) with
    the finger tips in px in the wrist frame (x out, z), so finger-spar boxes can be laid exactly on the art.

    Characters: '.' clear, 'm' membrane, 'r'/'R' the trailing-edge rim, 'v' a vein. The spars are boxes laid over it."""
    tips = [(L * math.cos(math.radians(a)), L * math.sin(math.radians(a))) for a, L in fingers]
    root_depth = root_depth if root_depth is not None else tips[-1][1] * 0.45
    W = int(math.ceil(max(t[0] for t in tips) + 0.5))
    H = int(math.ceil(max(max(t[1] for t in tips), root_depth) + 0.5))
    c = Canvas(W, H)
    tx = lambda x, zb: (x, H - zb)  # noqa: E731   px (out, back) -> texel coords
    pts = [tx(0.0, -0.2), tx(tips[0][0] * 0.5, -0.25)]
    prev = None
    for k, (x, zb) in enumerate(tips):
        if prev is not None:
            mx, mz = (prev[0] + x) / 2, (prev[1] + zb) / 2
            pts.append(tx(mx * (1 - scallop), mz * (1 - scallop)))
        pts.append(tx(x + 0.15, zb + 0.1))
        prev = (x, zb)
    lx, lz = tips[-1]
    pts.append(tx(lx * 0.45, (lz + root_depth) / 2 * (1 - scallop)))
    pts.append(tx(0.0, root_depth))
    c.shape(pts, "m", jitter=0.1, seed=seed)
    for x, y in c.edge("m", "r"):
        if y >= H - 1 or x == 0:
            c.g[y][x] = "m"
        elif (x + 2 * y) % 3 == 0:
            c.g[y][x] = "R"
    # one clean vein between each pair of fingers, from the wrist toward the scallop
    for (ax, az), (bx, bz) in zip(tips, tips[1:]):
        mx, mz = (ax + bx) / 2 * 0.7, (az + bz) / 2 * 0.7
        c.line(tx(0.5, 0.5), tx(mx, mz), "v", where="m")
    return c.rows(), tips, (W, H)


def wing_inner(length, root_depth, wrist_depth, scallop=0.3, seed=0):
    """The inner wing membrane of a left wing (card plane xz) under the arm: column 0 at the shoulder, the last column
    at the wrist; the bottom row hangs from the arm, the top rows are the trailing edge, `root_depth` px deep at the
    body and `wrist_depth` at the wrist, with one scallop between."""
    W = int(round(length))
    H = int(math.ceil(max(root_depth, wrist_depth) + 0.5))
    c = Canvas(W, H)
    tx = lambda x, zb: (x, H - zb)  # noqa: E731
    mid = (root_depth + wrist_depth) / 2 * (1 - scallop)
    pts = [tx(-0.3, -0.2), tx(length + 0.3, -0.2), tx(length + 0.2, wrist_depth), tx(length * 0.55, mid),
           tx(length * 0.15, root_depth * 0.9), tx(-0.3, root_depth)]
    c.shape(pts, "m", jitter=0.1, seed=seed)
    for x, y in c.edge("m", "r"):
        if y >= H - 1 or x == 0 or x == W - 1:
            c.g[y][x] = "m"
        elif (x + 2 * y) % 3 == 0:
            c.g[y][x] = "R"
    # one strut from the elbow toward the trailing edge
    c.line((W * 0.5, H - 1), (W * 0.42, H * 0.45), "v", where="m")
    return c.rows(), (W, H)


# ======================================================================= builder
def build(kind):
    """kind: 'baby' or 'teen'. Returns (spec, rig, feet)."""
    teen = kind == "teen"
    R = Rig(density=DENSITY, bone_style="scale")
    part, bone, card = R.part, R.bone, R.card
    styles = copy.deepcopy(STYLES)

    def spine(id, parent, h, w=1, d=1, tilt=-30.0, **kw):
        """A light grey back spine standing on its parent (joint at its root), swept back by `tilt`."""
        return part(id, parent, [w, h, d], "spine", offset=(0, h / 2 - 0.5, 0), rot=(tilt, 0, 0), **kw)

    # ---------------------------------------------------------------- torso
    if not teen:
        part("body", None, [7, 6, 8], "scale_body", at=(0, 5.5, 0), centre=(0, 6.0, -0.5))
        part("chest", "body", [6, 5, 2], "chest", centre=(0, 5.5, 4.0))
        part("haunches", "body", [8, 5, 4], "scale_body", centre=(0, 5.5, -3.5))
        for j, (z, h) in enumerate(((2.0, 1), (0.0, 2), (-2.0, 2), (-4.0, 2))):
            spine(f"back_spine_{j}", "body", h, at=(0, 9.0, z))
        neck_at, neck_size, neck_rot = (0, 7.5, 3.5), [4, 4, 4], -38
    else:
        part("body", None, [10, 9, 12], "scale_body", at=(0, 15.0, 0), centre=(0, 15.5, 4.0))
        part("hips", "body", [9, 8, 12], "scale_body", centre=(0, 15.0, -7.0))
        part("belly", "body", [8, 2, 20], "chest", centre=(0, 11.0, -1.5))
        part("chest", "body", [9, 7, 2], "chest", centre=(0, 14.5, 11.0))
        part("withers", "body", [7, 2, 6], "scale", centre=(0, 21.0, 7.0))
        part("croup", "body", [8, 1, 6], "scale", centre=(0, 19.5, -9.5))
        for s in (1, -1):
            n = LR(s)
            part(f"shoulder_{n}", "body", [2, 5, 6], "scale", centre=M((5.0, 16.5, 6.5), s), rot=MR((0, 0, 6), s))
            part(f"thigh_{n}", "body", [2, 6, 7], "scale", centre=M((4.5, 15.0, -7.5), s), rot=MR((0, 0, 4), s))
        # spines on the withers and the croup, clear of the saddle between them
        for j, (z, h, y) in enumerate(((9.0, 3, 21.5), (6.5, 4, 21.5), (-8.5, 3, 20.0), (-11.0, 4, 20.0))):
            spine(f"back_spine_{j}", "body", h, at=(0, y, z), w=2, d=2)
        neck_at, neck_size, neck_rot = (0, 17.5, 9.5), [5, 5, 8], -50

    # ---------------------------------------------------------------- neck
    part("neck", "body", neck_size, "scale", at=neck_at, offset=(0, 0, neck_size[2] / 2 - 0.5), wrot=(neck_rot, 0, 0))
    if not teen:
        spine("neck_spine", "neck", 2, rel=(0, 2.0, 1.5), tilt=-20)
        head_parent, head_rel, head_rot = "neck", (0, 0.2, 3.0), (34, 0, 0)
    else:
        spine("neck_spine_0", "neck", 3, rel=(0, 2.5, 1.5), tilt=-10)
        spine("neck_spine_1", "neck", 3, rel=(0, 2.5, 5.0), tilt=-10)
        part("neck_1", "neck", [4, 4, 7], "scale", rel=(0, 0, 7.0), offset=(0, 0, 3.0), rot=(22, 0, 0))
        spine("neck_spine_2", "neck_1", 2, rel=(0, 2.0, 1.5), tilt=-14)
        spine("neck_spine_3", "neck_1", 2, rel=(0, 2.0, 4.5), tilt=-14)
        head_parent, head_rel, head_rot = "neck_1", (0, 0, 6.5), (30, 0, 0)

    # ---------------------------------------------------------------- head
    if not teen:
        hw, hh, hd = 8, 6, 6
        ho = np.array((0, 2.0, 1.5))               # cranium centre in the head frame
    else:
        hw, hh, hd = 7, 6, 6
        ho = np.array((0, 1.5, 1.5))
    head = part("head", head_parent, [hw, hh, hd], "head", rel=head_rel, offset=tuple(ho), rot=head_rot)
    front, top, back = ho[2] + hd / 2, ho[1] + hh / 2, ho[2] - hd / 2
    if not teen:
        # a short, flat box snout low on the face, two nostril bumps, milk fangs painted on its lip, a jaw under it
        sw, sh, sl = 4, 2, 4
        sy = ho[1] - 2.0
        part("snout", "head", [sw, sh, sl], "snout", rel=(0, sy, front + sl / 2 - 1.0),
             paint={"stamps": [{"face": "front", "at": "bottom-left", "art": ["t..t"],
                                "key": {"t": "bone:8"}}]})
        s_bot = sy - sh / 2
        for s in (1, -1):
            part(f"nostril_{LR(s)}", "snout", [1, 1, 1], "nostril", rel=M((1.0, sh / 2 + 0.5, sl / 2 - 1.0), s))
        part("jaw", "head", [4, 1, 4], "jaw", rel=(0, s_bot, front - 1.0), offset=(0, -0.5, 1.5))
        # two flat 2 x 2 eyes on the face above the snout, on the face's own texel grid, a dark lid line over each
        eye_top, stamps = top - 1.0, []
        for s in (1, -1):
            n = LR(s)
            ex = 2.0 * s
            card(f"eye_{n}", "head", EYE_BABY, "eye", plane="xy", rel=(ex, eye_top - 1.0, front + EPS))
            stamps.append({"face": "front", "at": [int(round(ex - 1.0 + hw / 2)), 0], "art": ["kk"],
                           "key": {"k": "scale:0"}})
        head["paint"] = {"stamps": stamps}
        for s in (1, -1):
            n = LR(s)
            # stubby horn plates standing on the head like ears, a smaller pair behind
            part(f"horn_{n}0", "head", [1, 3, 3], "horn", rel=M((2.5, top - 0.5, ho[2] - 0.5), s),
                 offset=(0, 1.0, -0.5), rot=MR((-24, 0, -10), s))
            part(f"horn_{n}1", "head", [1, 2, 2], "horn", rel=M((3.5, top - 0.5, ho[2] - 2.0), s),
                 offset=(0, 0.5, -0.5), rot=MR((-30, 0, -30), s))
        spine("head_spine_0", "head", 2, rel=(0, top - 0.5, ho[2] - 0.5), tilt=-28)
        spine("head_spine_1", "head", 2, rel=(0, top - 0.5, ho[2] - 2.0), tilt=-40)
    else:
        # the Ender Dragon's long, flat box snout with nostril bumps and teeth, and a separate jaw
        sw, sh, sl = 5, 3, 9
        sy = ho[1] - 1.0
        teeth = [{"faces": ["left", "right"], "at": "bottom-left", "art": ["t..t..t.t"], "key": {"t": "bone:6"}},
                 {"face": "front", "at": "bottom-left", "art": ["t...t"], "key": {"t": "bone:6"}}]
        part("snout", "head", [sw, sh, sl], "snout", rel=(0, sy, front + sl / 2 - 1.0), rot=(2, 0, 0),
             paint={"stamps": teeth})
        s_bot = sy - sh / 2
        for s in (1, -1):
            n = LR(s)
            part(f"nostril_{n}", "snout", [1, 1, 2], "nostril", rel=M((1.5, sh / 2 + 0.5, sl / 2 - 1.5), s))
        part("jaw", "head", [5, 2, 9], "jaw", rel=(0, s_bot - 0.5, ho[2] - 1.0), offset=(0, -0.5, 4.5), rot=(3, 0, 0),
             paint={"stamps": [{"faces": ["left", "right"], "at": "top-left", "art": [".t..t..t."],
                                "key": {"t": "bone:6"}}]})
        for s in (1, -1):
            n = LR(s)
            part(f"cheek_{n}", "head", [1, 3, 4], "head", rel=M((hw / 2 + 0.5, ho[1] - 1.5, ho[2] - 0.5), s))
        # flat almond eyes on the sides of the head, 3 x 2 texels on the face's texel grid, a dark lid line above
        # them that runs past the front corner (image-left is the front on the left face, the back on the right)
        ez0, ez1, eye_top, stamps = front - 4.0, front - 1.0, top - 1.0, []
        lid = ["kkkk", "k..."]
        for s in (1, -1):
            n = LR(s)
            card(f"eye_{n}", "head", EYE_TEEN, "eye", plane="yz",
                 rel=(s * (hw / 2 + EPS), eye_top - 1.0, (ez0 + ez1) / 2))
            col = int(round(front - ez1)) - 1 if s > 0 else int(round(ez0 - back))
            stamps.append({"face": "left" if s > 0 else "right", "at": [max(0, col), int(round(top - eye_top)) - 1],
                           "art": lid if s > 0 else mirror_art(lid), "key": {"k": "scale:0"}})
        head["paint"] = {"stamps": stamps}
        for s in (1, -1):
            n = LR(s)
            part(f"brow_{n}", "head", [2, 1, 4], "brow", rel=M((hw / 2 - 0.5, top - 0.5, front - 2.0), s),
                 rot=MR((-8, 0, -14), s))
            # two pairs of swept-back horn plates (the Ender Dragon's head scales), the front pair with a tip
            part(f"horn_{n}0", "head", [1, 4, 5], "horn", rel=M((1.5, top - 0.5, ho[2] - 0.5), s),
                 offset=(0, 1.5, -1.5), rot=MR((-26, 0, -6), s))
            part(f"horn_{n}0_tip", f"horn_{n}0", [1, 2, 3], "horn", rel=(0, 2.5, -4.0), offset=(0, 0, -0.5),
                 rot=(-14, 0, 0))
            part(f"horn_{n}1", "head", [1, 2, 4], "horn", rel=M((3.0, top - 1.5, ho[2] - 1.5), s),
                 offset=(0, 1.0, -1.0), rot=MR((-30, 0, -34), s))
        spine("head_spine_0", "head", 2, rel=(0, top - 0.5, ho[2]), tilt=-30)
        spine("head_spine_1", "head", 2, rel=(0, top - 0.5, ho[2] - 2.5), tilt=-40)

    # ---------------------------------------------------------------- wings
    if not teen:
        sh_at, arm_len, arm_t, tip_t = (3.5, 8.5, 1.0), 5, 1, 1
        fingers = [(8, 7.0), (36, 6.0), (64, 5.0)]
        # half open and held up, the membrane hanging down and back so it shows from the side
        inner_root, rest_arm, rest_tip = 4.0, (-55, 30, 35), (0, -15, -35)
    else:
        sh_at, arm_len, arm_t, tip_t = (4.5, 19.5, 6.0), 13, 2, 1
        fingers = [(6, 15.0), (24, 14.0), (44, 13.0), (66, 11.0)]
        # folded along the flank: the arm swept back with its rear end lifted, the hand folded forward over it
        rest_arm = tuple(euler(rot_matrix((10, 0, 0)) @ rot_matrix((-90, 75, 15))))
        inner_root, rest_tip = 9.5, (0, 6, 172)
    root_d = max(math.sin(math.radians(a)) * L for a, L in fingers) * 0.5
    hand_art, tips, (HW, HH) = wing_hand(fingers, root_depth=root_d, seed=12)
    inner_art, (IW, IH) = wing_inner(arm_len, inner_root, root_d, seed=11)
    for s in (1, -1):
        n = LR(s)
        wid = f"wing_{n}"
        bone(wid, "body", at=M(sh_at, s), rot=MR(rest_arm, s))
        part(f"{wid}_arm", wid, [arm_len, arm_t, arm_t], "wingbone", rel=(0, 0, 0), offset=(s * arm_len / 2, 0, 0))
        card(f"{wid}_m", wid, inner_art if s > 0 else mirror_art(inner_art), f"wing_{n}", plane="xz",
             rel=(s * IW / 2, -0.1, -IH / 2 + 0.5))
        bone(f"{wid}_tip", wid, rel=(s * arm_len, 0, 0), rot=MR(rest_tip, s))
        if teen:
            part(f"{wid}_knuckle", f"{wid}_tip", [arm_t + 1, arm_t + 1, arm_t + 1], "wingbone")
        card(f"{wid}_tip_m", f"{wid}_tip", hand_art if s > 0 else mirror_art(hand_art), f"wing_{n}", plane="xz",
             rel=(s * HW / 2, -0.12, -HH / 2 + 0.5))
        for k, ((a, L), (fx, fz)) in enumerate(zip(fingers, tips)):
            ln = max(1, round(math.hypot(fx, fz)))
            part(f"{wid}_finger_{k}", f"{wid}_tip", [ln, tip_t, tip_t], "spar", rel=(0, 0, 0),
                 offset=(s * ln / 2, 0, 0), rot=MR((0, a, 0), s))

    # ---------------------------------------------------------------- tail
    if not teen:
        tails = [((0, 5.5, -5.0), [4, 3, 5], (-10, 6, 0)), ([3, 3, 4], (0, 8, 0)), ([3, 2, 4], (6, 10, 0)),
                 ([2, 2, 4], (8, 10, 0)), ([2, 2, 3], (6, 10, 0)), ([1, 1, 3], (4, 10, 0))]
        tspines = [(2, 1, 1), (1, 1, 1), (1, 1, 1), (1, 1, 1)]
    else:
        tails = [((0, 15.5, -12.5), [6, 5, 8], (-16, 5, 0)), ([5, 4, 8], (-6, 7, 0)), ([4, 3, 8], (5, 8, 0)),
                 ([3, 3, 8], (7, 8, 0)), ([3, 2, 7], (6, 8, 0)), ([2, 2, 6], (6, 6, 0))]
        tspines = [(3, 2, 2), (3, 1, 2), (2, 1, 2), (2, 1, 1), (2, 1, 1), (1, 1, 1)]
    prev = "body"
    for j, t in enumerate(tails):
        tid = f"tail_{j}"
        if j == 0:
            at, size, rot = t
            part(tid, prev, size, "tail", at=at, offset=(0, 0, -size[2] / 2 + 0.5), rot=rot)
        else:
            size, rot = t
            part(tid, prev, size, "tail", rel=(0, -0.2, -tails[j - 1][-2][2] + 1.0), offset=(0, 0, -size[2] / 2 + 0.5),
                 rot=rot)
        if j < len(tspines):
            h, w, d = tspines[j]
            spine(f"{tid}_spine", tid, h, w=w, d=d, rel=(0, size[1] / 2, -size[2] / 2 + 0.5), tilt=-34)
            if teen and j < 3:
                spine(f"{tid}_spine_b", tid, h - 1, w=w, d=d, rel=(0, size[1] / 2, -size[2] + 2.0), tilt=-34)
        prev = tid

    # ---------------------------------------------------------------- legs
    feet = []
    claws = {"front": ["c.c.c"], "top": ["c.c.c"]}
    if not teen:
        LEGS = {"f": ((2.5, 5.0, 2.5), (2.5, 1.0, 3.0), None, 2, 2, [3, 1, 3]),
                "b": ((3.0, 5.0, -3.0), (3.5, 1.0, -2.0), None, 3, 3, [3, 1, 4])}
    else:
        LEGS = {"f": ((4.0, 13.5, 6.5), (4.5, 7.5, 7.5), (4.5, 1.0, 6.5), 3, 4, [4, 1, 5]),
                "b": ((4.5, 13.5, -7.5), (5.0, 7.5, -4.5), (5.0, 1.0, -8.5), 4, 5, [4, 1, 6])}
    for kk, (hip, knee, ankle, th, dp, fsize) in LEGS.items():
        for s in (1, -1):
            n = LR(s)
            lid = f"leg_{kk}{n}"
            e = limb(R, lid, "body", M(hip, s), M(knee, s), th, "leg", depth=dp)
            parent = lid
            if ankle is not None:
                e = limb(R, f"shin_{kk}{n}", lid, e, M(ankle, s), th - 1, "leg", depth=th - 1)
                parent = f"shin_{kk}{n}"
            fid = f"foot_{kk}{n}"
            cw = "c.c.c"[:fsize[0] + (1 if fsize[0] % 2 == 0 else 0)][:fsize[0]]
            part(fid, parent, fsize, "foot", at=e, centre=(e[0], fsize[1] / 2, e[2] + fsize[2] / 2 - 1.0),
                 wrot=(0, 0, 0), paint={"stamps": [{"face": "front", "at": "top-left", "art": [cw],
                                                    "key": {"c": "bone:5"}}]})
            feet.append(fid)

    # ---------------------------------------------------------------- teen: saddle and armour shells
    if teen:
        bone("saddle", "body", at=(0, 20.0, -1.5))
        part("saddle_blanket", "saddle", [11, 1, 11], "blanket", rel=(0, 0.5, 0))
        part("saddle_seat", "saddle", [8, 2, 9], "saddle", rel=(0, 2.0, 0))
        part("saddle_cantle", "saddle_seat", [7, 3, 2], "saddle", rel=(0, 1.5, -4.0), rot=(14, 0, 0))
        part("saddle_pommel", "saddle_seat", [3, 3, 2], "saddle", rel=(0, 1.5, 4.0), rot=(-12, 0, 0))
        part("saddle_horn", "saddle_pommel", [1, 2, 1], "brass", rel=(0, 2.0, 0.0))
        for s in (1, -1):
            n = LR(s)
            part(f"saddle_flap_{n}", "saddle", [1, 5, 7], "saddle", rel=M((6.0, -2.5, 0), s), rot=(0, 0, s * -4))
            part(f"saddle_buckle_{n}", f"saddle_flap_{n}", [1, 1, 1], "brass", rel=M((0.5, -1.5, 2.0), s))
            part(f"stirrup_{n}", f"saddle_flap_{n}", [1, 4, 2], "stirrup", rel=M((0.5, -2.5, -1.0), s),
                 offset=(0, -2.0, 0))
        part("saddle_girth", "saddle", [11, 10, 1], "strap", rel=(0, -4.5, 1.5), hide=["top", "bottom"])

        hx = tuple(ho + (0, hh / 2 - 0.5, 0.0))
        for nm, par, size, rel in (
                ("armor_head", "head", [8, 2, 7], hx),
                ("armor_snout", "snout", [6, 1, 7], (0, 1.5, -1.0)),
                ("armor_neck", "neck", [6, 2, 9], (0, 2.0, 3.5)),
                ("armor_neck_1", "neck_1", [5, 2, 8], (0, 1.5, 3.0)),
                ("armor_chest", "body", [11, 8, 2], (0, 0.0, 11.5)),
                ("armor_flank_l", "body", [1, 8, 11], (5.5, 1.0, 4.0)),
                ("armor_flank_r", "body", [1, 8, 11], (-5.5, 1.0, 4.0))):
            part(nm, par, size, "armor", rel=rel)

    spec = {
        "name": "Dragonling Baby" if not teen else "Dragonling Teen",
        "description": ("The Winterworks baby Dragonling: a chubby young Ender Dragon in vanilla style: a big square "
                        "head with flat 2 x 2 glowing violet eyes under a lid line, a flat box snout with nostril bumps "
                        "and milk fangs, stubby grey horn plates, light grey spines from crown to tail tip, small flat "
                        "membrane wings on bony finger spars and a long curling tail."
                        if not teen else
                        "The Winterworks teen Dragonling: a lean, rideable young Ender Dragon in vanilla style: black "
                        "scales, a long flat box snout with nostril bumps and teeth over a separate jaw, swept-back "
                        "horn plates, flat 3 x 2 glowing violet eyes, light grey spines from crown to tail tip, big "
                        "flat membrane wings on bony finger spars folded at rest, a long spined tail, a saddle the "
                        "renderer can hide, and transparent armour shells that the armour textures paint.")
        + " Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 1400 if teen else 800, "colors": 96},
        "light": LIGHT_D,
        "minecraft": {"fps": 24, "glow_ramps": ["eyeglow"]},
        "anim_ground_tolerance": 0.3,
        "render": {"background": "#8f9a86", "hero": [36, 20], "shadow": 0.5},
        "palette": {"ramps": RAMPS},
        "styles": styles,
        "parts": R.P,
        "animations": {},
    }
    return spec, R, feet



# ======================================================================= animation
def legs_x(fl=(0, 0, 0), fr=(0, 0, 0), bl=(0, 0, 0), br=(0, 0, 0), teen=True):
    """Pitch each leg's (upper, shin, foot) joints; the baby has no shins (the shin value is ignored)."""
    out = {}
    for nm, v in (("fl", fl), ("fr", fr), ("bl", bl), ("br", br)):
        out = add(out, r(f"leg_{nm}", v[0]), r(f"foot_{nm}", v[2]))
        if teen:
            out = add(out, r(f"shin_{nm}", v[1]))
    return out


def wings_abs(R, arm, tip):
    """Absolute local rotations for both wings (left values; the right mirrors)."""
    out = {}
    for s in (1, -1):
        n = LR(s)
        out = add(out, toward(R, f"wing_{n}", MR(arm, s)), toward(R, f"wing_{n}_tip", MR(tip, s)))
    return out


def flap_tracks(R, length, cycles, amp, sweep=8.0, bias=0.0, tip_amp=None, tip_lag=0.12, tip_bias=0.0, base=(0, 0, 0),
                fold=0.0):
    """Spread wings beating about `base` (left values): the arm flaps (z) and sweeps (y), the hand follows a little
    later and wider; `fold` tucks the hand on the upstroke."""
    tip_amp = amp * 0.8 if tip_amp is None else tip_amp
    tr = []
    for s in (1, -1):
        n = LR(s)

        def arm_fn(t, s=s):
            ph = 2 * math.pi * cycles * t / length
            return MR((base[0], base[1] + sweep * math.sin(ph + math.pi / 2), base[2] + bias + amp * math.sin(ph)), s)

        def tip_fn(t, s=s):
            ph = 2 * math.pi * cycles * t / length - 2 * math.pi * tip_lag
            up = max(0.0, math.sin(ph + 0.6))
            return MR((0, -fold * up, tip_bias + tip_amp * math.sin(ph)), s)

        tr.append(abs_track(R, f"wing_{n}", length, arm_fn))
        tr.append(abs_track(R, f"wing_{n}_tip", length, tip_fn))
    return tr


TAIL = ["tail_0", "tail_1", "tail_2", "tail_3", "tail_4", "tail_5"]


def animate(spec, R, teen):
    A = {}
    REST = {}
    ws = 1.0 if teen else 0.8          # the baby's motions are a touch smaller and bouncier
    neck = ["neck", "neck_1", "head"] if teen else ["neck", "head"]

    def blink(t):
        kk = [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + 0.05, [0, -0.85, 0]], [t + 0.09, [0, -0.85, 0]], [t + 0.14, [0, 0, 0]]]
        return [keys("eye_l", None, kk, ch="scale"), keys("eye_r", None, kk, ch="scale")]

    # idle: breathing, looking about, a blink, the tail tip swaying, wings resettling
    L = 3.0
    A["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
        osc("body", None, [0.03, 0.04, 0.02], 2, 0.0, ch="scale"),
        osc("neck", "x", -3, 2, 0.1), osc("head", "y", 14, 1, 0.2), osc("head", "z", 5, 1, 0.45),
        keys("jaw", "x", [[0, 0], [1.6, 0], [1.75, 10, "out"], [1.9, 4], [2.05, 10], [2.25, 0], [3.0, 0]]),
        wave(TAIL, "y", 7 * ws, 1, lag=0.1, growth=1.2), wave(TAIL, "x", -2, 2, lag=0.1),
        osc("wing_l", "z", 3, 1, 0.3), osc("wing_r", "z", -3, 1, 0.3),
        osc("wing_l_tip", "y", -4, 2, 0.5), osc("wing_r_tip", "y", 4, 2, 0.5),
    ] + blink(0.8) + blink(2.4))

    # walk: diagonal pairs, the body bobbing twice a stride, the neck nodding, the tail swinging after
    L = 1.4 if teen else 1.0
    sw = 26 if teen else 30

    def leg_cycle(nm, ph):
        tr = [osc(f"leg_{nm}", "x", sw, 1, ph)]
        if teen:
            tr.append({"part": f"shin_{nm}", "axis": "x", "keys": [[((u + ph) % 1.0) * L, v] for u, v in
                                                                   sorted(((u + ph) % 1.0, v) for u, v in
                                                                          ((0.0, 0), (0.3, 4), (0.55, 30), (0.8, 10)))],
                       "ease": "smooth"})
        tr.append(osc(f"foot_{nm}", "x", -sw * 0.6, 1, ph + 0.1))
        return tr

    A["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True,
                         extra=leg_cycle("fl", 0.0) + leg_cycle("br", 0.0) + leg_cycle("fr", 0.5) + leg_cycle("bl", 0.5)
                         + [osc("body", "z", 3, 1, 0.0), osc("body", "x", 1.5, 2, 0.1),
                            osc("neck", "x", 4, 2, 0.2), osc("head", "x", -4, 2, 0.3), osc("head", "y", -4, 1, 0.1),
                            wave(TAIL, "y", 8 * ws, 1, lag=0.12, growth=1.15, phase=0.1),
                            osc("wing_l", "z", 4, 2, 0.2), osc("wing_r", "z", -4, 2, 0.2)]
                         + ([osc("saddle", None, [0, 0.15, 0], 2, 0.3, ch="position"), osc("saddle", "z", 1.5, 1, 0.1)]
                            if teen else []),
                         lift=[[0, 0], [L * 0.25, 0.4], [L * 0.5, 0], [L * 0.75, 0.4], [L, 0]])

    # fly: wings spread and beating, legs tucked, the neck stretched forward, the tail streaming
    L = 1.0 if teen else 0.8
    TUCK = legs_x((60, -70, 50), (60, -70, 50), (50, 60, 40), (50, 60, 40), teen)
    FLY = add(TUCK, r("body", -4), r("neck", 18 if teen else 14), r("head", -14), r("tail_0", -8))
    A["fly"] = timeline(L, [(0.0, FLY, None), (L, FLY, None)], loop=True, lock=False,
                        extra=flap_tracks(R, L, 2 if teen else 3, 34 if teen else 40, bias=8, fold=26)
                        + [osc("body", None, [0, 0.8, 0], 2 if teen else 3, 0.75, ch="position"),
                           osc("body", "x", 3, 2 if teen else 3, 0.0),
                           wave(neck, "x", 3, 2 if teen else 3, lag=0.1),
                           wave(TAIL, "y", 5, 1, lag=0.12, growth=1.15), wave(TAIL, "x", 3.5, 2, lag=0.1)]
                        + ([osc("saddle", "x", 1.0, 2, 0.4)] if teen else []))
    A["fly"]["grounded"] = False

    # glide: wings held out wide, banking gently, the hands flexing, the tail rudder swinging
    L = 2.0
    A["glide"] = timeline(L, [(0.0, FLY, None), (L, FLY, None)], loop=True, lock=False,
                          extra=flap_tracks(R, L, 1, 4, sweep=3, bias=6, tip_amp=6, tip_bias=-4)
                          + [osc("body", "z", 8, 1, 0.0), osc("body", None, [0, 0.6, 0], 1, 0.25, ch="position"),
                             osc("head", "z", -6, 1, 0.05), wave(TAIL, "y", -7, 1, lag=0.12, growth=1.15)])
    A["glide"]["grounded"] = False

    # eat: dips its head, two greedy chomps, tosses the morsel back and gulps
    DIP = add(r("neck", 30 if teen else 26), r("head", 24), r("jaw", 30), r("body", 6))
    CHOMP = add(DIP, r("jaw", -30), r("head", -6))
    TOSS = add(r("neck", -16), r("head", -26), r("jaw", 26), sc("neck", 0.06, 0.08, 0))
    A["eat"] = timeline(0.8, [(0.0, REST, None), (0.16, DIP, "out"), (0.24, CHOMP, "in"), (0.3, DIP, "out"),
                              (0.38, CHOMP, "in"), (0.5, TOSS, "out"), (0.58, add(TOSS, r("jaw", -26)), "in"),
                              (0.8, REST, "ease")],
                        extra=[shake("head", 0.22, 0.42, 6, freq=10, axis=1)])

    # breath: rears back drawing a breath (chest swells), then thrusts the neck forward, jaw wide, and holds the blast
    INHALE = add(r("body", -8), r("neck", -24), r("head", -12), sc("body", 0.08, 0.1, 0.04), r("tail_0", 6),
                 *[r(f"wing_{n}", 0, 0, s * 12) for s, n in ((1, "l"), (-1, "r"))])
    BLAST = add(r("body", 4), r("neck", 22 if teen else 14), r("head", -22 if teen else -10), r("jaw", 38),
                sc("body", -0.04, -0.04, 0),
                *[r(f"wing_{n}", 0, 0, -s * 8) for s, n in ((1, "l"), (-1, "r"))], r("tail_0", 3))
    A["breath"] = timeline(1.0, [(0.0, REST, None), (0.28, INHALE, "out"), (0.38, BLAST, "out_back"),
                                 (0.8, add(BLAST, r("neck", 4)), "ease"), (1.0, REST, "ease")],
                           extra=[shake("head", 0.4, 0.8, 2.5, freq=14, axis=1),
                                  shake("jaw", 0.4, 0.8, 4, freq=12, axis=0),
                                  ring("tail_3", 0.38, 10, freq=5, decay=4, axis=1, end=1.0),
                                  ring("tail_5", 0.42, 14, freq=5, decay=4, axis=1, end=1.0)])

    # sit: down on its haunches, front legs straight, chest up, the tail curled round, looking about
    SIT = add(r("body", -18 if teen else -14), legs_x((18, -10, 4), (18, -10, 4), (-70, 100, -20), (-70, 100, -20), teen),
              r("neck", -6), r("head", 16), r("tail_0", 18, 8), r("tail_1", 0, 18), r("tail_2", 0, 22),
              r("tail_3", 0, 22), r("tail_4", 0, 20), r("tail_5", 0, 16))
    if not teen:
        # the baby plops down on its round bottom: hind legs stuck out in front, chest up, a happy head tilt
        SIT = add(r("body", -24), legs_x((24, 0, 6), (24, 0, 6), (-84, 0, 78), (-84, 0, 78), False),
                  r("neck", -8), r("head", 20, 0, 8), r("tail_0", 34, 10), r("tail_1", -4, 18), r("tail_2", 0, 22),
                  r("tail_3", 0, 22), r("tail_4", 0, 20), r("tail_5", 0, 16))
    L = 3.0
    lift = None if teen else [[0, 0.45], [L, 0.45]]     # the baby sits on its round bottom, not through it
    A["sit"] = timeline(L, [(0.0, SIT, None), (L, SIT, None)], loop=True, lift=lift, extra=[
        osc("body", None, [0.03, 0.04, 0.02], 2, 0.0, ch="scale"),
        osc("head", "y", 12, 1, 0.0), osc("head", "z", 6, 1, 0.3), osc("neck", "x", -3, 2, 0.2),
        wave(["tail_3", "tail_4", "tail_5"], "y", 7, 1, lag=0.12, growth=1.25),
    ] + blink(1.6))

    if not teen:
        # hatch: curled up tight in a ball, a wriggle, then it bursts open: stretches up, wings flared, a squeak with
        # the jaw open, shakes off the shell bits and settles
        CURL = add(r("body", 20), sc("body", -0.12, -0.12, -0.12), r("neck", 50), r("head", 40),
                   wings_abs(R, (0, 80, -10), (0, -120, 0)),
                   legs_x((60, 0, 40), (60, 0, 40), (-40, 0, -20), (-40, 0, -20), False),
                   r("tail_0", 30, 34), r("tail_1", 0, 36), r("tail_2", 0, 36), r("tail_3", 0, 34), r("tail_4", 0, 30),
                   r("tail_5", 0, 26))
        STRETCH = add(r("body", -14), sc("body", -0.04, 0.1, -0.04), r("neck", -18), r("head", -12), r("jaw", 34),
                      r("tail_0", 22), r("tail_1", 6),
                      wings_abs(R, (0, -10, 50), (0, 20, 30)), legs_x((-10, 0, 0), (-10, 0, 0), (10, 0, 0), (10, 0, 0),
                                                                   False))
        A["hatch"] = timeline(1.5, lift=[[0, 3.4], [0.42, 3.4], [0.56, 2.0], [0.72, 0, "out"], [1.5, 0]],
                              keys=[(0.0, CURL, None), (0.3, add(CURL, r("body", -4)), "ease"),
                                    (0.42, add(CURL, sc("body", 0.06, 0.06, 0.06)), "in"), (0.62, STRETCH, "out_back"),
                                    (0.9, add(STRETCH, r("jaw", -20)), "ease"), (1.15, add(r("head", 6)), "ease"),
                                    (1.5, REST, "ease")],
                              extra=[shake("body", 0.08, 0.38, 6, freq=10, axis=2),
                                     shake("head", 0.9, 1.2, 14, freq=9, axis=1),
                                     ring("wing_l_tip", 0.62, -12, freq=6, decay=5, axis=2, end=1.5),
                                     ring("wing_r_tip", 0.62, 12, freq=6, decay=5, axis=2, end=1.5)])
    spec["animations"] = A


# ======================================================================= armour variants
def armor_style(metal):
    """Plate armour over the shells: polished plates, lighter on top, a recessed groove inset from the edges, rivets
    at the corners, a dark outline, wet highlight dashes; diamond is cut into bevelled facets instead of riveted."""
    tone = {"iron": 5.0, "gold": 4.8, "diamond": 5.2}[metal]
    layers = [{"id": "sky", "op": "gradient", "axis": "y", "amount": -1.0},
              {"id": "temper", "op": "noise", "scale": 2.0, "amount": 0.35},
              {"id": "groove", "op": "panel", "inset": 1, "shift": -1.4, "highlight": 1.4, "shadow": -1.4,
               "min_size": 6},
              {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.8,
               "shift": 2.6}]
    if metal == "diamond":
        layers.insert(2, {"id": "facets", "op": "patches", "scale": 1.4, "threshold": 0.5, "shift": 1.6,
                          "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.6, "highlight_shift": 1.8}})
    else:
        layers.append({"id": "rivets", "op": "rivets", "inset": 1, "spacing": 4, "highlight": 2.6, "shadow": -2.6,
                       "min_size": 5})
        layers.append({"id": "chips", "op": "wear", "width": 1, "density": 0.12, "shift": -2.4})
    return {"ramp": metal, "tone": tone, "light": 0.9, "dither": 0.0,
            "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6, "outline": "dark"},
            "brush": {"off": True}, "layers": layers}


# a cut amethyst set in the gold chest plate and brow
GEM = [".ab.", "abBc", "bBcc", ".cc."]
GEM_KEY = {"a": "cloth:8", "b": "cloth:6", "B": "cloth:7", "c": "cloth:3"}


def variant_spec(spec, metal):
    out = copy.deepcopy(spec)
    out["name"] = f"Dragonling Teen Armor {metal.title()}"
    out["styles"]["armor"] = armor_style(metal)
    if metal == "gold":
        for p in out["parts"]:
            if p["id"] in ("armor_chest", "armor_head"):
                p["paint"] = {"stamps": [{"face": "front" if p["id"] == "armor_chest" else "top", "at": "center",
                                          "art": GEM, "key": GEM_KEY}]}
    return out


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples")
    for kind in ("baby", "teen"):
        spec, R, feet = build(kind)
        animate(spec, R, kind == "teen")
        rest_on_ground(spec["parts"], DENSITY, feet)
        ground_lock(spec, "body", feet)
        dump(spec, os.path.join(out_dir, f"dragonling_{kind}.json"))
        if kind == "teen":
            vdir = os.path.join(out_dir, "variants")
            os.makedirs(vdir, exist_ok=True)
            for metal in ("iron", "gold", "diamond"):
                dump(variant_spec(spec, metal), os.path.join(vdir, f"dragonling_teen_armor_{metal}.json"))
