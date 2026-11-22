"""Builds examples/harvester.json: the Harvester, a big gentle prehistoric herbivore (Winterworks Amber Age).

    python examples/src/harvester.py examples/harvester.json

Sniffer-scale (about 2.0 x 1.9 blocks without head and tail), sturdy and slow: a deep barrel body on four thick legs,
a heavy tapering tail, and a huge, wide hammerhead-shark-like head carried low on a short thick neck. The eyes sit at
the very ends of the hammer, small, round and friendly under a little fur brow; across the front runs a broad shovel
mouth with rows and rows of blunt cropping teeth (an upper battery under the lip, a lower one along the square chin,
cheek teeth along the sides), like the plant-cropping grazers of the deep past.

Painted like the vanilla sniffer: chunky texels and a small palette, two-tone. A warm mustard-yellow coat of fur
(vertical hair strokes, a darker ochre fringe along the belly) with a shaggy dark-green mossy mantle over the back,
dark green stripes running down from it, and long dark-green fur fringes (alpha-cut cards) off the mantle, along the
neck, round the thighs and on the tail, ending in a big tuft. A few ferns and wildflowers grow in the mantle. The
hammer head is kept clean (yellow, a dark green brow at each eye) so it stays a clear silhouette.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). Faces +Z, ground at y=0, "right" is -X. Fur fringes, ferns
and the rows of teeth are cards (zero-thickness cubes in Minecraft: draw with entityCutoutNoCull).

Contract (mods/winterworks/docs/FIXES_0_4.md, "The Harvester"): bones body, neck, head (the wide hammer head), jaw,
teeth_upper, teeth_lower, tail_0..2, leg_fl, leg_fr, leg_bl, leg_br, chest_l, chest_r (the saddlebag chests: show only
when it carries a chest), saddle (show only when saddled). Extra joints: shin_* (knees), foot_*, eye_l/r (blinks: the
clips squash them flat). Clips: idle, walk, run, graze (1.5 s), chomp (0.8 s, harvesting), shove (0.8 s, a sideways
head sweep that pushes animals), sit (lying down, looped).
"""
import json
import math
import os
import random
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DENSITY = 2

P = []
FRAMES = {}     # part id -> (world rotation, world pivot)


def _rot(deg):
    rx, ry, rz = (math.radians(float(a)) for a in deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _euler(R):
    """Inverse of _rot: degrees (x, y, z) with R = Rz Ry Rx."""
    ry = math.asin(max(-1.0, min(1.0, -R[2, 0])))
    rx = math.atan2(R[2, 1], R[2, 2])
    rz = math.atan2(R[1, 0], R[0, 0])
    return [round(math.degrees(a), 3) for a in (rx, ry, rz)]


def part(id, parent, size, style=None, at=None, rel=None, centre=None, offset=None, rot=None, wrot=None,
         shape="box", **kw):
    """Add a part. The joint goes at `at` (world) or `rel` (in the parent's rotated frame); the box centre at
    `centre` (world) or `offset` (in the part's own rotated frame; default: on the joint). `rot` is local, `wrot` a
    world rotation (converted to local)."""
    Rp, tp = FRAMES[parent] if parent else (np.eye(3), np.zeros(3))
    if at is None and rel is None and centre is not None:
        at = centre
    if at is None:
        at = tp + Rp @ np.array(rel if rel is not None else (0, 0, 0), float)
    at = np.array(at, float)
    if wrot is not None:
        rot = _euler(Rp.T @ _rot(wrot))
    Rw = Rp @ _rot(rot or (0, 0, 0))
    if centre is not None:
        offset = Rw.T @ (np.array(centre, float) - at)
    d = {"id": id, "shape": shape}
    if parent:
        d["parent"] = parent
    if shape == "box":
        assert all(abs(s * DENSITY - round(s * DENSITY)) < 1e-9 for s in size), f"{id}: size {size} not whole texels"
        d["size"] = [float(s) if s != int(s) else int(s) for s in size]
    d["pivot"] = [round(float(v), 4) for v in Rp.T @ (at - tp)]
    if offset is not None and np.abs(offset).max() > 1e-9:
        d["offset"] = [round(float(v), 4) for v in offset]
    if rot is not None and any(abs(float(a)) > 1e-9 for a in rot):
        d["rotation"] = [round(float(a), 3) for a in rot]
    if style:
        d["style"] = style
    d.update(kw)
    P.append(d)
    FRAMES[id] = (Rw, at)
    return d


def bone(id, parent, **kw):
    return part(id, parent, None, "fur", shape="bone", **kw)


def card(id, parent, art, style, plane="xy", **kw):
    return part(id, parent, None, style, shape="card", plane=plane, art=art, **kw)


def hang(id, parent, art, style, plane, **kw):
    """A fringe card hanging from its top edge: the joint is the top edge, the card hangs below it."""
    return card(id, parent, art, style, plane=plane, offset=(0, -len(art) / (2 * DENSITY), 0), **kw)


def mirror_art(art):
    return [row[::-1] for row in art]


SIDES = ((1, "l"), (-1, "r"))


# ======================================================================= card art
def teeth_row(width_px, down=True, shift=0, tall=3, tooth=4, gap=1):
    """One row of blunt pegs (plane xy, facing forward; plane yz for cheek rows): every tooth `tooth` texels wide
    with a lit left edge and a shaded root, `gap` texels apart, its tip rounded. Upper rows hang down, lower rows
    stand up. `shift` offsets a row so the rows behind show between the ones in front."""
    w = int(round(width_px * DENSITY))
    per = tooth + gap
    rows = []
    for y in range(tall):
        r = []
        for x in range(w):
            k = (x + shift) % per
            if k >= tooth:
                r.append(".")
            elif y == tall - 1 and k in (0, tooth - 1):
                r.append(".")                      # rounded tip
            elif y == 0:
                r.append("g")                      # root in shadow at the gum
            else:
                r.append("T" if k == 0 else "t" if k < tooth - 1 else "s")
        rows.append("".join(r))
    return rows if down else rows[::-1]


def fringe(length_px, seed=1, depth=8, short=3):
    """Shaggy fur hanging off an edge (image top = attached), drawn like the sniffer's: locks of 1-3 texels, each its
    own length, a lit strand down the middle of the longer ones and dark tips."""
    rnd = random.Random(seed)
    w = int(round(length_px * DENSITY))
    lens = []
    while len(lens) < w:
        L = rnd.randint(short, depth)
        lens += [L] * rnd.randint(1, 3)
    lens = lens[:w]
    rows = []
    for y in range(depth):
        r = ""
        for x in range(w):
            L = lens[x]
            if y >= L:
                r += "."
            elif y == L - 1:
                r += "e"                            # dark tip
            elif y < 2:
                r += "F"                            # root, in the shade of the edge it hangs from
            else:
                lit = (x > 0 and lens[x - 1] < L) or (x * 5 + y) % 7 == 0
                r += "h" if lit else "f"
        rows.append(r)
    return rows


# fern fronds (image bottom = root)
FERN = [
    "....m......",
    "...mMm..m..",
    "..m.Mm.mM..",
    ".....dMm.m.",
    "..mMmdM.mM.",
    ".m..mdMmM..",
    "....mdM..m.",
    "..mMmdMmMm.",
    ".m...dMm...",
    "...mMd.mm..",
    "....md.....",
    ".....d.....",
]
FROND = [
    ".m...m.",
    "mMm.mMm",
    ".mdmdm.",
    "..dMd..",
    ".mMdMm.",
    "..mdm..",
    "...d...",
]
# little wildflowers in the mantle (B petal, b petal shade, c centre, s stem)
BLOOM = [
    ".BbB.",
    "BbcbB",
    ".BbB.",
    "..s..",
    ".ss..",
    "..s..",
]
# tufts standing up along the spine and on the crown (image bottom = root)
TUFT = [
    "..f.....f....f..",
    ".fhf.f.fhf..fhf.",
    "fhFhfhfhFhf.hFhf",
    "FFFhFFhFFhFfFFhF",
]
# the tail's end: a big shaggy brush (plane yz, image left = the tip end, right = towards the root)
TAIL_TUFT = [
    ".....f..........",
    "...fhf.f........",
    "..fhhfhff.f.....",
    ".fhfFhhFfhf.....",
    "fhhFhFFhFFff....",
    "efhFFFhFFFFFFF..",
    "ehfFFhFFFFFFFFFF",
    "efhFFFhFFFFFFFFF",
    "fhhFhFFhFFFFFF..",
    ".fhfFhhFfhf.....",
    "..fhhfhef.f.....",
    "...ehf.e........",
    ".....e..........",
]

# ======================================================================= body: a deep barrel, rounded in steps
part("body", None, [26, 15, 28], "fur_body", at=(0, 20.5, 0))
part("under", "body", [24, 2, 24], "fur_low", centre=(0, 12.0, 0.0))
part("belly", "body", [20, 1.5, 20], "belly", centre=(0, 10.25, 0.0))
part("chest", "body", [22, 12, 2], "fur_body", centre=(0, 20.0, 15.0))
part("chest_b", "body", [18, 9, 1.5], "fur", centre=(0, 19.5, 16.75))
part("rump", "body", [22, 12, 2], "fur_body", centre=(0, 21.0, -15.0))
part("rump_b", "body", [18, 9, 1.5], "fur", centre=(0, 21.5, -16.75))
for s, n in SIDES:
    part(f"shoulder_{n}", "body", [1, 10, 10], "fur_body", centre=(s * 13.5, 17.0, 8.5))
    part(f"haunch_{n}", "body", [1, 10, 12], "fur_body", centre=(s * 13.5, 18.0, -8.0))
    # the ochre fringe along the belly (the sniffer's bottom fringe)
    hang(f"fringe_{n}", "body", fringe(22, seed=3, depth=7) if s > 0 else mirror_art(fringe(22, seed=3, depth=7)),
         "fur_fringe", "yz", at=(s * 12.05, 11.2, 0.0))
# the mossy mantle over the back: a thick dark green pelt, shaggy fringes hanging off both sides and the shoulders
part("mantle", "body", [24, 3, 26], "mantle", centre=(0, 29.5, -0.5))
part("mantle_top", "mantle", [18, 1, 20], "mantle_top", centre=(0, 31.5, -1.0))
for s, n in SIDES:
    for k, (depth, seed, x, y, tilt) in enumerate([(18, 11, 12.6, 30.2, 10), (12, 12, 13.2, 29.0, 16)]):
        art = fringe(26, seed=seed + (s < 0) * 7, depth=depth, short=depth // 2)
        hang(f"mantle_fur_{n}{k}", "mantle", art, "fur_card", "yz", at=(s * x, y, -0.5), rot=(0, 0, s * tilt))
    hang(f"mantle_front_{n}", "mantle", fringe(8, seed=21 + (s < 0), depth=14, short=6), "fur_card", "xy",
         at=(s * 8.0, 30.2, 14.1), rot=(-12, 0, 0))
    hang(f"mantle_back_{n}", "mantle", fringe(6, seed=25 + (s < 0), depth=9, short=4), "fur_card", "xy",
         at=(s * 9.5, 30.2, -14.1), rot=(12, 0, 0))
# tufts, ferns and a couple of wildflowers growing in the mantle
for k, (x, z, ry) in enumerate([(0.0, 10.0, 0), (-5.5, 3.0, 60), (5.0, -4.0, -50), (0.0, -9.5, 10)]):
    card(f"tuft_back{k}", "mantle_top", TUFT, "fur_card", at=(x, 31.9, z), offset=(0, 1.0, 0), rot=(-12, ry, 0))
for k, (x, z, art, ry) in enumerate([(-3.5, 7.0, FERN, 20), (4.0, 3.5, FROND, -30), (3.0, -1.5, FERN, -10),
                                     (-4.0, -7.5, FROND, 40)]):
    card(f"frond{k}", "mantle_top", art, "fern", at=(x, 31.9, z), offset=(0, len(art) / (2 * DENSITY), 0),
         rot=(-6, ry, (x > 0) * -10 + (x < 0) * 10))
for k, (x, z, ry) in enumerate([(-6.0, 0.5, 30), (6.0, -8.5, -40)]):
    card(f"bloom{k}", "mantle_top", BLOOM, "bloom", at=(x, 31.9, z), offset=(0, len(BLOOM) / (2 * DENSITY), 0),
         rot=(0, ry, 0))

# ======================================================================= neck (with a shaggy mane) and the hammer head
part("neck", "body", [14, 11, 10], "fur_neck", at=(0, 23.0, 11.5), centre=(0, 19.5, 17.0), wrot=(28, 0, 0))
for s, n in SIDES:
    hang(f"mane_{n}", "neck", fringe(10, seed=31 + (s < 0), depth=16, short=8), "fur_card", "yz",
         rel=(s * 7.1, 5.4, 0.0), rot=(0, 0, s * 10))
for k, z in enumerate((-2.5, 2.0)):
    card(f"mane_crest{k}", "neck", TUFT, "fur_card", rel=(0, 5.4, z), offset=(0, 1.0, 0), rot=(-34, 0, 0))
# The head IS the hammer: a flat, wide plate (the centre `head` plus a lobe and a tip each side, swept back and
# drooping a little) over a deep muzzle that carries the mouth. The eyes look forward from the ends of the hammer.
part("head", "neck", [18, 5.5, 12], "hammer", at=(0, 16.5, 21.0), offset=(0, 2.75, 6.0), wrot=(4, 0, 0))
card("tuft_crown", "head", TUFT, "fur_card", rel=(0, 5.4, 3.5), offset=(0, 1.0, 0), rot=(-8, 0, 0))
part("muzzle", "head", [16, 4.5, 11], "fur", rel=(0, -2.0, 6.0))
for s, n in SIDES:
    part(f"hammer_{n}", "head", [8, 5, 10.5], "hammer", rel=(s * 9.0, 2.75, 6.5), offset=(s * 4.0, 0, 0),
         rot=(0, s * -8, s * -5))
    part(f"hammer_tip_{n}", f"hammer_{n}", [5, 4, 9], "hammer", rel=(s * 8.0, -0.25, 0.0),
         offset=(s * 2.5, 0, 0), rot=(0, s * -7, s * -4))
    # a round eye set into the front of each tip, and a little fur brow over it
    part(f"eye_{n}", f"hammer_tip_{n}", [3, 3, 0.5], "eye", rel=(s * 3.0, 0.0, 4.75))
    part(f"brow_{n}", f"hammer_tip_{n}", [4, 1, 1.5], "brow", rel=(s * 3.0, 1.9, 4.5), rot=(0, 0, s * 7))
# the broad shovel mouth: an overhanging upper lip with the upper teeth under it, a square lower jaw
part("snout", "head", [22, 2.5, 3], "snout", rel=(0, -2.75, 12.0))
part("throat", "head", [14, 4, 1], "mouth", rel=(0, -2.5, 3.0))
bone("teeth_upper", "snout", rel=(0, -1.25, 1.3))
for k in range(3):
    card(f"teeth_upper_{k}", "teeth_upper", teeth_row(21, True, shift=2 * k), "teeth",
         rel=(0, 0.45 * k, -1.0 * k), offset=(0, -0.75, 0))
for s, n in SIDES:
    card(f"teeth_upper_side_{n}", "teeth_upper", teeth_row(7, True, shift=1), "teeth", plane="yz",
         rel=(s * 10.3, 0.5, -4.5), offset=(0, -0.75, 0))
part("jaw", "head", [20, 2.5, 11], "jaw", rel=(0, -4.0, 2.0), offset=(0, -1.25, 5.5), rot=(8, 0, 0))
part("chin", "jaw", [22, 3, 3], "jaw", rel=(0, -1.5, 11.0))
part("tongue", "jaw", [12, 1, 7], "tongue", rel=(0, 0.25, 5.0))
bone("teeth_lower", "jaw", rel=(0, 0.0, 12.2))
for k in range(3):
    card(f"teeth_lower_{k}", "teeth_lower", teeth_row(20, False, shift=2 * k + 2), "teeth",
         rel=(0, -0.45 * k, -1.0 * k), offset=(0, 0.75, 0))
for s, n in SIDES:
    card(f"teeth_lower_side_{n}", "teeth_lower", teeth_row(7, False, shift=3), "teeth", plane="yz",
         rel=(s * 9.6, -0.4, -5.0), offset=(0, 0.75, 0))

# ======================================================================= tail: fur down both sides, a big tuft at the end
part("tail_0", "body", [13, 10, 8], "fur_tail", at=(0, 23.5, -15.5), offset=(0, 0, -4.0), wrot=(-14, 0, 0))
part("tail_1", "tail_0", [9, 7.5, 8], "fur_tail", rel=(0, -0.3, -7.5), offset=(0, 0, -4.0), rot=(-8, 0, 0))
part("tail_2", "tail_1", [6, 5, 7], "fur_tail", rel=(0, -0.3, -7.5), offset=(0, 0, -3.5), rot=(-6, 0, 0))
part("tail_tip", "tail_2", [4, 3.5, 3], "mantle", rel=(0, -0.2, -6.5), offset=(0, 0, -1.5))
part("tail_mantle", "tail_0", [11, 1.5, 8], "mantle", rel=(0, 5.6, -4.0))
for s, n in SIDES:
    hang(f"tail_fur_{n}0", "tail_0", fringe(8, seed=41 + (s < 0), depth=13, short=6), "fur_card", "yz",
         rel=(s * 6.0, 5.9, -4.0), rot=(0, 0, s * 14))
    hang(f"tail_fur_{n}1", "tail_1", fringe(8, seed=43 + (s < 0), depth=10, short=5), "fur_card", "yz",
         rel=(s * 4.3, 3.9, -4.0), rot=(0, 0, s * 14))
card("tail_crest", "tail_1", TUFT, "fur_card", rel=(0, 3.7, -4.0), offset=(0, 1.0, 0), rot=(-20, 0, 0))
card("tail_tuft", "tail_tip", TAIL_TUFT, "fur_card", plane="yz", rel=(0, 0.0, -2.0), offset=(0, 0, -1.5))
card("tail_tuft_x", "tail_tip", [r[::-1] for r in TAIL_TUFT], "fur_card", plane="yz", rel=(0, 0.0, -2.0),
     offset=(0, 0, -1.5), rot=(0, 0, 90))

# ======================================================================= legs: thick pillars, shaggy cuffs, broad feet
LEGS = {"fl": (9.5, 15.0, 8.5), "fr": (-9.5, 15.0, 8.5), "bl": (9.5, 16.0, -8.0), "br": (-9.5, 16.0, -8.0)}
for k, (x, y, z) in LEGS.items():
    front = k[0] == "f"
    s = 1 if x > 0 else -1
    w, h, d = (9, 10, 9) if front else (10, 11, 10)
    part(f"leg_{k}", "body", [w, h, d], "fur_leg", at=(x, y, z), centre=(x, y - h / 2 + 0.5, z))
    # a cuff of long green fur round the thigh, down over the knee
    top = 12.5 if front else 13.0
    hang(f"cuff_{k}_out", f"leg_{k}", fringe(d, seed=51 + len(P), depth=12, short=7), "fur_card", "yz",
         at=(x + s * (w / 2 + 0.05), top, z), rot=(0, 0, s * 6))
    hang(f"cuff_{k}_front", f"leg_{k}", fringe(w, seed=61 + len(P), depth=11, short=7), "fur_card", "xy",
         at=(x, top, z + d / 2 + 0.05), rot=(-6, 0, 0))
    hang(f"cuff_{k}_back", f"leg_{k}", fringe(w, seed=71 + len(P), depth=11, short=7), "fur_card", "xy",
         at=(x, top, z - d / 2 - 0.05), rot=(6, 0, 0))
    part(f"shin_{k}", f"leg_{k}", [8, 6, 8], "fur_shin", at=(x, 7.5, z), centre=(x, 4.5, z))
    part(f"foot_{k}", f"shin_{k}", [9, 2.5, 10], "foot", at=(x, 2.0, z), centre=(x, 1.25, z + 0.8))
    for t, dx in enumerate((-2.8, 0.0, 2.8)):
        part(f"nail_{k}{t}", f"foot_{k}", [2, 1.5, 1], "nail", centre=(x + dx, 0.75, z + 6.3))

# ======================================================================= saddle (shown only when saddled)
bone("saddle", "body", at=(0, 32.0, 4.0))
part("saddle_pad", "saddle", [22, 1, 13], "blanket_top", centre=(0, 32.5, 4.0))
for s, n in SIDES:
    part(f"saddle_drape_{n}", "saddle", [2, 2, 13], "blanket_top", centre=(s * 12.5, 31.0, 4.0))
    part(f"saddle_skirt_{n}", "saddle", [1, 8, 13], "blanket", centre=(s * 14.0, 27.0, 4.0))
    part(f"girth_{n}", "saddle", [0.5, 11, 2], "strap", centre=(s * 14.25, 17.5, 5.0))
    part(f"stirrup_strap_{n}", "saddle", [0.5, 6, 1], "strap", centre=(s * 14.75, 23.5, 7.0))
    part(f"stirrup_{n}", "saddle", [1, 2, 3], "iron", centre=(s * 14.75, 20.0, 7.0))
part("girth_belly", "saddle", [20, 0.5, 2], "strap", centre=(0, 9.25, 5.0))
part("seat", "saddle", [12, 2, 11], "leather", centre=(0, 34.0, 3.5))
part("pommel", "saddle", [6, 3, 2], "leather", centre=(0, 35.25, 9.5), rot=(-10, 0, 0))
part("cantle", "saddle", [12, 3, 2], "leather", centre=(0, 35.25, -2.5), rot=(12, 0, 0))

# ======================================================================= saddlebag chests (shown only with a chest)
for s, n in SIDES:
    part(f"chest_{n}", "body", [4, 8, 10], "chest_box", at=(s * 16.5, 20.5, -7.5))
    part(f"chest_lid_{n}", f"chest_{n}", [4.5, 2.5, 10.5], "chest_lid", rel=(0, 3.25, 0))
    part(f"chest_latch_{n}", f"chest_{n}", [0.5, 2, 2], "iron", rel=(s * 2.25, 1.75, 0))
    for t, dz in enumerate((-3.0, 3.0)):
        part(f"chest_strap_{n}{t}", f"chest_{n}", [0.5, 8, 1.5], "strap", centre=(s * 14.75, 27.5, -7.5 + dz))
        part(f"chest_strap_top_{n}{t}", f"chest_{n}", [4, 0.5, 1.5], "strap", centre=(s * 12.75, 31.75, -7.5 + dz))

# ======================================================================= palette and paint
# A small palette, like a vanilla mob: a mustard fur ramp and a dark moss-green one carry the whole animal.
ramps = {
    "fur": ["#3a2408", "#5a380b", "#7c5110", "#9c6913", "#ba8217", "#d39b1f", "#e5b02a", "#f2c63b", "#fbdb5e",
            "#fff0a0"],
    "moss": ["#0a2119", "#0e3024", "#14412f", "#1b543a", "#236845", "#2f7e51", "#41955e"],
    "dark": ["#16100c", "#291c13", "#3d2a1b", "#53402d"],
    "teeth": ["#7a6e58", "#b7ab8a", "#e2d9be", "#fbf6e8"],
    "mouth": ["#38110f", "#5a1d1b", "#842f29", "#ad4a3e"],
    "flower": ["#b84a6a", "#f08aa4", "#ffe07a"],
    "leather": ["#1c0f09", "#2f190e", "#462614", "#5e351c", "#784526", "#925832", "#ab6e40"],
    "blanket": ["#0f2126", "#163238", "#1f464b", "#2a5c5f", "#377473", "#4a8d89"],
    "trim": ["#7a4c10", "#a8731c", "#d0a032", "#f0cd5c"],
    "wood": ["#2a1a0e", "#3f2814", "#57381c", "#704a25", "#8b5e2f", "#a6743b"],
    "iron": ["#1f2026", "#33353c", "#4f5259", "#71757a", "#9a9e9f", "#c4c6c2"],
}
# vanilla-like light: mostly flat (the game shades the faces itself), a touch of top light and contact shadow
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.3, "gradient": 0.25, "ao": 0.45, "ao_height": 8.0}
brush = {"flow": "y", "length": 2.0, "width": 0.5, "rough": 0.35, "overshoot": 0.2,
         "textures": {"fur": "fur", "moss": "fur", "leather": "leather", "wood": "wood", "iron": "metal",
                      "blanket": "cloth"}}

RIM = {"light_shift": 0.6, "dark_shift": -0.6}
# hair: vertical locks a texel or two wide, a shade darker, the way the sniffer's coat is drawn
HAIR = {"id": "hair", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.3, "shift": -0.55, "wobble": 0.8,
        "wobble_scale": 0.7, "faces": ["sides", "front", "back"]}
HAIR_Z = dict(HAIR, id="hair_z", axis="z", faces=["left", "right"])
# the mantle's green running down the upper flanks in ragged locks, and big dark green patches on the flanks
MOSS_DRIP = {"id": "moss_drip", "op": "drip", "ramp": "moss", "tone": 3.0, "depth": 0.3, "length": 2.4,
             "width": 0.7, "scale": 1.2, "faces": ["sides", "front", "back"]}
PATCHES = {"id": "patches", "op": "spots", "count": 5, "radius": [1.8, 2.6], "stretch": [1.0, 1.6, 1.0],
           "roughness": 0.5, "ramp": "moss", "tone": 3.0, "faces": ["sides"], "where": {"y": [-0.2, 0.8]},
           "min_gap": 3.0}
FUR = {"ramp": "fur", "tone": 5.4, "rim": RIM, "layers": [HAIR, HAIR_Z,
                                                          {"id": "under", "op": "fill", "shift": -1.0,
                                                           "faces": ["bottom"]}]}
styles = {
    "fur": FUR,
    "fur_body": dict(FUR, layers=FUR["layers"] + [PATCHES, MOSS_DRIP]),
    "fur_low": dict(FUR, tone=4.9),
    "fur_neck": dict(FUR, layers=FUR["layers"] + [dict(MOSS_DRIP, depth=0.35)]),
    "fur_tail": dict(FUR, layers=FUR["layers"] + [dict(MOSS_DRIP, depth=0.35)]),
    "fur_leg": dict(FUR, tone=5.0),
    "fur_shin": dict(FUR, tone=4.5),
    "belly": {"ramp": "fur", "tone": 6.8, "rim": RIM, "brush": {"flow": "x"},
              "layers": [dict(HAIR, period=2.0, shift=-0.6)]},
    "fur_fringe": {"ramp": "fur", "tone": 4, "light": 0.2, "brush": {"off": True},
                   "art_key": {"F": "fur:3", "f": "fur:4", "h": "fur:6", "e": "fur:2"}},
    "fur_card": {"ramp": "moss", "tone": 3, "light": 0.2, "brush": {"off": True},
                 "art_key": {"F": "moss:2", "f": "moss:3", "h": "moss:5", "e": "moss:1"}},
    "mantle": {"ramp": "moss", "tone": 3.2, "rim": RIM,
               "layers": [dict(HAIR, shift=0.9, width=0.3), dict(HAIR_Z, shift=0.9, width=0.3),
                          {"id": "clumps", "op": "patches", "scale": 1.6, "threshold": 0.58, "shift": 1.0,
                           "faces": ["top"]}]},
    "mantle_top": {"ramp": "moss", "tone": 3.8, "rim": RIM,
                   "layers": [{"id": "clumps", "op": "patches", "scale": 1.4, "threshold": 0.55, "shift": 1.0},
                              {"id": "hollows", "op": "patches", "scale": 1.8, "threshold": 0.66, "shift": -1.2,
                               "seed": 5}]},
    "fern": {"ramp": "moss", "tone": 5, "light": 0.2, "brush": {"off": True},
             "art_key": {"m": "moss:5", "M": "moss:6", "d": "moss:3"}},
    "bloom": {"ramp": "flower", "tone": 1, "light": 0.2, "brush": {"off": True},
              "art_key": {"B": "flower:1", "b": "flower:0", "c": "flower:2", "s": "moss:4"}},
    # the hammer: clean yellow (it must read as one shape), a slightly darker top, a pale front edge
    "hammer": {"ramp": "fur", "tone": 5.7, "rim": RIM, "brush": {"flow": "z", "rough": 0.2},
               "layers": [{"id": "top", "op": "fill", "shift": -0.6, "faces": ["top"]},
                          {"id": "lip", "op": "band", "axis": "y", "from": -1.1, "to": -0.4, "shift": 1.2,
                           "faces": ["front"]},
                          {"id": "under", "op": "fill", "shift": -1.0, "faces": ["bottom"]}]},
    "snout": {"ramp": "fur", "tone": 6.0, "rim": RIM, "brush": {"flow": "z", "rough": 0.2},
              "layers": [{"id": "lip", "op": "band", "axis": "y", "from": -1.1, "to": -0.55, "ramp": "fur",
                          "tone": 3.6, "faces": ["front", "sides"]},
                         {"id": "mouth_roof", "op": "fill", "ramp": "mouth", "tone": 0.6, "faces": ["bottom"]}]},
    "mouth": {"ramp": "mouth", "tone": 0.4, "light": 0.2, "brush": {"off": True}},
    "jaw": {"ramp": "fur", "tone": 6.4, "rim": RIM, "brush": {"flow": "z", "rough": 0.2},
            "layers": [{"id": "under", "op": "fill", "shift": -1.2, "faces": ["bottom"]},
                       {"id": "lip", "op": "band", "axis": "y", "from": 0.55, "to": 1.1, "ramp": "fur", "tone": 3.6,
                        "faces": ["front", "sides"]},
                       {"id": "gum", "op": "fill", "ramp": "mouth", "tone": 1.6, "faces": ["top"]}]},
    "tongue": {"ramp": "mouth", "tone": 3, "light": 0.4, "brush": {"off": True},
               "layers": [{"id": "groove", "op": "band", "axis": "x", "from": -0.08, "to": 0.08, "shift": -1.0,
                           "faces": ["top"]}]},
    "teeth": {"ramp": "teeth", "tone": 2, "light": 0.2, "brush": {"off": True},
              "art_key": {"T": "teeth:3", "t": "teeth:2", "s": "teeth:1", "g": "teeth:0"}},
    # eyes: a round dark eye with a one-texel highlight, set in the yellow fur (front face only)
    "eye": {"ramp": "fur", "tone": 5.9, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"face": "front", "at": "center", "art": [
                ".bbbb.",
                "bkkkkb",
                "bkWkkb",
                "bkkkkb",
                "bkkkkb",
                ".bbbb.",
            ], "key": {"b": "dark:2", "k": "dark:0", "W": "#ffffff"}}]},
    "brow": {"ramp": "moss", "tone": 3.0, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "lit", "op": "fill", "shift": 1.4, "faces": ["top"]}]},
    "foot": {"ramp": "dark", "tone": 2.4, "rim": RIM, "brush": {"flow": "x"},
             "layers": [{"id": "fur_top", "op": "band", "axis": "y", "from": 0.4, "to": 1.1, "ramp": "fur",
                         "tone": 3.6, "faces": ["sides", "top"]}]},
    "nail": {"ramp": "teeth", "tone": 1.6, "light": 0.4, "brush": {"off": True},
             "layers": [{"id": "tip", "op": "band", "axis": "y", "from": -1.1, "to": -0.3, "shift": -1.0}]},
    # a woven teal blanket: gold border, a row of cream diamonds
    "blanket": {"ramp": "blanket", "tone": 3.0, "brush": {"flow": "z", "rough": 0.3},
                "layers": [{"id": "trim", "op": "band", "axis": "y", "from": -1.1, "to": -0.7, "ramp": "trim",
                            "tone": 2.0, "faces": ["sides", "front", "back"]},
                           {"id": "border", "op": "band", "axis": "z", "from": 0.82, "to": 1.1, "ramp": "trim",
                            "tone": 1.6, "faces": ["sides"]},
                           {"id": "border_b", "op": "band", "axis": "z", "from": -1.1, "to": -0.82, "ramp": "trim",
                            "tone": 1.6, "faces": ["sides"]}],
                "stamps": [{"faces": ["left", "right"], "at": [3, 4], "art": [
                    "...s.....s.....s.....",
                    "..sSs...sSs...sSs....",
                    ".sSWSs.sSWSs.sSWSs...",
                    "..sSs...sSs...sSs....",
                    "...s.....s.....s.....",
                ], "key": {"s": "blanket:1", "S": "fur:8", "W": "trim:3"}}]},
    "blanket_top": {"ramp": "blanket", "tone": 3.4, "brush": {"flow": "x", "rough": 0.3},
                    "layers": [{"id": "trim", "op": "band", "axis": "z", "from": 0.8, "to": 1.1, "ramp": "trim",
                                "tone": 2.0},
                               {"id": "trim_b", "op": "band", "axis": "z", "from": -1.1, "to": -0.8, "ramp": "trim",
                                "tone": 2.0}]},
    "strap": {"ramp": "leather", "tone": 2.6, "light": 0.5, "brush": {"off": True}},
    "leather": {"ramp": "leather", "tone": 4.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.4,
                                                         "dark_shift": -1.0},
                "brush": {"flow": "z", "rough": 0.35},
                "layers": [{"id": "stitch", "op": "panel", "inset": 1, "shift": 1.2, "faces": ["top"]}]},
    "iron": {"ramp": "iron", "tone": 3.0, "rim": {"light_shift": 1.4, "dark_shift": -1.0}, "brush": {"off": True}},
    "chest_box": {"ramp": "wood", "tone": 3.6, "rim": {"light_shift": 1.0, "dark_shift": -1.0},
                  "brush": {"flow": "z"},
                  "layers": [{"id": "planks", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.12,
                              "shift": -1.2},
                             {"id": "bands", "op": "band", "axis": "z", "from": 0.72, "to": 1.01, "ramp": "iron",
                              "tone": 3.0, "faces": ["sides", "top", "bottom"]},
                             {"id": "bands_b", "op": "band", "axis": "z", "from": -1.01, "to": -0.72, "ramp": "iron",
                              "tone": 3.0, "faces": ["sides", "top", "bottom"]}]},
    "chest_lid": {"ramp": "wood", "tone": 4.2, "rim": {"light_shift": 1.2, "dark_shift": -1.0}, "brush": {"flow": "z"},
                  "layers": [{"id": "bands", "op": "band", "axis": "z", "from": 0.72, "to": 1.01, "ramp": "iron",
                              "tone": 3.4},
                             {"id": "bands_b", "op": "band", "axis": "z", "from": -1.01, "to": -0.72, "ramp": "iron",
                              "tone": 3.4}]},
}


# ======================================================================= animation
def add(*poses):
    out = {}
    for p in poses:
        for k, chans in p.items():
            o = out.setdefault(k, {})
            for ch, v in chans.items():
                o[ch] = [a + b for a, b in zip(o.get(ch, [0, 0, 0]), v)]
    return out


def r(part_, x=0, y=0, z=0):
    return {part_: {"r": [x, y, z]}}


def pos(part_, x=0, y=0, z=0):
    return {part_: {"p": [x, y, z]}}


def sc(part_, x=0, y=0, z=0):
    return {part_: {"s": [x, y, z]}}


def both(base, x=0, y=0, z=0):
    out = {}
    for s, n in SIDES:
        out[base.replace("*", n)] = {"r": [x, y * s, z * s]}
    return out


def timeline(length, keys, loop=False, extra=()):
    names = sorted({k for _, p, _ in keys for k in p})
    tracks = []
    for n in names:
        for ch, cname in (("r", "rotation"), ("p", "position"), ("s", "scale")):
            vals = [p.get(n, {}).get(ch, [0, 0, 0]) for _, p, _ in keys]
            if all(abs(v) < 1e-9 for vec in vals for v in vec):
                continue
            ks = []
            for (t, _, ease), v in zip(keys, vals):
                k = [round(t, 4), [round(float(a), 3) for a in v]]
                if ease:
                    k.append(ease)
                ks.append(k)
            tracks.append({"part": n, "channel": cname, "keys": ks})
    return {"length": length, "loop": loop, "tracks": tracks + list(extra)}


def osc(part_, axis, amp, cycles, phase=0.0, bias=0.0, ch=None, shape=None):
    o = {"amp": amp, "cycles": cycles, "phase": phase}
    if bias:
        o["bias"] = bias
    if shape:
        o["shape"] = shape
    t = {"part": part_, "osc": o}
    if axis:
        t["axis"] = axis
    if ch:
        t["channel"] = ch
    return t


def gait(length, legs, stride=18.0, lift=26.0, duty=0.62, samples=12):
    """Keyed leg cycles: each leg sweeps back (+x) through its stance at a steady rate, then swings forward with the
    knee lifted; the foot stays level on the ground and tips up as it leaves. legs: {leg key: phase}. Returns tracks
    for leg_*, shin_* and foot_*."""
    tracks = []
    for k, ph in legs.items():
        lk, sk, fk = [], [], []
        for i in range(samples + 1):
            t = i / samples
            u = (t + ph) % 1.0
            if u < duty:                               # stance: from -stride/2 (forward) to +stride/2 (back)
                a = -stride / 2 + stride * (u / duty)
                knee = 0.0
            else:                                      # swing: back to front, knee up
                v = (u - duty) / (1 - duty)
                a = stride / 2 - stride * (0.5 - 0.5 * math.cos(math.pi * v))
                knee = lift * math.sin(math.pi * v)
            foot = -a - knee
            T = round(t * length, 4)
            lk.append([T, round(a - knee * 0.35, 3)])
            sk.append([T, round(knee, 3)])
            fk.append([T, round(foot + knee * 0.35 - knee * 0.25, 3)])
        tracks.append({"part": f"leg_{k}", "axis": "x", "keys": lk, "ease": "linear"})
        tracks.append({"part": f"shin_{k}", "axis": "x", "keys": sk, "ease": "linear"})
        tracks.append({"part": f"foot_{k}", "axis": "x", "keys": fk, "ease": "linear"})
    return tracks


REST = {}
ANIM = {}
TAIL = ["tail_0", "tail_1", "tail_2"]
FUR_SWAY = ["mantle_fur_l0", "mantle_fur_r0", "mane_l", "mane_r"]
BLINK = [[0, [0, 0, 0]], [0.05, [0, -0.85, 0], "out"], [0.15, [0, 0, 0], "in"]]   # eyes squashed shut


def blink(t0):
    return [[round(t0 + k[0], 4)] + k[1:] for k in BLINK]


def fur_sway(amp, cycles, phase=0.0):
    """The long fur swings a little behind the body (z on the side fringes)."""
    return [{"part": p, "axis": "z", "raw": True, "osc": {"amp": amp, "cycles": cycles,
                                                         "phase": phase + 0.08 * i}} for i, p in enumerate(FUR_SWAY)]


# idle: slow deep breaths, a long look around, blinks, a lazy chew, the tail swaying
L = 4.0
ANIM["idle"] = {"length": L, "loop": True, "tracks": [
    osc("body", None, [0.012, 0.022, 0.006], 2, ch="scale"),
    osc("belly", None, [0.03, 0.06, 0.01], 2, 0.1, ch="scale"),
    {"part": "neck", "axis": "y", "keys": [[0, 0], [0.8, 10], [1.7, 10], [2.4, -8], [3.3, -8], [4.0, 0]],
     "ease": "smooth"},
    {"part": "head", "axis": "z", "keys": [[0, 0], [0.9, -5], [1.6, -5], [2.5, 4], [3.2, 4], [4.0, 0]],
     "ease": "smooth"},
    osc("neck", "x", 2.0, 1, 0.2),
    {"parts": ["eye_l", "eye_r"], "channel": "scale",
     "keys": [[0, [0, 0, 0]]] + blink(1.1) + blink(3.4) + [[4.0, [0, 0, 0]]]},
    {"part": "jaw", "axis": "x", "keys": [[0, 0], [2.0, 0], [2.15, 6], [2.3, -4], [2.45, 5], [2.6, -4], [2.8, 0],
                                         [4.0, 0]]},
    {"part": "teeth_lower", "channel": "position", "keys": [[0, [0, 0, 0]], [2.0, [0, 0, 0]], [2.15, [0.5, 0, 0]],
                                                            [2.3, [-0.5, 0, 0]], [2.45, [0.5, 0, 0]],
                                                            [2.6, [-0.5, 0, 0]], [2.8, [0, 0, 0]], [4.0, [0, 0, 0]]]},
    {"parts": TAIL, "wave": {"axis": "y", "amp": 6, "cycles": 1, "lag": 0.12, "growth": 1.3}},
    {"parts": TAIL, "wave": {"axis": "x", "amp": 2, "cycles": 2, "lag": 0.1}},
] + fur_sway(2.0, 2)}

# walk: a slow, heavy diagonal walk; the body bobs twice a stride and rolls, the head nods, the tail and fur swing
L = 1.6
ANIM["walk"] = {"length": L, "loop": True, "tracks": gait(L, {"fl": 0.0, "br": 0.08, "fr": 0.5, "bl": 0.58}) + [
    osc("body", None, [0, 0.6, 0], 2, 0.1, ch="position", shape="bounce"),
    osc("body", "z", 2.0, 1, 0.0),
    osc("body", "x", 0.8, 2, 0.2),
    osc("neck", "x", -3.0, 2, 0.25),
    osc("head", "x", -2.0, 2, 0.35),
    osc("neck", "y", 3.0, 1, 0.1),
    {"parts": TAIL, "wave": {"axis": "y", "amp": 7, "cycles": 1, "lag": 0.12, "growth": 1.3}},
    {"parts": TAIL, "wave": {"axis": "x", "amp": 1.5, "cycles": 2, "lag": 0.1}},
] + fur_sway(4.0, 2, 0.2)}

# run: a heavy, rocking canter; the body pitches, the head pumps, the tail streams out behind, the fur flies
L = 0.8
ANIM["run"] = {"length": L, "loop": True, "tracks": gait(L, {"fl": 0.0, "fr": 0.12, "bl": 0.5, "br": 0.62},
                                                       stride=34.0, lift=46.0, duty=0.45) + [
    osc("body", None, [0, 1.4, 0], 2, 0.15, ch="position", shape="bounce", bias=[0, 0.4, 0]),
    osc("body", "x", 4.0, 1, 0.1),
    osc("neck", "x", -6.0, 1, 0.25, bias=-4),
    osc("head", "x", -4.0, 1, 0.35),
    {"part": "jaw", "axis": "x", "osc": {"amp": 3, "cycles": 1, "phase": 0.3, "bias": 4}},
    {"parts": TAIL, "wave": {"axis": "x", "amp": 5, "cycles": 1, "lag": 0.12, "growth": 1.2, "bias": 6}},
    {"parts": TAIL, "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.1}},
] + fur_sway(7.0, 2, 0.3)}

# graze (1.5 s): neck down, the wide mouth to the ground, crop crop (the jaw opens, snaps shut with a tug), back up
DOWN = add(r("neck", 14), r("head", 3), r("body", 2))
OPEN = add(DOWN, r("jaw", 10), r("head", -4), pos("teeth_lower", 0, 0, 0.4))
SHUT = add(DOWN, r("jaw", -8), r("head", -6), r("neck", -3), pos("teeth_lower", 0, 0, -0.3))
ANIM["graze"] = timeline(1.5, [(0.0, REST, None), (0.35, DOWN, "ease"), (0.5, OPEN, "out"), (0.62, SHUT, "in"),
                               (0.78, OPEN, "out"), (0.9, SHUT, "in"), (1.05, DOWN, "ease"), (1.5, REST, "ease")],
                         extra=[{"parts": TAIL, "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.12}}])

# chomp (0.8 s, harvesting): dip and bite twice, the rows of teeth shearing side to side
DIP = add(r("neck", 9), r("head", 6))
BITE_O = add(DIP, r("jaw", 20), r("head", -6), pos("teeth_upper", 0.6, 0, 0), pos("teeth_lower", -0.6, 0, 0.5))
BITE_S = add(DIP, r("jaw", -8), r("head", 4), pos("teeth_upper", -0.6, 0, 0), pos("teeth_lower", 0.6, 0, -0.3),
             sc("head", 0.03, -0.04, 0))
ANIM["chomp"] = timeline(0.8, [(0.0, REST, None), (0.12, DIP, "out"), (0.22, BITE_O, "out"), (0.32, BITE_S, "in"),
                               (0.44, BITE_O, "out"), (0.54, BITE_S, "in"), (0.8, REST, "ease")])

# shove (0.8 s): wind up to the right, a big sideways sweep of the hammer to the left, recover
WIND = add(r("neck", 6, -16, 0), r("head", 0, -10, 8), r("body", 0, -4, 2))
SWEEP = add(r("neck", 8, 28, 0), r("head", 4, 20, -14), r("body", 0, 8, -3), r("jaw", 6))
ANIM["shove"] = timeline(0.8, [(0.0, REST, None), (0.2, WIND, "out"), (0.42, SWEEP, "in"),
                               (0.55, add(SWEEP, r("head", 0, 4, -2)), "out"), (0.8, REST, "ease")],
                         extra=[{"parts": TAIL, "wave": {"axis": "y", "amp": -6, "cycles": 1, "lag": 0.1}}])

# sit: lies down in a big contented sprawl (front legs out in front, hind legs splayed out behind), head resting low,
# breathing slowly, eyes half closed
LIE = add(pos("body", 0, -6.0, 0),
          both("leg_f*", -75), both("shin_f*", 0), both("foot_f*", 75),
          both("leg_b*", 66, 0, 6), both("shin_b*", 8), both("foot_b*", -60),
          r("neck", -12), r("head", 6), r("tail_0", 12), r("tail_1", 8, 16), r("tail_2", 4, 20),
          sc("eye_l", 0, -0.5, 0), sc("eye_r", 0, -0.5, 0))
ANIM["sit"] = timeline(3.0, [(0.0, LIE, None), (3.0, LIE, None)], loop=True, extra=[
    osc("body", None, [0.012, 0.025, 0.006], 1, ch="scale"),
    osc("belly", None, [0.04, 0.08, 0.01], 1, 0.1, ch="scale"),
    osc("head", "z", 2.0, 1, 0.2),
])

spec = {
    "name": "Harvester",
    "description": "The Winterworks Harvester: a big, gentle prehistoric herbivore with a huge hammerhead-shark-like "
                   "head, small friendly eyes at the ends of the hammer, a broad shovel mouth lined with rows of "
                   "cropping teeth, a mustard-yellow furry body on four thick legs under a shaggy dark green mossy "
                   "mantle, green fur fringes on the neck, thighs and tail, ferns and wildflowers in the moss. Painted "
                   "like a vanilla mob (sniffer-style two-tone fur, a small palette). Saddle and saddlebag chests "
                   "are separate bones the game shows or hides. Minecraft pixel units, density 2: exports 1:1 to a "
                   "vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 2400, "colors": 80},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 12},
    "anim_ground_tolerance": 1.0,
    "render": {"background": "#2a2f3a", "hero": [-36, 20], "shadow": 0.5},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": P,
    "animations": ANIM,
}


def dumps(obj):
    return json.dumps(obj, indent=1)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "harvester.json")
    with open(out, "w") as fh:
        fh.write(dumps(spec))
    print(out, len(P), "parts")
