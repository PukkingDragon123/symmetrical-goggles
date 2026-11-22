"""Shared palettes, paint presets and card-art generators for the Winterworks "Tides & Treasures" creatures.

Used by anglerfish.py, lionfish.py, nautilus.py, sea_turtle.py, whale.py and elder_guardian.py (all in this folder).
Builds on end_kit.py (the Rig and the pose timelines).

**The vanilla mob look.** Every creature is built at vanilla resolution (`density: 1`: one texel per Minecraft pixel)
from simple, chunky boxes with a clear silhouette; cards only for real fins, spines and teeth. Textures are clean and
readable at a glance: big areas of a few close tones with soft grain (`flat`), gentle top-lit shading, simple markings
(stripes, mottling, a lighter belly) placed in the creature's own coordinates (`marks`) so they line up across boxes.
Eyes are flat and small, painted on the face: a near-black dot (1 x 1 to 2 x 2), at most one lighter pixel, sometimes
a 1-px lid line (`side_eye`, `front_eye`). No eyeballs, irises or catch-light rings.

Units are Minecraft pixels (16 per block). lowpix axes: Y up, the model faces +Z, ground at y = 0, "left" is +X.
Box face images (lowpix.geometry.BOX_FACES): `front` (+Z) image-right is +X; `right` (+X) image-right is -Z; `left`
(-X) image-right is +Z; `back` (-Z) image-right is -X; `top` image-right +X, image-down +Z; `bottom` image-right +X,
image-down -Z. Image-up is world-up on the four sides.

**Name compatibility.** The mod's code addresses parts by name (generated `<Name>Model` constants, `part(name)`), so a
remade creature keeps every part name it had: names the new design no longer draws stay as empty bones
(`keep_names`).
"""
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_kit import (LR, M, MR, ROOT, Canvas, Rig, abs_track, add, aim, chain_pose, clamp, cycle,  # noqa: E402,F401
                     dump, euler, ground_lock, jitter, keys, mirror_art, osc, pos, r, rest_on_ground, ring,
                     rot_matrix, sc, shake, spin, timeline, toward, wave)

# ======================================================================= palettes (darkest first, close steps)
OCEAN_RAMPS = {
    # anglerfish: dusky plum-brown skin
    "abyss": ["#171217", "#1e171d", "#261d24", "#2f242c", "#392b34", "#44333d", "#503c47", "#5d4652", "#6b525e"],
    # the inside of a mouth
    "maw": ["#3a0f19", "#4d1622", "#621d2b", "#792735", "#913342"],
    # teeth and bone: off-white
    "tooth": ["#8d918a", "#b3b6ac", "#d6d7cc", "#eeeee4"],
    # lionfish: warm orange-red, and its cream stripes
    "coral": ["#5e1b12", "#7a2516", "#95311b", "#ad3e20", "#c34e26", "#d6602e", "#e47538"],
    "cream": ["#a3907a", "#bcab94", "#d2c3ab", "#e4d8c3", "#f1e9d8", "#faf5ea"],
    # lionfish fin membrane: faint pink-cream
    "veil": ["#a87d6c", "#c09684", "#d5ae9c", "#e6c6b6"],
    # nautilus: rust stripes, soft tan flesh, brown hood
    "rust": ["#5a2614", "#71311a", "#883e20", "#9e4c27", "#b25b2f"],
    "flesh": ["#7a5440", "#8d634c", "#a07459", "#b38667", "#c49877", "#d3aa8a"],
    "hood": ["#3b261b", "#472f22", "#54392a", "#614332", "#6e4e3b", "#7c5a45"],
    # sea turtle: olive-green leathery skin, brown-green carapace, pale belly
    "olive": ["#3a4329", "#45502f", "#515d36", "#5d6b3e", "#6a7946", "#78874f", "#879558"],
    "shell": ["#3d3220", "#4a3d26", "#57482c", "#655433", "#73613b", "#826f44", "#917d4e"],
    "straw": ["#9c9265", "#b0a674", "#c2b884", "#d2c994", "#e0d8a6"],
    # hatchlings: dark slate
    "slate": ["#262a2c", "#2e3335", "#373d3f", "#41484a", "#4c5456", "#586062", "#656e70", "#737c7e"],
    # beaks and claws: dark horn
    "horn": ["#3f3524", "#53462f", "#685a3c", "#7e6e4a", "#958459"],
    # sperm whale: wrinkly slate grey, a paler belly
    "whale": ["#3b3e45", "#43474e", "#4c5058", "#555a62", "#5f646c", "#6a6f77", "#757a82"],
    "belly": ["#7d8189", "#8a8e95", "#979ba1", "#a5a8ad", "#b3b6ba"],
    "gum": ["#6b3a43", "#7d4650", "#90535d"],
    # elder guardian: pale, aged prismarine stone with moss
    "elder": ["#6f7a73", "#7b8780", "#88948c", "#96a199", "#a4aea5", "#b2bbb1", "#c0c8bd", "#cfd5ca"],
    "moss": ["#3f5a3a", "#4a6843", "#56764c", "#638456"],
    "mauve": ["#6e5a6c", "#7c6779", "#8b7587", "#9a8395"],
    # saddles: leather and brass, a sea-teal blanket
    "leather": ["#4a2c1c", "#583522", "#673f29", "#764a31", "#865639"],
    "brass": ["#7a5a1e", "#987327", "#b78f35", "#d1ab4a"],
    "cloth": ["#1d4f5e", "#245e6f", "#2c6e80", "#357f91"],
    # flat dot eyes: near-black, and the one lighter pixel
    "ink": ["#0e0c10", "#1a171d", "#2a262e"],
    "glint": ["#9a9aa4", "#d9d9df"],
}
# glow ramps are kept apart from every body ramp: the exporter puts exactly the texels of a glow ramp's colours into
# <name>_glow.png
GLOW_RAMPS = {
    # bioluminescence: the anglerfish lure
    "lureglow": ["#0e4f55", "#16767a", "#22a3a0", "#4fcfc0", "#9cf0de", "#e4fff6"],
    # the elder guardian's eye
    "prism": ["#1f6b5f", "#2d8f7c", "#43b39a", "#74d6bb", "#b6f2df"],
}


def ramps(*names, **extra):
    out = {}
    for n in names:
        out[n] = OCEAN_RAMPS[n] if n in OCEAN_RAMPS else GLOW_RAMPS[n]
    out.update(extra)
    return out


# top-lit shading: lit tops, darker undersides, a soft fall-off down every side
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.6, "ao": 0.4, "ao_height": 6.0}
# vanilla grain: soft clusters of close tones, never single-pixel speckle
GRAIN = {"id": "grain", "op": "noise", "scale": 0.9, "amount": 1.2}
# every side darkens toward its bottom edge
FALLOFF = {"id": "falloff", "op": "gradient", "axis": "y", "amount": 1.0, "faces": ["sides"]}


def flat(ramp, tone, *layers, light=1.0, grain=1.2, rim=1.0, dark=0.9, falloff=1.0, art_key=None, stamps=None):
    """A vanilla-style paint block, shaded with intent: one ramp and a base tone, soft grain, top-lit painted light,
    a 1-px highlight along the lit (upper) edges of every face (`rim`), a darker line along the edges facing away
    (`dark`), every side darkening toward its bottom (`falloff`). No brush strokes."""
    st = {"ramp": ramp, "tone": tone, "light": light, "brush": {"off": True}, "dither": 0,
          "rim": {"light": 1 if rim else 0, "dark": 1 if dark else 0, "light_shift": rim, "dark_shift": -dark}}
    lay = [dict(GRAIN, amount=grain)] if grain else []
    if falloff:
        lay.append(dict(FALLOFF, amount=falloff))
    st["layers"] = lay + list(layers)
    if art_key:
        st["art_key"] = art_key
    if stamps:
        st["stamps"] = stamps
    return st


def card_style(ramp, tone, art_key, light=0.25):
    """Card art (fins, spines, teeth): flat colours from the art, a touch of shading."""
    return {"ramp": ramp, "tone": tone, "light": light, "brush": {"off": True}, "dither": 0,
            "rim": {"light": 0, "dark": 0}, "art_key": art_key}


# ======================================================================= rig helpers
def snap_px(v, density=1):
    return max(1.0 / density, round(float(v) * density) / density)


def limb1(R, id, parent, start, end, thick, style, depth=None, **kw):
    """A box from `start` towards `end` (world), its length rounded to whole texels of the rig's density, pivot at
    `start` (the box starts half a thickness behind the joint so bends never open a gap). Returns the real end."""
    start, end = np.array(start, float), np.array(end, float)
    d = end - start
    L = snap_px(np.linalg.norm(d), R.density)
    dep = depth if depth is not None else thick
    R.part(id, parent, [thick, L, dep], style, at=start, wrot=aim(d), offset=(0, -L / 2 + min(thick, dep) / 2, 0),
           **kw)
    return start + d / np.linalg.norm(d) * (L - min(thick, dep))


def keep_names(R, names, root="body"):
    """Empty bones for part names the new design no longer draws (name compatibility with the mod's code). `names`
    maps a name to its old parent; a missing parent falls back to `root`. Each bone sits on its parent's joint."""
    for n, par in names.items():
        if n in R.F:
            continue
        p = par if par in R.F else root
        R.bone(n, p, rel=(0, 0, 0))


# ======================================================================= markings in part space
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


ALL_FACES = ("front", "back", "left", "right", "top", "bottom")


def marks(R, pid, fn, key, faces=ALL_FACES):
    """Stamp a pattern defined in world space (rest pose) onto a box part: fn(x, y, z, face) -> a char ('.' keeps
    the painted texel), evaluated at every texel centre of each face. Returns the stamps (also added to the part)."""
    p = next(q for q in R.P if q["id"] == pid)
    Rw, at = R.F[pid]
    off = np.array(p.get("offset", (0, 0, 0)), float)
    stamps = []
    for f in faces:
        G = face_grid(p["size"], f, R.density)
        W = at + (G + off) @ Rw.T
        rows = ["".join(fn(float(q[0]), float(q[1]), float(q[2]), f) for q in row) for row in W]
        if any(ch != "." for row in rows for ch in row):
            stamps.append({"face": f, "at": "top-left", "art": rows, "key": key})
    if stamps:
        p.setdefault("paint", {}).setdefault("stamps", []).extend(stamps)
    return stamps


# brow lines over an eye: texel offsets (back, up) from the texel above the eye's top-front corner. "angry" dips
# toward the snout, "sad" toward the back, "flat" is a level line, "heavy" a level line one texel wider each way
BROWS = {"angry": [(0, 0), (1, 0), (2, 1), (3, 1)], "sad": [(-1, 1), (0, 1), (1, 0), (2, 0)],
         "flat": [(0, 0), (1, 0)], "heavy": [(-1, 0), (0, 0), (1, 0), (2, 0)]}


def _eye(u, v, front, top, w, h, glint, lid, brow, gap):
    """Shared eye logic in face units: u runs from the snout back (texel index from the eye's front edge), v up."""
    du, dv = front - u, v - top            # du > 0 behind the front edge, dv > 0 above the top edge
    if 0 < du < w and -h < dv < 0:
        if lid and dv > -1:
            return "l"                      # the top row lidded: a sleepy, wise look
        if glint and du < 1 and dv > (-2 if lid else -1) and w * h > 1:
            return "h"
        return "k"
    if brow:
        for bu, bv in BROWS[brow] if isinstance(brow, str) else brow:
            if bu < du < bu + 1 and gap + bv < dv < gap + bv + 1:
                return "b"
    return "."


def side_eye(top, front, w=2, h=2, glint=True, lid=False, brow=None, gap=0, inner=None):
    """A flat dot eye on a ±X face: near-black texels 'k' in the w x h block whose top-front corner is (top, front)
    (y, z); the front texel of its top row a lighter 'h' (`glint`); `lid`: the top row is lid 'l' (half shut);
    `brow`: a 1-px brow line 'b' above (a BROWS name or offsets), `gap` texels above the eye. `inner`: only faces
    with |x| >= inner (default: any side face)."""
    def fn(x, y, z, face):
        if face not in ("left", "right") or (inner is not None and abs(x) < inner):
            return "."
        return _eye(z, y, front, top, w, h, glint, lid, brow, gap)
    return fn


def front_eye(cx, top, w=2, h=2, glint=True, lid=False, brow=None, gap=0):
    """A pair of flat dot eyes on a +Z face, mirrored at x = ±cx (cx is the inner edge, the brow dips toward it)."""
    def fn(x, y, z, face):
        if face != "front":
            return "."
        # u runs outward from the middle: the inner edge is the "front"
        return _eye(-abs(x), y, -cx, top, w, h, glint, lid, brow, gap)
    return fn


def combine(*fns):
    """The first non-'.' answer of several mark functions."""
    def fn(x, y, z, face):
        for f in fns:
            c = f(x, y, z, face)
            if c != ".":
                return c
        return "."
    return fn


def smooth_field(seed, scale):
    """A smooth 3D field (a few random sine waves) for swirls and mottling, about -1..1."""
    rng = random.Random(seed)
    waves = []
    for _ in range(5):
        d = np.array([rng.gauss(0, 1) for _ in range(3)])
        d /= np.linalg.norm(d)
        waves.append((d / scale * rng.uniform(0.7, 1.4), rng.uniform(0, 2 * math.pi)))

    def f(x, y, z):
        p = np.array((x, y, z))
        return sum(math.sin(float(p @ d) * 2 * math.pi + ph) for d, ph in waves) / 2.2
    return f


def swirls(seed, scale, levels=(0.0,), width=0.09, ch="s"):
    """Thin wavy contour lines of a smooth field (wrinkles, swirls): 1-px lines where the field crosses `levels`."""
    f = smooth_field(seed, scale)

    def fn(x, y, z, face):
        v = f(x, y, z)
        return ch if any(abs(v - lv) < width for lv in levels) else "."
    return fn


def mottle(seed, scale, threshold=0.55, ch="m"):
    """Soft blotches: where the smooth field is above `threshold`."""
    f = smooth_field(seed, scale)
    return lambda x, y, z, face: ch if f(x, y, z) > threshold else "."


# ======================================================================= card art
def fin_shape(w, h, pts, rays=(), seed=0, edge=True, body="m", ray="r", rim="e"):
    """A simple fin: a flat membrane through control points (texel coords, closed curve), straight darker rays from
    a root to points, a lighter rim. Readable flat shapes, no texture."""
    c = Canvas(w, h)
    c.shape(pts, body, seed=seed)
    for (x0, y0), (x1, y1) in rays:
        c.line((x0, y0), (x1, y1), ray, where=(body,))
    if edge:
        c.edge((body, ray), rim)
    return c.rows()


def fangs_row(w, h, every=2, seed=0, up=True, minh=None, skip=0.0, ch="y", root="Y", wide=False):
    """A row of simple white fangs standing on the bottom row (`up`) or hanging from the top row: 1-px needles of
    random height (the root texel a shade darker, `root`), or with `wide` 3-px triangles (a 1-px point on a
    3-px base)."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    minh = minh or max(1, h - 1)
    x = rng.randrange(0, every) + (1 if wide else 0)
    while x < w - (1 if wide else 0):
        if rng.random() >= skip:
            L = rng.randint(minh, h)
            for k in range(L):
                yy = (h - 1 - k) if up else k
                rows[yy][x] = ch if k else root
                if wide and k < L - 1 and L >= 2 and k == 0:
                    rows[yy][x - 1] = rows[yy][x + 1] = root
        x += every
    return ["".join(r) for r in rows]


def banded_fan(w, h, root, reach, spread=(-80, 80), bands="rw", band=1.0, notches=0, seed=0, edge=None):
    """A fan fin spreading from `root` (texel coords) to the right (image-right: backward on a yz card): every texel
    within `reach` of the root and inside the `spread` angles (degrees, 0 = straight right, negative = up) is
    coloured by its distance from the root in bands of `band` texels cycling through `bands` (the lionfish's
    striped rays). `notches`: that many 1-texel gaps cut into the rim between rays. `edge`: the rim's char."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    rx, ry = root
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - rx, y + 0.5 - ry
            d = math.hypot(dx, dy)
            a = math.degrees(math.atan2(dy, dx))
            if d <= reach and spread[0] <= a <= spread[1]:
                rows[y][x] = bands[int(d / band) % len(bands)]
                if edge and d > reach - 1.0:
                    rows[y][x] = edge
    for _ in range(notches):
        a = math.radians(rng.uniform(spread[0] + 10, spread[1] - 10))
        x, y = int(rx + math.cos(a) * (reach - 0.5)), int(ry + math.sin(a) * (reach - 0.5))
        if 0 <= x < w and 0 <= y < h:
            rows[y][x] = "."
    return ["".join(r) for r in rows]


def disc_halo(d, rings="1234"):
    """A soft round glow d texels across: concentric rings, `rings[0]` the faint outer ring ... `rings[-1]` the
    bright centre. Drawn only by the additive eyes pass."""
    c = Canvas(d, d)
    cx = cy = d / 2.0
    n = len(rings)
    for y in range(d):
        for x in range(d):
            t = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (d / 2.0)
            if t <= 1.0:
                c.g[y][x] = rings[min(n - 1, int((1.0 - t) * n))]
    return c.rows()


def check(art):
    w = len(art[0])
    assert all(len(r) == w for r in art), "art rows differ in length"
    return art
