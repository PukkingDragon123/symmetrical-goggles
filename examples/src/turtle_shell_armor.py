"""Builds examples/turtle_shell_armor.json (the Turtle Shell chestplate, worn) and examples/turtle_shell_retreat.json
(the closed shell of the Retreat pose). Winterworks, Tides & Treasures.

    python examples/src/turtle_shell_armor.py [armor.json [retreat.json]]

The chestplate is a real turtle shell: on the back a domed carapace in three stepped layers (the ring of small
marginal scutes, the costal scutes, the ridged row of vertebral scutes), green-olive plates divided by pale seams,
its rim flaring out over the hips and round the flanks behind the arms; on the chest the flat cream plastron, split
by a seam down the middle and seams across. The retreat model is the same shell closed on the ground: a low dome on a
flat plastron, dark openings at the front, back and legs, and in the front opening the wearer's two round eyes
peeking out.

Units are Minecraft pixels, density 2.

turtle_shell_armor: bones carapace and plastron, both roots with their pivot at the vanilla body's pivot (lowpix
(0, 24, 0) = Minecraft model (0, 0, 0)); the body box is x -4..4, y 12..24 (lowpix), z -2..2. Draw it in a Fabric
ArmorRenderer for turtle_shell_chestplate after `contextModel.body.translateAndRotate(pose)`, so it follows the body
(crouching included); nothing sits where the arms swing (x beyond +-4 only behind z = -2). Clip: idle (empty).

turtle_shell_retreat: bones shell (root, on the ground at the entity's feet), carapace and plastron (its children).
Clips: idle (4 s loop: the shell breathes), hit (0.4 s: it rocks and settles when a blocked hit lands).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, osc, ring  # noqa: E402
from ocean_kit import RAMPS  # noqa: E402

ramps = {k: RAMPS[k] for k in ("carapace", "seam", "plastron", "skin", "sclera", "iris")}
RIM = {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.4, "outline": "dark"}
GRAIN = {"id": "grain", "op": "noise", "scale": 0.8, "amount": 0.6}


def seams(axis, period, faces, width=0.14, phase=0.0):
    return {"id": f"seams_{axis}_{'_'.join(faces)}", "op": "stripes", "axis": axis, "period": period, "width": width,
            "phase": phase, "ramp": "seam", "tone": 2.2, "faces": faces}


def scutes(size, stagger=True, tone=4.0, faces=None):
    """Horny plates: each scute lit at its top, a dark seam under it, a pale lip, a slightly different tone each."""
    layer = {"id": "scutes", "op": "scales", "along": "x", "size": list(size), "shape": "square", "gap": 0.5,
             "stagger": stagger, "ramp": "carapace", "tone": tone, "gradient": 1.8, "highlight": 1.3,
             "shadow": -3.0, "jitter": 0.7}
    if faces:
        layer["faces"] = faces
    return layer


styles = {
    # the marginal ring: small square scutes
    "marginal": {"ramp": "carapace", "tone": 3.6, "rim": RIM, "brush": {"off": True},
                 "layers": [GRAIN, scutes((2.0, 2.0), False, 3.6)]},
    # the costal scutes: big plates either side of the spine
    "costal": {"ramp": "carapace", "tone": 4.2, "rim": RIM, "brush": {"off": True},
               "layers": [GRAIN, scutes((4.25, 3.5), True, 4.2)]},
    # the vertebral row along the spine: three plates, a keel down the middle
    "vertebral": {"ramp": "carapace", "tone": 4.8, "rim": RIM, "brush": {"off": True},
                  "layers": [GRAIN, scutes((5.0, 8.0 / 3.0), False, 4.8),
                             {"id": "keel", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "shift": 0.8,
                              "faces": ["back"]}]},
    "plastron": {"ramp": "plastron", "tone": 3.4, "rim": RIM, "brush": {"flow": "x"},
                 "layers": [GRAIN, {"id": "midline", "op": "band", "axis": "x", "from": -0.07, "to": 0.07,
                                    "ramp": "seam", "tone": 1.0, "faces": ["front"]},
                            {"id": "across", "op": "stripes", "axis": "y", "period": 2.6, "width": 0.13, "phase": 0.2,
                             "ramp": "seam", "tone": 1.0, "faces": ["front", "left", "right"]}]},
    "dome": {"ramp": "carapace", "tone": 4.0, "rim": RIM, "brush": {"off": True},
             "layers": [GRAIN, scutes((3.5, 3.0), True, 4.0)]},
    "dome_top": {"ramp": "carapace", "tone": 4.6, "rim": RIM, "brush": {"off": True},
                 "layers": [GRAIN, scutes((4.0, 3.4), True, 4.6),
                            {"id": "keel", "op": "band", "axis": "x", "from": -0.2, "to": 0.2, "shift": 0.8,
                             "faces": ["top"]}]},
}


def armor_spec():
    R = Rig(density=2, bone_style="marginal")
    part, bone = R.part, R.bone
    bone("carapace", None, at=(0, 24, 0))
    part("marginal", "carapace", [10, 12, 2], "marginal", centre=(0, 18.0, -3.25))
    part("costal", "carapace", [8.5, 10.5, 2], "costal", centre=(0, 18.25, -5.25))
    part("vertebral", "carapace", [5, 8, 1.5], "vertebral", centre=(0, 18.5, -7.0))
    for s, x in (("l", 5.25), ("r", -5.25)):
        part(f"flank_{s}", "carapace", [1, 10.5, 2.5], "marginal", centre=(x, 18.25, -3.25))
    part("rear_flare", "carapace", [9, 1, 2.5], "marginal", at=(0, 12.5, -2.5), offset=(0, -0.5, -1.25),
         rot=(-20, 0, 0))
    bone("plastron", None, at=(0, 24, 0))
    part("plastron_plate", "plastron", [8, 10.5, 1], "plastron", centre=(0, 17.75, 2.75))
    part("gular", "plastron", [6, 1.5, 1], "plastron", centre=(0, 23.25, 2.6))
    part("anal", "plastron", [5, 1.5, 1], "plastron", centre=(0, 12.25, 2.6))
    return {
        "name": "Turtle Shell Armor",
        "description": "The Winterworks Turtle Shell chestplate: a domed green carapace of real scutes on the back and "
                       "a cream plastron on the chest. Minecraft pixel units, density 2.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": 2,
        "grounded": False,
        "budget": {"tris": 200, "colors": 32},
        "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.85, "gradient": 0.3, "ao": 0.0},
        "brush": {"flow": "vertical", "length": 1.5, "width": 0.5, "rough": 0.45, "overshoot": 0.3,
                  "textures": {"carapace": "scales", "plastron": "organic"}},
        "minecraft": {"fps": 12},
        "render": {"background": "#14262c", "hero": [-150, 18], "shadow": 0.0},
        "palette": {"ramps": ramps},
        "styles": styles,
        "parts": R.P,
        "animations": {"idle": {"length": 1.0, "loop": True, "tracks": []}},
    }


HOLE_FRONT = ["..kkkkkkkk..", ".kkKKKKKKkk.", "kkKwEKKwEKkk", "kkKEEKKEEKkk", "kkKKKKKKKKkk"]
HOLE_BACK = ["..kkkk..", ".kKKKKk.", "kKKKKKKk"]
HOLE_LEG = [".kkkk.", "kKKKKk", "kKKKKk"]


def retreat_spec():
    R = Rig(density=2, bone_style="dome")
    part, bone = R.part, R.bone
    bone("shell", None, at=(0, 0, 0))
    bone("plastron", "shell", at=(0, 0, 0))
    part("plastron_plate", "plastron", [12, 1.5, 15], "plastron", centre=(0, 0.75, 0))
    bone("carapace", "shell", at=(0, 1.5, 0))
    part("rim", "carapace", [14, 2.5, 17], "rim", centre=(0, 2.75, 0))
    part("dome", "carapace", [12.5, 2, 15.5], "dome", centre=(0, 5.0, 0))
    part("dome_hi", "carapace", [10.5, 1.5, 13], "dome", centre=(0, 6.75, 0))
    part("crown", "carapace", [8, 1.5, 10], "dome_top", centre=(0, 8.25, 0))
    part("keel", "carapace", [3, 1, 6], "dome_top", centre=(0, 9.5, 0))
    st = dict(styles)
    st["rim"] = {"ramp": "carapace", "tone": 3.4, "rim": RIM, "brush": {"flow": "x"},
                 "layers": [GRAIN, scutes((2.0, 1.25), False, 3.4)],
                 "stamps": [{"face": "front", "at": "bottom", "art": HOLE_FRONT, "key": KEY},
                            {"face": "back", "at": "bottom", "art": HOLE_BACK, "key": KEY},
                            {"faces": ["left", "right"], "at": "bottom-left", "offset": [3, 0], "art": HOLE_LEG,
                             "key": KEY},
                            {"faces": ["left", "right"], "at": "bottom-right", "offset": [-3, 0], "art": HOLE_LEG,
                             "key": KEY}]}
    L = 4.0
    anim = {"idle": {"length": L, "loop": True,
                     "tracks": [osc("carapace", None, [0.0, 0.025, 0.0], 1, 0.0, ch="scale"),
                                osc("carapace", None, [0, 0.12, 0], 1, 0.0, ch="position")]},
            # a blocked hit: the shell rocks side to side and settles, the dome dips and springs back
            "hit": {"length": 0.4, "loop": False,
                    "tracks": [ring("carapace", 0.0, 6.0, freq=6, decay=8, axis=2, end=0.4),
                               {"part": "carapace", "channel": "position", "ease": "ease",
                                "keys": [[0, [0, 0, 0]], [0.06, [0, -0.3, 0]], [0.18, [0, 0.2, 0]],
                                         [0.4, [0, 0, 0]]]}]}}
    return {
        "name": "Turtle Shell Retreat",
        "description": "The Winterworks Turtle Shell Retreat pose: the shell closed on the ground, dark openings at "
                       "the front, back and legs, two round eyes peeking out. Minecraft pixel units, density 2.",
        "author": "lowpix example", "license": "CC0-1.0",
        "density": 2,
        "budget": {"tris": 120, "colors": 36},
        "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.85, "gradient": 0.3, "ao": 0.5, "ao_height": 3.0},
        "brush": {"flow": "horizontal", "length": 1.5, "width": 0.5, "rough": 0.45, "overshoot": 0.3,
                  "textures": {"carapace": "scales", "plastron": "organic"}},
        "minecraft": {"fps": 20},
        "render": {"background": "#14262c", "hero": [-30, 22], "shadow": 0.45},
        "palette": {"ramps": ramps},
        "styles": st,
        "parts": R.P,
        "animations": anim,
    }


KEY = {"k": "skin:1", "K": "skin:0", "w": "sclera:7", "E": "iris:0"}

if __name__ == "__main__":
    a = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "turtle_shell_armor.json")
    b = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "examples", "turtle_shell_retreat.json")
    dump(armor_spec(), a)
    dump(retreat_spec(), b)
