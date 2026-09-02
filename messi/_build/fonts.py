#!/usr/bin/env python3
"""Subset the display fonts to exactly the glyphs the film uses.
Run from messi/: python3 _build/fonts.py  (reads data.js text + extra strings below).
Source TTFs are expected in $FONT_SRC (default: scratchpad/fonts)."""
import os, re, sys, json, subprocess
from fontTools import subset
from fontTools.ttLib import TTFont
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SRC = os.environ.get('FONT_SRC', '/tmp/claude-48014/-data-local-ziyuan-rukaway-github-io/ec19fd6c-b4e5-4978-b6c7-48f95074f759/scratchpad/fonts')
OUT = os.path.join(ROOT, 'assets', 'fonts'); os.makedirs(OUT, exist_ok=True)
data = open(os.path.join(ROOT, 'data.js'), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT, 'data.js')) else ''
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
extra = "再看一遍輕觸開始梅西阿根廷國家隊生涯史詩回顧少年黃金遺憾宿命王冠告別謝幕致敬第一二三四五六七八九十章年月日場球助攻冠軍亞軍世界盃美洲奧運會決賽謹以此片紀念里奧·梅西終場最後一舞"
cjk = set(ch for ch in (data + html + extra) if ord(ch) > 0x2E80)
cjk |= set("，。·、：！？「」『』（）—…　")
latin = set(chr(c) for c in range(0x20, 0x7F)) | set("ÁÉÍÓÚÑáéíóúñü¿¡–—…·’“”‘°×")
def sub(src, out, chars, flavor='woff2', keep_var=True):
    args = [os.path.join(SRC, src), f'--output-file={os.path.join(OUT, out)}', f'--flavor={flavor}', '--layout-features=*', '--no-hinting', '--desubroutinize',
            f'--text={"".join(sorted(chars))}', '--name-IDs=*', '--notdef-outline']
    subset.main(args)
    print(out, os.path.getsize(os.path.join(OUT, out)) // 1024, 'KB', len(chars), 'chars')
sub('wang/wt071.ttf', 'ShinSu.woff2', cjk | latin)
sub('NotoSerifTC[wght].ttf', 'NotoSerifTC.woff2', cjk | latin)
sub('CormorantGaramond[wght].ttf', 'Cormorant.woff2', latin)
sub('CormorantGaramond-Italic[wght].ttf', 'CormorantItalic.woff2', latin)
sub('Cinzel[wght].ttf', 'Cinzel.woff2', latin)
sub('BebasNeue-Regular.ttf', 'BebasNeue.woff2', latin)
sub('SpaceMono-Regular.ttf', 'SpaceMono.woff2', latin)
