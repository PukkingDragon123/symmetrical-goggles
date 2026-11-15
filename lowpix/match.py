"""Line a model up with a 2D reference (a photo or concept art) and measure how well it matches.

A landmarks file describes the reference in normalised image coordinates (0..1, origin top-left):

    {"image": "refs/cub.jpg",            # optional: the reference itself, blended into the overlay
     "size": [643, 844],                 # the reference's pixel size (sets the aspect)
     "camera": {"yaw": 0, "pitch": 4, "fov": 30, "distance": 60},
     "anchors": ["eye_rim", "eye_rim_r"],  # landmarks used to solve scale + position (2 or more)
     "points": {"eye_rim": [0.703, 0.252], "nose": [0.505, 0.39],
                "ear": {"at": [0.85, 0.05], "mode": "top"}}}

Each key names a part (its centre is the landmark) or a "part:mode" ("top", "bottom", "left", "right",
"front" = extreme vertex in that direction). The camera is solved so the anchors land exactly, then every
other landmark's error is reported in percent of the image height, and an overlay image shows reference
(crosses) against model (circles), side by side with the render and, when given, the photo.
"""
from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageDraw

from .model import build_model
from .render import _camera, _image_plane, _rasterize, render


def _part_points(model, pid):
    pts = [f.pts @ i.world[:3, :3].T + i.world[:3, 3] for i in model.instances if i.id == pid for f in i.faces]
    if not pts:
        raise ValueError(f"no part instance {pid!r} (mirrored copies are '<id>_mirror')")
    return np.concatenate(pts)


def landmark_world(model, key, mode=None):
    pid, _, m = key.partition(":")
    mode = mode or m or "centre"
    P = _part_points(model, pid)
    if mode == "centre":
        return P.mean(axis=0)
    axis, sign = {"top": (1, 1), "bottom": (1, -1), "right": (0, 1), "left": (0, -1), "front": (2, 1),
                  "back": (2, -1)}[mode]
    return P[np.argmax(P[:, axis] * sign)]


def solve(model, ref):
    """Camera target/focal/shift so the anchor landmarks land on the reference. Returns (cam_args, report)."""
    W, H = ref["size"]
    c = ref.get("camera", {})
    yaw, pitch, fov = float(c.get("yaw", 0)), float(c.get("pitch", 0)), float(c.get("fov", 30))
    pts = {}
    for k, v in ref["points"].items():
        at, mode = (v["at"], v.get("mode")) if isinstance(v, dict) else (v, None)
        pts[k] = (np.asarray(at, float), landmark_world(model, k, mode))
    anchors = ref.get("anchors") or list(pts)[:2]
    T = np.mean([pts[a][1] for a in anchors], axis=0)
    dist = float(c.get("distance", 60.0))
    r = dist * np.sin(np.radians(fov) / 2) / 1.04 * (W / H if W < H else 1.0)
    cam = _camera(T, r, yaw, pitch, fov, W / H)
    # least squares for f, sx, sy:  u*W = W/2 + f*(nx - sx),  v*H = H/2 - f*(ny - sy)
    A, b = [], []
    for a in anchors:
        (u, v), P = pts[a]
        nx, ny, _ = _image_plane(cam, P[None])
        A.append([nx[0], -1, 0]); b.append(u * W - W / 2)            # f*nx - f*sx
        A.append([-ny[0], 0, 1]); b.append(v * H - H / 2)            # -f*ny + f*sy
    sol, *_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)
    f, fsx, fsy = sol
    sx, sy = fsx / f, fsy / f
    rep = {}
    for k, ((u, v), P) in pts.items():
        nx, ny, _ = _image_plane(cam, P[None])
        pu = (W / 2 + f * (nx[0] - sx)) / W
        pv = (H / 2 - f * (ny[0] - sy)) / H
        rep[k] = {"ref": [round(float(u), 4), round(float(v), 4)], "model": [round(float(pu), 4), round(float(pv), 4)],
                  "error_pct": round(float(np.hypot((pu - u) * W, (pv - v) * H) / H * 100), 2)}
    args = dict(yaw=yaw, pitch=pitch, fov=fov, target=T, focal=f, shift=(sx, sy), fit_pts=np.array([T + [r, 0, 0]]),
                cam=cam)
    return args, rep


def match(src, ref, out=None, scale=1.0, background="#20242e"):
    """Render `src` lined up with reference `ref` (a landmarks dict or .json). Returns (report, overlay image)."""
    if isinstance(ref, str):
        base = os.path.dirname(os.path.abspath(ref))
        with open(ref) as fh:
            ref = json.load(fh)
        if ref.get("image") and not os.path.isabs(ref["image"]):
            ref["image"] = os.path.join(base, ref["image"])
    model = build_model(src)
    W, H = ref["size"]
    w, h = int(W * scale), int(H * scale)
    args, rep = solve(model, ref)
    img = render(model, w, h, args["yaw"], args["pitch"], args["fov"], target=args["target"], focal=args["focal"] * scale,
                 shift=args["shift"], fit_pts=args["fit_pts"], background=background, shadow=False)
    panels = [img]
    if ref.get("image") and os.path.exists(ref["image"]):
        photo = Image.open(ref["image"]).convert("RGB").resize((w, h))
        panels.insert(0, photo)
        panels.append(Image.blend(photo, img, 0.5))
    marked = img.copy()
    d = ImageDraw.Draw(marked)
    for k, r in rep.items():
        (u, v), (pu, pv) = r["ref"], r["model"]
        x, y, px, py = u * w, v * h, pu * w, pv * h
        d.line([(x - 7, y), (x + 7, y)], fill=(255, 80, 80), width=2)
        d.line([(x, y - 7), (x, y + 7)], fill=(255, 80, 80), width=2)
        d.ellipse([px - 6, py - 6, px + 6, py + 6], outline=(90, 220, 255), width=2)
        d.line([(x, y), (px, py)], fill=(255, 220, 90), width=1)
        d.text((px + 8, py - 6), k, fill=(255, 255, 255))
    panels.append(marked)
    sheet = Image.new("RGB", (sum(p.width for p in panels) + 8 * (len(panels) - 1), h), (12, 12, 16))
    x = 0
    for p in panels:
        sheet.paste(p, (x, 0))
        x += p.width + 8
    rep_all = {"points": rep, "mean_error_pct": round(float(np.mean([r["error_pct"] for r in rep.values()])), 2)}
    if out:
        sheet.save(out)
    return rep_all, sheet


def project_photo(src, ref, photo, mode="palette", min_facing=0.12, strength=1.0):
    """Paint a reference photo onto the model from the solved camera (camera projection), so the model
    matches the photo 1:1 from that view. Texels facing away or hidden keep their painted look.

    mode "palette": projected colours snap to the model's own ramps (stays pixel art);
    "photo": the photo's true colours. Returns (model, report)."""
    if isinstance(ref, str):
        with open(ref) as fh:
            ref = json.load(fh)
    model = build_model(src)
    args, rep = solve(model, ref)
    W, H = ref["size"]
    cam, f, (sx, sy) = args["cam"], args["focal"], args["shift"]
    img = Image.open(photo).convert("RGB").resize((W, H), Image.LANCZOS)
    ph = np.asarray(img, float)

    def proj(P):
        nx, ny, cz = _image_plane(cam, P)
        return W / 2 + f * (nx - sx), H / 2 - f * (ny - sy), cz
    tris, uvs = model.world_triangles()
    u, v, cz = proj(tris.reshape(-1, 3))
    scr = np.stack([u, v], axis=-1).reshape(-1, 3, 2)
    zbuf = np.full((H, W), np.inf)
    _rasterize(scr, cz.reshape(-1, 3), uvs, model.atlas, np.zeros((H, W, 3), np.uint8), zbuf, W, H, True,
               flat=np.array([255, 255, 255], np.uint8))
    pal = model.palette.table.reshape(-1, 3).astype(float)
    pal = pal[np.any(pal > 0, axis=1) | (np.arange(len(pal)) == 0)]
    fwd = cam[3]
    painted = 0
    for inst in model.instances:
        Rm, t = inst.world[:3, :3], inst.world[:3, 3]
        for fc in inst.faces:
            n = Rm @ fc.normal
            n = n / max(np.linalg.norm(n), 1e-9)
            facing = float(-(n @ fwd))
            if facing < min_facing:
                continue
            P = fc.texel_positions(fc.W, fc.H) @ Rm.T + t
            pu, pv, pz = proj(P.reshape(-1, 3))
            iu, iv = np.floor(pu).astype(int), np.floor(pv).astype(int)
            ok = (iu >= 0) & (iu < W) & (iv >= 0) & (iv < H)
            iu, iv = np.clip(iu, 0, W - 1), np.clip(iv, 0, H - 1)
            ok &= pz <= zbuf[iv, iu] + 0.25
            if not ok.any():
                continue
            col = ph[iv, iu]
            if mode == "palette":
                d = ((col[:, None, :] - pal[None]) ** 2).sum(-1)
                col = pal[d.argmin(1)]
            wgt = np.clip((facing - min_facing) / 0.25, 0, 1) * strength
            x, y = fc.rect
            region = model.atlas[y:y + fc.H, x:x + fc.W, :3].reshape(-1, 3).astype(float)
            m = ok.reshape(-1)
            region[m] = region[m] * (1 - wgt) + col[m] * wgt
            model.atlas[y:y + fc.H, x:x + fc.W, :3] = region.reshape(fc.H, fc.W, 3).round().astype(np.uint8)
            painted += int(m.sum())
    return model, {"texels_from_photo": painted, "landmarks": rep}
