"""Builds examples/enderfly.json: the Enderfly (Winterworks, The Living End).

    python examples/src/enderfly.py examples/enderfly.json

A moth-like evolution of the Endermite, in vanilla style: a chunky fuzzy thorax in dusky violet with a pale lilac
shawl, a three-segment Endermite abdomen ringed in lilac, a small square head with two flat glowing violet eyes under
slanted lids (a mischievous look), two feathery antennae, four flat moth wings (pale lilac, a dark leading edge, a few
clean violet veins and a glowing magenta eye-spot on each) and six jointed legs dangling under it.

Units are Minecraft pixels (16 per block), density 1 (one texel per pixel, like vanilla): every box is whole pixels,
so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). Wings and antennae are alpha-cut
cards. Faces +Z, ground at y = 0, "left" is +X. About 26 px across the wings, 17 px long; the rest pose is the
hover, the dangling feet touching y = 0 (it always flies).

Contract (mods/winterworks/docs/END_UPDATE.md section 4): bones body (root), thorax, abdomen, head, antenna_l,
antenna_r, wing_fl, wing_fr, wing_bl, wing_br, legs. Extra joints: abdomen_1, abdomen_2 (the abdomen curls),
leg_l1..3 / leg_r1..3 (femurs under `legs`) and shin_* (the lower legs). Clips: fly (loop), hover (loop), dive
(0.6 s), teleport (0.3 s). Glow: the eyes and the wing eye-spots (ramps eyeglow and magglow).

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/enderfly.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/enderfly
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import (DENSITY, LIGHT, LR, M, MR, ROOT, Rig, add, card_style, chain_pose, finish,  # noqa: E402
                             jitter, limb, mirror_art, osc, pos, r, ramps, sc, skin, timeline, wave)

R = Rig(density=DENSITY, bone_style="dusk")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= thorax (the root), head, abdomen
bone("body", None, at=(0, 6.5, 0))
part("thorax", "body", [5, 5, 5], "thorax", centre=(0, 6.5, 0))
# the head: small and square, the eyes painted on its face
part("head", "thorax", [5, 4, 3], "head", at=(0, 6.5, 2.5), centre=(0, 6.0, 4.0), wrot=(8, 0, 0))
# feathery antennae rising from the head's top corners
ANTENNA = [".t.", "btb", "bsb", "bsb", ".s.", ".s."]
for s in (1, -1):
    n = LR(s)
    bone(f"antenna_{n}", "head", rel=(s * 1.5, 2.0, 1.0), rot=MR((24, 0, -22), s))
    card(f"antenna_{n}_plume", f"antenna_{n}", ANTENNA, "antenna", offset=(0, 3.0, 0), plane="xy")
# the abdomen: three Endermite segments, each smaller, curling gently down
part("abdomen", "thorax", [4, 4, 4], "abd", at=(0, 6.5, -2.5), offset=(0, -0.5, -2), wrot=(-8, 0, 0))
part("abdomen_1", "abdomen", [3, 3, 3], "abd", rel=(0, -0.5, -4), offset=(0, 0, -1.5), rot=(-6, 0, 0))
part("abdomen_2", "abdomen_1", [2, 2, 2], "abd_tip", rel=(0, 0, -3), offset=(0, 0, -1), rot=(-8, 0, 0))

# ======================================================================= wings: four flat moth wings (cards, plane xz)
# left wings lying flat: column 0 at the root, row 0 the trailing edge (-Z), the last row the leading edge (+Z).
# 'm' membrane (painted), 'r' its pale rim, 'v' veins, 'C' the dark leading-edge vein, 'S' the glowing eye-spot, 's'
# its dark ring
FOREWING = [".......rrr.",
            ".....rrmmrr",
            "...rrmmmmmr",
            ".rrmvmmmssr",
            "rmmvmmmsSSs",
            "rmvmmvmsSSs",
            "vvmmvmmmssr",
            "CCCCCCCCCCr"]
HINDWING = ["..rrrr...",
            ".rmmmmrr.",
            "rmmvmmssr",
            "rmvmmsSSs",
            "vvmmmsSSs",
            "rmmvmmssr",
            "CCCCCCrr."]
WINGS = {  # name: (root (left), art, yaw back, dihedral, root row (0 trailing .. 1 leading))
    "f": ((2.5, 8.5, 1.0), FOREWING, 6, 10, 0.69),
    "b": ((2.5, 8.0, -1.0), HINDWING, 34, 4, 0.64),
}
for k, (root, art, yaw, dih, v_root) in WINGS.items():
    w, h = len(art[0]), len(art)
    for s in (1, -1):
        n = LR(s)
        bone(f"wing_{k}{n}", "thorax", at=M(root, s), rot=MR((0, yaw, dih), s))
        # the root texel (column 0, row v_root) sits on the joint
        card(f"wing_{k}{n}_m", f"wing_{k}{n}", art if s > 0 else mirror_art(art), "wing", plane="xz",
             offset=(s * w / 2, 0, h / 2 - v_root * h))

# ======================================================================= legs: six jointed legs under one bone
bone("legs", "thorax", at=(0, 4.0, 0.3))
LEGS = {  # name: hip (left), (femur, shin) lengths, directions (left side, rest/hover)
    "1": ((1.5, 4.0, 1.5), (2, 3), ((0.6, -0.3, 0.6), (0.2, -1.0, 0.4))),
    "2": ((1.5, 4.0, 0.0), (2, 3), ((1.0, -0.4, 0.1), (0.3, -1.0, -0.05))),
    "3": ((1.5, 4.0, -1.5), (2, 4), ((0.7, -0.3, -0.6), (0.2, -1.0, -0.45))),
}
for k, (hip, lens, dirs) in LEGS.items():
    for s in (1, -1):
        n = LR(s)
        pts = [np.array(M(hip, s), float)]
        for L, d in zip(lens, dirs):
            d = np.array(M(d, s), float)
            pts.append(pts[-1] + d / np.linalg.norm(d) * L)
        e = limb(R, f"leg_{n}{k}", "legs", pts[0], pts[1], 1, "femur")
        limb(R, f"shin_{n}{k}", f"leg_{n}{k}", e, pts[2], 1, "shin")

# ======================================================================= palette and paint
RAMPS = ramps(
    "eyeglow", "lilac",
    # dusky violet fur
    dusk=["#100a17", "#1a1124", "#251a33", "#322443", "#402f54", "#4f3c66", "#604b79", "#735d8c", "#88729f",
          "#a08ab3"],
    # wing eye-spots: hot magenta (a glow ramp)
    magglow=["#6a1052", "#a01e7a", "#d23a9f", "#f064c4", "#ff9ade", "#ffd2f0"],
)
light = dict(LIGHT)

EYES = {"face": "front", "at": "top-left", "art": [".....", ".k.k.", "EW.WE", "eE.Ee"],
        "key": {"k": "dusk:0", "W": "eyeglow:6", "E": "eyeglow:4", "e": "eyeglow:2"}}
styles = {
    # the fuzzy thorax: dusky violet, a pale lilac shawl over the shoulders, a darker belly
    "thorax": skin("dusk", 4.6, grain=1.1, grain_scale=0.6, lip=1.4, shade=-1.0, layers=[
        {"id": "shawl", "op": "band", "axis": "y", "from": 0.25, "to": 1.01, "ramp": "lilac", "tone": 5.0,
         "wobble": 0.35, "faces": ["top", "left", "right", "front"]},
        {"id": "shawl_grain", "op": "noise", "scale": 0.6, "amount": 0.8, "faces": ["top"]}]),
    "head": skin("dusk", 4.2, grain=0.9, lip=1.4, shade=-1.0, stamps=[EYES]),
    # the abdomen: dark velvet segments, each with a pale lilac ring at its front and a dark crease behind
    "abd": skin("dusk", 4.0, grain=1.0, lip=1.4, shade=-1.0, layers=[
        {"id": "ring", "op": "band", "axis": "z", "from": 0.35, "to": 1.01, "ramp": "lilac", "tone": 4.4,
         "faces": ["top", "left", "right", "bottom"]},
        {"id": "crease", "op": "band", "axis": "z", "from": -1.01, "to": -0.6, "shift": -1.2,
         "faces": ["top", "left", "right"]}]),
    "abd_tip": skin("dusk", 3.4, grain=0.8, lip=1.2, shade=-1.0),
    "femur": skin("dusk", 4.4, grain=0.6, lip=1.0, shade=-1.0, clusters=False, dark_low=0),
    "shin": skin("dusk", 3.6, grain=0.6, lip=1.0, shade=-1.0, clusters=False, dark_low=0, layers=[
        {"id": "tip", "op": "band", "axis": "y", "from": -1.01, "to": -0.4, "ramp": "lilac", "tone": 4.0}]),
    "antenna": card_style("dusk", 5, {"s": "dusk:3", "b": "lilac:5", "t": "lilac:7"}),
    # wings: pale lilac membrane with a soft grain, a dark leading edge, violet veins, a pale rim, a glowing spot
    "wing": card_style("lilac", 5.2, {"C": "dusk:4", "v": "lilac:3", "r": "lilac:7", "S": "magglow:4",
                                      "s": "dusk:3"}, light=0.5, grain=0.5, dither=0.25,
                       layers=[{"id": "tip_light", "op": "gradient", "axis": "x", "amount": 0.8}]),
    "dusk": {"ramp": "dusk", "tone": 5},
}

# ======================================================================= animation
WINGS_ALL = [f"wing_{k}{n}" for k in "fb" for n in "lr"]
LEG_CHAINS = {f"{n}{k}": [f"leg_{n}{k}", f"shin_{n}{k}"] for n in "lr" for k in "123"}


def beat(length, cycles, amp=38.0, sweep=10.0, bias=4.0, hind_lag=0.06, hind_amp=0.85):
    """Moth wing beats: a big flap (z) with the stroke plane tilting (y) twice per beat (a figure-8); the hind pair a
    little behind and smaller. Right wings mirror automatically (left/right are separate parts: values are mirrored
    here)."""
    tr = []
    for s, n in ((1, "l"), (-1, "r")):
        for k, a, ph in (("f", amp, 0.0), ("b", amp * hind_amp, hind_lag)):
            tr.append(osc(f"wing_{k}{n}", "z", s * a, cycles, ph + 0.25, bias=s * bias))
            tr.append(osc(f"wing_{k}{n}", "y", s * sweep * a / amp, cycles * 2, ph))
    return tr


def legs_pose(dirs):
    """dirs: {k: (femur, shin) left-side world directions}; the right side mirrored."""
    out = {}
    for k, ds in dirs.items():
        for s, n in ((1, "l"), (-1, "r")):
            out = add(out, chain_pose(R, LEG_CHAINS[f"{n}{k}"], [M(d, s) for d in ds]))
    return out


def both(base, x=0, y=0, z=0):
    return add(r(f"{base}_l", x, y, z), r(f"{base}_r", x, -y, -z))


HOVER = {}
# fast flight: pitched nose down, legs folded back under the abdomen, antennae swept back, abdomen streamlined
TUCK = legs_pose({"1": ((0.5, -0.2, 0.3), (0.15, -0.3, -0.95)),
                  "2": ((0.7, -0.25, -0.4), (0.1, -0.25, -1.0)),
                  "3": ((0.5, -0.1, -0.85), (0.08, -0.1, -1.0))})
FLY = add(TUCK, r("legs", 18), r("body", 14), r("head", -8), both("antenna", -30, 0, 8), r("abdomen", 8),
          r("abdomen_1", 4), r("abdomen_2", 2))
ANIM = {}

# hover: a lazy figure-8 flutter, bobbing with each beat, antennae combing the air, legs dangling and swaying
L = 1.2
ANIM["hover"] = timeline(L, [(0.0, HOVER, None), (L, HOVER, None)], loop=True, lock=False, extra=beat(L, 6) + [
    osc("body", None, [0, 0.35, 0], 6, 0.75, ch="position", bias=[0, 0.4, 0]),
    osc("body", None, [0, 0.4, 0], 1, 0.0, ch="position"),
    osc("body", "x", 3.0, 1, 0.1), osc("body", "z", 3.0, 1, 0.35), osc("body", "y", 5.0, 1, 0.6),
    osc("head", "y", 8.0, 1, 0.3), osc("head", "x", -3, 2, 0.2),
    osc("thorax", None, [0.04, 0.05, 0.03], 6, 0.2, ch="scale"), osc("thorax", "x", 2, 1, 0.4),
    osc("legs", "x", 6, 1, 0.15), osc("legs", "z", 3, 1, 0.4),
    wave(["abdomen", "abdomen_1", "abdomen_2"], "x", 5, 2, lag=0.12, growth=1.2),
    wave(["abdomen", "abdomen_1", "abdomen_2"], "y", 4, 1, lag=0.1, phase=0.2),
    osc("antenna_l", "x", 10, 2, 0.1), osc("antenna_r", "x", 10, 2, 0.35),
    osc("antenna_l", "z", -6, 1, 0.0), osc("antenna_r", "z", 6, 1, 0.5),
] + [wave(ch, "x", 5, 1, lag=0.12, growth=1.25, phase=0.13 * int(k[1]) + (0.5 if k[0] == "r" else 0))
     for k, ch in LEG_CHAINS.items()])

# fly: pitched forward, big strong beats, legs tucked, antennae streamed back
L = 1.0
ANIM["fly"] = timeline(L, [(0.0, FLY, None), (L, FLY, None)], loop=True, lock=False,
                       extra=beat(L, 6, amp=46, sweep=14, bias=2) + [
    osc("body", None, [0, 0.45, 0], 6, 0.75, ch="position", bias=[0, 0.5, 0]),
    osc("body", "x", 2.5, 6, 0.0), osc("body", "z", 6.0, 1, 0.0),
    osc("head", "z", -4, 1, 0.1),
    osc("thorax", None, [0.05, 0.06, 0.03], 6, 0.2, ch="scale"),
    osc("legs", "x", 4, 2, 0.3),
    wave(["abdomen", "abdomen_1", "abdomen_2"], "x", 6, 2, lag=0.14, growth=1.25),
    wave(["abdomen", "abdomen_1", "abdomen_2"], "y", -5, 1, lag=0.12),
    osc("antenna_l", "x", 6, 3, 0.3), osc("antenna_r", "x", 6, 3, 0.3),
] + [wave(ch, "x", 4, 1, lag=0.15, growth=1.2, phase=0.2 * int(k[1]) + (0.5 if k[0] == "r" else 0))
     for k, ch in LEG_CHAINS.items()])

# dive: wings flung high (anticipation), then folded back like a dart as it stoops nose-first at the target, legs
# reaching to grab; a jolt on contact, then the wings snap open and it flutters back up
WINGS_UP = add(*[r(f"wing_{k}{n}", 0, s * -10, s * 62) for k in "fb" for s, n in ((1, "l"), (-1, "r"))])
WINGS_BACK = add(*[r(f"wing_{k}{n}", 0, s * (58 if k == "f" else 40), s * (18 if k == "f" else 10))
                   for k in "fb" for s, n in ((1, "l"), (-1, "r"))])
WINGS_OPEN = add(*[r(f"wing_{k}{n}", 0, s * -12, s * -30) for k in "fb" for s, n in ((1, "l"), (-1, "r"))])
REACH = legs_pose({"1": ((0.4, -0.1, 0.9), (0.15, -0.3, 1.0)),
                   "2": ((0.8, -0.1, 0.5), (0.25, -0.5, 0.8)),
                   "3": ((0.6, -0.1, -0.7), (0.15, -0.6, -0.8))})
RAISE = add(WINGS_UP, r("body", -16), pos("body", 0, 1.2, -1.0), r("head", 6), both("antenna", 20, 0, -8),
            r("abdomen", 14), r("abdomen_1", 8), sc("body", -0.04, 0.08, -0.04))
STOOP = add(WINGS_BACK, REACH, r("legs", -16), sc("thorax", -0.06, 0.04, 0.08), r("body", 42),
            pos("body", 0, -1.0, 4.0), r("head", -14), both("antenna", -40, 0, 10),
            r("abdomen", -10), r("abdomen_1", -6), r("abdomen_2", -4), sc("body", -0.06, -0.04, 0.12))
HIT = add(STOOP, r("body", -10), pos("body", 0, -0.5, 4.6), sc("body", 0.14, -0.1, -0.14), r("head", 8))
RECOVER = add(WINGS_OPEN, r("body", -12), pos("body", 0, 1.6, 1.0), both("antenna", 16), r("abdomen", 16),
              r("abdomen_1", 10), r("abdomen_2", 8))
ANIM["dive"] = timeline(0.6, [(0.0, HOVER, None), (0.1, RAISE, "out"), (0.14, add(RAISE, r("body", -3)), "ease"),
                              (0.27, STOOP, "in"), (0.33, HIT, "out"), (0.38, add(HIT, r("body", 4)), "ease"),
                              (0.48, RECOVER, "out"), (0.6, HOVER, "ease")],
                        lock=False, extra=[jitter("body", 0.33, 0.4, 3.0, step=0.025, axis=2),
                                           jitter("abdomen", 0.33, 0.42, 6.0, step=0.025)])

# teleport: a flicker out of space and back: a squash, a tall thin stretch with the wings snapped shut overhead, a
# shrink to a speck, then it pops back to full size with an overshoot
SHUT = add(*[r(f"wing_{k}{n}", 0, 0, s * 80) for k in "fb" for s, n in ((1, "l"), (-1, "r"))])
ANIM["teleport"] = timeline(0.3, [
    (0.0, HOVER, None),
    (0.05, add(sc("body", 0.3, -0.3, 0.3), both("antenna", 20, 0, -20)), "out"),
    (0.11, add(SHUT, sc("body", -0.6, 0.9, -0.6), pos("body", 0, 1.0, 0), both("antenna", -30, 0, 10)), "in"),
    (0.17, add(SHUT, sc("body", -0.9, -0.5, -0.9), pos("body", 0, 2.0, 0)), "in"),
    (0.23, add(sc("body", 0.18, 0.18, 0.18), WINGS_OPEN), "out"),
    (0.3, HOVER, "ease")], lock=False)

for clip in ANIM.values():   # it always flies: no clip is tied to the ground
    clip["grounded"] = False

spec = {
    "name": "Enderfly",
    "description": "The Winterworks Enderfly: a moth-like evolution of the Endermite in vanilla style: a fuzzy "
                   "dusky-violet thorax with a lilac shawl, a ringed Endermite abdomen, flat glowing violet eyes under "
                   "slanted lids, feathery antennae, four flat lilac moth wings with violet veins and glowing magenta "
                   "eye-spots, six jointed legs. Minecraft pixel units, density 1: exports 1:1 to a vanilla entity "
                   "model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 600, "colors": 56},
    "light": light,
    # 30 fps: the 5 Hz hover and 6 Hz flight beats bake to whole samples per beat, landing on the stroke peaks
    "minecraft": {"fps": 30, "glow_ramps": ["eyeglow", "magglow"]},
    "anim_fps": 30,
    "render": {"background": "#1d2a22", "hero": [36, 30], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "enderfly.json")
    finish(spec, out, lock=False)
