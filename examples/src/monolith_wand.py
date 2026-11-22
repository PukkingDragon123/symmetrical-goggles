"""Builds examples/monolith_wand.json: the Monolith Wand (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/monolith_wand.py examples/monolith_wand.json

Exported into the mod with a fixed hash seed (PYTHONHASHSEED=0):

    python -m lowpix mc export examples/monolith_wand.json --mod mods/winterworks --modid winterworks \\
        --package dev.lowpix.winterworks.client.lowpix -o out/monolith_wand

A void rod for a shaft (a sliver of starry night: violet-black, speckled with glowing stars) banded with three rough
rings of meteorite, each split round its middle by a molten seam glowing orange through violet. Below the grip a
meteorite-core pommel: a crusted knuckle of meteorite with a molten seam, three crust claws curling under it and,
held between them, the glowing core itself (white-gold at heart, orange, rose and violet at its edges, caged by
crust bars like the meteorite_core block). Above, on a meteorite collar with a flange, a crown of seven jagged
meteorite shards (scorched, pitted fusion crust with molten cracks; the back ones tallest, the front ones short so the
eye shows) bows out round the eye and curls back over it, their tips white-hot. In the crown floats one of the
Monolith's eyes: a round eyeball (a stepped sphere of four boxes, pale and shaded, faintly veined toward the back)
whose cornea bulges forward under a round glowing violet iris with a round pupil and a catch-light; round the crown
orbit meteorite embers, hot chips and crusted cinders.

The hand holds the shaft at the root joint, which sits at lowpix (0, 24, 0) = Minecraft model (0, 0, 0); the wand
stands straight up from there (lowpix +Y, Minecraft -Y), the eye looks forward (lowpix +Z, Minecraft -Z). Units are
Minecraft pixels, density 4 (four texels per pixel), every box size a multiple of 0.25.

Contract (mods/winterworks/docs/END_UPDATE.md sections 11 and 16). Bones: rod (root: shaft, bands, pommel), head (the
collar and the crown, on top of the rod), eye (the eye inside it: eye_ball and its bars eye_ball_x, eye_ball_y,
eye_ball_z, the last the bulging cornea with the iris). Extra: embers (the orbiting meteorite embers ember_0..5, a
child of head), pommel_tip (the core). Glow: the iris, the stars, every molten texel (seams, shard tips, the core,
the embers). Clip: idle (3 s loop: the eye throbs and bobs, the embers circle it, the hot chips pulse).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, euler, osc, rot_matrix, spin  # noqa: E402
from obsidian_kit import RAMPS, iris_card, scatter  # noqa: E402

R = Rig(density=4, bone_style="crust")
part, bone = R.part, R.bone


def lean(a, deg, twist=0.0):
    """A world rotation that tips +Y `deg` degrees out toward compass angle `a` (degrees, 0 = +Z, 90 = +X), after a
    `twist` about the part's own long axis (45 shows a shard's edge, not its face)."""
    ax, az = math.sin(math.radians(a)), math.cos(math.radians(a))
    return euler(rot_matrix((deg * az, 0, -deg * ax)) @ rot_matrix((0, twist, 0)))


G = 24.0                      # the grip (Minecraft y = 0)
bone("rod", None, at=(0, G, 0))
part("shaft", "rod", [1.5, 15.0, 1.5], "void", centre=(0, G + 1.5, 0))          # y 18 .. 33

# ======================================================================= meteorite bands round the shaft
# a rough ring of crust (two boxes turned against each other) split round its middle by a glowing molten seam
for k, y in enumerate([G + 2.75, G - 2.75, G + 6.25]):
    t = 45 + 20 * k
    b = part(f"band_{k}", "rod", [2.25, 1.0, 2.25], "crust_band", centre=(0, y, 0), rot=(0, t, 0))
    part(f"band_{k}_rough", b["id"], [2.0, 0.75, 2.0], "crust_band", centre=(0, y + 0.125, 0), rot=(0, t + 22.5, 0))
    part(f"band_{k}_seam", b["id"], [2.5, 0.25, 2.5], "seam", centre=(0, y - 0.125, 0), rot=(0, t, 0))

# ======================================================================= the meteorite-core pommel
# a crusted knuckle of meteorite with a molten seam; under it three crust claws hook round the glowing core
PY = G - 7.0
part("pommel", "rod", [2.5, 2.0, 2.5], "crust", centre=(0, PY, 0), rot=(0, 45, 0))             # y 16 .. 18
part("pommel_rough", "pommel", [2.25, 1.5, 2.25], "crust", centre=(0, PY - 0.375, 0), rot=(0, 67.5, 0))
part("pommel_seam", "pommel", [2.75, 0.25, 2.75], "seam", centre=(0, PY + 0.5, 0), rot=(0, 45, 0))
for k in range(3):
    a = 60 + 120 * k
    claw = part(f"pommel_claw_{k}", "pommel", [0.75, 1.75, 0.75], "shard", at=(1.35 * math.sin(math.radians(a)), PY - 0.5,
                1.35 * math.cos(math.radians(a))), offset=(0, -0.75, 0), wrot=lean(a + 180, 14, 45))
    part(f"pommel_claw_{k}_hook", claw["id"], [0.5, 1.25, 0.5], "shard_hot", rel=(0, -1.5, 0), offset=(0, -0.5, 0),
         wrot=lean(a, 48, 45))
part("pommel_tip", "pommel", [2.0, 2.0, 2.0], "core", centre=(0, PY - 2.2, 0), rot=(35.264, 45, 0))

# ======================================================================= the head: collar, flange, crown of shards
HY = G + 8.0
bone("head", "rod", at=(0, HY, 0))
part("collar", "head", [3.0, 1.25, 3.0], "crust", centre=(0, HY + 0.375, 0), rot=(0, 45, 0))      # y 31.75 .. 33
part("collar_ring", "collar", [3.25, 0.25, 3.25], "seam", centre=(0, HY + 0.25, 0), rot=(0, 45, 0))
part("collar_top", "collar", [3.75, 0.75, 3.75], "crust", centre=(0, HY + 1.375, 0), rot=(0, 22.5, 0))

# (compass angle, height, base lean, mid lean, tip lean, barb side): a crown flaring out round the eye, jagged
# heights, tallest at the back, the two in front low so the eye shows
CROWN = [(180, 1.2, 20, 6, -14, 1), (128, 1.0, 24, 10, 22, -1), (232, 1.05, 24, 10, 20, 1), (78, 0.85, 28, 14, -8, 0),
         (282, 0.8, 28, 14, -6, 0), (46, 0.5, 40, 0, 12, 0), (314, 0.55, 40, 0, 10, 0)]
for k, (a, s, l0, l1, l2, barb) in enumerate(CROWN):
    L0, L1, L2 = (max(1.0, round(v * 4) / 4) for v in (3.0 * s, 2.75 * s, 2.0 * max(s, 0.7)))
    tw = 45 + 9 * ((k * 7) % 5 - 2)
    ax, az = math.sin(math.radians(a)), math.cos(math.radians(a))
    lo = part(f"shard_{k}", "head", [1.0, L0, 1.0], "shard", at=(1.25 * ax, HY + 1.25, 1.25 * az),
              offset=(0, L0 / 2, 0), wrot=lean(a, l0, tw))
    top, up = lo, L0 - 0.25
    if s > 0.6:   # the low front fangs are a crust root and a molten point
        top = part(f"shard_{k}_mid", lo["id"], [0.75, L1, 0.75], "shard_hot", rel=(0, up, 0), offset=(0, L1 / 2, 0),
                   wrot=lean(a, l1, tw + 15))
        up = L1 - 0.2
    part(f"shard_{k}_tip", top["id"], [0.5, L2, 0.5], "shard_tip", rel=(0, up, 0), offset=(0, L2 / 2, 0),
         wrot=lean(a + 8 * barb, l2, tw + 30))
    if barb:
        part(f"shard_{k}_barb", lo["id"], [0.5, 1.25, 0.5], "shard_tip", rel=(0, L0 * 0.6, 0), offset=(0, 0.55, 0),
             wrot=lean(a + 40 * barb, 58, tw))

# ======================================================================= the eye and the embers
EY = HY + 4.5
bone("eye", "head", at=(0, EY, 0))
# a round eyeball: a stepped sphere of a 10-texel cube crossed by three 8 x 8 x 12 bars; the forward bar is the
# cornea, bulging a texel out of the ball, with the round iris on its face (white in the corners)
part("eye_ball", "eye", [2.5, 2.5, 2.5], "eye_white", rel=(0, 0, 0))
part("eye_ball_x", "eye_ball", [3.0, 2.0, 2.0], "eye_white", rel=(0, 0, 0))
part("eye_ball_y", "eye_ball", [2.0, 3.0, 2.0], "eye_white", rel=(0, 0, 0))
part("eye_ball_z", "eye_ball", [2.0, 2.0, 3.0], "eye_cornea", rel=(0, 0, 0))
bone("embers", "head", at=(0, EY, 0))
# (radius, height, size, hot?): white-hot chips and crusted cinders with molten cracks
EMBERS = [(3.9, 1.4, 0.75, True), (4.2, -0.9, 0.75, True), (3.8, 0.3, 1.0, False), (4.3, -1.8, 0.5, True),
          (3.9, 2.5, 0.75, True), (4.1, -0.2, 0.75, False)]
for k, (r, y, sz, hot) in enumerate(EMBERS):
    a = math.radians(60 * k + 25)
    part(f"ember_{k}", "embers", [sz, sz, sz], "ember" if hot else "cinder", rel=(r * math.sin(a), y, r * math.cos(a)),
         rot=(35 + 20 * k, 30 * k, 45))

# ======================================================================= palette and paint
# meteorite: the scorched fusion crust (warm black-brown, cool iron-nickel lights) and its molten glow, edge to
# heart: violet, magenta, rose, orange, amber, gold, white (the same as the meteorite blocks, winterworks_end_art.py)
ramps = {k: RAMPS[k] for k in ("eye", "sclera", "void", "star", "meteor", "molten")}
CRUST_RIM = {"light": 1, "dark": 1, "light_shift": 2.2, "dark_shift": -1.2, "outline": "dark"}
PITS = {"id": "pits", "op": "patches", "scale": 0.7, "threshold": 0.56, "shift": -1.1,
        "bevel": {"shadow": 1, "highlight": 1, "highlight_shift": 1.6}}
SEAMS = {"id": "seams", "op": "cracks", "scale": 2.6, "width": 0.035, "threshold": 0.5, "ramp": "molten", "tone": 1.6,
         "seed": 3}
SEAMS_HOT = {"id": "seams_hot", "op": "cracks", "scale": 2.6, "width": 0.012, "threshold": 0.5, "ramp": "molten",
             "tone": 4.6, "seed": 3}
GLINT = {"id": "glint", "op": "gloss", "post": True, "dash": True, "length": 1, "inset": 0, "density": 0.45,
         "shift": 2.6, "ramps": ["meteor"]}
STARS = scatter(6, 60, seed=7, density=0.07, chars="sSt")
IRIS = iris_card(8)
IRIS_KEY = {"o": "eye:1", "i": "eye:3", "I": "eye:4", "J": "eye:5", "c": "eye:5", "p": "void:0", "q": "eye:0",
            "W": "eye:7", "w": "eye:6"}
# the core seen through crust bars (like the meteorite_core block): white-gold heart, cooling outward
CORE = ["vrhbbhrv",
        "rhHCCHhr",
        "hHCWWCHh",
        "bCWWWWCb",
        "bCWWWWCb",
        "hHCWWCHh",
        "rhHCCHhr",
        "vrhbbhrv"]
CORE_KEY = {"W": "molten:8", "C": "molten:7", "H": "molten:6", "h": "molten:4", "r": "molten:2", "v": "molten:1",
            "b": "meteor:2"}
styles = {
    "crust": {"ramp": "meteor", "tone": 3.4, "rim": CRUST_RIM, "brush": {"off": True},
              "layers": [PITS, SEAMS, SEAMS_HOT, GLINT]},
    "crust_band": {"ramp": "meteor", "tone": 3.6, "rim": CRUST_RIM, "brush": {"off": True},
                   "layers": [PITS, dict(SEAMS, scale=2.0, threshold=0.62), dict(SEAMS_HOT, scale=2.0, threshold=0.62),
                              GLINT]},
    # the shards: crust darkening toward the root, molten cracks running up them
    "shard": {"ramp": "meteor", "tone": 3.6, "rim": CRUST_RIM, "brush": {"off": True},
              "layers": [{"id": "rise", "op": "gradient", "axis": "y", "amount": 1.2}, PITS,
                         dict(SEAMS, scale=1.1, threshold=0.45), dict(SEAMS_HOT, scale=1.1, threshold=0.45), GLINT]},
    # white-hot shard tips: violet-rose at the root, orange, gold, white at the point
    "shard_tip": {"ramp": "molten", "tone": 4.4, "light": 0.35, "brush": {"off": True},
                  "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.8},
                  "layers": [{"id": "heat", "op": "gradient", "axis": "y", "amount": 3.6}]},
    # the upper shard: crust heating toward the molten tip, a violet glow creeping down it
    "shard_hot": {"ramp": "meteor", "tone": 3.6, "rim": CRUST_RIM, "brush": {"off": True},
                  "layers": [{"id": "rise", "op": "gradient", "axis": "y", "amount": 1.0}, PITS,
                             dict(SEAMS, scale=1.1, threshold=0.45), dict(SEAMS_HOT, scale=1.1, threshold=0.45),
                             {"id": "glow", "op": "band", "axis": "y", "from": 0.55, "to": 1.0, "ramp": "molten",
                              "tone": 1.2},
                             {"id": "glow_hot", "op": "band", "axis": "y", "from": 0.8, "to": 1.0, "ramp": "molten",
                              "tone": 2.6}, GLINT]},
    # a molten seam: orange through, violet where it turns from the light
    "seam": {"ramp": "molten", "tone": 4.8, "light": 0.3, "brush": {"off": True},
             "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -2.4}},
    "core": {"ramp": "molten", "tone": 5.5, "light": 0.2, "brush": {"off": True},
             "rim": {"light": 0, "dark": 0},
             "stamps": [{"faces": ["all"], "at": "center", "art": CORE, "key": CORE_KEY}]},
    "ember": {"ramp": "molten", "tone": 5.6, "light": 0.3, "brush": {"off": True},
              "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -2.6}},
    "cinder": {"ramp": "meteor", "tone": 3.2, "rim": CRUST_RIM, "brush": {"off": True},
               "layers": [dict(SEAMS, scale=2.2, width=0.08, threshold=0.4, tone=3.4),
                          dict(SEAMS_HOT, scale=2.2, width=0.03, threshold=0.4, tone=6.0), GLINT]},
    # the void rod: violet-black, deepening toward the ends, a drifting nebula band, glowing stars
    "void": {"ramp": "void", "tone": 2.6, "light": 0.5, "brush": {"off": True},
             "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.0},
             "layers": [{"id": "nebula", "op": "patches", "scale": 1.6, "threshold": 0.5, "shift": 1.4},
                        {"id": "swirl", "op": "stripes", "axis": [0.4, 1, 0.3], "period": 3.0, "width": 0.2,
                         "shift": 1.0, "faces": ["sides"]}],
             "stamps": [{"faces": ["sides"], "at": [0, 0], "art": STARS,
                         "key": {"s": "star:1", "S": "star:2", "t": "star:3"}}]},
    # the whites: pale lilac, lit from the top-left, shading toward the back, a few fine violet veins behind
    "eye_white": {"ramp": "sclera", "tone": 4.6, "light": 0.6, "brush": {"off": True},
                  "rim": {"light": 0, "dark": 0},
                  "layers": [{"id": "back", "op": "gradient", "axis": "z", "amount": 1.4},
                             {"id": "veins", "op": "cracks", "scale": 1.2, "width": 0.05, "threshold": 0.5,
                              "shift": -1.6, "faces": ["back", "sides"], "seed": 4}]},
    # the cornea: the forward bar, its face the round glowing iris (pupil, catch-light) with white in the corners
    "eye_cornea": {"ramp": "sclera", "tone": 4.6, "light": 0.6, "brush": {"off": True},
                   "rim": {"light": 0, "dark": 0},
                   "layers": [{"id": "back", "op": "gradient", "axis": "z", "amount": 1.4}],
                   "stamps": [{"face": "front", "at": "center", "art": IRIS, "key": IRIS_KEY}]},
}

# ======================================================================= clip
L = 3.0
HOT_EMBERS = [k for k, e in enumerate(EMBERS) if e[3]]
ANIM = {"idle": {"length": L, "loop": True, "tracks": [
    spin("embers", L, 1.0),
    osc("eye", None, [0, 0.25, 0], 1, ch="position"),
    osc("eye", None, [0.08, 0.08, 0.08], 2, 0.2, ch="scale"),
    osc("eye", "y", 8, 1, 0.5),
    osc("embers", None, [0, 0.35, 0], 2, 0.3, ch="position"),
] + [osc(f"ember_{k}", None, [0.25, 0.25, 0.25], 3, k / 6.0, ch="scale") for k in HOT_EMBERS]}}

GLOW = ["pommel_tip"] + [f"ember_{k}" for k in HOT_EMBERS]
spec = {
    "name": "Monolith Wand",
    "description": "The Winterworks Monolith Wand: a starry void-rod shaft banded with molten-seamed meteorite, a "
                   "meteorite-core pommel, and a crown of jagged glowing meteorite shards holding a round Monolith eye "
                   "with a glowing violet iris amid orbiting meteorite embers. Minecraft pixel units, density 4.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 4,
    "grounded": False,
    "budget": {"tris": 900, "colors": 56},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.0},
    "brush": {"flow": "long", "length": 1.0, "width": 0.25, "rough": 0.4, "overshoot": 0.3,
              "textures": {"meteor": "stone"}},
    "minecraft": {"fps": 20, "glow_parts": GLOW, "glow_ramps": ["eye", "star", "molten"]},
    "render": {"background": "#2a2735", "hero": [-30, 14], "shadow": 0.3},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "monolith_wand.json")
    dump(spec, out)
