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
HEAD = ['spine_006']
hi = L._copy_join([body], 'hi'); K.weld(hi, 1e-4); K.subdivide(hi, 2)
for p in hi.data.polygons:
    p.use_smooth = True
mid1 = L._copy_join([body], 'mid'); K.weld(mid1, 1e-4); K.subdivide(mid1, 1)
low = L.lowpoly([mid1], TRIS, 'splintercat', protect=(HEAD + ['f_toe_L', 'f_toe_R', 'hand_L', 'hand_R'], 0.75))
bpy.data.objects.remove(mid1, do_unlink=True)
lb = L._copy_join([bead], 'lowbeads')
low = C.join([low, lb], 'splintercat_mesh')
for p in low.data.polygons:
    p.use_smooth = False
L.unwrap(low, boost={'spine_006': 2.5})
M = L.bake_maps(low, [hi, bead], TEX)
print(f'BAKED {time.time() - T0:.0f}s')


# ---------------------------------------------------------------------------------- paint: a crisper face
def paint(M):
    P, N, rgb = M['pos'], M['nrm'], M['base'].copy()
    # the source's warm grey-tan, a little more contrast, as the realism pass had it
    rgb = np.clip(((rgb - 0.5) * 1.12 + 0.5) * np.array([0.98, 0.91, 0.82]), 0, 1)
    hp = np.array(L.C_head)  # the head bone, game space
    d = P - hp
    # black ear tufts and ear tips; a black tail tip
    ear = (d[..., 1] > 0.085) & (np.abs(d[..., 0]) > 0.03) & (d[..., 2] < 0.06)
    tip = L.smooth(d[..., 1], 0.10, 0.135) * ear
    rgb = rgb * (1 - 0.85 * tip[..., None]) + np.array([0.05, 0.04, 0.035]) * 0.85 * tip[..., None]
    tail = L.smooth(-(P[..., 2] - L.C_tailtip[2]), -0.02, 0.05) * (P[..., 2] < L.C_tailtip[2] + 0.06)
    rgb = rgb * (1 - 0.8 * tail[..., None]) + 0.04 * 0.8 * tail[..., None]
    # a dark line from each eye's back corner, and a darker lip line round the muzzle
    for side in (1, -1):
        e = np.array(L.C_eyes[0 if side > 0 else 1])
        q = P - e
        along = -q[..., 2]  # backward from the eye
        line = (along > 0) & (along < 0.05) & (np.abs(q[..., 1] + along * 0.35) < 0.006) & (q[..., 0] * side > -0.005)
        rgb[line] *= 0.35
    # mottled spots on the flanks and legs (the lynx's), sharpened
    sp = L.fbm(P, 0.05, 2, 7)
    body_m = (d[..., 2] < -0.12) & (N[..., 1] < 0.7) & (P[..., 1] > 0.12)
    rgb[body_m & (sp > 0.68)] *= 0.62
    return rgb


# the head bone, the eyes and the tail tip in game space (paint() reads them)
hb = ao.data.bones['spine_006'].head_local
L.C_head = (hb.x, hb.z, -hb.y)
eyesG = []
for c, r, _ in sorted(K.islands(bead), key=lambda e: -e[0].x)[:2]:
    eyesG.append((c.x, c.z, -c.y))
L.C_eyes = eyesG
tt = ao.data.bones[[n for n, _ in keep if n.startswith('tail')][-1]].tail_local
L.C_tailtip = (tt.x, tt.z, -tt.y)
col = L.finish(M, paint=paint, ao_k=0.5, cav_k=1.8)
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
