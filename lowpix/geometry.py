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

    def copy(self) -> "Face":
        return Face(self.name, self.kind, self.pts.copy(), self.uv.copy(), list(self.tris),
                    self.double_sided, self.W, self.H, self.rect)

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
    def sample(self, s: np.ndarray, t: np.ndarray) -> np.ndarray:
        """Face-space (s, t) arrays -> local positions (..., 3)."""
        s = np.asarray(s, dtype=np.float64)[..., None]
        t = np.asarray(t, dtype=np.float64)[..., None]
        if self.kind == "quad":
            TL, TR, BR, BL = self.pts
            lower = TL + t * (BL - TL) + s * (BR - BL)   # triangle TL, BL, BR (t >= s)
            upper = TL + s * (TR - TL) + t * (BR - TR)   # triangle TL, TR, BR (s > t)
            return np.where(t >= s, lower, upper)
        A, U, V = self.affine
        return A + s * U + t * V

    def texel_positions(self, W: int, H: int) -> np.ndarray:
        s = (np.arange(W) + 0.5) / W
        t = (np.arange(H) + 0.5) / H
        S, T = np.meshgrid(s, t)
        return self.sample(S, T)

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
        """Quad edges as (name, i, j): top, right, bottom, left."""
        if self.kind != "quad":
            return []
        return [("top", 0, 1), ("right", 1, 2), ("bottom", 2, 3), ("left", 3, 0)]

    def mirrored(self) -> "Face":
        """Mirror across X while keeping the painted image un-flipped."""
        f = self.copy()
        f.pts[:, 0] *= -1.0
        if self.kind == "quad":
            f.pts = f.pts[[1, 0, 3, 2]]
        else:
            n = len(f.pts)
            order = list(range(n))[::-1]
            f.pts = f.pts[order]
            f.uv = f.uv[order]
            f.uv[:, 0] = 1.0 - f.uv[:, 0]
            f.tris = [(0, i, i + 1) for i in range(1, n - 1)]
        return f


def _quad(name, corners, outward=None, double_sided=False) -> Face | None:
    pts = np.array(corners, dtype=np.float64)
    f = Face(name, "quad", pts, QUAD_UV.copy(), list(QUAD_TRIS), double_sided)
    n = np.cross(pts[3] - pts[0], pts[2] - pts[0])
    if np.linalg.norm(n) < 1e-9:
        n = np.cross(pts[2] - pts[0], pts[1] - pts[0])
    if np.linalg.norm(n) < 1e-9:
        return None  # degenerate (e.g. the pinched end of a wedge)
    if outward is not None and np.dot(n, outward) < 0:
        f.pts = pts[[1, 0, 3, 2]]
    # drop zero-area triangles (wedge faces collapse to a triangle)
    keep = []
    for a, b, c in f.tris:
        if np.linalg.norm(np.cross(f.pts[b] - f.pts[a], f.pts[c] - f.pts[a])) > 1e-9:
            keep.append((a, b, c))
    f.tris = keep
    return f if keep else None


def _vec(v, n, default):
    if v is None:
        return list(default)
    if isinstance(v, (int, float)):
        return [float(v)] * n
    return [float(x) for x in v]


def build_shape(part: dict) -> list[Face]:
    """Build faces for a part spec in its pivot frame (unmirrored)."""
    shape = part.get("shape", "box")
    off = np.array(_vec(part.get("offset"), 3, (0, 0, 0)))
    hide = set(part.get("hide", []))
    faces: list[Face] = []

    if shape in ("box", "taper"):
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
            f = _quad(name, cs, fc - centre)
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
            f = _quad(f"side{k}", cs, outward)
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
            faces.append(Face(capname, "poly", pts, uv, tris))

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

    @property
    def translation(self):
        return self.local[:3, 3]

    @property
    def rotation(self):
        return self.local[:3, :3]


def expand_instances(parts: list[dict], density: float) -> list[Instance]:
    """Resolve parent links + mirror flags into a flat list of instances."""
    by_id = {p["id"]: p for p in parts}
    kids: dict[str | None, list[dict]] = {}
    for p in parts:
        kids.setdefault(p.get("parent"), []).append(p)
    out: list[Instance] = []

    def make(part, parent_inst: Instance | None, mirrored: bool):
        pivot = np.array(_vec(part.get("pivot"), 3, (0, 0, 0)))
        rot = np.array(_vec(part.get("rotation"), 3, (0, 0, 0)))
        if mirrored:
            pivot = pivot * np.array([-1, 1, 1])
            rot = rot * np.array([1, -1, -1])
        R = rot_matrix(rot)
        if part.get("orient") == "world" and parent_inst is not None:
            # rotation is absolute: cancel the parent's world rotation
            R = parent_inst.world[:3, :3].T @ R
        local = mat4(R, pivot)
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

    for root in kids.get(None, []):
        if root.get("mirror"):
            make(root, None, False)
            make(root, None, True)
        else:
            make(root, None, False)
    missing = [p["id"] for p in parts if p.get("parent") and p["parent"] not in by_id]
    if missing:
        raise ValueError(f"unknown parent for parts: {missing}")
    return out


def world_triangles(instances: list[Instance]):
    """Yield (instance, face, world_pts (n,3))."""
    for inst in instances:
        for f in inst.faces:
            yield inst, f, transform_points(inst.world, f.pts)
