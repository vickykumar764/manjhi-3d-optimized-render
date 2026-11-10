#!/usr/bin/env bash
# Merge the 20 Actions shard clips into the finished Manjhi video. Run LOCALLY after all 20
# `part-N` artifacts are downloaded (one folder per artifact, e.g. parts/part-0/part-0.mp4).
# Usage: ./scripts/merge-parts.sh [parts-dir]   (default: ./parts)
# Steps: verify all 20 parts exist -> concat (video only, no re-encode) -> mux audio/mix.wav
# (Remotion writes a silent audio track, so -map is REQUIRED) -> ffprobe check -> short_qa.py.
set -euo pipefail
PARTS_DIR="${1:-./parts}"
OUT_DIR="out/manjhi-3d"
mkdir -p "$OUT_DIR"

for i in $(seq 0 19); do
  f="$PARTS_DIR/part-$i/part-$i.mp4"
  [ -f "$f" ] || { echo "MISSING: $f"; exit 1; }
done
echo "All 20 parts present."

: > /tmp/manjhi-parts.txt
for i in $(seq 0 19); do
  echo "file '$PWD/$PARTS_DIR/part-$i/part-$i.mp4'" >> /tmp/manjhi-parts.txt
done

ffmpeg -y -f concat -safe 0 -i /tmp/manjhi-parts.txt -c copy "$OUT_DIR/video-noaudio.mp4"
echo "Concatenated: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_DIR/video-noaudio.mp4") s"

# Mux the finished mix (41.796 s, -14.1 LUFS). -shortest trims any 1-frame overrun.
ffmpeg -y -i "$OUT_DIR/video-noaudio.mp4" -i audio/mix.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest \
  "$OUT_DIR/The-Mountain-Man-Hindi-3D.mp4"

ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration \
  -of default=noprint_wrappers=1 "$OUT_DIR/The-Mountain-Man-Hindi-3D.mp4"

echo "QA (black/white/frozen/pop frames + loudness, target -14 LUFS):"
python3 scripts/short_qa.py "$OUT_DIR/The-Mountain-Man-Hindi-3D.mp4" "$OUT_DIR/qa" shots.json || true
echo "DONE: $OUT_DIR/The-Mountain-Man-Hindi-3D.mp4"
