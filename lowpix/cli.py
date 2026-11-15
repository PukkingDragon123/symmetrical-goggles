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

    cv = sub.add_parser("convert", help="turn a detailed .glb/.gltf/.obj (or polyhaven:<id>) into the lowpix pixel style")
    cv.add_argument("source", help="path to .glb/.gltf/.obj, or polyhaven:<asset_id>")
    cv.add_argument("-o", "--out", default=None)
    cv.add_argument("--tris", type=int, default=900, help="target triangle count")
    cv.add_argument("--height", type=float, default=24.0, help="model height in units (sets pixel scale)")
    cv.add_argument("--density", type=float, default=2.0, help="texels per unit")
    cv.add_argument("--ramps", type=int, default=6, help="colour groups (one hue-shifted ramp each)")
    cv.add_argument("--steps", type=int, default=6, help="colours per ramp")
    cv.add_argument("--light", type=float, default=1.0, help="painted light strength")
    cv.add_argument("--detail", type=float, default=0.7, help="how much of the source texture's light/dark to keep")
    cv.add_argument("--crease", type=float, default=60.0, help="dihedral angle (deg) that gets rims/outlines")
    cv.add_argument("--no-outline", action="store_true")
    cv.add_argument("--dither", type=float, default=0.0)
    cv.add_argument("--smooth", type=float, default=2.5, help="colour smoothing in texels (bigger = cleaner clusters)")
    cv.add_argument("--grain", type=float, default=0.45, help="clustered painterly variation (0 = flat bands)")
    cv.add_argument("--yaw", type=float, default=0.0, help="rotate the source so it faces +Z")
    cv.add_argument("--name", default=None)
    cv.add_argument("--background", default="#1d2230")
    cv.add_argument("--gif", action="store_true")

    ph = sub.add_parser("polyhaven", help="search Poly Haven's CC0 models")
    ph.add_argument("query", nargs="*", default=[])
    ph.add_argument("--limit", type=int, default=30)

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
        slug = a.source.split(":", 1)[-1]
        slug = os.path.splitext(os.path.basename(slug))[0]
        out = a.out or os.path.join("out", slug)
        m = convert(a.source, tris=a.tris, height=a.height, density=a.density, ramps=a.ramps, steps=a.steps,
                    light=a.light, detail=a.detail, crease=a.crease, outline=not a.no_outline, dither=a.dither,
                    yaw=a.yaw, name=a.name, background=a.background, work_dir=os.path.join(out, "_source"),
                    smooth=a.smooth, grain=a.grain)
        print(_summary(export_model(m, out, gif=a.gif)))
    elif a.cmd == "polyhaven":
        from .convert import polyhaven_search
        for aid, name, dl in polyhaven_search(" ".join(a.query), a.limit):
            print(f"{aid:40s} {name}  ({dl} downloads)")
    elif a.cmd == "schema":
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "schema.json")) as fh:
            print(fh.read())
    return 0


if __name__ == "__main__":
    sys.exit(main())
