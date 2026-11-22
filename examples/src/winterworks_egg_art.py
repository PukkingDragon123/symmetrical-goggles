#!/usr/bin/env python3
"""Winterworks pixel art for the Harvester Egg (mods/winterworks/docs/FIXES_0_4.md, "Reviving it").

    python examples/src/winterworks_egg_art.py                  # write the textures and block models
    python examples/src/winterworks_egg_art.py --preview DIR    # also write a contact sheet to DIR

A block like the vanilla sniffer egg, in the same model style (one 14 x 16 x 12 box, its own texture on each face) and
in the Harvester's colours: a big mustard-yellow egg, lighter at the top and towards the middle of each face, darker
round its edges and underneath, speckled all over in dark green (fine flecks, a few bigger blotches, like a reptile's
egg), and cracking in three stages (dark cracks with a lit lip, more and longer each stage, a chipped hole at the end).
The speckles and cracks are seeded, so every run draws the same egg.

Writes (namespace winterworks):
    textures/block/harvester_egg_{not_cracked,slightly_cracked,very_cracked}_{north,south,east,west,top,bottom}.png
        16 x 16, the used area from the top-left like vanilla's (north/south 14 x 16, east/west 12 x 16,
        top/bottom 14 x 12)
    models/block/harvester_egg.json (the box, the sniffer egg's shape) and
    models/block/harvester_egg_{not_cracked,slightly_cracked,very_cracked}.json (one per hatch stage 0, 1, 2)
    textures/item/harvester_egg.png the item icon
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winterworks_art import ASSETS, rgba  # noqa: E402  (no side effects)

OUT: dict[str, Image.Image] = {}
JSON: dict[str, dict] = {}

# the Harvester's mustard yellow (dark -> light), its dark moss green, crack colours
YELLOW = ["#5a380b", "#7c5110", "#9c6913", "#ba8217", "#d39b1f", "#e5b02a", "#f2c63b", "#fbdb5e", "#fff0a0"]
GREEN = ["#0a2119", "#0e3024", "#14412f", "#1b543a", "#236845"]
CRACK, LIP, HOLE = "#2b1a08", "#fde98e", "#140c05"
STAGES = ("not_cracked", "slightly_cracked", "very_cracked")
FACES = {"north": (14, 16), "south": (14, 16), "east": (12, 16), "west": (12, 16), "top": (14, 12),
         "bottom": (14, 12)}


def shade(face, w, h):
    """The egg's tone at each texel (an index into YELLOW): lit towards the top and the middle of the face, darker at
    the edges and the bottom, in clean steps."""
    tone = [[0.0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            u, v = (x + 0.5) / w * 2 - 1, (y + 0.5) / h * 2 - 1        # -1..1 across the face, v down
            t = 5.4 - 1.6 * u * u - 1.2 * v * v
            if face in ("north", "south", "east", "west"):
                t += -0.9 * v + (0.4 if face in ("north", "west") else -0.2)
            elif face == "top":
                t += 1.0
            else:
                t -= 2.2
            tone[y][x] = max(0, min(len(YELLOW) - 1, round(t)))
    return tone


def speckles(face, w, h, rnd):
    """Dark green flecks: mostly single texels and pairs, a few bigger blotches; fewer underneath."""
    marks = []
    n = {"bottom": 6}.get(face, int(w * h * 0.08))
    blob = [(1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (3, 1), (0, 2), (1, 2), (2, 2), (3, 2), (1, 3), (2, 3)]
    shapes = [[(0, 0)]] * 5 + [[(0, 0), (1, 0)], [(0, 0), (0, 1)]] * 2 + \
             [[(0, 0), (1, 0), (0, 1), (1, 1)]] * 2 + [[(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)], blob]
    for _ in range(n):
        x, y = rnd.randrange(w), rnd.randrange(h)
        sh = rnd.choice(shapes)
        tone = rnd.choice((1, 2, 2, 3))
        marks += [(x + dx, y + dy, tone) for dx, dy in sh]
    return marks


def crack(w, h, rnd, length, start=None):
    """A crack wandering down from the top edge (or `start`): a list of texels, each touching the last."""
    x, y = start if start else (rnd.randrange(2, w - 2), 0)
    pts = [(x, y)]
    dx = rnd.choice((-1, 1))
    for _ in range(length):
        if rnd.random() < 0.35:
            dx = -dx
        if rnd.random() < 0.55:
            y += 1
        else:
            x += dx
        if not (0 <= x < w and 0 <= y < h):
            break
        pts.append((x, y))
    return pts


def face_image(stage, face):
    w, h = FACES[face]
    seed = sum(ord(c) for c in face) * 31
    rnd = random.Random(seed)
    tone = shade(face, w, h)
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = rgba(YELLOW[tone[y][x]])
    for x, y, t in speckles(face, w, h, rnd):
        if 0 <= x < w and 0 <= y < h:
            px[x, y] = rgba(GREEN[max(0, t - (1 if tone[y][x] < 4 else 0))])
    # cracks: the same ones grow from stage to stage (same seeds), more of them each stage
    if face != "bottom":
        crnd = random.Random(seed + 7)
        plan = [(crnd.randrange(2, w - 2), crnd.randrange(8, 14), crnd.random()) for _ in range(4)]
        count, grow = {"not_cracked": (0, 0), "slightly_cracked": (2, 0.6), "very_cracked": (4, 1.0)}[stage]
        if face == "top":
            count = min(count, 2)
        for k in range(count):
            x0, length, _ = plan[k]
            pts = crack(w, h, random.Random(seed + 100 + k), int(length * grow), start=(x0, 0))
            for x, y in pts:
                if x + 1 < w and (x + 1, y) not in pts:
                    px[x + 1, y] = rgba(LIP)
            for x, y in pts:
                px[x, y] = rgba(CRACK)
            if stage == "very_cracked" and k == 0 and face in ("north", "south"):
                # a chipped hole where a bit of shell came away, the dark inside showing
                cx, cy = pts[min(len(pts) - 1, 4)]
                for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 1), (0, 2)):
                    if 0 <= cx + dx < w and 0 <= cy + dy < h:
                        px[cx + dx, cy + dy] = rgba(HOLE)
                if 0 <= cx + 2 < w:
                    px[cx + 2, cy] = rgba(LIP)
    return im


for stage in STAGES:
    for face in FACES:
        OUT[f"textures/block/harvester_egg_{stage}_{face}.png"] = face_image(stage, face)
    JSON[f"models/block/harvester_egg_{stage}.json"] = {
        "parent": "winterworks:block/harvester_egg",
        "textures": {f: f"winterworks:block/harvester_egg_{stage}_{f}" for f in FACES}}

# the egg's shape: one box, 14 wide, 16 tall, 12 deep, like the sniffer egg
JSON["models/block/harvester_egg.json"] = {
    "textures": {"particle": "#north"},
    "elements": [{"from": [1, 0, 2], "to": [15, 16, 14], "faces": {
        "north": {"uv": [0, 0, 14, 16], "texture": "#north"},
        "east": {"uv": [0, 0, 12, 16], "texture": "#east"},
        "south": {"uv": [0, 0, 14, 16], "texture": "#south"},
        "west": {"uv": [0, 0, 12, 16], "texture": "#west"},
        "up": {"uv": [0, 0, 14, 12], "texture": "#top", "cullface": "up"},
        "down": {"uv": [0, 0, 14, 12], "texture": "#bottom", "cullface": "down"}}}]}


def item_icon():
    """An upright egg: lit top-left, a darker outline, the same dark green speckles."""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()
    cx, cy, rx, ry = 7.5, 8.3, 5.6, 7.2
    inside = {}
    for y in range(16):
        for x in range(16):
            u, v = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            v2 = v * (0.86 if v < 0 else 1.0)          # narrower towards the top
            d = u * u + v2 * v2 * (1.12 if v < 0 else 1.0)
            if d <= 1.0:
                inside[(x, y)] = d
    for (x, y), d in inside.items():
        edge = any((x + dx, y + dy) not in inside for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        u, v = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
        t = 6.0 - 2.2 * (u + 0.35) ** 2 - 1.6 * (v + 0.3) ** 2 - 0.8 * v
        t = max(1, min(8, round(t)))
        px[x, y] = rgba(YELLOW[1] if edge else YELLOW[t])
    rnd = random.Random(5)
    for _ in range(28):
        x, y = rnd.randrange(16), rnd.randrange(16)
        for dx, dy in rnd.choice(([(0, 0)], [(0, 0)], [(0, 0), (1, 0)], [(0, 0), (1, 0), (0, 1), (1, 1)])):
            p = (x + dx, y + dy)
            if p in inside and all((p[0] + a, p[1] + b) in inside for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[p] = rgba(GREEN[rnd.choice((1, 2, 3))])
    for p in ((5, 3), (4, 4), (5, 4), (4, 5)):          # the shine
        if p in inside:
            px[p] = rgba(YELLOW[8])
    return im


OUT["textures/item/harvester_egg.png"] = item_icon()


def write_all():
    for rel, im in sorted(OUT.items()):
        dst = ASSETS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst)
    for rel, body in sorted(JSON.items()):
        dst = ASSETS / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(body, indent=2) + "\n")


def box_view(stage, scale=10):
    """The egg block drawn as the model shows it: front (north), side (east) and top, in a simple oblique view."""
    n = OUT[f"textures/block/harvester_egg_{stage}_north.png"].crop((0, 0, 14, 16))
    e = OUT[f"textures/block/harvester_egg_{stage}_east.png"].crop((0, 0, 12, 16))
    t = OUT[f"textures/block/harvester_egg_{stage}_top.png"].crop((0, 0, 14, 12))
    W, H = (14 + 12) * scale + 20, (16 + 12) * scale // 1 + 20
    out = Image.new("RGBA", (W, H), (40, 44, 52, 255))
    side = e.resize((12 * scale // 2, 16 * scale), Image.NEAREST)
    side = side.transform(side.size, Image.AFFINE, (1, 0, 0, 0.5, 1, -0.5 * side.width), Image.NEAREST)
    top = t.resize((14 * scale, 12 * scale // 2), Image.NEAREST)
    out.alpha_composite(n.resize((14 * scale, 16 * scale), Image.NEAREST), (10, 10 + 12 * scale // 2))
    dim = Image.new("RGBA", side.size, (0, 0, 0, 0))
    dim.alpha_composite(side)
    out.alpha_composite(dim, (10 + 14 * scale, 10 + 12 * scale // 2 - side.width // 2))
    out.alpha_composite(top, (10, 10))
    return out


def contact(dst, scale=10):
    rows = []
    for stage in STAGES:
        cells = [box_view(stage, scale)]
        for face in FACES:
            im = OUT[f"textures/block/harvester_egg_{stage}_{face}.png"]
            big = Image.new("RGBA", (16 * scale, 16 * scale), (139, 139, 139, 255))
            big.alpha_composite(im.resize((16 * scale, 16 * scale), Image.NEAREST))
            cells.append(big)
        rows.append((stage, cells))
    W = max(sum(c.width + 8 for c in cells) for _, cells in rows) + 8
    H = sum(max(c.height for c in cells) + 24 for _, cells in rows) + 16 * scale + 40
    sheet = Image.new("RGBA", (W, H), (28, 28, 33, 255))
    d = ImageDraw.Draw(sheet)
    y = 4
    for stage, cells in rows:
        d.text((8, y), f"harvester_egg_{stage}: model | " + " | ".join(FACES), fill=(235, 235, 235, 255))
        x = 8
        for c in cells:
            sheet.alpha_composite(c, (x, y + 16))
            x += c.width + 8
        y += max(c.height for c in cells) + 24
    d.text((8, y), "item/harvester_egg (8x, 1x, 2x)", fill=(235, 235, 235, 255))
    it = OUT["textures/item/harvester_egg.png"]
    bg = Image.new("RGBA", (16 * 8, 16 * 8), (139, 139, 139, 255))
    bg.alpha_composite(it.resize((128, 128), Image.NEAREST))
    sheet.alpha_composite(bg, (8, y + 16))
    one = Image.new("RGBA", (20, 20), (139, 139, 139, 255))
    one.alpha_composite(it, (2, 2))
    sheet.alpha_composite(one, (150, y + 16))
    sheet.alpha_composite(one.resize((40, 40), Image.NEAREST), (180, y + 16))
    sheet.save(dst)
    return dst


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write a contact sheet here")
    ap.add_argument("--no-write", action="store_true", help="do not write into the mod assets")
    a = ap.parse_args()
    if not a.no_write:
        write_all()
    for rel in sorted(OUT) + sorted(JSON):
        print(rel)
    if a.preview:
        a.preview.mkdir(parents=True, exist_ok=True)
        print("sheet:", contact(a.preview / "harvester_egg.png"))


if __name__ == "__main__":
    main()
