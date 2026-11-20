# Quick look at a model in Blender (Cycles, CPU): side, 3/4 front, front and a head close-up, at a frame of a clip.
#   blender -b --python render_check.py -- model.glb out_prefix [--clip NAME] [--t 0.3] [--size 360] [--head x,y,z]
# Writes out_prefix_{side,q34,front,head}.png; tools/blender/fauna/sheet.py lays them out on one sheet.
import bpy, sys, math, mathutils
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
opt = {argv[i][2:]: argv[i + 1] for i in range(2, len(argv) - 1, 2) if argv[i].startswith('--')}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
sc = bpy.context.scene
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if arm and arm.animation_data:
    clip = opt.get('clip')
    acts = [a for a in bpy.data.actions if not clip or clip.lower() in a.name.lower()]
    if acts:
        a = acts[0]; arm.animation_data.action = a
        f0, f1 = a.frame_range; f = f0 + (f1 - f0) * float(opt.get('t', 0.0))
        sc.frame_set(int(f), subframe=f - int(f))
        print('CLIP', a.name, f)
dg = bpy.context.evaluated_depsgraph_get()
lo = Vector((1e9,) * 3); hi = -lo
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    me = o.evaluated_get(dg).to_mesh()
    for v in me.vertices:
        w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    o.evaluated_get(dg).to_mesh_clear()
print('BBOX', tuple(round(x, 3) for x in lo), tuple(round(x, 3) for x in hi))
c = (lo + hi) / 2; ext = max(hi - lo)
# ground, light, world
bpy.ops.mesh.primitive_plane_add(size=ext * 8, location=(c.x, c.y, lo.z))
g = bpy.context.object; gm = bpy.data.materials.new('ground'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.32, 0.3, 0.26, 1); g.data.materials.append(gm)
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
so.rotation_euler = (math.radians(50), 0, math.radians(35))
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.7, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
sc.render.engine = 'CYCLES'; sc.cycles.samples = int(opt.get('samples', 24)); sc.cycles.device = 'CPU'
sz = int(opt.get('size', 360)); sc.render.resolution_x = sz; sc.render.resolution_y = int(sz * 0.75)
sc.view_settings.view_transform = 'Standard'
cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
cam.lens = 50
def shoot(name, pos, target, lens=50):
    cam.lens = lens
    co.location = pos
    d = (Vector(target) - Vector(pos)); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{name}.png'; bpy.ops.render.render(write_still=True)
# the model faces -Y in Blender (+Z in glTF)
R = ext * 1.9
views = opt.get('views', 'side,q34,front,head').split(',')
if 'hide' in opt:
    for o in bpy.data.objects:
        if o.type == 'MESH' and any(k in o.name for k in opt['hide'].split(',')): o.hide_render = True
if 'side' in views: shoot('side', (c.x + R, c.y, c.z + ext * 0.1), c)
if 'q34' in views: shoot('q34', (c.x + R * 0.7, c.y - R * 0.75, c.z + ext * 0.25), c)
if 'front' in views: shoot('front', (c.x, c.y - R, c.z + ext * 0.05), c)
if 'head' not in views: raise SystemExit
if 'head' in opt: hp = Vector(map(float, opt['head'].split(',')))
else: hp = Vector((c.x, lo.y + (hi.y - lo.y) * 0.08, lo.z + (hi.z - lo.z) * 0.85))
shoot('head', (hp.x + ext * 0.35, hp.y - ext * 0.45, hp.z + ext * 0.08), hp, lens=60)
