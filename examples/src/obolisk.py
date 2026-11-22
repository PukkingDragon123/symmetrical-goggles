"""Builds examples/obolisk.json: the Obolisk (Winterworks, The Living End).

    python examples/src/obolisk.py examples/obolisk.json

A giant one-eyed obsidian monolith on four stubby legs. The body is a tall slab of glassy, faceted obsidian built up
from leaning plates: a front plate framing the eye socket, side plates tapering it toward the top, a jagged crown of
tilted blocks, crystal shards jutting from the shoulders and back, a broad plinth over the legs. Crying-obsidian veins
glow violet through every face and run like tears down from the eye. The single eye is a big glowing violet iris with
a dark slit pupil, deep in a socket; above it hangs a heavy obsidian eyelid that slides down to shut it. In the
`disguised` clip the legs fold out flat like boulders round the base, the body sinks and leans, the shards splay and
the eyelid closes: an obsidian rock formation.

Units are Minecraft pixels (16 per block), density 2: every box is a whole number of texels, so the model exports 1:1
to a vanilla entity model (python -m lowpix mc export). About 28 x 58 x 20 px; faces +Z, ground at y = 0, "left" is
+X; the root (body) pivots between the four hips.

Contract (mods/winterworks/docs/END_UPDATE.md section 9): bones body, eye, eyelid, leg_fl, leg_fr, leg_bl, leg_br.
Extra joints: pupil (slides inside the eye), foot_* (feet), shard_* (the splaying crystal shards), crown. Clips:
disguised (loop), rise (2.0 s), idle, walk, slam (1.2 s), settle (1.5 s). Glow: the eye and the crying-obsidian veins
(ramps eyeglow and crying).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (DENSITY, LR, M, MR, ROOT, Rig, add, finish, jitter, keys, osc, pos, r, ramps,  # noqa: E402
                     ring, sc, shake, timeline)

R = Rig(density=DENSITY, bone_style="obsidian")
part, bone, card, wpos = R.part, R.bone, R.card, R.wpos

HIP = 10.0
# ======================================================================= body: a tall faceted slab on a broad plinth
part("body", None, [24, 5, 18], "plinth", at=(0, HIP, 0), centre=(0, HIP + 2.5, 0))
part("core", "body", [22, 32, 16], "obsidian", centre=(0, HIP + 21.0, 0))
part("cap", "core", [19, 4, 14], "obsidian_b", centre=(0, HIP + 38.5, -0.5), rot=(2, 6, -3))
# the front plate is built round the eye socket, so the eye sits in a real recess
EY = HIP + 25.0              # eye centre height
part("face_low", "core", [18, 14, 2], "face", centre=(0, EY - 13.0, 8.9), rot=(-2, 0, 0))
part("face_l", "core", [2, 12, 2], "face", centre=(8.0, EY, 8.9))
part("face_r", "core", [2, 12, 2], "face", centre=(-8.0, EY, 8.9))
part("face_top", "core", [18, 6, 2], "face", centre=(0, EY + 9.0, 8.9), rot=(3, 0, 0))
part("socket", "core", [14, 12, 1], "socket", centre=(0, EY, 8.4))
part("eye", "core", [12, 10, 2], "eye", at=(0, EY, 7.5), centre=(0, EY, 8.6))
part("pupil", "eye", [1.5, 8, 0.5], "pupil", centre=(0, EY, 9.75))
# the eyelid: a heavy obsidian hood over the eye, rising into the crown; it slides down 10 px to shut
part("eyelid", "core", [15, 10, 1.5], "lid", at=(0, EY + 6.0, 10.2), centre=(0, EY + 10.5, 10.4), rot=(-4, 0, 0))
for s in (1, -1):
    n = LR(s)
    part(f"side_{n}", "core", [3, 30, 13], "obsidian", centre=M((11.3, HIP + 19.0, -0.5), s), rot=(0, 0, s * 3))
    part(f"cheek_{n}", "core", [4, 12, 6], "obsidian_b", centre=M((10.0, HIP + 11.0, 6.0), s), rot=(0, s * -14, s * 5))
part("back_plate", "core", [16, 28, 2], "obsidian_b", centre=(0, HIP + 20.0, -8.6), rot=(3, 0, 0))

# the crown: a jagged top of tilted blocks
bone("crown", "core", at=(0, HIP + 40.0, 0))
part("crown_0", "crown", [15, 6, 12], "obsidian", rel=(-0.5, 1.5, -0.5), rot=(5, 12, 6))
part("crown_1", "crown", [9, 6, 8], "obsidian_b", rel=(2.0, 4.5, -1.5), rot=(-9, 34, -10))
part("crown_2", "crown", [4, 6, 4], "shard", rel=(0.5, 7.5, -1.0), rot=(12, 20, 16))
part("crown_3", "crown", [6, 4, 6], "obsidian", rel=(-5.5, 3.5, 0.5), rot=(-6, -22, 22))

# crystal shards jutting from the shoulders and back: in disguise they splay out like an outcrop
SHARDS = {  # name: (parent, root (world), size, rotation)
    "shard_l": ("core", (10.5, HIP + 30.0, -2.0), [4, 13, 4], (8, 20, -28)),
    "shard_r": ("core", (-10.5, HIP + 23.0, 1.0), [5, 10, 5], (-10, -15, 30)),
    "shard_b0": ("core", (3.0, HIP + 33.0, -7.5), [4, 11, 4], (-36, 10, -10)),
    "shard_b1": ("core", (-4.0, HIP + 26.0, -8.0), [3, 9, 3], (-48, -12, 12)),
    "shard_l2": ("core", (11.0, HIP + 16.0, 3.0), [3, 7, 3], (14, 30, -40)),
}
for nm, (par, root, size, rot) in SHARDS.items():
    part(nm, par, size, "shard", at=root, offset=(0, size[1] / 2 - 1.0, 0), rot=rot)

# ======================================================================= legs: four stubby obsidian columns, broad feet
FEET = []
for k, z in (("f", 5.0), ("b", -5.0)):
    for s in (1, -1):
        n = LR(s)
        lid = f"leg_{k}{n}"
        part(lid, "body", [8, 9.5, 8], "leg", at=M((7.5, HIP + 0.5, z), s), offset=(0, -4.75, 0))
        part(f"foot_{k}{n}", lid, [9, 2, 10], "foot", at=M((7.5, 2.0, z), s), centre=M((7.6, 1.0, z + 0.5), s))
        part(f"toe_{k}{n}", f"foot_{k}{n}", [7, 1.5, 2], "foot", centre=M((7.6, 0.75, z + 6.0), s), rot=(-10, 0, 0))
        FEET += [lid, f"foot_{k}{n}", f"toe_{k}{n}"]

# ======================================================================= the iris and the slit pupil (hand-placed rings)
def iris_art(w, h):
    """Concentric glowing rings (hot round the pupil, darker toward the limbus), radial streaks, a catchlight."""
    rows = []
    cx, cy = (w - 1) / 2, (h - 1) / 2
    for y in range(h):
        row = ""
        for x in range(w):
            dx, dy = (x - cx) / (w / 2), (y - cy) / (h / 2)
            d = math.hypot(dx, dy)
            streak = int((math.atan2(dy, dx) + math.pi) / (2 * math.pi) * 26) % 3 == 0
            t = 0 if d > 1.05 else 1 if d > 0.93 else 2 if d > 0.8 else 3 if d > 0.6 else 4 if d > 0.36 else 5
            if streak and 1 < t < 5:
                t += 1
            row += str(t)
        rows.append(row)
    for x, y, ch in ((6, 3, "W"), (7, 3, "W"), (5, 4, "W"), (6, 4, "w"), (5, 5, "w"), (8, 2, "w")):
        rows[y] = rows[y][:x] + ch + rows[y][x + 1:]
    return rows


IRIS_KEY = dict({str(k): f"eyeglow:{k}" for k in range(6)}, W="eyeglow:6", w="eyeglow:5")
PUPIL = ["_k_", "_k_", "kpk", "kpk", "kpk", "kpk", "kpk", "kpk", "kpk", "kpk", "kpk", "kpk", "kpk", "kpk", "_k_", "_k_"]

# ======================================================================= palette and paint
RAMPS = ramps(
    "eyeglow", "crying",
    # glassy obsidian: blue-black body, violet facets, cold lavender glints
    obsidian=["#04030a", "#090614", "#0f0b1e", "#161029", "#1e1635", "#271d43", "#312552", "#3d2f63", "#4b3a76",
              "#5e4c8c", "#7b6aa8", "#a497c9"],
)
light = {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.6, "ao_height": 10.0}
brush = {"flow": "long", "length": 3.0, "width": 1.0, "rough": 0.5, "overshoot": 0.3,
         "textures": {"obsidian": "crystal"}}

RIM = {"light": 1, "dark": 1, "light_shift": 2.6, "dark_shift": -1.4}
GLASS = {"id": "glass", "op": "gloss", "post": True, "dash": True, "length": 3, "inset": 1, "density": 0.5,
         "shift": 3.0}
FACETS = {"id": "facets", "op": "patches", "scale": 3.0, "threshold": 0.58, "shift": 1.4,
          "bevel": {"shadow": 1, "highlight": 1, "shadow_shift": -1.0, "highlight_shift": 1.6}}
CONCH = {"id": "conch", "op": "noise", "scale": 1.6, "amount": 0.7}
VEINS = {"id": "veins", "op": "cracks", "scale": 9.0, "width": 0.028, "threshold": 0.5, "ramp": "crying", "tone": 2.8,
         "bevel": {"shadow": 1, "highlight": 0, "shadow_ramp": "obsidian", "shadow_shift": -2.0}}
VEINS_FINE = {"id": "veins_fine", "op": "cracks", "scale": 4.0, "width": 0.02, "threshold": 0.62, "ramp": "crying",
              "tone": 1.4, "seed": 5}
POOLS = {"id": "pools", "op": "spots", "count": 1, "radius": [0.4, 0.7], "ramp": "crying", "tone": 3.4,
         "roughness": 0.6, "bevel": {"shadow": 0, "highlight": 1, "highlight_shift": 1.2}}

styles = {
    "obsidian": {"ramp": "obsidian", "tone": 4.0, "rim": RIM,
                 "layers": [CONCH, FACETS, {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.6}, VEINS,
                            VEINS_FINE, POOLS, GLASS]},
    "obsidian_b": {"ramp": "obsidian", "tone": 3.4, "rim": RIM,
                   "layers": [CONCH, dict(FACETS, seed=3), dict(VEINS, seed=7), dict(POOLS, count=2, seed=4), GLASS]},
    "plinth": {"ramp": "obsidian", "tone": 3.2, "rim": RIM,
               "layers": [CONCH, dict(FACETS, seed=8), dict(VEINS, seed=9),
                          {"id": "chips", "op": "wear", "width": 1, "density": 0.25, "shift": 2.0}, GLASS]},
    # the face plates: tears of crying obsidian running down from the eye
    "face": {"ramp": "obsidian", "tone": 4.4, "rim": RIM,
             "layers": [CONCH, dict(FACETS, seed=11), dict(VEINS, seed=12, scale=7.0), VEINS_FINE,
                        {"id": "tears", "op": "stripes", "axis": "x", "period": 4.5, "width": 0.12, "ramp": "crying",
                         "tone": 2.4, "wobble": 0.6, "faces": ["front"], "range": [-0.2, 1.0]},
                        GLASS]},
    "socket": {"ramp": "obsidian", "tone": 0.6, "light": 0.3, "rim": {"light": 0, "dark": 0}, "brush": {"off": True},
               "layers": [{"id": "rim_glow", "op": "band", "axis": "y", "from": -1.01, "to": -0.75, "ramp": "crying",
                           "tone": 1.0, "faces": ["front"]}]},
    # the eye: a big glowing violet iris, rings toward a hot rim, a catchlight
    "eye": {"ramp": "eyeglow", "tone": 3.0, "light": 0.3, "brush": {"off": True},
            "rim": {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.6},
            "stamps": [{"face": "front", "at": "top-left", "art": iris_art(24, 20), "key": IRIS_KEY}]},
    "pupil": {"ramp": "obsidian", "tone": 0.5, "light": 0, "rim": {"light": 0, "dark": 0}, "brush": {"off": True},
              "stamps": [{"face": "front", "at": "top-left", "art": PUPIL,
                          "key": {"k": "obsidian:2", "p": "obsidian:0"}}]},
    "lid": {"ramp": "obsidian", "tone": 4.6, "rim": {"light": 1, "dark": 1, "light_shift": 2.8, "dark_shift": -1.8},
            "layers": [CONCH, dict(FACETS, seed=21), dict(VEINS, seed=22, scale=5.0),
                       {"id": "lash", "op": "band", "axis": "y", "from": -1.01, "to": -0.7, "ramp": "obsidian",
                        "tone": 1.4, "faces": ["front", "sides"]}, GLASS]},
    "shard": {"ramp": "obsidian", "tone": 5.0, "rim": {"light": 1, "dark": 1, "light_shift": 3.0, "dark_shift": -1.6},
              "brush": {"flow": "y"},
              "layers": [{"id": "core", "op": "band", "axis": "x", "from": -0.3, "to": 0.3, "ramp": "crying",
                          "tone": 2.4, "faces": ["sides"], "wobble": 0.2},
                         {"id": "tip", "op": "band", "axis": "y", "from": 0.6, "to": 1.01, "shift": 2.0},
                         dict(GLASS, density=0.8)]},
    "leg": {"ramp": "obsidian", "tone": 3.6, "rim": RIM, "brush": {"flow": "y"},
            "layers": [CONCH, dict(FACETS, seed=31), dict(VEINS, seed=32), GLASS,
                       {"id": "dark_low", "op": "gradient", "axis": "y", "amount": 0.8}]},
    "foot": {"ramp": "obsidian", "tone": 3.0, "rim": RIM,
             "layers": [CONCH, {"id": "chips", "op": "wear", "width": 1, "density": 0.3, "shift": 2.0}]},
}

# ======================================================================= animation
REST = {}
LEGS = [f"leg_{k}{n}" for k in "fb" for n in "lr"]
SHUT = pos("eyelid", 0, -10.0, 0.3)


def legs(fl=(0, 0, 0), fr=(0, 0, 0), bl=(0, 0, 0), br=(0, 0, 0)):
    return add(r("leg_fl", *fl), r("leg_fr", *fr), r("leg_bl", *bl), r("leg_br", *br))


# disguised: legs folded out flat like boulders round the base, the body sunk and leaning, the eye shut, the shards
# splayed out: an obsidian outcrop
DISG = add(legs((-14, 20, -88), (-14, -20, 88), (14, -20, -88), (14, 20, 88)),
           r("body", 3, 10, -8), SHUT, sc("pupil", 0, -0.6, 0),
           r("shard_l", 0, 0, -36), r("shard_r", 0, 0, 30), r("shard_b0", -26, 0, 0), r("shard_b1", -22, 0, 0),
           r("shard_l2", 0, 0, -28), r("crown", 6, 0, -10), r("crown_1", 0, 0, 14))


def blink(t, dur=0.3):
    return keys("eyelid", None, [[0, [0, 0, 0]], [t, [0, 0, 0]], [t + dur * 0.4, [0, -10.0, 0.3]],
                                 [t + dur * 0.55, [0, -10.0, 0.3]], [t + dur, [0, 0, 0]]], ch="position")


ANIM = {}
L = 4.0
# disguised: motionless rock; only the crying veins breathe (texture) and a shard creaks once
ANIM["disguised"] = timeline(L, [(0.0, DISG, None), (L, DISG, None)], loop=True, extra=[
    keys("shard_l", "z", [[0, 0], [2.6, 0], [2.7, -1.5, "out"], [3.0, 0], [4.0, 0]]),
])

# rise: a rumble, the shards draw in, the legs unfold and push it up to full height, the lid grinds open on a stare
CROUCH = add(legs((-8, 8, -44), (-8, -8, 44), (8, -8, -44), (8, 8, 44)), r("body", -3, 4, -3), SHUT)
ANIM["rise"] = timeline(2.0, [(0.0, DISG, None), (0.45, add(DISG, r("body", 0, 0, 3)), "ease"),
                              (1.0, CROUCH, "ease"), (1.35, add(REST, SHUT, r("body", -4)), "out"),
                              (1.5, add(REST, SHUT), "ease"), (1.75, add(REST, sc("eye", 0.1, 0.1, 0)), "out"),
                              (2.0, REST, "ease")],
                        extra=[shake("body", 0.05, 0.9, 1.6, freq=11, axis=2),
                               shake("crown", 0.1, 0.9, 2.0, freq=9, axis=0),
                               ring("shard_l", 1.0, -8, freq=5, decay=5, axis=2, end=2.0),
                               ring("shard_r", 1.05, 8, freq=5, decay=5, axis=2, end=2.0)])

# idle: a slow, heavy sway; the eye roves (the pupil slides), blinks once; the shards hum
L = 3.0
ANIM["idle"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
    osc("body", "z", 1.2, 1, 0.0), osc("body", "x", -0.8, 1, 0.25),
    keys("pupil", None, [[0, [0, 0, 0]], [0.5, [0, 0, 0]], [0.7, [3.0, 0.4, 0]], [1.3, [3.0, 0.4, 0]],
                         [1.5, [-2.8, -0.5, 0]], [2.1, [-2.8, -0.5, 0]], [2.3, [0, 0, 0]]], ch="position"),
    keys("eye", "y", [[0, 0], [0.5, 0], [0.7, 6], [1.3, 6], [1.5, -6], [2.1, -6], [2.3, 0]]),
    blink(2.45),
    osc("shard_l", "z", 1.5, 2, 0.1), osc("shard_r", "z", -1.5, 2, 0.4), osc("crown", "z", 1, 1, 0.2),
])

# walk: a lumbering, rocking gait, diagonal legs together; the monolith rolls side to side and bobs
L = 2.0
ANIM["walk"] = timeline(L, [(0.0, REST, None), (L, REST, None)], loop=True, extra=[
    osc("leg_fl", "x", 22, 1, 0.0), osc("leg_br", "x", 22, 1, 0.0),
    osc("leg_fr", "x", 22, 1, 0.5), osc("leg_bl", "x", 22, 1, 0.5),
    osc("leg_fl", "z", -6, 1, 0.25, bias=-3), osc("leg_br", "z", 6, 1, 0.25, bias=3),
    osc("leg_fr", "z", 6, 1, 0.75, bias=3), osc("leg_bl", "z", -6, 1, 0.75, bias=-3),
    osc("body", "z", 4, 1, 0.0), osc("body", "y", 4, 1, 0.25), osc("body", "x", 1.5, 2, 0.1),
    osc("crown", "z", -2, 1, 0.15), osc("shard_l", "z", 3, 2, 0.2), osc("shard_r", "z", -3, 2, 0.3),
    osc("pupil", None, [0.8, 0, 0], 1, 0.3, ch="position"),
], lift=[[0, 0], [0.25, 0.8], [0.5, 0], [0.75, 0.8], [1.0, 0], [1.25, 0.8], [1.5, 0], [1.75, 0.8], [2.0, 0]])

# slam: rears back on its hind legs, the eye blazing wide, then topples forward and slams its whole front down;
# shudders, and heaves itself upright again
REAR = add(r("body", -18), legs((-48, 0, -6), (-48, 0, 6), (16, 0, 0), (16, 0, 0)), sc("eye", 0.15, 0.2, 0),
           sc("pupil", -0.3, 0, 0), r("crown", -5), r("shard_l", 0, 0, 10), r("shard_r", 0, 0, -10))
SLAM = add(r("body", 30), pos("body", 0, 0, 6.0), legs((-30, 0, -10), (-30, 0, 10), (-24, 0, 0), (-24, 0, 0)),
           sc("eye", -0.05, -0.3, 0), r("crown", 8), r("shard_l", 0, 0, -12), r("shard_r", 0, 0, 12))
ANIM["slam"] = timeline(1.2, [(0.0, REST, None), (0.18, add(REST, r("body", 4)), "ease"), (0.48, REAR, "out"),
                              (0.56, REAR, "ease"), (0.68, SLAM, "in"), (0.86, add(SLAM, r("body", -3)), "ease"),
                              (1.2, REST, "ease")],
                        extra=[shake("body", 0.68, 0.9, 2.0, freq=14, axis=2),
                               ring("crown", 0.68, 6, freq=7, decay=6, axis=0, end=1.2),
                               ring("shard_b0", 0.68, 10, freq=6, decay=5, axis=0, end=1.2),
                               ring("shard_b1", 0.7, 10, freq=6, decay=5, axis=0, end=1.2)])

# settle: the lid slides shut, the legs fold out, it sinks and leans, the shards splay: rock again
ANIM["settle"] = timeline(1.5, [(0.0, REST, None), (0.3, add(REST, SHUT), "ease"), (0.9, add(CROUCH, r("body", 2)), "ease"),
                                (1.3, add(DISG, r("body", 0, 0, -1.5)), "out"), (1.5, DISG, "ease")],
                          extra=[shake("body", 0.95, 1.3, 1.2, freq=10, axis=2)])

spec = {
    "name": "Obolisk",
    "description": "The Winterworks Obolisk: a giant one-eyed obsidian monolith on four stubby legs: glassy faceted "
                   "obsidian plates, a jagged crown, crystal shards, glowing crying-obsidian veins and tears, one big "
                   "violet eye under a sliding obsidian eyelid; in disguise it folds into an obsidian rock formation. "
                   "Minecraft pixel units, density 2: exports 1:1 to a vanilla entity model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": DENSITY,
    "budget": {"tris": 800, "colors": 64},
    "light": light,
    "brush": brush,
    "minecraft": {"fps": 20, "glow_ramps": ["eyeglow", "crying"]},
    "anim_ground_tolerance": 0.3,
    "render": {"background": "#cfcf9c", "hero": [30, 14], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "obolisk.json")
    finish(spec, out, root="body")
