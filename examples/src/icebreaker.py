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


# ------------------------------------------------------------------ a real seal's build, Minecraft-style
# A long fat torpedo: the spine is a chain of segments (chest -> belly -> waist -> hips -> tail), each a little
# narrower, each hinged at its front so waves can ripple down the body. Big fan-shaped hind flippers, big
# fore-flippers, a rounded head with puffy whisker pads, large dark eyes with lids and brows for expressions.
box("chest", None, [28, 22, 20], [0, 15.4, 6], "seal_back", rot=[-6, 0, 0])
box("chest_under", "chest", [26, 4, 17], [0, -10.6, 0.5], "belly")
box("belly", "chest", [32, 23, 20], [0, -0.6, -8], "seal_back", offset=[0, -0.5, -9], rot=[5, 0, 0])
box("belly_under", "belly", [30, 5, 18], [0, -10.9, -9], "belly")
box("flank", "belly", [3, 16, 18], [16.5, -1, -9], "seal", mirror=True)
box("waist", "belly", [26, 19, 16], [0, -1, -17], "seal", offset=[0, -1.5, -7], rot=[3, 0, 0])
box("waist_under", "waist", [22, 3, 14], [0, -11, -7], "belly")
box("hips", "waist", [19, 14, 13], [0, -1.5, -13], "seal", offset=[0, -1.5, -6], rot=[5, 0, 0])
box("tail", "hips", [12, 8, 10], [0, -2.5, -11], "seal", offset=[0, -0.5, -4.5], rot=[6, 0, 0])
box("fluke", "tail", [9, 2, 18], [3, -2, -8], "flipper", offset=[1.5, 0, -9], rot=[-8, 18, 4], mirror=True)
box("fluke_fan", "fluke", [13, 2, 6], [2.5, 0, -17], "flipper", rot=[0, 14, 0])
box("flipper", "chest", [6, 12, 11], [16, -2.8, 6], "flipper", offset=[1.5, -5.5, 1], rot=[-8, 0, 16], mirror=True)
box("palm", "flipper", [8, 2, 15], [1.0, -11.4, 3], "flipper", rot=[14, 0, -14])
for k, x in enumerate((-2.8, -1.4, 0, 1.4, 2.8)):
    box(f"claw{k}", "palm", [1, 1, 3], [x, 0.2, 8.0], "claw", mirror=True)
# ------------------------------------------------------------------ head
box("neck", "chest", [24, 18, 10], [0, 6, 9], "seal", offset=[0, 1, 4], rot=[-14, 0, 0])
box("head", "neck", [22, 19, 17], [0, 3, 8], "head", offset=[0, 2, 8], rot=[16, 0, 0])
box("crown", "head", [18, 3, 13], [0, 12.5, 7.5], "head")
box("cheek", "head", [2, 12, 12], [11.5, 0, 8], "head", mirror=True)
box("muzzle", "head", [14, 8, 6], [0, -3.5, 16.5], "muzzle", offset=[0, 0, 3])
box("whisker_pad", "muzzle", [8, 7, 6], [4, -0.5, 4], "whiskers", mirror=True)
box("nose", "muzzle", [6, 3, 3], [0, 4, 4.5], "nose")
box("nostril", "nose", [2, 1, 1], [1.5, 0.6, 1.6], "nostril", mirror=True)
box("jaw", "head", [12, 4, 12], [0, -7, 9], "jaw", offset=[0, -1.5, 6], rot=[4, 0, 0])
box("tongue", "jaw", [8, 1, 8], [0, 0.6, 7], "mouth")
box("eye", "head", [4, 3, 1], [6.5, 4.5, 16.6], "eye", mirror=True)
box("lid", "head", [5, 2, 2], [6.5, 6.6, 16.8], "lid", mirror=True)
box("brow", "head", [7, 2, 2], [6.5, 8.2, 16.6], "brow", rot=[0, 0, -8], mirror=True)
# ------------------------------------------------------------------ monster dressing (Monster Hunter style)
# a shaggy mane round the neck and shoulders, a ruff on the chest, a fur fringe down the spine
box("mane", "chest", [32, 10, 13], [0, 8, 7], "fur", rot=[-10, 0, 0])
box("shoulder_fur", "chest", [6, 8, 13], [14, 6.5, 6], "fur_dark", rot=[-6, 0, -14], mirror=True)
box("ruff", "chest", [22, 8, 4], [0, -3, 10.5], "fur_pale", rot=[8, 0, 0])
# shaggy tufts layered round the mane, each tilted its own way so the outline breaks up like fur
for k, (x, y, z, rx, ry, rz, w, h) in enumerate([(-13, 9, 4, -24, 10, 28, 8, 9), (13, 9, 4, -24, -10, -28, 8, 9),
                                                 (-7, 13, 2, -34, 6, 12, 9, 8), (7, 13, 2, -34, -6, -12, 9, 8),
                                                 (0, 14, 0, -40, 0, 0, 10, 8)]):
    box(f"tuft{k}", "chest", [w, h, 6], [x, y, z], "fur_dark", rot=[rx, ry, rz])
box("sideburn", "head", [3, 9, 7], [11.8, -2, 9], "fur_dark", offset=[0, -3, 0], rot=[-10, 0, -18], mirror=True)
box("elbow_tuft", "flipper", [4, 5, 5], [3.6, -2, -3.5], "fur_dark", rot=[24, 0, 12])
# shingled fur plates down the back, each lifted at its rear edge like a pelt
box("shag_chest", "chest", [14, 3, 10], [6.5, 11.4, 1], "fur", rot=[-9, -7, -8], mirror=True)
box("fur_back", "belly", [16, 3, 10], [7.5, 11.6, -4], "fur", rot=[-8, -6, -8], mirror=True)
box("shag_belly", "belly", [15, 3, 10], [7, 11.4, -13], "fur", rot=[-10, -8, -7], mirror=True)
box("fur_waist", "waist", [12, 3, 9], [5.5, 9.2, -4], "fur", rot=[-9, -7, -8], mirror=True)
box("shag_hips", "hips", [9, 3, 8], [4, 7.0, -3], "fur", rot=[-11, -8, -8], mirror=True)
box("tail_fur", "tail", [10, 3, 6], [0, 4.6, -2], "fur_dark", rot=[-14, 0, 0])
# long fur hanging in a fringe along the lower flanks
box("skirt", "belly", [2, 7, 18], [16.6, -6, -9], "fur_dark", rot=[0, 0, 10], mirror=True)
box("chest_skirt", "chest", [2, 6, 10], [14.6, -7, -3], "fur_dark", rot=[0, 0, 10], mirror=True)
box("waist_skirt", "waist", [2, 6, 13], [13.6, -6, -7], "fur_dark", rot=[0, 0, 10], mirror=True)
# ice armour: shards grown out of the back like a glacier's teeth
box("shard0", "fur_back", [4, 10, 4], [-4, 2, 3], "ice_shard", offset=[0, 5, 0], rot=[-22, 18, 14])
box("shard1", "fur_back", [3, 8, 3], [5, 2, -1], "ice_shard", offset=[0, 4, 0], rot=[-28, -24, -12])
box("shard2", "fur_waist", [3, 7, 3], [-2, 1.5, -1], "ice_shard", offset=[0, 3.5, 0], rot=[-34, 10, 10])
box("shard3", "mane", [3, 7, 3], [8, 4, -1], "ice_shard", offset=[0, 3.5, 0], rot=[-30, -30, -20])
box("spur", "flipper", [2, 5, 2], [2.5, 1, -3], "ice_shard", offset=[0, 2.5, 0], rot=[-40, 0, -30])
# great curved ice tusks, a heavy brow ridge, scars
box("tusk", "muzzle", [3, 11, 3], [4.8, -3.5, 4.5], "tusk", offset=[0, -5.5, 0], rot=[-16, 0, 7], mirror=True)
box("tusk_tip", "tusk", [2, 5, 2], [0, -10.5, 0], "tusk", offset=[0, -2.5, 0], rot=[-22, 0, 0])
box("brow_ridge", "head", [20, 3, 4], [0, 8.8, 15.5], "brow")
box("crest", "crown", [10, 4, 9], [0, 2.5, -2], "fur_dark", rot=[-28, 0, 0])
box("crest_b", "crest", [7, 3, 7], [0, 1, -6], "fur_dark", rot=[-14, 0, 0])

# the horn: a massive ice horn, stacked boxes curving up and forward
box("horn", "crown", [7, 7, 7], [0, 1, 3], "horn", offset=[0, 3, 0], rot=[22, 0, 0])
box("horn_1", "horn", [5, 6, 5], [0, 6, 0], "horn", offset=[0, 3, 0], rot=[12, 0, 4])
box("horn_2", "horn_1", [3, 6, 3], [0, 6, 0], "horn", offset=[0, 3, 0], rot=[14, 0, -3])
box("horn_3", "horn_2", [2, 4, 2], [0, 6, 0], "horn", offset=[0, 2, 0], rot=[16, 0, 0])
box("horn_tip", "horn_3", [1, 3, 1], [0, 4, 0], "horn_tip", offset=[0, 1.5, 0], rot=[8, 0, 0])
box("horn_spike", "horn_1", [2, 4, 2], [2.5, 2, 0], "horn", offset=[0, 2, 0], rot=[0, 0, -38], mirror=True)

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
    "white": ["#9aa3ab", "#c5ccd1", "#e9eef0", "#ffffff"],
    "nose": ["#0e0f11", "#17191c", "#22252a", "#2e3237", "#3c4147"],
    "claw": ["#141210", "#201d1a", "#2e2a26", "#3d3833", "#4f4943"],
    "mouth": ["#24151a", "#3a2127", "#523038", "#6b424a", "#86585e", "#a07276"],
}
light = {"dir": [-0.4, 1.0, 0.55], "strength": 0.55, "gradient": 0.7, "ao": 1.1, "ao_height": 9.0}
brush = {"flow": "z", "length": 3.6, "width": 1.2, "rough": 0.45, "overshoot": 0.25,
         "flows": {"horn": "y"}, "textures": {"seal": "fur", "blotch": "fur", "belly": "fur", "horn": "bone"}}

blotches = {"id": "blotches", "op": "spots", "count": 14, "radius": [0.9, 2.4], "ramp": "blotch", "tone": 3.2,
            "faces": ["top", "sides", "back"]}
styles = {
    "seal": {"ramp": "seal", "tone": 6.2, "layers": [
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": -1.3},
        blotches,
        {"id": "pale_side", "op": "gradient", "axis": "y", "amount": -0.6, "faces": ["sides"]}]},
    "seal_back": {"ramp": "seal", "tone": 6.0, "layers": [
        {"id": "scars", "op": "cracks", "scale": 5.0, "width": 0.02, "shift": 1.6, "faces": ["sides"]},
        {"id": "back_dark", "op": "gradient", "axis": "y", "amount": -1.4},
        dict(blotches, count=26)]},
    "head": {"ramp": "seal", "tone": 6.4, "layers": [
        {"id": "scars", "op": "cracks", "scale": 4.0, "width": 0.025, "shift": 1.8, "faces": ["sides", "top"]},
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
        {"face": "front", "at": "top-left", "art": [".h"], "key": {"h": "nose:4"}}]},
    "mouth": {"ramp": "mouth", "tone": 3.2},
    "tusk": {"ramp": "horn", "tone": 8.0, "layers": [{"id": "tip", "op": "gradient", "axis": "y", "amount": -1.0}]},
    "flipper": {"ramp": "seal", "tone": 4.4, "layers": [
        {"id": "toes", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.25, "shift": -1.0, "wobble": 0.1,
         "faces": ["front", "back", "bottom"]},
        {"id": "edge", "op": "gradient", "axis": "y", "amount": -0.8}]},
    "claw": {"ramp": "claw", "tone": 2.4, "layers": [{"id": "tip", "op": "gradient", "axis": "z", "amount": 1.2}]},
    "fur": {"ramp": "seal", "tone": 4.8, "layers": [
        {"id": "frost_tips", "op": "drip", "ramp": "horn", "tone": 7.4, "depth": 0.4, "length": 1.0, "width": 0.45, "scale": 1.4,
         "faces": ["sides", "back"]},
        {"id": "dark_root", "op": "gradient", "axis": "y", "amount": 1.4},
        {"id": "strands", "op": "drip", "ramp": "seal", "tone": 7.4, "depth": 1.6, "length": 4.0, "width": 0.6, "scale": 2.2,
         "faces": ["sides", "front", "back"]},
        {"id": "tufts", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.3, "shift": -1.4, "wobble": 0.6,
         "faces": ["sides", "front", "back"]}]},
    "fur_dark": {"ramp": "seal", "tone": 3.6, "layers": [
        {"id": "frost_tips", "op": "drip", "ramp": "horn", "tone": 7.4, "depth": 0.4, "length": 1.0, "width": 0.45, "scale": 1.4,
         "faces": ["sides", "back"]},
        {"id": "strands", "op": "drip", "ramp": "seal", "tone": 6.4, "depth": 2.0, "length": 4.5, "width": 0.55, "scale": 1.8,
         "faces": ["sides", "front", "back", "top"]},
        {"id": "locks", "op": "stripes", "axis": "x", "period": 1.4, "width": 0.35, "shift": -1.6, "wobble": 0.8}]},
    "fur_pale": {"ramp": "belly", "tone": 6.0, "layers": [
        {"id": "strands", "op": "drip", "ramp": "belly", "tone": 7.6, "depth": 1.2, "length": 3.5, "width": 0.6, "scale": 2.0,
         "faces": ["sides", "front", "back"]},
        {"id": "tufts", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.3, "shift": -1.2, "wobble": 0.6}]},
    "ice_shard": {"ramp": "horn", "tone": 6.6, "rim": {"light_shift": 1.6, "dark_shift": -1.2}, "brush": {"off": True}, "layers": [
        {"id": "base_dark", "op": "gradient", "axis": "y", "amount": 1.6},
        {"id": "facet", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.4, "shift": 1.2, "wobble": 0.2}]},
    "lid": {"ramp": "seal", "tone": 4.2, "layers": [{"id": "lash", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "brow": {"ramp": "seal", "tone": 2.6},
    "nostril": {"ramp": "nose", "tone": 0.2, "light": 0, "brush": {"off": True}},
    # big dark glossy eyes: a cold blue glint low in the iris, one hard catchlight
    "eye": {"ramp": "eye", "tone": 0.5, "light": 0, "brush": {"off": True}, "stamps": [
        {"face": "front", "at": "top-left", "art": ["hh..", "h...", "..bb"], "key": {"h": "white:3", "b": "horn:3"}}]},
    "horn": {"ramp": "horn", "tone": 6.4, "rim": {"light_shift": 1.0, "dark_shift": -0.8}, "layers": [
        {"id": "base_dark", "op": "gradient", "axis": "y", "amount": 1.2},
        {"id": "ridges", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.3, "shift": -1.3, "wobble": 0.35}]},
    "horn_tip": {"ramp": "horn", "tone": 9.0},
}

SPINE = ["belly", "waist", "hips", "tail"]
BLINK = [[0, [0, 0, 0]], [0.06, [0, -2.6, 0]], [0.14, [0, 0, 0]]]


def blink(at):
    return [[at + k[0], k[1]] + k[2:] for k in BLINK]


def keys(*groups):
    out = [[0, [0, 0, 0]]]
    for g in groups:
        out += g
    return out


anim = {
    # breathing, looking around, curious head tilts, blinks, nostrils opening and closing
    "idle": {"length": 5.0, "loop": True, "tracks": [
        {"part": "chest", "channel": "scale", "osc": {"amp": [0.012, 0.025, 0.008], "cycles": 2}},
        {"part": "belly", "channel": "scale", "osc": {"amp": [0.02, 0.03, 0.01], "cycles": 2, "phase": 0.08}},
        {"part": "belly_under", "channel": "scale", "osc": {"amp": [0.03, 0.08, 0.02], "cycles": 2, "phase": 0.14}},
        {"part": "neck", "axis": "y", "keys": [[0, 0], [0.8, 14], [1.8, 14], [2.4, -10], [3.6, -10], [4.4, 0]]},
        {"part": "head", "axis": "z", "keys": [[0, 0], [0.9, 0], [1.2, 12, "out_back"], [1.8, 12], [2.1, 0], [3.0, 0],
                                               [3.3, -9, "out_back"], [3.7, -9], [4.0, 0]]},
        {"part": "head", "axis": "x", "osc": {"amp": 2.5, "cycles": 2, "phase": 0.2}},
        {"part": "lid", "channel": "position", "keys": keys(blink(1.0), blink(2.9), blink(3.15))},
        {"part": "nostril", "channel": "scale", "osc": {"amp": [0.5, 0.5, 0], "cycles": 2, "bias": [0.2, 0.2, 0]}},
        {"part": "brow", "axis": "z", "keys": [[0, 0], [1.1, 0], [1.3, 12], [1.8, 12], [2.0, 0]]},
        {"part": "flipper", "axis": "x", "osc": {"amp": 4, "cycles": 1, "phase": 0.25}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 9, "cycles": 2}},
        {"part": "fluke_fan", "axis": "y", "osc": {"amp": 6, "cycles": 2, "phase": 0.1}},
        {"part": "tail", "axis": "x", "osc": {"amp": 3, "cycles": 1, "bias": 4}},
    ]},
    # the seal galumph: a wave of fat rolls from the chest back to the tail, the fore-flippers heave the front up
    "walk": {"length": 1.0, "loop": True, "tracks": [
        {"part": "chest", "axis": "x", "osc": {"amp": 6, "cycles": 1, "bias": -2}},
        {"part": "belly", "axis": "x", "osc": {"amp": -6, "cycles": 1, "bias": 2}},
        {"part": "chest", "channel": "position", "osc": {"amp": [0, 2.0, 0], "cycles": 1, "phase": 0.25, "shape": "bounce",
                                                         "bias": [0, 0.8, 0]}},
        {"parts": ["waist", "hips", "tail"], "wave": {"axis": "x", "amp": 3, "cycles": 1, "lag": 0.13, "bias": 1.5}},
        {"part": "belly_under", "channel": "scale", "osc": {"amp": [0.08, -0.16, 0.05], "cycles": 2, "phase": 0.2}},
        {"part": "chest_under", "channel": "scale", "osc": {"amp": [0.05, -0.1, 0.03], "cycles": 2, "phase": 0.1}},
        {"part": "neck", "axis": "x", "osc": {"amp": -6, "cycles": 1, "phase": 0.1}},
        {"part": "head", "axis": "x", "osc": {"amp": -4, "cycles": 1, "phase": 0.18}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 16, "cycles": 1, "bias": 2}},
        {"part": "palm", "axis": "x", "osc": {"amp": -14, "cycles": 1}},
        {"part": "fluke", "axis": "x", "osc": {"amp": 8, "cycles": 1, "phase": 0.5, "bias": 6}},
        {"part": "nostril", "channel": "scale", "osc": {"amp": [0.3, 0.3, 0], "cycles": 2}},
    ]},
    # head down, horn levelled, brows knitted, nostrils flared, the whole body pumping
    "charge": {"length": 0.5, "loop": True, "tracks": [
        {"part": "chest", "axis": "x", "osc": {"amp": 7, "cycles": 1, "bias": -3}},
        {"part": "belly", "axis": "x", "osc": {"amp": -7, "cycles": 1, "bias": 3}},
        {"part": "chest", "channel": "position", "osc": {"amp": [0, 2.6, 0], "cycles": 1, "phase": 0.25, "shape": "bounce",
                                                         "bias": [0, 1.0, 0]}},
        {"parts": ["waist", "hips", "tail"], "wave": {"axis": "x", "amp": 4, "cycles": 1, "lag": 0.12, "bias": 2}},
        {"part": "belly_under", "channel": "scale", "osc": {"amp": [0.1, -0.18, 0.06], "cycles": 2, "phase": 0.2,
                                                             "bias": [0, -0.08, 0]}},
        {"part": "neck", "axis": "x", "osc": {"amp": 2, "cycles": 1, "bias": 6}},
        {"part": "head", "axis": "x", "osc": {"amp": 2, "cycles": 1, "phase": 0.15, "bias": 4}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 20, "cycles": 1, "bias": 4}},
        {"part": "palm", "axis": "x", "osc": {"amp": -16, "cycles": 1}},
        {"part": "lid", "channel": "position", "osc": {"amp": [0, 0, 0], "cycles": 1, "bias": [0, -1.0, 0]}},
        {"part": "brow", "axis": "z", "osc": {"amp": 0, "cycles": 1, "bias": -20}},
        {"part": "brow", "channel": "position", "osc": {"amp": [0, 0, 0], "cycles": 1, "bias": [0, -0.8, 0]}},
        {"part": "nostril", "channel": "scale", "osc": {"amp": [0.2, 0.2, 0], "cycles": 2, "bias": [0.6, 0.6, 0]}},
        {"part": "jaw", "axis": "x", "osc": {"amp": 3, "cycles": 2, "bias": 8}},
        {"part": "mane", "channel": "scale", "osc": {"amp": [0.03, 0.06, 0.03], "cycles": 2, "bias": [0.06, 0.16, 0.06]}},
    ]},
    # belly-sliding on ice: flat, fore-flippers swept back, hind flippers up, nose forward
    "slide": {"length": 1.2, "loop": True, "tracks": [
        {"part": "chest", "axis": "x", "osc": {"amp": 1, "cycles": 1, "bias": 4}},
        {"part": "chest", "axis": "z", "osc": {"amp": 2, "cycles": 1}},
        {"parts": SPINE, "wave": {"axis": "y", "amp": 3, "cycles": 1, "lag": 0.15}},
        {"part": "belly_under", "channel": "scale", "osc": {"amp": [0.04, 0, 0], "cycles": 1, "bias": [0.06, -0.25, 0.04]}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 4, "cycles": 2, "bias": 66}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 0, "cycles": 1, "bias": 14}},
        {"part": "palm", "axis": "x", "osc": {"amp": 0, "cycles": 1, "bias": -45}},
        {"part": "neck", "axis": "x", "osc": {"amp": 2, "cycles": 1, "bias": -8}},
        {"part": "fluke", "axis": "x", "osc": {"amp": 3, "cycles": 1, "bias": 16}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 10, "cycles": 2}},
        {"part": "lid", "channel": "position", "osc": {"amp": [0, 0, 0], "cycles": 1, "bias": [0, -0.8, 0]}},
    ]},
    # true seals swim with their hips: the back half sweeps side to side, the hind flippers scull like a fan,
    # fore-flippers tucked, a slow roll, the head steady
    "swim": {"length": 2.0, "loop": True, "tracks": [
        {"part": "chest", "channel": "position", "osc": {"amp": [0, 0.8, 0], "cycles": 1, "bias": [0, 12, 0]}},
        {"part": "chest", "axis": "x", "osc": {"amp": 3, "cycles": 2, "bias": 8}},
        {"part": "chest", "axis": "z", "osc": {"amp": 6, "cycles": 1, "phase": 0.1}},
        {"parts": ["waist", "hips", "tail"], "wave": {"axis": "y", "amp": 11, "cycles": 1, "lag": 0.15, "growth": 1.45}},
        {"part": "belly", "axis": "y", "osc": {"amp": 4, "cycles": 1}},
        {"part": "fluke", "axis": "y", "osc": {"amp": 24, "cycles": 1, "phase": 0.55}},
        {"part": "fluke_fan", "axis": "y", "osc": {"amp": 14, "cycles": 1, "phase": 0.65}},
        {"part": "neck", "axis": "y", "osc": {"amp": -5, "cycles": 1, "phase": 0.05}},
        {"part": "head", "axis": "y", "osc": {"amp": -3, "cycles": 1, "phase": 0.1}},
        {"part": "flipper", "axis": "x", "osc": {"amp": 8, "cycles": 1, "bias": 55, "phase": 0.25}},
        {"part": "flipper", "axis": "z", "osc": {"amp": 6, "cycles": 1, "bias": 28}},
        {"part": "belly_under", "channel": "scale", "osc": {"amp": [0.04, 0.07, 0.02], "cycles": 2, "phase": 0.2}},
        {"part": "nostril", "channel": "scale", "osc": {"amp": [0, 0, 0], "cycles": 1, "bias": [-0.6, -0.6, 0]}},
    ]},
    # one horn jab: wind up, thrust, wobble back; brows knitted
    "ram": {"length": 0.8, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.18, -18, "out"], [0.3, 6, "in"], [0.45, 3], [0.8, 0, "elastic"]]},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.18, -10, "out"], [0.3, 4, "in"], [0.45, 2], [0.8, 0, "elastic"]]},
        {"part": "chest", "channel": "position", "keys": [[0, [0, 0, 0]], [0.18, [0, 0.6, -2], "out"],
                                                          [0.3, [0, 1.2, 4], "in"], [0.8, [0, 0, 0], "elastic"]]},
        {"part": "belly_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [0, 0, 0]], [0.38, [0.14, -0.22, 0.08]],
                                                              [0.8, [0, 0, 0], "elastic"]]},
        {"part": "brow", "axis": "z", "keys": [[0, -20], [0.8, -20]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, -1, 0]], [0.8, [0, -1, 0]]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.3, 16, "out"], [0.8, 0]]},
    ]},
    # fed a fish: happy squint, raised brows, chomp chomp, flipper claps, belly bounce, hind flippers wag
    "happy": {"length": 1.6, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.2, -14, "out_back"], [1.3, -10], [1.6, 0, "smooth"]]},
        {"part": "head", "axis": "z", "keys": [[0, 0], [0.3, 10, "out_back"], [1.2, 8], [1.5, 0]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.25, 18], [0.4, 0], [0.55, 18], [0.7, 0], [0.85, 16], [1.0, 0]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, 0, 0]], [0.15, [0, -1.6, 0]], [1.4, [0, -1.6, 0]], [1.6, [0, 0, 0]]]},
        {"part": "brow", "channel": "position", "keys": [[0, [0, 0, 0]], [0.15, [0, 0.8, 0]], [1.4, [0, 0.8, 0]], [1.6, [0, 0, 0]]]},
        {"part": "brow", "axis": "z", "keys": [[0, 0], [0.15, 14], [1.4, 14], [1.6, 0]]},
        {"part": "flipper", "axis": "z", "raw": True, "keys": [[0, 0], [0.4, 0], [0.5, 30, "out"], [0.6, 0], [0.7, 30, "out"],
                                                             [0.8, 0], [0.9, 30, "out"], [1.0, 0]]},
        {"part": "chest", "channel": "position", "keys": [[0, [0, 0, 0]], [0.4, [0, 0, 0]], [0.55, [0, 2.5, 0], "out"],
                                                          [0.75, [0, 0, 0], "in"], [0.95, [0, 1.6, 0], "out"],
                                                          [1.15, [0, 0, 0], "in"], [1.6, [0, 0, 0]]]},
        {"part": "belly_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.75, [0.1, -0.18, 0.06]], [0.9, [-0.04, 0.08, 0]],
                                                              [1.15, [0.08, -0.14, 0.05]], [1.6, [0, 0, 0], "elastic"]]},
        {"part": "fluke", "axis": "y", "keys": [[0, 0], [0.3, 20], [0.5, -20], [0.7, 20], [0.9, -20], [1.1, 0]]},
    ]},
    # a bark: head thrown up, mouth wide, nostrils flared, eyes wide
    "bark": {"length": 0.9, "loop": False, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.15, -16, "out"], [0.6, -14], [0.9, 0, "smooth"]]},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.15, -8, "out"], [0.6, -6], [0.9, 0]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.15, 26, "out_back"], [0.3, 6], [0.42, 24, "out"], [0.6, 4], [0.9, 0]]},
        {"part": "nostril", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.12, [0.8, 0.8, 0]], [0.6, [0.6, 0.6, 0]], [0.9, [0, 0, 0]]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, 0, 0]], [0.12, [0, 0.6, 0]], [0.6, [0, 0.6, 0]], [0.9, [0, 0, 0]]]},
        {"part": "brow", "channel": "position", "keys": [[0, [0, 0, 0]], [0.12, [0, 0.8, 0]], [0.6, [0, 0.8, 0]], [0.9, [0, 0, 0]]]},
        {"part": "chest_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.15, [0.06, 0.1, 0.04]], [0.42, [0.06, 0.1, 0.04]],
                                                              [0.9, [0, 0, 0], "elastic"]]},
        {"part": "mane", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.12, [0.08, 0.2, 0.08], "out_back"], [0.6, [0.06, 0.15, 0.06]],
                                                       [0.9, [0, 0, 0], "elastic"]]},
    ]},
    # a threat display: rears up and drums both fore-flippers on its big belly three times, brows down
    "belly_slap": {"length": 1.2, "loop": False, "tracks": [
        {"part": "chest", "axis": "x", "keys": [[0, 0], [0.2, -18, "out_back"], [0.95, -16], [1.2, 0, "smooth"]]},
        {"part": "chest", "channel": "position", "keys": [[0, [0, 0, 0]], [0.2, [0, 1.5, -1], "out"], [0.95, [0, 1.2, -1]],
                                                          [1.2, [0, 0, 0], "smooth"]]},
        {"part": "belly", "axis": "x", "keys": [[0, 0], [0.2, 21, "out_back"], [0.95, 18], [1.2, 0, "smooth"]]},
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.2, -8, "out"], [0.95, -6], [1.2, 0]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.25, 14, "out"], [0.9, 10], [1.1, 0]]},
        {"part": "brow", "axis": "z", "keys": [[0, 0], [0.2, -18], [1.0, -18], [1.2, 0]]},
        {"part": "mane", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.2, [0.08, 0.2, 0.08], "out_back"], [1.0, [0.06, 0.16, 0.06]],
                                                       [1.2, [0, 0, 0], "elastic"]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, 0, 0]], [0.2, [0, -0.9, 0]], [1.0, [0, -0.9, 0]], [1.2, [0, 0, 0]]]},
        {"part": "flipper", "axis": "z", "keys": [[0, 0], [0.18, -45, "out"], [0.3, 28, "in"], [0.42, -35, "out"], [0.54, 28, "in"],
                                                  [0.66, -35, "out"], [0.78, 30, "in"], [1.1, 0, "smooth"]]},
        {"part": "flipper", "axis": "x", "keys": [[0, 0], [0.18, -30, "out"], [0.9, -25], [1.1, 0]]},
        {"part": "belly_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [0, 0, 0]], [0.33, [0.16, -0.2, 0.08]],
                                                              [0.42, [-0.05, 0.06, 0]], [0.54, [0, 0, 0]], [0.57, [0.16, -0.2, 0.08]],
                                                              [0.66, [-0.05, 0.06, 0]], [0.78, [0, 0, 0]], [0.81, [0.2, -0.24, 0.1]],
                                                              [1.2, [0, 0, 0], "elastic"]]},
    ]},
    # hind flippers swing up and slam down: a splash in water, a thump of snow on land
    "tail_slap": {"length": 1.0, "loop": False, "tracks": [
        {"part": "hips", "axis": "x", "keys": [[0, 0], [0.35, 16, "in"], [0.48, -1, "out"], [1.0, 0, "elastic"]]},
        {"part": "tail", "axis": "x", "keys": [[0, 0], [0.35, 24, "in"], [0.48, 0, "out"], [1.0, 0, "elastic"]]},
        {"part": "fluke", "axis": "x", "keys": [[0, 0], [0.35, 20, "in"], [0.48, 2, "out"], [1.0, 0, "elastic"]]},
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.35, -6], [0.5, 4], [1.0, 0]]},
        {"part": "lid", "channel": "position", "keys": [[0, [0, 0, 0]], [0.45, [0, 0, 0]], [0.5, [0, -2.2, 0]], [0.62, [0, 0, 0]]]},
        {"part": "belly_under", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.48, [0, 0, 0]], [0.52, [0.14, -0.18, 0.08]],
                                                              [1.0, [0, 0, 0], "elastic"]]},
    ]},
}

spec = {
    "name": "Icebreaker",
    "description": "A huge fat grey seal with an enormous head, short flippers and a massive old ice horn (Winterworks mod mob), "
                   "painted naturalistically: muted greys, dark blotches, fur strokes, small dark eyes. "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 1800, "colors": 72},
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

# ------------------------------------------------------------------ coat variants
# Same geometry (so the same box-UV layout), different coats. The mod picks one per seal at spawn; cubs inherit.
# Each overrides the fur ramps and the spot layers: count, size, darker or paler, plain blotches or ring spots.
VARIANTS = {
    "grey": {},
    "harbor": {   # silver with dense small dark speckles all over, like a harbour seal
        "seal": ["#1c1f23", "#2a2e33", "#3a3f45", "#4c5258", "#60666b", "#757a7e", "#8b8f91", "#a1a4a4", "#b7b9b7",
                 "#cbccc9", "#dcdcd8", "#ebebe7"],
        "blotch": ["#16181b", "#202327", "#2b2f34", "#373c41", "#444a50", "#525a60"],
        "spots": {"count": 70, "radius": [0.45, 1.1], "tone": 2.4}, "back_spots": 120, "belly_spots": True},
    "leopard": {  # slate back, pale silver throat and flanks heavily spotted with black
        "seal": ["#121519", "#1a1e24", "#232930", "#2e353d", "#3a424b", "#48515a", "#58616a", "#6b737b", "#80878d",
                 "#979ca0", "#aeb2b4", "#c6c8c8"],
        "belly": ["#4a4d52", "#5d6166", "#71757a", "#868a8e", "#9b9ea1", "#b0b3b4", "#c5c7c6", "#d8d9d7", "#e7e8e5",
                  "#f2f2ef"],
        "blotch": ["#0b0c0e", "#121418", "#1a1d22", "#23272d", "#2d3238", "#383e45"],
        "spots": {"count": 22, "radius": [0.8, 1.9], "tone": 1.2}, "back_spots": 34, "belly_spots": True,
        "tone": 4.6},
    "ringed": {   # dark charcoal coat covered in pale rings, like a ringed seal
        "seal": ["#0e0f12", "#16181c", "#1f2226", "#292d32", "#34393e", "#41464b", "#4f5459", "#5e6368", "#6f7478",
                 "#828689", "#979a9c", "#adafaf"],
        "blotch": ["#59606a", "#6c737c", "#80878f", "#959ba2", "#a9aeb3", "#bdc1c4"],
        "spots": {"count": 18, "radius": [1.2, 2.2], "tone": 3.0, "ring": 0.6, "gaps": 0.25}, "back_spots": 28,
        "tone": 4.8},
    "brown": {    # warm umber with dark chocolate blotches and a sandy belly
        "seal": ["#1b130e", "#281c14", "#36261b", "#463224", "#57402e", "#6a4f39", "#7e6046", "#937356", "#a88767",
                 "#bc9c7b", "#cfb291", "#e0c8a8"],
        "belly": ["#4a3c2c", "#5e4d39", "#735f47", "#887256", "#9d8666", "#b19a78", "#c4ae8b", "#d5c19e", "#e3d2b1",
                  "#efe1c4"],
        "blotch": ["#120c08", "#1b130d", "#251a12", "#302218", "#3c2b1f", "#493427"],
        "spots": {"count": 10, "radius": [1.4, 3.0], "tone": 2.6}, "back_spots": 18},
    "frost": {    # nearly white with blue-grey dapples, an old arctic bull
        "seal": ["#3c4550", "#4f5966", "#636e7c", "#788492", "#8e9aa7", "#a4afba", "#b9c3cc", "#cbd3da", "#dbe1e6",
                 "#e8ecef", "#f2f4f6", "#f9fafb"],
        "blotch": ["#56606c", "#66717e", "#788391", "#8a95a2", "#9ca6b2", "#aeb7c1"],
        "spots": {"count": 16, "radius": [1.0, 2.4], "tone": 2.8}, "back_spots": 26},
}


def variant_spec(name):
    import copy
    v = VARIANTS[name]
    out = copy.deepcopy(spec)
    out["name"] = "Icebreaker " + name.title()
    for k in ("seal", "blotch", "belly"):
        if k in v:
            out["palette"]["ramps"][k] = v[k]
    for st_name, st in out["styles"].items():
        if "tone" in v and st.get("ramp") == "seal" and st_name in ("seal", "seal_back", "head"):
            st["tone"] = v["tone"] + (0.2 if st_name == "head" else 0)
        for layer in st.get("layers", []):
            if layer.get("id") == "blotches" and "spots" in v:
                layer.update(v["spots"])
                if st_name == "seal_back":
                    layer["count"] = v.get("back_spots", layer["count"])
                if st_name == "head":
                    layer["count"] = max(4, v["spots"]["count"] // 3)
        if st_name == "belly" and v.get("belly_spots"):
            st["layers"].append({"id": "belly_spots", "op": "spots", "count": v["spots"]["count"] // 2,
                                 "radius": v["spots"]["radius"], "ramp": "blotch", "tone": v["spots"]["tone"],
                                 "faces": ["sides", "front", "back"]})
    return out


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/icebreaker.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(P), "parts")
    import os
    vdir = os.path.join(os.path.dirname(out) or ".", "variants")
    os.makedirs(vdir, exist_ok=True)
    for name in VARIANTS:
        with open(os.path.join(vdir, f"icebreaker_{name}.json"), "w") as fh:
            json.dump(variant_spec(name), fh, indent=1)
    print("variants:", ", ".join(VARIANTS))
