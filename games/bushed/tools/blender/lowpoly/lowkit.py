# The LOW-POLY pass for BUSHED's monsters (see README.md): a realistic creature, kept at a deliberately low triangle
# count with clean faceted silhouettes, its high-poly detail baked into one texture that the game shows with nearest
# filtering (so it reads as finely painted pixel art up close, like the rest of the game).
#
#   import lowkit as L; low = L.lowpoly(highs, tris=2400, protect={'head': 0.7})   # a decimated copy of the (rebaked, skinned) high meshes
#   unwrap(low, boost={'spine_006': 2.5})                    # fresh UVs; the head gets 2.5x the texel density
#   M = bake_maps(low, highs, 1024)                          # base colour, AO, cavity, eye shine, position, normal
#   col = finish(M, paint=my_paint)                          # the final colour: base x AO x cavity (+ painted detail)
#   mat = save_material(col, M['shine'], ...)                # <name>_col.png + <name>_sd.png -> one material
# then export with ../cryptids4/common.py (C.export). Blender 4.2, headless.
#
# M's arrays are (H, W, C) float32, rows bottom-up (Blender's pixel order); colours are LINEAR (paint in linear, or
# convert with to_srgb / to_linear). M['pos'] holds each texel's position in
# GAME space (metres, x left, y up, z forward) and M['nrm'] its smooth normal (game space), so a creature script can
# paint anatomy-aware detail in numpy: bands down the back, a pale belly, mottling, scars, lip lines.
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
BUILD = os.path.join(HERE, '_build')
sys.path.insert(0, os.path.join(HERE, '..', 'cryptids4'))
import common as C  # noqa: E402  (the shared rebake / atlas / export pipeline)
import kit as K4     # noqa: E402


def outward(o):
    """recalculate face normals outward (sources and decimators leave some flipped: they bake and shade black)"""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(o.data); bm.free()


def tris(o):
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def _copy_join(objs, name):
    sc = bpy.context.scene
    cs = []
    for o in objs:
        c = o.copy(); c.data = o.data.copy(); sc.collection.objects.link(c)
        if c.data.shape_keys:
            c.shape_key_clear()
        cs.append(c)
    return C.join(cs, name)


def head_group(o, bones, name='protect', strength=1.0):
    """a vertex group: the summed weight of `bones` per vertex (0..1), times strength"""
    g = o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
    idx = {o.vertex_groups[b].index for b in bones if b in o.vertex_groups}
    for v in o.data.vertices:
        w = min(1.0, sum(x.weight for x in v.groups if x.group in idx)) * strength
        if w > 0:
            g.add([v.index], w, 'REPLACE')
    return g.name


def lowpoly(highs, tris_target, name, protect=None, weld=0.0015):
    """a decimated, skinned copy of the high meshes (joined, seams welded) at about `tris_target` triangles.
    protect: ({bone names}, strength 0..0.95): those bones' vertices are decimated less (the head, the paws): the
    decimator divides a collapse's cost by the summed (inverted) weights of its two vertices, so at 0.75 a head edge
    costs 4x a body edge (at 1.0 the head would never collapse at all)."""
    base = _copy_join(highs, name + '_low_src')
    K4.weld(base, weld)
    n0 = tris(base)
    grp = head_group(base, protect[0], strength=min(0.95, protect[1])) if protect else None
    lo_r, hi_r, best = 0.0, 1.0, None
    r = min(1.0, tris_target / max(1, n0))
    for _ in range(7):
        c = _copy_join([base], name + '_try')
        if r < 0.999:
            bpy.ops.object.select_all(action='DESELECT'); c.select_set(True); bpy.context.view_layer.objects.active = c
            d = c.modifiers.new('dec', 'DECIMATE'); d.ratio = r; d.use_collapse_triangulate = True
            if grp:
                d.vertex_group = grp; d.invert_vertex_group = True; d.vertex_group_factor = 1.0
            bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
            bpy.ops.object.modifier_apply(modifier='dec')
        n = tris(c)
        if best is None or abs(n - tris_target) < abs(tris(best) - tris_target):
            if best is not None:
                bpy.data.objects.remove(best, do_unlink=True)
            best = c
        else:
            bpy.data.objects.remove(c, do_unlink=True)
        if abs(n - tris_target) < tris_target * 0.04 or r >= 0.999:
            break
        if n > tris_target:
            hi_r = r
        else:
            lo_r = r
        r = (lo_r + hi_r) / 2 if hi_r < 1.0 or lo_r > 0 else r * tris_target / n
    bpy.data.objects.remove(base, do_unlink=True)
    best.name = name + '_low'
    outward(best)
    for p in best.data.polygons:
        p.use_smooth = False  # faceted
    print(f'LOWPOLY {name}: {n0} -> {tris(best)} tris')
    return best


def unwrap(low, boost=None, angle=66, margin=0.004):
    """fresh UVs (smart project, packed). boost: {bone: k}: faces on that bone get k x the texel density (by
    unwrapping them scaled up k times in place)"""
    me = low.data
    saved = None
    if boost:
        saved = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', saved)
        co = saved.reshape(-1, 3).copy()
        for b, k in boost.items():
            g = low.vertex_groups.get(b)
            if not g:
                print('UNWRAP: no group', b); continue
            gi = g.index
            w = np.zeros(len(me.vertices), np.float32)
            for v in me.vertices:
                for x in v.groups:
                    if x.group == gi:
                        w[v.index] = x.weight
            sel = w > 0.5
            if not sel.any():
                continue
            c = co[sel].mean(0)
            co[sel] = c + (co[sel] - c) * k
        me.vertices.foreach_set('co', co.ravel())
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    if saved is not None:
        me.vertices.foreach_set('co', saved)
        me.update()


# ------------------------------------------------------------------------------------------------ baking
def _img(name, size, float_buffer=True):
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    return bpy.data.images.new(name, size, size, alpha=True, float_buffer=float_buffer)


def _px(img):
    W, H = img.size
    a = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(a)
    return a.reshape(H, W, 4)


def _emit_mat(name, build):
    """a material whose surface is an Emission shader; build(nt, emission_input) wires its colour"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    build(nt, em.inputs['Color'])
    return m


def _base_emit(src):
    """an emission copy of a material showing its base colour"""
    img = C.base_image(src)
    col = None
    if img is None and src and src.use_nodes:
        b = next((n for n in src.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        col = tuple(b.inputs['Base Color'].default_value) if b else (0.5, 0.5, 0.5, 1)

    def build(nt, inp):
        if img is not None:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; t.interpolation = 'Closest'
            nt.links.new(t.outputs['Color'], inp)
        else:
            inp.default_value = col or (0.5, 0.5, 0.5, 1)
    return _emit_mat('bk_base_' + (src.name if src else 'none'), build)


def _swap(objs, fn):
    """give every slot of objs a bake material fn(original material); returns the originals to restore"""
    keep = []
    for o in objs:
        mats = [s.material for s in o.material_slots]
        keep.append((o, mats))
        for i, s in enumerate(o.material_slots):
            s.material = fn(mats[i])
    return keep


def _restore(keep):
    for o, mats in keep:
        for i, s in enumerate(o.material_slots):
            s.material = mats[i]


def bake_maps(low, highs, size, extrude=0.02, ao_samples=32, shine_mats=('BeadEye',), ray=0.06, pose=None):
    """bake onto low's UVs: base (rgb), ao (r), cav (r: 0.5 flat, < concave, > convex), shine (r), pos (game xyz),
    nrm (game xyz, the low's, smoothed), valid (bool: texels the low covers). Colour, AO and cavity are baked at the
    armature's rest pose; pos and nrm at pose = (action, frame) when the rest pose is not the creature standing in
    game space (a rebake whose rest is the source's bind pose: the cryptids4 / fauna rigs)"""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    arms = {a for a in (o.find_armature() for o in [low] + list(highs)) if a}
    for a in arms:  # colour, AO and cavity at the bind pose: low and high agree best there (their weights differ)
        a.data.pose_position = 'REST'
    sc.render.bake.margin = 4; sc.render.bake.margin_type = 'EXTEND'
    # the low's bake target
    tgt = bpy.data.materials.new('bk_target'); tgt.use_nodes = True
    tn = tgt.node_tree.nodes.new('ShaderNodeTexImage'); tgt.node_tree.nodes.active = tn
    low.data.materials.clear(); low.data.materials.append(tgt)
    out = {}

    def run(kind, img, sel_to_active=True, samples=1, **kw):
        tn.image = img
        sc.cycles.samples = samples
        bpy.ops.object.select_all(action='DESELECT')
        if sel_to_active:
            for h in highs:
                h.select_set(True)
        low.select_set(True); bpy.context.view_layer.objects.active = low
        bpy.ops.object.bake(type=kind, use_selected_to_active=sel_to_active, cage_extrusion=extrude,
                            max_ray_distance=ray if sel_to_active else 0.0, margin=4, target='IMAGE_TEXTURES', **kw)
        return _px(img)

    # base colour
    keep = _swap(highs, _base_emit)
    out['base'] = run('EMIT', _img('bk_base', size))[..., :3]
    _restore(keep)
    # eye shine mask
    white = _emit_mat('bk_white', lambda nt, i: setattr(i, 'default_value', (1, 1, 1, 1)))
    black = _emit_mat('bk_black', lambda nt, i: setattr(i, 'default_value', (0, 0, 0, 1)))
    keep = _swap(highs, lambda m: white if (m and m.name in shine_mats) else black)
    out['shine'] = run('EMIT', _img('bk_shine', size))[..., 0]
    _restore(keep)
    # which high material each texel shows: M['part'] indexes M['parts'] (material names)
    names = sorted({sl.material.name for h in highs for sl in h.material_slots if sl.material})
    idm = {n: _emit_mat('bk_id_' + n, lambda nt, i, k=k: setattr(i, 'default_value', ((k + 1) / (len(names) + 1), 0, 0, 1)))
           for k, n in enumerate(names)}
    keep = _swap(highs, lambda m: idm[m.name] if m else black)
    pid = run('EMIT', _img('bk_part', size))[..., 0]
    _restore(keep)
    out['part'] = np.clip(np.round(pid * (len(names) + 1)).astype(np.int32) - 1, -1, len(names) - 1)
    out['parts'] = names
    # cavity: Cycles' pointiness of the high surface

    def cav(nt, inp):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        nt.links.new(g.outputs['Pointiness'], inp)
    cm = _emit_mat('bk_cav', cav)
    keep = _swap(highs, lambda m: cm)
    out['cav'] = run('EMIT', _img('bk_cav', size))[..., 0]
    _restore(keep)
    # ambient occlusion
    out['ao'] = run('AO', _img('bk_ao', size), samples=ao_samples)[..., 0]
    # position and normal for painting: the low's own, standing (pose), smooth-shaded for the normal
    for a in arms:
        a.data.pose_position = 'POSE'
        if pose:
            a.animation_data_create(); a.animation_data.action = pose[0]; C.set_frame(pose[1])
    flat = [p.use_smooth for p in low.data.polygons]
    for p in low.data.polygons:
        p.use_smooth = True
    n = run('NORMAL', _img('bk_nrm', size), sel_to_active=False, normal_space='OBJECT')[..., :3] * 2 - 1
    for p, f in zip(low.data.polygons, flat):
        p.use_smooth = f
    out['nrm'] = np.stack([n[..., 0], n[..., 2], -n[..., 1]], -1)
    # (object space: Blender x, y, z -> game x, z, -y); the position, encoded 0..1 over the low's bounding box
    bpy.context.view_layer.update()
    lo, hi = K4.extent([low])
    span = max(hi - lo)

    def pos(nt, inp):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = tuple(lo)
        mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'SCALE'; mul.inputs['Scale'].default_value = 1.0 / span
        nt.links.new(g.outputs['Position'], sub.inputs[0]); nt.links.new(sub.outputs['Vector'], mul.inputs[0])
        nt.links.new(mul.outputs['Vector'], inp)
    pm = _emit_mat('bk_pos', pos)
    low.data.materials.clear(); low.data.materials.append(pm)
    pm.node_tree.nodes.active = None
    pt = pm.node_tree.nodes.new('ShaderNodeTexImage'); pm.node_tree.nodes.active = pt
    tn = pt
    p = run('EMIT', _img('bk_pos', size), sel_to_active=False)[..., :3] * span + np.array(tuple(lo))
    out['pos'] = np.stack([p[..., 0], p[..., 2], -p[..., 1]], -1)
    # which texels the low's faces cover (no margin)
    wm = _emit_mat('bk_valid', lambda nt, i: setattr(i, 'default_value', (1, 1, 1, 1)))
    low.data.materials.clear(); low.data.materials.append(wm)
    vt = wm.node_tree.nodes.new('ShaderNodeTexImage'); wm.node_tree.nodes.active = vt
    tn = vt
    sc.render.bake.margin = 0
    tn.image = _img('bk_valid', size)
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type='EMIT', use_selected_to_active=False, margin=0, target='IMAGE_TEXTURES')
    out['valid'] = _px(tn.image)[..., 0] > 0.5
    sc.render.bake.margin = 4
    low.data.materials.clear()
    for a in arms:
        a.data.pose_position = 'POSE'
        if pose:
            a.animation_data.action = None
    return out


# ------------------------------------------------------------------------------------------------ paint helpers (numpy)
def vnoise(p, scale, seed=0):
    """smooth 3D value noise 0..1 at points p (..., 3) metres, cells of `scale` m"""
    q = p / scale + seed * 17.13
    i = np.floor(q).astype(np.int64); f = q - i
    f = f * f * (3 - 2 * f)

    def h(ix, iy, iz):
        n = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
        n = (n ^ (n >> 13)) * 1274126177
        return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0
    x, y, z = i[..., 0], i[..., 1], i[..., 2]
    fx, fy, fz = f[..., 0], f[..., 1], f[..., 2]
    c = [[[h(x + a, y + b, z + cc) for cc in (0, 1)] for b in (0, 1)] for a in (0, 1)]
    l = lambda a, b, t: a + (b - a) * t  # noqa: E731
    return l(l(l(c[0][0][0], c[0][0][1], fz), l(c[0][1][0], c[0][1][1], fz), fy),
             l(l(c[1][0][0], c[1][0][1], fz), l(c[1][1][0], c[1][1][1], fz), fy), fx)


def fbm(p, scale, oct=3, seed=0):
    s, a, t = 0.0, 1.0, 0.0
    for k in range(oct):
        s = s + vnoise(p, scale / 2 ** k, seed + k) * a; t += a; a *= 0.5
    return s / t


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def finish(M, paint=None, ao_k=0.55, cav_k=1.6, levels=None):
    """the final colour: base (or paint(M)) darkened by AO and cavity, with convex edges lifted a touch; optional
    posterising to `levels` steps per channel (a hint of the pixel look)"""
    rgb = paint(M) if paint else M['base'].copy()
    ao = np.clip(M['ao'], 0, 1)
    cv = np.clip((M['cav'] - 0.5) * cav_k, -0.35, 0.25)
    rgb = rgb * (1 - ao_k + ao_k * ao)[..., None] * (1 + cv)[..., None]
    rgb = np.clip(rgb, 0, 1)
    if levels:
        rgb = np.round(rgb * levels) / levels
    return rgb


def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def to_linear(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.04045, x / 12.92, np.power((x + 0.055) / 1.055, 2.4))


def save_material(name, rgb, shine, rough=0.88, rough_eye=0.12, out_dir=BUILD, extra_rough=None):
    """<name>_col.png and <name>_sd.png (R eye shine, G roughness, B metalness 0) -> one material. rgb is LINEAR
    (as baked); it is written as sRGB."""
    H, W = rgb.shape[:2]
    col = np.ones((H, W, 4), np.float32); col[..., :3] = to_srgb(rgb)
    sd = np.zeros((H, W, 4), np.float32); sd[..., 3] = 1
    s = np.clip(shine, 0, 1)
    sd[..., 0] = s
    g = np.full((H, W), rough, np.float32) if extra_rough is None else extra_rough
    sd[..., 1] = g * (1 - s) + rough_eye * s
    os.makedirs(out_dir, exist_ok=True)
    ci = C.save_png(col, os.path.join(out_dir, name + '_col.png'), name + '_col')
    si = C.save_png(sd, os.path.join(out_dir, name + '_sd.png'), name + '_sd', alpha=False)
    si.colorspace_settings.name = 'Non-Color'
    return C.make_material(name, ci, si, None, False)


def apply_material(o, mat):
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in o.data.polygons:
        p.material_index = 0


def write_meta(name, meta):
    os.makedirs(BUILD, exist_ok=True)
    C.write_meta(os.path.join(BUILD, name + '.json'), meta)
