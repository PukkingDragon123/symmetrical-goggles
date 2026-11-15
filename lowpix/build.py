"""One-call build: spec -> every output file + a JSON report."""
from __future__ import annotations

import json
import os

from PIL import Image

from .export import bbmodel_json, glb_bytes, obj_text
from .model import build_model
from .render import contact_sheet, render, turntable


def export_all(src, out_dir: str, gif: bool = False, sheet: bool = True, hero_size=(1200, 900)) -> dict:
    model = build_model(src)
    os.makedirs(out_dir, exist_ok=True)
    slug = "".join(c if c.isalnum() else "_" for c in model.name.lower()).strip("_") or "model"
    files = {}

    def p(name):
        path = os.path.join(out_dir, name)
        files[name] = path
        return path

    with open(p(f"{slug}.glb"), "wb") as fh:
        fh.write(glb_bytes(model))
    obj, mtl = obj_text(model, texture_name=f"{slug}_texture.png", mtl_name=f"{slug}.mtl")
    with open(p(f"{slug}.obj"), "w") as fh:
        fh.write(obj)
    with open(p(f"{slug}.mtl"), "w") as fh:
        fh.write(mtl)
    with open(p(f"{slug}.bbmodel"), "w") as fh:
        json.dump(bbmodel_json(model), fh)
    tex = Image.fromarray(model.atlas, "RGBA")
    tex.save(p(f"{slug}_texture.png"))
    AH, AW = model.atlas.shape[:2]
    k = max(1, 1024 // max(AW, AH))
    tex.resize((AW * k, AH * k), Image.NEAREST).save(p(f"{slug}_texture_x{k}.png"))
    report = model.report()
    rs = model.spec.get("render", {})
    hy, hp = rs.get("hero", (35, 22))
    render(model, hero_size[0], hero_size[1], hy, hp).save(p(f"{slug}_hero.png"))
    if sheet:
        contact_sheet(model, report).save(p(f"{slug}_sheet.png"))
    if gif:
        turntable(model, p(f"{slug}_turntable.gif"))
    report["files"] = {k2: os.path.relpath(v) for k2, v in files.items()}
    with open(p(f"{slug}_report.json"), "w") as fh:
        json.dump(report, fh, indent=2)
    report["files"][f"{slug}_report.json"] = os.path.relpath(files[f"{slug}_report.json"])
    return report
