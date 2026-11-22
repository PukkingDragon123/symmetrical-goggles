"""Builds examples/gucker.json: the Gucker (Winterworks, The Living End).

    python examples/src/gucker.py examples/gucker.json

A big salamander-like ambush predator of the outer End: a long, low, heavy body on four splayed legs with broad
clawed feet; a wide flat head (a jowly back, a rounded snout) with two glowing yellow eyes on top in raised domes,
like a frog's, a lower jaw lined with small teeth that drops open wide, and a pale throat sac hanging under the jaw
that inflates into a balloon before it spits. Along the spine runs a raised ridge of five breathing holes (the
vents), each a puckered rim around a dark hole with a faint violet glow inside. A thick tail in three segments with a
low fin curls behind it in an S. The hide is pale grey-violet, warty and speckled, with end-stone blotches and costal
grooves down the flanks, so a burrowed Gucker is hard to tell from end stone.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). About 29 px across the feet and 55 px long; faces +Z, ground at
y = 0, "left" is +X; the root (body) pivots in the middle of the torso.

Contract (mods/winterworks/docs/END_UPDATE.md section 7): bones body, head, jaw, throat (the sac; it pivots at its top
centre, under the jaw, so scaling swells it down and out), vents (the breathing-hole ridge, with vent_0..4), tail_0,
tail_1, tail_2, leg_fl, leg_fr, leg_bl, leg_br. Extra joints: fore_* (forearms), foot_* (feet), eye_l/r. Clips: idle,
walk, run, burrowed (loop: sunk in the ground to the back, 9 px down), emerge (0.8 s), bite (0.5 s), inflate (1.2 s,
ends inflated and holds), spit (0.5 s, starts inflated). Glow: the eyes (ramp gleye) and the vents (ramp ventglow).
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (DENSITY, LR, M, ROOT, Rig, add, chain_pose, cycle, finish, jitter, keys, limb, locks,  # noqa
                     osc, pos, r, ramps, ring, sc, shake, spikes, teeth, timeline, wave)

R = Rig(density=DENSITY, bone_style="hide")
part, bone, card, wpos = R.part, R.bone, R.card, R.wpos

# ======================================================================= torso: long and low, wider at the belly
part("body", None, [13, 6, 16], "hide_body", at=(0, 7, 0), centre=(0, 7, 0))
part("belly", "body", [14, 2.5, 14], "hide_belly", centre=(0, 5.0, 0))
part("back", "body", [10, 1.5, 14], "hide_back", centre=(0, 10.5, -0.5))
part("shoulders", "body", [12, 5, 4], "hide_body", centre=(0, 7.2, 7.6))
# the breathing holes: a raised ridge along the spine with five puckered vents
part("vents", "body", [3, 0.5, 13], "hide_back", centre=(0, 11.5, -0.5))
for k, z in enumerate((5.0, 2.5, 0.0, -2.5, -5.0)):
    part(f"vent_{k}", "vents", [2.5, 1, 2], "vent", centre=(0, 11.9, z - 0.5))
for s in (1, -1):    # a row of warts along each flank
    for k, (z, y) in enumerate(((5.0, 9.4), (1.0, 9.6), (-3.0, 9.5), (-6.5, 9.2))):
        part(f"wart_{LR(s)}{k}", "body", [1, 1, 1.5], "wart", centre=M((5.9, y, z), s), rot=(0, 0, s * -20))

# ======================================================================= head: wide and flat, eyes on top, a big jaw
part("head", "body", [12, 3.5, 11], "hide_head", at=(0, 7.5, 7.5), centre=(0, 8.0, 13.0))
part("jowls", "head", [13, 3, 5], "hide_head", centre=(0, 7.6, 10.5))
part("snout", "head", [10, 2.5, 1.5], "hide_snout", centre=(0, 7.7, 19.2))
for s in (1, -1):
    n = LR(s)
    part(f"eye_dome_{n}", "head", [3, 2, 3.5], "hide_head", centre=M((4.0, 10.1, 11.6), s))
    part(f"eye_{n}", "eye_dome_" + n, [2.5, 1.5, 3], "eye", centre=M((4.1, 10.75, 11.8), s))
    part(f"brow_{n}", f"eye_dome_{n}", [2, 1, 1], "wart", centre=M((4.0, 11.0, 13.6), s), rot=(-20, 0, 0))
# the lower jaw, hinged at the back of the head; teeth hidden inside the closed mouth
part("jaw", "head", [11.5, 2, 11], "hide_jaw", at=(0, 6.5, 8.0), centre=(0, 5.5, 13.5))
part("chin", "jaw", [9.5, 1.5, 1.5], "hide_jaw", centre=(0, 5.45, 19.25))
card("teeth_up_f", "head", teeth(18, 3, seed=1), "teeth", at=(0, 6.25, 18.3), offset=(0, -0.75, 0), plane="xy")
card("teeth_lo_f", "jaw", [row[::-1] for row in reversed(teeth(16, 3, seed=2))], "teeth", at=(0, 6.5, 18.0),
     offset=(0, 0.75, 0), plane="xy")
for s in (1, -1):
    n = LR(s)
    card(f"teeth_up_{n}", "head", teeth(16, 2, seed=3 + s), "teeth", at=M((5.6, 6.25, 13.5), s), offset=(0, -0.5, 0),
         plane="yz")
    card(f"teeth_lo_{n}", "jaw", list(reversed(teeth(16, 2, seed=5 + s))), "teeth", at=M((5.3, 6.5, 13.0), s),
         offset=(0, 0.5, 0), plane="yz")
# the throat sac: pivots at its top centre under the jaw, so it swells down and out
part("throat", "jaw", [8, 2, 7], "sac", at=(0, 4.6, 12.5), centre=(0, 3.85, 12.5))

# ======================================================================= tail: three thick segments curling in an S, a low fin
part("tail_0", "body", [9, 5, 8], "hide_tail", at=(0, 7.5, -7.5), offset=(0, 0, -4.0), rot=(4, 8, 0))
part("tail_1", "tail_0", [7, 4, 8], "hide_tail", rel=(0, -0.3, -7.5), offset=(0, 0, -4.0), rot=(-2, -16, 0))
part("tail_2", "tail_1", [5, 3, 8.5], "hide_tail", rel=(0, -0.3, -7.5), offset=(0, 0, -4.25), rot=(-4, -14, 0))
card("tail_0_fin", "tail_0", locks(14, 3, 31, up=True, min_len=0.6), "fin", rel=(0, 2.5, -4.0), offset=(0, 0.75, 0),
     plane="yz")
card("tail_1_fin", "tail_1", locks(14, 4, 32, up=True, min_len=0.6), "fin", rel=(0, 2.0, -4.0), offset=(0, 1.0, 0),
     plane="yz")
card("tail_2_fin", "tail_2", locks(16, 4, 33, up=True, min_len=0.5), "fin", rel=(0, 1.5, -4.25), offset=(0, 1.0, 0),
     plane="yz")
card("tail_2_keel", "tail_2", locks(12, 3, 34, min_len=0.5), "fin", rel=(0, -1.5, -5.0), offset=(0, -0.75, 0),
     plane="yz")
card("tail_tip", "tail_2", ["..t.", ".tf.", "tff.", ".tf.", "..t."], "fin", rel=(0, 0, -8.5), offset=(0, 0, -1.0),
     plane="yz")
card("crest", "body", spikes(26, 3, 41), "fin", at=(0, 11.25, -7.0), offset=(0, 0.75, -0.5), plane="yz")

# ======================================================================= legs: splayed, elbows out, broad clawed feet
LEGS = {  # name: shoulder (left), upper-arm dir, forearm dir, foot yaw (left)
    "f": ((5.5, 7.0, 5.5), (1.0, -0.2, 0.18), (0.18, -1.0, 0.2), 22),
    "b": ((5.5, 7.0, -5.5), (1.0, -0.2, -0.22), (0.18, -1.0, -0.12), 62),
}
FEET = []
for k, (sh, d0, d1, yaw) in LEGS.items():
    for s in (1, -1):
        n = LR(s)
        lid = f"leg_{k}{n}"
        sh_w = np.array(M(sh, s), float)
        elbow = sh_w + np.array(M(d0, s)) / np.linalg.norm(d0) * 4.5
        e = limb(R, lid, "body", sh_w, elbow, 3.5, "hide_leg", depth=3.5)
        wrist = e + np.array(M(d1, s)) / np.linalg.norm(d1) * (e[1] - 1.0) / abs(d1[1] / np.linalg.norm(d1))
        w = limb(R, f"fore_{k}{n}", lid, e, wrist, 2.5, "hide_leg")
        fid = f"foot_{k}{n}"
        part(fid, f"fore_{k}{n}", [4, 1, 4.5], "hide_foot", at=w, centre=(w[0] + s * 0.4, 0.5, w[2]),
             wrot=(0, s * yaw, 0))
        FEET.append(fid)
        for t, (dx, ty) in enumerate(((-1.5, -26), (-0.5, -8), (0.5, 8), (1.5, 26))):
            tid = f"toe_{k}{n}{t}"
            part(tid, fid, [1, 0.5, 2.5], "toe", rel=(dx, -0.75, 2.0), offset=(0, 0, 1.0), rot=(0, ty, 0))
            card(f"claw_{k}{n}{t}", tid, ["c", "C"], "claw", rel=(0, 0, 2.5), offset=(0, -0.25, 0.25), plane="yz",
                 rot=(-30, 0, 0))
            FEET += [tid, f"claw_{k}{n}{t}"]

# ======================================================================= palette and paint
RAMPS = ramps(
    "endstone", "chorus",
    # pale end-stone cream, greyed toward the hide: belly, blotches, pads
    pale=["#2a2722", "#3f3b33", "#555046", "#6c675a", "#837e6f", "#9b9685", "#b2ad9b", "#c8c4b1", "#dbd8c6",
          "#ecead9"],
    # pale grey-violet hide
    hide=["#17141c", "#241f2a", "#332d3a", "#433c4b", "#554d5d", "#685f6f", "#7c7382", "#918895", "#a79ea9", "#bdb5bd",
          "#d2ccd0", "#e6e2e2"],
    # the throat sac: thin pale lilac-pink skin
    sac=["#3d2236", "#5a3350", "#7a476b", "#9a5f86", "#b77ba0", "#d09bb9", "#e4bdd1", "#f3dde8"],
    claw=["#0d0a12", "#1d1824", "#2f2838", "#433a4e"],
    # glowing eyes: pale end-stone gold
    gleye=["#3a3606", "#6b640f", "#a29a1d", "#d2c93a", "#f0e97a", "#fffbd0"],
    # the faint violet glow deep in the breathing holes
    ventglow=["#2b0e3d", "#40145a", "#5a1e7b", "#76299c"],
)
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.7, "gradient": 0.5, "ao": 0.7, "ao_height": 6.0}
brush = {"flow": "horizontal", "length": 2.0, "width": 0.8, "rough": 0.6, "overshoot": 0.25,
         "textures": {"hide": "organic", "endstone": "stone", "sac": "organic"}}

RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.2}
SPECKLE = {"id": "speckle", "op": "spots", "count": 14, "radius": [0.25, 0.45], "ramp": "chorus", "tone": 3.6,
           "post": True, "min_gap": 0.8}
SPECKLE_LT = {"id": "speckle_lt", "op": "spots", "count": 8, "radius": [0.25, 0.35], "ramp": "pale",
              "tone": 9.0, "post": True, "min_gap": 0.8, "faces": ["top", "sides"]}
BLOTCH = {"id": "blotch", "op": "patches", "scale": 2.4, "threshold": 0.64, "ramp": "pale", "tone": 7.0,
          "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "hide", "shadow_shift": -1.0}}
WARTS = {"id": "warts", "op": "scales", "shape": "round", "along": "z", "size": [1.5, 1.0], "gap": 0.5,
         "highlight": 0.9, "shadow": -1.0, "jitter": 0.6, "faces": ["top", "sides"]}
GROOVES = {"id": "grooves", "op": "stripes", "axis": "z", "period": 2.5, "width": 0.2, "shift": -1.4, "wobble": 0.3,
           "faces": ["left", "right"], "range": [-0.8, 0.4]}
BELLY = {"id": "belly", "op": "band", "axis": "y", "from": -1.01, "to": -0.35, "ramp": "pale", "tone": 7.6,
         "wobble": 0.25, "faces": ["sides", "front", "back", "bottom"]}
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.4,
         "shift": 1.6}

styles = {
    "hide_body": {"ramp": "hide", "tone": 6.6, "rim": RIM,
                  "layers": [{"id": "dark_back", "op": "gradient", "axis": "y", "amount": -0.6}, WARTS, BLOTCH,
                             GROOVES, BELLY, SPECKLE, SPECKLE_LT, GLOSS]},
    "hide_belly": {"ramp": "pale", "tone": 7.0, "rim": RIM, "brush": {"flow": "z"},
                   "layers": [{"id": "plates", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.25,
                               "shift": -1.0, "faces": ["bottom", "sides"]},
                              dict(SPECKLE, count=8)]},
    "hide_back": {"ramp": "hide", "tone": 6.0, "rim": RIM,
                  "layers": [WARTS, dict(BLOTCH, threshold=0.66), dict(SPECKLE, count=10), SPECKLE_LT]},
    # a puckered rim round a dark hole, a faint violet glow deep inside
    "vent": {"ramp": "hide", "tone": 7.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
             "brush": {"off": True},
             "layers": [{"id": "pucker", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.3, "shift": -1.2,
                         "faces": ["sides"]}],
             "stamps": [{"face": "top", "at": "top-left", "art": [".kkk.", "kgGgk", "kGgGk", ".kkk."],
                         "key": {"k": "hide:1", "g": "ventglow:1", "G": "ventglow:3"}}]},
    "wart": {"ramp": "hide", "tone": 7.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6},
             "brush": {"off": True}, "layers": [{"id": "tip", "op": "spots", "count": 1, "radius": [0.5, 0.6],
                                                 "ramp": "pale", "tone": 8.4, "faces": ["top"]}]},
    "hide_head": {"ramp": "hide", "tone": 6.8, "rim": RIM,
                  "layers": [{"id": "dark_back", "op": "gradient", "axis": "y", "amount": -0.6}, WARTS,
                             dict(BLOTCH, seed=4), dict(SPECKLE, count=10), SPECKLE_LT, BELLY,
                             {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.7, "ramp": "hide",
                              "tone": 3.0, "faces": ["sides", "front"]}]},
    "hide_snout": {"ramp": "hide", "tone": 7.0, "rim": RIM, "brush": {"off": True},
                   "layers": [{"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.5, "ramp": "hide",
                               "tone": 3.0, "faces": ["sides", "front"]}],
                   "stamps": [{"face": "top", "at": "top-left", "art": ["....................",
                                                                         "....n..........n....",
                                                                         "...nN..........Nn..."],
                               "key": {"n": "hide:2", "N": "hide:0"}}]},
    "hide_jaw": {"ramp": "pale", "tone": 7.0, "rim": RIM, "brush": {"flow": "z"},
                 "layers": [{"id": "lip", "op": "band", "axis": "y", "from": 0.4, "to": 1.01, "ramp": "hide",
                             "tone": 4.6, "faces": ["sides", "front"]},
                            {"id": "mouth", "op": "fill", "ramp": "sac", "tone": 1.6, "faces": ["top"]},
                            {"id": "tongue", "op": "band", "axis": "x", "from": -0.4, "to": 0.4, "ramp": "sac",
                             "tone": 3.4, "faces": ["top"], "wobble": 0.2},
                            {"id": "folds", "op": "stripes", "axis": "x", "period": 1.5, "width": 0.25, "shift": -1.0,
                             "faces": ["bottom"]}, dict(SPECKLE, count=6)]},
    # the eyes: glowing pale gold, a vertical slit pupil, a catchlight
    "eye": {"ramp": "gleye", "tone": 3.0, "light": 0.4, "brush": {"off": True},
            "rim": {"light": 1, "dark": 1, "light_shift": 1.0, "dark_shift": -1.0},
            "stamps": [{"face": "top", "at": "top-left", "art": [".....", "..p..", "..p..", "w.p..", ".....", "....."],
                        "key": {"p": "claw:0", "w": "gleye:5"}},
                       {"faces": ["left", "right"], "at": "top-left", "art": ["......", "..pp..", "......"],
                        "key": {"p": "claw:0"}},
                       {"face": "front", "at": "top-left", "art": ["w..p.", "..p.."],
                        "key": {"p": "claw:0", "w": "gleye:5"}}]},
    "teeth": {"ramp": "endstone", "tone": 9, "light": 0, "brush": {"off": True}, "art_key": {"y": "endstone:8"}},
    # the throat sac: thin pale skin, dark veins, a sheen; scaled up it reads as a stretched balloon
    "sac": {"ramp": "sac", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.2},
            "brush": {"flow": "x", "rough": 0.4},
            "layers": [{"id": "veins", "op": "cracks", "scale": 1.2, "width": 0.05, "ramp": "sac", "tone": 2.2},
                       {"id": "folds", "op": "stripes", "axis": "x", "period": 1.5, "width": 0.25, "shift": -0.9,
                        "faces": ["bottom", "front", "back"]},
                       dict(SPECKLE, count=5, ramp="hide", tone=4.0),
                       dict(GLOSS, density=0.6, shift=1.4)]},
    "hide_tail": {"ramp": "hide", "tone": 6.4, "rim": RIM, "brush": {"flow": "z"},
                  "layers": [{"id": "dark_back", "op": "gradient", "axis": "y", "amount": -0.6}, WARTS,
                             dict(BLOTCH, seed=7), BELLY,
                             {"id": "rings", "op": "stripes", "axis": "z", "period": 3.0, "width": 0.18,
                              "shift": -1.2, "wobble": 0.4, "faces": ["sides", "top"]}, SPECKLE, SPECKLE_LT]},
    "hide_leg": {"ramp": "hide", "tone": 6.2, "rim": RIM, "brush": {"flow": "y"},
                 "layers": [WARTS, dict(BLOTCH, seed=9), dict(SPECKLE, count=6),
                            {"id": "under", "op": "band", "axis": "x", "from": -1.01, "to": -0.4, "ramp": "pale",
                             "tone": 7.0, "faces": ["sides"]}]},
    "hide_foot": {"ramp": "hide", "tone": 5.8, "rim": RIM, "brush": {"off": True},
                  "layers": [{"id": "sole", "op": "fill", "ramp": "pale", "tone": 5.0, "faces": ["bottom"]},
                             dict(SPECKLE, count=4)]},
    "toe": {"ramp": "hide", "tone": 6.6, "rim": RIM, "brush": {"off": True},
            "layers": [{"id": "pad", "op": "band", "axis": "z", "from": 0.4, "to": 1.01, "ramp": "pale",
                        "tone": 8.0}]},
    "claw": {"ramp": "claw", "tone": 2, "light": 0, "brush": {"off": True}, "art_key": {"c": "claw:3", "C": "claw:1"}},
    "fin": {"ramp": "hide", "tone": 7, "light": 0.2, "brush": {"off": True},
            "art_key": {"t": "hide:9", "m": "hide:7", "f": "hide:5"}},
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
LUNGE = add(r("body", 6), pos("body", 0, 0, 3.5), r("head", 8), r("jaw", 4), sc("body", -0.03, -0.03, 0.06),
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
    "description": "The Winterworks Gucker: a big salamander-like End predator: long, low and heavy on splayed clawed "
                   "legs, a wide flat head with glowing eyes on top, a toothed jaw, an inflatable throat sac, a ridge "
                   "of glowing breathing holes along the back, a thick finned tail; pale grey-violet speckled hide "
                   "that blends with end stone. Minecraft pixel units, density 2: exports 1:1 to a vanilla entity "
                   "model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 1600, "colors": 96},
    "light": light,
    "brush": brush,
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
