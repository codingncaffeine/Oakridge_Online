#!/bin/bash
# Loads the client in headless Firefox (scratch profile, muted), lets it join, click-walk and sample
# its pixels, and prints the report it posts back.
# usage: tools/browser-check.sh            # builds and runs a local server for the check
#        SHOTS_DIR=<dir> tools/browser-check.sh   # also saves creator, character, trees and scene PNGs
#        tools/browser-check.sh <site-url> # checks a deployed site, e.g. https://oakridgeonline.emutastic.com/
#        PREVIEW=animations SHOTS_DIR=<dir> tools/browser-check.sh   # snapshots the animation preview instead
#        PREVIEW=<resources|village|stonecote|thornbury|wickstead|brinehaven|skypreview|npcmaker|streampreview> SHOTS_DIR=<dir> tools/browser-check.sh   # likewise for the other previews
set -uo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
. "$P/tools/env.sh"
LOG="$(mktemp)"; PROF="$(mktemp -d)"; cp "$P/tools/ff-user.js" "$PROF/user.js"
BEACON_PORT=8601; SERVER_PID=""
node "$P/tools/beacon.mjs" "$BEACON_PORT" "$LOG" ${SHOTS_DIR:+"$SHOTS_DIR"} & BEACON_PID=$!
URL="${1:-}"
if [ -z "$URL" ]; then
  (cd "$P" && node build.mjs >/dev/null) || { echo "build failed"; kill "$BEACON_PID"; exit 1; }
  DATA="$(mktemp -d)"
  # The local server pins its random numbers at 0, so every gathering roll succeeds and the chop check is certain.
  OAKRIDGE_STATIC="$P/dist/public" OAKRIDGE_DATA="$DATA" OAKRIDGE_MAIL="file:$DATA/outbox.jsonl" OAKRIDGE_TEST_RAND=0 PORT=8602 node "$P/dist/app/server.js" > "$LOG.server" 2>&1 & SERVER_PID=$!
  URL="http://127.0.0.1:8602/"
fi
sleep 1
AUTH=""
if [ -n "${1:-}" ]; then AUTH="&secret=$(node "$P/tools/accounts.mjs" secret "$URL" Tester)"; fi
FRAGMENT="selftest=$([ -n "${1:-}" ] && echo Tester || echo Tester$((RANDOM % 900 + 100)))&beacon=http://127.0.0.1:$BEACON_PORT/${SHOTS_DIR:+&shots=1}$AUTH"
[ -n "${PREVIEW:-}" ] && FRAGMENT="$PREVIEW&beacon=http://127.0.0.1:$BEACON_PORT/"
timeout 320 firefox --headless --no-remote --profile "$PROF" --window-size 1280,800 "${URL}#$FRAGMENT" > "$LOG.ff" 2>&1 & FF_PID=$!
done_yet() { grep -q '^DONE' "$LOG" || grep -q '\[selftest\] DONE' "$LOG.ff"; }
# A local run takes a couple of minutes; a live one is slower at every step. The combat checks fight
# each stance in turn, and the village checks walk the player across Oakridge and open doors on the
# way. The loop breaks the moment the page says DONE, so this costs nothing when the run is quick.
for _ in $(seq 300); do done_yet && break; sleep 1; done
kill "$FF_PID" "$BEACON_PID" ${SERVER_PID:+"$SERVER_PID"} 2>/dev/null; wait 2>/dev/null
done_yet || echo "NO REPORT (page never finished its self-test)"
# The collector's copy when it got through; otherwise what the page printed to Firefox's console.
if [ -s "$LOG" ]; then cat "$LOG"; else grep -E '\[selftest\]|JavaScript (error|warning)|Error' "$LOG.ff" | head -40; fi
[ -n "$SERVER_PID" ] && sed 's/^/server: /' "$LOG.server"
rm -rf "$PROF" "$LOG" "$LOG.server" "$LOG.ff" ${DATA:+"$DATA"}
