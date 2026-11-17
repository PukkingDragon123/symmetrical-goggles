#!/usr/bin/env python3
"""Convert Poly Haven (CC0) props into BUSHED's look with lowpix.

    cd /home/user/symmetrical-goggles
    python games/bushed/tools/convert_props.py                 # every job (skips existing .glb)
    python games/bushed/tools/convert_props.py wooden_axe hatchet --force
    python games/bushed/tools/convert_props.py --jobs 3

Look: lowpix `pixel-hd` (palette ramps, crisp nearest texels) at ~256 px/m and real-world scale (metres),
with lowpix's painted directional light and crease rims switched OFF: the game lights everything, so the colour
map keeps only the source albedo multiplied by the source's own ambient occlusion (cavity darkening).

Every prop becomes one .glb with a root node named after the prop and child nodes:
  body   - the opaque converted mesh (one pixel atlas)
  glass  - (if the source has blended glass) a flat-tinted, low-poly glass mesh, material extras.kind = "glass"
  flame  - (oil lamp) the flame card, material extras.kind = "flame"
Origin: centre of the x/z bounds, y = 0 at the lowest point. Front faces +Z (Poly Haven's convention already).

Downloads (glTF + bin + diffuse + ARM for AO) go to out/bushed/dl/<asset>/ (gitignored scratch), previews and
reports to out/bushed/props/<id>/, the shipped .glb to games/bushed/public/assets/models/<id>.glb.
"""
from __future__ import annotations

import argparse
import copy
import io
import json
import os
import re
import struct
import sys
import time
import urllib.parse
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, ROOT)
GAME = os.path.join(ROOT, "games", "bushed")
DL = os.path.join(ROOT, "out", "bushed", "dl")
PREVIEW = os.path.join(ROOT, "out", "bushed", "props")
MODELS = os.path.join(GAME, "public", "assets", "models")

DENSITY = 256.0        # texels per metre (ARCHITECTURE.md: props 256 px/m)
MAX_ATLAS = 2048       # density is reduced for huge props so the atlas fits
GLASS_TINT = (0.80, 0.85, 0.83)

SMALL, MID, FURN, BIG = 2000, 3000, 6000, 8000
# Poly Haven asset -> (category, triangle budget, options)
# options: yaw (deg), density, ramps, steps, opaque_blend (treat blended materials as opaque),
#          split: [(prop id, root-node-name regex), ...] for kits that hold several objects side by side
PROPS: dict[str, tuple[str, int, dict]] = {
    # tools
    "wooden_axe": ("tool", SMALL, {}), "wooden_axe_02": ("tool", SMALL, {}), "wooden_axe_03": ("tool", SMALL, {}),
    "hatchet": ("tool", SMALL, {}), "handsaw_wood": ("tool", SMALL, {}), "sledgehammer_01": ("tool", SMALL, {}),
    "rusted_spade_01": ("tool", SMALL, {}), "picke_dirty_01": ("tool", SMALL, {}), "crowbar_01": ("tool", 1200, {}),
    "machete": ("tool", 1500, {}), "fish_knife": ("tool", 1200, {}), "wooden_hammer_01": ("tool", 1500, {}),
    "rusted_hacksaw": ("tool", SMALL, {}), "hand_plane_no4": ("tool", MID, {}), "measuring_tape_01": ("tool", 1500, {}),
    "pliers": ("tool", 1500, {}), "bolt_cutters_01": ("tool", SMALL, {}),
    # light
    "Lantern_01": ("light", 5000, {}), "vintage_oil_lamp": ("light", MID, {}), "wooden_lantern_01": ("light", MID, {}),
    "vintage_flashlight": ("light", SMALL, {}), "signal_flashlight": ("light", SMALL, {}),
    "caged_hanging_light": ("light", 5000, {}), "industrial_wall_lamp": ("light", MID, {}),
    "street_lamp_01": ("light", 4000, {}),
    # cabin
    "barrel_stove": ("cabin", FURN, {}), "WoodenTable_01": ("cabin", FURN, {}), "WoodenTable_02": ("cabin", FURN, {}),
    "WoodenTable_03": ("cabin", FURN, {}), "WoodenChair_01": ("cabin", 5000, {}), "Rockingchair_01": ("cabin", FURN, {}),
    "wooden_stool_01": ("cabin", MID, {}), "wooden_stool_02": ("cabin", MID, {}), "old_bed_frame": ("cabin", BIG, {}),
    "vintage_day_bed": ("cabin", BIG, {}), "wooden_bookshelf_worn": ("cabin", FURN, {}),
    "vintage_cabinet_01": ("cabin", BIG, {}), "painted_wooden_cabinet": ("cabin", FURN, {}),
    "wooden_bucket_01": ("cabin", MID, {}), "wooden_bucket_02": ("cabin", MID, {}),
    "wicker_basket_01": ("cabin", 4000, {}), "wicker_basket_02": ("cabin", 4000, {}),
    "wooden_bowl_01": ("cabin", 1500, {}), "wooden_bowl_02": ("cabin", 1500, {}), "wooden_spoon": ("cabin", 800, {}),
    "wooden_cutting_board": ("cabin", 1000, {}), "pot_enamel_01": ("cabin", SMALL, {}), "brass_pot_01": ("cabin", SMALL, {}),
    "brass_pan_01": ("cabin", SMALL, {}), "metal_jug": ("cabin", SMALL, {}), "jug_01": ("cabin", SMALL, {}),
    "vintage_radio_transceiver": ("cabin", 4000, {}), "mantel_clock_01": ("cabin", MID, {}), "wall_clock": ("cabin", SMALL, {}),
    "vintage_suitcase": ("cabin", 6000, {"split": [("vintage_suitcase", r"_01_"), ("vintage_suitcase_02", r"_02_")]}),
    "wooden_candlestick": ("cabin", 1500, {}),
    "painted_wooden_bench": ("cabin", FURN, {}), "wooden_picnic_table": ("cabin", FURN, {}),
    "wooden_ladder": ("cabin", MID, {}), "fishermans_hat": ("cabin", SMALL, {}),
    "rubber_boots": ("cabin", 4000, {"split": [("rubber_boots", r"dirt"), ("rubber_boots_clean", r"^rubber_boots_[lr]$")]}),
    "garden_gloves_01": ("cabin", SMALL, {}), "binoculars": ("cabin", SMALL, {}), "seadogs_compass": ("cabin", 1500, {}),
    "vintage_lighter": ("cabin", 1000, {"opaque_blend": True}), "mousetrap": ("cabin", 1000, {}),
    "stone_fire_pit": ("cabin", BIG, {}),
    # storage / outdoor
    "wooden_crate_01": ("storage", MID, {}), "wooden_crate_02": ("storage", MID, {}), "Barrel_01": ("storage", MID, {}),
    "Barrel_02": ("storage", MID, {}), "barrel_03": ("storage", MID, {}), "metal_jerrycan": ("storage", SMALL, {}),
    "propane_tank": ("storage", SMALL, {}), "small_lpg_tank": ("storage", SMALL, {}), "old_tyre": ("storage", MID, {}),
    "metal_trash_can": ("storage", MID, {"split": [("metal_trash_can", r"^metal_trash_can(?!_rust)"),
                                                   ("metal_trash_can_rust", r"^metal_trash_can_rust")]}),
    "modular_wooden_pier": ("outdoor", BIG, {"split": [(f"wooden_pier_section_0{i}", rf"_section_0{i}$") for i in range(1, 6)]}),
    "modular_electricity_poles": ("outdoor", BIG, {"split": [(f"electricity_pole_0{i}", rf"^preset_0{i}_") for i in range(1, 4)]}),
    "portable_generator": ("storage", FURN, {}), "tire_pump": ("storage", SMALL, {}),
    # store
    "CashRegister_01": ("store", MID, {}), "Shelf_01": ("store", FURN, {}), "wooden_display_shelves_01": ("store", FURN, {}),
    "steel_frame_shelves_01": ("store", FURN, {}), "worn_metal_rack": ("store", FURN, {}), "drawer_cabinet": ("store", FURN, {}),
    "vintage_wooden_drawer_01": ("store", MID, {}), "CheeseBox_01": ("store", 1000, {}), "cardboard_box_01": ("store", 1000, {}),
    "ammo_box": ("store", 1500, {}), "wooden_military_crate": ("store", MID, {}), "oil_tin": ("store", 1000, {}),
    "cleaner_tin_01": ("store", 1000, {}), "small_oil_can_01": ("store", 1500, {}), "plastic_bottle_gallon": ("store", 1500, {}),
    "medical_box": ("store", 1000, {}), "medical_tape": ("store", 800, {}), "can_rusted": ("store", 800, {}),
    "long_life_food": ("store", 1200, {"split": [(f"long_life_food_{n}", rf"_{n}$") for n in ("milk", "tomatoes", "beans", "sardines")]}),
    "wine_bottles_01": ("store", 1500, {"split": [(f"wine_bottle_{n}", rf"_{n}$") for n in ("bordeaux", "alsace", "burgundy", "champagne")]}),
}


def jobs() -> dict[str, dict]:
    """prop id -> job (source asset, node filter, budget, options)"""
    out = {}
    for asset, (cat, tris, opt) in PROPS.items():
        for pid, rx in opt.get("split") or [(asset, None)]:
            out[pid] = {"id": pid, "asset": asset, "nodes": rx, "category": cat, "tris": tris,
                        **{k: v for k, v in opt.items() if k != "split"}}
    return out


def _open(url):
    from lowpix.convert import _open as op
    return op(url)


def fetch(asset: str, res: str = "2k") -> str:
    """glTF + bin + diffuse + ARM only (lowpix reads base colour; ARM gives AO). Returns the .gltf path."""
    dest = os.path.join(DL, asset)
    meta_p = os.path.join(dest, "files.json")
    if os.path.exists(meta_p):
        files = json.load(open(meta_p))
    else:
        files = json.load(_open(f"https://api.polyhaven.com/files/{asset}"))
        os.makedirs(dest, exist_ok=True)
        json.dump(files, open(meta_p, "w"))
    g = files.get("gltf") or {}
    if not g:
        raise ValueError(f"{asset}: no glTF download")
    r = res if res in g else sorted(g, key=lambda s: int("".join(c for c in s if c.isdigit()) or 0))[0]
    entry = g[r]["gltf"]
    main = os.path.join(dest, os.path.basename(urllib.parse.urlparse(entry["url"]).path))
    if not os.path.exists(main):
        open(main, "wb").write(_open(entry["url"]).read())
    for rel, inc in entry.get("include", {}).items():
        low = rel.lower()
        if not (low.endswith(".bin") or "_diff_" in low or "_arm_" in low):
            continue
        p = os.path.join(dest, rel)
        if os.path.exists(p) and os.path.getsize(p) == inc.get("size", -1):
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "wb").write(_open(inc["url"]).read())
    return main


def info(asset: str) -> dict:
    p = os.path.join(DL, asset, "info.json")
    if os.path.exists(p):
        return json.load(open(p))
    d = json.load(_open(f"https://api.polyhaven.com/info/{asset}"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(d, open(p, "w"))
    return d


def ao_bake(js: dict, base: str) -> dict:
    """Point base-colour images at copies multiplied by the asset's own AO (red channel of the ARM map):
    cavity darkening, no directional light."""
    os.makedirs(os.path.join(base, "ao"), exist_ok=True)
    tex_src = {i: t.get("source") for i, t in enumerate(js.get("textures", []))}
    for m in js.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        bt = pbr.get("baseColorTexture")
        occ = m.get("occlusionTexture") or pbr.get("metallicRoughnessTexture")
        if not bt or not occ:
            continue
        ci, ai = tex_src.get(bt["index"]), tex_src.get(occ["index"])
        if ci is None or ai is None or "uri" not in js["images"][ci] or "uri" not in js["images"][ai]:
            continue
        cu = urllib.parse.unquote(js["images"][ci]["uri"])
        au = urllib.parse.unquote(js["images"][ai]["uri"])
        cp, ap = os.path.join(base, cu), os.path.join(base, au)
        if not (os.path.exists(cp) and os.path.exists(ap)) or "_arm_" not in au:
            continue
        newname = "ao/" + os.path.basename(cu).rsplit(".", 1)[0] + "_ao.png"
        np_ = os.path.join(base, newname)
        if not os.path.exists(np_):
            col = Image.open(cp).convert("RGB")
            if max(col.size) > 2048:
                col.thumbnail((2048, 2048), Image.LANCZOS)
            ao = Image.open(ap).convert("RGB").resize(col.size, Image.BILINEAR)
            c = np.asarray(col, np.float32) / 255
            a = np.asarray(ao, np.float32)[..., 0] / 255
            c *= (0.3 + 0.7 * a)[..., None]   # crevices darken, broad shapes keep their albedo
            tmp = f"{np_}.{os.getpid()}.png"   # atomic: parallel jobs may share an asset (splits)
            Image.fromarray((np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)).save(tmp)
            os.replace(tmp, np_)
        js["images"][ci] = {"uri": newname, "name": js["images"][ci].get("name", "")}
    return js


# ------------------------------------------------------------------ chroma boost around lowpix's palette stage
# lowpix's pixel styles cluster the source colours into material groups and merge groups closer than 14 units in
# (0.35 L, a, b). Low-chroma materials (olive drab, grey-green paint, weathered wood next to rust) then collapse
# into one grey-brown ramp. We scale a/b up before the conversion and back down on the finished atlas: the groups
# stay apart, the palette stays a palette (each colour maps to one colour), and the hues stay true.
def scale_chroma(rgb: np.ndarray, k: float) -> np.ndarray:
    """rgb float 0..1 (..., 3) -> same with Lab chroma multiplied by k (gamut-clipped)"""
    from lowpix.convert import _lab_to_srgb, _srgb_to_lab
    lab = _srgb_to_lab(np.clip(rgb, 0, 1))
    lab[..., 1:] *= k
    return _lab_to_srgb(lab)


def chroma_factor(image_paths: list[str], flat_colours: list = ()) -> float:
    """boost for an asset: low-chroma assets get up to 2.2x, saturated ones none"""
    from lowpix.convert import _srgb_to_lab
    C = []
    for p in image_paths:
        a = np.asarray(Image.open(p).convert("RGB").resize((96, 96), Image.BILINEAR), np.float64) / 255
        lab = _srgb_to_lab(a.reshape(-1, 3))
        C.append(np.hypot(lab[:, 1], lab[:, 2]))
    for c in flat_colours:
        lab = _srgb_to_lab(np.asarray(c, np.float64).reshape(1, 3))
        C.append(np.hypot(lab[:, 1], lab[:, 2]))
    if not C:
        return 1.0
    med = float(np.median(np.concatenate(C)))
    return float(np.clip(30.0 / max(med, 1e-3), 1.0, 2.2))


def boost_colours(js: dict, base: str, tag: str = "") -> tuple[dict, float]:
    """Replace base-colour images (and flat base-colour factors) with chroma-boosted copies. Returns (js, k)."""
    tex_src = {i: t.get("source") for i, t in enumerate(js.get("textures", []))}
    imgs, flats = {}, []
    for m in js.get("materials", []):
        if m.get("alphaMode") == "BLEND":
            continue
        pbr = m.setdefault("pbrMetallicRoughness", {})
        bt = pbr.get("baseColorTexture")
        if bt:
            ci = tex_src.get(bt["index"])
            if ci is not None and "uri" in js["images"][ci]:
                imgs[ci] = os.path.join(base, urllib.parse.unquote(js["images"][ci]["uri"]))
        else:
            flats.append(pbr.get("baseColorFactor", [1, 1, 1, 1])[:3])
    k = chroma_factor(list(imgs.values()), flats)
    if k <= 1.001:
        return js, 1.0
    os.makedirs(os.path.join(base, "ao"), exist_ok=True)
    for ci, p in imgs.items():
        name = "ao/" + os.path.basename(p).rsplit(".", 1)[0] + f"_c{k:.2f}.png"
        dst = os.path.join(base, name)
        if not os.path.exists(dst):
            im = Image.open(p).convert("RGB")
            if max(im.size) > 2048:
                im.thumbnail((2048, 2048), Image.LANCZOS)
            a = scale_chroma(np.asarray(im, np.float64) / 255, k)
            tmp = f"{dst}.{os.getpid()}.png"
            Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(tmp)
            os.replace(tmp, dst)
        js["images"][ci] = {"uri": os.path.relpath(dst, base), "name": js["images"][ci].get("name", "")}
    for m in js.get("materials", []):
        if m.get("alphaMode") == "BLEND":
            continue
        pbr = m["pbrMetallicRoughness"]
        if not pbr.get("baseColorTexture"):
            f = pbr.get("baseColorFactor", [1, 1, 1, 1])
            pbr["baseColorFactor"] = [*scale_chroma(np.array(f[:3], np.float64), k).tolist(), *f[3:4]] or f
    return js, k


def unboost_atlas(atlas: np.ndarray, k: float) -> np.ndarray:
    if k <= 1.001:
        return atlas
    out = atlas.copy()
    rgb = out[..., :3].reshape(-1, 3)
    cols, inv = np.unique(rgb, axis=0, return_inverse=True)       # per palette colour: exact, fast
    new = np.clip(scale_chroma(cols / 255.0, 1.0 / k) * 255 + 0.5, 0, 255).astype(np.uint8)
    out[..., :3] = new[inv.reshape(-1)].reshape(out.shape[:2] + (3,))
    return out


def material_kind(m: dict, opaque_blend: bool) -> str:
    if m.get("alphaMode") == "BLEND" and not opaque_blend:
        return "flame" if "flame" in m.get("name", "").lower() else "glass"
    return "body"


def part_gltf(js: dict, base: str, tag: str, node_rx: str | None, kind: str, opaque_blend: bool) -> str | None:
    """A copy of the glTF holding only root nodes whose name matches node_rx and only primitives whose material
    is of `kind`. Glass gets a flat tint (its texture is mostly opacity). Returns the path or None if empty."""
    j = copy.deepcopy(js)
    sc = j["scenes"][j.get("scene", 0)]
    roots = [r for r in sc["nodes"] if node_rx is None or re.search(node_rx, j["nodes"][r].get("name", ""))]
    if not roots:
        raise ValueError(f"no nodes match {node_rx!r}")
    j["scenes"] = [{"nodes": roots}]
    j["scene"] = 0
    kinds = [material_kind(m, opaque_blend) for m in j.get("materials", [])]
    n = 0
    for mesh in j.get("meshes", []):
        mesh["primitives"] = [p for p in mesh["primitives"] if (kinds[p["material"]] if "material" in p else "body") == kind]
        n += len(mesh["primitives"])
    if kind != "body":
        for mi, m in enumerate(j.get("materials", [])):
            if kinds[mi] == "glass":
                pbr = m.setdefault("pbrMetallicRoughness", {})
                pbr.pop("baseColorTexture", None)
                pbr["baseColorFactor"] = [*GLASS_TINT, 1.0]
    # count the triangles that will be loaded
    used = set()

    def walk(i):
        nd = j["nodes"][i]
        if "mesh" in nd and j["meshes"][nd["mesh"]]["primitives"]:
            used.add(nd["mesh"])
        for c in nd.get("children", []):
            walk(c)
    for r in roots:
        walk(r)
    if not used:
        return None
    p = os.path.join(base, f"_part_{tag}_{kind}.gltf")
    json.dump(j, open(p, "w"))
    return p


def _yaw(V, yaw):
    if not yaw:
        return V
    a = np.radians(yaw)
    R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    return V @ R.T


def dilate(atlas: np.ndarray) -> np.ndarray:
    """Push-pull fill of the empty atlas texels from the charts around them, so mipmaps never pull black into
    chart edges. Charts keep their exact texels; alpha becomes opaque everywhere."""
    rgb = atlas[..., :3].astype(np.float64)
    w = (atlas[..., 3] > 0).astype(np.float64)
    levels = [(rgb * w[..., None], w)]
    while max(levels[-1][1].shape) > 1:
        c, ww = levels[-1]
        H, W = ww.shape
        H2, W2 = (H + 1) // 2, (W + 1) // 2
        c = np.pad(c, ((0, H2 * 2 - H), (0, W2 * 2 - W), (0, 0)))
        ww = np.pad(ww, ((0, H2 * 2 - H), (0, W2 * 2 - W)))
        levels.append((c.reshape(H2, 2, W2, 2, 3).sum((1, 3)), ww.reshape(H2, 2, W2, 2).sum((1, 3))))
    c, ww = levels[-1]
    col = c / np.maximum(ww, 1e-9)[..., None]
    for c, ww in reversed(levels[:-1]):
        H, W = ww.shape
        up = np.repeat(np.repeat(col, 2, 0), 2, 1)[:H, :W]
        col = np.where(ww[..., None] > 0, c / np.maximum(ww, 1e-9)[..., None], up)
    out = atlas.copy()
    empty = atlas[..., 3] == 0
    out[..., :3][empty] = np.clip(col[empty] + 0.5, 0, 255).astype(np.uint8)
    out[..., 3] = 255
    return out


def arm_stats(js: dict, base: str, node_rx) -> tuple[float, float]:
    """Mean roughness and metal fraction of the asset's body materials (from the ARM maps)."""
    r, mfrac, n = 0.0, 0.0, 0
    tex_src = {i: t.get("source") for i, t in enumerate(js.get("textures", []))}
    for m in js.get("materials", []):
        if m.get("alphaMode") == "BLEND":
            continue
        pbr = m.get("pbrMetallicRoughness", {})
        t = pbr.get("metallicRoughnessTexture")
        if not t:
            continue
        si = tex_src.get(t["index"])
        uri = js["images"][si].get("uri") if si is not None else None
        p = os.path.join(base, urllib.parse.unquote(uri)) if uri else None
        if not p or not os.path.exists(p):
            continue
        a = np.asarray(Image.open(p).convert("RGB").resize((128, 128)), np.float32) / 255
        r += float(a[..., 1].mean()) * pbr.get("roughnessFactor", 1.0)
        mfrac += float((a[..., 2] * pbr.get("metallicFactor", 1.0) > 0.5).mean())
        n += 1
    return (r / n, mfrac / n) if n else (0.8, 0.0)


# ------------------------------------------------------------------ glb merge
def _parse_glb(b: bytes):
    jl = struct.unpack_from("<I", b, 12)[0]
    js = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack_from("<I", b, off)[0]
    return js, b[off + 8: off + 8 + bl]


def merge_glbs(name: str, parts: list[tuple[str, bytes, list[float], str]], extras: dict, rough: float = 0.85,
               metal: float = 0.0) -> bytes:
    """[(node name, lowpix glb, translation, kind)] -> one glb: root node `name` with one child per part."""
    out = {"asset": {"version": "2.0", "generator": "lowpix + bushed/tools/convert_props.py"}, "scene": 0,
           "scenes": [{"name": name, "nodes": [0]}], "nodes": [{"name": name, "children": [], "extras": extras}],
           "meshes": [], "materials": [], "textures": [], "samplers": [], "images": [], "accessors": [],
           "bufferViews": [], "buffers": [{"byteLength": 0}]}
    blob = bytearray()
    for pname, glb, tr, kind in parts:
        js, bin_ = _parse_glb(glb)
        pad = (-len(blob)) % 4
        blob += b"\0" * pad
        boff = len(blob)
        blob += bin_
        bv0, ac0, im0, tx0, sm0, mt0, me0 = (len(out[k]) for k in
                                              ("bufferViews", "accessors", "images", "textures", "samplers", "materials", "meshes"))
        for bv in js["bufferViews"]:
            out["bufferViews"].append({**bv, "byteOffset": bv.get("byteOffset", 0) + boff})
        for a in js["accessors"]:
            out["accessors"].append({**a, "bufferView": a["bufferView"] + bv0})
        for im in js["images"]:
            out["images"].append({**im, "bufferView": im["bufferView"] + bv0, "name": f"{name}_{pname}"})
        for s in js["samplers"]:
            out["samplers"].append(dict(s))
        for t in js["textures"]:
            out["textures"].append({"sampler": t["sampler"] + sm0, "source": t["source"] + im0})
        for m in js["materials"]:
            m = copy.deepcopy(m)
            m.pop("extensions", None)
            m["pbrMetallicRoughness"]["baseColorTexture"]["index"] += tx0
            m["name"] = f"{name}_{pname}"
            m["extras"] = {"kind": kind, "metalFraction": round(metal, 3)}
            if kind == "body":
                m["alphaMode"] = "OPAQUE"
                m.pop("alphaCutoff", None)
                m["pbrMetallicRoughness"]["roughnessFactor"] = round(rough, 3)
            elif kind == "glass":
                m["alphaMode"] = "BLEND"
                m.pop("alphaCutoff", None)
                m["pbrMetallicRoughness"].update({"baseColorFactor": [1, 1, 1, 0.3], "roughnessFactor": 0.12})
                m["doubleSided"] = True
            elif kind == "flame":
                m["alphaMode"] = "BLEND"
                m.pop("alphaCutoff", None)
                m["emissiveTexture"] = dict(m["pbrMetallicRoughness"]["baseColorTexture"])
                m["emissiveFactor"] = [1.0, 0.8, 0.5]
                m["pbrMetallicRoughness"]["baseColorFactor"] = [1, 1, 1, 0.85]
            out["materials"].append(m)
        for me in js["meshes"]:
            me = copy.deepcopy(me)
            me["name"] = pname
            for p in me["primitives"]:
                p["attributes"] = {k: v + ac0 for k, v in p["attributes"].items()}
                p["indices"] += ac0
                p["material"] += mt0
            out["meshes"].append(me)
        # lowpix converted meshes have a single node with the mesh at identity
        node = {"name": pname, "mesh": me0}
        if any(abs(v) > 1e-9 for v in tr):
            node["translation"] = [float(v) for v in tr]
        out["nodes"].append(node)
        out["nodes"][0]["children"].append(len(out["nodes"]) - 1)
    blob += b"\0" * ((-len(blob)) % 4)
    out["buffers"][0]["byteLength"] = len(blob)
    js = json.dumps(out, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))


# ------------------------------------------------------------------ lowpix patches
_TEXEL_NORMALS: list = []


def _split_long_triangles(mesh, max_edge: float, rounds: int = 16) -> None:
    """Split source triangles along their longest edge until no edge is longer than max_edge (in place).
    lowpix's surface sampler registers a large triangle in every grid cell of its bounding box, which runs
    out of memory on long thin faces (a 6 m power pole)."""
    V, UV, F, M = mesh.V, mesh.UV, mesh.F, mesh.M
    for _ in range(rounds):
        e = np.stack([np.linalg.norm(V[F[:, (k + 1) % 3]] - V[F[:, k]], axis=1) for k in range(3)], 1)
        k = e.argmax(1)
        big = e[np.arange(len(F)), k] > max_edge
        if not big.any():
            break
        bi = np.nonzero(big)[0]
        kk = k[bi]
        a = F[bi, kk]
        b = F[bi, (kk + 1) % 3]
        c = F[bi, (kk + 2) % 3]
        mid = len(V) + np.arange(len(bi))
        V = np.concatenate([V, (V[a] + V[b]) / 2])
        UV = np.concatenate([UV, (UV[a] + UV[b]) / 2])
        keep = F[~big]
        F = np.concatenate([keep, np.stack([a, mid, c], 1), np.stack([mid, b, c], 1)])
        M = np.concatenate([M[~big], M[bi], M[bi]])
    mesh.V, mesh.UV, mesh.F, mesh.M = V, UV, F, M


def install_normal_aware_sampling(LC) -> None:
    """lowpix transfers colour from the closest point of the detailed surface. On thin shells (pots, buckets,
    suitcases, boots) the inside wall is often as close to a decimated texel as the outside, which paints
    blotches of the inside colour. Patch: remember each texel's normal (from _chart_texels) and, in the surface
    sampler, push back candidate triangles that face away from it, so a same-facing surface within reach wins."""
    if getattr(LC, "_bushed_patched", False):
        return
    orig_texels = LC._chart_texels

    def chart_texels(face, density):
        r = orig_texels(face, density)
        _TEXEL_NORMALS.append(r[1].reshape(-1, 3))
        return r
    LC._chart_texels = chart_texels
    orig_init = LC.SurfaceSampler.__init__

    def init(self, mesh, cell, reach=None):
        _split_long_triangles(mesh, max(cell * 6.0, 1e-4))   # the grid broad phase explodes on long slivers
        orig_init(self, mesh, cell, reach)
        n = self.td["n"]
        self.tn = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-20)

    def call(self, Q, chunk=20000):
        N = np.concatenate(_TEXEL_NORMALS) if _TEXEL_NORMALS else None
        if N is None or len(N) != len(Q):
            N = None
        mesh = self.mesh
        out = np.zeros((len(Q), 3))
        found = np.zeros(len(Q), bool)
        # chunks sized by candidate pairs, not by queries: dense ornaments put thousands of triangles in a cell
        key_all = self._key(np.floor((Q - self.lo) / self.h).astype(np.int64))
        pos_all = np.clip(np.searchsorted(self.ukeys, key_all), 0, len(self.ukeys) - 1)
        hit_all = self.ukeys[pos_all] == key_all
        pairs = np.where(hit_all, self.count[pos_all], 0)
        cum = np.cumsum(pairs)
        bounds, s0 = [], 0
        budget = 800_000
        while s0 < len(Q):
            base = cum[s0 - 1] if s0 else 0
            e = int(np.searchsorted(cum, base + budget, side="right"))
            e = min(max(e, s0 + 1), s0 + chunk, len(Q))
            bounds.append((s0, e))
            s0 = e
        for s0, s1 in bounds:
            q = Q[s0:s1]
            pos = pos_all[s0:s1]
            hit = hit_all[s0:s1]
            qi = np.nonzero(hit)[0]
            if not len(qi):
                continue
            st, ct = self.start[pos[qi]], self.count[pos[qi]]
            qid = np.repeat(qi, ct)
            idx = np.repeat(st - np.cumsum(np.r_[0, ct[:-1]]), ct) + np.arange(ct.sum())
            tri = self.tris[idx]
            d2, bary = LC._closest_on_tris(q[qid], self.td, tri)
            score = d2
            if N is not None:
                dot = np.einsum("ij,ij->i", self.tn[tri], N[s0 + qid])
                score = d2 + np.clip(-dot, 0, 1) * 3.0 * self.reach ** 2
            order = np.lexsort((score, qid))
            qid_s = qid[order]
            first = np.r_[True, qid_s[1:] != qid_s[:-1]]
            pick = order[first]
            ok = d2[pick] <= self.reach ** 2
            pick, qsel = pick[ok], qid[pick][ok]
            out[s0 + qsel] = LC._shade_source(mesh, tri[pick], bary[pick])
            found[s0 + qsel] = True
        return out, found
    LC.SurfaceSampler.__init__ = init
    LC.SurfaceSampler.__call__ = call
    LC._bushed_patched = True


# ------------------------------------------------------------------ convert
def convert_one(pid: str, force: bool = False) -> dict:
    import lowpix.convert as LC
    from lowpix.export import glb_bytes
    from lowpix.render import render

    job = jobs()[pid]
    asset = job["asset"]
    out_glb = os.path.join(MODELS, f"{pid}.glb")
    pdir = os.path.join(PREVIEW, pid)
    if os.path.exists(out_glb) and not force:
        return {"id": pid, "skipped": True}
    t0 = time.time()
    meta = info(asset)
    src = fetch(asset, job.get("res", "2k"))
    base = os.path.dirname(src)
    js = ao_bake(json.load(open(src)), base)
    js, chroma_k = boost_colours(js, base)

    def _load_image(data: bytes, _cap=2048):   # lowpix caps palette styles at 1k; keep 2k sources
        im = Image.open(io.BytesIO(data)).convert("RGB")
        if max(im.size) > _cap:
            im.thumbnail((_cap, _cap), Image.LANCZOS)
        return np.asarray(im, np.float32) / 255.0
    LC._load_image = _load_image
    install_normal_aware_sampling(LC)

    yaw = float(job.get("yaw", 0.0))
    ob = bool(job.get("opaque_blend"))
    paths = {k: part_gltf(js, base, pid, job["nodes"], k, ob) for k in ("body", "glass", "flame")}
    paths = {k: v for k, v in paths.items() if v}
    meshes = {k: LC.load_gltf(p) for k, p in paths.items()}
    allV = np.concatenate([_yaw(m.V, yaw) for m in meshes.values()])
    flo, fhi = allV.min(0), allV.max(0)
    fc = np.array([(flo[0] + fhi[0]) / 2, flo[1], (flo[2] + fhi[2]) / 2])
    parts, total_tris, atlases, names = [], 0, [], []
    for kind, p in paths.items():
        V = _yaw(meshes[kind].V, yaw)
        lo, hi = V.min(0), V.max(0)
        h = float(hi[1] - lo[1])
        nsrc = len(meshes[kind].F)
        if kind == "body":
            tris = job["tris"]
            # small hand-held things get more texels (>= 96 across their longest side, up to 1024 px/m)
            dens = job.get("density") or float(np.clip(96.0 / max(float((hi - lo).max()), 1e-3), DENSITY, 1024.0))
            kw = dict(density=dens, atlas=MAX_ATLAS, grain=job.get("grain", 0.18),
                      detail=job.get("detail", 1.0), ramps=job.get("ramps", 10), steps=job.get("steps", 12),
                      spread=job.get("spread", 0.62))
        else:
            tris = 600 if kind == "glass" else 200
            kw = dict(density=48.0 if kind == "glass" else 128.0, atlas=256, grain=0.0, detail=1.0, ramps=3, steps=6,
                      spread=0.3)
        if h < 1e-4:   # a flat part: lowpix scales by height, so nudge
            h = 1e-4
        _TEXEL_NORMALS.clear()
        m = LC.convert(p, style="pixel-hd", height=h, yaw=yaw, name=meta.get("name", pid),
                       tris=0 if nsrc <= tris * 1.15 else tris, light=0.0, crease=0.0, outline=False, smooth=0.0,
                       chart_angle=40.0, **kw)
        m.spec["material"] = {"unlit": False, "filter": "nearest", "roughness": 0.85}
        if kind == "body":
            m.atlas = unboost_atlas(m.atlas, chroma_k)
        m.atlas = dilate(m.atlas)
        tr = [float((lo[0] + hi[0]) / 2 - fc[0]), float(lo[1] - fc[1]), float((lo[2] + hi[2]) / 2 - fc[2])]
        parts.append((kind, glb_bytes(m), tr, kind))
        total_tris += sum(len(f.tris) for i in m.instances for f in i.faces)
        atlases.append(list(m.atlas.shape[:2][::-1]))
        os.makedirs(pdir, exist_ok=True)
        Image.fromarray(m.atlas, "RGBA").save(os.path.join(pdir, f"atlas_{kind}.png"))
        if kind == "body":
            try:
                render(m, 480, 480, 35, 22).save(os.path.join(pdir, "hero.png"))
            except Exception as e:  # preview only
                print(pid, "render failed", e)
            body_density = m.density
    size = [float(v) for v in (fhi - flo)]
    rough, metal = arm_stats(js, base, job["nodes"])
    rough = float(np.clip(rough, 0.45, 0.95))
    data = merge_glbs(pid, parts, {"source": f"https://polyhaven.com/a/{asset}", "licence": "CC0",
                                   "authors": list((meta.get("authors") or {}).keys()), "size": size},
                      rough=rough, metal=metal)
    os.makedirs(MODELS, exist_ok=True)
    open(out_glb, "wb").write(data)
    rep = {"id": pid, "asset": asset, "name": meta.get("name", pid), "category": job["category"],
           "parts": [p[0] for p in parts], "tris": int(total_tris), "size": size, "atlas": atlases,
           "density": round(body_density, 1), "chroma_k": round(chroma_k, 2), "rough": round(rough, 2), "metal": round(metal, 2), "bytes": len(data), "seconds": round(time.time() - t0, 1)}
    json.dump(rep, open(os.path.join(pdir, "report.json"), "w"), indent=1)
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="prop ids (or Poly Haven asset ids, which expand to their splits)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--jobs", type=int, default=3)
    a = ap.parse_args()
    J = jobs()
    ids = []
    for i in a.ids or list(J):
        ids += [i] if i in J else [k for k, j in J.items() if j["asset"] == i]
    results = []
    if a.jobs <= 1 or len(ids) == 1:
        for i in ids:
            try:
                r = convert_one(i, a.force)
            except Exception as e:
                import traceback
                traceback.print_exc()
                r = {"id": i, "error": repr(e)}
            print(json.dumps(r), flush=True)
            results.append(r)
    else:
        # one subprocess per prop: an out-of-memory kill takes down one prop, not the whole pool
        import subprocess
        from concurrent.futures import ThreadPoolExecutor

        def run(i):
            cmd = [sys.executable, os.path.abspath(__file__), i, "--jobs", "1"] + (["--force"] if a.force else [])
            p = subprocess.run(cmd, capture_output=True, text=True)
            lines = [ln for ln in p.stdout.splitlines() if ln.startswith('{"id"')]
            if p.returncode == 0 and lines:
                return json.loads(lines[-1])
            return {"id": i, "error": f"exit {p.returncode}: {p.stderr.strip().splitlines()[-1:] if p.stderr else ''}"}
        with ThreadPoolExecutor(a.jobs) as ex:
            for r in ex.map(run, ids):
                print(json.dumps(r), flush=True)
                results.append(r)
    bad = [r for r in results if "error" in r]
    print(f"done {len(results) - len(bad)}/{len(results)}; errors: {[r['id'] for r in bad]}")


if __name__ == "__main__":
    main()
