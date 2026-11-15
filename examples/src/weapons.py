"""Builds two original weapons in the chunky stylised-weapon genre (studied from public previews of
wackyblocks' weapons on Sketchfab: exaggerated proportions, faceted bevelled parts, glowing cores,
wrapped grips, bold accent colours). Neither copies a specific model.

    python examples/src/weapons.py examples          # writes sunforge_halberd.json + neon_reaper_scythe.json

* Sunforge Halberd: the painted sub-style. Chamfered faceted steel and brass, smooth painted
  gradients, a white-hot sun core ringed by alternating rays, a crescent axe blade, a spear tip, a
  back hook and a red ribbon. Clips: showcase (spin, bob, pulsing core).
* Neon Reaper Scythe: the blocky pixel-tech sub-style. Stacked cuboid shaft segments in gunmetal
  with circuit traces and orange accent bands, a stepped-arc blade with a neon edge, a reactor block
  with vents, cables and a rune pommel. Clips: showcase (spin, neon flicker) and swing.
"""
import json
import math
import os
import sys

DENSITY = 4


def mk():
    parts = []

    def part(id, **kw):
        d = {"id": id}
        d.update({k: v for k, v in kw.items() if v is not None})
        parts.append(d)
        return d
    return parts, part


def R(v):
    return [round(float(x), 3) for x in v]


# ======================================================================= Sunforge Halberd
def halberd():
    P, part = mk()
    part("shaft", shape="loft", pivot=[0, 4.6, 0], rings=[{"at": [0, 0, 0], "size": 1.7}, {"at": [0, 16, 0], "size": 1.55},
                                       {"at": [0, 33, 0], "size": 1.7}],
         profile={"sides": 8, "round": 2.2}, subdiv=0, caps=[True, True], style="lacquer", up=[0, 0, 1])
    part("grip", parent="shaft", shape="loft", rings=[{"at": [0, 7, 0], "size": 2.1}, {"at": [0, 17, 0], "size": 2.0}],
         profile={"sides": 8, "round": 2.2}, subdiv=0, caps=[True, True], style="leather", up=[0, 0, 1])
    for k, y in enumerate((6.6, 17.4, 25.0)):
        part(f"ring{k}", parent="shaft", shape="prism", sides=8, size=[2.6, 2.6, 0.9], pivot=[0, y, 0], rotation=[-90, 0, 0],
             style="brass")
    part("butt", parent="shaft", shape="taper", size=[2.4, 2.4, 4.4], pivot=[0, 0.2, 0], offset=[0, 0, 2.2],
         rotation=[90, 0, 45], front_scale=[0.12, 0.12], chamfer=0.4, style="brass", hide=["back", "front"])
    part("collar", parent="shaft", shape="prism", sides=8, size=[3.4, 3.4, 3.0], pivot=[0, 32.6, 0], rotation=[-90, 0, 0],
         back_scale=[0.8, 0.8], style="brass_engraved")
    part("head", parent="shaft", shape="bone", pivot=[0, 37.6, 0], style="brass")
    # the sun: a white-hot core in a brass ring, alternating long and short rays
    part("sun_ring", parent="head", shape="prism", sides=12, size=[7.6, 7.6, 1.8], style="brass")
    part("sun_core", parent="sun_ring", shape="prism", sides=12, size=[5.6, 5.6, 2.2], pivot=[0, 0, 0], style="sun")
    for k in range(12):
        a = k * 30.0
        L = 3.4 if k % 2 == 0 else 2.2
        part(f"ray{k}", parent="sun_ring", shape="taper", size=[1.5 if k % 2 == 0 else 1.1, 0.9, L],
             pivot=R([3.6 * math.cos(math.radians(a)), 3.6 * math.sin(math.radians(a)), 0]), offset=[0, 0, L / 2],
             rotation=[0, 90, a], front_scale=[0.12, 0.6], style="sun_ray", hide=["back", "front"])
    # crescent axe blade on +x: a chamfered body with two swept horns
    part("blade", parent="head", shape="box", size=[6.6, 9.6, 1.0], pivot=[8.0, -0.6, 0], chamfer=0.35, style="steel_face")
    part("blade_edge", parent="blade", shape="box", size=[1.4, 10.4, 0.6], pivot=[3.6, 0, 0], chamfer=0.15, style="edge")
    for side in (1, -1):
        part(f"horn{'' if side > 0 else '_lo'}", parent="blade", shape="taper", size=[1.0, 3.2, 6.4],
             pivot=[2.2, side * 4.4, 0], offset=[0, 0, 2.6], rotation=[side * -60, 90, 0], front_scale=[0.5, 0.1],
             chamfer=0.3, style="steel", hide=["back", "front"])
    part("langet", parent="head", shape="box", size=[3.8, 2.6, 1.6], pivot=[4.4, -0.6, 0], chamfer=0.4, style="brass")
    # spear tip and a hooked back spike
    part("spear", parent="head", shape="taper", size=[2.4, 1.3, 11.0], pivot=[0, 3.6, 0], offset=[0, 0, 5.5],
         rotation=[-90, 0, 0], front_scale=[0.06, 0.2], chamfer=0.3, style="steel", hide=["back", "front"])
    part("spear_fuller", parent="spear", shape="box", size=[0.6, 0.5, 6.0], pivot=[0, 0.5, 3.5], style="fuller")
    part("hook", parent="head", shape="taper", size=[1.4, 1.2, 5.0], pivot=[-4.4, 0.6, 0], offset=[0, 0, 2.5],
         rotation=[0, -90, 0], front_scale=[0.6, 0.6], chamfer=0.2, style="steel", hide=["back"])
    part("hook_tip", parent="hook", shape="taper", size=[0.9, 0.8, 3.4], pivot=[0, 0, 5.0], offset=[0, 0, 1.7],
         rotation=[50, 0, 0], front_scale=[0.08, 0.08], style="steel", hide=["back", "front"])
    # a ribbon tied under the collar
    part("ribbon", parent="shaft", shape="card", plane="xy", pivot=[0.4, 31.2, 1.3], size=[4.0, 11.0], offset=[1.2, -5.2, 0],
         rotation=[0, 0, -8], style="ribbon",
         art=["..rrrr....", ".rrrrrr...", "..rrrr....", "..rrr.....", "..rrr.....", "...rrr....", "...rrr....", "....rrr...",
              "....rrr...", "....rrrr..", "...rrrrr..", "...rr.rrr.", "..rr...rr.", "..r.....r."])
    ramps = {
        "brass": ["#2a1408", "#55290c", "#8a4c14", "#c07a22", "#e6a83a", "#f8d06a", "#fff0b0"],
        "steel": ["#141826", "#262d42", "#3e4a64", "#5e6e8a", "#8a9ab2", "#b8c6d6", "#e4ecf4"],
        "sun": ["#5a1600", "#a33a04", "#e2700c", "#ffa620", "#ffd04a", "#fff09a", "#ffffff"],
        "lacquer": ["#1a0608", "#38100e", "#5e1c14", "#86301c", "#ae4a26", "#d06e3c"],
        "leather": ["#160c08", "#2e1a10", "#4c2c1a", "#6c4228", "#8e5a38"],
        "ribbon": ["#3a0610", "#6a0e1c", "#a01e2a", "#d0383a", "#f06a54"],
    }
    glint = {"id": "glint", "op": "gloss", "dash": True, "length": 3, "density": 0.4, "shift": 2.0, "post": True}
    styles = {
        "brass": {"ramp": "brass", "tone": 3.8, "layers": [{"id": "grad", "op": "gradient", "axis": "y", "amount": 0.8},
                                                         glint]},
        "brass_engraved": {"ramp": "brass", "tone": 3.6, "layers": [
            {"id": "rays", "op": "stripes", "axis": "around", "period": 0.125, "width": 0.25, "shift": -1.4}, glint]},
        "steel": {"ramp": "steel", "tone": 4.0, "rim": {"light_shift": 1.6, "dark_shift": -1.2}, "layers": [
            {"id": "sheen", "op": "gradient", "axis": "y", "amount": 1.2},
            {"id": "streak", "op": "stripes", "axis": [1, 1, 0], "period": 3.0, "width": 0.18, "shift": 1.2, "faces": ["front", "back"]},
            glint]},
        "edge": {"ramp": "steel", "tone": 5.2, "light": 0.6, "layers": [
            {"id": "hone", "op": "stripes", "axis": "y", "period": 1.4, "width": 0.3, "shift": 0.8}]},
        "steel_face": {"ramp": "steel", "tone": 3.0, "rim": {"light_shift": 1.6, "dark_shift": -1.2}, "layers": [
            {"id": "sheen", "op": "gradient", "axis": "y", "amount": 1.2},
            {"id": "sun_etch", "op": "spots", "centers": [[-0.6, 0, 0.55, 2.2], [-0.6, 0, -0.55, 2.2]], "ring": 0.72,
             "gaps": -1, "ramp": "brass", "tone": 4.0, "roughness": 0.0, "faces": ["front", "back"]},
            {"id": "sun_dot", "op": "spots", "centers": [[-0.6, 0, 0.55, 0.9], [-0.6, 0, -0.55, 0.9]], "ramp": "brass",
             "tone": 4.6, "roughness": 0.0, "faces": ["front", "back"]},
            {"id": "streak", "op": "stripes", "axis": [1, 1, 0], "period": 3.0, "width": 0.16, "shift": 1.4,
             "faces": ["front", "back"]}, glint]},
        "fuller": {"ramp": "steel", "tone": 2.4},
        "sun": {"ramp": "sun", "tone": 4.2, "light": 0, "rim": {"light": 0, "dark": 0}, "layers": [
            {"id": "core", "op": "spots", "centers": [[0, 0, 1.1, 1.6]], "tone": 6.0, "roughness": 0.0},
            {"id": "halo", "op": "spots", "centers": [[0, 0, 1.1, 2.4]], "ring": 0.66, "gaps": -1, "tone": 5.0,
             "roughness": 0.0},
            {"id": "flare", "op": "stripes", "axis": "around", "period": 0.0833, "width": 0.3, "shift": 0.8}]},
        "sun_ray": {"ramp": "sun", "tone": 3.6, "light": 0.3, "layers": [
            {"id": "hot", "op": "gradient", "axis": "z", "amount": -1.6}]},
        "lacquer": {"ramp": "lacquer", "tone": 3.0, "layers": [
            {"id": "inlay", "op": "stripes", "axis": "y", "period": 2.4, "width": 0.14, "zigzag": [0.8, 0.25],
             "ramp": "brass", "tone": 4.0}, glint]},
        "leather": {"ramp": "leather", "tone": 2.6, "layers": [
            {"id": "wrap", "op": "stripes", "axis": "y", "period": 0.9, "width": 0.45, "shift": -1.0, "zigzag": [0.4, 0.5]}]},
        "ribbon": {"ramp": "ribbon", "tone": 3.0, "light": 0.6, "art_key": {"r": "ribbon:3"}},
    }
    anim = {"showcase": {"length": 4.0, "loop": True, "tracks": [
        {"part": "shaft", "axis": "y", "keys": [[0, 0], [4.0, 360, "linear"]]},
        {"part": "shaft", "channel": "position", "osc": {"amp": [0, 0.8, 0], "cycles": 1, "bias": [0, 1.0, 0]}},
        {"part": "sun_core", "channel": "scale", "osc": {"amp": [0.06, 0.06, 0.0], "cycles": 4, "shape": "pulse"}},
        {"part": "sun_ring", "axis": "z", "keys": [[0, 0], [4.0, -90, "linear"]]},
        {"part": "ribbon", "axis": "z", "osc": {"amp": 10, "cycles": 2}}]}}
    return {"name": "Sunforge Halberd",
            "description": "Original stylised halberd: chamfered faceted steel and brass, a white-hot sun core with "
                           "alternating rays, crescent axe blade, spear tip, hooked back spike, lacquered shaft with a "
                           "wrapped grip and a red ribbon. Painted gradients, glowing core.",
            "author": "lowpix example", "license": "CC0-1.0", "density": DENSITY, "budget": {"tris": 1600, "colors": 56},
            "light": {"dir": [-0.5, 1.0, 0.7], "strength": 1.2, "gradient": 0.4, "ao": 0.0},
            "render": {"background": "#1c1826", "hero": [38, 10], "shadow": 0.35,
                       "bloom": {"ramps": ["sun"], "min_step": 4, "radius": 2.2, "strength": 1.0}},
            "palette": {"ramps": ramps}, "styles": styles, "parts": P, "animations": anim, "grounded": False}


# ===================================================================== Neon Reaper Scythe
def scythe():
    P, part = mk()
    part("shaft", shape="bone", pivot=[0, 7.0, 0], style="gun")
    segs = [(0.0, 7.0, 0), (7.0, 7.0, 4), (14.0, 7.0, -3), (21.0, 7.0, 3), (28.0, 6.0, -2)]
    prev = "shaft"
    for k, (y0, L, tilt) in enumerate(segs):
        w = 1.9 if k % 2 == 0 else 1.6
        part(f"seg{k}", parent=prev, shape="box", size=[w, L, w], pivot=[0, 0 if k == 0 else segs[k - 1][1], 0],
             offset=[0, L / 2, 0], rotation=[0, 0, tilt], style="circuit" if k != 1 else "grip")
        part(f"band{k}", parent=f"seg{k}", shape="box", size=[w + 0.5, 0.8, w + 0.5], pivot=[0, L - 0.4, 0],
             style="accent" if k % 2 == 0 else "gun")
        prev = f"seg{k}"
    part("pommel", parent="seg0", shape="box", size=[2.8, 2.8, 2.8], pivot=[0, -1.2, 0], rotation=[0, 45, 0], style="gun")
    part("pommel_rune", parent="pommel", shape="box", size=[1.2, 1.2, 3.0], style="neon_block")
    part("reactor", parent="seg4", shape="box", size=[4.2, 4.6, 3.4], pivot=[0, 6.2, 0], offset=[0, 1.8, 0], style="reactor")
    part("reactor_core", parent="reactor", shape="box", size=[2.4, 2.4, 3.6], pivot=[0, 1.8, 0], style="neon_block")
    for k, (x, y) in enumerate(((-2.4, 0.4), (-2.6, 2.6))):
        part(f"cable{k}", parent="reactor", shape="box", size=[0.7, 0.7, 4.2], pivot=[x, y, -1.0], offset=[0, 0, -1.6],
             rotation=[20 + k * 15, -30, 0], style="cable")
    # the blade: a stepped arc of chunky blocks sweeping forward and down, each with a neon edge strip
    arc = [(1.6, 4.4, 0, 4.4), (5.6, 4.6, -12, 4.2), (9.4, 3.6, -28, 4.0), (12.6, 1.6, -46, 3.6), (14.8, -1.4, -66, 3.2),
           (15.8, -4.6, -86, 2.8)]
    for k, (x, y, rot, L) in enumerate(arc):
        h = 3.6 - k * 0.45
        part(f"blade{k}", parent="reactor", shape="box", size=[L, h, 0.9], pivot=[x, y, 0], rotation=[0, 0, rot], style="blade")
        part(f"edge{k}", parent=f"blade{k}", shape="box", size=[L, 0.7, 1.1], pivot=[0, -h / 2 + 0.2, 0], style="neon_edge")
    part("tip", parent="blade5", shape="taper", size=[1.2, 2.0, 3.2], pivot=[1.2, -0.4, 0], offset=[0, 0, 1.6],
         rotation=[0, 90, -20], front_scale=[0.15, 0.15], style="blade", hide=["back", "front"])
    part("spine_fin", parent="blade1", shape="box", size=[3.0, 1.4, 0.5], pivot=[-0.4, 2.2, 0], rotation=[0, 0, 18],
         style="accent")
    ramps = {
        "gun": ["#0c0d12", "#181a22", "#262a36", "#3a404e", "#545c6c", "#7a8292"],
        "accent": ["#3a1202", "#7a2a04", "#c4500a", "#f2801a", "#ffb04a"],
        "neon": ["#2a0638", "#5a0a70", "#a018b0", "#e040e0", "#ff86f4", "#ffd8fc", "#ffffff"],
        "cyan": ["#03202a", "#06485a", "#0a8098", "#22c4d8", "#86f0ff", "#e0fcff"],
        "rubber": ["#08080a", "#141418", "#22222a", "#34343e"],
    }
    trace = {"id": "trace", "op": "stripes", "axis": "y", "period": 2.2, "width": 0.12, "zigzag": [0.9, 0.5], "ramp": "cyan",
             "tone": 4.0}
    node = {"id": "nodes", "op": "rivets", "inset": 1, "spacing": 4, "ramp": "cyan", "tone": 4.5, "min_size": 5}
    styles = {
        "gun": {"ramp": "gun", "tone": 3.0, "dither": 0, "layers": [
            {"id": "panel", "op": "panel", "inset": 1, "shift": -1.2, "highlight": 1.0, "min_size": 6}]},
        "circuit": {"ramp": "gun", "tone": 2.8, "dither": 0, "layers": [
            {"id": "panel", "op": "panel", "inset": 1, "shift": -1.2, "highlight": 1.0, "min_size": 6}, trace, node]},
        "grip": {"ramp": "rubber", "tone": 2.0, "layers": [
            {"id": "wrap", "op": "stripes", "axis": "y", "period": 1.0, "width": 0.5, "shift": 1.0}]},
        "accent": {"ramp": "accent", "tone": 3.0, "layers": [
            {"id": "notch", "op": "stripes", "axis": "x", "period": 1.0, "width": 0.25, "shift": -1.2, "faces": ["front", "back"]}]},
        "reactor": {"ramp": "gun", "tone": 3.2, "layers": [
            {"id": "panel", "op": "panel", "inset": 1, "shift": -1.3, "highlight": 1.0},
            {"id": "vents", "op": "grille", "rect": [0.12, 0.6, 0.88, 0.9], "period": 2, "faces": ["left", "right"]},
            {"id": "warn", "op": "stripes", "axis": [1, 1, 0], "period": 1.6, "width": 0.5, "ramp": "accent", "tone": 3.4,
             "range": [-1.0, -0.6]}, node]},
        "neon_block": {"ramp": "neon", "tone": 4.4, "light": 0, "rim": {"light": 0, "dark": 0}, "layers": [
            {"id": "rune", "op": "rect", "rect": [0.3, 0.3, 0.7, 0.7], "tone": 6.0}]},
        "cable": {"ramp": "rubber", "tone": 1.8, "layers": [{"id": "rib", "op": "stripes", "axis": "z", "period": 0.6, "width": 0.4,
                                                             "shift": 1.0}]},
        "blade": {"ramp": "gun", "tone": 3.6, "dither": 0, "rim": {"light_shift": 1.4, "dark_shift": -1.0}, "layers": [
            {"id": "plate", "op": "panel", "inset": 1, "shift": -1.0, "highlight": 1.0, "min_size": 5},
            {"id": "etch", "op": "stripes", "axis": "x", "period": 3.0, "width": 0.12, "ramp": "neon", "tone": 3.0,
             "faces": ["front", "back"]}]},
        "neon_edge": {"ramp": "neon", "tone": 4.6, "light": 0, "rim": {"light": 0, "dark": 0}},
    }
    swing = {"length": 1.6, "loop": True, "tracks": [
        {"part": "shaft", "axis": "z", "keys": [[0, 0], [0.45, 38, "in_back"], [0.7, -70, "out"], [1.0, -60], [1.5, 0, "smooth"]]},
        {"part": "shaft", "channel": "position", "keys": [[0, [0, 0, 0]], [0.45, [-2, 1.0, 0], "in"], [0.7, [3, 0.4, 0], "out"],
                                                         [1.5, [0, 0, 0], "smooth"]]},
        {"part": "reactor_core", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.6, [0.25, 0.25, 0.1], "out"], [1.0, [0, 0, 0]]]}]}
    flick = [{"part": f"edge{k}", "channel": "scale", "keys": [[0, [0, 0, 0]], [0.4 + k * 0.37, [0, -0.5, 0], "step"],
                                                               [0.46 + k * 0.37, [0, 0, 0], "step"]]} for k in range(6)]
    anim = {"showcase": {"length": 4.0, "loop": True, "tracks": [
        {"part": "shaft", "axis": "y", "keys": [[0, 0], [4.0, 360, "linear"]]},
        {"part": "shaft", "channel": "position", "osc": {"amp": [0, 0.8, 0], "cycles": 1, "bias": [0, 1.0, 0]}},
        {"part": "reactor_core", "channel": "scale", "osc": {"amp": [0.12, 0.12, 0.0], "cycles": 4, "shape": "pulse"}}] + flick},
            "swing": swing}
    return {"name": "Neon Reaper Scythe",
            "description": "Original blocky pixel-tech scythe: stacked gunmetal shaft segments with cyan circuit traces "
                           "and orange accent bands, a rubber grip, a reactor block with vents and cables, a stepped-arc "
                           "blade with a neon edge, and a rune pommel. Glowing neon, flickering edge.",
            "author": "lowpix example", "license": "CC0-1.0", "density": DENSITY, "budget": {"tris": 1200, "colors": 48},
            "light": {"dir": [-0.5, 1.0, 0.7], "strength": 1.0, "gradient": 0.3, "ao": 0.0},
            "render": {"background": "#1a1424", "hero": [24, 10], "shadow": 0.35,
                       "bloom": {"ramps": ["neon", "cyan"], "min_step": 3, "radius": 1.8, "strength": 1.1}},
            "palette": {"ramps": ramps}, "styles": styles, "parts": P, "animations": anim, "grounded": False}


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "examples"
    for spec in (halberd(), scythe()):
        slug = spec["name"].lower().replace(" ", "_")
        with open(os.path.join(out, f"{slug}.json"), "w") as fh:
            json.dump(spec, fh, indent=1)
        print(slug, len(spec["parts"]), "parts")
