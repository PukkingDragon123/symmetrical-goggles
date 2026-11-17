#!/usr/bin/env python3
"""BUSHED sound pipeline: CC0 / public-domain recordings -> game-ready OGG Vorbis files + src/audio/bank.ts.

Every source (URL, licence, author, sha256) and every sound recipe lives in recipes.json next to this file.
Needs only ffmpeg (with libvorbis) on PATH, numpy and (for pictures) Pillow. No scipy.

    python3 games/bushed/tools/sounds/build_sounds.py fetch   [--cache DIR] [--only RE] [--pin]
    python3 games/bushed/tools/sounds/build_sounds.py build   [--cache DIR] [--only RE] [--sheets DIR]
    python3 games/bushed/tools/sounds/build_sounds.py inspect SRC[/member][@t0-t1] ... -o sheet.png
    python3 games/bushed/tools/sounds/build_sounds.py sheets  [--only RE] [--sheets DIR]
    python3 games/bushed/tools/sounds/build_sounds.py credits

`build` writes public/assets/sfx/<dir>/<id>[_n].ogg, src/audio/bank.ts, and checks every file (peak, loudness,
length, loop seam). Downloads are cached (default: games/bushed/tools/sounds/.cache, gitignored; or $BUSHED_SFX_CACHE)
and treated as data only: zips are unpacked with path checks, media is decoded by ffmpeg.

Recipe language (recipes.json "events", keyed by sound id):
  "dir" output folder, "cat" sfx|amb|ui|voice|music, "vol" bank volume, "spatial", "refDist", "maxDist",
  "rateJitter" (bank fields), "mono" (default true), "loud" (dB LUFS-M max for one-shots, default -14; for loops the
  mean LUFS, default -20), "loop": {"len": s, "xfade": s} (seamless loop), "len"/"lenfade" (cap one-shot length),
  and either "variants" (list of {"layers": [...], "fx": [...]}) or base "layers"/"fx" plus "vary" (a list of
  overrides: "<layer>.<key>": value, "pitch"/"gain" global multipliers, "add": [layers], "drop": [indices], "seed").
A layer is {"src": "<source id>[/<file in archive>]", "t": start s, "d": duration s, "at": placement s,
  "pitch": varispeed factor, "stretch": time factor (pitch kept), "gain": dB, "hp"/"lp": Hz, "bp": [lo, hi],
  "eq": [[Hz, dB, Q], ...], "lsh"/"hsh": [Hz, dB], "dist": drive, "env": [[s, dB], ...], "fi"/"fo": fade s,
  "rev": true, "ch": "L"/"R", "pan": -1..1, "gate": dB (duck everything quieter than peak+gate)}
  or a synth layer {"synth": "noise"|"tone"|"chime"|"thump"|"crackle"|"whoosh"|"wind"|"rumble"|"clicks", ...}.
Bus fx ("fx": [{"t": ...}]): reverb, eq, hp, lp, comp, sat, delay.
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

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", ".."))
SFX = os.path.join(GAME, "public", "assets", "sfx")
BANK_TS = os.path.join(GAME, "src", "audio", "bank.ts")
RECIPES = os.path.join(HERE, "recipes.json")
CREDITS = os.path.join(GAME, "CREDITS.md")
DEFAULT_CACHE = os.environ.get("BUSHED_SFX_CACHE", os.path.join(HERE, ".cache"))
SR = 44100
UA = "bushed-sfx-pipeline/1.0"
CEIL_DB = -1.5
AUDIO_EXT = (".wav", ".flac", ".ogg", ".mp3", ".aif", ".aiff", ".oga", ".opus")


def db2a(d):
    return 10.0 ** (np.asarray(d, dtype=np.float64) / 20.0) if not np.isscalar(d) else 10.0 ** (d / 20.0)


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
            with urllib.request.urlopen(req, timeout=180) as r, open(tmp, "wb") as fh:
                shutil.copyfileobj(r, fh)
            os.replace(tmp, dest)
            return
        except Exception as e:  # noqa: BLE001 (network errors of every kind: retry)
            wait = 5 * (i + 1)
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


def _unpack_zip(arch_path, outdir):
    os.makedirs(outdir, exist_ok=True)
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


def _src_file(cache, sid, s):
    fn = re.sub(r"[^\w.\-]", "_", os.path.basename(s["url"].split("?")[0]))
    return os.path.join(cache, sid, fn)


def fetch(cache, only=None, pin=False, jobs=4):
    from concurrent.futures import ThreadPoolExecutor
    rec = load_recipes()
    todo = [(sid, s) for sid, s in rec["sources"].items() if not only or re.search(only, sid)]

    def one(item):
        sid, s = item
        dest = _src_file(cache, sid, s)
        if not os.path.exists(dest):
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            print("fetch", sid, s["url"], flush=True)
            try:
                _download(s["url"], dest)
            except RuntimeError as e:
                print("FAILED", e, file=sys.stderr)
                return sid, None
        h = _sha256(dest)
        if s.get("sha256") and s["sha256"] != h:
            print(f"WARNING {sid}: sha256 differs from recipes.json ({h})", file=sys.stderr)
        if s.get("archive") == "zip" and not os.path.isdir(os.path.join(cache, sid, "x")):
            _unpack_zip(dest, os.path.join(cache, sid, "x"))
        return sid, h

    changed, failed = False, []
    with ThreadPoolExecutor(jobs) as ex:
        for sid, h in ex.map(one, todo):
            if h is None:
                failed.append(sid)
            elif pin and rec["sources"][sid].get("sha256") != h:
                rec["sources"][sid]["sha256"] = h
                changed = True
    if changed:
        save_recipes(rec)
    if failed:
        print("failed downloads (run fetch again):", " ".join(failed), file=sys.stderr)


def save_recipes(rec):
    with open(RECIPES, "w", encoding="utf-8") as fh:
        json.dump(rec, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


def source_path(cache, rec, ref):
    sid, _, member = ref.partition("/")
    s = rec["sources"][sid]
    if s.get("archive"):
        p = os.path.join(cache, sid, "x", member)
        if not os.path.exists(p):
            p2 = os.path.join(cache, sid, "x", _safe_member(member) or member)
            if os.path.exists(p2):
                return p2
            raise FileNotFoundError(f"{ref}: not in archive (members: {list_members(cache, sid)[:8]}...)")
        return p
    return _src_file(cache, sid, s)


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
        a = np.load(npy, mmap_mode="r")  # memory-mapped: long field recordings stay on disk
    else:
        cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(SR),
               "-af", "aresample=resampler=soxr", "-"]
        raw = subprocess.run(cmd, stdout=subprocess.PIPE, check=True).stdout
        a = np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).T.copy()
        os.makedirs(os.path.dirname(npy), exist_ok=True)
        np.save(npy, a)
        del a, raw
        a = np.load(npy, mmap_mode="r")
    if len(_PCM) > 24:
        _PCM.clear()
    _PCM[key] = a
    return a


def _ffmpeg_af(x, af):
    ch = x.shape[0]
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
           "-af", af, "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-"]
    raw = subprocess.run(cmd, input=x.T.astype(np.float32).tobytes(), stdout=subprocess.PIPE, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).T.astype(np.float64)


def atempo(x, factor):
    """Time-stretch by `factor` (2.0 = twice as long), pitch kept."""
    tempo = 1.0 / factor
    chain = []
    while tempo > 2.0:
        chain.append("atempo=2.0")
        tempo /= 2.0
    while tempo < 0.5:
        chain.append("atempo=0.5")
        tempo /= 0.5
    chain.append(f"atempo={tempo:.6f}")
    return _ffmpeg_af(x, ",".join(chain))


def resample_pitch(x, p):
    """Varispeed: p > 1 = higher and shorter (tape speed-up)."""
    if abs(p - 1.0) < 1e-6:
        return x
    return _ffmpeg_af(x, f"asetrate={SR * p:.4f},aresample={SR}:resampler=soxr")


# ------------------------------------------------------------------------------------------- DSP (numpy only)
# IIR filters are applied exactly in the frequency domain: the signal is zero-padded (so the causal impulse response
# never wraps around) and multiplied by the filter's complex response H(e^jw) = B/A evaluated on the FFT grid.
def _rbj(kind, f, q=0.707, gain_db=0.0):
    f = min(max(f, 5.0), SR * 0.45)
    w = 2 * math.pi * f / SR
    cw, sw = math.cos(w), math.sin(w)
    al = sw / (2 * q)
    a = 10 ** (gain_db / 40.0)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        aa = [1 + al, -2 * cw, 1 - al]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        aa = [1 + al, -2 * cw, 1 - al]
    elif kind == "peak":
        b = [1 + al * a, -2 * cw, 1 - al * a]
        aa = [1 + al / a, -2 * cw, 1 - al / a]
    elif kind == "lsh":
        sa = 2 * math.sqrt(a) * al
        b = [a * ((a + 1) - (a - 1) * cw + sa), 2 * a * ((a - 1) - (a + 1) * cw), a * ((a + 1) - (a - 1) * cw - sa)]
        aa = [(a + 1) + (a - 1) * cw + sa, -2 * ((a - 1) + (a + 1) * cw), (a + 1) + (a - 1) * cw - sa]
    elif kind == "hsh":
        sa = 2 * math.sqrt(a) * al
        b = [a * ((a + 1) + (a - 1) * cw + sa), -2 * a * ((a - 1) - (a + 1) * cw), a * ((a + 1) + (a - 1) * cw - sa)]
        aa = [(a + 1) - (a - 1) * cw + sa, 2 * ((a - 1) + (a + 1) * cw), (a + 1) - (a - 1) * cw - sa]
    else:
        raise ValueError(kind)
    return np.array(b) / aa[0], np.array(aa) / aa[0]


_BUTTER_Q = {1: [None], 2: [0.7071], 3: [None, 1.0], 4: [0.5412, 1.3066], 6: [0.5176, 0.7071, 1.9319],
             8: [0.5098, 0.6013, 0.9000, 2.5629]}


def butter_sections(kind, f, order=2):
    secs = []
    for q in _BUTTER_Q.get(order, _BUTTER_Q[2]):
        if q is None:  # first-order section
            k = math.tan(math.pi * min(f, SR * 0.45) / SR)
            if kind == "lp":
                b, a = np.array([k, k, 0.0]) / (1 + k), np.array([1.0, (k - 1) / (1 + k), 0.0])
            else:
                b, a = np.array([1.0, -1.0, 0.0]) / (1 + k), np.array([1.0, (k - 1) / (1 + k), 0.0])
            secs.append((b, a))
        else:
            secs.append(_rbj(kind, f, q))
    return secs


def _response(secs, n):
    z = np.exp(-1j * np.pi * np.arange(n // 2 + 1) / (n // 2))  # e^-jw on the rfft grid of length n
    H = np.ones(n // 2 + 1, dtype=np.complex128)
    for b, a in secs:
        H *= (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return H


def apply_secs(x, secs, tail=None):
    if not secs:
        return x
    n = x.shape[-1]
    if tail is None:
        lowest = 20.0
        tail = int(min(2.0, max(0.25, 8.0 / lowest)) * SR)
    N = 1 << int(math.ceil(math.log2(n + tail)))
    H = _response(secs, N)
    X = np.fft.rfft(x, N, axis=-1)
    return np.fft.irfft(X * H, N, axis=-1)[..., :n]


def hp(x, f, order=2):
    return apply_secs(x, butter_sections("hp", f, order))


def lp(x, f, order=2):
    return apply_secs(x, butter_sections("lp", f, order))


def filter_secs(L):
    secs = []
    if "hp" in L:
        v = L["hp"] if isinstance(L["hp"], list) else [L["hp"]]
        secs += butter_sections("hp", *v)
    if "lp" in L:
        v = L["lp"] if isinstance(L["lp"], list) else [L["lp"]]
        secs += butter_sections("lp", *v)
    if "bp" in L:
        lo, hi = L["bp"][:2]
        order = L["bp"][2] if len(L["bp"]) > 2 else 2
        secs += butter_sections("hp", lo, order) + butter_sections("lp", hi, order)
    for f, g, q in L.get("eq", []):
        secs.append(_rbj("peak", f, q, g))
    if "lsh" in L:
        secs.append(_rbj("lsh", L["lsh"][0], 0.707, L["lsh"][1]))
    if "hsh" in L:
        secs.append(_rbj("hsh", L["hsh"][0], 0.707, L["hsh"][1]))
    return secs


def apply_filters(x, L):
    return apply_secs(x, filter_secs(L))


def env_curve(n, pts):
    t = np.arange(n) / SR
    return db2a(np.interp(t, [p[0] for p in pts], [p[1] for p in pts]))


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


def movavg(v, w):
    w = max(1, int(w))
    if w == 1:
        return v
    c = np.cumsum(np.concatenate([[0.0], v]))
    out = (c[w:] - c[:-w]) / w
    pad_l = (w - 1) // 2
    return np.concatenate([np.full(pad_l, out[0]), out, np.full(v.size - out.size - pad_l, out[-1])])


def running_min(v, w):
    """Centered running minimum (van Herk / Gil-Werman), window 2*w+1."""
    k = 2 * w + 1
    n = v.size
    pad = np.concatenate([np.full(w, v[0]), v, np.full(w + (-(n + 2 * w)) % k, v[-1])])
    blocks = pad.reshape(-1, k)
    g = np.minimum.accumulate(blocks, axis=1).ravel()
    h = np.minimum.accumulate(blocks[:, ::-1], axis=1)[:, ::-1].ravel()
    i = np.arange(n)
    return np.minimum(h[i], g[i + k - 1])


def onepole(v, tau):
    """y[n] = (1-a) v[n] + a y[n-1], exact via FFT."""
    a = math.exp(-1 / (max(tau, 1e-4) * SR))
    secs = [(np.array([1 - a, 0.0, 0.0]), np.array([1.0, -a, 0.0]))]
    return apply_secs(v[None, :], secs, tail=int(min(4.0, tau * 8 + 0.05) * SR))[0]


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


def _svf_bandpass(base, fc, q):
    """Time-varying state-variable band-pass, control rate 64 samples."""
    n = base.size
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
    return y


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
        freq = f0 * (f1 / f0) ** (t / d) if L.get("curve", "exp") == "exp" else f0 + (f1 - f0) * t / d
        if "vib" in L:
            vr, vd = L["vib"]
            freq = freq * (1 + vd * np.sin(2 * math.pi * vr * t))
        ph = 2 * math.pi * np.cumsum(freq) / SR
        y = np.zeros(n)
        for pr in L.get("partials", [[1, 1.0]]):
            comp = pr[1] * np.sin(ph * pr[0] + rng.uniform(0, 6.28))
            if len(pr) > 2 and pr[2]:
                comp *= np.exp(-t / pr[2])
            y += comp
        if L.get("wave") == "saw":
            y = 2 * ((ph / (2 * math.pi)) % 1.0) - 1
        elif L.get("wave") == "square":
            y = np.sign(np.sin(ph))
        y *= 0.3
    elif kind == "chime":
        notes = L.get("notes", [L.get("f", 1200.0)])
        spread, dec = L.get("spread", 0.08), L.get("decay", 1.2)
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
            y[off:] += s * np.minimum(1.0, tt / 0.002) * (0.8 + 0.4 * rng.random())
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
        for _ in range(rng.poisson(dens * d)):
            p = rng.integers(0, n)
            ln = int(rng.uniform(0.0005, L.get("grain", 0.004)) * SR)
            amp = rng.uniform(0.2, 1.0) ** L.get("skew", 2.0)
            e = min(n, p + ln)
            y[p:e] += amp * rng.standard_normal(e - p) * np.exp(-np.arange(e - p) / max(1, ln / 4))
        y *= 0.5
    elif kind == "clicks":
        rate, jit = L.get("rate", 18.0), L.get("jitter", 0.25)
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
            amp = np.clip(np.where(t / d < peak, (t / d) / peak, (1 - t / d) / (1 - peak)), 0, 1) ** 2
        else:
            lo, hi = L.get("lo", 200.0), L.get("hi", 900.0)
            k = max(4, int(d * L.get("gusts", 0.6)) + 2)
            fc = lo + (hi - lo) * np.interp(t, np.linspace(0, d, k), rng.random(k))
            fc = movavg(fc, int(SR * 0.5)) if n > SR else fc
            amp = 0.5 + 0.5 * np.interp(t, np.linspace(0, d, k), rng.random(k))
        y = _svf_bandpass(base, fc, L.get("q", 2.5))
        y = y / (np.std(y) + 1e-9) * 0.3 * amp
    elif kind == "rumble":
        y = lp(colored_noise(n, "brown", rng)[None, :], L.get("cut", 120.0), 4)[0]
        k = max(3, int(d * L.get("rate", 3.0)))
        am = np.interp(t, np.linspace(0, d, k), 0.4 + 0.6 * rng.random(k))
        y = y / (np.std(y) + 1e-9) * 0.3 * am
    else:
        raise ValueError("unknown synth " + kind)
    y = np.asarray(y, dtype=np.float64)[None, :]
    if channels == 2:
        if L.get("stereo"):
            y2 = synth(dict(L, stereo=False), np.random.default_rng(int(rng.integers(1 << 30))), 1)
            m = min(y.shape[1], y2.shape[1])
            y = np.vstack([y[0, :m], y2[0, :m]])
        else:
            y = np.vstack([y[0], y[0]])
    return y


def fftconv(a, b):
    n = a.size + b.size - 1
    N = 1 << int(math.ceil(math.log2(n)))
    return np.fft.irfft(np.fft.rfft(a, N) * np.fft.rfft(b, N), N)[:n]


def reverb(x, rt=1.2, mix=0.25, lpf=6000.0, pre=0.01, seed=7, er=True):
    rng = np.random.default_rng(seed)
    n = int((rt * 1.2 + pre) * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(x.shape[0]):
        ir = rng.standard_normal(n) * np.exp(-6.91 * t / rt)
        ir = lp(ir[None, :], lpf, 1)[0]
        ir[: int(pre * SR)] = 0
        if er:
            for _k in range(6):
                p = int((pre + rng.uniform(0.003, 0.04)) * SR)
                ir[p] += rng.uniform(0.3, 0.8) * (1 if rng.random() > 0.5 else -1)
        irs.append(ir / (np.sqrt(np.sum(ir ** 2)) + 1e-12))
    wet = np.vstack([fftconv(x[c], irs[c])[: x.shape[1] + n] for c in range(x.shape[0])])
    dry = np.pad(x, ((0, 0), (0, wet.shape[1] - x.shape[1])))
    return dry * (1 - mix * 0.5) + wet * mix


def compress(x, thr=-18.0, ratio=3.0, att=0.005, rel=0.12, makeup=0.0):
    env = np.max(np.abs(x), axis=0)
    e = np.maximum(onepole(env, rel), onepole(env, att))
    lvl = 20 * np.log10(e + 1e-9)
    over = np.maximum(0, lvl - thr)
    return x * db2a(-over * (1 - 1 / ratio) + makeup)


def delay(x, tm=0.12, fb=0.3, mix=0.2, lpf=4000.0):
    d = int(tm * SR)
    reps = 6
    n = x.shape[1] + d * reps
    out = np.pad(x, ((0, 0), (0, n - x.shape[1])))
    tap = out.copy()
    acc = np.zeros_like(out)
    g = 1.0
    for _ in range(reps):
        tap = np.roll(tap, d, axis=1)
        tap[:, :d] = 0
        tap = lp(tap, lpf, 1)
        g *= fb
        acc += tap * g / fb
    return out + acc * mix


def gate(x, thr_db, att=0.003, rel=0.08):
    """Soft downward expander: attenuate everything below (peak + thr_db)."""
    env = onepole(np.max(np.abs(x), axis=0), 0.01)
    thr = np.max(env) * db2a(thr_db)
    g = np.clip(env / (thr + 1e-12), 0, 1) ** 2
    g = np.maximum(onepole(g, rel), 0)
    return x * g


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
        elif k == "gate":
            x = gate(x, fx.get("thr", -30))
        else:
            raise ValueError("unknown fx " + k)
    return x


# ------------------------------------------------------------------------------------------- loudness
_KW = None


def k_weight(x):
    return apply_secs(x, [_rbj("hsh", 1681.0, 0.707, 4.0)] + butter_sections("hp", 38.0, 2))


def loudness_stats(x):
    """(peak dBFS, max momentary loudness (400 ms, K-weighted), mean loudness (gated, LUFS-ish), duration s)."""
    peak = a2db(np.max(np.abs(x)) if x.size else 0)
    kw = k_weight(x)
    p = np.sum(kw ** 2, axis=0)
    w = int(0.4 * SR)
    if p.size < w:
        p = np.pad(p, (0, w - p.size))
    c = np.cumsum(np.concatenate([[0.0], p]))
    mom = (c[w:] - c[:-w]) / w
    lufs_m = -0.691 + 10 * math.log10(max(float(np.max(mom)), 1e-12))
    blocks = mom[:: int(0.1 * SR)]
    gated = blocks[blocks > np.max(blocks) * 10 ** (-20 / 10)]  # relative gate -20 LU below loudest block
    lufs_i = -0.691 + 10 * math.log10(max(float(np.mean(gated)) if gated.size else 1e-12, 1e-12))
    return peak, lufs_m, lufs_i, x.shape[1] / SR


def limiter(x, ceil_db=CEIL_DB, look=0.003, rel=0.06):
    ceil = db2a(ceil_db)
    a = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, ceil / (a + 1e-12))
    w = max(3, int(look * SR))
    gr = 1 - movavg(running_min(need, w), w)          # look-ahead gain reduction
    hold = int(rel * SR * 0.5)
    gr = np.maximum(gr, movavg(-running_min(-gr, hold), hold))  # hold + smooth release
    return np.clip(x * np.clip(1 - gr, 0, 1), -ceil, ceil)


def normalise(x, target, loop=False, ceil_db=CEIL_DB, max_gr=6.0):
    peak, lufs_m, lufs_i, _ = loudness_stats(x)
    gain = target - (lufs_i if loop else lufs_m)
    gain = min(gain, ceil_db - peak + max_gr)
    y = x * db2a(gain)
    if np.max(np.abs(y)) > db2a(ceil_db):
        y = limiter(y, ceil_db)
    return y


def trim(x, lead_db=-50.0, tail_db=-60.0, keep=0.004):
    a = np.max(np.abs(x), axis=0)
    pk = np.max(a) + 1e-12
    on = np.nonzero(a > pk * db2a(lead_db))[0]
    if on.size == 0:
        return x
    s = max(0, on[0] - int(keep * SR))
    env = movavg(a, 256)
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
            x = fades(x, 0.002, min(0.03, x.shape[1] / SR / 4))
        else:
            path = source_path(self.cache, self.rec, L["src"])
            ch = L.get("ch")
            if ch in ("L", "R"):
                a = decode(path, 2, self.cache)[0 if ch == "L" else 1][None, :]
            else:
                a = decode(path, channels, self.cache)
            s = int(float(L.get("t", 0.0)) * SR)
            if s >= a.shape[1]:
                raise ValueError(f"{L['src']}: start {L.get('t')} beyond end {a.shape[1] / SR:.2f}s")
            e = a.shape[1] if L.get("d") is None else min(a.shape[1], s + int(float(L["d"]) * SR))
            x = a[:, s:e].astype(np.float64)
            if channels == 2 and x.shape[0] == 1:
                x = np.vstack([x[0], x[0]])
            x = fades(x, L.get("cfi", 0.003), L.get("cfo", 0.008))
        if L.get("rev"):
            x = x[:, ::-1].copy()
        if L.get("stretch") and abs(L["stretch"] - 1) > 1e-4:
            x = atempo(x, L["stretch"])
        if L.get("pitch", 1.0) != 1.0:
            x = resample_pitch(x, float(L["pitch"]))
        if "gate" in L:
            x = gate(x, L["gate"])
        x = apply_filters(x, L)
        if L.get("dist"):
            x = sat(x, L["dist"])
        if "env" in L:
            x = x * env_curve(x.shape[1], L["env"])[None, :]
        x = fades(x, L.get("fi", 0), L.get("fo", 0))
        x = x * db2a(L.get("gain", 0.0))
        if channels == 2 and "pan" in L:
            p = (L["pan"] + 1) * math.pi / 4
            x = np.vstack([x[0] * math.cos(p) * 1.414, x[1] * math.sin(p) * 1.414])
        return x

    def slice_layers(self, sl):
        a = decode(source_path(self.cache, self.rec, sl["src"]), 1, self.cache)[0]
        t0 = float(sl.get("t0", 0.0))
        t1 = float(sl.get("t1", a.size / SR))
        segs = segments(np.asarray(a[int(t0 * SR):int(t1 * SR)], dtype=np.float64), t0, float(sl.get("rel", -30.0)), float(sl.get("minlen", 0.03)))
        if not segs:
            raise ValueError(f"{sl['src']}: no events found (try a lower rel / minlen)")
        pk = max(p for _, _, p, _ in segs)
        keep = [sg for sg in segs if sg[2] >= pk + float(sl.get("minpk", -12.0))]
        if "pick" in sl:
            if max(sl["pick"]) >= len(keep):
                raise ValueError(f"{sl['src']}: pick {sl['pick']} but only {len(keep)} events: "
                                 + " ".join(f"{k[0]:.2f}({k[2]:.0f})" for k in keep))
            chosen = [keep[i] for i in sl["pick"]]
        else:
            n = int(sl["n"])
            if len(keep) < n:
                raise ValueError(f"{sl['src']}: only {len(keep)} events found, need {n}")
            idx = np.round(np.linspace(0, len(keep) - 1, n)).astype(int)
            chosen = [keep[i] for i in idx]
        out = []
        starts = [sg[0] for sg in segs]
        for st, en, _, _ in chosen:
            nxt = min([x for x in starts if x > st + 0.05] + [t1])
            pre = float(sl.get("pre", 0.02))
            d = min(float(sl.get("d", 0.6)), nxt - st + pre - 0.01)
            L = {k: v for k, v in sl.items() if k not in ("n", "rel", "minpk", "pick", "t0", "t1", "pre", "src", "d", "minlen")}
            L.update({"src": sl["src"], "t": round(max(0.0, st - pre), 4), "d": round(d, 4)})
            out.append(L)
        return out

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
        mix = hp(mix, var.get("hpf", ev.get("hpf", 25.0)), 2)
        mix = bus_fx(mix, var.get("fx", ev.get("fx")))
        loop = ev.get("loop")
        if loop:
            ln, xf = int(loop["len"] * SR), int(loop.get("xfade", 2.0) * SR)
            if mix.shape[1] < ln + xf:
                raise ValueError(f"loop needs {loop['len'] + loop.get('xfade', 2.0)} s of material, has {mix.shape[1] / SR:.1f}")
            w = np.linspace(0, 1, xf)
            out = mix[:, :ln].copy()
            # equal-power crossfade of the material after the loop end into the loop start
            out[:, :xf] = mix[:, :xf] * np.sin(w * math.pi / 2) + mix[:, ln:ln + xf] * np.cos(w * math.pi / 2)
            mix = out
            return normalise(mix, float(var.get("loud", ev.get("loud", -20.0))), loop=True, max_gr=float(ev.get("maxgr", 8.0)))
        mix = trim(mix)
        if "len" in var or "len" in ev:
            ln = int(float(var.get("len", ev.get("len"))) * SR)
            if mix.shape[1] > ln:
                fo = float(var.get("lenfade", ev.get("lenfade", 0.15)))
                mix = fades(mix[:, :ln], 0, min(fo, ln / SR / 2))
        return normalise(mix, float(var.get("loud", ev.get("loud", -14.0))), max_gr=float(ev.get("maxgr", 6.0)))


def nvars(ev):
    n = len(ev.get("variants", [])) if "slices" in ev else 0
    for sl in ([ev["slices"]] if isinstance(ev.get("slices"), dict) else ev.get("slices", [])):
        n += sl["n"] if "pick" not in sl else len(sl["pick"])
    return n or len(expand_variants(ev))


def expand_variants(ev, renderer=None):
    """Variants of an event. "slices" auto-cuts single events (steps, chops...) out of a source by onset detection:
    {"src", "n", "rel" (detect threshold dB, default -30), "minpk" (keep events within this many dB of the loudest,
    default -12), "d" (max length, default 0.6), "pre" (pre-roll, default 0.02), "pick" (explicit event indices),
    "t0"/"t1" (search range), plus any layer keys}; base "layers" are added to every slice (e.g. sweeteners)."""
    if "slices" in ev:
        if renderer is None:
            raise ValueError("slices need a renderer")
        out = list(ev.get("variants", []))
        for sl in ([ev["slices"]] if isinstance(ev["slices"], dict) else ev["slices"]):
            for L in renderer.slice_layers(sl):
                v = {"layers": [L] + json.loads(json.dumps(ev.get("layers", [])))}
                if "fx" in ev:
                    v["fx"] = ev["fx"]
                out.append(v)
        return out
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


def out_files(sid, ev, nvar):
    d = ev.get("dir", "misc")
    if nvar == 1:
        return [f"{d}/{sid}.ogg"]
    return [f"{d}/{sid}_{i + 1}.ogg" for i in range(nvar)]


def build(cache, only=None, sheets_dir=None, jobs=1):
    rec = load_recipes()
    r = Renderer(rec, cache)
    report_path = os.path.join(cache, "build_report.json")
    old = {}
    if only and os.path.exists(report_path):
        with open(report_path) as fh:
            old = json.load(fh)
    report = {k: v for k, v in old.get("report", {}).items() if k in rec["events"]}
    used = {k: set(v) for k, v in old.get("used", {}).items()}
    errors = []
    for name, ev in rec["events"].items():
        if only and not re.search(only, name):
            continue
        for k in list(used):
            used[k].discard(name)
        try:
            vars_ = expand_variants(ev, r)
        except Exception as e:  # noqa: BLE001 (keep building the rest; report at the end)
            errors.append(f"{name}: {e}")
            print(f"ERROR {name}: {e}", file=sys.stderr)
            continue
        files = out_files(name, ev, len(vars_))
        gdir = os.path.join(SFX, ev.get("dir", "misc"))
        if os.path.isdir(gdir):  # remove stale files of this sound
            for fn in os.listdir(gdir):
                if re.fullmatch(re.escape(name) + r"(_\d+)?\.ogg", fn):
                    os.remove(os.path.join(gdir, fn))
        rows = []
        for i, var in enumerate(vars_):
            seed = int(var.get("seed", int(hashlib.md5(f"{name}{i}".encode()).hexdigest()[:8], 16)))
            try:
                y = r.variant(ev, var, seed)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{name}[{i}]: {e}")
                print(f"ERROR {name}[{i}]: {e}", file=sys.stderr)
                continue
            path = os.path.join(SFX, files[i])
            q = ev.get("q", 4)
            encode_ogg(y, path, q)
            z = decode_ogg(path)
            for _ in range(3):  # Vorbis can overshoot the limiter ceiling: pull the gain down and re-encode
                over = a2db(np.max(np.abs(z))) + 0.8
                if over <= 0:
                    break
                y = y * db2a(-over - 0.2)
                encode_ogg(y, path, q)
                z = decode_ogg(path)
            pk, lm, li, dur = loudness_stats(z)
            row = {"file": files[i], "dur": round(dur, 3), "peak": round(pk, 2), "lufs_m": round(lm, 1),
                   "lufs_i": round(li, 1), "ch": z.shape[0], "kb": round(os.path.getsize(path) / 1024, 1)}
            if ev.get("loop"):
                row["seam"] = round(seam_jump(z), 2)
            rows.append(row)
            for L in var["layers"]:
                if "src" in L:
                    used.setdefault(L["src"].split("/")[0], set()).add(name)
            flag = (" PEAK!" if pk > -0.7 else "") + (" SHORT!" if dur < 0.03 else "") + \
                   (" SEAM!" if row.get("seam", 0) > 3 else "")
            print(f"{name:26} {files[i]:40} {dur:6.2f}s pk {pk:6.1f} M {lm:6.1f} I {li:6.1f} {row['kb']:6.1f}k"
                  + (f" seam {row['seam']}" if 'seam' in row else "") + flag, flush=True)
        report[name] = rows
    with open(report_path, "w") as fh:
        json.dump({"report": report, "used": {k: sorted(v) for k, v in used.items() if v}}, fh, indent=1)
    write_bank(rec)
    write_credits(rec, {k: sorted(v) for k, v in used.items() if v})
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(SFX) for f in fs if f.endswith(".ogg"))
    print(f"{sum(len(v) for v in report.values())} files, {total / 1048576:.2f} MB total in {SFX}")
    if sheets_dir:
        render_sheets(sheets_dir, only)
    if errors:
        print(f"{len(errors)} ERRORS:\n  " + "\n  ".join(errors), file=sys.stderr)
        sys.exit(1)


def write_bank(rec):
    lines = ["// Generated by tools/sounds/build_sounds.py from tools/sounds/recipes.json. Do not edit by hand:",
             "// change the recipe and rebuild. Sources and licences: CREDITS.md (## Sound).", "",
             "export type SoundCat = 'sfx' | 'amb' | 'ui' | 'voice' | 'music';",
             "export interface SoundDef {",
             "  files: string[]; vol: number; cat: SoundCat; loop?: boolean; spatial?: boolean;",
             "  refDist?: number; maxDist?: number; rateJitter?: number;",
             "}", "",
             "/** 'assets/sfx/<path>_1.ogg' ... '<path>_<n>.ogg' (or '<path>.ogg' when n is 1). */",
             "const v = (path: string, n = 1): string[] =>",
             "  n === 1 ? [`assets/sfx/${path}.ogg`] : Array.from({ length: n }, (_, i) => `assets/sfx/${path}_${i + 1}.ogg`);",
             "", "export const SOUNDS: Record<string, SoundDef> = {"]
    for name, ev in rec["events"].items():
        n = nvars(ev)
        path = f"{ev.get('dir', 'misc')}/{name}"
        fs = f"v('{path}', {n})" if n > 1 else f"v('{path}')"
        extra = ""
        if ev.get("loop"):
            extra += ", loop: true"
        if ev.get("spatial"):
            extra += ", spatial: true"
        for k in ("refDist", "maxDist", "rateJitter"):
            if k in ev and ev[k]:
                extra += f", {k}: {ev[k]}"
        lines.append(f"  {name}: {{ files: {fs}, vol: {ev.get('vol', 1.0)}, cat: '{ev.get('cat', 'sfx')}'{extra} }},")
    lines += ["};", ""]
    with open(BANK_TS, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


# ------------------------------------------------------------------------------------------- pictures
def _font():
    from PIL import ImageFont
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/dejavu/DejaVuSansMono.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, 11)
    return ImageFont.load_default()


def _colormap(v):
    stops = np.array([[5, 5, 20], [20, 40, 120], [20, 160, 200], [240, 220, 60], [255, 255, 255]], float)
    pos = np.clip(v, 0, 1) * (len(stops) - 1)
    i = np.minimum(pos.astype(int), len(stops) - 2)
    f = (pos - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)


def tile(x, w=360, hw=70, hs=90, secs=None):
    """Waveform (top) + log-frequency spectrogram (bottom) of a (ch, n) signal as an RGB array."""
    m = np.mean(x, axis=0) if x.ndim == 2 else x
    secs = secs or m.size / SR
    wav = np.full((hw, w, 3), 18, np.uint8)
    spp = max(1, int(secs * SR / w))
    for c in range(w):
        seg = m[c * spp:(c + 1) * spp]
        if seg.size == 0:
            continue
        lo, hi = seg.min(), seg.max()
        y0 = int((1 - (min(hi, 1) + 1) / 2) * (hw - 1))
        y1 = int((1 - (max(lo, -1) + 1) / 2) * (hw - 1))
        wav[max(0, y0):min(hw, y1 + 1), c] = (110, 200, 120) if max(abs(lo), abs(hi)) < db2a(-1.05) else (255, 60, 60)
    wav[hw // 2, :] = np.maximum(wav[hw // 2, :], 50)
    nfft = 1024
    hop = secs * SR / w
    pad = np.pad(m, (nfft // 2, nfft + int(hop * w) + 1))
    win = np.hanning(nfft)
    frames = np.stack([pad[int(i * hop):int(i * hop) + nfft] * win for i in range(w)])
    S = np.abs(np.fft.rfft(frames, axis=1)) + 1e-9
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    fl = np.geomspace(40, 20000, hs)
    idx = np.clip(np.searchsorted(freqs, fl), 1, freqs.size - 1)
    Sl = 20 * np.log10(S[:, idx]).T[::-1]
    spec = _colormap((Sl - (Sl.max() - 80)) / 80)
    for f in (100, 1000, 10000):
        spec[max(0, hs - 1 - int(np.searchsorted(fl, f))), ::4] = (200, 200, 200)
    img = np.concatenate([wav, np.zeros((2, w, 3), np.uint8), spec], axis=0)
    for s in range(1, int(secs) + 1):
        xx = int(s / secs * w)
        if xx < w:
            img[:6, xx] = (220, 220, 220)
    return img


def render_sheets(out_dir, only=None):
    from PIL import Image, ImageDraw
    os.makedirs(out_dir, exist_ok=True)
    rec = load_recipes()
    font = _font()
    groups = {}
    for name, ev in rec["events"].items():
        if only and not re.search(only, name):
            continue
        groups.setdefault(ev.get("dir", "misc"), []).append((name, ev))
    for g, evs in groups.items():
        rows = []
        for name, ev in evs:
            files = out_files(name, ev, nvars(ev))
            rows.append((name, ev, [f for f in files if os.path.exists(os.path.join(SFX, f))]))
        ncol = min(6, max(1, max(len(fs) for _, _, fs in rows)))
        TW, TH, LH = 260, 60 + 2 + 60, 26
        W = 10 + ncol * (TW + 8)
        nrow = sum((len(fs) + ncol - 1) // ncol or 1 for _, _, fs in rows)
        im = Image.new("RGB", (W, 10 + nrow * (TH + LH + 6) + len(rows) * 4), (30, 30, 34))
        dr = ImageDraw.Draw(im)
        y = 6
        for name, ev, files in rows:
            datas = [decode_ogg(os.path.join(SFX, f)) for f in files]
            secs = max((d.shape[1] for d in datas), default=SR) / SR
            for j, (f, z) in enumerate(zip(files, datas)):
                if j and j % ncol == 0:
                    y += TH + LH + 6
                x0 = 10 + (j % ncol) * (TW + 8)
                pk, lm, li, dur = loudness_stats(z)
                lab = f"{os.path.basename(f)[:-4]} {dur:.2f}s pk{pk:.0f} M{lm:.0f} I{li:.0f}"
                if ev.get("loop"):
                    lab += f" seam{seam_jump(z):.1f}"
                    k = int(0.25 * SR)
                    seam = np.concatenate([z[:, -k:], z[:, :k]], axis=1)
                    t1, t2 = tile(z, TW // 2 - 2, 60, 60, dur), tile(seam, TW // 2 - 2, 60, 60, 0.5)
                    t2[:, t2.shape[1] // 2] = (255, 80, 255)
                    arr = np.concatenate([t1, np.zeros((t1.shape[0], 4, 3), np.uint8), t2], axis=1)
                else:
                    arr = tile(z, TW, 60, 60, secs)
                dr.text((x0, y + 12), lab, fill=(200, 200, 210), font=font)
                im.paste(Image.fromarray(arr), (x0, y + LH))
            dr.text((10, y), name + ("  [loop]" if ev.get("loop") else ""), fill=(255, 230, 150), font=font)
            y += TH + LH + 10
        p = os.path.join(out_dir, f"sheet_{g}.png")
        im.crop((0, 0, W, y + 4)).save(p)
        print("sheet", p)


def segments(a, t0=0.0, rel_db=-26.0, minlen=0.03):
    env = np.sqrt(movavg(a ** 2, 441))
    thr = max(np.max(env) * db2a(rel_db), np.percentile(env, 20) * 4)
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
    out = []
    for s0, s1 in merged:
        if s1 - s0 < minlen * SR:
            continue
        seg = a[s0:s1]
        S = np.abs(np.fft.rfft(seg * np.hanning(seg.size)))
        f = np.fft.rfftfreq(seg.size, 1 / SR)
        cen = float(np.sum(S * f) / (np.sum(S) + 1e-12))
        out.append((t0 + s0 / SR, t0 + s1 / SR, a2db(np.max(np.abs(seg))), cen))
    return out


def inspect(cache, refs, out, quiet=False, rel=-26.0):
    """Overview strips of raw sources with second ticks; prints detected events (start-end(peak dB, centroid kHz))."""
    from PIL import Image, ImageDraw
    rec = load_recipes()
    font = _font()
    strips = []
    for ref in refs:
        sid = ref.split("@")[0].split("/")[0]
        if "/" not in ref.split("@")[0] and rec["sources"][sid].get("archive"):
            strips += [sid + "/" + m for m in list_members(cache, sid)]
        else:
            strips.append(ref)
    W = 1200
    ims = []
    for ref in strips:
        src, _, rng_ = ref.partition("@")
        a = decode(source_path(cache, rec, src), 1, cache)
        t0 = 0.0
        if rng_:
            t0, t1 = (float(v) for v in rng_.split("-"))
            a = a[:, int(t0 * SR):int(t1 * SR)]
        dur = a.shape[1] / SR
        segs = segments(np.asarray(a[0], dtype=np.float64), t0, rel)
        txt = " ".join(f"{s:.2f}-{e:.2f}({p:.0f},{c / 1000:.1f}k)" for s, e, p, c in segs[:45])
        if not quiet:
            print(f"{ref}  [{dur:.1f}s pk {a2db(np.max(np.abs(a))):.1f}] n={len(segs)} {txt}")
        if out:
            arr = tile(a, W, 60, 70, dur)
            im = Image.new("RGB", (W, arr.shape[0] + 14), (25, 25, 28))
            ImageDraw.Draw(im).text((2, 0), f"{ref}  {dur:.2f}s  (ticks = 1 s from {t0:g})", fill=(255, 230, 150), font=font)
            im.paste(Image.fromarray(arr), (0, 14))
            ims.append(im)
    if out and ims:
        sheet = Image.new("RGB", (W, sum(i.height + 4 for i in ims)), (0, 0, 0))
        y = 0
        for i in ims:
            sheet.paste(i, (0, y))
            y += i.height + 4
        sheet.save(out)
        print("wrote", out)


# ------------------------------------------------------------------------------------------- credits
CREDITS_BEGIN = "## Sound"


def write_credits(rec, used):
    """Rewrite only the '## Sound' section of games/bushed/CREDITS.md (other sections belong to other modules)."""
    src = rec["sources"]
    lines = [CREDITS_BEGIN, "",
             "Every file in `public/assets/sfx/` is made by `tools/sounds/build_sounds.py` from the recordings below "
             "(trimmed, layered, re-pitched, filtered, reverberated, loudness-normalised; recipes in "
             "`tools/sounds/recipes.json`), plus a little procedural synthesis (numpy noise, tones, thumps). "
             "Only CC0 and public-domain sources are used. Rebuild: `python3 tools/sounds/build_sounds.py fetch` "
             "then `... build` (downloads are checked against the sha256 in recipes.json).", ""]
    notes = []
    for site in sorted({src[k]["site"] for k in used if k in src}):
        lines += [f"### {site}", "", "| Source | Author | Licence | Used by |", "|---|---|---|---|"]
        for sid in sorted((k for k in used if k in src and src[k]["site"] == site), key=lambda k: src[k]["title"].lower()):
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
    lines += ["Licences: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/); Public Domain Mark 1.0 "
              "(https://creativecommons.org/publicdomain/mark/1.0/); US federal government works (NPS, USFWS) are in the "
              "public domain in the US (17 U.S.C. 105). BigSoundBank: every sound used is marked \"License CC0 (public "
              "domain)\" on its page (https://bigsoundbank.com/licenses.html).", ""]
    section = "\n".join(lines)
    text = ""
    if os.path.exists(CREDITS):
        with open(CREDITS, encoding="utf-8") as fh:
            text = fh.read()
    if not text.strip():
        text = "# BUSHED credits\n\n"
    m = re.search(r"^## Sound\s*$", text, re.M)
    if m:
        nxt = re.search(r"^## (?!#)", text[m.end():], re.M)
        end = m.end() + nxt.start() if nxt else len(text)
        text = text[:m.start()] + section + ("\n" if nxt else "") + text[end:]
    else:
        text = text.rstrip("\n") + "\n\n" + section
    with open(CREDITS, "w", encoding="utf-8") as fh:
        fh.write(text if text.endswith("\n") else text + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["fetch", "build", "inspect", "sheets", "credits", "members", "bank"])
    ap.add_argument("refs", nargs="*")
    ap.add_argument("--cache", default=DEFAULT_CACHE)
    ap.add_argument("--only")
    ap.add_argument("--pin", action="store_true", help="fetch: write sha256 of every download into recipes.json")
    ap.add_argument("--sheets", help="build: also render contact sheets into this directory")
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--rel", type=float, default=-26.0, help="inspect: event threshold relative to the peak (dB)")
    a = ap.parse_args()
    cache = os.path.abspath(a.cache)
    if a.cmd == "fetch":
        fetch(cache, a.only, a.pin)
    elif a.cmd == "build":
        build(cache, a.only, a.sheets)
    elif a.cmd == "inspect":
        inspect(cache, a.refs, a.out, rel=a.rel)
    elif a.cmd == "members":
        for sid in a.refs:
            for m in list_members(cache, sid):
                print(sid + "/" + m)
    elif a.cmd == "sheets":
        render_sheets(a.sheets or os.path.join(cache, "sheets"), a.only)
    elif a.cmd == "bank":
        write_bank(load_recipes())
    elif a.cmd == "credits":
        with open(os.path.join(cache, "build_report.json")) as fh:
            write_credits(load_recipes(), json.load(fh)["used"])


if __name__ == "__main__":
    main()
