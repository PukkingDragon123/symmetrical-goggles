"""Builds examples/monolith.json: the Monolith, the Winterworks "Living End" boss (mods/winterworks/docs/END_UPDATE.md
section 11).

    python examples/src/monolith.py examples/monolith.json

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/monolith.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/monolith

A living block of obsidian, 3 blocks wide and 7 tall, hovering over its own stepped point, drawn like the vanilla
blocks it is made of: every face is obsidian (violet-black with lighter streaky glints) or crying obsidian (its bright
violet tears). Stepped flanks, a heavy brow band under a crown of blocky obsidian spikes trimmed in gold, and three
flat eyes in a triangle: glowing enderman-violet slits set into the face, a bright 2 x 2 pupil in each that follows
its prey, a heavy obsidian lid over the top row and angry brows over the lower pair, glowing crying-obsidian tears
running down from them. Engraved rune columns smoulder violet down its face and flanks, a crack leaks the same light.
A ring of floating debris (obsidian chunks, crying-obsidian chunks, End stone and purpur rubble) circles its lower
half. Beside it float two giant blocky hands of grey-violet stone armoured in obsidian: knuckle plates and claws, a
glowing rune on the back of each hand, and a broken obsidian cuff at the wrist whose stump glows.

Units are Minecraft pixels (16 per block), density 1 (one texel per pixel, like the vanilla blocks), every box whole
pixels, so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). Faces +Z; the slab is
centred on x = z = 0 and its point hovers 2 px above y = 0 (the entity's feet). "Left" is +X.

Contract (END_UPDATE.md section 11). Bones: body (root: the slab, crown and point), eye_0 (top), eye_1 (lower left),
eye_2 (lower right; each eye_k holds eye_k_ball, the glowing eye behind its socket, eye_k_pupil, a card with the bright
2 x 2 pupil that wanders and tightens, and eye_k_lid, the upper lid card that scales down to blink), hand_l, hand_r
(separate roots; each with thumb_l / thumb_r and finger_l_0..3 / finger_r_0..3, index finger 0 to little finger 3,
every digit with a `_tip` joint), shards (a separate root: the debris ring). Clips (all additive on top of idle,
like the Frost Mauler's): idle (6 s loop), stare (2 s loop), slam_l, slam_r (1.2 s; impact at 0.9 s), grab (1.0 s,
the right hand; ends holding), clap (1.2 s; contact at 0.62 s), summon (2.0 s; the hands drive down at 1.4 s),
death (3.0 s; play it alone). Glow: the eyes and every crying-obsidian texel (runes, tears, cracks, the wrist
stumps). The eyes look out through see-through sockets in the slab's face and the pupils and lids are cards: draw the
model with a cutout render type (entityCutoutNoCull), never entitySolid.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import (LIGHT, ROOT, Rig, add, dump, jitter, keys, obsidian, osc, ramps, ring,  # noqa: E402
                             shake, skin, spin, timeline)
from obsidian_kit import crack_line, rune_column  # noqa: E402

D = 1
R = Rig(density=D, bone_style="obsidian")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= the slab
BODY_PIVOT = (0, 58, 0)
part("body", None, [30, 52, 16], "slab_face", at=BODY_PIVOT, centre=(0, 62, 0))        # y 36..88
for s, n in ((1, "l"), (-1, "r")):
    part(f"flank_{n}", "body", [4, 48, 12], "slab_flank", centre=(s * 16.0, 61, 0))      # stepped bevel
    part(f"flank_cap_{n}", f"flank_{n}", [5, 3, 13], "slab_dark", centre=(s * 16.5, 36.5, 0))
part("back_plate", "body", [24, 44, 2], "slab_back", centre=(0, 60, -9))
# the lower body steps down to the point it hovers on
part("hip", "body", [26, 10, 14], "slab_lower", centre=(0, 32, 0))                       # y 27..37
part("lower", "body", [20, 10, 12], "slab_lower", centre=(0, 23, 0))                     # y 18..28
part("base", "body", [12, 9, 12], "slab_point", centre=(0, 15.5, 0), rot=(0, 45, 0))   # a diamond
part("tip", "body", [7, 8, 7], "slab_point", centre=(0, 9, 0), rot=(0, 45, 0))
part("point", "body", [3, 5, 3], "slab_point", centre=(0, 4.5, 0), rot=(0, 45, 0))     # lowest point y 2
# broken chunks jutting from the lower edges
for k, (c, sz, rot) in enumerate([((12.5, 30, 5), [4, 5, 4], (20, 30, -28)), ((-12, 28.5, -4.5), [5, 4, 4], (-15, 10, 32)),
                                  ((9, 21, -5.5), [4, 4, 4], (30, 45, -20)), ((-8.5, 20, 5.5), [3, 4, 3], (-25, 20, 24))]):
    part(f"chunk_{k}", "body", sz, "slab_chunk", centre=c, rot=rot)

# ======================================================================= the brow band and the crown of spikes
part("crown", "body", [34, 6, 18], "crown_band", centre=(0, 91, 0))                     # y 88..94
part("crown_trim", "crown", [36, 2, 20], "gold_trim", centre=(0, 88, 0))
SPIKES = [  # (x, z, height, base width, outward lean, forward lean): a jagged crown, tallest in the middle
    (0, 2.5, 25, 8, 0, 5), (-8, 3.0, 18, 7, 14, 8), (8.5, 3.0, 19, 7, 12, 7), (-15, 3.0, 12, 6, 36, 9),
    (15, 3.0, 13, 6, 32, 8),
    (-4.5, -4.5, 15, 6, 8, -11), (4.5, -4.5, 14, 6, 10, -10), (-12, -4, 10, 6, 28, -14), (12, -4, 9, 6, 30, -13),
]


def whole(v, lo=1):
    """Round to whole pixels."""
    return max(lo, int(round(v)))


for k, (x, z, h, w, lz, lx) in enumerate(SPIKES):
    lz = -abs(lz) if x > 0 else abs(lz) if x < 0 else 0     # every spike leans away from the middle
    h0, h1, h2 = whole(h * 0.45), whole(h * 0.35), whole(h * 0.32)
    b = part(f"spike_{k}", "crown", [w, h0, w], "spike", at=(x, 93.0, z), offset=(0, h0 / 2, 0),
             rot=(lx, 45 + 7 * k, lz))
    m = part(f"spike_{k}_mid", b["id"], [whole(w * 0.66), h1, whole(w * 0.66)],
             "spike", rel=(0, h0 - 0.5, 0), offset=(0, h1 / 2, 0), rot=(lx * 0.25, 14, lz * 0.35))
    part(f"spike_{k}_tip", m["id"], [whole(w * 0.36), h2, whole(w * 0.36)],
         "spike_tip", rel=(0, h1 - 0.5, 0), offset=(0, h2 / 2, 0), rot=(lx * 0.2, -12, lz * 0.45))
# blocky teeth along the brow band's front and back edges
for k, x in enumerate((-12.5, -4.5, 4.5, 12.5)):
    for side, z in (("f", 8.0), ("b", -8.0)):
        part(f"tooth_{side}{k}", "crown", [3, 4, 3], "spike", at=(x, 94.0, z), offset=(0, 1.5, 0),
             rot=(10 if z > 0 else -10, 45, -x * 1.2))

# ======================================================================= the three eyes (a triangle on the face)
# Each eye looks out through a rectangular socket cut in the slab's face (a transparent stamp ringed by a dark crease).
# Behind the socket, back to front: the glowing eye box (1 px bigger than the socket all round, its front 0.5 px behind
# the face), the pupil card (it wanders and tightens) and the obsidian lid card, which covers the socket's top row (a
# heavy-lidded glare; slanted with the brows on the lower pair). The face clips pupil and lid to the socket. The lid's
# pivot is its top edge, so scaling it in y drops it over the whole socket: a blink.
FACE_Z = 8.0
# (x, y, socket w, socket h, unused, lid height, lid slant): eye_0 top, eye_1 lower left, eye_2 lower right
EYES = [(0, 77.5, 8, 3, 0, 1, 0), (8, 65.5, 8, 3, 0, 1, 9), (-8, 65.5, 8, 3, 0, 1, -9)]
PUPIL = ["Ww", "wW"]
for k, (x, y, w, h, _, lid_h, slant) in enumerate(EYES):
    bone(f"eye_{k}", "body", at=(x, y, FACE_Z))
    part(f"eye_{k}_ball", f"eye_{k}", [w + 2, h + 2, 1], f"eye_ball_{k}", rel=(0, 0, -1.0))   # front at z 7.5
    card(f"eye_{k}_pupil", f"eye_{k}", PUPIL, "pupil", rel=(0, -0.5, -0.4))                      # z 7.6
    card(f"eye_{k}_lid", f"eye_{k}", [("L" * (w + 4))] * lid_h, "lid", rel=(0, h / 2, -0.2),      # z 7.8
         offset=(0, -lid_h / 2, 0), rot=(0, 0, slant))
for k, s in ((1, 1), (2, -1)):     # heavy brows slanting down to the middle: an angry V
    part(f"brow_{k}", "body", [11, 2, 3], "brow", centre=(s * 8.5, 69.5, 8.5), rot=(0, 0, s * 13))
part("brow_0", "body", [12, 2, 3], "brow", centre=(0, 81.0, 8.5))

# ======================================================================= the debris ring
SHARD_Y = 23.0
bone("shards", None, at=(0, SHARD_Y, 0))
rng = random.Random(11)
SHARDS = []
for k in range(11):
    a = 360.0 * k / 11 + rng.uniform(-9, 9)
    rad = rng.uniform(21.5, 26)
    y = rng.uniform(-4.5, 5)
    kind = ["shard", "shard_vein", "shard", "rubble_end", "shard_vein", "shard", "rubble_purpur", "shard",
            "shard_vein", "rubble_end", "shard"][k]
    size = [rng.choice([4, 4, 5, 5, 6]), rng.choice([4, 5, 6, 7, 8]), rng.choice([3, 4, 4])]
    if kind.startswith("rubble"):
        size = [rng.choice([4, 5]), 4, rng.choice([4, 5])]
    rot = (rng.uniform(-35, 35), rng.uniform(0, 90), rng.uniform(-40, 40))
    sid = f"shard_{k}"
    part(sid, "shards", size, kind, rel=(rad * math.sin(math.radians(a)), y, rad * math.cos(math.radians(a))), rot=rot)
    if k % 3 == 0:     # a splinter chipped off the bigger chunks
        part(f"{sid}_chip", sid, [2, 3, 2], "shard", rel=(size[0] * 0.5 + 0.6, size[1] * 0.3, 0), rot=(0, 30, -35))
    SHARDS.append((sid, a, rad, y))


# ======================================================================= the hands
def H(n, s):
    return n.replace("#", "l" if s > 0 else "r")


HAND_REST = (37.0, 46.0, 11.0)                  # palm centre of hand_l; hand_r mirrors it across x
HAND_ROT = (12.0, -10.0, -16.0)                 # pitch the fingers down, yaw them in, roll the palm toward the body
# index (0) to little finger (3): x across the palm (inner side first), proximal / distal lengths, width
FINGERS = [(-7.5, 8, 7, 5), (-2.5, 9, 8, 5), (2.5, 9, 7, 5), (7.5, 7, 6, 4)]
FIST_CURL = [(84, 96), (88, 98), (86, 98), (82, 94)]


def hand(s):
    n = "l" if s > 0 else "r"
    hx, hy, hz = HAND_REST
    root = bone(f"hand_{n}", None, at=(s * hx, hy, hz), rot=(HAND_ROT[0], s * HAND_ROT[1], s * HAND_ROT[2]))
    hid = root["id"]
    part(f"palm_{n}", hid, [20, 8, 17], "stone_palm", rel=(0, 0, 0))
    part(f"back_{n}", hid, [17, 2, 12], "hand_plate", rel=(0, 4.5, -1.0), rot=(-3, 0, 0))
    part(f"knuckles_{n}", hid, [21, 4, 4], "knuckle_plate", rel=(0, 2.5, 7.0))
    # the broken wrist: a jagged obsidian cuff, its torn stump glowing
    part(f"cuff_{n}", hid, [16, 9, 5], "cuff", rel=(0, 0.5, -10.0))
    part(f"stump_{n}", hid, [12, 6, 1], "stump", rel=(0, 0.5, -13.0))
    for j, (rel, sz, rot) in enumerate([((s * 5, 4.5, -10), [3, 5, 3], (-30, 20, s * -25)),
                                        ((s * -4.5, 4, -10.5), [3, 4, 3], (-35, 10, s * 20)),
                                        ((s * 7, -3, -10), [3, 4, 3], (-150, 15, s * -30))]):
        part(f"cuff_spike_{n}{j}", hid, sz, "cuff_spike", rel=rel, offset=(0, sz[1] / 2, 0), rot=rot)
    # four fingers on the knuckle line, each a proximal and a distal joint, an obsidian claw at the end
    for k, (fx, l1, l2, w) in enumerate(FINGERS):
        f = part(f"finger_{n}_{k}", hid, [w, 5, l1], "finger", rel=(s * fx, 0.25, 8.0), offset=(0, 0, l1 / 2),
                 rot=(18 + 2 * k, s * (-3 + 2.5 * k), 0))
        part(f"finger_{n}_{k}_plate", f["id"], [w + 1, 1, l1 - 2], "finger_plate", rel=(0, 3.0, l1 / 2 - 0.5))
        t = part(f"finger_{n}_{k}_tip", f["id"], [w - 1, 4, l2], "finger", rel=(0, -0.5, l1 - 0.5),
                 offset=(0, 0, l2 / 2), rot=(22, 0, 0))
        part(f"finger_{n}_{k}_claw", t["id"], [w - 2, 2, 3], "claw", rel=(0, 0.5, l2 - 0.25), offset=(0, 0, 1),
             rot=(28, 0, 0))
    # the thumb, on the inner side near the wrist, angled forward and in
    th = part(f"thumb_{n}", hid, [5, 5, 8], "finger", rel=(s * -9.0, -1.0, -1.5), offset=(0, 0, 4),
              rot=(22, s * -38, s * 10))
    part(f"thumb_{n}_plate", th["id"], [6, 1, 5], "finger_plate", rel=(0, 3.0, 4))
    tt = part(f"thumb_{n}_tip", th["id"], [4, 4, 6], "finger", rel=(0, -0.5, 7.5), offset=(0, 0, 3.0),
              rot=(18, 0, 0))
    part(f"thumb_{n}_claw", tt["id"], [3, 2, 3], "claw", rel=(0, 0.5, 6.0), offset=(0, 0, 1), rot=(28, 0, 0))


hand(1)
hand(-1)

# ======================================================================= palette and paint
RAMPS = ramps("obsidian", "crying", "eyeglow", "stone", "gold", "purpur", "endstone")
RUNE_KEY = {"r": "crying:3", "R": "crying:5", "g": "obsidian:0", "w": "obsidian:1"}
FW, FH = 30, 52       # body front in texels; row 0 is y = 88


def face_xy(x, y):
    return int(round(x + 15)), int(round(88 - y))


FACE_STAMPS = []
for k, (x, y, w, h, _, lid_h, slant) in enumerate(EYES):
    # the socket: a see-through opening ringed by a dark crease, a glowing tear running down from its lower corner
    art = ["k" * (w + 2)] + ["k" + "_" * w + "k" for _ in range(h)] + ["k" * (w + 2)]
    tears = []
    if k:   # the lower eyes cry from their outer corners (image-right on eye_1, the left side; image-left on eye_2)
        col = w if k == 1 else 1
        tears = ["".join(c if i == col else "." for i in range(w + 2)) for c in "tTt"]
    cx, cy = face_xy(x - w / 2, y + h / 2)
    FACE_STAMPS.append({"face": "front", "at": [cx - 1, cy - 1], "art": art + tears,
                        "key": {"k": "obsidian:0", "t": "crying:3", "T": "crying:5"}})
COL_MID = rune_column(2, seed=3)
FACE_STAMPS.append({"face": "front", "at": [FW // 2 - len(COL_MID[0]) // 2, 27], "art": COL_MID, "key": RUNE_KEY})
# a glowing crack splitting the face from the brow band down past eye_2
FACE_STAMPS.append({"face": "front", "at": [2, 0], "art": crack_line(7, 20, seed=5, x0=2, branches=2),
                    "key": {"c": "crying:3", "C": "crying:5", "d": "obsidian:0"}})
FLANK_COL = rune_column(4, seed=21)
HAND_RUNE = ["..rrr..", ".r...r.", "r..R..r", "r.RRR.r", "r..R..r", ".r...r.", "..rrr.."]

SHADE_LOW = {"id": "shade_low", "op": "gradient", "axis": "y", "amount": 0.6}
styles = {
    "obsidian": obsidian(),
    "slab_face": obsidian(3.2, tears=0.25, layers=[SHADE_LOW], stamps=FACE_STAMPS),
    "slab_flank": obsidian(3.4, tears=0.3, layers=[SHADE_LOW],
                           stamps=[{"faces": ["left", "right"], "at": [1, 4], "art": FLANK_COL, "key": RUNE_KEY}]),
    "slab_back": obsidian(3.0, tears=0.6),
    "slab_dark": obsidian(2.6),
    "slab_lower": obsidian(3.0, tears=0.4, layers=[SHADE_LOW]),
    "slab_point": obsidian(3.0, tears=0.7, layers=[SHADE_LOW]),
    "slab_chunk": obsidian(3.2),
    "crown_band": obsidian(3.0, tears=0.2),
    "gold_trim": skin("gold", 4.2, grain=0.6, lip=1.6, shade=-1.4, clusters=False, dark_low=0, layers=[
        {"id": "studs", "op": "stripes", "axis": "x", "period": 4.0, "width": 0.25, "shift": 1.6}]),
    "spike": obsidian(3.6, layers=[{"id": "rise", "op": "gradient", "axis": "y", "amount": 0.6}]),
    "spike_tip": obsidian(4.4, streaks=False, layers=[{"id": "rise", "op": "gradient", "axis": "y", "amount": 0.8}]),
    "brow": obsidian(3.4, layers=[{"id": "under", "op": "fill", "ramp": "crying", "tone": 1.4, "faces": ["bottom"]}]),
    # the eye: enderman violet, brightest in the middle row, darker at its ends
    "pupil": {"ramp": "eyeglow", "tone": 6, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
              "art_key": {"W": "eyeglow:6", "w": "eyeglow:5"}},
    "lid": {"ramp": "obsidian", "tone": 4, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "art_key": {"L": "obsidian:5"}},
    "shard": obsidian(3.2),
    "shard_vein": obsidian(3.0, tears=1.0),
    "rubble_end": skin("endstone", 5.0, grain=1.0, lip=1.2, shade=-1.0, dark_low=0,
                       layers=[{"id": "pits", "op": "spots", "count": 4, "radius": [0.4, 0.7], "shift": -1.4}]),
    "rubble_purpur": skin("purpur", 4.6, grain=0.6, lip=1.2, shade=-1.0, dark_low=0,
                          layers=[{"id": "bricks", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.3,
                                   "shift": -1.4}]),
    # the hands: weathered grey-violet stone, armoured in obsidian
    "stone_palm": skin("stone", 5.0, grain=1.0, lip=1.4, shade=-1.0, layers=[
        {"id": "cracks", "op": "cracks", "scale": 3.0, "width": 0.05, "shift": -1.6},
        {"id": "lines", "op": "cracks", "scale": 4.0, "width": 0.06, "threshold": 0.55, "ramp": "crying",
         "tone": 2.6, "seed": 6, "faces": ["bottom"]}]),
    "finger": skin("stone", 5.2, grain=0.9, lip=1.4, shade=-1.0, layers=[
        {"id": "creases", "op": "stripes", "axis": "z", "period": 4.0, "width": 0.2, "shift": -1.4,
         "faces": ["bottom", "left", "right"]}]),
    "finger_plate": obsidian(3.6, streaks=False),
    "hand_plate": obsidian(3.4, stamps=[{"face": "top", "at": "center", "art": HAND_RUNE, "key": RUNE_KEY}]),
    "knuckle_plate": obsidian(3.2),
    "claw": obsidian(4.2, streaks=False, layers=[{"id": "edge", "op": "gradient", "axis": "z", "amount": 0.8}]),
    "cuff": obsidian(3.0, tears=0.4),
    "cuff_spike": obsidian(4.0, streaks=False),
    "stump": skin("crying", 4.0, grain=0.8, light=0.2, lip=0.8, shade=-0.8, clusters=False, dark_low=0, layers=[
        {"id": "core", "op": "spots", "count": 3, "radius": [0.8, 1.4], "ramp": "crying", "tone": 6.2,
         "faces": ["back"]}]),
}
for k, (x, y, w, h, _, lid_h, slant) in enumerate(EYES):
    # the eye behind the socket: a violet slit, white-hot along its middle row, deep violet at its ends and edges
    ew, eh = w + 2, h + 2
    rows = []
    for j in range(eh):
        row = ""
        for i in range(ew):
            edge = i in (0, ew - 1) or j in (0, eh - 1)
            end = i in (1, ew - 2)
            mid = j == eh // 2 + (0 if eh % 2 else -1) or j == eh // 2
            row += "a" if edge else ("b" if end else ("d" if mid else "c"))
        rows.append(row)
    styles[f"eye_ball_{k}"] = {
        "ramp": "eyeglow", "tone": 2, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
        "stamps": [{"face": "front", "at": "top-left", "art": rows,
                    "key": {"a": "eyeglow:0", "b": "eyeglow:2", "c": "eyeglow:3", "d": "eyeglow:4"}}]}

# ======================================================================= clips
# Poses are dicts of offsets from the rest pose ({part: {"r"|"p"|"s": [x, y, z]}}) keyed on timelines (hex_kit).
# Hand positions are model-space offsets of the hand roots; x is written "outward", so one pose serves both hands.
HANDS = (1, -1)
EYE_IDS = [f"eye_{k}" for k in range(3)]


def hn(s):
    return "l" if s > 0 else "r"


def hpos(s, x=0, y=0, z=0):
    return {f"hand_{hn(s)}": {"p": [s * x, y, z]}}


def hrot(s, x=0, y=0, z=0):
    return {f"hand_{hn(s)}": {"r": [x, s * y, s * z]}}


def hscale(s, x=0, y=0, z=0):
    return {f"hand_{hn(s)}": {"s": [x, y, z]}}


def digits(s, curl=0.0, tip=None, spread=0.0, thumb=0.0, thumb_in=0.0):
    """One hand's fingers: `curl` degrees at the knuckles (+ toward the palm), `tip` at the middle joints, `spread`
    fans them apart (degrees at the outer fingers), `thumb` curls the thumb, `thumb_in` swings it across the palm."""
    n = hn(s)
    tip = curl if tip is None else tip
    p = {}
    for k in range(4):
        fan = spread * (-1.0, -0.35, 0.35, 1.0)[k]
        p[f"finger_{n}_{k}"] = {"r": [curl + (k - 1.5) * 0.04 * abs(curl), s * fan, 0]}
        p[f"finger_{n}_{k}_tip"] = {"r": [tip, 0, 0]}
    p[f"thumb_{n}"] = {"r": [thumb, s * -thumb_in, 0]}
    p[f"thumb_{n}_tip"] = {"r": [thumb * 0.8, 0, 0]}
    return p


def fist(s, tight=0.0):
    return digits(s, 68 + tight, 80 + tight, thumb=26 + tight * 0.5, thumb_in=34)


def open_hand(s, amt=1.0):
    return digits(s, -24 * amt, -14 * amt, spread=16 * amt, thumb=-12 * amt, thumb_in=-22 * amt)


def body(x=0, y=0, z=0, px=0, py=0, pz=0):
    return {"body": {"r": [x, y, z], "p": [px, py, pz]}}


def eyes(sx, sy=None, which=EYE_IDS):
    sy = sx if sy is None else sy
    return {e: {"s": [sx, sy, 0]} for e in which}


def pupils(sx):
    """The irises tighten (sx < 0) or widen, staying round."""
    return {f"{e}_pupil": {"s": [sx, sx, 0]} for e in EYE_IDS}


def both(fn, *a, **kw):
    return add(*[fn(s, *a, **kw) for s in HANDS])


def lid_shut(k):
    """The y-scale offset that drops eye_k's upper lid over the whole opening (a little more for a slanted lid)."""
    x, y, w, h, iris, lid_h, slant = EYES[k]
    return round((h + 0.5 + (1.0 if slant else 0.0)) / lid_h - 1.0, 3)


def blink(k, t, dur=0.18, length=6.0):
    """eye_k's upper lid drops shut and lifts again."""
    shut = lid_shut(k)
    return {"part": f"eye_{k}_lid", "channel": "scale", "ease": "ease",
            "keys": [[0, [0, 0, 0]], [round(t, 3), [0, 0, 0]], [round(t + dur * 0.4, 3), [0, shut, 0]],
                     [round(t + dur * 0.6, 3), [0, shut, 0]], [round(t + dur, 3), [0, 0, 0]], [length, [0, 0, 0]]]}


def const(part_, v, length, ch="rotation"):
    return {"part": part_, "channel": ch, "keys": [[0, list(v)], [length, list(v)]], "ease": "linear"}


ANIM = {}

# ---- idle (6 s loop): the slab breathes up and down and sways; the hands drift on their own beat, fingers flexing
# in a wave; the eyes blink now and then and the pupils wander; the debris ring turns once and every shard bobs and
# tumbles.
L = 6.0
tr = [spin("shards", L, 1.0),
      osc("body", None, [0, 1.5, 0], 2, ch="position"), osc("body", "x", 1.0, 1, 0.1), osc("body", "z", 1.2, 1, 0.35),
      blink(0, 2.1, length=L), blink(1, 4.6, length=L), blink(2, 4.62, length=L)]
for k in range(3):
    tr.append(osc(f"eye_{k}_pupil", None, [0.6, 0.2, 0], 1, 0.15 * k, ch="position"))
for s, ph in ((1, 0.0), (-1, 0.42)):
    n = hn(s)
    tr += [osc(f"hand_{n}", None, [0.8 * s, 2.4, 1.0], 2, ph + 0.1, ch="position"),
           osc(f"hand_{n}", "z", 4 * s, 1, ph + 0.2), osc(f"hand_{n}", "x", 3, 1, ph + 0.55),
           osc(f"thumb_{n}", "x", 6, 1, ph + 0.3)]
    for k in range(4):
        tr += [osc(f"finger_{n}_{k}", "x", 7, 1, ph + 0.07 * k), osc(f"finger_{n}_{k}_tip", "x", 9, 1, ph + 0.07 * k + 0.06)]
for sid, a, rad, y in SHARDS:
    h = sum(map(ord, sid))
    tr += [osc(sid, None, [0, 1.3, 0], 2 + h % 2, (h % 10) / 10.0, ch="position"),
           osc(sid, "x", 14, 1, (h % 7) / 7.0), osc(sid, "z", 11, 1, (h % 5) / 5.0)]
ANIM["idle"] = {"length": L, "loop": True, "tracks": tr}

# ---- stare (2 s loop, an overlay on idle): it leans in over its prey, the eyes bulge and throb, the lids lift off
# the irises and the irises tighten into a glare, the hands lift a little and curl into claws, the debris trembles.
L = 2.0
tr = [const("body", [5, 0, 0], L), osc("body", "x", 0.8, 2),
      const("body", [0, -1.0, 2.0], L, ch="position")]
for k in range(3):
    tr += [const(f"eye_{k}", [0.16, 0.24, 0], L, ch="scale"), osc(f"eye_{k}", None, [0.05, 0.07, 0], 2, 0.1 * k, ch="scale"),
           const(f"eye_{k}", [0, 0, 0.2], L, ch="position"),
           const(f"eye_{k}_pupil", [-0.2, -0.2, 0], L, ch="scale"),
           const(f"eye_{k}_lid", [0, -0.4, 0], L, ch="scale")]
for s in HANDS:
    n = hn(s)
    tr += [const(f"hand_{n}", [s * -2.0, 3.0, 4.0], L, ch="position"), const(f"hand_{n}", [-6, 0, 0], L)]
    for k in range(4):
        tr += [const(f"finger_{n}_{k}", [14, 0, 0], L), const(f"finger_{n}_{k}_tip", [22, 0, 0], L),
               osc(f"finger_{n}_{k}", "x", 4, 2, 0.1 * k + (0 if s > 0 else 0.5))]
for sid, a, rad, y in SHARDS:
    tr.append(osc(sid, None, [0.25, 0.35, 0.25], 4, (sum(map(ord, sid)) % 9) / 9.0, ch="position"))
ANIM["stare"] = {"length": L, "loop": True, "tracks": tr}


# ---- slam_l / slam_r (1.2 s): a dip, then the hand flies up high and clenches into a fist, cocked back and
# trembling over its target (the shadow telegraph), then drives down knuckles-first and crunches into the floor at
# 0.9 s 2.3 blocks ahead; the slab leans into the blow; the fist springs back to its place.
def slam(s):
    n = hn(s)
    RAISED = add(hpos(s, -6, 36, 9), hrot(s, -58, 8, 10), fist(s))
    HIT = add(hpos(s, -13, -36, 25), hrot(s, 80, 0, 4), fist(s, 6))
    keys_ = [
        (0.0, {}, None),
        (0.14, add(hpos(s, 3, -3, -3), hrot(s, 10, 0, 0), digits(s, -12, -8, spread=8), body(-1.5, 0, s * 1.0)), "ease"),
        (0.42, add(RAISED, body(-3, 0, s * -2.5), eyes(0.14)), "out"),
        (0.72, add(RAISED, hpos(s, -1, 2, 0), hrot(s, -6, 0, 0), body(-3.5, 0, s * -3), eyes(0.18)), "ease"),
        (0.9, add(HIT, body(4.5, 0, s * -4, py=-2.0), eyes(0.08)), "in"),
        (0.98, add(HIT, hscale(s, 0.08, -0.1, 0.08), body(5.0, 0, s * -4.5, py=-2.5)), "out"),
        (1.2, {}, "ease"),
    ]
    return timeline(1.2, keys_, lock=False, extra=[
        jitter(f"hand_{n}", 0.46, 0.74, 3.0, step=0.04, axis=2, seed=3 + s),
        jitter(f"hand_{n}", 0.48, 0.74, 2.0, step=0.05, axis=0, seed=5 + s),
        shake("body", 0.9, 1.15, [0.8, 0, 1.4], freq=12)])


ANIM["slam_l"] = slam(1)
ANIM["slam_r"] = slam(-1)

# ---- grab (1.0 s, the right hand; ends holding): it rears back with the fingers splayed, lunges low 2.2 blocks
# ahead, snaps shut, squeezes, and lifts its catch up before its eyes, still crushing. Hold the last frame while the
# victim is held; blend back to idle when it throws.
s = -1
CAUGHT = add(hpos(s, -29, -33, 24), hrot(s, 30, 15, 10))
HELD = add(hpos(s, -31, 18, 17), hrot(s, -14, 34, 4))
ANIM["grab"] = timeline(1.0, [
    (0.0, {}, None),
    (0.16, add(hpos(s, 4, 8, -6), hrot(s, -25, 0, 0), open_hand(s, 1.2), body(-2, 0, 0), eyes(0.1)), "ease"),
    (0.4, add(hpos(s, -29, -34, 24), hrot(s, 36, 15, 10), open_hand(s, 1.0), body(5, 0, 2), eyes(0.2)), "out"),
    (0.5, add(CAUGHT, fist(s), body(5, 0, 2), eyes(0.2)), "in"),
    (0.6, add(CAUGHT, hpos(s, 0, 2, 0), fist(s, 8), hscale(s, 0.06, -0.06, 0.06), body(4, 0, 2), eyes(0.2)), "ease"),
    (0.88, add(HELD, fist(s, 6), body(-3, 0, 0), eyes(0.24), pupils(-0.22)), "out"),
    (1.0, add(HELD, hpos(s, 0, -1, 0), fist(s, 10), hscale(s, 0.06, -0.06, 0.06), body(-3, 0, 0), eyes(0.26),
              pupils(-0.26)), "ease"),
], lock=False, extra=[jitter("hand_r", 0.88, 1.0, 2.5, step=0.03, axis=2, seed=9)])

# ---- clap (1.2 s): both hands swing up and out, turning their palms in, then rush together low in front and clap at
# 0.62 s (the floor shockwave), shudder against each other, and float back.
CLAP_OPEN = lambda s: digits(s, -20, -16, spread=4, thumb=-8, thumb_in=-14)    # noqa: E731
ANIM["clap"] = timeline(1.2, [
    (0.0, {}, None),
    (0.12, add(both(hpos, 2, -3, -2), both(digits, -8, -5), body(-1, py=-1.5)), "ease"),
    (0.45, add(both(hpos, 16, 20, 10), both(hrot, -10, -22, -74), *[CLAP_OPEN(s) for s in HANDS], body(-4, py=3),
               eyes(0.16)), "out"),
    (0.62, add(both(hpos, -33, -33, 21), both(hrot, 0, -4, -74), *[CLAP_OPEN(s) for s in HANDS], body(5, py=-2.5),
               eyes(0.1)), "in"),
    (0.7, add(both(hpos, -33, -33, 21), both(hrot, 0, -4, -74), both(hscale, -0.06, 0.05, 0.04),
              *[CLAP_OPEN(s) for s in HANDS], body(5.5, py=-3)), "out"),
    (0.86, add(both(hpos, -32.5, -32, 21), both(hrot, 0, -4, -74), *[CLAP_OPEN(s) for s in HANDS], body(4, py=-2)),
     "ease"),
    (1.2, {}, "ease"),
], lock=False, extra=[shake("hand_l", 0.62, 0.86, [0, 0, 3], freq=14), shake("hand_r", 0.62, 0.86, [0, 0, -3], freq=14),
                      shake("body", 0.62, 0.9, [1.0, 0, 1.2], freq=12)])


# ---- summon (2.0 s): it crouches, then rises tall and leans back, flinging both hands up to the sky with the fingers
# splayed while its eyes blaze and the debris whirls round once and lifts outward; at 1.4 s it drives both hands down
# flat against the floor (the Obolisks rise), and settles.
def shard_out(dist, dy):
    out = {}
    for sid, a, rad, y in SHARDS:
        out[sid] = {"p": [dist * math.sin(math.radians(a)), dy, dist * math.cos(math.radians(a))]}
    return out


RAISE = lambda s, up=0: add(hpos(s, 6, 40 + up, -4), hrot(s, -100, 0, -10), digits(s, -18, 8, spread=20, thumb=-10, thumb_in=-25))  # noqa: E731
DOWN = lambda s: add(hpos(s, -6, -38, 10), hrot(s, 14, 0, 0), digits(s, -16, -10, spread=16, thumb=-10, thumb_in=-20))  # noqa: E731
ANIM["summon"] = timeline(2.0, [
    (0.0, {}, None),
    (0.22, add(body(3, py=-3), both(hpos, 1, -5, 0), both(digits, 20, 25), shard_out(-2, -2)), "ease"),
    (0.7, add(body(-7, py=7), *[RAISE(s) for s in HANDS], eyes(0.24), shard_out(6, 6)), "out"),
    (1.2, add(body(-8, py=8), *[RAISE(s, 3) for s in HANDS], eyes(0.3), shard_out(8, 8)), "ease"),
    (1.4, add(body(7, py=-5), *[DOWN(s) for s in HANDS], eyes(0.12), shard_out(2, -3)), "in"),
    (1.52, add(body(7.5, py=-5.5), *[DOWN(s) for s in HANDS], both(hscale, 0.06, -0.08, 0.06), eyes(0.1),
               shard_out(0, -2)), "out"),
    (2.0, {}, "ease"),
], lock=False, extra=[
    keys("shards", "y", [[0, 0], [0.3, 0], [1.45, 360, "inout_back"], [2.0, 360]], ease="ease"),
    jitter("body", 0.72, 1.2, 1.2, step=0.05, axis=2, seed=12),
    jitter("hand_l", 0.72, 1.2, 3.0, step=0.04, axis=1, seed=13), jitter("hand_r", 0.72, 1.2, 3.0, step=0.04, axis=1, seed=14),
    shake("body", 1.4, 1.65, [1.2, 0, 1.0], freq=12)])

# ---- death (3.0 s, alone): the slab convulses and its eyes flicker and gutter out one by one; the hands spasm,
# claw, then drop like stones and bounce; the debris rains down; the slab sinks onto its point and keels over with
# a crash that snaps two spikes off its crown. Ends collapsed.
HAND_DROP = lambda s, b=0: add(hpos(s, 5, -40 + b, 4), hrot(s, 12, 18, 38), digits(s, 8, 12, spread=12, thumb=-6, thumb_in=-10))  # noqa: E731
death_keys = [
    (0.0, {}, None),
    (0.3, add(body(-3, 0, 2, py=2), both(hpos, 3, 5, 0), both(hrot, -10, 0, 12), both(open_hand, 1.3)), "out"),
    (0.6, add(body(-4, 0, -2, py=3), both(hpos, 2, 7, 2), both(hrot, -4, 0, 6), both(fist, -20)), "ease"),
    (0.95, add(body(-3, 0, 1, py=3.5), both(hpos, 2, 6, 2), both(digits, 30, 40)), "ease"),
    (1.45, add(body(0, 0, 0, py=0), *[HAND_DROP(s) for s in HANDS]), "in"),
    (1.58, add(body(1, 0, -0.5, py=-1), *[HAND_DROP(s, 3) for s in HANDS]), "out"),
    (1.7, add(body(2, 0, -1, py=-2), *[HAND_DROP(s) for s in HANDS]), "in"),
    (2.3, add(body(16, 0, -7, py=-11), *[HAND_DROP(s) for s in HANDS]), "in"),
    (2.42, add(body(14, 0, -6, py=-9.5), *[HAND_DROP(s) for s in HANDS]), "out"),
    (2.56, add(body(16, 0, -7, py=-11), *[HAND_DROP(s) for s in HANDS]), "in"),
    (3.0, add(body(16, 0, -7, py=-11), *[HAND_DROP(s) for s in HANDS]), "ease"),
]
extra = [shake("body", 0.0, 0.95, [1.5, 0, 2.5], freq=11)]
for k, t_out in ((1, 0.7), (2, 1.0), (0, 1.35)):     # the eyes start wide, flutter, then the lids fall shut
    shut = lid_shut(k)
    extra.append({"part": f"eye_{k}", "channel": "scale", "ease": "ease", "keys": [
        [0, [0, 0, 0]], [0.1, [0.2, 0.2, 0]], [0.26, [0.12, 0.1, 0]], [t_out - 0.2, [0, 0, 0]], [3.0, [0, 0, 0]]]})
    extra.append({"part": f"eye_{k}_lid", "channel": "scale", "ease": "ease", "keys": [
        [0, [0, 0, 0]], [0.1, [0, -0.4, 0]], [0.18, [0, shut * 0.6, 0]], [0.26, [0, -0.2, 0]],
        [t_out - 0.2, [0, 0, 0]], [t_out - 0.12, [0, shut * 0.8, 0]], [t_out - 0.06, [0, shut * 0.25, 0]],
        [t_out, [0, shut, 0]], [3.0, [0, shut, 0]]]})
rng_d = random.Random(4)
for j, (sid, a, rad, y) in enumerate(SHARDS):
    t0 = 0.95 + 0.08 * j + rng_d.uniform(0, 0.1)
    drop = SHARD_Y + y - 2.0
    tumble = rng_d.choice((-1, 1)) * rng_d.uniform(70, 140)
    extra.append({"part": sid, "channel": "position", "ease": "ease", "keys": [
        [0, [0, 0, 0]], [round(t0, 3), [0, 0.6, 0]], [round(t0 + 0.32, 3), [0, -drop, 0], "in"],
        [round(t0 + 0.42, 3), [0, -drop + 1.5, 0], "out"], [round(t0 + 0.52, 3), [0, -drop, 0], "in"], [3.0, [0, -drop, 0]]]})
    extra.append({"part": sid, "channel": "rotation", "ease": "ease", "keys": [
        [0, [0, 0, 0]], [round(t0, 3), [0, 0, 0]], [round(t0 + 0.32, 3), [tumble * 0.3, 0, tumble], "in"],
        [3.0, [tumble * 0.3, 0, tumble]]]})
extra.append(keys("shards", "y", [[0, 0], [1.0, 40, "out"], [3.0, 40]], ease="ease"))
for sp, dx, tz in (("spike_3", -10, 95), ("spike_4", 9, -100)):   # the two outer front spikes snap off and fall
    extra.append({"part": sp, "channel": "position", "ease": "ease", "keys": [
        [0, [0, 0, 0]], [2.3, [0, 0, 0]], [2.36, [dx * 0.1, 1.5, 1.0], "out"], [2.85, [dx, -80, 6], "in"], [3.0, [dx, -80, 6]]]})
    extra.append({"part": sp, "channel": "rotation", "ease": "ease", "keys": [
        [0, [0, 0, 0]], [2.32, [0, 0, 0]], [2.85, [40, 0, tz], "in"], [3.0, [40, 0, tz]]]})
ANIM["death"] = timeline(3.0, death_keys, lock=False, extra=extra)


# ---- contacts: put the fists and palms exactly on the floor (and the clapping palms exactly together)
def _hand_ids(s):
    root = f"hand_{hn(s)}"
    kids, ids = {root}, []
    for p_ in R.P:
        if p_["id"] == root or p_.get("parent") in kids:
            kids.add(p_["id"])
            ids.append(p_["id"])
    return ids


def _extent(clip, t, ids, axis, lo=True):
    sys.path.insert(0, ROOT)
    from lowpix.anim import Animator
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points

    class _M:
        pass
    m = _M()
    m.instances = expand_instances(R.P, float(D))
    m.spec = {"animations": {clip: ANIM[clip]}}
    W = Animator(m).world_matrices(clip, t)
    vals = [transform_points(W[i.id], f.pts)[:, axis] for i in m.instances if i.id in ids for f in i.faces]
    return float(min(v.min() for v in vals)) if lo else float(max(v.max() for v in vals))


def _nudge(clip, part_, times, axis, delta):
    for track in ANIM[clip]["tracks"]:
        if track["part"] == part_ and track.get("channel") == "position":
            for k in track["keys"]:
                if any(abs(k[0] - t) < 1e-6 for t in times):
                    k[1][axis] = round(k[1][axis] + delta, 3)


def floor(clip, s, t, times, y=0.0):
    _nudge(clip, f"hand_{hn(s)}", times, 1, y - _extent(clip, t, _hand_ids(s), 1))


floor("slam_l", 1, 0.9, (0.9, 0.98))
floor("slam_r", -1, 0.9, (0.9, 0.98))
floor("grab", -1, 0.5, (0.4, 0.5, 0.6), 0.5)       # the snatch skims the floor without biting into it
for s in HANDS:
    floor("summon", s, 1.4, (1.4, 1.52))
    floor("death", s, 1.45, (1.45, 1.7, 2.3, 2.42, 2.56, 3.0))
    floor("death", s, 1.58, (1.58,), 3.0)
    # palms meet in the middle (x = 0), the lower edges just above the floor
    gap = _extent("clap", 0.62, _hand_ids(s), 0, lo=s > 0)
    _nudge("clap", f"hand_{hn(s)}", (0.62, 0.7, 0.86), 0, -gap + s * 0.25)
    floor("clap", s, 0.62, (0.62, 0.7, 0.86), 1.0)

GLOW = [f"eye_{k}_pupil" for k in range(3)] + [f"eye_{k}_ball" for k in range(3)]
spec = {
    "name": "Monolith",
    "description": "The Winterworks Monolith: a towering living block of obsidian and crying obsidian, a boss with a "
                   "crown of blocky spikes, three flat glowing violet eyes with bright pupils under heavy lids and "
                   "angry brows, crying-obsidian tears and rune columns, a ring of floating debris and two giant "
                   "floating stone-and-obsidian hands. Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": D,
    "grounded": False,
    "budget": {"tris": 2000, "colors": 72},
    "light": dict(LIGHT, gradient=0.25, ao=0.0),
    "minecraft": {"fps": 20, "glow_parts": GLOW, "glow_ramps": ["crying", "eyeglow"]},
    "render": {"background": "#2a2735", "hero": [-32, 14], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "monolith.json")
    dump(spec, out)
