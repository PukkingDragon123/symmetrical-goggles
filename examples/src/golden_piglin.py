"""Builds examples/golden_piglin.json: the Golden Piglin (Winterworks, Hexes & Havoc).

    python examples/src/golden_piglin.py examples/golden_piglin.json

A Piglin turned to solid gold, alive inside it and in constant pain: vanilla piglin proportions (a 10x8x8 head with
the flat snout and tusks, floppy ears, an 8x12x4 body, 4x12x4 arms and legs) made chunky with a fused belt and
loincloth, a gold-crusted pauldron with nugget spikes on the left shoulder, gold nuggets bubbling out of the head and
back, molten drips frozen mid-run off the brow, snout, jaw, ears, hands and belt, a golden tear. The face is frozen
in a grimace: brows knotted up in the middle, eyes squeezed shut, the jaw dropped open in a silent groan.
Polished gold on the high planes (bright edges, gloss dashes), tarnished olive-brown gold in the creases and
patches, dark cracks running through it, a chipped right ear. No glow.

Units are Minecraft pixels (16 per block), density 1, every box a whole number of pixels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). Drips are alpha-cut cards. Faces +Z, ground at y = 0,
"left" is +X. Joints sit where a vanilla piglin's do (arms at (+-5, 22), legs at (+-2, 12), head at y = 24).

Contract (mods/winterworks/docs/HEXES_UPDATE.md section 7): bones body (root, pivot between the hips), head, ear_l,
ear_r, arm_l, arm_r, leg_l, leg_r. Clips: idle (strained trembling), walk (stiff and janky: no knees, jerky steps),
barter (2.0 s), hurt_groan (1.0 s). Every clip starts and ends in the rest pose.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import (M, ROOT, Rig, add, drips, dump, ground_lock, jitter, keys, osc, r, rest_on_ground,  # noqa: E402
                     ring, sc, shake, side, timeline)

R = Rig(density=1, bone_style="gold")
part, bone, card, wpos = R.part, R.bone, R.card, R.wpos

# ======================================================================= body, belt, loincloth
part("body", None, [8, 12, 4], "gold_body", at=(0, 12, 0), centre=(0, 18, 0))
part("belt", "body", [9, 3, 5], "tarnish_band", centre=(0, 13.5, 0))
part("buckle", "belt", [3, 3, 1], "gold_bright", centre=(0, 13.5, 2.9))
part("loincloth", "belt", [5, 5, 1], "gold_cloth", at=(0, 12.5, 2.7), offset=(0, -2.5, 0), rot=(-6, 0, 0))
card("loin_drip", "loincloth", drips(5, 3, 7), "drip", rel=(0, -5.0, 0.55), offset=(0, -1.5, 0))
card("belt_drip", "belt", drips(7, 3, 8, fill=0.6), "drip", rel=(-0.5, -1.5, 2.55), offset=(0, -1.5, 0))
# a big crack across the chest, a nugget crust bubbling out of the back
for k, (x, y, z, s) in enumerate([(-1.5, 21.5, -2.4, 2), (1.5, 20.0, -2.6, 1), (2.6, 22.6, -2.3, 1),
                                  (-2.8, 18.5, -2.4, 1)]):
    part(f"nugget{k}", "body", [s, s, s], "gold_nugget", centre=(x, y, z), rot=(20 * k, 35, 15))

# ======================================================================= legs: rigid pillars, no knees
for s in (1, -1):
    n = "l" if s > 0 else "r"
    leg = part(f"leg_{n}", "body", [4, 12, 4], "gold_leg", at=M((2, 12, 0), s), offset=(0, -6, 0), hide=["bottom"])
    part(f"hoof_{n}", leg["id"], [5, 2, 5], "tarnish_band", rel=(0, -11, 0.4))

# ======================================================================= arms: held stiffly away from the body
for s in (1, -1):
    n = "l" if s > 0 else "r"
    arm = part(f"arm_{n}", "body", [4, 12, 4], "gold_arm", at=M((5, 22, 0), s), offset=(s * 1, -4, 0),
               rot=(-6 if s > 0 else -2, 0, s * 7))
    part(f"cuff_{n}", arm["id"], [5, 2, 5], "tarnish_band", rel=(s * 1, -7.5, 0))
    card(f"hand_drip_{n}", arm["id"], drips(4, 4, 20 + s), "drip", rel=(s * 1, -10.05, 2.05), offset=(0, -1.5, 0))
# the left shoulder: a gold-crusted pauldron with nugget spikes and a drip off its rim
part("pauldron", "arm_l", [6, 3, 6], "gold_plate", rel=(1.2, 1.4, 0), rot=(0, 0, -16))
for k, (x, z, h, rx, rz) in enumerate([(-0.5, 0.5, 4, -10, -20), (1.6, -1.2, 3, 14, -40), (1.4, 1.8, 2, -30, -50)]):
    part(f"spike{k}", "pauldron", [2, h, 2], "gold_nugget", rel=(x, 1.2, z), offset=(0, h / 2, 0), rot=(rx, 20, rz))
card("pauldron_drip", "pauldron", drips(6, 3, 31), "drip", rel=(0, -1.55, 3.05), offset=(0, -1.5, 0))

# ======================================================================= head: frozen in a grimace
part("head", "body", [10, 8, 8], "gold_head", at=(0, 24, 0), offset=(0, 4, 0), rot=(-6, 0, 3))
part("snout", "head", [4, 4, 1], "gold_snout", rel=(0, 2, 4.5))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    part(f"tusk_{n}", "head", [1, 3, 1], "gold_bright", rel=(s * 2.5, 0.5, 4.5), rot=(0, 0, s * -8))
    # brows knotted up in the middle (pain), heavy and tarnished
    part(f"brow_{n}", "head", [4, 1, 1], "tarnish_band", rel=(s * 2.6, 6.0, 4.5), rot=(0, 0, s * -18))
# the jaw dropped open in a silent groan (a frozen part of the statue)
part("jaw", "head", [6, 2, 4], "gold_jaw", rel=(0, 0.2, 2.6), offset=(0, -1, 0.6), rot=(14, 0, 0))
card("jaw_drip", "jaw", drips(6, 3, 41), "drip", rel=(0, -2.0, 2.65), offset=(0, -1.5, 0))
card("snout_drip", "snout", drips(4, 3, 42, fill=0.9), "drip", rel=(0, -2.0, 0.55), offset=(0, -1.5, 0))
card("brow_drip", "head", drips(10, 3, 43, fill=0.5), "drip", rel=(0, 8.0, 4.05), offset=(0, -1.5, 0))
card("tear", "head", ["g", "d", "d", "b"], "drip", rel=(2.5, 4.2, 4.08), offset=(0, -2, 0))
for k, (x, z, sz) in enumerate([(-2.5, -1.5, 2), (2.0, -2.5, 2), (3.6, 1.0, 1), (-0.5, -3.2, 1)]):
    part(f"head_nugget{k}", "head", [sz, sz, sz], "gold_nugget", rel=(x, 8.2, z), rot=(25, 40 * k, 15))
# floppy ears; the right one chipped short, both dripping
for s in (1, -1):
    n = "l" if s > 0 else "r"
    h = 5 if s > 0 else 4
    ear = part(f"ear_{n}", "head", [1, h, 4], "gold_ear", rel=(s * 4.5, 6.0, 0), offset=(s * 0.5, -h / 2, 0),
               rot=(0, 0, s * 30))
    card(f"ear_{n}_drip", ear["id"], drips(4, 3, 50 + s), "drip", rel=(s * 0.5, -h, 0), offset=(0, -1.5, 0),
         plane="yz")
card("ear_r_chip", "ear_r", ["x.x.", "xxxx"], "chip", rel=(-0.5, -4.0, 0), offset=(0, 0.5, 0), plane="yz")

# ======================================================================= palette and paint
ramps = {
    # polished gold: deep brown-orange shadows, warm yellow body, near-white glints
    "gold": ["#2c1503", "#4a2405", "#6e3706", "#94500a", "#b86b0e", "#d68b12", "#eaa91c", "#f6c934", "#fde35c",
             "#fff399", "#fffbd6"],
    # tarnish: olive-brown dulled gold in the creases and patches
    "tarnish": ["#1d1608", "#2f250c", "#433612", "#5a4a19", "#725f22", "#8a742c", "#a28937"],
    "crack": ["#0f0803", "#1c1006", "#2b1a09"],
}
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.75, "gradient": 0.3, "ao": 0.8, "ao_height": 10.0}
brush = {"flow": "long", "length": 3.0, "width": 1.0, "rough": 0.3, "overshoot": 0.2,
         "textures": {"gold": "metal", "tarnish": "metal"}}

RIM = {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -2.0}
TARNISH = {"id": "tarnish", "op": "patches", "scale": 2.6, "threshold": 0.7, "ramp": "tarnish", "tone": 5.0,
           "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "tarnish", "shadow_shift": -1.0}}
# tarnish pools in the low creases of every mass, with a ragged upper edge
POOL = {"id": "pool", "op": "band", "axis": "y", "from": -1.01, "to": -0.5, "wobble": 0.35, "wobble_scale": 0.6,
        "ramp": "tarnish", "tone": 4.6, "faces": ["sides"],
        "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.5}}
CRACKS = {"id": "cracks", "op": "cracks", "scale": 1.4, "width": 0.03, "ramp": "tarnish", "tone": 1.2,
          "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 2.5}}
CRACK_KEY = {"x": "tarnish:1", "X": "crack:1", "h": "gold:10"}
CRACK_A = ["x.....", ".xx...", "...xX.", ".h...x", "......x"]
CRACK_B = ["..x", ".x.", ".xh", "x..", "x..", ".x."]
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.35,
         "shift": 2.6}
GLOSS_S = dict(GLOSS, length=2, inset=0, density=0.7)
CREASE = {"id": "crease", "op": "gradient", "axis": "y", "amount": 0.8}
DRIP_KEY = {"g": "gold:8", "d": "gold:6", "b": "gold:5", "h": "gold:10"}

# brows knotted up in the middle, eyes squeezed shut into creased slits, crow's feet, a frozen tear track
FACE = ["..........",
        "..........",
        "...d..d...",
        ".xxx..xxx.",
        "d.d....d.d",
        "..........",
        ".d......d.",
        ".........."]
FACE_KEY = {"d": "tarnish:3", "x": "crack:2"}

styles = {
    "gold_body": {"ramp": "gold", "tone": 6.4, "rim": RIM,
                  "layers": [{"id": "hammered", "op": "noise", "scale": 1.4, "amount": 0.25}, TARNISH, POOL,
                             {"id": "abs", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.18, "shift": -1.6,
                              "range": [-0.2, 0.7], "faces": ["front"]},
                             {"id": "split", "op": "band", "axis": "x", "from": -0.08, "to": 0.08, "shift": -1.6,
                              "faces": ["front"]}, GLOSS],
                  "stamps": [{"face": "front", "at": [1, 1], "art": CRACK_A, "key": CRACK_KEY},
                             {"face": "back", "at": [4, 5], "art": CRACK_B, "key": CRACK_KEY}]},
    "gold_leg": {"ramp": "gold", "tone": 6.0, "rim": RIM, "brush": {"flow": "y"},
                 "layers": [{"id": "hammered", "op": "noise", "scale": 1.4, "amount": 0.25}, TARNISH, POOL,
                            dict(CREASE, amount=1.0), GLOSS],
                 "stamps": [{"face": "front", "at": [1, 3], "art": CRACK_B, "key": CRACK_KEY}]},
    "gold_arm": {"ramp": "gold", "tone": 6.4, "rim": RIM, "brush": {"flow": "y"},
                 "layers": [{"id": "hammered", "op": "noise", "scale": 1.4, "amount": 0.25}, TARNISH, POOL,
                            {"id": "fingers", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.35, "shift": -1.4,
                             "range": [-1.0, -0.6], "faces": ["front"]}, GLOSS],
                 "stamps": [{"face": "left", "at": [0, 2], "art": CRACK_B, "key": CRACK_KEY}]},
    "gold_head": {"ramp": "gold", "tone": 6.8, "rim": RIM, "brush": {"flow": "horizontal"},
                  "layers": [{"id": "hammered", "op": "noise", "scale": 1.4, "amount": 0.25}, dict(TARNISH, seed=5),
                             GLOSS],
                  "stamps": [{"face": "front", "at": "top-left", "art": FACE, "key": FACE_KEY},
                             {"face": "left", "at": [2, 0], "art": CRACK_A, "key": CRACK_KEY},
                             {"face": "top", "at": [5, 2], "art": CRACK_B, "key": CRACK_KEY}]},
    "gold_snout": {"ramp": "gold", "tone": 7.4, "rim": RIM, "brush": {"off": True},
                   "stamps": [{"face": "front", "at": "top-left", "art": [".hh.", "....", "n..n", "N..N"],
                               "key": {"n": "tarnish:1", "N": "crack:0", "h": "gold:10"}}]},
    "gold_jaw": {"ramp": "gold", "tone": 6.0, "rim": RIM, "brush": {"off": True},
                 "layers": [{"id": "mouth", "op": "fill", "ramp": "crack", "tone": 1.0, "faces": ["top"]},
                            {"id": "teeth", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.5, "shift": 1.4,
                             "range": [-1.0, 1.0], "faces": ["front"]}]},
    "gold_ear": {"ramp": "gold", "tone": 6.4, "rim": RIM, "brush": {"flow": "y"},
                 "layers": [{"id": "inner", "op": "rect", "rect": [0.25, 0.15, 0.75, 0.85], "ramp": "tarnish",
                             "tone": 3.6, "faces": ["left", "right"], "bevel": {"shadow": 1, "highlight": 0}},
                            GLOSS_S]},
    "gold_plate": {"ramp": "gold", "tone": 6.6, "rim": RIM,
                   "layers": [{"id": "rivets", "op": "rivets", "inset": 1, "highlight": 2.0, "shadow": -2.0},
                              dict(TARNISH, seed=9), GLOSS]},
    "gold_cloth": {"ramp": "gold", "tone": 5.4, "rim": RIM, "brush": {"flow": "y"},
                   "layers": [{"id": "folds", "op": "stripes", "axis": "x", "period": 1.6, "width": 0.35,
                               "shift": -1.6}, dict(TARNISH, seed=11), GLOSS_S]},
    "tarnish_band": {"ramp": "tarnish", "tone": 4.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.0,
                                                            "dark_shift": -1.6},
                     "brush": {"flow": "horizontal"},
                     "layers": [{"id": "polish", "op": "band", "axis": "y", "from": 0.4, "to": 1.01, "ramp": "gold",
                                 "tone": 5.0, "wobble": 0.3},
                                {"id": "scuffs", "op": "wear", "width": 1, "density": 0.25, "ramp": "gold",
                                 "tone": 7.0}]},
    "gold_bright": {"ramp": "gold", "tone": 7.6, "rim": RIM, "brush": {"off": True}, "layers": [GLOSS_S]},
    "gold_nugget": {"ramp": "gold", "tone": 7.0, "rim": {"light": 1, "dark": 1, "light_shift": 3.0,
                                                        "dark_shift": -2.6},
                    "brush": {"off": True}},
    "gold": {"ramp": "gold", "tone": 6.0},
    "drip": {"ramp": "gold", "tone": 7, "light": 0.3, "brush": {"off": True}, "art_key": DRIP_KEY},
    "chip": {"ramp": "crack", "tone": 1, "light": 0, "brush": {"off": True}, "art_key": {"x": "tarnish:1"}},
}

# ======================================================================= animation
FEET = ["hoof_l", "hoof_r", "leg_l", "leg_r"]


def arm(s, a=0, out=0, twist=0):
    """Shoulder pitch (- raises forward), abduction (+ out), twist."""
    return side("arm", s, a, twist, out)


def ears(z=0, x=0):
    return add(side("ear", 1, x, 0, z), side("ear", -1, x, 0, z))


ANIM = {}
REST = {}
STEP = 1 / 12           # trembling key spacing (baked at 24 fps, so every key lands on a sample)
LIMBS = ["head", "arm_l", "arm_r", "ear_l", "ear_r", "body"]


def tremble(t0, t1, amp=1.0, seed=0):
    """Strained trembling: every limb shivers on its own random beat, the ears rattling most."""
    tr = []
    for k, p in enumerate(LIMBS):
        a = {"head": 1.6, "arm_l": 1.4, "arm_r": 1.4, "ear_l": 3.0, "ear_r": 3.0, "body": 0.7}[p] * amp
        tr.append(jitter(p, t0, t1, a, step=STEP, axis=[2, 0, 0, 2, 2, 2][k], seed=seed + k))
    return tr


# ---------------------------------------------------------------- idle: frozen solid, straining to move, trembling
L = 2.0
STRAIN = [[0, [0, 0, 0]], [0.5, [0, 0, 0]], [1.1, [-6, 0, 3]], [1.25, [-6, 0, 3]], [1.32, [0, 0, 0], "out"],
          [2.0, [0, 0, 0]]]
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=tremble(0.0, L, 0.8, 1) + [
    keys("arm_r", None, STRAIN), keys("arm_l", None, [[0, [0, 0, 0]], [0.55, [0, 0, 0]], [1.12, [-4, 0, -2]],
                                                       [1.26, [-4, 0, -2]], [1.33, [0, 0, 0], "out"], [2.0, [0, 0, 0]]]),
    keys("head", None, [[0, [0, 0, 0]], [0.4, [0, 0, 0]], [1.15, [-4, 10, 0]], [1.27, [-4, 10, 0]],
                        [1.34, [2, -2, 0], "out"], [1.6, [0, 0, 0]], [2.0, [0, 0, 0]]]),
    keys("body", None, [[0, [0, 0, 0]], [1.15, [0, 0, 0.04]], [1.3, [0, 0, 0]], [2.0, [0, 0, 0]]], ch="scale"),
    ring("ear_l", 1.34, 12, freq=7, decay=6, axis=2), ring("ear_r", 1.34, -12, freq=7, decay=6, axis=2),
])

# ---------------------------------------------------------------- walk: a statue being rocked forward, leg by leg
L = 2.0
#                (u, hip pitch): swing fast, then hold rigid while the body rocks over it
STIFF = [(0.0, -16), (0.12, -16), (0.38, 2), (0.5, 12), (0.58, 12), (0.66, -18), (0.76, -16)]


def stiff_legs(L):
    tr = []
    for s, ph in ((1, 0.0), (-1, 0.5)):
        n = "l" if s > 0 else "r"
        ks = sorted((((u + ph) % 1.0) * L, v) for u, v in STIFF)
        tr.append({"part": f"leg_{n}", "axis": "x", "keys": [[round(t, 4), v] for t, v in ks], "ease": "ease"})
    return tr


# the body rocks onto the planted leg (lifting the other), yaws round it, jolts at each footfall
ROCK = [[0.0, 0], [0.08, -7], [0.3, -7], [0.42, 0], [0.58, 7], [0.8, 7], [0.92, 0], [1.0, 0]]
YAW = [[0.0, 0], [0.12, 8], [0.36, 8], [0.5, 0], [0.62, -8], [0.86, -8], [1.0, 0]]
JOLT = [[0.0, 0], [0.3, 0], [0.34, 3, "out"], [0.42, 0], [0.8, 0], [0.84, 3, "out"], [0.92, 0], [1.0, 0]]
ANIM["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=stiff_legs(L) + [
    keys("body", "z", [[u * L, v] for u, v in ROCK[:-1]] + [[L, 0]], ease="ease"),
    keys("body", "y", [[u * L, v] for u, v in YAW], ease="ease"),
    keys("body", "x", [[k[0] * L] + k[1:] for k in JOLT], ease="ease"),
    keys("head", "x", [[k[0] * L, -k[1] * 2] + k[2:] for k in JOLT], ease="ease"),
    keys("head", "z", [[u * L, -v * 0.6] for u, v in ROCK[:-1]] + [[L, 0]], ease="ease"),
    # the arms barely move: a stiff little swing in jerks, a rattle at every footfall
    keys("arm_l", "x", [[0, 0], [0.24, -6], [0.6, -6], [0.68, 6, "out"], [1.6, 6], [1.68, 0, "out"], [2.0, 0]],
         ease="ease"),
    keys("arm_r", "x", [[0, 0], [0.24, 6], [0.6, 6], [0.68, -6, "out"], [1.6, -6], [1.68, 0, "out"], [2.0, 0]],
         ease="ease"),
    ring("ear_l", 0.68, 14, freq=8, decay=7, axis=2), ring("ear_r", 0.7, -14, freq=8, decay=7, axis=2),
    ring("ear_l", 1.68, 14, freq=8, decay=7, axis=2, end=L), ring("ear_r", 1.7, -14, freq=8, decay=7, axis=2, end=L),
    ring("head", 0.68, 3, freq=9, decay=8, axis=1), ring("head", 1.68, -3, freq=9, decay=8, axis=1, end=L),
] + tremble(0.0, L, 0.5, 20))

# ---------------------------------------------------------------- barter: a creaky, jerky raise to admire the gold
UP1 = add(arm(1, -22, -2, -8), r("head", 8, 4))
UP2 = add(arm(1, -42, -4, -18), r("head", 16, 8), ears(6))
ADMIRE = add(arm(1, -62, -6, -30), r("head", 28, 10, -6), ears(18), arm(-1, -8, 6), r("body", 2, 6))
ANIM["barter"] = timeline(2.0, [
    (0.0, REST, None), (0.14, UP1, "out"), (0.3, UP1, None), (0.42, UP2, "out"), (0.56, UP2, None),
    (0.68, ADMIRE, "out_back"), (1.36, add(ADMIRE, r("head", -6, 8, 8)), "ease"), (1.52, UP2, "out"),
    (1.68, UP2, None), (1.82, UP1, "out"), (2.0, REST, "out")],
    extra=[shake("arm_l", 0.75, 1.4, 2.5, freq=11, axis=2), shake("head", 0.75, 1.4, 2.5, freq=11, axis=2),
           ring("ear_l", 0.68, 14, freq=8, decay=6, axis=2), ring("ear_r", 0.7, -14, freq=8, decay=6, axis=2),
           ring("arm_l", 0.14, 4, freq=10, decay=10, axis=0), ring("arm_l", 0.42, 4, freq=10, decay=10, axis=0),
           ring("arm_l", 1.52, -4, freq=10, decay=10, axis=0), ring("arm_l", 1.82, -4, freq=10, decay=10, axis=0)]
    + tremble(0.0, 2.0, 0.5, 40))

# ---------------------------------------------------------------- hurt_groan: jolted back, a shuddering groan, a sag
JOLT_B = add(r("body", -10), r("head", -26, 0, -6), arm(1, -24, 26), arm(-1, -20, 26), ears(26),
             side("leg", 1, -6), side("leg", -1, 6))
SAG = add(r("body", 8, 0, 3), r("head", 22, -6, 8), arm(1, -12, -4), arm(-1, -14, -6), ears(-14),
          sc("body", 0.03, -0.04, 0.03))
ANIM["hurt_groan"] = timeline(1.0, [
    (0.0, REST, None), (0.07, JOLT_B, "out"), (0.36, add(JOLT_B, r("head", 6)), "ease"), (0.56, SAG, "ease"),
    (0.74, add(SAG, r("head", -6), r("body", -2)), "out"), (0.84, add(SAG, r("head", -12), r("body", -4)), None),
    (1.0, REST, "out")],
    extra=[shake("body", 0.1, 0.5, 2.5, freq=12, axis=2), shake("head", 0.1, 0.55, 4.0, freq=12, axis=1),
           shake("arm_l", 0.1, 0.5, 4, freq=12, axis=2), shake("arm_r", 0.1, 0.5, -4, freq=12, axis=2),
           ring("ear_l", 0.07, 20, freq=7, decay=5, axis=2), ring("ear_r", 0.08, -20, freq=7, decay=5, axis=2)])

spec = {
    "name": "Golden Piglin",
    "description": "The Winterworks Golden Piglin: a Piglin turned to solid gold, alive and in pain: polished and "
                   "tarnished gold, cracks, frozen drips, nuggets bubbling out, a gold-crusted pauldron, a face frozen "
                   "in a grimace. Vanilla piglin proportions; Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 1200, "colors": 64},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 24},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#2a1f2e", "hero": [-36, 16], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "golden_piglin.json")
    rest_on_ground(R.P, 1, FEET)
    ground_lock(spec, "body", FEET)
    dump(spec, out)
