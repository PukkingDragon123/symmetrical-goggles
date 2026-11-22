"""Builds examples/hydrothermal_vent.json: the Hydrothermal Vent (Winterworks, Tides & Treasures; a static block).

    python examples/src/hydrothermal_vent.py examples/hydrothermal_vent.json                       # the spec only
    python examples/src/hydrothermal_vent.py examples/hydrothermal_vent.json --mod mods/winterworks # + block files

A black-smoker chimney: a squat mound of blue-black columnar basalt rising in stepped, turned tiers to a rim, with a
side spire; ledges of rust-and-ochre sulphide crust and chalk-white anhydrite cling to it and run down its flanks.
Down in the rim the vent mouth glows red-orange with heat; the plume itself is the `vent_smoke` particle.

Units are Minecraft pixels, density 2 (32 texels per block, like the update's 32 x 32 block textures). Only boxes,
axis-aligned or turned 45 degrees about Y, so every part is a legal block-model element (ocean_kit.block_models).

`--mod` writes models/block/hydrothermal_vent.json (every element), models/block/hydrothermal_vent_glow.json (only
the glowing mouth, on textures/block/hydrothermal_vent_glow.png: lay it over the block with an emissive material, as
client/endmob/BloomGlowModel.java does, so the mouth stays bright in dark water), the two textures, the blockstate and
the item model (the block model, so the item gets vanilla's block display transforms).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump  # noqa: E402
from ocean_kit import RAMPS, block_models, mod_args, res_dir, write_json  # noqa: E402

R = Rig(density=2, bone_style="basalt")
part, bone = R.part, R.bone

bone("vent", None, at=(0, 0, 0))
# the mound and the narrowing chimney: each tier a square box and the same turned 45 degrees (an octagon in plan)
part("base", "vent", [14, 3, 14], "basalt_base", centre=(0, 1.5, 0))
part("base_t", "vent", [11, 2.5, 11], "basalt_base", centre=(0, 1.25, 0), rot=(0, 45, 0))
part("tier1", "vent", [9, 5, 9], "basalt", centre=(0, 5.5, 0))
part("tier1_t", "vent", [8, 4.5, 8], "basalt", centre=(0, 5.25, 0), rot=(0, 45, 0))
part("tier2", "vent", [7, 5, 7], "basalt", centre=(0, 10.5, 0))
part("tier2_t", "vent", [5.5, 4.5, 5.5], "basalt", centre=(0, 10.25, 0), rot=(0, 45, 0))
# the rim round the mouth (sooty basalt walls), and the mouth itself sunk 1.5 px inside it
part("lip_n", "vent", [6, 3, 1.5], "rim", centre=(0, 14.5, -2.25))
part("lip_s", "vent", [6, 3, 1.5], "rim", centre=(0, 14.5, 2.25))
part("lip_e", "vent", [1.5, 3, 3], "rim", centre=(2.25, 14.5, 0))
part("lip_w", "vent", [1.5, 3, 3], "rim", centre=(-2.25, 14.5, 0))
part("mouth", "vent", [3, 2, 3], "heat", centre=(0, 13.5, 0))
# a side spire, crusted at its tip
part("spire", "vent", [3, 8, 3], "basalt", centre=(5, 7, -4.5))
part("spire_tip", "vent", [2, 1.5, 2], "crust", centre=(5, 11.75, -4.5))
part("spire_b", "vent", [2, 4, 2], "basalt", centre=(-5, 4.5, 4.5))
# ledges of sulphide crust and anhydrite stuck to the flanks
part("crust_a", "vent", [3, 1, 2.5], "crust", centre=(5.0, 7.5, 1.5))
part("crust_b", "vent", [2.5, 1, 3], "crust", centre=(-1, 10.0, -4.0))
part("crust_c", "vent", [2.5, 1, 2.5], "crust", centre=(-4.0, 3.5, -4.0), rot=(0, 45, 0))
part("crust_d", "vent", [2, 1, 2], "chalk", centre=(3.0, 13.5, 2.5))
part("crust_e", "vent", [2, 1.5, 2], "chalk", centre=(-5.25, 6.75, -1.0))
part("crust_f", "vent", [3.5, 1, 2], "crust", centre=(1.5, 3.5, 5.5))

RIM = {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.4, "outline": "dark"}
COLUMNS = [{"id": "columns", "op": "stripes", "axis": "x", "period": 1.5, "width": 0.3, "shift": -1.1,
            "faces": ["front", "back"]},
           {"id": "columns_s", "op": "stripes", "axis": "z", "period": 1.5, "width": 0.3, "shift": -1.1,
            "faces": ["left", "right"]},
           {"id": "grain", "op": "noise", "scale": 1.2, "amount": 0.7}]
DEPOSIT = {"id": "deposit", "op": "drip", "ramp": "crust", "tone": 3.4, "depth": 0.2, "length": 0.35, "width": 0.6,
           "scale": 1.6, "bevel": {"shadow": 1, "highlight": 0}}
styles = {
    "basalt": {"ramp": "basalt", "tone": 3.8, "rim": RIM, "brush": {"flow": "y"},
               "layers": COLUMNS + [DEPOSIT,
                                    {"id": "sulphur", "op": "patches", "scale": 1.6, "threshold": 0.76,
                                     "ramp": "crust", "tone": 4.2, "space": "world", "faces": ["sides"],
                                     "bevel": {"shadow": 1, "highlight": 0}}]},
    "basalt_base": {"ramp": "basalt", "tone": 3.0, "rim": RIM, "brush": {"flow": "y"},
                    "layers": COLUMNS + [{"id": "sediment", "op": "patches", "scale": 1.3, "threshold": 0.62,
                                          "ramp": "crust", "tone": 2.6, "space": "world",
                                          "bevel": {"shadow": 1, "highlight": 1}},
                                         {"id": "chalky", "op": "patches", "scale": 1.0, "threshold": 0.72,
                                          "ramp": "chalk", "tone": 2.4, "space": "world", "faces": ["top"]}]},
    "rim": {"ramp": "basalt", "tone": 3.2, "rim": RIM, "brush": {"flow": "y"},
            "layers": [{"id": "grain", "op": "noise", "scale": 1.0, "amount": 0.8},
                       {"id": "glow_lip", "op": "band", "axis": "y", "from": 0.6, "to": 1.01, "ramp": "crust",
                        "tone": 3.0, "faces": ["sides"], "wobble": 0.3},
                       {"id": "soot", "op": "gradient", "axis": "y", "amount": -0.6}]},
    "crust": {"ramp": "crust", "tone": 3.8, "rim": RIM, "brush": {"flow": "horizontal"},
              "layers": [{"id": "grain", "op": "noise", "scale": 0.8, "amount": 0.9},
                         {"id": "anhydrite", "op": "patches", "scale": 0.9, "threshold": 0.62, "ramp": "chalk",
                          "tone": 3.6, "space": "world", "bevel": {"shadow": 1, "highlight": 0}}]},
    "chalk": {"ramp": "chalk", "tone": 3.0, "rim": RIM, "brush": {"flow": "horizontal"},
              "layers": [{"id": "grain", "op": "noise", "scale": 0.8, "amount": 0.8}]},
    "heat": {"ramp": "heat", "tone": 5.4, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
             "layers": [{"id": "core", "op": "rect", "rect": [0.25, 0.25, 0.75, 0.75], "ramp": "heat", "tone": 7.0,
                         "faces": ["top"]},
                        {"id": "deep", "op": "band", "axis": "y", "from": -1.01, "to": 0.2, "ramp": "heat",
                         "tone": 3.0, "faces": ["sides"]}]},
}

spec = {
    "name": "Hydrothermal Vent",
    "description": "The Winterworks Hydrothermal Vent: a stepped chimney of columnar basalt crusted with sulphide "
                   "and anhydrite, its mouth glowing with heat. Minecraft pixel units, density 2; exported as a block "
                   "model.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "budget": {"tris": 400, "colors": 48},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.4, "ao": 0.5, "ao_height": 4.0},
    "brush": {"flow": "horizontal", "length": 1.5, "width": 0.5, "rough": 0.55, "overshoot": 0.3,
              "textures": {"basalt": "stone", "crust": "stone", "chalk": "stone"}},
    "minecraft": {"fps": 12, "glow_parts": ["mouth"], "glow_ramps": ["heat"]},
    "render": {"background": "#0f2230", "hero": [-34, 24], "shadow": 0.4},
    "palette": {"ramps": {k: RAMPS[k] for k in ("basalt", "crust", "chalk", "heat")}},
    "styles": styles,
    "parts": R.P,
    "animations": {"idle": {"length": 1.0, "loop": True, "tracks": []}},
}

if __name__ == "__main__":
    out, mod = mod_args(sys.argv[1:], os.path.join(ROOT, "examples", "hydrothermal_vent.json"))
    dump(spec, out)
    if mod:
        tex, gtex, models, gmodels = block_models(spec, {"vent": (0.0, 0.0)}, "winterworks:block/hydrothermal_vent",
                                                  "hydrothermal_vent", glow=True)
        res = res_dir(mod)
        os.makedirs(os.path.join(res, "textures", "block"), exist_ok=True)
        tex.save(os.path.join(res, "textures", "block", "hydrothermal_vent.png"))
        gtex.save(os.path.join(res, "textures", "block", "hydrothermal_vent_glow.png"))
        write_json(os.path.join(res, "models", "block", "hydrothermal_vent.json"), models["vent"], compact=True)
        write_json(os.path.join(res, "models", "block", "hydrothermal_vent_glow.json"), gmodels["vent"], compact=True)
        write_json(os.path.join(res, "blockstates", "hydrothermal_vent.json"),
                   {"variants": {"": [{"model": "winterworks:block/hydrothermal_vent", "y": y} for y in (0, 90, 180, 270)]}})
        write_json(os.path.join(res, "models", "item", "hydrothermal_vent.json"),
                   {"parent": "winterworks:block/hydrothermal_vent"})
        print("texture", tex.size, "elements", len(models["vent"]["elements"]),
              "glow elements", len(gmodels["vent"]["elements"]))
