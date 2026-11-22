"""Builds examples/netherite_spear.json (the Netherite Spear held in 3D, Winterworks 0.4, mods/winterworks/docs/
FIXES_0_4.md "Piglins, hoglins and the Withered Commander") and its 32 x 32 icon item/netherite_spear_icon.png.

    python examples/src/netherite_spear.py                   # the spec and the icon (written into the mod)
    python examples/src/netherite_spear.py --preview DIR     # also the icon at 8x in DIR

The Withered Commander's spear, as the player holds it: a long shaft of blackened netherite with gold bands and a
crimson-leather grip between two gold rings, a gold ferrule and butt spike, a gold collar and a netherite socket with
two small gold lugs (wings), and a leaf blade with a honed edge and a gold midline inlay on a diamond midrib. A small
crimson swallow-tailed pennant with a gold hem and spearhead mark hangs under the socket. About 41.5 px long, the blade
3 px across. No glow.

Held like a trident: the hand holds the shaft at the root joint `spear`, which sits at lowpix (0, 24, 0) = Minecraft
model (0, 0, 0). The spear stands straight up from there (lowpix +Y, Minecraft -Y): 25 px of shaft, socket and blade
above the hand, 16.5 px of shaft and butt below it. The blade's broad face lies in the XY plane (facing +-Z), like
the trident's prongs. Units are Minecraft pixels, density 4 (four texels per pixel), every box size a multiple of
0.25. Bones: spear (root), pennant (a card, child of spear). Clip: idle (2 s loop: the pennant flutters).

Suggested item model (models/item/netherite_spear.json: "parent": "minecraft:builtin/entity", "gui_light": "front"),
for a renderer that draws the model with the grip at the item origin and the blade up, i.e. in render():
`pose.translate(0.5f, 0.5f, 0.5f); pose.scale(1f, -1f, -1f);` then the model in Minecraft model space. Held like the
vanilla trident (the hand grips where the trident's hand does), long, the 3D model in the GUI too:

    thirdperson_righthand  rotation [0, 60, 0]     translation [0, 0, 1]       scale 1
    thirdperson_lefthand   rotation [0, 60, 0]     translation [0, 0, 1]       scale 1
    firstperson_righthand  rotation [0, -90, 35]   translation [5, -1, 0]      scale 1
    firstperson_lefthand   rotation [0, 90, -35]   translation [5, -1, 0]      scale 1
    gui                    rotation [20, 0, -45]   translation [-1.5, -1.4, 0] scale 0.5
    ground                 rotation [90, 0, 0]     translation [0, 2, -1.5]    scale 0.4
    fixed                  rotation [-20, 180, -45] translation [1.5, -1.4, 0] scale 0.5
    head                   rotation [0, 180, 0]    translation [0, 13, 7]      scale 1
"""
import argparse
import copy
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import ROOT, Rig, dump, osc  # noqa: E402
from withered_commander import RAMPS, SPEAR_STYLES, STYLES, leaf_blade, pennant  # noqa: E402

ITEM_DIR = os.path.join(ROOT, "mods", "winterworks", "src", "main", "resources", "assets", "winterworks", "textures",
                        "item")

# ======================================================================= the 3D spear
R = Rig(density=4, bone_style="spear_shaft")
part, bone, card = R.part, R.bone, R.card

G = 24.0                                    # the grip (Minecraft y = 0)
BUTT, SHAFT_TOP, SOCK, TIP = -16.5, 15.5, 18.0, 25.0
bone("spear", None, at=(0, G, 0))
part("shaft", "spear", [1, SHAFT_TOP - (BUTT + 2.0), 1], "spear_shaft",
     centre=(0, G + (SHAFT_TOP + BUTT + 2.0) / 2, 0))
# the grip: crimson leather wound between two gold rings
part("grip", "spear", [1.5, 5, 1.5], "grip", centre=(0, G, 0))
for k, y in enumerate((-2.75, 2.75)):
    part(f"grip_ring_{k}", "spear", [1.75, 0.5, 1.75], "gold", centre=(0, G + y, 0))
for k, y in enumerate((-9.0, 8.0, 12.0)):
    part(f"band_{k}", "spear", [1.5, 0.75, 1.5], "gold", centre=(0, G + y, 0))
# the butt: a gold ferrule and a short square spike, turned 45 degrees
part("ferrule", "spear", [1.5, 1.25, 1.5], "gold", centre=(0, G + BUTT + 1.375, 0))
part("butt", "spear", [0.75, 1.5, 0.75], "gold_tip", centre=(0, G + BUTT + 0.0, 0), rot=(0, 45, 0))
part("butt_tip", "butt", [0.5, 0.75, 0.5], "gold_tip", centre=(0, G + BUTT - 0.25, 0), rot=(0, 45, 0))
# the head: a gold collar, a netherite socket, two small gold lugs (wings) swept up
part("collar", "spear", [2, 0.75, 2], "gold", centre=(0, G + SHAFT_TOP + 0.375, 0))
part("socket", "spear", [1.5, 2, 1.5], "spear_socket", centre=(0, G + SHAFT_TOP + 1.5, 0), rot=(0, 45, 0))
for s, n in ((1, "l"), (-1, "r")):
    lug = part(f"lug_{n}", "spear", [0.75, 1.25, 0.5], "gold", at=(s * 0.7, G + SHAFT_TOP + 1.0, 0),
               offset=(0, 0.5, 0), rot=(0, 0, -s * 58))
    part(f"lug_{n}_tip", lug["id"], [0.5, 0.75, 0.5], "gold_tip", rel=(0, 1.25, 0), rot=(0, 0, s * 18))
# the leaf blade: a diamond midrib and the leaf (an alpha-cut card in the XY plane: honed edge, gold midline)
part("midrib", "spear", [0.5, TIP - SOCK - 0.5, 0.5], "spear_rib", centre=(0, G + (SOCK + TIP - 0.5) / 2, 0),
     rot=(0, 45, 0))
card("blade", "spear", leaf_blade(12, int(round((TIP - SOCK) * 4)), inlay=2.5), "spear_blade",
     centre=(0, G + (SOCK + TIP) / 2, 0), plane="xy")
# the pennant under the socket, hanging off the -X side
card("pennant", "spear", pennant(9, 15), "pennant", at=(-0.6, G + SHAFT_TOP - 0.5, 0), offset=(-1.125, -1.875, 0),
     plane="xy")

# ======================================================================= palette and paint
ramps = {k: RAMPS[k] for k in ("netherite", "gold", "crimson", "leather")}
styles = copy.deepcopy(SPEAR_STYLES)
styles.update({k: copy.deepcopy(STYLES[k]) for k in ("gold", "gold_tip", "grip")})
styles["spear_shaft"]["layers"][0].update({"period": 1.25, "width": 0.25})
styles["grip"]["layers"][0].update({"period": 0.75, "width": 0.4})

ANIM = {"idle": {"length": 2.0, "loop": True, "tracks": [
    osc("pennant", "y", 18, 2, 0.0), osc("pennant", "z", 5, 1, 0.3)]}}

spec = {
    "name": "Netherite Spear",
    "description": "The Winterworks Netherite Spear (the Withered Commander's): a long blackened-netherite shaft with "
                   "gold bands and a crimson-leather grip, a gold butt spike, a gold collar and lugs, a leaf blade "
                   "with a honed edge and a gold midline, a crimson pennant. Minecraft pixel units, density 4; the "
                   "grip at the root joint, held like a trident.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 4,
    "grounded": False,
    "budget": {"tris": 500, "colors": 48},
    "light": {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.3, "ao": 0.0},
    "brush": {"flow": "long", "length": 1.0, "width": 0.25, "rough": 0.4, "overshoot": 0.3,
              "textures": {"netherite": "metal", "gold": "metal", "crimson": "cloth", "leather": "leather"}},
    "minecraft": {"fps": 20},
    "render": {"background": "#3a2a2e", "hero": [-34, 16], "shadow": 0.3},
    "palette": {"ramps": ramps},
    "styles": styles,
    "parts": R.P,
    "animations": ANIM,
}


# ======================================================================= the 32 x 32 icon
OUTLINE = "#0b070b"


def C(ref):
    ramp, i = ref.split(":")
    return RAMPS[ramp][int(i)]


class Icon:
    def __init__(self, n=32):
        self.n = n
        self.px = [[None] * n for _ in range(n)]

    def set(self, x, y, c):
        if 0 <= x < self.n and 0 <= y < self.n:
            self.px[y][x] = C(c) if ":" in c else c

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.n and 0 <= y < self.n else None

    def outline(self, colour=OUTLINE):
        add = [(x, y) for y in range(self.n) for x in range(self.n)
               if self.px[y][x] is None and any(self.get(x + dx, y + dy) not in (None, colour)
                                                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in add:
            self.px[y][x] = colour

    def image(self):
        im = Image.new("RGBA", (self.n, self.n), (0, 0, 0, 0))
        for y in range(self.n):
            for x in range(self.n):
                c = self.px[y][x]
                if c:
                    im.putpixel((x, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
        return im


def icon():
    """The spear on the diagonal like a vanilla tool: the butt at the bottom left, the blade at the top right. Pixels
    are placed by their position along the spear (u, from the butt) and across it (v, < 0 the lit upper-left side)."""
    c = Icon()
    x0, y0 = 1.5, 30.5                      # the butt's point
    a = (1 / math.sqrt(2), -1 / math.sqrt(2))
    nrm = (1 / math.sqrt(2), 1 / math.sqrt(2))

    def uv(x, y):
        dx, dy = x + 0.5 - x0, y + 0.5 - y0
        return dx * a[0] + dy * a[1], dx * nrm[0] + dy * nrm[1]

    def paint(fn):
        for y in range(32):
            for x in range(32):
                u, v = uv(x, y)
                col = fn(u, v)
                if col:
                    c.set(x, y, col)

    # the pennant first (the shaft crosses in front of it): a little swallow-tailed flag hanging straight down from
    # under the socket, a gold hem along the top, a gold spearhead mark, the forked tail at the bottom
    # Columns x = 18..21 hang from just under the shaft (row 33 - x); the outer columns are the two tails.
    for i, (x, n, shade) in enumerate(((18, 6, "crimson:7"), (19, 4, "crimson:6"), (20, 4, "crimson:5"),
                                       (21, 6, "crimson:3"))):
        top = 33 - x
        c.set(x, top, "gold:6")                              # the gold hem along the top
        for k in range(1, n):
            c.set(x, top + k, shade)
        if i in (1, 2):
            c.set(x, top + 2, "gold:7")                      # the gold spearhead mark
    c.set(19, top + 1, "gold:5")

    # the shaft: blackened netherite, lit on its upper-left edge
    def shaft(u, v):
        if 2.5 <= u <= 28.5 and -1.0 <= v <= 0.75:
            return "netherite:7" if v < -0.25 else ("netherite:4" if v < 0.3 else "netherite:2")
        return None
    paint(shaft)

    # the grip: crimson leather wound in diagonal turns, between gold rings
    def grip(u, v):
        if 11.5 <= u <= 17.0 and -1.4 <= v <= 1.1:
            turn = int((u + v * 0.8) * 1.4) % 2 == 0
            return ("leather:5" if v < -0.2 else "leather:3") if turn else ("leather:3" if v < -0.2 else "leather:1")
        return None
    paint(grip)

    def bands(u, v):
        for b0, b1 in ((10.4, 11.4), (17.1, 18.1), (22.0, 23.0)):
            if b0 <= u <= b1 and -1.4 <= v <= 1.1:
                return "gold:8" if v < -0.4 else ("gold:6" if v < 0.4 else "gold:3")
        return None
    paint(bands)

    # the butt: a gold ferrule and spike
    def butt(u, v):
        if 1.0 <= u <= 3.2 and -1.2 <= v <= 1.0:
            return "gold:7" if v < -0.2 else "gold:4"
        if -0.2 <= u < 1.0 and abs(v) <= 0.6 * (u + 0.2):
            return "gold:8" if v < 0 else "gold:5"
        return None
    paint(butt)

    # the head: a gold collar, a netherite socket, two gold lugs swept up and out
    def head(u, v):
        if 28.0 <= u <= 29.2 and -1.6 <= v <= 1.4:
            return "gold:8" if v < -0.5 else ("gold:6" if v < 0.5 else "gold:3")
        if 29.2 < u <= 31.0 and -1.0 <= v <= 0.8:
            return "netherite:8" if v < -0.2 else "netherite:4"
        for s in (1, -1):                     # the lugs: short slanted wings off each side
            if 29.4 <= u <= 31.4 and 1.0 <= s * v <= 1.0 + (u - 29.0) * 0.9 and s * v <= 2.6:
                return "gold:7" if s < 0 else "gold:4"
        return None
    paint(head)

    # the leaf blade: widest a third of the way up, a honed light edge, the shaded half, a gold midline
    def blade(u, v):
        t = (u - 30.8) / 10.2
        if not 0.0 <= t <= 1.0:
            return None
        half = 2.7 * (0.45 + 0.55 * math.sin(t / 0.33 * math.pi / 2)) if t < 0.33 else 2.7 * ((1 - t) / 0.67) ** 0.85
        if abs(v) > half:
            return None
        if abs(v) <= 0.45 and t < 0.84:
            return "gold:7" if t < 0.5 else "gold:5"
        if abs(v) > half - 0.85:
            return "netherite:11" if v < 0 else "netherite:6"
        return "netherite:8" if v < 0 else "netherite:3"
    paint(blade)

    # glints: one on the gold collar, one on the blade's edge, the honed tip
    c.set(21, 9, "gold:9")
    c.set(26, 5, "netherite:11")
    c.outline()
    return c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default=os.path.join(ROOT, "examples", "netherite_spear.json"))
    ap.add_argument("--preview", default=None)
    ap.add_argument("--icon-dir", default=ITEM_DIR)
    a = ap.parse_args()
    dump(spec, a.out)
    im = icon().image()
    os.makedirs(a.icon_dir, exist_ok=True)
    path = os.path.join(a.icon_dir, "netherite_spear_icon.png")
    im.save(path)
    print(path)
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        big = im.resize((256, 256), Image.NEAREST)
        sheet = Image.new("RGBA", (288, 288), (58, 42, 46, 255))
        sheet.alpha_composite(big, (16, 16))
        sheet.save(os.path.join(a.preview, "netherite_spear_icon_x8.png"))
        print(os.path.join(a.preview, "netherite_spear_icon_x8.png"))


if __name__ == "__main__":
    main()
