# The hunting animals: white-tailed buck and doe, bull and cow moose, from WildMesh_3D's animated deer, doe and
# moose (Sketchfab, CC-BY 4.0). One 37-bone rig, ~15 clips each, one 2048 atlas.
#   blender -b --python cervids.py -- <downloads dir> <out dir> [buck|doe|bull|cow ...]
# downloads dir holds sketchfab_<uid>/scene.gltf (python -m lowpix sketchfab fetch <uid>).
import bpy, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import common as C
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
DL, OUT = argv[0], argv[1]
WHICH = argv[2:] or ['buck', 'doe', 'bull', 'cow']

DEER_UID = 'f798cc7ee1214ddcb3417329636c4433'  # WildMesh's stag: only its antlers are used (on the doe's realistic body)
SRC = {
    'buck': ('b6172618aa304473a4cf7b9246c0a218', 'deer', 1.0),
    'doe': ('b6172618aa304473a4cf7b9246c0a218', 'deer', 0.9),
    'bull': ('33ce37106a24493ba4a6a6e2a9433bb6', 'moose', 1.85),
    'cow': ('33ce37106a24493ba4a6a6e2a9433bb6', 'moose', 1.72),
}
# (new name, source bone without its _NN suffix); the tongue rides on the jaw
BONES = [('root', 'RigRoot'), ('pelvis', 'RigPelvis'), ('spine1', 'RigSpine1'), ('spine2', 'RigSpine2'), ('chest', 'RigChest'),
         ('neck1', 'RigNeck1'), ('neck2', 'RigNeck2'), ('neck3', 'RigNeck3'), ('head', 'RigHead'), ('jaw', 'RigJaw1'),
         ('ear_a', 'RigLEar1'), ('ear_b', 'RigREar1'), ('lid_a', 'RigLEyelid'), ('lid_b', 'RigREyelid'),
         ('tail1', 'RigTail1'), ('tail2', 'RigTail2'),
         ('hl1_a', 'RigLBLeg1'), ('hl2_a', 'RigLBLeg2'), ('hl3_a', 'RigLBLeg3'), ('hf_a', 'RigLBLegAnkle'),
         ('hl1_b', 'RigRBLeg1'), ('hl2_b', 'RigRBLeg2'), ('hl3_b', 'RigRBLeg3'), ('hf_b', 'RigRBLegAnkle'),
         ('sc_a', 'RigLFLegCollarbone'), ('fl1_a', 'RigLFLeg1'), ('fl2_a', 'RigLFLeg2'), ('fl3_a', 'RigLFLeg3'), ('ff_a', 'RigLFLegAnkle'),
         ('sc_b', 'RigRFLegCollarbone'), ('fl1_b', 'RigRFLeg1'), ('fl2_b', 'RigRFLeg2'), ('fl3_b', 'RigRFLeg3'), ('ff_b', 'RigRFLegAnkle')]
# game clip <- source action (loop?, drift?)
CLIPS = [('idle', 'Stand_Idle_02', 1), ('alert', 'Stand_Breathing_01', 1), ('graze', 'Stand_Eating_01', 1),
         ('walk', 'Walk_Object', 1), ('limp', 'WalkSlow_Object', 1), ('trot', 'Trot_Object', 1), ('run', 'Run_Object', 1), ('sprint', 'Sprint_Object', 1),
         ('flinch', 'Hit_Stand_L01', 0), ('kick', 'JumpStand', 0), ('death', 'Death_Stand_R01_Object', 0),
         ('dead', 'Death_Stand_R01_DeathPose', 0), ('lie', 'Trans_Stand_to_Lying', 0), ('bed', 'Lying_Breathing_01', 1),
         ('rise', 'Trans_Lying_to_Stand', 0)]


def dark_eye(a):
    # real deer eyes: a dark, glossy bead (the source has an orange iris); keep painted highlights
    lum = a[..., :3].max(axis=2, keepdims=True)
    out = a.copy()
    out[..., :3] = np.where(lum > 0.82, a[..., :3] * 0.9, a[..., :3] * 0.16 + np.array([0.018, 0.012, 0.009]))
    return out


for kind in WHICH:
    uid, species, withers = SRC[kind]
    C.reset()
    path = os.path.join(DL, uid, f'sketchfab_{uid}', 'scene.gltf')
    arm, meshes, fps = C.load(path)
    antler = [o for o in meshes if 'Chifre' in o.name]
    if kind == 'buck':
        # the stag's rack, moved from its head bone onto the doe's head bone and shrunk to a whitetail's
        doe_objs = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(DL, DEER_UID, f'sketchfab_{DEER_UID}', 'scene.gltf'))
        new = [o for o in bpy.data.objects if o not in doe_objs]
        sarm = next(o for o in new if o.type == 'ARMATURE')
        rack = next(o for o in new if o.type == 'MESH' and 'Chifre' in o.name)
        sarm.animation_data.action = next(a for a in bpy.data.actions if a.name.startswith('Stand_Idle_02') and a.name != 'Stand_Idle_02_Object_5')
        arm.animation_data.action = C.action('Stand_Idle_02')
        C.set_frame(0)
        # same clip, same frame: both heads are posed alike, so move the rack from head point to head point in world
        # space and shrink it about the head (the doe's bone frames are mirrored, its world pose is not)
        Hs = (sarm.matrix_world @ sarm.pose.bones[C.find_bone(sarm, 'RigHead')].matrix).translation
        Hd = (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'RigHead')].matrix).translation
        k = 0.865 * 0.6
        wm = Matrix.Translation(Hd) @ Matrix.Scale(k, 4) @ Matrix.Translation(-Hs) @ rack.matrix_world
        rack.parent = None
        rack.matrix_world = wm
        for o in new:
            if o != rack:
                bpy.data.objects.remove(o, do_unlink=True)
        for a in list(bpy.data.actions):
            if a.name.endswith('.001'):
                bpy.data.actions.remove(a)
        meshes.append(rack); antler = [rack]
    if kind in ('cow',):
        meshes = [o for o in meshes if o not in antler]
        for o in antler:
            bpy.data.objects.remove(o, do_unlink=True)
        antler = []
    ref = (C.action('Stand_Idle_02'), 0)
    # measure at the reference pose (unscaled): withers = top of the back above the chest bone, ground = lowest hoof
    arm.animation_data.action = ref[0]; C.set_frame(0)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        if o in antler:
            continue
        me = o.evaluated_get(dg).to_mesh()
        pts += [tuple(o.matrix_world @ v.co) for v in me.vertices]
        o.evaluated_get(dg).to_mesh_clear()
    P = np.array(pts)
    chest = (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'RigChest')].matrix).translation
    pelvis = (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'RigPelvis')].matrix).translation
    zmin = P[:, 2].min()
    band = P[np.abs(P[:, 1] - chest.y) < 0.06 * (P[:, 1].max() - P[:, 1].min())]
    top = band[:, 2].max()
    s = withers / (top - zmin)
    cy = (chest.y + pelvis.y) / 2
    T = Matrix.Scale(s, 4) @ Matrix.Translation((-chest.x * 0, -cy, -zmin))
    print(kind, 'scale', s, 'withers src', top - zmin)
    # sides: the source's "L" bones are named by where they really are (+x = the animal's left; the doe is mirrored)
    a_left = (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'RigLEar1')].matrix).translation.x > 0
    keep = [((n[:-2] + ('L' if (n.endswith('_a')) == a_left else 'R')) if n.endswith(('_a', '_b')) else n, C.find_bone(arm, sb)) for n, sb in BONES]
    clips = [dict(name=n, action=C.action(a), loop=bool(l)) for n, a, l in CLIPS]
    clips[[c['name'] for c in clips].index('dead')]['pose'] = True
    obj_bone = {o.name: C.find_bone(arm, 'RigHead') for o in antler}
    if kind == 'buck':
        # the antler sits a little low and back once shrunk: lift it onto the pedicels
        pass
    ao, outs, acts = C.rebake(arm, meshes, keep, ref, clips, T, src_fps=fps, name=kind, obj_bone=obj_bone, anchor='pelvis')
    mat_names = {}
    for o in outs:
        for sl in o.material_slots:
            mat_names[sl.material.name] = sl.material
    # atlas: quadrants of a 2048 page (body, head, antler, eye)
    layout, rough, shine, recolor = {}, {}, {}, {}
    for mn, m in mat_names.items():
        low = mn.lower()
        img = C.base_image(m)
        if 'eye' in low or (img and img.size[0] <= 128) or mn == 'Material_006':
            layout[mn] = (1024, 0, 512, 512); rough[mn] = 0.12; shine[mn] = 1.0; recolor[mn] = dark_eye
        elif 'chifre' in low:
            layout[mn] = (0, 0, 1024, 1024); rough[mn] = 0.62
            # bone-coloured antlers: pale tips, brown grooved beams (the source is posterised)
            recolor[mn] = C.realify([(0, (0.16, 0.12, 0.08)), (0.45, (0.36, 0.29, 0.21)), (0.8, (0.62, 0.56, 0.46)), (1, (0.78, 0.74, 0.66))], soft=4, keep_hue=0.1, fur=0.08, streak=(1, 15))
        elif 'head' in low or mn == 'Material_005':
            layout[mn] = (1024, 1024, 1024, 1024); rough[mn] = 0.8
        else:
            layout[mn] = (0, 1024, 1024, 1024); rough[mn] = 0.86
        if species == 'moose' and 'chifre' not in low and 'eye' not in low:
            # a real moose is near black-brown on the back, greyer on the legs and muzzle (the source is cel-shaded)
            recolor[mn] = C.realify([(0, (0.025, 0.018, 0.013)), (0.35, (0.075, 0.055, 0.04)), (0.7, (0.2, 0.155, 0.115)), (1, (0.42, 0.37, 0.31))], soft=3.5, keep_hue=0.15, fur=0.16)
    print('layout', layout)
    mat = C.atlas(outs, layout, (2048, 2048), os.path.join(OUT, '_tex'), kind, rough=rough, shine=shine, recolor=recolor)
    body = C.join(outs, kind + '_body')
    tris = C.finish_mesh(body, mat, 1.0)
    C.limit_weights(body)
    C.drop_source([ao, body])
    lo, hi = C.bbox([body])
    dims = {'withers': withers, 'length': hi.y - lo.y, 'height': hi.z - lo.z, 'width': hi.x - lo.x}
    print(kind, 'tris', tris, 'dims', dims)
    sub = 'deer' if species == 'deer' else 'moose'
    C.export(ao, body, os.path.join(OUT, sub, f'{kind}.glb'), acts)
    C.write_meta(os.path.join(OUT, sub, f'{kind}.json'), {'tris': tris, 'bones': len(ao.data.bones), 'dims': dims, 'clips': [a.name for a in acts]})
