"""Minimal MCP (Model Context Protocol) stdio server for lowpix.

Agents call tools and get *images* back, so they can see what they built and
iterate. No dependencies beyond lowpix itself.

    python -m lowpix.mcp_server            # speaks JSON-RPC 2.0 over stdin/stdout

Register with Claude Code via the repo's .mcp.json (already included).
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import traceback

from PIL import Image

from . import __version__
from .build import export_all
from .model import build_model
from .palette import make_ramp
from .render import contact_sheet, part_sphere, render
from .spec import SpecError, load_spec

PROTOCOL = "2025-06-18"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

_SPEC_ARGS = {
    "spec_path": {"type": "string", "description": "Path to a lowpix JSON spec (relative to the server's working directory)."},
    "spec": {"type": "object", "description": "Inline spec object (alternative to spec_path)."},
}

TOOLS = [
    {
        "name": "lowpix_build",
        "description": ("Build a lowpix model spec: writes .glb/.obj/.bbmodel/texture/previews/report to out_dir and "
                        "returns the report plus a contact-sheet image (hero view, front/side/top/back views, texture "
                        "atlas, palette, stats, warnings). Call this after every spec edit and LOOK at the image."),
        "inputSchema": {"type": "object", "properties": dict(_SPEC_ARGS, **{
            "out_dir": {"type": "string", "description": "Output directory (default out/<name>)."},
            "gif": {"type": "boolean", "description": "Also render a turntable GIF (slower)."},
        })},
    },
    {
        "name": "lowpix_render",
        "description": ("Render one view of a spec and return the PNG. Use part=<instance id> (e.g. 'head', "
                        "'eye_mirror') for a pixel-level close-up, or yaw/pitch for angles (yaw 0 = front, 90 = the "
                        "model's +X side, pitch 90 = top-down)."),
        "inputSchema": {"type": "object", "properties": dict(_SPEC_ARGS, **{
            "yaw": {"type": "number", "default": 35}, "pitch": {"type": "number", "default": 22},
            "width": {"type": "integer", "default": 900}, "height": {"type": "integer", "default": 650},
            "part": {"type": "string", "description": "Close-up on this part instance (and its children)."},
            "radius": {"type": "number", "description": "Close-up framing radius in model units."},
        })},
    },
    {
        "name": "lowpix_animate",
        "description": ("Render an animation clip as a filmstrip image (evenly spaced poses in a grid) so you can "
                        "judge timing, arcs, overlap and ground contact. Use after adding/editing 'animations'."),
        "inputSchema": {"type": "object", "required": ["anim"], "properties": dict(_SPEC_ARGS, **{
            "anim": {"type": "string", "description": "clip name"},
            "frames": {"type": "integer", "default": 8},
            "yaw": {"type": "number"}, "pitch": {"type": "number"}})},
    },
    {
        "name": "lowpix_convert",
        "description": ("Turn a detailed model into the lowpix pixel style in one call (the cheap way to get a "
                        "realistic shape): source is a .glb/.gltf/.obj path or 'polyhaven:<asset_id>' (CC0). "
                        "Decimates to `tris`, bakes the texture at a uniform pixel density, remaps colours to "
                        "hue-shifted ramps with painted light, rims and outlines. Returns the report and contact "
                        "sheet; writes .glb/.obj/.bbmodel/previews to out_dir."),
        "inputSchema": {"type": "object", "required": ["source"], "properties": {
            "source": {"type": "string"}, "out_dir": {"type": "string"},
            "tris": {"type": "integer", "default": 900}, "height": {"type": "number", "default": 24},
            "density": {"type": "number", "default": 2}, "ramps": {"type": "integer", "default": 6},
            "steps": {"type": "integer", "default": 6}, "light": {"type": "number", "default": 1.0},
            "detail": {"type": "number", "default": 1.0}, "crease": {"type": "number", "default": 38},
            "outline": {"type": "boolean", "default": True}, "yaw": {"type": "number", "default": 0},
            "name": {"type": "string"}}},
    },
    {
        "name": "lowpix_polyhaven_search",
        "description": "Search Poly Haven's free CC0 3D models (ids to pass to lowpix_convert as 'polyhaven:<id>').",
        "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer", "default": 30}}},
    },
    {
        "name": "lowpix_texture",
        "description": "Return the painted texture atlas, nearest-upscaled, to inspect pixel work directly.",
        "inputSchema": {"type": "object", "properties": dict(_SPEC_ARGS, **{
            "scale": {"type": "integer", "default": 4}})},
    },
    {
        "name": "lowpix_ramp",
        "description": ("Generate a hue-shifted pixel-art colour ramp (dark->light) from a base colour. Shadows drift "
                        "cool and saturated, highlights warm and desaturated. Returns hex list + swatch image."),
        "inputSchema": {"type": "object", "required": ["base"], "properties": {
            "base": {"type": "string", "description": "#rrggbb"},
            "steps": {"type": "integer", "default": 6},
            "hue_shift": {"type": "number", "default": 18},
            "sat_shift": {"type": "number", "default": 0.12},
            "spread": {"type": "number", "default": 0.75}}},
    },
    {
        "name": "lowpix_guide",
        "description": ("Return the spec reference and the style guide (read this first). topic: 'spec', 'style', "
                        "'workflow' or 'all'."),
        "inputSchema": {"type": "object", "properties": {"topic": {"type": "string", "default": "all"}}},
    },
]


def _png(img: Image.Image, max_w=1400) -> dict:
    if img.width > max_w:
        img = img.resize((max_w, int(img.height * max_w / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return {"type": "image", "data": base64.b64encode(buf.getvalue()).decode(), "mimeType": "image/png"}


def _text(s) -> dict:
    return {"type": "text", "text": s if isinstance(s, str) else json.dumps(s, indent=2)}


def _spec(args):
    if args.get("spec") is not None:
        return load_spec(args["spec"])
    if args.get("spec_path"):
        return load_spec(args["spec_path"])
    raise ValueError("pass spec_path or spec")


def _read_doc(name):
    try:
        with open(os.path.join(ROOT, "docs", name), encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return f"({name} not found next to the package; see docs/{name} in the lowpix repository)"


def call_tool(name: str, args: dict):
    if name == "lowpix_build":
        spec = _spec(args)
        slug = "".join(c if c.isalnum() else "_" for c in spec.get("name", "model").lower()).strip("_")
        out = args.get("out_dir") or os.path.join("out", slug or "model")
        rep = export_all(spec, out, gif=bool(args.get("gif")), sheet=True)
        rep.pop("palette", None)
        sheet = [p for k, p in rep["files"].items() if k.endswith("_sheet.png")][0]
        return [_text(rep), _png(Image.open(sheet))]
    if name == "lowpix_render":
        m = build_model(_spec(args))
        tgt, rad = None, args.get("radius")
        if args.get("part"):
            tgt, r0 = part_sphere(m, args["part"])
            rad = rad or r0
        img = render(m, int(args.get("width", 900)), int(args.get("height", 650)), float(args.get("yaw", 35)),
                     float(args.get("pitch", 22)), target=tgt, radius=rad)
        return [_png(img)]
    if name == "lowpix_animate":
        from .render import filmstrip
        m = build_model(_spec(args))
        img = filmstrip(m, args["anim"], frames=int(args.get("frames", 8)), yaw=args.get("yaw"), pitch=args.get("pitch"))
        return [_png(img, max_w=1600)]
    if name == "lowpix_convert":
        from .build import export_model
        from .convert import convert
        src = args["source"]
        slug = os.path.splitext(os.path.basename(src.split(":", 1)[-1]))[0]
        out = args.get("out_dir") or os.path.join("out", slug)
        m = convert(src, tris=int(args.get("tris", 900)), height=float(args.get("height", 24)),
                    density=float(args.get("density", 2)), ramps=int(args.get("ramps", 6)),
                    steps=int(args.get("steps", 6)), light=float(args.get("light", 1.0)),
                    detail=float(args.get("detail", 1.0)), crease=float(args.get("crease", 38)),
                    outline=bool(args.get("outline", True)), yaw=float(args.get("yaw", 0)), name=args.get("name"),
                    work_dir=os.path.join(out, "_source"))
        rep = export_model(m, out)
        rep.pop("palette", None)
        sheet = [p for k, p in rep["files"].items() if k.endswith("_sheet.png")][0]
        return [_text(rep), _png(Image.open(sheet))]
    if name == "lowpix_polyhaven_search":
        from .convert import polyhaven_search
        hits = polyhaven_search(args.get("query", ""), int(args.get("limit", 30)))
        return [_text("\n".join(f"polyhaven:{a}  {n}  ({d} downloads)" for a, n, d in hits) or "no matches")]
    if name == "lowpix_texture":
        m = build_model(_spec(args))
        k = int(args.get("scale", 4))
        AH, AW = m.atlas.shape[:2]
        img = Image.fromarray(m.atlas, "RGBA").resize((AW * k, AH * k), Image.NEAREST)
        bg = Image.new("RGBA", img.size, (24, 22, 30, 255))
        bg.alpha_composite(img)
        return [_text(f"atlas {AW}x{AH}, shown at {k}x; {len(m.colors_hex())} colours: {m.colors_hex()}"),
                _png(bg.convert("RGB"), max_w=2048)]
    if name == "lowpix_ramp":
        cols = make_ramp(args["base"], int(args.get("steps", 6)), float(args.get("hue_shift", 18)),
                         float(args.get("sat_shift", 0.12)), float(args.get("spread", 0.75)))
        sw = Image.new("RGB", (48 * len(cols), 48))
        for i, c in enumerate(cols):
            sw.paste(Image.new("RGB", (48, 48), c), (48 * i, 0))
        return [_text(json.dumps(cols)), _png(sw)]
    if name == "lowpix_guide":
        topic = args.get("topic", "all")
        parts = []
        if topic in ("workflow", "all"):
            parts.append(_read_doc("AGENT_WORKFLOW.md"))
        if topic in ("spec", "all"):
            parts.append(_read_doc("SPEC.md"))
        if topic in ("style", "all"):
            parts.append(_read_doc("STYLE_GUIDE.md"))
        return [_text("\n\n---\n\n".join(parts) or "topics: workflow, spec, style, all")]
    raise ValueError(f"unknown tool {name!r}")


def handle(msg: dict):
    mid = msg.get("id")
    method = msg.get("method")
    params = msg.get("params") or {}
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": mid, "result": {
            "protocolVersion": params.get("protocolVersion", PROTOCOL),
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "lowpix", "version": __version__},
            "instructions": ("lowpix builds low-poly models with hand-painted pixel-art textures from JSON specs. "
                             "Call lowpix_guide first, then iterate: edit spec -> lowpix_build -> look at the image -> "
                             "fix warnings and art problems -> repeat. Use lowpix_render with part=... for close-ups. "
                             "For a realistic shape, skip hand-modelling: lowpix_polyhaven_search then lowpix_convert "
                             "turns any detailed .glb/.gltf/.obj (or polyhaven:<id>) into this style in one call."),
        }}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": mid, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}}
    if method == "tools/call":
        try:
            content = call_tool(params.get("name"), params.get("arguments") or {})
            return {"jsonrpc": "2.0", "id": mid, "result": {"content": content, "isError": False}}
        except SpecError as e:
            return {"jsonrpc": "2.0", "id": mid, "result": {"content": [_text(str(e))], "isError": True}}
        except Exception as e:  # report tool failures to the agent instead of crashing
            tb = traceback.format_exc(limit=3)
            return {"jsonrpc": "2.0", "id": mid, "result": {"content": [_text(f"{type(e).__name__}: {e}\n{tb}")],
                                                            "isError": True}}
    if mid is None:
        return None  # notification
    return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"method not found: {method}"}}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            out = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}}
        else:
            out = handle(msg)
        if out is not None:
            sys.stdout.write(json.dumps(out) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
