"""Builds examples/nautilus.json: the Nautilus (Winterworks, Tides & Treasures), the underwater mount.

    python examples/src/nautilus.py examples/nautilus.json

A big coiled-shell cephalopod in the vanilla mob style: a chunky, stepped round shell (overlapping blocks make the
coil's circle) in cream with simple rust stripes that radiate from a dark navel button on each side and wrap over the
keel, the newest whorl by the opening plain; a brown leathery hood with cream blotches over the head; small flat dot
eyes with a soft brow on stubby eye bulbs at the sides of the opening; eight short, ringed, boxy tentacles
(`tentacle_0..7`, two joints each); a `siphon` funnel underneath; and a `saddle` on top (a sea-teal blanket, a
leather seat, brass fittings, straps down the shell) that the renderer shows or hides.

Units are Minecraft pixels (16 per block) at **density 1** (vanilla texel size): every box is whole pixels, so the
model exports 1:1 to a vanilla entity model:

    PYTHONHASHSEED=0 python -m lowpix mc export examples/nautilus.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/nautilus

About 18 x 29 x 34 px; faces +Z, the shell's lowest point at y = 0, "left" is +X; the root (body) pivots at the head in the
shell's opening. Draw it at scale 1.0.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 4): bones shell, body, eye_l, eye_r, tentacles
(tentacle_0..7), siphon, saddle (toggle: hide it when unsaddled). Extra joints: tentacle_k_tip (the outer half of each
tentacle), hood, eye_stalk_l/r, and the locator `rider` (a bone on the seat, where the rider sits: (0, 26, -3)).
Clips: idle 3.0, swim 1.2 (loops), dash 0.5. No glow. Part names from the earlier design that are no longer drawn
stay as empty bones (name compatibility).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (LIGHT, LR, M, ROOT, Rig, add, card_style, combine, dump, flat, keep_names, keys,  # noqa
                       limb1, marks, mottle, osc, pos, r, ramps, rest_on_ground, ring, sc, shake, side_eye,
                       timeline, wave)

DENSITY = 1
R = Rig(density=DENSITY, bone_style="flesh")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= the body: the head in the shell's opening
part("body", None, [10, 8, 7], "flesh", at=(0, 9, 6), centre=(0, 9, 5.5))
part("head", "body", [8, 6, 2], "face", centre=(0, 9, 10))

# ======================================================================= the shell: a stepped circle of blocks
SC = np.array((0.0, 14.0, -3.0))          # the navel (the coil's centre)
bone("shell", "body", at=SC)
# the boxes step in at the sides too (14, 12, 10 wide), so no two side faces lie in one plane
SHELL = [("shell_0", [14, 16, 16]), ("shell_1", [10, 22, 10]), ("shell_2", [10, 10, 22]), ("shell_3", [12, 20, 14])]
for name, size in SHELL:
    part(name, "shell", size, "shell", centre=SC)
# the keel: a ridge along the top and back of the coil
part("keel_0", "shell", [6, 1, 8], "shell", centre=SC + (0, 11.5, 0))
part("keel_1", "shell", [6, 8, 1], "shell", centre=SC + (0, 0, -11.5))
# the navel: a dark button on each side
for s in (1, -1):
    part(f"navel_{LR(s)}", "shell", [1, 4, 4], "navel", centre=M((7.5, SC[1], SC[2]), s))

# ======================================================================= hood, eyes, tentacles, siphon
part("hood", "body", [12, 3, 7], "hood", at=(0, 13, 4), centre=(0, 14.5, 7.5))
part("hood_lip", "hood", [10, 1, 1], "hood", centre=(0, 13.5, 11.5))
for s in (1, -1):
    n = LR(s)
    bone(f"eye_stalk_{n}", "body", at=M((5, 10, 7), s))
    part(f"eye_{n}", f"eye_stalk_{n}", [2, 4, 4], "eyebulb", at=M((5, 10, 7), s), centre=M((6, 10, 7), s))

bone("tentacles", "body", at=(0, 8, 10))
for k in range(8):
    row, j = k // 4, k % 4
    x = (-4.5 + 3.0 * j)
    start = np.array((x, 10.0 if row == 0 else 7.0, 10.0))
    spread = (x / 4.5) * 0.4
    d1 = np.array((spread, 0.15 if row == 0 else -0.3, 1.0))
    e = limb1(R, f"tentacle_{k}", "tentacles", start, start + d1 / np.linalg.norm(d1) * 6, 2, "tentacle")
    d2 = d1 + np.array((spread * 0.5, -0.25 if row else -0.5, 0.0))
    limb1(R, f"tentacle_{k}_tip", f"tentacle_{k}", e + d1 / np.linalg.norm(d1) * 0.5,
          e + d2 / np.linalg.norm(d2) * 5, 1, "tentacle_tip")
bone("siphon", "body", at=(0, 5, 5))
part("siphon_tube", "siphon", [4, 3, 4], "siphon", centre=(0, 5, 7.5), rot=(15, 0, 0))
part("siphon_lip", "siphon", [3, 2, 1], "siphon", centre=(0, 4.5, 10), rot=(15, 0, 0))

# ======================================================================= the saddle (toggle) and the rider seat
TOP = SC[1] + 11
bone("saddle", "shell", at=(0, TOP, SC[2]))
part("saddle_blanket", "saddle", [12, 1, 12], "blanket", rel=(0, 0.5, 0))
part("saddle_seat", "saddle", [8, 2, 8], "saddle", rel=(0, 2, 0))
part("saddle_cantle", "saddle_seat", [8, 3, 1], "saddle", rel=(0, 2.5, -3.5))
part("saddle_pommel", "saddle_seat", [2, 3, 1], "saddle", rel=(0, 2.5, 3.5))
part("saddle_horn", "saddle_pommel", [2, 1, 2], "brass", rel=(0, 2, 0.5))
for s in (1, -1):
    n = LR(s)
    # straps running down the shell's sides to a girth under the coil
    part(f"saddle_strap_{n}", "saddle", [1, 16, 2], "strap", rel=M((7.5, -8, -6), s))
    part(f"saddle_buckle_{n}", f"saddle_strap_{n}", [1, 3, 4], "brass", rel=M((0.5, -3, 0), s))
    card(f"stirrup_{n}", f"saddle_strap_{n}", ["s..", "s..", "BBB", "b.b", "BBB"], "stirrup",
         rel=M((0.6, -8, 0), s), offset=(0, -2.5, 0), plane="yz")
bone("rider", "saddle", rel=(0, 4, 0))

# names of the earlier design that are not drawn any more (kept as empty bones for the mod's code)
keep_names(R, {"shell_4": "shell", "shell_5": "shell", "shell_6": "shell", "shell_7": "shell", "keel_2": "shell",
               "keel_3": "shell", "cirri_0": "tentacles", "cirri_1": "tentacles", "cirri_2": "tentacles",
               "saddle_fringe_l": "saddle_blanket", "saddle_fringe_r": "saddle_blanket"})

# ======================================================================= palette and paint
RAMPS = ramps("cream", "rust", "flesh", "hood", "leather", "brass", "cloth", "ink", "glint")
RINGS = {"id": "rings", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.5, "shift": -1.0}
styles = {
    "flesh": flat("flesh", 3.2),
    "face": flat("flesh", 3.0, {"id": "beak", "op": "rect", "rect": [0.35, 0.55, 0.65, 0.85], "ramp": "hood",
                                "tone": 1.0, "faces": ["front"]}),
    "shell": flat("cream", 2.6, grain=1.0),
    "navel": flat("hood", 1.4, grain=0.5),
    "hood": flat("hood", 3.0),
    "eyebulb": flat("flesh", 3.4),
    "tentacle": flat("flesh", 3.6, RINGS, grain=0.6),
    "tentacle_tip": flat("flesh", 4.2, RINGS, grain=0.6),
    "siphon": flat("flesh", 2.8, {"id": "mouth", "op": "fill", "ramp": "hood", "tone": 1.0, "faces": ["front"]}),
    "blanket": flat("cloth", 2.0, {"id": "hem", "op": "band", "axis": "x", "from": 0.75, "to": 1.01, "ramp": "brass",
                                   "tone": 2.0, "faces": ["top", "sides"]},
                    {"id": "hem_r", "op": "band", "axis": "x", "from": -1.01, "to": -0.75, "ramp": "brass",
                     "tone": 2.0, "faces": ["top", "sides"]}),
    "saddle": flat("leather", 2.6, {"id": "stitch", "op": "panel", "inset": 1, "shift": -1.0, "highlight": 0.8,
                                    "min_size": 3}),
    "strap": flat("leather", 1.8, grain=0.5),
    "brass": flat("brass", 2.0, grain=0.4),
    "stirrup": card_style("brass", 2, {"s": "leather:2", "B": "brass:3", "b": "brass:1"}),
}


def shell_marks(x, y, z, f):
    """Rust stripes radiating from the navel and wrapping over the keel (none on the newest whorl over the opening),
    a darker ring round the navel button."""
    dz, dy = z - SC[2], y - SC[1]
    rr = math.hypot(dz, dy)
    if f in ("left", "right") and rr < 3.6:
        return "n"
    th = math.degrees(math.atan2(dy, dz)) % 360            # 0 front, 90 top, 180 back, 270 bottom
    if not (40 <= th <= 300):
        # the newest whorl: faint growth lines following the coil
        return "g" if f in ("front", "top", "bottom") and (rr + 0.5) % 3.0 < 1.0 else "."
    ph = (th + 3.0 * rr) / 26.0                            # bending back a little toward the rim
    return "s" if (ph - math.floor(ph)) < 0.38 else "."


_blotch = mottle(7, 5, 0.45, "c")
EYE = side_eye(12, 9, w=2, h=2, brow="flat", gap=0)
KEY = {"s": "rust:2", "n": "rust:0", "g": "cream:1", "c": "cream:3", "k": "ink:0", "h": "glint:1", "b": "flesh:0", "l": "flesh:1",
       "d": "flesh:1"}
for name, _ in SHELL + [("keel_0", 0), ("keel_1", 0)]:
    marks(R, name, shell_marks, KEY)
marks(R, "hood", _blotch, KEY)
marks(R, "hood_lip", _blotch, KEY)
for s in (1, -1):
    marks(R, f"eye_{LR(s)}", EYE, KEY, faces=("left", "right"))
marks(R, "body", mottle(11, 3, 0.7, "d"), KEY)

# ======================================================================= animation
REST = {}
TENTS = [f"tentacle_{k}" for k in range(8)]
TIPS = [f"tentacle_{k}_tip" for k in range(8)]


def writhe(L, cycles=1, amp=1.0, phase=0.0):
    """Every tentacle curls on its own rhythm, the tips trailing their roots."""
    tr = []
    for k in range(8):
        ph = phase + k * 0.137
        tr.append(wave([TENTS[k], TIPS[k]], "x", 9 * amp, cycles, lag=0.15, growth=1.4, phase=ph))
        tr.append(wave([TENTS[k], TIPS[k]], "z", 6 * amp * (1 if k % 2 else -1), cycles, lag=0.15, growth=1.3,
                       phase=ph + 0.3))
    return tr


ANIM = {}
# idle: hovering: the shell rocks gently, the tentacles writhe, the siphon pulses, the eyes roll about
L = 3.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=writhe(L, 1) + [
    osc("body", None, [0, 0.6, 0], 1, 0.0, ch="position"), osc("body", "x", 2.5, 1, 0.2),
    osc("shell", "x", -1.5, 1, 0.35),
    osc("siphon", None, [0.15, 0.2, 0.1], 2, 0.1, ch="scale"),
    osc("eye_l", "y", 12, 1, 0.1), osc("eye_r", "y", -12, 1, 0.1),
    osc("hood", "x", 3, 2, 0.4),
])

# swim: rhythmic jet strokes: the body squeezes and surges, the tentacles stream back together and fan out again,
# the siphon aimed back, the shell pitching with each pulse
STREAM = add(*[r(t, -38 if k < 4 else -18) for k, t in enumerate(TENTS)],
             *[r(t, -20) for t in TIPS], r("siphon", 40))
L = 1.2
ANIM["swim"] = timeline(L, [(0.0, add(STREAM, sc("body", 0.06, -0.05, 0)), None),
                            (0.3, add(STREAM, scale_x := sc("body", -0.05, 0.06, 0.04), r("shell", 4)), "out"),
                            (0.8, add(scale_x, r("siphon", 10)), "ease"),
                            (L, add(STREAM, sc("body", 0.06, -0.05, 0)), "ease")],
                        loop=True, extra=writhe(L, 1, 0.5) + [
    osc("body", None, [0, 0, 0.8], 1, 0.0, ch="position"), osc("body", "x", 3, 1, 0.1),
    osc("siphon", None, [0.2, 0.25, 0.1], 1, 0.3, ch="scale"),
])

# dash: the siphon swells and the tentacles flare open (anticipation), then a jet: everything clamps together and
# trails, the body lurches forward, then the tentacles ripple back open
FLARE = add(*[r(t, 22 if k < 4 else -6, 0, (k % 4 - 1.5) * 10) for k, t in enumerate(TENTS)],
            sc("siphon", 0.4, 0.4, 0.3), sc("body", 0.08, 0.08, -0.06), pos("body", 0, 0, -1.0), r("body", -6))
JET = add(*[r(t, -50 if k < 4 else -30) for k, t in enumerate(TENTS)], *[r(t, -24) for t in TIPS],
          sc("siphon", -0.2, -0.2, 0.2), r("siphon", 50), sc("body", -0.06, -0.06, 0.12), pos("body", 0, 0.5, 6.0),
          r("body", 6), r("shell", 5))
ANIM["dash"] = timeline(0.5, [(0.0, REST, None), (0.12, FLARE, "out"), (0.2, JET, "in"),
                              (0.32, add(JET, pos("body", 0, 0, 1.5)), "out"), (0.5, REST, "ease")],
                        extra=[ring("shell", 0.2, -4, freq=6, decay=7, axis=0, end=0.5)])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Nautilus",
    "description": "The Winterworks nautilus mount in the vanilla mob style: a chunky stepped coil of a shell in "
                   "cream with rust stripes radiating from a dark navel button, a blotched brown hood, small flat dot "
                   "eyes on stubby bulbs, eight short ringed tentacles, a siphon funnel and a sea-teal saddle the "
                   "renderer can hide. Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 600, "colors": 64},
    "light": LIGHT,
    "minecraft": {"fps": 20},
    "render": {"background": "#16384d", "hero": [-38, 18], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "nautilus.json")
    rest_on_ground(spec["parts"], DENSITY, feet=["shell_1"])
    dump(spec, out)
