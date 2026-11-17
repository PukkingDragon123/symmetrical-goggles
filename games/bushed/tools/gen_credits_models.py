#!/usr/bin/env python3
"""Write the "## Models and textures" section of games/bushed/CREDITS.md from the actual asset files.

    python games/bushed/tools/gen_credits_models.py

Reads public/assets/models/*.glb (root-node extras: source, authors), the vehicle .json files (Sketchfab author,
licence, attribution line) and public/assets/textures/index.json. Only this section is replaced (from its heading
to the next "## " heading or the end); every other section is left untouched.
"""
from __future__ import annotations

import json
import os
import re
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
MODELS = os.path.join(GAME, "public", "assets", "models")
TEX = os.path.join(GAME, "public", "assets", "textures", "index.json")
CREDITS = os.path.join(GAME, "CREDITS.md")
HEAD = "## Models and textures"


def glb_extras(path: str) -> dict:
    b = open(path, "rb").read(1 << 20)
    jl = struct.unpack_from("<I", b, 12)[0]
    js = json.loads(b[20:20 + jl])
    return js["nodes"][js["scenes"][js.get("scene", 0)]["nodes"][0]].get("extras", {})


def section() -> str:
    vehicles = {f[:-5] for f in os.listdir(MODELS) if f.endswith(".json")}
    by_source: dict[str, dict] = {}
    for f in sorted(os.listdir(MODELS)):
        if not f.endswith(".glb") or f[:-4] in vehicles:
            continue
        ex = glb_extras(os.path.join(MODELS, f))
        src = ex.get("source", "")
        e = by_source.setdefault(src, {"ids": [], "authors": ex.get("authors", [])})
        e["ids"].append(f[:-4])
    lines = [HEAD, "",
             "Made by `tools/convert_props.py`, `tools/make_textures.py` and `tools/make_vehicle.py`: every model is "
             "converted to BUSHED's pixel-art look with lowpix (re-meshed, re-textured, rescaled), every texture is "
             "re-sampled and palette-quantised from the scans named here.", "",
             "### Props (`public/assets/models/<id>.glb`) from Poly Haven", "",
             "All CC0 1.0 (public domain). Thank you, Poly Haven and its artists.", "",
             "| Prop id(s) | Source | Author(s) | Licence |", "|---|---|---|---|"]
    for src, e in sorted(by_source.items(), key=lambda kv: kv[1]["ids"][0].lower()):
        name = src.rsplit("/", 1)[-1]
        lines.append(f"| {', '.join(f'`{i}`' for i in sorted(e['ids']))} | [{name}]({src}) | "
                     f"{', '.join(e['authors']) or 'Poly Haven'} | CC0 1.0 |")
    lines += ["", "### Tiling textures (`public/assets/textures/`) from Poly Haven", "",
              "| Texture | Source scan(s) | Author(s) | Licence |", "|---|---|---|---|"]
    for t in json.load(open(TEX)):
        srcs = [s.strip() for s in t["source"].split("+")]
        links = ", ".join(f"[{s}](https://polyhaven.com/a/{s})" for s in srcs)
        lines.append(f"| `{t['set']}/{t['name']}` | {links} | {', '.join(t.get('authors') or ['Poly Haven'])} | CC0 1.0 |")
    lines += ["", "### Vehicles from Sketchfab (CC BY 4.0, attribution required)", "",
              "Converted, re-meshed, re-textured, split into parts (wheels, steering wheel, glass) and rescaled; "
              "the Jeep's insignia and the modeller's stencilled signature painted out. Changes were made.", "",
              "| File | Source | Author | Licence |", "|---|---|---|---|"]
    for v in sorted(vehicles):
        m = json.load(open(os.path.join(MODELS, f"{v}.json")))
        lines.append(f"| `{v}.glb` | [{m['source'].rsplit('/', 1)[-1]}]({m['source']}) | {m['author']} | "
                     f"[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) |")
    lines += ["", "Required attribution (reproduce it wherever the game's credits are shown):", ""]
    for v in sorted(vehicles):
        m = json.load(open(os.path.join(MODELS, f"{v}.json")))
        marks = ", markings painted out" if "painted out" in m.get("notes", "") else ""
        lines.append(f"* `{v}.glb`: {m['attribution']}. Modified for BUSHED (converted to pixel art, re-meshed, "
                     f"split into parts{marks}).")
    return "\n".join(lines) + "\n"


def main():
    sec = section()
    text = open(CREDITS).read() if os.path.exists(CREDITS) else "# BUSHED credits\n"
    if HEAD in text:
        start = text.index(HEAD)
        m = re.search(r"^## (?!#)", text[start + len(HEAD):], flags=re.M)
        end = start + len(HEAD) + m.start() if m else len(text)
        text = text[:start] + sec + ("\n" if m else "") + text[end:]
    else:
        text = text.rstrip("\n") + "\n\n" + sec
    open(CREDITS, "w").write(text)
    print(f"wrote {HEAD!r} to {os.path.relpath(CREDITS)}")


if __name__ == "__main__":
    main()
