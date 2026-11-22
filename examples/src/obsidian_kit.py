"""Shared ramps and painted-detail generators for the Winterworks "Living End" 3D art (monolith.py, end_glider.py,
obsidian_shield.py, monolith_wand.py, chorus_cocoon.py and winterworks_end_gear_icons.py, all in this folder).

The palette is vanilla-friendly End: obsidian (violet-black), crying obsidian (the saturated violet glow of runes,
cracks and seams), purpur, End stone, a weathered grey-violet stone, gold that shades into violet, iron, the starry
void of a void rod and the hot embers of a meteorite core. Every ramp runs darkest first and hue-shifts: shadows lean
violet and saturated, lights lean warm.

Rig, card and clip helpers come from hex_kit.py.
"""
import random

# ======================================================================= ramps
RAMPS = {
    "obsidian": ["#07040d", "#0e0819", "#160e26", "#1f1534", "#2a1d44", "#372756", "#46336a", "#58427f", "#6d5594"],
    # glows: crying obsidian (runes, cracks, seams) and the Monolith's eyes
    "crying": ["#3a0b6e", "#5a12a0", "#7a1fd0", "#9a3cf0", "#b866ff", "#d397ff", "#ecc9ff", "#fbf0ff"],
    "eye": ["#46075a", "#6e0e86", "#9a1fb4", "#c13ddb", "#de6cf2", "#f0a6fb", "#fcdcff", "#ffffff"],
    "stone": ["#18141f", "#25202d", "#342e3d", "#463f50", "#5a5264", "#706879", "#88808f", "#a29aa6", "#bdb6bc"],
    "gold": ["#2b1233", "#4b1f3e", "#73343f", "#9c5441", "#c27f4a", "#dfac5e", "#f2d27f", "#fdf0b8"],
    "purpur": ["#3a2140", "#55335c", "#74497c", "#93649b", "#ae82b5", "#c7a1cc", "#ddc1e0"],
    "endstone": ["#4f4a35", "#6d6a48", "#8f8c5e", "#b0ae78", "#cdcc93", "#e3e3ae", "#f3f3cc"],
    "iron": ["#1e1d24", "#33323b", "#4b4a54", "#65646e", "#82818a", "#a2a1a8", "#c4c3c8", "#e6e5e8"],
    "void": ["#040209", "#0a0616", "#110b24", "#1a1234", "#251a46", "#33245a"],
    "star": ["#6f5fc8", "#a99bf5", "#e4ddff", "#ffffff"],
    "ember": ["#3b0d0a", "#6e1d0c", "#a8380f", "#d8611a", "#f28f2c", "#ffc35a", "#fff0b0"],
}

# ======================================================================= rune glyphs (original, 5 x 7)
GLYPHS = [
    ["#.#.#", "#.#.#", "#####", "..#..", "..#..", ".###.", "..#.."],     # trident
    [".....", ".###.", "#.#.#", ".###.", "..#..", "..#..", ".###."],     # eye on a stem
    ["###..", "..#..", "..###", "....#", "..###", "..#..", "###.."],     # stair
    ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],     # hourglass
    ["####.", "...#.", ".#.#.", ".#.#.", ".###.", ".#...", ".#..."],     # hook
    ["..#..", ".#.#.", "#.#.#", ".#.#.", "..#..", "..#..", "#####"],     # diamond on a bar
    ["..#..", ".###.", "#.#.#", "..#..", "..#..", ".#.#.", "#...#"],     # arrow
    ["#####", "#.#.#", "#.#.#", ".....", "..#..", ".###.", "#.#.#"],     # comb
    ["#....", "##...", "#.#..", "#..#.", "#.#..", "##...", "#...."],     # wedge
    [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],     # lattice
    ["..#..", "..#..", "#.#.#", "#####", "#.#.#", "..#..", "..#.."],     # cross-staff
    ["###.#", "#...#", "#.###", "#....", "#.###", "#...#", "###.#"],     # maze
]


def engrave(glyph, stroke="r", groove="g"):
    """A glyph cut into stone: the strokes (`stroke`) ringed by a 1px dark groove (`groove`). Returns rows 2 wider
    and 2 taller than the glyph."""
    h, w = len(glyph), len(glyph[0])
    out = [["."] * (w + 2) for _ in range(h + 2)]
    for y in range(h):
        for x in range(w):
            if glyph[y][x] == "#":
                out[y + 1][x + 1] = stroke
    for y in range(h + 2):
        for x in range(w + 2):
            if out[y][x] != ".":
                continue
            near = any(0 <= y + dy < h + 2 and 0 <= x + dx < w + 2 and out[y + dy][x + dx] == stroke
                       for dy in (-1, 0, 1) for dx in (-1, 0, 1))
            if near:
                out[y][x] = groove
    return ["".join(r) for r in out]


def rune_column(n, seed, frame=True, bright_every=3):
    """`n` engraved glyphs stacked in a carved channel: dark channel walls (`w`) left and right, glyph strokes
    glowing (`r`, every `bright_every`-th glyph white-hot `R`), dark grooves round them (`g`)."""
    rng = random.Random(seed)
    picks = list(range(len(GLYPHS)))
    rng.shuffle(picks)
    rows = []
    for k in range(n):
        g = engrave(GLYPHS[picks[k % len(picks)]], stroke="R" if (k + seed) % bright_every == 0 else "r")
        rows += g if k == 0 else g[1:]          # neighbours share a groove row
    if frame:
        rows = ["w" + r + "w" for r in rows]
    return rows


def rune_row(n, seed, gap=0):
    """`n` engraved glyphs side by side (a horizontal inscription)."""
    rng = random.Random(seed)
    picks = list(range(len(GLYPHS)))
    rng.shuffle(picks)
    gl = [engrave(GLYPHS[picks[k % len(picks)]], stroke="R" if k % 3 == 1 else "r") for k in range(n)]
    out = []
    for y in range(len(gl[0])):
        out.append(("." * gap).join(g[y] for g in gl))
    return out


def almond(w, h, ring="o", body="e", hot="E", core="W", corner="k", slit=None):
    """An almond (pointed-oval) eye filling a w x h face: dark corners (`corner`), a mid-tone rim (`ring`), the
    glowing body (`body`), a hot centre (`hot`) and a white-hot core (`core`). `slit` (a char) paints a vertical
    slit pupil down the middle."""
    rows = []
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    for y in range(h):
        row = []
        for x in range(w):
            u = abs(x - cx) / (w / 2.0)
            v = abs(y - cy) / (h / 2.0)
            d = u ** 1.35 + v ** 1.7          # pointed at the ends, full in the middle
            if d > 1.0:
                row.append(corner)
            elif d > 0.78:
                row.append(ring)
            elif d > 0.42:
                row.append(body)
            elif d > 0.16:
                row.append(hot)
            else:
                row.append(core)
        rows.append(row)
    if slit:
        for y in range(h):
            v = abs(y - cy) / (h / 2.0)
            if v < 0.86:
                rows[y][int(round(cx - 0.01))] = slit
                if w % 2 == 0:
                    rows[y][int(round(cx + 0.01)) if w > 2 else 0] = slit
    return ["".join(r) for r in rows]


def crack_line(w, h, seed, x0=None, branches=2, core="c", hot="C", edge="d"):
    """A jagged glowing crack running down a w x h stamp: a random walk from the top row that jogs sideways in
    1-3 px steps, a 1px dark lip (`edge`) on both sides, a hot core (`hot`) where the crack is widest, and short
    side branches. Returns stamp rows."""
    rng = random.Random(seed)
    grid = [["."] * w for _ in range(h)]

    def walk(x, y, length, drift):
        pts = []
        for _ in range(length):
            if not (0 <= y < h):
                break
            pts.append((x, y))
            y += 1
            if rng.random() < 0.55:
                x += rng.choice((-1, 1)) if rng.random() < 0.5 else drift
                x = max(1, min(w - 2, x))
        return pts

    x = x0 if x0 is not None else w // 2
    main = walk(x, 0, h, rng.choice((-1, 1)))
    lines = [(main, True)]
    for _ in range(branches):
        if len(main) > 6:
            bx, by = main[rng.randrange(2, len(main) - 3)]
            lines.append((walk(bx, by, rng.randrange(4, max(5, h // 3)), rng.choice((-1, 1))), False))
    for pts, is_main in lines:
        for i, (x, y) in enumerate(pts):
            grid[y][x] = hot if is_main and 0.25 < i / max(len(pts), 1) < 0.7 and i % 3 else core
    for y in range(h):
        for x in range(w):
            if grid[y][x] == "." and any(0 <= x + dx < w and grid[y][x + dx] in (core, hot) for dx in (-1, 1)):
                grid[y][x] = edge
    return ["".join(r) for r in grid]


def scatter(w, h, seed, density, chars):
    """Sparse single and paired specks (stars, embers) over a w x h face, as stamp rows."""
    rng = random.Random(seed)
    rows = [["."] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if rng.random() < density:
                c = rng.choice(chars)
                rows[y][x] = c
                if rng.random() < 0.2 and x + 1 < w:      # a few twinkles get a second texel
                    rows[y][x + 1] = chars[0]
    return ["".join(r) for r in rows]
