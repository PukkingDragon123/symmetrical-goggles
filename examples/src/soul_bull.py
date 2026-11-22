"""Builds examples/soul_bull.json, the horse-armour texture variants examples/variants/soul_bull_armor_{iron,gold,
diamond}.json and the skull block examples/soul_bull_skull.json (Winterworks 0.4, mods/winterworks/docs/FIXES_0_4.md
"The Soul Bull").

    python examples/src/soul_bull.py

The Soul Bull is a bull that is a completely black skeleton, kept alive by blue soul fire: charred black bones with
soot-grey highlights and a few hairline cracks of soul light, a heavy bull skull with big horns sweeping out and then
forward, blue flames licking out of its eye sockets, and a barrel ribcage with soul fire roaring inside it, licking up
between the ribs. Head low, horns forward, legs planted wide: it is always about to charge. About 1.4 blocks wide
(horns) and 1.6 tall (horn tips), 2.6 long.

* `saddle` (a bone): a dark leather saddle on a crimson blanket with gold trim, flaps hugging the ribs, a girth strap
  down to the breastbone, stirrups. The renderer shows or hides it.
* `rider` (a locator bone, no geometry): where a Wither Skeleton or the player sits, on the seat.
* Horse armour shells (`armor_head`, `armor_neck`, `armor_chest`, `armor_flank_l/r`, `armor_rump`) are transparent in
  the plain texture; each armour variant paints them (iron: riveted plate; gold: engraved plate with a soul gem;
  diamond: cut crystal facets in a harlequin lattice with sparkles), so the renderer only swaps the texture.

The skull block (`soul_bull_skull`) is the same skull, a little bigger, lying on the ground: bones `skull` (root),
`jaw`, `horn_l`, `horn_r` and `eye_fire` (the soul flames in its sockets; glow; hide it while the skull is unlit).

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so both models export 1:1
to vanilla entity models (python -m lowpix mc export). Faces +Z, ground at y = 0, "left" is +X.

Contract bones: body, ribs, soul_fire (glow), neck, head, jaw, horn_l, horn_r, tail, leg_fl, leg_fr, leg_bl, leg_br,
saddle, rider. Extra joints: neck_1, horn_*_1..3, tail_1, tail_2, shin_*, cannon_b* (hind cannon bones), foot_* (hooves),
eye_fire (both eye flames). Clips: idle, walk, run, ram (1.0 s), pin (1.5 s), drain (loop: souls flow in), revive
(2.0 s). Glow: every soul-fire texel (ramp `soul`: the ribcage fire, the eyes, the tail tuft, the hairline cracks).
"""
import copy
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (DENSITY, LR, M, MR, ROOT, Rig, add, dump, euler, ground_lock, keys, limb, osc,  # noqa: E402
                     pos, r, rest_on_ground, ring, sc, shake, spikes, timeline, wave)

# ======================================================================= palette
RAMPS = {
    # wither bone: dark charcoal greys (like a Wither Skeleton's), lighter grey edges and worn highlights
    "bone": ["#0b0b0c", "#111112", "#171718", "#1d1d1e", "#232424", "#2a2b2b", "#323333", "#3b3d3d", "#464949",
             "#525656", "#606464", "#727675"],
    # charred horn and hoof keratin: a warmer charcoal, smoky brown-grey lights
    "horn": ["#0a0909", "#110f0f", "#181515", "#201c1b", "#292422", "#332d2a", "#3e3733", "#4b423d", "#5a4f49",
             "#6c615a"],
    # the inside of sockets, nostrils and the mouth
    "void": ["#020103", "#050307", "#09060c", "#0e0a12"],
    # soul fire (glow): ink blue -> blue -> cyan -> white
    "soul": ["#071433", "#0c2a63", "#11479a", "#1769c4", "#1f92e0", "#38bdf2", "#7ce0fb", "#c4f6ff", "#ffffff"],
    # saddle: dark leather, a crimson blanket, gold fittings
    "leather": ["#120a08", "#1d110c", "#2a1912", "#382218", "#472c1f", "#583827", "#6a4530", "#7d543b"],
    "crimson": ["#1a0508", "#2c080d", "#420c14", "#5a111b", "#741723", "#8f1f2b", "#aa2b33", "#c33f3c"],
    "gold": ["#2c1503", "#4a2405", "#6e3706", "#94500a", "#b86b0e", "#d68b12", "#eaa91c", "#f6c934", "#fde35c",
             "#fff399"],
    # natural armour: polished blackstone (violet-black), gilded
    "blackstone": ["#0c0a0f", "#131017", "#1a1620", "#221d29", "#2b2533", "#352e3e", "#40384a", "#4d4457", "#5c5266",
                   "#6c6277"],
    # armour
    "iron": ["#17191d", "#262a30", "#383d45", "#4d535d", "#656c77", "#7f8792", "#9aa2ac", "#b7bec6", "#d3d8dd",
             "#edf0f2"],
    "diamond": ["#061c24", "#0a2d38", "#10434f", "#185c68", "#227884", "#2f97a0", "#44b6bb", "#69d0d0", "#9de6e2",
                "#d2f8f4"],
}
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.75, "gradient": 0.45, "ao": 0.5, "ao_height": 6.0}
BRUSH = {"flow": "long", "length": 1.6, "width": 0.6, "rough": 0.55, "overshoot": 0.25,
         "textures": {"bone": "organic", "horn": "wood", "leather": "leather", "crimson": "cloth", "gold": "metal",
                      "iron": "metal", "diamond": "crystal"}}

RIM = {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -1.2}
# charred bone: porous grain, soot stains and pits; soot-grey only on the lit edges and in short wet-looking dashes
GRAIN = {"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.7}
SOOT = {"id": "soot", "op": "patches", "scale": 1.1, "threshold": 0.55, "shift": -1.2}
PITS = {"id": "pits", "op": "spots", "count": 3, "radius": [0.3, 0.5], "shift": -1.6}
SHEEN = {"id": "sheen", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.4,
         "shift": 2.0}
# a few hairline cracks on the skull and spine glowing soul-blue from the fire inside
CRACKS = {"id": "soulcracks", "op": "cracks", "scale": 0.9, "width": 0.025, "threshold": 0.6, "ramp": "soul",
          "tone": 2.4, "faces": ["top", "front"]}
UNDER = {"id": "under", "op": "gradient", "axis": "y", "amount": 0.8}
INVISIBLE = [{"faces": ["all"], "at": "top-left", "art": ["_" * 64] * 64}]

STYLES = {
    "bone": {"ramp": "bone", "tone": 4.6, "rim": RIM, "layers": [GRAIN, SOOT, PITS, UNDER, SHEEN]},
    "bone_cracked": {"ramp": "bone", "tone": 4.6, "rim": RIM, "layers": [GRAIN, SOOT, PITS, UNDER, SHEEN]},
    "bone_dark": {"ramp": "bone", "tone": 3.2, "rim": RIM, "layers": [GRAIN, SOOT, UNDER]},
    "rib": {"ramp": "bone", "tone": 4.8, "rim": dict(RIM, light_shift=2.8), "brush": {"flow": "long"},
            "layers": [GRAIN, {"id": "rib_edge", "op": "gradient", "axis": "y", "amount": -0.6}, SHEEN]},
    "spine": {"ramp": "bone", "tone": 5.0, "rim": dict(RIM, light_shift=2.8), "brush": {"flow": "y"},
              "layers": [GRAIN, {"id": "tip", "op": "gradient", "axis": "y", "amount": 1.2}]},
    "skull": {"ramp": "bone", "tone": 5.2, "rim": dict(RIM, light_shift=2.8),
              "layers": [GRAIN, SOOT, PITS, {"id": "sutures", "op": "cracks", "scale": 1.6, "width": 0.04,
                                                     "shift": -2.0}, SHEEN]},
    "brow": {"ramp": "bone", "tone": 5.8, "rim": dict(RIM, light_shift=3.0), "brush": {"flow": "x"},
             "layers": [GRAIN, SOOT, SHEEN]},
    "socket": {"ramp": "void", "tone": 1.4, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
               "layers": [{"id": "glow_rim", "op": "band", "axis": "y", "from": -1.01, "to": -0.4, "ramp": "soul",
                           "tone": 1.0, "faces": ["sides", "front", "back"]}]},
    "void": {"ramp": "void", "tone": 1.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "teeth": {"ramp": "bone", "tone": 9.0, "light": 0.3, "brush": {"off": True},
              "art_key": {"t": "bone:9", "T": "bone:11", "r": "bone:5"}},
    "horn": {"ramp": "horn", "tone": 3.2, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.2},
             "brush": {"flow": "long", "length": 2.2},
             "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3, "shift": -1.2},
                        {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1,
                         "density": 0.6, "shift": 2.0}]},
    "horn_tip": {"ramp": "horn", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.4},
                 "brush": {"flow": "long"},
                 "layers": [{"id": "tip", "op": "gradient", "axis": "y", "amount": -1.4}]},
    "hoof": {"ramp": "horn", "tone": 3.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.0},
             "brush": {"flow": "y"},
             "layers": [{"id": "growth", "op": "stripes", "axis": "y", "period": 0.75, "width": 0.35, "shift": -0.8,
                         "faces": ["sides"]},
                        {"id": "sole", "op": "fill", "ramp": "void", "tone": 2.4, "faces": ["bottom"]}],
             "stamps": [{"face": "front", "at": "top", "art": ["vv", "vv", "vv", "vv"],
                         "key": {"v": "void:2"}}]},
    # soul fire (fully emissive in game): white-hot core, cyan body, deep blue licks
    "flame": {"ramp": "soul", "tone": 4.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
              "art_key": {"W": "soul:8", "w": "soul:7", "c": "soul:6", "E": "soul:5", "e": "soul:4", "b": "soul:3",
                          "k": "soul:2"}},
    "core": {"ramp": "soul", "tone": 6.4, "light": 0.15, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
             "layers": [{"id": "hot", "op": "noise", "scale": 0.8, "amount": 1.6},
                        {"id": "heat", "op": "gradient", "axis": "y", "amount": 1.4}]},
    # saddle
    "saddle": {"ramp": "leather", "tone": 4.6, "rim": RIM, "brush": {"flow": "z"},
               "layers": [{"id": "stitch", "op": "panel", "inset": 1, "shift": -1.4, "highlight": 1.0, "shadow": -1.0,
                           "min_size": 4},
                          {"id": "wear", "op": "wear", "width": 1, "density": 0.2, "shift": 1.4},
                          {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1,
                           "density": 0.5, "shift": 1.6}]},
    "blanket": {"ramp": "crimson", "tone": 4.4, "rim": RIM, "brush": {"flow": "x"},
                "layers": [{"id": "trim", "op": "band", "axis": "x", "from": 0.8, "to": 1.01, "ramp": "gold",
                            "tone": 5.0, "faces": ["top", "sides"]},
                           {"id": "trim_r", "op": "band", "axis": "x", "from": -1.01, "to": -0.8, "ramp": "gold",
                            "tone": 5.0, "faces": ["top", "sides"]},
                           {"id": "weave", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.3, "shift": -0.8}]},
    "flap": {"ramp": "leather", "tone": 4.2, "rim": RIM, "brush": {"flow": "y"},
             "layers": [{"id": "stitch", "op": "panel", "inset": 1, "shift": -1.4, "highlight": 1.0, "shadow": -1.0,
                         "min_size": 4},
                        {"id": "tooling", "op": "rect", "rect": [0.3, 0.3, 0.7, 0.7], "ramp": "crimson", "tone": 3.6,
                         "faces": ["left", "right"], "bevel": {"shadow": 1, "highlight": 1}}]},
    "strap": {"ramp": "leather", "tone": 3.4, "rim": RIM, "brush": {"off": True}},
    "brass": {"ramp": "gold", "tone": 5.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.6},
              "brush": {"off": True}},
    "stirrup": {"ramp": "gold", "tone": 4, "light": 0, "brush": {"off": True},
                "art_key": {"s": "leather:3", "b": "gold:4", "B": "gold:7"}},
    "armor": {"ramp": "iron", "tone": 4, "light": 0, "brush": {"off": True}, "stamps": INVISIBLE},
    "plate": {"ramp": "blackstone", "tone": 4, "light": 0, "brush": {"off": True}, "stamps": INVISIBLE},
    "plate_spike": {"ramp": "blackstone", "tone": 4, "light": 0, "brush": {"off": True}, "stamps": INVISIBLE,
                    "art_key": {"t": "gold:8", "m": "gold:5", "f": "blackstone:5"}},
    "plate_chain": {"ramp": "iron", "tone": 4, "light": 0, "brush": {"off": True}, "stamps": INVISIBLE,
                    "art_key": {"C": "iron:5", "c": "iron:3", "d": "iron:1"}},
}


# ======================================================================= card art
def soul_flame(w, h, seed, tongues=3, lean=0.0, sparks=2, base=0.32):
    """Soul fire, w x h texels, burning up from the bottom row. The silhouette is a broad bed with a few licking
    tongues of random height swaying on curved centre lines (one tall middle tongue); it is then shaded in bands by
    depth from its edge, the classic pixel-art flame: a blue rim, cyan, pale cyan and a white-hot core, the bands
    thinner and colder toward the tips, plus loose sparks above. Characters: W w c E e b k (hot -> cold), '.' clear."""
    rng = random.Random(seed)
    heat = np.full((h, w), -1.0)
    yy, xx = np.mgrid[0:h, 0:w]
    X, Y = xx + 0.5, h - (yy + 0.5)                      # Y up from the bottom edge
    xs = np.linspace(w * 0.26, w * 0.74, tongues) if tongues > 1 else [w / 2]
    mid = tongues // 2
    for k, x0 in enumerate(xs):
        out = 0 if k == mid else (1 if x0 > w / 2 else -1)        # side tongues lick outward
        x0 += rng.uniform(-0.05, 0.05) * w
        H = h * (rng.uniform(0.96, 1.0) if k == mid else rng.uniform(0.5, 0.72))
        sway = rng.uniform(-0.12, 0.12) * w + lean * w * 0.15 + out * 0.12 * w
        bw = w * (0.3 if k == mid else rng.uniform(0.17, 0.22))
        t = np.clip(Y / H, 0, 1.2)
        xc = x0 + sway * np.sin(math.pi * t * 0.6) + (lean * 0.25 + out * 0.1) * w * t ** 2
        ph = rng.uniform(0, 1)
        hw = (bw * np.maximum(0.0, 1.0 - t ** 1.2) ** 0.8 + 0.3) * (1 + 0.2 * np.sin(2 * math.pi * (1.6 * t + ph)))
        f = np.where(t <= 1.0, 1.0 - np.abs(X - xc) / hw, -1)
        heat = np.maximum(heat, f)
    # the bed: a rounded heap at the base, widest a little above the bottom
    bed = 1.0 - np.sqrt(((X - w / 2) / (w * 0.47)) ** 2 + ((Y - h * base * 0.45) / (h * base)) ** 2)
    heat = np.maximum(heat, bed)
    inside = heat > 0
    # depth from the silhouette's edge (4-neighbour steps; the bottom row counts as inside, so the base is hot)
    depth = np.where(inside, 99, 0)
    for _ in range(w):
        pad = np.pad(depth, 1, constant_values=0)
        pad[-1, 1:-1] = 99                               # below the bottom row: more fire
        nb = np.minimum.reduce([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]])
        new = np.where(inside, np.minimum(depth, nb + 1), 0)
        if np.array_equal(new, depth):
            break
        depth = new
    level = depth.astype(float) - 3.4 * np.clip(Y / h - 0.15, 0, 1)   # colder toward the top
    chars = np.full((h, w), ".", dtype="<U1")
    for lim, ch in ((0.0, "b"), (1.2, "E"), (2.2, "c"), (3.2, "w"), (4.6, "W")):
        chars[inside & (level > lim)] = ch
    chars[inside & (level <= 0.0)] = "e"
    # the tips of the tongues go ink blue
    for x in range(w):
        col = np.where(inside[:, x])[0]
        if len(col):
            chars[col[0], x] = "k" if Y[col[0], x] > h * 0.4 else chars[col[0], x]
    rows = [list(rw) for rw in chars]
    for _ in range(sparks):
        x, y = rng.randrange(1, w - 1), rng.randrange(0, max(1, h // 3))
        if rows[y][x] == "." and all(rows[y + dy][x + dx] == "." for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                                     if 0 <= y + dy < h and 0 <= x + dx < w and (dx or dy)):
            rows[y][x] = "E" if rng.random() < 0.5 else "c"
    return ["".join(rw) for rw in rows]


def chain_art(w, h, sag, seed=0):
    """A chain sagging between its two ends across w texels: face-on links (a 3 x 3 ring, lit on top) alternating with
    edge-on links (a 2-texel bar), period 5. Characters: C lit, c body, d shadow."""
    rows = [["."] * w for _ in range(h)]
    for x in range(w):
        u = (x + 0.5) / w * 2 - 1
        y = int(round(1 + sag * (1 - u * u)))
        ph = (x + seed) % 5
        if ph < 3:                                      # a face-on ring
            for dy, ch in ((-1, "C"), (0, "c" if ph != 1 else "."), (1, "d")):
                if 0 <= y + dy < h:
                    rows[y + dy][x] = ch
        elif 0 <= y < h:                                # an edge-on link
            rows[y][x] = "c"
    return ["".join(r) for r in rows]


# ======================================================================= the skull (shared by the bull and the block)
def build_skull(R, root, k, names, open_jaw=6.0):
    """A heavy bull skull in the frame of `root` (origin at the poll joint, face along +Z, top +Y), scaled by k:
    a broad flat forehead with a horn bar across the poll, deep orbits at the front corners of the forehead with brow
    ridges and burning soul flames, a long face narrowing to a broad flat muzzle with a dark nasal aperture, cheek
    teeth, and a long lower jaw. Horns sweep out from the poll, then forward and up. `names` maps 'jaw', 'horn_l',
    'horn_r' and 'eye_fire' to bone names. Returns the list of flame card ids (glow)."""
    part, bone, card = R.part, R.bone, R.card

    def s(v):                       # scale a size to whole texels (0.5 units)
        return max(0.5, round(v * k * 2) / 2)

    def S(*v):
        return [s(a) for a in v]

    def P(*v):
        return tuple(a * k for a in v)

    # the orbits: R0 outer radius, t rim thickness, d depth of the socket tube; a_ = the rim's centre line (an
    # octagon with edges e long), `inner` the width of the hollow
    R0, t, d = 2.6 * k, s(0.75), s(2.0)
    a_ = R0 - t / 2
    e = max(0.5, round(2 * a_ * math.tan(math.pi / 8) * 2 + 0.4) / 2)
    inner = 2 * (a_ - t / 2)

    def orbit(n, side):
        """A full round socket: an octagonal bone rim (four bars and four 45-degree bars), a tube `d` deep, a dark
        floor at the bottom of the hollow. Local +X (side +1) / -X (side -1) is the way the socket looks."""
        oid = f"{root}_orbit_{n}"
        bone(oid, root, rel=P(side * 4.3, 1.6, 4.9), rot=MR((0, -38, 18), side))
        for nm, size, at in (("top", [d, t, e], (0, a_, 0)), ("bot", [d, t, e], (0, -a_, 0)),
                             ("fr", [d, e, t], (0, 0, a_)), ("bk", [d, e, t], (0, 0, -a_))):
            part(f"{oid}_{nm}", oid, size, "brow", rel=at)
        q = a_ * math.sqrt(0.5)
        for j, (cy, cz) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
            part(f"{oid}_c{j}", oid, [d, t, e], "brow", rel=(0, cy * q, cz * q), rot=(45 * cy * cz, 0, 0))
        # the floor of the hollow, deep inside: dark, lit soul-blue from below by the fire
        fl = s(inner / k + 0.5)
        part(f"{oid}_floor", oid, [0.5, fl, fl], "socket", rel=(side * (-d / 2 + 0.25), 0, 0))

    # the braincase, the horn bar across the poll, the broad frontal plate (seen from the front when the head is
    # lowered), a long face narrowing to a flat muzzle with a dark nasal aperture
    part(f"{root}_cranium", root, S(8, 5, 6), "skull", rel=P(0, 0.4, 1.6))
    part(f"{root}_poll", root, S(11, 2.5, 3), "skull", rel=P(0, 2.6, 0.2))
    part(f"{root}_frontal", root, S(8, 1.5, 6.5), "skull", rel=P(0, 3.0, 3.8))
    part(f"{root}_occiput", root, S(6, 4, 1), "bone_dark", rel=P(0, 0.4, -1.4))
    part(f"{root}_face", root, S(6, 4, 6), "skull", rel=P(0, 0.6, 8.6))
    part(f"{root}_nasal", root, S(3.5, 1, 7.5), "brow", rel=P(0, 2.9, 9.6), rot=(2, 0, 0))
    part(f"{root}_muzzle", root, S(5, 3, 4), "skull", rel=P(0, 0.2, 12.8))
    part(f"{root}_nose", root, S(6, 3, 2), "skull", rel=P(0, 0.0, 15.2),
         paint={"stamps": [{"face": "front", "at": "center",
                            "art": [".vv..vv.", "vVVvvVVv", "vVVvvVVv", ".vv..vv."],
                            "key": {"v": "void:2", "V": "void:0"}}]})
    part(f"{root}_palate", root, S(5, 0.5, 10), "void", rel=P(0, -1.6, 10.0))
    for side in (1, -1):
        n = LR(side)
        # the orbit: a full, round bony socket on each side of the frontal plate, looking out and forward: an
        # octagonal rim of bone (four bars, four cut corners) round a deep hollow whose floor is dark
        orbit(n, side)
        part(f"{root}_cheek_{n}", root, S(1, 2.5, 6), "bone_dark", rel=P(side * 3.2, -0.4, 8.2), rot=MR((0, 6, 0), side))
        card(f"{root}_teeth_{n}", root, ["tTtTtTtTtTtT", "tttttttttttt", "r.rr.rr.rr.r"], "teeth",
             rel=P(side * 2.6, -1.8, 10.0), offset=(0, -0.75 * k, 0), plane="yz")
    # the lower jaw: a long mandible hinged under the back of the skull, incisors at the tip
    jaw = names["jaw"]
    part(jaw, root, S(4.5, 2, 13), "skull", rel=P(0, -2.2, 1.8), offset=P(0, -0.6, 6.5), rot=(open_jaw, 0, 0))
    part(f"{jaw}_ramus", jaw, S(5.5, 3, 2), "bone_dark", rel=P(0, 0.6, 0.6))
    part(f"{jaw}_tongue", jaw, S(3.5, 0.5, 10), "void", rel=P(0, 0.6, 7.0))
    card(f"{jaw}_incisors", jaw, ["tTtTtTtT", "tttttttt", ".r.rr.r."], "teeth", rel=P(0, 0.4, 13.0),
         offset=(0, 0.75 * k, 0), plane="xy")
    for side in (1, -1):
        card(f"{jaw}_teeth_{LR(side)}", jaw, [".r.rr.rr.r..", "tttttttttttt", "tTtTtTtTtTtT"], "teeth",
             rel=P(side * 2.0, 0.4, 7.5), offset=(0, 0.75 * k, 0), plane="yz")

    # horns: out from the ends of the poll, then sweeping forward and up (a lyre), tips turned in. The sweep is drawn
    # in world space from each horn's root (rest pose), so it reads the same whatever the skull's pitch.
    flames = []
    for side in (1, -1):
        n = LR(side)
        base = R.wpos(root, P(side * 5.0, 2.6, 0.2))
        sweep = [(3.6, 0.6, 0.2), (6.2, 1.6, 2.8), (6.8, 2.8, 6.4), (5.6, 3.8, 9.4)]
        wp = [base + np.array((side * x * k, y * k, z * k)) for x, y, z in sweep]
        thick = [3.5, 3.0, 2.0, 1.5]
        hid = names[f"horn_{n}"]
        ids = [hid, f"{hid}_1", f"{hid}_2", f"{hid}_3"]
        prev, start = root, base
        for j in range(4):
            end = limb(R, ids[j], prev, start, wp[j], s(thick[j]), "horn" if j < 3 else "horn_tip")
            prev, start = ids[j], end
        part(f"{hid}_boss", hid, S(4, 4, 4), "horn", rel=(0, 0, 0))

    # the eye flames: a bone holding both, so the renderer can hide them in one go; they lick up out of the sockets
    # and stream back over the brows (world-upright at rest)
    ef = names["eye_fire"]
    bone(ef, root, rel=P(0, 1.7, 4.9))
    fw = max(4, int(round(inner * 2)))
    fh = fw + int(round(2.0 * k * 2))
    for side in (1, -1):
        n = LR(side)
        oid = f"{root}_orbit_{n}"
        Rw = R.F[oid][0]
        fid = f"{ef}_{n}"
        # a sheet of soul fire filling the hollow just above its floor, licking up over the top rim, and a hotter
        # second tongue nearer the mouth of the socket
        at = R.wpos(oid, (side * (-d / 2 + 0.55), -inner / 2, 0))
        card(fid, ef, soul_flame(fw, fh, seed=40 + side, tongues=2, lean=0.2 * side, sparks=1, base=0.35), "flame",
             at=at, offset=(0, fh / 4, 0), plane="yz", wrot=euler(Rw))
        card(f"{fid}_front", fid, soul_flame(fw - 2, fh - 4, seed=50 + side, tongues=1, sparks=0, base=0.45),
             "flame", rel=(side * (d - 1.0), 0, 0), offset=(0, (fh - 4) / 4, 0), plane="yz")
        flames += [fid, f"{fid}_front"]
    return flames


# ======================================================================= the bull
def build():
    R = Rig(density=DENSITY, bone_style="bone")
    part, bone, card = R.part, R.bone, R.card
    glow = []

    # ---------------------------------------------------------------- spine, hump and pelvis
    part("body", None, [3, 2.5, 24], "bone_cracked", at=(0, 18.0, 0), centre=(0, 19.75, -1.0))
    # thoracic spines: tall at the withers (the hump), short along the back, leaning back
    SPINES = [(11.0, 4.5), (9.0, 5.5), (7.0, 5.0), (5.0, 3.0), (3.0, 1.0), (1.0, 1.0), (-1.0, 1.0), (-3.0, 1.0),
              (-5.0, 1.0)]
    for k, (z, h) in enumerate(SPINES):
        part(f"spine_{k}", "body", [1, h, 1.5], "spine", at=(0, 20.5, z), offset=(0, h / 2, 0), wrot=(-22, 0, 0))
    # vertebra knobs along the column
    for k, z in enumerate((8.0, 4.0, 0.0, -4.0, -7.5)):
        part(f"vert_{k}", "body", [4, 1.5, 2], "bone_dark", centre=(0, 19.0, z))
    # pelvis: the sacrum plate, hook bones flaring at the hips, pin bones at the back
    part("pelvis", "body", [7, 2.5, 8], "bone_cracked", centre=(0, 19.0, -10.0))
    for s in (1, -1):
        n = LR(s)
        part(f"hook_{n}", "pelvis", [3, 2.5, 3.5], "bone", centre=(s * 4.8, 19.6, -7.6), wrot=(0, 0, s * -12))
        part(f"ilium_{n}", "pelvis", [1.5, 5, 6], "bone_dark", centre=(s * 3.6, 17.0, -10.6), wrot=(-10, 0, s * -18))
        part(f"pin_{n}", "pelvis", [2, 2, 2.5], "bone", centre=(s * 2.6, 18.0, -14.0))
        # shoulder blades over the front ribs
        part(f"scapula_{n}", "body", [1, 6, 3.5], "bone", at=(s * 5.0, 19.4, 9.6), offset=(0, -2.8, 0),
             wrot=(-20, 0, s * 14))

    # ---------------------------------------------------------------- the ribcage (a barrel of hoops)
    bone("ribs", "body", at=(0, 19.0, 3.0))
    RIBS = [(10.0, 5.0, 9.6), (7.0, 6.0, 8.8), (4.0, 6.5, 8.6), (1.0, 6.5, 8.8), (-2.0, 6.0, 9.8), (-5.0, 5.0, 12.0)]
    for k, (z, w, yb) in enumerate(RIBS):
        for s in (1, -1):
            n = LR(s)
            e = limb(R, f"rib_{k}{n}", "ribs", (s * 1.6, 19.2, z), (s * w, 14.6, z - 0.6), 1, "rib", depth=1)
            e = limb(R, f"rib_{k}{n}_lo", f"rib_{k}{n}", e, (s * (w - 2.2), yb, z - 1.6), 1, "rib", depth=1)
            if k <= 3:                         # true ribs: cartilage down to the breastbone
                limb(R, f"rib_{k}{n}_cart", f"rib_{k}{n}_lo", e, (s * 1.0, 8.4, z - 2.0), 1, "bone_dark", depth=1)
    part("sternum", "ribs", [2.5, 1, 13], "bone", centre=(0, 8.2, 3.6), wrot=(-6, 0, 0))

    # ---------------------------------------------------------------- the soul fire inside
    bone("soul_fire", "ribs", at=(0, 9.0, 2.5))
    part("soul_core", "soul_fire", [5, 2.5, 10], "core", rel=(0, 1.25, 0))
    glow.append("soul_core")
    FL = [((0, 0.5, 6.0), 14, 20, 1), ((0, 0.5, 2.0), 16, 22, 2), ((0, 0.5, -2.0), 14, 18, 3)]
    for j, (rel, fw, fh, sd) in enumerate(FL):
        a = soul_flame(fw, fh, seed=sd, tongues=3, sparks=3)
        b = soul_flame(fw, fh, seed=sd + 10, tongues=3, sparks=3)
        card(f"soul_flame_{j}", "soul_fire", a, "flame", rel=rel, offset=(0, fh / 4 - 0.5, 0), plane="xy",
             rot=(0, 8 * (j - 1), 0))
        card(f"soul_flame_{j}x", f"soul_flame_{j}", b, "flame", rel=(0, 0, 0), offset=(0, fh / 4 - 0.5, 0),
             plane="yz")
        glow += [f"soul_flame_{j}", f"soul_flame_{j}x"]

    # ---------------------------------------------------------------- neck and head: carried low, horns levelled
    part("neck", "body", [3.5, 3.5, 4.5], "bone_cracked", at=(0, 18.6, 11.0), offset=(0, 0, 2.0), wrot=(4, 0, 0))
    part("neck_knob", "neck", [4.5, 1.5, 2], "bone_dark", rel=(0, 1.6, 1.5))
    part("neck_1", "neck", [3, 3, 4.5], "bone", rel=(0, 0, 4.0), offset=(0, 0, 2.0), rot=(6, 0, 0))
    part("neck_1_knob", "neck_1", [4, 1.5, 2], "bone_dark", rel=(0, 1.4, 1.5))
    bone("head", "neck_1", rel=(0, 0.6, 4.4), rot=(28, 0, 0))
    glow += build_skull(R, "head", 0.8, {"jaw": "jaw", "horn_l": "horn_l", "horn_r": "horn_r",
                                          "eye_fire": "eye_fire"})

    # ---------------------------------------------------------------- tail: bare vertebrae, a tuft of soul fire
    part("tail", "pelvis", [2, 2, 4], "bone", at=(0, 18.8, -14.6), offset=(0, 0, -1.8), wrot=(-62, 0, 0))
    part("tail_1", "tail", [1.5, 1.5, 4], "bone", rel=(0, 0, -3.8), offset=(0, 0, -1.8), rot=(-14, 0, 0))
    part("tail_2", "tail_1", [1.5, 1.5, 3.5], "bone_dark", rel=(0, 0, -3.8), offset=(0, 0, -1.6), rot=(-8, 0, 0))
    card("tail_flame", "tail_2", soul_flame(8, 12, seed=7, tongues=2, sparks=1, base=0.28), "flame",
         rel=(0, 0, -3.4), offset=(0, 2.0, 0), plane="xy", wrot=(0, 0, 0))
    card("tail_flame_x", "tail_flame", soul_flame(8, 12, seed=8, tongues=2, sparks=1, base=0.28), "flame",
         rel=(0, 0, 0), offset=(0, 2.0, 0), plane="yz")
    glow += ["tail_flame", "tail_flame_x"]

    # ---------------------------------------------------------------- legs: bare bones, knobbly joints, cloven hooves
    feet = []
    LEGS = {
        # hip/shoulder, knee, (hock), fetlock, thickness of each bone
        "f": ((5.0, 15.0, 11.0), (5.6, 8.0, 12.5), None, (5.6, 2.6, 12.2), (2.5, 2.0)),
        "b": ((4.6, 16.0, -11.0), (5.2, 10.6, -7.6), (5.4, 6.4, -12.0), (5.4, 2.6, -11.2), (3.0, 2.5, 2.0)),
    }
    for kk, (hip, knee, hock, fet, th) in LEGS.items():
        for s in (1, -1):
            n = LR(s)
            lid = f"leg_{kk}{n}"
            e = limb(R, lid, "body", M(hip, s), M(knee, s), th[0], "bone")
            part(f"{lid}_head", lid, [3.5, 3.5, 3.5], "bone_dark", rel=(0, 0, 0))     # the ball joint
            e = limb(R, f"shin_{kk}{n}", lid, e, M(hock if hock else fet, s), th[1], "bone")
            part(f"knee_{kk}{n}", f"shin_{kk}{n}", [3, 3, 3], "bone", rel=(0, -0.2, 0))
            parent = f"shin_{kk}{n}"
            if hock:
                e = limb(R, f"cannon_{kk}{n}", parent, e, M(fet, s), th[2], "bone")
                part(f"hock_{kk}{n}", f"cannon_{kk}{n}", [2.5, 3, 3.5], "bone", rel=(0, 0, -0.4))
                parent = f"cannon_{kk}{n}"
            fid = f"foot_{kk}{n}"
            part(fid, parent, [3, 2, 3.5], "hoof", at=e, centre=(e[0], 1.0, e[2] + 0.5), wrot=(0, 0, 0))
            part(f"fetlock_{kk}{n}", fid, [2.5, 2, 2.5], "bone", centre=(e[0], 2.6, e[2] - 0.2))
            card(f"dewclaw_{kk}{n}", fid, ["hh", "h."], "dewclaw", centre=(e[0], 2.2, e[2] - 1.6), plane="yz")
            feet.append(fid)

    # ---------------------------------------------------------------- saddle and rider seat
    bone("saddle", "body", at=(0, 21.0, -1.0))
    part("saddle_blanket", "saddle", [11, 0.5, 10], "blanket", rel=(0, 0.25, 0))
    part("saddle_seat", "saddle", [7, 1.5, 8.5], "saddle", rel=(0, 1.25, 0))
    part("saddle_cantle", "saddle_seat", [7, 3, 1.5], "saddle", rel=(0, 1.5, -4.0), rot=(14, 0, 0))
    part("saddle_pommel", "saddle_seat", [3, 2.5, 1.5], "saddle", rel=(0, 1.2, 3.8), rot=(-12, 0, 0))
    part("saddle_horn", "saddle_pommel", [1.5, 1.5, 1.5], "brass", rel=(0, 1.6, 0.2))
    for s in (1, -1):
        n = LR(s)
        part(f"saddle_flap_{n}", "saddle", [0.5, 4.5, 6.5], "flap", rel=M((5.6, -1.8, 0), s), rot=(0, 0, s * 30))
        part(f"saddle_buckle_{n}", f"saddle_flap_{n}", [0.5, 1, 1], "brass", rel=M((0.3, -1.4, 1.6), s))
        card(f"stirrup_{n}", f"saddle_flap_{n}", ["s..", "s..", "s..", "s..", "s..", "BBB", "b.b", "bBb"], "stirrup",
             rel=M((0.4, -2.0, -1.4), s), offset=(0, -2.0, 0), plane="yz", wrot=(0, 0, 0))
        a = R.wpos(f"saddle_flap_{n}", M((0.0, -2.0, 1.6), s))
        limb(R, f"saddle_girth_{n}", f"saddle_flap_{n}", a, (s * 1.4, 8.0, 2.6), 0.5, "strap", depth=1.5)
    part("saddle_girth", "saddle", [3.5, 0.5, 1.5], "strap", centre=(0, 7.6, 2.4))
    bone("rider", "saddle", rel=(0, 2.0, -0.5))

    # ---------------------------------------------------------------- horse armour shells (clear unless armoured)
    for nm, par, size, rel, rot in (
            ("armor_head", "head", [5, 1, 9.5], (0, 3.45, 6.3), (2, 0, 0)),
            ("armor_neck", "neck", [4.5, 1.5, 9], (0, 2.4, 4.0), (6, 0, 0)),
            ("armor_chest", "body", [12, 7, 1.5], (0, -4.4, 11.8), (8, 0, 0)),
            ("armor_flank_l", "body", [1, 4, 12], (7.4, -1.8, 2.6), (0, 0, -10)),
            ("armor_flank_r", "body", [1, 4, 12], (-7.4, -1.8, 2.6), (0, 0, 10)),
            ("armor_rump", "body", [10, 1.5, 10], (0, 3.0, -10.4), (0, 0, 0))):
        part(nm, par, size, "armor", rel=rel, rot=rot)

    # ---------------------------------------------------------------- natural armour (the soul_bull_armored texture):
    # blackened, gilded blackstone plates bolted straight onto the bones, gold-capped spikes, chains slung between
    # them. Clear in every other texture, so that texture is a superset of the plain one.
    part("plate_skull", "head", [6, 1, 5], "plate", rel=(0, 3.3, 3.2), rot=(-4, 0, 0))
    part("plate_snout", "head", [3.5, 1, 5], "plate", rel=(0, 3.0, 8.4), rot=(2, 0, 0))
    card("plate_skull_spikes", "plate_skull", spikes(10, 6, 61), "plate_spike", rel=(0, 0.5, 0), offset=(0, 1.5, 0),
         plane="yz")
    part("plate_neck", "neck", [5.5, 2, 4], "plate", rel=(0, 2.0, 2.0), rot=(-4, 0, 0))
    part("plate_neck_1", "neck_1", [5, 2, 4], "plate", rel=(0, 1.8, 2.2), rot=(-4, 0, 0))
    card("plate_neck_spikes", "plate_neck", spikes(8, 7, 62), "plate_spike", rel=(0, 1.0, 0), offset=(0, 1.75, 0),
         plane="yz")
    card("plate_neck_1_spikes", "plate_neck_1", spikes(8, 6, 64), "plate_spike", rel=(0, 1.0, 0), offset=(0, 1.5, 0),
         plane="yz")
    part("plate_chest", "body", [9, 5, 1], "plate", rel=(0, -5.2, 11.6), rot=(12, 0, 0))
    part("plate_rump", "body", [8, 1.5, 7], "plate", rel=(0, 2.8, -10.4))
    card("plate_rump_spikes", "plate_rump", spikes(14, 6, 63), "plate_spike", rel=(0, 0.75, 0), offset=(0, 1.5, 0),
         plane="yz")
    for s in (1, -1):
        n = LR(s)
        part(f"plate_flank_{n}", "body", [1, 4.5, 6], "plate", rel=(s * 7.4, -3.6, 6.4), rot=(0, 0, -s * 12))
        part(f"plate_hip_{n}", "pelvis", [1, 3.5, 5], "plate", centre=(s * 6.4, 17.6, -9.6), wrot=(0, 0, -s * 16))
        card(f"plate_chain_{n}", "body", chain_art(26, 7, 4.0, seed=2 if s > 0 else 0), "plate_chain",
             rel=(s * 7.6, -1.4, -2.0), offset=(0, -1.75, 0), plane="yz")

    styles = copy.deepcopy(STYLES)
    styles["dewclaw"] = {"ramp": "horn", "tone": 4, "light": 0, "brush": {"off": True}, "art_key": {"h": "horn:4"}}
    spec = {
        "name": "Soul Bull",
        "description": "The Winterworks Soul Bull: a bull that is a completely black skeleton kept alive by blue soul "
                       "fire. Charred black bones with soot-grey highlights, a heavy skull with big forward-sweeping "
                       "horns, soul flames in the eye sockets, soul fire burning inside the ribcage, a saddle the "
                       "renderer can hide, a rider seat locator and transparent horse-armour shells that the armour "
                       "textures paint. Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 2200, "colors": 128},
        "light": LIGHT,
        "brush": BRUSH,
        "minecraft": {"fps": 20, "glow_parts": glow, "glow_ramps": ["soul"]},
        "anim_ground_tolerance": 0.4,
        "render": {"background": "#7a6650", "hero": [38, 18], "shadow": 0.5},
        "palette": {"ramps": RAMPS},
        "styles": styles,
        "parts": R.P,
        "animations": {},
    }
    return spec, R, feet


# ======================================================================= animation
LEGS4 = ("fl", "fr", "bl", "br")
TAIL = ["tail", "tail_1", "tail_2"]
NECK = ["neck", "neck_1", "head"]
FLAMES = ["soul_flame_0", "soul_flame_1", "soul_flame_2"]


def legs(fl=(0, 0, 0), fr=(0, 0, 0), bl=(0, 0, 0, 0), br=(0, 0, 0, 0)):
    """Pitch each leg's joints: front (upper, shin, hoof), back (upper, shin, cannon, hoof)."""
    out = {}
    for nm, v in (("fl", fl), ("fr", fr)):
        out = add(out, r(f"leg_{nm}", v[0]), r(f"shin_{nm}", v[1]), r(f"foot_{nm}", v[2]))
    for nm, v in (("bl", bl), ("br", br)):
        out = add(out, r(f"leg_{nm}", v[0]), r(f"shin_{nm}", v[1]), r(f"cannon_{nm}", v[2]), r(f"foot_{nm}", v[3]))
    return out


def flicker(L, k=1.0, fast=1.0):
    """Soul fire that never sits still: the whole fire breathes, each tongue licks up at its own rate, the eye flames
    and the tail tuft flutter. Whole-number cycles so every loop is seamless."""
    c = lambda n: max(1, int(round(n * L * fast)))  # noqa: E731
    tr = [osc("soul_fire", None, [0.06 * k, 0.1 * k, 0.04 * k], c(1.5), 0.0, ch="scale"),
          osc("soul_core", None, [0.08 * k, 0.18 * k, 0.06 * k], c(3), 0.3, ch="scale")]
    for j, f in enumerate(FLAMES):
        tr.append(osc(f, None, [0.1 * k, 0.24 * k, 0], c(3 + j), 0.13 * j, ch="scale"))
        tr.append(osc(f"{f}x", None, [0, 0.18 * k, 0.12 * k], c(4 - j * 0.5), 0.4 + 0.2 * j, ch="scale"))
        tr.append(osc(f, "y", 9 * k, c(2), 0.25 * j))
    for n in ("l", "r"):
        tr.append(osc(f"eye_fire_{n}", None, [0.1 * k, 0.24 * k, 0], c(4), 0.2 if n == "l" else 0.55, ch="scale"))
        tr.append(osc(f"eye_fire_{n}", "z", 6 * k, c(2), 0.1 if n == "l" else 0.6))
    tr.append(osc("tail_flame", None, [0.2 * k, 0, 0.25 * k], c(4), 0.3, ch="scale"))
    return tr


def animate(spec):
    A = {}
    REST = {}

    # idle: slow heavy breaths (the ribs swell, the fire with them), the head swaying and tossing its horns, a snort,
    # a hoof pawing the ground, the tail swishing
    L = 4.0
    PAW = legs(fr=(-34, 60, 30))
    A["idle"] = timeline(L, [(0.0, REST, None), (2.3, REST, None), (2.5, PAW, "out"), (2.7, legs(fr=(-6, 10, 0)), "in"),
                             (2.9, PAW, "out"), (3.15, legs(fr=(-6, 10, 0)), "in"), (3.4, REST, "ease"),
                             (L, REST, None)], loop=True, extra=[
        osc("ribs", None, [0.05, 0.05, 0.02], 2, 0.0, ch="scale"),
        osc("body", "x", -1.2, 2, 0.05),
        osc("neck", "x", -2.5, 2, 0.1), osc("head", "y", 10, 1, 0.2), osc("head", "z", 4, 1, 0.45),
        keys("head", "x", [[0, 0], [1.0, 0], [1.12, -10, "out"], [1.3, 4], [1.5, 0], [L, 0]]),
        keys("jaw", "x", [[0, 0], [1.0, 0], [1.12, 10, "out"], [1.3, 2], [1.5, 0], [L, 0]]),
        wave(TAIL, "y", 14, 2, lag=0.12, growth=1.3), wave(TAIL, "x", -4, 2, lag=0.1),
    ] + flicker(L))

    # walk: diagonal pairs, heavy; the head nods twice a stride, the tail swings after
    L = 1.2
    sw = 22

    def leg_cycle(nm, ph, back):
        tr = [osc(f"leg_{nm}", "x", sw, 1, ph)]
        if back:
            tr.append({"part": f"shin_{nm}", "axis": "x", "keys": sorted([[((u + ph) % 1.0) * L, v] for u, v in
                                                                          ((0.0, 0), (0.3, -6), (0.55, -30), (0.8, -8))]),
                       "ease": "smooth"})
            tr.append({"part": f"cannon_{nm}", "axis": "x", "keys": sorted([[((u + ph) % 1.0) * L, v] for u, v in
                                                                            ((0.0, 0), (0.3, 4), (0.55, 34), (0.8, 8))]),
                       "ease": "smooth"})
        else:
            tr.append({"part": f"shin_{nm}", "axis": "x", "keys": sorted([[((u + ph) % 1.0) * L, v] for u, v in
                                                                          ((0.0, 0), (0.3, 6), (0.55, 40), (0.8, 10))]),
                       "ease": "smooth"})
        tr.append(osc(f"foot_{nm}", "x", -sw * 0.5, 1, ph + 0.1))
        return tr

    A["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True,
                         extra=leg_cycle("fl", 0.0, False) + leg_cycle("br", 0.0, True) + leg_cycle("fr", 0.5, False)
                         + leg_cycle("bl", 0.5, True)
                         + [osc("body", "z", 2.5, 1, 0.0), osc("body", "x", 1.2, 2, 0.1),
                            osc("neck", "x", 4, 2, 0.2), osc("head", "x", -3, 2, 0.3), osc("head", "y", -5, 1, 0.1),
                            osc("ribs", None, [0.03, 0.03, 0.0], 2, 0.2, ch="scale"),
                            wave(TAIL, "y", 12, 1, lag=0.14, growth=1.2, phase=0.1),
                            osc("saddle", "z", 1.0, 1, 0.1)]
                         + flicker(L),
                         lift=[[0, 0], [L * 0.25, 0.3], [L * 0.5, 0], [L * 0.75, 0.3], [L, 0]])

    # run: a charging gallop, head down and horns levelled, the body rocking over the shoulders
    L = 0.6

    def gallop(nm, ph, back, amp=40):
        tr = [osc(f"leg_{nm}", "x", amp, 1, ph)]
        if back:
            tr.append({"part": f"shin_{nm}", "axis": "x", "keys": sorted([[((u + ph) % 1.0) * L, v] for u, v in
                                                                          ((0.0, 0), (0.25, -10), (0.5, -44), (0.75, -16))]),
                       "ease": "smooth"})
            tr.append({"part": f"cannon_{nm}", "axis": "x", "keys": sorted([[((u + ph) % 1.0) * L, v] for u, v in
                                                                            ((0.0, 0), (0.25, 8), (0.5, 50), (0.75, 14))]),
                       "ease": "smooth"})
        else:
            tr.append({"part": f"shin_{nm}", "axis": "x", "keys": sorted([[((u + ph) % 1.0) * L, v] for u, v in
                                                                          ((0.0, 0), (0.25, 10), (0.5, 60), (0.75, 18))]),
                       "ease": "smooth"})
        tr.append(osc(f"foot_{nm}", "x", -amp * 0.5, 1, ph + 0.12))
        return tr

    CHARGE = add(r("body", 4), r("neck", 10), r("head", 10))
    A["run"] = timeline(L, [(0.0, CHARGE, None), (L, CHARGE, None)], loop=True,
                        extra=gallop("fl", 0.0, False) + gallop("fr", 0.1, False) + gallop("bl", 0.5, True)
                        + gallop("br", 0.6, True)
                        + [osc("body", "x", 5, 1, 0.75), osc("neck", "x", -4, 1, 0.85), osc("head", "x", 3, 1, 0.9),
                           wave(TAIL, "x", -16, 1, lag=0.12, growth=1.2, bias=-30),
                           osc("ribs", None, [0.04, 0.04, 0.0], 1, 0.3, ch="scale"),
                           osc("saddle", "x", 1.5, 1, 0.8)]
                        + flicker(L, 1.4, 1.5),
                        lift=[[0, 0.6], [L * 0.25, 1.6], [L * 0.5, 0.6], [L * 0.75, 0.0], [L, 0.6]])

    # ram (1.0 s): rears back with a snort and a paw, then lunges, head dropping so the horns level at the target,
    # hits (a jolt, the fire flaring), shoves through and recovers
    REAR = add(r("body", -10), r("neck", -14), r("head", -16), r("jaw", 10), legs(fl=(-20, 30, 10), fr=(-30, 50, 20),
                                                                                   bl=(16, -10, 0, 0), br=(16, -10, 0, 0)))
    LUNGE = add(r("body", 6), r("neck", 18), r("head", 18), r("jaw", -4),
                legs(fl=(-34, 6, 10), fr=(-30, 6, 10), bl=(30, -6, -8, 0), br=(26, -6, -8, 0)),
                pos("body", 0, 0, 3.0), sc("ribs", 0.06, 0.06, 0.0))
    HIT = add(LUNGE, r("head", 4), r("neck", 2), pos("body", 0, 0, 1.5))
    A["ram"] = timeline(1.0, [(0.0, REST, None), (0.24, REAR, "out"), (0.4, LUNGE, "out_back"), (0.5, HIT, "in"),
                              (0.66, add(HIT, r("head", -4)), "ease"), (1.0, REST, "ease")],
                        extra=[shake("head", 0.48, 0.7, 5, freq=12, axis=2), shake("body", 0.48, 0.66, 1.5, freq=12,
                                                                                   axis=2),
                               ring("tail", 0.42, -20, freq=5, decay=4, axis=0, end=1.0)]
                        + flicker(1.0, 1.0, 2.0)
                        + [keys("soul_fire", None, [[0, [0, 0, 0]], [0.38, [0, 0, 0]], [0.5, [0.25, 0.4, 0.2], "out"],
                                                    [0.8, [0, 0, 0]], [1.0, [0, 0, 0]]], ch="scale")])

    # pin (1.5 s): the victim held on the horns: head low and shoving, legs braced, grinding the horns side to side,
    # the fire roaring; then a toss of the head lets go
    BRACE = add(r("body", 5), r("neck", 14), r("head", 18), r("jaw", 6),
                legs(fl=(-24, 8, 8), fr=(-20, 8, 8), bl=(24, -4, -6, 0), br=(24, -4, -6, 0)),
                pos("body", 0, 0, 1.0), sc("ribs", 0.05, 0.05, 0))
    TOSS = add(r("body", -6), r("neck", -14), r("head", -24), r("jaw", 14))
    A["pin"] = timeline(1.5, [(0.0, REST, None), (0.15, BRACE, "out"), (1.15, add(BRACE, r("neck", 4)), "ease"),
                              (1.3, TOSS, "out_back"), (1.5, REST, "ease")],
                        extra=[shake("head", 0.2, 1.15, [0, 6, 7], freq=4),
                               shake("body", 0.2, 1.15, [0, 0, 2], freq=4, phase=-1),
                               keys("soul_fire", None, [[0, [0, 0, 0]], [0.2, [0.25, 0.35, 0.2], "out"],
                                                        [1.15, [0.3, 0.4, 0.2]], [1.5, [0, 0, 0]]], ch="scale"),
                               wave(TAIL, "y", 18, 3, lag=0.1, growth=1.2)]
                        + flicker(1.5, 1.3, 2.0))

    # drain (loop): souls flow in: head raised, jaw wide, the ribs swelling, the fire drinking them in and surging
    L = 2.0
    DRINK = add(r("neck", -18), r("head", -20), r("jaw", 24), r("body", -3), sc("ribs", 0.06, 0.06, 0.03))
    A["drain"] = timeline(L, [(0.0, DRINK, None), (L, DRINK, None)], loop=True,
                          extra=[osc("ribs", None, [0.05, 0.05, 0.02], 2, 0.0, ch="scale"),
                                 osc("soul_fire", None, [0.18, 0.3, 0.14], 2, 0.1, bias=[0.2, 0.3, 0.15], ch="scale"),
                                 osc("jaw", "x", 5, 2, 0.2), osc("head", "z", 4, 1, 0.0), osc("head", "y", 5, 1, 0.3),
                                 wave(TAIL, "y", 10, 1, lag=0.12, growth=1.3)]
                          + [t for t in flicker(L, 1.6, 1.5) if t.get("part") != "soul_fire"])

    # revive (2.0 s): from a heap of bones on the ground, the fire catches in the ribs, the skull lifts and the legs
    # push the body up; a roar with the fire flaring, then it settles into its stance
    HEAP = add(pos("body", 0, -8.5, 0), r("body", 4, 0, 10), sc("soul_fire", -0.95, -0.95, -0.95),
               sc("ribs", -0.12, -0.18, -0.05),
               legs(fl=(-80, 150, 0), fr=(-70, 140, 0), bl=(70, -100, 80, 0), br=(80, -110, 80, 0)),
               r("neck", 34), r("head", 22, 0, -20), r("jaw", 16), r("tail", -40, 30), r("tail_1", 0, 30),
               r("tail_2", 0, 30), sc("eye_fire", -0.95, -0.95, -0.95), sc("tail_flame", -0.95, -0.95, -0.95))
    IGNITE = add(HEAP, sc("soul_fire", 0.95, 0.95, 0.95), sc("eye_fire", 0.95, 0.95, 0.95),
                 sc("ribs", 0.12, 0.18, 0.05), r("neck", -14), r("head", -10, 0, 16))
    KNEEL = add(pos("body", 0, -4.5, 0), r("body", -6), legs(fl=(-40, 100, 0), fr=(-10, 30, 0), bl=(46, -70, 60, 0),
                                                              br=(46, -70, 60, 0)),
                r("neck", 4), r("head", -6), sc("tail_flame", -0.5, -0.5, -0.5))
    ROAR = add(r("body", -8), r("neck", -26), r("head", -24), r("jaw", 30), sc("ribs", 0.1, 0.1, 0.04),
               sc("soul_fire", 0.4, 0.5, 0.3), legs(fl=(-10, 10, 0), fr=(-10, 10, 0)))
    A["revive"] = timeline(2.0, [(0.0, HEAP, None), (0.35, HEAP, None), (0.6, IGNITE, "out"), (1.0, KNEEL, "ease"),
                                 (1.35, ROAR, "out_back"), (1.6, add(ROAR, r("jaw", -6)), "ease"),
                                 (2.0, REST, "ease")],
                           extra=[shake("ribs", 0.4, 0.75, [0, 0, 4], freq=10),
                                  shake("head", 1.35, 1.65, [0, 0, 6], freq=9)]
                           + [t for t in flicker(2.0, 1.0, 1.5) if t.get("part") not in ("soul_fire", "eye_fire_l",
                                                                                          "eye_fire_r",
                                                                                          "tail_flame")])
    spec["animations"] = A


# ======================================================================= armour variants
def armor_style(metal):
    """Horse armour plates over the shells. Iron: polished plate, a recessed groove, rivets, wear chips. Gold: warm
    engraved plate with a filigree border and a soul gem. Diamond: cut crystal, a harlequin lattice of bevelled
    facets, glints and sparkles, no rivets (distinct at a glance)."""
    tone = {"iron": 5.6, "gold": 6.0, "diamond": 6.2}[metal]
    layers = [{"id": "sky", "op": "gradient", "axis": "y", "amount": -1.0},
              {"id": "temper", "op": "noise", "scale": 2.0, "amount": 0.35}]
    if metal == "diamond":
        layers += [{"id": "lattice", "op": "stripes", "axis": [1, 0, 1], "period": 2.5, "width": 0.18, "shift": -2.2},
                   {"id": "lattice_b", "op": "stripes", "axis": [-1, 0, 1], "period": 2.5, "width": 0.18,
                    "shift": -2.2},
                   {"id": "facets", "op": "patches", "scale": 1.2, "threshold": 0.5, "shift": 1.6,
                    "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.6, "highlight_shift": 2.0}},
                   {"id": "sparkle", "op": "gloss", "post": True, "dash": False, "density": 0.25, "shift": 3.0}]
    else:
        layers += [{"id": "groove", "op": "panel", "inset": 2, "shift": -1.8, "highlight": 1.8, "shadow": -1.8,
                    "min_size": 6}]
        if metal == "iron":
            layers += [{"id": "rivets", "op": "rivets", "inset": 1, "spacing": 5, "highlight": 2.6, "shadow": -2.6,
                        "min_size": 5},
                       {"id": "chips", "op": "wear", "width": 1, "density": 0.12, "shift": -2.4}]
        else:
            layers += [{"id": "engrave", "op": "cracks", "scale": 1.0, "width": 0.05, "shift": -1.6},
                       {"id": "studs", "op": "rivets", "inset": 1, "spacing": 4, "highlight": 2.4, "shadow": -2.0,
                        "min_size": 5}]
    layers.append({"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.8,
                   "shift": 2.6})
    return {"ramp": metal, "tone": tone, "light": 0.9, "dither": 0.0,
            "rim": {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -2.0, "outline": "dark"},
            "brush": {"off": True}, "layers": layers}


# a cut soul gem set in the gold chanfron and peytral
GEM = [".ab.", "abBc", "bBcc", ".cc."]
GEM_KEY = {"a": "soul:7", "b": "soul:5", "B": "soul:6", "c": "soul:3"}


def plate_styles():
    """The natural armour: blackstone plates in bevelled bricks with gilded veins, gold bolts and a dark outline;
    gold-capped blackstone spikes; dark iron chains."""
    plate = {"ramp": "blackstone", "tone": 4.6, "light": 0.9, "dither": 0.0,
             "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.6, "outline": "dark"},
             "brush": {"off": True},
             "layers": [{"id": "bricks", "op": "scales", "shape": "square", "along": "x", "size": [3.0, 2.0],
                         "gap": 0.5, "highlight": 1.4, "shadow": -1.6, "jitter": 0.5},
                        {"id": "gilt", "op": "cracks", "scale": 0.9, "width": 0.035, "threshold": 0.52, "ramp": "gold",
                         "tone": 6.4,
                         "bevel": {"shadow": 1, "highlight": 0, "shadow_shift": -1.4}},
                        {"id": "bolts", "op": "rivets", "inset": 1, "spacing": 4, "ramp": "gold", "tone": 7.0,
                         "highlight": 1.6, "shadow": -2.0, "min_size": 4},
                        {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1,
                         "density": 0.5, "shift": 2.0}]}
    spike = {"ramp": "blackstone", "tone": 5, "light": 0.2, "brush": {"off": True},
             "art_key": {"t": "gold:8", "m": "gold:5", "f": "blackstone:5"}}
    chain = {"ramp": "iron", "tone": 4, "light": 0.2, "brush": {"off": True},
             "art_key": {"C": "iron:7", "c": "iron:5", "d": "iron:2"}}
    return {"plate": plate, "plate_spike": spike, "plate_chain": chain}


def armored_spec(spec):
    """soul_bull_armored: the wild bull's own armour (about one in five; Wither Skeletons ride these)."""
    out = copy.deepcopy(spec)
    out["name"] = "Soul Bull Armored"
    out["styles"].update(plate_styles())
    return out


def variant_spec(spec, metal):
    out = copy.deepcopy(spec)
    out["name"] = f"Soul Bull Armor {metal.title()}"
    out["styles"]["armor"] = armor_style(metal)
    if metal == "gold":
        for p in out["parts"]:
            if p["id"] in ("armor_chest", "armor_head"):
                p["paint"] = {"stamps": [{"face": "front" if p["id"] == "armor_chest" else "top", "at": "center",
                                          "art": GEM, "key": GEM_KEY}]}
    return out


# ======================================================================= the skull block
def build_block():
    R = Rig(density=DENSITY, bone_style="bone")
    # the skull lies on its jaw, face tipped a little down; the root pivots at the poll joint
    R.bone("skull", None, at=(0, 9.0, -6.0), rot=(34, 0, 0))
    glow = build_skull(R, "skull", 1.25, {"jaw": "jaw", "horn_l": "horn_l", "horn_r": "horn_r",
                                          "eye_fire": "eye_fire"}, open_jaw=2.0)
    # bone fragments scattered at its feet: a broken vertebra and a rib stub
    R.part("frag_vert", "skull", [3, 1.5, 2], "bone_dark", at=(5.5, 0.75, 4.0), wrot=(0, 30, 0))
    R.part("frag_rib", "skull", [1, 1, 5], "rib", at=(-6.0, 0.5, 2.0), wrot=(0, -40, 0))
    spec = {
        "name": "Soul Bull Skull",
        "description": "The Soul Bull's skull, a Winterworks block: a heavy charred-black bull skull with big "
                       "forward-sweeping horns, lying on its jaw; its eye sockets burn with soul fire when it is lit "
                       "(eye_fire, glow). Minecraft pixel units, density 2.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 600, "colors": 64},
        "light": LIGHT,
        "brush": BRUSH,
        "minecraft": {"fps": 20, "glow_parts": glow, "glow_ramps": ["soul"]},
        "render": {"background": "#7a6650", "hero": [-34, 22], "shadow": 0.5},
        "palette": {"ramps": {k: RAMPS[k] for k in ("bone", "horn", "void", "soul")}},
        "styles": {k: v for k, v in copy.deepcopy(STYLES).items()
                   if k in ("bone", "bone_dark", "skull", "brow", "socket", "void", "teeth", "horn", "horn_tip", "flame", "rib")},
        "parts": R.P,
        "animations": {
            # the eye flames lick and flutter; the jaw creaks against the ground
            "idle": {"length": 2.0, "loop": True, "tracks": [
                {"part": "eye_fire_l", "channel": "scale", "osc": {"amp": [0.1, 0.22, 0], "cycles": 4}},
                {"part": "eye_fire_r", "channel": "scale", "osc": {"amp": [0.1, 0.22, 0], "cycles": 4, "phase": 0.35}},
                {"part": "eye_fire_l", "axis": "z", "osc": {"amp": 6, "cycles": 2, "phase": 0.1}},
                {"part": "eye_fire_r", "axis": "z", "osc": {"amp": 6, "cycles": 2, "phase": 0.6}},
                {"part": "jaw", "axis": "x", "keys": [[0, 0], [0.9, 0], [1.05, -2.0, "out"], [1.3, -0.6], [1.6, 0, "back"],
                                                      [2.0, 0]]},
            ]},
        },
    }
    rest_on_ground(spec["parts"], DENSITY)
    return spec


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples")
    spec, R, feet = build()
    animate(spec)
    rest_on_ground(spec["parts"], DENSITY, feet)
    revive = {"revive": spec["animations"].pop("revive")}
    ground_lock(spec, "body", feet)                       # the hooves stay on the ground
    rest, spec["animations"] = spec["animations"], revive
    ground_lock(spec, "body", None)                       # the heap of bones lies on the ground
    spec["animations"] = dict(rest, **revive)
    dump(spec, os.path.join(out_dir, "soul_bull.json"))
    vdir = os.path.join(out_dir, "variants")
    os.makedirs(vdir, exist_ok=True)
    for metal in ("iron", "gold", "diamond"):
        dump(variant_spec(spec, metal), os.path.join(vdir, f"soul_bull_armor_{metal}.json"))
    dump(armored_spec(spec), os.path.join(vdir, "soul_bull_armored.json"))
    dump(build_block(), os.path.join(out_dir, "soul_bull_skull.json"))
