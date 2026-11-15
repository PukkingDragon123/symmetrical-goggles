"""Builds examples/locomotive.json: the Iron Locomotive, a little riveted steam tank engine (Winterworks mod vehicle).

    python examples/src/locomotive.py examples/locomotive.json

Replaces a minecart's look on rails: centred on x = z = 0, rail top at y = 0, runs toward +Z (front = +Z,
back = -Z). Minecraft pixel units, density 1: every box exports 1:1 to a vanilla entity model
(python -m lowpix mc export). Shared running gear, cab and clips live in train_parts.py.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import train_parts as tp  # noqa: E402

b = tp.Parts()
tp.build_chassis(b)
tp.build_cab(b)

# ------------------------------------------------------------------ boiler: three stacked boxes = a stepped round
BY, BZ = 15.5, 4.0          # boiler centre line and centre along Z (z -1..9)
b.box("boiler", "chassis", [10, 6, 10], [0, BY, BZ], "boiler", hide=["front", "back"])
b.box("boiler_v", "boiler", [6, 10, 10], [0, 0, 0], "boiler", hide=["front", "back"])
b.box("boiler_m", "boiler", [8, 8, 10], [0, 0, 0], "boiler", hide=["front", "back"])
b.box("trim_boiler", "trim", [11, 1, 10], [0, BY - 9.5, BZ], "trim", hide=["front", "back"])
# handrails on stanchions
b.box("handrail", "boiler", [1, 1, 10], [5.4, 3.6, 0.5], "steel", mirror=True)
for k, z in enumerate((-3.0, 1.0, 4.5)):
    b.box(f"stanchion{k}", "handrail", [1, 1, 1], [-0.6, -0.5, z], "steel_dark", mirror=True)
# dome (brass, octagonal from two boxes), whistle and safety valve
b.box("dome", "boiler", [4, 2, 4], [0, 4.9, 0.5], "brass", offset=[0, 0.5, 0], hide=["bottom"])
b.box("dome_oct", "dome", [4, 2, 4], [0, 0.04, 0], "brass", offset=[0, 0.5, 0], rot=[0, 45, 0], hide=["bottom"])
b.box("dome_cap", "dome", [3, 1, 3], [0, 2.0, 0], "brass", hide=["bottom"])
b.box("dome_cap_oct", "dome_cap", [3, 1, 3], [0, 0.04, 0], "brass", rot=[0, 45, 0], hide=["bottom"])
b.box("whistle", "boiler", [1, 2, 1], [0, 5.2, -4.2], "brass", offset=[0, 1, 0])
b.box("whistle_bell", "whistle", [2, 1, 2], [0, 2.4, 0], "brass", rot=[0, 45, 0])
b.box("safety_valve", "boiler", [2, 2, 2], [0, 4.9, -2.4], "brass", offset=[0, 0.5, 0], rot=[0, 45, 0])

# sand dome, outside steam pipes (smokebox -> steam chests), cab number plates, bunker grab rails
b.box("sand_dome", "boiler", [3, 2, 3], [0, 4.9, 3.6], "iron_cap", offset=[0, 0.5, 0], hide=["bottom"])
b.box("sand_dome_oct", "sand_dome", [3, 2, 3], [0, 0.04, 0], "iron_cap", offset=[0, 0.5, 0], rot=[0, 45, 0],
      hide=["bottom"])
b.box("sand_cap", "sand_dome", [2, 1, 2], [0, 1.9, 0], "brass", rot=[0, 22.5, 0])
b.box("steam_pipe", "chassis", [1, 5, 2], [4.9, 15.6, 10.2], "pipe", offset=[0, -2.5, 0], rot=[-8, 0, 15],
      mirror=True)
b.box("number_plate", "cab_side", [1, 2, 4], [0.6, 0.6, 0.0], "plate", mirror=True,
      paint={"stamps": [{"faces": ["flanks"], "at": "center", "art": ["....", ".nn."], "key": {"n": "brass:7"}}]})
b.box("grab_rail", "bunker", [1, 5, 1], [5.0, 0.5, -2.6], "steel", mirror=True)

# ------------------------------------------------------------------ smokebox, door and headlamp
SZ = 11.0                   # smokebox centre along Z (z 9..13)
b.box("smokebox", "chassis", [11, 7, 4], [0, BY, SZ], "smokebox")
b.box("smokebox_v", "smokebox", [7, 11, 4], [0, 0, 0], "smokebox")
b.box("smokebox_m", "smokebox", [9, 9, 4], [0, 0, 0], "smokebox")
DOOR = ["o.HHh.o",
        ".Hdddh.",
        "Hdpppdh",
        "hdddddr",
        "hdddddr",
        ".rdddr.",
        "o.rrr.o"]
b.box("smokebox_door", "smokebox", [7, 7, 1], [0, -1.0, 2.5], "door",
      paint={"stamps": [{"face": "front", "at": "center", "art": DOOR,
                         "key": {"o": "iron:2", "H": "iron:9", "h": "iron:7", "r": "iron:5", "d": "iron:3",
                                 "p": "brass:6"}}]})
b.box("door_dart", "smokebox_door", [3, 1, 1], [0, -0.4, 0.9], "steel_dark", rot=[0, 0, 28])
b.box("door_boss", "smokebox_door", [1, 1, 1], [0, -0.4, 1.1], "brass")
b.box("door_ring", "smokebox", [9, 9, 1], [0, -1.0, 2.05], "smokebox_ring", hide=["back"])
b.box("lamp_housing", "smokebox", [4, 3, 2], [0, 4.5, 2.5], "lamp_body")
b.box("lamp_hood", "lamp_housing", [4, 1, 3], [0, 1.6, 0.2], "lamp_body", rot=[12, 0, 0])
LENS = [".L.", "LWL", ".L."]
b.box("lamp", "lamp_housing", [3, 3, 1], [0, -0.1, 0.9], "lamp",
      paint={"stamps": [{"face": "front", "at": "center", "art": LENS, "key": {"L": "lamp:3", "W": "lamp:5"}}]})

# ------------------------------------------------------------------ the tall flared smokestack (pivot at its base)
b.box("smokestack", "smokebox", [3, 4, 3], [0, 5.3, 0], "stack", offset=[0, 2.0, 0], hide=["top", "bottom"])
b.box("stack_oct", "smokestack", [3, 4, 3], [0, 0, 0], "stack", offset=[0, 2.0, 0], rot=[0, 45, 0],
      hide=["top", "bottom"])
b.box("stack_base", "smokestack", [5, 1, 5], [0, 0.0, 0], "stack", hide=["bottom"])
b.box("stack_base_oct", "smokestack", [5, 1, 5], [0, -0.05, 0], "stack", rot=[0, 45, 0], hide=["bottom"])
b.box("stack_flare", "smokestack", [4, 1, 4], [0, 3.9, 0], "stack", rot=[0, 22.5, 0])
b.box("stack_flare_oct", "smokestack", [4, 1, 4], [0, 3.85, 0], "stack", rot=[0, 67.5, 0])
b.box("stack_crown", "smokestack", [5, 1, 5], [0, 4.9, 0], "stack_top")
b.box("stack_crown_oct", "smokestack", [5, 1, 5], [0, 4.85, 0], "stack_top", rot=[0, 45, 0], hide=["top"])

# ------------------------------------------------------------------ raked cowcatcher of angled slats
tp.cowcatcher(b)

# ------------------------------------------------------------------ paint
ramps = tp.base_ramps()
styles = tp.base_styles(iron_tone=5.4)
BANDS = {"id": "bands", "op": "stripes", "axis": "z", "space": "world", "period": 4.0, "width": 0.25, "phase": -2.0,
         "ramp": "brass", "tone": 3.4}
styles.update({
    "boiler": {"ramp": "iron", "tone": 5.6, "rim": tp.RIM, "brush": {"flow": "z", "length": 4.0, "rough": 0.5},
               "layers": [tp.MOTTLE, tp.PHOTO_IRON, dict(tp.GRIME, amount=0.6),
                          {"id": "rolled", "op": "stripes", "axis": "y", "period": 1.7, "width": 0.3, "shift": -0.6,
                           "wobble": 0.3, "faces": ["sides"]},
                          {"id": "rivets", "op": "rivets", "spacing": 3, "inset": 0, "shadow": -0.8, "highlight": 1.0,
                           "min_size": 6, "faces": ["sides"]},
                          BANDS, dict(tp.SOOT, depth=0.2, length=2.0)]},
    "smokebox": {"ramp": "iron", "tone": 4.0, "rim": tp.RIM, "brush": {"flow": "y", "length": 3, "rough": 0.65},
                 "layers": [tp.MOTTLE, tp.PHOTO_IRON,
                            {"id": "soot", "op": "drip", "shift": -1.0, "depth": 0.6, "length": 3.5, "width": 0.5,
                             "scale": 2.0, "faces": ["sides", "front", "back"]},
                            {"id": "rivets", "op": "rivets", "spacing": 2, "inset": 0, "shadow": -0.6,
                             "highlight": 1.2, "min_size": 4, "faces": ["back"]}]},
    "iron_cap": {"ramp": "iron", "tone": 5.0, "rim": tp.RIM, "brush": {"flow": "y", "length": 2},
                 "layers": [tp.MOTTLE, {"id": "soot", "op": "drip", "shift": -0.8, "depth": 0.2, "length": 1.5,
                                        "width": 0.5}]},
    "pipe": {"ramp": "iron", "tone": 4.4, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
             "brush": {"flow": "long", "length": 3}, "layers": [tp.MOTTLE,
                                                                 {"id": "flange", "op": "stripes", "axis": "y",
                                                                  "period": 4.0, "width": 0.25, "shift": 1.2}]},
    "plate": {"ramp": "brass", "tone": 3.0, "rim": {"light_shift": 1.8, "dark_shift": -1.0}, "brush": {"off": True}},
    "door": {"ramp": "iron", "tone": 4.8, "rim": tp.RIM, "brush": {"off": True}, "layers": [tp.MOTTLE]},
    "stack": {"ramp": "iron", "tone": 3.8, "rim": {"light_shift": 1.4, "dark_shift": -1.0},
              "brush": {"flow": "y", "length": 3, "rough": 0.6},
              "layers": [tp.MOTTLE, tp.PHOTO_IRON,
                         {"id": "soot", "op": "drip", "shift": -1.0, "depth": 0.3, "length": 2.0, "width": 0.5}]},
    "stack_top": {"ramp": "brass", "tone": 3.2, "rim": {"light_shift": 1.6, "dark_shift": -1.0}, "brush": {"off": True},
                  "layers": [{"id": "flue", "op": "rect", "rect": [0.2, 0.2, 0.8, 0.8], "ramp": "coal", "tone": 0.5,
                              "faces": ["top"]},
                             {"id": "glow", "op": "rect", "rect": [0.4, 0.4, 0.6, 0.6], "ramp": "fire", "tone": 1.0,
                              "faces": ["top"]}]},
    "lamp_body": {"ramp": "brass", "tone": 2.8, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
                  "brush": {"flow": "long", "length": 2},
                  "layers": [{"id": "tarnish", "op": "patches", "scale": 1.2, "threshold": 0.5, "shift": -1.4}]},
    "pilot": {"ramp": "iron", "tone": 4.6, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
              "brush": {"flow": "long", "length": 3}, "layers": [tp.MOTTLE, dict(tp.GRIME, amount=1.0)]},
    "pilot_bar": {"ramp": "red", "tone": 4.4, "rim": tp.RIM, "brush": {"flow": "long", "length": 3},
                  "layers": [tp.MOTTLE, {"id": "chips", "op": "wear", "width": 1, "density": 0.3, "ramp": "iron",
                                         "tone": 2.5}]},
    "smokebox_ring": {"ramp": "iron", "tone": 4.0, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
                      "brush": {"off": True}, "layers": [
                          {"id": "bolts", "op": "rivets", "spacing": 2, "inset": 0, "shadow": -0.6, "highlight": 1.4,
                           "min_size": 4, "faces": ["front"]}]},
})

# ------------------------------------------------------------------ clips
bob_run = tp.chuff_bob(0.3, 4)
run = {"length": 1.0, "loop": True, "tracks": tp.run_tracks(bob_run) + [
    {"part": "chassis", "channel": "position", "ease": "linear", "keys": tp._keys(lambda u: [0, round(bob_run(u), 4), 0])},
    {"part": "chassis", "axis": "x", "osc": {"amp": 0.6, "cycles": 2, "phase": 0.1}},
    tp.stack_puffs(),
    {"part": "dome", "channel": "scale", "osc": {"amp": [0.03, 0.05, 0.03], "cycles": 4, "phase": 0.2}},
    {"part": "lamp_housing", "axis": "x", "osc": {"amp": 1.5, "cycles": 4, "phase": 0.15}},
    {"part": "whistle", "axis": "z", "osc": {"amp": 2.0, "cycles": 4, "phase": 0.3}},
    {"part": "coal", "channel": "position", "osc": {"amp": [0, 0.2, 0], "cycles": 4, "phase": 0.3}},
] + tp.flicker("firebox", 1.0, amps=(0.05, 0.03), cycles=(5, 9)) + tp.flicker("lamp", 1.0, amps=(0.03, 0.02))}

bob_idle = lambda u: 0.18 * (0.5 - 0.5 * math.cos(2 * math.pi * 2 * u))  # noqa: E731
idle = {"length": 2.0, "loop": True, "tracks": tp.counter_bob_tracks(bob_idle, 2.0) + [
    {"part": "chassis", "channel": "position", "ease": "linear",
     "keys": tp._keys(lambda u: [0, round(bob_idle(u), 4), 0], 2.0, n=24)},
    {"part": "smokestack", "channel": "scale", "osc": {"amp": [0.05, 0.09, 0.05], "cycles": 2, "phase": 0.15}},
    {"part": "dome", "channel": "scale", "osc": {"amp": [0.02, 0.03, 0.02], "cycles": 2, "phase": 0.25}},
    {"part": "safety_valve", "channel": "scale", "osc": {"amp": [0.0, 0.12, 0.0], "cycles": 6, "shape": "pulse"}},
] + tp.flicker("firebox", 2.0, amps=(0.06, 0.04), cycles=(9, 14)) + tp.flicker("lamp", 2.0, amps=(0.04, 0.03),
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
    {"part": "whistle", "channel": "scale", "keys": [
        [0, [0, 0, 0]], [0.12, [0.3, 0.4, 0.3], "out_back"], [0.7, [0.25, 0.35, 0.25]], [1.0, [0, 0, 0], "elastic"]]},
    {"part": "whistle", "axis": "z", "keys": [[0, 0]] + [[round(0.14 + 0.05 * k, 3), 8 * (-1) ** k] for k in range(11)]
     + [[0.72, 0], [1.0, 0]]},
    {"part": "lamp", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.3, [0.25, 0.25, 0.1], "out_back"],
                                                  [1.0, [0, 0, 0], "elastic"]]},
    {"part": "dome", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.2, [0.1, 0.18, 0.1], "out_back"],
                                                  [1.0, [0, 0, 0], "elastic"]]},
]}

spec = {
    "name": "Locomotive",
    "description": "The Iron Locomotive: a little riveted iron steam tank engine with brass bands, a flared stack, "
                   "red spoked drivers, connecting rods, a cowcatcher and a coal bunker (Winterworks mod vehicle). "
                   "Front = +Z, rail top y = 0; Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 3200, "colors": 110},
    "light": tp.LIGHT,
    "brush": tp.BRUSH,
    "minecraft": {"fps": 12, "glow_parts": ["lamp", "firebox"],
                  "tint_parts": sorted(p["id"] for p in b.P if p["id"].startswith("trim"))},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#1a1d22", "hero": [-55, 18], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": b.P,
    "animations": {"run": run, "idle": idle, "whistle": whistle},
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/locomotive.json"
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(b.P), "parts")
