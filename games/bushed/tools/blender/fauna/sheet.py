# Lay out render_check.py's views (and any other pngs) on one contact sheet.
#   python3 sheet.py out.png a_side.png a_q34.png ... [--cols 4]
import sys
from PIL import Image, ImageDraw
args = sys.argv[1:]; cols = 4
if '--cols' in args: i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
out, files = args[0], args[1:]
ims = [Image.open(f).convert('RGB') for f in files]
w = max(i.width for i in ims); h = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (w * cols, (h + 14) * rows), (20, 20, 20))
d = ImageDraw.Draw(S)
for k, (im, f) in enumerate(zip(ims, files)):
    x, y = (k % cols) * w, (k // cols) * (h + 14)
    S.paste(im, (x, y + 14)); d.text((x + 3, y + 1), f.split('/')[-1][:60], fill=(255, 230, 120))
S.save(out)
