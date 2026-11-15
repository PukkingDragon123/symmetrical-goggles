"""Command line interface. Run `python -m lowpix --help`."""
from __future__ import annotations

import argparse
import json
import os
import sys

from .palette import make_ramp


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
    r.add_argument("--size", default="960x720")
    r.add_argument("--zoom", type=float, default=1.0)
    r.add_argument("--target", default=None, help="x,y,z point to centre on (close-ups)")
    r.add_argument("--radius", type=float, default=None, help="with --target: frame a sphere of this radius")
    r.add_argument("--part", default=None, help="centre on a part instance id (e.g. head); implies a close-up")
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

    sub.add_parser("schema", help="print the JSON schema for specs")

    a = ap.parse_args(argv)
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
        w, h = (int(v) for v in a.size.lower().split("x"))
        m = build_model(a.spec)
        tgt = [float(v) for v in a.target.split(",")] if a.target else None
        rad = a.radius
        if a.part:
            tgt, r0 = part_sphere(m, a.part)
            rad = rad or r0
        render(m, w, h, a.yaw, a.pitch, zoom=a.zoom, target=tgt, radius=rad, shadow=not a.no_shadow).save(a.out)
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
        from .render import animation_gif, filmstrip
        m = build_model(a.spec)
        if a.out.lower().endswith(".gif"):
            animation_gif(m, a.anim, a.out, yaw=a.yaw, pitch=a.pitch)
        else:
            filmstrip(m, a.anim, frames=a.frames, yaw=a.yaw, pitch=a.pitch).save(a.out)
        print(a.out)
    elif a.cmd == "schema":
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "schema.json")) as fh:
            print(fh.read())
    return 0


if __name__ == "__main__":
    sys.exit(main())
