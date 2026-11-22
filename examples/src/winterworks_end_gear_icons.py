#!/usr/bin/env python3
"""Winterworks "Living End": the 32 x 32 2D icons of the three 3D gear items (END_UPDATE.md section 15).

    python examples/src/winterworks_end_gear_icons.py                    # write the three PNGs into the mod
    python examples/src/winterworks_end_gear_icons.py --preview DIR      # also a contact sheet (8x) in DIR

    textures/item/obsidian_shield_icon.png   the shield face-on: iron rim and riveted caps, obsidian plates with
                                             glowing seams, the Obolisk eye in its violet-gold diamond
    textures/item/end_glider_icon.png        the glider from above: moth wings with glowing eye-spots, the
                                             shulker-shell core, meteorite nose, antennae, violet jets trailing
    textures/item/monolith_wand_icon.png     the wand on the diagonal like a vanilla tool: starry void-rod shaft,
                                             gold bands, obsidian pommel with an ember, the caged violet eye

Drawn in code, pixel by pixel, with the same ramps as the 3D models (obsidian_kit.RAMPS), light from the top-left,
hue-shifted dark outlines (never black) and only the glows saturated.
"""
import argparse
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from obsidian_kit import RAMPS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ITEM_DIR = os.path.join(ROOT, "mods", "winterworks", "src", "main", "resources", "assets", "winterworks", "textures",
                        "item")
EXTRA = {
    "membrane": ["#150c22", "#21143a", "#2f1d52", "#3f2a68", "#52397f", "#6a4d96", "#8a6bb0", "#b49ad0", "#e2d4f0"],
    "meteorite": ["#141114", "#211b1e", "#302727", "#433533", "#584640", "#6f5a4f"],
    "gland": ["#2c1020", "#4a1a33", "#6c2a4a", "#8f3f62", "#b0587a", "#cc7894", "#e39db0", "#f4c6d0"],
}
OUTLINE = "#0b0614"


def C(ref):
    ramp, i = ref.split(":")
    r = RAMPS.get(ramp) or EXTRA[ramp]
    return r[int(i)]


class Canvas:
    def __init__(self, n=32):
        self.n = n
        self.px = [[None] * n for _ in range(n)]

    def set(self, x, y, c):
        if 0 <= x < self.n and 0 <= y < self.n:
            self.px[y][x] = C(c) if ":" in c else c

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.n and 0 <= y < self.n else None

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c, w=1):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for k in range(n + 1):
            x = round(x0 + (x1 - x0) * k / n)
            y = round(y0 + (y1 - y0) * k / n)
            for dx in range(w):
                self.set(x + dx, y, c)

    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            for x in range(self.n):
                if _inside(x + 0.5, y + 0.5, pts):
                    self.set(x, y, c)

    def outline(self, colour=OUTLINE, diagonal=False):
        """A 1px hue-shifted dark outline round everything drawn so far."""
        nb = ((1, 0), (-1, 0), (0, 1), (0, -1)) + (((1, 1), (-1, 1), (1, -1), (-1, -1)) if diagonal else ())
        add = [(x, y) for y in range(self.n) for x in range(self.n)
               if self.px[y][x] is None and any(self.get(x + dx, y + dy) not in (None, colour) for dx, dy in nb)]
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


def _inside(x, y, pts):
    hit = False
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


# ======================================================================= the Obsidian Shield, face-on
def shield():
    c = Canvas()
    X0, X1, Y0, Y1 = 8, 23, 2, 29           # the rim's outer edge
    # iron rim: lit top/left, shaded bottom/right, a dark inner lip
    c.rect(X0, Y0, X1, Y1, "iron:4")
    c.rect(X0, Y0, X1, Y0 + 1, "iron:5")
    c.rect(X0, Y0, X0 + 1, Y1, "iron:5")
    c.rect(X0, Y0, X1, Y0, "iron:6")
    c.rect(X0, Y0, X0, Y1, "iron:6")
    c.rect(X1 - 1, Y0 + 1, X1, Y1, "iron:3")
    c.rect(X0 + 1, Y1 - 1, X1, Y1, "iron:3")
    for y in range(Y0 + 5, Y1 - 3, 5):     # rivets down both sides
        c.set(X0 + 1, y, "iron:7")
        c.set(X1 - 1, y, "iron:5")
    # the obsidian field inside, then the plates with glowing seams between them
    IX0, IX1, IY0, IY1 = X0 + 2, X1 - 2, Y0 + 2, Y1 - 2
    c.rect(IX0, IY0, IX1, IY1, "crying:4")
    plates = [(IX0, IY0, IX1, 8), (IX0, 10, 15, 20), (17, 10, IX1, 20), (IX0, 22, IX1, IY1)]
    for k, (a, b, d, e) in enumerate(plates):
        c.rect(a, b, d, e, "obsidian:3")
        c.rect(a, b, d, b, "obsidian:5")              # lit top edge
        c.rect(a, b, a, e, "obsidian:4")              # lit left edge
        c.rect(a + 1, e, d, e, "obsidian:1")          # shaded bottom
        c.rect(d, b + 1, d, e, "obsidian:2")          # shaded right
        # glassy facet streaks
        for j in range(3):
            x = a + 2 + (j * 4 + k * 3) % max(1, d - a - 2)
            y = b + 1 + (j * 3 + k) % max(1, e - b - 1)
            c.set(x, y, "obsidian:6")
            c.set(x + 1, y, "obsidian:5")
    c.set(11, 6, "crying:3")                          # veins leaking light
    c.set(12, 7, "crying:3")
    c.set(20, 25, "crying:3")
    c.set(19, 26, "crying:3")
    c.rect(IX0, 9, IX1, 9, "crying:5")                # the seams glow brighter in the middle
    c.rect(IX0, 21, IX1, 21, "crying:5")
    c.rect(16, 10, 16, 20, "crying:5")
    for x, y in ((14, 9), (18, 21), (16, 12)):
        c.set(x, y, "crying:7")
    # corner caps, crest and foot
    for cx, cy in ((X0, Y0), (X1 - 2, Y0), (X0, Y1 - 2), (X1 - 2, Y1 - 2)):
        c.rect(cx - 1 if cx == X0 else cx, cy - 1 if cy == Y0 else cy, cx + 2 if cx == X0 else cx + 3,
               cy + 2 if cy == Y0 else cy + 3, "iron:5")
        c.set(cx + 1 if cx == X0 else cx + 1, cy + 1 if cy == Y0 else cy + 1, "iron:7")
    c.rect(14, Y0 - 1, 17, Y0 - 1, "iron:5")
    c.rect(15, Y0 - 2, 16, Y0 - 2, "iron:6")
    c.rect(14, Y1 + 1, 17, Y1 + 1, "iron:3")
    # the Obolisk eye: a violet-gold diamond, an obsidian boss, a dark socket, the glowing slit eye
    cx, cy = 15.5, 15.5
    for y in range(32):
        for x in range(32):
            d = abs(x + 0.5 - cx) + abs(y + 0.5 - cy)
            if d <= 6.6:
                lit = (x + 0.5 - cx) + (y + 0.5 - cy) < 0
                if d > 5.6:
                    c.set(x, y, "gold:6" if lit else "gold:3")
                elif d > 4.7:
                    c.set(x, y, "obsidian:5" if lit else "obsidian:2")
                else:
                    c.set(x, y, "obsidian:3")
    for y in range(13, 19):
        for x in range(11, 21):
            u, v = abs(x + 0.5 - cx) / 5.0, abs(y + 0.5 - cy) / 2.6
            dd = u ** 1.4 + v ** 1.8
            if dd <= 1.0:
                c.set(x, y, "obsidian:0")
            if dd <= 0.62:
                c.set(x, y, "eye:4" if dd > 0.3 else "eye:5")
    for y in (14, 15, 16, 17):
        c.set(16, y, "obsidian:0")
    c.set(15, 15, "eye:6")
    c.set(14, 15, "eye:7")
    c.set(17, 16, "eye:3")
    c.outline()
    return c


# ======================================================================= the End Glider, from above (front up)
def glider():
    c = Canvas()
    for s in (1, -1):
        def X(u):
            return 15.5 + s * u
        # forewing: a long blade out to a tip near the front; hindwing: a rounded lobe behind it
        fore = [(X(2), 9), (X(9), 6), (X(14), 6.5), (X(15.6), 8.5), (X(14.5), 11), (X(9), 13.5), (X(2), 14)]
        c.poly(fore, "membrane:3")
        for y in range(12, 25):
            for x in range(32):
                u = (x + 0.5 - X(7)) / 6.0
                v = (y + 0.5 - 18.0) / 5.8
                if u * u + v * v < 1.0 + 0.15 * math.sin(math.atan2(v, u) * 6):
                    c.set(x, y, "membrane:3")
        # lighter scales on the outer forewing, a pale band
        for y in range(6, 14):
            for x in range(32):
                if c.get(x, y) == C("membrane:3") and abs(x + 0.5 - 15.5) > 8 and (x + y) % 3:
                    c.set(x, y, "membrane:5" if y < 9 else "membrane:4")
        # veins from the root
        for tx, ty in ((14, 7), (11, 12), (8, 21), (12, 23)):
            c.line(round(X(2)), 13, round(X(tx)), ty, "membrane:1")
        # eye-spots
        for ex, ey, r in ((11, 9.5, 1.6), (7, 19, 1.6)):
            for y in range(32):
                for x in range(32):
                    d = math.hypot(x + 0.5 - X(ex), y + 0.5 - ey)
                    if d < r + 0.8:
                        c.set(x, y, "membrane:0")
                    if d < r:
                        c.set(x, y, "crying:4")
                    if d < r * 0.5:
                        c.set(x, y, "crying:7")
        # spar along the forewing's front edge
        c.line(round(X(2)), 9, round(X(14)), 7, "purpur:5")
        # the jet pod's back end and its violet air-jet, tapering behind it
        jx = round(X(4.5)) - (1 if s < 0 else 0)
        c.rect(jx - 1, 15, jx + 1, 18, "purpur:3")
        c.set(jx - 1, 15, "purpur:5")
        c.rect(jx - 1, 18, jx + 1, 18, "meteorite:3")
        for y, half, col in ((19, 1, "crying:5"), (20, 1, "crying:5"), (21, 1, "crying:4"), (22, 0, "crying:5"),
                             (23, 0, "crying:4"), (24, 0, "crying:3"), (25, 0, "crying:2")):
            for dx in range(-half, half + 1):
                c.set(jx + dx, y, col)
        for y in (19, 20, 21):
            c.set(jx, y, "crying:7")
        c.set(jx + s, 23, "crying:3")
    # the core: shell plate with a ridge, bellows peeking out at the sides, meteorite nose, antennae
    c.rect(12, 9, 19, 20, "purpur:3")
    c.rect(12, 9, 19, 9, "purpur:5")
    c.rect(12, 9, 12, 20, "purpur:4")
    c.rect(19, 10, 19, 20, "purpur:2")
    c.rect(12, 20, 19, 20, "purpur:1")
    c.rect(15, 10, 16, 19, "purpur:2")
    c.rect(15, 10, 15, 19, "purpur:4")
    for y in (12, 15, 18):
        c.set(11, y, "gland:4")
        c.set(20, y, "gland:3")
    c.rect(14, 6, 17, 8, "meteorite:3")
    c.rect(14, 6, 17, 6, "meteorite:4")
    c.set(16, 7, "ember:5")
    c.set(15, 8, "ember:4")
    c.line(14, 5, 11, 1, "membrane:6")
    c.line(17, 5, 20, 1, "membrane:6")
    c.set(10, 1, "membrane:7")
    c.set(21, 1, "membrane:7")
    c.rect(14, 21, 17, 22, "purpur:2")                       # tail fin
    # the handle bar slung under it: struts down to an iron bar with leather grips and meteorite caps
    c.line(13, 21, 12, 26, "iron:4")
    c.line(18, 21, 19, 26, "iron:3")
    c.rect(7, 27, 24, 27, "iron:5")
    c.rect(7, 28, 24, 28, "iron:3")
    for gx in (8, 20):
        c.rect(gx, 26, gx + 3, 29, "#553536")
        c.rect(gx, 26, gx + 3, 26, "#6d4743")
        c.set(gx + 1, 28, "#3f262b")
        c.set(gx + 3, 27, "#3f262b")
    c.rect(6, 26, 6, 29, "meteorite:4")
    c.rect(25, 26, 25, 29, "meteorite:2")
    c.set(6, 27, "ember:5")
    c.outline()
    return c


# ======================================================================= the Monolith Wand, on the diagonal
def wand():
    c = Canvas()
    # shaft: a 2px void rod from the pommel (bottom-left) to the head (top-right), stars in it
    for k in range(17):
        x, y = 6 + k, 25 - k
        c.set(x, y, "void:3")
        c.set(x + 1, y, "void:4" if k % 2 else "void:3")
        c.set(x, y - 1, "void:5")
    for k in (2, 6, 9, 13):
        c.set(6 + k + (k % 2), 25 - k, "star:2" if k % 3 else "star:3")
    c.set(9, 21, "star:1")
    # gold bands across the shaft
    for k in (4, 11):
        x, y = 6 + k, 25 - k
        c.set(x - 1, y, "gold:6")
        c.set(x, y, "gold:5")
        c.set(x + 1, y, "gold:5")
        c.set(x + 2, y, "gold:3")
        c.set(x, y - 1, "gold:6")
        c.set(x + 1, y + 1, "gold:3")
    # pommel: an obsidian diamond with an ember
    for y in range(24, 31):
        for x in range(1, 9):
            d = abs(x + 0.5 - 5) + abs(y + 0.5 - 27)
            if d <= 3.2:
                c.set(x, y, "obsidian:5" if (x + 0.5 - 5) + (y + 0.5 - 27) < -0.5 else "obsidian:2")
    c.set(4, 27, "ember:5")
    c.set(5, 27, "ember:4")
    c.set(4, 26, "ember:6")
    # head: a collar, then prongs bowing round the eye to a capped point (a lens along the wand's axis)
    hx, hy = 24.0, 8.0
    ax, ay = 1 / math.sqrt(2), -1 / math.sqrt(2)          # along the wand, toward the tip
    for y in range(0, 17):
        for x in range(15, 32):
            dx, dy = x + 0.5 - hx, y + 0.5 - hy
            sa = dx * ax + dy * ay
            tb = dx * -ay + dy * ax                         # < 0: the top-left (lit) side
            half = 4.6 * (1 - (sa / 7.2) ** 2)
            if abs(sa) < 7.2 and abs(tb) <= half and abs(tb) > half - 1.7:
                c.set(x, y, "obsidian:6" if tb < 0 else "obsidian:3")
                if tb < 0 and abs(tb) > half - 0.8:
                    c.set(x, y, "obsidian:7")
    for y in range(0, 17):
        for x in range(15, 32):
            d = math.hypot(x + 0.5 - hx, y + 0.5 - hy)
            if d < 3.1:
                c.set(x, y, "eye:3" if d > 2.3 else ("eye:5" if d > 1.2 else "eye:6"))
    for y in (7, 8, 9):
        c.set(24, y, "obsidian:0")
    c.set(23, 7, "eye:7")
    # collar (gold-ringed) where the shaft enters, a cap and spike at the tip
    c.set(19, 12, "gold:6")
    c.set(20, 13, "gold:4")
    c.set(18, 12, "gold:5")
    c.set(19, 13, "gold:3")
    c.set(28, 3, "obsidian:5")
    c.set(29, 3, "obsidian:3")
    c.set(28, 4, "obsidian:3")
    c.set(29, 2, "obsidian:6")
    c.set(30, 1, "obsidian:6")
    for x, y in ((20, 4), (28, 12), (25, 2)):
        c.set(x, y, "ember:5")
    c.set(21, 5, "ember:4")
    c.outline()
    return c


ICONS = {"obsidian_shield_icon": shield, "end_glider_icon": glider, "monolith_wand_icon": wand}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default=None)
    ap.add_argument("--out", default=ITEM_DIR)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ims = []
    for name, fn in ICONS.items():
        im = fn().image()
        im.save(os.path.join(a.out, name + ".png"))
        ims.append(im)
        print(os.path.join(a.out, name + ".png"))
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        s = 8
        sheet = Image.new("RGBA", (len(ims) * (32 * s + 16) + 16, 32 * s + 32), (42, 39, 53, 255))
        for i, im in enumerate(ims):
            big = im.resize((32 * s, 32 * s), Image.NEAREST)
            sheet.alpha_composite(big, (16 + i * (32 * s + 16), 16))
        sheet.save(os.path.join(a.preview, "end_gear_icons.png"))
        print(os.path.join(a.preview, "end_gear_icons.png"))


if __name__ == "__main__":
    main()
