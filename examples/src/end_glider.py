"""Builds examples/end_glider.json: the End Glider (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/end_glider.py examples/end_glider.json

A glowing magic wing glider: no machinery, just a light, elegant control bar under a pair of great luminous moth
wings. The hands hold a slender moonsilver bar (violet silk wrapped round the grips, gold collars, the tips curling
up into little pearl finials); two fine struts rise from it in an A to a slim keel, with a pearl heart at its front
and two feathery antennae sweeping forward. From the keel spread two pairs of enderfly membranes, translucent
violet, deep at the root and paling to lilac toward the edges: a broad forewing and, swept back beneath it, a
rounded hindwing ending in a long trailing tail. Glowing veins fan from the roots, a soft glowing rim edges them,
and each wing carries a soft round eye-spot (a pale halo, a dark ring, a glowing rose iris lit low, a round pupil
and a catch-light). At each wing root lies a small glowing rune sigil, a ring of violet light that turns slowly;
its flare (a halo of rays and a comet trail of light streaming back) breathes gently in flight and blazes out long
and bright when boosting.

The hands hold the bar at the root joint, which sits at lowpix (0, 24, 0) = Minecraft model (0, 0, 0), the grips at
x = +-4.25 on it; the glider rises above it (lowpix +Y, Minecraft -Y) and flies toward lowpix +Z (Minecraft -Z). Units
are Minecraft pixels, density 4 (four texels per pixel), every box size a multiple of 0.25. The membranes, sigils,
flares and antennae are cards; the membranes are alpha parts (0.62 opacity: draw them translucent).

Contract (mods/winterworks/docs/END_UPDATE.md section 12). Bones: frame (root: the keel, its heart and antennae),
handle (the bar, grips and struts), wing_l, wing_r (hinged at the keel; each holds its forewing, the hind_* joint
with the hindwing, which lags a little behind each beat, and its sigil), jet_l, jet_r (the rune sigils at the wing
roots, which turn), jet_flame_l, jet_flame_r (their flares: halo and trail; scaled small and breathing in flap, big
and long in boost). Glow: the wing veins and rims, the eye-spots, the sigils and flares (ramps vein, spot, crying).
Clips: flap (0.8 s loop: one gentle, unhurried beat, the hindwings following through, the wings feathering and
shimmering, the sigils turning, the flares breathing), boost (0.4 s loop: quicker, shallower beats with the wings
swept back, the sigils turning twice as fast, the flares blazing long).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import Canvas, eye_spot, in_disc, mirror_art, plume  # noqa: E402
from hex_kit import ROOT, Rig, dump, keys, osc, spin  # noqa: E402
from obsidian_kit import RAMPS  # noqa: E402

D = 4                         # density: texels per pixel
R = Rig(density=D, bone_style="silver")
part, bone, card = R.part, R.bone, R.card

G = 24.0                      # the grip line (Minecraft y = 0)
HY = G + 10.0                 # the keel
bone("frame", None, at=(0, G, 0))

# ======================================================================= the control bar and its struts
bone("handle", "frame", at=(0, G, 0))
part("bar", "handle", [11.0, 0.75, 0.75], "silver", centre=(0, G, 0))
STRUT_X = 2.75
for s, n in ((1, "l"), (-1, "r")):
    part(f"grip_{n}", "handle", [2.5, 1.0, 1.0], "grip", centre=(s * 4.25, G, 0))
    part(f"cuff_{n}", "bar", [0.5, 1.0, 1.0], "gold", centre=(s * STRUT_X, G, 0))
    tip = part(f"bar_tip_{n}", "bar", [1.75, 0.75, 0.75], "silver", at=(s * 5.5, G, 0), offset=(s * 0.875, 0, 0),
               rot=(0, 0, s * 32))
    part(f"finial_{n}", tip["id"], [0.75, 0.75, 0.75], "pearl", rel=(s * 1.85, 0, 0), rot=(0, 0, s * -32))
    # the struts: an A-frame from the bar up to the keel
    dx, dy = STRUT_X - 0.5, HY - 0.5 - (G + 0.25)
    L = round(math.hypot(dx, dy) * 4) / 4
    part(f"strut_{n}", "handle", [0.5, L, 0.5], "silver", at=(s * STRUT_X, G + 0.25, 0), offset=(0, L / 2, 0),
         rot=(0, 0, s * math.degrees(math.atan2(dx, dy))))

# ======================================================================= the keel, its heart and antennae
part("keel", "frame", [1.0, 1.0, 7.0], "keel", centre=(0, HY, -0.5))
part("hub", "keel", [1.5, 1.0, 1.5], "gold", centre=(0, HY - 0.25, 0.5))
part("keel_band", "keel", [1.25, 1.25, 0.5], "gold", centre=(0, HY, -3.0))
part("keel_tail", "keel", [0.5, 0.5, 2.0], "silver", centre=(0, HY, -5.0))
part("heart", "keel", [1.25, 1.25, 1.25], "pearl", centre=(0, HY + 0.1, 3.3))
for s, n in ((1, "l"), (-1, "r")):
    card(f"antenna_{n}", "keel", plume(5, 24), "antenna", plane="yz", at=(s * 0.35, HY + 0.6, 3.6),
         offset=(0, 3.0, 0), rot=(40, 0, s * -18))


# ======================================================================= the wings (cards, plane xz)
def wing_art(w, h, seed, hind=False, window=None):
    """An enderfly membrane, left wing lying flat: column 0 is the root, row 0 the back edge (-Z), the last row the
    leading edge (+Z). Returns (rows, root v). Characters: '.' clear, 'm' membrane (painted by the style: deep at the
    root, paling outward), 'M' a pale wash, 'r' the rim, 'R' a glowing rim bead, 'v' glowing veins, 'V' bright
    veins near the root, 'x' glowing cross-veins, and the eye-spot ('H' halo, 'k' ring, 'E'/'e' iris, 'p' pupil,
    'w' catch-light). `window` (x, y, d in texels, x and y on texel corners): a round window cut through the
    membrane for a sigil, ringed with light."""
    c = Canvas(w, h)
    W, H = float(w), float(h)
    xy = lambda u, v: (u * W, v * H)  # noqa: E731   (v: 0 back .. 1 front, like the canvas rows)
    rng = random.Random(seed)
    if not hind:
        # broad forewing: a narrow root, a long leading edge to a rounded apex, a sweeping outer margin
        ctrl = [(0.0, 0.6), (0.0, 0.88), (0.18, 0.97), (0.45, 1.0), (0.72, 0.99), (0.9, 0.93), (0.99, 0.8),
                (0.985, 0.62), (0.9, 0.42), (0.76, 0.22), (0.58, 0.08), (0.4, 0.05), (0.24, 0.15), (0.1, 0.36)]
        root = (0.0, 0.76)
        targets = [(0.97, 0.86), (0.98, 0.68), (0.92, 0.47), (0.78, 0.26), (0.6, 0.1), (0.4, 0.07), (0.2, 0.2)]
        spot = (0.66, 0.6, 12)
    else:
        # rounded hindwing with a long tail trailing back from its outer margin
        ctrl = [(0.0, 0.7), (0.02, 0.98), (0.3, 1.0), (0.58, 0.95), (0.76, 0.82), (0.82, 0.64), (0.78, 0.46),
                (0.8, 0.28), (0.9, 0.13), (0.98, 0.04), (0.95, 0.025), (0.8, 0.08), (0.64, 0.22), (0.48, 0.34),
                (0.3, 0.44), (0.12, 0.54)]
        root = (0.0, 0.86)
        targets = [(0.5, 0.97), (0.74, 0.84), (0.81, 0.64), (0.76, 0.42), (0.95, 0.03), (0.48, 0.36), (0.24, 0.48)]
        spot = (0.66, 0.46, 10)
    c.shape([xy(u, v) for u, v in ctrl], "m", jitter=0.3, seed=seed)
    # a soft pale wash in a band before the margin (scales catching the light), in a few soft clouds
    clouds = [(rng.uniform(0.55, 0.9) * W, rng.uniform(0.1, 0.9) * H, rng.uniform(2.5, 4.5)) for _ in range(5)]
    for y in range(h):
        for x in range(w):
            if c.g[y][x] == "m" and any(math.hypot(x - cx_, y - cy_) < r_ for cx_, cy_, r_ in clouds):
                c.g[y][x] = "M"
    # the rim: the outermost ring, with glowing beads along the outer margin
    for x, y in c.edge("mM", "r"):
        if x / W > 0.3 and (x * 3 + y * 5) % 7 == 0:
            c.g[y][x] = "R"
    # veins fanning from the root, bright near it; then cross-veins closing the cells at mid-wing and near the margin
    R0 = xy(*root)
    tips = []
    for k, (u, v) in enumerate(targets):
        ex, ey = xy(u, v)
        mid = (R0[0] + (ex - R0[0]) * 0.45 + rng.uniform(-0.6, 0.6),
               R0[1] + (ey - R0[1]) * 0.35 + rng.uniform(-0.6, 0.6))
        c.curve([R0, mid, (ex, ey)], "v", where="mM")
        tips.append([(R0[0] + (ex - R0[0]) * t, R0[1] + (ey - R0[1]) * t) for t in (0.42, 0.78)])
    for a, b in zip(tips, tips[1:]):
        for j in range(2):
            c.line(a[j], b[j], "x", where="mM")
    for y in range(h):
        for x in range(w):
            if c.g[y][x] == "v" and math.hypot(x + 0.5 - R0[0], y + 0.5 - R0[1]) < W * 0.28:
                c.g[y][x] = "V"
    # the eye-spot: round, soft-haloed
    eye_spot(c, spot[0] * W, spot[1] * H, spot[2], where="mMvVxrR", mid="f", collar="c", soft="s")
    if window:
        wx, wy, wd = window
        for y in range(h):
            for x in range(w):
                if in_disc(x, y, wx, wy, wd):
                    c.g[y][x] = "."
                elif in_disc(x, y, wx, wy, wd + 2) and c.g[y][x] != ".":
                    c.g[y][x] = "V"
    return c.rows(), root[1]


# the sigil's window in the forewing's root: centred on texel corner (12, 25) of the art
WIN = (12, 25, 18)
FORE, FORE_V = wing_art(72, 40, seed=3, window=WIN)      # 18 x 10 px
HIND, HIND_V = wing_art(56, 52, seed=8, hind=True)       # 14 x 13 px
WY = HY + 0.25
for s, n in ((1, "l"), (-1, "r")):
    w = bone(f"wing_{n}", "keel", at=(s * 0.5, WY, 1.25), rot=(0, 0, s * 12))
    for art, v, cid, par in ((FORE, FORE_V, f"fore_{n}", w["id"]), (HIND, HIND_V, f"hind_{n}_m", None)):
        if par is None:          # the hindwing hangs from its own joint, swept back and a little lower
            par = bone(f"hind_{n}", w["id"], rel=(0, -0.25, -2.5), rot=(0, s * 10, s * -5))["id"]
        # the root texel (column 0, row v) sits on the joint; plane xz: image-top = -Z, so row v is Hp (0.5 - v) back
        Wp, Hp = len(art[0]) / D, len(art) / D
        card(cid, par, art if s > 0 else mirror_art(art), f"membrane_{n}", plane="xz",
             offset=(s * Wp / 2, 0, Hp * (0.5 - v)))


# ======================================================================= the sigils and their flares
def sigil_art(n=16):
    """A rune sigil n texels across, four-fold symmetric (so a quarter turn loops seamlessly): a dim glowing disc, a
    bright outer ring, a rune mark at each quarter between it and a thinner inner ring, faint dots at the diagonals, a
    white-hot heart."""
    c = n / 2.0
    rows = [["."] * n for _ in range(n)]
    for y in range(n):
        for x in range(n):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            r = math.hypot(dx, dy)
            a = (math.degrees(math.atan2(dy, dx)) + 360) % 90
            card_ = min(a, 90 - a) < 13           # near a quarter point
            diag = abs(a - 45) < 7
            if c - 1.0 <= r <= c:
                rows[y][x] = "a"
            elif 4.6 <= r < c - 1.0 and card_:
                rows[y][x] = "c"                  # the rune marks
            elif 5.0 <= r < c - 1.4 and diag:
                rows[y][x] = "e"
            elif 3.3 <= r < 4.2:
                rows[y][x] = "b"
            elif r < 1.9:
                rows[y][x] = "d"
            elif r < c - 1.0:
                rows[y][x] = "f"                  # the disc itself, a dim violet glow
    return ["".join(r) for r in rows]


def halo_art(n=28):
    """The flare's halo, n texels across: a dashed ring of light round the sigil and eight fine rays through it."""
    c = n / 2.0
    rows = [["."] * n for _ in range(n)]
    for y in range(n):
        for x in range(n):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            r = math.hypot(dx, dy)
            a = math.degrees(math.atan2(dy, dx)) % 360
            ray = min(a % 45, 45 - a % 45) < 2.6 * 9.0 / max(r, 1.0)
            if 9.6 <= r < 10.6 and (a + 15) % 30 < 18:
                rows[y][x] = "b"
            elif 9.0 <= r < c - 0.2 and ray:
                rows[y][x] = "b" if r < 11.5 else "a"
    return ["".join(r) for r in rows]


def trail_art(w=6, h=24, seed=5):
    """A comet trail of light, plane xz: row 0 the far (back) end, the last row next to the sigil; a white-hot core
    narrowing back, violet edges breaking into sparks."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    c = (w - 1) / 2.0
    for y in range(h):
        u = 1.0 - y / (h - 1)                    # 0 next to the sigil .. 1 at the far end
        half = (w / 2.0) * (1.0 - u) ** 0.8
        for x in range(w):
            d = abs(x - c)
            if d <= half + 0.2 and (u < 0.4 or rng.random() < 1.2 - u * 1.2):
                rows[y][x] = "d" if d < half * 0.3 and u < 0.25 else ("c" if d < half * 0.6 and u < 0.6 else
                                                                     ("b" if u < 0.7 else "a"))
    return ["".join(r) for r in rows]


SIGIL = sigil_art()
HALO = halo_art()
TRAIL = trail_art()
# the same trail standing on edge (plane yz faces +X, image right = -Z): columns run from the sigil to the far end
TRAIL_V = ["".join(TRAIL[len(TRAIL) - 1 - j][x] for j in range(len(TRAIL))) for x in range(len(TRAIL[0]))]
TRAIL_LEN = len(TRAIL) / D
# each sigil turns in its window, in the membrane's plane, so it shows from above and below; its flare (a halo and a
# trail streaming back from behind the ring) lies just above and just below the membrane, with a third trail on edge
WIN_X = WIN[0] / D                                 # px out from the wing joint
WIN_Z = (WIN[1] / len(FORE) - FORE_V) * len(FORE) / D   # px forward of the joint (row v is at the joint)
for s, n in ((1, "l"), (-1, "r")):
    rel = (s * WIN_X, 0, WIN_Z)
    bone(f"jet_{n}", f"wing_{n}", rel=rel)
    card(f"sigil_{n}", f"jet_{n}", SIGIL, "sigil", plane="xz")
    f = bone(f"jet_flame_{n}", f"wing_{n}", rel=rel)
    for side, dy in (("", 0.15), ("_under", -0.15)):
        card(f"flare_{n}{side}", f["id"], HALO, "flare", plane="xz", rel=(0, dy, 0))
        card(f"flare_{n}_trail{side}", f["id"], TRAIL, "flare", plane="xz", rel=(0, dy * 1.3, 0),
             offset=(0, 0, -1.75 - TRAIL_LEN / 2))
    card(f"flare_{n}_trail_v", f["id"], TRAIL_V, "flare", plane="yz", offset=(0, 0, -1.75 - TRAIL_LEN / 2))

# ======================================================================= palette and paint
ramps = {k: RAMPS[k] for k in ("crying", "gold")}
# translucent violet membrane, deep at the root, lilac at the edges (not a glow)
ramps["membrane"] = ["#1c0f33", "#28154a", "#371d62", "#46277a", "#583291", "#6b40a6", "#8156ba", "#9a71cc",
                     "#b590dc", "#d2b5ec"]
# the glows: veins (violet-white light) and eye-spots (rose)
ramps["vein"] = ["#5d2bbf", "#7d45e0", "#a06df5", "#c39bff", "#e3cdff", "#faf3ff"]
ramps["spot"] = ["#640f52", "#9c1f7c", "#d33da0", "#f26bc0", "#ff9fd8", "#ffd2ee", "#fff4fb"]
ramps["silver"] = ["#25202e", "#3a3346", "#534a62", "#6f667f", "#8e859e", "#aea6bd", "#cfc9da", "#ece9f2"]
ramps["pearl"] = ["#3a3050", "#5a4e74", "#7f739a", "#a69bbe", "#cbc2dd", "#ebe6f4", "#fdfbff"]
ramps["silk"] = ["#1b0f2a", "#2b1840", "#3e2458", "#533271", "#6a428b", "#8558a6"]
RIM = {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.4, "outline": "dark"}
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0, "density": 0.6,
         "shift": 2.0}


def membrane_style(s):
    g = 1.0 if s > 0 else -1.0            # card x runs root -> tip on the left wing, tip -> root on the right
    return {"ramp": "membrane", "tone": 4.6, "light": 0.2, "brush": {"flow": "x", "length": 1.2, "rough": 0.3},
            "layers": [{"id": "root_deep", "op": "gradient", "axis": "x", "amount": 2.6 * g},
                       {"id": "sheen", "op": "noise", "scale": 1.6, "amount": 0.35}],
            "art_key": {"M": "membrane:6", "r": "membrane:8", "R": "vein:4", "v": "vein:2", "V": "vein:4",
                        "x": "vein:1", "H": "spot:1", "k": "membrane:0", "E": "spot:2", "f": "spot:3", "e": "spot:4",
                        "c": "spot:5", "p": "membrane:0", "w": "spot:6", "s": "spot:5"}}


styles = {
    "silver": {"ramp": "silver", "tone": 5.0, "rim": RIM, "brush": {"off": True}, "dither": 0,
               "layers": [GLOSS]},
    "keel": {"ramp": "silver", "tone": 2.8, "rim": RIM, "brush": {"off": True}, "dither": 0,
             "layers": [GLOSS, {"id": "joints", "op": "stripes", "axis": "z", "period": 1.75, "width": 0.15,
                                "shift": -1.4}]},
    "gold": {"ramp": "gold", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
             "brush": {"off": True}, "layers": [GLOSS]},
    "pearl": {"ramp": "pearl", "tone": 3.2, "light": 0.8, "rim": {"light": 1, "dark": 1, "light_shift": 1.6,
                                                                  "dark_shift": -1.6},
              "brush": {"off": True}, "layers": [GLOSS]},
    # violet silk ribbon wound round the grips
    "grip": {"ramp": "silk", "tone": 3.4, "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.2},
             "brush": {"off": True},
             "layers": [{"id": "wrap", "op": "stripes", "axis": [1, 0.5, 0], "period": 0.75, "width": 0.3,
                         "shift": -1.4},
                        {"id": "sheen", "op": "stripes", "axis": [1, 0.5, 0], "period": 0.75, "width": 0.15,
                         "phase": 0.4, "shift": 1.4}]},
    "antenna": {"ramp": "membrane", "tone": 6.0, "light": 0.3, "brush": {"off": True},
                "art_key": {"s": "membrane:3", "b": "membrane:7", "B": "membrane:5", "t": "vein:3"}},
    "membrane_l": membrane_style(1),
    "membrane_r": membrane_style(-1),
    "sigil": {"ramp": "crying", "tone": 4.0, "light": 0, "brush": {"off": True},
              "art_key": {"a": "crying:5", "b": "crying:4", "c": "crying:6", "d": "crying:7", "e": "crying:2",
                          "f": "crying:0"}},
    "flare": {"ramp": "crying", "tone": 4.0, "light": 0, "brush": {"off": True},
              "art_key": {"a": "crying:2", "b": "crying:3", "c": "crying:5", "d": "crying:7"}},
}

# ======================================================================= clips
L_FLAP, L_BOOST = 0.8, 0.4


def beat(length, amp, sweep, bias, hind_amp, feather):
    """One wing beat per loop: a quicker down-stroke, a slower recovery; the hindwing follows through a beat-
    fraction late; the wings feather (twist) through the stroke and shimmer (a fine twist twice per beat)."""
    tr = []
    for s, n in ((1, "l"), (-1, "r")):
        tr += [{"part": f"wing_{n}", "channel": "rotation", "ease": "smooth", "keys": [
                   [0, [0, s * sweep, s * (bias + amp)]], [round(length * 0.4, 4), [0, s * sweep, s * (bias - amp)]],
                   [length, [0, s * sweep, s * (bias + amp)]]]},
               osc(f"wing_{n}", "x", feather, 1, 0.1),
               osc(f"hind_{n}", "z", s * hind_amp, 1, 0.12),
               osc(f"hind_{n}", "x", feather * 0.6, 2, 0.3)]
    return tr


def flare(length, size, stretch, pulse, cycles, sweep=0.0):
    """The sigils' flares: scaled (`size` across, `size + stretch` along the trail), breathing by `pulse`, and turned
    against the wings' sweep so the trails always stream straight back."""
    tr = []
    for k, (s, n) in enumerate(((1, "l"), (-1, "r"))):
        tr += [{"part": f"jet_flame_{n}", "channel": "scale", "ease": "linear",
                "keys": [[0, [size, 0, size + stretch]], [length, [size, 0, size + stretch]]]},
               osc(f"jet_flame_{n}", None, [pulse, 0, pulse * 2.0], cycles, 0.25 * k, ch="scale")]
        if sweep:
            tr.append(keys(f"jet_flame_{n}", "y", [[0, -s * sweep], [length, -s * sweep]], ease="linear"))
        # the halos stay round: undo the stretch along the trail
        round_ = round((1.0 + size) / (1.0 + size + stretch) - 1.0, 4)
        for side in ("", "_under"):
            tr.append(keys(f"flare_{n}{side}", None, [[0, [0, 0, round_]], [length, [0, 0, round_]]], ease="linear",
                           ch="scale"))
    return tr


ANIM = {
    "flap": {"length": L_FLAP, "loop": True, "tracks":
             beat(L_FLAP, amp=13, sweep=0, bias=1, hind_amp=5, feather=4)
             + flare(L_FLAP, -0.35, -0.25, 0.08, 2)
             + [spin("jet_l", L_FLAP, 0.25), spin("jet_r", L_FLAP, -0.25),
                osc("frame", None, [0, 0.3, 0], 1, 0.55, ch="position"),
                osc("heart", None, [0.06, 0.06, 0.06], 2, 0.0, ch="scale"),
                osc("antenna_l", "x", 5, 1, 0.2), osc("antenna_r", "x", 5, 1, 0.25)]},
    "boost": {"length": L_BOOST, "loop": True, "tracks":
              beat(L_BOOST, amp=8, sweep=22, bias=4, hind_amp=4, feather=3)
              + flare(L_BOOST, 0.2, 1.5, 0.12, 2, sweep=22)
              + [spin("jet_l", L_BOOST, 0.25), spin("jet_r", L_BOOST, -0.25),
                 osc("frame", None, [0, 0.15, 0], 1, 0.55, ch="position"),
                 keys("antenna_l", "x", [[0, -24], [L_BOOST, -24]], ease="linear"),
                 keys("antenna_r", "x", [[0, -24], [L_BOOST, -24]], ease="linear")]},
}

MEMBRANES = [f"fore_{n}" for n in "lr"] + [f"hind_{n}_m" for n in "lr"]
spec = {
    "name": "End Glider",
    "description": "The Winterworks End Glider: a glowing magic wing glider: a slender moonsilver control bar with "
                   "silk grips and an A-frame of struts under two pairs of great translucent violet enderfly "
                   "wings with glowing veins and soft round eye-spots, a turning rune sigil at each wing root whose "
                   "flare blazes when boosting. Minecraft pixel units, density 4.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": D,
    "grounded": False,
    "budget": {"tris": 600, "colors": 80},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.0},
    "brush": {"flow": "long", "length": 1.0, "width": 0.25, "rough": 0.4, "overshoot": 0.3,
              "textures": {"membrane": "organic", "gold": "metal", "silver": "metal"}},
    "minecraft": {"fps": 24, "glow_ramps": ["vein", "spot", "crying"], "alpha_parts": {m: 0.62 for m in MEMBRANES}},
    "render": {"background": "#2a2735", "hero": [-30, 26], "shadow": 0.3},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "end_glider.json")
    dump(spec, out)
