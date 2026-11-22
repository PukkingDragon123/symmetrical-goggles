"""Shared ramps and painted-detail generators for the Winterworks "Living End" 3D art (monolith.py, end_glider.py,
obsidian_shield.py, monolith_wand.py and chorus_cocoon.py, all in this folder).

The palette is vanilla-friendly End: obsidian (violet-black), crying obsidian (the saturated violet glow of runes,
cracks and seams), purpur, End stone, a weathered grey-violet stone, gold that shades into violet, iron, the starry
void of a void rod and the hot embers of a meteorite core. Every ramp runs darkest first and hue-shifts: shadows lean
violet and saturated, lights lean warm.

Rig, card and clip helpers come from hex_kit.py.
"""
import math
import random

# ======================================================================= ramps
RAMPS = {
    "obsidian": ["#07040d", "#0e0819", "#160e26", "#1f1534", "#2a1d44", "#372756", "#46336a", "#58427f", "#6d5594"],
    # glows: crying obsidian (runes, cracks, seams) and the Monolith's eyes
    "crying": ["#3a0b6e", "#5a12a0", "#7a1fd0", "#9a3cf0", "#b866ff", "#d397ff", "#ecc9ff", "#fbf0ff"],
    "eye": ["#46075a", "#6e0e86", "#9a1fb4", "#c13ddb", "#de6cf2", "#f0a6fb", "#fcdcff", "#ffffff"],
    # the whites of the eyes: pale lilac, shading violet (not a glow: the irises glow, the eyeballs are lit)
    "sclera": ["#2b2136", "#3f3350", "#58496b", "#736587", "#9183a3", "#afa3bf", "#cbc2d8", "#e4def0", "#f6f3fb"],
    "stone": ["#18141f", "#25202d", "#342e3d", "#463f50", "#5a5264", "#706879", "#88808f", "#a29aa6", "#bdb6bc"],
    "gold": ["#2b1233", "#4b1f3e", "#73343f", "#9c5441", "#c27f4a", "#dfac5e", "#f2d27f", "#fdf0b8"],
    "purpur": ["#3a2140", "#55335c", "#74497c", "#93649b", "#ae82b5", "#c7a1cc", "#ddc1e0"],
    "endstone": ["#4f4a35", "#6d6a48", "#8f8c5e", "#b0ae78", "#cdcc93", "#e3e3ae", "#f3f3cc"],
    "iron": ["#1e1d24", "#33323b", "#4b4a54", "#65646e", "#82818a", "#a2a1a8", "#c4c3c8", "#e6e5e8"],
    "void": ["#040209", "#0a0616", "#110b24", "#1a1234", "#251a46", "#33245a"],
    "star": ["#6f5fc8", "#a99bf5", "#e4ddff", "#ffffff"],
    "ember": ["#3b0d0a", "#6e1d0c", "#a8380f", "#d8611a", "#f28f2c", "#ffc35a", "#fff0b0"],
    # meteorite (as the blocks, winterworks_end_art.py): a scorched fusion crust, warm black-brown with cool
    # iron-nickel lights, and its molten glow from the edge to the heart: violet, magenta, rose, orange, amber, gold, white
    "meteor": ["#0b0708", "#130e0f", "#1c1617", "#262021", "#312a2a", "#3e3535", "#4d4343", "#625857", "#867e7c",
               "#bab4b0"],
    "molten": ["#3a0c5c", "#6c1585", "#a8237f", "#e04a5a", "#ff7d2a", "#ffad35", "#ffd76a", "#fff4c2", "#fffdf2"],
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


# ======================================================================= round eyes
# Every eye in the Living End is round: a round opening (no almond points), a circular iris with a round pupil, a soft
# catch-light up and to the left, a shaded eyeball and, where the creature has lids, a lash line and a lit lower lid.
# Discs are drawn as classic pixel-art circles: centred on a texel centre for odd diameters and on a texel corner for
# even ones, every texel whose centre lies within the radius (4 -> .##./####, 6 -> .####./######, 10 -> ...####...
# /.########.), and 3 a plus, so nothing goes square or diamond-shaped.
def in_disc(x, y, cx, cy, d):
    """Is texel (x, y) inside a pixel-art disc d texels across centred at (cx, cy)? Coordinates are texel corners."""
    return math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= d / 2.0 + (1e-6 if d > 3 else -0.1)


def in_oval(x, y, cx, cy, w, h):
    """Is texel (x, y) inside a pixel-art oval w x h texels centred at (cx, cy)?"""
    return ((x + 0.5 - cx) / (w / 2.0)) ** 2 + ((y + 0.5 - cy) / (h / 2.0)) ** 2 <= 1.0 + 1e-6


def pupil_for(d):
    """A pupil about 0.38 of an iris d texels across, with d's parity so it sits dead centre."""
    p = int(round(d * 0.38))
    return max(1, p - 1 if (p - d) % 2 else p)


def paint_iris(rows, cx, cy, d, pupil, keep, ring="o", outer="i", body="I", lit="J", collar="c", hole="p",
                hole_edge="q", glint="W", soft="w", lid_shade=0):
    """Paint a round iris (d texels) with its pupil and catch-lights into `rows` (lists of chars) wherever `keep(x, y)`
    allows; `lid_shade` rows at the top of the iris fall in the upper lid's shadow (darker)."""
    H, W = len(rows), len(rows[0])
    R = d / 2.0
    top = cy - R
    inside = {(x, y) for y in range(H) for x in range(W) if in_disc(x, y, cx, cy, d)}
    hole_px = {(x, y) for (x, y) in inside if in_disc(x, y, cx, cy, pupil)} if pupil else set()
    n_fib = max(10, int(round(d * 1.4)))
    for (x, y) in inside:
        if not keep(x, y):
            continue
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        t = math.hypot(dx, dy) / R
        if (x, y) in hole_px:
            rows[y][x] = hole
            continue
        if pupil == 3 and abs(dx) < 1.6 and abs(dy) < 1.6:
            rows[y][x] = hole_edge              # a 3-texel pupil's corners, half dark, so it reads round, not a plus
            continue
        edge = any((x + ex, y + ey) not in inside for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge and d >= 5:
            rows[y][x] = ring
            continue
        if hole_px and d >= 8 and dy > 0 and any((x + ex, y + ey) in hole_px
                                                 for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            rows[y][x] = collar                 # the collarette catches the pooled light under the pupil
            continue
        # light comes through the cornea from the top-left and pools low in the iris; the lid shades its top
        tone = 0.75 * (dy / R) + 0.3 * (dx / R) * 0.5 + 0.25 * (1.0 - t)
        sector = int((math.atan2(dy, dx) + math.pi) / (2 * math.pi) * n_fib)
        if d >= 9 and t > 0.5 and sector % 2:
            tone += 0.3                         # fine radial fibres in the outer iris
        if y + 0.5 < top + lid_shade:
            tone -= 0.8
        rows[y][x] = outer if tone < -0.15 else (body if tone < 0.4 else lit)
    # the catch-light: a soft blob over the pupil's upper-left edge, and a small second one low on the right
    pr = max(pupil, 2) / 2.0
    gx, gy = cx - pr * 0.75 - 0.5, cy - pr * 0.75 - 0.5
    blob = [(0, 0)] if d < 10 else [(0, 0), (1, 0), (0, 1), (1, 1)]
    halo = [] if d < 7 else ([(2, 0), (-1, 1)] if d < 10 else [(2, 0), (2, 1), (0, 2), (-1, 1)])
    for ox, oy in blob:
        x, y = int(math.floor(gx)) + ox - (1 if d >= 10 else 0), int(math.floor(gy)) + oy - (1 if d >= 10 else 0)
        if (x, y) in inside and keep(x, y):
            rows[y][x] = glint
    for ox, oy in halo:
        x, y = int(math.floor(gx)) + ox - (1 if d >= 10 else 0), int(math.floor(gy)) + oy - (1 if d >= 10 else 0)
        if (x, y) in inside and keep(x, y) and rows[y][x] not in (glint, ring):
            rows[y][x] = soft
    if d >= 7:
        x, y = int(math.floor(cx + R * 0.42)), int(math.floor(cy + R * 0.4))
        if (x, y) in inside and keep(x, y) and rows[y][x] not in (hole, ring):
            rows[y][x] = soft


def iris_card(d, pupil=None, **chars):
    """A round iris d texels across, transparent outside the disc, for a card that moves over an eyeball: a dark
    limbal ring (`ring`), the iris darker round the outside and the top (`outer`), mid (`body`) and lit low where the
    light pools (`lit`), fine radial fibres, a bright collarette (`collar`) round the round pupil (`hole`; `pupil`
    texels across, default pupil_for(d); a 3-texel pupil gets half-dark corners, `hole_edge`), a soft catch-light
    (`glint`, `soft`)."""
    if pupil is None:
        pupil = pupil_for(d)
    rows = [["."] * d for _ in range(d)]
    paint_iris(rows, d / 2.0, d / 2.0, d, pupil, lambda x, y: True, **chars)
    return ["".join(r) for r in rows]


def eyeball(w, h, ow=None, oh=None, iris=None, pupil=None, look=(0.0, 0.0), lid_shade=2, lid="L", crease="k",
            lash="u", lower="l", shade="d", white="s", lit_white="S", **chars):
    """A round eye on a w x h face. The opening is an oval ow x oh texels (default: the face less a 1-texel lid all
    round) centred on the face; outside it the lid (`lid`), darkest in the corners (`crease`), with a lit rim under the
    opening (`lower`). Inside: a dark lash line along the top (`lash`), the eyeball shaded at its rim and under the
    upper lid (`shade`), lighter low in the middle (`white`, `lit_white`). With `iris` (texels across) the iris and
    pupil are painted in too (offset by `look`, clipped by the lids, the top `lid_shade` rows in the lid's shadow);
    leave it out when the iris is a separate card. Extra keyword chars go to the iris (see iris_card)."""
    ow = ow or w - 2
    oh = oh or h - 2
    cx, cy = w / 2.0, h / 2.0
    rows = [[lid] * w for _ in range(h)]
    inside = {(x, y) for y in range(h) for x in range(w) if in_oval(x, y, cx, cy, ow, oh)}
    for y in range(h):
        for x in range(w):
            if (x, y) in inside:
                continue
            # corners of the face, far from the opening, sink into the socket
            u, v = (x + 0.5 - cx) / (w / 2.0), (y + 0.5 - cy) / (h / 2.0)
            if u * u + v * v > 1.15:
                rows[y][x] = crease
            elif (x, y - 1) in inside and (x, y - 2) in inside:
                rows[y][x] = lower
    for (x, y) in inside:
        dx, dy = (x + 0.5 - cx) / (ow / 2.0), (y + 0.5 - cy) / (oh / 2.0)
        r = math.hypot(dx, dy)
        if (x, y - 1) not in inside:
            rows[y][x] = lash
        elif (x, y - 1 - lid_shade + 1) not in inside or r > 0.86:
            rows[y][x] = shade
        elif r < 0.55 and dy > -0.15:
            rows[y][x] = lit_white
        else:
            rows[y][x] = white
    if iris:
        p = pupil if pupil is not None else pupil_for(iris)
        icx = cx + look[0] + (0.5 if (iris - w) % 2 else 0.0)
        icy = cy + look[1] + (0.5 if (iris - h) % 2 else 0.0)
        paint_iris(rows, icx, icy, iris, p, lambda x, y: (x, y) in inside and rows[y][x] != lash, lid_shade=lid_shade,
                    **chars)
    return ["".join(r) for r in rows]


def eye_hole(ow, oh, pad=2, hole="_", crease="k", lower="l", rim="S", rim_dim="s"):
    """A round eye opening cut through a face (stamp it there and set the eyeball just behind it, so the face itself
    rounds the eye and clips the iris): a transparent oval hole ow x oh texels (`hole`), a 1-texel dark lid crease
    round it (`crease`; its lower half the lit lower-lid margin `lower`), and outside that a rim bleeding light
    (`rim`, every third texel `rim_dim`) round the sides and bottom; no paint ('.') elsewhere. Rows are ow + 2 pad
    by oh + 2 pad, centred on the hole."""
    W, H = ow + 2 * pad, oh + 2 * pad
    cx, cy = W / 2.0, H / 2.0
    rows = [["."] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if in_oval(x, y, cx, cy, ow, oh):
                rows[y][x] = hole
            elif in_oval(x, y, cx, cy, ow + 2, oh + 2):
                rows[y][x] = lower if y + 0.5 > cy + oh * 0.2 else crease
            elif in_oval(x, y, cx, cy, W, H) and y + 0.5 > cy - oh * 0.25:
                rows[y][x] = rim_dim if (x + y) % 3 == 0 else rim
    return ["".join(r) for r in rows]


def lid_frame(w, h, ow, oh, hole=".", lid="L", crease="k", lower="l", fold="F", lit="M", dy=0):
    """The lids round a round eye, for a card set just in front of the eyeball and its iris card: a w x h face with
    a transparent oval opening ow x oh texels (`hole`; moved down `dy` texels), a dark crease round it (`crease`), the
    lower lid's lit margin under it (`lower`), the upper lid's fold (`fold`) curving over it with a lit ridge (`lit`)
    above that, and the lid (`lid`) everywhere else."""
    cx, cy = w / 2.0, h / 2.0 + dy
    rows = [[lid] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if in_oval(x, y, cx, cy, ow, oh):
                rows[y][x] = hole
            elif in_oval(x, y, cx, cy, ow + 2, oh + 2):
                rows[y][x] = lower if y + 0.5 > cy + oh * 0.2 else crease
            elif y + 0.5 < cy - oh * 0.2 and in_oval(x, y, cx, cy - 1.5, ow + 4, oh + 4):
                rows[y][x] = fold
            elif y + 0.5 < cy - oh * 0.2 and in_oval(x, y, cx, cy - 2.0, ow + 6, oh + 5):
                rows[y][x] = lit
    return ["".join(r) for r in rows]


def socket_ring(w, h, pad=2, rim="S", rim_dim="s", hollow="k"):
    """A round socket pad texels larger all round than a w x h eye: a dark hollow (`hollow`) whose rim bleeds light
    (`rim`, every third texel dimmer: `rim_dim`); transparent ('.') outside."""
    W, H = w + 2 * pad, h + 2 * pad
    cx, cy = W / 2.0, H / 2.0
    inside = {(x, y) for y in range(H) for x in range(W) if in_oval(x, y, cx, cy, W, H)}
    rows = [["."] * W for _ in range(H)]
    for (x, y) in inside:
        edge = any((x + ex, y + ey) not in inside for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        rows[y][x] = (rim_dim if (x + y) % 3 == 0 else rim) if edge else hollow
    return ["".join(r) for r in rows]


def almond(w, h, ring="o", body="e", hot="E", core="W", corner="k", slit=None):
    """Legacy name, kept so older callers still build: now a round eye filling a w x h face (no almond points, no
    slit): `corner` outside a round opening, the glowing iris (`body`, lit `hot`) ringed by `ring`, a round dark pupil
    (`slit` if given, else `corner`) and a white-hot catch-light (`core`)."""
    return eyeball(w, h, iris=min(w, h) - 2, lid=corner, crease=corner, lash=ring, lower=corner, shade=ring,
                   white=body, lit_white=body, ring=ring, outer=body, body=body, lit=hot, collar=hot,
                   hole=slit or corner, glint=core, soft=hot)


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
