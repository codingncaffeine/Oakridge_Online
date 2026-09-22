<h1 align="center"><img src="docs/banner.jpg" alt="Oakridge Online"></h1>

A free, skill-based MMO that runs in the browser. You click to move on a tile grid in a shared world that advances on a 600 ms game tick. The graphics are simple low-poly 3D, and every model is built in code.

**Play:** https://oakridgeonline.emutastic.com

**Status:** early development. On a test map you can make an account, design a character, walk and chat with other players, pick up, carry, wear and drop items, and train woodcutting, mining and fishing.

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
  - Clicking a tree, rock or fishing spot walks to a tile beside one of its sides (never a corner), where the character turns to face it.
- **Accounts.** Every login is a one-time code from an authenticator app or an email; no passwords are stored.
- **Items.** The server owns a 28-slot inventory, 11 equipment slots and the items lying on the ground. Something a player drops stays theirs alone for a minute before others can see it. Worn items show on the character.
- **Skills.** Woodcutting, mining and fishing level from 1 to 99 on a fixed XP curve, with XP kept in tenths.
  - Each skill action rolls on the tick: a tree every 4 ticks, a rock every 8, 7 or 6 ticks depending on the pickaxe, a net every 6. The chance rises with level (and, for woodcutting, with a better axe).
  - Trees fall on a timer that everyone chopping them shares, rocks run out after each ore, and fishing spots move every few minutes; all come back.
  - Other players see who is chopping, mining or fishing, and a level-up sets off fireworks everyone nearby sees.
- **Sound.** Web Audio plays the swing of an axe or pick, a net going in the water, a tree coming down and items being handled, on three channels with their own volumes: what you do, what happens around you (quieter with distance), and music. The level-up flourish is built from tones rather than recorded. `#sounds` on the site plays them all.
- **Music.** Background tracks play in the world in a shuffled order, one after another with a pause between and a fade at either end. They are streamed, not held in memory, and nothing is fetched while the music volume is at nothing.
- **Client** (`src/client`):
  - Three.js/WebGL.
  - Terrain, trees, rocks, fences, walls, characters and items are generated from code; there are no image or model files.
  - Characters have jointed hips, knees, waist, shoulders, elbows and a wrist. Walking is procedural; skill actions are keyframed poses, with a two-bone IK solve that puts the second hand on a tool's shaft. `#animations` on the site shows them all.
  - The interface is HTML over the 3D view, with stone and parchment textures painted in code at startup.
- **Build.** esbuild produces a hashed client bundle and a single-file server with no runtime dependencies.

## Development

Requires Node 22.13 or newer.

```sh
npm install
tools/dev.sh                   # build, then run locally at http://127.0.0.1:8600/
tools/check.sh                 # typecheck, build, unit and integration tests
tools/browser-check.sh [url]   # headless Firefox self-test: join, click-walk, chat, items, chopping, render stats
node tools/crowd.mjs <url> 12  # 12 simultaneous players must all share one world
tools/hud-shots.sh <dir>       # screenshots of the interface laid out with sample content
node tools/sounds.mjs          # rebuilds src/client/sounds from the sound pack in sounds/
PREVIEW=animations SHOTS_DIR=<dir> tools/browser-check.sh   # close-ups of every animation
```

Local checks keep their temporary files in `scratch/`, which git ignores.

`tools/deploy.sh` publishes to the live host and smoke-tests it; `tools/host-setup.sh` is the one-time app setup.
