"""Small mesh helpers for the vehicle tools: connected components and union-find over welded triangles."""
from __future__ import annotations

import numpy as np


def weld(V: np.ndarray, F: np.ndarray, tol: float = 1e-5):
    q = np.round(V / tol).astype(np.int64)
    _, idx, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    return inv.reshape(-1)[F]


def components(V: np.ndarray, F: np.ndarray, tol: float = 1e-5) -> np.ndarray:
    """label per triangle: triangles sharing a (welded) vertex are in the same component"""
    Fw = weld(V, F, tol)
    n = Fw.max() + 1
    parent = np.arange(n)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    # vectorised-ish union: iterate until stable using min-label propagation
    lab = np.arange(n)
    for _ in range(200):
        m = np.minimum(np.minimum(lab[Fw[:, 0]], lab[Fw[:, 1]]), lab[Fw[:, 2]])
        new = lab.copy()
        for k in range(3):
            np.minimum.at(new, Fw[:, k], m)
        # pointer jumping
        new = new[new]
        if np.array_equal(new, lab):
            break
        lab = new
    tl = lab[Fw[:, 0]]
    _, out = np.unique(tl, return_inverse=True)
    return out.reshape(-1)
