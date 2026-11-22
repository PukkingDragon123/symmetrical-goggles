"""Builds examples/whale.json: the Whale (Winterworks, Tides & Treasures).

    python examples/src/whale.py examples/whale.json

A massive, majestic baleen whale, an original design: a long blue-grey body mottled with pale spots and old scars,
darker on the back and pale beneath; a broad, flat back (the deck sits on it); a wide U-shaped head with a raised
splash guard and a twin `blowhole`, small round eyes at the corners of the mouth, a bowed lower `jaw` that drops wide
open on gums and fringed baleen, throat grooves running from the chin back under the belly (the `throat` balloons when
it lunge-feeds), long slender pectoral fins with scalloped, barnacled leading edges and pale undersides, a small dorsal
fin far back, a narrow tail stock with keels and a huge notched fluke, dark above and pale beneath.

Units are Minecraft pixels (16 per block) at **density 1** (vanilla texel size: the whale is 7 x 6 x 26 blocks, its
texture would be 4x the size at density 2; 1 texel per pixel also matches the blocks built on its deck). Every box is
a whole number of pixels, so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). Faces +Z,
the lowest point (the throat) at y = 0, "left" is +X; the root (body) pivots in the middle of the torso.

**The deck.** The back is flat from the blowhole to the tail stock: y = 96 (6 blocks) over x -42..42 (the plateau is
84 px wide; the shoulders step down to 88 at x +-50 and 78 at x +-56) and z -106..150 on the body and head (the tail
stock's top falls away behind z -106). The locator `deck` (a bone on the body) sits on that surface at (0, 96, 22): the
centre of a 9 x 21 block deck spanning z -146..190 and x -72..72 (it overhangs the flanks, the head and the tail stock).
Keep the deck on the `deck` bone's transform; swim and idle move the body only a little.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 8): bones body, head, jaw, blowhole, fin_l, fin_r, fluke,
tail_0, tail_1, eye_l, eye_r. Extra joints: throat (the pleated throat pouch), fin_l_tip / fin_r_tip, fluke_l /
fluke_r, dorsal, and the locators `deck` (the deck's origin on the back), `spout` (the top of the blowhole, where the
spout starts) and `mouth` (inside the mouth: where swallowed things go). Clips: swim, idle (loops), breathe (spout,
2 s; the spout peaks 0.5-1.0 s), mouth_open (1.0 s, ends open: hold the last frame), mouth_close (0.5 s, starts open),
lunge (1.5 s), shake (2.0 s), sing (loop). No glow.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ocean_kit import (LIGHT, LR, M, ROOT, Rig, add, barnacle_cluster, dump, keys, osc, pos, r, ramps,  # noqa
                       ring, round_eye, sc, shake, spikes, timeline, wave)

DENSITY = 1
R = Rig(density=DENSITY, bone_style="hide")
part, bone, card = R.part, R.bone, R.card
TOP = 96          # the flat back: the deck's floor
# baleen: a comb of dark plates with a pale hair fringe along the bottom
BALEEN = []
for _y in range(6):
    _row = ""
    for _x in range(80):
        if _y < 3:
            _row += "bB"[(_x // 2) % 2]
        elif _y < 5:
            _row += "f" if (_x * 7 + _y * 3) % 5 < 3 else ("b" if _y == 3 else ".")
        else:
            _row += "f" if (_x * 5 + 1) % 4 == 0 else "."
    BALEEN.append(_row)

# ======================================================================= torso: a stepped octagon with a flat back
bone("body", None, at=(0, 52, 30))
part("torso", "body", [112, 56, 140], "hide_side", centre=(0, 50, 30))
part("torso_b", "torso", [100, 76, 136], "hide_side", centre=(0, 50, 30))
part("torso_c", "torso", [84, 90, 132], "hide_back", centre=(0, 51, 30))
bone("deck", "body", at=(0, TOP, 22))
# the throat pouch: pleats from the chin back under the belly to the navel
part("throat", "body", [92, 10, 104], "throat", at=(0, 10, 50), centre=(0, 5, 48))

# ======================================================================= head: broad and flat, the blowhole on top
bone("head", "body", at=(0, 56, 98))
part("skull", "head", [100, 50, 52], "hide_head", centre=(0, 69, 124))
part("skull_b", "skull", [88, 58, 56], "hide_head_top", centre=(0, 67, 124))
part("rostrum", "head", [80, 36, 50], "hide_head_top", at=(0, 60, 148), centre=(0, 70, 172), rot=(8, 0, 0))
part("rostrum_b", "rostrum", [64, 30, 58], "hide_head_top", rel=(0, 0, 0), offset=(0, 9, 23))
part("snout", "rostrum", [50, 22, 8], "hide_head_top", rel=(0, 0, 0), offset=(0, 8, 54))
# the upper lip: comes down over the lower jaw all along the mouth, so the closed mouth is a dark lip line
part("lip_up", "head", [90, 12, 104], "lip", centre=(0, 46, 150))
# the splash guard and the twin blowhole, raised 1 px on the flat back
part("splash_guard", "head", [22, 3, 8], "hide_head_top", centre=(0, 97.5, 150))
part("blowhole", "head", [16, 1, 12], "blowhole", at=(0, 96, 139), centre=(0, 96.5, 139))
bone("spout", "blowhole", at=(0, 97, 139))
for s in (1, -1):
    n = LR(s)
    part(f"eye_{n}", "head", [2, 10, 10], "eye", at=M((50, 49, 112), s), centre=M((50.5, 49, 112), s))
    part(f"eye_patch_{n}", "head", [1, 16, 20], "hide_head", centre=M((50.5, 50, 114), s))
    # baleen: a comb of plates hanging inside the upper jaw (seen when the mouth opens)
    card(f"baleen_{n}", "head", BALEEN, "baleen", at=M((40, 42, 150), s), offset=(0, -3.0, 0), plane="yz",
         rot=(0, s * -6, 0))

# ======================================================================= the jaw: bowed, wide, opening on a hinge
bone("jaw", "head", at=(0, 40, 98))
part("jaw_bone", "jaw", [108, 28, 80], "jaw", centre=(0, 26, 140))
part("jaw_front", "jaw_bone", [94, 26, 30], "jaw", centre=(0, 26, 190))
part("jaw_b", "jaw_bone", [98, 34, 86], "jaw_low", centre=(0, 21, 143))
part("chin", "jaw_bone", [76, 22, 8], "jaw_low", centre=(0, 28, 206))
bone("mouth", "jaw", at=(0, 46, 176))
for k, (x, y) in enumerate(((24, 22), (-18, 26), (34, 30))):
    part(f"chin_barnacles_{k}", "chin", [8 if k != 1 else 10, 6, 2], "barnacle", centre=(x, y, 211))

# ======================================================================= pectoral fins: long, slender, scalloped
for s in (1, -1):
    n = LR(s)
    part(f"fin_{n}", "body", [30, 8, 24], "fin", at=M((54, 30, 72), s), offset=(s * 14, 0, -3),
         rot=(0, s * -40, s * -18))
    tip = R.wpos(f"fin_{n}", (s * 28, 0, -3))
    part(f"fin_{n}_tip", f"fin_{n}", [24, 6, 16], "fin", at=tip, offset=(s * 11, 0, -2), rot=(0, s * -14, s * 4))
    for k in range(4):
        part(f"fin_{n}_knob{k}", f"fin_{n}" if k < 2 else f"fin_{n}_tip", [5, 5, 3], "barnacle" if k == 1 else "fin",
             rel=(s * (6 + 14 * (k % 2)), 0, 11.5 if k < 2 else 7.5))

# ======================================================================= tail: a tapering stock, keels, the fluke
bone("tail_0", "body", at=(0, 54, -36))
part("stock", "tail_0", [96, 64, 88], "hide_side", centre=(0, 52, -80))
part("stock_b", "stock", [80, 78, 84], "hide_side", centre=(0, 54, -80))
part("stock_c", "stock", [64, 86, 80], "hide_back", centre=(0, 52, -82))
part("dorsal", "tail_0", [6, 14, 26], "fin", at=(0, 94, -108), centre=(0, 98, -112), rot=(18, 0, 0))
bone("tail_1", "tail_0", at=(0, 54, -122))
part("peduncle", "tail_1", [40, 50, 48], "hide_side", centre=(0, 54, -144))
part("peduncle_b", "peduncle", [28, 62, 44], "hide_back", centre=(0, 54, -144))
part("keel_up", "peduncle", [8, 8, 38], "hide_back", centre=(0, 88, -146))
part("keel_low", "peduncle", [8, 8, 34], "hide_belly", centre=(0, 20, -144))
bone("fluke", "tail_1", at=(0, 54, -166))
part("fluke_root", "fluke", [36, 10, 22], "fluke", centre=(0, 54, -176))
for s in (1, -1):
    n = LR(s)
    part(f"fluke_{n}", "fluke", [52, 6, 26], "fluke", at=M((16, 54, -176), s), offset=M((24, 0, -7), s),
         rot=(0, s * 18, 0))
    part(f"fluke_{n}_tip", f"fluke_{n}", [22, 4, 14], "fluke", rel=M((48, 0, -9), s), offset=M((7, 0, -3), s),
         rot=(0, s * 18, 0))
    card(f"fluke_{n}_edge", f"fluke_{n}", spikes(52, 4, seed=7 + s), "fluke_edge", rel=(0, 0, 0),
         offset=M((24, 0.0, -21.5), s), plane="xz")

# ======================================================================= palette and paint
RAMPS = ramps("whale", "belly", "gum", "baleen", "barnacle", "pupil", "cream")
brush = {"flow": "horizontal", "length": 6.0, "width": 2.0, "rough": 0.5, "overshoot": 0.3,
         "textures": {"whale": "leather", "belly": "organic", "barnacle": "stone"}}
RIM = {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.2}
MOTTLE = {"id": "mottle", "op": "spots", "count": 26, "radius": [1.2, 3.2], "stretch": [1, 0.7, 1.6], "ramp": "whale",
          "tone": 9.6, "roughness": 0.6, "min_gap": 4.0, "faces": ["top", "sides"]}
MOTTLE_DK = dict(MOTTLE, id="mottle_dk", count=14, radius=[1.0, 2.4], ramp="whale", tone=3.8, seed=11)
SCARS = {"id": "scars", "op": "cracks", "scale": 40.0, "width": 0.01, "threshold": 0.72, "ramp": "whale", "tone": 10.0,
         "seed": 3, "faces": ["top", "sides"]}
CLOUD = {"id": "cloud", "op": "noise", "scale": 24.0, "amount": 1.0}
BELLY = {"id": "belly", "op": "band", "axis": "y", "from": -1.01, "to": -0.35, "ramp": "belly", "tone": 5.0,
         "wobble": 0.25, "wobble_scale": 30.0, "faces": ["sides", "front", "back", "bottom"],
         "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "whale", "shadow_shift": -1.0}}
PLEATS = {"id": "pleats", "op": "stripes", "axis": "x", "period": 4.0, "width": 0.25, "shift": -1.6, "wobble": 0.4,
          "faces": ["bottom", "sides"]}
styles = {
    "hide": {"ramp": "whale", "tone": 6.0, "rim": RIM},
    "hide_back": {"ramp": "whale", "tone": 5.2, "rim": RIM,
                  "layers": [CLOUD, MOTTLE, MOTTLE_DK, SCARS]},
    "hide_side": {"ramp": "whale", "tone": 6.0, "rim": RIM,
                  "layers": [CLOUD, {"id": "dark_top", "op": "gradient", "axis": "y", "amount": -0.8}, MOTTLE,
                             MOTTLE_DK, SCARS, BELLY]},
    "hide_belly": {"ramp": "belly", "tone": 5.0, "rim": RIM, "layers": [CLOUD, PLEATS]},
    "hide_head": {"ramp": "whale", "tone": 6.0, "rim": RIM,
                  "layers": [CLOUD, MOTTLE, MOTTLE_DK, SCARS,
                             {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.7, "ramp": "whale",
                              "tone": 2.4, "faces": ["sides", "front"]}]},
    "hide_head_top": {"ramp": "whale", "tone": 5.6, "rim": RIM,
                      "layers": [CLOUD, dict(MOTTLE, count=16), dict(MOTTLE_DK, count=10), SCARS,
                                 {"id": "lip", "op": "band", "axis": "y", "from": -1.01, "to": -0.6, "ramp": "whale",
                                  "tone": 2.2, "faces": ["sides", "front"]}]},
    "blowhole": {"ramp": "whale", "tone": 4.6, "rim": RIM, "brush": {"off": True},
                 "stamps": [{"face": "top", "at": "center",
                             "art": ["..dddd....dddd..", ".dDDDDd..dDDDDd.", ".dDkkDd..dDkkDd.", ".dDkkDd..dDkkDd.",
                                     ".dDkkDd..dDkkDd.", ".dDkkDd..dDkkDd.", ".dDkkDd..dDkkDd.", ".dDkkDd..dDkkDd.",
                                     ".ddDDd....dDDdd.", "..dddd....dddd..", "................", "................"],
                             "key": {"d": "whale:3", "D": "whale:2", "k": "whale:0"}}]},
    "jaw": {"ramp": "whale", "tone": 5.6, "rim": RIM,
            "layers": [CLOUD, MOTTLE, dict(BELLY, **{"from": -1.01, "to": 0.0}), PLEATS,
                       {"id": "lip", "op": "band", "axis": "y", "from": 0.75, "to": 1.01, "ramp": "whale",
                        "tone": 2.4, "faces": ["sides", "front"]},
                       {"id": "inner", "op": "band", "axis": "x", "from": -0.8, "to": 0.8, "ramp": "gum",
                        "tone": 3.0, "faces": ["top"]},
                       {"id": "tongue", "op": "band", "axis": "x", "from": -0.4, "to": 0.4, "ramp": "gum",
                        "tone": 5.4, "faces": ["top"], "wobble": 0.15}]},
    "jaw_low": {"ramp": "belly", "tone": 5.0, "rim": RIM, "layers": [CLOUD, PLEATS]},
    "lip": {"ramp": "whale", "tone": 3.0, "rim": RIM,
            "layers": [CLOUD, {"id": "roof", "op": "fill", "ramp": "baleen", "tone": 3.0, "faces": ["bottom"]}]},
    "gums": {"ramp": "gum", "tone": 4.0, "rim": {"light": 0, "dark": 1, "dark_shift": -1.2},
             "layers": [{"id": "tongue", "op": "band", "axis": "x", "from": -0.45, "to": 0.45, "ramp": "gum",
                         "tone": 5.6, "faces": ["top"], "wobble": 0.2},
                        {"id": "ridges", "op": "stripes", "axis": "z", "period": 3.0, "width": 0.25, "shift": -1.0,
                         "faces": ["top"]}]},
    "throat": {"ramp": "belly", "tone": 5.4, "rim": RIM,
               "layers": [CLOUD, dict(PLEATS, period=3.0, width=0.3),
                          {"id": "blush", "op": "patches", "scale": 18.0, "threshold": 0.6, "ramp": "gum",
                           "tone": 6.4, "faces": ["bottom"]}]},
    "baleen": {"ramp": "baleen", "tone": 3, "light": 0.2, "brush": {"off": True},
               "art_key": {"b": "baleen:2", "B": "baleen:4", "f": "baleen:7"}},
    "eye": {"ramp": "whale", "tone": 3.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"faces": ["left", "right"], "at": "top-left", "art": round_eye(10, pupil=4),
                        "key": {"k": "whale:1", "i": "baleen:3", "I": "baleen:4", "J": "baleen:6", "p": "pupil:0",
                                "W": "cream:7"}}]},
    "fin": {"ramp": "whale", "tone": 6.0, "rim": RIM,
            "layers": [CLOUD, dict(MOTTLE, count=8, radius=[1.0, 2.0]),
                       {"id": "pale_under", "op": "fill", "ramp": "belly", "tone": 5.6, "faces": ["bottom"]},
                       {"id": "edge", "op": "band", "axis": "z", "from": 0.6, "to": 1.01, "ramp": "belly",
                        "tone": 6.4, "faces": ["top", "sides"], "wobble": 0.3}]},
    "fluke": {"ramp": "whale", "tone": 5.0, "rim": RIM,
              "layers": [CLOUD, dict(MOTTLE, count=10), dict(SCARS, scale=24.0),
                         {"id": "pale_under", "op": "fill", "ramp": "belly", "tone": 5.0, "faces": ["bottom"]},
                         {"id": "under_spots", "op": "spots", "count": 10, "radius": [1.0, 2.5], "ramp": "whale",
                          "tone": 3.0, "faces": ["bottom"], "min_gap": 3.0}]},
    "fluke_edge": {"ramp": "whale", "tone": 2, "light": 0, "brush": {"off": True},
                   "art_key": {"t": "whale:1", "m": "whale:2", "f": "whale:3"}},
    "barnacle": {"ramp": "barnacle", "tone": 3.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4},
                 "brush": {"off": True},
                 "stamps": [{"faces": ["front", "top", "left", "right"], "at": "top-left",
                             "art": barnacle_cluster(10, 6, seed=5, n=4),
                             "key": {"b": "barnacle:5", "B": "barnacle:7", "o": "barnacle:1", "r": "barnacle:3"}}]},
}

# ======================================================================= animation
REST = {}
TAIL = ["tail_0", "tail_1", "fluke"]
FINS = ["fin_l", "fin_r"]


def stroke(L, amp=1.0, cycles=1, phase=0.0):
    """The fluke beats up and down; the stroke travels back down the tail (overlap and follow-through), the body
    counter-pitches a touch."""
    return [wave(TAIL, "x", 7 * amp, cycles, lag=0.14, growth=1.45, phase=phase),
            osc("body", "x", -1.2 * amp, cycles, phase + 0.1), osc("head", "x", 0.8 * amp, cycles, phase + 0.2),
            osc("body", None, [0, 1.2 * amp, 0], cycles, phase + 0.35, ch="position")]


ANIM = {}
# swim: slow, majestic fluke strokes, the pectorals steering, a gentle roll
L = 4.0
ANIM["swim"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=stroke(L, 1.0, 1) + [
    osc("fin_l", "z", -6, 1, 0.2), osc("fin_r", "z", 6, 1, 0.2), osc("fin_l", "y", 4, 1, 0.45),
    osc("fin_r", "y", -4, 1, 0.45), osc("body", "z", 1.0, 1, 0.5), osc("fluke_l", "x", 4, 1, 0.3),
    osc("fluke_r", "x", 4, 1, 0.3),
])

# idle: hanging in the water: a lazy fluke drift, the pectorals sculling slowly, the jaw shifting, the eyes rolling
L = 6.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=stroke(L, 0.35, 1) + [
    osc("fin_l", "x", 6, 1, 0.0), osc("fin_r", "x", 6, 1, 0.5), osc("fin_l_tip", "z", -5, 1, 0.15),
    osc("fin_r_tip", "z", 5, 1, 0.65), osc("jaw", "x", 1.0, 2, 0.3, bias=0.5),
    osc("eye_l", "y", 10, 1, 0.2), osc("eye_r", "y", -10, 1, 0.2), osc("body", "z", 0.8, 1, 0.1),
])

# breathe: it rises, the blowhole flares open (the spout: 0.5-1.0 s), the back arches, it settles again
OPEN_HOLE = add(sc("blowhole", 0.35, 0, 0.45), pos("body", 0, 4.0, 0), r("body", -2), r("tail_0", 3), r("fluke", 6))
ANIM["breathe"] = timeline(2.0, [(0.0, REST, None), (0.45, add(pos("body", 0, 3.5, 0), r("body", -1.5)), "ease"),
                                 (0.55, OPEN_HOLE, "out"), (1.0, OPEN_HOLE, "ease"),
                                 (1.25, add(sc("blowhole", -0.15, 0, -0.15), pos("body", 0, 2.0, 0)), "ease"),
                                 (2.0, REST, "ease")],
                           extra=[shake("blowhole", 0.5, 1.0, [0.06, 0, 0.06], freq=12, ch="scale")])

# mouth_open: the jaw drops wide, the throat sags (ends open: the game holds the last frame)
OPEN = add(r("jaw", 34), sc("throat", 0.02, 0.6, 0.02), r("head", -3), r("fin_l", 0, 0, 6), r("fin_r", 0, 0, -6))
ANIM["mouth_open"] = timeline(1.0, [(0.0, REST, None), (0.15, add(r("jaw", -2), r("head", 1)), "ease"),
                                    (0.75, add(OPEN, r("jaw", 3)), "out"), (1.0, OPEN, "ease")])
# mouth_close: from open, the jaw swings up and shuts with a small bounce
ANIM["mouth_close"] = timeline(0.5, [(0.0, OPEN, None), (0.3, add(r("jaw", -3), r("head", 1.5)), "in"),
                                     (0.4, r("jaw", 1.5), "ease"), (0.5, REST, "ease")])

# lunge: a big fluke drive, the jaw gapes enormously, the throat balloons with the gulp, the jaw slams shut, the
# swollen throat slowly drains
DRIVE = add(r("tail_0", -6), r("tail_1", -8), r("fluke", -16), pos("body", 0, 0, -6.0), r("body", 2))
GAPE = add(r("jaw", 52), r("head", -6), sc("throat", 0.1, 1.6, 0.06), pos("body", 0, 1.0, 18.0), r("body", -3),
           r("tail_0", 5), r("tail_1", 8), r("fluke", 14), r("fin_l", 0, 10, 20), r("fin_r", 0, -10, -20))
GULP = add(r("jaw", 0), sc("throat", 0.14, 2.2, 0.08), pos("body", 0, 0.5, 22.0), r("body", 2))
ANIM["lunge"] = timeline(1.5, [(0.0, REST, None), (0.3, DRIVE, "ease"), (0.7, GAPE, "out"), (0.85, GAPE, "ease"),
                               (1.05, GULP, "in"), (1.5, REST, "ease")],
                         extra=[ring("fluke", 0.7, 10, freq=3, decay=3, axis=0, end=1.5)])

# shake: violent rolls side to side, the head wrenching, the tail thrashing and the fins flailing: everything on its
# back is thrown off
ANIM["shake"] = timeline(2.0, [(0.0, REST, None), (2.0, REST, None)], extra=[
    shake("body", 0.05, 1.9, 22, freq=2.6, axis=2), shake("body", 0.1, 1.8, 6, freq=3.4, axis=1),
    shake("head", 0.15, 1.8, 8, freq=3.4, axis=1, phase=-1.0),
    shake("tail_0", 0.1, 1.9, 10, freq=3.0, axis=1), shake("tail_1", 0.15, 1.95, 14, freq=3.0, axis=1),
    shake("fluke", 0.2, 1.95, 16, freq=3.0, axis=0),
    shake("fin_l", 0.1, 1.9, 24, freq=3.0, axis=2), shake("fin_r", 0.1, 1.9, -24, freq=3.0, axis=2),
    shake("jaw", 0.3, 1.6, 6, freq=4.0, axis=0),
    shake("body", 0.05, 1.9, [0, 3.0, 0], freq=5.2, ch="position"),
])

# sing: gentle and expressive: the head lifts and lowers through each phrase, the pectorals sweep like arms, the
# jaw parts and the throat swells with every note, the fluke curls slowly, the whole body rolls a little
L = 8.0
ANIM["sing"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=stroke(L, 0.3, 1, 0.2) + [
    osc("body", "x", -3.0, 1, 0.0), osc("head", "x", -2.5, 2, 0.1), osc("body", "z", 2.5, 1, 0.25),
    osc("fin_l", "z", -16, 2, 0.0), osc("fin_r", "z", 16, 2, 0.0), osc("fin_l", "y", 10, 1, 0.2),
    osc("fin_r", "y", -10, 1, 0.2), osc("fin_l_tip", "z", -10, 2, 0.1), osc("fin_r_tip", "z", 10, 2, 0.1),
    keys("jaw", "x", [[0, 0], [0.8, 0], [1.4, 7], [2.2, 7], [2.8, 1], [4.0, 0], [4.6, 9], [5.6, 9], [6.4, 2],
                      [7.2, 0], [8.0, 0]]),
    keys("throat", None, [[0, [0, 0, 0]], [0.8, [0, 0, 0]], [1.4, [0.02, 0.35, 0.02]], [2.2, [0.02, 0.4, 0.02]],
                          [2.8, [0, 0.05, 0]], [4.0, [0, 0, 0]], [4.6, [0.03, 0.5, 0.02]],
                          [5.6, [0.03, 0.55, 0.02]], [6.4, [0, 0.1, 0]], [7.2, [0, 0, 0]], [8.0, [0, 0, 0]]],
         ch="scale"),
    osc("fluke_l", "x", 6, 2, 0.3), osc("fluke_r", "x", 6, 2, 0.3),
    osc("eye_l", "y", 8, 1, 0.4), osc("eye_r", "y", -8, 1, 0.4),
])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Whale",
    "description": "The Winterworks whale: a massive original baleen whale, blue-grey and mottled, pale beneath, a "
                   "broad flat back for a block deck, a wide head with a splash guard and twin blowhole, small round "
                   "eyes, a bowed lower jaw over gums and baleen, throat grooves, long scalloped pectorals and a huge "
                   "notched fluke. Minecraft pixel units at density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 900, "colors": 96},
    "light": dict(LIGHT, ao_height=30.0),
    "brush": brush,
    "minecraft": {"fps": 12},
    "render": {"background": "#1a4a63", "hero": [38, 18], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "whale.json")
    dump(spec, out)
