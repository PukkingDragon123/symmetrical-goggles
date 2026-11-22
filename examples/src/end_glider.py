"""Builds examples/end_glider.json: the End Glider (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/end_glider.py examples/end_glider.json

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/end_glider.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/end_glider

A glowing magic wing glider in vanilla style: a light moonsilver control bar with violet silk grips and gold collars,
two struts rising from it in an A to a slim keel with a pearl heart at its front, and from the keel a pair of simple
glowing violet wings: flat, translucent enderfly membranes (a broad forewing and a rounded hindwing swept back under
it, ending in a short tail), each with a glowing rim, a few clean glowing veins fanning from the root and a small
rose eye-spot. At each wing root a little rune sigil (a ring of violet light) turns in a window in the membrane; its
flare (a halo of light and a trail streaming back) breathes gently in flight and blazes out long when boosting.

The hands hold the bar at the root joint, which sits at lowpix (0, 24, 0) = Minecraft model (0, 0, 0), the grips at
x = +-4.5 on it; the glider rises above it (lowpix +Y, Minecraft -Y) and flies toward lowpix +Z (Minecraft -Z). Units
are Minecraft pixels, density 1 (one texel per pixel, like vanilla), every box whole pixels. The membranes, sigils
and flares are cards; the membranes are alpha parts (0.62 opacity: draw them translucent).

Contract (mods/winterworks/docs/END_UPDATE.md section 12). Bones: frame (root: the keel and its heart), handle (the
bar, grips and struts), wing_l, wing_r (hinged at the keel; each holds its forewing, the hind_* joint with the
hindwing, which lags a little behind each beat, and its sigil), jet_l, jet_r (the rune sigils at the wing roots,
which turn), jet_flame_l, jet_flame_r (their flares: halo and trail; scaled small and breathing in flap, big and long
in boost). Glow: the wing veins and rims, the eye-spots, the heart, the sigils and flares (ramps vein, spot, crying).
Clips: flap (0.8 s loop: one gentle, unhurried beat, the hindwings following through, the sigils turning, the flares
breathing), boost (0.4 s loop: quicker, shallower beats with the wings swept back, the sigils turning twice as fast,
the flares blazing long).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import (LIGHT, ROOT, Rig, card_style, dump, keys, mirror_art, osc, ramps, skin,  # noqa: E402
                             spin)

D = 1                         # density: one texel per pixel
R = Rig(density=D, bone_style="silver")
part, bone, card = R.part, R.bone, R.card

G = 24.0                      # the grip line (Minecraft y = 0)
HY = G + 10.0                 # the keel
bone("frame", None, at=(0, G, 0))

# ======================================================================= the control bar and its struts
bone("handle", "frame", at=(0, G, 0))
part("bar", "handle", [12, 1, 1], "silver", centre=(0, G, 0))
STRUT_X = 3.0
for s, n in ((1, "l"), (-1, "r")):
    part(f"grip_{n}", "handle", [3, 2, 2], "grip", centre=(s * 4.5, G, 0))
    part(f"cuff_{n}", "bar", [1, 2, 2], "gold", centre=(s * 6.5, G, 0))
    # the struts: an A-frame from the bar up to the keel
    dx, dy = STRUT_X - 0.5, HY - 0.5 - (G + 0.5)
    L = round(math.hypot(dx, dy))
    part(f"strut_{n}", "handle", [1, L, 1], "silver", at=(s * STRUT_X, G + 0.5, 0), offset=(0, L / 2, 0),
         rot=(0, 0, s * math.degrees(math.atan2(dx, dy))))

# ======================================================================= the keel and its heart
part("keel", "frame", [1, 1, 8], "keel", centre=(0, HY, -0.5))
part("hub", "keel", [2, 1, 2], "gold", centre=(0, HY - 0.5, 0.5))
part("heart", "keel", [2, 2, 2], "heart", centre=(0, HY + 0.5, 4.0))

# ======================================================================= the wings (cards, plane xz)
# Left wings lying flat: column 0 at the root, row 0 the back edge (-Z), the last row the leading edge (+Z).
# 'm' membrane (painted: deep violet at the root, paling outward), 'r' the glowing rim, 'v' glowing veins, 'V' the
# bright vein roots, 'k' the eye-spot's dark ring, 'S' the rose eye-spot, 'o' the sigil window's glowing ring, '.'
# clear (the window itself is clear: the sigil turns in it).
FORE = [".........rrrrr....",
        ".....rrrrmmmmmrr..",
        "...rrmmmmmmmmmmmr.",
        "..rmmmmvmmmmmmmmmr",
        ".rooommmvmmmvvmkkr",
        "ro...ommmvvvmmkSSr",
        "o.....oVvmmmmmkSSr",
        "o.....oVVvvvvvmkkr",
        "ro...ommmmmmmmvvrr",
        ".rooorrrrrrrrrrr.."]
HIND = ["...........rr.",
        "..........rmr.",
        ".........rmmr.",
        "....rrrrrmmr..",
        "..rrmmmmmmmmr.",
        ".rmmmmvmmmmmmr",
        "rmmmmvmmkkmmmr",
        "mmmmvmmkSSkmmr",
        "VVvvmvvkSSkmr.",
        "mmVvmmmmkkmmr.",
        "mmmmvvvvmmrr..",
        "rrrrrrrrrr...."]
FORE_V, HIND_V = 0.65, 0.75      # the root row (0 back .. 1 front) that sits on the wing joint
WIN = (3.5, 6.5)                 # the sigil window's centre in the forewing art (texel corners: x, y)
WY = HY + 0.5
for s, n in ((1, "l"), (-1, "r")):
    w = bone(f"wing_{n}", "keel", at=(s * 0.5, WY, 1.5), rot=(0, 0, s * 12))
    for art, v, cid, par in ((FORE, FORE_V, f"fore_{n}", w["id"]), (HIND, HIND_V, f"hind_{n}_m", None)):
        if par is None:          # the hindwing hangs from its own joint, swept back and a little lower
            par = bone(f"hind_{n}", w["id"], rel=(0, -0.3, -3.0), rot=(0, s * 10, s * -5))["id"]
        # the root texel (column 0, row v) sits on the joint; plane xz: image-top = -Z, so row v is H (0.5 - v) back
        Wp, Hp = len(art[0]), len(art)
        card(cid, par, art if s > 0 else mirror_art(art), f"membrane_{n}", plane="xz",
             offset=(s * Wp / 2, 0, Hp * (0.5 - v)))

# ======================================================================= the sigils and their flares
SIGIL = ["..aa..",          # a ring of light with a white-hot heart; four-fold symmetric, so a quarter turn loops
         ".abba.",
         "abddba",
         "abddba",
         ".abba.",
         "..aa.."]
HALO = ["...b...",          # the flare's halo: a broken ring of light and four short rays
        ".a...a.",
        ".......",
        "b.....b",
        ".......",
        ".a...a.",
        "...b..."]
TRAIL = [".a.",             # a comet trail, row 0 the far (back) end, the last row next to the sigil
         ".a.",
         "aba",
         "bcb",
         "cdc"]
TRAIL_V = ["".join(TRAIL[len(TRAIL) - 1 - j][x] for j in range(len(TRAIL))) for x in range(len(TRAIL[0]))]
TRAIL_LEN = len(TRAIL)
# each sigil turns in its window, in the membrane's plane, so it shows from above and below; its flare (a halo and a
# trail streaming back from behind the ring) lies just above and just below the membrane, with a third trail on edge
WIN_X = WIN[0]                                     # px out from the wing joint
WIN_Z = (WIN[1] / len(FORE) - FORE_V) * len(FORE)  # px forward of the joint (row v is at the joint)
for s, n in ((1, "l"), (-1, "r")):
    rel = (s * WIN_X, 0, WIN_Z)
    bone(f"jet_{n}", f"wing_{n}", rel=rel)
    card(f"sigil_{n}", f"jet_{n}", SIGIL, "sigil", plane="xz")
    f = bone(f"jet_flame_{n}", f"wing_{n}", rel=rel)
    for side, dy in (("", 0.15), ("_under", -0.15)):
        card(f"flare_{n}{side}", f["id"], HALO, "flare", plane="xz", rel=(0, dy, 0))
        card(f"flare_{n}_trail{side}", f["id"], TRAIL, "flare", plane="xz", rel=(0, dy * 1.3, 0),
             offset=(0, 0, -2.0 - TRAIL_LEN / 2))
    card(f"flare_{n}_trail_v", f["id"], TRAIL_V, "flare", plane="yz", offset=(0, 0, -2.0 - TRAIL_LEN / 2))

# ======================================================================= palette and paint
RAMPS = ramps("crying", "gold")
# translucent violet membrane, deep at the root, lilac at the edges (not a glow)
RAMPS["membrane"] = ["#1c0f33", "#28154a", "#371d62", "#46277a", "#583291", "#6b40a6", "#8156ba", "#9a71cc",
                     "#b590dc", "#d2b5ec"]
# the glows: veins and rims (violet-white light) and eye-spots (rose)
RAMPS["vein"] = ["#5d2bbf", "#7d45e0", "#a06df5", "#c39bff", "#e3cdff", "#faf3ff"]
RAMPS["spot"] = ["#640f52", "#9c1f7c", "#d33da0", "#f26bc0", "#ff9fd8", "#ffd2ee"]
RAMPS["silver"] = ["#25202e", "#3a3346", "#534a62", "#6f667f", "#8e859e", "#aea6bd", "#cfc9da", "#ece9f2"]
RAMPS["silk"] = ["#1b0f2a", "#2b1840", "#3e2458", "#533271", "#6a428b", "#8558a6", "#a173c0"]


def membrane_style(s):
    g = 1.0 if s > 0 else -1.0            # card x runs root -> tip on the left wing, tip -> root on the right
    return card_style("membrane", 5.0, {"r": "vein:1", "v": "vein:3", "V": "vein:5", "o": "vein:2",
                                        "k": "membrane:1", "S": "spot:4"}, light=0.3, grain=0.3, dither=0.2,
                      layers=[{"id": "root_deep", "op": "gradient", "axis": "x", "amount": 1.6 * g}])


styles = {
    "silver": skin("silver", 4.6, grain=0.4, lip=1.6, shade=-1.4, clusters=False, dark_low=0),
    "keel": skin("silver", 3.6, grain=0.4, lip=1.4, shade=-1.2, clusters=False, dark_low=0, layers=[
        {"id": "joints", "op": "stripes", "axis": "z", "period": 2.0, "width": 0.5, "shift": -1.0}]),
    "gold": skin("gold", 4.6, grain=0.4, lip=1.6, shade=-1.4, clusters=False, dark_low=0),
    "heart": skin("vein", 3.0, grain=0.4, light=0.3, lip=1.6, shade=-1.0, clusters=False, dark_low=0),
    # violet silk ribbon wound round the grips
    "grip": skin("silk", 3.8, grain=0.4, lip=1.2, shade=-1.0, clusters=False, dark_low=0, layers=[
        {"id": "wrap", "op": "stripes", "axis": [1, 0.5, 0], "period": 1.5, "width": 0.5, "shift": -1.2}]),
    "membrane_l": membrane_style(1),
    "membrane_r": membrane_style(-1),
    "sigil": card_style("crying", 4, {"a": "crying:4", "b": "crying:5", "d": "crying:7"}, light=0, grain=0),
    "flare": card_style("crying", 4, {"a": "crying:2", "b": "crying:3", "c": "crying:5", "d": "crying:7"},
                        light=0, grain=0),
}

# ======================================================================= clips
L_FLAP, L_BOOST = 0.8, 0.4


def beat(length, amp, sweep, bias, hind_amp, feather):
    """One wing beat per loop: a quicker down-stroke, a slower recovery; the hindwing follows through a beat-
    fraction late; the wings feather (twist) through the stroke and shimmer (a fine twist twice per beat)."""
    tr = []
    for s, n in ((1, "l"), (-1, "r")):
        tr += [{"part": f"wing_{n}", "channel": "rotation", "ease": "smooth", "keys": [
                   [0, [0, s * sweep, s * (bias + amp)]], [round(length * 0.4, 4), [0, s * sweep, s * (bias - amp)]],
                   [length, [0, s * sweep, s * (bias + amp)]]]},
               osc(f"wing_{n}", "x", feather, 1, 0.1),
               osc(f"hind_{n}", "z", s * hind_amp, 1, 0.12),
               osc(f"hind_{n}", "x", feather * 0.6, 2, 0.3)]
    return tr


def flare(length, size, stretch, pulse, cycles, sweep=0.0):
    """The sigils' flares: scaled (`size` across, `size + stretch` along the trail), breathing by `pulse`, and turned
    against the wings' sweep so the trails always stream straight back."""
    tr = []
    for k, (s, n) in enumerate(((1, "l"), (-1, "r"))):
        tr += [{"part": f"jet_flame_{n}", "channel": "scale", "ease": "linear",
                "keys": [[0, [size, 0, size + stretch]], [length, [size, 0, size + stretch]]]},
               osc(f"jet_flame_{n}", None, [pulse, 0, pulse * 2.0], cycles, 0.25 * k, ch="scale")]
        if sweep:
            tr.append(keys(f"jet_flame_{n}", "y", [[0, -s * sweep], [length, -s * sweep]], ease="linear"))
        # the halos stay round: undo the stretch along the trail
        round_ = round((1.0 + size) / (1.0 + size + stretch) - 1.0, 4)
        for side in ("", "_under"):
            tr.append(keys(f"flare_{n}{side}", None, [[0, [0, 0, round_]], [length, [0, 0, round_]]], ease="linear",
                           ch="scale"))
    return tr


ANIM = {
    "flap": {"length": L_FLAP, "loop": True, "tracks":
             beat(L_FLAP, amp=13, sweep=0, bias=1, hind_amp=5, feather=4)
             + flare(L_FLAP, 0.0, 0.1, 0.1, 2)
             + [spin("jet_l", L_FLAP, 0.25), spin("jet_r", L_FLAP, -0.25),
                osc("frame", None, [0, 0.3, 0], 1, 0.55, ch="position"),
                osc("heart", None, [0.06, 0.06, 0.06], 2, 0.0, ch="scale")]},
    "boost": {"length": L_BOOST, "loop": True, "tracks":
              beat(L_BOOST, amp=8, sweep=22, bias=4, hind_amp=4, feather=3)
              + flare(L_BOOST, 0.7, 2.6, 0.18, 2, sweep=22)
              + [spin("jet_l", L_BOOST, 0.25), spin("jet_r", L_BOOST, -0.25),
                 osc("frame", None, [0, 0.15, 0], 1, 0.55, ch="position")]},
}

MEMBRANES = [f"fore_{n}" for n in "lr"] + [f"hind_{n}_m" for n in "lr"]
spec = {
    "name": "End Glider",
    "description": "The Winterworks End Glider in vanilla style: a glowing magic wing glider: a light moonsilver "
                   "control bar with silk grips and an A-frame of struts under a pair of simple glowing violet wings "
                   "(flat translucent enderfly membranes with glowing rims, a few clean glowing veins and small rose "
                   "eye-spots), a turning rune sigil at each wing root whose flare blazes when boosting. Minecraft "
                   "pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": D,
    "grounded": False,
    "budget": {"tris": 300, "colors": 64},
    "light": dict(LIGHT, gradient=0.3, ao=0.0),
    "minecraft": {"fps": 24, "glow_ramps": ["vein", "spot", "crying"], "alpha_parts": {m: 0.62 for m in MEMBRANES}},
    "render": {"background": "#2a2735", "hero": [-30, 26], "shadow": 0.3},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "end_glider.json")
    dump(spec, out)
