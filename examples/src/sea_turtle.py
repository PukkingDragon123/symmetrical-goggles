"""Builds examples/sea_turtle.json and examples/sea_turtle_baby.json: the overhauled sea turtles (Winterworks, Tides &
Treasures), in the vanilla mob style.

    python examples/src/sea_turtle.py

* **Adult** (a 20 x 24 px shell, about 38 px from beak to tail, 11 px tall, flippers spread about 49 px): a boxy,
  stepped dome of a carapace in olive-brown with simple scutes (dark seams, a lit lip along each, lighter plates
  toward the ridge) and a ring of marginals round the rim; a pale straw plastron in plates; a leathery olive head of
  big scales with a pale chin and a dark horn beak; small flat dot eyes under a heavy lid ridge (`lid_l/r`: the wise,
  sleepy look; they shut by scaling down over the eyes); long flat front flippers (three joints) and short hind ones
  with pale edges.
* **Baby** (`sea_turtle_baby`, a 12 x 14 px shell, about 25 px long, flippers spread about 31 px, made at twice its
  in-game size: draw it at 0.5): a cute hatchling: a big round-ish head with bright dot eyes, a small dark slate
  shell with a raised keel, oversized pale-edged flippers.

Units are Minecraft pixels (16 per block) at **density 1** (vanilla texel size): every box is whole pixels, so both
models export 1:1 to vanilla entity models:

    PYTHONHASHSEED=0 python -m lowpix mc export examples/sea_turtle.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/sea_turtle
    PYTHONHASHSEED=0 python -m lowpix mc export examples/sea_turtle_baby.json (same options)

Faces +Z, ground at y = 0, "left" is +X; the root (body) pivots in the middle of the plastron.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 4): bones shell, body, head, flipper_fl, flipper_fr,
flipper_bl, flipper_br, tail. Extra joints: neck, jaw, flipper_fl_tip / flipper_fr_tip (the outer front paddles),
eye_l/r (the painted eyes' spots), lid_l/r (the upper eyelids: they close by scaling down over the eye). Clips: idle
4.0, walk 1.6, swim 2.0 (baby 1.2), bask 5.0 (loops), dig 2.0 (laying eggs; for the baby, digging out of the nest).
No glow. Part names from the earlier design that are no longer drawn stay as empty bones (name compatibility).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (LIGHT, LR, M, ROOT, Rig, add, combine, dump, flat, ground_lock, keep_names, keys,  # noqa
                       marks, mottle, osc, pos, r, ramps, rest_on_ground, ring, sc, shake, side_eye, timeline, wave)

DENSITY = 1
RAMPS = ramps("olive", "shell", "straw", "horn", "slate", "ink", "glint",
              # the hatchling's pale edges and belly
              ash=["#7d8582", "#8f9794", "#a2a9a6", "#b5bbb8"])


def scute_fn(pts, keel=False):
    """Scutes on the carapace (pts: plate centres (x, z)): a dark seam 'S' between neighbouring plates with a lit lip
    'L' on its far side, a slightly lighter middle 'P' in each plate; `keel`: a raised light ridge 'K' down the
    middle (the hatchling)."""
    P = np.array(pts, float)

    def fn(x, y, z, f):
        if f == "bottom":
            return "."
        if keel and abs(x) < 1 and f == "top":
            return "K"
        d = np.hypot(P[:, 0] - x, P[:, 1] - z)
        i1, i2 = np.argsort(d)[:2]
        dd = float(np.linalg.norm(P[i2] - P[i1]))
        border = (d[i2] ** 2 - d[i1] ** 2) / (2 * max(dd, 1e-6))      # distance to the seam
        if border < 0.55:
            return "S"
        if border < 1.4 and (P[i2][1] - P[i1][1]) > 0:
            return "L"
        if d[i1] < 1.2 and f == "top":
            return "P"
        return "."
    return fn


def marginals(W, D, n, cz=0.0):
    """The rim's marginal scutes: a dark seam every 360/n degrees round the rim (on its sides)."""
    def fn(x, y, z, f):
        if f in ("top", "bottom"):
            return "."
        a = math.degrees(math.atan2(x / W, (z - cz) / D)) % 360
        return "S" if (a * n / 360.0) % 1.0 < 0.12 * n / 18 + 0.05 else "."
    return fn


def head_scales(x, y, z, f):
    """Big head scales: a dark seam lattice (rows offset like bricks), a pale chin below."""
    if f == "bottom" or y < 5:
        return "c"
    row = math.floor((y + 0.5) / 2.0)
    u = (z if f in ("left", "right") else x) + (1.0 if row % 2 else 0.0)
    if (y + 0.5) % 2.0 < 0.6 or (u + 0.5) % 3.0 < 0.6:
        return "s"
    return "."


def flipper_marks(x, y, z, f):
    """Flippers: a few big scale seams and a pale trailing edge."""
    if f == "bottom":
        return "c"
    return "s" if (x * 0.7 + z) % 4.0 < 0.8 else "."


def build(baby):
    R = Rig(density=DENSITY, bone_style="skin")
    part, bone, card = R.part, R.bone, R.card
    if not baby:
        # ------------------------------------------------------------ adult: plastron, a stepped dome, a big head
        W, D = 20, 24
        part("body", None, [14, 3, 18], "plastron", at=(0, 2, 0), centre=(0, 1.5, 0))
        part("skin_band", "body", [16, 1, 20], "skin", centre=(0, 3.5, 0))
        bone("shell", "body", at=(0, 4, 0))
        SHELL = [("shell_0", [20, 2, 24], (0, 5, 0)), ("shell_1", [18, 2, 21], (0, 7, -0.5)),
                 ("shell_2", [14, 1, 17], (0, 8.5, -0.5)), ("shell_3", [8, 1, 11], (0, 9.5, -0.5))]
        for name, sz, c in SHELL:
            part(name, "shell", sz, "carapace" if name != "shell_0" else "rim", centre=c)
        part("neck", "body", [4, 4, 5], "skin", at=(0, 5, 8), centre=(0, 5, 10.5))
        part("head", "neck", [6, 6, 7], "head", at=(0, 5, 12), centre=(0, 6, 15.5))
        part("beak", "head", [4, 2, 2], "beak", centre=(0, 5, 20))
        part("beak_hook", "beak", [2, 1, 1], "beak", centre=(0, 3.5, 20.5))
        bone("jaw", "head", at=(0, 3, 14))
        part("jaw_plate", "jaw", [4, 1, 6], "beak_low", centre=(0, 2.5, 17))
        EYE_TOP, EYE_FRONT, HX = 7, 18, 3
        for s in (1, -1):
            n = LR(s)
            bone(f"eye_{n}", "head", at=M((HX, EYE_TOP - 1, EYE_FRONT - 1), s))
            part(f"lid_{n}", f"eye_{n}", [1, 1, 4], "lid", at=M((HX + 0.5, EYE_TOP + 1, EYE_FRONT - 1), s),
                 centre=M((HX + 0.5, EYE_TOP + 0.5, EYE_FRONT - 1), s))
        for s in (1, -1):
            n = LR(s)
            part(f"flipper_f{n}", "body", [10, 1, 6], "flipper", at=M((7, 1.5, 6), s), offset=(s * 5, 0, 0),
                 rot=(0, s * -28, s * -6))
            tip = R.wpos(f"flipper_f{n}", (s * 10, 0, 0))
            part(f"flipper_f{n}_tip", f"flipper_f{n}", [8, 1, 5], "flipper", at=tip, offset=(s * 4, 0, -0.5),
                 rot=(0, s * -22, 0))
            part(f"flipper_f{n}_end", f"flipper_f{n}_tip", [5, 1, 3], "flipper", rel=(s * 8, 0, 0),
                 offset=(s * 2.5, 0, 0), rot=(0, s * -14, 0))
            part(f"flipper_b{n}", "body", [6, 1, 5], "flipper", at=M((6, 1.5, -8), s), offset=(s * 3, 0, -1.5),
                 rot=(0, s * 38, s * -6))
            part(f"flipper_b{n}_end", f"flipper_b{n}", [3, 1, 3], "flipper", rel=(s * 6, 0, -1.5),
                 offset=(s * 1.5, 0, 0))
        part("tail", "body", [2, 2, 3], "skin", at=(0, 2, -9), centre=(0, 2, -10.5))
        pts = [(0, 7.5), (0, 2.5), (0, -2.5), (0, -7.5)]
        pts += [(s * 5.5, z) for s in (1, -1) for z in (5.0, 0.0, -5.0)]
        pts += [(math.sin(a) * W * 0.62, math.cos(a) * D * 0.62) for a in np.linspace(0, 2 * math.pi, 15)[:-1]]
        keep_names(R, {"shell_4": "shell", "shell_serration": "shell", "head_y": "head", "head_z": "head",
                       "head_m": "head", "claw_fl": "flipper_fl_tip", "claw_fr": "flipper_fr_tip"})
        n_marg = 18
    else:
        # ------------------------------------------------------------ hatchling (built at 2x): a big head, a keel
        W, D = 12, 14
        part("body", None, [10, 2, 12], "plastron", at=(0, 1, 0), centre=(0, 1, 0))
        part("skin_band", "body", [12, 1, 14], "skin", centre=(0, 2.5, 0))
        bone("shell", "body", at=(0, 3, 0))
        SHELL = [("shell_0", [12, 2, 14], (0, 4, 0)), ("shell_1", [10, 2, 12], (0, 6, -0.5)),
                 ("shell_2", [6, 1, 8], (0, 7.5, -0.5)), ("shell_3", [2, 1, 6], (0, 8.5, -0.5))]
        for name, sz, c in SHELL:
            part(name, "shell", sz, "carapace" if name != "shell_0" else "rim", centre=c)
        part("neck", "body", [4, 3, 3], "skin", at=(0, 3, 5), centre=(0, 3.5, 6.5))
        part("head", "neck", [8, 7, 7], "head", at=(0, 3.5, 7), centre=(0, 5.5, 11.5))
        part("beak", "head", [4, 1, 1], "beak", centre=(0, 3.5, 15.5))
        bone("jaw", "head", at=(0, 2, 9))
        part("jaw_plate", "jaw", [4, 1, 4], "beak_low", centre=(0, 1.5, 12))
        EYE_TOP, EYE_FRONT, HX = 8, 14, 4
        for s in (1, -1):
            n = LR(s)
            bone(f"eye_{n}", "head", at=M((HX, EYE_TOP - 1, EYE_FRONT - 1), s))
            part(f"lid_{n}", f"eye_{n}", [1, 1, 3], "lid", at=M((HX + 0.5, EYE_TOP + 1, EYE_FRONT - 1), s),
                 centre=M((HX + 0.5, EYE_TOP + 0.5, EYE_FRONT - 1.5), s))
        for s in (1, -1):
            n = LR(s)
            part(f"flipper_f{n}", "body", [6, 1, 4], "flipper", at=M((5, 1.5, 3.5), s), offset=(s * 3, 0, 0),
                 rot=(0, s * -28, s * -8))
            tip = R.wpos(f"flipper_f{n}", (s * 6, 0, 0))
            part(f"flipper_f{n}_tip", f"flipper_f{n}", [5, 1, 4], "flipper", at=tip, offset=(s * 2.5, 0, -0.5),
                 rot=(0, s * -24, 0))
            part(f"flipper_f{n}_end", f"flipper_f{n}_tip", [3, 1, 2], "flipper", rel=(s * 5, 0, 0.5),
                 offset=(s * 1.5, 0, 0), rot=(0, s * -14, 0))
            part(f"flipper_b{n}", "body", [4, 1, 3], "flipper", at=M((4, 1.5, -5), s), offset=(s * 2, 0, -1),
                 rot=(0, s * 38, s * -6))
        part("tail", "body", [2, 1, 2], "skin", at=(0, 1.5, -6), centre=(0, 1.5, -7))
        pts = [(0, 4.0), (0, 0.0), (0, -4.0)]
        pts += [(s * 3.5, z) for s in (1, -1) for z in (2.5, -2.5)]
        pts += [(math.sin(a) * W * 0.62, math.cos(a) * D * 0.62) for a in np.linspace(0, 2 * math.pi, 13)[:-1]]
        keep_names(R, {"shell_4": "shell", "shell_serration": "shell", "head_y": "head", "head_z": "head",
                       "head_m": "head"})
        n_marg = 14

    # ---------------------------------------------------------------- paint
    skin = "slate" if baby else "olive"
    shell_ramp = "slate" if baby else "shell"
    pale = "ash" if baby else "straw"
    styles = {
        "skin": flat(skin, 3.0 if not baby else 4.0),
        "head": flat(skin, 3.4 if not baby else 4.4),
        "plastron": flat(pale, 2.0, {"id": "plates", "op": "scales", "shape": "square", "along": "x",
                                     "size": [4.0, 4.0], "gap": 0.6, "highlight": 0.8, "shadow": -1.2,
                                     "jitter": 0.3}),
        "carapace": flat(shell_ramp, 3.4 if not baby else 2.6),
        "rim": flat(shell_ramp, 2.4 if not baby else 2.0),
        "beak": flat("horn", 2.6, grain=0.6) if not baby else flat("slate", 1.6, grain=0.6),
        "beak_low": flat("horn", 1.4, {"id": "mouth", "op": "fill", "ramp": "horn", "tone": 0.2, "faces": ["top"]},
                         grain=0.5),
        "lid": flat(skin, 2.0 if not baby else 4.0, grain=0.4),
        "flipper": flat(skin, 3.2 if not baby else 4.0,
                        {"id": "edge", "op": "band", "axis": "z", "from": -1.01, "to": -0.45,
                         "ramp": skin if not baby else "ash", "tone": 5.4 if not baby else 2.0,
                         "faces": ["top", "sides"]}),
    }
    KEY = {"S": f"{shell_ramp}:0", "L": f"{shell_ramp}:{5 if not baby else 6}", "P": f"{shell_ramp}:{4}",
           "K": f"{shell_ramp}:7" if baby else f"{shell_ramp}:5",
           "s": f"{skin}:{1 if not baby else 4}", "c": f"{pale}:3" if not baby else "ash:2",
           "k": "ink:0", "h": "glint:1", "b": f"{skin}:0", "l": f"{skin}:1"}
    scutes = scute_fn(pts, keel=baby)
    for name, sz, c in SHELL:
        if name == "shell_0":
            marks(R, name, combine(marginals(W / 2, D / 2, n_marg), scutes), KEY)
        else:
            marks(R, name, scutes, KEY)
    eye = side_eye(EYE_TOP, EYE_FRONT, w=2, h=2, glint=True, lid=False)
    marks(R, "head", combine(eye, head_scales), KEY)
    marks(R, "neck", head_scales, KEY)
    for p in R.P:
        if p["id"].startswith("flipper"):
            marks(R, p["id"], flipper_marks, KEY, faces=("top", "bottom"))
    feet = [p["id"] for p in R.P if p["id"].startswith(("flipper", "body", "tail", "shell_0", "shell_1", "neck",
                                                        "jaw", "head"))]
    return R, styles, feet


# ======================================================================= animation
def animate(R, baby):
    REST = {}
    FRONT = ["flipper_fl", "flipper_fl_tip"]
    LIDS = ["lid_l", "lid_r"]
    A = {}
    k = 1.15 if baby else 1.0

    def blink(t, dur=0.35):
        out = []
        for lid in LIDS:
            out.append(keys(lid, None, [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + dur * 0.4, [0, 2.2, 0]],
                                        [t + dur * 0.6, [0, 2.2, 0]], [t + dur, [0, 0, 0]]], ch="scale"))
        return out

    # idle: on the sand or the seabed: slow breaths, the head looks round and blinks, a flipper twitches
    L = 4.0
    A["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=blink(2.6) + [
        osc("body", None, [0.015, 0.03, 0.01], 2, 0.0, ch="scale"), osc("shell", "x", -0.8, 2, 0.1),
        keys("neck", "y", [[0, 0], [0.6, 0], [1.2, 16], [2.0, 16], [2.6, -12], [3.4, -12], [4.0, 0]]),
        keys("head", "x", [[0, 0], [1.2, -6], [2.2, 4], [3.2, -4], [4.0, 0]]),
        keys("jaw", "x", [[0, 0], [3.3, 0], [3.45, 10], [3.6, 0], [4.0, 0]]),
        keys("flipper_fl_tip", "z", [[0, 0], [1.5, 0], [1.7, -10], [1.9, 0], [4.0, 0]]),
        osc("tail", "y", 6, 1, 0.3),
    ])

    # walk: a crawl over the sand: the front flippers dig in and drag the body forward (alternating), the hind ones
    # push, the shell rocks and lifts with every heave, the head bobs
    L = 1.6
    A["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
        osc("flipper_fl", "y", 28 * k, 1, 0.0), osc("flipper_fr", "y", 28 * k, 1, 0.5),
        osc("flipper_fl", "z", -10, 1, 0.25, bias=-4), osc("flipper_fr", "z", -10, 1, 0.75, bias=-4),
        osc("flipper_fl_tip", "y", 12, 1, 0.1), osc("flipper_fr_tip", "y", 12, 1, 0.6),
        osc("flipper_bl", "y", -20, 1, 0.5), osc("flipper_br", "y", -20, 1, 0.0),
        osc("body", "z", 3, 1, 0.0), osc("body", "y", 3, 1, 0.25), osc("body", "x", -1.5, 2, 0.1),
        osc("neck", "x", 5, 2, 0.3), osc("head", "x", -4, 2, 0.4), osc("tail", "y", 10, 1, 0.2),
    ], lift=[[0, 0], [0.4, 0.6], [0.8, 0], [1.2, 0.6], [1.6, 0]])

    # swim: underwater flight: both front flippers sweep down and back together in long strokes and feather on the
    # return, the hind flippers steer, the body rises and dips a little with each stroke, the head held steady
    L = 2.0 if not baby else 1.2
    up = add(r("flipper_fl", 0, -10, 34), r("flipper_fr", 0, 10, -34), r("flipper_fl_tip", 0, 0, 18),
             r("flipper_fr_tip", 0, 0, -18))
    down = add(r("flipper_fl", -10, 24, -38), r("flipper_fr", -10, -24, 38), r("flipper_fl_tip", 20, 0, -16),
               r("flipper_fr_tip", 20, 0, 16))
    A["swim"] = timeline(L, [(0.0, up, None), (0.45 * L, down, "ease"), (L, up, "ease")], loop=True, lock=False,
                         extra=[osc("body", None, [0, 0.8, 0], 1, 0.6, ch="position"),
                                osc("body", "x", 3, 1, 0.55),
                                osc("flipper_bl", "y", 14, 1, 0.3), osc("flipper_br", "y", -14, 1, 0.3),
                                osc("flipper_bl", "z", -8, 1, 0.5), osc("flipper_br", "z", 8, 1, 0.5),
                                osc("neck", "x", -3, 1, 0.1), osc("head", "x", 3, 1, 0.15),
                                osc("tail", "y", 8, 1, 0.4)])
    A["swim"]["grounded"] = False

    # bask: lying flat in the sun, flippers splayed on the sand, neck stretched out, eyes shut, slow deep breaths
    FLAT = add(r("flipper_fl", 0, 18, -4), r("flipper_fr", 0, -18, 4), r("flipper_fl_tip", 0, 10, 0),
               r("flipper_fr_tip", 0, -10, 0), r("flipper_bl", 0, -16, 0), r("flipper_br", 0, 16, 0),
               r("neck", 10), r("head", 8), sc("lid_l", 0, 2.2, 0), sc("lid_r", 0, 2.2, 0))
    L = 5.0
    A["bask"] = timeline(L, [(0.0, FLAT, None), (L, FLAT, None)], loop=True, extra=[
        osc("body", None, [0.02, 0.04, 0.015], 1, 0.0, ch="scale"), osc("shell", "x", -1.0, 1, 0.1),
        osc("neck", "x", 2, 1, 0.2),
        keys("lid_l", None, [[0, [0, 0, 0]], [3.2, [0, 0, 0]], [3.5, [0, -1.6, 0]], [3.9, [0, -1.6, 0]],
                             [4.2, [0, 0, 0]], [5.0, [0, 0, 0]]], ch="scale"),
        keys("flipper_bl", "z", [[0, 0], [1.5, 0], [1.8, -12], [2.1, 0], [5.0, 0]]),
    ])

    # dig: nose up and braced on the front flippers, the hind flippers scoop sand in turn (left, right, left, right),
    # then the body settles back (2.0 s)
    BRACE = add(r("body", -6), r("flipper_fl", 0, 10, -14), r("flipper_fr", 0, -10, 14), r("neck", 6), r("head", 6))
    sc_l = add(r("flipper_bl", 0, -46, -36), r("flipper_br", 0, 10, 0))
    sc_r = add(r("flipper_br", 0, 46, 36), r("flipper_bl", 0, -10, 0))
    A["dig"] = timeline(2.0, [(0.0, REST, None), (0.25, BRACE, "ease"), (0.5, add(BRACE, sc_l), "out"),
                              (0.75, add(BRACE, sc_r), "out"), (1.0, add(BRACE, sc_l), "out"),
                              (1.25, add(BRACE, sc_r), "out"), (1.55, add(BRACE, r("body", 2)), "ease"),
                              (2.0, REST, "ease")],
                        extra=[shake("shell", 0.4, 1.4, 1.2, freq=8, axis=2),
                               ring("tail", 0.5, 16, freq=6, decay=4, axis=1, end=1.6)])
    if baby:
        # hatchling dig: frantic flipper flailing as it digs its way up out of the nest
        A["dig"]["tracks"] += [osc("flipper_fl", "z", 26, 6, 0.0), osc("flipper_fr", "z", -26, 6, 0.5)]
    return A


def make(baby):
    R, styles, feet = build(baby)
    name = "Sea Turtle Baby" if baby else "Sea Turtle"
    spec = {
        "name": name,
        "description": ("The Winterworks sea turtle hatchling in the vanilla mob style: a big head with bright dot "
                        "eyes, a small dark slate shell with a keel and oversized pale-edged flippers. Made at twice "
                        "its in-game size."
                        if baby else
                        "The Winterworks sea turtle in the vanilla mob style: a boxy stepped dome of olive-brown "
                        "scutes, a straw plastron, a leathery olive head of big scales with a dark horn beak, small "
                        "dot eyes under a heavy lid ridge, long flat front flippers.")
                       + " Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 500, "colors": 48},
        "light": LIGHT,
        "minecraft": {"fps": 20},
        "anim_ground_tolerance": 0.4,
        "render": {"background": "#c9b98a" if not baby else "#d8cba0", "hero": [38, 22], "shadow": 0.5},
        "palette": {"ramps": RAMPS},
        "styles": styles,
        "parts": R.P,
        "animations": animate(R, baby),
    }
    rest_on_ground(spec["parts"], DENSITY)
    ground_lock(spec, "body", None)
    return spec


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples")
    dump(make(False), os.path.join(out_dir, "sea_turtle.json"))
    dump(make(True), os.path.join(out_dir, "sea_turtle_baby.json"))
