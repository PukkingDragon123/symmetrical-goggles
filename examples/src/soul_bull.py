"""Builds examples/soul_bull.json, its texture variants examples/variants/soul_bull_armor_{iron,gold,diamond}.json
(horse armour) and examples/variants/soul_bull_armored.json (the wild bull's own armour), and the skull block
examples/soul_bull_skull.json (Winterworks 0.4, mods/winterworks/docs/FIXES_0_4.md "The Soul Bull").

    python examples/src/soul_bull.py

The Soul Bull is a hulking bull skeleton kept alive by soul fire. Its bones are a Wither Skeleton's charred charcoal
greys with lighter worn edges, thick and cracked. Massive shoulder blades and a hump of tall spined vertebrae over the
withers; a deep barrel ribcage, some rib ends snapped off in splinters, soul fire roaring inside and licking up between
the ribs; bony spikes down the spine, the sacrum and a jagged tail. A heavy skull with huge horns sweeping out and
forward, chipped and ridged; a heavy scowling brow over full round eye sockets (an octagonal bone rim round a deep
hollow) with soul fire burning in them; a cracked, split lower jaw and long fangs. Thick legs on cloven hooves like
split stone. Head low, horns levelled, legs planted wide: it is always about to charge. 32.8 x 41.7 x 74.4 px: about
2.05 blocks wide (horns), 2.6 tall (the hump), 4.65 long from nose and horn tips to the tail flame; the body itself
(ribs and legs) is about 1.7 wide and 2.7 long, the withers 2.0 blocks up.

Every flame uses vanilla soul fire's colours (ramp `soul`: deep teal, turquoise, bright cyan, a near-white core;
picked by eye along the gradient of vanilla's soul_fire and soul_torch textures, no pixels copied).

* `saddle` (a bone): a dark leather saddle on a crimson blanket with gold trim, flaps hugging the ribs, a girth strap
  down to the breastbone, stirrups. The renderer shows or hides it.
* `rider` (a locator bone, no geometry): where a Wither Skeleton or the player sits, on the seat.
* Horse armour shells (`armor_head`, `armor_neck`, `armor_chest`, `armor_flank_l/r`, `armor_rump`) are transparent in
  the plain texture; each armour variant paints them (iron: riveted plate; gold: engraved plate with a soul gem;
  diamond: cut crystal facets in a harlequin lattice with sparkles), so the renderer only swaps the texture.
* The wild bull's own armour (`plate_*` shells: skull, snout, neck, chest, flanks, hips, rump, with gold-capped spikes
  and chains slung along the flanks) is transparent in every texture but `soul_bull_armored`: blackened, gilded
  blackstone bolted onto the bones. That texture is the plain one plus the plates.

The skull block (`soul_bull_skull`) is the same skull lying on its jaw: bones `skull` (root), `jaw`, `horn_l`, `horn_r`
and `eye_fire` (the soul flames in its sockets; glow; hide it while the skull is unlit, the sockets stay as dark
hollows).

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so both models export 1:1
to vanilla entity models. Faces +Z, ground at y = 0, "left" is +X. Exported into the mod with a fixed hash seed
(PYTHONHASHSEED=0):

    python -m lowpix mc export examples/soul_bull.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/soul_bull
    python -m lowpix mc export examples/variants/soul_bull_armor_iron.json --mod mods/winterworks --modid winterworks \\
        --texture-only --name soul_bull_armor_iron -o out/soul_bull       (and gold, diamond, and soul_bull_armored)
    python -m lowpix mc export examples/soul_bull_skull.json (the same options as the bull)

Contract bones: body, ribs, soul_fire (glow), neck, head, jaw, horn_l, horn_r, tail, leg_fl, leg_fr, leg_bl, leg_br,
saddle, rider. Extra joints: neck_1, horn_*_1..4, tail_1..3, shin_*, cannon_b* (hind cannon bones), foot_* (hooves, each
with two claws), jaw_tip (the cracked front of the jaw), eye_fire (both eye flames). Clips: idle, walk, run, ram
(1.0 s), pin (1.5 s), drain (loop: souls flow in), revive (2.0 s). Glow: every soul-fire texel (ramp `soul`: the
ribcage fire, the eyes, the tail flame).
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
    # soul fire (glow): vanilla soul fire's colours, deep teal -> turquoise -> bright cyan -> near-white core
    "soul": ["#018085", "#018e93", "#019fa4", "#01b0b6", "#01c0c6", "#12d5db", "#32e8ee", "#7bfafe", "#d4feff"],
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
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.75, "gradient": 0.45, "ao": 0.5, "ao_height": 9.0}
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
UNDER = {"id": "under", "op": "gradient", "axis": "y", "amount": 0.8}
# deep cracks through the bone, each with a lit lip on its far side
CRACKS = {"id": "cracks", "op": "cracks", "scale": 2.2, "width": 0.05, "threshold": 0.42, "shift": -3.4,
          "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 2.6}}
INVISIBLE = [{"faces": ["all"], "at": "top-left", "art": ["_" * 96] * 96}]

STYLES = {
    "bone": {"ramp": "bone", "tone": 5.0, "rim": RIM, "layers": [GRAIN, SOOT, PITS, UNDER, SHEEN]},
    "bone_cracked": {"ramp": "bone", "tone": 5.0, "rim": RIM, "layers": [GRAIN, SOOT, PITS, UNDER, CRACKS, SHEEN]},
    "bone_dark": {"ramp": "bone", "tone": 3.2, "rim": RIM, "layers": [GRAIN, SOOT, UNDER]},
    "rib": {"ramp": "bone", "tone": 4.8, "rim": dict(RIM, light_shift=2.8), "brush": {"flow": "long"},
            "layers": [GRAIN, {"id": "rib_edge", "op": "gradient", "axis": "y", "amount": -0.6},
                       dict(CRACKS, scale=1.6, threshold=0.5), SHEEN]},
    # a rib snapped off: the broken end shows the paler, porous inside of the bone
    "rib_broken": {"ramp": "bone", "tone": 4.8, "rim": dict(RIM, light_shift=2.8), "brush": {"flow": "long"},
                   "layers": [GRAIN, {"id": "rib_edge", "op": "gradient", "axis": "y", "amount": -0.6},
                              {"id": "break", "op": "fill", "ramp": "bone", "tone": 8.6, "faces": ["bottom"]},
                              {"id": "marrow", "op": "spots", "count": 2, "radius": [0.2, 0.3], "ramp": "bone",
                               "tone": 2.0, "faces": ["bottom"]}, SHEEN]},
    "shard": {"ramp": "bone", "tone": 6.0, "rim": dict(RIM, light_shift=2.2), "brush": {"flow": "long"},
              "layers": [GRAIN, {"id": "tip", "op": "gradient", "axis": "y", "amount": -1.6}]},
    "spine": {"ramp": "bone", "tone": 5.0, "rim": dict(RIM, light_shift=2.8), "brush": {"flow": "y"},
              "layers": [GRAIN, {"id": "tip", "op": "gradient", "axis": "y", "amount": 1.2},
                         dict(CRACKS, scale=1.4, threshold=0.5)]},
    # spike tips: a sharp pale point
    "spike": {"ramp": "bone", "tone": 6.2, "rim": dict(RIM, light_shift=2.4), "brush": {"flow": "y"},
              "layers": [GRAIN, {"id": "tip", "op": "gradient", "axis": "y", "amount": 2.2}]},
    "skull": {"ramp": "bone", "tone": 5.2, "rim": dict(RIM, light_shift=2.8),
              "layers": [GRAIN, SOOT, PITS, {"id": "sutures", "op": "cracks", "scale": 1.6, "width": 0.04,
                                                     "shift": -2.0},
                         dict(CRACKS, scale=2.6, threshold=0.5), SHEEN]},
    # the cracked jaw: a deep split runs through it, lit along its lip
    "jaw": {"ramp": "bone", "tone": 5.0, "rim": dict(RIM, light_shift=2.8),
            "layers": [GRAIN, SOOT, PITS, dict(CRACKS, scale=1.8, width=0.06, threshold=0.38), SHEEN]},
    "brow": {"ramp": "bone", "tone": 5.8, "rim": dict(RIM, light_shift=3.0), "brush": {"flow": "x"},
             "layers": [GRAIN, SOOT, {"id": "furrows", "op": "stripes", "axis": "x", "period": 1.5, "width": 0.25,
                                      "shift": -1.4, "faces": ["top", "front"]}, SHEEN]},
    "socket": {"ramp": "void", "tone": 1.4, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
               "layers": [{"id": "glow_rim", "op": "band", "axis": "y", "from": -1.01, "to": -0.4, "ramp": "soul",
                           "tone": 0.0, "faces": ["sides", "front", "back"]}]},
    "void": {"ramp": "void", "tone": 1.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "teeth": {"ramp": "bone", "tone": 9.0, "light": 0.3, "brush": {"off": True},
              "art_key": {"t": "bone:10", "T": "bone:11", "r": "bone:4", "m": "bone:8", "f": "bone:6"}},
    # fangs: long pale teeth, lightest at the point
    "fang": {"ramp": "bone", "tone": 9.6, "light": 0.6,
             "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -3.0},
             "brush": {"flow": "y"}, "layers": [{"id": "tip", "op": "gradient", "axis": "y", "amount": -1.4}]},
    "horn": {"ramp": "horn", "tone": 3.4, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.2},
             "brush": {"flow": "long", "length": 2.2},
             "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.3, "shift": -1.4},
                        {"id": "chips", "op": "wear", "width": 1, "density": 0.45, "ramp": "horn", "tone": 7.4},
                        {"id": "splits", "op": "cracks", "scale": 1.6, "width": 0.05, "threshold": 0.5,
                         "shift": -2.4},
                        {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1,
                         "density": 0.6, "shift": 2.0}]},
    "horn_tip": {"ramp": "horn", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.4},
                 "brush": {"flow": "long"},
                 "layers": [{"id": "tip", "op": "gradient", "axis": "y", "amount": -1.6},
                            {"id": "chips", "op": "wear", "width": 1, "density": 0.4, "ramp": "horn", "tone": 8.0}]},
    # hooves like split stone: blocky cloven claws, chipped and cracked, a dark sole
    "hoof": {"ramp": "horn", "tone": 3.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.4,
                                                  "outline": "dark"},
             "brush": {"flow": "y", "textures": {"horn": "stone"}},
             "layers": [{"id": "strata", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.25, "shift": -1.2,
                         "faces": ["sides"]},
                        {"id": "split", "op": "cracks", "scale": 1.2, "width": 0.07, "threshold": 0.4, "shift": -2.6,
                         "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.8}},
                        {"id": "chips", "op": "wear", "width": 1, "density": 0.35, "ramp": "horn", "tone": 6.6},
                        {"id": "sole", "op": "fill", "ramp": "void", "tone": 2.4, "faces": ["bottom"]}]},
    # soul fire (fully emissive in game): a near-white core, bright cyan and turquoise, deep teal tips
    "flame": {"ramp": "soul", "tone": 4.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
              "art_key": {"W": "soul:8", "w": "soul:7", "c": "soul:6", "E": "soul:5", "e": "soul:3", "b": "soul:2",
                          "k": "soul:0"}},
    "core": {"ramp": "soul", "tone": 5.6, "light": 0.15, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
             "layers": [{"id": "hot", "op": "noise", "scale": 0.8, "amount": 1.8},
                        {"id": "heat", "op": "gradient", "axis": "y", "amount": 2.0},
                        {"id": "embers", "op": "spots", "count": 5, "radius": [0.4, 0.8], "ramp": "soul",
                         "tone": 8.0}]},
    # saddle
    "saddle": {"ramp": "leather", "tone": 4.6, "rim": RIM, "brush": {"flow": "z"},
               "layers": [{"id": "stitch", "op": "panel", "inset": 1, "shift": -1.4, "highlight": 1.0, "shadow": -1.0,
                           "min_size": 4},
                          {"id": "wear", "op": "wear", "width": 1, "density": 0.2, "shift": 1.4},
                          {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1,
                           "density": 0.5, "shift": 1.6}]},
    "blanket": {"ramp": "crimson", "tone": 4.4, "rim": RIM, "brush": {"flow": "x"},
                "layers": [{"id": "trim", "op": "band", "axis": "x", "from": 0.82, "to": 1.01, "ramp": "gold",
                            "tone": 5.0, "faces": ["top", "sides"]},
                           {"id": "trim_r", "op": "band", "axis": "x", "from": -1.01, "to": -0.82, "ramp": "gold",
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
    "dewclaw": {"ramp": "horn", "tone": 4, "light": 0, "brush": {"off": True},
                "art_key": {"h": "horn:5", "H": "horn:7", "d": "horn:2"}},
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
    depth from its edge, the classic pixel-art flame: a teal rim, turquoise, bright cyan and a near-white core, the
    bands thinner and colder toward the tips, plus loose sparks above. Characters: W w c E e b k (hot -> cold), '.'
    clear."""
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
    # the tips of the tongues go deep teal
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


def fang_row(w, h, seed, hang=True):
    """A row of jagged fangs w x h texels: uneven pointed teeth, a few long ones, pale tips. Hanging from the top row
    (hang) or standing up from the bottom row. Characters: T tip, t body, m mid, r root shadow, '.' clear."""
    rows = spikes(w, h, seed, tip="T", mid="t", body="m")
    rows = [list(rw) for rw in rows]
    for x in range(w):                                  # a dark gum line along the root
        if rows[h - 1][x] != ".":
            rows[h - 1][x] = "r"
    out = ["".join(rw) for rw in rows]
    return out[::-1] if hang else out


def dewclaw_art():
    """Two little split-stone dewclaws side by side (hanging from the top row)."""
    return ["hh.hh", "Hh.Hh", "hd.hd", ".d..d"]


# ======================================================================= the skull (shared by the bull and the block)
def build_skull(R, root, k, names, open_jaw=6.0):
    """A heavy bull skull in the frame of `root` (origin at the poll joint, face along +Z, top +Y), scaled by k:
    a broad flat forehead with a horn bar across the poll, deep orbits at the front corners of the forehead under a
    heavy scowling brow, burning soul flames inside, a long face narrowing to a broad flat muzzle with a dark nasal
    aperture, cheek teeth and long fangs, and a long lower jaw cracked through, its front split off and askew. Horns
    sweep out from the poll, then forward and a little up, huge and chipped. `names` maps 'jaw', 'horn_l', 'horn_r'
    and 'eye_fire' to bone names. Returns the list of flame card ids (glow)."""
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
        # the floor of the hollow, deep inside: dark, lit soul-teal from below by the fire
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
                            "art": [".vv...vv.", "vVVv.vVVv", "vVVv.vVVv", ".vv...vv."],
                            "key": {"v": "void:2", "V": "void:0"}}]})
    part(f"{root}_palate", root, S(5, 0.5, 10), "void", rel=P(0, -1.6, 10.0))
    # a bony ridge down the middle of the forehead, between the brows
    part(f"{root}_crest", root, S(2, 1, 5), "brow", rel=P(0, 3.9, 3.4), rot=(-6, 0, 0))
    for side in (1, -1):
        n = LR(side)
        # the orbit: a full, round bony socket on each side of the frontal plate, looking out and forward: an
        # octagonal rim of bone (four bars, four cut corners) round a deep hollow whose floor is dark
        orbit(n, side)
        # the heavy brow: a thick ridge jutting out over the socket, its inner end pulled down into a scowl
        part(f"{root}_brow_{n}", root, S(5, 1.5, 3), "brow", rel=P(side * 4.0, 4.9, 4.5),
             rot=MR((-12, -20, 16), side))
        part(f"{root}_cheek_{n}", root, S(1.5, 2.5, 6), "bone_dark", rel=P(side * 3.2, -0.4, 8.2),
             rot=MR((0, 6, 0), side))
        card(f"{root}_teeth_{n}", root, fang_row(12, 4, 30 + side, hang=True), "teeth",
             rel=P(side * 2.6, -1.8, 10.0), offset=(0, -1.0, 0), plane="yz")
        # fangs: two long upper fangs each side, hanging outside the lower jaw
        for j, (z, L, w) in enumerate(((12.6, 3.75, 1.4), (9.4, 2.75, 1.0))):
            fid = f"{root}_fang_{n}{j}"
            part(fid, root, S(w, L, w), "fang", rel=P(side * 2.55, -1.2, z), offset=(0, -s(L) / 2, 0),
                 rot=MR((-10, 0, -8), side))
            part(f"{fid}_tip", fid, [0.5, s(L * 0.4), 0.5], "fang", rel=(0, -s(L), 0),
                 offset=(0, -s(L * 0.4) / 2, 0), rot=(-8, 0, 0))
    # the lower jaw: a long mandible hinged under the back of the skull, cracked through two-thirds along: the front
    # piece (jaw_tip, with the incisors and the lower tusks) hangs a little askew
    jaw = names["jaw"]
    part(jaw, root, S(4.5, 2, 9), "jaw", rel=P(0, -2.2, 1.8), offset=P(0, -0.6, 4.5), rot=(open_jaw, 0, 0))
    part(f"{jaw}_ramus", jaw, S(5.5, 3, 2), "bone_dark", rel=P(0, 0.6, 0.6))
    part(f"{jaw}_tongue", jaw, S(3.5, 0.5, 10), "void", rel=P(0, 0.6, 7.0))
    tip = f"{jaw}_tip"
    part(tip, jaw, S(4.5, 2, 4.5), "jaw", rel=P(0, -0.7, 9.3), offset=P(0, 0.1, 2.35), rot=(10, 7, -6),
         paint={"layers": [{"id": "break", "op": "fill", "ramp": "bone", "tone": 8.0, "faces": ["back"]}]})
    card(f"{jaw}_incisors", tip, fang_row(8, 4, 37, hang=False), "teeth", rel=P(0, 1.1, 4.3),
         offset=(0, 1.0, 0), plane="xy")
    for side in (1, -1):
        n = LR(side)
        card(f"{jaw}_teeth_{n}", jaw, fang_row(12, 4, 33 + side, hang=False), "teeth",
             rel=P(side * 2.0, 0.4, 6.5), offset=(0, 1.0, 0), plane="yz")
        # a lower tusk at each corner of the split-off front, curving up outside the muzzle
        tid = f"{jaw}_tusk_{n}"
        part(tid, tip, S(1.4, 3, 1.4), "fang", rel=P(side * 2.2, 0.5, 2.6), offset=(0, s(3) / 2, 0),
             rot=MR((-16, 0, -14), side))
        part(f"{tid}_tip", tid, [0.5, s(1.2), 0.5], "fang", rel=(0, s(3), 0), offset=(0, s(1.2) / 2, 0),
             rot=(-10, 0, 0))

    # horns: huge, out from the ends of the poll, then sweeping forward and a little up (a lyre), tips levelled at
    # what it charges; ridged and chipped. The sweep is drawn in world space from each horn's root (rest pose), so it
    # reads the same whatever the skull's pitch.
    flames = []
    for side in (1, -1):
        n = LR(side)
        base = R.wpos(root, P(side * 5.0, 2.6, 0.2))
        sweep = [(3.2, 0.6, 0.0), (5.4, 1.6, 2.4), (6.1, 2.6, 5.4), (5.5, 3.4, 8.0), (4.2, 4.0, 10.0),
                 (3.4, 4.2, 11.4)]
        wp = [base + np.array((side * x * k, y * k, z * k)) for x, y, z in sweep]
        thick = [4.0, 3.5, 3.0, 2.25, 1.5, 0.75]
        hid = names[f"horn_{n}"]
        ids = [hid] + [f"{hid}_{j}" for j in range(1, len(sweep))]
        prev, start = root, base
        for j in range(len(sweep)):
            end = limb(R, ids[j], prev, start, wp[j], s(thick[j]), "horn" if j < len(sweep) - 1 else "horn_tip")
            prev, start = ids[j], end
        part(f"{hid}_boss", hid, S(4.5, 4.5, 4.5), "horn", rel=(0, 0, 0))
        # jagged chips: a broken flake standing proud on the outer curve of the middle segments
        for j in (1, 2):
            L = next(p for p in R.P if p["id"] == ids[j])["size"][1]
            part(f"{ids[j]}_chip", ids[j], [s(thick[j] * 0.5), s(1.2), 0.5], "horn", rel=(0, -L * 0.55, 0),
                 offset=(0, 0, s(thick[j]) / 2 + 0.25), rot=(18, 0, 0))

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
        card(fid, ef, soul_flame(fw, fh, seed=40 + side, tongues=2, lean=0.2 * side, sparks=0, base=0.35), "flame",
             at=at, offset=(0, fh / 4, 0), plane="yz", wrot=euler(Rw))
        card(f"{fid}_front", fid, soul_flame(fw - 2, fh - 4, seed=50 + side, tongues=1, sparks=0, base=0.45),
             "flame", rel=(side * (d - 1.0), 0, 0), offset=(0, (fh - 4) / 4, 0), plane="yz")
        flames += [fid, f"{fid}_front"]
    return flames


# ======================================================================= the bull
SKULL_K = 1.3


def spike(R, pid, parent, h, base=(2.0, 2.5), tip=(1.0, 1.5), style="spine", tip_len=2.5, **kw):
    """A bony spike: a thick process `h` long standing on its parent's local +Y, with a narrower pale point on top."""
    R.part(pid, parent, [base[0], h, base[1]], style, offset=(0, h / 2, 0), **kw)
    R.part(f"{pid}_tip", pid, [tip[0], tip_len, tip[1]], "spike", rel=(0, h, 0), offset=(0, tip_len / 2 - 0.25, 0),
           rot=(-10, 0, 0))


def build():
    R = Rig(density=DENSITY, bone_style="bone")
    part, bone, card = R.part, R.bone, R.card
    glow = []

    # ---------------------------------------------------------------- spine, hump and pelvis
    part("body", None, [5, 4, 26], "bone_cracked", at=(0, 29.0, 0), centre=(0, 29.5, 1.0))
    # dorsal spines: a tall hump over the withers, low (under the saddle) along the back, leaning back; each a thick
    # process with a pale point
    SPINES = [(14.0, 6.5), (11.5, 8.5), (9.0, 9.0), (6.5, 8.0), (4.0, 5.5), (1.5, 2.5), (-1.5, 2.0), (-4.5, 2.0),
              (-7.5, 2.0), (-11.5, 3.5)]
    for k, (z, h) in enumerate(SPINES):
        if h >= 3:
            spike(R, f"spine_{k}", "body", h, at=(0, 31.0, z), wrot=(-22, 0, 0))
        else:
            part(f"spine_{k}", "body", [2, h, 2.5], "spine", at=(0, 31.0, z), offset=(0, h / 2, 0), wrot=(-22, 0, 0))
    # vertebra knobs (transverse processes) along the column
    for k, z in enumerate((12.0, 7.0, 2.0, -3.0, -8.0)):
        part(f"vert_{k}", "body", [7.5, 2, 3], "bone_dark", centre=(0, 29.0, z))
    # pelvis: the sacrum plate with its own spikes, hook bones flaring at the hips, pin bones at the back
    part("pelvis", "body", [9, 3.5, 12], "bone_cracked", centre=(0, 29.5, -17.0))
    for k, (z, h) in enumerate(((-13.5, 3.5), (-17.0, 4.5), (-20.5, 3.5))):
        spike(R, f"sacrum_spike_{k}", "pelvis", h, base=(2.0, 2.0), at=(0, 31.0, z), wrot=(-28, 0, 0))
    for s in (1, -1):
        n = LR(s)
        part(f"hook_{n}", "pelvis", [4.5, 4, 5.5], "bone", centre=(s * 7.6, 30.4, -12.6), wrot=(0, 0, s * -12))
        part(f"hook_{n}_knob", f"hook_{n}", [2.5, 2.5, 3], "bone_dark", centre=(s * 9.8, 30.0, -12.6))
        part(f"ilium_{n}", "pelvis", [2.5, 8, 9.5], "bone_dark", centre=(s * 5.8, 26.5, -17.2),
             wrot=(-10, 0, s * -18))
        part(f"pin_{n}", "pelvis", [3, 3, 4], "bone", centre=(s * 4.2, 28.6, -22.4))
        # massive shoulder blades over the front ribs, a raised spine (ridge) down each
        part(f"scapula_{n}", "body", [2, 11, 7], "bone_cracked", at=(s * 6.4, 31.0, 11.0), offset=(0, -5.0, 0),
             wrot=(-22, 0, s * 18))
        part(f"scapula_{n}_ridge", f"scapula_{n}", [1.5, 9.5, 1.5], "bone", rel=(s * 1.4, -5.0, 0.4),
             rot=MR((0, 0, -6), s))
        part(f"scapula_{n}_cap", f"scapula_{n}", [3, 2, 8], "bone_dark", rel=(0, 0.4, 0))

    # ---------------------------------------------------------------- the ribcage (a barrel of thick hoops)
    bone("ribs", "body", at=(0, 28.5, 4.0))
    # (z, half-width at the widest point, height of the lower end)
    RIBS = [(13.5, 8.5, 16.0), (9.5, 10.5, 14.0), (5.5, 11.5, 13.5), (1.5, 11.5, 14.0), (-2.5, 11.0, 16.5),
            (-6.5, 9.5, 19.5)]
    # snapped ribs: the fraction of the lower bone left, ending in a pale break and a splinter (a snapped true rib's
    # cartilage still hangs from the breastbone, a gap above it)
    BROKEN = {(3, "r"): 0.55, (4, "l"): 0.5, (5, "r"): 0.45, (5, "l"): 0.7}
    for k, (z, w, yb) in enumerate(RIBS):
        for s in (1, -1):
            n = LR(s)
            e = limb(R, f"rib_{k}{n}", "ribs", (s * 2.5, 29.5, z), (s * w, 22.0, z - 1.0), 1.5, "rib", depth=2)
            lo_full = np.array((s * (w - 3.0), yb, z - 2.5))
            f = BROKEN.get((k, n))
            lo = e + (lo_full - e) * f if f else lo_full
            e2 = limb(R, f"rib_{k}{n}_lo", f"rib_{k}{n}", e, lo, 1.5, "rib_broken" if f else "rib", depth=2)
            if f:
                L = next(p for p in R.P if p["id"] == f"rib_{k}{n}_lo")["size"][1]
                part(f"rib_{k}{n}_shard", f"rib_{k}{n}_lo", [0.5, 2, 1], "shard", rel=(s * 0.25, -L, 0.25),
                     offset=(0, -0.75, 0), rot=MR((10, 0, 14), s))
            if k <= 3:                         # true ribs: cartilage down to the breastbone
                limb(R, f"rib_{k}{n}_cart", f"rib_{k}{n}_lo", lo_full if f else e2, (s * 1.5, 12.5, z - 3.0), 1.5,
                     "bone_dark", depth=1.5)
    part("sternum", "ribs", [4, 1.5, 19], "bone_cracked", centre=(0, 12.2, 5.0), wrot=(-6, 0, 0))

    # ---------------------------------------------------------------- the soul fire inside
    bone("soul_fire", "ribs", at=(0, 14.5, 4.0))
    part("soul_core", "soul_fire", [7, 3, 13], "core", rel=(0, 1.0, -0.5))
    glow.append("soul_core")
    FL = [((0, 1.0, 6.5), 24, 30, 16, 1), ((0, 1.0, 2.0), 28, 34, 18, 2), ((0, 1.0, -2.5), 22, 28, 14, 3)]
    for j, (rel, fw, fh, fz, sd) in enumerate(FL):
        a = soul_flame(fw, fh, seed=sd, tongues=4, sparks=4, base=0.22)
        b = soul_flame(fz, fh, seed=sd + 10, tongues=3, sparks=3, base=0.22)
        card(f"soul_flame_{j}", "soul_fire", a, "flame", rel=rel, offset=(0, fh / 4 - 0.5, 0), plane="xy",
             rot=(0, 8 * (j - 1), 0))
        card(f"soul_flame_{j}x", f"soul_flame_{j}", b, "flame", rel=(0, 0, 0), offset=(0, fh / 4 - 0.5, 0),
             plane="yz")
        glow += [f"soul_flame_{j}", f"soul_flame_{j}x"]

    # ---------------------------------------------------------------- neck and head: carried low, horns levelled
    part("neck", "body", [6, 6, 7], "bone_cracked", at=(0, 28.5, 13.0), offset=(0, 0, 3.0), wrot=(12, 0, 0))
    part("neck_knob", "neck", [7.5, 2.5, 3], "bone_dark", rel=(0, 2.8, 2.5))
    spike(R, "neck_spike", "neck", 3.0, base=(1.5, 2.0), rel=(0, 3.6, 2.0), rot=(-34, 0, 0))
    part("neck_1", "neck", [5.5, 5.5, 5.5], "bone_cracked", rel=(0, 0, 5.5), offset=(0, 0, 2.5), rot=(8, 0, 0))
    part("neck_1_knob", "neck_1", [6.5, 2.5, 3], "bone_dark", rel=(0, 2.5, 2.5))
    bone("head", "neck_1", rel=(0, 1.0, 5.5), rot=(20, 0, 0))
    glow += build_skull(R, "head", SKULL_K, {"jaw": "jaw", "horn_l": "horn_l", "horn_r": "horn_r",
                                             "eye_fire": "eye_fire"})

    # ---------------------------------------------------------------- tail: jagged vertebrae, a soul flame at the tip
    TAILS = [("tail", "pelvis", 3.5, 5.5, (-64, 0, 0)), ("tail_1", "tail", 3.0, 5.0, (-6, 0, 0)),
             ("tail_2", "tail_1", 2.5, 4.5, (2, 0, 0)), ("tail_3", "tail_2", 2.0, 4.0, (8, 0, 0))]
    prev_len = 0.0
    for k, (tid, par, w, L, rot) in enumerate(TAILS):
        style = "bone" if k < 2 else "bone_dark"
        if k == 0:
            part(tid, par, [w, w, L], style, at=(0, 29.5, -23.0), offset=(0, 0, -L / 2 + 0.2), wrot=rot)
        else:
            part(tid, par, [w, w, L], style, rel=(0, 0, -prev_len + 0.2), offset=(0, 0, -L / 2 + 0.2), rot=rot)
        # a jagged spike on top of each vertebra, a knobbly process to each side
        spike(R, f"{tid}_spike", tid, 1.0 + 0.5 * (3 - k), base=(1.0, 1.5), tip=(0.5, 1.0), tip_len=1.5,
              rel=(0, w / 2, -L * 0.55), rot=(-48, 0, 0))
        part(f"{tid}_knob", tid, [w + 2.0, 1.0, 1.5], "bone_dark", rel=(0, 0, -L * 0.6))
        prev_len = L
    card("tail_flame", "tail_3", soul_flame(14, 20, seed=7, tongues=3, sparks=2, base=0.3), "flame",
         rel=(0, 0, -3.6), offset=(0, 3.5, 0), plane="xy", wrot=(0, 0, 0))
    card("tail_flame_x", "tail_flame", soul_flame(10, 20, seed=8, tongues=2, sparks=2, base=0.3), "flame",
         rel=(0, 0, 0), offset=(0, 3.5, 0), plane="yz")
    glow += ["tail_flame", "tail_flame_x"]

    # ---------------------------------------------------------------- legs: thick bones, knobbly joints, split hooves
    feet = []
    LEGS = {
        # shoulder/hip, knee, (hock), fetlock, thickness of each bone
        "f": ((10.0, 23.5, 15.5), (10.5, 12.0, 17.0), None, (10.5, 5.5, 16.5), (3.5, 3.0)),
        "b": ((7.8, 25.5, -17.5), (9.5, 16.5, -12.0), (9.5, 10.5, -19.5), (9.5, 5.5, -18.5), (4.0, 3.0, 3.0)),
    }
    for kk, (hip, knee, hock, fet, th) in LEGS.items():
        for s in (1, -1):
            n = LR(s)
            lid = f"leg_{kk}{n}"
            e = limb(R, lid, "body", M(hip, s), M(knee, s), th[0], "bone_cracked")
            head_size = 6.0                                                             # the ball joint
            part(f"{lid}_head", lid, [head_size] * 3, "bone_dark", rel=(0, 0, 0))
            e = limb(R, f"shin_{kk}{n}", lid, e, M(hock if hock else fet, s), th[1], "bone_cracked")
            part(f"knee_{kk}{n}", f"shin_{kk}{n}", [5.5, 5, 5.5], "bone", rel=(0, -0.3, 0))
            parent = f"shin_{kk}{n}"
            if hock:
                e = limb(R, f"cannon_{kk}{n}", parent, e, M(fet, s), th[2], "bone_cracked")
                part(f"hock_{kk}{n}", f"cannon_{kk}{n}", [4.5, 5, 6], "bone", rel=(0, 0, -0.6))
                spike(R, f"hock_{kk}{n}_point", f"cannon_{kk}{n}", 2.0, base=(2.5, 2.5), tip=(1.5, 1.5), tip_len=1.5,
                      style="bone", rel=(0, 0.6, -2.4), rot=(-70, 0, 0))
                parent = f"cannon_{kk}{n}"
            fid = f"foot_{kk}{n}"
            # the coronet: a crown of stone round the top of the hoof
            part(fid, parent, [5, 2.5, 5.5], "hoof", at=e, centre=(e[0], 3.75, e[2] + 0.75), wrot=(0, 0, 0))
            part(f"fetlock_{kk}{n}", fid, [4.5, 3.5, 4.5], "bone", centre=(e[0], 6.0, e[2] - 0.2))
            # two claws split down the middle like broken stone, toes splayed a little
            claws = []
            for c, dx in (("a", 1), ("b", -1)):
                cid = f"{fid}_claw_{c}"
                part(cid, fid, [2.5, 3, 6], "hoof", centre=(e[0] + dx * 1.5, 1.5, e[2] + 1.6),
                     wrot=(0, dx * 5, 0))
                claws.append(cid)
            card(f"dewclaw_{kk}{n}", fid, dewclaw_art(), "dewclaw", centre=(e[0], 3.4, e[2] - 2.4), plane="xy")
            feet += [fid] + claws

    # ---------------------------------------------------------------- saddle and rider seat (behind the hump)
    bone("saddle", "body", at=(0, 32.0, -2.5))
    part("saddle_blanket", "saddle", [17, 1, 16], "blanket", rel=(0, 0.5, 0))
    part("saddle_seat", "saddle", [11, 2.5, 13.5], "saddle", rel=(0, 2.0, 0))
    part("saddle_cantle", "saddle_seat", [11, 4.5, 2.5], "saddle", rel=(0, 2.4, -6.4), rot=(14, 0, 0))
    part("saddle_pommel", "saddle_seat", [5, 4, 2.5], "saddle", rel=(0, 2.0, 6.0), rot=(-12, 0, 0))
    part("saddle_horn", "saddle_pommel", [2.5, 2.5, 2.5], "brass", rel=(0, 2.6, 0.3))
    for s in (1, -1):
        n = LR(s)
        part(f"saddle_flap_{n}", "saddle", [1, 7, 10], "flap", rel=M((9.4, -2.8, 0), s), rot=(0, 0, s * 26))
        part(f"saddle_buckle_{n}", f"saddle_flap_{n}", [1, 1.5, 1.5], "brass", rel=M((0.5, -2.4, 2.6), s))
        card(f"stirrup_{n}", f"saddle_flap_{n}", ["s...", "s...", "s...", "s...", "s...", "s...", "s...", "BBBB",
                                                   "b..b", "bBBb"], "stirrup",
             rel=M((0.6, -3.2, -2.2), s), offset=(0, -2.5, 0), plane="yz", wrot=(0, 0, 0))
        a = R.wpos(f"saddle_flap_{n}", M((0.0, -3.2, 2.6), s))
        limb(R, f"saddle_girth_{n}", f"saddle_flap_{n}", a, (s * 2.0, 12.0, 0.0), 1.0, "strap", depth=2.5)
    part("saddle_girth", "saddle", [5.5, 1, 2.5], "strap", centre=(0, 11.4, -0.2))
    bone("rider", "saddle", rel=(0, 3.25, -1.0))

    # ---------------------------------------------------------------- horse armour shells (clear unless armoured)
    for nm, par, size, rel, rot in (
            ("armor_head", "head", [7, 1.5, 15], (0, 5.6, 10.4), (2, 0, 0)),
            ("armor_neck", "neck", [8, 2, 13.5], (0, 4.0, 6.2), (6, 0, 0))):
        part(nm, par, size, "armor", rel=rel, rot=rot)
    part("armor_chest", "body", [15, 11, 2.5], "armor", centre=(0, 18.5, 18.4), wrot=(10, 0, 0))
    for s in (1, -1):
        part(f"armor_flank_{LR(s)}", "body", [1.5, 7, 19], "armor", centre=(s * 13.0, 23.5, 4.0),
             wrot=(0, 0, -s * 10))
    part("armor_rump", "body", [16, 2.5, 15], "armor", centre=(0, 32.6, -17.0))

    # ---------------------------------------------------------------- natural armour (the soul_bull_armored texture):
    # blackened, gilded blackstone plates bolted straight onto the bones, gold-capped spikes, chains slung between
    # them. Clear in every other texture, so that texture is a superset of the plain one.
    part("plate_skull", "head", [9.5, 1.5, 8], "plate", rel=(0, 5.5, 5.0), rot=(-4, 0, 0))
    part("plate_snout", "head", [5.5, 1.5, 8], "plate", rel=(0, 4.9, 13.4), rot=(2, 0, 0))
    card("plate_skull_spikes", "plate_skull", spikes(16, 10, 61), "plate_spike", rel=(0, 0.75, 0),
         offset=(0, 2.5, 0), plane="yz")
    part("plate_neck", "neck", [8, 2.5, 6], "plate", rel=(0, 3.4, 3.0), rot=(-4, 0, 0))
    part("plate_neck_1", "neck_1", [7.5, 2.5, 6], "plate", rel=(0, 3.2, 3.0), rot=(-4, 0, 0))
    card("plate_neck_spikes", "plate_neck", spikes(12, 11, 62), "plate_spike", rel=(0, 1.25, 0), offset=(0, 2.75, 0),
         plane="yz")
    card("plate_neck_1_spikes", "plate_neck_1", spikes(12, 10, 64), "plate_spike", rel=(0, 1.25, 0),
         offset=(0, 2.5, 0), plane="yz")
    part("plate_chest", "body", [13, 8, 1.5], "plate", centre=(0, 17.0, 17.6), wrot=(12, 0, 0))
    part("plate_rump", "body", [13, 2.5, 11], "plate", centre=(0, 32.4, -17.0))
    card("plate_rump_spikes", "plate_rump", spikes(22, 10, 63), "plate_spike", rel=(0, 1.25, 0), offset=(0, 2.5, 0),
         plane="yz")
    for s in (1, -1):
        n = LR(s)
        part(f"plate_flank_{n}", "body", [1.5, 7, 9.5], "plate", centre=(s * 13.0, 21.5, 9.0), wrot=(0, 0, -s * 12))
        part(f"plate_hip_{n}", "pelvis", [1.5, 5.5, 8], "plate", centre=(s * 10.6, 27.4, -16.0), wrot=(0, 0, -s * 16))
        card(f"plate_chain_{n}", "body", chain_art(36, 11, 6.0, seed=2 if s > 0 else 0), "plate_chain",
             centre=(s * 13.4, 22.0, -3.6), offset=(0, -2.75, 0), plane="yz")

    styles = copy.deepcopy(STYLES)
    spec = {
        "name": "Soul Bull",
        "description": "The Winterworks Soul Bull: a hulking bull skeleton kept alive by soul fire. Charred "
                       "wither-grey bones, thick and cracked; massive shoulder blades and a hump of spined vertebrae; "
                       "broken ribs round a ribcage roaring with soul fire; spikes down the spine and a jagged tail; a "
                       "heavy skull with huge chipped horns sweeping forward, a scowling brow over full round eye "
                       "sockets burning with soul fire, a cracked jaw and fangs; hooves like split stone. A saddle "
                       "the renderer can hide, a rider seat locator, and transparent horse-armour and "
                       "blackstone-plate shells that the armour textures paint. Minecraft pixel units, density 2: "
                       "exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 3200, "colors": 128},
        "light": LIGHT,
        "brush": BRUSH,
        "minecraft": {"fps": 20, "glow_parts": glow, "glow_ramps": ["soul"]},
        "anim_ground_tolerance": 0.6,
        "render": {"background": "#7a6650", "hero": [38, 18], "shadow": 0.5},
        "palette": {"ramps": RAMPS},
        "styles": styles,
        "parts": R.P,
        "animations": {},
    }
    return spec, R, feet


# ======================================================================= animation
LEGS4 = ("fl", "fr", "bl", "br")
TAIL = ["tail", "tail_1", "tail_2", "tail_3"]
NECK = ["neck", "neck_1", "head"]
FLAMES = ["soul_flame_0", "soul_flame_1", "soul_flame_2"]
U = 1.6            # the model's scale against the first Soul Bull: positions and lifts in the clips grow with it


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
    and the tail flame flutter. Whole-number cycles so every loop is seamless."""
    c = lambda n: max(1, int(round(n * L * fast)))  # noqa: E731
    tr = [osc("soul_fire", None, [0.06 * k, 0.1 * k, 0.04 * k], c(1.5), 0.0, ch="scale"),
          osc("soul_core", None, [0.08 * k, 0.18 * k, 0.06 * k], c(3), 0.3, ch="scale")]
    for j, f in enumerate(FLAMES):
        tr.append(osc(f, None, [0.1 * k, 0.24 * k, 0], c(3 + j), 0.13 * j, ch="scale"))
        tr.append(osc(f"{f}x", None, [0, 0.18 * k, 0.12 * k], c(4 - j * 0.5), 0.4 + 0.2 * j, ch="scale"))
        tr.append(osc(f, "y", 9 * k, c(2), 0.25 * j))
    for n in ("l", "r"):
        # (the eye flames flicker no taller than at rest, so they never lick up through the brow)
        tr.append(osc(f"eye_fire_{n}", None, [0.1 * k, 0.12 * k, 0], c(4), 0.2 if n == "l" else 0.55,
                      bias=[0, -0.12 * k, 0], ch="scale"))
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
        wave(TAIL, "y", 12, 2, lag=0.12, growth=1.25), wave(TAIL, "x", -4, 2, lag=0.1),
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
                            wave(TAIL, "y", 10, 1, lag=0.14, growth=1.2, phase=0.1),
                            osc("saddle", "z", 1.0, 1, 0.1)]
                         + flicker(L),
                         lift=[[0, 0], [L * 0.25, 0.3 * U], [L * 0.5, 0], [L * 0.75, 0.3 * U], [L, 0]])

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
                           wave(TAIL, "x", -14, 1, lag=0.12, growth=1.2, bias=-26),
                           osc("ribs", None, [0.04, 0.04, 0.0], 1, 0.3, ch="scale"),
                           osc("saddle", "x", 1.5, 1, 0.8)]
                        + flicker(L, 1.4, 1.5),
                        lift=[[0, 0.6 * U], [L * 0.25, 1.6 * U], [L * 0.5, 0.6 * U], [L * 0.75, 0.0], [L, 0.6 * U]])

    # ram (1.0 s): rears back with a snort and a paw, then lunges, head dropping so the horns level at the target,
    # hits (a jolt, the fire flaring), shoves through and recovers
    REAR = add(r("body", -10), r("neck", -14), r("head", -16), r("jaw", 10), legs(fl=(-20, 30, 10), fr=(-30, 50, 20),
                                                                                   bl=(16, -10, 0, 0), br=(16, -10, 0, 0)))
    LUNGE = add(r("body", 5), r("neck", 12), r("head", 12), r("jaw", -4),
                legs(fl=(-34, 6, 10), fr=(-30, 6, 10), bl=(30, -6, -8, 0), br=(26, -6, -8, 0)),
                pos("body", 0, 0, 3.0 * U), sc("ribs", 0.06, 0.06, 0.0))
    HIT = add(LUNGE, r("head", 4), r("neck", 2), pos("body", 0, 0, 1.5 * U))
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
                pos("body", 0, 0, 1.0 * U), sc("ribs", 0.05, 0.05, 0))
    TOSS = add(r("body", -6), r("neck", -14), r("head", -24), r("jaw", 14))
    A["pin"] = timeline(1.5, [(0.0, REST, None), (0.15, BRACE, "out"), (1.15, add(BRACE, r("neck", 4)), "ease"),
                              (1.3, TOSS, "out_back"), (1.5, REST, "ease")],
                        extra=[shake("head", 0.2, 1.15, [0, 6, 7], freq=4),
                               shake("body", 0.2, 1.15, [0, 0, 2], freq=4, phase=-1),
                               keys("soul_fire", None, [[0, [0, 0, 0]], [0.2, [0.25, 0.35, 0.2], "out"],
                                                        [1.15, [0.3, 0.4, 0.2]], [1.5, [0, 0, 0]]], ch="scale"),
                               wave(TAIL, "y", 16, 3, lag=0.1, growth=1.2)]
                        + flicker(1.5, 1.3, 2.0))

    # drain (loop): souls flow in: head raised, jaw wide, the ribs swelling, the fire drinking them in and surging
    L = 2.0
    DRINK = add(r("neck", -18), r("head", -20), r("jaw", 24), r("body", -3), sc("ribs", 0.06, 0.06, 0.03))
    A["drain"] = timeline(L, [(0.0, DRINK, None), (L, DRINK, None)], loop=True,
                          extra=[osc("ribs", None, [0.05, 0.05, 0.02], 2, 0.0, ch="scale"),
                                 osc("soul_fire", None, [0.18, 0.3, 0.14], 2, 0.1, bias=[0.2, 0.3, 0.15], ch="scale"),
                                 osc("jaw", "x", 5, 2, 0.2), osc("head", "z", 4, 1, 0.0), osc("head", "y", 5, 1, 0.3),
                                 wave(TAIL, "y", 9, 1, lag=0.12, growth=1.25)]
                          + [t for t in flicker(L, 1.6, 1.5) if t.get("part") != "soul_fire"])

    # revive (2.0 s): from a heap of bones on the ground, the fire catches in the ribs, the skull lifts and the legs
    # push the body up; a roar with the fire flaring, then it settles into its stance
    HEAP = add(pos("body", 0, -8.5 * U, 0), r("body", 4, 0, 10), sc("soul_fire", -0.95, -0.95, -0.95),
               sc("ribs", -0.12, -0.18, -0.05),
               legs(fl=(-80, 150, 0), fr=(-70, 140, 0), bl=(70, -100, 80, 0), br=(80, -110, 80, 0)),
               r("neck", 34), r("head", 22, 0, -20), r("jaw", 16), r("tail", -40, 30), r("tail_1", 0, 30),
               r("tail_2", 0, 30), r("tail_3", 0, 20), sc("eye_fire", -0.95, -0.95, -0.95),
               sc("tail_flame", -0.95, -0.95, -0.95))
    IGNITE = add(HEAP, sc("soul_fire", 0.95, 0.95, 0.95), sc("eye_fire", 0.95, 0.95, 0.95),
                 sc("ribs", 0.12, 0.18, 0.05), r("neck", -14), r("head", -10, 0, 16))
    KNEEL = add(pos("body", 0, -4.5 * U, 0), r("body", -6), legs(fl=(-40, 100, 0), fr=(-10, 30, 0),
                                                                  bl=(46, -70, 60, 0), br=(46, -70, 60, 0)),
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
        layers += [{"id": "lattice", "op": "stripes", "axis": [1, 0, 1], "period": 3.5, "width": 0.16, "shift": -2.2},
                   {"id": "lattice_b", "op": "stripes", "axis": [-1, 0, 1], "period": 3.5, "width": 0.16,
                    "shift": -2.2},
                   {"id": "facets", "op": "patches", "scale": 1.6, "threshold": 0.5, "shift": 1.6,
                    "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.6, "highlight_shift": 2.0}},
                   {"id": "sparkle", "op": "gloss", "post": True, "dash": False, "density": 0.25, "shift": 3.0}]
    else:
        layers += [{"id": "groove", "op": "panel", "inset": 2, "shift": -1.8, "highlight": 1.8, "shadow": -1.8,
                    "min_size": 6}]
        if metal == "iron":
            layers += [{"id": "rivets", "op": "rivets", "inset": 1, "spacing": 6, "highlight": 2.6, "shadow": -2.6,
                        "min_size": 5},
                       {"id": "chips", "op": "wear", "width": 1, "density": 0.12, "shift": -2.4}]
        else:
            layers += [{"id": "engrave", "op": "cracks", "scale": 1.4, "width": 0.05, "shift": -1.6},
                       {"id": "studs", "op": "rivets", "inset": 1, "spacing": 5, "highlight": 2.4, "shadow": -2.0,
                        "min_size": 5}]
    layers.append({"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.8,
                   "shift": 2.6})
    return {"ramp": metal, "tone": tone, "light": 0.9, "dither": 0.0,
            "rim": {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -2.0, "outline": "dark"},
            "brush": {"off": True}, "layers": layers}


# a cut soul gem set in the gold chanfron and peytral
GEM = ["..ab..", ".abBc.", "abBBcc", "bBBccc", ".cccc.", "..cc.."]
GEM_KEY = {"a": "soul:7", "b": "soul:5", "B": "soul:6", "c": "soul:3"}


def plate_styles():
    """The natural armour: blackstone plates in bevelled bricks with gilded veins, gold bolts and a dark outline;
    gold-capped blackstone spikes; dark iron chains."""
    plate = {"ramp": "blackstone", "tone": 4.6, "light": 0.9, "dither": 0.0,
             "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.6, "outline": "dark"},
             "brush": {"off": True},
             "layers": [{"id": "bricks", "op": "scales", "shape": "square", "along": "x", "size": [4.0, 2.5],
                         "gap": 0.5, "highlight": 1.4, "shadow": -1.6, "jitter": 0.5},
                        {"id": "gilt", "op": "cracks", "scale": 1.3, "width": 0.035, "threshold": 0.52, "ramp": "gold",
                         "tone": 6.4,
                         "bevel": {"shadow": 1, "highlight": 0, "shadow_shift": -1.4}},
                        {"id": "bolts", "op": "rivets", "inset": 1, "spacing": 5, "ramp": "gold", "tone": 7.0,
                         "highlight": 1.6, "shadow": -2.0, "min_size": 4},
                        {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1,
                         "density": 0.5, "shift": 2.0}]}
    spike_ = {"ramp": "blackstone", "tone": 5, "light": 0.2, "brush": {"off": True},
              "art_key": {"t": "gold:8", "m": "gold:5", "f": "blackstone:5"}}
    chain = {"ramp": "iron", "tone": 4, "light": 0.2, "brush": {"off": True},
             "art_key": {"C": "iron:7", "c": "iron:5", "d": "iron:2"}}
    return {"plate": plate, "plate_spike": spike_, "plate_chain": chain}


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
BLOCK_K = 1.25


def build_block():
    R = Rig(density=DENSITY, bone_style="bone")
    # the skull lies on its jaw, face tipped a little down; the root pivots at the poll joint
    R.bone("skull", None, at=(0, 9.0, -6.0), rot=(34, 0, 0))
    glow = build_skull(R, "skull", BLOCK_K, {"jaw": "jaw", "horn_l": "horn_l", "horn_r": "horn_r",
                                             "eye_fire": "eye_fire"}, open_jaw=2.0)
    # bone fragments scattered at its feet: a broken vertebra and a rib stub
    R.part("frag_vert", "skull", [3, 1.5, 2], "bone_dark", at=(5.5, 0.75, 4.0), wrot=(0, 30, 0))
    R.part("frag_rib", "skull", [1, 1, 5], "rib", at=(-6.0, 0.5, 2.0), wrot=(0, -40, 0))
    keep = ("bone", "bone_dark", "skull", "jaw", "brow", "socket", "void", "teeth", "fang", "horn", "horn_tip", "flame",
            "rib")
    spec = {
        "name": "Soul Bull Skull",
        "description": "The Soul Bull's skull, a Winterworks block: a heavy wither-grey bull skull with huge chipped "
                       "horns sweeping forward, a scowling brow over full round eye sockets, fangs and a cracked jaw, "
                       "lying on its jaw; the sockets burn with soul fire when it is lit (eye_fire, glow). Minecraft "
                       "pixel units, density 2.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 1000, "colors": 64},
        "light": LIGHT,
        "brush": BRUSH,
        "minecraft": {"fps": 20, "glow_parts": glow, "glow_ramps": ["soul"]},
        "render": {"background": "#7a6650", "hero": [-34, 22], "shadow": 0.5},
        "palette": {"ramps": {k: RAMPS[k] for k in ("bone", "horn", "void", "soul")}},
        "styles": {k: v for k, v in copy.deepcopy(STYLES).items() if k in keep},
        "parts": R.P,
        "animations": {
            # the eye flames lick and flutter; the jaw creaks against the ground
            "idle": {"length": 2.0, "loop": True, "tracks": [
                {"part": "eye_fire_l", "channel": "scale", "osc": {"amp": [0.1, 0.12, 0], "cycles": 4,
                                                                    "bias": [0, -0.12, 0]}},
                {"part": "eye_fire_r", "channel": "scale", "osc": {"amp": [0.1, 0.12, 0], "cycles": 4, "phase": 0.35,
                                                                    "bias": [0, -0.12, 0]}},
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
