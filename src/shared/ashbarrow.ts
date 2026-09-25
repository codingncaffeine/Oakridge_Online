// Ashbarrow Deep (PLAN §8.5, Wave 3): the stair Phase 7 built sealed at the top of the district's barrow
// is open, and under it one plane of crypt — the chamber at the stair's foot, the processional hall south
// with the dead laid along its sides, a niche of graves off either side, and at the hall's end the tomb of
// whatever the barrow was raised over, with its chest. "The warden's own" (§8.5): the barrow warden that
// keeps the mound's top has its equal below, in the tomb, with the barrow's skeletons and shamblers
// between (band 20–45, all the bestiary's own).
//
// Built last of all, on the barrow's region alone and on plane −1, rolling nothing — every stone,
// sarcophagus and creature stands at a written tile — so a world built without it is the same world
// everywhere else (tests/ashbarrow.test.ts holds that), and the stair's object keeps its id either way:
// the barrow places the open stair or the sealed slab in the same breath.
import { REGION, regionOf } from "./map.ts";
import type { Area } from "./oakridge.ts";
import { cut } from "./thornbury.ts";
import { boxOf, WorldBuilder, type Box } from "./worldgen.ts";
import { TUNE } from "./tunes.ts";

export const DEEP_PLANE = -1;
/** The stair on the mound's top, where the slab was. */
export const DEEP_STAIR = { x: 3171, y: 3169 };
/** The barrow's region, the crypt is cut into: everything else on it below ground is rock. */
export const DEEP_REGION: Box = boxOf(
  regionOf(DEEP_STAIR.x) * REGION, regionOf(DEEP_STAIR.y) * REGION,
  regionOf(DEEP_STAIR.x) * REGION + REGION - 1, regionOf(DEEP_STAIR.y) * REGION + REGION - 1,
);
/** The rooms: the chamber at the stair's foot, the hall south, a niche either side of it, and the tomb at its end. */
export const DEEP_ROOMS: readonly Box[] = [
  boxOf(3167, 3165, 3175, 3173),
  boxOf(3169, 3148, 3173, 3164),
  boxOf(3162, 3152, 3168, 3156),
  boxOf(3174, 3156, 3180, 3160),
  boxOf(3160, 3139, 3182, 3147),
];
export const DEEP_CHEST = { x: 3181, y: 3140 };
/** The dead along the hall's sides, the tomb's own, and the graves in the niches. */
const SARCOPHAGI: ReadonlyArray<readonly [number, number]> = [
  [3169, 3160], [3173, 3160], [3169, 3155], [3173, 3155], [3169, 3150], [3173, 3150], [3171, 3143], [3165, 3141], [3177, 3141],
];
const GRAVES: ReadonlyArray<readonly [number, number]> = [[3163, 3154], [3165, 3155], [3176, 3158], [3179, 3159]];
const FALLEN: ReadonlyArray<readonly [number, number]> = [[3174, 3171], [3161, 3146]];
/** Who keeps the crypt, each at a written tile: skeletons by the stair, shamblers down the hall, the warden's equal in the tomb. */
export const DEEP_DEAD: ReadonlyArray<readonly [string, number, number]> = [
  ["ruin_skeleton", 3168, 3171], ["ruin_skeleton", 3174, 3167], ["ruin_skeleton", 3170, 3162],
  ["grave_shambler", 3171, 3158], ["grave_shambler", 3171, 3152], ["ruin_skeleton", 3164, 3153], ["grave_shambler", 3177, 3157],
  ["barrow_warden", 3171, 3141], ["ruin_skeleton", 3163, 3143], ["ruin_skeleton", 3179, 3145],
];

export function buildAshbarrowDeep(b: WorldBuilder): void {
  b.clip = DEEP_REGION;
  const level = b.heightAtCorner(0, DEEP_STAIR.x, DEEP_STAIR.y) - 2 * 2.0;
  cut(b, DEEP_PLANE, DEEP_REGION, DEEP_ROOMS, level, () => true);
  // The way back up, on the stair's own tile.
  b.place(DEEP_PLANE, "stairs", DEEP_STAIR.x, DEEP_STAIR.y, { to: 0 });
  for (const [x, y] of SARCOPHAGI) b.place(DEEP_PLANE, "sarcophagus", x, y);
  for (const [x, y] of GRAVES) b.place(DEEP_PLANE, "grave", x, y);
  for (const [x, y] of FALLEN) b.place(DEEP_PLANE, "rock", x, y);
  b.place(DEEP_PLANE, "chest", DEEP_CHEST.x, DEEP_CHEST.y, { tag: "ashbarrow" });
  for (const [monster, x, y] of DEEP_DEAD) b.spawnMonster({ monster, x, y, plane: DEEP_PLANE });
}

/** Below the barrow it is the Deep, with the barrow's own hard tune. */
export const DEEP_AREA: Area = { key: "ashbarrowdeep", name: "Ashbarrow Deep", track: TUNE.danger };
