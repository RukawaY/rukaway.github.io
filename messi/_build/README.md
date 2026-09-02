# Build notes · 构建说明

`index.html` + `film.css` + `film.js` + `data.js` are the whole page; `assets/` holds the audio, WebP stills, H.264 clips and subset fonts. Nothing is generated at runtime.

- **Timeline / screenplay** — edit `data.js` (shots, lyrics, extras, events). Times are seconds on the audio clock. Use `?t=85&pause=1` to freeze any frame, `?debug=1` for the HUD, ←/→ to scrub, space to pause, `r` to restart.
- **Lyric size** — `.lyric.s-*` in `film.css`; every line also gets `--fit` from film.js (88vw ÷ character units, 84vh for vertical lines) so no line ever wraps or overflows.
- **Stills** — `images.json` maps source files to `assets/img/<name>.webp`; run `python3 _build/prep_images.py _build/images.json` (2560 px long side, WebP q80).
- **Clips** — `clips.json` is the cut list (YouTube id, start, duration, crop). Download the source with `yt-dlp -f "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b" <id>` and cut with `_build/cut.sh SRC START DUR NAME [crop]` (1440×810, CRF 27, denoised, muted; keeps the source frame rate — 50/60 fps sources are halved — and deinterlaces when `idet` says so, because frame-rate conversion and combing both read as judder). Every clip must be at least as long as its slot in `data.js` (`shots_check`: start + slot × rate); `film.js` holds the last frame if a clip runs out.
- **Audio** — see CREDITS.md. The track is used complete: `ffmpeg -i src.m4a -af "afade=t=out:st=249.6:d=1.4,loudnorm=I=-11:TP=-1:LRA=7"` → `assets/audio/qiansixi.{m4a,mp3}`. Any new track needs the lyric times in `data.js` re-derived (faster-whisper word timestamps work well).
- **Fonts** — lyrics use 王漢宗中行書繁 (HanWang ShinSu, `wang/wt071.ttf`, GPL; Big5 coverage, brush semi-cursive) thickened with `-webkit-text-stroke: .024em` in `film.css`; 顏楷 (wt064) was rejected as too round. Ma Shan Zheng / Long Cang / Zhi Mang Xing are GB2312-only and silently fall back to a Song face on 繁體; LXGW WenKai (Klee-derived) reads too soft. Labels/quotes use Noto Serif TC. After changing any text, re-run `python3 _build/fonts.py` (needs the source TTFs; set `FONT_SRC`).
- **Credits** — `python3 _build/credits.py` regenerates `CREDITS.md` from the manifests.
