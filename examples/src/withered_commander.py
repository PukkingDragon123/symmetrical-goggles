"""Builds examples/withered_commander.json: the Withered Commander (Winterworks 0.4, mods/winterworks/docs/FIXES_0_4.md
"Piglins, hoglins and the Withered Commander").

    python examples/src/withered_commander.py

A towering wither-skeleton officer, about 1.3 times a Wither Skeleton (some 49 px, three blocks, to the top of the helm):
charred dark-grey bones in a Wither Skeleton's charcoal greys, a heavy skull with deep round eye sockets where a faint
ember glows, a jaw full of teeth. It wears blackened netherite plate: a crested helm (a comb of gold-tipped spikes, a
crimson horsehair plume, cheek guards, a neck guard and a raised visor with a slit), huge layered pauldrons bristling
with gold-tipped spikes, a breastplate over the ribcage (the lowest ribs and the spine bare beneath it, embers
smouldering inside), a gorget, a war belt with a gold buckle, tassets, vambraces and gauntlets, knee cops, greaves and
sabatons with gold spurs. All of it is trimmed in gold and split by glowing ember cracks. A torn crimson banner cape
with a gold border and a gold winged-spear sigil hangs from its shoulders. In its right fist it holds a long netherite
spear upright: a leaf blade with a gold midline, gold lugs and socket, a crimson pennant, gold bands and a gold butt
spike.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). Faces +Z, ground at y = 0, "left" is +X.

Contract bones: body (root, pivot between the hips), head, helm (in head), cape, arm_l, arm_r, spear (in arm_r, held in
the right fist: arm_r > forearm_r > spear), leg_l, leg_r, pauldron_l, pauldron_r. Extra joints: chest (the torso, on
body), jaw, plume (the horsehair on the helm's crest), cape_1 (the cape's lower half), forearm_l/r, fist_l/r, shin_l/r,
foot_l/r, eye_l/r (the ember in each socket; glow), pennant (on the spear). Clips: idle, walk, ride (sitting on a Soul
Bull: the hips on the saddle), lunge (0.8 s), spin (1.2 s), war_cry (1.5 s), death (1.5 s, ends lying on the ground).
Glow: the eyes and every ember texel (ramp `ember`: the cracks in the armour, the embers in the ribcage).

Exported into the mod with a fixed hash seed:

    PYTHONHASHSEED=0 python -m lowpix mc export examples/withered_commander.json --mod mods/winterworks \\
        --modid winterworks --package dev.lowpix.winterworks.client.lowpix -o out/withered_commander
"""
import copy
import math
import os
import random
import sys
import types

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (DENSITY, LR, M, MR, ROOT, Rig, add, dump, euler, ground_lock, keys, limb, locks, osc,  # noqa: E402
                     pos, r, rest_on_ground, ring, rot_matrix, sc, shake, spikes, tatters, timeline, wave)
from hex_kit import side  # noqa: E402

# ======================================================================= palette
RAMPS = {
    # wither bone: dark charcoal greys (a Wither Skeleton's, as on the Soul Bull it rides), lighter worn edges
    "bone": ["#0b0b0c", "#111112", "#171718", "#1d1d1e", "#232424", "#2a2b2b", "#323333", "#3b3d3d", "#464949",
             "#525656", "#606464", "#727675"],
    # the inside of sockets, the nose and the ribcage
    "void": ["#020103", "#050307", "#09060c", "#0e0a12"],
    # blackened netherite: violet-brown blacks, a cool grey sheen on the edges
    "netherite": ["#09070a", "#100d10", "#171316", "#1f191d", "#282025", "#31292e", "#3c3238", "#493e45", "#574b53",
                  "#675b63", "#7a6e76", "#8f848b"],
    "gold": ["#2c1503", "#4a2405", "#6e3706", "#94500a", "#b86b0e", "#d68b12", "#eaa91c", "#f6c934", "#fde35c",
             "#fff399"],
    # embers (glow): soot red -> orange -> white-hot yellow
    "ember": ["#2e0805", "#4f1006", "#7d1b07", "#ad300a", "#d84e10", "#f5781d", "#ffa83c", "#ffd77a", "#fff4c8"],
    # the banner cape and the plume: deep crimson
    "crimson": ["#16040a", "#25060f", "#370a16", "#4c0e1d", "#631426", "#7c1b2f", "#962539", "#b03243", "#c9444f"],
    # the spear's grip wrap
    "leather": ["#120a08", "#1d110c", "#2a1912", "#382218", "#472c1f", "#583827", "#6a4530"],
}
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.75, "gradient": 0.45, "ao": 0.5, "ao_height": 6.0}
BRUSH = {"flow": "long", "length": 1.6, "width": 0.6, "rough": 0.55, "overshoot": 0.25,
         "textures": {"bone": "organic", "netherite": "metal", "gold": "metal", "crimson": "cloth",
                      "leather": "leather"}}

RIM = {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -1.2}
GRAIN = {"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.7}
SOOT = {"id": "soot", "op": "patches", "scale": 1.1, "threshold": 0.55, "shift": -1.2}
PITS = {"id": "pits", "op": "spots", "count": 3, "radius": [0.3, 0.5], "shift": -1.6}
SHEEN = {"id": "sheen", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.4,
         "shift": 2.0}
UNDER = {"id": "under", "op": "gradient", "axis": "y", "amount": 0.8}

# netherite plate: hammered, a polished cool edge, dark outline, sparse bright scuffs, glowing ember cracks
PLATE_RIM = {"light": 1, "dark": 1, "light_shift": 2.8, "dark_shift": -1.4, "outline": "dark"}
HAMMER = {"id": "hammer", "op": "noise", "scale": 0.9, "amount": 0.55}
EMBERS = {"id": "embers", "op": "cracks", "scale": 0.9, "width": 0.022, "threshold": 0.6, "ramp": "ember",
          "tone": 2.8, "faces": ["front", "sides", "top"],
          "bevel": {"shadow": 1, "highlight": 0, "shadow_shift": -1.8}}
SCUFF = {"id": "scuff", "op": "wear", "width": 1, "density": 0.12, "shift": 1.8}
PGLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.6,
          "shift": 2.4, "ramps": ["netherite"]}


def trim(lo=-1.01, hi=-0.7, axis="y", faces=("sides",), tone=5.4, id="trim"):
    """A gold trim band along one edge of a plate (a slab of the part between `lo` and `hi`, normalised)."""
    return {"id": id, "op": "band", "axis": axis, "from": lo, "to": hi, "ramp": "gold", "tone": tone,
            "faces": list(faces), "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.6, "highlight_shift": 1.6}}


def plate(tone=4.2, *extra, embers=True, gloss=True):
    layers = [HAMMER] + ([EMBERS] if embers else []) + list(extra) + [SCUFF] + ([PGLOSS] if gloss else [])
    return {"ramp": "netherite", "tone": tone, "rim": PLATE_RIM, "brush": {"off": True}, "dither": 0.0,
            "layers": layers}


GOLD_RIM = {"light": 1, "dark": 1, "light_shift": 2.2, "dark_shift": -1.8, "outline": "dark"}
GGLOSS = {"id": "ggloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0, "density": 0.7,
          "shift": 2.0, "ramps": ["gold"]}

STYLES = {
    # ---------------------------------------------------------------- bones
    "bone": {"ramp": "bone", "tone": 4.6, "rim": RIM, "layers": [GRAIN, SOOT, PITS, UNDER, SHEEN]},
    "bone_dark": {"ramp": "bone", "tone": 3.2, "rim": RIM, "layers": [GRAIN, SOOT, UNDER]},
    "rib": {"ramp": "bone", "tone": 4.8, "rim": dict(RIM, light_shift=2.8), "brush": {"flow": "long"},
            "layers": [GRAIN, {"id": "rib_edge", "op": "gradient", "axis": "y", "amount": -0.6}, SHEEN]},
    "skull": {"ramp": "bone", "tone": 5.2, "rim": dict(RIM, light_shift=2.8),
              "layers": [GRAIN, SOOT, PITS, {"id": "sutures", "op": "cracks", "scale": 1.6, "width": 0.04,
                                             "shift": -2.0}, SHEEN]},
    "brow": {"ramp": "bone", "tone": 5.8, "rim": dict(RIM, light_shift=3.0), "brush": {"flow": "x"},
             "layers": [GRAIN, SOOT, SHEEN]},
    # the depth walls round a socket: bone darkening into the hole
    "socket_wall": {"ramp": "bone", "tone": 2.6, "light": 0.3, "brush": {"off": True},
                    "rim": {"light": 0, "dark": 0}},
    "jaw": {"ramp": "bone", "tone": 4.8, "rim": dict(RIM, light_shift=2.6),
            "layers": [GRAIN, SOOT, PITS, SHEEN],
            "stamps": [{"face": "front", "at": "top", "art": ["tTtTtvtTtTvtTtTt"],
                        "key": {"t": "bone:9", "T": "bone:11", "v": "void:1"}}]},
    "void": {"ramp": "void", "tone": 1.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "teeth": {"ramp": "bone", "tone": 9.0, "light": 0.3, "brush": {"off": True},
              "art_key": {"t": "bone:9", "T": "bone:11", "r": "bone:5", "g": "gold:6"}},
    # ---------------------------------------------------------------- netherite plate
    "plate": plate(4.2),
    "plate_dark": plate(3.0, embers=False),
    "plate_plain": plate(4.4, embers=False),
    "plate_trim": plate(4.2, trim()),
    "plate_trim_top": plate(4.2, trim(0.7, 1.01, id="trim_top")),
    "spike": {"ramp": "netherite", "tone": 4.6, "rim": dict(PLATE_RIM, light_shift=3.0), "brush": {"off": True},
              "layers": [{"id": "rise", "op": "gradient", "axis": "y", "amount": 1.2}, PGLOSS]},
    "gold": {"ramp": "gold", "tone": 5.2, "rim": GOLD_RIM, "brush": {"off": True}, "layers": [GGLOSS]},
    "gold_dark": {"ramp": "gold", "tone": 3.8, "rim": GOLD_RIM, "brush": {"off": True}},
    "gold_tip": {"ramp": "gold", "tone": 6.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -2.0},
                 "brush": {"off": True}},
    # embers smouldering inside the ribcage (glow)
    "ember_core": {"ramp": "ember", "tone": 1.2, "light": 0.1, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                   "layers": [{"id": "hot", "op": "patches", "scale": 0.7, "threshold": 0.6, "shift": 2.2},
                              {"id": "heat", "op": "gradient", "axis": "y", "amount": -0.8}]},
    # ---------------------------------------------------------------- cloth
    "cape": {"ramp": "crimson", "tone": 4.6, "rim": dict(RIM, outline="dark"), "brush": {"flow": "y"},
             "layers": [{"id": "folds", "op": "stripes", "axis": "x", "period": 2.5, "width": 0.35, "shift": -1.0,
                         "wobble": 0.3},
                        {"id": "stain", "op": "patches", "scale": 1.0, "threshold": 0.6, "shift": -1.0},
                        {"id": "border_l", "op": "band", "axis": "x", "from": 0.78, "to": 0.9, "ramp": "gold",
                         "tone": 4.6, "faces": ["back"]},
                        {"id": "border_r", "op": "band", "axis": "x", "from": -0.9, "to": -0.78, "ramp": "gold",
                         "tone": 4.6, "faces": ["back"]},
                        {"id": "lining", "op": "fill", "ramp": "crimson", "tone": 2.2, "faces": ["front"]}]},
    "cape_card": {"ramp": "crimson", "tone": 4.4, "brush": {"off": True},
                  "art_key": {"t": "crimson:2", "m": "crimson:3"},
                  "layers": [{"id": "fray", "op": "gradient", "axis": "y", "amount": 1.4}]},
    "plume": {"ramp": "crimson", "tone": 5.0, "brush": {"off": True},
              "art_key": {"t": "crimson:8", "m": "crimson:6", "k": "crimson:2"},
              "layers": [{"id": "root", "op": "gradient", "axis": "y", "amount": 1.0}]},
    "grip": {"ramp": "leather", "tone": 3.6, "rim": RIM, "brush": {"off": True},
             "layers": [{"id": "wrap", "op": "stripes", "axis": [0, 1, 0.6], "period": 1.0, "width": 0.35,
                         "shift": -1.4}]},
}


# ======================================================================= card art
def comb_art(w, h, teeth=5):
    """The helm's crest seen from the side (a yz card: image left = the front): a gold rail along the bottom and a
    row of blade spikes swept back, the middle ones tallest. Characters: 't' gold tip, 'm' lit edge, 'f' netherite,
    'g' the gold rail."""
    rows = [["."] * w for _ in range(h)]
    for x in range(w):
        rows[h - 1][x] = "g"
    pitch = (w - 1) / teeth
    for j in range(teeth):
        x0 = int(round(0.5 + j * pitch))
        sw = max(3, int(round(pitch)))
        H = int(round((h - 1) * (0.62 + 0.38 * math.sin(math.pi * (j + 0.5) / teeth))))
        for k in range(H):
            frac = k / max(H - 1, 1)
            lo = x0 + (sw - 1) * frac            # the front edge slopes back, the back edge stays upright
            for cx in range(x0, x0 + sw):
                if lo - 0.35 <= cx < w:
                    ch = "t" if k >= H - 1 else ("m" if cx < lo + 0.65 else "f")
                    rows[h - 2 - k][cx] = ch
    return ["".join(r) for r in rows]


def horsetail(w, h, seed=0):
    """The crimson horsehair plume from the side (a yz card: image left = the front): it springs from the crest at
    the top left, arches back and falls in a thick tail down the back, its strands fanning and fraying at the ends.
    Characters: 't' lit strands, 'm' highlight, 'f' the hair (painted), 'k' the shaded underside."""
    rng = random.Random(seed)
    ctrl = [(1.0, 2.5), (0.35 * w, 0.8), (0.68 * w, 2.6), (0.86 * w, 0.32 * h), (0.9 * w, 0.66 * h),
            (0.86 * w, h - 0.5)]
    P = [np.array(c, float) for c in ctrl]
    P = [P[0]] + P + [P[-1]]
    pts = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(24):
            u = k / 24
            pts.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    pts.append(P[-2])
    pts = np.array(pts)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    T = seg / seg[-1]
    yy, xx = np.mgrid[0:h, 0:w]
    X, Y = xx + 0.5, yy + 0.5
    d = np.full((h, w), 1e9)
    t = np.zeros((h, w))
    side = np.zeros((h, w))
    for k in range(len(pts) - 1):
        a, b = pts[k], pts[k + 1]
        ab = b - a
        L2 = max(float(ab @ ab), 1e-9)
        u = np.clip(((X - a[0]) * ab[0] + (Y - a[1]) * ab[1]) / L2, 0, 1)
        qx, qy = a[0] + u * ab[0], a[1] + u * ab[1]
        dk = np.hypot(X - qx, Y - qy)
        better = dk < d
        d = np.where(better, dk, d)
        t = np.where(better, T[k] + u * (T[k + 1] - T[k]), t)
        side = np.where(better, ab[0] * (Y - qy) - ab[1] * (X - qx), side)   # > 0: below / outside the arch
    width = 3.2 + 2.6 * np.sin(np.clip(t, 0, 1) * math.pi * 0.8) + 1.4 * t
    inside = d <= width / 2
    # frayed ends: strands of random length past 80% of the tail
    cut = np.zeros((h, w), bool)
    for x in range(w):
        if rng.random() < 0.35:
            cut[:, x] = t[:, x] > rng.uniform(0.86, 0.97)
    inside &= ~cut
    rows = [["."] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if not inside[y, x]:
                continue
            ch = "f"
            if side[y, x] > 0.45 * width[y, x]:
                ch = "k"
            elif side[y, x] < -0.25 * width[y, x]:
                ch = "m"
            if (x * 3 + y * 2 + int(t[y, x] * 40)) % 7 == 0 and ch == "f":
                ch = "m"
            rows[y][x] = ch
    # the lit crest of the arch and the strand tips
    for x in range(w):
        col = [y for y in range(h) if rows[y][x] != "."]
        if col and t[col[0], x] < 0.6:
            rows[col[0]][x] = "t"
        if col and t[col[-1], x] > 0.85:
            rows[col[-1]][x] = "t"
    return ["".join(r) for r in rows]


def rowel():
    """A spur's star rowel (gold), 5 x 5 texels."""
    return ["s.s.s", ".sss.", "ss.ss", ".sss.", "s.s.s"]


def leaf_blade(w, h, inlay=True):
    """A leaf-shaped spear blade (image top = the point): widest a third of the way up, pointed at the tip, narrowing
    into the socket at the bottom. Characters: 'e' the honed edge (light), 'b' the blade, 'd' the shaded half, 'g' the
    gold midline inlay, 'G' its lit texels."""
    rows = [["."] * w for _ in range(h)]
    cx = (w - 1) / 2
    for y in range(h):
        u = 1 - (y + 0.5) / h                       # 0 at the bottom .. 1 at the point
        if u < 0.33:
            half = (w / 2) * (0.45 + 0.55 * math.sin(u / 0.33 * math.pi / 2))
        else:
            half = (w / 2) * ((1 - u) / 0.67) ** 0.85
        for x in range(w):
            d = x - cx
            if abs(d) <= half - 0.05:
                edge = abs(d) > half - 1.0
                rows[y][x] = "e" if edge else ("b" if d <= 0 else "d")
        if inlay and 0.06 < u < 0.82:
            for x in range(w):
                if abs(x - cx) < 0.6 and rows[y][x] != ".":
                    rows[y][x] = "G" if (y % 3 == 0) else "g"
    return ["".join(r) for r in rows]


def pennant(w, h):
    """A swallow-tailed crimson pennant hanging from its top edge (image top = the shaft side): gold hem along the
    top, a gold spearhead mark, the forked tail at the bottom. Characters: 'c' cloth, 'C' lit cloth, 'k' shade,
    'g' gold hem, 'G' gold mark."""
    rows = [["."] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            u = y / (h - 1)
            notch = u > 0.72 and abs(x - (w - 1) / 2) < (u - 0.72) / 0.28 * (w / 2) * 0.7
            if not notch:
                rows[y][x] = "C" if x < w * 0.35 else ("k" if x > w * 0.75 else "c")
    for x in range(w):
        rows[0][x] = "g"
    mid = w // 2
    for y, half in ((2, 0), (3, 1), (4, 1), (5, 0)):
        for x in range(mid - half - (1 if w % 2 == 0 else 0), mid + half + 1):
            if 0 <= x < w and y < h and rows[y][x] != ".":
                rows[y][x] = "G"
    return ["".join(r) for r in rows]


# the gold winged-spear sigil on the back of the cape (an original crest), and the breastplate medallion's gem
SIGIL = [
    ".......G.......",
    "......GGG......",
    ".....GGgGG.....",
    ".....GgggG.....",
    "......GgG......",
    "GG....GgG....GG",
    ".GGG..GgG..GGG.",
    "..GGGGGgGGGGG..",
    "...GGGGgGGGG...",
    ".......G.......",
    "......GGG......",
    ".......G.......",
]
SIGIL_KEY = {"G": "gold:6", "g": "gold:3"}


# ======================================================================= the spear (shared with netherite_spear.py)
def build_spear(R, parent, at, k=1.0, glow=None, wrot=(0, 0, 0)):
    """The netherite spear in the frame of a `spear` bone at `at` (the grip; world), standing up along its local +Y.
    k scales the lengths (the commander's is 1). Returns the local tip height."""
    part, bone, card = R.part, R.bone, R.card
    bone("spear", parent, at=at, wrot=wrot)
    L = lambda v: round(v * k * 2) / 2  # noqa: E731
    BUTT, SHAFT_TOP, SOCK, TIP = L(-17.0), L(19.0), L(22.5), L(31.5)
    # shaft: blackened netherite, a leather grip wrap round the hand, gold bands
    part("spear_shaft", "spear", [1.5, SHAFT_TOP - BUTT + 1, 1.5], "spear_shaft",
         rel=(0, 0, 0), offset=(0, (SHAFT_TOP + BUTT + 1) / 2 - 0.5, 0))
    part("spear_grip", "spear", [2, 6, 2], "grip", rel=(0, 0, 0))
    for j, y in enumerate((L(-11.0), L(-4.0), L(4.0), L(12.0))):
        part(f"spear_band_{j}", "spear", [2, 1, 2], "gold", rel=(0, y, 0))
    part("spear_ferrule", "spear", [2, 1.5, 2], "gold", rel=(0, BUTT + 1.25, 0))
    part("spear_butt", "spear", [1, 2, 1], "gold_tip", rel=(0, BUTT - 0.5, 0), rot=(0, 45, 0))
    # the socket: a gold collar, a netherite socket, gold lugs (wings) sweeping up
    part("spear_collar", "spear", [2.5, 1, 2.5], "gold", rel=(0, SHAFT_TOP + 0.5, 0))
    part("spear_socket", "spear", [2, 2.5, 2], "spear_socket", rel=(0, SHAFT_TOP + 2.0, 0), rot=(0, 45, 0))
    for s in (1, -1):
        lug = part(f"spear_lug_{LR(s)}", "spear", [1, 1.5, 1], "gold", rel=(0, SHAFT_TOP + 1.2, s * 1.0),
                   offset=(0, 0.6, 0), rot=(s * 62, 0, 0))
        part(f"spear_lug_{LR(s)}_tip", lug["id"], [0.5, 1, 0.5], "gold_tip", rel=(0, 1.6, 0), rot=(-s * 20, 0, 0))
    # the leaf blade: a diamond midrib, the leaf itself an alpha-cut card (broad along local Z), a gold inlay
    blade_len = TIP - SOCK
    part("spear_midrib", "spear", [1, blade_len - 1, 1], "spear_rib", rel=(0, SOCK + (blade_len - 1) / 2, 0),
         rot=(0, 45, 0))
    card("spear_blade", "spear", leaf_blade(int(round(4 * 2)), int(round(blade_len * 2))), "spear_blade",
         rel=(0, SOCK + blade_len / 2, 0), plane="yz")
    # a crimson pennant tied under the socket, fluttering back
    card("pennant", "spear", pennant(7, 12), "pennant", rel=(0, SHAFT_TOP - 0.5, -0.8), offset=(0, -3.0, -1.75),
         plane="yz", rot=(0, 0, 0))
    return TIP


SPEAR_STYLES = {
    "spear_shaft": {"ramp": "netherite", "tone": 4.4, "rim": PLATE_RIM, "brush": {"off": True},
                    "layers": [{"id": "grain", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.2,
                                "shift": -0.8}, PGLOSS]},
    "spear_socket": plate(4.6, trim(0.6, 1.01, id="collar_trim", faces=("sides",)), embers=False),
    "spear_rib": {"ramp": "netherite", "tone": 6.4, "rim": PLATE_RIM, "brush": {"off": True},
                  "layers": [{"id": "tipward", "op": "gradient", "axis": "y", "amount": 1.0}, PGLOSS]},
    "spear_blade": {"ramp": "netherite", "tone": 5.0, "light": 0.6, "brush": {"off": True},
                    "art_key": {"e": "netherite:10", "b": "netherite:6", "d": "netherite:4", "g": "gold:5",
                                "G": "gold:7"}},
    "pennant": {"ramp": "crimson", "tone": 4.6, "light": 0.5, "brush": {"off": True},
                "art_key": {"c": "crimson:5", "C": "crimson:7", "k": "crimson:3", "g": "gold:6", "G": "gold:7"}},
}


# ======================================================================= the commander
HIP_Y = 20.0


def build():
    R = Rig(density=DENSITY, bone_style="bone")
    part, bone, card, wpos = R.part, R.bone, R.card, R.wpos
    glow = []

    # ---------------------------------------------------------------- hips: pelvis, war belt, buckle
    bone("body", None, at=(0, HIP_Y, 0))
    part("pelvis", "body", [5, 2.5, 3.5], "bone_dark", centre=(0, 19.75, -0.5))
    for s in (1, -1):
        n = LR(s)
        part(f"ilium_{n}", "pelvis", [2, 3.5, 3], "bone", centre=(s * 2.7, 20.6, -0.8), wrot=(0, 0, -s * 16))
    part("belt", "body", [10, 2, 6.5], "belt", centre=(0, 21.6, -0.4))
    part("buckle", "belt", [3, 2.5, 1], "buckle", centre=(0, 21.6, 3.2))
    # the lumbar spine, bare between the belt and the ribs
    part("spine_lo", "body", [1.5, 4.5, 1.5], "bone", centre=(0, 24.0, -1.6))
    for j, y in enumerate((23.2, 24.8)):
        part(f"vert_{j}", "spine_lo", [3, 1, 2], "bone_dark", centre=(0, y, -1.7))

    # ---------------------------------------------------------------- the torso
    bone("chest", "body", at=(0, 25.0, -1.0))
    part("spine_up", "chest", [1.5, 4, 1.5], "bone", centre=(0, 27.0, -2.6))
    # the lowest ribs, bare under the breastplate: two pairs of curved hoops from the spine to the front
    for j, y in enumerate((27.2, 25.6)):
        for s in (1, -1):
            n = LR(s)
            w = 4.2 - j * 0.4
            e = limb(R, f"rib_{j}{n}", "chest", (s * 0.8, y, -2.4), (s * w, y - 0.6, -0.2), 1, "rib", depth=1)
            limb(R, f"rib_{j}{n}_lo", f"rib_{j}{n}", e, (s * (w - 1.6), y - 1.4, 2.2), 1, "rib", depth=1)
    # embers smouldering in the hollow of the ribs
    part("ember_heart", "chest", [4, 2.5, 3], "ember_core", centre=(0, 26.6, -0.6))
    # the ribcage (bare at the flanks), the breastplate strapped over its front, a lower plate (plackart), the
    # backplate, a gold medallion
    part("ribcage", "chest", [8, 8.5, 5.5], "ribcage", centre=(0, 32.6, -0.8), wrot=(-4, 0, 0))
    part("breastplate", "chest", [10, 8, 2.5], "breastplate", centre=(0, 32.8, 2.1), wrot=(-4, 0, 0))
    part("plackart", "breastplate", [9, 2.5, 2.5], "plate_trim", centre=(0, 29.2, 2.2), wrot=(8, 0, 0))
    part("medallion", "breastplate", [2.5, 2.5, 0.5], "medallion", centre=(0, 33.4, 3.55), wrot=(-4, 0, 45))
    part("backplate", "chest", [9, 7, 1], "plate", centre=(0, 33.0, -3.6), wrot=(-4, 0, 0))
    for s in (1, -1):
        part(f"strap_{LR(s)}", "chest", [1.5, 1, 7], "strap", centre=(s * 3.2, 36.6, -0.6))
    part("gorget", "chest", [7, 2, 6], "plate_trim_top", centre=(0, 37.4, -0.7))
    # the neck, bare vertebrae
    part("neck", "chest", [2, 2.5, 2], "bone", centre=(0, 38.6, -1.2))
    part("neck_knob", "neck", [3, 1, 2], "bone_dark", centre=(0, 38.8, -1.6))

    # ---------------------------------------------------------------- the head: a heavy skull, round deep sockets
    HEAD = (0, 39.0, -0.6)
    bone("head", "chest", at=HEAD)
    # head frame (rel): skull from y 0.5 to 9.5, the face at z 4.5
    part("skull", "head", [10.5, 8, 7], "skull", rel=(0, 5.5, -1.0), hide=["front"])
    part("forehead", "head", [10.5, 2, 2], "skull", rel=(0, 8.5, 3.5))
    part("brow", "head", [10.5, 1.5, 2.5], "brow", rel=(0, 6.75, 3.5))
    part("nasal_bridge", "head", [1.5, 3.5, 2], "skull", rel=(0, 4.25, 3.5))
    for s in (1, -1):
        n = LR(s)
        part(f"temple_{n}", "head", [1, 3.5, 2], "skull", rel=(s * 4.75, 4.25, 3.5))
        # the socket floor, 1.5 px deep: near-black, the corners stamped bone so the hole reads round, a faint
        # ember glow pooled in its bottom and a pin of fire at the centre (eye_l/r, glow)
        part(f"socket_{n}", "head", [3.5, 3.5, 0.5], "socket", rel=(s * 2.5, 4.25, 2.75))
        for j, (cx, cy) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
            part(f"socket_{n}_c{j}", "head", [1.5, 1.5, 1.5], "socket_rim",
                 rel=(s * 2.5 + cx * 1.75, 4.25 + cy * 1.75, 3.75), rot=(0, 0, 45))
        bone(f"eye_{n}", "head", rel=(s * 2.5, 4.0, 3.05))
        part(f"eye_{n}_ember", f"eye_{n}", [1, 1, 0.5], "eye_ember", rel=(0, 0, 0))
        glow.append(f"eye_{n}_ember")
        part(f"cheekbone_{n}", "head", [1.5, 2, 3.5], "brow", rel=(s * 5.1, 1.5, 2.4), rot=(0, s * 8, -s * 6))
    # the upper jaw: the nasal hole, a row of teeth along its lower edge; fangs hang inside (seen when the jaw drops)
    part("maxilla", "head", [8.5, 2, 2.5], "skull", rel=(0, 1.5, 3.25),
         paint={"stamps": [{"face": "front", "at": "top", "art": ["vVVv", "vVVv", ".vv."],
                            "key": {"v": "void:3", "V": "void:0"}},
                           {"face": "front", "at": "bottom", "art": ["tTtTvtTtTtTvtTtTt"],
                            "key": {"t": "bone:9", "T": "bone:11", "v": "void:1"}}]})
    part("palate", "head", [7, 1, 5], "void", rel=(0, 1.0, -0.5))
    card("fangs_up", "maxilla", ["tTtTtTtTtTtTtT", "t.T.tt.Tt.tT.t"], "teeth", rel=(0, -1.0, 0.75),
         offset=(0, -0.5, 0), plane="xy")
    # the jaw, hinged under the back of the skull, teeth along its front edge
    part("jaw", "head", [8, 1.5, 6], "jaw", rel=(0, 0.6, -1.5), offset=(0, -0.75, 3.0))
    card("fangs_lo", "jaw", ["t.T.tt.Tt.tT", "tTtTtTtTtTtT"], "teeth", rel=(0, 0, 5.4), offset=(0, 0.5, 0),
         plane="xy")
    for s in (1, -1):
        part(f"jaw_ramus_{LR(s)}", "jaw", [1, 3, 2], "bone_dark", rel=(s * 3.6, 0.8, 0.6))

    # ---------------------------------------------------------------- the helm
    bone("helm", "head", rel=(0, 8.5, -0.5))
    part("helm_dome", "helm", [11.5, 2.5, 11], "helm", rel=(0, 0.75, 0))
    part("helm_dome_1", "helm_dome", [10, 1, 9.5], "helm_top", rel=(0, 1.75, -0.25))
    part("helm_dome_2", "helm_dome_1", [7.5, 0.5, 7], "helm_top", rel=(0, 0.75, 0))
    part("helm_rim", "helm_dome", [12, 0.5, 11.5], "gold", rel=(0, -1.25, 0))
    part("helm_neckguard", "helm", [11.5, 4.5, 1], "plate_plain", rel=(0, -1.4, -5.9), offset=(0, -0.6, 0),
         rot=(16, 0, 0))
    part("helm_neckguard_rim", "helm_neckguard", [12, 0.5, 1.5], "gold_dark", rel=(0, -2.85, 0))
    for s in (1, -1):
        n = LR(s)
        g = part(f"helm_cheek_{n}", "helm", [1, 5.5, 6], "helm_cheek", rel=(s * 5.9, -2.8, 0.6),
                 rot=(0, -s * 6, s * 4))
        part(f"helm_cheek_{n}_stud", g["id"], [0.5, 1, 1], "gold", rel=(s * 0.6, 1.4, -1.6))
    # the raised visor: a plate with a slit across it, swung up off the face onto the brow of the helm
    part("helm_visor", "helm", [11, 3, 1], "visor", rel=(0, 0.2, 5.9), offset=(0, 1.0, 0), rot=(-34, 0, 0))
    for s in (1, -1):
        part(f"helm_visor_pin_{LR(s)}", "helm", [1, 1, 1], "gold", rel=(s * 5.7, 0.4, 4.6))
    # the crest: a netherite comb crowned with gold-tipped spikes, a crimson horsehair plume streaming back
    part("helm_comb", "helm_dome_2", [1, 1, 8.5], "plate_plain", rel=(0, 0.75, 0))
    card("helm_spikes", "helm_comb", comb_art(17, 6, teeth=5), "crest_spikes", rel=(0, 0.5, 0),
         offset=(0, 1.5, 0), plane="yz")
    # the plume springs from the back of the comb: a side card (the arch and the fall) and a back card (the fall)
    bone("plume", "helm_comb", rel=(0, 0.8, -3.6))
    card("plume_hair", "plume", horsetail(18, 24, seed=3), "plume", rel=(0, 0, 0), offset=(-0, -5.0, -3.8),
         plane="yz")
    card("plume_fall", "plume", locks(6, 14, 35, up=False, fill=1.0, min_len=0.6, tip="t", mid="m", body="f"),
         "plume", rel=(0, -3.0, -7.2), offset=(0, -3.5, 0), plane="xy", rot=(12, 0, 0))

    # ---------------------------------------------------------------- pauldrons: layered plates, gold-tipped spikes
    for s in (1, -1):
        n = LR(s)
        pid = f"pauldron_{n}"
        bone(pid, "chest", at=(s * 6.4, 37.0, -0.8))
        top = part(f"{pid}_plate", pid, [6.5, 3, 7.5], "pauldron", rel=(s * 0.9, -0.4, 0), rot=(0, 0, -s * 22))
        part(f"{pid}_lame_0", pid, [6, 1.5, 7], "pauldron_lame", rel=(s * 2.8, -2.6, 0), rot=(0, 0, -s * 38))
        part(f"{pid}_lame_1", pid, [5.5, 1.5, 6.5], "pauldron_lame_trim", rel=(s * 3.9, -4.0, 0), rot=(0, 0, -s * 52))
        part(f"{pid}_rivet", top["id"], [1, 1, 1], "gold", rel=(s * 1.6, 1.4, 2.6))
        # three spikes along the top of the shoulder, sweeping up and out; the middle one tallest
        for j, (z, h, lean) in enumerate(((-2.4, 3.0, 26), (0.2, 4.5, 30), (2.6, 2.5, 22))):
            sid = f"{pid}_spike_{j}"
            sp = part(sid, top["id"], [1.5, h, 1.5], "spike", rel=(s * 0.8, 1.2, z), offset=(0, h / 2, 0),
                      rot=(-z * 4, 0, -s * lean + s * 22))
            part(f"{sid}_tip", sp["id"], [1, 1.5, 1], "spike", rel=(0, h + 0.6, 0), rot=(0, 0, -s * 8))
            part(f"{sid}_cap", f"{sid}_tip", [0.5, 1, 0.5], "gold_tip", rel=(0, 1.1, 0), rot=(0, 0, -s * 6))

    # ---------------------------------------------------------------- arms
    for s in (1, -1):
        n = LR(s)
        aid = f"arm_{n}"
        part(aid, "chest", [3, 3, 3], "bone_dark", at=(s * 6.6, 35.2, -0.8), rot=(0, 0, s * 6))
        part(f"humerus_{n}", aid, [2, 8, 2], "bone", rel=(0, -4.6, 0))
        part(f"elbow_{n}", aid, [2.5, 2, 2.5], "bone_dark", rel=(0, -8.8, 0))
        fa_rot = (-72, 0, -s * 6) if s < 0 else (-14, 0, -s * 4)
        fa = part(f"forearm_{n}", aid, [3, 6, 3], "vambrace", rel=(0, -9.0, 0), offset=(0, -3.6, 0), rot=fa_rot)
        part(f"couter_{n}", fa["id"], [2.5, 2.5, 1], "plate_dark", rel=(0, -0.4, -1.6), rot=(-20, 0, 0))
        part(f"cuff_{n}", fa["id"], [3.5, 1, 3.5], "gold", rel=(0, -6.6, 0))
        fist = part(f"fist_{n}", fa["id"], [3, 3.5, 3], "gauntlet", rel=(0, -7.4, 0), offset=(0, -1.6, 0.2))
        part(f"knuckles_{n}", fist["id"], [3.5, 1, 1], "gold_dark", rel=(0, -2.4, 1.4))

    # ---------------------------------------------------------------- the spear in the right fist, upright
    grip = R.wpos("fist_r", (0, -1.6, 0.2))
    tip = build_spear(R, "fist_r", at=grip)

    # ---------------------------------------------------------------- legs
    feet = []
    for s in (1, -1):
        n = LR(s)
        lid = f"leg_{n}"
        part(lid, "body", [2.5, 2.5, 2.5], "bone_dark", at=(s * 2.8, HIP_Y - 0.4, -0.2), rot=(0, 0, s * 3))
        part(f"femur_{n}", lid, [2, 8, 2], "bone", rel=(0, -4.6, 0))
        # tassets: two lames hanging over the front and outside of the thigh
        t0 = part(f"tasset_{n}", lid, [4, 3.5, 1], "tasset", rel=(s * 0.8, 0.8, 1.7), offset=(0, -1.75, 0),
                  rot=(-10, -s * 20, s * 8))
        part(f"tasset_{n}_1", t0["id"], [3.5, 2.5, 1], "tasset_low", rel=(0, -3.2, 0.3), offset=(0, -1.1, 0),
             rot=(-4, 0, 0))
        sid = f"shin_{n}"
        part(sid, lid, [3.5, 3, 3.5], "poleyn", rel=(0, -9.0, 0.3), rot=(0, 0, -s * 3))
        part(f"poleyn_spike_{n}", sid, [1, 1.5, 1], "gold_tip", rel=(0, 0.4, 2.0), rot=(60, 0, 0))
        part(f"greave_{n}", sid, [3.5, 6.5, 3.5], "greave", rel=(0, -4.6, 0))
        part(f"greave_{n}_rim", sid, [4, 1, 4], "gold", rel=(0, -7.6, 0))
        fid = f"foot_{n}"
        part(fid, sid, [4, 2.5, 6], "sabaton", at=R.wpos(sid, (0, -8.0, 0)), centre=R.wpos(sid, (0, -8.6, 1.2)),
             wrot=(0, s * 4, 0))
        part(f"toe_{n}", fid, [3, 1.5, 1.5], "sabaton", rel=(0, -0.8, 3.6))
        # a gold spur at the heel, its star rowel
        part(f"spur_{n}", fid, [0.5, 0.5, 2], "gold", rel=(0, -0.2, -2.6))
        card(f"rowel_{n}", f"spur_{n}", rowel(), "rowel", rel=(0, 0, -1.2), plane="yz")
        feet += [fid, f"toe_{n}", f"spur_{n}", f"rowel_{n}"]

    # ---------------------------------------------------------------- the torn banner cape
    bone("cape", "chest", at=(0, 36.6, -4.2), rot=(6, 0, 0))
    part("cape_top", "cape", [11, 13, 0.5], "cape_upper", rel=(0, 0, 0), offset=(0, -6.5, 0))
    part("cape_clasp_l", "cape", [1.5, 1.5, 0.5], "gold", rel=(4.6, -0.6, 0.4))
    part("cape_clasp_r", "cape", [1.5, 1.5, 0.5], "gold", rel=(-4.6, -0.6, 0.4))
    bone("cape_1", "cape", rel=(0, -13.0, 0), rot=(4, 0, 0))
    part("cape_low", "cape_1", [11.5, 8, 0.5], "cape_lower", rel=(0, 0, 0), offset=(0, -4.0, 0))
    card("cape_hem", "cape_1", tatters(23, 9, 17, min_len=0.25, holes=0.04), "cape_card", rel=(0, -8.0, 0),
         offset=(0, -2.25, 0), plane="xy")

    # ---------------------------------------------------------------- styles
    styles = copy.deepcopy(STYLES)
    styles.update(copy.deepcopy(SPEAR_STYLES))
    styles.update({
        "belt": plate(3.6, embers=False),
        "buckle": {"ramp": "gold", "tone": 5.6, "rim": GOLD_RIM, "brush": {"off": True}, "layers": [GGLOSS],
                   "stamps": [{"face": "front", "at": "center", "art": ["vbbv", "bvvb", "bbbb", ".vv.", "b.b."][:5],
                               "key": {"v": "netherite:1", "b": "gold:3"}}]},
        "breastplate": plate(4.4, trim(0.78, 1.01, id="neck_trim", faces=("front", "sides")),
                             {"id": "keel", "op": "band", "axis": "x", "from": -0.07, "to": 0.07, "ramp": "gold",
                              "tone": 5.0, "faces": ["front"], "bevel": {"shadow": 1, "highlight": 1}},
                             {"id": "plates", "op": "scales", "shape": "square", "along": "x", "size": [5.0, 2.5],
                              "gap": 0.5, "highlight": 1.0, "shadow": -1.2, "jitter": 0.3,
                              "faces": ["sides", "back"]}),
        "medallion": {"ramp": "gold", "tone": 5.8, "rim": GOLD_RIM, "brush": {"off": True},
                      "stamps": [{"face": "front", "at": "center", "art": [".ee.", "eEEe", "eEEe", ".ee."],
                                  "key": {"e": "ember:4", "E": "ember:6"}}]},
        "helm": plate(4.4),
        "helm_top": plate(4.8, embers=False),
        "helm_cheek": plate(4.0, embers=False),
        "visor": dict(plate(4.8, trim(0.72, 1.01, faces=("front", "sides"), id="visor_trim", tone=4.6),
                            embers=False),
                      stamps=[{"face": "front", "at": [2, 3], "art": ["v" * 18, "l" * 18],
                               "key": {"v": "void:0", "l": "netherite:8"}}]),
        "tasset": plate(4.0, {"id": "lame", "op": "stripes", "axis": "y", "period": 1.75, "width": 0.18,
                              "shift": -1.6, "faces": ["front", "flanks"]}, embers=False),
        "tasset_low": plate(3.8, trim(-1.01, -0.6, faces=("sides",), id="tasset_trim", tone=4.4), embers=False),
        "strap": {"ramp": "leather", "tone": 3.0, "rim": RIM, "brush": {"off": True}},
        "socket_rim": {"ramp": "bone", "tone": 5.4, "rim": dict(RIM, light_shift=2.4), "brush": {"off": True},
                       "layers": [GRAIN]},
        "ribcage": {"ramp": "bone", "tone": 4.8, "rim": RIM, "brush": {"flow": "horizontal"},
                    "layers": [GRAIN,
                               {"id": "gaps", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.36,
                                "ramp": "void", "tone": 2.0, "faces": ["sides", "back"],
                                "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.4,
                                          "highlight_shift": 1.6}},
                               {"id": "spine", "op": "band", "axis": "x", "from": -0.12, "to": 0.12, "ramp": "bone",
                                "tone": 5.4, "faces": ["back"]}, SHEEN]},
        "crest_spikes": {"ramp": "netherite", "tone": 5.0, "brush": {"off": True},
                         "art_key": {"t": "gold:8", "m": "gold:5", "f": "netherite:6", "g": "gold:4"}},
        "pauldron": plate(4.6, trim(-1.01, -0.62, faces=("sides",), id="pauldron_trim"),
                          {"id": "ribs", "op": "stripes", "axis": "z", "period": 2.5, "width": 0.15, "shift": -1.4,
                           "faces": ["top"]}),
        "pauldron_lame": plate(4.0, embers=False),
        "pauldron_lame_trim": plate(3.8, trim(-1.01, -0.3, faces=("sides",), id="lame_trim", tone=4.8),
                                    embers=False),
        "vambrace": plate(4.2, {"id": "ridge", "op": "band", "axis": "x", "from": -0.15, "to": 0.15, "shift": 1.4,
                                "faces": ["front", "back"]}),
        "gauntlet": plate(3.8, {"id": "fingers", "op": "stripes", "axis": "x", "period": 0.75, "width": 0.3,
                                "shift": -1.6, "faces": ["front", "bottom"]}, embers=False),
        "poleyn": plate(4.8, embers=False),
        "greave": plate(4.2, {"id": "ridge", "op": "band", "axis": "x", "from": -0.12, "to": 0.12, "shift": 1.6,
                              "faces": ["front"]}),
        "sabaton": plate(3.8, {"id": "lames", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.2,
                               "shift": -1.6, "faces": ["top", "flanks"]}, embers=False),
        "socket": {"ramp": "void", "tone": 0.6, "light": 0.1, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                   # deep and dark; a faint ember glow in a ring round the eye and pooled low in the socket
                   "stamps": [{"face": "front", "at": "top-left",
                               "art": [".......", "..ccc..", ".c...c.", ".c...c.", ".a...a.", "..aaa..", "......."],
                               "key": {"a": "ember:1", "c": "ember:0"}}]},
        "eye_ember": {"ramp": "ember", "tone": 2.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                      "stamps": [{"face": "front", "at": "top-left", "art": ["ab", "bc"],
                                  "key": {"a": "ember:5", "b": "ember:3", "c": "ember:2"}}]},
        "rowel": {"ramp": "gold", "tone": 5, "light": 0.3, "brush": {"off": True}, "art_key": {"s": "gold:6"}},
        "cape_upper": copy.deepcopy(STYLES["cape"]),
        "cape_lower": copy.deepcopy(STYLES["cape"]),
    })
    styles["cape_upper"]["layers"].append({"id": "border_top", "op": "band", "axis": "y", "from": 0.86, "to": 0.97,
                                           "ramp": "gold", "tone": 4.6, "faces": ["back"]})
    styles["cape_upper"]["stamps"] = [{"face": "back", "at": [4, 7], "art": SIGIL, "key": SIGIL_KEY},
                                      # a rent torn through the cloth
                                      {"face": "back", "at": [17, 18], "art": ["_", "__", ".__", "..__", "...__"],
                                       "key": {}}]
    styles["cape_lower"]["stamps"] = [{"face": "back", "at": [5, 4], "art": ["_.", "__", ".__", ".__", "..__", "..._"],
                                       "key": {}},
                                      {"face": "back", "at": [15, 9], "art": [".__", "___", "__."], "key": {}}]

    spec = {
        "name": "Withered Commander",
        "description": "The Winterworks Withered Commander: a towering wither-skeleton officer, charcoal-grey bones "
                       "with deep round ember-lit eye sockets, in blackened netherite plate trimmed in gold and split "
                       "by glowing ember cracks (a crested, plumed helm with a raised slit visor, huge spiked "
                       "pauldrons, a breastplate over the ribs, greaves and spurred sabatons) under a torn crimson "
                       "banner cape, holding a long netherite spear with a leaf blade. Minecraft pixel units, "
                       "density 2: exports 1:1 to a vanilla entity model.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": DENSITY,
        "budget": {"tris": 2600, "colors": 128},
        "light": LIGHT,
        "brush": BRUSH,
        "minecraft": {"fps": 20, "glow_parts": glow, "glow_ramps": ["ember"]},
        "anim_ground_tolerance": 0.4,
        "render": {"background": "#6b4a3a", "hero": [34, 14], "shadow": 0.5},
        "palette": {"ramps": RAMPS},
        "styles": styles,
        "parts": R.P,
        "animations": {},
    }
    return spec, R, feet, tip


# ======================================================================= animation
def arm(s, a=0, out=0, twist=0, elbow=0, wrist=0):
    """Shoulder pitch (- raises forward), abduction (+ out), twist; elbow (- bends the forearm forward/up), wrist."""
    n = LR(s)
    return add({f"arm_{n}": {"r": [a, twist * s, out * s]}}, {f"forearm_{n}": {"r": [elbow, 0, 0]}},
               {f"fist_{n}": {"r": [wrist, 0, 0]}})


def leg(s, a=0, knee=0, foot=0, splay=0, twist=0):
    """Hip pitch (- forward), knee (+ bends the shin back), foot pitch, splay (+ out), twist."""
    n = LR(s)
    return add({f"leg_{n}": {"r": [a, twist * s, splay * s]}}, {f"shin_{n}": {"r": [knee, 0, 0]}},
               {f"foot_{n}": {"r": [foot, 0, 0]}})


def paul(s, lift=0, x=0):
    """A pauldron lifting (+) with its arm."""
    return {f"pauldron_{LR(s)}": {"r": [x, 0, lift * s]}}


def cloth(L, amp=1.0, cycles=1, phase=0.0, bias=0.0):
    """Looping secondary motion: the cape billowing, the plume and the pennant streaming."""
    return [wave(["cape", "cape_1"], "x", 3 * amp, cycles, lag=0.15, growth=1.5, phase=phase, bias=bias),
            osc("cape", "z", 1.5 * amp, cycles, phase + 0.3),
            osc("cape_hem", "x", 6 * amp, cycles * 2, phase + 0.4),
            osc("plume", "x", 6 * amp, cycles, phase + 0.2), osc("plume", "z", 4 * amp, cycles, phase + 0.45),
            osc("pennant", "y", 14 * amp, cycles * 2, phase + 0.1)]


def embers(L, k=1.0, fast=1.0):
    """The embers in the sockets breathe and flicker."""
    c = lambda n: max(1, int(round(n * L * fast)))  # noqa: E731
    return [osc("eye_l", None, [0.25 * k, 0.25 * k, 0], c(2), 0.1, ch="scale"),
            osc("eye_r", None, [0.25 * k, 0.25 * k, 0], c(2), 0.55, ch="scale")]


class Poser:
    """Evaluates the rig's world matrices for a pose dict (as timeline() takes), so a joint can be aimed in world or
    body space whatever the arm above it is doing (the spear is held in the fist, so its local turn depends on the
    whole arm)."""

    def __init__(self, spec):
        sys.path.insert(0, ROOT)
        from lowpix.anim import Animator
        from lowpix.geometry import expand_instances
        self.Animator = Animator
        self.insts = expand_instances(spec["parts"], float(spec["density"]))
        self.parent = {i.id: i.parent for i in self.insts}
        self.rest = {p["id"]: p.get("rotation", [0, 0, 0]) for p in spec["parts"]}

    def world(self, pose):
        clip = timeline(1.0, [(0.0, pose, None), (1.0, pose, None)], lock=False)
        m = types.SimpleNamespace(instances=self.insts, spec={"animations": {"_": clip}})
        return self.Animator(m).world_matrices("_", 0.0)

    def aim(self, pose, pid, d, side=(1, 0, 0), frame="world"):
        """The rotation offset for `pid` so that, in `pose`, its local +Y points along `d` and its local +X leans toward
        `side` (world axes; frame="body": the body's own turn is left out, so the aim turns with the body)."""
        p = {k: v for k, v in pose.items() if k != pid and not (frame == "body" and k == "body")}
        W = self.world(p)
        Wp = W[self.parent[pid]][:3, :3]
        Wp = Wp / np.linalg.norm(Wp, axis=0)
        y = np.array(d, float)
        y /= np.linalg.norm(y)
        x = np.array(side, float)
        x = x - (x @ y) * y
        x /= np.linalg.norm(x)
        T = np.stack([x, y, np.cross(x, y)], axis=1)
        A = rot_matrix(self.rest[pid]).T @ Wp.T @ T
        return {pid: {"r": euler(A)}}


def animate(spec):
    A = {}
    REST = {}
    P = Poser(spec)

    def spear(pose, d, side=(1, 0, 0), frame="world"):
        """`pose` with the spear aimed along d (its blade's flat facing `side`)."""
        return add(pose, P.aim(pose, "spear", d, side, frame))

    # idle: slow heavy breaths, the head turning to survey, the jaw creaking, the spear swaying, the cape stirring
    L = 4.0
    A["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
        osc("chest", "x", -1.2, 1, 0.0), osc("chest", None, [0.02, 0.03, 0.02], 1, 0.0, ch="scale"),
        osc("head", "y", 9, 1, 0.25), osc("head", "x", 2.5, 2, 0.1),
        keys("jaw", "x", [[0, 0], [2.4, 0], [2.55, 7], [2.75, 2], [2.95, 6], [3.2, 0], [L, 0]]),
        osc("arm_r", "x", 1.5, 1, 0.1), osc("spear", "z", 1.5, 1, 0.35),
        osc("arm_l", "x", -2.5, 1, 0.15), osc("forearm_l", "x", -3, 1, 0.3),
        osc("pauldron_l", "z", 1.2, 1, 0.05), osc("pauldron_r", "z", -1.2, 1, 0.05),
    ] + cloth(L, 1.0, 1) + embers(L))

    # walk: a heavy, measured march; the spear carried upright, the left fist swinging, the cape trailing
    L = 1.4
    sw = 22

    def stride(s, ph):
        n = LR(s)
        tr = [osc(f"leg_{n}", "x", sw, 1, ph)]
        tr.append({"part": f"shin_{n}", "axis": "x", "keys": sorted(
            [[((u + ph) % 1.0) * L, v] for u, v in ((0.0, 4), (0.25, 0), (0.5, 8), (0.72, 46), (0.9, 18))]),
            "ease": "smooth"})
        tr.append({"part": f"foot_{n}", "axis": "x", "keys": sorted(
            [[((u + ph) % 1.0) * L, v] for u, v in ((0.0, -14), (0.12, 0), (0.5, 12), (0.72, -6), (0.9, -16))]),
            "ease": "smooth"})
        return tr

    A["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True,
                         extra=stride(1, 0.25) + stride(-1, 0.75) + [
                             osc("body", "y", 4, 1, 0.0), osc("body", "z", 1.5, 1, 0.25),
                             osc("chest", "y", -5, 1, 0.0), osc("chest", "x", 2, 2, 0.1, bias=2),
                             osc("head", "y", 3, 1, 0.5), osc("head", "x", -1.5, 2, 0.2),
                             osc("arm_l", "x", -20, 1, 0.75), osc("forearm_l", "x", -10, 1, 0.85, bias=-8),
                             osc("arm_r", "x", 4, 1, 0.25), osc("spear", "x", -3, 1, 0.3),
                             osc("pauldron_l", "z", 2, 2, 0.1), osc("pauldron_r", "z", -2, 2, 0.1),
                             osc("pauldron_l", "x", 3, 1, 0.75), osc("pauldron_r", "x", -3, 1, 0.75),
                         ] + cloth(L, 1.8, 1, 0.0, bias=6) + embers(L),
                         lift=[[0, 0], [L * 0.25, 0.4], [L * 0.5, 0], [L * 0.75, 0.4], [L, 0]])

    # ride: sitting a Soul Bull, the hips on the saddle: thighs forward and out round its ribs, the shins down its
    # flanks, the left fist low on the reins, the spear upright, the cape spread over the bull's back
    L = 2.0
    SEAT = add(leg(1, -56, 60, -12, 32, 8), leg(-1, -56, 60, -12, 32, 8), side("shin", 1, 0, 0, -20),
               side("shin", -1, 0, 0, -20), r("body", -4), r("chest", 3),
               arm(1, -34, 8, 0, -38, 0), arm(-1, -6, 0, 0, -4, 0),
               r("cape", 60), r("cape_1", -36), r("tasset_l", -14, 0, 10), r("tasset_r", -14, 0, -10),
               paul(1, 3), paul(-1, 3))
    SEAT = spear(SEAT, (0, 1, 0.12))
    A["ride"] = timeline(L, [(0.0, SEAT, None), (L, SEAT, None)], loop=True, lock=False, extra=[
        osc("body", None, [0, 0.35, 0], 2, 0.0, ch="position"), osc("body", "x", -1.5, 2, 0.1),
        osc("chest", "x", 1.5, 2, 0.2), osc("head", "x", -2, 2, 0.3), osc("head", "y", 6, 1, 0.2),
        osc("arm_l", "x", -4, 2, 0.25), osc("forearm_l", "x", -3, 2, 0.35),
        osc("spear", "x", -2, 2, 0.35), osc("leg_l", "x", 2, 2, 0.15), osc("leg_r", "x", 2, 2, 0.15),
    ] + cloth(L, 1.2, 1, 0.0) + embers(L))

    # lunge (0.8 s): turns its right shoulder back and draws the spear level beside its head, the left hand out
    # (anticipation), then drives forward in a long lunge, the arm and spear fully extended at the target (the thrust
    # lands at 0.38 s), holds the strike, and hauls back to guard
    WIND = add(pos("body", 0, 0, -2.0), r("body", -3, -22), r("chest", -6, -22),
               arm(-1, 24, 34, 0, -96, 0), arm(1, -44, 16, 0, -40),
               leg(1, -16, 14, 0), leg(-1, 18, 16, -6), r("head", 4, 34), paul(-1, 12, -8),
               r("cape", 10), r("jaw", 6))
    WIND = spear(WIND, (0.06, 0.1, 1), side=(0, 1, 0))
    THRUST = add(pos("body", 0, 0, 7.0), r("body", 12, 18), r("chest", 8, 24),
                 arm(-1, -86, 4, 0, -2, 0), arm(1, 40, 24, 0, -24),
                 leg(1, -56, 64, -8), leg(-1, 36, 6, 12), r("head", -14, -40), paul(-1, 16, -14), paul(1, -4),
                 r("cape", 28), r("cape_1", 16), r("jaw", 18))
    THRUST = spear(THRUST, (0.0, -0.08, 1), side=(0, 1, 0))
    HOLD = add(THRUST, pos("body", 0, 0, 0.6), r("chest", 2))
    A["lunge"] = timeline(0.8, [(0.0, REST, None), (0.24, WIND, "out"), (0.38, THRUST, "out_back"),
                                (0.52, HOLD, "ease"), (0.8, REST, "ease")],
                          extra=[ring("cape_hem", 0.4, 14, freq=5), ring("pennant", 0.4, 30, freq=6, axis=1)]
                          + embers(0.8, 1.0, 2.0))

    # spin (1.2 s): coils back with the spear swung out level to the right, then whirls round a full turn, crouched,
    # sweeping it in a wide circle (the cape and plume flung out), and comes back to guard
    OUT = arm(-1, -6, 84, 0, -4)
    COIL = add(r("body", 0, -46), r("chest", 4, -16), OUT, arm(1, -40, 40, 0, -60),
               leg(1, -24, 36, 0), leg(-1, -10, 30, 0), r("head", 6, 40), paul(-1, 24), r("cape", 14))
    COIL = spear(COIL, (-0.75, 0.05, -0.65), side=(0, 1, 0), frame="body")
    SWEEP = add(r("body", 0, 150), r("chest", 8, 10), OUT, arm(1, -30, 46, 0, -50),
                leg(1, -30, 40, 0), leg(-1, -30, 40, 0), r("head", 6, -8), paul(-1, 26), r("cape", 34),
                r("cape_1", 12), r("plume", 20))
    SWEEP = spear(SWEEP, (-0.85, 0.0, 0.55), side=(0, 1, 0), frame="body")
    SWEEP2 = add(SWEEP, r("body", 0, 165))
    LAND = add(r("body", 0, 360), r("chest", 4, 4), arm(-1, -20, 50, 0, -30), arm(1, -16, 20, 0, -30),
               leg(1, -18, 26, 0), leg(-1, -8, 20, 0), r("cape", 18), paul(-1, 14))
    LAND = spear(LAND, (-0.35, 0.45, 0.8), side=(0, 1, 0), frame="body")
    A["spin"] = timeline(1.2, [(0.0, REST, None), (0.26, COIL, "out"), (0.52, SWEEP, "in"), (0.74, SWEEP2, "linear"),
                               (0.9, LAND, "out"), (1.2, add(REST, r("body", 0, 360)), "ease")],
                         lift=[[0, 0], [0.4, 0], [0.6, 1.2], [0.8, 0.4], [0.9, 0], [1.2, 0]],
                         extra=[ring("cape_hem", 0.9, 16, freq=5), ring("pennant", 0.9, 30, freq=6, axis=1)]
                         + embers(1.2, 1.0, 2.0))

    # war cry (1.5 s): gathers itself hunched, then rears up, head thrown back and the jaw wide in a roar, the spear
    # thrust to the sky and the left fist raised; the embers in its eyes flare; it trembles with the roar and settles
    GATHER = add(r("body", 10), r("chest", 16), r("head", 22), arm(-1, 8, 14, 0, -40), arm(1, 4, 20, 0, -110),
                 leg(1, -20, 34, -10), leg(-1, -20, 34, -10), paul(1, -6), paul(-1, -6),
                 sc("eye_l", -0.4, -0.4, 0), sc("eye_r", -0.4, -0.4, 0), r("cape", -6))
    GATHER = spear(GATHER, (0.15, 1, 0.5))
    ROAR = add(r("body", -6), r("chest", -14), r("head", -34), r("jaw", 40),
               arm(-1, -168, 12, 0, -6), arm(1, -128, 46, 0, -36, 0),
               leg(1, -8, 6, 0, 10), leg(-1, -8, 6, 0, 10), paul(-1, 34, -10), paul(1, 30, -8),
               sc("eye_l", 1.6, 1.6, 0), sc("eye_r", 1.6, 1.6, 0), r("cape", 22), r("cape_1", 12), r("plume", -20),
               sc("chest", 0.05, 0.06, 0.05))
    ROAR = spear(ROAR, (0.06, 1, 0.1))
    A["war_cry"] = timeline(1.5, [(0.0, REST, None), (0.3, GATHER, "ease"), (0.5, ROAR, "out_back"),
                                  (1.1, add(ROAR, r("head", -4), r("jaw", 4)), "ease"), (1.5, REST, "ease")],
                            extra=[shake("head", 0.55, 1.15, [0, 4, 3], freq=11),
                                   shake("chest", 0.55, 1.15, [1.5, 0, 1.5], freq=11, phase=-1),
                                   shake("jaw", 0.55, 1.15, 5, freq=13),
                                   ring("cape_hem", 0.5, 16, freq=5), ring("plume", 0.52, 18, freq=5)]
                            + [osc("pennant", "y", 20, 6, 0.0)])

    # death (1.5 s): struck, it reels back and its grip on the spear loosens; the knees buckle and it drops onto
    # them, sways, then topples forward onto its face, the spear across the ground; the embers in its sockets die
    REEL = add(r("chest", -14, 10), r("head", -22, 14), r("jaw", 20), arm(-1, 14, 30, 0, -50),
               arm(1, 16, 30, 0, -10), leg(1, -8, 10), leg(-1, 10, 6))
    REEL = spear(REEL, (-0.35, 0.85, -0.3))
    KNEEL = add(r("body", 4), leg(1, -80, 118, 34), leg(-1, -76, 116, 34), r("chest", 16, 6, -6),
                r("head", 24, -6, 10), r("jaw", 24), arm(-1, -10, 20, 0, -30), arm(1, 8, 12, 0, -6),
                r("cape", -4), r("cape_1", 8), sc("eye_l", -0.5, -0.5, -0.5), sc("eye_r", -0.5, -0.5, -0.5))
    KNEEL = spear(KNEEL, (-0.25, -0.45, 1))
    SLUMP = add(KNEEL, r("chest", 6), r("head", 10))
    SLUMP = add({k: v for k, v in SLUMP.items() if k != "spear"}, P.aim(SLUMP, "spear", (-0.3, -0.5, 1)))
    FALL = add(r("body", 82), leg(1, 2, 12, 30, 6), leg(-1, -2, 16, 30, 8), r("chest", 4, 4, -4),
               r("head", -26, 26, 10), r("jaw", 30), arm(-1, -150, 26, 0, -10), arm(1, -20, 40, 0, -20),
               paul(1, 10), paul(-1, 10), r("cape", -40), r("cape_1", -10), r("plume", -30),
               sc("eye_l", -0.9, -0.9, -0.9), sc("eye_r", -0.9, -0.9, -0.9))
    FALL = spear(FALL, (-0.25, 0.0, 1), side=(0, 1, 0))
    A["death"] = timeline(1.5, [(0.0, REST, None), (0.18, REEL, "out"), (0.55, KNEEL, "in"), (0.8, SLUMP, "ease"),
                                (1.15, FALL, "in"), (1.25, add(FALL, r("head", -6), r("chest", -3)), "out"),
                                (1.5, FALL, "ease")],
                            extra=[ring("cape_hem", 1.15, 18, freq=6), ring("plume", 1.15, 20, freq=6)])
    spec["animations"] = A


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "withered_commander.json")
    spec, R, feet, tip = build()
    animate(spec)
    rest_on_ground(spec["parts"], DENSITY, feet)
    death = {"death": spec["animations"].pop("death")}
    ground_lock(spec, "body", feet)                     # the sabatons stay on the ground
    rest, spec["animations"] = spec["animations"], death
    ground_lock(spec, "body", None)                     # the body lies on the ground
    spec["animations"] = dict(rest, **death)
    dump(spec, out)
