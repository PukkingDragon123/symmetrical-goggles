#!/usr/bin/env python3
"""BUSHED places, round 5: the printed and painted matter that makes Pruneau's, the forge, the campground and the
old Kettle camp look lived in. Two atlases next to the round-1 ones (made by ../tools/make_print.py, whose helpers
this script borrows):

  store_print.png  (1024x1024 RGBA)  signs, flyers, window decals, lure cards, scratch tickets, candy wrappers,
                                     post-office paper, price tags, cardboard displays, old camp paper
  store_grime.png  (512x512 RGBA)    soft decals: contact shadows, floor wear, mud, tyre ruts, puddles, drips,
                                     soot, dust, moss, leaf litter, glow halos

and src/places/store/print_rects.ts with the pixel rectangles. Every brand, slogan, name and drawing is invented.
Text is pixel text (antialiasing off): TTF fonts at >= 10 px, the 3x5 font below that.

    cd games/bushed && python3 src/places/store/make_store_print.py
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
import make_print as mp  # noqa: E402

GAME = mp.GAME
OUT = mp.OUT
TS = os.path.join(HERE, "print_rects.ts")
FD = os.path.join(GAME, "public", "assets", "fonts")
mp.FONTS.update({
    "hand": os.path.join(FD, "PatrickHand.ttf"), "cav": os.path.join(FD, "Caveat.ttf"), "type": os.path.join(FD, "SpecialElite.ttf"),
    "fell": os.path.join(FD, "IMFellEnglish.ttf"), "alag": os.path.join(FD, "Alagard.ttf"),
})
text, tiny, tiny_w, fit, aged, posterize, peel, rust_spots, scratches, noise = (
    mp.text, mp.tiny, mp.tiny_w, mp.fit, mp.aged, mp.posterize, mp.peel, mp.rust_spots, mp.scratches, mp.noise)
rng = np.random.default_rng

INK, RED, DRED, GREEN, NAVY, GOLD, PAPER, CREAM = mp.INK, mp.RED, mp.DRED, mp.GREEN, mp.NAVY, mp.GOLD, mp.PAPER, mp.CREAM
BLUE = (40, 84, 150)
PENCIL = (78, 76, 74)
BALL = (34, 46, 120)   # ballpoint blue
MARKER = (24, 22, 26)


_warn = []
_mp_tiny, _mp_text = mp.tiny, mp.text


def tiny(d, x, y, s, fill, scale=1, spacing=1):
    W = d.im.size[0]
    if s and (x < 0 or x + tiny_w(s, scale, spacing) > W):
        _warn.append(f"tiny overflow {s!r} x={x} w={tiny_w(s, scale, spacing)} W={W}")
    return _mp_tiny(d, x, y, s, fill, scale, spacing)


def ctext(d, cx, y, s, f, size, fill, maxw=None):
    W = d.im.size[0]
    lim = maxw or (W - 4)
    size = fit(s, f, lim, size, 8)
    if mp.text_w(s, f, size) > lim:
        _warn.append(f"text overflow {s!r} {mp.text_w(s, f, size):.0f} > {lim}")
    text(d, (cx, y), s, f, size, fill, "ma")


def ctiny(d, w, y, s, fill, scale=1):
    tiny(d, (w - tiny_w(s, scale)) // 2, y, s, fill, scale)


def rgba(im):
    return im.convert("RGBA")


def torn(im: Image.Image, seed, top=True, bottom=False, sides=False, depth=3):
    """ragged paper edges (alpha cut)"""
    im = im.convert("RGBA")
    a = np.asarray(im).copy()
    h, w = a.shape[:2]
    r = rng(seed)
    if top or bottom:
        for x in range(w):
            if top:
                a[: r.integers(0, depth), x, 3] = 0
            if bottom:
                k = r.integers(0, depth)
                if k:
                    a[h - k:, x, 3] = 0
    if sides:
        for y in range(h):
            a[y, : r.integers(0, 2), 3] = 0
            k = r.integers(0, 2)
            if k:
                a[y, w - k:, 3] = 0
    return Image.fromarray(a)


def tabs(d, w, h, n, s, fill=INK, bg=PAPER, seed=0):
    """tear-off phone tabs along the bottom (some already torn off)"""
    r = rng(seed)
    tw = w // n
    y0 = h - 22
    d.line([(0, y0), (w, y0)], fill=(150, 140, 120))
    for i in range(n):
        x = i * tw
        if r.random() < 0.35:
            d.rectangle([x + 1, y0 + 1, x + tw - 2, h - 1], fill=(0, 0, 0, 0))
            continue
        d.line([(x, y0), (x, h)], fill=(160, 150, 130))
        for k, ch in enumerate(s[:6]):
            tiny(d, x + tw // 2 - 1, y0 + 2 + k * 3 if False else y0 + 2, "", fill)
        # vertical tiny text: draw rotated later; here a few dashes stand in for a phone number
        for k in range(4):
            d.line([(x + tw // 2 - 1, y0 + 3 + k * 4), (x + tw // 2 - 1, y0 + 5 + k * 4)], fill=fill)
            d.line([(x + tw // 2 + 1, y0 + 4 + k * 4), (x + tw // 2 + 1, y0 + 5 + k * 4)], fill=fill)


def flyer(w, h, bg, seed, draw, age=1.0, k=16, tear=None, tabn=0):
    im = Image.new("RGBA", (w, h), bg + (255,))
    d = ImageDraw.Draw(im)
    draw(d, w, h)
    if tabn:
        tabs(d, w, h, tabn, "", BALL, bg, seed)
    alpha = np.asarray(im)[..., 3].copy()
    rgb = posterize(aged(im.convert("RGB"), seed, age, stains=0.6), k)
    out = rgb.convert("RGBA")
    a = np.asarray(out).copy()
    a[..., 3] = alpha
    out = Image.fromarray(a)
    if tear:
        out = torn(out, seed + 7, **tear)
    return out


def staple(d, x, y):
    d.line([(x, y), (x + 3, y)], fill=(200, 200, 205))
    d.point([(x, y + 1), (x + 3, y + 1)], fill=(120, 120, 126))


# ============================================================================================== exterior signs
def ff_sign():
    """the false-front sign: 5.6 x 1.15 m of boards, hand painted (114 px/m)"""
    W, H = 640, 132
    im = Image.new("RGB", (W, H), (222, 208, 170))
    d = ImageDraw.Draw(im)
    for y in range(0, H, 33):
        d.line([(0, y), (W, y)], fill=(104, 92, 72))
        d.line([(0, y + 1), (W, y + 1)], fill=(176, 162, 128))
    d.rectangle([4, 4, W - 5, H - 5], outline=DRED, width=4)
    d.rectangle([12, 12, W - 13, H - 13], outline=(30, 64, 44), width=2)
    # big name with a painted drop shadow
    s = "PRUNEAU"
    sz = 46
    for dx, dy, c in ((4, 4, (40, 30, 24)), (0, 0, DRED)):
        ctext(d, W // 2 + dx, 20 + dy, s, "serif", sz, c, 300)
    # the two lines either side of the name, a banner under
    ctext(d, 98, 26, "MAGASIN", "cal", 22, (30, 64, 44))
    ctext(d, 98, 50, "GÉNÉRAL", "cal", 22, (30, 64, 44))
    ctext(d, W - 98, 26, "GENERAL", "cal", 22, (30, 64, 44))
    ctext(d, W - 98, 50, "STORE", "cal", 22, (30, 64, 44))
    d.polygon([(170, 92), (470, 92), (480, 104), (470, 116), (170, 116), (160, 104)], fill=(30, 64, 44))
    ctext(d, W // 2, 95, "BAIT · GAS · POST OFFICE · EST. 1931", "sans", 13, (232, 222, 190))
    # painted motifs: a pike leaping (left), a spruce and moon (right)
    fish = [(28, 98), (46, 86), (74, 82), (96, 88), (104, 80), (106, 96), (96, 94), (74, 102), (48, 104)]
    d.polygon(fish, fill=(80, 110, 70), outline=(30, 40, 30))
    for x in range(52, 92, 8):
        d.ellipse([x, 90, x + 4, 94], fill=(190, 200, 120))
    d.point([(40, 92)], fill=(10, 10, 10))
    d.ellipse([W - 70, 74, W - 50, 94], fill=(236, 220, 150))
    for k in range(3):
        x = W - 104 + k * 22
        d.polygon([(x, 118), (x + 10, 80 - k * 4), (x + 20, 118)], fill=(30, 64, 44))
    im = aged(im, 511, amount=1.1, edge=0.18, stains=0.7, grain=0.2)
    im = peel(im, 512, 0.42)
    return posterize(scratches(im, 513, 26, (190, 180, 150)), 30)


def fascia():
    """long painted fascia board over the porch: 7.6 x 0.32 m (100 px/m)"""
    W, H = 760, 32
    im = Image.new("RGB", (W, H), (30, 64, 44))
    d = ImageDraw.Draw(im)
    items = ["VERS · WORMS", "GLACE · ICE", "PROPANE", "PERMIS · LICENCES", "POSTE · MAIL"]
    x = 14
    for i, s in enumerate(items):
        sz = 15
        wv = mp.text_w(s, "sans", sz)
        text(d, (x, 7), s, "sans", sz, (236, 222, 182))
        x += wv + 16
        if i < len(items) - 1:
            d.polygon([(x - 10, 16), (x - 6, 11), (x - 2, 16), (x - 6, 21)], fill=(196, 150, 52))
    d.rectangle([1, 1, W - 2, H - 2], outline=(196, 150, 52))
    im = aged(im, 521, 1.0, edge=0.15, stains=0.5)
    return posterize(peel(im, 522, 0.3), 16)


def ghost_cola():
    """faded ad painted on the side siding (alpha: the siding shows through) 3.2 x 1.6 m at 80 px/m"""
    W, H = 256, 128
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([4, 6, W - 5, H - 7], fill=(212, 196, 150, 255))
    d.rectangle([4, 6, W - 5, H - 7], outline=(140, 40, 30, 255), width=3)
    ctext(d, W // 2, 12, "BUVEZ · DRINK", "sans", 14, (40, 50, 40, 255))
    ctext(d, W // 2, 30, "CARIBOU", "serif", 34, (150, 36, 26, 255))
    ctext(d, W // 2, 68, "C O L A", "serif", 20, (150, 36, 26, 255))
    d.ellipse([20, 70, 60, 110], outline=(40, 50, 40, 255), width=3)
    ctext(d, 40, 80, "5¢", "sans", 16, (40, 50, 40, 255))
    ctiny(d, W, 100, "LE GOUT DU NORD - THE TASTE OF THE NORTH", (40, 50, 40, 255))
    a = np.asarray(im).astype(np.float32)
    n = noise(W, H, 6, 531) * 0.6 + noise(W, H, 2, 532) * 0.4
    # weathered almost away: patchy, strongest in the middle, siding streaks
    stripes = (np.arange(H)[:, None] % 11 < 2).astype(np.float32) * 0.5
    keep = np.clip((n - 0.38) * 2.4, 0, 1) * (1 - stripes) * 0.62
    a[..., 3] *= keep
    a[..., :3] = a[..., :3] * 0.9 + 20
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def bait_card():
    W, H = 96, 72  # 0.42 x 0.32 hand-lettered cardboard
    def dr(d, w, h):
        ctext(d, w // 2, 2, "VERS", "hand", 26, (170, 30, 24))
        ctext(d, w // 2, 26, "WORMS", "hand", 20, MARKER)
        d.line([(10, 48), (86, 48)], fill=MARKER)
        tiny(d, 6, 52, "CRAWLERS 4.50", MARKER)
        tiny(d, 6, 59, "MENES-MINNOWS IN", MARKER)
        tiny(d, 6, 65, "SEE ODILE", (170, 30, 24))
    return flyer(W, H, (196, 160, 112), 541, dr, 0.9, 12, tear={"top": False, "sides": True})


def ice_door():
    W, H = 96, 112  # merchandiser door 0.9 x 1.05
    im = Image.new("RGB", (W, H), (226, 232, 236))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, H - 1], outline=(120, 130, 140), width=2)
    d.rectangle([6, 8, W - 7, 62], fill=(40, 96, 170))
    ctext(d, W // 2, 8, "ICE", "sans", 34, (240, 246, 255))
    ctext(d, W // 2, 44, "GLACE", "sans", 12, (240, 246, 255))
    # snowflake
    cx, cy = W // 2, 84
    for k in range(6):
        a = k * math.pi / 3
        d.line([(cx, cy), (cx + math.cos(a) * 14, cy + math.sin(a) * 14)], fill=(40, 96, 170), width=2)
        d.line([(cx + math.cos(a) * 9, cy + math.sin(a) * 9), (cx + math.cos(a + 0.5) * 13, cy + math.sin(a + 0.5) * 13)], fill=(40, 96, 170))
    ctiny(d, W, 102, "2.99 SAC - BAG", INK)
    im = aged(im, 551, 0.7, edge=0.3)
    return posterize(rust_spots(im, 552, 0.35), 16)


def propane_sign():
    W, H = 80, 44
    im = Image.new("RGB", (W, H), (190, 36, 28))
    d = ImageDraw.Draw(im)
    ctext(d, W // 2, 2, "PROPANE", "sans", 13, (250, 240, 220))
    ctiny(d, W, 20, "ECHANGE - EXCHANGE", (250, 240, 220))
    ctiny(d, W, 28, "20 LB  24.99", (250, 240, 220))
    ctiny(d, W, 36, "ASK INSIDE", (250, 230, 150))
    return posterize(rust_spots(aged(im, 561, 0.7), 562, 0.4), 12)


def firewood_sign():
    W, H = 96, 56
    def dr(d, w, h):
        ctext(d, w // 2, 1, "BOIS SEC", "hand", 18, (140, 30, 24))
        ctext(d, w // 2, 19, "FIREWOOD", "hand", 16, MARKER)
        ctext(d, w // 2, 36, "8$ / bundle", "hand", 13, MARKER)
    return flyer(W, H, (226, 214, 184), 571, dr, 1.0, 12)


def bundle_wrap():
    W, H = 64, 32  # the label on a shrink-wrapped bundle
    im = Image.new("RGB", (W, H), (236, 220, 120))
    d = ImageDraw.Draw(im)
    ctiny(d, W, 3, "FEU DE CAMP", (30, 60, 30))
    ctiny(d, W, 10, "CAMPFIRE WOOD", (30, 60, 30))
    d.rectangle([4, 18, W - 5, 27], fill=(30, 60, 30))
    ctiny(d, W, 20, "LOCAL WOOD", (236, 220, 120))
    return posterize(aged(im, 581, 0.5), 10)


def gas_price():
    W, H = 72, 60  # 0.6 x 0.5 sign on the pump island post
    im = Image.new("RGB", (W, H), (236, 230, 214))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 13], fill=(30, 64, 44))
    ctiny(d, W, 4, "ESSENCE - GAS", (236, 230, 214))
    for i, (lab, num) in enumerate([("REG", "1.89"), ("DSL", "1.97")]):
        y = 17 + i * 21
        tiny(d, 4, y + 6, lab, INK)
        x = 22
        for ch in num:
            if ch == ".":
                d.rectangle([x, y + 14, x + 1, y + 15], fill=INK); x += 4; continue
            d.rectangle([x, y, x + 9, y + 17], fill=(30, 30, 30))
            text(d, (x + 1, y + 1), ch, "mono", 15, (240, 236, 220))
            x += 11
        tiny(d, x + 1, y, "9", INK)
    return posterize(aged(im, 591, 0.8), 14)


def no_smoking():
    W, H = 64, 48
    im = Image.new("RGB", (W, H), (240, 236, 224))
    d = ImageDraw.Draw(im)
    d.ellipse([20, 2, 44, 26], outline=(190, 30, 24), width=3)
    d.rectangle([24, 13, 40, 16], fill=INK)
    d.line([(23, 23), (41, 5)], fill=(190, 30, 24), width=3)
    ctiny(d, W, 30, "DEFENSE DE FUMER", INK)
    ctiny(d, W, 37, "COUPEZ MOTEUR", INK)
    ctiny(d, W, 43, "STOP ENGINE", (190, 30, 24))
    return posterize(rust_spots(aged(im, 601, 0.6), 602, 0.3), 10)


def window_vinyl():
    """vinyl letters stuck inside the display windows (alpha), 1.6 x 0.24 m at 160 px/m"""
    out = {}
    W, H = 256, 40
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ctext(d, W // 2, 2, "PERMIS CHASSE & PÊCHE", "sans", 14, (236, 226, 196, 255))
    ctext(d, W // 2, 21, "HUNTING & FISHING LICENCES", "sans", 12, (236, 226, 196, 255))
    a = np.asarray(im).copy()
    n = noise(W, H, 2, 611)
    a[..., 3] = (a[..., 3] * (n > 0.2)).astype(np.uint8)  # bits of letters picked off
    out["vinyl_lic"] = Image.fromarray(a)
    W, H = 128, 40
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ctext(d, W // 2, 2, "COMPTANT", "sans", 13, (236, 200, 90, 255))
    ctext(d, W // 2, 20, "CASH ONLY", "sans", 13, (236, 200, 90, 255))
    out["vinyl_cash"] = im
    return out


def phone_plate():
    W, H = 48, 64  # instruction plate under the handset, 0.15 x 0.2
    im = Image.new("RGB", (W, H), (200, 202, 206))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 9], fill=(30, 50, 110))
    ctiny(d, W, 2, "TELEPHONE", (240, 240, 240))
    for i in range(12):
        x, y = 8 + (i % 3) * 12, 14 + (i // 3) * 11
        d.rectangle([x, y, x + 8, y + 7], fill=(60, 62, 66))
        tiny(d, x + 3, y + 1, "123456789*0#"[i], (230, 230, 230))
    tiny(d, 4, 58, "25C", INK)
    d.rectangle([30, 57, 42, 60], fill=(40, 40, 40))
    return posterize(scratches(aged(im, 621, 0.6), 622, 20, (230, 230, 230)), 12)


def phone_sign():
    W, H = 64, 20
    im = Image.new("RGB", (W, H), (30, 50, 110))
    d = ImageDraw.Draw(im)
    ctext(d, W // 2, 3, "TÉLÉPHONE", "sans", 10, (240, 240, 240))
    return posterize(rust_spots(aged(im, 631, 0.6), 632, 0.4), 8)


def mail_labels():
    out = {}
    W, H = 96, 24  # community mailbox gang header 1.0 x 0.25
    im = Image.new("RGB", (W, H), (176, 40, 30))
    d = ImageDraw.Draw(im)
    ctext(d, W // 2, 2, "POSTE · MAIL", "sans", 11, (240, 236, 220))
    ctiny(d, W, 16, "RR 2 - CHEMIN DU LAC", (240, 236, 220))
    out["mail_head"] = posterize(rust_spots(aged(im, 641, 0.6), 642, 0.4), 10)
    # name strips on the boxes (a sheet of 8 little labels, 24x8 each)
    names = ["LACHANCE", "GAGNON", "TREMBLAY", "BOUCHARD", "PELLETIER", "RAY", "LAKE CAMP", "VACANT"]
    im = Image.new("RGB", (8 * 26, 10), (226, 222, 210))
    d = ImageDraw.Draw(im)
    for i, s in enumerate(names):
        x = i * 26
        d.rectangle([x, 0, x + 25, 9], fill=(232, 228, 214) if i % 3 else (240, 220, 140), outline=(140, 130, 110))
        tiny(d, x + 2, 2, s[:6], INK if s != "RAY" else RED)
    out["mail_names"] = posterize(aged(im, 643, 0.5), 10)
    return out


# ============================================================================================== flyers (300 px/m)
def flyers():
    out = {}

    def lost_dog(d, w, h):
        ctext(d, w // 2, 1, "LOST DOG", "sans", 14, (190, 24, 20))
        ctiny(d, w, 17, "CHIEN PERDU", INK)
        # photocopied photo: a shaggy black-and-white dog
        d.rectangle([8, 24, w - 9, 58], fill=(150, 146, 140))
        d.ellipse([16, 36, 46, 54], fill=(30, 28, 26))
        d.ellipse([38, 28, 54, 44], fill=(30, 28, 26))
        d.ellipse([42, 34, 50, 42], fill=(220, 216, 206))
        d.polygon([(40, 30), (36, 22), (44, 28)], fill=(30, 28, 26))
        for x in (20, 26, 36, 42):
            d.line([(x, 52), (x, 57)], fill=(30, 28, 26), width=2)
        d.line([(16, 42), (10, 34)], fill=(30, 28, 26), width=2)
        tiny(d, 3, 61, "NAME: PATATE", INK)
        tiny(d, 3, 67, "HATES ROOSTERS", INK)
        tiny(d, 3, 73, "REWARD 100$", (190, 24, 20))

    out["fl_dog"] = flyer(64, 104, (238, 236, 228), 701, lost_dog, 0.9, 12, tabn=7)

    def moose(d, w, h):
        d.rectangle([0, 0, w, 16], fill=(30, 64, 44))
        ctiny(d, w, 2, "TIRAGE ORIGNAL", (240, 230, 190))
        ctiny(d, w, 9, "MOOSE DRAW 2026", (240, 230, 190))
        # moose head silhouette
        d.ellipse([22, 30, 42, 56], fill=(60, 40, 26))
        d.rectangle([26, 48, 38, 64], fill=(60, 40, 26))
        for sx in (-1, 1):
            cx = 32 + sx * 10
            d.polygon([(cx, 32), (cx + sx * 22, 20), (cx + sx * 24, 28), (cx + sx * 18, 24), (cx + sx * 20, 34), (cx + sx * 12, 30), (cx + sx * 8, 38)], fill=(110, 80, 50))
        tiny(d, 4, 68, "APPLY BY JUN 30", INK)
        tiny(d, 4, 74, "ZONE - WMU 29", INK)
        tiny(d, 4, 82, "ADULT BULL TAGS", INK)
        tiny(d, 4, 88, "ASK AT COUNTER", (170, 30, 24))

    out["fl_moose"] = flyer(64, 96, (230, 222, 196), 702, moose, 1.0, 14)

    def fishfry(d, w, h):
        ctext(d, w // 2, 0, "FISH FRY", "alag", 16, (30, 70, 140))
        ctiny(d, w, 16, "SOUPER POISSON", INK)
        # a fish on a plate, chips
        d.ellipse([10, 26, 54, 44], fill=(250, 250, 244), outline=(120, 120, 120))
        d.polygon([(18, 34), (34, 28), (44, 34), (34, 40)], fill=(210, 150, 60))
        d.polygon([(44, 34), (50, 29), (50, 39)], fill=(210, 150, 60))
        for x in range(20, 40, 4):
            d.line([(x, 41), (x + 3, 37)], fill=(236, 200, 90))
        tiny(d, 4, 50, "PICKEREL+CHIPS", INK)
        tiny(d, 4, 57, "SAT 5PM - 15$", INK)
        tiny(d, 4, 63, "COMMUNITY HALL", INK)
        tiny(d, 4, 69, "KIDS 8$", INK)
        tiny(d, 4, 77, "BYO PLATE!", (30, 70, 140))

    out["fl_fishfry"] = flyer(64, 88, (250, 236, 150), 703, fishfry, 1.0, 14)

    def sled(d, w, h):
        ctext(d, w // 2, 0, "FOR SALE", "sans", 12, (20, 20, 20))
        ctiny(d, w, 14, "A VENDRE", INK)
        # a snowmobile drawn in ballpoint
        d.polygon([(8, 44), (14, 36), (30, 34), (40, 28), (50, 30), (52, 38), (56, 44)], outline=BALL)
        d.line([(6, 48), (58, 48)], fill=BALL, width=2)
        d.line([(4, 46), (8, 48)], fill=BALL)
        d.line([(20, 34), (24, 26), (28, 26)], fill=BALL)
        for x in range(28, 54, 6):
            d.ellipse([x, 44, x + 4, 48], outline=BALL)
        tiny(d, 3, 54, "SNOWMOBILE 1997", BALL)
        tiny(d, 3, 60, "440 RUNS GOOD", BALL)
        tiny(d, 3, 66, "NEW BELT. 1800$", BALL)
        tiny(d, 3, 72, "OBO - ASK MARC", BALL)

    out["fl_sled"] = flyer(64, 100, (240, 240, 236), 704, sled, 0.8, 12, tabn=6)

    def bingo(d, w, h):
        ctext(d, w // 2, 0, "BINGO!", "alag", 18, (200, 30, 120))
        for i in range(5):
            for j in range(4):
                x, y = 8 + i * 10, 22 + j * 9
                d.rectangle([x, y, x + 8, y + 7], outline=INK)
                if (i * 3 + j) % 4 == 0:
                    d.ellipse([x + 1, y + 1, x + 7, y + 6], fill=(200, 30, 120))
        tiny(d, 4, 60, "JEUDI 19H", INK)
        tiny(d, 4, 66, "SALLE PAROISSE", INK)
        tiny(d, 4, 72, "GROS LOT 500$", (200, 30, 120))

    out["fl_bingo"] = flyer(64, 82, (250, 200, 220), 705, bingo, 1.1, 14)

    def guide(d, w, h):
        d.rectangle([0, 0, w, 18], fill=(40, 60, 40))
        ctext(d, w // 2, 2, "GUIDE", "serif", 12, (236, 220, 170))
        tiny(d, 3, 22, "WALLEYE - PIKE", INK)
        tiny(d, 3, 28, "LAKE TROUT", INK)
        tiny(d, 3, 36, "BOAT & BAIT", INK)
        tiny(d, 3, 42, "SHORE LUNCH", INK)
        tiny(d, 3, 50, "ASK FOR HOLLIS", (140, 30, 24))
        d.polygon([(10, 64), (40, 60), (54, 64), (40, 68)], fill=(110, 130, 80))

    out["fl_guide"] = flyer(60, 74, (226, 222, 204), 706, guide, 1.0, 12)

    def supper(d, w, h):
        ctext(d, w // 2, 2, "Bean Supper", "cav", 15, (110, 50, 20))
        ctext(d, w // 2, 18, "souper aux fèves", "cav", 12, INK)
        d.ellipse([20, 34, 44, 50], fill=(70, 50, 40))
        d.rectangle([22, 34, 42, 38], fill=(60, 40, 30))
        tiny(d, 4, 54, "ST-ANNE CHURCH", INK)
        tiny(d, 4, 60, "SUN AFTER MASS", INK)

    out["fl_supper"] = flyer(64, 70, (236, 228, 210), 707, supper, 1.2, 14)

    def cat(d, w, h):
        ctext(d, w // 2, 0, "FOUND CAT", "hand", 14, MARKER)
        d.ellipse([18, 22, 46, 44], fill=(200, 130, 50))
        d.ellipse([36, 16, 50, 30], fill=(200, 130, 50))
        d.polygon([(38, 18), (40, 10), (43, 17)], fill=(200, 130, 50))
        d.polygon([(45, 17), (48, 10), (50, 18)], fill=(200, 130, 50))
        d.line([(18, 36), (8, 26)], fill=(200, 130, 50), width=3)
        tiny(d, 3, 50, "ORANGE. FAT.", MARKER)
        tiny(d, 3, 56, "ON MY COUNTER.", MARKER)
        tiny(d, 3, 62, "IS SHE YOURS?", MARKER)
        tiny(d, 3, 70, "- ODILE", (150, 30, 24))

    out["fl_cat"] = flyer(64, 78, (246, 244, 236), 708, cat, 0.9, 12)

    def hunter(d, w, h):
        d.rectangle([0, 0, w, 14], fill=(230, 110, 20))
        ctiny(d, w, 4, "HUNTER SAFETY", INK)
        tiny(d, 3, 18, "COURS - COURSE", INK)
        tiny(d, 3, 25, "2 DAYS - GUNS", INK)
        tiny(d, 3, 31, "+ LICENCE EXAM", INK)
        tiny(d, 3, 39, "REGISTER WITH", INK)
        tiny(d, 3, 45, "MEGAN (RANGER)", (30, 60, 30))
        d.rectangle([20, 52, 40, 64], outline=(230, 110, 20), width=2)

    out["fl_hunter"] = flyer(60, 68, (236, 232, 220), 709, hunter, 0.9, 12)

    def puppies(d, w, h):
        ctext(d, w // 2, 0, "Puppies!", "cav", 16, (40, 90, 160))
        for k in range(3):
            x = 8 + k * 16
            d.ellipse([x, 22, x + 12, 34], fill=(150, 110, 70) if k != 1 else (40, 34, 30))
            d.ellipse([x + 2, 18, x + 10, 26], fill=(150, 110, 70) if k != 1 else (40, 34, 30))
        tiny(d, 3, 40, "LAB X HUSKY", INK)
        tiny(d, 3, 46, "READY OCT 1", INK)
        tiny(d, 3, 52, "200$ OR TRADE", INK)
        tiny(d, 3, 58, "FIREWOOD OK", (40, 90, 160))

    out["fl_puppies"] = flyer(56, 86, (244, 240, 230), 710, puppies, 1.0, 12, tabn=5)

    def mower(d, w, h):
        tiny(d, 3, 3, "SM. ENGINE", INK)
        tiny(d, 3, 9, "REPAIR", INK)
        tiny(d, 3, 17, "SAWS-SLEDS", INK)
        tiny(d, 3, 23, "OUTBOARDS", INK)
        tiny(d, 3, 31, "CHEZ GAGNON", (170, 30, 24))
        tiny(d, 3, 37, "RANG 4", INK)

    out["fl_mower"] = flyer(48, 46, (220, 236, 220), 711, mower, 1.0, 10)

    def card(d, w, h):
        d.rectangle([0, 0, w, 8], fill=(30, 64, 120))
        tiny(d, 2, 2, "SEPTIC", (240, 240, 240))
        tiny(d, 2, 11, "PUMPING", INK)
        tiny(d, 2, 17, "24H", (170, 30, 24))

    out["fl_card1"] = flyer(36, 22, (240, 240, 236), 712, card, 0.6, 8)

    def card2(d, w, h):
        tiny(d, 1, 2, "PLOMBER", (120, 20, 20))
        tiny(d, 2, 9, "TREMBLAY", INK)
        d.line([(2, 16), (33, 16)], fill=(120, 20, 20))

    out["fl_card2"] = flyer(36, 22, (236, 230, 206), 713, card2, 0.6, 8)

    def faded(d, w, h):
        ctext(d, w // 2, 2, "YARD SALE", "sans", 10, (120, 140, 200))
        for k in range(6):
            d.line([(6, 20 + k * 8), (w - 8 - (k * 7) % 14, 20 + k * 8)], fill=(170, 180, 210))

    out["fl_faded"] = flyer(56, 74, (232, 230, 220), 714, faded, 1.6, 10, tear={"top": True, "bottom": True, "depth": 9})

    def fire_ban(d, w, h):
        d.rectangle([0, 0, w, 16], fill=(200, 40, 20))
        ctiny(d, w, 5, "FIRE BAN LIFTED", (250, 240, 220))
        tiny(d, 3, 20, "INTERDICTION DE", INK)
        tiny(d, 3, 26, "FEUX LEVEE", INK)
        tiny(d, 3, 34, "BE CAREFUL", INK)
        tiny(d, 3, 42, "- MNR", (90, 90, 90))

    out["fl_fireban"] = flyer(64, 50, (236, 234, 226), 715, fire_ban, 0.8, 10)

    def ride(d, w, h):
        ctext(d, w // 2, 0, "need a ride", "cav", 13, BALL)
        ctext(d, w // 2, 13, "to Timmins", "cav", 13, BALL)
        tiny(d, 3, 32, "THURSDAY.", BALL)
        tiny(d, 3, 38, "WILL PAY GAS", BALL)
        tiny(d, 3, 44, "+ COOKIES", BALL)

    out["fl_ride"] = flyer(52, 54, (250, 246, 180), 716, ride, 0.7, 10)
    return out


# ============================================================================================== interior paper
def interior():
    out = {}

    def post_sign():
        W, H = 128, 34  # 0.75 x 0.2 enamel sign
        im = Image.new("RGB", (W, H), (176, 40, 30))
        d = ImageDraw.Draw(im)
        d.rectangle([2, 2, W - 3, H - 3], outline=(240, 236, 220), width=1)
        ctext(d, W // 2, 3, "BUREAU DE POSTE", "sans", 12, (240, 236, 220))
        ctext(d, W // 2, 18, "POST OFFICE", "sans", 11, (240, 236, 220))
        return posterize(rust_spots(aged(im, 801, 0.6), 802, 0.3), 10)
    out["post_sign"] = post_sign()

    def post_hours(d, w, h):
        tiny(d, 3, 3, "POSTE - MAIL", (170, 30, 24))
        for i, s in enumerate(["LUN-VEN 8-17", "SAM 9-12", "", "TIMBRES", "MONEY ORDERS", "PARCELS", "", "ASK ODILE"]):
            tiny(d, 3, 11 + i * 6, s, INK)
    out["post_hours"] = flyer(56, 62, (236, 230, 210), 803, post_hours, 0.9, 10)

    def letters():
        # 6 envelope faces 24x14 for cubbyholes and bundles
        im = Image.new("RGB", (6 * 26, 16), (0, 0, 0))
        d = ImageDraw.Draw(im)
        cols = [(240, 238, 230), (232, 224, 200), (210, 180, 120), (240, 238, 230), (220, 230, 240), (236, 226, 210)]
        for i, c in enumerate(cols):
            x = i * 26
            d.rectangle([x, 0, x + 24, 14], fill=c)
            if i == 4:
                for k in range(0, 26, 4):
                    d.line([(x + k, 0), (x + k + 2, 0)], fill=(190, 30, 30)); d.line([(x + k + 2, 14), (x + k + 4, 14)], fill=(30, 50, 150))
            d.rectangle([x + 18, 2, x + 22, 6], fill=(170, 40, 40) if i % 2 else (40, 90, 60))
            for k in range(3):
                d.line([(x + 6, 7 + k * 2), (x + 16 - k * 2, 7 + k * 2)], fill=(70, 70, 90))
        return posterize(aged(im, 804, 0.5), 16)
    out["letters"] = letters()

    def parcel():
        W, H = 40, 28
        im = Image.new("RGB", (W, H), (178, 140, 96))
        d = ImageDraw.Draw(im)
        d.line([(0, 14), (W, 14)], fill=(220, 200, 150), width=2)
        d.line([(20, 0), (20, H)], fill=(220, 200, 150), width=2)
        d.rectangle([4, 3, 17, 12], fill=(236, 232, 220))
        for k in range(3):
            d.line([(5, 5 + k * 2), (15, 5 + k * 2)], fill=INK)
        d.rectangle([30, 2, 37, 9], fill=(40, 90, 160))
        tiny(d, 23, 18, "FRAG", (190, 30, 24))
        return posterize(aged(im, 805, 0.7), 12)
    out["parcel"] = parcel()

    def stamps():
        W, H = 48, 36
        im = Image.new("RGB", (W, H), (240, 238, 232))
        d = ImageDraw.Draw(im)
        for i in range(4):
            for j in range(3):
                x, y = 2 + i * 11, 2 + j * 11
                d.rectangle([x, y, x + 9, y + 9], fill=[(170, 40, 40), (40, 90, 150), (60, 120, 70)][j])
                d.ellipse([x + 2, y + 2, x + 7, y + 7], fill=(240, 236, 220))
        return posterize(im, 10)
    out["stamps"] = stamps()

    def lotto():
        W, H = 112, 40  # backlit counter sign 0.55 x 0.2
        im = Image.new("RGB", (W, H), (20, 40, 110))
        d = ImageDraw.Draw(im)
        for k in range(10):
            a = k * math.pi / 5
            d.line([(16, 20), (16 + math.cos(a) * 14, 20 + math.sin(a) * 14)], fill=(250, 210, 60), width=2)
        d.ellipse([10, 14, 22, 26], fill=(250, 210, 60))
        ctext(d, 66, 2, "GRATTEUX", "sans", 13, (250, 210, 60))
        ctext(d, 66, 18, "SCRATCH & WIN", "sans", 9, (240, 240, 250))
        ctiny(d, W + 40, 31, "LUCKY LOON - ICI", (250, 120, 160))
        return posterize(im, 14)
    out["lotto"] = lotto()

    def scratch():
        # three ticket designs, 20x30 px each, side by side (a strip folds out of the dispenser)
        im = Image.new("RGB", (66, 30), (0, 0, 0))
        d = ImageDraw.Draw(im)
        designs = [((250, 200, 40), (190, 30, 30), "7"), ((60, 170, 90), (20, 60, 30), "$"), ((120, 60, 180), (250, 220, 90), "L")]
        for i, (bg, fg, sym) in enumerate(designs):
            x = i * 22
            d.rectangle([x, 0, x + 20, 29], fill=bg)
            d.rectangle([x + 2, 12, x + 18, 24], fill=(190, 190, 196))
            tiny(d, x + 8, 3, sym, fg, 1)
            for k in range(3):
                d.point([(x + 5 + k * 5, 18)], fill=(150, 150, 156))
            d.line([(x, 0), (x + 20, 0)], fill=(255, 255, 255))
        return posterize(im, 14)
    out["scratch"] = scratch()

    def candy_bars():
        # six invented wrappers, 30x12 each
        im = Image.new("RGB", (6 * 32, 12), (0, 0, 0))
        d = ImageDraw.Draw(im)
        bars = [((140, 40, 30), (250, 220, 120), "BUCHE"), ((30, 90, 50), (240, 240, 230), "NORDI"), ((250, 200, 40), (120, 30, 20), "TOFFEE"),
                ((40, 60, 150), (250, 250, 250), "ERABLE"), ((90, 50, 30), (250, 180, 60), "PEMMI"), ((200, 30, 90), (250, 240, 240), "ZING")]
        for i, (bg, fg, s) in enumerate(bars):
            x = i * 32
            d.rectangle([x, 0, x + 30, 11], fill=bg)
            d.rectangle([x, 0, x + 2, 11], fill=tuple(int(c * 0.7) for c in bg))
            d.rectangle([x + 28, 0, x + 30, 11], fill=tuple(int(c * 0.7) for c in bg))
            tiny(d, x + 4, 3, s[:6], fg)
        return posterize(im, 18)
    out["candy_bars"] = candy_bars()

    def candy_card(d, w, h):
        ctext(d, w // 2, 0, "BONBONS", "hand", 15, (190, 30, 90))
        ctext(d, w // 2, 16, "penny candy", "cav", 12, MARKER)
        tiny(d, 4, 32, "5C - 10C - 25C", MARKER)
        tiny(d, 4, 39, "USE THE SCOOP!", (30, 90, 160))
    out["candy_card"] = flyer(64, 46, (250, 244, 232), 806, candy_card, 0.6, 12)

    def coffee_card(d, w, h):
        ctext(d, w // 2, 0, "Café 1$", "hand", 16, (110, 50, 20))
        tiny(d, 3, 19, "HONOUR SYSTEM", MARKER)
        tiny(d, 3, 25, "SYST. HONNEUR", MARKER)
        tiny(d, 3, 33, "MONEY IN CAN", MARKER)
        tiny(d, 3, 39, "LUCIEN, THAT", (170, 30, 24))
        tiny(d, 3, 45, "MEANS YOU TOO", (170, 30, 24))
    out["coffee_card"] = flyer(64, 52, (240, 232, 206), 807, coffee_card, 0.9, 12)

    def minnow_sign(d, w, h):
        ctext(d, w // 2, 0, "MÉNÉS", "hand", 16, (30, 70, 140))
        ctext(d, w // 2, 16, "MINNOWS", "hand", 13, MARKER)
        tiny(d, 4, 32, "4$ / DOZ", MARKER)
        tiny(d, 4, 38, "ASK - DEMANDEZ", MARKER)
        tiny(d, 4, 44, "DON'T PET THEM", (170, 30, 24))
    out["minnow_sign"] = flyer(64, 52, (236, 236, 226), 808, minnow_sign, 0.8, 12)

    def cat_sign(d, w, h):
        tiny(d, 3, 3, "NE REVEILLEZ", (170, 30, 24))
        tiny(d, 3, 9, "PAS LA CHATTE", (170, 30, 24))
        tiny(d, 3, 17, "DO NOT WAKE", MARKER)
        tiny(d, 3, 23, "THE CAT", MARKER)
    out["cat_sign"] = flyer(64, 32, (246, 240, 220), 809, cat_sign, 0.7, 10)

    def licences(d, w, h):
        d.rectangle([0, 0, w, 14], fill=(30, 64, 44))
        ctiny(d, w, 4, "PERMIS-LICENCES", (240, 230, 190))
        for i, s in enumerate(["FISHING / PECHE", "OUTDOORS CARD", "SMALL GAME", "MOOSE / ORIGNAL", "BEAR / OURS", "", "NO ID-NO PERMIT"]):
            tiny(d, 3, 18 + i * 6, s, INK if i < 6 else (170, 30, 24))
    out["licences"] = flyer(64, 62, (232, 228, 210), 810, licences, 0.8, 12)

    def fish_chart():
        W, H = 128, 96  # 0.6 x 0.45 poster
        im = Image.new("RGB", (W, H), (226, 220, 196))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W - 1, 13], fill=(30, 60, 90))
        ctiny(d, W, 4, "POISSONS DU NORD - FISH", (236, 230, 200))
        fish = [((120, 130, 70), (200, 190, 110), "DORE"), ((70, 100, 60), (190, 200, 120), "BROCHET"), ((90, 100, 110), (200, 210, 210), "TOULADI"),
                ((60, 70, 40), (170, 150, 80), "ACHIGAN"), ((140, 110, 60), (230, 200, 120), "PERCHAUDE"), ((80, 90, 120), (210, 140, 140), "OMBLE")]
        for i, (c1, c2, nm) in enumerate(fish):
            x, y = 6 + (i % 2) * 62, 18 + (i // 2) * 26
            d.polygon([(x, y + 8), (x + 10, y + 2), (x + 34, y + 2), (x + 44, y + 8), (x + 34, y + 13), (x + 10, y + 13)], fill=c1, outline=(30, 30, 30))
            d.polygon([(x + 44, y + 8), (x + 52, y + 2), (x + 52, y + 14)], fill=c1, outline=(30, 30, 30))
            d.line([(x + 8, y + 10), (x + 38, y + 10)], fill=c2, width=2)
            d.point([(x + 5, y + 6)], fill=(10, 10, 10))
            tiny(d, x + 2, y + 17, nm, INK)
        return posterize(aged(im, 811, 0.9, stains=0.5), 24)
    out["fish_chart"] = fish_chart()

    def bug_spray():
        W, H = 72, 48  # cardboard dump-bin header
        im = Image.new("RGB", (W, H), (240, 200, 40))
        d = ImageDraw.Draw(im)
        ctext(d, W // 2, 1, "BUG-OFF", "sans", 15, (20, 20, 20))
        ctiny(d, W, 19, "ANTI-MOUSTIQUES", (20, 20, 20))
        # a blackfly crossed out
        d.ellipse([28, 27, 40, 37], fill=(20, 20, 20))
        d.line([(26, 28), (22, 24)], fill=(20, 20, 20)); d.line([(42, 28), (46, 24)], fill=(20, 20, 20))
        d.line([(24, 42), (44, 24)], fill=(200, 30, 20), width=3)
        ctiny(d, W, 41, "BLACKFLY STRENGTH", (20, 20, 20))
        return posterize(aged(im, 812, 0.7), 12)
    out["bug_spray"] = bug_spray()

    def jerky_box():
        W, H = 64, 40
        im = Image.new("RGB", (W, H), (110, 30, 24))
        d = ImageDraw.Draw(im)
        ctext(d, W // 2, 1, "SMOKY JACK", "serif", 10, (240, 200, 110))
        ctiny(d, W, 16, "BEEF JERKY", (240, 236, 220))
        ctiny(d, W, 23, "BOEUF SECHE", (240, 236, 220))
        d.rectangle([20, 30, 44, 37], fill=(240, 200, 110))
        tiny(d, 24, 31, "2.99", (110, 30, 24))
        return posterize(aged(im, 813, 0.6), 12)
    out["jerky_box"] = jerky_box()

    def ship_box():
        # shipping carton print (tiles across a box side): 64x48
        W, H = 64, 48
        im = Image.new("RGB", (W, H), (172, 132, 88))
        d = ImageDraw.Draw(im)
        a = np.asarray(im).astype(np.float32)
        a *= (0.92 + 0.12 * noise(W, H, 3, 814))[..., None]
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        d = ImageDraw.Draw(im)
        tiny(d, 4, 4, "NORDIK SUPPLY", (60, 40, 30))
        tiny(d, 4, 10, "12 X 540 ML", (60, 40, 30))
        d.polygon([(46, 6), (50, 2), (54, 6)], fill=(60, 40, 30)); d.line([(50, 6), (50, 12)], fill=(60, 40, 30))
        d.polygon([(56, 6), (60, 2), (63, 6)], fill=(60, 40, 30)); d.line([(60, 6), (60, 12)], fill=(60, 40, 30))
        d.rectangle([4, 30, 40, 42], outline=(60, 40, 30))
        tiny(d, 6, 33, "HAUT - UP", (60, 40, 30))
        d.line([(0, 20), (W, 20)], fill=(200, 180, 130), width=3)  # tape
        return posterize(im, 12)
    out["ship_box"] = ship_box()

    def price_tags():
        # a strip of shelf tags, 8 tags of 16x10: yellow, white, orange "SPECIAL"
        im = Image.new("RGB", (8 * 17, 10), (0, 0, 0))
        d = ImageDraw.Draw(im)
        prices = ["1.99", "2.49", "3.79", "0.89", "5.49", "SPEC", "12.9", "4.25"]
        for i, p in enumerate(prices):
            x = i * 17
            bg = (250, 220, 70) if i % 3 == 0 else (244, 242, 232) if i % 3 == 1 else (250, 140, 40)
            d.rectangle([x, 0, x + 15, 9], fill=bg)
            tiny(d, x + 1, 3, p[:4], (180, 20, 20) if p == "SPEC" else INK)
        return im
    out["price_tags"] = price_tags()

    def nosmoke_in(d, w, h):
        tiny(d, 3, 3, "NO SMOKING", (170, 30, 24))
        tiny(d, 3, 9, "EXCEPT STOVE", MARKER)
        tiny(d, 3, 17, "PAS DE CHEQUES", MARKER)
        tiny(d, 3, 23, "NO CHEQUES", MARKER)
    out["notice_in"] = flyer(64, 32, (236, 232, 214), 815, nosmoke_in, 0.8, 10)

    def wmu_map():
        W, H = 112, 80  # hunting unit map
        im = Image.new("RGB", (W, H), (226, 222, 200))
        d = ImageDraw.Draw(im)
        r = rng(816)
        for k in range(9):
            pts = [(int(r.integers(4, W - 4)), int(r.integers(10, H - 4))) for _ in range(5)]
            d.line(pts, fill=(120, 140, 100))
        for k in range(4):
            x, y = int(r.integers(10, W - 30)), int(r.integers(14, H - 20))
            d.ellipse([x, y, x + int(r.integers(10, 24)), y + int(r.integers(6, 14))], fill=(120, 160, 200))
        d.line([(0, 50), (40, 44), (70, 60), (W, 52)], fill=(190, 40, 30), width=2)
        tiny(d, 3, 2, "WMU 29 - ZONE DE CHASSE", INK)
        d.ellipse([60, 26, 66, 32], outline=(190, 30, 24), width=2)
        tiny(d, 68, 24, "RAY?", (190, 30, 24))
        return posterize(aged(im, 817, 1.0, stains=0.6), 18)
    out["wmu_map"] = wmu_map()
    return out


# ============================================================================================== lure cards (500 px/m)
def lure_cards():
    """eight blister cards, 22x34 px each (4.4 x 6.8 cm): header with a hang hole, the lure, the brand"""
    W, H = 8 * 24, 34
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cards = [(250, 220, 60), (230, 60, 40), (40, 110, 180), (250, 250, 240), (60, 150, 80), (250, 140, 30), (30, 30, 30), (200, 60, 150)]
    for i, bg in enumerate(cards):
        x = i * 24
        d.rectangle([x, 0, x + 21, 33], fill=bg + (255,))
        d.ellipse([x + 9, 2, x + 12, 5], fill=(0, 0, 0, 0))
        tiny(d, x + 2, 7, "NORDK", (20, 20, 20) if sum(bg) > 400 else (250, 250, 240))
        cx = x + 11
        kind = i % 4
        if kind == 0:  # red and white spoon
            d.ellipse([cx - 4, 14, cx + 4, 28], fill=(240, 240, 236))
            for k in range(3):
                d.line([(cx - 3, 17 + k * 4), (cx + 3, 16 + k * 4)], fill=(200, 30, 24), width=2)
        elif kind == 1:  # spinner
            d.line([(cx, 13), (cx, 30)], fill=(200, 200, 200))
            d.ellipse([cx - 3, 15, cx + 3, 22], fill=(220, 190, 60))
            d.rectangle([cx - 2, 24, cx + 2, 28], fill=(240, 240, 240))
        elif kind == 2:  # crankbait
            d.ellipse([cx - 4, 15, cx + 4, 29], fill=(240, 200, 40))
            d.line([(cx - 3, 18), (cx + 3, 26)], fill=(40, 140, 60), width=2)
            d.point([(cx, 17)], fill=(10, 10, 10))
        else:  # jigs
            for k in range(3):
                d.ellipse([cx - 6 + k * 5, 16 + k * 3, cx - 3 + k * 5, 19 + k * 3], fill=(250, 120, 30))
                d.line([(cx - 4 + k * 5, 19 + k * 3), (cx - 4 + k * 5, 26 + k * 2)], fill=(250, 250, 250))
        # clear blister highlight
        d.line([(x + 4, 13), (x + 4, 30)], fill=(255, 255, 255, 255))
    return im


# ============================================================================================== beer / neon light boxes
def lightboxes():
    out = {}
    W, H = 96, 64  # Huard Noir light box (0.5 x 0.33)
    im = Image.new("RGB", (W, H), (14, 16, 20))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([2, 2, W - 3, H - 3], 6, outline=(230, 200, 120), width=2)
    # loon on the water
    d.ellipse([30, 12, 62, 26], fill=(240, 240, 240))
    d.ellipse([56, 8, 68, 18], fill=(240, 240, 240))
    d.polygon([(66, 12), (76, 14), (66, 15)], fill=(240, 240, 240))
    d.point([(62, 11)], fill=(220, 30, 30))
    for k in range(3):
        d.line([(24 + k * 4, 28 + k * 2), (70 - k * 4, 28 + k * 2)], fill=(90, 150, 220))
    ctext(d, W // 2, 34, "HUARD NOIR", "serif", 12, (240, 210, 120))
    ctiny(d, W, 51, "BIERE NOIRE - DARK BEER", (200, 200, 210))
    out["lb_huard"] = posterize(im, 14)
    W, H = 96, 48
    im = Image.new("RGB", (W, H), (190, 30, 24))
    d = ImageDraw.Draw(im)
    d.rectangle([3, 3, W - 4, H - 4], outline=(250, 236, 200), width=1)
    for k in range(4):
        x = 10 + k * 7
        d.polygon([(x, 38), (x + 4, 12 + (k % 2) * 4), (x + 8, 38)], fill=(20, 60, 30))
    ctext(d, 62, 6, "MUSKEG", "sans", 14, (250, 236, 200))
    ctext(d, 62, 23, "LAGER", "serif", 12, (250, 236, 200))
    ctiny(d, W + 30, 38, "COLD - FROIDE", (250, 210, 120))
    out["lb_muskeg"] = posterize(im, 14)
    W, H = 128, 40  # the cooler's lit header
    im = Image.new("RGB", (W, H), (230, 236, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, H - 1], fill=(30, 80, 150))
    ctext(d, W // 2, 2, "FROID · COLD", "sans", 14, (245, 245, 250))
    ctiny(d, W, 22, "BIERE - LAIT - BOISSONS", (250, 220, 120))
    ctiny(d, W, 30, "BEER - MILK - POP", (250, 220, 120))
    out["lb_cooler"] = posterize(im, 10)
    return out


# ============================================================================================== forge / camp / kettle paper
def outdoors():
    out = {}

    def forge_board():
        W, H = 112, 28  # a board with letters burned in, 0.7 x 0.18
        im = Image.new("RGB", (W, H), (150, 112, 70))
        d = ImageDraw.Draw(im)
        for y in range(0, H, 3):
            d.line([(0, y), (W, y + 1)], fill=(138, 100, 62))
        ctext(d, W // 2, 3, "FORGE · HOT", "serif", 15, (40, 22, 14))
        return posterize(aged(im, 901, 1.2, edge=0.3), 14)
    out["forge_board"] = forge_board()

    def forge_note(d, w, h):
        tiny(d, 3, 3, "LACHANCE-CHAIN", BALL)
        tiny(d, 3, 9, "4 SHOES-GAGNON", BALL)
        tiny(d, 3, 15, "AXE BIT DOUG???", BALL)
        d.line([(3, 22), (40, 22)], fill=PENCIL)
        tiny(d, 3, 25, "COAL: 2 BAGS", PENCIL)
    out["forge_note"] = flyer(64, 34, (230, 220, 196), 902, forge_note, 1.4, 10)

    def forge_cal():
        W, H = 64, 92  # an old hardware calendar
        im = Image.new("RGB", (W, H), (230, 222, 200))
        d = ImageDraw.Draw(im)
        d.rectangle([3, 3, W - 4, 40], fill=(110, 140, 170))
        d.polygon([(3, 40), (20, 22), (34, 36), (48, 18), (W - 4, 40)], fill=(60, 80, 70))
        d.rectangle([3, 34, W - 4, 40], fill=(70, 110, 160))
        ctiny(d, W, 43, "QUINC. GAGNON", DRED)
        ctiny(d, W, 50, "MARS 1989", INK)
        for r in range(5):
            for c in range(7):
                d.point([(6 + c * 8, 58 + r * 6)], fill=INK)
                d.point([(7 + c * 8, 58 + r * 6)], fill=INK)
        return posterize(aged(im, 903, 1.4, stains=0.9), 16)
    out["forge_cal"] = forge_cal()

    def camp_rules():
        W, H = 96, 112  # campground rules board 0.6 x 0.7
        im = Image.new("RGB", (W, H), (40, 70, 50))
        d = ImageDraw.Draw(im)
        d.rectangle([3, 3, W - 4, H - 4], outline=(226, 214, 170), width=1)
        ctext(d, W // 2, 4, "CAMPING", "serif", 13, (236, 222, 180))
        ctiny(d, W, 20, "DOUG'S LAKESIDE", (236, 200, 90))
        rules = ["QUIET AFTER 11", "SILENCE APRES 23H", "", "FIRES IN RINGS ONLY", "BUY LOCAL WOOD", "", "LOCK YOUR COOLER", "BEARS CAN READ", "", "CHECKOUT: WHENEVER", "PAY DOUG"]
        for i, s in enumerate(rules):
            tiny(d, 7, 30 + i * 7, s, (236, 222, 180))
        im = aged(im, 911, 0.9)
        return posterize(rust_spots(im, 912, 0.2), 14)
    out["camp_rules"] = camp_rules()

    def honour_box(d, w, h):
        ctext(d, w // 2, 0, "WOOD 5$", "hand", 16, MARKER)
        tiny(d, 3, 18, "HONOUR BOX", MARKER)
        tiny(d, 3, 24, "DOUG WATCHES", (170, 30, 24))
        tiny(d, 3, 30, "(NOT REALLY)", PENCIL)
    out["honour_box"] = flyer(64, 38, (214, 186, 140), 913, honour_box, 1.0, 10)

    def site_num():
        W, H = 24, 24
        im = Image.new("RGB", (W, H), (40, 70, 50))
        d = ImageDraw.Draw(im)
        ctext(d, W // 2, 3, "7", "sans", 16, (236, 222, 180))
        return posterize(aged(im, 914, 0.8), 8)
    out["site_num"] = site_num()

    def kettle_stencil():
        W, H = 96, 24  # stencilled on crates and the cookhouse wall
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        ctext(d, W // 2, 2, "RANG 4 TIMBER CO.", "mono", 10, (40, 34, 30, 255))
        ctiny(d, W, 15, "CAMP 3 - KETTLE", (40, 34, 30, 255))
        a = np.asarray(im).astype(np.float32)
        a[..., 3] *= np.clip((noise(W, H, 2, 921) - 0.25) * 2, 0, 1) * 0.85
        return Image.fromarray(a.astype(np.uint8))
    out["kettle_stencil"] = kettle_stencil()

    def kettle_poster():
        W, H = 64, 88  # 1940s safety poster, rotted
        im = Image.new("RGB", (W, H), (214, 200, 160))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W, 16], fill=(170, 40, 30))
        ctext(d, W // 2, 2, "DANGER", "serif", 11, (240, 230, 200))
        # a falling dead branch over a man
        d.line([(40, 22), (20, 46)], fill=(60, 40, 30), width=3)
        d.ellipse([28, 50, 34, 56], fill=(60, 40, 30))
        d.line([(31, 56), (31, 68)], fill=(60, 40, 30), width=2)
        d.line([(31, 60), (24, 54)], fill=(60, 40, 30)); d.line([(31, 60), (38, 54)], fill=(60, 40, 30))
        ctiny(d, W, 72, "WIDOW-MAKERS", INK)
        ctiny(d, W, 78, "LOOK UP!", (170, 40, 30))
        return posterize(aged(im, 922, 1.8, stains=1.0, edge=0.4), 12)
    out["kettle_poster"] = torn(kettle_poster(), 923, top=True, bottom=True, sides=True, depth=8)

    def kettle_cal():
        W, H = 56, 80
        im = Image.new("RGB", (W, H), (220, 206, 170))
        d = ImageDraw.Draw(im)
        d.rectangle([3, 3, W - 4, 34], fill=(120, 150, 170))
        for k in range(8):
            d.ellipse([6 + k * 6, 26 - (k % 3), 12 + k * 6, 31 - (k % 3)], fill=(110, 80, 50))  # a river drive
        ctiny(d, W, 38, "AVRIL 1951", INK)
        for r in range(5):
            for c in range(6):
                d.point([(6 + c * 8, 48 + r * 6)], fill=INK)
        d.line([(6, 62), (40, 74)], fill=(170, 40, 30))
        return posterize(aged(im, 924, 1.7, stains=1.0), 12)
    out["kettle_cal"] = torn(kettle_cal(), 925, top=False, bottom=True, sides=True, depth=10)

    def can_label():
        W, H = 64, 20
        im = Image.new("RGB", (W, H), (190, 120, 60))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 6, W, 14], fill=(230, 220, 190))
        tiny(d, 4, 8, "PORK BEANS", (120, 40, 20))
        return posterize(rust_spots(aged(im, 926, 1.5), 927, 0.9), 10)
    out["can_label"] = can_label()
    return out


# ============================================================================================== grime (soft alpha)
def soft(w, h, f):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx + 0.5) / w * 2 - 1
    v = (yy + 0.5) / h * 2 - 1
    return f(u, v)


def g_img(rgb, a):
    a = np.clip(a, 0, 1)
    h, w = a.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.array(rgb, np.float32)
    out[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(out)


def grime_cells():
    out = {}
    S = 64
    # contact shadow: soft ellipse, darkest in the middle
    out["g_blob"] = g_img((10, 8, 6), soft(S, S, lambda u, v: np.clip(1 - (u * u + v * v), 0, 1) ** 1.6 * 0.85))
    # ring of dirt (a bucket / can sat here)
    out["g_ring"] = g_img((40, 30, 20), soft(S, S, lambda u, v: np.exp(-((np.sqrt(u * u + v * v) - 0.7) ** 2) / 0.01) * 0.55 * (0.6 + 0.4 * noise(S, S, 4, 951))))

    # floor wear path: the varnish worn grey-pale in the middle (tiles along v)
    def wear(u, v):
        n = noise(S, S * 2, 5, 952) * 0.6 + noise(S, S * 2, 2, 953) * 0.4
        ends = np.clip((1 - np.abs(v)) * 3.5, 0, 1)
        return np.clip(1 - np.abs(u) ** 1.2, 0, 1) ** 1.5 * ends * (0.12 + 0.34 * n)
    out["g_wear"] = g_img((214, 196, 160), soft(S, S * 2, wear))

    # mud: blotchy smears with boot-print fragments
    def mud(u, v):
        n = noise(S, S, 5, 954) * 0.7 + noise(S, S, 2, 955) * 0.3
        r = np.sqrt(u * u + v * v)
        return np.clip((n - 0.35) * 2.5, 0, 1) * np.clip(1.2 - r, 0, 1)
    out["g_mud"] = g_img((58, 44, 30), soft(S, S, mud))

    # a tyre track (tileable along v): two tread bands of chevrons pressed into mud
    def tread(u, v):
        h = S * 2
        yy = (v + 1) / 2 * h
        band = np.clip(1 - np.abs(u) * 1.15, 0, 1) ** 0.4
        chevron = ((yy + np.abs(u) * 10) % 8 < 3.5).astype(np.float32)
        n = noise(S, h, 3, 956)
        return band * (0.45 + 0.4 * chevron) * (0.7 + 0.5 * n)
    out["g_tread"] = g_img((44, 34, 24), soft(S, S * 2, tread))

    # a puddle (dark, the material makes it glossy)
    def puddle(u, v):
        n = noise(S, S, 8, 957)
        r = np.sqrt(u * u + v * v) * 1.25 + (n - 0.5) * 0.5
        return np.clip((1 - r) * 4, 0, 1) * 0.9
    out["g_puddle"] = g_img((30, 34, 36), soft(S, S, puddle))

    # stains: coffee rings and a spill
    def stain(u, v):
        r1 = np.sqrt((u + 0.3) ** 2 + (v + 0.2) ** 2)
        r2 = np.sqrt((u - 0.35) ** 2 + (v - 0.3) ** 2)
        ring = np.exp(-((r1 - 0.35) ** 2) / 0.003) * 0.6 + np.exp(-((r2 - 0.28) ** 2) / 0.002) * 0.4
        n = noise(S, S, 6, 958)
        spill = np.clip((n - 0.6) * 4, 0, 1) * 0.35
        return ring + spill
    out["g_stain"] = g_img((70, 44, 22), soft(S, S, stain))

    # drips: vertical streaks (rust / rain) hanging from the top edge
    def drip(u, v):
        r = rng(959)
        cols = np.zeros(S)
        for _ in range(9):
            c = int(r.integers(2, S - 2))
            cols[c - 1:c + 2] += r.random() * 0.8 + 0.2
        length = noise(S, 1, 3, 960)[0] * 0.9 + 0.3
        yy = (v + 1) / 2
        fall = np.clip(1 - yy / length[None, :], 0, 1)
        return np.clip(cols[None, :], 0, 1) * fall * 0.75 + np.clip(1 - yy * 4, 0, 1) * 0.25
    out["g_drip"] = g_img((78, 50, 30), soft(S, S, drip))

    # soot plume (rises: dark at the bottom centre, feathering up)
    def soot(u, v):
        n = noise(S, S, 6, 961)
        t = (1 - v) / 2  # 0 at bottom
        width = 0.35 + 0.6 * t
        return np.clip(1 - np.abs(u) / width, 0, 1) * np.clip(1 - t * 0.9, 0, 1) * (0.55 + 0.45 * n)
    out["g_soot"] = g_img((14, 12, 12), soft(S, S, soot))

    # dust / fluff: pale, patchy (for shelf tops and corners)
    out["g_dust"] = g_img((176, 166, 150), soft(S, S, lambda u, v: np.clip((noise(S, S, 4, 962) - 0.3) * 1.6, 0, 1) * np.clip(1.1 - np.abs(u) ** 4 - np.abs(v) ** 4, 0, 1) * 0.6))

    # moss: green speckled patch with a soft edge
    def moss(u, v):
        n = noise(S, S, 3, 963) * 0.5 + noise(S, S, 1, 964) * 0.5
        r = np.sqrt(u * u + v * v)
        return np.clip((n - 0.3) * 3, 0, 1) * np.clip((1 - r) * 2.5, 0, 1)
    m = soft(S, S, moss)
    im = g_img((70, 96, 44), m)
    a = np.asarray(im).copy()
    hi = noise(S, S, 1, 965) > 0.6
    a[hi, 0], a[hi, 1], a[hi, 2] = 116, 140, 60
    out["g_moss"] = Image.fromarray(a)

    # leaf litter: scattered small leaves and needles (opaque bits)
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = rng(966)
    for _ in range(70):
        x, y = int(r.integers(0, S)), int(r.integers(0, S))
        if (x - S / 2) ** 2 + (y - S / 2) ** 2 > (S / 2 - 2) ** 2:
            continue
        c = [(170, 90, 30), (196, 140, 40), (120, 70, 30), (150, 130, 60), (90, 60, 34)][int(r.integers(0, 5))]
        if r.random() < 0.4:
            d.line([(x, y), (x + int(r.integers(-3, 4)), y + int(r.integers(-3, 4)))], fill=c + (255,))
        else:
            d.ellipse([x, y, x + int(r.integers(2, 4)), y + int(r.integers(1, 3))], fill=c + (255,))
    out["g_leaves"] = im

    # cigarette butts and bottle caps (porch, ashtray can)
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = rng(967)
    for _ in range(14):
        x, y = int(r.integers(6, S - 8)), int(r.integers(6, S - 8))
        if r.random() < 0.7:
            d.line([(x, y), (x + 3, y + 1)], fill=(236, 230, 214, 255))
            d.point([(x + 4, y + 1)], fill=(200, 140, 70, 255))
        else:
            d.ellipse([x, y, x + 2, y + 2], fill=(190, 170, 60, 255))
    out["g_butts"] = im

    # a cobweb for a corner (the corner of the cell is the room's corner)
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = rng(971)
    spokes = [math.radians(a) for a in (2, 14, 30, 47, 63, 78, 88)]
    for a in spokes:
        d.line([(0, 0), (math.cos(a) * S * 1.1, math.sin(a) * S * 1.1)], fill=(220, 220, 214, 150))
    for k in range(1, 9):
        rr = k * S / 9 + r.integers(-2, 3)
        pts = [(math.cos(a) * rr * (0.9 + 0.2 * r.random()), math.sin(a) * rr * (0.9 + 0.2 * r.random())) for a in spokes]
        d.line(pts, fill=(214, 214, 206, 110))
    d.ellipse([10, 12, 13, 15], fill=(60, 50, 40, 200))
    out["g_web"] = im
    # glow halo (additive / blended light pool)
    out["g_glow"] = g_img((255, 255, 255), soft(S, S, lambda u, v: np.clip(1 - np.sqrt(u * u + v * v), 0, 1) ** 2.2))
    # light pool on the floor under a lamp (elliptical, warm, used additively)
    out["g_pool"] = g_img((255, 236, 200), soft(S, S, lambda u, v: np.clip(1 - np.sqrt(u * u + v * v), 0, 1) ** 1.4))
    # gravel speckle
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = rng(968)
    for _ in range(260):
        x, y = int(r.integers(0, S)), int(r.integers(0, S))
        if (x - S / 2) ** 2 + (y - S / 2) ** 2 > (S / 2 - 3) ** 2 * (0.6 + 0.4 * r.random()):
            continue
        g = int(r.integers(90, 190))
        d.point([(x, y)], fill=(g, g - 6, g - 14, 255))
        if r.random() < 0.3:
            d.point([(x + 1, y)], fill=(g - 30, g - 34, g - 40, 255))
    out["g_gravel"] = im
    # frost on glass / a freezer lid (pale crystalline)
    out["g_frost"] = g_img((230, 240, 250), soft(S, S, lambda u, v: np.clip((noise(S, S, 2, 969) * 0.5 + noise(S, S, 6, 970) * 0.5 - 0.2) * 1.5, 0, 1) * np.clip(1.6 - np.maximum(np.abs(u), np.abs(v)) * 1.4, 0, 1) * 0.7))
    return out


# ============================================================================================== main
def main():
    pr = mp.Atlas("store_print", 1024)
    pr.put("ff_sign", ff_sign())
    pr.put("fascia", fascia())
    pr.put("ghost_cola", ghost_cola())
    for k, v in {"bait_card": bait_card(), "ice_door": ice_door(), "propane_sign": propane_sign(), "firewood_sign": firewood_sign(),
                 "bundle_wrap": bundle_wrap(), "gas_price": gas_price(), "no_smoking": no_smoking(), "phone_plate": phone_plate(),
                 "phone_sign": phone_sign(), "lure_cards": lure_cards()}.items():
        pr.put(k, v)
    for group in (window_vinyl(), mail_labels(), flyers(), interior(), lightboxes(), outdoors()):
        for k, v in group.items():
            pr.put(k, v)
    pr.save()
    gr = mp.Atlas("store_grime", 512)
    for k, v in grime_cells().items():
        gr.put(k, v)
    gr.save()
    with open(TS, "w") as f:
        f.write("// generated by src/places/store/make_store_print.py: pixel rectangles [x, y, w, h] in\n")
        f.write("// public/assets/textures/places/store_print.png (1024) and store_grime.png (512). Do not edit by hand.\n")
        f.write(f"export const PRINT_RECTS: Record<string, [number, number, number, number]> = {json.dumps(pr.rects)};\n")
        f.write(f"export const GRIME_RECTS: Record<string, [number, number, number, number]> = {json.dumps(gr.rects)};\n")
        f.write("export const PRINT_SIZE = 1024;\nexport const GRIME_SIZE = 512;\n")
    print("print:", len(pr.rects), "grime:", len(gr.rects))
    for w in _warn:
        print("WARN", w)


if __name__ == "__main__":
    main()
