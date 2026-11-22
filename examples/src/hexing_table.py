"""Builds examples/hexing_table.json: the Hexing Table (Winterworks, Hexes & Havoc; a block with a block entity).

    python examples/src/hexing_table.py examples/hexing_table.json

A cursed take on the enchanting table: a dark netherite table (a plinth, a carved body with crying-obsidian inlays,
four gold-capped corner pillars, a heavy top slab with gold trim) whose top is carved with a ring of cursed runes
that smoulder soul-blue; soul-fire braziers burn on gold stands at the four corners, iron chains sag under the slab
between the pillars. Above it floats an open hexed book: purple-black leather with gold corners and a gold eye on
the cover, pages scrawled with crimson and soul-blue glyphs, a red ribbon, a broken chain dangling off its clasp.

Units are Minecraft pixels (16 per block), density 1 (vanilla block texel size), every box a whole number of pixels,
so the model exports 1:1 to a vanilla entity model (python -m lowpix mc export). The table fills x, z = -8..8,
y = 0..12 like the enchanting table; the braziers' flames and the book rise above it. Faces +Z. Chains, flames,
pages, ribbon and the book's chain are cards.

Contract (mods/winterworks/docs/HEXES_UPDATE.md sections 2 and 9): bones table (root: the whole table and the
braziers), book (the floating book's own pivot at its spine, 6 px above the table top; the game bobs it and turns it
about Y to face the player), cover_l, cover_r (hinged at the spine; the rest pose is the open book), pages (the loose
leaves, hinged at the spine), flame_0..flame_3 (one per brazier, a pair of crossed flame cards each; glow). The rune
texels on the top glow too (soul colours, `glow_ramps`). Clips: idle (the book bobbing, the flames flickering), open
(0.6 s: closed at t = 0, open at the end; play it backwards to close), hex (1.5 s: the book surges, the pages
flutter, the flames flare and lean in).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import FLAME_SMALL, ROOT, SOUL_KEY, Rig, dump, jitter, keys, osc, shake, timeline  # noqa: E402

R = Rig(density=1, bone_style="netherite")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= the table
part("table", None, [16, 2, 16], "plinth", at=(0, 0, 0), centre=(0, 1, 0))
part("body", "table", [12, 7, 12], "carved", centre=(0, 5.5, 0))
for k, (x, z) in enumerate([(6, 6), (-6, 6), (-6, -6), (6, -6)]):
    p = part(f"pillar{k}", "table", [3, 7, 3], "pillar", centre=(x, 5.5, z))
    part(f"pillar_cap{k}", p["id"], [4, 1, 4], "gold", centre=(x, 8.5, z))
    part(f"pillar_foot{k}", p["id"], [4, 1, 4], "gold_dark", centre=(x, 2.5, z))
part("slab", "table", [16, 3, 16], "slab", centre=(0, 10.5, 0))
# chains sagging under the slab's overhang between the pillars
SWAG = ["c.......c", ".C.....C.", "..c...c..", "...CcC..."]
for k, yaw in enumerate((0, 90, 180, 270)):
    a = math.radians(yaw)
    card(f"chain{k}", "table", SWAG, "chain", at=(7.0 * math.sin(a), 7.0, 7.0 * math.cos(a)), rot=(0, yaw, 0))
# soul-fire braziers on gold stands at the corners: a bowl of soul sand, a pair of crossed flames
for k, (x, z) in enumerate([(6, 6), (-6, 6), (-6, -6), (6, -6)]):
    st = part(f"stand{k}", "table", [2, 1, 2], "gold_dark", centre=(x, 12.5, z))
    bowl = part(f"bowl{k}", st["id"], [4, 2, 4], "bowl", centre=(x, 14, z))
    bone(f"flame_{k}", bowl["id"], at=(x, 15, z))
    card(f"flame_{k}_a", f"flame_{k}", FLAME_SMALL, "flame", rel=(0, 0, 0), offset=(0, 2.6, 0), rot=(0, 45, 0))
    card(f"flame_{k}_b", f"flame_{k}", FLAME_SMALL, "flame", rel=(0, 0, 0), offset=(0, 2.6, 0), rot=(0, -45, 0))

# ======================================================================= the floating hexed book
# book frame: the spine runs along local Z, the open pages face local +Y; the book leans its pages toward the front
bone("book", "table", at=(0, 18, 0), rot=(40, 0, 0))
part("spine", "book", [1, 1, 8], "leather", rel=(0, -0.5, 0))
for s in (1, -1):
    n = "l" if s > 0 else "r"
    cov = part(f"cover_{n}", "book", [6, 1, 8], "cover", rel=(s * 0.5, 0, 0), offset=(s * 3, -0.5, 0),
               rot=(0, 0, s * 12))
    part(f"page_block_{n}", cov["id"], [5, 1, 7], f"page_block_{n}", rel=(s * 3, 0.5, 0))
    for c, cz in enumerate((3.5, -3.5)):
        part(f"corner_{n}{c}", cov["id"], [2, 1, 1], "gold", rel=(s * 5.5, -0.5, cz))
part("eye", "cover_r", [2, 1, 2], "gold_eye", rel=(-3, -1.0, 0))
card("book_chain", "cover_r", ["c", "C", "c", "C", "c"], "chain", rel=(-6.1, -0.5, 1.5), offset=(0, -2.5, 0),
     plane="yz")
card("ribbon", "spine", ["r", "r", "R", "r", ".r"][:4], "ribbon", rel=(0, -0.5, -3.8), offset=(0, -2, 0),
     plane="yz")
# the loose leaves, hinged at the spine, lying on the right-hand pages
bone("pages", "book", rel=(0, 0.6, 0))
GLYPHS = [["kkpkp", "ppppp", "kpkkp", "ppppp", "kkpsp", "ppppp", "kpkkp"],
          ["pkpkk", "ppppp", "kkspp", "ppppp", "kpkpk", "ppppp", "pkkpk"],
          ["kpkpp", "ppppp", "pkkkp", "ppppp", "spkpk", "ppppp", "kkppp"]]
for k in range(3):
    card(f"page_{k}", "pages", GLYPHS[k], "page", rel=(0, 0.1 * k, 0), offset=(-2.5, 0, 0), plane="xz",
         rot=(0, 0, -12 + 4 * k))

# ======================================================================= palette and paint
ramps = {
    "netherite": ["#0d0a0c", "#161114", "#1f191d", "#2a2227", "#352c31", "#42383d", "#51464b", "#61565b", "#73686d"],
    "gold": ["#3b1d06", "#5e300a", "#86470e", "#ad6213", "#cf8118", "#e8a422", "#f6c836", "#fde466", "#fff4ae"],
    "obsidian": ["#0c0414", "#1a0830", "#2c0f52", "#451a7a", "#6630a6", "#8f52cf", "#b98cf0"],
    "soul": ["#06191d", "#0b2f36", "#0f4a52", "#136b72", "#1a9397", "#2cbdbb", "#5ee0d6", "#a4fcef", "#effffb"],
    "soulsand": ["#1c120c", "#2b1d14", "#3d2a1d", "#503927"],
    "leather": ["#120812", "#1e0d1f", "#2d1430", "#3e1c43", "#512757", "#66346b"],
    "paper": ["#5d4a35", "#8c7656", "#b9a27b", "#d9c8a0", "#eee2c2", "#faf3de"],
    "ink": ["#3a0610", "#6a0d1a", "#9a1826"],
    "iron": ["#18181d", "#2a2a31", "#3e3e47", "#55555f", "#6f6f79", "#8d8d96"],
}
RIM = {"light": 1, "dark": 1, "light_shift": 1.8, "dark_shift": -1.6}
GOLD_RIM = {"light": 1, "dark": 1, "light_shift": 2.4, "dark_shift": -2.0}
NETHERITE = [{"id": "grain", "op": "noise", "scale": 1.0, "amount": 0.6},
             {"id": "scratches", "op": "wear", "width": 1, "density": 0.1, "shift": 1.6}]
GOLD_GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0, "density": 0.6,
              "shift": 2.0}
# the rune ring carved into the top: dark grooves with soul fire smouldering in them (16 x 16, top face)
RUNES = ["................",
         "...g.ss.g..ss...",
         "..g........g.s..",
         ".s.gggg.ggggg...",
         ".s.g..........s.",
         "..g..s.ss.s..g..",
         ".gg.s......s.g..",
         "..g..s....s..gg.",
         ".gg.s.s..s.s.g..",
         "..g..s....s..g..",
         ".s.g..ss.ss..gs.",
         ".s.g.........g..",
         "...ggggg.gggg.s.",
         "..s.g.........g.",
         "...ss..g.ss..g..",
         "................"]
RUNE_KEY = {"g": "netherite:0", "s": "soul:6"}
# carved side panels: a sigil (an eye in a hexagon) round a crying obsidian inlay
PANEL = [".gggggg.", "g......g", "g.oOOo.g", "g.OsOO.g", "g.oOOo.g", "g......g", ".gggggg."]
PANEL_KEY = {"g": "gold:2", "o": "obsidian:3", "O": "obsidian:5", "s": "soul:6"}
styles = {
    "netherite": {"ramp": "netherite", "tone": 4.0, "rim": RIM, "layers": NETHERITE},
    "plinth": {"ramp": "netherite", "tone": 3.4, "rim": RIM,
               "layers": NETHERITE + [{"id": "trim", "op": "band", "axis": "y", "from": 0.2, "to": 1.01,
                                       "ramp": "gold", "tone": 4.4, "faces": ["sides"],
                                       "bevel": {"shadow": 1, "highlight": 0}}]},
    "carved": {"ramp": "netherite", "tone": 3.0, "rim": RIM,
               "layers": NETHERITE + [{"id": "panel", "op": "panel", "inset": 1, "shift": -1.0, "highlight": 1.4,
                                       "shadow": -1.2, "faces": ["sides"]}],
               "stamps": [{"faces": ["sides"], "at": [2, 0], "art": PANEL, "key": PANEL_KEY}]},
    "pillar": {"ramp": "netherite", "tone": 4.4, "rim": RIM, "brush": {"flow": "y"},
               "layers": NETHERITE + [{"id": "flutes", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.4,
                                       "shift": -1.2, "faces": ["front", "back"]},
                                      {"id": "flutes_s", "op": "stripes", "axis": "z", "period": 1.0, "width": 0.4,
                                       "shift": -1.2, "faces": ["left", "right"]}]},
    "slab": {"ramp": "netherite", "tone": 3.8, "rim": RIM,
             "layers": NETHERITE + [{"id": "trim", "op": "band", "axis": "y", "from": 0.33, "to": 1.01,
                                     "ramp": "gold", "tone": 4.8, "faces": ["sides"],
                                     "bevel": {"shadow": 1, "highlight": 1}}],
             "stamps": [{"face": "top", "at": "top-left", "art": RUNES, "key": RUNE_KEY}]},
    "gold": {"ramp": "gold", "tone": 5.6, "rim": GOLD_RIM, "brush": {"off": True}, "layers": [GOLD_GLOSS]},
    "gold_dark": {"ramp": "gold", "tone": 4.0, "rim": GOLD_RIM, "brush": {"off": True}},
    "bowl": {"ramp": "gold", "tone": 4.6, "rim": GOLD_RIM, "brush": {"off": True},
             "layers": [{"id": "sand", "op": "rect", "rect": [0.25, 0.25, 0.75, 0.75], "ramp": "soulsand", "tone": 1.6,
                         "faces": ["top"]},
                        {"id": "ember", "op": "rect", "rect": [0.25, 0.5, 0.5, 0.75], "ramp": "soul", "tone": 5.0,
                         "faces": ["top"]},
                        {"id": "band", "op": "band", "axis": "y", "from": -0.2, "to": 0.2, "ramp": "netherite",
                         "tone": 2.0, "faces": ["sides"]}]},
    "chain": {"ramp": "iron", "tone": 3, "brush": {"off": True}, "art_key": {"c": "iron:3", "C": "iron:5"}},
    "flame": {"ramp": "soul", "tone": 5.0, "light": 0, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
              "art_key": SOUL_KEY},
    "leather": {"ramp": "leather", "tone": 3.0, "rim": RIM, "brush": {"off": True}},
    "cover": {"ramp": "leather", "tone": 3.4, "rim": RIM, "brush": {"flow": "z"},
              "layers": [{"id": "grain", "op": "noise", "scale": 0.6, "amount": 0.7},
                         {"id": "tooling", "op": "panel", "inset": 1, "shift": -1.0, "highlight": 1.2, "shadow": -1.0,
                          "faces": ["bottom"]}]},
    "gold_eye": {"ramp": "gold", "tone": 5.4, "rim": GOLD_RIM, "brush": {"off": True},
                 "stamps": [{"face": "bottom", "at": "top-left", "art": ["ss", "sS"],
                             "key": {"s": "soul:5", "S": "soul:8"}}]},
    "page_block_l": {"ramp": "paper", "tone": 3.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.0,
                                                          "dark_shift": -1.2},
                     "brush": {"off": True},
                     "layers": [{"id": "leaves", "op": "stripes", "axis": "y", "period": 0.5, "width": 0.5,
                                 "shift": -0.8, "faces": ["sides"]}],
                     "stamps": [{"face": "top", "at": [0, 0], "art": ["kk.k.", ".....", "k.kk.", ".....", ".ss.k",
                                                                      ".....", "kk.kk"],
                                 "key": {"k": "ink:1", "s": "soul:6"}}]},
    "page_block_r": {"ramp": "paper", "tone": 3.6, "rim": {"light": 1, "dark": 1, "light_shift": 1.0,
                                                          "dark_shift": -1.2},
                     "brush": {"off": True},
                     "layers": [{"id": "leaves", "op": "stripes", "axis": "y", "period": 0.5, "width": 0.5,
                                 "shift": -0.8, "faces": ["sides"]}],
                     "stamps": [{"face": "top", "at": [0, 0], "art": [".k.kk", ".....", "kk.s.", ".....", "k.kk.",
                                                                      ".....", "s.k.k"],
                                 "key": {"k": "ink:1", "s": "soul:6"}}]},
    "page": {"ramp": "paper", "tone": 4.4, "light": 0.4, "brush": {"off": True},
             "art_key": {"p": "paper:4", "k": "ink:1", "s": "soul:6"}},
    "ribbon": {"ramp": "ink", "tone": 2, "brush": {"off": True}, "art_key": {"r": "ink:2", "R": "ink:1"}},
}

# ======================================================================= clips
FLAMES = [f"flame_{k}" for k in range(4)]
CORNERS = [(6, 6), (-6, 6), (-6, -6), (6, -6)]


def flicker(length, rate=5.0, amp=1.0):
    """Soul fire: every brazier's flame stretches, squats and licks sideways on its own beat."""
    out = []
    for k, f in enumerate(FLAMES):
        c = max(1, round(length * rate))
        out.append(osc(f, None, [0.12 * amp, 0.28 * amp, 0.12 * amp], c, 0.17 * k, ch="scale"))
        out.append(osc(f, "z", 7 * amp, max(1, round(c * 0.6)), 0.23 * k + 0.1))
        out.append(osc(f, "x", 5 * amp, max(1, round(c * 0.4)), 0.31 * k + 0.3))
    return out


def lean_in(a):
    """Every flame leans `a` degrees toward the book in the middle."""
    out = {}
    for f, (x, z) in zip(FLAMES, CORNERS):
        out[f] = {"r": [-a if z > 0 else a, 0, a if x > 0 else -a]}
    return out


def flare(sx, sy):
    return {f: {"s": [sx, sy, sx]} for f in FLAMES}


ANIM = {}
L = 4.0
ANIM["idle"] = {"length": L, "loop": True, "tracks": [
    osc("book", None, [0, 0.8, 0], 1, ch="position"),
    osc("book", "z", 3, 1, 0.25), osc("book", "x", 2.5, 1, 0.5),
    osc("cover_l", "z", 2, 2, 0.1), osc("cover_r", "z", -2, 2, 0.1),
    keys("page_0", "z", [[0, 0], [1.4, 0], [2.0, 26], [2.6, 4], [3.0, 0], [4.0, 0]]),
    osc("page_1", "z", 2, 2, 0.4),
    osc("book_chain", "x", 9, 1, 0.35), osc("ribbon", "x", 7, 1, 0.45),
    osc("chain0", "x", 2, 1), osc("chain1", "x", 2, 1, 0.25), osc("chain2", "x", 2, 1, 0.5),
    osc("chain3", "x", 2, 1, 0.75),
] + flicker(L)}

# open: the closed book flips open, the covers overshoot flat and spring back, the pages fan out
CLOSED = {"cover_l": {"r": [0, 0, 78]}, "cover_r": {"r": [0, 0, -78]}, "pages": {"r": [0, 0, -78]},
          "book": {"p": [0, -1.0, 0]}}
OPENING = {"cover_l": {"r": [0, 0, -12]}, "cover_r": {"r": [0, 0, 12]}, "pages": {"r": [0, 0, 16]},
           "page_0": {"r": [0, 0, 60]}, "page_1": {"r": [0, 0, 30]}, "book": {"p": [0, 0.6, 0]}}
ANIM["open"] = timeline(0.6, [(0.0, CLOSED, None), (0.12, CLOSED, None),
                              (0.36, OPENING, "out"), (0.47, {"cover_l": {"r": [0, 0, 3]}, "cover_r": {"r": [0, 0, -3]},
                                                              "page_0": {"r": [0, 0, 16]}}, "ease"),
                              (0.6, {}, "ease")],
                        lock=False, extra=[keys("book", "x", [[0, 0], [0.12, 0], [0.2, -8], [0.4, 4], [0.6, 0]])]
                        + flicker(0.6, rate=5.0, amp=0.6))

# hex: a dip, then the book surges up flung wide open, its pages flutter back and forth, it shudders in the air;
# the flames flare up and lean in toward it; everything settles back
GATHER = {"book": {"p": [0, -0.8, 0]}, "cover_l": {"r": [0, 0, 14]}, "cover_r": {"r": [0, 0, -14]}}
SURGE = {"book": {"p": [0, 2.6, 0], "r": [-12, 0, 0]}, "cover_l": {"r": [0, 0, -14]}, "cover_r": {"r": [0, 0, 14]}}
ANIM["hex"] = timeline(1.5, [
    (0.0, {}, None), (0.12, {**GATHER, **lean_in(-8)}, "ease"),
    (0.26, {**SURGE, **lean_in(28), **{f: {"r": lean_in(28)[f]["r"], "s": [0.6, 1.3, 0.6]} for f in FLAMES}}, "out"),
    (1.0, {**SURGE, **{f: {"r": lean_in(22)[f]["r"], "s": [0.4, 1.0, 0.4]} for f in FLAMES},
           "book": {"p": [0, 2.2, 0], "r": [-8, 0, 0]}}, "ease"),
    (1.22, {"book": {"p": [0, -0.4, 0]}, "cover_l": {"r": [0, 0, 4]}, "cover_r": {"r": [0, 0, -4]}}, "in"),
    (1.36, {"book": {"p": [0, 0.2, 0]}}, "ease"), (1.5, {}, "ease")],
    lock=False,
    extra=[jitter("book", 0.28, 1.0, 4.0, step=1 / 12, axis=2, seed=3),
           jitter("book", 0.3, 1.0, 3.0, step=1 / 12, axis=1, seed=4),
           shake("cover_l", 0.28, 1.05, 10, freq=6, axis=2), shake("cover_r", 0.3, 1.05, -10, freq=6, axis=2),
           shake("book_chain", 0.26, 1.3, 30, freq=3, axis=0), shake("ribbon", 0.26, 1.3, 26, freq=3.5, axis=0)]
    + [{"part": f"page_{k}", "axis": "z", "ease": "ease",
        "keys": [[0, 0], [0.26 + 0.07 * k, 0]] + [[round(0.26 + 0.07 * k + 0.18 * (j + 1), 3), 190 if j % 2 == 0 else 0]
                                                 for j in range(4)] + [[1.5, 0]]} for k in range(3)]
    + flicker(1.5, rate=7.0, amp=1.4))

spec = {
    "name": "Hexing Table",
    "description": "The Winterworks Hexing Table: a cursed enchanting table of dark netherite and gold with a "
                   "rune-carved top smouldering soul-blue, soul-fire braziers at the corners, sagging chains, and an "
                   "open hexed book floating above. Minecraft pixel units, density 1.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "budget": {"tris": 700, "colors": 72},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.8, "gradient": 0.4, "ao": 0.6, "ao_height": 4.0},
    "brush": {"flow": "horizontal", "length": 2.0, "width": 1.0, "rough": 0.4, "overshoot": 0.3,
              "textures": {"netherite": "metal", "gold": "metal", "leather": "leather"}},
    "minecraft": {"fps": 24, "glow_parts": [p["id"] for p in R.P if p["id"].startswith("flame_")],
                  "glow_ramps": ["soul"]},
    "render": {"background": "#1d1820", "hero": [-34, 22], "shadow": 0.45},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "hexing_table.json")
    dump(spec, out)
