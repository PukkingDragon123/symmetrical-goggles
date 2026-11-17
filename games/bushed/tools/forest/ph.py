"""Poly Haven fetch helper (CC0 assets). Downloads into ~/.cache/bushed-forest (outside the repo).

    python3 tools/forest/ph.py <asset_id> <map> [<map> ...] [--res 1k|2k]
    e.g. python3 tools/forest/ph.py pine_bark diff nor_gl --res 2k
"""
import json
import os
import sys
import urllib.request

CACHE = os.path.expanduser("~/.cache/bushed-forest")
UA = {"User-Agent": "bushed-forest-tools/0.1"}


def _open(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120)


_files = {}


def files(asset):
    if asset not in _files:
        p = os.path.join(CACHE, f"{asset}.files.json")
        if os.path.exists(p):
            _files[asset] = json.load(open(p))
        else:
            os.makedirs(CACHE, exist_ok=True)
            _files[asset] = json.load(_open(f"https://api.polyhaven.com/files/{asset}"))
            json.dump(_files[asset], open(p, "w"))
    return _files[asset]


def info(asset):
    p = os.path.join(CACHE, f"{asset}.info.json")
    if os.path.exists(p):
        return json.load(open(p))
    d = json.load(_open(f"https://api.polyhaven.com/info/{asset}"))
    json.dump(d, open(p, "w"))
    return d


def fetch(asset, key, res="1k", prefer=("png", "jpg")):
    """download one texture map (e.g. 'diff', 'nor_gl', 'twig_alpha') and return its local path"""
    d = files(asset)
    if key not in d:
        # texture assets: maps are named 'Diffuse', 'nor_gl', ... ; model assets: 'twig_diff', ...
        alias = {"diff": "Diffuse", "disp": "Displacement", "rough": "Rough", "ao": "AO"}.get(key)
        if alias and alias in d:
            key = alias
        else:
            raise KeyError(f"{asset}: no map {key}; have {list(d.keys())}")
    ent = d[key][res]
    fmt = next((f for f in prefer if f in ent), list(ent.keys())[0])
    url = ent[fmt]["url"]
    fn = os.path.join(CACHE, f"{asset}_{key}_{res}.{fmt}")
    if not os.path.exists(fn):
        os.makedirs(CACHE, exist_ok=True)
        with _open(url) as r, open(fn + ".part", "wb") as f:
            f.write(r.read())
        os.replace(fn + ".part", fn)
    return fn


def fetch_gltf(asset, res="1k"):
    """download a model's glTF (+bin +textures) into the cache; returns the .gltf path"""
    d = files(asset)["gltf"][res]["gltf"]
    root = os.path.join(CACHE, "models", asset)
    os.makedirs(root, exist_ok=True)
    main = os.path.join(root, os.path.basename(d["url"]))
    if not os.path.exists(main):
        with _open(d["url"]) as r:
            open(main, "wb").write(r.read())
    for rel, ent in d.get("include", {}).items():
        p = os.path.join(root, rel)
        if not os.path.exists(p):
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with _open(ent["url"]) as r:
                open(p, "wb").write(r.read())
    return main


if __name__ == "__main__":
    args = sys.argv[1:]
    res = "1k"
    if "--res" in args:
        i = args.index("--res"); res = args[i + 1]; del args[i:i + 2]
    asset, keys = args[0], args[1:]
    for k in keys:
        print(fetch(asset, k, res))
