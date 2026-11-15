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


# ------------------------------------------------------------------ torso: a big soft barrel that sags
box("body", None, [26, 19, 28], [0, 13.5, -1], "seal_back")
box("belly", "body", [24, 6, 26], [0, -6.5, 1], "belly", offset=[0, -3, 0])
box("hump", "body", [22, 3, 22], [0, 11, -1], "seal_back")
box("flank", "body", [2, 13, 22], [13.5, -2, -1], "seal", mirror=True)
box("snowcap", "hump", [16, 2, 12], [-1, 2, -2], "snow")
box("snowcap_b", "hump", [8, 1, 6], [5, 1.5, 7], "snow")
box("hips", "body", [20, 14, 12], [0, -2.5, -14], "seal", offset=[0, 0, -6])
box("tail", "hips", [12, 8, 9], [0, -2, -12], "seal", offset=[0, 0, -4.5])
box("fluke", "tail", [7, 2, 10], [3, -2, -8], "flipper", offset=[0, 0, -5], rot=[0, 24, 0], mirror=True)
box("flipper", "body", [4, 10, 8], [13, -2.2, 8], "flipper", offset=[1, -5, 0], rot=[18, 0, -22], mirror=True)
for k, z in enumerate((-2.5, 0, 2.5)):
    box(f"claw{k}", "flipper", [1, 1, 1], [1.5, -10.5, z], "claw", mirror=True)
# ------------------------------------------------------------------ the enormous head
box("neck", "body", [20, 16, 7], [0, 2, 13], "seal", offset=[0, 0, 3.5])
box("head", "neck", [24, 20, 16], [0, 1, 5], "head", offset=[0, 2, 8])
box("crown", "head", [20, 2, 12], [0, 13, 7], "head")
box("cheek", "head", [2, 12, 12], [12.5, -1, 8], "head", mirror=True)
box("muzzle", "head", [14, 8, 6], [0, -4, 16], "muzzle", offset=[0, 0, 3])
box("whisker_pad", "muzzle", [16, 4, 4], [0, -1, 4], "muzzle")
box("nose", "muzzle", [6, 3, 1], [0, 2.5, 6], "nose", offset=[0, 0, 0.5])
box("jaw", "head", [16, 4, 12], [0, -8, 9], "jaw", offset=[0, -1.5, 6])
box("tongue", "jaw", [10, 1, 8], [0, 0.6, 7], "mouth")
box("tusk", "muzzle", [2, 5, 2], [4.5, -4, 4], "tusk", offset=[0, -2.5, 0], rot=[-8, 0, 0], mirror=True)
box("eye", "head", [5, 5, 1], [6.5, 5, 16], "eye", offset=[0, 0, 0.5], mirror=True)
box("brow", "head", [7, 2, 2], [6.5, 9, 16], "brow", offset=[0, 0, 0], mirror=True)
# the horn: a massive ice horn, stacked boxes curving up and forward
box("horn", "crown", [7, 7, 7], [0, 1, 3], "horn", offset=[0, 3, 0], rot=[30, 0, 0])
box("horn_1", "horn", [5, 6, 5], [0, 6, 0], "horn", offset=[0, 3, 0], rot=[8, 0, 0])
box("horn_2", "horn_1", [3, 6, 3], [0, 6, 0], "horn", offset=[0, 3, 0], rot=[9, 0, 0])
box("horn_3", "horn_2", [2, 4, 2], [0, 6, 0], "horn", offset=[0, 2, 0], rot=[10, 0, 0])
box("horn_tip", "horn_3", [1, 3, 1], [0, 4, 0], "horn_tip", offset=[0, 1.5, 0], rot=[8, 0, 0])
# frost tufts on the back
for k, (x, z, w, h) in enumerate([(-6, 3, 3, 2), (5, -3, 2, 2), (-1, -4, 2, 2)]):
    box(f"frost{k}", "snowcap", [w, h, w], [x, 1 + h / 2, z], "frost")

ramps = {
    "seal": ["#0d111c", "#18202f", "#243042", "#324257", "#43566d", "#576c82", "#6e8497", "#889dad", "#a6b9c5",
             "#c6d5dd", "#e6f0f2"],
    "belly": ["#2a2932", "#413e48", "#5b5760", "#77727a", "#958f94", "#b3aca9", "#cfc8bf", "#e8e2d5", "#faf6ea"],
    "horn": ["#081830", "#0e2a52", "#154376", "#1e609c", "#2c80bc", "#44a2d6", "#6cc2ea", "#9edcf6", "#d0f2ff", "#ffffff"],
    "snow": ["#4f5f78", "#71839c", "#93a7bd", "#b5c8da", "#d3e2ee", "#ebf4fb", "#ffffff"],
    "eye": ["#05060a", "#0f121c", "#1c2234", "#2c3550"],
    "white": ["#9fb0c2", "#cbd6e2", "#eef3f8", "#ffffff"],
    "nose": ["#07080d", "#131620", "#212634", "#323a4c", "#4a5468"],
    "claw": ["#110f15", "#221e27", "#36303a", "#4e464f", "#6a6068"],
    "mouth": ["#1c060e", "#3a0d1c", "#5e1a2c", "#86283e", "#ae4058", "#d06478", "#ec94a2"],
}

spots = {"id": "spots", "op": "spots", "count": 9, "radius": [1.2, 2.6], "shift": -2.2, "faces": ["top", "sides", "back"]}
rings = {"id": "ringspots", "op": "spots", "count": 5, "radius": [1.0, 1.8], "shift": 1.6, "seed": 7, "faces": ["top", "sides"]}
styles = {
    "seal": {"ramp": "seal", "tone": 5.4, "layers": [
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": 1.4},
        spots, rings,
        {"id": "fur", "op": "noise", "scale": 1.0, "amount": 0.55},
        {"id": "clumps", "op": "patches", "scale": 2.4, "threshold": 0.6, "shift": -0.7}]},
    "seal_back": {"ramp": "seal", "tone": 5.4, "layers": [
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": 1.4},
        dict(spots, count=16), dict(rings, count=8),
        {"id": "fur", "op": "noise", "scale": 1.0, "amount": 0.55},
        {"id": "clumps", "op": "patches", "scale": 2.4, "threshold": 0.6, "shift": -0.7},
        {"id": "frost_drip", "op": "drip", "ramp": "snow", "tone": 4.6, "depth": 1.2, "length": 3.0, "width": 0.6,
         "scale": 3.0, "faces": ["sides", "front", "back"]}]},
    "head": {"ramp": "seal", "tone": 5.6, "layers": [
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": 1.2},
        dict(spots, count=6, faces=["top", "sides"]),
        {"id": "fur", "op": "noise", "scale": 1.0, "amount": 0.5},
        # the face: a pale mask round the eyes and cheeks, dark tear marks
        {"id": "mask", "op": "rect", "rect": [0.08, 0.2, 0.92, 0.95], "ramp": "belly", "tone": 6.4, "faces": ["front"]},
        {"id": "mask_soft", "op": "noise", "scale": 0.8, "amount": 0.5, "faces": ["front"]},
        {"id": "closed_l", "op": "rect", "rect": [0.12, 0.4, 0.42, 0.46], "ramp": "eye", "tone": 1, "faces": ["front"]},
        {"id": "closed_r", "op": "rect", "rect": [0.58, 0.4, 0.88, 0.46], "ramp": "eye", "tone": 1, "faces": ["front"]},
        {"id": "blush_l", "op": "rect", "rect": [0.06, 0.55, 0.2, 0.62], "ramp": "mouth", "tone": 5.5, "faces": ["front"]},
        {"id": "blush_r", "op": "rect", "rect": [0.8, 0.55, 0.94, 0.62], "ramp": "mouth", "tone": 5.5, "faces": ["front"]}]},
    "belly": {"ramp": "belly", "tone": 6.0, "layers": [
        {"id": "folds", "op": "stripes", "axis": "z", "period": 3.0, "width": 0.25, "shift": -1.2, "wobble": 0.3},
        {"id": "soft", "op": "noise", "scale": 1.0, "amount": 0.45},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "muzzle": {"ramp": "belly", "tone": 6.3, "layers": [
        {"id": "whisker_dots", "op": "speckle", "density": 0.14, "shift": -3.0, "faces": ["front", "sides"]},
        {"id": "soft", "op": "noise", "scale": 0.8, "amount": 0.4}]},
    "jaw": {"ramp": "belly", "tone": 5.0, "layers": [{"id": "soft", "op": "noise", "scale": 0.8, "amount": 0.4}]},
    "nose": {"ramp": "nose", "tone": 2.4, "layers": [
        {"id": "shine", "op": "rect", "rect": [0.15, 0.0, 0.5, 0.4], "tone": 4.2, "faces": ["front", "top"]}]},
    "mouth": {"ramp": "mouth", "tone": 4.0},
    "tusk": {"ramp": "horn", "tone": 7.2, "layers": [{"id": "tip", "op": "gradient", "axis": "y", "amount": -1.2}]},
    "flipper": {"ramp": "seal", "tone": 3.8, "layers": [
        {"id": "webs", "op": "stripes", "axis": "x", "period": 1.5, "width": 0.3, "shift": -1.0, "wobble": 0.2},
        {"id": "fur", "op": "noise", "scale": 1.0, "amount": 0.4}]},
    "claw": {"ramp": "claw", "tone": 2.6},
    "eye": {"ramp": "white", "tone": 2.6, "light": 0, "layers": [
        {"id": "pupil", "op": "rect", "rect": [0.2, 0.2, 0.8, 1.0], "ramp": "eye", "tone": 1.0, "faces": ["front"]},
        {"id": "iris", "op": "rect", "rect": [0.2, 0.6, 0.8, 1.0], "ramp": "eye", "tone": 3.0, "faces": ["front"]},
        {"id": "catch", "op": "rect", "rect": [0.2, 0.2, 0.4, 0.4], "ramp": "white", "tone": 3.0, "faces": ["front"]},
        {"id": "catch2", "op": "rect", "rect": [0.6, 0.6, 0.8, 0.8], "ramp": "white", "tone": 1.5, "faces": ["front"]}]},
    "brow": {"ramp": "seal", "tone": 2.2, "layers": [{"id": "fur", "op": "noise", "scale": 1.0, "amount": 0.4}]},
    "horn": {"ramp": "horn", "tone": 5.4, "rim": {"light_shift": 1.4, "dark_shift": -1.0}, "layers": [
        {"id": "ridges", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.3, "shift": -1.4, "wobble": 0.1},
        {"id": "glint", "op": "speckle", "density": 0.03, "shift": 2.6}]},
    "horn_tip": {"ramp": "horn", "tone": 8.4},
    "snow": {"ramp": "snow", "tone": 4.0, "layers": [
        {"id": "drift", "op": "patches", "scale": 2.0, "threshold": 0.55, "shift": 0.8},
        {"id": "sparkle", "op": "speckle", "density": 0.06, "shift": 2.0},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4}]},
    "frost": {"ramp": "snow", "tone": 4.6, "layers": [{"id": "sparkle", "op": "speckle", "density": 0.2, "shift": 1.5}]},
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
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.06, -0.12, 0.04], "cycles": 2, "phase": 0.18}},
        {"part": "belly", "channel": "position", "osc": {"amp": [0, -0.8, 0], "cycles": 2, "phase": 0.22}},
        {"part": "neck", "axis": "x", "osc": {"amp": -6, "cycles": 1, "phase": 0.1}},
        {"part": "head", "axis": "x", "osc": {"amp": -4, "cycles": 1, "phase": 0.18}},
        {"part": "head", "axis": "z", "osc": {"amp": 3, "cycles": 1}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 34, "cycles": 1, "bias": -6}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 8, "cycles": 1, "phase": 0.25}},
        {"part": "hips", "axis": "x", "osc": {"amp": 6, "cycles": 1, "phase": 0.3, "bias": 3}},
        {"part": "tail", "axis": "x", "osc": {"amp": 8, "cycles": 1, "phase": 0.4, "bias": 10}},
        {"part": "fluke", "axis": "x", "osc": {"amp": 10, "cycles": 1, "phase": 0.5, "bias": 8}},
    ]},
    # head down, horn levelled at you, big pumping strides
    "charge": {"length": 0.5, "loop": True, "tracks": [
        {"part": "neck", "axis": "x", "osc": {"amp": 2, "cycles": 1, "bias": 3}},
        {"part": "head", "axis": "x", "osc": {"amp": 2, "cycles": 1, "phase": 0.15, "bias": 3}},
        {"part": "brow", "axis": "z", "osc": {"amp": 0, "cycles": 1, "bias": -18}},
        {"part": "brow", "channel": "position", "osc": {"amp": [0, 0, 0], "cycles": 1, "bias": [0, -1, 0]}},
        {"part": "body", "axis": "x", "osc": {"amp": 5, "cycles": 1, "bias": -5}},
        {"part": "body", "channel": "position", "osc": {"amp": [0, 2.6, 0], "cycles": 1, "phase": 0.25, "shape": "bounce"}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.08, -0.14, 0.05], "cycles": 2, "phase": 0.2, "bias": [0, -0.1, 0]}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 50, "cycles": 1, "bias": -10}},
        {"part": "hips", "axis": "x", "osc": {"amp": 8, "cycles": 1, "phase": 0.3, "bias": 4}},
        {"part": "tail", "axis": "x", "osc": {"amp": 10, "cycles": 1, "phase": 0.4, "bias": 12}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 3, "cycles": 2, "bias": 8}},
    ]},
    # belly-sliding on ice: flat, flippers swept back, nose up, a little wiggle
    "slide": {"length": 1.2, "loop": True, "tracks": [
        {"part": "body", "channel": "position", "osc": {"amp": [0, 0, 0], "cycles": 1, "bias": [0, -1.5, 0]}},
        {"part": "body", "axis": "z", "osc": {"amp": 3, "cycles": 1}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.04, 0, 0], "cycles": 1, "bias": [0.06, -0.3, 0.04]}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 4, "cycles": 2, "bias": 62}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 0, "cycles": 1, "bias": 30}},
        {"part": "neck", "axis": "x", "osc": {"amp": 2, "cycles": 1, "bias": -10}},
        {"part": "head", "axis": "x", "osc": {"amp": 2, "cycles": 1, "phase": 0.2, "bias": -6}},
        {"part": "tail", "axis": "x", "osc": {"amp": 3, "cycles": 1, "bias": 18}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 12, "cycles": 2}},
    ]},
    "swim": {"length": 1.6, "loop": True, "tracks": [
        {"parts": ["neck", "head"], "wave": {"axis": "x", "amp": 5, "cycles": 1, "lag": 0.15}},
        {"part": "body", "axis": "x", "osc": {"amp": 5, "cycles": 1, "phase": 0.2}},
        {"parts": ["hips", "tail"], "wave": {"axis": "x", "amp": 8, "cycles": 1, "lag": 0.15, "growth": 1.3, "bias": 6}},
        {"part": "fluke", "axis": "x", "osc": {"amp": 20, "cycles": 1, "phase": 0.55, "bias": 14}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 28, "cycles": 1, "bias": 40, "phase": 0.1}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 12, "cycles": 1, "phase": 0.35, "bias": 20}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.03, 0.06, 0.02], "cycles": 2}},
    ]},
    # one horn jab: wind up, thrust, wobble back
    "ram": {"length": 0.8, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.18, -18, "out"], [0.3, 4, "in"], [0.45, 2], [0.8, 0, "elastic"]]},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.18, -10, "out"], [0.3, 2, "in"], [0.45, 1], [0.8, 0, "elastic"]]},
        {"part": "body", "channel": "position", "keys": [[0, [0, 0, 0]], [0.18, [0, 0.6, -2], "out"],
                                                         [0.3, [0, 1.2, 4], "in"], [0.8, [0, 0, 0], "elastic"]]},
        {"part": "belly", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [0, 0, 0]], [0.38, [0.14, -0.22, 0.08]],
                                                        [0.8, [0, 0, 0], "elastic"]]},
        {"part": "brow", "axis": "z", "keys": [[0, -18], [0.8, -18]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.3, 14, "out"], [0.8, 0]]},
    ]},
    # fed a fish: happy squint, chomp chomp, flipper claps, belly bounce
    "happy": {"length": 1.6, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.2, -14, "out_back"], [1.3, -10], [1.6, 0, "smooth"]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.25, 18], [0.4, 0], [0.55, 18], [0.7, 0], [0.85, 16], [1.0, 0]]},
        {"part": "eye", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.15, [0, -0.6, 0]], [1.4, [0, -0.6, 0]], [1.6, [0, 0, 0]]]},
        {"part": "brow", "channel": "position", "keys": [[0, [0, 0, 0]], [0.15, [0, 1, 0]], [1.4, [0, 1, 0]], [1.6, [0, 0, 0]]]},
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
    "description": "A huge fat seal with an enormous head, short flippers and a massive ice horn (Winterworks mod mob). "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 800, "colors": 64},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.7, "gradient": 0.6, "ao": 0.9, "ao_height": 8.0},
    "minecraft": {"fps": 12},
    "anim_ground_tolerance": 1.0,
    "render": {"background": "#141824", "hero": [-38, 18], "shadow": 0.5},
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
