"""Photo-bashing: pull real photo textures (CC0, Poly Haven or your own files) and stylise them.

    photo = load_photo("polyhaven:rock_wall_08")            # or "path/to/photo.jpg"
    tex = stylise(photo, "pixel", size=64, colours=14)     # -> tileable PIL image

Styles (see STYLES):
* realistic: the photo, tiled and lit by its own normal and AO maps (stock-photo look).
* painted: repainted with brush strokes that follow the photo's structure, plus a
  light posterise and saturation lift (a hand-painted texture).
* pixel-hd: downsampled, relit, quantised onto hue-shifted ramps extracted from the photo,
  laid as brush strokes (high-res pixel art).
* pixel: the same at chunky sizes (16 to 64 px), with fewer colours and a stronger relight.

Photos also feed the painters directly: the 3D paint op `{"op": "photo", "src": ...}` and the
sprite material key `"photo"` both read the same loader (see docs/PHOTOBASH.md).
Only use photos you have the rights to. Poly Haven assets are CC0.
"""
from __future__ import annotations

import colorsys
import json
import math
import os

import numpy as np
from PIL import Image

from . import brush
from .palette import make_ramp, parse_hex, to_hex

STYLES = {
    "realistic": dict(relight=0.6, posterize=0, saturation=1.0),
    "painted": dict(relight=0.8, posterize=10, saturation=1.15, length=0.035, width=0.012),
    "pixel-hd": dict(relight=1.0, colours=18, families=3, length=0.05, rough=0.35, simplify=[1], contrast=1.0, spread=0.7, relief=0.45),
    "pixel": dict(relight=1.2, colours=10, families=2, length=0.07, rough=0.25, simplify=[2], contrast=0.5, spread=0.6, relief=0.6),
}
MAPS = {"diff": "Diffuse", "nor": "nor_gl", "ao": "AO", "disp": "Displacement"}
_CACHE = {}


def cache_dir():
    d = os.environ.get("LOWPIX_CACHE") or os.path.join(os.path.expanduser("~"), ".cache", "lowpix")
    os.makedirs(os.path.join(d, "photos"), exist_ok=True)
    return os.path.join(d, "photos")


# ----------------------------------------------------------------- sources
def photo_search(query: str = "", limit: int = 30):
    """CC0 photo textures on Poly Haven whose id, name, tags or categories match `query`."""
    import re
    from .convert import _open
    data = json.load(_open("https://api.polyhaven.com/assets?type=textures"))
    q = query.lower().split()
    hits = []
    for k, v in data.items():
        words = set(re.split(r"[^a-z0-9]+", " ".join([k, v.get("name", "")] + v.get("tags", []) + v.get("categories", [])).lower()))
        if all(any(w == t or (len(w) > 3 and t.startswith(w)) for t in words) for w in q):
            hits.append((k, v.get("name", k), v.get("download_count", 0)))
    hits.sort(key=lambda h: -h[2])
    return hits[:limit]


def photo_fetch(asset: str, res: str = "1k") -> dict:
    """Download a Poly Haven texture's maps (diffuse, normal, AO, displacement). Returns {map: path}."""
    from .convert import _open
    out = {}
    d = os.path.join(cache_dir(), f"{asset}_{res}")
    os.makedirs(d, exist_ok=True)
    listing = None
    for key, ph in MAPS.items():
        path = os.path.join(d, f"{key}.jpg")
        if not os.path.exists(path):
            if listing is None:
                listing = json.load(_open(f"https://api.polyhaven.com/files/{asset}"))
            entry = (listing.get(ph) or {}).get(res) or {}
            f = entry.get("jpg") or entry.get("png")
            if not f:
                continue
            with open(path, "wb") as fh:
                fh.write(_open(f["url"]).read())
        out[key] = path
    if "diff" not in out:
        raise ValueError(f"Poly Haven texture {asset!r} has no diffuse map at {res}")
    return out


def load_photo(src: str, res: str = "1k", max_size: int = 1024) -> dict:
    """'polyhaven:<id>' or an image path -> {'diff': HxWx3, 'nor': HxWx3 (-1..1), 'ao', 'disp'} floats."""
    key = (src, res, max_size)
    if key in _CACHE:
        return _CACHE[key]
    if src.startswith("polyhaven:"):
        paths = photo_fetch(src.split(":", 1)[1], res)
    else:
        path = _resolve(src)
        if os.path.isdir(path):  # a vendored photo folder: diff.jpg (+ nor.jpg, ao.jpg, source.json)
            paths = {k: os.path.join(path, f"{k}.jpg") for k in MAPS if os.path.exists(os.path.join(path, f"{k}.jpg"))}
        else:
            paths = {"diff": path}
    out = {}
    for k, p in paths.items():
        im = Image.open(p)
        im = im.convert("RGB") if k in ("diff", "nor") else im.convert("L")
        if max(im.size) > max_size:
            s = max_size / max(im.size)
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
        a = np.asarray(im, float) / 255.0
        if k == "nor":
            a = a * 2 - 1
        out[k] = a
    if "nor" not in out:  # derive a normal map from luminance (a decent stand-in for plain photos)
        lum = out["diff"] @ np.array([0.3, 0.59, 0.11])
        h = brush.blur(lum, 1.5)
        gy, gx = np.gradient(h)
        k = 6.0
        n = np.dstack([-gx * k, gy * k, np.ones_like(h)])
        out["nor"] = n / np.linalg.norm(n, axis=-1, keepdims=True)
    out["tileable"] = src.startswith("polyhaven:") or os.path.isdir(_resolve(src))
    _CACHE[key] = out
    return out


def _resolve(src):
    """Paths resolve against the working directory, then the repo root (for bundled assets/)."""
    if os.path.exists(src):
        return src
    alt = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), src)
    return alt if os.path.exists(alt) else src


def photo_vendor(asset: str, out_dir: str, size: int = 512, res: str = "1k") -> str:
    """Save a small copy of a Poly Haven texture (diff/nor/ao) into out_dir/<asset> for offline use."""
    paths = photo_fetch(asset, res)
    d = os.path.join(out_dir, asset)
    os.makedirs(d, exist_ok=True)
    for k, pth in paths.items():
        if k == "disp":
            continue
        im = Image.open(pth)
        im = im.convert("RGB") if k in ("diff", "nor") else im.convert("L")
        im.resize((size, size), Image.LANCZOS).save(os.path.join(d, f"{k}.jpg"), quality=88)
    with open(os.path.join(d, "source.json"), "w") as fh:
        json.dump({"asset": asset, "source": f"https://polyhaven.com/a/{asset}", "license": "CC0-1.0",
                   "note": "downscaled copy for offline use"}, fh, indent=1)
    return d


# ------------------------------------------------------------------ helpers
def make_tileable(a, frac=0.25):
    """Cross-fade an image with its half-shifted self so its edges wrap seamlessly."""
    H, W = a.shape[:2]
    sh = np.roll(np.roll(a, H // 2, axis=0), W // 2, axis=1)
    y = np.abs(np.linspace(-1, 1, H))[:, None]
    x = np.abs(np.linspace(-1, 1, W))[None, :]
    w = np.clip((np.maximum(x, y) - (1 - 2 * frac)) / (2 * frac), 0, 1)
    if a.ndim == 3:
        w = w[..., None]
    return a * (1 - w) + sh * w


def relight(p, amount=0.8, light=(-0.55, -0.65, 0.55)):
    """Bake light from the photo's normal + AO maps: lit planes up, crevices down."""
    L = np.array(light, float)
    L /= np.linalg.norm(L)
    n = p["nor"]
    # normal map: +x right, +y up (OpenGL) -> image space y down
    ndl = n[..., 0] * L[0] - n[..., 1] * L[1] + n[..., 2] * L[2]
    shade = 1 + amount * (ndl - L[2]) * 1.2
    if "ao" in p:
        shade = shade * (1 - amount * 0.6 * (1 - p["ao"]))
    return np.clip(p["diff"] * shade[..., None], 0, 1)


def structure_flow(lum, r=2.0):
    """Stroke directions along the photo's features (structure tensor, isophote direction)."""
    gy, gx = np.gradient(brush.blur(lum, 1))
    jxx, jyy, jxy = brush.blur(gx * gx, r), brush.blur(gy * gy, r), brush.blur(gx * gy, r)
    th = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + math.pi / 2
    return np.dstack([np.cos(th), np.sin(th)])


def _box_mean(a, r):
    """Mean over a (2r+1)^2 window (edge-padded), via summed-area tables."""
    k = 2 * r + 1
    pad = np.pad(a, [(r + 1, r), (r + 1, r)] + [(0, 0)] * (a.ndim - 2), mode="edge")
    c = pad.cumsum(0).cumsum(1)
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def kuwahara(img, r=2):
    """Edge-preserving painterly flattening: each pixel takes the mean of its calmest quadrant."""
    lum = img @ np.array([0.3, 0.59, 0.11])
    m = _box_mean(img, r)
    ml = _box_mean(lum, r)
    v = _box_mean(lum * lum, r) - ml * ml
    H, W = lum.shape
    best = np.full((H, W), np.inf)
    out = np.zeros_like(img)
    for dy in (-r, r):
        for dx in (-r, r):
            vv = np.roll(np.roll(v, -dy, 0), -dx, 1)
            mm = np.roll(np.roll(m, -dy, 0), -dx, 1)
            sel = vv < best
            best = np.where(sel, vv, best)
            out[sel] = mm[sel]
    return out


def _majority(lab, passes=2):
    """Mode filter on an integer label image (3x3), to remove speckled family switches."""
    for _ in range(passes):
        H, W = lab.shape
        p = np.pad(lab, 1, mode="wrap")
        stack = np.stack([p[1 + dy:1 + dy + H, 1 + dx:1 + dx + W] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
        vals = np.unique(lab)
        counts = np.stack([(stack == v).sum(0) for v in vals])
        lab = vals[counts.argmax(0)]
    return lab


def despeckle(rgb, passes=2):
    """Pixel-art cleanup: a pixel whose colour no 4-neighbour shares takes its most common neighbour colour."""
    a = rgb.copy()
    H, W = a.shape[:2]
    for _ in range(passes):
        key = (a[..., 0].astype(np.int64) << 16) | (a[..., 1].astype(np.int64) << 8) | a[..., 2].astype(np.int64)
        p = np.pad(key, 1, mode="wrap")
        n4 = [p[0:H, 1:W + 1], p[2:H + 2, 1:W + 1], p[1:H + 1, 0:W], p[1:H + 1, 2:W + 2]]
        lonely = np.ones((H, W), bool)
        for n in n4:
            lonely &= n != key
        if not lonely.any():
            break
        n8 = n4 + [p[0:H, 0:W], p[0:H, 2:W + 2], p[2:H + 2, 0:W], p[2:H + 2, 2:W + 2]]
        st = np.stack(n8)
        for y, x in zip(*np.nonzero(lonely)):
            vals, cnt = np.unique(st[:, y, x], return_counts=True)
            v = vals[cnt.argmax()]
            a[y, x] = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    return a


def _resize(a, size):
    W, H = (size, size) if isinstance(size, int) else size
    if a.ndim == 2:
        return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BOX), float) / 255
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.BOX), float) / 255


def _wrap_pad(a, k):
    return np.pad(a, [(k, k), (k, k)] + [(0, 0)] * (a.ndim - 2), mode="wrap")


def extract_ramps(rgb, families=2, colours=12, hue_shift=22, spread=0.75):
    """Hue families from a photo (k-means on chroma) -> hue-shifted pixel-art ramps per family.

    Returns (ramps: list of hex lists, label per pixel)."""
    flat = rgb.reshape(-1, 3)
    hsv = np.array([colorsys.rgb_to_hsv(*c) for c in flat[:: max(1, len(flat) // 4000)]])
    # cluster in (cos h, sin h) * s space so grey stays apart from colour
    def feat(h):
        return np.dstack([np.cos(h[:, 0] * 2 * np.pi) * h[:, 1], np.sin(h[:, 0] * 2 * np.pi) * h[:, 1]])[0]
    X = feat(hsv)
    rng = np.random.default_rng(1)
    C = X[rng.choice(len(X), families, replace=False)]
    for _ in range(20):
        d = ((X[:, None, :] - C[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        C = np.array([X[lab == k].mean(0) if (lab == k).any() else C[k] for k in range(families)])
    allh = np.array([colorsys.rgb_to_hsv(*c) for c in flat])
    labs = ((feat(allh)[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
    steps = max(3, colours // families)
    ramps = []
    for k in range(families):
        sel = flat[labs == k] if (labs == k).any() else flat
        med = np.median(sel, axis=0)
        ramps.append(make_ramp(to_hex(med * 255), steps, hue_shift, 0.12, spread))
    return ramps, labs.reshape(rgb.shape[:2])


# ------------------------------------------------------------------ stylise
def stylise(photo, style="pixel", size=64, colours=None, families=None, relight_amount=None, seed=0, tile=True,
            ramps=None):
    """Turn a loaded photo (see load_photo) into a stylised, tileable texture (PIL RGB image)."""
    if style not in STYLES:
        raise ValueError(f"style must be one of {sorted(STYLES)}")
    st = dict(STYLES[style])
    W, H = (size, size) if isinstance(size, int) else size
    rng = np.random.default_rng(seed)
    p = photo
    lit = relight(p, st["relight"] if relight_amount is None else relight_amount)
    if tile and not p.get("tileable"):
        lit = make_tileable(lit)
    if style == "realistic":
        return Image.fromarray((_resize(lit, (W, H)) * 255).astype(np.uint8))
    if style == "painted":
        img = _resize(lit, (W, H))
        k = max(4, W // 8)
        pad = _wrap_pad(img, k)
        pad = kuwahara(pad, max(1, W // 160))   # flatten noise into painted shapes, keep the structure
        lum = pad @ np.array([0.3, 0.59, 0.11])
        F = structure_flow(lum, r=max(1.5, W / 128))
        labels = np.zeros(lum.shape, np.int64)
        out = brush.painted(pad, labels, F, rng, length=st["length"] * W, width=st["width"] * W, value=0.05,
                            hue=0.025, bristle=0.05, detail=np.ones(lum.shape, bool), detail_length=st["length"] * W * 0.4)
        out = out[k:-k, k:-k]
        if st["posterize"]:
            q = st["posterize"]
            out = np.round(out * q) / q * 0.35 + out * 0.65
        grey = out.mean(-1, keepdims=True)
        out = np.clip(grey + (out - grey) * st["saturation"], 0, 1)
        return Image.fromarray((out * 255).astype(np.uint8))
    # pixel styles: simplify into big shapes, downsample, extract ramps, quantise as strokes (wrapped)
    big = _resize(lit, (W * 4, H * 4))
    for r in st.get("simplify", [1]):
        big = kuwahara(big, r)
    img = _resize(big, (W, H))
    lum0 = img @ np.array([0.3, 0.59, 0.11])
    # local contrast: push forms apart so clusters read at small sizes
    img = np.clip(img + (lum0 - brush.blur(lum0, max(2, W // 10)))[..., None] * st.get("contrast", 1.0), 0, 1)
    fam = families or st["families"]
    ncol = colours or st["colours"]
    if ramps is None:
        ramps, labs = extract_ramps(img, fam, ncol, spread=st.get("spread", 0.75))
    else:
        labs = _nearest_family(img, ramps)
    labs = _majority(labs, 2)
    k = max(3, W // 6)
    pad = _wrap_pad(img, k)
    lpad = _wrap_pad(labs, k)
    lum = pad @ np.array([0.3, 0.59, 0.11])
    # relief: light the downsampled normal map, so tone is driven by lit/shadowed forms (how a
    # pixel artist reads a surface) more than by raw albedo noise
    nrm = p["nor"]
    nsm = np.dstack([_resize(nrm[..., c] * 0.5 + 0.5, (W, H)) * 2 - 1 for c in range(3)])
    nsm = nsm / np.maximum(np.linalg.norm(nsm, axis=-1, keepdims=True), 1e-6)
    L = np.array([-0.55, 0.65, 0.55])
    L = L / np.linalg.norm(L)
    shade = _wrap_pad(nsm @ L, k)
    rel = float(st.get("relief", 0.6))
    lum = (1 - rel) * (lum - lum.mean()) / max(lum.std(), 1e-6) + rel * (shade - shade.mean()) / max(shade.std(), 1e-6)
    F = structure_flow(lum, r=1.2)
    out = np.zeros(pad.shape)
    for f, rp in enumerate(ramps):
        sel = lpad == f
        if not sel.any():
            continue
        cols = np.array([parse_hex(c) for c in rp], float) / 255
        rl = cols @ np.array([0.3, 0.59, 0.11])
        # an artist uses the whole ramp: rank the family's luminance onto it (darkest step kept for crevices)
        v = np.sort(lum[sel])
        rank = np.searchsorted(v, lum) / max(len(v) - 1, 1)
        T = 0.6 + np.clip(rank, 0, 1) ** 1.1 * (len(rl) - 1.4)
        idx = brush.quantise(T, np.where(sel, 0, -1), F, rng, 0, len(rl) - 1, length=st["length"] * W + 2,
                             rough=st["rough"], overshoot=0.3, width=1.2)
        out[sel] = cols[np.clip(idx[sel], 0, len(rl) - 1)]
    out = (out[k:-k, k:-k] * 255).round().astype(np.uint8)
    return Image.fromarray(despeckle(out, 2))


def _nearest_family(img, ramps):
    means = np.array([np.mean([parse_hex(c) for c in rp], axis=0) / 255 for rp in ramps])
    d = ((img[..., None, :] - means[None, None]) ** 2).sum(-1)
    return d.argmin(-1)


def tiled_preview(tex: Image.Image, n=3, k=1):
    """n x n tiling of a texture (to check seams), optionally upscaled k times (nearest)."""
    W, H = tex.size
    out = Image.new("RGB", (W * n, H * n))
    for i in range(n):
        for j in range(n):
            out.paste(tex, (i * W, j * H))
    return out.resize((W * n * k, H * n * k), Image.NEAREST) if k > 1 else out


# --------------------------------------------------------- painter support
def sample(photo, u, v, key="diff"):
    """Bilinear-free nearest sample with wrap: u, v in tiles (any real numbers)."""
    a = photo[key]
    H, W = a.shape[:2]
    x = (np.mod(u, 1.0) * W).astype(np.int64) % W
    y = (np.mod(v, 1.0) * H).astype(np.int64) % H
    return a[y, x]


def detail(photo, u, v):
    """High-pass luminance detail of a photo at (u, v), normalised to about -1..1."""
    if "_detail" not in photo:
        lum = relight(photo, 0.8) @ np.array([0.3, 0.59, 0.11])
        hp = lum - brush.blur(lum, max(4, lum.shape[0] // 32))
        photo["_detail"] = hp / max(float(hp.std()), 1e-6) / 2.5
    a = photo["_detail"]
    H, W = a.shape
    x = (np.mod(u, 1.0) * W).astype(np.int64) % W
    y = (np.mod(v, 1.0) * H).astype(np.int64) % H
    return a[y, x]
