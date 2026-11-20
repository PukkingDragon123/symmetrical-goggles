# HOOP SNAKE: a real black mamba (animalanimator, CC-BY 4.0: rigged, 6 science-based clips), laid out straight as the
# rest pose (so the game can roll it into a hoop by turning each spine bone a little), made a third thicker so it
# reads as a wheel, a bit darker, decimated.
#   python -m lowpix sketchfab fetch 7427c67d7c954cb3a05c0830a8de8da6 -o <dl>/7427c67d
#   blender -b --python tools/blender/cryptids4/hoopsnake.py -- <dl>
import bpy, os, sys
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import kit as K

DL = K.args()[0]
UID = '7427c67d7c954cb3a05c0830a8de8da6'
LENGTH = 2.7       # m, nose to tail tip

C.reset()
arm, meshes, fps = C.load(K.source(DL, UID))
# 35k tris (the head alone is 20k) on hundreds of tiny UV islands: decimate a welded copy, unwrap it afresh and bake
# the colour across from the original
low = K.bake_low(meshes, 0.3, 2048, 'hoopsnake', os.path.join(K.HERE, '_build'), weld=0.004, extrude=0.02)
for o in meshes:
    bpy.data.objects.remove(o, do_unlink=True)
meshes = [low]
names = [b.name for b in arm.data.bones]
chain = [n for n in names if n.startswith('spine_')] + [n for n in names if n.startswith('tail_')]
chain.sort(key=lambda n: (0 if n.startswith('spine') else 1, int(n.split('_')[1])))
straight = K.straighten(arm, chain)
C.set_frame(0)
heads = [arm.matrix_world @ arm.pose.bones[n].head for n in chain]
L0 = sum((heads[i + 1] - heads[i]).length for i in range(len(heads) - 1))
keep = K.auto_keep(arm, meshes)
print('KEEP', len(keep), keep[:4], '... chain', len(chain), 'len', round(L0, 3))
# scale to length; lay it on the ground with the head at the origin end (it faces -Y, glTF +Z)
s = LENGTH / (L0 * 1.04)
lo = K.ground_z(meshes)
T = Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-heads[0].x, -(heads[0].y + L0 * 0.5), -lo)))
A = lambda n: C.action(n)
clips = [
    dict(name='idle', action=A('01_Idle_GLTF'), f1=144),
    dict(name='strike', action=A('02_Strike_GLTF'), loop=False),
    dict(name='move_fast', action=A('03_Move_Fast_GLTF'), drift=True),
    dict(name='move_slow', action=A('04_Move_Slow_GLTF'), drift=True),
    dict(name='coiled', action=A('06_Coiled_Rest_GLTF'), f1=144),
]
# the source clips face all ways (the mamba moves along its own x): turn each so its head looks down -Y (glTF +Z)
import math
for c in clips:
    arm.animation_data.action = c['action']
    f0, f1 = c['action'].frame_range
    d = Vector()
    for k in range(8):
        C.set_frame(f0 + (f1 - f0) * k / 8)
        d += (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'head')].tail) - (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'spine_06')].head)
    d.z = 0
    yaw = math.atan2(d.x, -d.y)  # angle from -Y to d
    mid = arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'spine_30')].head
    c['pre'] = Matrix.Translation((mid.x, mid.y, 0)) @ Matrix.Rotation(-yaw, 4, 'Z') @ Matrix.Translation((-mid.x, -mid.y, 0))
    c['center_bone'] = 'spine_30'
    print('CLIPYAW', c['name'], round(math.degrees(yaw), 1))
ao, outm, acts = C.rebake(arm, meshes, keep, (straight, 0), clips, T=T, src_fps=fps, name='hoopsnake')
C.drop_source([ao] + outm)
# a third thicker (the head a little less), about the straight spine
axis = [ao.matrix_world @ ao.data.bones[n].head_local for n, _ in keep if n.startswith(('spine', 'tail'))]
for m in outm:
    K.thicken(m, axis, lambda t: 1.1 + 0.22 * min(1, max(0, t - 0.04) * 5) ** 2 * (1 - max(0, t - 0.75) * 2.4))
K.ensure_uv(outm)
dark = lambda a: np.concatenate([np.clip(a[..., :3] * np.array([0.62, 0.6, 0.55]), 0, 1), a[..., 3:]], -1)
mat = C.atlas(outm, {'hoopsnake_baked': (0, 0, 1024, 1024)}, (1024, 1024), os.path.join(K.HERE, '_build'), 'hoopsnake',
              rough={'hoopsnake_baked': 0.5}, normals=False, recolor={'hoopsnake_baked': dark})
K.unify_uv(outm)
body = C.join(outm, 'hoopsnake_mesh')
n = C.finish_mesh(body, mat, ratio=1.0)
C.limit_weights(body, 4)
lo, hi = C.bbox([body])
print('TRIS', n, 'BBOX', tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))
C.export(ao, body, os.path.join(K.OUT, 'hoopsnake.glb'), acts)
C.write_meta(os.path.join(K.HERE, '_build', 'hoopsnake.json'), {'tris': n, 'clips': [a.name for a in acts], 'chain': [k for k, _ in keep if k.startswith(('spine', 'tail'))], 'bbox': [list(lo), list(hi)]})
