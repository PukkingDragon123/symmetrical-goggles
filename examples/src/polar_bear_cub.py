"""Builds examples/polar_bear_cub.json: the Winterworks polar bear cub (its own fluffy model, not a shrunken adult).

    python examples/src/polar_bear_cub.py examples/polar_bear_cub.json

A round, fluffy cub: a barrel body, a big round head with a short muzzle and dark eyes, small round ears, short
thick legs on big paws, a stub tail, short fluffy fur tufts (alpha-cut cards). Cream fur with cool blue-grey
shadows. Drawn at about twice its in-game size, like the Icebreaker cub (render it at ~0.55 scale). Minecraft pixel
units, density 1, faces +Z, ground at y=0. Uses the adult's rig helpers and leg IK (examples/src/polar_bear.py).

Contract (mods/winterworks/docs/COLD_UPDATE.md section 3): bones body, neck, head, jaw, ear_l, ear_r, front_leg_l,
front_leg_r, back_leg_l, back_leg_r, tail, mouth_item. No fur_* or zombie_* parts (the cub's tufts are fluff_*).
Clips: idle, walk, run, swim, eat, sit, shake.
"""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polar_bear as pb  # noqa: E402
from polar_bear import K, Leg, Rig, bake, delayed, dumps, gait, keyed, mr, mx, osc, paddle, planted, strands, trk  # noqa: E402,E501

R = Rig()
P, W = R.P, R.W
box, card, bone = R.box, R.card, R.bone
SIDES = pb.SIDES

# ------------------------------------------------------------------ a round fluffy body
# body is the root; its pivot sits near the hips so sitting back turns on the hind legs
box("body", None, [14, 12, 15], [0, 12, -4], "fluff", offset=[0, 0, 4])
box("rump", "body", [12, 10, 5], [0, 12, -7], "fluff", offset=[0, -0.4, -2], rot=[-12, 0, 0])
box("chest", "body", [13, 10, 4], [0, 12, 7], "fluff", offset=[0, -0.6, 1.4], rot=[8, 0, 0])
box("back_top", "body", [12, 2, 12], [0, 18.4, 0], "fluff_top", rot=[-3, 0, 0])
box("belly", "body", [11, 2, 12], [0, 5.6, 0.5], "fluff_under")
box("tail", "rump", [3, 3, 3], [0, 13.2, -11.6], "fluff_top", offset=[0, 0, -1.0], rot=[-30, 0, 0])
box("neck", "body", [10, 8, 5], [0, 15, 7], "fluff", offset=[0, 0.5, 2], rot=[-10, 0, 0])

# ------------------------------------------------------------------ a big round head, short muzzle, dark eyes
box("head", "neck", [12, 10, 10], [0, 15.6, 10], "head", offset=[0, 2, 4], rot=[5, 0, 0])
box("snout", "head", [6, 4, 4], [0, 15.6, 18.6], "muzzle", offset=[0, 0, 2], rot=[8, 0, 0])
box("nose", "snout", [4, 2, 1], [0, 1.2, 4.1], "nose", rel=True)
box("jaw", "head", [5, 2, 4], [0, 13.5, 17.6], "jaw", offset=[0, -0.5, 2], rot=[8, 0, 0])
bone("mouth_item", "jaw", [0, 0.5, 3.0], style="fluff")
for s, sx in SIDES:
    box(f"eye_{s}", "head", [2, 2, 1], mx([3.1, 18.6, 18.9], sx), "eye", rot=mr([5, 8, 0], sx))
    box(f"ear_{s}", "head", [3, 3, 2], mx([4.6, 21.8, 12.6], sx), "ear", offset=[0, 1.0, 0], rot=mr([-10, -20, -24], sx))
    box(f"cheek_{s}", "head", [2, 5, 6], mx([5.7, 15.6, 15.0], sx), "head", rot=mr([4, 8, 6], sx))

# ------------------------------------------------------------------ short thick legs, big paws
for s, sx in SIDES:
    fl, ff, fp = f"front_leg_{s}", f"front_forearm_{s}", f"front_paw_{s}"
    box(fl, "body", [5, 6, 5], mx([4.6, 10.0, 4.5], sx), "leg", offset=mx([0.3, -2.4, 0], sx), rot=mr([0, 0, -3], sx))
    box(ff, fl, [5, 4, 5], mx([4.8, 5.6, 4.6], sx), "leg", offset=[0, -1.5, 0.2])
    box(fp, ff, [6, 3, 7], mx([4.8, 2.4, 4.9], sx), "paw", offset=[0, -0.9, 1.6], snap_ground=0.0)
    for k, x in enumerate((-1.6, 0, 1.6)):
        box(f"front_claw_{s}{k}", fp, [1, 1, 1], [x, -1.8, 5.1], "claw", rel=True)
    bl, bs, bp = f"back_leg_{s}", f"back_shin_{s}", f"back_paw_{s}"
    box(bl, "body", [6, 7, 7], mx([4.4, 10.5, -6.0], sx), "leg", offset=mx([0.3, -2.4, -0.3], sx), rot=mr([0, 0, -3], sx))
    box(bs, bl, [5, 4, 5], mx([4.8, 5.5, -6.5], sx), "leg", offset=[0, -1.4, 0.3])
    box(bp, bs, [6, 3, 8], mx([4.8, 2.4, -6.3], sx), "paw", offset=[0, -0.9, 1.9], snap_ground=0.0)
    for k, x in enumerate((-1.6, 0, 1.6)):
        box(f"back_claw_{s}{k}", bp, [1, 1, 1], [x, -1.8, 5.9], "claw", rel=True)

# ------------------------------------------------------------------ fluff: short tufts sticking out all over
F = "fluff_card"
card("fluff_crown", "head", strands(7, 4, 41, up=True, lo=0.6), [0.2, 7.0, 3.6], F, offset=[0, 1.0, 0], rot=[-14, 0, 0])
card("fluff_back", "back_top", strands(11, 4, 42, up=True, lo=0.55), [0.3, 1.0, 0.0], F, offset=[0, 1.2, 0], rot=[-8, 0, 0])
card("fluff_back_side", "back_top", strands(10, 3, 43, up=True, lo=0.6), [3.6, 0.9, 0.5], F, offset=[0, 1.0, 0],
     rot=[-6, 0, -28], mirror=True)
card("fluff_side", "body", strands(13, 5, 44, lo=0.6), [6.8, -4.6, 4.0], F, offset=[0, -2.0, 0], rot=[0, 0, 20], mirror=True)
card("fluff_belly", "belly", strands(10, 3, 45, lo=0.6), [2.6, -0.8, 0], F, offset=[0, -1.2, 0], rot=[0, 0, 8], mirror=True)
card("fluff_chest", "chest", strands(10, 5, 46, lo=0.6), [0, -2.6, 2.2], F, plane="xy", offset=[0, -2.0, 0], rot=[-12, 0, 0])
card("fluff_neck", "neck", strands(5, 4, 47, lo=0.6), [5.1, 0.5, 2.0], F, offset=[0, -1.4, 0], rot=[0, 0, 20], mirror=True)
card("fluff_rump", "rump", strands(10, 4, 48, lo=0.6), [0, -1.5, -2.6], F, plane="xy", offset=[0, -1.6, 0], rot=[14, 0, 0])
card("fluff_tail", "tail", strands(4, 4, 49, up=True, lo=0.6), [0.2, 0.8, -1.0], F, offset=[0, 1.0, 0], rot=[-20, 0, 0])
for s, sx in SIDES:
    card(f"fluff_cheek_{s}", f"cheek_{s}", strands(5, 4, 50 + (sx > 0), lo=0.6), mx([0.9, -1.8, -0.5], sx), F,
         offset=[0, -1.4, 0], rot=mr([0, 0, 16], sx))
    card(f"fluff_elbow_{s}", f"front_leg_{s}", strands(4, 5, 52 + (sx > 0), lo=0.6), mx([0.3, -2.4, -2.6], sx), F,
         offset=[0, -1.6, 0], rot=[-14, 0, 0])
    card(f"fluff_thigh_{s}", f"back_leg_{s}", strands(5, 5, 54 + (sx > 0), lo=0.6), mx([0.3, -2.0, -3.9], sx), F,
         offset=[0, -1.6, 0], rot=[-12, 0, 0])

# ------------------------------------------------------------------ paint: whiter and fluffier than the adult
RAMPS = copy.deepcopy(pb.RAMPS)
RAMPS["white"] = ["#9aa3ab", "#c5ccd1", "#e9eef0", "#ffffff"]


def styles():
    st = pb.styles_for("base")
    fluff = {"id": "fluff", "op": "patches", "scale": 1.1, "threshold": 0.6, "shift": 0.9}
    dents = {"id": "dents", "op": "patches", "scale": 1.3, "threshold": 0.66, "shift": -1.0}
    hair = {"id": "hair", "op": "stripes", "axis": "z", "period": 1.4, "width": 0.24, "shift": -1.2, "wobble": 0.7,
            "faces": ["left", "right"]}
    hair_x = dict(hair, id="hair_x", axis="x", faces=["front", "back", "top"])
    coat = [{"id": "under", "op": "gradient", "axis": "y", "amount": 2.4}, fluff, dents, hair, hair_x,
            {"id": "noise", "op": "speckle", "density": 0.04, "shift": -1.0}]
    out = {
        "fluff": {"ramp": "fur", "tone": 10.6, "layers": coat},
        "fluff_top": {"ramp": "fur", "tone": 11.4, "layers": [dict(coat[0], amount=1.6)] + coat[1:]},
        "fluff_under": {"ramp": "fur", "tone": 9.4, "layers": [dict(coat[0], amount=1.6)] + coat[1:]},
        "head": {"ramp": "fur", "tone": 11.2, "layers": [dict(coat[0], amount=2.0)] + coat[1:]},
        "leg": dict(st["leg"], tone=10.0),
        "paw": st["paw"],
        "claw": st["claw"],
        "muzzle": {"ramp": "fur", "tone": 11.0, "brush": {"length": 1.6}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6},
            {"id": "lip", "op": "band", "axis": "y", "from": -1.0, "to": -0.7, "ramp": "skin", "tone": 1.6,
             "faces": ["sides", "front"]}]},
        "nose": {"ramp": "skin", "tone": 1.6, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "bottom", "art": ["n..n"], "key": {"n": "skin:0"}},
            {"face": "front", "at": "top-left", "art": [".h.."], "key": {"h": "skin:5"}}]},
        "jaw": {"ramp": "fur", "tone": 10.0, "layers": [
            {"id": "chin", "op": "gradient", "axis": "y", "amount": 1.2},
            {"id": "tongue", "op": "fill", "ramp": "mouth", "tone": 3.0, "faces": ["top"]}]},
        # dark eyes with a lighter lower rim and one small catchlight: alive, not cartoon
        "eye": {"ramp": "eye", "tone": 0.6, "light": 0, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "top-left", "art": ["h.", ".b"], "key": {"h": "white:1", "b": "eye:3"}}]},
        "ear": {"ramp": "fur", "tone": 10.4, "brush": {"off": True}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2}], "stamps": [
            {"face": "front", "at": "top-left", "art": ["_._", ".d.", "..."], "key": {"d": "fur:10"}},
            {"face": "back", "at": "top-left", "art": ["_._"]}]},
        "fluff_card": dict(st["fur_card"], tone=10.4, art_key={"h": "fur:13", "d": "fur:5"}),
        "mouth": st["mouth"],
    }
    return out


# ------------------------------------------------------------------ clips
LEGS = {"fl": Leg("front_leg_l", "front_forearm_l", "front_paw_l", -1, 1),
        "fr": Leg("front_leg_r", "front_forearm_r", "front_paw_r", -1, -1),
        "bl": Leg("back_leg_l", "back_shin_l", "back_paw_l", 1, 1),
        "br": Leg("back_leg_r", "back_shin_r", "back_paw_r", 1, -1)}
STAND = {k: planted() for k in LEGS}
FLUFF = ["fluff_side", "fluff_belly", "fluff_neck", "fluff_cheek_l", "fluff_cheek_r"]


def fluff_sway(amp, cycles, phase=0.0, axis="z"):
    return [osc(p, amp * (1 + 0.15 * k), cycles, phase + 0.07 * k, axis=axis) for k, p in enumerate(FLUFF)]


def clips():
    C = {}
    # idle: puffy breathing, curious head tilts, a sniff, ear wiggles, a little tail wag
    C["idle"] = ({"length": 3.0, "loop": True, "tracks": [
        osc("back_top", [0.03, 0.08, 0.02], 2, channel="scale"),
        osc("belly", [0.05, 0.1, 0.03], 2, channel="scale", phase=0.1),
        osc("body", [0.25, 0.15, 0], 1, channel="position", phase=0.25),
        trk("head", K((0, 0), (0.5, 0), (0.7, 16, "out_back"), (1.2, 16), (1.4, 0), (2.0, 0), (2.2, -12, "out_back"),
                      (2.6, -12), (2.8, 0)), axis="z"),
        trk("neck", K((0, 0), (1.4, 0), (1.6, -12, "out"), (1.9, -12), (2.1, 0)), axis="x"),
        trk("neck", K((0, 0), (0.6, 10), (1.3, 10), (1.6, -6), (2.4, -8), (2.9, 0)), axis="y"),
        trk("nose", K((0, [0, 0, 0]), (1.6, [0, 0, 0]), (1.66, [0.3, 0.3, 0]), (1.74, [0, 0, 0]), (1.82, [0.3, 0.3, 0]),
                      (1.9, [0, 0, 0])), channel="scale"),
        trk("ear_l", K((0, 0), (0.75, 0), (0.82, -26, "out"), (0.95, 8), (1.1, 0)), axis="z"),
        trk("ear_r", K((0, 0), (2.25, 0), (2.32, 26, "out"), (2.45, -8), (2.6, 0)), axis="z"),
        osc("tail", 14, 3, axis="y"),
    ] + fluff_sway(3, 2)}, STAND)

    # walk: a bouncy, slightly clumsy waddle
    T = 0.9
    C["walk"] = ({"length": T, "loop": True, "tracks": [
        osc("body", [0, 0.45, 0], 2, channel="position", bias=[0, -0.4, 0]),
        osc("body", 4, 1, axis="z", phase=0.25),
        osc("body", 2, 1, axis="y"),
        osc("neck", -4, 2, axis="x", phase=0.15),
        osc("head", -5, 1, axis="z", phase=0.35),
        osc("ear_l", 10, 2, axis="x", phase=0.3),
        osc("ear_r", 10, 2, axis="x", phase=0.3),
        osc("tail", 16, 1, axis="y", phase=0.4),
        osc("belly", [0.05, -0.1, 0.03], 2, channel="scale", phase=0.2),
    ] + fluff_sway(6, 2, 0.1)}, {
        "bl": gait(T, 0.0, 0.6, 6.0, 1.8, curl=30, toe=6.5, heel=1.8),
        "fl": gait(T, 0.25, 0.6, 6.0, 2.0, curl=40, toe=6.0, heel=1.8),
        "br": gait(T, 0.5, 0.6, 6.0, 1.8, curl=30, toe=6.5, heel=1.8),
        "fr": gait(T, 0.75, 0.6, 6.0, 2.0, curl=40, toe=6.0, heel=1.8)})

    # run: a bounding scamper, front pair then hind pair, ears flopping
    T = 0.5
    C["run"] = ({"length": T, "loop": True, "tracks": [
        osc("body", [0, 1.0, 0], 1, channel="position", phase=0.15, bias=[0, 0.2, 0]),
        osc("body", 7, 1, axis="x"),
        osc("neck", -7, 1, axis="x", phase=0.2),
        osc("head", -4, 1, axis="x", phase=0.3),
        osc("ear_l", 18, 1, axis="x", phase=0.35, bias=-6),
        osc("ear_r", 18, 1, axis="x", phase=0.35, bias=-6),
        osc("tail", 20, 1, axis="x", phase=0.2),
        osc("belly", [0.06, -0.12, 0.04], 1, channel="scale", phase=0.3),
    ] + fluff_sway(10, 1, 0.2, axis="x")}, {
        "bl": gait(T, 0.0, 0.42, 10.0, 3.0, curl=45, reach=18, toe=7.0, heel=1.8),
        "br": gait(T, 0.06, 0.42, 10.0, 3.0, curl=45, reach=18, toe=7.0, heel=1.8),
        "fl": gait(T, 0.5, 0.4, 10.0, 3.4, curl=55, reach=20, toe=6.5, heel=1.8),
        "fr": gait(T, 0.56, 0.4, 10.0, 3.4, curl=55, reach=20, toe=6.5, heel=1.8)})

    # swim: afloat, paddling fast, nose up
    T = 1.2
    C["swim"] = ({"length": T, "loop": True, "tracks": [
        osc("body", [0, 0.5, 0], 2, channel="position", bias=[0, 3.5, 0]),
        osc("body", 2, 2, axis="x", bias=-8),
        osc("body", 4, 1, axis="z", phase=0.25),
        osc("neck", 3, 2, axis="x", bias=-10, phase=0.1),
        osc("head", 4, 1, axis="z", phase=0.5),
        trk("ear_l", K((0, -14)), axis="x"), trk("ear_r", K((0, -14)), axis="x"),
        osc("tail", 10, 2, axis="y"),
    ] + [osc(p, 6, 2, 0.08 * k, axis="x", bias=-20) for k, p in enumerate(FLUFF)]}, {
        "fl": paddle(T, 0.0, [0, 5.5, 2.0], 3.0, 2.0, 15, 20), "fr": paddle(T, 0.5, [0, 5.5, 2.0], 3.0, 2.0, 15, 20),
        "bl": paddle(T, 0.25, [0, 5.0, -1.5], 2.6, 1.6, 20, 20), "br": paddle(T, 0.75, [0, 5.0, -1.5], 2.6, 1.6, 20, 20)})

    # eat (1.0 s): nose down to the fish, eager little chomps
    L = 1.0
    C["eat"] = ({"length": L, "loop": False, "tracks": [
        trk("body", K((0, 0), (0.15, 6, "out"), (0.85, 6), (1.0, 0)), axis="x"),
        trk("neck", K((0, 0), (0.18, 24, "out_back"), (0.85, 22), (1.0, 0)), axis="x"),
        trk("head", K((0, 0), (0.18, 14), (0.28, 8), (0.36, 15), (0.48, 8), (0.56, 15), (0.68, 8), (0.76, 15), (0.88, 12),
                      (1.0, 0)), axis="x"),
        trk("head", K((0, 0), (0.3, 6), (0.55, -6), (0.8, 5), (1.0, 0)), axis="z"),
        trk("jaw", K((0, 0), (0.2, 4), (0.28, 22), (0.36, 2), (0.48, 22), (0.56, 2), (0.68, 20), (0.76, 2), (1.0, 0)),
            axis="x"),
        trk("ear_l", K((0, 0), (0.3, -12), (0.5, 6), (0.7, -12), (1.0, 0)), axis="x"),
        trk("ear_r", K((0, 0), (0.35, -12), (0.55, 6), (0.75, -12), (1.0, 0)), axis="x"),
        osc("tail", 18, 4, axis="y"),
    ]}, STAND)

    # sit (loop): plopped on its bottom, hind legs out in front, front paws together, a curious head tilt
    L = 3.0
    C["sit"] = ({"length": L, "loop": True, "tracks": [
        osc("body", 1.0, 2, axis="x", bias=-34),
        trk("body", K((0, [0, -2.6, -1.0])), channel="position"),
        osc("back_top", [0.03, 0.08, 0.02], 2, channel="scale"),
        osc("belly", [0.05, 0.1, 0.03], 2, channel="scale", phase=0.1),
        osc("neck", 1.5, 2, axis="x", bias=22),
        trk("head", K((0, 0), (0.6, 0), (0.85, 18, "out_back"), (1.6, 18), (1.85, 0), (2.2, 0), (2.4, -10, "out_back"),
                      (2.75, -10), (2.95, 0)), axis="z"),
        trk("head", K((0, -6)), axis="x"),
        trk("ear_l", K((0, 0), (0.9, 0), (0.97, -24, "out"), (1.1, 6), (1.25, 0)), axis="z"),
        trk("ear_r", K((0, 0), (2.45, 0), (2.52, 24, "out"), (2.65, -6), (2.8, 0)), axis="z"),
        trk("tail", K((0, 40)), axis="x"),
    ]}, {
        "fl": lambda t, sx: ([-1.2 * sx, 0.0, -0.5], 0.0), "fr": lambda t, sx: ([-1.2 * sx, 0.0, -0.5], 0.0),
        "bl": lambda t, sx: ([1.6 * sx, 0.8, 6.5], -55.0), "br": lambda t, sx: ([1.6 * sx, 0.8, 6.5], -55.0)})

    # shake (0.7 s): a wobbly whole-body shake, the fluff flying
    L = 0.7
    roll = K((0, 0), (0.05, -6, "out"), (0.12, 16), (0.21, -18), (0.30, 16), (0.39, -13), (0.48, 9), (0.57, -4), (0.64, 1.5),
             (0.7, 0))
    C["shake"] = ({"length": L, "loop": False, "tracks": [
        trk("body", roll, axis="z"),
        trk("neck", delayed(roll, 0.02, -0.6, L), axis="y"),
        trk("head", delayed(roll, 0.04, 1.1, L), axis="z"),
        trk("ear_l", delayed(roll, 0.07, 2.4, L), axis="z"),
        trk("ear_r", delayed(roll, 0.07, 2.4, L), axis="z"),
        trk("tail", delayed(roll, 0.08, 2.0, L), axis="y"),
        trk("jaw", K((0, 0), (0.12, 10), (0.5, 8), (0.7, 0)), axis="x"),
    ] + [trk(p, delayed(roll, 0.05 + 0.02 * k, 1.8, L), axis="z") for k, p in enumerate(FLUFF)]}, STAND)
    return C


spec = {
    "name": "Polar Bear Cub",
    "description": "The Winterworks polar bear cub: its own round, fluffy model with a big head, short muzzle, dark eyes, "
                   "small round ears, short thick legs on big paws and fluffy tufts (cards). Cream fur with cool shadows. "
                   "Minecraft pixel units at about twice its in-game size, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 1200, "colors": 64},
    "light": pb.LIGHT,
    "brush": pb.BRUSH,
    "minecraft": {"fps": 24},
    "anim_ground_tolerance": 0.5,
    "render": {"background": "#28303c", "hero": [-38, 18], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles(),
    "parts": P,
    "animations": {},
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/polar_bear_cub.json"
    spec["animations"] = bake(spec, clips(), LEGS)
    with open(out, "w") as fh:
        fh.write(dumps(spec))
    print(out, len(P), "parts")
