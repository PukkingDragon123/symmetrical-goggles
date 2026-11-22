"""Builds examples/endling.json: the Endling (Winterworks, The Living End).

    python examples/src/endling.py examples/endling.json

A tiny, cute Enderman-like creature: a black velvet body no bigger than a fist, no arms, two very long thin legs
(thigh, shin and a little pointed foot), and a big round head (three overlapping boxes, so it reads as a rounded
loaf) with two large glowing violet eyes, a small jaw that drops open, a velvet ruff at the neck and violet ender
motes drifting in the velvet. A `head_plant` locator sits on the crown, where the game draws a flower or plant.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). About 7 x 15 x 7 px; faces +Z, ground at y = 0, "left" is
+X; the root (body) pivots between the hips.

Contract (mods/winterworks/docs/END_UPDATE.md section 8): bones body, head, jaw, leg_l, leg_r, head_plant (locator).
Extra joints: shin_l/r (knees), foot_l/r, eye_l/r (blinks scale them). Clips: idle, walk, run, hop (0.5 s), sit (loop),
teleport (0.4 s), sacrifice (1.2 s). Glow: the eyes (ramp eyeglow).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (DENSITY, LR, M, ROOT, Rig, add, check_art, finish, jitter, keys, locks, osc,  # noqa: E402
                     pos, r, ramps, ring, sc, shake, timeline)

R = Rig(density=DENSITY, bone_style="velvet")
part, bone, card, wpos = R.part, R.bone, R.card, R.wpos

HIP_Y = 7.0
# ======================================================================= body: a small velvet torso between the hips
part("body", None, [3.5, 3, 2.5], "velvet_body", at=(0, HIP_Y, 0), centre=(0, HIP_Y + 1.4, 0))
part("belly", "body", [3, 1.5, 3], "velvet_body", centre=(0, HIP_Y + 0.6, 0.05))
card("ruff", "body", locks(9, 3, 5, up=True, min_len=0.6), "velvet_card", at=(0, HIP_Y + 2.7, 1.3),
     offset=(0, 0.5, 0), plane="xy", rot=(-12, 0, 0))
card("ruff_back", "body", locks(9, 3, 6, up=True, min_len=0.6), "velvet_card", at=(0, HIP_Y + 2.7, -1.3),
     offset=(0, 0.5, 0), plane="xy", rot=(12, 0, 0))

# ======================================================================= head: big and round, two large glowing eyes
HY = HIP_Y + 2.9           # neck joint
part("head", "body", [6.5, 4.5, 5.5], "velvet_head", at=(0, HY, 0), centre=(0, HY + 2.85, 0.2))
part("head_tall", "head", [5.5, 5.5, 5.5], "velvet_head", centre=(0, HY + 2.85, 0.2))
part("head_long", "head", [5.5, 4.5, 6.5], "velvet_face", centre=(0, HY + 2.85, 0.2))
for s in (1, -1):
    n = LR(s)
    part(f"eye_{n}", "head", [2, 2, 0.5], "eye", centre=M((1.3, HY + 3.15, 3.6), s), rot=(0, s * -6, 0))
    part(f"cheek_{n}", "head", [1.5, 1, 0.5], "velvet_face", centre=M((2.05, HY + 1.6, 3.4), s))
# the small jaw: hinged at the back of the head's underside, a dark mouth line inside
part("jaw", "head", [3.5, 1, 3], "jaw", at=(0, HY + 1.6, 0.5), centre=(0, HY + 1.1, 2.0))
bone("head_plant", "head", at=(0, HY + 5.6, 0.2))

# ======================================================================= legs: very long and thin, a knee, a pointed foot
FEET = []
for s in (1, -1):
    n = LR(s)
    part(f"leg_{n}", "body", [1, 4, 1], "velvet_leg", at=M((0.95, HIP_Y + 0.3, 0), s), offset=(0, -1.75, 0))
    part(f"shin_{n}", f"leg_{n}", [1, 3.5, 1], "velvet_leg", at=M((0.95, HIP_Y - 3.3, 0), s), offset=(0, -1.6, 0))
    part(f"foot_{n}", f"shin_{n}", [1.5, 0.5, 2.5], "velvet_foot", at=M((0.95, HIP_Y - 6.6, 0), s),
         centre=M((0.95, HIP_Y - 6.75, 0.5), s))
    FEET.append(f"foot_{n}")

# ======================================================================= palette and paint
RAMPS = ramps(
    "eyeglow", "chorus",
    # black velvet: violet-black shadows, a cool violet sheen on the lit nap
    velvet=["#040207", "#0a0610", "#100a19", "#171023", "#1f162e", "#281d3a", "#322447", "#3e2d56", "#4b3766",
            "#5b4478"],
)
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.7, "gradient": 0.5, "ao": 0.6, "ao_height": 4.0}
brush = {"flow": "vertical", "length": 1.2, "width": 0.5, "rough": 0.55, "overshoot": 0.25,
         "textures": {"velvet": "fur"}}

NAP = {"id": "nap", "op": "noise", "scale": 0.6, "amount": 0.7}
SHEEN = {"id": "sheen", "op": "spots", "count": 3, "radius": [0.5, 0.9], "stretch": [1, 0.5, 1], "shift": 1.3,
         "faces": ["top", "front"], "roughness": 0.5}
MOTES = {"id": "motes", "op": "spots", "count": 3, "radius": [0.25, 0.3], "ramp": "chorus", "tone": 5.5,
         "post": True, "faces": ["sides", "top"], "min_gap": 1.0}
RIM = {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -0.8}

styles = {
    "velvet_body": {"ramp": "velvet", "tone": 3.0, "rim": RIM, "layers": [NAP, SHEEN, dict(MOTES, count=3)]},
    "velvet_head": {"ramp": "velvet", "tone": 3.4, "rim": RIM, "brush": {"flow": "horizontal"},
                    "layers": [NAP, dict(SHEEN, count=4), MOTES,
                               {"id": "crown_sheen", "op": "band", "axis": "y", "from": 0.7, "to": 1.01, "shift": 0.8,
                                "wobble": 0.3, "faces": ["sides"]}]},
    "velvet_face": {"ramp": "velvet", "tone": 2.8, "rim": RIM, "brush": {"flow": "horizontal"},
                    "layers": [NAP, dict(MOTES, count=2, faces=["sides", "top", "-front"])]},
    "jaw": {"ramp": "velvet", "tone": 3.4, "rim": RIM, "brush": {"off": True},
            "layers": [{"id": "mouth", "op": "fill", "ramp": "velvet", "tone": 0.3, "faces": ["top"]}],
            "stamps": [{"face": "front", "at": "top-left", "art": [".mmmmm.", "......."], "key": {"m": "velvet:1"}}]},
    # the eyes: large glowing violet, a dark slit pupil low inside, a big catchlight
    "eye": {"ramp": "eyeglow", "tone": 3.2, "light": 0.3, "brush": {"off": True},
            "rim": {"light": 1, "dark": 0, "light_shift": 1.0},
            "layers": [{"id": "lower", "op": "gradient", "axis": "y", "amount": -1.0}],
            "stamps": [{"face": "front", "at": "top-left", "art": [".WW.", "Ww..", "....", ".pp."],
                        "key": {"W": "eyeglow:6", "w": "eyeglow:5", "p": "eyeglow:1"}}]},
    "velvet_leg": {"ramp": "velvet", "tone": 2.8, "rim": RIM, "brush": {"flow": "y"},
                   "layers": [NAP, {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.8}]},
    "velvet_foot": {"ramp": "velvet", "tone": 2.2, "rim": RIM, "brush": {"off": True}},
    "velvet_card": {"ramp": "velvet", "tone": 5, "light": 0.2, "brush": {"off": True},
                    "art_key": {"t": "velvet:6", "m": "velvet:4", "f": "velvet:3"}},
    "velvet": {"ramp": "velvet", "tone": 4},
}

# ======================================================================= animation
REST = {}


def legs(s, hip=0, knee=0, ankle=0, out=0):
    n = LR(s)
    return add(r(f"leg_{n}", hip, 0, s * out), r(f"shin_{n}", knee), r(f"foot_{n}", ankle))


def blink(t, dur=0.12):
    """Both eyes squeeze shut (scale y) and open again."""
    k = [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + dur * 0.4, [0, -0.85, 0]], [t + dur * 0.6, [0, -0.85, 0]],
         [t + dur, [0, 0, 0]]]
    return [keys("eye_l", None, k, ch="scale"), keys("eye_r", None, k, ch="scale")]


ANIM = {}
# idle: a gentle breath, the big head bobbling and tilting curiously, a blink, the jaw working, weight shifting
L = 3.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
    osc("body", None, [0.04, -0.03, 0.04], 2, 0.0, ch="scale"),
    osc("head", "z", 7, 1, 0.1), osc("head", "x", -3, 2, 0.3), osc("head", "y", 10, 1, 0.55),
    keys("head", "z", [[0, 0], [1.6, 0], [1.8, 12, "out"], [2.3, 12], [2.6, 0]]),
    osc("jaw", "x", 4, 3, 0.0, bias=4, shape="pulse"),
    osc("body", "z", 2.5, 1, 0.35),
    osc("leg_l", "z", -2.5, 1, 0.35), osc("leg_r", "z", -2.5, 1, 0.35),
] + blink(0.9) + blink(2.35))

# walk: long, careful stalking strides; the knee folds on the swing; the head bobs twice a stride, lagging
L = 1.0
STRIDE = [(0.0, (-26, 6, 8)), (0.25, (-6, 34, -8)), (0.5, (24, 4, -10)), (0.75, (6, 12, 0))]


def stride(L, table, ph=0.0, scale=1.0):
    tr = []
    for s, sh in ((1, 0.0), (-1, 0.5)):
        n = LR(s)
        for j, nm in enumerate(("leg", "shin", "foot")):
            ks = sorted(((((u + sh + ph) % 1.0) * L), [v[j] * scale, 0, 0]) for u, v in table)
            tr.append({"part": f"{nm}_{n}", "channel": "rotation", "keys": [[round(t, 4), v] for t, v in ks],
                       "ease": "smooth"})
    return tr


ANIM["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=stride(L, STRIDE) + [
    osc("body", "z", 4, 1, 0.0), osc("body", "y", 6, 1, 0.25), osc("body", "x", 3, 2, 0.1, bias=2),
    osc("head", "z", -6, 1, 0.12), osc("head", "x", -4, 2, 0.2), osc("head", "y", -5, 1, 0.35),
    osc("jaw", "x", 3, 2, 0.4, bias=3),
])

# run: a bounding scamper, leaning forward, legs flung wide, the head trailing and bouncing
L = 0.6
RUN = [(0.0, (-44, 10, 14)), (0.25, (-14, 64, -10)), (0.5, (40, 10, -24)), (0.75, (12, 22, 0))]
ANIM["run"] = timeline(L, [(0.0, r("body", 14), None), (L, r("body", 14), None)], loop=True,
                       lift=[[0, 0], [0.1, 0.9], [0.25, 0], [0.4, 0.9], [0.55, 0], [0.6, 0]],
                       extra=stride(L, RUN) + [
    osc("body", "z", 6, 1, 0.0), osc("body", "x", 4, 2, 0.15),
    osc("head", "x", -8, 2, 0.3, bias=-6), osc("head", "z", -8, 1, 0.15),
    osc("body", None, [0.05, -0.06, 0.05], 2, 0.1, ch="scale"),
    osc("jaw", "x", 6, 2, 0.4, bias=6),
])

# hop: a happy little bounce: crouch, spring up stretched with the head thrown back and the jaw open, a squashy
# landing, a wiggle
CROUCH = add(legs(1, -38, 72, -34), legs(-1, -38, 72, -34), r("body", 10), r("head", 10), sc("body", 0.08, -0.08, 0.08))
SPRING = add(legs(1, 10, 6, 20), legs(-1, 10, 6, 20), r("body", -8), r("head", -18, 0, 8), r("jaw", 16),
             sc("body", -0.06, 0.12, -0.06), sc("eye_l", 0, -0.4, 0), sc("eye_r", 0, -0.4, 0))
LAND = add(legs(1, -30, 60, -30), legs(-1, -30, 60, -30), r("body", 8), r("head", 14, 0, -6),
           sc("body", 0.1, -0.1, 0.1))
ANIM["hop"] = timeline(0.5, [(0.0, REST, None), (0.1, CROUCH, "out"), (0.2, SPRING, "out"),
                             (0.3, add(SPRING, legs(1, -8, 12, 0), legs(-1, -8, 12, 0)), "ease"),
                             (0.38, LAND, "in"), (0.5, REST, "out_back")],
                       lift=[[0, 0], [0.16, 0], [0.24, 3.5, "out"], [0.3, 3.6], [0.38, 0, "in"], [0.5, 0]],
                       extra=[ring("head", 0.38, 10, freq=8, decay=8, axis=2, end=0.5)])

# sit: folded down on its bottom, long legs stuck out in front with the knees up, swaying its head contentedly
SIT = add(legs(1, -82, 58, 20, -8), legs(-1, -82, 58, 20, -8), r("body", -10), r("head", 6))
L = 3.0
ANIM["sit"] = timeline(L, [(0.0, SIT, None), (L, SIT, None)], loop=True, extra=[
    osc("head", "z", 9, 1, 0.0), osc("head", "x", -4, 2, 0.2), osc("body", "z", 3, 1, 0.1),
    osc("body", None, [0.04, -0.03, 0.04], 2, 0.0, ch="scale"),
    osc("shin_l", "x", 6, 1, 0.2), osc("shin_r", "x", 6, 1, 0.7),
    osc("foot_l", "x", 10, 2, 0.1), osc("foot_r", "x", 10, 2, 0.6),
] + blink(1.4))

# teleport: squashes, stretches up thin, shrinks to a speck in a shiver, and pops back with an overshoot
ANIM["teleport"] = timeline(0.4, [
    (0.0, REST, None),
    (0.07, add(sc("body", 0.25, -0.25, 0.25), legs(1, -20, 40, -20), legs(-1, -20, 40, -20)), "out"),
    (0.15, add(sc("body", -0.55, 0.7, -0.55), r("head", -10)), "in"),
    (0.22, add(sc("body", -0.9, -0.6, -0.9)), "in"),
    (0.3, sc("body", 0.15, 0.15, 0.15), "out"),
    (0.4, REST, "ease")],
    extra=[jitter("body", 0.1, 0.24, 6.0, step=0.025, axis=1, seed=3)])

# sacrifice: it floats up, legs dangling, gazes up with wide eyes, trembles brighter and brighter, then bursts into
# light (shrinks away to nothing)
GAZE = add(r("head", -22), r("jaw", 14), legs(1, 12, 10, 30, 6), legs(-1, 12, 10, 30, 6),
           sc("eye_l", 0.3, 0.3, 0), sc("eye_r", 0.3, 0.3, 0), sc("body", -0.04, 0.08, -0.04))
ANIM["sacrifice"] = timeline(1.2, [
    (0.0, REST, None), (0.5, GAZE, "ease"), (0.85, add(GAZE, r("head", -8), sc("body", 0.08, 0.08, 0.08)), "ease"),
    (1.0, add(GAZE, sc("body", 0.35, 0.35, 0.35)), "out"), (1.2, add(GAZE, sc("body", -0.97, -0.97, -0.97)), "in")],
    lift=[[0, 0], [0.5, 4.0], [0.85, 6.0], [1.2, 7.5]],
    extra=[shake("body", 0.5, 1.0, 5.0, freq=14, axis=2), shake("head", 0.55, 1.0, 4.0, freq=12, axis=1)])

spec = {
    "name": "Endling",
    "description": "The Winterworks Endling: a tiny, cute Enderman-like creature: a black velvet body, no arms, two "
                   "very long thin legs, a big round head with large glowing violet eyes and a small jaw, a "
                   "head_plant locator on the crown. Minecraft pixel units, density 2: exports 1:1 to a vanilla "
                   "entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 600, "colors": 64},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 24, "glow_ramps": ["eyeglow"]},
    "anim_ground_tolerance": 0.3,
    "render": {"background": "#5d6a4e", "hero": [32, 16], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "endling.json")
    finish(spec, out, root="body")
