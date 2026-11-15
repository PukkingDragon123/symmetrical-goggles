"""Command line interface. Run `python -m lowpix --help`."""
from __future__ import annotations

import argparse
import json
import os
import sys

from .palette import make_ramp


def _size(v: str):
    """'960x720' or a single number for a square."""
    v = v.lower().replace(" ", "")
    try:
        if "x" in v:
            w, h = v.split("x")
            return int(w), int(h)
        return int(v), int(v)
    except ValueError:
        raise argparse.ArgumentTypeError(f"size must look like 960x720 or 640, got {v!r}")


def _vec3(v: str):
    """'x,y,z' (negative numbers welcome)."""
    try:
        x, y, z = (float(c) for c in v.replace(" ", "").split(","))
        return [x, y, z]
    except ValueError:
        raise argparse.ArgumentTypeError(f"expected x,y,z, got {v!r}")


def _fix_negative_args(argv):
    """Let '--target -3,7,8' through argparse (it would read '-3,7,8' as an option)."""
    out, i = [], 0
    while i < len(argv):
        a = argv[i]
        if a == "--target" and i + 1 < len(argv) and argv[i + 1].startswith("-"):
            out.append(f"--target={argv[i + 1]}")
            i += 2
            continue
        out.append(a)
        i += 1
    return out


def _summary(rep: dict) -> str:
    lines = [f"built {rep['name']}: {rep['triangles']} tris, {rep['vertices_unique']} verts, "
             f"{rep['instances']} parts, atlas {rep['atlas'][0]}x{rep['atlas'][1]} "
             f"({int(rep['atlas_fill'] * 100)}% used), {rep['colors_used']} colours"]
    for w in rep.get("warnings", []):
        lines.append(f"  warning: {w}")
    for name, path in rep.get("files", {}).items():
        lines.append(f"  -> {path}")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="lowpix", description="Low-poly, pixel-art-textured model builder for AI agents.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="build a spec into glb/obj/bbmodel/png + previews + report")
    b.add_argument("spec")
    b.add_argument("-o", "--out", default=None, help="output dir (default: out/<spec name>)")
    b.add_argument("--gif", action="store_true", help="also render a turntable GIF")
    b.add_argument("--json", action="store_true", help="print the full JSON report")

    r = sub.add_parser("render", help="render one view to PNG")
    r.add_argument("spec")
    r.add_argument("-o", "--out", required=True)
    r.add_argument("--yaw", type=float, default=35)
    r.add_argument("--pitch", type=float, default=22)
    r.add_argument("--size", type=_size, default=(960, 720), help="WxH or a single number for a square")
    r.add_argument("--zoom", type=float, default=1.0)
    r.add_argument("--target", type=_vec3, default=None, help="x,y,z point to centre on (close-ups)")
    r.add_argument("--radius", type=float, default=None, help="with --target/--part: frame a sphere of this radius")
    r.add_argument("--part", default=None, help="centre on a part instance id (e.g. head); implies a close-up")
    r.add_argument("--only", action="store_true", help="with --part: frame just that part, not its children")
    r.add_argument("--anim", default=None, help="pose the model from this clip (with --time)")
    r.add_argument("--time", type=float, default=0.0)
    r.add_argument("--no-shadow", action="store_true")

    li = sub.add_parser("lint", help="validate a spec and print the report without writing files")
    li.add_argument("spec")

    pa = sub.add_parser("ramp", help="generate a hue-shifted colour ramp from a base colour")
    pa.add_argument("base")
    pa.add_argument("--steps", type=int, default=5)
    pa.add_argument("--hue-shift", type=float, default=18)
    pa.add_argument("--sat-shift", type=float, default=0.12)
    pa.add_argument("--spread", type=float, default=0.75)

    an = sub.add_parser("animate", help="render an animation clip as a filmstrip PNG and/or GIF")
    an.add_argument("spec")
    an.add_argument("--anim", required=True, help="clip name")
    an.add_argument("-o", "--out", required=True, help="output .png (filmstrip) or .gif")
    an.add_argument("--frames", type=int, default=8, help="filmstrip frames")
    an.add_argument("--yaw", type=float, default=None)
    an.add_argument("--pitch", type=float, default=None)
    an.add_argument("--size", type=_size, default=(320, 260), help="filmstrip cell size (WxH or N)")
    an.add_argument("--part", default=None, help="fixed close-up on a part instance")
    an.add_argument("--only", action="store_true", help="with --part: frame just that part")
    an.add_argument("--target", type=_vec3, default=None, help="fixed close-up centre x,y,z")
    an.add_argument("--radius", type=float, default=None)

    cv = sub.add_parser("convert", help="turn a detailed .glb/.gltf/.obj (or polyhaven:<id>) into a lowpix model")
    cv.add_argument("source", help="path to .glb/.gltf/.obj, or polyhaven:<asset_id>")
    cv.add_argument("-o", "--out", default=None)
    cv.add_argument("--style", default="pixel", choices=["pixel", "pixel-hd", "painted", "realistic"],
                    help="pixel (chunky), pixel-hd, painted (smooth hand-painted) or realistic (high-res, lit)")
    cv.add_argument("--height", type=float, default=24.0, help="model height in units")
    for flag, typ, hlp in (("--tris", int, "target triangles (0 = keep the source mesh)"),
                           ("--density", float, "texels per unit (pixel styles)"),
                           ("--atlas", int, "texture size budget for HD styles, e.g. 1024 or 2048"),
                           ("--ramps", int, "max colour groups (pixel styles)"),
                           ("--steps", int, "colours per ramp (pixel styles)"),
                           ("--light", float, "painted light strength"),
                           ("--detail", float, "how much of the source texture's light/dark to keep"),
                           ("--smooth", float, "colour low-pass in texels"),
                           ("--grain", float, "clustered painterly variation"),
                           ("--crease", float, "edge angle that gets rims"),
                           ("--dither", float, "ordered dithering 0..1"),
                           ("--posterize", int, "value bands (painted style)"),
                           ("--saturation", float, "chroma multiplier (painted style)"),
                           ("--chart-angle", float, "max normal spread inside one texture chart"),
                           ("--spread", float, "ramp value range 0..1 (pixel styles; lower = subtler steps)")):
        cv.add_argument(flag, type=typ, default=None, help=hlp)
    cv.add_argument("--outline", action="store_true", help="dark outlines on very sharp folds (pixel styles)")
    cv.add_argument("--no-outline", action="store_true")
    cv.add_argument("--yaw", type=float, default=0.0, help="rotate the source so it faces +Z")
    cv.add_argument("--name", default=None)
    cv.add_argument("--background", default="#1d2230")
    cv.add_argument("--gif", action="store_true")

    ph = sub.add_parser("polyhaven", help="search Poly Haven's CC0 models")
    ph.add_argument("query", nargs="*", default=[])
    ph.add_argument("--limit", type=int, default=30)

    bt = sub.add_parser("batch", help="build/convert many specs or models in parallel (mass production)")
    bt.add_argument("sources", nargs="+", help="specs, manifests, model files, folders, globs, polyhaven:<id>, polyhaven?<query>")
    bt.add_argument("-o", "--out", default="out/batch")
    bt.add_argument("-j", "--jobs", type=int, default=0, help="parallel workers (default: min(4, cpus))")
    bt.add_argument("--style", default=None, choices=["pixel", "pixel-hd", "painted", "realistic"])
    bt.add_argument("--height", type=float, default=None)
    bt.add_argument("--tris", type=int, default=None)
    bt.add_argument("--atlas", type=int, default=None)
    bt.add_argument("--limit", type=int, default=12, help="results per polyhaven?<query>")
    bt.add_argument("--gif", action="store_true")

    nw = sub.add_parser("new", help="start a new spec from a template")
    nw.add_argument("template", help="creature, quadruped, bird, robot, figure, critter or prop")
    nw.add_argument("name")
    nw.add_argument("-o", "--out", default=None)

    sp = sub.add_parser("sprite", help="2D sprites: a generator (sword, gem, ore, fish, potion) or a sprite spec .json")
    sp.add_argument("source", help="generator name or sprite spec .json")
    sp.add_argument("-o", "--out", default=None, help="output PNG (default out/sprites/<name>.png)")
    sp.add_argument("--seed", type=int, default=0)
    sp.add_argument("--count", type=int, default=1, help="more than 1: a sheet of seeded variations")
    sp.add_argument("--size", default=None, help="N or WxH pixels")
    sp.add_argument("--paint", default=None, choices=["strokes", "flat", "painted"])
    sp.add_argument("--scale", type=int, default=1, help="also write an upscaled preview (nearest)")
    sp.add_argument("--param", action="append", default=[], help="generator option key=value (species=koi, theme=frost)")
    sp.add_argument("--background", default=None, help="preview background colour")
    sp.add_argument("--style", default=None, help="a learned style: ref_gems, ref_swords, ref_icons, or your own")

    lr = sub.add_parser("learn", help="learn a pixel-art style from reference sheets and fit the generators to it")
    lr.add_argument("action", choices=["measure", "fit"])
    lr.add_argument("refs", nargs="+", help="reference images (sprite sheets)")
    lr.add_argument("--generator", default="gem")
    lr.add_argument("--name", default=None, help="style name to save (fit)")
    lr.add_argument("--scale", type=int, default=None, help="upscale factor of the references (default: detect)")
    lr.add_argument("--size", default=None, help="sprite size for the fit")

    pt = sub.add_parser("photo", help="photo-bash: stylise a photo texture (polyhaven:<id>, a folder or an image)")
    pt.add_argument("source", nargs="+", help="photo source, or: search <words> | vendor <polyhaven id>")
    pt.add_argument("--style", default="pixel-hd", choices=["realistic", "painted", "pixel-hd", "pixel"])
    pt.add_argument("--size", type=int, default=64)
    pt.add_argument("--colours", type=int, default=None)
    pt.add_argument("-o", "--out", default=None)
    pt.add_argument("--preview", type=int, default=3, help="also write an NxN tiled preview (0 = off)")
    pt.add_argument("--dest", default="assets/photos", help="vendor: folder to save the small offline copy in")

    mt = sub.add_parser("match", help="line a model up with a 2D reference (landmarks JSON) and report the error")
    mt.add_argument("spec")
    mt.add_argument("landmarks", help="landmarks .json (see lowpix/match.py)")
    mt.add_argument("--image", default=None, help="the reference image, blended into the overlay")
    mt.add_argument("-o", "--out", default=None)
    mt.add_argument("--scale", type=float, default=1.0)
    mt.add_argument("--project", choices=["palette", "photo"], default=None,
                    help="also paint the photo onto the model from the matched camera (needs --image)")
    mt.add_argument("--density", type=float, default=None, help="texel density for the projected model")
    mt.add_argument("--colours", type=int, default=18, help="palette size for --project palette")
    mt.add_argument("--gif", action="store_true", help="also render turntable + clip GIFs of the projected model")

    au = sub.add_parser("auth", help="API tokens for online services (stored outside the repo, never printed)")
    au.add_argument("action", choices=["set", "list", "remove"])
    au.add_argument("service", nargs="?", default="sketchfab")

    sf = sub.add_parser("sketchfab", help="search / fetch downloadable CC models on Sketchfab (noai-tagged are refused)")
    sf.add_argument("action", choices=["search", "fetch"])
    sf.add_argument("query", nargs="+", help="search words, or a model uid for fetch")
    sf.add_argument("-o", "--out", default="out/_downloads")
    sf.add_argument("--limit", type=int, default=24)

    mc = sub.add_parser("mc", help="Minecraft Java: export a box spec into a mod (entity model code, texture, clips)")
    mc.add_argument("action", choices=["export", "icon"])
    mc.add_argument("src", help="export: a box spec .json; icon: a .png item icon")
    mc.add_argument("--mod", required=True, help="the mod project's root (any Fabric/NeoForge/Forge repo)")
    mc.add_argument("--modid", required=True)
    mc.add_argument("--package", help="Java package for the generated model classes + runtime (export)")
    mc.add_argument("--name", help="override the model / icon name")
    mc.add_argument("--texture-dir", default="entity", help="textures/<dir>/ for the model texture (entity, block, item)")
    mc.add_argument("--fps", type=float, default=12.0, help="keyframes per second when baking clips")
    mc.add_argument("--handheld", action="store_true", help="icon: held like a tool")
    mc.add_argument("--texture-only", action="store_true",
                    help="export: only the textures (a coat/colour variant of a model exported with the same parts)")
    mc.add_argument("-o", "--out", default="out/mc", help="where the export preview sheet goes")
    sub.add_parser("schema", help="print the JSON schema for specs")

    a = ap.parse_args(_fix_negative_args(list(sys.argv[1:] if argv is None else argv)))
    if a.cmd == "build":
        from .build import export_all
        from .spec import SpecError
        out = a.out or os.path.join("out", os.path.splitext(os.path.basename(a.spec))[0])
        try:
            rep = export_all(a.spec, out, gif=a.gif)
        except SpecError as e:
            print(str(e), file=sys.stderr)
            return 2
        print(json.dumps(rep, indent=2) if a.json else _summary(rep))
    elif a.cmd == "render":
        from .model import build_model
        from .render import part_sphere, render
        w, h = a.size
        m = build_model(a.spec)
        tgt, rad = a.target, a.radius
        if a.part:
            tgt, r0 = part_sphere(m, a.part, only=a.only)
            rad = rad or r0
        worlds = m.animator().world_matrices(a.anim, a.time) if a.anim else None
        render(m, w, h, a.yaw, a.pitch, zoom=a.zoom, target=tgt, radius=rad, shadow=not a.no_shadow,
               worlds=worlds).save(a.out)
        print(a.out)
    elif a.cmd == "lint":
        from .model import build_model
        from .spec import SpecError, load_spec, validate
        spec = load_spec(a.spec)
        errors, warnings = validate(spec)
        for e in errors:
            print("error:", e)
        if errors:
            return 2
        rep = build_model(spec).report()
        rep.pop("palette", None)
        print(json.dumps(rep, indent=2))
    elif a.cmd == "ramp":
        print(json.dumps(make_ramp(a.base, a.steps, a.hue_shift, a.sat_shift, a.spread)))
    elif a.cmd == "animate":
        from .model import build_model
        from .render import animation_gif, filmstrip, part_sphere
        m = build_model(a.spec)
        tgt, rad = a.target, a.radius
        if a.part:
            tgt, r0 = part_sphere(m, a.part, only=a.only)
            rad = rad or r0
        if tgt is not None and rad is None:
            rad = 10.0
        if a.out.lower().endswith(".gif"):
            animation_gif(m, a.anim, a.out, yaw=a.yaw, pitch=a.pitch)
        else:
            filmstrip(m, a.anim, frames=a.frames, cell=a.size, yaw=a.yaw, pitch=a.pitch,
                      target=tgt, radius=rad).save(a.out)
        print(a.out)
    elif a.cmd == "convert":
        from .build import export_model
        from .convert import convert
        slug = os.path.splitext(os.path.basename(a.source.split(":", 1)[-1]))[0]
        out = a.out or os.path.join("out", slug)
        opts = {k: getattr(a, k) for k in ("tris", "density", "atlas", "ramps", "steps", "light", "detail", "smooth",
                                           "grain", "crease", "dither", "posterize", "saturation", "chart_angle", "spread")}
        if a.outline:
            opts["outline"] = True
        if a.no_outline:
            opts["outline"] = False
        m = convert(a.source, style=a.style, height=a.height, yaw=a.yaw, name=a.name, background=a.background,
                    work_dir=os.path.join(out, "_source"), **opts)
        print(_summary(export_model(m, out, gif=a.gif)))
    elif a.cmd == "batch":
        from .batch import batch
        defaults = {k: v for k, v in (("style", a.style), ("height", a.height), ("tris", a.tris), ("atlas", a.atlas))
                    if v is not None}
        s = batch(a.sources, a.out, jobs=a.jobs, gif=a.gif, limit=a.limit, defaults=defaults)
        print(f"done: {s['ok']}/{s['items']} ok in {s['seconds']}s -> {a.out}/summary.json, contact.png, index.html")
        return 0 if not s["failed"] else 1
    elif a.cmd == "new":
        from .batch import new_spec
        p = new_spec(a.template, a.name, a.out)
        print(f"created {p}\nnext: edit it, then python -m lowpix build {p} -o out/{os.path.splitext(os.path.basename(p))[0]}")
    elif a.cmd == "polyhaven":
        from .convert import polyhaven_search
        for aid, name, dl in polyhaven_search(" ".join(a.query), a.limit):
            print(f"{aid:40s} {name}  ({dl} downloads)")
    elif a.cmd == "sprite":
        from .sprite import upscale
        from .sprite_gen import make, make_sheet
        size = None
        if a.size:
            size = [int(v) for v in a.size.lower().split("x")] if "x" in a.size.lower() else int(a.size)
        params = {}
        for kv in a.param:
            k, v = kv.split("=", 1)
            params[k] = json.loads(v) if v[:1] in "[{0123456789-" or v in ("true", "false") else v
        name = os.path.splitext(os.path.basename(a.source))[0]
        out = a.out or os.path.join("out", "sprites", f"{name}{'_sheet' if a.count > 1 else ''}.png")
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        if a.count > 1:
            im, specs, rects = make_sheet(a.source, a.count, a.seed, size, a.paint, style=a.style, **params)
            meta = {"sprites": [{"rect": r, "spec": sp_} for r, sp_ in zip(rects, specs)]}
        else:
            spec_, im = make(a.source, a.seed, size, a.paint, style=a.style, **params)
            meta = spec_
        im.save(out)
        with open(os.path.splitext(out)[0] + ".json", "w") as fh:
            json.dump(meta, fh)
        print(f"-> {out} ({im.width}x{im.height}) + .json")
        if a.scale > 1:
            pv = os.path.splitext(out)[0] + f"_x{a.scale}.png"
            upscale(im, a.scale, a.background).save(pv)
            print(f"-> {pv}")
    elif a.cmd == "photo":
        from .photo import load_photo, photo_search, photo_vendor, stylise, tiled_preview
        if a.source[0] == "search":
            for aid, name, dl in photo_search(" ".join(a.source[1:]), 30):
                print(f"polyhaven:{aid:36s} {name}  ({dl} downloads)")
            return 0
        if a.source[0] == "vendor":
            for aid in a.source[1:]:
                print(f"-> {photo_vendor(aid, a.dest)}")
            return 0
        src = a.source[0]
        tex = stylise(load_photo(src), a.style, a.size, colours=a.colours)
        stem = src.split(":", 1)[-1].rstrip("/").split("/")[-1]
        out = a.out or os.path.join("out", "photos", f"{os.path.splitext(stem)[0]}_{a.style}_{a.size}.png")
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        tex.save(out)
        print(f"-> {out}")
        if a.preview:
            k = max(1, 512 // (a.size * a.preview))
            pv = os.path.splitext(out)[0] + "_tiled.png"
            tiled_preview(tex, a.preview, k).save(pv)
            print(f"-> {pv}")
    elif a.cmd == "match":
        from .match import match
        ref = a.landmarks
        if a.image:
            with open(a.landmarks) as fh:
                ref = json.load(fh)
            ref["image"] = a.image
        out = a.out or os.path.join("out", "match", os.path.splitext(os.path.basename(a.spec))[0] + "_match.png")
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        rep, _ = match(a.spec, ref, out=out, scale=a.scale)
        if a.project:
            if not a.image:
                print("--project needs --image", file=sys.stderr)
                return 2
            from .build import export_model
            from .match import project_photo
            m, prep = project_photo(a.spec, ref, a.image, mode=a.project, density=a.density, colours=a.colours)
            m.spec = dict(m.spec, name=f"{m.spec.get('name', 'model')} {a.project}")
            pout = os.path.join(os.path.dirname(out), os.path.splitext(os.path.basename(a.spec))[0] + "_" + a.project)
            export_model(m, pout, gif=a.gif)
            print(f"projected {prep['texels_from_photo']} texels from the photo -> {pout}/")
        for k, v in rep["points"].items():
            print(f"{k:14s} ref {v['ref']}  model {v['model']}  error {v['error_pct']}%")
        print(f"mean error {rep['mean_error_pct']}% of image height -> {out}")
    elif a.cmd == "learn":
        from .style_learn import fit, measure, save_style
        prof = measure(a.refs, k=a.scale)
        if a.action == "measure":
            print(json.dumps(prof, indent=1))
        else:
            size = None if not a.size else ([int(v) for v in a.size.split("x")] if "x" in a.size else int(a.size))
            style, d = fit(prof, a.generator, size=size)
            print(f"distance {d:.3f}: {json.dumps({k: round(v, 3) for k, v in style.items()})}")
            print(f"-> {save_style(a.name or a.generator + '_learned', style, prof, a.refs)}")
    elif a.cmd == "auth":
        from .tokens import remove_token, set_token, status
        if a.action == "list":
            for svc, where in status().items():
                print(f"{svc:12s} {where}")
        elif a.action == "remove":
            print("removed" if remove_token(a.service) else "no stored token")
        else:
            import getpass
            tok = sys.stdin.readline() if not sys.stdin.isatty() else getpass.getpass(f"{a.service} API token: ")
            print(f"saved to {set_token(a.service, tok)} (mode 600)")
    elif a.cmd == "sketchfab":
        from .sketchfab import fetch, search
        if a.action == "search":
            for m in search(" ".join(a.query), a.limit):
                print(f"sketchfab:{m['uid']}  {m['name'][:40]:40s} by {m['author']}  [{m['licence']}]  {m['faces']} faces")
        else:
            uid = a.query[0].split(":", 1)[-1]
            print(f"-> {fetch(uid, os.path.join(a.out, f'sketchfab_{uid}'))}")
    elif a.cmd == "mc":
        from . import mc as mcmod
        if a.action == "icon":
            mcmod.export_icon(a.src, a.mod, a.modid, a.name or os.path.splitext(os.path.basename(a.src))[0], a.handheld)
            print(f"installed item icon {a.name or a.src} into {a.mod}")
        else:
            if not a.package and not a.texture_only:
                ap.error("mc export needs --package (or --texture-only)")
            summary = mcmod.export(a.src, a.mod, a.modid, a.package, out_dir=a.out, fps=a.fps, name=a.name,
                                   texture_dir=a.texture_dir, texture_only=a.texture_only)
            print(json.dumps(summary, indent=1))
            for w in summary["warnings"]:
                print("  warning:", w)
    elif a.cmd == "schema":
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "schema.json")) as fh:
            print(fh.read())
    return 0


if __name__ == "__main__":
    sys.exit(main())
