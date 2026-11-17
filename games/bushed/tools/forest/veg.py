"""Ground-cover atlas (alpha-cut, high-resolution pixel art): grass blades, sword fern and bracken fronds, fireweed,
bunchberry, blueberry, juniper, alder, dead twigs, mushroom caps, bracket fungus, moss and lichen tufts, clubmoss.

    cd games/bushed && python3 tools/forest/veg.py

Sources (CC0, Poly Haven): fern_02 fronds, shrub_03 / shrub_04 leaves, fir_tree_01 sprigs; the rest is drawn.
Layout: 1024 x 768, a grid of 128 px units; rects (x, y, w, h in units, y down) are listed in UNITS below and
mirrored in src/world/veg/atlas.ts.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import ph  # noqa: E402
from foliage import (SS, Cell, Sprite, birch_cluster, clean_leaf, conifer_spray, dead_twigs, extract,  # noqa: E402
                     leaf_sprites, twig_col)
from pix import bleed, hsv_adjust, kmeans, quantize, save_rgba  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "assets", "textures", "veg")
U = 128

UNITS = {
    "grass_green": (0, 0, 1, 2), "grass_yellow": (1, 0, 1, 2), "grass_dry": (2, 0, 1, 2), "grass_sedge": (3, 0, 1, 2),
    "fern_a": (4, 0, 1, 4), "fern_b": (5, 0, 1, 4),
    "bracken": (6, 0, 2, 2), "fireweed": (6, 2, 1, 2), "bunch_flower": (7, 2, 1, 1), "bunch_berry": (7, 3, 1, 1),
    "blueberry_a": (0, 2, 2, 1), "blueberry_b": (2, 2, 2, 1), "juniper": (0, 3, 2, 1), "alder": (2, 3, 2, 1),
    "twig": (0, 4, 2, 1), "agaric": (2, 4, 1, 1), "chanterelle": (3, 4, 1, 1), "bracket": (4, 4, 1, 1),
    "clubmoss": (5, 4, 1, 1), "aster": (6, 4, 1, 1), "cone": (7, 4, 1, 1),
    "moss_tuft": (0, 5, 2, 1), "lichen": (2, 5, 2, 1), "litter": (4, 5, 2, 1), "needles": (6, 5, 2, 1),
}


def cell(size, seed):
    return Cell(seed, size)


def grass(seed, base, tip, n=5, width=1.0, curl=0.25):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(n):
        x0 = W * (i + 0.5) / n + rng.uniform(-6, 6) * SS
        ln = H * rng.uniform(0.82, 0.98)
        bend = rng.uniform(-curl, curl) * W
        w0 = (W / n) * 0.42 * width * rng.uniform(0.8, 1.1)
        pts_l, pts_r = [], []
        for k in range(25):
            t = k / 24
            x = x0 + bend * t * t
            y = H - 1 - t * ln
            w = w0 * (1 - t ** 1.6) * (0.75 + 0.25 * np.sin(t * 3))
            pts_l.append((x - w / 2, y))
            pts_r.append((x + w / 2, y))
        col_b = np.array(base) * rng.uniform(0.85, 1.1)
        col_t = np.array(tip) * rng.uniform(0.9, 1.1)
        # paint as stacked bands (gradient) then a darker midrib
        poly = pts_l + pts_r[::-1]
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon(poly, fill=255)
        grad = np.linspace(1, 0, H)[:, None]
        col = col_b[None, None] * grad[..., None] + col_t[None, None] * (1 - grad[..., None])
        streak = (np.sin(np.arange(W) / SS * 1.7 + rng.uniform(0, 6)) * 0.06)[None, :, None]
        col = np.clip(col * (1 + streak), 0, 1)
        layer = np.concatenate([np.broadcast_to(col, (H, W, 3)), (np.asarray(m)[..., None] / 255.0)], -1)
        c.im.alpha_composite(Image.fromarray((layer * 255).astype(np.uint8), "RGBA"))
        mid = [((pts_l[k][0] + pts_r[k][0]) / 2, pts_l[k][1]) for k in range(0, 24, 2)]
        c.dr.line(mid, fill=tuple(int(v * 200) for v in col_b) + (255,), width=max(1, int(w0 * 0.12)))
    return c.final()


def frond_cell(fern, seed, size=(U, 4 * U), tint=(1, 1, 1)):
    c = cell(size, seed)
    W, H = size[0] * SS, size[1] * SS
    spr = fern[seed % len(fern)]
    ln = min(H * 0.97, spr.length * (W * 0.96 / spr.im.width))
    c.paste(spr, (W / 2, H - 2), -np.pi / 2, ln, tint, fit=False)
    return c.final()


def bracken(fern, seed):
    """triangular, bipinnate bracken blade seen from above (rachis from the bottom centre to the top)"""
    c = cell((2 * U, 2 * U), seed)
    rng = c.rng
    W, H = 2 * U * SS, 2 * U * SS
    base, top = (W / 2, H - 4), (W / 2 + rng.uniform(-8, 8) * SS, 6 * SS)
    c.dr.line([base, top], fill=(110, 120, 50, 255), width=3 * SS // 2)
    n = 9
    for i in range(n):
        t = 0.08 + 0.86 * i / n
        p = (base[0] + (top[0] - base[0]) * t, base[1] + (top[1] - base[1]) * t)
        ln = W * 0.48 * (1 - t) ** 0.85
        for side in (-1, 1):
            a = -np.pi / 2 + side * rng.uniform(1.05, 1.3)
            spr = fern[rng.integers(0, len(fern))]
            c.paste(spr, p, a, ln, tuple(np.array([1.12, 1.15, 0.85]) * rng.uniform(0.9, 1.05)), flip=rng.random() < 0.5)
    c.paste(fern[0], top, -np.pi / 2, H * 0.14, (1.15, 1.2, 0.85))
    return c.final()


def fireweed(seed):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    x = W / 2
    stem = [(x + np.sin(t * 3) * 2 * SS, H - 1 - t * (H - 6)) for t in np.linspace(0, 1, 20)]
    c.line(stem, 2.2 * SS, 1.2 * SS, (120, 60, 70))
    # leaves: narrow lanceolate, alternate, on the lower 60 %
    for i in range(14):
        t = 0.05 + 0.55 * i / 14
        p = stem[int(t * 19)]
        side = 1 if i % 2 else -1
        ln = W * 0.42 * (1 - t * 0.6) * rng.uniform(0.8, 1.05)
        a = -np.pi / 2 + side * rng.uniform(0.7, 1.15)
        pts_l, pts_r = [], []
        for k in range(12):
            s = k / 11
            px, py = p[0] + np.cos(a) * ln * s, p[1] + np.sin(a) * ln * s + s * s * 6 * SS
            w = ln * 0.11 * np.sin(np.pi * min(1, s * 1.05))
            nx, ny = -np.sin(a), np.cos(a)
            pts_l.append((px + nx * w, py + ny * w))
            pts_r.append((px - nx * w, py - ny * w))
        g = np.array([0.28, 0.42, 0.18]) * rng.uniform(0.85, 1.15)
        c.dr.polygon(pts_l + pts_r[::-1], fill=tuple(int(v * 255) for v in g) + (255,))
        c.dr.line([pts_l[0], ((pts_l[-1][0] + pts_r[-1][0]) / 2, (pts_l[-1][1] + pts_r[-1][1]) / 2)], fill=(150, 90, 90, 255), width=SS // 2 + 1)
    # flowers: magenta 4-petal flowers on short pedicels, buds above
    for i in range(16):
        t = 0.6 + 0.4 * i / 16
        p = stem[min(19, int(t * 19))]
        side = 1 if i % 2 else -1
        q = (p[0] + side * rng.uniform(3, 9) * SS, p[1] + rng.uniform(-2, 2) * SS)
        if t < 0.9:
            r = rng.uniform(3.2, 4.5) * SS
            col = np.array([0.82, 0.25, 0.55]) * rng.uniform(0.85, 1.12)
            for k in range(4):
                a = k * np.pi / 2 + rng.uniform(0, 0.4)
                cx, cy = q[0] + np.cos(a) * r * 0.55, q[1] + np.sin(a) * r * 0.55
                c.dr.ellipse([cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55], fill=tuple(int(np.clip(v, 0, 1) * 255) for v in col) + (255,))
            c.dr.ellipse([q[0] - SS, q[1] - SS, q[0] + SS, q[1] + SS], fill=(240, 220, 235, 255))
            # seed pod below
            c.dr.line([p, (q[0], q[1] + 6 * SS)], fill=(140, 50, 70, 255), width=SS)
        else:
            r = rng.uniform(1.5, 2.5) * SS
            c.dr.ellipse([q[0] - r, q[1] - r * 1.4, q[0] + r, q[1] + r * 1.4], fill=(150, 40, 80, 255))
    return c.final()


def bunchberry(seed, berries=False):
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    cx = cy = W / 2
    n = rng.integers(5, 7)
    for i in range(n):
        a = i * 2 * np.pi / n + rng.uniform(-0.2, 0.2)
        ln = W * rng.uniform(0.36, 0.46)
        pts_l, pts_r = [], []
        for k in range(16):
            s = k / 15
            px, py = cx + np.cos(a) * ln * s, cy + np.sin(a) * ln * s
            w = ln * 0.28 * np.sin(np.pi * s ** 0.8)
            nx, ny = -np.sin(a), np.cos(a)
            pts_l.append((px + nx * w, py + ny * w))
            pts_r.append((px - nx * w, py - ny * w))
        g = np.array([0.24, 0.44, 0.16]) * rng.uniform(0.9, 1.15)
        c.dr.polygon(pts_l + pts_r[::-1], fill=tuple(int(v * 255) for v in g) + (255,))
        # arcuate veins
        for v in (-0.5, 0.5):
            vp = [(cx + np.cos(a) * ln * s - np.sin(a) * ln * 0.18 * v * np.sin(np.pi * s), cy + np.sin(a) * ln * s + np.cos(a) * ln * 0.18 * v * np.sin(np.pi * s)) for s in np.linspace(0.1, 0.9, 8)]
            c.dr.line(vp, fill=tuple(int(x * 255 * 0.75) for x in g) + (255,), width=SS // 2 + 1)
        c.dr.line([(cx, cy), (cx + np.cos(a) * ln * 0.9, cy + np.sin(a) * ln * 0.9)], fill=tuple(int(x * 255 * 1.2) for x in np.clip(g, 0, 0.8)) + (255,), width=SS // 2 + 1)
    if berries:
        for i in range(rng.integers(6, 10)):
            a, r = rng.uniform(0, 6.28), rng.uniform(0, W * 0.07)
            x, y = cx + np.cos(a) * r, cy + np.sin(a) * r
            rr = rng.uniform(2.6, 3.4) * SS
            c.dr.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(200, 30, 25, 255))
            c.dr.ellipse([x - rr * 0.3, y - rr * 0.5, x + rr * 0.1, y - rr * 0.1], fill=(250, 120, 100, 255))
    else:
        for k in range(4):
            a = k * np.pi / 2 + 0.4
            px, py = cx + np.cos(a) * W * 0.07, cy + np.sin(a) * W * 0.07
            c.dr.ellipse([px - W * 0.07, py - W * 0.05, px + W * 0.07, py + W * 0.05], fill=(240, 240, 228, 255))
        c.dr.ellipse([cx - W * 0.025, cy - W * 0.025, cx + W * 0.025, cy + W * 0.025], fill=(90, 110, 60, 255))
    return c.final()


def blueberry(leaves, seed, berries=5):
    c = cell((2 * U, U), seed)
    rng = c.rng
    W, H = 2 * U * SS, U * SS
    tips = []

    def br(p, a, ln, w, d):
        pts = c.curve(p, a, ln, rng.uniform(-0.6, 0.6), n=5)
        c.line(pts, w, w * 0.6, twig_col(rng, (110, 90, 50)))
        tips.extend(pts[1:])
        if d > 0:
            for k in range(2):
                i = rng.integers(1, len(pts) - 1)
                br(pts[i], a + rng.choice([-1, 1]) * rng.uniform(0.4, 0.9), ln * 0.6, w * 0.7, d - 1)

    br((0, H * 0.6), -0.15, W * 0.85, 3 * SS / 2, 2)
    order = rng.permutation(len(tips))
    for i in order[: int(len(tips) * 0.85)]:
        p = tips[i]
        a = rng.uniform(-np.pi, 0.4)
        c.paste(leaves[rng.integers(0, len(leaves))], p, a, H * rng.uniform(0.18, 0.26), tuple(np.array([0.95, 1.05, 0.9]) * rng.uniform(0.85, 1.1)), flip=rng.random() < 0.5)
    for i in order[:berries]:
        x, y = tips[i]
        r = rng.uniform(3.2, 4.2) * SS
        c.dr.ellipse([x - r, y - r, x + r, y + r], fill=(40, 52, 110, 255))
        c.dr.ellipse([x - r * 0.6, y - r * 0.7, x + r * 0.1, y - r * 0.1], fill=(110, 125, 170, 255))
        c.dr.ellipse([x - r * 0.25, y + r * 0.35, x + r * 0.25, y + r * 0.75], fill=(30, 30, 60, 255))
    return c.final()


def cap_texture(seed, kind):
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    a = np.zeros((W, W, 4), np.float32)
    yy, xx = np.mgrid[0:W, 0:W] / W
    if kind == "agaric":
        # v (rows): 0..0.7 cap top (centre -> rim), 0.7..1 gills (white); u = around
        top = yy < 0.7
        base = np.array([0.78, 0.09, 0.05]) * (1 - 0.25 * (yy / 0.7))[..., None] + np.array([0.1, 0.08, 0.0]) * (yy / 0.7)[..., None]
        col = np.where(top[..., None], base, np.array([0.93, 0.9, 0.82]) * (0.85 + 0.15 * np.sin(xx * 140)[..., None]))
        a[..., :3] = col
        a[..., 3] = 1
        img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
        d = ImageDraw.Draw(img)
        for i in range(70):
            x, y = rng.uniform(0, W), rng.uniform(0.05, 0.62) * W
            r = rng.uniform(1.2, 3.2) * SS * (0.6 + y / W)
            d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=(238, 232, 210, 255))
        return img.resize((U, U), Image.Resampling.BOX)
    if kind == "chanterelle":
        top = yy < 0.55
        col = np.where(top[..., None], np.array([0.93, 0.62, 0.12]) * (0.9 + 0.1 * np.sin(xx * 30 + yy * 9))[..., None],
                       np.array([0.95, 0.72, 0.28]) * (0.75 + 0.25 * (np.sin(xx * 220) > 0.3))[..., None])
        a[..., :3] = col
        a[..., 3] = 1
        return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA").resize((U, U), Image.Resampling.BOX)
    if kind == "bracket":
        bands = np.sin(yy * 50 + np.sin(xx * 12) * 1.5)
        col = np.array([0.42, 0.3, 0.2]) * (0.8 + 0.2 * bands)[..., None]
        rim = yy > 0.82
        col = np.where(rim[..., None], np.array([0.86, 0.8, 0.66]), col)
        under = yy > 0.92
        col = np.where(under[..., None], np.array([0.9, 0.86, 0.76]), col)
        a[..., :3] = col
        a[..., 3] = 1
        return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA").resize((U, U), Image.Resampling.BOX)
    if kind == "cone":
        # spruce cone scales: u around, v along
        sc = (np.sin(yy * 60 + (np.floor(xx * 8) % 2) * np.pi) > 0)
        col = np.array([0.42, 0.27, 0.16]) * (0.75 + 0.35 * sc)[..., None]
        a[..., :3] = col
        a[..., 3] = 1
        return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA").resize((U, U), Image.Resampling.BOX)
    raise ValueError(kind)


def tufts(seed, kind):
    """moss cushion (feather/stair-step moss stars) or reindeer lichen (pale branching cushions)"""
    c = cell((2 * U, U), seed)
    rng = c.rng
    W, H = 2 * U * SS, U * SS
    for i in range(900 if kind == "moss" else 420):
        x = rng.uniform(0.03, 0.97) * W
        # cushion profile: denser in the middle, rounded top
        prof = np.sin(np.pi * x / W) ** 0.6
        y = H - rng.uniform(0, prof * H * 0.92)
        if kind == "moss":
            g = np.array([0.32, 0.5, 0.12]) * rng.uniform(0.7, 1.2) * (0.7 + 0.4 * (1 - y / H))
            l = rng.uniform(3, 7) * SS
            for k in range(rng.integers(3, 6)):
                a = -np.pi / 2 + rng.uniform(-1.2, 1.2)
                c.dr.line([(x, y), (x + np.cos(a) * l, y + np.sin(a) * l)], fill=tuple(int(np.clip(v, 0, 1) * 255) for v in g) + (255,), width=SS)
        else:
            g = np.array([0.78, 0.8, 0.7]) * rng.uniform(0.8, 1.08) * (0.75 + 0.3 * (1 - y / H))
            l = rng.uniform(4, 9) * SS
            px, py = x, y
            for k in range(4):
                a = -np.pi / 2 + rng.uniform(-0.9, 0.9)
                qx, qy = px + np.cos(a) * l, py + np.sin(a) * l
                c.dr.line([(px, py), (qx, qy)], fill=tuple(int(np.clip(v, 0, 1) * 255) for v in g) + (255,), width=SS + SS // 2)
                px, py, l = qx, qy, l * 0.7
    return c.final()


def clubmoss(seed):
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    for i in range(7):
        x = W * (0.1 + 0.8 * i / 6) + rng.uniform(-4, 4) * SS
        h = W * rng.uniform(0.55, 0.95)
        for k in range(int(h / SS / 1.5)):
            y = W - k * SS * 1.5
            w = SS * (2.4 - 1.2 * k * SS * 1.5 / h)
            g = np.array([0.24, 0.44, 0.16]) * rng.uniform(0.8, 1.2)
            c.dr.line([(x - w, y - SS), (x + w, y + SS)], fill=tuple(int(v * 255) for v in g) + (255,), width=SS)
            c.dr.line([(x + w, y - SS), (x - w, y + SS)], fill=tuple(int(v * 255 * 0.85) for v in g) + (255,), width=SS)
    return c.final()


def aster(seed):
    """a small woodland aster / twinflower clump (pale violet flowers on thin stems)"""
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    for i in range(6):
        x0 = W * rng.uniform(0.2, 0.8)
        top = (x0 + rng.uniform(-10, 10) * SS, W * rng.uniform(0.15, 0.45))
        c.line([(x0, W - 1), top], 1.5 * SS, SS, (80, 100, 50))
        for k in range(3):
            q = ((x0 + top[0]) / 2 + rng.uniform(-8, 8) * SS, W * rng.uniform(0.5, 0.85))
            c.dr.ellipse([q[0] - 4 * SS, q[1] - 1.6 * SS, q[0] + 4 * SS, q[1] + 1.6 * SS], fill=(70, 110, 45, 255))
        r = 4.5 * SS
        for k in range(10):
            a = k * 2 * np.pi / 10
            c.dr.line([top, (top[0] + np.cos(a) * r, top[1] + np.sin(a) * r)], fill=(190, 170, 225, 255), width=SS + SS // 2)
        c.dr.ellipse([top[0] - 1.6 * SS, top[1] - 1.6 * SS, top[0] + 1.6 * SS, top[1] + 1.6 * SS], fill=(235, 200, 60, 255))
    return c.final()


def litter(seed, kind):
    """loose litter card (birch leaves / conifer needles lying flat), used as ground decals"""
    c = cell((2 * U, U), seed)
    rng = c.rng
    W, H = 2 * U * SS, U * SS
    if kind == "needles":
        for i in range(1400):
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            prof = np.sin(np.pi * x / W) * np.sin(np.pi * y / H)
            if rng.random() > prof ** 0.6:
                continue
            a, l = rng.uniform(0, np.pi), rng.uniform(4, 9) * SS
            col = np.array([0.55, 0.36, 0.2]) * rng.uniform(0.6, 1.25)
            c.dr.line([(x, y), (x + np.cos(a) * l, y + np.sin(a) * l)], fill=tuple(int(np.clip(v, 0, 1) * 255) for v in col) + (255,), width=SS)
    else:
        for i in range(70):
            x, y = rng.uniform(0.08, 0.92) * W, rng.uniform(0.12, 0.88) * H
            a = rng.uniform(0, 6.28)
            l = rng.uniform(8, 13) * SS
            col = np.array(rng.choice([[0.85, 0.7, 0.25], [0.7, 0.45, 0.18], [0.55, 0.42, 0.25], [0.8, 0.6, 0.2]])) * rng.uniform(0.75, 1.1)
            pts = []
            for k in range(14):
                t = k / 13 * 2 * np.pi
                rr = l * (0.5 + 0.5 * np.cos(t / 2) ** 2) * 0.5
                pts.append((x + np.cos(t + a) * rr, y + np.sin(t + a) * rr * 0.7))
            c.dr.polygon(pts, fill=tuple(int(np.clip(v, 0, 1) * 255) for v in col) + (255,))
    return c.final()


def main():
    os.makedirs(OUT, exist_ok=True)
    ferns = extract(ph.fetch("fern_02", "diff"), ph.fetch("fern_02", "Alpha"), (0.0, 0.0, 1.0, 1.0), min_area=200)
    ferns = sorted([f for f in ferns if f.length > 300], key=lambda s: -s.length)
    print("fern fronds", len(ferns), [f.length for f in ferns])
    small = extract(ph.fetch("shrub_04", "diff"), ph.fetch("shrub_04", "Alpha"), (0.0, 0.0, 0.62, 1.0), min_area=100)
    small = [clean_leaf(s, 0.85) for s in small if s.length > 60]
    small = [s for s in small if s is not None and s.length > 50]
    small_leaves = leaf_sprites(max(small, key=lambda s: s.length), 8, seed=9, shape="oval") if small else []
    round_src = extract(ph.fetch("shrub_03", "diff"), ph.fetch("shrub_03", "Alpha"), (0.0, 0.0, 0.85, 0.85), min_area=150)
    round_src = [clean_leaf(s, 0.8) for s in round_src if s.length > 150]
    round_src = [s for s in round_src if s is not None]
    round_leaves = leaf_sprites(max(round_src, key=lambda s: s.length), 8, seed=4, shape="oval")
    fir_spr = extract(ph.fetch("fir_tree_01", "twig_diff"), ph.fetch("fir_tree_01", "twig_alpha"), (0.17, 0.0, 1.0, 0.82))
    fir_spr = [s for s in fir_spr if s.length > 60 and np.asarray(s.im)[..., 1][np.asarray(s.im)[..., 3] > 128].mean() > np.asarray(s.im)[..., 0][np.asarray(s.im)[..., 3] > 128].mean() * 1.08]
    print("small leaves", len(small_leaves), "round leaves", len(round_leaves), "fir", len(fir_spr))

    cells = {
        "grass_green": grass(1, (0.18, 0.32, 0.1), (0.46, 0.62, 0.22)),
        "grass_yellow": grass(2, (0.3, 0.38, 0.12), (0.68, 0.7, 0.32)),
        "grass_dry": grass(3, (0.42, 0.38, 0.22), (0.78, 0.7, 0.48)),
        "grass_sedge": grass(4, (0.16, 0.26, 0.1), (0.36, 0.48, 0.2), n=3, width=1.4, curl=0.35),
        "fern_a": frond_cell(ferns, 0), "fern_b": frond_cell(ferns, 1, tint=(1.05, 1.05, 0.95)),
        "bracken": bracken(ferns, 5),
        "fireweed": fireweed(6),
        "bunch_flower": bunchberry(7), "bunch_berry": bunchberry(8, berries=True),
        "blueberry_a": blueberry(small_leaves, 9, 6), "blueberry_b": blueberry(small_leaves, 10, 2),
        "juniper": conifer_spray(fir_spr, 11, "dense", (0.85, 0.95, 1.05)),
        "alder": birch_cluster(round_leaves, 12, 18, (0.92, 1.0, 0.85), twig=(70, 55, 50)),
        "twig": dead_twigs(13, col=(105, 92, 80)),
        "agaric": cap_texture(14, "agaric"), "chanterelle": cap_texture(15, "chanterelle"), "bracket": cap_texture(16, "bracket"),
        "clubmoss": clubmoss(17), "aster": aster(18), "cone": cap_texture(19, "cone"),
        "moss_tuft": tufts(20, "moss"), "lichen": tufts(21, "lichen"),
        "litter": litter(22, "leaves"), "needles": litter(23, "needles"),
    }
    atlas = Image.new("RGBA", (8 * U, 6 * U), (0, 0, 0, 0))
    for k, im in cells.items():
        x, y, w, h = UNITS[k]
        if im.size != (w * U, h * U):
            im = im.resize((w * U, h * U), Image.Resampling.BOX)
        atlas.alpha_composite(im, (x * U, y * U))
    a = np.asarray(atlas).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    rgb = hsv_adjust(rgb, 0.0, 1.05, 1.08)
    hard = (alpha > 0.42).astype(np.float32)
    pal = kmeans(rgb[hard > 0].reshape(-1, 3), 64, seed=3)
    q, _ = quantize(rgb, pal)
    q = bleed(q, hard)
    save_rgba(os.path.join(OUT, "veg_atlas.png"), q, hard)
    print("wrote veg_atlas.png")


if __name__ == "__main__":
    main()
