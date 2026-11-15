"""Builds examples/fur_armor.json: the Polar Bear Fur armour set (Winterworks), a 3D model worn on the player.

    python examples/src/fur_armor.py examples/fur_armor.json [--preview preview.json]

A polar bear pelt made into armour: the hood is the bear's head worn over the wearer's (snout and brow over the
forehead, small ears, fur hanging at the back and sides, the face open); the coat is a thick fur mantle over the
shoulders with the bear's forepaws draped down the chest, shaggy body fur and fur sleeves with big cuffs; fur trousers;
big fur boots. Cream polar fur with cool shadows, dark leather straps. Minecraft pixel units, density 1.

Contract (mods/winterworks/docs/COLD_UPDATE.md section 2): bones head, body, right_arm, left_arm, right_leg, left_leg,
right_boot, left_boot at the vanilla player pivots (in lowpix space, Y up, facing +Z, "right" is -X). The game copies
the player's limb poses onto them, so every piece sits ~1 px outside the player's part around that pivot.
Hood = head; coat = body + both arms; leggings = both legs; boots = both boots.

--preview writes a preview-only spec that adds a plain player-sized mannequin under the armour (and a walk-ish pose
clip) to check the fit; it is not exported.
"""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import polar_bear as pb  # noqa: E402
from polar_bear import K, Rig, dumps, strands, trk  # noqa: E402

R = Rig()
P = R.P
box, card, bone = R.box, R.card, R.bone
SIDES = (("left", 1), ("right", -1))

# ------------------------------------------------------------------ the vanilla player pivots (lowpix space)
bone("head", None, [0, 24, 0], style="pelt")
bone("body", None, [0, 24, 0], style="pelt")
for side, sx in SIDES:
    bone(f"{side}_arm", None, [5 * sx, 22, 0], style="pelt")
    bone(f"{side}_leg", None, [1.9 * sx, 12, 0], style="pelt")
    bone(f"{side}_boot", None, [1.9 * sx, 12, 0], style="pelt")

C = "pelt_card"
# ------------------------------------------------------------------ hood: the bear's head worn over the wearer's
# head: x -4..4, y 24..32, z -4..4. The face (z = 4) stays open below the brow (y < 30).
box("hood_cap", "head", [11, 3, 10], [0, 33.0, -0.2], "pelt_top", hide=["bottom"])
box("hood_brow", "head", [10, 2, 2], [0, 30.9, 4.6], "hood_brow")
box("hood_snout", "head", [6, 4, 5], [0, 32.4, 6.6], "hood_snout", rot=[10, 0, 0])
box("hood_nose", "hood_snout", [4, 2, 1], [0, 0.9, 2.9], "nose", rel=True)
for side, sx in SIDES:
    box(f"hood_ear_{side}", "head", [3, 3, 2], [3.6 * sx, 34.6, -1.2], "ear", offset=[0, 1.0, 0],
        rot=[-10, -16 * sx, -22 * sx])
    box(f"hood_side_{side}", "head", [2, 8, 9], [5.25 * sx, 28.1, -0.5], "pelt", hide=["top"])
box("hood_back", "head", [10, 9, 2], [0, 27.5, -5.25], "pelt", hide=["top"])
# fur fringes on the hood rim: over the brow, down the cheeks, round the drape
card("hood_fringe_brow", "hood_brow", strands(10, 2, 61, lo=0.5, root=1), [0, -1.4, 1.15], C, plane="xy")
for side, sx in SIDES:
    card(f"hood_fringe_cheek_{side}", f"hood_side_{side}", strands(3, 9, 62 + (sx > 0), lo=0.75), [0.25 * sx, -1.0, 4.65], C,
         plane="xy", rot=[0, 0, 0])
    card(f"hood_fringe_side_{side}", f"hood_side_{side}", strands(9, 4, 64 + (sx > 0), lo=0.5), [1.05 * sx, -4.4, 0],
         C, offset=[0, -1.6, 0], rot=[0, 0, 10 * sx])
card("hood_fringe_back", "hood_back", strands(10, 5, 66, lo=0.5), [0, -4.6, -1.15], C, plane="xy", offset=[0, -2.0, 0],
     rot=[14, 0, 0])
card("hood_tuft", "hood_cap", strands(8, 3, 67, up=True, lo=0.6), [0.2, 1.6, -1.0], C, offset=[0, 0.8, 0], rot=[-12, 0, 0])

# ------------------------------------------------------------------ coat: body + arms
# body: x -4..4, y 12..24, z -2..2
box("coat_torso", "body", [10, 13, 7], [0, 17.4, 0], "pelt")
box("coat_belt", "body", [11, 2, 8], [0, 13.6, 0], "leather")
box("coat_buckle", "coat_belt", [3, 3, 1], [0, 0, 4.1], "buckle", rel=True)
# the mantle: thick fur over the shoulders, open round the head (x -4..4, z -4..4 above y 24)
for side, sx in SIDES:
    box(f"coat_mantle_{side}", "body", [5, 3, 9], [7.0 * sx, 24.0, 0], "pelt_top", rot=[0, 0, -8 * sx])
    card(f"coat_mantle_tuft_{side}", f"coat_mantle_{side}", strands(8, 3, 70 + (sx > 0), up=True, lo=0.6),
         [0.3 * sx, 1.6, 0], C, offset=[0, 0.8, 0], rot=[0, 0, -12 * sx])
    card(f"coat_mantle_fringe_{side}", f"coat_mantle_{side}", strands(9, 5, 72 + (sx > 0), lo=0.5),
         [2.65 * sx, -1.3, 0], C, offset=[0, -2.0, 0], rot=[0, 0, 12 * sx])
    # the bear's forepaws, draped down the chest, dark claws
    box(f"coat_paw_{side}", "body", [3, 6, 1], [2.6 * sx, 18.6, 4.15], "pelt", rot=[0, 0, 6 * sx])
    for k, x in enumerate((-1.1, 0, 1.1)):
        box(f"coat_claw_{side}{k}", f"coat_paw_{side}", [1, 1, 1], [x, -3.4, 0.1], "claw", rel=True)
box("coat_collar", "body", [9, 3, 2], [0, 22.2, 3.4], "pelt_top")
box("coat_mantle_back", "body", [11, 4, 2], [0, 22.8, -4.1], "pelt_top")
card("coat_fringe_collar", "coat_collar", strands(9, 3, 74, lo=0.5), [0, -1.4, 1.15], C, plane="xy", offset=[0, -1.0, 0])
card("coat_fringe_back", "coat_mantle_back", strands(11, 6, 75, lo=0.5), [0, -1.8, -1.15], C, plane="xy",
     offset=[0, -2.4, 0], rot=[8, 0, 0])
# a shaggy hem
card("coat_hem_front", "coat_torso", strands(10, 3, 76, lo=0.5), [0, -6.3, 3.65], C, plane="xy", offset=[0, -1.2, 0])
card("coat_hem_back", "coat_torso", strands(10, 4, 77, lo=0.5), [0, -6.3, -3.65], C, plane="xy", offset=[0, -1.6, 0])
for side, sx in SIDES:
    card(f"coat_hem_{side}", "coat_torso", strands(7, 4, 78 + (sx > 0), lo=0.5), [5.15 * sx, -6.3, 0], C,
         offset=[0, -1.6, 0], rot=[0, 0, 6 * sx])
# sleeves: arm x 4..8 (right: -8..-4), y 12..24, z -2..2
for side, sx in SIDES:
    arm = f"{side}_arm"
    box(f"coat_sleeve_{side}", arm, [6, 11, 6], [6.0 * sx, 18.3, 0], "pelt")
    box(f"coat_cuff_{side}", arm, [8, 3, 8], [6.0 * sx, 16.2, 0], "pelt_top")
    card(f"coat_cuff_tuft_{side}", f"coat_cuff_{side}", strands(8, 2, 80 + (sx > 0), up=True, lo=0.5, root=1),
         [4.15 * sx, 1.6, 0], C, offset=[0, 0.6, 0], rot=[0, 0, -10 * sx])
    card(f"coat_cuff_fringe_{side}", f"coat_cuff_{side}", strands(8, 3, 82 + (sx > 0), lo=0.5), [4.15 * sx, -1.4, 0],
         C, offset=[0, -1.0, 0], rot=[0, 0, 8 * sx])
    card(f"coat_sleeve_fringe_{side}", f"coat_sleeve_{side}", strands(6, 6, 84 + (sx > 0), lo=0.5),
         [3.15 * sx, 2.0, 0], C, offset=[0, -2.4, 0], rot=[0, 0, 10 * sx])

# ------------------------------------------------------------------ leggings: fur trousers
# legs: x -4..0 / 0..4, y 0..12, z -2..2
for side, sx in SIDES:
    leg = f"{side}_leg"
    # both legs are covered all round, inner faces included; the right side sits 0.1-0.15 px off the left so the overlap
    # between the legs never has two faces in one plane (no z-fighting)
    dz = 0.1 if sx < 0 else 0.0
    box(f"trousers_{side}", leg, [5, 8, 5], [2.0 * sx, 8.5 + 2 * dz, dz], "pelt")
    card(f"trousers_fringe_{side}", f"trousers_{side}", strands(5, 4, 86 + (sx > 0), lo=0.5), [2.65 * sx, -2.6, 0], C,
         offset=[0, -1.6, 0], rot=[0, 0, 8 * sx])
    card(f"trousers_knee_{side}", f"trousers_{side}", strands(5, 3, 88 + (sx > 0), lo=0.5), [0, -2.6, 2.65], C,
         plane="xy", offset=[0, -1.0, 0], rot=[-8, 0, 0])

# ------------------------------------------------------------------ boots: big fur boots, y 0..5, ~1 px wider than the legs
for side, sx in SIDES:
    bt = f"{side}_boot"
    dz = 0.15 if sx < 0 else 0.0
    box(f"boot_{side}", bt, [6, 5, 6], [2.0 * sx, 2.5, dz], "boot")
    box(f"boot_toe_{side}", bt, [4, 2, 3], [2.25 * sx, 1.25, 3.6 + dz], "boot_toe")
    box(f"boot_cuff_{side}", bt, [7, 2, 7], [2.0 * sx, 5.8 + 0.7 * dz, dz], "pelt_top")
    card(f"boot_tuft_{side}", f"boot_cuff_{side}", strands(7, 3, 90 + (sx > 0), up=True, lo=0.5, root=1),
         [3.65 * sx, 1.4, 0], C, offset=[0, 0.8, 0], rot=[0, 0, -10 * sx])
    card(f"boot_tuft_front_{side}", f"boot_cuff_{side}", strands(7, 2, 92 + (sx > 0), up=True, lo=0.5, root=1),
         [0, 1.4, 3.65], C, plane="xy", offset=[0, 0.6, 0], rot=[-10, 0, 0])
    card(f"boot_fringe_{side}", f"boot_cuff_{side}", strands(7, 3, 94 + (sx > 0), lo=0.5), [3.65 * sx, -1.4, 0], C,
         offset=[0, -1.0, 0], rot=[0, 0, 8 * sx])

# ------------------------------------------------------------------ paint
RAMPS = {
    "fur": pb.RAMPS["fur"],
    "skin": pb.RAMPS["skin"],
    "claw": pb.RAMPS["claw"],
    "eye": pb.RAMPS["eye"],
    "leather": ["#120c09", "#1c130e", "#271a12", "#332318", "#402d1f", "#4e3827", "#5e4430", "#6e513a"],
    "bone": pb.RAMPS["bone"],
}


def styles():
    st = pb.styles_for("base")
    hair = {"id": "hair", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.26, "shift": -1.5, "wobble": 0.5,
            "faces": ["left", "right"]}
    hair_x = dict(hair, id="hair_x", axis="x", faces=["front", "back"])
    shine = {"id": "shine", "op": "stripes", "axis": "x", "period": 2.1, "width": 0.2, "phase": 0.45, "shift": 1.1,
             "wobble": 0.6, "faces": ["front", "back", "top"]}
    clumps = {"id": "clumps", "op": "patches", "scale": 1.3, "threshold": 0.64, "shift": -0.9}
    noise = {"id": "noise", "op": "speckle", "density": 0.05, "shift": -1.2}
    coat = [{"id": "under", "op": "gradient", "axis": "y", "amount": 1.8}, clumps, hair, hair_x, shine, noise]
    leather_band = {"id": "strap", "op": "band", "axis": "y", "from": -0.2, "to": 0.25, "ramp": "leather", "tone": 3.4,
                    "faces": ["sides"], "bevel": {"highlight": 1, "shadow": 0, "highlight_shift": 1.2}}
    return {
        "pelt": {"ramp": "fur", "tone": 10.0, "brush": {"flow": "y", "length": 2.6, "rough": 0.75}, "layers": coat},
        "pelt_top": {"ramp": "fur", "tone": 10.8, "brush": {"flow": "y", "length": 2.4, "rough": 0.8},
                     "layers": [dict(coat[0], amount=1.4)] + coat[1:]},
        "pelt_card": dict(st["fur_card"], tone=10.0, art_key={"h": "fur:12", "d": "fur:4"}),
        "hood_brow": {"ramp": "fur", "tone": 10.2, "rim": {"light_shift": 1.2, "dark_shift": -1.6}, "layers": [
            {"id": "under", "op": "fill", "shift": -3.0, "faces": ["bottom"]}], "stamps": [
            # the pelt's eyes (dark and dull), either side of the snout
            {"face": "front", "at": "top-left", "art": ["..........", ".e......e."], "key": {"e": "eye:1"}}]},
        "hood_snout": {"ramp": "fur", "tone": 10.4, "brush": {"length": 1.8}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6},
            {"id": "lip", "op": "band", "axis": "y", "from": -1.0, "to": -0.6, "ramp": "skin", "tone": 2.4,
             "faces": ["front"]}]},
        "nose": st["nose"],
        "ear": {"ramp": "fur", "tone": 10.0, "brush": {"off": True}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.4}], "stamps": [
            {"face": "front", "at": "top-left", "art": [".d."], "key": {"d": "fur:9"}}]},
        "claw": st["claw"],
        "leather": {"ramp": "leather", "tone": 3.6, "brush": {"flow": "x", "length": 2.0}, "rim": {"light_shift": 1.2},
                    "layers": [{"id": "stitch", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.25, "shift": 1.4,
                                "faces": ["front", "back"], "range": [-0.5, 0.5]}]},
        "buckle": {"ramp": "bone", "tone": 5.4, "brush": {"off": True}, "stamps": [
            {"face": "front", "at": "top-left", "art": ["hh", "h."], "key": {"h": "bone:7"}}]},
        "boot": {"ramp": "fur", "tone": 9.4, "brush": {"flow": "y", "length": 2.0}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6}, clumps, hair, hair_x, noise,
            leather_band,
            {"id": "sole", "op": "band", "axis": "y", "from": -1.0, "to": -0.62, "ramp": "leather", "tone": 1.6,
             "faces": ["sides"]},
            {"id": "sole_bottom", "op": "fill", "ramp": "leather", "tone": 1.2, "faces": ["bottom"]}]},
        "boot_toe": {"ramp": "fur", "tone": 9.2, "brush": {"flow": "y", "length": 2.0}, "layers": [
            {"id": "under", "op": "gradient", "axis": "y", "amount": 1.2}, hair_x,
            {"id": "sole", "op": "band", "axis": "y", "from": -1.0, "to": -0.1, "ramp": "leather", "tone": 1.6,
             "faces": ["sides", "front"]},
            {"id": "sole_bottom", "op": "fill", "ramp": "leather", "tone": 1.2, "faces": ["bottom"]}]},
        # the mannequin (preview only)
        "skin": {"ramp": "leather", "tone": 6.0, "light": 0.6, "brush": {"off": True}},
        "shirt": {"ramp": "eye", "tone": 3.0, "light": 0.6, "brush": {"off": True}},
    }


spec = {
    "name": "Fur Armor",
    "description": "The Polar Bear Fur armour (Winterworks), worn on the vanilla player model: a bear-head hood with "
                   "snout, brow and ears, a thick fur mantle with the bear's forepaws draped down the chest, shaggy "
                   "sleeves with big cuffs, fur trousers and big fur boots, cream fur with dark leather straps. Bones at "
                   "the vanilla player pivots. Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 1200, "colors": 64},
    "light": pb.LIGHT,
    "brush": pb.BRUSH,
    "minecraft": {"fps": 12},
    "render": {"background": "#28303c", "hero": [-32, 14], "shadow": 0.5},
    "palette": {"ramps": RAMPS},
    "styles": styles(),
    "parts": P,
    "animations": {"idle": {"length": 1.0, "loop": True, "tracks": []}},
}


def preview_spec():
    """The armour on a plain player-sized mannequin (scratch only), with a walk-ish pose clip for checking the fit."""
    out = copy.deepcopy(spec)
    out["name"] = "Fur Armor On Mannequin"
    out["parts"] = out["parts"] + [
        {"id": "m_head", "parent": "head", "shape": "box", "size": [8, 8, 8], "pivot": [0, 4, 0], "style": "skin"},
        {"id": "m_body", "parent": "body", "shape": "box", "size": [8, 12, 4], "pivot": [0, -6, 0], "style": "shirt"},
        {"id": "m_arm_r", "parent": "right_arm", "shape": "box", "size": [4, 12, 4], "pivot": [-1, -4, 0], "style": "skin"},
        {"id": "m_arm_l", "parent": "left_arm", "shape": "box", "size": [4, 12, 4], "pivot": [1, -4, 0], "style": "skin"},
        {"id": "m_leg_r", "parent": "right_leg", "shape": "box", "size": [4, 12, 4], "pivot": [-0.1, -6, 0], "style": "shirt"},
        {"id": "m_leg_l", "parent": "left_leg", "shape": "box", "size": [4, 12, 4], "pivot": [0.1, -6, 0], "style": "shirt"},
    ]
    swing = 30
    out["animations"] = {"pose": {"length": 1.0, "loop": True, "tracks": [
        trk("head", K((0, [-12, 25, 0])), channel="rotation"),
        trk("right_arm", K((0, [-swing, 0, 0]))), trk("left_arm", K((0, [swing, 0, 0]))),
        trk("right_leg", K((0, [swing, 0, 0]))), trk("left_leg", K((0, [-swing, 0, 0]))),
        trk("right_boot", K((0, [swing, 0, 0]))), trk("left_boot", K((0, [-swing, 0, 0]))),
    ]}, "raise": {"length": 1.0, "loop": True, "tracks": [
        trk("head", K((0, [20, -30, 0]))),
        trk("right_arm", K((0, [-90, 0, 0]))), trk("left_arm", K((0, [-40, 0, -30]))),
    ]}}
    out["grounded"] = False
    return out


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples/fur_armor.json"
    with open(out, "w") as fh:
        fh.write(dumps(spec))
    print(out, len(P), "parts")
    if "--preview" in sys.argv:
        pv = sys.argv[sys.argv.index("--preview") + 1]
        with open(pv, "w") as fh:
            fh.write(dumps(preview_spec()))
        print(pv, "(preview with mannequin)")
