"""Builds examples/elder_guardian.json: the Elder Guardian boss (Winterworks, Tides & Treasures).

    python examples/src/elder_guardian.py examples/elder_guardian.json

An ancient armoured guardian: a heavy rounded body sheathed in overlapping plates of pale, weathered prismarine stone
(cracked, chipped and crusted with barnacles and sea growth, faded mauve on the plate rims) with one huge round eye in
front: a pale eyeball deep under a heavy brow, a big round glowing sea-green iris with a round pupil and a catch-light
that roves (`pupil`), lids rounding the opening. A crown of twelve spikes (`spike_0..11`, each a tapering horn of
three boxes) stands round it: five over the brow, two each side, three underneath; each can slide out of its socket.
Armoured pectoral fins with torn membranes, a mouth plate under the eye (bubbles come out of it), and a tail of four
armoured segments ending in a ragged fan.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). The body is about 26 x 24 x 28 px (1.6 blocks); with the
spikes, fins and tail it spans about 4 x 3 x 4.6 blocks. Drawn at in-game size: the vanilla 2.35 elder scale is not
needed. Faces +Z, the lowest point at y = 0, "left" is +X; the root
(body) pivots in the middle of the body.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 6): bones body, eye, pupil, spikes (spike_0..11), tail_0..3,
fin_l, fin_r. Extra joints: brow (the heavy upper lid: it slides down to shut the eye), lids (the lid frame card),
jaw (the mouth plate), spike_k_mid / spike_k_tip, tail_fin, and the locators `mouth` (bubbles spawn here) and
`laser` (the stare's beam starts here, on the pupil). Clips: idle, swim (loops), bubble (1.0 s: shots at 0.45, 0.6,
0.75 s), stare (2.5 s: the telegraph runs 0-2.0 s, the beam fires at 2.0 s), tail_whip (1.0 s: wind-up to 0.4 s, the
spin 0.4-0.75 s), death (2.0 s). Glow: ramp `prism` (the iris and a few glowing seams).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (LIGHT, LR, M, ROOT, Rig, add, aim, barnacle_cluster, dump, eyeball, fan_fin, iris_card,  # noqa
                       keys, lid_frame, limb, osc, pos, r, ragged_fin, ramps, rest_on_ground, ring, rounded, sc,
                       shake, spikes, timeline, wave)

DENSITY = 2
R = Rig(density=DENSITY, bone_style="armor")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= body: a heavy rounded armoured mass
C = np.array((0.0, 16.0, 0.0))
rounded(R, "body", None, [26, 24, 28], "armor", centre=C + (0, 0, -1.0), at=C, cut=(0.5, 0.74), steps=4)
rounded(R, "hind", "body", [19, 17, 8], "armor", centre=(0, 15.5, -15.0), skip=("m",), cut=(0.7, 0.8))
# overlapping plates: a dorsal shield with a keel, flank shields, a chin plate
rounded(R, "plate_top", "body", [22, 3, 22], "plate", centre=(0, 28.5, -1.0), skip=("y", "m"), cut=(0.8, 0.82))
part("keel", "plate_top", [3, 2, 16], "plate", centre=(0, 30.5, -2.0))
for s in (1, -1):
    n = LR(s)
    rounded(R, f"plate_{n}", "body", [3, 18, 20], "plate", centre=M((13.5, 17.0, -1.0), s), skip=("y", "m"),
            cut=(0.82, 0.84))
    part(f"cheek_{n}", "body", [3, 12, 6], "plate", centre=M((10.0, 13.0, 11.5), s), rot=(0, s * -20, 0))
part("plate_low", "body", [20, 3, 20], "plate", centre=(0, 3.5, -1.0))

# ======================================================================= the eye: eyeball, roving iris, lids, brow
EY, EZ = 17.0, 13.0
part("eye", "body", [15, 15, 1], "eye", at=(0, EY, EZ), centre=(0, EY, EZ + 0.5))
card("pupil", "eye", iris_card(20, 8), "iris", at=(0, EY, EZ + 1.1))
bone("laser", "pupil", at=(0, EY, EZ + 1.2))
card("lids", "body", lid_frame(36, 36, 28, 28, dy=1), "lids", at=(0, EY, EZ + 1.3))
# the brow: a heavy plate over the eye, it slides down to shut it
part("brow", "body", [20, 4, 4], "brow", at=(0, EY + 8.0, EZ), centre=(0, EY + 7.5, EZ + 1.25), rot=(-14, 0, 0))
part("brow_ridge", "brow", [16, 2, 3], "brow", centre=(0, EY + 9.75, EZ + 0.5))
# the mouth plate under the eye
bone("jaw", "body", at=(0, 7.5, 10.0))
part("jaw_plate", "jaw", [14, 3, 4], "plate", centre=(0, 6.5, 12.5))
part("mouth_slit", "body", [12, 1.5, 1], "mouth", centre=(0, 8.25, 13.3))
bone("mouth", "body", at=(0, 7.0, 15.0))

# ======================================================================= the crown of spikes
SPIKES = [  # base (world), direction, length
    ((-9.0, 29.0, 6.0), (-0.45, 1.0, 0.1), 10.0), ((-4.5, 30.0, 7.0), (-0.2, 1.0, 0.0), 11.0),
    ((0.0, 31.5, 7.0), (0.0, 1.0, 0.05), 12.0), ((4.5, 30.0, 7.0), (0.2, 1.0, 0.0), 11.0),
    ((9.0, 29.0, 6.0), (0.45, 1.0, 0.1), 10.0),
    ((15.0, 23.0, 0.0), (1.0, 0.35, -0.2), 10.0), ((15.0, 10.0, -2.0), (1.0, -0.3, -0.3), 9.0),
    ((-15.0, 23.0, 0.0), (-1.0, 0.35, -0.2), 10.0), ((-15.0, 10.0, -2.0), (-1.0, -0.3, -0.3), 9.0),
    ((-7.0, 3.0, -3.0), (-0.4, -1.0, -0.3), 8.0), ((7.0, 3.0, -3.0), (0.4, -1.0, -0.3), 8.0),
    ((0.0, 26.0, -12.0), (0.0, 0.7, -1.0), 10.0),
]
bone("spikes", "body", at=C)
SPIKE_DIRS = []
for k, (base, d, L) in enumerate(SPIKES):
    base, d = np.array(base, float), np.array(d, float)
    d /= np.linalg.norm(d)
    SPIKE_DIRS.append(d)
    a = limb(R, f"spike_{k}", "spikes", base - d * 1.5, base + d * (L * 0.38), 2.5, "spike_base")
    b = limb(R, f"spike_{k}_mid", f"spike_{k}", a, a + d * (L * 0.34), 1.5, "spike_mid")
    limb(R, f"spike_{k}_tip", f"spike_{k}_mid", b, b + d * (L * 0.34), 1.0, "spike_tip")
    part(f"socket_{k}", "body", [4, 1, 4], "socket", at=base - d * 0.4, wrot=aim(-d), centre=base - d * 0.4)

# ======================================================================= fins and barnacles
for s in (1, -1):
    n = LR(s)
    root = M((14.5, 8.0, 4.0), s)
    part(f"fin_{n}", "body", [8, 2, 5], "plate", at=root, offset=(s * 4.0, 0, -1.0), rot=(0, s * -35, s * -20))
    web = fan_fin(22, 20, (0.5, 3.0), [(8, 0.5), (14, 1.5), (19, 4.5), (21.5, 9.0), (20, 14.0), (14, 18.5),
                                       (8, 19.5)], seed=31 + s, torn=0.6, scallop=0.3)
    card(f"fin_{n}_web", f"fin_{n}", web if s > 0 else [row[::-1] for row in web], "fin", rel=(s * 6.0, 0, -1.0),
         offset=(s * 5.5, 0, -3.5), plane="xz")
# barnacles: little chalky cones in clusters on the old plates
BARN = [(6.0, 30.0, -6.0), (7.5, 30.0, -4.5), (5.0, 30.0, -3.5), (-7.0, 30.0, 2.0), (-8.0, 30.0, 0.5),
        (-2.0, 30.0, -9.0), (-0.5, 30.0, -10.0)]
for k, (x, y, z) in enumerate(BARN):
    sz = 1.5 if k % 3 else 2.0
    part(f"barnacle_{k}", "plate_top", [sz, 1.0 if k % 2 else 1.5, sz], "barnacle", centre=(x, y + 0.5, z))
for s in (1, -1):
    for k, (y, z) in enumerate(((21.0, -9.0), (19.5, -10.5), (12.0, 5.0))):
        part(f"barnacle_{LR(s)}{k}", f"plate_{LR(s)}", [1.0, 1.5, 1.5], "barnacle", centre=M((15.25, y, z), s))

# ======================================================================= the tail: four armoured segments and a fan
TAIL = [("tail_0", [13, 12, 8]), ("tail_1", [10, 9, 8]), ("tail_2", [7, 6.5, 8]), ("tail_3", [5, 4.5, 7.5])]
parent, at = "body", np.array((0, 15.5, -17.5))
for k, (tid, size) in enumerate(TAIL):
    part(tid, parent, size, "tail", at=at, offset=(0, 0, -size[2] / 2 + 0.5), rot=(-4 if k == 0 else 3, 0, 0))
    part(f"{tid}_band", tid, [size[0] + 1, size[1] + 1, 1.5], "band", rel=(0, 0, -0.75))
    card(f"{tid}_fin", tid, spikes(int(size[2] * 2), 6, seed=60 + k), "fin", rel=(0, size[1] / 2, -size[2] / 2 + 0.5),
         offset=(0, 1.5, 0), plane="yz")
    parent, at = tid, None
    at = R.wpos(tid, (0, 0, -size[2] + 1.0))
card("tail_fin", "tail_3", fan_fin(22, 30, (0.5, 15.0), [(9, 1.0), (16, 2.5), (20.5, 8.0), (21.5, 15.0), (20.5, 22.0),
                                                         (16, 27.5), (9, 29.0)], seed=71, torn=0.7, scallop=0.3),
     "fin", rel=(0, 0, -7.0), offset=(0, 0, -5.5), plane="yz")

# ======================================================================= palette and paint
RAMPS = ramps("elder", "mauve", "algae", "barnacle", "sclera", "pupil", "prism")
brush = {"flow": "horizontal", "length": 2.0, "width": 0.8, "rough": 0.55, "overshoot": 0.25,
         "textures": {"elder": "stone", "mauve": "stone", "barnacle": "stone", "algae": "moss"}}
RIM = {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6}
CRACKS = {"id": "cracks", "op": "cracks", "scale": 5.0, "width": 0.03, "threshold": 0.55, "shift": -2.0,
          "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.0}}
SEAMS = {"id": "seams", "op": "cracks", "scale": 12.0, "width": 0.012, "threshold": 0.78, "ramp": "prism",
         "tone": 1.6, "seed": 5, "post": True, "faces": ["front", "sides"]}
PLATES = {"id": "plates", "op": "scales", "shape": "square", "along": "z", "size": [4.0, 3.0], "gap": 0.5,
          "highlight": 1.2, "gradient": 1.2, "shadow": -1.6, "jitter": 0.6, "faces": ["top", "sides"]}
GROWTH = {"id": "growth", "op": "patches", "scale": 2.2, "threshold": 0.66, "ramp": "algae", "tone": 3.6,
          "faces": ["top"], "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "elder", "shadow_shift": -2.0}}
CHIPS = {"id": "chips", "op": "wear", "width": 1, "density": 0.18, "shift": -2.2}
MAUVE = {"id": "mauve", "op": "patches", "scale": 3.5, "threshold": 0.7, "ramp": "mauve", "tone": 4.2,
         "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.0, "highlight_shift": 0.8}}
RIMWEAR = {"id": "rimwear", "op": "wear", "width": 1, "density": 0.35, "ramp": "mauve", "tone": 5.0}
SPECKS = {"id": "specks", "op": "spots", "count": 6, "radius": [0.3, 0.6], "ramp": "barnacle", "tone": 6.5,
          "min_gap": 1.5, "faces": ["top", "sides"],
          "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "elder", "shadow_shift": -2.0}}
styles = {
    "armor": {"ramp": "elder", "tone": 7.0, "rim": RIM,
              "layers": [{"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.8}, PLATES, MAUVE, RIMWEAR,
                         CRACKS, SEAMS, SPECKS, CHIPS, dict(GROWTH, threshold=0.72)]},
    "plate": {"ramp": "elder", "tone": 8.0, "rim": dict(RIM, light_shift=2.4),
              "layers": [{"id": "groove", "op": "panel", "inset": 1, "shift": -1.6, "highlight": 1.0, "min_size": 5},
                         dict(MAUVE, seed=3), RIMWEAR, dict(CRACKS, seed=4), SPECKS, CHIPS, GROWTH]},
    "brow": {"ramp": "elder", "tone": 6.4, "rim": dict(RIM, light_shift=2.6),
             "layers": [dict(PLATES, size=[3.0, 2.0]), RIMWEAR, dict(CRACKS, seed=14),
                        {"id": "shade", "op": "fill", "ramp": "elder", "tone": 2.4, "faces": ["bottom"]}]},
    "socket": {"ramp": "elder", "tone": 4.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.0},
               "brush": {"off": True}},
    # spikes: old horn, dark and ringed at the root, paling to an ivory point
    "spike_base": {"ramp": "mauve", "tone": 2.6, "rim": RIM, "brush": {"flow": "y"},
                   "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3,
                               "shift": -1.0}]},
    "spike_mid": {"ramp": "elder", "tone": 7.0, "rim": RIM, "brush": {"off": True},
                  "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3,
                              "shift": -1.4}]},
    "spike_tip": {"ramp": "barnacle", "tone": 7.4, "rim": RIM, "brush": {"off": True}},
    "mouth": {"ramp": "elder", "tone": 0.6, "light": 0.2, "brush": {"off": True},
              "layers": [{"id": "glow", "op": "band", "axis": "y", "from": -0.2, "to": 0.2, "ramp": "prism",
                          "tone": 1.6, "faces": ["front"]}]},
    "tail": {"ramp": "elder", "tone": 7.0, "rim": RIM, "brush": {"flow": "z"},
             "layers": [dict(PLATES, size=[3.0, 2.0]), MAUVE, RIMWEAR, dict(CRACKS, seed=8), SPECKS, CHIPS]},
    "band": {"ramp": "mauve", "tone": 4.4, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "studs", "op": "rivets", "inset": 1, "spacing": 3, "highlight": 1.4, "shadow": -1.4,
                         "min_size": 3}]},
    "fin": {"ramp": "mauve", "tone": 4.2, "light": 0.3, "brush": {"off": True},
            "layers": [{"id": "veil", "op": "noise", "scale": 1.5, "amount": 0.6}],
            "art_key": {"r": "elder:9", "t": "barnacle:7", "e": "mauve:6", "m": "mauve:5", "f": "mauve:3"}},
    "barnacle": {"ramp": "barnacle", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.8,
                                                           "dark_shift": -1.6}, "brush": {"off": True},
                 "layers": [{"id": "hole", "op": "spots", "count": 1, "radius": [0.35, 0.45], "ramp": "barnacle",
                             "tone": 0.6, "faces": ["top"]},
                            {"id": "ridges", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.5, "shift": -1.0,
                             "faces": ["sides"]}]},
    # the eyeball: pale and glassy, veined, shaded deep under the brow
    "eye": {"ramp": "sclera", "tone": 5.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"face": "front", "at": "top-left", "art": eyeball(30, 30, 28, 28, lid_shade=6),
                        "key": {"L": "elder:2", "k": "elder:1", "l": "elder:5", "u": "elder:0", "d": "sclera:3",
                                "s": "sclera:6", "S": "sclera:7"}}]},
    # the iris: a big round glowing sea-green iris, fibres, a round pupil, a soft catch-light
    "iris": {"ramp": "prism", "tone": 3.0, "light": 0, "brush": {"off": True},
             "art_key": {"o": "prism:0", "i": "prism:2", "I": "prism:3", "J": "prism:5", "c": "prism:6",
                         "p": "pupil:0", "q": "pupil:2", "W": "prism:8", "w": "prism:6"}},
    "lids": {"ramp": "elder", "tone": 7.0, "light": 0.3, "brush": {"off": True},
             "layers": [dict(PLATES, faces=["all"]), dict(CRACKS, seed=12)],
             "art_key": {"k": "elder:0", "l": "elder:9", "F": "elder:3", "M": "elder:10"}},
}

# ======================================================================= animation
REST = {}
SP = [f"spike_{k}" for k in range(12)]
TAILS = ["tail_0", "tail_1", "tail_2", "tail_3", "tail_fin"]
BROW_SHUT = pos("brow", 0, -7.0, 0.6)


def extend(amount, which=None):
    """Slide spikes out of (or, negative, into) their sockets along their own direction."""
    out = {}
    for k in (which if which is not None else range(12)):
        d = SPIKE_DIRS[k] * amount
        out = add(out, pos(f"spike_{k}", *d))
    return out


ANIM = {}
# idle: a slow, heavy hover: the body bobs and rolls, the tail sways with follow-through, the fins scull, the spikes
# breathe in and out of their sockets, the eye roves and blinks
L = 4.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
    osc("body", None, [0, 1.0, 0], 1, 0.0, ch="position"), osc("body", "z", 2, 1, 0.3), osc("body", "x", -1.5, 1, 0.1),
    wave(TAILS, "y", 9, 1, lag=0.12, growth=1.25), wave(TAILS, "x", 3, 2, lag=0.1, growth=1.2, phase=0.2),
    osc("fin_l", "z", 10, 2, 0.0), osc("fin_r", "z", -10, 2, 0.0), osc("fin_l", "y", 6, 2, 0.25),
    osc("fin_r", "y", -6, 2, 0.25),
    *[osc(f"spike_{k}", None, list(SPIKE_DIRS[k] * 0.8), 1, 0.05 * k, ch="position") for k in range(12)],
    keys("pupil", None, [[0, [0, 0, 0]], [0.6, [0, 0, 0]], [0.8, [2.5, 0.5, 0]], [1.6, [2.5, 0.5, 0]],
                         [1.8, [-2.0, -1.0, 0]], [2.6, [-2.0, -1.0, 0]], [2.8, [0, 0, 0]]], ch="position"),
    keys("brow", None, [[0, [0, 0, 0]], [3.2, [0, 0, 0]], [3.35, [0, -7.0, 0.6]], [3.45, [0, -7.0, 0.6]],
                        [3.65, [0, 0, 0]], [4.0, [0, 0, 0]]], ch="position"),
    osc("jaw", "x", 3, 1, 0.6, bias=1),
])

# swim: the tail drives it in strong sweeps, the body counter-yaws and rolls, fins pumping, spikes drawn in
L = 1.6
ANIM["swim"] = timeline(L, [(0.0, extend(-1.5), None), (L, extend(-1.5), None)], loop=True, extra=[
    wave(TAILS, "y", 22, 1, lag=0.13, growth=1.3),
    osc("body", "y", -6, 1, 0.05), osc("body", "z", 3, 1, 0.3), osc("body", "x", 2, 2, 0.1),
    osc("fin_l", "z", 22, 1, 0.0), osc("fin_r", "z", -22, 1, 0.0), osc("fin_l", "y", 14, 1, 0.25),
    osc("fin_r", "y", -14, 1, 0.25),
    osc("body", None, [0, 0.6, 0], 2, 0.2, ch="position"),
    osc("pupil", None, [0.8, 0.4, 0], 1, 0.3, ch="position"),
])

# bubble: it draws in (swells, spikes sink, brow lifts), then spits three bubbles in quick pulses (shots at 0.45,
# 0.6 and 0.75 s from the `mouth` locator): the body jolts and contracts, the mouth plate drops, the spikes flare
INHALE = add(sc("body", 0.08, 0.1, 0.06), extend(-2.0), pos("brow", 0, 1.0, 0), r("jaw", -4), pos("body", 0, 0, -1.0),
             r("tail_0", 12), r("tail_1", 10))
SHOT = add(sc("body", -0.06, -0.05, -0.04), r("jaw", 28), extend(2.5), pos("body", 0, 0, -2.0), r("body", -6))
REC = add(sc("body", 0.03, 0.03, 0.02), r("jaw", 6), extend(0.5))
ANIM["bubble"] = timeline(1.0, [(0.0, REST, None), (0.35, INHALE, "ease"), (0.45, SHOT, "out"), (0.53, REC, "ease"),
                                (0.6, SHOT, "out"), (0.68, REC, "ease"), (0.75, SHOT, "out"), (1.0, REST, "ease")],
                          extra=[shake("tail_3", 0.4, 0.9, 10, freq=8, axis=1),
                                 shake("fin_l", 0.0, 0.35, 8, freq=10, axis=2),
                                 shake("fin_r", 0.0, 0.35, -8, freq=10, axis=2)])

# stare: the telegraph (0-2.0 s): the brow lifts, the eye bulges, the pupil shrinks and locks dead ahead, the spikes
# slowly slide fully out and tremble harder and harder, the tail curls tight; at 2.0 s the beam fires: a recoil, then
# a rigid, quivering hold while the beam runs
WIDE = add(pos("brow", 0, 2.0, -0.3), sc("eye", 0.12, 0.12, 0), sc("pupil", -0.35, -0.35, 0), extend(3.5),
           r("tail_0", 18), r("tail_1", 18), r("tail_2", 16), r("tail_3", 14), r("body", -4),
           r("fin_l", 0, 20, 20), r("fin_r", 0, -20, -20), r("jaw", -2))
FIRE = add(WIDE, r("body", 8), pos("body", 0, 0, -2.5), sc("pupil", -0.1, -0.1, 0), sc("eye", 0.04, 0.04, 0))
ANIM["stare"] = timeline(2.5, [(0.0, REST, None), (0.4, add(sc("pupil", 0.1, 0.1, 0), pos("brow", 0, 1.0, 0)), "ease"),
                               (1.5, WIDE, "ease"), (1.95, add(WIDE, r("body", -3)), "ease"), (2.05, FIRE, "out"),
                               (2.2, add(FIRE, r("body", -5), pos("body", 0, 0, 1.5)), "ease"),
                               (2.5, add(FIRE, r("body", -5), pos("body", 0, 0, 1.5)), "ease")],
                         extra=[shake("spikes", 0.6, 2.0, 2.5, freq=14, axis=2),
                                shake("body", 1.2, 2.0, 1.5, freq=16, axis=1),
                                shake("body", 2.05, 2.5, 0.8, freq=18, axis=2),
                                keys("pupil", None, [[0, [0, 0, 0]], [0.3, [1.5, 0.5, 0]], [0.6, [0, 0, 0]],
                                                     [2.5, [0, 0, 0]]], ch="position")])

# tail_whip: a wind-up (yawed one way, the tail coiled the other, spikes out), then a full spin with the tail lashing
# straight out, and a settle
COIL = add(r("body", 0, 38, 6), r("tail_0", 0, -30), r("tail_1", 0, -32), r("tail_2", 0, -30), r("tail_3", 0, -24),
           extend(2.5), r("fin_l", 0, 0, 24), r("fin_r", 0, 0, -24))
LASH = add(r("body", 0, -300, -10), extend(3.5), r("tail_0", 0, 26), r("tail_1", 0, 20), r("tail_2", 0, 14),
           r("tail_3", 0, 10))
ANIM["tail_whip"] = timeline(1.0, [(0.0, REST, None), (0.4, COIL, "in_back"), (0.62, add(LASH, r("body", 0, 120)), "in"),
                                   (0.75, LASH, "out"), (1.0, r("body", 0, -360), "ease")],
                             extra=[ring("tail_fin", 0.75, 30, freq=6, decay=5, axis=1, end=1.0),
                                    ring("tail_3", 0.75, 20, freq=6, decay=5, axis=1, end=1.0)])

# death: a violent shudder with the eye flaring, the spikes sink, it rolls belly-up and sinks, the tail curls, the
# pupil spreads and the brow slides shut
DYING = add(sc("eye", 0.15, 0.15, 0), sc("pupil", -0.3, -0.3, 0), extend(1.5), r("body", -12), pos("brow", 0, 1.5, 0))
DEAD = add(r("body", 10, 20, 175), pos("body", 0, -6.0, 0), extend(-3.0), sc("pupil", 0.3, 0.3, 0), BROW_SHUT,
           r("tail_0", 20), r("tail_1", 24), r("tail_2", 26), r("tail_3", 22), r("fin_l", 0, 0, 40),
           r("fin_r", 0, 0, -40), r("jaw", 18))
ANIM["death"] = timeline(2.0, [(0.0, REST, None), (0.3, DYING, "out"), (1.1, add(DEAD, r("body", 0, 0, 20)), "ease"),
                               (1.5, DEAD, "ease"), (2.0, DEAD, "ease")],
                         extra=[shake("body", 0.0, 0.5, 6, freq=14, axis=2),
                                shake("spikes", 0.0, 0.6, 4, freq=12, axis=0),
                                ring("tail_3", 1.1, 14, freq=4, decay=4, axis=0, end=2.0)])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Elder Guardian",
    "description": "The Winterworks Elder Guardian boss: an ancient armoured guardian of pale weathered prismarine "
                   "plates, cracked, barnacled and faded mauve, one huge round eye with a glowing sea-green iris and a "
                   "round pupil under a heavy brow, a crown of twelve extendable spikes, armoured fins and a tail of "
                   "four segments ending in a torn fan. Minecraft pixel units, density 2: exports 1:1 to a vanilla "
                   "entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 1600, "colors": 96},
    "light": LIGHT,
    "brush": brush,
    "minecraft": {"fps": 20, "glow_ramps": ["prism"]},
    "render": {"background": "#173a40", "hero": [34, 16], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "elder_guardian.json")
    rest_on_ground(spec["parts"], DENSITY)
    dump(spec, out)
