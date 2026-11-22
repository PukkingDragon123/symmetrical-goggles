"""Shared pieces for the Winterworks minecart skins (fox_cart, zombie_cart).

Units are Minecraft pixels (16 per block), density 1, every box a whole number of pixels, so the specs export 1:1
to vanilla entity models (python -m lowpix mc export). lowpix axes: Y up, the cart faces +Z, rail top at y=0.

The contract every cart keeps (the mod's Java refers to these names):
  parts  tub (root: hull floor + four walls), wheel_fl, wheel_fr, wheel_bl, wheel_br (pivot on the axle, spin
         about X, l = +X side), trim (+ trim_* children; dyeable), seat (dyeable wool cushion)
  clips  run (1.0 s loop: every wheel +360 about X), idle (2.0 s loop)
"""
import json

WHEEL_R = 3          # wheel radius: axle at y=3, the tyre touches y=0
WHEEL_X = 6          # wheel centre |x| (the wheel spans 5..7, under the flared walls)
WHEEL_Z = 6          # axle |z|


class Cart:
    """Collects box parts. Pivots are given in WORLD coordinates and converted to the parent's frame, which is
    exact as long as no ancestor is rotated at rest (pass rel=True for children of rotated parts)."""

    def __init__(self):
        self.P = []
        self.world = {}

    def box(self, id, parent, size, pivot, style, offset=None, rot=None, rel=False, **kw):
        if parent and not rel:
            pp = self.world[parent]
            local = [pivot[i] - pp[i] for i in range(3)]
        else:
            local = list(pivot)
        self.world[id] = list(pivot) if not rel else None
        d = {"id": id, "shape": "box", "size": list(size), "pivot": [round(v, 4) for v in local], "style": style}
        if parent:
            d["parent"] = parent
        if offset:
            d["offset"] = list(offset)
        if rot:
            d["rotation"] = list(rot)
        d.update(kw)
        self.P.append(d)
        return d

    def bone(self, id, parent, pivot, rot=None, rel=False, **kw):
        d = self.box(id, parent, [0, 0, 0], pivot, None, rot=rot, rel=rel, **kw)
        d["shape"] = "bone"
        d.pop("size")
        d.pop("style")
        return d


# --------------------------------------------------------------------------------------------- wheels
# (lowpix box faces: "right" is the +X face, "left" the -X face.)
# a 6x6 wheel face: iron tyre (corners punched so the square box reads round), wooden spokes, an iron hub.
WHEEL_ART = [
    "_RRRR_",
    "RdSSdR",
    "RSHHSR",
    "RSHhSR",
    "RdSSdR",
    "_RrrR_",
]
TREAD_ART_V = ["__", "..", "..", "..", "..", "__"]     # tread faces: punch the corner texels too


def wheel_paint(iron="iron", wood="wood"):
    key = {"R": f"{iron}:5", "r": f"{iron}:3", "S": f"{wood}:6", "d": f"{wood}:1", "H": f"{iron}:6",
           "h": f"{iron}:4"}
    return {"stamps": [
        {"faces": ["left", "right"], "at": [0, 0], "art": WHEEL_ART, "key": key},
        {"faces": ["top", "bottom", "front", "back"], "at": [0, 0], "art": TREAD_ART_V, "key": {}},
    ]}


def add_wheels(c: Cart, parent="tub", style="tyre", hub_style="hub", y=WHEEL_R, x=WHEEL_X, z=WHEEL_Z,
               iron="iron", wood="wood"):
    for name, sx, sz in (("wheel_fl", 1, 1), ("wheel_fr", -1, 1), ("wheel_bl", 1, -1), ("wheel_br", -1, -1)):
        c.box(name, parent, [2, 6, 6], [sx * x, y, sz * z], style,
              hide=["left" if sx > 0 else "right"], paint=wheel_paint(iron, wood))
        # the hub cap / axle nut sticks out past the tyre
        c.box(name + "_hub", name, [1, 2, 2], [sx * (x + 1.5), y, sz * z], hub_style)


def spin_tracks():
    """Every wheel: one full forward roll (+360 about X) per second, linear, seamless loop."""
    return [{"part": w, "axis": "x", "keys": [[0, 0], [1.0, 360]], "ease": "linear"}
            for w in ("wheel_fl", "wheel_fr", "wheel_bl", "wheel_br")]


# --------------------------------------------------------------------------------------------- the tub
def add_tub(c: Cart, hull="hull", side="side", front="front", back="back", axle="axle", wall_h=6,
            side_paint=None, front_paint=None, back_paint=None):
    """The hollow tub: a narrow hull floor (y 4..7) with walls flaring out above the wheels (y 7..7+wall_h), the
    front and back walls reaching down to the hull's bottom. Interior x -5..5, z -9..9, floor top y=7."""
    top = 7 + wall_h
    c.box("tub", None, [10, 3, 18], [0, 3, 0], hull, offset=[0, 2.5, 0], hide=["front", "back"])
    for name, sx in (("wall_l", 1), ("wall_r", -1)):
        c.box(name, "tub", [2, wall_h, 22], [sx * 6, 7 + wall_h / 2, 0], side, hide=["top"],
              **({"paint": side_paint(name, sx)} if side_paint else {}))
    c.box("wall_f", "tub", [10, top - 4, 2], [0, (top + 4) / 2, 10], front, hide=["left", "right", "top"],
          **({"paint": front_paint} if front_paint else {}))
    c.box("wall_b", "tub", [10, top - 4, 2], [0, (top + 4) / 2, -10], back, hide=["left", "right", "top"],
          **({"paint": back_paint} if back_paint else {}))
    for name, z in (("axle_f", WHEEL_Z), ("axle_b", -WHEEL_Z)):
        c.box(name, "tub", [10, 1, 1], [0, WHEEL_R, z], axle, hide=["left", "right"])
    return top


def add_trim(c: Cart, top, style="trim"):
    """A padded (dyeable) bolster round the rim of the tub, one pixel proud of the wall tops."""
    y = top
    c.box("trim", "tub", [9, 2, 3], [0, y, 10], style)
    c.box("trim_l", "trim", [3, 2, 23], [6, y, 0], style)
    c.box("trim_r", "trim", [3, 2, 23], [-6, y, 0], style)
    c.box("trim_b", "trim", [9, 2, 3], [0, y, -10], style)
    return ["trim", "trim_l", "trim_r", "trim_b"]


# --------------------------------------------------------------------------------------------- wool (tint)
# Dyeable parts are drawn multiplied by the player's dye colour, so they're painted in a neutral wool ramp.
WOOL = ["#4c4c4c", "#5e5e5e", "#727272", "#878787", "#9c9c9c", "#b1b1b1", "#c5c5c5", "#d8d8d8", "#e9e9e9",
        "#f7f7f7"]


def wool_styles():
    return {
        # padded rim: a wool bolster, fluffy clumps, quilting stitches along its seams, darker underneath
        "trim": {"ramp": "wool", "tone": 6.0, "brush": {"flow": "long", "length": 2.0, "rough": 0.55},
                 "rim": {"light_shift": 1.0, "dark_shift": -1.3},
                 "layers": [
                     {"id": "fluff", "op": "noise", "scale": 0.9, "amount": 0.8},
                     {"id": "clumps", "op": "patches", "scale": 1.3, "threshold": 0.58, "shift": -0.8},
                     {"id": "stitch", "op": "rivets", "inset": 0, "spacing": 2, "highlight": -1.6, "shadow": 0,
                      "min_size": 2, "faces": ["sides"]},
                     {"id": "under", "op": "gradient", "axis": "y", "amount": 1.6}]},
        # the cushion: plump, piped round the top, tufted with buttons, stitched along the sides
        "seat": {"ramp": "wool", "tone": 5.8, "brush": {"flow": "horizontal", "length": 2.0, "rough": 0.55},
                 "rim": {"light_shift": 1.2, "dark_shift": -1.5},
                 "layers": [
                     {"id": "fluff", "op": "noise", "scale": 0.9, "amount": 0.8},
                     {"id": "clumps", "op": "patches", "scale": 1.3, "threshold": 0.58, "shift": -0.8},
                     {"id": "piping", "op": "panel", "inset": 1, "shift": -1.3, "highlight": 0.8, "shadow": -1.2,
                      "min_size": 4, "faces": ["top", "front", "back"]},
                     {"id": "buttons", "op": "rivets", "inset": 2, "spacing": 3, "highlight": -2.0, "shadow": 0.8,
                      "min_size": 5, "faces": ["top"]},
                     {"id": "stitch", "op": "rivets", "inset": 0, "spacing": 2, "highlight": -1.4, "shadow": 0,
                      "min_size": 2, "faces": ["left", "right"]},
                     {"id": "puff", "op": "gradient", "axis": "y", "amount": 1.8}]},
    }


def dump(spec, path):
    with open(path, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(path, len(spec["parts"]), "parts")
