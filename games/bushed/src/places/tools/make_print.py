#!/usr/bin/env python3
"""BUSHED places: printed and painted matter as pixel art. Two atlases:

  signs.png   (1024x1024, ~250-400 px/m)  store sign, posters, price board, fire-danger sign, thermometer face,
                                         calendar, notices, gas pump faces, scale dial
  labels.png  (1024x1024, 512 px/m)      product labels (invented bilingual brands) and product surfaces

and src/places/print_atlas.ts with the pixel rectangles. All brands, slogans and art are original.
Text is drawn with antialiasing OFF (crisp pixel text): TTF fonts at >= 10 px, a hand-made 3x5 font below.

    cd games/bushed && python3 src/places/tools/make_print.py
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(GAME, "public", "assets", "textures", "places")
TS = os.path.join(GAME, "src", "places", "print_atlas.ts")

F = "/usr/share/fonts/truetype/"
FONTS = {
    "serif": F + "dejavu/DejaVuSerif-Bold.ttf", "sans": F + "dejavu/DejaVuSans-Bold.ttf", "sansr": F + "dejavu/DejaVuSans.ttf",
    "cal": F + "crosextra/Caladea-Bold.ttf", "cali": F + "crosextra/Caladea-BoldItalic.ttf", "free": F + "freefont/FreeSerifBold.ttf",
    "freei": F + "freefont/FreeSerifItalic.ttf", "mono": F + "dejavu/DejaVuSansMono-Bold.ttf", "carl": F + "crosextra/Carlito-Bold.ttf",
}
_fc: dict = {}


def font(name, size):
    k = (name, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(FONTS[name], size)
    return _fc[k]


rng = np.random.default_rng


# ---------------------------------------------------------------------------------------------- tiny font
TINY = {
    "A": "010101111101101", "B": "110101110101110", "C": "011100100100011", "D": "110101101101110", "E": "111100110100111",
    "F": "111100110100100", "G": "011100101101011", "H": "101101111101101", "I": "111010010010111", "J": "001001001101010",
    "K": "101101110101101", "L": "100100100100111", "M": "101111111101101", "N": "110101101101101", "O": "010101101101010",
    "P": "110101110100100", "Q": "010101101110011", "R": "110101110101101", "S": "011100010001110", "T": "111010010010010",
    "U": "101101101101111", "V": "101101101101010", "W": "101101111111101", "X": "101101010101101", "Y": "101101010010010",
    "Z": "111001010100111", "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
    "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010", "8": "111101111101111",
    "9": "111101111001110", ".": "000000000000010", ",": "000000000010100", ":": "000010000010000", "-": "000000111000000",
    "/": "001001010100100", "$": "011110010011110", "'": "010010000000000", "%": "101001010100101", "&": "010101010101011",
    " ": "000000000000000", "!": "010010010000010", "+": "000010111010000", "°": "010101010000000", "é": "111100110100111",
    "É": "111100110100111", "È": "111100110100111", "Ê": "111100110100111", "À": "010101111101101", "Ç": "011100100011010",
    "Û": "101101101101111", "Ô": "010101101101010", "Â": "010101111101101", "Î": "111010010010111", "(": "010100100100010",
    ")": "010001001001010", "#": "101111101111101", "x": "000101010101000", "=": "000111000111000",
}


def tiny(d: ImageDraw.ImageDraw, x, y, s, fill, scale=1, spacing=1):
    s = s.upper()
    cx = x
    for ch in s:
        g = TINY.get(ch, TINY[" "])
        for i, b in enumerate(g):
            if b == "1":
                gx, gy = i % 3, i // 3
                d.rectangle([cx + gx * scale, y + gy * scale, cx + gx * scale + scale - 1, y + gy * scale + scale - 1], fill=fill)
        cx += (3 + spacing) * scale
    return cx - x


def tiny_w(s, scale=1, spacing=1):
    return len(s) * (3 + spacing) * scale - spacing * scale


def text(d, xy, s, f, size, fill, anchor="la"):
    d.fontmode = "1"
    d.text(xy, s, font=font(f, size), fill=fill, anchor=anchor)


def text_w(s, f, size):
    return font(f, size).getlength(s)


def fit(s, f, maxw, start, minsize=8):
    size = start
    while size > minsize and text_w(s, f, size) > maxw:
        size -= 1
    return size


# ---------------------------------------------------------------------------------------------- surfaces
def noise(w, h, cell, seed):
    r = rng(seed)
    gw, gh = max(2, w // cell + 2), max(2, h // cell + 2)
    g = r.random((gh, gw)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((gw * cell, gh * cell), Image.Resampling.BICUBIC)
    return np.asarray(im).astype(np.float32)[:h, :w] / 255.0


def aged(img: Image.Image, seed, amount=1.0, edge=0.25, stains=0.4, grain=0.12):
    """paper/painted-board ageing: grain, darker edges, foxing stains, faded blotches (no directional light)"""
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255
    h, w = a.shape[:2]
    n = noise(w, h, max(2, min(w, h) // 6), seed)
    g = rng(seed + 1).random((h, w)).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    e = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
    ed = np.clip(1 - e / max(3, min(w, h) * 0.12), 0, 1)
    shade = 1 - amount * (edge * ed + grain * (g - 0.5) + 0.12 * (n - 0.5))
    a = a * shade[..., None]
    st = noise(w, h, max(3, min(w, h) // 4), seed + 2)
    sm = np.clip((st - (1 - stains * 0.5)) * 6, 0, 1)[..., None] * amount
    a = a * (1 - 0.3 * sm) + np.array([0.55, 0.42, 0.22]) * 0.3 * sm
    # faded (sun-bleached) toward a warm light tone in blotches
    fd = np.clip((n - 0.6) * 3, 0, 1)[..., None] * 0.25 * amount
    a = a * (1 - fd) + np.array([0.85, 0.80, 0.68]) * fd
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))


def posterize(img: Image.Image, k=24):
    return img.convert("RGB").quantize(colors=k, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")


def scratches(img: Image.Image, seed, n=30, col=(200, 190, 170), alpha=0.6):
    d = ImageDraw.Draw(img)
    r = rng(seed)
    w, h = img.size
    for _ in range(n):
        x, y = r.integers(0, w), r.integers(0, h)
        L = r.integers(2, max(3, w // 6))
        a = r.random() * math.pi
        d.line([x, y, x + math.cos(a) * L, y + math.sin(a) * L], fill=col, width=1)
    return img


def rust_spots(img: Image.Image, seed, amount=0.5):
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255
    h, w = a.shape[:2]
    n = noise(w, h, 3, seed) * 0.6 + noise(w, h, 9, seed + 1) * 0.4
    m = np.clip((n - (1 - amount * 0.35)) * 8, 0, 1)[..., None]
    rust = np.array([0.45, 0.22, 0.10]) * (0.7 + 0.5 * noise(w, h, 2, seed + 2))[..., None]
    a = a * (1 - m) + rust * m
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))


def fill_noise(w, h, base, var, seed, cell=3):
    n = noise(w, h, cell, seed) * 0.6 + rng(seed + 9).random((h, w)) * 0.4
    a = np.array(base, np.float32)[None, None] / 255 * (1 + var * (n[..., None] - 0.5) * 2)
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))


# ---------------------------------------------------------------------------------------------- atlas packing
class Atlas:
    def __init__(self, name, size):
        self.name, self.size = name, size
        self.img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        self.rects: dict[str, list[int]] = {}
        self.x = self.y = self.row = 0

    def put(self, key, im: Image.Image, pad=2):
        w, h = im.size
        if self.x + w + pad > self.size:
            self.x = 0; self.y += self.row + pad; self.row = 0
        if self.y + h > self.size:
            raise RuntimeError(f"{self.name}: out of space at {key}")
        self.img.paste(im.convert("RGBA"), (self.x, self.y))
        # bleed edges by 1 px (mip safety)
        e = im.convert("RGBA")
        for dx, dy, box in ((-1, 0, (0, 0, 1, h)), (w, 0, (w - 1, 0, w, h)), (0, -1, (0, 0, w, 1)), (0, h, (0, h - 1, w, h))):
            px, py = self.x + dx, self.y + dy
            if 0 <= px < self.size and 0 <= py < self.size:
                self.img.paste(e.crop(box), (px, py))
        self.rects[key] = [self.x, self.y, w, h]
        self.x += w + pad
        self.row = max(self.row, h)

    def save(self):
        self.img.save(os.path.join(OUT, f"{self.name}.png"), optimize=True)


CREAM = (226, 212, 176)
PAPER = (222, 210, 182)
INK = (38, 30, 26)
RED = (156, 34, 26)
DRED = (104, 22, 18)
GREEN = (44, 74, 48)
NAVY = (34, 44, 74)
GOLD = (196, 150, 52)
BROWN = (92, 58, 32)


# ============================================================================================== signs
def store_sign():
    # false-front sign board: 3.6 x 0.9 m at 128 px/m (painted on boards, big)
    W, H = 460, 116
    im = Image.new("RGB", (W, H), (214, 200, 162))
    d = ImageDraw.Draw(im)
    # board seams
    for y in range(0, H, 29):
        d.line([0, y, W, y], fill=(120, 108, 86))
    d.rectangle([3, 3, W - 4, H - 4], outline=DRED, width=3)
    d.rectangle([9, 9, W - 10, H - 10], outline=DRED, width=1)
    s = "PRUNEAU'S"
    text(d, (W // 2, 14), s, "cal", 30, DRED, "ma")
    s2 = "GENERAL STORE"
    sz = fit(s2, "serif", W - 60, 26)
    text(d, (W // 2, 48), s2, "serif", sz, INK, "ma")
    s3 = "~ MAGASIN GÉNÉRAL ~  EST. 1931"
    text(d, (W // 2, 82), s3, "cali", 17, DRED, "ma")
    im = aged(im, 11, amount=1.1, edge=0.15, stains=0.6, grain=0.2)
    im = peel(im, 12, 0.35)
    return posterize(im, 28)


def peel(im: Image.Image, seed, amount):
    """paint flaking off to grey wood"""
    a = np.asarray(im.convert("RGB")).astype(np.float32) / 255
    h, w = a.shape[:2]
    n = noise(w, h, 4, seed) * 0.5 + noise(w, h, 12, seed + 1) * 0.5
    m = np.clip((n - (1 - amount * 0.5)) * 10, 0, 1)[..., None]
    wood = np.array([0.42, 0.40, 0.36]) * (0.8 + 0.4 * noise(w, h, 2, seed + 2))[..., None]
    a = a * (1 - m) + wood * m
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))


def fire_danger():
    # roadside fire danger rating sign (1.2 x 0.8 m at 160 px/m): bilingual, a dial with a pointer
    W, H = 192, 128
    im = Image.new("RGB", (W, H), (30, 74, 50))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, W - 3, H - 3], outline=(220, 206, 160), width=2)
    text(d, (W // 2, 6), "FIRE DANGER TODAY", "sans", 12, (236, 222, 178), "ma")
    text(d, (W // 2, 21), "DANGER D'INCENDIE AUJOURD'HUI", "sans", 9, (236, 222, 178), "ma")
    cx, cy, r = W // 2, 118, 78
    cols = [(54, 120, 60), (40, 92, 160), (220, 180, 40), (210, 110, 30), (180, 30, 26)]
    labels = [("BAS", "LOW"), ("MODÉRÉ", "MOD."), ("ÉLEVÉ", "HIGH"), ("TRÈS", "V.HIGH"), ("EXTRÊME", "EXTREME")]
    for i, c in enumerate(cols):
        a0 = 180 + i * 36; a1 = a0 + 36
        d.pieslice([cx - r, cy - r, cx + r, cy + r], a0, a1, fill=c, outline=(20, 20, 20))
    d.pieslice([cx - 22, cy - 22, cx + 22, cy + 22], 180, 360, fill=(30, 74, 50))
    for i, (fr, en) in enumerate(labels):
        a = math.radians(180 + i * 36 + 18)
        tx, ty = cx + math.cos(a) * r * 0.66, cy + math.sin(a) * r * 0.66
        tiny(d, int(tx - tiny_w(en) / 2), int(ty - 2), en, (250, 246, 230))
    # pointer at HIGH
    a = math.radians(180 + 2.5 * 36)
    d.line([cx, cy, cx + math.cos(a) * (r - 6), cy + math.sin(a) * (r - 6)], fill=(20, 20, 20), width=4)
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(20, 20, 20))
    im = aged(im, 21, amount=0.8, edge=0.2)
    im = rust_spots(im, 22, 0.25)
    return posterize(im, 28)


def open_sign():
    W, H = 72, 30
    im = Image.new("RGB", (W, H), (230, 220, 190))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, W - 2, H - 2], outline=RED, width=2)
    text(d, (W // 2, 3), "OUVERT", "serif", 11, RED, "ma")
    text(d, (W // 2, 16), "OPEN", "serif", 10, INK, "ma")
    return posterize(aged(im, 31, 0.7), 12)


def coffee_poster():
    W, H = 116, 154  # 0.45 x 0.6 m
    im = Image.new("RGB", (W, H), (226, 196, 120))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 30], fill=(60, 36, 22))
    text(d, (W // 2, 3), "CAFÉ", "cal", 14, (236, 200, 110), "ma")
    text(d, (W // 2, 16), "BÛCHERON", "serif", 11, (236, 200, 110), "ma")
    # a coffee pot steaming over a little fire, axe floating in the cup
    d.polygon([(38, 120), (78, 120), (72, 70), (44, 70)], fill=(40, 70, 120), outline=(20, 30, 60))
    d.polygon([(44, 70), (72, 70), (66, 60), (50, 60)], fill=(30, 54, 100))
    d.rectangle([54, 54, 62, 60], fill=(20, 30, 60))
    d.line([(78, 82), (92, 80), (92, 104), (78, 106)], fill=(20, 30, 60), width=3)
    d.line([(40, 78), (30, 66)], fill=(20, 30, 60), width=4)
    for k in range(3):
        x0 = 50 + k * 6
        d.line([(x0, 52), (x0 - 3, 44), (x0 + 1, 38), (x0 - 2, 30 + 2)], fill=(250, 240, 220), width=1)
    for k in range(5):
        d.polygon([(46 + k * 6, 132), (49 + k * 6, 122), (52 + k * 6, 132)], fill=(230, 110, 30))
    d.rectangle([34, 132, 82, 136], fill=(90, 50, 24))
    text(d, (W // 2, 138), "Strong enough to float an axe", "sansr", 8, (40, 26, 18), "ma") if False else None
    tiny(d, (W - tiny_w("STRONG ENOUGH TO")) // 2, 139, "STRONG ENOUGH TO", (40, 26, 18))
    tiny(d, (W - tiny_w("FLOAT AN AXE.")) // 2, 145, "FLOAT AN AXE.", (40, 26, 18))
    tiny(d, (W - tiny_w("LUMBERJACK ROAST")) // 2, 33, "LUMBERJACK ROAST", (60, 36, 22))
    tiny(d, (W - tiny_w("TORRÉFACTION FORTE")) // 2, 39, "TORREFACTION FORTE", (60, 36, 22))
    return posterize(aged(im, 41, 1.0, stains=0.6), 24)


def beer_sign():
    W, H = 128, 90  # 0.5 x 0.35 m tin sign
    im = Image.new("RGB", (W, H), (30, 30, 34))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([2, 2, W - 3, H - 3], 8, outline=GOLD, width=2)
    # stump emblem
    d.ellipse([12, 22, 44, 34], fill=(200, 160, 90), outline=(90, 60, 30))
    d.rectangle([12, 28, 44, 58], fill=(110, 70, 36))
    d.ellipse([12, 52, 44, 64], fill=(110, 70, 36))
    for k in range(3):
        d.ellipse([20 + k * 2, 25 + k, 36 - k * 2, 31 - k], outline=(150, 110, 60))
    d.line([(26, 22), (34, 8)], fill=(150, 150, 150), width=3)
    d.polygon([(30, 6), (40, 2), (42, 12)], fill=(180, 180, 190))
    text(d, (88, 8), "OLD STUMP", "serif", fit("OLD STUMP", "serif", 70, 13), GOLD, "ma")
    text(d, (88, 26), "LAGER", "cal", 22, (230, 220, 200), "ma")
    tiny(d, 52, 56, "BIERE BLONDE", (200, 190, 160))
    tiny(d, 52, 64, "BREWED AT THE END", (160, 150, 120))
    tiny(d, 52, 70, "OF THE DIRT ROAD", (160, 150, 120))
    im = rust_spots(aged(im, 51, 0.6), 52, 0.5)
    return posterize(scratches(im, 53, 40, (120, 110, 90)), 24)


def chainsaw_poster():
    W, H = 116, 154
    im = Image.new("RGB", (W, H), (214, 200, 160))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 34], fill=(60, 84, 50))
    text(d, (W // 2, 2), "CARCAJOU", "serif", 16, (236, 220, 170), "ma")
    tiny(d, (W - tiny_w("CHAIN SAWS - SCIES A CHAINE")) // 2, 24, "CHAIN SAWS - SCIES A CHAINE", (236, 220, 170))
    # wolverine head silhouette biting a log
    d.ellipse([28, 50, 84, 96], fill=(70, 46, 30))
    d.polygon([(30, 62), (22, 46), (40, 54)], fill=(70, 46, 30))
    d.polygon([(82, 62), (92, 46), (74, 54)], fill=(70, 46, 30))
    d.rectangle([40, 70, 72, 80], fill=(200, 180, 140))
    d.ellipse([38, 62, 48, 70], fill=(240, 220, 120)); d.ellipse([64, 62, 74, 70], fill=(240, 220, 120))
    for k in range(6):
        d.polygon([(42 + k * 5, 80), (44 + k * 5, 86), (46 + k * 5, 80)], fill=(250, 250, 240))
    d.rectangle([12, 98, 104, 112], fill=(120, 80, 40), outline=(60, 40, 20))
    d.ellipse([98, 98, 110, 112], fill=(200, 160, 100), outline=(60, 40, 20))
    tiny(d, (W - tiny_w("THEY BITE LIKE A WOLVERINE")) // 2, 120, "THEY BITE LIKE A WOLVERINE", INK)
    tiny(d, (W - tiny_w("MORDENT COMME UN CARCAJOU")) // 2, 127, "MORDENT COMME UN CARCAJOU", INK)
    text(d, (W // 2, 135), "MODEL 64", "sans", 10, RED, "ma")
    return posterize(aged(im, 61, 1.0, stains=0.5), 24)


def price_board(prices):
    # chalkboard: we buy / on achète, with the game's real prices (passed in)
    W, H = 204, 154  # 0.8 x 0.6 m
    im = Image.new("RGB", (W, H), (38, 44, 40))
    d = ImageDraw.Draw(im)
    a = np.asarray(im).astype(np.float32)
    n = noise(W, H, 8, 71)[..., None]
    im = Image.fromarray(np.clip(a * (0.85 + 0.35 * n), 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    chalk = (226, 226, 214)
    text(d, (W // 2, 4), "WE BUY · ON ACHÈTE", "sans", 12, chalk, "ma")
    d.line([(14, 20), (W - 14, 20)], fill=(200, 200, 190))
    y = 26
    for fr, en, p in prices:
        tiny(d, 10, y, f"{en} / {fr}", chalk)
        tiny(d, W - 10 - tiny_w(p), y, p, (240, 220, 120))
        y += 10
    d.rectangle([0, 0, W - 1, H - 1], outline=(110, 80, 50), width=4)
    return posterize(im, 16)


def dog_poster():
    W, H = 72, 96  # 0.22 x 0.3
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    tiny(d, (W - tiny_w("HAVE YOU SEEN")) // 2, 3, "HAVE YOU SEEN", INK)
    tiny(d, (W - tiny_w("THIS DOG?")) // 2, 9, "THIS DOG?", INK)
    # pencil sketch of a strange dog with a long flat axe-handle head
    d.line([(14, 52), (24, 44), (48, 44), (56, 52)], fill=(70, 66, 60))
    d.line([(16, 52), (16, 64)], fill=(70, 66, 60)); d.line([(24, 52), (22, 64)], fill=(70, 66, 60))
    d.line([(46, 52), (48, 64)], fill=(70, 66, 60)); d.line([(54, 52), (56, 64)], fill=(70, 66, 60))
    d.line([(48, 44), (64, 30)], fill=(70, 66, 60), width=2)
    d.line([(64, 30), (66, 26)], fill=(70, 66, 60), width=3)
    d.line([(14, 52), (6, 46)], fill=(70, 66, 60))
    d.point([(62, 30)], fill=(10, 10, 10))
    tiny(d, (W - tiny_w("AVEZ-VOUS VU")) // 2, 70, "AVEZ-VOUS VU", INK)
    tiny(d, (W - tiny_w("CE CHIEN?")) // 2, 76, "CE CHIEN?", INK)
    tiny(d, (W - tiny_w("LIKES JERKY")) // 2, 84, "LIKES JERKY", RED)
    return posterize(aged(im, 81, 1.1, stains=0.8), 12)


def small_signs():
    out = {}
    W, H = 104, 38
    im = Image.new("RGB", (W, H), (180, 40, 30))
    d = ImageDraw.Draw(im)
    text(d, (W // 2, 3), "PAS DE CRÉDIT", "sans", 11, (240, 230, 210), "ma")
    tiny(d, (W - tiny_w("NO CREDIT. NOT EVEN")) // 2, 18, "NO CREDIT. NOT EVEN", (240, 230, 210))
    tiny(d, (W - tiny_w("FOR BIGFOOT.")) // 2, 25, "FOR BIGFOOT.", (240, 230, 210))
    out["sign_credit"] = posterize(rust_spots(aged(im, 91, 0.7), 92, 0.3), 12)
    W, H = 104, 52
    im = Image.new("RGB", (W, H), (236, 226, 196))
    d = ImageDraw.Draw(im)
    text(d, (W // 2, 2), "APPÂTS", "cal", 18, (40, 90, 140), "ma")
    text(d, (W // 2, 22), "BAIT", "cal", 14, INK, "ma")
    tiny(d, (W - tiny_w("VERS VIVANTS - LIVE WORMS")) // 2, 40, "VERS VIVANTS - LIVE WORMS", INK)
    out["sign_bait"] = posterize(aged(im, 93, 0.9), 12)
    W, H = 52, 72
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    tiny(d, 4, 4, "HEURES", INK); tiny(d, 4, 10, "HOURS", INK)
    for i, s in enumerate(["LUN-SAM 7-19", "MON-SAT", "DIM. FERME", "SUN CLOSED", "", "RING BELL", "SONNEZ"]):
        tiny(d, 4, 20 + i * 7, s, INK if i != 5 and i != 6 else RED)
    out["sign_hours"] = posterize(aged(im, 94, 1.0), 10)
    W, H = 204, 30
    im = Image.new("RGB", (W, H), (120, 84, 50))
    d = ImageDraw.Draw(im)
    text(d, (W // 2, 2), "BABILLARD · JOB BOARD", "serif", 12, (236, 222, 180), "ma")
    tiny(d, (W - tiny_w("CONTRATS - CONTRACTS - ASK INSIDE")) // 2, 20, "CONTRATS - CONTRACTS - ASK INSIDE", (236, 222, 180))
    out["sign_board"] = posterize(aged(im, 95, 0.8), 16)
    W, H = 104, 40
    im = Image.new("RGB", (W, H), (236, 226, 196))
    d = ImageDraw.Draw(im)
    text(d, (W // 2, 2), "BOIS DE CHAUFFAGE", "sans", 9, DRED, "ma")
    text(d, (W // 2, 14), "FIREWOOD", "sans", 11, INK, "ma")
    tiny(d, (W - tiny_w("DROP LOGS AT THE DECK")) // 2, 30, "DROP LOGS AT THE DECK", INK)
    out["sign_logs"] = posterize(aged(im, 96, 0.9), 12)
    return out


def notices():
    out = {}
    lines = [
        ["LOST: GREY CAT", "ANSWERS TO", "'BOUDIN'", "CALL 2 LONG", "1 SHORT"],
        ["BINGO", "SALLE DU", "CURE JEUDI", "19H", "$$$"],
        ["CHIENS DE", "TRAINEAU", "A VENDRE", "SLED DOGS", "ASK LUCIEN"],
        ["DO NOT FEED", "THE BEARS", "OR THE", "OTHER", "THINGS"],
    ]
    for i, ls in enumerate(lines):
        W, H = 46, 56
        im = Image.new("RGB", (W, H), [(226, 214, 184), (214, 220, 200), (232, 220, 170), (220, 210, 196)][i])
        d = ImageDraw.Draw(im)
        for k, s in enumerate(ls):
            tiny(d, 3, 4 + k * 8, s, INK if k else RED)
        out[f"notice_{i}"] = posterize(aged(im, 100 + i, 1.0, stains=0.7), 10)
    return out


def thermometer_face():
    # 0.17 x 0.78 m enamel sign at ~370 px/m: 64 x 288. Scale: -40 C at y=233 .. +50 C at y=33 (see dressing.ts)
    W, H = 64, 288
    im = Image.new("RGB", (W, H), (230, 222, 196))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 26], fill=RED)
    text(d, (W // 2, 2), "PRUNEAU", "serif", 10, (240, 230, 200), "ma")
    tiny(d, (W - tiny_w("QUINCAILLERIE")) // 2, 16, "QUINCAILLERIE", (240, 230, 200))
    d.rectangle([0, H - 30, W - 1, H - 1], fill=RED)
    tiny(d, (W - tiny_w("HARDWARE")) // 2, H - 27, "HARDWARE", (240, 230, 200))
    tiny(d, (W - tiny_w("FEED - BAIT")) // 2, H - 20, "FEED - BAIT", (240, 230, 200))
    tiny(d, (W - tiny_w("ROUTE 117")) // 2, H - 12, "ROUTE 117", (240, 230, 200))
    y40, y50 = 233, 33
    cx = W // 2
    for c in range(-40, 51, 2):
        y = round(y40 + (c + 40) / 90 * (y50 - y40))
        L = 6 if c % 10 == 0 else 3
        d.line([(cx - 4 - L, y), (cx - 4, y)], fill=INK)
        if c % 10 == 0:
            s = str(c)
            tiny(d, cx - 6 - L - tiny_w(s), y - 2, s, INK)
            f = round(c * 9 / 5 + 32)
            tiny(d, cx + 6 + L, y - 2, str(f), INK)
        if c % 4 == 0:
            d.line([(cx + 4, y), (cx + 4 + (5 if c % 20 == 0 else 2), y)], fill=INK)
    tiny(d, 4, 30, "°C", INK); tiny(d, W - 12, 30, "°F", INK)
    d.line([(cx, y50 - 4), (cx, y40 + 8)], fill=(170, 160, 140))
    # zones painted beside the tube
    tiny(d, 3, round(y40 + (0 + 40) / 90 * (y50 - y40)) + 3, "GEL", (40, 70, 140))
    im = aged(im, 111, 0.6, edge=0.1, stains=0.3)
    im = rust_spots(im, 112, 0.2)
    return posterize(im, 16)


def calendar():
    W, H = 120, 184  # 0.3 x 0.46 m
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    # picture: lake at dusk with a loon and spruce silhouettes
    sky = [(240, 170, 90), (200, 110, 90), (90, 70, 100)]
    for y in range(4, 70):
        t = (y - 4) / 66
        c = tuple(int(sky[0][i] * (1 - t) + sky[2][i] * t) for i in range(3)) if t > 0.5 else tuple(int(sky[1][i] * t * 2 + sky[0][i] * (1 - t * 2)) for i in range(3))
        d.line([(6, y), (W - 7, y)], fill=c)
    d.rectangle([6, 54, W - 7, 82], fill=(46, 56, 80))
    for k in range(12):
        x = 6 + k * 10
        h = 12 + (k * 7) % 10
        d.polygon([(x, 56), (x + 5, 56 - h), (x + 10, 56)], fill=(24, 30, 26))
    d.ellipse([50, 66, 70, 72], fill=(20, 20, 24))
    d.line([(68, 68), (72, 62)], fill=(20, 20, 24), width=2)
    d.point([(72, 61)], fill=(200, 30, 30))
    for k in range(4):
        d.line([(44 - k * 6, 74 + k * 2), (76 + k * 6, 74 + k * 2)], fill=(80, 90, 120))
    d.rectangle([6, 4, W - 7, 82], outline=(60, 50, 40))
    text(d, (W // 2, 86), "OCTOBRE · OCTOBER", "sans", 9, DRED, "ma")
    tiny(d, (W - tiny_w("QUINCAILLERIE PRUNEAU")) // 2, 98, "QUINCAILLERIE PRUNEAU", INK)
    days = "DLMMJVS"
    for i, c in enumerate(days):
        tiny(d, 9 + i * 15, 108, c, RED if i == 0 else INK)
    day = 1
    start = 3
    for row in range(5):
        for col in range(7):
            k = row * 7 + col
            if k < start or day > 31:
                continue
            x, y = 7 + col * 15, 116 + row * 12
            tiny(d, x, y, str(day), INK)
            d.rectangle([x - 2, y - 2, x + 12, y + 8], outline=(190, 176, 150))
            if day < 14:  # days crossed off in pencil
                d.line([(x - 1, y - 1), (x + 10, y + 7)], fill=(90, 86, 80))
                d.line([(x + 10, y - 1), (x - 1, y + 7)], fill=(90, 86, 80))
            if day == 31:
                d.ellipse([x - 3, y - 3, x + 12, y + 9], outline=RED)
            day += 1
    tiny(d, 8, 176, "PLEINE LUNE: LE 31", (90, 86, 80))
    return posterize(aged(im, 121, 0.9, stains=0.5), 32)


def gas_pump():
    out = {}
    W, H = 64, 112  # pump face 0.3 x 0.55
    im = Image.new("RGB", (W, H), (176, 40, 30))
    d = ImageDraw.Draw(im)
    d.rectangle([6, 8, W - 7, 46], fill=(230, 222, 196), outline=(40, 30, 26))
    for i, s in enumerate(["0 0 1 4", "LITRES", "0 0 2 1", "$ CENTS"]):
        tiny(d, 10, 12 + i * 8, s, INK)
    text(d, (W // 2, 54), "BORÉAL", "serif", 11, (240, 230, 200), "ma")
    tiny(d, (W - tiny_w("ESSENCE")) // 2, 70, "ESSENCE", (240, 230, 200))
    tiny(d, (W - tiny_w("GASOLINE")) // 2, 77, "GASOLINE", (240, 230, 200))
    d.ellipse([22, 86, 42, 106], outline=(240, 230, 200), width=2)
    d.polygon([(32, 89), (38, 100), (26, 100)], fill=(240, 230, 200))
    im = rust_spots(aged(im, 131, 0.7), 132, 0.6)
    out["pump_face"] = posterize(scratches(im, 133, 30, (210, 190, 170)), 20)
    W, H = 96, 40  # globe band
    im = Image.new("RGB", (W, H), (236, 230, 210))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 8], fill=(176, 40, 30)); d.rectangle([0, H - 9, W - 1, H - 1], fill=(176, 40, 30))
    text(d, (W // 2, 11), "BORÉAL", "serif", 14, (176, 40, 30), "ma")
    out["pump_globe"] = posterize(aged(im, 134, 0.5), 10)
    return out


def scale_dial():
    W = H = 64
    im = Image.new("RGB", (W, H), (230, 226, 210))
    d = ImageDraw.Draw(im)
    d.ellipse([1, 1, W - 2, H - 2], fill=(236, 232, 214), outline=(60, 50, 40), width=2)
    cx = cy = W // 2
    for k in range(0, 21):
        a = math.radians(-220 + k * 13)
        r0 = 26 if k % 5 == 0 else 28
        d.line([(cx + math.cos(a) * r0, cy + math.sin(a) * r0), (cx + math.cos(a) * 30, cy + math.sin(a) * 30)], fill=INK)
    for k, s in ((0, "0"), (5, "5"), (10, "10"), (15, "15"), (20, "20")):
        a = math.radians(-220 + k * 13)
        tiny(d, int(cx + math.cos(a) * 19 - tiny_w(s) / 2), int(cy + math.sin(a) * 19 - 2), s, INK)
    tiny(d, cx - tiny_w("LB") // 2, cy + 10, "LB", RED)
    tiny(d, cx - tiny_w("PRUNEAU") // 2, cy - 14, "PRUNEAU", INK)
    return posterize(aged(im, 141, 0.6), 10)


def misc_store():
    out = {}
    # a hand-lettered "WE BUY MUSHROOMS" card for the scale
    W, H = 64, 40
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    tiny(d, 3, 3, "CHAMPIGNONS", DRED)
    tiny(d, 3, 10, "SAUVAGES", DRED)
    tiny(d, 3, 19, "WILD MUSHROOMS", INK)
    tiny(d, 3, 27, "WEIGHED HERE", INK)
    out["sign_mushroom"] = posterize(aged(im, 151, 1.0), 10)
    # jerky jar label
    W, H = 64, 30
    im = Image.new("RGB", (W, H), (236, 226, 196))
    d = ImageDraw.Draw(im)
    text(d, (W // 2, 1), "JERKY", "serif", 11, DRED, "ma")
    tiny(d, (W - tiny_w("CHARQUI 6$")) // 2, 18, "CHARQUI 6$", INK)
    out["jar_jerky"] = posterize(aged(im, 152, 0.6), 10)
    return out


# ============================================================================================== labels (512 px/m)
def can_wrap(w, h, bg, seed):
    im = fill_noise(w, h, bg, 0.06, seed, 2)
    return im


def label_beer():
    # stubby: label band around 0.062 m diameter -> 100 px around x 36 px; front centred at u=0.5
    W, H = 100, 36
    im = Image.new("RGB", (W, H), (226, 206, 150))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 3], fill=DRED); d.rectangle([0, H - 4, W - 1, H - 1], fill=DRED)
    cx = W // 2
    # stump emblem
    d.ellipse([cx - 8, 6, cx + 8, 11], fill=(200, 160, 90), outline=(90, 60, 30))
    d.rectangle([cx - 8, 9, cx + 8, 16], fill=(110, 70, 36))
    tiny(d, cx - tiny_w("OLD STUMP") // 2, 18, "OLD STUMP", INK)
    tiny(d, cx - tiny_w("LAGER") // 2, 25, "LAGER", DRED)
    tiny(d, 4, 10, "BIERE", BROWN); tiny(d, 4, 16, "BLONDE", BROWN); tiny(d, 4, 24, "5%", BROWN)
    tiny(d, W - 26, 10, "341ML", BROWN); tiny(d, W - 26, 16, "DEPOT", BROWN); tiny(d, W - 26, 22, "10C", BROWN)
    return posterize(aged(im, 201, 0.5, edge=0.05), 14)


def label_coffee():
    W, H = 160, 66  # d 0.1 m tin, 0.13 tall
    im = Image.new("RGB", (W, H), (40, 30, 26))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 6, W - 1, H - 7], fill=(160, 40, 28))
    cx = W // 2
    d.ellipse([cx - 22, 10, cx + 22, 54], fill=(236, 216, 160), outline=(40, 30, 26), width=2)
    # crossed axes over a pot
    d.line([(cx - 14, 46), (cx + 12, 16)], fill=(90, 60, 30), width=2)
    d.line([(cx + 14, 46), (cx - 12, 16)], fill=(90, 60, 30), width=2)
    d.polygon([(cx + 10, 14), (cx + 18, 18), (cx + 12, 22)], fill=(120, 120, 130))
    d.polygon([(cx - 10, 14), (cx - 18, 18), (cx - 12, 22)], fill=(120, 120, 130))
    d.polygon([(cx - 7, 44), (cx + 7, 44), (cx + 5, 32), (cx - 5, 32)], fill=(40, 70, 120))
    text(d, (cx - 40, 18), "CAFÉ", "cal", 12, (236, 216, 160), "ma")
    text(d, (cx + 42, 18), "COFFEE", "sans", 10, (236, 216, 160), "ma")
    tiny(d, cx - 70, 36, "BUCHERON", (236, 216, 160))
    tiny(d, cx + 26, 36, "LUMBERJACK", (236, 216, 160))
    tiny(d, cx + 30, 43, "ROAST", (236, 216, 160))
    tiny(d, cx - 70, 43, "MOULU FIN", (236, 216, 160))
    tiny(d, 4, 2, "454 G - 1 LB", (200, 180, 140))
    return posterize(rust_spots(aged(im, 211, 0.4, edge=0.05), 212, 0.2), 18)


def label_beans():
    W, H = 120, 56  # d 0.075 x 0.11
    im = Image.new("RGB", (W, H), (230, 214, 168))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 9], fill=(60, 90, 50)); d.rectangle([0, H - 10, W - 1, H - 1], fill=(60, 90, 50))
    cx = W // 2
    # a bowl of beans with a maple leaf
    d.ellipse([cx - 14, 22, cx + 14, 40], fill=(150, 70, 30), outline=(80, 40, 20))
    for k in range(8):
        d.ellipse([cx - 11 + k * 3, 25 + (k % 3), cx - 8 + k * 3, 28 + (k % 3)], fill=(190, 100, 50))
    d.polygon([(cx + 10, 14), (cx + 14, 20), (cx + 20, 18), (cx + 16, 24), (cx + 18, 28), (cx + 12, 26), (cx + 10, 30), (cx + 8, 26), (cx + 2, 28), (cx + 4, 24), (cx, 18), (cx + 6, 20)], fill=(190, 40, 30))
    tiny(d, cx - tiny_w("FEVES AU LARD") // 2, 2, "FEVES AU LARD", (236, 226, 196))
    tiny(d, cx - tiny_w("TANTE RITA") // 2, 44, "TANTE RITA", (236, 226, 196))
    tiny(d, 4, 14, "AUNT", DRED); tiny(d, 4, 20, "RITA'S", DRED); tiny(d, 4, 28, "MAPLE", INK); tiny(d, 4, 34, "BEANS", INK)
    tiny(d, W - 28, 16, "398ML", INK); tiny(d, W - 28, 24, "SIROP", INK); tiny(d, W - 28, 30, "D'ERABLE", INK)
    return posterize(aged(im, 221, 0.4, edge=0.05), 16)


def label_syrup():
    # rectangular syrup tin 0.13 x 0.17 front panel: sugar shack in the snow
    W, H = 66, 88
    im = Image.new("RGB", (W, H), (236, 228, 204))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 18], fill=(150, 30, 26))
    text(d, (W // 2, 2), "SIROP", "serif", 10, (240, 230, 200), "ma")
    d.rectangle([4, 22, W - 5, 56], fill=(170, 200, 220))
    d.polygon([(4, 56), (W - 5, 56), (W - 5, 46), (4, 50)], fill=(240, 244, 248))
    d.rectangle([20, 38, 46, 52], fill=(120, 70, 40))
    d.polygon([(16, 40), (33, 28), (50, 40)], fill=(80, 40, 30))
    d.rectangle([30, 44, 35, 52], fill=(50, 30, 20))
    for k in range(3):
        d.line([(28 + k * 2, 28), (26 + k * 3, 22)], fill=(240, 240, 240))
    for x in (8, 54):
        d.polygon([(x, 50), (x + 4, 34), (x + 8, 50)], fill=(30, 60, 40))
    tiny(d, (W - tiny_w("D'ERABLE PUR")) // 2, 60, "D'ERABLE PUR", INK)
    tiny(d, (W - tiny_w("PURE MAPLE")) // 2, 67, "PURE MAPLE", INK)
    tiny(d, (W - tiny_w("CABANE LAPOINTE")) // 2, 75, "CABANE LAPOINTE", DRED)
    tiny(d, (W - tiny_w("540 ML")) // 2, 82, "540 ML", INK)
    return posterize(rust_spots(aged(im, 231, 0.5), 232, 0.15), 18)


def label_cookies():
    W, H = 320, 41  # d 0.2 wrap x 0.08
    im = Image.new("RGB", (W, H), (36, 56, 96))
    d = ImageDraw.Draw(im)
    for x in range(0, W, 16):
        d.rectangle([x, 0, x + 7, 4], fill=(200, 170, 80)); d.rectangle([x + 8, H - 5, x + 15, H - 1], fill=(200, 170, 80))
    for rep in range(2):
        ox = rep * 160
        text(d, (ox + 80, 8), "BISCUITS", "cali", 12, (236, 216, 160), "ma")
        tiny(d, ox + 80 - tiny_w("A L'AVOINE - OATMEAL") // 2, 24, "A L'AVOINE - OATMEAL", (236, 216, 160))
        tiny(d, ox + 80 - tiny_w("MME PRUNEAU") // 2, 31, "MME PRUNEAU", (200, 170, 80))
        for k in range(3):
            d.ellipse([ox + 14 + k * 4, 12 + k * 3, ox + 30 + k * 4, 26 + k * 3], fill=(180, 130, 70), outline=(120, 80, 40))
    return posterize(rust_spots(aged(im, 241, 0.3, edge=0.03), 242, 0.2), 16)


def lid_cookies():
    W = H = 102
    im = Image.new("RGB", (W, H), (36, 56, 96))
    d = ImageDraw.Draw(im)
    d.ellipse([4, 4, W - 5, H - 5], outline=(200, 170, 80), width=3)
    d.ellipse([18, 18, W - 19, H - 19], fill=(230, 214, 168))
    # a little cabin in the woods on the lid
    d.rectangle([36, 50, 66, 66], fill=(120, 80, 50))
    d.polygon([(32, 52), (51, 38), (70, 52)], fill=(80, 60, 50))
    d.rectangle([47, 56, 53, 66], fill=(240, 200, 100))
    for x in (24, 70):
        d.polygon([(x, 68), (x + 5, 46), (x + 10, 68)], fill=(40, 70, 50))
    tiny(d, (W - tiny_w("MME PRUNEAU")) // 2, 72, "MME PRUNEAU", DRED)
    return posterize(aged(im, 243, 0.4, edge=0.05), 16)


def label_jerky():
    W, H = 62, 92  # bag 0.12 x 0.18
    im = Image.new("RGB", (W, H), (120, 40, 26))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 6], fill=(200, 190, 170))
    text(d, (W // 2, 9), "LE BŒUF", "serif", 10, (240, 220, 170), "ma")
    text(d, (W // 2, 21), "TÊTU", "cal", 14, (240, 220, 170), "ma")
    # a stubborn ox head
    cx = W // 2
    d.ellipse([cx - 11, 40, cx + 11, 62], fill=(90, 56, 36), outline=(40, 20, 10))
    d.polygon([(cx - 11, 44), (cx - 20, 36), (cx - 9, 40)], fill=(236, 226, 196))
    d.polygon([(cx + 11, 44), (cx + 20, 36), (cx + 9, 40)], fill=(236, 226, 196))
    d.ellipse([cx - 6, 54, cx + 6, 62], fill=(160, 110, 90))
    d.point([(cx - 4, 48), (cx + 4, 48)], fill=(255, 255, 255))
    tiny(d, (W - tiny_w("STUBBORN BEEF")) // 2, 66, "STUBBORN BEEF", (240, 220, 170))
    tiny(d, (W - tiny_w("JERKY POIVRE")) // 2, 73, "JERKY POIVRE", (240, 220, 170))
    tiny(d, (W - tiny_w("PEPPERED 80G")) // 2, 80, "PEPPERED 80G", (200, 190, 170))
    # window showing jerky
    return posterize(aged(im, 251, 0.3, edge=0.05), 16)


def label_matches():
    out = {}
    W, H = 56, 34  # top 0.11 x 0.065
    im = Image.new("RGB", (W, H), (226, 196, 60))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, W - 2, H - 2], outline=(30, 30, 30))
    # will-o'-the-wisp: a blue-green flame over a bog
    d.polygon([(10, 26), (14, 12), (18, 26)], fill=(80, 200, 190))
    d.polygon([(12, 26), (14, 18), (16, 26)], fill=(220, 250, 240))
    tiny(d, 22, 5, "FEU", (30, 30, 30)); tiny(d, 22, 11, "FOLLET", RED)
    tiny(d, 22, 19, "STRIKE", (30, 30, 30)); tiny(d, 22, 25, "ANYWHERE", (30, 30, 30))
    out["matches_top"] = posterize(aged(im, 261, 0.4), 10)
    W, H = 56, 15
    im = Image.new("RGB", (W, H), (110, 70, 50))
    a = np.asarray(im).astype(np.float32)
    n = rng(262).random((H, W))[..., None]
    im = Image.fromarray(np.clip(a * (0.7 + 0.6 * n), 0, 255).astype(np.uint8))
    out["matches_striker"] = posterize(im, 6)
    return out


def label_batteries():
    W, H = 56, 32  # D cell 0.034 dia -> 55 around x 0.061
    im = Image.new("RGB", (W, H), (30, 30, 34))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 9], fill=(220, 150, 30))
    tiny(d, 3, 2, "VOLTIGEUR", (30, 30, 34))
    tiny(d, 3, 14, "D  1.5V", (220, 150, 30))
    tiny(d, 3, 22, "+ HEAVY DUTY", (200, 200, 200))
    d.polygon([(44, 14), (50, 14), (46, 20), (52, 20), (42, 30), (45, 22), (40, 22)], fill=(220, 150, 30))
    return posterize(aged(im, 271, 0.3, edge=0.03), 10)


def label_eggs():
    W, H = 78, 52  # carton lid 0.15 x 0.1
    im = fill_noise(W, H, (176, 170, 156), 0.15, 281, 2)
    d = ImageDraw.Draw(im)
    d.rectangle([8, 8, W - 9, H - 9], fill=(232, 224, 200))
    tiny(d, (W - tiny_w("OEUFS FRAIS")) // 2, 12, "OEUFS FRAIS", (150, 40, 30))
    tiny(d, (W - tiny_w("FRESH EGGS")) // 2, 19, "FRESH EGGS", INK)
    tiny(d, (W - tiny_w("POULES DE")) // 2, 28, "POULES DE", INK)
    tiny(d, (W - tiny_w("PRUNEAU")) // 2, 35, "PRUNEAU", INK)
    return posterize(im, 12)


def surfaces():
    """tileable-ish swatches used as product surfaces (each ~64-128 px)"""
    out = {}
    out["tin"] = posterize(rust_spots(fill_noise(64, 64, (170, 172, 168), 0.12, 301, 2), 302, 0.15), 10)
    out["tin_gold"] = posterize(fill_noise(64, 64, (190, 160, 90), 0.12, 303, 2), 8)
    out["cardboard"] = posterize(fill_noise(64, 64, (166, 128, 86), 0.18, 304, 2), 10)
    out["kraft"] = posterize(fill_noise(64, 64, (176, 142, 100), 0.2, 305, 3), 10)
    out["butcher"] = posterize(fill_noise(64, 64, (214, 196, 182), 0.12, 306, 3), 10)
    out["pulp"] = posterize(fill_noise(64, 64, (176, 170, 156), 0.2, 307, 2), 10)
    out["plastic_olive"] = posterize(fill_noise(64, 64, (86, 104, 62), 0.08, 308, 4), 8)
    out["plastic_cream"] = posterize(fill_noise(64, 64, (214, 204, 170), 0.06, 309, 4), 8)
    out["plastic_black"] = posterize(fill_noise(64, 64, (32, 32, 32), 0.2, 310, 2), 8)
    out["steel"] = posterize(fill_noise(64, 64, (130, 134, 138), 0.15, 311, 1), 10)
    out["chain"] = chain_tex()
    out["glass_brown"] = posterize(fill_noise(64, 64, (70, 38, 16), 0.15, 312, 3), 8)
    out["glass_clear"] = posterize(fill_noise(64, 64, (180, 196, 190), 0.08, 313, 3), 8)
    out["wax"] = posterize(fill_noise(64, 64, (220, 210, 170), 0.08, 314, 3), 8)
    out["meat"] = meat_tex()
    out["bannock"] = bannock_tex()
    out["egg"] = posterize(fill_noise(32, 32, (230, 210, 180), 0.1, 315, 2), 6)
    out["chanterelle"] = chanterelle_tex()
    out["blueberry"] = blueberry_tex()
    out["birchbark"] = birch_tex()
    out["trout"] = trout_tex()
    out["fatwood"] = posterize(fill_noise(64, 64, (150, 90, 40), 0.3, 316, 1), 10)
    out["twine"] = posterize(fill_noise(32, 32, (190, 160, 110), 0.2, 317, 1), 6)
    out["canvas_green"] = posterize(fill_noise(64, 64, (82, 92, 60), 0.15, 318, 1), 10)
    out["wool_red"] = posterize(fill_noise(64, 64, (130, 30, 26), 0.18, 319, 1), 10)
    out["paper_label"] = posterize(fill_noise(32, 32, (222, 210, 182), 0.08, 320, 3), 6)
    out["book_spines"] = book_spines()
    out["soap"] = soap_tex()
    out["leather_patch"] = leather_patch()
    out["jar_label"] = jar_label()
    out["flour_label"] = flour_label()
    out["rope_band"] = band_label("MANILLE 15M", "MANILA ROPE", (200, 170, 100))
    out["fatwood_band"] = band_label("BOIS GRAS", "FATWOOD", (140, 50, 30))
    out["chainsaw_decal"] = chainsaw_decal()
    out["bag_tag"] = band_label("SAC PORTAGE", "-20 C", (60, 84, 50))
    return out


def chain_tex():
    W, H = 32, 8
    im = Image.new("RGB", (W, H), (40, 40, 42))
    d = ImageDraw.Draw(im)
    for x in range(0, W, 8):
        d.rectangle([x + 1, 1, x + 6, 6], outline=(150, 150, 150))
        d.point([(x + 3, 0), (x + 4, 0)], fill=(200, 200, 200))
    return im


def meat_tex():
    W, H = 64, 64
    a = np.zeros((H, W, 3), np.float32)
    n = noise(W, H, 6, 330)
    yy = np.mgrid[0:H, 0:W][0]
    fat = (np.sin(yy * 0.5 + n * 6) > 0.6)
    a[:] = np.array([0.72, 0.36, 0.32]) * (0.85 + 0.3 * n[..., None])
    a[fat] = np.array([0.92, 0.82, 0.74])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def bannock_tex():
    W, H = 64, 64
    n = noise(W, H, 5, 331) * 0.6 + rng(332).random((H, W)) * 0.4
    a = np.array([0.74, 0.52, 0.28])[None, None] * (0.75 + 0.5 * n[..., None])
    a[n > 0.8] = np.array([0.88, 0.76, 0.52])
    a[n < 0.2] = np.array([0.46, 0.28, 0.14])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 10)


def chanterelle_tex():
    W, H = 64, 32  # top half: cap (orange-gold), bottom half: gills (ridges)
    im = Image.new("RGB", (W, H))
    a = np.zeros((H, W, 3), np.float32)
    n = noise(W, H, 4, 333)
    a[:16] = np.array([0.92, 0.62, 0.18]) * (0.85 + 0.3 * n[:16, :, None])
    xx = np.mgrid[0:16, 0:W][1]
    a[16:] = np.array([0.95, 0.72, 0.32]) * (0.8 + 0.25 * (np.sin(xx * 1.6) > 0)[..., None])
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return posterize(im, 8)


def blueberry_tex():
    W = H = 32
    im = Image.new("RGB", (W, H), (40, 50, 90))
    d = ImageDraw.Draw(im)
    r = rng(334)
    for _ in range(40):
        x, y = r.integers(0, W), r.integers(0, H)
        c = [(60, 80, 140), (90, 110, 170), (30, 36, 70)][r.integers(0, 3)]
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=c)
        d.point([(x, y)], fill=(150, 160, 200))
    return posterize(im, 8)


def birch_tex():
    W, H = 64, 64
    a = np.ones((H, W, 3), np.float32) * np.array([0.88, 0.85, 0.78])
    n = noise(W, H, 6, 335)
    a *= (0.88 + 0.2 * n[..., None])
    r = rng(336)
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    for _ in range(14):  # lenticels: short dark horizontal dashes
        x, y = r.integers(0, W), r.integers(0, H)
        L = r.integers(3, 10)
        d.line([(x, y), (x + L, y)], fill=(50, 44, 40))
    for _ in range(4):
        x, y = r.integers(0, W), r.integers(0, H)
        d.rectangle([x, y, x + r.integers(4, 10), y + r.integers(2, 5)], fill=(120, 100, 80))
    return posterize(im, 10)


def trout_tex():
    # side view of a lake trout, 0.5 m long at 512 px/m: 256 x 64. Mapped by planar projection from the side.
    W, H = 256, 64
    im = Image.new("RGB", (W, H), (60, 70, 66))
    d = ImageDraw.Draw(im)
    a = np.zeros((H, W, 3), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = yy / H
    back = np.array([0.20, 0.26, 0.24]); side = np.array([0.52, 0.56, 0.50]); belly = np.array([0.90, 0.86, 0.76])
    c = np.where(t[..., None] < 0.5, back * (1 - t[..., None] * 2) + side * t[..., None] * 2, side * (2 - t[..., None] * 2) + belly * (t[..., None] * 2 - 1))
    n = noise(W, H, 6, 337)
    c *= (0.9 + 0.2 * n[..., None])
    im = Image.fromarray(np.clip(c * 255, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    r = rng(338)
    for _ in range(90):  # pale vermiculated spots on the back and sides
        x, y = r.integers(20, W - 30), r.integers(4, int(H * 0.55))
        d.point([(x, y), (x + 1, y)], fill=(176, 186, 164))
    # lateral line, gill plate, eye
    d.line([(36, 30), (W - 40, 32)], fill=(150, 160, 150))
    d.arc([18, 14, 46, 50], 300, 60, fill=(40, 40, 36), width=2)
    d.ellipse([16, 22, 24, 30], fill=(220, 200, 120)); d.point([(20, 26)], fill=(10, 10, 10))
    d.line([(4, 36), (14, 38)], fill=(40, 30, 30))
    # fins (pinkish with white edges) drawn where the geometry fins map
    d.polygon([(W - 34, 16), (W - 2, 4), (W - 10, 32), (W - 2, 60), (W - 34, 46)], fill=(70, 80, 76))
    d.polygon([(90, 52), (110, 63), (120, 54)], fill=(190, 120, 90))
    d.line([(90, 52), (110, 63)], fill=(240, 240, 230))
    return posterize(im, 18)


def book_spines():
    W, H = 64, 48
    im = Image.new("RGB", (W, H), (60, 40, 30))
    d = ImageDraw.Draw(im)
    cols = [(110, 40, 30), (40, 60, 40), (40, 50, 80), (120, 100, 60), (70, 50, 40), (90, 30, 40)]
    x = 0
    r = rng(339)
    while x < W:
        w = int(r.integers(6, 12))
        c = cols[int(r.integers(0, len(cols)))]
        d.rectangle([x, 0, x + w - 1, H - 1], fill=c)
        d.line([(x, 6), (x + w - 2, 6)], fill=GOLD); d.line([(x, H - 7), (x + w - 2, H - 7)], fill=GOLD)
        for k in range(3):
            d.point([(x + w // 2, 14 + k * 4)], fill=(200, 180, 120))
        x += w
    return posterize(aged(im, 340, 0.5), 16)


def soap_tex():
    W, H = 48, 32
    im = Image.new("RGB", (W, H), (200, 220, 200))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 2, W - 3, H - 3], outline=(40, 90, 60))
    tiny(d, 6, 6, "SAVON", (40, 90, 60)); tiny(d, 6, 13, "DU CAMP", (40, 90, 60)); tiny(d, 6, 21, "PINE TAR", INK)
    return posterize(aged(im, 341, 0.6), 8)


def leather_patch():
    W, H = 40, 24
    im = Image.new("RGB", (W, H), (120, 76, 44))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, W - 2, H - 2], outline=(70, 40, 20))
    tiny(d, 4, 5, "PORTAGE", (60, 34, 18)); tiny(d, 4, 13, "PACK CO.", (60, 34, 18))
    return posterize(aged(im, 342, 0.4), 8)


def jar_label():
    W, H = 64, 24
    im = Image.new("RGB", (W, H), (232, 222, 196))
    d = ImageDraw.Draw(im)
    tiny(d, 3, 3, "CONFITURE", (60, 50, 110)); tiny(d, 3, 10, "BLEUETS", (60, 50, 110)); tiny(d, 3, 17, "AOUT", INK)
    return posterize(aged(im, 343, 0.6), 8)


def flour_label():
    W, H = 64, 24
    im = Image.new("RGB", (W, H), (232, 222, 196))
    d = ImageDraw.Draw(im)
    tiny(d, 3, 3, "FARINE", INK); tiny(d, 3, 10, "FLOUR", INK); tiny(d, 3, 17, "SUCRE?", RED)
    return posterize(aged(im, 344, 0.6), 8)


def band_label(a, b, col):
    W, H = 64, 20
    im = Image.new("RGB", (W, H), (226, 214, 184))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 2], fill=col); d.rectangle([0, H - 3, W - 1, H - 1], fill=col)
    tiny(d, (W - tiny_w(a)) // 2, 5, a, INK)
    tiny(d, (W - tiny_w(b)) // 2, 11, b, col)
    return posterize(aged(im, 345 + len(a), 0.5), 8)


def chainsaw_decal():
    W, H = 104, 32
    im = Image.new("RGB", (W, H), (86, 104, 62))
    d = ImageDraw.Draw(im)
    text(d, (W // 2, 1), "CARCAJOU", "serif", 13, (236, 222, 180), "ma")
    tiny(d, (W - tiny_w("64 - SCIE A CHAINE")) // 2, 19, "64 - SCIE A CHAINE", (236, 222, 180))
    d.line([(4, 28), (W - 5, 28)], fill=(236, 222, 180))
    return posterize(scratches(aged(im, 350, 0.4), 351, 20, (140, 150, 120)), 12)


def label_bacon():
    W, H = 40, 26
    im = Image.new("RGB", (W, H), (236, 230, 214))
    d = ImageDraw.Draw(im)
    tiny(d, 3, 3, "BACON", RED); tiny(d, 3, 10, "DE DOS", INK); tiny(d, 3, 17, "9.00$", INK)
    return posterize(aged(im, 361, 0.6), 8)


def label_bannock():
    W, H = 40, 26
    im = Image.new("RGB", (W, H), (236, 230, 214))
    d = ImageDraw.Draw(im)
    tiny(d, 3, 3, "BANNOCK", DRED); tiny(d, 3, 10, "FAIT CE", INK); tiny(d, 3, 17, "MATIN", INK)
    return posterize(aged(im, 362, 0.6), 8)


def label_kindling():
    return band_label("PETIT BOIS", "KINDLING", (120, 80, 40))


def main():
    os.makedirs(OUT, exist_ok=True)
    from items_prices import PRICES  # noqa
    signs = Atlas("signs", 1024)
    signs.put("store_sign", store_sign())
    signs.put("fire_danger", fire_danger())
    signs.put("price_board", price_board(PRICES))
    signs.put("coffee_poster", coffee_poster())
    signs.put("chainsaw_poster", chainsaw_poster())
    signs.put("beer_sign", beer_sign())
    signs.put("thermometer", thermometer_face())
    signs.put("calendar", calendar())
    signs.put("dog_poster", dog_poster())
    signs.put("open_sign", open_sign())
    for k, v in {**small_signs(), **notices(), **gas_pump(), **misc_store()}.items():
        signs.put(k, v)
    signs.put("scale_dial", scale_dial())
    signs.save()
    labels = Atlas("labels", 1024)
    labels.put("beer", label_beer())
    labels.put("coffee", label_coffee())
    labels.put("beans", label_beans())
    labels.put("syrup", label_syrup())
    labels.put("cookies", label_cookies())
    labels.put("cookies_lid", lid_cookies())
    labels.put("jerky", label_jerky())
    labels.put("batteries", label_batteries())
    labels.put("eggs", label_eggs())
    labels.put("bacon", label_bacon())
    labels.put("bannock", label_bannock())
    labels.put("kindling", label_kindling())
    for k, v in {**label_matches(), **surfaces()}.items():
        labels.put(k, v)
    labels.save()
    with open(TS, "w") as f:
        f.write("// generated by src/places/tools/make_print.py: pixel rectangles [x, y, w, h] in the 1024x1024 atlases\n")
        f.write("// public/assets/textures/places/signs.png and labels.png. Do not edit by hand.\n")
        f.write(f"export const SIGN_RECTS: Record<string, [number, number, number, number]> = {json.dumps(signs.rects)};\n")
        f.write(f"export const LABEL_RECTS: Record<string, [number, number, number, number]> = {json.dumps(labels.rects)};\n")
        f.write("export const ATLAS_SIZE = 1024;\n")
    print("signs:", len(signs.rects), "labels:", len(labels.rects))


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    main()
