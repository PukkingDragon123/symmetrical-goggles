"""Builds examples/icebreaker_cub.json: an Icebreaker cub, a fluffy white seal pup with a tiny horn bud.

    python examples/src/icebreaker_cub.py examples/icebreaker_cub.json

Drawn at twice its in-game size (Minecraft renders babies at half scale). Minecraft pixel units, faces +Z.
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


# a round, plump pup built like a little Icebreaker: the same segmented body, a fluffy ruff and crest, big dark
# eyes with lids and soft brows, splayed fins, and just buds of ice where the horn and tusks will grow
box("chest", None, [20, 16, 15], [0, 11.6, 4], "fluff", rot=[-8, 0, 0])
box("chest_under", "chest", [18, 3, 12], [0, -7.6, 0.5], "fluff_under")
box("belly", "chest", [22, 16, 14], [0, -0.5, -6], "fluff", offset=[0, -0.5, -6], rot=[6, 0, 0])
box("belly_under", "belly", [20, 4, 12], [0, -7.8, -6], "fluff_under")
box("hips", "belly", [15, 11, 10], [0, -1, -12], "fluff", offset=[0, -1.5, -4.5], rot=[6, 0, 0])
box("tail", "hips", [9, 6, 8], [0, -2, -8.5], "fluff", offset=[0, -0.5, -3.5], rot=[8, 0, 0])
box("fluke", "tail", [7, 2, 11], [2.2, -1.6, -6], "flipper", offset=[1, 0, -5.5], rot=[-8, 20, 4], mirror=True)
box("fluke_fan", "fluke", [9, 2, 4], [1.6, 0, -10.5], "flipper", rot=[0, 14, 0])
box("flipper", "chest", [5, 8, 8], [11, -3.6, 4], "flipper", offset=[1, -3.5, 0.5], rot=[-6, 0, 16], mirror=True)
box("palm", "flipper", [6, 2, 9], [0.6, -7.6, 2], "flipper", rot=[12, 0, -14])
# fluffy fur: a ruff round the neck, little parted locks down the back, a crest, a wisp on the tail
for k, (x, y, z, rx, ry, rz, w, h) in enumerate([(-8, 7, 3, -22, 10, 26, 7, 7), (8, 7, 3, -22, -10, -26, 7, 7),
                                                 (0, 9, 1, -34, 0, 0, 9, 6)]):
    box(f"tuft{k}", "chest", [w, h, 5], [x, y, z], "fluff_tuft", rot=[rx, ry, rz])
box("shag_chest", "chest", [10, 2, 8], [5, 8.4, -1], "fluff_tuft", rot=[-9, -7, -8], mirror=True)
box("shag_belly", "belly", [11, 2, 9], [5.5, 8.4, -6], "fluff_tuft", rot=[-9, -6, -8], mirror=True)
box("tail_fur", "tail", [7, 2, 5], [0, 3.4, -1.5], "fluff_tuft", rot=[-14, 0, 0])
# the head: big for a pup, round cheeks, a short muzzle with puffy whisker pads
box("neck", "chest", [18, 13, 6], [0, 4.5, 7], "fluff", offset=[0, 1, 2.5], rot=[-14, 0, 0])
box("head", "neck", [20, 17, 14], [0, 2.5, 5], "head", offset=[0, 2, 7], rot=[14, 0, 0])
box("crown", "head", [16, 2, 11], [0, 11.5, 7], "fluff")
box("crest", "crown", [7, 3, 6], [0, 2, -1.5], "fluff_tuft", rot=[-30, 0, 0])
box("cheek", "head", [2, 10, 10], [10.5, -1, 7], "fluff", rot=[0, 0, 5], mirror=True)
box("muzzle", "head", [10, 6, 4], [0, -4, 14], "muzzle", offset=[0, 0, 2])
box("whisker_pad", "muzzle", [6, 5, 4], [2.8, -0.4, 2.6], "whiskers", mirror=True)
box("nose", "muzzle", [4, 2, 2], [0, 2.8, 3.4], "nose")
box("nostril", "nose", [1, 1, 1], [1, 0.4, 1.1], "nostril", mirror=True)
box("jaw", "head", [9, 3, 8], [0, -7, 8], "muzzle", offset=[0, -1, 4], rot=[4, 0, 0])
box("tongue", "jaw", [6, 1, 5], [0, 0.6, 4.5], "mouth")
box("eye", "head", [4, 4, 1], [5.5, 3.2, 14.1], "eye", mirror=True)
box("lid", "head", [5, 2, 2], [5.5, 5.8, 14.2], "lid", mirror=True)
box("brow", "head", [5, 1, 2], [5.5, 7.0, 14.0], "brow", rot=[0, 0, 6], mirror=True)
box("horn", "crown", [3, 3, 3], [0, 1, 3], "horn", offset=[0, 1.5, 0], rot=[18, 0, 0])
box("tusk", "muzzle", [1, 2, 1], [3.4, -3.2, 3.2], "horn", offset=[0, -1, 0], rot=[-10, 0, 6], mirror=True)

ramps = {
    # a whitecoat pup: cream-white fluff with cool grey-blue shade, dusky muzzle and flippers
    "fluff": ["#3b3f45", "#555a61", "#71767c", "#8d9297", "#a8adb0", "#c1c5c6", "#d6d8d6", "#e6e7e3", "#f2f2ee", "#fbfbf8"],
    "skin": ["#1a1c20", "#262a2f", "#343940", "#454b52", "#575e66", "#6b737a", "#81888e"],
    "horn": ["#3a4650", "#566571", "#7b8b96", "#a3b2ba", "#c9d5da", "#e8f0f2"],
    "eye": ["#07080a", "#101216", "#1c2026", "#5a626b"],
    "white": ["#9aa3ab", "#c5ccd1", "#e9eef0", "#ffffff"],
    "mouth": ["#24151a", "#3a2127", "#523038", "#6b424a", "#86585e", "#a07276"],
    "nose": ["#0e0f11", "#181a1e", "#25282d", "#363a41", "#4d535b"],
}
light = {"dir": [-0.4, 1.0, 0.55], "strength": 0.55, "gradient": 0.75, "ao": 1.1, "ao_height": 7.0}
brush = {"flow": "z", "length": 2.6, "width": 1.0, "rough": 0.7, "overshoot": 0.35,
         "textures": {"fluff": "fur", "skin": "leather", "horn": "bone"}}
styles = {
    "fluff": {"ramp": "fluff", "tone": 7.6, "layers": [
        {"id": "shade", "op": "gradient", "axis": "y", "amount": 1.0},
        {"id": "tufts", "op": "patches", "scale": 1.6, "threshold": 0.6, "shift": 0.8}]},
    "fluff_under": {"ramp": "fluff", "tone": 7.0, "layers": [
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4},
        {"id": "tufts", "op": "patches", "scale": 1.4, "threshold": 0.62, "shift": -0.7}]},
    "head": {"ramp": "fluff", "tone": 7.8, "layers": [
        {"id": "shade", "op": "gradient", "axis": "y", "amount": 0.9},
        {"id": "tufts", "op": "patches", "scale": 1.4, "threshold": 0.6, "shift": 0.7}]},
    "muzzle": {"ramp": "fluff", "tone": 6.4, "layers": [{"id": "dusk", "op": "gradient", "axis": "z", "amount": -0.8}],
               "stamps": [{"faces": ["front"], "at": "center", "art": ["d.d..d.d", ".d....d."], "key": {"d": "skin:2"}}]},
    "nose": {"ramp": "nose", "tone": 1.6, "stamps": [
        {"face": "front", "at": "center", "art": ["n..n"], "key": {"n": "nose:0"}},
        {"face": "front", "at": "top-left", "art": [".h"], "key": {"h": "nose:4"}}]},
    "flipper": {"ramp": "skin", "tone": 4.2, "layers": [
        {"id": "toes", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.25, "shift": -0.9, "wobble": 0.1,
         "faces": ["front", "back", "bottom"]}]},
    # pups have big dark eyes; still natural: one catchlight, a lighter lower rim
    "eye": {"ramp": "eye", "tone": 0.5, "light": 0, "brush": {"off": True}, "stamps": [
        {"face": "front", "at": "top-left", "art": ["hh..", "h...", "....", "..bb"], "key": {"h": "white:3", "b": "eye:3"}}]},
    "horn": {"ramp": "horn", "tone": 4.0, "layers": [{"id": "tip", "op": "gradient", "axis": "y", "amount": -1.0}]},
    "fluff_tuft": {"ramp": "fluff", "tone": 7.0, "layers": [
        {"id": "strands", "op": "drip", "ramp": "fluff", "tone": 8.8, "depth": 1.2, "length": 3.0, "width": 0.6, "scale": 1.6,
         "faces": ["sides", "front", "back"]},
        {"id": "locks", "op": "stripes", "axis": "x", "period": 1.4, "width": 0.3, "shift": -1.2, "wobble": 0.7}]},
    "lid": {"ramp": "fluff", "tone": 5.6},
    "brow": {"ramp": "fluff", "tone": 4.6},
    "whiskers": {"ramp": "fluff", "tone": 7.2, "stamps": [
        {"faces": ["front"], "at": "center", "art": ["d.d.", ".d.d"], "key": {"d": "skin:2"}}]},
    "nostril": {"ramp": "nose", "tone": 0.2, "light": 0, "brush": {"off": True}},
    "mouth": {"ramp": "mouth", "tone": 3.2},
}

BLINK = [[0, [0, 0, 0]], [0.06, [0, -3.2, 0]], [0.14, [0, 0, 0]]]


def blink(at):
    return [[at + k[0], k[1]] for k in BLINK]


anim = {
    "idle": {"length": 4.0, "loop": True, "tracks": [
        {"part": "chest", "channel": "scale", "osc": {"amp": [0.015, 0.03, 0.01], "cycles": 2}},
        {"part": "belly_under", "channel": "scale", "osc": {"amp": [0.04, 0.09, 0.03], "cycles": 2, "phase": 0.12}},
        {"part": "neck", "axis": "y", "keys": [[0, 0], [0.7, 16], [1.6, 16], [2.2, -12], [3.2, -12], [3.8, 0]]},
        {"part": "head", "axis": "z", "keys": [[0, 0], [0.8, 0], [1.05, 16, "out_back"], [1.5, 16], [1.8, 0], [2.6, 0],
                                               [2.85, -12, "out_back"], [3.2, -12], [3.5, 0]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, 0, 0]]] + blink(0.9) + blink(2.4) + blink(2.62)},
        {"part": "brow", "axis": "z", "keys": [[0, 0], [0.9, 0], [1.1, 14], [1.6, 14], [1.8, 0]]},
        {"part": "nostril", "channel": "scale", "osc": {"amp": [0.4, 0.4, 0], "cycles": 2}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 12, "cycles": 2}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 5, "cycles": 1, "phase": 0.25}},
    ]},
    # a wiggly scoot: the whole pup humps along, belly bouncing
    "walk": {"length": 0.7, "loop": True, "tracks": [
        {"part": "chest", "axis": "x", "osc": {"amp": 6, "cycles": 1, "bias": -2}},
        {"part": "belly", "axis": "x", "osc": {"amp": -6, "cycles": 1, "bias": 2}},
        {"part": "chest", "channel": "position", "osc": {"amp": [0, 1.6, 0], "cycles": 1, "phase": 0.25, "shape": "bounce",
                                                         "bias": [0, 0.5, 0]}},
        {"part": "chest", "axis": "z", "osc": {"amp": 5, "cycles": 1, "phase": 0.1}},
        {"part": "belly_under", "channel": "scale", "osc": {"amp": [0.06, -0.1, 0.04], "cycles": 2, "phase": 0.18}},
        {"part": "neck", "axis": "x", "osc": {"amp": -7, "cycles": 1, "phase": 0.12}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 14, "cycles": 1, "bias": 2}},
        {"part": "palm", "axis": "x", "osc": {"amp": -12, "cycles": 1}},
        {"parts": ["hips", "tail"], "wave": {"axis": "x", "amp": 4, "cycles": 1, "lag": 0.15, "bias": 2}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 14, "cycles": 2}},
    ]},
    "swim": {"length": 1.6, "loop": True, "tracks": [
        {"part": "chest", "channel": "position", "osc": {"amp": [0, 0.6, 0], "cycles": 1, "bias": [0, 6, 0]}},
        {"part": "chest", "axis": "z", "osc": {"amp": 8, "cycles": 1}},
        {"parts": ["belly", "hips", "tail"], "wave": {"axis": "y", "amp": 10, "cycles": 1, "lag": 0.16, "growth": 1.4}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 26, "cycles": 1, "phase": 0.5}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 10, "cycles": 1, "bias": 50}},
        {"part": "neck", "axis": "y", "osc": {"amp": -5, "cycles": 1}},
    ]},
    "happy": {"length": 1.4, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.2, -16, "out_back"], [1.1, -12], [1.4, 0, "smooth"]]},
        {"part": "head", "axis": "z", "keys": [[0, 0], [0.25, 12, "out_back"], [1.1, 10], [1.4, 0]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.2, 16], [0.35, 0], [0.5, 16], [0.65, 0]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, 0, 0]], [0.15, [0, -1.8, 0]], [1.2, [0, -1.8, 0]], [1.4, [0, 0, 0]]]},
        {"part": "chest", "channel": "position", "keys": [[0, [0, 0, 0]], [0.3, [0, 2.4, 0], "out"], [0.5, [0, 0, 0], "in"],
                                                          [0.7, [0, 1.6, 0], "out"], [0.9, [0, 0, 0], "in"], [1.4, [0, 0, 0]]]},
        {"part": "belly_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.5, [0.12, -0.2, 0.07]], [0.65, [-0.04, 0.08, 0]],
                                                              [0.9, [0.1, -0.16, 0.06]], [1.4, [0, 0, 0], "elastic"]]},
        {"part": "fluke", "axis": "y", "keys": [[0, 0], [0.25, 22], [0.45, -22], [0.65, 22], [0.85, -22], [1.05, 0]]},
    ]},
    # a squeaky little bark
    "bark": {"length": 0.7, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.12, -14, "out"], [0.45, -12], [0.7, 0, "smooth"]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.12, 22, "out_back"], [0.3, 4], [0.4, 18, "out"], [0.55, 0]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, 0, 0]], [0.1, [0, 0.6, 0]], [0.5, [0, 0.6, 0]], [0.7, [0, 0, 0]]]},
        {"part": "nostril", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.1, [0.8, 0.8, 0]], [0.7, [0, 0, 0]]]},
    ]},
    "belly_slap": {"length": 1.0, "loop": False, "tracks": [
        {"part": "chest", "axis": "x", "keys": [[0, 0], [0.18, -14, "out_back"], [0.8, -12], [1.0, 0, "smooth"]]},
        {"part": "belly", "axis": "x", "keys": [[0, 0], [0.18, 15, "out_back"], [0.8, 13], [1.0, 0, "smooth"]]},
        {"part": "flipper", "axis": "z", "keys": [[0, 0], [0.15, -40, "out"], [0.27, 26, "in"], [0.39, -32, "out"], [0.51, 26, "in"],
                                                  [0.8, 0, "smooth"]]},
        {"part": "belly_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.27, [0, 0, 0]], [0.3, [0.16, -0.2, 0.08]],
                                                              [0.4, [-0.05, 0.06, 0]], [0.51, [0, 0, 0]], [0.54, [0.16, -0.2, 0.08]],
                                                              [1.0, [0, 0, 0], "elastic"]]},
    ]},
    "tail_slap": {"length": 0.8, "loop": False, "tracks": [
        {"part": "hips", "axis": "x", "keys": [[0, 0], [0.28, 16, "in"], [0.38, 0, "out"], [0.8, 0, "elastic"]]},
        {"part": "tail", "axis": "x", "keys": [[0, 0], [0.28, 22, "in"], [0.38, 0, "out"], [0.8, 0, "elastic"]]},
        {"part": "fluke", "axis": "x", "keys": [[0, 0], [0.28, 18, "in"], [0.38, 2, "out"], [0.8, 0, "elastic"]]},
        {"part": "belly_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.38, [0, 0, 0]], [0.42, [0.12, -0.16, 0.06]],
                                                              [0.8, [0, 0, 0], "elastic"]]},
    ]},
}

spec = {
    "name": "Icebreaker Cub",
    "description": "An Icebreaker cub: a fluffy white seal pup with big dark eyes and a tiny horn bud (Winterworks mod). "
                   "Minecraft pixel units at twice its in-game size, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 900, "colors": 48},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 12},
    "anim_ground_tolerance": 1.25,
    "render": {"background": "#2a2e3a", "hero": [-38, 18], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/icebreaker_cub.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts")
