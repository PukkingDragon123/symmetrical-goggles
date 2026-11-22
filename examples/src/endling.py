"""Builds examples/endling.json: the Endling (Winterworks, The Living End).

    python examples/src/endling.py examples/endling.json

A tiny, cute Enderman-like creature in vanilla style: a big square head (a skull over a jaw that drops open, like
the enderman's), two wide glowing violet eyes under raised brows, a small black body, no arms and two long legs
(thigh, shin and a little flat foot). Enderman black, lit violet-grey along its top edges, with a few violet motes in
the nap. A `head_plant` locator sits on the crown, where the game draws a flower or plant.

Units are Minecraft pixels (16 per block), density 1 (one texel per pixel, like vanilla): every box is whole pixels,
so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). About 8 x 16 x 8 px; faces +Z,
ground at y = 0, "left" is +X; the root (body) pivots between the hips.

Contract (mods/winterworks/docs/END_UPDATE.md section 8): bones body, head, jaw, leg_l, leg_r, head_plant (locator).
Extra joints: shin_l/r (knees), foot_l/r, eye_l/r (the flat eyes, cards a hair in front of the face; blinks scale
them). Clips: idle, walk, run, hop (0.5 s), sit (loop), teleport (0.4 s), sacrifice (1.2 s). Glow: the eyes (ramp
eyeglow).

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/endling.json --mod mods/winterworks --modid winterworks \
        --package dev.lowpix.winterworks.client.lowpix -o out/endling
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import (DENSITY, EPS, LIGHT, LR, M, ROOT, Rig, add, finish, jitter, keys, osc,  # noqa: E402
                             pos, r, ramps, ring, sc, shake, skin, timeline)

R = Rig(density=DENSITY, bone_style="ender")
part, bone, card = R.part, R.bone, R.card

HIP_Y = 7
# flat eyes (image left = the model's right): a bright violet glint up and in, the iris below, lit low
EYE_L = ["eW", "Ee"]
EYE_R = ["We", "eE"]
# ======================================================================= body: a small black torso between the hips
part("body", None, [4, 3, 3], "ender_body", at=(0, HIP_Y, 0), centre=(0, HIP_Y + 1.5, 0))

# ======================================================================= head: a big square skull over a dropping jaw
NECK = HIP_Y + 3
part("head", "body", [8, 4, 7], "ender_head", at=(0, NECK, 0), centre=(0, NECK + 4, 0.5))
# the jaw: the head's lower two rows, hinged at the back of the skull's underside, so it drops open like an enderman's
part("jaw", "head", [8, 2, 7], "ender_jaw", at=(0, NECK + 2, -3), centre=(0, NECK + 1, 0.5))
# the flat eyes: 2 x 2 glowing cards a hair in front of the face, pivoting at their middle (blinks squash them)
for s in (1, -1):
    n = LR(s)
    card(f"eye_{n}", "head", EYE_L if s > 0 else EYE_R, "eye", at=M((2.0, NECK + 3.0, 4.0 + EPS), s), plane="xy")
bone("head_plant", "head", at=(0, NECK + 6, 0.5))

# ======================================================================= legs: long, a knee, a flat little foot
for s in (1, -1):
    n = LR(s)
    part(f"leg_{n}", "body", [2, 3, 2], "ender_leg", at=M((1, HIP_Y, 0), s), offset=(0, -1.5, 0))
    part(f"shin_{n}", f"leg_{n}", [2, 3, 2], "ender_leg", at=M((1, HIP_Y - 3, 0), s), offset=(0, -1.5, 0))
    part(f"foot_{n}", f"shin_{n}", [2, 1, 3], "ender_foot", at=M((1, 1, 0), s), centre=M((1, 0.5, 0.5), s))

# ======================================================================= palette and paint
RAMPS = ramps("ender", "eyeglow", "chorus")
light = dict(LIGHT)

# a few violet motes drifting in the nap
MOTES = {"id": "motes", "op": "spots", "count": 2, "radius": [0.3, 0.45], "ramp": "chorus", "tone": 4.0,
         "post": True, "faces": ["sides", "top"], "min_gap": 2.0}
# the head's front: raised brows over the eyes (lit nap), a lighter cheek line, the face otherwise plain black
FACE = {"face": "front", "at": "top-left", "art": ["b......b", ".bb..bb.", "........", "c......c"],
        "key": {"b": "ender:8", "c": "ender:5"}}
styles = {
    "ender_body": skin("ender", 2.6, grain=1.0, lip=1.6, shade=-0.8, layers=[MOTES]),
    "ender_head": skin("ender", 2.8, grain=1.0, lip=1.8, shade=-0.8, stamps=[FACE],
                       layers=[dict(MOTES, count=3, faces=["sides", "top", "back", "-front"])]),
    # the jaw: a dark lip line along its front's top row, the mouth's inside (its top) deep violet
    "ender_jaw": skin("ender", 2.4, grain=0.9, lip=1.2, shade=-0.8,
                      layers=[{"id": "mouth", "op": "fill", "ramp": "chorus", "tone": 1.2, "faces": ["top"]}],
                      stamps=[{"face": "front", "at": "top-left", "art": ["..mmmm..", "...ll..."],
                               "key": {"m": "chorus:1", "l": "ender:5"}}]),
    "ender_leg": skin("ender", 2.4, grain=0.9, lip=1.4, shade=-0.8),
    "ender_foot": skin("ender", 2.0, grain=0.8, lip=1.2, shade=-0.6, dark_low=0),
    "eye": {"ramp": "eyeglow", "tone": 3, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "art_key": {"W": "eyeglow:6", "E": "eyeglow:4", "e": "eyeglow:2"}},
    "ender": {"ramp": "ender", "tone": 3},
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
    "description": "The Winterworks Endling: a tiny, cute Enderman-like creature in vanilla style: a big square "
                   "head with a dropping jaw, two flat glowing violet eyes under raised brows, a small black body, "
                   "no arms, two long legs; a head_plant locator on the crown. Minecraft pixel units, density 1: "
                   "exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 400, "colors": 40},
    "light": light,
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
