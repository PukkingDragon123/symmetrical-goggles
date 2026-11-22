"""Shared ramps and the block-model exporter for the Winterworks "Tides & Treasures" 3D art (hydrothermal_vent.py,
tube_worms.py, nautilus_horn.py, whale_lure.py, eye_of_the_ocean.py, cannon.py, turtle_shell_armor.py and
cannonball.py, all in this folder).

`python -m lowpix mc export` writes entity models (for block-entity renderers, armour and projectiles). Static blocks
need vanilla block-model JSON instead, so `block_models` does that here, generalised from chorus_cocoon.py: it packs
the spec's texture with lowpix's Minecraft box-UV packer (lowpix.mc.from_model), pads it to a square power of two and
writes one element per box or card, every face UV-mapped into that texture. Elements may turn about one axis by 22.5
or 45 degrees only (vanilla's rule). Cards get a back face showing the same art, so draw those blocks in the cutout
layer. With `glow`, a second texture keeps only the glowing texels (the spec's `minecraft.glow_parts` and
`glow_ramps`) and a second model keeps only the faces that have some: lay it over the block with an emissive material
(see client/endmob/BloomGlowModel.java) so the glow stays bright in dark water.

Rig, card and clip helpers come from hex_kit.py; the round-eye art from obsidian_kit.py.
"""
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MOD = os.path.join(ROOT, "mods", "winterworks")
RES = os.path.join(MOD, "src", "main", "resources", "assets", "winterworks")

# ======================================================================= ramps (dark -> light, hue-shifted)
RAMPS = {
    # basalt: blue-black columns; mineral crust: rust, ochre and sulphur, chalk-white anhydrite
    "basalt": ["#121318", "#1a1b22", "#23242c", "#2d2e37", "#383943", "#45464f", "#54545c", "#65646a"],
    "crust": ["#2a120c", "#451c10", "#622a14", "#80401a", "#9c5a22", "#b8782e", "#d09a42", "#e2bd62", "#efdb92"],
    "chalk": ["#6f6a60", "#8f897c", "#ada798", "#c8c2b2", "#e0dbcc", "#f1eee4"],
    # the vent mouth and the glowing seams: deep red to yellow-white heat
    "heat": ["#3a0a06", "#6e1508", "#a8260a", "#d8440e", "#f2701c", "#ffa13a", "#ffd06a", "#fff1b8"],
    # tube worms: chitin tubes, blood-red plumes
    "tube": ["#4a4038", "#6c6156", "#8f8579", "#b0a89c", "#cfc8bc", "#e8e3d8", "#f8f5ee"],
    "plume": ["#3d0610", "#650c18", "#8e1622", "#b8232e", "#da3c40", "#f06a62", "#fba196"],
    # the nautilus shell: cream with rust flames, nacre in the mouth; brass; dark stand wood
    "shell": ["#6e5a44", "#8f7759", "#ae9673", "#c9b494", "#e0d0b2", "#f2e8d2", "#fdf8ec"],
    "flame": ["#3e170c", "#5e2412", "#7c341a", "#9c4824", "#b85e30"],
    "nacre": ["#4a3f52", "#76708a", "#a7a5bc", "#cfd0e0", "#ece9f4", "#fff9fb"],
    "brass": ["#3b2408", "#5e3c0e", "#855a18", "#ab7d26", "#cda040", "#e8c66a", "#faeaa6"],
    "wood": ["#1f130d", "#2c1c13", "#3b271a", "#4c3322", "#5f412b", "#745236", "#8b6543"],
    # prismarine: teal-green stone; its crystals pale aqua; the guardian scales teal; the lure light cyan-white
    "prismarine": ["#10221f", "#173430", "#1f4842", "#2a5e55", "#38766a", "#4b8f80", "#63a896", "#82c2ad"],
    "crystal": ["#2d6d6a", "#4b9993", "#73c2b8", "#a3e0d4", "#d2f5ec", "#f4fffb"],
    "scale": ["#0e2628", "#1d4746", "#2b6660", "#3c867a", "#55a591", "#78c3aa", "#b3e5cf"],
    "spike": ["#5a240c", "#8a3d18", "#c46a26", "#eea04a", "#f8cf86"],
    "lure": ["#0a2f3e", "#115c6c", "#1f94a0", "#33b2b9", "#56cdcd", "#86e3dd", "#b8f3ea", "#e6fff9"],
    "flesh": ["#17131b", "#231c27", "#2e2632", "#3b313f", "#4a3f4d", "#5c4e5a", "#6f606b"],
    # the round eye: pale sclera, amber iris, a pink rim of tissue
    "sclera": ["#3c3440", "#5a5260", "#7a7280", "#9e96a0", "#c1bbbf", "#dcd7d6", "#efebe8", "#fbf9f6"],
    "iris": ["#2a0c04", "#5a2108", "#a0420e", "#d8701c", "#f5ae3e", "#ffd88a", "#ffffff"],
    "tissue": ["#3a1820", "#5e2a36", "#8a4552", "#b56a76", "#d998a0"],
    # cannon: weathered bronze (a green patina in the shadows), black iron, dark oak
    "bronze": ["#1f1a10", "#33281a", "#4c3a20", "#6a5128", "#8a6a32", "#a8843e", "#c6a052", "#dfc07a", "#f2e0aa"],
    "patina": ["#16231e", "#22382f", "#335244", "#4a6e5c"],
    "iron": ["#121216", "#1b1b21", "#26262d", "#33333b", "#43434b", "#57575f", "#6e6e75", "#8a8a90"],
    "oak": ["#1c120b", "#2a1b10", "#3a2716", "#4d351e", "#614427", "#775532", "#8e683e"],
    # the turtle shell: green-olive scutes, pale seams, a cream plastron, dark skin in the openings
    "carapace": ["#141c0e", "#1f2b14", "#2c3b1b", "#3a4c22", "#4a5f2a", "#5c7333", "#71883d", "#88a04a"],
    "seam": ["#5f5428", "#8a7c3e", "#b3a252", "#d4c578", "#ece0a4"],
    "plastron": ["#5e5236", "#857552", "#ab9a6e", "#cbbb8c", "#e2d6aa", "#f2eacc"],
    "skin": ["#121a0e", "#1b2715", "#26361c", "#334824", "#425c2c", "#527135"],
}


# ======================================================================= block-model export
FACE_VERTS = {
    "down": [(0, 0, 1), (0, 0, 0), (1, 0, 0), (1, 0, 1)],
    "up": [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
    "north": [(1, 1, 0), (1, 0, 0), (0, 0, 0), (0, 1, 0)],
    "south": [(0, 1, 1), (0, 0, 1), (1, 0, 1), (1, 1, 1)],
    "west": [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)],
    "east": [(1, 1, 1), (1, 0, 1), (1, 0, 0), (1, 1, 0)],
}
ENTITY_FACE = {"north": "south", "south": "north", "up": "down", "down": "up", "west": "west", "east": "east"}
CULL = {"down": (1, 0.0), "up": (1, 16.0), "west": (0, 0.0), "east": (0, 16.0), "north": (2, 0.0), "south": (2, 16.0)}
A = np.diag([1.0, -1.0, -1.0])


def _rotation(Rb):
    if np.allclose(Rb, np.eye(3), atol=1e-6):
        return None
    for ax, (i, j) in (("x", (1, 2)), ("y", (2, 0)), ("z", (0, 1))):
        k = "xyz".index(ax)
        if abs(Rb[k, k] - 1) < 1e-6:
            ang = math.degrees(math.atan2(Rb[j, i], Rb[i, i]))
            if min(abs(ang - a) for a in (-45, -22.5, 22.5, 45)) > 1e-3:
                raise ValueError(f"block models only turn by 22.5 or 45 degrees, got {ang:.2f} about {ax}")
            return ax, round(ang, 3)
    raise ValueError("block-model elements turn about one axis only")


def _face_uv(verts_uv):
    for rot in (0, 90, 180, 270):
        c = [None] * 4
        for i, uv in enumerate(verts_uv):
            c[(i + rot // 90) % 4] = uv
        u1, v1 = c[0]
        if abs(c[1][0] - u1) < 1e-6 and abs(c[3][1] - v1) < 1e-6 and abs(c[2][0] - c[3][0]) < 1e-6 \
                and abs(c[2][1] - c[1][1]) < 1e-6:
            return [round(u1, 4), round(v1, 4), round(c[2][0], 4), round(c[2][1], 4)], rot
    raise ValueError("face UVs are not a rectangle")


def _q(v):
    return tuple(round(float(a), 4) for a in v)


def block_models(spec_dict, roots, tex_ref, texture_id, glow=False, ao=False):
    """-> (texture, glow texture or None, {root: model}, {root: glow model}).

    roots: {root part id: (x0, z0)}, the lowpix point that lands on the block's centre at its floor (so several
    variants can sit side by side in one spec). tex_ref: the model texture id, e.g. "winterworks:block/x"."""
    sys.path.insert(0, ROOT)
    from PIL import Image
    from lowpix import mc
    from lowpix.model import build_model

    model = build_model(spec_dict)
    conf = spec_dict.get("minecraft", {})
    m = mc.from_model(model, fps=12, glow_parts=set(conf.get("glow_parts", [])),
                      glow_ramps=set(conf.get("glow_ramps", [])))
    d = m.density
    tw, th = m.texture.size
    size = 1
    while size < max(tw, th):
        size *= 2

    def pad(im):
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        if im is not None:
            out.paste(im, (0, 0))
        return out

    tex = pad(m.texture)
    gtex = pad(m.glow) if glow and m.glow is not None else None
    mats = m.world_mats()
    root_of = {}
    for p in m.parts:
        root_of[p.name] = root_of[p.parent] if p.parent else p.name

    def elements_for(root, x0, z0, img):
        arr = np.asarray(img)
        out = []
        for p in m.parts:
            if p.cube is None or root_of[p.name] != root:
                continue
            lo, hi = p.cube
            W = mats[p.name]
            Rm, t = W[:3, :3], W[:3, 3]
            Rb = A @ Rm @ A.T
            origin = A @ t + np.array([8.0 - x0, 24.0, 8.0 - z0])
            corners = [np.array([x, y, z]) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
            # the element box is the cube in its own (unrotated) frame, placed round the rotation origin
            pts = np.array([origin + A @ c for c in corners])
            frm, to = pts.min(0), pts.max(0)
            el = {"from": [round(float(v), 4) for v in frm], "to": [round(float(v), 4) for v in to]}
            rot = _rotation(Rb)
            if rot:
                el["rotation"] = {"origin": [round(float(v), 4) for v in origin], "axis": rot[0], "angle": rot[1]}
            w, h, dd = hi - lo
            regions = mc.box_regions(w, h, dd)
            faces = {}
            for bface, verts in FACE_VERTS.items():
                eface = ENTITY_FACE[bface]
                rx, ry, rw, rh = regions[eface]
                if rw <= 1e-9 or rh <= 1e-9:
                    continue
                cs = {}
                for s_ in (0.0, 1.0):
                    for t_ in (0.0, 1.0):
                        P = mc.box_point(eface, np.array(s_), np.array(t_), lo, hi)
                        cs[_q(origin + A @ np.array(P, float))] = (s_, t_)
                vuv = []
                for vx, vy, vz in verts:
                    q = _q(((frm, to)[vx][0], (frm, to)[vy][1], (frm, to)[vz][2]))
                    if q not in cs:
                        break
                    s_, t_ = cs[q]
                    vuv.append(((p.uv[0] + rx + s_ * rw) * d / size * 16, (p.uv[1] + ry + t_ * rh) * d / size * 16))
                if len(vuv) < 4:
                    continue
                px0 = int(round(min(a for a, _ in vuv) * size / 16))
                py0 = int(round(min(b for _, b in vuv) * size / 16))
                px1 = int(round(max(a for a, _ in vuv) * size / 16))
                py1 = int(round(max(b for _, b in vuv) * size / 16))
                if not arr[py0:py1, px0:px1, 3].any():
                    continue
                uv, frot = _face_uv(vuv)
                f = {"uv": uv, "texture": "#tex"}
                if frot:
                    f["rotation"] = frot
                axis, lim = CULL[bface]
                if not rot and abs((frm if lim == 0.0 else to)[axis] - lim) < 1e-6:
                    f["cullface"] = bface
                faces[bface] = f
            flat = [i for i in range(3) if abs(to[i] - frm[i]) < 1e-6]
            for i in flat:
                pair = {0: ("west", "east"), 1: ("down", "up"), 2: ("north", "south")}[i]
                have = [f_ for f_ in pair if f_ in faces]
                if len(have) == 1:
                    src, dst = have[0], [f_ for f_ in pair if f_ != have[0]][0]
                    u1, v1, u2, v2 = faces[src]["uv"]
                    r = faces[src].get("rotation", 0)
                    at = {}
                    for vi, (vx, vy, vz) in enumerate(FACE_VERTS[src]):
                        k_ = (vi + r // 90) % 4
                        at[_q(((frm, to)[vx][0], (frm, to)[vy][1], (frm, to)[vz][2]))] = \
                            (u1 if k_ in (0, 1) else u2, v1 if k_ in (0, 3) else v2)
                    vuv = [at[_q(((frm, to)[vx][0], (frm, to)[vy][1], (frm, to)[vz][2]))]
                           for vx, vy, vz in FACE_VERTS[dst]]
                    uv, frot = _face_uv(vuv)
                    faces[dst] = {"uv": uv, "texture": "#tex"}
                    if frot:
                        faces[dst]["rotation"] = frot
                for f_ in pair:
                    if f_ in faces:
                        faces[f_].pop("cullface", None)
            if faces:
                el["faces"] = faces
                out.append(el)
        return out

    models, gmodels = {}, {}
    for root, (x0, z0) in roots.items():
        models[root] = {"parent": "minecraft:block/block", "ambientocclusion": ao,
                        "textures": {"particle": tex_ref, "tex": tex_ref}, "elements": elements_for(root, x0, z0, tex)}
        if gtex is not None:
            els = elements_for(root, x0, z0, gtex)
            if els:
                gmodels[root] = {"parent": "minecraft:block/block", "ambientocclusion": False,
                                 "textures": {"particle": tex_ref, "tex": tex_ref + "_glow"}, "elements": els}
    return tex, gtex, models, gmodels


def write_json(path, obj, compact=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        if compact:
            json.dump(obj, fh, indent=1)
        else:
            json.dump(obj, fh, indent=2)
        fh.write("\n")


def mod_args(argv, default_spec):
    """Parse `[spec.json] [--mod DIR]`: -> (spec path, mod root or None)."""
    args = list(argv)
    mod = None
    if "--mod" in args:
        i = args.index("--mod")
        mod = args[i + 1]
        del args[i:i + 2]
    return (args[0] if args else default_spec), mod


def res_dir(mod):
    return os.path.join(mod, "src", "main", "resources", "assets", "winterworks")


def builtin_item(particle, gui_scale=0.625, gui_rot=(30, 225, 0), gui_y=0.0):
    """An item drawn by a BuiltinItemRenderer in the item's 0..1 cube (the block-entity transform), with vanilla
    block-like display transforms."""
    s = lambda k: [k, k, k]  # noqa: E731
    return {"parent": "minecraft:builtin/entity", "gui_light": "side", "textures": {"particle": particle},
            "display": {
                "gui": {"rotation": list(gui_rot), "translation": [0, gui_y, 0], "scale": s(gui_scale)},
                "ground": {"rotation": [0, 0, 0], "translation": [0, 3, 0], "scale": s(0.25)},
                "fixed": {"rotation": [0, 0, 0], "translation": [0, 0, 0], "scale": s(0.5)},
                "head": {"rotation": [0, 180, 0], "translation": [0, 0, 0], "scale": s(1.0)},
                "thirdperson_righthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": s(0.375)},
                "thirdperson_lefthand": {"rotation": [75, 45, 0], "translation": [0, 2.5, 0], "scale": s(0.375)},
                "firstperson_righthand": {"rotation": [0, 45, 0], "translation": [0, 0, 0], "scale": s(0.4)},
                "firstperson_lefthand": {"rotation": [0, 225, 0], "translation": [0, 0, 0], "scale": s(0.4)},
            }}


def write_be_block(mod, name, particle, **item_kw):
    """A block drawn by its block-entity renderer: a particle-only block model, a one-variant blockstate (give the
    block a facing and turn it in the renderer) and a builtin item model with display transforms."""
    res = res_dir(mod)
    write_json(os.path.join(res, "models", "block", name + ".json"), {"textures": {"particle": particle}})
    write_json(os.path.join(res, "blockstates", name + ".json"),
               {"variants": {"": {"model": f"winterworks:block/{name}"}}})
    write_json(os.path.join(res, "models", "item", name + ".json"), builtin_item(particle, **item_kw))
