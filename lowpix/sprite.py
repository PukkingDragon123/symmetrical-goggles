"""2D sprites from a JSON spec (icons, items, weapons, creatures, gems), painted with brush strokes.

A sprite is a list of shapes. Each shape has a material (a hue-shifted ramp), a
*form* that gives every pixel a surface normal, and a *flow* that says which way
a painter's strokes would run over it:

    {"size": [32, 32], "view": {"rotate": 45}, "paint": "strokes",
     "materials": {"steel": {"base": "#8a9bb4", "steps": 7, "texture": "metal"},
                   "gold": {"base": "#d9a43a"}},
     "shapes": [
       {"type": "polygon", "points": [[15,2],[17,2],[17,22],[15,22]], "material": "steel", "form": "ridge",
        "part": "blade", "edge": {"light": 2}},
       {"type": "ellipse", "center": [16,25], "radii": [3,2], "material": "gold", "form": "dome", "part": "pommel"}
     ],
     "outline": "selout", "effects": {"sparkle": "auto"}}

`paint` picks the painter:
* "strokes" (default): pixel art painted as strokes. Every tone cluster is a
  streamline stroke that follows the form, from dark to light, with interlocking
  edges and material marks (scratches, grain, chips). It stays strictly on the ramps.
* "flat": per-pixel quantised light (clean, mechanical).
* "painted": smooth hand-painted art at any size. It supersamples, then paints
  block-in, form, detail and accent passes of tapered, bristled strokes in
  continuous colour, with a soft painted outline.

See docs/SPRITES.md for the full reference.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image

from . import brush
from .noise import BAYER4, fbm
from .palette import make_ramp, parse_hex

FORMS = {"flat", "dome", "bevel", "ridge", "cylinder", "facets", "pillow"}
PAINTS = {"strokes", "flat", "painted"}
DEFAULT_LIGHT = [-0.55, -0.65, 0.55]


# ------------------------------------------------------------------ helpers
def _norm(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def _poly_inside(X, Y, pts):
    inside = np.zeros(X.shape, bool)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if y1 == y2:
            continue
        cond = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / (y2 - y1) + x1)
        inside ^= cond
    return inside


def _poly_edge(X, Y, pts):
    """Distance to the polygon boundary, the unit direction toward it, and the edge tangent."""
    best = np.full(X.shape, np.inf)
    dx = np.zeros(X.shape)
    dy = np.zeros(X.shape)
    tx = np.zeros(X.shape)
    ty = np.zeros(X.shape)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        L2 = ex * ex + ey * ey
        if L2 < 1e-12:
            continue
        t = np.clip(((X - x1) * ex + (Y - y1) * ey) / L2, 0, 1)
        cx, cy = x1 + t * ex, y1 + t * ey
        d = np.hypot(cx - X, cy - Y)
        m = d < best
        best = np.where(m, d, best)
        dx = np.where(m, cx - X, dx)
        dy = np.where(m, cy - Y, dy)
        L = math.sqrt(L2)
        tx = np.where(m, ex / L, tx)
        ty = np.where(m, ey / L, ty)
    ln = np.maximum(np.hypot(dx, dy), 1e-9)
    return best, dx / ln, dy / ln, tx, ty


def _principal_axis(pts):
    P = np.array(pts, float)
    P = P - P.mean(axis=0)
    if len(P) < 2:
        return np.array([1.0, 0.0])
    w, v = np.linalg.eigh(P.T @ P)
    return v[:, -1]


def _rot(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s], [s, c]])


def _material(name, spec, steps_default=7):
    """Material spec -> dict with its ramp in m['cols']."""
    m = dict(spec)
    if "ramp" in m:
        cols = [parse_hex(c) for c in m["ramp"]]
    else:
        cols = [parse_hex(c) for c in make_ramp(m.get("base", "#888888"), int(m.get("steps", steps_default)),
                                                 float(m.get("hue_shift", 22)), float(m.get("sat_shift", 0.12)),
                                                 float(m.get("spread", 0.8)))]
    m["cols"] = np.array(cols, np.uint8)
    m["name"] = name
    return m


def ramp_lerp(cols, t):
    """Continuous colour along a ramp: t in tone units (0..n-1) -> rgb floats 0..1."""
    c = np.asarray(cols, float) / 255.0
    t = np.clip(t, 0, len(c) - 1)
    i0 = np.floor(t).astype(int)
    i1 = np.minimum(i0 + 1, len(c) - 1)
    f = (t - i0)[..., None]
    return c[i0] * (1 - f) + c[i1] * f


# --------------------------------------------------------------- the engine
def render_sprite(spec: dict, seed: int = 0) -> Image.Image:
    size = spec.get("size", 32)
    W, H = (int(size[0]), int(size[1])) if isinstance(size, (list, tuple)) else (int(size), int(size))
    paint = spec.get("paint", "strokes")
    if paint not in PAINTS:
        raise ValueError(f"paint must be one of {sorted(PAINTS)}, not {paint!r}")
    ss = int(spec.get("supersample", 4 if paint == "painted" else 1))
    Wi, Hi = W * ss, H * ss
    rng = np.random.default_rng(int(spec.get("seed", seed)))

    view = spec.get("view", {})
    ang = math.radians(float(view.get("rotate", 0.0)))
    cx0, cy0 = view.get("center", [W / 2, H / 2])
    R = _rot(ang)
    Ri = R.T
    sc = float(view.get("scale", 1.0))
    off = np.array(view.get("offset", [0.0, 0.0]), float)

    py, px = np.mgrid[0:Hi, 0:Wi].astype(float)
    # pixel centre (canvas, in sprite units) -> local shape space (rotation about the view centre)
    qx0 = (px + 0.5) / ss - cx0 - off[0]
    qy0 = (py + 0.5) / ss - cy0 - off[1]
    X = (Ri[0, 0] * qx0 + Ri[0, 1] * qy0) / sc + cx0
    Y = (Ri[1, 0] * qx0 + Ri[1, 1] * qy0) / sc + cy0

    Lv = np.array(spec.get("light", DEFAULT_LIGHT), float)
    Lv /= np.linalg.norm(Lv)
    Lxy = Lv[:2] / max(np.linalg.norm(Lv[:2]), 1e-9)

    mats = {k: _material(k, v) for k, v in spec.get("materials", {}).items()}
    mat_names = list(mats)
    mid = np.full((Hi, Wi), -1, np.int64)                # material index per pixel
    part = np.full((Hi, Wi), -1, np.int64)               # part index per pixel
    zbuf = np.full((Hi, Wi), -1e9)
    N = np.zeros((Hi, Wi, 3))
    N[..., 2] = 1
    FL = np.zeros((Hi, Wi, 2))                           # stroke flow (canvas directions)
    FL[..., 0] = 1
    tone_bias = np.zeros((Hi, Wi))
    emissive = np.zeros((Hi, Wi), bool)
    stamp_rgb = np.zeros((H, W, 3), np.uint8)
    stamp = np.zeros((H, W), bool)
    parts = []

    def to_canvas(vx, vy):
        return R[0, 0] * vx + R[0, 1] * vy, R[1, 0] * vx + R[1, 1] * vy

    shapes = spec.get("shapes", [])
    for si, sh in enumerate(shapes):
        typ = sh.get("type", "polygon")
        mat = sh.get("material")
        z = float(sh.get("z", si))
        pname = sh.get("part", f"s{si}")
        if pname not in parts:
            parts.append(pname)
        pidx = parts.index(pname)
        form = sh.get("form", "flat")
        edist = None   # (distance to the boundary, unit direction toward it) for `edge`
        n_loc = np.zeros((Hi, Wi, 3))
        n_loc[..., 2] = 1
        fx_l = np.ones((Hi, Wi))      # local flow direction
        fy_l = np.zeros((Hi, Wi))
        bias = np.zeros((Hi, Wi))

        if typ == "pixels":  # hand-placed pixels, drawn last over everything
            at = sh.get("at", [0, 0])
            key = sh.get("key", {})
            for ry, row in enumerate(sh["art"]):
                for rx, ch in enumerate(row):
                    if ch in ". " or ch not in key:
                        continue
                    xx, yy = int(at[0]) + rx, int(at[1]) + ry
                    if 0 <= xx < W and 0 <= yy < H:
                        ref = key[ch]
                        if ref.startswith("#"):
                            stamp_rgb[yy, xx] = parse_hex(ref)
                        else:
                            nm, idx = ref.split(":") if ":" in ref else (ref, None)
                            m = mats[nm]
                            stamp_rgb[yy, xx] = m["cols"][int(idx) if idx is not None else len(m["cols"]) // 2]
                        stamp[yy, xx] = True
            continue

        if typ == "ellipse":
            c = np.array(sh["center"], float)
            rx, ry = (sh["radii"] if isinstance(sh.get("radii"), list) else [sh.get("radius", 4)] * 2)
            a = math.radians(float(sh.get("angle", 0)))
            u = (X - c[0]) * math.cos(a) + (Y - c[1]) * math.sin(a)
            v = -(X - c[0]) * math.sin(a) + (Y - c[1]) * math.cos(a)
            e = (u / rx) ** 2 + (v / ry) ** 2
            inside = e <= 1.0
            rr = np.sqrt(np.maximum(e, 1e-12))
            ux, vy = u / rx, v / ry
            nx = ux * math.cos(a) - vy * math.sin(a)
            ny = ux * math.sin(a) + vy * math.cos(a)
            if sh.get("edge"):
                ln = np.maximum(np.hypot(nx, ny), 1e-9)
                edist = ((1 - rr) * min(rx, ry), nx / ln, ny / ln)
            if form in ("dome", "pillow"):
                r = np.sqrt(np.clip(e, 0, 0.999))
                bulge = float(sh.get("bulge", 1.0))
                n_loc = np.dstack([nx * bulge, ny * bulge, np.sqrt(np.clip(1 - r * r, 0.02, 1))])
            elif form == "bevel":
                d = 1 - np.sqrt(np.clip(e, 0, 1))
                bw = float(sh.get("bevel", 0.35))
                k = np.clip(1 - d / bw, 0, 1)
                n_loc = np.dstack([nx * k, ny * k, np.ones_like(k)])
            fx_l, fy_l = -ny, nx  # strokes wrap around the dome
        elif typ == "polygon":
            pts = [tuple(p) for p in sh["points"]]
            inside = _poly_inside(X, Y, pts)
            d, dx, dy, tx, ty = _poly_edge(X, Y, pts)
            if sh.get("edge"):
                edist = (d, dx, dy)
            axis = sh.get("axis")
            if axis:
                a0, a1 = np.array(axis[0], float), np.array(axis[1], float)
                ax_ = (a1 - a0) / max(np.linalg.norm(a1 - a0), 1e-9)
            else:
                ax_ = _principal_axis(pts)
                a0 = np.mean(np.array(pts, float), axis=0)
            if form in ("bevel", "pillow"):
                bw = float(sh.get("bevel", 1.5))
                k = np.clip(1 - d / bw, 0, 1) * float(sh.get("bevel_tilt", 0.9))
                n_loc = np.dstack([dx * k, dy * k, np.ones_like(k)])
                fx_l, fy_l = tx, ty
            elif form == "dome":
                dmax = max(float(d[inside].max()) if inside.any() else 1.0, 1e-6)
                r = np.clip(1 - d / dmax, 0, 0.98)
                n_loc = np.dstack([dx * r, dy * r, np.sqrt(np.clip(1 - r * r, 0.05, 1))])
                # strokes run along the long axis in the middle and hug the edge near the rim
                w_ = np.clip(r * 1.6 - 0.5, 0, 1)
                sg = np.sign(tx * ax_[0] + ty * ax_[1] + 1e-9)
                fx_l = tx * w_ * sg + ax_[0] * (1 - w_)
                fy_l = ty * w_ * sg + ax_[1] * (1 - w_)
            elif form == "ridge":
                perp = np.array([-ax_[1], ax_[0]])
                side = np.sign((X - a0[0]) * perp[0] + (Y - a0[1]) * perp[1])
                tilt = float(sh.get("tilt", 0.75))
                n_loc = np.dstack([side * perp[0] * tilt, side * perp[1] * tilt, np.ones_like(side)])
                if sh.get("bevel"):
                    k = np.clip(1 - d / float(sh["bevel"]), 0, 1) * 0.6
                    n_loc[..., 0] += dx * k
                    n_loc[..., 1] += dy * k
                fx_l, fy_l = np.full_like(X, ax_[0]), np.full_like(X, ax_[1])
            else:
                fx_l, fy_l = np.full_like(X, ax_[0]), np.full_like(X, ax_[1])
        elif typ == "stroke":
            pts = np.array(sh["points"], float)
            wv = sh.get("width", 2)
            ws = np.array(wv if isinstance(wv, list) else [wv] * len(pts), float)
            if len(ws) != len(pts):
                ws = np.interp(np.linspace(0, 1, len(pts)), np.linspace(0, 1, len(ws)), ws)
            best = np.full((Hi, Wi), np.inf)
            sacross = np.zeros((Hi, Wi))
            pxn = np.zeros((Hi, Wi))
            pyn = np.zeros((Hi, Wi))
            hwb = np.ones((Hi, Wi))
            for i in range(len(pts) - 1):
                p0, p1 = pts[i], pts[i + 1]
                e = p1 - p0
                L2 = max(e @ e, 1e-12)
                t = np.clip(((X - p0[0]) * e[0] + (Y - p0[1]) * e[1]) / L2, 0, 1)
                cxp, cyp = p0[0] + t * e[0], p0[1] + t * e[1]
                hw = (ws[i] + (ws[i + 1] - ws[i]) * t) / 2
                nrm_ = np.array([-e[1], e[0]]) / math.sqrt(L2)
                sd = ((X - cxp) * nrm_[0] + (Y - cyp) * nrm_[1])
                d = np.hypot(X - cxp, Y - cyp) / np.maximum(hw, 1e-6)
                m = d < best
                best = np.where(m, d, best)
                sacross = np.where(m, np.clip(sd / np.maximum(hw, 1e-6), -1, 1), sacross)
                pxn = np.where(m, nrm_[0], pxn)
                pyn = np.where(m, nrm_[1], pyn)
                hwb = np.where(m, hw, hwb)
            inside = best <= 1.0
            if sh.get("edge"):
                sg = np.where(sacross >= 0, 1.0, -1.0)
                edist = ((1 - best) * hwb, pxn * sg, pyn * sg)
            if form in ("cylinder", "dome"):
                s = sacross
                n_loc = np.dstack([pxn * s, pyn * s, np.sqrt(np.clip(1 - s * s, 0.05, 1))])
            elif form == "ridge":
                s = np.sign(sacross)
                tilt = float(sh.get("tilt", 0.7))
                n_loc = np.dstack([pxn * s * tilt, pyn * s * tilt, np.ones_like(s)])
            fx_l, fy_l = pyn, -pxn  # along the stroke
        elif typ == "gem":
            outer = [tuple(p) for p in sh["outer"]]
            oc = np.mean(np.array(outer), axis=0)
            if "table" in sh:
                table = [tuple(p) for p in sh["table"]]
            else:
                ts = float(sh.get("table_scale", 0.5))
                to = np.array(sh.get("table_offset", [-0.6, -0.6]))
                table = [tuple(oc + (np.array(p) - oc) * ts + to) for p in outer]
            inside = _poly_inside(X, Y, outer)
            if sh.get("edge"):
                edist = _poly_edge(X, Y, outer)[:3]
            tilt = float(sh.get("tilt", 0.9))
            tin = _poly_inside(X, Y, table)
            nn = len(outer)
            fx_l = np.zeros((Hi, Wi))
            fy_l = np.zeros((Hi, Wi))
            for i in range(nn):
                quad = [outer[i], outer[(i + 1) % nn], table[(i + 1) % nn], table[i]]
                qi = _poly_inside(X, Y, quad) & ~tin
                fc = np.mean(np.array(quad), axis=0)
                dvec = fc - oc
                dvec = dvec / max(np.linalg.norm(dvec), 1e-9)
                n_loc[qi] = [dvec[0] * tilt, dvec[1] * tilt, 1.0]
                ev = np.array(outer[(i + 1) % nn], float) - np.array(outer[i], float)
                ev = ev / max(np.linalg.norm(ev), 1e-9)
                fx_l[qi], fy_l[qi] = ev[0], ev[1]  # strokes run along each facet
            n_loc[tin] = sh.get("table_normal", [0.0, 0.0, 1.0])
            lt = Lxy @ R  # light direction in local space
            fx_l[tin], fy_l[tin] = -lt[1], lt[0]
            if sh.get("refraction", 0):  # light passes through: the table is darker toward the light
                tc = np.array(table).mean(axis=0)
                ext = max(float(np.max(np.abs((np.array(table) - tc) @ lt))), 1e-6)
                proj = ((X - tc[0]) * lt[0] + (Y - tc[1]) * lt[1]) / ext
                bias = np.where(tin, -float(sh["refraction"]) * np.clip(proj, -1, 1), 0.0)
        else:
            raise ValueError(f"unknown shape type {typ!r}")

        if isinstance(sh.get("flow"), (list, tuple)):  # explicit local flow direction
            fv = np.array(sh["flow"], float)
            fv = fv / max(np.linalg.norm(fv), 1e-9)
            fx_l, fy_l = np.full_like(X, fv[0]), np.full_like(X, fv[1])
        if sh.get("bias"):
            bias = bias + float(sh["bias"])
        if sh.get("edge") and edist is not None:
            # painted edge: a highlight line on the boundary facing the light, a darker one opposite
            ed = sh["edge"] if isinstance(sh["edge"], dict) else {"light": float(sh["edge"])}
            d_, ex_, ey_ = edist
            cxv, cyv = to_canvas(ex_, ey_)
            facing = cxv * Lxy[0] + cyv * Lxy[1]
            near = d_ < float(ed.get("width", 1.0))
            thr_ = float(ed.get("threshold", 0.35))
            bias = bias + np.where(near & (facing > thr_), float(ed.get("light", 1.0)), 0.0)
            if ed.get("dark"):
                bias = bias + np.where(near & (facing < -thr_), float(ed["dark"]), 0.0)
        if sh.get("grad"):  # tone gradient along a local axis: {"from": [x,y], "to": [x,y], "amount": tones}
            g = sh["grad"]
            g0, g1 = np.array(g["from"], float), np.array(g["to"], float)
            gv = g1 - g0
            t = np.clip(((X - g0[0]) * gv[0] + (Y - g0[1]) * gv[1]) / max(gv @ gv, 1e-9), 0, 1)
            bias = bias + float(g.get("amount", 1.0)) * (t - 0.5) * 2
        if sh.get("stripes"):  # bands along an axis: wrap, fin rays, rows
            st = sh["stripes"]
            g0, g1 = np.array(st["from"], float), np.array(st["to"], float)
            gv = g1 - g0
            t = ((X - g0[0]) * gv[0] + (Y - g0[1]) * gv[1]) / max(math.sqrt(gv @ gv), 1e-9)
            if st.get("slant"):
                pv = np.array([-gv[1], gv[0]]) / max(math.sqrt(gv @ gv), 1e-9)
                t = t + float(st["slant"]) * ((X - g0[0]) * pv[0] + (Y - g0[1]) * pv[1])
            band = np.mod(t / float(st.get("period", 2.0)), 1.0) < float(st.get("duty", 0.5))
            bias = bias + np.where(band, float(st.get("amount", -1.0)), 0.0)
            if st.get("flow", True):  # strokes run along the bands
                gu = gv / max(math.sqrt(gv @ gv), 1e-9)
                fx_l, fy_l = np.full_like(X, -gu[1]), np.full_like(X, gu[0])
        if sh.get("scales"):  # fish / dragon scales: offset rows of small arcs
            sc_ = sh["scales"] if isinstance(sh["scales"], dict) else {"size": float(sh["scales"])}
            ssz = float(sc_.get("size", 3.0))
            row = np.floor(Y / ssz)
            fxs = np.mod(X + np.mod(row, 2) * ssz / 2, ssz) - ssz / 2
            fys = Y - row * ssz
            arc = np.abs(np.hypot(fxs, fys) - ssz / 2) < float(sc_.get("line", 0.55))
            bias = bias + np.where(arc & (fys > ssz * 0.15), float(sc_.get("amount", -1.0)), 0.0)
        if sh.get("clip"):  # only where an existing part is already drawn
            clip = sh["clip"] if isinstance(sh["clip"], list) else [sh["clip"]]
            ok = np.zeros((Hi, Wi), bool)
            for c in clip:
                if c in parts:
                    ok |= part == parts.index(c)
            inside = inside & ok
        if sh.get("subtract"):
            mid[inside] = -1
            part[inside] = -1
            continue
        win = inside & (z >= zbuf)
        if mat not in mats:
            raise ValueError(f"shape {si} uses unknown material {mat!r}")
        mid[win] = mat_names.index(mat)
        part[win] = pidx
        zbuf[win] = z
        n_loc = _norm(n_loc)
        ncx, ncy = to_canvas(n_loc[..., 0], n_loc[..., 1])
        N[win] = np.dstack([ncx, ncy, n_loc[..., 2]])[win]
        fcx, fcy = to_canvas(fx_l, fy_l)
        fl = np.hypot(fcx, fcy)
        good = win & (fl > 1e-6)
        FL[good] = np.dstack([fcx / np.maximum(fl, 1e-9), fcy / np.maximum(fl, 1e-9)])[good]
        tone_bias[win] = bias[win]
        emissive[win] = bool(mats[mat].get("emissive"))

    filled = mid >= 0
    # ------------------------------------------------- silhouette cleanup (pixel modes)
    if spec.get("cleanup", True) and ss == 1:
        for _ in range(2):
            nb = _n4(filled)
            spur = filled & (nb <= 1)
            notch = ~filled & (nb >= 3)
            if notch.any():  # fill notches from a neighbouring pixel
                for yy, xx in zip(*np.nonzero(notch)):
                    cands = [(yy + dy_, xx + dx_) for dy_, dx_ in ((-1, 0), (1, 0), (0, -1), (0, 1))
                             if 0 <= yy + dy_ < Hi and 0 <= xx + dx_ < Wi and mid[yy + dy_, xx + dx_] >= 0]
                    if cands:
                        yy2, xx2 = cands[0]
                        for arr in (mid, part, N, FL, tone_bias, zbuf, emissive):
                            arr[yy, xx] = arr[yy2, xx2]
            mid[spur] = -1
            part[spur] = -1
            filled = mid >= 0

    # flow: smooth inside each part so strokes don't flip direction pixel to pixel
    for pi_ in range(len(parts)):
        pm = part == pi_
        if pm.any():
            FL = brush.smooth_flow(FL, pm, passes=1 if ss == 1 else 2 * ss)

    # ------------------------------------------------------- painted light (continuous tone)
    Hv = _norm(Lv + np.array([0, 0, 1.0]))
    Nn = _norm(N)
    ndl = Nn @ Lv
    flat_ref = Lv[2]
    edge_px = filled & (_n4(filled) < 4) if ss == 1 else filled & (brush.blur(filled.astype(float), ss) < 0.75)
    T = np.zeros((Hi, Wi))
    specm = np.zeros((Hi, Wi), bool)
    for mi, name in enumerate(mat_names):
        m = mats[name]
        sel = mid == mi
        if not sel.any():
            continue
        n_ = len(m["cols"])
        midt = float(m.get("tone", (n_ - 1) / 2.0))
        if m.get("emissive"):
            tone = midt + float(m.get("glow_gradient", 0.0)) * (Nn[..., 2] - 0.7) + tone_bias
        else:
            tone = midt + float(m.get("contrast", 1.5)) * (ndl - flat_ref) * (n_ - 1) / 2.0 + tone_bias
            rim = float(m.get("rim", 1.0))
            if rim:  # reflected light: shadow-side silhouette pixels get a lighter rim
                tone = np.where(edge_px & (ndl < flat_ref - 0.25), tone + rim, tone)
        if m.get("noise"):
            P = np.dstack([px / ss, py / ss, np.zeros_like(px)])
            tone = tone + float(m["noise"]) * (fbm(P, 1.0 / float(m.get("noise_scale", 2.0)), 2, seed + mi * 7) - 0.5) * 2
        if m.get("photo"):  # photo-bash: a real texture's relief drives the tone (see lowpix.photo)
            from .photo import detail, load_photo
            pc = m["photo"] if isinstance(m["photo"], dict) else {"src": m["photo"]}
            ph = load_photo(pc["src"], pc.get("res", "1k"))
            sc_ = float(pc.get("scale", 32.0))
            tone = tone + float(pc.get("amount", 1.2)) * detail(ph, X / sc_, Y / sc_)
        if m.get("spec", 0.0):
            sp = (Nn @ Hv) > float(m.get("spec_threshold", 0.965))
            specm |= sp & sel
            tone = np.where(sp, np.maximum(tone, n_ - 1 + 0.3), tone)
        T[sel] = tone[sel]

    if paint == "painted":
        img = _paint_smooth(spec, mats, mat_names, mid, part, zbuf, T, FL, filled, emissive, edge_px, Lxy, ss, rng,
                            stamp, stamp_rgb, W, H)
        img = _effects(img, spec.get("effects", {}), mats, mat_names, _down(mid, ss), _down(Nn, ss), Hv, seed)
        return Image.fromarray(img, "RGBA")

    # ------------------------------------------------------- quantise / stroke-paint
    tone_idx = np.zeros((Hi, Wi), np.int64)
    st = spec.get("strokes", {})
    S = max(W, H)
    for mi, name in enumerate(mat_names):
        m = mats[name]
        sel = mid == mi
        if not sel.any():
            continue
        n_ = len(m["cols"])
        if paint == "flat" or m.get("paint") == "flat":
            d = float(m.get("dither", spec.get("dither", 0.0)))
            thr = (1 - d) * 0.5 + d * BAYER4[py.astype(int) % 4, px.astype(int) % 4]
            ti = np.clip(np.floor(T + thr).astype(np.int64), 1, n_ - 1)
            tone_idx[sel] = ti[sel]
            continue
        ms = dict(st, **m.get("strokes", {}))
        length = ms.get("length", max(3.0, 0.09 * S))
        labels = np.where(sel, part, -1)
        out = brush.pixel_strokes(np.clip(T, 1, n_ - 1), sel, FL, rng, 1, n_ - 1, length=length,
                                  rough=float(ms.get("rough", 0.6)), overshoot=float(ms.get("overshoot", 0.3)),
                                  marks=m.get("texture", "none"), mark_scale=float(ms.get("marks", 1.0)),
                                  protect=specm, labels=labels, width=float(ms.get("width", 1.3)))
        tone_idx[sel] = out[sel]
    rgb = np.zeros((Hi, Wi, 3), np.uint8)
    for mi, name in enumerate(mat_names):
        sel = mid == mi
        rgb[sel] = mats[name]["cols"][tone_idx[sel]]

    # ---------------------------------------------------- contact shading
    inner = spec.get("inner", "shade")
    if inner != "none" and len(parts) > 1:
        for dy_, dx_ in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            zn = _shift(zbuf, dx_, dy_, -1e9)
            pn = _shift(part, dx_, dy_, -1)
            behind = filled & (pn >= 0) & (pn != part) & (zn > zbuf)
            for mi, name in enumerate(mat_names):
                cols = mats[name]["cols"]
                s2 = behind & (mid == mi) & ~emissive
                if s2.any():
                    newt = np.clip(tone_idx[s2] - (2 if inner == "shade" else 99), 0, len(cols) - 1)
                    tone_idx[s2] = newt
                    rgb[s2] = cols[newt]

    # ---------------------------------------------------- orphan cleanup
    if spec.get("cleanup", True):
        _orphans(mid, tone_idx, rgb, mats, mat_names, emissive)

    rgb[stamp] = stamp_rgb[stamp]
    alpha = np.where(filled | stamp, 255, 0).astype(np.uint8)
    _outline(spec, rgb, alpha, filled | stamp, mid, mats, mat_names, Lv)
    img = np.dstack([rgb, alpha])
    img = _effects(img, spec.get("effects", {}), mats, mat_names, mid, Nn, Hv, seed)
    return Image.fromarray(img, "RGBA")


def _orphans(mid, tone_idx, rgb, mats, mat_names, emissive):
    """Single pixels whose tone differs from almost all same-material neighbours join their cluster."""
    H, W = mid.shape
    filled = mid >= 0
    for yy, xx in zip(*np.nonzero(filled)):
        if yy in (0, H - 1) or xx in (0, W - 1) or emissive[yy, xx]:
            continue
        nbm = mid[yy - 1:yy + 2, xx - 1:xx + 2]
        nbt = tone_idx[yy - 1:yy + 2, xx - 1:xx + 2]
        same = nbm == mid[yy, xx]
        if same.sum() < 8:
            continue
        t0 = tone_idx[yy, xx]
        others = nbt[same].tolist()
        others.remove(t0)
        if others.count(t0) == 0:
            vals, cnts = np.unique(others, return_counts=True)
            if cnts.max() >= 6:
                tone_idx[yy, xx] = vals[np.argmax(cnts)]
                rgb[yy, xx] = mats[mat_names[mid[yy, xx]]]["cols"][tone_idx[yy, xx]]


def _outline(spec, rgb, alpha, solid, mid, mats, mat_names, Lv):
    H, W = mid.shape
    ol = spec.get("outline", "selout")
    if ol == "none":
        return
    ring = ~solid & (_n4(solid) > 0)
    if spec.get("outline_corners"):
        ring |= ~solid & (_n8(solid) > 0)
    black = np.array(parse_hex(spec.get("outline_color", "#0e0b16")), np.uint8)
    for yy, xx in zip(*np.nonzero(ring)):
        best_m, lit = -1, 0.0
        for dy_, dx_ in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            y2, x2 = yy + dy_, xx + dx_
            if 0 <= y2 < H and 0 <= x2 < W and mid[y2, x2] >= 0:
                best_m = mid[y2, x2]
                lit += -(dx_ * Lv[0] + dy_ * Lv[1])  # outline pixel on the lit side of the shape
        if ol == "black" or best_m < 0:
            rgb[yy, xx] = black
        else:
            m = mats[mat_names[best_m]]
            cols = m["cols"]
            if m.get("emissive"):
                rgb[yy, xx] = cols[max(1, len(cols) // 3)]
            else:
                k = int(spec.get("outline_tone", 0))  # 0 = darkest step; higher = softer, coloured outlines
                k = min(k, len(cols) - 2)
                if ol == "selout" and lit > 0.3:
                    rgb[yy, xx] = cols[k + 1] if len(cols) > 3 else cols[k]
                else:
                    rgb[yy, xx] = cols[k]
        alpha[yy, xx] = 255


def _down(a, ss):
    """Pick the centre sample of every ss x ss block (labels, normals)."""
    if ss == 1:
        return a
    o = ss // 2
    return a[o::ss, o::ss]


def _paint_smooth(spec, mats, mat_names, mid, part, zbuf, T, FL, filled, emissive, edge_px, Lxy, ss, rng,
                  stamp, stamp_rgb, W, H):
    """The painted (non-pixel) finish: brush strokes in continuous colour, then downsample."""
    Hi, Wi = mid.shape
    target = np.zeros((Hi, Wi, 3))
    for mi, name in enumerate(mat_names):
        sel = mid == mi
        if sel.any():
            target[sel] = ramp_lerp(mats[name]["cols"], np.clip(T[sel], 0.6, len(mats[name]["cols"]) - 1))
    # soft contact shadow where a part tucks behind a nearer one
    occ = np.zeros((Hi, Wi))
    rad = 1.2 * ss
    for pi_ in np.unique(part[filled]):
        pm = part == pi_
        zq = float(np.median(zbuf[pm]))
        b = brush.blur(pm.astype(float), rad)
        occ += np.where(filled & ~pm & (zbuf < zq), b, 0)
    target *= (1 - 0.45 * np.clip(occ * 1.6, 0, 1))[..., None]
    lum = target @ np.array([0.3, 0.55, 0.15])
    gy, gx = np.gradient(brush.blur(lum, ss * 0.5))
    detail = np.hypot(gx, gy) > (0.06 / ss)
    detail |= edge_px
    bstyle = spec.get("brush", {})
    S = max(W, H)
    labels = np.where(filled, part, -1)
    canvas = brush.painted(target, labels, FL, rng, length=float(bstyle.get("length", 0.12 * S)) * ss,
                           width=float(bstyle.get("width", 0.035 * S)) * ss, value=float(bstyle.get("value", 0.07)),
                           hue=float(bstyle.get("hue", 0.03)), bristle=float(bstyle.get("bristle", 0.05)),
                           detail=detail, detail_length=1.5 * ss)
    # painted outline: a dark line hugging the silhouette, lighter on the lit side
    ol = spec.get("outline", "selout")
    alpha = filled.astype(float)
    if ol != "none":
        width = float(spec.get("outline_width", 0.9)) * ss
        inner_d = brush.blur(filled.astype(float), max(1, width * 0.6))
        band = filled & (inner_d < 0.82)
        dark = np.zeros((Hi, Wi, 3))
        for mi, name in enumerate(mat_names):
            sel = mid == mi
            if sel.any():
                dark[sel] = mats[name]["cols"][0] / 255.0
        if ol == "black":
            dark[:] = np.array(parse_hex(spec.get("outline_color", "#0e0b16"))) / 255.0
        nyg, nxg = np.gradient(brush.blur(filled.astype(float), ss))
        lit = (nxg * Lxy[0] + nyg * Lxy[1]) / np.maximum(np.hypot(nxg, nyg), 1e-9)
        k = np.where(band, np.clip((0.82 - inner_d) / 0.3, 0, 1), 0) * (1 - 0.55 * np.clip(-lit, 0, 1))
        if spec.get("outline_jitter", True):
            k = k * (0.85 + 0.15 * rng.random((Hi, Wi)))
        canvas = canvas * (1 - k[..., None]) + dark * k[..., None]
    # downsample with premultiplied alpha
    pre = (canvas * alpha[..., None]).reshape(H, ss, W, ss, 3).mean(axis=(1, 3))
    a = alpha.reshape(H, ss, W, ss).mean(axis=(1, 3))
    rgb = pre / np.maximum(a, 1e-6)[..., None]
    out = np.dstack([np.clip(rgb * 255, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)
    out[stamp, :3] = stamp_rgb[stamp]
    out[stamp, 3] = 255
    return out


def _n4(mask):
    m = mask.astype(np.int64)
    out = np.zeros_like(m)
    out[1:] += m[:-1]
    out[:-1] += m[1:]
    out[:, 1:] += m[:, :-1]
    out[:, :-1] += m[:, 1:]
    return out


def _n8(mask):
    m = mask.astype(np.int64)
    out = _n4(mask)
    out[1:, 1:] += m[:-1, :-1]
    out[1:, :-1] += m[:-1, 1:]
    out[:-1, 1:] += m[1:, :-1]
    out[:-1, :-1] += m[1:, 1:]
    return out


def _shift(a, dx, dy, fill):
    """res[y, x] = a[y + dy, x + dx] (the neighbour's value), `fill` off the edge."""
    H, W = a.shape
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    res = np.full_like(a, fill)
    res[ys, xs] = a[yd, xd]
    return res


def _effects(img, fx, mats, mat_names, mid, Nn, Hv, seed):
    H, W = img.shape[:2]
    a = img[..., 3] > 0
    if fx.get("glow"):
        g = fx["glow"]
        col = np.array(parse_hex(g.get("color", "#ffd060")), np.uint8)
        r = int(g.get("radius", 2))
        cur = a.copy()
        for k in range(r):
            ring = ~cur & (_n8(cur) > 0)
            al = int(g.get("alpha", 150) * (1 - k / max(r, 1)))
            img[ring, :3] = col
            img[ring, 3] = al
            cur |= ring
    if fx.get("shadow"):  # drop shadow down-right, behind everything
        s = fx["shadow"] if isinstance(fx["shadow"], dict) else {}
        dx, dy = s.get("offset", [1, 1])
        sh = np.zeros_like(a)
        sh[dy:, dx:] = a[:H - dy, :W - dx]
        m = sh & (img[..., 3] == 0)
        img[m] = list(parse_hex(s.get("color", "#000000"))) + [int(s.get("alpha", 90))]
    sp = fx.get("sparkle")
    if sp:
        pts = []
        if sp == "auto":
            # brightest specular pixel of a reflective material, at least 2px inside the silhouette
            refl = np.zeros_like(a)
            for mi, nm in enumerate(mat_names):
                if mats[nm].get("spec"):
                    refl |= mid == mi
            core = a.copy()
            for _ in range(2):
                core &= _n4(core) == 4
            cand = refl & core
            if cand.any():
                score = np.where(cand, Nn @ Hv, -9)
                yy, xx = np.unravel_index(np.argmax(score), score.shape)
                pts = [(xx, yy)]
        else:
            pts = [tuple(p) for p in sp]
        for (xx, yy) in pts:
            for (dx, dy, al) in ((0, 0, 255), (1, 0, 255), (-1, 0, 255), (0, 1, 255), (0, -1, 255),
                                 (2, 0, 140), (-2, 0, 140), (0, 2, 140), (0, -2, 140)):
                x2, y2 = int(xx) + dx, int(yy) + dy
                if 0 <= x2 < W and 0 <= y2 < H:
                    if img[y2, x2, 3] == 0 and al < 255:
                        img[y2, x2] = [255, 255, 240, al]
                    elif img[y2, x2, 3] > 0:
                        img[y2, x2, :3] = [255, 255, 245] if al == 255 else np.maximum(img[y2, x2, :3], 200)
    return img


def upscale(img: Image.Image, k: int, background=None) -> Image.Image:
    big = img.resize((img.width * k, img.height * k), Image.NEAREST)
    if background is None:
        return big
    bg = Image.new("RGBA", big.size, tuple(parse_hex(background)) + (255,))
    bg.alpha_composite(big)
    return bg.convert("RGB")


def sheet(images, cols=6, pad=2, cell=None, background=(0, 0, 0, 0)):
    """Pack sprites into a grid (sprite sheet). Returns (image, [(x, y, w, h)])."""
    cw = cell[0] if cell else max(i.width for i in images)
    ch = cell[1] if cell else max(i.height for i in images)
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (cw + pad) + pad, rows * (ch + pad) + pad), background)
    rects = []
    for k, im in enumerate(images):
        x = pad + (k % cols) * (cw + pad) + (cw - im.width) // 2
        y = pad + (k // cols) * (ch + pad) + (ch - im.height) // 2
        out.alpha_composite(im, (x, y))
        rects.append((x, y, im.width, im.height))
    return out, rects
