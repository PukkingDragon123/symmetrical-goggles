"""Convert a detailed textured model (glTF/GLB/OBJ, e.g. a CC0 Poly Haven asset)
into the lowpix look: low-poly geometry with a hand-painted pixel-art texture.

    python -m lowpix convert model.glb -o out/rat --tris 900 --height 24
    python -m lowpix convert polyhaven:street_rat -o out/rat
    python -m lowpix polyhaven rat            # search Poly Haven (CC0) models

Pipeline
  1. load meshes + base-colour textures (all nodes, world transforms baked)
  2. normalise: scale to `height` units, centre on x/z, stand on y = 0
  3. bake colour: dense area-weighted surface samples -> a voxel colour field
  4. decimate: vertex clustering, binary-searched to the triangle target
  5. palette: k-means the colours into material groups, one hue-shifted ramp each
  6. paint every texel at a uniform density: ramp from its baked colour, tone
     from the colour's lightness plus painted light, lit rims and dark outlines on
     creases, quantised to the palette - the same unlit pixel style as hand specs
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


def _load_image(data: bytes):
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if max(im.size) > 1024:  # plenty for pixel art, keeps memory low
        im.thumbnail((1024, 1024), Image.LANCZOS)
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
def _srgb_to_lab(rgb):
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def surface_samples(mesh: MeshData, n: int, seed: int = 0):
    V, F = mesh.V, mesh.F
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    rng = np.random.default_rng(seed)
    tri = rng.choice(len(F), size=n, p=area / area.sum())
    r1, r2 = rng.random(n), rng.random(n)
    s = np.sqrt(r1)
    w0, w1, w2 = 1 - s, s * (1 - r2), s * r2
    P = w0[:, None] * a[tri] + w1[:, None] * b[tri] + w2[:, None] * c[tri]
    UV = (w0[:, None] * mesh.UV[F[tri, 0]] + w1[:, None] * mesh.UV[F[tri, 1]] + w2[:, None] * mesh.UV[F[tri, 2]])
    col = np.zeros((n, 3))
    mats = mesh.M[tri]
    for mi, (tex, fac) in enumerate(mesh.materials):
        sel = mats == mi
        if not sel.any():
            continue
        if tex is None:
            col[sel] = fac
        else:
            th, tw = tex.shape[:2]
            u = np.mod(UV[sel, 0], 1.0) * (tw - 1)
            v = np.mod(UV[sel, 1], 1.0) * (th - 1)
            col[sel] = tex[v.round().astype(int), u.round().astype(int)] * fac
    return P, np.clip(col, 0, 1)


def cluster_decimate(V, F, target: int):
    """Vertex-clustering simplification, binary-searched to ~target triangles."""
    lo, hi = V.min(0), V.max(0)
    diag = float(np.linalg.norm(hi - lo))

    def run(cell):
        k = np.floor((V - lo) / cell).astype(np.int64)
        key = (k[:, 0] * 1_000_003 + k[:, 1]) * 1_000_033 + k[:, 2]
        _, inv = np.unique(key, return_inverse=True)
        m = inv.max() + 1
        cnt = np.bincount(inv, minlength=m)
        rep = np.stack([np.bincount(inv, V[:, d], m) / cnt for d in range(3)], 1)
        G = inv[F]
        ok = (G[:, 0] != G[:, 1]) & (G[:, 1] != G[:, 2]) & (G[:, 0] != G[:, 2])
        G = G[ok]
        _, first = np.unique(np.sort(G, axis=1), axis=0, return_index=True)
        G = G[np.sort(first)]
        used = np.unique(G)
        remap = -np.ones(m, np.int64)
        remap[used] = np.arange(len(used))
        return rep[used], remap[G]

    if len(F) <= target:
        return run(diag * 1e-6)
    a, b = diag / 2000.0, diag / 3.0
    best = run(b)
    for _ in range(18):
        mid = math.sqrt(a * b)
        Vr, Fr = run(mid)
        if len(Fr) > target:
            a = mid
        else:
            b = mid
            best = (Vr, Fr)
    return best


class ColorField:
    """Voxel-averaged colour cloud with nearest-occupied-cell lookup."""

    def __init__(self, P, C, cell):
        self.cell = cell
        self.lo = P.min(0) - cell
        k = np.floor((P - self.lo) / cell).astype(np.int64)
        key = self._key(k)
        uk, inv = np.unique(key, return_inverse=True)
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
        offs = [(dx, dy, dz) for dx in range(-max_r, max_r + 1) for dy in range(-max_r, max_r + 1)
                for dz in range(-max_r, max_r + 1)]
        offs.sort(key=lambda o: o[0] ** 2 + o[1] ** 2 + o[2] ** 2)
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


# --------------------------------------------------------------------- core
def convert(src: str, tris: int = 900, height: float = 24.0, density: float = 2.0, ramps: int = 6,
            steps: int = 6, light: float = 1.0, detail: float = 0.7, crease: float = 60.0,
            outline: bool = True, dither: float = 0.0, yaw: float = 0.0, name: str | None = None,
            background: str = "#1d2230", hue_shift: float = 20.0, work_dir: str | None = None,
            smooth: float = 2.5, merge: float = 14.0, grain: float = 0.45, outline_angle: float = 80.0):
    """Detailed model -> lowpix Model (geometry + painted atlas), ready for export."""
    from .model import Model

    if src.startswith("polyhaven:"):
        asset = src.split(":", 1)[1]
        src = polyhaven_fetch(asset, os.path.join(work_dir or "out/_downloads", asset))
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

    # bake colour from the detailed surface
    area = 0.5 * np.linalg.norm(np.cross(mesh.V[mesh.F[:, 1]] - mesh.V[mesh.F[:, 0]],
                                         mesh.V[mesh.F[:, 2]] - mesh.V[mesh.F[:, 0]]), axis=1).sum()
    n = int(np.clip(area * (density * 2.5) ** 2, 60_000, 600_000))
    P, C = surface_samples(mesh, n)
    texel = 1.0 / density
    field = ColorField(P, C, texel * max(smooth, 1.0))   # low-pass: colour clusters, not fur noise

    # geometry
    V, F = cluster_decimate(mesh.V, mesh.F, tris)
    if len(F) == 0:
        raise ValueError("decimation removed everything - raise --tris")
    # clustering pulls extremes inward: re-fit the low-poly mesh to the exact height / ground,
    # and remember the mapping so colour is still baked from the matching source position
    dlo, dhi = V.min(0), V.max(0)
    q_off = np.array([(dlo[0] + dhi[0]) / 2, dlo[1], (dlo[2] + dhi[2]) / 2])
    q_scale = height / max(dhi[1] - dlo[1], 1e-9)
    V = (V - q_off) * q_scale

    # palette: group colours into material ramps (by hue/chroma, lightness down-weighted)
    lab = _srgb_to_lab(C)
    feat = lab * np.array([0.35, 1.0, 1.0])
    sub = feat[np.random.default_rng(1).choice(len(feat), size=min(20000, len(feat)), replace=False)]
    k = max(1, min(ramps, len(np.unique(np.round(sub, 0), axis=0))))
    cent, lab_sub = kmeans(sub, k)
    # merge material groups that are nearly the same colour (one ramp per real material)
    groups = list(range(len(cent)))
    for i in range(len(cent)):
        for j in range(i):
            if np.linalg.norm(cent[i] - cent[j]) < merge:
                gi, gj = groups[i], groups[j]
                groups = [gj if g == gi else g for g in groups]
    keep = sorted(set(groups))
    cent = np.array([cent[[i for i, g in enumerate(groups) if g == u]].mean(0) for u in keep])
    k = len(cent)
    ramp_cols, Lmid, Lspread = {}, [], []
    lab_all = np.argmin(((feat[:, None, :] - cent[None]) ** 2).sum(-1), axis=1)
    for j in range(k):
        m = lab_all == j
        Ls = lab[m, 0] if m.any() else np.array([50.0])
        med = C[m][np.argsort(Ls)[len(Ls) // 2]] if m.any() else C.mean(0)
        ramp_cols[f"m{j}"] = make_ramp(to_hex(med * 255), steps, hue_shift, 0.12, 0.85)
        Lmid.append(float(np.median(Ls)))
        Lspread.append(float(max(np.percentile(Ls, 90) - np.percentile(Ls, 10), 8.0)))
    pal = Palette(ramp_cols)

    # faces: one textured triangle face each, painted on its own pixel rectangle
    faces = []
    nrm = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    nl = np.linalg.norm(nrm, axis=1)
    good = nl > 1e-9
    F, nrm = F[good], nrm[good] / nl[good, None]
    vn = np.zeros_like(V)
    area_n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for c in range(3):
        np.add.at(vn, F[:, c], area_n)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    for fi, f in enumerate(F):
        p = V[f]
        U = normalize(p[1] - p[0])
        Vb = np.cross(nrm[fi], U)
        x = (p - p[0]) @ U
        y = (p - p[0]) @ Vb
        w, h = max(x.max() - x.min(), 1e-6), max(y.max() - y.min(), 1e-6)
        uv = np.c_[(x - x.min()) / w, (y.max() - y) / h]
        # smooth normals for painted light, unless the corner sits on a hard crease
        cn = np.array([vn[v] if np.dot(vn[v], nrm[fi]) > 0.5 else nrm[fi] for v in f])
        face = Face(f"t{fi}", "poly", p.copy(), uv, [(0, 1, 2)], double_sided=True, attrs={"n": cn})
        face.soft = True
        faces.append(face)

    # creases: edges whose neighbouring faces bend sharply (or open boundaries)
    edge_faces = {}
    for fi, f in enumerate(F):
        for e in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])):
            edge_faces.setdefault(tuple(sorted(e)), []).append(fi)
    cos_c = math.cos(math.radians(crease))
    cos_o = math.cos(math.radians(outline_angle))
    crease_of, hard_of = {}, {}
    for e, fl in edge_faces.items():
        if len(fl) != 2:
            crease_of[e] = hard_of[e] = True
        else:
            d = float(np.dot(nrm[fl[0]], nrm[fl[1]]))
            crease_of[e], hard_of[e] = d < cos_c, d < cos_o

    for face in faces:
        face.W, face.H = face.pixel_size(density)
    AW, AH, pos = shelf_pack([(f.W, f.H) for f in faces], gutter=1)
    atlas = np.zeros((AH, AW, 4), np.uint8)
    L = normalize(np.array([-0.5, 1.0, 0.6]))
    yspan = max(V[:, 1].max(), 1e-6)
    inst = Instance("mesh", "mesh", {"id": "mesh", "shape": "mesh"}, False, None, np.eye(4))
    inst.world = np.eye(4)
    inst.rest_local = np.eye(4)
    inst.faces = faces
    inst.src_faces = faces
    cent_lab = cent / np.array([0.35, 1.0, 1.0])
    for fi, (face, (px0, py0)) in enumerate(zip(faces, pos)):
        face.rect = (px0, py0)
        W, H = face.W, face.H
        S, T = face.texel_grid(W, H)
        Pt = face.sample(S, T)
        col = field((Pt / q_scale + q_off).reshape(-1, 3)).reshape(H, W, 3)
        lab_t = _srgb_to_lab(col)
        ft = lab_t * np.array([0.35, 1.0, 1.0])
        rid = np.argmin(((ft[..., None, :] - (cent_lab * np.array([0.35, 1.0, 1.0]))[None, None]) ** 2).sum(-1), axis=-1)
        mid = (steps - 1) / 2.0
        rel = np.clip((lab_t[..., 0] - np.array(Lmid)[rid]) / np.array(Lspread)[rid], -1.0, 1.0)
        tone = mid + detail * rel * (steps - 1) * 0.45
        Nt = face.sample(S, T, face.attrs["n"])
        Nt /= np.maximum(np.linalg.norm(Nt, axis=-1, keepdims=True), 1e-12)
        ndl = Nt @ L
        tone += light * 1.25 * ndl
        tone += 0.5 * np.clip(Pt[..., 1] / 3.0 - 1.0, -1.0, 0.0)          # painted ground occlusion
        if grain:  # clustered hand-painted variation (2-4 px blobs), breaks up flat bands
            tone += grain * (fbm(Pt, density / 1.6, 2, 7) - 0.5) * 2
        tone += 0.25 * (Pt[..., 1] / yspan - 0.5)                         # top-lit gradient
        # rims & outlines on crease edges (pixel distance to each triangle edge)
        f = F[fi]
        ex = [(f[0], f[1]), (f[1], f[2]), (f[2], f[0])]
        cpos = face.pts.mean(0)
        dark = np.zeros((H, W), bool)
        for ei, (a, b) in enumerate(ex):
            if not crease_of[tuple(sorted((a, b)))]:
                continue
            pa, pb = face.pts[ei], face.pts[(ei + 1) % 3]
            e = pb - pa
            d = np.linalg.norm(np.cross(e, Pt - pa), axis=-1) / max(np.linalg.norm(e), 1e-9) * density
            mvec = (pa + pb) / 2 - cpos
            mvec = mvec - e * np.dot(mvec, e) / max(np.dot(e, e), 1e-12)
            sdot = float(np.dot(normalize(mvec), L))
            near = d < 1.0
            if sdot > 0.2:
                tone[near] += 1.0
            elif outline and sdot < 0.05 and hard_of[tuple(sorted((a, b)))]:
                dark |= near
            else:
                tone[near] -= 0.8
        thr = (1 - dither) * 0.5 + dither * BAYER4[np.arange(H)[:, None] % 4, np.arange(W)[None] % 4]
        # fills never use the darkest step: pixel artists keep it for outlines and deep creases
        idx = np.clip(np.floor(tone + thr).astype(int), 1, pal.lengths[rid] - 1)
        idx[dark] = 0
        rgb = pal.table[rid, idx]
        x, y = face.rect
        atlas[y:y + H, x:x + W, :3] = rgb
        atlas[y:y + H, x:x + W, 3] = 255
        atlas[y - 1, x:x + W] = atlas[y, x:x + W]
        atlas[y + H, x:x + W] = atlas[y + H - 1, x:x + W]
        atlas[y - 1:y + H + 1, x - 1] = atlas[y - 1:y + H + 1, x]
        atlas[y - 1:y + H + 1, x + W] = atlas[y - 1:y + H + 1, x + W - 1]

    spec = {"name": name, "density": density, "palette": {"ramps": pal.as_hex()},
            "render": {"background": background, "hero": [35, 22], "shadow": 0.45},
            "description": f"Converted with lowpix from {os.path.basename(src)}",
            "convert": {"source": os.path.basename(src), "tris": tris, "height": height, "density": density,
                        "ramps": ramps, "steps": steps, "light": light, "detail": detail, "crease": crease,
                        "outline": outline, "dither": dither, "yaw": yaw, "source_triangles": int(len(mesh.F))}}
    return Model(spec, pal, [inst], atlas, density)
