#!/usr/bin/env python3
"""Winterworks "Living End": the 32 x 32 2D icons of the three 3D gear items (END_UPDATE.md section 15).

    python examples/src/winterworks_end_gear_icons.py                    # write the three PNGs into the mod
    python examples/src/winterworks_end_gear_icons.py --preview DIR      # also a contact sheet (8x) in DIR

    textures/item/obsidian_shield_icon.png   the shield face-on: iron rim and riveted caps, obsidian plates with
                                             glowing seams, a round Obolisk eye in a round violet-gold ringed boss
    textures/item/end_glider_icon.png        the glider from above: two pairs of translucent violet moth wings
                                             with glowing veins, round eye-spots and the rune sigils at their
                                             roots, the slim keel, the A-frame struts and the silk-gripped bar
    textures/item/monolith_wand_icon.png     the wand on the diagonal like a vanilla tool: starry void-rod shaft,
                                             gold bands, obsidian pommel with an ember, the caged round eye

Drawn in code, pixel by pixel, with the same ramps as the 3D models (obsidian_kit.RAMPS), light from the top-left,
hue-shifted dark outlines (never black) and only the glows saturated. Every eye is round (END_UPDATE.md, "Eyes") and
comes from obsidian_kit.eyeball, the generator the 3D eyes use.
"""
import argparse
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from obsidian_kit import RAMPS, eyeball  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ITEM_DIR = os.path.join(ROOT, "mods", "winterworks", "src", "main", "resources", "assets", "winterworks", "textures",
                        "item")
EXTRA = {   # the End Glider's own ramps (examples/src/end_glider.py)
    "membrane": ["#1c0f33", "#28154a", "#371d62", "#46277a", "#583291", "#6b40a6", "#8156ba", "#9a71cc", "#b590dc",
                 "#d2b5ec"],
    "vein": ["#5d2bbf", "#7d45e0", "#a06df5", "#c39bff", "#e3cdff", "#faf3ff"],
    "spot": ["#640f52", "#9c1f7c", "#d33da0", "#f26bc0", "#ff9fd8", "#ffd2ee", "#fff4fb"],
    "silver": ["#25202e", "#3a3346", "#534a62", "#6f667f", "#8e859e", "#aea6bd", "#cfc9da", "#ece9f2"],
    "pearl": ["#3a3050", "#5a4e74", "#7f739a", "#a69bbe", "#cbc2dd", "#ebe6f4", "#fdfbff"],
    "silk": ["#1b0f2a", "#2b1840", "#3e2458", "#533271", "#6a428b", "#8558a6"],
}
# a round eye's characters (obsidian_kit.eyeball) -> colours; lid characters are left out (the setting shows)
EYE_KEY = {"u": "obsidian:0", "l": "obsidian:6", "d": "sclera:3", "s": "sclera:5", "S": "sclera:6", "o": "eye:1",
           "i": "eye:3", "I": "eye:4", "J": "eye:5", "c": "eye:5", "p": "obsidian:0", "q": "eye:1", "W": "#ffffff",
           "w": "eye:6"}
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

    def stamp(self, x0, y0, rows, key):
        """Pixel art rows at (x0, y0); characters missing from `key` are left as they are."""
        for ry, row in enumerate(rows):
            for rx, ch in enumerate(row):
                if ch in key:
                    self.set(x0 + rx, y0 + ry, key[ch])

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
    # the Obolisk eye: a round boss ringed in violet-gold, a dark socket, a round eye (lit lower lid, shaded
    # eyeball, round glowing iris, round pupil, catch-light)
    cx, cy = 16.0, 15.5
    for y in range(32):
        for x in range(32):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            lit = dx + dy < 0
            if d <= 6.6:
                if d > 5.7:
                    c.set(x, y, "gold:6" if lit else ("gold:4" if dx + dy < 3 else "gold:3"))
                elif d > 4.9:
                    c.set(x, y, "obsidian:5" if lit else "obsidian:2")
                else:
                    c.set(x, y, "obsidian:3")
    c.set(12, 11, "gold:7")
    c.set(13, 10, "gold:7")
    c.stamp(11, 11, eyeball(10, 9, 8, 7, iris=5, lid_shade=1), EYE_KEY)
    c.set(12, 17, "obsidian:6")
    c.outline()
    return c


# ======================================================================= the End Glider, from above (front up)
def glider():
    c = Canvas()

    def disc(cx, cy, d, col, where=None):
        for y in range(32):
            for x in range(32):
                if math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= d / 2.0 + 1e-6 and (where is None or where(x, y)):
                    c.set(x, y, col)

    wing_px = set()
    for s in (1, -1):
        def X(u):
            return 16.0 + s * u
        # the hindwing: a rounded fan, its tail trailing back and out; then the broad forewing over it
        hind = [(X(0.6), 11), (X(5), 11.5), (X(9.5), 13), (X(11.5), 15.5), (X(11.5), 18.5), (X(13), 21.5),
                (X(14.5), 24.5), (X(13), 24.5), (X(10.5), 21.5), (X(7.5), 19.5), (X(4), 17.5), (X(0.6), 15)]
        fore = [(X(0.6), 5.5), (X(4), 3.2), (X(9), 2.2), (X(13), 2.8), (X(15.4), 5), (X(15.6), 8.5), (X(13.5), 11.5),
                (X(9), 13.2), (X(4), 13), (X(0.6), 11)]
        for shape, base in ((hind, 3), (fore, 4)):
            pts = [(x, y) for x, y in shape]
            c.poly(pts if s > 0 else pts[::-1], f"membrane:{base}")
        for y in range(32):
            for x in range(32):
                u = abs(x + 0.5 - 16.0)
                if c.get(x, y) in (C("membrane:3"), C("membrane:4")) and (x - 16 + 0.5) * s > 0:
                    wing_px.add((x, y))
                    # deep violet at the root, paling to lilac toward the edges
                    tone = 1 if u < 3 else (2 if u < 6 else (3 if u < 10 else 4))
                    if y > 13 and u > 3:
                        tone = max(1, tone - 1)
                    c.set(x, y, f"membrane:{tone}")
        # glowing veins fanning from the root
        for tx, ty in ((13.5, 3.2), (15.2, 6.5), (13.5, 11), (9, 12.8), (11, 16), (13.5, 23.5)):
            c.line(round(X(1.5)), 9, round(X(tx)), round(ty), "vein:2")
    # the rims, lighter, then the eye-spots and sigils
    for x, y in list(wing_px):
        if any(c.get(x + dx, y + dy) is None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            c.set(x, y, "membrane:6" if (x + y) % 4 else "vein:3")
    for s in (1, -1):
        def X(u):
            return 16.0 + s * u
        # forewing eye-spot: a dark ring, a rose iris lit low, a round pupil, a catch-light
        ex, ey = X(10.5) - 0.5 * (s < 0), 7.5
        ex = math.floor(ex) + 0.5
        disc(ex, ey, 7, "membrane:0")
        disc(ex, ey, 5, "spot:3")
        for x, y in ((0, 1), (1, 1), (-1, 1), (1, 0), (0, 2)):
            c.set(int(ex + x), int(ey + y), "spot:4")
        c.set(int(ex), int(ey), "membrane:0")
        c.set(int(ex) - 1, int(ey) - 1, "#ffffff")
        # hindwing eye-spot, smaller
        hx = math.floor(X(9.0)) + 0.5
        disc(hx, 17.5, 5, "membrane:0")
        disc(hx, 17.5, 3, "spot:3")
        c.set(int(hx), 18, "spot:4")
        c.set(int(hx), 17, "membrane:0")
        c.set(int(hx) - 1, 16, "spot:6")
        # the rune sigil at the wing root
        sx = math.floor(X(4.0)) + 0.5
        disc(sx, 8.5, 5, "crying:4")
        disc(sx, 8.5, 3, "crying:1")
        c.set(int(sx), 8, "crying:7")
        c.set(int(sx), 9, "crying:5")
    # the keel, its pearl heart and two feathery antennae
    c.rect(15, 3, 16, 13, "silver:3")
    c.rect(15, 3, 15, 13, "silver:5")
    c.rect(15, 9, 16, 9, "gold:5")
    c.rect(15, 2, 16, 2, "pearl:4")
    c.set(15, 2, "pearl:6")
    c.line(15, 1, 12, 0, "membrane:7")
    c.line(16, 1, 19, 0, "membrane:7")
    # the A-frame struts down to the bar, silk grips, gold collars, pearl finials on upturned tips
    for (x0, y0, x1, y1, col) in ((15, 14, 11, 26, "silver:6"), (16, 14, 20, 26, "silver:4")):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for k in range(n + 1):     # the struts show only below the wings (seen from above, the wings hide them)
            x, y = round(x0 + (x1 - x0) * k / n), round(y0 + (y1 - y0) * k / n)
            if (x, y) not in wing_px:
                c.set(x, y, col)
    c.rect(6, 27, 25, 27, "silver:6")
    c.rect(6, 28, 25, 28, "silver:3")
    for gx in (7, 21):
        c.rect(gx, 27, gx + 3, 28, "silk:3")
        for k in range(0, 4, 2):
            c.set(gx + k, 27, "silk:5")
            c.set(gx + k + 1, 28, "silk:1")
    c.set(11, 27, "gold:6")
    c.set(11, 28, "gold:4")
    c.set(20, 27, "gold:6")
    c.set(20, 28, "gold:4")
    c.set(5, 27, "silver:5")
    c.set(4, 26, "silver:6")
    c.set(26, 27, "silver:4")
    c.set(27, 26, "silver:5")
    c.set(3, 25, "pearl:5")
    c.set(28, 25, "pearl:4")
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
    # the eye in the cage: a round eyeball, shaded, its round glowing iris, round pupil and catch-light
    for y in range(0, 17):
        for x in range(15, 32):
            dx, dy = x + 0.5 - hx, y + 0.5 - hy
            if math.hypot(dx, dy) <= 3.0:
                c.set(x, y, "sclera:6" if dx + dy < -1.5 else ("sclera:4" if dx + dy < 1.5 else "sclera:3"))
    for y in range(0, 17):
        for x in range(15, 32):
            dx, dy = x + 0.5 - hx, y + 0.5 - hy
            if math.hypot(dx, dy) <= 2.0:
                c.set(x, y, "eye:3" if dy < 0 else "eye:5")
    c.set(23, 8, "obsidian:0")
    c.set(24, 8, "obsidian:0")
    c.set(23, 7, "obsidian:0")
    c.set(24, 7, "obsidian:0")
    c.set(23, 6, "#ffffff")
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
