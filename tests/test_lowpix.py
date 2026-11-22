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

    def test_mirrored_wedge_keeps_its_real_triangle(self):
        spec = {"palette": {"ramps": {"a": ["#000000", "#ffffff"]}},
                "parts": [{"id": "w", "shape": "taper", "size": [2, 2, 6], "pivot": [3, 2, 0], "front_scale": [0, 0],
                           "mirror": True, "paint": {"ramp": "a"}}]}
        m = build_model(spec)
        for inst in m.instances:
            for f in inst.faces:
                self.assertGreater(np.linalg.norm(f.normal), 0.5, f"{inst.id}.{f.name} lost its triangle")
        a, b = m.instances
        self.assertAlmostEqual(sum(f.area() for f in a.faces), sum(f.area() for f in b.faces), places=6)

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
        self.assertEqual([js["nodes"][i]["name"] for i in roots], ["body_0"])
        # animations: every channel targets a real node, input/output counts agree
        self.assertEqual(sorted(a["name"] for a in js["animations"]), ["idle", "walk"])
        for a in js["animations"]:
            for ch in a["channels"]:
                smp = a["samplers"][ch["sampler"]]
                self.assertLess(ch["target"]["node"], len(js["nodes"]))
                self.assertEqual(js["accessors"][smp["input"]]["count"], js["accessors"][smp["output"]]["count"])

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


LOFTY = {
    "name": "lofty", "density": 2,
    "palette": {"ramps": {"a": {"base": "#55447a", "steps": 6}, "b": ["#331100", "#aa5500", "#ffcc66"],
                          "m": {"base": "#7a8088", "steps": 5}}},
    "parts": [
        {"id": "body", "shape": "loft", "profile": {"sides": 8, "round": 2.5}, "subdiv": 1,
         "rings": [{"at": [0, 4, 8], "size": [5, 4]}, {"at": [0, 4, 0], "size": [7, 5]}, {"at": [0, 3.5, -8], "size": [3, 2.5]}],
         "paint": {"ramp": "a", "layers": [
             {"id": "st", "op": "stripes", "axis": "path", "period": 3, "width": 0.3, "ramp": "b", "bevel": True},
             {"id": "sp", "op": "spots", "count": 5, "ramp": "b", "where": {"around": [0.8, 0.2]}, "taper": True}]}},
        {"id": "leg", "parent": "body", "shape": "loft", "attach": {"t": 0.5, "around": 0.3, "align": "none"}, "mirror": True,
         "profile": {"sides": 6}, "subdiv": 0, "rings": [{"at": [0, 0, 0], "size": 2}, {"at": [3, -3, 0], "size": 1.6}],
         "paint": {"ramp": "a"}},
        {"id": "fin", "parent": "body", "shape": "card", "plane": "yz", "attach": {"t": 0.4, "around": 0.0}, "art": ["#", "#"],
         "paint": {"ramp": "b"}},
        {"id": "crate", "shape": "box", "chamfer": 1.0, "size": [6, 5, 6], "pivot": [-10, 2.5, 0],
         "paint": {"ramp": "m", "layers": [
             {"op": "panel", "inset": 2}, {"op": "rivets", "inset": 1}, {"op": "wear", "width": 2, "ramp": "b"},
             {"op": "grille", "rect": [0.2, 0.3, 0.8, 0.7], "faces": ["front"]},
             {"op": "rect", "rect": [0.1, 0.1, 0.9, 0.3], "ramp": "b", "faces": ["right"], "bevel": True}]}},
    ],
}


class TestLoftsAndHardSurface(unittest.TestCase):
    def setUp(self):
        self.m = build_model(LOFTY)
        self.by = {i.id: i for i in self.m.instances}

    def test_loft_faces_point_outward(self):
        from lowpix.geometry import loft_frames
        info = loft_frames(LOFTY["parts"][0])
        for f in self.by["body"].faces:
            fc = f.pts.mean(axis=0)
            centre = info["C"][np.argmin(np.linalg.norm(info["C"] - fc, axis=1))]
            if f.kind == "poly":
                continue
            self.assertGreater(np.dot(f.normal, fc - centre), 0, f.name)

    def test_loft_path_attribute_runs_along_the_body(self):
        f = [f for f in self.by["body"].faces if f.name == "s0_0"][0]
        g = [f for f in self.by["body"].faces if f.name == "s3_0"][0]
        self.assertLess(f.attrs["path"][:, 0].max(), g.attrs["path"][:, 0].min() + 1e-9)

    def test_attach_mirror_on_symmetric_parent_is_reflection(self):
        a = np.concatenate([transform_points(self.by["leg"].world, f.pts) for f in self.by["leg"].faces])
        b = np.concatenate([transform_points(self.by["leg_mirror"].world, f.pts) for f in self.by["leg_mirror"].faces])
        a = {tuple(np.round(p * [-1, 1, 1], 3)) for p in a}
        b = {tuple(np.round(p, 3)) for p in b}
        self.assertEqual(a, b)
        self.assertGreater(self.by["leg"].world[0, 3], 0, "around 0.3 should sit on the +X side")

    def test_attach_sits_on_surface(self):
        fin = self.by["fin"].world[:3, 3]
        self.assertAlmostEqual(float(fin[1]), 4.0 + 5 / 2, delta=0.35)  # top of the middle ring

    def test_chamfered_box_topology(self):
        names = sorted(f.name for f in self.by["crate"].faces)
        self.assertEqual(names, sorted(["front", "back", "top", "bottom", "left", "right",
                                        "bevel_tl", "bevel_tr", "bevel_bl", "bevel_br"]))
        c = np.concatenate([f.pts for f in self.by["crate"].faces]).mean(axis=0)
        for f in self.by["crate"].faces:
            self.assertGreater(np.dot(f.normal, f.pts.mean(axis=0) - c), 0, f.name)

    def test_hard_surface_ops_stay_in_palette(self):
        pal = {c for r in self.m.palette.ramps.values() for c in r}
        opaque = self.m.atlas[..., 3] > 127
        used = {tuple(int(v) for v in c) for c in self.m.atlas[..., :3][opaque].reshape(-1, 3)}
        self.assertTrue(used <= pal)

    def test_attach_requires_loft_parent(self):
        bad = copy.deepcopy(LOFTY)
        bad["parts"][2]["parent"] = "crate"
        errors, _ = validate(load_spec(bad))
        self.assertTrue(any("attach needs a parent with shape 'loft'" in e for e in errors), errors)


class TestAnimation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = build_model(SALAMANDER)
        cls.anim = cls.m.animator()

    def test_loops_are_seamless(self):
        for clip in self.anim.names():
            length, loop, _ = self.anim.clip(clip)
            a = self.anim.world_matrices(clip, 0.0)
            b = self.anim.world_matrices(clip, length - 1e-6)
            for k in a:
                np.testing.assert_allclose(a[k], b[k], atol=2e-3, err_msg=f"{clip}:{k}")

    def test_chain_rest_pose_matches_unsplit_loft(self):
        spec = load_spec(SALAMANDER)
        plain = copy.deepcopy(spec)
        for p in plain["parts"]:
            if p["id"] == "body":
                p.pop("chain")
        plain.pop("animations")
        mc, mp = self.m, build_model(plain)
        side = lambda m: {tuple(np.round(p, 3)) for i in m.instances if i.src_id == "body"  # noqa: E731
                          for f in i.faces if "joints" not in f.tags for p in transform_points(i.world, f.pts)}
        self.assertEqual(side(mc), side(mp))

    def test_mirror_phase_offsets_mirrored_leg(self):
        length, _, _ = self.anim.clip("walk")
        t = 0.3
        a = self.anim.pose("walk", t)["front_leg"][0]
        b = self.anim.pose("walk", t + length / 2)["front_leg_mirror"][0]
        np.testing.assert_allclose(a * [1, -1, -1], b, atol=1e-6)

    def test_rest_pose_is_untouched_without_clip(self):
        w = self.anim.world_matrices(None)
        for inst in self.m.instances:
            np.testing.assert_allclose(w[inst.id], inst.world, atol=1e-9)

    def test_bad_track_is_reported(self):
        spec = load_spec(SALAMANDER)
        spec["animations"]["idle"]["tracks"].append({"part": "wing", "osc": {"amp": 3}})
        spec["animations"]["idle"]["tracks"].append({"part": "head"})
        errors, _ = validate(spec)
        self.assertTrue(any("unknown part 'wing'" in e for e in errors), errors)
        self.assertTrue(any("exactly one of keys / osc / wave" in e for e in errors), errors)


class TestEngineFixes(unittest.TestCase):
    """Features added from the modelling agents' reports."""

    def test_bone_off_layers_and_multi_face_stamps(self):
        spec = copy.deepcopy(MINI)
        spec["styles"] = {"s": {"layers": [{"id": "dots", "op": "spots", "count": 4, "ramp": "b"}]}}
        spec["parts"][0]["style"] = "s"
        spec["parts"][0]["paint"]["layers"] = [{"id": "dots", "off": True}]
        spec["parts"][0]["paint"]["stamps"] = [{"faces": ["sides"], "art": ["w"], "key": {"w": "#ffffff"}}]
        spec["parts"].append({"id": "pivot_only", "parent": "body", "shape": "bone", "pivot": [0, 1, 0]})
        m = build_model(spec)
        by = {i.id: i for i in m.instances}
        self.assertEqual(by["pivot_only"].faces, [])
        white = 0
        for f in by["body"].faces:
            x, y = f.rect
            img = m.atlas[y:y + f.H, x:x + f.W, :3]
            white += int(((img == 255).all(-1)).any())
        self.assertEqual(white, 4, "the stamp lands once on each of the four side faces")
        b_cols = {tuple(c) for c in m.palette.ramps["b"]}
        for f in by["body"].faces:  # the inherited spots layer is switched off
            x, y = f.rect
            cols = {tuple(int(v) for v in c) for c in m.atlas[y:y + f.H, x:x + f.W, :3].reshape(-1, 3)}
            self.assertFalse(cols & b_cols)

    def test_card_flip_on_mirror(self):
        spec = {"palette": {"ramps": {"a": ["#000000", "#808080", "#ffffff"]}},
                "parts": [{"id": "c", "shape": "card", "art": ["#.", "##"], "pivot": [2, 2, 0], "mirror": True,
                           "flip_on_mirror": True, "paint": {"ramp": "a", "light": 0}}]}
        m = build_model(spec)
        a, b = [i for i in m.instances]
        fa, fb = a.faces[0], b.faces[0]
        ma = m.atlas[fa.rect[1]:fa.rect[1] + fa.H, fa.rect[0]:fa.rect[0] + fa.W, 3] > 0
        mb = m.atlas[fb.rect[1]:fb.rect[1] + fb.H, fb.rect[0]:fb.rect[0] + fb.W, 3] > 0
        np.testing.assert_array_equal(ma, mb[:, ::-1])

    def test_looping_keys_lead_in_from_last_key(self):
        from lowpix.anim import eval_keys
        v = eval_keys([[1.0, 10], [3.0, 20]], 0.0, 4.0, True, "linear", "x")
        self.assertAlmostEqual(float(v[0]), 15.0, places=6)  # halfway from 20 (at t=3) back to 10 (at t=5)
        from lowpix.anim import _ease
        self.assertLess(_ease(0.2, "in_back"), 0)  # anticipation dips below the start

    def test_lint_flags_clips_that_sink(self):
        spec = copy.deepcopy(MINI)
        spec["animations"] = {"dip": {"length": 1.0, "tracks": [
            {"part": "body", "channel": "position", "osc": {"axis": "y", "amp": 3}}]}}
        rep = build_model(spec).report()
        self.assertTrue(any("clip 'dip' sinks below the ground" in w for w in rep["warnings"]), rep["warnings"])
        spec["animations"]["dip"]["grounded"] = False      # burrowing (or flying) on purpose
        rep = build_model(spec).report()
        self.assertFalse(any("sinks below the ground" in w for w in rep["warnings"]), rep["warnings"])

    def test_cli_size_and_negative_target(self):
        from lowpix.cli import _fix_negative_args, _size
        self.assertEqual(_size("640"), (640, 640))
        self.assertEqual(_size("320x200"), (320, 200))
        self.assertEqual(_fix_negative_args(["render", "--target", "-3,7,8"]), ["render", "--target=-3,7,8"])


class TestConvert(unittest.TestCase):
    """Detailed model -> lowpix style, offline: round-trip a GLB we build ourselves."""

    def test_convert_glb_roundtrip(self):
        from lowpix.convert import convert, load_model
        from lowpix.export import glb_bytes
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "robot.glb")
            with open(src, "wb") as fh:
                fh.write(glb_bytes(build_model(os.path.join(ROOT, "examples", "robot.json"))))
            mesh = load_model(src)
            self.assertGreater(len(mesh.F), 900)
            m = convert(src, tris=300, height=20, ramps=4)
            rep = m.report()
            self.assertLessEqual(rep["triangles"], 330)
            self.assertAlmostEqual(rep["bounds"]["size"][1], 20.0, delta=1.5)
            self.assertAlmostEqual(rep["bounds"]["min"][1], 0.0, delta=0.05)
            pal = {c for r in m.palette.ramps.values() for c in r}
            used = {tuple(int(v) for v in c) for c in m.atlas[..., :3][m.atlas[..., 3] > 127].reshape(-1, 3)}
            self.assertTrue(used <= pal, "converted texture must be strictly in-palette")
            self.assertLessEqual(len(m.palette.names), 4)
            magic, *_ = parse_glb(glb_bytes(m))
            self.assertEqual(magic, 0x46546C67)

    def test_styles(self):
        from lowpix.convert import convert
        from lowpix.export import glb_bytes
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "drake.glb")
            with open(src, "wb") as fh:
                fh.write(glb_bytes(build_model(os.path.join(ROOT, "examples", "geode_drake.json"))))
            hd = convert(src, style="pixel-hd", tris=800, height=16)
            self.assertEqual(hd.material["filter"], "nearest")
            painted = convert(src, style="painted", tris=800, atlas=256, height=16)
            real = convert(src, style="realistic", tris=1200, atlas=256, height=16)
            self.assertFalse(real.material["unlit"])
            self.assertEqual(real.material["filter"], "linear")
            for m in (painted, real):
                self.assertLessEqual(max(m.atlas.shape[:2]), 256)
            _, _, _, _, _, js, _ = parse_glb(glb_bytes(real))
            self.assertNotIn("extensionsUsed", js)                 # lit PBR material
            self.assertEqual(js["samplers"][0]["magFilter"], 9729)  # linear
            # smooth, outward-agreeing normals on every chart
            for f in real.instances[0].faces:
                N = np.sum([np.cross(f.pts[b] - f.pts[a], f.pts[c] - f.pts[a]) for a, b, c in f.tris], axis=0)
                N /= max(np.linalg.norm(N), 1e-12)
                self.assertGreater(float(np.mean(f.attrs["n"] @ N)), 0.4, f.name)

    def test_quadric_decimation_keeps_extent(self):
        from lowpix.convert import cluster_decimate, weld
        m = build_model(os.path.join(ROOT, "examples", "robot.json"))
        tris, _ = m.world_triangles()
        V = tris.reshape(-1, 3)
        F = np.arange(len(V)).reshape(-1, 3)
        Vw, Fw = weld(V, F)
        Vd, Fd = cluster_decimate(Vw, Fw, 400)
        self.assertLessEqual(len(Fd), 440)
        ext_src, ext_dec = np.ptp(Vw, axis=0), np.ptp(Vd, axis=0)
        np.testing.assert_allclose(ext_dec, ext_src, rtol=0.12)  # no big shrinkage

    def test_obj_loader_triangulates_quads(self):
        from lowpix.convert import load_obj
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "q.obj")
            with open(p, "w") as fh:
                fh.write("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nf 1/1 2/2 3/3 4/4\n")
            mesh = load_obj(p)
            self.assertEqual(len(mesh.F), 2)
            self.assertAlmostEqual(float(mesh.UV[0, 1]), 1.0)  # OBJ v flipped to top-left origin


class TestBatch(unittest.TestCase):
    def test_batch_specs_models_and_manifest(self):
        from lowpix.batch import batch, expand_sources
        from lowpix.export import glb_bytes
        with tempfile.TemporaryDirectory() as td:
            glb = os.path.join(td, "bot.glb")
            with open(glb, "wb") as fh:
                fh.write(glb_bytes(build_model(os.path.join(ROOT, "examples", "robot.json"))))
            man = os.path.join(td, "m.json")
            with open(man, "w") as fh:
                json.dump({"defaults": {"style": "pixel", "tris": 300},
                           "items": [{"source": "bot.glb", "name": "Bot Small"},
                                     {"source": "bot.glb", "name": "Bot HD", "style": "pixel-hd", "tris": 500}]}, fh)
            items = expand_sources([man, os.path.join(ROOT, "examples", "glowcap.json")])
            self.assertEqual([i["kind"] for i in items], ["model", "model", "spec"])
            self.assertEqual(items[1]["opts"]["style"], "pixel-hd")
            out = os.path.join(td, "out")
            s = batch([man, os.path.join(ROOT, "examples", "glowcap.json"), os.path.join(td, "missing.glb")],
                      out, jobs=1, log=lambda *_: None)
            self.assertEqual((s["ok"], s["failed"]), (3, 1))   # a bad item doesn't stop the batch
            for f in ("summary.json", "summary.csv", "contact.png", "index.html"):
                self.assertTrue(os.path.exists(os.path.join(out, f)), f)
            names = {r["name"] for r in s["results"] if r["status"] == "ok"}
            self.assertEqual(names, {"Bot Small", "Bot HD", "Glowcap Mushroom"})

    def test_new_from_template(self):
        from lowpix.batch import new_spec
        with tempfile.TemporaryDirectory() as td:
            p = new_spec("critter", "Test Weasel", os.path.join(td, "w.json"))
            spec = load_spec(p)
            self.assertEqual(spec["name"], "Test Weasel")
            self.assertEqual(validate(spec)[0], [])


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
