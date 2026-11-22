"""Builds examples/dragonling_baby.json, examples/dragonling_teen.json and the teen's armour texture variants
examples/variants/dragonling_teen_armor_{iron,gold,diamond}.json (Winterworks, The Living End).

    python examples/src/dragonling.py

Dragonlings are young Ender Dragons: black and very dark grey scales, light grey spines running in one row from the
crown of the head to the tip of the tail, glowing violet eyes, a long, flat, box-like snout with nostril bumps over a
separate jaw, a pair of grey horn plates standing on the head like ears, membranous wings stretched over bony finger
spars, and a long tail. An original design in the Ender Dragon's spirit, not a copy of the vanilla model.

* **Baby** (about 13 x 15 x 30 px, wings half open): cute proportions: a big square head with huge round glowing eyes
  under heavy brows, round cheeks, a short flat snout with two nostril bumps and two milk fangs, stubby horn plates; a
  chunky barrel body with a charcoal belly, small wings (two finger spars each), short chunky legs and a long tail
  that curls to one side, a spine on every segment.
* **Teen** (about 30 x 30 x 80 px, wings folded): lean and rideable: a long two-part neck, a long Ender-Dragon head
  (a flat box snout with nostril bumps and teeth, a separate jaw, two pairs of swept-back horn plates, almond eyes
  under brow ridges, jaw spikes), big wings (arm and hand, three finger spars, a `_tip` joint at the wrist) folded
  along the flanks at rest, long legs with shins, a long six-part tail ending in a pointed spade, spines from crown to
  tail tip (with a gap for the saddle), and a `saddle` (a seat with pommel and cantle, a fringed blanket, side flaps
  with stirrups and a girth) that the renderer shows or hides. Armour shells (a helm, a snout plate, neck plates, a
  chest plate, flank plates: `armor_*`) are transparent in the plain texture; each armour variant paints them as
  iron, gold or diamond plate over the same UVs, so the renderer only swaps the texture.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the models export 1:1
to vanilla entity models (python -m lowpix mc export). Faces +Z, ground at y = 0, "left" is +X; the root (body)
pivots in the middle of the torso.

Contract (mods/winterworks/docs/END_UPDATE.md section 13): bones body, neck, head, jaw, wing_l, wing_r, wing_l_tip,
wing_r_tip, tail_0..tail_3, leg_fl, leg_fr, leg_bl, leg_br, and on the teen saddle. Extra joints: neck_1 (teen),
shin_* (teen) and foot_* (legs), eye_l/r, tail_4 and tail_5 (the tail's tip, swinging with the rest). Clips: idle,
walk, fly, glide, eat (0.8 s), breath (1.0 s), sit; the baby also hatch (1.5 s). Glow: the eyes (ramp eyeglow).

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
from end_kit import (DENSITY, LR, M, MR, ROOT, Canvas, Rig, abs_track, add, claws, dump, euler,  # noqa: E402
                     ground_lock, keys, limb, locks, mirror_art, osc, r, ramps, rest_on_ground, ring, rot_matrix, sc,
                     shake, spikes, timeline, toward, wave)

# ======================================================================= palette and paint (shared)
RAMPS = ramps(
    "eyeglow",
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
    # saddle leather, brass, a purpur blanket
    leather=["#1d110b", "#311c12", "#472918", "#5e3720", "#77472a", "#915a36", "#a96d42", "#c08453"],
    brass=["#2c1d08", "#4d3410", "#74501a", "#9a6e26", "#bf8e37", "#dcae52", "#f2cf7a", "#fff0b8"],
    cloth=["#1f0d24", "#33163c", "#4a2156", "#622d70", "#7c3c8b", "#9750a4", "#b06abb", "#c98bd2", "#e0b2e6"],
    # armour
    iron=["#17191d", "#262a30", "#383d45", "#4d535d", "#656c77", "#7f8792", "#9aa2ac", "#b7bec6", "#d3d8dd",
          "#edf0f2"],
    gold=["#2c1503", "#4a2405", "#6e3706", "#94500a", "#b86b0e", "#d68b12", "#eaa91c", "#f6c934", "#fde35c",
          "#fff399"],
    diamond=["#071f26", "#0b3039", "#11454f", "#195e68", "#237a84", "#3199a1", "#46b8bd", "#6bd2d2", "#9fe7e3",
             "#d4f8f4"],
)
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.8, "gradient": 0.5, "ao": 0.5, "ao_height": 6.0}
BRUSH = {"flow": "long", "length": 1.6, "width": 0.6, "rough": 0.55, "overshoot": 0.25,
         "textures": {"scale": "scales", "belly": "leather", "bone": "wood", "membrane": "organic",
                      "leather": "leather", "iron": "metal", "gold": "metal", "diamond": "crystal", "cloth": "cloth"}}

RIM = {"light": 1, "dark": 1, "light_shift": 2.2, "dark_shift": -1.2}
NOBRUSH = {"off": True}      # scale patterns stay crisp: no stroke smearing on the scaled hide
# overlapping round scales: each lit at its top and ringed dark, shadowed under the next row, a random tone apiece
SCALES = {"id": "scales", "op": "scales", "shape": "round", "along": "z", "size": [2.5, 2.0], "gradient": 5.6,
          "rim": -1.2, "shadow": -2.2, "jitter": 0.9, "faces": ["top", "sides"]}
SMALL_SCALES = dict(SCALES, size=[2.0, 2.0])
SHEEN = {"id": "sheen", "op": "spots", "count": 3, "radius": [0.6, 1.0], "stretch": [1, 0.5, 2], "shift": 1.0,
         "faces": ["top"], "roughness": 0.5}
BELLY_BAND = {"id": "belly", "op": "band", "axis": "y", "from": -1.01, "to": -0.55, "ramp": "belly", "tone": 3.4,
              "wobble": 0.15, "faces": ["sides", "front", "back", "bottom"],
              "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.4}}
# charcoal belly plates: square plates in rows across the belly
PLATES = {"id": "plates", "op": "scales", "shape": "square", "along": "x", "size": [3.5, 1.5], "gap": 0.5,
          "highlight": 1.6, "gradient": 1.5, "shadow": -1.6, "jitter": 0.5}
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.5,
         "shift": 1.6}
INVISIBLE = [{"faces": ["all"], "at": "top-left", "art": ["_" * 64] * 64}]

STYLES = {
    "scale": {"ramp": "scale", "tone": 3.0, "rim": RIM, "brush": NOBRUSH,
              "layers": [SMALL_SCALES, SHEEN, {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.6},
                         GLOSS]},
    "scale_body": {"ramp": "scale", "tone": 3.0, "rim": RIM, "brush": NOBRUSH,
                   "layers": [SCALES, SHEEN, BELLY_BAND, GLOSS]},
    "belly": {"ramp": "belly", "tone": 3.2, "rim": RIM, "brush": NOBRUSH, "layers": [PLATES]},
    "chest": {"ramp": "belly", "tone": 3.4, "rim": RIM, "brush": NOBRUSH,
              "layers": [dict(PLATES, faces=["front", "bottom"]),
                         {"id": "scaled_sides", "op": "fill", "ramp": "scale", "tone": 3.0, "faces": ["top", "flanks"]},
                         dict(SMALL_SCALES, faces=["top", "flanks"])]},
    "head": {"ramp": "scale", "tone": 3.2, "rim": dict(RIM, light_shift=2.4), "brush": NOBRUSH,
             "layers": [dict(SMALL_SCALES, faces=["top", "sides", "back"]),
                        dict(SMALL_SCALES, id="face_scales", size=[1.5, 1.5], gradient=3.5, faces=["front"]),
                        SHEEN, GLOSS]},
    # the flat box snout: fine scales, a paler lip line, a lit nose ridge
    "snout": {"ramp": "scale", "tone": 3.2, "rim": dict(RIM, light_shift=2.4), "brush": NOBRUSH,
              "layers": [dict(SCALES, size=[1.5, 1.0], gradient=3.5, faces=["top", "sides"]), GLOSS,
                         {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.55, "ramp": "belly",
                          "tone": 3.0, "faces": ["sides", "front"]},
                         {"id": "ridge", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "shift": 1.2,
                          "faces": ["top", "front"], "bevel": {"shadow": 1, "highlight": 0, "shadow_shift": -1.2}}]},
    "cheek": {"ramp": "scale", "tone": 3.0, "rim": RIM, "brush": NOBRUSH,
              "layers": [dict(SMALL_SCALES, along="y"), SHEEN,
                         {"id": "jowl", "op": "band", "axis": "y", "from": -1.01, "to": -0.35, "ramp": "belly",
                          "tone": 3.0, "faces": ["sides", "front", "bottom"]}]},
    "jaw": {"ramp": "belly", "tone": 3.0, "rim": RIM, "brush": NOBRUSH,
            "layers": [{"id": "mouth", "op": "fill", "ramp": "maw", "tone": 2.0, "faces": ["top"]},
                       {"id": "tongue", "op": "band", "axis": "x", "from": -0.35, "to": 0.35, "ramp": "maw",
                        "tone": 4.0, "faces": ["top"]},
                       {"id": "scaled", "op": "band", "axis": "y", "from": 0.0, "to": 1.01, "ramp": "scale",
                        "tone": 3.0, "faces": ["sides", "front"]},
                       {"id": "chin", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.25, "shift": -1.3,
                        "faces": ["bottom"]}]},
    "brow": {"ramp": "scale", "tone": 4.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -1.6},
             "brush": NOBRUSH},
    "nostril": {"ramp": "scale", "tone": 4.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.4},
                "brush": NOBRUSH, "layers": [{"id": "hole", "op": "fill", "tone": 0.5, "faces": ["front"]}]},
    # flat painted eyes (cards): every texel comes from EYE_KEY
    "eye": {"ramp": "scale", "tone": 1.0, "light": 0, "brush": NOBRUSH, "art_key": {}},
    # light grey horn plates and spines: darker at the root, a lit edge, fine growth lines
    "horn": {"ramp": "bone", "tone": 6.4, "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.6},
             "brush": NOBRUSH,
             "layers": [{"id": "rings", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.3, "shift": -0.8},
                        {"id": "root", "op": "gradient", "axis": "y", "amount": 2.4}]},
    "spine": {"ramp": "bone", "tone": 6.2, "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.8},
              "brush": {"flow": "y"},
              "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 3.0},
                         {"id": "grain", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3, "shift": -0.6}]},
    "spike": {"ramp": "bone", "tone": 5, "light": 0.2, "brush": NOBRUSH,
              "art_key": {"t": "bone:8", "m": "bone:6", "f": "bone:4"}},
    "tooth": {"ramp": "bone", "tone": 7, "light": 0, "brush": NOBRUSH,
              "art_key": {"t": "bone:9", "m": "bone:7", "f": "bone:6", "c": "bone:7"}},
    "claw": {"ramp": "bone", "tone": 5, "light": 0, "brush": NOBRUSH,
             "art_key": {"c": "bone:6", "t": "bone:8"}},
    # wing bones: dark grey bone, lighter than the membrane, knuckle rings
    "wingbone": {"ramp": "bone", "tone": 3.4, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.2},
                 "brush": NOBRUSH,
                 "layers": [{"id": "knuckles", "op": "stripes", "axis": "x", "period": 3.0, "width": 0.15,
                             "shift": 1.4}]},
    "spar": {"ramp": "bone", "tone": 3.8, "rim": {"light": 1, "dark": 0, "light_shift": 1.6}, "brush": NOBRUSH,
             "layers": [{"id": "root", "op": "gradient", "axis": "x", "amount": 0.8}]},
    "leg": {"ramp": "scale", "tone": 3.0, "rim": RIM, "brush": NOBRUSH,
            "layers": [dict(SMALL_SCALES, along="y", size=[1.5, 1.5]), SHEEN,
                       {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.8}]},
    "foot": {"ramp": "scale", "tone": 3.0, "rim": RIM, "brush": NOBRUSH,
             "layers": [{"id": "sole", "op": "fill", "ramp": "belly", "tone": 2.0, "faces": ["bottom"]},
                        {"id": "toes", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3, "shift": -1.4,
                         "faces": ["top", "front"]}]},
    "tail": {"ramp": "scale", "tone": 3.0, "rim": RIM, "brush": NOBRUSH,
             "layers": [SMALL_SCALES, SHEEN, BELLY_BAND, GLOSS]},
    "saddle": {"ramp": "leather", "tone": 4.6, "rim": RIM, "brush": {"flow": "z"},
               "layers": [{"id": "stitch", "op": "panel", "inset": 1, "shift": -1.4, "highlight": 1.0, "shadow": -1.0,
                           "min_size": 4},
                          {"id": "wear", "op": "wear", "width": 1, "density": 0.2, "shift": 1.4}, GLOSS]},
    "brass": {"ramp": "brass", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6},
              "brush": {"off": True}},
    "blanket": {"ramp": "cloth", "tone": 4.6, "rim": RIM, "brush": {"flow": "x"},
                "layers": [{"id": "trim", "op": "band", "axis": "x", "from": 0.78, "to": 1.01, "ramp": "brass",
                            "tone": 4.6, "faces": ["top", "sides"]},
                           {"id": "trim_r", "op": "band", "axis": "x", "from": -1.01, "to": -0.78, "ramp": "brass",
                            "tone": 4.6, "faces": ["top", "sides"]},
                           {"id": "weave", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.3, "shift": -0.8}]},
    "fringe": {"ramp": "cloth", "tone": 4, "light": 0.2, "brush": {"off": True},
               "art_key": {"t": "brass:5", "m": "cloth:5", "f": "cloth:3"}},
    "strap": {"ramp": "leather", "tone": 3.6, "rim": RIM, "brush": {"off": True}},
    "stirrup": {"ramp": "brass", "tone": 4, "light": 0, "brush": {"off": True},
                "art_key": {"s": "leather:3", "b": "brass:4", "B": "brass:6"}},
    "armor": {"ramp": "iron", "tone": 4, "light": 0, "brush": {"off": True}, "stamps": INVISIBLE},
}


def wing_style(s):
    """Dark membrane, deepest by the body and lighter toward the trailing edge; veins and a pale rim."""
    g = 1.0 if s > 0 else -1.0
    return {"ramp": "membrane", "tone": 4.8, "light": 0.25, "brush": {"flow": "x", "length": 1.6, "rough": 0.4},
            "layers": [{"id": "out_light", "op": "gradient", "axis": "x", "amount": -0.8 * g},
                       {"id": "trail_light", "op": "gradient", "axis": "z", "amount": 1.6},
                       {"id": "mottle", "op": "noise", "scale": 1.5, "amount": 0.5}],
            "art_key": {"b": "membrane:1", "r": "membrane:8", "R": "membrane:6", "v": "membrane:6",
                        "c": "bone:7", "C": "bone:5"}}


STYLES["wing_l"] = wing_style(1)
STYLES["wing_r"] = wing_style(-1)

# Eyes are flat painted pixels, like vanilla mob eyes: a card lying on the head's surface (the eye_l / eye_r joints,
# so the blink clips squash them), lined up with the head's own texels. W a white catchlight, e bright violet,
# E deeper violet, p the pupil. Under each card the head paints a dark lid line that shows while the eye blinks.
EYE_KEY = {"W": "eyeglow:6", "e": "eyeglow:4", "E": "eyeglow:3", "p": "scale:0"}
EYE_BABY = ["We",          # 2 x 2 texels: a catchlight and a bright violet eye
            "eE"]
EYE_TEEN = ["Wee",         # 3 x 2 texels: a catchlight at the front, a pupil, sharper and more grown-up
            "epE"]
STYLES["eye"]["art_key"] = dict(EYE_KEY)


# ======================================================================= card art
def wing_hand(fingers, d=DENSITY, root_depth=None, scallop=0.16, seed=0):
    """The outer wing membrane of a left wing, lying flat (card plane xz) in the wrist frame: column 0 at the wrist,
    columns outward (+X); the bottom row is the leading edge at the wrist, rows above reach back (-Z).

    fingers: [(angle back from +X in degrees, length in units)], leading finger first. The membrane is stretched from
    the wrist between the finger tips with a scalloped edge between each pair, and from the last finger back to the
    wrist edge (`root_depth` units behind the wrist, where the inner membrane meets it). Returns (art, tips, (W, H))
    with the finger tips in units in the wrist frame (x out, z), so finger-spar boxes can be laid exactly on the art.

    Characters: '.' clear, 'm' membrane, 'r'/'R' the trailing-edge rim, 'v' veins. The spars are boxes laid over it."""
    tips = [(L * math.cos(math.radians(a)), L * math.sin(math.radians(a))) for a, L in fingers]
    root_depth = root_depth if root_depth is not None else tips[-1][1] * 0.45
    W = int(math.ceil((max(t[0] for t in tips) + 0.5) * d))
    H = int(math.ceil((max(max(t[1] for t in tips), root_depth) + 0.5) * d))
    c = Canvas(W, H)
    tx = lambda x, zb: (x * d, H - zb * d)  # noqa: E731   units (out, back) -> texel coords
    pts = [tx(0.0, -0.2), tx(tips[0][0] * 0.5, -0.25)]
    prev = None
    for k, (x, zb) in enumerate(tips):
        if prev is not None:
            mx, mz = (prev[0] + x) / 2, (prev[1] + zb) / 2
            pts.append(tx(mx * (1 - scallop), mz * (1 - scallop)))
        pts.append(tx(x + 0.15, zb + 0.1))
        prev = (x, zb)
    # the last scallop runs back to the wrist edge
    lx, lz = tips[-1]
    pts.append(tx(lx * 0.45, (lz + root_depth) / 2 * (1 - scallop)))
    pts.append(tx(0.0, root_depth))
    c.shape(pts, "m", jitter=0.15, seed=seed)
    for x, y in c.edge("m", "r"):
        if y >= H - 1 or x == 0:
            c.g[y][x] = "m"
        elif (x + 2 * y) % 3 == 0:
            c.g[y][x] = "R"
    rng = random.Random(seed)
    # fine veins branching off the spars toward the trailing edge
    for k in range(int(W * H / 50) + 2):
        x0, y0 = rng.uniform(0.15, 0.9) * W, rng.uniform(0.2, 0.8) * H
        if c.get(int(x0), int(y0)) != "m":
            continue
        c.line((x0, y0), (x0 + rng.uniform(-1.0, 2.0), y0 - rng.uniform(1.5, 3.0)), "v", where="m")
    return c.rows(), tips, (W, H)


def wing_inner(length, root_depth, wrist_depth, d=DENSITY, scallop=0.3, seed=0):
    """The inner wing membrane of a left wing (card plane xz) under the arm: column 0 at the shoulder, the last column
    at the wrist; the bottom row hangs from the arm, the top rows are the trailing edge, `root_depth` units deep at the
    body and `wrist_depth` at the wrist, with one scallop between."""
    W = int(round(length * d))
    H = int(math.ceil((max(root_depth, wrist_depth) + 0.5) * d))
    c = Canvas(W, H)
    tx = lambda x, zb: (x * d, H - zb * d)  # noqa: E731
    mid = (root_depth + wrist_depth) / 2 * (1 - scallop)
    pts = [tx(-0.3, -0.2), tx(length + 0.3, -0.2), tx(length + 0.2, wrist_depth), tx(length * 0.55, mid),
           tx(length * 0.15, root_depth * 0.9), tx(-0.3, root_depth)]
    c.shape(pts, "m", jitter=0.15, seed=seed)
    for x, y in c.edge("m", "r"):
        if y >= H - 1 or x == 0 or x == W - 1:
            c.g[y][x] = "m"
        elif (x + 2 * y) % 3 == 0:
            c.g[y][x] = "R"
    rng = random.Random(seed + 3)
    # radiating veins from the arm toward the trailing edge, and one strut from the elbow
    for k in range(int(W / 4) + 1):
        x0 = rng.uniform(0.1, 0.95) * W
        c.line((x0, H - 1), (x0 - rng.uniform(0.5, 2.5), H * rng.uniform(0.25, 0.55)), "v", where="m")
    return c.rows(), (W, H)


def tail_spade(w, h, ch_t="t", ch_m="m", ch_f="f"):
    """A pointed spade for the tail's tip (image top = the point), w x h texels, curved flanks."""
    c = Canvas(w, h)
    W, H = float(w), float(h)
    c.shape([(W / 2, -0.4), (W * 0.82, H * 0.35), (W + 0.3, H * 0.78), (W * 0.62, H * 0.66), (W * 0.58, H + 0.3),
             (W * 0.42, H + 0.3), (W * 0.38, H * 0.66), (-0.3, H * 0.78), (W * 0.18, H * 0.35)], ch_f)
    for x, y in c.edge(ch_f, ch_m):
        pass
    for y in range(h):
        for x in range(w):
            if c.g[y][x] == ch_m and (y < H * 0.4 or abs(x - (W - 1) / 2) > W * 0.3):
                c.g[y][x] = ch_t
    c.line(((W - 1) / 2 + 0.5, 1), ((W - 1) / 2 + 0.5, H - 1), ch_m, where=ch_f)
    return c.rows()


def fangs(w, xs, h=2, ch="t", mid="m"):
    """A row of fangs hanging from the top row at columns xs (others clear)."""
    rows = [["."] * w for _ in range(h)]
    for x in xs:
        for y in range(h):
            rows[y][x] = ch if y == h - 1 else mid
    return ["".join(r) for r in rows]


# ======================================================================= builder
def build(kind):
    """kind: 'baby' or 'teen'. Returns (spec, rig, feet)."""
    teen = kind == "teen"
    R = Rig(density=DENSITY, bone_style="scale")
    part, bone, card = R.part, R.bone, R.card
    styles = copy.deepcopy(STYLES)
    if teen:   # the teen's bigger body wears bigger scales
        styles["scale_body"]["layers"][0] = dict(SCALES, size=[3.0, 2.5], gradient=5.5)
        styles["tail"]["layers"][0] = dict(SCALES, size=[2.5, 2.0])

    def spine(id, parent, h, w=1.0, d=1.5, tilt=-30.0, **kw):
        """A light grey back spine standing on its parent (joint at its root), swept back by `tilt`."""
        return part(id, parent, [w, h, d], "spine", offset=(0, h / 2 - 0.35, 0), rot=(tilt, 0, 0), **kw)

    # ---------------------------------------------------------------- torso
    if not teen:
        part("body", None, [7, 6, 8], "scale_body", at=(0, 5.5, 0), centre=(0, 6.0, -0.5))
        part("chest", "body", [6, 5.5, 2.5], "chest", centre=(0, 6.0, 4.0))
        part("belly", "body", [6, 1.5, 7.5], "belly", centre=(0, 2.75, -0.25))
        part("haunches", "body", [8, 5, 4], "scale_body", centre=(0, 5.25, -3.25))
        part("shoulders", "body", [7.5, 2, 3.5], "scale", centre=(0, 8.25, 1.75))
        for j, (z, h) in enumerate(((2.25, 1.5), (0.25, 2.0), (-1.75, 2.5), (-3.75, 2.0))):
            spine(f"back_spine_{j}", "body", h, at=(0, 9.0 if j else 9.25, z), d=1.5 if j else 1.0)
        neck_at, neck_size, neck_rot = (0, 7.5, 3.5), [4, 4, 3.5], -38
    else:
        part("body", None, [10, 9, 12], "scale_body", at=(0, 15.0, 0), centre=(0, 15.5, 4.0))
        part("hips", "body", [9, 8, 12], "scale_body", centre=(0, 15.25, -7.0))
        part("belly", "body", [8.5, 2, 20], "belly", centre=(0, 11.25, -1.5))
        part("chest", "body", [9, 7, 2], "chest", centre=(0, 14.5, 10.75))
        part("withers", "body", [7, 2, 6], "scale", centre=(0, 20.75, 7.25))
        part("croup", "body", [8, 1.5, 6], "scale", centre=(0, 19.5, -9.5))
        for s in (1, -1):
            n = LR(s)
            part(f"shoulder_{n}", "body", [1.5, 5, 6], "scale", centre=M((5.25, 16.75, 6.5), s), rot=MR((0, 0, 6), s))
            part(f"thigh_{n}", "body", [1.5, 6, 7], "scale", centre=M((4.75, 15.25, -7.5), s), rot=MR((0, 0, 4), s))
        # spines on the withers and the croup, clear of the saddle between them
        for j, (z, h, y) in enumerate(((9.25, 3.0, 21.5), (6.75, 3.5, 21.5), (-8.5, 3.0, 20.0),
                                       (-11.0, 3.5, 20.0))):
            spine(f"back_spine_{j}", "body", h, at=(0, y, z), w=1.5, d=2.0)
        neck_at, neck_size, neck_rot = (0, 17.5, 9.5), [5, 5, 8], -50

    # ---------------------------------------------------------------- neck
    part("neck", "body", neck_size, "scale", at=neck_at, offset=(0, 0, neck_size[2] / 2 - 0.5), wrot=(neck_rot, 0, 0))
    part("throat", "neck", [neck_size[0] - 1, 1, neck_size[2] - 0.5], "belly",
         rel=(0, -neck_size[1] / 2, neck_size[2] / 2 - 0.5))
    if not teen:
        spine("neck_spine", "neck", 1.5, rel=(0, 2.0, 1.4), d=1.0, tilt=-20)
        head_parent, head_rel, head_rot = "neck", (0, 0.2, 2.7), (34, 0, 0)
    else:
        spine("neck_spine_0", "neck", 2.5, rel=(0, 2.5, 1.5), w=1.0, d=1.5, tilt=-10)
        spine("neck_spine_1", "neck", 2.5, rel=(0, 2.5, 5.0), w=1.0, d=1.5, tilt=-10)
        part("neck_1", "neck", [4.5, 4.5, 7], "scale", rel=(0, 0, 7.0), offset=(0, 0, 3.0), rot=(22, 0, 0))
        part("throat_1", "neck_1", [3.5, 1, 6.5], "belly", rel=(0, -2.25, 3.0))
        spine("neck_spine_2", "neck_1", 2.0, rel=(0, 2.25, 1.5), w=1.0, d=1.5, tilt=-14)
        spine("neck_spine_3", "neck_1", 2.0, rel=(0, 2.25, 4.5), w=1.0, d=1.5, tilt=-14)
        head_parent, head_rel, head_rot = "neck_1", (0, 0, 6.5), (30, 0, 0)

    # ---------------------------------------------------------------- head
    if not teen:
        hw, hh, hd = 7, 6, 6
        ho = np.array((0, 1.8, 1.4))               # cranium centre in the head frame
    else:
        hw, hh, hd = 6.5, 5.5, 6
        ho = np.array((0, 1.4, 1.6))
    head = part("head", head_parent, [hw, hh, hd], "head", rel=head_rel, offset=tuple(ho), rot=head_rot)
    front, top, back = ho[2] + hd / 2, ho[1] + hh / 2, ho[2] - hd / 2
    D = DENSITY
    if not teen:
        # a short, flat box snout low on the face, two nostril bumps, milk fangs, a jaw under it
        sw, sh, sl = 4.5, 2, 4
        sy = ho[1] - 1.75
        part("snout", "head", [sw, sh, sl], "snout", rel=(0, sy, front + sl / 2 - 0.75))
        s_top, s_bot, s_front = sy + sh / 2, sy - sh / 2, front + sl - 0.75
        for s in (1, -1):
            part(f"nostril_{LR(s)}", "snout", [1, 0.5, 1.5], "nostril", rel=M((1.4, sh / 2 + 0.2, sl / 2 - 1.1), s))
        card("fangs", "snout", fangs(10, (2, 7), 2), "tooth", plane="xy", rel=(0, -sh / 2 - 0.5, sl / 2 + 0.05))
        part("jaw", "head", [4, 1, 3.5], "jaw", rel=(0, s_bot, front - 0.25), offset=(0, -0.5, 1.5))
        part("chin", "jaw", [3, 0.5, 2], "jaw", rel=(0, -0.75, 1.75))
        # two small flat eyes on the face above the snout, each 2 x 2 texels on the face's own texel grid
        eye_top, stamps = top - 1.5, []
        for s in (1, -1):
            n = LR(s)
            ex = 2.0 * s
            card(f"eye_{n}", "head", EYE_BABY, "eye", plane="xy", rel=(ex, eye_top - 0.5, front + 0.06))
            stamps.append({"face": "front", "at": [int(round((ex - 0.5 + hw / 2) * D)), int(round((top - eye_top) * D))],
                           "art": ["..", "kk"], "key": {"k": "scale:0"}})
        head["paint"] = {"stamps": stamps}
        for s in (1, -1):
            n = LR(s)
            # stubby horn plates standing on the head like ears, a smaller pair behind
            part(f"horn_{n}0", "head", [1, 2.5, 3], "horn", rel=M((2.0, top - 0.3, ho[2] - 0.6), s),
                 offset=(0, 1.0, -0.4), rot=MR((-24, 0, -10), s))
            part(f"horn_{n}1", "head", [0.5, 1.5, 2], "horn", rel=M((3.0, top - 0.6, ho[2] - 1.8), s),
                 offset=(0, 0.6, -0.4), rot=MR((-30, 0, -30), s))
        spine("head_spine_0", "head", 1.5, rel=(0, top - 0.25, ho[2] - 0.3), d=1.0, tilt=-28)
        spine("head_spine_1", "head", 1.5, rel=(0, top - 0.5, ho[2] - 2.0), d=1.0, tilt=-40)
    else:
        # the Ender Dragon's long, flat box snout with nostril bumps, a row of teeth, and a separate jaw
        sw, sh, sl = 5, 3, 8.5
        sy = ho[1] - 1.0
        part("snout", "head", [sw, sh, sl], "snout", rel=(0, sy, front + sl / 2 - 0.75), rot=(2, 0, 0))
        s_bot = sy - sh / 2
        for s in (1, -1):
            n = LR(s)
            part(f"nostril_{n}", "snout", [1, 1, 2], "nostril", rel=M((1.5, sh / 2 + 0.4, sl / 2 - 1.5), s))
            card(f"teeth_{n}", "snout", fangs(15, range(0, 15, 2), 2), "tooth", plane="yz",
                 rel=M((sw / 2 - 0.3, -sh / 2 - 0.5, 0.25), s))
        card("teeth", "snout", fangs(10, (0, 2, 7, 9), 2), "tooth", plane="xy",
             rel=(0, -sh / 2 - 0.5, sl / 2 - 0.3))
        part("jaw", "head", [4.5, 1.5, 9.5], "jaw", rel=(0, s_bot - 0.1, ho[2] - 1.0), offset=(0, -0.75, 4.75),
             rot=(3, 0, 0))
        part("chin", "jaw", [3.5, 1, 3], "jaw", rel=(0, -0.75, 8.0))
        for s in (1, -1):
            n = LR(s)
            card(f"jaw_teeth_{n}", "jaw", fangs(14, range(1, 14, 2), 2), "tooth", plane="yz",
                 rel=M((1.9, 1.25, 5.5), s), offset=(0, 0, 0), rot=(180, 0, 0))
            part(f"cheek_{n}", "head", [1, 2.5, 4], "cheek", rel=M((hw / 2 + 0.25, ho[1] - 1.35, ho[2] - 0.5), s))
            card(f"cheek_spikes_{n}", "head", spikes(8, 4, 30 + s), "spike", plane="yz",
                 rel=M((hw / 2 + 0.8, ho[1] - 1.5, ho[2] - 1.5), s), offset=(0, 0, -1.0), rot=MR((-20, 0, 0), s))
        # flat almond eyes on the sides of the head, 3 x 2 texels on the face's texel grid, a dark lid line above
        # them that runs past the front corner (image-left is the front on the left face, the back on the right)
        ez0, ez1, eye_top, stamps = front - 2.5, front - 1.0, top - 1.5, []
        lid = ["kkkk", "k...", ".kkk"]
        for s in (1, -1):
            n = LR(s)
            card(f"eye_{n}", "head", EYE_TEEN, "eye", plane="yz",
                 rel=(s * (hw / 2 + 0.06), eye_top - 0.5, (ez0 + ez1) / 2))
            col = int(round((front - ez1) * D)) - 1 if s > 0 else int(round((ez0 - back) * D))
            stamps.append({"face": "left" if s > 0 else "right", "at": [col, int(round((top - eye_top) * D)) - 1],
                           "art": lid if s > 0 else mirror_art(lid), "key": {"k": "scale:0"}})
        head["paint"] = {"stamps": stamps}
        for s in (1, -1):
            n = LR(s)
            part(f"brow_{n}", "head", [1.5, 1, 4], "brow", rel=M((hw / 2 - 0.25, top - 0.3, front - 1.9), s),
                 rot=MR((-8, 0, -14), s))
            # two pairs of swept-back horn plates (the Ender Dragon's head scales), the front pair with a tip
            part(f"horn_{n}0", "head", [1, 3.5, 5], "horn", rel=M((1.6, top - 0.4, ho[2] - 0.6), s),
                 offset=(0, 1.4, -1.5), rot=MR((-26, 0, -6), s))
            part(f"horn_{n}0_tip", f"horn_{n}0", [1, 2, 2.5], "horn", rel=(0, 2.2, -3.8), offset=(0, 0, -0.6),
                 rot=(-14, 0, 0))
            part(f"horn_{n}1", "head", [1, 2, 3.5], "horn", rel=M((2.9, top - 1.4, ho[2] - 1.6), s),
                 offset=(0, 0.8, -1.2), rot=MR((-30, 0, -34), s))
        spine("head_spine_0", "head", 2.0, rel=(0, top - 0.25, ho[2] - 0.2), w=1.0, d=1.5, tilt=-30)
        spine("head_spine_1", "head", 2.0, rel=(0, top - 0.5, ho[2] - 2.4), w=1.0, d=1.5, tilt=-40)

    # ---------------------------------------------------------------- wings
    if not teen:
        sh_at, arm_len, arm_t, tip_t = (3.2, 8.2, 1.0), 4.5, 1.0, 0.5
        fingers = [(8, 6.5), (34, 6.0), (62, 5.0)]
        # half open and held up, the membrane hanging down and back so it shows from the side
        inner_root, rest_arm, rest_tip = 4.0, (-55, 30, 35), (0, -15, -35)
    else:
        sh_at, arm_len, arm_t, tip_t = (4.5, 19.5, 6.0), 13.0, 1.5, 1.0
        fingers = [(6, 14.5), (24, 14.0), (44, 12.5), (66, 10.5)]
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
             rel=(s * IW / 4, -0.1, -IH / 4 + 0.25))
        bone(f"{wid}_tip", wid, rel=(s * arm_len, 0, 0), rot=MR(rest_tip, s))
        part(f"{wid}_knuckle", f"{wid}_tip", [arm_t + 0.5, arm_t + 0.5, arm_t + 0.5], "wingbone")
        card(f"{wid}_tip_m", f"{wid}_tip", hand_art if s > 0 else mirror_art(hand_art), f"wing_{n}", plane="xz",
             rel=(s * HW / 4, -0.12, -HH / 4 + 0.25))
        for k, ((a, L), (fx, fz)) in enumerate(zip(fingers, tips)):
            ln = max(1.0, round(math.hypot(fx, fz) * DENSITY) / DENSITY)
            th = tip_t if k else max(tip_t, arm_t - 0.5)
            part(f"{wid}_finger_{k}", f"{wid}_tip", [ln, th, th], "spar", rel=(0, 0, 0), offset=(s * ln / 2, 0, 0),
                 rot=MR((0, a, 0), s))
        card(f"{wid}_claw", f"{wid}_finger_0", claws(1, 3 if teen else 2), "claw", plane="yz",
             rel=(s * (math.hypot(*tips[0]) - 0.2), 0.2, 0), offset=(0, 0.6, 0), rot=(0, 0, 0))
        card(f"{wid}_thumb", f"{wid}_tip", claws(1, 2), "claw", rel=(0, 0.2, 0.6), offset=(0, 0.5, 0), plane="yz")

    # ---------------------------------------------------------------- tail
    if not teen:
        tails = [((0, 5.5, -4.5), [4, 3.5, 4.5], (-10, 6, 0)), ([3.5, 3, 4.5], (0, 8, 0)), ([3, 2.5, 4.5], (6, 10, 0)),
                 ([2.5, 2, 4], (8, 10, 0)), ([2, 1.5, 4], (6, 10, 0)), ([1.5, 1, 3.5], (4, 10, 0))]
        tspines = [(1.5, 1.0, 1.5), (1.5, 1.0, 1.5), (1.0, 1.0, 1.0), (1.0, 0.5, 1.0), (1.0, 0.5, 1.0)]
    else:
        tails = [((0, 15.5, -12.5), [6, 5, 8.5], (-16, 5, 0)), ([5, 4.5, 8.5], (-6, 7, 0)), ([4.5, 3.5, 8], (5, 8, 0)),
                 ([3.5, 3, 8], (7, 8, 0)), ([3, 2.5, 7], (6, 8, 0)), ([2, 2, 6.5], (6, 6, 0))]
        tspines = [(3.0, 1.5, 2.0), (2.5, 1.0, 2.0), (2.5, 1.0, 1.5), (2.0, 1.0, 1.5), (1.5, 1.0, 1.5), (1.0, 1.0, 1.0)]
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
            spine(f"{tid}_spine", tid, h, w=w, d=d, rel=(0, size[1] / 2 - 0.1, -size[2] / 2 + 0.5), tilt=-34)
            if teen and j < 3:
                spine(f"{tid}_spine_b", tid, h - 0.5, w=w, d=d, rel=(0, size[1] / 2 - 0.1, -size[2] + 2.0), tilt=-34)
        prev = tid
    last = tails[-1][-2]
    blade = tail_spade(10, 12) if teen else tail_spade(6, 7)
    card("tail_blade", prev, blade, "spike", plane="xz", rel=(0, 0, -last[2] + 0.8),
         offset=(0, 0, -len(blade) / 4 + 0.25))
    card("tail_blade_v", prev, blade, "spike", plane="yz", rel=(0, 0, -last[2] + 0.8),
         offset=(0, len(blade) / 4 - 0.25, 0), rot=(-90, 0, 0))

    # ---------------------------------------------------------------- legs
    feet = []
    if not teen:
        LEGS = {"f": ((2.6, 5.2, 2.6), (2.8, 1.0, 3.0), None, 2.5, 2.5, [2.5, 1, 3]),
                "b": ((3.2, 5.2, -2.8), (3.4, 1.0, -2.2), None, 3.0, 3.5, [3, 1, 3.5])}
    else:
        LEGS = {"f": ((4.2, 13.5, 6.5), (4.6, 7.5, 7.5), (4.6, 1.2, 6.6), 3.0, 3.5, [3.5, 1, 5]),
                "b": ((4.4, 13.5, -7.5), (4.8, 7.5, -4.6), (4.8, 1.2, -8.6), 4.0, 5.0, [3.5, 1, 5.5])}
    for kk, (hip, knee, ankle, th, dp, fsize) in LEGS.items():
        for s in (1, -1):
            n = LR(s)
            lid = f"leg_{kk}{n}"
            e = limb(R, lid, "body", M(hip, s), M(knee, s), th, "leg", depth=dp)
            parent = lid
            if ankle is not None:
                e = limb(R, f"shin_{kk}{n}", lid, e, M(ankle, s), th - 0.5, "leg", depth=th - 0.5)
                parent = f"shin_{kk}{n}"
                card(f"spur_{kk}{n}", parent, spikes(4, 4, 50 + s), "spike", plane="yz",
                     rel=(0, -0.3, -(th - 0.5) / 2 if kk == "f" else (th - 0.5) / 2), offset=(0, 0, 0),
                     rot=(150 if kk == "f" else 30, 0, 0))
            fid = f"foot_{kk}{n}"
            part(fid, parent, fsize, "foot", at=e, centre=(e[0], fsize[1] / 2, e[2] + fsize[2] / 2 - 1.0), wrot=(0, 0, 0))
            part(f"toes_{kk}{n}", fid, [fsize[0] - 0.5, 0.5 if not teen else 1.0, 1.5], "foot",
                 rel=(0, -fsize[1] / 2 + (0.25 if not teen else 0.5), fsize[2] / 2 + 0.25))
            card(f"claws_{kk}{n}", fid, claws(3, 2 if not teen else 3), "claw",
                 rel=(0, -fsize[1] / 2 + 0.25, fsize[2] / 2 + 1.0),
                 offset=(0, -0.5 if not teen else -0.75, 0), plane="xy", rot=(-50, 0, 0))
            feet += [fid, f"toes_{kk}{n}", f"claws_{kk}{n}"]

    # ---------------------------------------------------------------- teen: saddle and armour shells
    if teen:
        bone("saddle", "body", at=(0, 20.0, -1.5))
        part("saddle_blanket", "saddle", [10.5, 0.5, 11], "blanket", rel=(0, 0.25, 0))
        for s in (1, -1):
            card(f"saddle_fringe_{LR(s)}", "saddle_blanket", locks(22, 3, 40 + s, min_len=0.6), "fringe",
                 rel=(s * 5.3, -0.25, 0), offset=(0, -0.75, 0), plane="yz", rot=(0, 0, s * 4))
        part("saddle_seat", "saddle", [8, 1.5, 9], "saddle", rel=(0, 1.25, 0))
        part("saddle_cantle", "saddle_seat", [7, 3, 1.5], "saddle", rel=(0, 1.5, -4.2), rot=(14, 0, 0))
        part("saddle_pommel", "saddle_seat", [3, 2.5, 1.5], "saddle", rel=(0, 1.2, 4.0), rot=(-12, 0, 0))
        part("saddle_horn", "saddle_pommel", [1.5, 1.5, 1.5], "brass", rel=(0, 1.6, 0.2))
        for s in (1, -1):
            n = LR(s)
            part(f"saddle_flap_{n}", "saddle", [0.5, 5, 7], "saddle", rel=M((5.6, -2.4, 0), s), rot=(0, 0, s * -4))
            part(f"saddle_buckle_{n}", f"saddle_flap_{n}", [0.5, 1, 1], "brass", rel=M((0.3, -1.5, 2.0), s))
            card(f"stirrup_{n}", f"saddle_flap_{n}", ["s..", "s..", "s..", "s..", "BBB", "b.b", "bBb"], "stirrup",
                 rel=M((0.4, -2.5, -1.0), s), offset=(0, -1.75, 0), plane="yz")
        part("saddle_girth", "saddle", [11, 10, 1.5], "strap", rel=(0, -4.6, 1.5), hide=["top", "bottom"])

        hx = tuple(ho + (0, hh / 2 - 0.75, 0.0))
        for nm, par, size, rel in (
                ("armor_head", "head", [7, 2.5, 6.5], hx),
                ("armor_snout", "snout", [5.5, 1.5, 6.5], (0, 1.25, -0.75)),
                ("armor_neck", "neck", [6, 2.5, 8.5], (0, 1.75, 3.5)),
                ("armor_neck_1", "neck_1", [5.5, 2.5, 7.5], (0, 1.5, 3.0)),
                ("armor_chest", "body", [10.5, 8, 2], (0, 0.0, 11.5)),
                ("armor_flank_l", "body", [1, 7.5, 11], (5.75, 1.0, 4.0)),
                ("armor_flank_r", "body", [1, 7.5, 11], (-5.75, 1.0, 4.0))):
            part(nm, par, size, "armor", rel=rel)

    spec = {
        "name": "Dragonling Baby" if not teen else "Dragonling Teen",
        "description": ("The Winterworks baby Dragonling: a chubby young Ender Dragon with a big square head, huge "
                        "glowing violet eyes under heavy brows, a flat box snout with nostril bumps and milk fangs, "
                        "stubby grey horn plates, light grey spines from crown to tail tip, small membranous wings on "
                        "bony finger spars and a long curling tail."
                        if not teen else
                        "The Winterworks teen Dragonling: a lean, rideable young Ender Dragon: black scales, a long "
                        "flat box snout with nostril bumps and teeth over a separate jaw, swept-back horn plates, "
                        "glowing violet eyes, light grey spines from crown to tail tip, big membranous wings on bony "
                        "finger spars folded at rest, a long spined tail, a saddle the renderer can hide, and "
                        "transparent armour shells that the armour textures paint.")
        + " Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 2400 if teen else 1500, "colors": 128},
        "light": LIGHT,
        "brush": BRUSH,
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
    tone = {"iron": 5.6, "gold": 6.2, "diamond": 5.8}[metal]
    layers = [{"id": "sky", "op": "gradient", "axis": "y", "amount": -1.0},
              {"id": "temper", "op": "noise", "scale": 2.0, "amount": 0.35},
              {"id": "groove", "op": "panel", "inset": 2, "shift": -1.8, "highlight": 1.8, "shadow": -1.8,
               "min_size": 6},
              {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.8,
               "shift": 2.6}]
    if metal == "diamond":
        layers.insert(2, {"id": "facets", "op": "patches", "scale": 1.4, "threshold": 0.5, "shift": 1.6,
                          "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.6, "highlight_shift": 1.8}})
    else:
        layers.append({"id": "rivets", "op": "rivets", "inset": 1, "spacing": 5, "highlight": 2.6, "shadow": -2.6,
                       "min_size": 5})
        layers.append({"id": "chips", "op": "wear", "width": 1, "density": 0.12, "shift": -2.4})
    return {"ramp": metal, "tone": tone, "light": 0.9, "dither": 0.0,
            "rim": {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -2.0, "outline": "dark"},
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
