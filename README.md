<h1 align="center"><img src="docs/banner.jpg" alt="Oakridge Online"></h1>

A free, skill-based MMO that runs entirely in the browser. Everything you see — terrain, trees, buildings, characters — is built in code with no image or model files, and the world moves for everyone at once on a shared 600 ms tick. Click a tile to walk there, click a tree, rock, fishing spot or creature to work it or fight it, and talk to the people you meet.

**Play now:** https://oakridgeonline.emutastic.com

## What's in the game

- A growing world of walkable towns, roads, coastline and dungeons, streamed in as you explore
- Accounts with no passwords: sign up and log in with an authenticator app or an emailed code
- Fifteen skills from level 1 to 99: four combat skills, ranged, magic and prayer, three gathering skills and five processing skills
- Woodcutting, mining and fishing, each with eight tiers of tree, rock or fish
- Firemaking, cooking, smithing, crafting and fletching turn what you gather into food, metal gear, leather goods, jewellery, bows and arrows
- Melee, ranged and magic combat with stances, a combat triangle, prayers, and dozens of creatures to fight
- Four quests, from starter errands in Oakridge to a longer one that opens the Sallowfen, with branching dialogue and a quest journal
- Friends, private messages, an ignore list, following and player-to-player trading
- A full day/night cycle and changing weather, with music and sound that shift with the world around you

See the **[wiki](https://github.com/codingncaffeine/Oakridge_Online/wiki)** for a full guide to the world, skills, combat, quests, and what's planned next.

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
