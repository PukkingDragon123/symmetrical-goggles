# BILLDAD (Cox 1910): beaver-sized, with a kangaroo's long hind legs, webbed hind feet, a broad flat tail like a
# beaver's and a hooked bill. It sits on a log by the lake and when a trout rises it leaps sixty rods and slaps it
# senseless with its tail. Built from the game's own hare (Rabbit Rigged by FourthGreen, CC-BY 4.0,
# public/assets/models/creatures/hare/hare.glb), scaled up 1.9x, its long ears shrunk to a beaver's nubs, the hind
# feet spread into paddles, and two made parts kitbashed on: the bill (rigid on the head) and the flat scaly tail
# (rigid on the tail bone, so the game can slap with it); ~1.9k faceted triangles, the detail baked and painted.
#   blender -b --python tools/blender/lowpoly/billdad.py
import bpy, os, sys, time
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import newfour as N  # noqa: E402
L, C, K = N.L, N.C, N.K

T0 = time.time()
NAME, SIZE, TRIS, TEX = 'billdad', 1.9, 1900, 1024

arm, meshes, fps, A = N.load_fauna('hare/hare.glb')
bind = N.bind_action(arm)
body = meshes[0]
BODY = body.name
bm = __import__('bmesh').new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
seen, drop = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    comp, stack = [], [v]; seen.add(v.index)
    while stack:
        x = stack.pop(); comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index); stack.append(y)
    if len(comp) <= 16:
        c = sum((x.co for x in comp), Vector()) / len(comp)
        if max((x.co - c).length for x in comp) > 0.02:
            drop += comp
print('WHISKERS', len(drop))
__import__('bmesh').ops.delete(bm, geom=drop, context='VERTS'); bm.to_mesh(body.data); bm.free()
beads = K.bead_eyes([(Vector((s * 0.0305, -0.163, 0.257)), 0.0068) for s in (1, -1)], 'beads', seg=8, rings=6)
W0 = arm.matrix_world
tail0 = W0 @ arm.data.bones['tail0'].head_local
# the bill: broad and flat, hooked at the tip like a hawk's, over the hare's nose (source metres, -Y forward)
bill = N.tube([(0, -0.172, 0.230), (0, -0.196, 0.226), (0, -0.218, 0.218), (0, -0.233, 0.206), (0, -0.239, 0.194), (0, -0.238, 0.184)],
              [(0.027, 0.018), (0.026, 0.012), (0.021, 0.009), (0.014, 0.007), (0.008, 0.005), (0.003, 0.003)], seg=10, name='bill',
              mat=N.flat_material('Bill', (0.42, 0.33, 0.16), 0.5))
# the tail: a beaver's paddle, flat and broad, from the rump back and down to the ground
tz = tail0.z
paddle = N.tube([(0, tail0.y - 0.005, tz - 0.005), (0, tail0.y + 0.04, tz - 0.03), (0, tail0.y + 0.09, tz - 0.06), (0, tail0.y + 0.14, tz - 0.085), (0, tail0.y + 0.175, tz - 0.098), (0, tail0.y + 0.19, tz - 0.1)],
                [(0.022, 0.016), (0.042, 0.011), (0.056, 0.008), (0.054, 0.007), (0.038, 0.006), (0.006, 0.004)], seg=10, name='paddle',
                mat=N.flat_material('Paddle', (0.07, 0.065, 0.06), 0.55))
keep = K.auto_keep(arm, [body])
T = Matrix.Scale(SIZE, 4)
clips = [
    dict(name='idle', action=A['idle']),
    dict(name='hop', action=A['hop'], drift=True),
    dict(name='run', action=A['run'], drift=True),
    dict(name='freeze', action=A['freeze']),
    dict(name='alert', action=A['alert']),
    dict(name='eat', action=A['graze']),
]
ao, outm, acts = C.rebake(arm, [body, beads, bill, paddle], keep, (bind, 0), clips, T=T, src_fps=fps, name=NAME,
                          obj_bone={'beads': 'head', 'bill': 'head', 'paddle': 'tail0'})
C.drop_source([ao] + outm)
N.fix_groups(outm, ao)

# ---------------------------------------------------------------------------------- reshape the rest pose
b = next(o for o in outm if o['src'] == BODY)
W, P = N.weights(b), N.coords(b)
z0 = np.zeros(len(P), np.float32)
# a beaver's little round ears
for s in ('L', 'R'):
    w = sum(W.get(f'ear{k}{s}', z0) for k in range(3))
    base = np.array(N.bone_head(ao, 'ear0' + s))
    P += (base - P) * (0.86 * np.clip(w, 0, 1))[:, None]
# webbed hind feet: spread wide
for s in ('L', 'R'):
    w = np.clip(W.get('hf' + s, z0) + W.get('ht' + s, z0), 0, 1)
    c = np.array(N.bone_head(ao, 'hf' + s))
    P[:, 0] += (P[:, 0] - c[0]) * 0.75 * w
# a heavier, rounder rump (it sits on its tail)
wr = np.clip(W.get('spine1', z0) + W.get('root', z0), 0, 1)
cr = np.array(N.bone_head(ao, 'spine1'))
P[:, 0] += (P[:, 0] - cr[0]) * 0.18 * wr
N.set_coords(b, P)


# ---------------------------------------------------------------------------------- paint
def paint(M):
    P, Nn, rgb = M['pos'], M['nrm'], M['base'].copy()
    parts = M['parts']
    part = lambda n: (M['part'] == parts.index(n)) if n in parts else np.zeros(M['part'].shape, bool)  # noqa: E731
    # the hare's grey-brown to a wet beaver's dark chocolate, warmer on the back
    s = L.to_srgb(rgb)
    lum = (s * np.array([0.3, 0.55, 0.15])).sum(-1, keepdims=True)
    s = np.clip(lum / 0.42 * np.array([0.36, 0.26, 0.19]) + (s - lum) * 0.25, 0, 1)
    rgb = L.to_linear(s)
    E = N.eyes_of(M)
    em = (E[0] + E[1]) / 2
    # wet, spiky fur clumps
    cl = L.fbm(P, 0.012, 2, 4)
    rgb = rgb * (0.8 + 0.4 * cl[..., None])
    # paler throat and belly
    belly = L.smooth(-Nn[..., 1], 0.2, 0.7) * L.smooth(P[..., 1], 0.1, 0.25)
    rgb = N.mix(rgb, belly * 0.4, N.lin('#7a6048'))
    # the bill: horn, dark at the hooked tip, a nostril, a dark line where it meets the fur
    bl = part('Bill')
    zt = float(P[..., 2][bl].max()) if bl.any() else 0
    bcol = N.lin('#a88a4a') * (0.75 + 0.35 * L.fbm(P, 0.01, 2, 8))[..., None]
    rgb[bl] = bcol[bl]
    tipk = L.smooth(P[..., 2], zt - 0.08, zt - 0.01) * bl
    rgb = N.mix(rgb, tipk * 0.85, N.lin('#2a2016'))
    nos = bl & (np.abs(np.abs(P[..., 0] - em[0]) - 0.022) < 0.007) & (np.abs(P[..., 2] - (zt - 0.12)) < 0.012) & (Nn[..., 1] > 0.5)
    rgb[nos] *= 0.2
    # the paddle: black-grey leather in a crosshatch of scales
    pd = part('Paddle')
    g = np.abs(np.sin(P[..., 0] * 95 + P[..., 2] * 95)) < 0.16
    g |= np.abs(np.sin(P[..., 0] * 95 - P[..., 2] * 95)) < 0.16
    pcol = N.lin('#2e2c2a') * (0.8 + 0.4 * L.fbm(P, 0.02, 2, 9))[..., None]
    rgb[pd] = pcol[pd]
    rgb[pd & g] *= 0.45
    # webbed hind feet: dark grey skin, toes picked out
    feet = L.smooth(-P[..., 1], -0.1, -0.04) * (P[..., 2] < em[2] - 0.35)
    rgb = N.mix(rgb, feet * 0.8, N.lin('#2a2624'))
    # dark lids round the beads
    for e in E:
        q = np.linalg.norm(P - e, axis=-1)
        rgb = rgb * (1 - 0.55 * L.smooth(-q, -0.03, -0.016)[..., None])
    return rgb


N.lowpass(NAME, ao, outm, acts, TRIS, TEX, ['head', 'nose'], ['hfL', 'hfR', 'tail0'], paint, boost=2.3, t0=T0)
