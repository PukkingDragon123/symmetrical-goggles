# Coats for the songbird rig (songbird.py): each species is painted over the source robin's feather texture. The
# robin's luminance detail (every barb, edge and shadow of its hand-painted feathers) is kept; its colours are
# replaced zone by zone, the zones found from where each texel sits on the bird in the rest pose (songbird.py writes
# pos.npy: texel -> rest position in metres, up = +y, forward = +z; part.npy: texel -> head, neck, body, tail, wing,
# primaries, secondaries, tertials, thigh, foot, beak).
#   python3 paint_birds.py <paint dir> <out dir> [species ...]
#   species: chickadee (black-capped), jay (Canada jay), woodpecker (hairy, male), grouse (ruffed)
import sys, os, json
import numpy as np
from PIL import Image, ImageFilter

PAINT, OUT = sys.argv[1], sys.argv[2]
WANT = sys.argv[3:] or ['chickadee', 'jay', 'woodpecker', 'grouse']
pos = np.load(os.path.join(PAINT, 'pos.npy')) * 100.0          # cm
part = np.load(os.path.join(PAINT, 'part.npy'))
marks = json.load(open(os.path.join(PAINT, 'marks.json')))
B = {k: (np.array(v[0]) * 100, np.array(v[1]) * 100) for k, v in marks['bones'].items()}
src = Image.open(os.path.join(PAINT, 'orig.png')).convert('RGBA')
A = np.asarray(src).astype(np.float32) / 255.0
rgb, alpha = A[..., :3], A[..., 3]
N = rgb.shape[0]
X, Y, Z = np.abs(pos[..., 0]), pos[..., 1], pos[..., 2]
HEAD, NECK, BODY, TAIL, WING, THIGH, FOOT, BEAK, PRIM, SEC, TERT = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
covered = part > 0

# fill the gutters between UV islands with the nearest island's values so filtering never bleeds a seam colour
def dilate(img, mask, n=6):
    img = img.copy(); m = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(img); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(img, dy, 0), dx, 1); sm = np.roll(np.roll(m, dy, 0), dx, 1)
            acc[sm] += sh[sm] if img.ndim == 2 else sh[sm]
            cnt[sm] += 1
        grow = (~m) & (cnt > 0)
        img[grow] = (acc[grow].T / cnt[grow]).T if img.ndim > 2 else acc[grow] / cnt[grow]
        m = m | grow
    return img

# luminance detail: the source's local contrast (feather barbs, edges), alpha-weighted so islands don't bleed
L = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
def blur(a, r):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)); return np.asarray(im.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
w = np.maximum(alpha, 0.02)
Lb = blur(L * w, 7) / np.maximum(blur(w, 7), 1e-3)
D = np.clip(L / np.maximum(Lb, 0.03), 0.45, 1.8)
EDGE = np.clip((D - 1.12) * 2.5, 0, 1)        # bright feather edges and fringes

# landmarks (cm, rest pose): the head, the beak, the eye (darkest texels on the head)
hm = part == HEAD
hc = pos[hm].mean(0) * 100 / 100
rh = np.median(np.linalg.norm(pos[hm] - pos[hm].mean(0), axis=1))
beak0 = B['Beak'][0]
dark = hm & (L < 0.13) & (alpha > 0.5) & (pos[..., 2] < beak0[2] - 0.3)
eye = np.array([X[dark].mean(), Y[dark].mean(), Z[dark].mean()]) if dark.sum() > 20 else hc + np.array([rh * 0.6, 0.1 * rh, 0.5 * rh])
de = np.sqrt((X - eye[0]) ** 2 + (Y - eye[1]) ** 2 + (Z - eye[2]) ** 2)
EYE_R = 0.15
body = (part == BODY) | (part == NECK) | (part == THIGH)
ycen = np.median(Y[part == BODY])
zmid = np.median(Z[part == BODY])
xmax = np.percentile(X[part == BODY], 95)
headish = (part == HEAD) | (part == BEAK)
# the bill: the forward-most head texels beyond the face
mx, mn = rgb.max(-1), rgb.min(-1)
SAT = (mx - mn) / np.maximum(mx, 1e-3)
beakm = headish & (np.abs(Y - beak0[1] - 0.12) < 0.45) & ((Z > beak0[2] + 0.18) | ((Z > beak0[2] - 0.2) & (SAT < 0.33) & (L < 0.5)))
tailbase, tailtip = B['Tail_2'][0], B['L_TailFeather_1'][1]
tax = tailtip - tailbase; tlen = np.linalg.norm(tax); tax = tax / tlen
tt = np.clip(((pos - tailbase) @ tax) / tlen, 0, 1.2)

def S(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def mix(base, col, m):
    m = np.clip(m, 0, 1)[..., None]; return base * (1 - m) + np.asarray(col, np.float32) * m

# the front of the bird at each height: the most forward texel near the midline (for bibs and breasts)
yb = np.clip(((Y - Y[covered].min()) / 0.1).astype(int), 0, 200)
zf = np.full(201, -1e9, np.float32)
mid = covered & (X < 0.35) & (part != WING) & (part != PRIM) & (part != SEC) & (part != TERT) & (part != TAIL)
np.maximum.at(zf, yb[mid], Z[mid])
for i in range(1, 201):
    if zf[i] < -1e8: zf[i] = zf[i - 1]
FRONT = Z - zf[yb]                     # 0 on the front surface, negative going round to the back

def eyes(c):
    c = mix(c, (0.03, 0.025, 0.02), S(EYE_R + 0.03 - de, 0, 0.05))
    # a tiny catch-light up and forward on the bead
    hl = np.sqrt((X - eye[0]) ** 2 + (Y - eye[1] - 0.08) ** 2 + (Z - eye[2] - 0.07) ** 2)
    return mix(c, (0.95, 0.95, 0.92), S(0.07 - hl, 0, 0.03))

def finish(c, name, k=0.85):
    out = np.clip(c * (D[..., None] ** k), 0, 1)
    out = dilate(out, covered & (alpha > 0.05), 4)
    a = alpha
    im = Image.fromarray(np.dstack([out * 255, a * 255]).astype(np.uint8), 'RGBA')
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, f'{name}.png'), optimize=True)
    print('[paint]', name, os.path.getsize(os.path.join(OUT, f'{name}.png')) // 1024, 'KB')

dorsal = S(Y - ycen, -0.2, 0.6)                     # 1 on the back, 0 on the belly
lateral = S(X / max(xmax, 1e-3), 0.55, 0.95)
behind = S(zmid - Z, -0.5, 0.8)
wingm = (part == WING) | (part == PRIM) | (part == SEC) | (part == TERT)
foot = part == FOOT
# how much a texel belongs to the head: a soft ball round the skull (no hard seam where the neck meets the body)
dh = np.sqrt(X ** 2 + (Y - hc[1]) ** 2 + (Z - hc[2]) ** 2)
HW = S(rh * 1.75 - dh, -0.35, 0.35) * (~wingm) * (part != TAIL) * (part != FOOT)
HW = np.where(headish, 1.0, HW)

def chickadee():
    c = np.zeros_like(rgb) + (0.50, 0.50, 0.48)
    # body: grey back, white breast, buff flanks
    c = mix(c, (0.90, 0.89, 0.85), (1 - dorsal) * body)
    c = mix(c, (0.80, 0.66, 0.47), (1 - dorsal) * lateral * behind * body * 0.9)
    c = mix(c, (0.85, 0.80, 0.70), (part == THIGH) * 0.8)
    c[wingm] = (0.40, 0.41, 0.43)
    c = mix(c, (0.93, 0.93, 0.90), wingm * EDGE * ((part == SEC) | (part == TERT) | (part == WING)) * 1.2)
    c[part == TAIL] = (0.42, 0.43, 0.45)
    c = mix(c, (0.80, 0.80, 0.78), (part == TAIL) * EDGE)
    # head: white cheeks; the black cap down to the eye and the nape; the black bib
    hn = HW
    c = mix(c, (0.93, 0.93, 0.91), hn)
    cap = S(Y - (eye[1] - 0.22), -0.08, 0.1) * S(rh * 1.7 - dh, -0.2, 0.2) * (~wingm)
    c = mix(c, (0.04, 0.04, 0.045), cap)
    # the bib: a black shield from the chin to the upper breast, on the front
    top, bot = beak0[1] - 0.2, beak0[1] - 1.55
    v = np.clip((top - Y) / (top - bot), 0, 1)
    width = 0.78 * (1 - v ** 2) + 0.05
    bib = S(Y, bot, bot + 0.12) * S(top + 0.1 - Y, 0, 0.12) * S(width - X, 0, 0.12) * S(FRONT, -0.9, -0.6) * (~wingm)
    c = mix(c, (0.04, 0.04, 0.045), bib)
    c = mix(c, (0.05, 0.05, 0.05), beakm)
    c[foot] = (0.27, 0.29, 0.33)
    return eyes(c)

def jay():
    c = np.zeros_like(rgb) + (0.44, 0.45, 0.46)
    c = mix(c, (0.74, 0.74, 0.72), (1 - dorsal) * body)
    c = mix(c, (0.84, 0.82, 0.78), (1 - dorsal) * (1 - behind) * body * 0.5)
    c[wingm] = (0.34, 0.35, 0.37)
    c = mix(c, (0.72, 0.72, 0.70), wingm * EDGE * 0.9)
    c[part == TAIL] = (0.36, 0.37, 0.39)
    c = mix(c, (0.80, 0.80, 0.78), (part == TAIL) * S(tt, 0.85, 1.0))
    hn = HW
    # white face, forehead and throat; the dark hood from behind the eye over the crown to the nape
    c = mix(c, (0.93, 0.93, 0.91), hn)
    hood = S(eye[2] + 0.05 - Z, -0.15, 0.2) * S(Y - (eye[1] - 0.45), -0.1, 0.2) * S(rh * 2.0 - dh, -0.3, 0.3) * (~wingm)
    c = mix(c, (0.16, 0.16, 0.17), hood)
    c = mix(c, (0.62, 0.62, 0.62), S(dh - rh * 1.3, 0, 0.4) * S(rh * 2.3 - dh, 0, 0.4) * (1 - hood) * (~wingm) * S(Y - ycen, -0.5, 0.5))
    c = mix(c, (0.05, 0.05, 0.05), beakm)
    c[foot] = (0.07, 0.07, 0.08)
    return eyes(c)

def woodpecker():
    c = np.zeros_like(rgb) + (0.05, 0.05, 0.055)
    c = mix(c, (0.93, 0.93, 0.91), (1 - dorsal) * body)                        # white underparts
    c = mix(c, (0.93, 0.93, 0.91), body * dorsal * S(0.55 - X, 0, 0.15) * S(Y - ycen, 0.3, 0.6))  # the white back stripe
    sp = (np.sin(Z * 5.2) * np.sin(X * 6.0 + Y * 2.0) > 0.45)
    c = mix(c, (0.92, 0.92, 0.9), wingm * sp * 0.95)                            # spotted wings
    c[part == TAIL] = (0.05, 0.05, 0.055)
    c = mix(c, (0.93, 0.93, 0.91), (part == TAIL) * S(X, 0.35, 0.55))           # white outer tail
    hn = HW
    c = mix(c, (0.93, 0.93, 0.91), hn)
    c = mix(c, (0.05, 0.05, 0.055), hn * S(Y - (eye[1] + 0.25), -0.05, 0.08))   # black crown
    c = mix(c, (0.05, 0.05, 0.055), hn * S(0.32 - np.abs(Y - (eye[1] - 0.05)), 0, 0.08) * S(eye[2] + 0.2 - Z, 0, 0.2))  # eye stripe
    c = mix(c, (0.05, 0.05, 0.055), hn * S(0.18 - np.abs(Y - (eye[1] - 0.75)), 0, 0.06) * S(eye[2] - Z, -0.3, 0.2))     # malar
    nape = np.sqrt(X ** 2 + (Y - (eye[1] + 0.2)) ** 2 + (Z - (hc[2] - rh * 0.9)) ** 2)
    c = mix(c, (0.80, 0.07, 0.06), hn * S(0.75 - nape, 0, 0.12))               # the red nape patch
    c = mix(c, (0.20, 0.20, 0.22), beakm)
    c[foot] = (0.25, 0.25, 0.27)
    return eyes(c)

def grouse():
    c = np.zeros_like(rgb) + (0.44, 0.34, 0.24)
    bars = (0.5 + 0.5 * np.sin(Y * 9.0 + np.sin(X * 4 + Z * 3) * 0.9)) * (0.55 + 0.45 * np.sin(X * 13 + Z * 9 + Y * 2))
    c = mix(c, (0.72, 0.62, 0.46), (1 - dorsal) * body)                        # buff underparts
    c = mix(c, (0.30, 0.22, 0.14), (1 - dorsal) * body * S(bars, 0.6, 0.9) * 0.8)  # barred
    streak = 0.5 + 0.5 * np.sin(X * 9 + Z * 2.5)
    c = mix(c, (0.70, 0.60, 0.45), dorsal * body * S(streak, 0.75, 0.95) * 0.7)   # pale back streaks
    c[wingm] = (0.42, 0.33, 0.24)
    c = mix(c, (0.72, 0.62, 0.48), wingm * S(np.sin(Z * 6 + X * 4), 0.6, 0.9) * 0.8)
    c[part == TAIL] = (0.50, 0.42, 0.33)
    c = mix(c, (0.10, 0.08, 0.07), (part == TAIL) * S(0.07 - np.abs(tt - 0.82), 0, 0.03))   # the black band
    c = mix(c, (0.62, 0.58, 0.52), (part == TAIL) * S(tt, 0.9, 1.0))
    hn = HW
    c = mix(c, (0.48, 0.38, 0.27), hn)
    c = mix(c, (0.25, 0.22, 0.2), beakm)
    c[foot] = (0.42, 0.38, 0.33)
    return eyes(c)

for name in WANT:
    finish(globals()[name](), name)
print('[paint] eye', np.round(eye, 2), 'head', np.round(hc, 2), 'rh', round(float(rh), 2), 'beak', np.round(beak0, 2))
