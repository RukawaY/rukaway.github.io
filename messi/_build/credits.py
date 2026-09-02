#!/usr/bin/env python3
"""Generate CREDITS.md (asset provenance) from images.json + the stills manifest + clips.json + the footage segment lists."""
import json, os, glob
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
SCR='/tmp/claude-48014/-data-local-ziyuan-rukaway-github-io/ec19fd6c-b4e5-4978-b6c7-48f95074f759/scratchpad'
man={m['file']:m for m in json.load(open(f'{SCR}/stills/manifest.json'))}
imgs=json.load(open(f'{HERE}/images.json'))
used=set(os.path.basename(f)[:-5] for f in glob.glob(f'{ROOT}/assets/img/*.webp'))
segs=[]
for e in ('era1','era2','era3'):
    segs+=json.load(open(f'{SCR}/video/{e}/segments.json'))
byid={}
for s in segs: byid.setdefault(s['youtube_id'],s)
clips=json.load(open(f'{HERE}/clips.json'))
out=['# Créditos · 素材来源','', 'All pictures and footage were gathered from the public web for a personal, non-commercial tribute. Editorial agency photos and broadcast footage remain the property of their rights holders; Wikimedia Commons files are used under their stated licences.','',
     '## Fotografías · 图片','','| file | source | credit / licence |','|---|---|---|']
for it in imgs:
    if it['out'] not in used: continue
    m=man.get(os.path.basename(it['src']),{})
    out.append(f"| `{it['out']}.webp` | [{m.get('description','')[:80]}]({m.get('source_page_url','')}) | {m.get('credit_or_license','')} |")
out+=['','## Vídeo · 视频片段 (YouTube)','','| clip | video | uploader | cut |','|---|---|---|---|']
for c in clips:
    s=byid.get(c['yt'],{})
    out.append(f"| `{c['name']}.mp4` | [{s.get('title','')[:70]}](https://www.youtube.com/watch?v={c['yt']}) | {s.get('uploader','')} | {c['start']}s +{c['dur']}s |")
out+=['','## Música · 音樂','','《牽絲戲》 · 銀臨 & Aki阿傑 · 作詞 Vagary · 作曲 銀臨 — DJ edit “《牵丝戏dj》0.8x · 卡卡の小曲 · 亚当处刑曲” by 一支yuuu on [Bilibili](https://www.bilibili.com/video/BV1aDxkeFEzq) (re-uploaded on YouTube as vIxFLGAcv3U). Used complete and uncut (4:11); only loudness-normalised (−11 LUFS, −1 dBTP) with a 1.4 s fade at the very end.','',
      '## Tipografía · 字体','','Lyrics: 王漢宗中行書繁 (HanWang ShinSu, wt071.ttf) by Prof. Wang Hann-Tzong, GNU GPL v2, from the community mirror of the 王漢宗自由字型 collection. Labels and quotes: Noto Serif TC. Latin: Cormorant Garamond, Cinzel, Bebas Neue, Space Mono (SIL OFL). All subset with fontTools.','']
open(f'{ROOT}/CREDITS.md','w',encoding='utf-8').write('\n'.join(out)); print('CREDITS.md', len(out), 'lines')
