"""Builds examples/snow_leopard_cub.json, a cute, detailed snow leopard cub (sitting, one paw raised).

    python examples/src/snow_leopard_cub.py examples/snow_leopard_cub.json

Anatomy follows a real cub: an oversized round head with full cheeks and white whisker pads, a small dark
nose, huge dark glossy eyes with catch-lights and dark rims, low rounded ears with dark backs, a thick
ringed tail curled round the feet, and big fluffy paws. The raised paw shows black toe beans and a main pad.
Fur: pale grey with cream chest, broken-ring rosettes on the body, solid spots on the legs, fine speckles
on the forehead. Painted with fur brush strokes at 4 texels per unit.
"""
import json
import sys

DENSITY = 4
P = []


def part(id, **kw):
    d = {"id": id}
    d.update(kw)
    P.append(d)
    return d


def R(v):
    return [round(float(x), 3) for x in v] if isinstance(v, (list, tuple)) else round(float(v), 3)


def loft(id, parent, rings, style, sides=8, rnd=2.2, subdiv=0, caps=(True, True), **kw):
    d = dict(shape="loft", profile={"sides": sides, "round": rnd}, subdiv=subdiv, caps=list(caps),
             rings=[{"at": R(a), "size": R(s)} for a, s in rings], style=style)
    if parent:
        d["parent"] = parent
    d.update(kw)
    return part(id, **d)


# ------------------------------------------------------------------ body (sitting) + haunches + hind paws
loft("body", None, [((0, 0.9, -1.4), [12.0, 10.6]), ((0, 4.8, -0.8), [13.4, 11.8]), ((0, 9.4, 0.4), [11.2, 9.8]),
                    ((0, 13.0, 1.0), [8.8, 8.0]), ((0, 15.2, 1.2), [7.6, 7.0])], ["fur", "rosettes", "chest"],
     caps=[True, False], up=[0, 0, 1])
for side in (1, -1):
    sfx = "" if side == 1 else "_r"
    loft(f"haunch{sfx}", "body", [((0, 0, -3.0), [4.8, 5.2]), ((0, 0.4, 0), [5.8, 6.8]), ((0, 0, 2.8), [4.4, 4.8])],
         ["fur", "rosettes"], pivot=[side * 4.9, 3.0, -1.4], rotation=[-8, side * 6, 0])
    loft(f"hind_paw{sfx}", "body", [((0, 0, -1.6), [3.4, 2.2]), ((0, 0.1, 1.2), [3.9, 2.4]), ((0, -0.1, 2.6), [3.2, 1.8])],
         ["fur", "toes"], pivot=[side * 4.6, 1.1, 3.2], rotation=[0, side * 8, 0], snap_ground=0.02)

# ------------------------------------------------------------------ standing front leg
loft("front_leg", "body", [((0, 0, 0), [4.4, 4.8]), ((0.2, -4.6, 0.8), [3.7, 3.9]), ((0.3, -8.7, 1.4), [3.3, 3.5])],
     ["fur", "leg_spots"], subdiv=0, pivot=[3.6, 10.4, 2.6], caps=[False, False])
loft("front_paw", "front_leg", [((0, 0.9, -1.4), [4.0, 2.6]), ((0, 1.0, 0.6), [4.7, 2.9]), ((0, 0.8, 2.1), [4.1, 2.2])],
     ["fur", "toes"], pivot=[0.3, -9.6, 1.4], orient="world", snap_ground=0.02)

# ------------------------------------------------------------------ the raised paw (pads toward the viewer)
loft("arm", "body", [((0, 0, 0), [4.4, 4.8]), ((1.2, -4.6, 3.4), [4.0, 4.2]), ((3.4, -4.2, 7.2), [3.8, 3.8])],
     ["fur", "leg_spots"], subdiv=1, pivot=[-3.6, 10.4, 2.6], caps=[False, False])
loft("paw", "arm", [((0, -2.6, 0.2), [5.8, 4.2]), ((0, 0.2, 0.6), [7.6, 5.0]), ((0, 2.9, 0.4), [7.0, 4.4]),
                    ((0, 4.3, 0.0), [4.2, 2.8])], "fur", pivot=[3.6, -5.6, 7.6], rotation=[-6, 0, 0], sides=10, subdiv=1)
part("pad_main", parent="paw", shape="prism", sides=7, size=[4.4, 3.2, 0.8], pivot=[0, -0.6, 2.85], offset=[0, 0, 0.2],
     rotation=[-4, 0, 0], style="pad", hide=["back"])
for k, (x, y, s) in enumerate([(-2.8, 1.0, 1.7), (-1.05, 2.3, 1.8), (1.05, 2.15, 1.8), (2.7, 1.2, 1.7)]):
    part(f"bean{k}", parent="paw", shape="prism", sides=8, size=[s, s * 1.12, 0.7], pivot=[x, y, 2.55 - abs(x) * 0.12],
         offset=[0, 0, 0.2], rotation=[-10, x * 6, 0], style="pad", hide=["back"])

# ------------------------------------------------------------------ head
HEAD = [((0, 1.0, -4.6), [10.6, 9.6]), ((0, 1.6, -2.0), [15.4, 12.6]), ((0, 1.0, 1.2), [16.2, 12.4]),
        ((0, -0.4, 3.8), [13.4, 10.6]), ((0, -1.6, 5.6), [8.8, 7.2]), ((0, -2.3, 6.6), [6.2, 4.8])]
loft("head", "body", HEAD, ["head_fur", "speckles", "face"], pivot=[0, 15.6, 1.8], rotation=[4, 0, 0], sides=10, subdiv=1)
for side in (1, -1):
    sfx = "" if side == 1 else "_r"
    loft(f"cheek{sfx}", "head", [((0, 0, -2.2), [3.0, 4.6]), ((side * 1.0, -0.3, 0.2), [3.8, 5.2]),
                                ((side * 1.6, -0.9, 2.2), [2.4, 3.2])], "white",
         pivot=[side * 5.6, -1.1, 1.6], subdiv=0, sides=7)
    loft(f"whisker_pad{sfx}", "head", [((0, 0, -0.9), [3.0, 2.5]), ((0, 0, 0.7), [2.8, 2.3])], "white",
         pivot=[side * 1.6, -3.2, 5.9], subdiv=0, sides=8)
    part(f"whiskers{sfx}", parent="head", shape="card", plane="xy", pivot=[side * 2.9, -3.1, 6.2], offset=[side * 2.6, 0, 0],
         rotation=[0, side * -28, side * -6], size=[4.2, 1.9], style="whisker",
         art=(["ww..............", "..www...........", ".....wwww.......", "................",
               "wwww............", "....wwwwww......", "................", "ww..............",
               "..wwwww.........", ".......www......"] if side == 1 else
              ["..............ww", "...........www..", ".......wwww.....", "................",
               "............wwww", "......wwwwww....", "................", "..............ww",
               ".........wwwww..", "......www......."]))
    # low, rounded cub ears: dark backs with a pale thumbprint, pink-grey inner fur
    loft(f"ear{sfx}", "head", [((0, 0, 0), [4.6, 1.9]), ((0, 2.0, -0.1), [4.3, 1.6]), ((0, 3.2, -0.3), [3.0, 1.2]),
                               ((0, 3.9, -0.4), [1.5, 0.9])], ["ear"], sides=8, subdiv=0, caps=[False, True],
         pivot=[side * 5.8, 3.4, -0.8], rotation=[-14, side * -20, side * -48], up=[0, 0, 1])
part("nose", parent="head", shape="prism", sides=3, size=[2.5, 1.7, 1.1], angle=180, pivot=[0, -1.3, 6.95],
     offset=[0, 0, 0.25], rotation=[-10, 0, 0], style="nose", hide=["back"])
part("bridge", parent="head", shape="box", size=[2.6, 4.4, 0.9], pivot=[0, 1.0, 6.05], rotation=[-34, 0, 0],
     style="bridge")
part("philtrum", parent="head", shape="box", size=[0.5, 1.4, 0.5], pivot=[0, -2.6, 6.95], rotation=[-12, 0, 0],
     style="mouth_line")
loft("chin", "head", [((0, 0.2, -2.0), [3.6, 1.9]), ((0, 0.0, 0.0), [3.4, 1.9]), ((0, -0.2, 1.4), [2.6, 1.5])], "white",
     pivot=[0, -4.5, 5.2], subdiv=0, sides=8)
part("tongue", parent="chin", shape="box", size=[2.0, 0.5, 2.2], pivot=[0, 0.85, 0.2], style="tongue")
FACE = []
for side in (1, -1):
    sfx = "" if side == 1 else "_r"
    # eye stack: dark rim -> iris -> pupil (dilates, looks around); catch-lights stay put; lids for blinks/squints
    part(f"eye_rim{sfx}", parent="head", shape="prism", sides=12, size=[5.6, 4.6, 1.8], pivot=[side * 3.25, 1.5, 4.65],
         offset=[0, 0, 0.6], rotation=[-8, side * 20, 0], style="rim", hide=["back"])
    part(f"iris{sfx}", parent=f"eye_rim{sfx}", shape="prism", sides=12, size=[4.5, 3.7, 0.5], pivot=[0, 0, 1.7],
         offset=[0, 0, 0.25], style="iris", hide=["back"])
    part(f"pupil{sfx}", parent=f"iris{sfx}", shape="prism", sides=12, size=[3.0, 3.0, 0.5], pivot=[0, 0.05, 0.5],
         offset=[0, 0, 0.25], style="pupil", hide=["back"] + [f"side{k}" for k in range(12)])
    part(f"glint{sfx}", parent=f"eye_rim{sfx}", shape="prism", sides=8, size=[1.3, 1.2, 0.5], pivot=[-0.85, 0.8, 2.45],
         offset=[0, 0, 0.25], style="glint", hide=["back"] + [f"side{k}" for k in range(8)])
    part(f"glint2{sfx}", parent=f"eye_rim{sfx}", shape="prism", sides=6, size=[0.7, 0.65, 0.5], pivot=[0.85, -0.9, 2.45],
         offset=[0, 0, 0.25], style="glint", hide=["back"] + [f"side{k}" for k in range(6)])
    part(f"eye_ring{sfx}", parent=f"eye_rim{sfx}", shape="prism", sides=12, size=[7.0, 6.0, 1.4], pivot=[0, 0.1, 0.4],
         offset=[0, 0, 0.7], style="eye_ring", hide=["back"])
    part(f"liner_tail{sfx}", parent=f"eye_rim{sfx}", shape="box", size=[1.8, 0.55, 0.6], pivot=[side * 2.9, -0.7, 1.4],
         rotation=[0, 0, side * -24], style="mouth_line")
    part(f"lid{sfx}", parent=f"eye_rim{sfx}", shape="box", size=[5.0, 0.55, 0.5], pivot=[0, 2.0, 1.0], offset=[0, -0.27, 0],
         style="lid")
    part(f"lid_low{sfx}", parent=f"eye_rim{sfx}", shape="box", size=[4.8, 0.5, 0.5], pivot=[0, -2.0, 1.0],
         offset=[0, 0.25, 0], style="lid_low")
    part(f"brow{sfx}", parent="head", shape="box", size=[3.2, 0.8, 0.9], pivot=[side * 3.0, 4.3, 4.5], offset=[0, 0, 0.3],
         rotation=[-14, side * 18, side * -10], style="brow")
    part(f"tear{sfx}", parent="head", shape="box", size=[0.5, 2.0, 0.5], pivot=[side * 1.5, -0.4, 6.15],
         rotation=[-20, side * 10, side * 18], style="mouth_line")
    FACE += [f"eye_rim{sfx}", f"iris{sfx}", f"pupil{sfx}", f"lid{sfx}", f"lid_low{sfx}", f"brow{sfx}"]

# ------------------------------------------------------------------ the thick tail, curled round the feet
loft("tail", "body", [((0, 0, 0), [4.4, 4.4]), ((-3.2, 0.0, -3.4), [4.8, 4.8]), ((-8.2, 0.0, -2.4), [4.8, 4.8]),
                      ((-10.6, 0.0, 1.6), [4.6, 4.6]), ((-9.8, 0.0, 5.8), [4.4, 4.4]), ((-6.6, 0.0, 8.2), [4.0, 4.0]),
                      ((-3.4, 0.2, 9.0), [3.4, 3.4]), ((-1.4, 0.4, 8.8), [2.4, 2.4])],
     ["fur", "tail_rings"], chain=True, sides=10, pivot=[0, 2.4, -5.8], caps=[False, True])

ramps = {
    "fur": ["#1c202a", "#323846", "#4c5464", "#6a7282", "#8c94a4", "#aeb5c2", "#ccd1da", "#e4e7ec", "#f6f7f9"],
    "cream": ["#3c404c", "#5e6472", "#868c9a", "#aeb3be", "#cfd3da", "#e8eaee", "#fafbfc"],
    "spot": ["#050507", "#0e0f13", "#1a1b22", "#2a2c35", "#3e414c"],
    "eye": ["#020203", "#08070a", "#141012", "#22191a", "#352826", "#523e36", "#ffffff"],
    "nose": ["#0a0a0e", "#18171e", "#2a2832", "#403c48", "#5e5866"],
    "pad": ["#040405", "#0e0e12", "#1c1c24", "#2e2e3a", "#4a4a5c", "#8a8aa0"],
    "pink": ["#2e2628", "#4a3c40", "#6a5658", "#8e7678", "#b09a9c"],
}
fur_brush = {"flow": "path", "rough": 0.85}
styles = {
    "fur": {"ramp": "fur", "tone": 5.2, "dither": 0.0, "rim": {"light": 1, "dark": 1}, "brush": fur_brush, "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.4, "amount": 0.55},
        {"id": "under", "op": "fill", "ramp": "cream", "tone": 4.6, "faces": ["bottom"]},
        {"id": "sheen", "op": "patches", "scale": 0.9, "threshold": 0.72, "shift": 1.0, "min_light": 0.6, "post": True}]},
    "head_fur": {"ramp": "fur", "tone": 5.4, "dither": 0.0, "rim": {"light": 1, "dark": 1},
                 "brush": {"flow": "path", "rough": 0.75}, "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.2, "amount": 0.45}]},
    "rosettes": {"layers": [
        {"id": "rosette", "op": "spots", "count": 26, "radius": [1.3, 2.0], "ring": 0.52, "gaps": 0.3, "gap_scale": 0.3,
         "centre_shift": -1.0, "ramp": "spot", "tone": 1.6, "roughness": 0.35, "min_gap": 0.9, "faces": ["-bottom"]},
        {"id": "freckles", "op": "spots", "count": 40, "radius": [0.3, 0.55], "ramp": "spot", "tone": 1.4,
         "roughness": 0.3, "faces": ["-bottom"]}]},
    "chest": {"layers": [
        {"id": "bib", "op": "band", "axis": "z", "from": 0.25, "to": 1.2, "ramp": "cream", "tone": 5.0, "wobble": 0.25,
         "wobble_scale": 1.5},
        {"id": "chest_marks", "op": "spots", "count": 16, "radius": [0.5, 0.8], "stretch": [2.4, 0.7, 1.0], "ramp": "spot",
         "tone": 1.6, "roughness": 0.3, "min_gap": 1.2, "where": {"z": [0.2, 1.0], "y": [-0.6, 0.9]}}]},
    "leg_spots": {"layers": [
        {"id": "spots", "op": "spots", "count": 14, "radius": [0.5, 0.9], "ramp": "spot", "tone": 1.6, "roughness": 0.3,
         "min_gap": 0.8}]},
    "toes": {"layers": [
        {"id": "toe_lines", "op": "stripes", "axis": "x", "period": 1.1, "width": 0.12, "shift": -1.6, "faces": ["top", "front", "end"]}]},
    "speckles": {"layers": [
        {"id": "crown", "op": "spots", "count": 170, "radius": [0.14, 0.3], "ramp": "spot", "tone": 1.5, "roughness": 0.25,
         "where": {"y": [0.1, 1.0], "z": [-0.5, 0.62], "x": [-0.55, 0.55]}},
        {"id": "brow_line", "op": "spots", "count": 26, "radius": [0.25, 0.4], "ramp": "spot", "tone": 1.4, "roughness": 0.2,
         "where": {"y": [0.25, 0.75], "z": [0.45, 0.9], "x": [-0.18, 0.18]}},
        {"id": "temples", "op": "spots", "count": 18, "radius": [0.4, 0.7], "ramp": "spot", "tone": 1.6, "roughness": 0.3,
         "where": {"x": [0.55, 1.0], "y": [-0.2, 0.8]}},
        {"id": "temples_r", "op": "spots", "count": 18, "radius": [0.4, 0.7], "ramp": "spot", "tone": 1.6, "roughness": 0.3,
         "where": {"x": [-1.0, -0.55], "y": [-0.2, 0.8]}},
        {"id": "nape", "op": "spots", "count": 10, "radius": [0.6, 1.0], "ramp": "spot", "tone": 1.6,
         "where": {"z": [-1.0, -0.4]}}]},
    "face": {"layers": [
        {"id": "muzzle", "op": "band", "axis": "z", "from": 0.55, "to": 1.2, "ramp": "cream", "tone": 5.2, "wobble": 0.15,
         "faces": ["-top"]},
        {"id": "brow", "op": "band", "axis": "y", "from": -1.1, "to": -0.35, "ramp": "cream", "tone": 5.0, "wobble": 0.2}]},
    "white": {"ramp": "cream", "tone": 5.2, "dither": 0.0, "brush": {"flow": "path", "rough": 0.7}, "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.0, "amount": 0.4},
        {"id": "dots", "op": "spots", "count": 5, "radius": [0.16, 0.24], "ramp": "spot", "tone": 2.0, "roughness": 0.1}]},
    "tail_rings": {"layers": [
        {"id": "rings", "op": "stripes", "axis": "path", "period": 4.2, "width": 0.24, "wobble": 0.5, "ramp": "spot",
         "tone": 1.6, "range": [0.35, 0.92]},
        {"id": "rosette", "op": "spots", "count": 12, "radius": [1.0, 1.5], "ring": 0.5, "gaps": 0.3, "centre_shift": -0.8,
         "ramp": "spot", "tone": 1.6, "where": {"path": [0.0, 0.4]}},
        {"id": "tip", "op": "band", "axis": "path", "from": 0.94, "to": 1.0, "ramp": "spot", "tone": 2.0}]},
    "ear": {"ramp": "fur", "tone": 3.0, "dither": 0.0, "brush": {"flow": "path", "rough": 0.6}, "layers": [
        {"id": "rim", "op": "band", "axis": "path", "from": 0.55, "to": 1.0, "ramp": "spot", "tone": 2.4},
        {"id": "thumbprint", "op": "spots", "centers": [[0, 1.6, -0.6, 1.0]], "ramp": "fur", "tone": 6.4, "roughness": 0.2,
         "faces": ["bottom"]},
        {"id": "inner", "op": "fill", "ramp": "pink", "tone": 3.2, "faces": ["top", "end"]},
        {"id": "inner_fur", "op": "noise", "scale": 0.8, "amount": 0.6}]},
    "iris": {"ramp": "eye", "tone": 2.8, "light": 0.2, "dither": 0.0, "brush": {"off": True},
             "rim": {"light": 0, "dark": 0}, "layers": [
        {"id": "deep", "op": "gradient", "axis": "y", "amount": 1.4},
        {"id": "ring", "op": "spots", "centers": [[0, 0, 0.25, 1.5]], "ring": 0.8, "gaps": -1, "ramp": "eye", "tone": 1.2,
         "roughness": 0.0}]},
    "pupil": {"ramp": "eye", "tone": 0.6, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "glint": {"ramp": "eye", "tone": 6, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "rim": {"ramp": "spot", "tone": 0.6, "light": 0.2, "brush": {"off": True}},
    "eye_ring": {"ramp": "cream", "tone": 5.4, "light": 0.5, "brush": {"flow": "path", "rough": 0.5}},
    "lid": {"ramp": "fur", "tone": 4.6, "light": 0.5, "brush": {"off": True}, "layers": [
        {"id": "lash", "op": "band", "axis": "y", "from": -1.1, "to": -0.2, "ramp": "spot", "tone": 1.2}]},
    "lid_low": {"ramp": "cream", "tone": 4.6, "light": 0.5, "brush": {"off": True}, "layers": [
        {"id": "lash", "op": "band", "axis": "y", "from": 0.2, "to": 1.1, "ramp": "spot", "tone": 1.2}]},
    "brow": {"ramp": "fur", "tone": 5.4, "brush": {"flow": "x", "rough": 0.6}, "layers": [
        {"id": "marks", "op": "spots", "count": 4, "radius": [0.3, 0.45], "ramp": "spot", "tone": 1.4, "roughness": 0.2}]},
    "bridge": {"ramp": "fur", "tone": 3.8, "light": 0.6, "brush": {"flow": "y", "rough": 0.6}, "layers": [
        {"id": "fade", "op": "gradient", "axis": "y", "amount": -0.8}]},
    "mouth_line": {"ramp": "spot", "tone": 2.0, "light": 0.3, "brush": {"off": True}},
    "tongue": {"ramp": "pink", "tone": 3.4, "light": 0.6, "brush": {"off": True}, "layers": [
        {"id": "groove", "op": "stripes", "axis": "x", "period": 9, "width": 0.08, "phase": 4.4, "shift": -1.2}]},
    "nose": {"ramp": "nose", "tone": 2.0, "light": 0.6, "brush": {"off": True}, "layers": [
        {"id": "shine", "op": "rect", "rect": [0.3, 0.12, 0.55, 0.3], "tone": 4, "faces": ["front"]}]},
    "pad": {"ramp": "pad", "tone": 1.6, "light": 0.5, "brush": {"off": True}, "rim": {"light": 1, "dark": 0}, "layers": [
        {"id": "shine", "op": "rect", "rect": [0.22, 0.15, 0.48, 0.34], "tone": 4.0, "faces": ["front"]},
        {"id": "grain", "op": "speckle", "density": 0.12, "shift": 0.8}]},
    "mouth": {"ramp": "nose", "tone": 1.0, "light": 0, "art_key": {"m": "nose:1"}},
    "whisker": {"ramp": "cream", "tone": 6.0, "light": 0, "art_key": {"w": "cream:6"}},
}

def blink(t, dur=0.16):
    """Upper and lower lids close over the eye and open again."""
    slide = [{"parts": [p_, p_ + "_r"], "channel": "position",
              "keys": [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + dur * 0.15, [0, 0, 2.0], "out"], [t + dur * 0.85, [0, 0, 2.0]],
                       [t + dur, [0, 0, 0], "in"]]} for p_ in ("lid", "lid_low")]
    return slide + [{"parts": ["lid", "lid_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + dur * 0.4, [0, 3.6, 0], "in"],
                                                                    [t + dur * 0.6, [0, 3.6, 0]], [t + dur, [0, 0, 0], "out"]]},
            {"parts": ["lid_low", "lid_low_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [t, [0, 0, 0]],
                                                                            [t + dur * 0.4, [0, 2.4, 0], "in"],
                                                                            [t + dur * 0.6, [0, 2.4, 0]], [t + dur, [0, 0, 0], "out"]]}]


def look(keys):
    """Irises (and the pupils riding on them) glance around: keys of [t, x, y]."""
    return {"parts": ["iris", "iris_r"], "channel": "position", "keys": [[t, [x, y, 0], "smooth"] for t, x, y in keys]}


EARS = ["ear", "ear_r"]
TAILTIP = ["tail_4", "tail_5", "tail_6"]
anim = {
    "idle": {"length": 4.0, "loop": True, "tracks": [
        {"part": "body", "channel": "scale", "osc": {"amp": [0.018, 0.012, 0.018], "cycles": 2}},
        {"part": "head", "axis": "z", "keys": [[0, 0], [1.2, 0], [1.6, 8, "back"], [2.8, 8], [3.3, 0, "smooth"]]},
        {"part": "head", "axis": "x", "osc": {"amp": 1.5, "cycles": 2}},
        look([(0, 0, 0), (0.6, 0, 0), (0.8, 0.35, 0.05), (1.5, 0.35, 0.05), (1.7, -0.3, 0.1), (2.6, -0.3, 0.1), (2.8, 0, 0),
              (4.0, 0, 0)]),
        {"parts": ["pupil", "pupil_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [1.6, [0.25, 0.2, 0], "smooth"],
                                                                   [3.0, [0.25, 0.2, 0]], [3.6, [0, 0, 0], "smooth"]]},
        *blink(0.4), *[dict(t, parts=t["parts"]) for t in blink(3.2, 0.14)],
        {"parts": EARS, "axis": "z", "keys": [[0, 0], [0.9, 0], [0.96, -14, "out"], [1.25, 0, "elastic"]]},
        {"parts": ["brow", "brow_r"], "channel": "position", "keys": [[0, [0, 0, 0]], [1.55, [0, 0, 0]], [1.7, [0, 0.35, 0], "out"],
                                                                    [2.8, [0, 0.35, 0]], [3.1, [0, 0, 0]]]},
        {"parts": TAILTIP, "wave": {"axis": "y", "amp": 7, "cycles": 2, "lag": 0.12}},
        {"part": "arm", "axis": "x", "osc": {"amp": 2.0, "cycles": 1}},
    ]},
    "wave": {"length": 2.4, "loop": True, "tracks": [
        {"part": "arm", "axis": "z", "keys": [[0, 0], [0.3, 10, "out"], [0.6, -8, "ease"], [0.9, 10], [1.2, -8], [1.5, 6],
                                              [1.9, 0, "smooth"]]},
        {"part": "paw", "axis": "z", "keys": [[0, 0], [0.35, 14, "out"], [0.65, -12], [0.95, 14], [1.25, -12], [1.55, 8],
                                              [2.0, 0, "smooth"]]},
        {"part": "head", "axis": "z", "keys": [[0, 0], [0.4, -9, "out_back"], [1.8, -9], [2.2, 0, "smooth"]]},
        {"parts": ["lid_low", "lid_low_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [0.35, [0, 2.2, 0], "out"], [1.8, [0, 2.2, 0]],
                                                                       [2.2, [0, 0, 0], "smooth"]]},
        {"parts": ["lid_low", "lid_low_r"], "channel": "position", "keys": [[0, [0, 0, 0]], [0.1, [0, 0, 2.0], "out"],
                                                                          [2.1, [0, 0, 2.0]], [2.3, [0, 0, 0]]]},
        {"parts": ["brow", "brow_r"], "axis": "z", "keys": [[0, 0], [0.4, 8], [1.8, 8], [2.2, 0]]},
        {"part": "chin", "axis": "x", "keys": [[0, 0], [0.4, 10, "out"], [1.8, 8], [2.2, 0, "smooth"]]},
        {"parts": EARS, "axis": "x", "keys": [[0, 0], [0.4, -10, "out_back"], [1.8, -10], [2.2, 0]]},
        {"parts": TAILTIP, "wave": {"axis": "y", "amp": 10, "cycles": 2, "lag": 0.12}},
    ]},
    "meow": {"length": 2.0, "loop": True, "tracks": [
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.25, 4, "in"], [0.5, -12, "out_back"], [1.3, -10], [1.7, 0, "smooth"]]},
        {"part": "chin", "axis": "x", "keys": [[0, 0], [0.45, 0], [0.6, 30, "out_back"], [1.2, 26], [1.45, 0, "in"]]},
        {"parts": ["lid", "lid_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [0.5, [0, 1.6, 0], "out"], [1.3, [0, 1.6, 0]],
                                                               [1.6, [0, 0, 0]]]},
        {"parts": ["lid", "lid_r", "lid_low", "lid_low_r"], "channel": "position",
         "keys": [[0, [0, 0, 0]], [0.3, [0, 0, 2.0], "out"], [1.5, [0, 0, 2.0]], [1.7, [0, 0, 0]]]},
        {"parts": ["lid_low", "lid_low_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [0.5, [0, 1.4, 0], "out"],
                                                                       [1.3, [0, 1.4, 0]], [1.6, [0, 0, 0]]]},
        {"parts": EARS, "axis": "x", "keys": [[0, 0], [0.5, 14, "out"], [1.3, 12], [1.7, 0]]},
        {"parts": ["whisker_pad", "whisker_pad_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [0.6, [0.12, 0.15, 0], "out"],
                                                                                [1.3, [0.1, 0.12, 0]], [1.6, [0, 0, 0]]]},
        {"part": "body", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.5, [0.03, -0.02, 0.03], "out"], [1.4, [0, 0, 0]]]},
    ]},
    "surprised": {"length": 2.2, "loop": True, "tracks": [
        {"parts": ["pupil", "pupil_r"], "channel": "scale", "keys": [[0, [0, 0, 0]], [0.2, [0.55, 0.45, 0], "out_back"],
                                                                   [1.5, [0.55, 0.45, 0]], [1.9, [0, 0, 0], "smooth"]]},
        {"parts": ["brow", "brow_r"], "channel": "position", "keys": [[0, [0, 0, 0]], [0.15, [0, 0.7, 0], "out_back"],
                                                                    [1.5, [0, 0.7, 0]], [1.9, [0, 0, 0], "smooth"]]},
        {"parts": EARS, "axis": "x", "keys": [[0, 0], [0.15, -16, "out_back"], [1.5, -16], [1.9, 0, "smooth"]]},
        {"part": "head", "axis": "x", "keys": [[0, 0], [0.15, -8, "out_back"], [1.5, -6], [1.9, 0, "smooth"]]},
        {"part": "body", "channel": "position", "keys": [[0, [0, 0, 0]], [0.12, [0, 0.4, -0.6], "out"], [0.4, [0, 0, -0.4]],
                                                        [1.6, [0, 0, -0.4]], [2.0, [0, 0, 0], "smooth"]]},
        {"parts": TAILTIP, "axis": "x", "keys": [[0, 0], [0.15, -14, "out_back"], [1.5, -12], [1.9, 0]]},
        *blink(1.75),
    ]},
}

spec = {
    "name": "Snow Leopard Cub",
    "description": "A cute, detailed snow leopard cub sitting with one paw raised: oversized round head, full white cheeks "
                   "and whisker pads, huge glossy eyes with catch-lights, low rounded ears, rosettes and forehead "
                   "speckles, a thick ringed tail and black toe beans. Fur painted in brush strokes at 4 texels/unit.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 3200, "colors": 64},
    "light": {"dir": [-0.5, 1.0, 0.75], "strength": 1.0, "gradient": 0.5, "ao": 0.9, "ao_height": 6.0},
    "brush": {"length": 1.2, "rough": 0.8, "width": 0.35, "overshoot": 0.3, "flow": "path",
              "textures": {"fur": "fur", "cream": "fur", "spot": "organic"}},
    "render": {"background": "#2c3444", "hero": [24, 10], "shadow": 0.45},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": anim,
}
if __name__ == "__main__":
    with open(sys.argv[1] if len(sys.argv) > 1 else "examples/snow_leopard_cub.json", "w") as fh:
        json.dump(spec, fh, indent=1)
    print(len(P), "parts")
