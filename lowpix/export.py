"""Exporters: glTF binary (.glb), Wavefront OBJ, Blockbench (.bbmodel), PNG atlas."""
from __future__ import annotations

import base64
import math
import io
import json
import struct
import uuid

import numpy as np
from PIL import Image

from .mathutil import quat_from_matrix, transform_points

NEAREST = 9728
LINEAR = 9729
CLAMP = 33071


def atlas_png_bytes(model) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(model.atlas, "RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# --------------------------------------------------------------------- glTF
def glb_bytes(model) -> bytes:
    """Unlit (KHR_materials_unlit), nearest-filtered, alpha-masked GLB that keeps
    the part hierarchy: one node per part instance, translated to its pivot and
    rotated, so it can be posed / animated straight away."""
    bin_parts: list[bytes] = []
    offset = 0
    buffer_views, accessors = [], []

    def add_view(data: bytes, target=None):
        nonlocal offset
        pad = (-offset) % 4
        if pad:
            bin_parts.append(b"\x00" * pad)
            offset += pad
        bv = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target:
            bv["target"] = target
        buffer_views.append(bv)
        bin_parts.append(data)
        offset += len(data)
        return len(buffer_views) - 1

    def add_accessor(arr: np.ndarray, kind: str, ctype: int, target, minmax=False):
        view = add_view(arr.tobytes(), target)
        acc = {"bufferView": view, "componentType": ctype, "count": int(arr.shape[0]), "type": kind}
        if minmax:
            acc["min"] = [float(v) for v in arr.min(axis=0)]
            acc["max"] = [float(v) for v in arr.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    nodes, meshes = [], []
    index_of = {inst.id: i for i, inst in enumerate(model.instances)}
    has_solid = any(not f.double_sided for i in model.instances for f in i.faces)
    has_card = any(f.double_sided for i in model.instances for f in i.faces)
    mat_index = {False: 0, True: 1 if has_solid else 0}
    for inst in model.instances:
        prims = []
        for ds in (False, True):
            mat = mat_index[ds]
            m = model.instance_mesh(inst, ds)
            if m is None:
                continue
            P, N, UV, I = m
            pa = add_accessor(P, "VEC3", 5126, 34962, True)
            na = add_accessor(N, "VEC3", 5126, 34962)
            ta = add_accessor(UV, "VEC2", 5126, 34962)
            if P.shape[0] < 65536:
                ia = add_accessor(I.reshape(-1).astype(np.uint16), "SCALAR", 5123, 34963)
            else:
                ia = add_accessor(I.reshape(-1).astype(np.uint32), "SCALAR", 5125, 34963)
            prims.append({"attributes": {"POSITION": pa, "NORMAL": na, "TEXCOORD_0": ta},
                          "indices": ia, "material": mat})
        node = {"name": inst.id}
        t = inst.translation
        if np.any(np.abs(t) > 1e-9):
            node["translation"] = [float(v) for v in t]
        q = quat_from_matrix(inst.rotation)
        if abs(q[3] - 1.0) > 1e-9:
            node["rotation"] = q
        if prims:
            meshes.append({"name": inst.id, "primitives": prims})
            node["mesh"] = len(meshes) - 1
        if inst.children:
            node["children"] = [index_of[c] for c in inst.children]
        node["extras"] = {"part": inst.src_id, "mirrored": inst.mirrored}
        nodes.append(node)

    # animations: every clip baked to LINEAR samples (30 fps) per animated joint
    animations = []
    clips = model.spec.get("animations") or {}
    if clips:
        anim = model.animator()
        for cname in clips:
            times, data = anim.trs_samples(cname, fps=int(model.spec.get("anim_fps", 30)))
            tin = add_accessor(times.astype(np.float32).reshape(-1, 1), "SCALAR", 5126, None, True)
            samplers, channels = [], []
            for iid, (T, Q, S) in data.items():
                node = index_of[iid]
                for path, arr, kind in (("translation", T, "VEC3"), ("rotation", Q, "VEC4"), ("scale", S, "VEC3")):
                    if np.ptp(arr, axis=0).max() < 1e-6 and path != "rotation":
                        continue  # constant channel
                    if path == "rotation" and np.ptp(arr, axis=0).max() < 1e-7:
                        continue
                    out = add_accessor(arr.astype(np.float32), kind, 5126, None)
                    samplers.append({"input": tin, "output": out, "interpolation": "LINEAR"})
                    channels.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": path}})
            if channels:
                animations.append({"name": cname, "samplers": samplers, "channels": channels})

    img_view = add_view(atlas_png_bytes(model))
    mat_cfg = model.material
    unlit = bool(mat_cfg.get("unlit", True))
    filt = LINEAR if mat_cfg.get("filter") == "linear" else NEAREST
    mat_common = {"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0,
                                           "roughnessFactor": 1.0 if unlit else float(mat_cfg.get("roughness", 0.85))},
                  "alphaMode": "MASK", "alphaCutoff": 0.5}
    if unlit:
        mat_common["extensions"] = {"KHR_materials_unlit": {}}
    gltf = {
        "asset": {"version": "2.0", "generator": "lowpix"},
        **({"extensionsUsed": ["KHR_materials_unlit"]} if unlit else {}),
        "scene": 0,
        "scenes": [{"name": model.name, "nodes": [i for i, inst in enumerate(model.instances) if inst.parent is None]}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": ([dict(mat_common, name="pixel_solid", doubleSided=False)] if has_solid else [])
                     + ([dict(mat_common, name="pixel_card", doubleSided=True)] if has_card else []),
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": filt, "minFilter": filt, "wrapS": CLAMP, "wrapT": CLAMP}],
        "images": [{"bufferView": img_view, "mimeType": "image/png", "name": "atlas"}],
        **({"animations": animations} if animations else {}),
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": 0}],
    }
    binary = b"".join(bin_parts)
    binary += b"\x00" * ((-len(binary)) % 4)
    gltf["buffers"][0]["byteLength"] = len(binary)
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


# ---------------------------------------------------------------------- OBJ
def obj_text(model, texture_name="texture.png", mtl_name="model.mtl"):
    """World-space OBJ (+MTL). Use nearest/closest filtering when importing."""
    lines = [f"# lowpix export: {model.name}", f"mtllib {mtl_name}"]
    vi = vti = vni = 1
    for inst in model.instances:
        lines.append(f"o {inst.id}")
        lines.append("usemtl pixel")
        R = inst.world[:3, :3]
        for f in inst.faces:
            wp = transform_points(inst.world, f.pts)
            uv = model.face_uvs(f)
            n = R @ f.normal
            for p in wp:
                lines.append("v %.5f %.5f %.5f" % tuple(p))
            for u, v in uv:
                lines.append("vt %.6f %.6f" % (u, 1.0 - v))
            lines.append("vn %.5f %.5f %.5f" % tuple(n))
            for a, b, c in f.tris:
                lines.append(f"f {vi + a}/{vti + a}/{vni} {vi + b}/{vti + b}/{vni} {vi + c}/{vti + c}/{vni}")
            vi += len(wp)
            vti += len(wp)
            vni += 1
    mtl = "\n".join(["newmtl pixel", "Ka 0 0 0", "Kd 1 1 1", "Ks 0 0 0", "illum 0", "d 1",
                     f"map_Kd {texture_name}", f"map_d -imfchan m {texture_name}", ""])
    return "\n".join(lines) + "\n", mtl


# ---------------------------------------------------------------- Blockbench
def _euler_zyx(M):
    """Rotation matrix -> Blockbench/three.js 'ZYX' Euler degrees [x, y, z] (M = Rz @ Ry @ Rx)."""
    sy = -M[2, 0]
    b = math.asin(max(-1.0, min(1.0, sy)))
    if abs(sy) < 0.99999:
        a = math.atan2(M[2, 1], M[2, 2])
        c = math.atan2(M[1, 0], M[0, 0])
    else:
        a = math.atan2(-M[1, 2], M[1, 1])
        c = 0.0
    return [math.degrees(a), math.degrees(b), math.degrees(c)]


def _bb_animations(model, groups, fps=24):
    """Every clip as Blockbench bone keyframes. Bones rest unrotated at their pivots (meshes are exported
    posed), so each key is this bone's motion relative to its parent bone, in world-aligned axes."""
    clips = model.spec.get("animations") or {}
    if not clips:
        return []
    anim = model.animator()
    rest = {i.id: i.world for i in model.instances}
    parent = {i.id: i.parent for i in model.instances}
    out = []
    for cname in clips:
        length, loop, _ = anim.clip(cname)
        n = max(2, int(round(length * fps)) + 1)
        tracks = {}
        for k in range(n):
            t = min(length, k / fps)
            W = anim.world_matrices(cname, t)
            A = {iid: W[iid] @ np.linalg.inv(rest[iid]) for iid in rest}   # world-space motion of each bone
            for iid, g in groups.items():
                pa = A[parent[iid]] if parent[iid] in A else np.eye(4)
                L = np.linalg.inv(pa) @ A[iid]
                Rm = L[:3, :3]
                sc = np.linalg.norm(Rm, axis=0)
                Rn = Rm / np.maximum(sc, 1e-9)
                o = np.array(g["origin"])
                pos = (Rm @ o + L[:3, 3]) - o
                tr = tracks.setdefault(iid, {"rotation": [], "position": [], "scale": []})
                ex, ey, ez = _euler_zyx(Rn)
                # Blockbench's bone animator negates X/Y rotation and X position (Minecraft convention)
                tr["rotation"].append((t, [-ex, -ey, ez]))
                tr["position"].append((t, [-float(pos[0]), float(pos[1]), float(pos[2])]))
                tr["scale"].append((t, sc.tolist()))
        animators = {}
        for iid, tr in tracks.items():
            kfs = []
            for ch, keys in tr.items():
                ident = [0, 0, 0] if ch != "scale" else [1, 1, 1]
                if all(np.allclose(v, ident, atol=1e-4) for _, v in keys):
                    continue
                for t, v in keys:
                    kfs.append({"channel": ch, "data_points": [{"x": round(v[0], 4), "y": round(v[1], 4),
                                                                "z": round(v[2], 4)}],
                                "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{cname}/{iid}/{ch}/{t:.4f}")),
                                "time": round(t, 4), "color": -1, "interpolation": "linear"})
            if kfs:
                animators[groups[iid]["uuid"]] = {"name": iid, "type": "bone", "keyframes": kfs}
        out.append({"uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"lowpix/{model.name}/anim/{cname}")), "name": cname,
                    "loop": "loop" if loop else "once", "override": False, "length": round(length, 4), "snapping": fps,
                    "selected": False, "anim_time_update": "", "blend_weight": "", "start_delay": "",
                    "loop_delay": "", "animators": animators})
    return out


def bbmodel_json(model) -> dict:
    """Blockbench 'Generic Model' file with one mesh element per part instance
    (world-space, so hand-painting in Blockbench works immediately). Experimental."""
    AH, AW = model.atlas.shape[:2]
    elements, outliner = [], []
    elem_of = {}
    for inst in model.instances:
        verts, faces = {}, {}
        R = inst.world[:3, :3]
        origin = inst.world[:3, 3]
        k = 0
        for fi, f in enumerate(inst.faces):
            wp = transform_points(inst.world, f.pts) - origin
            uv = model.face_uvs(f)
            keys = []
            for p in wp:
                key = f"v{k}"
                k += 1
                verts[key] = [round(float(c), 5) for c in p]
                keys.append(key)
            if len(keys) == 4 and f.kind == "quad":
                # Blockbench quads: vertex order around the face
                ordered = [keys[0], keys[3], keys[2], keys[1]]
                uvo = [uv[0], uv[3], uv[2], uv[1]]
                faces[f"f{fi}"] = {"uv": {kk: [float(u * AW), float(v * AH)] for kk, (u, v) in zip(ordered, uvo)},
                                   "vertices": ordered, "texture": 0}
            else:
                for ti, (a, b, c) in enumerate(f.tris):
                    tri = [keys[a], keys[b], keys[c]]
                    faces[f"f{fi}_{ti}"] = {"uv": {kk: [float(uv[i][0] * AW), float(uv[i][1] * AH)]
                                                   for kk, i in zip(tri, (a, b, c))},
                                            "vertices": tri, "texture": 0}
        uid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"lowpix/{model.name}/{inst.id}"))
        elements.append({"name": inst.id, "type": "mesh", "uuid": uid, "origin": [float(v) for v in origin],
                         "rotation": [0, 0, 0], "export": True, "visibility": True, "locked": False,
                         "render_order": "default", "allow_mirror_modeling": True, "color": 0,
                         "vertices": verts, "faces": faces})
        elem_of[inst.id] = uid
    # bones: one group per instance at its pivot, nested like the rig, holding that instance's mesh
    groups = {}
    for inst in model.instances:
        gid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"lowpix/{model.name}/bone/{inst.id}"))
        groups[inst.id] = {"name": inst.id, "origin": [round(float(v), 5) for v in inst.world[:3, 3]],
                           "rotation": [0, 0, 0], "uuid": gid, "export": True, "isOpen": False, "locked": False,
                           "visibility": True, "autouv": 0, "color": 0,
                           "children": [elem_of[inst.id]] if inst.faces else []}
    for inst in model.instances:
        if inst.parent and inst.parent in groups:
            groups[inst.parent]["children"].append(groups[inst.id])
        else:
            outliner.append(groups[inst.id])
    animations = _bb_animations(model, groups)
    png = base64.b64encode(atlas_png_bytes(model)).decode()
    return {
        "meta": {"format_version": "4.5", "model_format": "free", "box_uv": False},
        "name": model.name,
        "model_identifier": "",
        "visible_box": [1, 1, 0],
        "resolution": {"width": AW, "height": AH},
        "elements": elements,
        "outliner": outliner,
        "animations": animations,
        "textures": [{"path": "", "name": "texture.png", "folder": "", "namespace": "", "id": "0",
                      "width": AW, "height": AH, "uv_width": AW, "uv_height": AH, "particle": False,
                      "render_mode": "default", "render_sides": "auto", "frame_time": 1,
                      "frame_order_type": "loop", "frame_order": "", "frame_interpolate": False,
                      "visible": True, "internal": True, "saved": False,
                      "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"lowpix/{model.name}/texture")),
                      "source": "data:image/png;base64," + png}],
    }
