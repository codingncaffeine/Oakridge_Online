#!/bin/bash
# One-time: creates the Passenger Node app for the subdomain and pins it to exactly one process
# (the world lives in memory, so two processes would be two worlds). Safe to re-run.
set -euo pipefail
HOST=enchantingcards
"${SSH:-ssh}" -o LogLevel=ERROR "$HOST" 'set -e
APP=oakridgeonline; DOMAIN=oakridgeonline.emutastic.com; HT=~/domains/$DOMAIN/public_html/.htaccess
if ! cloudlinux-selector get --json --interpreter nodejs | grep -q "\"$APP\""; then
  cloudlinux-selector create --json --interpreter nodejs --version 22 --app-root "$APP" \
    --domain "$DOMAIN" --app-uri / --app-mode production --startup-file server.js
fi
grep -q "^PassengerMinInstances" "$HT" || printf "\nPassengerMinInstances 1\nPassengerMaxInstancesPerApp 1\n" >> "$HT"
# index.html must never be cached (it names the current hashed bundle); the bundles themselves can be.
grep -q "<Files \"index.html\">" "$HT" || printf "\n<Files \"index.html\">\nHeader set Cache-Control \"no-cache\"\n</Files>\n" >> "$HT"
cat "$HT"'
