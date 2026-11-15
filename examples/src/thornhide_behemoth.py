"""Builds examples/thornhide_behemoth.json (an original blocky monster):  python examples/src/thornhide_behemoth.py examples/thornhide_behemoth.json"""
import json, sys

P = []
def part(id, **kw):
    d = {"id": id}; d.update(kw); P.append(d); return d

def box(id, parent, size, pivot, style, offset=None, rot=None, **kw):
    d = dict(shape="box", size=size, pivot=pivot, style=style)
    if parent: d["parent"] = parent
    if offset: d["offset"] = offset
    if rot: d["rotation"] = rot
    d.update(kw)
    return part(id, **d)

def taper(id, parent, size, pivot, style, fs=(0.2, 0.2), offset=None, rot=None, **kw):
    d = dict(shape="taper", size=size, pivot=pivot, style=style, front_scale=list(fs))
    if parent: d["parent"] = parent
    if offset: d["offset"] = offset
    if rot: d["rotation"] = rot
    d.update(kw)
    return part(id, **d)

# ---------------------------------------------------------------- torso
box("body", None, [22, 18, 22], [0, 26, -8], "mossy_hide")
box("chest", "body", [26, 22, 18], [0, 2, 12], "mossy_hide")
box("belly", "body", [18, 3, 30], [0, -9.5, 6], "belly")
box("hump", "chest", [22, 7, 15], [0, 13.5, -2.0], "mossy_hide", rot=[-6, 0, 0])
box("mantle", "hump", [23.5, 4, 16.5], [0, 2.8, 0], "moss_slab")
box("collar", "chest", [27.4, 4, 19], [0, 9.0, 0], "moss_slab")
box("rump_moss", "body", [24, 4, 21], [0, 8.2, -0.5], "moss_slab")
box("shoulder", "chest", [2.4, 9, 11], [13.2, 1, 1], "stone", rot=[0, 0, -6], mirror=True)
box("shoulder_b", "shoulder", [2.0, 6, 7], [0.4, -6.5, 0.5], "stone", rot=[0, 0, 8])
# ---------------------------------------------------------------- neck + head
box("neck", "chest", [16, 15, 10], [0, 4, 9], "mossy_hide", offset=[0, 0, 4], rot=[12, 0, 0])
box("neck_moss", "neck", [17, 3.5, 11], [0, 7.4, 4], "moss_slab")
box("head", "neck", [17, 15, 14], [0, 0, 8.5], "mossy_hide", offset=[0, 1, 6], rot=[6, 0, 0])
box("head_moss", "head", [18, 3, 9], [0, 9, 2.5], "moss_slab")
box("snout", "head", [13, 9, 10], [0, -2.0, 13], "hide", offset=[0, 0, 5])
box("lip", "snout", [13.4, 2.4, 10.4], [0, -4.0, 5.0], "hide_dark")
taper("nose_horn", "snout", [5, 5, 9], [0, 4.5, 6.5], "bone", fs=(0.12, 0.12), offset=[0, 0, 4.5], rot=[-62, 0, 0])
taper("nose_horn2", "snout", [3.6, 3.6, 5.5], [0, 4.5, 1.5], "bone", fs=(0.15, 0.15), offset=[0, 0, 2.75], rot=[-72, 0, 0])
box("jaw", "head", [12, 4, 17], [0, -6.5, 3], "hide_dark", offset=[0, -2, 8.5], rot=[9, 0, 0])
box("mouth", "jaw", [10, 0.6, 14], [0, 0.2, 9], "mouth")
taper("tusk", "jaw", [2.8, 2.8, 7], [5.2, 0.5, 15], "bone", fs=(0.7, 0.7), offset=[0, 0, 3.5], rot=[-70, 22, 0], mirror=True)
taper("tusk_tip", "tusk", [2.0, 2.0, 6], [0, 0, 7], "bone", fs=(0.1, 0.1), offset=[0, 0, 3], rot=[-30, 0, 0], hide=["front"])
for k, (x, z, h) in enumerate([(3.2, 13.5, 2.6), (1.2, 15.2, 2.0), (3.8, 10.5, 2.2), (3.6, 7.5, 1.8)]):
    box(f"tooth{k}", "jaw", [1.4, h, 1.4], [x, 0.2 + h / 2, z], "bone", mirror=True)
for k, (x, z, h) in enumerate([(4.8, 8.5, 2.6), (2.0, 9.2, 2.2), (5.2, 4.5, 2.0)]):
    box(f"fang{k}", "snout", [1.4, h, 1.4], [x, -5.2 - h / 2, z], "bone", mirror=True)
box("socket", "head", [0.8, 3.6, 4.6], [8.5, 3.0, 9.6], "socket", mirror=True)
box("eye", "socket", [0.5, 2.6, 3.4], [0.35, 0.1, 0.1], "glow")
box("brow", "head", [5.5, 3.2, 8], [6.6, 6.2, 9.5], "stone", rot=[8, 0, -14], mirror=True)
box("ear", "head", [6, 1.6, 4.5], [8.0, 5.0, 2.5], "hide", offset=[3, 0, 0], rot=[0, -10, -32], mirror=True)
taper("horn", "head", [3.4, 3.4, 9], [6.0, 8.0, 3.5], "bone", fs=(0.25, 0.25), offset=[0, 0, 4.5], rot=[-35, 32, 0], mirror=True)
taper("horn_tip", "horn", [2.4, 2.4, 6], [0, 0, 9], "bone", fs=(0.1, 0.1), offset=[0, 0, 3], rot=[30, 0, 0], hide=["front"])

# ---------------------------------------------------------------- legs
def leg(prefix, parent, pivot, upper, lower, foot, claws, plate=None):
    box(f"{prefix}_upper", parent, upper, pivot, "leg", offset=[0, -upper[1] / 2 + 1.5, 0], mirror=True)
    box(f"{prefix}_lower", f"{prefix}_upper", lower, [0, -upper[1] + 2.0, 0.3], "leg",
        offset=[0, -lower[1] / 2 + 0.5, 0])
    box(f"{prefix}_foot", f"{prefix}_lower", foot, [0, -lower[1] + 1.5, 0.6], "hoof", offset=[0, -1.5, 1.0],
        orient="world", snap_ground=True)
    for k, x in enumerate(claws):
        taper(f"{prefix}_claw{k}", f"{prefix}_foot", [1.8, 1.6, 3.0], [x, -1.8, foot[2] / 2 + 1.0], "bone",
              fs=(0.25, 0.25), offset=[0, 0, 1.2], rot=[18, 0, 0])
    if plate:
        box(f"{prefix}_plate", f"{prefix}_upper", plate, [0, -upper[1] + 4.5, upper[2] / 2 + 0.6], "stone",
            rot=[-8, 0, 0])

leg("fl", "chest", [9.6, -6, 4], [9, 13, 10], [8, 10, 8.5], [10, 3, 11], [-3.2, 0, 3.2], plate=[6.5, 6, 1.6])
leg("bl", "body", [9.2, -4, -5], [9, 14, 11], [7.5, 10, 8], [9.5, 3, 10], [-2.8, 0.2, 3.0])

# ---------------------------------------------------------------- tail
box("tail_0", "body", [11, 10, 10], [0, 3, -10.5], "mossy_hide", offset=[0, 0, -5], rot=[-14, 0, 0])
box("tail_1", "tail_0", [8, 7.5, 9], [0, 0, -10], "mossy_hide", offset=[0, 0, -4.5], rot=[-10, 0, 0])
box("tail_2", "tail_1", [6, 5.5, 8], [0, 0, -9], "hide", offset=[0, 0, -4], rot=[-8, 0, 0])
box("tail_3", "tail_2", [4.4, 4, 6], [0, 0, -8], "hide", offset=[0, 0, -3], rot=[-6, 0, 0])
for k, (seg, h, z) in enumerate([("tail_0", 5.0, -5), ("tail_1", 3.75, -4.5), ("tail_2", 2.75, -4)]):
    box(f"tail_plate{k}", seg, [1.6, 4.0 - k * 0.6, 5.0 - k], [0, h + 1.4 - k * 0.3, z], "stone", rot=[-12, 0, 0])

# ---------------------------------------------------------------- crystals (point along local +Z, pitched up)
def cluster(name, parent, at, crystals):
    for k, (dx, dz, w, L, pitch, yaw) in enumerate(crystals):
        taper(f"{name}{k}", parent, [w, w, L], [at[0] + dx, at[1], at[2] + dz], "crystal", fs=(0.3, 0.3),
              offset=[0, 0, L / 2 - 0.6], rot=[-90 + pitch, yaw, 45])

cluster("cry_a", "mantle", [-3.5, 1.6, 1.0], [(0, 0, 5.0, 15, 6, 0), (3.6, 2.0, 3.6, 10, 22, 30), (-3.2, -1.6, 3.4, 9, -18, -40),
                                            (1.0, -3.4, 2.8, 7, -26, 10), (-2.0, 3.0, 2.6, 6.5, 28, -20)])
cluster("cry_b", "rump_moss", [5.0, 1.6, -3.0], [(0, 0, 4.2, 11, -6, 10), (-3.0, 1.6, 3.0, 8, 20, -30), (2.4, -2.4, 2.8, 7, -24, 40),
                                               (0.0, 3.2, 2.2, 5, 30, 0)])
cluster("cry_c", "collar", [8.5, 1.6, -6.0], [(0, 0, 3.0, 8, -10, 20), (2.4, 1.0, 2.2, 5.5, 20, 50), (-1.6, 1.8, 2.0, 4.5, 26, -20)])
cluster("cry_t", "tail_3", [0, 1.2, -3.5], [(0, 0, 2.4, 6.5, -50, 0), (1.4, 0.8, 1.8, 4.5, -30, 30), (-1.3, 0.6, 1.6, 4.0, -36, -30)])

# ---------------------------------------------------------------- back stones + mushrooms
box("back_stone0", "rump_moss", [6, 5, 2.4], [-5.5, 3.6, -5.5], "stone", rot=[-10, 25, 8])
box("back_stone1", "mantle", [5, 4.5, 2.2], [7.0, 3.0, 3.5], "stone", rot=[12, -30, -10])
box("back_stone2", "rump_moss", [4.5, 3.6, 2.0], [-6.0, 3.0, 5.0], "stone", rot=[8, 50, -6])
for k, (par, x, y, z, s) in enumerate([("rump_moss", 1.0, 2.0, 7.0, 1.0), ("rump_moss", 3.0, 2.0, 8.6, 0.7),
                                       ("collar", -10.5, 2.0, -6.0, 0.9), ("collar", -12.0, 2.0, -4.2, 0.6),
                                       ("head_moss", 5.5, 1.5, -2.0, 0.6)]):
    box(f"stem{k}", par, [0.9 * s, 2.4 * s, 0.9 * s], [x, y + 1.2 * s, z], "shroom_stem")
    box(f"cap{k}", f"stem{k}", [3.2 * s, 1.3 * s, 3.2 * s], [0, 1.6 * s, 0], "shroom")

ramps = {
    "hide": ["#140c18", "#24152a", "#36203a", "#4a2c46", "#5f3b50", "#784d58", "#966660", "#b68670", "#d6ab8a"],
    "belly": ["#1b1216", "#2e2026", "#443239", "#5c484b", "#78625f", "#977e76", "#b89f90", "#d8c3ae"],
    "moss": ["#0b1610", "#13261a", "#1c3a22", "#284f29", "#36672e", "#4a8034", "#64983c", "#86b148", "#acc95c", "#d4e280"],
    "stone": ["#121319", "#1f222b", "#30343f", "#454a55", "#5e636c", "#7a7f86", "#999da1", "#babcbd", "#dcdcd8"],
    "bone": ["#24180f", "#3e2b1c", "#5e432b", "#83613d", "#a88352", "#c8a46c", "#e1c58f", "#f2e2b9", "#fff8e4"],
    "crystal": ["#061a26", "#0a2f40", "#0f4a5c", "#156a78", "#1e8e93", "#2fb2a8", "#5ad2bc", "#9aead0", "#d8fbec", "#ffffff"],
    "socket_r": ["#0a0408", "#1a0a12"],
    "glow": ["#3a1a04", "#7a3a06", "#c46a0c", "#f0a020", "#ffd24a", "#fff09a", "#ffffff"],
    "mouth": ["#16050d", "#2e0a18", "#4e1426", "#742237", "#9c364a", "#c2566a"],
    "hoof": ["#0d0a0b", "#1a1515", "#282120", "#39302c", "#4d423b", "#655850"],
    "shroom": ["#1e0a2c", "#3a1250", "#5e1f7a", "#8a32a2", "#b54ec4", "#da78dc", "#f6b0ee", "#fff0fb"],
    "stem": ["#2a2226", "#4a3e3e", "#706259", "#9a8a78", "#c4b49c", "#e8dcc4"],
}

hide_scales = {"id": "scales", "op": "scales", "along": "z", "size": [3.2, 2.2], "gradient": 1.6, "rim": -1.2,
               "shadow": -1.6, "jitter": 0.7, "faces": ["sides", "front", "back"]}
belly_plates = {"id": "belly_plates", "op": "scales", "shape": "square", "along": "z", "size": [4.5, 3.2], "ramp": "belly",
                "tone": 3.6, "gap": 1.0, "highlight": 0.7, "shadow": -1.6, "gradient": 0.6, "jitter": 0.5, "faces": ["bottom"]}
photo_hide = {"id": "photo_hide", "op": "photo", "src": "assets/photos/brown_leather", "scale": 9.0, "amount": 0.7,
              "ramps": ["hide", "belly"]}
photo_moss = {"id": "photo_moss", "op": "photo", "src": "assets/photos/forest_leaves_02", "scale": 7.0, "amount": 0.9,
              "ramps": ["moss"]}
photo_rock = {"id": "photo_rock", "op": "photo", "src": "assets/photos/rock_face_03", "scale": 10.0, "amount": 1.1,
              "ramps": ["stone"]}
moss_drip = {"id": "moss", "op": "drip", "ramp": "moss", "tone": 5.6, "depth": 2.2, "length": 5.0, "width": 0.55,
             "scale": 3.0, "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "hide", "shadow_tone": 1.2}}
styles = {
    "leg": {"ramp": "hide", "tone": 4.4, "brush": {"flow": "horizontal", "rough": 0.6}, "layers": [dict(hide_scales, along="x", size=[2.4, 1.6]), photo_hide,
                                                                    {"id": "mottle", "op": "noise", "scale": 3.0, "amount": 0.45}]},
    "mossy_leg": {"ramp": "hide", "tone": 4.5, "brush": {"flow": "y", "rough": 0.6}, "layers": [dict(hide_scales, size=[2.4, 1.6]),
                                                                    {"id": "mottle", "op": "noise", "scale": 3.0, "amount": 0.45},
                                                                    dict(moss_drip, depth=1.4, length=4.0)]},
    "hide": {"ramp": "hide", "tone": 4.6, "brush": {"rough": 0.55}, "layers": [hide_scales, photo_hide, {"id": "mottle", "op": "noise", "scale": 3.0, "amount": 0.45},
                                                  belly_plates]},
    "hide_dark": {"ramp": "hide", "tone": 3.6, "layers": [dict(hide_scales, size=[2.0, 1.4]),
                                                       {"id": "mottle", "op": "noise", "scale": 2.0, "amount": 0.4}]},
    "mossy_hide": {"ramp": "hide", "tone": 4.6, "brush": {"rough": 0.55}, "layers": [hide_scales, photo_hide, {"id": "mottle", "op": "noise", "scale": 3.0, "amount": 0.45},
                                                        belly_plates, moss_drip, photo_moss,
                                                        {"id": "clumps", "op": "noise", "scale": 1.6, "amount": 0.7}]},
    "belly": {"ramp": "belly", "tone": 3.6, "layers": [dict(belly_plates, faces=None)]},
    "moss_slab": {"ramp": "moss", "tone": 5.4, "layers": [
        {"id": "clumps", "op": "patches", "scale": 2.2, "threshold": 0.58, "shift": 0.9},
        {"id": "hollows", "op": "patches", "scale": 1.7, "threshold": 0.66, "shift": -1.1, "seed": 4},
        {"id": "strands", "op": "stripes", "axis": "x", "period": 1.3, "width": 0.3, "shift": -0.7, "wobble": 0.4,
         "faces": ["sides", "front", "back"]},
        {"id": "z_strands", "op": "stripes", "axis": "z", "period": 1.3, "width": 0.3, "shift": -0.7, "wobble": 0.4,
         "faces": ["left", "right"]},
        {"id": "mottle", "op": "noise", "scale": 1.2, "amount": 0.5}, photo_moss]},
    "stone": {"ramp": "stone", "tone": 4.4, "layers": [
        {"id": "cracks", "op": "cracks", "scale": 3.0, "width": 0.03, "shift": -2.0, "bevel": {"shadow": 0, "highlight": 1}},
        {"id": "facets", "op": "patches", "scale": 1.8, "threshold": 0.56, "shift": 0.8},
        {"id": "pits", "op": "speckle", "density": 0.04, "shift": -1.2}, photo_rock,
        {"id": "moss_cap", "op": "drip", "ramp": "moss", "tone": 5.4, "depth": 0.4, "length": 1.6, "width": 0.5}]},
    "bone": {"ramp": "bone", "tone": 4.6, "layers": [
        {"id": "tip", "op": "gradient", "axis": "z", "amount": 1.2},
        {"id": "rings", "op": "stripes", "axis": "z", "period": 1.8, "width": 0.22, "shift": -1.0, "wobble": 0.15},
        {"id": "grain", "op": "noise", "scale": 1.2, "amount": 0.4}]},
    "crystal": {"ramp": "crystal", "tone": 4.8, "rim": {"light_shift": 2.0, "dark_shift": -1.5}, "layers": [
        {"id": "glow_up", "op": "gradient", "axis": "z", "amount": 2.0},
        {"id": "facet", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.35, "shift": 0.9, "wobble": 0.3},
        {"id": "inner", "op": "patches", "scale": 1.2, "threshold": 0.62, "shift": -1.2},
        {"id": "glint", "op": "gloss", "density": 0.05, "post": True}]},
    "glow": {"ramp": "glow", "tone": 4.2, "light": 0, "brush": {"off": True}, "layers": [
        {"id": "iris", "op": "gradient", "axis": "y", "amount": 1.4},
        {"id": "pupil", "op": "rect", "rect": [0.42, 0.18, 0.62, 0.86], "ramp": "socket_r", "tone": 0},
        {"id": "catch", "op": "rect", "rect": [0.68, 0.18, 0.86, 0.36], "tone": 6.0}]},
    "socket": {"ramp": "hide", "tone": 1.4, "light": 0.4},
    "mouth": {"ramp": "mouth", "tone": 2.4, "light": 0.3},
    "hoof": {"ramp": "hoof", "tone": 3.2, "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0,
                                                    "width": 0.3, "shift": -0.8, "wobble": 0.3},
                                                   {"id": "toe", "op": "gradient", "axis": "z", "amount": 0.8}]},
    "shroom": {"ramp": "shroom", "tone": 4.6, "light": 0.6, "layers": [
        {"id": "dots", "op": "speckle", "density": 0.18, "shift": 2.0}]},
    "shroom_stem": {"ramp": "stem", "tone": 3.2},
}

anim = {
    "idle": {"length": 3.2, "loop": True, "tracks": [
        {"part": "body", "channel": "position", "osc": {"amp": [0, 0.35, 0], "cycles": 1, "bias": [0, 0.45, 0]}},
        {"part": "hump", "channel": "scale", "osc": {"amp": [0.018, 0.022, 0], "cycles": 1, "phase": 0.1}},
        {"parts": ["neck", "head"], "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.15}},
        {"part": "head", "axis": "x", "osc": {"amp": 2.5, "cycles": 2}},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [1.9, 0], [2.1, 7, "out"], [2.5, 3], [2.9, 0]]},
        {"part": "ear", "axis": "z", "keys": [[0, 0], [2.0, 0], [2.08, -14, "out"], [2.4, 0, "elastic"]]},
        {"parts": ["tail_0", "tail_1", "tail_2", "tail_3"], "wave": {"axis": "y", "amp": 6, "cycles": 1, "lag": 0.14, "growth": 1.25}},
        
    ]},
    "walk": {"length": 1.6, "loop": True, "tracks": [
        {"part": "fl_upper", "axis": "x", "osc": {"amp": 16, "cycles": 1}, "mirror_phase": 0.5},
        {"part": "fl_lower", "axis": "x", "osc": {"amp": -10, "cycles": 1, "phase": 0.15, "bias": -6}, "mirror_phase": 0.5},
        {"part": "bl_upper", "axis": "x", "osc": {"amp": -16, "cycles": 1}, "mirror_phase": 0.5},
        {"part": "bl_lower", "axis": "x", "osc": {"amp": 9, "cycles": 1, "phase": 0.15, "bias": 6}, "mirror_phase": 0.5},
        {"part": "body", "channel": "position", "osc": {"amp": [0, 0.7, 0], "cycles": 2, "bias": [0, 2.9, 0]}},
        {"part": "body", "axis": "z", "osc": {"amp": 2.2, "cycles": 1}},
        {"parts": ["neck", "head"], "wave": {"axis": "x", "amp": 2.5, "cycles": 2, "lag": 0.12}},
        {"parts": ["neck", "head"], "wave": {"axis": "y", "amp": 3, "cycles": 1, "lag": 0.15}},
        {"parts": ["tail_0", "tail_1", "tail_2", "tail_3"], "wave": {"axis": "y", "amp": 8, "cycles": 1, "lag": 0.12, "growth": 1.2}},
    ]},
    "roar": {"length": 2.6, "loop": True, "tracks": [
        {"part": "neck", "axis": "x", "keys": [[0, 0], [0.5, 6, "in"], [0.85, -20, "out_back"], [1.9, -20], [2.4, 0, "smooth"]]},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.5, 8, "in"], [0.85, -16, "out_back"], [1.9, -14], [2.4, 0, "smooth"]]},
        {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.55, 0], [0.85, 30, "out_back"], [1.7, 26], [1.9, 30], [2.3, 0, "smooth"]]},
        {"part": "body", "channel": "position", "keys": [[0, [0, 0, 0]], [0.5, [0, 0.8, -0.6], "in"], [0.85, [0, 1.8, 0.6], "out"],
                                                         [1.9, [0, 1.6, 0.5]], [2.4, [0, 0, 0], "smooth"]]},
        {"part": "hump", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.5, [-0.03, -0.04, 0]], [0.85, [0.05, 0.06, 0], "out_back"],
                                                       [1.9, [0.04, 0.05, 0]], [2.4, [0, 0, 0], "smooth"]]},
        {"part": "ear", "axis": "z", "keys": [[0, 0], [0.85, 22, "out_back"], [1.9, 18], [2.4, 0]]},
        {"parts": ["tail_0", "tail_1", "tail_2", "tail_3"], "axis": "x", "keys": [[0, 0], [0.85, 10, "out_back"], [1.9, 8], [2.4, 0]]},
        {"parts": ["tail_0", "tail_1", "tail_2", "tail_3"], "wave": {"axis": "y", "amp": 5, "cycles": 3, "lag": 0.08}},
    ]},
}

spec = {
    "name": "Thornhide Behemoth",
    "description": "Original blocky (Minecraft-style) monster: a moss-backed plum-hided beast with teal crystal clusters, "
                   "bone tusks and horns, stone armour, glowing eyes and mushrooms. Every texture is brush-painted: "
                   "scale rows, moss running down in strands, cracked stone and banded horn, quantised as strokes along the form.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 4,
    "budget": {"tris": 1800, "colors": 96},
    "light": {"dir": [-0.5, 1.0, 0.65], "strength": 1.5, "gradient": 0.5, "ao": 1.4, "ao_height": 9.0},
    "brush": {"length": 2.2, "rough": 0.75, "width": 0.65, "overshoot": 0.35, "flow": "horizontal", "flows": {"moss": "vertical"},
              "textures": {"moss": "moss", "stone": "stone", "hide": "organic", "bone": "wood", "crystal": "crystal",
                           "hoof": "stone", "belly": "leather"}},
    "render": {"background": "#16131c", "hero": [-38, 18], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
}
json.dump(spec, open(sys.argv[1], "w"), indent=1)
print(len(P), "parts")
