"""Rigid-bone animation (Blockbench style): every part instance is a joint at its
pivot. Clips are sums of tracks evaluated on top of the rest pose:

    "animations": {
      "idle": {"length": 2.4, "loop": true, "tracks": [
        {"part": "head", "osc": {"axis": "x", "amp": 4, "cycles": 1, "phase": 0.25}},
        {"part": "tail", "wave": {"axis": "y", "amp": 10, "cycles": 1, "lag": 0.12, "growth": 1.25}},
        {"part": "jaw",  "keys": [[0, [0,0,0]], [0.3, [18,0,0]], [0.9, [0,0,0]]], "ease": "smooth"},
        {"part": "body", "channel": "scale", "osc": {"axis": [0.03, -0.03, 0.03], "cycles": 2}},
        {"part": "front_leg", "osc": {...}, "mirror_phase": 0.5}
      ]}
    }

Channels: "rotation" (degrees, Euler XYZ, applied in the joint's own frame after
its rest rotation), "position" (units, parent frame) and "scale" (multiplier;
oscillator/keys values are offsets from 1). Tracks on the same joint add up
(scale multiplies). A track naming a part also drives its mirrored copy, with
Y/Z rotation and X position mirrored, shifted in time by `mirror_phase`
(a fraction of the clip; 0.5 = opposite legs in a walk). Name an instance id
("leg_mirror", "tail_2") to drive just that joint.
"""
from __future__ import annotations

import math

import numpy as np

from .mathutil import rot_matrix

CHANNELS = ("rotation", "position", "scale")
AXES = {"x": 0, "y": 1, "z": 2}


def _vec3(v, axis=None):
    if isinstance(v, (int, float)):
        out = np.zeros(3)
        out[AXES.get(axis or "x", 0)] = float(v)
        return out
    return np.array([float(x) for x in v], dtype=np.float64)


def _ease(u, mode):
    if mode == "linear":
        return u
    if mode == "step":
        return 0.0
    if mode in ("in", "ease_in"):
        return 1 - math.cos(u * math.pi / 2)
    if mode in ("out", "ease_out"):
        return math.sin(u * math.pi / 2)
    if mode in ("back", "out_back"):  # fast start, overshoot, settle (follow-through)
        c = 1.70158
        return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2
    if mode == "in_back":  # pull back first, then go (anticipation)
        c = 1.70158
        return (c + 1) * u ** 3 - c * u ** 2
    if mode == "inout_back":  # gentle start, anticipation and overshoot
        c = 1.70158 * 1.525
        if u < 0.5:
            return ((2 * u) ** 2 * ((c + 1) * 2 * u - c)) / 2
        return ((2 * u - 2) ** 2 * ((c + 1) * (u * 2 - 2) + c) + 2) / 2
    if mode == "elastic":
        if u in (0.0, 1.0):
            return u
        return 2 ** (-10 * u) * math.sin((u * 10 - 0.75) * (2 * math.pi) / 3) + 1
    return 0.5 - 0.5 * math.cos(u * math.pi)  # "ease"/"inout" (sine)


def eval_keys(keys, t, length, loop, ease="ease", axis=None):
    """Keyframes [[time, value], ...] (optionally [time, value, ease]) -> vec3."""
    ks = [(float(k[0]), _vec3(k[1], axis), k[2] if len(k) > 2 else None) for k in keys]
    ks.sort(key=lambda k: k[0])
    if loop:
        first, last = ks[0], ks[-1]
        if last[0] < length - 1e-9:
            # wrap: after the last key, blend toward the first key one loop later
            ks.append((first[0] + length, first[1], first[2]))
        if first[0] > 1e-9:
            # time before the first key blends in from the last key one loop earlier
            ks.insert(0, (last[0] - length, last[1], last[2]))
    if t <= ks[0][0]:
        return ks[0][1]
    if t >= ks[-1][0]:
        return ks[-1][1]
    for i in range(len(ks) - 1):
        t0, v0, _ = ks[i]
        t1, v1, e1 = ks[i + 1]
        if t0 <= t <= t1:
            u = (t - t0) / max(t1 - t0, 1e-9)
            mode = e1 or ease
            if mode == "smooth":  # Catmull-Rom through neighbouring keys
                vm = ks[i - 1][1] if i > 0 else v0
                vp = ks[i + 2][1] if i + 2 < len(ks) else v1
                u2, u3 = u * u, u * u * u
                return 0.5 * ((2 * v0) + (-vm + v1) * u + (2 * vm - 5 * v0 + 4 * v1 - vp) * u2 + (-vm + 3 * v0 - 3 * v1 + vp) * u3)
            return v0 + (v1 - v0) * _ease(u, mode)
    return ks[-1][1]


def _wave(x, shape):
    s = math.sin(x)
    if shape == "bounce":       # |sin|: hops, footfalls
        return abs(s)
    if shape == "square":       # soft square: snappy holds
        return math.tanh(3 * s) / math.tanh(3)
    if shape == "saw":
        return ((x / (2 * math.pi)) % 1.0) * 2 - 1
    if shape == "pulse":        # quick blip once per cycle (blinks, twitches)
        return max(0.0, math.cos(x)) ** 12
    return s


def eval_osc(o, tau):
    """Oscillator at normalised clip time tau (0..1)."""
    cycles = float(o.get("cycles", 1))
    x = 2 * math.pi * (cycles * tau + float(o.get("phase", 0.0)))
    w = _wave(x, o.get("shape", "sine"))
    axis = o.get("axis", "x")
    amp = o.get("amp", 0.0)
    if isinstance(amp, (list, tuple)):          # per-axis amplitudes
        v = np.array([float(a) for a in amp]) * w
    elif isinstance(axis, str):
        v = _vec3(float(amp) * w, axis)
    else:                                       # arbitrary axis vector
        v = np.array(axis, float) * float(amp) * w
    bias = o.get("bias")
    if bias is not None:
        v = v + (_vec3(bias, axis if isinstance(axis, str) else "x"))
    return v


class Animator:
    def __init__(self, model):
        self.model = model
        self.clips = model.spec.get("animations", {}) or {}
        self.insts = model.instances
        self.by_id = {i.id: i for i in self.insts}
        self.by_src = {}
        for i in self.insts:
            self.by_src.setdefault(i.src_id, []).append(i)

    def names(self):
        return list(self.clips)

    def clip(self, name):
        if name not in self.clips:
            raise ValueError(f"no animation {name!r} (have {list(self.clips)})")
        c = self.clips[name]
        return float(c.get("length", 1.0)), bool(c.get("loop", True)), c.get("tracks", [])

    def _targets(self, track):
        """[(instance, phase_shift_fraction, chain_index, chain_len)]."""
        out = []
        if track.get("parts"):  # explicit list: a hand-made chain (crest cards, feathers)
            names = track["parts"]
            for k, n in enumerate(names):
                for inst, sh, _, _ in self._targets(dict(track, part=n, parts=None)):
                    out.append((inst, sh, k, len(names)))
            return out
        name = track.get("part")
        if name not in self.by_src and name in self.by_id:   # a single joint, e.g. "leg_mirror", "tail_2"
            inst = self.by_id[name]
            return [(inst, 0.0, max(inst.segment, 0), 1)]
        if track.get("only") and name in self.by_id:         # just the un-mirrored copy
            inst = self.by_id[name]
            return [(inst, 0.0, max(inst.segment, 0), 1)]
        insts = self.by_src.get(name, [])
        if not insts:
            raise ValueError(f"animation track targets unknown part {name!r}")
        mp = float(track.get("mirror_phase", 0.0))
        chain = [i for i in insts if i.segment >= 0]
        if chain:
            if "wave" in track or track.get("segments") == "all":
                segs = [i for i in insts]
            else:
                which = int(track.get("segment", 0))
                segs = [i for i in insts if i.segment == which]
            n = 1 + max(i.segment for i in chain)
            return [(i, mp if i.mirrored else 0.0, i.segment, n) for i in segs]
        return [(i, mp if i.mirrored else 0.0, 0, 1) for i in insts]

    def pose(self, name, t):
        """Instance id -> (euler offset deg, position offset, scale) at time t (seconds)."""
        length, loop, tracks = self.clip(name)
        acc = {}
        for tr in tracks:
            if tr.get("off"):
                continue
            ch = tr.get("channel", "rotation")
            for inst, shift, k, n in self._targets(tr):
                tt = t + shift * length
                if loop:
                    tt = tt % length
                tau = tt / length
                if "wave" in tr:
                    w = dict(tr["wave"])
                    if "axis" not in w and "axis" in tr:   # a track-level axis applies to its wave too
                        w["axis"] = tr["axis"]
                    w["phase"] = float(w.get("phase", 0.0)) - k * float(w.get("lag", 0.1))
                    v = eval_osc(w, tau) * float(w.get("growth", 1.0)) ** k
                elif "osc" in tr:
                    o = tr["osc"]
                    if "axis" not in o and "axis" in tr:   # {"axis": "z", "osc": {...}} means a z oscillation
                        o = dict(o, axis=tr["axis"])
                    v = eval_osc(o, tau)
                elif "keys" in tr:
                    v = eval_keys(tr["keys"], tt, length, loop, tr.get("ease", "ease"), tr.get("axis"))
                else:
                    continue
                if inst.mirrored and not tr.get("raw"):
                    if ch == "rotation":
                        v = v * np.array([1, -1, -1])
                    elif ch == "position":
                        v = v * np.array([-1, 1, 1])
                e, p, s = acc.setdefault(inst.id, [np.zeros(3), np.zeros(3), np.ones(3)])
                if ch == "rotation":
                    e += v
                elif ch == "position":
                    p += v
                elif ch == "scale":
                    s *= (1.0 + v)
        return acc

    def local_matrices(self, name, t):
        acc = self.pose(name, t)
        out = {}
        for inst in self.insts:
            M = inst.rest_local.copy()
            if inst.id in acc:
                e, p, s = acc[inst.id]
                R = M[:3, :3] @ rot_matrix(e) @ np.diag(s)
                M[:3, :3] = R
                M[:3, 3] = M[:3, 3] + p
            out[inst.id] = M
        return out

    def world_matrices(self, name=None, t=0.0):
        locs = self.local_matrices(name, t) if name else {i.id: i.rest_local for i in self.insts}
        worlds = {}
        for inst in self.insts:  # parents always precede children
            par = worlds.get(inst.parent) if inst.parent else None
            worlds[inst.id] = (par if par is not None else np.eye(4)) @ locs[inst.id]
        return worlds

    def trs_samples(self, name, fps=30):
        """Baked per-frame (times, {inst_id: (T (f,3), Q (f,4), S (f,3))}) for animated joints."""
        from .mathutil import quat_from_matrix
        length, loop, tracks = self.clip(name)
        n = max(2, int(round(length * fps)) + 1)
        times = np.linspace(0.0, length, n)
        animated = set()
        for tr in tracks:
            for inst, *_ in self._targets(tr):
                animated.add(inst.id)
        data = {i: ([], [], []) for i in animated}
        for t in times:
            # a looping clip's last frame is its first frame, so the loop is seamless
            locs = self.local_matrices(name, 0.0 if (loop and t >= length - 1e-9) else t)
            for iid in animated:
                M = locs[iid]
                Rs = M[:3, :3]
                sc = np.linalg.norm(Rs, axis=0)
                R = Rs / np.where(sc > 1e-12, sc, 1)
                q = np.array(quat_from_matrix(R))
                Q = data[iid][1]
                if Q and np.dot(Q[-1], q) < 0:
                    q = -q
                data[iid][0].append(M[:3, 3].copy())
                Q.append(q)
                data[iid][2].append(sc)
        return times, {k: tuple(np.array(a) for a in v) for k, v in data.items()}

