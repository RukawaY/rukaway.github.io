#!/usr/bin/env bash
# Cut a muted H.264 clip at 1440x810: _build/cut.sh SRC START DURATION OUTNAME [extra ffmpeg -vf filters]
# Keeps the source frame rate (halves 50/60 fps sources) so nothing is judder-converted, and deinterlaces
# sources that idet reports as interlaced.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$1"; SS="$2"; T="$3"; OUT="$ROOT/assets/clip/$4.mp4"; VF="${5:-}"
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$SRC")
FPSF=$(python3 -c "n,d='$FPS'.split('/'); print(float(n)/float(d))")
OUTFPS=$(python3 -c "f=$FPSF; print('%s' % ('$FPS' if f<45 else '($FPS)/2'))")
IDET=$(ffmpeg -nostdin -ss "$SS" -i "$SRC" -t "$T" -vf idet -an -f null - 2>&1 | grep "Multi frame detection" | tail -1)
PROG=$(echo "$IDET" | sed -E 's/.*Progressive: *([0-9]+).*/\1/'); TFF=$(echo "$IDET" | sed -E 's/.*TFF: *([0-9]+).*/\1/'); BFF=$(echo "$IDET" | sed -E 's/.*BFF: *([0-9]+).*/\1/')
DEINT=""
if [ "${TFF:-0}" -gt "${PROG:-0}" ] || [ "${BFF:-0}" -gt "${PROG:-0}" ]; then DEINT="yadif=0:-1:0,"; fi
FILTERS="${DEINT}hqdn3d=2:1.5:4:4,scale=1440:810:force_original_aspect_ratio=increase,crop=1440:810,setsar=1,fps=$OUTFPS"
[ -n "$VF" ] && FILTERS="$VF,$FILTERS"
ffmpeg -nostdin -v error -y -ss "$SS" -i "$SRC" -t "$T" -an -vf "$FILTERS" -c:v libx264 -preset slower -crf 27 -tune film -pix_fmt yuv420p -profile:v high -movflags +faststart "$OUT"
echo "$4.mp4 $(du -k "$OUT" | cut -f1)KB $(ffprobe -v error -show_entries format=duration:stream=avg_frame_rate -of csv=p=0 "$OUT" | tr '\n' ' ') src=${FPSF}fps deint=${DEINT:-no}"
