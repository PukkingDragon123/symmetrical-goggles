# Print what a downloaded model holds: meshes (triangles), materials and their textures, the armature's bones and
# the animation clips (frame ranges), and the overall size. Read-only.
#   blender -b --python inspect_model.py -- path/to/scene.gltf [--bones]
import bpy, sys, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
path = argv[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
tris = 0
lo = mathutils.Vector((1e9,) * 3); hi = -lo
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        n = len(o.data.loop_triangles); tris += n
        for v in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(v)
            lo = mathutils.Vector(map(min, lo, w)); hi = mathutils.Vector(map(max, hi, w))
        mods = [m.type for m in o.modifiers]
        print(f'MESH {o.name} tris={n} verts={len(o.data.vertices)} mats={[m.name for m in o.data.materials if m]} parent={o.parent.name if o.parent else None} mods={mods} vgroups={len(o.vertex_groups)}')
print('TOTAL tris', tris, 'bbox', tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))
for m in bpy.data.materials:
    texs = []
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                link = [l.to_socket.name for l in n.outputs[0].links]
                texs.append((n.image.name, tuple(n.image.size), link))
    print('MAT', m.name, m.blend_method, texs)
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        print('ARMATURE', o.name, 'bones', len(o.data.bones), 'scale', tuple(round(s, 4) for s in o.matrix_world.to_scale()))
        if '--bones' in argv:
            for b in o.data.bones:
                h = o.matrix_world @ b.head_local
                print('  BONE', b.name, 'parent=', b.parent.name if b.parent else None, 'head=', tuple(round(x, 3) for x in h))
for a in bpy.data.actions:
    print('ACTION', a.name, 'frames', tuple(a.frame_range), 'fcurves', len(a.fcurves))
print('FPS', bpy.context.scene.render.fps)
