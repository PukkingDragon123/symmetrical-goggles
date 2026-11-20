# Insect sprite views: an orthographic top (or side) render of a downloaded insect model on a transparent background,
# flat-lit (emission from its own base colour, so the sprite carries the real texture, not Blender's lighting), the
# body axis turned to point up the image. bugs_atlas.py packs the views into the game's insect atlas.
# blender -b --python bug_views.py -- <scene.gltf> <out.png> <size px> <view: top|side|front> <spin deg> [materials to keep]
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, size, view, spin = argv[0], argv[1], int(argv[2]), argv[3], float(argv[4])
keep_mats = set(argv[5].split(',')) if len(argv) > 5 and argv[5] else None  # only meshes with these materials (drops a model's display base)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type == 'MESH' and (o.name.startswith('Icosphere') or (keep_mats and not any(m and m.name in keep_mats for m in o.data.materials))):
        bpy.data.objects.remove(o)
# flat: every material -> emission of its base colour (alpha kept)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out_n = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not bsdf or not out_n: continue
    em = nt.nodes.new('ShaderNodeEmission'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader')
    bc = bsdf.inputs['Base Color']
    if bc.links: nt.links.new(bc.links[0].from_socket, em.inputs['Color'])
    else: em.inputs['Color'].default_value = bc.default_value
    al = bsdf.inputs['Alpha']
    if al.links: nt.links.new(al.links[0].from_socket, mix.inputs['Fac'])
    else: mix.inputs['Fac'].default_value = al.default_value
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out_n.inputs['Surface'])
    m.blend_method = 'BLEND'
dg = bpy.context.evaluated_depsgraph_get()
vs = []
for o in sc.objects:
    if o.type == 'MESH':
        e = o.evaluated_get(dg); me = e.to_mesh(); vs += [e.matrix_world @ v.co for v in me.vertices]; e.to_mesh_clear()
lo = mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
hi = mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
c = (lo + hi) / 2; r = (hi - lo).length / 2
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.clip_start = r * 0.01; cam.data.clip_end = r * 10
d = {'top': (0, 0, 1), 'side': (1, 0, 0), 'front': (0, -1, 0), 'bottom': (0, 0, -1)}[view]
cam.location = c + mathutils.Vector(d) * r * 3
upv = (0, 1, 0) if view in ('top', 'bottom') else (0, 0, 1)
q = (c - cam.location).to_track_quat('-Z', 'Y' if view in ('top', 'bottom') else 'Z')
cam.rotation_euler = (q @ mathutils.Quaternion((0, 0, 1), math.radians(spin))).to_euler()
ext = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
cam.data.ortho_scale = ext * 1.04
sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.use_denoising = False
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('[bug_views]', out, 'extent', [round(x, 4) for x in (hi - lo)])
