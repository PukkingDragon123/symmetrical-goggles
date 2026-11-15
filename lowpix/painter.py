"""Procedural pixel-art painter.

Every face is painted texel-by-texel. Each texel knows its 3D position (part
local, pattern space and world) so patterns wrap continuously around edges,
and its face's world normal so lighting can be *painted in* (the model is
rendered unlit, like hand-painted low-poly art).

Painting happens in tone space: each texel holds (ramp, tone) where tone is a
float index into the ramp. The pipeline is

  base -> layers (fills, bands, stripes, spots, patches, gradients, speckle)
       -> painted light (key light, local gradient, ground occlusion)
       -> rims (lit-edge highlight, shadow-edge darkening)
       -> post layers (gloss glints, post speckle)
       -> ordered-dither quantise to the palette
       -> outlines -> stamps (hand-placed pixel art) -> alpha cutouts
"""
from __future__ import annotations

import numpy as np

from .noise import BAYER4, fbm, hash3, seed_of
from .palette import Palette

SIDE_NAMES = {"left", "right", "front", "back"}


# ----------------------------------------------------------------- face filter
def face_matches(filters, face, n_world, n_local, light) -> bool:
    if not filters:
        return True
    if isinstance(filters, str):
        filters = [filters]
    pos = [f for f in filters if not f.startswith("-")]
    neg = [f[1:] for f in filters if f.startswith("-")]

    def hit(tag):
        name = face.name
        if tag in ("all", "*"):
            return True
        if tag == name:
            return True
        if tag == "sides":
            return name in SIDE_NAMES or name.startswith("side")
        if tag == "flanks":
            return name in ("left", "right")
        if tag == "ends":
            return name in ("front", "back")
        if tag == "caps":
            return face.kind == "poly"
        if tag == "up":
            return n_world[1] > 0.5
        if tag == "down":
            return n_world[1] < -0.5
        if tag == "level":
            return abs(n_world[1]) <= 0.5
        if tag == "lit":
            return float(np.dot(n_world, light)) > 0.25
        if tag == "shaded":
            return float(np.dot(n_world, light)) < -0.1
        if tag == "local_up":
            return n_local[1] > 0.5
        if tag == "local_down":
            return n_local[1] < -0.5
        return False

    if pos and not any(hit(t) for t in pos):
        return False
    return not any(hit(t) for t in neg)


AXES = {"x": 0, "y": 1, "z": 2}


def _axis_coord(P, axis):
    if isinstance(axis, str):
        return P[..., AXES[axis]]
    a = np.asarray(axis, dtype=np.float64)
    a = a / np.linalg.norm(a)
    return P @ a


def _shift(mask: np.ndarray, dx: int, dy: int) -> np.ndarray:
    """Shift a boolean image by (dx, dy) pixels with zero fill."""
    H, W = mask.shape
    out = np.zeros_like(mask)
    xs0, xs1 = max(0, -dx), min(W, W - dx)
    ys0, ys1 = max(0, -dy), min(H, H - dy)
    if xs1 > xs0 and ys1 > ys0:
        out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = mask[ys0:ys1, xs0:xs1]
    return out


class FaceCtx:
    """Everything a paint op may want to know about one face."""

    def __init__(self, inst, face, fidx, light, bbox):
        self.inst, self.face, self.fidx = inst, face, fidx
        self.W, self.H = face.W, face.H
        self.P_local = face.texel_positions(self.W, self.H)
        self.P_src = self.P_local * (np.array([-1, 1, 1]) if inst.mirrored else 1)
        R, t = inst.world[:3, :3], inst.world[:3, 3]
        self.P_world = self.P_local @ R.T + t
        n_loc = face.normal
        self.n_local = n_loc * (np.array([-1, 1, 1]) if inst.mirrored else 1)
        self.n_world = R @ n_loc
        lo, hi = bbox
        half = np.maximum((hi - lo) / 2, 1e-6)
        self.N = (self.P_src - (lo + hi) / 2) / half          # normalised -1..1 part coords
        self.light = light
        self.ndl = float(np.dot(self.n_world, light))
        self.px, self.py = np.meshgrid(np.arange(self.W), np.arange(self.H))
        # image axes in world space (for pixel-space bevels / glints)
        s0 = face.sample(np.array(0.25), np.array(0.25))
        su = face.sample(np.array(0.75), np.array(0.25))
        sv = face.sample(np.array(0.25), np.array(0.75))
        self.U = R @ (su - s0)
        self.V = R @ (sv - s0)
        nu, nv = np.linalg.norm(self.U), np.linalg.norm(self.V)
        self.U = self.U / nu if nu > 1e-9 else self.U
        self.V = self.V / nv if nv > 1e-9 else self.V

    def coords(self, space):
        return self.P_world if space == "world" else self.P_src

    def shadow_offset(self):
        """1-px image offset pointing away from the light (for pattern bevels)."""
        d = -self.light
        du, dv = float(np.dot(d, self.U)), float(np.dot(d, self.V))
        ox = int(np.sign(du)) if abs(du) > 0.3 else 0
        oy = int(np.sign(dv)) if abs(dv) > 0.3 else 0
        if ox == 0 and oy == 0:
            oy = 1
        return ox, oy

    def edge_info(self):
        """[(dist_px array, dot(edge_outward_world, light))] for quad faces."""
        f = self.face
        out = []
        if f.kind != "quad":
            return out
        R = self.inst.world[:3, :3]
        c = f.pts.mean(axis=0)
        W, H = self.W, self.H
        dists = {"top": self.py, "right": W - 1 - self.px, "bottom": H - 1 - self.py, "left": self.px}
        for name, i, j in f.edges():
            a, b = f.pts[i], f.pts[j]
            e = b - a
            m = (a + b) / 2 - c
            el = np.linalg.norm(e)
            if el > 1e-9:
                m = m - e * (np.dot(m, e) / (el * el))
            mn = np.linalg.norm(m)
            if mn < 1e-9:
                continue
            ow = R @ (m / mn)
            out.append((name, dists[name], float(np.dot(ow, self.light))))
        return out


class Painter:
    def __init__(self, spec: dict, palette: Palette, instances, faces_flat):
        self.spec = spec
        self.pal = palette
        self.instances = instances
        self.faces_flat = faces_flat
        lt = spec.get("light", {})
        L = np.array(lt.get("dir", [-0.5, 1.0, 0.6]), dtype=np.float64)
        self.light = L / np.linalg.norm(L)
        self.light_strength = float(lt.get("strength", 1.0))
        self.local_gradient = float(lt.get("gradient", 0.5))
        self.ao = float(lt.get("ao", 0.8))
        self.ao_height = float(lt.get("ao_height", 3.0))
        self.ground = float(lt.get("ground", 0.0))
        self._spot_cache = {}
        self._bbox = {}
        for inst in instances:
            if inst.src_id not in self._bbox:
                pts = np.concatenate([f.pts for f in inst.src_faces]) if inst.src_faces else np.zeros((1, 3))
                self._bbox[inst.src_id] = (pts.min(axis=0), pts.max(axis=0))

    # ------------------------------------------------------------------ utils
    def ramp_id(self, name, where="") -> int:
        if name not in self.pal.index:
            raise ValueError(f"unknown ramp {name!r}{where}")
        return self.pal.index[name]

    # --------------------------------------------------------------- painting
    def paint_face(self, inst, face, fidx, paint: dict) -> np.ndarray:
        ctx = FaceCtx(inst, face, fidx, self.light, self._bbox[inst.src_id])
        H, W = ctx.H, ctx.W
        base = paint.get("ramp") or self.pal.names[0]
        rid = np.full((H, W), self.ramp_id(base, f" (part {inst.src_id})"), dtype=np.int64)
        tone = np.full((H, W), float(paint.get("tone", self.pal.mid(base))), dtype=np.float64)
        alpha = np.full((H, W), 255, dtype=np.uint8)

        layers = paint.get("layers", [])
        for li, layer in enumerate(layers):
            if layer.get("post"):
                continue
            self.apply_layer(ctx, layer, li, rid, tone, paint)

        # painted light
        lit = float(paint.get("light", 1.0))
        if lit:
            tone += lit * self.light_strength * ctx.ndl
            tone += lit * self.local_gradient * ctx.N[..., 1]
            if self.ao:
                hgt = ctx.P_world[..., 1] - self.ground
                tone += lit * self.ao * np.clip(hgt / self.ao_height - 1.0, -1.0, 0.0)

        # rims
        rim = {"light": 1, "dark": 1, "light_shift": 1.0, "dark_shift": -1.0,
               "threshold": 0.25, "outline": "none", "outline_width": 1}
        rim.update(paint.get("rim", {}))
        edges = ctx.edge_info()
        for name, dist, s in edges:
            if s > rim["threshold"] and rim["light"] > 0:
                tone[dist < rim["light"]] += rim["light_shift"]
            elif s < -rim["threshold"] and rim["dark"] > 0:
                tone[dist < rim["dark"]] += rim["dark_shift"]

        for li, layer in enumerate(layers):
            if layer.get("post"):
                self.apply_layer(ctx, layer, li, rid, tone, paint)

        # quantise with ordered dithering
        d = float(paint.get("dither", 0.5))
        thr = (1 - d) * 0.5 + d * BAYER4[ctx.py % 4, ctx.px % 4]
        idx = np.floor(tone + thr).astype(np.int64)
        idx = np.clip(idx, 0, self.pal.lengths[rid] - 1)
        rgb = self.pal.table[rid, idx].astype(np.uint8)

        # outlines (darkest colour of the texel's ramp, or an explicit colour)
        mode = rim.get("outline", "none")
        if mode and mode != "none":
            ow = int(rim.get("outline_width", 1))
            ocol = rim.get("outline_color")
            for name, dist, s in edges:
                if mode == "all" or (mode == "dark" and s < 0.05) or (mode == "bottom" and name == "bottom") \
                        or (isinstance(mode, list) and name in mode):
                    m = dist < ow
                    if ocol:
                        rgb[m] = self.pal.resolve(ocol)
                    else:
                        rgb[m] = self.pal.table[rid[m], 0]

        # card art: alpha + optional per-char colours
        art = inst.part.get("art")
        if art and inst.part.get("shape") == "card":
            akey = paint.get("art_key", {})
            rows = len(art)
            cols = max(len(r) for r in art)
            ay = np.clip((ctx.py * rows) // H, 0, rows - 1)
            ax = np.clip((ctx.px * cols) // W, 0, cols - 1)
            for y in range(H):
                for x in range(W):
                    row = art[ay[y, x]]
                    ch = row[ax[y, x]] if ax[y, x] < len(row) else "."
                    if ch in ". ":
                        alpha[y, x] = 0
                    elif ch in akey:
                        rgb[y, x] = self.pal.resolve(akey[ch])

        # stamps: hand-placed pixel art on a named face
        for st in paint.get("stamps", []):
            if st.get("face", "front") != face.name:
                continue
            self.apply_stamp(ctx, st, rgb, alpha, inst)

        return np.dstack([rgb, alpha])

    # ----------------------------------------------------------------- layers
    def apply_layer(self, ctx: FaceCtx, layer: dict, li: int, rid, tone, paint):
        op = layer.get("op", "fill")
        if not face_matches(layer.get("faces"), ctx.face, ctx.n_world, ctx.n_local, self.light):
            return
        H, W = ctx.H, ctx.W
        space = layer.get("space", "local")
        P = ctx.coords(space)
        # seeds key on the layer id (stable when layers are added/removed), else its index
        lkey = layer.get("id", li)
        seed = int(layer.get("seed", 0)) + seed_of(ctx.inst.src_id if not layer.get("asymmetric") else ctx.inst.id, lkey)

        mask = None
        if op == "fill":
            mask = np.ones((H, W), bool)
        elif op == "band":
            ax = layer.get("axis", "y")
            c = _axis_coord(ctx.N if space != "world" else P, ax)
            if layer.get("wobble"):
                c = c + layer["wobble"] * (fbm(P, 1.0 / float(layer.get("wobble_scale", 3.0)), 2, seed) - 0.5) * 2
            lo, hi = layer.get("from", -1.0), layer.get("to", 1.0)
            mask = (c >= lo) & (c <= hi)
        elif op == "stripes":
            ax = layer.get("axis", "z")
            c = _axis_coord(P, ax) + float(layer.get("phase", 0.0))
            if layer.get("wobble"):
                c = c + layer["wobble"] * (fbm(P, 1.0 / float(layer.get("wobble_scale", 3.0)), 2, seed) - 0.5) * 2
            period = float(layer.get("period", 4.0))
            width = float(layer.get("width", 0.5))
            mask = np.mod(c / period, 1.0) < width
            if "range" in layer:  # restrict to a normalised range along the axis
                a, b = layer["range"]
                cn = _axis_coord(ctx.N, ax)
                mask &= (cn >= a) & (cn <= b)
        elif op == "spots":
            mask = self._spots_mask(ctx, layer, li, seed)
        elif op == "patches":
            scale = float(layer.get("scale", 3.0))
            n = fbm(P, 1.0 / scale, int(layer.get("octaves", 3)), seed)
            mask = n > float(layer.get("threshold", 0.55))
        elif op == "speckle":
            r = hash3(ctx.px + 4096 * ctx.fidx, ctx.py, np.zeros_like(ctx.px), seed)
            m = r < float(layer.get("density", 0.08))
            tone[m] += float(layer.get("shift", 1.0))
            return
        elif op == "gradient":
            ax = layer.get("axis", "y")
            c = _axis_coord(ctx.N if space != "world" else P, ax)
            tone += float(layer.get("amount", 1.0)) * c
            return
        elif op == "noise":
            n = fbm(P, 1.0 / float(layer.get("scale", 2.0)), int(layer.get("octaves", 2)), seed)
            tone += float(layer.get("amount", 0.8)) * (n - 0.5) * 2
            return
        elif op == "gloss" and layer.get("dash"):
            # wet-look highlight dashes laid along lit edges, inset by `inset` px
            if ctx.ndl < float(layer.get("min_light", -0.2)):
                return
            L = int(layer.get("length", 3))
            inset = int(layer.get("inset", 1))
            m = np.zeros((H, W), bool)
            for ei, (name, dist, s) in enumerate(ctx.edge_info()):
                if s <= 0.25:
                    continue
                along = ctx.px if name in ("top", "bottom") else ctx.py
                block = (along + (seed % 7)) // (L + 1)
                gap = (along + (seed % 7)) % (L + 1) == L
                r = hash3(block, np.full_like(block, ei), np.full_like(block, ctx.fidx), seed)
                m |= (dist == inset) & (r < float(layer.get("density", 0.45))) & ~gap
            restrict = layer.get("ramps")
            if restrict:
                m &= np.isin(rid, [self.ramp_id(r) for r in restrict])
            tone[m] = np.maximum(tone[m] + float(layer.get("shift", 2.0)), tone[m])
            return
        elif op == "gloss":
            if ctx.ndl < float(layer.get("min_light", 0.15)):
                return
            r = hash3(ctx.px + 4096 * ctx.fidx, ctx.py, np.ones_like(ctx.px), seed)
            near = np.zeros((H, W))
            for name, dist, s in ctx.edge_info():
                if s > 0.25:
                    near = np.maximum(near, (dist < int(layer.get("edge", 3))).astype(float))
            p = float(layer.get("density", 0.04)) * (1.0 + float(layer.get("edge_boost", 4.0)) * near)
            m = r < p
            if layer.get("streak", True):
                m = m | (_shift(m, 1, 0) & (hash3(ctx.px, ctx.py, 7, seed) < 0.6))
            restrict = layer.get("ramps")
            if restrict:
                ok = np.isin(rid, [self.ramp_id(r) for r in restrict])
                m &= ok
            tone[m] = 99.0  # clamps to the lightest entry of the texel's ramp
            return
        else:
            raise ValueError(f"unknown paint op {op!r}")

        if mask is None or not mask.any():
            return
        if "ramp" in layer:
            new_r = self.ramp_id(layer["ramp"], f" (layer {li} of {ctx.inst.src_id})")
        else:
            new_r = None
        ltone = layer.get("tone")
        if ltone is None and new_r is not None:
            ltone = self.pal.mid(layer["ramp"])
        bevel = layer.get("bevel")
        if bevel:
            if bevel is True:
                bevel = {}
            ox, oy = ctx.shadow_offset()
            sh = int(bevel.get("shadow", 1))
            hl = int(bevel.get("highlight", 1))
            shadow = np.zeros_like(mask)
            grow = mask.copy()
            for _ in range(sh):
                grow = grow | _shift(grow, ox, oy)
            shadow = grow & ~mask
            inner = np.zeros_like(mask)
            if hl:
                covered = np.ones_like(mask)
                for j in range(1, hl + 1):
                    covered &= _shift(mask, j * ox, j * oy)
                inner = mask & ~covered
            sr = bevel.get("shadow_ramp")
            if shadow.any():
                if sr:
                    rid[shadow] = self.ramp_id(sr)
                    tone[shadow] = float(bevel.get("shadow_tone", 1.0))
                elif new_r is not None:
                    rid[shadow] = new_r
                    tone[shadow] = float(ltone) + float(bevel.get("shadow_shift", -1.5))
                else:
                    tone[shadow] += float(bevel.get("shadow_shift", -1.5))
        if new_r is not None:
            rid[mask] = new_r
        if ltone is not None:
            tone[mask] = float(ltone)
        if "shift" in layer:
            tone[mask] += float(layer["shift"])
        if bevel and hl:
            tone[inner] += float(bevel.get("highlight_shift", 1.0))

    def _spots_mask(self, ctx: FaceCtx, layer, li, seed):
        key = (ctx.inst.src_id if not layer.get("asymmetric") else ctx.inst.id, layer.get("id", li))
        if key not in self._spot_cache:
            self._spot_cache[key] = self._make_spots(ctx.inst, layer, seed)
        spots = self._spot_cache[key]
        if not spots:
            return np.zeros((ctx.H, ctx.W), bool)
        P = ctx.P_src
        C = np.array([s[0] for s in spots])           # (K,3)
        R = np.array([s[1] for s in spots])           # (K,)
        stretch = np.array(layer.get("stretch", [1, 1, 1]), dtype=np.float64)
        d = np.linalg.norm((P[..., None, :] - C[None, None]) / stretch, axis=-1)  # (H,W,K)
        rough = float(layer.get("roughness", 0.35))
        n = fbm(P, 1.0 / float(layer.get("rough_scale", 1.2)), 2, seed + 17)
        r_eff = R[None, None] * (1.0 + rough * (n[..., None] - 0.5) * 2)
        return (d < r_eff).any(axis=-1)

    def _make_spots(self, inst, layer, seed):
        rng = np.random.default_rng(seed)
        count = int(layer.get("count", 6))
        rad = layer.get("radius", [0.8, 1.6])
        if isinstance(rad, (int, float)):
            rad = [rad, rad]
        where = layer.get("where", {})
        lo, hi = self._bbox[inst.src_id]
        half = np.maximum((hi - lo) / 2, 1e-6)
        cen = (lo + hi) / 2
        flt = layer.get("seed_faces", layer.get("faces"))
        cands = []
        for f in inst.src_faces:
            # normal-based filters are evaluated in part-local space for seeding
            if face_matches(flt, f, f.normal, f.normal, self.light):
                cands.append(f)
        if not cands:
            return []
        areas = np.array([f.area() for f in cands])
        if areas.sum() <= 0:
            return []
        areas = areas / areas.sum()
        spots = []
        min_gap = float(layer.get("min_gap", 0.0))
        tries = 0
        while len(spots) < count and tries < count * 60:
            tries += 1
            f = cands[rng.choice(len(cands), p=areas)]
            s, t = rng.random(), rng.random()
            p = f.sample(np.array(s), np.array(t))
            nrm = (p - cen) / half
            ok = True
            for ax, (a, b) in where.items():
                v = nrm[AXES[ax]]
                if v < a or v > b:
                    ok = False
                    break
            if not ok:
                continue
            r = rng.uniform(rad[0], rad[1])
            if min_gap and any(np.linalg.norm(p - q) < (r + rq) * min_gap for q, rq in spots):
                continue
            spots.append((p, r))
        return spots

    # ----------------------------------------------------------------- stamps
    def apply_stamp(self, ctx: FaceCtx, st: dict, rgb, alpha, inst):
        art = st["art"]
        key = st.get("key", {})
        rows, cols = len(art), max(len(r) for r in art)
        H, W = ctx.H, ctx.W
        at = st.get("at", "center")
        if isinstance(at, (list, tuple)):
            x0, y0 = int(at[0]), int(at[1])
        else:
            x0 = {"left": 0, "right": W - cols}.get(at.split("-")[-1], (W - cols) // 2)
            y0 = {"top": 0, "bottom": H - rows}.get(at.split("-")[0], (H - rows) // 2)
            if at in ("left", "right"):
                y0 = (H - rows) // 2
            if at in ("top", "bottom"):
                x0 = (W - cols) // 2
        off = st.get("offset", [0, 0])
        x0 += int(off[0])
        y0 += int(off[1])
        flip = inst.mirrored and st.get("flip_on_mirror", False)
        for ry, row in enumerate(art):
            for rx, ch in enumerate(row):
                if ch in ". ":
                    continue
                x = x0 + (cols - 1 - rx if flip else rx)
                y = y0 + ry
                if not (0 <= x < W and 0 <= y < H):
                    continue
                if ch == "_":
                    alpha[y, x] = 0
                    continue
                if ch not in key:
                    raise ValueError(f"stamp char {ch!r} has no key entry (part {inst.src_id})")
                rgb[y, x] = self.pal.resolve(key[ch])
