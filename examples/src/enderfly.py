"""Builds examples/enderfly.json: the Enderfly (Winterworks, The Living End).

    python examples/src/enderfly.py examples/enderfly.json

A moth-like evolution of the Endermite: a fuzzy dusky-violet thorax with a shaggy collar, a segmented Endermite
abdomen banded in pale lilac with fur fringes and a tail tuft, a small head that is mostly two glowing violet compound
eyes, a coiled proboscis, two big feathery (bipectinate) antennae, four broad moth wings in pale lilac with dark
violet veins, a chequered fringe, a zigzag submarginal line and glowing magenta eye-spots (a small one near each
forewing's apex, a big one on each hindwing), and six thin banded legs dangling under it.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). Wings, antennae, fur and the proboscis are alpha-cut cards.
Faces +Z, ground at y = 0, "left" is +X. About 26 px across the wings, 13 px long; the rest pose is the hover, the
dangling feet touching y = 0 (it always flies).

Contract (mods/winterworks/docs/END_UPDATE.md section 4): bones body (root), thorax, abdomen, head, antenna_l,
antenna_r, wing_fl, wing_fr, wing_bl, wing_br, legs. Extra joints: abdomen_1, abdomen_2 (the abdomen curls),
leg_l1..3 / leg_r1..3 (femurs under `legs`), shin_*, foot_*. Clips: fly (loop), hover (loop), dive (0.6 s),
teleport (0.3 s). Glow: the eyes and the wing eye-spots (ramps eyeglow and magglow).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (DENSITY, LR, M, MR, ROOT, Rig, add, chain_pose, check_art, finish, jitter, keys,  # noqa: E402
                     limb, locks, mirror_art, moth_wing, osc, plume, pos, r, ramps, sc, timeline, wave)

R = Rig(density=DENSITY, bone_style="fur")
part, bone, card, wpos = R.part, R.bone, R.card, R.wpos

# ======================================================================= thorax (the root), collar, back plate
bone("body", None, at=(0, 6, 0))
part("thorax", "body", [4, 4, 4.5], "thorax", centre=(0, 6, 0.25))
part("scutum", "thorax", [3, 1, 3.5], "scutum", centre=(0, 8.2, 0.1), rot=(-6, 0, 0))
card("collar", "thorax", locks(10, 5, 11, up=True), "fur_card", at=(0, 7.6, 2.55), offset=(0, 1.0, 0),
     plane="xy", rot=(-24, 0, 0))
card("thorax_crest", "thorax", locks(9, 4, 12, up=True, min_len=0.5), "fur_card", at=(0, 8.6, -0.6),
     offset=(0, 0.9, 0), plane="yz", rot=(-8, 0, 0))
for s in (1, -1):
    n = LR(s)
    card(f"thorax_fur_{n}", "thorax", locks(10, 5, 13 + s), "fur_card", at=M((2.05, 4.6, 0.2), s),
         offset=(0, -1.2, 0), plane="yz", rot=(0, 0, s * 10))
part("belly", "thorax", [3, 1, 3.5], "thorax_low", centre=(0, 3.75, 0.2))

# ======================================================================= head: two huge compound eyes, a coiled proboscis
part("head", "thorax", [3, 2.5, 2.5], "head", at=(0, 6.3, 2.4), centre=(0, 5.9, 3.45), wrot=(12, 0, 0))
for s in (1, -1):
    n = LR(s)
    part(f"eye_{n}", "head", [2, 2.5, 2.5], "eye", rel=(s * 1.55, -0.25, 1.0), rot=(0, s * 14, 0))
    part(f"eye_{n}_cap", f"eye_{n}", [0.5, 1.5, 1.5], "eye", rel=(s * 1.2, 0.05, 0.05))
    card(f"cheek_fur_{n}", "head", locks(4, 3, 30 + s), "fur_card", rel=(s * 1.55, -1.3, 0.2), offset=(0, -0.6, 0),
         plane="yz", rot=(0, 0, s * 14))
card("face_fur", "head", locks(6, 3, 33), "fur_card", rel=(0, -1.2, 2.3), offset=(0, -0.6, 0), plane="xy")
PROBOSCIS = ["..sss.", ".s...s", "s..s.s", "s.s..s", ".s..s.", "..ss.."]
card("proboscis", "head", PROBOSCIS, "proboscis", rel=(0, -1.6, 1.9), offset=(0, -1.0, 0.4), plane="yz")
for s in (1, -1):
    n = LR(s)
    card(f"palp_{n}", "head", ["ss", "s.", "s."], "proboscis", rel=(s * 0.55, -1.25, 2.1), offset=(0, -0.6, 0),
         plane="yz", rot=(18, 0, 0))
# feathery antennae: big bipectinate plumes rising up and out from between the eyes
for s in (1, -1):
    n = LR(s)
    bone(f"antenna_{n}", "head", rel=(s * 0.7, 1.15, 1.0), rot=MR((28, 0, -26), s))
    card(f"antenna_{n}_plume", f"antenna_{n}", plume(7, 16), "antenna", rel=(0, 0, 0), offset=(0, 3.9, 0),
         plane="xy", rot=MR((0, -22, 0), s))

# ======================================================================= abdomen: three banded Endermite segments
part("abdomen", "thorax", [3.5, 3, 3], "abd", at=(0, 5.6, -1.8), offset=(0, 0, -1.4), wrot=(-12, 0, 0))
part("abdomen_1", "abdomen", [3, 2.5, 3], "abd", rel=(0, -0.1, -2.8), offset=(0, 0, -1.4), rot=(-6, 0, 0))
part("abdomen_2", "abdomen_1", [2, 2, 2.5], "abd", rel=(0, -0.1, -2.7), offset=(0, 0, -1.2), rot=(-8, 0, 0))
card("abd_tuft", "abdomen_2", locks(5, 4, 40), "fur_card", rel=(0, 0.2, -2.45), offset=(0, -0.9, 0), plane="xy",
     rot=(30, 0, 0))
for k, seg in enumerate(("abdomen", "abdomen_1")):
    w = 3.5 if k == 0 else 3
    for s in (1, -1):
        card(f"{seg}_fringe_{LR(s)}", seg, locks(6, 3, 50 + 2 * k + s), "fur_card", rel=(s * (w / 2 + 0.05), -1.0, -1.4),
             offset=(0, -0.6, 0), plane="yz", rot=(0, 0, s * 12))
card("abd_crest", "abdomen", locks(6, 3, 60, up=True, min_len=0.5), "fur_card", rel=(0, 1.5, -1.0),
     offset=(0, 0.6, 0), plane="yz", rot=(-10, 0, 0))

# ======================================================================= wings: four broad moth wings (cards, plane xz)
WINGS = {  # name: (root (left), art w, h, hind?, eye-spot (u, v), radius, yaw back, dihedral)
    "f": ((1.6, 7.6, 1.0), 22, 16, False, (0.7, 0.55), 1.7, 6, 12),
    "b": ((1.5, 7.1, -0.7), 18, 15, True, (0.52, 0.52), 2.9, 34, 6),
}
for k, (root, w, h, hind, spot, rad, yaw, dih) in WINGS.items():
    art = check_art(moth_wing(w, h, 3 if k == "f" else 4, hind=hind, spot=spot, spot_r=rad))
    v_root = 0.66 if not hind else 0.78
    for s in (1, -1):
        n = LR(s)
        bone(f"wing_{k}{n}", "thorax", at=M(root, s), rot=MR((0, yaw, dih), s))
        # the root texel (column 0, row v_root) sits on the joint
        off = (s * w / (2 * DENSITY), 0, -(h / DENSITY) / 2 + v_root * h / DENSITY)
        card(f"wing_{k}{n}_m", f"wing_{k}{n}", art if s > 0 else mirror_art(art), f"wing_{n}", plane="xz",
             offset=(off[0], 0, -off[2]))

# ======================================================================= legs: six thin banded legs under one bone
bone("legs", "thorax", at=(0, 4.0, 0.3))
LEGS = {  # name: hip (left), (femur, tibia, tarsus) lengths, directions (left side, rest/hover)
    "1": ((0.9, 4.2, 1.6), (2.5, 3.0, 1.5), ((0.6, -0.35, 0.6), (0.2, -1.0, 0.4), (0.1, -1.0, 0.6))),
    "2": ((1.2, 4.0, 0.4), (2.5, 3.0, 1.5), ((1.0, -0.4, 0.1), (0.3, -1.0, -0.05), (0.2, -1.0, -0.2))),
    "3": ((0.9, 4.1, -0.8), (2.5, 3.5, 1.5), ((0.7, -0.35, -0.6), (0.2, -1.0, -0.45), (0.05, -1.0, -0.6))),
}
for k, (hip, lens, dirs) in LEGS.items():
    for s in (1, -1):
        n = LR(s)
        pts = [np.array(M(hip, s), float)]
        for L, d in zip(lens, dirs):
            d = np.array(M(d, s), float)
            pts.append(pts[-1] + d / np.linalg.norm(d) * L)
        e = limb(R, f"leg_{n}{k}", "legs", pts[0], pts[1], 0.5, "femur")
        e2 = limb(R, f"shin_{n}{k}", f"leg_{n}{k}", e, pts[2], 0.5, "tibia")
        limb(R, f"foot_{n}{k}", f"shin_{n}{k}", e2, pts[3], 0.5, "tarsus")
    if k == "1":
        for s in (1, -1):
            card(f"leg_{LR(s)}1_tuft", f"leg_{LR(s)}1", locks(3, 3, 70 + s), "fur_card", rel=(0, -1.2, 0),
                 offset=(0, -0.6, 0.35), plane="yz")

# ======================================================================= palette and paint
RAMPS = ramps(
    "chorus", "void", "eyeglow", "magglow",
    # dusky violet fur, warm lilac lights
    dusk=["#110a19", "#1b1128", "#271a38", "#342449", "#422f5a", "#523c6c", "#634b7e", "#765d8f", "#8a71a0",
          "#a088b2", "#b8a2c4"],
    # pale lilac wing scales
    lilac=["#3f3159", "#544370", "#6b5888", "#836fa0", "#9c88b8", "#b5a2cc", "#ccbddd", "#e0d6ec", "#f2edf8"],
)
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.6, "gradient": 0.5, "ao": 0.4, "ao_height": 3.0}
brush = {"flow": "long", "length": 1.4, "width": 0.5, "rough": 0.6, "overshoot": 0.25,
         "textures": {"dusk": "fur", "lilac": "fur", "eyeglow": "crystal"}}

FUR_KEY = {"t": "lilac:4", "m": "dusk:7", "f": "dusk:5"}
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.5,
         "shift": 1.6}
VELVET = {"id": "velvet", "op": "noise", "scale": 0.5, "amount": 0.8}
STRANDS = {"id": "strands", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3, "shift": -0.9, "wobble": 0.6,
           "faces": ["top", "front", "back", "bottom"]}


def wing_style(s):
    """Pale lilac scales, dusky and furred at the root, lightening to the tip, a darker band before the margin."""
    g = 1.0 if s > 0 else -1.0                         # card x runs root -> tip on the left wing, tip -> root on the right
    return {"ramp": "lilac", "tone": 5.3, "light": 0.25, "brush": {"flow": "x", "length": 1.5, "rough": 0.35},
            "layers": [{"id": "tip_light", "op": "gradient", "axis": "x", "amount": -1.2 * g},
                       {"id": "root_dusk", "op": "band", "axis": "x", "from": -1.01 if s > 0 else 0.7,
                        "to": -0.7 if s > 0 else 1.01, "ramp": "dusk", "tone": 6.2, "wobble": 0.25},
                       {"id": "scales", "op": "noise", "scale": 1.2, "amount": 0.5},
                       {"id": "dapple", "op": "spots", "count": 3, "radius": [0.6, 1.0], "shift": -0.9,
                        "roughness": 0.4}],
            "art_key": {"C": "chorus:2", "v": "chorus:3", "z": "dusk:4", "f": "dusk:2", "F": "lilac:7",
                        "k": "void:2", "E": "magglow:3", "e": "magglow:4", "p": "void:1", "w": "magglow:6",
                        "d": "dusk:3", "h": "lilac:8"}}


styles = {
    # the fuzzy thorax: dusky violet velvet, combed strands, a pale lilac shawl over the shoulders
    "thorax": {"ramp": "dusk", "tone": 5.8, "rim": {"light_shift": 1.2, "dark_shift": -1.0},
               "layers": [VELVET, STRANDS,
                          {"id": "shawl", "op": "band", "axis": "z", "from": 0.4, "to": 1.01, "ramp": "lilac",
                           "tone": 3.8, "wobble": 0.3, "faces": ["top", "left", "right", "front"]},
                          {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "thorax_low": {"ramp": "dusk", "tone": 3.6, "layers": [VELVET]},
    # the back plate: an Endermite's shell, darker, with a pale lyre of scales
    "scutum": {"ramp": "dusk", "tone": 4.2, "rim": {"light_shift": 1.8, "dark_shift": -1.2},
               "layers": [VELVET, GLOSS],
               "stamps": [{"face": "top", "at": "top-left", "art": ["......", "l....l", ".l..l.", "..ll..", "..LL..",
                                                                     ".l..l.", "l....l"],
                           "key": {"l": "lilac:6", "L": "lilac:8"}}]},
    "head": {"ramp": "dusk", "tone": 5.0, "rim": {"light_shift": 1.2, "dark_shift": -1.0}, "layers": [VELVET]},
    # compound eyes: violet facets glowing from within, a hot catchlight
    "eye": {"ramp": "eyeglow", "tone": 2.8, "light": 0.5, "brush": {"off": True},
            "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.2},
            "layers": [{"id": "facets", "op": "scales", "shape": "round", "along": "z", "size": [1.0, 1.0], "gap": 0.5,
                        "highlight": 1.0, "shadow": -1.2, "gradient": 0.2, "jitter": 0.4},
                       {"id": "back_dark", "op": "gradient", "axis": "z", "amount": 1.0}],
            "stamps": [{"face": "front", "at": "top-left", "art": [".wW", ".Ww"], "key": {"w": "eyeglow:5",
                                                                                         "W": "eyeglow:6"}},
                       {"faces": ["left", "right"], "at": "top-left", "art": ["..w", ".wW"],
                        "key": {"w": "eyeglow:5", "W": "eyeglow:6"}}]},
    "proboscis": {"ramp": "dusk", "tone": 6, "light": 0, "brush": {"off": True},
                  "art_key": {"s": "lilac:3"}},
    "antenna": {"ramp": "dusk", "tone": 5, "light": 0.2, "brush": {"off": True},
                "art_key": {"s": "dusk:3", "b": "lilac:5", "B": "lilac:3", "t": "lilac:7"}},
    "fur_card": {"ramp": "dusk", "tone": 6, "light": 0.3, "brush": {"off": True}, "art_key": FUR_KEY},
    "fur": {"ramp": "dusk", "tone": 5},
    # the abdomen: banded segments, dark velvet with pale lilac rings and side spots
    "abd": {"ramp": "dusk", "tone": 4.8, "rim": {"light_shift": 1.4, "dark_shift": -1.0}, "brush": {"flow": "z"},
            "layers": [VELVET, {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 1.0},
                       {"id": "rings", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.34, "ramp": "lilac",
                        "tone": 3.6, "wobble": 0.2, "faces": ["top", "left", "right"],
                        "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "dusk", "shadow_shift": -1.0}},
                       {"id": "spots", "op": "spots", "count": 2, "radius": [0.35, 0.5], "ramp": "lilac",
                        "tone": 6.0, "faces": ["left", "right"]}, GLOSS]},
    "wing_l": wing_style(1),
    "wing_r": wing_style(-1),
    # legs: dusky, banded lilac at the joints
    "femur": {"ramp": "dusk", "tone": 5.6, "brush": {"off": True}, "rim": {"light_shift": 1.4, "dark_shift": -1.0}},
    "tibia": {"ramp": "dusk", "tone": 4.6, "brush": {"off": True},
              "layers": [{"id": "bands", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.34, "ramp": "lilac",
                          "tone": 5.0}]},
    "tarsus": {"ramp": "dusk", "tone": 3.6, "brush": {"off": True},
               "layers": [{"id": "bands", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.5, "ramp": "lilac",
                           "tone": 6.0}]},
}

# ======================================================================= animation
WINGS_ALL = [f"wing_{k}{n}" for k in "fb" for n in "lr"]
LEG_CHAINS = {f"{n}{k}": [f"leg_{n}{k}", f"shin_{n}{k}", f"foot_{n}{k}"] for n in "lr" for k in "123"}


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
    """dirs: {k: (femur, tibia, tarsus) left-side world directions}; the right side mirrored."""
    out = {}
    for k, ds in dirs.items():
        for s, n in ((1, "l"), (-1, "r")):
            out = add(out, chain_pose(R, LEG_CHAINS[f"{n}{k}"], [M(d, s) for d in ds]))
    return out


def both(base, x=0, y=0, z=0):
    return add(r(f"{base}_l", x, y, z), r(f"{base}_r", x, -y, -z))


HOVER = {}
# fast flight: pitched nose down, legs folded back under the abdomen, antennae swept back, abdomen streamlined
TUCK = legs_pose({"1": ((0.5, -0.2, 0.3), (0.15, -0.3, -0.95), (0.05, -0.1, -1.0)),
                  "2": ((0.7, -0.25, -0.4), (0.1, -0.25, -1.0), (0.0, -0.1, -1.0)),
                  "3": ((0.5, -0.1, -0.85), (0.08, -0.1, -1.0), (0.0, 0.05, -1.0))})
FLY = add(TUCK, r("body", 14), r("head", -8), both("antenna", -30, 0, 8), r("abdomen", 8), r("abdomen_1", 4),
          r("abdomen_2", 2))
ANIM = {}

# hover: a lazy figure-8 flutter, bobbing with each beat, antennae combing the air, legs dangling and swaying
L = 1.2
ANIM["hover"] = timeline(L, [(0.0, HOVER, None), (L, HOVER, None)], loop=True, lock=False, extra=beat(L, 6) + [
    osc("body", None, [0, 0.35, 0], 6, 0.75, ch="position", bias=[0, 0.4, 0]),
    osc("body", None, [0, 0.4, 0], 1, 0.0, ch="position"),
    osc("body", "x", 3.0, 1, 0.1), osc("body", "z", 3.0, 1, 0.35), osc("body", "y", 5.0, 1, 0.6),
    osc("head", "y", 8.0, 1, 0.3), osc("head", "x", -3, 2, 0.2),
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
REACH = legs_pose({"1": ((0.4, -0.1, 0.9), (0.15, -0.3, 1.0), (0.05, -0.5, 0.9)),
                   "2": ((0.8, -0.1, 0.5), (0.25, -0.5, 0.8), (0.1, -0.7, 0.7)),
                   "3": ((0.6, -0.1, -0.7), (0.15, -0.6, -0.8), (0.0, -0.9, -0.4))})
RAISE = add(WINGS_UP, r("body", -16), pos("body", 0, 1.2, -1.0), r("head", 6), both("antenna", 20, 0, -8),
            r("abdomen", 14), r("abdomen_1", 8), sc("body", -0.04, 0.08, -0.04))
STOOP = add(WINGS_BACK, REACH, r("body", 42), pos("body", 0, -1.0, 4.0), r("head", -14), both("antenna", -40, 0, 10),
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
    "description": "The Winterworks Enderfly: a moth-like evolution of the Endermite: a fuzzy dusky-violet thorax "
                   "and banded Endermite abdomen, glowing violet compound eyes, feathery antennae, four broad pale "
                   "lilac moth wings with dark violet veins, a chequered fringe and glowing magenta eye-spots, six "
                   "thin banded legs. Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 1200, "colors": 96},
    "light": light,
    "brush": brush,
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
