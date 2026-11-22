"""Builds examples/obsidian_shield.json: the Obsidian Shield (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/obsidian_shield.py examples/obsidian_shield.json

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/obsidian_shield.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/obsidian_shield

A vanilla-proportioned shield (12 x 22 px) painted like the vanilla blocks it is made of: a slab of obsidian fitted
from four plates, the seams between them glowing like crying obsidian, in an iron frame with riveted corner caps, a
crest on top and a foot below. In the middle an Obolisk-eye boss: a gold-ringed block of obsidian with the Obolisk's
flat glowing eye painted on its face (a violet slit, a bright 2 x 2 pupil that glances about, an obsidian lid that
drops to blink). On the back, iron straps across the obsidian and a leather-wrapped grip.

Laid out exactly like the vanilla ShieldModel in Minecraft model space (plate addBox(-6, -11, -2, 12, 22, 1), handle
from z -1 to 5 behind it), so the vanilla shield's item display transforms and its BEWLR set-up
(pose.scale(1, -1, -1)) draw it as-is: the root sits at lowpix (0, 24, 0) = Minecraft (0, 0, 0), the plate's front
faces +Z (Minecraft -Z), the frame and boss stand out up to 2 px in front of it. Units are Minecraft pixels,
density 1 (one texel per pixel, like vanilla), every box whole pixels.

Contract (mods/winterworks/docs/END_UPDATE.md section 9). Bones: shield (root: plate, frame, boss), handle (the grip
behind it), eye (the eye on the boss: eye_ball, the glowing slit; eye_iris, a card with the bright pupil, which
glances about; eye_lid, the lid card, whose pivot is its top edge so scaling it in y blinks; all three are flat cards
a hair in front of the boss). Glow: the eye and every crying-obsidian texel (the seams). Clip: idle (4 s loop: the
eye glances about and blinks). Its eye is cards: draw the shield with a cutout render type (entityCutoutNoCull), not
the vanilla shield's entitySolid.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import EPS, LIGHT, ROOT, Rig, card_style, dump, keys, obsidian, ramps, skin  # noqa: E402

R = Rig(density=1, bone_style="iron")
part, bone, card = R.part, R.bone, R.card

C = 24.0                      # the plate's centre height (Minecraft y = 0)
bone("shield", None, at=(0, C, 0))
# the plate itself (vanilla: 12 x 22 x 1 at Minecraft z -2..-1): fitted obsidian, crying seams, an iron edge
part("plate", "shield", [12, 22, 1], "plate", centre=(0, C, 1.5))

# ======================================================================= the iron frame with riveted corner caps
for s, n in ((1, "l"), (-1, "r")):
    part(f"rim_{n}", "shield", [1, 20, 1], "rim", centre=(s * 5.5, C, 2.5))
for n, y in (("top", 34.5), ("bot", 13.5)):
    part(f"rim_{n}", "shield", [10, 1, 1], "rim", centre=(0, y, 2.5))
for k, (x, y) in enumerate([(5, 34), (-5, 34), (-5, 14), (5, 14)]):
    part(f"cap_{k}", "shield", [2, 2, 2], "rim_cap", centre=(x, y, 2.5))
# a crest on top and a foot below, so the outline is not a bare rectangle
part("crest", "shield", [4, 1, 1], "rim", centre=(0, 35.5, 1.5))
part("crest_tip", "crest", [2, 1, 1], "rim_cap", centre=(0, 36.5, 1.5))
part("foot", "shield", [4, 1, 1], "rim", centre=(0, 12.5, 1.5))

# ======================================================================= the Obolisk-eye boss
part("boss_ring", "shield", [8, 8, 1], "gold_ring", centre=(0, C, 2.5))
part("boss", "shield", [6, 6, 1], "boss", centre=(0, C, 3.5))
# the flat eye on the boss's face: three cards a hair apart (slit, pupil, lid)
bone("eye", "shield", at=(0, C, 4.0))
card("eye_ball", "eye", ["abba", "abba"], "eye_slit", rel=(0, 0, EPS))
card("eye_iris", "eye", ["Ww", "wW"], "eye_pupil", rel=(0, 0, 2 * EPS))
card("eye_lid", "eye", ["LLLLLL"], "eye_lid", rel=(0, 2.0, 3 * EPS), offset=(0, -0.5, 0))

# ======================================================================= the back: grip and brackets
bone("handle", "shield", at=(0, C, -1.5))
part("grip", "handle", [2, 6, 2], "grip", centre=(0, C, -4))
for n, y in (("top", 27.5), ("bot", 20.5)):
    part(f"bracket_{n}", "handle", [2, 1, 4], "bracket", centre=(0, y, -1))

# ======================================================================= palette and paint
RAMPS = ramps("obsidian", "crying", "eyeglow", "iron", "gold", "leather")
# the plate's front: four fitted obsidian plates (the seams glow), an iron edge round it
SEAMS = ["iiiiiiiiiiii",
         "i..........i",
         "i..........i",
         "i..........i",
         "i..........i",
         "issssssssssi",
         "i....s.....i",
         "i....s.....i",
         "i....s.....i",
         "i....s.....i",
         "i....S.....i",
         "i....s.....i",
         "i....s.....i",
         "i....s.....i",
         "i....s.....i",
         "i....s.....i",
         "isssssSssssi",
         "i..........i",
         "i..........i",
         "i..........i",
         "i..........i",
         "iiiiiiiiiiii"]
styles = {
    "plate": obsidian(3.4, tears=0.2, layers=[
        {"id": "straps", "op": "stripes", "axis": "y", "period": 7.0, "width": 0.15, "phase": 2.0, "ramp": "iron",
         "tone": 4.0, "faces": ["back"], "bevel": {"shadow": 1, "highlight": 1}}],
        stamps=[{"face": "front", "at": "top-left", "art": SEAMS,
                 "key": {"i": "iron:3", "s": "crying:1", "S": "crying:4"}}]),
    "rim": skin("iron", 3.6, grain=0.5, lip=1.6, shade=-1.4, clusters=False, dark_low=0,
                layers=[{"id": "rivets", "op": "stripes", "axis": "y", "period": 5.0, "width": 0.2, "shift": 1.8,
                         "faces": ["front"]}]),
    "rim_cap": skin("iron", 4.2, grain=0.4, lip=1.8, shade=-1.6, clusters=False, dark_low=0,
                    stamps=[{"face": "front", "at": "top-left", "art": ["..", ".k"], "key": {"k": "iron:2"}}]),
    "gold_ring": skin("gold", 4.4, grain=0.5, lip=1.6, shade=-1.4, clusters=False, dark_low=0),
    "boss": obsidian(3.6, tears=0.3, stamps=[{"face": "front", "at": "top-left",
                                              "art": ["......", ".kkkk.", "......", "......", ".kkkk.", "......"],
                                              "key": {"k": "obsidian:0"}}]),
    "eye_slit": card_style("eyeglow", 3, {"a": "eyeglow:1", "b": "eyeglow:3"}, light=0, grain=0),
    "eye_pupil": card_style("eyeglow", 6, {"W": "eyeglow:6", "w": "eyeglow:5"}, light=0, grain=0),
    "eye_lid": card_style("obsidian", 5, {"L": "obsidian:5"}, light=0, grain=0),
    "grip": skin("leather", 3.4, grain=0.4, lip=1.2, shade=-1.2, clusters=False, dark_low=0, layers=[
        {"id": "wrap", "op": "stripes", "axis": [0, 1, 0.4], "period": 2.0, "width": 0.5, "shift": -1.2}]),
    "bracket": skin("iron", 3.6, grain=0.4, lip=1.4, shade=-1.2, clusters=False, dark_low=0),
    "iron": {"ramp": "iron", "tone": 3},
}

# ======================================================================= clip
# idle: the pupil looks left, holds, glances right, the lid drops over the eye and lifts (a blink)
L = 4.0
SHUT = 2.0                  # the 1 px lid stretched to 3 px, over the whole slit
BLINK = [[0, [0, 0, 0]], [2.6, [0, 0, 0]], [2.66, [0, SHUT, 0]], [2.76, [0, SHUT, 0]], [2.86, [0, 0, 0]],
         [L, [0, 0, 0]]]
ANIM = {"idle": {"length": L, "loop": True, "tracks": [
    keys("eye_iris", None, [[0, [0, 0, 0]], [0.5, [-1, 0, 0]], [1.4, [-1, 0, 0]], [1.7, [1, 0, 0]],
                            [2.5, [1, 0, 0]], [3.0, [0, 0, 0]], [L, [0, 0, 0]]], ease="ease", ch="position"),
    {"part": "eye_lid", "channel": "scale", "keys": BLINK, "ease": "ease"},
]}}

spec = {
    "name": "Obsidian Shield",
    "description": "The Winterworks Obsidian Shield in vanilla style: fitted obsidian plates with glowing "
                   "crying-obsidian seams in an iron frame, a gold-ringed obsidian boss bearing the Obolisk's flat "
                   "glowing violet eye, a leather-wrapped grip behind. Vanilla shield proportions and layout; "
                   "Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "grounded": False,
    "budget": {"tris": 300, "colors": 48},
    "light": dict(LIGHT, gradient=0.3, ao=0.0),
    "minecraft": {"fps": 20, "glow_parts": ["eye_iris", "eye_ball"], "glow_ramps": ["crying", "eyeglow"]},
    "render": {"background": "#2a2735", "hero": [-28, 12], "shadow": 0.3},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "obsidian_shield.json")
    dump(spec, out)
