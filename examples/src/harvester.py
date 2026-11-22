"""Builds examples/harvester.json: the Harvester, a big gentle prehistoric herbivore (Winterworks Amber Age).

    python examples/src/harvester.py examples/harvester.json

Sniffer-scale (about 2.0 x 1.9 blocks without head and tail), sturdy and slow, made in the vanilla Minecraft mob
style: a deep barrel body on four thick legs, a heavy tapering tail, and a huge, wide hammerhead-shark-like head
carried low on a short thick neck. Simple chunky boxes with clear silhouettes. The eyes sit at the very ends of the
hammer: small flat dark dots painted on, under a little dark green brow. A broad sniffer-like nose with two dark
nostrils sits over the mouth. The broad shovel mouth rests closed in a soft smile; its blunt cropping teeth (an upper
row under the lip, a lower one behind the square chin, cheek teeth along the sides) only show when it opens to graze
or chomp.

A scaly, reptilian hide in two colours and a small palette, rich but readable like a vanilla mob texture: every face
of the hide is generated texel by texel (hide_face): warm mustard yellow in simple two-tone rows of scales with soft
clusters of noise and the odd glossy scale, a lighter belly crossed by pale scutes, a dark green back of plated scutes
running down the upper flanks with a wobbly, dark-edged border, dark green bands tapering down the flanks and ringing
the tail, a ridge of square dark green scutes down the spine and tail; light painted in per face. A short chunky mossy fringe along the back's edges and a short mane are the
only cards besides the teeth. The hammer head is kept clean (yellow, a dark green top) so it stays a clear silhouette.

Units are Minecraft pixels (16 per block), density 1 (vanilla texel size): every box is a whole number of pixels, so
the model exports 1:1 to a vanilla entity model. Faces +Z, ground at y=0, "right" is -X. Fringes and teeth are cards
(zero-thickness cubes in Minecraft: draw with entityCutoutNoCull). Exported into the mod with a fixed hash seed
(PYTHONHASHSEED=0):

    python -m lowpix mc export examples/harvester.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/harvester

Contract (mods/winterworks/docs/FIXES_0_4.md, "The Harvester"): bones body, neck, head (the wide hammer head), jaw,
teeth_upper, teeth_lower, tail_0..2, leg_fl, leg_fr, leg_bl, leg_br, chest_l, chest_r (the saddlebag chests: show only
when it carries a chest), saddle (show only when saddled; the seat's top is at y 35, z 3.5). Extra joints: shin_*
(knees), foot_*, eye_l/r (the flat eye dots: the clips squash them flat to blink), belly (breathes), back_fur_l/r and
mane_l/r (the fringes, swaying). Clips: idle, walk, run, graze (1.5 s), chomp (0.8 s, harvesting), shove (0.8 s, a
sideways head sweep that pushes animals), sit (lying down, looped).
"""
import json
import math
import os
import random
import sys
import zlib

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DENSITY = 1

P = []
FRAMES = {}     # part id -> (world rotation, world pivot)
BOXES = {}      # box part id -> (size, centre offset, world rotation, world pivot): the hide painter's frames


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
        d["size"] = [int(round(s)) for s in size]
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
    if shape == "box":
        BOXES[id] = (list(size), np.array(offset if offset is not None else (0, 0, 0), float), Rw, at)
    return d


def bone(id, parent, **kw):
    return part(id, parent, None, "scaly", shape="bone", **kw)


def card(id, parent, art, style, plane="xy", **kw):
    return part(id, parent, None, style, shape="card", plane=plane, art=art, **kw)


def hang(id, parent, art, style, plane, **kw):
    """A fringe card hanging from its top edge: the joint is the top edge, the card hangs below it."""
    return card(id, parent, art, style, plane=plane, offset=(0, -len(art) / (2 * DENSITY), 0), **kw)


SIDES = ((1, "l"), (-1, "r"))


# ======================================================================= card art
def teeth_row(width_px, down=True, shift=0):
    """One row of blunt square pegs, 2 px wide and 2 px tall with a 1 px gap (plane xy, facing forward; plane yz for
    cheek rows): the root in shadow at the gum, the tip lit on its left. Upper rows hang down, lower rows stand up."""
    w = int(round(width_px * DENSITY))
    rows = ["".join("." if (x + shift) % 3 == 2 else "g" for x in range(w)),
            "".join("." if (x + shift) % 3 == 2 else ("T" if (x + shift) % 3 == 0 else "t") for x in range(w))]
    return rows if down else rows[::-1]


def fringe(length_px, seed=1, depth=4):
    """A short chunky mossy fringe hanging off an edge (image top = attached): square locks 2-3 px wide, each 2 to
    `depth` px long, two flat alternating greens, the top row in the shade of the edge."""
    rnd = random.Random(seed)
    w = int(round(length_px * DENSITY))
    lens, tones = [], []
    k = 0
    while len(lens) < w:
        L, n = rnd.randint(2, depth), rnd.randint(2, 3)
        lens += [L] * n
        tones += ["fh"[k % 2]] * n
        k += 1
    lens, tones = lens[:w], tones[:w]
    return ["".join("." if y >= lens[x] else ("F" if y == 0 else tones[x]) for x in range(w)) for y in range(depth)]


# ======================================================================= body: a deep barrel, rounded front and back
part("body", None, [26, 15, 28], "scaly_body", at=(0, 20.5, 0))
part("under", "body", [24, 2, 24], "scaly_low", centre=(0, 12.0, 0.0))
part("belly", "body", [20, 1, 20], "belly", centre=(0, 10.5, 0.0))
part("chest", "body", [22, 12, 2], "scaly_body", centre=(0, 20.0, 15.0))
part("rump", "body", [22, 12, 2], "scaly_body", centre=(0, 21.0, -15.0))
# the back: dark green plated hide, a ridge of square scutes down the spine, a short mossy fringe along its edges
part("back", "body", [24, 3, 26], "back", centre=(0, 29.5, -0.5))
for k, z in enumerate((10.0, 4.0, -2.0, -8.0)):
    part(f"scute{k}", "back", [4, 2, 3], "scute", centre=(0, 32.0, z))
for s, n in SIDES:
    hang(f"back_fur_{n}", "back", fringe(24, seed=11 + (s < 0) * 7, depth=4), "fur_card", "yz",
         at=(s * 12.05, 29.0, -0.5), rot=(0, 0, s * 8))

# ======================================================================= neck (scutes, a short mane) and the hammer head
part("neck", "body", [14, 11, 10], "scaly_neck", at=(0, 23.0, 11.5), centre=(0, 19.5, 17.0), wrot=(28, 0, 0))
part("neck_scute0", "neck", [4, 2, 3], "scute", rel=(0, 6.0, -1.0))
for s, n in SIDES:
    hang(f"mane_{n}", "neck", fringe(10, seed=31 + (s < 0), depth=4), "fur_card", "yz",
         rel=(s * 7.05, 5.0, 0.0), rot=(0, 0, s * 8))
# The head IS the hammer: a flat, wide plate (the centre `head` plus a lobe and a rounded tip each side, swept back and
# drooping a little) over a deep muzzle that carries the mouth. The eyes look forward from the ends of the hammer.
part("head", "neck", [18, 5, 12], "hammer", at=(0, 16.5, 21.0), offset=(0, 2.5, 6.0), wrot=(4, 0, 0))
part("muzzle", "head", [16, 4, 11], "scaly", rel=(0, -2.0, 6.0))
for s, n in SIDES:
    part(f"hammer_{n}", "head", [8, 5, 10], "hammer", rel=(s * 9.0, 2.5, 6.5), offset=(s * 4.0, 0, 0),
         rot=(0, s * -8, s * -5))
    part(f"hammer_tip_{n}", f"hammer_{n}", [5, 4, 9], "hammer", rel=(s * 8.0, -0.5, 0.0),
         offset=(s * 2.5, 0, 0), rot=(0, s * -7, s * -4))
    part(f"hammer_cap_{n}", f"hammer_tip_{n}", [1, 3, 7], "hammer", rel=(s * 5.5, 0.0, 0.0))     # a rounded end
    # a flat 2 x 2 eye dot on the front of each tip (texel aligned), and a little dark green brow over it
    card(f"eye_{n}", f"hammer_tip_{n}", ["kk", "kl"] if s > 0 else ["kk", "lk"], "eye", rel=(s * 3.0, 0.0, 4.55))
    part(f"brow_{n}", f"hammer_tip_{n}", [4, 1, 2], "brow", rel=(s * 3.0, 2.0, 4.5), rot=(0, 0, s * 7))
# a broad, sniffer-like nose over the mouth, two dark nostrils
part("nose", "head", [12, 3, 2], "nose", rel=(0, 0.0, 13.0))
# The broad shovel mouth, closed at rest in a soft smile: the teeth sit behind the lips (the upper row under the lip,
# the lower one behind the chin) and only show when the jaw opens (graze, chomp).
part("snout", "head", [22, 3, 3], "snout", rel=(0, -2.5, 12.0))
part("throat", "head", [14, 4, 1], "mouth", rel=(0, -2.5, 3.0))
bone("teeth_upper", "snout", rel=(0, -1.5, 0.5))
card("teeth_upper_0", "teeth_upper", teeth_row(20, True), "teeth", rel=(0, 0, 0), offset=(0, -1.0, 0))
for s, n in SIDES:
    card(f"teeth_upper_side_{n}", "teeth_upper", teeth_row(6, True, shift=1), "teeth", plane="yz",
         rel=(s * 9.0, 0.0, -4.5), offset=(0, -1.0, 0))
part("jaw", "head", [20, 3, 11], "jaw", rel=(0, -4.0, 2.0), offset=(0, -1.5, 5.5))
part("chin", "jaw", [22, 3, 3], "jaw", rel=(0, -1.5, 11.0))
part("tongue", "jaw", [12, 1, 7], "tongue", rel=(0, 0.0, 5.0))
bone("teeth_lower", "jaw", rel=(0, 0.0, 10.5))
card("teeth_lower_0", "teeth_lower", teeth_row(19, False, shift=1), "teeth", rel=(0, 0, 0), offset=(0, 1.0, 0))
for s, n in SIDES:
    card(f"teeth_lower_side_{n}", "teeth_lower", teeth_row(6, False, shift=2), "teeth", plane="yz",
         rel=(s * 8.6, 0.0, -4.5), offset=(0, 1.0, 0))

# ======================================================================= tail: banded, square scutes along the top
part("tail_0", "body", [13, 10, 8], "scaly_tail", at=(0, 23.5, -15.5), offset=(0, 0, -4.0), wrot=(-14, 0, 0))
part("tail_1", "tail_0", [9, 7, 8], "scaly_tail", rel=(0, -0.3, -7.5), offset=(0, 0, -4.0), rot=(-8, 0, 0))
part("tail_2", "tail_1", [6, 5, 7], "scaly_tail", rel=(0, -0.3, -7.5), offset=(0, 0, -3.5), rot=(-6, 0, 0))
part("tail_tip", "tail_2", [4, 3, 3], "scaly_tail", rel=(0, -0.2, -6.5), offset=(0, 0, -1.5))
for k, (seg, y, z, w) in enumerate([("tail_0", 5.5, -4.0, 3), ("tail_1", 4.0, -4.0, 3), ("tail_2", 3.0, -3.5, 2)]):
    part(f"tail_scute{k}", seg, [w, 2, 3], "scute", rel=(0, y, z))

# ======================================================================= legs: thick scaly pillars, broad feet
LEGS = {"fl": (9.5, 15.0, 8.5), "fr": (-9.5, 15.0, 8.5), "bl": (9.5, 16.0, -8.0), "br": (-9.5, 16.0, -8.0)}
for k, (x, y, z) in LEGS.items():
    front = k[0] == "f"
    w, h, d = (9, 10, 9) if front else (10, 11, 10)
    part(f"leg_{k}", "body", [w, h, d], "scaly_leg", at=(x, y, z), centre=(x, y - h / 2 + 0.5, z))
    part(f"shin_{k}", f"leg_{k}", [8, 6, 8], "scaly_shin", at=(x, 7.5, z), centre=(x, 4.5, z))
    part(f"foot_{k}", f"shin_{k}", [9, 2, 10], "foot", at=(x, 2.0, z), centre=(x, 1.0, z + 1.0))

# ======================================================================= saddle (shown only when saddled)
bone("saddle", "body", at=(0, 32.0, 4.0))
part("saddle_pad", "saddle", [22, 1, 13], "blanket_top", centre=(0, 32.5, 4.0))
for s, n in SIDES:
    part(f"saddle_drape_{n}", "saddle", [2, 2, 13], "blanket_top", centre=(s * 12.5, 31.0, 4.0))
    part(f"saddle_skirt_{n}", "saddle", [1, 8, 13], "blanket", centre=(s * 14.0, 27.0, 4.0))
    part(f"girth_{n}", "saddle", [1, 11, 2], "strap", centre=(s * 14.0, 17.5, 5.0))
    part(f"stirrup_strap_{n}", "saddle", [1, 6, 1], "strap", centre=(s * 15.0, 23.5, 7.0))
    part(f"stirrup_{n}", "saddle", [1, 2, 3], "iron", centre=(s * 15.0, 20.0, 7.0))
part("girth_belly", "saddle", [20, 1, 2], "strap", centre=(0, 9.5, 5.0))
part("seat", "saddle", [12, 2, 11], "leather", centre=(0, 34.0, 3.5))                     # top at y 35: the rider
part("pommel", "saddle", [6, 3, 2], "leather", centre=(0, 35.5, 9.5), rot=(-10, 0, 0))
part("cantle", "saddle", [12, 3, 2], "leather", centre=(0, 35.5, -2.5), rot=(12, 0, 0))

# ======================================================================= saddlebag chests (shown only with a chest)
for s, n in SIDES:
    part(f"chest_{n}", "body", [4, 8, 10], "chest_box", at=(s * 16.5, 20.5, -7.5))
    part(f"chest_lid_{n}", f"chest_{n}", [5, 2, 11], "chest_lid", rel=(0, 4.0, 0))
    part(f"chest_latch_{n}", f"chest_{n}", [1, 2, 2], "iron", rel=(s * 2.5, 2.0, 0))
    part(f"chest_strap_{n}0", f"chest_{n}", [1, 7, 2], "strap", centre=(s * 13.5, 28.0, -7.5))
    part(f"chest_strap_top_{n}0", f"chest_{n}", [3, 1, 2], "strap", centre=(s * 12.5, 31.5, -7.5))

# ======================================================================= palette and paint
# A small palette, like a vanilla mob: a mustard ramp and a dark green one carry the whole animal.
ramps = {
    "fur": ["#5c3c0c", "#7f5512", "#a5721a", "#c88e20", "#e0aa2c", "#f0c544", "#f8db74", "#fdeeb0"],
    "moss": ["#08201a", "#0d2d22", "#13402c", "#1b5337", "#246743", "#317c4f", "#46945d"],
    "dark": ["#1b130d", "#33251a"],
    "teeth": ["#a3967a", "#ddd3b8", "#f6f0de"],
    "mouth": ["#3f1311", "#62211c", "#86342b", "#a84b3c"],
    "leather": ["#2a160c", "#432513", "#5e351c", "#7a4626", "#955a32"],
    "blanket": ["#132b2f", "#1d4043", "#285657", "#356d6b", "#4a8783"],
    "trim": ["#8f5f17", "#c18e2c", "#e8c25a"],
    "wood": ["#33200f", "#4b3018", "#664222", "#83582e", "#a0703c"],
    "iron": ["#2e3036", "#53575d", "#80858a", "#b4b8b8"],
}
# the light (for the painted ops on the small parts; the hide is generated texel by texel below)
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.5, "gradient": 0.3, "ao": 0.5, "ao_height": 6.0}
FLAT = {"light": 0, "dark": 0}


# ----------------------------------------------------------------------- the hide, texel by texel
# Every face of the hide parts is generated as pixel art (a stamp covering the whole face), like a hand-painted vanilla
# mob texture: yellow scales in simple two-tone rows (a lit first texel, a shadow row under each scale, each scale a
# little lighter or darker than its neighbours, the odd glossy one), the dark green of the back running down the upper
# flanks with a wobbly edge, green bands tapering down the flanks and round the tail, green plates with lit edges and
# dark seams on the back, pale scutes under the belly. Light is painted in per face (tops lit, undersides dark, the
# far sides a shade down) and the hide darkens toward the ground.
BOX_FACES = {   # lowpix's box corners (sx, sy, sz) for TL, TR, BR, BL of each face, as seen from outside
    "front": [(-1, 1, 1), (1, 1, 1), (1, -1, 1), (-1, -1, 1)],
    "back": [(1, 1, -1), (-1, 1, -1), (-1, -1, -1), (1, -1, -1)],
    "right": [(1, 1, 1), (1, 1, -1), (1, -1, -1), (1, -1, 1)],
    "left": [(-1, 1, -1), (-1, 1, 1), (-1, -1, 1), (-1, -1, -1)],
    "top": [(-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)],
    "bottom": [(-1, -1, 1), (1, -1, 1), (1, -1, -1), (-1, -1, -1)],
}
NORMALS = {"front": (0, 0, 1), "back": (0, 0, -1), "right": (1, 0, 0), "left": (-1, 0, 0), "top": (0, 1, 0),
           "bottom": (0, -1, 0)}
LDIR = np.array(light["dir"], float) / np.linalg.norm(light["dir"])
# per style: what the hide is (kind), its base tone, scale size, how much of it is green and where
MAT = {
    "scaly_body": {"kind": "hide", "tone": 4, "scale": (4, 3), "dorsal": 3, "bands": True},
    "scaly_neck": {"kind": "hide", "tone": 4, "scale": (4, 3), "dorsal": 3},
    "scaly": {"kind": "hide", "tone": 4, "scale": (2, 2)},
    "scaly_low": {"kind": "hide", "tone": 3, "scale": (4, 3)},
    "scaly_tail": {"kind": "hide", "tone": 4, "scale": (3, 3), "dorsal": 3, "rings": True},
    "scaly_leg": {"kind": "hide", "tone": 4, "scale": (3, 3), "ground": True},
    "scaly_shin": {"kind": "hide", "tone": 4, "scale": (2, 2), "ground": True},
    "hammer": {"kind": "hide", "tone": 4, "scale": (3, 2), "dorsal": 1},
    "snout": {"kind": "hide", "tone": 5, "scale": (2, 2), "roof": True},
    "nose": {"kind": "hide", "tone": 5, "scale": (2, 1)},
    "jaw": {"kind": "hide", "tone": 4, "scale": (2, 2), "gum": True},
    "foot": {"kind": "hide", "tone": 3, "scale": (2, 2), "sole": True},
    "belly": {"kind": "belly"},
    "back": {"kind": "plates", "plate": (4, 3)},
    "scute": {"kind": "plates", "plate": (3, 2), "tone": 4},
    "brow": {"kind": "plates", "plate": (4, 1), "tone": 3},
}


def _seed(*keys):
    return zlib.crc32("/".join(map(str, keys)).encode())


def _lattice(x, y, z, seed):
    return (zlib.crc32(f"{x},{y},{z},{seed}".encode()) & 0xFFFF) / 0xFFFF


def soft_noise(p, cell=3.0, seed=0):
    """Smooth 3D value noise in -1..1 (trilinear between hashed lattice values): soft clusters a few texels wide."""
    q = np.array(p, float) / cell
    b = np.floor(q).astype(int)
    f = q - b
    f = f * f * (3 - 2 * f)
    v = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[0] if dx else 1 - f[0]) * (f[1] if dy else 1 - f[1]) * (f[2] if dz else 1 - f[2])
                v += w * _lattice(b[0] + dx, b[1] + dy, b[2] + dz, seed)
    return v * 2 - 1


def _wob(a, b, k=0.0):
    """A smooth, deterministic wobble in -1..1 from two coordinates."""
    return math.sin(a * 0.9 + k) * 0.6 + math.sin(b * 0.55 + a * 0.3 + 2.0 * k) * 0.4


def hide_face(pid, style, face):
    """The pixel art of one face of a hide part: rows of 'ramp:index' colour keys, one char per texel."""
    m = MAT[style]
    size, off, Rw, at = BOXES[pid]
    half = np.array(size, float) / 2
    C = [off + np.array(c) * half for c in BOX_FACES[face]]
    Wf = int(round(np.linalg.norm(C[1] - C[0]) * DENSITY))
    Hf = int(round(np.linalg.norm(C[3] - C[0]) * DENSITY))
    nw = Rw @ np.array(NORMALS[face], float)
    rng = random.Random(_seed(pid, face))
    # the light painted per face: tops lit, undersides dark, the sides facing away a shade down
    ldot = float(nw @ LDIR)
    lit = 1 if nw[1] > 0.6 else -2 if nw[1] < -0.6 else (0 if ldot > -0.05 else -1)
    sw, sh = m.get("scale", (3, 2))
    g = [[None] * Wf for _ in range(Hf)]
    scale_tone = {}
    for j in range(Hf):
        for i in range(Wf):
            pl = C[0] + (C[1] - C[0]) * (i + 0.5) / Wf + (C[3] - C[0]) * (j + 0.5) / Hf     # part-local
            pw = at + Rw @ pl                                                                   # world
            kind = m["kind"]
            ramp, tone = "fur", m.get("tone", 4)
            if kind == "hide":
                # where the hide is green: the back running down the upper flanks, bands, rings, the hammer's top
                y_top = half[1] + off[1] - pl[1]           # texels down from the top of the part
                green = False
                if face == "top" and m.get("dorsal"):
                    green = True
                elif m.get("dorsal") and face != "bottom":
                    edge = m["dorsal"] + (round(_wob(pw[2], pw[0]) * 1.2) if m["dorsal"] > 1 else 0)
                    green = y_top < edge
                if m.get("bands") and face in ("left", "right") and not green:
                    # bands tapering from the green back down to points on the mid flank
                    reach = (pl[1] - off[1] + half[1]) / (2 * half[1])     # 0 at the bottom .. 1 at the top
                    w = 0.36 * min(1.0, max(0.0, (reach - 0.25) / 0.5))
                    u = (pl[2] + 2.0 + _wob(pw[1], pw[2], 1.0) * 0.8) / 7.0
                    green = (u - math.floor(u)) < w
                if m.get("rings") and face != "bottom" and not green:
                    u = (pl[2] + 1.0) / 4.0
                    green = (u - math.floor(u)) < 0.35 and pl[1] - off[1] > -half[1] * 0.4
                if green:
                    ramp, tone = "moss", 3
                # scales: rows of sw x sh scales, every other row shifted half a scale
                row = j // sh
                col = (i + (row % 2) * (sw // 2)) // sw
                key = (row, col)
                if key not in scale_tone:
                    scale_tone[key] = rng.choice((-1, 1)) if rng.random() < 0.22 else 0
                    if rng.random() < 0.05:
                        scale_tone[key] = 2                       # the odd glossy scale
                ci, cj = (i + (row % 2) * (sw // 2)) % sw, j % sh
                tone += scale_tone[key] if scale_tone[key] < 2 else 0
                if cj == sh - 1 and sh > 1 and ci != sw - 1:
                    tone -= 1                                     # the shadow row under each scale, broken between
                elif cj == 0 and ci == 0 and scale_tone[key] == 2 and lit >= 0:
                    tone += 1                                     # a glossy scale's lit first texel
                # soft clusters of a neighbouring tone, like a vanilla texture's noise
                nz = soft_noise(pw, 3.0, _seed(style))
                tone += 1 if nz > 0.55 else -1 if nz < -0.55 else 0
                # contact shadow toward the ground, the sole of the foot, the inside of the mouth
                if m.get("ground") and pw[1] < 3.0 and face not in ("top", "bottom"):
                    tone -= 1
                if m.get("sole") and face not in ("top",) and y_top >= 1.0:
                    ramp, tone = "dark", 1 if face != "bottom" else 0
                if m.get("roof") and face == "bottom":
                    ramp, tone = "mouth", 0
                if m.get("gum") and face == "top":
                    ramp, tone = "mouth", 1
            elif kind == "belly":
                # pale scutes across the belly: 3 px rows, lit first row, a dark seam
                cj = j % 3
                tone = 6 if cj == 0 else 5 if cj == 1 else 4
                if (i + (j // 3) * 2) % 7 == 0 and cj != 2:
                    tone -= 1
            elif kind == "plates":
                # dark green plates with a lit upper edge and dark seams
                pw_, ph_ = m["plate"]
                row = j // ph_
                col = (i + (row % 2) * (pw_ // 2)) // pw_
                ci, cj = (i + (row % 2) * (pw_ // 2)) % pw_, j % ph_
                key = (row, col)
                if key not in scale_tone:
                    scale_tone[key] = rng.choice((-1, 0, 0, 1))
                ramp, tone = "moss", m.get("tone", 3) + scale_tone[key]
                if cj == ph_ - 1 and ph_ > 1 or ci == pw_ - 1:
                    tone -= 1                                     # dark seams
                elif cj == 0 and ci == 0:
                    tone += 1                                     # the lit corner of each plate
                nz = soft_noise(pw, 3.0, _seed(style))
                tone += 1 if nz > 0.6 else -1 if nz < -0.6 else 0
            tone += lit
            n = len(ramps[ramp])
            g[j][i] = (ramp, max(0, min(n - 1, tone)))
    # crisp markings: a darker texel on the yellow side of every yellow-green border
    out = [row[:] for row in g]
    for j in range(Hf):
        for i in range(Wf):
            r_, t_ = g[j][i]
            if r_ != "fur":
                continue
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= i + di < Wf and 0 <= j + dj < Hf and g[j + dj][i + di][0] == "moss":
                    out[j][i] = ("fur", max(0, t_ - 1))
                    break
    return out


def art_stamp(face, grid):
    """A stamp covering the whole face, its colours keyed by single characters."""
    keys, art = {}, []
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    for row in grid:
        s = ""
        for ramp, tone in row:
            ref = f"{ramp}:{tone}"
            if ref not in keys:
                keys[ref] = alphabet[len(keys)]
            s += keys[ref]
        art.append(s)
    return {"face": face, "at": "top-left", "art": art, "key": {v: k for k, v in keys.items()}}


# hand-placed features drawn over the generated hide
FEATURES = {
    # the upper lip: a dark smile line along its bottom edge, its corners turned up
    "snout": [{"face": "front", "at": "bottom", "art": [
        "..k................k..",
        "...kkkkkkkkkkkkkkkk...",
    ], "key": {"k": "fur:1"}}, {"faces": ["left", "right"], "at": "bottom", "art": ["kkk"], "key": {"k": "fur:1"}}],
    # the nose: two wide dark nostrils on top of its front edge, a lit rim behind them (sniffer-like)
    "nose": [{"face": "top", "at": "bottom", "art": [
        "..ll....ll..",
        "..kk....kk..",
    ], "key": {"k": "dark:0", "l": "fur:6"}}],
    # pale square toenails on the front of each foot
    "foot": [{"face": "front", "at": "bottom", "art": [".tT.tT.tT", ".ss.ss.ss"],
              "key": {"t": "teeth:2", "T": "teeth:1", "s": "teeth:0"}}],
}


def paint_hide():
    for p in P:
        st = p.get("style")
        if p["shape"] != "box" or not isinstance(st, str) or st not in MAT:
            continue
        p["paint"] = {"stamps": [art_stamp(f, hide_face(p["id"], st, f)) for f in BOX_FACES] + FEATURES.get(st, [])}


paint_hide()

NOISE = {"id": "noise", "op": "noise", "scale": 1.2, "amount": 0.7}
styles = {name: {"ramp": "fur", "tone": 4, "light": 0, "rim": FLAT} for name in MAT}
styles.update({
    "mouth": {"ramp": "mouth", "tone": 0.6, "light": 0.2, "rim": FLAT},
    "chin": {"ramp": "fur", "tone": 4, "light": 0, "rim": FLAT},
    "tongue": {"ramp": "mouth", "tone": 2.4, "light": 0.4, "rim": FLAT,
               "layers": [dict(NOISE, amount=0.5),
                          {"id": "groove", "op": "band", "axis": "x", "from": -0.1, "to": 0.1, "shift": -1.0,
                           "faces": ["top"]}]},
    "fur_card": {"ramp": "moss", "tone": 2, "light": 0.2, "rim": FLAT,
                 "art_key": {"F": "moss:1", "f": "moss:3", "h": "moss:4"}},
    "teeth": {"ramp": "teeth", "tone": 1, "light": 0.2, "rim": FLAT,
              "art_key": {"T": "teeth:2", "t": "teeth:1", "g": "teeth:0"}},
    # eyes: flat dark dots (one softer texel), drawn on a card just in front of the hammer's tip
    "eye": {"ramp": "dark", "tone": 0, "light": 0, "rim": FLAT, "art_key": {"k": "dark:0", "l": "dark:1"}},
    # a woven teal blanket: a gold border, a row of pale diamonds
    "blanket": {"ramp": "blanket", "tone": 2.0, "rim": FLAT,
                "layers": [dict(NOISE, amount=0.5),
                           {"id": "weave", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.5, "shift": -0.6},
                           {"id": "trim", "op": "band", "axis": "y", "from": -1.1, "to": -0.7, "ramp": "trim",
                            "tone": 1.0, "faces": ["sides", "front", "back"]}],
                "stamps": [{"faces": ["left", "right"], "at": [2, 2], "art": [
                    "..s...s...s..",
                    ".sWs.sWs.sWs.",
                    "..s...s...s..",
                ], "key": {"s": "trim:1", "W": "fur:7"}}]},
    "blanket_top": {"ramp": "blanket", "tone": 2.4, "rim": FLAT,
                    "layers": [dict(NOISE, amount=0.5),
                               {"id": "weave", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.5,
                                "shift": -0.6},
                               {"id": "trim", "op": "band", "axis": "z", "from": 0.8, "to": 1.1, "ramp": "trim",
                                "tone": 1.0},
                               {"id": "trim_b", "op": "band", "axis": "z", "from": -1.1, "to": -0.8, "ramp": "trim",
                                "tone": 1.0}]},
    "strap": {"ramp": "leather", "tone": 1.6, "light": 0.4, "rim": FLAT,
              "layers": [{"id": "edge", "op": "band", "axis": "x", "from": -1.1, "to": -0.6, "shift": 1.0}]},
    "leather": {"ramp": "leather", "tone": 2.4, "rim": {"light": 1, "dark": 1, "light_shift": 1, "dark_shift": -1},
                "layers": [dict(NOISE, amount=0.6),
                           {"id": "stitch", "op": "panel", "inset": 1, "shift": 1.0, "faces": ["top"]}]},
    "iron": {"ramp": "iron", "tone": 1.6, "rim": {"light": 1, "dark": 0, "light_shift": 1.4}},
    "chest_box": {"ramp": "wood", "tone": 2.2, "rim": FLAT,
                  "layers": [dict(NOISE, amount=0.6),
                             {"id": "planks", "op": "stripes", "axis": "y", "period": 3.0, "width": 0.34,
                              "shift": -1.2},
                             {"id": "bands", "op": "band", "axis": "z", "from": 0.7, "to": 1.01, "ramp": "iron",
                              "tone": 1.4, "faces": ["sides", "top", "bottom"]},
                             {"id": "bands_b", "op": "band", "axis": "z", "from": -1.01, "to": -0.7, "ramp": "iron",
                              "tone": 1.4, "faces": ["sides", "top", "bottom"]}]},
    "chest_lid": {"ramp": "wood", "tone": 2.8, "rim": {"light": 1, "dark": 0, "light_shift": 1},
                  "layers": [dict(NOISE, amount=0.6),
                             {"id": "bands", "op": "band", "axis": "z", "from": 0.7, "to": 1.01, "ramp": "iron",
                              "tone": 1.8},
                             {"id": "bands_b", "op": "band", "axis": "z", "from": -1.01, "to": -0.7, "ramp": "iron",
                              "tone": 1.8}]},
})


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
FUR_SWAY = ["back_fur_l", "back_fur_r", "mane_l", "mane_r"]
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
    {"part": "jaw", "axis": "x", "keys": [[0, 0], [2.0, 0], [2.15, 7], [2.3, 1], [2.45, 6], [2.6, 0], [4.0, 0]]},
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
OPEN = add(DOWN, r("jaw", 18), r("head", -6), pos("teeth_lower", 0, 0, 0.4))
SHUT = add(DOWN, r("jaw", 0), r("head", -6), r("neck", -3), pos("teeth_lower", 0, 0, -0.3))
ANIM["graze"] = timeline(1.5, [(0.0, REST, None), (0.35, DOWN, "ease"), (0.5, OPEN, "out"), (0.62, SHUT, "in"),
                               (0.78, OPEN, "out"), (0.9, SHUT, "in"), (1.05, DOWN, "ease"), (1.5, REST, "ease")],
                         extra=[{"parts": TAIL, "wave": {"axis": "y", "amp": 4, "cycles": 1, "lag": 0.12}}])

# chomp (0.8 s, harvesting): dip and bite twice, the rows of teeth shearing side to side
DIP = add(r("neck", 9), r("head", 6))
BITE_O = add(DIP, r("jaw", 20), r("head", -6), pos("teeth_upper", 0.6, 0, 0), pos("teeth_lower", -0.6, 0, 0.5))
BITE_S = add(DIP, r("jaw", 0), r("head", 4), pos("teeth_upper", -0.6, 0, 0), pos("teeth_lower", 0.6, 0, -0.3),
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
                   "head, small flat dot eyes at the ends of the hammer, a broad nose, a shovel mouth that hides its "
                   "cropping teeth until it opens, a scaly mustard-yellow body on four thick legs with a dark green "
                   "plated back, square scutes down the spine and a banded tail, short mossy fringes. "
                   "Vanilla Minecraft mob style: chunky boxes, flat dot eyes, a small palette, clean scale rows. "
                   "Saddle and saddlebag chests are separate bones the game shows or hides. Minecraft pixel units, "
                   "density 1: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 1200, "colors": 56},
    "light": light,
    "brush": {"off": True},
    "defaults": {"paint": {"dither": 0.0}},
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
