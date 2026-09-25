#!/bin/bash
# Everything that must be green before a commit: typecheck the server, the client and the tests that
# drive the client, build, then all tests (unit tests plus the integration test against the bundle).
set -euo pipefail
P="$(cd "$(dirname "$0")/.." && pwd)"
. "$P/tools/env.sh"
cd "$P"
npx tsc -p tsconfig.json
npx tsc -p src/client/tsconfig.json
npx tsc -p tests/client/tsconfig.json
node build.mjs
# The network and disconnect tests measure the server against wall-clock bands (its tick gaps, its heartbeat),
# so they run after the rest, one at a time: run beside every other file building the world at once, a timer
# in the server fires late on a busy machine.
node --experimental-strip-types --no-warnings=ExperimentalWarning --test $(ls tests/*.test.ts | grep -v -E '/(net|disconnects)\.test\.ts$') tests/client/*.test.ts
node --experimental-strip-types --no-warnings=ExperimentalWarning --test --test-concurrency=1 tests/net.test.ts tests/disconnects.test.ts
