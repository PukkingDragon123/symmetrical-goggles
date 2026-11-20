# SPLINTER CAT: a real Eurasian lynx (Paleo Modelist, CC-BY 4.0: rigged; 6 of its 8 clips kept), turned to face +Z, scaled up a little
# (a splinter cat is a big lynx), small bead eyes for its painted ones.
#   python -m lowpix sketchfab fetch aff6767399cf4daca1a82b43ccaa1252 -o <dl>/aff67673
#   blender -b --python tools/blender/cryptids4/splintercat.py -- <dl>
import bpy, os, sys
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import kit as K

DL = K.args()[0]
UID = 'aff6767399cf4daca1a82b43ccaa1252'
BODY = 0.8         # m from the hips to the eyes

C.reset()
arm, meshes, fps = C.load(K.source(DL, UID))
K.still_parents()
ref = (C.action('metarig|idle_Object'), 0)
arm.animation_data_create(); arm.animation_data.action = ref[0]; C.set_frame(0)
eye_obj = next(o for o in meshes if o.material_slots[0].material.name == 'Material.003')
for o in meshes:  # 1.3k tris of hard facets: one level of smoothing
    if o != eye_obj:
        K.subdivide(o, 1)
eyes = K.islands(eye_obj)
mid = (eyes[0][0] + eyes[1][0]) / 2
hips = arm.matrix_world @ arm.pose.bones['spine_01'].head
f = (mid - hips); f.z = 0
R = Matrix.Rotation(Vector((0, -1, 0)).to_2d().angle_signed(f.to_2d()), 4, 'Z')  # hips->eyes turned to -Y
s = BODY / (mid - hips).length
beads = K.bead_eyes([(K.bead_from_socket(c, r, r * 0.55, mid, 0.0), r * 0.55) for c, r, _ in eyes], 'beads')
meshes = [m for m in meshes if m != eye_obj] + [beads]
bpy.data.objects.remove(eye_obj, do_unlink=True)
keep = K.auto_keep(arm, [m for m in meshes if m.vertex_groups])
print('KEEP', len(keep), [k[0] for k in keep])
head = next(sn for n, sn in keep if n.startswith('spine_006'))
lo = K.ground_z([m for m in meshes if m.name != 'beads'])
c0 = (hips + mid) / 2
T = Matrix.Translation((0, 0, 0)) @ Matrix.Scale(s, 4) @ R @ Matrix.Translation(Vector((-c0.x, -c0.y, -lo)))
A = lambda n: C.action('metarig|' + n + '_Object')
clips = [
    dict(name='idle', action=A('idle')),
    dict(name='idle2', action=A('idle.001')),
    dict(name='walk', action=A('walk'), drift=True),
    dict(name='run', action=A('run'), drift=True),
    dict(name='eat', action=A('eating')),
    # lying down (the game tucks the head onto the paws and wraps the tail on top of it)
    dict(name='sleep', action=A('sleep'), f0=9, f1=9, pose=True),
]
for c in clips:  # the source's root motion lived on an empty we drop: put every clip back on the ground
    c['floor'] = True
ao, outm, acts = C.rebake(arm, meshes, keep, ref, clips, T=T, src_fps=fps, name='splintercat', obj_bone={'beads': head})
C.drop_source([ao] + outm)
K.ensure_uv(outm)
mat = C.atlas(outm, {'Material.001': (0, 0, 1024, 1008), 'BeadEye': (0, 1012, 8, 8)}, (1024, 1024), os.path.join(K.HERE, '_build'), 'splintercat',
              rough={'BeadEye': 0.12, 'Material.001': 0.9}, shine={'BeadEye': 1.0}, normals=False,
              recolor={'Material.001': lambda a: np.concatenate([np.clip(((a[..., :3] - 0.5) * 1.12 + 0.5) * np.array([0.98, 0.91, 0.82]), 0, 1), a[..., 3:]], -1)})
K.unify_uv(outm)
body = C.join(outm, 'splintercat_mesh')
n = C.finish_mesh(body, mat, ratio=1.0)
C.limit_weights(body, 4)
lo, hi = C.bbox([body])
print('TRIS', n, 'BBOX', tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))
C.export(ao, body, os.path.join(K.OUT, 'splintercat.glb'), acts)
C.write_meta(os.path.join(K.HERE, '_build', 'splintercat.json'), {'tris': n, 'clips': [a.name for a in acts], 'bbox': [list(lo), list(hi)]})
