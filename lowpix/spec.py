"""Model spec loading, style merging and validation.

The spec is plain JSON so agents can write, diff and patch it. See
docs/SPEC.md for the full reference.
"""
from __future__ import annotations

import copy
import re
import json
import os

TOP_KEYS = {"name", "description", "author", "license", "density", "budget", "light", "palette",
            "styles", "defaults", "parts", "render", "notes", "grounded", "animations", "anim_fps", "anim_ground_tolerance", "material", "convert", "$schema"}
PART_KEYS = {"id", "parent", "shape", "size", "pivot", "offset", "rotation", "mirror", "style",
             "paint", "hide", "front_scale", "back_scale", "front_shift", "back_shift", "sides",
             "angle", "plane", "art", "orient", "snap_ground", "notes", "chamfer", "profile", "rings",
             "subdiv", "smooth", "caps", "up", "attach", "hard", "chain",
             "double_sided", "flip_on_mirror"}
PAINT_KEYS = {"ramp", "tone", "light", "dither", "rim", "layers", "stamps", "art_key"}
SHAPES = {"box", "taper", "prism", "card", "loft", "bone"}
OPS = {"fill", "band", "stripes", "spots", "patches", "speckle", "gradient", "noise", "gloss",
       "rect", "panel", "rivets", "wear", "grille"}
FACE_TAGS = {"all", "*", "sides", "flanks", "ends", "caps", "up", "down", "level", "lit", "shaded",
             "local_up", "local_down", "front", "back", "left", "right", "top", "bottom",
             "start", "end", "bevels", "bevel_tl", "bevel_tr", "bevel_bl", "bevel_br"}


class SpecError(ValueError):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("invalid spec:\n  - " + "\n  - ".join(errors))


def load_spec(src) -> dict:
    """Path to a .json file, a JSON string, or a dict -> spec dict (deep copy)."""
    if isinstance(src, dict):
        spec = copy.deepcopy(src)
        spec.setdefault("_base_dir", os.getcwd())
        return spec
    if isinstance(src, str) and src.lstrip().startswith("{"):
        spec = json.loads(src)
        spec["_base_dir"] = os.getcwd()
        return spec
    with open(src, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    spec["_base_dir"] = os.path.dirname(os.path.abspath(src))
    spec.setdefault("name", os.path.splitext(os.path.basename(src))[0])
    return spec


def merge_paint(*paints) -> dict:
    out: dict = {}
    for p in paints:
        if not p:
            continue
        for k, v in p.items():
            if k == "layers":
                # a layer whose "id" matches an inherited layer patches it in place
                layers = [dict(x) for x in out.get(k, [])]
                for layer in v:
                    lid = layer.get("id")
                    hit = next((x for x in layers if lid and x.get("id") == lid), None)
                    if hit is not None:
                        hit.update(layer)
                    else:
                        layers.append(dict(layer))
                out[k] = layers
            elif k == "stamps":
                out[k] = list(out.get(k, [])) + list(v)
            elif k in ("rim", "art_key") and isinstance(v, dict):
                d = dict(out.get(k, {}))
                d.update(v)
                out[k] = d
            else:
                out[k] = v
    return out


def resolve_paint(spec: dict, part: dict) -> dict:
    styles = spec.get("styles", {})
    chain = [spec.get("defaults", {}).get("paint", {})]
    st = part.get("style")
    for name in ([st] if isinstance(st, str) else (st or [])):
        chain.append(styles.get(name, {}))
    chain.append(part.get("paint", {}))
    return merge_paint(*chain)


def _faces_for(part):
    shape = part.get("shape", "box")
    if shape in ("box", "taper"):
        base = {"front", "back", "left", "right", "top", "bottom"}
        return base | ({"bevel_tl", "bevel_tr", "bevel_bl", "bevel_br"} if part.get("chamfer") else set())
    if shape == "prism":
        return {"front", "back"} | {f"side{k}" for k in range(int(part.get("sides", 6)))}
    if shape == "loft":
        return {"start", "end"}
    return {"front"}


def validate(spec: dict):
    """Return (errors, warnings). Errors make the build fail."""
    errors, warnings = [], []
    for k in spec:
        if k not in TOP_KEYS and not k.startswith("_"):
            warnings.append(f"unknown top-level key {k!r}")
    ramps = (spec.get("palette") or {}).get("ramps") or {}
    if not ramps:
        errors.append("palette.ramps is empty - define at least one ramp")
    styles = spec.get("styles", {})
    parts = spec.get("parts") or []
    if not parts:
        errors.append("no parts")
    ids = [p.get("id") for p in parts]
    seen = set()
    for i, p in enumerate(parts):
        pid = p.get("id")
        where = f"part[{i}] {pid!r}"
        if not pid:
            errors.append(f"part[{i}] has no id")
            continue
        if pid in seen:
            errors.append(f"duplicate part id {pid!r}")
        seen.add(pid)
        for k in p:
            if k not in PART_KEYS:
                warnings.append(f"{where}: unknown key {k!r}")
        if p.get("parent") and p["parent"] not in ids:
            errors.append(f"{where}: parent {p['parent']!r} does not exist")
        shape = p.get("shape", "box")
        if shape not in SHAPES:
            errors.append(f"{where}: shape must be one of {sorted(SHAPES)}")
        size = p.get("size")
        if shape in ("box", "taper", "prism"):
            if not (isinstance(size, list) and len(size) == 3):
                errors.append(f"{where}: size must be [w, h, d]")
            elif any((not isinstance(v, (int, float))) or v < 0 for v in size):
                errors.append(f"{where}: size values must be >= 0")
        if shape == "card":
            if size is None and not p.get("art"):
                errors.append(f"{where}: card needs size [w, h] or art")
            if p.get("plane", "xy") not in ("xy", "xz", "yz"):
                errors.append(f"{where}: plane must be xy|xz|yz")
            art = p.get("art")
            if art and len({len(r) for r in art}) > 1:
                warnings.append(f"{where}: art rows have different lengths")
        if shape == "prism" and int(p.get("sides", 6)) < 3:
            errors.append(f"{where}: prism needs sides >= 3")
        if shape == "loft":
            rings = p.get("rings")
            if not (isinstance(rings, list) and len(rings) >= 2):
                errors.append(f"{where}: loft needs at least 2 rings")
            else:
                for ri, r in enumerate(rings):
                    if not (isinstance(r.get("at"), list) and len(r["at"]) == 3):
                        errors.append(f"{where}: ring {ri} needs at [x, y, z]")
                    sz = r.get("size", 1)
                    if not (isinstance(sz, (int, float)) or (isinstance(sz, list) and len(sz) == 2)):
                        errors.append(f"{where}: ring {ri} size must be a number or [w, h]")
            prof = p.get("profile", {})
            if isinstance(prof, dict) and int(prof.get("sides", 8)) < 3:
                errors.append(f"{where}: profile needs sides >= 3")
        att = p.get("attach")
        if att is not None:
            par = next((q for q in parts if q.get("id") == p.get("parent")), None)
            if par is None or par.get("shape") != "loft":
                errors.append(f"{where}: attach needs a parent with shape 'loft'")
            if not isinstance(att, dict) or not (0 <= float(att.get("t", 0.5)) <= 1):
                errors.append(f"{where}: attach.t must be within 0..1")
            if p.get("pivot") is not None:
                warnings.append(f"{where}: pivot is ignored when attach is set")
        for key in ("pivot", "offset", "rotation"):
            v = p.get(key)
            if v is not None and not (isinstance(v, list) and len(v) == 3):
                errors.append(f"{where}: {key} must be [x, y, z]")
        st = p.get("style")
        for s in ([st] if isinstance(st, str) else (st or [])):
            if s not in styles:
                errors.append(f"{where}: unknown style {s!r}")
        paint = resolve_paint(spec, p)
        for k in p.get("paint", {}):
            if k not in PAINT_KEYS:
                warnings.append(f"{where}: unknown paint key {k!r}")
        if paint.get("ramp") and paint["ramp"] not in ramps:
            errors.append(f"{where}: unknown ramp {paint['ramp']!r}")
        if not paint.get("ramp"):
            warnings.append(f"{where}: no ramp set - using first ramp")
        faces = _faces_for(p)
        for li, layer in enumerate(paint.get("layers", [])):
            op = layer.get("op", "fill")
            if op not in OPS:
                errors.append(f"{where}: layer {li} unknown op {op!r} (valid: {sorted(OPS)})")
            for rk in ("ramp",):
                if rk in layer and layer[rk] not in ramps:
                    errors.append(f"{where}: layer {li} unknown ramp {layer[rk]!r}")
            bev = layer.get("bevel")
            if isinstance(bev, dict) and bev.get("shadow_ramp") and bev["shadow_ramp"] not in ramps:
                errors.append(f"{where}: layer {li} unknown shadow_ramp {bev['shadow_ramp']!r}")
            ff = layer.get("faces")
            for tag in ([ff] if isinstance(ff, str) else (ff or [])):
                t = tag.lstrip("-")
                if t not in FACE_TAGS and t not in faces:
                    warnings.append(f"{where}: layer {li} face filter {tag!r} matches nothing on a {shape}")
        for si, st in enumerate(paint.get("stamps", [])):
            fname = st.get("face", "front")
            loft_face = shape == "loft" and re.fullmatch(r"s\d+_\d+|joint\d+_(start|end)", str(fname))
            if "faces" not in st and fname not in faces and not loft_face:
                hint = " (loft side faces are named s<segment>_<side>; or use \"faces\": [filters])" if shape == "loft" else ""
                errors.append(f"{where}: stamp {si} face {fname!r} not on a {shape} (has {sorted(faces)}){hint}")
            if not st.get("art"):
                errors.append(f"{where}: stamp {si} has no art")
            for ch, ref in st.get("key", {}).items():
                if not _ref_ok(ref, ramps):
                    errors.append(f"{where}: stamp {si} key {ch!r} -> {ref!r} is not a colour")
            used = {c for row in st.get("art", []) for c in row} - set(". _")
            missing = used - set(st.get("key", {}))
            if missing:
                errors.append(f"{where}: stamp {si} chars {sorted(missing)} missing from key")
        for ch, ref in paint.get("art_key", {}).items():
            if not _ref_ok(ref, ramps):
                errors.append(f"{where}: art_key {ch!r} -> {ref!r} is not a colour")
    # animations
    part_ids = {p.get("id") for p in parts}
    for cname, clip in (spec.get("animations") or {}).items():
        where = f"animation {cname!r}"
        if not isinstance(clip, dict):
            errors.append(f"{where}: must be an object with length/loop/tracks")
            continue
        if float(clip.get("length", 1.0)) <= 0:
            errors.append(f"{where}: length must be > 0")
        for ti, tr in enumerate(clip.get("tracks", [])):
            names = tr.get("parts") or [tr.get("part")]
            for n in names:
                base = str(n).replace("_mirror", "") if n else None
                if base not in part_ids and base is not None:
                    base = re.sub(r"_\d+$", "", base)  # chain segment "tail_3"
                if base not in part_ids:
                    errors.append(f"{where}: track {ti} targets unknown part {n!r}")
            if tr.get("channel", "rotation") not in ("rotation", "position", "scale"):
                errors.append(f"{where}: track {ti} channel must be rotation|position|scale")
            kinds = [k for k in ("keys", "osc", "wave") if k in tr]
            if len(kinds) != 1:
                errors.append(f"{where}: track {ti} needs exactly one of keys / osc / wave")
            if "keys" in tr:
                ks = tr["keys"]
                if not ks or any(not isinstance(k, list) or len(k) < 2 for k in ks):
                    errors.append(f"{where}: track {ti} keys must be [[time, value], ...]")
                elif any(float(k[0]) < 0 or float(k[0]) > float(clip.get("length", 1.0)) + 1e-9 for k in ks):
                    errors.append(f"{where}: track {ti} has a key outside 0..length")
            if "wave" in tr and tr.get("part") and not any(p.get("id") == tr["part"] and p.get("chain") for p in parts) \
                    and not tr.get("parts"):
                warnings.append(f"{where}: track {ti} wave on {tr['part']!r} needs a chain loft or a 'parts' list")
    # cycles
    parent = {p.get("id"): p.get("parent") for p in parts}
    for pid in parent:
        hops, cur = 0, pid
        while cur is not None and hops <= len(parent):
            cur = parent.get(cur)
            hops += 1
        if hops > len(parent):
            errors.append(f"parent cycle involving {pid!r}")
            break
    return errors, warnings


def _ref_ok(ref, ramps) -> bool:
    ref = str(ref)
    if ref.startswith("#"):
        return len(ref) in (7, 9)
    if ":" in ref:
        name, idx = ref.rsplit(":", 1)
        try:
            int(idx)
        except ValueError:
            return False
        return name in ramps
    return ref in ramps
