#!/bin/bash
# Builds and publishes: the server bundle goes to the Passenger app folder, the client to the
# subdomain's web root (hashed assets first, then index.html). Then restarts the world server
# and smoke-tests the live site. One-time app creation: tools/host-setup.sh.
set -euo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
. "$P/tools/env.sh"
cd "$P"
HOST=enchantingcards
APP=oakridgeonline
WEB=domains/oakridgeonline.emutastic.com/public_html
SITE=https://oakridgeonline.emutastic.com
SSH=(ssh -o LogLevel=ERROR)

boot() { curl -fsS --max-time 10 "$SITE/status" 2>/dev/null | sed -n 's/.*"boot":"\([a-z0-9]*\)".*/\1/p'; }

node build.mjs
OLD="$(boot || true)"
rsync -a -e "${SSH[*]}" dist/app/server.js dist/app/package.json "$HOST:$APP/"
rsync -a --delete -e "${SSH[*]}" dist/public/assets/ "$HOST:$WEB/assets/"
# Files served from the site root (favicon.ico), then the page last.
rsync -a -e "${SSH[*]}" --exclude=index.html --exclude=assets dist/public/ "$HOST:$WEB/"
rsync -a -e "${SSH[*]}" dist/public/index.html "$HOST:$WEB/index.html"
# The standard restart signal: the next request after the touch starts a fresh process.
"${SSH[@]}" "$HOST" "mkdir -p $APP/tmp && touch $APP/tmp/restart.txt"
# The host may restart the process more than once while it settles: wait for one that stays up 8 s.
STABLE=""; FLIPS=0; deadline=$((SECONDS + 90))
while [ -z "$STABLE" ] && [ $SECONDS -lt $deadline ]; do
  NEW="$(boot || true)"
  if [ -n "$NEW" ] && [ "$NEW" != "$OLD" ]; then
    sleep 8
    if [ "$(boot || true)" = "$NEW" ]; then STABLE="$NEW"; else FLIPS=$((FLIPS + 1)); fi
  else
    sleep 1
  fi
done
[ -n "$STABLE" ] || { echo "DEPLOY FAIL: no server stayed up within 90 s"; exit 1; }
echo "restarted: boot ${OLD:-none} -> $STABLE (settled after $FLIPS extra restart(s))"

page="$(curl -fsS "$SITE/")" || { echo "DEPLOY FAIL: page did not load"; exit 1; }
grep -q "<title>Oakridge Online</title>" <<< "$page" || { echo "DEPLOY FAIL: page is not ours"; exit 1; }
node tools/smoke.mjs "$SITE/"
