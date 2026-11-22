"""Builds examples/sea_turtle.json and examples/sea_turtle_baby.json: the overhauled sea turtles (Winterworks, Tides &
Treasures).

    python examples/src/sea_turtle.py

* **Adult** (about 20 x 13 x 33 px, flippers spread about 40 px): a domed carapace of stepped layers with real scutes:
  five vertebrals down the ridge, four costals a side and a ring of marginals, every scute with concentric growth
  rings and dark radiating tortoiseshell streaks on amber, the seams inked and lit; a pale straw plastron; a leathery
  olive head of big pale-edged scales with a hooked horn beak and round dark eyes under a heavy lid; long front
  flippers (two joints, a claw on the leading edge) and short rounded hind flippers.
* **Baby** (`sea_turtle_baby`, about 12 x 8 x 18 px, made at twice its in-game size): a cute hatchling: a big round
  head with huge round eyes, a small soft shell with bumpy keels, oversized flippers with pale edges, dark slate
  colours.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so both models export 1:1
to vanilla entity models (python -m lowpix mc export). Faces +Z, ground at y = 0, "left" is +X; the root (body)
pivots in the middle of the plastron.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 4): bones shell, body, head, flipper_fl, flipper_fr,
flipper_bl, flipper_br, tail. Extra joints: neck, jaw, flipper_fl_tip / flipper_fr_tip (the outer front paddles),
eye_l/r, lid_l/r (the upper eyelids: they close by scaling down over the eye). Clips: idle, walk, swim, bask (loops),
dig (laying eggs, 2.0 s; for the baby, digging out of the nest). No glow.
"""
import copy
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ocean_kit import (GLOSS, LIGHT, LR, M, ROOT, Rig, add, dump, ground_lock, keys, osc, pattern_stamps,  # noqa
                       pos, r, ramps, rest_on_ground, ring, round_eye, rounded, sc, shake, timeline, wave)

DENSITY = 2
RAMPS = ramps("olive", "tortoise", "straw", "horn", "amber", "pupil", "cream",
              # hatchlings: dark slate shell and skin
              slate=["#0f0d0c", "#1a1715", "#26221f", "#332e2a", "#413a35", "#504842", "#615851", "#746a62",
                     "#8a7f76", "#a3988e", "#beb4aa"])
BRUSH = {"flow": "horizontal", "length": 1.6, "width": 0.6, "rough": 0.5, "overshoot": 0.25,
         "textures": {"olive": "leather", "tortoise": "scales", "straw": "organic", "slate": "leather",
                      "horn": "wood"}}
RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.3}


def scute_map(W, D, cz, baby=False):
    """Scute centres (x, z) on a carapace W wide and D long centred at z = cz: vertebrals down the middle, costals
    either side, a ring of marginals round the rim."""
    pts = []
    nv = 4 if baby else 5
    for k in range(nv):
        pts.append((0.0, cz + D * (0.32 - 0.64 * k / (nv - 1)), "v"))
    nc = 3 if baby else 4
    for s in (1, -1):
        for k in range(nc):
            pts.append((s * W * 0.27, cz + D * (0.24 - 0.52 * k / (nc - 1)), "c"))
    nm = 14 if baby else 18
    for k in range(nm):
        a = 2 * math.pi * (k + 0.5) / nm
        pts.append((math.sin(a) * W * 0.49, cz + math.cos(a) * D * 0.49, "m"))
    return pts


def scute_fn(pts, face, ring_every=1.0, streaks=True, keel=False):
    """The carapace pattern at a point: inked seams between scutes (lit on one side), concentric growth rings inside
    every scute, dark radiating tortoiseshell streaks and amber flames (adult), raised keels (baby)."""
    P = np.array([(x, z) for x, z, _ in pts])

    def fn(x, y, z):
        d = np.hypot(P[:, 0] - x, P[:, 1] - z)
        i1, i2 = np.argsort(d)[:2]
        c1, c2 = P[i1], P[i2]
        dd = float(np.linalg.norm(c2 - c1))
        border = (d[i2] ** 2 - d[i1] ** 2) / (2 * max(dd, 1e-6))      # distance to the seam
        if border < 0.2:
            return "S"
        if border < 0.45 and (c2[0] - c1[0]) * 0.4 + (c2[1] - c1[1]) * -0.6 < 0:
            return "L"                                              # the lit lip on one side of the seam
        if keel and pts[i1][2] in "vc" and abs(x - c1[0]) < 0.45 and face == "top":
            return "K"
        if (border % ring_every) < 0.2 and border > 0.9:
            return "g"
        if streaks:
            ang = math.atan2(z - c1[1], x - c1[0])
            v = math.sin(ang * 5 + i1 * 1.7) + 0.6 * math.sin(ang * 11 + i1 * 0.9)
            if v > 1.2 and d[i1] > 1.0:
                return "k"
            if v < -1.3 and d[i1] > 1.2:
                return "a"
        return "."
    return fn


SCUTE_KEY_ADULT = {"S": "tortoise:1", "L": "tortoise:9", "g": "tortoise:5", "k": "tortoise:3", "a": "tortoise:10",
                   "K": "tortoise:8"}
SCUTE_KEY_BABY = {"S": "slate:3", "L": "slate:6", "g": "slate:4", "k": "slate:3", "a": "slate:7", "K": "slate:9"}


def build(baby):
    R = Rig(density=DENSITY, bone_style="skin")
    part, bone, card = R.part, R.bone, R.card
    S = 0.55 if baby else 1.0          # overall proportions of the baby's body against the adult's

    def q(v):
        return max(0.5, round(v * 2) / 2)

    # ---------------------------------------------------------------- body: the plastron and the skin round it
    W, D = (q(11), q(13)) if baby else (20.0, 24.0)
    part("body", None, [q(W * 0.7), q(2.5 * S + 0.5), q(D * 0.78)], "plastron", at=(0, 3.0, 0),
         centre=(0, 2.0, -0.5))
    part("skin_band", "body", [q(W * 0.8), q(1.5 * S + 0.5), q(D * 0.86)], "skin", centre=(0, 3.5, -0.5))
    # ---------------------------------------------------------------- the shell: a stepped dome of layers
    bone("shell", "body", at=(0, 4.0, -0.5))
    layers = ([(W, 1.5, D * 0.8, 4.75), (W * 0.82, 1.0, D, 4.5), (W * 0.86, 2.0, D * 0.86, 6.5),
               (W * 0.66, 2.0, D * 0.7, 8.5), (W * 0.4, 1.0, D * 0.48, 10.0)] if not baby else
              [(W, 1.0, D * 0.82, 4.5), (W * 0.84, 0.5, D, 4.25), (W * 0.84, 1.5, D * 0.84, 5.75),
               (W * 0.6, 1.5, D * 0.66, 7.25), (W * 0.3, 0.5, D * 0.4, 8.25)])
    if not baby:
        layers = [(w, h, d, y) for w, h, d, y in layers]
    shell_parts = []
    for k, (w, h, d, y) in enumerate(layers):
        sz = [q(w), h, q(d)]
        c = (0, y - (0.5 if baby else 0), -0.5)
        part(f"shell_{k}", "shell", sz, "carapace", centre=c)
        shell_parts.append((f"shell_{k}", sz, c))
    # the serrated back edge of the shell (marginals over the tail)
    card("shell_serration", "shell", ["mmmmmmmmmmmmmmmmmmmm"[:int(W * 1.2)], "m.mm.mm.mm.mm.mm.mm."[:int(W * 1.2)],
                                      "m..m..m..m..m..m..m."[:int(W * 1.2)]], "carapace_edge",
         at=(0, 4.0 if not baby else 3.25, -0.5 - D / 2), offset=(0, -0.5, 0), plane="xy")
    # ---------------------------------------------------------------- neck and head
    hz = D / 2 - 0.5
    part("neck", "body", [q(5.5 * S + (1.0 if baby else 0)), q(4 * S + 0.5), q(5 * S)], "skin",
         at=(0, 4.0 if not baby else 3.0, hz - 1.0), centre=(0, 4.0 if not baby else 3.0, hz + 1.0 * S))
    if not baby:
        HC = (0, 5.0, hz + 6.0)
        rounded(R, "head", "neck", [6.5, 5.5, 7.0], "head", centre=HC, at=(0, 4.5, hz + 2.5), cut=(0.64, 0.8),
                steps=4)
        part("beak", "head", [4.0, 2.0, 2.5], "beak", centre=(0, 4.25, hz + 10.25))
        part("beak_hook", "beak", [2.5, 1.5, 1.0], "beak", centre=(0, 3.5, hz + 11.5))
        bone("jaw", "head", at=(0, 3.25, hz + 4.0))
        part("jaw_plate", "jaw", [4.5, 1.0, 5.5], "beak_low", centre=(0, 2.75, hz + 8.25))
        EY, EZ, EX, ED = 6.0, hz + 7.0, 3.25, 3.0
    else:
        HC = (0, 4.5, hz + 3.5)
        rounded(R, "head", "neck", [7.0, 6.0, 6.0], "head", centre=HC, at=(0, 3.5, hz + 0.5), cut=(0.5, 0.75),
                steps=4)
        part("beak", "head", [3.0, 1.5, 1.0], "beak", centre=(0, 3.25, hz + 6.5))
        bone("jaw", "head", at=(0, 2.5, hz + 2.0))
        part("jaw_plate", "jaw", [3.5, 0.5, 3.5], "beak_low", centre=(0, 2.25, hz + 4.75))
        EY, EZ, EX, ED = 5.0, hz + 4.25, 3.5, 3.5
    for s in (1, -1):
        n = LR(s)
        part(f"eye_{n}", "head", [0.5, ED, ED], "eye", centre=M((EX + 0.25, EY, EZ), s))
        lid_top = EY + ED / 2
        part(f"lid_{n}", f"eye_{n}", [0.5, 0.5 if baby else 1.0, ED + 0.5], "lid", at=M((EX + 0.5, lid_top, EZ), s),
             centre=M((EX + 0.5, lid_top - (0.25 if baby else 0.5), EZ), s))
    # ---------------------------------------------------------------- flippers
    FS = 0.9 if baby else 1.0
    for s in (1, -1):
        n = LR(s)
        sh = M((W * 0.36, 3.5 if not baby else 2.75, D * 0.3), s)
        if not baby:
            part(f"flipper_f{n}", "body", [6, 1.5, 3.5], "flipper", at=sh, offset=(s * 3.0, 0, 0),
                 rot=(0, s * -28, s * -8))
            tip_at = R.wpos(f"flipper_f{n}", (s * 6.0, 0, 0))
            part(f"flipper_f{n}_tip", f"flipper_f{n}", [8, 1, 4.5], "flipper", at=tip_at, offset=(s * 4.0, 0, -0.5),
                 rot=(0, s * -22, 0))
            part(f"flipper_f{n}_end", f"flipper_f{n}_tip", [6, 0.5, 2.5], "flipper", rel=(s * 8.0, 0, 0.5),
                 offset=(s * 2.75, 0, 0), rot=(0, s * -14, 0))
            card(f"claw_f{n}", f"flipper_f{n}_tip", ["c", "C"], "claw", rel=(s * 3.0, 0, 1.6), offset=(0, 0, 0.25),
                 plane="xz")
            bh = M((W * 0.3, 3.0, -D * 0.33), s)
            part(f"flipper_b{n}", "body", [5, 1, 5], "flipper", at=bh, offset=(s * 2.5, 0, -1.5), rot=(0, s * 38, s * -6))
            part(f"flipper_b{n}_end", f"flipper_b{n}", [3, 0.5, 3.5], "flipper", rel=(s * 5.0, 0, -1.5),
                 offset=(s * 1.25, 0, 0))
        else:
            part(f"flipper_f{n}", "body", [3.5, 1, 2.5], "flipper", at=sh, offset=(s * 1.75, 0, 0),
                 rot=(0, s * -28, s * -8))
            tip_at = R.wpos(f"flipper_f{n}", (s * 3.5, 0, 0))
            part(f"flipper_f{n}_tip", f"flipper_f{n}", [4.5, 0.5, 3.5], "flipper", at=tip_at,
                 offset=(s * 2.25, 0, -0.5), rot=(0, s * -24, 0))
            part(f"flipper_f{n}_end", f"flipper_f{n}_tip", [3.5, 0.5, 2.0], "flipper", rel=(s * 4.5, 0, 0.25),
                 offset=(s * 1.5, 0, 0), rot=(0, s * -14, 0))
            bh = M((W * 0.3, 2.5, -D * 0.33), s)
            part(f"flipper_b{n}", "body", [3.5, 0.5, 3.5], "flipper", at=bh, offset=(s * 1.75, 0, -1.0),
                 rot=(0, s * 38, s * -6))
    part("tail", "body", [q(2 * S + 0.5), 1.0, q(3.5 * S)], "skin", at=(0, 2.5, -D * 0.38),
         centre=(0, 2.5, -D * 0.38 - 1.5 * S))

    # ---------------------------------------------------------------- paint
    skin = "slate" if baby else "olive"
    shell_ramp = "slate" if baby else "tortoise"
    SCALES = {"id": "scales", "op": "scales", "shape": "round", "along": "z", "size": [1.5, 1.5], "gap": 0.5,
              "highlight": 1.6 if not baby else 0.7, "shadow": -1.4 if not baby else -0.7,
              "jitter": 0.7 if not baby else 0.3, "faces": ["top", "sides"]}
    styles = {
        "skin": {"ramp": skin, "tone": 5.0, "rim": RIM,
                 "layers": [SCALES, {"id": "pale_low", "op": "band", "axis": "y", "from": -1.01, "to": -0.4,
                                     "ramp": skin, "tone": 7.0, "faces": ["sides", "bottom"]}]},
        "plastron": {"ramp": "straw" if not baby else "slate", "tone": 4.6 if not baby else 6.4, "rim": RIM,
                     "layers": [{"id": "plates", "op": "scales", "shape": "square", "along": "x", "size": [3.0, 3.0],
                                 "gap": 0.5, "highlight": 0.8, "shadow": -1.2, "jitter": 0.4}]},
        "carapace": {"ramp": shell_ramp, "tone": 6.0 if not baby else 4.6,
                     "rim": {"light": 1, "dark": 1, "light_shift": 1.0, "dark_shift": -0.8},
                     "layers": [{"id": "mottle", "op": "patches", "scale": 2.0, "threshold": 0.55,
                                 "shift": -1.2 if not baby else -0.6},
                                {"id": "flame", "op": "noise", "scale": 1.4, "amount": 0.8 if not baby else 0.4},
                                {"id": "dark_rim", "op": "band", "axis": "y", "from": -1.01, "to": -0.5,
                                 "shift": -1.0, "faces": ["sides"]}, GLOSS]},
        "carapace_edge": {"ramp": shell_ramp, "tone": 5, "light": 0.2, "brush": {"off": True},
                          "art_key": {"m": f"{shell_ramp}:{4 if not baby else 3}"}},
        "head": {"ramp": skin, "tone": 5.2, "rim": RIM,
                 "layers": [dict(SCALES, size=[2.0, 2.0] if not baby else [1.5, 1.5], highlight=2.0, shadow=-1.6),
                            {"id": "pale_chin", "op": "band", "axis": "y", "from": -1.01, "to": -0.45, "ramp": skin,
                             "tone": 7.4, "faces": ["sides", "bottom", "front"]}, GLOSS]},
        "beak": {"ramp": "horn", "tone": 4.0, "rim": dict(RIM, light_shift=2.0), "brush": {"off": True},
                 "layers": [{"id": "edge", "op": "band", "axis": "y", "from": -1.01, "to": -0.4, "shift": 1.6,
                             "faces": ["sides", "front"]}]},
        "beak_low": {"ramp": "horn", "tone": 3.4, "rim": RIM, "brush": {"off": True},
                     "layers": [{"id": "mouth", "op": "fill", "ramp": "horn", "tone": 0.8, "faces": ["top"]}]},
        "eye": {"ramp": skin, "tone": 2.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                "stamps": [{"faces": ["left", "right"], "at": "top-left",
                            "art": round_eye(7 if baby else 6, pupil=3 if baby else 2),
                            "key": {"k": f"{skin}:1", "i": "amber:1", "I": "amber:2", "J": "amber:4",
                                    "p": "pupil:0", "W": "cream:7"}}]},
        "lid": {"ramp": skin, "tone": 4.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.2},
                "brush": {"off": True}},
        "flipper": {"ramp": skin, "tone": 5.0, "rim": dict(RIM, light_shift=2.0),
                    "layers": [dict(SCALES, size=[1.5, 1.0] if not baby else [1.0, 1.0], along="x"),
                               {"id": "edge", "op": "band", "axis": "z", "from": 0.6 if not baby else 0.45,
                                "to": 1.01, "ramp": skin if not baby else "slate",
                                "tone": 7.6 if not baby else 8.6, "faces": ["top", "sides"]},
                               {"id": "pale_under", "op": "fill", "ramp": skin, "tone": 7.0, "faces": ["bottom"]},
                               GLOSS]},
        "claw": {"ramp": "horn", "tone": 4, "light": 0, "brush": {"off": True},
                 "art_key": {"c": "horn:5", "C": "horn:2"}},
    }
    pts = scute_map(W, D, -0.5, baby)
    for name, sz, c in shell_parts:
        p = next(p for p in R.P if p["id"] == name)
        p["paint"] = {"stamps": []}
        for f in (("top", "right", "left", "front", "back") if name in ("shell_0", "shell_1") else ("top",)):
            p["paint"]["stamps"] += pattern_stamps(sz, DENSITY, scute_fn(pts, f, ring_every=0.75 if not baby else 9,
                                                                          streaks=not baby, keel=baby),
                                                   c, faces=(f,), key=SCUTE_KEY_BABY if baby else SCUTE_KEY_ADULT)
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
        "description": ("The Winterworks sea turtle hatchling: a big round head with huge round eyes, a small bumpy "
                        "slate shell and oversized pale-edged flippers. Made at twice its in-game size."
                        if baby else
                        "The Winterworks sea turtle: a domed carapace of real scutes with growth rings and "
                        "tortoiseshell streaks, a straw plastron, a leathery olive head of pale-edged scales with a "
                        "hooked horn beak and round dark eyes, long two-jointed front flippers.")
                       + " Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 900, "colors": 72},
        "light": LIGHT,
        "brush": BRUSH,
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
