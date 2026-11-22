"""Builds examples/anglerfish.json: the Anglerfish (Winterworks, Tides & Treasures).

    python examples/src/anglerfish.py examples/anglerfish.json

A deep-sea anglerfish: a dark, velvety, lumpy globe of a head and trunk (warts, pale pores, a row of lateral-line pits,
dermal tassels), a huge underbite jaw that juts up in front of the upper lip, lined with long glassy needle fangs that
curve inward, small milky round eyes, ragged torn fins, and on the forehead a long `stalk` (the illicium) arching up
and forward over the head to the `lure`: a cyan-white bioluminescent bulb with trailing filaments and a soft halo.

One model for both sexes. It is drawn at the **female's** size (about 2.9 x 2 blocks); the renderer draws a male at
1/7 of that (MALE_SCALE = 1/7, about 0.4 blocks long), so the female is the male at 7x and her texture keeps the full
density-2 detail where it is seen up close.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). Faces +Z, the lowest point at y = 0, "left" is +X; the root
(body) pivots in the middle of the trunk.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 3): bones body, head, jaw, teeth, stalk, stalk_tip, lure
(glow), fin_l, fin_r, fin_top, tail. Extra joints: stalk_1, stalk_2 (the arch's middle), stalk_tip_1 (its end),
tail_fin, eye_l, eye_r, and the locator `mouth` (a bone in the jaw, where a grabbed player is held). Clips: swim
(loop), idle (loop), lunge (0.6 s), bite (0.5 s), hold (loop), lure_flash (0.8 s). Glow: every texel of ramp
`lureglow` (the bulb, its filaments and the halo). The halo cards (`lure_halo_*`) are exported at 5% alpha: the cutout
base pass discards them and the additive eyes pass (RenderType.eyes ignores alpha) draws them as a soft bloom.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (GLOSS, LIGHT, LR, M, ROOT, Rig, add, dump, eyeball, fan_fin, fangs, keys, limb,  # noqa
                       osc, pattern_stamps, pos, r, ragged_fin, ramps, rest_on_ground, ring, rounded, sc, shake,
                       soft_halo, timeline, wave)

DENSITY = 2
R = Rig(density=DENSITY, bone_style="skin")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= trunk: the back half of a lumpy globe
rounded(R, "body", None, [19, 18, 12], "skin_body", centre=(0, 15.5, -5.5), at=(0, 15, -3.0), cut=(0.62, 0.8),
        steps=4)
part("belly", "body", [14, 2, 9], "skin_belly", centre=(0, 6.5, -5.0))
rounded(R, "rump", "body", [12, 12, 5], "skin_body", centre=(0, 15.0, -13.0), skip=("y",), cut=(0.66, 0.8))
for s in (1, -1):
    n = LR(s)
    # warty lumps on the flanks and back
    for k, (x, y, z, sz) in enumerate(((9.75, 20.0, -3.5, 2.5), (9.75, 11.5, -7.5, 2.0), (7.75, 22.5, -9.0, 2.0),
                                       (9.75, 16.0, -9.5, 1.5))):
        part(f"wart_{n}{k}", "body", [1.5, sz, sz], "wart", centre=M((x, y, z), s))
for k, (x, z) in enumerate(((3.0, -2.0), (-4.0, -6.5), (1.5, -9.5))):
    part(f"wart_top{k}", "body", [2, 1, 2], "wart", centre=(x, 25.0, z))

# ======================================================================= head: the front half, the upper jaw, eyes
rounded(R, "head", "body", [22, 18, 11], "skin_head", centre=(0, 17.5, 3.5), at=(0, 15.0, -1.0), cut=(0.6, 0.8),
        steps=4)
rounded(R, "crown", "head", [15, 2, 8], "skin_back", centre=(0, 27.0, 2.5), skip=("y",))
# the face slopes from the brow down to the snout
rounded(R, "face", "head", [19, 8, 7], "skin_head", centre=(0, 20.5, 8.0), rot=(32, 0, 0), skip=("m",),
        cut=(0.7, 0.85))
rounded(R, "snout", "head", [18, 5, 4], "skin_snout", centre=(0, 14.0, 10.5), skip=("y",))
part("lip_up", "head", [19, 1.5, 7], "lip", centre=(0, 11.0, 8.5))
for s in (1, -1):
    n = LR(s)
    part(f"brow_{n}", "head", [3, 2, 4], "wart", centre=M((8.0, 25.0, 6.0), s))
    part(f"eye_{n}", "head", [1, 4, 4], "eye", at=M((10.5, 21.0, 5.5), s), centre=M((11.25, 21.0, 5.5), s))
    card(f"tassel_{n}", "head", ["f.f", "fff", ".f.", ".ft", "..t"], "fin", at=M((11.0, 13.5, 4.0), s),
         offset=(0, -1.25, 0), plane="yz")
    card(f"tassel_b_{n}", "head", ["ff", ".f", "ft", "t."], "fin", at=M((11.0, 17.5, 0.5), s),
         offset=(0, -1.0, 0), plane="yz")

# ======================================================================= the jaw: a huge underbite lined with fangs
JAW_AT = (0, 10.5, -1.5)
part("jaw", "head", [25, 4, 16], "skin_jaw", at=JAW_AT, centre=(0, 7.0, 7.0), rot=(-6, 0, 0))
part("jaw_keel", "jaw", [21, 1.5, 13], "skin_jaw", centre=(0, 4.75, 6.5))
rounded(R, "chin", "jaw", [24, 8, 3], "skin_jaw", centre=(0, 9.5, 15.5), skip=("y",))
rounded(R, "chin_tip", "jaw", [14, 10.5, 2.5], "skin_jaw", centre=(0, 10.25, 16.0), skip=("y", "m"),
        cut=(0.8, 0.8))
part("jaw_floor", "jaw", [21, 1, 13], "maw", centre=(0, 9.5, 7.5), hide=["bottom"])
for s in (1, -1):
    n = LR(s)
    part(f"jaw_side_{n}", "jaw", [1.5, 3.5, 13], "skin_jaw", centre=M((11.75, 10.25, 7.5), s))
    card(f"tassel_jaw_{n}", "jaw", ["f..", "ff.", ".f.", ".ft", "..t"], "fin", at=M((12.0, 5.5, 9.0), s),
         offset=(0, -1.25, 0), plane="yz")
card("tassel_chin", "jaw", ["f.f.f", "fffff", ".f.f.", ".t.f.", "...t."], "fin", at=(0, 5.5, 17.3),
     offset=(0, -1.25, 0), plane="xy")
bone("mouth", "jaw", at=(0, 13.5, 8.0))
# the teeth: long fangs rising from the chin in front of the upper lip, curving in; a row along each side of the jaw
bone("teeth", "jaw", at=(0, 14.5, 15.0))
card("teeth_front", "teeth", fangs(42, 14, every=3, seed=3, lean=2.5, minlen=0.5), "teeth", at=(0, 13.5, 15.6),
     offset=(0, 3.5, 0), plane="xy", rot=(-16, 0, 0))
for s in (1, -1):
    n = LR(s)
    card(f"teeth_{n}", "teeth", fangs(26, 10, every=3, seed=5 + s, lean=1.5, minlen=0.45), "teeth",
         at=M((11.1, 12.0, 7.5), s), offset=(0, 2.5, 0), plane="yz", rot=(0, 0, s * 16))
# the upper teeth hang from the lip, shorter, behind the lower fangs
card("teeth_up", "head", fangs(34, 8, every=3, seed=8, up=False, lean=1.0, minlen=0.5), "teeth",
     at=(0, 11.5, 12.7), offset=(0, -2.0, 0), plane="xy")

# ======================================================================= the stalk and the lure
BASE = np.array((0, 27.5, 4.5))
part("stalk_base", "head", [3, 1.5, 3], "wart", centre=BASE + (0, 0.25, 0))
p = limb(R, "stalk", "head", BASE, BASE + (0, 5.0, 0.0), 1.5, "stalk")
p = limb(R, "stalk_1", "stalk", p, p + (0, 3.5, 2.5), 1.5, "stalk")
p = limb(R, "stalk_2", "stalk_1", p, p + (0, 1.0, 4.0), 1.5, "stalk")
p = limb(R, "stalk_tip", "stalk_2", p, p + (0, -1.5, 4.0), 1.0, "stalk_tip")
p = limb(R, "stalk_tip_1", "stalk_tip", p, p + (0, -3.5, 1.5), 1.0, "stalk_tip")
LURE = p + np.array((0, -0.5, 0.2))
bone("lure", "stalk_tip_1", at=LURE)
part("lure_cap", "lure", [2, 1, 2], "lure_cap", centre=LURE + (0, 0.0, 0))
rounded(R, "lure_bulb", "lure", [4, 4, 4], "bulb", centre=LURE + (0, -2.5, 0), cut=(0.62, 0.81))
part("lure_core", "lure_bulb", [2, 2.5, 2], "bulb_core", centre=LURE + (0, -2.6, 1.1))
STRANDS = ["f...f.", ".f..f.", ".F.f..", "..F.f.", "..f..F", ".t...t", "t....."]
for k, (pl, rot) in enumerate((("xy", (0, 25, 0)), ("yz", (0, 25, 0)))):
    card(f"lure_strand_{k}", "lure_bulb", STRANDS, "strand", at=LURE + (0, -4.5, 0), offset=(0, -1.75, 0),
         plane=pl, rot=rot)
HALO = soft_halo(28)
HALOS = [f"lure_halo_{pl}" for pl in ("xy", "yz", "xz")]
for pl in ("xy", "yz", "xz"):
    card(f"lure_halo_{pl}", "lure_bulb", HALO, "halo", at=LURE + (0, -2.5, 0), plane=pl)

# ======================================================================= fins and tail
TIPS = [(17.5, 1.0), (21.5, 3.5), (23.5, 7.5), (23.0, 11.5), (20.5, 15.0), (16.0, 17.0)]
for s in (1, -1):
    n = LR(s)
    card(f"fin_{n}", "body", fan_fin(24, 18, (1.0, 9.0), TIPS, seed=11 + s, torn=0.6, scallop=0.3), "fin",
         at=M((9.5, 11.0, -4.0), s), offset=(0, 0, -5.5), plane="yz", rot=(0, s * -48, s * -12))
card("fin_top", "body", ragged_fin(22, 11, seed=21, rays=7, torn=0.5), "fin", at=(0, 24.0, -8.5),
     offset=(0, 2.75, -4.5), plane="yz", rot=(-6, 0, 0))
rounded(R, "tail", "body", [9, 10, 5], "skin_tail", centre=(0, 15.0, -16.5), at=(0, 15.0, -14.0))
part("tail_stalk", "tail", [6, 7, 3], "skin_tail", centre=(0, 15.0, -20.0))
card("tail_fin", "tail", fan_fin(22, 24, (0.5, 12.0), [(10.0, 0.8), (16.5, 2.0), (20.8, 7.0), (21.6, 12.0),
                                                       (20.8, 17.0), (16.5, 22.0), (10.0, 23.2)],
                                 seed=31, torn=0.7, scallop=0.32),
     "fin", at=(0, 15.0, -21.0), offset=(0, 0, -5.5), plane="yz")
card("fin_anal", "tail", ragged_fin(14, 7, seed=41, rays=5, root_side="top", torn=0.4), "fin",
     at=(0, 10.5, -14.5), offset=(0, -1.75, -3.0), plane="yz", rot=(12, 0, 0))

# ======================================================================= palette and paint
RAMPS = ramps("maw", "tooth", "milk", "lureglow", "pupil",
              # warm brown-black deep-sea skin, plum shadows, a velvet sheen
              abyss=["#060407", "#0c070c", "#140b12", "#1c1018", "#25151d", "#2f1b23", "#3a2229", "#462a30",
                     "#533338", "#623d41", "#72484b", "#845557", "#986465"])
brush = {"flow": "horizontal", "length": 2.0, "width": 0.8, "rough": 0.5, "overshoot": 0.25,
         "textures": {"abyss": "organic"}}
RIM = {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.4}
VELVET = {"id": "velvet", "op": "noise", "scale": 2.4, "amount": 0.55}
WARTS = {"id": "warts", "op": "scales", "shape": "round", "along": "z", "size": [1.5, 1.5], "gap": 0.5,
         "highlight": 1.0, "shadow": -1.1, "jitter": 0.9, "faces": ["top", "sides"]}
PORES = {"id": "pores", "op": "spots", "count": 9, "radius": [0.3, 0.45], "ramp": "abyss", "tone": 10.4,
         "post": True, "min_gap": 1.2, "faces": ["top", "sides"]}
BLOTCH = {"id": "blotch", "op": "patches", "scale": 2.6, "threshold": 0.58, "shift": 1.6,
          "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.2, "highlight_shift": 0.8}}
DARK_BELLY = {"id": "dark_belly", "op": "gradient", "axis": "y", "amount": 1.0}
SHEEN = {"id": "sheen", "op": "spots", "count": 2, "radius": [0.8, 1.2], "stretch": [1, 0.5, 2], "shift": 1.4,
         "faces": ["top"], "roughness": 0.5}
styles = {
    "skin": {"ramp": "abyss", "tone": 4.4, "rim": RIM},
    "skin_body": {"ramp": "abyss", "tone": 4.0, "rim": RIM,
                  "layers": [VELVET, DARK_BELLY, WARTS, BLOTCH, SHEEN, PORES, GLOSS]},
    "skin_back": {"ramp": "abyss", "tone": 4.8, "rim": RIM, "layers": [VELVET, WARTS, dict(BLOTCH, seed=3), PORES,
                                                                       GLOSS]},
    "skin_belly": {"ramp": "abyss", "tone": 3.4, "rim": RIM,
                   "layers": [VELVET, {"id": "folds", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.25,
                                       "shift": -1.0, "wobble": 0.3, "faces": ["bottom", "sides"]}]},
    "skin_head": {"ramp": "abyss", "tone": 4.2, "rim": RIM,
                  "layers": [VELVET, DARK_BELLY, WARTS, dict(BLOTCH, seed=5), SHEEN, dict(PORES, count=11), GLOSS]},
    "skin_snout": {"ramp": "abyss", "tone": 4.4, "rim": RIM,
                   "layers": [VELVET, WARTS,
                              {"id": "nostrils", "op": "spots", "centers": [[3.5, 1.2, 1.5, 0.45],
                                                                            [-3.5, 1.2, 1.5, 0.45]],
                               "ramp": "abyss", "tone": 0.4, "faces": ["front"]}]},
    "lip": {"ramp": "abyss", "tone": 2.6, "rim": {"light": 1, "dark": 0, "light_shift": 1.4}, "brush": {"off": True},
            "layers": [{"id": "gum", "op": "fill", "ramp": "maw", "tone": 3.0, "faces": ["bottom"]}]},
    "skin_jaw": {"ramp": "abyss", "tone": 4.2, "rim": RIM,
                 "layers": [VELVET, WARTS, dict(BLOTCH, seed=7), dict(PORES, count=7),
                            {"id": "inner", "op": "fill", "ramp": "maw", "tone": 3.6, "faces": ["top"]},
                            {"id": "throat", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.22,
                             "shift": -1.2, "faces": ["bottom"]}, GLOSS]},
    "maw": {"ramp": "maw", "tone": 3.4, "light": 0.5, "rim": {"light": 0, "dark": 1, "dark_shift": -1.4},
            "brush": {"flow": "z", "rough": 0.5},
            "layers": [{"id": "tongue", "op": "band", "axis": "x", "from": -0.35, "to": 0.35, "ramp": "maw",
                        "tone": 5.2, "faces": ["top"], "wobble": 0.2},
                       {"id": "ridges", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.3, "shift": -1.0,
                        "faces": ["top"]}]},
    "skin_tail": {"ramp": "abyss", "tone": 4.2, "rim": RIM, "brush": {"flow": "z"},
                  "layers": [VELVET, DARK_BELLY, WARTS, dict(BLOTCH, seed=9), dict(PORES, count=5), GLOSS]},
    "wart": {"ramp": "abyss", "tone": 6.0, "rim": {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -1.8},
             "brush": {"off": True},
             "layers": [{"id": "tip", "op": "spots", "count": 1, "radius": [0.45, 0.55], "ramp": "abyss",
                         "tone": 9.6, "faces": ["top", "sides"]}]},
    "teeth": {"ramp": "tooth", "tone": 4, "light": 0, "brush": {"off": True},
              "art_key": {"y": "tooth:4", "z": "tooth:2", "Y": "tooth:6"}},
    "fin": {"ramp": "abyss", "tone": 4.0, "light": 0.3, "brush": {"off": True},
            "layers": [{"id": "veil", "op": "noise", "scale": 1.2, "amount": 0.8}],
            "art_key": {"r": "abyss:8", "t": "abyss:11", "e": "abyss:6", "f": "abyss:6"}},
    "stalk": {"ramp": "abyss", "tone": 5.2, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
              "brush": {"off": True},
              "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.25, "shift": 1.6}]},
    "stalk_tip": {"ramp": "abyss", "tone": 6.0, "rim": {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6},
                  "brush": {"off": True},
                  "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.3,
                              "ramp": "abyss", "tone": 9.8}]},
    "lure_cap": {"ramp": "abyss", "tone": 6.4, "rim": {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.6},
                 "brush": {"off": True}},
    # the bulb: a cyan-white glow, hottest in the core, its translucent skin veined
    "bulb": {"ramp": "lureglow", "tone": 5.6, "light": 0.3, "brush": {"off": True},
             "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.4},
             "layers": [{"id": "cup", "op": "band", "axis": "y", "from": 0.6, "to": 1.01, "ramp": "lureglow",
                         "tone": 3.0, "faces": ["sides"]},
                        {"id": "veins", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.25, "ramp": "lureglow",
                         "tone": 4.0, "faces": ["sides"], "range": [-0.6, 0.6]},
                        {"id": "glint", "op": "gloss", "post": True, "dash": True, "length": 1, "inset": 0,
                         "density": 0.8, "shift": 2.0}]},
    "bulb_core": {"ramp": "lureglow", "tone": 8.0, "light": 0.1, "brush": {"off": True},
                  "rim": {"light": 1, "dark": 0, "light_shift": 1.0}},
    "strand": {"ramp": "lureglow", "tone": 4, "light": 0, "brush": {"off": True},
               "art_key": {"f": "lureglow:3", "F": "lureglow:5", "t": "lureglow:7"}},
    "halo": {"ramp": "lureglow", "tone": 1, "light": 0, "brush": {"off": True},
             "art_key": {"1": "lureglow:1", "2": "lureglow:1", "3": "lureglow:2", "4": "lureglow:3",
                         "5": "lureglow:4", "6": "lureglow:5"}},
}
# the eyes: small, milky and round, a round dark pupil and a catch-light, in a dark lid ring
EYE = eyeball(8, 8, 6, 6, iris=4, lid_shade=1)
EYE[3] = EYE[3][:3] + "W" + EYE[3][4:]
styles["eye"] = {"ramp": "abyss", "tone": 3.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
                 "stamps": [{"faces": ["left", "right"], "at": "top-left", "art": EYE,
                             "key": {"L": "abyss:4", "k": "abyss:1", "u": "abyss:0", "l": "abyss:7", "d": "milk:3",
                                     "s": "milk:5", "S": "milk:6", "o": "milk:1", "i": "milk:2", "I": "milk:3",
                                     "J": "milk:4", "c": "milk:5", "p": "pupil:0", "q": "milk:1", "W": "milk:7",
                                     "w": "milk:6"}}]}


def lateral_line(size, centre, y, every=3):
    """A row of pale lateral-line pits (a lit texel over a dark one) along both flanks of a box at height y."""
    def fn(x, yy, z):
        k = int(round((z + 100) * DENSITY))
        if k % every:
            return "."
        if abs(yy - y) < 0.3:
            return "P"
        if abs(yy - (y - 0.5)) < 0.3:
            return "Q"
        return "."
    return [dict(st, key={"P": "abyss:11", "Q": "abyss:1"})
            for st in pattern_stamps(size, DENSITY, fn, centre, faces=("left", "right"))]


for p_ in R.P:
    if p_["id"] == "body":
        p_["paint"] = {"stamps": lateral_line(p_["size"], (0, 15.5, -4.5), 17.0)}
    if p_["id"] == "head":
        p_["paint"] = {"stamps": lateral_line(p_["size"], (0, 17.5, 4.5), 17.0)}

# ======================================================================= animation
REST = {}
STALK = ["stalk", "stalk_1", "stalk_2", "stalk_tip", "stalk_tip_1"]
TAIL = ["tail", "tail_fin"]


def fins(L, amp=1.0, cycles=2, phase=0.0):
    """Pectoral fins sculling (alternating), the dorsal and anal fins rippling."""
    return [osc("fin_l", "y", 16 * amp, cycles, phase), osc("fin_r", "y", -16 * amp, cycles, phase + 0.5),
            osc("fin_l", "x", 8 * amp, cycles, phase + 0.25), osc("fin_r", "x", 8 * amp, cycles, phase + 0.75),
            osc("fin_top", "z", 6 * amp, cycles, phase + 0.1), osc("fin_anal", "z", -6 * amp, cycles, phase + 0.3)]


def dangle(L, cycles=1, amp=1.0, phase=0.0):
    """The stalk sways with follow-through; the lure swings below it and turns slowly."""
    return [wave(STALK, "x", -2.5 * amp, cycles, lag=0.1, growth=1.2, phase=phase),
            wave(STALK, "z", 3 * amp, cycles, lag=0.12, growth=1.25, phase=phase + 0.25),
            osc("lure", "x", 10 * amp, cycles, phase + 0.45), osc("lure", "z", -8 * amp, cycles, phase + 0.7),
            osc("lure", "y", 20 * amp, cycles, phase + 0.2)]


def pulse(L, cycles=2, amp=1.0, phase=0.0):
    """The bulb breathes light: it swells a little, the halo swells more."""
    tr = [osc("lure_bulb", None, [0.06 * amp] * 3, cycles, phase, ch="scale"),
          osc("lure_core", None, [0.12 * amp] * 3, cycles, phase + 0.05, ch="scale")]
    for h in HALOS:
        tr.append(osc(h, None, [0.14 * amp] * 3, cycles, phase + 0.1, ch="scale"))
    return tr


ANIM = {}
# swim: a slow, heavy beat of the tail; the body counter-yaws, the head bobs, the jaw hangs a little open
L = 1.6
ANIM["swim"] = timeline(L, [(0.0, r("jaw", 6), None), (L, r("jaw", 6), None)], loop=True,
                        extra=fins(L, 1.0, 2) + dangle(L, 1, 1.4, 0.1) + pulse(L, 2) + [
    wave(TAIL, "y", 22, 1, lag=0.15, growth=1.3),
    osc("body", "y", -5, 1, 0.05), osc("body", "z", 2, 1, 0.3), osc("body", "x", 1.5, 2, 0.0),
    osc("head", "y", -2, 1, 0.1),
    osc("jaw", "x", 3, 2, 0.4),
    osc("body", None, [0, 0.4, 0], 2, 0.2, ch="position"),
])

# idle: hanging still in the dark: slow fin sculling, the jaw breathing open and shut, the lure dangling and breathing
L = 4.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True,
                        extra=fins(L, 0.6, 3) + dangle(L, 1, 1.0) + pulse(L, 2, 1.0, 0.1) + [
    keys("jaw", "x", [[0, 2], [1.4, 2], [2.1, 13], [2.6, 13], [3.3, 2], [4.0, 2]]),
    wave(TAIL, "y", 8, 1, lag=0.18, growth=1.3, phase=0.2),
    osc("body", "x", 2, 1, 0.1), osc("body", "z", -1.5, 1, 0.35),
    osc("body", None, [0, 0.6, 0], 1, 0.0, ch="position"),
    osc("eye_l", "y", 10, 1, 0.3), osc("eye_r", "y", 10, 1, 0.3),
])

# lunge: a quick draw back with the jaw yawning wide, then a surge forward with the tail lashing, jaws gaping
WIND = add(pos("body", 0, 0.5, -3.0), r("body", -8), r("jaw", 30), r("head", -6), r("tail", 0, 18),
           r("stalk", -14), r("stalk_1", -8), r("fin_l", 0, 20), r("fin_r", 0, -20))
SURGE = add(pos("body", 0, -0.5, 9.0), r("body", 6), r("jaw", 56), r("head", -10), r("tail", 0, -24),
            r("tail_fin", 0, -20), r("stalk", 18), r("stalk_1", 14), r("stalk_tip", 10), r("teeth", -10),
            r("fin_l", 0, -40, -10), r("fin_r", 0, 40, 10), sc("body", -0.05, -0.05, 0.08))
ANIM["lunge"] = timeline(0.6, [(0.0, REST, None), (0.16, WIND, "out"), (0.32, SURGE, "in"),
                               (0.44, add(SURGE, r("jaw", -6)), "ease"), (0.6, REST, "ease")],
                         extra=pulse(0.6, 1, 1.6, 0.2) + [ring("lure", 0.32, 30, freq=5, decay=6, axis=0, end=0.6)])

# bite: the jaw snaps shut from a gape with a vicious head shake
OPEN = add(r("jaw", 48), r("head", -8), r("teeth", -8), pos("body", 0, 0, -1.0))
SNAP = add(r("jaw", -2), r("head", 4), pos("body", 0, 0, 2.0), sc("jaw", 0.04, 0, 0))
ANIM["bite"] = timeline(0.5, [(0.0, REST, None), (0.12, OPEN, "out"), (0.2, SNAP, "in"), (0.36, SNAP, "ease"),
                              (0.5, REST, "ease")],
                        extra=[shake("head", 0.2, 0.42, 8, freq=12, axis=1),
                               shake("body", 0.2, 0.42, 4, freq=12, axis=2),
                               ring("stalk", 0.2, 12, freq=6, decay=6, axis=0, end=0.5)])

# hold: jaws clamped half open round its prey (held at the `mouth` locator), shaking it, tail sweeping hard
GRIP = add(r("jaw", 24), r("head", -4), r("teeth", -6), r("body", -4))
L = 1.0
ANIM["hold"] = timeline(L, [(0.0, GRIP, None), (L, GRIP, None)], loop=True, extra=fins(L, 1.2, 2) + [
    osc("head", "y", 7, 2, 0.0), osc("body", "z", 4, 2, 0.25), osc("jaw", "x", 3, 4, 0.1),
    wave(TAIL, "y", 26, 1, lag=0.12, growth=1.3),
    wave(STALK, "x", -5, 2, lag=0.1, growth=1.2), osc("lure", "x", 18, 2, 0.3),
    osc("body", None, [0.5, 0, 0.6], 2, 0.0, ch="position"),
])

# lure_flash: the stalk lifts and trembles, the bulb flares (swells, the halo blooms wide) and dims again
FLARE = add(r("stalk", -8), r("stalk_1", -6), r("stalk_2", -4), r("stalk_tip", -4), sc("lure_bulb", 0.3, 0.3, 0.3),
            sc("lure_core", 0.4, 0.4, 0.4), *[sc(h, 0.8, 0.8, 0.8) for h in HALOS], r("jaw", 10))
ANIM["lure_flash"] = timeline(0.8, [(0.0, REST, None),
                                    (0.12, add(sc("lure_bulb", -0.2, -0.2, -0.2), *[sc(h, -0.3, -0.3, -0.3)
                                                                                    for h in HALOS]), "in"),
                                    (0.28, FLARE, "out_back"), (0.5, add(FLARE, r("stalk", 3)), "ease"),
                                    (0.8, REST, "ease")],
                              extra=[shake("stalk_tip", 0.12, 0.56, 6, freq=14, axis=0),
                                     shake("lure", 0.12, 0.56, 10, freq=11, axis=2)])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Anglerfish",
    "description": "The Winterworks anglerfish: a dark, velvety, lumpy deep-sea fish with a huge underbite jaw of long "
                   "glassy needle fangs, small milky round eyes, ragged torn fins, and a stalk arching over its head "
                   "to a cyan-white bioluminescent lure with trailing filaments and a soft halo. Drawn at the female's "
                   "size (males at 1/7). Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 1400, "colors": 80},
    "light": LIGHT,
    "brush": brush,
    "minecraft": {"fps": 20, "glow_ramps": ["lureglow"], "alpha_parts": {h: 0.05 for h in HALOS}},
    "render": {"background": "#16283a", "hero": [38, 18], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "anglerfish.json")
    rest_on_ground(spec["parts"], DENSITY)
    dump(spec, out)
