#!/bin/bash
# Builds, then runs the world server locally with the client at http://127.0.0.1:8600/ (Ctrl-C stops it).
set -euo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
. "$P/tools/env.sh"
cd "$P"
node build.mjs
OAKRIDGE_STATIC="$P/dist/public" PORT="${PORT:-8600}" exec node dist/app/server.js
