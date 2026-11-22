"""Shared palettes, card-art generators and pattern stamps for the Winterworks "Tides & Treasures" creatures.

Used by anglerfish.py, lionfish.py, nautilus.py, sea_turtle.py, whale.py and elder_guardian.py (all in this folder).
Builds on end_kit.py (the Rig, pose timelines, curve canvas, round-eye generators); every eye in the ocean is round
(obsidian_kit.eyeball / iris_card / paint_iris).

Card art is generated: outlines are closed Catmull-Rom curves (organic shapes are curves), fin rays are traced curves
from a root, torn fin edges are notches cut between the rays. `face_stamp` paints a pattern defined in a part's own
coordinates (radial shell stripes, turtle scutes) onto a box face as a stamp, so markings line up across neighbouring
boxes. Characters left out of a style's `art_key` / a stamp's `key` are painted by the style's layers and brush.

Units are Minecraft pixels (16 per block). lowpix axes: Y up, the model faces +Z, ground at y = 0, "left" is +X.
Box face images (lowpix.geometry.BOX_FACES): `front` (+Z) image-right is +X; `right` (+X) image-right is -Z; `left`
(-X) image-right is +Z; `back` (-Z) image-right is -X; `top` image-right +X, image-down +Z; `bottom` image-right +X,
image-down -Z. Image-up is world-up on the four sides.
"""
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (LR, M, MR, ROOT, Canvas, Rig, abs_track, add, aim, chain_pose, clamp, claws,  # noqa: E402,F401
                     cycle, dump, euler, eyeball, ground_lock, in_disc, iris_card, jitter, keys, lid_frame, limb,
                     locks, mirror_art, osc, paint_iris, pos, pupil_for, r, rest_on_ground, ring, rot_matrix, sc,
                     shake, snap, spikes, spin, tatters, timeline, toward, wave)

# ======================================================================= palettes (darkest first, hue-shifted)
OCEAN_RAMPS = {
    # anglerfish: velvety near-black deep-sea skin, warm brown-violet lights
    "abyss": ["#060408", "#0c080f", "#130d17", "#1b1320", "#241a29", "#2e2133", "#3a2a3e", "#47344a", "#563f57",
              "#664b65", "#785a74"],
    # the inside of a mouth: dark wine red
    "maw": ["#110408", "#1d080e", "#2c0c16", "#3e121f", "#521929", "#682234", "#802d40", "#9a3b4e"],
    # needle teeth, glassy pale ivory with blue-grey shadows
    "tooth": ["#2f353c", "#4f5960", "#7b878d", "#a9b5b8", "#d2dcdb", "#eef4f1", "#fbfdfb"],
    # milky deep-sea eyes
    "milk": ["#141b24", "#28333f", "#44525e", "#66767f", "#8c9ba2", "#b4c2c6", "#d9e4e5", "#f2f8f8"],
    # coral red (lionfish), deep maroon shadows to salmon lights
    "coral": ["#22050a", "#3a0b10", "#561314", "#741d18", "#93291d", "#b13a24", "#c9502e", "#dc6c3e", "#ea8d58",
              "#f4ae7c"],
    # cream: lionfish stripes, nautilus shell ground, turtle plastron edges
    "cream": ["#4a3e33", "#6b5d4e", "#8d7e6c", "#ae9f8b", "#cbbea9", "#e2d8c5", "#f2ecdd", "#fcf9f0"],
    # rust: nautilus tiger stripes
    "rust": ["#250b06", "#3e130a", "#5c1f0f", "#7d2e15", "#9c401b", "#b75522", "#cc6e30", "#dd8a45"],
    # nautilus flesh: tentacles, siphon, the soft body
    "flesh": ["#2e1c14", "#4a2e1f", "#6a442c", "#8b5c3b", "#aa774d", "#c49364", "#d9b083", "#eacda6", "#f7e7cc"],
    # nautilus hood: brown leather with pale blotches (painted with cream)
    "hood": ["#170e0a", "#271811", "#3a2519", "#4f3423", "#66452f", "#7f593d", "#98704f", "#b18a66"],
    # gold-brown irises (nautilus, turtles)
    "amber": ["#1d1004", "#352008", "#52330c", "#714a12", "#92651b", "#b38328", "#cfa13d", "#e6c15e", "#f6df8e"],
    # sea turtle skin: olive-grey leather
    "olive": ["#0e110b", "#191d13", "#252b1b", "#333b25", "#424b2f", "#535d3a", "#657047", "#798456", "#8e9868",
              "#a5ad7e", "#bcc297"],
    # sea turtle carapace: tortoiseshell amber with dark streaks
    "tortoise": ["#110a04", "#1f1308", "#311e0c", "#452a10", "#5b3815", "#72481b", "#8a5a22", "#a26d2c", "#b98239",
                 "#cd984b", "#dfb064", "#edc985"],
    # plastron: pale straw yellow
    "straw": ["#3d3520", "#5a4f2e", "#7a6d3f", "#9a8d53", "#b8ac6b", "#d1c687", "#e5dca7", "#f3edc9"],
    # beaks and claws: dark horn
    "horn": ["#0f0d08", "#1d1910", "#2d2718", "#403722", "#55492e", "#6c5d3c", "#85744c", "#9f8c5f"],
    # whale hide: deep blue-grey
    "whale": ["#070c13", "#0c131d", "#121b28", "#192434", "#212e41", "#2a384e", "#34445c", "#3f506a", "#4b5d78",
              "#586a86", "#677a94", "#7889a2", "#8c9cb2"],
    # whale belly and fluke undersides: pale grey with a blue cast
    "belly": ["#2c3440", "#414b58", "#58636f", "#717c88", "#8b96a1", "#a6afb8", "#c0c8ce", "#d8dee2", "#eef1f3"],
    # the inside of the whale's mouth
    "gum": ["#1f0b10", "#34121a", "#4c1b26", "#672633", "#813343", "#9b4553", "#b45b66", "#ca757d"],
    # baleen plates: dark horn with a pale fringe
    "baleen": ["#100e0c", "#1d1915", "#2c2620", "#3d352c", "#50463a", "#655a4b", "#7d705e", "#968874"],
    # barnacles: chalky cream-grey
    "barnacle": ["#24211c", "#3a362e", "#545045", "#706b5e", "#8f8978", "#ada793", "#c9c3ae", "#e1dccb", "#f2efe3"],
    # elder guardian: pale, weathered prismarine stone
    "elder": ["#11171a", "#1a2326", "#253033", "#313e40", "#3e4d4d", "#4d5c5b", "#5e6d6a", "#717f7a", "#86938c",
              "#9da8a0", "#b5beb4", "#cdd4c9", "#e4e8de"],
    # elder guardian accents: the old guardian's faded mauve
    "mauve": ["#1f1420", "#2f1e31", "#412a43", "#553857", "#6b4a6c", "#835e83", "#9c769b", "#b591b3", "#cdaecb"],
    # sea growth: dark kelp green
    "algae": ["#0b1610", "#122218", "#1a3021", "#233f2b", "#2e4f35", "#3a6040", "#47714b"],
    # the whites of big eyes: warm, a little bloodshot in the shadows
    "sclera": ["#25201d", "#3d3630", "#5a5148", "#7a7064", "#9b9183", "#bab1a3", "#d6cfc2", "#ece7dd", "#faf8f2"],
    # saddles: leather and brass
    "leather": ["#1d110b", "#311c12", "#472918", "#5e3720", "#77472a", "#915a36", "#a96d42", "#c08453"],
    "brass": ["#2c1d08", "#4d3410", "#74501a", "#9a6e26", "#bf8e37", "#dcae52", "#f2cf7a", "#fff0b8"],
    "cloth": ["#081a24", "#0d2b3b", "#133e53", "#1b536c", "#246a85", "#30839d", "#409db4", "#5bb6c8", "#80cdd9"],
    "pupil": ["#040406", "#0a0a0e", "#131318"],
}
# glow ramps are kept apart from every body ramp: the exporter puts exactly the texels of a glow ramp's colours into
# <name>_glow.png
GLOW_RAMPS = {
    # bioluminescence: ink teal to cyan-white (the anglerfish lure, the Angler Light)
    "lureglow": ["#04262d", "#073c47", "#0a5966", "#0f7c88", "#19a3ac", "#36c8cc", "#76e5e2", "#b9f7f1", "#ecfffc"],
    # prismarine magic: the elder guardian's iris and seams
    "prism": ["#0b2a26", "#0f4239", "#145f50", "#1c7f68", "#2aa184", "#45c3a2", "#77dfc2", "#b5f3e0", "#eafff8"],
}


def ramps(*names, **extra):
    out = {}
    for n in names:
        out[n] = OCEAN_RAMPS[n] if n in OCEAN_RAMPS else GLOW_RAMPS[n]
    out.update(extra)
    return out


LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.8, "gradient": 0.5, "ao": 0.5, "ao_height": 6.0}
GLOSS = {"id": "gloss", "op": "gloss", "post": True, "dash": True, "length": 2, "inset": 1, "density": 0.45,
         "shift": 1.6}


# ======================================================================= face stamps from a pattern in part space
def face_grid(size, face, density):
    """Texel-centre coordinates (H x W x 3, relative to the box centre, part axes) of one face of a box `size`,
    laid out like the face image (row 0 at the image top)."""
    w, h, d = (float(s) for s in size)
    hx, hy, hz = w / 2, h / 2, d / 2
    if face in ("front", "back"):
        W, H = int(round(w * density)), int(round(h * density))
    elif face in ("left", "right"):
        W, H = int(round(d * density)), int(round(h * density))
    else:
        W, H = int(round(w * density)), int(round(d * density))
    u = (np.arange(W) + 0.5) / W          # 0..1 left to right in the image
    v = (np.arange(H) + 0.5) / H          # 0..1 top to bottom
    U, V = np.meshgrid(u, v)
    P = np.zeros((H, W, 3))
    if face == "front":
        P[..., 0], P[..., 1], P[..., 2] = -hx + U * w, hy - V * h, hz
    elif face == "back":
        P[..., 0], P[..., 1], P[..., 2] = hx - U * w, hy - V * h, -hz
    elif face == "right":                 # +X
        P[..., 0], P[..., 1], P[..., 2] = hx, hy - V * h, hz - U * d
    elif face == "left":                  # -X
        P[..., 0], P[..., 1], P[..., 2] = -hx, hy - V * h, -hz + U * d
    elif face == "top":
        P[..., 0], P[..., 1], P[..., 2] = -hx + U * w, hy, -hz + V * d
    elif face == "bottom":
        P[..., 0], P[..., 1], P[..., 2] = -hx + U * w, -hy, hz - V * d
    return P


def face_stamp(size, face, density, fn, centre=(0, 0, 0)):
    """A stamp (rows of chars, '.' = leave the painted texel) for one face: fn(x, y, z) -> char, evaluated at every
    texel centre in the caller's frame (the box centre is at `centre` in that frame)."""
    P = face_grid(size, face, density) + np.array(centre, float)
    rows = []
    for row in P:
        rows.append("".join(fn(float(p[0]), float(p[1]), float(p[2])) for p in row))
    return rows


def pattern_stamps(size, density, fn, centre=(0, 0, 0), faces=("front", "back", "left", "right", "top", "bottom"),
                   key=None):
    """face_stamp for several faces, as a list of lowpix stamp dicts."""
    out = []
    for f in faces:
        st = {"face": f, "at": "top-left", "art": face_stamp(size, f, density, fn, centre)}
        if key:
            st["key"] = key
        out.append(st)
    return out


# ======================================================================= card art generators
def fan_fin(w, h, root, tips, seed=0, torn=0.0, scallop=0.35, ray="r", ray_tip="t", membrane="m", edge="e",
            band=None, band_every=3, spot=None, spots=0, ray_over=1.0):
    """A fin spread from a root: a membrane through the root and the ray tips (a closed Catmull-Rom curve, scalloped
    between the rays), rays traced as curves from the root to each tip ('r', the last texel past the membrane 't'),
    a lighter edge ring ('e'), optional banding along the rays (`band` every `band_every` texels: the lionfish's
    red-white rays), spots on the membrane (`spot`, `spots` of them) and torn notches (`torn`: the fraction of gaps
    between rays that get a ragged tear). Coordinates are texels, row 0 at the image top."""
    rng = random.Random(seed)
    c = Canvas(w, h)
    rx, ry = root
    # outline: the root, then each tip, with a scalloped dip between neighbouring tips
    pts = [(rx, ry)]
    prev = None
    for k, (tx, ty) in enumerate(tips):
        if prev is not None:
            mx, my = (prev[0] + tx) / 2, (prev[1] + ty) / 2
            # pull the gap point toward the root (scallop)
            pts.append((mx + (rx - mx) * scallop * rng.uniform(0.7, 1.2), my + (ry - my) * scallop * rng.uniform(0.7, 1.2)))
        pts.append((tx, ty))
        prev = (tx, ty)
    c.shape(pts, membrane, jitter=0.2, seed=seed)
    for x, y in c.edge(membrane, edge):
        pass
    # torn notches: cut a ragged wedge into some gaps
    if torn > 0:
        for k in range(len(tips) - 1):
            if rng.random() > torn:
                continue
            (ax, ay), (bx, by) = tips[k], tips[k + 1]
            mx, my = (ax + bx) / 2 + rng.uniform(-0.8, 0.8), (ay + by) / 2 + rng.uniform(-0.8, 0.8)
            depth = rng.uniform(0.25, 0.55)
            ex, ey = mx + (rx - mx) * depth, my + (ry - my) * depth
            c.shape([(mx - (bx - ax) * 0.16, my - (by - ay) * 0.16), (ex, ey), (mx + (bx - ax) * 0.16,
                                                                               my + (by - ay) * 0.16),
                     (mx + (mx - ex) * 0.6, my + (my - ey) * 0.6)], ".")
        for x, y in c.edge(membrane, edge):
            pass
    if spot and spots:
        for _ in range(spots):
            k = rng.uniform(0.15, 0.9)
            t = rng.choice(tips)
            sx, sy = rx + (t[0] - rx) * k + rng.uniform(-1.5, 1.5), ry + (t[1] - ry) * k + rng.uniform(-1.5, 1.5)
            c.ellipse(sx, sy, rng.uniform(0.6, 1.1), rng.uniform(0.6, 1.1), spot, where=membrane)
    # rays
    for k, (tx, ty) in enumerate(tips):
        L = math.hypot(tx - rx, ty - ry)
        bend = rng.uniform(-0.06, 0.06) * L
        nx, ny = -(ty - ry) / max(L, 1e-6), (tx - rx) / max(L, 1e-6)
        mid = ((rx + tx) / 2 + nx * bend, (ry + ty) / 2 + ny * bend)
        ex, ey = rx + (tx - rx) * ray_over, ry + (ty - ry) * ray_over
        c.curve([(rx, ry), mid, (ex, ey)], ray)
        if band:
            # alternate bands along the ray: walk the drawn ray texels by distance from the root
            for y in range(h):
                for x in range(w):
                    if c.g[y][x] == ray:
                        dd = math.hypot(x + 0.5 - rx, y + 0.5 - ry)
                        if int(dd / band_every) % 2:
                            c.g[y][x] = band
        c.put(math.floor(ex), math.floor(ey), ray_tip)
    return c.rows()


def ragged_fin(w, h, seed=0, rays=6, root_side="bottom", torn=0.5, **kw):
    """A dorsal or anal fin standing on (or hanging from) its base edge: rays fanning back from the front of the base,
    a ragged membrane between them."""
    rng = random.Random(seed)
    if root_side == "bottom":
        root = (w * 0.22, h - 0.5)
        tips = []
        for k in range(rays):
            u = k / max(rays - 1, 1)
            ang = math.radians(100 - 85 * u)            # from up-and-forward round to backward
            L = (h - 1) * (0.75 + 0.3 * math.sin(math.pi * (0.25 + 0.6 * u))) * rng.uniform(0.85, 1.05)
            tips.append((root[0] - math.cos(ang) * L * 0.2 + u * (w * 0.78), root[1] - math.sin(ang) * L))
        tips.append((w - 0.5, h - 1.0))
    else:
        root = (w * 0.22, 0.5)
        tips = []
        for k in range(rays):
            u = k / max(rays - 1, 1)
            L = (h - 1) * (0.7 + 0.3 * math.sin(math.pi * u)) * rng.uniform(0.85, 1.05)
            tips.append((root[0] + u * (w * 0.75), root[1] + L))
        tips.append((w - 0.5, 1.0))
    return fan_fin(w, h, root, tips, seed=seed, torn=torn, **kw)


def halo(d, rings=("1", "2", "3", "4", "5"), core=None, rays=0, seed=0):
    """A soft round glow d texels across, as concentric rings: `rings[0]` the faint outer ring ... `rings[-1]` the
    bright inner ring, `core` (optional) the centre. Drawn into the glow pass only, it reads as a soft halo. `rays`:
    faint streaks of the second ring out into the first (a twinkle)."""
    c = Canvas(d, d)
    cx = cy = d / 2.0
    n = len(rings)
    rng = random.Random(seed)
    for y in range(d):
        for x in range(d):
            t = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (d / 2.0)
            if t > 1.0:
                continue
            # rings are thinner toward the centre: tone grows like 1 - t^0.7
            k = min(n - 1, int((1.0 - t ** 0.8) * n))
            c.g[y][x] = rings[k]
    if core:
        c.disc(cx, cy, max(1.5, d * 0.12), core)
    for _ in range(rays):
        a = rng.uniform(0, 2 * math.pi)
        for s in np.linspace(0.4, 0.95, 8):
            x, y = cx + math.cos(a) * s * d / 2, cy + math.sin(a) * s * d / 2
            if c.get(int(x), int(y)) == rings[0]:
                c.put(x, y, rings[1])
    return c.rows()


def needles(w, h, every=2, seed=0, ch="y", tip="Y", up=True, minlen=0.35, inward=0.0):
    """A row of long needle teeth (one texel wide) of uneven length standing up from the bottom row (`up`) or
    hanging from the top row; the tips are a separate char. `inward` leans them (texels per texel of height)."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    for x in range(0, w, every):
        if rng.random() < 0.15:
            continue
        L = max(2, int(round(h * rng.uniform(minlen, 1.0))))
        lean = inward * rng.uniform(0.5, 1.2) * (1 if x < w / 2 else -1)
        for k in range(L):
            xx = int(round(x + lean * k))
            yy = (h - 1 - k) if up else k
            if 0 <= xx < w:
                rows[yy][xx] = tip if k >= L - 1 else ch
    return ["".join(r) for r in rows]


def tentacle_tuft(w, h, n, seed=0, root=None, spread=1.0, body="f", tip="t", shade="s", droop=0.4):
    """Many fine tentacles fanning from a root (a nautilus's cirri): curved one-texel strands, lighter at the tips."""
    rng = random.Random(seed)
    c = Canvas(w, h)
    rx, ry = root if root else (w / 2.0, 0.5)
    for k in range(n):
        u = (k + 0.5) / n
        ang = math.radians(-60 + 120 * u) * spread
        L = (h - 1) * rng.uniform(0.6, 1.0)
        ex = rx + math.sin(ang) * L * (w / max(h, 1)) * 0.9
        ey = ry + math.cos(ang) * L
        mx = (rx + ex) / 2 + rng.uniform(-1.2, 1.2)
        my = (ry + ey) / 2 - droop * rng.uniform(0, 1.5)
        c.curve([(rx + rng.uniform(-1, 1), ry), (mx, my), (ex, ey)], body if k % 3 else shade)
        c.put(ex, ey, tip)
    return c.rows()


def barnacle_cluster(w, h, seed=0, n=None, shell="b", lit="B", hole="o", rim="r"):
    """A cluster of barnacles seen from above or the side: little volcano cones (a lit rim, a dark hole)."""
    rng = random.Random(seed)
    c = Canvas(w, h)
    n = n or max(2, int(w * h / 14))
    placed = []
    for _ in range(n * 4):
        if len(placed) >= n:
            break
        d = rng.choice((3, 3, 4, 4, 5))
        x, y = rng.uniform(d / 2, w - d / 2), rng.uniform(d / 2, h - d / 2)
        if any(math.hypot(x - px, y - py) < (d + pd) * 0.42 for px, py, pd in placed):
            continue
        placed.append((x, y, d))
    for x, y, d in placed:
        cx = math.floor(x) + 0.5 if d % 2 else float(round(x))
        cy = math.floor(y) + 0.5 if d % 2 else float(round(y))
        for yy in range(c.h):
            for xx in range(c.w):
                if in_disc(xx, yy, cx, cy, d):
                    dx, dy = xx + 0.5 - cx, yy + 0.5 - cy
                    if in_disc(xx, yy, cx, cy, max(1, d - 3 + (d % 2))) and d >= 4:
                        c.g[yy][xx] = hole
                    elif dx + dy < -0.5:
                        c.g[yy][xx] = lit
                    elif dx + dy > 1.0:
                        c.g[yy][xx] = rim
                    else:
                        c.g[yy][xx] = shell
        if d == 3:
            c.g[int(cy)][int(cx)] = hole
    return c.rows()


def small_eye(d, look=(0.0, 0.0), lid="L"):
    """A small round eye d x d texels for a stamp: a dark lid ring, the eye, a round iris and pupil with a
    catch-light (obsidian_kit.eyeball keys: L lid, k crease, u lash, l lower lid, d/s/S eyeball, o/i/I/J/c iris,
    p pupil, q pupil edge, W/w catch-lights)."""
    return eyeball(d, d, d - 2, d - 2, iris=max(3, d - 4), look=look, lid_shade=1, lid=lid)


def round_eye(d, pupil=None, ring="k", iris="i", mid="I", lit="J", hole="p", glint="W", corner=".", look=(0, 0)):
    """A small round eye d texels across for a box face: a dark ring (`ring`) round a round iris (darker at the top
    `iris`, `mid`, lit low `lit`), a round pupil (`pupil` texels, default about 0.4 d; 3 gets half-dark corners) and a
    catch-light (`glint`) on the pupil's upper-left edge. Texels outside the disc are `corner` ('.' keeps the face's
    paint). `look` shifts the pupil (texels)."""
    rows = [[corner] * d for _ in range(d)]
    cx = cy = d / 2.0
    if pupil is None:
        pupil = int(round(0.45 * (d - 2)))
        if (pupil - d) % 2:
            pupil = pupil + 1 if d % 2 else pupil - 1
    p = max(1, pupil)
    px, py = cx + look[0], cy + look[1]
    for y in range(d):
        for x in range(d):
            if not in_disc(x, y, cx, cy, d):
                continue
            if not in_disc(x, y, cx, cy, d - 2):
                rows[y][x] = ring
                continue
            dx, dy = x + 0.5 - px, y + 0.5 - py
            if in_disc(x, y, px, py, p):
                rows[y][x] = hole
            elif p == 3 and abs(dx) < 1.6 and abs(dy) < 1.6:
                rows[y][x] = ring
            else:
                rows[y][x] = iris if dy < -0.6 else (lit if dy > 0.6 else mid)
    holes = sorted(((x + y, y, x) for y in range(d) for x in range(d) if rows[y][x] == hole))
    if holes:
        _, gy, gx = holes[0]
        rows[gy][gx] = glint
    return ["".join(r) for r in rows]


def check(art):
    w = len(art[0])
    assert all(len(r) == w for r in art), "art rows differ in length"
    return art


# ======================================================================= rounded masses from nested boxes
def _q(v, density):
    return max(1.0 / density, round(float(v) * density) / density)


def rounded(R, id, parent, size, style, centre, cut=(0.72, 0.84), skip=(), styles=None, steps=3, **kw):
    """A rounded mass from nested boxes (Minecraft entity models are cuboids): the named core is full width but cut
    in height and depth; `<id>_y` is full height, `<id>_z` full depth, and with steps=4 `<id>_m` (about 0.92 of every
    side) fills the corners for a rounder, octagon-like profile. Every axis gets different sizes, so no two faces are
    coplanar (no z-fighting), and every edge reads as a stepped chamfer. `skip`: suffixes to leave out ('y', 'z',
    'm'). `styles`: per-suffix style overrides. Returns the core part."""
    W, H, D = size
    a, b = cut
    d = R.density
    dims = {"": (W, a * H, b * D), "y": (b * W, H, a * D), "z": (a * W, b * H, D)}
    if steps >= 4:
        m = (1.0 + b) / 2 + 0.02
        dims["m"] = (m * W, m * H, m * D)
    out = None
    for suf, (w, h, dd) in dims.items():
        if suf and suf in skip:
            continue
        sz = [_q(w, d), _q(h, d), _q(dd, d)]
        st = (styles or {}).get(suf, style)
        if not suf:
            out = R.part(id, parent, sz, st, centre=centre, **kw)
        else:
            R.part(f"{id}_{suf}", id, sz, st, centre=centre)
    return out


def fangs(w, h, every=3, seed=0, up=True, lean=0.0, minlen=0.4, skip=0.12, base="z", body="y", tip="Y"):
    """A row of curved needle fangs: two texels wide at the root ('z' the shaded half, 'y' the lit), one texel above,
    the top texel 'Y' (the glassy tip). `lean`: how far (texels) the tips curve sideways over the full height, toward
    the middle of the row; `up`: rooted on the bottom row (else hanging from the top)."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    x = rng.randrange(0, max(1, every))
    while x < w - 1:
        if rng.random() >= skip:
            L = max(3, int(round(h * rng.uniform(minlen, 1.0))))
            side = -1 if x > w / 2 else 1
            for k in range(L):
                u = k / max(L - 1, 1)
                xx = int(round(x + side * lean * rng.uniform(0.7, 1.0) * u * u))
                yy = (h - 1 - k) if up else k
                if not (0 <= xx < w):
                    continue
                if k >= L - 1:
                    rows[yy][xx] = tip
                elif u < 0.34 and xx + 1 < w:
                    rows[yy][xx] = body
                    rows[yy][xx + 1] = base
                else:
                    rows[yy][xx] = body
        x += every + rng.choice((0, 0, 1))
    return ["".join(r) for r in rows]


def soft_halo(d, levels="123456", seed=0):
    """A halo d texels across that thins out toward its rim: the inner rings solid and bright, the outer rings a
    sparse dither of dim texels, so it reads as a soft bloom in the additive glow pass and as a sparkle of light
    motes where it is drawn opaque."""
    c = Canvas(d, d)
    cx = cy = d / 2.0
    n = len(levels)
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    for y in range(d):
        for x in range(d):
            t = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (d / 2.0)
            if t > 1.0:
                continue
            fill = min(1.0, (1.0 - t) * 2.2) ** 1.4          # solid in the middle, sparse at the rim
            if (bayer[y % 4][x % 4] + 0.5) / 16.0 > fill:
                continue
            k = min(n - 1, int((1.0 - t) ** 0.9 * n))
            c.g[y][x] = levels[k]
    return c.rows()
