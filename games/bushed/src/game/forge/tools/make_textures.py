#!/usr/bin/env python3
"""BUSHED forge lean-to: textures (high-resolution pixel art from CC0 Poly Haven photos), same pipeline as
src/places/tools/make_textures.py (area-downsample to the target texel density, flatten the photo's lighting, a
little cavity AO, grade, k-means palette quantisation; normal maps from the photo's own OpenGL normal map).

    cd games/bushed && python3 src/game/forge/tools/make_textures.py            # everything
    python3 src/game/forge/tools/make_textures.py brick anvil                    # some

Output: public/assets/textures/forge/<name>.png (+ <name>_n.png) and index.json (tile sizes in metres).
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
spec = importlib.util.spec_from_file_location("placetex", os.path.join(GAME, "src", "places", "tools", "make_textures.py"))
mt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mt)
mt.OUT = os.path.join(GAME, "public", "assets", "textures", "forge")
Photo, quant, grade, save, fbm, vnoise, soften_normal, pix = mt.Photo, mt.quant, mt.grade, mt.save, mt.fbm, mt.vnoise, mt.soften_normal, mt.pix


def t_brick():
    # old red brick, mortar joints, the forge's soot creeping up from the fire
    p = Photo("red_bricks_04", 256, 256, res="1k", flat=0.55, ao=0.6)
    rgb = grade(p.rgb, sat=0.92, val=0.95)
    save("brick", quant(np.clip(rgb, 0, 1), 26, seed=101), [1.0, 1.0], p.nor, note="red_bricks_04")
    # heavy soot: black bloom over the bricks (hood, chimney mouth, firepot rim)
    s = fbm(256, 256, 64, 102)[..., None]
    k = np.clip((s - 0.35) * 2.2, 0, 1) * 0.85
    lum = pix.luminance(rgb)[..., None]
    soot = np.array([0.07, 0.06, 0.055]) * (0.6 + lum * 1.4)
    rs = rgb * (1 - k) + soot * k
    save("brick_soot", quant(np.clip(rs, 0, 1), 24, seed=103), [1.0, 1.0], p.nor, note="red_bricks_04 sooted")
    # buff fire brick for the firepot lining, scorched dark toward the coals
    fb = grade(p.rgb, hue=0.04, sat=0.55, val=1.25) * np.array([1.05, 0.95, 0.78])
    burn = np.clip((fbm(256, 256, 48, 104)[..., None] - 0.3) * 1.6, 0, 1) * 0.6
    fb = fb * (1 - burn) + np.array([0.12, 0.09, 0.07]) * burn
    save("firebrick", quant(np.clip(fb, 0, 1), 20, seed=105), [1.0, 1.0], p.nor, note="red_bricks_04 as fire brick")


def t_anvil():
    # forged steel body: blue-black mill scale with a bloom of fine rust in the hollows
    p = Photo("rust_coarse_01", 256, 256, res="1k", flat=0.6, ao=0.5)
    lum = pix.luminance(p.rgb)[..., None]
    r = fbm(256, 256, 48, 111)[..., None]
    steel = np.array([0.2, 0.21, 0.23]) * (0.7 + lum * 1.2)
    rust = p.rgb * 0.55
    m = np.clip((r - 0.6) * 3.5, 0, 1) * (1 - lum)
    rgb = steel * (1 - m) + rust * m
    save("anvil", quant(np.clip(rgb, 0, 1), 18, seed=112), [0.5, 0.5], soften_normal(p.nor, 0.4), note="rust_coarse_01 as mill scale")
    # the face: hard steel polished by decades of hammering: fine grain, overlapping hammer dimples, scratches
    W = 256
    grain = mt.fbm(W, W, 16, 113)[..., None]
    sp = np.random.default_rng(116).random((W, W))[..., None]
    face = np.array([0.5, 0.51, 0.53]) * (0.85 + 0.2 * grain + 0.06 * sp)
    rng = np.random.default_rng(114)
    yy, xx = np.mgrid[0:W, 0:W]
    for _ in range(70):
        cx, cy = rng.integers(0, W, 2)
        rx, ry = rng.uniform(5, 12), rng.uniform(3, 8)
        d = (((xx - cx + W / 2) % W - W / 2) / rx) ** 2 + (((yy - cy + W / 2) % W - W / 2) / ry) ** 2
        ring = (d > 0.75) & (d < 1.0)
        face[ring] *= 0.86
        face[d < 0.5] *= 1.05
    for _ in range(120):
        x, y = rng.integers(0, W, 2)
        L = rng.integers(6, 50)
        a = rng.uniform(0, np.pi)
        k = 1.2 if rng.random() < 0.6 else 0.8
        for t in range(L):
            face[int(y + np.sin(a) * t) % W, int(x + np.cos(a) * t) % W] *= k
    q = Photo("metal_plate", 256, 256, res="1k", flat=0.7, ao=0.0)
    save("anvil_face", quant(np.clip(face, 0, 1), 14, seed=115), [0.4, 0.4], soften_normal(q.nor, 0.92), note="procedural polished steel")


def t_coal():
    # lump coal / charcoal: black glassy facets, grey ash on the edges, charcoal grain
    p = Photo("dark_rock_02", 256, 256, res="1k", flat=0.4, ao=0.7)
    lum = pix.luminance(p.rgb)[..., None]
    base = np.array([0.045, 0.043, 0.045]) * (0.5 + lum * 2.2)
    ash = np.clip((vnoise(256, 256, 6, 121) - 0.72) * 4, 0, 1)[..., None] * 0.7
    rgb = base * (1 - ash) + np.array([0.5, 0.48, 0.46]) * ash
    save("coal", quant(np.clip(rgb, 0, 1), 12, seed=122), [0.25, 0.25], p.nor, note="dark_rock_02 as coal")
    # the ash and clinker bed under the fire
    a = Photo("burned_ground_01", 256, 256, res="1k", flat=0.5, ao=0.5)
    al = pix.luminance(a.rgb)[..., None]
    ash2 = np.array([0.42, 0.4, 0.38]) * (0.4 + al * 1.6)
    bits = (vnoise(256, 256, 4, 123) > 0.7)[..., None]
    ash2 = np.where(bits, np.array([0.05, 0.045, 0.045]), ash2)
    save("ash", quant(np.clip(ash2, 0, 1), 12, seed=124), [0.6, 0.6], a.nor, note="burned_ground_01 as ash")


def t_floor():
    # the lean-to's floor: packed dirt black with cinders, coal dust and scale
    d = Photo("dirt_floor", 512, 512, res="1k", flat=0.55, ao=0.5)
    b = Photo("burned_ground_01", 512, 512, res="1k", flat=0.55, ao=0.5)
    m = np.clip((fbm(512, 512, 128, 131) - 0.35) * 2.0, 0, 1)[..., None]
    rgb = grade(d.rgb, sat=0.7, val=0.8) * (1 - m) + grade(b.rgb, sat=0.5, val=0.7) * m
    spk = (vnoise(512, 512, 3, 132) > 0.82)[..., None]
    rgb = np.where(spk, rgb * 0.45, rgb)
    nor = d.nor * (1 - m) + b.nor * m
    save("cinder_floor", quant(np.clip(rgb, 0, 1), 24, seed=133), [2.0, 2.0], nor, note="dirt_floor + burned_ground_01")


def t_sandstone():
    # grindstone: fine-grained buff sandstone (the photo's palette on an even grain), worn smooth
    p = Photo("old_sandstone_02", 256, 256, res="1k", flat=0.9, ao=0.0)
    mean = p.rgb.reshape(-1, 3).mean(0)
    g = mt.fbm(256, 256, 24, 141)[..., None]
    sp = np.random.default_rng(142).random((256, 256))[..., None]
    rgb = mean * (0.86 + 0.18 * g + 0.1 * sp) * np.array([1.04, 0.98, 0.88])
    save("sandstone", quant(np.clip(rgb, 0, 1), 14, seed=143), [0.5, 0.5], soften_normal(p.nor, 0.85), note="old_sandstone_02 palette, procedural grain")


ALL = {"brick": t_brick, "anvil": t_anvil, "coal": t_coal, "floor": t_floor, "sandstone": t_sandstone}


def main(argv):
    names = argv or list(ALL)
    os.makedirs(mt.OUT, exist_ok=True)
    idx_path = os.path.join(mt.OUT, "index.json")
    if os.path.exists(idx_path):
        old = json.load(open(idx_path))
        mt.INDEX.update(old.get("textures", {}))
        mt.CREDITS.update(old.get("sources", {}))
    for n in names:
        print(n)
        ALL[n]()
    json.dump({"density": mt.DENS, "textures": mt.INDEX, "sources": mt.CREDITS}, open(idx_path, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main(sys.argv[1:])
