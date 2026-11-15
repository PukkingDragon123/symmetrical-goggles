"""Builds examples/fox_cart.json: the Fox Cart, a minecart skin shaped like a red fox (Winterworks mod).

    python examples/src/fox_cart.py examples/fox_cart.json

The tub is the fox's body (rust flanks, darker back, white belly and chest), the head rides on the front rim, the
forepaws stand at the front corners and a huge brush of a tail curls up over the back. Wooden undercarriage with
iron-shod wheels. Units are Minecraft pixels, density 1 (see cart_parts.py for the shared contract).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cart_parts import WOOL, Cart, add_trim, add_tub, add_wheels, dump, spin_tracks, wool_styles  # noqa: E402

c = Cart()


def lining(name, sx):
    """Walls: fur outside, a plank lining inside (the inner face is -X on the left wall, +X on the right)."""
    inner = "left" if sx > 0 else "right"
    return {"layers": [
        {"id": "lining", "op": "fill", "ramp": "wood", "tone": 3.6, "faces": [inner]},
        {"id": "lining_seams", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.34, "phase": 0.5,
         "shift": -1.6, "faces": [inner]},
        {"id": "lining_grain", "op": "noise", "scale": 1.5, "amount": 0.6, "faces": [inner]},
        {"id": "lining_shade", "op": "gradient", "axis": "y", "amount": 1.6, "faces": [inner]}]}


def end_lining(inner):
    return {"layers": [
        {"id": "lining", "op": "fill", "ramp": "wood", "tone": 3.6, "faces": [inner]},
        {"id": "lining_seams", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.34, "phase": 0.5,
         "shift": -1.6, "faces": [inner]},
        {"id": "lining_grain", "op": "noise", "scale": 1.5, "amount": 0.6, "faces": [inner]},
        {"id": "lining_shade", "op": "gradient", "axis": "y", "amount": 1.6, "faces": [inner]}]}


top = add_tub(c, hull="hull", side="flank", front="chest", back="rump", axle="axle", wall_h=6, side_paint=lining,
              front_paint=end_lining("back"), back_paint=end_lining("front"))
trims = add_trim(c, top)
add_wheels(c)
c.box("seat", "tub", [8, 2, 9], [0, 8, -3.5], "seat")

# ------------------------------------------------------------------ forelegs at the front corners (black socks),
# reaching forward and splayed a little, and the haunches bulging over the back wheels
c.box("leg", "tub", [2, 5, 2], [3.5, 8.5, 12], "sock", offset=[0, -2.5, 0], rot=[-18, 0, 8], mirror=True)
c.box("paw", "leg", [2, 1, 3], [0, -4.6, 0.6], "paw", offset=[0, 0, 0], rot=[18, 0, -8], rel=True)
c.box("haunch", "tub", [1, 5, 6], [7.4, 9.8, -6], "haunch", rot=[-10, 0, -3], mirror=True)

# ------------------------------------------------------------------ the head: leaning out on its ruff, cocked
c.box("neck", "tub", [6, 6, 4], [0, 8.5, 11.5], "ruff", offset=[0, 3, 0], rot=[14, 0, 0])
c.box("head", "neck", [8, 6, 6], [0, 5.5, 0.5], "head", offset=[0, 3, 1], rot=[-16, 12, 9], rel=True)
c.box("cheek", "head", [2, 3, 4], [3.8, 1.5, 1.2], "cheek", rot=[0, 14, -6], rel=True, mirror=True)
c.box("snout", "head", [4, 3, 3], [0, 1.5, 4], "snout", offset=[0, 0, 1.5], rot=[4, 0, 0], rel=True)
c.box("nose", "snout", [2, 1, 1], [0, 1, 3], "nose", offset=[0, 0, 0.5], rel=True)
# big triangular ears, angled out and back: a 4-wide base, a 2-wide middle flush with the outer edge, a 1px tip
# (children of a mirrored part are mirrored with it: no mirror flag on them)
c.box("ear", "head", [4, 2, 1], [2.3, 5.6, 0.6], "ear", offset=[0, 1, 0], rot=[-14, 0, -15], rel=True, mirror=True)
c.box("ear_mid", "ear", [2, 2, 1], [1, 2, 0], "ear_mid", offset=[0, 1, 0], rel=True)
c.box("ear_tip", "ear_mid", [1, 1, 1], [0.5, 2, 0], "ear_tip", offset=[0, 0.5, 0], rel=True)

# ------------------------------------------------------------------ the brush: a chain curling up and over to one side
c.box("tail", "tub", [5, 6, 5], [0, 10.5, -10.5], "tail", offset=[0, 2.5, 0], rot=[-52, 0, 7])
c.box("tail_1", "tail", [6, 7, 6], [0, 5, 0], "tail", offset=[0, 3, 0], rot=[26, 7, 8], rel=True)
c.box("tail_2", "tail_1", [5, 6, 5], [0, 5.5, 0], "tail_end", offset=[0, 2.5, 0], rot=[34, 6, 8], rel=True)
c.box("tail_tip", "tail_2", [3, 3, 3], [0, 5, 0], "tail_tip", offset=[0, 1, 0], rot=[32, 0, 6], rel=True)

ramps = {
    # red fox: rust orange, cool brown shadows, straw-gold lights
    "fox": ["#1a0e0c", "#2c150f", "#421d12", "#5a2815", "#73361a", "#8b4520", "#a05628", "#b26932", "#c28042",
            "#cf9858", "#dcb27a"],
    "cream": ["#25232a", "#3a373e", "#524e55", "#6c676c", "#878282", "#a39d98", "#bdb7ae", "#d2cdc2", "#e3dfd5",
              "#f1eee6"],
    "black": ["#0c0a0c", "#151113", "#1e1819", "#282020", "#342927", "#42342f", "#52413a"],
    "eye": ["#080506", "#1e1209", "#40260c", "#6a4214"],
    "wood": ["#16110e", "#221a14", "#30241b", "#3f3023", "#503e2d", "#624d38", "#755e45", "#887053", "#9b8364"],
    "iron": ["#0f1013", "#1a1c20", "#272a2f", "#373a40", "#4a4d53", "#5f6268", "#76797d", "#8f9194"],
    "wool": WOOL,
}

FUR = {"flow": "z", "length": 3.0, "rough": 0.6}
styles = {
    **wool_styles(),
    "flank": {"ramp": "fox", "tone": 6.2, "brush": dict(FUR, length=2.2, rough=0.5), "layers": [
        {"id": "dorsal", "op": "gradient", "axis": "y", "amount": -1.8},
        {"id": "saddle", "op": "band", "axis": "y", "from": 0.45, "to": 1.0, "wobble": 0.6, "wobble_scale": 2.0,
         "shift": -0.8},
        {"id": "belly", "op": "band", "axis": "y", "from": -1.0, "to": -0.66, "wobble": 0.5, "ramp": "cream",
         "tone": 6.0},
        {"id": "mottle", "op": "noise", "scale": 2.6, "amount": 0.55},
        {"id": "tufts", "op": "spots", "count": 10, "radius": [0.5, 1.0], "stretch": [1, 0.6, 2.2], "shift": 0.8,
         "faces": ["sides"]}]},
    "rump": {"ramp": "fox", "tone": 5.6, "brush": dict(FUR, flow="y"), "layers": [
        {"id": "dorsal", "op": "band", "axis": "y", "from": 0.4, "to": 1.0, "wobble": 0.3, "shift": -1.1},
        {"id": "belly", "op": "band", "axis": "y", "from": -1.0, "to": -0.55, "wobble": 0.4, "ramp": "cream",
         "tone": 5.6},
        {"id": "mottle", "op": "noise", "scale": 2.2, "amount": 0.7}]},
    "chest": {"ramp": "cream", "tone": 6.6, "brush": dict(FUR, flow="y"), "layers": [
        {"id": "sides", "op": "band", "axis": "x", "from": 0.62, "to": 1.0, "ramp": "fox", "tone": 5.8,
         "wobble": 0.4},
        {"id": "sides2", "op": "band", "axis": "x", "from": -1.0, "to": -0.62, "ramp": "fox", "tone": 5.8,
         "wobble": 0.4},
        {"id": "mottle", "op": "noise", "scale": 2.0, "amount": 0.6},
        {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4}]},
    "ruff": {"ramp": "cream", "tone": 7.0, "brush": dict(FUR, flow="y"), "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.6, "amount": 0.6},
        {"id": "nape", "op": "fill", "ramp": "fox", "tone": 5.2, "faces": ["back", "top"]}]},
    "hull": {"ramp": "wood", "tone": 4.0, "brush": {"flow": "z", "length": 3.5, "rough": 0.55},
             "layers": [
                 {"id": "seams", "op": "stripes", "axis": "x", "period": 2.5, "width": 0.4, "shift": -1.3,
                  "faces": ["top", "bottom"]},
                 {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.7},
                 {"id": "straps", "op": "stripes", "axis": "z", "period": 6.0, "width": 0.17, "phase": 0.08,
                  "ramp": "iron", "tone": 3.2, "faces": ["sides", "bottom"]},
                 {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6}]},
    "axle": {"ramp": "iron", "tone": 2.4},
    "tyre": {"ramp": "iron", "tone": 3.6, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "hub": {"ramp": "iron", "tone": 4.6, "brush": {"off": True}},
    "sock": {"ramp": "black", "tone": 3.2, "brush": dict(FUR, flow="y", length=2.0), "layers": [
        {"id": "blend", "op": "band", "axis": "y", "from": 0.55, "to": 1.0, "ramp": "fox", "tone": 4.4,
         "wobble": 0.5}]},
    "paw": {"ramp": "black", "tone": 3.0, "brush": {"off": True},
            "stamps": [{"face": "front", "at": [0, 0], "art": ["a.a"], "key": {"a": "black:0"}},
                       {"face": "top", "at": [0, 2], "art": ["a.a"], "key": {"a": "black:1"}}]},
    "head": {"ramp": "fox", "tone": 6.0, "brush": FUR, "layers": [
        {"id": "crown", "op": "band", "axis": "y", "from": 0.3, "to": 1.0, "shift": -0.9, "wobble": 0.4},
        {"id": "mottle", "op": "noise", "scale": 1.8, "amount": 0.5},
        # white lower cheeks and jowls on the face and sides
        {"id": "jowl", "op": "band", "axis": "y", "from": -1.0, "to": -0.3, "ramp": "cream", "tone": 6.8,
         "wobble": 0.35, "faces": ["front", "sides"]},
        {"id": "chin", "op": "fill", "ramp": "cream", "tone": 5.4, "faces": ["bottom"]}],
        "stamps": [
            # small natural eyes set close above the muzzle: a black pupil, one dark amber texel at the outer corner
            {"face": "front", "at": [1, 2], "art": ["oe"], "key": {"o": "eye:2", "e": "eye:0"}},
            {"face": "front", "at": [5, 2], "art": ["eo"], "key": {"o": "eye:2", "e": "eye:0"}}]},
    "cheek": {"ramp": "cream", "tone": 6.9, "brush": dict(FUR, flow="z", length=2.0), "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.4, "amount": 0.5},
        {"id": "top_fox", "op": "fill", "ramp": "fox", "tone": 6.0, "faces": ["top"]}]},
    "snout": {"ramp": "fox", "tone": 6.4, "brush": dict(FUR, length=2.0), "layers": [
        {"id": "muzzle", "op": "band", "axis": "y", "from": -1.0, "to": 0.2, "ramp": "cream", "tone": 7.0,
         "faces": ["front", "sides", "bottom"]}],
        "stamps": [{"face": "front", "at": [0, 2], "art": ["d..d"], "key": {"d": "black:3"}},
                   {"face": "right", "at": [0, 2], "art": ["dd"], "key": {"d": "black:3"}},
                   {"face": "left", "at": [1, 2], "art": ["dd"], "key": {"d": "black:3"}}]},
    "nose": {"ramp": "black", "tone": 1.6, "brush": {"off": True},
             "stamps": [{"face": "top", "at": [0, 0], "art": ["h."], "key": {"h": "black:5"}}]},
    # ears: black backs; the fronts have a rust rim round pale inner fur, the tips are black
    "ear": {"ramp": "black", "tone": 2.6, "brush": {"off": True}, "layers": [
        {"id": "inner", "op": "fill", "ramp": "fox", "tone": 5.4, "faces": ["front"]}],
        "stamps": [{"face": "front", "at": [0, 0], "art": [".cc.", "wwc."], "flip_on_mirror": True,
                    "key": {"c": "cream:5", "w": "cream:7"}}]},
    "ear_mid": {"ramp": "black", "tone": 2.4, "brush": {"off": True}, "layers": [
        {"id": "inner", "op": "fill", "ramp": "fox", "tone": 4.4, "faces": ["front"]}],
        "stamps": [{"face": "front", "at": [0, 0], "art": ["k.", "c."], "flip_on_mirror": True,
                    "key": {"k": "black:4", "c": "cream:4"}}]},
    "ear_tip": {"ramp": "black", "tone": 1.8, "brush": {"off": True}},
    "haunch": {"ramp": "fox", "tone": 5.8, "brush": FUR, "layers": [
        {"id": "dorsal", "op": "band", "axis": "y", "from": 0.3, "to": 1.0, "wobble": 0.3, "shift": -1.1},
        {"id": "belly", "op": "band", "axis": "y", "from": -1.0, "to": -0.6, "wobble": 0.4, "ramp": "cream",
         "tone": 5.8},
        {"id": "mottle", "op": "noise", "scale": 2.0, "amount": 0.5}]},
    "tail": {"ramp": "fox", "tone": 6.4, "brush": dict(FUR, flow="y", length=3.0, rough=0.6), "layers": [
        {"id": "mottle", "op": "noise", "scale": 2.0, "amount": 0.6},
        {"id": "guard", "op": "patches", "scale": 1.4, "threshold": 0.64, "shift": -1.2},
        {"id": "dorsal", "op": "band", "axis": "z", "from": -1.0, "to": -0.2, "shift": -0.9, "wobble": 0.5},
        {"id": "under", "op": "fill", "ramp": "cream", "tone": 5.0, "faces": ["bottom"]}]},
    "tail_end": {"ramp": "fox", "tone": 5.8, "brush": dict(FUR, flow="y", length=3.0, rough=0.6), "layers": [
        {"id": "mottle", "op": "noise", "scale": 2.0, "amount": 0.6},
        {"id": "smoke", "op": "band", "axis": "y", "from": 0.2, "to": 0.75, "wobble": 0.6, "shift": -1.6},
        {"id": "tipward", "op": "band", "axis": "y", "from": 0.75, "to": 1.0, "ramp": "cream", "tone": 6.0,
         "wobble": 0.6}]},
    "tail_tip": {"ramp": "cream", "tone": 7.0, "brush": dict(FUR, flow="y", length=2.0, rough=0.6), "layers": [
        {"id": "mottle", "op": "noise", "scale": 1.4, "amount": 0.6}]},
}

anim = {
    # trotting along: the brush streams back and wags, the ears are laid back and flick, the head bobs twice a turn
    "run": {"length": 1.0, "loop": True, "tracks": spin_tracks() + [
        {"parts": ["tail", "tail_1", "tail_2", "tail_tip"],
         "wave": {"axis": "y", "amp": 9, "cycles": 2, "lag": 0.12, "growth": 1.3}},
        {"parts": ["tail", "tail_1", "tail_2", "tail_tip"],
         "wave": {"axis": "x", "amp": 4, "cycles": 2, "lag": 0.1, "growth": 1.2, "phase": 0.25, "bias": -7}},
        {"part": "ear", "axis": "x", "osc": {"amp": 6, "cycles": 2, "phase": 0.1, "bias": -16}},
        {"part": "ear", "axis": "z", "keys": [[0, 0], [0.3, 0], [0.36, -16, "out"], [0.5, 0, "elastic"],
                                             [0.8, 0], [0.86, -12, "out"], [1.0, 0, "elastic"]], "only": True},
        {"part": "ear_mirror", "axis": "z", "keys": [[0, 0], [0.05, 0], [0.11, 14, "out"], [0.28, 0, "elastic"],
                                                    [1.0, 0]]},
        {"part": "head", "axis": "x", "osc": {"amp": 5, "cycles": 2, "phase": 0.15, "bias": -3}},
        {"part": "head", "channel": "position", "osc": {"amp": [0, 0.6, 0], "cycles": 2, "shape": "bounce"}},
        {"part": "head", "axis": "z", "osc": {"amp": 3, "cycles": 1}},
        {"part": "leg", "axis": "x", "osc": {"amp": 22, "cycles": 2}, "mirror_phase": 0.25},
        {"part": "tub", "axis": "z", "osc": {"amp": 1.0, "cycles": 2, "phase": 0.3}},
    ]},
    # waiting: a slow sway of the brush, an ear twitch, a curious head tilt
    "idle": {"length": 2.0, "loop": True, "tracks": [
        {"parts": ["tail", "tail_1", "tail_2", "tail_tip"],
         "wave": {"axis": "y", "amp": 7, "cycles": 1, "lag": 0.14, "growth": 1.25}},
        {"parts": ["tail_1", "tail_2", "tail_tip"],
         "wave": {"axis": "x", "amp": 3, "cycles": 1, "lag": 0.15, "phase": 0.25}},
        {"part": "ear", "axis": "x", "only": True,
         "keys": [[0, 0], [0.7, 0], [0.75, -22, "out"], [0.83, 4, "in"], [1.0, 0, "elastic"], [2.0, 0]]},
        {"part": "ear_mirror", "axis": "z",
         "keys": [[0, 0], [1.45, 0], [1.5, 12, "out"], [1.7, 0, "elastic"], [2.0, 0]]},
        {"part": "head", "axis": "z", "keys": [[0, 0], [0.35, 0], [0.6, 10, "out_back"], [1.25, 10], [1.6, 0], [2.0, 0]]},
        {"part": "head", "axis": "y", "keys": [[0, 0], [0.4, 6], [1.2, 6], [1.7, -3], [2.0, 0]], "ease": "smooth"},
        {"part": "head", "axis": "x", "osc": {"amp": 2, "cycles": 2}},
        {"part": "neck", "channel": "scale", "osc": {"amp": [0.03, 0.04, 0.03], "cycles": 1}},
    ]},
}

spec = {
    "name": "Fox Cart",
    "description": "A minecart skin shaped like a red fox (Winterworks mod): rust flanks over a wooden undercarriage, "
                   "white chest and cheeks, black socks and ear backs, a huge brush of a tail curling up at the back. "
                   "Dyeable wool rim (trim) and cushion (seat). Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 900, "colors": 72},
    "light": {"dir": [-0.4, 1.0, 0.5], "strength": 0.6, "gradient": 0.5, "ao": 0.8, "ao_height": 7.0},
    "brush": {"flow": "z", "length": 3.0, "rough": 0.6, "width": 0.6, "overshoot": 0.3, "marks": 0.8,
              "textures": {"fox": "fur", "cream": "fur", "black": "fur", "wood": "wood", "iron": "metal",
                           "wool": "cloth"}},
    "minecraft": {"fps": 12, "glow_parts": [], "tint_parts": trims + ["seat"]},
    # the wheels are square boxes with punched corners: their (invisible) corners dip under the rail as they roll
    "anim_ground_tolerance": 1.3,
    "render": {"background": "#1b2026", "hero": [-38, 20], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": c.P,
    "animations": anim,
}

if __name__ == "__main__":
    dump(spec, sys.argv[1] if len(sys.argv) > 1 else "examples/fox_cart.json")
