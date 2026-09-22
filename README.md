# Oakridge Online

A free, skill-based MMO that runs in the browser. You click to move on a tile grid in a shared world that advances on a 600 ms game tick. The graphics are simple low-poly 3D, and every model is built in code.

**Play:** https://oakridgeonline.emutastic.com

**Status:** early development. The world is a test map where you can walk around with other players.

## How it works

- **TypeScript on both ends.** `src/shared` holds the map, collision, pathfinding and the network protocol, and both the server and the browser use it.
- **Server** (`src/server`):
  - One Node.js process holds the world in memory and advances it every tick.
  - Clients send intents (for example, "walk to this tile"), and the server validates them and moves everyone.
  - Each player receives only what changed within 15 tiles of them.
  - Transport: JSON messages over a WebSocket at `/ws`.
- **Pathfinding.**
  - A breadth-first search over a 128×128 window that expands neighbours in a fixed order, so walks go straight first, then diagonal.
  - Clicking an unreachable tile walks to the nearest reachable tile.
- **Client** (`src/client`):
  - Three.js/WebGL.
  - Terrain, trees, rocks, fences, walls and characters are generated from code; there are no image or model files.
- **Build.** esbuild produces a hashed client bundle and a single-file server with no runtime dependencies.

## Development

Requires Node 22.13 or newer.

```sh
npm install
tools/dev.sh                   # build, then run locally at http://127.0.0.1:8600/
tools/check.sh                 # typecheck, build, unit and integration tests
tools/browser-check.sh [url]   # headless Firefox self-test: join, click-walk, render stats
node tools/crowd.mjs <url> 12  # 12 simultaneous players must all share one world
```

`tools/deploy.sh` publishes to the live host and smoke-tests it; `tools/host-setup.sh` is the one-time app setup.
