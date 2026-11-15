"""Builds examples/trailer_cart.json: the Trailer Cart, a flatbed wagon minecart skin for hauling stuff and people.

    python examples/src/trailer_cart.py examples/trailer_cart.json

A weathered oak plank deck over a dark wooden chassis, low kickboards and posts with a padded (dyeable) top rail,
a wool bench at the back, a crate (and a smaller one on top, set askew), rope coils, a drawbar at the front, and a
lantern swinging from the bracket of a leaning corner post. Units are Minecraft pixels, density 1
(see cart_parts.py for the shared contract).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cart_parts import WHEEL_R, WHEEL_Z, WOOL, Cart, add_wheels, dump, spin_tracks, wool_styles  # noqa: E402

c = Cart()

# ------------------------------------------------------------------ chassis (the tub's floor) and the deck on it
c.box("tub", None, [10, 3, 18], [0, 3, 0], "chassis", offset=[0, 2.5, 0])
for name, z in (("axle_f", WHEEL_Z), ("axle_b", -WHEEL_Z)):
    c.box(name, "tub", [10, 1, 1], [0, WHEEL_R, z], "axle", hide=["left", "right"])
add_wheels(c, wood="frame")
c.box("deck", "tub", [14, 1, 22], [0, 7.5, 0], "deck")
# the drawbar out front, dipping a little, with a towing ring
c.box("hitch", "tub", [2, 1, 6], [0, 5.5, 9], "frame", offset=[0, 0, 3], rot=[8, 0, 0])
c.box("hitch_ring", "hitch", [1, 2, 2], [0, 0, 6.2], "iron_bit", rel=True)

# ------------------------------------------------------------------ the four low walls: kickboards on the deck
c.box("wall_l", "tub", [1, 1, 22], [6.5, 8.5, 0], "kick")
c.box("wall_r", "tub", [1, 1, 22], [-6.5, 8.5, 0], "kick")
c.box("wall_f", "tub", [12, 1, 1], [0, 8.5, 10.5], "kick_x")
c.box("wall_b", "tub", [12, 1, 1], [0, 8.5, -10.5], "kick_x")
# posts holding up the rail (the front-left corner is the lantern post)
for k, (x, z) in enumerate([(-6.5, 10.5), (6.5, -10.5), (-6.5, -10.5), (6.5, 3.5), (-6.5, 3.5), (6.5, -3.5),
                            (-6.5, -3.5)]):
    c.box(f"post_{k}", "tub", [2, 3, 2], [x, 9.5, z], "post")
# the padded top rail (dyeable): front piece + children
c.box("trim", "tub", [11, 1, 2], [0, 11.5, 10.5], "trim")
c.box("trim_l", "trim", [2, 1, 23], [6.5, 11.5, 0], "trim")
c.box("trim_r", "trim", [2, 1, 23], [-6.5, 11.5, 0], "trim")
c.box("trim_b", "trim", [11, 1, 2], [0, 11.5, -10.5], "trim")

# ------------------------------------------------------------------ the bench at the back: wooden frame, wool cushion
c.box("bench", "deck", [10, 1, 4], [0, 8.5, -6.5], "frame")
c.box("seat", "bench", [10, 2, 5], [0, 10, -6.3], "seat")
c.box("seat_back", "bench", [10, 4, 1], [0, 9.6, -8.6], "seat", offset=[0, 2, 0], rot=[-12, 0, 0])

# ------------------------------------------------------------------ cargo: a crate set askew, rope coils
c.box("crate", "deck", [6, 6, 6], [-2.5, 8, 5.0], "crate", offset=[0, 3, 0], rot=[0, 17, 0])
c.box("crate_small", "crate", [4, 4, 4], [0.3, 6, -0.3], "crate_small", offset=[0, 2, 0], rot=[0, -31, 3],
      rel=True)
c.box("rope", "deck", [4, 1, 4], [3.0, 8.5, 1.0], "rope", rot=[5, 24, -6])
c.box("rope_1", "rope", [4, 1, 4], [0.2, 0.9, -0.1], "rope", rot=[-7, 21, 4], rel=True)
c.box("rope_hang", "trim_r", [1, 4, 4], [-7.7, 9.8, -1], "rope_side", rot=[0, 0, 10])

# ------------------------------------------------------------------ the lantern post: front-left corner, leaning out
c.box("lamp_post", "deck", [2, 13, 2], [6.5, 8, 10.5], "post", offset=[0, 6.5, 0], rot=[-5, 0, -7])
c.box("lamp_arm", "lamp_post", [1, 1, 5], [0, 12.4, 0.6], "frame", offset=[0, 0, 2], rot=[6, 0, 0], rel=True)
c.box("lamp_brace", "lamp_post", [1, 1, 4], [0, 10.6, 0.6], "frame", offset=[0, 0, 1.6], rot=[-42, 0, 0], rel=True)
# hanging from the hook at the end of the arm; pivot = the hook, so it swings
c.box("lantern", "lamp_arm", [3, 4, 3], [0, -0.4, 4.2], "glass", offset=[0, -3.5, 0], rot=[-6, 0, 7], rel=True)
c.box("lantern_cap", "lantern", [4, 1, 4], [0, -1.0, 0], "lamp_iron", rel=True)
c.box("lantern_ring", "lantern", [1, 1, 1], [0, 0, 0], "lamp_iron", rel=True)
c.box("lantern_base", "lantern", [4, 1, 4], [0, -6.0, 0], "lamp_iron", rel=True)

ramps = {
    "oak": ["#1b140e", "#291e15", "#392b1d", "#4b3926", "#5e4830", "#71583b", "#856947", "#987b55", "#aa8d66",
            "#bb9f79"],
    "frame": ["#110d0b", "#1b1511", "#271e18", "#34291f", "#433427", "#524031", "#624d3b", "#735c47"],
    "crate": ["#261e15", "#3a2e1e", "#504029", "#665335", "#7c6742", "#917a51", "#a48d63", "#b6a077"],
    "rope": ["#211a11", "#372c1b", "#4e4126", "#665632", "#7d6b40", "#938150", "#a69563", "#b8a978"],
    "iron": ["#0f1013", "#1a1c20", "#272a2f", "#373a40", "#4a4d53", "#5f6268", "#76797d", "#8f9194"],
    "flame": ["#3b1c08", "#6e3510", "#a8561a", "#d88226", "#f2ae3e", "#fcd468", "#fff0a8", "#fffbe6"],
    "wool": WOOL,
}

GRAIN = {"length": 3.5, "rough": 0.55}
styles = {
    **wool_styles(),
    "deck": {"ramp": "oak", "tone": 5.6, "brush": dict(GRAIN, flow="z", length=4.0), "layers": [
        {"id": "seams", "op": "stripes", "axis": "x", "period": 2.333, "width": 0.3, "phase": 0.08, "shift": -1.7},
        {"id": "butts", "op": "stripes", "axis": "z", "period": 11.0, "width": 0.07, "phase": 0.3, "shift": -1.4,
         "faces": ["top"], "wobble": 0.0},
        {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.7},
        {"id": "weather", "op": "patches", "scale": 2.2, "threshold": 0.6, "shift": -1.0},
        {"id": "bleach", "op": "patches", "scale": 1.6, "threshold": 0.7, "shift": 0.8, "seed": 5},
        {"id": "edge", "op": "fill", "tone": 4.2, "faces": ["sides"]}]},
    "chassis": {"ramp": "frame", "tone": 4.0, "brush": dict(GRAIN, flow="z"), "layers": [
        {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.6},
        {"id": "straps", "op": "stripes", "axis": "z", "period": 6.0, "width": 0.17, "phase": 0.08,
         "ramp": "iron", "tone": 3.6, "faces": ["sides", "bottom"]},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "frame": {"ramp": "frame", "tone": 4.6, "brush": dict(GRAIN, flow="long"), "layers": [
        {"id": "grain", "op": "noise", "scale": 1.2, "amount": 0.6}]},
    "kick": {"ramp": "oak", "tone": 5.0, "brush": dict(GRAIN, flow="z"), "layers": [
        {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.6},
        {"id": "nails", "op": "rivets", "inset": 0, "spacing": 7, "ramp": "iron", "tone": 4.0, "highlight": 1.0,
         "shadow": -1.0, "min_size": 2, "faces": ["sides"]}]},
    "kick_x": {"ramp": "oak", "tone": 5.0, "brush": dict(GRAIN, flow="x"), "layers": [
        {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.6}]},
    "post": {"ramp": "frame", "tone": 4.8, "brush": dict(GRAIN, flow="y"), "layers": [
        {"id": "grain", "op": "noise", "scale": 1.2, "amount": 0.6},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2}]},
    "axle": {"ramp": "iron", "tone": 2.4},
    "tyre": {"ramp": "iron", "tone": 3.6, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "hub": {"ramp": "iron", "tone": 4.6, "brush": {"off": True}},
    "iron_bit": {"ramp": "iron", "tone": 4.0, "brush": {"off": True}},
    "crate": {"ramp": "crate", "tone": 5.6, "brush": dict(GRAIN, flow="horizontal", length=3.0), "layers": [
        {"id": "grain", "op": "noise", "scale": 1.2, "amount": 0.6},
        {"id": "boards", "op": "stripes", "axis": "y", "period": 1.667, "width": 0.3, "shift": -0.9,
         "faces": ["sides"]}],
        # a dark frame round every face and a diagonal brace across the sides
        "stamps": [{"faces": ["sides", "top"], "at": [0, 0],
                    "art": ["ffffff", "fb...f", "f.b..f", "f..b.f", "f...bf", "ffffff"],
                    "key": {"f": "crate:2", "b": "crate:6"}},
                   {"faces": ["sides"], "at": [0, 0], "art": ["hhhhh.", "h.....", "h.....", "h.....", "h....."],
                    "key": {"h": "crate:5"}}]},
    "crate_small": {"ramp": "crate", "tone": 5.4, "brush": dict(GRAIN, flow="horizontal", length=2.0),
                    "layers": [{"id": "grain", "op": "noise", "scale": 1.0, "amount": 0.6}],
                    "stamps": [{"faces": ["sides", "top"], "at": [0, 0], "art": ["ffff", "fb.f", "f.bf", "ffff"],
                                "key": {"f": "crate:3", "b": "crate:6"}}]},
    "rope": {"ramp": "rope", "tone": 4.8, "brush": {"off": True}, "layers": [
        {"id": "twist", "op": "stripes", "axis": [1, 0, 1], "period": 1.4, "width": 0.4, "shift": -1.1}],
        # the coil's hole and the turns of rope round it
        "stamps": [{"face": "top", "at": [0, 0], "art": ["_tl_", "tddl", "sddt", "_st_"],
                    "key": {"t": "rope:4", "l": "rope:6", "s": "rope:3", "d": "rope:0"}},
                   {"faces": ["sides"], "at": [0, 0], "art": ["_.._"], "key": {}}]},
    "rope_side": {"ramp": "rope", "tone": 4.6, "brush": {"off": True}, "layers": [
        {"id": "twist", "op": "stripes", "axis": [0, 1, 1], "period": 1.4, "width": 0.4, "shift": -1.1}],
        "stamps": [{"faces": ["left", "right"], "at": [0, 0], "art": ["_tl_", "tddl", "sddt", "_st_"],
                    "key": {"t": "rope:4", "l": "rope:6", "s": "rope:3", "d": "rope:0"}},
                   {"faces": ["front", "back", "top", "bottom"], "at": [0, 0], "art": ["_", ".", ".", "_"],
                    "key": {}}]},
    "lamp_iron": {"ramp": "iron", "tone": 3.0, "brush": {"off": True}, "rim": {"light_shift": 1.4}},
    # the lantern glass: warm panes round a white-hot wick, the iron cage is the cap, base and ring
    "glass": {"ramp": "flame", "tone": 4.6, "light": 0.25, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
              "layers": [{"id": "heat", "op": "gradient", "axis": "y", "amount": -0.8}],
              "stamps": [{"faces": ["sides"], "at": [0, 0], "art": ["bgb", "gcg", "bwb", "gcg"],
                          "key": {"b": "flame:3", "g": "flame:5", "c": "flame:6", "w": "flame:7"}},
                         {"faces": ["bottom"], "at": [0, 0], "art": ["bgb", "gcg", "bgb"],
                          "key": {"b": "flame:2", "g": "flame:4", "c": "flame:5"}}]},
}

LANTERN = ["lantern"]
anim = {
    # rolling: the lantern swings fore and aft (lagging the cart), the deck and its cargo rattle on the rails
    "run": {"length": 1.0, "loop": True, "tracks": spin_tracks() + [
        {"part": "lantern", "axis": "x", "keys": [[0, 2], [0.25, 15, "out"], [0.5, -5], [0.75, 13, "out"],
                                                 [1.0, 2]], "ease": "smooth"},
        {"part": "lantern", "axis": "z", "osc": {"amp": 6, "cycles": 1, "phase": 0.2}},
        {"part": "deck", "channel": "position", "osc": {"amp": [0, 0.35, 0], "cycles": 4, "shape": "bounce"}},
        {"part": "deck", "axis": "z", "osc": {"amp": 0.8, "cycles": 3, "phase": 0.1}},
        {"part": "deck", "axis": "x", "osc": {"amp": 0.5, "cycles": 2, "phase": 0.3}},
        {"part": "crate", "channel": "position", "osc": {"amp": [0, 0.4, 0], "cycles": 4, "phase": 0.3,
                                                          "shape": "bounce"}},
        {"part": "crate_small", "axis": "y", "osc": {"amp": 4, "cycles": 2, "phase": 0.2}},
        {"part": "rope_1", "channel": "position", "osc": {"amp": [0, 0.3, 0], "cycles": 4, "phase": 0.6,
                                                           "shape": "bounce"}},
        {"part": "rope_hang", "axis": "z", "osc": {"amp": 8, "cycles": 2, "phase": 0.15}},
        {"part": "lamp_post", "axis": "x", "osc": {"amp": 1.2, "cycles": 2, "phase": 0.4}},
    ]},
    # parked: the lantern drifts round on its hook, the flame breathes
    "idle": {"length": 2.0, "loop": True, "tracks": [
        {"part": "lantern", "axis": "x", "osc": {"amp": 6, "cycles": 1}},
        {"part": "lantern", "axis": "z", "osc": {"amp": 4, "cycles": 1, "phase": 0.25}},
        {"part": "lantern", "channel": "scale", "osc": {"amp": [0.03, 0.05, 0.03], "cycles": 4}},
        {"part": "rope_hang", "axis": "z", "osc": {"amp": 2, "cycles": 1, "phase": 0.4}},
    ]},
}

spec = {
    "name": "Trailer Cart",
    "description": "A flatbed wagon minecart skin (Winterworks mod): weathered oak deck on a dark chassis, low "
                   "kickboards and posts, a wool bench, a crate set askew, rope coils, a drawbar and a lantern "
                   "swinging from a leaning corner post. Dyeable padded rail (trim) and cushion (seat). Minecraft "
                   "pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 900, "colors": 72},
    "light": {"dir": [-0.4, 1.0, 0.5], "strength": 0.6, "gradient": 0.5, "ao": 0.8, "ao_height": 7.0},
    "brush": {"flow": "z", "length": 3.0, "rough": 0.6, "width": 0.6, "overshoot": 0.3, "marks": 0.8,
              "textures": {"oak": "wood", "frame": "wood", "crate": "wood", "iron": "metal", "wool": "cloth"}},
    "minecraft": {"fps": 12, "glow_parts": LANTERN, "tint_parts": ["trim", "trim_l", "trim_r", "trim_b", "seat",
                                                                   "seat_back"]},
    # the wheels are square boxes with punched corners: their (invisible) corners dip under the rail as they roll
    "anim_ground_tolerance": 1.3,
    "render": {"background": "#1a1e24", "hero": [-38, 22], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": c.P,
    "animations": anim,
}

if __name__ == "__main__":
    dump(spec, sys.argv[1] if len(sys.argv) > 1 else "examples/trailer_cart.json")
