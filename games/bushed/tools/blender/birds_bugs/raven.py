# The raven: "Animated Crow" by emptypen2477 (Sketchfab, CC-BY 4.0), a rigged corvid with feather cards and a full
# set of clips, made into a common raven (bigger: 62 cm bill to tail; glossy black).
#   - bones: every weighted bone and its ancestors (the '_end' leaf chains go); clips re-baked onto the lean rig;
#     on the ground clips the folded hand feathers are turned down onto the back (the source holds them up)
#   - clips: idle (looks about), idle2, walk, run, hop, fly (flap), glide, takeoff, caw (the threat display)
#   - 17k triangles -> ~5k, 1024 texture, alpha-clipped feathers; faces +Z, metres, feet on y=0
# blender -b --python raven.py -- <crow scene.gltf> <out.glb> [tris]
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
TRIS = int(argv[2]) if len(argv) > 2 else 5000
LENGTH = 0.62

C.reset()
C.import_gltf(SRC)
old = C.armature()
mesh = C.skinned_meshes(old)[0]
weighted = set()
for v in mesh.data.vertices:
    for g in v.groups:
        if g.weight > 0.01:
            weighted.add(mesh.vertex_groups[g.group].name)
keep = set()
for b in old.data.bones:
    if b.name in weighted:
        p = b
        while p is not None:
            keep.add(C.base(p.name)); p = p.parent
keep.discard('_rootJoint')
CLIPS = {
    'idle': ('Crow_Look_', None, None), 'idle2': ('Crow_Look2', None, None), 'walk': ('Crow_Walk_', None, None),
    'run': ('Crow_WalkSpeed', None, None), 'hop': ('Crow_Jump_', None, None), 'fly': ('Crow_Fly_', None, None),
    'glide': ('Crow_Float', None, None), 'takeoff': ('Crow_FlyUp', None, None), 'caw': ('Crow_Threat', None, None),
}
rig = C.lean_rig(old, keep, CLIPS, name='RavenRig')
# the source folds its wings with the hand feathers standing up off the back like a crest; on the ground clips turn
# each hand down 70 deg so the primaries lie along the back as a real raven's do
from mathutils import Quaternion, Euler
fix = Euler((math.radians(70), 0, 0)).to_quaternion()
for an in ('idle', 'idle2', 'walk', 'run', 'hop'):
    act = bpy.data.actions.get(an)
    if not act: continue
    for pb in rig.pose.bones:
        if C.base(pb.name) not in ('Bip001--L-Wing03', 'Bip001--R-Wing03'): continue
        fcs = [act.fcurves.find(f'pose.bones["{pb.name}"].rotation_quaternion', index=i) for i in range(4)]
        if not all(fcs): continue
        for j in range(len(fcs[0].keyframe_points)):
            q = Quaternion([fc.keyframe_points[j].co.y for fc in fcs]) @ fix
            for i, fc in enumerate(fcs):
                fc.keyframe_points[j].co.y = q[i]; fc.keyframe_points[j].handle_left.y = q[i]; fc.keyframe_points[j].handle_right.y = q[i]
mesh = C.skinned_meshes(rig)[0]
mesh.name = 'Raven'
n = C.decimate(mesh, TRIS)
C.limit_weights(mesh)
for m in bpy.data.materials:
    m.blend_method = 'CLIP'; m.alpha_threshold = 0.4
img = C.base_color_image().image
C.save_image(img, os.path.join(os.path.dirname(OUT), '_tex', 'raven.png'), 'PNG')

# size: bill to tail along the ground in the walk pose
rig.animation_data_create(); rig.animation_data.action = bpy.data.actions['walk']
bpy.context.scene.frame_set(0); bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); e = mesh.evaluated_get(dg); me = e.to_mesh()
vs = [e.matrix_world @ v.co for v in me.vertices]
lx = max(v.x for v in vs) - min(v.x for v in vs); ly = max(v.y for v in vs) - min(v.y for v in vs)
zmin = min(v.z for v in vs)
e.to_mesh_clear()
k = LENGTH / max(lx, ly)
rig.animation_data.action = None
print('[raven] tris', n, 'bones', len(rig.data.bones), 'scale', round(k, 4), 'feet z', round(zmin, 4))
C.face_plus_z_from(rig, bpy.data.actions['walk'], 'Bip001-head', 'Bip001-Pelvis')
rig.scale = (k, k, k)
rig.location = Vector((0, 0, -zmin * k))
C.export_glb(OUT, [rig, mesh])
