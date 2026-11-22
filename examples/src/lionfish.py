"""Builds examples/lionfish.json: the Lionfish (Winterworks, Tides & Treasures).

    python examples/src/lionfish.py examples/lionfish.json

A reef lionfish in the vanilla mob style: a deep, boxy orange-red body with clean cream stripes (they slant back
round the head, a thin dark line runs through each coral band), a cream chin and belly, small flat dot eyes under a
fierce brow, a crest of six striped spine cards with torn pale flags (`spines`), big striped pectoral fans (`fins`)
spread to the sides, little pelvic fins, a soft dorsal and anal fin at the back and a striped tail fan.

Units are Minecraft pixels (16 per block) at **density 1** (vanilla texel size). About 25 px long, 24 px tall with the
spines and 22 px across the spread fans; draw it at scale 0.6 (about 15 px long in game, like a big tropical fish).
Every box is whole pixels, so the model exports 1:1 to a vanilla entity model:

    PYTHONHASHSEED=0 python -m lowpix mc export examples/lionfish.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/lionfish

Faces +Z, the lowest point (the pelvic fins) at y = 0, "left" is +X; the root (body) pivots in the middle of the trunk.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 4): bones body, fins (the pectoral pair: fin_l, fin_r), spines
(the dorsal crest: spine_0..5), tail. Extra joints: head, jaw, tail_fin, fin_pelvic_l/r, fin_soft, fin_anal, eye_l/r
(the painted eyes' spots). Clips: swim 2.0 (loop), hunt 0.5, flare (spines out) 0.8. No glow. Part names from the
earlier design that are no longer drawn stay as empty bones (name compatibility).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (LIGHT, LR, M, ROOT, Rig, add, banded_fan, card_style, combine, dump, flat, keep_names,  # noqa
                       marks, osc, pos, r, ramps, rest_on_ground, ring, sc, shake, side_eye, timeline, wave)

DENSITY = 1
R = Rig(density=DENSITY, bone_style="red")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= body, head, tail
part("body", None, [5, 9, 9], "red", at=(0, 8.5, 0), centre=(0, 8.5, -2.5))
part("belly", "body", [3, 1, 7], "red", centre=(0, 3.5, -2.5))
part("head", "body", [5, 8, 5], "head", centre=(0, 9, 4.5))
part("snout", "head", [3, 4, 2], "head", centre=(0, 8, 8))
bone("jaw", "head", at=(0, 6, 5))
part("jaw_bone", "jaw", [3, 1, 4], "jaw", centre=(0, 5.5, 7))
for s in (1, -1):
    bone(f"eye_{LR(s)}", "head", at=M((2.5, 11, 6), s))
part("tail", "body", [3, 3, 3], "red", at=(0, 8.5, -7), centre=(0, 8.5, -8.5))
card("tail_fin", "tail", banded_fan(6, 11, (0.0, 5.5), 6.3, spread=(-72, 72), bands="wrr", notches=2, seed=9),
     "fin", at=(0, 8.5, -10), offset=(0, 0, -3), plane="yz")

# ======================================================================= the dorsal spines: six striped spine cards
bone("spines", "body", at=(0, 13, 1))
SPINE_Z = (3.0, 1.5, 0.0, -1.5, -3.0, -4.5)
SPINE_RX = (-12, -4, 4, 12, 20, 28)      # rest lean: each spine leans further back, a fan
SPINE_H = (9, 11, 11, 10, 8, 7)
for k, (z, rx, h) in enumerate(zip(SPINE_Z, SPINE_RX, SPINE_H)):
    # a spine banded coral and cream with a dark tip, a torn pale membrane flag trailing its lower half;
    # neighbours alternate two pixels apart in x so they never overlap flat
    art = []
    for j in range(h):
        sp = "t" if j == 0 else "rw"[((h - j) // 2) % 2]
        fl = "m" if j >= h // 2 and (j + k) % 4 else "."
        art.append(sp + fl)
    card(f"spine_{k}", "spines", art, "spine", at=(1 if k % 2 else -1, 12.8, z), offset=(0, h / 2, -0.5),
         plane="yz", rot=(rx, 0, 0))

# ======================================================================= the pectoral fans and the little fins
bone("fins", "body", at=(0, 7, 2))
PEC = banded_fan(9, 11, (0.5, 5.5), 8.6, spread=(-70, 70), bands="rrw", notches=3, seed=4)
for s in (1, -1):
    n = LR(s)
    card(f"fin_{n}", "fins", PEC, "fin", at=M((2.5, 7, 2), s), offset=(0, 0, -4.5), plane="yz",
         rot=(10, s * -55, s * -25))
    card(f"fin_pelvic_{n}", "body", ["ww.", "rwr", "rw.", "r.."], "fin", at=M((1, 4, 1), s), offset=(0, -2, -1.5),
         plane="yz", rot=(20, s * -15, s * -10))
card("fin_soft", "body", ["..rw..", ".rwrw.", "rwrwrw", "rwrwrw"], "fin", at=(0, 13, -5), offset=(0, 2, -2.5),
     plane="yz")
card("fin_anal", "body", ["rwrwr", ".rwr.", "..r.."], "fin", at=(0, 4, -5), offset=(0, -1.5, -2), plane="yz")

# names of the earlier design that are not drawn any more (kept as empty bones for the mod's code)
keep_names(R, {"body_y": "body", "body_z": "body", "head_z": "head", "lip": "head", "brow_l": "head",
               "brow_r": "head", "cheek_frill_l": "jaw", "cheek_frill_r": "jaw"})

# ======================================================================= palette and paint
RAMPS = ramps("coral", "cream", "veil", "ink", "glint")
styles = {
    "red": flat("coral", 3.6, grain=1.0),
    "head": flat("coral", 3.8, grain=1.0),
    "jaw": flat("cream", 2.6, grain=0.6),
    # spines and fins: striped coral and cream, dark tips, a pale membrane
    "spine": card_style("coral", 3, {"r": "coral:3", "w": "cream:4", "t": "coral:0", "m": "veil:3"}),
    "fin": card_style("coral", 3, {"r": "coral:4", "w": "cream:4", "m": "veil:2"}),
}


# bands: broad coral and narrow cream ones slanting back toward the head, a thin dark line through each coral
# band, a cream chin and belly
def stripes(x, y, z, f):
    if f == "bottom" or y < 5:
        return "c"
    u = z + 0.4 * (y - 8)
    m = (u + 0.5) % 3.5
    if m < 1.0:
        return "c"
    if 2.0 < m < 2.8 and f != "top":
        return "d"
    return "."


def face(x, y, z, f):
    """The face: a cream cheek patch under the eye, a dark mouth line."""
    if f in ("left", "right", "front") and 6 < y < 7 and z > 6:
        return "d"
    if f in ("left", "right") and y < 8 and z > 5:
        return "c"
    return "."


KEY = {"c": "cream:3", "d": "coral:1", "k": "ink:0", "h": "glint:1", "b": "coral:0", "l": "coral:1"}
for pid in ("body", "tail", "belly"):
    marks(R, pid, stripes, KEY)
marks(R, "head", combine(side_eye(12, 7, w=2, h=2, brow="angry", gap=1), face, stripes), KEY)
marks(R, "snout", combine(face, stripes), KEY)

# ======================================================================= animation
REST = {}
SPINES = [f"spine_{k}" for k in range(6)]


def hover(L, cycles=1, amp=1.0, phase=0.0):
    """The lionfish's slow, stately hover: fans breathing open and shut, the tail sculling, the crest swaying."""
    return [osc("fin_l", "y", 14 * amp, cycles, phase), osc("fin_r", "y", -14 * amp, cycles, phase),
            osc("fin_l", "z", -8 * amp, cycles, phase + 0.2), osc("fin_r", "z", 8 * amp, cycles, phase + 0.2),
            {"parts": SPINES, "axis": "x", "wave": {"amp": 4 * amp, "cycles": cycles, "lag": 0.08, "growth": 1.0,
                                                    "phase": phase + 0.1}},
            osc("fin_soft", "x", 6 * amp, cycles * 2, phase + 0.3), osc("fin_anal", "x", -6 * amp, cycles * 2, phase),
            osc("fin_pelvic_l", "x", 10 * amp, cycles * 2, phase), osc("fin_pelvic_r", "x", 10 * amp, cycles * 2,
                                                                        phase + 0.5)]


ANIM = {}
# swim: a slow glide: the tail sweeps, the body counter-sways, the fans ripple, the crest streams back a little
L = 2.0
ANIM["swim"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=hover(L, 1) + [
    wave(["tail", "tail_fin"], "y", 20, 2, lag=0.15, growth=1.3),
    osc("body", "y", -4, 2, 0.05), osc("body", "z", 2, 1, 0.3),
    osc("body", None, [0, 0.3, 0], 1, 0.0, ch="position"),
    osc("jaw", "x", 6, 1, 0.5, bias=3),
])

# hunt: fans swing forward to herd the prey, a quick crouch, then a lunge with the mouth gulping open and snapping shut
HERD = add(r("fin_l", 0, 40, -10), r("fin_r", 0, -40, 10), r("body", 6), pos("body", 0, 0, -0.8),
           r("tail", 0, 14))
STRIKE = add(pos("body", 0, -0.3, 3.0), r("body", 8), r("jaw", 40), sc("head", 0.08, 0.06, 0),
             r("fin_l", 0, -20, 20), r("fin_r", 0, 20, -20), r("tail", 0, -22), r("tail_fin", 0, -16),
             *[r(sp, 16) for sp in SPINES])
ANIM["hunt"] = timeline(0.5, [(0.0, REST, None), (0.16, HERD, "out"), (0.26, STRIKE, "in"),
                              (0.34, add(STRIKE, r("jaw", -40)), "out"), (0.5, REST, "ease")],
                        extra=[ring("tail_fin", 0.26, 18, freq=7, decay=7, axis=1, end=0.5)])

# flare: the spines rise and fan out, the pectorals spread wide, the head dips to point the spines at the threat,
# a warning shiver, then everything settles
SPREAD = add(*[r(sp, -14 - 7 * k, 0, (-1) ** k * 4) for k, sp in enumerate(SPINES)],
             sc("spines", 0, 0.12, 0), r("fin_l", -10, 34, -24), r("fin_r", -10, -34, 24), r("body", 16),
             r("tail", 0, 0, 0), r("fin_soft", -14), r("fin_anal", 14))
ANIM["flare"] = timeline(0.8, [(0.0, REST, None), (0.22, SPREAD, "out_back"), (0.55, SPREAD, "ease"),
                               (0.8, REST, "ease")],
                         extra=[shake("spines", 0.24, 0.56, 5, freq=14, axis=2),
                                shake("body", 0.24, 0.56, 2, freq=10, axis=1)])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Lionfish",
    "description": "The Winterworks lionfish in the vanilla mob style: a deep boxy orange-red body with clean cream "
                   "stripes, flat dot eyes under a fierce brow, a crest of striped spines, big striped pectoral fans "
                   "and a striped tail fan. Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 200, "colors": 40},
    "light": LIGHT,
    "minecraft": {"fps": 20},
    "render": {"background": "#1d4f5c", "hero": [38, 18], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "lionfish.json")
    rest_on_ground(spec["parts"], DENSITY)
    dump(spec, out)
