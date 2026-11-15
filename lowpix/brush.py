"""A brush engine: paint a lit target the way a person would, in strokes that follow the form.

Light gives every pixel a target tone. A *flow field* says which way strokes run:
along a blade, around a dome, down a leg, across a fish's body. Everything here is
built on line-integral convolution (LIC), which averages a field along those flow
lines. It is vectorised, so a 1024x1024 texture paints in about a second.

* `stroke_field`: random brush strokes, i.e. streaks of a given length and width
  that run along the flow. Each pixel gets a value in about -1..1 telling how much
  lighter or darker its stroke was laid.
* `pixel_strokes`: hard-edged pixel art. The target tone is smeared along the
  flow, broken up by stroke streaks, then quantised onto the ramp, so tone clusters
  come out as elongated, interlocking strokes rather than smooth bands. Material
  `marks` (scratches, grain, chips, moss strands, scale glints) are added as short
  strokes one tone off.
* `painted`: continuous colour. It runs a block-in smear, stroke-to-stroke value
  and hue variation, bristle streaks inside each stroke, and crisp detail where
  the form turns. This is the look of a digital painting.
"""
from __future__ import annotations

import math

import numpy as np


# ----------------------------------------------------------------- utilities
def _blur3(a):
    p = np.pad(a, [(1, 1), (1, 1)] + [(0, 0)] * (a.ndim - 2), mode="edge")
    return (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:] + 2 * p[1:-1, :-2] + 4 * p[1:-1, 1:-1] + 2 * p[1:-1, 2:]
            + p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) / 16.0


def blur(a, r):
    """Separable box blur of radius r (pixels), applied twice for a soft kernel."""
    r = int(max(0, round(r)))
    if r == 0:
        return np.asarray(a, float)
    out = np.asarray(a, float)
    for _ in range(2):
        for ax in (0, 1):
            pad = [(0, 0)] * out.ndim
            pad[ax] = (r + 1, r)
            c = np.cumsum(np.pad(out, pad, mode="edge"), axis=ax)
            hi = np.take(c, np.arange(2 * r + 1, c.shape[ax]), axis=ax)
            lo = np.take(c, np.arange(0, c.shape[ax] - 2 * r - 1), axis=ax)
            out = (hi - lo) / (2 * r + 1)
    return out


def smooth_flow(F, mask, passes=2):
    """Smooth a sign-free direction field inside `mask` (doubled-angle averaging)."""
    a = np.arctan2(F[..., 1], F[..., 0])
    w = mask.astype(float)
    c, s = np.cos(2 * a) * w, np.sin(2 * a) * w
    for _ in range(passes):
        c, s, w = _blur3(c), _blur3(s), _blur3(w)
    a2 = 0.5 * np.arctan2(s, c)
    out = np.dstack([np.cos(a2), np.sin(a2)])
    return np.where(mask[..., None], out, F)


def lic(field, F, labels, length, step=None, falloff=True):
    """Average `field` along the flow lines of F for `length` pixels (both ways).

    `labels` (int array) stops a line where it would cross into another region,
    so strokes never bleed across parts or materials. field may be (H, W) or (H, W, C).
    """
    H, W = labels.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    xx += 0.5
    yy += 0.5
    f = np.asarray(field, float)
    vec = f.ndim == 3
    acc = f.copy()
    wsum = np.ones((H, W))
    if step is None:  # long strokes take bigger steps: at most ~16 samples each way
        step = max(0.6, length / 32)
    n = max(1, int(round(length / 2 / step)))
    lab0 = labels
    for sgn in (1.0, -1.0):
        x, y = xx.copy(), yy.copy()
        alive = np.ones((H, W), bool)
        dprev = F * sgn
        for k in range(n):
            ix = np.clip(x.astype(np.int64), 0, W - 1)
            iy = np.clip(y.astype(np.int64), 0, H - 1)
            d = F[iy, ix]
            flip = (d[..., 0] * dprev[..., 0] + d[..., 1] * dprev[..., 1]) < 0
            d = np.where(flip[..., None], -d, d)
            dprev = d
            x = x + d[..., 0] * step
            y = y + d[..., 1] * step
            inb = (x >= 0) & (x < W) & (y >= 0) & (y < H)
            ix = np.clip(x.astype(np.int64), 0, W - 1)
            iy = np.clip(y.astype(np.int64), 0, H - 1)
            alive &= inb & (labels[iy, ix] == lab0)
            w = alive * ((1 - (k + 1) / (n + 1)) if falloff else 1.0)
            acc += (f[iy, ix] * w[..., None]) if vec else f[iy, ix] * w
            wsum += w
    return acc / (wsum[..., None] if vec else wsum)


def stroke_field(labels, F, rng, length=6.0, width=1.5, sparsity=0.0):
    """Brush-stroke streaks along F: about -1..1 per pixel (std 1 inside regions).

    `width` sets how thick each stroke is across the flow, `length` how long it runs.
    `sparsity` (0..1) leaves gaps between strokes (values pushed toward 0).
    Wide strokes are computed on a coarser grid and upsampled (same look, far faster)."""
    H, W = labels.shape
    ds = int(max(1, min(width / 3.0, 8)))
    if ds > 1 and H >= 4 * ds and W >= 4 * ds:
        Hc, Wc = -(-H // ds), -(-W // ds)
        lab = np.pad(labels, ((0, Hc * ds - H), (0, Wc * ds - W)), mode="edge")[::ds, ::ds]
        Fc = np.pad(F, ((0, Hc * ds - H), (0, Wc * ds - W), (0, 0)), mode="edge")[::ds, ::ds]
        c = stroke_field(lab, Fc, rng, length / ds, width / ds, sparsity)
        up = np.kron(c, np.ones((ds, ds)))[:H, :W]
        up = blur(up, ds / 2)
        m = labels >= 0
        sd = float(up[m].std()) if m.any() else 1.0
        return up / max(sd, 1e-9)
    n = rng.standard_normal((H, W))
    if width > 1.05:
        n = blur(n, (width - 1) * 0.5) if width < 3 else blur(n, width / 2.5)
    if sparsity > 0:
        thr = np.quantile(np.abs(n), sparsity)
        n = np.where(np.abs(n) > thr, n, 0.0)
    s = lic(n, F, labels, length, falloff=False)
    m = labels >= 0
    sd = float(s[m].std()) if m.any() else 1.0
    return s / max(sd, 1e-9)


def marks_field(labels, F, rng, density, length, both=False):
    """Sparse short strokes (scratches, grain, strands): a boolean mask."""
    H, W = labels.shape
    seeds = (rng.random((H, W)) < density) & (labels >= 0)
    s = lic(seeds.astype(float), F, labels, length, step=0.5, falloff=False)
    n = max(1, int(round(length / 2 / 0.5)))
    return s > (0.6 / (2 * n + 1))


# --------------------------------------------------------------- pixel mode
MARKS = {
    # texture -> list of (flow: along|across, seed density, stroke length, tone delta)
    "metal": [("along", 0.010, 7, +1), ("along", 0.006, 4, -1)],
    "wood": [("along", 0.022, 12, -1), ("along", 0.006, 6, +1)],
    "stone": [("across", 0.012, 2, -1), ("along", 0.010, 3, +1)],
    "leather": [("across", 0.03, 2, -1)],
    "cloth": [("across", 0.035, 3, -1)],
    "crystal": [("along", 0.012, 8, +1)],
    "organic": [("along", 0.012, 3, -1), ("along", 0.008, 2, +1)],
    "scales": [("across", 0.02, 2, +1)],
    "moss": [("along", 0.05, 4, +1), ("along", 0.03, 3, -1)],
    "fur": [("along", 0.06, 5, +1), ("along", 0.05, 4, -1)],
    "liquid": [("along", 0.006, 5, +1)],
    "none": [],
}


def quantise(T, labels, F, rng, lo, hi, length=5.0, rough=0.6, overshoot=0.3, width=1.3, marks=(),
             mark_scale=1.0, protect=None):
    """Quantise a continuous tone T to integer ramp steps as pixel-art brush strokes along F.

    The target is smeared along the flow (`length` px), then offset by stroke streaks
    (`rough` tones), so cluster borders become elongated, interlocking strokes instead
    of smooth contour bands. `labels` (int, -1 = empty) keeps strokes inside their
    region. lo/hi may be arrays (per-pixel ramp limits). `marks` is a list of
    (mask, texture) pairs adding short strokes one tone off (see MARKS).
    """
    mask = labels >= 0
    L = float(np.mean(length)) if isinstance(length, (list, tuple)) else float(length)
    Ts = lic(np.where(mask, T, 0.0), F, labels, L * 0.8)
    a = float(np.clip(0.4 + overshoot, 0, 1))
    Ts = np.where(mask, (1 - a) * T + a * Ts, T)
    sf = stroke_field(labels, F, rng, length=L * 1.2, width=width)
    t = Ts + rough * 0.5 * np.clip(sf, -2.2, 2.2)
    idx = np.clip(np.floor(t + 0.5), lo, hi).astype(np.int64)
    if protect is not None:  # specular dabs stay where the light put them
        idx = np.where(protect & mask, np.clip(np.floor(T + 0.5), lo, hi).astype(np.int64), idx)
    perp = np.dstack([-F[..., 1], F[..., 0]])
    for mmask, tex in marks:
        for flow, dens, mlen, delta in MARKS.get(tex, []):
            mm = marks_field(labels, F if flow == "along" else perp, rng, dens * mark_scale, mlen * max(1.0, L / 5))
            mm &= mmask & mask
            if protect is not None:
                mm &= ~protect
            idx = np.where(mm, np.clip(idx + delta, lo, hi), idx)
    return idx


def pixel_strokes(T, mask, F, rng, lo, hi, length=(2, 6), rough=0.35, overshoot=0.3, marks="none",
                  mark_scale=1.0, protect=None, labels=None, width=1.3):
    """`quantise` for one region with a single texture; -1 outside `mask`."""
    if labels is None:
        labels = np.where(mask, 0, -1)
    idx = quantise(T, labels, F, rng, lo, hi, length=length, rough=rough, overshoot=overshoot, width=width,
                   marks=[(mask, marks)] if marks and marks != "none" else [], mark_scale=mark_scale, protect=protect)
    return np.where(mask, idx, -1)


# ------------------------------------------------------------- painted mode
def painted(target, labels, F, rng, length=10.0, width=3.0, value=0.06, hue=0.03, bristle=0.05, detail=None,
            detail_length=3.0):
    """Repaint a continuous-colour target (H, W, 3 floats 0..1) with brush strokes.

    length/width: stroke size in pixels. value/hue: how much each stroke's value and
    colour wander. bristle: streaks inside a stroke. detail: mask of pixels (edges,
    sharp turns) painted with short strokes so the form stays crisp.
    """
    mask = labels >= 0
    base = lic(target, F, labels, length * 0.7)                       # block-in smear along the form
    if detail is not None:
        sharp = lic(target, F, labels, detail_length)
        k = blur(detail.astype(float), 1)[..., None]
        base = base * (1 - k) + sharp * k
    sv = stroke_field(labels, F, rng, length=length, width=width)    # stroke-to-stroke value
    sh = np.dstack([stroke_field(labels, F, rng, length=length, width=width) for _ in range(2)])
    br = stroke_field(labels, F, rng, length=length * 0.8, width=1.0)  # bristles inside strokes
    lum = 1 + value * np.clip(sv, -2.5, 2.5) + bristle * np.clip(br, -2.5, 2.5)
    out = base * lum[..., None]
    # hue wander: push red/blue in opposite directions, stroke by stroke
    out[..., 0] += hue * sh[..., 0] * 0.5
    out[..., 2] += hue * sh[..., 1] * 0.5
    out[..., 1] += hue * (sh[..., 0] - sh[..., 1]) * 0.15
    return np.where(mask[..., None], np.clip(out, 0, 1), 0.0)
