#!/usr/bin/env python3
"""Convert selected stills to web-ready WebP.
usage: python3 _build/prep_images.py SPEC.json   where SPEC = [{"src": "...", "out": "name", "crop": [x0,y0,x1,y1] (fractions, optional), "w": 2560}]
"""
import sys, json, os
from PIL import Image, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img')
spec = json.load(open(sys.argv[1]))
for it in spec:
    im = Image.open(it['src']); im = ImageOps.exif_transpose(im).convert('RGB')
    W, H = im.size
    if it.get('crop'):
        x0, y0, x1, y1 = it['crop']; im = im.crop((int(x0*W), int(y0*H), int(x1*W), int(y1*H)))
    w = it.get('w', 2560)
    long = max(im.size)
    if long > w: im = im.resize((round(im.width * w / long), round(im.height * w / long)), Image.LANCZOS)
    fn = os.path.join(OUT, it['out'] + '.webp')
    im.save(fn, 'WEBP', quality=it.get('q', 82), method=6)
    print(f"{it['out']}.webp {im.width}x{im.height} {os.path.getsize(fn)//1024}KB")
