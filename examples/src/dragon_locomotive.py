"""Builds examples/dragon_locomotive.json: the Dragon Locomotive, an iron steam engine whose boiler ends in a fierce
cast-iron dragon head (Winterworks mod vehicle).

    python examples/src/dragon_locomotive.py examples/dragon_locomotive.json

Same chassis, running gear, cab and contract parts as the Iron Locomotive (train_parts.py), plus `head` (pivot at
the neck), `jaw` (hinged at the back), `eye` (glow, mirrored), `wing` (mirrored, pivot at the root) and a `roar`
clip. The headlamp (`lamp`) is the furnace glow in the dragon's throat. Front = +Z, rail top y = 0; Minecraft pixel
units, density 1.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train_parts as tp  # noqa: E402

WHEELS = {k: {"t": "iron:2", "r": "brass:3", "R": "brass:5", "k": "iron:4", "s": "red:5", "h": "red:3", "c": "red:3"}
          for k in ("drv", "lead")}

b = tp.Parts()
tp.build_chassis(b, wheel_keys=WHEELS)
tp.build_cab(b, roof_style="cab_roof")

# ------------------------------------------------------------------ body: a short scaled boiler and a neck collar
BY, BZ = 15.5, 2.0           # boiler centre line, centre along Z (z -1..5)
b.box("boiler", "chassis", [10, 6, 6], [0, BY, BZ], "hide", hide=["front", "back"])
b.box("boiler_v", "boiler", [6, 10, 6], [0, 0, 0], "hide_top", hide=["front", "back"])
b.box("boiler_m", "boiler", [8, 8, 6], [0, 0, 0], "hide", hide=["front", "back"])
b.box("neck", "chassis", [10, 9, 5], [0, BY, 2.6], "neck", offset=[0, 0.6, 2.2], rot=[-20, 0, 0])
b.box("neck_v", "neck", [8, 11, 5], [0, 0.4, 0], "neck", offset=[0, 0.6, 2.2])
b.box("trim_collar", "trim", [11, 10, 1], [0, BY - 9.5 + 0.3, 3.1], "trim", rot=[-20, 0, 0], hide=["front", "back"])

# ------------------------------------------------------------------ the head: raised, tilted, jaw ajar
HEAD = [0, 18.0, 4.0]
b.box("head", "chassis", [9, 6, 6], HEAD, "skull", offset=[0, 1.6, 3.0], rot=[-12, 0, 5])
b.box("head_back", "head", [7, 6, 3], [0, 1.2, 0.2], "skull", offset=[0, 0, -1.0])
b.box("cheek", "head", [2, 4, 5], [4.2, 0.4, 0.8], "plates", offset=[0, 0, 2.4], rot=[0, -10, -8], mirror=True)
b.box("head_crest", "head", [3, 2, 7], [0, 4.0, -0.8], "plates", offset=[0, 0, 3.4], rot=[11, 0, 0])
b.box("brow", "head", [3, 2, 5], [2.7, 3.8, 1.6], "brow", offset=[0, 0, 2.4], rot=[20, -16, -20], mirror=True)
b.box("eye", "head", [1, 1, 2], [4.2, 2.3, 4.6], "eye", rot=[0, -14, -8], mirror=True)
b.box("snout", "head", [7, 4, 5], [0, 0.9, 5.4], "snout", offset=[0, 0, 2.4], rot=[8, 0, 0])
b.box("snout_tip", "snout", [5, 3, 2], [0, -0.3, 4.6], "snout", offset=[0, 0, 1.0], rot=[4, 0, 0])
for k, z in enumerate((0.8, 2.6, 4.4)):
    b.box(f"snout_spike{k}", "snout", [1, 2, 2], [0, 2.0, z], "spike", offset=[0, 0.6, 0], rot=[-38, 0, 0])
b.box("nostril", "snout_tip", [2, 1, 2], [1.4, 1.4, 0.6], "plates", rot=[-24, 26, 0], mirror=True)
for k, (x, z, h) in enumerate(((3.0, 4.0, 2), (2.5, 2.4, 1), (3.2, 0.8, 1), (1.4, 5.0, 1))):
    b.box(f"tooth{k}", "snout", [1, h, 1], [x, -2.0 - h / 2 + 0.3, z], "tooth", rot=[-6, 0, 6], mirror=True)
b.box("jaw", "head", [6, 2, 9], [0, -1.3, 1.0], "jaw", offset=[0, -1.0, 4.5], rot=[14, 0, 0])
b.box("chin", "jaw", [4, 1, 3], [0, -2.0, 7.0], "jaw", offset=[0, 0, 0.5], rot=[-12, 0, 0])
for k, (x, z, h) in enumerate(((2.2, 8.0, 2), (2.4, 6.2, 1), (2.6, 4.4, 1))):
    b.box(f"jaw_tooth{k}", "jaw", [1, h, 1], [x, 0.0 + h / 2 - 0.3, z], "tooth", rot=[10, 0, -6], mirror=True)
b.box("jaw_spike", "jaw", [1, 1, 4], [2.6, -1.6, 2.0], "horn", offset=[0, 0, -1.8], rot=[-24, -20, 0],
      mirror=True)
b.box("lamp", "head", [5, 2, 6], [0, -1.6, 5.4], "throat")
b.box("horn", "head", [2, 2, 5], [2.4, 3.8, 0.6], "horn", offset=[0, 0, -2.5], rot=[17, -18, 0], mirror=True)
b.box("horn_mid", "horn", [2, 1, 4], [0, 0.2, -4.6], "horn", offset=[0, 0, -1.8], rot=[10, -6, 0])
b.box("horn_tip", "horn_mid", [1, 1, 3], [0, 0.1, -3.6], "horn_tip", offset=[0, 0, -1.4], rot=[12, -4, 0])
b.box("horn_low", "head", [1, 1, 4], [3.8, 2.0, 0.6], "horn", offset=[0, 0, -2.0], rot=[6, -36, 0], mirror=True)
b.box("frill", "head", [1, 1, 3], [4.0, -0.4, 0.6], "horn", offset=[0, 0, -1.5], rot=[-10, -30, 0], mirror=True)

# ------------------------------------------------------------------ chest and folded forelegs gripping the deck
b.box("chest", "chassis", [8, 4, 6], [0, 13.2, 8.4], "belly")
b.box("foreleg", "chassis", [2, 4, 2], [4.0, 15.4, 7.6], "plates", offset=[0, -2.0, 0], rot=[-24, 0, -6],
      mirror=True)
b.box("forefoot", "foreleg", [3, 1, 3], [0, -4.0, 0.1], "plates", offset=[0, 0.1, 0.9], orient="world")
for k, x in enumerate((-1.0, 0.0, 1.0)):
    b.box(f"talon{k}", "forefoot", [1, 1, 2], [x, -0.1, 2.2], "horn_tip", offset=[0, 0, 0.6],
          rot=[24, 10 * x, 0])

# ------------------------------------------------------------------ the spiked chimney behind the head
b.box("smokestack", "boiler", [3, 3, 3], [0, 4.8, -1.6], "stack", offset=[0, 1.5, 0], hide=["top", "bottom"])
b.box("stack_oct", "smokestack", [3, 3, 3], [0, 0, 0], "stack", offset=[0, 1.5, 0], rot=[0, 45, 0],
      hide=["top", "bottom"])
b.box("stack_base", "smokestack", [5, 1, 5], [0, 0.0, 0], "stack", rot=[0, 45, 0], hide=["bottom"])
b.box("stack_crown", "smokestack", [4, 1, 4], [0, 3.4, 0], "stack_top")
b.box("stack_crown_oct", "smokestack", [4, 1, 4], [0, 3.35, 0], "stack_top", rot=[0, 45, 0], hide=["top"])
for k, (piv, rot) in enumerate((([1.3, 3.4, 0], [0, 0, -28]), ([0, 3.4, 1.3], [26, 0, 0]),
                                ([0, 3.4, -1.3], [-30, 0, 0]))):
    b.box(f"stack_spike{k}", "smokestack", [1, 3, 1], piv, "spike", offset=[0, 1.5, 0], rot=rot, mirror=k == 0)

# ------------------------------------------------------------------ spines fanned along the back
for k, (par, piv, h, r) in enumerate((("neck", [0, 5.0, -0.6], 3, [-30, 0, 4]),
                                      ("cab_ridge", [0, -0.1, 4.6], 2, [-48, 0, -6]),
                                      ("cab_ridge", [0, -0.1, 1.8], 2, [-46, 0, 5]),
                                      ("cab_ridge", [0, -0.1, -1.2], 2, [-44, 0, -4]),
                                      ("cab_ridge", [0, -0.1, -4.2], 2, [-56, 0, 6]))):
    b.box(f"spine{k}", par, [1, h, 2], piv, "spike", offset=[0, h / 2, 0], rot=r)

# ------------------------------------------------------------------ small folded wings along the boiler sides
b.box("wing", "chassis", [1, 2, 7], [5.3, 19.6, 4.6], "wing_bone", offset=[0, 0, -3.0], rot=[-9, -5, -6],
      mirror=True)
# membrane: scalloped trailing edge cut out of its sides, ribs painted in
b.box("wing_membrane", "wing", [1, 5, 6], [-0.1, -0.6, -0.6], "membrane", offset=[0, -2.5, -3.0], rot=[3, 0, 6],
      hide=["bottom"], paint={"stamps": [{"faces": ["flanks"], "at": "bottom", "art": ["f..f..", "_.__._"],
                                          "key": {"f": "leather:2"}}]})
b.box("wing_claw", "wing", [1, 1, 2], [0, 0.5, 0.2], "horn_tip", offset=[0, 0, 0.8], rot=[-30, 0, 0])

# ------------------------------------------------------------------ iron plough with bone tusks (in place of the cowcatcher)
tp.cowcatcher(b, bar="gold_bar", slat="plough_slat", name="plough")
b.box("tusk", "plough", [1, 1, 2], [4.6, -4.8, 0.2], "horn_tip", offset=[0, 0, 0.6], rot=[-20, 12, 0], mirror=True)

# ------------------------------------------------------------------ paint
ramps = tp.base_ramps()
ramps.update({
    # blackened green iron, tarnished gold, oxblood, old bone, wing leather, ember glows
    "iron": ["#0b0e0d", "#111614", "#171e1b", "#1d2622", "#242f2a", "#2c3832", "#35423b", "#3f4d45", "#4b5a51",
             "#59685e", "#6a786d", "#7e8b80"],
    "brass": ["#211808", "#33250b", "#4a3610", "#634916", "#7d5d1d", "#977226", "#ae8833", "#c49f46", "#d6b660"],
    "red": ["#170a0b", "#250f11", "#351417", "#461a1d", "#591f23", "#6c262a", "#7f2f31", "#93393a", "#a64644"],
    "bone": ["#1c1712", "#2c251c", "#3f3527", "#544833", "#6b5d43", "#827355", "#9a8b6b", "#b3a585", "#cbbf9f"],
    "leather": ["#100c0c", "#1a1314", "#251b1b", "#312423", "#3e2d2b", "#4c3734", "#5b423e", "#6b4f49"],
    "ember": ["#4a1204", "#8a2a06", "#c84c0c", "#f07d1c", "#ffb347", "#ffe29a", "#fff8e0"],
    "lamp": ["#7a2a08", "#b8460c", "#e8701a", "#ffa03c", "#ffd27a", "#fff2cc"],
})
styles = tp.base_styles(iron_tone=6.4, rust=False)
SCALES = {"id": "scales", "op": "scales", "along": "z", "size": [4.0, 2.5], "gradient": 1.0, "rim": -0.8,
          "highlight": 1.0, "shadow": -1.6, "jitter": 0.6, "faces": ["sides", "top"]}
PLATES = {"id": "plates", "op": "scales", "shape": "square", "along": "z", "size": [3.0, 2.0], "gap": 1.0,
          "highlight": 1.0, "shadow": -1.6, "gradient": 0.6, "jitter": 0.5}
GOLD_EDGE = {"id": "gilt", "op": "wear", "width": 1, "density": 0.12, "ramp": "brass", "tone": 4.6}
styles.update({
    "brow": {"ramp": "iron", "tone": 7.2, "rim": {"light_shift": 1.8, "dark_shift": -1.4},
             "brush": {"flow": "long", "length": 2.5, "rough": 0.55},
             "layers": [dict(PLATES, size=[2.0, 1.4]), {"id": "gilt_edge", "op": "band", "axis": "y", "from": 0.5,
                                                        "to": 1.0, "ramp": "brass", "tone": 4.4,
                                                        "faces": ["sides", "front"]}]},
    "hide": {"ramp": "iron", "tone": 6.2, "rim": tp.RIM, "brush": {"flow": "z", "length": 3, "rough": 0.6},
             "layers": [SCALES, tp.MOTTLE, tp.PHOTO_IRON, dict(tp.GRIME, amount=0.7),
                        {"id": "bands", "op": "stripes", "axis": "z", "space": "world", "period": 6.0, "width": 0.17,
                         "phase": -1.5, "ramp": "brass", "tone": 4.0}]},
    "hide_top": {"ramp": "iron", "tone": 6.4, "rim": tp.RIM, "brush": {"flow": "z", "length": 3, "rough": 0.6},
                 "layers": [dict(PLATES, faces=["top"]), dict(SCALES, faces=["sides"]), tp.MOTTLE, tp.PHOTO_IRON,
                            {"id": "bands", "op": "stripes", "axis": "z", "space": "world", "period": 6.0,
                             "width": 0.17, "phase": -1.5, "ramp": "brass", "tone": 4.0}]},
    "neck": {"ramp": "iron", "tone": 6.0, "rim": tp.RIM, "brush": {"flow": "y", "length": 2.5, "rough": 0.6},
             "layers": [dict(PLATES, along="y", size=[2.4, 1.6], faces=None), tp.MOTTLE]},
    "skull": {"ramp": "iron", "tone": 6.8, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
              "brush": {"flow": "long", "length": 2.5, "rough": 0.6},
              "layers": [dict(PLATES, size=[2.4, 1.6]), tp.MOTTLE, dict(tp.GRIME, amount=0.5),
                         {"id": "socket", "op": "spots", "centers": [[4.5, 2.3, 4.6, 1.5], [-4.5, 2.3, 4.6, 1.5]],
                          "stretch": [1, 0.8, 1.4], "roughness": 0.0, "ramp": "coal", "tone": 0.6}]},
    "plates": {"ramp": "iron", "tone": 7.2, "rim": {"light_shift": 1.8, "dark_shift": -1.2},
               "brush": {"flow": "long", "length": 2.5, "rough": 0.55},
               "layers": [dict(PLATES, size=[2.0, 1.4]), tp.MOTTLE, GOLD_EDGE]},
    "snout": {"ramp": "iron", "tone": 6.4, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
              "brush": {"flow": "z", "length": 2.5, "rough": 0.6},
              "layers": [dict(SCALES, size=[1.8, 1.2]), tp.MOTTLE,
                         {"id": "nostrils", "op": "rect", "rect": [0.15, 0.1, 0.38, 0.35], "ramp": "coal",
                          "tone": 0.5, "faces": ["front"]},
                         {"id": "nostrils_b", "op": "rect", "rect": [0.62, 0.1, 0.85, 0.35], "ramp": "coal",
                          "tone": 0.5, "faces": ["front"]},
                         {"id": "lip", "op": "band", "axis": "y", "from": -1.0, "to": -0.6, "shift": -1.4,
                          "faces": ["sides", "front"]}]},
    "jaw": {"ramp": "iron", "tone": 5.6, "rim": {"light_shift": 1.4, "dark_shift": -1.2},
            "brush": {"flow": "z", "length": 2.5, "rough": 0.6},
            "layers": [dict(SCALES, size=[1.8, 1.0], faces=["sides", "bottom"]),
                       {"id": "gums", "op": "fill", "ramp": "red", "tone": 2.4, "faces": ["top"]},
                       {"id": "lip", "op": "band", "axis": "y", "from": 0.5, "to": 1.0, "shift": -1.2,
                        "faces": ["sides", "front"]}]},
    "throat": {"ramp": "lamp", "tone": 3.4, "light": 0, "brush": {"off": True}, "layers": [
        {"id": "core", "op": "gradient", "axis": "z", "amount": -1.6},
        {"id": "flick", "op": "patches", "scale": 0.8, "threshold": 0.55, "shift": 1.0}]},
    "eye": {"ramp": "ember", "tone": 4.6, "light": 0, "brush": {"off": True}, "layers": [
        {"id": "pupil", "op": "rect", "rect": [0.0, 0.0, 0.5, 1.0], "tone": 6.0, "faces": ["flanks"]}]},
    "horn": {"ramp": "bone", "tone": 5.6, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
             "brush": {"flow": "long", "length": 3, "rough": 0.5, "textures": {"bone": "wood"}},
             "layers": [{"id": "rings", "op": "stripes", "axis": "z", "period": 1.6, "width": 0.25, "shift": -1.0,
                         "wobble": 0.2},
                        {"id": "tip", "op": "gradient", "axis": "z", "amount": -1.0}]},
    "horn_tip": {"ramp": "bone", "tone": 6.0, "rim": {"light_shift": 1.4, "dark_shift": -1.0},
                 "brush": {"flow": "long", "length": 2}, "layers": [
                     {"id": "tip", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "belly": {"ramp": "bone", "tone": 3.2, "rim": {"light_shift": 1.2, "dark_shift": -1.2},
              "brush": {"flow": "x", "length": 3, "rough": 0.5},
              "layers": [{"id": "scutes", "op": "stripes", "axis": "y", "period": 1.4, "width": 0.3, "shift": -1.4,
                          "wobble": 0.15, "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 0.8}},
                         {"id": "mottle", "op": "noise", "scale": 2.0, "amount": 0.4},
                         dict(tp.GRIME, amount=1.0)]},
    "tooth": {"ramp": "bone", "tone": 6.6, "rim": {"light_shift": 1.2, "dark_shift": -1.4}, "brush": {"off": True},
              "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 0.8}]},
    "bone": {"ramp": "bone", "tone": 4.6, "rim": {"light_shift": 1.4, "dark_shift": -1.2},
             "brush": {"flow": "long", "length": 2}, "layers": [tp.MOTTLE]},
    "spike": {"ramp": "iron", "tone": 6.4, "rim": {"light_shift": 1.8, "dark_shift": -1.2},
              "brush": {"flow": "long", "length": 2.5}, "layers": [
                  {"id": "gold_tip", "op": "band", "axis": "y", "from": 0.65, "to": 1.0, "ramp": "brass",
                   "tone": 4.2},
                  {"id": "grain", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.3, "shift": -0.6}]},
    "wing_bone": {"ramp": "iron", "tone": 6.6, "rim": {"light_shift": 1.8, "dark_shift": -1.2},
                  "brush": {"flow": "long", "length": 3}, "layers": [GOLD_EDGE, tp.MOTTLE]},
    "membrane": {"ramp": "leather", "tone": 4.6, "rim": {"light_shift": 1.2, "dark_shift": -1.0},
                 "brush": {"flow": "y", "length": 2.5, "rough": 0.65, "textures": {"leather": "leather"}},
                 "layers": [{"id": "veins", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.2, "shift": -1.2,
                             "wobble": 0.4},
                            {"id": "mottle", "op": "noise", "scale": 1.5, "amount": 0.5},
                            dict(tp.GRIME, amount=-0.6)]},
    "stack": {"ramp": "iron", "tone": 5.4, "rim": {"light_shift": 1.6, "dark_shift": -1.0},
              "brush": {"flow": "y", "length": 3, "rough": 0.6},
              "layers": [dict(PLATES, along="y", size=[1.5, 2.0]), tp.MOTTLE,
                         {"id": "soot", "op": "drip", "shift": -1.0, "depth": 0.3, "length": 2.0, "width": 0.5}]},
    "stack_top": {"ramp": "brass", "tone": 3.8, "rim": {"light_shift": 1.6, "dark_shift": -1.0},
                  "brush": {"off": True},
                  "layers": [{"id": "flue", "op": "rect", "rect": [0.2, 0.2, 0.8, 0.8], "ramp": "coal", "tone": 0.5,
                              "faces": ["top"]},
                             {"id": "glow", "op": "rect", "rect": [0.4, 0.4, 0.6, 0.6], "ramp": "ember", "tone": 2.0,
                              "faces": ["top"]}]},
    "plough_slat": {"ramp": "iron", "tone": 6.2, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
                    "brush": {"flow": "long", "length": 3}, "layers": [tp.MOTTLE, dict(tp.GRIME, amount=1.0)]},
    "gold_bar": {"ramp": "brass", "tone": 4.0, "rim": tp.RIM, "brush": {"flow": "long", "length": 3},
                 "layers": [tp.MOTTLE]},
    "cab_roof": {"ramp": "iron", "tone": 6.0, "rim": tp.RIM, "brush": {"flow": "z", "length": 3},
                 "layers": [dict(PLATES, size=[2.5, 2.0], faces=["top"]), tp.MOTTLE, GOLD_EDGE]},
})
styles["beam"]["layers"] = [l for l in styles["beam"]["layers"] if l.get("id") != "chips"]
styles["fire"]["ramp"] = "fire"

# ------------------------------------------------------------------ clips
WING_FLARE = {"axis": "z", "keys": [[0, 0], [0.2, 6, "in"], [0.45, -46, "out_back"], [0.8, -40], [1.2, 0, "elastic"]]}
bob_run = tp.chuff_bob(0.3, 4)
run = {"length": 1.0, "loop": True, "tracks": tp.run_tracks(bob_run) + [
    {"part": "chassis", "channel": "position", "ease": "linear", "keys": tp._keys(lambda u: [0, round(bob_run(u), 4), 0])},
    {"part": "chassis", "axis": "x", "osc": {"amp": 0.6, "cycles": 2, "phase": 0.1}},
    tp.stack_puffs(),
    {"part": "head", "axis": "y", "raw": True, "osc": {"amp": 4.0, "cycles": 1}},
    {"part": "head", "axis": "x", "osc": {"amp": 2.0, "cycles": 2, "phase": 0.2}},
    {"part": "jaw", "axis": "x", "osc": {"amp": 2.5, "cycles": 4, "phase": 0.35, "bias": 1.0}},
    {"part": "wing", "axis": "z", "osc": {"amp": 7.0, "cycles": 4, "phase": 0.1, "bias": -3.0}},
    {"part": "wing_membrane", "axis": "z", "osc": {"amp": 5.0, "cycles": 4, "phase": 0.25}},
    {"part": "horn_tip", "axis": "x", "osc": {"amp": 2.0, "cycles": 4, "phase": 0.3}},
] + tp.flicker("firebox", 1.0, amps=(0.05, 0.03), cycles=(5, 9)) + tp.flicker("lamp", 1.0, amps=(0.05, 0.03))
    + tp.flicker("eye", 1.0, amps=(0.08, 0.05), cycles=(6, 10))}

bob_idle = lambda u: 0.18 * (0.5 - 0.5 * math.cos(2 * math.pi * 2 * u))  # noqa: E731
idle = {"length": 2.0, "loop": True, "tracks": tp.counter_bob_tracks(bob_idle, 2.0) + [
    {"part": "chassis", "channel": "position", "ease": "linear",
     "keys": tp._keys(lambda u: [0, round(bob_idle(u), 4), 0], 2.0, n=24)},
    {"part": "smokestack", "channel": "scale", "osc": {"amp": [0.05, 0.09, 0.05], "cycles": 2, "phase": 0.15}},
    {"part": "head", "axis": "x", "osc": {"amp": 2.5, "cycles": 1, "phase": 0.1}},
    {"part": "head", "axis": "y", "raw": True, "osc": {"amp": 3.0, "cycles": 1, "phase": 0.3}},
    {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.9, 0], [1.15, 7, "out"], [1.45, 2], [1.8, 0]]},
    {"part": "wing", "axis": "z", "osc": {"amp": 3.0, "cycles": 1, "phase": 0.2}},
    {"part": "eye", "channel": "scale", "keys": [[0, [0, 0, 0]], [1.4, [0, 0, 0]], [1.46, [0, -0.8, 0]],
                                                 [1.54, [0, 0, 0]], [2.0, [0, 0, 0]]]},
] + tp.flicker("firebox", 2.0, amps=(0.06, 0.04), cycles=(9, 14)) + tp.flicker("lamp", 2.0, amps=(0.06, 0.04),
                                                                                 cycles=(11, 17))}

whistle = {"length": 1.0, "loop": False, "tracks": [
    {"part": "chassis", "channel": "position", "keys": [
        [0, [0, 0, 0]], [0.14, [0, 0, 0]], [0.36, [0, 3.2, 0], "out"], [0.56, [0, 0, 0], "in"],
        [0.68, [0, 0.8, 0], "out"], [0.8, [0, 0, 0], "in"], [1.0, [0, 0, 0]]]},
    {"part": "chassis", "channel": "scale", "keys": [
        [0, [0, 0, 0]], [0.14, [0.06, -0.1, 0.04], "out"], [0.3, [-0.04, 0.09, -0.03], "out"],
        [0.56, [0.07, -0.11, 0.05], "in"], [0.66, [-0.02, 0.04, -0.01], "out"], [1.0, [0, 0, 0], "elastic"]]},
    {"part": "chassis", "axis": "x", "keys": [[0, 0], [0.14, 2, "out"], [0.36, -4, "out"], [0.56, 1.5, "in"],
                                              [1.0, 0, "elastic"]]},
    {"part": "smokestack", "channel": "scale", "keys": [
        [0, [0, 0, 0]], [0.12, [-0.06, -0.12, -0.06], "out"], [0.32, [0.38, 0.55, 0.38], "out_back"],
        [0.6, [0.1, 0.16, 0.1], "out"], [1.0, [0, 0, 0], "elastic"]]},
    {"part": "head", "axis": "x", "keys": [[0, 0], [0.14, 6, "out"], [0.36, -16, "out_back"], [0.7, -10],
                                           [1.0, 0, "elastic"]]},
    {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.2, 0], [0.36, 18, "out_back"], [0.7, 14], [1.0, 0]]},
    {"part": "wing", "axis": "z", "keys": [[0, 0], [0.36, -18, "out_back"], [1.0, 0, "elastic"]]},
    {"part": "lamp", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.36, [0.2, 0.3, 0.1], "out_back"],
                                                  [1.0, [0, 0, 0], "elastic"]]},
]}

roar = {"length": 1.2, "loop": False, "tracks": [
    # anticipation: dip and pull back, then rear up with the jaw flung open, hold and shake, settle elastic
    {"part": "head", "axis": "x", "keys": [[0, 0], [0.22, 12, "out"], [0.45, -30, "out_back"], [0.62, -26],
                                           [0.8, -29], [1.2, 0, "elastic"]]},
    {"part": "head", "axis": "z", "raw": True, "keys": [[0, 0], [0.45, 0], [0.52, 4], [0.6, -4], [0.68, 3],
                                                        [0.76, -2], [0.84, 0], [1.2, 0]]},
    {"part": "head", "channel": "position", "keys": [[0, [0, 0, 0]], [0.22, [0, -0.6, -0.8], "out"],
                                                     [0.45, [0, 1.0, 0.6], "out_back"], [0.8, [0, 0.8, 0.4]],
                                                     [1.2, [0, 0, 0], "elastic"]]},
    {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.22, -6, "out"], [0.45, 38, "out_back"], [0.62, 32],
                                          [0.8, 36], [1.2, 0, "elastic"]]},
    dict(WING_FLARE, part="wing"),
    {"part": "wing", "axis": "y", "keys": [[0, 0], [0.45, -24, "out_back"], [0.8, -20], [1.2, 0, "elastic"]]},
    {"part": "wing_membrane", "axis": "z", "keys": [[0, 0], [0.5, -20, "out_back"], [1.2, 0, "elastic"]]},
    {"part": "frill", "axis": "y", "keys": [[0, 0], [0.45, -28, "out_back"], [1.2, 0, "elastic"]]},
    {"part": "chassis", "channel": "position", "keys": [[0, [0, 0, 0]], [0.22, [0, 0, -0.5], "out"],
                                                        [0.45, [0, 0.8, 0.4], "out"], [0.8, [0, 0.6, 0.3]],
                                                        [1.2, [0, 0, 0], "out"]]},
    {"part": "chassis", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.22, [0.04, -0.07, 0.03], "out"],
                                                     [0.45, [-0.03, 0.06, -0.02], "out_back"],
                                                     [1.2, [0, 0, 0], "elastic"]]},
    {"part": "lamp", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.45, [0.3, 0.5, 0.2], "out_back"],
                                                  [0.8, [0.25, 0.4, 0.15]], [1.2, [0, 0, 0], "elastic"]]},
    {"part": "eye", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.22, [0, -0.5, 0]], [0.45, [0.3, 0.4, 0.3],
                                                                                         "out_back"],
                                                 [1.2, [0, 0, 0], "elastic"]]},
    {"part": "smokestack", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.5, [0.25, 0.4, 0.25], "out_back"],
                                                        [1.2, [0, 0, 0], "elastic"]]},
]}

spec = {
    "name": "Dragon Locomotive",
    "description": "An iron steam engine whose boiler ends in a fierce cast-iron dragon head: scaled green-black iron "
                   "with tarnished gold, swept-back bone horns, deep-set glowing eyes, a furnace-lit throat for a "
                   "headlamp, a spiked chimney, fanned spines and small folded wings (Winterworks mod vehicle). "
                   "Front = +Z, rail top y = 0; Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 3200, "colors": 120},
    "light": tp.LIGHT,
    "brush": dict(tp.BRUSH, textures=dict(tp.BRUSH["textures"], bone="wood", leather="leather")),
    "minecraft": {"fps": 12, "glow_parts": ["lamp", "firebox", "eye"],
                  "tint_parts": sorted(p["id"] for p in b.P if p["id"].startswith("trim"))},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#171a1a", "hero": [-55, 18], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": b.P,
    "animations": {"run": run, "idle": idle, "whistle": whistle, "roar": roar},
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/dragon_locomotive.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(b.P), "parts")
