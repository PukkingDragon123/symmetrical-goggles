"""Builds examples/lionfish.json: the Lionfish (Winterworks, Tides & Treasures).

    python examples/src/lionfish.py examples/lionfish.json

An elegant reef predator: a deep, flat body striped in broad coral-red bands and thin cream ones (the stripes bend
round the head and through the eye), a big mouth, round red-gold eyes under frilly brow tentacles, a crest of long
venomous dorsal `spines` (banded, with torn membrane flags, the tips bare), huge feathery pectoral `fins` spread like
fans (banded rays reaching past a spotted membrane), little pelvic fins, spotted soft fins at the back and a rounded,
spotted tail fan.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). About 18 px long with the tail fan, 21 px tall with the
spines up and 23 px across the spread pectoral fans; faces +Z, the lowest point at y = 0, "left" is +X; the root (body)
pivots in the middle of the trunk.

Contract (mods/winterworks/docs/OCEAN_UPDATE.md section 4): bones body, fins (the pectoral pair: fin_l, fin_r), spines
(the dorsal crest: spine_0..5), tail. Extra joints: jaw, tail_fin, fin_pelvic_l/r, fin_soft, fin_anal. Clips: swim
(loop), hunt (0.5 s), flare (spines out, 0.8 s). No glow.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sea_life_kit import (GLOSS, LIGHT, LR, M, ROOT, Canvas, Rig, add, dump, fan_fin, keys, osc, pos, r,  # noqa
                       ramps, rest_on_ground, ring, round_eye, rounded, sc, shake, timeline, wave)

DENSITY = 2
R = Rig(density=DENSITY, bone_style="red")
part, bone, card = R.part, R.bone, R.card


def spine_card(w, h, seed, n=2):
    """Long venomous spines (banded 'r'/'w', one texel wide, bare dark tips 't') each with a torn membrane flag
    ('m', its frayed edge 'e') trailing behind it over the lower part (plane yz: image-right is backward)."""
    rng = random.Random(seed)
    c = Canvas(w, h)
    for k in range(n):
        x = k * (w // n)
        L = int(h * rng.uniform(0.75, 1.0))
        flag = int(L * rng.uniform(0.3, 0.5))
        for j in range(L):
            y = h - 1 - j
            c.g[y][x] = "t" if j >= L - 2 else ("r" if (j // 3) % 2 == 0 else "w")
            if j < flag:
                fw = (2 if j < flag * 0.4 else 1) if j < flag * 0.8 or rng.random() < 0.5 else 0
                for dx in range(1, fw + 1):
                    if x + dx < w:
                        c.g[y][x + dx] = "e" if dx == fw and rng.random() < 0.6 else "m"
        # a tear in the membrane
        if flag > 4:
            ty = h - 1 - rng.randrange(2, flag - 1)
            if x + 1 < w:
                c.g[ty][x + 1] = "."
    return c.rows()


def pec_fin(w, h, seed):
    """A big feathery pectoral fan (plane yz: image-right backward): many banded rays reaching past a spotted membrane."""
    rays = 9
    tips = []
    for k in range(rays):
        u = k / (rays - 1)
        ang = math.radians(-70 + 150 * u)
        L = (w - 1.5) * (0.8 + 0.2 * math.sin(math.pi * u))
        tips.append((1.0 + math.cos(ang) * L, h * 0.42 + math.sin(ang) * L * (h / w) * 0.95))
    return fan_fin(w, h, (1.0, h * 0.42), tips, seed=seed, torn=0.0, scallop=0.55, band="w", band_every=2,
                   spot="s", spots=4, ray_over=1.12)


# ======================================================================= body: deep and flat, a big head
rounded(R, "body", None, [3.5, 5.5, 6.5], "trunk", centre=(0, 5.5, -1.0), at=(0, 5.5, 0.0), cut=(0.73, 0.85))
part("belly", "body", [2.5, 1, 5], "trunk_belly", centre=(0, 2.75, -0.5))
rounded(R, "head", "body", [3.5, 5, 3.5], "head", centre=(0, 5.75, 3.5), skip=("y",), cut=(0.8, 0.86))
part("snout", "head", [2.5, 2.5, 1.5], "head", centre=(0, 5.25, 5.75))
part("lip", "head", [2.5, 1, 1], "lip", centre=(0, 4.5, 6.75))
bone("jaw", "head", at=(0, 4.25, 4.5))
part("jaw_bone", "jaw", [2.5, 1, 2.5], "jaw", centre=(0, 3.75, 5.75))
for s in (1, -1):
    n = LR(s)
    part(f"eye_{n}", "head", [0.5, 3.5, 3.5], "eye", centre=M((1.875, 6.75, 4.0), s))
    # frilly brow tentacles over each eye
    card(f"brow_{n}", "head", ["t.t", "tmt", ".m.", ".m.", ".m."], "frill", at=M((1.6, 8.25, 4.2), s),
         offset=(0, 1.25, 0), plane="yz", rot=(-20, s * 10, s * -12))
    card(f"cheek_frill_{n}", "jaw", ["m.m", "mtm", "t.t"], "frill", at=M((1.3, 3.5, 5.5), s), offset=(0, -0.75, 0),
         plane="yz")

# ======================================================================= the dorsal spines: a crest of banded spines
bone("spines", "body", at=(0, 8.0, 2.5))
SPINE_Z = (3.0, 2.0, 1.0, 0.0, -1.0, -2.0)
SPINE_RX = (-10, -2, 6, 14, 22, 30)      # rest lean: each spine leans further back
SPINE_H = (18, 20, 20, 18, 16, 13)
for k, (z, rx, h) in enumerate(zip(SPINE_Z, SPINE_RX, SPINE_H)):
    card(f"spine_{k}", "spines", spine_card(3, h, seed=50 + k, n=1), "spine", at=(0, 7.75, z), offset=(0, h / 4, 0.25),
         plane="yz", rot=(rx, 0, 0))

# ======================================================================= the pectoral fans and the little fins
bone("fins", "body", at=(0, 4.5, 2.0))
for s in (1, -1):
    n = LR(s)
    card(f"fin_{n}", "fins", pec_fin(20, 22, seed=60 + s), "fin", at=M((1.6, 4.5, 2.0), s), offset=(0, 0, -4.75),
         plane="yz", rot=(10, s * -58, s * -28))
    card(f"fin_pelvic_{n}", "body", ["rmm", "rmm", "rmw", "rwm", "rm.", "t.."], "fin", at=M((0.9, 3.0, 2.0), s),
         offset=(0, -1.25, -0.5), plane="yz", rot=(28, s * -20, s * -15))
card("fin_soft", "body", fan_fin(12, 8, (0.5, 7.5), [(2.0, 1.0), (5.0, 0.5), (8.5, 1.5), (11.0, 3.5), (11.5, 6.5)],
                                 seed=71, scallop=0.25, spot="s", spots=5), "fin", at=(0, 7.75, -1.5),
     offset=(0, 1.75, -3.0), plane="yz")
card("fin_anal", "body", fan_fin(8, 6, (0.5, 0.5), [(2.0, 5.0), (5.0, 5.5), (7.5, 3.5), (7.5, 1.0)], seed=72,
                                 scallop=0.25, spot="s", spots=3), "fin", at=(0, 3.25, -2.5),
     offset=(0, -1.5, -2.0), plane="yz")

# ======================================================================= tail
part("tail", "body", [2, 3, 2], "trunk", at=(0, 5.5, -4.0), centre=(0, 5.5, -5.0))
card("tail_fin", "tail", fan_fin(10, 14, (0.5, 7.0), [(4.0, 0.5), (7.5, 1.5), (9.5, 4.5), (9.8, 7.0), (9.5, 9.5),
                                                       (7.5, 12.5), (4.0, 13.5)], seed=81, scallop=0.2,
                                 spot="s", spots=7, band="w", band_every=2),
     "fin", at=(0, 5.5, -5.75), offset=(0, 0, -2.5), plane="yz")

# ======================================================================= palette and paint
RAMPS = ramps("coral", "cream", "pupil", "amber",
              # the fins' pale membrane, faintly pink
              veil=["#5b3f3d", "#7d5c57", "#a07f77", "#c0a197", "#dbc1b5", "#eedcd0"])
brush = {"flow": "vertical", "length": 1.0, "width": 0.5, "rough": 0.45, "overshoot": 0.2,
         "textures": {"coral": "scales"}}
RIM = {"light": 1, "dark": 1, "light_shift": 1.6, "dark_shift": -1.4}
# broad coral bands and narrow cream ones, bending a little; a thin dark line splits each red band
STRIPES = {"id": "stripes", "op": "stripes", "axis": [0, -0.25, 1], "period": 1.75, "width": 0.36, "ramp": "cream",
           "tone": 5.4, "wobble": 0.25, "faces": ["sides", "top", "bottom"],
           "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "coral", "shadow_shift": -1.5}}
HAIRLINE = {"id": "hairline", "op": "stripes", "axis": [0, -0.25, 1], "period": 1.75, "width": 0.1, "phase": 1.15,
            "ramp": "coral", "tone": 2.0, "wobble": 0.25, "faces": ["sides"]}
SCALES = {"id": "scales", "op": "scales", "shape": "round", "along": "z", "size": [1.0, 1.0], "gap": 0.25,
          "highlight": 0.5, "shadow": -0.6, "jitter": 0.6, "faces": ["sides"]}
styles = {
    "red": {"ramp": "coral", "tone": 5.0, "rim": RIM},
    "trunk": {"ramp": "coral", "tone": 5.0, "rim": RIM,
              "layers": [SCALES, STRIPES, HAIRLINE,
                         {"id": "dark_back", "op": "gradient", "axis": "y", "amount": -0.5}, GLOSS]},
    "trunk_belly": {"ramp": "cream", "tone": 5.0, "rim": RIM,
                    "layers": [dict(STRIPES, ramp="coral", tone=5.4, width=0.3)]},
    "head": {"ramp": "coral", "tone": 5.2, "rim": RIM,
             "layers": [dict(STRIPES, axis=[0, -0.6, 1], period=1.5, width=0.32),
                        {"id": "eye_bar", "op": "band", "axis": "z", "from": 0.05, "to": 0.55, "ramp": "coral",
                         "tone": 2.4, "faces": ["sides"], "wobble": 0.15},
                        {"id": "chin", "op": "band", "axis": "y", "from": -1.01, "to": -0.6, "ramp": "cream",
                         "tone": 5.6, "faces": ["sides", "bottom", "front"]}, GLOSS]},
    "lip": {"ramp": "cream", "tone": 4.6, "rim": RIM, "brush": {"off": True}},
    "jaw": {"ramp": "cream", "tone": 5.0, "rim": RIM, "brush": {"off": True},
            "layers": [{"id": "mouth", "op": "fill", "ramp": "coral", "tone": 1.6, "faces": ["top"]},
                       dict(STRIPES, ramp="coral", tone=4.6, period=1.0, width=0.4, faces=["sides"])]},
    "eye": {"ramp": "coral", "tone": 2.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
            "stamps": [{"faces": ["left", "right"], "at": "top-left",
                        "art": round_eye(7),
                        "key": {"k": "coral:1", "i": "amber:3", "I": "amber:5", "J": "amber:7", "p": "pupil:0",
                                "W": "cream:7"}}]},
    "frill": {"ramp": "veil", "tone": 3, "light": 0, "brush": {"off": True},
              "art_key": {"m": "veil:3", "t": "coral:6"}},
    # spines: banded red and cream, bare dark tips, a pale torn membrane behind each
    "spine": {"ramp": "veil", "tone": 3, "light": 0.2, "brush": {"off": True},
              "art_key": {"r": "coral:4", "w": "cream:6", "t": "coral:1", "m": "veil:3", "e": "veil:5"}},
    # fins: banded rays past a pale membrane with red spots
    "fin": {"ramp": "veil", "tone": 3.6, "light": 0.3, "brush": {"off": True},
            "art_key": {"r": "coral:5", "w": "cream:6", "t": "coral:7", "e": "veil:5", "s": "coral:3"}},
}

# ======================================================================= animation
REST = {}
SPINES = [f"spine_{k}" for k in range(6)]


def hover(L, cycles=1, amp=1.0, phase=0.0):
    """The lionfish's slow, stately hover: fans breathing open and shut, the tail sculling, the crest swaying."""
    return [osc("fin_l", "y", 14 * amp, cycles, phase), osc("fin_r", "y", -14 * amp, cycles, phase),
            osc("fin_l", "z", -8 * amp, cycles, phase + 0.2), osc("fin_r", "z", 8 * amp, cycles, phase + 0.2),
            {"parts": SPINES, "axis": "x", "wave": {"amp": 4 * amp, "cycles": cycles, "lag": 0.08, "growth": 1.0,
                                                    "phase": phase + 0.1}},
            osc("fin_soft", "x", 6 * amp, cycles * 2, phase + 0.3), osc("fin_anal", "x", -6 * amp, cycles * 2, phase),
            osc("fin_pelvic_l", "x", 10 * amp, cycles * 2, phase), osc("fin_pelvic_r", "x", 10 * amp, cycles * 2,
                                                                        phase + 0.5)]


ANIM = {}
# swim: a slow glide: the tail sweeps, the body counter-sways, the fans ripple, the crest streams back a little
L = 2.0
ANIM["swim"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=hover(L, 1) + [
    wave(["tail", "tail_fin"], "y", 20, 2, lag=0.15, growth=1.3),
    osc("body", "y", -4, 2, 0.05), osc("body", "z", 2, 1, 0.3),
    osc("body", None, [0, 0.3, 0], 1, 0.0, ch="position"),
    osc("jaw", "x", 6, 1, 0.5, bias=3),
])

# hunt: fans swing forward to herd the prey, a quick crouch, then a lunge with the mouth gulping open and snapping shut
HERD = add(r("fin_l", 0, 40, -10), r("fin_r", 0, -40, 10), r("body", 6), pos("body", 0, 0, -0.8),
           r("tail", 0, 14))
STRIKE = add(pos("body", 0, -0.3, 3.0), r("body", 8), r("jaw", 40), sc("head", 0.08, 0.06, 0),
             r("fin_l", 0, -20, 20), r("fin_r", 0, 20, -20), r("tail", 0, -22), r("tail_fin", 0, -16),
             *[r(sp, 16) for sp in SPINES])
ANIM["hunt"] = timeline(0.5, [(0.0, REST, None), (0.16, HERD, "out"), (0.26, STRIKE, "in"),
                              (0.34, add(STRIKE, r("jaw", -40)), "out"), (0.5, REST, "ease")],
                        extra=[ring("tail_fin", 0.26, 18, freq=7, decay=7, axis=1, end=0.5)])

# flare: the spines rise and fan out, the pectorals spread wide, the head dips to point the spines at the threat,
# a warning shiver, then everything settles
SPREAD = add(*[r(sp, -14 - 7 * k, 0, (-1) ** k * 4) for k, sp in enumerate(SPINES)],
             sc("spines", 0, 0.12, 0), r("fin_l", -10, 34, -24), r("fin_r", -10, -34, 24), r("body", 16),
             r("tail", 0, 0, 0), r("fin_soft", -14), r("fin_anal", 14))
ANIM["flare"] = timeline(0.8, [(0.0, REST, None), (0.22, SPREAD, "out_back"), (0.55, SPREAD, "ease"),
                               (0.8, REST, "ease")],
                         extra=[shake("spines", 0.24, 0.56, 5, freq=14, axis=2),
                                shake("body", 0.24, 0.56, 2, freq=10, axis=1)])

for clip in ANIM.values():
    clip["grounded"] = False

spec = {
    "name": "Lionfish",
    "description": "The Winterworks lionfish: an elegant striped reef predator, coral-red and cream bands, round "
                   "red-gold eyes under frilly brow tentacles, a crest of long banded venomous spines with torn "
                   "membranes, huge feathery spotted pectoral fans and a spotted tail fan. Minecraft pixel units, "
                   "density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "grounded": False,
    "budget": {"tris": 600, "colors": 64},
    "light": LIGHT,
    "brush": brush,
    "minecraft": {"fps": 20},
    "render": {"background": "#1d4f5c", "hero": [38, 18], "shadow": 0.4},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "lionfish.json")
    rest_on_ground(spec["parts"], DENSITY)
    dump(spec, out)
