# The small wildlife mammals: a red squirrel ("Realistic_squirrel_3d_model" by mgddeldeen9020, static: rigged and
# animated here) and a snowshoe hare (the brown summer coat; "Rabbit Rigged" by FourthGreen, rebaked, clips
# authored here). Both Sketchfab, CC-BY 4.0.
#   blender -b --python small.py -- <downloads dir> <out dir> [squirrel] [hare]
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import common as C
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
DL, OUT = argv[0], argv[1]
WHICH = argv[2:] or ['squirrel', 'hare']
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
TAU, sin, cos = math.tau, math.sin, math.cos


def ease(x):
    x = min(max(x, 0), 1); return x * x * (3 - 2 * x)


def src(uid):
    return os.path.join(DL, uid, f'sketchfab_{uid}', 'scene.gltf')


def rest_of(ao):
    return {b.name: b.matrix_local.copy() for b in ao.data.bones}


def dark_eye(a):
    lum = a[..., :3].max(axis=2, keepdims=True)
    out = a.copy()
    out[..., :3] = np.where(lum > 0.85, a[..., :3], a[..., :3] * 0.12 + np.array([0.015, 0.01, 0.008]))
    return out


# ================================================================================================ squirrel
def squirrel():
    C.reset()
    _, meshes, fps = C.load(src('b492079385ff407ab68aa7f72c88f828'))
    body = next(o for o in meshes if len(o.data.vertices) > 1000)
    eyes = next(o for o in meshes if o is not body)
    # bake the meshes' transforms; the model faces -y in metres already (head+body 23 cm, tail 19 cm)
    for o in meshes:
        o.data.transform(o.matrix_world); o.parent = None; o.matrix_world = Matrix.Identity(4)
    # the rig, from the mesh's landmarks (slices along y: head -0.14..-0.09, forelegs -0.09..-0.05, hind legs 0.03..0.09, tail 0.09..0.28)
    B = [('root', None, (0, 0.0, 0.0), (0, -0.03, 0.0)),
         ('hips', 'root', (0, 0.045, 0.075), (0, 0.0, 0.08)), ('spine', 'hips', (0, 0.0, 0.08), (0, -0.04, 0.085)),
         ('chest', 'spine', (0, -0.04, 0.085), (0, -0.075, 0.09)), ('neck', 'chest', (0, -0.075, 0.09), (0, -0.097, 0.1)),
         ('head', 'neck', (0, -0.097, 0.1), (0, -0.139, 0.098))]
    for i, (y0, y1) in enumerate([(0.08, 0.12), (0.12, 0.16), (0.16, 0.2), (0.2, 0.24), (0.24, 0.285)]):
        B.append((f'tail{i + 1}', 'hips' if i == 0 else f'tail{i}', (0, y0, 0.1 if i else 0.085), (0, y1, 0.105)))
    for s, sx in (('L', 1), ('R', -1)):
        B += [(f'fu{s}', 'chest', (sx * 0.022, -0.068, 0.07), (sx * 0.025, -0.072, 0.036)),
              (f'fl{s}', f'fu{s}', (sx * 0.025, -0.072, 0.036), (sx * 0.024, -0.08, 0.009)),
              (f'fp{s}', f'fl{s}', (sx * 0.024, -0.08, 0.009), (sx * 0.024, -0.096, 0.0)),
              (f'hu{s}', 'hips', (sx * 0.026, 0.05, 0.065), (sx * 0.03, 0.03, 0.032)),
              (f'hl{s}', f'hu{s}', (sx * 0.03, 0.03, 0.032), (sx * 0.031, 0.072, 0.012)),
              (f'hf{s}', f'hl{s}', (sx * 0.031, 0.072, 0.012), (sx * 0.03, 0.028, 0.0))]
    ad = bpy.data.armatures.new('squirrel'); ao = bpy.data.objects.new('squirrel', ad)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    for n, p, h, t in B:
        eb = ad.edit_bones.new(n); eb.head = h; eb.tail = t; eb.roll = 0
    for n, p, h, t in B:
        if p:
            ad.edit_bones[n].parent = ad.edit_bones[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    # automatic (heat) weights for the body; the eyes ride on the head
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    eyes.parent = ao
    g = eyes.vertex_groups.new(name='head'); g.add([v.index for v in eyes.data.vertices], 1.0, 'REPLACE')
    m = eyes.modifiers.new('Armature', 'ARMATURE'); m.object = ao
    ao.animation_data_create()
    for pb in ao.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    R = rest_of(ao)
    const = lambda t: R
    # a squirrel carries its tail up over its back in an S
    def tail(t, lift=1.0, flick=0.0):
        f = flick * sin(TAU * 7 * t)
        return [('rot', 'tail1', X, 1.15 * lift), ('rot', 'tail2', X, 0.55 * lift + f), ('rot', 'tail3', X, 0.15 * lift + f * 0.7),
                ('rot', 'tail4', X, -0.45 * lift + f * 0.5), ('rot', 'tail5', X, -0.6 * lift)]
    def situp(k):
        # up on its haunches: the bend spread down the back (hips, spine, chest); the hind legs and the tail keep their
        # line to the ground
        return [('rot', 'hips', X, -0.28 * k), ('rot', 'huL', X, 0.28 * k), ('rot', 'huR', X, 0.28 * k), ('rot', 'tail1', X, 0.22 * k),
                ('rot', 'spine', X, -0.32 * k), ('rot', 'chest', X, -0.22 * k), ('rot', 'fuL', X, 0.5 * k), ('rot', 'fuR', X, 0.5 * k),
                ('move', 'root', (0, 0, 0.008 * k))]
    acts = []
    def idle(t):
        look = 0.5 * math.copysign(1, sin(TAU * t / 3)) * ease(abs(sin(TAU * t / 3)) * 3)
        flick = 1.0 if (t % 3) < 0.4 else 0.0
        return tail(t, 1, 0.15 * flick) + [('rot', 'neck', Z, look * 0.6), ('rot', 'head', X, 0.08 * sin(TAU * t * 0.5))]
    acts.append(C.author(ao, 'idle', 3.0, const, idle))
    def run(t, dur=0.36):
        p = TAU * t / dur; s = sin(p)
        return [('move', 'root', (0, 0, 0.022 * max(0, sin(p + 0.6)))), ('rot', 'spine', X, 0.25 * s), ('rot', 'chest', X, -0.15 * s),
                ('rot', 'huL', X, 1.25 * s), ('rot', 'huR', X, 1.25 * s), ('rot', 'hlL', X, -0.5 * max(0, s)), ('rot', 'hlR', X, -0.5 * max(0, s)),
                ('rot', 'fuL', X, -1.1 * sin(p + 2.2)), ('rot', 'fuR', X, -1.1 * sin(p + 2.0)), ('rot', 'flL', X, 0.5 * max(0, sin(p + 2.2))), ('rot', 'flR', X, 0.5 * max(0, sin(p + 2.0))),
                ('rot', 'head', X, -0.12 * s)] + [('rot', 'tail1', X, 0.45), ('rot', 'tail2', X, 0.15 + 0.2 * sin(p - 1)), ('rot', 'tail3', X, 0.1 * sin(p - 2)), ('rot', 'tail4', X, -0.15)]
    acts.append(C.author(ao, 'run', 0.3, const, lambda t: run(t, 0.3)))
    acts.append(C.author(ao, 'eat', 1.0, const, lambda t: situp(1) + tail(t, 0.9) + [
        ('rot', 'neck', X, 0.25), ('rot', 'head', X, 0.35 + 0.06 * sin(TAU * t * 9)),
        ('rot', 'flL', X, -0.35 + 0.06 * sin(TAU * t * 9)), ('rot', 'flR', X, -0.35 + 0.06 * sin(TAU * t * 9))]))
    acts.append(C.author(ao, 'beg', 2.0, const, lambda t: situp(1) + tail(t, 0.9, 0.08) + [
        ('rot', 'neck', X, -0.1), ('rot', 'head', X, 0.05 + 0.04 * sin(TAU * t * 5)), ('rot', 'head', Y, 0.2 * sin(TAU * t / 2)),
        ('rot', 'flL', X, -0.25), ('rot', 'flR', X, -0.25)]))
    acts.append(C.author(ao, 'alert', 2.0, const, lambda t: situp(1.2) + tail(t, 1, 0.2 if (t % 1.0) < 0.3 else 0) + [
        ('rot', 'neck', X, -0.2),
        ('rot', 'neck', Z, 0.35 * math.copysign(1, sin(TAU * t / 2)))]))
    acts.append(C.author(ao, 'freeze', 1.0, const, lambda t: [('move', 'root', (0, 0, -0.012)), ('rot', 'tail1', X, 0.35), ('rot', 'tail2', X, 0.2), ('rot', 'head', X, 0.1)]))
    # atlas: the coat (2048 -> 1024, squashed 6% to make room) and the eyes
    mats = {s.material.name for o in meshes for s in o.material_slots if s.material}
    layout = {'Material': (0, 64, 1024, 960), 'Material.001': (0, 0, 128, 64)}
    mat = C.atlas([body, eyes], layout, (1024, 1024), os.path.join(OUT, '_tex'), 'squirrel', rough={'Material': 0.85, 'Material.001': 0.1},
                  shine={'Material.001': 1.0}, recolor={'Material.001': dark_eye})
    o = C.join([body, eyes], 'squirrel_body')
    tris = C.finish_mesh(o, mat, 1.0)
    C.limit_weights(o)
    C.drop_source([ao, o])
    return ao, o, acts, tris


# ================================================================================================ hare
HB = [('root', 'Root_M'), ('spine1', 'Spine1_M'), ('spine2', 'Spine2_M'), ('chest', 'Chest_M'), ('neck', 'Neck_M'), ('head', 'Head_M'),
      ('nose', 'Nose_M'), ('tail0', 'Tail0_M'), ('tail1', 'Tail1_M')]
for s in ('L', 'R'):
    HB += [(f'ear0{s}', f'Ear_{s}'), (f'ear1{s}', f'Ear1_{s}'), (f'ear2{s}', f'Ear2_{s}'),
           (f'sc{s}', f'frontRump_{s}'), (f'fu{s}', f'frontHip_{s}'), (f'fl{s}', f'frontKnee_{s}'), (f'fp{s}', f'frontAnkle_{s}'), (f'ft{s}', f'frontToes_{s}'),
           (f'hu{s}', f'backHip_{s}'), (f'hl{s}', f'backKnee_{s}'), (f'hf{s}', f'backAnkle_{s}'), (f'ht{s}', f'backToes_{s}')]


def hare():
    C.reset()
    arm, meshes, fps = C.load(src('e7213589744d436b9d96e2dbb31198a5'))
    body = meshes[0]
    ref = (C.action('Take 001'), 0)
    C._rest_pose(arm); arm.animation_data.action = ref[0]; C.set_frame(0)
    dg = bpy.context.evaluated_depsgraph_get(); em = body.evaluated_get(dg).to_mesh()
    P = np.array([tuple(body.matrix_world @ v.co) for v in em.vertices]); body.evaluated_get(dg).to_mesh_clear()
    L = np.ptp(P[:, 1])
    s = 0.44 / L  # nose to tail: a snowshoe hare
    T = Matrix.Scale(s, 4) @ Matrix.Translation((0, -P[:, 1].mean(), -P[:, 2].min()))
    side_ok = (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, 'Ear_L')].matrix).translation.x > 0
    keep = []
    for n, b in HB:
        if n.endswith(('L', 'R')) and not side_ok:
            n = n[:-1] + ('R' if n.endswith('L') else 'L')
        keep.append((n, C.find_bone(arm, b)))
    ao, outs, acts = C.rebake(arm, [body], keep, ref, [], T, src_fps=fps, name='hare')
    for pb in ao.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    R = rest_of(ao)
    const = lambda t: R
    ears = lambda a, b=0.0: [('rot', 'ear0L', X, a), ('rot', 'ear0R', X, a), ('rot', 'ear0L', Y, b), ('rot', 'ear0R', Y, -b)]
    acts = []
    acts.append(C.author(ao, 'idle', 4.0, const, lambda t: ears(0.05 * sin(TAU * t / 4), 0.25 * max(0, sin(TAU * t / 2))) + [
        ('rot', 'nose', X, 0.06 * sin(TAU * t * 6) * (1 if (t % 2) < 0.8 else 0)), ('rot', 'head', Z, 0.25 * sin(TAU * t / 4))]))
    def hop(t, dur, amp):
        ph = (t / dur) % 1
        air = ease(ph / 0.45) * (1 - ease((ph - 0.45) / 0.4))  # 0 on the ground .. 1 stretched in the air
        return [('move', 'root', (0, 0, amp * 0.11 * sin(math.pi * min(ph / 0.8, 1)))), ('rot', 'root', X, -0.25 * amp * sin(TAU * ph)),
                ('rot', 'huL', X, 1.1 * amp * air), ('rot', 'huR', X, 1.1 * amp * air), ('rot', 'hfL', X, 0.6 * amp * air), ('rot', 'hfR', X, 0.6 * amp * air),
                ('rot', 'fuL', X, -0.9 * amp * air), ('rot', 'fuR', X, -0.9 * amp * air), ('rot', 'spine1', X, 0.25 * amp * air)] + ears(-0.5 * amp)
    acts.append(C.author(ao, 'hop', 0.55, const, lambda t: hop(t, 0.55, 0.6)))
    acts.append(C.author(ao, 'run', 0.34, const, lambda t: hop(t, 0.34, 1.0)))
    acts.append(C.author(ao, 'freeze', 1.0, const, lambda t: [('move', 'root', (0, 0, -0.025)), ('rot', 'neck', X, 0.12)] + ears(-1.15)))
    acts.append(C.author(ao, 'alert', 2.0, const, lambda t: [('rot', 'spine1', X, -0.35), ('rot', 'huL', X, 0.35), ('rot', 'huR', X, 0.35),
                                                             ('move', 'root', (0, 0, 0.02)), ('rot', 'neck', X, -0.2)] + ears(-0.15, 0.15 * sin(TAU * t / 2))))
    acts.append(C.author(ao, 'graze', 2.0, const, lambda t: [('rot', 'neck', X, 0.45), ('rot', 'head', X, 0.35 + 0.05 * sin(TAU * t * 5))] + ears(-0.3)))
    o = outs[0]
    # eyes: the darkest texels on the head become wet, shining beads
    img = C.base_image(o.material_slots[0].material)
    a = C.img_array(img, 512, 512)
    head = ao.data.bones['head'].head_local
    me = o.data; uvl = me.uv_layers.active.data
    eye_faces = []
    for p in me.polygons:
        c = sum((me.vertices[v].co for v in p.vertices), Vector()) / len(p.vertices)
        if (c - head).length > 0.09 or c.y > head.y:
            continue
        u = sum(uvl[li].uv[0] for li in p.loop_indices) / p.loop_total; v = sum(uvl[li].uv[1] for li in p.loop_indices) / p.loop_total
        px = a[min(511, int(v * 512)), min(511, int(u * 512)), :3]
        if px.max() < 0.16:
            eye_faces.append(p.index)
    print('hare eye faces', len(eye_faces))
    def post(col, sd, nrm):
        m = C.raster_faces(o, eye_faces, col.shape[1], col.shape[0])
        sd[m, 0] = 1.0; sd[m, 1] = 0.12
    mn = o.material_slots[0].material.name
    def summer_coat(a):
        # a snowshoe hare's summer coat is grizzled grey-brown, not the source rabbit's ginger: desaturate and cool it
        rgb = a[..., :3]; g = rgb @ np.array([0.3, 0.55, 0.15], np.float32)
        tint = np.array([0.98, 0.9, 0.78], np.float32)
        out = a.copy(); out[..., :3] = np.clip(rgb * 0.45 + (g[..., None] * tint) * 0.5, 0, 1) * 0.92
        return out
    mat = C.atlas([o], {mn: (0, 0, 512, 512)}, (512, 512), os.path.join(OUT, '_tex'), 'hare', rough={mn: 0.88}, post=post, recolor={mn: summer_coat})
    tris = C.finish_mesh(o, mat, 1.0)
    C.limit_weights(o)
    C.drop_source([ao, o])
    return ao, o, acts, tris


for kind in WHICH:
    ao, o, acts, tris = squirrel() if kind == 'squirrel' else hare()
    lo, hi = C.bbox([o])
    dims = {'length': hi.y - lo.y, 'height': hi.z - lo.z, 'width': hi.x - lo.x}
    print(kind, 'tris', tris, 'dims', dims)
    C.export(ao, o, os.path.join(OUT, kind, f'{kind}.glb'), acts)
    C.write_meta(os.path.join(OUT, kind, f'{kind}.json'), {'tris': tris, 'bones': len(ao.data.bones), 'dims': dims, 'clips': [a.name for a in acts]})
