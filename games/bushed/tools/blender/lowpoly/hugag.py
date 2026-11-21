# HUGAG (Cox 1910): a moose-sized brute with no joints in its legs, a long overhanging upper lip, big floppy ears
# and a wrinkled, corrugated hide. It cannot lie down, so it sleeps leaning on a tree. Built from the game's own
# WildMesh moose cow (Moose Animated Cel Shading, CC-BY 4.0, public/assets/models/creatures/moose/cow.glb): scaled up
# 1.3x, the upper lip pulled out into a drooping trunk of a lip, ears enlarged and flopped, the lower legs thickened
# into pillars; decimated to ~3.2k faceted triangles with the detail (folds, mud, a pale lip) baked and painted in.
#   blender -b --python tools/blender/lowpoly/hugag.py
import bpy, os, sys, time
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import newfour as N  # noqa: E402
L, C, K = N.L, N.C, N.K

T0 = time.time()
NAME, SIZE, TRIS, TEX = 'hugag', 1.3, 3200, 1024

arm, meshes, fps, A = N.load_fauna('moose/cow.glb')
bind = N.bind_action(arm)
body = meshes[0]
BODY = body.name
# small dark bead eyes where the moose's painted ones are (found on a head render: high on the head, in the sockets)
beads = K.bead_eyes([(Vector((0.03 + s * 0.094, -1.488, 1.482)), 0.017) for s in (1, -1)], 'beads', seg=8, rings=6)
keep = K.auto_keep(arm, [body])
T = Matrix.Scale(SIZE, 4)
clips = [
    dict(name='idle', action=A['idle']),
    dict(name='look', action=A['alert']),
    dict(name='browse', action=A['graze']),
    dict(name='walk', action=A['walk'], drift=True),
    dict(name='trot', action=A['trot'], drift=True),
    dict(name='run', action=A['run'], drift=True),
    dict(name='flinch', action=A['flinch'], loop=False),
    dict(name='kick', action=A['kick'], loop=False),
    dict(name='fall', action=A['death'], loop=False, recenter=True, recenter_bone='pelvis'),
    dict(name='down', action=A['dead'], pose=True, recenter=True, recenter_bone='pelvis'),
    dict(name='rise', action=A['rise'], loop=False),
]
ao, outm, acts = C.rebake(arm, [body, beads], keep, (bind, 0), clips, T=T, src_fps=fps, name=NAME, obj_bone={'beads': 'head'})
C.drop_source([ao] + outm)
N.fix_groups(outm, ao)

# ---------------------------------------------------------------------------------- reshape the rest pose
b = next(o for o in outm if o['src'] == BODY)
W, P = N.weights(b), N.coords(b)
z0 = np.zeros(len(P), np.float32)
hd, jw = W.get('head', z0), W.get('jaw', z0)
# the long upper lip: the muzzle (head, not jaw) pulled forward and drooped over the lower jaw
hv = hd > 0.5
ymin = float(P[hv, 1].min())
mx = float(P[hv, 0].mean())
LM = 0.30 * SIZE
t = np.clip((ymin + LM - P[:, 1]) / LM, 0, 1) * np.clip(hd - jw * 1.5, 0, 1)
P[:, 1] -= t ** 1.4 * 0.15 * SIZE
P[:, 2] -= t ** 2.0 * 0.15 * SIZE
P[:, 0] = mx + (P[:, 0] - mx) * (1 + 0.18 * t)
# big, floppy ears
for s in ('L', 'R'):
    w = W.get('ear' + s, z0)
    base = np.array(N.bone_head(ao, 'ear' + s))
    d = P - base
    r = np.linalg.norm(d, axis=1)
    P += d * (0.75 * w)[:, None]
    P[:, 2] -= (r * 1.75 * 0.45 * w)
# pillar legs: the lower legs thickened about their bones (no joints to speak of)
for chain, k in ((['fl2', 'fl3'], 0.38), (['ff'], 0.25), (['hl2', 'hl3'], 0.38), (['hf'], 0.25)):
    for s in ('L', 'R'):
        for bn in chain:
            w = W.get(bn + s, z0)
            c = np.array(N.bone_head(ao, bn + s))
            P[:, :2] += (P[:, :2] - c[:2]) * (k * w)[:, None]
N.set_coords(b, P)


# ---------------------------------------------------------------------------------- paint
def paint(M):
    P, Nn, rgb = M['pos'], M['nrm'], M['base'].copy()
    V = M['valid']
    # the moose's near-black coat lifted to a dusty grey-brown hide
    s = L.to_srgb(rgb)
    lum = s.mean(-1, keepdims=True)
    s = np.clip((s - lum) * 0.7 + lum * 1.55 + 0.07, 0, 1) * np.array([1.0, 0.92, 0.82])
    rgb = L.to_linear(s)
    E = N.eyes_of(M)
    em = (E[0] + E[1]) / 2
    zmax = float(P[..., 2][V & (P[..., 1] > em[1] - 0.6)].max())  # the lip's tip
    # wrinkles: corrugated folds round the neck, body and legs (warped bands, a dark crease and a lit ridge above)
    warp = L.fbm(P, 0.35, 3, 11)
    u = P[..., 2] * 9.0 + P[..., 1] * 5.5 + warp * 5.0
    legs = L.smooth(-P[..., 1], -1.05, -0.8)
    u = u * (1 - legs) + (P[..., 1] * 16 + warp * 4) * legs
    f = np.sin(u)
    crease = L.smooth(f, 0.82, 0.97) * (0.55 + 0.45 * L.fbm(P, 0.12, 2, 5))
    ridge = L.smooth(-f, 0.7, 0.95) * 0.5
    rgb = rgb * (1 - 0.5 * crease[..., None]) * (1 + 0.18 * ridge[..., None])
    # a pale, pinkish-grey lip, long and soft
    lip = L.smooth(P[..., 2], zmax - 0.42, zmax - 0.12) * (P[..., 1] > em[1] - 0.55)
    rgb = N.mix(rgb, lip * 0.55, N.lin('#9c8577'))
    # dark nostril slits at the very tip
    tip = (P[..., 2] > zmax - 0.07) & (np.abs(np.abs(P[..., 0] - em[0]) - 0.07) < 0.03) & (Nn[..., 2] > 0.3)
    rgb[tip] *= 0.25
    # darker, mud-caked lower legs
    mud = L.smooth(-P[..., 1], -0.75, -0.35) * (0.6 + 0.4 * L.fbm(P, 0.08, 3, 21))
    rgb = N.mix(rgb, mud * 0.65, N.lin('#3a2c20'))
    # a scruffy darker mane along the top of the neck and the hump
    top = L.smooth(Nn[..., 1], 0.55, 0.9) * L.smooth(P[..., 2], -0.3, 0.4) * L.smooth(P[..., 1], 1.7, 2.1)
    rgb = rgb * (1 - 0.35 * top[..., None])
    # mottled, scarred: bark rubbed into the flanks from leaning on trees
    sc = L.fbm(P, 0.05, 2, 33)
    flank = (np.abs(Nn[..., 0]) > 0.6) & (P[..., 1] > 1.0) & (sc > 0.72)
    rgb[flank] = rgb[flank] * 0.75 + N.lin('#5a4634') * 0.25
    # dark lids round the beads
    for e in E:
        q = np.linalg.norm(P - e, axis=-1)
        rgb = rgb * (1 - 0.6 * L.smooth(-q, -0.05, -0.028)[..., None])
    return rgb


N.lowpass(NAME, ao, outm, acts, TRIS, TEX, ['head', 'jaw'], ['earL', 'earR'], paint, boost=2.2, t0=T0)
