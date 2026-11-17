"""Convert Poly Haven CC0 nature models for the ground cover with lowpix, then pixelise their textures.

    cd games/bushed && python3 tools/forest/models.py [asset ...]

1. `python -m lowpix convert polyhaven:<id> --style realistic` decimates the scan to a game budget, unwraps it and
   re-bakes the source colour into a compact atlas (real-world size kept via --height).
2. The atlas is turned into high-resolution pixel art here (palette from the photo, k-means in OKLab, nearest filter
   in the game), then written back into the .glb.
Output: public/assets/models/nature/<id>.glb (+ models.json with sizes and credits).
"""
import io
import json
import os
import struct
import subprocess
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import ph  # noqa: E402
from pix import despeckle, kmeans, quantize  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REPO = os.path.abspath(os.path.join(ROOT, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "models", "nature")
WORK = os.path.join(ph.CACHE, "conv")

# asset: (tris, atlas, colours, height override in m or None for the real size)
MODELS = {
    "tree_stump_01": (1400, 512, 40, None),
    "tree_stump_02": (1400, 512, 40, None),
    "dead_tree_trunk": (1100, 512, 36, None),
    "dead_tree_trunk_02": (2400, 1024, 44, None),
    "dry_branches_medium_01": (1200, 512, 32, None),
    "bark_debris_01": (500, 256, 28, None),
    "boulder_01": (900, 256, 32, None),
    "rock_07": (700, 256, 32, None),
    "rock_09": (600, 256, 32, None),
    "stone_01": (600, 256, 32, None),
    "rock_moss_set_01": (2600, 1024, 40, None),
    "rock_moss_set_02": (2400, 1024, 40, None),
}


def read_glb(path):
    data = open(path, "rb").read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67
    off = 12
    js, bin_ = None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf8"))
        elif ctype == 0x004E4942:
            bin_ = chunk
        off += 8 + clen
    return js, bin_


def write_glb(path, js, views):
    """views: list of bytes per bufferView (in order); rebuilds a single buffer"""
    out = bytearray()
    for i, v in enumerate(views):
        while len(out) % 4:
            out.append(0)
        js["bufferViews"][i]["byteOffset"] = len(out)
        js["bufferViews"][i]["byteLength"] = len(v)
        js["bufferViews"][i]["buffer"] = 0
        out += v
    while len(out) % 4:
        out.append(0)
    js["buffers"] = [{"byteLength": len(out)}]
    jb = json.dumps(js, separators=(",", ":")).encode("utf8")
    while len(jb) % 4:
        jb += b" "
    total = 12 + 8 + len(jb) + 8 + len(out)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(jb), 0x4E4F534A))
        f.write(jb)
        f.write(struct.pack("<II", len(out), 0x004E4942))
        f.write(out)


def pixelise_png(png_bytes, colours, seed=1):
    im = Image.open(io.BytesIO(png_bytes))
    has_a = im.mode in ("RGBA", "LA")
    rgba = np.asarray(im.convert("RGBA")).astype(np.float32) / 255
    rgb = rgba[..., :3]
    pal = kmeans(rgb.reshape(-1, 3), colours, seed=seed)
    q, idx = quantize(rgb, pal, dither=0.03)
    q, idx = despeckle(idx, pal)
    out = np.concatenate([q, rgba[..., 3:4]], -1) if has_a else q
    buf = io.BytesIO()
    Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA" if has_a else "RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def convert(asset):
    tris, atlas, colours, hover = MODELS[asset]
    info = ph.info(asset)
    dims = info.get("dimensions", [1000, 1000, 1000])
    height = hover or dims[2] / 1000.0
    work = os.path.join(WORK, asset)
    os.makedirs(work, exist_ok=True)
    glb = os.path.join(work, f"{asset}.glb")
    if not os.path.exists(glb):
        cmd = [sys.executable, "-m", "lowpix", "convert", f"polyhaven:{asset}", "--style", "realistic", "--tris", str(tris),
               "--atlas", str(atlas), "--height", f"{height:.4f}", "-o", work]
        print(" ".join(cmd), flush=True)
        subprocess.run(cmd, cwd=REPO, check=True)
    js, bin_ = read_glb(glb)
    views = [bytes(bin_[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]) for v in js["bufferViews"]]
    for img in js.get("images", []):
        bv = img.get("bufferView")
        if bv is None:
            continue
        views[bv] = pixelise_png(views[bv], colours)
        img["mimeType"] = "image/png"
    # nearest magnification, mipmapped minification
    for s in js.get("samplers", []):
        s["magFilter"] = 9728
        s["minFilter"] = 9987
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, f"{asset}.glb")
    write_glb(dst, js, views)
    print("wrote", dst, os.path.getsize(dst) // 1024, "KB", flush=True)
    return {"asset": asset, "file": f"models/nature/{asset}.glb", "height": round(height, 3),
            "size_mm": [round(d) for d in dims], "authors": list(info.get("authors", {}).keys()),
            "url": f"https://polyhaven.com/a/{asset}", "license": "CC0"}


def main():
    assets = sys.argv[1:] or list(MODELS)
    meta_path = os.path.join(OUT, "models.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for a in assets:
        try:
            meta[a] = convert(a)
        except Exception as e:  # keep going
            print("FAILED", a, e, flush=True)
        json.dump(meta, open(meta_path, "w"), indent=1)


if __name__ == "__main__":
    main()
