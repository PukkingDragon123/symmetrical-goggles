"""Builds examples/obsidian_shield.json: the Obsidian Shield (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/obsidian_shield.py examples/obsidian_shield.json

A vanilla-proportioned shield (12 x 22 px) of fitted obsidian plates: faceted, glassy slabs set in an iron rim with
riveted corner caps, the hairline seams between the plates glowing crying-obsidian violet. In the middle an
Obolisk-eye motif: a diamond obsidian boss ringed in violet-gold, a dark socket cut into it round one glowing,
slit-pupilled eye. On the back, iron straps across the obsidian and a leather-wrapped iron grip.

Laid out exactly like the vanilla ShieldModel in Minecraft model space (plate addBox(-6, -11, -2, 12, 22, 1), handle
from z -1 to 5 behind it), so the vanilla shield's item display transforms and its BEWLR set-up
(pose.scale(1, -1, -1)) draw it as-is: the root sits at lowpix (0, 24, 0) = Minecraft (0, 0, 0), the plate's front
faces +Z (Minecraft -Z), the decorations stand out up to 2.25 px in front of it. Units are Minecraft pixels, density
4 (four texels per pixel), every box size a multiple of 0.25.

Contract (mods/winterworks/docs/END_UPDATE.md section 9). Bones: shield (root: plate, rim, boss), handle (the grip
behind it), eye (the glowing eye; glow). Glow: eye and every crying-obsidian texel (the seams). Clip: idle (4 s loop:
the eye glances about and blinks).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, keys  # noqa: E402
from obsidian_kit import RAMPS, almond  # noqa: E402

R = Rig(density=4, bone_style="iron")
part, bone, card = R.part, R.bone, R.card

C = 24.0                      # the plate's centre height (Minecraft y = 0)
bone("shield", None, at=(0, C, 0))
# the plate itself (vanilla: 12 x 22 x 1 at Minecraft z -2..-1); its front shows only in the glowing seams
part("plate", "shield", [12, 22, 1], "plate_back", centre=(0, C, 1.5))

# ======================================================================= the obsidian plates (a fitted mosaic)
# (x0, x1, y0, y1, z-rotation): the gaps between them are the glowing seams
PLATES = [(-4.75, 4.75, 29.75, 34.0, 1.5), (-4.75, -0.5, 18.75, 29.25, -1.0), (0.5, 4.75, 18.5, 29.25, 1.0),
          (-4.75, 4.75, 14.0, 18.25, -1.5)]
for k, (x0, x1, y0, y1, rz) in enumerate(PLATES):
    part(f"slab_{k}", "shield", [x1 - x0, y1 - y0, 0.75], "slab", centre=((x0 + x1) / 2, (y0 + y1) / 2, 2.375),
         rot=(0, 0, rz))

# ======================================================================= the iron rim with riveted corner caps
for s, n in ((1, "l"), (-1, "r")):
    part(f"rim_{n}", "shield", [1.25, 21.0, 2.0], "rim", centre=(s * 5.625, C, 1.75))
for n, y in (("top", 34.625), ("bot", 13.375)):
    part(f"rim_{n}", "shield", [10.0, 1.25, 2.0], "rim", centre=(0, y, 1.75))
for k, (x, y) in enumerate([(5.5, 34.5), (-5.5, 34.5), (-5.5, 13.5), (5.5, 13.5)]):
    part(f"cap_{k}", "shield", [2.0, 2.0, 2.5], "rim_cap", centre=(x, y, 1.75))
# a pointed iron crest on top and a foot below, so the outline is not a bare rectangle
part("crest", "shield", [3.0, 1.0, 1.75], "rim", centre=(0, 35.75, 1.75))
part("crest_tip", "crest", [1.5, 0.75, 1.5], "rim_cap", centre=(0, 36.5, 1.75))
part("foot", "shield", [3.0, 1.0, 1.75], "rim", centre=(0, 12.25, 1.75))

# ======================================================================= the Obolisk eye: ring, boss, eye
part("boss_ring", "shield", [6.0, 6.0, 0.5], "gold_ring", centre=(0, C, 2.75), rot=(0, 0, 45))
part("boss", "shield", [5.0, 5.0, 0.75], "boss", centre=(0, C, 3.125), rot=(0, 0, 45))
part("socket", "shield", [5.75, 3.0, 0.5], "socket", centre=(0, C, 3.375))
part("socket_top", "socket", [4.0, 0.5, 0.5], "socket", centre=(0, C + 1.75, 3.375))
part("socket_bot", "socket", [4.0, 0.5, 0.5], "socket", centre=(0, C - 1.75, 3.375))
bone("eye", "shield", at=(0, C, 3.625))
part("eye_ball", "eye", [5.0, 2.5, 0.5], "eye_ball", rel=(0, 0, 0.0))

# ======================================================================= the back: grip and brackets
bone("handle", "shield", at=(0, C, -1.5))
part("grip", "handle", [1.75, 6.0, 1.5], "grip", centre=(0, C, -4.25))
for n, y in (("top", 27.5), ("bot", 20.5)):
    part(f"bracket_{n}", "handle", [2.0, 1.0, 4.0], "bracket", centre=(0, y, -2.5))

# ======================================================================= palette and paint
ramps = {k: RAMPS[k] for k in ("obsidian", "crying", "eye", "iron", "gold")}
ramps["leather"] = ["#1c1016", "#2c1a20", "#3f262b", "#553536", "#6d4743", "#875c52"]
OBS_RIM = {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.0, "outline": "dark"}
IRON_RIM = {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6, "outline": "dark"}
FACETS = {"id": "facets", "op": "patches", "scale": 1.4, "threshold": 0.55, "shift": 1.1,
          "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.0, "highlight_shift": 2.0}}
FRACTURES = {"id": "fractures", "op": "cracks", "scale": 2.4, "width": 0.025, "shift": -1.6,
             "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.4}}
VEINS = {"id": "veins", "op": "cracks", "scale": 3.0, "width": 0.02, "threshold": 0.6, "ramp": "crying", "tone": 3.2,
         "seed": 4, "faces": ["front"]}
GLINT = {"id": "glint", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.45,
         "shift": 2.4, "ramps": ["obsidian"]}
styles = {
    "iron": {"ramp": "iron", "tone": 3.0, "rim": IRON_RIM, "dither": 0},
    # the plate: crying obsidian on the front (only the seams show), obsidian strapped with iron on the back
    "plate_back": {"ramp": "obsidian", "tone": 3.0, "rim": OBS_RIM,
                   "layers": [FACETS, FRACTURES,
                              {"id": "seam", "op": "fill", "ramp": "crying", "tone": 4.6, "faces": ["front"]},
                              {"id": "seam_hot", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.3,
                               "ramp": "crying", "tone": 6.0, "faces": ["front"]},
                              {"id": "straps", "op": "stripes", "axis": "y", "period": 7.0, "width": 0.22,
                               "phase": 2.0, "ramp": "iron", "tone": 3.2, "faces": ["back"],
                               "bevel": {"shadow": 1, "highlight": 1}},
                              {"id": "strap_rivets", "op": "stripes", "axis": "x", "period": 3.0, "width": 0.1,
                               "shift": 2.0, "faces": ["back"]}]},
    "slab": {"ramp": "obsidian", "tone": 3.4, "rim": OBS_RIM,
             "layers": [FACETS, FRACTURES, VEINS, GLINT,
                        {"id": "sheen", "op": "gradient", "axis": [-1, 1, 0], "amount": 0.7}]},
    "rim": {"ramp": "iron", "tone": 2.8, "rim": IRON_RIM, "brush": {"off": True}, "dither": 0,
            "layers": [{"id": "rivets", "op": "rivets", "inset": 2, "spacing": 10, "ramp": "iron", "tone": 6.2,
                        "shadow": -1.8, "min_size": 5, "faces": ["front"]},
                       {"id": "wear", "op": "wear", "width": 1, "density": 0.15, "ramp": "iron", "tone": 1.4},
                       {"id": "sheen", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "shift": 0.8,
                        "faces": ["front", "back"]}]},
    "rim_cap": {"ramp": "iron", "tone": 3.6, "rim": IRON_RIM, "brush": {"off": True}, "dither": 0,
                "layers": [{"id": "bolt", "op": "rect", "rect": [0.35, 0.35, 0.65, 0.65], "ramp": "iron", "tone": 6.4,
                            "faces": ["front"], "bevel": {"shadow": 1, "highlight": 0}},
                           {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                            "density": 0.6, "shift": 2.0}]},
    "boss": {"ramp": "obsidian", "tone": 3.6, "rim": OBS_RIM, "brush": {"off": True},
             "layers": [{"id": "bevel", "op": "panel", "inset": 2, "shift": -1.2, "highlight": 1.6, "shadow": -1.0,
                         "faces": ["front"], "min_size": 6}, GLINT]},
    "socket": {"ramp": "obsidian", "tone": 1.0, "light": 0.3, "brush": {"off": True},
               "rim": {"light": 1, "dark": 1, "light_shift": 1.0, "dark_shift": -1.0}},
    "gold_ring": {"ramp": "gold", "tone": 4.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.8},
                  "brush": {"off": True},
                  "layers": [{"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                              "density": 0.6, "shift": 2.0}]},
    "eye_ball": {"ramp": "eye", "tone": 4.0, "light": 0.1, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                 "stamps": [{"face": "front", "at": "center", "art": almond(20, 10, slit="p"),
                             "key": {"o": "eye:3", "e": "eye:4", "E": "eye:5", "W": "eye:7", "k": "obsidian:1",
                                     "p": "obsidian:0"}}]},
    "grip": {"ramp": "leather", "tone": 3.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.2},
             "brush": {"off": True},
             "layers": [{"id": "wrap", "op": "stripes", "axis": [0, 1, 0.4], "period": 1.0, "width": 0.3,
                         "shift": -1.2}]},
    "bracket": {"ramp": "iron", "tone": 3.0, "rim": IRON_RIM, "brush": {"off": True}, "dither": 0},
}

# ======================================================================= clip
# idle: the eye looks left, holds, glances right, blinks
L = 4.0
BLINK = [[0, [0, 0, 0]], [2.6, [0, 0, 0]], [2.66, [0.05, -0.85, 0]], [2.76, [0.05, -0.85, 0]], [2.86, [0, 0, 0]],
         [L, [0, 0, 0]]]
ANIM = {"idle": {"length": L, "loop": True, "tracks": [
    keys("eye_ball", None, [[0, [0, 0, 0]], [0.5, [-0.75, 0, 0]], [1.4, [-0.75, 0, 0]], [1.7, [0.75, 0.1, 0]],
                            [2.5, [0.75, 0.1, 0]], [3.0, [0, 0, 0]], [L, [0, 0, 0]]], ease="ease", ch="position"),
    {"part": "eye_ball", "channel": "scale", "keys": BLINK, "ease": "ease"},
]}}

spec = {
    "name": "Obsidian Shield",
    "description": "The Winterworks Obsidian Shield: fitted obsidian plates with glowing crying-obsidian seams in an "
                   "iron rim, an Obolisk-eye motif glowing in the middle, a leather-wrapped grip behind. Vanilla "
                   "shield proportions and layout; Minecraft pixel units, density 4.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 4,
    "grounded": False,
    "budget": {"tris": 500, "colors": 56},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.0},
    "brush": {"flow": "horizontal", "length": 1.2, "width": 0.25, "rough": 0.45, "overshoot": 0.3,
              "textures": {"obsidian": "crystal", "iron": "metal", "gold": "metal", "leather": "leather"}},
    "minecraft": {"fps": 20, "glow_parts": ["eye_ball"], "glow_ramps": ["crying", "eye"]},
    "render": {"background": "#2a2735", "hero": [-28, 12], "shadow": 0.3},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "obsidian_shield.json")
    dump(spec, out)
