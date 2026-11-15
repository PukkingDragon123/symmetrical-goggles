"""Sketchfab: search for downloadable models and fetch them for `convert`, with licence and opt-out checks.

    python -m lowpix sketchfab search "low poly fox"          # downloadable, licence shown, noai-tagged hidden
    python -m lowpix sketchfab fetch <uid> -o out/_downloads  # needs a token (python -m lowpix auth set sketchfab)
    python -m lowpix convert sketchfab:<uid> --style pixel -o out/fox

Rules this module enforces (so an agent can't accidentally misuse someone's work):
* only models the author made downloadable;
* only licences in ALLOWED (Creative Commons and CC0); the licence and author are saved next to the download
  (ATTRIBUTION.json) and every converted model's report carries them, so you can credit the author;
* models tagged noai / no-ai (the author opting out of AI use) are refused.
"""
from __future__ import annotations

import io
import json
import os
import urllib.parse
import urllib.request
import zipfile

from .tokens import get_token

API = "https://api.sketchfab.com/v3"
ALLOWED = {"cc0", "by", "by-sa", "by-nd", "by-nc", "by-nc-sa", "by-nc-nd"}
OPT_OUT = {"noai", "no-ai", "no_ai", "notai", "noaitraining"}


def _open(url, token=None, data=None):
    from .convert import _open as _plain
    if token is None:
        return _plain(url)
    import ssl
    req = urllib.request.Request(url, headers={"User-Agent": "lowpix", "Authorization": f"Token {token}"}, data=data)
    ca = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
    ctx = ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()
    return urllib.request.urlopen(req, context=ctx, timeout=120)


LABELS = {"cc0": "cc0", "public domain": "cc0", "attribution": "by", "attribution-sharealike": "by-sa",
          "attribution-noderivs": "by-nd", "attribution-noncommercial": "by-nc",
          "attribution-noncommercial-sharealike": "by-nc-sa", "attribution-noncommercial-noderivs": "by-nc-nd"}


def _licence_slug(m):
    lic = m.get("license") or {}
    raw = (lic.get("slug") or lic.get("label") or "") if isinstance(lic, dict) else str(lic)
    raw = raw.lower().replace("cc-", "").replace("cc ", "").strip()
    if raw in ALLOWED:
        return raw
    key = raw.replace(" ", "-").replace("--", "-")
    return LABELS.get(raw, LABELS.get(key, key))


def opted_out(m) -> bool:
    return any((t.get("name") or t.get("slug") or "").lower() in OPT_OUT for t in m.get("tags", []))


def search(query: str, limit: int = 24, downloadable: bool = True):
    q = {"type": "models", "q": query, "count": min(24, limit)}
    if downloadable:
        q["downloadable"] = "true"
    data = json.load(_open(f"{API}/search?{urllib.parse.urlencode(q)}", get_token("sketchfab")))
    out = []
    for m in data.get("results", []):
        if opted_out(m):
            continue
        out.append({"uid": m["uid"], "name": m["name"], "author": (m.get("user") or {}).get("username"),
                    "licence": _licence_slug(m) or "?", "faces": m.get("faceCount"),
                    "downloadable": m.get("isDownloadable")})
    return out[:limit]


def fetch(uid: str, dest: str) -> str:
    """Download a downloadable, CC-licensed model's glTF into dest; returns the .gltf/.glb path."""
    token = get_token("sketchfab")
    meta = json.load(_open(f"{API}/models/{uid}", token))
    if opted_out(meta):
        raise PermissionError(f"{meta.get('name')!r} is tagged noai by its author; not using it")
    if not meta.get("isDownloadable"):
        raise PermissionError(f"{meta.get('name')!r} is not downloadable")
    lic = _licence_slug(meta)
    if lic not in ALLOWED:
        raise PermissionError(f"{meta.get('name')!r} has licence {lic!r}; only Creative Commons / CC0 are allowed")
    if not token and not os.path.exists("/root/.ccr/ca-bundle.crt"):
        raise PermissionError("Sketchfab downloads need an API token: python -m lowpix auth set sketchfab")
    info = json.load(_open(f"{API}/models/{uid}/download", token or None))
    entry = info.get("gltf") or info.get("glb")
    if not entry:
        raise ValueError(f"no glTF download offered for {uid}")
    os.makedirs(dest, exist_ok=True)
    blob = _open(entry["url"]).read()
    root = os.path.realpath(dest)
    if blob[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            for n in z.namelist():  # safe extraction: nothing may land outside dest
                target = os.path.realpath(os.path.join(root, n))
                if not target.startswith(root + os.sep) and target != root:
                    raise ValueError(f"unsafe path in archive: {n}")
            z.extractall(root)
    else:
        with open(os.path.join(root, "scene.glb"), "wb") as fh:
            fh.write(blob)
    user = meta.get("user") or {}
    with open(os.path.join(root, "ATTRIBUTION.json"), "w") as fh:
        json.dump({"name": meta.get("name"), "author": user.get("displayName") or user.get("username"),
                   "author_url": user.get("profileUrl"), "source": meta.get("viewerUrl"), "licence": lic,
                   "note": "Credit the author when you share anything made from this model."}, fh, indent=1)
    for base, _, files in os.walk(root):
        for f in sorted(files):
            if f.lower().endswith((".gltf", ".glb")):
                return os.path.join(base, f)
    raise ValueError("download contained no .gltf/.glb")
