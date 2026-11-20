# THE HODAG, low-poly pass: a realistic swamp brute kitbashed from real models, ~3.5k faceted triangles, its detail
# baked into one texture. Parts:
#   body, legs, tail, head and its grin of teeth: "Animated Baurusuchus" (Anees Animates, CC-BY 4.0), a land
#     crocodyliform: thickened, a shoulder hump raised, the snout shortened and widened, re-skinned to the hodag's
#     procedural rig (src/creatures/cryptids/hodag.ts drives it: IK legs, gait, bellow, gore...)
#   horns: Poly Haven "Bull Head" (CC0), cut from the bust by their colour
#   keeled bone plates down the back and tail, the three-bladed tail spear, the yellow throat sac, the tongue and the
#     small dark bead eyes: made here
# The rig is the hodag's own bone list (root chest neck head jaw sac tongue eyeL eyeR hips tail0..4 fu/fl/ff hu/hl/hf
# L/R), placed on the source's joints; the glb carries no clips (the game animates it).
#   (download) <dl>/bauru/bauru.glb and <dl>/bull_head/bull_head_2k.gltf (build.sh fetches both)
#   blender -b --python tools/blender/lowpoly/hodag.py -- <dl>
import bpy, bmesh, math, os, sys, time
import numpy as np
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lowkit as L
C, K = L.C, L.K4

T0 = time.time()
DL = K.args()[0]
LENGTH = 2.9        # m, snout to tail tip (before the spear)
TRIS = 3000         # the body; the horns, plates, sac, tongue and beads add ~600
TEX = 1024

C.reset()
arm, meshes, fps = C.load(os.path.join(DL, 'bauru', 'bauru.glb'))
K.still_parents()
# the bind pose: a clean, symmetric standing pose (+Y up, +Z forward in the source's frame)
# ...but its mouth gapes: the jaw takes the (closed) pose of the source's first frame
JAWB = [C.find_bone(arm, n) for n in ('Bone.014', 'Bone.018', 'Bone.020', 'Bone.019', 'Bone.021')]
arm.animation_data.action = bpy.data.actions[0]; C.set_frame(0)
closed = {n: arm.pose.bones[n].matrix_basis.copy() for n in JAWB}
# the upper jaw (Bone.013) comes down most of the way: lips just apart, the teeth showing (the grin); fully shut they
# touch, weld together and the decimator tears the head apart
u = C.find_bone(arm, 'Bone.013')
closed[u] = Quaternion().slerp(arm.pose.bones[u].matrix_basis.to_quaternion(), 0.8).to_matrix().to_4x4()
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis = closed.get(pb.name, Matrix.Identity(4))
bpy.context.view_layer.update()
PB = lambda n: arm.matrix_world @ arm.pose.bones[C.find_bone(arm, n)].head  # noqa: E731

# ---------------------------------------------------------------------------------- the transform to game space
# (Blender: forward -Y, up +Z; the glTF export turns that into the game's +Z forward, +Y up)
lo, hi = K.extent(meshes)
s = LENGTH / (hi.z - lo.z)
mid = (PB('Bone.L.010') + PB('Bone.R.010') + PB('Bone.L') + PB('Bone.R')) / 4  # the body's centre of support
T = Matrix.Scale(s, 4) @ Matrix.Rotation(math.radians(90), 4, 'X') @ Matrix.Translation(Vector((-mid.x, -lo.y, -mid.z)))
G = lambda n: T @ PB(n)  # noqa: E731
print('SCALE', round(s, 4))

# ---------------------------------------------------------------------------------- one static mesh in game space
dg = bpy.context.evaluated_depsgraph_get()
parts = []
for o in meshes:
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    MW = T @ o.matrix_world
    co = [MW @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    d = o.data.copy()
    for v, c in zip(d.vertices, co):
        v.co = c
    no = bpy.data.objects.new(o.name + '_s', d); bpy.context.scene.collection.objects.link(no)
    for g in o.vertex_groups:
        no.vertex_groups.new(name=g.name)
    parts.append(no)
body = C.join(parts, 'body')
K.weld(body, 0.0006)
L.outward(body)
print('BODY tris', L.tris(body))

# ---------------------------------------------------------------------------------- the hodag's bones on the source joints
SRC = {  # hodag bone <- source bones whose weights it takes (the first one places it)
    'root': ['Bone.001', 'Bone.015', 'Bone.016'], 'chest': ['Bone.002'], 'neck': ['Bone.004', 'Bone.003', 'Bone.017'],
    'head': ['Bone.012', 'Bone.013'], 'jaw': ['Bone.014', 'Bone.018', 'Bone.020', 'Bone.019', 'Bone.021'],
    'hips': ['Bone', 'Bone.005'],
    'tail0': ['Bone.006'], 'tail1': ['Bone.007'], 'tail2': ['Bone.008'], 'tail3': ['Bone.009'], 'tail4': ['Bone.010', 'Bone.011'],
}
for s_, k in (('L', 'L'), ('R', 'R')):
    SRC['fu' + s_] = [f'Bone.{k}.010']; SRC['fl' + s_] = [f'Bone.{k}.011', f'Bone.{k}.019']
    SRC['ff' + s_] = [f'Bone.{k}.0{n}' for n in (12, 13, 14, 15, 16, 17, 18)]
    SRC['hu' + s_] = [f'Bone.{k}']; SRC['hl' + s_] = [f'Bone.{k}.001', f'Bone.{k}.006']
    SRC['hf' + s_] = [f'Bone.{k}.00{n}' for n in (2, 3, 4, 5, 7, 8, 9)]
POS = {b: G(src[0]) for b, src in SRC.items()}
for k in ('ffL', 'ffR', 'hfL', 'hfR'):  # the ankle joints sit a little up off the sole
    POS[k] = POS[k] + Vector((0, 0, 0.035))
# the source's group names carry '_NN' suffixes: map them
gmap = {}
for b, src in SRC.items():
    for sn in src:
        gmap[C.find_bone(arm, sn)] = b
print('BONES', {b: tuple(round(x, 3) for x in p) for b, p in POS.items()})

# weights: every source group onto its hodag bone (anything unmapped goes to the nearest mapped ancestor)
src_names = {g.index: g.name for g in body.vertex_groups}
anc = {}
for b in arm.data.bones:
    x = b
    while x and x.name not in gmap:
        x = x.parent
    anc[b.name] = gmap[x.name] if x else 'root'
W = {}
for v in body.data.vertices:
    acc = {}
    for g in v.groups:
        n = src_names.get(g.group)
        if n is None or g.weight <= 0:
            continue
        hb = anc.get(n, 'root')
        acc[hb] = acc.get(hb, 0) + g.weight
    W[v.index] = acc
for g in list(body.vertex_groups):
    body.vertex_groups.remove(g)
VG = {}
for vi, acc in W.items():
    for hb, w in acc.items():
        if hb not in VG:
            VG[hb] = body.vertex_groups.new(name=hb)
        VG[hb].add([vi], min(1.0, w), 'REPLACE')


def weight_of(o, name):
    g = o.vertex_groups.get(name)
    out = np.zeros(len(o.data.vertices), np.float32)
    if g:
        for v in o.data.vertices:
            for x in v.groups:
                if x.group == g.index:
                    out[v.index] = x.weight
    return out


# ---------------------------------------------------------------------------------- reshape: a squat, humped brute
co = np.array([tuple(v.co) for v in body.data.vertices])
wt = {b: weight_of(body, b) for b in ('root', 'chest', 'hips', 'neck', 'head', 'jaw')}
trunk = np.clip(wt['root'] + wt['chest'] + wt['hips'] + 0.6 * wt['neck'], 0, 1)
spine_z = co[:, 2] * 0 + np.interp(co[:, 1], [POS['hips'].y, POS['chest'].y], [POS['hips'].z, POS['chest'].z])
# thicker and deeper through the barrel
co[:, 0] += co[:, 0] * 0.32 * trunk
co[:, 2] += (co[:, 2] - spine_z) * 0.18 * trunk
# the hump over the shoulders (the back rises toward the neck)
up = np.clip((co[:, 2] - spine_z) / 0.25, 0, 1)
hump = np.exp(-((co[:, 1] - (POS['chest'].y - 0.05)) / 0.28) ** 2) * up * trunk
co[:, 2] += 0.12 * hump
# a broader, shorter muzzle: in front of the skull joint, pulled back and widened
hd = wt['head'] + wt['jaw']
eye_y = POS['head'].y - 0.12  # (forward is -y)
ahead = np.clip((eye_y - co[:, 1]) / 0.2, 0, 1) * hd
co[:, 1] += (eye_y - co[:, 1]) * 0.22 * ahead * -1 * -1
co[:, 0] += co[:, 0] * 0.18 * hd
for v, c in zip(body.data.vertices, co):
    v.co = c
body.data.update()

# ---------------------------------------------------------------------------------- the eyes: beads over the source's yellow ones
img_eyes = K.eyes_by_colour(body, lambda c: c[0] > 0.5 and c[1] > 0.4 and c[2] < 0.25,
                            where=lambda q: (q - POS['head']).length < 0.4)
print('EYES', [(tuple(round(x, 3) for x in c), round(r, 4)) for c, r in img_eyes])
if len(img_eyes) != 2:
    raise SystemExit('eyes not found')
emid = (img_eyes[0][0] + img_eyes[1][0]) / 2
beads = K.bead_eyes([(c + (c - emid).normalized() * 0.004, 0.017) for c, r in img_eyes], 'beads', seg=8, rings=6)
for p in beads.data.polygons:
    p.use_smooth = True
for c, r in img_eyes:
    POS['eyeL' if c.x > 0 else 'eyeR'] = c.copy()

# ---------------------------------------------------------------------------------- kitbash: the bull's horns
hp = os.path.join(DL, 'bull_head', 'bull_head_2k.gltf')
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=hp)
bull = next(o for o in set(bpy.data.objects) - before if o.type == 'MESH')
bimg = C.base_image(bull.material_slots[0].material)
Wd, Hd = bimg.size
px = np.empty(Wd * Hd * 4, np.float32); bimg.pixels.foreach_get(px); px = px.reshape(Hd, Wd, 4)
bm = bmesh.new(); bm.from_mesh(bull.data); uvl = bm.loops.layers.uv.active
kill = []
for fc in bm.faces:
    cs = [px[min(Hd - 1, int(l[uvl].uv.y * Hd)), min(Wd - 1, int(l[uvl].uv.x * Wd)), :3] for l in fc.loops]
    if np.mean(cs) < 0.16:  # the bronze head, not the pale horns (linear values)
        kill.append(fc)
bmesh.ops.delete(bm, geom=kill, context='FACES')
# keep the two biggest pieces (the horns)
bm.verts.ensure_lookup_table()
seen, comps = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    st, comp = [v], []
    seen.add(v.index)
    while st:
        x = st.pop(); comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index); st.append(y)
    comps.append(comp)
comps.sort(key=len, reverse=True)
keepv = set(v.index for c in comps[:2] for v in c)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keepv], context='VERTS')
bm.to_mesh(bull.data); bm.free()
bull.data.update()
print('HORNS verts', len(bull.data.vertices), 'pieces', [len(c) for c in comps[:4]])
# place them: the bust's horns span its head; scale them to the hodag's skull and set them behind the brow
hlo, hhi = K.extent([bull])
hc = (hlo + hhi) / 2
skull_w = 0.30
k = skull_w * 1.9 / (hhi.x - hlo.x)
bull.matrix_world = Matrix.Translation(POS['head'] + Vector((0, 0.05, 0.045))) @ Matrix.Rotation(math.radians(180), 4, 'Z') @ \
    Matrix.Scale(k, 4) @ Matrix.Translation(-Vector((hc.x, hc.y, hlo.z)))
bpy.ops.object.select_all(action='DESELECT'); bull.select_set(True); bpy.context.view_layer.objects.active = bull
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bull.name = 'horns'
for p in bull.data.polygons:
    p.use_smooth = True


# ---------------------------------------------------------------------------------- made here: plates, spear, sac, tongue
def blade(bm, base, tip, w, d, keel=(0, 1, 0), sides=4):
    """a keeled blade: a 4-sided pyramid from a rhombic base (w across, d along `keel`) to a tip"""
    ax = (tip - base).normalized()
    kv = Vector(keel); kv = (kv - ax * ax.dot(kv)).normalized()
    sv = ax.cross(kv).normalized()
    ring = [bm.verts.new(base + kv * d * 0.5), bm.verts.new(base + sv * w * 0.5), bm.verts.new(base - kv * d * 0.5), bm.verts.new(base - sv * w * 0.5)]
    t = bm.verts.new(tip)
    for i in range(4):
        bm.faces.new((ring[i], ring[(i + 1) % 4], t))
    bm.faces.new(list(reversed(ring)))


def surface_top(x, y, objs=(body,)):
    """the body's top surface height at (x, y) (ray down)"""
    best = None
    for o in objs:
        ok, loc, n, i = o.ray_cast(Vector((x, y, 3.0)), Vector((0, 0, -1)))
        if ok and (best is None or loc.z > best):
            best = loc.z
    return best


pl = bmesh.new()
plate_bones = []
ys = np.linspace(POS['chest'].y - 0.08, POS['tail2'].y, 15)
for i, y in enumerate(ys):
    z = surface_top(0.0, float(y))
    if z is None:
        continue
    t = i / (len(ys) - 1)
    h = (0.16 + 0.07 * math.sin(min(1, t * 1.6) * math.pi)) * (1 - 0.65 * t) * (0.85 + 0.3 * ((i * 7919) % 13) / 13)
    base = Vector((0, float(y), z - 0.02))
    blade(pl, base, base + Vector((0, h * 0.55, h)), 0.035, h * 0.75, keel=(0, 1, 0))
# the three-bladed spear past the tail tip
tip = G('Bone.011') + (G('Bone.011') - G('Bone.010')).normalized() * 0.02
dirn = (G('Bone.011') - G('Bone.010')).normalized()
blade(pl, tip - dirn * 0.03, tip + dirn * 0.2, 0.025, 0.11, keel=(0, 0, 1))
for side in (1, -1):
    out = (dirn + Vector((side * 0.9, 0, 0))).normalized()
    blade(pl, tip - dirn * 0.02, tip + out * 0.13 + dirn * 0.03, 0.02, 0.08, keel=(0, 0, 1))
pm = bpy.data.meshes.new('plates'); pl.to_mesh(pm); pl.free()
plates = bpy.data.objects.new('plates', pm); bpy.context.scene.collection.objects.link(plates)

# the throat sac: a wrinkled ellipsoid hung under the jaw hinge (it swells when the hodag bellows)
jaw_back = POS['jaw']
sac_c = jaw_back + Vector((0, 0.06, -0.10))
sb = bmesh.new()
bmesh.ops.create_uvsphere(sb, u_segments=10, v_segments=7, radius=1.0)
for v in sb.verts:
    n = v.co.copy()
    wob = 1 + 0.06 * math.sin(n.x * 9) * math.sin(n.y * 7 + 1) + 0.05 * math.sin(n.z * 11)
    v.co = Vector((n.x * 0.075, n.y * 0.09, n.z * 0.055)) * wob + sac_c
sm = bpy.data.meshes.new('sac'); sb.to_mesh(sm); sb.free()
sac = bpy.data.objects.new('sac', sm); bpy.context.scene.collection.objects.link(sac)
POS['sac'] = sac_c + Vector((0, 0, 0.045))
# the tongue: a flat tapered slab on the floor of the mouth, from the jaw hinge forward
tg = bmesh.new()
tb = POS['jaw'] + Vector((0, -0.02, 0.03))
fwd = (POS['head'] - POS['neck']); fwd.z = 0; fwd.normalize()
L0 = 0.22
q = [tb + Vector((x, 0, z)) for x, z in ((-0.035, 0), (0.035, 0), (0.035, 0.018), (-0.035, 0.018))]
r = [tb + fwd * L0 + Vector((x, 0, z)) for x, z in ((-0.02, 0.002), (0.02, 0.002), (0.02, 0.014), (-0.02, 0.014))]
V0 = [tg.verts.new(p) for p in q]; V1 = [tg.verts.new(p) for p in r]
for i in range(4):
    tg.faces.new((V0[i], V0[(i + 1) % 4], V1[(i + 1) % 4], V1[i]))
tg.faces.new(list(reversed(V0))); tg.faces.new(V1)
tm = bpy.data.meshes.new('tongue'); tg.to_mesh(tm); tg.free()
tongue = bpy.data.objects.new('tongue', tm); bpy.context.scene.collection.objects.link(tongue)
POS['tongue'] = tb

# materials for the made parts (the paint pass recolours them by part)
for o, nm in ((plates, 'Plate'), (sac, 'Sac'), (tongue, 'Tongue'), (bull, 'Horn')):
    m = bpy.data.materials.new(nm); m.use_nodes = True
    o.data.materials.clear(); o.data.materials.append(m)
beads.data.materials.clear(); beads.data.materials.append(K.bead_material())

# ---------------------------------------------------------------------------------- the armature
ORDER = ['root', 'chest', 'neck', 'head', 'jaw', 'sac', 'tongue', 'eyeL', 'eyeR', 'hips', 'tail0', 'tail1', 'tail2', 'tail3', 'tail4',
         'fuL', 'flL', 'ffL', 'fuR', 'flR', 'ffR', 'huL', 'hlL', 'hfL', 'huR', 'hlR', 'hfR']
PARENT = {'root': None, 'chest': 'root', 'neck': 'chest', 'head': 'neck', 'jaw': 'head', 'sac': 'jaw', 'tongue': 'jaw', 'eyeL': 'head',
          'eyeR': 'head', 'hips': 'root', 'tail0': 'hips', 'tail1': 'tail0', 'tail2': 'tail1', 'tail3': 'tail2', 'tail4': 'tail3'}
for s_ in 'LR':
    PARENT.update({'fu' + s_: 'chest', 'fl' + s_: 'fu' + s_, 'ff' + s_: 'fl' + s_, 'hu' + s_: 'hips', 'hl' + s_: 'hu' + s_, 'hf' + s_: 'hl' + s_})
ad = bpy.data.armatures.new('hodag'); ao = bpy.data.objects.new('hodag', ad); bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao
bpy.ops.object.mode_set(mode='EDIT')
for b in ORDER:
    eb = ad.edit_bones.new(b); eb.head = POS[b]; eb.tail = POS[b] + Vector((0, 0, 0.05))
    if PARENT[b]:
        eb.parent = ad.edit_bones[PARENT[b]]
bpy.ops.object.mode_set(mode='OBJECT')


def rigid(o, bone):
    o.vertex_groups.clear()
    g = o.vertex_groups.new(name=bone); g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')


rigid(sac, 'sac'); rigid(tongue, 'tongue'); rigid(bull, 'head')
# beads: each to its own eye bone
beads.vertex_groups.clear()
gl, gr = beads.vertex_groups.new(name='eyeL'), beads.vertex_groups.new(name='eyeR')
for v in beads.data.vertices:
    (gl if v.co.x > 0 else gr).add([v.index], 1.0, 'REPLACE')
# plates: to the nearest spine bone along the body (the spear blades to tail4)
spine = ['chest', 'root', 'hips', 'tail0', 'tail1', 'tail2', 'tail3', 'tail4']
plates.vertex_groups.clear()
gs = {b: plates.vertex_groups.new(name=b) for b in spine}
for v in plates.data.vertices:
    yy = v.co.y
    best = min(spine, key=lambda b: abs(POS[b].y - yy) if b not in ('chest',) else abs(POS[b].y - yy) + 0.02)
    gs[best].add([v.index], 1.0, 'REPLACE')
for o in (body, sac, tongue, bull, beads, plates):
    o.parent = ao
    md = o.modifiers.new('Armature', 'ARMATURE'); md.object = ao
C.limit_weights(body, 4)

# ---------------------------------------------------------------------------------- high and low
for p in body.data.polygons:
    p.use_smooth = True
HEAD = ['head', 'jaw']
low_body = L.lowpoly([body], TRIS, 'hodag', protect=(HEAD, 0.7), weld=0.001)
low_horns = L.lowpoly([bull], 240, 'horns')
lp = L._copy_join([plates], 'lplates'); ls = L._copy_join([sac], 'lsac'); lt = L._copy_join([tongue], 'ltongue')
lb = L._copy_join([beads], 'lbeads')
for o in (lp, ls, lt):
    for p in o.data.polygons:
        p.use_smooth = False
low = C.join([low_body, low_horns, lp, ls, lt, lb], 'hodag_mesh')
L.unwrap(low, boost={'head': 2.2, 'jaw': 2.2})
highs = [body, bull, plates, sac, tongue, beads]
M = L.bake_maps(low, highs, TEX, extrude=0.02, ray=0.08)
print(f'BAKED {time.time() - T0:.0f}s')


# ---------------------------------------------------------------------------------- paint
def paint(M):
    P, N, base = M['pos'], M['nrm'], M['base']
    part = M['part']
    srgb = L.to_srgb(base)
    lum = srgb.mean(-1)
    sat = srgb.max(-1) - srgb.min(-1)
    # the source's pale belly (low saturation, bright) vs its orange back
    belly = L.smooth(lum - sat * 1.4, 0.25, 0.5)
    detail = np.clip(lum / (L.fbm(P, 0.25, 2, 3) * 0.0 + 0.55), 0.4, 1.6)
    back_col = np.array([0.30, 0.31, 0.17])     # dark olive
    flank_col = np.array([0.40, 0.27, 0.16])    # umber
    belly_col = np.array([0.70, 0.58, 0.36])    # straw
    side = L.smooth(-N[..., 1], -0.2, 0.5)      # facing down-ish: the flanks warm to umber
    col = back_col * (1 - side[..., None]) + flank_col * side[..., None]
    col = col * (1 - belly[..., None]) + belly_col * belly[..., None]
    col = col * detail[..., None]
    # croc banding across the back (keeps the source's dark bands, adds its own)
    band = (np.sin(P[..., 2] * 2 * math.pi / 0.22 + L.fbm(P, 0.15, 2, 9) * 3) > 0.55) & (N[..., 1] > 0.1)
    col[band & (belly < 0.5)] *= 0.62
    # mottling, a darker face mask, mud on the feet and the belly
    col *= (0.85 + 0.3 * L.fbm(P, 0.09, 3, 4))[..., None]
    face = np.exp(-np.sum(((P - np.array(L.H_EYE)) / np.array([0.2, 0.12, 0.16])) ** 2, -1))
    col *= (1 - 0.35 * face)[..., None]
    mud = L.smooth(-P[..., 1], -0.16, -0.05) * (L.fbm(P, 0.06, 2, 11) > 0.42)
    col = col * (1 - 0.8 * mud[..., None]) + np.array([0.09, 0.065, 0.04]) * 0.8 * mud[..., None]
    # old scars: a few pale slashes on the flanks
    for k in range(5):
        rs = np.random.RandomState(40 + k)
        c0 = np.array([rs.choice([-1, 1]) * 0.2, 0.35 + rs.rand() * 0.15, -0.3 + rs.rand() * 0.7])
        dvec = np.array([0, rs.rand() - 0.3, 1.0]); dvec /= np.linalg.norm(dvec)
        q = P - c0
        along = q @ dvec
        perp = np.linalg.norm(q - along[..., None] * dvec, axis=-1)
        sc = (np.abs(along) < 0.07 + rs.rand() * 0.05) & (perp < 0.012) & (np.sign(P[..., 0]) == np.sign(c0[0]))
        col[sc] = col[sc] * 0.5 + np.array([0.55, 0.45, 0.33]) * 0.5
    # the teeth and the mouth stay the source's (bright, unsaturated: teeth; red: gums)
    teeth = (lum > 0.6) & (sat < 0.25) & (np.linalg.norm(P - np.array(L.H_EYE), axis=-1) < 0.45)
    col[teeth] = srgb[teeth] * np.array([1.0, 0.95, 0.82])
    rgb = L.to_linear(np.clip(col, 0, 1))
    # the made parts
    names = M['parts']
    pidx = {n: i for i, n in enumerate(names)}

    def where(n):
        return part == pidx[n] if n in pidx else np.zeros(part.shape, bool)
    bone = np.array([0.80, 0.72, 0.55]) ** 2.2
    for n in ('Plate', 'Horn'):
        m = where(n)
        rings = 0.85 + 0.15 * np.sin(P[..., 1][m] * 160 + P[..., 2][m] * 40)
        tipk = np.clip((P[..., 1][m] - P[..., 1][m].min()) / max(1e-3, np.ptp(P[..., 1][m])), 0, 1)
        rgb[m] = bone * (0.55 + 0.45 * tipk)[..., None] * rings[..., None]
    m = where('Sac')
    vein = L.fbm(P, 0.03, 2, 21)
    rgb[m] = (np.array([0.95, 0.75, 0.15]) ** 2.2) * (0.75 + 0.25 * (vein[m] < 0.6))[..., None]
    m = where('Tongue')
    rgb[m] = np.array([0.62, 0.25, 0.27]) ** 2.2
    m = where('BeadEye')
    rgb[m] = np.array([0.012, 0.009, 0.007])
    return rgb


L.H_EYE = tuple(((img_eyes[0][0] + img_eyes[1][0]) / 2).to_tuple())
L.H_EYE = (L.H_EYE[0], L.H_EYE[2], -L.H_EYE[1])
col = L.finish(M, paint=paint, ao_k=0.6, cav_k=2.2)
mat = L.save_material('hodag', col, M['shine'])
L.apply_material(low, mat)
C.limit_weights(low, 4)
for o in highs:
    bpy.data.objects.remove(o, do_unlink=True)
n = L.tris(low)
out = os.path.join(K.OUT, 'hodag.glb')
ao.animation_data_create()
C.export(ao, low, out, [])
L.write_meta('hodag', {'tris': n, 'tex': TEX, 'bones': ORDER, 'seconds': round(time.time() - T0)})
print(f'DONE hodag {n} tris in {time.time() - T0:.0f}s')
