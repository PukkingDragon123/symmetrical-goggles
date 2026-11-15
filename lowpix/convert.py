"""Convert a detailed textured model (glTF/GLB/OBJ, e.g. a CC0 Poly Haven asset)
into the lowpix look: low-poly geometry with a hand-painted pixel-art texture.

    python -m lowpix convert model.glb -o out/rat --tris 900 --height 24
    python -m lowpix convert polyhaven:street_rat -o out/rat
    python -m lowpix polyhaven rat            # search Poly Haven (CC0) models

Styles (`style=`): "pixel" (default, chunky unlit pixel art), "pixel-hd"
(high-resolution pixel art), "painted" (smooth hand-painted, unlit) and
"realistic" (high-res source texture, lit PBR material, smooth normals - a
game-ready LOD). Every option can be overridden.

Pipeline
  1. load meshes + base-colour textures (all nodes, world transforms baked), weld
  2. normalise: scale to `height` units, centre on x/z, stand on y = 0
  3. decimate: vertex clustering with quadric-optimal cluster positions
     (feature-preserving, no shrinkage), binary-searched to the triangle target
  4. unwrap: grow near-planar charts over the low-poly mesh and pack them, so
     texels run seamlessly across neighbouring faces
  5. transfer: every texel finds the closest point on the detailed surface and
     samples its texture (exact UV lookup, bilinear); voxel colour field fallback
  6. shade per style: palette ramps + painted light/rims/outlines (pixel),
     posterised painterly light (painted), or the untouched colour (realistic)
"""
from __future__ import annotations

import base64
import io
import json
import math
import os
import ssl
import struct
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

from .geometry import Face, Instance
from .mathutil import normalize
from .noise import BAYER4, fbm
from .pack import shelf_pack
from .palette import Palette, make_ramp, to_hex

UA = {"User-Agent": "lowpix-converter/0.1"}


# ------------------------------------------------------------------ loading
class MeshData:
    def __init__(self):
        self.V, self.UV, self.F, self.M = [], [], [], []   # positions, uvs, tris, material per tri
        self.materials = []                                 # (texture float array or None, factor rgb)

    def add(self, V, UV, F, mat):
        base = sum(len(v) for v in self.V)
        self.V.append(np.asarray(V, float))
        self.UV.append(np.asarray(UV, float) if UV is not None else np.zeros((len(V), 2)))
        self.F.append(np.asarray(F, np.int64) + base)
        self.M.append(np.full(len(F), mat, np.int64))

    def finish(self):
        if not self.V:
            raise ValueError("no triangles found in the model")
        self.V, self.UV = np.concatenate(self.V), np.concatenate(self.UV)
        self.F, self.M = np.concatenate(self.F), np.concatenate(self.M)
        return self


def _quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def _node_matrix(n):
    if "matrix" in n:
        return np.array(n["matrix"], float).reshape(4, 4).T
    M = np.eye(4)
    R = _quat_mat(n.get("rotation", [0, 0, 0, 1]))
    S = np.diag(n.get("scale", [1, 1, 1]))
    M[:3, :3] = R @ S
    M[:3, 3] = n.get("translation", [0, 0, 0])
    return M


_CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


MAX_TEXTURE = 1024  # convert() raises this for high-resolution styles


def _load_image(data: bytes):
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if max(im.size) > MAX_TEXTURE:
        im.thumbnail((MAX_TEXTURE, MAX_TEXTURE), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255.0


def load_gltf(path: str) -> MeshData:
    base = os.path.dirname(os.path.abspath(path))
    raw = open(path, "rb").read()
    bin_chunk = None
    if raw[:4] == b"glTF":
        jl = struct.unpack_from("<I", raw, 12)[0]
        js = json.loads(raw[20:20 + jl])
        off = 20 + jl
        if off + 8 <= len(raw):
            bl = struct.unpack_from("<I", raw, off)[0]
            bin_chunk = raw[off + 8: off + 8 + bl]
    else:
        js = json.loads(raw)

    def uri_bytes(uri):
        if uri.startswith("data:"):
            return base64.b64decode(uri.split(",", 1)[1])
        return open(os.path.join(base, urllib.parse.unquote(uri)), "rb").read()

    buffers = [bin_chunk if "uri" not in b else uri_bytes(b["uri"]) for b in js.get("buffers", [])]

    def accessor(i):
        a = js["accessors"][i]
        n = _NC[a["type"]]
        dt = np.dtype(_CT[a["componentType"]])
        out = np.zeros((a["count"], n), dt)
        if "bufferView" in a:
            bv = js["bufferViews"][a["bufferView"]]
            buf = buffers[bv["buffer"]]
            start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
            stride = bv.get("byteStride", 0) or n * dt.itemsize
            if stride == n * dt.itemsize:
                out = np.frombuffer(buf, dt, a["count"] * n, start).reshape(-1, n)
            else:
                rows = np.frombuffer(buf, np.uint8, stride * (a["count"] - 1) + n * dt.itemsize, start)
                out = np.lib.stride_tricks.as_strided(rows, (a["count"], n * dt.itemsize), (stride, 1))
                out = np.ascontiguousarray(out).view(dt).reshape(-1, n)
        out = out.astype(np.float64)
        if a.get("normalized") and dt.kind in "iu":
            out /= float(np.iinfo(dt).max)
        return out

    images = {}

    def image(i):
        if i not in images:
            im = js["images"][i]
            if "uri" in im:
                data = uri_bytes(im["uri"])
            else:
                bv = js["bufferViews"][im["bufferView"]]
                data = buffers[bv["buffer"]][bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
            try:
                images[i] = _load_image(data)
            except Exception:
                images[i] = None
        return images[i]

    mats = []
    for m in js.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        fac = np.array(pbr.get("baseColorFactor", [1, 1, 1, 1])[:3], float)
        tex = None
        if "baseColorTexture" in pbr:
            t = js["textures"][pbr["baseColorTexture"]["index"]]
            if "source" in t:
                tex = image(t["source"])
        mats.append((tex, fac))
    mesh = MeshData()
    mesh.materials = mats + [(None, np.array([0.8, 0.8, 0.8]))]
    default_mat = len(mats)

    def walk(ni, parent):
        n = js["nodes"][ni]
        W = parent @ _node_matrix(n)
        if "mesh" in n:
            for p in js["meshes"][n["mesh"]]["primitives"]:
                if p.get("mode", 4) != 4 or "POSITION" not in p["attributes"]:
                    continue
                P = accessor(p["attributes"]["POSITION"])[:, :3]
                P = P @ W[:3, :3].T + W[:3, 3]
                UV = accessor(p["attributes"]["TEXCOORD_0"])[:, :2] if "TEXCOORD_0" in p["attributes"] else None
                idx = accessor(p["indices"])[:, 0].astype(np.int64) if "indices" in p else np.arange(len(P))
                F = idx[: len(idx) // 3 * 3].reshape(-1, 3)
                if np.linalg.det(W[:3, :3]) < 0:
                    F = F[:, ::-1]
                mesh.add(P, UV, F, p.get("material", default_mat))
        for c in n.get("children", []):
            walk(c, W)

    scene = js.get("scenes", [{}])[js.get("scene", 0)] if js.get("scenes") else {"nodes": list(range(len(js.get("nodes", []))))}
    for r in scene.get("nodes", []):
        walk(r, np.eye(4))
    return mesh.finish()


def load_obj(path: str) -> MeshData:
    base = os.path.dirname(os.path.abspath(path))
    V, VT = [], []
    mats, cur = {}, None
    faces = []  # (vi, ti, mat)
    for line in open(path, encoding="utf-8", errors="ignore"):
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            V.append([float(x) for x in p[1:4]])
        elif p[0] == "vt":
            VT.append([float(x) for x in p[1:3]])
        elif p[0] == "usemtl":
            cur = p[1]
        elif p[0] == "mtllib":
            mp = os.path.join(base, " ".join(p[1:]))
            if os.path.exists(mp):
                name = None
                for ml in open(mp, encoding="utf-8", errors="ignore"):
                    q = ml.split()
                    if not q:
                        continue
                    if q[0] == "newmtl":
                        name = q[1]
                        mats[name] = [None, np.array([0.8, 0.8, 0.8])]
                    elif q[0] == "Kd" and name:
                        mats[name][1] = np.array([float(x) for x in q[1:4]])
                    elif q[0] == "map_Kd" and name:
                        tp = os.path.join(base, q[-1])
                        if os.path.exists(tp):
                            mats[name][0] = _load_image(open(tp, "rb").read())
        elif p[0] == "f":
            vs = []
            for tok in p[1:]:
                s = tok.split("/")
                vi = int(s[0])
                ti = int(s[1]) if len(s) > 1 and s[1] else 0
                vs.append((vi - 1 if vi > 0 else len(V) + vi, (ti - 1 if ti > 0 else len(VT) + ti) if ti else -1))
            for k in range(1, len(vs) - 1):
                faces.append((vs[0], vs[k], vs[k + 1], cur))
    names = list(mats)
    mesh = MeshData()
    mesh.materials = [tuple(mats[n]) for n in names] + [(None, np.array([0.8, 0.8, 0.8]))]
    Vn = np.array(V, float)
    VTn = np.array(VT, float) if VT else np.zeros((1, 2))
    P, UV, F, M = [], [], [], []
    for a, b, c, m in faces:
        base_i = len(P)
        for vi, ti in (a, b, c):
            P.append(Vn[vi])
            UV.append(VTn[ti] if ti >= 0 else [0, 0])
        F.append([base_i, base_i + 1, base_i + 2])
        M.append(names.index(m) if m in mats else len(names))
    if not F:
        raise ValueError("no faces in OBJ")
    mesh.V, mesh.UV, mesh.F, mesh.M = np.array(P), np.array(UV), np.array(F, np.int64), np.array(M, np.int64)
    # OBJ uv origin is bottom-left; glTF/our sampler is top-left
    mesh.UV[:, 1] = 1.0 - mesh.UV[:, 1]
    return mesh


def load_model(path: str) -> MeshData:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        return load_gltf(path)
    if ext == ".obj":
        return load_obj(path)
    raise ValueError(f"unsupported model format {ext!r} (use .glb, .gltf or .obj)")


# --------------------------------------------------------------- poly haven
def _open(url):
    req = urllib.request.Request(url, headers=UA)
    ca = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
    ctx = ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()
    return urllib.request.urlopen(req, context=ctx, timeout=60)


def polyhaven_search(query: str = "", limit: int = 30):
    """CC0 models on Poly Haven whose id, name, tags or categories match `query`."""
    data = json.load(_open("https://api.polyhaven.com/assets?type=models"))
    import re
    q = query.lower().split()
    hits = []
    for k, v in data.items():
        words = set(re.split(r"[^a-z0-9]+", " ".join([k, v.get("name", "")] + v.get("tags", []) + v.get("categories", [])).lower()))
        if all(any(w == t or (len(w) > 3 and t.startswith(w)) for t in words) for w in q):
            hits.append((k, v.get("name", k), v.get("download_count", 0)))
    hits.sort(key=lambda h: -h[2])
    return hits[:limit]


def polyhaven_fetch(asset: str, dest: str, res: str = "1k") -> str:
    """Download a Poly Haven model's glTF (+ bin + textures). Returns the .gltf path."""
    files = json.load(_open(f"https://api.polyhaven.com/files/{asset}"))
    g = files.get("gltf") or {}
    if not g:
        raise ValueError(f"Poly Haven asset {asset!r} has no glTF download")
    r = res if res in g else sorted(g, key=lambda s: int("".join(c for c in s if c.isdigit()) or 0))[0]
    entry = g[r]["gltf"]
    os.makedirs(dest, exist_ok=True)
    main = os.path.join(dest, os.path.basename(urllib.parse.urlparse(entry["url"]).path))
    with open(main, "wb") as fh:
        fh.write(_open(entry["url"]).read())
    for rel, inc in entry.get("include", {}).items():
        p = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as fh:
            fh.write(_open(inc["url"]).read())
    return main


# -------------------------------------------------------------- processing
STYLES = {
    "pixel": dict(tris=900, density=2.0, atlas=None, ramps=6, steps=6, light=1.0, detail=0.5, smooth=2.5,
                  grain=0.45, crease=60.0, outline=False, dither=0.0, mode="palette", spread=0.5, unlit=True, filter="nearest",
                  chart_angle=45.0, gutter=1),
    "pixel-hd": dict(tris=3000, density=6.0, atlas=None, ramps=8, steps=9, light=1.0, detail=0.9, smooth=1.2,
                     grain=0.3, crease=60.0, outline=False, dither=0.0, mode="palette", spread=0.55, unlit=True, filter="nearest",
                     chart_angle=40.0, gutter=1),
    "painted": dict(tris=6000, density=None, atlas=1024, light=0.8, detail=1.0, smooth=0.0, grain=0.2,
                    crease=55.0, outline=False, mode="painted", posterize=9, saturation=1.15, unlit=True,
                    filter="linear", chart_angle=40.0, gutter=2, ramps=6, steps=6, dither=0.0),
    "realistic": dict(tris=20000, density=None, atlas=1024, light=0.0, detail=1.0, smooth=0.0, grain=0.0,
                      crease=0.0, outline=False, mode="source", unlit=False, filter="linear", chart_angle=45.0,
                      gutter=2, ramps=6, steps=6, dither=0.0),
}


def _srgb_to_lab(rgb):
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def _lab_to_srgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    Mi = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    c = np.clip(xyz @ Mi.T, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def weld(V, F, tol=1e-6):
    """Merge coincident vertices (glTF splits them at UV seams) so adjacency is real."""
    diag = float(np.linalg.norm(V.max(0) - V.min(0))) or 1.0
    q = np.round(V / (diag * tol)).astype(np.int64)
    _, idx, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    return V[idx], inv.reshape(-1)[F]


def surface_samples(mesh: MeshData, n: int, seed: int = 0):
    V, F = mesh.V, mesh.F
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    rng = np.random.default_rng(seed)
    tri = rng.choice(len(F), size=n, p=area / area.sum())
    r1, r2 = rng.random(n), rng.random(n)
    s = np.sqrt(r1)
    w = np.stack([1 - s, s * (1 - r2), s * r2], 1)
    P = w[:, :1] * a[tri] + w[:, 1:2] * b[tri] + w[:, 2:] * c[tri]
    return P, _shade_source(mesh, tri, w)


def _bilinear(tex, uv):
    th, tw = tex.shape[:2]
    x = np.mod(uv[:, 0], 1.0) * tw - 0.5
    y = np.mod(uv[:, 1], 1.0) * th - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    x0m, x1m = np.mod(x0, tw), np.mod(x0 + 1, tw)
    y0m, y1m = np.mod(y0, th), np.mod(y0 + 1, th)
    return ((tex[y0m, x0m] * (1 - fx) + tex[y0m, x1m] * fx) * (1 - fy)
            + (tex[y1m, x0m] * (1 - fx) + tex[y1m, x1m] * fx) * fy)


def _shade_source(mesh, tri, w):
    """Source colour at barycentric points `w` of source triangles `tri`."""
    F = mesh.F
    uv = (w[:, :1] * mesh.UV[F[tri, 0]] + w[:, 1:2] * mesh.UV[F[tri, 1]] + w[:, 2:] * mesh.UV[F[tri, 2]])
    col = np.zeros((len(tri), 3))
    mats = mesh.M[tri]
    for mi, (tex, fac) in enumerate(mesh.materials):
        sel = mats == mi
        if not sel.any():
            continue
        col[sel] = fac if tex is None else _bilinear(tex, uv[sel]) * fac
    return np.clip(col, 0, 1)


def _quadric_reps(V, F, inv, m, cnt):
    """Cluster representatives that minimise the summed plane distance of their
    source vertices (Lindstrom's out-of-core simplification): keeps creases/silhouettes."""
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, c - a)
    area = np.linalg.norm(n, axis=1)
    nn = n / np.maximum(area, 1e-12)[:, None]
    d = -(nn * a).sum(1)
    A = np.zeros((len(V), 3, 3))
    B = np.zeros((len(V), 3))
    outer = nn[:, :, None] * nn[:, None, :] * area[:, None, None]
    nd = nn * (d * area)[:, None]
    for k in range(3):
        np.add.at(A, F[:, k], outer)
        np.add.at(B, F[:, k], nd)
    Ac = np.zeros((m, 3, 3))
    Bc = np.zeros((m, 3))
    np.add.at(Ac, inv, A)
    np.add.at(Bc, inv, B)
    mean = np.stack([np.bincount(inv, V[:, k], m) / cnt for k in range(3)], 1)
    lam = 1e-3 * np.maximum(np.trace(Ac, axis1=1, axis2=2), 1e-12)[:, None, None]
    rhs = -Bc + lam[:, :, 0] * mean
    x = np.linalg.solve(Ac + lam * np.eye(3), rhs[:, :, None])[:, :, 0]
    return x, mean


def cluster_decimate(V, F, target: int):
    """Feature-preserving vertex clustering, binary-searched to ~target triangles."""
    lo, hi = V.min(0), V.max(0)
    diag = float(np.linalg.norm(hi - lo))

    def run(cell):
        k = np.floor((V - lo) / cell).astype(np.int64)
        key = (k[:, 0] * 1_000_003 + k[:, 1]) * 1_000_033 + k[:, 2]
        _, inv = np.unique(key, return_inverse=True)
        inv = inv.reshape(-1)
        m = inv.max() + 1
        cnt = np.bincount(inv, minlength=m).astype(float)
        G = inv[F]
        ok = (G[:, 0] != G[:, 1]) & (G[:, 1] != G[:, 2]) & (G[:, 0] != G[:, 2])
        G = G[ok]
        _, first = np.unique(np.sort(G, axis=1), axis=0, return_index=True)
        G = G[np.sort(first)]
        return G, inv, m, cnt, cell

    if len(F) <= target:
        return V.copy(), F.copy()
    a, b = diag / 4000.0, diag / 3.0
    best = run(b)
    for _ in range(20):
        mid = math.sqrt(a * b)
        r = run(mid)
        if len(r[0]) > target:
            a = mid
        else:
            b = mid
            best = r
    G, inv, m, cnt, cell = best
    rep, mean = _quadric_reps(V, F, inv, m, cnt)
    # keep each representative inside (a margin around) its own cluster cell
    off = np.linalg.norm(rep - mean, axis=1)
    rep = np.where((off > cell)[:, None], mean, rep)
    used = np.unique(G)
    remap = -np.ones(m, np.int64)
    remap[used] = np.arange(len(used))
    return rep[used], remap[G]


class ColorField:
    """Voxel-averaged colour cloud with nearest-occupied-cell lookup."""

    def __init__(self, P, C, cell):
        self.cell = cell
        self.lo = P.min(0) - cell
        k = np.floor((P - self.lo) / cell).astype(np.int64)
        uk, inv = np.unique(self._key(k), return_inverse=True)
        inv = inv.reshape(-1)
        cnt = np.bincount(inv)
        self.keys = uk
        self.col = np.stack([np.bincount(inv, C[:, d]) / cnt for d in range(3)], 1)
        self.fallback = C.mean(0)

    @staticmethod
    def _key(k):
        return (k[:, 0] * 2_000_003 + k[:, 1]) * 2_000_029 + k[:, 2]

    def __call__(self, Q, max_r=6):
        k0 = np.floor((Q - self.lo) / self.cell).astype(np.int64)
        out = np.tile(self.fallback, (len(Q), 1))
        todo = np.ones(len(Q), bool)
        offs = sorted(((dx, dy, dz) for dx in range(-max_r, max_r + 1) for dy in range(-max_r, max_r + 1)
                       for dz in range(-max_r, max_r + 1)), key=lambda o: o[0] ** 2 + o[1] ** 2 + o[2] ** 2)
        for o in offs:
            if not todo.any():
                break
            idx = np.nonzero(todo)[0]
            key = self._key(k0[idx] + np.array(o))
            pos = np.clip(np.searchsorted(self.keys, key), 0, len(self.keys) - 1)
            hit = self.keys[pos] == key
            out[idx[hit]] = self.col[pos[hit]]
            todo[idx[hit]] = False
        return out


def _tri_data(V, F):
    A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    ab, ac = B - A, C - A
    n = np.cross(ab, ac)
    d00, d01, d11 = (ab * ab).sum(1), (ab * ac).sum(1), (ac * ac).sum(1)
    return {"A": A, "B": B, "C": C, "ab": ab, "ac": ac, "n": n, "nn": np.maximum((n * n).sum(1), 1e-20),
            "d00": d00, "d01": d01, "d11": d11, "den": np.maximum(d00 * d11 - d01 * d01, 1e-20)}


def _closest_on_tris(P, td, tri):
    """Exact closest point on triangles `tri` (pairwise with P). Returns (dist2, barycentrics)."""
    A, B, C, ab, ac, n = td["A"][tri], td["B"][tri], td["C"][tri], td["ab"][tri], td["ac"][tri], td["n"][tri]
    Pp = P - (np.einsum("ij,ij->i", P - A, n) / td["nn"][tri])[:, None] * n
    v2 = Pp - A
    d00, d01, d11 = td["d00"][tri], td["d01"][tri], td["d11"][tri]
    d20, d21 = np.einsum("ij,ij->i", v2, ab), np.einsum("ij,ij->i", v2, ac)
    den = td["den"][tri]
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    u = 1 - v - w
    bary = np.stack([u, v, w], 1)
    dP = P - Pp
    best_d = np.where((u >= 0) & (v >= 0) & (w >= 0), np.einsum("ij,ij->i", dP, dP), np.inf)
    for (X, Y, ix, iy) in ((A, B, 0, 1), (B, C, 1, 2), (C, A, 2, 0)):
        e = Y - X
        t = np.clip(np.einsum("ij,ij->i", P - X, e) / np.maximum(np.einsum("ij,ij->i", e, e), 1e-20), 0, 1)
        dq = P - (X + t[:, None] * e)
        d = np.einsum("ij,ij->i", dq, dq)
        better = d < best_d
        if better.any():
            bb = np.zeros((better.sum(), 3))
            bb[:, ix] = 1 - t[better]
            bb[:, iy] = t[better]
            bary[better] = bb
            best_d = np.where(better, d, best_d)
    return best_d, bary


class SurfaceSampler:
    """Closest-point colour transfer from the detailed surface (uniform-grid broad phase)."""

    def __init__(self, mesh: MeshData, cell: float, reach: float | None = None):
        self.mesh = mesh
        V, F = mesh.V, mesh.F
        self.h = cell
        self.reach = cell * 0.5 if reach is None else reach   # triangles within `reach` of a query are found
        self.td = _tri_data(V, F)
        self.lo = V.min(0) - 2 * cell
        tmin = np.minimum(np.minimum(V[F[:, 0]], V[F[:, 1]]), V[F[:, 2]]) - self.reach
        tmax = np.maximum(np.maximum(V[F[:, 0]], V[F[:, 1]]), V[F[:, 2]]) + self.reach
        c0 = np.floor((tmin - self.lo) / cell).astype(np.int64)
        c1 = np.floor((tmax - self.lo) / cell).astype(np.int64)
        span = c1 - c0 + 1
        keys, tris = [], []
        S = int(min(span.max(), 4))
        small = (span <= S).all(1)
        for dx in range(S):
            for dy in range(S):
                for dz in range(S):
                    m = small & (dx < span[:, 0]) & (dy < span[:, 1]) & (dz < span[:, 2])
                    if m.any():
                        keys.append(self._key(c0[m] + np.array([dx, dy, dz])))
                        tris.append(np.nonzero(m)[0])
        for t in np.nonzero(~small)[0]:  # the few large triangles: every cell they touch
            g = np.stack(np.meshgrid(*[np.arange(c0[t, a], c1[t, a] + 1) for a in range(3)], indexing="ij"), -1).reshape(-1, 3)
            keys.append(self._key(g))
            tris.append(np.full(len(g), t))
        keys, tris = np.concatenate(keys), np.concatenate(tris)
        order = np.argsort(keys, kind="stable")
        keys, self.tris = keys[order], tris[order]
        self.ukeys, self.start, self.count = np.unique(keys, return_index=True, return_counts=True)

    @staticmethod
    def _key(k):
        return (k[:, 0] * 2_000_003 + k[:, 1]) * 2_000_029 + k[:, 2]

    def __call__(self, Q, chunk=20000):
        """-> (colours (n,3), found mask)."""
        mesh = self.mesh
        V, F = mesh.V, mesh.F
        out = np.zeros((len(Q), 3))
        found = np.zeros(len(Q), bool)
        for s in range(0, len(Q), chunk):
            q = Q[s:s + chunk]
            key = self._key(np.floor((q - self.lo) / self.h).astype(np.int64))
            pos = np.clip(np.searchsorted(self.ukeys, key), 0, len(self.ukeys) - 1)
            hit = self.ukeys[pos] == key
            qi = np.nonzero(hit)[0]
            if not len(qi):
                continue
            st, ct = self.start[pos[qi]], self.count[pos[qi]]
            qid = np.repeat(qi, ct)
            idx = np.repeat(st - np.cumsum(np.r_[0, ct[:-1]]), ct) + np.arange(ct.sum())
            tri = self.tris[idx]
            d2, bary = _closest_on_tris(q[qid], self.td, tri)
            order = np.lexsort((d2, qid))
            qid_s = qid[order]
            first = np.r_[True, qid_s[1:] != qid_s[:-1]]
            pick = order[first]
            ok = d2[pick] <= self.reach ** 2
            pick, qsel = pick[ok], qid[pick][ok]
            out[s + qsel] = _shade_source(mesh, tri[pick], bary[pick])
            found[s + qsel] = True
        return out, found


def kmeans(X, k, iters=25, seed=0):
    rng = np.random.default_rng(seed)
    C = [X[rng.integers(len(X))]]
    for _ in range(1, k):  # k-means++
        d = np.min(((X[:, None, :] - np.array(C)[None]) ** 2).sum(-1), axis=1)
        C.append(X[rng.choice(len(X), p=d / d.sum())] if d.sum() > 0 else X[rng.integers(len(X))])
    C = np.array(C)
    for _ in range(iters):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        for j in range(k):
            if (lab == j).any():
                C[j] = X[lab == j].mean(0)
    return C, lab


# ------------------------------------------------------------------- charts
def build_charts(V, F, fn, fa, angle_deg: float, max_area: float):
    """Greedy region growing over the low-poly mesh: near-planar charts."""
    edge_faces = {}
    for fi, f in enumerate(F):
        for e in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            edge_faces.setdefault((min(e), max(e)), []).append(fi)
    nbr = [[] for _ in range(len(F))]
    for fl in edge_faces.values():
        for i in fl:
            for j in fl:
                if i != j:
                    nbr[i].append(j)
    cos_t = math.cos(math.radians(angle_deg))
    chart = -np.ones(len(F), np.int64)
    charts = []
    for seed in np.argsort(-fa):
        if chart[seed] >= 0:
            continue
        cid = len(charts)
        N = fn[seed]
        members, area, stack = [seed], fa[seed], [seed]
        chart[seed] = cid
        while stack:
            f = stack.pop()
            for g in nbr[f]:
                if chart[g] < 0 and float(np.dot(fn[g], N)) > cos_t and area + fa[g] <= max_area:
                    chart[g] = cid
                    members.append(g)
                    area += fa[g]
                    stack.append(g)
        charts.append(members)
    return charts, chart, edge_faces


def _chart_face(V, F, vf, members, density, name, fnr, fn):
    """Flatten one chart onto its average plane -> a textured Face (kind 'mesh')."""
    Fm = F[members]
    idx, inv = np.unique(Fm.reshape(-1), return_inverse=True)
    pts = V[idx]
    tris = [tuple(t) for t in inv.reshape(-1, 3).tolist()]
    N = normalize(fnr[members].sum(0))
    # angle-limited smooth normals: only faces facing roughly the chart's way contribute,
    # so collapsed thin parts (tails, ears) don't cancel front against back
    vn = np.zeros((len(idx), 3))
    for i, v in enumerate(idx):
        g = vf[v]
        ok = fn[g] @ N > 0.5
        vn[i] = fnr[g[ok]].sum(0) if ok.any() else N
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    up = np.array([0.0, 1.0, 0.0]) if abs(N[1]) < 0.9 else np.array([0.0, 0.0, -1.0])
    Vax = normalize(up - N * np.dot(up, N))   # image-up follows world-up (pixel-art convention)
    U = np.cross(Vax, N)
    x, y = (pts - pts[0]) @ U, (pts - pts[0]) @ Vax
    W = max(1, int(math.ceil((x.max() - x.min()) * density)))
    H = max(1, int(math.ceil((y.max() - y.min()) * density)))
    uv = np.c_[(x - x.min()) * density / W, (y.max() - y) * density / H]
    face = Face(name, "mesh", pts, uv, tris, double_sided=True, attrs={"n": vn})
    face.W, face.H = W, H
    face.soft = True
    face._chart = (idx, U, Vax, N, x.min(), y.max(), x, y)
    return face


def _chart_texels(face, density):
    """Per-texel 3D position, normal and owning triangle for a chart face."""
    idx, U, Vax, N, x0, y1, x, y = face._chart
    W, H = face.W, face.H
    cx = x0 + (np.arange(W) + 0.5) / density
    cy = y1 - (np.arange(H) + 0.5) / density
    X, Y = np.meshgrid(cx, cy)
    X, Y = X.reshape(-1), Y.reshape(-1)
    T = np.array(face.tris)
    ax, ay = x[T[:, 0]], y[T[:, 0]]
    bx, by = x[T[:, 1]], y[T[:, 1]]
    qx, qy = x[T[:, 2]], y[T[:, 2]]
    den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
    den = np.where(np.abs(den) < 1e-12, 1e-12, den)
    w0 = ((by - qy)[None] * (X[:, None] - qx[None]) + (qx - bx)[None] * (Y[:, None] - qy[None])) / den[None]
    w1 = ((qy - ay)[None] * (X[:, None] - qx[None]) + (ax - qx)[None] * (Y[:, None] - qy[None])) / den[None]
    w2 = 1 - w0 - w1
    score = np.minimum(np.minimum(w0, w1), w2)
    best = np.argmax(score, axis=1)
    r = np.arange(len(X))
    w = np.stack([w0[r, best], w1[r, best], w2[r, best]], 1)
    w = np.clip(w, 0, None)
    w /= np.maximum(w.sum(1, keepdims=True), 1e-12)
    tri = T[best]
    P = (w[:, :1] * face.pts[tri[:, 0]] + w[:, 1:2] * face.pts[tri[:, 1]] + w[:, 2:] * face.pts[tri[:, 2]])
    n = face.attrs["n"]
    Nn = w[:, :1] * n[tri[:, 0]] + w[:, 1:2] * n[tri[:, 1]] + w[:, 2:] * n[tri[:, 2]]
    Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-12)
    return P.reshape(H, W, 3), Nn.reshape(H, W, 3), (X.reshape(H, W), Y.reshape(H, W))


# --------------------------------------------------------------------- core
def convert(src: str, style: str = "pixel", height: float = 24.0, yaw: float = 0.0, name: str | None = None,
            background: str = "#1d2230", hue_shift: float = 20.0, work_dir: str | None = None, **overrides):
    """Detailed model -> lowpix Model (geometry + painted atlas), ready for export.
    `style` picks a preset from STYLES; any preset key can be overridden by keyword
    (tris, density, atlas, ramps, steps, light, detail, smooth, grain, crease, outline,
    dither, posterize, saturation, chart_angle, ...)."""
    from .model import Model
    global MAX_TEXTURE

    if style not in STYLES:
        raise ValueError(f"unknown style {style!r} (choose from {sorted(STYLES)})")
    o = dict(STYLES[style])
    o.update({k: v for k, v in overrides.items() if v is not None})
    MAX_TEXTURE = 2048 if o["mode"] != "palette" else 1024

    if src.startswith("polyhaven:"):
        asset = src.split(":", 1)[1]
        src = polyhaven_fetch(asset, os.path.join(work_dir or "out/_downloads", asset),
                              res="2k" if o["mode"] != "palette" else "1k")
        name = name or asset.replace("_", " ").title()
    mesh = load_model(src)
    name = name or os.path.splitext(os.path.basename(src))[0].replace("_", " ").title()

    # normalise: yaw, scale to height, centre, stand on the ground
    if yaw:
        a = math.radians(yaw)
        R = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        mesh.V = mesh.V @ R.T
    lo, hi = mesh.V.min(0), mesh.V.max(0)
    s = height / max(hi[1] - lo[1], 1e-9)
    mesh.V = (mesh.V - np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])) * s

    # geometry: weld, decimate, re-fit to the exact height / ground
    Vw, Fw = weld(mesh.V, mesh.F)
    V, F = cluster_decimate(Vw, Fw, int(o["tris"])) if o["tris"] and o["tris"] < len(Fw) else (Vw, Fw)
    if len(F) == 0:
        raise ValueError("decimation removed everything - raise tris")
    dlo, dhi = V.min(0), V.max(0)
    q_off = np.array([(dlo[0] + dhi[0]) / 2, dlo[1], (dlo[2] + dhi[2]) / 2])
    q_scale = height / max(dhi[1] - dlo[1], 1e-9)
    V = (V - q_off) * q_scale

    fnr = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    fa = 0.5 * np.linalg.norm(fnr, axis=1)
    keep = fa > 1e-10
    F, fnr, fa = F[keep], fnr[keep], fa[keep]
    fn = fnr / (2 * fa[:, None])
    order = np.argsort(F.reshape(-1), kind="stable")
    owner = np.repeat(np.arange(len(F)), 3)[order]
    starts = np.searchsorted(F.reshape(-1)[order], np.arange(len(V) + 1))
    vf = [owner[starts[v]:starts[v + 1]] for v in range(len(V))]   # faces around each vertex

    # texel density: fixed (pixel styles) or fitted to an atlas budget (HD styles)
    total_area = float(fa.sum())
    density = o["density"] or math.sqrt(0.5 * o["atlas"] ** 2 / max(total_area, 1e-9))
    max_side = 96 if o["mode"] == "palette" else 160
    charts, chart_of, edge_faces = build_charts(V, F, fn, fa, o["chart_angle"], (max_side / density) ** 2 * 0.5)
    gutter = int(o["gutter"])
    for _ in range(12):
        faces = [_chart_face(V, F, vf, members, density, f"c{ci}", fnr, fn) for ci, members in enumerate(charts)]
        AW, AH, pos = shelf_pack([(f.W, f.H) for f in faces], gutter=gutter)
        if not o["atlas"] or max(AW, AH) <= o["atlas"]:
            break
        density *= 0.9
    for face, p in zip(faces, pos):
        face.rect = p

    # colour transfer from the detailed surface
    texel = 1.0 / density
    area_src = float(0.5 * np.linalg.norm(np.cross(mesh.V[mesh.F[:, 1]] - mesh.V[mesh.F[:, 0]],
                                                   mesh.V[mesh.F[:, 2]] - mesh.V[mesh.F[:, 0]]), axis=1).sum())
    nsamp = int(np.clip(area_src * (density * 1.5) ** 2, 60_000, 800_000))
    Ps, Cs = surface_samples(mesh, nsamp)
    smooth = float(o.get("smooth") or 0)
    field = ColorField(Ps, Cs, texel * max(smooth, 1.0))
    sampler = None
    if smooth < 1.5:
        e = mesh.V[mesh.F[:, 1]] - mesh.V[mesh.F[:, 0]]
        edge = float(np.median(np.linalg.norm(e, axis=1)))
        dev = height / 150.0  # typical low-poly deviation from the source surface
        sampler = SurfaceSampler(mesh, cell=max(2.0 * edge, 2.0 * dev, texel), reach=max(edge, dev, texel))
    texels = [_chart_texels(f, density) for f in faces]
    Qall = np.concatenate([(t[0] / q_scale + q_off).reshape(-1, 3) for t in texels])
    if sampler is not None:
        Call, ok = sampler(Qall)
        if not ok.all():
            Call[~ok] = field(Qall[~ok])
    else:
        Call = field(Qall)
    splits = np.cumsum([f.W * f.H for f in faces])[:-1]
    cols = np.split(Call, splits)

    # palette (pixel styles): material groups -> hue-shifted ramps
    lab_s = _srgb_to_lab(Cs)
    feat_w = np.array([0.35, 1.0, 1.0])
    if o["mode"] == "palette":
        feat = lab_s * feat_w
        sub = feat[np.random.default_rng(1).choice(len(feat), size=min(20000, len(feat)), replace=False)]
        k = max(1, min(int(o["ramps"]), len(np.unique(np.round(sub, 0), axis=0))))
        cent, _ = kmeans(sub, k)
        groups = list(range(len(cent)))
        for i in range(len(cent)):
            for j in range(i):
                if np.linalg.norm(cent[i] - cent[j]) < 14.0:
                    gi, gj = groups[i], groups[j]
                    groups = [gj if g == gi else g for g in groups]
        cent = np.array([cent[[i for i, g in enumerate(groups) if g == u]].mean(0) for u in sorted(set(groups))])
        lab_all = np.argmin(((feat[:, None, :] - cent[None]) ** 2).sum(-1), axis=1)
        ramp_cols, Lmid, Lspread = {}, [], []
        for j in range(len(cent)):
            m = lab_all == j
            Ls = lab_s[m, 0] if m.any() else np.array([50.0])
            med = Cs[m][np.argsort(Ls)[len(Ls) // 2]] if m.any() else Cs.mean(0)
            ramp_cols[f"m{j}"] = make_ramp(to_hex(med * 255), int(o["steps"]), hue_shift, 0.12, float(o.get("spread", 0.5)))
            Lmid.append(float(np.median(Ls)))
            Lspread.append(float(max(np.percentile(Ls, 90) - np.percentile(Ls, 10), 8.0)))
        pal = Palette(ramp_cols)
        Lmid, Lspread = np.array(Lmid), np.array(Lspread)
    else:
        pal = None

    # crease flags on low-poly edges
    cos_c = math.cos(math.radians(o["crease"])) if o["crease"] else -2.0
    cos_o = math.cos(math.radians(80.0))
    crease_of, hard_of = {}, {}
    for e, fl in edge_faces.items():
        if len(fl) != 2:
            crease_of[e] = hard_of[e] = True
        else:
            d = float(np.dot(fn[fl[0]], fn[fl[1]]))
            crease_of[e], hard_of[e] = d < cos_c, d < cos_o

    AW, AH = max(f.rect[0] + f.W for f in faces) + gutter, max(f.rect[1] + f.H for f in faces) + gutter
    AW, AH = 1 << (AW - 1).bit_length(), 1 << (AH - 1).bit_length()
    atlas = np.zeros((AH, AW, 4), np.uint8)
    L = normalize(np.array([-0.5, 1.0, 0.6]))
    yspan = max(V[:, 1].max(), 1e-6)
    steps = int(o["steps"])
    for ci, face in enumerate(faces):
        W, H = face.W, face.H
        Pt, Nt, (X2, Y2) = texels[ci]
        col = cols[ci].reshape(H, W, 3)
        ndl = Nt @ L

        # boundary crease edges of this chart: distance (px) + whether they face the light
        rim = np.zeros((H, W))
        dark = np.zeros((H, W), bool)
        if o["mode"] != "source":
            idx, U, Vax, N, x0, y1, xs, ys = face._chart
            gi = {g: i for i, g in enumerate(idx)}
            mine = set(charts[ci])
            cpos = face.pts.mean(0)
            for fi in charts[ci]:
                f = F[fi]
                for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
                    e = (min(a, b), max(a, b))
                    others = [g for g in edge_faces[e] if g != fi]
                    if others and all(g in mine for g in others):
                        continue
                    if not crease_of[e]:
                        continue
                    pa, pb = np.array([xs[gi[a]], ys[gi[a]]]), np.array([xs[gi[b]], ys[gi[b]]])
                    ev = pb - pa
                    t = np.clip(((X2 - pa[0]) * ev[0] + (Y2 - pa[1]) * ev[1]) / max(ev @ ev, 1e-12), 0, 1)
                    dist = np.hypot(X2 - (pa[0] + t * ev[0]), Y2 - (pa[1] + t * ev[1])) * density
                    near = dist < (1.0 if o["mode"] == "palette" else 1.6)
                    mid3 = (V[a] + V[b]) / 2 - cpos
                    e3 = V[b] - V[a]
                    mid3 = mid3 - e3 * np.dot(mid3, e3) / max(np.dot(e3, e3), 1e-12)
                    sdot = float(np.dot(normalize(mid3), L))
                    if sdot > 0.2:
                        rim[near] = np.maximum(rim[near], 1.0)
                    elif o["outline"] and sdot < 0.05 and hard_of[e]:
                        dark |= near
                    else:
                        rim[near] = np.minimum(rim[near], -0.8)

        if o["mode"] == "palette":
            lab_t = _srgb_to_lab(col)
            rid = np.argmin(((lab_t[..., None, :] * feat_w - cent[None, None]) ** 2).sum(-1), axis=-1)
            mid = (steps - 1) / 2.0
            rel = np.clip((lab_t[..., 0] - Lmid[rid]) / Lspread[rid], -1.0, 1.0)
            tone = mid + o["detail"] * rel * (steps - 1) * 0.45
            tone += o["light"] * 1.0 * ndl * (steps / 6.0)
            tone += 0.5 * np.clip(Pt[..., 1] / 3.0 - 1.0, -1.0, 0.0)
            if o["grain"]:
                tone += o["grain"] * (fbm(Pt, density / 1.6, 2, 7) - 0.5) * 2
            tone += rim * (steps / 6.0)
            thr = (1 - o["dither"]) * 0.5 + o["dither"] * BAYER4[np.arange(H)[:, None] % 4, np.arange(W)[None] % 4]
            idx_t = np.clip(np.floor(tone + thr).astype(int), 1, pal.lengths[rid] - 1)
            idx_t[dark] = 0
            rgb = pal.table[rid, idx_t]
        elif o["mode"] == "painted":
            lab_t = _srgb_to_lab(col)
            Lv = lab_t[..., 0]
            Lv = Lv * o["detail"] + np.mean(Lv) * (1 - o["detail"])
            Lv = Lv + o["light"] * 16.0 * ndl + 7.0 * rim
            Lv += 0.5 * 12 * np.clip(Pt[..., 1] / 3.0 - 1.0, -1.0, 0.0)
            if o["grain"]:
                Lv += o["grain"] * 10 * (fbm(Pt, density / 3.0, 3, 7) - 0.5) * 2
            step = 100.0 / max(int(o["posterize"]), 2)
            Lv = np.round(Lv / step) * step  # painterly value bands
            ab = lab_t[..., 1:] * o["saturation"]
            shade = np.clip(-ndl, 0, 1)[..., None]
            ab = ab + shade * np.array([4.0, -10.0])  # cool shadows
            ab = ab + np.clip(ndl, 0, 1)[..., None] * np.array([1.0, 5.0])  # warm lights
            rgb = (_lab_to_srgb(np.dstack([np.clip(Lv, 2, 99), ab])) * 255).round().astype(np.uint8)
        else:  # source: untouched colour, lighting comes from the engine
            rgb = (np.clip(col, 0, 1) * 255).round().astype(np.uint8)

        x, y = face.rect
        atlas[y:y + H, x:x + W, :3] = rgb
        atlas[y:y + H, x:x + W, 3] = 255
        for g in range(1, gutter + 1):  # extend edge texels into the gutter
            atlas[y - g, x:x + W] = atlas[y, x:x + W]
            atlas[y + H - 1 + g, x:x + W] = atlas[y + H - 1, x:x + W]
            atlas[y - gutter:y + H + gutter, x - g] = atlas[y - gutter:y + H + gutter, x]
            atlas[y - gutter:y + H + gutter, x + W - 1 + g] = atlas[y - gutter:y + H + gutter, x + W - 1]

    if pal is None:  # HD styles: a small descriptive palette for the report/viewer
        lab_t = _srgb_to_lab(atlas[..., :3][atlas[..., 3] > 0].reshape(-1, 3) / 255.0)
        sub = lab_t[np.random.default_rng(0).choice(len(lab_t), size=min(6000, len(lab_t)), replace=False)]
        cent2, _ = kmeans(sub * feat_w, min(5, len(sub)))
        ramps = {}
        for j, c in enumerate(cent2 / feat_w):
            base = _lab_to_srgb(c[None])[0] * 255
            ramps[f"m{j}"] = make_ramp(to_hex(base), 5, hue_shift, 0.1, 0.8)
        pal = Palette(ramps)

    inst = Instance("mesh", "mesh", {"id": "mesh", "shape": "mesh"}, False, None, np.eye(4))
    inst.world = np.eye(4)
    inst.rest_local = np.eye(4)
    inst.faces = faces
    inst.src_faces = faces
    spec = {"name": name, "density": round(density, 3), "palette": {"ramps": pal.as_hex()},
            "render": {"background": background, "hero": [35, 22], "shadow": 0.45},
            "material": {"unlit": bool(o["unlit"]), "filter": o["filter"]},
            "description": f"Converted with lowpix ({style}) from {os.path.basename(src)}",
            "convert": {"source": os.path.basename(src), "style": style, "height": height, "yaw": yaw,
                        "source_triangles": int(len(mesh.F)), "charts": len(faces),
                        **{k: (v if not isinstance(v, np.generic) else v.item()) for k, v in o.items()}}}
    return Model(spec, pal, [inst], atlas, density)
