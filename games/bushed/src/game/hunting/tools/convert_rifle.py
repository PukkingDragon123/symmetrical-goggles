#!/usr/bin/env python3
"""Convert Poly Haven's bolt_action_rifle_7_62 (CC0) into BUSHED's look with the props engineer's pipeline
(games/bushed/tools/convert_props.py: lowpix pixel-hd, painted light and crease rims off, the source AO kept), as
three separate props so the bolt can be cycled and the cartridge used for loose rounds and ejected brass:

    bolt_action_rifle_7_62        stock, barrel, receiver, scope, canvas cheek wrap, trigger
    bolt_action_rifle_7_62_bolt   the bolt (body + handle), animated by src/game/hunting/rifle.ts
    bolt_action_rifle_7_62_round  one 7.62x54R cartridge

Differences from the stock props job: 640 px/m (the rifle is a first-person hero object seen from 25 cm down the
sights), no chroma boost and a 6 degree ramp hue shift instead of 20 (the boost + yellow-shifted highlights turned
the khaki cheek wrap and the orange birch stock green). Each prop is re-centred by the pipeline, so the bolt's and
the round's offsets from the rifle's origin (all in the rifle glb's frame) are printed (and written to
out/bushed/props/bolt_action_rifle_7_62/offsets.json): src/game/hunting/rifle.ts carries them as constants. (A .json
next to the glb in public/assets/models would read as a Sketchfab vehicle to tools/gen_credits_models.py.)

    cd /home/user/symmetrical-goggles
    python games/bushed/src/game/hunting/tools/convert_rifle.py [--force]
"""
import functools
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "games", "bushed", "tools"))
import convert_props as CP  # noqa: E402
import lowpix.convert as LC  # noqa: E402

ASSET = "bolt_action_rifle_7_62"
SPLITS = [
    (ASSET, r"^bolt_action_rifle_7_62(_scope|_wrap|_trigger)?$"),
    (ASSET + "_bolt", r"_bolt_[ab]$"),
    (ASSET + "_round", r"_bullet_54mm$"),
]
TRIS = {ASSET: 6500, ASSET + "_bolt": 900, ASSET + "_round": 300}

LC.convert = functools.partial(LC.convert, hue_shift=6.0)
CP.boost_colours = lambda js, base, tag="": (js, 1.0)
CP.PROPS[ASSET] = ("tool", 6500, {"density": 640.0, "ramps": 12, "split": SPLITS})


def frame_origin(pid: str, rx: str) -> list[float]:
    """the pipeline's origin for a split (centre of the x/z bounds, lowest y) in the source frame"""
    src = CP.fetch(ASSET)
    base = os.path.dirname(src)
    js = json.load(open(src))
    V = []
    for kind in ("body", "glass"):
        p = CP.part_gltf(js, base, pid + "_o", rx, kind, False)
        if p:
            V.append(LC.load_gltf(p).V)
    A = np.concatenate(V)
    lo, hi = A.min(0), A.max(0)
    return [float((lo[0] + hi[0]) / 2), float(lo[1]), float((lo[2] + hi[2]) / 2)]


def main():
    force = "--force" in sys.argv
    J = CP.jobs()
    for pid, _ in SPLITS:
        J[pid]["tris"] = TRIS[pid]
    CP.jobs = lambda: J
    reps = [CP.convert_one(pid, force=force) for pid, _ in SPLITS]
    for r in reps:
        print(json.dumps(r), flush=True)
    o = {pid: frame_origin(pid, rx) for pid, rx in SPLITS}
    base = np.array(o[ASSET])
    meta = {"source": "https://polyhaven.com/a/" + ASSET, "licence": "CC0",
            "offsets": {pid: [round(float(v), 5) for v in (np.array(o[pid]) - base)] for pid, _ in SPLITS}}
    out = os.path.join(CP.PREVIEW, ASSET, "offsets.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(meta, open(out, "w"), indent=1)
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
