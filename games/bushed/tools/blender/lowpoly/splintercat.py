# SPLINTER CAT, low-poly pass: the same real lynx as before (Paleo Modelist, CC-BY 4.0; rig and clips as
# ../cryptids4/splintercat.py), now ~2.2k faceted triangles instead of a 7.8k smoothed blob. The detail lives in the
# texture: the source's fur painting re-laid at 2.5x density on the head, with baked AO and cavity from a smooth
# 2-level subdivision, and a crisper face (dark eye lines, lip line, black ear tufts and tail tip painted from the
# baked positions).
#   (download) curl the glb from https://api.sketchfab.com/v3/models/aff6767399cf4daca1a82b43ccaa1252/download
#              into <dl>/aff67673/scene.glb (build.sh does it)
#   blender -b --python tools/blender/lowpoly/splintercat.py -- <dl>
import bpy, os, sys, time
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lowkit as L
C, K = L.C, L.K4

T0 = time.time()
DL = K.args()[0]
UID = 'aff6767399cf4daca1a82b43ccaa1252'
BODY = 0.8          # m from the hips to the eyes
TRIS = 2200         # the body (the two bead eyes add ~100)
TEX = 1024

# ---------------------------------------------------------------------------------- the source, as cryptids4 does it
C.reset()
arm, meshes, fps = C.load(K.source(DL, UID))
K.still_parents()
ref = (C.action('metarig|idle_Object'), 0)
arm.animation_data_create(); arm.animation_data.action = ref[0]; C.set_frame(0)
eye_obj = next(o for o in meshes if o.material_slots[0].material.name == 'Material.003')
eyes = K.islands(eye_obj)
mid = (eyes[0][0] + eyes[1][0]) / 2
hips = arm.matrix_world @ arm.pose.bones['spine_01'].head
f = (mid - hips); f.z = 0
R = Matrix.Rotation(Vector((0, -1, 0)).to_2d().angle_signed(f.to_2d()), 4, 'Z')
s = BODY / (mid - hips).length
lo = K.ground_z([m for m in meshes if m != eye_obj])
eyes_ref = K.islands(eye_obj)
H_ref = arm.matrix_world @ arm.pose.bones['spine.006_010'].matrix
c0 = (hips + mid) / 2
back_src = arm.matrix_world @ arm.pose.bones['spine.003_07'].head
bind = bpy.data.actions.new('bind')
arm.animation_data.action = bind
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
C.set_frame(0)
H_bind = arm.matrix_world @ arm.pose.bones['spine.006_010'].matrix
M = H_bind @ H_ref.inverted()
rmid = (eyes_ref[0][0] + eyes_ref[1][0]) / 2
fwd = (rmid - hips); fwd.z = 0; fwd.normalize()


def socket(c, r):
    side = (c - rmid); side.z = 0
    d = (side.normalized() * 0.55 + fwd).normalized()
    return c + d * (r - r * 0.55 * 0.85)


beads = K.bead_eyes([(M @ socket(c, r), r * 0.55 * M.to_scale().x) for c, r, _ in eyes_ref], 'beads', seg=8, rings=6)
meshes = [m for m in meshes if m != eye_obj] + [beads]
bpy.data.objects.remove(eye_obj, do_unlink=True)
keep = K.auto_keep(arm, [m for m in meshes if m.vertex_groups])
head = next(sn for n, sn in keep if n.startswith('spine_006'))
T = Matrix.Scale(s, 4) @ R @ Matrix.Translation(Vector((-c0.x, -c0.y, -lo)))
back = T @ back_src
A = lambda n: C.action('metarig|' + n + '_Object')  # noqa: E731
clips = [
    dict(name='idle', action=A('idle')),
    dict(name='idle2', action=A('idle.001')),
    dict(name='walk', action=A('walk'), drift=True),
    dict(name='run', action=A('run'), drift=True),
    dict(name='eat', action=A('eating')),
    dict(name='sleep', action=A('sleep'), f0=9, f1=9, pose=True, center_bone='spine_003', center_to=(back.x, back.y)),
]
for c in clips:
    c['floor'] = True
ao, outm, acts = C.rebake(arm, meshes, keep, (bind, 0), clips, T=T, src_fps=fps, name='splintercat', obj_bone={'beads': head})
C.drop_source([ao] + outm)
K.ensure_uv(outm)
body = next(o for o in outm if o['src'] != 'beads')
bead = next(o for o in outm if o['src'] == 'beads')
bead.data.materials.clear(); bead.data.materials.append(K.bead_material())

# ---------------------------------------------------------------------------------- high (bake source) and low
# the high: one smooth Catmull-Clark level (more and the thin tail and ears shrink away from the low); the low: that,
# decimated, the head and paws spared
HEAD = ['spine_006']
hi = L._copy_join([body], 'hi'); K.weld(hi, 0.0025); L.outward(hi); K.subdivide(hi, 1)
for p in hi.data.polygons:
    p.use_smooth = True
low = L.lowpoly([hi], TRIS, 'splintercat', protect=(HEAD + ['f_toe_L', 'f_toe_R', 'hand_L', 'hand_R'], 0.75))
lb = L._copy_join([bead], 'lowbeads')
for p in lb.data.polygons:
    p.use_smooth = True  # the beads stay round
low = C.join([low, lb], 'splintercat_mesh')
L.unwrap(low, boost={'spine_006': 2.5})
M = L.bake_maps(low, [hi, bead], TEX, extrude=0.015, ray=0.05, pose=(acts[0], 0))  # standing (idle, frame 0)
print(f'BAKED {time.time() - T0:.0f}s')


# ---------------------------------------------------------------------------------- paint: a crisper face
def paint(M):
    P, N, rgb = M['pos'], M['nrm'], M['base'].copy()
    # the source's warm grey-tan, a little more contrast, as the realism pass had it (in sRGB)
    rgb = L.to_linear(np.clip(((L.to_srgb(rgb) - 0.5) * 1.12 + 0.5) * np.array([0.98, 0.91, 0.82]), 0, 1))
    # landmarks from the bake itself: the eyes (the shine mask), the top of the head, the tail tip
    sh = (M['shine'] > 0.5) & M['valid']
    E = [P[sh & (P[..., 0] * k > 0)].mean(0) for k in (1, -1)]
    em = (E[0] + E[1]) / 2
    print('EYES', np.round(E, 3).tolist())
    d = P - em
    near = (np.abs(d[..., 2]) < 0.14) & (np.abs(d[..., 0]) < 0.14) & M['valid']
    top = float(P[..., 1][near & (d[..., 1] > 0)].max())
    # the ears: black tips (the lynx's tufts), the backs of the ears darker
    ear = near & (d[..., 1] > 0.045) & (d[..., 2] < 0.02)
    tip = L.smooth(P[..., 1], top - 0.045, top - 0.015) * ear
    back = ear * L.smooth(-N[..., 2], 0.2, 0.6) * 0.5
    k = np.maximum(tip, back)[..., None]
    rgb = rgb * (1 - 0.88 * k) + np.array([0.012, 0.01, 0.009]) * 0.88 * k
    # a black tail tip: the bottom of the tail (behind the rump, on the midline)
    V = M['valid']
    zmin = float(P[..., 2][V].min())
    tl = V & (P[..., 2] < zmin + 0.1) & (np.abs(P[..., 0]) < 0.05) & (P[..., 1] > 0.25)
    ty = P[..., 1][tl]
    t = (tl * L.smooth(-P[..., 1], -(ty.min() + 0.07), -(ty.min() + 0.035)))[..., None]
    rgb = rgb * (1 - 0.85 * t) + 0.01 * 0.85 * t
    # a dark line from each eye's back corner, down and back
    for e, side in zip(E, (1, -1)):
        q = P - e
        along = -q[..., 2]
        line = (along > 0.004) & (along < 0.05) & (np.abs(q[..., 1] + along * 0.4) < 0.005) & (q[..., 0] * side > 0)
        rgb[line] *= 0.3
    # warmer lower legs (the source's are blue-white)
    legs = L.smooth(-P[..., 1], -0.22, -0.12)[..., None] * (np.abs(d[..., 2]) > 0.2)[..., None]
    rgb = rgb * (1 - legs * 0.35) + rgb * np.array([1.05, 0.92, 0.78]) * legs * 0.35
    # crisper spots on the flanks and legs
    sp = L.fbm(P, 0.045, 2, 7)
    body_m = (d[..., 2] < -0.15) & (N[..., 1] < 0.75) & (P[..., 1] > 0.1)
    rgb[body_m & (sp > 0.7)] *= 0.6
    return rgb


col = L.finish(M, paint=paint, ao_k=0.5, cav_k=1.8)
_dk = M['valid'] & (col.max(-1) < 0.02)
print('DARK', int(_dk.sum()), np.round(M['pos'][_dk][::max(1, int(_dk.sum()) // 12)], 3).tolist())
print('DARKBASE', int((M['valid'] & (M['base'].max(-1) < 0.01)).sum()), 'AO<0.05', int((M['valid'] & (M['ao'] < 0.05)).sum()))
mat = L.save_material('splintercat', col, M['shine'])
L.apply_material(low, mat)
C.limit_weights(low, 4)
for o in [hi, body, bead]:
    bpy.data.objects.remove(o, do_unlink=True)
n = L.tris(low)
lo_, hi_ = C.bbox([low])
out = os.path.join(K.OUT, 'splintercat.glb')
C.export(ao, low, out, acts)
L.write_meta('splintercat', {'tris': n, 'tex': TEX, 'clips': [a.name for a in acts], 'seconds': round(time.time() - T0)})
print(f'DONE splintercat {n} tris in {time.time() - T0:.0f}s')
