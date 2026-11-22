"""Builds examples/elixir_jar.json: the Elixir Jar (Winterworks, Hexes & Havoc; a lantern-sized block entity).

    python examples/src/elixir_jar.py examples/elixir_jar.json

A squat brass-and-glass brewing jar about the size of a lantern (8 x 12 x 8 px, 14 px with its chain loop): a brass foot
on four stubby claw feet, a glass belly held by four brass corner straps riveted to a heavy shoulder ring, a little
brass spout with a flared lip, a stepped neck and a lid with a knob and a chain loop on top, a paper recipe tag
tied round the neck. Inside, the elixir (a light, neutral liquid: the game tints it) and a few bubbles.

Units are Minecraft pixels (16 per block), density 2, every box size a multiple of 0.5, so the model exports 1:1 to
a vanilla entity model (python -m lowpix mc export). Centred on x = z = 0, the feet on y = 0; faces +Z (the spout
side). The chain loop and the tag string are cards.

Contract (mods/winterworks/docs/HEXES_UPDATE.md sections 1 and 9): bones jar (root: the brass body), lid, liquid
(pivot at the centre of the liquid's bottom, so scaling it in Y fills it from the floor; the game tints it with the
elixir's colour and scales it by the fill level), bubble_0..bubble_3 (children of liquid, tinted with it). glass is
an alpha part (opacity 0.4: draw it translucent). Tint parts: liquid, bubble_*. Clips: idle (a lazy bubble now and
then), bubble (loop: a rolling boil, bubbles streaming up, the lid rattling).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, keys, osc  # noqa: E402

R = Rig(density=2, bone_style="brass")
part, bone, card = R.part, R.bone, R.card

# ======================================================================= the brass body
part("jar", None, [8, 1, 8], "brass_dark", at=(0, 0, 0), centre=(0, 1.0, 0))
for k, (x, z) in enumerate([(3, 3), (-3, 3), (-3, -3), (3, -3)]):
    part(f"foot{k}", "jar", [2, 0.5, 2], "brass", centre=(x, 0.25, z), rot=(0, 45, 0))
part("cup", "jar", [7, 1, 7], "brass", centre=(0, 2.0, 0))
# the glass belly (alpha) and the brass straps at its corners, riveted top and bottom
part("glass", "jar", [6.5, 5, 6.5], "glass", centre=(0, 5.0, 0))
for k, (x, z) in enumerate([(3.25, 3.25), (-3.25, 3.25), (-3.25, -3.25), (3.25, -3.25)]):
    part(f"strap{k}", "jar", [1, 5, 1], "brass_strap", centre=(x, 5.0, z), rot=(0, 45, 0))
part("shoulder", "jar", [8, 1, 8], "brass", centre=(0, 8.0, 0))
part("shoulder_lip", "shoulder", [7, 0.5, 7], "brass_dark", centre=(0, 7.25, 0))
part("neck", "jar", [5, 1, 5], "brass_dark", centre=(0, 9.0, 0))
# the little spout: a tube out of the shoulder, angled up, a flared lip
part("spout", "jar", [1.5, 1.5, 3], "brass", at=(0, 8.0, 3.5), offset=(0, 0, 1.2), rot=(-32, 0, 0))
part("spout_lip", "spout", [2, 2, 0.5], "brass_lip", rel=(0, 0, 2.8))
# a paper recipe tag on a string round the neck
card("tag_string", "neck", ["s.", ".s", ".s", "s."], "string", rel=(2.6, 0, 1.5), offset=(0, -1, 0), plane="yz")
part("tag", "neck", [0.5, 2, 1.5], "tag", rel=(2.75, -2.6, 1.6), rot=(0, 0, 8))

# ======================================================================= the lid, its knob and the chain loop
part("lid", "jar", [6, 1, 6], "brass", at=(0, 9.5, 0), offset=(0, 0.5, 0))
part("lid_step", "lid", [4.5, 0.5, 4.5], "brass_dark", rel=(0, 1.25, 0))
part("knob", "lid", [2, 1, 2], "brass_lip", rel=(0, 2.0, 0))
LOOP = [".cCCc.", "c....c", "C....C", "c....c"]
card("chain_loop", "knob", LOOP, "chain", rel=(0, 0.5, 0), offset=(0, 1, 0))

# ======================================================================= the elixir and its bubbles (tinted in game)
part("liquid", "jar", [6, 4, 6], "liquid", at=(0, 2.5, 0), offset=(0, 2.0, 0))
BUBBLES = [(-1.5, 1.0), (1.5, -0.5), (0.5, 1.5), (-1.0, -1.5)]
for k, (x, z) in enumerate(BUBBLES):
    part(f"bubble_{k}", "liquid", [1, 1, 1], "bubble", rel=(x, 0.8, z))

# ======================================================================= palette and paint
ramps = {
    "brass": ["#1e1208", "#33200d", "#4d3214", "#6b471c", "#8c6025", "#ad7c30", "#c99a3f", "#ddb756", "#ecd27a",
              "#f8ecb2"],
    "verdigris": ["#13302a", "#1d4a3e", "#2b6853", "#3f8a6a"],
    "glass": ["#253a40", "#3d5c64", "#5f858d", "#8db2b6", "#c4dcdc", "#eef8f6"],
    # the elixir is painted in a light neutral ramp: the game multiplies it by the elixir's colour
    "elixir": ["#5a5a5a", "#7a7a7a", "#9a9a9a", "#bdbdbd", "#dcdcdc", "#f4f4f4", "#ffffff"],
    "paper": ["#6f5b3e", "#a08660", "#cbb68e", "#e8d9b4"],
    "ink": ["#2a1420", "#4a1e33"],
}
RIM = {"light": 1, "dark": 1, "light_shift": 2.2, "dark_shift": -1.8}
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 0, "density": 0.5,
         "shift": 2.2}
styles = {
    "brass": {"ramp": "brass", "tone": 5.4, "rim": RIM,
              "layers": [{"id": "patina", "op": "patches", "scale": 1.2, "threshold": 0.78, "ramp": "verdigris",
                          "tone": 2.4},
                         {"id": "rivets", "op": "rivets", "inset": 0, "spacing": 6, "highlight": 2.0, "shadow": -2.0,
                          "faces": ["sides"]}, GLOSS]},
    "brass_dark": {"ramp": "brass", "tone": 3.6, "rim": RIM,
                   "layers": [{"id": "patina", "op": "patches", "scale": 1.0, "threshold": 0.72, "ramp": "verdigris",
                               "tone": 1.8}]},
    "brass_strap": {"ramp": "brass", "tone": 5.0, "rim": RIM, "brush": {"off": True},
                    "layers": [{"id": "rivet", "op": "stripes", "axis": "y", "period": 5.0, "width": 0.18,
                                "shift": 2.4, "phase": 0.08}]},
    "brass_lip": {"ramp": "brass", "tone": 6.4, "rim": RIM, "brush": {"off": True}, "layers": [GLOSS]},
    "glass": {"ramp": "glass", "tone": 2.4, "light": 0.35, "brush": {"off": True}, "dither": 0.0,
              "rim": {"light_shift": 1.6, "dark": 0},
              "layers": [{"id": "sheen", "op": "band", "axis": "x", "from": -0.75, "to": -0.45, "ramp": "glass",
                          "tone": 5, "faces": ["front", "back"]},
                         {"id": "sheen_s", "op": "band", "axis": "z", "from": 0.45, "to": 0.75, "ramp": "glass",
                          "tone": 4.6, "faces": ["left", "right"]},
                         {"id": "fog", "op": "band", "axis": "y", "from": 0.7, "to": 1.01, "ramp": "glass",
                          "tone": 3.4, "faces": ["sides"]}]},
    "liquid": {"ramp": "elixir", "tone": 4.0, "light": 0.5, "brush": {"off": True}, "rim": {"light": 0, "dark": 0},
               "layers": [{"id": "deep", "op": "gradient", "axis": "y", "amount": 1.4},
                          {"id": "surface", "op": "band", "axis": "y", "from": 0.75, "to": 1.01, "ramp": "elixir",
                           "tone": 6.0, "faces": ["sides"]},
                          {"id": "swirl", "op": "stripes", "axis": [1, 0.8, 0.4], "period": 2.5, "width": 0.25,
                           "shift": -1.0, "faces": ["sides"]},
                          {"id": "foam", "op": "spots", "count": 3, "radius": [0.4, 0.7], "ramp": "elixir",
                           "tone": 6.0, "faces": ["top"]}]},
    "bubble": {"ramp": "elixir", "tone": 6.0, "light": 0.2, "brush": {"off": True}, "rim": {"light": 0, "dark": 0}},
    "string": {"ramp": "paper", "tone": 1, "brush": {"off": True}, "art_key": {"s": "paper:1"}},
    "tag": {"ramp": "paper", "tone": 2.6, "rim": RIM, "brush": {"off": True},
            "stamps": [{"faces": ["right", "left"], "at": "center", "art": ["k.", ".K", "k."],
                        "key": {"k": "ink:0", "K": "ink:1"}}]},
    "chain": {"ramp": "brass", "tone": 5, "brush": {"off": True}, "art_key": {"c": "brass:5", "C": "brass:7"}},
}

# ======================================================================= clips
BUB = [f"bubble_{k}" for k in range(len(BUBBLES))]


def bubble_track(name, length, t0, rise, height=3.0, wobble=0.5):
    """One bubble, looping: it swells on the floor at t0, rises `height` px over `rise` s (speeding up), pops at the
    surface, then waits (shrunk to nothing) on the floor until its next turn. Keys wrap round the clip's end."""
    rel_p = [(0.0, [0, 0, 0], None), (rise * 0.5, [wobble, height * 0.38, 0], "in"),
             (rise, [-wobble * 0.5, height, 0], "in"), (rise + 0.02, [0, 0, 0], "step")]
    rel_s = [(0.0, [-1, -1, -1], None), (0.08, [0, 0, 0], "out"), (rise - 0.06, [0.4, 0.4, 0.4], None),
             (rise, [-1, -1, -1], "in")]
    out = []
    for ch, rel in (("position", rel_p), ("scale", rel_s)):
        ks = []
        for t, v, e in rel:
            k = [round((t0 + t) % length, 4), v]
            if e:
                k.append(e)
            ks.append(k)
        out.append({"part": name, "channel": ch, "keys": sorted(ks, key=lambda k: k[0]), "ease": "ease"})
    return out


ANIM = {}
# idle: barely simmering: one lazy bubble, then another, the surface breathing
L = 3.0
ANIM["idle"] = {"length": L, "loop": True, "tracks": (
    bubble_track("bubble_0", L, 0.3, 1.3) + bubble_track("bubble_2", L, 1.6, 1.2)
    + [{"part": b, "channel": "scale", "keys": [[0, [-1, -1, -1]], [L, [-1, -1, -1]]]} for b in ("bubble_1", "bubble_3")]
    + [osc("liquid", None, [0.0, 0.025, 0.0], 2, ch="scale"),
       keys("lid", "z", [[0, 0], [1.5, 0], [1.55, 2, "out"], [1.7, 0], [3.0, 0]]),
       keys("lid", None, [[0, [0, 0, 0]], [1.5, [0, 0, 0]], [1.55, [0, 0.25, 0], "out"], [1.7, [0, 0, 0], "in"],
                          [3.0, [0, 0, 0]]], ch="position")])}

# bubble: a rolling boil: bubbles stream up one after another, the surface heaves, the lid hops and rattles, the jar
# jiggles on its feet
L = 1.0
tr = []
for k, b in enumerate(BUB):
    tr += bubble_track(b, L, 0.06 + k * 0.22, 0.62, height=3.0, wobble=0.6 if k % 2 else -0.6)
LID_HOP = [[0, [0, 0, 0]], [0.12, [0, 0.75, 0], "out"], [0.24, [0, 0, 0], "in"], [0.5, [0, 0, 0]],
           [0.6, [0, 0.6, 0], "out"], [0.7, [0, 0, 0], "in"], [1.0, [0, 0, 0]]]
LID_TILT = [[0, [0, 0, 0]], [0.12, [6, 0, -8], "out"], [0.24, [0, 0, 0], "in"], [0.3, [-3, 0, 4]], [0.36, [0, 0, 0]],
            [0.5, [0, 0, 0]], [0.6, [-5, 0, 7], "out"], [0.7, [0, 0, 0], "in"], [0.76, [3, 0, -3]], [0.82, [0, 0, 0]],
            [1.0, [0, 0, 0]]]
JIG = [[0, [0, 0, 0]], [0.24, [0, 0, 0]], [0.27, [0.04, -0.05, 0.04], "out"], [0.36, [0, 0, 0]], [0.7, [0, 0, 0]],
       [0.73, [0.03, -0.04, 0.03], "out"], [0.82, [0, 0, 0]], [1.0, [0, 0, 0]]]
ANIM["bubble"] = {"length": L, "loop": True, "tracks": tr + [
    {"part": "lid", "channel": "position", "keys": LID_HOP, "ease": "ease"},
    {"part": "lid", "channel": "rotation", "keys": LID_TILT, "ease": "smooth"},
    {"part": "jar", "channel": "scale", "keys": JIG, "ease": "smooth"},
    osc("liquid", None, [0.03, 0.06, 0.03], 4, 0.1, ch="scale"),
    osc("liquid", "z", 1.5, 2, 0.2),
    osc("chain_loop", "x", 14, 2, 0.3),
    osc("tag", "z", 8, 2, 0.4),
]}

spec = {
    "name": "Elixir Jar",
    "description": "The Winterworks Elixir Jar: a lantern-sized brass-and-glass brewing jar with a spout, a lidded "
                   "neck, a chain loop and a recipe tag; the elixir and its bubbles are tinted by the game. Minecraft "
                   "pixel units, density 2.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 2,
    "budget": {"tris": 500, "colors": 48},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.8, "gradient": 0.4, "ao": 0.6, "ao_height": 3.0},
    "brush": {"flow": "long", "length": 1.6, "width": 0.5, "rough": 0.4, "overshoot": 0.3,
              "textures": {"brass": "metal"}},
    "minecraft": {"fps": 24, "alpha_parts": {"glass": 0.4}, "tint_parts": ["liquid"] + BUB},
    "render": {"background": "#22191f", "hero": [-34, 20], "shadow": 0.45},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "examples", "elixir_jar.json")
    dump(spec, out)
