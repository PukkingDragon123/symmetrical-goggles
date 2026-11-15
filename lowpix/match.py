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


def subject_mask(ref, W, H, photo_arr=None):
    """Where the subject is in the reference: inside its traced `outline` (normalised polygon, optional) and not
    the smooth background colour flood-filled from the top corners."""
    from PIL import ImageDraw as _D
    m = np.ones((H, W), bool)
    if ref.get("outline"):
        poly = Image.new("L", (W, H), 0)
        _D.Draw(poly).polygon([(x * W, y * H) for x, y in ref["outline"]], fill=255)
        m &= np.asarray(poly) > 0
    if photo_arr is not None:
        from collections import deque

        from .brush import blur
        lum = photo_arr @ np.array([0.3, 0.59, 0.11])
        sd = np.sqrt(np.maximum(blur(lum * lum, 3) - blur(lum, 3) ** 2, 0))
        bg = np.concatenate([photo_arr[:20, :30].reshape(-1, 3), photo_arr[:20, -30:].reshape(-1, 3)]).mean(0)
        cand = (np.linalg.norm(photo_arr - bg, axis=-1) < 55) & (sd < 9)
        seen = np.zeros((H, W), bool)
        q = deque([(0, 0), (0, W - 1), (0, W // 2)])
        for y, x in q:
            seen[y, x] = True
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and not seen[yy, xx] and cand[yy, xx]:
                    seen[yy, xx] = True
                    q.append((yy, xx))
        m &= ~seen
    return m


def silhouette(model, cam, f, shift, W, H, ids=None):
    """Mask of the model (or of instances `ids`) seen from the matched camera."""
    sx, sy = shift
    tris = []
    for inst in model.instances:
        if ids is not None and inst.id not in ids:
            continue
        Rm, t = inst.world[:3, :3], inst.world[:3, 3]
        for fc in inst.faces:
            wp = fc.pts @ Rm.T + t
            tris += [wp[list(tr)] for tr in fc.tris]
    if not tris:
        return np.zeros((H, W), bool)
    T = np.array(tris)
    nx, ny, cz = _image_plane(cam, T.reshape(-1, 3))
    scr = np.stack([W / 2 + f * (nx - sx), H / 2 - f * (ny - sy)], axis=-1).reshape(-1, 3, 2)
    zbuf = np.full((H, W), np.inf)
    uv = np.zeros((len(T), 3, 2))
    _rasterize(scr, cz.reshape(-1, 3), uv, model.atlas, np.zeros((H, W, 3), np.uint8), zbuf, W, H, False,
               flat=np.array([255, 255, 255], np.uint8))
    return np.isfinite(zbuf)


def fit_outline(model, ref, args, subj, parts, passes=3, smooth=31, clamp=(0.75, 1.7), fade=60):
    """Deform the outline parts so the model's silhouette matches the reference's, row by row.

    Every vertex of `parts` (part ids; mirrored copies follow) moves sideways in camera space, scaled about the
    eye centre line by (photo half-width / model half-width) at its row, separately left and right. Interior
    features (eyes, nose, paws) are left alone, so the landmarks stay put. Returns the silhouette IoU."""
    from .brush import blur
    W, H = ref["size"]
    cam, f, shift = args["cam"], args["focal"], args["shift"]
    sx, sy = shift
    eyes = [ref["points"][k] for k in (ref.get("anchors") or [])[:2]]
    cx = float(np.mean([e[0] if not isinstance(e, dict) else e["at"][0] for e in eyes])) * W if eyes else W / 2
    ids = {i.id for i in model.instances if i.src_id in parts or i.id in parts}
    rows = np.arange(H)

    def edges(mask):
        L = np.full(H, np.nan)
        Rr = np.full(H, np.nan)
        for y in range(H):
            xs = np.nonzero(mask[y])[0]
            if len(xs):
                L[y], Rr[y] = xs[0], xs[-1] + 1
        return L, Rr
    Lp, Rp = edges(subj)
    for _ in range(passes):
        Lm, Rm_ = edges(silhouette(model, cam, f, shift, W, H))
        ok = ~np.isnan(Lm) & ~np.isnan(Lp)
        if not ok.any():
            break
        rl = np.where(ok, (cx - Lp) / np.maximum(cx - Lm, 1.0), np.nan)
        rr = np.where(ok, (Rp - cx) / np.maximum(Rm_ - cx, 1.0), np.nan)
        for r in (rl, rr):  # fill gaps from the nearest measured row, then smooth along the height
            good = ~np.isnan(r)
            r[~good] = np.interp(rows[~good], rows[good], r[good])
        rl = np.clip(blur(rl[:, None], smooth)[:, 0], *clamp)
        rr = np.clip(blur(rr[:, None], smooth)[:, 0], *clamp)
        right = cam[1]
        for inst in model.instances:
            if inst.id not in ids:
                continue
            Wm = inst.world
            Winv = np.linalg.inv(Wm)
            for fc in inst.faces:
                wp = fc.pts @ Wm[:3, :3].T + Wm[:3, 3]
                nx, ny, cz = _image_plane(cam, wp)
                u = W / 2 + f * (nx - sx)
                vf = H / 2 - f * (ny - sy)
                v = np.clip(vf.astype(int), 0, H - 1)
                ratio = np.where(u < cx, rl[v], rr[v])
                # outside the frame the photo says nothing: fade the fit out instead of copying the edge row
                out = np.maximum(np.maximum(-vf, vf - (H - 1)), 0)
                ratio = 1 + (ratio - 1) * np.clip(1 - out / fade, 0, 1)
                du = (cx + (u - cx) * ratio) - u
                wp2 = wp + right[None] * (du * cz / f)[:, None]
                fc.pts = (np.c_[wp2, np.ones(len(wp2))] @ Winv.T)[:, :3]
    m = silhouette(model, cam, f, shift, W, H)
    return float((m & subj).sum() / max((m | subj).sum(), 1))


def photo_palette(photo_arr, mask, k=18, seed=0):
    """A pixel-art palette taken from the photo itself: k-means on the subject's colours."""
    px = photo_arr[mask].reshape(-1, 3)
    rng = np.random.default_rng(seed)
    px = px[rng.choice(len(px), min(len(px), 20000), replace=False)]
    C = px[rng.choice(len(px), k, replace=False)]
    for _ in range(25):
        lab = ((px[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
        C = np.array([px[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
    return C


def project_photo(src, ref, photo, mode="palette", min_facing=0.06, strength=1.0, density=None, colours=18,
                  harmonise=True):
    """Paint a reference photo onto the model from the solved camera (camera projection), so the model
    matches the photo 1:1 from that view. Texels facing away, hidden, or outside the subject keep their
    painted look; small gaps along face edges are filled from their neighbours.

    mode "photo": the photo's true colours; "palette": snapped to a pixel-art palette of `colours`
    extracted from the photo (stylised). `density` raises the texel density for a crisper projection."""
    if isinstance(ref, str):
        with open(ref) as fh:
            ref = json.load(fh)
    from .spec import load_spec
    spec = load_spec(src)
    if density:
        spec = dict(spec, density=float(density))
    model = build_model(spec)
    args, rep = solve(model, ref)
    W, H = ref["size"]
    cam, f, (sx, sy) = args["cam"], args["focal"], args["shift"]
    img = Image.open(photo).convert("RGB").resize((W, H), Image.LANCZOS)
    ph = np.asarray(img, float)
    subj = subject_mask(ref, W, H, ph)
    pal = photo_palette(ph, subj, colours) if mode == "palette" else None
    iou = None
    if ref.get("outline_parts"):  # deform the outline parts so the silhouette matches the photo's
        iou = fit_outline(model, ref, args, subj, set(ref["outline_parts"]))

    def proj(P):
        nx, ny, cz = _image_plane(cam, P)
        return W / 2 + f * (nx - sx), H / 2 - f * (ny - sy), cz
    tris, uvs = model.world_triangles()
    u, v, cz = proj(tris.reshape(-1, 3))
    scr = np.stack([u, v], axis=-1).reshape(-1, 3, 2)
    zbuf = np.full((H, W), np.inf)
    _rasterize(scr, cz.reshape(-1, 3), uvs, model.atlas, np.zeros((H, W, 3), np.uint8), zbuf, W, H, True,
               flat=np.array([255, 255, 255], np.uint8))
    fwd = cam[3]
    painted = 0
    projected = np.zeros(model.atlas.shape[:2], bool)
    if harmonise:  # what the photo can't see takes the photo's colour statistics (no clash at other angles)
        opaque = model.atlas[..., 3] > 0
        src_px = model.atlas[..., :3][opaque].astype(float)
        mu_a, sd_a = src_px.mean(0), src_px.std(0) + 1e-6
        mu_p, sd_p = ph[subj].mean(0), ph[subj].std(0)
        g = (src_px - mu_a) / sd_a * sd_p + mu_p
        if pal is not None:
            g = pal[((g[:, None, :] - pal[None]) ** 2).sum(-1).argmin(1)]
        model.atlas[..., :3][opaque] = np.clip(g, 0, 255).round().astype(np.uint8)
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
            ok &= (pz <= zbuf[iv, iu] + 0.25) & subj[iv, iu]
            if not ok.any():
                continue
            col = ph[iv, iu]
            wgt = np.clip((facing - min_facing) / 0.2, 0, 1) * strength
            x, y = fc.rect
            region = model.atlas[y:y + fc.H, x:x + fc.W, :3].astype(float)
            okm = ok.reshape(fc.H, fc.W)
            colm = col.reshape(fc.H, fc.W, 3)
            # fill texels along edges / behind tiny occluders from projected neighbours (no seams)
            for _ in range(3):
                if okm.all():
                    break
                grow = okm.copy()
                acc = np.zeros_like(colm)
                cnt = np.zeros(okm.shape)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    sh_ok = np.roll(np.roll(okm, dy, 0), dx, 1)
                    sh_c = np.roll(np.roll(colm, dy, 0), dx, 1)
                    acc += sh_c * sh_ok[..., None]
                    cnt += sh_ok
                new = ~okm & (cnt > 0)
                colm = np.where(new[..., None], acc / np.maximum(cnt, 1)[..., None], colm)
                okm = okm | new
            if pal is not None:
                d = ((colm[..., None, :] - pal[None, None]) ** 2).sum(-1)
                colm = pal[d.argmin(-1)]
            region = np.where(okm[..., None], region * (1 - wgt) + colm * wgt, region)
            model.atlas[y:y + fc.H, x:x + fc.W, :3] = region.round().astype(np.uint8)
            projected[y:y + fc.H, x:x + fc.W] |= okm
            painted += int(okm.sum())
    # refresh the 1-texel gutters so sampling never bleeds old colours
    for inst in model.instances:
        for fc in inst.faces:
            x, y = fc.rect
            a_ = model.atlas
            a_[y - 1, x:x + fc.W] = a_[y, x:x + fc.W]
            a_[y + fc.H, x:x + fc.W] = a_[y + fc.H - 1, x:x + fc.W]
            a_[y - 1:y + fc.H + 1, x - 1] = a_[y - 1:y + fc.H + 1, x]
            a_[y - 1:y + fc.H + 1, x + fc.W] = a_[y - 1:y + fc.H + 1, x + fc.W - 1]
    return model, {"texels_from_photo": painted, "landmarks": rep, "args": args, "silhouette_iou": iou}
