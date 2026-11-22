"""Builds examples/gucker.json: the Gucker (Winterworks, The Living End).

    python examples/src/gucker.py examples/gucker.json

A big salamander-like ambush predator of the outer End, in vanilla style: a long, low, heavy box of a body on four
splayed legs with broad flat feet; a wide flat head with a grumpy underbite (a row of pale teeth standing up from the
lower jaw, short fangs hanging from the upper lip), two small eye domes on top with flat glowing yellow eyes under
heavy lids, like a frog's; a pale throat sac under the jaw that inflates into a balloon before it spits. Along the
spine runs a ridge of five breathing holes (the vents), each a dark hole with a faint violet glow inside. A thick
three-segment tail with a low fin. The hide is pale end-stone grey-violet with darker violet-grey saddle blotches and
a cream belly, so a burrowed Gucker is hard to tell from end stone.

Units are Minecraft pixels (16 per block), density 1 (one texel per pixel, like vanilla): every box is whole pixels,
so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). About 30 px across the feet and 52 px
long; faces +Z, ground at y = 0, "left" is +X; the root (body) pivots in the middle of the torso.

Contract (mods/winterworks/docs/END_UPDATE.md section 7): bones body, head, jaw, throat (the sac; it pivots at its top
centre, under the jaw, so scaling swells it down and out), vents (the breathing-hole ridge, with vent_0..4), tail_0,
tail_1, tail_2, leg_fl, leg_fr, leg_bl, leg_br. Extra joints: fore_* (forearms), foot_* (feet), eye_l/r (the eye
domes). Clips: idle, walk, run, burrowed (loop: sunk in the ground to the back, 9 px down), emerge (0.8 s), bite
(0.5 s), inflate (1.2 s, ends inflated and holds), spit (0.5 s, starts inflated). Glow: the eyes (ramp gleye) and the
vents (ramp ventglow).

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/gucker.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/gucker
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import (DENSITY, LIGHT, LR, M, ROOT, Rig, add, card_style, chain_pose, cycle,  # noqa: E402
                             finish, keys, limb, osc, pos, r, ramps, ring, sc, shake, skin, timeline, wave)

R = Rig(density=DENSITY, bone_style="hide")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= torso: one long, low, heavy box
part("body", None, [14, 7, 18], "hide_body", at=(0, 7, 0), centre=(0, 7, 0))
# the breathing holes: a low ridge along the spine with five raised vents
part("vents", "body", [4, 1, 14], "hide_ridge", at=(0, 10.5, 0), centre=(0, 11, -0.5))
for k, z in enumerate((5.0, 2.5, 0.0, -2.5, -5.0)):
    part(f"vent_{k}", "vents", [3, 1, 2], "vent", centre=(0, 12, z - 0.5))

# ======================================================================= head: wide and flat, an underbite, eye domes
part("head", "body", [14, 4, 10], "hide_head", at=(0, 7.5, 9), centre=(0, 8.5, 14))
for s in (1, -1):
    n = LR(s)
    part(f"eye_{n}", "head", [3, 2, 3], "eye_dome", at=M((4.5, 10.5, 13.5), s), centre=M((4.5, 11.5, 13.5), s))
# the lower jaw: hinged at the back of the head, its front standing a pixel proud of the upper lip
part("jaw", "head", [13, 2, 10], "hide_jaw", at=(0, 6.5, 10), centre=(0, 5.5, 15))
part("throat", "jaw", [8, 2, 7], "sac", at=(0, 4.5, 14.5), centre=(0, 3.5, 14.5))

# ======================================================================= tail: three thick segments and a low fin
part("tail_0", "body", [10, 6, 8], "hide_tail", at=(0, 7.5, -9), offset=(0, -0.5, -4), rot=(4, 8, 0))
part("tail_1", "tail_0", [7, 4, 8], "hide_tail", rel=(0, -0.5, -8), offset=(0, 0, -4), rot=(-2, -16, 0))
part("tail_2", "tail_1", [5, 3, 8], "hide_tail", rel=(0, -0.3, -8), offset=(0, 0, -4), rot=(-4, -14, 0))
card("tail_1_fin", "tail_1", ["..ffff.ff.", ".fmmmmfmmf", "fmmmmmmmmf"], "fin", rel=(0, 2.0, -4), offset=(0, 1.5, 0),
     plane="yz")
card("tail_2_fin", "tail_2", ["..fff.ff.", ".fmmmfmmf", "fmmmmmmmf"], "fin", rel=(0, 1.5, -4), offset=(0, 1.5, 0),
     plane="yz")

# ======================================================================= legs: splayed, elbows out, broad flat feet
LEGS = {  # name: shoulder (left), upper-arm dir, forearm dir, foot yaw (left)
    "f": ((6.5, 7.0, 6.0), (1.0, -0.2, 0.18), (0.18, -1.0, 0.2), 22),
    "b": ((6.5, 7.0, -6.0), (1.0, -0.2, -0.22), (0.18, -1.0, -0.12), 58),
}
FEET = []
for k, (sh, d0, d1, yaw) in LEGS.items():
    for s in (1, -1):
        n = LR(s)
        lid = f"leg_{k}{n}"
        sh_w = np.array(M(sh, s), float)
        elbow = sh_w + np.array(M(d0, s)) / np.linalg.norm(d0) * 5
        e = limb(R, lid, "body", sh_w, elbow, 4, "hide_leg", depth=4)
        drop = (e[1] - 1.0) / abs(d1[1] / np.linalg.norm(d1))
        wrist = e + np.array(M(d1, s)) / np.linalg.norm(d1) * round(drop)
        w = limb(R, f"fore_{k}{n}", lid, e, wrist, 3, "hide_leg")
        fid = f"foot_{k}{n}"
        part(fid, f"fore_{k}{n}", [5, 1, 6], "hide_foot", at=w, centre=(w[0] + s * 0.5, 0.5, w[2] + 1.0),
             wrot=(0, s * yaw, 0))
        FEET.append(fid)

# ======================================================================= palette and paint
RAMPS = ramps(
    "chorus",
    # pale end-stone cream, greyed toward the hide: belly, soles, teeth
    pale=["#2a2722", "#3f3b33", "#555046", "#6c675a", "#837e6f", "#9b9685", "#b2ad9b", "#c8c4b1", "#dbd8c6",
          "#ecead9"],
    # pale grey-violet hide
    hide=["#17141c", "#241f2a", "#332d3a", "#433c4b", "#554d5d", "#685f6f", "#7c7382", "#918895", "#a79ea9", "#bdb5bd",
          "#d2ccd0", "#e6e2e2"],
    # the throat sac and mouth: thin pale lilac-pink skin
    sac=["#3d2236", "#5a3350", "#7a476b", "#9a5f86", "#b77ba0", "#d09bb9", "#e4bdd1", "#f3dde8"],
    # glowing eyes: pale end-stone gold
    gleye=["#5a4a08", "#8f7a10", "#c4ab1c", "#e8d23a", "#fbef7a", "#fffbd0"],
    # the faint violet glow deep in the breathing holes
    ventglow=["#2b0e3d", "#40145a", "#5a1e7b", "#76299c"],
)
light = dict(LIGHT, ao_height=6.0)

# darker violet-grey saddle blotches over the back, a cream end-stone belly, a few violet speckles
SADDLE = {"id": "saddle", "op": "patches", "scale": 2.2, "threshold": 0.56, "shift": -1.8, "octaves": 2,
          "faces": ["top", "sides", "front", "back"], "bevel": {"shadow": 1, "highlight": 0, "shadow_shift": -0.8}}
BELLY = {"id": "belly", "op": "band", "axis": "y", "from": -1.01, "to": -0.5, "ramp": "pale", "tone": 7.0,
         "wobble": 0.25, "faces": ["sides", "front", "back", "bottom"]}
FRECKLE = {"id": "freckle", "op": "spots", "count": 6, "radius": [0.3, 0.5], "ramp": "chorus", "tone": 4.6,
           "post": True, "min_gap": 2.5, "faces": ["top", "sides"]}
BUMPS = {"id": "bumps", "op": "speckle", "density": 0.02, "shift": 1.4}
HIDE = dict(grain=0.7, grain_scale=0.8, lip=1.4, shade=-1.2)

# the head's face (14 x 4): nostrils on top of the snout row, fangs hanging from the upper lip's corners
FACE = {"face": "front", "at": "top-left",
        "art": ["..............", "...n......n...", "..............", ".yy........yy."],
        "key": {"n": "hide:2", "y": "pale:9"}}
# the jaw's front (13 x 2): a row of pale teeth standing up from the underbite
JAW_FACE = {"face": "front", "at": "top-left", "art": ["y.y.yy.yy.y.y", "............."],
            "key": {"y": "pale:9"}}
# the eye domes: a heavy lid over a flat 2 x 1 glowing eye, on the front and the outer side
EYE = {"faces": ["front", "left", "right"], "at": "top-left", "art": ["kkk", ".YW"],
       "key": {"k": "hide:3", "Y": "gleye:3", "W": "gleye:5"}}

styles = {
    "hide_body": skin("hide", 7.4, layers=[SADDLE, BELLY, BUMPS, FRECKLE], **HIDE),
    "hide_ridge": skin("hide", 6.0, layers=[BUMPS], **HIDE),
    # a raised rim round a dark hole, a faint violet glow deep inside
    "vent": skin("hide", 7.6, grain=0.6, lip=1.8, shade=-1.4, clusters=False, dark_low=0,
                 stamps=[{"face": "top", "at": "top-left", "art": ["kGk", "kgk"],
                          "key": {"k": "hide:1", "g": "ventglow:1", "G": "ventglow:3"}}]),
    "eye_dome": skin("hide", 7.0, grain=0.6, lip=1.6, shade=-1.2, clusters=False, dark_low=0, stamps=[EYE]),
    "hide_head": skin("hide", 7.4, layers=[dict(SADDLE, seed=4), BUMPS, dict(FRECKLE, count=4),
                                           {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.55,
                                            "ramp": "hide", "tone": 4.0, "faces": ["sides"]}],
                      stamps=[FACE], **HIDE),
    "hide_jaw": skin("hide", 5.8, grain=0.7, lip=1.2, shade=-1.0, layers=[
        {"id": "mouth", "op": "fill", "ramp": "sac", "tone": 1.6, "faces": ["top"]},
        {"id": "tongue", "op": "band", "axis": "x", "from": -0.4, "to": 0.4, "ramp": "sac", "tone": 3.4,
         "faces": ["top"]},
        {"id": "chin", "op": "fill", "ramp": "pale", "tone": 6.4, "faces": ["bottom"]}], stamps=[JAW_FACE]),
    # the throat sac: thin pale skin with a couple of darker folds; scaled up it reads as a stretched balloon
    "sac": skin("sac", 5.0, grain=0.8, lip=1.4, shade=-1.2, layers=[
        {"id": "folds", "op": "stripes", "axis": "x", "period": 3.0, "width": 0.2, "shift": -1.0,
         "faces": ["bottom", "front", "back"]}]),
    "hide_tail": skin("hide", 7.2, layers=[dict(SADDLE, seed=7), BELLY, BUMPS, dict(FRECKLE, count=3),
                                           {"id": "rings", "op": "stripes", "axis": "z", "period": 4.5, "width": 0.2,
                                            "shift": -1.2, "faces": ["sides", "top"]}], **HIDE),
    "hide_leg": skin("hide", 7.0, layers=[dict(SADDLE, seed=9), BUMPS,
                                          {"id": "under", "op": "band", "axis": "y", "from": -1.01, "to": -0.4,
                                           "ramp": "pale", "tone": 6.6, "faces": ["sides"]}], **HIDE),
    # broad flat feet: four dark claws on the front edge, pale soles
    "hide_foot": skin("hide", 6.6, grain=0.8, lip=1.4, shade=-1.0, dark_low=0, layers=[
        {"id": "sole", "op": "fill", "ramp": "pale", "tone": 5.0, "faces": ["bottom"]}],
        stamps=[{"face": "top", "at": "bottom-left", "art": ["c.c.c"], "key": {"c": "hide:1"}},
                {"face": "front", "at": "top-left", "art": ["c.c.c"], "key": {"c": "hide:1"}}]),
    "fin": card_style("hide", 6, {"f": "hide:9", "m": "hide:6"}, light=0.3),
    "hide": {"ramp": "hide", "tone": 6},
}

# ======================================================================= animation
REST = {}
TAIL = ["tail_0", "tail_1", "tail_2"]
VENTS = [f"vent_{k}" for k in range(5)]


def leg_dirs(k, s, upper, fore, turn=None):
    """Pose leg k on side s: world directions for the upper arm and forearm, given for the left front leg (hind legs
    mirror front/back, the right side mirrors left/right). The foot stays flat (or turns by `turn`)."""
    def tf(d):
        d = (d[0], d[1], d[2] if k == "f" else -d[2])
        return M(d, s)
    n = LR(s)
    t = None if turn is None else (turn[0] if k == "f" else -turn[0], turn[1] * s, turn[2] * s)
    return chain_pose(R, [f"leg_{k}{n}", f"fore_{k}{n}"], [tf(upper), tf(fore)], keep=[f"foot_{k}{n}"], turn=t)


# one stride of the left front leg (u: 0..1): plant forward, sweep back under load, lift, swing forward
STRIDE = [(0.0, (1.0, -0.2, 0.55), (0.2, -1.0, 0.25), None),
          (0.3, (1.0, -0.25, 0.15), (0.18, -1.0, 0.05), None),
          (0.55, (1.0, -0.22, -0.35), (0.2, -1.0, -0.3), (-20, 0, 0)),
          (0.72, (1.0, 0.25, -0.2), (0.7, -0.7, -0.1), (10, 0, 0)),
          (0.86, (1.0, 0.3, 0.35), (0.6, -0.8, 0.3), (14, 0, 0))]


def gait(L, stride=STRIDE, scale=1.0):
    """Diagonal pairs (front-left with back-right) half a stride apart; rotations keyed per joint."""
    tr = []
    for k in "fb":
        for s in (1, -1):
            ph = (0.0 if (k == "f") == (s > 0) else 0.5)
            poses = [(u, leg_dirs(k, s, up, fo, turn)) for u, up, fo, turn in stride]
            for pid in poses[0][1]:
                tr.append(cycle(pid, L, [(u, [a * scale for a in p[pid]["r"]]) for u, p in poses], ph))
    return tr


def breathe(L, cycles=1, amp=1.0, phase=0.0):
    """Breathing: the torso swells, the throat pulses, the vents puff one after another down the back."""
    return [osc("body", None, [0.02 * amp, 0.03 * amp, 0.01 * amp], cycles, phase, ch="scale"),
            osc("vents", None, [0.04 * amp, 0.5 * amp, 0.02 * amp], cycles, phase + 0.05, ch="scale"),
            osc("throat", None, [0.08 * amp, 0.14 * amp, 0.06 * amp], cycles, phase + 0.1, ch="scale"),
            {"parts": VENTS, "channel": "scale",
             "wave": {"amp": [0.18 * amp, 0.45 * amp, 0.18 * amp], "cycles": cycles, "lag": 0.08, "growth": 1.0,
                      "phase": phase, "shape": "bounce"}}]


ANIM = {}
# idle: slow breathing with puffing vents, the head sweeping and tasting the air, the tail curling lazily
L = 3.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=breathe(L, 2) + [
    osc("head", "y", 9, 1, 0.0), osc("head", "x", -3, 2, 0.2),
    keys("jaw", "x", [[0, 0], [1.9, 0], [2.05, 9, "out"], [2.25, 9], [2.45, 0], [3.0, 0]]),
    wave(TAIL, "y", 7, 1, lag=0.15, growth=1.2, phase=0.1),
    wave(TAIL, "x", -2, 2, lag=0.12),
    osc("body", "y", 2, 1, 0.5),
])

# walk: a heavy sprawling salamander gait, the spine swinging side to side, the head held steady, the tail whipping
L = 1.6
ANIM["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=gait(L) + breathe(L, 1, 0.6) + [
    osc("body", "y", 9, 1, 0.0), osc("body", "z", 3, 1, 0.25),
    osc("head", "y", -8, 1, 0.05), osc("head", "z", -2, 1, 0.3),
    wave(TAIL, "y", -12, 1, lag=0.12, growth=1.25, phase=0.12),
])

# run: the same gait faster and lower, the spine and tail thrashing, the jaw half open
L = 0.8
ANIM["run"] = timeline(L, [(0.0, r("jaw", 10), None), (L, r("jaw", 10), None)], loop=True,
                       extra=gait(L, scale=1.3) + [
    osc("body", "y", 14, 1, 0.0), osc("body", "z", 4, 1, 0.25), osc("body", "x", 3, 2, 0.1),
    osc("head", "y", -12, 1, 0.05), osc("head", "x", -4, 2, 0.3),
    wave(TAIL, "y", -18, 1, lag=0.12, growth=1.25, phase=0.12),
    osc("throat", None, [0.1, 0.18, 0.06], 2, 0.0, ch="scale"),
])

# burrowed: sunk into the ground up to the back, head flat with only the eye domes showing, legs folded flat against
# the flanks, tail curled round; the vents puff dust one after another, the eyes swivel
SINK = 9.0
TUCKED = add(*[leg_dirs(k, s, (0.7, -0.3, -0.6), (0.2, -0.3, -1.0), (0, 0, 0)) for k in "fb" for s in (1, -1)])
BURROWED = add(TUCKED, pos("body", 0, -SINK, 0), r("head", 8), r("tail_0", 0, 14), r("tail_1", 0, 24),
               r("tail_2", 0, 26))
L = 2.0
ANIM["burrowed"] = timeline(L, [(0.0, BURROWED, None), (L, BURROWED, None)], loop=True, lock=False, extra=[
    {"parts": VENTS, "channel": "scale",
     "wave": {"amp": [0.3, 0.9, 0.3], "cycles": 2, "lag": 0.1, "growth": 1.0, "shape": "bounce"}},
    osc("vents", None, [0.05, 0.8, 0.03], 2, 0.0, ch="scale", shape="bounce"),
    osc("eye_l", "y", 14, 1, 0.0), osc("eye_r", "y", 14, 1, 0.0),
    osc("head", "y", 4, 1, 0.25),
    osc("body", None, [0.02, 0.03, 0.01], 2, 0.0, ch="scale"),
])
ANIM["burrowed"]["grounded"] = False

# emerge: a tremor, then it bursts up out of the ground head first, legs flung out, shakes off and settles
UP = add(pos("body", 0, 1.5, 1.0), r("body", -18), r("head", -24), r("jaw", 26),
         *[leg_dirs(k, s, (1.0, 0.1, 0.4), (0.4, -1.0, 0.4)) for k in "fb" for s in (1, -1)],
         r("tail_0", -10, 6), r("tail_1", -6, 10), sc("throat", 0.15, 0.3, 0.1))
ANIM["emerge"] = timeline(0.8, [(0.0, BURROWED, None), (0.15, add(BURROWED, pos("body", 0, -0.6, 0)), "ease"),
                                (0.34, UP, "out"), (0.5, add(UP, r("body", 14), r("head", 18), r("jaw", -20)), "ease"),
                                (0.8, REST, "out")],
                          lock=False, extra=[shake("body", 0.0, 0.18, 3.0, freq=14, axis=1),
                                             shake("body", 0.5, 0.75, 4.0, freq=10, axis=2),
                                             ring("tail_2", 0.5, 16, freq=6, decay=6, axis=1, end=0.8)])
ANIM["emerge"]["grounded"] = False

# bite: rears back with the jaw yawning open, lunges and snaps shut, a vicious head shake, lets go
COCK = add(r("body", -8), pos("body", 0, 0, -1.5), r("head", -26), r("jaw", 44), sc("throat", -0.1, 0.1, 0))
LUNGE = add(r("body", 6), pos("body", 0, 0, 3.5), r("head", 4), r("jaw", 4), sc("body", -0.03, -0.03, 0.06),
            *[leg_dirs("f", s, (1.0, -0.15, 0.7), (0.3, -1.0, 0.6)) for s in (1, -1)],
            r("tail_0", 0, 0, 0), r("tail_1", 8))
ANIM["bite"] = timeline(0.5, [(0.0, REST, None), (0.14, COCK, "out"), (0.22, LUNGE, "in"),
                              (0.36, add(LUNGE, r("head", -4)), "ease"), (0.5, REST, "ease")],
                        extra=[shake("head", 0.22, 0.38, 9, freq=12, axis=1),
                               ring("tail_2", 0.22, 14, freq=7, decay=7, axis=1, end=0.5)])

# inflate: plants itself, raises the head, and the throat sac swells into a balloon in gulps; the vents squeeze shut
# (ends inflated: the game holds the last frame until it spits)
PUFFED = add(r("head", -22), r("body", -6), sc("throat", 0.75, 1.55, 0.5),
             *[leg_dirs("f", s, (1.0, -0.45, 0.3), (0.1, -1.0, 0.15)) for s in (1, -1)],
             sc("vents", 0, -0.5, 0), r("tail_1", 0, 6), r("tail_2", 0, 10))
GULP1 = add(r("head", -10), r("body", -3), sc("throat", 0.25, 0.5, 0.15))
GULP2 = add(r("head", -16), r("body", -4), sc("throat", 0.45, 0.95, 0.3), sc("vents", 0, -0.25, 0))
ANIM["inflate"] = timeline(1.2, [(0.0, REST, None), (0.25, GULP1, "out"), (0.4, add(GULP1, sc("throat", -0.1, -0.2)),
                                                                                  "ease"),
                                 (0.65, GULP2, "out"), (0.78, add(GULP2, sc("throat", -0.08, -0.15)), "ease"),
                                 (1.05, PUFFED, "out_back"), (1.2, PUFFED, "ease")],
                           extra=[shake("throat", 0.9, 1.2, [0.05, 0.08, 0.05], freq=9, ch="scale")])

# spit: from the inflated pose, a recoil, then the head thrusts forward and down with the jaw wide, the sac collapsing
# as the dust ball is blasted out; it shakes its head and settles
THRUST = add(r("head", -12), r("body", 2), pos("body", 0, 0, 2.0), r("jaw", 32), sc("throat", -0.35, -0.5, -0.2),
             sc("vents", 0.1, 0.9, 0.05))
ANIM["spit"] = timeline(0.5, [(0.0, PUFFED, None), (0.1, add(PUFFED, r("head", -8), pos("body", 0, 0, -1.0)), "out"),
                              (0.18, THRUST, "in"), (0.3, add(THRUST, r("jaw", -12)), "ease"), (0.5, REST, "ease")],
                        extra=[shake("head", 0.3, 0.48, 5, freq=10, axis=1)])

spec = {
    "name": "Gucker",
    "description": "The Winterworks Gucker: a big salamander-like End predator in vanilla style: long, low and heavy "
                   "on splayed legs with broad flat feet, a wide flat head with a toothy underbite and flat glowing "
                   "yellow eyes on two domes, an inflatable throat sac, a ridge of glowing breathing holes along the "
                   "back, a thick finned tail; pale grey-violet hide with saddle blotches that blends with end stone. "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 600, "colors": 72},
    "light": light,
    "minecraft": {"fps": 20, "glow_ramps": ["gleye", "ventglow"]},
    "anim_ground_tolerance": 0.3,
    "render": {"background": "#2c2433", "hero": [38, 24], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "gucker.json")
    finish(spec, out, root="body", feet=FEET)
