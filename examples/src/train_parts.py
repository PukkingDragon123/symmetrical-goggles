"""Shared running gear, cab and bunker for the Winterworks locomotives (locomotive.py, dragon_locomotive.py).

Units are Minecraft pixels (16 per block), density 1, so every part exports 1:1 to a vanilla entity model
(python -m lowpix mc export). lowpix axes: Y up, the engine runs toward +Z, the rail top is y = 0.

Vehicle contract (the mod's Java code refers to these names):
  chassis (root, pivot on the rail at the origin), wheel_fl / wheel_fr / wheel_bl / wheel_br (pivot on the axle,
  spin about X; l = +X side), rod_l / rod_r (coupling rods), piston_l / piston_r (slide along Z), smokestack, cab,
  firebox (glow), lamp (glow), coal, trim + trim_* (dyeable).
Clips: run (1 s loop = one driver revolution), idle (2 s loop), whistle (1 s one-shot).
"""
import math

# ------------------------------------------------------------------ running-gear geometry (shared by the clips)
AXLE_Y = 4.6          # driver axle height: radius-4.5 octagonal wheels whose tread corners touch the rail
R_DRIVER = 4.5
Z_FRONT = 2.5         # front driver axle
Z_BACK = -7.5         # back driver axle (wheelbase 10)
R_LEAD = 2.5          # small leading wheels
Z_LEAD = 10.0
WHEEL_X = 3.6         # wheel centre plane (tread spans 2.6..4.6)
CRANK = 2.0           # crank-pin radius on the drivers
CYL_Y = 6.5           # cylinder / crosshead line
MAINROD = 12.5        # crosshead -> back-driver crank pin
ROD_X = 5.65          # coupling rod centre plane
MAIN_X = 6.85         # main rod / crosshead plane
PHASE = {"l": 0.0, "r": 90.0}   # crank angle at rest (deg, from the top toward +Z); right side leads by 90


def pin(phi, z_axle):
    a = math.radians(phi)
    return AXLE_Y + CRANK * math.cos(a), z_axle + CRANK * math.sin(a)


def crosshead_z(phi):
    py, pz = pin(phi, Z_BACK)
    return pz + math.sqrt(MAINROD ** 2 - (py - CYL_Y) ** 2)


def mainrod_angle(phi):
    py, _ = pin(phi, Z_BACK)
    return math.degrees(math.asin((py - CYL_Y) / MAINROD))


class Parts:
    """Collects part dicts. Pivots are relative to the parent's pivot frame (chassis sits at the origin)."""

    def __init__(self):
        self.P = []
        self.ids = set()

    def box(self, id, parent, size, pivot, style, offset=None, rot=None, **kw):
        assert id not in self.ids, id
        self.ids.add(id)
        d = {"id": id, "shape": "box", "size": [float(s) for s in size], "pivot": [round(float(v), 4) for v in pivot],
             "style": style}
        if parent:
            d["parent"] = parent
        if offset:
            d["offset"] = [round(float(v), 4) for v in offset]
        if rot:
            d["rotation"] = [round(float(v), 3) for v in rot]
        d.update(kw)
        self.P.append(d)
        return d

    def bone(self, id, parent, pivot, rot=None, **kw):
        assert id not in self.ids, id
        self.ids.add(id)
        d = {"id": id, "shape": "bone", "pivot": list(pivot)}
        if parent:
            d["parent"] = parent
        if rot:
            d["rotation"] = rot
        d.update(kw)
        self.P.append(d)
        return d


# ------------------------------------------------------------------ wheels
def wheel_art(n, counter=True):
    """n x n side image of a spoked wheel centre (n odd), seen inside the tread ring: rim, spokes, hub,
    counterweight, and holes punched through (`_`)."""
    c = n // 2
    rows = []
    for y in range(n):
        row = ""
        for x in range(n):
            dx, dy = x - c, y - c
            ch = max(abs(dx), abs(dy))
            if c >= 2 and abs(dx) == c and abs(dy) == c or c == 1 and ch == 1 and abs(dx) == abs(dy):
                row += "_"                       # corners poke past the tread: cut away
            elif c >= 3 and ch == c:
                row += "R" if (x + 2 * y) % 5 == 0 else ("k" if (x * 3 + y) % 7 == 0 else "r")
            elif ch == 0 or (c >= 3 and ch == 1):
                row += "h"
            elif dx == 0 or dy == 0 or (c >= 3 and abs(dx) == abs(dy)):
                row += "s"
            elif counter and dy > 0 and c >= 3:
                row += "c"                       # counterweight below the hub (crank pin is at the top)
            else:
                row += "_"
        rows.append(row)
    return rows


def wheel(parts, id, parent, center, radius, side, styles, spin_key):
    """A spoked wheel: a 1px disk (alpha-cut spokes) inside an octagonal ring of 8 tread boxes, plus a hub."""
    n = int(round(2 * radius))
    seg_len = 4 if n >= 8 else 2
    d = n - 2                                    # the disk fills the inside of the tread ring
    keys = styles[spin_key]
    parts.box(id, parent, [1, d, d], center, "wheel_disk", hide=["top", "bottom", "front", "back"],
              paint={"stamps": [{"faces": ["flanks"], "at": "center", "art": wheel_art(d, n >= 8), "key": keys}]})
    for k in range(8):
        a = 45.0 * k
        # odd segments sit 0.04 px proud so their side faces never share a plane with their neighbours
        dx = 0.04 if k % 2 else 0.0
        parts.box(f"{id}_t{k}", id, [2, 1, seg_len], [dx, 0, 0], "tyre", offset=[0, radius - 0.5, 0], rot=[a, 0, 0])
    hub = [2, 3, 3] if n >= 8 else [2, 1, 1]
    parts.box(f"{id}_hub", id, hub, [0.5 * side, 0, 0], "hub")


# ------------------------------------------------------------------ the shared chassis
def build_chassis(parts, wheel_keys=None):
    """Frame, footplate, beams, wheels, rods, cylinders, cab, bunker, coal, firebox and dyeable trim.
    Returns nothing; everything hangs off `chassis` (pivot on the rail at the origin)."""
    b = parts
    b.box("chassis", None, [5, 4, 26], [0, 0, 0], "frame", offset=[0, 5.5, 0])
    b.box("footplate", "chassis", [14, 1, 26], [0, 10.5, 0], "footplate")
    b.box("beam_front", "chassis", [14, 3, 1], [0, 8.5, 13.5], "beam")
    b.box("beam_back", "chassis", [14, 3, 1], [0, 8.5, -13.5], "beam")
    for s, nm in ((1, "l"), (-1, "r")):
        b.box(f"buffer_{nm}", "beam_back", [2, 2, 1], [4.5 * s, 0, -0.7], "steel")
        b.box(f"step_{nm}", "chassis", [3, 1, 2], [6.0 * s, 8.0, -12.0], "frame_dark")
        b.box(f"step_{nm}_hanger", f"step_{nm}", [1, 2, 1], [0.0, 1.5, 0], "frame_dark")
    b.box("coupler", "beam_back", [2, 1, 1], [0, -0.5, -0.75], "steel_dark")
    # dyeable livery: the valance under the footplate edge
    b.box("trim", "chassis", [15, 1, 26], [0, 9.5, 0], "trim", hide=["top"])

    # wheels: drivers (contract ids) and small leading wheels
    for s, nm in ((1, "l"), (-1, "r")):
        x = WHEEL_X * s
        keys = wheel_keys or KEYS
        wheel(b, f"wheel_f{nm}", "chassis", [x, AXLE_Y, Z_FRONT], R_DRIVER, s, keys, "drv")
        wheel(b, f"wheel_b{nm}", "chassis", [x, AXLE_Y, Z_BACK], R_DRIVER, s, keys, "drv")
        wheel(b, f"lead_{nm}", "chassis", [x, R_LEAD, Z_LEAD], R_LEAD, s, keys, "lead")

    # cylinders, pistons (piston rod + crosshead), main rods and coupling rods
    for s, nm in ((1, "l"), (-1, "r")):
        phi0 = PHASE[nm]
        b.box(f"cylinder_{nm}", "chassis", [3, 3, 5], [5.9 * s, CYL_Y + 0.2, 10.5], "cylinder")
        b.box(f"cylinder_{nm}_cap", f"cylinder_{nm}", [2, 2, 1], [0.2 * s, 0, 2.6], "steel_dark")
        b.box(f"steamchest_{nm}", f"cylinder_{nm}", [2, 2, 4], [0.3 * s, 2.3, 0], "cylinder")
        b.box(f"slidebar_{nm}", "chassis", [1, 1, 5], [MAIN_X * s, CYL_Y + 1.6, 5.3], "steel_dark")
        ch = crosshead_z(phi0)
        b.box(f"piston_{nm}", "chassis", [1, 1, 5], [(MAIN_X - 0.1) * s, CYL_Y, ch], "steel", offset=[0, 0, 3.5])
        b.box(f"crosshead_{nm}", f"piston_{nm}", [1, 2, 2], [0.05 * s, 0, 0], "steel_dark")
        b.box(f"mainrod_{nm}", f"piston_{nm}", [1, 1, 13], [0.1 * s, 0, 0], "rod", offset=[0, 0, -MAINROD / 2],
              rot=[mainrod_angle(phi0), 0, 0])
        b.box(f"mainrod_{nm}_end", f"mainrod_{nm}", [1, 2, 2], [0.12 * s, 0, -MAINROD], "steel_dark")
        py, pz = pin(phi0, (Z_FRONT + Z_BACK) / 2)
        b.box(f"rod_{nm}", "chassis", [1, 1, 11], [ROD_X * s, py, pz], "rod")
        for k, zz in enumerate((Z_FRONT, Z_BACK)):
            b.box(f"rod_{nm}_boss{k}", f"rod_{nm}", [1, 2, 2], [0.1 * s, 0, zz - (Z_FRONT + Z_BACK) / 2], "steel_dark")


def build_cab(parts, roof_style="cab_roof"):
    """Hollow cab (front spectacle plate = `cab`), bunker with the coal heap, firebox with its grate, livery band."""
    b = parts
    b.box("cab", "chassis", [14, 11, 1], [0, 16.5, -1.5], "cab", paint={"stamps": SPECTACLES})
    b.box("cab_back", "cab", [14, 11, 1], [0, 0, -7.0], "cab", paint={"stamps": BACK_WINDOWS})
    b.box("cab_side", "cab", [1, 6, 6], [6.5, -2.5, -3.5], "cab", mirror=True)
    b.box("cab_floor", "cab", [12, 1, 6], [0, -5.4, -3.5], "deck")
    b.box("cab_rail", "cab", [1, 5, 1], [6.6, 2.0, -0.9], "brass", mirror=True)
    # roof: two halves pitched down to the sides, overhanging front and back, a ridge cap and gutters
    b.box("cab_roof_l", "cab", [8, 1, 11], [0, 7.1, -3.5], roof_style, offset=[3.2, 0, 0], rot=[0, 0, -9])
    b.box("cab_roof_r", "cab", [8, 1, 11], [0, 7.1, -3.55], roof_style, offset=[-3.2, 0, 0], rot=[0, 0, 9])
    b.box("cab_ridge", "cab", [4, 1, 12], [0, 7.8, -3.5], roof_style)
    # bunker + coal
    b.box("bunker", "chassis", [14, 6, 4], [0, 14.0, -11.0], "bunker")
    b.box("bunker_lip", "bunker", [12, 1, 3], [0, 3.5, 0], "iron_dark", hide=["bottom"])
    b.box("coal", "bunker", [10, 2, 3], [0, 4.0, 0], "coal")
    lumps = [(-3.0, 1.4, 0.2, [4, 2, 3], [8, 20, -6]), (2.5, 1.5, -0.3, [4, 2, 3], [-10, -25, 9]),
             (0.0, 2.2, 0.3, [3, 2, 2], [12, 40, 6]), (-1.2, 2.9, -0.1, [2, 1, 2], [-8, 15, 14]),
             (4.0, 0.8, 0.6, [2, 1, 2], [0, 35, -12]), (-4.4, 0.7, -0.6, [2, 1, 2], [15, -20, 10])]
    for k, (x, y, z, sz, r) in enumerate(lumps):
        b.box(f"coal_{k}", "coal", sz, [x, y, z], "coal", rot=r)
    # firebox: a glowing box behind an iron grate at the foot of the boiler, in front of the cab
    b.box("firebox", "chassis", [13, 3, 3], [0, 12.5, 0.5], "fire", hide=["back"])
    b.box("firebox_grate", "firebox", [14, 3, 4], [0, 0.2, 0.0], "grate", hide=["top", "bottom", "back"],
          paint={"stamps": GRATE_STAMPS})
    # livery band round cab and bunker
    b.box("trim_band", "trim", [15, 1, 13], [0, 6.0, -7.0], "trim", hide=["top", "bottom"])


def cowcatcher(parts, bar="pilot_bar", slat="pilot", name="cowcatcher"):
    """A raked cowcatcher: angled slats running from a bar under the buffer beam down to a V-shaped toe."""
    b = parts
    TIP_Z, TOP_Z, TOP_Y, TOE_Y = 15.0, 13.3, 6.5, 0.8
    b.box(name, "chassis", [13, 1, 1], [0, TOP_Y, TOP_Z], bar)

    def toe_z(x):
        return TIP_Z - (TIP_Z - TOP_Z) * abs(x) / 6.0

    for k, x in enumerate((0.0, 2.0, 4.0, 5.9)):
        dz, dy = toe_z(x) - TOP_Z, TOP_Y - TOE_Y
        L = math.hypot(dz, dy)
        b.box(f"{name}_slat{k}", name, [1, round(L), 1], [x, 0, 0], slat, offset=[0, -round(L) / 2, 0],
              rot=[-math.degrees(math.atan2(dz, dy)), 0, 0], mirror=x > 0)
    sweep = math.degrees(math.atan2(TIP_Z - TOP_Z, 6.0))
    b.box(f"{name}_toe", name, [7, 1, 1], [0, TOE_Y - TOP_Y, TIP_Z - TOP_Z - 0.1], bar, offset=[3.2, 0, 0],
          rot=[0, sweep, 0], mirror=True)
    b.box(f"{name}_mid", name, [5, 1, 1], [0, -2.9, 1.25], bar, offset=[2.2, 0, 0], rot=[0, sweep, 0], mirror=True)


# ------------------------------------------------------------------ stamps (hand-placed pixels)
# wheel colour keys: tyre, rim, rim highlight, chipped rim, spoke, hub, counterweight
KEYS = {
    "drv": {"t": "iron:2", "r": "red:4", "R": "red:6", "k": "iron:3", "s": "red:5", "h": "red:3", "c": "red:3"},
    "lead": {"t": "iron:2", "r": "red:4", "R": "red:6", "k": "iron:3", "s": "red:5", "h": "red:3", "c": "red:3"},
}

# round spectacle windows each side of the boiler on the cab front plate (face is 14 x 13, row 0 = top)
_SPEC = ["gGg", "Ggg", "ggg"]
_SPEC_KEY = {"g": "glass:2", "G": "glass:5"}
SPECTACLES = [{"face": "front", "at": [1, 0], "art": _SPEC, "key": _SPEC_KEY},
              {"face": "front", "at": [10, 0], "art": _SPEC, "key": _SPEC_KEY}]
BACK_WINDOWS = [{"face": "back", "at": [2, 1], "art": _SPEC, "key": _SPEC_KEY},
                {"face": "back", "at": [9, 1], "art": _SPEC, "key": _SPEC_KEY}]
# grate: iron frame with slits punched through to the fire behind
GRATE_STAMPS = [{"faces": ["flanks"], "at": "center", "art": ["oiio", "_i_i", "_i_i"],
                 "key": {"i": "iron:4", "o": "iron:2"}},
                {"face": "front", "at": "center", "art": ["oiiiiiiiiiiiio", "_i_i_i_i_i_i_i", "_i_i_i_i_i_i_i"],
                 "key": {"i": "iron:4", "o": "iron:2"}}]


# ------------------------------------------------------------------ animation helpers
N = 24  # samples per second for the mechanism keys


def _keys(fn, length=1.0, n=N):
    return [[round(length * k / n, 4), fn(k / n)] for k in range(n + 1)]


def run_tracks(bob):
    """Wheels, rods, pistons and main rods for one driver revolution. `bob(tau)` is the chassis lift (px);
    the unsprung running gear (wheels, coupling rods) is counter-moved so it stays on the rails."""
    T = []
    for nm in ("l", "r"):
        for w in (f"wheel_f{nm}", f"wheel_b{nm}"):
            T.append({"part": w, "axis": "x", "ease": "linear", "keys": [[0, 0], [1.0, 360]]})
            T.append({"part": w, "channel": "position", "ease": "linear",
                      "keys": _keys(lambda u: [0, round(-bob(u), 4), 0])})
        T.append({"part": f"lead_{nm}", "axis": "x", "ease": "linear", "keys": [[0, 0], [1.0, 720]]})
        T.append({"part": f"lead_{nm}", "channel": "position", "ease": "linear",
                  "keys": _keys(lambda u: [0, round(-bob(u), 4), 0])})
        phi0 = PHASE[nm]
        y0, z0 = pin(phi0, 0)

        def rod(u, phi0=phi0, y0=y0, z0=z0):
            y, z = pin(phi0 + 360 * u, 0)
            return [0, round(y - y0 - bob(u), 4), round(z - z0, 4)]

        T.append({"part": f"rod_{nm}", "channel": "position", "ease": "linear", "keys": _keys(rod)})
        c0 = crosshead_z(phi0)
        T.append({"part": f"piston_{nm}", "channel": "position", "ease": "linear",
                  "keys": _keys(lambda u, phi0=phi0, c0=c0: [0, 0, round(crosshead_z(phi0 + 360 * u) - c0, 4)])})
        a0 = mainrod_angle(phi0)
        T.append({"part": f"mainrod_{nm}", "axis": "x", "ease": "linear",
                  "keys": _keys(lambda u, phi0=phi0, a0=a0: round(mainrod_angle(phi0 + 360 * u) - a0, 3))})
    return T


def chuff_bob(amp=0.3, chuffs=4):
    """Chassis lift: a soft bump on every exhaust beat (4 per revolution), never below rest."""
    return lambda u: amp * (0.5 - 0.5 * math.cos(2 * math.pi * chuffs * u))


def stack_puffs(part="smokestack", chuffs=4, length=1.0, amp=(0.14, 0.24, 0.14)):
    """Exhaust beats: the stack swells fast and eases back, once per chuff."""
    keys = []
    for k in range(chuffs):
        t0 = length * k / chuffs
        d = length / chuffs
        keys += [[round(t0, 4), [0, 0, 0]], [round(t0 + d * 0.3, 4), list(amp), "out"],
                 [round(t0 + d * 0.8, 4), [amp[0] * 0.15, amp[1] * 0.1, amp[2] * 0.15]]]
    keys.append([length, [0, 0, 0]])
    return {"part": part, "channel": "scale", "keys": keys}


def counter_bob_tracks(bob, length):
    """Keep the unsprung gear on the rails while the chassis bobs (idle / non-running clips)."""
    T = []
    for nm in ("l", "r"):
        for w in (f"wheel_f{nm}", f"wheel_b{nm}", f"lead_{nm}", f"rod_{nm}"):
            T.append({"part": w, "channel": "position", "ease": "linear",
                      "keys": _keys(lambda u: [0, round(-bob(u), 4), 0], length, n=int(12 * length))})
    return T


def flicker(part, length, amps=(0.06, 0.04), cycles=(7, 11), axes=(1, 1, 0)):
    """Two incommensurate wobbles summed = an irregular flame flicker (whole cycles, so it loops)."""
    return [{"part": part, "channel": "scale",
             "osc": {"amp": [a * axes[0], a * axes[1], a * axes[2]], "cycles": c, "phase": 0.13 * k}}
            for k, (a, c) in enumerate(zip(amps, cycles))]


# ------------------------------------------------------------------ shared paint
def base_ramps():
    return {
        # worn dark iron: violet-blue shadows, warm grey highlights
        "iron": ["#121216", "#1b1c21", "#25272d", "#30333a", "#3c3f46", "#494c52", "#585a5f", "#696a6d", "#7d7c7c",
                 "#93908b", "#aaa59e"],
        "steel": ["#1b1d22", "#2b2e35", "#40444b", "#585c63", "#73777c", "#909396", "#adafaf", "#c9c8c3"],
        "brass": ["#221c10", "#352b16", "#4b3d1d", "#635126", "#7c6731", "#947d3f", "#ab9452", "#c1aa6a", "#d4bf86"],
        "red": ["#1c0f0e", "#2c1513", "#3e1c18", "#53241e", "#682d23", "#7d382a", "#904634", "#a25843", "#b26e58"],
        "wood": ["#1d140e", "#2b1d13", "#3b2819", "#4d3420", "#5f4129", "#715033", "#83603f", "#94714d", "#a5845e"],
        "coal": ["#0b0b0e", "#121217", "#1a1a20", "#23232a", "#2e2e36", "#3c3c45", "#565663"],
        "glass": ["#0e1418", "#162028", "#1f2d36", "#2b3d48", "#3d525d", "#587077", "#7f9799"],
        "fire": ["#3b0f05", "#6a1c06", "#9c3009", "#cc4d10", "#ee7a1e", "#ffad40", "#ffd98a", "#fff6d8"],
        "lamp": ["#6e5420", "#b08a34", "#e2bc54", "#fbe08a", "#fff4c4", "#fffdf0"],
        "tint": ["#5e5e5e", "#717171", "#858585", "#999999", "#adadad", "#c1c1c1", "#d5d5d5", "#e8e8e8", "#f6f6f6"],
    }


PHOTO_IRON = {"id": "photo", "op": "photo", "src": "assets/photos/rusty_metal_02", "scale": 9.0, "amount": 0.3,
              "ramps": ["iron", "steel"]}
MOTTLE = {"id": "mottle", "op": "noise", "scale": 4.0, "amount": 0.3}
GRIME = {"id": "grime", "op": "gradient", "axis": "y", "amount": 0.7}
SOOT = {"id": "soot", "op": "drip", "shift": -1.3, "depth": 0.4, "length": 3.0, "width": 0.6, "scale": 2.0,
        "faces": ["sides", "front", "back"]}
RIM = {"light_shift": 1.5, "dark_shift": -1.0}


def base_styles(iron_tone=4.4, rust=False):
    """Material styles shared by both engines (a spec can override any of them)."""
    R = [RUST] if rust else []
    return {
        "frame": {"ramp": "iron", "tone": 2.6, "rim": RIM, "brush": {"flow": "z"}, "layers": [
            MOTTLE, {"id": "oil", "op": "patches", "scale": 2.0, "threshold": 0.58, "shift": -0.8},
            dict(GRIME, amount=0.9)]},
        "frame_dark": {"ramp": "iron", "tone": 2.8, "rim": RIM, "layers": [MOTTLE]},
        "footplate": {"ramp": "iron", "tone": iron_tone - 0.6, "rim": RIM, "brush": {"flow": "z"}, "layers": [
            {"id": "deck", "op": "fill", "ramp": "wood", "tone": 4.6, "faces": ["top"]},
            {"id": "planks", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.18, "shift": -1.4,
             "faces": ["top"]},
            {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.5, "faces": ["top"]},
            {"id": "edge_rivets", "op": "rivets", "spacing": 3, "inset": 0, "shadow": -0.6, "highlight": 1.0,
             "faces": ["sides"], "min_size": 1},
            MOTTLE, PHOTO_IRON]},
        "deck": {"ramp": "wood", "tone": 4.0, "brush": {"flow": "x"}, "layers": [
            {"id": "planks", "op": "stripes", "axis": "x", "period": 2.0, "width": 0.18, "shift": -1.4},
            {"id": "grain", "op": "noise", "scale": 1.4, "amount": 0.5}]},
        "beam": {"ramp": "red", "tone": 4.6, "rim": RIM, "brush": {"flow": "x"}, "layers": [
            {"id": "grain", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.3, "shift": -0.5, "wobble": 0.4},
            {"id": "chips", "op": "wear", "width": 1, "density": 0.35, "ramp": "wood", "tone": 2.6},
            {"id": "bolts", "op": "rivets", "spacing": 4, "inset": 0, "ramp": "iron", "tone": 6, "min_size": 3}]},
        "steel": {"ramp": "steel", "tone": 4.2, "rim": {"light_shift": 1.6, "dark_shift": -1.4},
                  "brush": {"flow": "long", "length": 3}, "layers": [{"id": "sheen", "op": "noise", "scale": 1.5,
                                                                       "amount": 0.4}]},
        "steel_dark": {"ramp": "steel", "tone": 2.6, "rim": {"light_shift": 1.4, "dark_shift": -1.0},
                       "layers": [MOTTLE]},
        "rod": {"ramp": "steel", "tone": 4.4, "light": 0.5, "rim": {"light_shift": 1.6, "dark_shift": -1.6},
                "brush": {"flow": "z", "length": 4, "rough": 0.5},
                "layers": [{"id": "oil", "op": "patches", "scale": 1.6, "threshold": 0.62, "shift": -1.3}]},
        "cylinder": {"ramp": "iron", "tone": iron_tone, "rim": RIM, "brush": {"flow": "z"}, "layers": [
            {"id": "lag", "op": "stripes", "axis": "z", "period": 2.5, "width": 0.2, "ramp": "brass", "tone": 4.0,
             "faces": ["sides", "top"]},
            MOTTLE, PHOTO_IRON, {"id": "drip_oil", "op": "drip", "shift": -1.0, "depth": 0.2, "length": 2.0,
                                 "width": 0.5, "faces": ["sides"]}]},
        "wheel_disk": {"ramp": "red", "tone": 4, "light": 0, "brush": {"off": True}},
        "tyre": {"ramp": "iron", "tone": 2.6, "light": 0.2, "rim": {"light_shift": 0.8, "dark_shift": -0.6},
                 "brush": {"off": True}, "layers": [
                     {"id": "tread", "op": "fill", "ramp": "steel", "tone": 4.4, "faces": ["top"]},
                     {"id": "wear", "op": "noise", "scale": 0.8, "amount": 0.5}]},
        "hub": {"ramp": "red", "tone": 3.6, "light": 0.3, "rim": {"light_shift": 1.0, "dark_shift": -0.8},
                "brush": {"off": True}, "layers": [
                    {"id": "axle", "op": "rect", "rect": [0.34, 0.34, 0.66, 0.66], "ramp": "steel", "tone": 4.6,
                     "faces": ["flanks"]}]},
        "cab": {"ramp": "iron", "tone": iron_tone + 0.4, "rim": RIM, "brush": {"flow": "y", "length": 3, "rough": 0.6},
                "layers": [MOTTLE, PHOTO_IRON, dict(GRIME, amount=0.6)] + R + [
                           {"id": "seams", "op": "panel", "inset": 1, "shift": -1.0, "highlight": 0.6, "min_size": 5,
                            "faces": ["sides", "front", "back"]},
                           {"id": "rivets", "op": "rivets", "spacing": 3, "inset": 1, "shadow": -0.8,
                            "highlight": 1.1, "min_size": 5},
                           {"id": "streaks", "op": "stripes", "axis": "x", "period": 2.3, "width": 0.25,
                            "shift": -0.6, "wobble": 0.5, "faces": ["sides", "front", "back"]},
                           {"id": "chips", "op": "wear", "width": 1, "density": 0.18, "shift": 1.4}]},
        "cab_roof": {"ramp": "iron", "tone": iron_tone - 0.8, "rim": RIM, "brush": {"flow": "z", "length": 3},
                     "layers": [MOTTLE, PHOTO_IRON,
                                {"id": "seams", "op": "stripes", "axis": "z", "period": 3.0, "width": 0.18,
                                 "shift": -1.0, "faces": ["top"]},
                                {"id": "soot", "op": "patches", "scale": 2.2, "threshold": 0.55, "shift": -1.0}]},
        "bunker": {"ramp": "iron", "tone": iron_tone - 0.2, "rim": RIM, "brush": {"flow": "y", "length": 3},
                   "layers": [MOTTLE, PHOTO_IRON, dict(GRIME, amount=0.8)] + R + [
                              {"id": "rivets", "op": "rivets", "spacing": 3, "inset": 1, "shadow": -0.8,
                               "highlight": 1.1, "min_size": 4},
                              {"id": "coal_dust", "op": "drip", "shift": -1.2, "depth": 0.3, "length": 2.0,
                               "width": 0.5, "faces": ["sides", "back"]}]},
        "iron_dark": {"ramp": "iron", "tone": 2.6, "rim": RIM, "layers": [MOTTLE]},
        "coal": {"ramp": "coal", "tone": 2.0, "rim": {"light_shift": 1.6, "dark_shift": -1.0},
                 "brush": {"flow": "long", "length": 1.5, "rough": 0.8, "textures": {"coal": "stone"}},
                 "layers": [{"id": "lumps", "op": "patches", "scale": 1.0, "threshold": 0.55, "shift": 1.0},
                            {"id": "glint", "op": "gloss", "density": 0.05, "post": True}]},
        "brass": {"ramp": "brass", "tone": 4.4, "rim": {"light_shift": 1.6, "dark_shift": -1.2},
                  "brush": {"flow": "long", "length": 2, "rough": 0.5}, "layers": [
                      {"id": "tarnish", "op": "patches", "scale": 1.4, "threshold": 0.56, "shift": -1.2},
                      {"id": "shine", "op": "gloss", "dash": True, "length": 2, "density": 0.5, "shift": 1.5,
                       "post": True}]},
        "glass": {"ramp": "glass", "tone": 2.5, "light": 0.3, "brush": {"off": True}},
        "fire": {"ramp": "fire", "tone": 4.6, "light": 0, "brush": {"off": True}, "layers": [
            {"id": "embers", "op": "patches", "scale": 0.9, "threshold": 0.5, "shift": 1.4},
            {"id": "ash", "op": "patches", "scale": 0.7, "threshold": 0.7, "shift": -1.6, "seed": 3},
            {"id": "heat", "op": "gradient", "axis": "y", "amount": -1.0}]},
        "grate": {"ramp": "iron", "tone": 3.0, "rim": RIM, "brush": {"off": True}, "layers": [MOTTLE]},
        "lamp": {"ramp": "lamp", "tone": 3.6, "light": 0, "brush": {"off": True}, "layers": [
            {"id": "core", "op": "rect", "rect": [0.3, 0.3, 0.7, 0.7], "tone": 5.0, "faces": ["front"]}]},
        "trim": {"ramp": "tint", "tone": 6.0, "rim": {"light_shift": 1.4, "dark_shift": -1.2},
                 "brush": {"flow": "long", "length": 3, "rough": 0.5}, "layers": [
                     {"id": "mottle", "op": "noise", "scale": 2.2, "amount": 0.5},
                     {"id": "chips", "op": "wear", "width": 1, "density": 0.2, "shift": -2.4},
                     {"id": "grime", "op": "gradient", "axis": "y", "amount": 0.5}]},
    }


RUST = {"id": "rust", "op": "patches", "scale": 2.6, "threshold": 0.64, "ramp": "red", "tone": 2.6}
BRUSH = {"length": 3.2, "rough": 0.5, "width": 0.6, "overshoot": 0.3, "flow": "long",
         "textures": {"iron": "metal", "steel": "metal", "brass": "metal", "red": "metal", "wood": "wood",
                      "coal": "stone", "tint": "metal"}}
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 1.1, "gradient": 0.6, "ao": 1.0, "ao_height": 9.0}
