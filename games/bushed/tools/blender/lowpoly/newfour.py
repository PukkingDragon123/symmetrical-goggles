# Shared half of the four round-6 cryptids (roperite, hugag, billdad, wapaloosie): load a source, find its eyes,
# kitbash made parts on, and the low-poly pass (decimate, unwrap with the head boosted, bake, paint, export). Three of
# them start from the game's own real animals (public/assets/models/creatures: the WildMesh moose, the FourthGreen
# hare, the mgddeldeen9020 squirrel; all CC-BY 4.0 Sketchfab models, already rigged, animated and in metres), the
# roperite from a WildMesh donkey fetched from Sketchfab. Blender 4.2, headless; see README.md.
import bpy, bmesh, math, os, sys, time
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lowkit as L  # noqa: E402
C, K = L.C, L.K4
FAUNA = os.path.join(L.GAME, 'public', 'assets', 'models', 'creatures')


def load_fauna(rel):
    """a game animal glb as a source: (armature, meshes, fps, {clip name: action})"""
    C.reset()
    arm, meshes, fps = C.load(os.path.join(FAUNA, rel))
    acts = {a.name.rsplit('_', 1)[0]: a for a in bpy.data.actions}
    return arm, meshes, fps, acts


def bind_action(arm):
    """an action holding the armature at its rest pose (the new rest = the source's)"""
    b = bpy.data.actions.new('bind')
    arm.animation_data_create(); arm.animation_data.action = b
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    C.set_frame(0)
    return b


def dark_eyes(o, centre, r, thr=0.035):
    """the two painted eyes by colour (dark texels) within r of a point (world): [(centre, radius)] by side"""
    return K.eyes_by_colour(o, lambda c: max(c[0], c[1], c[2]) < thr, where=lambda p: (p - centre).length < r)


def flat_material(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def part(name, bm, mat):
    """a bmesh as a new mesh object with one material and a UV layer"""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    if not o.data.uv_layers:
        o.data.uv_layers.new(name='UVMap')
    return o


def tube(path, radii, seg=8, name='tube', mat=None, cap=True):
    """a tube along a polyline (world points) with a radius per point (or (rx, ry) per point: an oval cross-section,
    rx across the path's side, ry along its up)"""
    bm = bmesh.new()
    P = [Vector(p) for p in path]
    rings = []
    up0 = Vector((0, 0, 1))
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        side = t.cross(up0)
        if side.length < 1e-4:
            side = t.cross(Vector((0, 1, 0)))
        side.normalize(); up = side.cross(t).normalized()
        rr = radii[i] if isinstance(radii[i], (tuple, list)) else (radii[i], radii[i])
        ring = [bm.verts.new(p + side * math.cos(a) * rr[0] + up * math.sin(a) * rr[1]) for a in (k / seg * math.tau for k in range(seg))]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    if cap:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            c = bm.verts.new(sum((v.co for v in ring), Vector()) / seg)
            for k in range(seg):
                f = (ring[k], ring[(k + 1) % seg], c)
                bm.faces.new(f[::-1] if rev else f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return part(name, bm, mat)


def weights(o):
    """{group name: np.array of per-vertex weights}"""
    n = len(o.data.vertices)
    out = {g.name: np.zeros(n, np.float32) for g in o.vertex_groups}
    names = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices:
        for g in v.groups:
            out[names[g.group]][v.index] = g.weight
    return out


def coords(o):
    a = np.empty(len(o.data.vertices) * 3, np.float32); o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def set_coords(o, co):
    o.data.vertices.foreach_set('co', np.asarray(co, np.float32).ravel()); o.data.update()


def bone_head(ao, n):
    return Vector(ao.data.bones[n].head_local)


def lowpass(name, ao, outm, acts, tris, tex, head, protect, paint, boost=2.5, sub=1, ao_k=0.5, cav_k=1.8, t0=None, strength=0.75):
    """the low-poly half: high = the rebaked body (welded, smoothed once), low = it decimated (head and protect bones
    spared), fresh UVs with the head boosted, maps baked standing (acts[0] frame 0), painted, exported with the clips"""
    t0 = t0 or time.time()
    K.ensure_uv(outm)
    body = [o for o in outm if o['src'] != 'beads']
    bead = next(o for o in outm if o['src'] == 'beads')
    bead.data.materials.clear(); bead.data.materials.append(K.bead_material())
    hi = L._copy_join(body, 'hi'); K.weld(hi, 0.0025); L.outward(hi)
    if sub:
        K.subdivide(hi, sub)
    for p in hi.data.polygons:
        p.use_smooth = True
    low = L.lowpoly([hi], tris, name, protect=(head + protect, strength))
    # the decimator's 'protect' group is not a bone: left on, it takes one of the four weight slots (torn paws)
    fix_groups([low], ao)
    lb = L._copy_join([bead], 'lowbeads')
    for p in lb.data.polygons:
        p.use_smooth = True
    low = C.join([low, lb], name + '_mesh')
    L.unwrap(low, boost={b: boost for b in head})
    M = L.bake_maps(low, [hi, bead], tex, extrude=0.015, ray=0.05, pose=(acts[0], 0))
    print(f'BAKED {name} {time.time() - t0:.0f}s')
    col = L.finish(M, paint=paint, ao_k=ao_k, cav_k=cav_k)
    mat = L.save_material(name, col, M['shine'])
    L.apply_material(low, mat)
    C.limit_weights(low, 4)
    for o in [hi, bead] + body:
        bpy.data.objects.remove(o, do_unlink=True)
    n = L.tris(low)
    out = os.path.join(K.OUT, name + '.glb')
    C.export(ao, low, out, acts)
    lo, hi_ = C.bbox([low])
    L.write_meta(name, {'tris': n, 'tex': TEX_OF.get(name, tex), 'clips': [a.name for a in acts], 'bbox': [list(lo), list(hi_)], 'seconds': round(time.time() - t0)})
    print(f'DONE {name} {n} tris in {time.time() - t0:.0f}s')
    return low


TEX_OF = {}


# ------------------------------------------------------------------------------------------------ paint helpers
def eyes_of(M):
    """the two bead eyes' positions (game space) from the shine mask"""
    P = M['pos']; sh = (M['shine'] > 0.5) & M['valid']
    return [P[sh & (P[..., 0] * k > 0)].mean(0) for k in (1, -1)]


def mix(rgb, k, col):
    """blend toward a colour (linear) by mask k (H, W)"""
    k = np.clip(k, 0, 1)[..., None]
    return rgb * (1 - k) + np.asarray(col, np.float32) * k


def lin(hexstr):
    h = hexstr.lstrip('#')
    return L.to_linear(np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32))


def sd_image(o):
    """the glTF metallic-roughness image of a game creature (its R channel is the eye-shine mask)"""
    m = o.material_slots[0].material
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and n.image is not C.base_image(m):
            return n.image
    return None


def shine_eyes(o, centre, r):
    """the eyes of a game creature from its sd page's shine mask, within r of a point: [(centre, radius)] by side"""
    img = sd_image(o)
    return K.eyes_by_colour(o, lambda c: c[0] > 0.5, img=img, where=lambda p: (p - centre).length < r) if img else []


def fix_groups(outm, ao):
    """after C.rebake on a source whose vertex groups already carry the new bone names (the game's own animals): the
    copied mesh keeps the source's groups and rebake adds its own as 'X.001'. Keep rebake's, drop everything else (a
    stale duplicate can win limit_weights and leave a vertex bound to nothing: torn paws)"""
    bones = {b.name for b in ao.data.bones}
    for o in outm:
        for g in list(o.vertex_groups):
            if g.name.endswith('.001') and g.name[:-4] in bones:
                old = o.vertex_groups.get(g.name[:-4])
                if old:
                    o.vertex_groups.remove(old)
                g.name = g.name[:-4]
        for g in list(o.vertex_groups):
            if g.name not in bones:
                o.vertex_groups.remove(g)
