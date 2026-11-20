# What the four camp-story cryptids (sidehill gouger, hoop snake, splinter cat, goofus bird) add on top of common.py:
# picking the bones to keep, static copies of posed meshes (kitbash parts), small dark bead eyes, a leg-shortening
# edit of the rest pose (the gouger), and a straightening pose (the hoop snake). Blender 4.2, run headless:
#   blender -b --python tools/blender/cryptids4/gouger.py -- <downloads dir>
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(GAME, 'public', 'assets', 'models', 'creatures', 'cryptids')


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return a


def source(dl, uid):
    """the scene.gltf of a Sketchfab download made with `python -m lowpix sketchfab fetch <uid> -o <dl>/<uid[:8]>`"""
    d = os.path.join(dl, uid[:8])
    for base, _, files in os.walk(d):
        for f in files:
            if f in ('scene.gltf', 'scene.glb'):
                return os.path.join(base, f)
    raise FileNotFoundError(f'{uid}: fetch it first: python -m lowpix sketchfab fetch {uid} -o {d}')


def clean(name):
    """'RigLBLeg1_03' -> 'LBLeg1'; 'spine_12_84' -> 'spine_12'; 'Bip001-L-Thigh_05' -> 'L-Thigh'"""
    n = name
    parts = n.rsplit('_', 1)
    if len(parts) == 2 and parts[1].isdigit():
        n = parts[0]
    for p in ('Rig', 'Bip001-', 'CROW_ ', 'CROW_'):
        if n.startswith(p) and len(n) > len(p):
            n = n[len(p):]
    return n.replace(' ', '_').replace('.', '_')


def auto_keep(arm, meshes, drop=(), rename=clean):
    """every bone that deforms something, plus its ancestors, parent-first; (new name, source name) pairs"""
    used = set()
    for o in meshes:
        if not o.vertex_groups:
            continue
        names = {g.index: g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            for g in v.groups:
                if g.weight > 0.001 and names[g.group] in arm.data.bones:
                    used.add(names[g.group])
    need = set()
    for n in used:
        b = arm.data.bones[n]
        while b:
            need.add(b.name); b = b.parent
    out, seen = [], set()

    def walk(b):
        if b.name in need and not any(d in b.name for d in drop):
            nn = rename(b.name)
            while nn in seen:
                nn += '_'
            seen.add(nn); out.append((nn, b.name))
        for c in b.children:
            walk(c)
    for b in arm.data.bones:
        if b.parent is None:
            walk(b)
    # the glTF importer's synthetic root joint carries nothing
    return [k for k in out if not k[1].endswith('rootJoint')] or out


def islands(o):
    """connected parts of a mesh as it is displayed: [(world centre, radius, vertex count)]"""
    dg = bpy.context.evaluated_depsgraph_get()
    e = o.evaluated_get(dg); m = e.to_mesh()
    bm = bmesh.new(); bm.from_mesh(m); bm.verts.ensure_lookup_table()
    seen, out = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop(); comp.append(e.matrix_world @ x.co)
            for ed in x.link_edges:
                y = ed.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index); stack.append(y)
        c = sum(comp, Vector()) / len(comp)
        out.append((c, max((p - c).length for p in comp), len(comp)))
    bm.free(); e.to_mesh_clear()
    return out


def static_copy(o, name):
    """a new unparented, unskinned mesh object with o's displayed (posed, world) shape and its materials and UVs"""
    dg = bpy.context.evaluated_depsgraph_get()
    e = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(e)
    me.transform(e.matrix_world)
    no = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(no)
    return no


def bead_material():
    m = bpy.data.materials.get('BeadEye') or bpy.data.materials.new('BeadEye')
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.018, 0.012, 0.009, 1)
    b.inputs['Roughness'].default_value = 0.12
    return m


def bead_eyes(pairs, name='beads', seg=10, rings=7):
    """small dark glossy bead eyes: pairs = [(centre Vector, radius)] in world space; one mesh object"""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')
    for c, r in pairs:
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, matrix=Matrix.Translation(c), calc_uvs=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(bead_material())
    return o


def bead_from_socket(c, r_src, r_new, mid, push=0.0):
    """a bead of radius r_new sitting where an eye sphere (centre c, radius r_src) shows: its outer surface where the
    old eye's was (pushed out of the head by `push` m), on the line from the eyes' midpoint through the old centre"""
    n = (c - mid); n.z = 0
    n = n.normalized() if n.length > 1e-6 else Vector((1, 0, 0))
    return c + n * (r_src - r_new * 0.85 + push)


def shorten_legs(ao, mesh, chains, k):
    """rest-pose edit: each chain (bone names, hip/shoulder first, the hoof/ankle bone last) is shortened to k of its
    length above the ankle (the hoof keeps its shape, it just moves up); the skinned mesh follows by its weights"""
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    eb = ao.data.edit_bones
    maps = []
    for ch in chains:
        top = eb[ch[0]].head.z
        ank = eb[ch[-1]].head.z
        lift = (1 - k) * (top - ank)
        maps.append((set(ch), top, ank, lift))
        f = lambda z, top=top, ank=ank, lift=lift: z if z >= top else (top - (top - z) * k if z >= ank else z + lift)
        for b in ch:
            # move each joint, never turn a bone (the clips are rotations relative to the rest frames)
            e = eb[b]
            dz = f(e.head.z) - e.head.z
            e.head.z += dz; e.tail.z += dz
        # children of the ankle (toes) move with it
        for e in eb:
            if e.parent and e.parent.name == ch[-1] and e.name not in ch:
                e.head.z += lift; e.tail.z += lift
    bpy.ops.object.mode_set(mode='OBJECT')
    names = {g.index: g.name for g in mesh.vertex_groups}
    for v in mesh.data.vertices:
        for bones, top, ank, lift in maps:
            w = sum(g.weight for g in v.groups if names[g.group] in bones)
            if w <= 0:
                continue
            w = min(1.0, w)
            z = v.co.z
            z2 = z if z >= top else (top - (top - z) * k if z >= ank else z + lift)
            v.co.z = z + (z2 - z) * w
    return [m[3] for m in maps]


def tris(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def ground_z(meshes):
    """the lowest displayed vertex (world z) of the meshes as posed now"""
    dg = bpy.context.evaluated_depsgraph_get()
    lo = 1e9
    for o in meshes:
        e = o.evaluated_get(dg); m = e.to_mesh()
        if len(m.vertices):
            co = np.empty(len(m.vertices) * 3, np.float32); m.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3) @ np.array(e.matrix_world.to_3x3()).T + np.array(e.matrix_world.translation)
            lo = min(lo, float(co[:, 2].min()))
        e.to_mesh_clear()
    return lo


def unify_uv(objs):
    """one UV layer per object, all called UVMap, so joining them keeps a single TEXCOORD_0"""
    for o in objs:
        uvs = o.data.uv_layers
        act = uvs.active
        for l in [l for l in uvs if l != act]:
            uvs.remove(l)
        uvs.active.name = 'UVMap'


def decimate(o, ratio):
    if ratio >= 0.999:
        return
    if o.data.shape_keys:
        o.shape_key_clear()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
    bpy.ops.object.modifier_apply(modifier='dec')


def straighten(arm, chain, world_dir=Vector((0, 1, 0)), name='straight'):
    """a pose with the bone chain laid out in a straight line along world_dir (the hoop snake's rest pose), each bone
    turned the short way (so a flat coil straightens without twisting); keyed into a new action, returned"""
    d = (arm.matrix_world.inverted().to_3x3() @ world_dir).normalized()
    arm.animation_data_create(); arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    heads = [arm.data.bones[n].head_local.copy() for n in chain]
    p = heads[0].copy()
    for i, n in enumerate(chain):
        b = arm.data.bones[n]; pb = arm.pose.bones[n]
        R = b.matrix_local
        y = R.to_3x3().col[1].normalized()
        M = (y.rotation_difference(d).to_matrix() @ R.to_3x3()).to_4x4()
        M.translation = p
        pb.matrix = M
        bpy.context.view_layer.update()
        seg = (heads[i + 1] - heads[i]).length if i + 1 < len(chain) else b.length
        p = p + d * seg
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.keyframe_insert('location', frame=0); pb.keyframe_insert('rotation_quaternion', frame=0)
    return act


def thicken(mesh, axis_pts, k_of_t):
    """scale a straight tube's cross-section about its axis: axis_pts = world points along the axis (head first),
    k_of_t(t) = scale at fraction t (0 head .. 1 tail) along it"""
    P = np.array([tuple(p) for p in axis_pts])
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)]); L = cum[-1]
    for v in mesh.data.vertices:
        x = np.array(tuple(mesh.matrix_world @ v.co))
        # nearest segment
        best = None
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]; ab = b - a; t = np.clip(np.dot(x - a, ab) / max(1e-9, np.dot(ab, ab)), 0, 1)
            q = a + ab * t; dd = np.sum((x - q) ** 2)
            if best is None or dd < best[0]:
                best = (dd, q, (cum[i] + seg[i] * t) / L)
        _, q, t = best
        k = k_of_t(t)
        nx = q + (x - q) * k
        v.co = mesh.matrix_world.inverted() @ Vector(nx)


def ensure_uv(objs):
    """every mesh gets a UV layer (a flat-coloured part may have none)"""
    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')


def bake_low(highs, ratio, size, name, out_dir, weld=0.0015, extrude=0.012, margin=6):
    """a decimated copy of `highs` (joined, seams welded, skinned like them) with a fresh smart-UV unwrap and its
    colour baked from the originals (Cycles, diffuse colour only). For sources whose UVs are hundreds of tiny islands,
    which a decimator tears apart. Returns the new object (one material, one image)."""
    sc = bpy.context.scene
    copies = []
    for o in highs:
        c = o.copy(); c.data = o.data.copy(); sc.collection.objects.link(c)
        if c.data.shape_keys:
            c.shape_key_clear()
        copies.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for c in copies:
        c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()
    low = bpy.context.view_layer.objects.active
    low.name = name + '_low'
    bm = bmesh.new(); bm.from_mesh(low.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=weld)
    bm.to_mesh(low.data); bm.free()
    decimate(low, ratio)
    # fresh UVs
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.004, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # the bake target
    img = bpy.data.images.new(name + '_bake', size, size, alpha=False)
    m = bpy.data.materials.new(name + '_baked'); m.use_nodes = True
    tn = m.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
    m.node_tree.links.new(tn.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    m.node_tree.nodes.active = tn
    low.data.materials.clear(); low.data.materials.append(m)
    for p in low.data.polygons:
        p.material_index = 0
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = extrude; sc.render.bake.margin = margin
    bpy.ops.object.select_all(action='DESELECT')
    for o in highs:
        o.select_set(True)
    low.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True, cage_extrusion=extrude, margin=margin)
    img.filepath_raw = os.path.join(out_dir, name + '_bake.png'); img.file_format = 'PNG'
    os.makedirs(out_dir, exist_ok=True); img.save()
    return low


def still_parents():
    """drop object-level clips on the empties a Sketchfab export wraps round the armature (they must hold still)"""
    for o in bpy.data.objects:
        if o.type != 'ARMATURE' and o.animation_data:
            o.animation_data.action = None


def facing(arm, fwd_local, up_local):
    """the world rotation (4x4) that turns the armature's own forward/up axes (as world vectors now) to -Y / +Z"""
    M3 = arm.matrix_world.to_3x3()
    f = (M3 @ Vector(fwd_local)).normalized(); u = (M3 @ Vector(up_local)).normalized()
    u = (u - f * f.dot(u)).normalized()
    src = Matrix((f, u, f.cross(u))).transposed()
    tf, tu = Vector((0, -1, 0)), Vector((0, 0, 1))
    dst = Matrix((tf, tu, tf.cross(tu))).transposed()
    return (dst @ src.inverted()).to_4x4()


def subdivide(o, levels=1):
    """Catmull-Clark at the bind pose (weights and UVs carried over): smooths a low-poly source"""
    if o.data.shape_keys:
        o.shape_key_clear()
    # weld the vertices the glTF export split along UV seams, or the smoothing opens holes there
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bm.to_mesh(o.data); bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels; m.uv_smooth = 'NONE'
    bpy.ops.object.modifier_move_to_index(modifier='sub', index=0)
    bpy.ops.object.modifier_apply(modifier='sub')


def weld(o, dist=1e-4):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=dist)
    bm.to_mesh(o.data); bm.free()


def extent(meshes):
    """world bounding box (lo, hi) of the meshes as displayed now"""
    dg = bpy.context.evaluated_depsgraph_get()
    lo = np.full(3, 1e9); hi = -lo
    for o in meshes:
        e = o.evaluated_get(dg); m = e.to_mesh()
        if len(m.vertices):
            co = np.empty(len(m.vertices) * 3, np.float32); m.vertices.foreach_get('co', co)
            co = co.reshape(-1, 3) @ np.array(e.matrix_world.to_3x3()).T + np.array(e.matrix_world.translation)
            lo = np.minimum(lo, co.min(0)); hi = np.maximum(hi, co.max(0))
        e.to_mesh_clear()
    return Vector(lo), Vector(hi)


def eyes_by_colour(o, test, img=None, where=lambda p: True):
    """the two painted eyes of a mesh, found by colour: loops whose texel passes test(rgb) -> world points, split by
    side (x sign); returns [(centre, radius)] or [] when none"""
    import common as C
    mat = o.material_slots[0].material
    img = img or C.base_image(mat)
    W, H = img.size
    px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    me = o.data; uvl = me.uv_layers.active
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); em = e.to_mesh()
    pts = {}
    for p in me.polygons:
        for li in p.loop_indices:
            u, v = uvl.data[li].uv
            c = px[min(H - 1, max(0, int(v * H))), min(W - 1, max(0, int(u * W))), :3]
            if test(c):
                vi = me.loops[li].vertex_index
                q = e.matrix_world @ em.vertices[vi].co
                if where(q):
                    pts[vi] = q
    e.to_mesh_clear()
    out = []
    for side in (1, -1):
        P = [q for q in pts.values() if q.x * side > 0]
        if len(P) < 3:
            continue
        c = sum(P, Vector()) / len(P)
        out.append((c, max(0.002, max((q - c).length for q in P))))
    return out
