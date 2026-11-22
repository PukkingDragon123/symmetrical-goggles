#!/usr/bin/env python3
"""Winterworks pixel art for the glowing torchflowers and pitcher plants (mods/winterworks/docs/FIXES_0_4.md).

    python examples/src/winterworks_bloom_art.py                  # write all PNGs, models and the particle json
    python examples/src/winterworks_bloom_art.py --preview DIR    # also write contact sheets to DIR

The torchflowers and pitcher plants stay vanilla's own textures, as asked (same shapes, colours and layout), and only
GLOW: their luminous pixels (the torchflower's flame and bud, the pitcher's aqua tube, violet hood, maroon mouth and
blue bud, the palest leaf tips) are lit up, a little more at every crop stage: the torchflower from faintly lit sprout
tips (stage 0) to a lit bud (stage 1) to the full flame (light 15); the pitcher from a faint sprout in the seed pod, to
lit leaf tips, a lit bud, the lantern pitcher whose maroon mouth warms to pink, and the grown plant, the brightest
(light 12). The vanilla textures are read from the local Minecraft 1.21.1 client jar when this runs (see
find_vanilla). Every texture also gets `<name>_glow.png`: only its luminous pixels, for a full-bright layer
(RenderType.eyes / an emissive quad) if the Java side draws one. The particle and the effect icon below are hand-drawn
grids, with the same rules as winterworks_art.py (whose grid helpers this imports).

Vanilla 1.21.1 names (assets/minecraft/textures/block/), and what uses them:
    torchflower                     the flower (block/cross), the potted flower and the torchflower ITEM (item model
                                    layer0 = block/torchflower)
    torchflower_crop_stage0, 1      the two crop stages (block/cross)
    pitcher_crop_top                the seed pod box's top, present at every crop stage (stage 0 is only the pod);
                                    its _side and _bottom have nothing that glows and stay vanilla
    pitcher_crop_bottom_stage_1..4  the crossed leaves of the lower half (stages 1-4)
    pitcher_crop_top_stage_3, 4     the upper half (stage 3 bud, stage 4 pitcher; stages 0-2 have no upper texture)
    pitcher_plant_top / _bottom     NEW names: vanilla's grown pitcher plant reuses the stage 4 textures, so this script
                                    also overrides models/block/pitcher_plant_top.json and _bottom.json (vanilla's
                                    geometry, textures pointed at these) so the grown plant is the brightest
    item/pitcher_plant              the pitcher plant item icon
Winterworks: textures/particle/sweet_scent_0..4 (+ particles/sweet_scent.json), textures/mob_effect/burning.
"""
from __future__ import annotations

import argparse
import colorsys
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winterworks_art import ASSETS, ROOT, checker, draw, pal, parse  # noqa: E402  (no side effects)

MC_ASSETS = ASSETS.parent / "minecraft"
OUT: dict[str, Image.Image] = {}      # "<namespace>:<relative path>" -> image
GLOW: dict[str, str] = {}             # key -> the key of its glow layer
JSON: dict[str, dict] = {}            # "<namespace>:<relative path>" -> json body


def put(key, im):
    OUT[key] = im


def sprite(key, palette, grid, glowing, size=(16, 16)):
    """Draw a grid; also write `<name>_glow.png` with only the pixels whose characters are in `glowing`."""
    rows = parse(grid)
    im = draw(rows, palette, size, key)
    put(key, im)
    if glowing:
        g = "\n".join("".join(c if c in glowing else "." for c in r) for r in rows)
        gk = key[:-4] + "_glow.png"
        put(gk, draw(parse(g), palette, size, gk))
        GLOW[key] = gk
    return im


def block(name, palette, grid, glowing=""):
    return sprite(f"minecraft:textures/block/{name}.png", palette, grid, glowing)


# ====================================================================== ramps (dark -> light)
# the burning icon's flame: crimson shadows, orange body, a yellow and white-hot core
FLAME = {"k": "#5c1212", "R": "#a11f17", "r": "#d9401b", "o": "#ff6e1c", "a": "#ffa52b", "Y": "#ffd53f",
         "y": "#fff08c", "w": "#fffbe8"}


# ====================================================================== torchflowers and pitcher plants: vanilla + glow
# These keep vanilla's own textures (shapes, colours, layout) and only add the glow: the luminous parts (the
# torchflower's flame and bud, the pitcher's aqua tube, violet hood, maroon mouth and blue bud, the brightest leaf
# tips) are lifted towards a lit, more saturated tone of their own colour, by an amount `k` that grows a little with
# every crop stage; exactly those pixels also go into `<name>_glow.png`. The vanilla textures are read from the local
# Minecraft 1.21.1 client jar (Fabric Loom's cache) when this script runs, so no vanilla pixels live in this file.
def find_vanilla(hint=None):
    """An unpacked client jar (a directory holding assets/) or the jar itself: `hint`, else Loom's caches."""
    import glob
    import os
    cands = [str(hint)] if hint else []
    for base in (os.path.expanduser("~/.gradle/caches/fabric-loom/minecraftMaven/net/minecraft"),
                 str(ROOT / "mods/winterworks/.gradle/loom-cache/minecraftMaven/net/minecraft")):
        cands += sorted(p for p in glob.glob(f"{base}/minecraft-merged*/1.21.1*/*.jar") if not p.endswith("sources.jar"))
    for c in cands:
        if Path(c, "assets").is_dir() or (c.endswith(".jar") and Path(c).is_file()):
            return c
    return None


class Vanilla:
    def __init__(self, src):
        self.src = src
        self.zip = None
        if str(src).endswith(".jar"):
            import zipfile
            self.zip = zipfile.ZipFile(src)

    def image(self, rel):
        import io
        path = f"assets/minecraft/{rel}"
        if self.zip:
            return Image.open(io.BytesIO(self.zip.read(path))).convert("RGBA")
        return Image.open(Path(self.src) / path).convert("RGBA")


def lift(rgb, k, hue_to=None):
    """Light a colour up by k (0..1): the same hue and saturation, brighter (value towards full); colours already at
    full brightness pale a little towards a white-hot core. `hue_to` nudges the hue (the maroon mouth towards pink)."""
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    if hue_to is not None:
        dh = ((hue_to / 360 - h + 0.5) % 1.0) - 0.5
        h = (h + dh * min(1.0, k * 1.6)) % 1.0
    v = v + (1 - v) * k
    s = min(1.0, s * (1 + 0.2 * k))
    if v > 0.95:
        s *= 1 - 0.3 * k
    return tuple(int(round(c * 255)) for c in colorsys.hsv_to_rgb(h, s, v))


def glowify(im, rules):
    """rules: [(test(h deg, s, v, x, y), k, hue_to)]; the first rule that matches a pixel lights it by k."""
    out, glow = im.copy(), Image.new("RGBA", im.size, (0, 0, 0, 0))
    px, gx = out.load(), glow.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            for test, k, hue_to in rules:
                if test(h * 360, s, v, x, y):
                    c = lift((r, g, b), k, hue_to) + (a,)
                    px[x, y] = c
                    gx[x, y] = c
                    break
    return out, glow


def hue_in(lo, hi, s_min=0.0, v_min=0.0):
    return lambda h, s, v, x, y: lo <= h <= hi and s >= s_min and v >= v_min


FLAME_PX = lambda h, s, v, x, y: (h <= 60 or h >= 340) and s >= 0.45 and v >= 0.55  # noqa: E731  flame and petals
BUD_PX = hue_in(40, 95, 0.4, 0.55)                       # the torchflower's yellow bud
TIP_PX = hue_in(50, 70, 0.3, 0.75)                       # the palest yellow-green leaf tips
AQUA_PX = hue_in(105, 205, 0.25, 0.75)                   # the pitcher's aqua tube and the young bud
HOOD_PX = hue_in(206, 300, 0.25, 0.45)                   # the violet-blue hood, the blue bud, the purple tips
MOUTH_PX = hue_in(300, 340, 0.3, 0.2)                    # the dark maroon mouth: a warm pink-gold glow inside
SPROUT_PX = hue_in(70, 130, 0.25, 0.4)                   # the green sprout in the seed pod


def pitcher(k):
    """The lit pitcher: the tube and hood by k, the mouth warmed towards pink (nectar)."""
    return [(AQUA_PX, k, None), (HOOD_PX, k * 0.9, None), (MOUTH_PX, k * 0.8, 345), (TIP_PX, k * 0.5, None)]


# name -> (vanilla texture it is based on, glow rules). k grows stage by stage; the grown plants are the brightest.
PLANTS = {
    "block/torchflower_crop_stage0": ("block/torchflower_crop_stage0",
                                      [(lambda h, s, v, x, y: v >= 0.45 and y <= 12, 0.18, 70)]),
    "block/torchflower_crop_stage1": ("block/torchflower_crop_stage1", [(BUD_PX, 0.42, None)]),
    "block/torchflower": ("block/torchflower", [(FLAME_PX, 0.55, None)]),
    "block/pitcher_crop_top": ("block/pitcher_crop_top", [(SPROUT_PX, 0.3, None)]),
    "block/pitcher_crop_bottom_stage_1": ("block/pitcher_crop_bottom_stage_1", [(TIP_PX, 0.18, None)]),
    "block/pitcher_crop_bottom_stage_2": ("block/pitcher_crop_bottom_stage_2",
                                          [(HOOD_PX, 0.35, None), (TIP_PX, 0.24, None)]),
    "block/pitcher_crop_bottom_stage_3": ("block/pitcher_crop_bottom_stage_3",
                                          [(TIP_PX, 0.3, None), (hue_in(62, 70, 0.3, 0.65), 0.22, None)]),
    "block/pitcher_crop_top_stage_3": ("block/pitcher_crop_top_stage_3", pitcher(0.36)),
    "block/pitcher_crop_bottom_stage_4": ("block/pitcher_crop_bottom_stage_4",
                                          [(HOOD_PX, 0.48, None), (AQUA_PX, 0.48, None), (TIP_PX, 0.3, None)]),
    "block/pitcher_crop_top_stage_4": ("block/pitcher_crop_top_stage_4", pitcher(0.48)),
    # the grown plant (vanilla's plant models reuse the stage 4 textures; this script points them at these)
    "block/pitcher_plant_bottom": ("block/pitcher_crop_bottom_stage_4",
                                   [(HOOD_PX, 0.62, None), (AQUA_PX, 0.62, None), (TIP_PX, 0.38, None)]),
    "block/pitcher_plant_top": ("block/pitcher_crop_top_stage_4", pitcher(0.62)),
    "item/pitcher_plant": ("item/pitcher_plant", pitcher(0.55)),
}


def build_plants(vanilla):
    for name, (src, rules) in PLANTS.items():
        im, glow = glowify(vanilla.image(f"textures/{src}.png"), rules)
        key = f"minecraft:textures/{name}.png"
        put(key, im)
        if glow.getbbox():
            gk = key[:-4] + "_glow.png"
            put(gk, glow)
            GLOW[key] = gk
# vanilla geometry for the grown pitcher plant, pointed at the new (brighter) textures
for half in ("top", "bottom"):
    origin = 19 if half == "top" else 3
    tex = f"minecraft:block/pitcher_plant_{half}"
    el = lambda frm, to, faces: {"name": f"pitcher_plant_{half}", "from": frm, "to": to, "shade": False,  # noqa: E731
                                 "rotation": {"angle": 45, "axis": "y", "origin": [8, origin, 8]}, "faces": faces}
    JSON[f"minecraft:models/block/pitcher_plant_{half}.json"] = {
        "ambientocclusion": False,
        "textures": {"particle": tex, half: tex},
        "elements": [
            el([8, -5, 0], [8, 11, 16], {"north": {"uv": [0, 0, 0, 16], "texture": f"#{half}"},
                                         "east": {"uv": [0, 0, 16, 16], "texture": f"#{half}"},
                                         "south": {"uv": [0, 0, 0, 16], "texture": f"#{half}"},
                                         "west": {"uv": [0, 0, 16, 16], "texture": f"#{half}"}}),
            el([0, -5, 8], [16, 11, 8], {"north": {"uv": [0, 0, 16, 16], "texture": f"#{half}"},
                                         "south": {"uv": [0, 0, 16, 16], "texture": f"#{half}"}}),
        ]}

# ====================================================================== particle: sweet_scent (16x16, 5 frames)
# Golden-pink wisps of scent curling up off the pitcher plants: a puff, a curl that unrolls and drifts, a last few
# motes. Soft (alpha) at the edges, a warm gold core; frame 0 = birth.
SCENT = pal(a="#ffd78a60", A="#ffd78ab8", g="#ffc36ae8", G="#fff0c8ff", p="#ff9cc060", P="#ff9cc0b8",
            q="#ff86b2e8", s="#fff6e8ff")
SCENT_FRAMES = ["""
................
................
................
................
................
................
.......pa.......
......pPAa......
......PgGA......
......aAgP......
.......ap.......
................
................
................
................
................
""", """
................
................
................
................
.........pa.....
........pPAa....
........Pq.A....
.....pa..Aga....
....pPgAaGAp....
....AGsgAPa.....
.....aAPp.......
......a.........
................
................
................
................
""", """
................
................
..........s.....
.........pPa....
........pP..A...
........P..gA...
.....s...PqAp...
....pPa.........
...pP.AaP.......
...AG..gq.......
....aAgPp...a...
.....ap.........
................
................
................
................
""", """
..........a.....
.........p.a....
........p...A...
........P...a...
.........paA....
................
....pa..........
...p..a..s......
...P..pA........
....aAp.........
................
.........p......
................
................
................
................
""", """
.........a......
................
........p..a....
................
.........p......
................
...a............
......p.........
...p............
................
.....a..........
................
................
................
................
................
"""]
for i, g in enumerate(SCENT_FRAMES):
    put(f"winterworks:textures/particle/sweet_scent_{i}.png", draw(parse(g), SCENT, (16, 16), f"sweet_scent_{i}"))
JSON["winterworks:particles/sweet_scent.json"] = {
    "textures": [f"winterworks:sweet_scent_{i}" for i in range(len(SCENT_FRAMES))]}

# ====================================================================== mob effect: burning (18x18)
# Three tongues of fire licking up from a bed of embers, a white-hot heart; dark crimson outline, an ember spark.
put("winterworks:textures/mob_effect/burning.png", draw(parse("""
..................
........o.........
.......oyo........
.......oYo...o....
......orYo..oyo...
..o...oaYo..oYo...
.oyo.orawYo.oao...
.oYo.oaYwYoorao...
.oaro.aYwYaoao....
..oaoraYwYaaYo....
..oraoaywyYaYo....
..oRraYywyYaro....
...oRrayywyarRo...
...oRraYyYarRo....
....oRraaaarRo....
.....ooRRRRoo.....
.......oooo.......
..................
"""), pal(FLAME, o="#3a0a0c"), (18, 18), "burning"))


# ====================================================================== output
def _dst(key):
    ns, rel = key.split(":", 1)
    return (MC_ASSETS if ns == "minecraft" else ASSETS) / rel


def write_all():
    for key, im in sorted(OUT.items()):
        dst = _dst(key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst)
    for key, body in sorted(JSON.items()):
        dst = _dst(key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(body, indent=2) + "\n")


def _on(bg, im):
    base = bg.copy()
    base.alpha_composite(im)
    return base


def night(im, glow=None, scale=8):
    """The sprite at night: everything dimmed to moonlight except the glow layer, plus a soft bloom round it."""
    w, h = im.size
    big = im.resize((w * scale, h * scale), Image.NEAREST)
    pad = 4 * scale
    out = Image.new("RGBA", (big.width + 2 * pad, big.height + 2 * pad), (12, 14, 24, 255))
    dim = big.copy()
    px = dim.load()
    for y in range(dim.height):
        for x in range(dim.width):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * 0.32), int(g * 0.34), int(b * 0.45), a)
    out.alpha_composite(dim, (pad, pad))
    if glow is not None:
        gb = glow.resize(big.size, Image.NEAREST)
        halo = Image.new("RGBA", out.size, (0, 0, 0, 0))
        halo.alpha_composite(gb, (pad, pad))
        halo = halo.filter(ImageFilter.GaussianBlur(scale * 1.6))
        r, g, b, a = halo.split()
        a = a.point(lambda v: min(255, int(v * 1.6)))
        out.alpha_composite(Image.merge("RGBA", (r, g, b, a)))
        out.alpha_composite(gb, (pad, pad))
    return out


def contact_sheet(keys, dst, vanilla=None, scale=8, cols=3):
    """Each texture on vanilla grey, at night with its glow, its glow layer alone, and (when given) vanilla's own
    texture of that name on grey for comparison."""
    tiles = []
    for key in keys:
        im = OUT[key]
        w, h = im.size
        big = im.resize((w * scale, h * scale), Image.NEAREST)
        parts = [_on(checker(big.size, (139, 139, 139, 255), (128, 128, 128, 255), cell=scale), big)]
        g = OUT.get(GLOW.get(key, ""))
        parts.append(night(im, g, scale))
        if g is not None:
            parts.append(_on(Image.new("RGBA", big.size, (0, 0, 0, 255)), g.resize(big.size, Image.NEAREST)))
        name = key.split("/")[-1]
        if vanilla and key.startswith("minecraft:"):
            src = PLANTS.get(key.split("textures/", 1)[1][:-4], (None,))[0]
            if src:
                v = vanilla.image(f"textures/{src}.png")
                parts.append(_on(Image.new("RGBA", big.size, (139, 139, 139, 255)),
                                 v.resize(big.size, Image.NEAREST)))
        cw = sum(p.width for p in parts) + 6 * len(parts)
        cell = Image.new("RGBA", (cw, max(p.height for p in parts) + 18), (40, 40, 46, 255))
        x = 0
        for p in parts:
            cell.paste(p, (x, 18))
            x += p.width + 6
        ImageDraw.Draw(cell).text((2, 3), name + ("   (last: vanilla)" if vanilla and len(parts) > 3 else ""),
                                  fill=(235, 235, 235, 255))
        tiles.append(cell)
    cw = max(t.width for t in tiles) + 8
    ch = max(t.height for t in tiles) + 8
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cw * cols + 8, ch * rows + 8), (28, 28, 33, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, (8 + (i % cols) * cw, 8 + (i // cols) * ch))
    sheet.save(dst)
    return dst


def crossed(tex, scale=6):
    """A quick in-world look: the texture on two crossed planes seen at 3/4 (as block/cross draws it)."""
    w, h = tex.size
    a = tex.resize((int(w * 0.75), h), Image.NEAREST)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(a, (0, 0))
    out.alpha_composite(a.transpose(Image.FLIP_LEFT_RIGHT), (w - a.width, 0))
    return out.resize((w * scale, h * scale), Image.NEAREST)


def growth_strip(dst, vanilla, scale=6):
    """Both crops growing, at night: each stage as the game stacks it (pod box, lower and upper halves)."""
    T = lambda n: OUT.get(f"minecraft:textures/block/{n}.png") or vanilla.image(f"textures/block/{n}.png")  # noqa: E731
    G = lambda n: OUT.get(GLOW.get(f"minecraft:textures/block/{n}.png", ""))  # noqa: E731
    cols = [("torch 0", [("torchflower_crop_stage0", 0)]), ("torch 1", [("torchflower_crop_stage1", 0)]),
            ("torchflower", [("torchflower", 0)]),
            ("pitcher 0", [("pod", 0)]), ("pitcher 1", [("pitcher_crop_bottom_stage_1", 0), ("pod", 0)]),
            ("pitcher 2", [("pitcher_crop_bottom_stage_2", 0), ("pod", 0)]),
            ("pitcher 3", [("pitcher_crop_bottom_stage_3", 0), ("pitcher_crop_top_stage_3", 1), ("pod", 0)]),
            ("pitcher 4", [("pitcher_crop_bottom_stage_4", 0), ("pitcher_crop_top_stage_4", 1), ("pod", 0)]),
            ("pitcher plant", [("pitcher_plant_bottom", -5), ("pitcher_plant_top", 11)])]
    cell_w, cell_h = 16 * scale + 20, 36 * scale + 30
    sheet = Image.new("RGBA", (cell_w * len(cols) + 10, cell_h), (12, 14, 24, 255))
    d = ImageDraw.Draw(sheet)
    ground = cell_h - 22 - 4 * scale
    d.rectangle((0, ground, sheet.width, cell_h), fill=(30, 22, 16, 255))
    for i, (label, layers) in enumerate(cols):
        x0 = 10 + i * cell_w
        for name, dy in layers:
            if name == "pod":
                pod = T("pitcher_crop_side").crop((3, 10, 13, 16)).resize((10 * scale, 6 * scale), Image.NEAREST)
                sheet.alpha_composite(pod, (x0 + 3 * scale, ground - 5 * scale))
                continue
            y_px = dy if dy in (-5, 11) else dy * 16
            top = ground - (y_px + 16) * scale
            if dy == 0 and name.startswith("pitcher_crop_bottom"):
                top -= 5 * scale                      # the leaves start on top of the pod (y 5)
            sheet.alpha_composite(night(T(name), G(name), scale).crop((4 * scale, 4 * scale, 20 * scale,
                                                                       20 * scale)), (x0, top))
        d.text((x0, cell_h - 16), label, fill=(235, 235, 235, 255))
    sheet.save(dst)
    return dst


def particle_strip(dst, scale=12):
    keys = sorted((k for k in OUT if "/particle/" in k), key=lambda k: int(k.rsplit("_", 1)[1][:-4]))
    ims = [OUT[k] for k in keys]
    tw = 16 * scale
    row = Image.new("RGBA", (len(ims) * (tw * 2 + 12) + 8, tw + 30), (34, 34, 40, 255))
    ImageDraw.Draw(row).text((4, 4), f"sweet_scent x{len(ims)} (checker, night)", fill=(235, 235, 235, 255))
    for i, im in enumerate(ims):
        big = im.resize((tw, tw), Image.NEAREST)
        x = 4 + i * (tw * 2 + 12)
        row.paste(_on(checker((tw, tw), (156, 156, 160, 255), (118, 118, 124, 255), cell=scale), big), (x, 22))
        row.paste(_on(Image.new("RGBA", (tw, tw), (14, 16, 26, 255)), big), (x + tw + 2, 22))
    row.save(dst)
    return dst


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write contact sheets here")
    ap.add_argument("--vanilla", type=Path, help="the Minecraft 1.21.1 client jar, or an unpacked one (default: "
                                                  "Fabric Loom's cache)")
    ap.add_argument("--no-write", action="store_true", help="do not write into the mod assets")
    a = ap.parse_args()
    src = find_vanilla(a.vanilla)
    vanilla = Vanilla(src) if src else None
    if vanilla:
        build_plants(vanilla)
    else:
        print("no Minecraft 1.21.1 jar found (pass --vanilla): the torchflower and pitcher textures are not rebuilt")
    if not a.no_write:
        write_all()
    for key, im in sorted(OUT.items()):
        print(f"{key:66s} {im.size[0]}x{im.size[1]}")
    for key in sorted(JSON):
        print(key)
    if a.preview:
        a.preview.mkdir(parents=True, exist_ok=True)
        main_keys = [k for k in OUT if "/particle/" not in k and not k.endswith("_glow.png")]
        print("sheet:", contact_sheet(sorted(main_keys), a.preview / "bloom_textures.png", vanilla))
        if vanilla:
            print("sheet:", growth_strip(a.preview / "bloom_growth.png", vanilla))
        print("sheet:", particle_strip(a.preview / "bloom_particles.png"))


if __name__ == "__main__":
    main()
