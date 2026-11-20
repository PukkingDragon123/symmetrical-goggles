# The common loon: "Common Loon" and "Common Loon - in Flight" by OSU.Multimedia (Oregon State University,
# Sketchfab, CC-BY 4.0). Two small rigged models sharing one 1024 texture: the swimming bird (a head-turn clip) and the
# flying bird (a wing-beat clip). This sizes each to a real loon (80 cm bill to tail), turns it to face +Z and exports
# them as loon.glb (clip 'idle') and loon_fly.glb (clip 'fly').
# blender -b --python loon.py -- <loon scene.gltf> <loon-in-flight scene.gltf> <out dir>
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SWIM, FLY, OUTD = argv[0], argv[1], argv[2]
LENGTH = 0.80


def build(src, clip, out, flying):
    C.reset()
    C.import_gltf(src)
    sc = bpy.context.scene
    acts = list(bpy.data.actions)
    for a in acts:
        a.name = clip
    arm = C.armature()
    arm.animation_data_create(); arm.animation_data.action = acts[0] if acts else None
    sc.frame_set(0); bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    vs = []
    for o in sc.objects:
        if o.type == 'MESH':
            e = o.evaluated_get(dg); m = e.to_mesh()
            vs += [e.matrix_world @ v.co for v in m.vertices]
            e.to_mesh_clear()
    arm.animation_data.action = None
    lo = Vector(map(min, *vs)) if False else Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    c = (lo + hi) / 2
    # the long horizontal axis; the bill end is the one whose tip is highest relative to the body (the head is held up),
    # for the flier the narrow end (the tail fans wider than the bill)
    ax = 0 if (hi.x - lo.x) > (hi.y - lo.y) else 1
    if flying:
        # wings span one horizontal axis; the body runs along the other
        ax = 1 - ax
    L = hi[ax] - lo[ax]
    ends = []
    for sgn in (1, -1):
        tip = [v for v in vs if (v[ax] - c[ax]) * sgn > L * 0.42]
        ends.append((sgn, max(v.z for v in tip) if tip else -1e9, len(tip)))
    sgn = max(ends, key=lambda e: e[1])[0] if not flying else min(ends, key=lambda e: e[2])[0]
    heading = math.atan2(sgn if ax == 1 else 0, sgn if ax == 0 else 0)
    k = LENGTH / L
    root = bpy.data.objects.new('Loon', None); sc.collection.objects.link(root)
    for o in list(sc.objects):
        if o.parent is None and o != root:
            o.parent = root
    root.rotation_euler = (0, 0, -math.pi / 2 - heading)
    root.scale = (k, k, k)
    # swimming: the origin at the waterline (a loon floats low: the water a third of the way up its body)
    zw = lo.z + (hi.z - lo.z) * (0.30 if not flying else 0.5)
    rot = root.rotation_euler.to_matrix()
    root.location = -(rot @ Vector((c.x, c.y, zw))) * k
    print('[loon]', clip, 'length', round(L, 3), 'scale', round(k, 4), 'tris', C.tri_count(list(sc.objects)))
    img = C.base_color_image()
    if img:
        C.fill_gutters(img.image)
        C.save_image(img.image, os.path.join(OUTD, '_tex', f'loon_{clip}.png'), 'PNG')
    objs = [o for o in sc.objects]
    C.export_glb(out, objs)


build(SWIM, 'idle', os.path.join(OUTD, 'loon.glb'), False)
build(FLY, 'fly', os.path.join(OUTD, 'loon_fly.glb'), True)
