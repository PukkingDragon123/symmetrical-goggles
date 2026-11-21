# BUSHED's logging truck (public/assets/vehicles/truck.glb + truck.json), built from the author's own
# taxi pipeline (หลอนยันปลายทาง, tools/blender): the taxi's front half becomes the cab of an old 70s/80s
# pickup on a lift, and truck_parts.py adds the flatbed, log bunks and stakes, headache rack, winch
# bumper, roof light bar, mud flaps and big all-terrain tyres. weather.py paints it (faded cream over
# forest green, mud, rust, matte steel), then the whole model is mirrored front-to-back so it faces
# three.js +Z with the driver on the left (Canada: left-hand drive, driving on the right).
#
#   blender -b --factory-startup -P tools/blender/truck/build_truck.py -- [--nobake] [--size 2048]
#           [--samples 4] [--ao 8] [--out public/assets/vehicles] [--blend path.blend]
#
# Frames: built in the taxi's Blender frame (X = driver side, Y forward, Z up). Three.js coordinates
# of a point built at (x, y, z) are simply (x, z, y): +X is the truck's left, +Z its front.
import os
import sys
import time
import math
import json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
BUSHED = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix
import vlib
from vlib import log, join, delete, duplicate, set_origin, parent_keep, empty, assign_mat, mat
import taxi_body as tb
import truck_parts as kp

tb.ARCH_FZ = kp.R - kp.LIFT          # front arches concentric with the big tyres on the lift
tb.ARCH_FR = 0.455
import taxi_exterior as te
import taxi_parts as tp
import taxi_interior as ti
import weather

ATLASES = ['ext_paint', 'ext_parts', 'int_hard', 'int_soft']
LIFT, Y_CUT = kp.LIFT, kp.Y_CUT
COLORS = {'yellow': (0.80, 0.74, 0.60), 'green': (0.13, 0.25, 0.17)}   # upper: faded cream, lower: forest green

DROP_X = ['trunk', 'bumper_r', 'light_tail_l', 'light_tail_r', 'light_brake', 'light_reverse', 'light_ind_rl',
          'light_ind_rr', 'tail_unit_l', 'tail_unit_r', 'plate_rear', 'plate_rear_holder', 'plate_front',
          'plate_front_holder', 'roof_sign', 'roof_sign_base', 'fuel_flap', 'fuel_filler', 'glass_rear', 'seal_rw',
          'garnish', 'band_back', 'rband_back', 'mud_flaps', 'exhaust', 'wheel_fl', 'wheel_fr', 'wheel_rl',
          'wheel_rr', 'handle_rl', 'handle_rr', 'divbar_l', 'divbar_r']
DROP_IN = ['rear_bench', 'parcel_shelf', 'meter_box', 'meter_display', 'vacant_frame', 'vacant_lamp', 'bead_cover',
           'window_crank_rl', 'window_crank_rr', 'radio_display']

DECIMATE = {'grille': 0.45, 'underbody': 0.4, 'seal_ws': 0.5, 'drip_l': 0.45, 'drip_r': 0.45, 'floor': 0.5,
            'steering_wheel': 0.6, 'seat_driver': 0.38, 'seat_pass': 0.38, 'doorcard_fl': 0.5,
            'doorcard_fr': 0.5, 'doorcard_rl': 0.5, 'doorcard_rr': 0.5, 'pillar_trims': 0.55, 'glovebox_lid': 0.7,
            'seat_belts': 0.5, 'light_head_l': 0.7, 'light_head_r': 0.7, 'headlamp_unit_l': 0.55,
            'headlamp_unit_r': 0.55, 'body': 0.62, 'bumper_inserts': 0.45, 'wiper_l': 0.5,
            'wiper_r': 0.5, 'dash': 0.7, 'cluster': 0.6, 'headliner': 0.6, 'centre_stack': 0.5, 'console': 0.5,
            'roof_trim': 0.4, 'sun_visor_driver': 0.5, 'sun_visor_pass': 0.5, 'rearview_mirror': 0.6}
KEEP = {'door_fl', 'door_fr', 'hood', 'glass_windshield'}


def parse_args():
    a = vlib.args_after_dashes()
    opt = dict(bake=True, size=2048, samples=4, ao=8, out=os.path.join(BUSHED, 'public', 'assets', 'vehicles'),
               blend=None)
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--nobake':
            opt['bake'] = False
        elif k in ('--size', '--samples', '--ao'):
            opt[k[2:]] = int(a[i + 1]); i += 1
        elif k in ('--out', '--blend'):
            opt[k[2:]] = a[i + 1]; i += 1
        i += 1
    return opt


def rrect(x0, y0, x1, y1, r, seg=6):
    out = []
    for p in vlib.rounded_rect_2d(x0, y0, x1, y1, r, seg):
        if not out or abs(p[0] - out[-1][0]) > 1e-7 or abs(p[1] - out[-1][1]) > 1e-7:
            out.append(p)
    if abs(out[0][0] - out[-1][0]) < 1e-7 and abs(out[0][1] - out[-1][1]) < 1e-7:
        out.pop()
    return out


def centroid(ob):
    vs = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
    return vs.mean(axis=0)


def bbox(ob):
    vs = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
    return vs.min(0), vs.max(0)


def bisect_keep_front(ob, y):
    """Cut a mesh at the plane Y = y and keep the part in front (the cab)."""
    lo, hi = bbox(ob)
    if lo[1] >= y:
        return ob
    if hi[1] <= y:
        delete(ob)
        return None
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(0, y, 0), plane_no=(0, 1, 0), clear_inner=True)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    if len(ob.data.polygons) == 0:
        delete(ob)
        return None
    return ob


def lift(ob):
    vlib.apply_transform(ob)
    ob.data.transform(Matrix.Translation((0, 0, LIFT)))
    ob.data.update()


def back_wall(outer):
    """Close the cut cab with a back wall that follows the shell's section, plus a rear window."""
    tmp = join([duplicate(o, o.name + '_ray') for o in outer], name='ray_tmp')
    bvh = vlib.bvh_of(tmp)
    y = Y_CUT + 0.006
    C = Vector((0.0, y, 1.08))
    pts = []
    for k in range(180):
        a = 2 * math.pi * k / 180
        d = Vector((math.cos(a), 0.0, math.sin(a)))
        hit = bvh.ray_cast(C + d * 1.6, -d, 1.6)
        if hit[0] is not None:
            p = hit[0]
            pts.append((p.x, p.z))
    delete(tmp)
    P = np.array(pts)
    # light smoothing and a 3 mm inset toward the centre
    Ps = (np.roll(P, 1, 0) + 2 * P + np.roll(P, -1, 0)) / 4
    c = np.array([0.0, 1.08])
    v = Ps - c
    Ps = c + v * (1 - 0.003 / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 0.05))
    loop = [tuple(p) for p in Ps]
    wall = vlib.extrude_outline('back_wall', loop, Y_CUT - 0.032, Y_CUT + 0.003, plane='XZ', bevel_w=0.005)
    zb = 0.868 + LIFT
    # rear window: rounded rect under the roof line
    ztop = min(p[1] for p in loop if abs(p[0]) < 0.2) - 0.11
    win = rrect(-0.50, zb + 0.07, 0.50, ztop, 0.06, 6)
    cutter = vlib.extrude_outline('rw_cut', win, Y_CUT - 0.1, Y_CUT + 0.1, plane='XZ')
    vlib.boolean(wall, cutter, op='DIFFERENCE')
    delete(cutter)
    vlib.set_mats(wall, ['paint_green', 'paint_yellow', 'plastic_trim'])
    for f in wall.data.polygons:
        f.material_index = 2 if f.normal.y > 0.5 else (1 if f.center.z > zb else 0)
    # glass + seal
    gl = [(x, Y_CUT - 0.014, z) for x, z in rrect(-0.512, zb + 0.058, 0.512, ztop + 0.012, 0.07, 6)]
    glass = vlib.new_mesh_obj('glass_rear', gl, [tuple(range(len(gl)))[::-1]], smooth=False)
    assign_mat(glass, 'glass')
    path = [(x, Y_CUT - 0.034, z) for x, z in rrect(-0.505, zb + 0.065, 0.505, ztop + 0.005, 0.065, 6)]
    seal = vlib.sweep('seal_rear', path, vlib.circle_profile(0.008, 6), closed_path=True, smooth=True)
    assign_mat(seal, 'rubber')
    return wall, glass, seal


def mirror_y(ob):
    """Mirror a mesh front-to-back in world space, keeping its exact custom normals."""
    vlib.apply_transform(ob)
    me = ob.data
    nl, npo = len(me.loops), len(me.polygons)
    if nl == 0:
        return
    cn = np.empty(nl * 3, np.float32)
    me.corner_normals.foreach_get('vector', cn)
    cn = cn.reshape(-1, 3)
    cn[:, 1] *= -1
    lv = np.empty(nl, np.int32)
    me.loops.foreach_get('vertex_index', lv)
    tot = np.empty(npo, np.int32)
    me.polygons.foreach_get('loop_total', tot)
    pol = np.repeat(np.arange(npo), tot)
    key = {(int(p), int(v)): i for i, (p, v) in enumerate(zip(pol, lv))}
    me.transform(Matrix.Diagonal((1.0, -1.0, 1.0, 1.0)))
    me.flip_normals()
    lv2 = np.empty(nl, np.int32)
    me.loops.foreach_get('vertex_index', lv2)
    tot2 = np.empty(npo, np.int32)
    me.polygons.foreach_get('loop_total', tot2)
    pol2 = np.repeat(np.arange(npo), tot2)
    out = cn[[key[(int(p), int(v))] for p, v in zip(pol2, lv2)]]
    me.normals_split_custom_set([tuple(n) for n in out])
    me.update()


def to_three(p):
    """Build-frame point -> three.js (x, z, y)."""
    return [round(float(p[0]), 4), round(float(p[2]), 4), round(float(p[1]), 4)]


def main():
    opt = parse_args()
    t0 = time.time()
    vlib.reset_scene()
    E = te.Ext()
    E.build()
    P = tp.Parts(E)
    P.build()
    I = ti.Interior(E, P)
    I.build()
    log('taxi built', round(time.time() - t0, 1))
    X = dict(E.objs)
    X.update(P.objs)
    IN = dict(I.objs)
    for k in DROP_X:
        if k in X:
            delete(X.pop(k))
    for k in DROP_IN:
        if k in IN:
            delete(IN.pop(k))
    handles = [tuple(centroid(X[f'handle_f{s}']) + np.array([0, 0, LIFT])) for s in ('l', 'r')]
    # ---- cut the cab behind the seats, lift it --------------------------------------------
    for D in (X, IN):
        for k in list(D):
            o = D[k]
            if o.type != 'MESH':
                continue
            o2 = bisect_keep_front(o, Y_CUT)
            if o2 is None:
                D.pop(k)
            else:
                lift(o2)
    log('cut + lifted', round(time.time() - t0, 1), len(X), len(IN))
    outer = [X[k] for k in ('body', 'door_rl', 'door_rr', 'glass_rl', 'glass_rr', 'underbody') if k in X]
    wall, glass_rear, seal_rear = back_wall(outer)
    X['back_wall'], X['glass_rear'], X['seal_rear'] = wall, glass_rear, seal_rear
    # ---- the truck parts ---------------------------------------------------------------------
    K = kp.TruckParts()
    K.build()
    log('truck parts', round(time.time() - t0, 1))
    # ---- budget -----------------------------------------------------------------------------
    for D in (X, IN):
        for name, o in D.items():
            if o.type != 'MESH' or name in KEEP or name.startswith(('glass_', 'needle_', 'gauge_', 'mirror_')):
                continue
            r = DECIMATE.get(name)
            if r is None:
                n = vlib.tri_count(o)
                r = (0.4 if D is IN else 0.5) if n > 700 else None
            if r:
                m = o.modifiers.new('Dec', 'DECIMATE')
                m.decimate_type = 'COLLAPSE'
                m.ratio = r
                m.use_collapse_triangulate = True
                vlib.apply_modifiers(o)
                if o.data.has_custom_normals:
                    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                        bpy.ops.mesh.customdata_custom_splitnormals_clear()
                o.data.shade_smooth()
                vlib.set_sharp_by_angle(o, 38)
    # ---- named nodes (final names: +X = left) ---------------------------------------------------
    N = {}
    side_name = {'l': 'r', 'r': 'l'}   # the taxi's l/r (it faced +Y) swap once it faces three's +Z
    for s in ('l', 'r'):
        f = side_name[s]
        parts = [X.pop(k) for k in (f'door_f{s}', f'sash_f{s}', f'beltstrip_f{s}', f'handle_f{s}', f'moulding_f{s}',
                                    f'keyhole_f{s}', f'sail_{s}', f'mirror_housing_{s}') if k in X]
        parts += [IN.pop(k) for k in (f'doorcard_f{s}',) if k in IN]
        N['door_' + f] = join(parts, name='door_' + f)
        N['glass_door_' + f] = X.pop(f'glass_f{s}')
        N['mirror_side_' + f] = X.pop('mirror_left_surface' if s == 'l' else 'mirror_right_surface')
        if f'window_crank_f{s}' in IN:
            N['crank_' + f] = IN.pop(f'window_crank_f{s}')
    hood_inner = duplicate(X['hood'], 'hood_inner')
    bm = bmesh.new()
    bm.from_mesh(hood_inner.data)
    bm.normal_update()
    for v in bm.verts:
        v.co -= v.normal * 0.022
    for f in bm.faces:
        f.normal_flip()
    bm.to_mesh(hood_inner.data)
    bm.free()
    if hood_inner.data.has_custom_normals:
        with bpy.context.temp_override(object=hood_inner, active_object=hood_inner, selected_objects=[hood_inner]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    assign_mat(hood_inner, 'paint_black')
    N['hood'] = join([X.pop('hood'), hood_inner], name='hood')
    N['glass_windshield'] = X.pop('glass_windshield')
    N['glass'] = join([X.pop(k) for k in ('glass_rear', 'glass_rl', 'glass_rr', 'glass_ql', 'glass_qr') if k in X],
                      name='glass')
    for s in ('l', 'r'):
        f = side_name[s]
        N['light_head_' + f] = X.pop('light_head_' + s)
        N['light_ind_f' + f] = X.pop('light_ind_f' + s)
    for k in ('light_tail_l', 'light_tail_r', 'light_ind_rl', 'light_ind_rr', 'light_reverse', 'light_bar',
              'light_work', 'bumper_front', 'winch_drum', 'plate_rear', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'):
        N[k] = K.objs.pop(k)
    N['bed'] = join([K.objs.pop(k) for k in ('deck', 'deck_steel', 'bunks', 'headache_rack', 'work_lamps')], name='bed')
    N['chassis'] = K.objs.pop('axles')
    for k in ('steering_wheel', 'needle_speedo', 'needle_tacho', 'needle_fuel', 'needle_temp'):
        if k in IN:
            N[k] = IN.pop(k)
    N['body'] = join([o for o in X.values()] + [o for o in K.objs.values()], name='body')
    N['interior'] = join([o for o in IN.values()], name='interior')
    for nm, ob in N.items():
        ob.name = nm
        ob.data.name = nm
        for vg in list(ob.vertex_groups):
            ob.vertex_groups.remove(vg)
        vlib.apply_transform(ob)
        if ob.data.validate(clean_customdata=False):
            log('validated (fixed)', nm)
    meshes = list(N.values())
    tris = {o.name: vlib.tri_count(o) for o in meshes}
    log('TRIS total', sum(tris.values()), sorted(tris.items(), key=lambda x: -x[1])[:10])
    # ---- atlases + painted bake (in the build frame, before the mirror) -------------------------
    for o in [o for o in bpy.data.objects if o.name.startswith('master_')]:
        delete(o)
    out = opt['out']
    os.makedirs(out, exist_ok=True)
    tex_dir = os.path.join(weather.SHOTS, 'truck-bake')
    for a in ATLASES:
        vlib.atlas_unwrap(meshes, a, margin=0.003)
    files = {}
    if opt['bake']:
        glass_like = [o for o in meshes if all((m is None) or (m.get('atlas', '') == '') for m in o.data.materials)]
        for o in glass_like:
            o.hide_render = True
        ctx = weather.Ctx(
            kind='truck', axles=[(kp.AXF, kp.R), (kp.AXR, kp.R)], arch_r=tb.ARCH_FR, handles=handles,
            seat_centres=[(0.37, -0.14, 0.52 + LIFT), (-0.37, -0.14, 0.52 + LIFT), (0.37, -0.42, 0.82 + LIFT),
                          (-0.37, -0.42, 0.82 + LIFT)],
            heel=(0.40, 0.62), dash=(0.40, 0.95, 0.78), length=5.4, colors=COLORS, z_off=LIFT, wheel_r=kp.R)
        files, _lod = weather.bake_all([o for o in meshes if o not in glass_like], ATLASES, ctx, size=opt['size'],
                                       samples=opt['samples'], ao_samples=opt['ao'], out_dir=tex_dir,
                                       sizes={'int_soft': opt['size'] // 4, 'int_hard': opt['size'] // 2,
                                              'ext_parts': opt['size']})
        for o in glass_like:
            o.hide_render = False
        log('baked', round(time.time() - t0, 1))
    used = weather.remap_export(meshes)
    log('export materials', used)
    # ---- anchors + metadata (three.js coordinates) ----------------------------------------------
    A = {}
    A['driverEye'] = (0.372, -0.30, 1.215 + LIFT)
    A['steeringWheel'] = tuple(np.array(I.anchor['steeringWheel']) + np.array([0, 0, LIFT]))
    for f in ('l', 'r'):
        A['headlight' + f.upper()] = tuple(centroid(N['light_head_' + f]))
        A['taillight' + f.upper()] = tuple(centroid(N['light_tail_' + f]))
    A['hood'] = (0.0, 1.60, tb.T_hood(0, 1.6) + LIFT)
    A['exhaust'] = K.exhaust_tip
    A['winch'] = K.winch_pt
    A['lightBar'] = tuple(centroid(N['light_bar']))
    A['workLights'] = tuple(centroid(N['light_work']))
    A['plate'] = tuple(centroid(N['plate_rear']))
    steer_axis = I.pivots['steering_wheel'][1]
    piv = {
        'wheel_fl': (centroid(N['wheel_fl']), (1, 0, 0)), 'wheel_fr': (centroid(N['wheel_fr']), (1, 0, 0)),
        'wheel_rl': (centroid(N['wheel_rl']), (1, 0, 0)), 'wheel_rr': (centroid(N['wheel_rr']), (1, 0, 0)),
        'steering_wheel': (Vector(I.pivots['steering_wheel'][0]) + Vector((0, 0, LIFT)), steer_axis),
        'door_l': ((0.800, 0.805, 0.60 + LIFT), (0, 0, 1)), 'door_r': ((-0.800, 0.805, 0.60 + LIFT), (0, 0, -1)),
        'hood': ((0.0, 1.034, tb.T_hood(0, 1.034) - 0.01 + LIFT), (1, 0, 0)),
        'winch_drum': ((0.0, 2.245, 0.78), (1, 0, 0)),
        'bumper_front': ((0.0, 2.10, 0.62), (1, 0, 0)),
    }
    for nm in ('needle_speedo', 'needle_tacho', 'needle_fuel', 'needle_temp'):
        if nm in N and nm in I.pivots:
            p, ax = I.pivots[nm][0], I.pivots[nm][1]
            piv[nm] = (Vector(p) + Vector((0, 0, LIFT)), ax)
    meta = {
        'name': 'Logging truck', 'file': 'assets/vehicles/truck.glb', 'generator': 'tools/blender/truck/build_truck.py',
        'frontAxis': '+z', 'leftAxis': '+x', 'up': '+y', 'driverSide': '+x (left-hand drive)',
        'wheelRadius': kp.R, 'wheelWidth': kp.TW, 'wheelbase': kp.AXF - kp.AXR, 'track': kp.TRACK,
        'axleFront': kp.AXF, 'axleRear': kp.AXR, 'lift': LIFT,
        'size': [round(2 * kp.DECK['x'], 3), 1.88, round(2.40 - kp.DECK['y1'], 3)],
        'bed': {'x': kp.DECK['x'], 'z0': kp.DECK['y1'], 'z1': kp.DECK['y0'], 'deckY': kp.DECK['top'],
                'bunkY': kp.BUNK_TOP, 'bunks': list(kp.BUNK_Y), 'stakeX': kp.STAKE_X, 'stakeTop': kp.STAKE_TOP},
        'anchors': {k: to_three(v) for k, v in A.items()},
        'pivots': {k: {'pos': to_three(p), 'axis': to_three(a)} for k, (p, a) in piv.items()},
        'notes': 'Pivot axes are line directions in three.js space; the steering wheel turns about pivots.steering_wheel.axis '
                 '(sign checked in game). Wheels spin about local +X (+ = rolling forward). Lights: light_head_l/r, '
                 'light_ind_fl/fr/rl/rr, light_tail_l/r (tail + brake), light_reverse, light_bar (roof), light_work (rack).',
    }
    # ---- mirror front-to-back (faces three +Z, driver on the left) ------------------------------
    for o in meshes:
        mirror_y(o)
    for nm, (p, ax) in piv.items():
        if nm in N:
            set_origin(N[nm], (p[0], -p[1], p[2]))
    root = empty('truck', (0, 0, 0))
    root['contract'] = 'tools/blender/truck/build_truck.py (see truck.json)'
    child_of = {'glass_door_l': 'door_l', 'glass_door_r': 'door_r', 'mirror_side_l': 'door_l', 'mirror_side_r': 'door_r',
                'crank_l': 'door_l', 'crank_r': 'door_r', 'winch_drum': 'bumper_front'}
    for nm in ('body', 'chassis', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'):
        parent_keep(N[nm], root)
    for nm in sorted(N, key=lambda n: n in child_of):
        if nm in ('body', 'chassis') or nm.startswith('wheel_'):
            continue
        parent_keep(N[nm], N[child_of.get(nm, 'body')])
    glb = os.path.join(out, 'truck.glb')
    vlib.export_glb(glb, [root] + meshes)
    weather.inject_textures(glb, files, {'paint': 'ext_paint', 'chrome': 'ext_parts', 'rubber_black': 'ext_parts',
                                         'lens': 'ext_parts', 'wood': 'ext_parts', 'steel': 'ext_parts',
                                         'plastic_dash': 'int_hard', 'fabric_carpet': 'int_hard',
                                         'vinyl_seat': 'int_soft'},
                            extras={'generator': 'tools/blender/truck/build_truck.py', 'tris': int(sum(tris.values()))})
    meta['tris'] = int(sum(tris.values()))
    with open(os.path.join(out, 'truck.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    if opt['blend']:
        bpy.ops.wm.save_as_mainfile(filepath=opt['blend'])
    log('exported', glb, os.path.getsize(glb) // 1024, 'KB', 'tris', meta['tris'], 'time', round(time.time() - t0, 1))


if __name__ == '__main__':
    main()
