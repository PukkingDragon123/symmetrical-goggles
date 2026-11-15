"""Builds examples/icebreaker.json: the Icebreaker, a huge fat horned seal (Winterworks mod mob).

    python examples/src/icebreaker.py examples/icebreaker.json

Units are Minecraft pixels (16 per block) and every box is a whole number of pixels, so the model exports 1:1 to a
vanilla entity model (python -m lowpix mc export). Faces +Z, ground at y=0.
"""
import json
import sys

P = []


def box(id, parent, size, pivot, style, offset=None, rot=None, **kw):
    d = {"id": id, "shape": "box", "size": size, "pivot": pivot, "style": style}
    if parent:
        d["parent"] = parent
    if offset:
        d["offset"] = offset
    if rot:
        d["rotation"] = rot
    d.update(kw)
    P.append(d)
    return d


# ------------------------------------------------------------------ torso: posed like a hauled-out seal --
# chest propped up on the fore-flippers, the back sloping down to splayed tail flippers, an S-curved neck.
# Rotated boxes overlap at every joint so no seams open.
box("body", None, [28, 20, 26], [0, 5.4, -8], "seal_back", offset=[0, 10, 13], rot=[-12, 0, 0])
box("belly", "body", [28, 9, 26], [0, 3.5, 13], "belly", offset=[0, -4.5, 0])
box("belly_side", "belly", [3, 7, 20], [14.5, -4.0, 0], "belly", mirror=True)
box("belly_low", "belly", [22, 3, 20], [0, -8.2, 1], "belly")
box("hump", "body", [24, 3, 20], [0, 20, 12], "seal_back", rot=[-3, 0, 0])
box("flank", "body", [3, 14, 22], [14.5, 8, 12], "seal", mirror=True)
box("hips", "body", [23, 16, 14], [0, 8, 3], "seal", offset=[0, 0, -6], rot=[6, 0, 0])
box("hips_fat", "hips", [25, 10, 10], [0, -3, -5], "seal")
box("tail", "hips", [13, 9, 10], [0, -2.5, -11], "seal", offset=[0, 0, -4.5], rot=[9, 0, 0])
box("fluke", "tail", [10, 2, 15], [3, -3, -8], "flipper", offset=[1, 0, -7.5], rot=[-6, 32, 6], mirror=True)
box("fluke_web", "fluke", [8, 1, 4], [1, 0, -14], "flipper")
box("flipper", "body", [5, 12, 9], [14, 6.5, 19], "flipper", offset=[1.5, -5.5, 0], rot=[-4, 0, -22], mirror=True)
box("palm", "flipper", [7, 2, 12], [1.2, -11.2, 2.5], "flipper", rot=[16, 0, 22])
for k, z in enumerate((-2.5, 0, 2.5)):
    box(f"claw{k}", "palm", [1, 1, 1], [1.5 + k * 0.0, -0.3, z * 1.3 + 6.0], "claw", mirror=True)
# ------------------------------------------------------------------ the enormous head on a thick neck
box("neck", "body", [22, 17, 9], [0, 13.5, 24], "seal", offset=[0, 0, 3.5], rot=[-10, 0, 0])
box("head", "neck", [24, 20, 16], [0, 2, 6], "head", offset=[0, 2, 8], rot=[18, 0, 0])
box("crown", "head", [20, 2, 12], [0, 13, 7], "head")
box("cheek", "head", [2, 12, 12], [12.5, -1, 8], "head", rot=[0, 0, 4], mirror=True)
box("muzzle", "head", [14, 8, 6], [0, -4, 16], "muzzle", offset=[0, 0, 3], rot=[6, 0, 0])
box("whisker_pad", "muzzle", [16, 4, 4], [0, -1, 4], "whiskers", rot=[0, 0, 0])
box("nose", "muzzle", [4, 2, 1], [0, 2.5, 6], "nose", offset=[0, 0, 0.5])
box("jaw", "head", [16, 4, 12], [0, -8, 9], "jaw", offset=[0, -1.5, 6], rot=[4, 0, 0])
box("tongue", "jaw", [10, 1, 8], [0, 0.6, 7], "mouth")
box("tusk", "muzzle", [2, 6, 2], [4.5, -4, 4], "tusk", offset=[0, -3, 0], rot=[-18, 0, 8], mirror=True)
box("eye", "head", [2, 2, 1], [7.5, 5, 16], "eye", mirror=True)
box("nostril_ridge", "muzzle", [8, 1, 2], [0, 4.5, 4], "muzzle")
# the horn: a massive ice horn, stacked boxes curving up and forward
box("horn", "crown", [7, 7, 7], [0, 1, 3], "horn", offset=[0, 3, 0], rot=[22, 0, 0])
box("horn_1", "horn", [5, 6, 5], [0, 6, 0], "horn", offset=[0, 3, 0], rot=[12, 0, 4])
box("horn_2", "horn_1", [3, 6, 3], [0, 6, 0], "horn", offset=[0, 3, 0], rot=[14, 0, -3])
box("horn_3", "horn_2", [2, 4, 2], [0, 6, 0], "horn", offset=[0, 2, 0], rot=[16, 0, 0])
box("horn_tip", "horn_3", [1, 3, 1], [0, 4, 0], "horn_tip", offset=[0, 1.5, 0], rot=[8, 0, 0])

# A grey seal painted like a naturalist's study: muted neutral greys, dark blotches, a pale cream belly and muzzle,
# fur laid in short strokes that run back along the body, small dark eyes. No cartoon features.
ramps = {
    "seal": ["#15171a", "#1f2226", "#2a2e33", "#363b41", "#444a50", "#535a60", "#646a6f", "#767b7f", "#898d8f",
             "#9da09f", "#b2b4b1", "#c8c9c4"],
    "blotch": ["#121417", "#1b1e22", "#25292e", "#30353b", "#3c4147", "#494f55"],
    "belly": ["#3b3934", "#4e4b45", "#625e57", "#77736b", "#8d8880", "#a39e95", "#b9b4aa", "#ccc8be", "#dddad0",
              "#ebe9e0"],
    "horn": ["#252c33", "#333d46", "#45525c", "#596873", "#6f7f89", "#8797a0", "#a0aeb5", "#b9c6ca", "#d1dbdd",
             "#e5ecec", "#f4f7f6"],
    "eye": ["#08090b", "#111316", "#1c1f23", "#4a4f55"],
    "nose": ["#0e0f11", "#17191c", "#22252a", "#2e3237", "#3c4147"],
    "claw": ["#141210", "#201d1a", "#2e2a26", "#3d3833", "#4f4943"],
    "mouth": ["#24151a", "#3a2127", "#523038", "#6b424a", "#86585e", "#a07276"],
}
light = {"dir": [-0.4, 1.0, 0.55], "strength": 0.55, "gradient": 0.7, "ao": 1.1, "ao_height": 9.0}
brush = {"flow": "z", "length": 3.2, "width": 1.0, "rough": 0.62, "overshoot": 0.3,
         "flows": {"horn": "y"}, "textures": {"seal": "fur", "blotch": "fur", "belly": "fur", "horn": "bone"}}

blotches = {"id": "blotches", "op": "spots", "count": 14, "radius": [0.9, 2.4], "ramp": "blotch", "tone": 3.2,
            "faces": ["top", "sides", "back"]}
styles = {
    "seal": {"ramp": "seal", "tone": 6.2, "layers": [
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": -1.3},
        blotches,
        {"id": "pale_side", "op": "gradient", "axis": "y", "amount": -0.6, "faces": ["sides"]}]},
    "seal_back": {"ramp": "seal", "tone": 6.0, "layers": [
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": -1.4},
        dict(blotches, count=26)]},
    "head": {"ramp": "seal", "tone": 6.4, "layers": [
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": -1.1},
        dict(blotches, count=7, radius=[0.8, 1.6], faces=["top", "sides"]),
        {"id": "face_pale", "op": "gradient", "axis": "y", "amount": -1.2, "faces": ["front"]}]},
    "belly": {"ramp": "belly", "tone": 6.6, "layers": [
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4},
        {"id": "grime", "op": "patches", "scale": 2.6, "threshold": 0.64, "shift": -0.8}]},
    "muzzle": {"ramp": "belly", "tone": 6.8, "layers": [
        {"id": "nose_dark", "op": "gradient", "axis": "z", "amount": -0.6}]},
    "whiskers": {"ramp": "belly", "tone": 6.6, "stamps": [
        {"faces": ["front"], "at": "center", "art": [
            "................",
            "..d.d.d....d.d.d",
            ".d.d.d......d.d.",
            "..d.d........d.."], "key": {"d": "seal:3"}},
]},
    "jaw": {"ramp": "belly", "tone": 5.4},
    "nose": {"ramp": "nose", "tone": 2.0, "stamps": [
        {"face": "front", "at": "center", "art": ["n..n", ".nn."], "key": {"n": "nose:0"}},
        {"face": "front", "at": "top-left", "art": [".h"], "key": {"h": "nose:4"}}]},
    "mouth": {"ramp": "mouth", "tone": 3.2},
    "tusk": {"ramp": "horn", "tone": 8.0, "layers": [{"id": "tip", "op": "gradient", "axis": "y", "amount": -1.0}]},
    "flipper": {"ramp": "seal", "tone": 4.4, "layers": [
        {"id": "toes", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.25, "shift": -1.0, "wobble": 0.1,
         "faces": ["front", "back", "bottom"]},
        {"id": "edge", "op": "gradient", "axis": "y", "amount": -0.8}]},
    "claw": {"ramp": "claw", "tone": 2.2},
    "eye": {"ramp": "eye", "tone": 0.6, "light": 0, "brush": {"off": True}, "stamps": [
        {"face": "front", "at": "top-left", "art": ["h."], "key": {"h": "eye:3"}}]},
    # an old ice horn: grey-ivory with blue-grey depth, a slow spiral of ridges, a pale worn tip
    "horn": {"ramp": "horn", "tone": 6.4, "rim": {"light_shift": 1.0, "dark_shift": -0.8}, "layers": [
        {"id": "base_dark", "op": "gradient", "axis": "y", "amount": 1.2},
        {"id": "ridges", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.3, "shift": -1.3, "wobble": 0.35}]},
    "horn_tip": {"ramp": "horn", "tone": 9.0},
}

FL = ["flipper"]
anim = {
    "idle": {"length": 4.0, "loop": True, "tracks": [
        {"part": "body", "channel": "scale", "osc": {"amp": [0.012, 0.025, 0.008], "cycles": 2}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.03, 0.08, 0.02], "cycles": 2, "phase": 0.12}},
        {"part": "neck", "axis": "y", "osc": {"amp": 7, "cycles": 1}},
        {"part": "head", "axis": "x", "osc": {"amp": 2.5, "cycles": 2, "phase": 0.2}},
        {"part": "head", "axis": "z", "osc": {"amp": 3, "cycles": 1, "phase": 0.3}},
        {"part": "eye", "channel": "scale", "keys": [[0, [0, 0, 0]], [1.5, [0, 0, 0]], [1.58, [0, -0.85, 0]],
                                                      [1.7, [0, 0, 0]], [3.3, [0, 0, 0]], [3.36, [0, -0.85, 0]],
                                                      [3.42, [0, 0, 0]], [3.5, [0, -0.85, 0]], [3.6, [0, 0, 0]]]},
        {"part": "flipper", "axis": "x", "osc": {"amp": 5, "cycles": 1, "phase": 0.25}, "mirror_phase": 0.5},
        {"part": "fluke", "axis": "y", "osc": {"amp": 10, "cycles": 2}, "mirror_phase": 0.0},
        {"part": "tail", "axis": "x", "osc": {"amp": 4, "cycles": 1, "bias": 4}},
    ]},
    # the seal galumph: the whole barrel rocks forward and back, the belly and head lag behind it
    "walk": {"length": 1.0, "loop": True, "tracks": [
        {"part": "body", "axis": "x", "osc": {"amp": 6, "cycles": 1}},
        {"part": "body", "channel": "position", "osc": {"amp": [0, 1.6, 0], "cycles": 1, "phase": 0.25, "shape": "bounce"}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.08, -0.15, 0.05], "cycles": 2, "phase": 0.18}},
        {"part": "belly", "channel": "position", "osc": {"amp": [0, -0.8, 0], "cycles": 2, "phase": 0.22}},
        {"part": "neck", "axis": "x", "osc": {"amp": -6, "cycles": 1, "phase": 0.1}},
        {"part": "head", "axis": "x", "osc": {"amp": -4, "cycles": 1, "phase": 0.18}},
        {"part": "head", "axis": "z", "osc": {"amp": 3, "cycles": 1}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 14, "cycles": 1, "bias": 2}},
        {"part": "palm", "axis": "x", "osc": {"amp": -14, "cycles": 1}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 8, "cycles": 1, "phase": 0.25}},
        {"part": "hips", "axis": "x", "osc": {"amp": 6, "cycles": 1, "phase": 0.3, "bias": 3}},
        {"part": "tail", "axis": "x", "osc": {"amp": 8, "cycles": 1, "phase": 0.4, "bias": 10}},
        {"part": "fluke", "axis": "x", "osc": {"amp": 10, "cycles": 1, "phase": 0.5, "bias": 8}},
    ]},
    # head down, horn levelled at you, big pumping strides
    "charge": {"length": 0.5, "loop": True, "tracks": [
        {"part": "neck", "axis": "x", "osc": {"amp": 2, "cycles": 1, "bias": 3}},
        {"part": "head", "axis": "x", "osc": {"amp": 2, "cycles": 1, "phase": 0.15, "bias": 3}},
        {"part": "body", "axis": "x", "osc": {"amp": 5, "cycles": 1, "bias": -5}},
        {"part": "body", "channel": "position", "osc": {"amp": [0, 2.6, 0], "cycles": 1, "phase": 0.25, "shape": "bounce"}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.08, -0.14, 0.05], "cycles": 2, "phase": 0.2, "bias": [0, -0.1, 0]}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 24, "cycles": 1, "bias": 4}},
        {"part": "palm", "axis": "x", "osc": {"amp": -16, "cycles": 1, "phase": 0.1}},
        {"part": "hips", "axis": "x", "osc": {"amp": 8, "cycles": 1, "phase": 0.3, "bias": 4}},
        {"part": "tail", "axis": "x", "osc": {"amp": 10, "cycles": 1, "phase": 0.4, "bias": 12}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 3, "cycles": 2, "bias": 8}},
    ]},
    # belly-sliding on ice: flat, flippers swept back, nose up, a little wiggle
    "slide": {"length": 1.2, "loop": True, "tracks": [
        {"part": "body", "channel": "position", "osc": {"amp": [0, 0, 0], "cycles": 1, "bias": [0, -1.5, 0]}},
        {"part": "body", "axis": "z", "osc": {"amp": 1.5, "cycles": 1}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.04, 0, 0], "cycles": 1, "bias": [0.06, -0.3, 0.04]}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 4, "cycles": 2, "bias": 62}},
        {"part": "palm", "axis": "x", "osc": {"amp": 0, "cycles": 1, "bias": -40}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 0, "cycles": 1, "bias": 30}},
        {"part": "neck", "axis": "x", "osc": {"amp": 2, "cycles": 1, "bias": -10}},
        {"part": "head", "axis": "x", "osc": {"amp": 2, "cycles": 1, "phase": 0.2, "bias": -6}},
        {"part": "tail", "axis": "x", "osc": {"amp": 3, "cycles": 1, "bias": 18}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 12, "cycles": 2}},
    ]},
    # true seals swim with their hips: the whole back half sweeps side to side, the tail flippers sculling like a fan,
    # fore-flippers tucked, a slow barrel roll, the head steady and pointed
    "swim": {"length": 2.0, "loop": True, "tracks": [
        {"part": "body", "channel": "position", "osc": {"amp": [0, 0.8, 0], "cycles": 1, "bias": [0, 8, 0]}},
        {"part": "body", "axis": "x", "osc": {"amp": 3, "cycles": 2, "bias": 10}},
        {"part": "body", "axis": "z", "osc": {"amp": 6, "cycles": 1, "phase": 0.1}},
        {"part": "body", "axis": "y", "osc": {"amp": 5, "cycles": 1}},
        {"parts": ["hips", "tail"], "wave": {"axis": "y", "amp": 12, "cycles": 1, "lag": 0.16, "growth": 1.5}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 26, "cycles": 1, "phase": 0.5, "bias": -8}},
        {"part": "fluke", "axis": "x", "osc": {"amp": 6, "cycles": 2, "phase": 0.3}},
        {"part": "neck", "axis": "y", "osc": {"amp": -5, "cycles": 1, "phase": 0.05}},
        {"part": "head", "axis": "y", "osc": {"amp": -3, "cycles": 1, "phase": 0.1}},
        {"part": "neck", "axis": "x", "osc": {"amp": 2, "cycles": 2, "bias": -6}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 8, "cycles": 1, "bias": 55, "phase": 0.25}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 6, "cycles": 1, "bias": 28}},
        {"part": "palm", "axis": "x", "osc": {"amp": 12, "cycles": 1, "phase": 0.4}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.04, 0.07, 0.02], "cycles": 2, "phase": 0.2}},
    ]},
    # a threat display: rears up and drums both fore-flippers on its big belly three times
    "belly_slap": {"length": 1.2, "loop": False, "tracks": [
        {"part": "body", "axis": "x", "keys": [[0, 0], [0.2, -16, "out_back"], [0.95, -14], [1.2, 0, "smooth"]]},
        {"part": "body", "channel": "position", "keys": [[0, [0, 0, 0]], [0.2, [0, 1.5, -1], "out"], [0.95, [0, 1.2, -1]],
                                                         [1.2, [0, 0, 0], "smooth"]]},
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.2, -10, "out"], [0.95, -8], [1.2, 0]]},
        {"part": "hips", "axis": "x", "keys": [[0, 0], [0.2, 12, "out_back"], [0.95, 11], [1.2, 0, "smooth"]]},
        {"part": "tail", "axis": "x", "keys": [[0, 0], [0.2, 8, "out"], [0.95, 7], [1.2, 0, "smooth"]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.25, 14, "out"], [0.9, 10], [1.1, 0]]},
        {"part": "flipper", "axis": "z", "keys": [[0, 0], [0.18, -45, "out"], [0.3, 28, "in"], [0.42, -35, "out"], [0.54, 28, "in"],
                                                  [0.66, -35, "out"], [0.78, 30, "in"], [1.1, 0, "smooth"]]},
        {"part": "flipper", "axis": "x", "keys": [[0, 0], [0.18, -30, "out"], [0.9, -25], [1.1, 0]]},
        {"part": "belly", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [0, 0, 0]], [0.33, [0.16, -0.2, 0.08]],
                                                        [0.42, [-0.05, 0.06, 0]], [0.54, [0, 0, 0]], [0.57, [0.16, -0.2, 0.08]],
                                                        [0.66, [-0.05, 0.06, 0]], [0.78, [0, 0, 0]], [0.81, [0.2, -0.24, 0.1]],
                                                        [1.2, [0, 0, 0], "elastic"]]},
    ]},
    # tail and hind flippers swing up and slam down: a splash in water, a thump of snow on land
    "tail_slap": {"length": 1.0, "loop": False, "tracks": [
        {"part": "hips", "axis": "x", "keys": [[0, 0], [0.35, 16, "in"], [0.48, -1, "out"], [1.0, 0, "elastic"]]},
        {"part": "tail", "axis": "x", "keys": [[0, 0], [0.35, 24, "in"], [0.48, 0, "out"], [1.0, 0, "elastic"]]},
        {"part": "fluke", "axis": "x", "keys": [[0, 0], [0.35, 20, "in"], [0.48, 2, "out"], [1.0, 0, "elastic"]]},
        {"part": "body", "axis": "x", "keys": [[0, 0], [0.35, 4], [0.48, -3, "out"], [1.0, 0, "elastic"]]},
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.35, -6], [0.5, 4], [1.0, 0]]},
        {"part": "belly", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.48, [0, 0, 0]], [0.52, [0.14, -0.18, 0.08]],
                                                        [1.0, [0, 0, 0], "elastic"]]},
    ]},
    # one horn jab: wind up, thrust, wobble back
    "ram": {"length": 0.8, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.18, -18, "out"], [0.3, 4, "in"], [0.45, 2], [0.8, 0, "elastic"]]},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.18, -10, "out"], [0.3, 2, "in"], [0.45, 1], [0.8, 0, "elastic"]]},
        {"part": "body", "channel": "position", "keys": [[0, [0, 0, 0]], [0.18, [0, 0.6, -2], "out"],
                                                         [0.3, [0, 1.2, 4], "in"], [0.8, [0, 0, 0], "elastic"]]},
        {"part": "belly", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [0, 0, 0]], [0.38, [0.14, -0.22, 0.08]],
                                                        [0.8, [0, 0, 0], "elastic"]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.3, 14, "out"], [0.8, 0]]},
    ]},
    # fed a fish: happy squint, chomp chomp, flipper claps, belly bounce
    "happy": {"length": 1.6, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.2, -14, "out_back"], [1.3, -10], [1.6, 0, "smooth"]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.25, 18], [0.4, 0], [0.55, 18], [0.7, 0], [0.85, 16], [1.0, 0]]},
        {"part": "eye", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.15, [0, -0.6, 0]], [1.4, [0, -0.6, 0]], [1.6, [0, 0, 0]]]},
        {"part": "flipper", "axis": "z", "raw": True, "keys": [[0, 0], [0.4, 0], [0.5, 30, "out"], [0.6, 0], [0.7, 30, "out"], [0.8, 0],
                                                    [0.9, 30, "out"], [1.0, 0]]},
        {"part": "body", "channel": "position", "keys": [[0, [0, 0, 0]], [0.4, [0, 0, 0]], [0.55, [0, 2.5, 0], "out"],
                                                         [0.75, [0, 0, 0], "in"], [0.95, [0, 1.6, 0], "out"],
                                                         [1.15, [0, 0, 0], "in"], [1.6, [0, 0, 0]]]},
        {"part": "belly", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.75, [0.1, -0.18, 0.06]], [0.9, [-0.04, 0.08, 0]],
                                                        [1.15, [0.08, -0.14, 0.05]], [1.6, [0, 0, 0], "elastic"]]},
        {"part": "fluke", "axis": "y", "keys": [[0, 0], [0.3, 20], [0.5, -20], [0.7, 20], [0.9, -20], [1.1, 0]]},
    ]},
}

spec = {
    "name": "Icebreaker",
    "description": "A huge fat grey seal with an enormous head, short flippers and a massive old ice horn (Winterworks mod mob), "
                   "painted naturalistically: muted greys, dark blotches, fur strokes, small dark eyes. "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 800, "colors": 64},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 12},
    "anim_ground_tolerance": 1.0,
    "render": {"background": "#2a2e3a", "hero": [-38, 18], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/icebreaker.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts")
