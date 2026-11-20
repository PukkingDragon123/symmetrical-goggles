# A snapshot of ../fauna/common.py (the shared real-animal pipeline), kept here so the four camp-story cryptids
# rebuild the same way even if that file moves on. kit.py adds what they need on top.
#
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
INIT_POSE = {}
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
    for a in arms:  # (cryptids4) the imported pose, before any clip touches it
        INIT_POSE[a.name] = {pb.name: pb.matrix_basis.copy() for pb in a.pose.bones}
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


def _shift(m, M):
    """(cryptids4) move a whole sampled pose: every bone, not just the root (moving the root alone moves only what the
    root skins: the children keep their world place, and the hips tear away from the legs)"""
    for n in m:
        m[n] = M @ m[n]


def rebake(arm, meshes, keep, ref, clips, T=Matrix.Identity(4), src_fps=24, name='rig', check=True, obj_bone=None):
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
    wmap = {}
    for b in arm.data.bones:
        x = b
        while x and x.name not in src2new:
            x = x.parent
        wmap[b.name] = src2new[x.name] if x else keep[0][0]
    # ---- the reference pose: new rest bones and the displayed meshes
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = ref[0]
    set_frame(ref[1])
    dg = bpy.context.evaluated_depsgraph_get()
    restW = {n: T @ _world(arm, arm.pose.bones[s]) for n, s in keep}
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
        if parent[n]:
            eb.parent = ad.edit_bones[parent[n]]
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
        # (cryptids4) bones a clip does not key keep the last clip's pose in Blender: start every clip from the
        # imported pose (glTF: an unanimated joint holds its node transform)
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            if pb.name in INIT_POSE.get(arm.name, {}):
                pb.matrix_basis = INIT_POSE[arm.name][pb.name]
        arm.animation_data.action = act
        f0, f1 = c.get('f0', act.frame_range[0]), c.get('f1', act.frame_range[1])
        dur = max((f1 - f0) / src_fps, 1 / FPS)
        nfr = max(1, round(dur * FPS))
        frames = [f0 + (f1 - f0) * k / nfr for k in range(nfr + 1)]
        mats = []
        TT = T @ c['pre'] if 'pre' in c else T  # (cryptids4) a per-clip turn, before T: clips facing another way
        for f in frames:
            set_frame(f)
            mats.append({n: _unit(TT @ _world(arm, arm.pose.bones[s])) for n, s in keep})
        root = keep[0][0]
        if c.get('floor'):  # (cryptids4) the clip's lowest point over its frames on the ground (clips that lost root motion)
            low = 1e9
            for f in frames[::max(1, len(frames) // 10)]:
                set_frame(f)
                dg = bpy.context.evaluated_depsgraph_get()
                for o in meshes:
                    if not any(md.type == 'ARMATURE' for md in o.modifiers):
                        continue  # a static part (bead eyes) stands still in the source: not the floor
                    e = o.evaluated_get(dg); me = e.to_mesh()
                    if len(me.vertices):
                        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
                        M = TT @ o.matrix_world
                        z = co.reshape(-1, 3) @ np.array(M.to_3x3())[2] + M.translation.z
                        low = min(low, float(z.min()))
                    e.to_mesh_clear()
            for m in mats:
                _shift(m, Matrix.Translation((0, 0, -low)))
        if c.get('center_bone'):  # (cryptids4) an in-place clip: keep this bone, on average, over its rest spot
            cb = c['center_bone']
            to = Vector((*c['center_to'], 0)) if c.get('center_to') else restW[cb].translation
            d = sum((m[cb].translation for m in mats), Vector()) / len(mats) - to
            d.z = 0
            for m in mats:
                _shift(m, Matrix.Translation(-d))
        if c.get('drift'):
            d = mats[-1][c.get('drift_bone', root)].translation - mats[0][c.get('drift_bone', root)].translation
            d.z = 0
            for k, m in enumerate(mats):
                _shift(m, Matrix.Translation(-d * (k / nfr)))
        if c.get('recenter'):  # (kit.py) a clip that ends somewhere else (a fall): slide it back over the rest spot
            rb = c.get('recenter_bone', root)
            d = mats[-1][rb].translation - restW[rb].translation
            d.z = 0
            for k, m in enumerate(mats):
                _shift(m, Matrix.Translation(-d * (1.0 if c.get('pose') else k / nfr)))
        if c.get('pose'):  # a held pose: one sample, looped
            mats = mats[:1]
            frames = frames[:1]
        new = bpy.data.actions.new(c['name'])
        prevq = {}
        curves = {}
        for n, _ in keep:
            curves[n] = ([new.fcurves.new(f'pose.bones["{n}"].location', index=i, action_group=n) for i in range(3)],
                         [new.fcurves.new(f'pose.bones["{n}"].rotation_quaternion', index=i, action_group=n) for i in range(4)])
        data = {n: ([], []) for n, _ in keep}
        for k, m in enumerate(mats):
            for n, _ in keep:
                rel = (m[parent[n]].inverted() @ m[n]) if parent[n] else m[n]
                basis = relR[n].inverted() @ rel
                loc, q, _ = basis.decompose()
                if n in prevq and prevq[n].dot(q) < 0:
                    q = -q
                prevq[n] = q
                data[n][0].append(loc); data[n][1].append(q)
        nk = len(mats)
        times = [k for k in range(nk)] if nk > 1 else [0]
        for n, _ in keep:
            locs, qs = data[n]
            for i in range(3):
                fc = curves[n][0][i]; fc.keyframe_points.add(nk)
                fc.keyframe_points.foreach_set('co', [x for k in range(nk) for x in (times[k], locs[k][i])])
                fc.keyframe_points.foreach_set('interpolation', [1] * nk)  # LINEAR
            for i in range(4):
                fc = curves[n][1][i]; fc.keyframe_points.add(nk)
                fc.keyframe_points.foreach_set('co', [x for k in range(nk) for x in (times[k], qs[k][i])])
                fc.keyframe_points.foreach_set('interpolation', [1] * nk)
        for fcs in curves.values():
            for fc in fcs[0] + fcs[1]:
                fc.update()
        new.use_fake_user = True
        new['loop'] = bool(c.get('loop', True))
        made.append(new)
        if check and c.get('check', True) and nk > 1:
            err = _check(arm, meshes, ao, out_meshes, act, new, frames[nk // 2], nk // 2, TT)
            print(f'CLIP {c["name"]:12s} {nk:4d} keys  {dur:5.2f}s  max err {err * 100:.2f} cm')
        else:
            print(f'CLIP {c["name"]:12s} {nk:4d} keys  {dur:5.2f}s')
    for p in ao.pose.bones:
        p.rotation_mode = 'QUATERNION'
    return ao, out_meshes, made


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
            err = max(err, float(np.max(np.linalg.norm(A[no['src']] - B, axis=1))))
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
    if not bsdf:  # (cryptids4) an unlit (emission) material: its one texture
        return next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
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


def pad(a, it=24, thr=0.03):
    """grow the texture's islands out over its (near-black) background, `it` pixels"""
    rgb = a[..., :3].copy()
    m = (rgb.max(-1) > thr).astype(np.float32)
    if m.mean() > 0.995:
        return a
    for _ in range(it):
        s = np.zeros_like(rgb); c = np.zeros(m.shape, np.float32)
        for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s += np.roll(rgb * m[..., None], d, (0, 1)); c += np.roll(m, d, (0, 1))
        fill = (m == 0) & (c > 0)
        if not fill.any():
            break
        rgb[fill] = s[fill] / c[fill][..., None]; m[fill] = 1
    out = a.copy(); out[..., :3] = rgb
    return out


def save_png(arr, path, name, alpha=True):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def atlas(objs, layout, size, out_dir, name, rough=None, shine=None, normals=True, recolor=None):
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
            a = pad(a)  # (cryptids4) bleed island colours over the black background: decimated seams sample it
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
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(next(l for l in me.uv_layers if l != uvl))
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
        export_optimize_animation_size=False, export_def_bones=False, export_skins=True, export_all_influences=False,
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
