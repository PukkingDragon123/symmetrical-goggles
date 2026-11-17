"""Pixel-art helpers for the forest texture pipeline (numpy + Pillow only).

Photo -> high-resolution pixel art: area-downsample to the target texel density, flatten large-scale lighting,
quantise onto a k-means palette extracted from the photo (rich photo colour, crisp texels), hard alpha.
"""
import numpy as np
from PIL import Image, ImageFilter


def load_rgb(path, size=None):
    im = Image.open(path).convert("RGB")
    if size:
        im = im.resize(size, Image.Resampling.BOX if im.width >= size[0] else Image.Resampling.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def load_l(path, size=None):
    im = Image.open(path).convert("L")
    if size:
        im = im.resize(size, Image.Resampling.BOX if im.width >= size[0] else Image.Resampling.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def to_img(a, mode=None):
    a = np.clip(a * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(a, mode) if mode else Image.fromarray(a)


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def luminance(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def blur(a, radius, wrap=True):
    """gaussian blur of a float array (H, W[, C]); wrap-around for tileable textures"""
    if radius <= 0:
        return a.copy()
    h, w = a.shape[:2]
    pad = int(radius * 3) + 1
    x = np.arange(-pad, pad + 1, dtype=np.float32)
    k = np.exp(-0.5 * (x / radius) ** 2)
    k /= k.sum()
    mode = "wrap" if wrap else "edge"
    b = np.pad(a.astype(np.float32), ((pad, pad), (pad, pad)) + ((0, 0),) * (a.ndim - 2), mode=mode)
    # separable convolution
    out = np.zeros_like(b)
    for i, kv in enumerate(k):
        out += kv * np.roll(b, i - pad, 0)
    b = out
    out = np.zeros_like(b)
    for i, kv in enumerate(k):
        out += kv * np.roll(b, i - pad, 1)
    return out[pad:pad + h, pad:pad + w]


def flatten_light(rgb, radius, amount=0.7):
    """divide out low-frequency luminance (removes baked large-scale light), keep local contrast"""
    lum = luminance(rgb) + 1e-3
    low = blur(lum, radius)
    mean = lum.mean()
    gain = (mean / low) ** amount
    return np.clip(rgb * gain[..., None], 0, 1)


def to_lab(rgb):
    # cheap perceptual space: OKLab
    l = srgb_to_lin(rgb)
    L = 0.4122214708 * l[..., 0] + 0.5363325363 * l[..., 1] + 0.0514459929 * l[..., 2]
    M = 0.2119034982 * l[..., 0] + 0.6806995451 * l[..., 1] + 0.1073969566 * l[..., 2]
    S = 0.0883024619 * l[..., 0] + 0.2817188376 * l[..., 1] + 0.6299787005 * l[..., 2]
    L, M, S = np.cbrt(L), np.cbrt(M), np.cbrt(S)
    return np.stack([
        0.2104542553 * L + 0.7936177850 * M - 0.0040720468 * S,
        1.9779984951 * L - 2.4285922050 * M + 0.4505937099 * S,
        0.0259040371 * L + 0.7827717662 * M - 0.8086757660 * S,
    ], -1)


def kmeans(px, k, iters=16, seed=1):
    """k-means in OKLab on an (N, 3) sRGB array -> (k, 3) sRGB palette (sorted by lightness)"""
    rng = np.random.default_rng(seed)
    lab = to_lab(px)
    if len(lab) > 60000:
        sel = rng.choice(len(lab), 60000, replace=False)
        lab_s, px_s = lab[sel], px[sel]
    else:
        lab_s, px_s = lab, px
    # k-means++ init
    cent = [lab_s[rng.integers(len(lab_s))]]
    for _ in range(1, k):
        d = np.min(((lab_s[:, None, :] - np.array(cent)[None]) ** 2).sum(-1), 1)
        cent.append(lab_s[rng.choice(len(lab_s), p=d / d.sum())])
    cent = np.array(cent)
    for _ in range(iters):
        d = ((lab_s[:, None, :] - cent[None]) ** 2).sum(-1)
        lab_idx = d.argmin(1)
        for j in range(k):
            m = lab_idx == j
            if m.any():
                cent[j] = lab_s[m].mean(0)
    d = ((lab_s[:, None, :] - cent[None]) ** 2).sum(-1)
    idx = d.argmin(1)
    pal = np.array([px_s[idx == j].mean(0) if (idx == j).any() else px_s[0] for j in range(k)])
    order = np.argsort(luminance(pal))
    return pal[order]


def quantize(rgb, pal, dither=0.0, seed=3):
    """map every pixel to the nearest palette colour in OKLab (optional ordered dither)"""
    h, w = rgb.shape[:2]
    src = rgb
    if dither > 0:
        bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16 - 0.47
        t = np.tile(bayer, (h // 4 + 1, w // 4 + 1))[:h, :w]
        src = np.clip(rgb + t[..., None] * dither, 0, 1)
    lab = to_lab(src.reshape(-1, 3))
    plab = to_lab(pal)
    out = np.empty((lab.shape[0],), np.int32)
    step = 65536
    for i in range(0, len(lab), step):
        d = ((lab[i:i + step, None, :] - plab[None]) ** 2).sum(-1)
        out[i:i + step] = d.argmin(1)
    return pal[out].reshape(h, w, 3), out.reshape(h, w)


def despeckle(idx, pal, passes=1):
    """replace isolated single texels by their majority neighbour (cleaner pixel clusters)"""
    h, w = idx.shape
    for _ in range(passes):
        nb = np.stack([np.roll(idx, s, a) for a in (0, 1) for s in (-1, 1)], -1)
        same = (nb == idx[..., None]).sum(-1)
        lone = same == 0
        # majority of neighbours
        maj = np.apply_along_axis(lambda v: np.bincount(v).argmax(), -1, nb[lone]) if lone.any() else None
        if lone.any():
            idx = idx.copy()
            idx[lone] = maj
    return pal[idx], idx


def normal_from_height(hgt, strength=2.0, wrap=True):
    if wrap:
        dx = np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)
        dy = np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)
    else:
        dx = np.gradient(hgt, axis=1) * 2
        dy = np.gradient(hgt, axis=0) * 2
    n = np.stack([-dx * strength, dy * strength, np.ones_like(hgt)], -1)  # OpenGL convention (+Y up in image = -row)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def load_normal(path, size):
    n = load_rgb(path, size) * 2 - 1
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6
    return n * 0.5 + 0.5


def combine_normals(a, b):
    """whiteout blend of two encoded normal maps"""
    a = a * 2 - 1
    b = b * 2 - 1
    n = np.stack([a[..., 0] + b[..., 0], a[..., 1] + b[..., 1], a[..., 2] * b[..., 2]], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def bleed(rgb, alpha, iters=24):
    """push opaque colours outward into transparent texels (no dark fringes in mipmaps)"""
    rgb = rgb.copy()
    known = alpha > 0.5
    acc = rgb * known[..., None]
    wts = known.astype(np.float32)
    for _ in range(iters):
        if known.all():
            break
        s = np.zeros_like(acc)
        c = np.zeros_like(wts)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                s += np.roll(np.roll(acc, dy, 0), dx, 1)
                c += np.roll(np.roll(wts, dy, 0), dx, 1)
        new = (~known) & (c > 0)
        acc[new] = s[new] / c[new][:, None]
        wts[new] = 1
        known = known | new
    rgb[~(alpha > 0.5)] = acc[~(alpha > 0.5)]
    # fill anything left with the mean opaque colour
    if (~known).any():
        rgb[~known] = rgb[alpha > 0.5].mean(0) if (alpha > 0.5).any() else 0.3
    return rgb


def hsv_adjust(rgb, hue=0.0, sat=1.0, val=1.0):
    im = to_img(rgb).convert("HSV")
    a = np.asarray(im).astype(np.float32)
    a[..., 0] = (a[..., 0] + hue * 255) % 255
    a[..., 1] = np.clip(a[..., 1] * sat, 0, 255)
    a[..., 2] = np.clip(a[..., 2] * val, 0, 255)
    return np.asarray(Image.fromarray(a.astype(np.uint8), "HSV").convert("RGB")).astype(np.float32) / 255


def save_rgba(path, rgb, alpha):
    a = np.concatenate([rgb, alpha[..., None]], -1)
    to_img(a, "RGBA").save(path, optimize=True)


def save_rgb(path, rgb):
    to_img(rgb, "RGB").save(path, optimize=True)
