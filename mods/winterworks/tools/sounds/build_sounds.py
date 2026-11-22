#!/usr/bin/env python3
"""Winterworks sound pipeline: CC0 / public-domain recordings -> game-ready OGG Vorbis files.

Every source (URL, licence, author) and every event recipe lives in recipes.json next to this file.

    python3 mods/winterworks/tools/sounds/build_sounds.py fetch   [--cache DIR]   # download + unpack sources
    python3 mods/winterworks/tools/sounds/build_sounds.py build   [--cache DIR] [--only REGEX] [--sheets DIR]
    python3 mods/winterworks/tools/sounds/build_sounds.py inspect SRC [SRC ...] -o sheet.png  # look at sources
    python3 mods/winterworks/tools/sounds/build_sounds.py sheets  [--sheets DIR]  # contact sheets of the OGGs
    python3 mods/winterworks/tools/sounds/build_sounds.py credits                 # rewrite CREDITS.md

`build` writes src/main/resources/assets/winterworks/sounds/<group>/<name><n>.ogg, merges its events into
tools/sound_map.json (merged into sounds.json + the lang file by tools/gen_data.py; map entries it does not
generate, such as events mapped by hand to existing files, are kept) and checks every file (peak, loudness,
length, loop seam). Downloads are cached (default: mods/winterworks/build/sfx_cache, gitignored) and are
treated as data only: archives are unpacked with path checks, media is decoded by ffmpeg.

Needs ffmpeg (with libvorbis) on PATH and numpy, scipy, Pillow (+ py7zr for the .7z sources).

Recipe language (recipes.json "events"): each event has a group/name, a subtitle, optional sounds.json entry
fields ("entry"), a loudness target ("loud", dB LUFS-M max, default -14), "mono" (default true), and either
"variants" (list of {"layers": [...], "fx": [...]}) or a base "layers"/"fx" plus "vary" (a list of overrides:
"<layer>.<key>": value, "pitch"/"gain" global multipliers, "add": [layers], "drop": [indices], "seed").
A layer is {"src": "<source id>[/<file in archive>]", "t": start s, "d": duration s, "at": placement s,
"pitch": varispeed factor, "stretch": time factor (pitch kept), "gain": dB, "hp"/"lp": Hz, "bp": [lo, hi],
"eq": [[Hz, dB, Q], ...], "lsh"/"hsh": [Hz, dB], "dist": drive, "env": [[s, dB], ...], "fi"/"fo": fade s,
"rev": true, "ch": "L"/"R", "pan": -1..1} or a synth layer {"synth": "noise"|"tone"|"chime"|"thump"|
"crackle"|"whoosh"|"wind"|"rumble"|"pluck"|"clicks", ...}. Bus fx: reverb, eq, hp, lp, comp, sat, delay.
More layer processing (any layer): "gran": {"out": s, "grain": s, "dens": grains/s, "scan": [from, to] (0..1 of
the clip), "spread": 0..1, "jit": semitones, "pitch": factor, "seed"} granular resynthesis of the clip;
"warble": [Hz, depth] pitch wobble; "trem": [Hz, depth 0..1] amplitude wobble; "ring": [Hz, mix] ring modulation;
"comb": [Hz, feedback, mix] resonator (glassy / metallic ring). A "tone" synth takes "fenv": [[s, Hz], ...], a pitch
contour interpolated in log frequency (glides, scoops, whale song), in place of its "f"/"f1" sweep.
"""
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from fractions import Fraction

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.normpath(os.path.join(HERE, "..", ".."))
SOUNDS = os.path.join(MOD, "src", "main", "resources", "assets", "winterworks", "sounds")
MAP_OUT = os.path.join(MOD, "tools", "sound_map.json")
RECIPES = os.path.join(HERE, "recipes.json")
CREDITS = os.path.join(HERE, "CREDITS.md")
DEFAULT_CACHE = os.path.join(MOD, "build", "sfx_cache")
SR = 44100
UA = "winterworks-sfx-pipeline/1.0"
CEIL_DB = -1.5  # limiter ceiling; Vorbis encoding overshoots a little, decoded peaks land near -1 dBFS
AUDIO_EXT = (".wav", ".flac", ".ogg", ".mp3", ".aif", ".aiff", ".oga", ".opus")


def db2a(d):
    return 10.0 ** (d / 20.0)


def a2db(a):
    return 20.0 * math.log10(max(float(a), 1e-12))


def load_recipes():
    with open(RECIPES, encoding="utf-8") as fh:
        return json.load(fh)


# ------------------------------------------------------------------------------------------- fetching
def _download(url, dest):
    tmp = dest + ".part"
    for i in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as fh:
                shutil.copyfileobj(r, fh)
            os.replace(tmp, dest)
            return
        except Exception as e:  # noqa: BLE001 (network errors of every kind: retry)
            wait = 5 * (i + 1)
            ra = getattr(e, "headers", None) and e.headers.get("Retry-After")
            if ra and ra.isdigit():
                wait = max(wait, int(ra) + 1)
            print(f"  retry {url} ({e}); waiting {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("download failed: " + url)


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _safe_member(name):
    parts = [p for p in re.split(r"[\\/]+", name) if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts) or re.match(r"^[A-Za-z]:", parts[0]):
        return None
    return "/".join(re.sub(r"[^\w.\- ()#,'&+]", "_", p) for p in parts)


def _unpack(arch_path, kind, outdir):
    os.makedirs(outdir, exist_ok=True)
    if kind == "zip":
        with zipfile.ZipFile(arch_path) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                rel = _safe_member(info.filename)
                if not rel or not rel.lower().endswith(AUDIO_EXT) or "__MACOSX" in rel:
                    continue
                dest = os.path.join(outdir, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with z.open(info) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
    elif kind == "7z":
        import py7zr
        tmp = outdir + "_tmp"
        shutil.rmtree(tmp, ignore_errors=True)
        with py7zr.SevenZipFile(arch_path, "r") as z:
            names = [n for n in z.getnames() if _safe_member(n)]
            z.extract(path=tmp, targets=names)
        root = os.path.realpath(tmp)
        for dp, _, fns in os.walk(tmp):
            for fn in fns:
                p = os.path.realpath(os.path.join(dp, fn))
                if not p.startswith(root + os.sep) or not fn.lower().endswith(AUDIO_EXT) or os.path.islink(p):
                    continue
                rel = _safe_member(os.path.relpath(p, root))
                dest = os.path.join(outdir, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                shutil.move(p, dest)
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        raise ValueError(kind)


def fetch(cache, only=None, pin=False):
    rec = load_recipes()
    changed = False
    failed = []
    for sid, s in rec["sources"].items():
        if only and not re.search(only, sid):
            continue
        d = os.path.join(cache, sid)
        fn = os.path.basename(s["url"].split("?")[0])
        dest = os.path.join(d, fn)
        if not os.path.exists(dest):
            os.makedirs(d, exist_ok=True)
            print("fetch", sid, s["url"], flush=True)
            try:
                _download(s["url"], dest)
            except RuntimeError as e:
                failed.append(sid)
                print("FAILED", e, file=sys.stderr)
                continue
            time.sleep(0.5)
        h = _sha256(dest)
        if s.get("sha256") and s["sha256"] != h:
            print(f"WARNING {sid}: sha256 differs from recipes.json ({h})", file=sys.stderr)
        if pin and s.get("sha256") != h:
            s["sha256"] = h
            changed = True
        if s.get("archive") and not os.path.isdir(os.path.join(d, "x")):
            _unpack(dest, s["archive"], os.path.join(d, "x"))
    if changed:
        with open(RECIPES, "w", encoding="utf-8") as fh:
            json.dump(rec, fh, indent=1, ensure_ascii=False)
            fh.write("\n")
    if failed:
        print("failed downloads (run fetch again):", " ".join(failed), file=sys.stderr)


def source_path(cache, rec, ref):
    sid, _, member = ref.partition("/")
    s = rec["sources"][sid]
    d = os.path.join(cache, sid)
    if s.get("archive"):
        p = os.path.join(d, "x", member)
        if not os.path.exists(p):
            # tolerate sanitised names
            p2 = os.path.join(d, "x", _safe_member(member) or member)
            if os.path.exists(p2):
                return p2
            raise FileNotFoundError(f"{ref}: not in archive (run fetch; members: {list_members(cache, sid)[:8]}...)")
        return p
    return os.path.join(d, os.path.basename(s["url"].split("?")[0]))


def list_members(cache, sid):
    x = os.path.join(cache, sid, "x")
    out = []
    for dp, _, fns in os.walk(x):
        for fn in fns:
            out.append(os.path.relpath(os.path.join(dp, fn), x).replace(os.sep, "/"))
    return sorted(out)


# ------------------------------------------------------------------------------------------- decoding
_PCM = {}


def decode(path, channels, cache):
    key = (path, channels)
    if key in _PCM:
        return _PCM[key]
    h = hashlib.sha1(f"{os.path.relpath(path, cache)}|{channels}|{SR}|{os.path.getsize(path)}".encode()).hexdigest()[:16]
    npy = os.path.join(cache, "_pcm", h + ".npy")
    if os.path.exists(npy):
        a = np.load(npy)
    else:
        cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"]
        raw = subprocess.run(cmd, stdout=subprocess.PIPE, check=True).stdout
        a = np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).T.copy()
        os.makedirs(os.path.dirname(npy), exist_ok=True)
        np.save(npy, a)
    _PCM[key] = a
    return a


def atempo(x, factor):
    """Time-stretch by `factor` (2.0 = twice as long) with ffmpeg's atempo, pitch kept."""
    tempo = 1.0 / factor
    chain = []
    while tempo > 2.0:
        chain.append("atempo=2.0")
        tempo /= 2.0
    while tempo < 0.5:
        chain.append("atempo=0.5")
        tempo /= 0.5
    chain.append(f"atempo={tempo:.6f}")
    ch = x.shape[0]
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
           "-af", ",".join(chain), "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-"]
    raw = subprocess.run(cmd, input=x.T.astype(np.float32).tobytes(), stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).T.copy()


# ------------------------------------------------------------------------------------------- DSP
def resample_pitch(x, p):
    if abs(p - 1.0) < 1e-6:
        return x
    fr = Fraction(p).limit_denominator(200)
    return signal.resample_poly(x, fr.denominator, fr.numerator, axis=-1)


def _sos_apply(sos, x):
    return signal.sosfilt(sos, x, axis=-1)


def hp(x, f, order=2):
    return _sos_apply(signal.butter(order, min(f, SR * 0.45), "highpass", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return _sos_apply(signal.butter(order, min(f, SR * 0.45), "lowpass", fs=SR, output="sos"), x)


def biquad(kind, f, gain_db=0.0, q=0.707):
    a = 10 ** (gain_db / 40.0)
    w = 2 * math.pi * min(f, SR * 0.45) / SR
    cw, sw = math.cos(w), math.sin(w)
    al = sw / (2 * q)
    if kind == "peak":
        b = [1 + al * a, -2 * cw, 1 - al * a]
        aa = [1 + al / a, -2 * cw, 1 - al / a]
    elif kind == "lsh":
        sa = 2 * math.sqrt(a) * al
        b = [a * ((a + 1) - (a - 1) * cw + sa), 2 * a * ((a - 1) - (a + 1) * cw), a * ((a + 1) - (a - 1) * cw - sa)]
        aa = [(a + 1) + (a - 1) * cw + sa, -2 * ((a - 1) + (a + 1) * cw), (a + 1) + (a - 1) * cw - sa]
    elif kind == "hsh":
        sa = 2 * math.sqrt(a) * al
        b = [a * ((a + 1) + (a - 1) * cw + sa), -2 * a * ((a - 1) + (a + 1) * cw), a * ((a + 1) + (a - 1) * cw - sa)]
        aa = [(a + 1) - (a - 1) * cw + sa, 2 * ((a - 1) - (a + 1) * cw), (a + 1) - (a - 1) * cw - sa]
    else:
        raise ValueError(kind)
    return np.array([b[0] / aa[0], b[1] / aa[0], b[2] / aa[0], 1.0, aa[1] / aa[0], aa[2] / aa[0]])[None, :]


def apply_filters(x, L):
    if "hp" in L:
        v = L["hp"]
        x = hp(x, *(v if isinstance(v, list) else [v]))
    if "lp" in L:
        v = L["lp"]
        x = lp(x, *(v if isinstance(v, list) else [v]))
    if "bp" in L:
        lo, hi = L["bp"][:2]
        order = L["bp"][2] if len(L["bp"]) > 2 else 2
        x = _sos_apply(signal.butter(order, [lo, min(hi, SR * 0.45)], "bandpass", fs=SR, output="sos"), x)
    for f, g, q in L.get("eq", []):
        x = _sos_apply(biquad("peak", f, g, q), x)
    if "lsh" in L:
        x = _sos_apply(biquad("lsh", L["lsh"][0], L["lsh"][1]), x)
    if "hsh" in L:
        x = _sos_apply(biquad("hsh", L["hsh"][0], L["hsh"][1]), x)
    return x


def env_curve(n, pts):
    t = np.arange(n) / SR
    ts = [p[0] for p in pts]
    gs = [p[1] for p in pts]
    return db2a(np.interp(t, ts, gs))


def fades(x, fi, fo):
    n = x.shape[-1]
    if fi and fi > 0:
        k = min(n, max(1, int(fi * SR)))
        x[..., :k] *= np.sin(np.linspace(0, math.pi / 2, k)) ** 2
    if fo and fo > 0:
        k = min(n, max(1, int(fo * SR)))
        x[..., n - k:] *= np.cos(np.linspace(0, math.pi / 2, k)) ** 2
    return x


def sat(x, drive):
    if drive <= 0:
        return x
    return np.tanh(x * (1 + drive)) / math.tanh(1 + drive)


def colored_noise(n, color, rng):
    w = rng.standard_normal(n)
    if color == "white":
        return w * 0.3
    spec = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1] if n > 1 else 1.0
    if color == "pink":
        spec /= np.sqrt(f / 100.0)
    elif color == "brown":
        spec /= f / 30.0
    elif color == "blue":
        spec *= np.sqrt(f / 1000.0)
    y = np.fft.irfft(spec, n)
    return y / (np.std(y) + 1e-12) * 0.3


def synth(L, rng, channels):
    kind = L["synth"]
    d = float(L.get("d", 1.0))
    n = max(1, int(d * SR))
    t = np.arange(n) / SR
    if kind == "noise":
        y = colored_noise(n, L.get("color", "pink"), rng)
    elif kind == "tone":
        f0 = L.get("f", 440.0)
        f1 = L.get("f1", f0)
        curve = L.get("curve", "exp")
        if curve == "exp":
            freq = f0 * (f1 / f0) ** (t / d)
        else:
            freq = f0 + (f1 - f0) * t / d
        if "fenv" in L:  # pitch contour [[s, Hz], ...], interpolated in log frequency (glides, scoops, whale song)
            freq = np.exp(np.interp(t, [p[0] for p in L["fenv"]], [math.log(p[1]) for p in L["fenv"]]))
        if "vib" in L:
            vr, vd = L["vib"]
            freq = freq * (1 + vd * np.sin(2 * math.pi * vr * t))
        ph = 2 * math.pi * np.cumsum(freq) / SR
        partials = L.get("partials", [[1, 1.0]])
        y = np.zeros(n)
        for pr in partials:
            ratio, amp = pr[0], pr[1]
            dec = pr[2] if len(pr) > 2 else None
            comp = np.sin(ph * ratio + rng.uniform(0, 6.28))
            if dec:
                comp *= np.exp(-t / dec)
            y += amp * comp
        wave = L.get("wave")
        if wave == "saw":
            y = 2 * ((ph / (2 * math.pi)) % 1.0) - 1
        elif wave == "square":
            y = np.sign(np.sin(ph))
        y *= 0.3
    elif kind == "chime":
        notes = L.get("notes", [L.get("f", 1200.0)])
        spread = L.get("spread", 0.08)
        dec = L.get("decay", 1.2)
        ratios = L.get("ratios", [1.0, 2.76, 5.40, 8.93])
        y = np.zeros(n)
        for i, f in enumerate(notes):
            off = int((i * spread + rng.uniform(0, spread * 0.3)) * SR)
            if off >= n:
                continue
            tt = t[: n - off]
            s = np.zeros(n - off)
            for j, r in enumerate(ratios):
                s += (0.6 ** j) * np.sin(2 * math.pi * f * r * tt + rng.uniform(0, 6.28)) * np.exp(-tt / (dec / (1 + j * 0.8)))
            att = np.minimum(1.0, tt / 0.002)
            y[off:] += s * att * (0.8 + 0.4 * rng.random())
        y *= 0.25
    elif kind == "thump":
        f0, f1 = L.get("f", 90.0), L.get("f1", 40.0)
        dec = L.get("decay", d / 4)
        freq = f1 + (f0 - f1) * np.exp(-t / (dec * 0.5))
        ph = 2 * math.pi * np.cumsum(freq) / SR
        y = np.sin(ph) * np.exp(-t / dec) * np.minimum(1.0, t / 0.001)
        if L.get("click", 0):
            y += L["click"] * colored_noise(n, "white", rng) * np.exp(-t / 0.004)
        y *= 0.8
    elif kind == "crackle":
        dens = L.get("density", 40.0)
        y = np.zeros(n)
        k = rng.poisson(dens * d)
        for _ in range(k):
            p = rng.integers(0, n)
            ln = int(rng.uniform(0.0005, L.get("grain", 0.004)) * SR)
            amp = rng.uniform(0.2, 1.0) ** L.get("skew", 2.0)
            e = min(n, p + ln)
            seg = rng.standard_normal(e - p) * np.exp(-np.arange(e - p) / max(1, ln / 4))
            y[p:e] += amp * seg
        y *= 0.5
    elif kind == "clicks":
        rate = L.get("rate", 18.0)
        jit = L.get("jitter", 0.25)
        y = np.zeros(n)
        tt = 0.0
        while tt < d:
            p = int(tt * SR)
            ln = int(0.003 * SR)
            e = min(n, p + ln)
            y[p:e] += rng.uniform(0.5, 1.0) * rng.standard_normal(e - p) * np.exp(-np.arange(e - p) / (ln / 5))
            tt += (1.0 / rate) * (1 + rng.uniform(-jit, jit))
        y *= 0.6
    elif kind in ("whoosh", "wind"):
        base = colored_noise(n, "pink", rng)
        if kind == "whoosh":
            f0, f1 = L.get("f", 400.0), L.get("f1", 2500.0)
            fc = f0 * (f1 / f0) ** np.clip(t / d, 0, 1) if L.get("sweep", True) else np.full(n, f0)
            peak = L.get("peak", 0.5)
            shape = np.where(t / d < peak, (t / d) / peak, (1 - t / d) / (1 - peak))
            amp = np.clip(shape, 0, 1) ** 2
        else:
            lo, hi = L.get("lo", 200.0), L.get("hi", 900.0)
            k = max(4, int(d * L.get("gusts", 0.6)) + 2)
            ctrl = rng.random(k)
            fc = lo + (hi - lo) * np.interp(t, np.linspace(0, d, k), ctrl)
            fc = signal.savgol_filter(fc, 2 * int(SR * 0.25) + 1, 2) if n > SR else fc
            amp = 0.5 + 0.5 * np.interp(t, np.linspace(0, d, k), rng.random(k))
        # time-varying 2-pole resonator (state-variable filter), processed in blocks
        q = L.get("q", 2.5)
        y = np.zeros(n)
        low = band = 0.0
        blk = 64
        for s0 in range(0, n, blk):
            f = 2 * math.sin(math.pi * min(fc[s0], SR / 6) / SR)
            for i in range(s0, min(n, s0 + blk)):
                low += f * band
                high = base[i] - low - band / q
                band += f * high
                y[i] = band
        y = y / (np.std(y) + 1e-9) * 0.3 * amp
    elif kind == "pluck":
        # Karplus-Strong plucked string (lyre, harp): one string per note, strummed `spread` s apart
        notes = L.get("notes", [L.get("f", 220.0)])
        y = np.zeros(n)
        for k, f in enumerate(notes):
            period = max(2, int(round(SR / f)))
            buf = rng.uniform(-1, 1, period)
            buf = lp(buf[None, :], L.get("bright", 4000.0), 1)[0]
            blocks = []
            decay = L.get("damp", 0.996)
            for _ in range(n // period + 1):
                blocks.append(buf)
                buf = decay * 0.5 * (buf + np.roll(buf, -1))
            s = np.concatenate(blocks)
            off = int(k * L.get("spread", 0.03) * SR)
            if off < n:
                y[off:] += s[: n - off] * (0.9 ** k)
        y *= 0.3
    elif kind == "rumble":
        y = colored_noise(n, "brown", rng)
        y = lp(y, L.get("cut", 120.0), 4)
        k = max(3, int(d * L.get("rate", 3.0)))
        am = np.interp(t, np.linspace(0, d, k), 0.4 + 0.6 * rng.random(k))
        y = y / (np.std(y) + 1e-9) * 0.3 * am
    else:
        raise ValueError("unknown synth " + kind)
    y = np.asarray(y, dtype=np.float64)[None, :]
    if channels == 2:
        if L.get("stereo"):
            y2 = synth(dict(L, stereo=False, seed_off=1), np.random.default_rng(rng.integers(1 << 30)), 1)
            m = min(y.shape[1], y2.shape[1])
            y = np.vstack([y[0, :m], y2[0, :m]])
        else:
            y = np.vstack([y[0], y[0]])
    return y


def granular(x, G, rng):
    """Granular resynthesis: Hann-windowed grains read from the clip (scanning `scan`, scattered by `spread`),
    each re-pitched by `pitch` * 2^(+-jit/12), overlap-added over `out` seconds at `dens` grains a second."""
    n_in = x.shape[1]
    out = int(float(G.get("out", n_in / SR)) * SR)
    g = max(16, int(float(G.get("grain", 0.08)) * SR))
    dens = float(G.get("dens", 30.0))
    s0, s1 = G.get("scan", [0.0, 1.0])
    spread = float(G.get("spread", 0.1))
    jit = float(G.get("jit", 0.0))
    base = float(G.get("pitch", 1.0))
    grng = np.random.default_rng(G["seed"]) if "seed" in G else rng
    y = np.zeros((x.shape[0], out + 4 * g))
    win = np.hanning(g)
    k = max(1, int(dens * out / SR))
    for i in range(k):
        tpos = grng.uniform(0, out)
        frac = tpos / max(1, out)
        c = s0 + (s1 - s0) * frac + grng.uniform(-spread, spread) * 0.5
        p = base * 2.0 ** (grng.uniform(-jit, jit) / 12.0)
        need = int(g * p) + 2
        src = int(np.clip(c, 0, 1) * max(0, n_in - need))
        seg = x[:, src:src + need]
        if seg.shape[1] < 4:
            continue
        idx = np.arange(g) * p
        idx = idx[idx < seg.shape[1] - 1]
        gr = np.vstack([np.interp(idx, np.arange(seg.shape[1]), seg[c_]) for c_ in range(x.shape[0])]) * win[:idx.size]
        o = int(tpos)
        y[:, o:o + gr.shape[1]] += gr * grng.uniform(0.6, 1.0)
    y = y[:, :out]
    # overlap normalisation: about dens * grain grains sound at once
    y /= max(1.0, math.sqrt(dens * g / SR))
    return y


def warble(x, rate, depth):
    """Pitch wobble (vibrato) of `depth` (fraction of pitch) at `rate` Hz, by a modulated read position."""
    n = x.shape[1]
    t = np.arange(n) / SR
    amp = depth / (2 * math.pi * rate) * SR
    pos = np.clip(np.arange(n) + amp * np.sin(2 * math.pi * rate * t), 0, n - 1)
    return np.vstack([np.interp(pos, np.arange(n), x[c]) for c in range(x.shape[0])])


def comb(x, f, fb=0.7, mix=0.5):
    d = max(1, int(round(SR / f)))
    a = np.zeros(d + 1)
    a[0], a[d] = 1.0, -fb
    wet = signal.lfilter([1.0 - fb], a, x, axis=-1)
    return x * (1 - mix) + wet * mix


def reverb(x, rt=1.2, mix=0.25, lpf=6000.0, pre=0.01, seed=7, width=0.0, er=True):
    rng = np.random.default_rng(seed)
    n = int((rt * 1.2 + pre) * SR)
    t = np.arange(n) / SR
    chans = x.shape[0]
    irs = []
    for c in range(chans):
        noise = rng.standard_normal(n)
        ir = noise * np.exp(-6.91 * t / rt)
        ir = lp(ir, lpf, 1)
        ir[: int(pre * SR)] = 0
        if er:
            for k in range(6):
                p = int((pre + rng.uniform(0.003, 0.04)) * SR)
                ir[p] += rng.uniform(0.3, 0.8) * (1 if rng.random() > 0.5 else -1)
        ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
        irs.append(ir)
    wet = np.vstack([signal.fftconvolve(x[c], irs[c])[: x.shape[1] + n] for c in range(chans)])
    dry = np.pad(x, ((0, 0), (0, wet.shape[1] - x.shape[1])))
    return dry * (1 - mix * 0.5) + wet * mix


def compress(x, thr=-18.0, ratio=3.0, att=0.005, rel=0.12, makeup=0.0):
    env = np.max(np.abs(x), axis=0)
    a_a = math.exp(-1 / (att * SR))
    a_r = math.exp(-1 / (rel * SR))
    e = signal.lfilter([1 - a_r], [1, -a_r], env)  # cheap release smoothing
    e = np.maximum(e, signal.lfilter([1 - a_a], [1, -a_a], env))
    lvl = 20 * np.log10(e + 1e-9)
    over = np.maximum(0, lvl - thr)
    g = db2a(-over * (1 - 1 / ratio) + makeup)
    return x * g


def delay(x, tm=0.12, fb=0.3, mix=0.2, lpf=4000.0):
    d = int(tm * SR)
    reps = 6
    n = x.shape[1] + d * reps
    out = np.pad(x, ((0, 0), (0, n - x.shape[1])))
    tap = np.pad(x, ((0, 0), (0, n - x.shape[1])))
    acc = np.zeros_like(out)
    g = 1.0
    for _ in range(reps):
        tap = np.roll(tap, d, axis=1)
        tap[:, :d] = 0
        tap = lp(tap, lpf, 1)
        g *= fb
        acc += tap * g / fb
    return out + acc * mix


def bus_fx(x, fxs):
    for fx in fxs or []:
        k = fx["t"]
        if k == "reverb":
            x = reverb(x, fx.get("rt", 1.2), fx.get("mix", 0.25), fx.get("lp", 6000.0), fx.get("pre", 0.01),
                       fx.get("seed", 7), er=fx.get("er", True))
        elif k in ("eq", "hp", "lp", "bp"):
            x = apply_filters(x, fx if k == "eq" else {k: fx["f"]})
        elif k == "comp":
            x = compress(x, fx.get("thr", -18), fx.get("ratio", 3), fx.get("att", 0.005), fx.get("rel", 0.12),
                         fx.get("makeup", 0))
        elif k == "sat":
            x = sat(x, fx.get("drive", 1.0))
        elif k == "delay":
            x = delay(x, fx.get("time", 0.12), fx.get("fb", 0.3), fx.get("mix", 0.2), fx.get("lp", 4000))
        else:
            raise ValueError("unknown fx " + k)
    return x


# ------------------------------------------------------------------------------------------- loudness
def k_weight(x):
    y = _sos_apply(biquad("hsh", 1681.0, 4.0, 0.707), x)
    return hp(y, 38.0, 2)


def loudness_stats(x):
    """(peak dBFS, max momentary loudness (400 ms, K-weighted) in LUFS-ish, active RMS dB, duration s)."""
    peak = a2db(np.max(np.abs(x)) if x.size else 0)
    kw = k_weight(x)
    p = np.mean(kw ** 2, axis=0) * x.shape[0]
    w = int(0.4 * SR)
    if p.size < w:
        p = np.pad(p, (0, w - p.size))
    c = np.cumsum(np.concatenate([[0.0], p]))
    mom = (c[w:] - c[:-w]) / w
    lufs = -0.691 + 10 * math.log10(max(float(np.max(mom)), 1e-12))
    env = np.sqrt(np.convolve(np.mean(x ** 2, axis=0), np.ones(441) / 441, "same"))
    act = env > np.max(env) * db2a(-30)
    rms = a2db(np.sqrt(np.mean(np.mean(x ** 2, axis=0)[act]))) if act.any() else -120.0
    return peak, lufs, rms, x.shape[1] / SR


def limiter(x, ceil_db=CEIL_DB, look=0.003, rel=0.06):
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    ceil = db2a(ceil_db)
    a = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, ceil / (a + 1e-12))
    w = max(3, int(look * SR))
    g = minimum_filter1d(need, size=2 * w + 1, mode="nearest")
    g = uniform_filter1d(g, size=w, mode="nearest")
    # slow release (never above the instantaneous requirement)
    r = 1 - math.exp(-1 / (rel * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(g.size):  # numpy loop is fine: files are short
        cur = min(g[i], cur + (1 - cur) * r)
        out[i] = cur
    return np.clip(x * out, -ceil, ceil)


def normalise(x, target_lufs, ceil_db=CEIL_DB, max_gr=6.0):
    peak, lufs, _, _ = loudness_stats(x)
    gain = target_lufs - lufs
    # do not crush transients: at most max_gr dB of limiting
    gain = min(gain, ceil_db - peak + max_gr)
    y = x * db2a(gain)
    if np.max(np.abs(y)) > db2a(ceil_db):
        y = limiter(y, ceil_db)
    return y


def trim(x, lead_db=-50.0, tail_db=-62.0, keep=0.004):
    a = np.max(np.abs(x), axis=0)
    pk = np.max(a) + 1e-12
    on = np.nonzero(a > pk * db2a(lead_db))[0]
    if on.size == 0:
        return x
    s = max(0, on[0] - int(keep * SR))
    env = np.convolve(a, np.ones(256) / 256, "same")
    off = np.nonzero(env > pk * db2a(tail_db))[0]
    e = min(x.shape[1], off[-1] + int(0.02 * SR)) if off.size else x.shape[1]
    y = x[:, s:e].copy()
    return fades(y, 0.001 if s > 0 else 0, min(0.03, y.shape[1] / SR / 4))


# ------------------------------------------------------------------------------------------- rendering
class Renderer:
    def __init__(self, rec, cache):
        self.rec = rec
        self.cache = cache

    def layer(self, L, channels, rng):
        if "synth" in L:
            x = synth(L, rng, channels)
            x = fades(x, 0.002, min(0.03, x.shape[1] / SR / 4))  # never start or stop with a click
        else:
            path = source_path(self.cache, self.rec, L["src"])
            ch = L.get("ch")
            if ch in ("L", "R"):
                a = decode(path, 2, self.cache)[0 if ch == "L" else 1][None, :]
            elif channels == 2:
                a = decode(path, 2, self.cache)
            else:
                a = decode(path, 1, self.cache)
            s = int(float(L.get("t", 0.0)) * SR)
            e = a.shape[1] if L.get("d") is None else min(a.shape[1], s + int(float(L["d"]) * SR))
            if s >= a.shape[1]:
                raise ValueError(f"{L['src']}: start {L.get('t')} beyond end {a.shape[1] / SR:.2f}s")
            x = a[:, s:e].astype(np.float64)
            if channels == 2 and x.shape[0] == 1:
                x = np.vstack([x[0], x[0]])
            x = fades(x, L.get("cfi", 0.003), L.get("cfo", 0.008))
        if L.get("rev"):
            x = x[:, ::-1].copy()
        if "gran" in L:
            x = fades(granular(x, L["gran"], rng), 0.01, 0.03)
        if L.get("stretch") and abs(L["stretch"] - 1) > 1e-4:
            x = atempo(x, L["stretch"]).astype(np.float64)
        if L.get("pitch", 1.0) != 1.0:
            x = resample_pitch(x, float(L["pitch"]))
        if "warble" in L:
            x = warble(x, *L["warble"])
        x = apply_filters(x, L)
        if "ring" in L:
            f, m = L["ring"]
            x = x * (1 - m) + x * np.sin(2 * math.pi * f * np.arange(x.shape[1]) / SR)[None, :] * m
        if "comb" in L:
            x = comb(x, *L["comb"])
        if L.get("dist"):
            x = sat(x, L["dist"])
        if "env" in L:
            x = x * env_curve(x.shape[1], L["env"])[None, :]
        if "trem" in L:
            r_, dp = L["trem"][:2]
            ph = L["trem"][2] if len(L["trem"]) > 2 else 0.0
            x = x * (1 - dp * 0.5 * (1 - np.cos(2 * math.pi * r_ * np.arange(x.shape[1]) / SR + ph)))[None, :]
        x = fades(x, L.get("fi", 0), L.get("fo", 0))
        x = x * db2a(L.get("gain", 0.0))
        if channels == 2 and "pan" in L:
            p = (L["pan"] + 1) * math.pi / 4
            x = np.vstack([x[0] * math.cos(p) * 1.414, x[1] * math.sin(p) * 1.414])
        return x

    def variant(self, ev, var, seed):
        channels = 1 if ev.get("mono", True) else 2
        rng = np.random.default_rng(seed)
        parts = []
        for L in var["layers"]:
            x = self.layer(L, channels, rng)
            parts.append((int(float(L.get("at", 0.0)) * SR), x))
        n = max(o + x.shape[1] for o, x in parts)
        mix = np.zeros((channels, n))
        for o, x in parts:
            mix[:, o:o + x.shape[1]] += x
        mix = hp(mix, var.get("hpf", ev.get("hpf", 25.0)), 2)  # remove DC / sub rumble below hearing
        mix = bus_fx(mix, var.get("fx", ev.get("fx")))
        loop = ev.get("loop")
        if loop:
            ln, xf = int(loop["len"] * SR), int(loop.get("xfade", 2.0) * SR)
            if mix.shape[1] < ln + xf:
                raise ValueError(f"loop needs {loop['len'] + loop.get('xfade', 2.0)} s of material")
            w = np.linspace(0, 1, xf)
            out = mix[:, :ln].copy()
            out[:, :xf] = mix[:, :xf] * np.sin(w * math.pi / 2) + mix[:, ln:ln + xf] * np.cos(w * math.pi / 2)
            mix = out
        else:
            mix = trim(mix)
            if "len" in var or "len" in ev:
                ln = int(float(var.get("len", ev.get("len"))) * SR)
                if mix.shape[1] > ln:
                    fo = float(var.get("lenfade", ev.get("lenfade", 0.15)))
                    mix = fades(mix[:, :ln], 0, min(fo, ln / SR / 2))
        mix = normalise(mix, float(var.get("loud", ev.get("loud", -14.0))), max_gr=float(ev.get("maxgr", 6.0)))
        return mix


def expand_variants(ev):
    if "variants" in ev:
        return ev["variants"]
    base = {"layers": ev["layers"]}
    if "fx" in ev:
        base["fx"] = ev["fx"]
    out = []
    for ov in ev.get("vary", [{}]):
        v = json.loads(json.dumps(base))
        layers = v["layers"]
        for k, val in ov.items():
            m = re.match(r"^(\d+)\.(\w+)$", k)
            if m:
                layers[int(m.group(1))][m.group(2)] = val
        if "drop" in ov:
            layers = [L for i, L in enumerate(layers) if i not in ov["drop"]]
        if "add" in ov:
            layers = layers + json.loads(json.dumps(ov["add"]))
        if "pitch" in ov:
            for L in layers:
                L["pitch"] = L.get("pitch", 1.0) * ov["pitch"]
                if "at" in L:
                    L["at"] = L["at"] / ov["pitch"]
        if "gain" in ov:
            for L in layers:
                L["gain"] = L.get("gain", 0.0) + ov["gain"]
        v["layers"] = layers
        for k in ("fx", "len", "loud", "seed", "hpf", "lenfade"):
            if k in ov:
                v[k] = ov[k]
        out.append(v)
    return out


def encode_ogg(x, path, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ch = x.shape[0]
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
           "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
           "-c:a", "libvorbis", "-q:a", str(q), path]
    subprocess.run(cmd, input=x.T.astype(np.float32).tobytes(), check=True)


def decode_ogg(path):
    ch = int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels",
                             "-of", "csv=p=0", path], stdout=subprocess.PIPE, check=True, text=True).stdout.strip())
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-"],
                         stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).T.astype(np.float64)


def seam_jump(x):
    """Loop seam discontinuity relative to the signal's typical sample-to-sample step (1.0 = normal)."""
    d = np.abs(np.diff(x, axis=1))
    typical = np.percentile(d, 99) + 1e-9
    return float(np.max(np.abs(x[:, 0] - x[:, -1])) / typical)


def build(cache, only=None, sheets_dir=None):
    rec = load_recipes()
    r = Renderer(rec, cache)
    sound_map = {}
    report = []
    used = {}
    # merge into the existing map: entries this build does not generate (events mapped by hand to existing files)
    # are kept, in their place
    if os.path.exists(MAP_OUT):
        with open(MAP_OUT, encoding="utf-8") as fh:
            sound_map = json.load(fh)
    for name, ev in rec["events"].items():
        group, base = ev["group"], ev["name"]
        if only and not re.search(only, name):
            continue
        vars_ = expand_variants(ev)
        # remove stale files of this event
        gdir = os.path.join(SOUNDS, group)
        if os.path.isdir(gdir):
            for fn in os.listdir(gdir):
                if re.fullmatch(re.escape(base) + r"\d+\.ogg", fn):
                    os.remove(os.path.join(gdir, fn))
        entries = []
        for i, var in enumerate(vars_):
            seed = int(var.get("seed", int(hashlib.md5(f"{name}{i}".encode()).hexdigest()[:8], 16)))
            y = r.variant(ev, var, seed)
            path = os.path.join(gdir, f"{base}{i + 1}.ogg")
            encode_ogg(y, path, ev.get("q", 5))
            z = decode_ogg(path)
            pk, lu, rms, dur = loudness_stats(z)
            row = {"event": name, "file": os.path.relpath(path, SOUNDS), "dur": round(dur, 3), "peak": round(pk, 2),
                   "lufs": round(lu, 1), "rms": round(rms, 1), "ch": z.shape[0], "kb": round(os.path.getsize(path) / 1024, 1)}
            if ev.get("loop"):
                row["seam"] = round(seam_jump(z), 2)
            report.append(row)
            e = {"name": f"winterworks:{group}/{base}{i + 1}"}
            e.update(ev.get("entry", {}))
            e.update(var.get("entry", {}))
            entries.append(e)
            for L in var["layers"]:
                if "src" in L:
                    used.setdefault(L["src"].split("/")[0], set()).add(name)
            flag = ""
            if pk > -0.7:
                flag += " PEAK!"
            if dur < 0.03:
                flag += " SHORT!"
            print(f"{name:40} {row['file']:42} {dur:6.2f}s peak {pk:6.1f} LUFS-M {lu:6.1f} rms {rms:6.1f} "
                  f"{row['kb']:6.1f}k" + (f" seam {row['seam']}" if 'seam' in row else "") + flag)
        sound_map[name] = {"sounds": entries, "subtitle": ev.get("subtitle")}
    with open(MAP_OUT, "w", encoding="utf-8") as fh:
        json.dump(sound_map, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    with open(os.path.join(cache, "build_report.json"), "w") as fh:
        json.dump({"report": report, "used": {k: sorted(v) for k, v in used.items()}}, fh, indent=1)
    if not only:
        write_credits(rec, {k: sorted(v) for k, v in used.items()})
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(SOUNDS) for f in fs if f.endswith(".ogg"))
    print(f"{len(report)} files, {total / 1048576:.2f} MB total in {SOUNDS}")
    if sheets_dir:
        render_sheets(sheets_dir, [x["event"] for x in report] if only else None)


# ------------------------------------------------------------------------------------------- pictures
def _font():
    from PIL import ImageFont
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/dejavu/DejaVuSansMono.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, 11)
    return ImageFont.load_default()


def _colormap(v):
    # v in 0..1 -> dark blue -> cyan -> yellow -> white
    stops = np.array([[5, 5, 20], [20, 40, 120], [20, 160, 200], [240, 220, 60], [255, 255, 255]], float)
    pos = np.clip(v, 0, 1) * (len(stops) - 1)
    i = np.minimum(pos.astype(int), len(stops) - 2)
    f = (pos - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)


def tile(x, w=360, hw=70, hs=90, secs=None):
    """Waveform (top) + log-frequency spectrogram (bottom) of a (ch, n) signal as an RGB array."""
    m = np.mean(x, axis=0) if x.ndim == 2 else x
    n = m.size
    secs = secs or n / SR
    cols = w
    wav = np.full((hw, cols, 3), 18, np.uint8)
    spp = max(1, int(secs * SR / cols))
    for c in range(cols):
        seg = m[c * spp:(c + 1) * spp]
        if seg.size == 0:
            continue
        lo, hi = seg.min(), seg.max()
        y0 = int((1 - (hi + 1) / 2) * (hw - 1))
        y1 = int((1 - (lo + 1) / 2) * (hw - 1))
        wav[max(0, y0):min(hw, y1 + 1), c] = (110, 200, 120) if max(abs(lo), abs(hi)) < db2a(-1.05) else (255, 60, 60)
    ceil = db2a(CEIL_DB)
    for yv in (ceil, -ceil):
        wav[int((1 - (yv + 1) / 2) * (hw - 1)), :] = (90, 60, 60)
    wav[hw // 2, :] = np.maximum(wav[hw // 2, :], 50)
    # spectrogram
    nfft = 1024
    hop = secs * SR / cols
    pad = np.pad(m, (nfft // 2, nfft + int(hop * cols) + 1))
    win = np.hanning(nfft)
    frames = np.stack([pad[int(i * hop):int(i * hop) + nfft] * win for i in range(cols)])
    S = np.abs(np.fft.rfft(frames, axis=1)) + 1e-9
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    fl = np.geomspace(40, 20000, hs)
    idx = np.clip(np.searchsorted(freqs, fl), 1, freqs.size - 1)
    Sl = 20 * np.log10(S[:, idx]).T[::-1]
    v = (Sl - (Sl.max() - 80)) / 80
    spec = _colormap(v)
    for f in (100, 1000, 10000):
        yy = hs - 1 - int(np.searchsorted(fl, f) * 1.0)
        spec[max(0, yy), ::4] = (200, 200, 200)
    img = np.concatenate([wav, np.full((2, cols, 3), 0, np.uint8), spec], axis=0)
    # one tick per second
    for s in range(1, int(secs) + 1):
        xx = int(s / secs * cols)
        if xx < cols:
            img[:6, xx] = (220, 220, 220)
    return img


def render_sheets(out_dir, only_events=None):
    from PIL import Image, ImageDraw
    os.makedirs(out_dir, exist_ok=True)
    rec = load_recipes()
    font = _font()
    groups = {}
    for name, ev in rec["events"].items():
        if only_events and name not in only_events:
            continue
        groups.setdefault(ev["group"], []).append((name, ev))
    made = []
    for g, evs in groups.items():
        rows = []
        for name, ev in evs:
            files = sorted([f for f in os.listdir(os.path.join(SOUNDS, g)) if re.fullmatch(re.escape(ev["name"]) + r"\d+\.ogg", f)],
                           key=lambda s: int(re.findall(r"(\d+)\.ogg$", s)[0]))
            rows.append((name, ev, files))
        ncol = max(len(fs) for _, _, fs in rows)
        TW, TH, LH = 300, 70 + 2 + 80, 28
        W = 10 + ncol * (TW + 8)
        H = 10 + len(rows) * (TH + LH + 10)
        im = Image.new("RGB", (W, H), (30, 30, 34))
        dr = ImageDraw.Draw(im)
        y = 8
        for name, ev, files in rows:
            dr.text((10, y), name + ("   [loop]" if ev.get("loop") else ""), fill=(255, 230, 150), font=font)
            datas = [decode_ogg(os.path.join(SOUNDS, g, f)) for f in files]
            secs = max(d.shape[1] for d in datas) / SR if datas else 1.0
            if ev.get("loop"):
                secs = datas[0].shape[1] / SR
            for j, (f, z) in enumerate(zip(files, datas)):
                x0 = 10 + j * (TW + 8)
                pk, lu, rms, dur = loudness_stats(z)
                lab = f"{f} {dur:.2f}s pk{pk:.1f} L{lu:.0f}"
                if ev.get("loop"):
                    lab += f" seam {seam_jump(z):.1f}"
                dr.text((x0, y + 13), lab, fill=(200, 200, 210), font=font)
                if ev.get("loop"):
                    # show the seam: last 0.25 s + first 0.25 s side by side
                    k = int(0.25 * SR)
                    seam = np.concatenate([z[:, -k:], z[:, :k]], axis=1)
                    t1 = tile(z, TW // 2 - 2, 70, 80, dur)
                    t2 = tile(seam, TW // 2 - 2, 70, 80, 0.5)
                    t2[:, t2.shape[1] // 2] = (255, 80, 255)
                    arr = np.concatenate([t1, np.zeros((t1.shape[0], 4, 3), np.uint8), t2], axis=1)
                else:
                    arr = tile(z, TW, 70, 80, secs)
                im.paste(Image.fromarray(arr), (x0, y + LH))
            y += TH + LH + 10
        p = os.path.join(out_dir, f"sheet_{g}.png")
        im.save(p)
        made.append(p)
        print("sheet", p)
    return made


def inspect(cache, refs, out):
    """Overview strips of raw sources with second ticks and detected sound events (printed)."""
    from PIL import Image, ImageDraw
    rec = load_recipes()
    font = _font()
    strips = []
    for ref in refs:
        if "/" not in ref.split("@")[0] and rec["sources"][ref.split("@")[0]].get("archive"):
            for mname in list_members(cache, ref):
                strips.append(ref + "/" + mname)
        else:
            strips.append(ref)
    W = 1200
    ims = []
    for ref in strips:
        src, _, rng_ = ref.partition("@")
        a = decode(source_path(cache, rec, src), 1, cache)
        t0 = 0.0
        if rng_:  # "SRC@12.5-20" zooms into a time range
            t0, t1 = (float(v) for v in rng_.split("-"))
            a = a[:, int(t0 * SR):int(t1 * SR)]
        dur = a.shape[1] / SR
        env = np.sqrt(np.convolve(a[0] ** 2, np.ones(441) / 441, "same"))
        thr = max(np.max(env) * db2a(-26), np.percentile(env, 20) * 4)
        act = env > thr
        segs, s = [], None
        for i in range(0, act.size, 220):
            if act[i] and s is None:
                s = i
            elif not act[i] and s is not None:
                segs.append([s, i])
                s = None
        if s is not None:
            segs.append([s, act.size])
        merged = []
        for sg in segs:
            if merged and sg[0] - merged[-1][1] < 0.08 * SR:
                merged[-1][1] = sg[1]
            else:
                merged.append(sg)
        txt = " ".join(f"{t0 + s0 / SR:.2f}-{t0 + s1 / SR:.2f}({a2db(np.max(np.abs(a[0, s0:s1]))):.0f})" for s0, s1 in merged[:40]
                       if s1 - s0 > 0.03 * SR)
        print(f"{ref}  [{dur:.2f}s pk {a2db(np.max(np.abs(a))):.1f}]  {txt}")
        arr = tile(a, W, 60, 70, dur)
        im = Image.new("RGB", (W, arr.shape[0] + 14), (25, 25, 28))
        ImageDraw.Draw(im).text((2, 0), f"{ref}  {dur:.2f}s  (ticks = 1 s from {t0:g})", fill=(255, 230, 150), font=font)
        im.paste(Image.fromarray(arr), (0, 14))
        ims.append(im)
    H = sum(i.height + 4 for i in ims)
    sheet = Image.new("RGB", (W, max(1, H)), (0, 0, 0))
    y = 0
    for i in ims:
        sheet.paste(i, (0, y))
        y += i.height + 4
    sheet.save(out)
    print("wrote", out)


# ------------------------------------------------------------------------------------------- credits
def used_sources(rec):
    """source id -> sorted events using it, read from the recipes (what a full build records)."""
    used = {}
    for name, ev in rec["events"].items():
        for v in expand_variants(ev):
            for L in v["layers"]:
                if "src" in L:
                    used.setdefault(L["src"].split("/")[0], set()).add(name)
    return {k: sorted(v) for k, v in used.items()}


def write_credits(rec, used):
    src = rec["sources"]
    lines = ["# Winterworks sound credits", "",
             "Every sound in `src/main/resources/assets/winterworks/sounds/` is made by `tools/sounds/build_sounds.py` "
             "from the recordings listed here (trimmed, layered, re-pitched, granulated, filtered, reverberated and normalised; see "
             "`tools/sounds/recipes.json`), plus procedural synthesis (numpy noise, tones, chimes, thumps, wind).",
             "Only CC0 and public-domain sources are used, so the derived files can be shipped with the mod. "
             "None of them carries an attribution requirement or a no-AI / no-machine-learning clause; credit is given "
             "anyway, with thanks to the recordists.", "",
             "Rebuild: `python3 mods/winterworks/tools/sounds/build_sounds.py fetch` then `... build` "
             "(downloads are checked against the sha256 in recipes.json).", ""]
    notes = []
    for site in sorted({src[k]["site"] for k in used}):
        lines += [f"## {site}", "", "| Source | Author | Licence | Used by |", "|---|---|---|---|"]
        for sid in sorted((k for k in used if src[k]["site"] == site), key=lambda k: src[k]["title"].lower()):
            s = src[sid]
            lic = s["license"]
            if s.get("license_note"):
                notes.append(f"[{len(notes) + 1}] {s['title']}: {s['license_note']}")
                lic += f" [{len(notes)}]"
            evs = ", ".join(f"`{e}`" for e in used[sid])
            lines.append(f"| [{s['title']}]({s['page']}) (`{sid}`) | {s['author']} | {lic} | {evs} |")
        lines.append("")
    if notes:
        lines += ["Notes:", ""] + [f"* {n}" for n in notes] + [""]
    lines += ["## Events and their ingredients", "", "| Event | Files | Recordings (source ids) | Synthesis |", "|---|---|---|---|"]
    for n, ev in rec["events"].items():
        vs = expand_variants(ev)
        ids = sorted({L["src"].split("/")[0] for v in vs for L in v["layers"] if "src" in L})
        syn = sorted({L["synth"] for v in vs for L in v["layers"] if "synth" in L})
        lines.append(f"| `{n}` | {len(vs)} | {', '.join(ids) or 'none (fully synthesised)'} | {', '.join(syn) or '-'} |")
    lines += ["", "## Licences", "",
              "* CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/",
              "* Public Domain Mark 1.0: https://creativecommons.org/publicdomain/mark/1.0/",
              "* BigSoundBank: every sound used is marked \"License CC0 (public domain): Free and royalty-free\" on its "
              "page; site terms at https://bigsoundbank.com/licenses.html (CC0 1.0 Universal).",
              "* OpenGameArt: every page used lists CC0 as its licence.", ""]
    if any("federal" in src[k].get("license_note", "") for k in used):
        lines.insert(len(lines) - 1, "* US federal government works (NOAA, National Park Service): recordings made by federal staff "
                     "are not subject to copyright in the US (17 U.S.C. 105) and are in the public domain; nps.gov states that "
                     "audiovisual material the National Park Service creates is generally in the public domain "
                     "(https://www.nps.gov/aboutus/disclaimer.htm).")
    with open(CREDITS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["fetch", "build", "inspect", "sheets", "credits", "members"])
    ap.add_argument("refs", nargs="*")
    ap.add_argument("--cache", default=os.environ.get("WW_SFX_CACHE", DEFAULT_CACHE))
    ap.add_argument("--only")
    ap.add_argument("--pin", action="store_true", help="fetch: write sha256 of every download into recipes.json")
    ap.add_argument("--sheets", help="build: also render contact sheets into this directory")
    ap.add_argument("-o", "--out", default="inspect.png")
    a = ap.parse_args()
    cache = os.path.abspath(a.cache)
    if a.cmd == "fetch":
        fetch(cache, a.only, a.pin)
    elif a.cmd == "build":
        build(cache, a.only, a.sheets)
    elif a.cmd == "inspect":
        inspect(cache, a.refs, a.out)
    elif a.cmd == "members":
        for sid in a.refs:
            for m in list_members(cache, sid):
                print(sid + "/" + m)
    elif a.cmd == "sheets":
        render_sheets(a.sheets or os.path.join(cache, "sheets"))
    elif a.cmd == "credits":
        write_credits(load_recipes(), used_sources(load_recipes()))


if __name__ == "__main__":
    main()
