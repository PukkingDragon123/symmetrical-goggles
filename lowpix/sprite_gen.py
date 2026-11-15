"""Procedural sprite generators: each returns an ordinary sprite spec (see sprite.py), so agents
can tweak the result. Everything is seeded: same seed, same sprite.

Every outline is drawn the way an illustrator draws it: smooth Catmull-Rom curves through
seeded, slightly irregular control points (no bare circles, boxes or straight polygons),
with anatomy and construction details layered on top: fin rays and spines, gill covers,
lips, catch-lights, quillon curls, leather wraps, star facets, meniscus lines.

    fish(seed, size=(64, 32), species=None)    sword(seed, size=64, theme=None, ...)
    gem(seed, size=32, cut=None, colour=None)  ore(seed, size=32, kind=None, colour=None)
    potion(seed, size=32, colour=None, shape=None)
"""
from __future__ import annotations

import colorsys
import math

import numpy as np

from .palette import to_hex


# ================================================================ drawing helpers
def _hsv(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, max(0, min(1, s)), max(0, min(1, v)))
    return to_hex((r * 255, g * 255, b * 255))


def catmull(points, n=8, closed=False):
    """Smooth Catmull-Rom curve through `points` (n samples per span)."""
    P = [np.array(p, float) for p in points]
    if len(P) < 3:
        return [tuple(p) for p in P]
    if closed:
        P = [P[-1]] + P + [P[0], P[1]]
    else:
        P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((float(q[0]), float(q[1])))
    if not closed:
        out.append(tuple(P[-2]))
    return out


def profile(ctrl, u):
    """Evaluate a smooth profile through control (u, value) pairs at u (array)."""
    pts = catmull(ctrl, n=16)
    xs = np.array([p[0] for p in pts])
    ys = np.array([p[1] for p in pts])
    order = np.argsort(xs)
    return np.interp(u, xs[order], ys[order])


def blob(cx, cy, rx, ry, rng, lump=0.18, n=9, angle=0.0):
    """An organic closed shape: a smooth curve through jittered radii (never a perfect ellipse)."""
    pts = []
    ph = rng.uniform(0, 2 * math.pi)
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.25, 0.25) * (2 * math.pi / n)
        r = 1 + rng.uniform(-lump, lump) + 0.5 * lump * math.sin(2 * a + ph)
        x, y = rx * r * math.cos(a), ry * r * math.sin(a)
        ca, sa = math.cos(angle), math.sin(angle)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return catmull(pts, n=5, closed=True)


def wobble(points, rng, amount=0.3):
    """Hand tremor: nudge each point a little (keeps curves from looking machine-made)."""
    return [(x + rng.uniform(-amount, amount), y + rng.uniform(-amount, amount)) for x, y in points]


def fan(base0, base1, tips, rng=None, scallop=0.0):
    """A fin: base edge plus a smooth (or scalloped, spiny) trailing edge through the ray tips."""
    edge = []
    for i, t in enumerate(tips):
        edge.append(t)
        if scallop and i < len(tips) - 1:  # membrane dips between spines
            a, b = np.array(t), np.array(tips[i + 1])
            mid = (a + b) / 2
            toward = (np.array(base0) + np.array(base1)) / 2 - mid
            edge.append(tuple(mid + toward * scallop))
    return catmull([base0] + edge + [base1], n=4) if not scallop else [base0] + edge + [base1]


def _clip_poly(poly, clip):
    """Sutherland-Hodgman polygon clipping against a convex clip polygon."""
    def inside(p, a, b):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0

    def inter(p, q, a, b):
        x1, y1, x2, y2 = p[0], p[1], q[0], q[1]
        x3, y3, x4, y4 = a[0], a[1], b[0], b[1]
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(den) < 1e-12:
            return q
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    out = list(poly)
    area = sum(clip[i][0] * clip[(i + 1) % len(clip)][1] - clip[(i + 1) % len(clip)][0] * clip[i][1] for i in range(len(clip)))
    if area < 0:
        clip = clip[::-1]
    for i in range(len(clip)):
        a, b = clip[i], clip[(i + 1) % len(clip)]
        inp, out = out, []
        for j in range(len(inp)):
            p, q = inp[j - 1], inp[j]
            if inside(q, a, b):
                if not inside(p, a, b):
                    out.append(inter(p, q, a, b))
                out.append(q)
            elif inside(p, a, b):
                out.append(inter(p, q, a, b))
        if not out:
            break
    return out


def _L(pts):
    return [[round(float(x), 3), round(float(y), 3)] for x, y in pts]


# ======================================================================== fish
FISH_SPECIES = {
    "perch": dict(back="#56702a", belly="#efe0a0", fin="#e0682e", depth=0.40, hump=0.36, sn=0.35, tail="fork",
                  dorsal="spiny", bars=6),
    "bluegill": dict(back="#3d5a7c", belly="#f0a43a", fin="#47607a", depth=0.56, hump=0.40, sn=0.5, tail="fork",
                     dorsal="spiny", bars=6, ear="#1a1e3a"),
    "trout": dict(back="#5d6a3e", belly="#f2ead6", fin="#a79a70", depth=0.30, hump=0.40, sn=0.3, tail="square",
                  dorsal="soft", adipose=True, spots=26, spot_col="#2b221c", band="#e07a8c"),
    "pike": dict(back="#3f5c33", belly="#e8e4b4", fin="#b06c36", depth=0.21, hump=0.55, sn=0.05, tail="fork",
                 dorsal="rear", spots=16, spot_col="#d9e4a0", length=0.92, jaw=0.25),
    "catfish": dict(back="#4c4540", belly="#c7bba6", fin="#5c524a", depth=0.28, hump=0.30, sn=0.9, tail="round",
                    dorsal="soft", barbels=True, mottle="#3a3430", flat=True),
    "koi": dict(back="#f6f0e4", belly="#ffffff", fin="#f3ece2", depth=0.34, hump=0.38, sn=0.6, tail="fork",
                dorsal="long", patches="#e8501c", patches2="#202020"),
    "salmon": dict(back="#8a2a26", belly="#d64c3a", fin="#4e5a3a", depth=0.33, hump=0.42, sn=0.15, tail="square",
                   dorsal="soft", adipose=True, head="#4a6a46", jaw=0.18),
    "goldfish": dict(back="#ff7a1c", belly="#ffd27a", fin="#ffa04e", depth=0.52, hump=0.40, sn=0.7, tail="veil",
                     dorsal="soft", length=0.62),
    "carp": dict(back="#7a6a34", belly="#e8d290", fin="#9a6a3a", depth=0.40, hump=0.38, sn=0.55, tail="fork",
                 dorsal="long", big_scales=True, barbels=True),
}


def fish(seed=0, size=(64, 32), species=None):
    rng = np.random.default_rng(seed)
    species = species or list(FISH_SPECIES)[rng.integers(len(FISH_SPECIES))]
    F = dict(FISH_SPECIES[species])
    W, H = size
    tail_frac = 0.2 if F["tail"] != "veil" else 0.3
    L = W * F.get("length", 0.84) * (1 - tail_frac) * rng.uniform(0.96, 1.02)   # snout -> tail base
    D = H * F["depth"] * 1.55 * rng.uniform(0.94, 1.06)
    x0 = (W - L * (1 + tail_frac * 1.05)) / 2 + 0.5
    xb = x0 + L
    cy = H * 0.5 + rng.uniform(-0.3, 0.3)
    bend = rng.uniform(-0.04, 0.04) * D  # a swimming curve through the body
    hump, sn = F["hump"], F["sn"]

    def j(a=0.04):
        return rng.uniform(-a, a)
    pd = 0.22 + j(0.03)
    top_ctrl = [(0.0, 0.08 + 0.25 * sn), (0.05, 0.30 + 0.25 * sn + j()), (0.16, 0.66 + j()), (hump, 1.0),
                (0.66, 0.84 + j()), (0.86, 0.46 + j()), (0.96, pd + 0.04), (1.0, pd)]
    bot_ctrl = [(0.0, 0.0), (0.05, 0.24 + 0.2 * sn), (0.2, 0.74 + j()), (0.46 + j(0.05), 1.0), (0.7, 0.78 + j()),
                (0.88, 0.42 + j()), (0.97, pd + 0.03), (1.0, pd)]
    if F.get("flat"):  # catfish: broad flat head
        top_ctrl[1] = (0.05, 0.55)
        top_ctrl[2] = (0.16, 0.8)
    u = np.concatenate([np.linspace(0, 0.12, 10), np.linspace(0.13, 1.0, 26)])
    mid = cy + bend * np.sin(np.pi * u) - D * 0.04
    top = mid - D * 0.52 * profile(top_ctrl, u)
    bot = mid + D * 0.48 * profile(bot_ctrl, u)
    xs = x0 + u * L
    mouth_y = mid[0] + D * (0.06 + 0.04 * sn)
    body = [(xs[0] - 0.2, mouth_y)] + list(zip(xs[1:], top[1:])) + list(zip(xs[::-1][:-1], bot[::-1][:-1]))
    body = wobble(body, rng, 0.08)

    def at(uu, k):  # a point at body fraction uu, k in -1 (top) .. 1 (bottom)
        t_ = np.interp(uu, u, top)
        b_ = np.interp(uu, u, bot)
        m_ = (t_ + b_) / 2
        return x0 + uu * L, m_ + k * (b_ - t_) / 2

    mats = {"body": {"base": F["back"], "steps": 8, "contrast": 1.35, "rim": 1.0, "hue_shift": 22, "texture": "scales"},
            "belly": {"base": F["belly"], "steps": 7, "contrast": 1.1, "texture": "organic"},
            "fin": {"base": F["fin"], "steps": 6, "contrast": 0.9, "spread": 0.7},
            "eye": {"ramp": ["#0a0810", "#14101a", "#2a2230", "#eae4d6", "#ffffff"]},
            "iris": {"base": F.get("iris", "#d8a83a"), "steps": 5, "contrast": 1.0}}
    shapes = []
    # ---- tail (behind)
    tl = L * tail_frac * rng.uniform(0.95, 1.08)
    t0, t1 = at(0.985, -0.95), at(0.985, 0.95)
    tb = (t0[0] - 0.6, (t0[1] + t1[1]) / 2)
    kind = F["tail"]
    if kind == "fork":
        tips = [(xb + tl * 0.55, tb[1] - D * 0.42), (xb + tl * 1.0, tb[1] - D * 0.66), (xb + tl * 0.82, tb[1] - D * 0.30),
                (xb + tl * 0.42, tb[1] + D * 0.02), (xb + tl * 0.8, tb[1] + D * 0.32), (xb + tl * 0.98, tb[1] + D * 0.62),
                (xb + tl * 0.55, tb[1] + D * 0.4)]
    elif kind == "square":
        tips = [(xb + tl * 0.6, tb[1] - D * 0.40), (xb + tl * 0.98, tb[1] - D * 0.5), (xb + tl * 0.9, tb[1] - D * 0.12),
                (xb + tl * 0.88, tb[1] + D * 0.1), (xb + tl * 0.97, tb[1] + D * 0.48), (xb + tl * 0.6, tb[1] + D * 0.38)]
    elif kind == "round":
        tips = [(xb + tl * 0.5, tb[1] - D * 0.34), (xb + tl * 0.88, tb[1] - D * 0.3), (xb + tl * 1.02, tb[1]),
                (xb + tl * 0.88, tb[1] + D * 0.3), (xb + tl * 0.5, tb[1] + D * 0.34)]
    else:  # veil: long flowing double lobes with a ragged trailing edge
        tips = [(xb + tl * 0.5, tb[1] - D * 0.5), (xb + tl * 1.0, tb[1] - D * 0.85), (xb + tl * 1.2, tb[1] - D * 0.4),
                (xb + tl * 0.95, tb[1] - D * 0.05), (xb + tl * 1.25, tb[1] + D * 0.3), (xb + tl * 1.05, tb[1] + D * 0.8),
                (xb + tl * 0.55, tb[1] + D * 0.55)]
    tips = wobble(tips, rng, 0.25)
    tail = fan(t0, t1, tips)
    shapes.append({"type": "polygon", "points": _L(tail), "material": "fin", "form": "pillow", "bevel": 1.2,
                   "part": "tail", "z": 0, "flow": [1, 0]})
    for k in range(7):  # rays fanning from the peduncle
        f = (k + 0.5) / 7
        root = (tb[0] - 0.5, t0[1] + (t1[1] - t0[1]) * f)
        tip = tips[min(len(tips) - 1, int(f * len(tips)))]
        midp = (root[0] * 0.5 + tip[0] * 0.5, root[1] * 0.45 + tip[1] * 0.55)
        shapes.append({"type": "stroke", "points": _L([root, midp, (tip[0] - 0.8, tip[1])]), "width": [0.9, 0.8, 0.6],
                       "material": "fin", "bias": -1.3, "part": "tail_ray", "z": 0.5, "clip": "tail"})
    # ---- dorsal fin
    dt = F["dorsal"]
    if dt == "spiny":  # spines with scalloped membrane, then a soft rear lobe
        u0, u1 = 0.26, 0.58
        n = 7
        base = [at(u0 + (u1 - u0) * k / (n - 1), -0.92) for k in range(n)]
        hts = [D * (0.28 + 0.22 * math.sin(math.pi * (k + 0.6) / n)) * rng.uniform(0.85, 1.1) for k in range(n)]
        tips = [(bx + D * 0.08, by - h) for (bx, by), h in zip(base, hts)]
        fin_d = fan(at(u0 - 0.02, -0.85), at(u1 + 0.02, -0.86), tips, scallop=0.6)
        soft = fan(at(u1, -0.88), at(0.8, -0.78), [at(0.62, -1.9), at(0.72, -1.7), at(0.79, -1.2)])
        shapes.append({"type": "polygon", "points": _L(fin_d), "material": "fin", "form": "flat", "part": "dorsal", "z": 0.2})
        shapes.append({"type": "polygon", "points": _L(soft), "material": "fin", "form": "pillow", "bevel": 1,
                       "part": "dorsal2", "z": 0.1})
        for (bx, by), (tx, ty) in zip(base, tips):
            shapes.append({"type": "stroke", "points": _L([(bx, by + 0.5), (tx + 0.3, ty - 0.8)]), "width": [1.0, 0.5],
                           "material": "fin", "bias": -1.0, "part": "spine", "z": 0.6})
    else:
        if dt == "long":
            u0, u1, hgt = 0.3, 0.78, 0.36
        elif dt == "rear":
            u0, u1, hgt = 0.68, 0.86, 0.42
        else:
            u0, u1, hgt = 0.36, 0.58, 0.48
        tips = [at(u0 + (u1 - u0) * f, -1.0) for f in (0.15, 0.4, 0.7, 1.0)]
        tips = [(x + D * (0.12 + 0.1 * k), y - D * hgt * (1.0 - 0.18 * k)) for k, (x, y) in enumerate(tips)]
        fin_d = fan(at(u0, -0.88), at(u1 + 0.05, -0.85), wobble(tips, rng, 0.2))
        shapes.append({"type": "polygon", "points": _L(fin_d), "material": "fin", "form": "pillow", "bevel": 1,
                       "part": "dorsal", "z": 0.2})
        for f in np.linspace(0.1, 0.9, 5):
            bx, by = at(u0 + (u1 - u0) * f, -0.9)
            shapes.append({"type": "stroke", "points": _L([(bx, by), (bx + D * 0.25, by - D * hgt)]), "width": [0.8, 0.6],
                           "material": "fin", "bias": -1.2, "part": "dray", "z": 0.6, "clip": "dorsal"})
    if F.get("adipose"):
        ax, ay = at(0.86, -0.9)
        shapes.append({"type": "polygon", "points": _L(blob(ax + 0.6, ay - D * 0.08, D * 0.09, D * 0.07, rng, 0.1, 7)),
                       "material": "fin", "form": "dome", "part": "adipose", "z": 0.2})
    # ---- anal + pelvic fins (behind the body)
    for (ua, ub, hgt, name) in ((0.66, 0.8, 0.32, "anal"), (0.3, 0.38, 0.3, "pelvic")):
        b0, b1 = at(ua, 0.85), at(ub, 0.85)
        tips = [(b0[0] + D * 0.2, b0[1] + D * hgt), (b1[0] + D * 0.12, b1[1] + D * hgt * 0.7)]
        shapes.append({"type": "polygon", "points": _L(fan(b0, b1, wobble(tips, rng, 0.2))), "material": "fin",
                       "form": "pillow", "bevel": 1, "part": name, "z": 0.2})
        shapes.append({"type": "stroke", "points": _L([((b0[0] + b1[0]) / 2, b0[1]), tips[0]]), "width": [0.8, 0.6],
                       "material": "fin", "bias": -1.2, "part": name + "_ray", "z": 0.6, "clip": name})
    # ---- body
    shapes.append({"type": "polygon", "points": _L(body), "material": "body", "form": "dome", "part": "body", "z": 1,
                   "scales": {"size": 3.2 if F.get("big_scales") else 2.2, "amount": -0.75 if F.get("big_scales") else -0.5},
                   "flow": [1, 0]})
    # belly: a curved boundary that follows the ventral profile
    bl = [at(uu, 0.05 + 0.15 * math.sin(math.pi * uu)) for uu in np.linspace(0.02, 1.0, 12)]
    belly = bl + [(xb + 2, H + 2), (x0 - 2, H + 2)]
    shapes.append({"type": "polygon", "points": _L(belly), "material": "belly", "form": "dome", "part": "body",
                   "z": 1.1, "clip": "body", "grad": {"from": [0, cy], "to": [0, cy + D * 0.5], "amount": 0.7}})
    if F.get("head"):  # spawning salmon: olive head behind a curved gill line
        mats["head"] = {"base": F["head"], "steps": 7, "contrast": 1.3}
        hp = [at(0.24, -1.2), at(0.21, -0.3), at(0.23, 0.4), at(0.2, 1.2)]
        shapes.append({"type": "polygon", "points": _L(catmull(hp, 3) + [(x0 - 3, H + 2), (x0 - 3, -2)]), "material": "head",
                       "form": "dome", "part": "body", "z": 1.15, "clip": "body"})
    # ---- markings
    for k in range(F.get("bars", 0)):
        uu = 0.3 + 0.1 * k + j(0.015)
        w = 0.035 + j(0.008)
        e0 = [at(uu + 0.01 * s, -1.1 + 0.7 * s) for s in np.linspace(0, 1.3, 5)]
        e1 = [at(uu + w + 0.012 * s, -1.1 + 0.7 * s) for s in np.linspace(1.3, 0, 5)]
        shapes.append({"type": "polygon", "points": _L(catmull(wobble(e0 + e1, rng, 0.25), 3, closed=True)),
                       "material": "body", "bias": -1.8, "form": "dome", "part": "body", "z": 1.3, "clip": "body"})
    if F.get("band"):
        mats["band"] = {"base": F["band"], "steps": 6, "contrast": 1.0}
        pts = [at(uu, 0.05) for uu in np.linspace(0.2, 0.98, 8)]
        shapes.append({"type": "stroke", "points": _L(pts), "width": [D * 0.12, D * 0.22, D * 0.2, D * 0.12],
                       "material": "band", "form": "cylinder", "part": "body", "z": 1.25, "clip": "body"})
    if F.get("spots"):
        mats["spot"] = {"base": F["spot_col"], "steps": 4, "contrast": 0.6}
        for k in range(F["spots"]):
            uu, kk = rng.uniform(0.18, 0.97), rng.uniform(-0.85, 0.25)
            sx, sy = at(uu, kk)
            r = rng.uniform(0.5, 1.0) * (1.4 if species == "pike" else 1.0)
            shapes.append({"type": "polygon", "points": _L(blob(sx, sy, r * (1.6 if species == "pike" else 1.0), r, rng, 0.25, 6)),
                           "material": "spot", "part": "body", "z": 1.35, "clip": "body"})
    if F.get("mottle"):
        mats["mottle"] = {"base": F["mottle"], "steps": 5}
        for k in range(10):
            sx, sy = at(rng.uniform(0.2, 0.95), rng.uniform(-0.9, 0.0))
            shapes.append({"type": "polygon", "points": _L(blob(sx, sy, D * 0.12, D * 0.08, rng, 0.35, 7)),
                           "material": "mottle", "form": "dome", "part": "body", "z": 1.3, "clip": "body"})
    for key in ("patches", "patches2"):
        col = F.get(key)
        if not col:
            continue
        mats[key] = {"base": col, "steps": 7, "contrast": 1.2}
        for k in range(int(rng.integers(2, 4)) if key == "patches" else 2):
            sx, sy = at(rng.uniform(0.25, 0.9) if key == "patches" else rng.uniform(0.45, 0.85), rng.uniform(-0.8, 0.1))
            shapes.append({"type": "polygon", "points": _L(blob(sx, sy, L * rng.uniform(0.08, 0.15) * (0.6 if key == "patches2" else 1),
                                                                D * rng.uniform(0.18, 0.3) * (0.6 if key == "patches2" else 1),
                                                                rng, 0.32, 9)),
                           "material": key, "form": "dome", "part": "body", "z": 1.3 + 0.01 * k, "clip": "body"})
    for uu in np.arange(0.24, 0.95, 0.055):  # lateral line: dashes following the body
        p0, p1 = at(uu, -0.22 + 0.15 * uu), at(uu + 0.03, -0.22 + 0.15 * (uu + 0.03))
        shapes.append({"type": "stroke", "points": _L([p0, p1]), "width": 0.8, "material": "body", "bias": 1.0,
                       "part": "body", "z": 1.4, "clip": "body"})
    # ---- head: gill cover (dark line with a lit lip behind it), lips, nostril, eye
    gu = 0.2 + j(0.015)
    gill = [at(gu - 0.02, -0.75), at(gu + 0.02, -0.25), at(gu + 0.015, 0.3), at(gu - 0.03, 0.8)]
    shapes.append({"type": "stroke", "points": _L(catmull(gill, 4)), "width": [0.9, 1.1, 1.0, 0.7], "material": "body",
                   "bias": -2.2, "part": "gill", "z": 1.6, "clip": "body"})
    shapes.append({"type": "stroke", "points": _L(catmull([(x + 0.9, y) for x, y in gill], 4)), "width": 0.7,
                   "material": "body", "bias": 1.2, "part": "gill_lit", "z": 1.55, "clip": "body"})
    if F.get("ear"):
        mats["ear"] = {"base": F["ear"], "steps": 4}
        ex_, ey_ = at(gu + 0.01, -0.2)
        shapes.append({"type": "polygon", "points": _L(blob(ex_ + 1.0, ey_, D * 0.1, D * 0.08, rng, 0.15, 7)),
                       "material": "ear", "form": "dome", "part": "earflap", "z": 1.7, "clip": "body"})
    jaw = F.get("jaw", 0.0)
    lip = [(x0 + 0.3, mouth_y), (x0 + L * (0.05 + jaw * 0.2), mouth_y + D * 0.02),
           (x0 + L * (0.08 + jaw * 0.25), mouth_y + D * (0.0 + 0.04 * sn))]
    shapes.append({"type": "stroke", "points": _L(catmull(lip, 3)), "width": [1.0, 0.9, 0.6], "material": "body",
                   "bias": -2.6, "part": "mouth", "z": 1.65, "clip": "body"})
    pb0, pb1 = at(gu + 0.04, 0.1), at(gu + 0.05, 0.4)   # pectoral fin, over the body behind the gill
    ptips = [(pb0[0] + L * 0.13, pb0[1] + D * 0.08), (pb0[0] + L * 0.16, pb0[1] + D * 0.24),
             (pb1[0] + L * 0.1, pb1[1] + D * 0.2)]
    shapes.append({"type": "polygon", "points": _L(fan(pb0, pb1, wobble(ptips, rng, 0.2))), "material": "fin",
                   "form": "pillow", "bevel": 1, "part": "pectoral", "z": 2, "bias": 1.3})
    for t in ptips[:2]:
        shapes.append({"type": "stroke", "points": _L([((pb0[0] + pb1[0]) / 2, (pb0[1] + pb1[1]) / 2), t]),
                       "width": [0.8, 0.5], "material": "fin", "bias": -1.2, "part": "pec_ray", "z": 2.1, "clip": "pectoral"})
    er = max(1.2, D * 0.085 * (1.25 if species == "goldfish" else 1.0)) * rng.uniform(0.95, 1.08)   # eye: socket ring, iris, forward pupil, catch-light
    ex, ey = at(0.1 + 0.02 * sn, -0.38)
    shapes.append({"type": "polygon", "points": _L(blob(ex, ey, er * 1.25, er * 1.2, rng, 0.06, 8)), "material": "eye",
                   "bias": -9, "part": "socket", "z": 3})
    shapes.append({"type": "polygon", "points": _L(blob(ex, ey, er, er * 0.97, rng, 0.05, 8)), "material": "iris",
                   "form": "dome", "part": "iris", "z": 3.1})
    shapes.append({"type": "polygon", "points": _L(blob(ex - er * 0.18, ey + er * 0.05, er * 0.55, er * 0.6, rng, 0.05, 7)),
                   "material": "eye", "bias": -9, "part": "pupil", "z": 3.2})
    shapes.append({"type": "pixels", "at": [int(ex - er * 0.45), int(ey - er * 0.55)], "art": ["w"], "key": {"w": "#ffffff"}})
    nx_, ny_ = at(0.045, -0.35)
    shapes.append({"type": "pixels", "at": [int(nx_), int(ny_)], "art": ["d"], "key": {"d": "body:1"}})
    if F.get("barbels"):
        for k, (dy0, dy1) in enumerate(((0.0, 0.4), (0.15, 0.85))):
            p0 = (x0 + 0.8, mouth_y + D * dy0 * 0.3)
            pts = catmull([p0, (x0 - L * 0.03, p0[1] + D * dy1 * 0.4), (x0 - L * 0.04, p0[1] + D * dy1 * 0.9),
                           (x0 - L * 0.02 + j(1), p0[1] + D * dy1 * 1.2)], 3)
            shapes.append({"type": "stroke", "points": _L(pts), "width": [1.2, 1.0, 0.8, 0.6], "material": "fin",
                           "form": "cylinder", "part": f"barbel{k}", "z": 2.5})
    return {"size": [W, H], "materials": mats, "shapes": shapes, "outline": "selout", "name": species,
            "meta": {"generator": "fish", "seed": seed, "species": species}}


# ====================================================================== swords
SWORD_THEMES = {
    "steel":    dict(blade="#a9b6c6", guard="#d2a542", grip="#6e4129", pommel="#d2a542", gem="#d23a4a"),
    "frost":    dict(blade="#93dcff", guard="#3f6fb0", grip="#2c3b5c", pommel="#a8eaff", gem="#e8fbff", rune="#d8ffff"),
    "ember":    dict(blade="#ff9a3a", guard="#4a3634", grip="#2e2222", pommel="#ff8a2a", gem="#ffd25a", rune="#fff09a",
                     glow="#ff7a1c", hot=True),
    "void":     dict(blade="#6a4fd8", guard="#2c2a44", grip="#1e1a2c", pommel="#8e6bff", gem="#ff4fd8", rune="#f0a8ff"),
    "verdant":  dict(blade="#5fc890", guard="#9a7a3a", grip="#4a3a22", pommel="#c4a24a", gem="#7dff9a", vine="#3f8a3a"),
    "obsidian": dict(blade="#463a58", guard="#8a2430", grip="#24181c", pommel="#b0303a", gem="#ff3a3a", rune="#ff6a3a"),
    "bone":     dict(blade="#e4d8ba", guard="#7a6a52", grip="#8a5a3a", pommel="#e4d8ba", gem="#5fd0ff"),
    "royal":    dict(blade="#d2dbe6", guard="#e7b94a", grip="#3a2a6e", pommel="#e7b94a", gem="#4a8aff"),
}


def sword(seed=0, size=64, theme=None, curve=None, tip=None, guard=None, edge=None, length=None, width=None,
          runes=None, diagonal=True):
    rng = np.random.default_rng(seed)
    theme = theme or list(SWORD_THEMES)[rng.integers(len(SWORD_THEMES))]
    T = SWORD_THEMES[theme]
    S = float(size)
    cx = S / 2
    Ltot = S * (length or rng.uniform(1.18, 1.3)) * (1.0 if diagonal else 0.88)
    top = S / 2 - Ltot / 2
    blade_len = Ltot * rng.uniform(0.63, 0.69)
    gy = top + blade_len            # guard line
    bw = S * (width or rng.uniform(0.1, 0.14))
    curve = float(rng.choice([0.0, 0.0, 0.0, rng.uniform(0.05, 0.12)]) if curve is None else curve)
    tip = tip or str(rng.choice(["point", "point", "leaf", "clip", "spear", "broad"]))
    edge = edge or str(rng.choice(["plain", "plain", "plain", "serrated", "wavy", "notched"]))
    gstyle = guard or str(rng.choice(["cross", "cross", "curled", "swept", "wings", "disc"]))

    # ---- blade outline: smooth curves from guard (u=0) to tip (u=1); leaf blades swell, sabres curve
    n = 22
    left, right = [], []
    swell = 0.18 if tip == "leaf" else rng.uniform(0.0, 0.06)
    taper = rng.uniform(0.08, 0.25)
    tip_len = {"point": 0.15, "leaf": 0.24, "clip": 0.2, "spear": 0.3, "broad": 0.07}[tip]
    for i in range(n + 1):
        uu = i / n
        y = gy - uu * blade_len
        w = bw * (1 - taper * uu + swell * math.sin(math.pi * min(1.0, uu / 0.85)))
        if uu > 1 - tip_len:
            k = min(1.0, (uu - (1 - tip_len)) / tip_len)
            w *= {"point": 1 - k ** 1.15, "leaf": math.cos(k * math.pi / 2) ** 0.8, "spear": (1 - k) ** 0.75,
                  "broad": max(0.0, 1 - k ** 2.6), "clip": 1 - k}[tip]
        xo = curve * S * uu * uu
        wl, wr = w / 2, w / 2
        if tip == "clip" and uu > 1 - tip_len:
            k = (uu - (1 - tip_len)) / tip_len
            wl = bw * (1 - taper) / 2 * (1 - k ** 3)
            wr = max(w - wl, 0.0)
        if edge == "wavy" and uu < 1 - tip_len:
            o = math.sin(uu * math.pi * 6.5) * bw * 0.1
            wl, wr = wl + o, wr - o
        left.append((cx + xo - wl, y))
        right.append((cx + xo + wr, y))
    tipx = cx + curve * S
    left = catmull(left, 3)
    right = catmull(right, 3)
    if edge == "serrated":  # teeth along the back edge
        right = [(x + (bw * 0.16 if (k // 3) % 2 and 0.12 < (gy - y) / blade_len < 0.75 else 0), y)
                 for k, (x, y) in enumerate(right)]
    if edge == "notched":  # a few hand-cut nicks along the front edge
        cuts = rng.uniform(0.15, 0.75, 3)
        left = [(x + (bw * 0.18 if any(abs((gy - y) / blade_len - c) < 0.025 for c in cuts) else 0), y) for x, y in left]
    blade = left + right[::-1]
    shapes, mats = [], {}
    mats["blade"] = {"base": T["blade"], "steps": 8, "spec": 1.0, "contrast": 1.25, "rim": 1.0, "texture": "metal",
                     "hue_shift": 26, "spec_threshold": 0.975}
    if T.get("hot"):
        mats["blade"].update({"emissive": True, "tone": 4.2, "glow_gradient": 1.5, "texture": "liquid", "spec": 0})
    shapes.append({"type": "polygon", "points": _L(blade), "material": "blade", "form": "ridge",
                   "axis": [[cx, gy], [tipx, top]], "tilt": 0.5, "part": "blade", "z": 1,
                   "edge": {"light": 2.2, "dark": -0.8, "width": 1.0}})
    # fuller: a groove that follows the blade's curve
    if bw > S * 0.09 and tip != "spear" and rng.random() < 0.75:
        f1 = rng.uniform(0.45, 0.68)
        pts = [(cx + curve * S * uu * uu, gy - uu * blade_len) for uu in np.linspace(0.04, f1, 6)]
        shapes.append({"type": "stroke", "points": _L(pts), "width": [bw * 0.24, bw * 0.22, bw * 0.1], "material": "blade",
                       "form": "cylinder", "bias": -1.4, "part": "fuller", "z": 1.5, "clip": "blade"})
    for k in range(int(rng.integers(2, 5))):  # wear: hand-placed scratches running along the blade
        uu = rng.uniform(0.1, 0.8)
        x = cx + curve * S * uu * uu + rng.uniform(-0.3, 0.3) * bw
        y = gy - uu * blade_len
        ln = rng.uniform(1.5, 3.5)
        shapes.append({"type": "stroke", "points": _L([(x, y), (x + rng.uniform(-0.5, 0.5), y - ln)]), "width": 0.7,
                       "material": "blade", "bias": float(rng.choice([-1.2, 1.4])), "part": "scratch", "z": 1.6,
                       "clip": "blade"})
    rune = runes if runes is not None else T.get("rune")
    if rune:  # glyphs: little hand-drawn strokes (bars, hooks, ticks) down the blade
        mats["rune"] = {"base": rune, "steps": 5, "emissive": True, "tone": 3.4}
        y = gy - blade_len * 0.1
        while y > gy - blade_len * 0.68:
            uu = (gy - y) / blade_len
            x = cx + curve * S * uu * uu
            g = int(rng.integers(4))
            h = rng.uniform(1.6, 2.6)
            glyph = {0: [(x, y), (x, y - h)], 1: [(x - 0.8, y), (x, y - h * 0.5), (x - 0.8, y - h)],
                     2: [(x + 0.8, y), (x - 0.6, y - h * 0.4), (x + 0.8, y - h)], 3: [(x - 0.9, y - h / 2), (x + 0.9, y - h / 2)]}[g]
            shapes.append({"type": "stroke", "points": _L(glyph), "width": 0.9, "material": "rune", "part": "rune",
                           "z": 2, "clip": ["blade", "fuller"]})
            y -= h + rng.uniform(1.0, 2.0)
    if T.get("vine"):  # verdant: a vine twisting up the blade, with leaves
        mats["vine"] = {"base": T["vine"], "steps": 6, "contrast": 1.2, "texture": "organic"}
        pts = [(cx + curve * S * uu * uu + math.sin(uu * 14 + 1) * bw * 0.32, gy - uu * blade_len)
               for uu in np.linspace(0.0, 0.55, 12)]
        shapes.append({"type": "stroke", "points": _L(pts), "width": [1.4, 1.2, 0.8], "material": "vine",
                       "form": "cylinder", "part": "vine", "z": 2.2})
        for uu in (0.15, 0.32, 0.48):
            vx, vy = cx + math.sin(uu * 14 + 1) * bw * 0.32, gy - uu * blade_len
            side = 1 if math.cos(uu * 14 + 1) > 0 else -1
            leaf = blob(vx + side * 1.6, vy - 0.6, 1.6, 0.9, rng, 0.1, 6, angle=-0.6 * side)
            shapes.append({"type": "polygon", "points": _L(leaf), "material": "vine", "form": "ridge", "part": "leaf",
                           "z": 2.3, "bias": 0.8})
    # ---- guard: hand-drawn quillons (tapered curved strokes)
    gw = S * rng.uniform(0.28, 0.38)
    gh = max(2.2, S * rng.uniform(0.045, 0.06))
    mats["guard"] = {"base": T["guard"], "steps": 7, "spec": 0.8, "contrast": 1.4, "texture": "metal",
                     "spec_threshold": 0.95}
    gyc = gy + gh * 0.45
    for side in (-1, 1):
        if gstyle in ("cross", "disc"):
            pts = [(cx, gyc), (cx + side * gw * 0.25, gyc - gh * 0.05), (cx + side * gw * 0.45, gyc - gh * 0.25),
                   (cx + side * gw * 0.52, gyc - gh * 0.55)]
            wd = [gh * 1.2, gh * 1.0, gh * 0.95, gh * 1.15]
        elif gstyle == "curled":
            pts = [(cx, gyc), (cx + side * gw * 0.3, gyc + gh * 0.1), (cx + side * gw * 0.48, gyc - gh * 0.6),
                   (cx + side * gw * 0.42, gyc - gh * 1.5), (cx + side * gw * 0.32, gyc - gh * 1.3)]
            wd = [gh * 1.2, gh, gh * 0.85, gh * 0.7, gh * 0.55]
        elif gstyle == "swept":
            pts = [(cx, gyc), (cx + side * gw * 0.28, gyc + gh * 0.3), (cx + side * gw * 0.44, gyc + gh * 1.5),
                   (cx + side * gw * 0.4, gyc + gh * 2.8)]
            wd = [gh * 1.2, gh, gh * 0.8, gh * 0.45]
        else:  # wings: feathered plates sweeping up
            pts = [(cx, gyc), (cx + side * gw * 0.3, gyc - gh * 0.4), (cx + side * gw * 0.55, gyc - gh * 1.8)]
            wd = [gh * 1.6, gh * 1.4, gh * 0.4]
        shapes.append({"type": "stroke", "points": _L(catmull(pts, 4)), "width": wd, "material": "guard",
                       "form": "cylinder", "part": f"quillon{side}", "z": 3, "edge": {"light": 1.2, "width": 0.9}})
        if gstyle == "wings":
            for k in range(3):
                fx = cx + side * gw * (0.2 + 0.12 * k)
                shapes.append({"type": "stroke", "points": _L([(fx, gyc - gh * 0.1),
                                                               (fx + side * gw * 0.12, gyc - gh * (0.9 + 0.4 * k))]),
                               "width": 0.8, "material": "guard", "bias": -1.4, "part": "feather", "z": 3.2,
                               "clip": f"quillon{side}"})
    if gstyle == "disc":
        shapes.append({"type": "polygon", "points": _L(blob(cx, gyc, gw * 0.3, gh * 1.05, rng, 0.06, 10)),
                       "material": "guard", "form": "bevel", "bevel": 1.2, "part": "disc", "z": 3.1})
    shapes.append({"type": "polygon", "points": _L(blob(cx, gyc, gh * 1.15, gh * 1.05, rng, 0.08, 8)), "material": "guard",
                   "form": "dome", "part": "boss", "z": 3.5})
    if T.get("gem") and rng.random() < 0.9:
        mats["gem"] = {"base": T["gem"], "steps": 6, "spec": 1.0, "spec_threshold": 0.93, "contrast": 1.8}
        shapes.append({"type": "gem", "outer": _L(blob(cx, gyc, gh * 0.68, gh * 0.68, rng, 0.04, 6)), "material": "gem",
                       "part": "gem", "z": 4, "table_scale": 0.45, "refraction": 1.0})
    # ---- grip: leather wrapped diagonally, ending in a ferrule ring
    gl = (S / 2 + Ltot / 2 - gyc) * 0.74
    gr0, gr1 = gyc + gh * 0.6, gyc + gh * 0.6 + gl
    gwid = max(2.6, S * 0.06)
    mats["grip"] = {"base": T["grip"], "steps": 6, "contrast": 1.2, "texture": "leather"}
    shapes.append({"type": "stroke", "points": _L([(cx, gr0), (cx + 0.15, (gr0 + gr1) / 2), (cx, gr1)]),
                   "width": [gwid, gwid * 1.08, gwid], "material": "grip", "form": "cylinder", "part": "grip", "z": 2,
                   "stripes": {"from": [cx, gr0], "to": [cx, gr1], "period": max(2.2, S * 0.05), "duty": 0.38,
                               "amount": -1.6, "slant": 0.75}})
    # ---- pommel: a faceted cap or a carved bulb
    mats["pommel"] = {"base": T["pommel"], "steps": 7, "spec": 0.9, "contrast": 1.5, "texture": "metal"}
    pr = max(2.0, S * rng.uniform(0.05, 0.065))
    shapes.append({"type": "polygon", "points": _L(blob(cx, gr1 + 0.4, gwid * 0.75, gh * 0.55, rng, 0.05, 8)),
                   "material": "pommel", "form": "dome", "part": "ferrule", "z": 2.6})
    if rng.random() < 0.5:
        shapes.append({"type": "polygon", "points": _L(blob(cx, gr1 + pr * 0.95, pr, pr * 1.05, rng, 0.06, 9)),
                       "material": "pommel", "form": "dome", "part": "pommel", "z": 3})
    else:
        outer = [(cx, gr1 - pr * 0.1), (cx + pr * 0.8, gr1 + pr * 0.35), (cx + pr * 1.05, gr1 + pr * 1.0),
                 (cx + pr * 0.55, gr1 + pr * 1.8), (cx, gr1 + pr * 2.3), (cx - pr * 0.55, gr1 + pr * 1.8),
                 (cx - pr * 1.05, gr1 + pr * 1.0), (cx - pr * 0.8, gr1 + pr * 0.35)]
        shapes.append({"type": "gem", "outer": _L(outer), "material": "pommel", "part": "pommel", "z": 3,
                       "table_scale": 0.38, "tilt": 0.8})
    fx = {}
    if T.get("glow"):
        fx["glow"] = {"color": T["glow"], "radius": 1 if size <= 32 else 2, "alpha": 110}
    if theme in ("frost", "void", "royal", "steel"):
        fx["sparkle"] = "auto"
    return {"size": [size, size], "view": {"rotate": 45 if diagonal else 0}, "materials": mats, "shapes": shapes,
            "outline": "selout", "name": f"{theme} sword", "effects": fx,
            "meta": {"generator": "sword", "seed": seed, "theme": theme, "tip": tip, "edge": edge, "guard": gstyle,
                     "curve": round(curve, 3)}}


# ======================================================================== gems
GEM_CUTS = ["round", "oval", "cushion", "emerald", "pear", "trillion", "marquise", "heart", "hexagon", "princess"]
GEM_COLOURS = {"ruby": "#d01c3a", "sapphire": "#2456d8", "emerald": "#18a85a", "amethyst": "#8e3ad0", "topaz": "#f0a020",
               "citrine": "#e8c81c", "aquamarine": "#4ad2d8", "diamond": "#c8e4f4", "onyx": "#3a3448", "rose": "#f07aa8",
               "peridot": "#9ad82c", "garnet": "#8a1a2a"}


def _cut_outline(cut, cx, cy, r):
    if cut in ("round", "oval", "hexagon"):
        n = {"round": 12, "oval": 12, "hexagon": 6}[cut]
        sx = 0.76 if cut == "oval" else 1.0
        return [(cx + r * sx * math.cos(-math.pi / 2 + 2 * math.pi * k / n), cy + r * math.sin(-math.pi / 2 + 2 * math.pi * k / n))
                for k in range(n)]
    if cut in ("cushion", "emerald", "princess"):
        c = r * {"cushion": 0.38, "emerald": 0.28, "princess": 0.08}[cut]
        w = r * (0.74 if cut == "emerald" else 0.95)
        return [(cx - w + c, cy - r), (cx + w - c, cy - r), (cx + w, cy - r + c), (cx + w, cy + r - c),
                (cx + w - c, cy + r), (cx - w + c, cy + r), (cx - w, cy + r - c), (cx - w, cy - r + c)]
    if cut == "pear":
        pts = [(cx, cy - r)]
        for k in range(1, 12):
            a = -math.pi / 2 + 2 * math.pi * k / 12
            rr = r * (0.66 + 0.34 * (math.sin(a) + 1) / 2)
            pts.append((cx + rr * math.cos(a) * 0.9, cy + r * 0.22 + rr * math.sin(a)))
        return pts
    if cut == "trillion":
        return [(cx, cy - r), (cx + r * 0.5, cy + r * 0.05), (cx + r * 0.95, cy + r * 0.72), (cx, cy + r * 0.78),
                (cx - r * 0.95, cy + r * 0.72), (cx - r * 0.5, cy + r * 0.05)]
    if cut == "marquise":
        return [(cx, cy - r), (cx + r * 0.42, cy - r * 0.55), (cx + r * 0.56, cy), (cx + r * 0.42, cy + r * 0.55),
                (cx, cy + r), (cx - r * 0.42, cy + r * 0.55), (cx - r * 0.56, cy), (cx - r * 0.42, cy - r * 0.55)]
    if cut == "heart":
        pts = []
        for k in range(14):
            t = 2 * math.pi * k / 14
            x = 16 * math.sin(t) ** 3
            y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
            pts.append((cx + x * r / 17, cy + y * r / 17 + r * 0.05))
        return pts
    raise ValueError(cut)


def gem(seed=0, size=32, cut=None, colour=None):
    rng = np.random.default_rng(seed)
    cut = cut or GEM_CUTS[rng.integers(len(GEM_CUTS))]
    name = None
    if colour is None:
        name = list(GEM_COLOURS)[rng.integers(len(GEM_COLOURS))]
        colour = GEM_COLOURS[name]
    elif colour in GEM_COLOURS:
        name, colour = colour, GEM_COLOURS[colour]
    S = size
    r = S * 0.4
    outer = _cut_outline(cut, S / 2, S / 2, r)
    mats = {"gem": {"base": colour, "steps": 8, "spec": 1.0, "spec_threshold": 0.92, "contrast": 1.9, "rim": 1.5,
                    "hue_shift": 30, "texture": "crystal"}}
    ts = 0.5 if cut not in ("trillion", "marquise", "pear") else 0.42
    to = [-S * 0.025, -S * 0.035]
    shapes = [{"type": "gem", "outer": _L(outer), "material": "gem", "tilt": 1.05, "part": "gem", "table_scale": ts,
               "table_offset": to, "refraction": 1.4, "edge": {"light": 1.5, "width": 0.9}}]
    # star facets: thin lines from the table corners to the girdle, the way a jeweller draws them
    oc = np.mean(np.array(outer), axis=0)
    table = [tuple(oc + (np.array(p) - oc) * ts + np.array(to)) for p in outer]
    for k in range(0, len(outer), 2 if len(outer) > 8 else 1):
        a, b = table[k], outer[k]
        shapes.append({"type": "stroke", "points": _L([a, b]), "width": 0.6, "material": "gem",
                       "bias": 1.2 if (b[0] - oc[0]) + (b[1] - oc[1]) < 0 else -1.0, "part": "facet_line", "z": 2,
                       "clip": "gem"})
    gx = table[0][0] * 0.4 + table[len(table) // 2][0] * 0.6
    gy = table[0][1] * 0.5 + table[len(table) // 2][1] * 0.5
    shapes.append({"type": "polygon", "points": _L(blob(gx + S * 0.08, gy + S * 0.06, S * 0.05, S * 0.03, rng, 0.2, 6, 0.6)),
                   "material": "gem", "bias": 2.0, "part": "glint", "z": 3, "clip": "gem"})
    return {"size": [S, S], "materials": mats, "shapes": shapes, "outline": "selout", "effects": {"sparkle": "auto"},
            "name": f"{name or ''} {cut} gem".strip(),
            "meta": {"generator": "gem", "seed": seed, "cut": cut, "colour": colour, "stone": name}}


# ================================================================ ores, crystals
def _crystal(base, length, width, ang, rng, z, name, mat="min"):
    """A hexagonal crystal prism from the side: lit left face, mid front face, dark right face, faceted tip."""
    d = np.array([math.sin(ang), -math.cos(ang)])
    p = np.array([-d[1], d[0]])
    b = np.array(base, float)
    tipl = length * rng.uniform(0.22, 0.32)
    shaft = b + d * (length - tipl)
    tipp = b + d * length + p * width * rng.uniform(-0.12, 0.12)
    w = width / 2
    out = []
    for a0, a1, bias in ((-1.0, -0.45, 1.6), (-0.45, 0.45, 0.0), (0.45, 1.0, -1.7)):
        quad = [b + p * w * a0 * 0.92, b + p * w * a1 * 0.92, shaft + p * w * a1, tipp, shaft + p * w * a0]
        out.append({"type": "polygon", "points": _L([tuple(q) for q in quad]), "material": mat, "form": "flat",
                    "bias": bias, "part": name, "z": z, "flow": [float(d[0]), float(d[1])]})
    out.append({"type": "stroke", "points": _L([tuple(b + p * w * -0.45), tuple(shaft + p * w * -0.45), tuple(tipp)]),
                "width": 0.7, "material": mat, "bias": 3.0, "part": name + "_edge", "z": z + 0.01, "clip": name})
    s0 = b + d * length * rng.uniform(0.15, 0.4) + p * w * 0.1
    out.append({"type": "stroke", "points": _L([tuple(s0), tuple(s0 + d * length * 0.25)]), "width": 0.7,
                "material": mat, "bias": 1.4, "part": name + "_streak", "z": z + 0.02, "clip": name})
    return out


def ore(seed=0, size=32, kind=None, colour=None):
    rng = np.random.default_rng(seed)
    kind = kind or str(rng.choice(["ore", "crystal", "nugget", "ingot", "chunk"]))
    if colour is None:
        colour = list(GEM_COLOURS.values())[rng.integers(len(GEM_COLOURS))] if kind in ("crystal", "chunk") else \
            ["#e8b830", "#c87a3a", "#9ad0e8", "#5ad08a", "#d84a3a", "#b07ae0", "#e0e0d0"][rng.integers(7)]
    colour = GEM_COLOURS.get(colour, colour)
    S = size
    rock = _hsv(rng.uniform(0.55, 0.72), rng.uniform(0.06, 0.18), rng.uniform(0.42, 0.55))
    mats = {"rock": {"base": rock, "steps": 7, "contrast": 1.35, "noise": 0.35, "noise_scale": 1.6, "hue_shift": 18,
                     "texture": "stone"},
            "min": {"base": colour, "steps": 8, "spec": 1.0, "spec_threshold": 0.95, "contrast": 1.7, "rim": 1.2,
                    "hue_shift": 28, "texture": "crystal"}}
    shapes = []
    if kind in ("ore", "crystal"):
        rb = blob(S / 2, S * (0.6 if kind == "ore" else 0.76), S * 0.4, S * (0.3 if kind == "ore" else 0.15), rng, 0.14, 10)
        rb = [(x, min(y, S * (0.84 if kind == "ore" else 0.88))) for x, y in rb]  # sits on a flat-ish base
        shapes.append({"type": "gem", "outer": _L(rb[::3]), "material": "rock", "part": "rock", "z": 0, "tilt": 0.7,
                       "table_scale": 0.55, "table_offset": [-S * 0.03, -S * 0.06], "edge": {"light": 1.0, "width": 0.9}})
        mats["dirt"] = {"base": "#5a4630", "steps": 5, "texture": "organic"}
        for k in range(3):  # dirt tufts at the base
            dx = rng.uniform(0.25, 0.75) * S
            shapes.append({"type": "polygon", "points": _L(blob(dx, S * 0.86, S * 0.1, S * 0.035, rng, 0.3, 7)),
                           "material": "dirt", "form": "dome", "part": f"dirt{k}", "z": 0.5})
    if kind == "ore":
        for k in range(int(rng.integers(4, 7))):  # mineral chips breaking the rock surface
            a = rng.uniform(0, 2 * math.pi)
            d = rng.uniform(0.05, 0.26) * S
            c = (S / 2 + d * math.cos(a), S * 0.58 + d * 0.65 * math.sin(a))
            rr = S * rng.uniform(0.05, 0.09)
            chip = blob(c[0], c[1], rr, rr * 0.8, rng, 0.3, 6, rng.uniform(0, 3))
            shapes.append({"type": "gem", "outer": _L(chip[::3]), "material": "min", "part": f"vein{k}", "z": 1 + k * 0.01,
                           "tilt": 0.9, "table_scale": 0.45})
    elif kind == "crystal":
        n = int(rng.integers(3, 6))
        order = sorted(range(n), key=lambda k: abs(k - (n - 1) / 2), reverse=True)
        for rank, k in enumerate(order):
            off = (k - (n - 1) / 2)
            ang = off * 0.32 + rng.uniform(-0.12, 0.12)
            L = S * (0.62 - abs(off) * 0.11) * rng.uniform(0.9, 1.08)
            w = S * (0.16 - abs(off) * 0.02) * rng.uniform(0.9, 1.1)
            shapes += _crystal((S / 2 + off * S * 0.12, S * 0.78), L, w, ang, rng, 1 + rank, f"c{k}")
    elif kind == "nugget":
        del mats["rock"]
        for k in range(int(rng.integers(2, 4))):
            c = (S * (0.5 + rng.uniform(-0.18, 0.18)), S * (0.55 + rng.uniform(-0.12, 0.12)))
            rr = S * rng.uniform(0.16, 0.24)
            shapes.append({"type": "polygon", "points": _L(blob(c[0], c[1], rr, rr * 0.78, rng, 0.25, 9, rng.uniform(0, 3))),
                           "material": "min", "form": "dome", "part": f"nug{k}", "z": c[1],
                           "edge": {"light": 1.2, "width": 0.9}})
            for q in range(3):  # pits
                px_, py_ = c[0] + rng.uniform(-0.5, 0.5) * rr, c[1] + rng.uniform(-0.4, 0.4) * rr
                shapes.append({"type": "polygon", "points": _L(blob(px_, py_, 0.8, 0.6, rng, 0.2, 5)), "material": "min",
                               "bias": -2.0, "part": f"nug{k}", "z": c[1] + 0.01, "clip": f"nug{k}"})
    elif kind == "chunk":
        del mats["rock"]
        outer = blob(S / 2, S / 2, S * 0.36, S * 0.3, rng, 0.22, 8, rng.uniform(0, 3))
        shapes.append({"type": "gem", "outer": _L(outer[::3]), "material": "min", "part": "chunk", "tilt": 0.95,
                       "table_scale": 0.45, "refraction": 1.2, "edge": {"light": 1.4, "width": 0.9}})
    elif kind == "ingot":
        del mats["rock"]
        w, h, d = S * 0.4, S * 0.13, S * 0.2
        cx, cy = S / 2, S * 0.56
        top = [(cx - w + d * 0.7, cy - h - d * 0.45), (cx + w - d * 0.1, cy - h - d * 0.45), (cx + w - d * 0.5, cy - h + d * 0.18),
               (cx - w + d * 0.25, cy - h + d * 0.18)]
        front = [(cx - w + d * 0.25, cy - h + d * 0.18), (cx + w - d * 0.5, cy - h + d * 0.18), (cx + w - d * 0.3, cy + h),
                 (cx - w - d * 0.05, cy + h)]
        side = [(cx + w - d * 0.1, cy - h - d * 0.45), (cx + w + d * 0.15, cy + h * 0.25), (cx + w - d * 0.3, cy + h),
                (cx + w - d * 0.5, cy - h + d * 0.18)]
        shapes += [{"type": "polygon", "points": _L(front), "material": "min", "form": "bevel", "bevel": 1.1, "part": "front",
                    "z": 1, "edge": {"light": 1.0, "width": 0.9}},
                   {"type": "polygon", "points": _L(top), "material": "min", "form": "bevel", "bevel": 1.0, "bias": 1.5,
                    "part": "top", "z": 2},
                   {"type": "polygon", "points": _L(side), "material": "min", "form": "flat", "bias": -1.7, "part": "side",
                    "z": 2}]
        sx, sy = cx - d * 0.1, cy - h - d * 0.14   # a stamped mark on the top face
        shapes.append({"type": "polygon", "points": _L(blob(sx, sy, w * 0.25, d * 0.16, rng, 0.05, 8)), "material": "min",
                       "bias": -1.0, "part": "stamp", "z": 2.5, "clip": "top"})
    return {"size": [S, S], "materials": mats, "shapes": shapes, "outline": "selout",
            "effects": {"sparkle": "auto"} if kind in ("crystal", "chunk", "ore") else {}, "name": kind,
            "meta": {"generator": "ore", "seed": seed, "kind": kind, "colour": colour}}


# ===================================================================== potions
def potion(seed=0, size=32, colour=None, shape=None):
    rng = np.random.default_rng(seed)
    colour = colour or _hsv(rng.random(), rng.uniform(0.6, 0.95), rng.uniform(0.75, 0.95))
    shape = shape or str(rng.choice(["round", "flask", "vial", "bottle"]))
    S = size
    cx = S / 2
    prof = {  # a revolved silhouette: half-profile (y, radius) from the lip down
        "round": [(0.12, 0.10), (0.16, 0.085), (0.28, 0.085), (0.36, 0.15), (0.48, 0.33), (0.66, 0.37), (0.82, 0.3),
                  (0.9, 0.18), (0.92, 0.0)],
        "flask": [(0.1, 0.1), (0.14, 0.085), (0.34, 0.085), (0.5, 0.2), (0.74, 0.36), (0.88, 0.37), (0.92, 0.3), (0.93, 0.0)],
        "vial": [(0.1, 0.12), (0.14, 0.11), (0.2, 0.15), (0.3, 0.16), (0.8, 0.16), (0.88, 0.13), (0.92, 0.0)],
        "bottle": [(0.08, 0.1), (0.12, 0.09), (0.3, 0.09), (0.38, 0.22), (0.44, 0.27), (0.84, 0.27), (0.9, 0.22), (0.92, 0.0)],
    }[shape]
    prof = [(y + rng.uniform(-0.01, 0.01), r * rng.uniform(0.95, 1.05) if r else 0) for y, r in prof]
    right = [(cx + r * S, y * S) for y, r in prof]
    left = [(cx - r * S, y * S) for y, r in prof][::-1]
    outline = catmull(right, 4) + catmull(left, 4)
    mats = {"glass": {"ramp": ["#1a2238", "#2e3e5c", "#5a7a98", "#9cc0d6", "#d6eef6", "#ffffff"], "contrast": 1.0,
                      "spec": 1.0, "spec_threshold": 0.9, "rim": 1.0, "tone": 2.6},
            "liquid": {"base": colour, "steps": 7, "contrast": 1.5, "rim": 1.6, "hue_shift": 28, "texture": "liquid"},
            "cork": {"base": "#9a6a3a", "steps": 6, "contrast": 1.2, "texture": "wood"},
            "string": {"base": "#d8c8a0", "steps": 4}}
    shapes = [{"type": "polygon", "points": _L(outline), "material": "glass", "form": "dome", "part": "glass", "z": 0,
               "flow": [0, 1]}]
    ys = [p[0] for p in prof]
    rs = [p[1] for p in prof]
    level = S * (prof[-1][0] - (prof[-1][0] - prof[3][0]) * rng.uniform(0.55, 0.85))
    rl = float(np.interp(level / S, ys, rs)) * S
    surf = catmull([(cx - rl - 1, level), (cx, level - S * 0.035), (cx + rl + 1, level), (cx, level + S * 0.035)], 4,
                   closed=True)   # meniscus: the surface seen from slightly above
    shapes.append({"type": "polygon", "points": _L([(0, level), (S, level), (S, S), (0, S)]), "material": "liquid",
                   "form": "dome", "part": "liquid", "z": 1, "clip": "glass",
                   "grad": {"from": [0, level], "to": [0, S * 0.9], "amount": -0.9}})
    shapes.append({"type": "polygon", "points": _L(surf), "material": "liquid", "bias": 2.0, "part": "liquid", "z": 1.2,
                   "clip": "glass"})
    for k in range(int(rng.integers(2, 5))):  # rising bubbles
        bx, by = cx + rng.uniform(-0.5, 0.5) * rl, rng.uniform(level + 3, S * 0.86)
        r = rng.uniform(0.6, 1.1)
        shapes.append({"type": "polygon", "points": _L(blob(bx, by, r, r, rng, 0.1, 6)), "material": "liquid", "bias": 2.6,
                       "part": "bubble", "z": 2, "clip": "liquid"})
    yl = np.linspace(prof[3][0] * S + 1, prof[-2][0] * S - 1, 5)   # a long reflection streak on the glass
    streak = [(cx - float(np.interp(y / S, ys, rs)) * S * 0.62, y) for y in yl]
    shapes.append({"type": "stroke", "points": _L(catmull(streak, 3)), "width": [0.8, 1.2, 1.1, 0.7], "material": "glass",
                   "bias": 4, "part": "shine", "z": 4, "clip": ["glass", "liquid"]})
    ct = prof[0][0] * S   # cork with a bevelled top, tied with string
    cork = catmull([(cx - S * 0.1, ct + S * 0.06), (cx - S * 0.115, ct - S * 0.03), (cx, ct - S * 0.06),
                    (cx + S * 0.115, ct - S * 0.03), (cx + S * 0.1, ct + S * 0.06), (cx, ct + S * 0.075)], 3, closed=True)
    shapes.append({"type": "polygon", "points": _L(cork), "material": "cork", "form": "dome", "part": "cork", "z": 3,
                   "flow": [0, 1]})
    sy = prof[1][0] * S + S * 0.04
    shapes.append({"type": "stroke", "points": _L([(cx - S * 0.1, sy), (cx, sy + 0.5), (cx + S * 0.1, sy)]), "width": 1.0,
                   "material": "string", "form": "cylinder", "part": "string", "z": 3.5})
    shapes.append({"type": "stroke", "points": _L(catmull([(cx + S * 0.09, sy), (cx + S * 0.16, sy + S * 0.05),
                                                           (cx + S * 0.13, sy + S * 0.12)], 3)), "width": [1.0, 0.8, 0.6],
                   "material": "string", "form": "cylinder", "part": "string_end", "z": 3.5})
    return {"size": [S, S], "materials": mats, "shapes": shapes, "outline": "selout", "name": f"{shape} potion",
            "meta": {"generator": "potion", "seed": seed, "shape": shape, "colour": colour}}


GENERATORS = {"sword": sword, "gem": gem, "ore": ore, "fish": fish, "potion": potion}


# ================================================================== front door
def make(source, seed=0, size=None, paint=None, **params):
    """A generator name (sword, gem, ore, fish, potion) or a sprite spec (dict or .json path) ->
    (spec, PIL image). `params` go to the generator (species=, theme=, cut=, kind=, colour=, shape=...)."""
    import json
    import os

    from .sprite import render_sprite
    if isinstance(source, dict):
        spec = dict(source)
    elif isinstance(source, str) and source in GENERATORS:
        kw = dict(params)
        if size is not None:
            kw["size"] = size
        spec = GENERATORS[source](seed, **kw)
    elif isinstance(source, str) and os.path.exists(source):
        with open(source) as fh:
            spec = json.load(fh)
    else:
        raise ValueError(f"unknown sprite source {source!r}: use one of {sorted(GENERATORS)} or a spec .json")
    if paint:
        spec["paint"] = paint
    return spec, render_sprite(spec, seed)


def make_sheet(source, count=12, seed=0, size=None, paint=None, cols=None, **params):
    """Many seeded variations of one generator packed into a sprite sheet. Returns (sheet, specs, rects)."""
    from .sprite import sheet
    specs, ims = [], []
    for k in range(count):
        sp, im = make(source, seed + k, size, paint, **params)
        specs.append(sp)
        ims.append(im)
    sh, rects = sheet(ims, cols=cols or min(count, 6), pad=2)
    return sh, specs, rects
