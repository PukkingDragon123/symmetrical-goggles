# The insect atlas: 4 x 4 cells of 256 px, every insect seen from above with its body up the cell (head at the top),
# its wings left and right of the midline (the game's wing-beat shader folds the two halves about the body).
#   real models (bug_views.py renders of Sketchfab CC-BY models, flat-lit from their own textures):
#     0 monarch, 1 Canadian tiger swallowtail, 2 peppered moth, 3 blue darner, 4 honey bee, 5 ant, 6 ground beetle
#   drawn here: 7 firefly (the beetle recoloured: black, the rosy pronotum with its black spot, the pale lantern),
#     8 mosquito, 9 midge, 10 orb-weaver spider, 11 glow (a soft light), 12 dew drop
# python3 bugs_atlas.py <views dir> <out.png>
import sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

VIEWS, OUT = sys.argv[1], sys.argv[2]
C = 256
atlas = Image.new('RGBA', (C * 4, C * 4), (0, 0, 0, 0))


def cell(i):
    return ((i % 4) * C, (i // 4) * C)


def fit(im, pad=6):
    """crop to the alpha's bounds and scale into the cell, keeping the aspect"""
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    k = (C - pad * 2) / max(im.size)
    im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (C, C), (0, 0, 0, 0))
    out.alpha_composite(im, ((C - im.width) // 2, (C - im.height) // 2))
    return out


def view(name, rot):
    im = Image.open(f'{VIEWS}/{name}_top.png').convert('RGBA')
    return fit(im.rotate(rot, expand=True, resample=Image.BICUBIC))


REAL = [('monarch', 90), ('swallowtail', 0), ('moth', 0), ('darner', 90), ('bee', 180), ('ant', -90), ('carabus', -90)]
cells = {}
for i, (n, r) in enumerate(REAL):
    cells[i] = view(n, r)

# 7 firefly: the beetle's form, recoloured (a Photinus: black wing covers with pale edges, the rosy-yellow shield over
# the head with a black spot, and the cream lantern segments at the tail)
b = np.asarray(cells[6]).astype(np.float32) / 255
lum = b[..., :3].mean(-1, keepdims=True)
ys = np.linspace(0, 1, C)[:, None, None]
col = np.where(ys < 0.33, np.array([0.85, 0.55, 0.45]), np.array([0.09, 0.08, 0.07])) * (0.55 + lum)
spot = (np.abs(ys - 0.24) < 0.04) & (np.abs(np.linspace(-1, 1, C)[None, :, None]) < 0.06)
col = np.where(spot, np.array([0.05, 0.04, 0.04]), col)
col = np.where((ys > 0.6) & (ys < 0.78), np.array([0.95, 0.92, 0.65]) * (0.7 + lum * 0.6), col)
ff = np.concatenate([np.clip(col, 0, 1), b[..., 3:]], -1)
# slimmer than a ground beetle
ffi = Image.fromarray((ff * 255).astype(np.uint8), 'RGBA')
ffi = ffi.resize((int(C * 0.62), C), Image.LANCZOS)
cells[7] = fit(ffi)


def drawn(fn, scale=4):
    big = Image.new('RGBA', (C * scale, C * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    fn(d, C * scale)
    return big.resize((C, C), Image.LANCZOS)


def mosquito(d, S, midge=False):
    cx = S / 2
    k = S / 256
    leg = (25, 22, 20, 255)
    # legs: long, thin, bent (six), the hind pair trailing
    for sg in (-1, 1):
        for (ax, ay, bx, by, ex, ey) in ((10, 96, 42, 70, 70, 40), (12, 108, 50, 120, 88, 112), (10, 118, 40, 160, 66, 236)):
            if midge:
                ax, ay, bx, by, ex, ey = ax, ay, bx * 0.7, by, ex * 0.6, ey * 0.8 + 20
            d.line([(cx + sg * ax * k, ay * k), (cx + sg * bx * k, by * k), (cx + sg * ex * k, ey * k)], fill=leg, width=int(2.2 * k))
    # wings: narrow, clear, veined, held back over the abdomen
    for sg in (-1, 1):
        w = [(cx + sg * 8 * k, 100 * k), (cx + sg * (40 if not midge else 46) * k, 150 * k), (cx + sg * (34 if not midge else 40) * k, 196 * k), (cx + sg * 10 * k, 140 * k)]
        d.polygon(w, fill=(200, 205, 210, 90), outline=(70, 70, 75, 200))
        d.line([w[0], w[2]], fill=(70, 70, 75, 160), width=int(1.4 * k))
    # body: head with the proboscis (mosquito) or plumed antennae (midge), humped thorax, long striped abdomen
    if not midge:
        d.line([(cx, 64 * k), (cx, 20 * k)], fill=(30, 25, 22, 255), width=int(2.5 * k))
        for sg in (-1, 1): d.line([(cx, 70 * k), (cx + sg * 12 * k, 40 * k)], fill=(40, 35, 30, 230), width=int(2 * k))
    else:
        for sg in (-1, 1):
            d.line([(cx, 70 * k), (cx + sg * 22 * k, 36 * k)], fill=(50, 45, 40, 230), width=int(2 * k))
            for i in range(6):
                t = 0.3 + i * 0.11; px, py = cx + sg * 22 * k * t, 70 * k - 34 * k * t
                d.line([(px, py), (px + sg * 8 * k, py - 4 * k)], fill=(70, 65, 60, 160), width=int(1 * k))
    d.ellipse([cx - 9 * k, 62 * k, cx + 9 * k, 80 * k], fill=(35, 30, 26, 255))
    d.ellipse([cx - 14 * k, 78 * k, cx + 14 * k, 118 * k], fill=(55, 45, 38, 255))
    for i in range(7):
        y0 = (116 + i * 13) * k; w = (11 - i * 0.8) * k
        d.ellipse([cx - w, y0, cx + w, y0 + 15 * k], fill=(48, 40, 34, 255) if i % 2 else (120, 110, 95, 255))


def spider(d, S):
    cx, k = S / 2, S / 256
    leg = (30, 24, 18, 255)
    for sg in (-1, 1):
        for (ay, bx, by, ex, ey) in ((92, 60, 50, 92, 10), (100, 74, 84, 118, 66), (110, 72, 132, 116, 176), (118, 58, 156, 84, 240)):
            d.line([(cx + sg * 14 * k, ay * k), (cx + sg * bx * k, by * k), (cx + sg * ex * k, ey * k)], fill=leg, width=int(4 * k))
    d.ellipse([cx - 22 * k, 76 * k, cx + 22 * k, 128 * k], fill=(70, 50, 30, 255))
    d.ellipse([cx - 40 * k, 120 * k, cx + 40 * k, 214 * k], fill=(120, 85, 45, 255))
    # the orb-weaver's leaf mark and spots
    d.polygon([(cx, 128 * k), (cx + 26 * k, 160 * k), (cx + 14 * k, 200 * k), (cx, 210 * k), (cx - 14 * k, 200 * k), (cx - 26 * k, 160 * k)], fill=(165, 130, 80, 255))
    for i in range(4):
        y = (140 + i * 16) * k
        for sg in (-1, 1): d.ellipse([cx + sg * 16 * k - 4 * k, y, cx + sg * 16 * k + 4 * k, y + 8 * k], fill=(240, 235, 220, 255))


def glow(d, S):
    for i in range(60, 0, -1):
        r = S / 2 * i / 60; a = int(255 * (1 - i / 60) ** 2.2)
        d.ellipse([S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r], fill=(255, 255, 255, a))


def dew(d, S):
    r = S * 0.42
    d.ellipse([S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r], fill=(200, 215, 225, 120), outline=(255, 255, 255, 200), width=int(S * 0.02))
    r2 = S * 0.12
    d.ellipse([S * 0.36 - r2, S * 0.34 - r2, S * 0.36 + r2, S * 0.34 + r2], fill=(255, 255, 255, 255))


cells[8] = drawn(lambda d, S: mosquito(d, S))
cells[9] = drawn(lambda d, S: mosquito(d, S, midge=True))
cells[10] = drawn(spider)
cells[11] = drawn(glow, 2).filter(ImageFilter.GaussianBlur(3))
cells[12] = drawn(dew)
for i, im in cells.items():
    atlas.alpha_composite(im, cell(i))
# bleed colour into transparent texels so filtering never pulls in black fringes
a = np.asarray(atlas).astype(np.float32)
rgb, al = a[..., :3], a[..., 3:]
m = al[..., 0] > 8
for _ in range(8):
    acc = np.zeros_like(rgb); cnt = np.zeros(m.shape)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = np.roll(np.roll(rgb, dy, 0), dx, 1); sm = np.roll(np.roll(m, dy, 0), dx, 1)
        acc[sm] += sh[sm]; cnt[sm] += 1
    g = (~m) & (cnt > 0)
    rgb[g] = acc[g] / cnt[g][:, None]
    m = m | g
out = np.concatenate([rgb, al], -1).astype(np.uint8)
Image.fromarray(out, 'RGBA').save(OUT, optimize=True)
print('[bugs_atlas]', OUT)
