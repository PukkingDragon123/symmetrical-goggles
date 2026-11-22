"""Builds examples/nautilus.json: the Nautilus (Winterworks, Tides & Treasures), the underwater mount.

    python examples/src/nautilus.py examples/nautilus.json

A large coiled-shell cephalopod: a big planispiral shell (a disc of slabs, rounded at the keel) in cream with rust
"tiger" stripes that radiate from the dark navel and curve back over the keel, the newest whorl by the opening plain
and pale; a leathery brown hood mottled with cream over the head; big round eyes (gold rims, dark round pupils, a
catch-light) at the sides of the opening; a crown of eight long ribbed tentacles (`tentacle_0..7`, two joints each)
with tufts of fine cirri between them; a `siphon` funnel underneath; and a `saddle` on top of the shell (a padded
seat on a sea-teal blanket, brass fittings, straps round the shell) that the renderer shows or hides.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). About 16 x 27 x 32 px; faces +Z, the lowest point at y = 0,
"left" is +X; the root (body) pivots at the head in the shell's opening.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 4): bones shell, body, eye_l, eye_r, tentacles
(tentacle_0..7), siphon, saddle (toggle: hide it when unsaddled). Extra joints: tentacle_k_tip (the outer half of each
tentacle), hood, and the locator `rider` (a bone on the seat, where the rider sits). Clips: idle, swim (loops),
dash (0.5 s). No glow.
"""
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ocean_kit import (GLOSS, LIGHT, LR, M, ROOT, Rig, add, dump, keys, limb, locks, osc, pattern_stamps,  # noqa
                       pos, r, ramps, rest_on_ground, ring, round_eye, rounded, sc, shake, tentacle_tuft, timeline,
                       wave)

DENSITY = 2
R = Rig(density=DENSITY, bone_style="flesh")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= the body: the head in the shell's opening
part("body", None, [10, 8, 7], "flesh_body", at=(0, 10.0, 6.0), centre=(0, 10.0, 6.0))

# ======================================================================= the shell: a disc of slabs round its navel
SC = np.array((0.0, 13.5, -3.0))          # the navel (the coil's centre)
RAD = 10.0
bone("shell", "body", at=SC)
SLABS = []
for k, dz in enumerate((-8.75, -6.25, -3.75, -1.25, 1.25, 3.75, 6.25, 8.75)):
    inner = max(0.0, abs(dz) - 1.25)
    h = 2 * math.sqrt(RAD * RAD - inner * inner)
    h = round(h * 2) / 2
    w = {0: 9.0, 1: 10.0, 2: 10.5, 3: 11.0, 4: 11.0, 5: 11.5, 6: 11.5, 7: 11.0}[k]
    lo, hi = SC[1] - h / 2, SC[1] + h / 2
    if dz > 5:                            # the front slabs only arch over the opening: the head fills the rest
        lo = max(lo, SC[1] + (1.0 if dz > 7 else -1.5))
    hh = round((hi - lo) * 2) / 2
    c = (0.0, lo + hh / 2, SC[2] + dz)
    SLABS.append((f"shell_{k}", [w, hh, 2.5], c))
    part(f"shell_{k}", "shell", [w, hh, 2.5], "shell", centre=c)
# the keel: a slightly narrower rim proud of the slab steps all round the top and back, smoothing the circle
for k, (a0, a1) in enumerate(((60, 105), (105, 150), (150, 195), (195, 240))):
    am = math.radians((a0 + a1) / 2)
    L = 2 * RAD * math.sin(math.radians((a1 - a0) / 2))
    cz, cy = SC[2] + math.cos(am) * (RAD - 0.4), SC[1] + math.sin(am) * (RAD - 0.4)
    part(f"keel_{k}", "shell", [7.5, 1.5, round(L * 2) / 2], "shell", centre=(0, cy, cz),
         rot=(-(math.degrees(am) - 90), 0, 0))
# the navel: a dark dimple on each side
for s in (1, -1):
    part(f"navel_{LR(s)}", "shell", [0.5, 3, 3], "navel", centre=M((5.85, SC[1], SC[2]), s))

# ======================================================================= hood, eyes, tentacles, siphon
part("hood", "body", [11, 4, 8], "hood", at=(0, 13.0, 3.0), centre=(0, 14.5, 7.0), rot=(8, 0, 0))
part("hood_lip", "hood", [10, 1.5, 2], "hood", centre=(0, 13.25, 11.0), rot=(8, 0, 0))
part("head", "body", [9, 5, 5], "flesh_body", centre=(0, 9.5, 9.0))
for s in (1, -1):
    n = LR(s)
    part(f"eye_stalk_{n}", "body", [1.5, 5, 5], "flesh_body", centre=M((5.25, 10.5, 6.5), s))
    part(f"eye_{n}", f"eye_stalk_{n}", [1, 4, 4], "eye", at=M((6.0, 10.5, 6.5), s), centre=M((6.5, 10.5, 6.5), s))

bone("tentacles", "body", at=(0, 8.0, 10.5))
TENT = []
for k in range(8):
    row = k // 4                              # 0: the upper row, 1: the lower row
    j = k % 4
    x = (-3.0 + 2.0 * j)
    start = np.array((x, 9.0 if row == 0 else 6.5, 11.0))
    spread = (x / 3.0) * 0.45
    d1 = np.array((spread, 0.25 if row == 0 else -0.55, 1.0))
    d1 = d1 / np.linalg.norm(d1)
    e = limb(R, f"tentacle_{k}", "tentacles", start, start + d1 * 5.5, 1.0, "tentacle")
    d2 = d1 + np.array((spread * 0.5, -0.45, 0.0))
    d2 = d2 / np.linalg.norm(d2)
    limb(R, f"tentacle_{k}_tip", f"tentacle_{k}", e, e + d2 * 5.0, 1.0, "tentacle_tip")
    TENT.append(k)
# tufts of fine cirri between the big tentacles
for k, (x, y, ry) in enumerate(((-2.0, 8.5, -18), (2.0, 8.5, 18), (0.0, 6.0, 0))):
    card(f"cirri_{k}", "tentacles", tentacle_tuft(14, 12, 9, seed=90 + k), "cirri", at=(x, y, 11.0),
         offset=(0, 0, 3.0), plane="xz", rot=(-10 if y > 7 else 25, ry, 0))
bone("siphon", "body", at=(0, 6.0, 5.0))
part("siphon_tube", "siphon", [3, 2.5, 5], "siphon", centre=(0, 5.25, 7.5), rot=(18, 0, 0))
part("siphon_lip", "siphon", [2.5, 2, 1], "siphon", centre=(0, 4.5, 10.25), rot=(18, 0, 0))

# ======================================================================= the saddle (toggle) and the rider seat
TOP = SC[1] + RAD
bone("saddle", "shell", at=(0, TOP, SC[2] + 0.5))
part("saddle_blanket", "saddle", [12, 0.5, 12], "blanket", rel=(0, 0.25, 0))
card("saddle_fringe_l", "saddle_blanket", locks(24, 3, 41, min_len=0.6), "fringe", rel=(6.0, -0.25, 0),
     offset=(0, -0.75, 0), plane="yz")
card("saddle_fringe_r", "saddle_blanket", locks(24, 3, 42, min_len=0.6), "fringe", rel=(-6.0, -0.25, 0),
     offset=(0, -0.75, 0), plane="yz")
part("saddle_seat", "saddle", [8, 1.5, 9], "saddle", rel=(0, 1.25, 0))
part("saddle_cantle", "saddle_seat", [7, 3, 1.5], "saddle", rel=(0, 1.5, -4.0), rot=(14, 0, 0))
part("saddle_pommel", "saddle_seat", [3, 2.5, 1.5], "saddle", rel=(0, 1.2, 3.8), rot=(-12, 0, 0))
part("saddle_horn", "saddle_pommel", [1.5, 1.5, 1.5], "brass", rel=(0, 1.6, 0.2))
for s in (1, -1):
    n = LR(s)
    # straps running down the shell's sides to a girth under the coil
    part(f"saddle_strap_{n}", "saddle", [0.5, 12, 2], "strap", rel=M((6.9, -6.5, 0), s))
    part(f"saddle_buckle_{n}", f"saddle_strap_{n}", [0.5, 1, 1.5], "brass", rel=M((0.05, -3.0, 0), s))
    card(f"stirrup_{n}", f"saddle_strap_{n}", ["s..", "s..", "s..", "BBB", "b.b", "bBb"], "stirrup",
         rel=M((0.3, -6.0, 0.0), s), offset=(0, -1.5, 0), plane="yz")
bone("rider", "saddle", rel=(0, 2.0, -0.5))

# ======================================================================= palette and paint
RAMPS = ramps("cream", "rust", "flesh", "hood", "amber", "pupil", "leather", "brass", "cloth")
brush = {"flow": "horizontal", "length": 2.0, "width": 0.8, "rough": 0.5, "overshoot": 0.25,
         "textures": {"cream": "organic", "hood": "leather", "flesh": "organic", "leather": "leather",
                      "brass": "metal", "cloth": "cloth"}}
RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.2}


def shell_fn(face):
    """The shell's markings at a point (world coordinates): rust tiger stripes radiating from the navel and curving
    back, over the top and the back of the coil (none on the newest whorl by the opening), a dark navel."""
    shade = {"top": 1.0, "bottom": -1.0, "front": 0.0, "back": -0.4, "left": 0.0, "right": 0.0}[face]

    def fn(x, y, z):
        dz, dy = z - SC[2], y - SC[1]
        rr = math.hypot(dz, dy)
        if face in ("left", "right") and rr < 2.2:
            return "n" if rr < 1.4 else "N"
        if face == "front" and dz > 4.5:
            return "d" if y < SC[1] + 5 else "."          # the dark layer where the hood tucks under the coil
        th = math.degrees(math.atan2(dy, dz)) % 360          # 0 front, 90 top, 180 back, 270 bottom
        # stripes cover 15..280 degrees, fading in at the front and out underneath
        if not (15 <= th <= 280):
            return "."
        fade = min(1.0, (th - 15) / 25.0, (280 - th) / 30.0)
        u = rr / RAD
        phase = (th + 22 * u + 6 * math.sin(u * 7.0)) / 24.0   # radial, bending back a little toward the keel
        duty = (0.16 + 0.3 * u) * fade
        f = phase - math.floor(phase)
        jitter = 0.04 * math.sin(z * 2.1 + y * 1.3)
        if f + jitter > duty or u < 0.22:
            return "."
        t = shade + 0.6 * (dy / RAD) + (0.8 if f < duty * 0.3 else 0.0)
        return "c" if t > 0.6 else ("b" if t > -0.4 else "a")
    return fn


SHELL_KEY = {"a": "rust:2", "b": "rust:4", "c": "rust:6", "n": "hood:0", "N": "rust:1", "d": "hood:1"}
styles = {
    "shell": {"ramp": "cream", "tone": 4.4, "rim": RIM,
              "layers": [{"id": "growth", "op": "noise", "scale": 1.2, "amount": 0.5},
                         {"id": "pale_low", "op": "gradient", "axis": "y", "amount": 0.4}, GLOSS]},
    "navel": {"ramp": "hood", "tone": 1.0, "light": 0.3, "brush": {"off": True},
              "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.0}},
    # the hood: brown leather with pale blotches and a scaly grain
    "hood": {"ramp": "hood", "tone": 4.4, "rim": RIM,
             "layers": [{"id": "grain", "op": "scales", "shape": "round", "along": "z", "size": [1.5, 1.0], "gap": 0.5,
                         "highlight": 0.8, "shadow": -0.8, "jitter": 0.7, "faces": ["top", "sides"]},
                        {"id": "blotch", "op": "patches", "scale": 2.0, "threshold": 0.56, "ramp": "cream",
                         "tone": 4.6, "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "hood",
                                                "shadow_shift": -1.0}}, GLOSS]},
    "flesh": {"ramp": "flesh", "tone": 4.6, "rim": RIM},
    "flesh_body": {"ramp": "flesh", "tone": 4.6, "rim": RIM,
                   "layers": [{"id": "mottle", "op": "patches", "scale": 1.6, "threshold": 0.6, "shift": -1.0},
                              {"id": "spots", "op": "spots", "count": 6, "radius": [0.3, 0.5], "ramp": "hood",
                               "tone": 4.0, "min_gap": 1.0}, GLOSS]},
    "eye": {"ramp": "hood", "tone": 2.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"faces": ["left", "right"], "at": "top-left", "art": round_eye(8, pupil=4),
                        "key": {"k": "hood:1", "i": "amber:4", "I": "amber:5", "J": "amber:7", "p": "pupil:0",
                                "W": "cream:7"}}]},
    "tentacle": {"ramp": "flesh", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.4},
                 "brush": {"off": True},
                 "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.5, "shift": -0.9}]},
    "tentacle_tip": {"ramp": "flesh", "tone": 5.8,
                     "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.4}, "brush": {"off": True},
                     "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.5,
                                 "shift": -0.9}]},
    "cirri": {"ramp": "flesh", "tone": 5, "light": 0, "brush": {"off": True},
              "art_key": {"f": "flesh:5", "s": "flesh:3", "t": "flesh:7"}},
    "siphon": {"ramp": "flesh", "tone": 4.0, "rim": RIM,
               "layers": [{"id": "folds", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.4, "shift": -0.8},
                          {"id": "mouth", "op": "fill", "ramp": "hood", "tone": 1.0, "faces": ["front"]}]},
    "blanket": {"ramp": "cloth", "tone": 4.6, "rim": RIM, "brush": {"flow": "x"},
                "layers": [{"id": "hem", "op": "band", "axis": "x", "from": -1.01, "to": -0.8, "ramp": "brass",
                            "tone": 4.6, "faces": ["top", "sides"]},
                           {"id": "hem_r", "op": "band", "axis": "x", "from": 0.8, "to": 1.01, "ramp": "brass",
                            "tone": 4.6, "faces": ["top", "sides"]},
                           {"id": "waves", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.2, "ramp": "cloth",
                            "tone": 7.0, "wobble": 0.5, "faces": ["top"]}]},
    "fringe": {"ramp": "cloth", "tone": 4, "light": 0, "brush": {"off": True},
               "art_key": {"t": "brass:6", "m": "cloth:6", "f": "cloth:4"}},
    "saddle": {"ramp": "leather", "tone": 4.6, "rim": RIM, "brush": {"flow": "z"},
               "layers": [{"id": "stitch", "op": "panel", "inset": 1, "shift": -1.2, "highlight": 0.8, "min_size": 4},
                          GLOSS]},
    "strap": {"ramp": "leather", "tone": 3.6, "rim": RIM, "brush": {"off": True}},
    "brass": {"ramp": "brass", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6},
              "brush": {"off": True}},
    "stirrup": {"ramp": "brass", "tone": 4, "light": 0, "brush": {"off": True},
                "art_key": {"s": "leather:3", "B": "brass:6", "b": "brass:3"}},
}
for name, size, c in SLABS:
    p = next(p for p in R.P if p["id"] == name)
    p["paint"] = {"stamps": []}
    for f in ("left", "right", "top", "bottom", "front", "back"):
        p["paint"]["stamps"] += pattern_stamps(size, DENSITY, shell_fn(f), c, faces=(f,), key=SHELL_KEY)
for p in R.P:
    if p["id"].startswith("keel_"):
        # keels are rotated: paint their stripes as plain transverse bands
        p["paint"] = {"layers": [{"id": "bands", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.4,
                                  "ramp": "rust", "tone": 4.6, "wobble": 0.2}]}

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
    "description": "The Winterworks nautilus mount: a big coiled shell in cream with rust tiger stripes radiating "
                   "from a dark navel, a mottled leathery hood, big round gold-rimmed eyes, eight ribbed tentacles "
                   "with tufts of cirri, a siphon funnel and a sea-teal saddle the renderer can hide. Minecraft pixel "
                   "units, density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 1000, "colors": 80},
    "light": LIGHT,
    "brush": brush,
    "minecraft": {"fps": 20},
    "render": {"background": "#16384d", "hero": [-38, 18], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "nautilus.json")
    rest_on_ground(spec["parts"], DENSITY)
    dump(spec, out)
