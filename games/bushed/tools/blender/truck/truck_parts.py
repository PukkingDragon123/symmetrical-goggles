# Logging-truck parts for BUSHED, built on the taxi pipeline's helpers (vlib): the chassis frame
# with kick-ups, leaf springs and beam axles, the flatbed (steel bearers, rough-sawn plank deck,
# angle-iron edges), three log bunks with timber stakes in steel sockets, the headache rack, a winch
# bumper (drum with wound cable, motor, gearbox, roller fairlead, hook), the roof light bar, mud
# flaps, steps, saddle tank, toolbox, exhaust, tail lamps, plate and the all-terrain wheels.
#
# Blender frame as in taxi_body (X = driver side before the final mirror, Y forward, Z up), at
# the truck's ride height (the cab is lifted by LIFT).
import math
import numpy as np
import bmesh
from mathutils import Vector, Matrix
import vlib
from vlib import (lathe, sweep, join, delete, duplicate, extrude_outline, rounded_poly_2d, rounded_rect_2d,
                  rrect_profile, circle_profile, tube, box, assign_mat, mat, add_bevel, apply_modifiers,
                  set_sharp_by_angle, new_mesh_obj, grid_faces, recalc_normals, add_solidify, log)

LIFT = 0.30           # cab / body lift over the taxi's ride height
R = 0.37              # tyre radius (31x10.5R15-ish all-terrain)
TW = 0.255            # tyre width
AXF = 1.31            # front axle (taxi's)
AXR = -1.80           # rear axle, moved back under the bed
TRACK = 1.48          # wheel centres at x = +-0.74
Y_CUT = -0.62         # the cab ends here (behind the seats); the back wall sits behind it
DECK = dict(x=0.98, y0=-0.70, y1=-3.10, top=0.95)
BUNK_Y = (-1.00, -1.95, -2.90)
BUNK_TOP = 1.05
STAKE_TOP = 1.86
STAKE_X = 0.925


def _rng(seed):
    return np.random.default_rng(seed)


def channel_profile(w, h, t, open_dir=-1):
    """C-channel cross-section (a = lateral, b = vertical); web on the +a side when open_dir < 0."""
    a0, a1 = -w / 2, w / 2
    if open_dir > 0:
        a0, a1 = a1, a0
    s = 1 if a1 > a0 else -1
    pts = [(a1, -h / 2), (a1, h / 2), (a0, h / 2), (a0, h / 2 - t), (a1 - s * t, h / 2 - t),
           (a1 - s * t, -h / 2 + t), (a0, -h / 2 + t), (a0, -h / 2)]
    if s < 0:
        pts = pts[::-1]
    return pts


def angle_profile(w, h, t):
    """L-section: vertical leg on +a... (a lateral, b vertical)."""
    return [(0, 0), (w, 0), (w, t), (t, t), (t, h), (0, h)]


def polyline_round(pts, r=0.04, seg=4):
    """Round the corners of a 3D polyline with small circular-ish fillets (quadratic)."""
    P = [np.asarray(p, float) for p in pts]
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        da, dc = a - b, c - b
        la, lc = np.linalg.norm(da), np.linalg.norm(dc)
        rr = min(r, la * 0.45, lc * 0.45)
        p0 = b + da / la * rr
        p1 = b + dc / lc * rr
        for k in range(seg + 1):
            t = k / seg
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p1)
    out.append(P[-1])
    return [tuple(p) for p in out]


def densify(pts, step=0.08):
    out = []
    P = [np.asarray(p, float) for p in pts]
    for i in range(len(P) - 1):
        a, b = P[i], P[i + 1]
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        for k in range(n):
            out.append(tuple(a + (b - a) * k / n))
    out.append(tuple(P[-1]))
    return out


def rough_box(name, size, center, m, seed=0, bevel=0.006, warp=0.004, nx=6, rough=0.0015):
    """A sawn board / post: bevelled box, subdivided along its long axis, warped and rough."""
    sx, sy, sz = size
    ob = box(name, size, center=center, mat=None, bevel_w=0.0)
    longest = int(np.argmax(size))
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    cuts = max(1, nx)
    edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co)[longest]) > 1e-4]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
    bm.to_mesh(ob.data)
    bm.free()
    add_bevel(ob, bevel, 2, angle=30)
    apply_modifiers(ob)
    g = _rng(seed)
    ph = g.uniform(0, 6.28, 4)
    L = size[longest]
    c = np.asarray(center, float)
    for v in ob.data.vertices:
        p = np.array(v.co)
        t = (p[longest] - c[longest]) / max(L, 1e-6)
        bend = warp * math.sin(t * math.pi * (1.2 + 0.5 * math.sin(ph[0])) + ph[1])
        twist = warp * 0.6 * math.sin(t * 3.1 + ph[2])
        d = np.zeros(3)
        o1, o2 = [k for k in range(3) if k != longest]
        d[o2] += bend + twist * (p[o1] - c[o1]) / max(size[o1], 1e-6)
        d += g.normal(0, rough, 3)
        v.co = Vector(p + d)
    set_sharp_by_angle(ob, 35)
    assign_mat(ob, m)
    return ob


class TruckParts:
    def __init__(self):
        self.objs = {}

    def add(self, name, ob):
        self.objs[name] = ob
        return ob

    def build(self):
        self.frame()
        self.axles_springs()
        self.deck()
        self.bunks()
        self.headache_rack()
        self.light_bar()
        self.winch_bumper()
        self.mud_flaps()
        self.rear_end()
        self.tank_box_steps()
        self.exhaust()
        self.wheels()
        for nm in ('frame', 'axles', 'deck_steel', 'bunks', 'headache_rack', 'bumper_front', 'rear_end',
                   'tank_box_steps', 'mud_flaps', 'light_bar_base', 'work_lamps'):
            recalc_normals(self.objs[nm])
        log('truck parts', sorted(self.objs))

    # ---------------------------------------------------------------------------------- chassis
    def frame(self):
        rails = []
        for side in (1, -1):
            x = side * 0.43
            path = densify(polyline_round([(x, 2.08, 0.55), (x, 1.00, 0.55), (x, 0.72, 0.39), (x, -0.38, 0.39),
                                           (x, -0.72, 0.56), (x, -3.10, 0.56)], 0.10, 5), 0.12)
            prof = channel_profile(0.075, 0.19, 0.007, open_dir=-side)
            rails.append(sweep('rail', path, prof, normals=[(1, 0, 0)] * len(path), smooth=False, cap=True))
        # cross-members (tubular under the bed, a channel under the cab back)
        for y, z in ((-0.95, 0.53), (-1.45, 0.53), (-2.25, 0.53), (-2.95, 0.53)):
            rails.append(tube('xm', [(-0.43, y, z), (0.43, y, z)], 0.038, 12))
        rails.append(sweep('xm_c', [(-0.43, 1.95, 0.55), (0.43, 1.95, 0.55)], channel_profile(0.07, 0.15, 0.006),
                           normals=[(0, 1, 0)] * 2, smooth=False, cap=True))
        fr = join(rails, name='frame')
        set_sharp_by_angle(fr, 35)
        assign_mat(fr, 'steel_rough')
        self.add('frame', fr)

    def axles_springs(self):
        parts = []
        for y in (AXF, AXR):
            # beam axle with a pumpkin differential (offset to the passenger side up front, centred at the back)
            parts.append(tube('axle', [(-0.66, y, R), (0.66, y, R)], 0.042, 16))
            dx = -0.12 if y > 0 else 0.0
            diff = lathe('diff', [(0.0, -0.10), (0.07, -0.10), (0.12, -0.06), (0.14, 0.0), (0.12, 0.07), (0.08, 0.10),
                                  (0.05, 0.13), (0.0, 0.13)], segments=24, axis='Y', center=(dx, y, R))
            parts.append(diff)
            parts.append(lathe('pinion', [(0.0, 0.10), (0.045, 0.10), (0.045, 0.26), (0.03, 0.28), (0.0, 0.28)],
                               segments=14, axis='Y', center=(dx, y, R)) if y < 0 else
                         lathe('pinion', [(0.0, -0.10), (0.045, -0.10), (0.045, -0.26), (0.03, -0.28), (0.0, -0.28)],
                               segments=14, axis='Y', center=(dx, y, R)))
            # leaf springs: stacked curved leaves under the rails, U-bolts round the axle
            rail_z = 0.39 if y > 0 else 0.56
            if y > 0:
                rail_z = 0.46
            for side in (1, -1):
                x = side * 0.43
                for k in range(4):
                    half = 0.62 - k * 0.11
                    sag = 0.06 - k * 0.004
                    path = []
                    for i in range(13):
                        t = -1 + 2 * i / 12
                        path.append((x, y + t * half, rail_z - 0.06 - k * 0.013 - sag * (1 - t * t)))
                    leaf = sweep('leaf', path, rrect_profile(0.06, 0.009, 0.002, 1), normals=[(1, 0, 0)] * len(path),
                                 smooth=False, cap=True)
                    parts.append(leaf)
                for dy in (-0.05, 0.05):
                    ub = [(x - 0.035, y + dy, R - 0.05), (x - 0.035, y + dy, rail_z - 0.09), (x + 0.035, y + dy, rail_z - 0.09),
                          (x + 0.035, y + dy, R - 0.05)]
                    parts.append(tube('ubolt', polyline_round(ub, 0.02, 3), 0.008, 8))
        ax = join(parts, name='axles')
        set_sharp_by_angle(ax, 35)
        assign_mat(ax, 'steel_rough')
        self.add('axles', ax)

    # ---------------------------------------------------------------------------------- the bed
    def deck(self):
        D = DECK
        parts = []
        # longitudinal sills on the rails, then cross bearers under the planks
        for side in (1, -1):
            parts.append(sweep('sill', [(side * 0.43, D['y0'], 0.72), (side * 0.43, D['y1'], 0.72)],
                               channel_profile(0.07, 0.13, 0.006, open_dir=-side), normals=[(1, 0, 0)] * 2,
                               smooth=False, cap=True))
        ys = np.linspace(D['y0'] - 0.05, D['y1'] + 0.05, 7)
        for y in ys:
            parts.append(sweep('bearer', [(-D['x'] + 0.01, y, 0.845), (D['x'] - 0.01, y, 0.845)],
                               channel_profile(0.06, 0.11, 0.005), normals=[(0, 1, 0)] * 2, smooth=False, cap=True))
        steel = join(parts, name='deck_steel')
        # angle-iron edge round the deck, with stake pockets on the sides
        edge = []
        L = angle_profile(0.05, 0.10, 0.006)
        for side in (1, -1):
            x = side * D['x']
            prof = [(-a * side, b) for a, b in L]
            if side < 0:
                prof = prof[::-1]
            edge.append(sweep('edge', [(x, D['y0'], D['top'] - 0.10), (x, D['y1'], D['top'] - 0.10)], prof,
                              normals=[(1, 0, 0)] * 2, smooth=False, cap=True))
            for y in (-1.45, -2.42):
                pk = extrude_outline('pocket', rounded_rect_2d(-0.035, -0.035, 0.035, 0.035, 0.008, 2), D['top'] - 0.16,
                                     D['top'] - 0.02, plane='XY', bevel_w=0.003)
                pk.data.transform(Matrix.Translation((x + side * 0.04, y, 0)))
                edge.append(pk)
        for y, s in ((D['y1'], -1), (D['y0'], 1)):
            prof = [(a, b) for a, b in L]
            edge.append(sweep('edge_x', [(-D['x'], y, D['top'] - 0.10), (D['x'], y, D['top'] - 0.10)],
                              [(-a * s, b) for a, b in prof][::(1 if s > 0 else -1)], normals=[(0, 1, 0)] * 2,
                              smooth=False, cap=True))
        steel = join([steel] + edge, name='deck_steel')
        set_sharp_by_angle(steel, 35)
        assign_mat(steel, 'steel_rough')
        self.add('deck_steel', steel)
        # rough-sawn planks laid lengthwise, small gaps, ragged ends, a cracked and a replaced one
        planks = []
        n = 10
        w = (2 * D['x'] - 0.02 - (n - 1) * 0.008) / n
        g = _rng(5)
        for i in range(n):
            x = -D['x'] + 0.01 + w / 2 + i * (w + 0.008)
            y0 = D['y0'] - 0.005 - g.uniform(0, 0.015)
            y1 = D['y1'] + 0.005 + g.uniform(0, 0.015)
            th = 0.045 + g.uniform(-0.004, 0.004)
            p = rough_box(f'plank{i}', (w - g.uniform(0, 0.01), y0 - y1, th), (x, (y0 + y1) / 2, D['top'] - th / 2),
                          'wood_deck', seed=100 + i, warp=0.0035, nx=5)
            planks.append(p)
        # bolt heads along the bearers
        for y in ys[1:-1]:
            for i in range(n):
                x = -D['x'] + 0.01 + w / 2 + i * (w + 0.008)
                b = lathe('bolt', [(0.0, 0.0), (0.012, 0.0), (0.012, 0.004), (0.0, 0.007)], segments=8, axis='Z',
                          center=(x, y, D['top'] - 0.002))
                assign_mat(b, 'steel_rough')
                planks.append(b)
        dk = join(planks, name='deck')
        self.add('deck', dk)

    def bunks(self):
        parts, stakes = [], []
        g = _rng(9)
        for bi, y in enumerate(BUNK_Y):
            # box-section bunk beam with a slight crown, end sockets
            path = [(x, y, DECK['top'] + 0.05 + 0.006 * (1 - (x / 0.95) ** 2)) for x in np.linspace(-0.95, 0.95, 9)]
            parts.append(sweep('bunk', path, rrect_profile(0.11, 0.10, 0.01, 2), normals=[(0, 1, 0)] * len(path),
                               smooth=False, cap=True))
            for side in (1, -1):
                x = side * STAKE_X
                sk = extrude_outline('socket', rounded_rect_2d(-0.06, -0.06, 0.06, 0.06, 0.01, 2), DECK['top'],
                                     BUNK_TOP + 0.16, plane='XY', bevel_w=0.004)
                sk.data.transform(Matrix.Translation((x, y, 0)))
                parts.append(sk)
                # gusset plate inside the socket
                gp = extrude_outline('gusset', [(0, 0), (-side * 0.12, 0), (0, 0.10)], -0.004, 0.004, plane='XZ')
                gp.data.transform(Matrix.Translation((x - side * 0.06, y, BUNK_TOP)))
                recalc_normals(gp)
                parts.append(gp)
                # a timber stake: tapered, leaning out a touch, hand-cut top
                h = STAKE_TOP - BUNK_TOP + g.uniform(-0.05, 0.04)
                st = rough_box('stake', (0.085, 0.085, h + 0.12), (0, 0, (h + 0.12) / 2), 'wood_deck', seed=300 + bi * 2 +
                               (side > 0), warp=0.004, nx=4, bevel=0.008)
                for v in st.data.vertices:
                    t = v.co.z / (h + 0.12)
                    k = 1 - 0.16 * t
                    v.co.x *= k
                    v.co.y *= k
                    if t > 0.97:
                        v.co.z -= 0.035 * (v.co.x * side / 0.04 + 0.5 * v.co.y / 0.04)
                st.data.transform(Matrix.Translation((x, y, BUNK_TOP + 0.04)) @ Matrix.Rotation(-side * 0.035, 4, 'Y'))
                stakes.append(st)
            # binder chain eyes
            for x in (-0.55, 0.55):
                eye = sweep('eye', [(x + 0.03 * math.cos(a), y, BUNK_TOP + 0.03 + 0.03 * math.sin(a))
                                    for a in np.linspace(0, math.pi, 9)], circle_profile(0.007, 6), smooth=True, cap=True)
                parts.append(eye)
        bk = join(parts, name='bunks')
        set_sharp_by_angle(bk, 35)
        assign_mat(bk, 'steel_rough')
        stk = join(stakes, name='stakes')
        self.add('bunks', join([bk, stk], name='bunks'))

    def headache_rack(self):
        y = DECK['y0'] - 0.05
        top = 1.80
        parts = []
        frame = polyline_round([(-0.86, y, DECK['top']), (-0.86, y, top), (0.86, y, top), (0.86, y, DECK['top'])], 0.08, 6)
        parts.append(sweep('rack', densify(frame, 0.1), rrect_profile(0.06, 0.06, 0.008, 2), normals=None,
                           smooth=False, cap=True))
        parts.append(sweep('rack_mid', [(-0.86, y, 1.30), (0.86, y, 1.30)], rrect_profile(0.05, 0.05, 0.006, 2),
                           smooth=False, cap=True))
        for x in np.arange(-0.76, 0.77, 0.095):
            parts.append(tube('bar', [(x, y, 1.30), (x, y, top - 0.02)], 0.011, 8))
        # foot plates bolted to the deck edge
        for x in (-0.86, 0.86):
            fp = extrude_outline('foot', rounded_rect_2d(-0.08, -0.07, 0.08, 0.07, 0.01, 2), DECK['top'], DECK['top'] + 0.012,
                                 plane='XY', bevel_w=0.002)
            fp.data.transform(Matrix.Translation((x, y, 0)))
            parts.append(fp)
        rk = join(parts, name='headache_rack')
        set_sharp_by_angle(rk, 35)
        assign_mat(rk, 'steel_rough')
        self.add('headache_rack', rk)
        # two work lamps on the rack top, aimed back over the bed (for loading at night)
        lamps, lenses = [], []
        for x in (-0.55, 0.55):
            h, l = self.round_lamp('work', (x, y - 0.02, top + 0.09), Vector((0, -1, -0.35)).normalized(), 0.055, 0.07)
            lamps.append(h)
            lenses.append(l)
            lamps.append(tube('wl_stem', [(x, y, top + 0.03), (x, y - 0.01, top + 0.07)], 0.01, 8))
        self.add('work_lamps', join(lamps, name='work_lamps'))
        lw = join(lenses, name='light_work')
        assign_mat(lw, 'lens_clear')
        self.add('light_work', lw)

    def round_lamp(self, name, center, direction, r, depth):
        """A sealed-beam style lamp: steel bowl housing + domed lens, facing `direction`."""
        hp = [(0.0, -depth), (r * 0.55, -depth), (r * 0.9, -depth * 0.7), (r * 1.05, -depth * 0.2), (r * 1.08, 0.0),
              (r * 1.02, 0.008), (r * 0.98, 0.004)]
        hs = lathe(name + '_h', hp, segments=24, axis='Z')
        assign_mat(hs, 'steel_rough')
        lp = [(r * 0.98, 0.0), (r * 0.8, 0.012), (r * 0.5, 0.02), (0.0, 0.024)]
        ln = lathe(name + '_l', lp, segments=24, axis='Z')
        q = Vector((0, 0, 1)).rotation_difference(direction).to_matrix().to_4x4()
        M = Matrix.Translation(center) @ q
        hs.data.transform(M)
        ln.data.transform(M)
        return hs, ln

    def light_bar(self):
        y = 0.20
        z = 1.715
        parts, lenses = [], []
        parts.append(sweep('lbar', [(-0.66, y, z), (0.66, y, z)], rrect_profile(0.05, 0.04, 0.008, 2), smooth=False, cap=True))
        for x in (-0.60, 0.60):
            # strap brackets down to the drip rails
            br = polyline_round([(x, y, z), (x, y + 0.01, z - 0.06), (x * 1.0, y + 0.02, 1.592)], 0.02, 3)
            parts.append(sweep('lbr', br, rrect_profile(0.04, 0.006, 0.002, 1), smooth=False, cap=True))
            parts.append(lathe('clamp', [(0.0, 0.0), (0.025, 0.0), (0.025, 0.02), (0.0, 0.02)], segments=10, axis='Z',
                               center=(x, y + 0.02, 1.578)))
        for x in (-0.45, -0.15, 0.15, 0.45):
            h, l = self.round_lamp('bar', (x, y + 0.035, z + 0.04), Vector((0, 1, -0.04)).normalized(), 0.068, 0.085)
            parts.append(h)
            lenses.append(l)
            parts.append(tube('lb_stem', [(x, y, z), (x, y + 0.02, z + 0.035)], 0.012, 8))
            # wire guard across each lamp
            parts.append(tube('guard', [(x - 0.07, y + 0.065, z + 0.04), (x + 0.07, y + 0.065, z + 0.04)], 0.004, 6))
            parts.append(tube('guard', [(x, y + 0.065, z - 0.03), (x, y + 0.065, z + 0.11)], 0.004, 6))
        lb = join(parts, name='light_bar_base')
        set_sharp_by_angle(lb, 35)
        assign_mat(lb, 'steel_rough')
        self.add('light_bar_base', lb)
        ll = join(lenses, name='light_bar')
        assign_mat(ll, 'lens_clear')
        self.add('light_bar', ll)

    # ---------------------------------------------------------------------------------- front
    def winch_bumper(self):
        z0, z1 = 0.50, 0.74
        plan = [(-0.93, 2.02), (-0.93, 2.16), (-0.64, 2.31), (0.64, 2.31), (0.93, 2.16), (0.93, 2.02), (0.62, 2.13),
                (-0.62, 2.13)]
        bp = extrude_outline('bumper', plan, z0, z1, plane='XY', bevel_w=0.012)
        # winch cradle cut into the top centre
        cut = extrude_outline('cradle', rounded_rect_2d(-0.44, 2.15, 0.44, 2.40, 0.02, 3), z1 - 0.07, z1 + 0.1, plane='XY')
        vlib.boolean(bp, cut, op='DIFFERENCE')
        delete(cut)
        parts = [bp]
        # frame mounts + tow shackles
        for x in (-0.43, 0.43):
            parts.append(extrude_outline('mount', rounded_rect_2d(x - 0.05, 1.95, x + 0.05, 2.14, 0.01, 2), 0.50, 0.68,
                                         plane='XY', bevel_w=0.004))
        for x in (-0.56, 0.56):
            sh = [(x - 0.05, 2.28, 0.60)] + [(x + 0.05 * math.cos(a), 2.31 + 0.08 * math.sin(a), 0.60)
                                               for a in np.linspace(math.pi, 0, 9)] + [(x + 0.05, 2.28, 0.60)]
            parts.append(tube('shackle', sh, 0.011, 8))
            parts.append(tube('pin', [(x - 0.065, 2.35, 0.60), (x + 0.065, 2.35, 0.60)], 0.008, 8))
        # winch: motor (ribbed), gearbox, tie bar, fairlead with four rollers, hook on the cable
        wz, wy = z1 + 0.04, 2.245
        motor = lathe('motor', [(0.0, 0.20), (0.06, 0.20), (0.072, 0.215), (0.072, 0.40), (0.06, 0.43), (0.02, 0.44),
                                (0.0, 0.44)], segments=20, axis='X', center=(0, wy, wz))
        parts.append(motor)
        for k in range(6):
            parts.append(lathe('rib', [(0.072, 0.0), (0.078, 0.004), (0.078, 0.012), (0.072, 0.016)], segments=20,
                               axis='X', center=(0.24 + k * 0.028, wy, wz)))
        gb = extrude_outline('gearbox', rounded_rect_2d(wy - 0.085, wz - 0.085, wy + 0.085, wz + 0.09, 0.025, 3), -0.32,
                             -0.20, plane='YZ', bevel_w=0.006)
        parts.append(gb)
        for x in (-0.19, 0.19):
            parts.append(lathe('flange', [(0.0, -0.008), (0.105, -0.008), (0.105, 0.008), (0.0, 0.008)], segments=24,
                               axis='X', center=(x, wy, wz)))
        parts.append(tube('tiebar', [(-0.30, wy - 0.09, wz + 0.09), (0.40, wy - 0.09, wz + 0.09)], 0.012, 8))
        fz, fy = 0.635, 2.325
        fl = extrude_outline('fairlead', rounded_rect_2d(-0.13, fz - 0.07, 0.13, fz + 0.07, 0.015, 2), fy - 0.01,
                             fy + 0.025, plane='XZ', bevel_w=0.004)
        hole = extrude_outline('fl_hole', rounded_rect_2d(-0.08, fz - 0.025, 0.08, fz + 0.025, 0.01, 2), fy - 0.05,
                               fy + 0.06, plane='XZ')
        vlib.boolean(fl, hole, op='DIFFERENCE')
        delete(hole)
        parts.append(fl)
        for z in (fz - 0.035, fz + 0.035):
            parts.append(tube('roller', [(-0.085, fy + 0.008, z), (0.085, fy + 0.008, z)], 0.012, 10))
        for x in (-0.09, 0.09):
            parts.append(tube('roller', [(x, fy + 0.008, fz - 0.05), (x, fy + 0.008, fz + 0.05)], 0.012, 10))
        bump = join(parts, name='bumper_front')
        set_sharp_by_angle(bump, 35)
        assign_mat(bump, 'steel_rough')
        # cable from the drum bottom through the fairlead to the hook, clipped back to a shackle
        cab = [(0.0, wy, wz - 0.075), (0.0, wy + 0.05, wz - 0.11), (0.0, fy - 0.03, fz + 0.01), (0.0, fy + 0.05, fz),
               (0.05, fy + 0.10, fz - 0.03), (0.20, fy + 0.10, 0.62), (0.40, fy + 0.07, 0.60)]
        cable = tube('cable', densify(polyline_round(cab, 0.04, 4), 0.03), 0.0055, 6)
        hook = sweep('hook', [(0.42 + 0.035 * math.cos(a), fy + 0.06, 0.585 + 0.045 * math.sin(a))
                              for a in np.linspace(math.pi * 0.95, -math.pi * 0.85, 12)],
                     rrect_profile(0.016, 0.012, 0.004, 1), smooth=True, cap=True)
        assign_mat(hook, 'steel_rough')
        assign_mat(cable, 'cable')
        self.add('bumper_front', join([bump, cable, hook], name='bumper_front'))
        # the drum (spins when winching): core with several wound layers of cable
        drum = [lathe('drum', [(0.0, -0.18), (0.05, -0.18), (0.05, 0.18), (0.0, 0.18)], segments=20, axis='X',
                      center=(0, wy, wz))]
        assign_mat(drum[0], 'steel_rough')
        wraps = []
        for layer in range(3):
            rr = 0.055 + layer * 0.011
            turns = 22
            pts = []
            for i in range(turns * 8 + 1):
                a = i / 8 * math.tau
                x = -0.175 + 0.35 * i / (turns * 8)
                if layer % 2:
                    x = -x
                pts.append((x, wy + rr * math.cos(a), wz + rr * math.sin(a)))
            wraps.append(tube('wrap', pts, 0.0065, 4, cap=False))
        wr = join(wraps, name='wraps')
        assign_mat(wr, 'cable')
        self.add('winch_drum', join(drum + [wr], name='winch_drum'))
        self.winch_pt = (0.0, fy + 0.06, fz)

    def mud_flaps(self):
        flaps, brackets = [], []
        for side in (1, -1):
            for y, ztop, w in ((AXF - 0.50, 0.50, 0.30), (AXR - 0.52, 0.80, 0.36)):
                x = side * TRACK / 2
                nu, nv = 6, 8
                verts = []
                for j in range(nv + 1):
                    t = j / nv
                    z = ztop - (ztop - 0.13) * t
                    yy = y - 0.035 * t * t
                    for i in range(nu + 1):
                        s = i / nu
                        verts.append((x - w / 2 + w * s, yy + 0.006 * math.sin(s * math.pi) * t, z))
                f = new_mesh_obj('flap', verts, grid_faces(nv + 1, nu + 1), smooth=True)
                add_solidify(f, 0.008, offset=0.0)
                apply_modifiers(f)
                recalc_normals(f)
                flaps.append(f)
                strip = box('strip', (w + 0.01, 0.012, 0.035), center=(x, y + 0.004, ztop - 0.015), bevel_w=0.002)
                brackets.append(strip)
                arm_z = ztop + 0.01
                inner = side * 0.43
                brackets.append(sweep('arm', [(inner, y + 0.02, arm_z), (x, y + 0.02, arm_z)],
                                      angle_profile(0.03, 0.03, 0.004), normals=[(0, 1, 0)] * 2, smooth=False, cap=True))
        fl = join(flaps, name='mud_flaps')
        assign_mat(fl, 'rubber')
        br = join(brackets, name='flap_brackets')
        assign_mat(br, 'steel_rough')
        self.add('mud_flaps', join([fl, br], name='mud_flaps'))

    # ---------------------------------------------------------------------------------- rear
    def rear_end(self):
        y = DECK['y1'] - 0.03
        parts = []
        parts.append(sweep('rbumper', [(-0.90, y, 0.66), (0.90, y, 0.66)], channel_profile(0.08, 0.15, 0.007),
                           normals=[(0, -1, 0)] * 2, smooth=False, cap=True))
        # receiver + ball mount
        rc = extrude_outline('receiver', rounded_rect_2d(-0.04, 0.56, 0.04, 0.64, 0.006, 2), y + 0.15, y - 0.12,
                             plane='XZ', bevel_w=0.003)
        parts.append(rc)
        parts.append(extrude_outline('drawbar', rounded_rect_2d(-0.03, 0.57, 0.03, 0.63, 0.005, 2), y - 0.12, y - 0.24,
                                     plane='XZ', bevel_w=0.003))
        parts.append(lathe('ball', [(0.0, 0.0), (0.015, 0.0), (0.015, 0.03), (0.026, 0.045), (0.026, 0.07),
                                    (0.015, 0.085), (0.0, 0.088)], segments=16, axis='Z', center=(0, y - 0.20, 0.63)))
        # lamp brackets under the deck edge
        lamps, tails, rev, ind = [], [], [], []
        for side in (1, -1):
            x = side * 0.76
            parts.append(sweep('lbrk', [(x, y + 0.02, 0.86), (x, y - 0.01, 0.78)], rrect_profile(0.05, 0.006, 0.002, 1),
                               smooth=False, cap=True))
            h, l = self.round_lamp('tail', (x, y - 0.03, 0.78), Vector((0, -1, 0)), 0.055, 0.05)
            lamps.append(h)
            tails.append(l)
            h2, l2 = self.round_lamp('ind', (side * 0.62, y - 0.03, 0.78), Vector((0, -1, 0)), 0.03, 0.03)
            lamps.append(h2)
            ind.append(l2)
        h3, l3 = self.round_lamp('rev', (-0.40, y - 0.03, 0.78), Vector((0, -1, 0)), 0.035, 0.035)
        lamps.append(h3)
        rev.append(l3)
        rb = join(parts + lamps, name='rear_end')
        set_sharp_by_angle(rb, 35)
        assign_mat(rb, 'steel_rough')
        self.add('rear_end', rb)
        for nm, objs, m in (('light_tail_l', [tails[0]], 'lens_red'), ('light_tail_r', [tails[1]], 'lens_red'),
                            ('light_ind_rl', [ind[0]], 'lens_amber'), ('light_ind_rr', [ind[1]], 'lens_amber'),
                            ('light_reverse', rev, 'lens_clear')):
            o = join(objs, name=nm)
            assign_mat(o, m)
            self.add(nm, o)
        # rear plate on the bumper face (display quad, game-skinned) + holder
        px, pz = 0.36, 0.665
        plate = new_mesh_obj('plate_rear', [(px - 0.15, y - 0.047, pz - 0.075), (px + 0.15, y - 0.047, pz - 0.075),
                                            (px + 0.15, y - 0.047, pz + 0.075), (px - 0.15, y - 0.047, pz + 0.075)],
                             [(0, 3, 2, 1)], smooth=False, uvs=[(1, 0), (1, 1), (0, 1), (0, 0)])
        assign_mat(plate, 'plate')
        self.add('plate_rear', plate)

    def tank_box_steps(self):
        parts = []
        # saddle tank on the driver's side, toolbox opposite, between the cab and the rear wheels
        tank = sweep('tank', [(0.62, -0.74, 0.53), (0.62, -1.32, 0.53)], rrect_profile(0.26, 0.25, 0.07, 4),
                     normals=[(1, 0, 0)] * 2, smooth=True, cap=True)
        set_sharp_by_angle(tank, 50)
        parts.append(tank)
        for y in (-0.86, -1.20):
            parts.append(sweep('strap', [(0.62 + 0.135 * math.cos(a), y, 0.53 + 0.13 * math.sin(a))
                                         for a in np.linspace(-math.pi * 0.5, math.pi * 1.0, 14)],
                               rrect_profile(0.004, 0.035, 0.001, 1), smooth=False, cap=True))
        parts.append(lathe('filler', [(0.0, 0.0), (0.03, 0.0), (0.03, 0.03), (0.04, 0.035), (0.04, 0.05), (0.0, 0.055)],
                           segments=14, axis='Z', center=(0.70, -0.82, 0.65)))
        tb_ = rough_box('toolbox', (0.26, 0.58, 0.28), (-0.62, -1.03, 0.55), 'steel_rough', seed=7, warp=0.001, nx=2,
                        bevel=0.012, rough=0.0003)
        parts.append(tb_)
        parts.append(box('lid_seam', (0.268, 0.585, 0.006), center=(-0.62, -1.03, 0.64)))
        for y in (-0.86, -1.20):
            parts.append(box('latch', (0.012, 0.05, 0.06), center=(-0.757, y, 0.61), bevel_w=0.002))
        # step bars under the doors
        for side in (1, -1):
            x = side * 0.88
            parts.append(tube('step', [(x, 0.78, 0.40), (x, -0.45, 0.40)], 0.03, 12))
            for y in (0.55, -0.25):
                parts.append(tube('step_brk', [(side * 0.45, y, 0.42), (x, y, 0.40)], 0.018, 8))
        tbx = join(parts, name='tank_box_steps')
        set_sharp_by_angle(tbx, 40)
        assign_mat(tbx, 'steel_rough')
        self.add('tank_box_steps', tbx)

    def exhaust(self):
        path = [(-0.25, -0.40, 0.42), (-0.25, -0.70, 0.42), (-0.40, -1.10, 0.44), (-0.40, -1.28, 0.44), (-0.82, -1.34, 0.42)]
        ex = tube('exhaust', densify(polyline_round(path, 0.08, 5), 0.06), 0.028, 12)
        muf = lathe('muffler', [(0.0, -0.20), (0.06, -0.20), (0.085, -0.17), (0.085, 0.17), (0.06, 0.20), (0.0, 0.20)],
                    segments=18, axis='Y', center=(-0.25, -0.62, 0.44))
        muf.data.transform(Matrix.Translation((0, 0, 0)))
        o = join([ex, muf], name='exhaust')
        assign_mat(o, 'chrome')
        self.add('exhaust', o)
        self.exhaust_tip = (-0.83, -1.34, 0.42)

    # ---------------------------------------------------------------------------------- wheels
    def wheels(self):
        tyre = self.tyre('tyre')
        rim = self.rim('rim')
        proto = join([tyre, rim], name='wheel_proto')
        # final names: +X is the truck's left (the driver's side, left-hand drive after the build's mirror)
        for nm, (x, y) in (('wheel_fl', (TRACK / 2, AXF)), ('wheel_fr', (-TRACK / 2, AXF)),
                           ('wheel_rl', (TRACK / 2, AXR)), ('wheel_rr', (-TRACK / 2, AXR))):
            w = duplicate(proto, nm)
            if x < 0:
                w.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
            w.location = (x, y, R)
            self.add(nm, w)
        delete(proto)

    def tyre(self, name):
        """All-terrain tyre: lathe around X, square shoulders, deep staggered tread blocks."""
        Wd = TW
        rim_r = 0.20
        h = Wd / 2
        P = [(-h * 0.80, rim_r - 0.002), (-h * 0.90, rim_r + 0.02), (-h * 0.98, 0.27), (-h * 1.0, 0.31),
             (-h * 0.96, 0.345), (-h * 0.88, R - 0.008), (-h * 0.80, R)]
        xs = np.linspace(-h * 0.80, h * 0.80, 13)
        for x in xs[1:-1]:
            P.append((x, R))
        P += [(h * 0.80, R), (h * 0.88, R - 0.008), (h * 0.96, 0.345), (h * 1.0, 0.31), (h * 0.98, 0.27),
              (h * 0.90, rim_r + 0.02), (h * 0.80, rim_r - 0.002)]
        segs = 48
        verts = []
        depth = 0.016
        for i in range(segs):
            a = 2 * math.pi * i / segs
            row = i % 4
            for x, r in P:
                rr = r
                if r >= R - 1e-6:
                    ax = abs(x) / (h * 0.8)
                    # blocks: centre rib split every other row, shoulder lugs on alternate rows
                    if row == 0 and ax > 0.55:
                        rr = R - depth
                    elif row == 2 and 0.12 < ax < 0.5:
                        rr = R - depth
                    elif (row in (1, 3)) and 0.48 < ax < 0.56:
                        rr = R - depth * 0.8
                if r < R - 0.004 and abs(x) > h * 0.9 and row == 0:
                    rr = r + 0.004   # sidewall lug ridges
                verts.append((x, rr * math.cos(a), rr * math.sin(a)))
        faces = grid_faces(segs, len(P), closed_u=True, flip=True)
        ob = new_mesh_obj(name, verts, faces, smooth=True)
        recalc_normals(ob)
        set_sharp_by_angle(ob, 40)
        assign_mat(ob, 'rubber')
        return ob

    def rim(self, name):
        # 15" steel wheel: deep dish, eight lug nuts, small centre cap
        prof = [(0.185, -0.105), (0.205, -0.108), (0.21, -0.10), (0.20, -0.09), (0.19, -0.06), (0.17, -0.04),
                (0.165, 0.04), (0.19, 0.075), (0.20, 0.095), (0.212, 0.10), (0.21, 0.108), (0.195, 0.104)]
        rim = lathe(name, prof, segments=28, axis='X', mat=mat('paint_black'))
        disc = lathe(name + '_disc', [(0.165, 0.035), (0.14, 0.05), (0.10, 0.058), (0.07, 0.07), (0.055, 0.075),
                                      (0.0, 0.075)], segments=32, axis='X', mat=mat('paint_black'))
        parts = [rim, disc]
        for k in range(8):
            a = 2 * math.pi * k / 8
            nut = lathe('nut', [(0.0, 0.074), (0.011, 0.074), (0.011, 0.088), (0.007, 0.094), (0.0, 0.094)], segments=6,
                        axis='X', center=(0, 0.085 * math.cos(a), 0.085 * math.sin(a)), mat=mat('metal_steel'))
            parts.append(nut)
        parts.append(lathe('cap', [(0.0, 0.075), (0.045, 0.075), (0.045, 0.085), (0.035, 0.098), (0.0, 0.10)],
                           segments=20, axis='X', mat=mat('metal_steel')))
        return join(parts, name=name)
