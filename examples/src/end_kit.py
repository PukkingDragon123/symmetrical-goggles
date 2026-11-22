"""Shared rig helpers, End palettes and procedural card art for the Winterworks Living End creatures.

Used by enderfly.py, endling.py, gucker.py, obolisk.py and dragonling.py (all in this folder). Builds on hex_kit.py
(the Rig, pose timelines and ground lock). The End creatures are density 2: two texels per Minecraft pixel, so every
box size is a multiple of 0.5 px and card art is drawn one character per texel.

Card art is generated, not hand-typed: outlines are closed Catmull-Rom curves through control points (organic shapes
are curves, never bare polygons), veins are traced lines, eye-spots are concentric rings. Characters left out of a
style's `art_key` are painted by the style's layers and brush, so a membrane gets painted light and strokes while the
veins and eye-spots stay hand-placed.

Units are Minecraft pixels (16 per block). lowpix axes: Y up, the model faces +Z, ground at y = 0, "left" is +X.
"""
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import (ROOT, Rig, add, clamp, cycle, dump, euler, ground_lock, jitter, mirror_pose,  # noqa: E402,F401
                     osc, pos, r, rest_on_ground, ring, rot_matrix, sc, scale_pose, shake, spikes, spin, tatters,
                     timeline, wave)
from hex_kit import keys as _keys  # noqa: E402

DENSITY = 2


def keys(part_, axis, ks, ease="ease", ch=None):
    """A keyed track. Eased by default (not Catmull-Rom), so holds and blinks never overshoot past their keys."""
    return _keys(part_, axis, ks, ease=ease, ch=ch)

# ======================================================================= rig helpers
def M(v, s):
    """Mirror a position across X for side s (+1 left, -1 right)."""
    return (v[0] * s, v[1], v[2])


def MR(rot, s):
    """Mirror a rotation across X for side s."""
    return (rot[0], rot[1] * s, rot[2] * s)


def LR(s):
    return "l" if s > 0 else "r"


def snap(v, density=DENSITY):
    """Round a length to whole texels."""
    return max(1.0 / density, round(float(v) * density) / density)


def aim_mat(d):
    """World rotation whose local -Y points along d; local X stays level and as close to +X as possible."""
    d = np.array(d, float)
    y = -d / np.linalg.norm(d)
    ref = np.array([0.0, 0.0, 1.0]) if abs(y[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    x = np.cross(y, ref)
    x /= np.linalg.norm(x)
    if x[0] < 0:
        x = -x
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1)


def aim(d):
    return euler(aim_mat(d))


def limb(R, id, parent, start, end, thick, style, depth=None, **kw):
    """A box from `start` towards `end` (world), its length rounded to whole texels, pivot at `start`.
    Returns the real end point."""
    start, end = np.array(start, float), np.array(end, float)
    d = end - start
    L = snap(np.linalg.norm(d))
    R.part(id, parent, [thick, L, depth if depth is not None else thick], style, at=start, wrot=aim(d),
           offset=(0, -L / 2 + min(thick, depth or thick) / 4, 0), **kw)
    return start + d / np.linalg.norm(d) * L


def swing(d0, d1):
    """The shortest-arc rotation taking direction d0 to d1."""
    a, b = np.array(d0, float), np.array(d1, float)
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v, c = np.cross(a, b), float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1.0 / (1.0 + c))


def chain_pose(R, ids, dirs, keep=(), turn=None):
    """Pose a chain of limb boxes (built with `limb`, local -Y along each bone) so each points along a world direction
    of `dirs` (in the rest frame of the model); returns a pose dict of local rotation offsets (shortest arc, no twist).
    `keep`: children of the last bone (feet) that keep their rest world orientation, optionally turned by `turn`
    (a world rotation in degrees, e.g. a foot rolling off the ground)."""
    out = {}
    parent = next(p for p in R.P if p["id"] == ids[0]).get("parent")
    R0p = R.F[parent][0] if parent else np.eye(3)
    Wp = R0p
    for pid, d in zip(ids, dirs):
        R0 = R.F[pid][0]
        Rl0 = R0p.T @ R0
        W_inh = Wp @ Rl0
        W = swing(W_inh @ np.array([0.0, -1.0, 0.0]), d) @ W_inh
        out[pid] = {"r": euler(Rl0.T @ Wp.T @ W)}
        Wp, R0p = W, R0
    for kid in keep:
        R0 = R.F[kid][0]
        Rl0 = R0p.T @ R0
        W = (rot_matrix(turn) if turn is not None else np.eye(3)) @ R0
        out[kid] = {"r": euler(Rl0.T @ Wp.T @ W)}
    return out


def rest_rot(R, pid):
    return next(p for p in R.P if p["id"] == pid).get("rotation", [0, 0, 0])


def toward(R, pid, target):
    """Pose dict turning joint `pid` from its rest rotation to the absolute local rotation `target` (degrees)."""
    return {pid: {"r": euler(rot_matrix(rest_rot(R, pid)).T @ rot_matrix(target))}}


def abs_track(R, pid, length, fn, fps=24, loop=True):
    """A rotation track sampled from fn(t) -> absolute local rotation (degrees), converted to deltas from the rest
    rotation (joints with a folded rest pose, such as wings, flap about their spread pose)."""
    Rr = rot_matrix(rest_rot(R, pid))
    n = max(2, int(round(length * fps)))
    ks = []
    prev = None
    for k in range(n + 1):
        t = length * k / n
        e = np.array(euler(Rr.T @ rot_matrix(fn(t))))
        if prev is not None:   # keep the angles continuous
            e = prev + ((e - prev + 180) % 360 - 180)
        prev = e
        ks.append([round(t, 4), [round(float(v), 3) for v in e]])
    if loop:
        ks[-1][1] = ks[0][1]
    return {"part": pid, "channel": "rotation", "keys": ks, "ease": "smooth"}


# ======================================================================= palettes
# The End: pale end stone, purpur, obsidian, chorus violets. Glow ramps are kept apart from every body ramp (the
# exporter puts exactly the texels of a glow ramp's colours into <name>_glow.png).
END_RAMPS = {
    "endstone": ["#26241d", "#3d3b2e", "#57543f", "#727050", "#8e8b61", "#aaa673", "#c3be86", "#d8d49b", "#e9e7b6",
                 "#f6f5d6"],
    "purpur": ["#211027", "#351a3f", "#4b2657", "#62346f", "#7a4488", "#9358a0", "#ab70b6", "#c38ecb", "#d9b0dd",
               "#ecd3ee"],
    "obsidian": ["#05030a", "#0b0714", "#120c1f", "#1a122b", "#231838", "#2e2047", "#3a2a58", "#48356a", "#58437e"],
    "chorus": ["#160a20", "#241133", "#341a48", "#46245d", "#5a3074", "#703f8b", "#8852a2", "#a06bb8", "#ba8acd",
               "#d4addf", "#ead1ef"],
    "void": ["#040207", "#09060f", "#0f0a18", "#161022", "#1e162d", "#271e39", "#322746"],
}
GLOW_RAMPS = {
    # ender eyes: violet to white-hot lilac
    "eyeglow": ["#3d0f63", "#6a19a6", "#9a2fe0", "#c05cff", "#dc95ff", "#f1cfff", "#fdf4ff"],
    # wing eye-spots and lures: hot magenta
    "magglow": ["#5a0d45", "#94196f", "#cc2c98", "#f04fbd", "#ff8ad6", "#ffc9ec", "#fff1fa"],
    # crying obsidian: deep blue-violet to bright lilac
    "crying": ["#2a0b5c", "#46129a", "#6a20d4", "#8f45f5", "#b47dff", "#dab8ff", "#f6ecff"],
}


def ramps(*names, **extra):
    out = {}
    for n in names:
        out[n] = END_RAMPS[n] if n in END_RAMPS else GLOW_RAMPS[n]
    out.update(extra)
    return out


# ======================================================================= curve rasteriser
def _catmull(pts, n=12):
    """Closed Catmull-Rom curve through `pts` (list of (x, y)), sampled n points per span."""
    P = [np.array(p, float) for p in pts]
    out = []
    for i in range(len(P)):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % len(P)], P[(i + 2) % len(P)]
        for k in range(n):
            u = k / n
            u2, u3 = u * u, u * u * u
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * u3))
    return np.array(out)


def _inside(poly, x, y):
    """Even-odd point-in-polygon for arrays x, y."""
    xs, ys = poly[:, 0], poly[:, 1]
    res = np.zeros(np.shape(x), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi, xj, yj = xs[i], ys[i], xs[j], ys[j]
        cond = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / np.where(yj - yi == 0, 1e-9, yj - yi) + xi)
        res ^= cond
        j = i
    return res


class Canvas:
    """A W x H character grid (row 0 = image top). Shapes are given in texel coordinates."""

    def __init__(self, w, h, fill="."):
        self.w, self.h = w, h
        self.g = [[fill] * w for _ in range(h)]
        yy, xx = np.mgrid[0:h, 0:w]
        self.X, self.Y = xx + 0.5, yy + 0.5

    def shape(self, pts, ch, jitter=0.0, seed=0, where=None):
        """Fill a closed curve through control points (texel coords). Returns the mask."""
        rng = random.Random(seed)
        pts = [(x + rng.uniform(-jitter, jitter), y + rng.uniform(-jitter, jitter)) for x, y in pts]
        m = _inside(_catmull(pts), self.X, self.Y)
        self.paint(m, ch, where)
        return m

    def paint(self, mask, ch, where=None):
        for y in range(self.h):
            for x in range(self.w):
                if mask[y, x] and (where is None or self.g[y][x] in where):
                    self.g[y][x] = ch

    def mask(self, chars):
        return np.array([[c in chars for c in row] for row in self.g])

    def get(self, x, y):
        return self.g[y][x] if 0 <= x < self.w and 0 <= y < self.h else "."

    def put(self, x, y, ch, where=None):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h and (where is None or self.g[y][x] in where):
            self.g[y][x] = ch

    def line(self, p0, p1, ch, where=None, width=1):
        """A 1-texel line (Bresenham-like by sampling), optionally only over cells in `where`."""
        (x0, y0), (x1, y1) = p0, p1
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for k in range(n + 1):
            u = k / n
            x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u
            self.put(math.floor(x), math.floor(y), ch, where)
            if width > 1:
                self.put(math.floor(x) + 1, math.floor(y), ch, where)

    def curve(self, pts, ch, where=None):
        """An open Catmull-Rom polyline through pts."""
        P = [np.array(p, float) for p in pts]
        P = [P[0]] + P + [P[-1]]
        for i in range(1, len(P) - 2):
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            prev = p1
            for k in range(1, 9):
                u = k / 8
                u2, u3 = u * u, u * u * u
                q = 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
                           + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
                self.line(prev, q, ch, where)
                prev = q

    def disc(self, cx, cy, rad, ch, where=None):
        m = (self.X - cx) ** 2 + (self.Y - cy) ** 2 <= rad * rad
        self.paint(m, ch, where)
        return m

    def ellipse(self, cx, cy, rx, ry, ch, where=None):
        m = ((self.X - cx) / rx) ** 2 + ((self.Y - cy) / ry) ** 2 <= 1.0
        self.paint(m, ch, where)
        return m

    def edge(self, inside_chars, ch, where=None, outer=True):
        """Recolour the outermost ring of a shape (cells of `inside_chars` touching transparency)."""
        hits = []
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] in inside_chars and (where is None or self.g[y][x] in where):
                    if any(self.get(x + dx, y + dy) == "." for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        hits.append((x, y))
        for x, y in hits:
            self.g[y][x] = ch
        return hits

    def rows(self):
        return ["".join(r) for r in self.g]


def mirror_art(art):
    return [row[::-1] for row in art]


def flip_art(art):
    return list(reversed(art))


# ======================================================================= card art generators
def locks(w, h, seed, up=False, fill=0.9, min_len=0.3, tip="t", mid="m", body="f"):
    """Hanging (or, with up, standing) fur: pointed locks of random length, lighter at the tips."""
    rng = random.Random(seed)
    lens = [0] * w
    x = 0
    while x < w:
        lw = rng.choice((2, 3, 3, 4))
        if rng.random() < fill:
            L = rng.uniform(min_len, 1.0) * h
            prof = {2: [0.8, 1.0], 3: [0.7, 1.0, 0.8], 4: [0.6, 0.9, 1.0, 0.7]}[lw]
            if rng.random() < 0.5:
                prof = prof[::-1]
            for k in range(lw):
                if x + k < w:
                    lens[x + k] = max(1, int(round(L * prof[k])))
        x += lw
    rows = [["."] * w for _ in range(h)]
    for cx, L in enumerate(lens):
        for k in range(L):
            ch = tip if k == L - 1 else (mid if k == L - 2 and L > 3 else body)
            rows[(h - 1 - k) if up else k][cx] = ch
    return ["".join(r) for r in rows]


def plume(w, h, seed=0, barb="b", dark="B", shaft="s", tip="t"):
    """A feathery (bipectinate) moth antenna: a lance-shaped plume with the shaft up the middle (image top = the tip)
    and barbs slanting up and out, drawn as alternating diagonal stripes so it reads as combed filaments."""
    c = Canvas(w, h)
    mid = (w - 1) / 2
    for y in range(h):
        u = (y + 0.5) / h                              # 0 = tip (top) .. 1 = base
        half = (w / 2) * max(0.0, math.sin(math.pi * min(1.0, u ** 0.75))) ** 0.7
        if u > 0.9:
            half *= 0.4
        for x in range(w):
            dx = abs(x - mid)
            if dx < 0.5:
                c.g[y][x] = shaft if u > 0.12 else tip
            elif dx <= half:
                outer = dx > half - 1.0
                c.g[y][x] = tip if outer and (y + int(dx)) % 2 == 0 else (barb if (y + int(dx)) % 2 == 0 else dark)
    return c.rows()


def moth_wing(w, h, seed, hind=False, spot=None, spot_r=None):
    """A left moth wing lying flat (card plane xz): column 0 is the root at the body, the last column the tip; row 0 is
    the trailing edge (back, -Z), the last row the leading edge (front, +Z). Right wings use mirror_art. Positions
    (`spot`) are (u, v): u 0 root .. 1 tip, v 0 trailing .. 1 leading edge.

    Characters: '.' clear, 'm' membrane (painted by the style), 'C' costa (the dark leading-edge vein), 'v' veins,
    'z' the zigzag submarginal line, 'f'/'F' the chequered fringe, 'k' the eye-spot's dark ring, 'E'/'e' its glowing
    iris (outer/inner), 'p' its pupil, 'w' the glowing catchlight, 'd' a dark discal mark, 'h' a pale scale dash."""
    c = Canvas(w, h)
    W, H = float(w), float(h)
    if not hind:
        # broad triangular forewing: narrow root, a long costa to a pointed apex, a sweeping outer margin
        ctrl = [(0.0, 0.52), (0.0, 0.8), (0.3, 0.9), (0.65, 0.97), (0.93, 1.0), (1.0, 0.88), (0.96, 0.6),
                (0.86, 0.3), (0.7, 0.04), (0.48, 0.04), (0.28, 0.18), (0.1, 0.36)]
        targets = [(0.95, 0.86), (0.93, 0.64), (0.85, 0.38), (0.72, 0.12), (0.52, 0.07), (0.32, 0.2)]
        cell = (0.46, 0.62)
    else:
        # the rounded fan of a hindwing
        ctrl = [(0.0, 0.62), (0.02, 0.92), (0.3, 1.0), (0.65, 0.95), (0.92, 0.75), (1.0, 0.48), (0.88, 0.16),
                (0.62, 0.0), (0.34, 0.04), (0.12, 0.26)]
        targets = [(0.66, 0.92), (0.9, 0.72), (0.95, 0.46), (0.84, 0.18), (0.6, 0.04), (0.34, 0.08)]
        cell = (0.36, 0.62)
    xy = lambda u, v: (u * W, v * H)  # noqa: E731
    c.shape([xy(u, v) for u, v in ctrl], "m", jitter=0.25, seed=seed)
    root = xy(0.0, 0.66 if not hind else 0.78)
    # fringe: the outermost ring, chequered light/dark
    for x, y in c.edge("m", "f"):
        if (x + y) % 3 == 0:
            c.g[y][x] = "F"
    # veins: from the root into the discal cell, then fanning out to the margin
    rng = random.Random(seed + 7)
    cx, cy = xy(*cell)
    c.curve([root, ((root[0] + cx) / 2, (root[1] + cy) / 2 + 0.5), (cx, cy)], "v", where="m")
    c.curve([xy(0.0, 0.56 if not hind else 0.7), xy(cell[0] * 0.6, cell[1] - 0.2), xy(cell[0], cell[1] - 0.26)], "v",
            where="m")
    for k, (u, v) in enumerate(targets):
        ex, ey = xy(u, v)
        mid = ((cx + ex) / 2 + rng.uniform(-0.5, 0.5), (cy + ey) / 2 + rng.uniform(-0.5, 0.5))
        c.curve([(cx, cy - 0.26 * H * (k / len(targets))), mid, (ex, ey)], "v", where="m")
    # the costa: the leading-edge rows, darkened, with pale scale dashes near the root
    for x in range(w):
        col = [y for y in range(h) if c.g[y][x] in "mvfF"]
        if col and x < w - 1:
            c.g[max(col)][x] = "C"
            if x < w * 0.6 and len(col) > 3:
                c.g[max(col) - 1][x] = "C" if x % 4 else "h"
    # a zigzag submarginal line just inside the fringe
    edge = [(x, y) for y in range(h) for x in range(w) if c.g[y][x] in "fF"]
    for y in range(h):
        for x in range(w):
            if c.g[y][x] == "m":
                dmin = min((abs(x - ex) + abs(y - ey) for ex, ey in edge), default=9)
                if dmin == 2 + ((x + y) // 2) % 2 and (x * 3 + y) % 5:
                    c.g[y][x] = "z"
    # pale scale dashes beside the veins near the root
    for y in range(h):
        for x in range(int(w * 0.45)):
            if c.g[y][x] == "m" and c.get(x - 1, y) == "v" and (x + 2 * y) % 4 == 0:
                c.g[y][x] = "h"
    # a dark discal mark at the end of the cell
    c.ellipse(cx + 0.5, cy, 1.2, 0.8, "d", where="mvhz")
    # the eye-spot: dark ring, glowing iris, pupil, catchlight
    if spot:
        sx, sy = xy(*spot)
        rad = spot_r or min(W, H) * 0.2
        c.disc(sx, sy, rad + 0.9, "k", where="mvhzdC")
        c.disc(sx, sy, rad, "E", where="k")
        c.disc(sx, sy, rad * 0.62, "e", where="E")
        c.disc(sx, sy, max(0.7, rad * 0.32), "p", where="e")
        c.put(sx - rad * 0.4, sy - rad * 0.4, "w", where="eEp")
    return c.rows()


def membrane(w, h, seed, hand=False, fingers=3, scallop=0.16):
    """A dragon's wing membrane lying flat (card plane xz), left side: column 0 at the joint it hangs from, the last
    column outward; the bottom row is the leading edge (it hangs from the arm bone, a separate box), the top rows the
    scalloped trailing edge. `hand`: the outer membrane, with finger bones fanning from the wrist to the scallop points
    and a claw at the tip; otherwise the inner membrane between the flank and the wrist.

    Characters: '.' clear, 'm' membrane (painted by the style), 'b' finger bones, 'B' a finger's lit edge, 'r' the
    trailing-edge rim, 'v' fine veins, 'c' a claw."""
    c = Canvas(w, h)
    W, H = float(w), float(h)
    xy = lambda u, v: (u * W, v * H)  # noqa: E731
    if hand:
        tips = [(0.3 + 0.7 * (k + 1) / fingers * 0.95, 0.02 + 0.62 * ((k + 1) / fingers) ** 2.2) for k in range(fingers)]
        tips[0] = (tips[0][0] * 0.75, tips[0][1])
        pts = [xy(0.0, 1.0), xy(0.0, 0.08)]
        prev = (0.0, 0.08)
        for t in tips:
            pts.append(xy((prev[0] + t[0]) / 2, (prev[1] + t[1]) / 2 + scallop))
            pts.append(xy(*t))
            prev = t
        pts += [xy(1.0, 0.9), xy(0.6, 1.0)]
    else:
        tips = []
        pts = [xy(0.0, 1.0), xy(0.0, 0.0), xy(0.5, scallop + 0.08), xy(1.0, 0.06), xy(1.0, 1.0)]
    c.shape(pts, "m", jitter=0.2, seed=seed)
    for x, y in c.edge("m", "r"):
        if y >= h - 1:
            c.g[y][x] = "m"
    wrist = xy(0.02, 0.97)
    rng = random.Random(seed)
    for t in tips:
        tx, ty = xy(*t)
        mid = (wrist[0] + (tx - wrist[0]) * 0.5 + rng.uniform(-0.4, 0.4), wrist[1] + (ty - wrist[1]) * 0.5)
        c.curve([wrist, mid, (tx, ty + 0.5)], "b", where="mr")
    # a lit edge on the side of each finger toward the leading edge
    for y in range(h - 1):
        for x in range(w):
            if c.g[y][x] == "b" and c.get(x, y + 1) == "m":
                c.g[y + 1][x] = "B"
    # fine veins branching toward the trailing edge
    for k in range(int(w * h / 60) + 2):
        x0 = rng.uniform(0.1, 0.9) * W
        y0 = rng.uniform(0.35, 0.85) * H
        if c.get(int(x0), int(y0)) != "m":
            continue
        c.line((x0, y0), (x0 + rng.uniform(-1.5, 1.5), y0 - rng.uniform(2.0, 4.0)), "v", where="m")
    if hand:
        c.put(w - 1, int(H * 0.9) - 1, "c")
        c.put(w - 2, int(H * 0.9) - 2, "c")
    return c.rows()


def claws(n, length=2, gap=1, ch="c", tip="t"):
    """A row of n hooked claws (plane xy, hanging down from the top row)."""
    w = n * (1 + gap) - gap
    rows = [["."] * w for _ in range(length)]
    for k in range(n):
        x = k * (1 + gap)
        for y in range(length):
            rows[y][x] = tip if y == length - 1 else ch
    return ["".join(r) for r in rows]


def teeth(w, h=2, every=2, ch="y", seed=0):
    """A row of small pointed teeth (hanging from the top row)."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    for x in range(w):
        rows[0][x] = ch
        if x % every == 0:
            for y in range(1, h if rng.random() < 0.7 else h - 1):
                rows[y][x] = ch
    return ["".join(r) for r in rows]


def check_art(art):
    w = len(art[0])
    assert all(len(r) == w for r in art), "art rows differ in length"
    return art


# ======================================================================= build helpers
def finish(spec, out, root="body", feet=None, lock=True):
    """Lift the rest pose onto the ground, solve per-frame root heights for locked clips, write the spec."""
    rest_on_ground(spec["parts"], spec["density"], feet)
    if lock:
        ground_lock(spec, root, feet)
    else:
        for clip in spec["animations"].values():
            clip.pop("_lock", None)
    dump(spec, out)
