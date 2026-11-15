"""Regenerate the curated 2D sheets in this folder:  python examples/sprites/build.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from PIL import Image  # noqa: E402

from lowpix import sprite_gen as G  # noqa: E402
from lowpix.photo import load_photo, stylise  # noqa: E402
from lowpix.sprite import render_sprite, sheet, upscale  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BG = "#2e3644"


def save(name, ims, cols, k, pad=2):
    sh, _ = sheet(ims, cols=cols, pad=pad)
    sh.save(os.path.join(HERE, f"{name}.png"))                 # the real sprite sheet (1x, transparent)
    upscale(sh, k, BG).save(os.path.join(HERE, f"{name}_x{k}.png"))  # preview
    print(name, sh.size)


save("fish", [render_sprite(G.fish(i, (80, 40), species=s), i) for i, s in enumerate(G.FISH_SPECIES)], 3, 4, 3)
save("swords", [render_sprite(G.sword(i, 64, theme=t), i) for i, t in enumerate(G.SWORD_THEMES)], 8, 3)
save("gems", [render_sprite(G.gem(i, 32, cut=c), i) for i, c in enumerate(G.GEM_CUTS)], 10, 4)
save("ores", [render_sprite(G.ore(i, 32, kind=k), i) for i, k in enumerate(["ore", "crystal", "nugget", "ingot", "chunk"] * 2)],
     10, 4)
save("potions", [render_sprite(G.potion(i, 32), i) for i in range(8)], 8, 4)

# the same generators in the smooth hand-painted finish
painted = []
for i, (fn, kw) in enumerate([(G.fish, dict(size=(192, 96), species="trout")), (G.fish, dict(size=(192, 96), species="koi")),
                              (G.sword, dict(size=128, theme="frost")), (G.potion, dict(size=96)),
                              (G.gem, dict(size=96, cut="cushion", colour="ruby")), (G.ore, dict(size=96, kind="crystal",
                                                                                                  colour="aquamarine"))]):
    sp = fn(i, **kw)
    sp["paint"] = "painted"
    painted.append(render_sprite(sp, i))
sh, _ = sheet(painted, cols=3, pad=8, background=(46, 54, 68, 255))
sh.save(os.path.join(HERE, "painted.png"))
print("painted", sh.size)

# photo-bashing: three CC0 photos, four styles each (realistic, painted, pixel-hd, pixel)
rows = []
for pid in ["bark_brown_02", "rock_face_03", "rusty_metal_02"]:
    p = load_photo(os.path.join("assets", "photos", pid))
    ims = [stylise(p, "realistic", 192), stylise(p, "painted", 192),
           stylise(p, "pixel-hd", 96).resize((192, 192), Image.NEAREST), stylise(p, "pixel", 48).resize((192, 192), Image.NEAREST)]
    row = Image.new("RGB", (4 * 200 - 8, 192), (20, 20, 28))
    for i, im in enumerate(ims):
        row.paste(im, (i * 200, 0))
    rows.append(row)
out = Image.new("RGB", (rows[0].width, len(rows) * 200 - 8), (20, 20, 28))
for i, r in enumerate(rows):
    out.paste(r, (0, i * 200))
out.save(os.path.join(HERE, "photobash.png"))
print("photobash", out.size)
