"""2D sprites, the brush engine and photo-bashing."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from lowpix import brush, sprite_gen as G  # noqa: E402
from lowpix.palette import parse_hex  # noqa: E402
from lowpix.photo import load_photo, stylise  # noqa: E402
from lowpix.sprite import _material, render_sprite  # noqa: E402

ROCK = os.path.join(ROOT, "assets", "photos", "rock_face_03")


def _colours(img):
    a = np.asarray(img)
    return {tuple(int(v) for v in p[:3]) for p in a.reshape(-1, 4) if p[3] > 0}


class TestGenerators(unittest.TestCase):
    CASES = [("fish", dict(size=(64, 32))), ("sword", dict(size=64)), ("gem", dict(size=32)), ("ore", dict(size=32)),
             ("potion", dict(size=32))]

    def test_every_generator_renders_and_is_seeded(self):
        for name, kw in self.CASES:
            with self.subTest(name):
                a = render_sprite(G.GENERATORS[name](3, **kw), 3)
                b = render_sprite(G.GENERATORS[name](3, **kw), 3)
                size = kw["size"] if isinstance(kw["size"], tuple) else (kw["size"], kw["size"])
                self.assertEqual(a.size, tuple(size))
                self.assertEqual(a.tobytes(), b.tobytes(), "same seed must give the same sprite")
                cover = (np.asarray(a)[..., 3] > 0).mean()
                self.assertGreater(cover, 0.08, f"{name} is nearly empty")

    def test_all_species_themes_cuts_kinds(self):
        for sp in G.FISH_SPECIES:
            render_sprite(G.fish(1, (64, 32), species=sp))
        for th in G.SWORD_THEMES:
            render_sprite(G.sword(1, 48, theme=th))
        for c in G.GEM_CUTS:
            render_sprite(G.gem(1, 24, cut=c))
        for k in ("ore", "crystal", "nugget", "ingot", "chunk"):
            render_sprite(G.ore(1, 32, kind=k, colour="ruby"))
        for s in ("round", "flask", "vial", "bottle"):
            render_sprite(G.potion(1, 32, shape=s))

    def test_strokes_mode_stays_on_palette(self):
        for name, kw in self.CASES:
            with self.subTest(name):
                spec = G.GENERATORS[name](5, **kw)
                spec["effects"] = {}
                allowed = {tuple(c) for m in spec["materials"].items() for c in _material(*m)["cols"].tolist()}
                allowed |= {tuple(parse_hex("#0e0b16")), (255, 255, 255)}
                extra = _colours(render_sprite(spec, 5)) - allowed
                self.assertFalse(extra, f"{name}: off-palette colours {sorted(extra)[:5]}")

    def test_outlines_are_curves_not_primitives(self):
        spec = G.fish(2, (64, 32), species="trout")
        body = next(s for s in spec["shapes"] if s.get("part") == "body" and s["type"] == "polygon")
        self.assertGreater(len(body["points"]), 40, "the fish body should be a dense hand-drawn curve")

    def test_painted_mode_is_antialiased(self):
        spec = G.gem(1, 32, cut="round")
        spec["paint"] = "painted"
        spec["supersample"] = 2
        a = np.asarray(render_sprite(spec, 1))[..., 3]
        self.assertTrue(((a > 0) & (a < 255)).any(), "painted edges should have partial alpha")


class TestBrush(unittest.TestCase):
    def test_quantise_range_and_strokes(self):
        rng = np.random.default_rng(0)
        H, W = 40, 40
        yy, xx = np.mgrid[0:H, 0:W]
        T = xx / W * 6
        F = np.zeros((H, W, 2))
        F[..., 1] = 1  # strokes run vertically, across the gradient
        lab = np.zeros((H, W), np.int64)
        idx = brush.quantise(T, lab, F, rng, 0, 6, length=6, rough=0.8)
        self.assertGreaterEqual(int(idx.min()), 0)
        self.assertLessEqual(int(idx.max()), 6)
        plain = np.clip(np.floor(T + 0.5), 0, 6)
        self.assertGreater((idx != plain).mean(), 0.02, "strokes should break up the clean bands")

    def test_lic_respects_labels(self):
        H, W = 20, 20
        f = np.zeros((H, W))
        f[:, 10:] = 1
        lab = (np.arange(W)[None, :] >= 10).astype(np.int64).repeat(H, 0)
        F = np.zeros((H, W, 2))
        F[..., 0] = 1  # flow crosses the label boundary
        out = brush.lic(f, F, lab, 10)
        self.assertTrue(np.allclose(out[:, :10], 0) and np.allclose(out[:, 10:], 1), "strokes must not bleed")


@unittest.skipUnless(os.path.isdir(ROCK), "bundled photo missing")
class TestPhoto(unittest.TestCase):
    def test_styles(self):
        p = load_photo(ROCK)
        for style, size in (("realistic", 64), ("painted", 64), ("pixel-hd", 48), ("pixel", 32)):
            with self.subTest(style):
                im = stylise(p, style, size)
                self.assertEqual(im.size, (size, size))
        n = len({tuple(c) for c in np.asarray(stylise(p, "pixel", 32)).reshape(-1, 3)})
        self.assertLessEqual(n, 16, "pixel style should use a small palette")

    def test_sprite_material_photo(self):
        spec = G.ore(2, 32, kind="ore")
        spec["materials"]["rock"]["photo"] = {"src": ROCK, "scale": 24, "amount": 1.0}
        render_sprite(spec, 2)


class TestCLI(unittest.TestCase):
    def test_sprite_command_writes_png_and_spec(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "f.png")
            r = subprocess.run([sys.executable, "-m", "lowpix", "sprite", "fish", "--param", "species=koi",
                                "--size", "64x32", "-o", out, "--scale", "2"], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue(os.path.exists(out) and os.path.exists(os.path.join(d, "f_x2.png")))
            with open(os.path.join(d, "f.json")) as fh:
                self.assertEqual(json.load(fh)["meta"]["species"], "koi")
            spec_out = os.path.join(d, "g.png")
            r = subprocess.run([sys.executable, "-m", "lowpix", "sprite", os.path.join(d, "f.json"), "-o", spec_out],
                               cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
