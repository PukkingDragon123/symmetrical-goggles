"""API tokens and the Sketchfab guards (offline: network calls are stubbed)."""
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lowpix import sketchfab, tokens  # noqa: E402


class TestTokens(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {"LOWPIX_CONFIG": self.tmp.name}, clear=False)
        self.env.start()
        for v in ("LOWPIX_SKETCHFAB_TOKEN", "SKETCHFAB_API_TOKEN", "SKETCHFAB_TOKEN"):
            os.environ.pop(v, None)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_file_store_is_private_and_masked(self):
        path = tokens.set_token("sketchfab", "abcdef123456\n")
        self.assertEqual(tokens.get_token("sketchfab"), "abcdef123456")
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
        self.assertNotIn("abcdef123456", json.dumps(tokens.status()))
        self.assertTrue(tokens.remove_token("sketchfab"))
        self.assertIsNone(tokens.get_token("sketchfab"))

    def test_env_wins(self):
        tokens.set_token("sketchfab", "from-file-xyz")
        with mock.patch.dict(os.environ, {"SKETCHFAB_API_TOKEN": "from-env-123"}):
            self.assertEqual(tokens.get_token("sketchfab"), "from-env-123")


class TestSketchfabGuards(unittest.TestCase):
    def _meta(self, **kw):
        m = {"name": "Thing", "isDownloadable": True, "license": {"label": "CC Attribution"}, "tags": [],
             "user": {"username": "someone"}}
        m.update(kw)
        return m

    def test_licence_labels(self):
        self.assertEqual(sketchfab._licence_slug(self._meta()), "by")
        self.assertEqual(sketchfab._licence_slug(self._meta(license={"slug": "cc0"})), "cc0")
        self.assertEqual(sketchfab._licence_slug(self._meta(license={"label": "Standard"})), "standard")

    def _fetch_with(self, meta):
        def fake_open(url, token=None, data=None):
            return io.BytesIO(json.dumps(meta).encode())
        with mock.patch.object(sketchfab, "_open", fake_open), tempfile.TemporaryDirectory() as d:
            return sketchfab.fetch("uid123", d)

    def test_refuses_noai(self):
        with self.assertRaises(PermissionError):
            self._fetch_with(self._meta(tags=[{"name": "noai"}]))

    def test_refuses_non_downloadable_and_non_cc(self):
        with self.assertRaises(PermissionError):
            self._fetch_with(self._meta(isDownloadable=False))
        with self.assertRaises(PermissionError):
            self._fetch_with(self._meta(license={"label": "Standard"}))

    def test_search_hides_opted_out(self):
        res = {"results": [dict(self._meta(), uid="a"), dict(self._meta(tags=[{"name": "NoAI"}]), uid="b")]}
        with mock.patch.object(sketchfab, "_open", lambda *a, **k: io.BytesIO(json.dumps(res).encode())):
            self.assertEqual([m["uid"] for m in sketchfab.search("x")], ["a"])


if __name__ == "__main__":
    unittest.main()
