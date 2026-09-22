# Sourced by the other tools: the portable Node here is the same version the server runs (22.13.0).
export PATH="$HOME/.cache/oakridge-node/node-v22.13.0-linux-x64/bin:$PATH"
# Temporary files (test servers' data, the check browser's profile) stay inside the project folder.
TMPDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scratch/tmp"
export TMPDIR
mkdir -p "$TMPDIR"
