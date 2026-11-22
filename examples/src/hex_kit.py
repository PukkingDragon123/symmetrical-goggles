"""Shared rig, card-art and animation helpers for the Winterworks Hexes & Havoc models.

Used by piglin_witch.py, golden_piglin.py, elixir_jar.py, soul_tank.py, hexing_table.py and hex_core.py (all in this
folder). The techniques are the ones in frost_mauler.py and pot_golem.py: parts are placed with world or parent-frame
joints, clips are keyed as pose timelines (dicts of per-part offsets that add up), and the root's height is solved per
frame so the feet stay on the ground.

Units are Minecraft pixels (16 per block). lowpix axes: Y up, the model faces +Z, ground at y = 0, "left" is +X.
"""
import json
import math
import os
import random
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


# ======================================================================= rig
def rot_matrix(deg):
    rx, ry, rz = (math.radians(float(a)) for a in deg)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def euler(R):
    """Inverse of rot_matrix: degrees (x, y, z) with R = Rz Ry Rx."""
    ry = math.asin(max(-1.0, min(1.0, -R[2, 0])))
    rx = math.atan2(R[2, 1], R[2, 2])
    rz = math.atan2(R[1, 0], R[0, 0])
    return [round(math.degrees(a), 3) for a in (rx, ry, rz)]


class Rig:
    """Collects parts. A joint goes at `at` (world) or `rel` (in the parent's rotated frame); the box centre at
    `centre` (world) or `offset` (in the part's own rotated frame; default: on the joint). `rot` is local, `wrot` a
    world rotation (converted to local). Box sizes times `density` must be whole texels."""

    def __init__(self, density=1, bone_style=None):
        self.density = density
        self.bone_style = bone_style
        self.P = []
        self.F = {}          # part id -> (world rotation, world pivot)

    def part(self, id, parent, size, style=None, at=None, rel=None, centre=None, offset=None, rot=None, wrot=None,
             shape="box", **kw):
        assert id not in self.F, f"duplicate part {id}"
        Rp, tp = self.F[parent] if parent else (np.eye(3), np.zeros(3))
        if at is None and rel is None and centre is not None:
            at = centre
        if at is None:
            at = tp + Rp @ np.array(rel if rel is not None else (0, 0, 0), float)
        at = np.array(at, float)
        if wrot is not None:
            rot = euler(Rp.T @ rot_matrix(wrot))
        Rw = Rp @ rot_matrix(rot or (0, 0, 0))
        if centre is not None:
            offset = Rw.T @ (np.array(centre, float) - at)
        d = {"id": id, "shape": shape}
        if parent:
            d["parent"] = parent
        if shape == "box":
            for s in size:
                v = s * self.density
                assert abs(v - round(v)) < 1e-9, f"{id}: size {size} x density {self.density} is not whole texels"
            d["size"] = [float(s) if self.density != 1 else int(round(s)) for s in size]
        d["pivot"] = [round(float(v), 4) for v in Rp.T @ (at - tp)]
        if offset is not None and np.abs(offset).max() > 1e-9:
            d["offset"] = [round(float(v), 4) for v in offset]
        if rot is not None and any(abs(float(a)) > 1e-9 for a in rot):
            d["rotation"] = [round(float(a), 3) for a in rot]
        if style:
            d["style"] = style
        d.update(kw)
        self.P.append(d)
        self.F[id] = (Rw, at)
        return d

    def bone(self, id, parent, **kw):
        return self.part(id, parent, None, self.bone_style, shape="bone", **kw)

    def card(self, id, parent, art, style, plane="xy", **kw):
        return self.part(id, parent, None, style, shape="card", plane=plane, art=art, **kw)

    def wpos(self, id, local):
        R, t = self.F[id]
        return t + R @ np.array(local, float)

    def ids(self, prefix):
        return [p["id"] for p in self.P if p["id"].startswith(prefix)]


def M(v, s):
    """Mirror a position across X for side s (+1 left, -1 right)."""
    return (v[0] * s, v[1], v[2])


def MR(r, s):
    """Mirror a rotation across X for side s."""
    return (r[0], r[1] * s, r[2] * s)


# ======================================================================= card art
def tatters(w, h, seed, fill=0.85, min_len=0.25, tip="t", mid="m", body="f", holes=0.0):
    """A ragged hanging hem: strips of random length with frayed, notched ends, darker at the tips."""
    rng = random.Random(seed)
    lens = [0] * w
    x = 0
    while x < w:
        lw = rng.choice((1, 2, 2, 3, 3, 4))
        L = rng.uniform(min_len, 1.0) * h if rng.random() < fill else 1
        for k in range(lw):
            if x + k < w:
                j = 0 if lw < 3 or 0 < k < lw - 1 else rng.choice((0, 1, 1))
                lens[x + k] = max(1, int(round(L)) - j)
        x += lw
    rows = [["."] * w for _ in range(h)]
    for cx, L in enumerate(lens):
        for k in range(L):
            rows[k][cx] = tip if k == L - 1 else (mid if k == L - 2 and L > 2 else body)
    for _ in range(int(holes * w * h)):
        cx, cy = rng.randrange(w), rng.randrange(1, h)
        if rows[cy][cx] == body and cy < lens[cx] - 2:
            rows[cy][cx] = "."
    return ["".join(r) for r in rows]


def drips(w, h, seed, fill=0.7, root="g", body="d", bulb="b", glint="h"):
    """Hanging drips (molten gold, slime): rounded runs of random length with a fat bulb, glossy at the root."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    x = 0
    while x < w:
        dw = rng.choice((1, 2, 2, 3))
        if rng.random() < fill:
            L = max(2, int(round(rng.uniform(0.35, 1.0) * h)))
            for cx in range(x, min(w, x + dw)):
                ln = L - (1 if dw == 3 and cx != x + 1 else 0)
                for k in range(min(ln, h)):
                    rows[k][cx] = root if k == 0 else (bulb if k >= ln - 2 else body)
            if L < h and dw >= 2:
                rows[L][x + dw // 2 if x + dw // 2 < w else x] = bulb
        else:
            for cx in range(x, min(w, x + dw)):
                rows[0][cx] = root
        x += dw
    for cx in range(w):
        col = [rows[k][cx] for k in range(h)]
        if bulb in col and (cx + seed) % 3 == 0:
            rows[col.index(bulb)][cx] = glint
    return ["".join(r) for r in rows]


def spikes(w, h, seed, tip="t", mid="m", body="f"):
    """Standing jagged spines: narrow triangles of random height."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    x = 0
    while x < w:
        sw = rng.choice((2, 3, 3))
        H = int(round(rng.uniform(0.45, 1.0) * h))
        for k in range(H):
            frac = k / max(H - 1, 1)
            half = (sw / 2) * (1 - frac)
            for cx in range(x, min(w, x + sw)):
                if abs(cx - (x + (sw - 1) / 2)) <= half + 0.01:
                    rows[h - 1 - k][cx] = tip if k >= H - 1 else (mid if k >= H - 2 and H > 3 else body)
        x += sw - 1 + rng.choice((0, 1))
    return ["".join(r) for r in rows]


# soul fire: a licking flame, white-hot core (W), cyan body (E), teal edge (e)
FLAME = ["...e....", "..eE..e.", "..EE..E.", ".eEw.eE.", ".EwWEEe.", "eEWWwE..", "eEwWWwEe", ".EwWWwE.",
         ".eEWWEe.", "..eEEe.."]
FLAME_SMALL = ["..e..", ".eE.e", ".EwE.", "eEWwE", "eWWWe", ".eEe."]
# a soul wisp: a little ghost face with a curling tail (eyes and mouth are holes)
WISP = [".eEEe..", "eEwwEe.", "Ew.w.E.", "EwwwwE.", "EWw.wE.", ".EWWEe.", ".eEWE..", "..eEe..", "...eE..",
        "....e.."]
WISP_B = ["..eEe.", ".eWwEe", "eW.w.E", "eWwwwE", ".EW.Ee", ".eEWE.", "..eEe.", "..Ee..", ".eE...", ".e...."]
WISP_C = [".eEe.", "eWwEe", "Ew.wE", "EwWwE", ".EWE.", ".eE..", "..e..", "..e.."]
SOUL_KEY = {"W": "soul:7", "w": "soul:6", "E": "soul:4", "e": "soul:2"}

# an iron chain: alternating link faces and edges
def chain(n, vertical=True):
    links = []
    for k in range(n):
        links += ["cc", "c.", "cc"] if k % 2 == 0 else [".c", ".c"]
    return links if vertical else ["".join(r[i] if i < len(r) else "." for r in links) for i in range(2)]


# ======================================================================= animation
def add(*poses):
    """Sum pose dicts {part: {"r"|"p"|"s": [x, y, z]}} (offsets add up)."""
    out = {}
    for p in poses:
        for k, chans in p.items():
            o = out.setdefault(k, {})
            for ch, v in chans.items():
                o[ch] = [a + b for a, b in zip(o.get(ch, [0, 0, 0]), v)]
    return out


def scale_pose(p, f):
    return {k: {ch: [a * f for a in v] for ch, v in chans.items()} for k, chans in p.items()}


def r(part_, x=0, y=0, z=0):
    return {part_: {"r": [x, y, z]}}


def pos(part_, x=0, y=0, z=0):
    return {part_: {"p": [x, y, z]}}


def sc(part_, x=0, y=0, z=0):
    return {part_: {"s": [x, y, z]}}


def side(base, s, x=0, y=0, z=0):
    """Rotate base_l (s=1) or base_r (s=-1); y and z are mirrored, so the same numbers make a mirrored pose."""
    return {f"{base}_{'l' if s > 0 else 'r'}": {"r": [x, y * s, z * s]}}


def both(base, x=0, y=0, z=0):
    return add(side(base, 1, x, y, z), side(base, -1, x, y, z))


def mirror_pose(p):
    out = {}
    for k, chans in p.items():
        k2 = k[:-2] + "_r" if k.endswith("_l") else k[:-2] + "_l" if k.endswith("_r") else k
        o = {}
        for ch, v in chans.items():
            o[ch] = [v[0], -v[1], -v[2]] if ch == "r" else ([-v[0], v[1], v[2]] if ch == "p" else list(v))
        out[k2] = o
    return out


def timeline(length, keys, loop=False, extra=(), lift=None, lock=True):
    """keys: [(t, pose, ease)]. Every part named in any pose gets a track through every key (0 where a pose doesn't
    name it). `lock`: the root's height is solved later so the feet stay on the ground (plus `lift`)."""
    names = sorted({k for _, p, _ in keys for k in p})
    tracks = []
    for n in names:
        for ch, cname in (("r", "rotation"), ("p", "position"), ("s", "scale")):
            vals = [p.get(n, {}).get(ch, [0, 0, 0]) for _, p, _ in keys]
            if all(abs(v) < 1e-9 for vec in vals for v in vec):
                continue
            ks = []
            for (t, _, ease), v in zip(keys, vals):
                k = [round(t, 4), [round(float(a), 3) for a in v]]
                if ease:
                    k.append(ease)
                ks.append(k)
            tracks.append({"part": n, "channel": cname, "keys": ks})
    clip = {"length": length, "loop": loop, "tracks": tracks + [clamp(tr, length) for tr in extra]}
    if lock:
        clip["_lock"] = {"lift": lift}
    return clip


def clamp(tr, length):
    """Cut a keyed track at the clip's end (ring-outs that would run past it), easing to zero at the end."""
    ks = tr.get("keys")
    if not ks or ks[-1][0] <= length + 1e-9:
        return tr
    zero = [0, 0, 0] if isinstance(ks[0][1], list) else 0
    kept = [k for k in ks if k[0] < length - 0.03]
    return dict(tr, keys=kept + [[round(length, 4), zero]])


def cycle(part_, length, keys, phase=0.0, ch="rotation", ease="smooth"):
    """A looping keyed cycle shifted by `phase` (fraction of the clip). keys: [(u 0..1, [x, y, z])]."""
    ks = sorted(((((u + phase) % 1.0) * length), v) for u, v in keys)
    return {"part": part_, "channel": ch, "keys": [[round(t, 4), [round(float(a), 3) for a in v]] for t, v in ks],
            "ease": ease}


def osc(part_, axis, amp, cycles, phase=0.0, bias=None, ch=None, shape=None):
    o = {"amp": amp, "cycles": cycles, "phase": phase}
    if bias is not None:
        o["bias"] = bias
    if shape:
        o["shape"] = shape
    t = {"part": part_, "osc": o}
    if axis:
        t["axis"] = axis
    if ch:
        t["channel"] = ch
    return t


def wave(parts, axis, amp, cycles, lag=0.12, growth=1.2, phase=0.0, bias=None):
    w = {"axis": axis, "amp": amp, "cycles": cycles, "lag": lag, "growth": growth, "phase": phase}
    if bias is not None:
        w["bias"] = bias
    return {"parts": list(parts), "wave": w}


def keys(part_, axis, ks, ease="smooth", ch=None):
    t = {"part": part_, "keys": [list(k) for k in ks], "ease": ease}
    if axis:
        t["axis"] = axis
    if ch:
        t["channel"] = ch
    return t


def jitter(part_, t0, t1, amp, step=0.05, axis=0, ch="rotation", seed=0):
    """Small alternating keys between t0 and t1 (trembling), zero outside."""
    rng = random.Random(seed)
    ks = [[0.0, [0, 0, 0]], [round(t0, 4), [0, 0, 0]]]
    t, sgn = t0 + step, 1
    while t < t1 - 1e-9:
        v = [0, 0, 0]
        v[axis] = round(sgn * amp * rng.uniform(0.6, 1.0), 3)
        ks.append([round(t, 4), v])
        t += step
        sgn = -sgn
    ks.append([round(t1, 4), [0, 0, 0]])
    return {"part": part_, "channel": ch, "keys": _dedupe(ks), "ease": "ease"}


def ring(part_, t0, amp, freq=8.0, decay=6.0, axis=0, ch="rotation", end=None):
    """A decaying ring-out (jiggle) starting at t0: alternating keys shrinking exponentially."""
    if isinstance(amp, (list, tuple)):
        axis, amp = list(amp), 1.0
    ks = [[0.0, [0, 0, 0]], [round(t0, 4), [0, 0, 0]]]
    n = 0
    t = t0
    while True:
        t = t0 + (n + 1) * 0.5 / freq
        a = amp * math.exp(-decay * (t - t0)) * (1 if n % 2 == 0 else -1)
        if (end is not None and t >= end - 0.02) or abs(a) < abs(amp) * 0.06:
            break
        v = [0, 0, 0]
        if isinstance(axis, int):
            v[axis] = round(a, 3)
        else:
            v = [round(a * c, 3) for c in axis]
        ks.append([round(t, 4), v])
        n += 1
    t = min(t, end) if end is not None else t
    ks.append([round(t, 4), [0, 0, 0]])
    return {"part": part_, "channel": ch, "keys": _dedupe(ks), "ease": "smooth"}


def _dedupe(ks):
    out = []
    for k in ks:
        if out and abs(out[-1][0] - k[0]) < 1e-6:
            out[-1] = k
        else:
            out.append(k)
    return out


def shake(part_, t0, t1, amp, freq=8.0, axis=0, ch="rotation", phase=1.0):
    """An oscillation between t0 and t1 at `freq` Hz whose amplitude swells in and dies away (zero at both ends):
    laughing, shivering, rattling. `amp` is a number (on `axis`) or an [x, y, z] vector."""
    ks = [[0.0, [0, 0, 0]], [round(t0, 4), [0, 0, 0]]]
    n = 1
    while True:
        t = t0 + n * 0.5 / freq
        if t >= t1 - 0.25 / freq:
            break
        u = (t - t0) / (t1 - t0)
        env = math.sin(math.pi * u) ** 0.5
        sgn = phase if n % 2 else -phase
        if isinstance(amp, (list, tuple)):
            v = [round(a * env * sgn, 3) for a in amp]
        else:
            v = [0, 0, 0]
            v[axis] = round(amp * env * sgn, 3)
        ks.append([round(t, 4), v])
        n += 1
    ks.append([round(t1, 4), [0, 0, 0]])
    return {"part": part_, "channel": ch, "keys": _dedupe(ks), "ease": "smooth"}


def spin(part_, length, turns=1.0, axis="y", phase=0.0):
    """A constant-speed turn of `turns` x 360 degrees over the clip (linear keys, so loops are seamless)."""
    n = max(4, int(abs(turns) * 8))
    ks = [[round(length * k / n, 4), round(360.0 * turns * (k / n + phase), 3)] for k in range(n + 1)]
    return {"part": part_, "axis": axis, "keys": ks, "ease": "linear"}


# ======================================================================= ground lock
def ground_lock(spec, root="body", feet=None, step=1 / 60):
    """For every clip marked `_lock`: key the root's height so the lowest point of `feet` (instance ids; default
    every part) sits on the ground, plus the clip's `lift` curve. Horizontal root offsets from the poses are kept."""
    sys.path.insert(0, ROOT)
    from lowpix.anim import Animator, eval_keys
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points

    insts = expand_instances(spec["parts"], float(spec["density"]))
    probe = [i for i in insts if i.faces and (feet is None or i.id in feet)]

    class _M:
        pass

    for name, clip in spec["animations"].items():
        lock = clip.pop("_lock", None)
        if lock is None:
            continue
        length, loop = float(clip["length"]), bool(clip.get("loop", False))
        body_pos = [tr for tr in clip["tracks"] if tr.get("part") == root and tr.get("channel") == "position"]
        others = [tr for tr in clip["tracks"] if tr not in body_pos]
        m = _M()
        m.instances = insts
        n = max(2, int(round(length / step)))
        out = []
        for k in range(n + (0 if loop else 1)):
            t = length * k / n
            bp = np.zeros(3)
            for tr in body_pos:
                bp += eval_keys(tr["keys"], t, length, loop, tr.get("ease", "ease"), tr.get("axis"))
            bp[1] = 0.0
            tracks = others + [{"part": root, "channel": "position", "keys": [[0, list(bp)], [length, list(bp)]],
                                "ease": "linear"}]
            m.spec = {"animations": {"_": {"length": length, "loop": loop, "tracks": tracks}}}
            W = Animator(m).world_matrices("_", t)
            lo = min(float(transform_points(W[i.id], f.pts)[:, 1].min()) for i in probe for f in i.faces)
            lift = float(eval_keys(lock["lift"], t, length, loop, "ease")[0]) if lock.get("lift") else 0.0
            bp[1] = -lo + lift
            out.append([round(t, 4), [round(float(v), 3) for v in bp]])
        # thin the keys: drop samples a straight line through the neighbours reproduces
        thin = [out[0]]
        for a, b in zip(out[1:-1], out[2:]):
            p = thin[-1]
            f = (a[0] - p[0]) / max(b[0] - p[0], 1e-9)
            if max(abs(p[1][i] + (b[1][i] - p[1][i]) * f - a[1][i]) for i in range(3)) > 0.02:
                thin.append(a)
        thin.append(out[-1])
        clip["tracks"] = others + [{"part": root, "channel": "position", "keys": thin, "ease": "linear"}]


def rest_on_ground(P, density, feet=None):
    """Lift the root so the rest pose's lowest point (of `feet`, default every part) sits exactly on y = 0."""
    sys.path.insert(0, ROOT)
    from lowpix.geometry import expand_instances
    from lowpix.mathutil import transform_points
    lo = min(float(transform_points(i.world, f.pts)[:, 1].min()) for i in expand_instances(P, float(density))
             for f in i.faces if feet is None or i.id in feet)
    P[0]["pivot"][1] = round(P[0]["pivot"][1] - lo, 4)
    return lo


def dump(spec, out):
    with open(out, "w") as fh:
        json.dump(spec, fh, indent=1)
    print(out, len(spec["parts"]), "parts")
