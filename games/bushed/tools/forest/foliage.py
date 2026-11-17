"""Foliage card atlases (alpha-cut, high-resolution pixel art) for the five tree species.

    cd games/bushed && python3 tools/forest/foliage.py

Sources (CC0, Poly Haven): needle sprigs from fir_tree_01 / pine_tree_01 twig maps, birch-like serrated leaves from
shrub_01. Cedar sprays, dead twigs, beard lichen, catkins and cones are drawn procedurally.

Atlas layout (512 x 512, 2 columns x 4 rows of 256 x 128 cells). In every cell the twig enters at the left edge,
vertically centred, and runs to the right: the card's base is the attachment point on the branch.
Cell index i -> column i % 2, row i // 2 (row 0 at the top of the image). See CELLS in src/trees/textures.ts.
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import ph  # noqa: E402
from pix import bleed, hsv_adjust, kmeans, quantize, save_rgba, to_img  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "assets", "textures", "trees")
SS = 4  # supersampling
CW, CH = 256, 128  # cell size (final texels)
COLS, ROWS = 2, 4


# ------------------------------------------------------------------------------------------- sprite extraction
def components(mask, min_area=40):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    out = []
    n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)])
                lab[y, x] = n
                pts = []
                while q:
                    cy, cx = q.popleft()
                    pts.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n
                            q.append((yy, xx))
                if len(pts) >= min_area:
                    p = np.array(pts)
                    out.append((p[:, 1].min(), p[:, 0].min(), p[:, 1].max() + 1, p[:, 0].max() + 1, len(pts), n))
    return out, lab


class Sprite:
    """an RGBA sprite with a base (attachment) point and a pointing direction (radians, image space)"""

    def __init__(self, im, base, angle):
        self.im = im
        self.base = base
        self.angle = angle

    @property
    def length(self):
        return max(self.im.width, self.im.height)


def extract(diff_path, alpha_path, region, min_area=60, down=4, base_at="bottom"):
    """cut the sprites inside region (x0, y0, x1, y1 in 0..1) out of an atlas"""
    d = Image.open(diff_path).convert("RGB")
    a = Image.open(alpha_path).convert("L").resize(d.size)
    W, H = d.size
    small = np.asarray(a.resize((W // down, H // down), Image.Resampling.BOX)) > 60
    x0, y0, x1, y1 = [int(v) for v in (region[0] * W / down, region[1] * H / down, region[2] * W / down, region[3] * H / down)]
    m = np.zeros_like(small)
    m[y0:y1, x0:x1] = small[y0:y1, x0:x1]
    sprites = []
    comps, lab = components(m, min_area)
    for (bx0, by0, bx1, by1, area, n) in comps:
        box = (max(0, bx0 * down - 2), max(0, by0 * down - 2), min(W, bx1 * down + 2), min(H, by1 * down + 2))
        rgba = d.crop(box).convert("RGBA")
        own = Image.fromarray(((lab == n) * 255).astype(np.uint8)).resize((W, H), Image.Resampling.NEAREST).crop(box)
        own = own.filter(ImageFilter.MaxFilter(2 * down + 1))
        al = np.minimum(np.asarray(a.crop(box)), np.asarray(own))
        rgba.putalpha(Image.fromarray(al))
        al = np.asarray(rgba)[..., 3] > 100
        ys, xs = np.nonzero(al)
        if len(ys) == 0:
            continue
        if base_at == "bottom":
            yb = ys.max()
            xb = xs[ys >= yb - 3].mean()
            tip = (xs[ys <= ys.min() + (yb - ys.min()) * 0.35].mean(), ys.min())
        else:  # left
            xb = xs.min()
            yb = ys[xs <= xb + 3].mean()
            tip = (xs.max(), ys[xs >= xs.max() - (xs.max() - xb) * 0.35].mean())
        ang = np.arctan2(tip[1] - yb, tip[0] - xb)
        sprites.append(Sprite(rgba, (xb, yb), ang))
    return sprites


def clean_leaf(spr, min_g=1.0):
    """keep only the leaf blade (green/yellow pixels, largest blob); base = lowest blade point"""
    a = np.asarray(spr.im).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = (al > 100) & (g > r * 0.92 * min_g) & (g > b * 1.35)
    small = m[::2, ::2]
    comps, lab = components(small, 50)
    if not comps:
        return None
    best = max(comps, key=lambda c: c[4])
    keep = Image.fromarray(((lab == best[5]) * 255).astype(np.uint8)).resize((a.shape[1], a.shape[0]), Image.Resampling.NEAREST)
    keep = keep.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    k = np.asarray(keep) > 0
    out = a.copy()
    out[..., 3] = np.where(k & m, 255, 0)
    ys, xs = np.nonzero(out[..., 3] > 0)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    im = Image.fromarray(out.astype(np.uint8), "RGBA").crop((x0, y0, x1, y1))
    yb = y1 - 1 - y0
    xb = xs[ys >= y1 - 4].mean() - x0
    return Sprite(im, (xb, yb), -np.pi / 2)


def leaf_sprites(photo, n=8, seed=0, shape="birch"):
    """procedural leaf outlines (doubly serrate, acuminate tip) filled with a real leaf photo's colour and veins"""
    rng = np.random.default_rng(seed)
    W, H = 96, 144
    src = photo.im.resize((W, H), Image.Resampling.LANCZOS)
    a = np.asarray(src).astype(np.float32) / 255
    from pix import bleed as _bleed
    rgb = _bleed(a[..., :3], a[..., 3], iters=40)
    out = []
    for i in range(n):
        wmul = rng.uniform(0.82, 1.05)
        pts_l, pts_r = [], []
        teeth = rng.uniform(11, 15)
        for k in range(61):
            t = k / 60  # 0 base .. 1 tip
            if shape == "birch":
                prof = np.sin(np.pi * min(1, t ** 0.75)) ** 0.85 * (1 - 0.25 * t)
            else:
                prof = np.sin(np.pi * t) ** 0.7
            tooth = 0.0
            if 0.12 < t < 0.97:
                ph1 = (t * teeth) % 1.0
                ph2 = (t * teeth * 2) % 1.0
                tooth = 2.6 * (1 - ph1) + 1.1 * (1 - ph2)
            hw = (W / 2 - 3) * prof * wmul + tooth * prof
            y = H - 1 - t * (H - 2)
            pts_l.append((W / 2 - hw, y))
            pts_r.append((W / 2 + hw, y))
        poly = pts_l + pts_r[::-1]
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).polygon(poly, fill=255)
        mask = np.asarray(m) > 0
        tint = np.array([rng.uniform(0.9, 1.08), rng.uniform(0.95, 1.08), rng.uniform(0.85, 1.0)])
        col = np.clip(rgb * tint[None, None] * rng.uniform(0.88, 1.1), 0, 1)
        # midrib (paler) and a darker rim texel
        col[:, W // 2 - 1:W // 2 + 1] = col[:, W // 2 - 1:W // 2 + 1] * 0.75 + 0.25 * np.array([0.8, 0.85, 0.55])
        er = np.asarray(m.filter(ImageFilter.MinFilter(5))) > 0
        rim = mask & ~er
        col[rim] *= 0.8
        img = np.concatenate([col, mask[..., None].astype(np.float32)], -1)
        out.append(Sprite(to_img(img, "RGBA"), (W / 2, H - 1), -np.pi / 2))
    return out


# ------------------------------------------------------------------------------------------- canvas helpers
class Cell:
    def __init__(self, seed, size=None):
        self.size = size or (CW, CH)
        self.im = Image.new("RGBA", (self.size[0] * SS, self.size[1] * SS), (0, 0, 0, 0))
        self.dr = ImageDraw.Draw(self.im)
        self.rng = np.random.default_rng(seed)

    def paste(self, spr, at, angle, length, tint=(1, 1, 1), flip=False, squash=1.0, fit=True):
        """place sprite so its base sits at `at` (cell px * SS) pointing along `angle` (radians, image space).
        With fit, the sprite shrinks until it lies inside the cell (no straight cut edges)."""
        for attempt in range(6):
            r, px, py = self._place(spr, at, angle, length, tint, flip, squash)
            m = 2
            inside = px >= m and py >= m and px + r.width <= self.im.width - m and py + r.height <= self.im.height - m
            if inside or not fit:
                break
            # how much is outside? shrink proportionally
            length *= 0.82
        else:
            # still outside: tolerate only a small overflow on the right/left, otherwise skip
            return
        if inside:
            self.im.alpha_composite(r, (int(round(px)), int(round(py))))
        else:
            self._paste_clip(r, px, py)

    def _place(self, spr, at, angle, length, tint, flip, squash):
        im = spr.im
        if flip:
            im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            base = (im.width - 1 - spr.base[0], spr.base[1])
            sang = np.pi - spr.angle
        else:
            base = spr.base
            sang = spr.angle
        s = length / spr.length
        nw, nh = max(1, int(im.width * s)), max(1, int(im.height * s * squash))
        im = im.resize((nw, nh), Image.Resampling.LANCZOS)
        base = (base[0] * s, base[1] * s * squash)
        if tint != (1, 1, 1):
            a = np.asarray(im).astype(np.float32)
            a[..., :3] *= np.array(tint)[None, None]
            im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
        rot = np.degrees(sang - angle)  # PIL rotates counter-clockwise; image y is down
        cx, cy = im.width / 2, im.height / 2
        r = im.rotate(rot, resample=Image.Resampling.BICUBIC, expand=True)
        th = np.radians(rot)
        bx, by = base[0] - cx, base[1] - cy
        rx = bx * np.cos(th) + by * np.sin(th)
        ry = -bx * np.sin(th) + by * np.cos(th)
        px = at[0] - (rx + r.width / 2)
        py = at[1] - (ry + r.height / 2)
        # trim the transparent border so the fit test is tight
        bb = r.getbbox()
        if bb:
            r = r.crop(bb)
            px += bb[0]
            py += bb[1]
        return r, px, py

    def _paste_clip(self, r, px, py):
        ox, oy = int(round(px)), int(round(py))
        cx0, cy0 = max(0, -ox), max(0, -oy)
        if cx0 >= r.width or cy0 >= r.height:
            return
        r = r.crop((cx0, cy0, r.width, r.height))
        self.im.alpha_composite(r, (max(0, ox), max(0, oy)))

    def line(self, pts, w0, w1, col, jitter=0.0):
        """tapered polyline (twig)"""
        n = len(pts)
        for i in range(n - 1):
            t = i / max(1, n - 2)
            w = w0 + (w1 - w0) * t
            c = tuple(int(v) for v in col) + (255,)
            self.dr.line([pts[i], pts[i + 1]], fill=c, width=max(1, int(round(w))))
            self.dr.ellipse([pts[i + 1][0] - w / 2, pts[i + 1][1] - w / 2, pts[i + 1][0] + w / 2, pts[i + 1][1] + w / 2], fill=c)

    def curve(self, p0, angle, length, bend, n=12):
        pts = []
        x, y = p0
        a = angle
        for i in range(n + 1):
            pts.append((x, y))
            x += np.cos(a) * length / n
            y += np.sin(a) * length / n
            a += bend / n
        return pts

    def final(self):
        return self.im.resize(self.size, Image.Resampling.BOX)


# ------------------------------------------------------------------------------------------- composers
def twig_col(rng, base=(92, 70, 50)):
    k = rng.uniform(0.8, 1.15)
    return tuple(min(255, c * k) for c in base)


def conifer_spray(spr, seed, style="dense", tint=(1, 1, 1), twig=(92, 70, 50)):
    """a branchlet: a central twig with side sprigs (two-ranked) plus forward sprigs; tip sprig in front"""
    c = Cell(seed)
    rng = c.rng
    W, H = CW * SS, CH * SS
    cy = H / 2
    bend = rng.uniform(-0.25, 0.25)
    L = W * rng.uniform(0.86, 0.96)
    pts = c.curve((0, cy), rng.uniform(-0.08, 0.08), L, bend)
    c.line(pts, 7 * SS / 4, 2.2 * SS / 4, twig_col(rng, twig))
    n = {"dense": 9, "long": 7, "tip": 6, "sparse": 5, "pendant": 8, "flat": 9}[style]
    sides = []
    for i in range(n):
        t = 0.08 + 0.84 * (i + rng.uniform(-0.3, 0.3)) / n
        idx = min(len(pts) - 2, int(t * (len(pts) - 1)))
        p, q = pts[idx], pts[idx + 1]
        ang = np.arctan2(q[1] - p[1], q[0] - p[0])
        for side in (-1, 1):
            if style == "sparse" and rng.random() < 0.35:
                continue
            spread = {"dense": 0.95, "long": 0.75, "tip": 0.85, "sparse": 0.9, "pendant": 1.25, "flat": 1.05}[style]
            a = ang + side * spread * rng.uniform(0.6, 1.0)
            if style == "pendant":
                a = ang + (np.pi / 2) * rng.uniform(0.55, 1.0) * (1 if side > 0 else -0.45)
            ln = H * rng.uniform(0.42, 0.62) * (1.0 - 0.45 * t if style != "pendant" else 1.0 - 0.2 * t)
            if style == "tip":
                ln *= 0.75
            sides.append((t, p, a, ln))
    # paste far-from-tip first so tip sprigs overlap on top
    for (t, p, a, ln) in sorted(sides, key=lambda s: s[0]):
        k = rng.uniform(0.82, 1.08)
        age = 0.85 + 0.25 * t  # younger growth towards the tip is lighter
        tt = tuple(np.array(tint) * k * age)
        c.paste(rng.choice(spr), p, a, ln, tt, flip=rng.random() < 0.5, squash=rng.uniform(0.8, 1.1))
    # forward sprigs along the twig (bottle-brush) and the tip sprig
    for i in range(3 if style in ("dense", "pendant") else 2):
        t = rng.uniform(0.3, 0.8)
        idx = int(t * (len(pts) - 1))
        p = pts[idx]
        c.paste(rng.choice(spr), p, rng.uniform(-0.4, 0.4), H * rng.uniform(0.45, 0.6), tuple(np.array(tint) * 1.05), flip=rng.random() < 0.5)
    tipp = pts[-4]
    c.paste(rng.choice(spr), tipp, rng.uniform(-0.15, 0.15), min(W - tipp[0] - 2, H * 0.62) + H * 0.1, tuple(np.array(tint) * 1.12))
    return c.final()


def pine_tuft(spr, seed, tint=(1, 1, 1), long=1.0, n=9, twig=(110, 78, 52)):
    """jack/red pine: needle tufts at the twig ends (a brush of sprigs fanning forward)"""
    c = Cell(seed)
    rng = c.rng
    W, H = CW * SS, CH * SS
    cy = H / 2
    pts = c.curve((0, cy), rng.uniform(-0.1, 0.1), W * 0.5, rng.uniform(-0.3, 0.3))
    c.line(pts, 8 * SS / 4, 4 * SS / 4, twig_col(rng, twig))
    # a second side twig
    mid = pts[len(pts) // 2]
    side = c.curve(mid, rng.uniform(0.5, 0.9) * rng.choice([-1, 1]), W * 0.3, 0.2)
    c.line(side, 5 * SS / 4, 3 * SS / 4, twig_col(rng, twig))
    for end, scale in ((pts[-1], 1.0), (side[-1], 0.75)):
        for i in range(n):
            a = rng.uniform(-1.05, 1.05) * (1 - 0.3 * rng.random())
            ln = H * 0.78 * long * scale * rng.uniform(0.75, 1.0)
            base = (end[0] - np.cos(a) * ln * 0.25, end[1] - np.sin(a) * ln * 0.25)
            c.paste(rng.choice(spr), base, a, ln, tuple(np.array(tint) * rng.uniform(0.85, 1.1)), flip=rng.random() < 0.5)
    # sparse needles along the bare twig (older needles)
    for i in range(4):
        t = rng.uniform(0.35, 0.8)
        p = pts[int(t * (len(pts) - 1))]
        a = rng.choice([-1, 1]) * rng.uniform(0.6, 1.2)
        c.paste(rng.choice(spr), p, a, H * 0.4 * long, tuple(np.array(tint) * 0.8), flip=rng.random() < 0.5)
    return c.final()


def cedar_frond(seed, tint=(1, 1, 1), sparse=0.0, dead=False):
    """western red cedar: flat, fern-like sprays of tiny scale leaves, branching pinnately (procedural)"""
    c = Cell(seed)
    rng = c.rng
    W, H = CW * SS, CH * SS
    base_g = np.array([0.36, 0.50, 0.16]) if not dead else np.array([0.55, 0.36, 0.18])

    def strand(p0, ang, length, width, depth, bend):
        pts = c.curve(p0, ang, length, bend, n=max(4, int(length / (3 * SS))))
        n = len(pts)
        for i in range(n - 1):
            t = i / (n - 1)
            w = width * (1 - 0.65 * t)
            g = base_g * rng.uniform(0.85, 1.12) * (0.82 + 0.35 * t)
            g = np.clip(g * np.array(tint), 0, 1)
            col = tuple(int(v * 255) for v in g) + (255,)
            dk = tuple(int(v * 255 * 0.62) for v in g) + (255,)
            x, y = pts[i]
            # scale leaves: overlapping lozenges with a dark midline
            self_w = max(SS * 0.9, w)
            c.dr.ellipse([x - self_w * 0.75, y - self_w * 0.5, x + self_w * 0.75, y + self_w * 0.5], fill=col)
            if i % 2 == 0:
                c.dr.line([pts[i], pts[i + 1]], fill=dk, width=max(1, int(self_w * 0.25)))
        if depth > 0:
            k = int(length / (9 * SS)) + 2
            for j in range(1, k):
                t = j / k
                if sparse and rng.random() < sparse:
                    continue
                i = int(t * (n - 1))
                p = pts[i]
                q = pts[min(n - 1, i + 1)]
                a0 = np.arctan2(q[1] - p[1], q[0] - p[0])
                side = 1 if j % 2 else -1
                strand(p, a0 + side * rng.uniform(0.75, 1.0), length * (1 - t) * rng.uniform(0.45, 0.62), width * 0.8,
                       depth - 1, bend * 0.5 + side * rng.uniform(-0.2, 0.25))

    cy = H / 2
    strand((0, cy), rng.uniform(-0.05, 0.05), W * rng.uniform(0.88, 0.97), SS * 2.4, 3, rng.uniform(-0.25, 0.25))
    return c.final()


def dead_twigs(seed, lichen=0.0, needles=0.0, col=(118, 108, 98), ncol=(130, 92, 52), lcol=(176, 186, 160)):
    """grey dead twigs (fractal), optional brown needles and hanging beard lichen (Usnea / Bryoria)"""
    c = Cell(seed)
    rng = c.rng
    W, H = CW * SS, CH * SS
    tips = []

    def br(p, a, ln, w, d):
        pts = c.curve(p, a, ln, rng.uniform(-0.5, 0.5), n=6)
        c.line(pts, max(SS * 0.9, w), max(SS * 0.8, w * 0.5), twig_col(rng, col))
        if d <= 0 or ln < 8 * SS:
            tips.append(pts[-1])
            return
        for k in range(rng.integers(3, 6)):
            t = rng.uniform(0.15, 0.95)
            i = int(t * (len(pts) - 1))
            br(pts[i], a + rng.choice([-1, 1]) * rng.uniform(0.4, 1.0), ln * rng.uniform(0.35, 0.6), w * 0.6, d - 1)
        tips.append(pts[-1])

    br((0, H / 2), rng.uniform(-0.1, 0.1), W * 0.92, 9 * SS / 4, 4)
    if needles:
        for p in tips:
            for _ in range(int(needles * 6)):
                a = rng.uniform(0, 2 * np.pi)
                l = rng.uniform(2, 4) * SS
                cc = tuple(int(v * rng.uniform(0.8, 1.15)) for v in ncol) + (255,)
                c.dr.line([p, (p[0] + np.cos(a) * l, p[1] + np.sin(a) * l)], fill=cc, width=SS)
    if lichen:
        for p in tips[: int(len(tips) * lichen) + 1]:
            # hanging strands
            for _ in range(rng.integers(3, 7)):
                x, y = p[0] + rng.uniform(-4, 4) * SS, p[1]
                ln = rng.uniform(8, 26) * SS
                pts = [(x + np.sin(i * 0.7 + rng.uniform(0, 3)) * SS * 1.2, y + i * ln / 8) for i in range(9)]
                cc = tuple(int(v * rng.uniform(0.85, 1.1)) for v in lcol)
                c.line(pts, SS * 1.0, SS * 0.7, cc)
    return c.final()


def birch_cluster(leaves, seed, n=11, tint=(1, 1, 1), twig=(82, 46, 36), catkins=0):
    c = Cell(seed)
    rng = c.rng
    W, H = CW * SS, CH * SS
    pts = c.curve((0, H / 2), rng.uniform(-0.1, 0.1), W * rng.uniform(0.75, 0.9), rng.uniform(-0.4, 0.4))
    c.line(pts, 5 * SS / 4, 2 * SS / 4, twig_col(rng, twig))
    # a couple of side twigs
    ends = [pts]
    for k in range(2):
        t = rng.uniform(0.3, 0.6)
        p = pts[int(t * (len(pts) - 1))]
        sp = c.curve(p, rng.choice([-1, 1]) * rng.uniform(0.5, 0.9), W * rng.uniform(0.25, 0.4), rng.uniform(-0.3, 0.3), n=6)
        c.line(sp, 3 * SS / 4, 1.5 * SS / 4, twig_col(rng, twig))
        ends.append(sp)
    placed = []
    for i in range(n):
        tw = ends[rng.integers(0, len(ends))]
        t = rng.uniform(0.12, 1.0) ** 0.7
        i0 = min(len(tw) - 2, int(t * (len(tw) - 1)))
        p, q = tw[i0], tw[i0 + 1]
        a0 = np.arctan2(q[1] - p[1], q[0] - p[0])
        a = a0 + rng.choice([-1, 1]) * rng.uniform(0.35, 1.3)
        ln = H * rng.uniform(0.22, 0.34)
        placed.append((rng.random(), p, a, ln))
    for (_, p, a, ln) in sorted(placed, key=lambda s: s[0]):
        k = rng.uniform(0.82, 1.12)
        pl = ln * 0.28
        q = (p[0] + np.cos(a) * pl, p[1] + np.sin(a) * pl)
        c.line([p, q], 1.6 * SS / 4 * 2, 1.2 * SS / 4 * 2, twig_col(rng, (70, 80, 40)))
        c.paste(rng.choice(leaves), q, a + rng.uniform(-0.3, 0.3), ln, tuple(np.array(tint) * k), flip=rng.random() < 0.5)
    for k in range(catkins):
        tw = ends[rng.integers(0, len(ends))]
        p = tw[-1]
        pts2 = c.curve(p, np.pi / 2 + rng.uniform(-0.4, 0.4), H * rng.uniform(0.18, 0.3), rng.uniform(-0.3, 0.3), n=6)
        for j, q in enumerate(pts2):
            col = (int(120 + 30 * (j % 2)), int(88 + 20 * (j % 2)), 52, 255)
            r = SS * (1.6 - 0.1 * j)
            c.dr.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=col)
    return c.final()


def cones_cell(spr, seed, tint=(1, 1, 1), cone=(112, 74, 46), n=3, twig=(92, 70, 50)):
    """a sprig with a few hanging cones"""
    im = conifer_spray(spr, seed, "sparse", tint, twig)
    c = Cell(seed + 99)
    c.im = im.resize((CW * SS, CH * SS), Image.Resampling.NEAREST)
    c.dr = ImageDraw.Draw(c.im)
    rng = c.rng
    W, H = CW * SS, CH * SS
    for k in range(n):
        x = W * rng.uniform(0.3, 0.85)
        y = H * rng.uniform(0.45, 0.6)
        ln = H * rng.uniform(0.22, 0.32)
        w = ln * 0.38
        for j in range(9):
            t = j / 8
            yy = y + t * ln
            ww = w * (0.55 + 0.6 * np.sin(np.pi * min(1, t * 1.1 + 0.1)))
            col = tuple(int(v * (0.75 + 0.35 * ((j % 2)))) for v in cone) + (255,)
            c.dr.ellipse([x - ww / 2, yy - ln / 14, x + ww / 2, yy + ln / 14], fill=col)
    return c.final()


def green_needles(rgb):
    """turn most of the scan's orange (dead) needles green, keep a few for realism (live tuft cells only)"""
    full = rgb
    rgb = rgb.copy()
    im = to_img(rgb).convert("HSV")
    a = np.asarray(im).astype(np.float32) / 255
    h, s_, v = a[..., 0], a[..., 1], a[..., 2]
    m = (h > 0.03) & (h < 0.16) & (s_ > 0.25)
    rng = np.random.default_rng(4)
    keep = rng.random(h.shape) < 0.12
    mm = m & ~keep
    h[mm] = 0.2 + (h[mm] - 0.09) * 0.4
    s_[mm] *= 0.8
    v[mm] *= 0.85
    out = np.stack([h, s_, v], -1)
    res = np.asarray(Image.fromarray((out * 255).astype(np.uint8), "HSV").convert("RGB")).astype(np.float32) / 255
    # only cells 0..4 (live tufts); keep cones (5) and dead twigs (6, 7) as they were
    mask = np.zeros(rgb.shape[:2], bool)
    for i in range(5):
        x0, y0 = (i % COLS) * CW, (i // COLS) * CH
        mask[y0:y0 + CH, x0:x0 + CW] = True
    return np.where(mask[..., None], res, full)


# ------------------------------------------------------------------------------------------- assembly
def assemble(cells, name, colours=40, grade=None, seed=5):
    W, H = CW * COLS, CH * ROWS
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, im in enumerate(cells):
        atlas.alpha_composite(im, ((i % COLS) * CW, (i // COLS) * CH))
    a = np.asarray(atlas).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3]
    # un-premultiply-ish: composite colours are straight alpha already
    if grade:
        rgb = grade(rgb)
    hard = (alpha > 0.42).astype(np.float32)
    pal = kmeans(rgb[hard > 0].reshape(-1, 3), colours, seed=seed)
    q, _ = quantize(rgb, pal)
    q = bleed(q, hard)
    save_rgba(os.path.join(OUT, f"foliage_{name}.png"), q, hard)
    return q, hard


def main():
    os.makedirs(OUT, exist_ok=True)
    fir_spr = extract(ph.fetch("fir_tree_01", "twig_diff"), ph.fetch("fir_tree_01", "twig_alpha"), (0.17, 0.0, 1.0, 0.82))
    def greenish(s):
        a = np.asarray(s.im).astype(np.float32)
        m = a[..., 3] > 128
        return m.sum() > 200 and a[..., 1][m].mean() > a[..., 0][m].mean() * 1.08
    fir_spr = [s for s in fir_spr if s.length > 60 and greenish(s)]
    pine_spr = extract(ph.fetch("pine_tree_01", "twig_diff"), ph.fetch("pine_tree_01", "twig_alpha"), (0.0, 0.03, 0.21, 0.45))
    pine_spr = [s for s in pine_spr if s.length > 300]
    print("pine sprite lengths", [s.length for s in pine_spr])
    leaves = extract(ph.fetch("shrub_01", "diff"), ph.fetch("shrub_01", "Alpha"), (0.0, 0.0, 1.0, 0.85), min_area=150)
    leaves = [clean_leaf(s) for s in leaves if s.length > 250]
    leaves = [l for l in leaves if l is not None and l.length > 150]
    good = []
    for s in leaves:
        a = np.asarray(s.im).astype(np.float32)
        m = a[..., 3] > 128
        r, g, b = [a[..., i][m].mean() for i in range(3)]
        if g > r * 1.05:
            good.append(s)
    leaves = leaf_sprites(max(good, key=lambda l: l.length), 10, seed=3)
    print("sprites: fir", len(fir_spr), "pine", len(pine_spr), "leaves", len(leaves))

    # ---- spruce (white/black spruce): dull blue-green, bottle-brush branchlets, beard lichen on dead twigs
    sp = [conifer_spray(fir_spr, 11, "dense"), conifer_spray(fir_spr, 12, "long"),
          conifer_spray(fir_spr, 13, "tip"), conifer_spray(fir_spr, 14, "sparse", (0.82, 0.8, 0.75)),
          conifer_spray(fir_spr, 15, "pendant"), cones_cell(fir_spr, 16, cone=(104, 70, 48)),
          dead_twigs(17, lichen=0.0, needles=0.5), dead_twigs(18, lichen=0.7, needles=0.2)]
    assemble(sp, "spruce", grade=lambda c: hsv_adjust(c, hue=0.03, sat=0.92, val=1.22))
    # ---- balsam fir: deep green flat sprays, lighter new growth
    fi = [conifer_spray(fir_spr, 21, "flat"), conifer_spray(fir_spr, 22, "dense"),
          conifer_spray(fir_spr, 23, "tip"), conifer_spray(fir_spr, 24, "sparse", (0.85, 0.85, 0.8)),
          conifer_spray(fir_spr, 25, "flat"), cones_cell(fir_spr, 26, cone=(70, 60, 80), n=2),
          dead_twigs(27, needles=0.6, col=(120, 116, 108)), dead_twigs(28, lichen=0.4, needles=0.3, col=(120, 116, 108))]
    assemble(fi, "fir", grade=lambda c: hsv_adjust(c, hue=0.012, sat=1.08, val=1.12))
    # ---- pine (jack / red pine): tufts of long needles at branch ends
    pi = [pine_tuft(pine_spr, 31, long=1.0), pine_tuft(pine_spr, 32, long=0.8, n=11),
          pine_tuft(pine_spr, 33, long=1.15, n=8), pine_tuft(pine_spr, 34, long=0.7, n=7),
          pine_tuft(pine_spr, 35, long=0.95, n=12), cones_cell(pine_spr, 36, cone=(120, 98, 70), n=3, twig=(110, 78, 52)),
          dead_twigs(37, needles=0.7, col=(126, 110, 94)), dead_twigs(38, needles=0.0, col=(126, 110, 94))]
    assemble(pi, "pine", grade=lambda c: hsv_adjust(green_needles(c), hue=0.0, sat=1.1, val=1.2))
    # ---- western red cedar: flat lacy hanging sprays
    ce = [cedar_frond(41), cedar_frond(42), cedar_frond(43, sparse=0.25), cedar_frond(44, (1.08, 1.06, 0.95)),
          cedar_frond(45, (0.9, 0.95, 0.9)), cedar_frond(46, sparse=0.4), cedar_frond(47, dead=True),
          dead_twigs(48, needles=0.0, col=(120, 92, 74))]
    assemble(ce, "cedar", grade=lambda c: hsv_adjust(c, sat=1.0, val=1.0))
    # ---- paper birch: serrated ovate leaves on dark red-brown twigs, a few catkins
    bi = [birch_cluster(leaves, 51, 30), birch_cluster(leaves, 52, 34), birch_cluster(leaves, 53, 26, catkins=2),
          birch_cluster(leaves, 54, 24, (1.08, 1.05, 0.9)), birch_cluster(leaves, 55, 32), birch_cluster(leaves, 56, 14, catkins=3),
          dead_twigs(57, col=(70, 46, 40)), dead_twigs(58, col=(86, 60, 50))]
    assemble(bi, "birch", grade=lambda c: hsv_adjust(c, hue=0.03, sat=1.02, val=1.05))


if __name__ == "__main__":
    main()
