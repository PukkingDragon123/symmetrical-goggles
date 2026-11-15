"""Minecraft Java export: a lowpix box model -> a vanilla entity model a mod can load.

    python -m lowpix mc export examples/icebreaker.json --mod path/to/mod --modid mymod \
        --package com.example.mymod.client.lowpix

writes, inside any Fabric / NeoForge / Forge mod project (`--mod` is that project's root):

* `src/main/java/<package>/<Name>Model.java`: `createBodyLayer()` building the ModelPart tree
  (`MeshDefinition` / `CubeListBuilder` / `PartPose`, Mojang names), part-name constants and the
  texture size;
* `src/main/java/<package>/LowpixAnimations.java` and `LowpixEntityModel.java`: a small runtime that
  turns the exported clips into vanilla `AnimationDefinition`s (no extra library needed);
* `assets/<modid>/textures/entity/<name>.png`: the painted texture in box-UV layout (plus
  `<name>_glow.png` with only the emissive texels, for an eyes/emissive render pass);
* `assets/<modid>/lowpix/<name>.anim.json`: every clip baked to Minecraft keyframes
  (degrees, pixels, scale) for the runtime above;
* `<out>/<name>_mc.png`: a preview rendered from the exported cubes and texture (what the game draws).

A spec's top-level `"minecraft"` block tunes the export:
`{"fps": 12, "glow_parts": [...], "glow_ramps": [...], "tint_parts": [...], "alpha_parts": {"glass": 0.35}}`
(glow -> `<name>_glow.png` for an emissive pass; tint -> `<name>_tint.png`, removed from the base texture and drawn
multiplied by a dye colour; alpha -> translucent texels for glass/ice).

Only `box` parts (and `bone` parts, which become empty ModelParts) export: Minecraft entity models are
cuboids. Model units are Minecraft pixels (16 per block); `density` is texels per pixel (1 = vanilla,
2 = double resolution). Box sizes times density must be whole numbers so texels stay square.
Coordinates: lowpix is Y up, facing +Z, ground y=0; Minecraft model space is Y down, facing -Z,
ground y=24. The map (x, y, z) -> (x, 24 - y, -z) is a rotation, so nothing is mirrored.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil

import numpy as np
from PIL import Image

from .model import Model, build_model
from .pack import shelf_pack

F = np.diag([1.0, -1.0, -1.0])
GROUND = 24.0
RUNTIME = os.path.join(os.path.dirname(__file__), "mc_runtime")


def _ident(s: str) -> str:
    s = re.sub(r"[^a-z0-9_]", "_", s.lower())
    return s if s and not s[0].isdigit() else "p_" + s


def _camel(s: str) -> str:
    return "".join(w[:1].upper() + w[1:] for w in re.split(r"[^A-Za-z0-9]", s) if w)


def euler_zyx(M):
    """Rotation matrix -> (x, y, z) radians with M = Rz @ Ry @ Rx (Minecraft's ModelPart order)."""
    sy = -M[2, 0]
    b = math.asin(max(-1.0, min(1.0, sy)))
    if abs(sy) < 0.99999:
        a = math.atan2(M[2, 1], M[2, 2])
        c = math.atan2(M[1, 0], M[0, 0])
    else:
        a = math.atan2(-M[1, 2], M[1, 1])
        c = 0.0
    return np.array([a, b, c])


def _rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def _ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_zyx(e):
    return _rz(e[2]) @ _ry(e[1]) @ _rx(e[0])


# Box-UV layout of a cuboid (w, h, d) at texOffs (u, v), exactly as ModelPart.Cube builds it.
# name -> (region x, region y, region w, region h) in units, and the face point for region coords (s, t)
# in 0..1 (s left -> right, t top -> bottom), in the part's Y-down space with corners lo/hi.
def box_regions(w, h, d):
    return {
        "down":  (d, 0, w, d),            # y = lo (the top of the cube in the world)
        "up":    (d + w, 0, w, d),        # y = hi (the bottom)
        "west":  (0, d, d, h),            # x = lo
        "north": (d, d, w, h),            # z = lo (the front)
        "east":  (d + w, d, d, h),        # x = hi
        "south": (2 * d + w, d, w, h),    # z = hi (the back)
    }


def box_point(face, s, t, lo, hi):
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    w, h, d = hi - lo
    z = np.zeros_like(s)
    if face == "down":
        return np.stack([x0 + s * w, z + y0, z1 - t * d], -1)
    if face == "up":
        return np.stack([x0 + s * w, z + y1, z1 - t * d], -1)
    if face == "west":
        return np.stack([z + x0, y0 + t * h, z1 - s * d], -1)
    if face == "north":
        return np.stack([x0 + s * w, y0 + t * h, z + z0], -1)
    if face == "east":
        return np.stack([z + x1, y0 + t * h, z0 + s * d], -1)
    if face == "south":
        return np.stack([x1 - s * w, y0 + t * h, z + z1], -1)
    raise ValueError(face)


FACE_NORMALS = {"down": (0, -1, 0), "up": (0, 1, 0), "west": (-1, 0, 0), "north": (0, 0, -1),
                "east": (1, 0, 0), "south": (0, 0, 1)}


class McPart:
    def __init__(self, name, parent, offset, rotation, inst):
        self.name, self.parent, self.offset, self.rotation, self.inst = name, parent, offset, rotation, inst
        self.cube = None        # (lo, hi) in part space, Minecraft axes
        self.uv = (0, 0)
        self.glow = False
        self.tint = False


class McModel:
    """The exported part tree, texture and baked clips."""

    def __init__(self, name, parts, tex_units, density, texture, glow, clips, warnings, tint=None):
        self.name, self.parts, self.tex_units, self.density = name, parts, tex_units, density
        self.texture, self.glow, self.clips, self.warnings = texture, glow, clips, warnings
        self.tint = tint

    # -- java ------------------------------------------------------------------------------------------
    def java(self, package: str, cls: str) -> str:
        f = lambda v: f"{float(v):.4f}".rstrip("0").rstrip(".") + "F"  # noqa: E731
        lines = []
        names = {}
        for p in self.parts:
            var = "p_" + p.name
            names[p.name] = var
            parent = "root" if p.parent is None else names[p.parent]
            cubes = "CubeListBuilder.create()"
            if p.cube is not None:
                lo, hi = p.cube
                size = hi - lo
                cubes += (f".texOffs({p.uv[0]}, {p.uv[1]}).addBox({f(lo[0])}, {f(lo[1])}, {f(lo[2])}, "
                          f"{f(size[0])}, {f(size[1])}, {f(size[2])}, CubeDeformation.NONE)")
            ox, oy, oz = p.offset
            rx, ry, rz = p.rotation
            if abs(rx) + abs(ry) + abs(rz) < 1e-7:
                pose = f"PartPose.offset({f(ox)}, {f(oy)}, {f(oz)})"
            else:
                pose = f"PartPose.offsetAndRotation({f(ox)}, {f(oy)}, {f(oz)}, {f(rx)}, {f(ry)}, {f(rz)})"
            lines.append(f"        PartDefinition {var} = {parent}.addOrReplaceChild(\"{p.name}\", {cubes}, {pose});")
        consts = "\n".join(f"    public static final String {p.name.upper()} = \"{p.name}\";" for p in self.parts)
        glow = ", ".join(f"\"{p.name}\"" for p in self.parts if p.glow)
        tint = ", ".join(f"\"{p.name}\"" for p in self.parts if p.tint)
        clips = ", ".join(f"\"{c}\"" for c in self.clips)
        return f"""// Generated by lowpix (python -m lowpix mc export). Edit the lowpix spec and re-export instead of this file.
package {package};

import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;

@SuppressWarnings("unused")
public final class {cls} {{
    public static final String NAME = "{self.name}";
    public static final int TEXTURE_WIDTH = {self.tex_units[0]};
    public static final int TEXTURE_HEIGHT = {self.tex_units[1]};
    public static final boolean HAS_GLOW = {"true" if self.glow is not None else "false"};
    public static final String[] GLOW_PARTS = {{{glow}}};
    public static final boolean HAS_TINT = {"true" if self.tint is not None else "false"};
    public static final String[] TINT_PARTS = {{{tint}}};
    public static final String[] CLIPS = {{{clips}}};
{consts}

    private {cls}() {{}}

    public static LayerDefinition createBodyLayer() {{
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition root = mesh.getRoot();
{chr(10).join(lines)}
        return LayerDefinition.create(mesh, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    }}
}}
"""

    def anim_json(self) -> dict:
        return {"model": self.name, "clips": self.clips}

    # -- preview -----------------------------------------------------------------------------------------
    def world_mats(self, pose=None):
        """Part -> 4x4 in Minecraft model space (Y down), optionally posed {part: (rot rad, pos px, scale)}."""
        out = {}
        for p in self.parts:
            e = np.array(p.rotation, float)
            o = np.array(p.offset, float)
            s = np.ones(3)
            if pose and p.name in pose:
                de, dp, ds = pose[p.name]
                e, o, s = e + de, o + dp, s * ds
            M = np.eye(4)
            M[:3, :3] = rot_zyx(e) @ np.diag(s)
            M[:3, 3] = o
            out[p.name] = (out[p.parent] if p.parent else np.eye(4)) @ M
        return out

    def triangles(self, pose=None):
        """World triangles (lowpix axes, Y up) + uvs, built from the cubes the way the game builds them."""
        TW, TH = self.tex_units
        tris, uvs = [], []
        mats = self.world_mats(pose)
        for p in self.parts:
            if p.cube is None:
                continue
            lo, hi = p.cube
            w, h, d = hi - lo
            M = mats[p.name]
            for face, (rx, ry, rw, rh) in box_regions(w, h, d).items():
                if rw <= 0 or rh <= 0:
                    continue
                S = np.array([0, 1, 1, 0], float)
                T = np.array([0, 0, 1, 1], float)
                P = box_point(face, S, T, lo, hi)
                P = P @ M[:3, :3].T + M[:3, 3]
                P = (P - [0, GROUND, 0]) @ F.T        # back to lowpix axes
                UV = np.c_[(p.uv[0] + rx + S * rw) / TW, (p.uv[1] + ry + T * rh) / TH]
                for a, b, c in ((0, 1, 2), (0, 2, 3)):
                    tris.append(P[[a, b, c]])
                    uvs.append(UV[[a, b, c]])
        return np.array(tris), np.array(uvs)

    def sample_pose(self, clip, t):
        c = self.clips[clip]
        pose = {}
        for bone, chans in c["bones"].items():
            vals = []
            for ch, default in (("rotation", 0.0), ("position", 0.0), ("scale", 1.0)):
                keys = chans.get(ch)
                if not keys:
                    vals.append(np.full(3, default))
                    continue
                ts = np.array([k[0] for k in keys])
                vs = np.array([k[1:4] for k in keys])
                v = np.array([np.interp(t, ts, vs[:, i]) for i in range(3)])
                vals.append(np.radians(v) if ch == "rotation" else v)
            pose[bone] = tuple(vals)
        return pose


class _PreviewModel:
    """Duck-types lowpix.model.Model for the software renderer."""

    def __init__(self, mc: McModel, spec, pose=None):
        self.mc, self.spec, self.pose = mc, dict(spec), pose
        self.spec.pop("render", None)
        tex = np.array(mc.texture)
        if mc.tint is not None:     # show dyeable parts in a sample dye (red) in previews
            t = np.array(mc.tint).astype(np.float64)
            m = t[..., 3] > 0
            tex[m] = np.c_[(t[m, :3] * np.array([0.92, 0.32, 0.3])).astype(np.uint8), t[m, 3:4].astype(np.uint8)]
        self.atlas = tex
        self.instances = []
        self.palette = None

    @property
    def material(self):
        # Minecraft shades entity faces by direction; approximate that so the preview reads like the game
        return {"unlit": False, "filter": "nearest"}

    def world_triangles(self, worlds=None):
        return self.mc.triangles(self.pose)

    def world_normals(self, worlds=None):
        tris, _ = self.world_triangles()
        n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
        n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        return np.repeat(n[:, None, :], 3, axis=1)

    def bounds(self, worlds=None):
        tris, _ = self.world_triangles()
        P = tris.reshape(-1, 3)
        return P.min(0), P.max(0)


def from_model(model: Model, fps: float = 12.0, glow_parts=(), glow_ramps=(), tint_parts=(), alpha_parts=None) -> McModel:
    """alpha_parts: {part id: opacity 0..1} for glass and ice (draw those with a translucent render type)."""
    alpha_parts = alpha_parts or {}
    spec = model.spec
    density = float(model.density)
    name = _ident(spec.get("name", "model"))
    warnings = []
    parts, by_inst = [], {}
    used = set()
    for inst in model.instances:
        shape = inst.part.get("shape", "box")
        if shape not in ("box", "bone") or inst.part.get("chamfer"):
            raise ValueError(f"part {inst.id!r}: Minecraft entity models are cuboids; use shape box or bone "
                             f"(got {shape}{' with chamfer' if inst.part.get('chamfer') else ''})")
        pname = _ident(inst.id)
        while pname in used:
            pname += "_"
        used.add(pname)
        Rl, tl = inst.rest_local[:3, :3], inst.rest_local[:3, 3]
        off = F @ tl
        if inst.parent is None:
            off = off + [0, GROUND, 0]
        rot = euler_zyx(F @ Rl @ F)
        p = McPart(pname, by_inst[inst.parent].name if inst.parent else None, off, rot, inst)
        p.glow = inst.src_id in glow_parts or inst.id in glow_parts
        p.tint = inst.src_id in tint_parts or inst.id in tint_parts
        if inst.faces:
            pts = np.concatenate([f.pts for f in inst.faces]) @ F.T
            lo, hi = np.round(pts.min(0), 4), np.round(pts.max(0), 4)
            sz = (hi - lo) * density
            if np.any(np.abs(sz - np.round(sz)) > 1e-3):
                warnings.append(f"{inst.id}: size {list(np.round(hi - lo, 3))} x density {density:g} is not whole "
                                "texels; texels will stretch")
            p.cube = (lo, hi)
        parts.append(p)
        by_inst[inst.id] = p

    # pack box-UV islands (in units; texOffs are whole numbers)
    cubes = [p for p in parts if p.cube is not None]
    sizes = []
    for p in cubes:
        w, h, d = p.cube[1] - p.cube[0]
        sizes.append((int(math.ceil(2 * d + 2 * w - 1e-6)), int(math.ceil(d + h - 1e-6))))
    AW, AH, pos = shelf_pack(sizes, gutter=0) if sizes else (16, 16, [])
    for p, xy in zip(cubes, pos):
        p.uv = (int(xy[0]), int(xy[1]))
    tw = int(round(AW * density))
    th = int(round(AH * density))
    tex = np.zeros((th, tw, 4), np.uint8)
    glow_tex = np.zeros_like(tex)
    tint_tex = np.zeros_like(tex)
    glow_cols = set()
    if glow_ramps:
        pal = model.palette
        for r in glow_ramps:
            if r in pal.index:
                i = pal.index[r]
                for c in pal.table[i, :pal.lengths[i]]:
                    glow_cols.add(tuple(int(v) for v in c[:3]))
    atlas = model.atlas
    for p in cubes:
        lo, hi = p.cube
        w, h, d = hi - lo
        inst = p.inst
        # the instance's faces, keyed by their normal in Minecraft part space
        fmap = []
        for f in inst.faces:
            n = F @ f.normal
            fmap.append((n, f))
        for face, (rx, ry, rw, rh) in box_regions(w, h, d).items():
            W, H = int(round(rw * density)), int(round(rh * density))
            if W <= 0 or H <= 0:
                continue
            nrm = np.array(FACE_NORMALS[face], float)
            src = max(fmap, key=lambda nf: float(np.dot(nf[0], nrm)), default=None)
            if src is None or np.dot(src[0], nrm) < 0.9:
                continue                                  # hidden face: stays transparent
            f = src[1]
            S, T = np.meshgrid((np.arange(W) + 0.5) / W, (np.arange(H) + 0.5) / H)
            P = box_point(face, S, T, lo, hi) @ F.T      # lowpix pivot frame
            p00, p10, p01 = f.sample(np.array(0.0), np.array(0.0)), f.sample(np.array(1.0), np.array(0.0)), \
                f.sample(np.array(0.0), np.array(1.0))
            e1, e2 = p10 - p00, p01 - p00
            ss = np.clip(((P - p00) @ e1) / max(e1 @ e1, 1e-12), 0, 1 - 1e-9)
            tt = np.clip(((P - p00) @ e2) / max(e2 @ e2, 1e-12), 0, 1 - 1e-9)
            fx, fy = f.rect
            ix = fx + np.floor(ss * f.W).astype(int)
            iy = fy + np.floor(tt * f.H).astype(int)
            img = atlas[iy, ix]
            X0 = int(round((p.uv[0] + rx) * density))
            Y0 = int(round((p.uv[1] + ry) * density))
            a_op = alpha_parts.get(inst.src_id, alpha_parts.get(inst.id))
            if a_op is not None:
                img = img.copy()
                img[..., 3] = (img[..., 3].astype(np.float64) * float(a_op)).astype(np.uint8)
            if p.tint:   # dyeable: lives only in the tint layer, drawn multiplied by the dye colour
                tint_tex[Y0:Y0 + H, X0:X0 + W] = img
                continue
            tex[Y0:Y0 + H, X0:X0 + W] = img
            if p.glow or glow_cols:
                g = np.zeros_like(img)
                m = np.ones(img.shape[:2], bool) if p.glow else np.array(
                    [[tuple(px[:3]) in glow_cols for px in row] for row in img])
                m &= img[..., 3] > 0
                g[m] = img[m]
                glow_tex[Y0:Y0 + H, X0:X0 + W] = g
    glow = Image.fromarray(glow_tex, "RGBA") if glow_tex[..., 3].any() else None
    tint = Image.fromarray(tint_tex, "RGBA") if tint_tex[..., 3].any() else None

    clips = _bake_clips(model, parts, fps)
    return McModel(name, parts, (AW, AH), density, Image.fromarray(tex, "RGBA"), glow, clips, warnings, tint)


def _bake_clips(model: Model, parts, fps):
    anim = model.animator()
    by_inst = {p.inst.id: p for p in parts}
    out = {}
    for clip in anim.names():
        length, loop, tracks = anim.clip(clip)
        animated = set()
        for tr in tracks:
            if tr.get("off"):
                continue
            for inst, *_ in anim._targets(tr):
                animated.add(inst.id)
        n = max(2, int(round(length * fps)) + 1)
        times = np.linspace(0.0, length, n)
        bones = {}
        series = {iid: ([], [], []) for iid in animated}
        for t in times:
            locs = anim.local_matrices(clip, 0.0 if (loop and t >= length - 1e-9) else t)
            for iid in animated:
                M = locs[iid]
                Rs = M[:3, :3]
                sc = np.linalg.norm(Rs, axis=0)
                R = Rs / np.where(sc > 1e-12, sc, 1)
                p = by_inst[iid]
                e = euler_zyx(F @ R @ F) - np.array(p.rotation)
                e = (e + math.pi) % (2 * math.pi) - math.pi
                rot, pos, scl = series[iid]
                if rot:  # keep angles continuous so interpolation never spins the long way round
                    e = rot[-1] + ((e - rot[-1] + math.pi) % (2 * math.pi) - math.pi)
                rot.append(e)
                pos.append(F @ (M[:3, 3] - p.inst.rest_local[:3, 3]))
                scl.append(sc)
        for iid, (rot, pos, scl) in series.items():
            p = by_inst[iid]
            chans = {}
            rot, pos, scl = np.degrees(np.array(rot)), np.array(pos), np.array(scl)
            if np.abs(rot).max() > 1e-3:
                chans["rotation"] = [[round(float(t), 4), *[round(float(v), 3) for v in r]] for t, r in zip(times, rot)]
            if np.abs(pos).max() > 1e-4:
                chans["position"] = [[round(float(t), 4), *[round(float(v), 4) for v in r]] for t, r in zip(times, pos)]
            if np.abs(scl - 1).max() > 1e-4:
                chans["scale"] = [[round(float(t), 4), *[round(float(v), 4) for v in r]] for t, r in zip(times, scl)]
            if chans:
                bones[p.name] = chans
        out[clip] = {"length": float(length), "loop": bool(loop), "interpolation": "catmullrom", "bones": bones}
    return out


def preview(mc: McModel, spec, path, clip=None, t=0.0, size=(640, 480), yaw=35.0, pitch=22.0):
    from .render import render
    pm = _PreviewModel(mc, spec, mc.sample_pose(clip, t) if clip else None)
    img = render(pm, size[0], size[1], yaw=yaw, pitch=pitch)
    if path:
        img.save(path)
    return img


def preview_sheet(mc: McModel, spec, path, size=(400, 320)):
    """Four angles of the exported model + one frame per clip: the check that the export is right."""
    views = [(35, 22), (-35, 22), (145, 22), (0, 70)]
    imgs = [preview(mc, spec, None, None, 0.0, size, y, p) for y, p in views]
    for clip, c in list(mc.clips.items())[:4]:
        imgs.append(preview(mc, spec, None, clip, c["length"] * 0.3, size))
    cols = 4
    rows = (len(imgs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * size[0], rows * size[1]), (13, 12, 20))
    for i, im in enumerate(imgs):
        sheet.paste(im.convert("RGB"), ((i % cols) * size[0], (i // cols) * size[1]))
    sheet.save(path)
    return sheet


def install_runtime(java_dir: str, package: str):
    os.makedirs(java_dir, exist_ok=True)
    for fn in sorted(os.listdir(RUNTIME)):
        if fn.endswith(".java"):
            with open(os.path.join(RUNTIME, fn), encoding="utf-8") as fh:
                src = fh.read().replace("__PACKAGE__", package)
            with open(os.path.join(java_dir, fn), "w", encoding="utf-8") as fh:
                fh.write(src)


def export(src, mod_root: str, modid: str, package: str, out_dir: str | None = None, fps: float = 12.0,
           name: str | None = None, texture_dir: str = "entity") -> dict:
    """Export a lowpix spec (path or dict) into a mod project. Returns a summary dict."""
    model = build_model(src)
    mc_conf = model.spec.get("minecraft", {}) or {}
    mc = from_model(model, fps=float(mc_conf.get("fps", fps)), glow_parts=set(mc_conf.get("glow_parts", [])),
                    glow_ramps=set(mc_conf.get("glow_ramps", [])), tint_parts=set(mc_conf.get("tint_parts", [])),
                    alpha_parts=dict(mc_conf.get("alpha_parts", {})))
    if name:
        mc.name = _ident(name)
    cls = _camel(mc.name) + "Model"
    java_dir = os.path.join(mod_root, "src", "main", "java", *package.split("."))
    res = os.path.join(mod_root, "src", "main", "resources", "assets", modid)
    install_runtime(java_dir, package)
    with open(os.path.join(java_dir, cls + ".java"), "w", encoding="utf-8") as fh:
        fh.write(mc.java(package, cls))
    tdir = os.path.join(res, "textures", texture_dir)
    os.makedirs(tdir, exist_ok=True)
    mc.texture.save(os.path.join(tdir, mc.name + ".png"))
    for layer, img in (("_glow", mc.glow), ("_tint", mc.tint)):
        path = os.path.join(tdir, mc.name + layer + ".png")
        if img is not None:
            img.save(path)
        elif os.path.exists(path):
            os.remove(path)
    adir = os.path.join(res, "lowpix")
    os.makedirs(adir, exist_ok=True)
    with open(os.path.join(adir, mc.name + ".anim.json"), "w", encoding="utf-8") as fh:
        json.dump(mc.anim_json(), fh, separators=(",", ":"))
    summary = {"name": mc.name, "class": f"{package}.{cls}", "parts": len(mc.parts),
               "cubes": sum(1 for p in mc.parts if p.cube is not None),
               "texture": [mc.texture.width, mc.texture.height], "texture_units": list(mc.tex_units),
               "glow": mc.glow is not None, "tint": mc.tint is not None, "clips": {k: round(v["length"], 3) for k, v in mc.clips.items()},
               "warnings": mc.warnings + list(model.warnings)}
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        preview_sheet(mc, model.spec, os.path.join(out_dir, mc.name + "_mc.png"))
        summary["preview"] = os.path.join(out_dir, mc.name + "_mc.png")
    return summary


def export_icon(png_path: str, mod_root: str, modid: str, name: str, handheld: bool = False):
    """Install a 2D item icon (e.g. from `lowpix sprite`) as textures/item/<name>.png + its item model."""
    res = os.path.join(mod_root, "src", "main", "resources", "assets", modid)
    os.makedirs(os.path.join(res, "textures", "item"), exist_ok=True)
    os.makedirs(os.path.join(res, "models", "item"), exist_ok=True)
    shutil.copyfile(png_path, os.path.join(res, "textures", "item", name + ".png"))
    with open(os.path.join(res, "models", "item", name + ".json"), "w", encoding="utf-8") as fh:
        json.dump({"parent": "minecraft:item/handheld" if handheld else "minecraft:item/generated",
                   "textures": {"layer0": f"{modid}:item/{name}"}}, fh, indent=2)
