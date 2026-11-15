"""Builds examples/zombie_cart.json: the Zombie Cart, a rotten minecart skin with a zombie riding up front.

    python examples/src/zombie_cart.py examples/zombie_cart.json

Mossy, cracked, rotting planks on rusted iron wheels. A zombie slumps in the front of the tub: its head (cocked,
the jaw hanging off its hinge) peeks over the rim and both arms reach out over the front, forearms dangling. A loose
plank, bent nails and a torn cloth flap hang off the sides. Units are Minecraft pixels, density 1
(see cart_parts.py for the shared contract).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cart_parts import WOOL, Cart, add_trim, add_tub, add_wheels, dump, spin_tracks, wool_styles  # noqa: E402

c = Cart()


def side_paint(name, sx):
    # the planks run along the cart; a different rot pattern on each wall
    return {"layers": [{"id": "rot", "seed": 3 if sx > 0 else 11}, {"id": "cracks", "seed": 5 if sx > 0 else 9}]}


top = add_tub(c, hull="hull", side="planks", front="planks_x", back="planks_x", axle="axle", wall_h=6,
              side_paint=side_paint)
trims = add_trim(c, top)
add_wheels(c, iron="rust", wood="rot")
c.box("seat", "tub", [8, 2, 8], [0, 8, -4.5], "seat")

# ------------------------------------------------------------------ odds and ends of decay
# a loose plank hanging off one nail on the left wall, drooping at the back
c.box("loose_plank", "wall_l", [1, 2, 9], [7.4, 10.5, 7], "planks", offset=[0, 0, -4.2], rot=[-13, 4, 0],
      paint={"tone": 5.4, "layers": [{"id": k, "off": True} for k in ("seams", "butts", "moss_drip", "nails")]
             + [{"id": "moss_low", "threshold": 0.8}]})
# bent nails working out of the boards
c.box("nail_0", "wall_l", [1, 1, 2], [7.6, 9.2, -7.5], "nail", offset=[0, 0, 0], rot=[0, 55, 30])
c.box("nail_1", "wall_f", [1, 1, 2], [-3.2, 7.3, 11.4], "nail", rot=[25, -20, 0])
c.box("nail_2", "wall_b", [1, 2, 1], [3.5, 11.6, -11.3], "nail", rot=[0, 0, 28])
c.box("nail_3", "wall_r", [1, 1, 2], [-7.6, 8.4, 3.0], "nail", rot=[-20, -50, 0])
# a torn cloth flap snagged on the right wall's rim
c.box("flap", "wall_r", [1, 6, 5], [-7.6, 12.5, -2.6], "flap", offset=[0, -3, 0], rot=[6, 0, -12])

# ------------------------------------------------------------------ the rider: slumped in the front of the tub
c.box("torso", "tub", [9, 7, 4], [0, 9.5, 6], "shirt", offset=[0, 3.5, 0], rot=[12, 0, 3])
c.box("collar", "torso", [7, 1, 3], [0, 7, 0.4], "shirt_dark", rel=True)
# the head: cocked over, chin jutting over the rim, the jaw sagging on its back hinge
c.box("head", "torso", [8, 6, 8], [0, 7, 0.5], "head", offset=[0, 4, 1.5], rot=[-8, -14, 13], rel=True)
c.box("brow", "head", [8, 1, 1], [0, 5.5, 6.0], "brow", rel=True)
c.box("jaw", "head", [7, 2, 7], [0, 1, -2.5], "jaw", offset=[0, -1, 3.6], rot=[16, 0, -2], rel=True)
# arms reaching out over the front rim: level upper arms, forearms bent down, fingers dangling
for side, sx, pose, fore in (("l", 1, [-17, 12, -8], [32, -8, 4]), ("r", -1, [-19, -9, 6], [42, 5, -3])):
    a = f"arm_{side}"
    c.box(a, "torso", [3, 3, 6], [sx * 5.6, 6.6, 0], "skin_arm", offset=[0, 0, 2.6], rot=pose, rel=True)
    c.box(a + "_sleeve", a, [4, 4, 3], [0, 0, 0.6], "sleeve", rel=True)
    c.box(a + "_fore", a, [3, 3, 5], [0, 0, 5.3], "skin_arm", offset=[0, 0, 2.2], rot=fore, rel=True)
    c.box(a + "_hand", a + "_fore", [3, 2, 3], [0, -0.2, 4.4], "hand", offset=[0, -0.2, 1.2], rot=[30, 0, 0],
          rel=True)

ramps = {
    # rotten planks: grey-green, cool shadows, sickly straw lights
    "rot": ["#111310", "#1b1e19", "#272b23", "#33382e", "#41463a", "#4f5546", "#5f6452", "#70745e", "#83866c",
            "#979a7e"],
    "moss": ["#0c140b", "#142011", "#1c2e17", "#253d1c", "#304c22", "#3c5c29", "#4a6b30", "#5b7c39"],
    # zombie hide: muted olive green, darker and bluer in the hollows
    "skin": ["#0e1610", "#152218", "#1d2e1f", "#263c27", "#304a2f", "#3c5937", "#486740", "#57754a", "#678356",
             "#7a9263"],
    "shirt": ["#0c1519", "#122027", "#182c35", "#1f3a43", "#284851", "#31565e", "#3d646a", "#4c7276"],
    "rust": ["#131010", "#211915", "#31241c", "#433024", "#563c2c", "#694934", "#7b573f", "#8c674c"],
    "iron": ["#0f1013", "#1a1c20", "#272a2f", "#373a40", "#4a4d53", "#5f6268", "#76797d", "#8f9194"],
    "gum": ["#0c0507", "#1a0a0c", "#2a1013", "#3c181a", "#4f2222"],
    "tooth": ["#2f2a1e", "#4b4430", "#685f45", "#857b5b", "#a09672"],
    "socket": ["#060807", "#0e120f", "#1a1f19"],
    "cloth": ["#17120e", "#251d16", "#352a1f", "#463829", "#574734", "#695840", "#7b6a4e"],
    "wool": WOOL,
}

GRAIN = {"length": 3.5, "rough": 0.55}
planks_common = [
    {"id": "seams", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.34, "phase": 0.5, "shift": -2.2,
     "wobble": 0.05},
    {"id": "butts", "op": "stripes", "axis": "z", "period": 7.3, "width": 0.14, "phase": 0.2, "shift": -1.8,
     "faces": ["left", "right"]},
    {"id": "grain", "op": "noise", "scale": 1.6, "amount": 0.6},
    {"id": "rot", "op": "patches", "scale": 2.2, "threshold": 0.64, "shift": -1.2},
    {"id": "cracks", "op": "cracks", "scale": 2.6, "width": 0.5, "threshold": 0.86, "shift": -1.6},
    {"id": "moss_low", "op": "patches", "scale": 1.6, "threshold": 0.74, "ramp": "moss", "tone": 3.6,
     "faces": ["sides"]},
    {"id": "moss_drip", "op": "drip", "ramp": "moss", "tone": 4.4, "depth": 0.5, "length": 2.2, "width": 0.45,
     "scale": 2.4, "faces": ["sides"]},
    {"id": "nails", "op": "rivets", "inset": 1, "spacing": 7, "ramp": "rust", "tone": 4.6, "highlight": 1.2,
     "shadow": -1.2, "min_size": 5, "faces": ["sides"]},
    {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2}]

styles = {
    **wool_styles(),
    "planks": {"ramp": "rot", "tone": 5.0, "brush": dict(GRAIN, flow="z"), "layers": planks_common},
    "planks_x": {"ramp": "rot", "tone": 4.8, "brush": dict(GRAIN, flow="x"), "layers": planks_common},
    "hull": {"ramp": "rot", "tone": 3.6, "brush": dict(GRAIN, flow="z"), "layers": [
        {"id": "seams", "op": "stripes", "axis": "x", "period": 2.5, "width": 0.4, "shift": -1.3,
         "faces": ["top", "bottom"]},
        {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.6},
        {"id": "moss", "op": "patches", "scale": 1.6, "threshold": 0.58, "ramp": "moss", "tone": 3.0},
        {"id": "straps", "op": "stripes", "axis": "z", "period": 6.0, "width": 0.17, "phase": 0.08,
         "ramp": "rust", "tone": 3.6, "faces": ["sides", "bottom"]},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "axle": {"ramp": "rust", "tone": 2.6},
    "tyre": {"ramp": "rust", "tone": 3.4, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "hub": {"ramp": "rust", "tone": 4.6, "brush": {"off": True}},
    "nail": {"ramp": "rust", "tone": 4.2, "brush": {"off": True}, "layers": [
        {"id": "head", "op": "fill", "ramp": "iron", "tone": 4.0, "faces": ["front", "top"]}]},
    "flap": {"ramp": "cloth", "tone": 4.0, "brush": {"flow": "y", "length": 2.5, "rough": 0.6},
             "layers": [{"id": "weave", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.5, "shift": -0.5},
                        {"id": "stain", "op": "patches", "scale": 1.4, "threshold": 0.55, "shift": -1.2},
                        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.0}],
             # a ragged hem and a moth hole (punched right through)
             "stamps": [{"faces": ["left"], "at": [0, 0],
                         "art": [".....", ".....", "..._.", ".....", "_..._", "__._."], "key": {}},
                        {"faces": ["right"], "at": [0, 0],
                         "art": [".....", ".....", "._...", ".....", "_..._", "._.__"], "key": {}},
                        {"faces": ["front", "back"], "at": [0, 0], "art": [".", ".", ".", ".", "_", "_"], "key": {}}]},
    "shirt": {"ramp": "shirt", "tone": 4.2, "brush": {"flow": "y", "length": 2.5, "rough": 0.6}, "layers": [
        {"id": "folds", "op": "stripes", "axis": "x", "period": 3.0, "width": 0.3, "shift": -0.9, "wobble": 0.4},
        {"id": "grime", "op": "patches", "scale": 1.8, "threshold": 0.58, "shift": -1.2},
        # torn through to the skin at the shoulders
        {"id": "tears", "op": "spots", "count": 3, "radius": [0.7, 1.2], "ramp": "skin", "tone": 4.5,
         "faces": ["top", "front"], "seed": 4}]},
    "shirt_dark": {"ramp": "shirt", "tone": 2.6},
    "sleeve": {"ramp": "shirt", "tone": 4.0, "brush": {"flow": "z", "length": 2.0, "rough": 0.6},
               "layers": [{"id": "grime", "op": "patches", "scale": 1.6, "threshold": 0.55, "shift": -1.0}],
               # the sleeve is torn ragged where the arm comes out
               "stamps": [{"face": "front", "at": [0, 0], "art": ["....", "_...", "....", "_.._"], "key": {}},
                          {"faces": ["left", "right", "top", "bottom"], "at": [3, 0],
                           "art": [".", "_", ".", "_"], "key": {}}]},
    "skin_arm": {"ramp": "skin", "tone": 5.0, "brush": {"flow": "z", "length": 2.5, "rough": 0.55}, "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.6, "amount": 0.7},
        {"id": "bruise", "op": "patches", "scale": 1.4, "threshold": 0.6, "shift": -1.3},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4}]},
    "hand": {"ramp": "skin", "tone": 4.6, "brush": {"off": True},
             "stamps": [{"face": "front", "at": [0, 0], "art": [".d.", "d.d"], "key": {"d": "skin:1"}},
                        {"face": "bottom", "at": [0, 0], "art": [".d.", ".d.", ".d."], "key": {"d": "skin:2"}}]},
    "head": {"ramp": "skin", "tone": 5.2, "brush": {"flow": "y", "length": 2.5, "rough": 0.55}, "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.8, "amount": 0.7},
        {"id": "rot", "op": "patches", "scale": 1.5, "threshold": 0.62, "shift": -1.4},
        {"id": "scalp", "op": "band", "axis": "y", "from": 0.6, "to": 1.0, "wobble": 0.6, "shift": -1.0},
        {"id": "palate", "op": "fill", "ramp": "gum", "tone": 1.4, "faces": ["bottom"]}],
        "stamps": [
            # hollow sockets with a dull pupil low in each, a sunken nose, the upper teeth along the lip
            {"face": "front", "at": [1, 2], "art": ["ss..ss", "sp..ps"], "key": {"s": "socket:1", "p": "socket:2"}},
            {"face": "front", "at": [3, 3], "art": ["nn"], "key": {"n": "skin:2"}},
            {"face": "front", "at": [3, 4], "art": ["d.", ".."], "key": {"d": "skin:3"}},
            {"face": "front", "at": [1, 5], "art": ["tgttgt"], "key": {"t": "tooth:3", "g": "gum:1"}}]},
    "brow": {"ramp": "skin", "tone": 3.6, "brush": {"off": True}},
    "jaw": {"ramp": "skin", "tone": 4.6, "brush": {"flow": "x", "length": 2.0, "rough": 0.5}, "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.6, "amount": 0.6},
        {"id": "gums", "op": "fill", "ramp": "gum", "tone": 2.2, "faces": ["top"]}],
        "stamps": [{"face": "top", "at": [0, 6], "art": ["gtgtttg"], "key": {"t": "tooth:2", "g": "gum:3"}},
                   {"face": "front", "at": [0, 0], "art": ["l.l..ll"], "key": {"l": "skin:3"}}]},
    "nose": {"ramp": "skin", "tone": 4.0},
}

ARMS_L = ["arm_l", "arm_l_fore", "arm_l_hand"]
ARMS_R = ["arm_r", "arm_r_fore", "arm_r_hand"]
anim = {
    # rattling along: arms flail up and down out of step, the head bobs and lolls, the jaw chatters
    "run": {"length": 1.0, "loop": True, "tracks": spin_tracks() + [
        {"parts": ARMS_L, "wave": {"axis": "x", "amp": 14, "cycles": 2, "lag": 0.12, "growth": 1.3}},
        {"parts": ARMS_R, "wave": {"axis": "x", "amp": 14, "cycles": 2, "lag": 0.12, "growth": 1.3, "phase": 0.5}},
        {"part": "arm_l", "axis": "y", "osc": {"amp": 8, "cycles": 1}},
        {"part": "arm_r", "axis": "y", "osc": {"amp": 8, "cycles": 1, "phase": 0.5}},
        {"part": "head", "axis": "x", "osc": {"amp": 7, "cycles": 2, "phase": 0.2, "shape": "bounce"}},
        {"part": "head", "axis": "z", "osc": {"amp": 6, "cycles": 1, "phase": 0.1}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 9, "cycles": 4, "bias": 6, "shape": "bounce"}},
        {"part": "torso", "axis": "z", "osc": {"amp": 4, "cycles": 1, "phase": 0.3}},
        {"part": "torso", "axis": "x", "osc": {"amp": 3, "cycles": 2, "phase": 0.35}},
        {"part": "flap", "axis": "z", "osc": {"amp": 10, "cycles": 3, "bias": -10}},
        {"part": "flap", "axis": "y", "osc": {"amp": 6, "cycles": 2, "phase": 0.2}},
        {"part": "loose_plank", "axis": "x", "osc": {"amp": 5, "cycles": 4, "shape": "bounce"}},
        {"part": "tub", "axis": "z", "osc": {"amp": 1.2, "cycles": 2, "phase": 0.3}},
    ]},
    # waiting: the arms drift, the head lolls, the jaw drops open and snaps shut
    "idle": {"length": 2.0, "loop": True, "tracks": [
        {"parts": ARMS_L, "wave": {"axis": "x", "amp": 5, "cycles": 1, "lag": 0.15, "growth": 1.3}},
        {"parts": ARMS_R, "wave": {"axis": "x", "amp": 5, "cycles": 1, "lag": 0.15, "growth": 1.3, "phase": 0.4}},
        {"part": "arm_l", "axis": "y", "osc": {"amp": 4, "cycles": 1, "phase": 0.25}},
        {"part": "arm_r", "axis": "y", "osc": {"amp": 4, "cycles": 1, "phase": 0.7}},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.5, 0], [0.75, 24, "out_back"], [1.15, 22], [1.3, -4, "in"],
                                             [1.4, 2, "out"], [1.55, 0], [2.0, 0]]},
        {"part": "head", "axis": "z", "keys": [[0, 0], [0.6, -5], [1.3, 6], [2.0, 0]], "ease": "smooth"},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.6, -4, "out"], [1.25, -6], [1.4, 3, "in"], [2.0, 0]]},
        {"part": "torso", "channel": "scale", "osc": {"amp": [0.03, 0.04, 0.03], "cycles": 1}},
        {"part": "flap", "axis": "z", "osc": {"amp": 4, "cycles": 1, "phase": 0.3}},
    ]},
}

spec = {
    "name": "Zombie Cart",
    "description": "A rotten minecart skin (Winterworks mod): mossy, cracked planks on rusted wheels, with a zombie "
                   "slumped in the front, its head (jaw hanging) peeking over the rim and both arms reaching out over "
                   "the front. Loose plank, bent nails, a torn cloth flap. Dyeable wool rim (trim) and cushion (seat). "
                   "Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 900, "colors": 80},
    "light": {"dir": [-0.4, 1.0, 0.5], "strength": 0.6, "gradient": 0.5, "ao": 0.8, "ao_height": 7.0},
    "brush": {"flow": "z", "length": 3.0, "rough": 0.6, "width": 0.6, "overshoot": 0.3, "marks": 0.8,
              "flows": {"moss": "y"},
              "textures": {"rot": "wood", "moss": "moss", "skin": "organic", "shirt": "cloth", "cloth": "cloth",
                           "rust": "metal", "wool": "cloth"}},
    "minecraft": {"fps": 12, "glow_parts": [], "tint_parts": trims + ["seat"]},
    # the wheels are square boxes with punched corners: their (invisible) corners dip under the rail as they roll
    "anim_ground_tolerance": 1.3,
    "render": {"background": "#1a1d1f", "hero": [-38, 20], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": c.P,
    "animations": anim,
}

if __name__ == "__main__":
    dump(spec, sys.argv[1] if len(sys.argv) > 1 else "examples/zombie_cart.json")
