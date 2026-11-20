# SIDEHILL GOUGER: a real white-tailed doe (WildMesh_3D, CC-BY 4.0) with a real goat's horns kitbashed on (GerardoA400,
# CC-BY 4.0), its right legs made shorter than its left (so it can only walk round a hill one way), small bead eyes.
#   python -m lowpix sketchfab fetch b6172618aa304473a4cf7b9246c0a218 -o <dl>/b6172618
#   python -m lowpix sketchfab fetch 5d7431517b634f4e9e8c0f3729cd9c59 -o <dl>/5d743151
#   blender -b --python tools/blender/cryptids4/gouger.py -- <dl>
import bpy, os, sys
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import kit as K

DL = K.args()[0]
DOE, GOAT = 'b6172618aa304473a4cf7b9246c0a218', '5d7431517b634f4e9e8c0f3729cd9c59'
SHORT = 0.72         # the right legs keep this much of their length above the hoof (~0.27 m short)
SIZE = 0.95          # the doe is a little smaller than life: a gouger is goat-sized

C.reset()
# ---- the goat first: its horns, posed and frozen, then everything else of it goes
C.load(K.source(DL, GOAT))
garm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
geyes = [i for o in bpy.data.objects if o.type == 'MESH' and o.material_slots and 'eye' in (o.material_slots[0].material.name.lower()) for i in K.islands(o)]
gmid = (geyes[0][0] + geyes[1][0]) / 2
gspan = (geyes[0][0] - geyes[1][0]).length
horn_src = next(o for o in bpy.data.objects if o.type == 'MESH' and o.material_slots and o.material_slots[0].material and o.material_slots[0].material.name.startswith('Cuernos'))
horns = K.static_copy(horn_src, 'horns')
for o in list(bpy.data.objects):
    if o != horns:
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
# decimate the horns now (6.4k tris is more than the whole doe)
d = horns.modifiers.new('dec', 'DECIMATE'); d.ratio = 0.14
bpy.context.view_layer.objects.active = horns; bpy.ops.object.modifier_apply(modifier='dec')

# ---- the doe
arm, meshes, fps = C.load(K.source(DL, DOE))
ref = (C.action('Stand_Breathing_01'), 0)
arm.animation_data_create(); arm.animation_data.action = ref[0]; C.set_frame(0)
eye_obj = next(o for o in meshes if o.material_slots[0].material.name == 'Material_006')
deyes = K.islands(eye_obj)
dmid = (deyes[0][0] + deyes[1][0]) / 2
dspan = (deyes[0][0] - deyes[1][0]).length
print('EYES goat span', round(gspan, 3), 'doe span', round(dspan, 3), 'doe r', round(deyes[0][1], 4))
# horns: goat head -> doe head (same facing, -Y), scaled by eye spacing, tipped back a little to sit on the brow
s = dspan / gspan * 1.35
M = Matrix.Translation(dmid + Vector((0, 0.03, -0.012))) @ Matrix.Rotation(-0.18, 4, 'X') @ Matrix.Scale(s, 4) @ Matrix.Translation(-gmid)
horns.data.transform(M)
# bead eyes where the doe's eyes were (smaller, dark, glossy), then the old eyes go
beads = K.bead_eyes([(K.bead_from_socket(c, r, r * 0.45, dmid, 0.001), r * 0.45) for c, r, _ in deyes], 'beads')
meshes = [m for m in meshes if m != eye_obj] + [horns, beads]
bpy.data.objects.remove(eye_obj, do_unlink=True)

keep = K.auto_keep(arm, [m for m in meshes if m.vertex_groups])
print('KEEP', len(keep), [k[0] for k in keep])
head = next(s for n, s in keep if n == 'Head')
# scale to size, feet on the ground at the reference frame
lo = K.ground_z([m for m in meshes if m.name not in ('horns', 'beads')])
T = Matrix.Scale(SIZE, 4) @ Matrix.Translation((0, 0, -lo + 0.0))
A = lambda n: C.action(n)
clips = [
    dict(name='idle', action=A('Stand_Idle_02')),
    dict(name='walk', action=A('Walk_Object'), drift=True),
    dict(name='walk_r', action=A('WalkR'), drift=True),
    dict(name='trot', action=A('Trot_Object'), drift=True),
    dict(name='run', action=A('Run_Object'), drift=True),
    dict(name='eat', action=A('Stand_Eating_01')),
    dict(name='butt', action=A('JumpStand'), loop=False),
    dict(name='stamp', action=A('Hit_Stand_L01'), loop=False),
    dict(name='fall', action=A('Death_Stand_R01_Object'), loop=False, recenter=True, recenter_bone='Pelvis'),
    dict(name='lie_side', action=A('Death_Lying_R01_DeathPose'), pose=True, recenter=True, recenter_bone='Pelvis'),
    dict(name='getup', action=A('Trans_Lying_to_Stand'), loop=False),
    dict(name='liedown', action=A('Trans_Stand_to_Lying'), loop=False),
    dict(name='sleep', action=A('Lying_Breathing_01')),
]
ao, outm, acts = C.rebake(arm, meshes, keep, ref, clips, T=T, src_fps=fps, name='gouger', obj_bone={'horns': head, 'beads': head})
C.drop_source([ao] + outm)
# ---- the gouger's whole point: the right legs (rig "L" bones, at -X) are shorter
lifts = []
for m in outm:
    if m.vertex_groups:
        lifts = K.shorten_legs(ao, m, [['LBLeg1', 'LBLeg2', 'LBLeg3', 'LBLegAnkle'], ['LFLeg1', 'LFLeg2', 'LFLeg3', 'LFLegAnkle']], SHORT) if not lifts else lifts
print('LEG LIFT', [round(x, 3) for x in lifts])
# ---- one atlas: body 1024, head/legs 1024, horns 512, beads 8 px
mat = C.atlas(outm, {'Material': (0, 0, 1024, 1024), 'Material_005': (1024, 0, 1024, 1024), 'Cuernos_-_LP': (0, 1024, 512, 512), 'BeadEye': (512, 1024, 8, 8)},
              (2048, 2048), os.path.join(K.HERE, '_build'), 'gouger', rough={'BeadEye': 0.15, 'Cuernos_-_LP': 0.45}, shine={'BeadEye': 1.0}, normals=False,
              recolor={'Cuernos_-_LP': lambda a: np.concatenate([a[..., :3] * np.array([0.30, 0.28, 0.27]) + 0.02, a[..., 3:]], -1)})
K.unify_uv(outm)
body = C.join(outm, 'gouger_mesh')
n = C.finish_mesh(body, mat, ratio=1.0)
C.limit_weights(body, 4)
lo, hi = C.bbox([body])
print('TRIS', n, 'BBOX', tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))
C.export(ao, body, os.path.join(K.OUT, 'gouger.glb'), acts)
C.write_meta(os.path.join(K.HERE, '_build', 'gouger.json'), {'tris': n, 'clips': [a.name for a in acts], 'short_lift': lifts, 'bbox': [list(lo), list(hi)]})
