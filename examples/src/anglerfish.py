"""Builds examples/anglerfish.json: the Anglerfish (Winterworks, Tides & Treasures).

    python examples/src/anglerfish.py examples/anglerfish.json

A deep-sea anglerfish in the vanilla mob style: a big, boxy, dusky plum-brown head with a stepped crown, a shorter
trunk and a stubby tail; a huge underbite (the lower jaw is wider than the head and its chin rises in front of the
upper lip) lined with simple white fang cards; small flat dot eyes high on the head; and a chunky stalk arching from
the crown over the face to the `lure`, a simple glowing bulb. Darker blotches on the back, a lighter belly, a wine-red
mouth inside. Flat cards only for the fins and the teeth.

One model for both sexes. It is drawn at the **female's** size (about 26 x 39 x 52 px with the stalk: about 3.2 blocks
long); the renderer draws a male at 1/7 of that (MALE_SCALE = 1/7), so the female is the male at 7x.

Units are Minecraft pixels (16 per block) at **density 1** (vanilla texel size): every box is whole pixels, so the
model exports 1:1 to a vanilla entity model:

    PYTHONHASHSEED=0 python -m lowpix mc export examples/anglerfish.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/anglerfish

Faces +Z, the lowest point (the jaw's keel) at y = 0, "left" is +X; the root (body) pivots in the middle of the trunk.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 3): bones body, head, jaw, teeth, stalk, stalk_tip, lure
(glow), fin_l, fin_r, fin_top, tail. Extra joints: stalk_1, stalk_2 (the arch's middle), stalk_tip_1 (its end),
tail_fin, eye_l, eye_r (the painted eyes' spots), and the locators `mouth` (a bone in the jaw, where a grabbed player is
held: (0, 10, 12)) and `lure` (the bulb's top, where the moving light goes: (0, 32.8, 19.5)). Clips: swim 1.6, idle 4.0,
hold 1.0 (loops), lunge 0.6, bite 0.5, lure_flash 0.8. Glow: every texel of ramp `lureglow` (the bulb and the halo).
The halo cards (`lure_halo_*`) are exported at 5% alpha: the cutout base pass discards them and the additive eyes pass
(RenderType.eyes ignores alpha) draws them as a soft bloom. Part names from the earlier design that are no longer
drawn stay as empty bones (name compatibility).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (ALL_FACES, LIGHT, LR, M, ROOT, Rig, add, card_style, combine, disc_halo, dump,  # noqa
                       fangs_row, flat, keep_names, keys, limb1, marks, mottle, osc, pos, r, ramps, rest_on_ground,
                       ring, sc, shake, side_eye, timeline, wave)

DENSITY = 1
R = Rig(density=DENSITY, bone_style="skin")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= trunk and tail
part("body", None, [18, 16, 12], "skin", at=(0, 16, -2), centre=(0, 16, -6))
part("belly", "body", [14, 2, 10], "skin_low", centre=(0, 7, -6))
part("rump", "body", [12, 12, 4], "skin", centre=(0, 16, -14))
part("tail", "body", [8, 8, 4], "skin", at=(0, 16, -15), centre=(0, 16, -18))
TAIL_FIN = ["....eee.", "...emmme", "..emrmme", ".emrmmme", "emrmmrme", "mrmmrmme", "mrmmrmme", "emrmmrme",
            ".emrmmme", "..emrmme", "...emmme", "....eee."]
card("tail_fin", "tail", TAIL_FIN, "fin", at=(0, 16, -20), offset=(0, 0, -4), plane="yz")

# ======================================================================= the head: a big block with a stepped crown
part("head", "body", [24, 20, 18], "skin", at=(0, 16, 0), centre=(0, 18, 9))
part("crown", "head", [18, 2, 12], "skin", centre=(0, 29, 8))
for s in (1, -1):
    bone(f"eye_{LR(s)}", "head", at=M((12, 23, 14), s))

# ======================================================================= the jaw: a wide underbite with a rising chin
part("jaw", "head", [26, 6, 22], "jaw", at=(0, 8, 1), centre=(0, 5, 11))
part("jaw_keel", "jaw", [20, 2, 18], "skin_low", centre=(0, 1, 11))
part("chin", "jaw", [26, 6, 3], "chin", centre=(0, 11, 20.5))
part("jaw_floor", "jaw", [14, 1, 12], "tongue", centre=(0, 8.5, 9))
bone("mouth", "jaw", at=(0, 10, 12))
bone("teeth", "jaw", at=(0, 14, 20.5))
card("teeth_front", "teeth", fangs_row(24, 4, every=2, seed=3, minh=2), "teeth", at=(0, 14, 20.6), offset=(0, 2, 0),
     plane="xy")
for s in (1, -1):
    card(f"teeth_{LR(s)}", "teeth", fangs_row(16, 3, every=3, seed=5 + s, minh=2), "teeth", at=M((12.6, 8, 10), s),
         offset=(0, 1.5, 0), plane="yz")
# the upper fangs hang from the lip behind the chin: hidden in the closed jaw, bared when it opens
card("teeth_up", "head", fangs_row(20, 3, every=3, seed=8, up=False, minh=2), "teeth", at=(0, 8, 17.4),
     offset=(0, -1.5, 0), plane="xy")

# ======================================================================= the stalk and the lure
BASE = np.array((0, 30, 13))
part("stalk_base", "head", [4, 1, 4], "skin_dark", centre=BASE + (0, 0.5, 0))
p = limb1(R, "stalk", "head", BASE + (0, 1, 0), BASE + (0, 8, 0), 2, "stalk")
p = limb1(R, "stalk_1", "stalk", p, p + (0, 3, 3), 2, "stalk")
p = limb1(R, "stalk_2", "stalk_1", p, p + (0, 0, 5), 2, "stalk")
p = limb1(R, "stalk_tip", "stalk_2", p, p + (0, -3, 3), 1, "stalk")
p = limb1(R, "stalk_tip_1", "stalk_tip", p, p + (0, -3, 0), 1, "stalk")
LURE = np.round(p + np.array((0, -0.5, 0)), 1)
bone("lure", "stalk_tip_1", at=LURE)
part("lure_cap", "lure", [2, 1, 2], "skin_dark", centre=LURE + (0, -0.5, 0))
part("lure_bulb", "lure", [4, 4, 4], "bulb", centre=LURE + (0, -3, 0))
HALO = disc_halo(8, "1234")
HALOS = [f"lure_halo_{pl}" for pl in ("xy", "yz", "xz")]
for pl in ("xy", "yz", "xz"):
    card(f"lure_halo_{pl}", "lure_bulb", HALO, "halo", at=LURE + (0, -3, 0), plane=pl)

# ======================================================================= fins
PEC = ["mme...", "mmrme.", "mmmrre", "rrrrre", "mmmrre", "mmrme.", "mme..."]
for s in (1, -1):
    n = LR(s)
    card(f"fin_{n}", "body", PEC, "fin", at=M((9, 12, -2), s), offset=(0, 0, -3), plane="yz",
         rot=(0, s * -35, s * -10))
card("fin_top", "body", [".e........", ".mme......", "emrmme....", "mrmmrmme..", "rmmrmmrmee", "mmmmmmmmmm"],
     "fin", at=(0, 24, -4), offset=(0, 3, -5), plane="yz")
card("fin_anal", "tail", ["mmmmmm", ".mrmme", "..eee."], "fin", at=(0, 10, -12), offset=(0, -1.5, -3), plane="yz")

# names of the earlier design that are not drawn any more (kept as empty bones for the mod's code)
keep_names(R, {"body_y": "body", "body_z": "body", "body_m": "body", "rump_z": "rump", "wart_l0": "body",
               "wart_l1": "body", "wart_l2": "body", "wart_l3": "body", "wart_r0": "body", "wart_r1": "body",
               "wart_r2": "body", "wart_r3": "body", "wart_top0": "body", "wart_top1": "body", "wart_top2": "body",
               "head_y": "head", "head_z": "head", "head_m": "head", "crown_z": "crown",
               "face": "head", "face_y": "face", "face_z": "face", "snout": "head", "snout_z": "snout",
               "lip_up": "head", "brow_l": "head", "brow_r": "head", "tassel_l": "head", "tassel_b_l": "head",
               "tassel_r": "head", "tassel_b_r": "head", "chin_z": "chin", "chin_tip": "jaw", "chin_tip_z": "chin_tip",
               "jaw_side_l": "jaw", "tassel_jaw_l": "jaw", "jaw_side_r": "jaw", "tassel_jaw_r": "jaw",
               "tassel_chin": "jaw", "lure_bulb_y": "lure_bulb", "lure_bulb_z": "lure_bulb", "lure_core": "lure_bulb",
               "lure_strand_0": "lure_bulb", "lure_strand_1": "lure_bulb", "tail_y": "tail", "tail_z": "tail",
               "tail_stalk": "tail"})

# ======================================================================= palette and paint
RAMPS = ramps("abyss", "maw", "tooth", "ink", "glint", "lureglow")
BELLY = {"id": "belly", "op": "band", "axis": "y", "from": -1.01, "to": -0.45, "shift": 1.3,
         "faces": ["sides", "bottom"]}
styles = {
    "skin": flat("abyss", 4.4, BELLY),
    "skin_low": flat("abyss", 5.6),
    "skin_dark": flat("abyss", 3.0, grain=0.6),
    # the jaw: dark skin outside, the wine-red mouth on top
    "jaw": flat("abyss", 4.6, {"id": "inner", "op": "fill", "ramp": "maw", "tone": 2.2, "faces": ["top"]}),
    "chin": flat("abyss", 4.6, {"id": "inner", "op": "fill", "ramp": "maw", "tone": 1.6, "faces": ["back"]}),
    "tongue": flat("maw", 3.4, grain=0.8),
    "stalk": flat("abyss", 5.0, grain=0.8),
    # the bulb: a simple glow, brightest in the middle of each face
    "bulb": {"ramp": "lureglow", "tone": 3.0, "light": 0.2, "brush": {"off": True}, "dither": 0,
             "rim": {"light": 0, "dark": 0},
             "stamps": [{"faces": ["all"], "at": "top-left", "art": ["2112", "1001", "1001", "2112"],
                         "key": {"0": "lureglow:5", "1": "lureglow:4", "2": "lureglow:2"}}]},
    "halo": card_style("lureglow", 1, {"1": "lureglow:0", "2": "lureglow:1", "3": "lureglow:2", "4": "lureglow:3"},
                       light=0),
    "teeth": card_style("tooth", 2, {"y": "tooth:3", "Y": "tooth:2"}, light=0.1),
    "fin": card_style("abyss", 6, {"m": "abyss:6", "r": "abyss:4", "e": "abyss:8"}),
}
# markings: soft darker blotches over the back, a row of pale lateral-line pores down each flank, a dark lip line
# and nostrils on the face, and small flat eyes under a heavy angry brow
KEY = {"k": "ink:0", "h": "glint:1", "r": "abyss:7", "l": "abyss:2", "b": "abyss:0", "d": "abyss:3", "p": "abyss:8",
       "q": "abyss:1", "n": "abyss:1"}
_blotch = mottle(4, 12, 0.75, "d")


def blotch(x, y, z, f):
    return _blotch(x, y, z, f) if f != "bottom" and y > 15 else "."


def pores(x, y, z, f):
    """Lateral-line pores: a pale texel over a dark one, every third texel along the flank."""
    if f not in ("left", "right") or int(round(z - 0.5)) % 3:
        return "."
    return "p" if 16 < y < 17 else ("q" if 15 < y < 16 else ".")


def face(x, y, z, f):
    """The face: a dark lip line along the bottom of the head, two nostrils above the fangs."""
    if f in ("front", "left", "right") and y < 9:
        return "n"
    if f == "front" and 3 < abs(x) < 4 and 19 < y < 20:
        return "n"
    return "."


for pid in ("body", "rump", "crown"):
    marks(R, pid, combine(pores, blotch), KEY)
def socket(x, y, z, f):
    """A pale, milky ring of skin round the small eye, so the glare reads on the dark head."""
    return "r" if f in ("left", "right") and 13 < z < 17 and 20 < y < 24 else "."


marks(R, "head", combine(side_eye(23, 16, w=2, h=2, brow="angry", gap=1), socket, face, pores, blotch), KEY)

# ======================================================================= animation
REST = {}
STALK = ["stalk", "stalk_1", "stalk_2", "stalk_tip", "stalk_tip_1"]
TAIL = ["tail", "tail_fin"]


def fins(L, amp=1.0, cycles=2, phase=0.0):
    """Pectoral fins sculling (alternating), the dorsal and anal fins rippling."""
    return [osc("fin_l", "y", 16 * amp, cycles, phase), osc("fin_r", "y", -16 * amp, cycles, phase + 0.5),
            osc("fin_l", "x", 8 * amp, cycles, phase + 0.25), osc("fin_r", "x", 8 * amp, cycles, phase + 0.75),
            osc("fin_top", "z", 6 * amp, cycles, phase + 0.1), osc("fin_anal", "z", -6 * amp, cycles, phase + 0.3)]


def dangle(L, cycles=1, amp=1.0, phase=0.0):
    """The stalk sways with follow-through; the lure swings below it."""
    return [wave(STALK, "x", -2.5 * amp, cycles, lag=0.1, growth=1.2, phase=phase),
            wave(STALK, "z", 3 * amp, cycles, lag=0.12, growth=1.25, phase=phase + 0.25),
            osc("lure", "x", 10 * amp, cycles, phase + 0.45), osc("lure", "z", -8 * amp, cycles, phase + 0.7)]


def pulse(L, cycles=2, amp=1.0, phase=0.0):
    """The bulb breathes light: it swells a little, the halo swells more."""
    tr = [osc("lure_bulb", None, [0.08 * amp] * 3, cycles, phase, ch="scale")]
    for h in HALOS:
        tr.append(osc(h, None, [0.14 * amp] * 3, cycles, phase + 0.1, ch="scale"))
    return tr


ANIM = {}
# swim: a slow, heavy beat of the tail; the body counter-yaws, the head bobs, the jaw hangs a little open
L = 1.6
ANIM["swim"] = timeline(L, [(0.0, r("jaw", 6), None), (L, r("jaw", 6), None)], loop=True,
                        extra=fins(L, 1.0, 2) + dangle(L, 1, 1.4, 0.1) + pulse(L, 2) + [
    wave(TAIL, "y", 22, 1, lag=0.15, growth=1.3),
    osc("body", "y", -5, 1, 0.05), osc("body", "z", 2, 1, 0.3), osc("body", "x", 1.5, 2, 0.0),
    osc("head", "y", -2, 1, 0.1),
    osc("jaw", "x", 3, 2, 0.4),
    osc("body", None, [0, 0.4, 0], 2, 0.2, ch="position"),
])

# idle: hanging still in the dark: slow fin sculling, the jaw breathing open and shut, the lure dangling and breathing
L = 4.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True,
                        extra=fins(L, 0.6, 3) + dangle(L, 1, 1.0) + pulse(L, 2, 1.0, 0.1) + [
    keys("jaw", "x", [[0, 2], [1.4, 2], [2.1, 13], [2.6, 13], [3.3, 2], [4.0, 2]]),
    wave(TAIL, "y", 8, 1, lag=0.18, growth=1.3, phase=0.2),
    osc("body", "x", 2, 1, 0.1), osc("body", "z", -1.5, 1, 0.35),
    osc("body", None, [0, 0.6, 0], 1, 0.0, ch="position"),
])

# lunge: a quick draw back with the jaw yawning wide, then a surge forward with the tail lashing, jaws gaping
WIND = add(pos("body", 0, 0.5, -3.0), r("body", -8), r("jaw", 30), r("head", -6), r("tail", 0, 18),
           r("stalk", -14), r("stalk_1", -8), r("fin_l", 0, 20), r("fin_r", 0, -20))
SURGE = add(pos("body", 0, -0.5, 9.0), r("body", 6), r("jaw", 56), r("head", -10), r("tail", 0, -24),
            r("tail_fin", 0, -20), r("stalk", 18), r("stalk_1", 14), r("stalk_tip", 10), r("teeth", -10),
            r("fin_l", 0, -40, -10), r("fin_r", 0, 40, 10), sc("body", -0.05, -0.05, 0.08))
ANIM["lunge"] = timeline(0.6, [(0.0, REST, None), (0.16, WIND, "out"), (0.32, SURGE, "in"),
                               (0.44, add(SURGE, r("jaw", -6)), "ease"), (0.6, REST, "ease")],
                         extra=pulse(0.6, 1, 1.6, 0.2) + [ring("lure", 0.32, 30, freq=5, decay=6, axis=0, end=0.6)])

# bite: the jaw snaps shut from a gape with a vicious head shake
OPEN = add(r("jaw", 48), r("head", -8), r("teeth", -8), pos("body", 0, 0, -1.0))
SNAP = add(r("jaw", -2), r("head", 4), pos("body", 0, 0, 2.0), sc("jaw", 0.04, 0, 0))
ANIM["bite"] = timeline(0.5, [(0.0, REST, None), (0.12, OPEN, "out"), (0.2, SNAP, "in"), (0.36, SNAP, "ease"),
                              (0.5, REST, "ease")],
                        extra=[shake("head", 0.2, 0.42, 8, freq=12, axis=1),
                               shake("body", 0.2, 0.42, 4, freq=12, axis=2),
                               ring("stalk", 0.2, 12, freq=6, decay=6, axis=0, end=0.5)])

# hold: jaws clamped half open round its prey (held at the `mouth` locator), shaking it, tail sweeping hard
GRIP = add(r("jaw", 24), r("head", -4), r("teeth", -6), r("body", -4))
L = 1.0
ANIM["hold"] = timeline(L, [(0.0, GRIP, None), (L, GRIP, None)], loop=True, extra=fins(L, 1.2, 2) + [
    osc("head", "y", 7, 2, 0.0), osc("body", "z", 4, 2, 0.25), osc("jaw", "x", 3, 4, 0.1),
    wave(TAIL, "y", 26, 1, lag=0.12, growth=1.3),
    wave(STALK, "x", -5, 2, lag=0.1, growth=1.2), osc("lure", "x", 18, 2, 0.3),
    osc("body", None, [0.5, 0, 0.6], 2, 0.0, ch="position"),
])

# lure_flash: the stalk lifts and trembles, the bulb flares (swells, the halo blooms wide) and dims again
FLARE = add(r("stalk", -8), r("stalk_1", -6), r("stalk_2", -4), r("stalk_tip", -4), sc("lure_bulb", 0.3, 0.3, 0.3),
            *[sc(h, 0.8, 0.8, 0.8) for h in HALOS], r("jaw", 10))
ANIM["lure_flash"] = timeline(0.8, [(0.0, REST, None),
                                    (0.12, add(sc("lure_bulb", -0.2, -0.2, -0.2), *[sc(h, -0.3, -0.3, -0.3)
                                                                                    for h in HALOS]), "in"),
                                    (0.28, FLARE, "out_back"), (0.5, add(FLARE, r("stalk", 3)), "ease"),
                                    (0.8, REST, "ease")],
                              extra=[shake("stalk_tip", 0.12, 0.56, 6, freq=14, axis=0),
                                     shake("lure", 0.12, 0.56, 10, freq=11, axis=2)])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Anglerfish",
    "description": "The Winterworks anglerfish in the vanilla mob style: a big boxy dusky head, a wide underbite of "
                   "simple white fangs, small flat dot eyes and a chunky stalk arching over the face to a glowing "
                   "bulb. Drawn at the female's size (males at 1/7). Minecraft pixel units, density 1: exports 1:1 "
                   "to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 500, "colors": 40},
    "light": LIGHT,
    "minecraft": {"fps": 20, "glow_ramps": ["lureglow"], "alpha_parts": {h: 0.05 for h in HALOS}},
    "render": {"background": "#16283a", "hero": [38, 18], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "anglerfish.json")
    rest_on_ground(spec["parts"], DENSITY)
    dump(spec, out)
