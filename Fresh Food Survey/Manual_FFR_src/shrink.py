# shots/*.png → shots/*.webp (max 1400 px wide, q60) — build.js embeds the WebP to keep the manual small.
import glob, os
from PIL import Image
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
for f in glob.glob(os.path.join(d, '*.png')):
    im = Image.open(f).convert('RGB')
    if im.width > 1400: im = im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS)
    im.save(f[:-4] + '.webp', 'WEBP', quality=60, method=6)
print('ok', len(glob.glob(os.path.join(d, '*.webp'))), 'webp')
