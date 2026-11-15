"""Mass production: build/convert many models in parallel with one command.

    python -m lowpix batch examples/*.json -o out/specs             # build every spec
    python -m lowpix batch models/ --style pixel-hd -j 4             # convert a folder of .glb/.gltf/.obj
    python -m lowpix batch "polyhaven?statue" --limit 12 --style painted
    python -m lowpix batch manifest.json                              # per-item options

Sources: spec .json files, manifests ({"defaults": {...}, "items": [{"source": ..., "name": ...,
"style": ..., <convert options>}, ...]}), model files, folders (searched recursively), glob
patterns, polyhaven:<id> and polyhaven?<query>.

Outputs in the out dir: one sub-folder per item, summary.json + summary.csv,
contact.png (every hero in one grid) and index.html (a gallery that opens every
.glb in a viewer; serve it with `python -m http.server`).
"""
from __future__ import annotations

import csv
import glob
import json
import os
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed

MODEL_EXT = (".glb", ".gltf", ".obj")
CONVERT_KEYS = ("tris", "density", "atlas", "ramps", "steps", "light", "detail", "smooth", "grain", "crease",
                "dither", "posterize", "saturation", "chart_angle", "spread", "outline")


def _slug(s: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in s.lower()).strip("_") or "model"


def _is_spec(path: str) -> bool:
    try:
        with open(path) as fh:
            d = json.load(fh)
        return isinstance(d, dict) and "parts" in d
    except Exception:
        return False


def expand_sources(sources, limit: int = 12, defaults: dict | None = None):
    """-> list of items {"kind": "spec"|"model", "source": str, "name": str|None, "opts": {...}}."""
    items = []
    base = dict(defaults or {})

    def add(kind, src, extra=None):
        opts = dict(base)
        opts.update(extra or {})
        items.append({"kind": kind, "source": src, "name": opts.pop("name", None), "opts": opts})

    for s in sources:
        if s.startswith("polyhaven?"):
            from .convert import polyhaven_search
            for aid, name, _ in polyhaven_search(s.split("?", 1)[1].replace("+", " "), limit):
                add("model", f"polyhaven:{aid}", {"name": name})
        elif s.startswith("polyhaven:"):
            add("model", s)
        elif os.path.isdir(s):
            for root, _, files in os.walk(s):
                for f in sorted(files):
                    p = os.path.join(root, f)
                    if f.lower().endswith(MODEL_EXT) and "_source" not in root:
                        add("model", p)
                    elif f.lower().endswith(".json") and _is_spec(p):
                        add("spec", p)
        elif any(ch in s for ch in "*?["):
            items.extend(expand_sources(sorted(glob.glob(s)), limit, defaults))
        elif s.lower().endswith(".json"):
            with open(s) as fh:
                d = json.load(fh)
            if isinstance(d, dict) and "items" in d:  # manifest
                folder = os.path.dirname(os.path.abspath(s))
                for it in d["items"]:
                    it = dict(it)
                    src = it.pop("source")
                    if not (src.startswith("polyhaven") or os.path.isabs(src)):
                        src = os.path.join(folder, src)
                    merged = dict(d.get("defaults", {}))
                    merged.update(it)
                    sub = expand_sources([src], limit, {**base, **merged})
                    items.extend(sub)
            else:
                add("spec", s)
        elif s.lower().endswith(MODEL_EXT):
            add("model", s)
        else:
            raise ValueError(f"don't know how to batch {s!r}")
    return items


def run_item(item: dict, out_root: str, gif: bool = False) -> dict:
    """Build or convert one item (runs in a worker process)."""
    from .build import export_all, export_model
    t0 = time.time()
    res = {"source": item["source"], "kind": item["kind"], "name": item.get("name")}
    try:
        if item["kind"] == "spec":
            from .spec import load_spec
            name = item.get("name") or load_spec(item["source"]).get("name", "model")
            out = os.path.join(out_root, _slug(name))
            rep = export_all(item["source"], out, gif=gif)
            res["style"] = "spec"
        else:
            from .convert import convert
            o = dict(item.get("opts", {}))
            style = o.pop("style", "pixel")
            height = float(o.pop("height", 24.0))
            yaw = float(o.pop("yaw", 0.0))
            conv = {k: o[k] for k in CONVERT_KEYS if k in o and o[k] is not None}
            raw = item["source"].split(":", 1)[-1]
            name = item.get("name") or os.path.splitext(os.path.basename(raw))[0].replace("_", " ").title()
            out = os.path.join(out_root, _slug(name) + ("" if style == "pixel" else "_" + _slug(style)))
            m = convert(item["source"], style=style, height=height, yaw=yaw, name=name,
                        work_dir=os.path.join(out_root, "_source"), **conv)
            rep = export_model(m, out, gif=gif)
            res["style"] = style
        res.update(status="ok", name=rep["name"], out=out, triangles=rep["triangles"], colors=rep["colors_used"],
                   atlas=rep["atlas"], warnings=rep["warnings"], animations=list(rep.get("animations", {})),
                   files={k: os.path.relpath(v, out_root) for k, v in rep["files"].items()})
    except Exception as e:  # one bad item must not stop a batch
        res.update(status="error", error=f"{type(e).__name__}: {e}", trace=traceback.format_exc(limit=4))
    res["seconds"] = round(time.time() - t0, 2)
    return res


def contact_grid(results, out_root, cols=4, cell=(360, 270)):
    from PIL import Image, ImageDraw
    from .render import _font
    ok = [r for r in results if r.get("status") == "ok"]
    if not ok:
        return None
    rows = (len(ok) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell[0], rows * (cell[1] + 34)), (16, 17, 24))
    d = ImageDraw.Draw(sheet)
    for i, r in enumerate(ok):
        hero = [v for k, v in r["files"].items() if k.endswith("_hero.png")]
        x, y = (i % cols) * cell[0], (i // cols) * (cell[1] + 34)
        if hero:
            im = Image.open(os.path.join(out_root, hero[0])).convert("RGB")
            im.thumbnail(cell)
            sheet.paste(im, (x + (cell[0] - im.width) // 2, y))
        d.text((x + 8, y + cell[1] + 4), f"{r['name']}  ({r.get('style')})", fill=(230, 226, 240), font=_font(14))
        d.text((x + 8, y + cell[1] + 19), f"{r['triangles']} tris · {r['colors']} colours · {r['seconds']}s",
               fill=(150, 148, 170), font=_font(12))
    path = os.path.join(out_root, "contact.png")
    sheet.save(path)
    return path


GALLERY = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>lowpix batch</title>
<style>
:root{--bg:#14151c;--panel:#1c1e28;--fg:#e8e6f0;--muted:#9a98ad;--accent:#f0a83a}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
.app{display:grid;grid-template-columns:320px 1fr;height:100%}
.list{overflow:auto;background:var(--panel);padding:12px;display:flex;flex-direction:column;gap:8px}
.item{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center;padding:6px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.item:hover,.item.on{border-color:var(--accent)}
.item img{width:96px;height:72px;object-fit:cover;border-radius:4px;image-rendering:pixelated}
.item small{color:var(--muted)}
.stage{position:relative}canvas{display:block;width:100%;height:100%}
.bar{position:absolute;left:12px;bottom:12px;display:flex;gap:6px;flex-wrap:wrap}
.bar button{background:#0008;color:var(--fg);border:1px solid #fff3;border-radius:999px;padding:6px 12px;cursor:pointer}
.err{color:#ff8a7a}
@media(max-width:760px){.app{grid-template-columns:1fr;grid-template-rows:55vh 1fr}.stage{order:-1}}
</style></head><body><div class="app"><div class="list" id="list"></div><div class="stage" id="stage"><div class="bar" id="bar"></div></div></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const ITEMS=__ITEMS__;
const stage=document.getElementById('stage'),r=new THREE.WebGLRenderer({antialias:true});r.outputColorSpace=THREE.SRGBColorSpace;stage.prepend(r.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#1d2230');scene.add(new THREE.HemisphereLight(0xffffff,0x334455,1.4));
const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(-5,10,6);scene.add(sun);
const cam=new THREE.PerspectiveCamera(30,1,0.1,5000),ctl=new OrbitControls(cam,r.domElement);ctl.enableDamping=true;ctl.autoRotate=true;
let cur=null,mixer=null;const clock=new THREE.Clock(),loader=new GLTFLoader();
function size(){const b=stage.getBoundingClientRect();r.setSize(b.width,b.height,false);cam.aspect=b.width/Math.max(b.height,1);cam.updateProjectionMatrix()}
new ResizeObserver(size).observe(stage);
function show(it,el){document.querySelectorAll('.item').forEach(e=>e.classList.toggle('on',e===el));
 loader.load(it.glb,g=>{if(cur)scene.remove(cur);cur=g.scene;scene.add(cur);const box=new THREE.Box3().setFromObject(cur),c=box.getCenter(new THREE.Vector3()),d=box.getSize(new THREE.Vector3()).length()*1.9;
 cam.position.set(c.x+d*0.55,c.y+d*0.35,c.z+d*0.75);ctl.target.copy(c);cam.near=d/200;cam.far=d*20;cam.updateProjectionMatrix();
 mixer=new THREE.AnimationMixer(cur);const bar=document.getElementById('bar');bar.innerHTML='';
 g.animations.forEach((a,i)=>{const b=document.createElement('button');b.textContent=a.name;b.onclick=()=>{mixer.stopAllAction();mixer.clipAction(a).play()};bar.append(b);if(i===0)mixer.clipAction(a).play()});},
 undefined,e=>{document.getElementById('bar').innerHTML='<span class="err">Could not load '+it.glb+' - serve this folder with python -m http.server</span>'})}
const list=document.getElementById('list');
ITEMS.forEach((it,i)=>{const el=document.createElement('div');el.className='item';
 el.innerHTML=it.ok?`<img src="${it.hero}" alt=""><div><b>${it.name}</b><br><small>${it.style} · ${it.tris} tris · ${it.colors} colours${it.anims?' · '+it.anims:''}</small></div>`:`<div></div><div><b>${it.name}</b><br><small class="err">${it.error}</small></div>`;
 if(it.ok)el.onclick=()=>show(it,el);list.append(el);if(i===0&&it.ok)show(it,el)});
r.setAnimationLoop(()=>{if(mixer)mixer.update(Math.min(clock.getDelta(),.1));ctl.update();r.render(scene,cam)});
</script></body></html>"""


def gallery(results, out_root):
    items = []
    for r in results:
        if r.get("status") == "ok":
            f = r["files"]
            glb = next((v for k, v in f.items() if k.endswith(".glb")), None)
            hero = next((v for k, v in f.items() if k.endswith("_hero.png")), None)
            items.append({"ok": True, "name": r["name"], "style": r.get("style"), "tris": r["triangles"],
                          "colors": r["colors"], "anims": ", ".join(r.get("animations", [])),
                          "glb": glb.replace(os.sep, "/"), "hero": (hero or "").replace(os.sep, "/")})
        else:
            items.append({"ok": False, "name": r.get("name") or r["source"], "error": r.get("error", "")})
    path = os.path.join(out_root, "index.html")
    with open(path, "w") as fh:
        fh.write(GALLERY.replace("__ITEMS__", json.dumps(items).replace("</", "<\\/")))
    return path


def batch(sources, out_root: str, jobs: int = 0, gif: bool = False, limit: int = 12, defaults: dict | None = None,
          log=print) -> dict:
    items = expand_sources(sources, limit, defaults)
    if not items:
        raise ValueError("nothing to do - no specs or models matched")
    os.makedirs(out_root, exist_ok=True)
    jobs = jobs or min(4, os.cpu_count() or 1)
    results = []
    t0 = time.time()
    if jobs == 1 or len(items) == 1:
        for it in items:
            r = run_item(it, out_root, gif)
            results.append(r)
            log(f"[{len(results)}/{len(items)}] {r['status']:5s} {r.get('name') or r['source']} ({r['seconds']}s)")
    else:
        with ProcessPoolExecutor(max_workers=jobs) as ex:
            futs = {ex.submit(run_item, it, out_root, gif): it for it in items}
            for fu in as_completed(futs):
                r = fu.result()
                results.append(r)
                log(f"[{len(results)}/{len(items)}] {r['status']:5s} {r.get('name') or r['source']} ({r['seconds']}s)"
                    + (f" - {r['error']}" if r["status"] != "ok" else ""))
    order = {it["source"]: i for i, it in enumerate(items)}
    results.sort(key=lambda r: order.get(r["source"], 0))
    summary = {"items": len(results), "ok": sum(r["status"] == "ok" for r in results),
               "failed": sum(r["status"] != "ok" for r in results), "seconds": round(time.time() - t0, 1),
               "results": results}
    with open(os.path.join(out_root, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)
    with open(os.path.join(out_root, "summary.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["name", "status", "style", "triangles", "colors", "seconds", "out", "error"])
        for r in results:
            w.writerow([r.get("name"), r["status"], r.get("style"), r.get("triangles"), r.get("colors"),
                        r["seconds"], r.get("out"), r.get("error", "")])
    summary["contact"] = contact_grid(results, out_root)
    summary["gallery"] = gallery(results, out_root)
    return summary


TEMPLATES = {
    "creature": "salamander.json",   # chain-loft body, attached legs, crest cards, walk/idle
    "quadruped": "geode_drake.json",  # crouched four-legged beast, roar/prowl
    "bird": "duskmoth_griffin.json",  # wings as cards, fly cycle, head-turn
    "robot": "robot.json",            # chamfered hard surface, panel/rivet/wear ops, walk/wave
    "figure": "rexhood_bunny.json",   # gacha figure on a plinth, chomp/peek
    "critter": "pipe_otter.json",     # small animal + prop, popup
    "prop": "glowcap.json",           # static-ish prop, prisms + cards, boing
}


def new_spec(template: str, name: str, out: str | None = None) -> str:
    """Copy a template spec (one of TEMPLATES) to start a new model."""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if template not in TEMPLATES:
        raise ValueError(f"unknown template {template!r} (choose from {sorted(TEMPLATES)})")
    with open(os.path.join(root, "examples", TEMPLATES[template])) as fh:
        spec = json.load(fh)
    spec["name"] = name
    spec["description"] = f"New {template} started from the {TEMPLATES[template]} template - describe your design here."
    spec.pop("author", None)
    out = out or os.path.join(root, "examples", _slug(name) + ".json")
    if os.path.exists(out):
        raise FileExistsError(f"{out} already exists")
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    return out
