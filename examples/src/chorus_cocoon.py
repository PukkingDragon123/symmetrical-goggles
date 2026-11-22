"""Builds examples/chorus_cocoon.json: the Chorus Cocoon's four ages (Winterworks "Living End"; a block), and writes
them into the mod as block models.

    python examples/src/chorus_cocoon.py examples/chorus_cocoon.json                       # the spec only
    python examples/src/chorus_cocoon.py examples/chorus_cocoon.json --mod mods/winterworks # + block models, texture

A pod that hangs from the block above on a short chorus stem, under a knot of stem and pale chorus-flower petals: a
lumpy, chorus-fruit-like cluster of purple bulbs speckled with pale nubs that swells from a small bud (age 0) to a
fat pod (age 2); the mature pod (age 3) is split by cracks glowing crying-obsidian violet, a wing tip of the Enderfly
inside pressing out through one of them.

Units are Minecraft pixels; each age is a root `age0`..`age3`, laid side by side along x (at x = -27, -9, 9, 27) so
the preview shows the growth; each fills the block x, z in -8..8, y in 0..16 round its own root, hanging from y = 16.
Density 1 (16 texels per block, like vanilla blocks). Only boxes and cards, axis-aligned or
turned 45 degrees about Y on the age root, so every part is a legal block-model element.

`python -m lowpix mc export` writes entity models only (no block-model JSON), so `--mod` does the block export here:
it packs the texture with lowpix's Minecraft box-UV packer (lowpix.mc.from_model), pads it to a square power of two,
saves it as `textures/block/chorus_cocoon.png` and writes `models/block/chorus_cocoon_age0..3.json`, one element per
box or card, every face UV-mapped into that texture. The models use cards (petals, the wing tip), so draw the block in
the cutout layer.
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from end_vanilla_kit import LIGHT, ROOT, Rig, dump, ramps, skin  # noqa: E402

R = Rig(density=1, bone_style="chorus")
part, bone, card = R.part, R.bone, R.card

AGE_X = [-27.0, -9.0, 9.0, 27.0]
WING_TIP = [".mM", "mME", "Mm."]
# the pod's profile, top to bottom: (share of the height, share of the width); each layer is two crossed boxes, so
# the cross-section is a stepped octagon and the outline an egg
LAYERS = [(0.2, 0.68), (0.56, 1.0), (0.24, 0.7)]


def h2(v, lo=1):
    """Round to whole pixels."""
    return max(lo, int(round(v)))


def calyx(w, seed):
    """A row of pointed chorus-flower petals drooping at both ends (a card seen from the side)."""
    n = max(5, int(w))
    rows = []
    for y in range(3):
        r = ""
        for x in range(n):
            u = abs(x - (n - 1) / 2) / ((n - 1) / 2)
            tooth = (x + seed) % 3 != 1
            if y == 0:
                r += "P" if u < 0.75 and tooth else "."
            elif y == 1:
                r += "P" if u < 0.95 else "."
            else:
                r += "p" if (u > 0.55 or u < 0.15) else "."
        rows.append(r)
    return rows


def age(k, stem, pod, lumps, cracked=False):
    """stem: (width, length); pod: (W, H) of the egg-shaped body; lumps: [(x, y, z, size, turned)] bulbs round it."""
    x0 = AGE_X[k]
    a = bone(f"age{k}", None, at=(x0, 0, 0))
    sw, sl = stem
    part(f"knot{k}", a["id"], [sw + 1, 1, sw + 1], "stem_knot", centre=(x0, 15.5, 0), rot=(0, 45, 0))
    part(f"stem{k}", a["id"], [sw, sl, sw], "stem", centre=(x0, 15.0 - sl / 2, 0))
    W, H = pod
    top = 15.0 - sl + 0.5
    y = top
    style = "pod_cracked" if cracked else "pod"
    for j, (fh, fw) in enumerate(LAYERS):
        lh, lw = h2(H * fh), h2(W * fw, 1.0)
        cy = y - lh / 2
        part(f"pod{k}_{j}", a["id"], [lw, lh, h2(lw * 0.75, 1.0)], style, centre=(x0, cy, 0))
        part(f"pod{k}_{j}x", a["id"], [h2(lw * 0.75, 1.0), lh - 1 if lh > 2 else lh, lw], style, centre=(x0, cy, 0))
        y -= lh
    mid = top - H * 0.45
    for j, (lx, ly, lz, sz, turned) in enumerate(lumps):
        part(f"lump{k}_{j}", a["id"], [sz, sz, sz], "lump_cracked" if cracked and j % 2 == 0 else "lump",
             centre=(x0 + lx, mid + ly, lz), rot=(0, 45 if turned else 0, 0))
    part(f"tip{k}", a["id"], [h2(W * 0.22, 1.0), 1, h2(W * 0.22, 1.0)], "pod_tip", centre=(x0, y - 0.5, 0),
         rot=(0, 45, 0))
    cw = h2(W * 0.95, 3.0)
    for j, yaw in enumerate((45, -45)):       # a calyx of pale petals over the pod's shoulders
        card(f"petal{k}_{j}", a["id"], calyx(cw, j + k), "petal", plane="xy", at=(x0, top + 0.25, 0), rot=(0, yaw, 0))
    return a


# age 0: a bud; age 1: a small pod; age 2: a fat pod; age 3: a mature, cracked pod with a wing pressing out
age(0, (1, 3), (4, 5), [(2.0, 0.0, 0.5, 2, True)])
age(1, (2, 3), (6, 8), [(3.0, 0.5, 1.0, 3, True), (-2.5, -1.0, 1.0, 2, False)])
age(2, (2, 2), (8, 10), [(4.0, 1.0, 1.5, 3, True), (-4.0, -1.0, 1.0, 3, False),
                         (0.5, -2.0, -3.5, 3, True)])
age(3, (2, 2), (11, 12), [(5.0, 1.5, 2.0, 4, True), (-5.0, -1.0, 1.5, 4, False),
                          (1.0, -2.5, -5.0, 4, True), (-2.0, 2.5, -4.5, 3, False)], cracked=True)
card("wing3", "age3", WING_TIP, "wing_tip", plane="xy", at=(AGE_X[3] + 1.0, 7.0, 5.6), offset=(0, 0, 0))

# ======================================================================= palette and paint
RAMPS = ramps("crying", "chorus", "obsidian")
RAMPS["stem"] = ["#1d0f1c", "#2f1a2e", "#462843", "#5e385a", "#784b72", "#94628c", "#ad7ea5"]
RAMPS["petal"] = ["#6b4f78", "#977aa3", "#bfa6c8", "#e0d0e6", "#f6eefa"]
# pale nubs dotted over the pod, like the chorus fruit's
NUBS = {"id": "nubs", "op": "spots", "count": 3, "radius": [0.35, 0.5], "ramp": "chorus", "tone": 8.0,
        "space": "world", "min_gap": 2.0}
POD = dict(grain=0.9, grain_scale=0.7, lip=1.4, shade=-1.2, dark_low=0)
SEAMS = {"id": "seams", "op": "cracks", "scale": 3.0, "width": 0.07, "threshold": 0.35, "ramp": "crying",
         "tone": 4.6, "seed": 3, "space": "world"}
styles = {
    "chorus": {"ramp": "chorus", "tone": 4.0},
    "pod": skin("chorus", 4.2, layers=[NUBS, {"id": "under", "op": "gradient", "axis": [0, 1, 0], "amount": 0.1,
                                              "space": "world"}], **POD),
    "lump": skin("chorus", 4.6, layers=[NUBS], **POD),
    "pod_cracked": skin("chorus", 4.4, layers=[NUBS, SEAMS], **POD),
    "lump_cracked": skin("chorus", 4.8, layers=[NUBS, dict(SEAMS, scale=2.0, seed=5)], **POD),
    "pod_tip": skin("chorus", 4.0, grain=0.5, lip=1.2, shade=-1.2, clusters=False, dark_low=0),
    "stem": skin("stem", 3.4, grain=0.6, lip=1.4, shade=-1.2, clusters=False, dark_low=0, layers=[
        {"id": "rings", "op": "stripes", "axis": "y", "period": 2.0, "width": 0.5, "shift": -1.0}]),
    "stem_knot": skin("stem", 4.0, grain=0.5, lip=1.4, shade=-1.2, clusters=False, dark_low=0),
    "petal": {"ramp": "petal", "tone": 3.0, "light": 0.3, "brush": {"off": True},
              "art_key": {"p": "petal:2", "P": "petal:3"}},
    "wing_tip": {"ramp": "obsidian", "tone": 3.0, "light": 0.2, "brush": {"off": True},
                 "art_key": {"m": "obsidian:4", "M": "obsidian:6", "E": "crying:5"}},
}

spec = {
    "name": "Chorus Cocoon",
    "description": "The Winterworks Chorus Cocoon in its four ages: a lumpy purple chorus-fruit pod hanging on a "
                   "chorus stem, growing from a bud to a fat pod; the mature one is cracked with glowing violet seams. "
                   "Minecraft pixel units, density 1 (vanilla block resolution); exported as block models.",
    "author": "lowpix example", "license": "CC0-1.0",
    "density": 1,
    "grounded": False,
    "budget": {"tris": 900, "colors": 48},
    "light": dict(LIGHT, gradient=0.3, ao=0.0),
    "minecraft": {"fps": 12, "glow_ramps": ["crying"]},
    "render": {"background": "#2a2735", "hero": [-24, 12], "shadow": 0.3},
    "palette": {"ramps": RAMPS},
    "styles": styles,
    "parts": R.P,
    "animations": {"idle": {"length": 1.0, "loop": True, "tracks": []}},
}


# ======================================================================= block-model export
# Vanilla FaceInfo: the four corners of each face, in the order the face's UVs are read (see BlockFaceUV)
FACE_VERTS = {
    "down": [(0, 0, 1), (0, 0, 0), (1, 0, 0), (1, 0, 1)],
    "up": [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
    "north": [(1, 1, 0), (1, 0, 0), (0, 0, 0), (0, 1, 0)],
    "south": [(0, 1, 1), (0, 0, 1), (1, 0, 1), (1, 1, 1)],
    "west": [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)],
    "east": [(1, 1, 1), (1, 0, 1), (1, 0, 0), (1, 1, 0)],
}
# block face -> the entity box-UV region that shows on it (block space is entity space with y and z flipped)
ENTITY_FACE = {"north": "south", "south": "north", "up": "down", "down": "up", "west": "west", "east": "east"}
A = np.diag([1.0, -1.0, -1.0])


def _rotation(Rb):
    """A block-space rotation matrix -> (axis, degrees), or None for none. Block models allow one axis, +-22.5/45."""
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
    """Per-vertex UVs (FaceInfo order) -> (uv [u1, v1, u2, v2], rotation) as BlockFaceUV reads them."""
    for rot in (0, 90, 180, 270):
        c = [None] * 4
        for i, uv in enumerate(verts_uv):
            c[(i + rot // 90) % 4] = uv
        u1, v1 = c[0]
        if abs(c[1][0] - u1) < 1e-6 and abs(c[3][1] - v1) < 1e-6 and abs(c[2][0] - c[3][0]) < 1e-6 \
                and abs(c[2][1] - c[1][1]) < 1e-6:
            return [round(u1, 4), round(v1, 4), round(c[2][0], 4), round(c[2][1], 4)], rot
    raise ValueError("face UVs are not a rectangle")


def block_models(spec_dict):
    """-> (texture image, {age: model dict}) for the four ages."""
    sys.path.insert(0, ROOT)
    from PIL import Image
    from lowpix import mc
    from lowpix.model import build_model

    model = build_model(spec_dict)
    m = mc.from_model(model, fps=12)
    d = m.density
    tw, th = m.texture.size
    size = 1
    while size < max(tw, th):
        size *= 2
    tex = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tex.paste(m.texture, (0, 0))
    mats = m.world_mats()
    root_of = {}
    for p in m.parts:
        root_of[p.name] = root_of[p.parent] if p.parent else p.name
    models = {}
    for k in range(4):
        root = f"age{k}"
        x0 = AGE_X[k]
        elements = []
        for p in m.parts:
            if p.cube is None or root_of[p.name] != root:
                continue
            lo, hi = p.cube
            W = mats[p.name]
            Rm, t = W[:3, :3], W[:3, 3]
            Rb = A @ Rm @ A.T
            origin = A @ t + np.array([8.0 - x0, 24.0, 8.0])
            corners = [np.array([x, y, z]) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
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
                # which corner of the entity region lands on each block-face vertex
                cs = {}
                for s_ in (0.0, 1.0):
                    for t_ in (0.0, 1.0):
                        P = mc.box_point(eface, np.array(s_), np.array(t_), lo, hi)
                        q = origin + A @ np.array(P, float)
                        cs[(round(float(q[0]), 4), round(float(q[1]), 4), round(float(q[2]), 4))] = (s_, t_)
                vuv = []
                for vx, vy, vz in verts:
                    q = (round(float((frm, to)[vx][0]), 4), round(float((frm, to)[vy][1]), 4),
                         round(float((frm, to)[vz][2]), 4))
                    if q not in cs:
                        break
                    s_, t_ = cs[q]
                    u = (p.uv[0] + rx + s_ * rw) * d / size * 16
                    v = (p.uv[1] + ry + t_ * rh) * d / size * 16
                    vuv.append((u, v))
                if len(vuv) < 4:
                    continue
                # skip faces the box-UV layout leaves empty (hidden faces) or fully transparent
                px0 = int(round(min(a for a, _ in vuv) * size / 16))
                py0 = int(round(min(b for _, b in vuv) * size / 16))
                px1 = int(round(max(a for a, _ in vuv) * size / 16))
                py1 = int(round(max(b for _, b in vuv) * size / 16))
                if not np.asarray(tex)[py0:py1, px0:px1, 3].any():
                    continue
                uv, frot = _face_uv(vuv)
                f = {"uv": uv, "texture": "#cocoon"}
                if frot:
                    f["rotation"] = frot
                if bface == "up" and abs(to[1] - 16.0) < 1e-6:
                    f["cullface"] = "up"
                faces[bface] = f
            # cards are zero-thickness elements with art on one face only; block faces are culled from behind, so
            # give each card a back face that shows the same art (texel for texel, seen through)
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
                        q = (round(float((frm, to)[vx][0]), 4), round(float((frm, to)[vy][1]), 4),
                             round(float((frm, to)[vz][2]), 4))
                        at[q] = (u1 if k_ in (0, 1) else u2, v1 if k_ in (0, 3) else v2)
                    vuv = [at[(round(float((frm, to)[vx][0]), 4), round(float((frm, to)[vy][1]), 4),
                               round(float((frm, to)[vz][2]), 4))] for vx, vy, vz in FACE_VERTS[dst]]
                    uv, frot = _face_uv(vuv)
                    faces[dst] = {"uv": uv, "texture": "#cocoon"}
                    if frot:
                        faces[dst]["rotation"] = frot
            if faces:
                el["faces"] = faces
                elements.append(el)
        models[k] = {"parent": "minecraft:block/block", "ambientocclusion": False,
                     "textures": {"particle": "winterworks:block/chorus_cocoon",
                                  "cocoon": "winterworks:block/chorus_cocoon"},
                     "elements": elements}
    return tex, models


if __name__ == "__main__":
    args = sys.argv[1:]
    mod = None
    if "--mod" in args:
        i = args.index("--mod")
        mod = args[i + 1]
        del args[i:i + 2]
    out = args[0] if args else os.path.join(ROOT, "examples", "chorus_cocoon.json")
    dump(spec, out)
    if mod:
        tex, models = block_models(spec)
        res = os.path.join(mod, "src", "main", "resources", "assets", "winterworks")
        os.makedirs(os.path.join(res, "textures", "block"), exist_ok=True)
        os.makedirs(os.path.join(res, "models", "block"), exist_ok=True)
        tex.save(os.path.join(res, "textures", "block", "chorus_cocoon.png"))
        for k, mdl in models.items():
            with open(os.path.join(res, "models", "block", f"chorus_cocoon_age{k}.json"), "w") as fh:
                json.dump(mdl, fh, indent=1)
        print("texture", tex.size, "models", {k: len(v["elements"]) for k, v in models.items()})
