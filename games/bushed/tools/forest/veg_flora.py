"""Second page of the ground-cover atlas (rows 6..11 of veg_atlas.png): meadow grasses and seed heads, roadside and
clearing wildflowers (goldenrod, pearly everlasting, purple aster, oxeye daisy, yarrow, orange hawkweed, tufted
vetch), understorey shrubs (raspberry cane, Labrador tea, wild sarsaparilla, ostrich fern), the lake shore (cattail
leaves and spikes, reeds, lily pads, white water lily) and more mushrooms and litter. All drawn procedurally at 4x and
box-filtered down, except the fern / leaf sprites, which come from the CC0 Poly Haven scans that veg.py extracts.

Imported by veg.py (`python3 tools/forest/veg.py` writes the whole atlas).
"""
import numpy as np
from PIL import Image, ImageDraw

from foliage import SS, Cell

U = 128


def c255(c, a=255):
    return tuple(int(np.clip(v, 0, 1) * 255) for v in c) + (a,)


def cell(size, seed):
    return Cell(seed, size)


def jit(rng, c, k=0.12):
    return np.clip(np.array(c) * rng.uniform(1 - k, 1 + k), 0, 1)


def blade(c, pts_c, w0, col_b, col_t, w1=0.0, midrib=0.75):
    """a tapered blade along a centreline (list of (x, y)); colour graded base -> tip with a darker midrib"""
    n = len(pts_c)
    left, right = [], []
    for k in range(n):
        t = k / (n - 1)
        a = pts_c[min(n - 1, k + 1)]
        b = pts_c[max(0, k - 1)]
        dx, dy = a[0] - b[0], a[1] - b[1]
        L = max(1e-6, np.hypot(dx, dy))
        nx, ny = -dy / L, dx / L
        w = (w0 * (1 - t ** 1.5) + w1 * t) / 2
        left.append((pts_c[k][0] + nx * w, pts_c[k][1] + ny * w))
        right.append((pts_c[k][0] - nx * w, pts_c[k][1] - ny * w))
    # draw as quads so the colour can grade along the blade
    for k in range(n - 1):
        t = (k + 0.5) / (n - 1)
        col = np.array(col_b) * (1 - t) + np.array(col_t) * t
        c.dr.polygon([left[k], left[k + 1], right[k + 1], right[k]], fill=c255(col))
    if midrib and w0 > 2.5 * SS:
        mid = [pts_c[k] for k in range(0, n - 1)]
        c.dr.line(mid, fill=c255(np.array(col_b) * midrib), width=max(1, int(w0 * 0.12)))


def arc(p0, ang, ln, bend, n=12):
    pts = []
    x, y = p0
    a = ang
    for i in range(n + 1):
        pts.append((x, y))
        x += np.cos(a) * ln / n
        y += np.sin(a) * ln / n
        a += bend / n
    return pts


def dot(c, x, y, r, col, ry=None):
    ry = r if ry is None else ry
    c.dr.ellipse([x - r, y - ry, x + r, y + ry], fill=c255(col) if len(col) == 3 else col)


# ------------------------------------------------------------------------------------------------ grasses
def seedhead(seed, kind):
    """1 x 2 card: a few flowering culms with seed heads (timothy spikes, bluejoint panicles, wavy hair-grass)"""
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    n = {"timothy": 4, "bluejoint": 3, "hair": 6}[kind]
    for i in range(n):
        x0 = W * (0.18 + 0.64 * (i + rng.uniform(0.2, 0.8)) / n)
        ln = H * rng.uniform(0.7, 0.97)
        bend = rng.uniform(-0.35, 0.35) * (1.6 if kind == "bluejoint" else 1)
        stem = arc((x0, H - 1), -np.pi / 2 + rng.uniform(-0.12, 0.12), ln, bend, 20)
        sc = jit(rng, {"timothy": (0.52, 0.6, 0.3), "bluejoint": (0.5, 0.52, 0.3), "hair": (0.62, 0.55, 0.42)}[kind])
        c.line(stem, 1.3 * SS, 0.8 * SS, tuple(v * 255 for v in sc))
        # a leaf or two on the culm
        for k in range(rng.integers(1, 3)):
            j = rng.integers(3, 9)
            p = stem[j]
            side = rng.choice([-1, 1])
            lp = arc(p, -np.pi / 2 + side * rng.uniform(0.35, 0.8), H * rng.uniform(0.12, 0.22), side * rng.uniform(0.5, 1.2), 8)
            blade(c, lp, 2.4 * SS, sc * 0.85, sc * 1.15, midrib=0)
        top = stem[-1]
        if kind == "timothy":
            # dense cylindrical spike on the top 18 % of the culm
            hl = int(len(stem) * 0.2)
            for j in range(len(stem) - hl, len(stem)):
                x, y = stem[j]
                for k in range(5):
                    col = jit(rng, (0.66, 0.68, 0.42), 0.15) if rng.random() > 0.2 else (0.55, 0.45, 0.5)
                    dot(c, x + rng.uniform(-2.6, 2.6) * SS, y + rng.uniform(-3, 3) * SS, 1.3 * SS, col)
        elif kind == "bluejoint":
            # loose nodding panicle, purple-bronze
            for k in range(26):
                t = rng.uniform(0.0, 1.0)
                j = len(stem) - 1 - int(t * len(stem) * 0.32)
                x, y = stem[j]
                a = -np.pi / 2 + rng.uniform(-0.9, 0.9) + bend * 0.6
                l = rng.uniform(4, 12) * SS * (1 - t * 0.4)
                ex, ey = x + np.cos(a) * l, y + np.sin(a) * l * 0.6 + l * 0.4
                col = jit(rng, rng.choice([(0.55, 0.38, 0.45), (0.7, 0.6, 0.45), (0.5, 0.45, 0.32)]), 0.12)
                c.dr.line([(x, y), (ex, ey)], fill=c255(col), width=SS)
                for m in range(3):
                    s = rng.uniform(0.4, 1)
                    dot(c, x + (ex - x) * s, y + (ey - y) * s, 1.0 * SS, col * 1.1, 1.6 * SS)
        else:
            # wavy hair-grass: fine zigzag branches with shiny silvery-purple spikelets
            for k in range(14):
                t = rng.uniform(0, 1)
                j = len(stem) - 1 - int(t * len(stem) * 0.3)
                x, y = stem[j]
                a = -np.pi / 2 + rng.choice([-1, 1]) * rng.uniform(0.5, 1.2)
                pts = [(x, y)]
                for m in range(3):
                    a += rng.uniform(-0.7, 0.7)
                    l = rng.uniform(3, 6) * SS
                    x, y = x + np.cos(a) * l, y + np.sin(a) * l
                    pts.append((x, y))
                col = jit(rng, (0.72, 0.62, 0.6), 0.12)
                c.dr.line(pts, fill=c255(col * 0.8), width=max(1, SS // 2 + 1))
                dot(c, x, y, 1.1 * SS, col * 1.15, 1.8 * SS)
        dot(c, top[0], top[1], 0.8 * SS, sc)
    return c.final()


def thatch(seed):
    """1 x 2: last year's dead grass, flopped and tangled, with a few green shoots coming through"""
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(16):
        x0 = W * rng.uniform(0.1, 0.9)
        ln = H * rng.uniform(0.35, 0.85)
        bend = rng.choice([-1, 1]) * rng.uniform(0.6, 2.2)
        pts = arc((x0, H - 1), -np.pi / 2 + rng.uniform(-0.25, 0.25), ln, bend, 14)
        pts = [(min(W - 2, max(2, x)), max(2, y)) for x, y in pts]
        dead = rng.random() < 0.75
        cb = jit(rng, (0.5, 0.43, 0.3) if dead else (0.22, 0.34, 0.12), 0.15)
        ct = jit(rng, (0.82, 0.74, 0.55) if dead else (0.5, 0.62, 0.24), 0.1)
        blade(c, pts, rng.uniform(3, 5.5) * SS, cb, ct, midrib=0.8)
    return c.final()


# ------------------------------------------------------------------------------------------------ wildflowers
def leafy_stem(c, rng, x0, H, ln, leaf_col, stem_col, n_leaves=8, leaf_len=0.16, leaf_w=0.22, lean=0.12, top_frac=0.75):
    W = c.im.width
    stem = arc((x0, H - 1), -np.pi / 2 + rng.uniform(-lean, lean), ln, rng.uniform(-0.25, 0.25), 18)
    c.line(stem, 2.0 * SS, 1.2 * SS, tuple(v * 255 for v in stem_col))
    for k in range(n_leaves):
        t = 0.06 + top_frac * k / n_leaves
        p = stem[int(t * (len(stem) - 1))]
        side = 1 if k % 2 else -1
        L = W * leaf_len * 2 * (1 - t * 0.5) * rng.uniform(0.8, 1.1)
        lp = arc(p, -np.pi / 2 + side * rng.uniform(0.7, 1.2), L, side * rng.uniform(0.3, 0.9), 8)
        blade(c, lp, L * leaf_w, jit(rng, leaf_col) * 0.85, jit(rng, leaf_col) * 1.1, midrib=0.75)
    return stem


def goldenrod(seed):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(3):
        x0 = W * (0.25 + 0.25 * i) + rng.uniform(-6, 6) * SS
        stem = leafy_stem(c, rng, x0, H, H * rng.uniform(0.72, 0.96), (0.3, 0.45, 0.16), (0.38, 0.42, 0.2), n_leaves=12, leaf_len=0.17, leaf_w=0.2, top_frac=0.62)
        # one-sided arching plume branches, packed with tiny yellow heads
        top = len(stem) - 1
        for b in range(9):
            j = top - int(b * len(stem) * 0.03)
            x, y = stem[j]
            side = rng.choice([-1, 1]) if b > 1 else 0
            ang = -np.pi / 2 + side * rng.uniform(0.6, 1.1)
            br = arc((x, y), ang, rng.uniform(8, 18) * SS * (1 - b * 0.04), side * 1.4, 7)
            c.line(br, 1.2 * SS, 0.8 * SS, (110, 120, 50))
            for (bx, by) in br[1:]:
                for k in range(3):
                    col = jit(rng, rng.choice([(0.95, 0.78, 0.12), (0.88, 0.66, 0.08), (1.0, 0.86, 0.3)]), 0.08)
                    dot(c, bx + rng.uniform(-2, 2) * SS, by - rng.uniform(0, 3) * SS, 1.4 * SS, col)
    return c.final()


def everlasting(seed):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(4):
        x0 = W * (0.2 + 0.2 * i) + rng.uniform(-6, 6) * SS
        ln = H * rng.uniform(0.45, 0.7)
        stem = leafy_stem(c, rng, x0, H, ln, (0.55, 0.62, 0.48), (0.62, 0.66, 0.56), n_leaves=10, leaf_len=0.11, leaf_w=0.16, top_frac=0.8)
        tx, ty = stem[-1]
        # flat-topped corymb of pearly white papery heads with yellow-brown centres
        for k in range(rng.integers(6, 10)):
            a = rng.uniform(-np.pi, 0)
            r = rng.uniform(2, 11) * SS
            hx, hy = tx + np.cos(a) * r, ty + np.sin(a) * r * 0.45 - 2 * SS
            c.dr.line([(tx, ty), (hx, hy)], fill=(150, 160, 140, 255), width=SS)
            rr = rng.uniform(2.6, 3.4) * SS
            dot(c, hx, hy, rr, jit(rng, (0.93, 0.92, 0.86), 0.05))
            dot(c, hx, hy - rr * 0.1, rr * 0.4, (0.72, 0.62, 0.3))
    return c.final()


def rayed(c, rng, x, y, r, ray_col, disc_col, n=14, tilt=0.55):
    for k in range(n):
        a = k * 2 * np.pi / n + rng.uniform(-0.1, 0.1)
        ex, ey = x + np.cos(a) * r, y + np.sin(a) * r * tilt
        c.dr.line([(x, y), (ex, ey)], fill=c255(jit(rng, ray_col, 0.06)), width=max(1, int(r * 0.32)))
    dot(c, x, y, r * 0.32, disc_col, r * 0.32 * tilt * 1.3)


def aster_purple(seed):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(3):
        x0 = W * (0.25 + 0.25 * i) + rng.uniform(-5, 5) * SS
        stem = leafy_stem(c, rng, x0, H, H * rng.uniform(0.55, 0.8), (0.26, 0.4, 0.17), (0.4, 0.3, 0.3), n_leaves=8, leaf_len=0.15, leaf_w=0.25, top_frac=0.6)
        top = len(stem) - 1
        for b in range(rng.integers(4, 7)):
            j = top - rng.integers(0, 5)
            x, y = stem[j]
            ang = -np.pi / 2 + rng.uniform(-1.0, 1.0)
            l = rng.uniform(6, 16) * SS
            ex, ey = x + np.cos(ang) * l, y + np.sin(ang) * l
            c.dr.line([(x, y), (ex, ey)], fill=(90, 90, 60, 255), width=SS)
            rayed(c, rng, ex, ey, rng.uniform(4.5, 6.5) * SS, rng.choice([(0.55, 0.42, 0.85), (0.62, 0.5, 0.9), (0.48, 0.36, 0.78)]), (0.95, 0.75, 0.15), n=18)
    return c.final()


def daisy(seed):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    # basal rosette of dark spoon leaves
    for k in range(9):
        a = -np.pi / 2 + rng.uniform(-1.4, 1.4)
        lp = arc((W / 2 + rng.uniform(-10, 10) * SS, H - 1), a, H * rng.uniform(0.08, 0.14), rng.uniform(-0.6, 0.6), 6)
        blade(c, lp, 5 * SS, (0.16, 0.3, 0.1), (0.25, 0.42, 0.14), w1=3 * SS)
    for i in range(5):
        x0 = W * (0.16 + 0.17 * i) + rng.uniform(-5, 5) * SS
        ln = H * rng.uniform(0.45, 0.88)
        stem = arc((x0, H - 1), -np.pi / 2 + rng.uniform(-0.15, 0.15), ln, rng.uniform(-0.3, 0.3), 16)
        c.line(stem, 1.6 * SS, 1.0 * SS, (80, 110, 50))
        for k in range(3):
            p = stem[2 + k * 2]
            side = rng.choice([-1, 1])
            blade(c, arc(p, -np.pi / 2 + side * 0.9, 9 * SS, side * 0.5, 5), 3 * SS, (0.2, 0.36, 0.12), (0.28, 0.45, 0.16), midrib=0)
        x, y = stem[-1]
        rayed(c, rng, x, y, rng.uniform(9, 12) * SS, (0.97, 0.97, 0.93), (0.98, 0.8, 0.1), n=22, tilt=rng.uniform(0.45, 0.8))
    return c.final()


def yarrow(seed):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(3):
        x0 = W * (0.25 + 0.25 * i) + rng.uniform(-5, 5) * SS
        stem = arc((x0, H - 1), -np.pi / 2 + rng.uniform(-0.12, 0.12), H * rng.uniform(0.5, 0.78), rng.uniform(-0.2, 0.2), 16)
        c.line(stem, 1.8 * SS, 1.2 * SS, (100, 115, 70))
        # feathery fern-like leaves: a rachis with tiny pinnae
        for k in range(5):
            p = stem[1 + k * 2]
            side = 1 if k % 2 else -1
            lp = arc(p, -np.pi / 2 + side * rng.uniform(0.6, 1.0), rng.uniform(10, 18) * SS, side * 0.4, 8)
            c.dr.line(lp, fill=(70, 100, 50, 255), width=SS)
            for (lx, ly) in lp[1:]:
                for s in (-1, 1):
                    c.dr.line([(lx, ly), (lx + s * 2.2 * SS, ly - 2 * SS)], fill=(80, 115, 55, 255), width=SS)
        # flat umbel of tiny white florets
        tx, ty = stem[-1]
        for k in range(7):
            a = rng.uniform(-np.pi * 0.95, -np.pi * 0.05)
            r = rng.uniform(4, 12) * SS
            hx, hy = tx + np.cos(a) * r, ty + np.sin(a) * r * 0.35 - 3 * SS
            c.dr.line([(tx, ty), (hx, hy)], fill=(110, 120, 80, 255), width=SS)
            for m in range(7):
                dot(c, hx + rng.uniform(-3, 3) * SS, hy + rng.uniform(-1.6, 1.0) * SS, 1.3 * SS, jit(rng, (0.95, 0.94, 0.88), 0.05))
    return c.final()


def hawkweed(seed):
    """orange hawkweed (devil's paintbrush): hairy leafless stalks with clusters of orange-red heads, basal rosette"""
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    for k in range(7):
        a = -np.pi / 2 + rng.uniform(-1.5, 1.5)
        blade(c, arc((W / 2 + rng.uniform(-8, 8) * SS, W - 1), a, W * rng.uniform(0.2, 0.3), rng.uniform(-0.5, 0.5), 6), 5 * SS, (0.22, 0.34, 0.15), (0.32, 0.44, 0.2), w1=2 * SS)
    for i in range(3):
        x0 = W * (0.3 + 0.2 * i) + rng.uniform(-4, 4) * SS
        stem = arc((x0, W - 1), -np.pi / 2 + rng.uniform(-0.2, 0.2), W * rng.uniform(0.6, 0.85), rng.uniform(-0.3, 0.3), 12)
        c.line(stem, 1.6 * SS, 1.2 * SS, (70, 85, 45))
        tx, ty = stem[-1]
        for k in range(rng.integers(2, 5)):
            hx, hy = tx + rng.uniform(-6, 6) * SS, ty + rng.uniform(-4, 2) * SS
            c.dr.line([(tx, ty), (hx, hy)], fill=(70, 80, 45, 255), width=SS)
            rayed(c, rng, hx, hy, rng.uniform(3.5, 4.5) * SS, rng.choice([(0.95, 0.38, 0.08), (0.9, 0.3, 0.06), (0.98, 0.5, 0.12)]), (0.95, 0.62, 0.1), n=16, tilt=0.7)
    return c.final()


def vetch(seed):
    """tufted vetch: sprawling pinnate stems with one-sided racemes of blue-violet pea flowers"""
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    for i in range(4):
        x0 = W * rng.uniform(0.15, 0.85)
        stem = arc((x0, W - 1), -np.pi / 2 + rng.uniform(-0.5, 0.5), W * rng.uniform(0.55, 0.85), rng.uniform(-0.8, 0.8), 12)
        c.line(stem, 1.3 * SS, 0.9 * SS, (80, 110, 50))
        for j in range(2, len(stem) - 2, 2):
            x, y = stem[j]
            for s in (-1, 1):
                dot(c, x + s * 2.6 * SS, y + rng.uniform(-1, 1) * SS, 1.6 * SS, jit(rng, (0.3, 0.48, 0.18)), 0.8 * SS)
        x, y = stem[-1]
        for k in range(10):
            dot(c, x + rng.uniform(-1.5, 1.5) * SS + k * 0.4 * SS, y + k * 1.6 * SS - 6 * SS, 1.6 * SS, jit(rng, (0.42, 0.32, 0.82), 0.1), 1.2 * SS)
    return c.final()


# ------------------------------------------------------------------------------------------------ understorey
def raspberry(leaves, seed):
    """2 x 1 sprig: an arching red-brown cane with prickles, trifoliate leaves (pale undersides) and red berries"""
    c = cell((2 * U, U), seed)
    rng = c.rng
    W, H = 2 * U * SS, U * SS
    cane = arc((0, H * 0.62), -0.25, W * 0.95, 0.55, 22)
    c.line(cane, 3.2 * SS, 1.6 * SS, (120, 60, 50))
    for j in range(1, len(cane) - 1):
        x, y = cane[j]
        if rng.random() < 0.6:
            c.dr.line([(x, y), (x + rng.uniform(-1, 1) * SS, y - 2 * SS)], fill=(150, 80, 70, 255), width=max(1, SS // 2))
    for j in range(2, len(cane) - 1, 2):
        p = cane[j]
        a = -np.pi / 2 + rng.uniform(-0.9, 0.9)
        pet = (p[0] + np.cos(a) * 9 * SS, p[1] + np.sin(a) * 9 * SS)
        c.dr.line([p, pet], fill=(110, 80, 50, 255), width=SS)
        for k, da in enumerate((-0.9, 0.0, 0.9)):
            spr = leaves[rng.integers(0, len(leaves))]
            tint = (0.72, 0.92, 0.66) if rng.random() > 0.3 else (1.05, 1.12, 1.0)  # pale underside showing
            c.paste(spr, pet, a + da, H * rng.uniform(0.16, 0.22) * (1.2 if k == 1 else 1), tuple(np.array(tint) * rng.uniform(0.85, 1.05)), flip=rng.random() < 0.5)
    for k in range(rng.integers(4, 8)):
        j = rng.integers(len(cane) // 3, len(cane) - 1)
        x, y = cane[j]
        y += rng.uniform(3, 8) * SS
        for m in range(7):
            dot(c, x + rng.uniform(-1.6, 1.6) * SS, y + rng.uniform(-1.6, 1.6) * SS, 1.4 * SS, jit(rng, (0.82, 0.1, 0.12), 0.1))
        dot(c, x - 0.8 * SS, y - 1.2 * SS, 0.7 * SS, (1.0, 0.55, 0.5))
    return c.final()


def labrador(seed):
    """2 x 1 sprig: Labrador tea, woody twig with whorls of narrow leathery leaves (rusty-felted, rolled edges) and
    white flower umbels at the tips"""
    c = cell((2 * U, U), seed)
    rng = c.rng
    W, H = 2 * U * SS, U * SS
    segs = []

    def br(p, a, ln, w, d):
        pts = arc(p, a, ln, rng.uniform(-0.4, 0.4), 8)
        c.line(pts, w, w * 0.6, (95, 70, 52))
        segs.append((pts, a))
        if d > 0:
            for k in range(rng.integers(2, 4)):
                i = rng.integers(2, len(pts) - 1)
                br(pts[i], a + rng.choice([-1, 1]) * rng.uniform(0.35, 0.75), ln * rng.uniform(0.45, 0.6), w * 0.7, d - 1)

    br((0, H * 0.62), -0.12, W * 0.9, 3.4 * SS, 2)
    flowers = []
    for pts, a in segs:
        # leaves crowd toward the growing tips; older parts are bare
        for k in range(int(len(pts) * 2.2)):
            t = rng.uniform(0.45, 1.0) ** 0.6
            j = min(len(pts) - 1, int(t * (len(pts) - 1)))
            px, py = pts[j]
            la = a + rng.choice([-1, 1]) * rng.uniform(0.5, 1.9)
            l = rng.uniform(16, 26) * SS * (0.7 + 0.3 * t)
            lp = arc((px, py), la, l, rng.uniform(-0.5, 0.5), 7)
            rust = rng.random() < 0.28
            blade(c, lp, 5.5 * SS, (0.42, 0.24, 0.12) if rust else jit(rng, (0.13, 0.22, 0.08)), (0.62, 0.36, 0.16) if rust else jit(rng, (0.24, 0.36, 0.13)), w1=2.2 * SS, midrib=0.55)
        flowers.append(pts[-1])
    for (tx, ty) in flowers:
        if rng.random() < 0.7:
            for m in range(22):
                r = rng.uniform(0, 9) * SS
                b = rng.uniform(0, 2 * np.pi)
                dot(c, tx + np.cos(b) * r, ty + np.sin(b) * r * 0.7 - 3 * SS, 2.0 * SS, jit(rng, (0.97, 0.96, 0.9), 0.04))
                if m % 4 == 0:
                    dot(c, tx + np.cos(b) * r, ty + np.sin(b) * r * 0.7 - 3 * SS, 0.6 * SS, (0.8, 0.7, 0.3))
    return c.final()


def sarsaparilla(leaves, seed):
    """1 x 1, seen from above: one division of a wild sarsaparilla leaf, five ovate serrate leaflets"""
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    base = (W / 2, W - 2)
    c.dr.line([base, (W / 2, W * 0.5)], fill=(90, 100, 50, 255), width=SS)
    for k, a in enumerate((-np.pi / 2, -np.pi / 2 - 0.75, -np.pi / 2 + 0.75, -np.pi / 2 - 1.45, -np.pi / 2 + 1.45)):
        spr = leaves[rng.integers(0, len(leaves))]
        p = (W / 2, W * 0.5) if k < 3 else (W / 2, W * 0.62)
        c.paste(spr, p, a, W * (0.46 if k == 0 else 0.4 if k < 3 else 0.3), tuple(np.array([0.72, 0.92, 0.66]) * rng.uniform(0.9, 1.05)), flip=rng.random() < 0.5)
    return c.final()


# ------------------------------------------------------------------------------------------------ shore
def cattail_leaves(seed):
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(4):
        x0 = W * (0.2 + 0.2 * i) + rng.uniform(-5, 5) * SS
        pts = arc((x0, H - 1), -np.pi / 2 + rng.uniform(-0.08, 0.08), H * rng.uniform(0.85, 0.98), rng.uniform(-0.35, 0.35), 20)
        cb = jit(rng, (0.24, 0.34, 0.18))
        blade(c, pts, rng.uniform(8, 11) * SS, cb, jit(rng, (0.5, 0.6, 0.32)), midrib=0.85)
    return c.final()


def reed(seed):
    """1 x 2: tall reed stems with spreading leaves and a feathery purple-brown plume"""
    c = cell((U, 2 * U), seed)
    rng = c.rng
    W, H = U * SS, 2 * U * SS
    for i in range(3):
        x0 = W * (0.3 + 0.2 * i) + rng.uniform(-4, 4) * SS
        stem = arc((x0, H - 1), -np.pi / 2 + rng.uniform(-0.06, 0.06), H * rng.uniform(0.82, 0.98), rng.uniform(-0.2, 0.2), 22)
        c.line(stem, 2.0 * SS, 1.3 * SS, (150, 150, 90))
        for k in range(6):
            p = stem[2 + k * 2]
            side = 1 if k % 2 else -1
            blade(c, arc(p, -np.pi / 2 + side * rng.uniform(0.5, 0.9), H * rng.uniform(0.14, 0.22), side * rng.uniform(0.3, 1.0), 8), 4.5 * SS, (0.3, 0.42, 0.2), (0.55, 0.6, 0.35), midrib=0.8)
        top = len(stem) - 1
        for k in range(40):
            j = top - rng.integers(0, 4)
            x, y = stem[j]
            a = -np.pi / 2 + rng.uniform(-0.7, 0.7) + 0.3
            l = rng.uniform(5, 13) * SS
            col = jit(rng, rng.choice([(0.52, 0.4, 0.42), (0.68, 0.56, 0.5), (0.45, 0.32, 0.3)]), 0.1)
            c.dr.line([(x, y), (x + np.cos(a) * l, y + np.sin(a) * l)], fill=c255(col), width=SS)
    return c.final()


def lilypad(seed, old=False):
    """1 x 1, top-down: a round floating leaf with a narrow notch to the centre, radial veins"""
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    cx = cy = W / 2
    R = W * 0.47
    notch = rng.uniform(0, 2 * np.pi)
    pts = []
    for k in range(64):
        a = notch + 0.12 + (2 * np.pi - 0.24) * k / 63
        r = R * (1 + 0.02 * np.sin(a * 7)) * (0.92 + 0.08 * rng.random() if old else 1)
        pts.append((cx + np.cos(a) * r, cy + np.sin(a) * r))
    pts.append((cx, cy))
    base = (0.36, 0.42, 0.14) if old else (0.2, 0.36, 0.12)
    c.dr.polygon(pts, fill=c255(base))
    for k in range(26):
        a = notch + 0.2 + (2 * np.pi - 0.4) * k / 25
        c.dr.line([(cx, cy), (cx + np.cos(a) * R * 0.95, cy + np.sin(a) * R * 0.95)], fill=c255(np.array(base) * 1.25), width=SS)
    # rim tint, spots and wear
    for k in range(64):
        a = notch + 0.12 + (2 * np.pi - 0.24) * k / 63
        dot(c, cx + np.cos(a) * R * 0.97, cy + np.sin(a) * R * 0.97, 1.2 * SS, (0.5, 0.18, 0.15) if not old else (0.55, 0.45, 0.15))
    for k in range(18 if old else 6):
        a, r = rng.uniform(0, 2 * np.pi), rng.uniform(0.2, 0.9) * R
        dot(c, cx + np.cos(a) * r, cy + np.sin(a) * r, rng.uniform(1, 3) * SS, (0.42, 0.34, 0.12) if old else (0.16, 0.28, 0.1))
    if old:
        # a bite out of the rim
        a = rng.uniform(0, 2 * np.pi)
        dot(c, cx + np.cos(a) * R, cy + np.sin(a) * R, R * 0.22, (0, 0, 0, 0))
    return c.final()


def water_lily(seed):
    """1 x 1, top-down: white water lily, layered pointed petals around a golden centre"""
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    cx = cy = W / 2
    for layer, (n, r, col) in enumerate(((14, 0.46, (0.86, 0.88, 0.84)), (12, 0.38, (0.95, 0.95, 0.92)), (10, 0.28, (1.0, 0.99, 0.97)))):
        off = rng.uniform(0, 1)
        for k in range(n):
            a = (k + off) * 2 * np.pi / n
            L = W * r * rng.uniform(0.9, 1.05)
            tip = (cx + np.cos(a) * L, cy + np.sin(a) * L)
            wv = 0.17 * L
            side = (np.cos(a + np.pi / 2) * wv, np.sin(a + np.pi / 2) * wv)
            mid = (cx + np.cos(a) * L * 0.55, cy + np.sin(a) * L * 0.55)
            c.dr.polygon([(cx, cy), (mid[0] + side[0], mid[1] + side[1]), tip, (mid[0] - side[0], mid[1] - side[1])], fill=c255(jit(rng, col, 0.04)))
            c.dr.line([(cx, cy), tip], fill=c255(np.array(col) * 0.86), width=SS)
    for k in range(40):
        a, r = rng.uniform(0, 2 * np.pi), rng.uniform(0, 0.1) * W
        dot(c, cx + np.cos(a) * r, cy + np.sin(a) * r, 1.4 * SS, jit(rng, (0.98, 0.78, 0.15), 0.1))
    return c.final()


# ------------------------------------------------------------------------------------------------ cap textures
def cap(seed, kind):
    """lathe texture: v (rows) 0..0.7 cap top (centre -> rim), 0.7..1 gills/pores; u around"""
    rng = np.random.default_rng(seed)
    W = U * SS
    yy, xx = np.mgrid[0:W, 0:W] / W
    a = np.zeros((W, W, 4), np.float32)
    a[..., 3] = 1
    top = (yy < 0.7)[..., None]
    t = (yy / 0.7)[..., None]
    if kind == "bolete":
        capc = np.array([0.5, 0.3, 0.16]) * (1 - 0.2 * t) + np.array([0.06, 0.04, 0.02]) * np.sin(xx * 40 + yy * 13)[..., None]
        under = np.array([0.82, 0.74, 0.36]) * (0.85 + 0.15 * (np.sin(xx * 300) * np.sin(yy * 300) > 0))[..., None]
    elif kind == "honey":
        capc = np.array([0.55, 0.38, 0.18]) * (0.75 + 0.35 * t) + np.array([0.08, 0.06, 0.02]) * np.sin(xx * 60)[..., None]
        under = np.array([0.92, 0.86, 0.72]) * (0.85 + 0.15 * np.sin(xx * 200))[..., None]
    elif kind == "puffball":
        capc = np.array([0.92, 0.9, 0.84]) * (0.9 + 0.1 * t)
        under = np.array([0.82, 0.78, 0.68]) * np.ones_like(t)
    else:  # cattail: v = along the spike (bottom stalk, female spike, male spike), u around
        stalk = yy > 0.82
        male = yy < 0.16
        velvet = np.array([0.36, 0.22, 0.12]) * (0.85 + 0.25 * np.sin(xx * 90 + np.sin(yy * 40)))[..., None]
        col = np.where(stalk[..., None], np.array([0.42, 0.46, 0.26]), np.where(male[..., None], np.array([0.62, 0.52, 0.32]), velvet))
        a[..., :3] = col
        img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
        d = ImageDraw.Draw(img)
        for i in range(500):
            x, y = rng.uniform(0, W), rng.uniform(0.18, 0.8) * W
            d.point((x, y), fill=(int(rng.uniform(40, 120)), int(rng.uniform(25, 70)), 15, 255))
        return img.resize((U, U), Image.Resampling.BOX)
    a[..., :3] = np.where(top, capc, under)
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(img)
    if kind == "honey":
        for i in range(160):
            x, y = rng.uniform(0, W), rng.uniform(0.0, 0.45) * W
            r = rng.uniform(1, 2.5) * SS
            d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=(70, 45, 25, 255))
    if kind == "puffball":
        for i in range(700):
            x, y = rng.uniform(0, W), rng.uniform(0.0, 0.7) * W
            r = rng.uniform(0.6, 1.4) * SS
            v = int(rng.uniform(180, 240))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(v, v - 5, v - 20, 255))
    return img.resize((U, U), Image.Resampling.BOX)


def litter_mixed(seed):
    """2 x 1 decal: autumn aspen / birch / red maple leaves, a few needles, a twig and a cone scale or two"""
    c = cell((2 * U, U), seed)
    rng = c.rng
    W, H = 2 * U * SS, U * SS
    for i in range(500):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        prof = np.sin(np.pi * x / W) * np.sin(np.pi * y / H)
        if rng.random() > prof ** 0.6:
            continue
        a, l = rng.uniform(0, np.pi), rng.uniform(4, 8) * SS
        c.dr.line([(x, y), (x + np.cos(a) * l, y + np.sin(a) * l)], fill=c255(jit(rng, (0.5, 0.33, 0.18), 0.25)), width=SS)
    for i in range(3):
        x0, y0 = rng.uniform(0.15, 0.85) * W, rng.uniform(0.25, 0.75) * H
        a = rng.uniform(0, np.pi)
        l = rng.uniform(20, 40) * SS
        c.line([(x0, y0), (x0 + np.cos(a) * l, y0 + np.sin(a) * l)], 2 * SS, 1.2 * SS, (90, 75, 60))
    for i in range(44):
        x, y = rng.uniform(0.08, 0.92) * W, rng.uniform(0.12, 0.88) * H
        a = rng.uniform(0, 6.28)
        kind = rng.integers(0, 3)
        l = rng.uniform(9, 15) * SS
        col = jit(rng, rng.choice([[0.92, 0.72, 0.15], [0.85, 0.4, 0.12], [0.7, 0.18, 0.12], [0.55, 0.42, 0.25], [0.95, 0.82, 0.3]]), 0.1)
        pts = []
        for k in range(18):
            t = k / 17 * 2 * np.pi
            if kind == 0:  # round aspen leaf
                rr = l * 0.45 * (1 + 0.08 * np.sin(t * 9))
            elif kind == 1:  # three-lobed maple
                rr = l * 0.5 * (0.6 + 0.4 * abs(np.cos(t * 1.5)))
            else:  # birch, ovate
                rr = l * (0.5 + 0.5 * np.cos(t / 2) ** 2) * 0.5
            pts.append((x + np.cos(t + a) * rr, y + np.sin(t + a) * rr * 0.75))
        c.dr.polygon(pts, fill=c255(col))
        c.dr.line([(x, y), (x + np.cos(a) * l * 0.5, y + np.sin(a) * l * 0.38)], fill=c255(col * 0.7), width=max(1, SS // 2))
    return c.final()


def seedlings(seed):
    """1 x 1: tiny tree seedlings in a row: a spruce whorl, a fir sprig, birch and red-maple seedlings"""
    c = cell((U, U), seed)
    rng = c.rng
    W = U * SS
    for i in range(4):
        x0 = W * (0.14 + 0.24 * i)
        h = W * rng.uniform(0.45, 0.8)
        top = (x0 + rng.uniform(-3, 3) * SS, W - h)
        c.line([(x0, W - 1), top], 1.8 * SS, 1.0 * SS, (110, 80, 55))
        if i < 2:
            # conifer: whorls of short needles, wider at the bottom
            for k in range(int(h / (2.2 * SS))):
                y = W - 1 - k * 2.2 * SS
                t = k * 2.2 * SS / h
                L = (7 - 5 * t) * SS
                for s in (-1, 1):
                    c.dr.line([(x0 + (top[0] - x0) * t, y), (x0 + (top[0] - x0) * t + s * L, y - L * 0.5)], fill=c255(jit(rng, (0.18, 0.32, 0.14))), width=SS)
        else:
            for k in range(rng.integers(3, 6)):
                t = rng.uniform(0.35, 1.0)
                p = (x0 + (top[0] - x0) * t, W - 1 - h * t)
                side = rng.choice([-1, 1])
                L = rng.uniform(8, 12) * SS
                col = (0.3, 0.48, 0.16) if i == 2 else rng.choice([(0.62, 0.2, 0.12), (0.35, 0.45, 0.16)])
                blade(c, arc(p, -np.pi / 2 + side * rng.uniform(0.6, 1.2), L, side * 0.4, 6), L * 0.6, jit(rng, col) * 0.85, jit(rng, col), midrib=0.7)
    return c.final()
