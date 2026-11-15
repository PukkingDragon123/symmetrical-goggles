"""Builds two original weapons in the chunky stylised-weapon genre (studied from public previews of
wackyblocks' weapons on Sketchfab: exaggerated proportions, bevelled forms, glowing cores, wrapped grips,
bold accents). Neither copies a specific model.

    python examples/src/weapons.py examples       # writes sunforge_halberd.json + neon_reaper_scythe.json

Each weapon reads as one sculpted piece: the haft is a single loft that swells into its ferrule, grip
bands, collar, socket and spear tip, with materials changing along it, and the blades are swept lofts
growing out of the socket. VFX are pixel-art cards drawn by lowpix.vfx (starburst flares, embers,
sparkles, rune rings, slash arcs, energy wisps) and animated with stepped and eased keys.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from lowpix import vfx  # noqa: E402

DENSITY = 4
FX_STEPS = (2, 3, 4, 5, 6)


def builder():
    parts = []

    def part(id, **kw):
        d = {"id": id}
        d.update({k: v for k, v in kw.items() if v is not None})
        parts.append(d)
        return d
    return parts, part


def R(v):
    return [round(float(x), 3) for x in v]


def loft(part, id, parent, rings, style, sides=8, rnd=2.2, subdiv=1, caps=(True, True), **kw):
    return part(id, parent=parent, shape="loft",
                rings=[{"at": R(a), "size": R(s) if isinstance(s, (list, tuple)) else s} for a, s in rings],
                profile={"sides": sides, "round": rnd}, subdiv=subdiv, caps=list(caps), style=style, **kw)


def card(part, id, parent, art, size, style, pivot=None, rotation=None, plane="xy", **kw):
    return part(id, parent=parent, shape="card", plane=plane, size=list(size), pivot=pivot, rotation=rotation, art=art,
                style=style, **kw)


def path_bands(length, bands):
    """[(from_y, to_y, layer)] in haft units -> band layers along the loft path (0..1)."""
    return [dict(lay, op="band", axis="path", **{"from": round(a / length, 4), "to": round(b / length, 4)})
            for a, b, lay in bands]


def flicker(name, times, on=0.06):
    keys = [[0.0, [0, 0, 0]]]
    for t in times:
        keys += [[round(t, 3), [-0.999, -0.999, -0.999], "step"], [round(t + on, 3), [0, 0, 0], "step"]]
    return {"part": name, "channel": "scale", "keys": keys}


# ======================================================================= Sunforge Halberd
def halberd():
    P, part = builder()
    L = 52.5
    shaft = [((0, 0, 0), 0.3), ((0, 1.4, 0), 1.6), ((0, 2.8, 0), 2.7), ((0, 3.8, 0), 2.0), ((0, 6.4, 0), 2.25),
             ((0, 15.6, 0), 2.25), ((0, 16.6, 0), 2.7), ((0, 17.6, 0), 1.75), ((0, 31.0, 0), 1.75), ((0, 32.6, 0), 3.1),
             ((0, 34.4, 0), 3.5), ((0, 36.2, 0), 2.9), ((0, 38.4, 0), 2.0), ((0, 41.0, 0), [2.6, 1.6]),
             ((0, 43.6, 0), [3.6, 1.1]), ((0, 48.4, 0), [1.9, 0.8]), ((0, 52.5, 0), 0.25)]
    loft(part, "haft", None, shaft, ["haft"], pivot=[0, 4.6, 0], up=[0, 0, 1], caps=[False, False])
    # crescent axe blade growing out of the socket, two swept horns finishing the crescent, a back hook
    loft(part, "blade", "haft", [((0.6, 36.0, 0), [1.4, 3.8]), ((3.0, 36.6, 0), [1.15, 6.4]), ((6.0, 36.8, 0), [0.95, 9.6]),
                                  ((8.6, 36.2, 0), [0.8, 11.6]), ((10.4, 35.2, 0), [0.6, 12.0]),
                                  ((11.2, 34.6, 0), [0.4, 10.8])], "blade", sides=6, rnd=2.4, caps=[True, False])
    for k, pts in enumerate(([(9.4, 37.8), (11.0, 40.2), (12.6, 42.4), (13.2, 44.4)],
                             [(9.4, 32.0), (11.0, 29.6), (12.4, 27.4), (12.7, 25.4)])):
        loft(part, f"horn{k}", "haft", [((pts[0][0], pts[0][1], 0), [0.75, 3.6]), ((pts[1][0], pts[1][1], 0), [0.55, 2.6]),
                                        ((pts[2][0], pts[2][1], 0), [0.4, 1.4]), ((pts[3][0], pts[3][1], 0), [0.12, 0.25])],
             "blade", sides=6, rnd=2.4, caps=[False, False])
    loft(part, "hook", "haft", [((-0.6, 36.4, 0), [1.2, 2.6]), ((-3.2, 37.2, 0), [0.95, 2.0]), ((-5.8, 36.6, 0), [0.7, 1.4]),
                                 ((-7.6, 34.6, 0), [0.45, 0.8]), ((-8.0, 32.8, 0), [0.15, 0.2])], "blade", sides=6, rnd=2.4,
         caps=[False, False])
    # the sun ornament, pierced by the haft
    part("sun", parent="haft", shape="prism", sides=16, size=[7.8, 7.8, 1.8], pivot=[0, 37.4, 0], style="brass_ring")
    part("sun_core", parent="sun", shape="prism", sides=16, size=[5.4, 5.4, 2.3], style="sun_core")
    for k in range(12):
        a = k * 30.0 + 15
        Lr = 3.2 if k % 2 == 0 else 2.0
        part(f"ray{k}", parent="sun", shape="taper", size=[1.5 if k % 2 == 0 else 1.1, 0.9, Lr],
             pivot=R([3.7 * math.cos(math.radians(a)), 3.7 * math.sin(math.radians(a)), 0]), offset=[0, 0, Lr / 2],
             rotation=[0, 90, a], front_scale=[0.12, 0.6], style="ray", hide=["back", "front"])
    # VFX: a starburst flare in front of and behind the sun, rising embers, sparkles on the edge and the tip
    flare, fkey = vfx.starburst(56, rays=12, inner=0.24, ramp="sun", steps=FX_STEPS)
    for k, z in enumerate((1.3, -1.3)):
        card(part, f"flare{k}", "sun", flare, [15, 15], "fx_sun", pivot=[0, 0, z])
    for k in range(4):
        e_art, _ = vfx.ember(7, 11, ramp="sun", seed=k, steps=FX_STEPS)
        card(part, f"ember{k}", "sun", e_art, [1.6, 2.5], "fx_sun", pivot=R([-2.6 + k * 1.8, 2.0 + (k % 2), 1.6 - k * 0.9]))
    sp_art, _ = vfx.sparkle(15, ramp="sun", steps=FX_STEPS)
    card(part, "glint_edge", "haft", sp_art, [3.0, 3.0], "fx_sun", pivot=[11.4, 38.5, 0.6])
    card(part, "glint_tip", "haft", sp_art, [2.6, 2.6], "fx_sun", pivot=[0, 52.0, 0.7])
    card(part, "ribbon", "haft", ["..rrrr....", ".rrrrrr...", "..rrrr....", "..rrr.....", "..rrr.....", "...rrr....",
                                  "...rrr....", "....rrr...", "....rrr...", "....rrrr..", "...rrrrr..", "...rr.rrr.",
                                  "..rr...rr.", "..r.....r."],
         [4.0, 11.0], "ribbon", pivot=[0.4, 31.0, 1.4], rotation=[0, 0, -8], offset=[1.2, -5.2, 0])

    ramps = {
        "brass": ["#2a1408", "#55290c", "#8a4c14", "#c07a22", "#e6a83a", "#f8d06a", "#fff0b0"],
        "steel": ["#141826", "#262d42", "#3e4a64", "#5e6e8a", "#8a9ab2", "#b8c6d6", "#e4ecf4"],
        "sun": ["#5a1600", "#a33a04", "#e2700c", "#ffa620", "#ffd04a", "#fff09a", "#ffffff"],
        "lacquer": ["#1a0608", "#38100e", "#5e1c14", "#86301c", "#ae4a26", "#d06e3c"],
        "leather": ["#160c08", "#2e1a10", "#4c2c1a", "#6c4228", "#8e5a38"],
        "ribbon": ["#3a0610", "#6a0e1c", "#a01e2a", "#d0383a", "#f06a54"],
    }
    glint = {"id": "glint", "op": "gloss", "dash": True, "length": 3, "density": 0.4, "shift": 2.0, "post": True}
    fx = {"light": 0, "rim": {"light": 0, "dark": 0}}
    styles = {
        "haft": {"ramp": "lacquer", "tone": 3.0, "layers": [
            {"id": "inlay", "op": "stripes", "axis": "path", "period": 2.4, "width": 0.14, "zigzag": [0.8, 0.25],
             "ramp": "brass", "tone": 4.0}] + path_bands(L, [
                (0.0, 3.9, {"id": "butt", "ramp": "brass", "tone": 4.0}),
                (6.2, 15.8, {"id": "grip", "ramp": "leather", "tone": 2.8}),
                (16.0, 17.9, {"id": "ring", "ramp": "brass", "tone": 4.0}),
                (31.2, 38.6, {"id": "socket", "ramp": "brass", "tone": 4.2}),
                (38.6, 52.5, {"id": "spear", "ramp": "steel", "tone": 4.2})]) + [
            {"id": "wrap", "op": "stripes", "axis": "path", "period": 0.9, "width": 0.45, "shift": -1.0,
             "zigzag": [0.4, 0.5], "range": [round(6.2 / L, 4), round(15.8 / L, 4)]},
            {"id": "ridge", "op": "gradient", "axis": "path", "amount": 0.6}, glint]},
        "blade": {"ramp": "steel", "tone": 2.6, "rim": {"light_shift": 1.6, "dark_shift": -1.2}, "layers": [
            {"id": "toward_edge", "op": "gradient", "axis": "path", "amount": 1.4},
            {"id": "edge", "op": "band", "axis": "path", "from": 0.86, "to": 1.0, "tone": 5.4},
            {"id": "sun_etch", "op": "spots", "centers": [[6.0, 36.6, 0.5, 2.1], [6.0, 36.6, -0.5, 2.1]], "ring": 0.72,
             "gaps": -1, "ramp": "brass", "tone": 4.2, "roughness": 0.0},
            {"id": "sun_dot", "op": "spots", "centers": [[6.0, 36.6, 0.5, 0.8], [6.0, 36.6, -0.5, 0.8]], "ramp": "brass",
             "tone": 4.8, "roughness": 0.0},
            {"id": "streak", "op": "stripes", "axis": [1, 1, 0], "period": 3.0, "width": 0.14, "shift": 1.3}, glint]},
        "blade_edge": {"ramp": "steel", "tone": 4.6, "layers": [{"id": "tip", "op": "gradient", "axis": "path", "amount": 1.0}]},
        "brass_ring": {"ramp": "brass", "tone": 3.8, "layers": [
            {"id": "engrave", "op": "stripes", "axis": "around", "period": 0.0625, "width": 0.3, "shift": -1.2}, glint]},
        "sun_core": dict(fx, ramp="sun", tone=4.4, layers=[
            {"id": "core", "op": "spots", "centers": [[0, 0, 1.15, 1.5]], "tone": 6.0, "roughness": 0.0},
            {"id": "halo", "op": "spots", "centers": [[0, 0, 1.15, 2.3]], "ring": 0.66, "gaps": -1, "tone": 5.2,
             "roughness": 0.0}]),
        "ray": {"ramp": "sun", "tone": 3.8, "light": 0.3, "layers": [{"id": "hot", "op": "gradient", "axis": "z",
                                                                     "amount": -1.6}]},
        "fx_sun": dict(fx, ramp="sun", tone=4, art_key=fkey),
        "ribbon": {"ramp": "ribbon", "tone": 3.0, "light": 0.6, "art_key": {"r": "ribbon:3"}},
    }
    rise = []
    for k in range(4):
        t0 = k * 0.7
        rise.append({"part": f"ember{k}", "channel": "position",
                     "keys": [[0, [0, 0, 0]], [t0, [0, 0, 0], "step"], [t0 + 1.6, [0.4 * (k % 2 * 2 - 1), 5.5, 0], "out"],
                              [t0 + 1.62, [0, 0, 0], "step"]]})
        rise.append({"part": f"ember{k}", "channel": "scale",
                     "keys": [[0, [-0.999, -0.999, -0.999]], [t0, [0, 0, 0], "step"], [t0 + 1.6, [-0.7, -0.7, 0], "in"],
                              [t0 + 1.62, [-0.999, -0.999, -0.999], "step"]]})
    anim = {"showcase": {"length": 4.0, "loop": True, "tracks": [
        {"part": "haft", "axis": "y", "keys": [[0, 0], [4.0, 360, "linear"]]},
        {"part": "haft", "channel": "position", "osc": {"amp": [0, 0.8, 0], "cycles": 1, "bias": [0, 1.0, 0]}},
        {"part": "sun_core", "channel": "scale", "osc": {"amp": [0.06, 0.06, 0.0], "cycles": 4, "shape": "pulse"}},
        {"parts": ["flare0", "flare1"], "axis": "z", "keys": [[0, 0], [4.0, 90, "linear"]]},
        {"parts": ["flare0", "flare1"], "channel": "scale", "osc": {"amp": [0.12, 0.12, 0], "cycles": 4}},
        {"part": "glint_edge", "channel": "position", "keys": [[0, [0, 0, 0]], [1.0, [0, 0, 0]],
                                                              [1.6, [0.8, -8.5, 0], "inout_back"],
                                                              [1.62, [0, 0, 0], "step"]]},
        flicker("glint_tip", [0.5, 1.9, 2.0, 3.3]),
        {"part": "ribbon", "axis": "z", "osc": {"amp": 10, "cycles": 2}}] + rise}}
    return {"name": "Sunforge Halberd",
            "description": "Original stylised halberd sculpted as one piece: a single lacquered haft that swells into its "
                           "brass butt, wrapped grip, collar, socket and steel spear; a crescent axe blade and hook grown from "
                           "the socket; a white-hot sun core with alternating rays. Pixel-art VFX: rotating starburst flares, "
                           "rising embers, an edge glint, a twinkling tip.",
            "author": "lowpix example", "license": "CC0-1.0", "density": DENSITY, "budget": {"tris": 2400, "colors": 56},
            "light": {"dir": [-0.5, 1.0, 0.7], "strength": 1.2, "gradient": 0.4, "ao": 0.0},
            "render": {"background": "#1c1826", "hero": [36, 10], "shadow": 0.35, "pose": {"clip": "showcase", "t": 0},
                       "bloom": {"ramps": ["sun"], "min_step": 4, "radius": 2.2, "strength": 1.0}},
            "palette": {"ramps": ramps}, "styles": styles, "parts": P, "animations": anim, "grounded": False}


# ===================================================================== Neon Reaper Scythe
def scythe():
    P, part = builder()
    L = 40.0
    snath = [((0, 0, 0), 2.4), ((0, 1.2, 0), 3.0), ((0, 2.6, 0), 2.4), ((0, 3.6, 0), 1.8), ((0, 5.0, 0), 2.1),
             ((0.2, 12.0, 0), 2.1), ((0.2, 13.0, 0), 2.5), ((0.1, 14.0, 0), 1.7), ((-0.7, 20.0, 0), 1.7), ((0.6, 27.0, 0), 1.7),
             ((0.2, 31.6, 0), 1.8), ((0, 33.2, 0), 2.9), ((0, 34.4, 0), [4.4, 3.4]), ((0, 38.2, 0), [4.4, 3.4]),
             ((0, 39.4, 0), 2.4), ((0, 40.0, 0), 1.0)]
    loft(part, "snath", None, snath, ["snath"], sides=8, rnd=3.0, pivot=[0, 7.0, 0], up=[0, 0, 1])
    # the blade: one swept loft from the head, curving forward and down to a point
    path = [(1.4, 37.4), (5.6, 39.0), (10.0, 38.6), (14.0, 36.4), (16.8, 32.8), (18.0, 28.6), (17.8, 25.4)]
    sizes = [[1.2, 4.4], [1.0, 4.9], [0.9, 4.5], [0.75, 3.7], [0.55, 2.7], [0.38, 1.6], [0.14, 0.35]]
    loft(part, "blade", "snath", [((x, y, 0), s) for (x, y), s in zip(path, sizes)], "blade", sides=6, rnd=2.6,
         caps=[True, False])
    # the neon edge: a parallel loft inset along the concave (inner) side of the blade
    edge = []
    for i, ((x, y), s) in enumerate(zip(path, sizes)):
        x0, y0 = path[max(0, i - 1)]
        x1, y1 = path[min(len(path) - 1, i + 1)]
        tx, ty = x1 - x0, y1 - y0
        n = math.hypot(tx, ty) or 1.0
        nx, ny = ty / n, -tx / n                    # in-plane normal toward the centre of curvature
        off = s[1] / 2 - 0.25
        edge.append(((x + nx * off, y + ny * off, 0), [s[0] + 0.25, 0.55 if i < len(path) - 1 else 0.15]))
    loft(part, "edge", "snath", edge, "neon_edge", sides=6, rnd=2.6, caps=[True, False])
    part("core", parent="snath", shape="prism", sides=8, size=[2.2, 2.2, 3.8], pivot=[0, 36.3, 0], style="neon_core")
    for k, x in enumerate((-2.3, 2.3)):
        part(f"vent{k}", parent="snath", shape="box", size=[0.6, 2.8, 2.2], pivot=[x, 36.3, 0], style="vent")
    # VFX: a rotating rune ring round the head, motes orbiting it, energy wisps, a slash arc for the swing
    ring, nkey = vfx.rune_ring(56, glyphs=12, ramp="neon", steps=FX_STEPS)
    card(part, "rune_ring", "snath", ring, [11, 11], "fx_neon", pivot=[0, 36.3, 0], plane="xz")
    sp_art, _ = vfx.sparkle(13, ramp="neon", steps=FX_STEPS)
    for k in range(4):
        a = k * math.pi / 2
        card(part, f"mote{k}", "snath", sp_art, [1.8, 1.8], "fx_neon", pivot=R([4.6 * math.cos(a), 36.3, 4.6 * math.sin(a)]))
    for k in range(2):
        w_art, _ = vfx.wisp(24, 40, ramp="neon", seed=k, steps=FX_STEPS)
        card(part, f"wisp{k}", "snath", w_art, [2.4, 4.0], "fx_neon", pivot=[-1.2 + 2.4 * k, 39.6, 0.3 - 0.6 * k],
             offset=[0, 2.0, 0])
    slash, _ = vfx.slash_arc(72, 36, ramp="neon", steps=FX_STEPS)
    card(part, "slash", "snath", slash, [26, 13], "fx_neon", pivot=[10.0, 33.0, 0.8])

    ramps = {
        "gun": ["#0c0d12", "#181a22", "#262a36", "#3a404e", "#545c6c", "#7a8292"],
        "accent": ["#3a1202", "#7a2a04", "#c4500a", "#f2801a", "#ffb04a"],
        "neon": ["#2a0638", "#5a0a70", "#a018b0", "#e040e0", "#ff86f4", "#ffd8fc", "#ffffff"],
        "cyan": ["#03202a", "#06485a", "#0a8098", "#22c4d8", "#86f0ff", "#e0fcff"],
        "rubber": ["#08080a", "#141418", "#22222a", "#34343e"],
    }
    fx = {"light": 0, "rim": {"light": 0, "dark": 0}}
    styles = {
        "snath": {"ramp": "gun", "tone": 2.8, "layers": [
            {"id": "trace", "op": "stripes", "axis": "path", "period": 2.2, "width": 0.12, "zigzag": [0.9, 0.25],
             "ramp": "cyan", "tone": 4.0}] + path_bands(L, [
                (0.0, 3.0, {"id": "pommel", "ramp": "accent", "tone": 3.2}),
                (4.8, 12.2, {"id": "grip", "ramp": "rubber", "tone": 2.0}),
                (12.4, 14.0, {"id": "band", "ramp": "accent", "tone": 3.2}),
                (32.4, 33.6, {"id": "collar", "ramp": "accent", "tone": 3.2})]) + [
            {"id": "wrap", "op": "stripes", "axis": "path", "period": 1.0, "width": 0.5, "shift": 1.0,
             "range": [round(4.8 / L, 4), round(12.2 / L, 4)]},
            {"id": "panel_lines", "op": "stripes", "axis": "path", "period": 1.2, "width": 0.18, "shift": -1.3,
             "range": [round(34.0 / L, 4), round(38.6 / L, 4)]}]},
        "blade": {"ramp": "gun", "tone": 3.6, "rim": {"light_shift": 1.4, "dark_shift": -1.0}, "layers": [
            {"id": "sheen", "op": "gradient", "axis": "path", "amount": 1.0},
            {"id": "etch", "op": "stripes", "axis": "path", "period": 3.2, "width": 0.1, "ramp": "neon", "tone": 3.0},
            {"id": "spine", "op": "stripes", "axis": "path", "period": 6.0, "width": 0.5, "shift": -0.8,
             "zigzag": [1.0, 0.5]}]},
        "neon_edge": dict(fx, ramp="neon", tone=4.6, layers=[{"id": "pulse", "op": "stripes", "axis": "path", "period": 2.6,
                                                              "width": 0.3, "tone": 5.6}]),
        "neon_core": dict(fx, ramp="neon", tone=4.4, layers=[{"id": "rune", "op": "rect", "rect": [0.3, 0.3, 0.7, 0.7],
                                                              "tone": 6.0}]),
        "vent": {"ramp": "gun", "tone": 2.4, "layers": [{"id": "slits", "op": "grille", "rect": [0.1, 0.1, 0.9, 0.9],
                                                         "period": 2}]},
        "fx_neon": dict(fx, ramp="neon", tone=4, art_key=nkey),
    }
    orbit = [{"part": f"mote{k}", "channel": "position",
              "keys": [[t / 8 * 4.0, [round(4.6 * (math.cos(math.pi / 2 * k + t * math.pi / 4) - math.cos(math.pi / 2 * k)), 3),
                                      round(0.6 * math.sin(t * math.pi / 2), 3),
                                      round(4.6 * (math.sin(math.pi / 2 * k + t * math.pi / 4) - math.sin(math.pi / 2 * k)), 3)],
                        "smooth"] for t in range(9)]} for k in range(4)]
    wisps = [{"part": f"wisp{k}", "channel": "scale", "osc": {"amp": [0.2, 0.35, 0], "cycles": 3, "phase": 0.5 * k}}
             for k in range(2)]
    hide_slash = {"part": "slash", "channel": "scale", "keys": [[0, [-0.999, -0.999, -0.999]]]}
    anim = {
        "showcase": {"length": 4.0, "loop": True, "tracks": [
            {"part": "snath", "axis": "y", "keys": [[0, 0], [4.0, 360, "linear"]]},
            {"part": "snath", "channel": "position", "osc": {"amp": [0, 0.8, 0], "cycles": 1, "bias": [0, 1.0, 0]}},
            {"part": "core", "channel": "scale", "osc": {"amp": [0.15, 0.15, 0.0], "cycles": 4, "shape": "pulse"}},
            {"part": "rune_ring", "axis": "y", "keys": [[0, 0], [4.0, -180, "linear"]]},
            flicker("edge", [0.9, 1.0, 2.7], 0.05), hide_slash] + orbit + wisps},
        "swing": {"length": 1.6, "loop": True, "tracks": [
            {"part": "snath", "axis": "z", "keys": [[0, 0], [0.45, 38, "in_back"], [0.7, -70, "out"], [1.0, -60],
                                                    [1.5, 0, "smooth"]]},
            {"part": "snath", "channel": "position", "keys": [[0, [0, 0, 0]], [0.45, [-2, 1.0, 0], "in"],
                                                             [0.7, [3, 0.4, 0], "out"], [1.5, [0, 0, 0], "smooth"]]},
            {"part": "slash", "channel": "scale", "keys": [[0, [-0.999, -0.999, -0.999]], [0.5, [-0.999, -0.999, -0.999], "step"],
                                                           [0.62, [0.1, 0.1, 0], "out"], [0.9, [0.25, 0.25, 0]],
                                                           [1.05, [-0.999, -0.999, -0.999], "in"]]},
            {"part": "core", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.6, [0.3, 0.3, 0.1], "out"], [1.0, [0, 0, 0]]]},
            {"part": "rune_ring", "axis": "y", "keys": [[0, 0], [1.6, -360, "linear"]]}] + wisps},
    }
    return {"name": "Neon Reaper Scythe",
            "description": "Original pixel-tech scythe sculpted as one piece: a single gunmetal snath with cyan circuit traces "
                           "that swells into its pommel, rubber grip, accent bands and reactor head, and a swept blade with an "
                           "inset neon edge grown from the head. Pixel-art VFX: a rotating rune ring, orbiting motes, rising "
                           "energy wisps and a slash arc on the swing.",
            "author": "lowpix example", "license": "CC0-1.0", "density": DENSITY, "budget": {"tris": 2400, "colors": 48},
            "light": {"dir": [-0.5, 1.0, 0.7], "strength": 1.0, "gradient": 0.3, "ao": 0.0},
            "render": {"background": "#1a1424", "hero": [24, 10], "shadow": 0.35, "pose": {"clip": "showcase", "t": 0},
                       "bloom": {"ramps": ["neon", "cyan"], "min_step": 3, "radius": 1.8, "strength": 1.1}},
            "palette": {"ramps": ramps}, "styles": styles, "parts": P, "animations": anim, "grounded": False}


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples"
    for spec in (halberd(), scythe()):
        slug = spec["name"].lower().replace(" ", "_")
        with open(os.path.join(out, f"{slug}.json"), "w") as fh:
            json.dump(spec, fh, indent=1)
        print(slug, len(spec["parts"]), "parts")
