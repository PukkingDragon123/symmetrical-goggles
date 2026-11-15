"""Palettes and hue-shifted colour ramps.

A *ramp* is an ordered list of colours from darkest (index 0) to lightest.
Painting works in "tone" space: a float index into a ramp. Lighting, rims and
bevels shift the tone; the painter quantises (with ordered dithering) back to a
ramp entry, which is what keeps the texture a strict limited palette.
"""
from __future__ import annotations

import colorsys
import re

import numpy as np

HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$")

WARM_HUE = 60.0 / 360.0   # highlights drift toward yellow
COOL_HUE = 255.0 / 360.0  # shadows drift toward blue/violet


def parse_hex(s: str):
    m = HEX_RE.match(str(s).strip())
    if not m:
        raise ValueError(f"bad colour {s!r} (expected #rrggbb)")
    h = m.group(1)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def to_hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(max(0, min(255, round(c)))) for c in rgb[:3])


def _hue_toward(h: float, target: float, amount: float) -> float:
    d = ((target - h + 0.5) % 1.0) - 0.5  # shortest signed arc
    step = min(abs(d), amount)
    return (h + (step if d >= 0 else -step)) % 1.0


def make_ramp(base: str, steps: int = 5, hue_shift: float = 18.0, sat_shift: float = 0.12,
              spread: float = 0.75, base_index: int | None = None):
    """Build a pixel-art style ramp around `base`.

    Shadows get darker, more saturated and drift toward cool violet; highlights
    get lighter, slightly desaturated and drift toward warm yellow. `hue_shift`
    is the maximum drift in degrees at the ends of the ramp. `spread` (0..1)
    controls how far the ends travel toward black/white.
    """
    steps = max(2, int(steps))
    r, g, b = (c / 255.0 for c in parse_hex(base))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    mid = (steps - 1) / 2.0 if base_index is None else float(base_index)
    out = []
    for i in range(steps):
        if i < mid:
            k = (i - mid) / max(mid, 1e-6)          # -1..0
        elif i > mid:
            k = (i - mid) / max(steps - 1 - mid, 1e-6)  # 0..1
        else:
            k = 0.0
        if k < 0:
            li = l + k * spread * l
            hi = _hue_toward(h, COOL_HUE, abs(k) * hue_shift / 360.0)
            si = min(1.0, s + abs(k) * sat_shift)
        else:
            li = l + k * spread * (1.0 - l)
            hi = _hue_toward(h, WARM_HUE, k * hue_shift / 360.0)
            si = max(0.0, s - k * sat_shift)
        rr, gg, bb = colorsys.hls_to_rgb(hi, max(0.0, min(1.0, li)), max(0.0, min(1.0, si)))
        out.append(to_hex((rr * 255, gg * 255, bb * 255)))
    return out


class Palette:
    """Named ramps + colour lookup helpers."""

    def __init__(self, ramps: dict):
        self.names: list[str] = []
        self.ramps: dict[str, list[tuple]] = {}
        for name, spec in ramps.items():
            if isinstance(spec, dict):
                cols = make_ramp(spec["base"], spec.get("steps", 5), spec.get("hue_shift", 18.0),
                                 spec.get("sat_shift", 0.12), spec.get("spread", 0.75),
                                 spec.get("base_index"))
            else:
                cols = list(spec)
            if not cols:
                raise ValueError(f"ramp {name!r} is empty")
            self.names.append(name)
            self.ramps[name] = [parse_hex(c) for c in cols]
        self.index = {n: i for i, n in enumerate(self.names)}
        lmax = max(len(r) for r in self.ramps.values()) if self.ramps else 1
        self.table = np.zeros((max(1, len(self.names)), lmax, 3), dtype=np.uint8)
        self.lengths = np.ones(max(1, len(self.names)), dtype=np.int64)
        for i, n in enumerate(self.names):
            cols = self.ramps[n]
            self.lengths[i] = len(cols)
            for j in range(lmax):
                self.table[i, j] = cols[min(j, len(cols) - 1)]

    def has(self, name: str) -> bool:
        return name in self.index

    def mid(self, name: str) -> float:
        return (len(self.ramps[name]) - 1) / 2.0

    def resolve(self, ref) -> tuple:
        """'ramp:idx' (negative idx counts from the light end) or '#rrggbb' -> rgb."""
        ref = str(ref).strip()
        if ref.startswith("#"):
            return parse_hex(ref)
        if ":" in ref:
            name, idx = ref.rsplit(":", 1)
            cols = self.ramps[name]
            i = int(idx)
            if i < 0:
                i = len(cols) + i
            return cols[max(0, min(len(cols) - 1, i))]
        cols = self.ramps[ref]
        return cols[len(cols) // 2]

    def as_hex(self) -> dict:
        return {n: [to_hex(c) for c in self.ramps[n]] for n in self.names}
