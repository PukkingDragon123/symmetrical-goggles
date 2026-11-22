"""Builds examples/elder_guardian.json: the Elder Guardian boss (Winterworks, Tides & Treasures).

    python examples/src/elder_guardian.py examples/elder_guardian.json

An ancient guardian in the vanilla mob style, our own take on the guardian silhouette: a big, boxy, stepped body of
pale, aged prismarine stone in plates (dark seams, lit lips), crusted with moss that drips over the upper sides, a
few cracks and barnacles; one simple flat eye in front (a glowing sea-green iris with a dark square pupil that
roves, `pupil`) in a dark socket rim (`lids`) under a heavy stone `brow` that slides down to shut it; a crown of
twelve tapering spike boxes (`spike_0..11`, three boxes each: a dark mauve root, a pale shaft, an ivory point) that
slide out of the body; flat armoured fins; a mouth plate under the eye (bubbles come out of it); and a tail of four
stepped segments ending in a fan.

Units are Minecraft pixels (16 per block) at **density 1** (vanilla texel size): every box is whole pixels, so the
model exports 1:1 to a vanilla entity model:

    PYTHONHASHSEED=0 python -m lowpix mc export examples/elder_guardian.json --mod mods/winterworks \\
        --modid winterworks --package dev.lowpix.winterworks.client.lowpix -o out/elder_guardian

The body is 26 x 24 x 26 px, 30 x 30 x 32 with its plates (about 1.9 blocks); with the spikes, fins and tail it spans
about 3.2 x 2.6 x 4.4 blocks. Drawn at in-game size (scale 1.0): the vanilla 2.35 elder scale is not needed. Faces +Z,
the lowest point (a spike tip) at y = 0, "left" is +X; the root (body) pivots in the middle of the body.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 6): bones body, eye, pupil, spikes (spike_0..11), tail_0..3,
fin_l, fin_r. Extra joints: brow (the heavy upper lid: it slides down 7 px to shut the eye), lids (the socket rim
card), jaw (the mouth plate), spike_k_mid / spike_k_tip, tail_fin, and the locators `mouth` (bubbles spawn here) and
`laser` (the stare's beam starts here, on the pupil): mouth (0, 10.4, 15), laser (0, 16.4, 14.2). The spikes keep
their directions (OCEAN_UPDATE.md section 12).
Clips: idle 4.0, swim 1.6 (loops), bubble 1.0 (shots at 0.45, 0.6, 0.75 s), stare 2.5 (the telegraph runs 0-2.0 s,
the beam fires at 2.0 s), tail_whip 1.0 (wind-up to 0.4 s, the spin 0.4-0.75 s), death 2.0. Glow: ramp `prism` (the
iris). Part names from the earlier design that are no longer drawn stay as empty bones (name compatibility).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (LIGHT, LR, M, ROOT, Rig, add, card_style, combine, dump, flat, keep_names, keys,  # noqa
                       limb1, marks, mottle, osc, pos, r, ramps, rest_on_ground, ring, sc, shake, swirls, timeline,
                       wave)

DENSITY = 1
R = Rig(density=DENSITY, bone_style="armor")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= body: a big stepped block of stone plates
C = np.array((0.0, 16.0, 0.0))
part("body", None, [26, 24, 26], "armor", at=C, centre=C)
part("plate_top", "body", [20, 2, 20], "plate", centre=(0, 29, -1))
part("keel", "plate_top", [4, 2, 12], "plate", centre=(0, 31, -2))
part("plate_low", "body", [20, 2, 20], "plate", centre=(0, 3, -1))
for s in (1, -1):
    part(f"plate_{LR(s)}", "body", [2, 18, 20], "plate", centre=M((14, 16, -1), s))
part("hind", "body", [20, 18, 6], "armor", centre=(0, 16, -16))

# ======================================================================= the eye: a flat glowing eye, a heavy brow
EY, EZ = 15.0, 13.0
part("eye", "body", [8, 6, 1], "eye", at=(0, EY, EZ), centre=(0, EY, EZ + 0.5))
card("pupil", "eye", ["pp", "pp"], "pupil", at=(0, EY, EZ + 1.1))
bone("laser", "pupil", at=(0, EY, EZ + 1.2))
card("lids", "body", ["oooooooooooo", "okkkkkkkkkko", "ok........ko", "ok........ko", "ok........ko",
                      "ok........ko", "ok........ko", "ok........ko", "okkkkkkkkkko", "oooooooooooo"],
     "lids", at=(0, EY, EZ + 1.3))
# the brow: a heavy stone plate over the eye; it slides 7 px down to shut it
part("brow", "body", [14, 7, 3], "brow", at=(0, EY + 6.5, EZ), centre=(0, EY + 6.5, EZ + 1.5))
part("brow_ridge", "brow", [10, 2, 2], "brow", centre=(0, EY + 9, EZ + 1))
# the mouth plate under the eye
bone("jaw", "body", at=(0, 9, 12))
part("jaw_plate", "jaw", [10, 3, 3], "plate", centre=(0, 8.5, 13.5))
part("mouth_slit", "body", [8, 1, 1], "mouth", centre=(0, 10.5, 13.5))
bone("mouth", "body", at=(0, 9, 15))

# ======================================================================= the crown of spikes
SPIKES = [  # base (world), direction, length
    ((-9.0, 30.0, 6.0), (-0.45, 1.0, 0.1), 10.0), ((-4.5, 31.0, 6.0), (-0.2, 1.0, 0.0), 11.0),
    ((0.0, 32.0, 4.0), (0.0, 1.0, 0.05), 12.0), ((4.5, 31.0, 6.0), (0.2, 1.0, 0.0), 11.0),
    ((9.0, 30.0, 6.0), (0.45, 1.0, 0.1), 10.0),
    ((15.0, 23.0, 2.0), (1.0, 0.35, -0.2), 10.0), ((15.0, 9.0, -2.0), (1.0, -0.3, -0.3), 9.0),
    ((-15.0, 23.0, 2.0), (-1.0, 0.35, -0.2), 10.0), ((-15.0, 9.0, -2.0), (-1.0, -0.3, -0.3), 9.0),
    ((-7.0, 2.0, -3.0), (-0.4, -1.0, -0.3), 8.0), ((7.0, 2.0, -3.0), (0.4, -1.0, -0.3), 8.0),
    ((0.0, 26.0, -13.0), (0.0, 0.7, -1.0), 10.0),
]
bone("spikes", "body", at=C)
SPIKE_DIRS = []
for k, (base, d, L) in enumerate(SPIKES):
    base, d = np.array(base, float), np.array(d, float)
    d /= np.linalg.norm(d)
    SPIKE_DIRS.append(d)
    a = limb1(R, f"spike_{k}", "spikes", base - d * 2.0, base + d * (L * 0.4), 3, "spike_base")
    b = limb1(R, f"spike_{k}_mid", f"spike_{k}", a, a + d * (L * 0.38), 2, "spike_mid")
    limb1(R, f"spike_{k}_tip", f"spike_{k}_mid", b, b + d * (L * 0.34), 1, "spike_tip")

# ======================================================================= fins and barnacles
for s in (1, -1):
    n = LR(s)
    part(f"fin_{n}", "body", [10, 1, 7], "fin", at=M((15, 8, 4), s), offset=(s * 5, 0, -1.5),
         rot=(0, s * -35, s * -20))
for k, (x, z, sz) in enumerate(((6.0, -6.0, 3), (-7.0, 3.0, 2), (-2.0, -8.0, 2), (8.0, 4.0, 2))):
    part(f"barnacle_{k}", "plate_top", [sz, 1 if sz < 3 else 2, sz], "barnacle",
         centre=(x, 30.5 if sz < 3 else 31, z))

# ======================================================================= the tail: four stepped segments and a fan
TAIL = [("tail_0", [12, 12, 8]), ("tail_1", [9, 9, 8]), ("tail_2", [6, 6, 8]), ("tail_3", [4, 4, 7])]
parent, at = "body", np.array((0, 16, -18.0))
for k, (tid, size) in enumerate(TAIL):
    part(tid, parent, size, "tail", at=at, offset=(0, 0, -size[2] / 2 + 1), rot=(-4 if k == 0 else 3, 0, 0))
    parent = tid
    at = R.wpos(tid, (0, 0, -size[2] + 1.0))
card("tail_fin", "tail_3", ["..ff.....", ".fmmf....", "fmmmmf...", "fmrmmmf..", "fmmrmmmff", "rrrrrrrrr",
                            "fmmrmmmff", "fmrmmmf..", "fmmmmf...", ".fmmf....", "..ff....."],
     "fin_card", rel=(0, 0, -6), offset=(0, 0, -4.5), plane="yz")

# names of the earlier design that are not drawn any more (kept as empty bones for the mod's code)
keep_names(R, {"body_y": "body", "body_z": "body", "body_m": "body", "hind_y": "hind", "hind_z": "hind",
               "plate_top_z": "plate_top", "plate_l_z": "plate_l", "cheek_l": "body", "plate_r_z": "plate_r",
               "cheek_r": "body", **{f"socket_{k}": "body" for k in range(12)},
               "fin_l_web": "fin_l", "fin_r_web": "fin_r", "barnacle_4": "plate_top", "barnacle_5": "plate_top",
               "barnacle_6": "plate_top", "barnacle_l0": "plate_l", "barnacle_l1": "plate_l",
               "barnacle_l2": "plate_l", "barnacle_r0": "plate_r", "barnacle_r1": "plate_r",
               "barnacle_r2": "plate_r", **{f"tail_{k}_band": f"tail_{k}" for k in range(4)},
               **{f"tail_{k}_fin": f"tail_{k}" for k in range(4)}})

# ======================================================================= palette and paint
RAMPS = ramps("elder", "moss", "mauve", "tooth", "ink", "prism")
styles = {
    "armor": flat("elder", 3.6),
    "plate": flat("elder", 4.4),
    "brow": flat("elder", 3.2),
    "tail": flat("elder", 3.8),
    "fin": flat("elder", 4.0, {"id": "web", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.5,
                               "shift": -1.0, "faces": ["top", "bottom"]}),
    "mouth": flat("ink", 1.0, grain=0.3),
    "barnacle": flat("tooth", 1.4, {"id": "hole", "op": "fill", "ramp": "elder", "tone": 0.4, "faces": ["top"]},
                     grain=0.5),
    # spikes: a dark mauve root, a pale stone shaft, an ivory point
    "spike_base": flat("mauve", 1.6, grain=0.6),
    "spike_mid": flat("elder", 4.6, grain=0.6),
    "spike_tip": flat("tooth", 2.4, grain=0.3),
    # the eye: a flat glowing iris, a darker ring at its edge
    "eye": {"ramp": "prism", "tone": 2.4, "light": 0, "brush": {"off": True}, "dither": 0,
            "rim": {"light": 0, "dark": 0},
            "stamps": [{"face": "front", "at": "top-left", "art": ["12222221", "23333332", "23444332", "23433332",
                                                                    "23333332", "12222221"],
                        "key": {"1": "prism:0", "2": "prism:1", "3": "prism:2", "4": "prism:4"}}]},
    "pupil": card_style("ink", 0, {"p": "ink:0"}, light=0),
    "lids": card_style("elder", 1, {"o": "elder:2", "k": "elder:0"}, light=0),
    "fin_card": card_style("elder", 4, {"f": "elder:6", "m": "elder:4", "r": "elder:2"}),
}


def plates(x, y, z, f):
    """Big stone plates: dark seams in a brick lattice, each plate's upper seam edge lit."""
    if f in ("top", "bottom"):
        u, v = x, z
    elif f in ("front", "back"):
        u, v = x, y
    else:
        u, v = z, y
    row = math.floor((v + 0.5) / 6.0)
    uu = u + (4.0 if row % 2 else 0.0)
    if (v + 0.5) % 6.0 < 1.0 or (uu + 0.5) % 8.0 < 1.0:
        return "s"
    if (v + 0.5) % 6.0 > 5.0:
        return "L"
    return "."


_moss = mottle(5, 7, 0.1, "g")
_moss_dk = mottle(9, 4, 0.55, "G")
_cracks = swirls(13, 16, levels=(0.4,), width=0.06, ch="c")


def moss(x, y, z, f):
    """Moss over the top, dripping down the upper sides in uneven runs."""
    if f == "bottom":
        return "."
    drip = 25 + 3 * math.sin(x * 1.7 + z * 0.9) + 2 * math.sin(z * 2.3)
    if f == "top" or y > drip:
        c = _moss_dk(x, y, z, f)
        if c != ".":
            return c
        return _moss(x, y, z, f)
    return "."


def eye_socket(x, y, z, f):
    """A dark socket ring round the eye on the body front."""
    if f == "front" and abs(x) < 6 and abs(y - EY) < 5:
        return "k"
    return "."


KEY = {"s": "elder:1", "L": "elder:6", "g": "moss:2", "G": "moss:1", "c": "elder:0", "k": "elder:0"}
for pid in ("body", "plate_top", "plate_low", "plate_l", "plate_r", "hind", "keel"):
    marks(R, pid, combine(moss, _cracks, plates) if pid != "body" else combine(eye_socket, moss, _cracks, plates),
          KEY)
for tid, _ in TAIL:
    marks(R, tid, combine(moss, plates), KEY)
marks(R, "brow", combine(moss, lambda x, y, z, f: "s" if f == "front" and (y + 0.5) % 3.0 < 1.0 else "."), KEY)

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
    "description": "The Winterworks Elder Guardian boss in the vanilla mob style: a big boxy body of pale, aged "
                   "prismarine plates crusted with moss, one simple flat glowing eye under a heavy stone brow, a crown "
                   "of twelve tapering spikes that slide out, flat armoured fins and a stepped tail ending in a fan. "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 800, "colors": 48},
    "light": LIGHT,
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
