"""Vanilla-style paint and helpers for the Winterworks "Living End" entity and 3D-item models.

Used by enderfly.py, endling.py, gucker.py, dragonling.py, chorus_cocoon.py, monolith.py, end_glider.py,
monolith_wand.py, obsidian_shield.py and falling_meteorite.py (all in this folder).

The End's creatures and gear are drawn the way Mojang draws mobs: density 1 (one texel per Minecraft pixel), chunky
boxes sized so every face has room for its texture, and every texel shaded on purpose: a clear lit top and shaded
underside, a bright 1 px lip on the lit edges and a dark one on the shaded edges, a soft grain of three or four close
tones per material (clustered, never single-pixel static) and a few simple markings. Eyes are flat pixels painted on
the face: a 1-2 px glowing or dark eye under a darker brow or lid line, the enderman's violet where it fits. Obsidian
and crying obsidian are painted like the vanilla blocks: violet-black with lighter streaky glints, and the crying
kind's bright violet tears.

Rig, card and clip helpers come from hex_kit.py and end_kit.py (only its density-free helpers: M, MR, LR, limb,
chain_pose, Canvas). Units are Minecraft pixels (16 per block). lowpix axes: Y up, the model faces +Z, ground at
y = 0, "left" is +X.
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hex_kit import (ROOT, Rig, add, clamp, cycle, dump, euler, ground_lock, jitter, mirror_pose,  # noqa: E402,F401
                     osc, pos, r, rest_on_ground, ring, rot_matrix, sc, scale_pose, shake, spin, timeline, wave)
from hex_kit import keys as _keys  # noqa: E402
from end_kit import LR, M, MR, Canvas, aim, chain_pose, mirror_art  # noqa: E402,F401

DENSITY = 1


def keys(part_, axis, ks, ease="ease", ch=None):
    """A keyed track. Eased by default (not Catmull-Rom), so holds and blinks never overshoot past their keys."""
    return _keys(part_, axis, ks, ease=ease, ch=ch)


def limb(R, id, parent, start, end, thick, style, depth=None, **kw):
    """A box from `start` towards `end` (world), its length rounded to whole pixels, pivot at `start`.
    Returns the real end point."""
    import numpy as np
    start, end = np.array(start, float), np.array(end, float)
    d = end - start
    L = max(1, int(round(float(np.linalg.norm(d)))))
    R.part(id, parent, [thick, L, depth if depth is not None else thick], style, at=start, wrot=aim(d),
           offset=(0, -L / 2 + min(thick, depth or thick) / 4, 0), **kw)
    return start + d / np.linalg.norm(d) * L


# ======================================================================= palettes (darkest first, hue-shifted)
RAMPS = {
    # the enderman's black: near-black with a cold violet cast on the lit nap
    "ender": ["#030205", "#08060b", "#0e0b13", "#15111c", "#1d1826", "#262031", "#30293d", "#3c344b", "#4a405b"],
    # ender eyes (a glow ramp: the exporter puts exactly these colours in the _glow layer)
    "eyeglow": ["#5b1a87", "#8a2bc0", "#b244e6", "#cf6ef7", "#e49cfb", "#f4cdfd", "#fdf1ff"],
    # obsidian, like the block: violet-black with lighter violet streaks
    "obsidian": ["#06040a", "#0c0814", "#130d1f", "#1b132b", "#241a39", "#2f2348", "#3c2e59", "#4b3b6c", "#5d4c80",
                 "#72619a"],
    # crying obsidian's tears and every rune and seam (a glow ramp)
    "crying": ["#3c0b78", "#5a14a8", "#7b23d3", "#9a3bf0", "#b65efd", "#d08eff", "#e8c2ff", "#fbefff"],
    "endstone": ["#3f3d2a", "#59573b", "#76744f", "#939064", "#aeab78", "#c6c48b", "#d9d89d", "#e8e8b4", "#f4f4d2"],
    "purpur": ["#2e1c33", "#45294c", "#5e3a66", "#784e80", "#916599", "#a97fb0", "#c19ac6", "#d6b7d9", "#e8d3ea"],
    "chorus": ["#24132d", "#371d44", "#4c295c", "#623674", "#79468b", "#9059a1", "#a774b6", "#bf93ca", "#d6b5dd",
               "#ead6ee"],
    "lilac": ["#2c2140", "#3e3057", "#52426f", "#685687", "#7f6c9e", "#9784b4", "#b09ec9", "#cabadc", "#e3d9ee"],
    "stone": ["#16131b", "#211d28", "#2d2836", "#3a3445", "#484155", "#575067", "#686079", "#7c748c", "#938ba2"],
    "iron": ["#1d1d23", "#2e2e36", "#41414b", "#56565f", "#6d6d76", "#86868e", "#a1a1a8", "#bdbdc2", "#dadadd"],
    "gold": ["#3a1d14", "#5e3016", "#874b17", "#b06c1b", "#d18f24", "#e8b23a", "#f6d35e", "#fdf09a"],
    "leather": ["#1e120e", "#2e1c15", "#41291d", "#563727", "#6c4632", "#83573f", "#9a6a4e"],
    "void": ["#040209", "#0a0616", "#110b24", "#1a1234", "#251a46", "#33245a"],
    "star": ["#6f5fc8", "#a99bf5", "#e4ddff", "#ffffff"],
    # meteorite crust: scorched warm black-brown with cool iron glints
    "meteor": ["#0d0909", "#161011", "#201819", "#2b2222", "#372d2c", "#453938", "#554846", "#6a5d5a", "#857a76"],
    # molten seams and flames, edge to heart (a glow ramp)
    "molten": ["#5a1170", "#94207e", "#d0405e", "#f2702e", "#ffa035", "#ffcb57", "#fff09a", "#fffbe0"],
}
GLOW = ("eyeglow", "crying", "molten")


def ramps(*names, **extra):
    out = {n: RAMPS[n] for n in names}
    out.update(extra)
    return out


# ======================================================================= the paint recipe
LIGHT = {"dir": [-0.45, 1.0, 0.6], "strength": 0.9, "gradient": 0.55, "ao": 0.7, "ao_height": 4.0}


def skin(ramp, tone, grain=0.9, grain_scale=0.7, light=1.0, lip=1.0, shade=-1.0, layers=(), stamps=(), clusters=True,
         dark_low=0.6, **extra):
    """A vanilla mob's material: base `tone` on `ramp`, a clustered grain (`grain` tones of fBm at `grain_scale` px),
    the painted light, a 1 px lip on lit edges (+`lip`) and on shaded ones (`shade`), the underside darker
    (`dark_low`), ordered-dither quantising (crisp texels, no strokes). `layers` (markings) go on after the grain."""
    ls = [{"id": "grain", "op": "noise", "scale": grain_scale, "amount": grain, "octaves": 2}]
    if clusters:
        ls.append({"id": "mottle", "op": "noise", "scale": 2.6, "amount": grain * 0.6, "octaves": 1})
    if dark_low:
        ls.append({"id": "dark_low", "op": "gradient", "axis": "y", "amount": dark_low})
    ls += list(layers)
    st = {"ramp": ramp, "tone": tone, "light": light, "brush": {"off": True}, "dither": 0.55,
          "rim": {"light": 1, "dark": 1, "light_shift": lip, "dark_shift": shade, "threshold": 0.2},
          "layers": ls}
    if stamps:
        st["stamps"] = list(stamps)
    st.update(extra)
    return st


def obsidian(tone=3.4, tears=0.0, streaks=True, layers=(), **kw):
    """Vanilla obsidian: violet-black, a coarse grain, lighter violet streaks and glints; `tears` > 0 adds crying
    obsidian's bright violet drops (glowing)."""
    ls = []
    if streaks:
        ls += [{"id": "streaks", "op": "patches", "scale": 1.6, "threshold": 0.66, "octaves": 2, "shift": 2.2},
               {"id": "glints", "op": "speckle", "density": 0.035, "shift": 3.0}]
    if tears:
        ls += [{"id": "tears", "op": "patches", "scale": 1.3, "threshold": 1.0 - 0.32 * tears, "octaves": 2,
                "ramp": "crying", "tone": 3.2},
               {"id": "tear_core", "op": "patches", "scale": 1.3, "threshold": 1.0 - 0.16 * tears, "octaves": 2,
                "ramp": "crying", "tone": 5.4}]
    return skin("obsidian", tone, grain=1.1, grain_scale=0.8, lip=1.4, shade=-0.8, layers=ls + list(layers), **kw)


def glow(ramp="eyeglow", tone=4.0, layers=(), **kw):
    """A glowing part: flat-lit, a soft grain, a brighter heart."""
    st = skin(ramp, tone, grain=0.6, grain_scale=0.8, light=0.25, lip=0.6, shade=-0.6, clusters=False, dark_low=0,
              layers=layers, **kw)
    return st


def card_style(ramp, tone, art_key, light=0.4, grain=0.6, layers=(), **kw):
    """Cards (wings, membranes, flames): painted by their art key; unkeyed texels get the ramp and a grain."""
    st = {"ramp": ramp, "tone": tone, "light": light, "brush": {"off": True}, "dither": 0.5,
          "rim": {"light": 0, "dark": 0},
          "layers": [{"id": "grain", "op": "noise", "scale": 0.8, "amount": grain, "octaves": 2}] + list(layers),
          "art_key": dict(art_key)}
    st.update(kw)
    return st


# ======================================================================= faces
def eye_card(w, h, art):
    """Check a flat eye's art (rows of w chars)."""
    assert len(art) == h and all(len(row) == w for row in art), art
    return list(art)


EPS = 0.04          # how far a flat eye or decal card floats in front of the face it lies on (px)


# ======================================================================= card art
def wing(w, h, seed, veins=3, spot=None, spot_key=("S", "s"), tip_round=0.35, root_v=0.6, notch=False):
    """A simple insect wing lying flat (card plane xz), left side: column 0 at the root, the last column the tip; row 0
    the trailing edge (-Z), the last row the leading edge (+Z). A rounded outline, a darker leading edge ('C'), a pale
    rim ('r'), `veins` clean vein lines from the root fanning to the margin ('v'), an optional round spot (`spot` =
    (u, v, radius) in 0..1 of w, h; 'S' the spot, 's' its ring). 'm' is membrane, painted by the style."""
    c = Canvas(w, h)
    W, H = float(w), float(h)
    xy = lambda u, v: (u * W, v * H)  # noqa: E731
    ctrl = [(0.0, root_v - 0.12), (0.0, root_v + 0.2), (0.35, 1.0), (0.8, 1.0), (1.0, 0.75),
            (1.0, 0.35 + tip_round * 0.2), (0.82, 0.02), (0.45, 0.0), (0.12, 0.2)]
    c.shape([xy(u, v) for u, v in ctrl], "m", jitter=0.0, seed=seed)
    for x, y in c.edge("m", "r"):
        pass
    for x in range(w):
        col = [y for y in range(h) if c.g[y][x] in "mr"]
        if col:
            c.g[max(col)][x] = "C"
    rng = random.Random(seed)
    root = xy(0.02, root_v)
    for k in range(veins):
        u = 0.55 + 0.45 * (k + 1) / (veins + 0.5)
        v = 0.95 - 0.95 * (k + 0.5) / veins
        end = xy(min(0.97, u + rng.uniform(-0.04, 0.04)), max(0.05, v))
        mid = ((root[0] + end[0]) / 2, (root[1] + end[1]) / 2 + rng.uniform(-0.4, 0.4))
        c.curve([root, mid, end], "v", where="m")
    if spot:
        su, sv, sr = spot
        cx, cy = su * W, sv * H
        c.disc(cx, cy, sr + 1.0, spot_key[1], where="mv")
        c.disc(cx, cy, sr, spot_key[0], where="mv" + spot_key[1])
    return c.rows()


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
