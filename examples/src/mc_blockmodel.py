"""Render Minecraft (1.21.1) block and item models from their JSON with vanilla's rules, to check them without a game.

It reads blockstates and models from resource folders (assets/<namespace>/...), follows parents and texture
variables, and bakes every face the way FaceBakery does: the face's corners in FaceInfo order, uvs read by
BlockFaceUV (uv rectangle + rotation), element rotation (axis, angle, origin, rescale), then the blockstate's x/y
turn (rotateYXZ(-y, -x) about the block centre). Faces are one-sided (culled from behind), shaded by the direction
nearest their normal (up 1.0, north/south 0.8, east/west 0.6, down 0.5), tinted when they carry a tintindex, cut out
below alpha 0.1, and textured nearest-neighbour (an animated texture shows its first frame).

    from mc_blockmodel import Resources, Scene
    res = Resources([".../src/main/resources"])
    s = Scene(res)
    s.block("minecraft:rail", {"shape": "south_east"}, (0, 0, 0))
    s.render(view="iso").save("rail.png")

`Resources.lint()` lists what vanilla would reject or quietly get wrong (bad angles, from/to outside -16..32, uvs
outside 0..16, missing textures or models, blockstate keys that name unknown property values).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

FACE_VERTS = {
    "down": [(0, 0, 1), (0, 0, 0), (1, 0, 0), (1, 0, 1)],
    "up": [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
    "north": [(1, 1, 0), (1, 0, 0), (0, 0, 0), (0, 1, 0)],
    "south": [(0, 1, 1), (0, 0, 1), (1, 0, 1), (1, 1, 1)],
    "west": [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)],
    "east": [(1, 1, 1), (1, 0, 1), (1, 0, 0), (1, 1, 0)],
}
SHADE = {"up": 1.0, "down": 0.5, "north": 0.8, "south": 0.8, "east": 0.6, "west": 0.6}
DIRS = {"up": (0, 1, 0), "down": (0, -1, 0), "north": (0, 0, -1), "south": (0, 0, 1), "east": (1, 0, 0),
        "west": (-1, 0, 0)}
RESCALE_22_5 = 1.0 / math.cos(math.radians(22.5)) - 1.0
RESCALE_45 = 1.0 / math.cos(math.radians(45)) - 1.0


def _rid(s, kind=""):
    ns, _, path = s.partition(":") if ":" in s else ("minecraft", "", s)
    return ns, path


def rot_axis(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    if axis == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == "y":
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class Resources:
    def __init__(self, roots):
        self.roots = [Path(r) for r in roots]
        self._tex = {}
        self.problems = []

    def find(self, ns, sub):
        for r in self.roots:
            p = r / "assets" / ns / sub
            if p.exists():
                return p
        return None

    def json(self, ns, sub):
        p = self.find(ns, sub)
        if p is None:
            raise FileNotFoundError(f"{ns}:{sub}")
        return json.loads(p.read_text())

    def model(self, ref):
        """A model with its parents merged: {'elements', 'textures', 'display', 'ambientocclusion', 'chain'}."""
        chain = []
        ref_ = ref
        while ref_:
            ns, path = _rid(ref_)
            if (ns, path) in (("minecraft", "block/block"), ("minecraft", "item/generated"),
                              ("minecraft", "builtin/entity"), ("minecraft", "item/handheld")) \
                    and self.find(ns, f"models/{path}.json") is None:
                chain.append({"_builtin": path})
                break
            body = self.json(ns, f"models/{path}.json")
            chain.append(body)
            ref_ = body.get("parent")
        textures, display = {}, {}
        elements, ao = None, None
        for body in reversed(chain):
            textures.update(body.get("textures", {}))
            for k, v in body.get("display", {}).items():
                display[k] = v
            if "elements" in body:
                elements = body["elements"]
            if "ambientocclusion" in body:
                ao = body["ambientocclusion"]
        return {"elements": elements or [], "textures": textures, "display": display, "ao": ao, "chain": chain}

    def resolve(self, textures, ref, ctx=""):
        seen = 0
        while ref.startswith("#"):
            key = ref[1:]
            if key not in textures:
                self.problems.append(f"{ctx}: texture variable {ref} is not defined")
                return None
            ref = textures[key]
            seen += 1
            if seen > 10:
                self.problems.append(f"{ctx}: texture variable loop at {ref}")
                return None
        return ref

    def texture(self, ref):
        if ref not in self._tex:
            ns, path = _rid(ref)
            p = self.find(ns, f"textures/{path}.png")
            if p is None:
                self.problems.append(f"missing texture {ref}")
                im = np.zeros((16, 16, 4)) + np.array([255, 0, 255, 255])
            else:
                img = Image.open(p).convert("RGBA")
                w = img.width
                if img.height > w and (p.parent / (p.name + ".mcmeta")).exists():
                    img = img.crop((0, 0, w, w))          # an animation's first frame
                im = np.asarray(img, dtype=float)
            self._tex[ref] = im
        return self._tex[ref]

    def variants(self, block, props):
        """[(model, x, y, uvlock)] the blockstate draws for these properties (variants or multipart)."""
        ns, path = _rid(block)
        bs = self.json(ns, f"blockstates/{path}.json")
        out = []
        if "variants" in bs:
            hit = None
            for key, v in bs["variants"].items():
                conds = dict(kv.split("=") for kv in key.split(",")) if key else {}
                if all(props.get(k) == val for k, val in conds.items()):
                    hit = v
                    break
            if hit is None:
                raise KeyError(f"{block}: no variant for {props}")
            v = hit[0] if isinstance(hit, list) else hit
            out.append((v["model"], v.get("x", 0), v.get("y", 0), v.get("uvlock", False)))
        else:
            for part in bs["multipart"]:
                w = part.get("when")
                if w is None or self._when(w, props):
                    a = part["apply"]
                    a = a[0] if isinstance(a, list) else a
                    out.append((a["model"], a.get("x", 0), a.get("y", 0), a.get("uvlock", False)))
        return out

    def _when(self, w, props):
        if "OR" in w:
            return any(self._when(x, props) for x in w["OR"])
        if "AND" in w:
            return all(self._when(x, props) for x in w["AND"])
        return all(props.get(k) in str(v).split("|") for k, v in w.items())

    # ------------------------------------------------------------------ baking
    def bake(self, ref, x=0, y=0, tint=None, ctx=None):
        """[(4 corners in block px, 4 uvs in texels, texture array, rgb multiplier, face name)]"""
        m = self.model(ref)
        quads = []
        Rb = rot_axis("y", -y) @ rot_axis("x", -x)
        for i, e in enumerate(m["elements"]):
            lo, hi = np.array(e["from"], float), np.array(e["to"], float)
            r = e.get("rotation")
            for fname, f in e.get("faces", {}).items():
                tex_ref = self.resolve(m["textures"], f["texture"], f"{ref} element {i} {fname}")
                if tex_ref is None:
                    continue
                tex = self.texture(tex_ref)
                uv = f.get("uv") or default_uv(fname, lo, hi)
                rot = f.get("rotation", 0)
                corners, uvs = [], []
                for k, v in enumerate(FACE_VERTS[fname]):
                    p = np.array([(lo, hi)[v[a]][a] for a in range(3)])
                    if r:
                        p = rotate_element(p, r)
                    p = Rb @ (p - 8) + 8
                    j = (k + rot // 90) % 4
                    u = uv[0] if j in (0, 1) else uv[2]
                    vv = uv[1] if j in (0, 3) else uv[3]
                    corners.append(p)
                    uvs.append((u, vv))
                col = np.ones(3)
                if "tintindex" in f and tint is not None:
                    col = np.array(tint[:3], float) / 255.0
                quads.append((np.array(corners), uvs, tex, col, fname))
        return quads

    # ------------------------------------------------------------------ checks
    def lint_model(self, ref):
        out = []
        m = self.model(ref)
        for i, e in enumerate(m["elements"]):
            for k in ("from", "to"):
                if any(v < -16 or v > 32 for v in e[k]):
                    out.append(f"{ref} element {i}: {k} {e[k]} outside -16..32")
            r = e.get("rotation")
            if r:
                if r.get("axis") not in ("x", "y", "z"):
                    out.append(f"{ref} element {i}: rotation axis {r.get('axis')}")
                if r.get("angle") not in (-45, -22.5, 0, 22.5, 45):
                    out.append(f"{ref} element {i}: rotation angle {r.get('angle')} (vanilla: -45/-22.5/0/22.5/45)")
            for fname, f in e.get("faces", {}).items():
                if fname not in FACE_VERTS:
                    out.append(f"{ref} element {i}: face {fname}")
                    continue
                if "uv" in f and any(v < 0 or v > 16 for v in f["uv"]):
                    out.append(f"{ref} element {i} {fname}: uv {f['uv']} outside 0..16")
                if f.get("rotation", 0) not in (0, 90, 180, 270):
                    out.append(f"{ref} element {i} {fname}: uv rotation {f.get('rotation')}")
                t = self.resolve(m["textures"], f["texture"], f"{ref} element {i} {fname}")
                if t is not None and self.find(*_rid(t)[:1], f"textures/{_rid(t)[1]}.png") is None:
                    out.append(f"{ref}: missing texture {t}")
        if "particle" not in m["textures"] and m["elements"]:
            out.append(f"{ref}: no particle texture")
        return out


def default_uv(face, lo, hi):
    """BlockElement's uv for a face that names none (projected from the element's bounds)."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    return {"down": [x0, 16 - z1, x1, 16 - z0], "up": [x0, z0, x1, z1], "north": [16 - x1, 16 - y1, 16 - x0, 16 - y0],
            "south": [x0, 16 - y1, x1, 16 - y0], "west": [z0, 16 - y1, z1, 16 - y0],
            "east": [16 - z1, 16 - y1, 16 - z0, 16 - y0]}[face]


def rotate_element(p, r):
    axis, ang = r["axis"], r["angle"]
    o = np.array(r["origin"], float)
    R = rot_axis(axis, ang)
    scale = np.ones(3)
    if r.get("rescale"):
        k = RESCALE_22_5 if abs(ang) == 22.5 else RESCALE_45
        scale = np.array({"x": (1, 1 + k, 1 + k), "y": (1 + k, 1, 1 + k), "z": (1 + k, 1 + k, 1)}[axis], float)
    return (R @ (p - o)) * scale + o


def display_matrix(t):
    """ItemTransform: translate, rotationXYZ, scale (translation in px)."""
    rx, ry, rz = (math.radians(a) for a in t.get("rotation", [0, 0, 0]))
    R = rot_axis("x", math.degrees(rx)) @ rot_axis("y", math.degrees(ry)) @ rot_axis("z", math.degrees(rz))
    S = np.diag(t.get("scale", [1, 1, 1]))
    T = np.array(t.get("translation", [0, 0, 0]), float)
    return R @ S, T


class Scene:
    def __init__(self, res):
        self.res = res
        self.quads = []

    def block(self, block, props, pos, tint=None):
        for ref, x, y, _ in self.res.variants(block, props):
            for c, uvs, tex, col, fn in self.res.bake(ref, x, y, tint):
                self.quads.append((c + np.array(pos, float) * 16, uvs, tex, col, fn))
        return self

    def model(self, ref, pos=(0, 0, 0), x=0, y=0, tint=None):
        for c, uvs, tex, col, fn in self.res.bake(ref, x, y, tint):
            self.quads.append((c + np.array(pos, float) * 16, uvs, tex, col, fn))
        return self

    def cube(self, pos, color):
        """A plain opaque block (the ground under a rail)."""
        tex = np.zeros((16, 16, 4)) + np.array(list(color) + [255], float)
        rng = np.random.default_rng(int(abs(pos[0] * 7 + pos[1] * 13 + pos[2] * 31)))
        tex[:, :, :3] *= rng.uniform(0.93, 1.05, (16, 16, 1))
        lo, hi = np.zeros(3), np.ones(3) * 16
        for fname, verts in FACE_VERTS.items():
            corners = [np.array([(lo, hi)[v[a]][a] for a in range(3)]) + np.array(pos, float) * 16 for v in verts]
            uvs = [(0, 0), (0, 16), (16, 16), (16, 0)]
            self.quads.append((np.array(corners), uvs, tex, np.ones(3), fname))
        return self

    def render(self, view="iso", size=(480, 360), scale=None, background=(150, 185, 215), centre=None,
               title=None, item=None):
        """view: 'top' (straight down, north up), 'iso' (3/4 from the south-east, 30 degrees down), 'iso_sw',
        or (yaw, pitch) in degrees; item: a display transform dict (then the camera looks down -z like the GUI).
        centre: the world point (block px) in the middle of the picture (default: the middle of everything)."""
        W, H = size
        if not self.quads:
            return Image.new("RGB", size, background)
        if item is not None:
            RS, T = display_matrix(item)
            V = np.eye(3)
            pts = [(RS @ (q[0] - 8).T).T + T for q in self.quads]
        else:
            yaw, pitch = {"top": (0, 90), "iso": (-45, 30), "iso_sw": (45, 30), "iso_ne": (135, 30),
                          "iso_nw": (225, 30), "side": (0, 0)}.get(view, view) if isinstance(view, str) else view
            # camera: turn the world by yaw about y, then tip it by pitch about x; look along -z
            V = rot_axis("x", pitch) @ rot_axis("y", yaw)
            pts = [(V @ q[0].T).T for q in self.quads]
        allp = np.concatenate(pts)
        lo, hi = allp.min(0), allp.max(0)
        c = (lo + hi) / 2 if centre is None else (V @ np.asarray(centre, float) if item is None
                                                    else np.asarray(centre, float))
        if scale is None:
            scale = 0.9 * min(W / max(1e-6, hi[0] - lo[0]), H / max(1e-6, hi[1] - lo[1]))
        img = np.zeros((H, W, 3)) + np.array(background, float)
        zb = np.full((H, W), -1e9)
        for (corners, uvs, tex, col, fname), P in zip(self.quads, pts):
            sx = W / 2 + (P[:, 0] - c[0]) * scale
            sy = H / 2 - (P[:, 1] - c[1]) * scale
            sz = P[:, 2]
            n = np.cross(P[1] - P[0], P[2] - P[0])
            if np.linalg.norm(n) < 1e-9:
                n = np.cross(P[2] - P[0], P[3] - P[0])
            if n[2] <= 1e-9:
                continue          # back face (the camera looks down -z)
            wn = np.cross(corners[1] - corners[0], corners[2] - corners[0])
            if np.linalg.norm(wn) < 1e-9:
                wn = np.cross(corners[2] - corners[0], corners[3] - corners[0])
            d = max(DIRS, key=lambda k: np.dot(DIRS[k], wn / (np.linalg.norm(wn) + 1e-12)))
            shade = SHADE[d]
            _raster(img, zb, sx, sy, sz, uvs, tex, col * shade)
        im = Image.fromarray(img.clip(0, 255).astype(np.uint8))
        if title:
            ImageDraw.Draw(im).text((5, 4), title, fill=(15, 15, 25))
        return im


def _raster(img, zb, sx, sy, sz, uvs, tex, mul):
    H, W = zb.shape
    th, tw = tex.shape[:2]
    for tri in ((0, 1, 2), (0, 2, 3)):
        xs, ys = sx[list(tri)], sy[list(tri)]
        x0, x1 = int(max(0, math.floor(xs.min()))), int(min(W - 1, math.ceil(xs.max())))
        y0, y1 = int(max(0, math.floor(ys.min()))), int(min(H - 1, math.ceil(ys.max())))
        if x1 < x0 or y1 < y0:
            continue
        (ax, bx, cx), (ay, by, cy) = xs, ys
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1] + 0.5
        w1 = ((by - cy) * (xx - cx) + (cx - bx) * (yy - cy)) / den
        w2 = ((cy - ay) * (xx - cx) + (ax - cx) * (yy - cy)) / den
        w3 = 1 - w1 - w2
        m = (w1 >= -1e-6) & (w2 >= -1e-6) & (w3 >= -1e-6)
        if not m.any():
            continue
        za, zbv, zc = sz[list(tri)]
        z = w1 * za + w2 * zbv + w3 * zc
        (ua, va), (ub, vb), (uc, vc) = (uvs[i] for i in tri)
        u = w1 * ua + w2 * ub + w3 * uc
        v = w1 * va + w2 * vb + w3 * vc
        tu = np.clip((u / 16 * tw).astype(int), 0, tw - 1)
        tv = np.clip((v / 16 * th).astype(int), 0, th - 1)
        texel = tex[tv, tu]
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        upd = m & (texel[..., 3] >= 25.5) & (z > sub + 1e-6)
        sub[upd] = z[upd]
        img[y0:y1 + 1, x0:x1 + 1][upd] = texel[..., :3][upd] * mul


def sheet(images, cols, pad=4, background=(40, 44, 52)):
    w = max(i.width for i in images)
    h = max(i.height for i in images)
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad) + pad), background)
    for k, im in enumerate(images):
        out.paste(im, (pad + (k % cols) * (w + pad), pad + (k // cols) * (h + pad)))
    return out
