# Static bird scans made into game birds: the hairy woodpecker ("Hairy Woodpecker (Leuconotopicus villosus)" by
# oneillbeck, CC-BY 4.0) and the ruffed grouse (Carnegie Museum of Natural History, cmp_innovation_studio, CC-BY 4.0,
# a photo-scanned mount: its rock base is cut away). Neither came rigged, so this script finds the bird's line (tail
# tip -> bill tip), the spine through the slice centroids and the feet, builds a small rig (root, body, neck, head,
# tail, and for the grouse the folded wings), weights it by distance to each bone, and keys the clips:
#   woodpecker: idle (looks about), drum (a burst of hammer blows), peck (slow probing), hitch (a hop up the bark)
#   grouse:     idle, walk (the head bobbing like a hen's), drum (stands tall on its log and beats the air: thump..
#               thump.. thump-rrrrr), alert (neck up, tail fanned)
# Then decimates, shrinks the texture, sizes the bird (m), puts the feet on y=0 facing +Z, and exports one .glb.
# blender -b --python scan_bird.py -- <woodpecker|grouse> <scene.gltf> <out.glb>
import bpy, bmesh, sys, os, math, mathutils
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import common as C
from mathutils import Vector, Quaternion, Euler

argv = sys.argv[sys.argv.index('--') + 1:]
KIND, SRC, OUT = argv[0], argv[1], argv[2]
TRIS = int(argv[3]) if len(argv) > 3 else None
CFG = {
    # length (m, bill to tail tip); proportions along the line from the tail tip (0) to the bill tip (1)
    'woodpecker': dict(length=0.23, tris=4000, tex=1024, tail=0.34, pelvis=0.42, chest=0.64, neck=0.70, head=0.80, cut=None, wings=False),
    'grouse': dict(length=0.44, tris=5000, tex=1024, tail=0.30, pelvis=0.38, chest=0.62, neck=0.66, head=0.84, cut=-0.104, wings=True),
}[KIND]

C.reset()
C.import_gltf(SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
C.select_only(meshes)
if len(meshes) > 1:
    bpy.ops.object.join()
me = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o != me:
        bpy.data.objects.remove(o, do_unlink=True)

# cut the mount's base away (keep everything above the cut, and the tail that hangs past it)
if CFG['cut'] is not None:
    bm = bmesh.new(); bm.from_mesh(me.data)
    kill = [v for v in bm.verts if v.co.z < CFG['cut'] and v.co.x > -0.11]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    # drop small loose islands left behind
    bm.verts.ensure_lookup_table()
    seen, islands = set(), []
    for v in bm.verts:
        if v in seen: continue
        st, isl = [v], []
        seen.add(v)
        while st:
            a = st.pop(); isl.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b not in seen: seen.add(b); st.append(b)
        islands.append(isl)
    big = max(len(i) for i in islands)
    # (only islands down at the cut: the scan's body is itself made of many patches)
    low = [i for i in islands if len(i) < big * 0.02 and sum(v.co.z for v in i) / len(i) < CFG['cut'] + 0.012]
    bmesh.ops.delete(bm, geom=[v for i in low for v in i], context='VERTS')
    bm.to_mesh(me.data); bm.free()

V = np.array([v.co for v in me.data.vertices], np.float64)
# the bird's line: the bill tip is the vertex farthest from the tail tip among the high ones; the tail tip the lowest-back
tail_tip = V[np.argmin(V[:, 0] + V[:, 2] * 0.4)] if KIND == 'woodpecker' else V[np.argmin(V[:, 0] * 1.0 + V[:, 2] * 0.3)]
d = np.linalg.norm(V - tail_tip, axis=1)
bill_tip = V[np.argmax(d)]
axis = (bill_tip - tail_tip); L = np.linalg.norm(axis); axis /= L
t = (V - tail_tip) @ axis / L
# the bird's plane: the axis and world up; side = axis x up
up0 = np.array([0, 0, 1.0]); side = np.cross(axis, up0); side /= np.linalg.norm(side); upn = np.cross(side, axis)
def spine(tt, w=0.04):
    m = np.abs(t - tt) < w
    return V[m].mean(0) if m.sum() > 5 else tail_tip + axis * L * tt
P = {k: spine(CFG[k]) for k in ('tail', 'pelvis', 'chest', 'neck', 'head')}
P['tailtip'] = tail_tip + axis * L * 0.02; P['bill'] = bill_tip
# feet: the lowest vertices (along -up) between the pelvis and the chest
mid = (t > CFG['pelvis'] - 0.06) & (t < CFG['chest'])
below = (V - P['pelvis']) @ upn
foot_i = np.argsort(below + 1e3 * (~mid))[:40]
foot = V[foot_i].mean(0)
print('[scan]', KIND, 'L', round(L, 4), 'tail', np.round(tail_tip, 3), 'bill', np.round(bill_tip, 3), 'foot', np.round(foot, 3))

# ---- the rig (in the source frame; turned and scaled at the end)
ad = bpy.data.armatures.new(KIND); arm = bpy.data.objects.new(KIND, ad); bpy.context.scene.collection.objects.link(arm)
C.select_only([arm]); bpy.ops.object.mode_set(mode='EDIT')
def bone(n, h, tl, parent=None):
    b = ad.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(tl)
    if (b.tail - b.head).length < 1e-6: b.tail = b.head + Vector((0, 0, L * 0.05))
    if parent: b.parent = ad.edit_bones[parent]
    return b
bone('root', foot, foot + upn * L * 0.1)
bone('body', P['pelvis'], P['chest'], 'root')
bone('neck', P['chest'], P['neck'] + (P['head'] - P['neck']) * 0.3, 'body')
bone('head', P['neck'] + (P['head'] - P['neck']) * 0.3, P['head'] + axis * L * 0.05, 'neck')
bone('tail', P['tail'], P['tailtip'], 'body')
segs = {'body': (P['pelvis'], P['chest'], 0.16), 'neck': (P['chest'], P['neck'], 0.09), 'head': (P['head'] - axis * L * 0.03, P['bill'], 0.08),
        'tail': (P['tail'] - axis * L * 0.02, P['tailtip'], 0.08)}
if CFG['wings']:
    hw = np.percentile(np.abs((V - P['chest']) @ side)[(t > 0.4) & (t < 0.62)], 90)
    for s, sg in (('L', 1), ('R', -1)):
        sh = P['chest'] + side * sg * hw * 0.8 + upn * L * 0.02
        tip = spine(0.36) + side * sg * hw * 0.7 + upn * L * 0.03
        bone('wing' + s, sh, tip, 'body')
        segs['wing' + s] = (sh, tip, 0.05)
bpy.ops.object.mode_set(mode='OBJECT')

# ---- weights: by distance to each bone's segment (radius as a fraction of the length), the two strongest kept
def segdist(A, B):
    ab = B - A; tt = np.clip(((V - A) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(V - (A + np.outer(tt, ab)), axis=1)
W = {}
for n, (A, B, r) in segs.items():
    W[n] = np.exp(-(segdist(np.array(A), np.array(B)) / (r * L)) ** 2)
# the head owns everything ahead of the neck; the tail everything behind its root; wings only on the sides
W['head'] *= 1 + 4 * (t > CFG['head'] - 0.04)
W['neck'] *= (t > CFG['chest'] - 0.05)
W['tail'] *= np.clip((CFG['tail'] + 0.03 - t) / 0.06, 0, 1) * 3
if CFG['wings']:
    lat = (V - P['chest']) @ side
    for s, sg in (('L', 1), ('R', -1)):
        W['wing' + s] *= np.clip((lat * sg - hw * 0.45) / (hw * 0.3), 0, 1) * 2
W['body'] += 1e-4
names = list(W.keys()); M = np.stack([W[n] for n in names], 1)
order = np.argsort(-M, 1)[:, :2]
for n in names: me.vertex_groups.new(name=n)
for i in range(len(V)):
    a, b = order[i]; wa, wb = M[i, a], M[i, b]; s = wa + wb
    me.vertex_groups[names[a]].add([i], wa / s, 'REPLACE')
    if wb / s > 0.05: me.vertex_groups[names[b]].add([i], wb / s, 'REPLACE')
mod = me.modifiers.new('arm', 'ARMATURE'); mod.object = arm; me.parent = arm

# ---- clips (keys on pose bones; angles in degrees about the bone's local x = pitch, z = turn, y = roll)
arm.animation_data_create()
def clip(name, frames, keys):
    """keys: {bone: [(frame, (rx, ry, rz)[, (lx, ly, lz)]), ...]}"""
    act = bpy.data.actions.new(name); act.use_fake_user = True; act.id_root = 'OBJECT'
    arm.animation_data.action = act
    for pb in arm.pose.bones:
        ks = keys.get(pb.name, [(0, (0, 0, 0)), (frames, (0, 0, 0))])
        for k in ks:
            f, r = k[0], k[1]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = Euler([math.radians(x) for x in r], 'XYZ').to_quaternion()
            pb.location = Vector(k[2]) * L if len(k) > 2 else Vector((0, 0, 0))
            pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
    arm.animation_data.action = None
    return act
F = 24
if KIND == 'woodpecker':
    clip('idle', 96, {'head': [(0, (0, 0, 0)), (20, (0, 0, 28)), (34, (0, 0, 28)), (50, (-8, 0, -24)), (70, (-8, 0, -24)), (84, (4, 10, 0)), (96, (0, 0, 0))],
                      'tail': [(0, (0, 0, 0)), (48, (2, 0, 0)), (96, (0, 0, 0))]})
    # a drum roll: a dozen blows in under a second, then stillness
    drum = [(0, (0, 0, 0))]
    for i in range(14):
        drum += [(4 + i * 1.6, (0, 0, 0)), (4.8 + i * 1.6, (26, 0, 0))]
    drum += [(28, (0, 0, 0)), (60, (0, 0, 0))]
    neck = [(f, (r[0] * 0.5, 0, 0)) for f, r in drum]
    clip('drum', 60, {'head': drum, 'neck': neck})
    peck = [(0, (0, 0, 0))]
    for i in range(4):
        peck += [(6 + i * 10, (0, 0, -8 + i * 5)), (9 + i * 10, (30, 0, -8 + i * 5)), (12 + i * 10, (0, 0, -8 + i * 5))]
    peck += [(48, (0, 0, 0))]
    clip('peck', 48, {'head': peck, 'neck': [(f, (r[0] * 0.4, 0, 0)) for f, r in peck]})
    clip('hitch', 12, {'root': [(0, (0, 0, 0), (0, 0, 0)), (4, (-6, 0, 0), (0, 0.05, 0)), (8, (0, 0, 0), (0, 0.08, 0)), (12, (0, 0, 0), (0, 0, 0))],
                       'tail': [(0, (0, 0, 0)), (4, (-15, 0, 0)), (12, (0, 0, 0))]})
else:
    clip('idle', 120, {'head': [(0, (0, 0, 0)), (24, (0, 0, 30)), (40, (0, 0, 30)), (64, (-10, 0, -26)), (90, (-10, 0, -26)), (120, (0, 0, 0))],
                       'neck': [(0, (0, 0, 0)), (60, (-4, 0, 0)), (120, (0, 0, 0))],
                       'tail': [(0, (0, 0, 0)), (60, (3, 0, 0)), (120, (0, 0, 0))]})
    # walk: a hen's head bob (thrust forward, hold while the body catches up), the body rocking side to side
    clip('walk', 16, {'head': [(0, (8, 0, 0)), (8, (-10, 0, 0)), (16, (8, 0, 0))],
                      'neck': [(0, (-10, 0, 0), (0, 0, 0.0)), (6, (12, 0, 0), (0, 0, 0.04)), (8, (12, 0, 0), (0, 0, 0.04)), (16, (-10, 0, 0), (0, 0, 0))],
                      'body': [(0, (0, 4, 0)), (8, (0, -4, 0)), (16, (0, 4, 0))],
                      'tail': [(0, (2, 0, 3)), (8, (2, 0, -3)), (16, (2, 0, 3))]})
    # drum: stands tall, braced on its tail; slow cupped beats speeding into a whirr (about 8 s)
    beats = []; tt = 6.0; f = 6.0; sp = 14.0
    while f < 190:
        beats += [(f, (0, 0, 0)), (f + sp * 0.35, (0, 0, 1))]
        f += sp; sp = max(2.0, sp * 0.84)
    def wing(sg):
        out = [(0, (0, 0, 0))]
        for fr, b in beats:
            out.append((fr, (-10, 0, sg * (8 if b[2] == 0 else 70))))
        out += [(200, (0, 0, 0)), (240, (0, 0, 0))]
        return out
    clip('drum', 240, {'body': [(0, (0, 0, 0)), (6, (-28, 0, 0)), (200, (-28, 0, 0)), (230, (0, 0, 0)), (240, (0, 0, 0))],
                       'neck': [(0, (0, 0, 0)), (6, (18, 0, 0)), (200, (18, 0, 0)), (230, (0, 0, 0))],
                       'tail': [(0, (0, 0, 0)), (6, (20, 0, 0)), (200, (20, 0, 0)), (230, (0, 0, 0))],
                       'wingL': wing(1), 'wingR': wing(-1)})
    clip('alert', 24, {'neck': [(0, (0, 0, 0)), (8, (-20, 0, 0)), (24, (-20, 0, 0))], 'head': [(0, (0, 0, 0)), (8, (14, 0, 0)), (24, (14, 0, 0))],
                       'tail': [(0, (0, 0, 0)), (8, (-25, 0, 0)), (24, (-25, 0, 0))]})

# ---- decimate, texture, size, orientation, ground
n = C.decimate(me, TRIS or CFG['tris'])
C.drop_normal_maps()
for img in bpy.data.images:
    if img.size[0] > CFG['tex']:
        w, h = img.size; k = CFG['tex'] / max(w, h); img.scale(int(w * k), int(h * k))
    if img.size[0] > 0:
        C.fill_gutters(img)
        C.save_image(img, os.path.join(os.path.dirname(OUT), '_tex', f'{KIND}_{img.name}.jpg'))
for m in bpy.data.materials:
    m.blend_method = 'OPAQUE'
k = CFG['length'] / L
# the bird faces +X (source frame) -> heading of the axis in the XY plane; turn it to Blender -Y (glTF +Z)
yaw = math.atan2(axis[1], axis[0])
arm.location = Vector((0, 0, 0))
arm.rotation_euler = (0, 0, -math.pi / 2 - yaw)
arm.scale = (k, k, k)
# feet on the ground: put the root (foot) at the origin
arm.location = -(mathutils.Matrix.Rotation(-math.pi / 2 - yaw, 4, 'Z') @ Vector(foot)) * k
print('[scan] tris', n, 'scale', round(k, 5), 'bones', len(ad.bones))
C.export_glb(OUT, [arm, me])
