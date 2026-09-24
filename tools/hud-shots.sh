#!/bin/bash
# Screenshots the interface laid out with sample content (#hudpreview), one per side-panel tab, plus the
# login page and the authenticator setup step (#setuppreview), into <dir>. Headless Firefox leaves WebGL
# out of --screenshot, so the 3D view is black: this is for the HTML interface. For the world, use
# SHOTS_DIR with tools/browser-check.sh.
# usage: tools/hud-shots.sh <dir>                 # 1280x800
#        SIZE=390,844 tools/hud-shots.sh <dir>    # a phone
set -uo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
. "$P/tools/env.sh"
OUT="$(realpath -m "${1:?usage: tools/hud-shots.sh <dir>}")"
mkdir -p "$OUT"
(cd "$P" && node build.mjs >/dev/null) || { echo "build failed"; exit 1; }
DATA="$(mktemp -d)"
OAKRIDGE_STATIC="$P/dist/public" OAKRIDGE_DATA="$DATA" OAKRIDGE_MAIL="file:$DATA/outbox.jsonl" PORT=8604 \
  node "$P/dist/app/server.js" > "$DATA/server.log" 2>&1 & SERVER_PID=$!
sleep 1.5
SUFFIX="${SIZE:+_${SIZE/,/x}}"
shot() {
  local prof
  prof="$(mktemp -d)"
  cp "$P/tools/ff-user.js" "$prof/user.js"
  timeout 40 firefox --headless --no-remote --profile "$prof" --window-size "${SIZE:-1280,800}" \
    --screenshot "$OUT/$1$SUFFIX.png" "http://127.0.0.1:8604/$2" > /dev/null 2>&1
  rm -rf "$prof"
  echo "$OUT/$1$SUFFIX.png"
}
for tab in skills inventory equipment prayers settings logout bank shop say make worldmap; do shot "hud_$tab" "#hudpreview=$tab"; done
shot login ""
shot setup "#setuppreview"
# The NPC maker's controls under the creator (its 3D preview comes out black here; SHOTS_DIR with PREVIEW=npcmaker has it).
shot npcmaker "#npcmaker"
kill "$SERVER_PID"
wait 2>/dev/null
rm -rf "$DATA"
