"""Run with:  python -m unittest discover -s tests -v"""
import copy
import io
import json
import os
import struct
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from lowpix import build_model, render  # noqa: E402
from lowpix.export import glb_bytes  # noqa: E402
from lowpix.mathutil import transform_points  # noqa: E402
from lowpix.palette import make_ramp, parse_hex  # noqa: E402
from lowpix.spec import SpecError, load_spec, resolve_paint, validate  # noqa: E402

SALAMANDER = os.path.join(ROOT, "examples", "salamander.json")
EXAMPLES = sorted(os.path.join(ROOT, "examples", f) for f in os.listdir(os.path.join(ROOT, "examples"))
                  if f.endswith(".json"))

MINI = {
    "name": "mini",
    "density": 2,
    "palette": {"ramps": {"a": {"base": "#55447a", "steps": 5}, "b": ["#331100", "#aa5500", "#ffcc66"]}},
    "parts": [
        {"id": "body", "shape": "taper", "size": [6, 4, 8], "pivot": [0, 3, 0], "front_scale": [0.7, 0.8],
         "paint": {"ramp": "a", "layers": [{"id": "s", "op": "spots", "count": 3, "ramp": "b", "bevel": True}]}},
        {"id": "arm", "parent": "body", "shape": "box", "size": [3, 1, 1], "pivot": [3, -1, 2], "offset": [1.5, 0, 0],
         "rotation": [10, 20, -30], "mirror": True, "paint": {"ramp": "a"}},
        {"id": "eye", "parent": "body", "shape": "prism", "sides": 6, "size": [2, 2, 1], "pivot": [2, 1.5, 3],
         "rotation": [0, 70, 30], "mirror": True,
         "paint": {"ramp": "a", "stamps": [{"face": "front", "art": ["w."], "key": {"w": "b:2"}}]}},
        {"id": "toe", "parent": "arm", "shape": "card", "plane": "xz", "pivot": [3, -1, 0], "orient": "world",
         "art": ["#.#", "###"], "snap_ground": 0.05, "paint": {"ramp": "b"}},
    ],
}


def parse_glb(data: bytes):
    magic, version, length = struct.unpack_from("<III", data, 0)
    jlen, jtype = struct.unpack_from("<II", data, 12)
    js = json.loads(data[20:20 + jlen])
    blen, btype = struct.unpack_from("<II", data, 20 + jlen)
    return magic, version, length, jtype, btype, js, blen


class TestGeometry(unittest.TestCase):
    def setUp(self):
        self.m = build_model(MINI)

    def test_outward_winding_including_mirrors(self):
        for inst in self.m.instances:
            pts = np.concatenate([f.pts for f in inst.faces])
            c = pts.mean(axis=0)
            for f in inst.faces:
                if f.double_sided:
                    continue
                n = f.normal
                self.assertGreater(np.dot(n, f.pts.mean(axis=0) - c), 0, f"{inst.id}.{f.name} faces inward")

    def test_mirror_is_reflection(self):
        by = {i.id: i for i in self.m.instances}
        for src in ("arm", "eye", "toe"):
            a = np.concatenate([transform_points(by[src].world, f.pts) for f in by[src].faces])
            b = np.concatenate([transform_points(by[src + "_mirror"].world, f.pts) for f in by[src + "_mirror"].faces])
            a = {tuple(np.round(p * [-1, 1, 1], 4)) for p in a}
            b = {tuple(np.round(p, 4)) for p in b}
            self.assertEqual(a, b, src)

    def test_quad_sampling_matches_corners(self):
        f = self.m.instances[0].faces[0]
        np.testing.assert_allclose(f.sample(np.array(0.0), np.array(0.0)), f.pts[0])
        np.testing.assert_allclose(f.sample(np.array(1.0), np.array(0.0)), f.pts[1])
        np.testing.assert_allclose(f.sample(np.array(1.0), np.array(1.0)), f.pts[2])
        np.testing.assert_allclose(f.sample(np.array(0.0), np.array(1.0)), f.pts[3])

    def test_snap_ground_and_orient_world(self):
        toe = [i for i in self.m.instances if i.id == "toe"][0]
        ys = transform_points(toe.world, toe.faces[0].pts)[:, 1]
        self.assertAlmostEqual(float(ys.min()), 0.05, places=6)
        self.assertAlmostEqual(float(ys.max()), 0.05, places=6)  # world-oriented flat card stays flat

    def test_hide_removes_faces(self):
        spec = copy.deepcopy(MINI)
        spec["parts"][0]["hide"] = ["back", "bottom"]
        names = [f.name for f in build_model(spec).instances[0].faces]
        self.assertNotIn("back", names)
        self.assertNotIn("bottom", names)


class TestPainting(unittest.TestCase):
    def test_strict_palette(self):
        """Every opaque texel must be a palette colour (stamps here use palette refs)."""
        for path in EXAMPLES:
            m = build_model(path)
            pal = {c for r in m.palette.ramps.values() for c in r}
            opaque = m.atlas[..., 3] > 127
            used = {tuple(int(v) for v in c) for c in m.atlas[..., :3][opaque].reshape(-1, 3)}
            self.assertTrue(used <= pal, f"{os.path.basename(path)}: off-palette {list(used - pal)[:5]}")

    def test_seed_stable_by_layer_id(self):
        spec = load_spec(MINI)
        a = build_model(spec).atlas
        spec2 = copy.deepcopy(spec)
        # inserting an unrelated layer before the spots must not move them
        spec2["parts"][0]["paint"]["layers"].insert(0, {"id": "x", "op": "gradient", "amount": 0.0})
        b = build_model(spec2).atlas
        np.testing.assert_array_equal(a, b)

    def test_style_layer_patch_by_id(self):
        spec = {"styles": {"s": {"layers": [{"id": "dots", "op": "spots", "count": 1, "ramp": "b"}]}},
                "palette": MINI["palette"]}
        part = {"id": "p", "style": "s", "paint": {"layers": [{"id": "dots", "count": 7}]}}
        layers = resolve_paint(spec, part)["layers"]
        self.assertEqual(len(layers), 1)
        self.assertEqual(layers[0]["count"], 7)
        self.assertEqual(layers[0]["ramp"], "b")

    def test_card_alpha(self):
        m = build_model(MINI)
        toe = [i for i in m.instances if i.id == "toe"][0]
        f = toe.faces[0]
        x, y = f.rect
        alpha = m.atlas[y:y + f.H, x:x + f.W, 3]
        self.assertEqual((alpha == 0).sum(), 1 * (f.W // 3) * (f.H // 2))  # the single '.' cell

    def test_ramp_generator(self):
        r = make_ramp("#e2701a", 7)
        self.assertEqual(len(r), 7)
        lum = [sum(parse_hex(c)) for c in r]
        self.assertEqual(lum, sorted(lum), "ramp must run dark -> light")


class TestExport(unittest.TestCase):
    def test_glb_structure(self):
        m = build_model(SALAMANDER)
        data = glb_bytes(m)
        magic, version, length, jtype, btype, js, blen = parse_glb(data)
        self.assertEqual((magic, version, length), (0x46546C67, 2, len(data)))
        self.assertEqual((jtype, btype), (0x4E4F534A, 0x004E4942))
        self.assertEqual(js["samplers"][0]["magFilter"], 9728)
        self.assertIn("KHR_materials_unlit", js["extensionsUsed"])
        tris = 0
        for mesh in js["meshes"]:
            for p in mesh["primitives"]:
                tris += js["accessors"][p["indices"]]["count"] // 3
        self.assertEqual(tris, m.report()["triangles"])
        for bv in js["bufferViews"]:
            self.assertLessEqual(bv["byteOffset"] + bv["byteLength"], blen)
        roots = js["scenes"][0]["nodes"]
        self.assertEqual([js["nodes"][i]["name"] for i in roots], ["chest"])

    def test_examples_are_clean(self):
        for path in EXAMPLES:
            spec = load_spec(path)
            errors, warnings = validate(spec)
            self.assertEqual(errors, [], path)
            rep = build_model(spec).report()
            self.assertEqual(rep["warnings"], [], f"{os.path.basename(path)}: {rep['warnings']}")
            self.assertLessEqual(rep["triangles"], spec.get("budget", {}).get("tris", 10 ** 9))

    def test_render_and_cli(self):
        from lowpix.cli import main
        img = render(build_model(MINI), 160, 120)
        arr = np.asarray(img)
        self.assertGreater(len(np.unique(arr.reshape(-1, 3), axis=0)), 4, "render looks empty")
        with tempfile.TemporaryDirectory() as td:
            with redirect_stdout(io.StringIO()):
                rc = main(["build", SALAMANDER, "-o", td])
            self.assertEqual(rc, 0)
            for ext in (".glb", ".obj", ".mtl", ".bbmodel", "_texture.png", "_sheet.png", "_hero.png", "_report.json"):
                self.assertTrue(os.path.exists(os.path.join(td, "ember_salamander" + ext)), ext)


class TestValidation(unittest.TestCase):
    def test_errors_are_specific(self):
        bad = copy.deepcopy(MINI)
        bad["parts"][0]["paint"]["ramp"] = "nope"
        bad["parts"][1]["parent"] = "ghost"
        bad["parts"][2]["paint"]["stamps"][0]["art"] = ["wz"]
        errors, _ = validate(load_spec(bad))
        joined = "\n".join(errors)
        self.assertIn("unknown ramp 'nope'", joined)
        self.assertIn("parent 'ghost' does not exist", joined)
        self.assertIn("chars ['z'] missing from key", joined)
        with self.assertRaises(SpecError):
            build_model(bad)


class TestMCP(unittest.TestCase):
    def test_protocol(self):
        from lowpix.mcp_server import handle
        r = handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}})
        self.assertEqual(r["result"]["serverInfo"]["name"], "lowpix")
        r = handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        self.assertIn("lowpix_build", [t["name"] for t in r["result"]["tools"]])
        r = handle({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                    "params": {"name": "lowpix_render", "arguments": {"spec": MINI, "width": 120, "height": 90}}})
        self.assertFalse(r["result"]["isError"])
        self.assertEqual(r["result"]["content"][0]["type"], "image")
        self.assertIsNone(handle({"jsonrpc": "2.0", "method": "notifications/initialized"}))


if __name__ == "__main__":
    unittest.main()
