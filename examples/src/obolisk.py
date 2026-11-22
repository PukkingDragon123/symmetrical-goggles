"""Builds examples/obolisk.json: the Obolisk (Winterworks, The Living End).

    python examples/src/obolisk.py examples/obolisk.json

A block of obsidian that came alive, made in the vanilla Minecraft mob style: the whole creature is ONE tall block,
2 x 4 blocks (32 x 64 x 28 px), painted like stacked obsidian blocks at real block resolution: every 16 x 16 area of
a face is its own obsidian block (deep purple-blacks, glassy fractures with crisp dark edges and pale lavender
glints), a few of them crying obsidian with glowing violet drips. A grumpy face is carved into the front: a heavy
slanted brow block over two small, flat, glowing violet slit eyes (enderman-like, 3 x 2 px, carved into dark
sockets), crying-obsidian tears running from them, and a frowning crack of a mouth with violet light inside. It has
no visible legs: it walks by rocking from edge to edge like a heavy block being walked across a floor, rears back and
topples forward to slam, and in the `disguised` clip it leans, its brow sinks shut, and it is just an obsidian pillar.

Units are Minecraft pixels (16 per block), density 1 (vanilla block resolution): every box is a whole number of
pixels, so the model exports 1:1 to a vanilla entity model. Faces +Z, ground at y = 0, "left" is +X; the root (body)
pivots low on its centre line. Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/obolisk.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/obolisk

Contract (mods/winterworks/docs/END_UPDATE.md section 9): bones body (the block), eye (the two glowing slits, one
card), eyelid (the brow: a bridge block with the slanted halves brow_l and brow_r; it slides down over the eyes),
leg_fl, leg_fr, leg_bl, leg_br (empty pivots under the block's corners). Extra joints, kept as empty pivots so the
clips and the Java side still find them: lids (at the eyes), foot_*, shard_l, shard_r, shard_b0, shard_b1, shard_l2,
crown, crown_1; pupil is a card with the brightest texel of each eye (it drifts as the Obolisk looks about). Clips:
disguised (loop), rise (2.0 s), idle, walk, slam (1.2 s), settle (1.5 s). Glow: the eyes, the crying obsidian and the
light in the mouth (ramps eyeglow and crying).
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import LR, M, ROOT, Rig, add, finish, keys, osc, pos, r, ramps, ring, sc, shake, timeline  # noqa: E402

DENSITY = 1
R = Rig(density=DENSITY, bone_style="pivot")
part, bone, card = R.part, R.bone, R.card

W, H, D = 32, 64, 28               # the block: 2 x 4 blocks, a little shallower than wide (it fits its 1.8 deep box)
FRONT = D / 2
PIV = 8.0                          # the root pivots low on the centre line, so it rocks and topples like a block


# ======================================================================= obsidian, block by block
def _value_noise(rng, w, h, cell):
    """Smooth value noise in 0..1 on a w x h grid (smoothstep between random lattice values)."""
    gw, gh = w // cell + 2, h // cell + 2
    g = [[rng.random() for _ in range(gw)] for _ in range(gh)]
    out = []
    for y in range(h):
        row = []
        for x in range(w):
            fx, fy = x / cell, y / cell
            x0, y0 = int(fx), int(fy)
            tx, ty = fx - x0, fy - y0
            tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            a = g[y0][x0] * (1 - tx) + g[y0][x0 + 1] * tx
            b = g[y0 + 1][x0] * (1 - tx) + g[y0 + 1][x0 + 1] * tx
            row.append(a * (1 - ty) + b * ty)
        out.append(row)
    return out


def obsidian_block(seed, crying=0):
    """One 16 x 16 obsidian block face: a grid of tones (ints 0..7 on the obsidian ramp) and of crying-obsidian tones
    (ints 0..6 on the crying ramp, or None). Deep blacks, a few glassy fractures (a lit streak with a crisp dark edge
    under it and a pale glint at its head), mid-violet chips; `crying` glowing violet drips."""
    rng = random.Random(seed)
    n = _value_noise(rng, 16, 16, 4)
    t = [[0 if v < 0.22 else 1 if v < 0.58 else 2 for v in row] for row in n]
    cry = [[None] * 16 for _ in range(16)]

    def put(x, y, v, only_below=None):
        if 0 <= x < 16 and 0 <= y < 16 and (only_below is None or t[y][x] < only_below):
            t[y][x] = v

    # mid-violet chips: small square clusters
    for _ in range(rng.randint(2, 4)):
        x, y = rng.randrange(16), rng.randrange(16)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1))[:rng.randint(2, 4)]:
            put(x + dx, y + dy, 3)
    # glassy fractures: short streaks running down-right, right or up-right, lit, with a crisp black edge under them
    for _ in range(rng.randint(2, 4)):
        x, y = rng.randrange(16), rng.randrange(16)
        dx, dy = rng.choice(((1, 1), (1, 1), (1, 0), (2, 1), (1, -1)))
        L = rng.randint(3, 6)
        pts = [(x + k * dx // (2 if dx == 2 else 1), y + k * dy // (2 if dx == 2 else 1)) for k in range(L)]
        for k, (px, py) in enumerate(pts):
            put(px, py, 4 if k < L - 1 else 3)
            put(px, py + 1, 0, only_below=4)
        hx, hy = pts[0]
        put(hx, hy, 6 if rng.random() < 0.35 else 5)
        if rng.random() < 0.4:
            put(hx - 1, hy, 5, only_below=5)
    # a rare bright glassy pixel
    if rng.random() < 0.5:
        put(rng.randrange(16), rng.randrange(16), 7)
    # crying obsidian: glowing drips (a bright core, a lit rim, a drip running down)
    for _ in range(crying):
        x, y = rng.randrange(2, 14), rng.randrange(1, 10)
        blob = [(0, 0), (1, 0), (0, 1), (1, 1)][:rng.randint(2, 4)] + [(-1, 0), (0, -1)][:rng.randint(0, 2)]
        for bx, by in blob:
            if 0 <= x + bx < 16 and 0 <= y + by < 16:
                cry[y + by][x + bx] = 3
        cry[y][x] = 5
        cry[y][x + 1] = 4
        for k in range(1, rng.randint(2, 5)):
            if y + 1 + k < 16:
                cry[y + 1 + k][x] = 2 if k < 3 else 1
    return t, cry


# which blocks of the body are crying obsidian (face, column, row from the top): how many drips each
CRYING = {("front", 0, 2): 1, ("front", 1, 3): 2, ("left", 1, 1): 2, ("right", 0, 2): 1, ("back", 0, 1): 2,
          ("back", 1, 3): 1, ("left", 0, 3): 1, ("top", 1, 0): 1}
# a little block-face shading baked in (the game shades faces as well): the lit side is -X, the top is lightest
FACE_SHIFT = {"front": 0, "back": -1, "left": -1, "right": 0, "top": 1, "bottom": -2}


def face_grid(face, w, h):
    """A w x h face tiled with obsidian blocks (each 16 x 16 block its own seed), darker near the ground."""
    t = [[0] * w for _ in range(h)]
    cry = [[None] * w for _ in range(h)]
    for by in range((h + 15) // 16):
        for bx in range((w + 15) // 16):
            bt, bc = obsidian_block(sum(map(ord, face)) * 131 + bx * 17 + by * 7919, CRYING.get((face, bx, by), 0))
            for y in range(16):
                for x in range(16):
                    X, Y = bx * 16 + x, by * 16 + y
                    if X < w and Y < h:
                        t[Y][X], cry[Y][X] = bt[y][x], bc[y][x]
    s = FACE_SHIFT[face]
    for y in range(h):
        low = -1 if face not in ("top", "bottom") and y >= h - 3 else 0
        for x in range(w):
            t[y][x] = max(0, min(7, t[y][x] + s + (low if t[y][x] > 0 else 0)))
    return t, cry


# ----------------------------------------------------------------------- the carved face (front, 32 x 64, row 0 at top)
EYE_ROW = 18                       # the slits cover rows 18-19 (y 44..46)
EYES = ((9, 11), (20, 22))         # columns of each slit
EY = H - EYE_ROW - 1.0             # 45: the eyes' centre height


def carve_face(t, cry):
    def put(x, y, v):
        if 0 <= x < W and 0 <= y < H:
            t[y][x] = v
            cry[y][x] = None

    def glow(x, y, v):
        if 0 <= x < W and 0 <= y < H:
            cry[y][x] = v

    # the face is carved into calmer stone, so it reads: no glints or crying blocks round the features
    rough = random.Random(5)
    left = [5 + rough.choice((-1, 0, 0, 1)) for _ in range(H)]
    right = [26 + rough.choice((-1, 0, 0, 1)) for _ in range(H)]
    top = [11 + rough.choice((-1, 0, 0, 1)) for _ in range(W)]
    bottom = [40 + rough.choice((-1, 0, 0, 1, 1)) for _ in range(W)]
    for y in range(8, 44):
        for x in range(3, 29):
            core = top[x] <= y <= bottom[x] and left[y] <= x <= right[y]
            t[y][x] = (2 if t[y][x] <= 1 else 3) if core else min(t[y][x], 3)
            cry[y][x] = None
    # the brow's shadow on the face and the eye sockets: carved, near black, with a lit lower lip
    for x in range(6, 26):
        put(x, 15, 0)
        put(x, 16, 1 if x in (6, 25) else 0)
    for x0, x1 in EYES:
        for y in range(EYE_ROW - 1, EYE_ROW + 3):
            for x in range(x0 - 1, x1 + 2):
                put(x, y, 0)
        for x in range(x0 - 1, x1 + 2):
            put(x, EYE_ROW + 3, 5 if x0 <= x <= x1 else 4)
    # a crack running up between the brows (the frown)
    for x, y in ((15, 14), (16, 13), (16, 12), (15, 11), (15, 10)):
        put(x, y, 0)
        if y < 14:
            put(x + 1, y, 4)
    # crying-obsidian tears: one from each slit, broken drips
    for x, rows in ((10, (22, 23, 24, 25, 27, 28)), (21, (22, 23, 24, 26, 27, 29, 30, 31))):
        for y in rows:
            glow(x, y, 3 if y == 22 else 2 if y < 26 else 1)
            if y > 22:
                put(x + 1, y, 0)
    # the mouth: a wide frowning crack, black with violet light in it and a lit lower lip; its corners turn down
    for x in range(9, 23):
        put(x, 33, 1)
        put(x, 34, 0)
        put(x, 35, 0)
        put(x, 36, 4 if 10 <= x <= 21 else 3)
    for x, y in ((8, 34), (8, 35), (7, 35), (7, 36), (6, 37), (6, 38), (23, 34), (23, 35), (24, 35), (24, 36),
                 (25, 37), (25, 38)):
        put(x, y, 0)
    for x, y in ((9, 36), (8, 36), (7, 37), (22, 36), (23, 36), (24, 37)):
        put(x, y, 3)
    for x, v in ((10, 1), (11, 2), (12, 2), (13, 3), (14, 2), (15, 1), (16, 2), (17, 3), (18, 3), (19, 2), (20, 2),
                 (21, 1)):
        glow(x, 35, v)
    # a few cracks branching off the mouth's corners
    for x, y in ((5, 39), (5, 40), (26, 39), (26, 40), (27, 41)):
        put(x, y, 0)


def stamp_rows(grid, cry):
    return ["".join("abcdefg"[cry[y][x]] if cry[y][x] is not None else str(grid[y][x]) for x in range(len(grid[0])))
            for y in range(len(grid))]


KEY = {str(k): f"obsidian:{k}" for k in range(8)}
KEY.update({c: f"crying:{k}" for k, c in enumerate("abcdefg")})
STAMPS = []
for face, (w, h) in {"front": (W, H), "back": (W, H), "left": (D, H), "right": (D, H), "top": (W, D),
                     "bottom": (W, D)}.items():
    g, c = face_grid(face, w, h)
    if face == "front":
        carve_face(g, c)
    STAMPS.append({"face": face, "at": "top-left", "art": stamp_rows(g, c), "key": KEY})

# ======================================================================= the rig
part("body", None, [W, H, D], "block", at=(0, PIV, 0), centre=(0, H / 2, 0))

# the eyes: two small flat glowing slits on one card (angry: the inner top corners cut away under the brow), and the
# pupil card with the brightest texel of each, which drifts as it looks about
bone("lids", "body", at=(0, EY, FRONT))
GAP = EYES[1][0] - EYES[0][1] - 1
card("eye", "body", ["ee." + "." * GAP + ".ee", "EEE" + "." * GAP + "EEE"], "eye", at=(0, EY, FRONT + 0.05))
card("pupil", "eye", ["W" + "." * (GAP + 4) + "W"], "eye", rel=(0, -0.5, 0.05))
# the brow: a heavy bridge block between the eyes and two slanted halves over them (the frown); it slides down to
# cover the eyes when it shuts them
part("eyelid", "body", [4, 3, 3], "brow", at=(0, EY + 1.5, FRONT), centre=(0, EY + 2.5, FRONT + 1.5))
for s in (1, -1):
    part(f"brow_{LR(s)}", "eyelid", [11, 3, 3], "brow", at=(s * 1.5, EY + 2.0, FRONT),
         centre=(s * 6.5, EY + 3.0, FRONT + 1.5), rot=(0, 0, s * 15))

# everything else the clips and the Java side name: empty pivots (it is one block)
for k, z in (("f", 9.0), ("b", -9.0)):
    for s in (1, -1):
        n = LR(s)
        bone(f"leg_{k}{n}", "body", at=M((10.0, 6.0, z), s))
        bone(f"foot_{k}{n}", f"leg_{k}{n}", at=M((10.0, 0.0, z), s))
for nm, at in {"shard_l": (W / 2, 52.0, 0.0), "shard_r": (-W / 2, 40.0, 0.0), "shard_b0": (4.0, 54.0, -FRONT),
               "shard_b1": (-5.0, 44.0, -FRONT), "shard_l2": (W / 2, 20.0, 4.0)}.items():
    bone(nm, "body", at=at)
bone("crown", "body", at=(0, H, 0))
bone("crown_1", "crown", at=(0, H, 0))

# ======================================================================= palette and paint
RAMPS = ramps(
    "eyeglow", "crying",
    # obsidian: deep purple-blacks up to pale lavender glints
    obsidian=["#050309", "#0c0815", "#150e24", "#211636", "#33244f", "#4c3a70", "#6f5c97", "#a597c8"],
)
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.3, "gradient": 0.0, "ao": 0.0}
FLAT = {"light": 0, "dark": 0}
styles = {
    "pivot": {"ramp": "obsidian"},          # empty pivots (bones)
    # the block: every face is generated block art (stamps), no painted light (the game shades the faces)
    "block": {"ramp": "obsidian", "tone": 1, "light": 0, "rim": FLAT, "stamps": STAMPS},
    # the brow: obsidian with a glassy streak, its top lit, its lower edge and underside black
    "brow": {"ramp": "obsidian", "tone": 2.2, "light": 0, "rim": FLAT,
             "layers": [{"id": "noise", "op": "noise", "scale": 1.5, "amount": 1.0},
                        {"id": "glass", "op": "stripes", "axis": [1.0, 0.6, 0.0], "period": 5.0, "width": 0.2,
                         "shift": 2.0, "faces": ["front", "sides"]},
                        {"id": "lit", "op": "fill", "shift": 2.0, "faces": ["top"]},
                        {"id": "edge", "op": "band", "axis": "y", "from": -1.01, "to": -0.4, "ramp": "obsidian",
                         "tone": 0, "faces": ["front", "sides"]},
                        {"id": "under", "op": "fill", "ramp": "obsidian", "tone": 0, "faces": ["bottom"]}]},
    # the eyes: flat glowing violet slits, the lower row brighter, one white-hot texel each (the pupil card)
    "eye": {"ramp": "eyeglow", "tone": 3, "light": 0, "rim": FLAT,
            "art_key": {"e": "eyeglow:3", "E": "eyeglow:4", "W": "eyeglow:5"}},
}

# ======================================================================= animation
REST = {}
SHUT_DY = -4.0              # the brow slides this far down to cover the eyes
SHUT = pos("eyelid", 0, SHUT_DY, 0)


def legs(fl=(0, 0, 0), fr=(0, 0, 0), bl=(0, 0, 0), br=(0, 0, 0)):
    return add(r("leg_fl", *fl), r("leg_fr", *fr), r("leg_bl", *bl), r("leg_br", *br))


# disguised: the block sunk and leaning, the brow shut over the eyes: an obsidian pillar
DISG = add(legs((-14, 20, -88), (-14, -20, 88), (14, -20, -88), (14, 20, 88)),
           r("body", 3, 10, -6), SHUT, sc("pupil", -0.3, -0.3, 0),
           r("shard_l", 0, 0, -36), r("shard_r", 0, 0, 30), r("shard_b0", -26, 0, 0), r("shard_b1", -22, 0, 0),
           r("shard_l2", 0, 0, -28), r("crown", 6, 0, -10), r("crown_1", 0, 0, 14))


def blink(t, dur=0.3):
    return keys("eyelid", None, [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + dur * 0.4, [0, SHUT_DY, 0]],
                                 [t + dur * 0.55, [0, SHUT_DY, 0]], [t + dur, [0, 0, 0]]], ch="position")


ANIM = {}
L = 4.0
# disguised: motionless rock; only the crying obsidian breathes (texture) and the brow grinds once
ANIM["disguised"] = timeline(L, [(0.0, DISG, None), (L, DISG, None)], loop=True, extra=[
    keys("eyelid", None, [[0, [0, 0, 0]], [2.6, [0, 0, 0]], [2.75, [0, 0.5, 0], "out"], [3.0, [0, 0, 0]],
                          [4.0, [0, 0, 0]]], ch="position"),
])

# rise: a rumble, it rocks upright, the brow grinds up on a glare
CROUCH = add(legs((-8, 8, -44), (-8, -8, 44), (8, -8, -44), (8, 8, 44)), r("body", -3, 4, -3), SHUT)
ANIM["rise"] = timeline(2.0, [(0.0, DISG, None), (0.45, add(DISG, r("body", 0, 0, 3)), "ease"),
                              (1.0, CROUCH, "ease"), (1.35, add(REST, SHUT, r("body", -4)), "out"),
                              (1.5, add(REST, SHUT), "ease"), (1.75, add(REST, sc("eye", 0, 0.5, 0)), "out"),
                              (2.0, REST, "ease")],
                        extra=[shake("body", 0.05, 0.9, 1.6, freq=11, axis=2)])

# idle: a slow, heavy sway; the eyes look about (the bright texels drift) and narrow, it blinks once
L = 3.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
    osc("body", "z", 1.2, 1, 0.0), osc("body", "x", -0.8, 1, 0.25),
    keys("pupil", None, [[0, [0, 0, 0]], [0.5, [0, 0, 0]], [0.7, [-1.0, 0, 0]], [1.3, [-1.0, 0, 0]],
                         [1.5, [1.0, 0, 0]], [2.1, [1.0, 0, 0]], [2.3, [0, 0, 0]]], ch="position"),
    keys("eye", None, [[0, [0, 0, 0]], [1.45, [0, 0, 0]], [1.6, [0, -0.5, 0]], [2.1, [0, -0.5, 0]],
                       [2.25, [0, 0, 0]], [3.0, [0, 0, 0]]], ch="scale"),
    blink(2.45),
])

# walk: it walks like a heavy block being walked across a floor, rocking from edge to edge and twisting a little
L = 2.0
ANIM["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
    osc("leg_fl", "x", 22, 1, 0.0), osc("leg_br", "x", 22, 1, 0.0),
    osc("leg_fr", "x", 22, 1, 0.5), osc("leg_bl", "x", 22, 1, 0.5),
    osc("body", "z", 6, 1, 0.0), osc("body", "y", 7, 1, 0.25), osc("body", "x", 2.0, 2, 0.1),
    osc("pupil", None, [0.5, 0, 0], 1, 0.3, ch="position"),
], lift=[[0, 0], [0.25, 0.6], [0.5, 0], [0.75, 0.6], [1.0, 0], [1.25, 0.6], [1.5, 0], [1.75, 0.6], [2.0, 0]])

# slam: rears back onto its back edge, the eyes blazing wide under a raised brow, then topples forward and slams its
# whole face down; shudders, and heaves itself upright again
REAR = add(r("body", -16), legs((-48, 0, -6), (-48, 0, 6), (16, 0, 0), (16, 0, 0)), sc("eye", 0, 0.5, 0),
           sc("pupil", -0.15, 0, 0), pos("eyelid", 0, 1.0, 0))
SLAM = add(r("body", 30), pos("body", 0, 0, 6.0), legs((-30, 0, -10), (-30, 0, 10), (-24, 0, 0), (-24, 0, 0)),
           sc("eye", 0, -0.5, 0), pos("eyelid", 0, -1.0, 0))
ANIM["slam"] = timeline(1.2, [(0.0, REST, None), (0.18, add(REST, r("body", 4)), "ease"), (0.48, REAR, "out"),
                              (0.56, REAR, "ease"), (0.68, SLAM, "in"), (0.86, add(SLAM, r("body", -3)), "ease"),
                              (1.2, REST, "ease")],
                        extra=[shake("body", 0.68, 0.9, 2.0, freq=14, axis=2)])

# settle: the brow slides shut, it sinks and leans: rock again
ANIM["settle"] = timeline(1.5, [(0.0, REST, None), (0.3, add(REST, SHUT), "ease"),
                                (0.9, add(CROUCH, r("body", 2)), "ease"),
                                (1.3, add(DISG, r("body", 0, 0, -1.5)), "out"), (1.5, DISG, "ease")],
                          extra=[shake("body", 0.95, 1.3, 1.2, freq=10, axis=2)])

spec = {
    "name": "Obolisk",
    "description": "The Winterworks Obolisk in the vanilla Minecraft mob style: a block of obsidian that came alive, "
                   "one 2 x 4 block pillar painted like stacked obsidian and crying-obsidian blocks at block "
                   "resolution, with a grumpy carved face: a heavy slanted brow over two small flat glowing violet "
                   "slit eyes, crying-obsidian tears and a frowning crack of a mouth. It walks by rocking from edge to "
                   "edge and slams by toppling forward; in disguise its brow sinks shut and it is an obsidian pillar. "
                   "Minecraft pixel units, density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 200, "colors": 32},
    "light": light,
    "brush": {"off": True},
    "defaults": {"paint": {"dither": 0.0}},
    "minecraft": {"fps": 20, "glow_ramps": ["eyeglow", "crying"]},
    "anim_ground_tolerance": 0.3,
    "render": {"background": "#cfcf9c", "hero": [30, 14], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "obolisk.json")
    finish(spec, out, root="body")
