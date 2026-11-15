"""Shelf packing of face rectangles into a texture atlas (with 1px gutters)."""
from __future__ import annotations


def _pow2(n: int) -> int:
    p = 16
    while p < n:
        p *= 2
    return p


def shelf_pack(sizes, gutter: int = 1, max_size: int = 4096):
    """sizes: list of (w, h). Returns (atlas_w, atlas_h, [(x, y)]) where (x, y)
    is the top-left of the painted area (gutter excluded)."""
    if not sizes:
        return 16, 16, []
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
    total = sum((w + 2 * gutter) * (h + 2 * gutter) for w, h in sizes)
    widest = max(w for w, _ in sizes) + 2 * gutter
    best = None
    width = _pow2(max(widest, 16))
    while width <= max_size:
        pos = [None] * len(sizes)
        x = y = shelf_h = 0
        for i in order:
            w, h = sizes[i]
            gw, gh = w + 2 * gutter, h + 2 * gutter
            if x + gw > width:
                y += shelf_h
                x = shelf_h = 0
            pos[i] = (x + gutter, y + gutter)
            x += gw
            shelf_h = max(shelf_h, gh)
        height = _pow2(y + shelf_h)
        score = (max(width, height), width * height)
        if best is None or score < best[0]:
            best = (score, width, height, pos)
        if width * width >= 4 * total:
            break
        width *= 2
    _, w, h, pos = best
    return w, h, pos
