#!/usr/bin/env python3
"""Vehicles: Sketchfab (CC-BY) models -> BUSHED's pixel-hd lit style, restructured for driving.

    cd /home/user/symmetrical-goggles
    python games/bushed/tools/make_vehicle.py jeep          # or npc_pickup, trailer

Each vehicle is converted with lowpix (pixel-hd palette ramps, ~256 px/m, no painted light, AO cavity only) in
parts so the moving pieces are separate nodes with their pivots at the origin of the node:
  <name>/body, glass, wheel_fl, wheel_fr, wheel_rl, wheel_rr (spin about local X), steering_wheel (turns about
  local Z, which points from the column to the driver), door_* if the source has them.
Real scale in metres, front = +Z, left = +X (left-hand drive), ground (tyre bottoms) at y = 0, origin at the centre
of the x/z bounds. A <name>.json next to the glb records wheel centres, radius, width, the steering wheel pivot
and axis, the driver's eye point and the mass.

Sources (downloaded by `python -m lowpix sketchfab` into out/bushed/sfdl/<uid>, gitignored) and their licences
are listed in VEHICLES; credit lines go to games/bushed/CREDITS.md.
"""
from __future__ import annotations

import copy
import io
import json
import math
import os
import struct
import sys
import urllib.parse

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import convert_props as CP  # noqa: E402  (lowpix patches, atlas dilation, glb parsing)
from meshparts import components  # noqa: E402

ROOT = CP.ROOT
sys.path.insert(0, ROOT)
SFDL = os.path.join(ROOT, "out", "bushed", "sfdl")
OUTP = os.path.join(ROOT, "out", "bushed", "vehicles")


# ------------------------------------------------------------------ texture patching
def push_pull_fill(rgb: np.ndarray, hole: np.ndarray) -> np.ndarray:
    """Fill `hole` pixels from the surrounding ones (smooth, like content-aware fill without the content)."""
    a = np.zeros(rgb.shape[:2] + (4,))
    a[..., :3] = rgb
    a[..., 3] = (~hole) * 255
    out = CP.dilate(np.clip(a, 0, 255).astype(np.uint8))[..., :3].astype(np.float64)
    return np.where(hole[..., None], out, rgb)


def paint_out(img_path: str, rects: list[tuple[int, int, int, int]], out_path: str, min_bright: int = 140,
              grow: int = 4) -> None:
    """Remove light-coloured markings (stars, numbers) inside rects (x0, y0, x1, y1 in image pixels)."""
    im = np.asarray(Image.open(img_path).convert("RGB")).astype(np.float64)
    hole = np.zeros(im.shape[:2], bool)
    for r in rects:
        x0, y0, x1, y1 = r[:4]
        thr = r[4] if len(r) > 4 else min_bright
        sub = im[y0:y1, x0:x1]
        m = sub.min(-1) > thr
        hole[y0:y1, x0:x1] |= m
    # grow the mask a little (anti-aliased edges)
    for _ in range(grow):
        h = hole.copy()
        h[1:] |= hole[:-1]; h[:-1] |= hole[1:]; h[:, 1:] |= hole[:, :-1]; h[:, :-1] |= hole[:, 1:]
        hole = h
    # fill per rect region (with margin) so far-away texels don't bleed in
    out = im.copy()
    for r in rects:
        x0, y0, x1, y1 = r[:4]
        m = 48
        X0, Y0, X1, Y1 = max(0, x0 - m), max(0, y0 - m), min(im.shape[1], x1 + m), min(im.shape[0], y1 + m)
        out[Y0:Y1, X0:X1] = push_pull_fill(im[Y0:Y1, X0:X1], hole[Y0:Y1, X0:X1])
        # a little of the surrounding grain back on top of the flat fill
        rng = np.random.default_rng(x0 * 7 + y0)
        n = rng.normal(0, 4.0, out[Y0:Y1, X0:X1].shape[:2])[..., None]
        out[Y0:Y1, X0:X1] = np.where(hole[Y0:Y1, X0:X1, None], out[Y0:Y1, X0:X1] + n, out[Y0:Y1, X0:X1])
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(out_path)


def ao_multiply(col_path: str, occ_path: str, strength: float, out_path: str) -> None:
    c = Image.open(col_path).convert("RGB")
    if max(c.size) > 2048:
        c = c.resize((2048, 2048), Image.LANCZOS)
    o = Image.open(occ_path).convert("RGB").resize(c.size, Image.BILINEAR)
    a = np.asarray(o, np.float64)[..., 0] / 255
    f = 1 - strength * (1 - a)
    out = np.asarray(c, np.float64) * f[..., None]
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(out_path)


# ------------------------------------------------------------------ geometry helpers
def sub_mesh(mesh, tri_mask: np.ndarray, xf: np.ndarray):
    """MeshData of the selected triangles with vertices transformed by the 4x4 `xf`."""
    from lowpix.convert import MeshData
    F = mesh.F[tri_mask]
    used, inv = np.unique(F.reshape(-1), return_inverse=True)
    m = MeshData()
    V = mesh.V[used]
    m.V = V @ xf[:3, :3].T + xf[:3, 3]
    m.UV = mesh.UV[used]
    m.F = inv.reshape(-1, 3)
    if np.linalg.det(xf[:3, :3]) < 0:
        m.F = m.F[:, ::-1]
    m.M = mesh.M[tri_mask]
    m.materials = mesh.materials
    return m


def frame_from_axis(z: np.ndarray) -> np.ndarray:
    """rotation matrix whose columns are local X, Y, Z (Z = given axis, Y as close to world up as possible)"""
    z = z / np.linalg.norm(z)
    up = np.array([0.0, 1.0, 0.0])
    y = up - z * np.dot(up, z)
    if np.linalg.norm(y) < 1e-6:
        y = np.array([0.0, 0.0, 1.0])
    y /= np.linalg.norm(y)
    x = np.cross(y, z)
    return np.stack([x, y, z], 1)


def quat_from_matrix(R: np.ndarray) -> list[float]:
    t = np.trace(R)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w, x, y, z = 0.25 * s, (R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = math.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
        w, x, y, z = (R[2, 1] - R[1, 2]) / s, 0.25 * s, (R[0, 1] + R[1, 0]) / s, (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = math.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
        w, x, y, z = (R[0, 2] - R[2, 0]) / s, (R[0, 1] + R[1, 0]) / s, 0.25 * s, (R[1, 2] + R[2, 1]) / s
    else:
        s = math.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
        w, x, y, z = (R[1, 0] - R[0, 1]) / s, (R[0, 2] + R[2, 0]) / s, (R[1, 2] + R[2, 1]) / s, 0.25 * s
    return [float(x), float(y), float(z), float(w)]


# ------------------------------------------------------------------ conversion of one part
_PARTS: dict = {}


def convert_part(key: str, mesh, kind: str, tris: int, density: float, atlas: int = 2048, name: str = "part",
                 chroma_k: float = 1.0):
    """lowpix-convert an in-memory MeshData. Returns (glb bytes, n0) where n0 = (cx, ymin, cz) of the mesh
    bounds: lowpix re-centres the result, so adding n0 back restores the input coordinates."""
    import lowpix.convert as LC
    from lowpix.export import glb_bytes

    if not getattr(LC, "_bushed_parts", False):
        LC.load_model = lambda p, _orig=LC.load_model: _PARTS[p] if p in _PARTS else _orig(p)
        LC._bushed_parts = True
    CP.install_normal_aware_sampling(LC)

    def _load_image(data: bytes, _cap=2048):
        im = Image.open(io.BytesIO(data)).convert("RGB")
        if max(im.size) > _cap:
            im.thumbnail((_cap, _cap), Image.LANCZOS)
        return np.asarray(im, np.float32) / 255.0
    LC._load_image = _load_image
    lo, hi = mesh.V.min(0), mesh.V.max(0)
    n0 = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    h = max(float(hi[1] - lo[1]), 1e-4)
    _PARTS[key] = mesh
    if kind == "glass":
        kw = dict(grain=0.0, ramps=3, steps=6, spread=0.3)
    else:
        kw = dict(grain=0.18, ramps=12, steps=12, spread=0.62)
    CP._TEXEL_NORMALS.clear()
    m = LC.convert(key, style="pixel-hd", height=h, name=name, tris=0 if len(mesh.F) <= tris * 1.15 else tris,
                   density=density, atlas=atlas, light=0.0, crease=0.0, outline=False, smooth=0.0, detail=1.0,
                   chart_angle=40.0, **kw)
    m.spec["material"] = {"unlit": False, "filter": "nearest", "roughness": 0.8}
    if kind != "glass":
        m.atlas = CP.unboost_atlas(m.atlas, chroma_k)
    m.atlas = CP.dilate(m.atlas)
    tris_out = sum(len(f.tris) for i in m.instances for f in i.faces)
    return glb_bytes(m), n0, tris_out, m


# ------------------------------------------------------------------ glb assembly
def assemble(name: str, parts: list[dict], extras: dict) -> bytes:
    """parts: {name, glb, kind, translation, rotation (xyzw) or None, goff (geometry offset added to vertices)}"""
    out = {"asset": {"version": "2.0", "generator": "lowpix + bushed/tools/make_vehicle.py"}, "scene": 0,
           "scenes": [{"name": name, "nodes": [0]}], "nodes": [{"name": name, "children": [], "extras": extras}],
           "meshes": [], "materials": [], "textures": [], "samplers": [], "images": [], "accessors": [],
           "bufferViews": [], "buffers": [{"byteLength": 0}]}
    blob = bytearray()
    for p in parts:
        js, bin_ = CP._parse_glb(p["glb"])
        bin_ = bytearray(bin_)
        goff = np.asarray(p.get("goff", [0, 0, 0]), np.float32)
        # shift POSITION data in place
        for me in js["meshes"]:
            for pr in me["primitives"]:
                a = js["accessors"][pr["attributes"]["POSITION"]]
                bv = js["bufferViews"][a["bufferView"]]
                off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
                P = np.frombuffer(bytes(bin_[off: off + a["count"] * 12]), np.float32).reshape(-1, 3) + goff
                bin_[off: off + a["count"] * 12] = P.astype(np.float32).tobytes()
                a["min"] = [float(v) for v in P.min(0)]
                a["max"] = [float(v) for v in P.max(0)]
        blob += b"\0" * ((-len(blob)) % 4)
        boff = len(blob)
        blob += bin_
        bv0, ac0, im0, tx0, sm0, mt0, me0 = (len(out[k]) for k in
                                              ("bufferViews", "accessors", "images", "textures", "samplers", "materials", "meshes"))
        for bv in js["bufferViews"]:
            out["bufferViews"].append({**bv, "byteOffset": bv.get("byteOffset", 0) + boff})
        for a in js["accessors"]:
            out["accessors"].append({**a, "bufferView": a["bufferView"] + bv0})
        for im in js["images"]:
            out["images"].append({**im, "bufferView": im["bufferView"] + bv0, "name": f"{name}_{p['name']}"})
        for s in js["samplers"]:
            out["samplers"].append(dict(s))
        for t in js["textures"]:
            out["textures"].append({"sampler": t["sampler"] + sm0, "source": t["source"] + im0})
        for m in js["materials"]:
            m = copy.deepcopy(m)
            m.pop("extensions", None)
            m["pbrMetallicRoughness"]["baseColorTexture"]["index"] += tx0
            m["name"] = f"{name}_{p['name']}"
            m["extras"] = {"kind": p["kind"]}
            if p["kind"] == "glass":
                m["alphaMode"] = "BLEND"
                m.pop("alphaCutoff", None)
                m["pbrMetallicRoughness"].update({"baseColorFactor": [1, 1, 1, 0.3], "roughnessFactor": 0.12})
            else:
                m["alphaMode"] = "OPAQUE"
                m.pop("alphaCutoff", None)
                m["pbrMetallicRoughness"]["roughnessFactor"] = p.get("rough", 0.75)
            m["doubleSided"] = True
            out["materials"].append(m)
        for me in js["meshes"]:
            me = copy.deepcopy(me)
            me["name"] = p["name"]
            for pr in me["primitives"]:
                pr["attributes"] = {k: v + ac0 for k, v in pr["attributes"].items()}
                pr["indices"] += ac0
                pr["material"] += mt0
            out["meshes"].append(me)
        node = {"name": p["name"], "mesh": me0}
        if any(abs(v) > 1e-9 for v in p.get("translation", [0, 0, 0])):
            node["translation"] = [float(v) for v in p["translation"]]
        if p.get("rotation") is not None:
            node["rotation"] = [float(v) for v in p["rotation"]]
        out["nodes"].append(node)
        out["nodes"][0]["children"].append(len(out["nodes"]) - 1)
    blob += b"\0" * ((-len(blob)) % 4)
    out["buffers"][0]["byteLength"] = len(blob)
    js = json.dumps(out, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))


# ------------------------------------------------------------------ vehicles
def prepare_source(uid: str, patches: dict, ao: bool = True, drop_materials: tuple = ()) -> tuple[str, float]:
    """Copy of the source glTF with patched / AO-multiplied base colours. Returns its path."""
    d = os.path.join(SFDL, uid)
    src = os.path.join(d, "scene.gltf")
    js = json.load(open(src))
    os.makedirs(os.path.join(d, "_bushed"), exist_ok=True)
    tex_img = {i: t.get("source") for i, t in enumerate(js.get("textures", []))}
    for mi, m in enumerate(js.get("materials", [])):
        pbr = m.get("pbrMetallicRoughness", {})
        bt = pbr.get("baseColorTexture")
        if not bt:
            continue
        ii = tex_img[bt["index"]]
        uri = urllib.parse.unquote(js["images"][ii]["uri"])
        cur = os.path.join(d, uri)
        base = os.path.basename(uri).rsplit(".", 1)[0]
        if base in patches:
            outp = os.path.join(d, "_bushed", base + "_clean.png")
            if not os.path.exists(outp):
                paint_out(cur, patches[base], outp)
            cur = outp
        occ = m.get("occlusionTexture")
        if ao and occ:
            op = os.path.join(d, urllib.parse.unquote(js["images"][tex_img[occ["index"]]]["uri"]))
            outp = os.path.join(d, "_bushed", base + "_ao.png")
            if not os.path.exists(outp):
                ao_multiply(cur, op, 0.6 * occ.get("strength", 1.0), outp)
            cur = outp
        js["images"][ii] = {"uri": os.path.relpath(cur, d)}
    for mi in drop_materials:
        for me in js["meshes"]:
            me["primitives"] = [p for p in me["primitives"] if p.get("material") != mi]
    js, k = CP.boost_colours(js, d)
    p = os.path.join(d, "_bushed.gltf")
    json.dump(js, open(p, "w"))
    return p, k


def build(cfg: dict) -> dict:
    import lowpix.convert as LC
    uid = cfg["uid"]
    src, chroma_k = prepare_source(uid, cfg.get("paint_out", {}), drop_materials=cfg.get("drop_materials", ()))
    print("chroma boost", round(chroma_k, 2))
    mesh = LC.load_gltf(src)
    s = cfg["scale"]
    V = mesh.V * s
    if cfg.get("yaw"):
        a = math.radians(cfg["yaw"])
        R = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        V = V @ R.T
    keep = np.ones(len(mesh.F), bool)
    if cfg.get("drop"):
        keep &= ~cfg["drop"](V, mesh)
    lab = components(V, mesh.F, 1e-5 * max(1.0, s))
    n = lab.max() + 1
    P = V[mesh.F]
    clo = np.full((n, 3), 1e9)
    chi = np.full((n, 3), -1e9)
    np.minimum.at(clo, lab, P.min(1))
    np.maximum.at(chi, lab, P.max(1))
    # vehicle frame: centre of the x/z bounds, y = 0 at the lowest kept point
    Vk = P[keep].reshape(-1, 3)
    lo, hi = Vk.min(0), Vk.max(0)
    t = -np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    V = V + t
    clo, chi = clo + t, chi + t
    # parts
    part_of = np.full(len(mesh.F), "body", dtype=object)
    part_of[~keep] = "drop"
    info = {"wheels": {}}
    wheels = cfg["find_wheels"](clo, chi, np.bincount(lab), lab, mesh, V)
    for wname, (wmask, centre, radius, width) in wheels.items():
        sel = wmask & keep
        part_of[sel] = wname
        info["wheels"][wname] = {"pos": [round(float(v), 4) for v in centre], "radius": round(float(radius), 4),
                                 "width": round(float(width), 4)}
    if cfg.get("find_steering"):
        cids, pivot, axis, radius = cfg["find_steering"](clo, chi, np.bincount(lab), lab, mesh, V)
        part_of[np.isin(lab, cids) & keep] = "steering_wheel"
        info["steering_wheel"] = {"pos": [round(float(v), 4) for v in pivot],
                                  "axis": [round(float(v), 4) for v in axis / np.linalg.norm(axis)],
                                  "radius": round(float(radius), 4)}
    for mi in cfg.get("glass_materials", ()):
        part_of[(mesh.M == mi) & (part_of == "body")] = "glass"
    if cfg.get("extra_parts"):
        for pname, fn in cfg["extra_parts"].items():
            res = fn(clo, chi, np.bincount(lab), lab, mesh, V)
            if res is None:
                continue
            cids, pivot, axis = res
            part_of[np.isin(lab, cids) & keep & (part_of == "body")] = pname
            info.setdefault("doors", {})[pname] = {"hinge": [round(float(v), 4) for v in pivot],
                                                   "axis": [round(float(v), 4) for v in axis]}
    mesh.V = V
    parts = []
    os.makedirs(OUTP, exist_ok=True)
    total = 0
    order = ["body", "glass"] + sorted(k for k in set(part_of) if k.startswith("wheel_")) + \
        [k for k in ("steering_wheel",) if k in set(part_of)] + sorted(k for k in set(part_of) if k.startswith("door_"))
    for pname in order:
        sel = part_of == pname
        if not sel.any():
            continue
        if pname.startswith("wheel_"):
            w = info["wheels"][pname]
            pivot, Rm = np.array(w["pos"]), np.eye(3)
        elif pname == "steering_wheel":
            sw = info["steering_wheel"]
            pivot, Rm = np.array(sw["pos"]), frame_from_axis(np.array(sw["axis"]))
        elif pname.startswith("door_"):
            dd = info["doors"][pname]
            pivot, Rm = np.array(dd["hinge"]), np.eye(3)
        else:
            pivot, Rm = np.zeros(3), np.eye(3)
        xf = np.eye(4)
        xf[:3, :3] = Rm.T
        xf[:3, 3] = -Rm.T @ pivot
        sm = sub_mesh(mesh, sel, xf)
        kind = "glass" if pname == "glass" else "body"
        budget = cfg["tris"].get(pname.split("_")[0] if pname.startswith(("wheel", "door")) else pname, 1000)
        dens = cfg.get("density", 256.0) if kind != "glass" else 32.0
        glb, n0, ntri, m = convert_part(f"{cfg['out']}:{pname}", sm, kind, budget, dens,
                                        atlas=cfg.get("atlas", 2048) if pname == "body" else 1024, name=pname,
                                        chroma_k=chroma_k)
        total += ntri
        from lowpix.render import render
        try:
            render(m, 640, 480, 35, 22).save(os.path.join(OUTP, f"{cfg['out']}_{pname}.png"))
        except Exception as e:
            print("render failed", e)
        Image.fromarray(m.atlas, "RGBA").save(os.path.join(OUTP, f"{cfg['out']}_{pname}_atlas.png"))
        parts.append({"name": pname, "glb": glb, "kind": kind, "translation": pivot.tolist(),
                      "rotation": None if np.allclose(Rm, np.eye(3)) else quat_from_matrix(Rm), "goff": n0.tolist(),
                      "rough": cfg.get("rough", 0.75)})
        print(pname, "tris", ntri, "atlas", m.atlas.shape[:2], "density", round(m.density, 1), flush=True)
    att = json.load(open(os.path.join(SFDL, uid, "ATTRIBUTION.json")))
    Vk = V[mesh.F[part_of != "drop"]].reshape(-1, 3)
    size = (Vk.max(0) - Vk.min(0)).tolist()
    extras = {"source": att.get("source"), "author": att.get("author"), "licence": "CC-BY-4.0", "size": size}
    data = assemble(cfg["out"], parts, extras)
    out_glb = os.path.join(CP.MODELS, f"{cfg['out']}.glb")
    open(out_glb, "wb").write(data)
    wl = info["wheels"]
    meta = {
        "name": cfg["name"], "file": f"assets/models/{cfg['out']}.glb", "size": [round(v, 3) for v in size],
        "mass": cfg["mass"], "tris": total, "frontAxis": "+z", "leftAxis": "+x", "up": "+y",
        "wheels": wl,
        "wheelbase": round(abs(np.mean([w["pos"][2] for k, w in wl.items() if "_f" in k])
                               - np.mean([w["pos"][2] for k, w in wl.items() if "_r" in k])), 4) if len(wl) >= 4 else None,
        "track": round(abs(np.mean([w["pos"][0] for k, w in wl.items() if k.endswith("l")])
                           - np.mean([w["pos"][0] for k, w in wl.items() if k.endswith("r")])), 4) if len(wl) >= 2 else None,
        **({"steeringWheel": info["steering_wheel"]} if "steering_wheel" in info else {}),
        **({"doors": info["doors"]} if info.get("doors") else {}),
        **cfg.get("meta", {}),
        "nodes": [p["name"] for p in parts],
        "notes": cfg.get("notes", ""),
        "source": att.get("source"), "author": att.get("author"), "licence": "CC-BY-4.0",
        "attribution": f"This work is based on \"{att.get('name')}\" ({att.get('source')}) by {att.get('author')} "
                       f"({att.get('author_url')}) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)",
    }
    if "steeringWheel" in meta:   # where the driver's eyes are: behind the wheel, a head above it
        sw = meta["steeringWheel"]
        back = np.array(sw["axis"]) * [1, 0, 1]
        back /= max(np.linalg.norm(back), 1e-6)
        eye = np.array(sw["pos"]) + back * 0.55 + [0, 0.32, 0]
        meta["driverEye"] = [round(float(v), 3) for v in eye]
    if cfg["out"] == "trailer":   # hitch: the front tip of the drawbar
        Vb = V[mesh.F[part_of == "body"]].reshape(-1, 3)
        tip = Vb[Vb[:, 2] > Vb[:, 2].max() - 0.03]
        meta["hitch"] = [round(float(v), 4) for v in (tip.mean(0) * [1, 0, 0] + [0, tip[:, 1].mean(), Vb[:, 2].max()])]
    json.dump(meta, open(os.path.join(CP.MODELS, f"{cfg['out']}.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in meta.items() if k not in ("attribution",)}, indent=None)[:1500])
    return meta


# ------------------------------------------------------------------ part finders
def wheel_finder(min_d=0.45, max_w=0.45, min_tris=1000, single_axle=False, inward=0.12):
    """Tyres: components about as tall as they are long, narrow along x (spin axis). A wheel also takes every
    triangle of the smaller components that sit inside the tyre's y/z bounds (rims, hubs, wheel nuts) and lie on
    its side of the car, up to `inward` metres inside the tyre (a rim welded to its axle is cut off there).
    Spare wheels (axis along z) stay on the body. Returns {name: (triangle mask, centre, radius, width)}."""
    def find(clo, chi, cnt, lab, mesh, V):
        sz = chi - clo
        tyres = np.nonzero((sz[:, 1] > min_d) & (np.abs(sz[:, 1] - sz[:, 2]) < 0.06 * sz[:, 1]) & (sz[:, 0] < max_w)
                           & (cnt > min_tris))[0]
        cen = V[mesh.F].mean(1)
        out = {}
        for c in tyres:
            ctr = (clo[c] + chi[c]) / 2
            r = (sz[c, 1] + sz[c, 2]) / 4
            pad = 0.02
            yz_in = (clo[:, 1] >= clo[c, 1] - pad) & (chi[:, 1] <= chi[c, 1] + pad) & \
                    (clo[:, 2] >= clo[c, 2] - pad) & (chi[:, 2] <= chi[c, 2] + pad)
            touch = (chi[:, 0] >= clo[c, 0] - inward) & (clo[:, 0] <= chi[c, 0] + inward)
            comps = np.nonzero(yz_in & touch)[0]
            if ctr[0] > 0:
                xin = (cen[:, 0] >= clo[c, 0] - inward) & (cen[:, 0] <= chi[c, 0] + pad)
            else:
                xin = (cen[:, 0] <= chi[c, 0] + inward) & (cen[:, 0] >= clo[c, 0] - pad)
            rad = np.hypot(cen[:, 1] - ctr[1], cen[:, 2] - ctr[2]) <= r + pad
            mask = np.isin(lab, comps) & xin & rad
            side = "l" if ctr[0] > 0 else "r"
            end = "" if single_axle else ("f" if ctr[2] > 0 else "r")
            out[f"wheel_{end}{side}"] = (mask, ctr, r, sz[c, 0])
        assert len(out) == (2 if single_axle else 4), f"found {len(out)} tyres: {sorted(out)}"
        return out
    return find


def steering_finder(size=(0.33, 0.47), min_y=0.5, min_tris=200):
    def find(clo, chi, cnt, lab, mesh, V):
        sz = chi - clo
        cx, cz = (clo[:, 0] + chi[:, 0]) / 2, (clo[:, 2] + chi[:, 2]) / 2
        cand = np.nonzero((sz.max(1) > size[0]) & (sz.max(1) < size[1]) & (clo[:, 1] > min_y) & (cx > 0.1)
                          & (cz > -0.4) & (cz < 1.0) & (cnt > min_tris) & (np.sort(sz, 1)[:, 1] > size[0] * 0.6))[0]
        assert len(cand), "no steering wheel candidate"
        rim = cand[np.argmax(cnt[cand])]
        inside = np.nonzero(np.all(clo >= clo[rim] - 0.02, 1) & np.all(chi <= chi[rim] + 0.02, 1))[0]
        P = V[mesh.F[lab == rim]].reshape(-1, 3)
        c = (P.min(0) + P.max(0)) / 2
        w, U = np.linalg.eigh(np.cov((P - c).T))
        axis = U[:, 0]
        if axis[2] > 0:          # point from the column towards the driver (backwards)
            axis = -axis
        radius = float(np.median(np.linalg.norm((P - c) - np.outer((P - c) @ axis, axis), axis=1)))
        print("steering wheel: components", inside.tolist(), "centre", c.round(3), "axis", axis.round(3), "r", round(radius, 3))
        return inside, c, axis, radius
    return find


VEHICLES = {
    "jeep": dict(
        uid="d6e73ec5537e49269ec92b8ab78230c2", out="jeep", name="Jeep", scale=0.2346,
        # US stars on the hood and flanks painted out (a civilian surplus jeep); x0, y0, x1, y1 in the 4k texture
        # plus the modeller's stencilled signature on the rear panel (grey on black, threshold 70)
        paint_out={"lambert2614SG_baseColor": [(240, 1780, 720, 2250), (180, 1460, 340, 1610), (2540, 0, 2700, 200)],
                   "lambert2617SG_baseColor": [(2380, 220, 2760, 640, 70), (3540, 255, 3860, 660, 70)]},
        glass_materials=(0,), find_wheels=wheel_finder(0.6, 0.3, 2000), find_steering=steering_finder(min_tris=800),
        tris={"body": 26000, "wheel": 1400, "steering_wheel": 600, "glass": 300},
        density=256.0, atlas=4096, mass=1100, rough=0.7,
        notes="Open WWII-pattern 4x4 with a folding windshield and no doors; US stars painted out. The axe and shovel on "
              "the left flank and the spare wheel are part of the body. Wheels spin about local X; the steering wheel "
              "turns about local Z.",
    ),
    "npc_pickup": dict(
        uid="43394652043a4387be183ef75d7af5a1", out="npc_pickup", name="Old pickup", scale=1.0,
        find_wheels=wheel_finder(0.6, 0.45, 1000), find_steering=steering_finder(min_tris=200),
        tris={"body": 15000, "wheel": 800, "steering_wheel": 300, "glass": 200},
        density=256.0, atlas=2048, mass=1500, rough=0.7,
        notes="1960s-style pickup for the NPCs. No glass in the windows (open frames). Wheels spin about local X.",
    ),
    "trailer": dict(
        uid="5a53a60a27144183ab825f559ed73a80", out="trailer", name="Utility trailer", scale=0.7, yaw=-90.0,
        find_wheels=wheel_finder(0.4, 0.3, 1000, single_axle=True),
        tris={"body": 5000, "wheel": 700},
        density=256.0, atlas=2048, mass=260, rough=0.75,
        notes="Single-axle box trailer; the drawbar points +Z (hitch at the front tip, see 'hitch'). The jockey wheel is "
              "part of the body. Wheels spin about local X.",
    ),
}


def main():
    names = sys.argv[1:] or list(VEHICLES)
    for n in names:
        build(VEHICLES[n])


if __name__ == "__main__":
    main()
