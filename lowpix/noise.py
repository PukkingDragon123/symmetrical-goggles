"""Deterministic hash / value noise (vectorised numpy, no dependencies)."""
from __future__ import annotations

import zlib

import numpy as np

_M32 = np.int64(0xFFFFFFFF)


def seed_of(*parts) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode()) & 0xFFFFF


def hash3(ix, iy, iz, seed: int = 0) -> np.ndarray:
    """Integer lattice coords -> uniform float in [0, 1)."""
    ix = np.asarray(ix, dtype=np.int64)
    iy = np.asarray(iy, dtype=np.int64)
    iz = np.asarray(iz, dtype=np.int64)
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ np.int64((seed * 2654435761) & 0xFFFFFFFF)
    h = h & _M32
    h ^= h >> 13
    h = (h * 1274126177) & _M32
    h ^= h >> 16
    h = (h * 2246822519) & _M32
    h ^= h >> 13
    return h.astype(np.float64) / 4294967296.0


def hash2(ix, iy, seed: int = 0) -> np.ndarray:
    return hash3(ix, iy, np.zeros_like(np.asarray(ix)), seed)


def value_noise(p: np.ndarray, freq: float = 1.0, seed: int = 0) -> np.ndarray:
    """Smooth 3D value noise in [0, 1). p: (..., 3)."""
    q = np.asarray(p, dtype=np.float64) * freq
    i = np.floor(q)
    f = q - i
    u = f * f * (3.0 - 2.0 * f)
    i = i.astype(np.int64)
    out = 0.0
    for dx in (0, 1):
        wx = u[..., 0] if dx else 1 - u[..., 0]
        for dy in (0, 1):
            wy = u[..., 1] if dy else 1 - u[..., 1]
            for dz in (0, 1):
                wz = u[..., 2] if dz else 1 - u[..., 2]
                out = out + wx * wy * wz * hash3(i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz, seed)
    return out


def fbm(p: np.ndarray, freq: float = 1.0, octaves: int = 3, seed: int = 0) -> np.ndarray:
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total = total + amp * value_noise(p, freq * (2 ** o), seed + o * 101)
        norm += amp
        amp *= 0.5
    return total / norm


BAYER4 = np.array([[0, 8, 2, 10],
                   [12, 4, 14, 6],
                   [3, 11, 1, 9],
                   [15, 7, 13, 5]], dtype=np.float64) / 16.0 + 1.0 / 32.0
