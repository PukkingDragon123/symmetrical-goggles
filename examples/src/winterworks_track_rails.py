#!/usr/bin/env python3
"""Every rail in the game as 3D track in the style of the Coaster Rail: block models and their textures.

    python examples/src/winterworks_track_rails.py                  # write the models and textures into the mod
    python examples/src/winterworks_track_rails.py --preview DIR    # also render contact sheets of every state

The pieces share the coaster track's build (examples/src/winterworks_coaster_track.py): two round steel rails on
cross-ties, a steel bracket under each tie and a box-girder spine below, which hides in the block underneath when the
rail sits on the ground and shows when it hangs free (glass, a drop rail). Rail tops are 2 px up, where a minecart's
floor rides, so nothing here rises above 2 px over the ride plane (a cart is a full block wide).

Vanilla rails (resource overrides; the blockstates in assets/minecraft are written by tools/gen_data.py):
  track_rail_{straight,ascending,corner}           Rail: dark timber sleepers, all 10 shapes
  track_powered_rail_{straight,ascending}{,_on}     Powered Rail: gold-plated ties, a redstone strip in a gold channel
  track_detector_rail_{straight,ascending}{,_on}    Detector Rail: a grille sensor plate, a lamp each side; lit = a cart
  track_activator_rail_{straight,ascending}{,_on}   Activator Rail: red-tipped ties, a fork between the rails that flips
                                                    from north to south and lights when powered
Winterworks rails (sleepers carry tintindex 0: express/RailPaint):
  booster_rail_{straight,ascending}{,_on}           gilt rails, a redstone-block plate (dull / blazing)
  lift_rail_{straight,ascending}{,_on}              a chain hauling up the middle (animated; faster when powered),
                                                    side lamps lit when powered
  trap_rail_{straight,ascending}{,_on}              hazard-striped jaws, brake pads that close on the rails when powered
  drop_rail_{straight,ascending}, drop_rail_open    a two-leaf hatch deck between end sleepers; open, the leaves hang
                                                    down with their rails
  switch_rail_{right,left}{,_on}                    a Y-junction (toe south, straight on north, the branch curving to
                                                    the east / west edge), switch blades, a lamp and the ground throw
Straight pieces run north-south (blockstate y 0 / 90), ascending pieces rise to the north (y 0/90/180/270 = ascending
north/east/south/west), the corner joins the south and east edges (y 0/90/180/270 = south_east/south_west/north_west/
north_east), like the coaster rail's models. `_on` = powered.

Textures are hand-placed ASCII grids like winterworks_art.py; the timber, gold and red-tipped sleepers and the gilt
rails are recolours of the coaster track's own greyscale sleeper and steel textures.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import winterworks_coaster_track as ct  # noqa: E402  (no side effects: builds its dicts in memory)
from winterworks_art import ASSETS, draw, pal, parse  # noqa: E402

M = "winterworks"
OUT = {}      # texture name -> image (block textures)
MCMETA = {}   # texture name -> animation metadata
MODELS = {}   # model name -> json

# ====================================================================== textures
STEEL_KEYS = "01234567"


def recolour(src, ramp, keys=STEEL_KEYS):
    """Map a texture drawn from an 8-step ramp (ct.STEEL or ct.GREY) onto another 8-step ramp, pixel for pixel."""
    src_ramp = {tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)): k for k, c in ramp[0].items()}
    im = src.convert("RGBA").copy()
    px = im.load()
    dst = {k: tuple(int(ramp[1][k][i:i + 2], 16) for i in (1, 3, 5)) for k in keys}
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            k = src_ramp[(r, g, b)]
            px[x, y] = dst[k] + (a,)
    return im


# sleepers for the vanilla Rail: dark, weathered creosoted timber (cooler and darker than an unpainted coaster rail)
TIMBER = {"0": "#1d1814", "1": "#29221c", "2": "#362c24", "3": "#43372c", "4": "#504134", "5": "#5e4c3d",
          "6": "#6c5947", "7": "#7c6853"}
# gold plate for the Powered Rail's sleepers
GOLD = {"0": "#3e2410", "1": "#5c3a15", "2": "#7c531c", "3": "#9c6e24", "4": "#b8892e", "5": "#cfa23c",
        "6": "#dfb84f", "7": "#efd078"}
# the Booster Rail's gilt rails (the coaster steel ramp, gilded)
GILT = {"0": "#3a200e", "1": "#57301a", "2": "#7a4721", "3": "#9c6128", "4": "#b97c31", "5": "#d29a3f",
        "6": "#e4b552", "7": "#f4d27a"}
OUT["track_ties_timber"] = recolour(ct.OUT["coaster_track_ties"], (ct.GREY, TIMBER))
OUT["track_ties_gold"] = recolour(ct.OUT["coaster_track_ties"], (ct.GREY, GOLD))
OUT["track_rail_gilt"] = recolour(ct.OUT["coaster_track_rail"], (ct.STEEL, GILT))

# the Activator Rail's sleepers: timber with red-painted tips. A sleeper's top and sides sample row 0 (u 0..14 = the
# 14 px sleeper, x 1..15), its ends u 0..2; its underside rows 14..15. Tips: u 0..3 and 11..14, outside the rails.
red = OUT["track_ties_timber"].copy()
RED_TRIM = [(0x8e, 0x1d, 0x16), (0xb8, 0x2c, 0x1f), (0xd6, 0x45, 0x2c)]
rp = red.load()
for y in range(16):
    for x in list(range(0, 3)) + list(range(11, 14)):
        if y in (0, 14, 15):
            rp[x, y] = RED_TRIM[(x + y) % 2 + (1 if y == 0 else 0)] + (255,)
OUT["track_ties_red"] = red

# redstone dust material (the Powered Rail's strip); lit = powered
DUST = """
1213 2112 3121 1231
2132 1321 2312 3212
3221 2133 1221 2321
1312 3212 2132 1213
2123 1321 3213 2131
1231 2312 1321 3122
3212 1223 2132 1213
2321 3132 1213 2321
1213 2311 3221 1232
2132 1223 1312 2123
3221 2132 2123 1312
1312 3211 1231 2231
2123 1322 3112 1323
1231 2133 2321 3112
3212 1221 1213 2231
2321 3112 2132 1323
"""
OUT["track_redstone"] = draw(parse(DUST), pal({"1": "#3a0b0b", "2": "#541110", "3": "#701b14"}), (16, 16))
OUT["track_redstone_lit"] = draw(parse(DUST), pal({"1": "#c42416", "2": "#f24c22", "3": "#ffa463"}), (16, 16))

# the Booster Rail's redstone-block inlay: top 5 x 7 at (0, 0) (a bevelled block face), sides from row 8
BLOCK = """
abbbc 33333333333
b1212 33333333333
b2312 33333333333
b1321 33333333333
b2132 33333333333
b1213 33333333333
c2321 33333333333
33333 33333333333
dddddddddddddddd
eeeeeeeeeeeeeeee
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
3333333333333333
"""
OUT["track_redstone_block"] = draw(parse(BLOCK), pal({
    "a": "#8a2a1f", "b": "#74201a", "c": "#3e0d0b", "1": "#4a110d", "2": "#5c1712", "3": "#6a1c15",
    "d": "#5c1712", "e": "#3e0d0b"}), (16, 16))
OUT["track_redstone_block_lit"] = draw(parse(BLOCK), pal({
    "a": "#ffc9a0", "b": "#ff6a3a", "c": "#a3140c", "1": "#e0301c", "2": "#ff6a3a", "3": "#ff8f55",
    "d": "#ff6a3a", "e": "#c4200f"}), (16, 16))

# lamp glass: a box's top samples (0, 0) (a highlight in the corner), its sides rows 4..6; lit = a cart / powered
LAMP = """
4321 3333 3333 3333
3211 3333 3333 3333
2110 3333 3333 3333
1100 3333 3333 3333
3333 3333 3333 3333
2222 2222 2222 2222
1111 1111 1111 1111
3333 3333 3333 3333
3333 3333 3333 3333
3333 3333 3333 3333
3333 3333 3333 3333
3333 3333 3333 3333
3333 3333 3333 3333
3333 3333 3333 3333
3333 3333 3333 3333
3333 3333 3333 3333
"""
OUT["track_lamp"] = draw(parse(LAMP), pal({"0": "#3a1410", "1": "#4f1a14", "2": "#6a2419", "3": "#5a1f16",
                                            "4": "#a8563e"}), (16, 16))
OUT["track_lamp_lit"] = draw(parse(LAMP), pal({"0": "#d4361c", "1": "#f2602c", "2": "#ff9150", "3": "#ff7a3c",
                                                "4": "#fff4d6"}), (16, 16))

# gold metal (the Powered Rail's channel): brushed along the track (u runs along z on the channel's sides, v on top)
GOLDM = """
5665 6556 5666 5565
4554 5445 4555 4454
5665 6556 5666 5565
4554 5445 4555 4454
3443 4334 3444 3343
3443 4334 3444 3343
2332 3223 2333 2232
1221 2112 1222 1121
5665 6556 5666 5565
4554 5445 4555 4454
3443 4334 3444 3343
3443 4334 3444 3343
2332 3223 2333 2232
2332 3223 2333 2232
1221 2112 1222 1121
1111 1111 1111 1111
"""
OUT["track_gold"] = draw(parse(GOLDM), pal(GOLD), (16, 16))

# the Detector Rail's sensor plate: a 6 x 10 grille at (0, 0) (an iron frame round slotted bars), frame rows 12..13
SENSOR = """
dmmmmd 3333333333
mhhhhm 3333333333
mksskm 3333333333
mhhhhm 3333333333
mksskm 3333333333
mhhhhm 3333333333
mksskm 3333333333
mhhhhm 3333333333
mksskm 3333333333
dmmmmd 3333333333
3333333333333333
3333333333333333
mmmmmmmmmmmmmmmm
dddddddddddddddd
3333333333333333
3333333333333333
"""
SENSOR_PAL = {"d": "#3c3b45", "m": "#7b7a84", "h": "#c9c7c3", "b": "#aeacb0", "3": "#5a5964"}
OUT["track_sensor"] = draw(parse(SENSOR), pal(SENSOR_PAL, k="#1c1a20", s="#4a1a15"), (16, 16))
OUT["track_sensor_lit"] = draw(parse(SENSOR), pal(SENSOR_PAL, k="#a3140c", s="#ff7a3c"), (16, 16))

# hazard stripes (yellow and black, diagonal), for the Trap Rail's jaws and the Drop Rail's hatch
hz = Image.new("RGBA", (16, 16))
for y in range(16):
    for x in range(16):
        band = ((x + y) // 2) % 2
        lit = (x + 2 * y) % 5 == 0
        c = ((0xf0, 0xce, 0x60) if lit else (0xd6, 0xaa, 0x34)) if band == 0 else \
            ((0x3a, 0x32, 0x2b) if lit else (0x26, 0x21, 0x1d))
        hz.putpixel((x, y), c + (255,))
OUT["track_hazard"] = hz

# the Drop Rail's hatch leaves (top view, world-projected: x 1.25..14.75, z 2..14): steel plate, hazard edges at both
# ends, the seam down the middle at x = 8 and a red arrow pointing down through it
HATCH = """
3333333333333333
3333333333333333
hyybbyybbyybbyyh
hbyybbyyybbyybbh
hmmmmmmddmmmmmmh
hmmmmmrddrmmmmmh
hmmmmrrddrrmmmmh
hmmmrrrddrrrmmmh
hmmmrrrddrrrmmmh
hmmmmrrddrrmmmmh
hmmmmmrddrmmmmmh
hmmmmmmddmmmmmmh
hbyybbyyybbyybbh
hyybbyybbyybbyyh
dddddddddddddddd
dddddddddddddddd
"""
OUT["track_hatch"] = draw(parse(HATCH), pal({"3": "#5a5964", "h": "#3c3b45", "y": "#d6aa34", "b": "#26211d",
                                             "m": "#6c6b74", "r": "#b02e26", "d": "#45444e"}),
                          (16, 16))

# the Chain Lift's chain, seen from above in columns 0..2: an edge-on link then a flat link (a ring round a dark hole)
# every 8 px, on the dark trough colour; its sides sample row 15. Four frames, each moving the links 2 px north
# (toward the top of a slope rising north): slow unpowered, fast powered.
CHAIN = """
khk 3333333333333
klk 3333333333333
lhl 3333333333333
hkd 3333333333333
hkd 3333333333333
ldl 3333333333333
khk 3333333333333
kdk 3333333333333
khk 3333333333333
klk 3333333333333
lhl 3333333333333
hkd 3333333333333
hkd 3333333333333
ldl 3333333333333
khk 3333333333333
kdk 3333333333333
"""
chain = draw(parse(CHAIN), pal({"h": "#c4c2c2", "l": "#878690", "d": "#53525c", "k": "#1d1c22",
                                "3": "#3a3943"}), (16, 16))
frames = Image.new("RGBA", (16, 64))
for k in range(4):
    f = Image.new("RGBA", (16, 16))
    for y in range(16):
        f.paste(chain.crop((0, (y + 2 * k) % 16, 16, (y + 2 * k) % 16 + 1)), (0, y))
    frames.paste(f, (0, 16 * k))
OUT["track_chain"] = frames
MCMETA["track_chain"] = {"animation": {"frametime": 2}}
OUT["track_chain_fast"] = frames.copy()
MCMETA["track_chain_fast"] = {"animation": {"frametime": 1}}

# ====================================================================== geometry helpers (block pixels)
RAIL_X, RAIL_W, RAIL_Y = ct.RAIL_X, ct.RAIL_W, ct.RAIL_Y
TIE_W, TIE_Y, TIE_HALF, TIE_Z = ct.TIE_W, ct.TIE_Y, ct.TIE_HALF, ct.TIE_Z
BRACKET_W, BRACKET_Y, BRACKET_HALF = ct.BRACKET_W, ct.BRACKET_Y, ct.BRACKET_HALF
SPINE_HALF, SPINE_Y, FLANGE_HALF, FLANGE_Y = ct.SPINE_HALF, ct.SPINE_Y, ct.FLANGE_HALF, ct.FLANGE_Y
ALL = ["north", "south", "east", "west", "up", "down"]
ROOF = 2.0    # nothing rises above the rail tops: a minecart's floor rides there


def part(lo, hi, tex, top=(0, 0), side=(0, 0), end=None, bottom=None, tint=False, faces=ALL, rot=None, along=False):
    """A box with 1 texel per pixel: each face's uv starts at the given origin and is the face's size (clipped to the
    texture). top/bottom: up/down faces (u along x, v along z, seen from above; with along=True turned a quarter so
    the texture's rows run along z); side: east/west (u along z, v down); end: north/south (u along x, v down),
    defaulting to `side`."""
    end = end or side
    bottom = bottom or top
    sx, sy, sz = (hi[i] - lo[i] for i in range(3))

    def uv(o, w, h):
        u0, v0 = o
        return [round(u0, 4), round(v0, 4), round(min(16.0, u0 + w), 4), round(min(16.0, v0 + h), 4)]

    tw, th = (sz, sx) if along else (sx, sz)
    spec = {"up": uv(top, tw, th), "down": uv(bottom, tw, th), "north": uv(end, sx, sy), "south": uv(end, sx, sy),
            "east": uv(side, sz, sy), "west": uv(side, sz, sy)}
    fs = {}
    for n in faces:
        fs[n] = {"texture": "#" + tex, "uv": spec[n]}
        if along and n in ("up", "down"):
            fs[n]["rotation"] = 90
        if tint:
            fs[n]["tintindex"] = 0
    e = {"from": [round(v, 4) for v in lo], "to": [round(v, 4) for v in hi], "faces": fs}
    if rot:
        e["rotation"] = rot
    return e


S2 = math.sqrt(2)
SLOPE_ROT = {"origin": [8, 10, 8], "axis": "x", "angle": 45}


def slope(el, stretch):
    """A flat piece's element on the ascending piece (as the coaster rail builds it): lifted 8 px, turned 45 degrees
    about x round (8, 10, 8). Lengthwise parts (rails, the spine) stretch to the slope length; the rest keep their
    size and move with the stretch, so the rail tops run from 2 px at the south edge to 18 px at the north edge."""
    e = copy.deepcopy(el)
    assert "rotation" not in e, "a part on a slope can't turn about a second axis"
    (x0, y0, z0), (x1, y1, z1) = e["from"], e["to"]
    if stretch:
        z0, z1 = 8 + (z0 - 8) * S2, 8 + (z1 - 8) * S2
    else:
        c, h = (z0 + z1) / 2, (z1 - z0) / 2
        c = 8 + (c - 8) * S2
        z0, z1 = c - h, c + h
    e["from"] = [x0, round(y0 + 8, 4), round(z0, 4)]
    e["to"] = [x1, round(y1 + 8, 4), round(z1, 4)]
    e["rotation"] = dict(SLOPE_ROT)
    return e


def mirror_x(el):
    """The element mirrored across x = 8 (east <-> west). Painted images are not flipped."""
    e = copy.deepcopy(el)
    (x0, y0, z0), (x1, y1, z1) = e["from"], e["to"]
    e["from"], e["to"] = [round(16 - x1, 4), y0, z0], [round(16 - x0, 4), y1, z1]
    if "rotation" in e:
        r = e["rotation"]
        r["origin"] = [round(16 - r["origin"][0], 4)] + r["origin"][1:]
        if r["axis"] in ("y", "z"):
            r["angle"] = -r["angle"]
    fs = e["faces"]
    if "east" in fs or "west" in fs:
        fs["east"], fs["west"] = fs.pop("west", None), fs.pop("east", None)
        e["faces"] = {k: v for k, v in fs.items() if v is not None}
    return e


EPS = 0.01


def inset_ends(els):
    """For a flat piece: a box that ends on the block's side (x or z = 0 or 16; the corner's edge segments poke past
    it and are trimmed) gets that end face as a separate zero-depth cap 0.01 px inside. Against a block face in that
    plane (the ground block's side under the last rail before a drop, a wall the track runs into) the cap then sits
    just behind it instead of z-fighting it; where two pieces join, the caps hide inside the joined boxes."""
    out = []
    for e in els:
        if "rotation" in e:
            out.append(e)
            continue
        e = copy.deepcopy(e)
        caps = []
        for axis, (lo_face, hi_face) in ((0, ("west", "east")), (2, ("north", "south"))):
            if e["from"][axis] <= 1e-6 < e["to"][axis]:
                e["from"][axis] = 0.0
                f = e["faces"].pop(lo_face, None)
                if f:
                    caps.append((axis, EPS, lo_face, f))
            if e["to"][axis] >= 16 - 1e-6 > e["from"][axis]:
                e["to"][axis] = 16.0
                f = e["faces"].pop(hi_face, None)
                if f:
                    caps.append((axis, 16 - EPS, hi_face, f))
        for axis, at, name, f in caps:
            lo, hi = list(e["from"]), list(e["to"])
            lo[axis] = hi[axis] = at
            out.append({"from": lo, "to": hi, "faces": {name: f}})
        out.append(e)
    return out


def base_track(ties="ties", tint=True, rail="rail", tie_z=TIE_Z, tie_half=TIE_HALF):
    """The coaster rail's straight piece as [(element, stretches on a slope)]: rails, sleepers, brackets, girder."""
    ends = ALL
    out = []
    for x in RAIL_X:
        out.append((ct.element((x - RAIL_W / 2, RAIL_Y[0], 0), (x + RAIL_W / 2, RAIL_Y[1], 16), rail, band=(1, 8),
                               faces=ends), True))
    for zz in tie_z:
        out.append((ct.element((8 - tie_half, TIE_Y[0], zz - TIE_W / 2), (8 + tie_half, TIE_Y[1], zz + TIE_W / 2),
                               ties, tint=tint), False))
        out.append((ct.element((8 - BRACKET_HALF, BRACKET_Y[0], zz - BRACKET_W / 2),
                               (8 + BRACKET_HALF, BRACKET_Y[1], zz + BRACKET_W / 2), "bracket",
                               faces=["north", "south", "east", "west", "down"]), False))
    out += girder(0, 16)
    return out


def girder(z0, z1, stretch=True):
    return [(ct.element((8 - SPINE_HALF, SPINE_Y[0], z0), (8 + SPINE_HALF, SPINE_Y[1], z1), "spine", faces=ALL),
             stretch),
            (ct.element((8 - FLANGE_HALF, FLANGE_Y[0], z0), (8 + FLANGE_HALF, FLANGE_Y[1], z1), "flange",
                        band=(8, 16), faces=ALL), stretch)]


def textures(**kw):
    t = {"rail": f"{M}:block/coaster_track_rail", "flange": f"{M}:block/coaster_track_rail",
         "ties": f"{M}:block/coaster_track_ties",
         "bracket": f"{M}:block/coaster_track_bracket", "spine": f"{M}:block/coaster_track_spine"}
    t.update({k: (v if ":" in v else f"{M}:block/{v}") for k, v in kw.items()})
    t.setdefault("particle", t["rail"])
    return t


def model(elements, tex):
    return {"ambientocclusion": False, "textures": tex, "elements": elements}


def child(parent, **tex):
    """A state that only swaps textures (a lit lamp, a glowing strip)."""
    return {"parent": f"{M}:block/{parent}", "textures": {k: f"{M}:block/{v}" for k, v in tex.items()}}


def straight_and_slope(name, parts, tex, lit=None):
    """`name`_straight and `name`_ascending; with lit = {texture var: lit texture}, also their `_on` children."""
    MODELS[f"{name}_straight"] = model(inset_ends([e for e, _ in parts]), tex)
    MODELS[f"{name}_ascending"] = model([slope(e, s) for e, s in parts], tex)
    if lit:
        for shape in ("straight", "ascending"):
            MODELS[f"{name}_{shape}_on"] = child(f"{name}_{shape}", **lit)


def lamp(x0, z0, w=2.0, d=2.0, y0=0.5, y1=1.75, tex="lamp"):
    return part((x0, y0, z0), (x0 + w, y1, z0 + d), tex, top=(0, 0), side=(0, 4))


# ====================================================================== the vanilla rails
def corner(ties="ties", tint=True):
    """The coaster rail's corner (south and east edges), its two edge sleepers no longer overlapping."""
    els = copy.deepcopy(ct.corner_elements())
    for e in els:
        if e["from"][2] == 14 - TIE_W / 2 and e["to"][2] == 14 + TIE_W / 2 and e["from"][1] == TIE_Y[0] \
                and "rotation" not in e:
            e["to"][0] = 14 - TIE_W / 2     # the south edge's sleeper stops where the east edge's begins
        for f in e["faces"].values():
            if f["texture"] == "#ties":
                f["texture"] = "#" + ties
                if not tint:
                    f.pop("tintindex", None)
    return els


def untinted(parts):
    for e, _ in parts:
        for f in e["faces"].values():
            f.pop("tintindex", None)
    return parts


# Rail: the plain track on dark timber
rail_tex = textures(ties="track_ties_timber", particle="track_ties_timber")
straight_and_slope("track_rail", untinted(base_track()), rail_tex)
MODELS["track_rail_corner"] = model(inset_ends(corner(tint=False)), rail_tex)

# Powered Rail: gold-plated sleepers, a gold channel down the middle carrying a redstone strip (dim / glowing)
STRIP = [(part((6.5, 0.25, 0), (9.5, 1.0, 16), "gold", top=(0, 0), side=(0, 0), end=(0, 7), along=True), True),
         (part((7.25, 1.0, 0), (8.75, 1.4, 16), "strip", top=(4, 0), side=(0, 7), faces=["up", "east", "west",
                                                                                         "north", "south"]), True)]
straight_and_slope("track_powered_rail", untinted(base_track()) + STRIP,
                   textures(ties="track_ties_gold", gold="track_gold", strip="track_redstone",
                            particle="track_ties_gold"),
                   lit={"strip": "track_redstone_lit"})

# Detector Rail: a grille sensor plate between the rails on a steel cross-bar, with a lamp at each end of the bar
DETECTOR = [(part((0.25, -0.25, 7.25), (15.75, 0.5, 8.75), "bracket", top=(0, 1), side=(0, 1)), False),
            (part((5, 0.5, 3), (11, 1.25, 13), "sensor", top=(0, 0), side=(0, 12)), False),
            (lamp(0.25, 7), False), (lamp(13.75, 7), False)]
straight_and_slope("track_detector_rail", untinted(base_track()) + DETECTOR,
                   textures(ties="track_ties_timber", sensor="track_sensor", lamp="track_lamp",
                            particle="track_ties_timber"),
                   lit={"sensor": "track_sensor_lit", "lamp": "track_lamp_lit"})


# Activator Rail: red-tipped sleepers, and a fork between the rails on a pivot: it points north and is dark when off,
# flips to point south and lights when powered
def fork(south):
    s = (lambda z0, z1: (16 - z1, 16 - z0)) if south else (lambda z0, z1: (z0, z1))
    out = [part((7, 0.5, 7), (9, 1.5, 9), "bracket", top=(0, 0), side=(0, 2))]               # the pivot
    a0, a1 = s(4, 7)
    out.append(part((7.5, 0.75, a0), (8.5, 1.25, a1), "bracket", top=(0, 0), side=(0, 1)))   # the arm
    h0, h1 = s(3, 4)
    out.append(part((6, 0.75, h0), (10, 1.5, h1), "lamp", top=(0, 0), side=(0, 4)))          # the head
    p0, p1 = s(1.25, 3)
    for x in (6, 9):                                                                          # the prongs
        out.append(part((x, 0.75, p0), (x + 1, 1.5, p1), "lamp", top=(0, 0), side=(0, 4)))
    return [(e, False) for e in out]


act_tex = textures(ties="track_ties_red", lamp="track_lamp", particle="track_ties_red")
for on, suffix in ((False, ""), (True, "_on")):
    parts = untinted(base_track(ties="ties")) + fork(on)
    tex = dict(act_tex, lamp=f"{M}:block/track_lamp_lit") if on else act_tex
    MODELS[f"track_activator_rail_straight{suffix}"] = model(inset_ends([e for e, _ in parts]), tex)
    MODELS[f"track_activator_rail_ascending{suffix}"] = model([slope(e, s) for e, s in parts], tex)

# ====================================================================== the Winterworks rails
# Booster Rail: gilt rails, and a redstone-block plate in an iron socket between them (dull / blazing when a
# redstone block powers it)
BOOSTER = [(part((4.5, 0.25, 3.5), (11.5, 1.0, 12.5), "spine", top=(0, 0), side=(0, 2)), False),
           (part((5.5, 1.0, 4.5), (10.5, 1.6, 11.5), "block", top=(0, 0), side=(0, 8), end=(0, 8)), False)]
straight_and_slope("booster_rail", base_track() + BOOSTER,
                   textures(rail="track_rail_gilt", block="track_redstone_block"),
                   lit={"block": "track_redstone_block_lit"})

# Chain Lift Rail: a chain running up the middle in a steel trough (animated: slow, fast when powered), and a lamp
# on the end of the second and fourth sleepers each side (lit when powered)
LIFT = [(part((5.75, 0.25, 0), (10.25, 1.0, 16), "spine", top=(0, 12.5), side=(0, 2), end=(0, 2), along=True),
         True),
        (part((6.5, 1.0, 0), (9.5, 1.5, 16), "chain", top=(0, 0), side=(0, 15), end=(0, 15),
              faces=["up", "east", "west", "north", "south"]), True)]
for z in (6, 14):
    for x in (0.75, 13.75):
        LIFT.append((lamp(x, z - 0.75, w=1.5, d=1.5, y0=0.75, y1=1.75), False))
straight_and_slope("lift_rail", base_track() + LIFT, textures(chain="track_chain", lamp="track_lamp"),
                   lit={"chain": "track_chain_fast", "lamp": "track_lamp_lit"})


# Trap Rail: hazard-striped jaw housings outside the rails, arms under the rails to brake pads inside them; powered,
# the pads close on the rails and the lamp between them lights
def trap(closed):
    out = []
    for side in (0, 1):
        def mx(a, b):
            return (16 - b, 16 - a) if side else (a, b)
        pad = (4.0, 5.25) if closed else (5.25, 6.5)
        x0, x1 = mx(0.25, 2.25)
        out.append(part((x0, -0.6, 4.5), (x1, 1.75, 11.5), "hazard", top=(0, 0), side=(0, 0)))        # housing
        x0, x1 = mx(2.25, pad[0])
        out.append(part((x0, 0.0, 7.25), (x1, 0.6, 8.75), "spine", top=(0, 13), side=(0, 13)))         # arm
        x0, x1 = mx(*pad)
        out.append(part((x0, 0.6, 5.25), (x1, 1.75, 10.75), "bracket", top=(0, 0), side=(0, 1)))      # pad
    out.append(part((7, 0.5, 7), (9, 1.5, 9), "lamp", top=(0, 0), side=(0, 4)))                     # lamp
    return [(e, False) for e in out]


trap_tex = textures(hazard="track_hazard", lamp="track_lamp")
for closed, suffix in ((False, ""), (True, "_on")):
    parts = base_track() + trap(closed)
    tex = dict(trap_tex, lamp=f"{M}:block/track_lamp_lit") if closed else trap_tex
    MODELS[f"trap_rail_straight{suffix}"] = model(inset_ends([e for e, _ in parts]), tex)
    MODELS[f"trap_rail_ascending{suffix}"] = model([slope(e, s) for e, s in parts], tex)

# Drop Rail: a hatch. Two leaves (hinged at the outer edges, split down the middle) carry the rails between two end
# sleepers on girder stubs; the deck shows hazard edges and a red arrow. Open (drop_rail_open) the leaves hang
# straight down from their hinges with the rails on them, and the cart falls through.
LEAF_X = (1.25, 8.0)       # the west leaf (the east one mirrors it); hinge at x 1.25, y 0.75 (its top outer edge)
LEAF_Z, LEAF_Y = (2.0, 14.0), (-0.25, 0.75)


def drop_frame():
    out = []
    for z0, z1 in ((0, 2), (14, 16)):
        out.append((ct.element((1, -1.25, z0), (15, 0.75, z1), "ties", tint=True), False))           # end sleepers
        out.append((ct.element((8 - SPINE_HALF, SPINE_Y[0], z0), (8 + SPINE_HALF, -1.25, z1), "spine",
                               faces=ALL), False))
        out.append((ct.element((8 - FLANGE_HALF, FLANGE_Y[0], z0), (8 + FLANGE_HALF, FLANGE_Y[1], z1), "flange",
                               band=(8, 16), faces=ALL), False))
    for x in RAIL_X:                                                                                 # rail stubs
        for z0, z1 in ((0, 2), (14, 16)):
            out.append((ct.element((x - RAIL_W / 2, RAIL_Y[0], z0), (x + RAIL_W / 2, RAIL_Y[1], z1), "rail",
                                   band=(1, 8), faces=ALL), False))
    return out


FACE_VERTS = {   # vanilla FaceInfo: each face's corners in the order its uvs are read (BlockFaceUV)
    "down": [(0, 0, 1), (0, 0, 0), (1, 0, 0), (1, 0, 1)], "up": [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
    "north": [(1, 1, 0), (1, 0, 0), (0, 0, 0), (0, 1, 0)], "south": [(0, 1, 1), (0, 0, 1), (1, 0, 1), (1, 1, 1)],
    "west": [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)], "east": [(1, 1, 1), (1, 0, 1), (1, 0, 0), (1, 1, 0)]}


def mapped_face(face, lo, hi, tex, fn):
    """A face whose texture follows fn(x, y, z) -> (u, v) at its corners: the uv rectangle and quarter turn."""
    vuv = [fn(*[(lo, hi)[c][i] for i, c in enumerate(v)]) for v in FACE_VERTS[face]]
    for rot in (0, 90, 180, 270):
        c = [None] * 4
        for i, q in enumerate(vuv):
            c[(i + rot // 90) % 4] = q
        if abs(c[1][0] - c[0][0]) < 1e-6 and abs(c[3][1] - c[0][1]) < 1e-6 and abs(c[2][0] - c[3][0]) < 1e-6 \
                and abs(c[2][1] - c[1][1]) < 1e-6:
            f = {"texture": "#" + tex, "uv": [round(c[0][0], 4), round(c[0][1], 4), round(c[2][0], 4),
                                             round(c[2][1], 4)]}
            if rot:
                f["rotation"] = rot
            return f
    raise ValueError("not a rectangle")


def leaf_closed(side):
    x0, x1 = LEAF_X if side == 0 else (16 - LEAF_X[1], 16 - LEAF_X[0])
    e = part((x0, LEAF_Y[0], LEAF_Z[0]), (x1, LEAF_Y[1], LEAF_Z[1]), "spine", top=(0, 0), side=(0, 12),
             end=(0, 12), bottom=(0, 3))
    e["faces"]["up"] = {"texture": "#hatch", "uv": [x0, LEAF_Z[0], x1, LEAF_Z[1]]}
    return e


def hinges(side):
    hs = [part((0.25, -0.25, z0), (1.25, 0.75, z0 + 2), "bracket", top=(0, 0), side=(0, 2)) for z0 in (3, 7, 11)]
    return [mirror_x(h) for h in hs] if side else hs


def drop_closed():
    out = [(e, True) for e, _ in drop_frame()]
    for side in (0, 1):
        out.append((leaf_closed(side), True))
        x = RAIL_X[side]
        out.append((ct.element((x - RAIL_W / 2, RAIL_Y[0], LEAF_Z[0]), (x + RAIL_W / 2, RAIL_Y[1], LEAF_Z[1]),
                               "rail", band=(1, 8), faces=["east", "west", "up", "down"]), True))
        out += [(h, False) for h in hinges(side)]
    return out


def drop_open():
    """The open hatch: frame and stubs as closed, each leaf hanging from its hinge (turned 90 degrees down) with its
    rail on it; the deck's art (its top, closed) now faces the hole."""
    out = [e for e, _ in drop_frame()]
    hx, hy = LEAF_X[0], LEAF_Y[1]                    # the west hinge line (x 1.25, y 0.75), along z

    def down(lo, hi):
        """A closed west-leaf box -> the hanging box: (x, y) -> (hx - (hy - y), hy - (x - hx))."""
        xs = [hx - (hy - y) for y in (lo[1], hi[1])]
        ys = [hy - (x - hx) for x in (lo[0], hi[0])]
        return [min(xs), min(ys), lo[2]], [max(xs), max(ys), hi[2]]

    lo, hi = down((LEAF_X[0], LEAF_Y[0], LEAF_Z[0]), (LEAF_X[1], LEAF_Y[1], LEAF_Z[1]))
    x = RAIL_X[0]
    rlo, rhi = down((x - RAIL_W / 2, RAIL_Y[0], LEAF_Z[0]), (x + RAIL_W / 2, RAIL_Y[1], LEAF_Z[1]))
    for side in (0, 1):
        leaf = part(lo, hi, "spine", top=(0, 12), side=(0, 3), end=(0, 12), along=True)
        rail = ct.element(rlo, rhi, "rail", band=(1, 8), faces=["north", "south", "up", "down", "east"])
        if side:
            leaf, rail = mirror_x(leaf), mirror_x(rail)
            # closed, the east leaf's top showed the art's x 8..14.75; hanging, x runs down from the hinge at 14.75
            leaf["faces"]["west"] = mapped_face("west", leaf["from"], leaf["to"], "hatch",
                                                lambda x, y, z: (16 - LEAF_X[0] - (hy - y), z))
        else:
            leaf["faces"]["east"] = mapped_face("east", lo, hi, "hatch", lambda x, y, z: (hx + (hy - y), z))
        out += [leaf, rail]
    return out


drop_tex = textures(hatch="track_hatch")
parts = drop_closed()
MODELS["drop_rail_straight"] = model(inset_ends([e for e, _ in parts]), drop_tex)
MODELS["drop_rail_ascending"] = model([slope(e, s) for e, s in parts], drop_tex)
MODELS["drop_rail_open"] = model(inset_ends(drop_open()), drop_tex)


# Switch Rail: a Y-junction drawn toe-south: the straight track runs on north, the branch (the coaster corner's
# rails) curves off to the east edge. Switch blades near the toe: set straight (unpowered) the east blade lies against
# its stock rail and the west one stands open; set to the branch (_on) the other way round. A lamp between the blades
# lights for the branch; the ground throw (a stand and its lever, the old switch art's texture) sits west of the toe
# and throws the other way. `_left` mirrors everything (the branch to the west).
def switch(branch_set):
    els = [e for e, _ in base_track()]
    lower = 0.15                       # the branch's sleepers and girder sit a hair lower: never coplanar
    for e in copy.deepcopy(ct.corner_elements()):
        tex = next(iter(e["faces"].values()))["texture"]
        turned = "rotation" in e
        along_z = not turned and (e["to"][2] - e["from"][2]) > (e["to"][0] - e["from"][0])
        below = tex in ("#spine", "#ties", "#bracket") or (tex == "#rail" and e["from"][1] < 0)
        if along_z and tex in ("#spine", "#rail"):
            continue      # the first segments (rails, girder) at the toe lie on the straight track's own
        if not turned and tex in ("#ties", "#bracket") and e["from"][2] > 8:
            continue      # the south edge's sleeper and bracket: the straight track's own
        if below:
            d = lower
            if not turned and tex == "#ties":            # the east edge's sleeper, under the straight's sleepers
                d = lower + 0.1
                e["from"] = [e["from"][0] + 0.1, e["from"][1], e["from"][2] + 0.1]
                e["to"] = [e["to"][0] - 0.1, e["to"][1], e["to"][2] - 0.1]
            e["from"][1] = round(e["from"][1] - d, 4)
            e["to"][1] = round(e["to"][1] - d, 4)
        els.append(e)
    # switch blades (1 px wide, a little lower than the rails), z 8.5..15
    west = (4.0, 5.0) if branch_set else (5.25, 6.25)
    east = (10.0, 11.0) if branch_set else (11.0, 12.0)
    for x0, x1 in (west, east):
        els.append(ct.element((x0, RAIL_Y[0], 8.5), (x1, RAIL_Y[1] - 0.1, 15), "rail", band=(1, 8),
                              faces=ALL))
    els.append(part((7, 0.5, 11.5), (9, 1.5, 13.5), "lamp", top=(0, 0), side=(0, 4)))
    # the ground throw: an iron stand on the sleeper ends west of the toe, its lever leaning one way or the other
    side = {"uv": [0, 4, 3, 5.5], "texture": "#lever"}
    els.append({"from": [0.25, 0.75, 11.5], "to": [1.75, 2.0, 14.5], "faces": {
        "up": {"uv": [0, 0, 1.5, 3], "texture": "#lever"}, "north": dict(side, uv=[0, 4, 1.5, 5.25]),
        "south": dict(side, uv=[0, 4, 1.5, 5.25]), "east": dict(side, uv=[0, 4, 3, 5.25]),
        "west": dict(side, uv=[0, 4, 3, 5.25]), "down": {"uv": [0, 0, 1.5, 3], "texture": "#lever"}}})
    rod = {"uv": [5, 0, 6, 7], "texture": "#lever"}
    els.append({"from": [0.75, 2.0, 12.75], "to": [1.25, 7.0, 13.25],
                "rotation": {"origin": [1.0, 2.0, 13], "axis": "z", "angle": -22.5 if branch_set else 22.5},
                "faces": {f: dict(rod) for f in ("north", "south", "east", "west")} | {
                    "up": {"uv": [5, 0, 6, 1], "texture": "#lever"}}})
    return els


sw_tex = textures(lamp="track_lamp", lever="switch_rail_lever")
for branch_set, suffix in ((False, ""), (True, "_on")):
    els = inset_ends(switch(branch_set))
    tex = dict(sw_tex, lamp=f"{M}:block/track_lamp_lit") if branch_set else sw_tex
    MODELS[f"switch_rail_right{suffix}"] = model(els, tex)
    MODELS[f"switch_rail_left{suffix}"] = model([mirror_x(e) for e in els], tex)

# the shapes each model serves (tools/gen_data.py writes the blockstates from this)
STRAIGHT = {"north_south": 0, "east_west": 90}
ASCENDING = {"ascending_north": 0, "ascending_east": 90, "ascending_south": 180, "ascending_west": 270}
CORNER = {"south_east": 0, "south_west": 90, "north_west": 180, "north_east": 270}


def write(models=True):
    tex_dir = ASSETS / "textures" / "block"
    for name, im in OUT.items():
        im.save(tex_dir / f"{name}.png")
        meta = tex_dir / f"{name}.png.mcmeta"
        if name in MCMETA:
            meta.write_text(json.dumps(MCMETA[name], indent=2) + "\n")
    if models:
        for name, body in MODELS.items():
            (ASSETS / "models" / "block" / f"{name}.json").write_text(json.dumps(body, indent=2) + "\n")


# ====================================================================== preview (read back from the mod's JSON)
OAK = (0x8A, 0x6B, 0x47)          # express/RailPaint#tint for an unpainted Winterworks rail
GROUND = (128, 128, 124)
SHAPES6 = ["north_south", "east_west", "ascending_north", "ascending_east", "ascending_south", "ascending_west"]
SHAPES10 = SHAPES6 + ["south_east", "south_west", "north_west", "north_east"]


def all_states():
    """[(block id, [props])] for every rail state the blockstates must draw."""
    out = [("minecraft:rail", [{"shape": s} for s in SHAPES10])]
    for b in ("minecraft:powered_rail", "minecraft:detector_rail", "minecraft:activator_rail",
              f"{M}:booster_rail", f"{M}:lift_rail", f"{M}:trap_rail", f"{M}:drop_rail"):
        out.append((b, [{"shape": s, "powered": p} for p in ("false", "true") for s in SHAPES6]))
    out.append((f"{M}:drop_rail_open", [{"along_x": v} for v in ("false", "true")]))
    sw = []
    opp = {"north": "south", "south": "north", "east": "west", "west": "east"}
    ccw = {"north": "west", "west": "south", "south": "east", "east": "north"}
    cw = {v: k for k, v in ccw.items()}
    for facing in ("north", "east", "south", "west"):
        for branch in ("right", "left"):
            toe, b = opp[facing], (ccw if branch == "left" else cw)[facing]
            curve = ("north_" if "north" in (toe, b) else "south_") + ("east" if "east" in (toe, b) else "west")
            straight = "north_south" if facing in ("north", "south") else "east_west"
            for shape in (straight, curve):
                sw.append({"facing": facing, "branch": branch, "shape": shape, "powered": "false"})
    out.append((f"{M}:switch_rail", sw))
    return out


def tint_of(block):
    return OAK if block.startswith(M + ":") else None


def preview(dst):
    from mc_blockmodel import Resources, Scene, sheet
    res = Resources([ASSETS.parents[1]])
    dst.mkdir(parents=True, exist_ok=True)
    problems = []
    written = []
    # every state: from above and at 3/4, floating (the girder shows)
    for block, states in all_states():
        cells = []
        for props in states:
            label = ",".join(f"{k}={v}" for k, v in props.items())
            try:
                sc = Scene(res).block(block, props, (0, 0, 0), tint_of(block))
            except Exception as e:  # noqa: BLE001
                problems.append(f"{block} {props}: {e}")
                continue
            cells.append(sc.render("top", (190, 170), scale=8, centre=(8, 0, 8), title=label[:34]))
            cells.append(sc.render("iso", (190, 170), scale=6.5, centre=(8, 4, 8), title=""))
        name = block.split(":")[1]
        out = dst / f"contact_{name}.png"
        sheet(cells, 8).save(out)
        written.append(out)
    # every model the blockstates use, linted with vanilla's limits
    seen = set()
    for block, states in all_states():
        for props in states:
            try:
                for ref, *_ in res.variants(block, props):
                    if ref not in seen:
                        seen.add(ref)
                        problems += res.lint_model(ref)
            except Exception as e:  # noqa: BLE001
                problems.append(f"{block} {props}: {e}")
    problems += res.problems
    # layouts on the ground and floating: straight, curved and sloped pieces joining
    for floating in (False, True):
        sc = Scene(res)
        ground = set()

        def put(block, props, pos):
            sc.block(block, props, pos, tint_of(block))
            ground.add((pos[0], pos[1] - 1, pos[2]))

        loop = {(0, 0): "south_east", (5, 0): "south_west", (0, 2): "north_east", (5, 2): "north_west",
                (0, 1): "north_south", (5, 1): "north_south"}
        for x in range(1, 5):
            loop[(x, 0)] = "east_west"
        for (x, z), shape in loop.items():
            put("minecraft:rail", {"shape": shape}, (x, 0, z))
        for x, b in ((1, "powered_rail"), (2, "detector_rail"), (3, "activator_rail"), (4, "rail")):
            props = {"shape": "east_west", "powered": "true" if x % 2 else "false"}
            put("minecraft:" + b, props if b != "rail" else {"shape": "east_west"}, (x, 0, 2))
        # a hump per rail type: flat, up, flat on top, down, flat (powered: second half lit)
        types = ["rail", "powered_rail", "detector_rail", "activator_rail", f"{M}:booster_rail", f"{M}:lift_rail",
                 f"{M}:trap_rail", f"{M}:drop_rail"]
        for k, b in enumerate(types):
            bid = b if ":" in b else "minecraft:" + b
            z = 4 + k
            for x, y, shape in ((0, 0, "east_west"), (1, 0, "ascending_east"), (2, 1, "east_west"),
                                (3, 0, "ascending_west"), (4, 0, "east_west")):
                props = {"shape": shape} if bid == "minecraft:rail" else {"shape": shape, "powered":
                                                                          "true" if x >= 2 else "false"}
                put(bid, props, (x, y, z))
            ground.add((2, 0, z))
        # switch rails (both hands, both settings) joined by coaster rails, an open drop rail
        for k, (branch, shape) in enumerate((("right", "north_south"), ("right", "south_east"),
                                             ("left", "north_south"), ("left", "south_west"))):
            x0 = 8 + 3 * (k % 2)
            z0 = 1 + 4 * (k // 2)
            put(f"{M}:switch_rail", {"facing": "north", "branch": branch, "shape": shape}, (x0, 0, z0))
            put(f"{M}:coaster_rail", {"shape": "north_south"}, (x0, 0, z0 + 1))
            put(f"{M}:coaster_rail", {"shape": "north_south"}, (x0, 0, z0 - 1))
            bx = x0 + (1 if branch == "right" else -1)
            put(f"{M}:coaster_rail", {"shape": "east_west"}, (bx, 0, z0))
        put(f"{M}:drop_rail_open", {"along_x": "false"}, (8, 0, 11))
        put(f"{M}:drop_rail", {"shape": "north_south", "powered": "false"}, (8, 0, 10))
        put(f"{M}:drop_rail", {"shape": "north_south", "powered": "false"}, (8, 0, 12))
        if not floating:
            for g in ground:
                if g != (8, -1, 11):              # a shaft under the open hatch
                    sc.cube(g, GROUND)
        tag = "floating" if floating else "ground"
        for view in ("iso", "top", "iso_sw"):
            out = dst / f"layout_{tag}_{view}.png"
            sc.render(view, (1400, 1000), title=f"layout ({tag}), {view}").save(out)
            written.append(out)
    # close-ups of the joints: a ramp up and over, a curve into a straight, from the side and at 3/4
    sc = Scene(res)
    for x, y, shape in ((0, 0, "east_west"), (1, 0, "ascending_east"), (2, 1, "east_west"), (3, 1, "ascending_east"),
                        (4, 2, "east_west")):
        sc.block("minecraft:rail", {"shape": shape}, (x, y, 0))
    sc.block("minecraft:rail", {"shape": "south_west"}, (5, 2, 0))
    sc.block("minecraft:rail", {"shape": "north_south"}, (5, 2, 1))
    for view in ("iso", "side", (-20, 12)):
        out = dst / f"joints_{view if isinstance(view, str) else 'low'}.png"
        sc.render(view, (1400, 700), title=f"joints {view}").save(out)
        written.append(out)
    # the item icons as the GUI draws them (display "gui"), 4x
    icons = []
    for ns, name in [("minecraft", n) for n in ("rail", "powered_rail", "detector_rail", "activator_rail")] + \
                    [(M, n) for n in ("coaster_rail", "booster_rail", "lift_rail", "trap_rail", "drop_rail",
                                      "switch_rail")]:
        ref = f"{ns}:item/{name}"
        m = res.model(ref)
        sc = Scene(res).model(ref, tint=OAK if ns == M else None)
        icon = sc.render(item=m["display"]["gui"], size=(128, 128), scale=8, centre=np.zeros(3),
                         background=(139, 139, 139))
        ImageDraw.Draw(icon).rectangle((0, 0, 127, 127), outline=(55, 55, 55))
        icons.append(icon)
    out = dst / "item_icons.png"
    sheet(icons, 10).save(out)
    written.append(out)
    for w in written:
        print(w)
    if problems:
        print("PROBLEMS:")
        for pr in problems:
            print("  " + pr)
    else:
        print("lint: every state has a model; every model is within vanilla's limits")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=Path, help="render contact sheets of every piece here (reads the mod's JSON)")
    ap.add_argument("--no-write", action="store_true")
    a = ap.parse_args()
    if not a.no_write:
        write()
    for name in OUT:
        print("textures/block/" + name + ".png")
    for name, body in MODELS.items():
        print(f"models/block/{name}.json  {len(body.get('elements', []))} elements")
    if a.preview:
        preview(a.preview)


if __name__ == "__main__":
    main()
