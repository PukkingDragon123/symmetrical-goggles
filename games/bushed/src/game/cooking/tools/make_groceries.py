#!/usr/bin/env python3
"""BUSHED kitchen: the grocery labels atlas. Pixel-art labels and surfaces for the cooking ingredients the general
store sells (cooking oil, butter, lard, flour, sugar, salt, pepper, baking powder, oats, rice, macaroni, milk,
onions, potatoes, carrots, garlic, canned tomatoes, bouillon, ground beef, sausages, cheese, tea, split peas,
Labrador tea) and a few things from the land. Invented bilingual brands, 512 px/m like the store's own labels;
the helpers (tiny pixel font, noise, ageing, posterize, atlas packer) come from src/places/tools/make_print.py.

    cd games/bushed && python3 src/game/cooking/tools/make_groceries.py

writes src/game/cooking/groceries.png (1024 x 512) and src/game/cooking/grocery_atlas.ts (pixel rects).
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
COOK = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.abspath(os.path.join(COOK, "..", "..", "places", "tools")))
import make_print as mp  # noqa: E402
from make_print import tiny, tiny_w, text, noise, aged, posterize, fill_noise, rng, INK, RED, DRED, GREEN, NAVY, GOLD, BROWN, PAPER  # noqa: E402

WHITE = (236, 232, 220)
CREAMY = (238, 226, 190)


def ctiny(d, cx, y, s, fill, scale=1):
    tiny(d, cx - tiny_w(s, scale) // 2, y, s, fill, scale)


def finish(im, seed, k=16, age=0.35, edge=0.05):
    return posterize(aged(im, seed, age, edge=edge, stains=0.2), k)


# ---------------------------------------------------------------------------------------------- icons
def flower(d, x, y, petal=(244, 210, 40), mid=(200, 110, 20)):
    for dx, dy in ((0, -3), (3, 0), (0, 3), (-3, 0)):
        d.ellipse([x + dx - 2, y + dy - 2, x + dx + 2, y + dy + 2], fill=petal)
    d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=mid)


def cow(d, x, y, body=(250, 250, 246), spot=(30, 30, 30)):
    d.rectangle([x, y + 3, x + 12, y + 8], fill=body)
    d.rectangle([x + 12, y + 1, x + 16, y + 6], fill=body)
    d.point([(x + 15, y + 3)], fill=spot)
    d.rectangle([x + 3, y + 4, x + 5, y + 6], fill=spot)
    d.rectangle([x + 8, y + 3, x + 10, y + 5], fill=spot)
    for lx in (x + 1, x + 4, x + 8, x + 11):
        d.line([(lx, y + 9), (lx, y + 11)], fill=body)
    d.point([(x + 13, y), (x + 16, y)], fill=(200, 180, 140))


def wheat(d, x, y, col=(200, 150, 50), stem=(150, 110, 40), h=18):
    d.line([(x, y), (x, y + h)], fill=stem)
    for k in range(4):
        yy = y + k * 3
        d.ellipse([x - 3, yy, x - 1, yy + 3], fill=col)
        d.ellipse([x + 1, yy, x + 3, yy + 3], fill=col)
    d.ellipse([x - 1, y - 3, x + 1, y], fill=col)


def leaf(d, x, y, col=(60, 110, 50), s=1):
    d.polygon([(x, y), (x + 4 * s, y - 3 * s), (x + 9 * s, y - 2 * s), (x + 6 * s, y + 2 * s), (x + 1 * s, y + 2 * s)], fill=col)
    d.line([(x, y), (x + 8 * s, y - 2 * s)], fill=(30, 70, 30))


def maple(d, x, y, col=(190, 40, 30)):
    d.polygon([(x, y - 7), (x + 2, y - 3), (x + 6, y - 5), (x + 4, y - 1), (x + 7, y + 1), (x + 3, y + 2), (x + 1, y + 5), (x - 1, y + 5),
               (x - 3, y + 2), (x - 7, y + 1), (x - 4, y - 1), (x - 6, y - 5), (x - 2, y - 3)], fill=col)


# ---------------------------------------------------------------------------------------------- labels
def label_oil():
    W, H = 120, 52  # 1 L canola bottle, r 0.037 m, band 0.1 m tall
    im = Image.new("RGB", (W, H), (234, 214, 116))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 6], fill=(36, 86, 46)); d.rectangle([0, H - 7, W - 1, H - 1], fill=(36, 86, 46))
    cx = W // 2
    d.ellipse([cx - 16, 9, cx + 16, 30], fill=(250, 238, 170), outline=(36, 86, 46))
    d.line([(cx, 22), (cx - 2, 29)], fill=(40, 100, 40))
    for fx, fy in ((cx - 7, 16), (cx, 13), (cx + 7, 16), (cx - 3, 21), (cx + 4, 21)):
        flower(d, fx, fy)
    text(d, (cx, 31), "PRAIRIE GOLD", "sans", 8, (36, 86, 46), "ma")
    ctiny(d, cx, 40, "CANOLA OIL", INK)
    tiny(d, 3, 10, "HUILE", BROWN); tiny(d, 3, 16, "DE", BROWN); tiny(d, 3, 22, "CANOLA", BROWN)
    tiny(d, W - 22, 10, "1 L", INK); tiny(d, W - 26, 18, "PURE", INK); tiny(d, W - 26, 24, "PUR", INK)
    tiny(d, 2, 1, "SASKATOON", (220, 220, 170))
    return finish(im, 401)


def oil_body():
    W, H = 32, 32
    a = np.zeros((H, W, 3), np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    n = noise(W, H, 4, 402)
    a[:] = np.array([0.86, 0.66, 0.16])
    a *= (0.75 + 0.35 * n[..., None] + 0.15 * np.sin(xx * 0.4)[..., None])
    a[(xx % 11) == 3] = np.array([0.98, 0.9, 0.55])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def label_butter():
    W, H = 64, 32  # 454 g brick, front 0.125 x 0.06
    im = Image.new("RGB", (W, H), (236, 218, 150))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 4], fill=(30, 60, 120)); d.rectangle([0, H - 5, W - 1, H - 1], fill=(30, 60, 120))
    cow(d, 3, 9)
    text(d, (40, 6), "BUTTER", "sans", 8, (30, 60, 120), "ma")
    ctiny(d, 40, 16, "BEURRE", DRED)
    ctiny(d, 40, 22, "SALE 454G", INK)
    return finish(im, 411, 14)


def label_lard():
    W, H = 64, 34
    im = Image.new("RGB", (W, H), (240, 236, 226))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 9], fill=RED)
    ctiny(d, W // 2, 2, "FLAKEWHITE", (250, 240, 230))
    text(d, (W // 2, 11), "LARD", "sans", 10, RED, "ma")
    ctiny(d, W // 2, 23, "SAINDOUX PUR", INK)
    ctiny(d, W // 2, 28, "454 G", INK)
    return finish(im, 421, 12)


def label_flour():
    W, H = 80, 120  # 2.5 kg paper bag front
    im = Image.new("RGB", (W, H), (240, 236, 226))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 22], fill=(32, 62, 120))
    text(d, (W // 2, 4), "BLUE MILL", "serif", 10, (240, 236, 226), "ma")
    # windmill on a hill
    d.ellipse([10, 72, 70, 96], fill=(120, 160, 90))
    d.polygon([(34, 78), (46, 78), (43, 58), (37, 58)], fill=(200, 190, 170), outline=(90, 80, 70))
    for a in (0.6, 2.17, 3.74, 5.31):
        x2, y2 = 40 + 13 * np.cos(a), 58 + 13 * np.sin(a)
        d.line([(40, 58), (x2, y2)], fill=(90, 70, 50), width=2)
    d.rectangle([38, 72, 42, 78], fill=(90, 60, 40))
    wheat(d, 12, 52); wheat(d, 68, 52)
    ctiny(d, W // 2, 27, "ALL PURPOSE", INK)
    ctiny(d, W // 2, 33, "FLOUR", INK, 2)
    ctiny(d, W // 2, 98, "FARINE TOUT USAGE", (32, 62, 120))
    ctiny(d, W // 2, 105, "BLE CANADIEN", INK)
    ctiny(d, W // 2, 112, "2.5 KG", DRED)
    return finish(im, 431, 18)


def label_sugar():
    W, H = 62, 92
    im = Image.new("RGB", (W, H), (244, 242, 236))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 16], fill=(170, 30, 30))
    text(d, (W // 2, 3), "ST-LAURENT", "sans", 7, (244, 242, 236), "ma")
    d.rectangle([0, 17, W - 1, 19], fill=(30, 50, 110))
    # a sugar bowl with cubes
    d.ellipse([16, 44, 46, 62], fill=(230, 230, 236), outline=(60, 70, 110))
    d.rectangle([16, 44, 46, 53], fill=(230, 230, 236))
    d.ellipse([16, 38, 46, 50], fill=(250, 250, 252), outline=(60, 70, 110))
    for x, y in ((24, 36), (32, 34), (38, 37)):
        d.rectangle([x, y, x + 5, y + 5], fill=(255, 255, 255), outline=(180, 180, 190))
    ctiny(d, W // 2, 24, "WHITE SUGAR", INK)
    ctiny(d, W // 2, 68, "SUCRE BLANC", (170, 30, 30))
    ctiny(d, W // 2, 75, "GRANULE", INK)
    ctiny(d, W // 2, 84, "2 KG", INK)
    return finish(im, 441, 16)


def label_salt():
    W, H = 146, 68  # round canister r 0.045, 0.13 tall
    im = Image.new("RGB", (W, H), (40, 80, 150))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 5], fill=(240, 236, 226)); d.rectangle([0, H - 6, W - 1, H - 1], fill=(240, 236, 226))
    cx = W // 2
    d.ellipse([cx - 22, 10, cx + 22, 54], fill=(240, 236, 226))
    # a little girl-free logo: a snowflake of salt
    for a in range(6):
        ang = a * np.pi / 3
        d.line([(cx, 24), (cx + 9 * np.cos(ang), 24 + 9 * np.sin(ang))], fill=(40, 80, 150))
    text(d, (cx, 36), "SALT", "sans", 9, (40, 80, 150), "ma")
    ctiny(d, cx, 47, "SEL", DRED)
    tiny(d, 6, 14, "NORTHERN", (240, 236, 226)); tiny(d, 6, 22, "TABLE", (240, 236, 226)); tiny(d, 6, 28, "SALT", (240, 236, 226))
    tiny(d, 6, 38, "IODIZED", (200, 210, 230))
    tiny(d, W - 40, 14, "SEL DE", (240, 236, 226)); tiny(d, W - 40, 20, "TABLE", (240, 236, 226)); tiny(d, W - 40, 28, "IODE", (200, 210, 230))
    tiny(d, W - 40, 40, "1 KG", (240, 236, 226))
    return finish(im, 451, 14)


def label_pepper():
    W, H = 80, 42
    im = Image.new("RGB", (W, H), (30, 28, 26))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 8, W - 1, 30], fill=(160, 34, 26))
    cx = W // 2
    for k in range(7):
        x = cx - 14 + k * 4
        d.ellipse([x, 14 + (k % 2) * 3, x + 3, 17 + (k % 2) * 3], fill=(20, 18, 16))
    ctiny(d, cx, 1, "BLACK PEPPER", (230, 210, 170))
    ctiny(d, cx, 24, "GROUND MOULU", (240, 220, 190))
    ctiny(d, cx, 33, "POIVRE NOIR", (230, 210, 170))
    return finish(im, 461, 12)


def label_bpowder():
    W, H = 122, 46
    im = Image.new("RGB", (W, H), (210, 40, 34))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 6], fill=(244, 200, 40)); d.rectangle([0, H - 7, W - 1, H - 1], fill=(244, 200, 40))
    cx = W // 2
    d.ellipse([cx - 18, 8, cx + 18, 38], fill=(244, 200, 40), outline=(120, 20, 16))
    text(d, (cx, 12), "LIFT", "serif", 12, (160, 26, 20), "ma")
    ctiny(d, cx, 29, "LEVURE", (120, 20, 16))
    tiny(d, 4, 12, "BAKING", (250, 236, 200)); tiny(d, 4, 19, "POWDER", (250, 236, 200)); tiny(d, 4, 28, "225 G", (250, 236, 200))
    tiny(d, W - 34, 12, "POUDRE", (250, 236, 200)); tiny(d, W - 34, 19, "A PATE", (250, 236, 200))
    return finish(im, 471, 12)


def label_oats():
    W, H = 192, 88  # canister r 0.06, 0.17 tall
    im = Image.new("RGB", (W, H), (170, 46, 34))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 8], fill=(236, 220, 180)); d.rectangle([0, H - 9, W - 1, H - 1], fill=(236, 220, 180))
    cx = W // 2
    # a sun over a field and a bowl of porridge
    d.rectangle([cx - 30, 14, cx + 30, 64], fill=(236, 220, 180))
    d.ellipse([cx - 12, 18, cx + 12, 42], fill=(244, 190, 60))
    d.rectangle([cx - 30, 36, cx + 30, 64], fill=(200, 170, 80))
    for k in range(6):
        wheat(d, cx - 25 + k * 10, 36, (230, 200, 120), (150, 120, 50), 12)
    d.ellipse([cx - 18, 48, cx + 18, 62], fill=(250, 250, 248), outline=(80, 60, 40))
    d.ellipse([cx - 15, 49, cx + 15, 55], fill=(220, 190, 130))
    text(d, (cx, 66), "HEARTH", "serif", 9, (236, 220, 180), "ma")
    tiny(d, 8, 18, "ROLLED", (236, 220, 180)); tiny(d, 8, 26, "OATS", (236, 220, 180), 2)
    tiny(d, 8, 42, "1 KG", (236, 220, 180))
    tiny(d, W - 56, 18, "FLOCONS", (236, 220, 180)); tiny(d, W - 56, 26, "D'AVOINE", (236, 220, 180)); tiny(d, W - 56, 36, "A L'ANCIENNE", (236, 220, 180))
    return finish(im, 481, 18)


def lid_oats():
    W = H = 64
    im = Image.new("RGB", (W, H), (236, 220, 180))
    d = ImageDraw.Draw(im)
    d.ellipse([2, 2, W - 3, H - 3], outline=(170, 46, 34), width=4)
    ctiny(d, W // 2, 28, "HEARTH", (170, 46, 34))
    return finish(im, 482, 8)


def label_pouch(title, sub, fr, col, seed, art):
    W, H = 56, 88
    im = Image.new("RGB", (W, H), (244, 240, 230))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 14], fill=col)
    ctiny(d, W // 2, 4, title, (244, 240, 230))
    art(d, W, H)
    ctiny(d, W // 2, 60, sub, INK)
    ctiny(d, W // 2, 68, fr, col)
    d.rectangle([0, H - 10, W - 1, H - 1], fill=col)
    ctiny(d, W // 2, H - 8, "900 G", (244, 240, 230))
    return finish(im, seed, 14)


def art_rice(d, W, H):
    d.ellipse([10, 22, W - 11, 54], fill=(250, 250, 248), outline=(150, 150, 140))
    r = rng(491)
    for _ in range(40):
        x, y = r.integers(14, W - 15), r.integers(26, 50)
        d.line([(x, y), (x + 2, y + 1)], fill=(220, 214, 196))


def art_peas(d, W, H):
    d.ellipse([10, 22, W - 11, 54], fill=(230, 200, 90), outline=(150, 120, 40))
    r = rng(492)
    for _ in range(30):
        x, y = r.integers(14, W - 17), r.integers(26, 48)
        d.ellipse([x, y, x + 3, y + 3], fill=(240, 214, 100), outline=(190, 150, 50))


def label_macaroni():
    W, H = 56, 82
    im = Image.new("RGB", (W, H), (30, 70, 140))
    d = ImageDraw.Draw(im)
    text(d, (W // 2, 3), "MACARONI", "sans", 7, (250, 230, 120), "ma")
    # window showing the elbows
    d.rectangle([8, 18, W - 9, 52], fill=(240, 220, 150), outline=(250, 250, 240))
    r = rng(501)
    for _ in range(14):
        x, y = r.integers(10, W - 18), r.integers(20, 44)
        d.arc([x, y, x + 8, y + 8], 180, 360, fill=(220, 170, 70), width=2)
    ctiny(d, W // 2, 56, "ELBOW", (250, 230, 120))
    ctiny(d, W // 2, 63, "COUDES", (240, 240, 240))
    ctiny(d, W // 2, 73, "500 G", (240, 240, 240))
    return finish(im, 502, 14)


def label_milk():
    W, H = 36, 98  # one face of a 1 L gable-top carton
    im = Image.new("RGB", (W, H), (244, 244, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 22], fill=(40, 90, 170))
    d.polygon([(0, 22), (W - 1, 22), (W - 1, 30), (0, 36)], fill=(40, 90, 170))
    ctiny(d, W // 2, 4, "MILK", (244, 244, 240))
    ctiny(d, W // 2, 12, "LAIT", (244, 244, 240))
    d.rectangle([4, 40, W - 5, 58], fill=(120, 170, 220))
    cow(d, 9, 43, (250, 250, 246), (30, 30, 30))
    d.rectangle([4, 60, W - 5, 64], fill=(120, 170, 90))
    ctiny(d, W // 2, 70, "HOMO", INK)
    ctiny(d, W // 2, 77, "3.25%", DRED)
    ctiny(d, W // 2, 88, "1 L", INK)
    return finish(im, 511, 12)


def label_potatoes():
    W, H = 82, 112  # kraft sack front
    im = fill_noise(W, H, (176, 142, 100), 0.18, 521, 3)
    d = ImageDraw.Draw(im)
    g = (40, 80, 40)
    d.rectangle([4, 4, W - 5, 18], outline=g)
    ctiny(d, W // 2, 8, "ONTARIO NO.1", g)
    for x, y in ((22, 36), (40, 30), (56, 38), (32, 46), (50, 50)):
        d.ellipse([x - 8, y - 6, x + 8, y + 6], fill=(196, 160, 90), outline=(120, 90, 50))
        d.point([(x - 3, y - 1), (x + 2, y + 2)], fill=(120, 90, 50))
    text(d, (W // 2, 62), "POTATOES", "sans", 9, g, "ma")
    ctiny(d, W // 2, 76, "POMMES DE TERRE", g)
    ctiny(d, W // 2, 84, "JAUNES", g)
    ctiny(d, W // 2, 98, "5 LB", (120, 40, 30))
    return finish(im, 522, 14, 0.4)


def label_tomatoes():
    W, H = 160, 52  # can r 0.05, 0.1 tall
    im = Image.new("RGB", (W, H), (200, 36, 30))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 5], fill=(40, 100, 50)); d.rectangle([0, H - 6, W - 1, H - 1], fill=(40, 100, 50))
    cx = W // 2
    for x, y, r in ((cx - 10, 26, 11), (cx + 9, 28, 10), (cx, 18, 8)):
        d.ellipse([x - r, y - r, x + r, y + r], fill=(230, 60, 40), outline=(120, 20, 16))
        d.ellipse([x - r // 2, y - r // 2, x - r // 2 + 3, y - r // 2 + 2], fill=(250, 170, 150))
        leaf(d, x - 2, y - r + 1, (60, 120, 50))
    text(d, (cx, 38), "TOMATOES", "sans", 8, (250, 240, 220), "ma")
    tiny(d, 6, 12, "DICED", (250, 240, 220)); tiny(d, 6, 20, "TOMATOES", (250, 240, 220)); tiny(d, 6, 30, "796 ML", (250, 240, 220))
    tiny(d, W - 48, 12, "TOMATES", (250, 240, 220)); tiny(d, W - 48, 20, "EN DES", (250, 240, 220)); tiny(d, W - 48, 30, "NIAGARA", (250, 240, 220))
    return finish(im, 531, 14)


def label_bouillon():
    W, H = 48, 32
    im = Image.new("RGB", (W, H), (120, 60, 26))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 8], fill=(240, 196, 60))
    ctiny(d, W // 2, 2, "BOUILLON", (120, 40, 20))
    d.rectangle([5, 12, 15, 22], fill=(170, 110, 40), outline=(240, 196, 60))
    d.rectangle([9, 15, 19, 25], fill=(180, 120, 50), outline=(240, 196, 60))
    tiny(d, 22, 12, "BEEF", (250, 230, 190)); tiny(d, 22, 18, "BOEUF", (250, 230, 190)); tiny(d, 22, 25, "6 X", (240, 196, 60))
    return finish(im, 541, 12)


def sticker(a, b, col, seed):
    W, H = 34, 20
    im = Image.new("RGB", (W, H), (250, 246, 236))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 5], fill=col)
    ctiny(d, W // 2, 7, a, INK)
    ctiny(d, W // 2, 13, b, col)
    return finish(im, seed, 8, 0.2)


def label_cheese():
    W, H = 62, 26
    im = Image.new("RGB", (W, H), (240, 230, 200))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 6], fill=(30, 60, 30))
    ctiny(d, W // 2, 1, "LAITERIE", (240, 230, 200))
    text(d, (W // 2, 7), "CHEDDAR", "sans", 7, (30, 60, 30), "ma")
    ctiny(d, W // 2, 18, "OLD - FORT", DRED)
    return finish(im, 551, 10)


def label_tea():
    W, H = 62, 34
    im = Image.new("RGB", (W, H), (30, 80, 50))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, 3], fill=(200, 160, 60)); d.rectangle([0, H - 4, W - 1, H - 1], fill=(200, 160, 60))
    d.ellipse([4, 8, 20, 26], fill=(210, 90, 50))
    leaf(d, 7, 16, (120, 170, 80))
    tiny(d, 24, 7, "ORANGE", (240, 220, 160)); tiny(d, 24, 13, "PEKOE", (240, 220, 160))
    tiny(d, 24, 21, "THE NOIR", (250, 250, 240)); tiny(d, 46, 27, "72", (200, 160, 60))
    return finish(im, 561, 12)


def label_labtea():
    W, H = 50, 42  # stamped on a kraft bag
    im = fill_noise(W, H, (178, 144, 102), 0.18, 571, 3)
    d = ImageDraw.Draw(im)
    ink = (60, 40, 70)
    d.rectangle([2, 2, W - 3, H - 3], outline=ink)
    for k in range(3):
        leaf(d, 8 + k * 6, 14 - k, (60, 90, 40))
    ctiny(d, W // 2, 18, "THE DU", ink)
    ctiny(d, W // 2, 24, "LABRADOR", ink)
    ctiny(d, W // 2, 32, "CUEILLI", (110, 40, 30))
    return finish(im, 572, 10, 0.5)


def tag(a, b, seed):
    W, H = 30, 16
    im = fill_noise(W, H, (200, 176, 130), 0.12, seed, 2)
    d = ImageDraw.Draw(im)
    d.ellipse([2, 6, 5, 9], fill=(90, 70, 50))
    tiny(d, 8, 2, a, INK)
    tiny(d, 8, 9, b, DRED)
    return finish(im, seed + 1, 8, 0.3)


# ---------------------------------------------------------------------------------------------- surfaces
def swatch(base, var, seed, cell=2, k=8, w=32, h=32):
    return posterize(fill_noise(w, h, base, var, seed, cell), k)


def onion_skin():
    W = H = 32
    a = np.zeros((H, W, 3), np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    n = noise(W, H, 4, 601)
    a[:] = np.array([0.72, 0.46, 0.2]) * (0.8 + 0.35 * n[..., None])
    vein = (np.abs(np.sin(xx * 0.9 + n * 3)) > 0.93)
    a[vein] = np.array([0.5, 0.28, 0.12])
    a[(n > 0.75)] = np.array([0.86, 0.66, 0.36])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def potato_skin():
    W = H = 32
    n = noise(W, H, 4, 611) * 0.6 + rng(612).random((H, W)) * 0.4
    a = np.array([0.74, 0.6, 0.36])[None, None] * (0.8 + 0.35 * n[..., None])
    a[rng(613).random((H, W)) > 0.96] = np.array([0.45, 0.32, 0.18])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def carrot_tex():
    W = H = 32
    yy, xx = np.mgrid[0:H, 0:W]
    n = noise(W, H, 4, 621)
    a = np.array([0.9, 0.45, 0.1])[None, None] * (0.85 + 0.25 * n[..., None])
    a[(yy % 7) == 0] = np.array([0.7, 0.32, 0.08])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def leaf_tex():
    W = H = 32
    yy, xx = np.mgrid[0:H, 0:W]
    n = noise(W, H, 3, 631)
    a = np.array([0.28, 0.5, 0.2])[None, None] * (0.75 + 0.45 * n[..., None])
    a[(xx % 6) == 0] = np.array([0.2, 0.36, 0.14])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def garlic_tex():
    W = H = 32
    yy, xx = np.mgrid[0:H, 0:W]
    n = noise(W, H, 4, 641)
    a = np.array([0.92, 0.88, 0.82])[None, None] * (0.88 + 0.15 * n[..., None])
    st = (np.abs(np.sin(xx * 0.55 + n * 2)) > 0.9)
    a[st] = np.array([0.66, 0.46, 0.6])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def beef_tex():
    W = H = 32
    r = rng(651)
    n = noise(W, H, 2, 652)
    a = np.array([0.66, 0.16, 0.16])[None, None] * (0.75 + 0.5 * n[..., None])
    a[r.random((H, W)) > 0.82] = np.array([0.92, 0.8, 0.76])
    a[r.random((H, W)) > 0.9] = np.array([0.46, 0.1, 0.1])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def sausage_tex():
    W = H = 32
    n = noise(W, H, 3, 661)
    a = np.array([0.78, 0.5, 0.42])[None, None] * (0.85 + 0.25 * n[..., None])
    a[rng(662).random((H, W)) > 0.93] = np.array([0.95, 0.85, 0.8])
    return posterize(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)), 8)


def main():
    at = mp.Atlas("groceries", 1024)
    at.put("oil", label_oil())
    at.put("butter", label_butter())
    at.put("lard", label_lard())
    at.put("flour", label_flour())
    at.put("sugar", label_sugar())
    at.put("salt", label_salt())
    at.put("pepper", label_pepper())
    at.put("bpowder", label_bpowder())
    at.put("oats", label_oats())
    at.put("oats_lid", lid_oats())
    at.put("rice", label_pouch("RICE", "LONG GRAIN", "RIZ", (40, 110, 70), 493, art_rice))
    at.put("peas", label_pouch("SPLIT PEAS", "YELLOW", "POIS CASSES", (180, 120, 30), 494, art_peas))
    at.put("macaroni", label_macaroni())
    at.put("milk", label_milk())
    at.put("potatoes", label_potatoes())
    at.put("tomatoes", label_tomatoes())
    at.put("bouillon", label_bouillon())
    at.put("beef_sticker", sticker("BOEUF", "HACHE", DRED, 581))
    at.put("sausage_sticker", sticker("SAUCISSES", "PORC", (150, 70, 30), 582))
    at.put("cheese", label_cheese())
    at.put("tea", label_tea())
    at.put("labtea", label_labtea())
    at.put("onion_tag", tag("ONIONS", "OIGNONS", 591))
    sw = {
        "oil_body": oil_body(),
        "cap_red": swatch((190, 34, 30), 0.1, 701, 2, 6, 16, 16),
        "cap_white": swatch((236, 234, 226), 0.06, 702, 2, 6, 16, 16),
        "paper_white": swatch((238, 236, 228), 0.06, 703, 3, 6),
        "paper_blue": swatch((40, 80, 150), 0.08, 704, 3, 6),
        "paper_red": swatch((170, 46, 34), 0.08, 705, 3, 6),
        "paper_green": swatch((30, 80, 50), 0.08, 706, 3, 6),
        "paper_gold": swatch((214, 178, 70), 0.1, 707, 2, 6),
        "kraft": swatch((176, 142, 100), 0.2, 708, 3, 8, 64, 64),
        "foil": swatch((200, 196, 186), 0.18, 709, 1, 8),
        "foam": swatch((236, 236, 232), 0.04, 710, 3, 4, 16, 16),
        "tin": swatch((176, 178, 174), 0.12, 711, 2, 8),
        "onion_skin": onion_skin(),
        "onion_white": swatch((236, 232, 214), 0.08, 712, 3, 6),
        "potato_skin": potato_skin(),
        "carrot": carrot_tex(),
        "leaf": leaf_tex(),
        "garlic": garlic_tex(),
        "beef": beef_tex(),
        "sausage": sausage_tex(),
        "cheese_body": swatch((232, 150, 40), 0.1, 713, 3, 6),
        "wax_red": swatch((170, 24, 24), 0.08, 714, 3, 6, 16, 16),
        "tomato_red": swatch((170, 36, 26), 0.25, 715, 2, 8),
        "milk_white": swatch((246, 246, 242), 0.03, 716, 4, 4, 16, 16),
        "lard_white": swatch((244, 240, 230), 0.05, 717, 3, 4, 16, 16),
        "butter_yellow": swatch((246, 222, 130), 0.06, 718, 3, 6, 16, 16),
        "tea_leaf": swatch((70, 80, 50), 0.35, 719, 1, 8),
        "glass_jar": swatch((190, 204, 200), 0.06, 720, 3, 6),
        "bouillon_cube": swatch((150, 96, 40), 0.25, 721, 1, 6, 16, 16),
        "green_onion": swatch((236, 236, 220), 0.06, 722, 3, 6, 16, 16),
    }
    for k, v in sw.items():
        at.put(k, v)
    at.img.crop((0, 0, 1024, 512)).save(os.path.join(COOK, "groceries.png"), optimize=True)
    with open(os.path.join(COOK, "grocery_atlas.ts"), "w") as f:
        f.write("// generated by src/game/cooking/tools/make_groceries.py: pixel rectangles [x, y, w, h] in the 1024 x 512\n")
        f.write("// grocery labels atlas src/game/cooking/groceries.png. Do not edit by hand.\n")
        f.write(f"export const GROCERY_RECTS: Record<string, [number, number, number, number]> = {json.dumps(at.rects)};\n")
        f.write("export const GROCERY_W = 1024, GROCERY_H = 512;\n")
    print("groceries:", len(at.rects))


if __name__ == "__main__":
    main()
