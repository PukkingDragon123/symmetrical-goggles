"""Builds examples/monolith_wand.json: the Monolith Wand (Winterworks "Living End" gear; a 3D item everywhere).

    python examples/src/monolith_wand.py examples/monolith_wand.json

A void rod for a shaft (a sliver of starry night: violet-black, speckled with glowing stars, ringed with violet-gold
bands round the grip) ending below in a faceted obsidian pommel set with a meteorite-core ember, and above in a cage of
four curved obsidian prongs on a collar. In the cage floats one of the Monolith's eyes, glowing violet with a slit
pupil, and round it drift hot embers of meteorite core.

The hand holds the shaft at the root joint, which sits at lowpix (0, 24, 0) = Minecraft model (0, 0, 0); the wand
stands straight up from there (lowpix +Y, Minecraft -Y), the eye looks forward (lowpix +Z, Minecraft -Z). Units are
Minecraft pixels, density 4 (four texels per pixel), every box size a multiple of 0.25.

Contract (mods/winterworks/docs/END_UPDATE.md section 11). Bones: rod (root: shaft, bands, pommel), head (the cage,
on top of the rod), eye (the glowing eye inside it; glow). Extra: embers (the meteorite-core embers, a child of head;
glow). Glow: eye, embers, the stars and every ember texel. Clip: idle (3 s loop: the eye throbs and bobs, the embers
circle it).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, keys, osc, spin  # noqa: E402
from obsidian_kit import RAMPS, almond, scatter  # noqa: E402

R = Rig(density=4, bone_style="obsidian")
part, bone, card = R.part, R.bone, R.card

G = 24.0                      # the grip (Minecraft y = 0)
bone("rod", None, at=(0, G, 0))
part("shaft", "rod", [1.5, 15.0, 1.5], "void", centre=(0, G + 1.5, 0))          # y 16.5 .. 31.5
for k, (y, w) in enumerate([(G + 3.0, 2.0), (G - 3.0, 2.0)]):
    part(f"band_{k}", "rod", [w, 0.75, w], "gold_band", centre=(0, y, 0))
part("pommel", "rod", [2.5, 2.0, 2.5], "obsidian", centre=(0, G - 7.5, 0), rot=(0, 45, 0))
part("pommel_tip", "pommel", [1.25, 1.25, 1.25], "ember_gem", centre=(0, G - 9.0, 0), rot=(0, 45, 0))

# ======================================================================= the head: collar, four prongs, cap
HY = G + 8.0                  # the top of the shaft
bone("head", "rod", at=(0, HY, 0))
part("collar", "head", [3.0, 1.25, 3.0], "obsidian", centre=(0, HY + 0.25, 0), rot=(0, 45, 0))
part("collar_ring", "collar", [3.5, 0.5, 3.5], "gold_band", centre=(0, HY + 0.75, 0), rot=(0, 45, 0))
for k in range(4):
    a = 45 + 90 * k
    ax, az = math.sin(math.radians(a)), math.cos(math.radians(a))
    # each prong bows out from the collar, then curls back in over the eye
    lo = part(f"prong_{k}", "head", [0.75, 3.5, 0.75], "prong", at=(1.1 * ax, HY + 0.75, 1.1 * az),
              offset=(0, 1.75, 0), wrot=(26 * az, 0, -26 * ax))
    up = part(f"prong_{k}_top", lo["id"], [0.75, 3.25, 0.75], "prong", rel=(0, 3.25, 0), offset=(0, 1.6, 0),
              wrot=(-30 * az, 0, 30 * ax))
    part(f"prong_{k}_barb", lo["id"], [0.5, 1.0, 0.5], "prong_tip", rel=(0, 3.0, 0), offset=(0, 0.4, 0),
         wrot=(48 * az, 0, -48 * ax))
part("cap", "head", [2.0, 1.0, 2.0], "obsidian", centre=(0, HY + 7.25, 0), rot=(0, 45, 0))
part("cap_spike", "cap", [1.0, 1.75, 1.0], "prong_tip", centre=(0, HY + 8.5, 0), rot=(0, 45, 0))

# ======================================================================= the eye and the embers
EY = HY + 3.75
bone("eye", "head", at=(0, EY, 0))
part("eye_ball", "eye", [2.75, 2.75, 2.75], "eye_ball", rel=(0, 0, 0))
bone("embers", "head", at=(0, EY, 0))
for k, (r, y, sz) in enumerate([(2.2, 1.2, 0.75), (2.4, -0.8, 0.5), (2.1, 0.2, 0.75), (2.5, -1.4, 0.5), (2.0, 1.6, 0.5)]):
    a = math.radians(72 * k + 20)
    part(f"ember_{k}", "embers", [sz, sz, sz], "ember", rel=(r * math.sin(a), y, r * math.cos(a)), rot=(45, 30 * k, 45))

# ======================================================================= palette and paint
ramps = {k: RAMPS[k] for k in ("obsidian", "eye", "gold", "void", "star", "ember")}
OBS_RIM = {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.0, "outline": "dark"}
GOLD_RIM = {"light": 1, "dark": 1, "light_shift": 2.0, "dark_shift": -1.8}
GLINT = {"id": "glint", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0, "density": 0.5,
         "shift": 2.4, "ramps": ["obsidian"]}
STARS = scatter(6, 60, seed=7, density=0.07, chars="sSt")
styles = {
    "obsidian": {"ramp": "obsidian", "tone": 3.6, "rim": OBS_RIM, "brush": {"off": True},
                 "layers": [{"id": "facets", "op": "patches", "scale": 0.8, "threshold": 0.55, "shift": 1.0,
                             "bevel": {"shadow": 1, "highlight": 1, "highlight_shift": 1.8}}, GLINT]},
    # the void rod: violet-black, deepening toward the ends, a drifting nebula band, glowing stars
    "void": {"ramp": "void", "tone": 2.6, "light": 0.5, "brush": {"off": True},
             "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.0},
             "layers": [{"id": "nebula", "op": "patches", "scale": 1.6, "threshold": 0.5, "shift": 1.4},
                        {"id": "swirl", "op": "stripes", "axis": [0.4, 1, 0.3], "period": 3.0, "width": 0.2,
                         "shift": 1.0, "faces": ["sides"]}],
             "stamps": [{"faces": ["sides"], "at": [0, 0], "art": STARS,
                         "key": {"s": "star:1", "S": "star:2", "t": "star:3"}}]},
    "gold_band": {"ramp": "gold", "tone": 4.8, "rim": GOLD_RIM, "brush": {"off": True},
                  "layers": [{"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0,
                              "density": 0.6, "shift": 2.0}]},
    "prong": {"ramp": "obsidian", "tone": 3.8, "rim": OBS_RIM, "brush": {"off": True},
              "layers": [{"id": "rise", "op": "gradient", "axis": "y", "amount": 0.8}, GLINT]},
    "prong_tip": {"ramp": "obsidian", "tone": 5.0, "rim": OBS_RIM, "brush": {"off": True}, "layers": [GLINT]},
    "eye_ball": {"ramp": "eye", "tone": 4.2, "light": 0.25, "brush": {"off": True},
                 "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.4},
                 "layers": [{"id": "core", "op": "spots", "count": 2, "radius": [0.5, 0.8], "ramp": "eye",
                             "tone": 6.0, "faces": ["sides", "top", "bottom"]}],
                 "stamps": [{"face": "front", "at": "center", "art": almond(11, 7, slit="p", corner="o"),
                             "key": {"o": "eye:2", "e": "eye:4", "E": "eye:5", "W": "eye:7", "p": "obsidian:0"}}]},
    "ember": {"ramp": "ember", "tone": 5.0, "light": 0.2, "brush": {"off": True},
              "rim": {"light": 1, "dark": 1, "light_shift": 1.2, "dark_shift": -1.6}},
    "ember_gem": {"ramp": "ember", "tone": 4.4, "light": 0.3, "brush": {"off": True},
                  "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.8}},
}

# ======================================================================= clip
L = 3.0
ANIM = {"idle": {"length": L, "loop": True, "tracks": [
    spin("embers", L, 1.0),
    osc("eye", None, [0, 0.25, 0], 1, ch="position"),
    osc("eye", None, [0.08, 0.08, 0.08], 2, 0.2, ch="scale"),
    osc("eye", "y", 8, 1, 0.5),
    osc("embers", None, [0, 0.3, 0], 2, 0.3, ch="position"),
] + [osc(f"ember_{k}", None, [0.25, 0.25, 0.25], 3, k / 5.0, ch="scale") for k in range(5)]}}

GLOW = ["eye_ball", "pommel_tip"] + [f"ember_{k}" for k in range(5)]
spec = {
    "name": "Monolith Wand",
    "description": "The Winterworks Monolith Wand: a starry void-rod shaft with violet-gold bands and an obsidian "
                   "pommel, and an obsidian cage head holding a glowing Monolith eye amid drifting meteorite-core "
                   "embers. Minecraft pixel units, density 4.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 4,
    "grounded": False,
    "budget": {"tris": 500, "colors": 48},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.0},
    "brush": {"flow": "long", "length": 1.0, "width": 0.25, "rough": 0.4, "overshoot": 0.3,
              "textures": {"obsidian": "crystal", "gold": "metal"}},
    "minecraft": {"fps": 20, "glow_parts": GLOW, "glow_ramps": ["eye", "star", "ember"]},
    "render": {"background": "#2a2735", "hero": [-30, 14], "shadow": 0.3},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "monolith_wand.json")
    dump(spec, out)
