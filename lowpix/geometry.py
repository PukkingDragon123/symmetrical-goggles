"""Geometry: shape primitives -> textured faces, and the part hierarchy.

Conventions
-----------
* Y is up, the model faces +Z ("front"), +X is the model's left-hand side as
  seen by a viewer standing in front of it (i.e. screen-right in a front view).
* Every face is painted on its own pixel rectangle. A quad face stores its
  corners in the order TL, TR, BR, BL *as seen from outside* with image-up
  meaning "up" for side faces, "back" (-Z) for top faces and "front" (+Z) for
  bottom faces. Triangles are (TL, BL, BR) + (TL, BR, TR), counter-clockwise
  from outside (glTF front-face convention).
* A part has a pivot (in its parent's frame) and a rotation about that pivot.
  Its geometry is centred at `offset` in the pivot frame.

Shapes: box / taper (optionally chamfered), prism, card, loft (a smooth tube
through control rings - bodies, tails, limbs, domes, horns).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .mathutil import mat4, normalize, rot_matrix, transform_points

# corner sign triples (sx, sy, sz) for TL, TR, BR, BL of each box face
BOX_FACES = {
    "front":  [(-1, 1, 1), (1, 1, 1), (1, -1, 1), (-1, -1, 1)],
    "back":   [(1, 1, -1), (-1, 1, -1), (-1, -1, -1), (1, -1, -1)],
    "right":  [(1, 1, 1), (1, 1, -1), (1, -1, -1), (1, -1, 1)],
    "left":   [(-1, 1, -1), (-1, 1, 1), (-1, -1, 1), (-1, -1, -1)],
    "top":    [(-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)],
    "bottom": [(-1, -1, 1), (1, -1, 1), (1, -1, -1), (-1, -1, -1)],
}
FACE_ORDER = ["front", "back", "right", "left", "top", "bottom"]
QUAD_UV = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]])
QUAD_TRIS = [(0, 3, 2), (0, 2, 1)]
MIRROR = np.diag([-1.0, 1.0, 1.0])


@dataclass
class Face:
    name: str
    kind: str                 # "quad" | "poly"
    pts: np.ndarray           # (n, 3) in the part's (instance) local frame
    uv: np.ndarray            # (n, 2) face-space uv, image convention (0,0)=top-left
    tris: list
    double_sided: bool = False
    W: int = 1
    H: int = 1
    rect: tuple = (0, 0)      # atlas x, y of the painted area (excluding gutter)
    tags: set = field(default_factory=set)     # extra filter tags ("top", "sides", "caps", ...)
    attrs: dict = field(default_factory=dict)  # per-corner attributes, e.g. "path": (n, 2)
    soft: bool = False        # smooth-surface face: no rims/outlines along its edges
    ring: int = -1            # loft: index of the ring this face starts at (chain segmenting)

    def copy(self) -> "Face":
        return Face(self.name, self.kind, self.pts.copy(), self.uv.copy(), list(self.tris),
                    self.double_sided, self.W, self.H, self.rect, set(self.tags),
                    {k: v.copy() for k, v in self.attrs.items()}, self.soft, self.ring)

    @property
    def normal(self) -> np.ndarray:
        p = self.pts
        best = np.zeros(3)
        for a, b, c in self.tris:
            n = np.cross(p[b] - p[a], p[c] - p[a])
            if np.linalg.norm(n) > np.linalg.norm(best):
                best = n
        return normalize(best)

    def area(self) -> float:
        p = self.pts
        return float(sum(0.5 * np.linalg.norm(np.cross(p[b] - p[a], p[c] - p[a])) for a, b, c in self.tris))

    def pixel_size(self, density: float):
        if self.kind == "quad":
            p = self.pts
            w = max(np.linalg.norm(p[1] - p[0]), np.linalg.norm(p[2] - p[3]))
            h = max(np.linalg.norm(p[3] - p[0]), np.linalg.norm(p[2] - p[1]))
        else:
            w, h = self.plane_extent
        return max(1, int(round(w * density))), max(1, int(round(h * density)))

    # -- texel -> position mapping (must agree with how a GPU interpolates uv) --
    def sample(self, s, t, values=None) -> np.ndarray:
        """Face-space (s, t) arrays -> interpolated corner values (positions by default)."""
        v = self.pts if values is None else values
        s = np.asarray(s, dtype=np.float64)[..., None]
        t = np.asarray(t, dtype=np.float64)[..., None]
        if self.kind == "quad":
            TL, TR, BR, BL = v
            lower = TL + t * (BL - TL) + s * (BR - BL)   # triangle TL, BL, BR (t >= s)
            upper = TL + s * (TR - TL) + t * (BR - TR)   # triangle TL, TR, BR (s > t)
            return np.where(t >= s, lower, upper)
        M = np.c_[np.ones(len(self.uv)), self.uv]
        sol, *_ = np.linalg.lstsq(M, v, rcond=None)
        return sol[0] + s * sol[1] + t * sol[2]

    def texel_grid(self, W: int, H: int):
        s = (np.arange(W) + 0.5) / W
        t = (np.arange(H) + 0.5) / H
        return np.meshgrid(s, t)

    def texel_positions(self, W: int, H: int) -> np.ndarray:
        S, T = self.texel_grid(W, H)
        return self.sample(S, T)

    def texel_attr(self, name: str, W: int, H: int):
        if name not in self.attrs:
            return None
        S, T = self.texel_grid(W, H)
        return self.sample(S, T, self.attrs[name])

    @property
    def affine(self):
        """Least-squares affine map P = A + s*U + t*V for planar polygons."""
        M = np.c_[np.ones(len(self.uv)), self.uv]
        sol, *_ = np.linalg.lstsq(M, self.pts, rcond=None)
        return sol[0], sol[1], sol[2]

    @property
    def plane_extent(self):
        _, U, V = self.affine
        return float(np.linalg.norm(U)), float(np.linalg.norm(V))

    def edges(self):
        """Polygon edges as (name, i, j). Quads: top, right, bottom, left."""
        if self.kind == "quad":
            return [("top", 0, 1), ("right", 1, 2), ("bottom", 2, 3), ("left", 3, 0)]
        n = len(self.pts)
        return [(f"e{i}", i, (i + 1) % n) for i in range(n)]

    def mirrored(self) -> "Face":
        """Mirror across X while keeping the painted image un-flipped."""
        f = self.copy()
        f.pts[:, 0] *= -1.0
        if self.kind == "quad":
            order = [1, 0, 3, 2]
            f.pts = f.pts[order]
            f.attrs = {k: v[order] for k, v in f.attrs.items()}
        else:
            n = len(f.pts)
            order = list(range(n))[::-1]
            f.pts = f.pts[order]
            f.uv = f.uv[order]
            f.uv[:, 0] = 1.0 - f.uv[:, 0]
            f.attrs = {k: v[order] for k, v in f.attrs.items()}
            f.tris = [(0, i, i + 1) for i in range(1, n - 1)]
        return f  # names and tags keep their source meaning under mirroring


def _quad(name, corners, outward=None, double_sided=False, attrs=None, tags=None) -> Face | None:
    pts = np.array(corners, dtype=np.float64)
    f = Face(name, "quad", pts, QUAD_UV.copy(), list(QUAD_TRIS), double_sided,
             attrs={k: np.asarray(v, float) for k, v in (attrs or {}).items()}, tags=set(tags or ()))
    n = np.cross(pts[3] - pts[0], pts[2] - pts[0])
    if np.linalg.norm(n) < 1e-9:
        n = np.cross(pts[2] - pts[0], pts[1] - pts[0])
    if np.linalg.norm(n) < 1e-9:
        return None  # degenerate (e.g. the pinched end of a wedge)
    if outward is not None and np.dot(n, outward) < 0:
        order = [1, 0, 3, 2]
        f.pts = pts[order]
        f.attrs = {k: v[order] for k, v in f.attrs.items()}
    # drop zero-area triangles (wedge faces collapse to a triangle)
    keep = []
    for a, b, c in f.tris:
        if np.linalg.norm(np.cross(f.pts[b] - f.pts[a], f.pts[c] - f.pts[a])) > 1e-9:
            keep.append((a, b, c))
    f.tris = keep
    return f if keep else None


def _poly(name, pts, uv, outward, attrs=None, tags=None) -> Face | None:
    pts = np.asarray(pts, float)
    uv = np.asarray(uv, float)
    attrs = {k: np.asarray(v, float) for k, v in (attrs or {}).items()}
    # drop duplicate consecutive points (pinched rings)
    keep = [i for i in range(len(pts)) if np.linalg.norm(pts[i] - pts[i - 1]) > 1e-7]
    if len(keep) < 3:
        return None
    pts, uv = pts[keep], uv[keep]
    attrs = {k: v[keep] for k, v in attrs.items()}
    n = len(pts)
    tris = [(0, i, i + 1) for i in range(1, n - 1)]
    nrm = sum(np.cross(pts[b] - pts[a], pts[c] - pts[a]) for a, b, c in tris)
    if np.linalg.norm(nrm) < 1e-9:
        return None
    if np.dot(nrm, outward) < 0:
        order = list(range(n))[::-1]
        pts, uv = pts[order], uv[order]
        attrs = {k: v[order] for k, v in attrs.items()}
    return Face(name, "poly", pts, uv, tris, attrs=attrs, tags=set(tags or ()))


def _vec(v, n, default):
    if v is None:
        return list(default)
    if isinstance(v, (int, float)):
        return [float(v)] * n
    return [float(x) for x in v]


def _cap_uv(pts2d, viewer_right_sign):
    """Planar cap uv from 2D profile coords (x right, y up as seen from outside)."""
    xs, ys = pts2d[:, 0] * viewer_right_sign, pts2d[:, 1]
    w = max(xs.max() - xs.min(), 1e-6)
    h = max(ys.max() - ys.min(), 1e-6)
    return np.c_[(xs - xs.min()) / w, (ys.max() - ys) / h]


# ---------------------------------------------------------------- profiles
def profile_points(sides: int, roundness: float = 2.0, angle: float = 0.0):
    """Closed cross-section in [-1, 1]^2, flat edge at the bottom (even sides).
    roundness 2 = regular polygon/ellipse; higher = boxier (8 sides + high
    roundness = chamfered box)."""
    n = max(3, int(sides))
    p = max(0.5, float(roundness))
    a0 = math.radians(angle) - math.pi / 2 - math.pi / n
    out = []
    for k in range(n):
        th = a0 + 2 * math.pi * k / n
        c, s = math.cos(th), math.sin(th)
        e = 2.0 / p
        out.append((math.copysign(abs(c) ** e, c), math.copysign(abs(s) ** e, s)))
    pts = np.array(out)
    return pts / _profile_norm(pts)


def _profile_norm(pts):
    m = np.abs(pts).max(axis=0)
    m[m < 1e-9] = 1
    return m


def profile_scale(sides: int, roundness: float = 2.0, angle: float = 0.0):
    """Factor that profile_points divides by (so lofts span exactly their size)."""
    n, p = max(3, int(sides)), max(0.5, float(roundness))
    a0 = math.radians(angle) - math.pi / 2 - math.pi / n
    raw = []
    for k in range(n):
        th = a0 + 2 * math.pi * k / n
        c, s = math.cos(th), math.sin(th)
        raw.append((math.copysign(abs(c) ** (2 / p), c), math.copysign(abs(s) ** (2 / p), s)))
    return _profile_norm(np.array(raw))


def _around_of(x, y):
    return (math.atan2(x, y) / (2 * math.pi)) % 1.0


def _region_tag(around):
    a = around % 1.0
    if a < 0.125 or a >= 0.875:
        return "top"
    if a < 0.375:
        return "right"
    if a < 0.625:
        return "bottom"
    return "left"


def _chamfer_profile(c):
    """Unit-square chamfered profile (c = chamfer as a fraction of the half-size)."""
    c = min(max(c, 0.0), 0.95)
    return np.array([(-1 + c, -1), (1 - c, -1), (1, -1 + c), (1, 1 - c),
                     (1 - c, 1), (-1 + c, 1), (-1, 1 - c), (-1, -1 + c)], float)


CHAMFER_SIDE_NAMES = ["bottom", "bevel_br", "right", "bevel_tr", "top", "bevel_tl", "left", "bevel_bl"]


# ------------------------------------------------------------------- lofts
def _catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def _rotate_to(v, a, b):
    """Rotate vector v by the minimal rotation taking unit a to unit b (Rodrigues)."""
    axis = np.cross(a, b)
    s = np.linalg.norm(axis)
    c = float(np.clip(np.dot(a, b), -1, 1))
    if s < 1e-9:
        return v
    k = axis / s
    return v * c + np.cross(k, v) * s + k * np.dot(k, v) * (1 - c)


def loft_frames(part: dict) -> dict:
    """Subdivided ring centres, sizes and parallel-transport frames of a loft."""
    rings = part.get("rings") or []
    off = np.array(_vec(part.get("offset"), 3, (0, 0, 0)))
    C = np.array([_vec(r.get("at"), 3, (0, 0, 0)) for r in rings], float) + off
    S = np.array([_vec(r.get("size"), 2, (1, 1)) for r in rings], float)
    SH = np.array([_vec(r.get("shift"), 2, (0, 0)) for r in rings], float)
    RO = np.array([float(r.get("roll", 0.0)) for r in rings], float)
    k = int(part.get("subdiv", 1))
    smooth = part.get("smooth", True)
    if k > 0 and len(C) >= 2:
        def sub(A):
            out = []
            n = len(A)
            for i in range(n - 1):
                p0, p1, p2, p3 = A[max(i - 1, 0)], A[i], A[i + 1], A[min(i + 2, n - 1)]
                for j in range(k + 1):
                    t = j / (k + 1)
                    out.append(_catmull(p0, p1, p2, p3, t) if smooth else p1 + (p2 - p1) * t)
            out.append(A[-1])
            return np.array(out)
        C, S, SH = sub(C), np.maximum(sub(S), 0.0), sub(SH)
        RO = sub(RO[:, None])[:, 0]
    m = len(C)
    T = np.zeros((m, 3))
    for i in range(m):
        a, b = C[max(i - 1, 0)], C[min(i + 1, m - 1)]
        d = b - a
        T[i] = d / np.linalg.norm(d) if np.linalg.norm(d) > 1e-9 else (T[i - 1] if i else np.array([0, 0, 1.0]))
    up = normalize(np.array(_vec(part.get("up"), 3, (0, 1, 0))))
    X = np.zeros((m, 3))
    Y = np.zeros((m, 3))
    x0 = np.cross(up, T[0])
    if np.linalg.norm(x0) < 1e-6:
        x0 = np.cross(np.array([0, 0, 1.0]), T[0])
        if np.linalg.norm(x0) < 1e-6:
            x0 = np.array([1.0, 0, 0])
    X[0] = normalize(x0)
    Y[0] = np.cross(T[0], X[0])
    for i in range(1, m):
        X[i] = normalize(_rotate_to(X[i - 1], T[i - 1], T[i]))
        Y[i] = np.cross(T[i], X[i])
    # make `around` 0.25 mean the part's +X side whichever way the path runs
    if np.dot(X[0], [1.0, 0, 0]) < -1e-6:
        X = -X
    Xr, Yr = X.copy(), Y.copy()
    for i in range(m):
        if RO[i]:
            a = math.radians(RO[i])
            Xr[i] = X[i] * math.cos(a) + Y[i] * math.sin(a)
            Yr[i] = -X[i] * math.sin(a) + Y[i] * math.cos(a)
    seg = np.linalg.norm(np.diff(C, axis=0), axis=1) if m > 1 else np.zeros(0)
    L = np.r_[0.0, np.cumsum(seg)]
    prof = part.get("profile", {})
    if isinstance(prof, (int, float)):
        prof = {"sides": prof}
    return {"C": C, "S": S, "SH": SH, "T": T, "X": Xr, "Y": Yr, "L": L,
            "sides": int(prof.get("sides", 8)), "round": float(prof.get("round", 2.0)),
            "angle": float(prof.get("angle", 0.0))}


def loft_point(info: dict, t: float, around: float, offset: float = 0.0):
    """Surface point, outward normal, tangent and ring 'up' at path fraction t
    (0 = first ring, 1 = last) and angle `around` (0 top, .25 +X, .5 bottom, .75 -X)."""
    L = info["L"]
    s = float(np.clip(t, 0, 1)) * L[-1]
    i = int(np.clip(np.searchsorted(L, s, side="right") - 1, 0, len(L) - 2)) if len(L) > 1 else 0
    seg = (L[i + 1] - L[i]) if len(L) > 1 else 1.0
    f = (s - L[i]) / seg if seg > 1e-9 else 0.0
    j = min(i + 1, len(L) - 1)
    lerp = lambda A: A[i] * (1 - f) + A[j] * f  # noqa: E731
    C, Tn = lerp(info["C"]), normalize(lerp(info["T"]))
    X, Y = normalize(lerp(info["X"])), normalize(lerp(info["Y"]))
    w, h = lerp(info["S"]) / 2
    sh = lerp(info["SH"])
    a = 2 * math.pi * around
    dx, dy = math.sin(a), math.cos(a)
    p = info["round"]
    r = (abs(dx) ** p + abs(dy) ** p) ** (-1.0 / p) if (dx or dy) else 0
    m = profile_scale(info["sides"], p, info["angle"])
    x, y = r * dx / m[0], r * dy / m[1]
    nrm = normalize(X * (x / max(w, 1e-6) ** 2 if w > 1e-6 else 0) + Y * (y / max(h, 1e-6) ** 2 if h > 1e-6 else 0))
    if np.linalg.norm(nrm) < 1e-6:
        nrm = Y
    P = C + X * (sh[0] + x * w) + Y * (sh[1] + y * h) + nrm * offset
    return P, nrm, Tn, Y


def _build_loft(part: dict) -> list[Face]:
    info = loft_frames(part)
    C, S, SH, X, Y, T, L = info["C"], info["S"], info["SH"], info["X"], info["Y"], info["T"], info["L"]
    prof = profile_points(info["sides"], info["round"], info["angle"])
    n = len(prof)
    m = len(C)
    hide = set(part.get("hide", []))
    hard = bool(part.get("hard", False))
    R = np.zeros((m, n, 3))
    for i in range(m):
        for k in range(n):
            px, py = prof[k]
            R[i, k] = C[i] + X[i] * (SH[i, 0] + px * S[i, 0] / 2) + Y[i] * (SH[i, 1] + py * S[i, 1] / 2)
    around = np.array([_around_of(px, py) for px, py in prof])
    faces = []
    for i in range(m - 1):
        mid = (C[i] + C[i + 1]) / 2 + (X[i] * SH[i, 0] + Y[i] * SH[i, 1] + X[i + 1] * SH[i + 1, 0] + Y[i + 1] * SH[i + 1, 1]) / 2
        for k in range(n):
            k2 = (k + 1) % n
            a1, a2 = around[k], around[k2]
            if a2 < a1 - 0.5:
                a2 += 1.0
            if a1 < a2 - 0.5:
                a1 += 1.0
            name = f"s{i}_{k}"
            region = _region_tag((a1 + a2) / 2)
            if name in hide:
                continue
            cs = [R[i, k], R[i, k2], R[i + 1, k2], R[i + 1, k]]
            attrs = {"path": [[L[i], a1], [L[i], a2], [L[i + 1], a2], [L[i + 1], a1]]}
            fc = np.mean(cs, axis=0)
            f = _quad(name, cs, fc - mid, attrs=attrs, tags={"sides", region, "flanks" if region in ("left", "right") else region})
            if f is not None:
                f.soft = not hard
                f.ring = i
                faces.append(f)
    caps = part.get("caps", [True, True])
    if isinstance(caps, bool):
        caps = [caps, caps]
    cap_list = [(0, "start", -1, caps[0], 0), (m - 1, "end", 1, caps[1], m - 2)]
    if part.get("chain"):
        # joint caps close the gaps that open when chain segments bend
        step = int(part.get("subdiv", 1)) + 1
        for j in range(1, len(part.get("rings", [])) - 1):
            a = j * step
            cap_list.append((a, f"joint{j}_end", 1, True, a - 1))
            cap_list.append((a, f"joint{j}_start", -1, True, a))
    for idx, name, sgn, on, ring in cap_list:
        if not on or name in hide:
            continue
        pts = R[idx]
        # 2D coords seen from outside: viewer looking back along -sgn*T
        x2 = np.array([np.dot(p - C[idx], X[idx]) for p in pts])
        y2 = np.array([np.dot(p - C[idx], Y[idx]) for p in pts])
        uv = _cap_uv(np.c_[x2, y2], 1 if sgn > 0 else -1)
        attrs = {"path": np.c_[np.full(n, L[idx]), around]}
        f = _poly(name, pts, uv, T[idx] * sgn, attrs=attrs,
                  tags={"caps", "ends"} if not name.startswith("joint") else {"joints"})
        if f is not None:
            f.ring = ring
            faces.append(f)
    return faces


# -------------------------------------------------------------- primitives
def build_shape(part: dict) -> list[Face]:
    """Build faces for a part spec in its pivot frame (unmirrored)."""
    shape = part.get("shape", "box")
    off = np.array(_vec(part.get("offset"), 3, (0, 0, 0)))
    hide = set(part.get("hide", []))
    faces: list[Face] = []

    if shape in ("box", "taper") and part.get("chamfer"):
        size = _vec(part.get("size"), 3, (1, 1, 1))
        a, b, c = size[0] / 2, size[1] / 2, size[2] / 2
        fs = _vec(part.get("front_scale"), 2, (1, 1)) if shape == "taper" else [1, 1]
        bs = _vec(part.get("back_scale"), 2, (1, 1)) if shape == "taper" else [1, 1]
        fsh = _vec(part.get("front_shift"), 2, (0, 0)) if shape == "taper" else [0, 0]
        bsh = _vec(part.get("back_shift"), 2, (0, 0)) if shape == "taper" else [0, 0]
        # keep the chamfer a fixed world size on both axes
        cw = min(float(part["chamfer"]), 0.95 * min(a, b))
        prof = _chamfer_profile(cw / max(min(a, b), 1e-6))
        prof_x = prof.copy()
        for i, (px, py) in enumerate(prof):
            prof_x[i] = (np.sign(px) * (a - cw) if abs(abs(px) - 1) > 1e-9 else np.sign(px) * a,
                         np.sign(py) * (b - cw) if abs(abs(py) - 1) > 1e-9 else np.sign(py) * b)
        ring = lambda z, sc, sh: [off + np.array([px * sc[0] + sh[0], py * sc[1] + sh[1], z]) for px, py in prof_x]  # noqa: E731
        F, B = ring(c, fs, fsh), ring(-c, bs, bsh)
        centre = off + np.array([(fsh[0] + bsh[0]) / 2, (fsh[1] + bsh[1]) / 2, 0])
        for k in range(8):
            name = CHAMFER_SIDE_NAMES[k]
            if name in hide or (name.startswith("bevel") and "bevels" in hide):
                continue
            k2 = (k + 1) % 8
            cs = [F[k], F[k2], B[k2], B[k]]
            fc = np.mean(cs, axis=0)
            # orient the main sides' images exactly like a plain box's faces
            if name == "top":
                cs = [B[k2], B[k], F[k], F[k2]]
            elif name == "bottom":
                cs = [F[k], F[k2], B[k2], B[k]]
            elif name in ("right",):
                cs = [F[k2], B[k2], B[k], F[k]]
            elif name in ("left",):
                cs = [B[k], F[k], F[k2], B[k2]]
            tags = {"bevels"} if name.startswith("bevel") else {"sides"}
            f = _quad(name, cs, fc - np.array([centre[0], centre[1], fc[2]]), tags=tags)
            if f is not None:
                faces.append(f)
        for capname, ring_pts, sgn in (("front", F, 1), ("back", B, -1)):
            if capname in hide:
                continue
            pts = np.array(ring_pts)
            uv = _cap_uv(pts[:, :2], 1 if sgn > 0 else -1)
            f = _poly(capname, pts, uv, np.array([0, 0, sgn], float), tags={"ends"})
            if f is not None:
                faces.append(f)

    elif shape in ("box", "taper"):
        size = _vec(part.get("size"), 3, (1, 1, 1))
        a, b, c = size[0] / 2, size[1] / 2, size[2] / 2
        fs = _vec(part.get("front_scale"), 2, (1, 1))
        bs = _vec(part.get("back_scale"), 2, (1, 1))
        fsh = _vec(part.get("front_shift"), 2, (0, 0))
        bsh = _vec(part.get("back_shift"), 2, (0, 0))
        if shape == "box":
            fs, bs, fsh, bsh = [1, 1], [1, 1], [0, 0], [0, 0]

        def corner(sx, sy, sz):
            sc, sh = (fs, fsh) if sz > 0 else (bs, bsh)
            return np.array([sx * a * sc[0] + sh[0], sy * b * sc[1] + sh[1], sz * c]) + off

        centre = off + np.array([(fsh[0] + bsh[0]) / 2, (fsh[1] + bsh[1]) / 2, 0])
        for name in FACE_ORDER:
            if name in hide:
                continue
            cs = [corner(*sgn) for sgn in BOX_FACES[name]]
            fc = np.mean(cs, axis=0)
            f = _quad(name, cs, fc - centre, tags={"ends"} if name in ("front", "back") else {"sides"} if name in ("left", "right") else set())
            if f is not None:
                faces.append(f)

    elif shape == "prism":
        size = _vec(part.get("size"), 3, (1, 1, 1))
        n = int(part.get("sides", 6))
        rx, ry, L = size[0] / 2, size[1] / 2, size[2] / 2
        fs = _vec(part.get("front_scale"), 2, (1, 1))
        bs = _vec(part.get("back_scale"), 2, (1, 1))
        a0 = math.radians(float(part.get("angle", 0.0))) - math.pi / 2 - math.pi / n
        th = [a0 + 2 * math.pi * k / n for k in range(n)]
        F = [off + np.array([rx * fs[0] * math.cos(t), ry * fs[1] * math.sin(t), L]) for t in th]
        B = [off + np.array([rx * bs[0] * math.cos(t), ry * bs[1] * math.sin(t), -L]) for t in th]
        for k in range(n):
            if f"side{k}" in hide or "sides" in hide:
                continue
            k2 = (k + 1) % n
            cs = [F[k2], F[k], B[k], B[k2]]
            fc = np.mean(cs, axis=0)
            outward = fc - np.array([off[0], off[1], fc[2]])
            f = _quad(f"side{k}", cs, outward, tags={"sides"})
            if f is not None:
                faces.append(f)
        for capname, ring, sgn in (("front", F, 1), ("back", B, -1)):
            if capname in hide:
                continue
            pts = np.array(ring if sgn > 0 else ring[::-1])
            xs, ys = pts[:, 0], pts[:, 1]
            w = max(xs.max() - xs.min(), 1e-6)
            h = max(ys.max() - ys.min(), 1e-6)
            if sgn > 0:
                uv = np.c_[(xs - xs.min()) / w, (ys.max() - ys) / h]
            else:
                uv = np.c_[(xs.max() - xs) / w, (ys.max() - ys) / h]
            tris = [(0, i, i + 1) for i in range(1, len(pts) - 1)]
            faces.append(Face(capname, "poly", pts, uv, tris, tags={"caps", "ends"}))

    elif shape == "loft":
        faces = _build_loft(part)

    elif shape == "card":
        size = part.get("size")
        art = part.get("art")
        density = float(part.get("_density", 2.0))
        if size is None and art:
            size = [len(art[0]) / density, len(art) / density]
        size = _vec(size, 2, (1, 1))
        plane = part.get("plane", "xy")
        w2, h2 = size[0] / 2, size[1] / 2
        if plane == "xy":
            cs = [(-w2, h2, 0), (w2, h2, 0), (w2, -h2, 0), (-w2, -h2, 0)]
            outward = (0, 0, 1)
        elif plane == "xz":
            cs = [(-w2, 0, -h2), (w2, 0, -h2), (w2, 0, h2), (-w2, 0, h2)]
            outward = (0, 1, 0)
        elif plane == "yz":
            cs = [(0, h2, w2), (0, h2, -w2), (0, -h2, -w2), (0, -h2, w2)]
            outward = (1, 0, 0)
        else:
            raise ValueError(f"card plane must be xy|xz|yz, got {plane!r}")
        f = _quad("front", [np.array(c) + off for c in cs], np.array(outward, dtype=float), True)
        if f is not None:
            faces.append(f)
    else:
        raise ValueError(f"unknown shape {shape!r}")
    return faces


@dataclass
class Instance:
    id: str
    src_id: str
    part: dict
    mirrored: bool
    parent: str | None
    local: np.ndarray            # 4x4 pivot frame relative to parent frame
    world: np.ndarray = None     # 4x4
    src_faces: list = field(default_factory=list)   # unmirrored, pivot frame
    faces: list = field(default_factory=list)       # instance (possibly mirrored), pivot frame
    children: list = field(default_factory=list)
    segment: int = -1             # chain lofts: segment index
    frame_offset: np.ndarray = None   # chain segments: segment origin in the part's frame (unmirrored)
    rest_local: np.ndarray = None     # rest pose (animation is applied on top)

    @property
    def pattern_offset(self):
        return self.frame_offset if self.frame_offset is not None else np.zeros(3)

    @property
    def translation(self):
        return self.local[:3, 3]

    @property
    def rotation(self):
        return self.local[:3, :3]


def _attach_frame(parent_part: dict, att: dict, around: float):
    """Pivot position + rotation frame on a loft parent's surface (parent frame)."""
    info = loft_frames(parent_part)
    P, nrm, Tn, Yr = loft_point(info, float(att.get("t", 0.5)), around, float(att.get("offset", 0.0)))
    align = att.get("align", "tangent")
    if align == "none":
        return P, np.eye(3)
    if align == "surface":
        y = nrm
        z = normalize(Tn - y * np.dot(Tn, y))
    else:  # tangent: follow the path, stay upright (parent's +Y)
        z = Tn
        up = np.array([0.0, 1.0, 0.0])
        y = up - z * np.dot(up, z)
        if np.linalg.norm(y) < 1e-6:
            y = Yr
        y = normalize(y)
    x = np.cross(y, z)
    return P, np.c_[x, y, z]


def expand_instances(parts: list[dict], density: float) -> list[Instance]:
    """Resolve parent links + mirror flags into a flat list of instances."""
    by_id = {p["id"]: p for p in parts}
    kids: dict[str | None, list[dict]] = {}
    for p in parts:
        kids.setdefault(p.get("parent"), []).append(p)
    missing = [p["id"] for p in parts if p.get("parent") and p["parent"] not in by_id]
    if missing:
        raise ValueError(f"unknown parent for parts: {missing}")
    out: list[Instance] = []

    def make(part, parent_inst: Instance | None, mirrored: bool):
        pivot = np.array(_vec(part.get("pivot"), 3, (0, 0, 0)))
        rot = np.array(_vec(part.get("rotation"), 3, (0, 0, 0)))
        R_part = rot_matrix(rot)
        att = part.get("attach")
        if att and parent_inst is not None:
            if parent_inst.part.get("shape") != "loft":
                raise ValueError(f"part {part['id']!r}: attach needs a loft parent")
            a = float(att.get("around", 0.0))
            if mirrored and not parent_inst.mirrored:
                # own mirror copy: same relation to the surface, on the reflected side
                P, F = _attach_frame(parent_inst.part, att, (-a) % 1.0)
                local = mat4(F @ (MIRROR @ R_part @ MIRROR), P)
            else:
                P, F = _attach_frame(parent_inst.part, att, a)
                local = mat4(F @ R_part, P)
                if mirrored:
                    S4 = mat4(MIRROR)
                    local = S4 @ local @ S4
        else:
            if mirrored:
                pivot = pivot * np.array([-1, 1, 1])
                rot = rot * np.array([1, -1, -1])
            local = mat4(rot_matrix(rot), pivot)
        if part.get("orient") == "world" and parent_inst is not None:
            # rotation is absolute: cancel the parent's world rotation
            r = rot * (np.array([1, -1, -1]) if (mirrored and att) else 1)
            local[:3, :3] = parent_inst.world[:3, :3].T @ rot_matrix(r)
        if parent_inst is not None and parent_inst.frame_offset is not None:
            # parent is a chain segment: positions were computed in the whole part's frame
            off = parent_inst.frame_offset * (np.array([-1, 1, 1]) if parent_inst.mirrored else 1)
            local[:3, 3] -= off
        if part.get("shape") == "loft" and part.get("chain"):
            make_chain(part, parent_inst, mirrored, local)
            return
        pid = part["id"] + ("_mirror" if mirrored else "")
        inst = Instance(pid, part["id"], part, mirrored, parent_inst.id if parent_inst else None, local)
        inst.world = (parent_inst.world if parent_inst else np.eye(4)) @ local
        src = build_shape(dict(part, _density=density))
        inst.src_faces = src
        inst.faces = [f.mirrored() for f in src] if mirrored else [f.copy() for f in src]
        snap = part.get("snap_ground")
        if snap is not None and snap is not False and inst.faces:
            # move the part vertically (in world) so its lowest point rests on y = snap
            target = 0.02 if snap is True else float(snap)
            low = min(float(transform_points(inst.world, f.pts)[:, 1].min()) for f in inst.faces)
            dy = np.array([0.0, target - low, 0.0])
            pr = parent_inst.world[:3, :3] if parent_inst else np.eye(3)
            inst.local[:3, 3] += pr.T @ dy
            inst.world = (parent_inst.world if parent_inst else np.eye(4)) @ inst.local
        out.append(inst)
        if parent_inst:
            parent_inst.children.append(inst.id)
        for ch in kids.get(part["id"], []):
            if ch.get("mirror") and not mirrored:
                make(ch, inst, False)
                make(ch, inst, True)
            else:
                make(ch, inst, mirrored)

    def make_chain(part, parent_inst, mirrored, local):
        """Split a loft into rigid, individually posable segments (one per control span)."""
        full = build_shape(dict(part, _density=density))
        info = loft_frames(part)
        C, L = info["C"], info["L"]
        step = int(part.get("subdiv", 1)) + 1
        nseg = max(1, len(part.get("rings", [])) - 1)
        seg_of = lambda ring: int(np.clip(ring // step, 0, nseg - 1))  # noqa: E731
        M = np.array([-1, 1, 1]) if mirrored else np.ones(3)
        segs, prev = [], None
        for j in range(nseg):
            cj = C[j * step]
            if j == 0:
                loc = local @ mat4(None, cj * M)
                par = parent_inst
            else:
                loc = mat4(None, (cj - C[(j - 1) * step]) * M)
                par = prev
            sid = f"{part['id']}_{j}" + ("_mirror" if mirrored else "")  # engine-safe (no '.')
            inst = Instance(sid, part["id"], part, mirrored, par.id if par else None, loc)
            inst.world = (par.world if par else np.eye(4)) @ loc
            inst.segment, inst.frame_offset = j, cj.copy()
            inst.src_faces = full
            mine = []
            for f in full:
                if seg_of(f.ring) == j:
                    g = f.copy()
                    g.pts = g.pts - cj
                    mine.append(g.mirrored() if mirrored else g)
            inst.faces = mine
            out.append(inst)
            if par is not None:
                par.children.append(sid)
            segs.append(inst)
            prev = inst
        for ch in kids.get(part["id"], []):
            att = ch.get("attach")
            if att:
                s = float(att.get("t", 0.5)) * L[-1]
                ring = int(np.clip(np.searchsorted(L, s, side="right") - 1, 0, len(L) - 2))
            else:
                pv = np.array(_vec(ch.get("pivot"), 3, (0, 0, 0)))
                ring = int(np.argmin(np.linalg.norm(C - pv, axis=1)))
            target = segs[seg_of(ring)]
            if ch.get("mirror") and not mirrored:
                make(ch, target, False)
                make(ch, target, True)
            else:
                make(ch, target, mirrored)

    for root in kids.get(None, []):
        if root.get("mirror"):
            make(root, None, False)
            make(root, None, True)
        else:
            make(root, None, False)
    for inst in out:
        inst.rest_local = inst.local.copy()
    return out


def world_triangles(instances: list[Instance]):
    """Yield (instance, face, world_pts (n,3))."""
    for inst in instances:
        for f in inst.faces:
            yield inst, f, transform_points(inst.world, f.pts)
