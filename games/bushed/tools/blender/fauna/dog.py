# The camp dog (BUSHED's Axehandle Hound, now a real dog): a scruffy German Shepherd mutt from "Police Dog" by
# Chenchanchong (Sketchfab, CC-BY 4.0), its police vest taken off. The Rigify rig (839 bones) is rebaked onto a
# 69-bone game skeleton; the source's clips (idle, walk, fast walk, run, sneak, bark, sleep) and poses (sitting,
# snarl, happy stand, alert stand, eyes closed) are kept, and the rest of the hound's repertoire is authored here on
# top of them: beg, catch, chew, shake, howl, dig, lunge, flinch, wiggle.
#   blender -b --python dog.py -- <downloads dir> <out dir>
import bpy, sys, os, math, re
sys.path.insert(0, os.path.dirname(__file__))
import common as C
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
DL, OUT = argv[0], argv[1]
UID = '414a3970c7674bc0bedbab32350f56b6'
WITHERS = 0.58

# (new, source DEF bone, parent); 'S' in a name is the side, resolved by where the bone really is
SPINE = [('root', 'root', None), ('hips', 'DEF-spine.004', 'root'), ('spine1', 'DEF-spine.005', 'hips'),
         ('spine2', 'DEF-spine.006', 'spine1'), ('chest', 'DEF-spine.007', 'spine2'), ('neck1', 'DEF-spine.008', 'chest'),
         ('neck2', 'DEF-spine.009', 'neck1'), ('neck3', 'DEF-spine.010', 'neck2'), ('head', 'DEF-spine.011', 'neck3'),
         ('jaw', 'DEF-jaw', 'head'), ('tongue1', 'DEF-tongue.002', 'jaw'), ('tongue2', 'DEF-tongue.001', 'tongue1'),
         ('tongue3', 'DEF-tongue', 'tongue2'),
         ('tail1', 'DEF-spine.003', 'hips'), ('tail2', 'DEF-spine.002', 'tail1'), ('tail3', 'DEF-spine.001', 'tail2'),
         ('tail4', 'DEF-spine', 'tail3')]
SIDED = [('earS', 'DEF-ear.S', 'head'), ('ear2S', 'DEF-ear.S.003', 'earS'), ('eyeS', 'DEF-eye.S', 'head'),
         ('lidTS0', 'DEF-lid.T.S', 'head'), ('lidTS1', 'DEF-lid.T.S.001', 'head'), ('lidTS2', 'DEF-lid.T.S.002', 'head'), ('lidTS3', 'DEF-lid.T.S.003', 'head'),
         ('lidBS0', 'DEF-lid.B.S', 'head'), ('lidBS1', 'DEF-lid.B.S.001', 'head'), ('lidBS2', 'DEF-lid.B.S.002', 'head'), ('lidBS3', 'DEF-lid.B.S.003', 'head'),
         ('thighS', 'DEF-thigh.S', 'hips'), ('thigh2S', 'DEF-thigh.S.001', 'thighS'), ('shinS', 'DEF-shin.S', 'thigh2S'),
         ('shin2S', 'DEF-shin.S.001', 'shinS'), ('footS', 'DEF-foot.S', 'shin2S'), ('foot2S', 'DEF-foot.S.001', 'footS'), ('toeS', 'DEF-toe.S', 'foot2S'),
         ('scapS', 'DEF-shoulder.S', 'chest'), ('uarmS', 'DEF-front_thigh.S', 'scapS'), ('uarm2S', 'DEF-front_thigh.S.001', 'uarmS'),
         ('farmS', 'DEF-front_shin.S', 'uarm2S'), ('farm2S', 'DEF-front_shin.S.001', 'farmS'), ('pawS', 'DEF-front_foot.S', 'farm2S'),
         ('paw2S', 'DEF-front_foot.S.001', 'pawS'), ('ftoeS', 'DEF-front_toe.S', 'paw2S')]

C.reset()
arm, meshes, fps = C.load(os.path.join(DL, UID, f'sketchfab_{UID}', 'scene.gltf'))
# the police vest comes off
for o in [o for o in meshes if any(s.material and 'armor' in s.material.name.lower() for s in o.material_slots)]:
    meshes.remove(o); bpy.data.objects.remove(o, do_unlink=True)
body_src = next(o for o in meshes if any(s.material and s.material.name == 'body' for s in o.material_slots))

# the rest pose is the model's own bind pose (the clips' first frames have the tongue stretched up through the head)
ref = (None, 0)
C._rest_pose(arm); C.set_frame(0)
W = lambda name: (arm.matrix_world @ arm.pose.bones[C.find_bone(arm, name)].matrix).translation


# ---- size: withers 0.58 m (top of the back over the chest bone, body mesh only), ground at 0, centred on the trunk;
# measured standing in the idle clip (the bind pose's paws are not on one level)
arm.animation_data.action = C.action('Dog  idle'); C.set_frame(1)
dg = bpy.context.evaluated_depsgraph_get()
me = body_src.evaluated_get(dg).to_mesh()
P = np.array([tuple(body_src.matrix_world @ v.co) for v in me.vertices]); body_src.evaluated_get(dg).to_mesh_clear()
chest, hips = W('DEF-spine.007'), W('DEF-spine.004')
zmin = P[:, 2].min()
band = P[np.abs(P[:, 1] - chest.y) < 0.05 * np.ptp(P[:, 1])]
s = WITHERS / (band[:, 2].max() - zmin)
mid = (chest + hips) / 2
T = Matrix.Scale(s, 4) @ Matrix.Translation((-mid.x, -mid.y, -zmin))
# the trunk runs along world y in the source? (it should run along -y: the head forward)
fwd = (W('DEF-spine.011') - hips).normalized()
print('scale', s, 'forward', tuple(round(x, 2) for x in fwd))
# turn the dog to face -y (glTF +z)
yaw = math.atan2(-fwd.x, -fwd.y)
T = Matrix.Rotation(yaw, 4, 'Z') @ T
C._rest_pose(arm); C.set_frame(0)
L_is_left = (T @ W('DEF-ear.L')).x > 0
side = {'L': 'L' if L_is_left else 'R', 'R': 'R' if L_is_left else 'L'}
rows = list(SPINE)
for s in ('L', 'R'):
    for n, src, par in SIDED:
        rows.append((n.replace('S', side[s]), src.replace('.S', '.' + s), par.replace('S', side[s]) if par.endswith('S') else par))
keep = [(n, C.find_bone(arm, src)) for n, src, _ in rows]
parents = {n: p for n, _, p in rows}

# ---- weights of the bones that go: the face onto the head or jaw, toes onto the paws, by name then by distance
kept_src = {sb: n for n, sb in keep}
restpos = {b.name: (arm.matrix_world @ b.head_local) for b in arm.data.bones}
wmap = {}
for b in arm.data.bones:
    if b.name in kept_src:
        continue
    nm = b.name.rsplit('_', 1)[0]
    if re.match(r'DEF-(lip\.B|chin|teeth\.B|jaw\.)', nm):
        wmap[b.name] = 'jaw'; continue
    if re.match(r'DEF-tongue', nm):
        pass
    elif re.match(r'DEF-(forehead|temple|brow|cheek|nose|lip\.T|teeth\.T)', nm):
        wmap[b.name] = 'head'; continue
    elif re.match(r'DEF-pelvis', nm):
        wmap[b.name] = 'hips'; continue
    elif re.match(r'DEF-f_', nm):
        wmap[b.name] = ('ftoe' + side[nm[-1]]); continue
    elif re.match(r'DEF-r_', nm):
        wmap[b.name] = ('toe' + side[nm[-1]]); continue
    # nearest kept bone
    p = restpos[b.name]
    best = min(keep, key=lambda kv: (restpos[kv[1]] - p).length)
    wmap[b.name] = best[0]

# ---- clips from the source (game name, source action, loop, pose)
SRCCLIPS = [('idle', 'Dog  idle', 1, 0), ('walk', 'Dog Walk', 1, 0), ('trot', 'Dog Fast walk', 1, 0), ('run', 'Dog run', 1, 0),
            ('stalk', 'Dog Sneaking', 1, 0), ('bark', 'Dog Bark', 0, 0), ('sleep', 'Dog sleep', 1, 0),
            ('sit', 'happy dog pos', 1, 1), ('snarl', 'angry dog pos', 1, 1), ('happy', 'Happy dog  stand', 1, 1),
            ('alert', 'hard stand dog pos', 1, 1), ('blink', 'FP dog close eye', 1, 1)]
clips = []
for n, a, loop, pose in SRCCLIPS:
    c = dict(name=n, action=C.action(a), loop=bool(loop))
    if pose:
        c['pose'] = True; c['check'] = False
    clips.append(c)
ao, outs, acts = C.rebake(arm, meshes, keep, ref, clips, T, src_fps=fps, name='dog', parents=parents, wmap=wmap, anchor='hips',
                           scaled={n for n, _ in keep if n.startswith('lid') or n == 'tongue3'})
A = {a.name: a for a in acts}
src_names = [o['src'] for o in outs]
body = next(o for o in outs if o['src'] == body_src.name)
hair = next(o for o in outs if o is not body)

# ---- authored clips
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
TAU = math.tau
sin = math.sin
def ease(x):
    x = min(max(x, 0), 1); return x * x * (3 - 2 * x)
def env(t, a, b, c, d):
    return 0 if t < a else ease((t - a) / (b - a)) if t < b else 1 if t < c else 1 - ease((t - c) / (d - c)) if t < d else 0
idle0 = C.pose_of(ao, A['idle'], 0)
sit = C.pose_of(ao, A['sit'], 0)
snarl = C.pose_of(ao, A['snarl'], 0)
happy = C.pose_of(ao, A['happy'], 0)
idle_at = lambda t: C.pose_of(ao, A['idle'], (t * C.FPS) % (len(A['idle'].fcurves[0].keyframe_points) - 1))
const = lambda P: (lambda t: P)
side_bones = lambda base: [base + 'L', base + 'R']
JAW = X  # +x rotation opens the jaw (its tip goes down)


def jaw_op(open_):
    return [('rot', 'jaw', X, open_)]


acts.append(C.author(ao, 'beg', 1.6, const(sit), lambda t: [
    ('rot', 'spine1', X, -0.32), ('rot', 'neck1', X, -0.1), ('rot', 'head', X, -0.12),
    ('rot', 'head', Y, 0.14 * sin(TAU * t / 1.6)),
    ('rot', 'uarmL', X, -1.0 - 0.18 * sin(TAU * t / 0.8)), ('rot', 'farmL', X, 1.15), ('rot', 'pawL', X, 0.5),
    ('rot', 'uarmR', X, -1.0 - 0.18 * sin(TAU * t / 0.8 + 2.4)), ('rot', 'farmR', X, 1.15), ('rot', 'pawR', X, 0.5),
] + jaw_op(0.12 + 0.05 * sin(TAU * t * 2.6))))
acts.append(C.author(ao, 'chew', 1.2, const(sit), lambda t: [
    ('rot', 'neck1', X, 0.38), ('rot', 'head', X, 0.3), ('rot', 'head', Z, 0.13 * sin(TAU * t / 1.2)),
] + jaw_op(0.06 + 0.16 * (0.5 + 0.5 * sin(TAU * t * 2.5)))))
acts.append(C.author(ao, 'catch', 1.1, lambda t: C.blend_pose(idle0, sit, ease((t - 0.35) / 0.6)), lambda t: [
    ('rot', 'neck1', X, -0.3 * env(t, 0, 0.12, 0.2, 0.4) + 0.38 * ease((t - 0.4) / 0.5)),
    ('rot', 'head', X, -0.25 * env(t, 0, 0.12, 0.2, 0.4) + 0.3 * ease((t - 0.4) / 0.5)),
] + jaw_op(0.38 * env(t, 0.02, 0.12, 0.16, 0.24) + 0.1 * ease((t - 0.5) / 0.5)), loop=False))
def shake_ops(t):
    e = env(t, 0, 0.15, 1.15, 1.4); w = lambda ph: e * sin(TAU * 4.6 * t - ph)
    return [('move', 'root', (0, 0, -0.015 * e)), ('rot', 'hips', Y, 0.13 * w(1.6)), ('rot', 'spine1', Y, 0.12 * w(1.2)),
            ('rot', 'spine2', Y, 0.14 * w(0.9)), ('rot', 'chest', Y, 0.2 * w(0.6)), ('rot', 'neck1', Y, 0.28 * w(0.35)),
            ('rot', 'head', Y, 0.38 * w(0.0)), ('rot', 'earL', X, -0.5 * abs(w(-0.3))), ('rot', 'earR', X, -0.5 * abs(w(-0.3)))] + jaw_op(0.05 * e)
acts.append(C.author(ao, 'shake', 1.4, idle_at, shake_ops, loop=False))
acts.append(C.author(ao, 'howl', 3.0, const(sit), lambda t: [
    ('rot', 'neck1', X, -0.45 * ease(t / 0.6)), ('rot', 'neck2', X, -0.25 * ease(t / 0.6)), ('rot', 'head', X, -0.35 * ease(t / 0.6)),
] + jaw_op((0.22 + 0.05 * sin(TAU * t * 0.7)) * ease((t - 0.2) / 0.5))))
def dig_ops(t):
    ph = TAU * t / 0.5
    return [('rot', 'root', X, 0.14), ('move', 'root', (0, 0, -0.03)), ('rot', 'neck1', X, 0.42), ('rot', 'head', X, 0.32),
            ('rot', 'uarmL', X, -0.55 * sin(ph) - 0.15), ('rot', 'farmL', X, 0.5 * max(0, sin(ph))),
            ('rot', 'uarmR', X, -0.55 * sin(ph + math.pi) - 0.15), ('rot', 'farmR', X, 0.5 * max(0, sin(ph + math.pi)))]
acts.append(C.author(ao, 'dig', 1.0, const(idle0), dig_ops))
acts.append(C.author(ao, 'lunge', 1.2, const(snarl), lambda t: [
    ('move', 'root', (0, -0.32 * env(t, 0.05, 0.3, 0.45, 1.1), 0.04 * env(t, 0.05, 0.25, 0.3, 0.5))),
    ('rot', 'chest', X, -0.18 * env(t, 0.05, 0.3, 0.4, 0.9)), ('rot', 'head', X, -0.2 * env(t, 0.1, 0.3, 0.33, 0.6)),
] + jaw_op(0.42 * env(t, 0.12, 0.28, 0.3, 0.36) + 0.08 * env(t, 0.4, 0.6, 0.9, 1.2)), loop=False))
acts.append(C.author(ao, 'flinch', 0.8, const(idle0), lambda t: [
    ('move', 'root', (0, 0.14 * env(t, 0, 0.12, 0.4, 0.8), -0.06 * env(t, 0, 0.12, 0.4, 0.8))),
    ('rot', 'neck1', X, 0.3 * env(t, 0, 0.12, 0.4, 0.8)), ('rot', 'earL', X, 0.5 * env(t, 0, 0.1, 0.5, 0.8)), ('rot', 'earR', X, 0.5 * env(t, 0, 0.1, 0.5, 0.8)),
    ('rot', 'tail1', X, 0.5 * env(t, 0, 0.12, 0.5, 0.8)),
], loop=False))
acts.append(C.author(ao, 'wiggle', 1.0, const(happy), lambda t: [
    ('rot', 'hips', Z, 0.16 * sin(TAU * 2 * t)), ('rot', 'chest', Z, -0.1 * sin(TAU * 2 * t)), ('rot', 'head', Y, 0.12 * sin(TAU * t)),
    ('move', 'root', (0, 0, 0.012 * abs(sin(TAU * 2 * t)))),
] + jaw_op(0.12 + 0.04 * sin(TAU * t * 3))))
acts.append(C.author(ao, 'stand', 0.1, const(idle0), lambda t: []))

# ---- eyes: dense in the decimation, dark glossy beads with eye shine
eye_c = {b: ao.data.bones[b].head_local.copy() for b in ('eyeL', 'eyeR')}
grp = body.vertex_groups.new(name='_protect')
near = [v.index for v in body.data.vertices if min((v.co - c).length for c in eye_c.values()) < 0.03 or (v.co - ao.data.bones['jaw'].head_local).length < 0.035]
grp.add(near, 1.0, 'REPLACE')
print('body tris before', len(body.data.polygons))
C.decimate(body, 0.2, protect='_protect')
body.data.calc_loop_triangles(); print('body tris after', len(body.data.loop_triangles))
gi = {body.vertex_groups[n].index for n in ('eyeL', 'eyeR') if n in body.vertex_groups}
def eyew(vi):
    return sum(g.weight for g in body.data.vertices[vi].groups if g.group in gi)
eye_faces = [p.index for p in body.data.polygons if all(eyew(v) > 0.5 for v in p.vertices)]
print('eye faces', len(eye_faces))


def post(col, sd, nrm):
    H, Wd = col.shape[:2]
    m = C.raster_faces(body, eye_faces, Wd, H)
    sd[m, 0] = 1.0; sd[m, 1] = 0.1
    # a dark brown bead with the painted catchlight kept
    c = col[m, :3]; lum = c.max(axis=1, keepdims=True)
    col[m, :3] = np.where(lum > 0.7, c, c * 0.6 + np.array([0.01, 0.006, 0.004]))
    print('eye px', int(m.sum()))


layout = {'body': (0, 0, 1024, 1024), 'body_hair': (1024, 0, 1024, 1024)}
mat = C.atlas([body, hair], layout, (2048, 1024), os.path.join(OUT, '_tex'), 'dog', rough={'body': 0.82, 'body_hair': 0.9}, post=post)
dog = C.join([body, hair], 'dog_body')
tris = C.finish_mesh(dog, mat, 1.0)
C.limit_weights(dog)
C.drop_source([ao, dog])
lo, hi = C.bbox([dog])
dims = {'withers': WITHERS, 'length': hi.y - lo.y, 'height': hi.z - lo.z, 'width': hi.x - lo.x}
jw = ao.data.bones['jaw']
meta = {'tris': tris, 'bones': len(ao.data.bones), 'dims': dims, 'clips': [a.name for a in acts],
        'loops': {a.name: bool(a.get('loop', True)) for a in acts}}
print('dog tris', tris, 'dims', dims)
C.export(ao, dog, os.path.join(OUT, 'dog', 'dog.glb'), acts)
C.write_meta(os.path.join(OUT, 'dog', 'dog.json'), meta)
