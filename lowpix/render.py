"""Unlit software rasteriser (numpy) for previews, contact sheets and turntables.

Agents can't open a 3D viewport, so every build renders to PNG: nearest
texture sampling, alpha test, perspective-correct uvs, z-buffer, optional
ground drop shadow. Output matches what an unlit, nearest-filtered glTF
viewer shows.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .palette import parse_hex


def _camera(target, radius, yaw, pitch, fov, aspect):
    y, p = math.radians(yaw), math.radians(pitch)
    d = radius / math.sin(math.radians(fov) / 2) * 1.04
    if aspect < 1:
        d /= aspect
    eye = target + d * np.array([math.cos(p) * math.sin(y), math.sin(p), math.cos(p) * math.cos(y)])
    fwd = target - eye
    fwd /= np.linalg.norm(fwd)
    up = np.array([0.0, 1.0, 0.0])
    if abs(np.dot(fwd, up)) > 0.999:
        up = np.array([0.0, 0.0, -1.0])
    right = np.cross(fwd, up)
    right /= np.linalg.norm(right)
    up2 = np.cross(right, fwd)
    return eye, right, up2, fwd


def _raster_batch(scr, z, uvs, tex, color, zbuf, W, H, alpha_test, flat, nrm, bilinear, light, sel, S):
    """Vectorised rasterisation of many small triangles (bbox <= S px) in one go.
    Depth conflicts inside the batch are resolved by sorting; the z-buffer handles the rest."""
    TH, TW = tex.shape[:2]
    for c0 in range(0, len(sel), max(1, 600000 // (S * S))):
        k = sel[c0:c0 + max(1, 600000 // (S * S))]
        p = scr[k]                                         # (n,3,2)
        x0 = np.floor(p[..., 0].min(1)).astype(np.int64)
        y0 = np.floor(p[..., 1].min(1)).astype(np.int64)
        oy, ox = np.divmod(np.arange(S * S), S)
        X = x0[:, None] + ox[None]                         # (n, S*S)
        Y = y0[:, None] + oy[None]
        Xc, Yc = X + 0.5, Y + 0.5
        (ax_, ay_), (bx_, by_), (cx_, cy_) = [(p[:, i, 0][:, None], p[:, i, 1][:, None]) for i in range(3)]
        area = (bx_ - ax_) * (cy_ - ay_) - (cx_ - ax_) * (by_ - ay_)
        area = np.where(np.abs(area) < 1e-12, 1e-12, area)
        w0 = ((bx_ - Xc) * (cy_ - Yc) - (cx_ - Xc) * (by_ - Yc)) / area
        w1 = ((cx_ - Xc) * (ay_ - Yc) - (ax_ - Xc) * (cy_ - Yc)) / area
        w2 = 1.0 - w0 - w1
        m = (w0 >= -1e-7) & (w1 >= -1e-7) & (w2 >= -1e-7) & (X >= 0) & (X < W) & (Y >= 0) & (Y < H)
        ti, ci = np.nonzero(m)
        if not len(ti):
            continue
        kk = k[ti]
        w0, w1, w2 = w0[ti, ci], w1[ti, ci], w2[ti, ci]
        zz = z[kk]
        iz = w0 / zz[:, 0] + w1 / zz[:, 1] + w2 / zz[:, 2]
        depth = 1.0 / np.maximum(iz, 1e-12)
        uu = uvs[kk]
        u = (w0 * uu[:, 0, 0] / zz[:, 0] + w1 * uu[:, 1, 0] / zz[:, 1] + w2 * uu[:, 2, 0] / zz[:, 2]) / iz
        v = (w0 * uu[:, 0, 1] / zz[:, 0] + w1 * uu[:, 1, 1] / zz[:, 1] + w2 * uu[:, 2, 1] / zz[:, 2]) / iz
        tx = np.clip(np.floor(u * TW).astype(np.int64), 0, TW - 1)
        ty = np.clip(np.floor(v * TH).astype(np.int64), 0, TH - 1)
        keep = tex[ty, tx, 3] > 127 if alpha_test else np.ones(len(kk), bool)
        pix = Y[ti, ci] * W + X[ti, ci]
        idx = np.nonzero(keep)[0]
        if not len(idx):
            continue
        order = idx[np.lexsort((depth[idx], pix[idx]))]
        first = np.r_[True, pix[order][1:] != pix[order][:-1]]
        win = order[first]
        zflat = zbuf.reshape(-1)
        win = win[depth[win] < zflat[pix[win]]]
        if not len(win):
            continue
        cflat = color.reshape(-1, 3)
        if flat is not None:
            cflat[pix[win]] = flat
        else:
            if bilinear:
                fx, fy = u[win] * TW - 0.5, v[win] * TH - 0.5
                x0b, y0b = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
                ax, ay = (fx - x0b)[:, None], (fy - y0b)[:, None]
                xa, xb = np.clip(x0b, 0, TW - 1), np.clip(x0b + 1, 0, TW - 1)
                ya, yb = np.clip(y0b, 0, TH - 1), np.clip(y0b + 1, 0, TH - 1)
                t = tex[..., :3].astype(np.float32)
                rgb = (t[ya, xa] * (1 - ax) + t[ya, xb] * ax) * (1 - ay) + (t[yb, xa] * (1 - ax) + t[yb, xb] * ax) * ay
            else:
                rgb = tex[ty[win], tx[win], :3].astype(np.float32)
            if nrm is not None:
                nk = nrm[kk[win]]
                zw = zz[win]
                nn = ((w0[win] / zw[:, 0])[:, None] * nk[:, 0] + (w1[win] / zw[:, 1])[:, None] * nk[:, 1]
                      + (w2[win] / zw[:, 2])[:, None] * nk[:, 2])
                nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
                shade = 0.48 + 0.62 * np.clip(nn @ light, 0, None) + 0.08 * np.clip(nn[:, 1], 0, None)
                rgb = rgb * shade[:, None]
            cflat[pix[win]] = np.clip(rgb, 0, 255).astype(np.uint8)
        zflat[pix[win]] = depth[win]


def _rasterize(scr, z, uvs, tex, color, zbuf, W, H, alpha_test=True, flat=None, nrm=None, bilinear=False, light=None):
    """scr (T,3,2) screen xy, z (T,3) view depth, uvs (T,3,2)."""
    TH, TW = tex.shape[:2]
    if len(scr):
        span = np.ceil(scr.max(1)) - np.floor(scr.min(1)) + 1
        side = span.max(1)
        done = np.zeros(len(scr), bool)
        for S in (4, 8, 16, 32):  # small triangles: batched
            sel = np.nonzero(~done & (side <= S))[0]
            if len(sel):
                _raster_batch(scr, z, uvs, tex, color, zbuf, W, H, alpha_test, flat, nrm, bilinear, light, sel, S)
                done[sel] = True
        big = np.nonzero(~done)[0]
    else:
        big = []
    for k in big:
        (x0, y0), (x1, y1), (x2, y2) = scr[k]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-9:
            continue
        minx = max(int(math.floor(min(x0, x1, x2))), 0)
        maxx = min(int(math.ceil(max(x0, x1, x2))), W - 1)
        miny = max(int(math.floor(min(y0, y1, y2))), 0)
        maxy = min(int(math.ceil(max(y0, y1, y2))), H - 1)
        if minx > maxx or miny > maxy:
            continue
        xs = np.arange(minx, maxx + 1) + 0.5
        ys = np.arange(miny, maxy + 1) + 0.5
        X, Y = np.meshgrid(xs, ys)
        w0 = ((x1 - X) * (y2 - Y) - (x2 - X) * (y1 - Y)) / area
        w1 = ((x2 - X) * (y0 - Y) - (x0 - X) * (y2 - Y)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-7) & (w1 >= -1e-7) & (w2 >= -1e-7)
        if not inside.any():
            continue
        iz = w0 / z[k, 0] + w1 / z[k, 1] + w2 / z[k, 2]
        depth = 1.0 / np.maximum(iz, 1e-12)
        zb = zbuf[miny:maxy + 1, minx:maxx + 1]
        m = inside & (depth < zb)
        if not m.any():
            continue
        if flat is not None:
            cb = color[miny:maxy + 1, minx:maxx + 1]
            if alpha_test:
                u = (w0 * uvs[k, 0, 0] / z[k, 0] + w1 * uvs[k, 1, 0] / z[k, 1] + w2 * uvs[k, 2, 0] / z[k, 2]) / iz
                v = (w0 * uvs[k, 0, 1] / z[k, 0] + w1 * uvs[k, 1, 1] / z[k, 1] + w2 * uvs[k, 2, 1] / z[k, 2]) / iz
                tx = np.clip((u * TW).astype(np.int64), 0, TW - 1)
                ty = np.clip((v * TH).astype(np.int64), 0, TH - 1)
                m &= tex[ty, tx, 3] > 127
            cb[m] = flat
            zb[m] = depth[m]
            continue
        u = (w0 * uvs[k, 0, 0] / z[k, 0] + w1 * uvs[k, 1, 0] / z[k, 1] + w2 * uvs[k, 2, 0] / z[k, 2]) / iz
        v = (w0 * uvs[k, 0, 1] / z[k, 0] + w1 * uvs[k, 1, 1] / z[k, 1] + w2 * uvs[k, 2, 1] / z[k, 2]) / iz
        tx = np.clip(np.floor(u * TW).astype(np.int64), 0, TW - 1)
        ty = np.clip(np.floor(v * TH).astype(np.int64), 0, TH - 1)
        texel = tex[ty, tx]
        if alpha_test:
            m &= texel[..., 3] > 127
        rgb = texel[..., :3]
        if bilinear:
            fx, fy = u * TW - 0.5, v * TH - 0.5
            x0, y0 = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
            ax, ay = (fx - x0)[..., None], (fy - y0)[..., None]
            x0c, x1c = np.clip(x0, 0, TW - 1), np.clip(x0 + 1, 0, TW - 1)
            y0c, y1c = np.clip(y0, 0, TH - 1), np.clip(y0 + 1, 0, TH - 1)
            t = tex[..., :3].astype(np.float32)
            rgb = ((t[y0c, x0c] * (1 - ax) + t[y0c, x1c] * ax) * (1 - ay) + (t[y1c, x0c] * (1 - ax) + t[y1c, x1c] * ax) * ay)
        if nrm is not None:
            nn = sum((wk[..., None] * nrm[k, j] / z[k, j]) for j, wk in enumerate((w0, w1, w2))) / iz[..., None]
            nn /= np.maximum(np.linalg.norm(nn, axis=-1, keepdims=True), 1e-9)
            shade = 0.48 + 0.62 * np.clip(nn @ light, 0, None) + 0.08 * np.clip(nn[..., 1], 0, None)
            rgb = np.clip(rgb.astype(np.float32) * shade[..., None], 0, 255)
        cb = color[miny:maxy + 1, minx:maxx + 1]
        cb[m] = rgb[m].astype(np.uint8)
        zb[m] = depth[m]


def _view(model, yaw, pitch, fov, aspect, target=None, worlds=None, fit_pts=None):
    """Camera is framed on `fit_pts` (default: the drawn pose); `worlds` poses the model."""
    tris, uvs = model.world_triangles(worlds)
    pts = tris.reshape(-1, 3) if fit_pts is None else np.asarray(fit_pts, float)
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    centre = (lo + hi) / 2 if target is None else np.asarray(target, float)
    radius = float(np.max(np.linalg.norm(pts - centre, axis=1)))
    cam = _camera(centre, radius, yaw, pitch, fov, aspect)
    ground = pts.copy()
    ground[:, 1] = lo[1]
    return tris, uvs, pts, lo, cam, np.concatenate([pts, ground])


def _image_plane(cam, p):
    eye, right, up, fwd = cam
    rel = p - eye
    cz = np.maximum(rel @ fwd, 1e-3)
    return (rel @ right) / cz, (rel @ up) / cz, cz


def fit_focal(model, yaw, pitch, width, height, fov=30.0, margin=0.88):
    """Focal length (pixels at 1x) that fits the model centred on its bbox centre."""
    *_, cam, fitpts = _view(model, yaw, pitch, fov, width / height)
    nx, ny, _ = _image_plane(cam, fitpts)
    return min(width * margin / (2 * np.abs(nx).max()), height * margin / (2 * np.abs(ny).max()))


def render(model, width=960, height=720, yaw=35.0, pitch=22.0, fov=30.0, ssaa=2,
           background=None, shadow=True, zoom=1.0, target=None, fit="tight", margin=0.88,
           focal=None, radius=None, worlds=None, fit_pts=None) -> Image.Image:
    """fit="tight" frames the visible model (and its shadow) to fill `margin` of the
    image; fit="sphere" frames the bounding sphere; `focal` (pixels at 1x) and
    `target` override framing; `target` + `radius` frames a sphere of that radius
    around the target (close-ups)."""
    tex = model.atlas
    rs = model.spec.get("render", {})
    bg = parse_hex(background or rs.get("background", "#0d0c14"))
    W, H = width * ssaa, height * ssaa
    tris, uvs, pts, lo, cam, fitpts = _view(model, yaw, pitch, fov, width / height, target, worlds, fit_pts)
    cxn = cyn = 0.0
    if focal is not None:
        f = focal * ssaa * zoom
    elif target is not None and radius:
        d = float(np.linalg.norm(cam[0] - np.asarray(target, float)))
        f = min(W, H) * 0.5 * margin * d / float(radius) * zoom
    elif fit == "tight" and target is None:
        nx, ny, _ = _image_plane(cam, fitpts)
        cxn, cyn = (nx.min() + nx.max()) / 2, (ny.min() + ny.max()) / 2
        f = min(W * margin / max(nx.max() - nx.min(), 1e-6), H * margin / max(ny.max() - ny.min(), 1e-6)) * zoom
    else:
        f = (H / 2) / math.tan(math.radians(fov) / 2) * zoom
        if target is None:
            f *= 0.96

    def project(p):
        nx, ny, cz = _image_plane(cam, p)
        return np.stack([W / 2 + f * (nx - cxn), H / 2 - f * (ny - cyn)], axis=-1), cz

    color = np.empty((H, W, 3), dtype=np.uint8)
    color[:] = bg
    zbuf = np.full((H, W), np.inf)

    if shadow:
        sh = tris.copy()
        sh[..., 1] = lo[1] - 0.01
        sc, sz = project(sh)
        smask = np.zeros((H, W, 3), dtype=np.uint8)
        szb = np.full((H, W), np.inf)
        _rasterize(sc, sz, uvs, tex, smask, szb, W, H, True, flat=np.array([255, 255, 255], np.uint8))
        m = smask[..., 0] > 0
        strength = float(rs.get("shadow", 0.45))
        color[m] = (color[m].astype(np.float64) * (1 - strength)).astype(np.uint8)

    sc, sz = project(tris)
    mat = model.material
    nrm = None
    if not mat.get("unlit", True):  # lit material: shade the preview like an engine would
        nrm = model.world_normals(worlds)
    L = np.array([-0.5, 1.0, 0.6]) / np.linalg.norm([-0.5, 1.0, 0.6])
    _rasterize(sc, sz, uvs, tex, color, zbuf, W, H, True, nrm=nrm,
               bilinear=mat.get("filter") == "linear", light=L)
    img = Image.fromarray(color, "RGB")
    if ssaa > 1:
        img = img.resize((width, height), Image.BOX)
    return img


def part_sphere(model, part_id: str, only: bool = False):
    """Centre and radius of a part instance (and its children unless `only`) - for close-ups."""
    from .mathutil import transform_points
    ids = {part_id}
    changed = not only
    while changed:
        changed = False
        for inst in model.instances:
            if inst.parent in ids and inst.id not in ids:
                ids.add(inst.id)
                changed = True
    pts = [transform_points(i.world, f.pts) for i in model.instances if i.id in ids for f in i.faces]
    if not pts:
        raise ValueError(f"no part instance {part_id!r} (ids: {[i.id for i in model.instances]})")
    p = np.concatenate(pts)
    c = (p.min(axis=0) + p.max(axis=0)) / 2
    return c.tolist(), float(np.linalg.norm(p - c, axis=1).max()) * 1.1


VIEWS = {
    "hero": (35, 22), "front": (0, 8), "side": (90, 6), "back": (180, 15),
    "top": (0, 89.5), "three_quarter_back": (215, 25), "low": (25, 4),
}


def _font(size):
    for name in ("DejaVuSans.ttf", "DejaVuSansMono.ttf", "LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def contact_sheet(model, report: dict | None = None, width=1600) -> Image.Image:
    """Hero view + 4 orthogonal-ish views + upscaled atlas + stats, one PNG."""
    bgc = parse_hex(model.spec.get("render", {}).get("background", "#0d0c14"))
    hero_w = int(width * 0.62)
    hero_h = int(hero_w * 0.75)
    small_w = (width - hero_w) // 2
    small_h = hero_h // 2
    hy, hp = model.spec.get("render", {}).get("hero", VIEWS["hero"])
    hero = render(model, hero_w, hero_h, hy, hp)
    views = [("front", *VIEWS["front"]), ("side", *VIEWS["side"]),
             ("top", *VIEWS["top"]), ("back 3/4", *VIEWS["three_quarter_back"])]
    smalls = [(lbl, render(model, small_w, small_h, y, p, ssaa=2)) for lbl, y, p in views]
    tex = Image.fromarray(model.atlas, "RGBA")
    AH, AW = model.atlas.shape[:2]
    scale = max(1, 384 // max(AW, AH))
    footer_h = max(260, AH * scale + 20)
    sheet = Image.new("RGB", (width, hero_h + footer_h), tuple(max(0, c - 4) for c in bgc))
    sheet.paste(hero, (0, 0))
    for i, (lbl, im) in enumerate(smalls):
        sheet.paste(im, (hero_w + (i % 2) * small_w, (i // 2) * small_h))
    d = ImageDraw.Draw(sheet)
    fnt, fsm = _font(20), _font(15)
    d.text((14, 10), model.name, fill=(235, 230, 245), font=_font(26))
    for i, (lbl, _) in enumerate(smalls):
        d.text((hero_w + (i % 2) * small_w + 8, (i // 2) * small_h + 6), lbl, fill=(170, 165, 190), font=fsm)
    # atlas (checkerboard behind transparency), nearest upscale
    checker = np.indices((AH * scale, AW * scale)).sum(axis=0) // 8 % 2
    cb = np.where(checker[..., None] == 1, 40, 28).astype(np.uint8).repeat(3, axis=2)
    up = np.array(tex.resize((AW * scale, AH * scale), Image.NEAREST))
    a = up[..., 3:4] / 255.0
    comp = (up[..., :3] * a + cb * (1 - a)).astype(np.uint8)
    sheet.paste(Image.fromarray(comp), (10, hero_h + 10))
    # palette swatches
    x0 = 10 + AW * scale + 24
    y = hero_h + 12
    for name in model.palette.names:
        d.text((x0, y), name, fill=(190, 185, 205), font=fsm)
        for j, c in enumerate(model.palette.ramps[name]):
            d.rectangle([x0 + 90 + j * 18, y + 2, x0 + 90 + j * 18 + 16, y + 16], fill=tuple(c))
        y += 21
        if y > hero_h + footer_h - 24:
            break
    if report:
        sx = x0 + 90 + 18 * max(len(r) for r in model.palette.ramps.values()) + 30
        lines = [f"tris {report['triangles']}   verts {report['vertices_unique']}   parts {report['instances']}",
                 f"atlas {report['atlas'][0]}x{report['atlas'][1]}  fill {int(report['atlas_fill'] * 100)}%",
                 f"density {report['texel_density']} px/unit   colours {report['colors_used']}",
                 "size " + " x ".join(f"{v:.1f}" for v in report["bounds"]["size"])]
        for w in report.get("warnings", [])[:4]:
            lines.append("! " + w[:70])
        for i, ln in enumerate(lines):
            d.text((sx, hero_h + 12 + i * 24), ln, fill=(220, 214, 235) if not ln.startswith("!") else (255, 170, 90),
                   font=fnt if i < 4 else fsm)
    return sheet


def turntable(model, path, frames=30, size=(400, 300), pitch=20.0, duration=80):
    yaws = [35 + i * 360.0 / frames for i in range(frames)]
    f = min(fit_focal(model, y, pitch, size[0], size[1]) for y in yaws[::3])
    imgs = [render(model, size[0], size[1], yaw=y, pitch=pitch, ssaa=2, focal=f) for y in yaws]
    pal = [im.convert("P", palette=Image.ADAPTIVE, colors=255) for im in imgs]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=duration, loop=0, disposal=2)
    return path


# ---------------------------------------------------------------- animation
def _anim_fit_points(model, anim, clip, samples=12):
    length, _, _ = anim.clip(clip)
    pts = [model.world_triangles(anim.world_matrices(clip, length * k / samples))[0].reshape(-1, 3)
           for k in range(samples)]
    p = np.concatenate(pts)
    g = p.copy()
    g[:, 1] = min(0.0, p[:, 1].min())
    return np.concatenate([p, g])


def animation_frames(model, clip, fps=15, size=(480, 360), yaw=None, pitch=None, ssaa=2, margin=0.86):
    """Rendered frames of one clip with a fixed camera framed on the whole motion."""
    anim = model.animator()
    length, _, _ = anim.clip(clip)
    rs = model.spec.get("render", {})
    hy, hp = rs.get("hero", (35, 22))
    yaw = hy if yaw is None else yaw
    pitch = hp if pitch is None else pitch
    fit = _anim_fit_points(model, anim, clip)
    n = max(2, int(round(length * fps)))
    frames = []
    for k in range(n):
        w = anim.world_matrices(clip, length * k / n)
        frames.append(render(model, size[0], size[1], yaw, pitch, ssaa=ssaa, worlds=w, fit_pts=fit, margin=margin))
    return frames


def animation_gif(model, clip, path, fps=12, size=(400, 300), yaw=None, pitch=None):
    frames = animation_frames(model, clip, fps, size, yaw, pitch)
    pal = [im.convert("P", palette=Image.ADAPTIVE, colors=255) for im in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=int(1000 / fps), loop=0, disposal=2)
    return path


def filmstrip(model, clip, frames=8, cell=(320, 260), yaw=None, pitch=None, cols=4, target=None, radius=None):
    """One PNG grid of evenly spaced poses from a clip (agents can't watch GIFs).
    `target` + `radius` give a fixed close-up instead of framing the whole motion."""
    anim = model.animator()
    length, _, _ = anim.clip(clip)
    rs = model.spec.get("render", {})
    hy, hp = rs.get("hero", (35, 22))
    yaw = hy if yaw is None else yaw
    pitch = hp if pitch is None else pitch
    fit = _anim_fit_points(model, anim, clip)
    rows = (frames + cols - 1) // cols
    sheet = Image.new("RGB", (cell[0] * cols, cell[1] * rows + 34), (12, 12, 18))
    d = ImageDraw.Draw(sheet)
    d.text((10, 8), f"{model.name} - {clip} ({length:.2f}s)", fill=(230, 226, 240), font=_font(18))
    for k in range(frames):
        t = length * k / frames
        if target is not None:
            im = render(model, cell[0], cell[1], yaw, pitch, ssaa=2, worlds=anim.world_matrices(clip, t),
                        target=target, radius=radius)
        else:
            im = render(model, cell[0], cell[1], yaw, pitch, ssaa=2, worlds=anim.world_matrices(clip, t), fit_pts=fit)
        x, y = (k % cols) * cell[0], 34 + (k // cols) * cell[1]
        sheet.paste(im, (x, y))
        d.text((x + 6, y + 4), f"t={t:.2f}", fill=(200, 196, 215), font=_font(13))
    return sheet
