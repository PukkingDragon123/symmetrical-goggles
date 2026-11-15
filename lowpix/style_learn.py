"""Learn a pixel-art style from reference images, then fit the sprite engine to it.

This is honest "training": no neural network. It measures the statistics that define a pixel-art style on
reference sheets, then searches the renderer and generator settings until our sprites produce the same
numbers. The result is a style profile (JSON) the generators apply.

    python -m lowpix learn measure refs/*.png               # print the style statistics of reference sheets
    python -m lowpix learn fit refs/*.png --generator gem --name my_gems   # -> lowpix/styles/my_gems.json
    python -m lowpix sprite gem --style my_gems --count 12 --scale 4

Measured per sprite (after detecting the sheet's native pixel size and cutting sprites from the background):
colours, ramp lengths and hue shift along each ramp, outline darkness and selective outline (lit side lighter),
mean cluster size, orphan pixels, checkerboard dithering, value contrast and saturation.
Only aggregate numbers are kept. No pixels from the references go into the profile.
"""
from __future__ import annotations

import colorsys
import json
import os

import numpy as np
from PIL import Image

STYLE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "styles")
STATS = ["colours", "ramp_len", "hue_shift", "outline_dark", "selout", "cluster", "orphans", "dither", "contrast",
         "saturation"]


# ------------------------------------------------------------------ preparing a reference sheet
def native_scale(a, max_k=12):
    """The upscale factor of a pixel-art image. For the true factor k (and the right grid phase), averaging each
    k x k block loses almost nothing; a wrong k smears edges. Returns the largest k whose best-phase
    reconstruction error stays near the minimum (divisors of k also fit, so the largest wins)."""
    f = a.astype(float)
    crop = f[: min(f.shape[0], 400), : min(f.shape[1], 400)]
    errs = {}
    for k in range(2, max_k + 1):
        best = np.inf
        for oy in range(0, k, max(1, k // 4)):
            for ox in range(0, k, max(1, k // 4)):
                c = crop[oy:, ox:]
                H, W = (c.shape[0] // k) * k, (c.shape[1] // k) * k
                if H < 4 * k or W < 4 * k:
                    continue
                c = c[:H, :W]
                blocks = c.reshape(H // k, k, W // k, k, 3).mean(axis=(1, 3))
                rec = np.repeat(np.repeat(blocks, k, 0), k, 1)
                best = min(best, float(np.abs(c - rec).mean()))
        errs[k] = best
    emin = min(errs.values())
    ok = [k for k, e in errs.items() if e <= 1.6 * emin + 0.5]
    return max(ok) if ok and emin < 6.0 else 1


def to_native(img: Image.Image, k=None):
    a = np.asarray(img.convert("RGB"))
    k = k or native_scale(a)
    if k > 1:
        H, W = a.shape[0] // k, a.shape[1] // k
        a = np.asarray(Image.fromarray(a).resize((W, H), Image.BOX))
    return a, k


def quantise(a, tol=18):
    """Merge near-identical colours (JPEG noise) so each painted colour is one colour again."""
    q = (a.astype(int) // tol) * tol + tol // 2
    return np.clip(q, 0, 255).astype(np.uint8)


def sprites(a, min_px=40):
    """Cut sprites out of a sheet: the background is the most common border colour."""
    H, W = a.shape[:2]
    # background: the border colour plus any colour covering a big share of the sheet (panels, frames)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    vals, cnt = np.unique(border.reshape(-1, 3), axis=0, return_counts=True)
    bgs = [vals[cnt.argmax()].astype(int)]
    v2, c2 = np.unique(a.reshape(-1, 3), axis=0, return_counts=True)
    for v, c in zip(v2[np.argsort(-c2)][:4], np.sort(c2)[::-1][:4]):
        if c > 0.06 * H * W:
            bgs.append(v.astype(int))
    fg = np.ones((H, W), bool)
    for bg in bgs:
        fg &= np.abs(a.astype(int) - bg).sum(-1) > 36
    lab = np.zeros((H, W), int)
    out = []
    k = 0
    for y0, x0 in zip(*np.nonzero(fg)):
        if lab[y0, x0]:
            continue
        k += 1
        stack = [(y0, x0)]
        lab[y0, x0] = k
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and fg[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = k
                    stack.append((yy, xx))
        if len(pts) >= min_px:
            p = np.array(pts)
            y0_, x0_ = p.min(0)
            y1_, x1_ = p.max(0) + 1
            m = lab[y0_:y1_, x0_:x1_] == k
            out.append((a[y0_:y1_, x0_:x1_], m))
    return out


def reduce_palette(rgb, mask, k=24, merge=26.0, seed=0):
    """Undo compression / resampling noise: k-means the sprite's colours, merge near-identical centres,
    and snap every pixel to its centre (a hand-made sprite uses a small palette)."""
    px = rgb[mask].reshape(-1, 3).astype(float)
    if len(px) == 0:
        return rgb
    rng = np.random.default_rng(seed)
    k = min(k, len(np.unique(px, axis=0)))
    C = px[rng.choice(len(px), k, replace=False)]
    for _ in range(12):
        lab = ((px[:, None] - C[None]) ** 2).sum(-1).argmin(1)
        C = np.array([px[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(len(C))])
    keep = []
    for c in C[np.argsort(-np.bincount(lab, minlength=len(C)))]:
        if all(np.linalg.norm(c - q) > merge for q in keep):
            keep.append(c)
    K = np.array(keep)
    lab = ((px[:, None] - K[None]) ** 2).sum(-1).argmin(1)
    out = rgb.copy()
    out[mask] = K[lab].round().astype(np.uint8)
    return out


# ------------------------------------------------------------------ statistics of one sprite
def sprite_stats(rgb, mask):
    """Style statistics of one sprite (rgb HxWx3 uint8, mask HxW bool)."""
    px = rgb[mask].reshape(-1, 3)
    keys = (px[:, 0].astype(np.int64) << 16) | (px[:, 1].astype(np.int64) << 8) | px[:, 2]
    uniq = np.unique(keys)
    n_col = len(uniq)
    cols = np.stack([(uniq >> 16) & 255, (uniq >> 8) & 255, uniq & 255], -1) / 255.0
    hls = np.array([colorsys.rgb_to_hls(*c) for c in cols])
    # ramps: group colours by hue (saturated) or as greys; hue shift = hue drift from dark to light
    fam = np.where(hls[:, 2] < 0.12, -1, np.round(hls[:, 0] * 8) % 8).astype(int)
    ramp_lens, shifts = [], []
    for f in np.unique(fam):
        sel = hls[fam == f]
        if len(sel) < 2:
            continue
        ramp_lens.append(len(sel))
        if f >= 0:
            o = np.argsort(sel[:, 1])
            dh = (sel[o[-1], 0] - sel[o[0], 0] + 0.5) % 1.0 - 0.5
            shifts.append(abs(dh) * 360)
    lum = rgb.astype(float) @ np.array([0.3, 0.59, 0.11])
    H, W = mask.shape
    pad = np.pad(mask, 1)
    inner = mask & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    body = mask & ~inner
    mean_lum = lum[body].mean() if body.any() else lum[mask].mean()
    outline_dark = float((lum[inner] < mean_lum * 0.55).mean()) if inner.any() else 0.0
    yy, xx = np.mgrid[0:H, 0:W]
    tl = inner & ((yy + xx) < (H + W) / 2)
    br = inner & ((yy + xx) >= (H + W) / 2)
    selout = float(lum[tl].mean() - lum[br].mean()) / 255.0 if tl.any() and br.any() else 0.0
    # clusters: connected same-colour regions
    img_k = np.where(mask, (rgb[..., 0].astype(np.int64) << 16) | (rgb[..., 1].astype(np.int64) << 8) | rgb[..., 2], -1)
    seen = np.zeros(mask.shape, bool)
    sizes = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        c = img_k[y0, x0]
        stack = [(y0, x0)]
        seen[y0, x0] = True
        n = 0
        while stack:
            y, x = stack.pop()
            n += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                y2, x2 = y + dy, x + dx
                if 0 <= y2 < H and 0 <= x2 < W and not seen[y2, x2] and img_k[y2, x2] == c:
                    seen[y2, x2] = True
                    stack.append((y2, x2))
        sizes.append(n)
    sizes = np.array(sizes)
    orphans = float((sizes == 1).sum() / max(mask.sum(), 1))
    a_, b_, c_, d_ = img_k[:-1, :-1], img_k[:-1, 1:], img_k[1:, :-1], img_k[1:, 1:]
    m4 = mask[:-1, :-1] & mask[:-1, 1:] & mask[1:, :-1] & mask[1:, 1:]
    checker = m4 & (a_ == d_) & (b_ == c_) & (a_ != b_)
    dither = float(checker.sum() / max(m4.sum(), 1))
    lum_m = lum[mask]
    return {"colours": float(n_col), "ramp_len": float(np.mean(ramp_lens)) if ramp_lens else 1.0,
            "hue_shift": float(np.mean(shifts)) if shifts else 0.0, "outline_dark": outline_dark, "selout": selout,
            "cluster": float(sizes.mean()) / max(float(mask.sum()), 1.0) * 100, "orphans": orphans, "dither": dither,
            "contrast": float(np.percentile(lum_m, 95) - np.percentile(lum_m, 5)) / 255.0,
            "saturation": float(np.mean(hls[:, 2])) if len(hls) else 0.0}


def aggregate(stats):
    out = {}
    for k in STATS:
        v = np.array([s[k] for s in stats])
        out[k] = {"mean": round(float(v.mean()), 4), "std": round(float(v.std()), 4)}
    out["n"] = len(stats)
    return out


def measure(paths, k=None, max_sprites=80, scales=None):
    """Style profile statistics of reference sheets. `scales`: {path: upscale factor} overrides detection."""
    all_stats = []
    for p in paths:
        a, kk = to_native(Image.open(p), (scales or {}).get(p, k))
        a = quantise(a)
        for rgb, m in sprites(a)[:max_sprites]:
            if 50 <= m.sum() <= 20000:
                all_stats.append(sprite_stats(reduce_palette(rgb, m), m))
    if not all_stats:
        raise ValueError("no sprites found in the references")
    return aggregate(all_stats)


def measure_images(images):
    stats = []
    for im in images:
        a = np.asarray(im.convert("RGBA"))
        m = a[..., 3] > 0
        if m.sum() >= 30:
            stats.append(sprite_stats(a[..., :3], m))
    return aggregate(stats)


def distance(p, q):
    """Weighted distance between two profiles (each stat normalised by the reference spread)."""
    d = 0.0
    for k in STATS:
        sd = max(q[k]["std"], 0.15 * abs(q[k]["mean"]), 1e-3)
        d += ((p[k]["mean"] - q[k]["mean"]) / sd) ** 2
    return float(np.sqrt(d / len(STATS)))


# ------------------------------------------------------------------ fitting the engine to a profile
PARAMS = {  # name: (low, high)
    "steps": (4, 9), "hue_shift": (6, 40), "spread": (0.5, 0.95), "contrast": (0.9, 2.2), "rough": (0.0, 0.9),
    "stroke_len": (1.5, 6.0), "dither": (0.0, 0.6), "outline_black": (0.0, 1.0), "outline_tone": (0.0, 3.0),
    "saturation": (0.4, 1.1),
}


def apply_style(spec, style):
    """Apply learned settings to a sprite spec (materials, strokes, outline)."""
    from .palette import parse_hex, to_hex
    spec = json.loads(json.dumps(spec))
    for m in spec.get("materials", {}).values():
        if "ramp" in m:
            continue
        if "base" in m and style.get("saturation", 1.0) != 1.0:
            r, g, b = (c / 255 for c in parse_hex(m["base"]))
            h, s_, v = colorsys.rgb_to_hsv(r, g, b)
            r, g, b = colorsys.hsv_to_rgb(h, min(1.0, s_ * float(style["saturation"])), v)
            m["base"] = to_hex((r * 255, g * 255, b * 255))
        m["steps"] = int(round(style["steps"]))
        m["hue_shift"] = float(style["hue_shift"])
        m["spread"] = float(style["spread"])
        if not m.get("emissive"):
            m["contrast"] = float(style["contrast"])
        if style.get("dither", 0) > 0.05:
            m["dither"] = float(style["dither"])
    spec["strokes"] = {"rough": float(style["rough"]), "length": float(style["stroke_len"])}
    if style.get("dither", 0) > 0.3:
        spec["paint"] = "flat"
    spec["outline"] = "black" if style.get("outline_black", 0) > 0.5 else "selout"
    spec["outline_tone"] = int(round(style.get("outline_tone", 0)))
    return spec


def fit(profile, generator="gem", samples=10, passes=2, size=None, seed=0, log=print, grid=5):
    """Coordinate descent over PARAMS on a grid, so the generator's sprites match `profile`."""
    from .sprite import render_sprite
    from .sprite_gen import GENERATORS
    gen = GENERATORS[generator]
    kw = {} if size is None else {"size": size}
    base = [gen(s, **kw) for s in range(samples)]

    def score(st):
        ims = [render_sprite(apply_style(b, st), i) for i, b in enumerate(base)]
        return distance(measure_images(ims), profile)
    cur = {"steps": 6, "hue_shift": 22, "spread": 0.8, "contrast": 1.5, "rough": 0.6, "stroke_len": 3.0,
           "dither": 0.0, "outline_black": 0.0, "outline_tone": 0.0, "saturation": 1.0}
    best = score(cur)
    log(f"start distance {best:.3f}")
    for p_ in range(passes):
        for k, (lo, hi) in PARAMS.items():
            for v in np.linspace(lo, hi, grid):
                cand = dict(cur, **{k: float(v)})
                sc = score(cand)
                if sc < best - 1e-4:
                    best, cur = sc, cand
                    log(f"  pass {p_} {k:13s} -> {v:.3f}   distance {best:.3f}")
    return cur, best


def save_style(name, style, profile, sources):
    os.makedirs(STYLE_DIR, exist_ok=True)
    path = os.path.join(STYLE_DIR, f"{name}.json")
    with open(path, "w") as fh:
        json.dump({"name": name, "settings": style, "profile": profile,
                   "learned_from": [os.path.basename(s) for s in sources]}, fh, indent=1)
    return path


def load_style(name):
    with open(os.path.join(STYLE_DIR, f"{name}.json") if not name.endswith(".json") else name) as fh:
        return json.load(fh)["settings"]
