"""Builds examples/whale.json: the Whale (Winterworks, Tides & Treasures).

    python examples/src/whale.py examples/whale.json

A massive sperm whale built from **block-scale boxes**, in the vanilla mob style: every main box is whole blocks (16 px)
on one block grid, so the silhouette reads as stacked Minecraft blocks. A huge, square head 9 blocks wide and 4 tall
whose blunt snout (the middle two block rows of its face) juts one block further than the forehead and chin, over a
narrow pale lower jaw lined with white conical teeth; small flat dot eyes far back on the head (2 x 2, a pale ring, a
dark brow line); the blowhole on the snout's top at the front left; a long body whose flat 9-block back steps in below
toward a pale belly (9, 7, 5, then 3 blocks wide); a low dorsal hump; small pectoral fins; a tail stepping down block
by block to a broad fluke. Wrinkly slate-grey skin: soft grain, patches of long wavy wrinkle lines, short pale squid
scars on the head, a lighter belly and jaw.

Units are Minecraft pixels (16 per block) at **density 1** (vanilla texel size): each block face carries a 16 x 16
texel area like a real block. Every box is whole pixels, so the model exports 1:1 to a vanilla entity model:

    PYTHONHASHSEED=0 python -m lowpix mc export examples/whale.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/whale

**The block grid** is the deck's: block edges at x = ±8 + 16i (odd block widths centred on x = 0), y = 16j (the
lowest point, the belly, at y = 0) and z = 12 + 16k. Main boxes use whole blocks; only small parts (the jaw, the
teeth, the fins, the fluke tips, the dorsal hump, the blowhole) use half blocks.

**The deck.** The back is flat at y = 96 (exactly 6 blocks above the belly) and 9 blocks wide (x -72..72) from
z = -148 to the forehead at z = 188: 9 x 21 blocks (the body to z = 108, the head from there). The locator `deck` (a
bone on the body) sits on that surface at (0, 96, 20): the centre of the 9 x 21 block deck spanning x -72..72 and
z -148..188, whose cells line up 1:1 with the whale's blocks. The snout juts one block further below the forehead
(y 48..80, z 188..204) with the blowhole on its top (y 80); the dorsal hump stands on the tail, behind the deck
(z -212..-180). Keep the deck on the `deck` bone's transform; swim and idle move the body only a little (about 1
degree and 1 px).

Size: 13 x 6 x 28 blocks with the fins and fluke (208 x 96 x 448 px); the body 9 x 6 blocks.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 8): bones body, head, jaw, blowhole, fin_l, fin_r, fluke,
tail_0, tail_1, eye_l, eye_r. Extra joints: throat (the block under the head's back, it swells a little when it
gulps), fin_l_tip / fin_r_tip, fluke_l / fluke_r, dorsal, and the locators `deck` (the deck's origin on the back),
`spout` (the top of the blowhole, where the spout starts: (16, 81, 196)) and `mouth` (inside the mouth, between the
jaw and the head: (0, 28, 168)). Clips: swim 4.0, idle 6.0, sing 8.0 (loops), breathe 2.0 (spout 0.55-1.0 s),
mouth_open 1.0 (ends open: hold the last frame), mouth_close 0.5 (starts open), lunge 1.5 (gape 0.3-0.85 s, shut about
1.05 s), shake 2.0 (rolls ±22 degrees). No glow. Part names from the earlier design that are no longer drawn stay as
empty bones (name compatibility).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (LIGHT, LR, M, ROOT, Rig, add, card_style, combine, dump, flat, keep_names, keys,  # noqa
                       marks, osc, pos, r, ramps, ring, sc, shake, side_eye, smooth_field, timeline, wave)

DENSITY = 1
R = Rig(density=DENSITY, bone_style="hide")
part, bone, card = R.part, R.bone, R.card
B = 16            # one block
TOP = 6 * B       # the flat back: the deck's floor
ZG = 12           # the z grid's offset (the deck's cells: z = 12 + 16k)


def zc(k0, k1):
    """Centre z of blocks k0..k1 (inclusive) on the deck's z grid."""
    return ZG + B * (k0 + k1 + 1) / 2


def blocks(nx, ny, nz):
    return [nx * B, ny * B, nz * B]


# ======================================================================= the body: a long block stepping in below
bone("body", None, at=(0, 56, 20))
# the back: a 9-block-wide slab two blocks deep under the deck, then 7, 5 and 3 blocks wide toward the belly, so the
# body rounds off in block steps below the flat back and the head stands out as one big block
part("torso", "body", blocks(9, 2, 16), "hide", centre=(0, 80, zc(-10, 5)))          # y 64..96, z -148..108
part("torso_b", "torso", blocks(7, 2, 15), "hide", centre=(0, 48, zc(-10, 4)))       # y 32..64, z -148..92
part("torso_m", "torso", blocks(5, 1, 12), "belly", centre=(0, 24, zc(-7, 4)))       # y 16..32, z -100..92
part("torso_c", "torso", blocks(3, 1, 8), "belly", centre=(0, 8, zc(-5, 2)))         # y 0..16, z -68..60
bone("deck", "body", at=(0, TOP, 20))
# the throat: the block under the head's back; it swells a little when the whale gulps
part("throat", "body", blocks(5, 1, 3), "belly", at=(0, 32, zc(5, 7)), centre=(0, 24, zc(5, 7)))

# ======================================================================= the head: one huge block, a narrow jaw
bone("head", "body", at=(0, 56, 108))
part("skull", "head", blocks(9, 4, 5), "head", centre=(0, 64, zc(6, 10)))           # y 32..96, z 108..188
# the blunt snout: the middle of the face juts a block further, so the forehead and the chin step back
bone("rostrum", "head", rel=(0, 0, 0))
part("snout", "rostrum", blocks(9, 2, 1), "head", centre=(0, 64, zc(11, 11)))       # y 48..80, z 188..204
# the blowhole: at the front left of the head, on the half-block grid
part("blowhole", "head", [16, 1, 8], "blowhole", at=(16, 80, 196), centre=(16, 80.5, 196))
bone("spout", "blowhole", at=(16, 81, 196))
for s in (1, -1):
    bone(f"eye_{LR(s)}", "head", at=M((72, 43, 121), s))
# the jaw: a narrow pale beam on the half-block grid, hinged under the head's back, lined with conical teeth
bone("jaw", "head", at=(0, 24, 132))
part("jaw_bone", "jaw", [32, 8, 64], "jaw", centre=(0, 20, 164))                   # y 16..24, z 132..196
bone("mouth", "jaw", at=(0, 28, 168))


def tooth_row(w, h, every, tooth_w):
    """Conical white teeth standing on the bottom row: each `tooth_w` wide at the root, a point at the top."""
    rows = [["."] * w for _ in range(h)]
    for x0 in range(1, w - tooth_w + 1, every):
        for k in range(h):
            half = (tooth_w - 1) * k / (2.0 * (h - 1))
            c = x0 + (tooth_w - 1) / 2.0
            for x in range(x0, x0 + tooth_w):
                if abs(x - c) <= half + 0.01:
                    rows[k][x] = "t" if k < h - 2 else "T"
    return ["".join(r) for r in rows]


TEETH = tooth_row(64, 7, 8, 5)
for s in (1, -1):
    card(f"teeth_{LR(s)}", "jaw", TEETH, "teeth", at=M((11.5, 24, 166), s), offset=(0, 3.5, 0), plane="yz")
card("teeth_front", "jaw", tooth_row(16, 7, 8, 5), "teeth", at=(0, 24, 196.5), offset=(0, 3.5, 0), plane="xy")

# ======================================================================= pectoral fins: small paddles behind the head
for s in (1, -1):
    n = LR(s)
    part(f"fin_{n}", "body", [32, 8, 24], "fin", at=M((56, 38, 84), s), offset=(s * 16, 0, -4),
         rot=(0, s * -30, s * -24))
    part(f"fin_{n}_tip", f"fin_{n}", [16, 8, 16], "fin", rel=(s * 32, 0, -4), offset=(s * 8, 0, -2),
         rot=(0, s * -20, 0))

# ======================================================================= tail: stepping down block by block
bone("tail_0", "body", at=(0, 56, -148))
part("stock", "tail_0", blocks(7, 3, 2), "hide", centre=(0, 56, zc(-12, -11)))      # y 32..80, z -180..-148
part("stock_b", "stock", blocks(3, 1, 2), "belly", centre=(0, 24, zc(-12, -11)))    # y 16..32
bone("tail_1", "tail_0", at=(0, 64, -180))
part("peduncle", "tail_1", blocks(5, 2, 2), "hide", centre=(0, 64, zc(-14, -13)))   # y 48..80, z -212..-180
# the low dorsal hump far back on the tail
part("dorsal", "tail_1", [16, 8, 32], "hide", at=(0, 80, -196), centre=(0, 84, -196))
bone("fluke", "tail_1", at=(0, 60, -212))
part("fluke_root", "fluke", [48, 8, 32], "fluke", centre=(0, 60, zc(-16, -15)))     # y 56..64, z -244..-212
for s in (1, -1):
    n = LR(s)
    part(f"fluke_{n}", "fluke", [64, 8, 32], "fluke", at=M((24, 60, -212), s), centre=M((56, 60, -228), s))
    part(f"fluke_{n}_tip", f"fluke_{n}", [16, 8, 16], "fluke", centre=M((96, 60, -236), s))

# names of the earlier design that are not drawn any more (kept as empty bones for the mod's code)
keep_names(R, {"skull_b": "skull", "rostrum": "head", "rostrum_b": "rostrum",
               "lip_up": "head", "splash_guard": "head", "eye_patch_l": "head",
               "baleen_l": "head", "eye_patch_r": "head", "baleen_r": "head", "jaw_front": "jaw_bone",
               "jaw_b": "jaw_bone", "chin": "jaw_bone", "chin_barnacles_0": "chin", "chin_barnacles_1": "chin",
               "chin_barnacles_2": "chin", "fin_l_knob0": "fin_l", "fin_l_knob1": "fin_l", "fin_l_knob2": "fin_l_tip",
               "fin_l_knob3": "fin_l_tip", "fin_r_knob0": "fin_r", "fin_r_knob1": "fin_r", "fin_r_knob2": "fin_r_tip",
               "fin_r_knob3": "fin_r_tip", "stock_c": "stock", "peduncle_b": "peduncle", "keel_up": "peduncle",
               "keel_low": "peduncle", "fluke_l_edge": "fluke_l", "fluke_r_edge": "fluke_r"})

# ======================================================================= palette and paint
RAMPS = ramps("whale", "belly", "gum", "tooth", "ink", "glint")
BELLY = {"id": "pale_low", "op": "band", "axis": "y", "from": -1.01, "to": -0.55, "ramp": "belly", "tone": 2.0,
         "faces": ["sides"]}
styles = {
    "hide": flat("whale", 3.4),
    "head": flat("whale", 3.6),
    "belly": flat("belly", 1.4, {"id": "folds", "op": "stripes", "axis": "x", "period": 6.0, "width": 0.2,
                                 "shift": -0.8, "faces": ["bottom", "sides"]}),
    "jaw": flat("belly", 2.6, {"id": "gums", "op": "fill", "ramp": "gum", "tone": 1.2, "faces": ["top"]}),
    "fin": flat("whale", 3.0, {"id": "pale_under", "op": "fill", "ramp": "belly", "tone": 1.6, "faces": ["bottom"]}),
    "fluke": flat("whale", 3.0, {"id": "pale_under", "op": "fill", "ramp": "belly", "tone": 1.4,
                                 "faces": ["bottom"]}),
    "blowhole": flat("whale", 2.0, grain=0.5),
    "teeth": card_style("tooth", 2, {"t": "tooth:3", "T": "tooth:1"}, light=0.1),
}
for st in ("head",):
    styles[st]["layers"].append(BELLY)

# markings: patches of darker grey with long wavy wrinkles running along the body, short pale squid scars on the head,
# small eyes far back under a heavy brow line
_patch = smooth_field(21, 60)
_patch_b = smooth_field(5, 34)


def wrinkles(x, y, z, f):
    """Darker swirly patches of skin, and long wavy wrinkle lines (darker still) where the skin creases."""
    if f == "bottom" or y < 18:
        return "."
    v = _patch(x, y, z) + 0.5 * _patch_b(x, y, z)
    if f in ("top",):
        a = x + 4 * math.sin(z / 13.0) + 3 * math.sin(z / 31.0 + 1)
    elif f in ("front", "back"):
        a = y + 3 * math.sin(x / 11.0) + 2 * math.sin(x / 27.0)
    else:
        a = y + 4 * math.sin(z / 14.0) + 3 * math.sin(z / 33.0 + 2) + 1.5 * math.sin(z / 5.0)
    if v > 0.2 and (a + 0.5) % 9.0 < 1.0:
        return "w"
    if v > 0.75:
        return "p"
    return "."


SCARS = []
_rng = random.Random(7)
for _ in range(14):
    SCARS.append((_rng.uniform(-60, 60), _rng.uniform(40, 90), _rng.uniform(-1, 1), _rng.uniform(3, 7)))


def scars(x, y, z, f):
    """Short pale scratches on the head's front and sides."""
    if f == "front":
        u, v = x, y
    elif f in ("left", "right"):
        u, v = (z - 170) * 2.0, y
    else:
        return "."
    for su, sv, slope, ln in SCARS:
        du = u - su
        if 0 <= du <= ln * 2 and abs(v - (sv + slope * du * 0.5)) < 0.5:
            return "c"
    return "."


def mouth_line(x, y, z, f):
    """The head's underside over the jaw: a gum-dark groove where the teeth sit."""
    if f == "bottom" and abs(x) < 18 and z > 126:
        return "g"
    if f in ("left", "right", "front") and y < 34 and z > 126 and abs(x) > 70:
        return "d"
    return "."


def blow(x, y, z, f):
    """The blowhole: an S-shaped dark slit on top."""
    if f != "top":
        return "."
    u, v = x - 16, z - 196
    return "k" if abs(v - 1.5 * math.sin(u * 0.6)) < 0.8 and abs(u) < 5 else "."


EYE = side_eye(44, 123, w=2, h=2, glint=True, brow="heavy", gap=1)


def eye_socket(x, y, z, f):
    """A pale ring of skin round the small eye, so it reads from far off."""
    if f in ("left", "right") and 120 < z < 124 and 41 < y < 45:
        return "e"
    return "."
KEY = {"w": "whale:1", "p": "whale:3", "c": "belly:3", "e": "belly:2", "g": "gum:0", "d": "whale:1", "k": "ink:0",
       "h": "glint:1", "b": "ink:2", "l": "whale:1"}
for pid in ("torso", "stock", "peduncle", "dorsal", "torso_b"):
    marks(R, pid, wrinkles, KEY)
marks(R, "skull", combine(EYE, eye_socket, mouth_line, scars, wrinkles), KEY)
marks(R, "snout", combine(scars, wrinkles), KEY)
marks(R, "blowhole", blow, KEY)

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

# idle: hanging in the water: a lazy fluke drift, the pectorals sculling slowly, the jaw shifting
L = 6.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=stroke(L, 0.35, 1) + [
    osc("fin_l", "x", 6, 1, 0.0), osc("fin_r", "x", 6, 1, 0.5), osc("fin_l_tip", "z", -5, 1, 0.15),
    osc("fin_r_tip", "z", 5, 1, 0.65), osc("jaw", "x", 1.5, 2, 0.3, bias=0.8), osc("body", "z", 0.8, 1, 0.1),
])

# breathe: it rises, the blowhole flares open (the spout: 0.5-1.0 s), the back arches, it settles again
OPEN_HOLE = add(sc("blowhole", 0.5, 0, 0.6), pos("body", 0, 4.0, 0), r("body", -2), r("tail_0", 3), r("fluke", 6))
ANIM["breathe"] = timeline(2.0, [(0.0, REST, None), (0.45, add(pos("body", 0, 3.5, 0), r("body", -1.5)), "ease"),
                                 (0.55, OPEN_HOLE, "out"), (1.0, OPEN_HOLE, "ease"),
                                 (1.25, add(sc("blowhole", -0.15, 0, -0.15), pos("body", 0, 2.0, 0)), "ease"),
                                 (2.0, REST, "ease")],
                           extra=[shake("blowhole", 0.5, 1.0, [0.08, 0, 0.08], freq=12, ch="scale")])

# mouth_open: the narrow jaw drops wide, the throat sags a little (ends open: the game holds the last frame)
OPEN = add(r("jaw", 38), sc("throat", 0.0, 0.25, 0.0), r("head", -3), r("fin_l", 0, 0, 6), r("fin_r", 0, 0, -6))
ANIM["mouth_open"] = timeline(1.0, [(0.0, REST, None), (0.15, add(r("jaw", -2), r("head", 1)), "ease"),
                                    (0.75, add(OPEN, r("jaw", 3)), "out"), (1.0, OPEN, "ease")])
# mouth_close: from open, the jaw swings up and shuts with a small bounce
ANIM["mouth_close"] = timeline(0.5, [(0.0, OPEN, None), (0.3, add(r("jaw", -3), r("head", 1.5)), "in"),
                                     (0.4, r("jaw", 1.5), "ease"), (0.5, REST, "ease")])

# lunge: a big fluke drive, the jaw gapes enormously, the throat swells with the gulp, the jaw slams shut
DRIVE = add(r("tail_0", -6), r("tail_1", -8), r("fluke", -16), pos("body", 0, 0, -6.0), r("body", 2))
GAPE = add(r("jaw", 60), r("head", -6), sc("throat", 0.0, 0.5, 0.0), pos("body", 0, 1.0, 18.0), r("body", -3),
           r("tail_0", 5), r("tail_1", 8), r("fluke", 14), r("fin_l", 0, 10, 20), r("fin_r", 0, -10, -20))
GULP = add(r("jaw", 0), sc("throat", 0.0, 0.7, 0.0), pos("body", 0, 0.5, 22.0), r("body", 2))
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
    shake("jaw", 0.3, 1.6, 8, freq=4.0, axis=0),
    shake("body", 0.05, 1.9, [0, 3.0, 0], freq=5.2, ch="position"),
])

# sing: gentle and expressive: the head lifts and lowers through each phrase, the pectorals sweep like arms, the
# jaw parts and the throat swells with every note, the fluke curls slowly, the whole body rolls a little
L = 8.0
ANIM["sing"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=stroke(L, 0.3, 1, 0.2) + [
    osc("body", "x", -3.0, 1, 0.0), osc("head", "x", -2.5, 2, 0.1), osc("body", "z", 2.5, 1, 0.25),
    osc("fin_l", "z", -16, 2, 0.0), osc("fin_r", "z", 16, 2, 0.0), osc("fin_l", "y", 10, 1, 0.2),
    osc("fin_r", "y", -10, 1, 0.2), osc("fin_l_tip", "z", -10, 2, 0.1), osc("fin_r_tip", "z", 10, 2, 0.1),
    keys("jaw", "x", [[0, 0], [0.8, 0], [1.4, 9], [2.2, 9], [2.8, 1], [4.0, 0], [4.6, 12], [5.6, 12], [6.4, 2],
                      [7.2, 0], [8.0, 0]]),
    keys("throat", None, [[0, [0, 0, 0]], [0.8, [0, 0, 0]], [1.4, [0, 0.2, 0]], [2.2, [0, 0.22, 0]],
                          [2.8, [0, 0.03, 0]], [4.0, [0, 0, 0]], [4.6, [0, 0.28, 0]],
                          [5.6, [0, 0.3, 0]], [6.4, [0, 0.05, 0]], [7.2, [0, 0, 0]], [8.0, [0, 0, 0]]],
         ch="scale"),
    osc("fluke_l", "x", 6, 2, 0.3), osc("fluke_r", "x", 6, 2, 0.3),
])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Whale",
    "description": "The Winterworks whale: a massive sperm whale built from block-scale boxes in the vanilla mob "
                   "style: a huge square head over a narrow toothed jaw, small dot eyes far back under a heavy brow, a "
                   "flat 9-block-wide back for a block deck, a body stepping in to a pale belly, small fins and a "
                   "broad fluke; wrinkly slate-grey skin with pale scars. Minecraft pixel units at density 1: exports "
                   "1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 400, "colors": 40},
    "light": dict(LIGHT, ao_height=30.0),
    "minecraft": {"fps": 12},
    "render": {"background": "#1a4a63", "hero": [36, 9], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "whale.json")
    dump(spec, out)
