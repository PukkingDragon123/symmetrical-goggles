"""Builds examples/dragonling_baby.json, examples/dragonling_teen.json and the teen's armour texture variants
examples/variants/dragonling_teen_armor_{iron,gold,diamond}.json (Winterworks, The Living End).

    python examples/src/dragonling.py

Dragonlings are young ender-dragons: black-violet scales with pale violet belly plates, purple wing membranes on dark
finger bones, glowing purple eyes, pale horns and claws, back spines and a spade at the tail's end.

* **Baby** (about 13 x 14 x 22 px): chubby and round, a big head with huge glowing eyes and stubby horns, a short
  neck, small half-open wings, stubby legs, a short tail curled to one side.
* **Teen** (about 30 x 30 x 70 px, wings folded): lean and rideable: a long two-part neck, a long head with swept-back
  horns, big wings (arm and hand, with a `_tip` joint at the wrist) folded along the flanks at rest, long legs, a long
  four-part tail with a blade, spines from crown to tail, and a `saddle` (a seat with pommel and cantle, a fringed
  blanket, side flaps with stirrups and a girth) that the renderer shows or hides. Armour shells (a helm, neck plates,
  a chest plate, flank plates: `armor_*`) are transparent in the plain texture; each armour variant paints them as
  iron, gold or diamond plate over the same UVs, so the renderer only swaps the texture.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the models export 1:1
to vanilla entity models (python -m lowpix mc export). Faces +Z, ground at y = 0, "left" is +X; the root (body)
pivots in the middle of the torso.

Contract (mods/winterworks/docs/END_UPDATE.md section 13): bones body, neck, head, jaw, wing_l, wing_r, wing_l_tip,
wing_r_tip, tail_0..tail_3, leg_fl, leg_fr, leg_bl, leg_br, and on the teen saddle. Extra joints: neck_1 (teen),
shin_* and foot_* (legs), eye_l/r. Clips: idle, walk, fly, glide, eat (0.8 s), breath (1.0 s), sit; the baby also
hatch (1.5 s). Glow: the eyes (ramp eyeglow).
"""
import copy
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (DENSITY, LR, M, MR, ROOT, Rig, abs_track, add, claws, dump, ground_lock, keys,  # noqa: E402
                     limb, locks, membrane, mirror_art, osc, pos, r, ramps, rest_on_ground, ring, sc, shake, spikes,
                     timeline, toward, wave)

# ======================================================================= palette and paint (shared)
RAMPS = ramps(
    "eyeglow",
    # black-violet scales, cool violet lights
    scale=["#07050c", "#0e0a17", "#161022", "#1f162e", "#291d3b", "#342549", "#402e58", "#4e3868", "#5e4479",
           "#70538b"],
    # pale violet belly plates
    belly=["#1c1526", "#2b2139", "#3c2e4d", "#4f3d62", "#634e77", "#78618c", "#8e76a1", "#a68ebb", "#bfa9d2"],
    # purple wing membrane
    membrane=["#1d0b2e", "#2e1247", "#421a61", "#58247c", "#702f97", "#8a3eb2", "#a656c9", "#c27ade", "#dba3ee"],
    # pale horn and claw
    horn=["#221d29", "#38313f", "#514858", "#6c6273", "#897e8f", "#a79cab", "#c4bac7", "#e0d8e2", "#f6f1f7"],
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
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.7, "gradient": 0.5, "ao": 0.6, "ao_height": 6.0}
BRUSH = {"flow": "long", "length": 1.6, "width": 0.6, "rough": 0.55, "overshoot": 0.25,
         "textures": {"scale": "scales", "belly": "leather", "horn": "wood", "leather": "leather", "iron": "metal",
                      "gold": "metal", "diamond": "crystal", "cloth": "cloth"}}

RIM = {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.2}
SCALES = {"id": "scales", "op": "scales", "shape": "round", "along": "z", "size": [1.5, 1.0], "gap": 0.5,
          "highlight": 1.1, "shadow": -1.0, "jitter": 0.4, "faces": ["top", "sides"]}
SHEEN = {"id": "sheen", "op": "spots", "count": 3, "radius": [0.6, 1.0], "stretch": [1, 0.5, 2], "shift": 1.2,
         "faces": ["top"], "roughness": 0.5}
BELLY_BAND = {"id": "belly", "op": "band", "axis": "y", "from": -1.01, "to": -0.55, "ramp": "belly", "tone": 5.0,
              "wobble": 0.15, "faces": ["sides", "front", "back", "bottom"],
              "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.2}}
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.5,
         "shift": 1.8}
INVISIBLE = [{"faces": ["all"], "at": "top-left", "art": ["_" * 64] * 64}]

STYLES = {
    "scale": {"ramp": "scale", "tone": 4.4, "rim": RIM,
              "layers": [SCALES, SHEEN, {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.6}, GLOSS]},
    "scale_body": {"ramp": "scale", "tone": 4.6, "rim": RIM,
                   "layers": [SCALES, SHEEN, BELLY_BAND, GLOSS]},
    "belly": {"ramp": "belly", "tone": 5.0, "rim": RIM, "brush": {"flow": "x"},
              "layers": [{"id": "plates", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.25, "shift": -1.4,
                          "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.0}}]},
    "chest": {"ramp": "belly", "tone": 5.2, "rim": RIM, "brush": {"flow": "x"},
              "layers": [{"id": "plates", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.25, "shift": -1.4,
                          "faces": ["front", "bottom"]},
                         {"id": "scaled_sides", "op": "fill", "ramp": "scale", "tone": 4.4, "faces": ["top", "flanks"]},
                         dict(SCALES, faces=["top", "flanks"])]},
    "head": {"ramp": "scale", "tone": 4.8, "rim": dict(RIM, light_shift=2.0),
             "layers": [dict(SCALES, size=[1.0, 1.0]), SHEEN, GLOSS,
                        {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.6, "ramp": "belly",
                         "tone": 4.6, "faces": ["sides", "front"]}]},
    "snout": {"ramp": "scale", "tone": 4.6, "rim": dict(RIM, light_shift=2.0), "brush": {"flow": "z"},
              "layers": [dict(SCALES, size=[1.0, 1.0]), GLOSS,
                         {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.45, "ramp": "belly",
                          "tone": 4.6, "faces": ["sides", "front"]}],
              "stamps": [{"face": "front", "at": "top", "offset": [0, 1], "art": ["n..n", "N..N"],
                          "key": {"n": "scale:1", "N": "scale:0"}}]},
    "jaw": {"ramp": "belly", "tone": 4.6, "rim": RIM, "brush": {"flow": "z"},
            "layers": [{"id": "mouth", "op": "fill", "ramp": "membrane", "tone": 1.6, "faces": ["top"]},
                       {"id": "tongue", "op": "band", "axis": "x", "from": -0.35, "to": 0.35, "ramp": "membrane",
                        "tone": 3.6, "faces": ["top"]},
                       {"id": "scaled", "op": "band", "axis": "y", "from": 0.0, "to": 1.01, "ramp": "scale",
                        "tone": 4.2, "faces": ["sides"]}]},
    # glowing purple eyes: a big round iris, a dark pupil, a big catchlight
    "eye": {"ramp": "eyeglow", "tone": 3.2, "light": 0.3, "brush": {"off": True},
            "rim": {"light": 1, "dark": 0, "light_shift": 1.0},
            "layers": [{"id": "lower", "op": "gradient", "axis": "y", "amount": -1.2}]},
    "horn": {"ramp": "horn", "tone": 5.4, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
             "brush": {"flow": "long"},
             "layers": [{"id": "rings", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.3, "shift": -1.0},
                        {"id": "root", "op": "gradient", "axis": "z", "amount": 1.6}]},
    "spine": {"ramp": "horn", "tone": 4, "light": 0.2, "brush": {"off": True},
              "art_key": {"t": "horn:7", "m": "horn:5", "f": "scale:5"}},
    "frill": {"ramp": "membrane", "tone": 4, "light": 0.2, "brush": {"off": True},
              "art_key": {"t": "membrane:6", "m": "membrane:4", "f": "membrane:2"}},
    "claw": {"ramp": "horn", "tone": 5, "light": 0, "brush": {"off": True},
             "art_key": {"c": "horn:5", "t": "horn:7"}},
    "arm": {"ramp": "scale", "tone": 4.0, "rim": RIM, "brush": {"flow": "long"},
            "layers": [{"id": "knuckles", "op": "stripes", "axis": "x", "period": 3.0, "width": 0.15, "shift": 1.4}]},
    "leg": {"ramp": "scale", "tone": 4.2, "rim": RIM, "brush": {"flow": "y"},
            "layers": [dict(SCALES, along="y", size=[1.0, 1.0]), SHEEN,
                       {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.8}]},
    "foot": {"ramp": "scale", "tone": 3.6, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "sole", "op": "fill", "ramp": "belly", "tone": 3.0, "faces": ["bottom"]},
                        {"id": "toes", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3, "shift": -1.2,
                         "faces": ["top", "front"]}]},
    "tail": {"ramp": "scale", "tone": 4.4, "rim": RIM, "brush": {"flow": "z"},
             "layers": [SCALES, SHEEN, BELLY_BAND, GLOSS]},
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
    """Purple membrane, darker toward the body, lighter toward the trailing edge; dark finger bones."""
    g = 1.0 if s > 0 else -1.0
    return {"ramp": "membrane", "tone": 4.4, "light": 0.25, "brush": {"flow": "x", "length": 1.6, "rough": 0.4},
            "layers": [{"id": "out_light", "op": "gradient", "axis": "x", "amount": -0.8 * g},
                       {"id": "trail_light", "op": "gradient", "axis": "z", "amount": 1.2},
                       {"id": "mottle", "op": "noise", "scale": 1.5, "amount": 0.5}],
            "art_key": {"b": "scale:3", "B": "scale:6", "r": "membrane:6", "v": "membrane:3", "c": "horn:6"}}


STYLES["wing_l"] = wing_style(1)
STYLES["wing_r"] = wing_style(-1)


def eye_stamp(w, h):
    """A big round glowing iris with a dark pupil low-centre and a large catchlight, w x h texels."""
    rows = []
    for y in range(h):
        row = ""
        for x in range(w):
            u, v = (x + 0.5) / w, (y + 0.5) / h
            if (u - 0.5) ** 2 / 0.25 + (v - 0.55) ** 2 / 0.16 <= 1.0 and 0.3 < u < 0.7 and v > 0.35:
                row += "p"
            else:
                row += "."
        rows.append(row)
    rows[0] = "." + "W" * min(2, w - 2) + "." * (w - 3)
    rows[1] = "W" + "w" + rows[1][2:]
    return rows


# ======================================================================= builder
def build(kind):
    """kind: 'baby' or 'teen'. Returns (spec, rig, feet)."""
    teen = kind == "teen"
    R = Rig(density=DENSITY, bone_style="scale")
    part, bone, card = R.part, R.bone, R.card
    styles = copy.deepcopy(STYLES)

    # ---------------------------------------------------------------- torso
    if not teen:
        part("body", None, [7, 5.5, 8], "scale_body", at=(0, 5.5, 0), centre=(0, 5.5, -0.5))
        part("belly", "body", [6, 1.5, 7], "belly", centre=(0, 3.0, -0.3))
        part("chest", "body", [6, 5, 2.5], "chest", centre=(0, 5.6, 3.6))
        part("haunches", "body", [7.5, 4, 4], "scale_body", centre=(0, 5.0, -2.6))
        card("back_spines", "body", spikes(14, 3, 3), "spine", at=(0, 8.25, -0.5), offset=(0, 0.75, 0), plane="yz")
        neck_at, neck_size, neck_rot = (0, 7.0, 3.2), [3.5, 3.5, 3], -38
    else:
        part("body", None, [10, 9, 12], "scale_body", at=(0, 15.0, 0), centre=(0, 15.5, 4.0))
        part("hips", "body", [9, 8, 12], "scale_body", centre=(0, 15.2, -7.0))
        part("belly", "body", [8.5, 2, 20], "belly", centre=(0, 11.2, -1.5))
        part("chest", "body", [9, 7, 2], "chest", centre=(0, 14.5, 10.6))
        part("withers", "body", [6, 1.5, 9], "scale", centre=(0, 20.6, 4.5))
        card("back_spines", "body", spikes(40, 5, 3), "spine", at=(0, 20.0, -4.0), offset=(0, 1.25, 0), plane="yz")
        neck_at, neck_size, neck_rot = (0, 17.5, 9.5), [5, 5, 8], -50

    # ---------------------------------------------------------------- neck and head
    part("neck", "body", neck_size, "scale", at=neck_at, offset=(0, 0, neck_size[2] / 2 - 0.5), wrot=(neck_rot, 0, 0))
    card("neck_spines", "neck", spikes(int(neck_size[2] * 2), 3 if not teen else 4, 5), "spine",
         rel=(0, neck_size[1] / 2, neck_size[2] / 2 - 0.5), offset=(0, 0.75 if not teen else 1.0, 0), plane="yz")
    if teen:
        part("neck_1", "neck", [4.5, 4.5, 7], "scale", rel=(0, 0, 7.0), offset=(0, 0, 3.0), rot=(22, 0, 0))
        card("neck_1_spines", "neck_1", spikes(14, 4, 6), "spine", rel=(0, 2.25, 3.0), offset=(0, 1.0, 0),
             plane="yz")
        head_parent, head_rel, head_rot = "neck_1", (0, 0, 6.5), (30, 0, 0)
    else:
        head_parent, head_rel, head_rot = "neck", (0, 0.2, 2.6), (32, 0, 0)
    part("head", head_parent, [6.5, 5.5, 5.5] if not teen else [6, 5, 7], "head", rel=head_rel,
         offset=(0, 1.6, 1.6) if not teen else (0, 1.2, 2.5), rot=head_rot)
    hw, hh, hd = (6.5, 5.5, 5.5) if not teen else (6, 5, 7)
    ho = np.array((0, 1.6, 1.6) if not teen else (0, 1.2, 2.5))      # head box centre in the head frame
    if not teen:
        part("cheeks", "head", [7, 3, 3.5], "head", rel=tuple(ho + (0, -1.1, -0.6)))
        part("snout", "head", [4, 2.5, 3], "snout", rel=tuple(ho + (0, -1.2, hd / 2 + 1.3)))
        part("jaw", "head", [3.5, 1, 3.5], "jaw", rel=tuple(ho + (0, -2.4, hd / 2 - 1.0)), offset=(0, -0.3, 1.9))
        eye_size, eye_pos = [2, 2.5, 0.5], (2.0, 0.4, hd / 2 + 0.2)
        horns = [((1.6, hh / 2 - 0.2, -1.0), [1, 2, 1], (-40, 0, -10)), ((2.9, hh / 2 - 0.8, -1.4), [0.5, 1.5, 0.5],
                                                                        (-30, 0, -36))]
    else:
        part("snout", "head", [5, 3.5, 6.5], "snout", rel=tuple(ho + (0, -0.6, hd / 2 + 3.0)), rot=(4, 0, 0))
        part("brow", "head", [6.5, 1, 2.5], "head", rel=tuple(ho + (0, hh / 2 - 0.2, hd / 2 - 1.4)), rot=(-12, 0, 0))
        part("jaw", "head", [4.5, 1.5, 9], "jaw", rel=tuple(ho + (0, -hh / 2 + 0.2, -hd / 2 + 1.0)),
             offset=(0, -0.6, 4.6), rot=(3, 0, 0))
        card("teeth", "head", locks(16, 2, 7, tip="t", mid="t", body="t"), "claw",
             rel=tuple(ho + (0, -hh / 2 - 0.4, hd / 2 + 5.6)), offset=(0, -0.4, 0), plane="xy")
        eye_size, eye_pos = [0.5, 1.5, 2], (hw / 2 + 0.05, 0.4, hd / 2 - 1.6)
        horns = [((1.8, hh / 2 - 0.4, -hd / 2 + 1.2), [1.5, 1.5, 5], (30, 0, -8)),
                 ((3.0, 0.2, -hd / 2 + 1.0), [1, 1, 3], (14, 0, -40))]
    for s in (1, -1):
        n = LR(s)
        part(f"eye_{n}", "head", eye_size, "eye", rel=tuple(ho + M(eye_pos, s)),
             paint={"stamps": [{"face": "front" if not teen else ("left" if s > 0 else "right"), "at": "top-left",
                                "art": eye_stamp(int(eye_size[0] * 2) if not teen else int(eye_size[2] * 2),
                                                 int(eye_size[1] * 2)),
                                "key": {"p": "scale:0", "W": "eyeglow:6", "w": "eyeglow:5"}}]})
        for j, (hp, hs, hr) in enumerate(horns):
            hid = f"horn_{n}{j}"
            part(hid, "head", hs, "horn", rel=tuple(ho + M(hp, s)), offset=(0, hs[1] / 2 - 0.3, 0)
                 if not teen else (0, 0, -hs[2] / 2 + 0.4), rot=MR(hr, s))
            if teen and j == 0:
                part(f"horn_{n}0_tip", hid, [1, 1, 4], "horn", rel=(0, 0, -hs[2] + 0.6), offset=(0, 0, -1.8),
                     rot=(14, 0, 0))
        card(f"frill_{n}", "head", spikes(6 if not teen else 10, 3, 8 + s), "frill",
             rel=tuple(ho + M((hw / 2 + 0.05, -0.6, -hd / 2 + 1.2), s)), offset=(0, 0.6, -0.4), plane="yz",
             rot=(-30, 0, s * 18))

    # ---------------------------------------------------------------- wings
    if not teen:
        sh, arm_len, tip_len, arm_t = (3.2, 7.8, 1.2), 4.5, 4.0, 1.0
        inner_art, hand_art = (9, 10), (12, 11)
        rest_arm, rest_tip = (-20, 40, 40), (0, -20, -30)
    else:
        sh, arm_len, tip_len, arm_t = (4.5, 19.5, 6.0), 12.0, 12.0, 1.5
        inner_art, hand_art = (24, 22), (24, 24)
        rest_arm, rest_tip = (-90, 75, 15), (0, 6, 172)
    for s in (1, -1):
        n = LR(s)
        wid = f"wing_{n}"
        bone(wid, "body", at=M(sh, s), rot=MR(rest_arm, s))
        part(f"{wid}_arm", wid, [arm_len, arm_t, arm_t], "arm", rel=(0, 0, 0), offset=(s * arm_len / 2, 0, 0))
        art = membrane(*inner_art, seed=11, hand=False)
        card(f"{wid}_m", wid, art if s > 0 else mirror_art(art), f"wing_{n}", plane="xz",
             rel=(s * inner_art[0] / 4, -0.1, -inner_art[1] / 4 - arm_t / 2 + 0.25))
        bone(f"{wid}_tip", wid, rel=(s * arm_len, 0, 0), rot=MR(rest_tip, s))
        part(f"{wid}_hand", f"{wid}_tip", [tip_len, 1.0 if teen else 0.5, 1.0 if teen else 0.5],
             "arm", rel=(0, 0, 0), offset=(s * tip_len / 2, 0, 0))
        art = membrane(*hand_art, seed=12, hand=True, fingers=3 if teen else 2)
        card(f"{wid}_tip_m", f"{wid}_tip", art if s > 0 else mirror_art(art), f"wing_{n}", plane="xz",
             rel=(s * hand_art[0] / 4, -0.12, -hand_art[1] / 4 + 0.25))
        card(f"{wid}_thumb", f"{wid}_tip", claws(1, 2), "claw", rel=(0, 0.2, 0.6), offset=(0, 0.5, 0), plane="yz")

    # ---------------------------------------------------------------- tail
    if not teen:
        tails = [((0, 5.0, -4.3), [4, 3.5, 4], (-14, 10, 0)), ([3, 3, 4], (-6, 18, 0)), ([2.5, 2, 3.5], (8, 22, 0)),
                 ([1.5, 1.5, 3.5], (12, 24, 0))]
    else:
        tails = [((0, 15.5, -12.5), [6, 5, 9], (-16, 6, 0)), ([5, 4, 9], (-6, 10, 0)), ([4, 3, 9], (6, 12, 0)),
                 ([3, 2, 9], (8, 12, 0))]
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
        if j < 3:
            card(f"{tid}_spines", tid, spikes(int(size[2] * 2), 3 if not teen else 4, 20 + j), "spine",
                 rel=(0, size[1] / 2, -size[2] / 2 + 0.5), offset=(0, 0.75 if not teen else 1.0, 0), plane="yz")
        prev = tid
    last = tails[-1][-2]
    BLADE = ["...tt...", "..tmmt..", ".tmffmt.", "tmffffmt", ".tmffmt.", "..tmmt..", "...tm..."] if teen else \
        ["..t..", ".tmt.", "tmfmt", ".tmt.", "..t.."]
    card("tail_blade", "tail_3", BLADE, "frill", plane="xz", rel=(0, 0, -last[2] + 0.6),
         offset=(0, 0, -len(BLADE) / 4 + 0.25))

    # ---------------------------------------------------------------- legs
    feet = []
    if not teen:
        LEGS = {"f": ((2.6, 4.8, 2.4), (2.7, 1.0, 2.7), None, 2.0, 2.0, [2.5, 1, 3]),
                "b": ((3.0, 5.0, -2.4), (3.0, 1.0, -2.0), None, 3.0, 3.5, [2.5, 1, 3.5])}
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
            fid = f"foot_{kk}{n}"
            part(fid, parent, fsize, "foot", at=e, centre=(e[0], fsize[1] / 2, e[2] + fsize[2] / 2 - 1.0), wrot=(0, 0, 0))
            card(f"claws_{kk}{n}", fid, claws(3, 2 if not teen else 3), "claw", rel=(0, -fsize[1] / 2 + 0.25,
                                                                                    fsize[2] - 0.75),
                 offset=(0, -0.5 if not teen else -0.75, 0), plane="xy", rot=(-50, 0, 0))
            feet += [fid, f"claws_{kk}{n}"]

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
            part(f"saddle_flap_{n}", "saddle", [0.5, 5, 7], "saddle", rel=M((5.35, -2.4, 0), s), rot=(0, 0, s * -4))
            part(f"saddle_buckle_{n}", f"saddle_flap_{n}", [0.5, 1, 1], "brass", rel=M((0.3, -1.5, 2.0), s))
            card(f"stirrup_{n}", f"saddle_flap_{n}", ["s..", "s..", "s..", "s..", "BBB", "b.b", "bBb"], "stirrup",
                 rel=M((0.4, -2.5, -1.0), s), offset=(0, -1.75, 0), plane="yz")
        part("saddle_girth", "saddle", [10.5, 10, 1.5], "strap", rel=(0, -4.6, 1.5), hide=["top", "bottom"])

        for nm, par, size, rel, rot in (
                ("armor_head", "head", [6.5, 2.5, 7.5], tuple(ho + (0, 1.5, 0.1)), (0, 0, 0)),
                ("armor_snout", "snout", [5.5, 1.5, 6.5], (0, 1.3, 0.1), (0, 0, 0)),
                ("armor_neck", "neck", [5.5, 2.5, 8.5], (0, 1.6, 3.5), (0, 0, 0)),
                ("armor_neck_1", "neck_1", [5.0, 2.5, 7.5], (0, 1.5, 3.0), (0, 0, 0)),
                ("armor_chest", "body", [10.5, 8, 2], (0, 0.0, 10.9), (0, 0, 0)),
                ("armor_flank_l", "body", [1, 7.5, 11], (5.3, 1.0, 4.0), (0, 0, 0)),
                ("armor_flank_r", "body", [1, 7.5, 11], (-5.3, 1.0, 4.0), (0, 0, 0))):
            part(nm, par, size, "armor", rel=rel, rot=rot)

    spec = {
        "name": "Dragonling Baby" if not teen else "Dragonling Teen",
        "description": ("The Winterworks baby Dragonling: a chubby baby ender-dragon with a big head, huge glowing "
                        "purple eyes, stubby horns, small purple wings and a short curled tail."
                        if not teen else
                        "The Winterworks teen Dragonling: a lean, rideable young ender-dragon with a long neck and "
                        "tail, swept-back horns, big folded wings with wrist joints, back spines, a saddle the "
                        "renderer can hide, and transparent armour shells that the armour textures paint.")
        + " Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 1400 if teen else 900, "colors": 128},
        "light": LIGHT,
        "brush": BRUSH,
        "minecraft": {"fps": 24, "glow_ramps": ["eyeglow"]},
        "anim_ground_tolerance": 0.3,
        "render": {"background": "#d8d3a2", "hero": [36, 20], "shadow": 0.5},
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


TAIL = ["tail_0", "tail_1", "tail_2", "tail_3"]


def animate(spec, R, teen):
    A = {}
    REST = {}
    ws = 1.0 if teen else 0.8          # the baby's motions are a touch smaller and bouncier
    neck = ["neck", "neck_1", "head"] if teen else ["neck", "head"]
    FOLD_SPREAD = (0, 0, 0)             # wings fully spread (absolute)

    def blink(t):
        kk = [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + 0.05, [0, -0.85, 0]], [t + 0.09, [0, -0.85, 0]], [t + 0.14, [0, 0, 0]]]
        return [keys("eye_l", None, kk, ch="scale"), keys("eye_r", None, kk, ch="scale")]

    # idle: breathing, looking about, a blink, the tail tip swaying, wings resettling
    L = 3.0
    A["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
        osc("body", None, [0.03, 0.04, 0.02], 2, 0.0, ch="scale"),
        osc("neck", "x", -3, 2, 0.1), osc("head", "y", 14, 1, 0.2), osc("head", "z", 5, 1, 0.45),
        keys("jaw", "x", [[0, 0], [1.6, 0], [1.75, 10, "out"], [1.9, 4], [2.05, 10], [2.25, 0], [3.0, 0]]),
        wave(TAIL, "y", 8 * ws, 1, lag=0.12, growth=1.25), wave(TAIL, "x", -2, 2, lag=0.1),
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
                            wave(TAIL, "y", 10 * ws, 1, lag=0.14, growth=1.2, phase=0.1),
                            osc("wing_l", "z", 4, 2, 0.2), osc("wing_r", "z", -4, 2, 0.2)],
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
                           wave(TAIL, "y", 6, 1, lag=0.14, growth=1.2), wave(TAIL, "x", 4, 2, lag=0.12)])
    A["fly"]["grounded"] = False

    # glide: wings held out wide, banking gently, the hands flexing, the tail rudder swinging
    L = 2.0
    A["glide"] = timeline(L, [(0.0, FLY, None), (L, FLY, None)], loop=True, lock=False,
                          extra=flap_tracks(R, L, 1, 4, sweep=3, bias=6, tip_amp=6, tip_bias=-4)
                          + [osc("body", "z", 8, 1, 0.0), osc("body", None, [0, 0.6, 0], 1, 0.25, ch="position"),
                             osc("head", "z", -6, 1, 0.05), wave(TAIL, "y", -8, 1, lag=0.15, growth=1.2)])
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
    INHALE = add(r("body", -8), r("neck", -24), r("head", -12), sc("body", 0.08, 0.1, 0.04),
                 *[r(f"wing_{n}", 0, 0, s * 12) for s, n in ((1, "l"), (-1, "r"))])
    BLAST = add(r("body", 4), r("neck", 22 if teen else 14), r("head", -22 if teen else -10), r("jaw", 38),
                sc("body", -0.04, -0.04, 0),
                *[r(f"wing_{n}", 0, 0, -s * 8) for s, n in ((1, "l"), (-1, "r"))], r("tail_0", -10))
    A["breath"] = timeline(1.0, [(0.0, REST, None), (0.28, INHALE, "out"), (0.38, BLAST, "out_back"),
                                 (0.8, add(BLAST, r("neck", 4)), "ease"), (1.0, REST, "ease")],
                           extra=[shake("head", 0.4, 0.8, 2.5, freq=14, axis=1),
                                  shake("jaw", 0.4, 0.8, 4, freq=12, axis=0),
                                  ring("tail_3", 0.38, 14, freq=5, decay=4, axis=1, end=1.0)])

    # sit: down on its haunches, front legs straight, chest up, the tail curled round, looking about
    SIT = add(r("body", -18 if teen else -14), legs_x((18, -10, 4), (18, -10, 4), (-70, 100, -20), (-70, 100, -20), teen),
              r("neck", -6), r("head", 16), r("tail_0", 18, 10), r("tail_1", 0, 26), r("tail_2", 0, 30),
              r("tail_3", 0, 30))
    if not teen:
        SIT = add(SIT, r("leg_bl", 20), r("leg_br", 20))
    L = 3.0
    A["sit"] = timeline(L, [(0.0, SIT, None), (L, SIT, None)], loop=True, extra=[
        osc("body", None, [0.03, 0.04, 0.02], 2, 0.0, ch="scale"),
        osc("head", "y", 12, 1, 0.0), osc("head", "z", 6, 1, 0.3), osc("neck", "x", -3, 2, 0.2),
        wave(["tail_2", "tail_3"], "y", 8, 1, lag=0.15, growth=1.3),
    ] + blink(1.6))

    if not teen:
        # hatch: curled up tight in a ball, a wriggle, then it bursts open: stretches up, wings flared, a squeak with
        # the jaw open, shakes off the shell bits and settles
        CURL = add(r("body", 20), sc("body", -0.12, -0.12, -0.12), r("neck", 50), r("head", 40),
                   wings_abs(R, (0, 80, -10), (0, -120, 0)),
                   legs_x((60, 0, 40), (60, 0, 40), (-40, 0, -20), (-40, 0, -20), False),
                   r("tail_0", 30, 40), r("tail_1", 0, 50), r("tail_2", 0, 50), r("tail_3", 0, 50))
        STRETCH = add(r("body", -14), sc("body", -0.04, 0.1, -0.04), r("neck", -18), r("head", -12), r("jaw", 34),
                      r("tail_0", 22), r("tail_1", 6),
                      wings_abs(R, (0, -10, 50), (0, 20, 30)), legs_x((-10, 0, 0), (-10, 0, 0), (10, 0, 0), (10, 0, 0),
                                                                   False))
        A["hatch"] = timeline(1.5, lift=[[0, 3.4], [0.42, 3.4], [0.56, 2.0], [0.72, 0, "out"], [1.5, 0]], keys=[(0.0, CURL, None), (0.3, add(CURL, r("body", -4)), "ease"),
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
GEM_KEY = {"a": "membrane:8", "b": "membrane:6", "B": "membrane:7", "c": "membrane:3"}


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
