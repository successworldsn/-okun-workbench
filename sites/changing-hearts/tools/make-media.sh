#!/usr/bin/env bash
# Builds the site's photographs and the home film loop into assets/media/.
#   bash tools/make-media.sh            # downloads the council's generated stills, then builds
#   bash tools/make-media.sh --local    # skips the download and builds from media-src/*.png
# Replace any file in media-src/ with your own photograph (same name, any size >= 1376px wide)
# and run with --local. Needs ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=media-src OUT=assets/media
mkdir -p "$SRC" "$OUT"

# Figma-generated stills (links expire 2026-10-16; download before then or use your own photos)
declare -A URL=(
  [hero]=89fb01f2-43e3-466f-9611-32375fd88d42
  [reading]=bd531bdf-f218-444f-a3ca-cad2274cc3ac
  [welcome]=362c998e-874f-45e9-8384-dc7ba29e38e4
  [story]=efc939d3-75ad-4d9f-bfc3-82d5407dadbe
  [film]=2bac8650-dff0-4bb8-a4ba-35211f0f7d26
  [care]=11a6dc93-289b-4fef-89bb-0b0c532689cd
)
if [[ "${1:-}" != "--local" ]]; then
  for n in "${!URL[@]}"; do
    [[ -s "$SRC/$n.png" ]] && continue
    curl -fsSL -o "$SRC/$n.png" "https://www.figma.com/api/mcp/asset/${URL[$n]}.png" && echo "downloaded $n"
  done
fi

for n in hero reading welcome story film care; do
  f="$SRC/$n.png"; [[ -s "$f" ]] || { echo "skip $n (no $f)"; continue; }
  ffmpeg -loglevel error -y -i "$f" -vf "scale='min(1376,iw)':-2" -c:v libwebp -quality 80 "$OUT/$n.webp"
  ffmpeg -loglevel error -y -i "$f" -vf "scale=800:-2" -c:v libwebp -quality 76 "$OUT/$n-sm.webp"
  echo "built $n"
done

# Home film: a slow push in and back out (12s, seamless loop, silent), H.264 + VP9
if [[ -s "$SRC/hero.png" ]]; then
  ZP="scale=2752:-2,zoompan=z='1+0.07*sin(PI*on/360)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=360:s=1280x714:fps=30,format=yuv420p"
  ffmpeg -loglevel error -y -loop 1 -i "$SRC/hero.png" -vf "$ZP" -t 12 -an -c:v libx264 -preset slow -crf 27 -movflags +faststart "$OUT/hero-loop.mp4"
  ffmpeg -loglevel error -y -loop 1 -i "$SRC/hero.png" -vf "$ZP" -t 12 -an -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 "$OUT/hero-loop.webm"
  echo "built hero-loop"
fi
ls -la "$OUT"
