# Shared Blender helpers for the BUSHED birds and bugs (games/bushed/tools/blender/birds_bugs).
#   import a downloaded glTF, rebuild a lean armature from the bones worth keeping (weights of the dropped bones merge
#   into their nearest kept ancestor; every clip is re-baked onto the lean rig with world-space copy constraints),
#   decimate, shrink the texture, turn the model to face +Z (glTF), and export one .glb with named clips.
# Blender 4.2, headless: blender -b --python <script>.py -- <args>
import bpy, bmesh, math, os, re, mathutils


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 24


def import_gltf(path):
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)


def base(name):
    """Bone names from Sketchfab carry node indices ('Head_011'); strip them."""
    return re.sub(r'_\d+$', '', name)


def armature():
    return next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')


def skinned_meshes(arm):
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)]


def select_only(objs, active=None):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def lean_rig(old, keep, clips, name='Rig', extra=None):
    """Build a new armature holding only bones whose base name is in `keep` (plus a root), re-bake `clips`
    {new_name: (old_action_substring, frame_start|None, frame_end|None)} onto it and move every skinned mesh over.
    `extra(new_arm, old_arm)` may add authored clips while both rigs exist. Returns the new armature."""
    scn = bpy.context.scene
    old_bones = {b.name: b for b in old.data.bones}
    kept = [b.name for b in old.data.bones if base(b.name) in keep]
    kept_set = set(kept)

    def kept_ancestor(bname):
        b = old_bones[bname].parent
        while b is not None and b.name not in kept_set:
            b = b.parent
        return b.name if b else None

    # merge the weights of every dropped bone into its nearest kept ancestor
    for me in skinned_meshes(old):
        vg = me.vertex_groups
        target = {}
        for g in vg:
            if g.name in kept_set or g.name not in old_bones:
                continue
            a = g.name
            while a is not None and a not in kept_set:
                p = old_bones[a].parent
                a = p.name if p else None
            target[g.index] = a
        idx = {g.name: g.index for g in vg}
        for k in kept:
            if k not in idx:
                idx[k] = vg.new(name=k).index
        for v in me.data.vertices:
            add = {}
            for ge in v.groups:
                t = target.get(ge.group)
                if t and ge.weight > 0:
                    add[t] = add.get(t, 0) + ge.weight
            for t, w in add.items():
                gi = idx[t]
                cur = 0.0
                for ge in v.groups:
                    if ge.group == gi:
                        cur = ge.weight
                vg[gi].add([v.index], min(1.0, cur + w), 'REPLACE')
        for gi in sorted(target.keys(), reverse=True):
            vg.remove(vg[gi])

    # new armature in world space (identity object transform)
    ad = bpy.data.armatures.new(name)
    new = bpy.data.objects.new(name, ad)
    scn.collection.objects.link(new)
    select_only([new])
    bpy.ops.object.mode_set(mode='EDIT')
    mw = old.matrix_world
    for bn in kept:
        ob = old_bones[bn]
        eb = ad.edit_bones.new(bn)
        eb.head = mw @ ob.head_local
        eb.tail = mw @ ob.tail_local
        if (eb.tail - eb.head).length < 1e-5:
            eb.tail = eb.head + mathutils.Vector((0, 0, 0.005))
        # roll: carry the old bone's local z axis over
        z = (mw.to_3x3() @ ob.matrix_local.to_3x3() @ mathutils.Vector((0, 0, 1))).normalized()
        eb.align_roll(z)
    for bn in kept:
        pa = kept_ancestor(bn)
        if pa:
            ad.edit_bones[bn].parent = ad.edit_bones[pa]
    bpy.ops.object.mode_set(mode='OBJECT')

    # bake each clip through world-space Copy Transforms
    for pb in new.pose.bones:
        # location and rotation only: the source rig's object scale must not leak into the bones
        for kind in ('COPY_LOCATION', 'COPY_ROTATION'):
            c = pb.constraints.new(kind)
            c.target = old
            c.subtarget = pb.name
    old.animation_data_create()
    new.animation_data_create()
    made = {}
    for cname, (sub, f0, f1) in clips.items():
        src = next((a for a in bpy.data.actions if sub.lower() in a.name.lower() and not a.name.startswith('baked:')), None)
        if not src:
            print('[lean_rig] no action for', cname, sub)
            continue
        old.animation_data.action = src
        a0, a1 = (int(round(x)) for x in src.frame_range)
        a0 = a0 if f0 is None else f0
        a1 = a1 if f1 is None else f1
        select_only([new])
        bpy.ops.object.mode_set(mode='POSE')
        bpy.ops.pose.select_all(action='SELECT')
        new.animation_data.action = None
        bpy.ops.nla.bake(frame_start=a0, frame_end=a1, step=1, only_selected=True, visual_keying=True,
                         clear_constraints=False, use_current_action=False, bake_types={'POSE'})
        bpy.ops.object.mode_set(mode='OBJECT')
        act = new.animation_data.action
        act.name = 'baked:' + cname
        act.use_fake_user = True
        # shift to start at frame 0
        if a0:
            for fc in act.fcurves:
                for k in fc.keyframe_points:
                    k.co.x -= a0; k.handle_left.x -= a0; k.handle_right.x -= a0
        made[cname] = act
        new.animation_data.action = None
    if extra:
        extra(new, old, made)
    for pb in new.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    for pb in new.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    # meshes onto the new rig (vertices into world space)
    for me in skinned_meshes(old):
        w = me.matrix_world.copy()
        me.parent = None
        me.matrix_world = w
        select_only([me])
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for m in me.modifiers:
            if m.type == 'ARMATURE':
                m.object = new
        me.parent = new
    # drop the old rig and its actions
    for a in list(bpy.data.actions):
        if not a.name.startswith('baked:'):
            bpy.data.actions.remove(a)
    bpy.data.objects.remove(old, do_unlink=True)
    for a in made.values():
        a.name = a.name[len('baked:'):]
    return new


def pose_clip(arm, name, src_action, frame, length=12):
    """A held pose (e.g. a glide) as a two-key clip, sampled from another clip at `frame`."""
    arm.animation_data.action = src_action
    bpy.context.scene.frame_set(frame)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    act.id_root = 'OBJECT'
    for pb in arm.pose.bones:
        for f in (0, length):
            for i in range(4):
                fc = act.fcurves.find(f'pose.bones["{pb.name}"].rotation_quaternion', index=i) or act.fcurves.new(f'pose.bones["{pb.name}"].rotation_quaternion', index=i, action_group=pb.name)
                fc.keyframe_points.insert(f, pb.rotation_quaternion[i])
            for i in range(3):
                for ch in ('location', 'scale'):
                    fc = act.fcurves.find(f'pose.bones["{pb.name}"].{ch}', index=i) or act.fcurves.new(f'pose.bones["{pb.name}"].{ch}', index=i, action_group=pb.name)
                    fc.keyframe_points.insert(f, getattr(pb, ch)[i])
    arm.animation_data.action = None
    return act


def decimate(me, tris):
    me.data.calc_loop_triangles()
    n = len(me.data.loop_triangles)
    if n <= tris:
        return n
    select_only([me])
    m = me.modifiers.new('dec', 'DECIMATE')
    m.ratio = tris / n
    m.use_collapse_triangulate = True
    while me.modifiers[0] != m:
        bpy.ops.object.modifier_move_up(modifier=m.name)
    bpy.ops.object.modifier_apply(modifier=m.name)
    me.data.calc_loop_triangles()
    return len(me.data.loop_triangles)


def limit_weights(me, n=4):
    select_only([me])
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=n)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def base_color_image():
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for l in n.inputs['Base Color'].links:
                    if l.from_node.type == 'TEX_IMAGE':
                        return l.from_node
    return None


def set_base_color(path):
    """Swap the base colour texture for the image at `path` (and drop every other image)."""
    node = base_color_image()
    img = bpy.data.images.load(path)
    old = node.image
    node.image = img
    for i in list(bpy.data.images):
        if i != img:
            bpy.data.images.remove(i)
    return img


def shrink_images(size):
    for img in bpy.data.images:
        if img.size[0] > size or img.size[1] > size:
            w, h = img.size
            k = size / max(w, h)
            img.scale(max(1, int(w * k)), max(1, int(h * k)))


def drop_normal_maps():
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type == 'NORMAL_MAP':
                for l in list(n.outputs[0].links):
                    nt.links.remove(l)
                for l in list(n.inputs['Color'].links):
                    src = l.from_node
                    nt.nodes.remove(src)
                nt.nodes.remove(n)


def face_plus_z_from(arm, action, front, back, frame=0):
    """Measure where the model faces in `action` (bone `front` ahead of bone `back`) and turn the rig so it faces
    glTF +Z (Blender -Y)."""
    arm.animation_data_create()
    arm.animation_data.action = action
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    pb = {C_base(b.name): b for b in arm.pose.bones}
    f = arm.matrix_world @ pb[front].head - arm.matrix_world @ pb[back].head
    yaw = math.atan2(f.y, f.x)          # current heading in the XY plane
    arm.rotation_euler = (0, 0, -math.pi / 2 - yaw)
    arm.animation_data.action = None
    print('[face] heading was', round(math.degrees(yaw)), 'deg; turned by', round(math.degrees(-math.pi / 2 - yaw)))


def C_base(n):
    return base(n)


def face_plus_z(arm, forward_blender='+Y'):
    """Turn the rig so the model faces glTF +Z (Blender -Y)."""
    if forward_blender == '+Y':
        arm.rotation_euler = (0, 0, math.pi)
    elif forward_blender == '+X':
        arm.rotation_euler = (0, 0, -math.pi / 2)
    elif forward_blender == '-X':
        arm.rotation_euler = (0, 0, math.pi / 2)


def push_actions_to_nla(arm):
    arm.animation_data_create()
    for a in bpy.data.actions:
        tr = arm.animation_data.nla_tracks.new()
        tr.name = a.name
        st = tr.strips.new(a.name, int(a.frame_range[0]), a)
        tr.mute = True
    arm.animation_data.action = None


def export_glb(path, objs, image_format='AUTO'):
    select_only(objs)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_optimize_animation_size=True, export_skins=True, export_all_influences=False,
        export_morph=False, export_yup=True, export_image_format=image_format, export_texcoords=True,
        export_normals=True, export_tangents=False, export_materials='EXPORT', export_cameras=False,
        export_lights=False, export_def_bones=False, export_extras=False)
    print('[export]', path, os.path.getsize(path) // 1024, 'KB')


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            o.data.calc_loop_triangles(); n += len(o.data.loop_triangles)
    return n


def fill_gutters(img, iters=24, dark=0.03):
    """Scans and decimated meshes sample outside their UV islands: grow every island's colour over the black
    background so stretched triangles never pick up black."""
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
    a = px.reshape(h, w, 4)
    m = a[..., :3].sum(-1) > dark
    for _ in range(iters):
        acc = np.zeros_like(a); cnt = np.zeros((h, w), np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(a, dy, 0), dx, 1); sm = np.roll(np.roll(m, dy, 0), dx, 1)
            acc[sm] += sh[sm]; cnt[sm] += 1
        g = (~m) & (cnt > 0)
        if not g.any():
            break
        a[g] = acc[g] / cnt[g][:, None]
        m = m | g
    img.pixels.foreach_set(a.ravel())
    img.update()


def save_image(img, path, fmt='JPEG', quality=90):
    """Write an edited image to `path` and point the datablock at it, so the glTF exporter embeds the edit (it
    copies an image's source file when it has one)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.filepath_raw = path
    img.file_format = fmt
    bpy.context.scene.render.image_settings.quality = quality
    img.save()
    img.reload()
