# WAPALOOSIE (Cox 1910): the size and shape of a dachshund, but it lives in the trees: it climbs by wriggling up the
# trunk, lives on lichen and moss, and from the top of a tall spruce it sees everything in the bush. Built from the
# game's own red squirrel (Realistic_squirrel_3d_model by mgddeldeen9020, CC-BY 4.0,
# public/assets/models/creatures/squirrel/squirrel.glb): scaled up 2.1x and stretched into a long low body (the
# chest, neck, head and front legs moved forward on the rig, the back stretched to follow), slate fur with lichen
# blotches painted from the bake; ~1.7k faceted triangles.
#   blender -b --python tools/blender/lowpoly/wapaloosie.py
import bpy, os, sys, time
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import newfour as N  # noqa: E402
L, C, K = N.L, N.C, N.K

T0 = time.time()
NAME, SIZE, TRIS, TEX = 'wapaloosie', 2.1, 2100, 1024
STRETCH = 0.15      # m the front half moves forward (after scaling)

arm, meshes, fps, A = N.load_fauna('squirrel/squirrel.glb')
bind = N.bind_action(arm)
body = meshes[0]
BODY = body.name
beads = K.bead_eyes([(Vector((s * 0.0146, -0.1135, 0.1085)), 0.0043) for s in (1, -1)], 'beads', seg=8, rings=6)
keep = K.auto_keep(arm, [body])
T = Matrix.Scale(SIZE, 4)
clips = [
    dict(name='idle', action=A['idle']),
    dict(name='run', action=A['run'], drift=True),
    dict(name='eat', action=A['eat']),
    dict(name='scout', action=A['beg']),
    dict(name='alert', action=A['alert']),
    dict(name='freeze', action=A['freeze']),
]
ao, outm, acts = C.rebake(arm, [body, beads], keep, (bind, 0), clips, T=T, src_fps=fps, name=NAME, obj_bone={'beads': 'head'})
C.drop_source([ao] + outm)
N.fix_groups(outm, ao)

# ---------------------------------------------------------------------------------- the long body
FRONT = ['chest', 'neck', 'head', 'fuL', 'flL', 'fpL', 'fuR', 'flR', 'fpR']
bpy.context.view_layer.objects.active = ao
bpy.ops.object.mode_set(mode='EDIT')
for n in FRONT:  # move the joints, never turn a bone (the clips are rotations relative to the rest frames)
    e = ao.data.edit_bones[n]
    e.head.y -= STRETCH; e.tail.y -= STRETCH
bpy.ops.object.mode_set(mode='OBJECT')
for o in outm:
    if not o.vertex_groups:
        continue
    W, P = N.weights(o), N.coords(o)
    z0 = np.zeros(len(P), np.float32)
    w = np.clip(sum(W.get(n, z0) for n in FRONT) + 0.5 * W.get('spine', z0), 0, 1)
    P[:, 1] -= STRETCH * w
    if o['src'] == BODY:
        # a deeper chest and a slimmer waist: the dachshund's barrel
        wc = W.get('chest', z0)
        cc = np.array(N.bone_head(ao, 'chest'))
        P[:, 2] += (P[:, 2] - cc[2]) * 0.12 * wc
        # stout dachshund legs: the squirrel's thin wrists and shins thickened about their bones (a thin limb
        # decimates to a sliver that reads as a gap)
        for bn, k in (('fu', 0.3), ('fl', 0.6), ('fp', 0.45), ('hu', 0.2), ('hl', 0.45), ('hf', 0.35)):
            for sd in ('L', 'R'):
                wl = W.get(bn + sd, z0)
                c = np.array(N.bone_head(ao, bn + sd))
                P[:, 0] += (P[:, 0] - c[0]) * k * wl
                P[:, 1] += (P[:, 1] - c[1]) * k * wl * 0.6
    N.set_coords(o, P)


# ---------------------------------------------------------------------------------- paint
def paint(M):
    P, Nn, rgb = M['pos'], M['nrm'], M['base'].copy()
    # the red squirrel's russet to slate grey-brown (keep its fur detail as luminance)
    s = L.to_srgb(rgb)
    lum = (s * np.array([0.3, 0.55, 0.15])).sum(-1, keepdims=True)
    s = np.clip(lum * np.array([0.86, 0.88, 0.86]) + (s - lum) * 0.25 + 0.02, 0, 1)
    rgb = L.to_linear(s)
    E = N.eyes_of(M)
    em = (E[0] + E[1]) / 2
    # lichen: old man's beard green-grey blotches over the back and the tail
    back = L.smooth(Nn[..., 1], 0.15, 0.6)
    lic = L.smooth(L.fbm(P, 0.06, 3, 17), 0.52, 0.66) * back
    rgb = N.mix(rgb, lic * 0.7, N.lin('#8a9a6c') * (0.8 + 0.4 * L.fbm(P, 0.01, 2, 3))[..., None])
    # a dark stripe down the spine, to the tail
    stripe = L.smooth(-np.abs(P[..., 0] - em[0]), -0.025, -0.008) * L.smooth(Nn[..., 1], 0.6, 0.9)
    rgb = rgb * (1 - 0.45 * stripe[..., None])
    # pale belly and throat
    belly = L.smooth(-Nn[..., 1], 0.25, 0.7)
    rgb = N.mix(rgb, belly * 0.35, N.lin('#a49c88'))
    # the tail ringed dark, tip black (behind the rump)
    zmin = float(P[..., 2][M['valid']].min())
    tail = L.smooth(-P[..., 2], -(zmin + 0.32), -(zmin + 0.2))
    rings = (np.sin(P[..., 1] * 60 + P[..., 2] * 25) > 0.55) * tail
    rgb = rgb * (1 - 0.35 * rings[..., None])
    # dark legs and black climbing claws
    legs = L.smooth(-P[..., 1], -0.09, -0.04)
    rgb = N.mix(rgb, legs * 0.7, N.lin('#25221f'))
    # a pale mask round the eyes, dark lids
    for e in E:
        q = np.linalg.norm(P - e, axis=-1)
        rgb = N.mix(rgb, L.smooth(-q, -0.03, -0.015) * 0.35, N.lin('#c8c0aa'))
        rgb = rgb * (1 - 0.6 * L.smooth(-q, -0.014, -0.0095)[..., None])
    return rgb


N.lowpass(NAME, ao, outm, acts, TRIS, TEX, ['head'], ['fuL', 'fuR', 'flL', 'flR', 'fpL', 'fpR', 'hlL', 'hlR', 'hfL', 'hfR'], paint, boost=2.5, t0=T0, strength=0.9)
