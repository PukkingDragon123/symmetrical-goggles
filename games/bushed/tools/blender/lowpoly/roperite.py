# ROPERITE (Cox 1910): pony-sized, quick on its feet, with a long rope of a snout it lassoes things with. Bands of
# them roped rabbits and careless lumberjacks on the logging roads. Built from a real donkey (Realistic Animated
# Donkey by WildMesh_3D, CC-BY 4.0: rig and 13 of its clips kept, the saddle and the hair cards dropped), a made
# tail with a tuft and a short upright mane (rigged to the source's own tail and neck bones), small bead eyes, a dun
# coat with a dark stripe and barred legs painted from the bake; ~3k faceted triangles. The rope itself is the
# game's (src/creatures/cryptids/roperite.ts): a live tube from the snout that coils, swings and lassoes.
#   curl the glb from https://api.sketchfab.com/v3/models/2b4086035df94d9e88fd0f18d34b3872/download
#   into <dl>/2b408603/scene.glb (build.sh does it)
#   blender -b --python tools/blender/lowpoly/roperite.py -- <dl>
import bpy, os, sys, time
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import newfour as N  # noqa: E402
L, C, K = N.L, N.C, N.K

T0 = time.time()
DL = (K.args() or ['/tmp/lowpoly_dl'])[0]
UID = '2b4086035df94d9e88fd0f18d34b3872'
NAME, SIZE, TRIS, TEX = 'roperite', 0.9, 3000, 1024

C.reset()
arm, meshes, fps = C.load(K.source(DL, UID))
K.still_parents()
ref = (C.action('H_Idle_01_Object_5'), 0)
arm.animation_data_create(); arm.animation_data.action = ref[0]; C.set_frame(0)
by = {o.name: o for o in meshes}
body, head, eyes_o = by['Object_10'], by['Object_11'], by['Object_15']
for n in ('Cube', 'Object_12', 'Object_13', 'Object_14', 'Object_8'):
    if n in by:
        bpy.data.objects.remove(by[n], do_unlink=True)
W0 = arm.matrix_world
bp = lambda n: W0 @ arm.pose.bones[n].head  # noqa: E731
# the eyes: the two 33-vertex islands of the eye/teeth mesh; bead eyes a little smaller, set in the sockets
isl = sorted([i for i in K.islands(eyes_o) if 20 < i[2] < 60], key=lambda i: i[0].y)[:2]
mid = (isl[0][0] + isl[1][0]) / 2
beads = K.bead_eyes([(K.bead_from_socket(c, r, r * 0.42, mid, 0.002), r * 0.42) for c, r, _ in isl], 'beads', seg=8, rings=6)
bpy.data.objects.remove(eyes_o, do_unlink=True)
hips = bp('Pelvis_02')
f = mid - hips; f.z = 0
R = Matrix.Rotation(Vector((0, -1, 0)).to_2d().angle_signed(f.to_2d()), 4, 'Z')
lo = K.ground_z([body, head])


def crest(x_from, x_to, n):
    """points along the top of the neck (the source faces +X): the highest body/head vertex at each x, on the midline"""
    dg = bpy.context.evaluated_depsgraph_get()
    P = []
    for o in (body, head):
        e = o.evaluated_get(dg); me = e.to_mesh()
        co = np.array([tuple(e.matrix_world @ v.co) for v in me.vertices]); e.to_mesh_clear()
        P.append(co)
    P = np.concatenate(P)
    out = []
    for k in range(n):
        x = x_from + (x_to - x_from) * k / (n - 1)
        m = (np.abs(P[:, 0] - x) < 0.035) & (np.abs(P[:, 1]) < 0.05)
        out.append(Vector((x, 0, float(P[m, 2].max()) if m.any() else 1.4)))
    return out


def bind_path(o, path, bones):
    """weight each vertex of a made tube fully to the bone of its nearest path point"""
    gs = {b: (o.vertex_groups.get(b) or o.vertex_groups.new(name=b)) for b in set(bones)}
    for v in o.data.vertices:
        i = min(range(len(path)), key=lambda k: (Vector(path[k]) - v.co).length)
        gs[bones[i]].add([v.index], 1.0, 'REPLACE')


# the tail: a thin donkey tail down the source's tail bones, ending in a dark tuft
TB = ['Tail01_038', 'Tail02_039', 'Tail03_040', 'Tail04_041', 'Tail05_042']
tp = [bp(n) for n in TB] + [W0 @ arm.pose.bones[TB[-1]].tail]
tpath = [tp[0] + (tp[0] - tp[1]) * 0.25] + tp
trad = [0.05, 0.042, 0.034, 0.028, 0.03, 0.05, 0.016]
tail = N.tube(tpath, trad, seg=8, name='tail', mat=N.flat_material('Tail', (0.08, 0.06, 0.045), 0.8))
bind_path(tail, tpath, [TB[0]] + TB + [TB[-1]])
# the mane: short and upright along the crest of the neck, poll to withers
hx, wx = bp('Head_023').x - 0.02, bp('Spine2_015').x + 0.05
mp = [p + Vector((0, 0, 0.02)) for p in crest(hx, wx, 9)]
NB = ['Head_023', 'Neck2_022', 'Neck1_021', 'Neck_020', 'Spine2_015']
mb = [min(NB, key=lambda n: (bp(n) - p).length) for p in mp]
mane = N.tube(mp, [(0.016, 0.045)] * len(mp), seg=8, name='mane', mat=N.flat_material('Mane', (0.06, 0.045, 0.035), 0.9))
bind_path(mane, mp, mb)

c0 = (hips + mid) / 2
T = Matrix.Scale(SIZE, 4) @ R @ Matrix.Translation(Vector((-c0.x, -c0.y, -lo)))
src = [body, head, tail, mane, beads]
keep = K.auto_keep(arm, [m for m in src if m.vertex_groups])
print('KEEP', len(keep), [k[0] for k in keep])
A = lambda n: C.action('H_' + n + '_Object_5')  # noqa: E731
clips = [
    dict(name='idle', action=A('Idle_01')),
    dict(name='look', action=A('Idle03_Look')),
    dict(name='shake', action=A('Idle_02_HeadShake'), loop=False),
    dict(name='hop', action=A('Idle_05_Hop'), loop=False),
    dict(name='walk', action=A('Walk'), drift=True),
    dict(name='back', action=A('Walk_Back'), drift=True),
    dict(name='trot', action=A('Trot'), drift=True),
    dict(name='gallop', action=A('Gallop'), drift=True),
    dict(name='eat', action=A('Eat')),
    dict(name='neigh', action=A('Neigh'), loop=False),
    dict(name='kick', action=A('Attack_Back_Legs'), loop=False),
    dict(name='rear', action=A('Attack_Front_Legs'), loop=False),
    dict(name='sleep', action=A('Sleep_Loop')),
]
ao, outm, acts = C.rebake(arm, src, keep, ref, clips, T=T, src_fps=fps, name=NAME, obj_bone={'beads': 'Head_023'})
C.drop_source([ao] + outm)
N.fix_groups(outm, ao)
print('BONES', [b.name for b in ao.data.bones])


# ---------------------------------------------------------------------------------- paint
def paint(M):
    P, Nn, rgb = M['pos'], M['nrm'], M['base'].copy()
    parts = M['parts']
    part = lambda n: (M['part'] == parts.index(n)) if n in parts else np.zeros(M['part'].shape, bool)  # noqa: E731
    # the donkey's grey to a dun: sandy, a little red, keep its detail as luminance
    s = L.to_srgb(rgb)
    lum = (s * np.array([0.3, 0.55, 0.15])).sum(-1, keepdims=True)
    s = np.clip(lum / 0.5 * np.array([0.6, 0.48, 0.34]) + (s - lum) * 0.3, 0, 1)
    rgb = L.to_linear(s)
    E = N.eyes_of(M)
    em = (E[0] + E[1]) / 2
    V = M['valid']
    zmax = float(P[..., 2][V].max())
    # shaggy: clumped winter coat
    cl = L.fbm(P, 0.02, 2, 5)
    rgb = rgb * (0.85 + 0.3 * cl[..., None])
    # the dark dorsal stripe, withers to tail, and the shoulder cross
    top = L.smooth(Nn[..., 1], 0.55, 0.85)
    stripe = L.smooth(-np.abs(P[..., 0] - em[0]), -0.05, -0.02) * top
    cross = L.smooth(-np.abs(P[..., 2] - (em[2] - 0.75)), -0.06, -0.025) * L.smooth(P[..., 1], 1.0, 1.15)
    rgb = N.mix(rgb, np.maximum(stripe, cross * 0.8) * 0.75, N.lin('#2c2118'))
    # barred legs (the primitive markings) and dark lower legs
    legs = L.smooth(-P[..., 1], -0.75, -0.55)
    bars = (np.sin(P[..., 1] * 48 + L.fbm(P, 0.1, 2, 7) * 3) > 0.45) * legs
    rgb = rgb * (1 - 0.45 * bars[..., None])
    rgb = N.mix(rgb, L.smooth(-P[..., 1], -0.22, -0.12) * 0.8, N.lin('#1e1813'))
    # a pale mealy muzzle and belly, a dark nose
    muz = L.smooth(P[..., 2], zmax - 0.2, zmax - 0.08) * (P[..., 1] < em[1] - 0.04)
    rgb = N.mix(rgb, muz * 0.45, N.lin('#b8a88c'))
    tipn = L.smooth(P[..., 2], zmax - 0.07, zmax - 0.02) * (P[..., 1] > em[1] - 0.45)
    rgb = N.mix(rgb, tipn * 0.7, N.lin('#2a221c'))
    belly = L.smooth(-Nn[..., 1], 0.3, 0.75) * L.smooth(P[..., 1], 0.5, 0.7)
    rgb = N.mix(rgb, belly * 0.45, N.lin('#c9b694'))
    # dark ear rims, tail and mane
    ear = L.smooth(P[..., 1], em[1] + 0.12, em[1] + 0.25) * L.smooth(-np.abs(P[..., 2] - (em[2] - 0.12)), -0.2, -0.05)
    rgb = N.mix(rgb, ear * 0.5, N.lin('#2a2018'))
    for n, c in (('Tail', '#231a13'), ('Mane', '#20180f')):
        m = part(n)
        hair = N.lin(c) * (0.7 + 0.6 * L.fbm(P * np.array([4, 0.3, 4]), 0.02, 2, 3))[..., None]
        rgb[m] = hair[m]
    # rope burns: pale rubbed hair round the muzzle, where the rope coils
    rb = (np.abs(np.sin(P[..., 2] * 70)) < 0.18) & (P[..., 2] > zmax - 0.22) & (P[..., 2] < zmax - 0.1) & (P[..., 1] > em[1] - 0.35)
    rgb[rb] = rgb[rb] * 0.6 + N.lin('#d8c8a8') * 0.4
    # dark lids round the beads
    for e in E:
        q = np.linalg.norm(P - e, axis=-1)
        rgb = rgb * (1 - 0.6 * L.smooth(-q, -0.04, -0.022)[..., None])
    return rgb


N.lowpass(NAME, ao, outm, acts, TRIS, TEX, ['Head', 'Jaw'], ['Ear_L', 'Ear_R'], paint, boost=2.3, t0=T0)
