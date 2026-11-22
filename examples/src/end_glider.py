"""Builds examples/end_glider.json: the End Glider (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/end_glider.py examples/end_glider.json

A handheld flying machine stitched together from End mob parts, held overhead by its handle bar. Up from the bar's
leather grips rise two struts to the core: a gucker-gland bellows (a ribbed, pinkish-violet fleshy sac pocked with
breathing pores) clamped between two shulker-shell plates, with a lump of meteorite for a nose. From the top plate
two enderfly-membrane wings spread on purpur-shell spars: dusky violet moth wings veined in dark violet with glowing
eye-spots and pale fringes. Under the wing roots hang two jet pods of shulker shell banded in meteorite, blowing
pulsing violet air-jet flames out of the back.

The hands hold the bar at the root joint, which sits at lowpix (0, 24, 0) = Minecraft model (0, 0, 0); the machine
rises above it (lowpix +Y, Minecraft -Y), flies toward lowpix +Z (Minecraft -Z) and blows its jets backward. Units are
Minecraft pixels, density 4 (four texels per pixel), every box size a multiple of 0.25. The wing membranes are cards.

Contract (mods/winterworks/docs/END_UPDATE.md section 12). Bones: frame (root: core and plates), handle (the bar and
its struts), wing_l, wing_r (hinged at the top plate's sides), jet_l, jet_r (the pods), jet_flame_l, jet_flame_r (the
flames at the nozzles, pointing back; glow). Extra: bellows (the sac, pumps in the clips). Glow: jet flames, the wing
eye-spots. Clips: flap (0.8 s loop: a full wing beat, the bellows pumping twice, the flames pulsing), boost (0.4 s
loop: quicker, shallower beats with the wings swept back, the bellows pumping hard, the flames twice as long).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, osc  # noqa: E402
from obsidian_kit import RAMPS  # noqa: E402

R = Rig(density=4, bone_style="shell")
part, bone, card = R.part, R.bone, R.card

G = 24.0                      # the grip (Minecraft y = 0)
bone("frame", None, at=(0, G, 0))

# ======================================================================= the handle bar and its struts
bone("handle", "frame", at=(0, G, 0))
part("bar", "handle", [13.0, 1.0, 1.0], "iron_bar", centre=(0, G, 0))
for s, n in ((1, "l"), (-1, "r")):
    part(f"grip_{n}", "handle", [3.0, 1.5, 1.5], "grip", centre=(s * 4.25, G, 0))
    part(f"bar_cap_{n}", "handle", [1.0, 1.75, 1.75], "meteorite", centre=(s * 6.75, G, 0))
    part(f"strut_{n}", "handle", [0.75, 6.5, 0.75], "iron_bar", at=(s * 2.0, G + 0.25, 0), offset=(0, 3.25, 0),
         rot=(0, 0, s * 12))

# ======================================================================= the core: shell plates round the bellows
CY = G + 7.0                  # bottom shell plate
part("shell_bot", "frame", [8.5, 1.5, 10.0], "shell", centre=(0, CY, 0))
part("shell_bot_rim", "shell_bot", [9.0, 0.75, 10.5], "shell_dark", centre=(0, CY - 0.875, 0))
bone("bellows", "frame", at=(0, CY + 0.75, 0))
for k, (w, d) in enumerate([(7.0, 8.0), (7.75, 8.75), (7.25, 8.25), (7.75, 8.75)]):
    part(f"fold_{k}", "bellows", [w, 1.25, d], "gland" if k % 2 else "gland_fold", rel=(0, 0.625 + 1.25 * k, 0))
part("shell_top", "frame", [9.0, 1.5, 10.5], "shell", centre=(0, CY + 6.5, 0))
part("shell_ridge", "shell_top", [3.0, 1.0, 8.0], "shell_dark", centre=(0, CY + 7.75, -0.5))
part("nose", "frame", [3.5, 3.5, 3.5], "meteorite", centre=(0, CY + 3.25, 5.25), rot=(20, 45, 10))
part("nose_tip", "nose", [2.0, 2.0, 2.0], "meteorite", centre=(0.25, CY + 3.5, 7.0), rot=(35, 20, 40))
part("tail", "frame", [1.0, 2.5, 3.0], "shell_dark", centre=(0, CY + 3.25, -5.75))
# a pair of feathery enderfly antennae sweeping forward off the top plate
ANTENNA = ["..................bA", "...............b.aA.", ".............b.aAb..", "...........b.aAb.b..",
           ".........b.aAb.b....", "........baAb.b......", "......b.aA.b........", ".....baAb.b.........",
           "....baAb............", "...baA.b............", "..baA...............", ".baA................",
           ".aA.................", "aA..................", "A...................", "A..................."]
for s, n in ((1, "l"), (-1, "r")):
    card(f"antenna_{n}", "frame", [r[::-1] for r in ANTENNA], "antenna", plane="yz", at=(s * 1.75, CY + 6.75, 3.5),
         offset=(0, 2.0, 2.5), rot=(0, s * 24, s * -10))


# ======================================================================= the wings: spars and membranes
def wing_art(W, H, seed):
    """An enderfly moth wing, root on the left, front edge at the bottom (plane xz: image top = back): a pointed
    forewing sweeping out along the front edge, a rounded hindwing behind it, dark veins fanning from the root, a
    dark rim with a pale scalloped fringe, and two glowing eye-spots."""
    rng = random.Random(seed)

    FORE = [(0.0, 1.0), (0.0, 0.52), (0.3, 0.44), (0.62, 0.5), (0.86, 0.62), (1.0, 0.8), (0.97, 0.93),
            (0.7, 0.99)]

    def in_poly(u, v, poly):
        hit = False
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if (y1 > v) != (y2 > v) and u < x1 + (v - y1) * (x2 - x1) / (y2 - y1):
                hit = not hit
        return hit

    def inside(x, y):
        u, v = x / W, y / H              # u: out from the root, v: 0 back .. 1 front
        wob = 0.025 * math.sin(u * 23 + v * 7)
        # forewing: a long blade from the root out to a tip near the front-outer corner
        fore = in_poly(u + wob, v, FORE)
        # hindwing: a rounded lobe behind it, near the root, scalloped
        hu, hv = (u - 0.27) / 0.29, (v - 0.33) / 0.31
        hind = hu * hu + hv * hv < 1.0 + 0.12 * math.sin(math.atan2(hv, hu) * 7)
        return fore or hind
    grid = [["." for _ in range(W)] for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if inside(x + 0.5, y + 0.5):
                grid[y][x] = "m"
    # mottled membrane: lighter scales toward the outer half
    for y in range(H):
        for x in range(W):
            if grid[y][x] == "m" and (x / W) > 0.35 and rng.random() < 0.35 + 0.3 * (x / W):
                grid[y][x] = "M"
    # veins fanning from the root
    root = (0.5, H * 0.72)
    for ang in (-62, -40, -20, -5, 8, 20):
        a = math.radians(ang)
        for t in range(int(W * 1.2)):
            x = int(root[0] + t * math.cos(a))
            y = int(root[1] - t * math.sin(a) * (H / W) * 1.4)
            if 0 <= x < W and 0 <= y < H and grid[y][x] in "mM":
                grid[y][x] = "v"
    # eye-spots: a dark ring, a glowing ring, a white-hot pupil
    for cx, cy, r in ((W * 0.68, H * 0.74, 4.4), (W * 0.27, H * 0.3, 3.6)):
        for y in range(H):
            for x in range(W):
                d = math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.1)
                if grid[y][x] == ".":
                    continue
                if d < r * 0.35:
                    grid[y][x] = "W"
                elif d < r * 0.75:
                    grid[y][x] = "E"
                elif d < r:
                    grid[y][x] = "k"
    # a dark rim, then a pale scalloped fringe outside it on the outer and back edges
    edge = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if grid[y][x] != "." and any(not (0 <= x + dx < W and 0 <= y + dy < H) or grid[y + dy][x + dx] == "."
                                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                edge[y][x] = True
    for y in range(H):
        for x in range(W):
            if edge[y][x] and x > 1:
                grid[y][x] = "f" if (x + y) % 4 == 0 and y < H * 0.85 else "o"
    return ["".join(r) for r in grid]


WING = wing_art(64, 48, seed=5)              # 16 x 12 px at density 4
WY = CY + 6.0                                # the hinge height (top shell plate)
for s, n in ((1, "l"), (-1, "r")):
    w = bone(f"wing_{n}", "frame", at=(s * 4.25, WY, 1.0), rot=(0, s * -8, s * 8))
    part(f"spar_{n}", w["id"], [14.0, 0.75, 0.75], "spar", rel=(0, 0.25, 0), offset=(s * 7.0, 0, 0),
         rot=(0, s * 4, 0))
    part(f"spar_{n}_back", w["id"], [10.0, 0.5, 0.5], "spar", rel=(0, 0.25, -0.5), offset=(s * 5.0, 0, 0),
         rot=(0, s * 42, 0))
    part(f"spar_{n}_tip", f"spar_{n}", [2.0, 1.0, 1.0], "spar_tip", rel=(s * 14.25, 0, 0))
    art = WING if s > 0 else [r[::-1] for r in WING]
    card(f"membrane_{n}", w["id"], art, "membrane", plane="xz", rel=(0, -0.05, 0), offset=(s * 8.0, 0, -4.4))

# ======================================================================= the jet pods and their flames
def flame_art(length, width, seed):
    """An air-jet plume pointing right (base on the left): white-hot along the axis near the nozzle, violet
    outside, licking tongues toward the tip."""
    rng = random.Random(seed)
    rows = [["."] * length for _ in range(width)]
    c = (width - 1) / 2.0
    for x in range(length):
        u = x / (length - 1)
        hw = (width / 2.0) * (1.0 - u ** 1.6) * (0.85 + 0.15 * math.sin(u * 11 + seed)) + rng.uniform(-0.3, 0.3)
        for y in range(width):
            d = abs(y - c)
            if d <= hw:
                rows[y][x] = "W" if d < hw * 0.35 and u < 0.45 else ("w" if d < hw * 0.6 else "E")
    return ["".join(r) for r in rows]


FL = 5.0                                     # card plume length in px
FLAME_SIDE = flame_art(int(FL * 4), 10, 2)   # plane yz: image right is -Z (backward)
FLAME_TOP = [r[::-1] for r in flame_art(int(FL * 4), 10, 5)]
FLAME_TOP = ["".join(FLAME_TOP[y][x] for y in range(len(FLAME_TOP))) for x in range(len(FLAME_TOP[0]))][::-1]
for s, n in ((1, "l"), (-1, "r")):
    j = bone(f"jet_{n}", "frame", at=(s * 6.5, CY + 2.5, -0.5))
    part(f"pod_{n}", j["id"], [3.0, 3.0, 6.5], "shell", rel=(0, 0, 0))
    part(f"pod_{n}_band", j["id"], [3.5, 3.5, 1.0], "meteorite", rel=(0, 0, 2.25))
    part(f"pod_{n}_band2", j["id"], [3.5, 3.5, 1.0], "meteorite", rel=(0, 0, -1.75))
    part(f"intake_{n}", j["id"], [2.0, 2.0, 0.5], "intake", rel=(0, 0, 3.5))
    part(f"nozzle_{n}", j["id"], [2.5, 2.5, 1.0], "nozzle", rel=(0, 0, -3.75))
    part(f"pylon_{n}", j["id"], [1.0, 2.5, 3.0], "shell_dark", rel=(-s * 1.75, 1.0, 0), rot=(0, 0, s * 30))
    f = bone(f"jet_flame_{n}", j["id"], rel=(0, 0, -4.25))
    part(f"flame_{n}_core", f["id"], [1.25, 1.25, 2.0], "flame_hot", rel=(0, 0, -1.0))
    part(f"flame_{n}", f["id"], [2.0, 2.0, 2.5], "flame", rel=(0, 0, -1.25))
    # two crossed cards give the plume a licking, tapering outline
    card(f"flame_{n}_v", f["id"], FLAME_SIDE, "flame_card", plane="yz", rel=(0, 0, 0), offset=(0, 0, -FL / 2))
    card(f"flame_{n}_h", f["id"], FLAME_TOP, "flame_card", plane="xz", rel=(0, 0, 0), offset=(0, 0, -FL / 2))

# ======================================================================= palette and paint
ramps = {k: RAMPS[k] for k in ("purpur", "crying", "iron", "obsidian")}
ramps["gland"] = ["#2c1020", "#4a1a33", "#6c2a4a", "#8f3f62", "#b0587a", "#cc7894", "#e39db0", "#f4c6d0"]
ramps["membrane"] = ["#150c22", "#21143a", "#2f1d52", "#3f2a68", "#52397f", "#6a4d96", "#8a6bb0", "#b49ad0",
                     "#e2d4f0"]
ramps["meteorite"] = ["#141114", "#211b1e", "#302727", "#433533", "#584640", "#6f5a4f"]
ramps["ember"] = RAMPS["ember"]
ramps["leather"] = ["#1c1016", "#2c1a20", "#3f262b", "#553536", "#6d4743", "#875c52"]
RIM = {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.4, "outline": "dark"}
SHELL_RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4, "outline": "dark"}
styles = {
    # shulker shell: purpur plates with a lighter rim and a scalloped seam, like the vanilla shulker's lid
    "shell": {"ramp": "purpur", "tone": 2.3, "rim": SHELL_RIM,
              "layers": [{"id": "plates", "op": "scales", "shape": "square", "along": "x", "size": [2.5, 1.25],
                          "gap": 0.25, "highlight": 0.8, "shadow": -1.2, "jitter": 0.3, "faces": ["top", "sides"]},
                         {"id": "under", "op": "gradient", "axis": "y", "amount": 0.6}]},
    "shell_dark": {"ramp": "purpur", "tone": 2.4, "rim": SHELL_RIM, "brush": {"off": True}},
    "gland": {"ramp": "gland", "tone": 4.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.6},
              "brush": {"off": True},
              "layers": [{"id": "pores", "op": "spots", "count": 6, "radius": [0.25, 0.4], "ramp": "gland",
                          "tone": 1.0, "faces": ["sides"]},
                         {"id": "veins", "op": "cracks", "scale": 1.2, "width": 0.05, "shift": -1.2},
                         {"id": "sheen", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                          "density": 0.5, "shift": 1.8}]},
    "gland_fold": {"ramp": "gland", "tone": 2.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.2},
                   "brush": {"off": True},
                   "layers": [{"id": "crease", "op": "band", "axis": "y", "from": -0.3, "to": 0.3, "shift": -1.0,
                               "faces": ["sides"]}]},
    "meteorite": {"ramp": "meteorite", "tone": 2.6, "rim": RIM, "brush": {"off": True},
                  "layers": [{"id": "pits", "op": "spots", "count": 4, "radius": [0.2, 0.4], "shift": -1.4},
                             {"id": "embers", "op": "cracks", "scale": 1.0, "width": 0.05, "threshold": 0.45,
                              "ramp": "ember", "tone": 4.6, "seed": 3}]},
    "iron_bar": {"ramp": "iron", "tone": 3.2, "rim": RIM, "brush": {"off": True}, "dither": 0},
    "grip": {"ramp": "leather", "tone": 3.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.2},
             "brush": {"off": True},
             "layers": [{"id": "wrap", "op": "stripes", "axis": [1, 0.4, 0], "period": 0.75, "width": 0.3,
                         "shift": -1.2}]},
    "spar": {"ramp": "purpur", "tone": 4.2, "rim": SHELL_RIM, "brush": {"off": True},
             "layers": [{"id": "joints", "op": "stripes", "axis": "x", "period": 3.5, "width": 0.15, "shift": -1.6}]},
    "spar_tip": {"ramp": "purpur", "tone": 5.0, "rim": SHELL_RIM, "brush": {"off": True}},
    "membrane": {"ramp": "membrane", "tone": 4.0, "light": 0.3, "brush": {"off": True},
                 "art_key": {"m": "membrane:3", "M": "membrane:4", "v": "membrane:1", "o": "membrane:0",
                             "f": "membrane:7", "k": "membrane:0", "E": "crying:4", "W": "crying:7"}},
    "intake": {"ramp": "obsidian", "tone": 1.4, "light": 0.2, "brush": {"off": True},
               "layers": [{"id": "fan", "op": "grille", "rect": [0.1, 0.1, 0.9, 0.9], "period": 2, "dir": "v",
                           "slit_tone": 0.2, "lip": 2.0, "faces": ["front"]}]},
    "nozzle": {"ramp": "meteorite", "tone": 1.6, "rim": RIM, "brush": {"off": True},
               "layers": [{"id": "glow", "op": "rect", "rect": [0.2, 0.2, 0.8, 0.8], "ramp": "crying", "tone": 5.0,
                           "faces": ["back"]}]},
    "flame_hot": {"ramp": "crying", "tone": 7.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "flame": {"ramp": "crying", "tone": 4.6, "light": 0, "brush": {"off": True},
              "rim": {"light": 1, "dark": 1, "light_shift": 1.0, "dark_shift": -1.0},
              "layers": [{"id": "fade", "op": "gradient", "axis": "z", "amount": 1.6},
                         {"id": "streaks", "op": "stripes", "axis": "x", "period": 0.75, "width": 0.3, "shift": 0.8,
                          "faces": ["top", "bottom"]},
                         {"id": "streaks_s", "op": "stripes", "axis": "y", "period": 0.75, "width": 0.3, "shift": 0.8,
                          "faces": ["left", "right"]}]},
    "antenna": {"ramp": "membrane", "tone": 5.0, "light": 0.3, "brush": {"off": True},
                "art_key": {"a": "membrane:2", "A": "membrane:5", "b": "membrane:7"}},
    "flame_card": {"ramp": "crying", "tone": 4.0, "light": 0, "brush": {"off": True},
                   "art_key": {"W": "crying:7", "w": "crying:6", "E": "crying:4"}},
    "flame_tail": {"ramp": "crying", "tone": 2.6, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                   "layers": [{"id": "fade", "op": "gradient", "axis": "z", "amount": 1.4}]},
}

# ======================================================================= clips
FLAMES = ["jet_flame_l", "jet_flame_r"]


def beat(length, cycles, amp, sweep, pump, flame, flame_len):
    tr = []
    for s, n in ((1, "l"), (-1, "r")):
        # the down-beat is the fast part: a skewed wave, the tip lagging a little (bias keeps it mostly up)
        tr += [{"part": f"wing_{n}", "axis": "z", "keys": [
                   [0, s * amp * 0.9], [length * 0.12 / cycles, s * amp], [length * 0.5 / cycles, s * -amp * 0.75],
                   [length * 0.62 / cycles, s * -amp * 0.8], [length / cycles, s * amp * 0.9]] if cycles == 1 else
               [[round(length * (c + u) / cycles, 4), s * a] for c in range(cycles)
                for u, a in ((0, amp * 0.9), (0.12, amp), (0.5, -amp * 0.75), (0.62, -amp * 0.8))] +
               [[length, s * amp * 0.9]], "ease": "smooth"},
               osc(f"wing_{n}", "x", 4, cycles, 0.25),
               {"part": f"wing_{n}", "axis": "y", "keys": [[0, s * sweep], [length, s * sweep]], "ease": "linear"}]
    tr += [osc("bellows", None, [pump * 0.6, -pump, pump * 0.6], 2 * cycles, 0.1, ch="scale"),
           osc("frame", None, [0, 0.35, 0], cycles, 0.6, ch="position")]
    for k, f in enumerate(FLAMES):
        tr += [{"part": f, "channel": "scale", "keys": [[0, [0, 0, flame_len]], [length, [0, 0, flame_len]]],
                "ease": "linear"},
               osc(f, None, [flame * 0.5, flame * 0.5, flame], 4 * cycles, 0.37 * k, ch="scale"),
               osc(f, "z", 6, 2 * cycles, 0.2 + 0.3 * k)]
    return tr


ANIM = {
    "flap": {"length": 0.8, "loop": True, "tracks": beat(0.8, 1, 32, 0, 0.12, 0.18, 0.0)},
    "boost": {"length": 0.4, "loop": True, "tracks": beat(0.4, 1, 20, -22, 0.2, 0.3, 1.0)},
}

GLOW = [p["id"] for p in R.P if p["id"].startswith("flame_")]
spec = {
    "name": "End Glider",
    "description": "The Winterworks End Glider: a handheld flying machine of End mob parts: a gucker-gland bellows "
                   "between shulker-shell plates, two flapping enderfly-membrane wings on purpur spars and two jet "
                   "pods blowing pulsing violet air-jets. Minecraft pixel units, density 4.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 4,
    "grounded": False,
    "budget": {"tris": 600, "colors": 72},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.0},
    "brush": {"flow": "long", "length": 1.0, "width": 0.25, "rough": 0.4, "overshoot": 0.3,
              "textures": {"purpur": "stone", "gland": "organic", "meteorite": "stone"}},
    "minecraft": {"fps": 24, "glow_parts": GLOW, "glow_ramps": ["crying"]},
    "render": {"background": "#2a2735", "hero": [-30, 26], "shadow": 0.3},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "end_glider.json")
    dump(spec, out)
