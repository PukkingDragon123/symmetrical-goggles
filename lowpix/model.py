"""Build pipeline: spec -> instances -> faces -> atlas -> painted texture."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .geometry import expand_instances
from .mathutil import transform_points
from .pack import shelf_pack
from .painter import Painter
from .palette import Palette, to_hex
from .spec import SpecError, load_spec, resolve_paint, validate


@dataclass
class Model:
    spec: dict
    palette: Palette
    instances: list
    atlas: np.ndarray                      # (H, W, 4) uint8
    density: float
    warnings: list = field(default_factory=list)

    @property
    def name(self) -> str:
        return self.spec.get("name", "model")

    # ------------------------------------------------------------ mesh access
    def face_uvs(self, face) -> np.ndarray:
        AH, AW = self.atlas.shape[:2]
        x, y = face.rect
        return np.c_[(x + face.uv[:, 0] * face.W) / AW, (y + face.uv[:, 1] * face.H) / AH]

    def instance_mesh(self, inst, double_sided: bool | None = None):
        """Node-local mesh arrays for one instance (flat-shaded, per-face verts).
        double_sided=None -> all faces, True/False -> filter by face flag."""
        P, N, UV, I = [], [], [], []
        base = 0
        for f in inst.faces:
            if double_sided is not None and f.double_sided != double_sided:
                continue
            uv = self.face_uvs(f)
            P.append(f.pts)
            # smooth vertex normals when a face carries them (converted meshes), else flat
            N.append(f.attrs["n"] if "n" in f.attrs else np.repeat(f.normal[None], len(f.pts), axis=0))
            UV.append(uv)
            for a, b, c in f.tris:
                I.append((base + a, base + b, base + c))
            base += len(f.pts)
        if not P:
            return None
        return (np.concatenate(P).astype(np.float32), np.concatenate(N).astype(np.float32),
                np.concatenate(UV).astype(np.float32), np.array(I, dtype=np.uint32))

    def world_triangles(self, worlds=None):
        """(T,3,3) world positions, (T,3,2) uvs - for the software renderer.
        `worlds` (instance id -> 4x4) poses the model, e.g. from Animator.world_matrices."""
        tris, uvs = [], []
        for inst in self.instances:
            W = worlds[inst.id] if worlds is not None else inst.world
            for f in inst.faces:
                wp = transform_points(W, f.pts)
                uv = self.face_uvs(f)
                for a, b, c in f.tris:
                    tris.append(wp[[a, b, c]])
                    uvs.append(uv[[a, b, c]])
        return np.array(tris), np.array(uvs)

    def world_normals(self, worlds=None):
        """(T,3,3) per-vertex world normals matching world_triangles (for lit previews)."""
        out = []
        for inst in self.instances:
            W = worlds[inst.id] if worlds is not None else inst.world
            R = W[:3, :3]
            for f in inst.faces:
                n = f.attrs["n"] if "n" in f.attrs else np.repeat(f.normal[None], len(f.pts), axis=0)
                n = n @ R.T
                for a, b, c in f.tris:
                    out.append(n[[a, b, c]])
        return np.array(out)

    @property
    def material(self):
        m = {"unlit": True, "filter": "nearest"}
        m.update(self.spec.get("material", {}))
        return m

    def animator(self):
        from .anim import Animator
        return Animator(self)

    def bounds(self, worlds=None):
        t, _ = self.world_triangles(worlds)
        p = t.reshape(-1, 3)
        return p.min(axis=0), p.max(axis=0)

    # ------------------------------------------------------------------ stats
    def report(self) -> dict:
        tris = sum(len(f.tris) for inst in self.instances for f in inst.faces)
        verts = sum(len(f.pts) for inst in self.instances for f in inst.faces)
        unique_verts = len({tuple(np.round(p, 4)) for inst in self.instances for f in inst.faces
                            for p in transform_points(inst.world, f.pts)})
        faces = [f for inst in self.instances for f in inst.faces]
        AH, AW = self.atlas.shape[:2]
        used = sum((f.W + 2) * (f.H + 2) for f in faces)
        opaque = self.atlas[..., 3] > 127
        cols = {tuple(c) for c in self.atlas[..., :3][opaque].reshape(-1, 3)}
        lo, hi = self.bounds()
        budget = self.spec.get("budget", {})
        warnings = list(self.warnings)
        tri_budget = budget.get("tris")
        if tri_budget and tris > tri_budget:
            warnings.append(f"triangle count {tris} exceeds budget {tri_budget}")
        col_budget = budget.get("colors")
        if col_budget and len(cols) > col_budget:
            warnings.append(f"{len(cols)} colours used, budget is {col_budget}")
        # Minecraft-scale models (a "minecraft" block, density 1) use 1px details on purpose
        min_px = 1 if self.spec.get("minecraft") else 2
        tiny = [f"{inst.id}.{f.name}" for inst in self.instances for f in inst.faces if min(f.W, f.H) < min_px
                and inst.part.get("shape") != "card" and not f.soft and "bevels" not in f.tags]
        if tiny:
            warnings.append(f"{len(tiny)} faces are under 2px on a side (detail lost): {tiny[:6]}"
                            + (" ..." if len(tiny) > 6 else ""))
        grounded = self.spec.get("grounded", True)  # false: a floating prop (weapon, pickup, VFX): no ground checks
        if lo[1] < -0.05 and grounded:
            sunk = []
            for inst in self.instances:
                y = min(float(transform_points(inst.world, f.pts)[:, 1].min()) for f in inst.faces) if inst.faces else 0
                if y < -0.05:
                    sunk.append(f"{inst.id}({y:.2f})")
            warnings.append("below ground plane y=0: " + ", ".join(sunk[:12]) + (" ..." if len(sunk) > 12 else ""))
        # animated clips: sample frames and flag parts that sink through the floor mid-motion
        clips = self.spec.get("animations") or {}
        if clips and grounded:
            anim = self.animator()
            tol = float(self.spec.get("anim_ground_tolerance", 0.15))
            for cname in clips:
                length, _, _ = anim.clip(cname)
                worst = {}
                for k in range(24):
                    t = length * k / 24
                    W = anim.world_matrices(cname, t)
                    for inst in self.instances:
                        if not inst.faces:
                            continue
                        y = min(float(transform_points(W[inst.id], f.pts)[:, 1].min()) for f in inst.faces)
                        if y < -tol and y < worst.get(inst.id, (0, 0))[0]:
                            worst[inst.id] = (y, t)
                if worst:
                    items = sorted(worst.items(), key=lambda kv: kv[1][0])[:6]
                    warnings.append(f"clip {cname!r} sinks below the ground: "
                                    + ", ".join(f"{k}({y:.2f} @ {t:.2f}s)" for k, (y, t) in items))
        floating = lo[1] > 0.3
        if floating and self.spec.get("grounded", True):
            warnings.append(f"model floats {lo[1]:.2f} above the ground plane")
        return {
            **({"attribution": self.spec["attribution"]} if self.spec.get("attribution") else {}),
            "name": self.name,
            "parts": len({i.src_id for i in self.instances}),
            "instances": len(self.instances),
            "faces": len(faces),
            "triangles": int(tris),
            "vertices_flat": int(verts),
            "vertices_unique": int(unique_verts),
            "atlas": [int(AW), int(AH)],
            "atlas_fill": round(used / float(AW * AH), 3),
            "texel_density": self.density,
            "colors_used": len(cols),
            "palette": self.palette.as_hex(),
            "bounds": {"min": [round(float(v), 3) for v in lo], "max": [round(float(v), 3) for v in hi],
                       "size": [round(float(v), 3) for v in (hi - lo)]},
            "warnings": warnings,
            "animations": {k: float(v.get("length", 1.0)) for k, v in (self.spec.get("animations") or {}).items()},
            "joints": [i.id for i in self.instances],
        }

    def colors_hex(self):
        opaque = self.atlas[..., 3] > 127
        return sorted({to_hex(c) for c in self.atlas[..., :3][opaque].reshape(-1, 3)})


def build_model(src) -> Model:
    spec = load_spec(src)
    errors, warnings = validate(spec)
    if errors:
        raise SpecError(errors)
    density = float(spec.get("density", 2.0))
    palette = Palette(spec["palette"]["ramps"])
    instances = expand_instances(spec["parts"], density)

    faces = []
    for inst in instances:
        for f in inst.faces:
            f.W, f.H = f.pixel_size(density)
            faces.append((inst, f))
    AW, AH, pos = shelf_pack([(f.W, f.H) for _, f in faces], gutter=1)
    for (inst, f), p in zip(faces, pos):
        f.rect = p
    # mirrored instance faces must also carry their source counterparts' sizes for stats
    atlas = np.zeros((AH, AW, 4), dtype=np.uint8)
    painter = Painter(spec, palette, instances, faces)
    paints = {}
    for fidx, (inst, f) in enumerate(faces):
        if inst.src_id not in paints:
            paints[inst.src_id] = resolve_paint(spec, inst.part)
        img = painter.paint_face(inst, f, fidx, paints[inst.src_id])
        x, y = f.rect
        atlas[y:y + f.H, x:x + f.W] = img
        # gutter: extend edge texels outward so nearest/linear sampling never bleeds
        atlas[y - 1, x:x + f.W] = img[0]
        atlas[y + f.H, x:x + f.W] = img[-1]
        atlas[y - 1:y + f.H + 1, x - 1] = atlas[y - 1:y + f.H + 1, x]
        atlas[y - 1:y + f.H + 1, x + f.W] = atlas[y - 1:y + f.H + 1, x + f.W - 1]
    return Model(spec, palette, instances, atlas, density, warnings)
