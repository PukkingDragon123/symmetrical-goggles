# Shared Blender (4.2) helpers for the BUSHED real-animal pipeline: take a downloaded, rigged and animated model
# (Sketchfab glTF), rebake it onto a small clean game skeleton in metres (Y up and +Z forward once exported, ground at
# 0), merge its materials into one texture atlas (+ an "sd" page: R eye-shine mask, G roughness, B metalness),
# decimate it, and export one .glb with named clips.
#
# The rebake works from what Blender DISPLAYS (evaluated bone matrices and deformed vertices at a reference frame), so
# odd source transforms (FBX 0.01 scales, negative scales, Rigify ORG/MCH/DEF stacks) don't matter: the new rest pose
# is the reference frame, every clip is resampled at 30 fps from the source's world-space bone matrices, and a
# per-vertex error check compares the new rig against the source at sample frames.
import bpy, bmesh, math, os, json
import numpy as np
from mathutils import Matrix, Vector, Quaternion

FPS = 30
MX = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    """import a glTF; returns (armature, meshes, source fps)"""
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    return (arms[0] if arms else None), meshes, bpy.context.scene.render.fps


def set_frame(f):
    bpy.context.scene.frame_set(int(math.floor(f)), subframe=f - math.floor(f))


def find_bone(arm, key):
    """a bone by exact name, or by name without its trailing _NN index"""
    if key in arm.data.bones:
        return arm.data.bones[key].name
    for b in arm.data.bones:
        if b.name.rsplit('_', 1)[0] == key:
            return b.name
    raise KeyError(key)


def _world(arm, pb):
    W = arm.matrix_world @ pb.matrix
    if W.to_3x3().determinant() < 0:
        W = W @ MX  # a reflected frame: flip the bone's local x (deformation unchanged, see module notes)
    return W


def _unit(W):
    """rotation + translation of W (uniform scale removed)"""
    loc, rot, _ = W.decompose()
    return Matrix.Translation(loc) @ rot.to_matrix().to_4x4()


def _scale_of(W):
    return abs(W.to_3x3().determinant()) ** (1 / 3)


def action(name):
    a = bpy.data.actions.get(name)
    if a:
        return a
    for x in bpy.data.actions:
        if x.name.startswith(name):
            return x
    raise KeyError(name)


def rebake(arm, meshes, keep, ref, clips, T=Matrix.Identity(4), src_fps=24, name='rig', check=True, obj_bone=None, anchor=None, parents=None, wmap=None, drop=None, scaled=None):
    """keep: [(new_name, src_bone)] parent-first; ref: (action, frame) = the new rest pose; clips: [dict(name, action,
    f0, f1, drift=False)]; T: a world transform applied to everything (scale to size, move to the ground). obj_bone:
    {mesh object name: src bone} for unskinned meshes parented to a bone (antlers). Returns (armature, mesh objects)."""
    sc = bpy.context.scene
    sc.render.fps = FPS
    src2new = {s: n for n, s in keep}
    parent = {}
    for n, s in keep:
        b = arm.data.bones[s].parent
        while b and b.name not in src2new:
            b = b.parent
        parent[n] = src2new[b.name] if b else None
    if parents:
        parent.update(parents)
    wm = {}
    for b in arm.data.bones:
        x = b
        while x and x.name not in src2new:
            x = x.parent
        wm[b.name] = src2new[x.name] if x else keep[0][0]
    if wmap:
        wm.update(wmap)
    wmap = wm
    # ---- the reference pose: new rest bones and the displayed meshes
    if arm.animation_data is None:
        arm.animation_data_create()
    _rest_pose(arm)
    if ref[0] is not None:
        arm.animation_data.action = ref[0]
    set_frame(ref[1])
    dg = bpy.context.evaluated_depsgraph_get()
    restW = {n: T @ _world(arm, arm.pose.bones[s]) for n, s in keep}
    fixR = {n: restW[n].inverted() @ _unit(restW[n]) for n in restW}
    # scale (Rigify's stretch) is carried on leaf bones only: a non-uniformly scaled parent would shear its children,
    # which a TRS hierarchy can't hold
    leaves = (set(restW) - set(p for p in parent.values() if p)) & set(scaled or ())
    S = _scale_of(T @ arm.matrix_world)
    out_meshes = []
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        MW = T @ o.matrix_world
        co = [MW @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        data = o.data.copy()
        data.name = o.name + '_baked'
        if data.shape_keys:
            pass
        for v, c in zip(data.vertices, co):
            v.co = c
        if MW.to_3x3().determinant() < 0:
            bm = bmesh.new(); bm.from_mesh(data); bmesh.ops.reverse_faces(bm, faces=bm.faces[:]); bm.to_mesh(data); bm.free()
        no = bpy.data.objects.new(o.name + '_new', data)
        sc.collection.objects.link(no)
        # weights: every source group onto its kept bone
        names = {g.index: g.name for g in o.vertex_groups}
        acc = {}
        for v in data.vertices:
            for g in v.groups:
                nb = wmap.get(names.get(g.group, ''), None)
                if nb is None or g.weight <= 0:
                    continue
                d = acc.setdefault(v.index, {})
                d[nb] = d.get(nb, 0) + g.weight
        if obj_bone and o.name in obj_bone:
            nb = wmap[obj_bone[o.name]]
            acc = {v.index: {nb: 1.0} for v in data.vertices}
        groups = {}
        for vi, d in acc.items():
            for nb, w in d.items():
                if nb not in groups:
                    groups[nb] = no.vertex_groups.new(name=nb)
                groups[nb].add([vi], min(1.0, w), 'REPLACE')
        out_meshes.append(no)
        no['src'] = o.name
    # ---- the new armature
    ad = bpy.data.armatures.new(name)
    ao = bpy.data.objects.new(name, ad)
    sc.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    for n, s in keep:
        eb = ad.edit_bones.new(n)
        L = max(arm.data.bones[s].length * S, 0.004)
        eb.head = (0, 0, 0); eb.tail = (0, L, 0)
        eb.matrix = _unit(restW[n])
    for n, s in keep:
        if parent[n]:
            ad.edit_bones[n].parent = ad.edit_bones[parent[n]]
    bpy.ops.object.mode_set(mode='OBJECT')
    R = {b.name: b.matrix_local.copy() for b in ad.bones}
    relR = {n: (R[parent[n]].inverted() @ R[n]) if parent[n] else R[n] for n, _ in keep}
    for no in out_meshes:
        no.parent = ao
        mod = no.modifiers.new('Armature', 'ARMATURE'); mod.object = ao
    ao.animation_data_create()
    # ---- clips
    made = []
    for c in clips:
        act = c['action']
        _rest_pose(arm)
        arm.animation_data.action = act
        f0, f1 = c.get('f0', act.frame_range[0]), c.get('f1', act.frame_range[1])
        dur = max((f1 - f0) / src_fps, 1 / FPS)
        nfr = max(1, round(dur * FPS))
        frames = [f0 + (f1 - f0) * k / nfr for k in range(nfr + 1)]
        mats = []
        for f in frames:
            set_frame(f)
            # the source's deformation (scale included: Rigify stretches) carried onto the new unit-scale rest bones
            mats.append({n: ((T @ _world(arm, arm.pose.bones[sb])) @ fixR[n]) if n in leaves else _unit(T @ _world(arm, arm.pose.bones[sb])) for n, sb in keep})
        root = keep[0][0]
        if anchor:
            # in place: the anchor bone (the pelvis) stays over its rest spot in xy. Loops lose their forward drift
            # and are centred on the rest spot; one-shots start on it (and keep their own travel, a fall)
            rest_xy = restW[anchor].translation.copy(); rest_xy.z = 0  # (restW: translation unaffected by fixR)
            P = [m[anchor].translation.copy() for m in mats]
            for p in P:
                p.z = 0
            offs = []
            if c.get('loop', True):
                d = P[-1] - P[0]
                Q = [P[k] - d * (k / nfr) for k in range(len(P))]
                mean = sum(Q, Vector()) / len(Q)
                offs = [(P[k] - Q[k]) + (mean - rest_xy) for k in range(len(P))]
            else:
                offs = [P[0] - rest_xy for _ in P]
            for k, m in enumerate(mats):
                sh = Matrix.Translation(-offs[k])
                for n in m:
                    m[n] = sh @ m[n]
        if c.get('pose'):  # a held pose: one sample, looped
            mats = mats[:1]
            frames = frames[:1]
        fb = [{n: relR[n].inverted() @ ((m[parent[n]].inverted() @ m[n]) if parent[n] else m[n]) for n, _ in keep} for m in mats]
        new = _write_action(c['name'], fb, c.get('loop', True))
        made.append(new)
        nk = len(mats)
        if check and c.get('check', True) and nk > 1:
            err = _check(arm, meshes, ao, out_meshes, act, new, frames[nk // 2], nk // 2, T)
            print(f'CLIP {c["name"]:12s} {nk:4d} keys  {dur:5.2f}s  max err {err * 100:.2f} cm')
        else:
            print(f'CLIP {c["name"]:12s} {nk:4d} keys  {dur:5.2f}s')
    for p in ao.pose.bones:
        p.rotation_mode = 'QUATERNION'
    return ao, out_meshes, made


def _rest_pose(arm):
    """bones a clip doesn't key would keep the last clip's values: start every clip from the rest pose"""
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)


def _check(arm, meshes, ao, out_meshes, act, new, f_src, k_new, T):
    """the largest distance between source and rebaked vertices at one frame (skinned meshes only)"""
    arm.animation_data.action = act
    ao.animation_data.action = new
    set_frame(f_src)
    dg = bpy.context.evaluated_depsgraph_get()
    A = {}
    for o in meshes:
        if not any(m.type == 'ARMATURE' for m in o.modifiers):
            continue
        me = o.evaluated_get(dg).to_mesh(); MW = T @ o.matrix_world
        A[o.name] = np.array([tuple(MW @ v.co) for v in me.vertices]); o.evaluated_get(dg).to_mesh_clear()
    set_frame(k_new)
    dg = bpy.context.evaluated_depsgraph_get()
    err = 0.0
    for no in out_meshes:
        if no['src'] not in A:
            continue
        me = no.evaluated_get(dg).to_mesh()
        B = np.array([tuple(no.matrix_world @ v.co) for v in me.vertices]); no.evaluated_get(dg).to_mesh_clear()
        if len(B) == len(A[no['src']]):
            a0 = A[no['src']]
            err = max(err, float(np.max(np.linalg.norm((a0 - a0.mean(0)) - (B - B.mean(0)), axis=1))))
    ao.animation_data.action = None
    return err


def drop_source(keep_objs):
    """delete everything but keep_objs (and their data); purge source actions and images"""
    keep = set(o.name for o in keep_objs)
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if not a.use_fake_user:
            bpy.data.actions.remove(a)


# ------------------------------------------------------------------------------------------------ textures
def base_image(mat):
    if not mat or not mat.use_nodes:
        return None
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        return None
    for l in bsdf.inputs['Base Color'].links:
        n = l.from_node
        while n and n.type != 'TEX_IMAGE':
            n = n.inputs[0].links[0].from_node if n.inputs and n.inputs[0].links else None
        if n:
            return n.image
    return None


def normal_image(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'NORMAL_MAP' and n.inputs['Color'].links:
            return n.inputs['Color'].links[0].from_node.image
    return None


def img_array(img, w, h):
    """an image scaled to w x h as a float32 (h, w, 4) array, rows bottom-up"""
    c = img.copy()
    c.scale(w, h)
    a = np.empty(w * h * 4, dtype=np.float32)
    c.pixels.foreach_get(a)
    bpy.data.images.remove(c)
    return a.reshape(h, w, 4)


def save_png(arr, path, name, alpha=True):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def atlas(objs, layout, size, out_dir, name, rough=None, shine=None, normals=True, recolor=None, post=None):
    """Merge every material on objs into one atlas. layout: {material name: (x0, y0, w, h) px, origin bottom-left};
    rough: {material: roughness} (default 0.85); shine: {material: 0..1} eye-shine mask; recolor: {material:
    fn(arr) -> arr} edits a region (eyes). Writes <name>_col.png, <name>_sd.png (+ _nrm.png) into out_dir and
    returns the one material."""
    W, H = size
    col = np.zeros((H, W, 4), np.float32); col[..., 3] = 1
    sd = np.zeros((H, W, 4), np.float32); sd[..., 1] = 0.85; sd[..., 3] = 1
    nrm = np.zeros((H, W, 4), np.float32); nrm[..., 0] = 0.5; nrm[..., 1] = 0.5; nrm[..., 2] = 1; nrm[..., 3] = 1
    any_nrm = False
    mats = {}
    for o in objs:
        for s in o.material_slots:
            if s.material:
                mats[s.material.name] = s.material
    for mn, (x0, y0, w, h) in layout.items():
        m = mats.get(mn)
        if m is None:
            print('ATLAS: no material', mn); continue
        img = base_image(m)
        if img is not None:
            a = img_array(img, w, h)
            if recolor and mn in recolor:
                a = recolor[mn](a)
            col[y0:y0 + h, x0:x0 + w] = a
        else:
            bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            col[y0:y0 + h, x0:x0 + w] = tuple(bsdf.inputs['Base Color'].default_value) if bsdf else (0.5, 0.5, 0.5, 1)
        sd[y0:y0 + h, x0:x0 + w, 1] = (rough or {}).get(mn, 0.85)
        sd[y0:y0 + h, x0:x0 + w, 0] = (shine or {}).get(mn, 0.0)
        ni = normal_image(m) if normals else None
        if ni is not None:
            nrm[y0:y0 + h, x0:x0 + w] = img_array(ni, w, h); any_nrm = True
    # UVs into the atlas
    for o in objs:
        me = o.data
        uvl = me.uv_layers.active
        slot_rect = []
        for s in o.material_slots:
            r = layout.get(s.material.name) if s.material else None
            slot_rect.append(r)
        for p in me.polygons:
            r = slot_rect[p.material_index] if p.material_index < len(slot_rect) else None
            if not r:
                continue
            x0, y0, w, h = r
            for li in p.loop_indices:
                u, v = uvl.data[li].uv
                u = min(max(u, 0.0), 1.0); v = min(max(v, 0.0), 1.0)
                uvl.data[li].uv = ((x0 + 0.5 + u * (w - 1)) / W, (y0 + 0.5 + v * (h - 1)) / H)
        keepname = uvl.name
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(next(l for l in me.uv_layers if l.name != keepname))
        me.uv_layers[0].name = 'UVMap'
    if post:
        post(col, sd, nrm)
    os.makedirs(out_dir, exist_ok=True)
    ci = save_png(col, os.path.join(out_dir, name + '_col.png'), name + '_col')
    si = save_png(sd, os.path.join(out_dir, name + '_sd.png'), name + '_sd', alpha=False)
    ni = save_png(nrm, os.path.join(out_dir, name + '_nrm.png'), name + '_nrm', alpha=False) if any_nrm else None
    si.colorspace_settings.name = 'Non-Color'
    if ni:
        ni.colorspace_settings.name = 'Non-Color'
    alpha = bool(np.any(col[..., 3] < 0.99))
    return make_material(name, ci, si, ni, alpha)


def make_material(name, ci, si, ni, alpha):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = ci
    nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha:
        nt.links.new(tc.outputs['Alpha'], bsdf.inputs['Alpha'])
        m.blend_method = 'CLIP'
        m.alpha_threshold = 0.5
    ts = nt.nodes.new('ShaderNodeTexImage'); ts.image = si
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(ts.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    if ni:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ni
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o


def finish_mesh(o, mat, ratio=1.0, smooth=True):
    """one material, clear custom normals, decimate (keeps weights), smooth shading"""
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.material_index = 0
        p.use_smooth = smooth
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception as e:
        print('normals', e)
    if ratio < 0.999:
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
        bpy.ops.object.modifier_apply(modifier='dec')
    # merge doubles left by the source export (UV-seam splits stay)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(o.data); bm.free()
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def limit_weights(o, n=4):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=n)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)


def export(arm, mesh, path, actions):
    """one .glb: the armature, its skinned mesh, every action as a named clip"""
    # each action on its own NLA track, so the exporter writes them all
    ad = arm.animation_data
    ad.action = None
    for a in actions:
        tr = ad.nla_tracks.new(); tr.name = a.name
        st = tr.strips.new(a.name, int(a.frame_range[0]), a)
        tr.mute = True
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True); mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_optimize_animation_size=True, export_def_bones=False, export_skins=True, export_all_influences=False,
        export_image_format='WEBP', export_image_quality=88, export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False,
        export_morph=False)
    print('EXPORTED', path, os.path.getsize(path) // 1024, 'KB')


def bbox(objs):
    lo = Vector((1e9,) * 3); hi = -lo
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def write_meta(path, meta):
    with open(path, 'w') as fh:
        json.dump(meta, fh, indent=1)


# ------------------------------------------------------------------------------------------------ repainting
def _blur(a, sig):
    """separable gaussian blur of an (h, w, c) array (wraps at the borders)"""
    r = int(sig * 2.5)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2); k /= k.sum()
    out = np.zeros_like(a)
    for i, w in enumerate(k):
        out += np.roll(a, i - r, axis=0) * w
    a2 = np.zeros_like(out)
    for i, w in enumerate(k):
        a2 += np.roll(out, i - r, axis=1) * w
    return a2


def dilate(a, mask, it=24):
    """grow the painted islands into the empty background, so blurs and mips don't pull black into the seams"""
    a = a.copy(); m = mask.astype(np.float32)
    for _ in range(it):
        acc = np.zeros_like(a); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            mm = np.roll(np.roll(m, dy, 0), dx, 1)
            acc += np.roll(np.roll(a, dy, 0), dx, 1) * mm[..., None]; cnt += mm
        grow = (m == 0) & (cnt > 0)
        a[grow] = acc[grow] / cnt[grow][:, None]
        m = np.maximum(m, grow.astype(np.float32))
    return a


def realify(stops, soft=3.0, keep_hue=0.25, fur=0.14, streak=(1, 9), seed=1):
    """a recolor: soften a posterised (cel) paint job, map its brightness onto a real coat ramp (stops: [(lum,
    (r,g,b))]), keep a little of the original hue, and add fine fur streaks"""
    def fn(a):
        rgb = a[..., :3]
        mask = rgb.max(axis=2) > 0.02
        rgb = dilate(rgb, mask)
        rgb = _blur(rgb, soft)
        lum = rgb @ np.array([0.3, 0.55, 0.15], np.float32)
        lum = (lum - np.percentile(lum[mask], 2)) / max(1e-3, np.percentile(lum[mask], 98) - np.percentile(lum[mask], 2))
        lum = np.clip(lum, 0, 1)
        xs = np.array([s[0] for s in stops], np.float32); cs = np.array([s[1] for s in stops], np.float32)
        ramp = np.stack([np.interp(lum, xs, cs[:, i]) for i in range(3)], axis=2)
        grey = rgb.mean(axis=2, keepdims=True)
        hue = rgb / np.maximum(grey, 1e-3) * ramp.mean(axis=2, keepdims=True)
        col = ramp * (1 - keep_hue) + np.clip(hue, 0, 1) * keep_hue
        rng = np.random.default_rng(seed)
        n = rng.standard_normal(lum.shape + (1,)).astype(np.float32)
        n = _blur(n, 0.8)
        # streaks along v (the fur lies along the body)
        k = np.ones(streak[1], np.float32) / streak[1]
        s = np.zeros_like(n)
        for i, w in enumerate(k):
            s += np.roll(n, i - streak[1] // 2, axis=0) * w
        s = s / (s.std() + 1e-6)
        col = np.clip(col * (1 + fur * s), 0, 1)
        out = a.copy(); out[..., :3] = col; out[..., 3] = 1
        return out
    return fn


# ------------------------------------------------------------------------------------------------ authoring
def _write_action(name, frames_basis, loop=True):
    """frames_basis: [{bone: Matrix basis}] at 30 fps -> an action (location + quaternion, linear)"""
    act = bpy.data.actions.new(name)
    bones = list(frames_basis[0].keys())
    nk = len(frames_basis)
    for b in bones:
        prev = None
        locs, qs, scs = [], [], []
        for fb in frames_basis:
            loc, q, sc = fb[b].decompose()
            if prev is not None and prev.dot(q) < 0:
                q = -q
            prev = q
            locs.append(loc); qs.append(q); scs.append(sc)
        if any(abs(x - 1) > 1e-4 for v in scs for x in v):
            for i in range(3):
                fc = act.fcurves.new(f'pose.bones["{b}"].scale', index=i, action_group=b); fc.keyframe_points.add(nk)
                fc.keyframe_points.foreach_set('co', [x for k in range(nk) for x in (k, scs[k][i])])
                fc.keyframe_points.foreach_set('interpolation', [1] * nk); fc.update()
        for i in range(3):
            fc = act.fcurves.new(f'pose.bones["{b}"].location', index=i, action_group=b); fc.keyframe_points.add(nk)
            fc.keyframe_points.foreach_set('co', [x for k in range(nk) for x in (k, locs[k][i])])
            fc.keyframe_points.foreach_set('interpolation', [1] * nk); fc.update()
        for i in range(4):
            fc = act.fcurves.new(f'pose.bones["{b}"].rotation_quaternion', index=i, action_group=b); fc.keyframe_points.add(nk)
            fc.keyframe_points.foreach_set('co', [x for k in range(nk) for x in (k, qs[k][i])])
            fc.keyframe_points.foreach_set('interpolation', [1] * nk); fc.update()
    act.use_fake_user = True
    act['loop'] = bool(loop)
    return act


def pose_of(ao, act, frame):
    """armature-space matrices of every bone of ao playing act at frame"""
    ao.animation_data.action = act
    set_frame(frame)
    return {pb.name: pb.matrix.copy() for pb in ao.pose.bones}


def author(ao, name, dur, base, ops, loop=True):
    """A new clip on the rebaked rig: base(t) -> {bone: armature-space matrix} (a pose_of, maybe blended), and
    ops(t) -> [('rot', bone, axis, angle) | ('move', bone, Vector)]: world-axis rotations about the bone's head (its
    children follow) and translations, applied in order. Sampled at 30 fps."""
    kids = {b.name: [c.name for c in b.children_recursive] for b in ao.data.bones}
    par = {b.name: (b.parent.name if b.parent else None) for b in ao.data.bones}
    R = {b.name: b.matrix_local.copy() for b in ao.data.bones}
    relR = {b: ((R[par[b]].inverted() @ R[b]) if par[b] else R[b]) for b in R}
    n = max(1, round(dur * FPS))
    out = []
    for k in range(n + 1):
        t = k / FPS
        M = {b: m.copy() for b, m in base(t).items()}
        for op in ops(t):
            if op[0] == 'rot':
                _, b, axis, ang = op
                if abs(ang) < 1e-6:
                    continue
                h = M[b].translation.copy()
                Rm = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, Vector(axis)) @ Matrix.Translation(-h)
            else:
                _, b, v = op
                Rm = Matrix.Translation(Vector(v))
            for x in [b] + kids[b]:
                M[x] = Rm @ M[x]
        out.append({b: relR[b].inverted() @ ((M[par[b]].inverted() @ M[b]) if par[b] else M[b]) for b in R})
    act = _write_action(name, out, loop)
    print(f'AUTHORED {name:10s} {len(out):4d} keys {dur:5.2f}s')
    return act


def blend_pose(a, b, w):
    """per-bone blend of two armature-space poses (rotation slerp, translation lerp)"""
    out = {}
    for k in a:
        la, ra, _ = a[k].decompose(); lb, rb, _ = b[k].decompose()
        out[k] = Matrix.Translation(la.lerp(lb, w)) @ ra.slerp(rb, w).to_matrix().to_4x4()
    return out


def decimate(o, ratio, protect=None):
    """collapse-decimate one object (weights follow); protect: a vertex group kept dense"""
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = ratio; d.use_collapse_triangulate = True
    if protect:
        d.vertex_group = protect; d.invert_vertex_group = True; d.vertex_group_factor = 1.0
    bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
    bpy.ops.object.modifier_apply(modifier='dec')
    if protect and protect in o.vertex_groups:
        o.vertex_groups.remove(o.vertex_groups[protect])


def raster_faces(o, faces, W, H):
    """a (H, W) bool mask of the UV triangles of the given polygons (atlas pixel space, rows bottom-up)"""
    me = o.data; uvl = me.uv_layers.active.data
    mask = np.zeros((H, W), bool)
    for pi in faces:
        p = me.polygons[pi]
        uv = [uvl[li].uv for li in p.loop_indices]
        for i in range(1, len(uv) - 1):
            tri = np.array([uv[0], uv[i], uv[i + 1]]) * np.array([W, H])
            x0, y0 = np.floor(tri.min(0)).astype(int); x1, y1 = np.ceil(tri.max(0)).astype(int)
            x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0); x1, y1 = min(x1 + 1, W), min(y1 + 1, H)
            if x1 <= x0 or y1 <= y0:
                continue
            ys, xs = np.mgrid[y0:y1, x0:x1]
            px = np.stack([xs + 0.5, ys + 0.5], -1)
            a, b, c = tri
            v0, v1, v2 = b - a, c - a, px - a
            den = v0[0] * v1[1] - v1[0] * v0[1]
            if abs(den) < 1e-9:
                continue
            u = (v2[..., 0] * v1[1] - v1[0] * v2[..., 1]) / den
            v = (v0[0] * v2[..., 1] - v2[..., 0] * v0[1]) / den
            inside = (u >= -0.02) & (v >= -0.02) & (u + v <= 1.02)
            mask[y0:y1, x0:x1] |= inside
    return mask
