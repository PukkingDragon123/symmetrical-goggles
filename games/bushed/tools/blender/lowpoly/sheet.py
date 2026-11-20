"""Tile sheet.cjs's shots into one labelled contact sheet:  python3 tools/blender/lowpoly/sheet.py <who> <dir>"""
import sys, os
from PIL import Image, ImageDraw
who, d = sys.argv[1], sys.argv[2]
rows = [[f'{l}_{v}' for v in ('front', 'q34', 'side', 'head')] for l in ('day', 'night')]
clips = sorted([f[len(who) + 1:-4] for f in os.listdir(d) if f.startswith(who + '_clip_')])
rows.append(['walk'] + clips[:3])
for k in range(3, len(clips), 4):
    rows.append(clips[k:k + 4])
W, H = 400, 300
S = Image.new('RGB', (W * 4, H * len(rows) + 28), (18, 18, 18))
g = ImageDraw.Draw(S)
g.text((8, 8), f'{who}: day / night (front, 3/4, side, head), walk frame, every clip (3/4)', fill=(230, 230, 230))
for r, row in enumerate(rows):
    for c, name in enumerate(row):
        f = os.path.join(d, f'{who}_{name}.png')
        if not os.path.exists(f):
            continue
        S.paste(Image.open(f).convert('RGB').resize((W, H)), (c * W, 28 + r * H))
        g.rectangle([c * W, 28 + r * H, c * W + 8 + 7 * len(name), 28 + r * H + 16], fill=(0, 0, 0))
        g.text((c * W + 4, 28 + r * H + 2), name, fill=(255, 255, 255))
S.save(os.path.join(d, f'{who}_contact.png'))
print(os.path.join(d, f'{who}_contact.png'))
