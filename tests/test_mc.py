"""Minecraft export: box-UV texture layout, coordinate mapping, baked clips, files written into a mod."""
import json
import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lowpix import mc  # noqa: E402
from lowpix.model import build_model  # noqa: E402

FACE_COLOURS = {"front": "#ff0000", "back": "#00ff00", "left": "#0000ff", "right": "#ffff00",
                "top": "#ff00ff", "bottom": "#00ffff"}


def spec():
    """One 4x6x2 box whose six faces are flat, distinct colours, plus a child box and a clip."""
    ramps = {k: [v] for k, v in FACE_COLOURS.items()}
    stamps = []
    return {
        "name": "Test Block", "density": 1, "light": {"strength": 0, "gradient": 0, "ao": 0},
        "minecraft": {"fps": 10},
        "palette": {"ramps": ramps},
        "parts": [
            {"id": "body", "shape": "box", "size": [4, 6, 2], "pivot": [0, 3, 0],
             "paint": {"ramp": "front", "tone": 0, "light": 0, "dither": 0,
                       "layers": [{"id": f, "op": "fill", "ramp": f, "tone": 0, "faces": [f]} for f in FACE_COLOURS]}},
            {"id": "arm", "shape": "box", "size": [2, 2, 2], "parent": "body", "pivot": [3, 2, 0], "paint": {"ramp": "top"}},
        ],
        "animations": {"wave": {"length": 1.0, "loop": True, "tracks": [
            {"part": "arm", "axis": "z", "osc": {"amp": 30, "cycles": 1}}]}},
        "_stamps": stamps,
    }


class TestMcExport(unittest.TestCase):
    def setUp(self):
        self.model = build_model(spec())
        self.mc = mc.from_model(self.model, fps=10)

    def test_parts_and_coordinates(self):
        names = [p.name for p in self.mc.parts]
        self.assertEqual(names, ["body", "arm"])
        body = self.mc.parts[0]
        # lowpix pivot (0, 3, 0) -> Minecraft (0, 24 - 3, -0)
        np.testing.assert_allclose(body.offset, [0, 21, 0], atol=1e-6)
        lo, hi = body.cube
        np.testing.assert_allclose(hi - lo, [4, 6, 2], atol=1e-6)

    def test_box_uv_faces_get_the_right_colours(self):
        tex = np.array(self.mc.texture)
        body = self.mc.parts[0]
        u, v = body.uv
        w, h, d = 4, 6, 2
        # Minecraft box UV: north (front, -Z in model space) at (u+d, v+d), up-face polygon is the model's bottom ...
        expect = {"north": "front", "south": "back", "down": "top", "up": "bottom", "west": "left", "east": "right"}   # lowpix "left" is the -X face
        for face, (rx, ry, rw, rh) in mc.box_regions(w, h, d).items():
            px = tex[v + ry + rh // 2, u + rx + rw // 2, :3]
            hexc = "#%02x%02x%02x" % tuple(px)
            self.assertEqual(hexc, FACE_COLOURS[expect[face]], f"{face} face should be {expect[face]}")

    def test_clip_is_baked_in_minecraft_axes(self):
        clip = self.mc.clips["wave"]
        rot = clip["bones"]["arm"]["rotation"]
        self.assertEqual(len(rot), 11)                       # 10 fps over 1 s, both ends
        zs = [k[3] for k in rot]
        self.assertAlmostEqual(max(abs(z) for z in zs), 30, delta=2.0)   # samples straddle the peak
        # a lowpix +Z rotation is a Minecraft -Z rotation (the axis flip is a rotation about X)
        quarter = rot[len(rot) // 4]
        self.assertLess(quarter[3], 0)

    def test_export_writes_a_mod(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "spec.json")
            with open(path, "w") as fh:
                json.dump(spec(), fh)
            s = mc.export(path, d, "testmod", "com.example.testmod.client")
            java = os.path.join(d, "src/main/java/com/example/testmod/client")
            self.assertTrue(os.path.exists(os.path.join(java, "TestBlockModel.java")))
            for f in ("LowpixAnimations.java", "LowpixGeometry.java", "LowpixEntityModel.java"):
                src = open(os.path.join(java, f)).read()
                self.assertIn("package com.example.testmod.client;", src)
            res = os.path.join(d, "src/main/resources/assets/testmod")
            geo = json.load(open(os.path.join(res, "lowpix/test_block.geo.json")))
            self.assertEqual([p["name"] for p in geo["parts"]], ["body", "arm"])
            self.assertTrue(os.path.exists(os.path.join(res, "textures/entity/test_block.png")))
            self.assertEqual(s["warnings"], [])



class TestCards(unittest.TestCase):
    """Cards (fur tufts, whiskers, spikes) export as zero-thickness cubes with their alpha-cut art on one face."""

    def test_card_exports_as_a_flat_cube(self):
        spec = {"name": "cards", "density": 1, "minecraft": {"fps": 12},
                "palette": {"ramps": {"fur": ["#3b3f4a", "#5e6472", "#8e95a3", "#c9cfd8", "#eef2f6"]}},
                "styles": {"fur": {"ramp": "fur", "tone": 3}},
                "parts": [{"id": "body", "shape": "box", "size": [8, 6, 12], "pivot": [0, 6, 0], "style": "fur"},
                          {"id": "tuft", "parent": "body", "shape": "card", "plane": "yz", "pivot": [0, 3, 0],
                           "offset": [0, 2, 0], "art": ["..t.t...", ".tt.tt.t", "tttttttt", "tttttttt"],
                           "paint": {"ramp": "fur", "art_key": {"t": "fur:3"}}}]}
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "cards.json")
            with open(path, "w") as fh:
                json.dump(spec, fh)
            m = mc.from_model(build_model(path))
        tuft = next(p for p in m.parts if p.name == "tuft")
        lo, hi = tuft.cube
        self.assertAlmostEqual(float(hi[0] - lo[0]), 0.0)          # flat in x (a yz card)
        self.assertEqual([float(v) for v in hi[1:] - lo[1:]], [4.0, 8.0])
        tex = np.asarray(m.texture)
        u, v = tuft.uv
        east = tex[v + 8:v + 12, u + 8:u + 16]                     # box-UV east face of a (0, 4, 8) cube
        self.assertEqual(int((east[..., 3] > 0).sum()), 23)         # exactly the art's opaque texels
        self.assertEqual(int(east[0, 0, 3]), 0)                     # alpha cut-out kept


class TestTrackAxis(unittest.TestCase):
    def test_track_level_axis_applies_to_osc_and_wave(self):
        s = spec()
        s["animations"]["wave"]["tracks"] = [
            {"part": "arm", "axis": "z", "osc": {"amp": 30, "cycles": 1}},
            {"parts": ["body"], "axis": "y", "wave": {"amp": 10, "cycles": 1}}]
        pose = build_model(s).animator().pose("wave", 0.25)
        np.testing.assert_allclose(pose["arm"][0], [0, 0, 30], atol=1e-6)
        np.testing.assert_allclose(pose["body"][0], [0, 10, 0], atol=1e-6)


if __name__ == "__main__":
    unittest.main()
