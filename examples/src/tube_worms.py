"""Builds examples/tube_worms.json: Tube Worms (Winterworks, Tides & Treasures; a waterlogged block, two models).

    python examples/src/tube_worms.py examples/tube_worms.json                       # the spec only
    python examples/src/tube_worms.py examples/tube_worms.json --mod mods/winterworks # + block files

A clump of giant tube worms on a lump of vent rock: six chalky white tubes of different heights, ringed with growth
bands, some leaning, each crowned with a feathery blood-red plume (two crossed cards). Retracted, the plumes are
pulled in and only the dark red openings show at the tube mouths.

Two roots side by side so the preview shows both: `extended` (x = -10) and `retracted` (x = +10), each filling the
block round its own root. Units are Minecraft pixels, density 2. Only boxes and cards, each turned about one axis by
22.5 or 45 degrees at most (the plumes cross as a + on leaning tubes, as an x on upright ones), so every part is a
legal block-model element. Plumes are cards: draw the block in the cutout layer.

`--mod` writes models/block/tube_worms.json (extended) and tube_worms_retracted.json, textures/block/tube_worms.png
and the blockstate (extended=true/false, each in four random turns). The item uses the 2D icon textures/item/
tube_worms.png (winterworks_ocean_art.py).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump  # noqa: E402
from ocean_kit import RAMPS, block_models, mod_args, res_dir, write_json  # noqa: E402

R = Rig(density=2, bone_style="tube")
part, bone, card = R.part, R.bone, R.card

ROOTS = {"extended": -10.0, "retracted": 10.0}
# (x, z, height, width, tilt): tilt is (axis, degrees) or None
TUBES = [(-2.0, -1.5, 13.0, 2.0, None), (1.5, -3.0, 10.5, 1.5, ("x", -22.5)), (2.5, 1.0, 8.5, 2.0, ("z", -22.5)),
         (-1.0, 2.5, 7.0, 1.5, None), (-4.5, 1.5, 5.5, 1.5, ("z", 22.5)), (5.0, -3.5, 6.0, 1.5, None)]
PLUME = ["p.P..P.p", ".P.pp.P.", "p.PRRP.p", ".pRWRRp.", "..RRRR..", "..rRRr..", "...rr..."]


def clump(name, x0, plumes):
    bone(name, None, at=(x0, 0, 0))
    part(f"{name}_rock", name, [6, 1.5, 5], "rock", centre=(x0, 0.75, 0))
    part(f"{name}_rock_t", name, [3.5, 1, 3.5], "rock", centre=(x0 + 3, 0.5, 2.0), rot=(0, 45, 0))
    for k, (x, z, h, w, tilt) in enumerate(TUBES):
        rot = (0, 0, 0) if tilt is None else ((tilt[1], 0, 0) if tilt[0] == "x" else (0, 0, tilt[1]))
        t = part(f"{name}_tube{k}", name, [w, h, w], "tube", at=(x0 + x, 0.5, z), offset=(0, h / 2, 0), rot=rot)
        if plumes:
            if tilt is None:
                pairs = (("xy", (0, 45, 0)), ("xy", (0, -45, 0)))
            else:
                pairs = (("xy", (0, 0, 0)), ("yz", (0, 0, 0)))
            for j, (plane, r) in enumerate(pairs):
                card(f"{name}_plume{k}_{j}", t["id"], PLUME, "plume", plane=plane, rel=(0, h, 0),
                     offset=(0, len(PLUME) / 4.0, 0), rot=r)


clump("extended", ROOTS["extended"], True)
clump("retracted", ROOTS["retracted"], False)

RIM = {"light": 1, "dark": 1, "light_shift": 1.4, "dark_shift": -1.2, "outline": "dark"}
styles = {
    "tube": {"ramp": "tube", "tone": 4.2, "rim": RIM, "brush": {"flow": "y"},
             "layers": [{"id": "rings", "op": "stripes", "axis": "y", "period": 1.5, "width": 0.25, "shift": -1.2,
                         "faces": ["sides"]},
                        {"id": "grain", "op": "noise", "scale": 0.8, "amount": 0.5},
                        {"id": "stain", "op": "gradient", "axis": "y", "amount": 0.8},
                        {"id": "mouth", "op": "rect", "rect": [0.2, 0.2, 0.8, 0.8], "ramp": "plume", "tone": 1.0,
                         "faces": ["top"]}]},
    "rock": {"ramp": "basalt", "tone": 3.0, "rim": RIM, "brush": {"flow": "horizontal"},
             "layers": [{"id": "grain", "op": "noise", "scale": 1.0, "amount": 0.8},
                        {"id": "crust", "op": "patches", "scale": 1.2, "threshold": 0.6, "ramp": "crust", "tone": 3.2,
                         "space": "world", "bevel": {"shadow": 1, "highlight": 0}}]},
    "plume": {"ramp": "plume", "tone": 4.0, "light": 0.3, "brush": {"off": True},
              "art_key": {"p": "plume:4", "P": "plume:5", "R": "plume:3", "W": "plume:6", "r": "plume:2"}},
}

spec = {
    "name": "Tube Worms",
    "description": "Winterworks Tube Worms: a clump of white ringed tubes with feathery red plumes (extended) and "
                   "the same with the plumes pulled in (retracted). Minecraft pixel units, density 2; exported as "
                   "block models.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "budget": {"tris": 500, "colors": 40},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.4, "ao": 0.4, "ao_height": 3.0},
    "brush": {"flow": "vertical", "length": 1.5, "width": 0.5, "rough": 0.5, "overshoot": 0.3,
              "textures": {"tube": "organic", "basalt": "stone"}},
    "minecraft": {"fps": 12},
    "render": {"background": "#0f2230", "hero": [-30, 18], "shadow": 0.4},
    "palette": {"ramps": {k: RAMPS[k] for k in ("tube", "plume", "basalt", "crust")}},
    "styles": styles,
    "parts": R.P,
    "animations": {"idle": {"length": 1.0, "loop": True, "tracks": []}},
}

if __name__ == "__main__":
    out, mod = mod_args(sys.argv[1:], os.path.join(ROOT, "examples", "tube_worms.json"))
    dump(spec, out)
    if mod:
        tex, _, models, _ = block_models(spec, {k: (x, 0.0) for k, x in ROOTS.items()}, "winterworks:block/tube_worms",
                                         "tube_worms")
        res = res_dir(mod)
        tex.save(os.path.join(res, "textures", "block", "tube_worms.png"))
        write_json(os.path.join(res, "models", "block", "tube_worms.json"), models["extended"], compact=True)
        write_json(os.path.join(res, "models", "block", "tube_worms_retracted.json"), models["retracted"],
                   compact=True)
        turns = lambda m: [{"model": f"winterworks:block/{m}", "y": y} for y in (0, 90, 180, 270)]  # noqa: E731
        write_json(os.path.join(res, "blockstates", "tube_worms.json"),
                   {"variants": {"extended=true": turns("tube_worms"), "extended=false": turns("tube_worms_retracted")}})
        write_json(os.path.join(res, "models", "item", "tube_worms.json"),
                   {"parent": "minecraft:item/generated", "textures": {"layer0": "winterworks:item/tube_worms"}})
        print("texture", tex.size, {k: len(v["elements"]) for k, v in models.items()})
