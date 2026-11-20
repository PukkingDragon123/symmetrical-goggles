# GOOFUS BIRD: a real crow (alexanders823, CC-BY 4.0: rigged, one long take: looking about, pecking, take-off, a few
# wingbeats, a glide and a landing), cut into named clips. It flies backwards in the game; the model is just a crow.
#   python -m lowpix sketchfab fetch d5a9b0df4da3493688b63ce42c8a83e2 -o <dl>/d5a9b0df
#   blender -b --python tools/blender/cryptids4/goofus.py -- <dl>
import bpy, os, sys
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import kit as K

DL = K.args()[0]
UID = 'd5a9b0df4da3493688b63ce42c8a83e2'
LENGTH = 0.56      # m, beak to tail tip

C.reset()
arm, meshes, fps = C.load(K.source(DL, UID))
K.still_parents()
ref = (C.action('root|TakeOff'), 0)
arm.animation_data_create(); arm.animation_data.action = ref[0]; C.set_frame(0)
lo, hi = K.extent(meshes)
# bead eyes over the painted ones (found by their reddish-brown iris)
body_src = meshes[0]
hp = arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'CROW_ Head')].head
eyes = K.eyes_by_colour(body_src, lambda c: c[0] > 0.2 and c[0] > c[1] * 1.7 and c[0] > c[2] * 1.9,
                        where=lambda q: (q - hp).length < 7 and abs(q.x) > 1.2 and q.y > hp.y - 6)
print('EYES', [(tuple(round(x, 3) for x in c), round(r, 4)) for c, r in eyes])
if len(eyes) == 2:
    mid = (eyes[0][0] + eyes[1][0]) / 2
    beads = K.bead_eyes([(c + (c - mid).normalized() * 0.12, 0.62) for c, r in eyes], 'beads')  # ~6 mm beads, half sunk
    meshes = meshes + [beads]
s = LENGTH / (hi.y - lo.y)
keep = K.auto_keep(arm, [m for m in meshes if m.vertex_groups])
head = next(sn for n, sn in keep if n == 'Head')
print('KEEP', len(keep), [k[0] for k in keep])
T = Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
TK = C.action('root|TakeOff')
clips = [
    dict(name='idle', action=TK, f0=0, f1=34),
    dict(name='peck', action=TK, f0=34, f1=86, loop=False),
    dict(name='look', action=TK, f0=86, f1=110),
    dict(name='takeoff', action=TK, f0=150, f1=194, loop=False),
    dict(name='fly', action=TK, f0=194, f1=212, drift=True),
    dict(name='glide', action=TK, f0=224, f1=224, pose=True),
    dict(name='land', action=TK, f0=232, f1=252, loop=False),
]
ao, outm, acts = C.rebake(arm, meshes, keep, ref, clips, T=T, src_fps=fps, name='goofus', obj_bone={'beads': head})
C.drop_source([ao] + outm)
K.ensure_uv(outm)
mat = C.atlas(outm, {'M_Crow': (0, 0, 1024, 1008), 'BeadEye': (0, 1012, 8, 8)}, (1024, 1024), os.path.join(K.HERE, '_build'), 'goofus',
              rough={'M_Crow': 0.45, 'BeadEye': 0.12}, shine={'BeadEye': 0.6}, normals=False,
              recolor={'M_Crow': lambda a: np.concatenate([np.clip(a[..., :3] * 0.62, 0, 1), a[..., 3:]], -1)})
K.unify_uv(outm)
body = C.join(outm, 'goofus_mesh')
n = C.finish_mesh(body, mat, ratio=1.0)
C.limit_weights(body, 4)
lo, hi = C.bbox([body])
print('TRIS', n, 'BBOX', tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))
C.export(ao, body, os.path.join(K.OUT, 'goofus.glb'), acts)
C.write_meta(os.path.join(K.HERE, '_build', 'goofus.json'), {'tris': n, 'clips': [a.name for a in acts], 'bbox': [list(lo), list(hi)]})
