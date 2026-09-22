#!/bin/bash
# Everything that must be green before a commit: typecheck both halves, build, then all tests
# (unit tests plus the integration test against the freshly built server bundle).
set -euo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
. "$P/tools/env.sh"
cd "$P"
npx tsc -p tsconfig.json
npx tsc -p src/client/tsconfig.json
node build.mjs
node --experimental-strip-types --no-warnings=ExperimentalWarning --test tests/*.test.ts
