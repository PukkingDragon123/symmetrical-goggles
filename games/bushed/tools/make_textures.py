#!/usr/bin/env python3
"""BUSHED tiling textures: Poly Haven (CC0) photo scans -> seamless high-resolution pixel-art albedo + normal maps.

    cd /home/user/symmetrical-goggles
    python games/bushed/tools/make_textures.py                # all
    python games/bushed/tools/make_textures.py moss granite   # some (by name)

Albedo pipeline (no directional light is baked; the game lights everything):
  diffuse x ambient occlusion (cavity darkening only) -> partial flattening of very low-frequency light/dark
  blotches (less visible tiling) -> colour grade -> integer box downsample (stays seamless) -> per-texture k-means
  palette in Lab (rich, photo-derived colours; 40-64 per tile) -> isolated-pixel cleanup (pixel clusters).
Normal maps: OpenGL convention (+Y up, three.js default), box-downsampled and renormalised.
Two textures are synthesised: cedar shakes (shakes cut from a weathered-plank scan) and window grime (RGBA).

Writes public/assets/textures/<set>/<name>_{albedo,normal}.png, public/assets/textures/index.json (set, name, tile
metres, density, source) and keeps downloads in out/bushed/texdl (gitignored scratch).
"""
from __future__ import annotations

import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, ROOT)
OUT = os.path.join(ROOT, "games", "bushed", "public", "assets", "textures")
DL = os.path.join(ROOT, "out", "bushed", "texdl")

# name: (set, Poly Haven id, output px, options)
#   rot: rotate 90 deg (grain direction), grade: (saturation, brightness, (r, g, b) multiply), k: palette size,
#   flatten: 0..1 how much of the low-frequency light/dark to remove
TEX: dict[str, tuple[str, str, int, dict]] = {
    # terrain
    "forest_floor": ("terrain", "forrest_ground_03", 1024, dict(grade=(1.0, 0.82, (0.97, 0.92, 0.86)), k=56, sharpen=1.2)),
    "dead_leaves": ("terrain", "forest_leaves_02", 512, dict(grade=(1.05, 0.95, (1, 1, 1)), k=56)),
    "moss": ("terrain", "sparse_grass", 512, dict(grade=(1.35, 1.0, (0.92, 1.08, 0.85)), k=48)),
    "grass": ("terrain", "forrest_ground_01", 512, dict(grade=(1.1, 0.95, (1, 1, 1)), k=56)),
    "dirt": ("terrain", "dirt", 512, dict(grade=(1.1, 0.95, (1, 1, 1)), k=40, sharpen=1.0)),
    "mud": ("terrain", "brown_mud_02", 512, dict(grade=(1.1, 0.9, (1, 1, 1)), k=40)),
    "mud_ruts": ("terrain", "muddy_tracks", 512, dict(grade=(0.7, 0.95, (0.9, 1.0, 1.08)), k=40)),
    "gravel_road": ("terrain", "rocky_trail", 512, dict(grade=(1.05, 0.95, (1, 1, 1)), k=48)),
    "granite": ("terrain", "rock_08", 512, dict(grade=(1.0, 0.92, (1.0, 0.96, 0.97)), k=48)),
    "lichen_rock": ("terrain", "lichen_rock", 512, dict(grade=(1.05, 1.1, (1, 1, 1)), k=48)),
    "pebbles": ("terrain", "ganges_river_pebbles", 512, dict(grade=(1.05, 0.95, (1, 1, 1)), k=56)),
    # building
    "log_wall": ("building", "wood_trunk_wall", 512, dict(rot=True, grade=(1.0, 1.15, (1.0, 0.97, 0.92)), k=48)),
    "rough_planks": ("building", "weathered_planks", 512, dict(grade=(1.1, 1.0, (1, 1, 1)), k=48)),
    "floor_boards": ("building", "wood_floor_worn", 512, dict(grade=(1.0, 0.95, (1, 1, 1)), k=48)),
    "corrugated_rust": ("building", "rusty_corrugated_iron", 512, dict(grade=(1.05, 1.0, (1, 1, 1)), k=48)),
    "fieldstone": ("building", "stone_wall", 512, dict(grade=(1.05, 0.95, (1, 1, 1)), k=48)),
    "painted_siding": ("building", "distressed_painted_planks", 512, dict(rot=True, grade=(1.05, 1.0, (1, 1, 1)), k=48)),
    "concrete": ("building", "concrete_floor_02", 512, dict(grade=(1.0, 1.0, (1, 1, 1)), k=40)),
}
SYNTH = {
    "cedar_shakes": ("building", "weathered_planks", 512),
    "window_grime": ("building", "dirty_concrete", 512),
}


def _open(url):
    from lowpix.convert import _open as op
    return op(url)


_files_cache: dict = {}


def fetch(asset: str, key: str, res: str = "2k") -> str | None:
    """Download one map ('Diffuse', 'nor_gl', 'AO', 'Rough') of a Poly Haven texture. Returns the path or None."""
    p = os.path.join(DL, f"{asset}_{key}_{res}.png")
    pj = os.path.join(DL, f"{asset}_{key}_{res}.jpg")
    for q in (p, pj):
        if os.path.exists(q):
            return q
    if asset not in _files_cache:
        _files_cache[asset] = json.load(_open(f"https://api.polyhaven.com/files/{asset}"))
    e = (_files_cache[asset].get(key) or {}).get(res) or {}
    f = e.get("png") or e.get("jpg")
    if not f:
        return None
    dst = p if "png" in e else pj
    os.makedirs(DL, exist_ok=True)
    open(dst, "wb").write(_open(f["url"]).read())
    return dst


def info(asset: str) -> dict:
    p = os.path.join(DL, f"{asset}_info.json")
    if not os.path.exists(p):
        os.makedirs(DL, exist_ok=True)
        json.dump(json.load(_open(f"https://api.polyhaven.com/info/{asset}")), open(p, "w"))
    return json.load(open(p))


def load(path: str, mode="RGB", size=2048) -> np.ndarray:
    im = Image.open(path)
    if im.mode in ("I;16", "I;16B", "I") and mode == "L":   # 16-bit AO maps: convert("L") would clip them
        a = np.asarray(im, np.float64) / 65535.0
        if a.shape != (size, size):
            a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)) / 255.0
        return a
    im = im.convert(mode)
    if im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, np.float64) / 255.0


# ------------------------------------------------------------------ helpers
def blur_wrap(a: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur with wrap-around (FFT), keeps tiling."""
    H, W = a.shape[:2]
    fy = np.fft.fftfreq(H)[:, None]
    fx = np.fft.fftfreq(W)[None, :]
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (fx * fx + fy * fy))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * g)) for c in range(a.shape[2])], -1)


def box_down(a: np.ndarray, n: int) -> np.ndarray:
    H = a.shape[0]
    f = H // n
    if a.ndim == 2:
        return a[: n * f, : n * f].reshape(n, f, n, f).mean((1, 3))
    return a[: n * f, : n * f].reshape(n, f, n, f, a.shape[2]).mean((1, 3))


def srgb_to_lab(rgb):
    from lowpix.convert import _srgb_to_lab
    return _srgb_to_lab(np.clip(rgb, 0, 1))


def kmeans(X, k, iters=20, seed=0):
    rng = np.random.default_rng(seed)
    C = [X[rng.integers(len(X))]]
    for _ in range(1, k):
        d = np.min(((X[:, None, :] - np.array(C)[None]) ** 2).sum(-1), axis=1)
        C.append(X[rng.choice(len(X), p=d / d.sum())] if d.sum() > 0 else X[rng.integers(len(X))])
    C = np.array(C)
    for _ in range(iters):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        for j in range(k):
            if (lab == j).any():
                C[j] = X[lab == j].mean(0)
    return C


def quantise(rgb: np.ndarray, k: int, seed=0) -> tuple[np.ndarray, np.ndarray]:
    """k-means palette in Lab (lightness weighted up a little so value steps stay crisp). -> (labels, palette rgb)"""
    H, W = rgb.shape[:2]
    lab = srgb_to_lab(rgb.reshape(-1, 3)) * np.array([1.2, 1.0, 1.0])
    sub = lab[np.random.default_rng(seed).choice(len(lab), size=min(24000, len(lab)), replace=False)]
    C = kmeans(sub, k, seed=seed)
    labels = np.empty(len(lab), np.int64)
    for s in range(0, len(lab), 65536):
        labels[s:s + 65536] = np.argmin(((lab[s:s + 65536, None, :] - C[None]) ** 2).sum(-1), axis=1)
    pal = np.zeros((k, 3))
    flat = rgb.reshape(-1, 3)
    for j in range(k):
        m = labels == j
        pal[j] = flat[m].mean(0) if m.any() else 0
    return labels.reshape(H, W), pal


def despeckle_labels(lab: np.ndarray, passes: int = 2) -> np.ndarray:
    """A pixel whose label no 4-neighbour shares takes the most common label among its 8 neighbours (wraps)."""
    for _ in range(passes):
        H, W = lab.shape
        p = np.pad(lab, 1, mode="wrap")
        n4 = [p[0:H, 1:W + 1], p[2:H + 2, 1:W + 1], p[1:H + 1, 0:W], p[1:H + 1, 2:W + 2]]
        lonely = np.ones((H, W), bool)
        for n in n4:
            lonely &= n != lab
        if not lonely.any():
            break
        n8 = np.stack(n4 + [p[0:H, 0:W], p[0:H, 2:W + 2], p[2:H + 2, 0:W], p[2:H + 2, 2:W + 2]])
        counts = np.stack([(n8 == n8[i]).sum(0) for i in range(8)])
        best = n8[counts.argmax(0), np.arange(H)[:, None], np.arange(W)[None, :]]
        lab = np.where(lonely, best, lab)
    return lab


def grade(rgb, sat=1.0, bright=1.0, tint=(1, 1, 1)):
    lum = (rgb @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    out = lum + (rgb - lum) * sat
    return np.clip(out * bright * np.array(tint), 0, 1)


def flatten_lowfreq(rgb, amount=0.5, sigma_frac=0.12):
    """Divide out part of the very-low-frequency brightness variation (big blotches make tiling obvious)."""
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    low = blur_wrap(lum, rgb.shape[0] * sigma_frac)
    f = (lum.mean() / np.maximum(low, 1e-3)) ** amount
    return np.clip(rgb * f[..., None], 0, 1)


def save_albedo(path: str, labels: np.ndarray, pal: np.ndarray, alpha: np.ndarray | None = None):
    pal8 = np.clip(pal * 255 + 0.5, 0, 255).astype(np.uint8)
    if alpha is None:
        im = Image.fromarray(labels.astype(np.uint8), "P")
        im.putpalette(pal8.reshape(-1).tolist() + [0] * (768 - pal8.size))
        im.save(path, optimize=True)
    else:
        rgba = np.dstack([pal8[labels], np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)])
        Image.fromarray(rgba, "RGBA").save(path, optimize=True)


def save_normal(path: str, n: np.ndarray, k: int = 0):
    n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)
    rgb = np.clip((n * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(rgb, "RGB")
    if k:  # palette normals: crisp, pixel-art facets and a quarter of the file size
        im = im.quantize(colors=k, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    im.save(path, optimize=True)


def sharpen(rgb: np.ndarray, amount: float, radius: float = 1.0) -> np.ndarray:
    """Unsharp mask (wraps): keeps thin features (needles, grain, cracks) readable after the downsample."""
    return np.clip(rgb + amount * (rgb - blur_wrap(rgb, radius)), 0, 1)


def pixelise(rgb: np.ndarray, k: int, seed=0):
    labels, pal = quantise(rgb, k, seed)
    labels = despeckle_labels(labels, 2)
    return labels, pal


# ------------------------------------------------------------------ photo textures
def make_photo(name: str) -> dict:
    tset, asset, n, opt = TEX[name]
    meta = info(asset)
    diff = load(fetch(asset, "Diffuse"))
    aop = fetch(asset, "AO")
    ao = load(aop, "L") if aop else np.ones(diff.shape[:2])
    nor = load(fetch(asset, "nor_gl")) * 2 - 1
    if opt.get("rot"):
        diff, ao = np.rot90(diff).copy(), np.rot90(ao).copy()
        # rotating a normal map 90 deg CCW: the vector turns too (x' = -y, y' = x)
        nor = np.rot90(nor).copy()
        nor = np.dstack([-nor[..., 1], nor[..., 0], nor[..., 2]])
    alb = diff * (0.35 + 0.65 * ao)[..., None]
    alb = flatten_lowfreq(alb, opt.get("flatten", 0.45))
    s, b, t = opt.get("grade", (1, 1, (1, 1, 1)))
    alb = grade(alb, s, b, t)
    small = sharpen(box_down(alb, n), opt.get("sharpen", 0.6))
    labels, pal = pixelise(small, opt.get("k", 48))
    d = os.path.join(OUT, tset)
    os.makedirs(d, exist_ok=True)
    save_albedo(os.path.join(d, f"{name}_albedo.png"), labels, pal)
    save_normal(os.path.join(d, f"{name}_normal.png"), box_down(nor, n), k=256)
    dims = meta.get("dimensions") or [2000, 2000]
    tile = round(max(dims) / 1000.0, 2)
    return {"set": tset, "name": name, "tile": tile, "px": n, "density": round(n / tile), "source": asset,
            "url": f"https://polyhaven.com/a/{asset}", "authors": list((meta.get("authors") or {}).keys()), "licence": "CC0"}


# ------------------------------------------------------------------ synthesised
def make_cedar_shakes() -> dict:
    """Staggered courses of split cedar shakes, cut from a weathered-plank scan (grain runs down each shake).
    Tile: 1.6 m x 1.6 m, 8 courses of 0.2 m exposure, shakes 0.09-0.3 m wide."""
    tset, asset, n = SYNTH["cedar_shakes"]
    meta = info(asset)
    src = load(fetch(asset, "Diffuse"))      # 2 m x 2 m, vertical boards
    srcn = load(fetch(asset, "nor_gl")) * 2 - 1
    aop = fetch(asset, "AO")
    srca = load(aop, "L") if aop else np.ones(src.shape[:2])
    tile_m, courses = 1.6, 8
    S = 2048                                   # work resolution (1280 px/m), downsampled to n
    ppm = S / tile_m
    src_ppm = src.shape[0] / 2.0               # source px per metre
    rng = np.random.default_rng(7)
    col = np.zeros((S, S, 3))
    nrm = np.zeros((S, S, 3))
    occ = np.ones((S, S))
    ch = S // courses
    yy = np.arange(ch)[:, None] / ch           # 0 top of the exposed part .. 1 butt
    for c in range(courses):
        y0 = c * ch
        x = rng.uniform(0, S)
        x_start = x
        widths = []
        while True:   # shakes across the course, wrapping exactly once around the tile
            w = int(rng.uniform(0.09, 0.3) * ppm)
            if x + w >= x_start + S:
                w = int(x_start + S - x)
                widths.append((int(x), w))
                break
            widths.append((int(x), w))
            x += w
        for xs, w in widths:
            if w < 4:
                continue
            # pick a source window (grain vertical), scaled from source px to work px
            sx = rng.uniform(0, src.shape[1] - w / ppm * src_ppm - 1)
            sy = rng.uniform(0, src.shape[0] - ch / ppm * src_ppm - 1)
            ys = (sy + np.arange(ch) / ppm * src_ppm).astype(int)
            xsr = (sx + np.arange(w) / ppm * src_ppm).astype(int)
            patch = src[ys][:, xsr]
            pn = srcn[ys][:, xsr]
            pa = srca[ys][:, xsr]
            # per-shake weathering: silver-grey to warm brown cedar
            warm = rng.uniform(0, 1)
            tint = np.array([1.0 + 0.12 * warm, 0.97 + 0.03 * warm, 0.93 - 0.08 * warm]) * rng.uniform(0.82, 1.08)
            patch = grade(patch, 0.9 + 0.4 * warm, 1.0, tint)
            # the butt is thicker: the shake tilts out at the bottom; gap shading at the sides and under the butt
            tilt = 0.18
            nx = pn[..., 0]
            ny = pn[..., 1] * 0.6 - tilt
            nz = pn[..., 2]
            edge = np.minimum(np.arange(w), w - 1 - np.arange(w))[None, :] / ppm
            gap = np.clip(edge / 0.006, 0, 1)                    # 6 mm keyway between shakes
            under = np.clip(yy / 0.25, 0, 1) ** 0.6                # shadowed band just under the course above
            cav = (0.45 + 0.55 * gap) * (0.55 + 0.45 * under) * (0.5 + 0.5 * pa)
            xs_idx = (xs + np.arange(w)) % S
            col[y0:y0 + ch, xs_idx] = patch
            nrm[y0:y0 + ch, xs_idx] = np.dstack([nx, ny, nz])
            occ[y0:y0 + ch, xs_idx] = cav
            # a few splits/cracks down the grain
            for _ in range(rng.integers(0, 3)):
                cx = rng.integers(2, max(3, w - 2))
                L = rng.integers(ch // 4, ch)
                occ[y0 + ch - L:y0 + ch, (xs + cx) % S] *= 0.55
    alb = col * occ[..., None]
    small = box_down(alb, n)
    labels, pal = pixelise(small, 48, seed=3)
    d = os.path.join(OUT, tset)
    os.makedirs(d, exist_ok=True)
    save_albedo(os.path.join(d, "cedar_shakes_albedo.png"), labels, pal)
    save_normal(os.path.join(d, "cedar_shakes_normal.png"), box_down(nrm, n), k=256)
    return {"set": tset, "name": "cedar_shakes", "tile": tile_m, "px": n, "density": round(n / tile_m),
            "source": asset, "url": f"https://polyhaven.com/a/{asset}",
            "authors": list((meta.get("authors") or {}).keys()), "licence": "CC0",
            "note": "synthesised: 8 courses x 0.2 m exposure of shakes cut from the scan"}


def make_window_grime() -> dict:
    """Old window glass: RGBA albedo (alpha = how opaque the grime is; use transparent + alphaMap or the A
    channel), with rain-run streaks and blotchy film from a dirty-concrete scan; faint waviness in the normal."""
    tset, asset, n = SYNTH["window_grime"]
    meta = info(asset)
    g = load(fetch(asset, "Diffuse"))
    lum = g @ np.array([0.2126, 0.7152, 0.0722])
    lum = (lum - lum.mean()) / (lum.std() + 1e-6)
    rng = np.random.default_rng(5)
    S = g.shape[0]
    # vertical rain runs: column noise smeared downwards (wraps)
    cols = blur_wrap(rng.standard_normal((S, S)), 3.0)
    runs = np.zeros((S, S))
    for k in (1, 2, 4):
        runs += np.roll(cols, k * 40, axis=0)
    runs = blur_wrap(runs, 1.0)
    runs = blur_wrap(runs * np.abs(np.sin(np.arange(S)[None, :] * 2 * math.pi * 23 / S)), 2.0)
    streak = np.zeros((S, S))
    acc = np.zeros(S)
    for y in range(S):            # exponential smear down (rain carries dirt)
        acc = acc * 0.985 + runs[y]
        streak[y] = acc
    streak = np.roll(streak, S // 2, axis=0) * 0.5 + streak * 0.5     # hide the start row seam
    streak = (streak - streak.mean()) / (streak.std() + 1e-6)
    film = blur_wrap(lum, 6.0)
    film = (film - film.mean()) / (film.std() + 1e-6)
    dirt = np.clip(0.35 + 0.18 * film + 0.12 * streak + 0.08 * lum, 0, 1)
    base = np.array([0.42, 0.47, 0.45])        # greenish old glass
    grime = np.array([0.42, 0.37, 0.29])        # brown film
    rgb = base * (1 - dirt[..., None]) + grime * dirt[..., None]
    alpha = np.clip(0.12 + 0.7 * dirt ** 1.6, 0, 1)
    small = box_down(rgb, n)
    a_small = box_down(alpha, n)
    labels, pal = pixelise(small, 24, seed=1)
    a_q = np.round(a_small * 12) / 12          # alpha in pixel-art steps too
    d = os.path.join(OUT, tset)
    os.makedirs(d, exist_ok=True)
    save_albedo(os.path.join(d, "window_grime_albedo.png"), labels, pal, alpha=a_q)
    wave = blur_wrap(rng.standard_normal((S, S)), 60.0)
    gy, gx = np.gradient(np.tile(wave, (1, 1)))
    k = 300.0
    nrm = np.dstack([-gx * k, gy * k, np.ones_like(wave)])
    save_normal(os.path.join(d, "window_grime_normal.png"), box_down(nrm, n), k=64)
    return {"set": tset, "name": "window_grime", "tile": 1.0, "px": n, "density": n, "source": asset,
            "url": f"https://polyhaven.com/a/{asset}", "authors": list((meta.get("authors") or {}).keys()),
            "licence": "CC0", "note": "synthesised; RGBA albedo, alpha = grime opacity"}


def main():
    want = sys.argv[1:]
    idx_p = os.path.join(OUT, "index.json")
    index = {f"{e['set']}/{e['name']}": e for e in (json.load(open(idx_p)) if os.path.exists(idx_p) else [])}
    for name in list(TEX) + list(SYNTH):
        if want and name not in want:
            continue
        if name in TEX:
            e = make_photo(name)
        elif name == "cedar_shakes":
            e = make_cedar_shakes()
        else:
            e = make_window_grime()
        index[f"{e['set']}/{e['name']}"] = e
        print(json.dumps(e), flush=True)
    order = list(TEX) + list(SYNTH)
    entries = sorted(index.values(), key=lambda e: (e["set"] != "terrain", order.index(e["name"]) if e["name"] in order else 99))
    json.dump(entries, open(idx_p, "w"), indent=1)


if __name__ == "__main__":
    main()
