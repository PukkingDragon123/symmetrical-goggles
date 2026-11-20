# The small-bird rig: "Robin_ Bird" by Assets_Animated (Sketchfab, CC-BY 4.0), a fully feathered, rigged and
# animated songbird, made into one lean game rig that every small bird in BUSHED wears (chickadee, Canada jay, the
# flying woodpecker and the bursting grouse each get their own painted coat and a size: see paint_birds.py).
#   - 487 bones -> 83 (body, neck, head, beak, the tail fan, each flight feather, legs and toes); the dropped bones'
#     weights merge into their nearest kept ancestor, the clips are re-baked onto the lean rig
#   - clips: idle, idle2, call, call2, eat, eat2, walk, fly (flap loop) and glide (wings held out)
#   - 78k triangles -> ~4k, the 4096 texture -> 1024, no normal map; faces +Z, metres
#   - also writes paint maps (texel -> rest-pose position and body part) for paint_birds.py
# blender -b --python songbird.py -- <robin scene.gltf> <out.glb> <paint dir>
import bpy, sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import common as C

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT, PAINT = argv[0], argv[1], argv[2]
TRIS = int(argv[3]) if len(argv) > 3 else 4000
TEX = argv[4] if len(argv) > 4 else None  # the painted coat to embed (paint_birds.py); else the source texture

C.reset()
C.import_gltf(SRC)
old = C.armature()

KEEP = {'Root', 'Center', 'Pelvis', 'Spine_1', 'Spine_2', 'Neck_1', 'Neck_2', 'Head', 'Beak', 'Tail_1', 'Tail_2'}
for s in 'LR':
    KEEP |= {f'{s}_TailFeather_{i}' for i in range(1, 7)}
    KEEP |= {f'{s}_{n}' for n in ('Femur', 'Tibia', 'Tarsus_1', 'Tarsus_2', 'Humerus', 'Ulna', 'Metacarpus', 'BasalPhalanx')}
    KEEP |= {f'{s}_Digit_{i}_1' for i in range(1, 5)}
    KEEP |= {f'{s}_Pimary_{i}_1' for i in range(1, 10)}
    KEEP |= {f'{s}_Secondary_{i}_1' for i in range(1, 7)}
    KEEP |= {f'{s}_Tertial_{i}_1' for i in range(1, 4)}

CLIPS = {
    'idle': ('Bird_Idle_', None, None), 'idle2': ('Bird_Idle2', None, None),
    'call': ('Bird_Call_', None, None), 'call2': ('Bird_Call2', None, None),
    'eat': ('Bird_Eat_', None, None), 'eat2': ('Bird_Eat2', None, None),
    'walk': ('Bird_Walk_', None, None), 'fly': ('Bird_Fly_', None, None),
}


rig = C.lean_rig(old, KEEP, CLIPS, name='SongbirdRig', extra=None)
# glide: needs the baked fly with no constraints
fly = bpy.data.actions.get('fly')
rig.animation_data_create()
best, bf = -1, 0
rig.animation_data.action = fly
for f in range(int(fly.frame_range[0]), int(fly.frame_range[1]) + 1):
    bpy.context.scene.frame_set(f)
    tips = [rig.matrix_world @ pb.tail for pb in rig.pose.bones if C.base(pb.name) in ('L_Pimary_9_1', 'R_Pimary_9_1')]
    span = abs(tips[0].x - tips[1].x) - abs(tips[0].z - tips[1].z) * 0.6
    if span > best:
        best, bf = span, f
print('[songbird] glide pose from fly frame', bf, 'span', round(best, 4))
C.pose_clip(rig, 'glide', fly, bf)
rig.animation_data.action = None
bpy.context.scene.frame_set(0)

mesh = C.skinned_meshes(rig)[0]
mesh.name = 'Songbird'
# one UV layer only (the source carries three; the coat is painted on the active one, and it must be TEXCOORD_0)
uvs = mesh.data.uv_layers
keep_uv = uvs.active.name
for l in [l.name for l in uvs if l.name != keep_uv]:
    uvs.remove(uvs[l])
uvs.active = uvs[keep_uv]; uvs[keep_uv].active_render = True
print('[songbird] uv layer', keep_uv)
t = C.decimate(mesh, TRIS)
C.limit_weights(mesh)
print('[songbird] tris', t, 'bones', len(rig.data.bones))

# texture: 1024, alpha-clipped feathers, no normal map
C.drop_normal_maps()
os.makedirs(PAINT, exist_ok=True)
img = C.base_color_image().image
img.scale(1024, 1024)
img.filepath_raw = os.path.join(PAINT, 'orig.png'); img.file_format = 'PNG'; img.save()
if TEX:
    C.set_base_color(TEX)
for m in bpy.data.materials:
    m.blend_method = 'CLIP'
    m.alpha_threshold = 0.4

# ---- paint maps: rasterise the rest-pose mesh into UV space (position, body part)
PART = {'Head': 1, 'Beak': 8, 'Neck_1': 2, 'Neck_2': 2, 'Spine_1': 3, 'Spine_2': 3, 'Pelvis': 3, 'Center': 3, 'Root': 3,
        'Tail_1': 4, 'Tail_2': 4}
def part_of(b):
    if b in PART: return PART[b]
    s = b[2:]
    if s.startswith('TailFeather'): return 4
    if s.startswith('Pimary'): return 9
    if s.startswith('Secondary'): return 10
    if s.startswith('Tertial'): return 11
    if s in ('Humerus', 'Ulna', 'Metacarpus', 'BasalPhalanx'): return 5
    if s in ('Femur', 'Tibia'): return 6
    return 7
me = mesh.data
gname = {g.index: C.base(g.name) for g in mesh.vertex_groups}
vpart = np.zeros(len(me.vertices), np.int32)
for v in me.vertices:
    best = max(v.groups, key=lambda g: g.weight, default=None)
    vpart[v.index] = part_of(gname[best.group]) if best else 3
co = np.array([mesh.matrix_world @ v.co for v in me.vertices], np.float32)
uvl = me.uv_layers.active.data
N = 1024
pos = np.zeros((N, N, 3), np.float32); part = np.zeros((N, N), np.uint8)
me.calc_loop_triangles()
for lt in me.loop_triangles:
    uv = np.array([uvl[l].uv for l in lt.loops], np.float32) * N
    uv[:, 1] = N - uv[:, 1]
    P = co[list(lt.vertices)]
    pa = np.bincount(vpart[list(lt.vertices)]).argmax()
    x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, N - 1), min(y1, N - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-9: continue
    w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
    w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
    w2 = 1 - w0 - w1
    inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
    if not inside.any(): continue
    p = w0[..., None] * P[0] + w1[..., None] * P[1] + w2[..., None] * P[2]
    sub = pos[y0:y1 + 1, x0:x1 + 1]; sp = part[y0:y1 + 1, x0:x1 + 1]
    sub[inside] = p[inside]; sp[inside] = pa
np.save(os.path.join(PAINT, 'pos.npy'), pos); np.save(os.path.join(PAINT, 'part.npy'), part)
marks = {}
for pb in rig.data.bones:
    marks[C.base(pb.name)] = [list(rig.matrix_world @ pb.head_local), list(rig.matrix_world @ pb.tail_local)]
lo = co.min(0).tolist(); hi = co.max(0).tolist()
json.dump({'bones': marks, 'lo': lo, 'hi': hi, 'tris': t}, open(os.path.join(PAINT, 'marks.json'), 'w'))
print('[songbird] bbox', [round(x, 4) for x in lo], [round(x, 4) for x in hi])

C.face_plus_z_from(rig, bpy.data.actions['idle'], 'Head', 'Pelvis')
C.export_glb(OUT, [rig, mesh], image_format='WEBP')
