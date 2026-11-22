#!/usr/bin/env python3
"""Winterworks Coaster Rail as a 3D roller-coaster track: block models and their textures.

    python examples/src/winterworks_coaster_track.py                  # write the models and textures into the mod
    python examples/src/winterworks_coaster_track.py --preview DIR    # also write a software-rendered preview

A track piece that looks right floating in the air: two round steel rails on cross-ties, each tie held by a steel
bracket on a central box-girder spine (with a bottom flange). Everything below the ground plane (the brackets and
the spine, the lower half of the ties) disappears into the block underneath when the rail sits on the ground, and
nothing is coplanar with y = 0, so it never z-fights; floating, the whole girder shows. The rail tops are 2 px up,
where carts ride (the vanilla rail plane is 1 px).

Shapes (vanilla RailShape values; the blockstate rotates these three models):
  coaster_rail_straight   runs north-south                      north_south (y 0), east_west (y 90)
  coaster_rail_ascending  rises toward the north, 45 degrees      ascending_north (y 0), ascending_east (y 90),
                                                                  ascending_south (y 180), ascending_west (y 270)
  coaster_rail_corner     joins the south and east edges         south_east (y 0), south_west (y 90),
                                                                  north_west (y 180), north_east (y 270)
The ties carry tintindex 0 (the rail's paint colour, oak brown when unpainted: express/RailPaint#tint).

Textures are hand-placed ASCII grids like winterworks_art.py ('.' never occurs: they are opaque).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from winterworks_art import ASSETS, draw, pal, parse  # noqa: E402  (no side effects)

M = "winterworks"
OUT = {}      # texture path -> image
MODELS = {}   # model name -> json

# ====================================================================== textures
# steel: one texture, light rows at the top (sampled by the tops of rails and the spine) shading down to the
# undersides; a polished line, rivets on the spine rows
STEEL = {"0": "#26252d", "1": "#3a3943", "2": "#53525c", "3": "#6c6b74", "4": "#878690", "5": "#a3a2a8",
         "6": "#c4c2c2", "7": "#e6e2da"}
OUT["coaster_track_rail"] = draw(parse("""
6776 7767 6777 6776
5665 6656 5666 5665
4554 5545 4555 4554
3443 4434 3444 3443
3443 4434 3444 3443
2332 3323 2333 2332
2332 3323 2333 2332
1221 2212 1222 1221
6776 7767 6777 6776
5665 6656 5666 5665
4554 4545 4554 4554
4444 4444 4444 4444
3443 4434 3444 3443
3333 3333 3333 3333
2332 3323 2333 2332
1111 1111 1111 1111
"""), pal(STEEL), (16, 16), "coaster_track_rail")
# spine (box girder): darker painted steel, a seam line and a row of rivets near each edge
OUT["coaster_track_spine"] = draw(parse("""
4554 5545 4554 5545
3443 4434 3443 4434
3636 3363 6336 3633
3333 3332 3333 3233
2332 3323 2332 3323
2222 2232 2222 3222
2332 3323 2332 3323
1111 1111 1111 1111
2332 3323 2332 3323
2222 2232 2222 3222
2332 3323 2332 3323
2222 2222 2222 2222
2525 2252 5225 2522
2112 1121 2112 1121
1111 1111 1111 1111
0000 0000 0000 0000
"""), pal(STEEL), (16, 16), "coaster_track_spine")
# ties: greyscale wood (tinted by the paint colour), grain along the tie, a dark bolt where each rail sits
GREY = {"0": "#4a4a4a", "1": "#646464", "2": "#7c7c7c", "3": "#949494", "4": "#acacac", "5": "#c4c4c4",
        "6": "#dadada", "7": "#eeeeee"}
OUT["coaster_track_ties"] = draw(parse("""
6766 7667 6766 7676
5655 6556 5565 6565
5545 5455 4555 5455
4454 4544 5444 4544
4344 3443 4434 4434
3433 4334 3343 3343
5655 6556 5565 6565
4454 4544 5444 4544
3433 4334 3343 3343
2322 3223 2232 2232
6766 7667 6766 7676
5655 6556 5565 6565
4454 4544 5444 4544
3433 4334 3343 3343
2322 3223 2232 2232
1211 2112 1121 1121
"""), pal(GREY), (16, 16), "coaster_track_ties")
OUT["coaster_track_bracket"] = draw(parse("""
5665 6656 5666 5665
4554 5545 4555 4554
3443 4434 3444 3443
3443 4434 3444 3443
3443 4434 3444 3443
2332 3323 2333 2332
2332 3323 2333 2332
1221 2212 1222 1221
5665 6656 5666 5665
4554 5545 4555 4554
3443 4434 3444 3443
3443 4434 3444 3443
3443 4434 3444 3443
2332 3323 2333 2332
2332 3323 2333 2332
1221 2212 1222 1221
"""), pal(STEEL), (16, 16), "coaster_track_bracket")

# ====================================================================== geometry (block pixels)
RAIL_X = (3.25, 12.75)        # rail centre lines on the straight piece (the textures' gauge)
RAIL_W, RAIL_Y = 1.5, (0.75, 2.0)
TIE_W, TIE_Y, TIE_HALF = 2.0, (-0.25, 0.75), 7.0     # tie length 14 (x 1..15)
BRACKET_W, BRACKET_Y, BRACKET_HALF = 1.0, (-1.75, -0.25), 3.5
SPINE_HALF, SPINE_Y = 2.0, (-5.5, -1.75)
FLANGE_HALF, FLANGE_Y = 3.0, (-6.25, -5.5)
TIE_Z = (2, 6, 10, 14)
CORNER_TIE_HALF = 5.75                               # shorter on the curve, so the fan of ties stays tidy inside


def face(tex, u0, v0, u1, v1, tint=False):
    f = {"texture": "#" + tex, "uv": [round(u0, 3), round(v0, 3), round(u1, 3), round(v1, 3)]}
    if tint:
        f["tintindex"] = 0
    return f


def clamp_uv(a, b):
    """Map a length onto 0..16 texture space (wrapping long elements into the texture's width)."""
    span = min(16.0, b - a)
    return 0.0, span


def element(lo, hi, tex, rot=None, tint=False, faces="all", band=(0, 16)):
    """An axis-aligned box from lo to hi with UVs sized to its faces. `band` picks texture rows for the sides
    (v range) so a thin element samples the right shade band; its top samples the band's first rows."""
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    sx, sy, sz = x1 - x0, y1 - y0, z1 - z0
    v0 = band[0]
    vh = min(16.0, max(sy, 0.5))
    fs = {}
    names = ["north", "south", "east", "west", "up", "down"] if faces == "all" else faces
    for n in names:
        if n in ("north", "south"):
            fs[n] = face(tex, 0, v0, min(16, sx), min(16, v0 + vh), tint)
        elif n in ("east", "west"):
            fs[n] = face(tex, 0, v0, min(16, sz), min(16, v0 + vh), tint)
        elif n == "up":
            fs[n] = face(tex, 0, band[0], min(16, sx), min(16, band[0] + min(16, sz) / 4), tint)
            if sz > sx:   # long along z: the texture's rows run along the element
                fs[n] = face(tex, 0, band[0], min(16, sz), min(16, band[0] + max(0.5, sx)), tint)
                fs[n]["rotation"] = 90
        elif n == "down":
            fs[n] = face(tex, 0, 16 - max(0.5, min(16, sx if sz > sx else sz)), min(16, sz if sz > sx else sx), 16,
                         tint)
            if sz > sx:
                fs[n]["rotation"] = 90
    e = {"from": [round(v, 4) for v in lo], "to": [round(v, 4) for v in hi], "faces": fs}
    if rot:
        e["rotation"] = rot
    return e


def straight_elements(yoff=0.0, zlen=16.0, zscale=1.0, rot=None):
    """The straight piece along z, optionally lifted by yoff, stretched to zlen and rotated (the ascending piece)."""
    zc = 8.0
    z0, z1 = zc - zlen / 2, zc + zlen / 2
    els = []
    for x in RAIL_X:
        els.append(element((x - RAIL_W / 2, RAIL_Y[0] + yoff, z0), (x + RAIL_W / 2, RAIL_Y[1] + yoff, z1),
                           "rail", rot, band=(1, 8), faces=["east", "west", "up", "down"]))
    for z in TIE_Z:
        zz = zc + (z - zc) * zscale
        els.append(element((8 - TIE_HALF, TIE_Y[0] + yoff, zz - TIE_W / 2), (8 + TIE_HALF, TIE_Y[1] + yoff, zz + TIE_W / 2),
                           "ties", rot, tint=True))
        els.append(element((8 - BRACKET_HALF, BRACKET_Y[0] + yoff, zz - BRACKET_W / 2),
                           (8 + BRACKET_HALF, BRACKET_Y[1] + yoff, zz + BRACKET_W / 2), "bracket", rot,
                           faces=["north", "south", "east", "west", "down"]))
    els.append(element((8 - SPINE_HALF, SPINE_Y[0] + yoff, z0), (8 + SPINE_HALF, SPINE_Y[1] + yoff, z1), "spine",
                       rot, faces=["east", "west", "up", "down"]))
    els.append(element((8 - FLANGE_HALF, FLANGE_Y[0] + yoff, z0), (8 + FLANGE_HALF, FLANGE_Y[1] + yoff, z1), "rail",
                       rot, band=(8, 16), faces=["east", "west", "up", "down"]))
    return els


def model(elements):
    return {"ambientocclusion": False,
            "textures": {"particle": f"{M}:block/coaster_track_rail", "rail": f"{M}:block/coaster_track_rail",
                         "ties": f"{M}:block/coaster_track_ties", "bracket": f"{M}:block/coaster_track_bracket",
                         "spine": f"{M}:block/coaster_track_spine"},
            "elements": elements}


MODELS["coaster_rail_straight"] = model(straight_elements())
# ascending: the straight piece lifted 8 px and stretched to the slope length (16 * sqrt 2), then turned 45 degrees
# about x round its middle (8, 10, 8), so the rail tops run from 2 px at the south edge to 18 px at the north
SLOPE = 16 * math.sqrt(2)
MODELS["coaster_rail_ascending"] = model(straight_elements(
    yoff=8.0, zlen=SLOPE, zscale=math.sqrt(2), rot={"origin": [8, 10, 8], "axis": "x", "angle": 45}))


# corner: a 90 degree curve round the south-east corner (centre (16, 16), centre line radius 8), built from straight
# segments tangent to the circle at 0, 22.5, 45, 67.5 and 90 degrees (the angles a block model may rotate by)
def corner_elements():
    els = []
    t = math.tan(math.radians(11.25))

    def segs(r):
        """[(centre x, centre z, length, phi)] for a ring of radius r round (16, 16)."""
        out = []
        for phi in (0, 22.5, 45, 67.5, 90):
            p = math.radians(phi)
            px, pz = 16 - r * math.cos(p), 16 - r * math.sin(p)
            dx, dz = math.sin(p), -math.cos(p)
            if phi == 0:
                L = r * t
                out.append((px + dx * L / 2, pz + dz * L / 2, L, phi))
            elif phi == 90:
                L = r * t
                out.append((px - dx * L / 2, pz - dz * L / 2, L, phi))
            else:
                out.append((px, pz, 2 * r * t, phi))
        return out

    def along(cx, cz, length, half_w, y0, y1, phi, tex, band=(0, 16), faces=None, tint=False):
        """A box of the given length along the track direction phi, half width half_w across it."""
        if phi in (0, 22.5, 45):              # built along z, turned by -phi
            lo, hi = (cx - half_w, y0, cz - length / 2), (cx + half_w, y1, cz + length / 2)
            angle = -phi
        else:                                 # built along x, turned by 90 - phi
            lo, hi = (cx - length / 2, y0, cz - half_w), (cx + length / 2, y1, cz + half_w)
            angle = 90 - phi
        rot = {"origin": [round(cx, 4), 8, round(cz, 4)], "axis": "y", "angle": angle} if angle else None
        if faces is None:
            faces = ["east", "west", "up", "down"] if phi in (0, 22.5, 45) else ["north", "south", "up", "down"]
        return element(lo, hi, tex, rot, tint=tint, faces=faces, band=band)

    for x in RAIL_X:
        r = 16 - x
        for cx, cz, L, phi in segs(r):
            els.append(along(cx, cz, L + 0.3, RAIL_W / 2, RAIL_Y[0], RAIL_Y[1], phi, "rail", band=(1, 8)))
    for cx, cz, L, phi in segs(8):
        els.append(along(cx, cz, L + 0.3, SPINE_HALF, SPINE_Y[0], SPINE_Y[1], phi, "spine"))
        els.append(along(cx, cz, L + 0.3, FLANGE_HALF, FLANGE_Y[0], FLANGE_Y[1], phi, "rail", band=(8, 16)))
    # ties and brackets: radial, at 22.5, 45 and 67.5 degrees (a tie is a box along the radius)
    for phi in (22.5, 45, 67.5):
        p = math.radians(phi)
        cx, cz = 16 - 8 * math.cos(p), 16 - 8 * math.sin(p)
        # radial = across the track: build across the local direction, i.e. along the direction phi + 90
        for half_len, half_w, (y0, y1), tex, tint in ((CORNER_TIE_HALF, TIE_W / 2, TIE_Y, "ties", True),
                                                       (BRACKET_HALF, BRACKET_W / 2, BRACKET_Y, "bracket", False)):
            if phi == 67.5:          # across = along z turned by 22.5
                lo, hi = (cx - half_w, y0, cz - half_len), (cx + half_w, y1, cz + half_len)
                angle = 22.5
            else:                    # across = along x turned by -phi
                lo, hi = (cx - half_len, y0, cz - half_w), (cx + half_len, y1, cz + half_w)
                angle = -phi
            els.append(element(lo, hi, tex, {"origin": [round(cx, 4), 8, round(cz, 4)], "axis": "y", "angle": angle},
                               tint=tint))
    # the straight stubs at both edges: a tie 2 px in from each edge, like the straight piece
    els.append(element((8 - TIE_HALF, TIE_Y[0], 14 - TIE_W / 2), (8 + TIE_HALF, TIE_Y[1], 14 + TIE_W / 2), "ties",
                       tint=True))
    els.append(element((14 - TIE_W / 2, TIE_Y[0], 8 - TIE_HALF), (14 + TIE_W / 2, TIE_Y[1], 8 + TIE_HALF), "ties",
                       tint=True))
    for lo, hi in (((8 - BRACKET_HALF, BRACKET_Y[0], 14 - BRACKET_W / 2), (8 + BRACKET_HALF, BRACKET_Y[1], 14 + BRACKET_W / 2)),
                   ((14 - BRACKET_W / 2, BRACKET_Y[0], 8 - BRACKET_HALF), (14 + BRACKET_W / 2, BRACKET_Y[1], 8 + BRACKET_HALF))):
        els.append(element(lo, hi, "bracket", faces=["north", "south", "east", "west", "down"]))
    return els


MODELS["coaster_rail_corner"] = model(corner_elements())

# blockstate mapping (the vanilla RailShape values of express/CoasterRailBlock)
BLOCKSTATE = {
    "shape=north_south": ("coaster_rail_straight", 0), "shape=east_west": ("coaster_rail_straight", 90),
    "shape=ascending_north": ("coaster_rail_ascending", 0), "shape=ascending_east": ("coaster_rail_ascending", 90),
    "shape=ascending_south": ("coaster_rail_ascending", 180), "shape=ascending_west": ("coaster_rail_ascending", 270),
    "shape=south_east": ("coaster_rail_corner", 0), "shape=south_west": ("coaster_rail_corner", 90),
    "shape=north_west": ("coaster_rail_corner", 180), "shape=north_east": ("coaster_rail_corner", 270),
}


def blockstate():
    v = {}
    for key, (name, y) in BLOCKSTATE.items():
        v[key] = {"model": f"{M}:block/{name}"}
        if y:
            v[key]["y"] = y
    return {"variants": v}


# ====================================================================== preview (a tiny software renderer)
def _rot(p, rot):
    if not rot:
        return p
    o = rot["origin"]
    a = math.radians(rot["angle"])
    x, y, z = p[0] - o[0], p[1] - o[1], p[2] - o[2]
    c, s = math.cos(a), math.sin(a)
    if rot["axis"] == "y":
        x, z = x * c + z * s, -x * s + z * c
    elif rot["axis"] == "x":
        y, z = y * c - z * s, y * s + z * c
    else:
        x, y = x * c - y * s, x * s + y * c
    return (x + o[0], y + o[1], z + o[2])


def _turn_y(p, deg):
    """Blockstate y rotation (clockwise seen from above), about the block centre."""
    a = math.radians(-deg)
    x, z = p[0] - 8, p[2] - 8
    c, s = math.cos(a), math.sin(a)
    return (x * c + z * s + 8, p[1], -x * s + z * c + 8)


def preview(dst, scenes):
    """scenes: [(title, [(model name, y rotation, (bx, by, bz) block offset, tint)])] rendered isometrically."""
    from PIL import Image, ImageDraw
    import numpy as np
    tex = {k: np.array(v.convert("RGBA"), dtype=float) for k, v in OUT.items()}
    W, H, S = 520, 420, 9.0
    sheets = []
    for title, items in scenes:
        img = np.zeros((H, W, 3)) + np.array([150, 185, 215])
        zbuf = np.full((H, W), -1e9)
        ax = math.radians(30)

        def proj(p):
            x, y, z = p
            sx = (x - z) * math.cos(ax)
            sy = -(y) + (x + z) * math.sin(ax)
            depth = x + z + y * 0.01
            return W / 2 + sx * S, H * 0.45 + sy * S, depth

        for name, yrot, (bx, by, bz), tint in items:
            for e in MODELS[name]["elements"]:
                lo, hi = e["from"], e["to"]
                corners = {}
                for i, x in enumerate((lo[0], hi[0])):
                    for j, y in enumerate((lo[1], hi[1])):
                        for k, z in enumerate((lo[2], hi[2])):
                            p = _turn_y(_rot((x, y, z), e.get("rotation")), yrot)
                            corners[(i, j, k)] = (p[0] + bx * 16, p[1] + by * 16, p[2] + bz * 16)
                quads = {"up": [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], "down": [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
                         "north": [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], "south": [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
                         "west": [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)], "east": [(1, 0, 0), (1, 0, 1), (1, 1, 1), (1, 1, 0)]}
                shade = {"up": 1.0, "down": 0.5, "north": 0.8, "south": 0.8, "east": 0.6, "west": 0.6}
                for fname, f in e["faces"].items():
                    t = tex["coaster_track_" + f["texture"][1:]]
                    u0, v0, u1, v1 = f["uv"]
                    col = t[int(min(15, (v0 + v1) / 2)), int(min(15, (u0 + u1) / 2)), :3].copy()
                    if f.get("tintindex") == 0:
                        col *= np.array(tint) / 255.0
                    pts = [proj(corners[c]) for c in quads[fname]]
                    _fill(img, zbuf, pts, col * shade[fname], t, f, tint, shade[fname])
        im = Image.fromarray(img.clip(0, 255).astype(np.uint8))
        ImageDraw.Draw(im).text((6, 6), title, fill=(20, 20, 30))
        sheets.append(im)
    out = Image.new("RGB", (W * len(sheets), H))
    for i, s in enumerate(sheets):
        out.paste(s, (i * W, 0))
    out.save(dst)
    return dst


def _fill(img, zbuf, pts, col, tex, f, tint, sh):
    """Flat-shade a quad with a little texture: sample the texture along the quad (nearest)."""
    import numpy as np
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = int(max(0, min(xs))), int(min(img.shape[1] - 1, max(xs) + 1))
    y0, y1 = int(max(0, min(ys))), int(min(img.shape[0] - 1, max(ys) + 1))
    if x1 <= x0 or y1 <= y0:
        return
    (ax, ay, az), (bx, by, bz), (cx, cy, cz), (dx, dy, dz) = pts
    u0, v0, u1, v1 = f["uv"]
    for tri in (((ax, ay, az, 0, 0), (bx, by, bz, 1, 0), (cx, cy, cz, 1, 1)),
                ((ax, ay, az, 0, 0), (cx, cy, cz, 1, 1), (dx, dy, dz, 0, 1))):
        (px, py, pz, pu, pv), (qx, qy, qz, qu, qv), (rx, ry, rz, ru, rv) = tri
        den = (qy - ry) * (px - rx) + (rx - qx) * (py - ry)
        if abs(den) < 1e-9:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        w1 = ((qy - ry) * (xx + 0.5 - rx) + (rx - qx) * (yy + 0.5 - ry)) / den
        w2 = ((ry - py) * (xx + 0.5 - rx) + (px - rx) * (yy + 0.5 - ry)) / den
        w3 = 1 - w1 - w2
        m = (w1 >= 0) & (w2 >= 0) & (w3 >= 0)
        if not m.any():
            continue
        z = w1 * pz + w2 * qz + w3 * rz
        uu = w1 * pu + w2 * qu + w3 * ru
        vv = w1 * pv + w2 * qv + w3 * rv
        tu = np.clip((u0 + (u1 - u0) * uu).astype(int), 0, 15)
        tv = np.clip((v0 + (v1 - v0) * vv).astype(int), 0, 15)
        c = tex[tv, tu, :3] * sh
        if f.get("tintindex") == 0:
            c = c * (np.array(tint) / 255.0)
        sub = zbuf[y0:y1, x0:x1]
        upd = m & (z > sub)
        sub[upd] = z[upd]
        img[y0:y1, x0:x1][upd] = c[upd]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="write a preview image here")
    ap.add_argument("--no-write", action="store_true")
    a = ap.parse_args()
    if not a.no_write:
        for name, im in OUT.items():
            im.save(ASSETS / "textures" / "block" / f"{name}.png")
        for name, body in MODELS.items():
            (ASSETS / "models" / "block" / f"{name}.json").write_text(json.dumps(body, indent=2) + "\n")
    for name in OUT:
        print("textures/block/" + name + ".png")
    for name, body in MODELS.items():
        print(f"models/block/{name}.json  {len(body['elements'])} elements")
    if a.preview:
        a.preview.mkdir(parents=True, exist_ok=True)
        oak = (0x8A, 0x6B, 0x47)
        red = (0xB0, 0x2E, 0x26)
        track = [("coaster_rail_straight", 90, (-1, 0, 0), oak), ("coaster_rail_corner", 180, (0, 0, 0), oak),
                 ("coaster_rail_ascending", 0, (0, 0, -1), oak), ("coaster_rail_straight", 0, (0, 1, -2), oak)]
        print(preview(a.preview / "coaster_track.png", [
            ("straight, corner, ascending, straight (floating)", track),
            ("painted red", [(n, r, o, red) for n, r, o, _ in track]),
            ("one straight piece", [("coaster_rail_straight", 0, (0, 0, 0), oak)]),
        ]))


if __name__ == "__main__":
    main()
